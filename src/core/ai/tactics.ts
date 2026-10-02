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
  blockedHexes,
  canReachMelee,
  cargaDesde,
  enemiesOf,
  isEngaged,
  legalActionsAndCosts,
  MAX_JUGADAS,
  type Movibles,
  splashTargets,
  stackById,
  stackHexes,
  stackSpeed,
  sumaDelBando,
} from '../battle/battle.js';
import { hexDistance, hexKey, type Paso } from '../battle/board.js';
import { CHANCE_PER_POINT, cargaEfectiva, stackHp } from '../battle/damage.js';
import { roundsLeftOf } from '../battle/effects.js';
import { effectOfSpell, type Spell, spell, spellAmount } from '../battle/spells.js';
import type { BattleAction, BattleHero, BattleStack, BattleState, Side } from '../battle/types.js';
import { otroBando } from '../battle/types.js';
import { hasTrait, isShooter } from '../data.js';
import type { Rng } from '../rng.js';
import type { Hex } from '../types.js';

/** Lo que pega un stack por sí solo, con el extra del tirador que aún dispara. */
function amenazaPropia(s: BattleStack): number {
  const info = s.unit;
  const damage = ((info.damage[0] + info.damage[1]) / 2) * s.count;
  const shooterBonus = isShooter(info) && s.shotsLeft > 0 ? 1.6 : 1;
  return damage * shooterBonus;
}

/**
 * Cuánto "vale" destruir a este stack: daño que hace por lo que aguanta.
 *
 * El héroe (`origen: heroe`) vale **lo que su bando entero**, no lo que pega su
 * cuerpo: matarlo gana la batalla, así que quitarlo de en medio quita de golpe
 * todo lo que pegan los suyos. Con su amenaza propia —la de un individuo con
 * 2-4 de daño— la IA lo trataba como al último campesino.
 *
 * Es para ELEGIR A QUIÉN PEGAR. Lo que vale un buffo o una maldición sobre él
 * (`spellValue`) sigue siendo lo que pega su cuerpo: una Prisa al héroe le
 * compra tempo a él, no a su bando, y el plan pedía no tocar `spellValue`.
 */
function threat(state: BattleState, s: BattleStack): number {
  switch (s.origen.kind) {
    case 'heroe':
      return sumaDelBando(state, s.side, amenazaPropia);
    case 'catalogo':
    case 'personaje':
      return amenazaPropia(s);
  }
}

/** El objetivo más apetecible: mucha amenaza y poca vida restante. */
function bestTarget(state: BattleState, candidates: BattleStack[]): BattleStack | null {
  if (candidates.length === 0) return null;
  const valor = (s: BattleStack): number => threat(state, s) / Math.max(1, stackHp(s));
  return candidates.reduce((best, s) => (valor(s) > valor(best) ? s : best));
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
        ? compradas * Math.abs(sp.amount ?? 0) * amenazaPropia(objetivo) * CHANCE_PER_POINT
        : FRACCION_TEMPO * amenazaPropia(objetivo) * (compradas / efecto.roundsLeft);
    }
    case 'heal':
      // Sale ≈0 salvo con un stack tocado, y está bien: la Curación no se lanza
      // por lanzarla. No necesita caso especial para quedar fuera del umbral.
      return Math.min(spellAmount(sp, caster), objetivo.unit.hp - objetivo.topHp);
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
 * 1. **Máxima carga cobrada.** Es lo único que distingue una casilla de otra:
 *    `computeDamage` no mira el hex más que por la carga, y el daño crece
 *    estrictamente con ella —multiplica por `1 + carga × 10 %`—, así que
 *    ordenar por la carga cobrada es ordenar por daño esperado sin calcularlo.
 *    La dicen `cargaDesde` y `cargaEfectiva`, las mismas que la cobran: en
 *    línea recta, a 3 casillas o más, con el objetivo en la recta y con el
 *    tope de 5 (02-10-2026). Sin el rasgo, `cargaDesde` da 0 en todas y no se
 *    calcula nada más.
 * 2. **Coste mínimo**, que es lo que queda cuando la carga empata: sin `charge`
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
 * —+17,6 % en 300 batallas—. Las casillas ocupadas, que hacen falta para
 * medir la recta, se piden una vez por decisión y no una por casilla.
 */
