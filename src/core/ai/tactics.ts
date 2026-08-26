/**
 * IA táctica de respaldo.
 *
 * Es la que juega cuando no hay un agente conectado, y la que resuelve las
 * batallas automáticas del mapa. Deliberadamente simple y determinista: su
 * trabajo es que el juego sea jugable sin IA externa, no ser brillante.
 */
import {
  activeStack,
  applyAction,
  canReachMelee,
  enemiesOf,
  isEngaged,
  legalActionsAndCosts,
  splashTargets,
  stackById,
  stackHexes,
  stackSpeed,
} from '../battle/battle.js';
import { hexDistance, hexKey, type Paso } from '../battle/board.js';
import { CHANCE_PER_POINT, expectedDamage, stackHp } from '../battle/damage.js';
import { roundsLeftOf } from '../battle/effects.js';
import { effectOfSpell, type Spell, spell, spellAmount } from '../battle/spells.js';
import type { BattleAction, BattleHero, BattleStack, BattleState, Side } from '../battle/types.js';
import { creature, hasTrait, isShooter } from '../data.js';
import type { Rng } from '../rng.js';
import type { Hex } from '../types.js';

/** Cuánto "vale" destruir a este stack: daño que hace por lo que aguanta. */
function threat(s: BattleStack): number {
  const info = creature(s.creature);
  const damage = ((info.damage[0] + info.damage[1]) / 2) * s.count;
  const shooterBonus = isShooter(info) && s.shotsLeft > 0 ? 1.6 : 1;
  return damage * shooterBonus;
}

/** El objetivo más apetecible: mucha amenaza y poca vida restante. */
function bestTarget(candidates: BattleStack[]): BattleStack | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, s) =>
    threat(s) / Math.max(1, stackHp(s)) > threat(best) / Math.max(1, stackHp(best)) ? s : best,
  );
}

function distanceTo(from: Hex, target: BattleStack): number {
  return Math.min(...stackHexes(target).map((h) => hexDistance(from, h)));
}

/**
 * Cuánto tiene que rendir un hechizo, en PV equivalentes por punto de maná,
 * para que valga la pena lanzarlo.
 *
 * No es un número inventado: se calibra contra dos comportamientos observables.
 * Con 4, la Flecha mágica del héroe inicial (≈20 de daño por 3 de maná) se
 * dispara, y una Prisa sobre tres campesinos (≈1,5 de valor por 3 de maná) no.
 * Subirlo hace tacaña a la IA; bajarlo la deja gastando el maná en buffos que
 * no cambian nada.
 */
const VALOR_MINIMO_POR_MANA = 4;

/**
 * Lo que vale medio turno extra de una unidad, como fracción de su amenaza. Es
 * un proxy grueso para prisa y lentitud: lo que se gana no es el daño de la
 * unidad, es llegar antes.
 */
const FRACCION_TEMPO = 0.5;

/**
 * Lo que vale lanzar este hechizo sobre este objetivo, en PV equivalentes, para
 * poder comparar un buffo con un daño en la misma escala.
 */
