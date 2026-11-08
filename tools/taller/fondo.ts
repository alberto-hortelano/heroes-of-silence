/**
 * Recorte del fondo por relleno desde los bordes.
 *
 * Los modelos de edición devuelven el atlas sobre un fondo gris plano, no
 * transparente. Quitarlo por umbral de color se come las partes claras del
 * personaje —un sombrero beige desaparece—, así que se hace por conectividad:
 * solo es fondo lo que toca el borde de la imagen Y tiene el color del fondo.
 * Un hueco claro rodeado de personaje se conserva.
 */
import sharp from 'sharp';

interface CutoutOptions {
  /** Cuánto puede alejarse un píxel del color de fondo y seguir siéndolo. */
  readonly tolerance?: number;
  /** Píxeles de desvanecido en el borde, para que no quede aserrado. */
  readonly feather?: number;
  /**
   * Color de fondo [r,g,b]. Conviene pasarlo cuando se recorta UNA CELDA de un
   * atlas: si el personaje toca el borde de su celda, las esquinas de esa
   * celda no son fondo y adivinarlo ahí da un color equivocado. (Lo medía en el
   * atlas entero `detectBackgroundColor`, que se borró sin lector en la fase D de
   * la reorganización, 08-11-2026: hoy nadie lo pasa.)
   */
  readonly backgroundColor?: readonly [number, number, number];
}

export async function cutoutBackground(
  input: Buffer,
  options: CutoutOptions = {},
): Promise<Buffer> {
  const tolerance = options.tolerance ?? 32;
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const px = (x: number, y: number): number => (y * width + x) * channels;

  // Color de fondo: el que digan, o la mediana de las cuatro esquinas.
  const fondo =
    options.backgroundColor ??
    (() => {
      const esquinas = [
        px(0, 0),
        px(width - 1, 0),
        px(0, height - 1),
        px(width - 1, height - 1),
      ].map((i) => [data[i] as number, data[i + 1] as number, data[i + 2] as number]);
      return [0, 1, 2].map((c) => {
        const vals = esquinas.map((e) => e[c] as number).sort((a, b) => a - b);
        return Math.round(((vals[1] as number) + (vals[2] as number)) / 2);
      });
    })();

  const esFondo = (i: number): boolean =>
    Math.abs((data[i] as number) - (fondo[0] as number)) <= tolerance &&
    Math.abs((data[i + 1] as number) - (fondo[1] as number)) <= tolerance &&
    Math.abs((data[i + 2] as number) - (fondo[2] as number)) <= tolerance;

  // Relleno por difusión desde todos los píxeles del borde.
  const visto = new Uint8Array(width * height);
  const cola: number[] = [];
  const encolar = (x: number, y: number): void => {
    const idx = y * width + x;
    if (visto[idx] === 1) return;
    if (!esFondo(idx * channels)) return;
    visto[idx] = 1;
    cola.push(idx);
  };

  for (let x = 0; x < width; x++) {
    encolar(x, 0);
    encolar(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    encolar(0, y);
    encolar(width - 1, y);
  }

  while (cola.length > 0) {
    const idx = cola.pop() as number;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) encolar(x - 1, y);
    if (x < width - 1) encolar(x + 1, y);
    if (y > 0) encolar(x, y - 1);
    if (y < height - 1) encolar(x, y + 1);
  }

  for (let i = 0; i < width * height; i++) {
    if (visto[i] === 1) data[i * channels + 3] = 0;
  }

  const recortado = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();

  // Un desenfoque mínimo solo del alfa suaviza el borde del recorte.
  const feather = options.feather ?? 0;
  if (feather <= 0) return recortado;
  const alfa = await sharp(recortado).extractChannel(3).blur(feather).toBuffer();
  return sharp(recortado).joinChannel(alfa).png().toBuffer();
}
