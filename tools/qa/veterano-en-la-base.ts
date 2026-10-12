/**
 * Un veterano de rango 5 puesto a mano en la guarnición de una base: el caso que
 * `pnpm qa` necesita cruzar y que la partida del arnés no da sola —0,01
 * veteranos de rango 5 pisan su base por partida (`tools/qa/veterania.ts`)—.
 *
 * Puro y aparte de `partida-con-veterano.ts`, que arranca el servidor al
 * importarse: así lo pueden usar también los tests. No es una puerta de trampas
 * de la partida: no lo llama nada de `src/`.
 */
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../../src/core/hero/experiencia.js';
import { baseOf, type GameState } from '../../src/core/state/game.js';
import type { PlayerId, Veterania } from '../../src/core/types.js';

/**
 * Le da una hoja de servicios de nivel 5 al primer individuo de la guarnición de
 * la base de `player` y devuelve su id. La experiencia es justo la del tope (la
 * de un héroe recién hecho); las batallas, las bajas y el héroe derribado son
 * inventados, para que el narrador tenga algo que contar. Lanza si no hay base o
 * si está vacía: un arnés que no puede poner su caso no tiene que dar verde.
 */
export function ponVeteranoEnLaBase(state: GameState, player: PlayerId): string {
  const base = baseOf(state, player);
  if (base === null) throw new Error(`el jugador ${player} no tiene base donde poner un veterano`);
  const [primero, ...resto] = base.garrison;
  if (primero === undefined) {
    throw new Error(`la base ${base.id} del jugador ${player} no tiene guarnición`);
  }
  const veterania: Veterania = {
    id: `veterano-${state.siguienteVeterano++}`,
    experiencia: EXPERIENCIA_INICIAL_DE_HEROE,
    batallas: 3,
    bajas: 5,
    heroes: ['Sir Arnés'],
  };
  base.garrison = [{ ...primero, veterania }, ...resto];
  return veterania.id;
}

/**
 * Levanta la armería en la base de `player` y le deja oro para comprar, y
 * devuelve el id de la base. Lo que `pnpm qa` necesita para cruzar `buy_item` y
 * `equip`: la IA la construye tarde y en pocas partidas. Lanza sin base, como
 * `ponVeteranoEnLaBase`: un arnés que no puede poner su caso no da verde.
 */
export function ponArmeriaEnLaBase(state: GameState, player: PlayerId): string {
  const base = baseOf(state, player);
  if (base === null) throw new Error(`el jugador ${player} no tiene base donde poner la armería`);
  if (!base.buildings.includes('armory')) base.buildings.push('armory');
  const jugador = state.players.find((p) => p.id === player)!;
  jugador.resources = { ...jugador.resources, gold: jugador.resources.gold + 10000 };
  return base.id;
}

/**
 * La partida del arnés tal como la arranca el servidor de `pnpm qa`
 * (`partida-con-veterano.ts`) y como la juega en el proceso la búsqueda de su
 * semilla (`partida-del-arnes.ts`): el veterano y la armería en la base del
 * jugador del agente (el 1). Una sola función para que las dos partidas no se
 * separen: una semilla buscada sobre otra partida no vale para esta.
 */
export function prepararPartidaDelArnes(state: GameState): { veterano: string; base: string } {
  const veterano = ponVeteranoEnLaBase(state, 1);
  // La armería, ya construida y con oro para comprar: la IA la levanta en ~11
  // de cada 100 partidas y casi siempre pasado el día 10, y la partida del
  // arnés acaba antes. Sin esto, `buy_item` no cruzaría el circuito nunca.
  return { veterano, base: ponArmeriaEnLaBase(state, 1) };
}