function spellValue(caster: BattleHero, sp: Spell, objetivo: BattleStack): number {
  switch (sp.kind) {
    case 'damage':
      // El tope es la vida que queda: sin él, un Rayo sobre tres campesinos
      // puntuaba como si matara a cincuenta.
      return Math.min(spellAmount(sp, caster), stackHp(objetivo));
    case 'speed':
    case 'luck': {
      // Los dos temporales comparten la resta que manda `effects.ts`: el mismo
      // origen REFRESCA, no apila, así que relanzar sobre quien ya lo tiene solo
      // compra la DIFERENCIA de rondas. Sin esta cuenta la IA con Poder 3
      // relanzaba Lentitud cada ronda a precio completo por una ronda marginal,
      // y desde que el maná no se recupera al salir de la batalla llegaba al
      // mapa a cero. `effectOfSpell` es la misma función que el motor consulta
      // para saber qué colgaría, así que la duración no se recalcula aquí.
      const efecto = effectOfSpell(sp, caster);
      // Inalcanzable: `effectOfSpell` solo devuelve `null` fuera de estas dos
      // ramas. Vale 0 y no lanza porque esto es una heurística, no una regla.
      if (efecto === null) return 0;
      const compradas = Math.max(0, efecto.roundsLeft - roundsLeftOf(objetivo, efecto));
      if (compradas === 0) return 0;
      // La suerte se cuenta por rondas —un punto es `CHANCE_PER_POINT` de golpe
      // doble en cada una—, así que basta con contar las compradas. El tempo no
      // se cuenta por rondas: se escala por la fracción de duración comprada,
      // que con el objetivo limpio es 1 y deja intacto el primer lanzamiento,
      // que es el caso con el que se calibró `VALOR_MINIMO_POR_MANA`.
      return sp.kind === 'luck'
        ? compradas * Math.abs(sp.amount ?? 0) * threat(objetivo) * CHANCE_PER_POINT
        : FRACCION_TEMPO * threat(objetivo) * (compradas / efecto.roundsLeft);
    }
    case 'heal':
      // Sale ≈0 salvo con un stack tocado, y está bien: la Curación no se lanza
      // por lanzarla. No necesita caso especial para quedar fuera del umbral.
      return Math.min(spellAmount(sp, caster), creature(objetivo.creature).hp - objetivo.topHp);
  }
}

/**
 * El mejor lanzamiento de la lista de acciones legales, o `null` si ninguno
 * rinde lo bastante.
 *
 * Es una decisión INDEPENDIENTE y previa a la de combate, no una alternativa:
 * `cast` no consume el turno del stack (`battle.ts`, caso `'cast'`), así que
 * lanzar no compite con atacar — solo cuesta maná y la tirada de la ronda.
 * Modelarlo como disyuntiva haría que la IA dejara de pegar para lanzar.
 *
 * Reutiliza las acciones que ya trae el llamante: ni una llamada más a
 * `legalActions`, que es lo caro.
 */
function bestCast(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): BattleAction | null {
  const hero = state.heroes[s.side];
  if (hero === null) return null;

  let mejor: BattleAction | null = null;
  let mejorValor = 0;
  for (const a of acciones) {
    if (a.type !== 'cast' || a.target === undefined) continue;
    const sp = spell(a.spell);
    const valor = spellValue(hero, sp, stackById(state, a.target));
    if (valor < VALOR_MINIMO_POR_MANA * sp.cost) continue;
    if (valor > mejorValor) {
      mejorValor = valor;
      mejor = a;
    }
  }
  return mejor;
}

/** Un ataque que sale de moverse primero: `from` ya está, no es opcional. */
type CargaContra = Extract<BattleAction, { type: 'attack' }> & { from: Hex };

/**
 * Desde qué casilla golpear, cuando hay varias desde las que se alcanza al
 * mismo objetivo.
 *
 * Orden total de tres niveles, y los tres deciden algo:
 *
 * 1. **Máximo daño esperado.** Es lo único que distingue una casilla de otra:
 *    `computeDamage` no mira el hex más que por la carga. Escrito en daño y no
 *    en «cuantos más hexes mejor» a propósito — con el criterio en distancia,
 *    una unidad SIN `charge` se pondría a dar rodeos para no ganar nada.
 * 2. **Coste mínimo**, que es lo que queda cuando el daño empata: sin `charge`
 *    empatan todas.
 * 3. **El primero en el orden de enumeración**, que hoy es el que decide de
 *    verdad: 722 de 1194 decisiones con varias casillas empatan también a
 *    coste mínimo. Sale solo de comparar con `>` y `<` estrictos.
 *
 * El coste se LEE; no se deduce de que `cargas[0]` sea la casilla más barata.
 * Hoy lo es en 1698 de 1698 casos porque `reachable` es un BFS y la lista legal
 * conserva su orden, pero eso es un accidente del recorrido y no un contrato:
 * el día que el BFS cambie de forma, esto elige lo mismo.
 *
 * **Y se lee del recorrido que ya se hizo**, el de `legalActionsAndCosts`, en
 * vez de lanzar uno nuevo. Cuando esto pedía su propio `movableFrom`, ese
 * segundo recorrido lo pagaban las 1258 de 1258 decisiones SIN `charge`
 * —+17,6 % en 300 batallas— para responder a una pregunta que solo tiene
 * sentido con el rasgo puesto.
 */