function mejorCarga(
  state: BattleState,
  s: BattleStack,
  objetivo: BattleStack,
  cargas: readonly CargaContra[],
  costes: ReadonlyMap<string, Paso>,
): BattleAction {
  // Las ocupadas no cambian de una casilla candidata a otra: se piden una vez.
  const bloqueadas = blockedHexes(state, s.id);

  let mejor = cargas[0] as CargaContra;
  let cargaMejor = -1;
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
    const carga = cargaEfectiva(cargaDesde(state, s, a.from, objetivo, bloqueadas));
    if (carga > cargaMejor || (carga === cargaMejor && coste < mejorCoste)) {
      mejor = a;
      cargaMejor = carga;
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
 * Lo que pesa un bando en la batalla: Σ amenaza × PV de lo que tiene en pie.
 *
 * El producto y no la suma, porque es lo que decide un desgaste: un bando que
 * pega el doble y aguanta el doble vale cuatro veces más, no dos. Cuenta al
 * héroe por lo que pega su cuerpo —aquí no se elige a quién pegar, se mide—.
 */
function pesoDelBando(state: BattleState, side: Side): number {
  return sumaDelBando(state, side, (o) => amenazaPropia(o) * stackHp(o));
}

/**
 * Por debajo de esta fracción del peso rival, la IA da la batalla por perdida.
 * Un número redondo y declarado, no calibrado: la regla tenía que ser sencilla
 * (plan de la fase 1b) y el precio de rendirse lo pone el usuario.
 */
const RENDIRSE_POR_DEBAJO_DE = 1 / 3;

/**
 * ¿Rendirse? Sí cuando se ofrece —hay base, no se la defiende y llega el
 * oro—, cuando queda tropa propia viva que salvar —rendirse solo con el héroe
 * es pagar por nada: vuelve igual si cae— y cuando el bando pesa menos de un
 * tercio que el rival.
 */
function convieneRendirse(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
): boolean {
  if (!acciones.some((a) => a.type === 'surrender')) return false;
  const tropaQueSalvar = state.stacks.some(
    (o) => o.side === s.side && o.count > 0 && o.origen.kind !== 'heroe',
  );
  if (!tropaQueSalvar) return false;
  const rival = otroBando(s.side);
  return pesoDelBando(state, s.side) < pesoDelBando(state, rival) * RENDIRSE_POR_DEBAJO_DE;
}

/**
 * Ningún bando vetado: la IA juega para sí misma en los dos, que es lo que hace
 * el banco y lo que hacían todos los llamantes antes de existir el veto.
 */
const NINGUNO: ReadonlySet<Side> = new Set();

/**
 * Elige la acción del stack activo:
 * dispara si puede, remata lo que alcanza, si no se acerca al objetivo más
 * jugoso —o cede la iniciativa antes de meterse en el alcance de quien aún no
 * ha movido—, y si no puede hacer nada útil se defiende.
 */
export function chooseBattleAction(
  state: BattleState,
  noSeRinden: ReadonlySet<Side> = NINGUNO,
): BattleAction {
  return chooseBattleActionAndCosts(state, noSeRinden).action;
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
 * De qué turno es viaja al lado de los costes y no se supone: `applyAction` no
 * puede comprobar que un mapa de costes sea de ahora mirando sus claves —las de
 * otro stack cercano, o las del mismo antes de su último tramo, se le parecen—,
 * así que se le dice cuándo se calculó (`Movibles`) y él lo compara.
 */
export function chooseBattleActionAndCosts(
  state: BattleState,
  noSeRinden: ReadonlySet<Side> = NINGUNO,
): { action: BattleAction; movibles: Movibles } {
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null) throw new Error('no hay stack activo');

  const { actions, costs } = legalActionsAndCosts(state);
  return {
    action: decideAccion(state, s, actions, costs, noSeRinden),
    movibles: { n: turno.n, gastado: turno.gastado, costs },
  };
}

function decideAccion(
  state: BattleState,
  s: BattleStack,
  acciones: readonly BattleAction[],
  costes: ReadonlyMap<string, Paso>,
  noSeRinden: ReadonlySet<Side>,
): BattleAction {
  // Tras un tramo se vuelve a decidir con lo que queda, en vez de cerrar el
  // turno sin mirar: si el paso adelante ha dejado a alguien al alcance, se le
  // pega. Medido con `enfrentamiento.ts` contra la IA que cerraba siempre: 51,08 %
  // ± 0,25 en 5 000 parejas. Lo que tras moverse no es legal —disparar, esperar,
  // defender— no sale de aquí porque se elige de la lista legal, que ya no lo
  // trae: aquí no se vuelve a escribir qué se puede hacer tras un tramo.
  const enemigos = enemiesOf(state, s);
  if (enemigos.length === 0) return colaTerminal(acciones);

  // Rendirse va antes que todo, incluido el hechizo: si la batalla está
  // perdida, gastar maná en ella es tirarlo. Pero solo por un bando que sea
  // SUYO: rendirse cuesta oro, y la IA que resuelve la defensa de una persona o
  // del agente no puede gastárselo por ellos (H-1 de la fase 1b: le cobraba el
  // oro a la persona sin preguntarle ni decírselo). Pelear por otro, sí: eso es
  // lo que ha hecho siempre.
  if (!noSeRinden.has(s.side) && convieneRendirse(state, s, acciones)) {
    return { type: 'surrender' };
  }

  // El hechizo va primero porque no gasta el turno: si se lanza, se volverá a
  // pedir acción para este mismo stack y entonces peleará. En esa segunda
  // vuelta `castThisRound` ya está puesto y `legalActions` no ofrece ni un
  // `cast`, así que esto no puede dar vueltas.
  const conjuro = bestCast(state, s, acciones);
  if (conjuro !== null) return conjuro;

  // Un tirador con línea libre dispara al mejor objetivo.
  if (isShooter(s.unit) && s.shotsLeft > 0 && !isEngaged(state, s)) {
    // El liche salpica todo lo pegado al objetivo, aliados incluidos. Eso es
    // legal —y `legalActions` lo sigue ofreciendo, porque filtrarlo sería
    // mentirle al agente—, pero suicida: aquí se elige con cabeza.
    let candidatos = enemigos;
    if (hasTrait(s.unit, 'splash_shot')) {
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

    const objetivo = bestTarget(state, candidatos);
    if (objetivo !== null) {
      const disparo = acciones.find((a) => a.type === 'shoot' && a.target === objetivo.id);
      if (disparo !== undefined) return disparo;
    }
  }

  // Golpear a quien ya se alcanza, priorizando el objetivo más valioso.
  const alcanzables = enemigos.filter((e) => canReachMelee(s, e));
  const cercano = bestTarget(state, alcanzables);
  if (cercano !== null) {
    const ataque = acciones.find(
      (a) => a.type === 'attack' && a.target === cercano.id && a.from === undefined,
    );
    if (ataque !== undefined) return ataque;
  }

  // Acercarse y golpear en el mismo turno, si llega.
  const objetivo = bestTarget(state, enemigos);
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
      // Cada distancia una sola vez: el `reduce` recalculaba la del mejor en
      // cada comparación. Gana la PRIMERA de las más cercanas, como antes.
      let mejor = movimientos[0] as Hex;
      let distanciaMejor = distanceTo(mejor, objetivo);
      for (const m of movimientos) {
        const d = distanceTo(m, objetivo);
        if (d < distanciaMejor) {
          mejor = m;
          distanciaMejor = d;
        }
      }
      if (distanciaMejor < distanceTo(s.hex, objetivo)) {
        // El paso adelante es lo último que se decide, porque es justo el que
        // puede salir caro: si al darlo quedo dentro del alcance de alguien que
        // aún no ha movido, sale más a cuenta esperar y pegarle yo.
        if (acciones.some((a) => a.type === 'wait') && convieneEsperar(s, enemigos, mejor)) {
          return { type: 'wait' };
        }
        return { type: 'move', to: mejor };
      }
    }
  }

  // Aquí el stack no alcanza a nadie ni puede acercarse. Esperar no compra
  // nada —quien no puede llegarme hoy tampoco llegará al final de la ronda—, y
  // el +20 % de defensa sí. `defend` es la única cola terminal: el `wait` que
  // había aquí era una tautología defensiva que además no se alcanzaba nunca,
  // 0 de 10 440 decisiones.
  return colaTerminal(acciones);
}

/**
 * Lo que se hace cuando no hay nada mejor: defenderse si la lista lo trae y, si
 * no —tras un tramo ya no—, cerrar el turno. `end_turn` va siempre en la lista.
 */
function colaTerminal(acciones: readonly BattleAction[]): BattleAction {
  const cola =
    acciones.find((a) => a.type === 'defend') ?? acciones.find((a) => a.type === 'end_turn');
  if (cola === undefined) throw new Error('la lista legal no trae ni "defend" ni "end_turn"');
  return cola;
}

export interface BattleOutcome {
  readonly winner: Side;
  readonly state: BattleState;
  readonly rounds: number;
}

/**
 * Juega la batalla entera con la IA táctica en ambos bandos. Por los de
 * `noSeRinden` pelea igual, pero no se rinde: son de alguien que no es ella.
 */
export function autoResolve(
  state: BattleState,
  rng: Rng,
  noSeRinden: ReadonlySet<Side> = NINGUNO,
  maxTurnos = MAX_JUGADAS,
): BattleOutcome {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    // El recorrido con el que se decidió viaja hasta el motor: `moveTo` lo
    // repetía entero para cobrar la carga.
    const { action, movibles } = chooseBattleActionAndCosts(state, noSeRinden);
    applyAction(state, action, rng, movibles);
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
