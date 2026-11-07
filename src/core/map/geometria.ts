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
 *
 * Y las tablas de vecinas que se recorren en un orden fijo (`VECINAS`, `ANILLO`,
 * `RUMBOS`, `EJES`): cada una vivía en dos sitios con el mismo contenido y el mismo
 * orden, y de ese orden cuelgan los desempates del generador. Las que recorren las
 * vecinas en otro orden se quedan donde están (`EN_CRUZ`, `CUADRANTES`, los bucles
 * `dy`/`dx`): cambiarles el orden sería otro mapa.
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

/**
 * Las ocho vecinas, `dy` por fuera y `dx` por dentro: el mismo orden que el
 * Dijkstra del mapa. La leen la red (`regiones.ts`), el generador, que es quien
 * más casillas recorre, y la muralla del mapa (`murallas.ts`, que llevaba su copia
 * hasta la fase N de la reorganización, 07-11-2026): dos copias de la 8-vecindad
 * son dos sitios donde una región puede quedar 4-conexa por error.
 */
export const VECINAS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Las ocho vecinas de una casilla en orden, dando la vuelta: su anillo. La leen el
 * río (a qué lado del cauce cae cada vecina, `ladosDelRio`) y las esquinas de agua
 * de los caminos (`vestir/caminos.ts`).
 */
export const ANILLO: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

/**
 * Las cuatro direcciones rectas: este, oeste, sur y norte, así que la opuesta de
 * `d` es `d ^ 1`. En este orden las recorre el Dijkstra del cauce del río y las
 * sortea el paseo de una mancha de obstáculos (`rng.pick`, que elige por posición).
 */
export const RUMBOS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Los cuatro ejes por los que se entra en un nodo o en la puerta de una muralla, en
 * el orden en que se prueban: los rectos y luego los diagonales, cada uno con su
 * dirección y la opuesta. Los leen las entradas de un nodo del generador
 * (`ejeDelNodo`) y la línea de la puerta de una muralla (`lineaDeLaPuerta`).
 */
export const EJES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, -1],
  [1, 1],
];
