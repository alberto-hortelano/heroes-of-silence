/**
 * El post-proceso de los encargos de efectos: partir la lámina de iconos y
 * empaquetar los fotogramas de un efecto animado.
 */
import sharp, { type OverlayOptions } from 'sharp';
import { ALFA_FIGURA, componentes, enFilas, figuras } from './empaquetar.js';
import { REJILLA_DE_EFECTO, rejillaDeIconos } from './encargo.js';
import type { Raster } from './recorte.js';

/** Lado de un icono de estado, en píxeles: se pinta a ~32 y se guarda con resolución de sobra. */
export const LADO_ICONO = 128;
const MARGEN_ICONO = 8;
/** Lado de un fotograma de efecto animado. */
export const LADO_EFECTO = 256;

/**
 * El recorte de un efecto: humo, resplandor y niebla son semitransparentes a
 * propósito, así que aquí NO se quita el halo ni se vuelve opaco nada; solo se
 * borra lo que ya es casi invisible (alfa < 24), que es el velo que deja la
 * herramienta sobre el fondo.
 */
export function recorteSuave(r: Raster, umbral = 24): Raster {
  for (let i = 3; i < r.data.length; i += 4) if ((r.data[i] as number) < umbral) r.data[i] = 0;
  return r;
}

const rawAPng = (r: Raster): Promise<Buffer> =>
  sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } })
    .png()
    .toBuffer();

/** Parte una lámina de iconos en un PNG cuadrado por icono, en el orden de `nombres`. */
export async function partirIconos(
  r: Raster,
  nombres: readonly string[],
): Promise<{ nombre: string; png: Buffer }[]> {
  const { filas, columnas } = rejillaDeIconos(nombres.length);
  const rejilla = enFilas(figuras(componentes(r), 2), filas, columnas);
  const fuente = await rawAPng(r);
  const fuera: { nombre: string; png: Buffer }[] = [];
  for (const [i, c] of rejilla.flat().entries()) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    const util = LADO_ICONO - 2 * MARGEN_ICONO;
    const escala = Math.min(util / w, util / h);
    const iw = Math.max(1, Math.round(w * escala));
    const ih = Math.max(1, Math.round(h * escala));
    const icono = await sharp(fuente)
      .extract({ left: c.x0, top: c.y0, width: w, height: h })
      .resize(iw, ih, { kernel: 'mitchell' })
      .png()
      .toBuffer();
    const png = await sharp({
      create: {
        width: LADO_ICONO,
        height: LADO_ICONO,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: icono, left: (LADO_ICONO - iw) >> 1, top: (LADO_ICONO - ih) >> 1 }])
      .png()
      .toBuffer();
    fuera.push({ nombre: nombres[i] as string, png });
  }
  return fuera;
}

/**
 * Los 6 fotogramas de un efecto, cortados por la rejilla NOMINAL de 3×2 y no
 * buscando figuras: un efecto son partículas sueltas (chispas, humo, brasas),
 * y agrupar componentes las repartiría mal. Como lo que importa es dónde está el
 * efecto DENTRO de su celda —una explosión que crece desde el mismo punto—, se
 * conserva la posición relativa y se escala la celda entera. Lo que roza una
 * línea de corte se recorta y se cuenta; lo que la cruza de verdad se dice.
 */
export async function empaquetarEfecto(r: Raster): Promise<{ png: Buffer; rozaduras: number }> {
  const { columnas, filas } = REJILLA_DE_EFECTO;
  const cw = r.width / columnas;
  const ch = r.height / filas;
  const alfa = (x: number, y: number): number => r.data[(y * r.width + x) * 4 + 3] as number;
  // Unas astillas o la punta de una raíz que rozan la línea se recortan y se
  // cuentan; un fotograma que de verdad cruza (más del 15 % de la línea) se dice.
  let rozaduras = 0;
  const linea = (n: number, largo: number, donde: string): void => {
    if (n > largo * 0.15) throw new Error(`hay efecto cruzando la línea entre ${donde}`);
    rozaduras += n;
  };
  for (let k = 1; k < columnas; k++) {
    const x = Math.round(k * cw);
    let n = 0;
    for (let y = 0; y < r.height; y++) if (alfa(x, y) >= ALFA_FIGURA) n++;
    linea(n, r.height, `las columnas ${k} y ${k + 1}`);
  }
  for (let k = 1; k < filas; k++) {
    const y = Math.round(k * ch);
    let n = 0;
    for (let x = 0; x < r.width; x++) if (alfa(x, y) >= ALFA_FIGURA) n++;
    linea(n, r.width, `las filas ${k} y ${k + 1}`);
  }

  const fuente = await rawAPng(r);
  const escala = Math.min(LADO_EFECTO / cw, LADO_EFECTO / ch);
  const w = Math.round(cw * escala);
  const h = Math.round(ch * escala);
  const capas: OverlayOptions[] = [];
  for (let i = 0; i < columnas * filas; i++) {
    const left = Math.round((i % columnas) * cw);
    const top = Math.round(Math.floor(i / columnas) * ch);
    const celda = await sharp(fuente)
      .extract({
        left,
        top,
        width: Math.min(Math.round(cw), r.width - left),
        height: Math.min(Math.round(ch), r.height - top),
      })
      .resize(w, h, { kernel: 'mitchell' })
      .png()
      .toBuffer();
    capas.push({
      input: celda,
      left: i * LADO_EFECTO + ((LADO_EFECTO - w) >> 1),
      top: (LADO_EFECTO - h) >> 1,
    });
  }
  const png = await sharp({
    create: {
      width: LADO_EFECTO * columnas * filas,
      height: LADO_EFECTO,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
  return { png, rozaduras };
}
