/**
 * Terrenos del mapa de aventura y lo que cuesta cruzarlos.
 *
 * Los costes están en puntos de movimiento del héroe, que se reparten cada día
 * según la criatura más lenta del ejército (1000 a 1500). Un héroe medio cruza
 * unas doce casillas de hierba al día.
 */
export const TERRAIN_KINDS = [
  'grass',
  'dirt',
  'sand',
  'snow',
  'swamp',
  'lava',
  'rough',
  'water',
] as const;

export type TerrainKind = (typeof TERRAIN_KINDS)[number];

export const TERRAIN_COST: Readonly<Record<TerrainKind, number>> = {
  grass: 100,
  dirt: 100,
  lava: 100,
  rough: 125,
  snow: 175,
  swamp: 175,
  sand: 200,
  water: 100,
};

/** Un camino abarata el paso, se pinte sobre el terreno que se pinte. */
export const ROAD_COST = 75;

/** Cruzar en diagonal cuesta un 40 % más, como en la serie. */
export const DIAGONAL_FACTOR = 1.4;

/**
 * Lo que cuesta **entrar** en una casilla: la regla, escrita una vez.
 *
 * Vive aquí y no en `map.ts` porque aquí viven sus tres constantes, y desde este
 * ciclo tiene un segundo lector: la prosa que el contrato le manda al agente
 * (`RESPONSE_FORMAT.adventure_turn`), que antes **derivaba las cifras y copiaba
 * la fórmula** — el camino que sustituye al terreno y la diagonal que multiplica
 * y redondea, escritos a mano al lado de los números buenos. Justo lo que el
 * docstring de `stepCost` decía que no podía pasar: «el día que cambie el factor
 * diagonal habría que acordarse de los dos».
 *
 * Que el agente lea números salidos de esta función y no de la tabla es la
 * diferencia entre anunciarle lo que se le va a cobrar y anunciarle una cifra
 * que se parece.
 */
export function costeDeEntrada(terreno: TerrainKind, camino: boolean, diagonal: boolean): number {
  const base = camino ? ROAD_COST : TERRAIN_COST[terreno];
  return Math.round(diagonal ? base * DIAGONAL_FACTOR : base);
}

/** Sin barco, el agua no se pisa. El slice es terrestre. */
export function isWalkable(t: TerrainKind): boolean {
  return t !== 'water';
}
