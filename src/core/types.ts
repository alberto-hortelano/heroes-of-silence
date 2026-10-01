/** Tipos compartidos por todo el núcleo. Sin DOM, sin node:*. */

// ---------------------------------------------------------------- recursos

/** Los 7 recursos de HoMM2 (verificado en `resource.h` de fheroes2). */
export const RESOURCE_KINDS = [
  'wood',
  'mercury',
  'ore',
  'sulfur',
  'crystal',
  'gems',
  'gold',
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type Resources = Readonly<Record<ResourceKind, number>>;

// ---------------------------------------------------------------- velocidad

/**
 * Escalones de velocidad. Fijan dos cosas distintas:
 * el orden de iniciativa en batalla y los puntos de movimiento del héroe en
 * el mapa (que los marca la criatura MÁS LENTA del ejército).
 */
export const SPEED_TIERS = [
  'very_slow',
  'slow',
  'average',
  'fast',
  'very_fast',
  'ultra_fast',
] as const;

export type SpeedTier = (typeof SPEED_TIERS)[number];

/** Hexes que recorre una unidad de esa velocidad en un turno de batalla. */
export const SPEED_TO_HEXES: Readonly<Record<SpeedTier, number>> = {
  very_slow: 2,
  slow: 3,
  average: 4,
  fast: 5,
  very_fast: 6,
  ultra_fast: 7,
};

/**
 * Puntos de movimiento diarios del héroe en tierra, por la criatura más lenta
 * de su ejército. Verificado en `heroes.cpp::GetMaxMovePoints()` de fheroes2.
 */
export const SPEED_TO_MOVE_POINTS: Readonly<Record<SpeedTier, number>> = {
  very_slow: 1000,
  slow: 1100,
  average: 1200,
  fast: 1300,
  very_fast: 1400,
  ultra_fast: 1500,
};

// ---------------------------------------------------------------- criaturas

export type FactionId = 'knight' | 'necromancer';

/**
 * Rasgos especiales de criatura.
 *
 * Es una constante recorrible, y no solo una unión de literales, porque hay un
 * test que la recorre: `test/invariantes.test.ts` exige que cada rasgo
 * declarado aparezca leído en algún sitio de `src/core`. Durante mucho tiempo
 * cuatro de estos once estuvieron escritos aquí y en `data/creatures.json` sin
 * que el motor los mirara: el jugador —y el agente, que los recibe en cada
 * turno de batalla— pagaban por una ficha que mentía.
 */
export const CREATURE_TRAITS = [
  'undead',
  'flying',
  'no_retaliation',
  'double_attack',
  'double_shot',
  'life_drain',
  'splash_shot',
  'charge',
  'curse_on_hit',
  'bane_undead',
  'fear',
] as const;

export type CreatureTrait = (typeof CREATURE_TRAITS)[number];

/**
 * Lo que el motor de batalla necesita saber de una unidad para jugarla: las
 * cifras de combate, sin nada de economía.
 *
 * Existe porque ya no todo lo que pisa el tablero sale del catálogo: un
 * personaje (`rpg/stats.ts`) tiene sus propias cifras, calculadas de sus
 * atributos. Una criatura ES una `UnitInfo` —la extiende—, así que para el
 * catálogo no hay traducción: el stack de batalla guarda la misma referencia.
 *
 * `faction: null` es «sin facción»: no suma a la diversidad del ejército.
 */
export interface UnitInfo {
  readonly name: string;
  readonly faction: FactionId | null;
  readonly attack: number;
  readonly defense: number;
  /** [mínimo, máximo] de daño por efectivo. */
  readonly damage: readonly [number, number];
  readonly hp: number;
  readonly speed: SpeedTier;
  /** Munición. > 0 = es tirador. */
  readonly shots?: number;
  /** Hexes que ocupa en la rejilla de batalla (1 o 2). */
  readonly hexes?: number;
  readonly traits?: readonly CreatureTrait[];
}

export interface Creature extends UnitInfo {
  readonly id: string;
  readonly faction: FactionId;
  /** 1..6 — el nivel de la morada que la produce. */
  readonly level: number;
  /**
   * Lo que ocupa UN individuo en el liderazgo de quien lo lleva
   * (`hero/troop.ts`). Provisional, en datos: lo define el usuario.
   */
  readonly leadership: number;
  /** Crecimiento semanal base de la morada. */
  readonly growth: number;
  readonly cost: Partial<Resources>;
  readonly upgradesTo?: string;
}

// ---------------------------------------------------------------- ejército

/**
 * Un individuo del ejército: una criatura del catálogo, o un personaje.
 *
 * **No tiene `count`, y es a propósito.** El ejército de un héroe es una lista
 * de individuos, uno por hex en el tablero; si el campo existiera, alguien
 * escribiría un 2 y el liderazgo —que se cuenta por individuo— mentiría. Diez
 * piqueros son diez entradas. Quien quiera verlos agrupados para pintarlos los
 * pide a `troopSummary`, que es el único sitio que agrupa.
 */
export interface Troop {
  readonly creature: string;
  /**
   * Id de un personaje de `GameState.characters`: el individuo ES ese
   * personaje. Va con `creature: CHARACTER_BODY`, que no está en el catálogo a
   * propósito: un lector de `Army` que no sepa de personajes lanza en vez de
   * leer cifras prestadas en silencio. La puerta que sí sabe es `troopUnit`.
   */
  readonly member?: string;
}

/**
 * La entrada del motor de batalla: un tipo y cuántos. El motor sigue sabiendo
 * jugar stacks de N —sus tests lo ejercen—, pero desde la tropa de individuos
 * la partida solo le manda `count: 1` (`troopsAsStacks`). Un personaje va
 * siempre con `count: 1`: `createBattle` lanza si no.
 */
export interface Stack extends Troop {
  readonly count: number;
}

/**
 * El ejército de un héroe o la guarnición de un castillo: una lista DENSA de
 * individuos, sin huecos y sin tope de slots. El tope es el liderazgo
 * (`hero/troop.ts`), y el orden importa: es el de despliegue y el que desempata
 * la iniciativa.
 */
export type Army = readonly Troop[];

// ---------------------------------------------------------------- jugadores

export type PlayerId = number;

/** Quién toma las decisiones de este jugador. */
export type Controller = 'human' | 'ai';

// ---------------------------------------------------------------- geometría

/** Casilla del mapa de aventura (cuadrícula). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Hex de la rejilla de batalla, en coordenadas offset odd-r. */
export interface Hex {
  readonly col: number;
  readonly row: number;
}

// ---------------------------------------------------------------- utilidades

export const EMPTY_RESOURCES: Resources = Object.freeze({
  wood: 0,
  mercury: 0,
  ore: 0,
  sulfur: 0,
  crystal: 0,
  gems: 0,
  gold: 0,
});

export function addResources(a: Resources, b: Partial<Resources>): Resources {
  const out = { ...a };
  for (const k of RESOURCE_KINDS) out[k] = a[k] + (b[k] ?? 0);
  return out;
}

export function subtractResources(a: Resources, b: Partial<Resources>): Resources {
  const out = { ...a };
  for (const k of RESOURCE_KINDS) out[k] = a[k] - (b[k] ?? 0);
  return out;
}

export function scaleResources(a: Partial<Resources>, factor: number): Resources {
  const out = { ...EMPTY_RESOURCES };
  for (const k of RESOURCE_KINDS) out[k] = (a[k] ?? 0) * factor;
  return out;
}

/** ¿Alcanza `have` para pagar `cost`? */
export function canAfford(have: Resources, cost: Partial<Resources>): boolean {
  return RESOURCE_KINDS.every((k) => have[k] >= (cost[k] ?? 0));
}
