/**
 * Post-proceso de lo que devuelve fal.
 *
 * Los modelos entregan lienzos de 1024² que pesan megas: sin esto, ocho
 * terrenos son veinte megas que el navegador tiene que tragarse al arrancar.
 * Los sprites, además, vienen con mucho aire alrededor, y recortarlos al
 * contenido evita que la criatura se vea diminuta dentro de su hexágono.
 */
import sharp from 'sharp';

/** Lado de un tile de terreno en el atlas final. */
export const TERRAIN_SIZE = 128;
/** Lado máximo de un sprite de criatura. */
export const SPRITE_SIZE = 256;
/** Lado de un icono de recurso. */
export const ICON_SIZE = 64;

export async function processTerrain(input: string, output: string): Promise<void> {
  await sharp(input)
    .resize(TERRAIN_SIZE, TERRAIN_SIZE, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: true })
    .toFile(output);
}

/**
 * Recorta el sprite a su contenido y lo encaja en un lienzo cuadrado.
 * `trim` usa el alfa, así que exige que el modelo haya devuelto transparencia.
 */
export async function processSprite(
  input: string,
  output: string,
  size = SPRITE_SIZE,
): Promise<void> {
  const recortado = await sharp(input)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .toBuffer()
    .catch(async () => {
      // Si no hay nada que recortar (imagen uniforme), se usa tal cual en vez
      // de reventar: es un aviso de que el fondo no salió transparente.
      console.warn(`  [aviso] no se pudo recortar ${input}: ¿fondo opaco?`);
      return sharp(input).ensureAlpha().toBuffer();
    });

  await sharp(recortado)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(output);
}

export async function imageInfo(path: string): Promise<{ width: number; height: number; bytes: number }> {
  const meta = await sharp(path).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0, bytes: meta.size ?? 0 };
}

/** Lado máximo de un edificio del castillo. */
export const BUILDING_SIZE = 256;

/**
 * Edificio: recortado a su contenido y SIN encajar en un cuadrado.
 *
 * Un lienzo cuadrado con relleno transparente dejaría al edificio flotando
 * sobre el solar, porque el renderizador lo apoya por su borde inferior y ese
 * borde sería aire.
 */
export async function processBuilding(input: string, output: string): Promise<void> {
  const recortado = await sharp(input)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .toBuffer()
    .catch(async () => {
      console.warn(`  [aviso] no se pudo recortar ${input}: ¿fondo opaco?`);
      return sharp(input).ensureAlpha().toBuffer();
    });

  // Paletizado: un edificio pintado a 256 px no se distingue con 256 colores y
  // pesa la cuarta parte. Treinta edificios en PNG completo eran 3,6 MB.
  await sharp(recortado)
    .resize(BUILDING_SIZE, BUILDING_SIZE, { fit: 'inside', withoutEnlargement: false })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(output);
}

/** Fondo de castillo: sin alfa y en JPEG, que un cielo pintado en PNG pesa. */
export async function processScene(input: string, output: string): Promise<void> {
  await sharp(input)
    .resize(1024, 576, { fit: 'cover' })
    .jpeg({ quality: 82 })
    .toFile(output);
}
