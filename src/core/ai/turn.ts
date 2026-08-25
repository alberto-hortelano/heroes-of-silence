/**
 * Juega un turno entero de un jugador con la IA de respaldo: construye,
 * recluta, mueve a sus héroes y resuelve las batallas que provoque.
 */
import { reachableFrom } from '../map/map.js';
import { ROAD_COST } from '../map/terrain.js';
import {
  applyAdventureAction,
  currentPlayer,
  type GameContext,
  type GameState,
  heroesOf,
  resolvePendingBattle,
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

/**
 * Quien conduce la partida puede quedarse la batalla que acaba de nacer.
 *
 * Existe porque el turno de la IA era una llamada atómica: cuando el rival
 * atacaba al agente, `resolvePendingBattle` cerraba la batalla aquí dentro y el
 * director no llegaba a enterarse de que la había habido. El agente decidía
 * solo en las batallas que él abría, o sea en la mitad.
 *
 * El contrato es **«si te la quedas, la cierras»**: no devuelve un booleano que
 * pueda mentir, se mira `state.pendingBattle` al volver. Una toma a medias cae
 * sola en el respaldo de siempre. Y es un tipo, no un `import`: `core` sigue sin
 * saber que existe un servidor.
 */
export type BattleTakeover = (state: GameState, ctx: GameContext) => Promise<void>;

export async function playAiTurn(
  state: GameState,
  ctx: GameContext,
  takeover?: BattleTakeover,
): Promise<void> {
  if (state.finished !== null) return;
  const player = currentPlayer(state);

  // Contratar antes que nada: un héroe nuevo puede reclutar hoy mismo.
  for (const accion of planHires(state, player.id)) {
    applyAdventureAction(state, accion, ctx, player.id);
  }
  // Construir después: cambia lo que hay disponible para reclutar.
  for (const accion of planBuildings(state, player.id)) {
    applyAdventureAction(state, accion, ctx, player.id);
  }
  for (const accion of planRecruits(state, player.id)) {
    applyAdventureAction(state, accion, ctx, player.id);
  }

  let movimientos = 0;
  while (movimientos < MAX_MOVIMIENTOS_POR_TURNO && state.finished === null) {
    let seMovio = false;

    // Copia: un héroe puede morir en batalla a mitad de la iteración.
    for (const hero of [...heroesOf(state, player.id)]) {
      if (state.finished !== null) break;
      if (!state.heroes.includes(hero)) continue;

      // Por debajo del paso más barato que existe no hay Dijkstra que valga:
      // `ROAD_COST` son 75 y el terreno más barato son 100, así que ningún
      // paso cabe y `stepTowards` iba a devolver `null` seguro. Es el mismo
      // `continue` de tres líneas más abajo, tomado antes de recorrer el mapa
      // entero: 231 de las 1257 pasadas de 40 partidas —el 18,4 %— salían por
      // ahí, y las 231 sin una sola excepción.
      //
      // Es equivalente porque ni esto ni el `paso === null` marcan `seMovio`,
      // y ninguna de las dos decisiones que se saltan toca el estado.
      if (hero.movePoints < ROAD_COST) continue;

      // El único Dijkstra del movimiento, y se ve dónde se hace. Sin tope,
      // porque el objetivo puede estar a diez días de marcha. Alimenta a las
      // dos decisiones: elegir a dónde ir, y hasta dónde llegar hoy — que
      // antes recorrían el mapa una vez cada una desde el mismo origen.
      const alcance = reachableFrom(state.map, hero.at);

      const destino = chooseHeroDestination(state, hero, alcance);
      if (destino === null) continue;

      // El objetivo puede estar a varios días: se avanza lo que dé el día.
      const paso = stepTowards(hero, destino, alcance);
      if (paso === null) continue;

      applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: paso }, ctx, player.id);
      if (state.pendingBattle !== null) {
        if (takeover !== undefined) await takeover(state, ctx);
        // Se vuelve a preguntar: quien la tomó pudo cerrarla, o no haberla
        // querido. Si sigue ahí, la cierra la IA como toda la vida.
        if (state.pendingBattle !== null) resolvePendingBattle(state, ctx);
      }
      seMovio = true;
      movimientos++;
    }

    if (!seMovio) break;
  }

  if (state.finished === null) {
    applyAdventureAction(state, { type: 'end_turn' }, ctx, player.id);
  }
}

/**
 * Juega la partida entera con la IA en todos los bandos. Devuelve los días.
 *
 * No acepta `takeover` a propósito: es el banco de pruebas de la IA pura, el
 * que mide el barrido de semillas. Meter a un tercero aquí dejaría de medir lo
 * que dice medir.
 */
export async function playAiGame(
  state: GameState,
  ctx: GameContext,
  maxDias = 200,
): Promise<number> {
  while (state.finished === null && state.day <= maxDias) {
    await playAiTurn(state, ctx);
  }
  return state.day;
}
