/** Colores del prototipo. Son marcadores: el arte generado llega en la fase 5. */
import type { ResourceKind } from '@core/types.js';
import type { TerrainKind } from '@core/map/terrain.js';

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

export function playerColor(id: number | null): string {
  if (id === null) return '#7d7364';
  return PLAYER_COLORS[id % PLAYER_COLORS.length] as string;
}
