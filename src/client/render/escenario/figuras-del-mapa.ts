/**
 * Las figuras del juego en el mapa, en casillas: dónde apoyan los pies, lo que
 * mide el héroe y sus aros. Las leen el pintor del mapa (`render/mapa/mapa.ts`) y la
 * escena, que no pone el puesto de un nodo encima del héroe parado en él
 * (`componer`). Puro y sin dependencias: lo importan módulos que se importan entre
 * sí (`puestos.ts`, `figuras.ts`, `pintar.ts`).
 */
import type { Caja } from './pasillo.js';

/**
 * Dónde apoya los pies cada figura del mapa, en casillas bajo el borde de arriba
 * de su casilla: la misma convención que `Sprite.y` de la escena —la `y` de la
 * base—, que es lo que deja ordenar figuras y volúmenes juntos. Un pino con la
 * base en y + 0,9 tapa al héroe de esa casilla, que la tiene en y + 0,8. La leen
 * el pintor del mapa (`render/mapa/mapa.ts`) y la escena (el sitio del puesto).
 */
export const PIES = { heroe: 0.8, grupo: 0.82, suelto: 0.85 } as const;

/**
 * La figura del héroe en el mapa, en casillas: lo que mide de alto
 * (`pintarHeroe`) y sus dos aros, el del dueño y el de seleccionado, que va por
 * fuera (`rx` a cada lado, `ry` hacia delante y hacia atrás de sus pies). La
 * leen el pintor y el sitio del puesto, que no la toca (`cajaDelHeroeEn`): el
 * héroe parado en su paso tapaba casi entera la obra (QA de la fase 3 del puesto
 * fronterizo).
 */
export const FIGURA_DEL_HEROE = {
  alto: 0.92,
  aro: { rx: 0.32, ry: 0.13 },
  seleccionado: { rx: 0.42, ry: 0.18 },
} as const;

/**
 * Donde apoya los pies una figura de la casilla `at`, en casillas: `pies` bajo el
 * borde de arriba de su casilla (`PIES`) o, en la de un puente, en el asiento de
 * su tablero (`Puente.asiento`). La leen la pisada del juego (`pisada`) y la
 * escena, con los del héroe, para no poner el puesto encima de él.
 */
export function pieDeFigura(
  at: { readonly x: number; readonly y: number },
  pies: number,
  asientoDelPuente?: readonly [number, number],
): readonly [number, number] {
  return asientoDelPuente ?? [at.x + 0.5, at.y + pies];
}

/**
 * Lo que pinta el héroe con los pies en `pie`, en casillas: su figura y, por
 * fuera, el aro de seleccionado, el mayor de lo que lleva alrededor.
 */
export function cajaDelHeroeEn([x, y]: readonly [number, number]): Caja {
  const { alto, seleccionado } = FIGURA_DEL_HEROE;
  return [x - seleccionado.rx, y - alto, x + seleccionado.rx, y + seleccionado.ry];
}
