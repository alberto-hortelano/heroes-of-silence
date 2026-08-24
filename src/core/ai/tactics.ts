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
  legalActions,
  movableHexes,
  splashTargets,
  stackById,
  stackHexes,
} from '../battle/battle.js';
import { hexDistance } from '../battle/board.js';
import { CHANCE_PER_POINT, stackHp } from '../battle/damage.js';
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

/**
 * Elige la acción del stack activo:
 * dispara si puede, remata lo que alcanza, si no se acerca al objetivo más
 * jugoso, y si no puede hacer nada útil se defiende.
 */
export function chooseBattleAction(state: BattleState): BattleAction {
  const s = activeStack(state);
  if (s === null) throw new Error('no hay stack activo');

  const acciones = legalActions(state);
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
      (a): a is Extract<BattleAction, { type: 'attack' }> =>
        a.type === 'attack' && a.target === objetivo.id && a.from !== undefined,
    );
    if (cargas.length > 0) return cargas[0]!;

    // Si no llega, avanzar lo máximo posible hacia él.
    const movimientos = movableHexes(state, s);
    if (movimientos.length > 0) {
      const mejor = movimientos.reduce((a, b) =>
        distanceTo(b, objetivo) < distanceTo(a, objetivo) ? b : a,
      );
      if (distanceTo(mejor, objetivo) < distanceTo(s.hex, objetivo)) {
        return { type: 'move', to: mejor };
      }
    }
  }

  // Aquí el stack no alcanza a nadie ni puede acercarse. Esperar es mejor que
  // defenderse: cede el turno al final de la ronda por si el enemigo cierra la
  // distancia, y entonces sí habrá a quién pegar. No estanca, porque `waited`
  // se resetea en cada `beginRound` y en la segunda mitad de la ronda ya no
  // queda `wait` legal que elegir — que es la misma condición que se lee aquí,
  // en vez de buscarla en una lista de cientos de entradas.
  if (!s.waited) return { type: 'wait' };

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
    applyAction(state, chooseBattleAction(state), rng);
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
