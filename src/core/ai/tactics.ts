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
  stackHexes,
} from '../battle/battle.js';
import { hexDistance } from '../battle/board.js';
import { stackHp } from '../battle/damage.js';
import type { BattleAction, BattleStack, BattleState, Side } from '../battle/types.js';
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
    const ataque = acciones.find((a) => a.type === 'attack' && a.target === cercano.id && a.from === undefined);
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
