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
import type { Hero } from '../src/core/hero/hero.js';
import type { MapObject } from '../src/core/map/map.js';
import type { Rng } from '../src/core/rng.js';
import { applyAdventureAction, type GameContext, type GameState } from '../src/core/state/game.js';
import type { Army, Stack, Troop } from '../src/core/types.js';

/**
 * Un ejército de individuos, escrito por grupos: `{ creature: 'pikeman',
 * count: 20 }` son veinte piqueros, uno detrás de otro y en el orden en que se
 * escriben. Un personaje va con `count: 1` y conserva su `member`.
 *
 * NO pasa por el liderazgo: un test que monta un ejército a mano decide qué
 * lleva, igual que antes decidía qué había en cada hueco. Lo que sí tiene que
 * respetar es el tablero —27 hexes por bando—, porque eso lo mira la batalla.
 */
export function ejercito(...grupos: Stack[]): Army {
  const out: Troop[] = [];
  for (const { count, ...troop } of grupos) {
    for (let i = 0; i < count; i++) out.push(troop);
  }
  return out;
}

export type Monstruo = Extract<MapObject, { kind: 'monster' }>;

/**
 * El primer monstruo en pie del mapa. Existe para que ningún test se invente un
 * `objectId`: uno inventado sobrevive mientras la batalla no se cierre y revienta
 * con «monstruo no encontrado» el día que alguien llame a `settleBattle`, donde
 * parece un fallo del núcleo y no del andamio del test.
 */
export function monstruoVivo(state: GameState): Monstruo {
  const obj = state.map.objects.find((o) => o.kind === 'monster' && !o.defeated);
  if (obj === undefined || obj.kind !== 'monster') {
    throw new Error('el mapa no tiene ningún monstruo en pie');
  }
  return obj;
}

/**
 * Cambia el primer monstruo en pie por el que pide el test, en su misma casilla.
 *
 * Los objetos del mapa son de solo lectura, así que se sustituye entero en su
 * sitio del array —igual que ya hacía a mano el test del héroe que pierde—: lo
 * que importa es que `monstruoVivo` siga devolviendo este, porque es a él a
 * quien va a entrar `forzarBatalla`.
 */
export function ponerMonstruo(state: GameState, creature: string, count: number): Monstruo {
  const anterior = monstruoVivo(state);
  const nuevo: Monstruo = {
    kind: 'monster',
    id: anterior.id,
    at: anterior.at,
    creature,
    count,
    defeated: false,
  };
  state.map.objects.splice(state.map.objects.indexOf(anterior), 1, nuevo);
  return nuevo;
}

/**
 * Coloca al héroe junto al primer monstruo en pie y lo hace entrar: deja la
 * batalla montada en `state.pendingBattle` y devuelve contra quién.
 *
 * La receta iba por su sexta copia entre `game.test.ts` y `battle.test.ts`, y
 * cada copia repetía los mismos 5000 puntos de movimiento a mano.
 */
export function forzarBatalla(state: GameState, ctx: GameContext, hero: Hero): Monstruo {
  const monstruo = monstruoVivo(state);
  hero.at = { x: monstruo.at.x - 1, y: monstruo.at.y };
  hero.movePoints = 5000;
  applyAdventureAction(
    state,
    { type: 'move_hero', hero: hero.id, to: monstruo.at },
    ctx,
    state.current,
  );
  if (state.pendingBattle === null) throw new Error('pisar al monstruo no abrió ninguna batalla');
  return monstruo;
}

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
  const movimientos = acciones.filter(
    (a): a is Extract<BattleAction, { type: 'move' }> => a.type === 'move',
  );
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
