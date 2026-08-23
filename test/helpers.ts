import {
  activeStack,
  applyAction,
  blockedHexes,
  enemiesOf,
  legalActions,
  stackHexes,
} from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import type { Rng } from '../src/core/rng.js';

/**
 * Política agresiva para tests: dispara, si no golpea, si no se acerca todo lo
 * que puede, y si no se defiende. Basta para que cualquier batalla converja.
 */
export function agresiva(state: BattleState): BattleAction {
  const acciones = legalActions(state);
  const s = activeStack(state);
  if (s === null) throw new Error('sin stack activo');

  const disparo = acciones.find((a) => a.type === 'shoot');
  if (disparo !== undefined) return disparo;

  const ataque = acciones.find((a) => a.type === 'attack');
  if (ataque !== undefined) return ataque;

  const enemigos = enemiesOf(state, s);
  const movimientos = acciones.filter((a): a is Extract<BattleAction, { type: 'move' }> => a.type === 'move');
  if (movimientos.length > 0 && enemigos.length > 0) {
    const distancia = (h: { col: number; row: number }): number =>
      Math.min(...enemigos.flatMap((e) => stackHexes(e).map((eh) => hexDistance(h, eh))));
    return movimientos.reduce((mejor, m) => (distancia(m.to) < distancia(mejor.to) ? m : mejor));
  }

  return acciones.find((a) => a.type === 'defend') ?? acciones[0]!;
}

/** Juega la batalla hasta el final (o hasta `maxTurnos`). Devuelve los turnos usados. */
export function simular(state: BattleState, rng: Rng, maxTurnos = 3000): number {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    applyAction(state, agresiva(state), rng);
    n++;
  }
  return n;
}

/** Juega hasta que el stack activo sea `id` (o se agoten los turnos). */
export function avanzarHasta(state: BattleState, rng: Rng, id: string, maxTurnos = 200): boolean {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    if (state.activeId === id) return true;
    applyAction(state, agresiva(state), rng);
    n++;
  }
  return state.activeId === id;
}

export { blockedHexes };