function mejorCarga(
  state: BattleState,
  s: BattleStack,
  objetivo: BattleStack,
  cargas: readonly CargaContra[],
  costes: ReadonlyMap<string, Paso>,
): BattleAction {
  const miHeroe = state.heroes[s.side];
  const suHeroe = state.heroes[objetivo.side];
  // Sin el rasgo, `expectedDamage` da lo MISMO desde cualquier casilla: la
  // fórmula no mira el hex más que por la carga. No es una optimización, es lo
  // que significa — evaluarla casilla a casilla sería preguntar seis veces algo
  // cuya respuesta no depende de la pregunta. Con el daño empatado decide el
  // desempate, que es lo que decide hoy el 100 % de los casos.
  const cobraCarga = hasTrait(creature(s.creature), 'charge');

  let mejor = cargas[0] as CargaContra;
  let mejorDano = -1;
  let mejorCoste = Number.POSITIVE_INFINITY;
  for (const a of cargas) {
    const paso = costes.get(hexKey(a.from));
    // Inalcanzable salvo que la lista legal y su propio mapa discrepen: los
    // `from` salen de las claves de ese mapa. Si algún día discrepan, se dice;
    // no se elige una casilla a ciegas.
    if (paso === undefined) {
      throw new Error(`${s.id} no alcanza (${a.from.col},${a.from.row}): la lista legal miente`);
    }
    const coste = paso.steps;
    const dano = cobraCarga
      ? expectedDamage(s, miHeroe, objetivo, suHeroe, { chargeHexes: coste })
      : 0;
    if (dano > mejorDano || (dano === mejorDano && coste < mejorCoste)) {
      mejor = a;
      mejorDano = dano;
      mejorCoste = coste;
    }
  }
  return mejor;
}

/**
 * ¿Conviene ceder la iniciativa en vez de dar el paso adelante?
 *
 * Sí cuando hay un enemigo que **todavía no ha actuado** y cuyo alcance cubre
 * mi casilla actual o aquella a la que iba a avanzar: si avanzo, meto el morro
 * en su radio y me pega él primero; si espero, actúo al final de la ronda,
 * cuando ya se ha comprometido, y le pego yo.
 *
 * Los requisitos decían «típicamente con tiradores y unidades lentas», copiando
 * al original, y medido es al revés: ceder la iniciativa solo compra algo a
 * quien tiene enemigos PENDIENTES detrás en la cola —o sea al rápido—, porque
 * `wait` empuja el stack al final de `state.queue` y `advance` saca por
 * `shift`. El más lento no tiene a quién cederle nada.
 *
 * El alcance se aproxima con `hexDistance` y `stackSpeed(e) + 1` —los pasos que
 * da más el hex desde el que golpea— en vez de un BFS por enemigo: en línea
 * recta se llega antes que rodeando, así que casi siempre sobreestima y la IA
 * espera de más, nunca de menos, sin costar un recorrido de tablero.
 *
 * «Casi siempre» y no «siempre», que la diferencia la encontró QA: se mide
 * desde la CABEZA del enemigo, mientras que el `distanceTo` de aquí al lado
 * mide contra todos sus hexes. Para una unidad de dos casillas la cabeza puede
 * quedar un hex más lejos que su celda más cercana, y ahí la cuenta subestima:
 * la IA se acerca a un dragón óseo creyéndose fuera de su alcance. Afecta a una
 * criatura de las veintiuna —es la única con `hexes: 2`— y el `+1` lo tapa casi
 * siempre. Queda escrito y no arreglado a propósito: arreglarlo mueve partidas,
 * y esto es una heurística, no una regla.
 *
 * De las tres reglas que se midieron es la del medio, y la única cuyo intervalo
 * de confianza entero queda por encima del 50 %. Mirar solo mi hex actual apenas
 * se dispara (1,2 % de las decisiones) y no se distingue de cero; esperar en
 * cuanto haya cualquier enemigo pendiente (24 %) es la tautología por el otro
 * lado y juega peor.
 */
