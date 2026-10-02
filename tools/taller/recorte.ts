/**
 * El halo que deja la herramienta de imágenes de ChatGPT, y cómo se quita.
 *
 * Aunque se le pida fondo transparente, devuelve el cuerpo con alfa 240-254 en
 * vez de 255 —se ve el suelo a través del personaje— y un borde de píxeles con
 * alfa bajo alrededor. Pedírselo otra vez no lo arregla (probado), así que se
 * hace aquí, en dos pasos:
 *
 *  1. **Relleno desde los bordes** por los píxeles casi transparentes: lo que
 *     está conectado con el borde de la imagen y tiene alfa bajo es halo, y
 *     pasa a 0. Y también las **bolsas encerradas** —el hueco entre el brazo,
 *     la espada y el costado—, que el relleno desde fuera no alcanza y dejaban
 *     una película visible (medido en el primer atlas: 938 píxeles sueltos). Se
 *     distinguen del canto antialiasado por su área, no por su alfa.
 *  2. **El cuerpo se vuelve opaco**: lo que supera el umbral alto sube a 255.
 *     El canto antialiasado, entre los dos umbrales, se queda como está.
 *
 * Si la imagen llega SIN alfa (fondo plano pintado), cae a `cutoutBackground`.
 */
import sharp from 'sharp';
import { cutoutBackground } from '../gen/cutout.js';

export interface UmbralesDeHalo {
  /** Por debajo, y conectado al borde, es halo. */
  readonly halo: number;
  /** Por encima, es cuerpo y se vuelve opaco. */
  readonly cuerpo: number;
}
export const UMBRALES: UmbralesDeHalo = { halo: 96, cuerpo: 200 };

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

/** Qué parte de la imagen ya es transparente: decide si hay alfa de verdad. */
export function fraccionTransparente(r: Raster): number {
  let n = 0;
  for (let i = 3; i < r.data.length; i += 4) if ((r.data[i] as number) < 8) n++;
  return n / (r.width * r.height);
}

/**
 * Las bolsas de alfa bajo de al menos este área son fondo encerrado, no canto.
 * Un canto antialiasado es una banda de 1-2 píxeles pegada al cuerpo; el hueco
 * entre el brazo, la espada y el costado es una superficie.
 */
const BOLSA_MINIMA = 12;

/** Quita el halo de una imagen que ya trae alfa. Muta y devuelve el mismo raster. */
export function quitarHalo(r: Raster, u: UmbralesDeHalo = UMBRALES): Raster {
  const { data, width, height } = r;
  const tenue = (i: number): boolean => (data[i * 4 + 3] as number) < u.halo;
  // 0: sin visitar; 1: halo (fuera o bolsa); 2: tenue pero canto pequeño.
  const marca = new Uint8Array(width * height);
  const pila: number[] = [];
  const grupo: number[] = [];

  /** Rellena la componente tenue de `inicio` y devuelve sus píxeles. */
  const rellenar = (inicio: number): number[] => {
    grupo.length = 0;
    marca[inicio] = 3;
    pila.push(inicio);
    while (pila.length > 0) {
      const i = pila.pop() as number;
      grupo.push(i);
      const x = i % width;
      const y = (i - x) / width;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        y > 0 ? i - width : -1,
        y < height - 1 ? i + width : -1,
      ]) {
        if (j >= 0 && marca[j] === 0 && tenue(j)) {
          marca[j] = 3;
          pila.push(j);
        }
      }
    }
    return grupo;
  };

  // 1. Desde los bordes: todo lo tenue conectado con el exterior es halo.
  const bordes: number[] = [];
  for (let x = 0; x < width; x++) bordes.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) bordes.push(y * width, y * width + width - 1);
  for (const i of bordes) {
    if (marca[i] === 0 && tenue(i)) for (const j of rellenar(i)) marca[j] = 1;
  }
  // 2. Las bolsas encerradas: fondo que el relleno desde fuera no alcanza.
  for (let i = 0; i < width * height; i++) {
    if (marca[i] !== 0 || !tenue(i)) continue;
    const g = rellenar(i);
    const valor = g.length >= BOLSA_MINIMA ? 1 : 2;
    for (const j of g) marca[j] = valor;
  }
  for (let i = 0; i < width * height; i++) {
    if (marca[i] === 1) {
      data[i * 4 + 3] = 0;
    } else if ((data[i * 4 + 3] as number) >= u.cuerpo) {
      data[i * 4 + 3] = 255;
    }
  }
  return r;
}

/**
 * El recorte completo: con alfa, se quita el halo; sin alfa (menos de un 5 %
 * transparente), se recorta el fondo plano desde los bordes y después el halo.
 */
export async function recortar(entrada: Buffer): Promise<Raster> {
  let r = await aRaster(entrada);
  if (fraccionTransparente(r) < 0.05) {
    r = await aRaster(await cutoutBackground(entrada, { tolerance: 28 }));
  }
  return quitarHalo(r);
}
