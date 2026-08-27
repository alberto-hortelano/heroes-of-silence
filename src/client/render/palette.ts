/** Colores del prototipo. Son marcadores: el arte generado llega en la fase 5. */

import type { TerrainKind } from '@core/map/terrain.js';
import { RESOURCE_KINDS, type ResourceKind, type Resources } from '@core/types.js';

export const TERRAIN_COLORS: Readonly<Record<TerrainKind, string>> = {
  grass: '#4a6b35',
  dirt: '#6b543a',
  sand: '#c2a86a',
  snow: '#d5dde2',
  swamp: '#3f5145',
  lava: '#5a2f28',
  rough: '#7a6a4e',
  water: '#2b4a63',
};

export const RESOURCE_COLORS: Readonly<Record<ResourceKind, string>> = {
  wood: '#8b5a2b',
  mercury: '#b04a86',
  ore: '#8a8a8a',
  sulfur: '#c8b32c',
  crystal: '#7fd4d8',
  gems: '#4fae5e',
  gold: '#d9a441',
};

export const RESOURCE_NAMES: Readonly<Record<ResourceKind, string>> = {
  wood: 'Madera',
  mercury: 'Mercurio',
  ore: 'Mineral',
  sulfur: 'Azufre',
  crystal: 'Cristal',
  gems: 'Gemas',
  gold: 'Oro',
};

/** Color de cada jugador, por índice. */
export const PLAYER_COLORS = ['#d94f4f', '#4f7fd9', '#4fd97f', '#d9c14f'] as const;

/**
 * El color de un jugador. `null` es «de nadie»: el gris de lo neutral.
 *
 * El `% PLAYER_COLORS.length` es para que una partida de más de cuatro
 * jugadores dé la vuelta, y eso está bien. Lo que NO estaba bien es lo que había
 * detrás: un `as string` que tapaba el `undefined` de un índice fuera de rango.
 * En JavaScript `-1 % 4` es **−1**, no 3, así que un id negativo salía de aquí
 * como `undefined` **sin decir nada** y reventaba tres capas más allá, en
 * `fondoDeColor`, con un «Cannot read properties of undefined». Es el mismo
 * patrón que el tercer `throw` de `frontera.ts`: un acceso fuera de rango que se
 * pierde en silencio porque el tipo dice que no puede pasar.
 *
 * Ahora lo dice. Un id negativo es un fallo nuestro —los jugadores se numeran
 * desde 0—, así que se lanza con el número dentro en vez de pintar de un color
 * que no existe.
 */
export function playerColor(id: number | null): string {
  if (id === null) return '#7d7364';
  const color = PLAYER_COLORS[id % PLAYER_COLORS.length];
  if (color === undefined) {
    throw new Error(
      `no hay color para el jugador ${id}: los jugadores se numeran desde 0 y este índice cae fuera`,
    );
  }
  return color;
}

/** Coste en prosa: "2500 oro, 5 madera". Lo comparten paneles y castillo. */
export function costLabel(cost: Partial<Resources>): string {
  const partes = RESOURCE_KINDS.filter((k) => (cost[k] ?? 0) > 0).map(
    (k) => `${cost[k]} ${RESOURCE_NAMES[k].toLowerCase()}`,
  );
  return partes.length === 0 ? 'gratis' : partes.join(', ');
}