function convieneEsperar(s: BattleStack, enemigos: readonly BattleStack[], destino: Hex): boolean {
  if (s.waited) return false;
  return enemigos.some((e) => {
    if (e.acted) return false;
    const alcance = stackSpeed(e) + 1;
    return hexDistance(e.hex, s.hex) <= alcance || hexDistance(e.hex, destino) <= alcance;
  });
}

/**
 * Elige la acción del stack activo:
 * dispara si puede, remata lo que alcanza, si no se acerca al objetivo más
 * jugoso —o cede la iniciativa antes de meterse en el alcance de quien aún no
 * ha movido—, y si no puede hacer nada útil se defiende.
 */
export function chooseBattleAction(state: BattleState): BattleAction {
  return chooseBattleActionAndCosts(state).action;
}

/**
 * Lo mismo, y además **de qué stack** es la decisión y el recorrido con el que
 * se tomó. Es el mismo par que `legalActions`/`legalActionsAndCosts`, un piso
 * más arriba.
 *
 * Existe porque ese recorrido ya está hecho y `moveTo` lo repetía: era el
 * TERCER BFS del mismo turno del mismo stack —`legalActions` el primero,
 * `mejorCarga` lo lee del primero, y `moveTo` el segundo—, 970 de las 3 170
 * llamadas al BFS del tablero de 300 batallas.
 *
 * El `stack` viaja al lado de los costes y no se supone: `applyAction` no puede
 * comprobar que un mapa de costes sea del stack que actúa mirando sus claves
 * —las de otro stack cercano se le parecen—, así que se le dice quién lo
 * calculó y él lo compara con quien está activo.
 */
export function chooseBattleActionAndCosts(state: BattleState): {
  action: BattleAction;
  stack: string;
  costs: Map<string, Paso>;
} {
  const s = activeStack(state);
  if (s === null) throw new Error('no hay stack activo');

  const { actions, costs } = legalActionsAndCosts(state);
  return { action: decideAccion(state, s, actions, costs), stack: s.id, costs };
}

