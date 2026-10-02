/** Colores del prototipo. Son marcadores: el arte generado llega en la fase 5. */

import { NOMBRE_DE_RECURSO, RESOURCE_KINDS, type ResourceKind } from '@core/types.js';

export const RESOURCE_COLORS: Readonly<Record<ResourceKind, string>> = {
  wood: '#8b5a2b',
  mercury: '#b04a86',
  ore: '#8a8a8a',
  sulfur: '#c8b32c',
  crystal: '#7fd4d8',
  gems: '#4fae5e',
  gold: '#d9a441',
};

/**
 * El rótulo de cada recurso: el nombre del núcleo (`NOMBRE_DE_RECURSO`) con
 * mayúscula. Derivado y no escrito: era la segunda lista de los mismos siete
 * nombres.
 */
export const RESOURCE_NAMES: Readonly<Record<ResourceKind, string>> = Object.fromEntries(
  RESOURCE_KINDS.map((k) => {
    const nombre = NOMBRE_DE_RECURSO[k];
    return [k, nombre.charAt(0).toUpperCase() + nombre.slice(1)];
  }),
) as Record<ResourceKind, string>;

/**
 * La marca del comandante —el héroe en el tablero, el que si cae pierde la
 * batalla—: una corona, la MISMA en el lienzo y en «En el campo». Con arte, el
 * héroe usa la figura de Liora con el mismo aro que todos; sin arte, era un
 * círculo «Ald» igual que «Cam» y «Arq» (H-4 de la QA de la fase 1b). Un glifo y
 * no un dibujo porque así es un solo hecho para el canvas y para el HTML.
 */
export const MARCA_DE_COMANDANTE = '♛';
export const COLOR_DE_COMANDANTE = '#f5cd4f';

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
