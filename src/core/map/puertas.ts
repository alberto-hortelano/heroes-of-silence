/**
 * La puerta de un pueblo (#188): por dónde llega el camino a él. Es un hecho,
 * aquí: lo leen la búsqueda de los caminos (`Busqueda`, `vestir.ts`), quien
 * coloca los objetos (`colocarPar`, `generate.ts`) y quien mide lo pintado
 * (`sendasPorObjeto`, en el escenógrafo).
 *
 * La cámara mira desde el sur y la puerta del sprite está en su pie, así que
 * la puerta es la casilla de **debajo**.
 *
 * **La ciudad no está aquí** (la ciudad amurallada, vuelta 3, fase 2): sus
 * puertas son las de su recinto (`PUERTAS_DE_LA_CIUDAD`, `recinto.ts`), y esas
 * sí las mira el juego: su muralla no se pisa.
 *
 * El juego no mira esta puerta: un héroe entra en un pueblo por donde llegue.
 * Es del trazado y de la escena.
 */
import type { Point } from '../types.js';

/**
 * Cuántos rodeos cuesta pasar entre el pueblo y su vecina en `(dx, dy)`, por
 * filas de `dy` y columnas de `dx` (de −1 a 1): por la puerta (debajo), 0; por
 * las diagonales de delante, 1; de lado, 3; por detrás, 4. Es la cuenta de
 * #188; el centro es el pueblo mismo.
 */
const RODEOS: readonly (readonly (number | null)[])[] = [
  [4, 4, 4],
  [3, null, 3],
  [1, 0, 1],
];

/** Lo que cuesta, en rodeos, entrar en el pueblo desde su vecina en `(dx, dy)` (`RODEOS`). */
export function rodeosParaEntrar(dx: number, dy: number): number {
  const r = RODEOS[dy + 1]?.[dx + 1];
  if (r === undefined || r === null)
    throw new Error(`(${dx}, ${dy}) no es una vecina: una puerta se mira desde al lado`);
  return r;
}

/**
 * La puerta del pueblo en `at` —la casilla de debajo—, si cae dentro de un mapa
 * de `W × H`; si no, `null`: se llega por donde se pueda.
 */
export function puertaDe(at: Point, W: number, H: number): Point | null {
  return at.x >= 0 && at.x < W && at.y >= -1 && at.y + 1 < H ? { x: at.x, y: at.y + 1 } : null;
}
