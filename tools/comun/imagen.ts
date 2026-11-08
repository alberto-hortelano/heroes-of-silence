/**
 * Una imagen como píxeles RGBA de 8 bits (`Raster`) y de vuelta a PNG: la lectura que repetían a
 * mano el taller y los arneses (`sharp(x).ensureAlpha().raw()`). Escribir un webp no pasa por aquí:
 * cada uso lleva su calidad, y los derivados de `assets/` tienen su sha256.
 */
import sharp from 'sharp';

export interface Raster {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

export async function aRaster(entrada: Buffer): Promise<Raster> {
  const { data, info } = await sharp(entrada)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`esperaba RGBA y llegaron ${info.channels} canales`);
  return { data, width: info.width, height: info.height };
}

export function dePng(r: Raster): Promise<Buffer> {
  return sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } })
    .png()
    .toBuffer();
}