function decideAccion(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
  costes: ReadonlyMap<string, Paso>,
): BattleAction {
  const enemigos = enemiesOf(state, s);
  if (enemigos.length === 0) return { type: 'defend' };

  // El hechizo va primero porque no gasta el turno: si se lanza, se volverá a
  // pedir acción para este mismo stack y entonces peleará. En esa segunda
  // vuelta `castThisRound` ya está puesto y `legalActions` no ofrece ni un
  // `cast`, así que esto no puede dar vueltas.
  const conjuro = bestCast(state, s, acciones);
  if (conjuro !== null) return conjuro;

  // Un tirador con línea libre dispara al mejor objetivo.
  if (isShooter(creature(s.creature)) && s.shotsLeft > 0 && !isEngaged(state, s)) {
    // El liche salpica todo lo pegado al objetivo, aliados incluidos. Eso es
    // legal —y `legalActions` lo sigue ofreciendo, porque filtrarlo sería
    // mentirle al agente—, pero suicida: aquí se elige con cabeza.
    let candidatos = enemigos;
    if (hasTrait(creature(s.creature), 'splash_shot')) {
      // A quién alcanza la salpicadura lo dice el motor, no una copia de la
      // regla aquí: si mañana cambia el radio, la IA no se queda jugando con la
      // forma vieja. El propio tirador cuenta como salpicado — hoy no puede
      // estarlo, porque con un enemigo encima `isEngaged` no le deja disparar.
      const aliadosSalpicados = (objetivo: BattleStack): number =>
        splashTargets(state, objetivo).filter((o) => o.side === s.side).length;

      // Se puntúa una vez por enemigo y se elige el mínimo: sin esto la cuenta
      // se rehacía dentro de un `reduce` y de dos `filter`. Sin `rng`: esto no
      // se sortea. Y `enemigos` nunca viene vacío, que ya se ha comprobado.
      const coste = enemigos.map((e) => ({ enemigo: e, aliados: aliadosSalpicados(e) }));
      const minimo = Math.min(...coste.map((c) => c.aliados));
      candidatos = coste.filter((c) => c.aliados === minimo).map((c) => c.enemigo);
    }

    const objetivo = bestTarget(candidatos);
    if (objetivo !== null) {
      const disparo = acciones.find((a) => a.type === 'shoot' && a.target === objetivo.id);
      if (disparo !== undefined) return disparo;
    }
  }

  // Golpear a quien ya se alcanza, priorizando el objetivo más valioso.
  const alcanzables = enemigos.filter((e) => canReachMelee(s, e));
  const cercano = bestTarget(alcanzables);
  if (cercano !== null) {
    const ataque = acciones.find(
      (a) => a.type === 'attack' && a.target === cercano.id && a.from === undefined,
    );
    if (ataque !== undefined) return ataque;
  }

  // Acercarse y golpear en el mismo turno, si llega.
  const objetivo = bestTarget(enemigos);
  if (objetivo !== null) {
    const cargas = acciones.filter(
      (a): a is CargaContra =>
        a.type === 'attack' && a.target === objetivo.id && a.from !== undefined,
    );
    if (cargas.length > 0) return mejorCarga(state, s, objetivo, cargas, costes);

    // Si no llega, avanzar lo máximo posible hacia él. Los hexes ya están en
    // la mano: los `move` de `acciones` SON `movableHexes(state, s)`, en
    // contenido y en orden, porque `legalActions` los saca de esa misma
    // llamada y los empuja tal cual. Relanzar el BFS aquí era el 20,6 % de los
    // recorridos de tablero de una batalla —1461 de 7090— y un 11 % del banco:
    // #48 izó el BFS DENTRO de `legalActions` y dejó al gemelo un piso arriba.
    const movimientos = acciones.filter((a) => a.type === 'move').map((a) => a.to);
    if (movimientos.length > 0) {
      const mejor = movimientos.reduce((a, b) =>
        distanceTo(b, objetivo) < distanceTo(a, objetivo) ? b : a,
      );
      if (distanceTo(mejor, objetivo) < distanceTo(s.hex, objetivo)) {
        // El paso adelante es lo último que se decide, porque es justo el que
        // puede salir caro: si al darlo quedo dentro del alcance de alguien que
        // aún no ha movido, sale más a cuenta esperar y pegarle yo.
        if (convieneEsperar(s, enemigos, mejor)) return { type: 'wait' };
        return { type: 'move', to: mejor };
      }
    }
  }

  // Aquí el stack no alcanza a nadie ni puede acercarse. Esperar no compra
  // nada —quien no puede llegarme hoy tampoco llegará al final de la ronda—, y
  // el +20 % de defensa sí. `defend` es la única cola terminal: el `wait` que
  // había aquí era una tautología defensiva que además no se alcanzaba nunca,
  // 0 de 10 440 decisiones.
  return { type: 'defend' };
}

export interface BattleOutcome {
  readonly winner: Side;
  readonly state: BattleState;
  readonly rounds: number;
}

/** Juega la batalla entera con la IA táctica en ambos bandos. */
export function autoResolve(state: BattleState, rng: Rng, maxTurnos = 5000): BattleOutcome {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    // El recorrido con el que se decidió viaja hasta el motor: `moveTo` lo
    // repetía entero para cobrar la carga.
    const { action, stack, costs } = chooseBattleActionAndCosts(state);
    applyAction(state, action, rng, { stack, costs });
    n++;
  }
  if (state.finished === null) {
    // Empate por agotamiento: gana quien conserve más vida. No se deja colgada.
    const vida = (side: Side): number =>
      state.stacks.filter((s) => s.side === side).reduce((t, s) => t + stackHp(s), 0);
    const winner: Side = vida('attacker') >= vida('defender') ? 'attacker' : 'defender';
    state.finished = { winner };
    state.log.push({ kind: 'finished', winner });
  }
  return { winner: state.finished.winner, state, rounds: state.round };
}
