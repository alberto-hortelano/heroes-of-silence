/**
 * El encuadre a mano: lo que C1 no deja bien (30-10-2026, el piquero: «siguen fallando,
 * ajústalos a mano, si vas pasando de un frame a otro verás cómo se desplaza mucho»).
 *
 * Junto a una hoja (`hoja-b.webp`) puede ir `hoja-b.ajustes.json`: por clip, cuánto se
 * mueve cada fotograma en su celda, en px, encima de lo que dejó el empaquetado. Lo
 * aplica `apilarHojas` al juntar la dirección, así que la hoja se queda como la dejó el
 * taller, el atlas lleva el ajuste y reprocesar no lo pierde. Va atado al sha256 de su
 * hoja: si la hoja cambia (otra versión, otro empaquetado), el ajuste ya no es de ella y
 * juntar lanza diciéndolo, en vez de mover una hoja que nadie miró.
 */
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { z } from 'zod';
import { FIGURA, HOJAS_DE_FIGURA, type HojaDeFigura } from '../../src/shared/arte.js';

const Desplazamiento = z.tuple([z.number().int(), z.number().int()]);

export const Ajustes = z
  .object({
    /** El sha256 de la hoja que se miró al ajustar. */
    hoja: z.string().regex(/^[0-9a-f]{64}$/),
    /** Por qué y quién, para quien lo lea después. */
    nota: z.string().optional(),
    /** Por clip, un [dx, dy] por fotograma (los que falten, sin mover). */
    fotogramas: z.record(z.string(), z.array(Desplazamiento).max(FIGURA.columnas)),
  })
  .strict();
export type Ajustes = z.infer<typeof Ajustes>;

export const rutaDeAjustes = (rutaDeLaHoja: string): string =>
  rutaDeLaHoja.replace(/\.(webp|png)$/, '.ajustes.json');

/** Los ajustes de una hoja, si los tiene; lanza si son de otra hoja o no valen. */
export function ajustesDe(rutaDeLaHoja: string, hoja: HojaDeFigura, sha: string): Ajustes | null {
  const ruta = rutaDeAjustes(rutaDeLaHoja);
  if (!existsSync(ruta)) return null;
  const leidos = Ajustes.safeParse(JSON.parse(readFileSync(ruta, 'utf8')));
  if (!leidos.success) throw new Error(`${ruta} no vale: ${leidos.error.message}`);
  const a = leidos.data;
  if (a.hoja !== sha) {
    throw new Error(
      `${ruta} es de otra hoja (${a.hoja.slice(0, 12)}…, y la de ahora es ${sha.slice(0, 12)}…): ` +
        'mira otra vez el encuadre de la hoja nueva y vuelve a ajustarla, o borra el fichero',
    );
  }
  const clips: readonly string[] = HOJAS_DE_FIGURA[hoja];
  const ajenos = Object.keys(a.fotogramas).filter((c) => !clips.includes(c));
  if (ajenos.length > 0)
    throw new Error(`${ruta}: la hoja ${hoja.toUpperCase()} no lleva ${ajenos.join(', ')}`);
  return a;
}

/** La hoja con cada fotograma movido en su celda; lo que sale de la celda se pierde. */
export async function aplicarAjustes(
  png: Buffer,
  hoja: HojaDeFigura,
  ajustes: Ajustes,
): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const celda = info.width / FIGURA.columnas;
  const fuera = Buffer.from(data);
  const clips: readonly string[] = HOJAS_DE_FIGURA[hoja];
  for (const [clip, ds] of Object.entries(ajustes.fotogramas)) {
    const fila = clips.indexOf(clip);
    for (const [col, [dx, dy]] of ds.entries()) {
      if (dx === 0 && dy === 0) continue;
      const x0 = col * celda;
      const y0 = fila * celda;
      for (let y = 0; y < celda; y++) {
        for (let x = 0; x < celda; x++) {
          const sx = x - dx;
          const sy = y - dy;
          const o = ((y0 + y) * info.width + x0 + x) * 4;
          if (sx < 0 || sy < 0 || sx >= celda || sy >= celda) {
            fuera.fill(0, o, o + 4);
            continue;
          }
          const s = ((y0 + sy) * info.width + x0 + sx) * 4;
          data.copy(fuera, o, s, s + 4);
        }
      }
    }
  }
  return sharp(fuera, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
