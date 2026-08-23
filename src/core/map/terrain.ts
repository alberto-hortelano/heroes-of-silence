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

/** Sin barco, el agua no se pisa. El slice es terrestre. */
export function isWalkable(t: TerrainKind): boolean {
  return t !== 'water';
}
