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

/**
 * El nombre de cada recurso en español, en minúscula: lo que lee una persona y
 * lo que se le escribe al agente. **Una sola lista**: el cliente la capitaliza
 * para sus rótulos en vez de tener la suya.
 */
export const NOMBRE_DE_RECURSO: Readonly<Record<ResourceKind, string>> = {
  wood: 'madera',
  mercury: 'mercurio',
  ore: 'mineral',
  sulfur: 'azufre',
  crystal: 'cristal',
  gems: 'gemas',
  gold: 'oro',
};

/**
 * Un coste en prosa: «2500 oro, 5 madera», en el orden de `RESOURCE_KINDS` y sin
 * los ceros; «gratis» si no cuesta nada. **El único formateador de precios**: lo
 * leen los motivos del núcleo (`buyBlocker`), la prosa del agente y el cliente,
 * que antes lo escribían cada uno a su manera.
 */
export function describirCoste(coste: Partial<Resources>): string {
  const partes = RESOURCE_KINDS.filter((k) => (coste[k] ?? 0) > 0).map(
    (k) => `${coste[k]} ${NOMBRE_DE_RECURSO[k]}`,
  );
  return partes.length === 0 ? 'gratis' : partes.join(', ');
}

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
 * Es la cita, no lo que anda el héroe: `maxMovePoints` la lleva a la escala
 * del mapa (`marchaALaEscala`, `core/escala.ts`, #226).
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

/**
 * Las facciones del juego, una vez (#108). El tipo sale de la lista y no al
 * revés, para que los esquemas del contrato (`z.enum(FACTION_IDS)`) y la paleta
 * del mapa la lean en vez de copiarla: eran cuatro copias de lo mismo.
 */
export const FACTION_IDS = ['knight', 'necromancer'] as const;
export type FactionId = (typeof FACTION_IDS)[number];

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
  /**
   * El nivel de quien RECIBE un golpe, que multiplica la experiencia de quien
   * se lo da (`herir`). Lo ponen los tres constructores: el catálogo —el nivel
   * de su morada—, el personaje —su `level`— y el héroe —el suyo—; y
   * `cifrasVeteranas` le suma la veteranía como suma ataque y defensa. Vive en
   * las cifras y no al lado del stack porque es una cifra más del individuo:
   * fuera de aquí había cuatro campos `nivel` que rellenar a mano en cada
   * camino de entrada.
   *
   * En una criatura del catálogo coincide con `Creature.level`, y no es el mismo
   * dato: el de un veterano crece y su morada no.
   */
  readonly nivel: number;
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
  /**
   * Lo que este individuo lleva vivido, o nada si es un novato. **Vive en el
   * individuo y viaja con él** —batalla, guarnición, recoger tropa, rendirse—
   * sin que nadie tenga que acordarse de copiarlo: es el mismo objeto el que
   * se mueve. Cuando muere, se pierde con él. Un libro aparte
   * (`state.veteranos[id]`) habría sido el segundo sitio del mismo hecho.
   */
  readonly veterania?: Veterania;
}

/**
 * La hoja de servicios de un individuo con experiencia (`hero/experiencia.ts`).
 * El nivel **no se guarda**: se deriva de `experiencia` con `nivelDeTropa`, así
 * que no hay un segundo dato que subir al subir de nivel.
 */
export interface Veterania {
  /**
   * Identidad estable, de `GameState.siguienteVeterano`: la necesita la tropa
   * que se hace héroe (el ciclo B), que tiene que poder decir CUÁL.
   */
  readonly id: string;
  readonly experiencia: number;
  /** Batallas de las que ha salido vivo desde que tiene experiencia. */
  readonly batallas: number;
  /** Enemigos que ha matado: individuos, no stacks. */
  readonly bajas: number;
  /** Los nombres de los héroes rivales que ha derribado él. */
  readonly heroes: readonly string[];
  /**
   * Lo que lleva puesto, si lleva algo (`hero/equipo.ts`). Vive en la hoja y no
   * al lado de ella porque la hoja ya es «lo que distingue a ESTE individuo de
   * los demás de su tipo»: lo vivido y, desde el ciclo del equipo, lo que lleva.
   * Un novato sin hoja es fungible —cuál de tres piqueros recibe la espada no
   * importa— y deja de serlo al equiparlo, así que equipar a un novato le abre la
   * hoja (experiencia 0, id del mismo contador). Con eso la pieza viaja con él
   * por el mismo camino que la experiencia —batalla, guarnición, rendirse— sin
   * que nadie se acuerde de copiarla, y muere con él.
   */
  readonly equipo?: Equipo;
}

// ---------------------------------------------------------------- equipo

/**
 * Los tres huecos de equipo de un individuo o de un héroe. Los nombró el
 * usuario: «arma, armadura y accesorio». Son ids que viajan al agente tal cual
 * (`unequip.slot`), así que van sin tilde y en minúscula.
 */
export const HUECOS = ['arma', 'armadura', 'accesorio'] as const;

export type Hueco = (typeof HUECOS)[number];

/** Si el texto `x` nombra un hueco. Lo lee `unequipBlocker`: el hueco llega del agente como texto. */
export function esHueco(x: string): x is Hueco {
  return (HUECOS as readonly string[]).includes(x);
}

/**
 * Lo que lleva puesto alguien: el id de una pieza de `data/equipo.json` por
 * hueco, o nada en ese hueco. Inmutable: equipar escribe un objeto nuevo, y por
 * eso las cifras de un veterano se pueden recordar por su hoja.
 */
export type Equipo = Readonly<Partial<Record<Hueco, string>>>;

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
