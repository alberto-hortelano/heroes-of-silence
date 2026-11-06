/**
 * La geometría de la rejilla del mapa, sin reglas: aritmética de índices que
 * comparten el río, el vestido y el generador.
 *
 * El generador hace los mapas en espejo (el giro de 180°: la casilla `i` y la
 * `N − 1 − i`, la región `2k` y la `2k + 1`), y esa cuenta la leen los tres. Vivía
 * en `vestir.ts`, y `rio.ts` la importaba de allí mientras `vestir.ts` importaba
 * `rio.ts`: un ciclo de importación en ejecución (fase N de la reorganización,
 * 07-11-2026).
 */

/** La pareja de una región en el espejo: las regiones 2k y 2k+1 son espejo. */
export const parejaDe = (r: number): number => (r % 2 === 0 ? r + 1 : r - 1);

/** La casilla espejo de `i` en un mapa de `N` casillas: el giro de 180° del generador. */
export const espejoDe = (i: number, N: number): number => N - 1 - i;
