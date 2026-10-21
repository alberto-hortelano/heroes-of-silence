/**
 * El paso de una tirada de muralla de norte a sur (`muro-ns-1`, `muro-ns-2`,
 * §29): cuánto se corre cada pieza respecto de la de delante para que las dos
 * se lean como un solo muro.
 *
 * Cada pieza es un tramo entero con su testero delantero —el bloque de piedra
 * con almenas que cierra el adarve—, y el arte no va recto hacia el fondo: se
 * aleja hacia arriba y algo a la derecha, y con algo de escorzo (las almenas de
 * delante, más separadas). Puestas una detrás de otra en la misma columna, la de
 * atrás enseñaba su testero a media tirada y el muro se leía partido por el
 * medio (queja del usuario, 21-10-2026). Corrida por su paso, el testero de la
 * de atrás cae dentro de la de delante, que se pinta encima y lo tapa, y sus
 * almenas siguen a las de la de delante donde esta acaba.
 *
 * El paso se busca, no se escribe: el corrimiento `(dx, dy)` con que la pieza de
 * atrás casa mejor con la de delante en lo alto de esta (el cabo que asoma), en
 * color y en silueta. Lo lleva el JSON de la pieza (`tirada`), lo lee el
 * catálogo (`Pieza.tirada`) y lo vuelve a derivar `test/arte-hojas.test.ts`.
 *
 *   pnpm taller derivar-muros            los dos, desde su imagen
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { derivarPieza, type PiezaDerivada } from './derivar.js';

const RAIZ = join(import.meta.dirname, '../..');

/** Las piezas de norte a sur, las que llevan su paso. */
export const MUROS_NORTE_SUR = ['muro-ns-1', 'muro-ns-2'] as const;

/** Lo que cuenta como opaco al comparar. */
const OPACO = 200;

/**
 * Lo alto de la pieza de delante donde se mide, en fracción de su alto opaco:
 * el cabo de atrás, que es lo que asoma de la tirada y donde la de atrás toma
 * el relevo.
 */
const CABO = 0.23;

/** Dónde se busca el paso: de qué fracción del alto opaco a cuál, y su corrimiento a la derecha en veces el paso. */
const PASO_MINIMO = 0.19;
const PASO_MAXIMO = 0.38;
const SESGO_MINIMO = 0.15;
const SESGO_MAXIMO = 0.35;

/** Cuánto se reduce la imagen en la primera pasada, y el margen de la segunda, a tamaño entero. */
const REDUCCION = 4;
const AFINADO = REDUCCION + 1;

/** Lo que pesa la silueta que no casa frente al color: 100 puntos por cada píxel de la silueta de más. */
const PESO_DE_LA_SILUETA = 100;

interface Imagen {
  readonly ancho: number;
  readonly alto: number;
  readonly rgb: Float32Array;
  readonly opaco: Uint8Array;
}

async function leer(ruta: string, reduccion: number): Promise<Imagen> {
  const base = sharp(ruta).ensureAlpha();
  const meta = await sharp(ruta).metadata();
  const ancho = Math.floor((meta.width as number) / reduccion);
  const alto = Math.floor((meta.height as number) / reduccion);
  const { data } = await (reduccion === 1
    ? base
    : base.resize(ancho, alto, { kernel: 'cubic', fit: 'fill' })
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = new Float32Array(ancho * alto * 3);
  const opaco = new Uint8Array(ancho * alto);
  for (let i = 0; i < ancho * alto; i++) {
    rgb[i * 3] = data[i * 4] as number;
    rgb[i * 3 + 1] = data[i * 4 + 1] as number;
    rgb[i * 3 + 2] = data[i * 4 + 2] as number;
    opaco[i] = (data[i * 4 + 3] as number) > OPACO ? 1 : 0;
  }
  return { ancho, alto, rgb, opaco };
}

/** La primera y la última fila con algo opaco. */
function filasOpacas(im: Imagen): readonly [number, number] {
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < im.alto; y++)
    for (let x = 0; x < im.ancho; x++)
      if (im.opaco[y * im.ancho + x] === 1) {
        if (y0 < 0) y0 = y;
        y1 = y;
        break;
      }
  if (y0 < 0) throw new Error('el tramo de norte a sur no tiene nada opaco');
  return [y0, y1];
}

/**
 * Cuánto desentona la pieza de atrás, corrida `(dx, −s)`, con la de delante en
 * su cabo (`desde`, `filas`): la diferencia media de color donde las dos son
 * opacas más la silueta que no casa. Menos es mejor.
 */
