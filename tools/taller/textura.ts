/**
 * Las texturas del suelo: una imagen opaca que se repite por los cuatro lados.
 *
 * ChatGPT no garantiza que lo que pinta case consigo mismo al repetirse, así que
 * la costura no se pide: se fabrica. Cada eje se arregla por separado mezclando
 * la imagen con su copia desplazada medio lado, con un peso que vale 1 en el
 * centro y 0 en los bordes: en el borde queda el interior de la copia, que casa
 * consigo mismo porque eran dos columnas vecinas. La copia desplazada tiene su
 * propia costura justo en el centro, donde el peso vale 1 y no se ve.
 *
 * Hacerlo eje a eje y no con una máscara en los dos a la vez es lo que importa:
 * con una sola máscara que valga 0 en todo el borde, la costura horizontal de la
 * copia asoma en mitad del borde izquierdo.
 */
import sharp from 'sharp';
import type { Raster } from './recorte.js';

/** El lado de la textura que sale del taller. */
export const LADO_DE_TEXTURA = 512;

/** Qué parte del lado, desde cada borde, se mezcla con la copia desplazada. */
const BANDA = 0.25;

/** El peso de la imagen original a `d` píxeles del borde más cercano. */
function peso(i: number, lado: number): number {
  const d = Math.min(i + 0.5, lado - i - 0.5) / lado;
  const t = Math.min(1, d / BANDA);
  return t * t * (3 - 2 * t);
}

/** Mezcla `r` con su copia desplazada medio lado en un eje. Lado cuadrado. */
function mezclarEje(r: Raster, eje: 'x' | 'y'): Raster {
  const { width: L, data } = r;
  const sale = Buffer.alloc(data.length);
  const mitad = Math.floor(L / 2);
  for (let y = 0; y < L; y++) {
    for (let x = 0; x < L; x++) {
      const w = peso(eje === 'x' ? x : y, L);
      const cx = eje === 'x' ? (x + mitad) % L : x;
      const cy = eje === 'y' ? (y + mitad) % L : y;
      const i = (y * L + x) * 4;
      const j = (cy * L + cx) * 4;
      for (let c = 0; c < 3; c++) {
        sale[i + c] = Math.round(w * (data[i + c] as number) + (1 - w) * (data[j + c] as number));
      }
      sale[i + 3] = 255;
    }
  }
  return { data: sale, width: L, height: L };
}

/** Recorta al cuadrado central, lo lleva a `lado` y lo hace repetible. */
export async function hacerTeselable(entrada: Buffer, lado = LADO_DE_TEXTURA): Promise<Raster> {
  const { data, info } = await sharp(entrada)
    .flatten({ background: '#000000' })
    .resize(lado, lado, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const r: Raster = { data, width: info.width, height: info.height };
  return mezclarEje(mezclarEje(r, 'x'), 'y');
}

/**
 * Cuánto se nota la costura: la diferencia media entre la última columna y la
 * primera (y la última fila y la primera), dividida entre la diferencia media
 * entre columnas (y filas) vecinas del interior. Cerca de 1, no se ve; una
 * imagen cualquiera da varias veces más.
 */
export function costura(r: Raster): number {
  const { width: W, height: H, data } = r;
  const dif = (a: number, b: number) => {
    let s = 0;
    for (let c = 0; c < 3; c++) s += Math.abs((data[a + c] as number) - (data[b + c] as number));
    return s;
  };
  let borde = 0;
  let interior = 0;
  let nInterior = 0;
  for (let y = 0; y < H; y++) {
    borde += dif((y * W + W - 1) * 4, y * W * 4);
    for (let x = 0; x < W - 1; x++) {
      interior += dif((y * W + x) * 4, (y * W + x + 1) * 4);
      nInterior++;
    }
  }
  for (let x = 0; x < W; x++) {
    borde += dif(((H - 1) * W + x) * 4, x * 4);
    for (let y = 0; y < H - 1; y++) {
      interior += dif((y * W + x) * 4, ((y + 1) * W + x) * 4);
      nInterior++;
    }
  }
  const mediaBorde = borde / (W + H);
  const mediaInterior = interior / nInterior;
  return mediaInterior === 0
    ? mediaBorde === 0
      ? 1
      : Number.POSITIVE_INFINITY
    : mediaBorde / mediaInterior;
}

/** Por encima, la costura se nota al repetir la textura. */
export const UMBRAL_DE_COSTURA = 1.5;
