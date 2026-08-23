/**
 * Juega un turno entero de un jugador con la IA de respaldo: construye,
 * recluta, mueve a sus héroes y resuelve las batallas que provoque.
 */
import {
  applyAdventureAction,
  currentPlayer,
  heroesOf,
  resolvePendingBattle,
  type GameContext,
  type GameState,
} from '../state/game.js';
import {
  chooseHeroDestination,
  planBuildings,
  planHires,
  planRecruits,
  stepTowards,
} from './strategy.js';

/** Tope de movimientos por turno: una red contra un bucle de objetivos. */
const MAX_MOVIMIENTOS_POR_TURNO = 60;

export function playAiTurn(state: GameState, ctx: GameContext): void {
  if (state.finished !== null) return;
  const player = currentPlayer(state);

  // Contratar antes que nada: un héroe nuevo puede reclutar hoy mismo.
  for (const accion of planHires(state, player.id)) {
    applyAdventureAction(state, accion, ctx);
  }
  // Construir después: cambia lo que hay disponible para reclutar.
  for (const accion of planBuildings(state, player.id)) {
    applyAdventureAction(state, accion, ctx);
  }
  for (const accion of planRecruits(state, player.id)) {
    applyAdventureAction(state, accion, ctx);
  }

  let movimientos = 0;
  while (movimientos < MAX_MOVIMIENTOS_POR_TURNO && state.finished === null) {
    let seMovio = false;

    // Copia: un héroe puede morir en batalla a mitad de la iteración.
    for (const hero of [...heroesOf(state, player.id)]) {
      if (state.finished !== null) break;
      if (!state.heroes.includes(hero)) continue;

      const destino = chooseHeroDestination(state, hero);
      if (destino === null) continue;

      // El objetivo puede estar a varios días: se avanza lo que dé el día.
      const paso = stepTowards(state, hero, destino);
      if (paso === null) continue;

      applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: paso }, ctx);
      if (state.pendingBattle !== null) resolvePendingBattle(state, ctx);
      seMovio = true;
      movimientos++;
    }

    if (!seMovio) break;
  }

  if (state.finished === null) applyAdventureAction(state, { type: 'end_turn' }, ctx);
}

/** Juega la partida entera con la IA en todos los bandos. Devuelve los días. */
export function playAiGame(state: GameState, ctx: GameContext, maxDias = 200): number {
  while (state.finished === null && state.day <= maxDias) {
    playAiTurn(state, ctx);
  }
  return state.day;
}