function desajuste(im: Imagen, desde: number, filas: number, s: number, dx: number): number {
  let color = 0;
  let ambas = 0;
  let distintas = 0;
  for (let y = desde; y < desde + filas; y++) {
    const yAtras = y + s;
    if (yAtras >= im.alto) return Number.POSITIVE_INFINITY;
    for (let x = 0; x < im.ancho; x++) {
      const delante = im.opaco[y * im.ancho + x] as number;
      const xAtras = x - dx;
      const atras = xAtras < 0 ? 0 : (im.opaco[yAtras * im.ancho + xAtras] as number);
      if (delante !== atras) distintas++;
      else if (delante === 1) {
        ambas++;
        const i = (y * im.ancho + x) * 3;
        const j = (yAtras * im.ancho + xAtras) * 3;
        color +=
          Math.abs((im.rgb[i] as number) - (im.rgb[j] as number)) +
          Math.abs((im.rgb[i + 1] as number) - (im.rgb[j + 1] as number)) +
          Math.abs((im.rgb[i + 2] as number) - (im.rgb[j + 2] as number));
      }
    }
  }
  if (ambas === 0) return Number.POSITIVE_INFINITY;
  return color / ambas + (PESO_DE_LA_SILUETA * distintas) / ambas;
}

/** El mejor `(dx, s)` entre los candidatos, con el primero en caso de empate: el orden es fijo. */
function mejor(
  im: Imagen,
  candidatos: Iterable<readonly [number, number]>,
): readonly [number, number] {
  const [y0, y1] = filasOpacas(im);
  const filas = Math.round((y1 - y0 + 1) * CABO);
  let elegido: readonly [number, number] | undefined;
  let menor = Number.POSITIVE_INFINITY;
  for (const [dx, s] of candidatos) {
    const d = desajuste(im, y0, filas, s, dx);
    if (d < menor) {
      menor = d;
      elegido = [dx, s];
    }
  }
  if (elegido === undefined) throw new Error('no hay paso con el que la tirada case');
  return elegido;
}

/**
 * El paso de la tirada de una pieza de norte a sur, en píxeles de su imagen:
 * `[dx, dy]`, lo que se corre la pieza de atrás respecto de la de delante
 * (`dy` < 0: hacia arriba). Primero en la imagen reducida y luego, alrededor,
 * a tamaño entero.
 */
export async function pasoDeLaTirada(ruta: string): Promise<readonly [number, number]> {
  const chica = await leer(ruta, REDUCCION);
  const [c0, c1] = filasOpacas(chica);
  const altoChico = c1 - c0 + 1;
  const gruesos: [number, number][] = [];
  for (let s = Math.round(altoChico * PASO_MINIMO); s <= Math.round(altoChico * PASO_MAXIMO); s++)
    for (let dx = Math.floor(s * SESGO_MINIMO); dx <= Math.ceil(s * SESGO_MAXIMO); dx++)
      gruesos.push([dx, s]);
  const [gx, gs] = mejor(chica, gruesos);
  const entera = await leer(ruta, 1);
  const finos: [number, number][] = [];
  for (let s = gs * REDUCCION - AFINADO; s <= gs * REDUCCION + AFINADO; s++)
    for (let dx = gx * REDUCCION - AFINADO; dx <= gx * REDUCCION + AFINADO; dx++)
      finos.push([dx, s]);
  const [dx, s] = mejor(entera, finos);
  return [dx, -s];
}

/** El JSON entero de un tramo de norte a sur: el de cualquier pieza con su `tirada`. */
export async function muroDerivado(ruta: string): Promise<
  Omit<PiezaDerivada, 'derivadoPor'> & {
    readonly derivadoPor: 'tools/taller/muros.ts';
    readonly tirada: readonly [number, number];
  }
> {
  return {
    ...(await derivarPieza(ruta)),
    derivadoPor: 'tools/taller/muros.ts',
    tirada: await pasoDeLaTirada(ruta),
  };
}

/** Reescribe el JSON de cada tramo de norte a sur y devuelve las rutas. */
export async function escribirMurosDerivados(): Promise<string[]> {
  const hechos: string[] = [];
  for (const id of MUROS_NORTE_SUR) {
    const ruta = join(RAIZ, 'assets/mapa', `${id}.webp`);
    const json = ruta.replace(/\.webp$/, '.json');
    await mkdir(dirname(json), { recursive: true });
    await writeFile(json, `${JSON.stringify(await muroDerivado(ruta), null, 2)}\n`);
    hechos.push(json);
  }
  return hechos;
}
