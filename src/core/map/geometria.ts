/**
 * La geometría de la rejilla del mapa, sin reglas: aritmética de índices que
 * comparten el río, el vestido y el generador.
 *
 * El generador hace los mapas en espejo (el giro de 180°: la casilla `i` y la
 * `N − 1 − i`, la región `2k` y la `2k + 1`), y esa cuenta la leen los tres. Vivía
 * en `vestir.ts`, y `rio.ts` la importaba de allí mientras `vestir.ts` importaba
 * `rio.ts`: un ciclo de importación en ejecución (fase N de la reorganización,
 * 07-11-2026).
 *
 * Y la clave de una casilla (`pointKey`) con su inversa (`pointFromKey`), que leen
 * todos: estaban en `map.ts` hasta la misma fase, y la red de caminos
 * (`red-de-caminos.ts`), que `map.ts` importa, las necesita.
 */
import type { Point } from '../types.js';

/** La pareja de una región en el espejo: las regiones 2k y 2k+1 son espejo. */
export const parejaDe = (r: number): number => (r % 2 === 0 ? r + 1 : r - 1);

/** La casilla espejo de `i` en un mapa de `N` casillas: el giro de 180° del generador. */
export const espejoDe = (i: number, N: number): number => N - 1 - i;

export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

/**
 * La inversa de `pointKey`, escrita **una vez**.
 *
 * Estaba abierta a mano donde hacía falta —el bucle de caminos de
 * `movableCosts`, con su `indexOf(',')` y sus dos `Number`— y volvió a hacer
 * falta en cuanto `serializeKnownMap` dejó de mandarle al agente la clave de
 * almacenamiento y le mandó el punto. Dos aperturas de la misma cadena es la
 * clase de copia que se queda atrás el día que la clave deje de ser `"x,y"`.
 *
 * **Lanza** en vez de devolver un punto con `NaN`: toda clave del sistema sale
 * de `pointKey`, así que una que no se pueda leer es un fallo de programa y no
 * un dato del jugador. El único llamante que se saltaba claves lo hacía por
 * estar **fuera del mapa**, que es otra pregunta y sigue siendo suya.
 */
export function pointFromKey(clave: string): Point {
  const coma = clave.indexOf(',');
  const p = { x: Number(clave.slice(0, coma)), y: Number(clave.slice(coma + 1)) };
  // Se valida por **round-trip** y no mirando los trozos por separado: la
  // inversa de `pointKey` es, por definición, lo que vuelve a dar la misma
  // clave. Así cae de una vez la mitad vacía —`Number("")` es **0**, no `NaN`,
  // así que `"3,"` colaba como (3,0)—, el `NaN` y el `"03,7"`. El `isInteger` va
  // aparte porque `"3.5,7"` sí round-trippea consigo mismo.
  if (coma < 0 || !Number.isInteger(p.x) || !Number.isInteger(p.y) || pointKey(p) !== clave) {
    throw new Error(`"${clave}" no es una casilla: se esperaba "x,y" con dos enteros`);
  }
  return p;
}
