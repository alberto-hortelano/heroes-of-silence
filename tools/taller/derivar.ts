/**
 * El JSON de una hoja se DERIVA de la imagen; no se escribe a mano (#120).
 *
 *   pnpm taller derivar assets/unidades/templario-escudo/atlas.webp
 *
 * Mide, sobre el canal alfa de cada celda:
 *  - el **ancla** de cada clip: el punto de apoyo (mediana de x del tronco, fila
 *    más baja; ver `empaquetar.apoyoEn`), y la mediana entre sus fotogramas;
 *  - la **altura** de la figura: la caja del alfa del primer fotograma de reposo;
 *  - los **fotogramas válidos**: se descartan por el final los vacíos y los que
 *    repiten al anterior —el maniquí repetía la sexta celda en la séptima, y
 *    eso se apuntaba a mano como `frames: 6`—;
 *  - la **caja de clic**: la unión de las cajas del reposo, relativa al ancla.
 *
 * Y apunta el sha256 de la imagen que midió: `test/taller-derivar.test.ts`
 * vuelve a derivar cada hoja y exige el mismo JSON, así que un número tocado a
 * mano —o una imagen cambiada sin volver a derivar— se pone rojo.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import sharp from 'sharp';
import { FIGURA } from '../../src/shared/arte.js';
import { ALFA_FIGURA, apoyoEn } from './empaquetar.js';

/** Las filas de una hoja del taller, en orden, con su reloj. El reloj no sale de la imagen. */
const RELOJ = {
  idle: { fps: 3, loop: true },
  walk: { fps: 8, loop: true },
  /** La carga de las monturas: la marcha con la lanza bajada, en bucle como ella. */
  charge: { fps: 8, loop: true },
  attack: { fps: 10, loop: false },
  hurt: { fps: 10, loop: false },
  /** Se queda en su último fotograma: el cadáver (`cadaver` en el JSON). */
  death: { fps: 8, loop: false },
} as const;
export type ClipDeHoja = keyof typeof RELOJ;

/**
 * Las filas de una hoja según cuántas tenga: 3 a pie (reposo, marcha, ataque) y 4
 * las monturas, que añaden la carga antes del ataque (decisión del usuario,
 * 02-10-2026). Se deduce del alto de la imagen, así que volver a derivar una hoja
 * no necesita saber de qué encargo salió.
 */
export const CLIPS_POR_FILAS: Readonly<Record<number, readonly ClipDeHoja[]>> = {
  3: ['idle', 'walk', 'attack'],
  4: ['idle', 'walk', 'charge', 'attack'],
  /**
   * Una dirección de una unidad en 8 direcciones (`OCHO_DIRECCIONES` en
   * `tools/art/poses.ts`): las 6 acciones. La muerte arranca donde acaba el daño.
   */
  6: ['idle', 'walk', 'charge', 'attack', 'hurt', 'death'],
};

export function clipsDeHoja(filas: number): { clip: ClipDeHoja; fps: number; loop: boolean }[] {
  const clips = CLIPS_POR_FILAS[filas];
  if (clips === undefined)
    throw new Error(`una hoja del taller tiene 3 o 4 filas (6 las de 8 direcciones), no ${filas}`);
  return clips.map((clip) => ({ clip, ...RELOJ[clip] }));
}

/** Umbral de alfa con el que se mide la altura: el mismo que en `personajes.ts`. */
const ALFA_ALTURA = 40;
/** Dos fotogramas son el mismo si difieren en menos de este tanto por uno del alfa. */
const REPETIDO = 0.004;

export interface ClipDerivado {
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly anchor: readonly [number, number];
}

export interface AtlasDerivado {
  readonly imagen: string;
  readonly sha256: string;
  readonly cell: number;
  readonly columns: number;
  /** De la coronilla a los pies en el primer reposo, en píxeles de la hoja. */
  readonly altura: number;
  /** Relativa al ancla del reposo: [izquierda, arriba, derecha, abajo]. */
  readonly cajaDeClic: readonly [number, number, number, number];
  readonly clips: Readonly<
    Record<'idle' | 'walk' | 'attack', ClipDerivado> &
      Partial<Record<'charge' | 'hurt' | 'death', ClipDerivado>>
  >;
  /** El fotograma que se queda en el suelo al morir, si la hoja tiene muerte. */
  readonly cadaver?: { readonly clip: 'death'; readonly frame: number };
  readonly derivadoPor: 'tools/taller/derivar.ts';
}

interface Celda {
  readonly alfa: Uint8Array;
  readonly vacia: boolean;
}

function celda(data: Buffer, ancho: number, col: number, fila: number, lado: number): Celda {
  const alfa = new Uint8Array(lado * lado);
  let vacia = true;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const a = data[((fila * lado + y) * ancho + col * lado + x) * 4 + 3] as number;
      alfa[y * lado + x] = a;
      if (a >= ALFA_FIGURA) vacia = false;
    }
  }
  return { alfa, vacia };
}

function caja(c: Celda, lado: number, umbral: number): [number, number, number, number] {
  let x0 = lado;
  let y0 = lado;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if ((c.alfa[y * lado + x] as number) < umbral) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

/** El punto de apoyo de una celda: la misma regla, y la misma función, que al empaquetar. */
function apoyoDeCelda(c: Celda, lado: number): [number, number] {
  return apoyoEn((x, y) => c.alfa[y * lado + x] as number, caja(c, lado, ALFA_FIGURA));
}

function diferencia(a: Celda, b: Celda): number {
  let d = 0;
  for (let i = 0; i < a.alfa.length; i++)
    d += Math.abs((a.alfa[i] as number) - (b.alfa[i] as number));
  return d / (a.alfa.length * 255);
}

function mediana(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

export async function derivarAtlas(rutaImagen: string): Promise<AtlasDerivado> {
  const bytes = await readFile(rutaImagen);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // La celda sale de la imagen: 256 a pie, 384 las monturas; las columnas son siempre las de FIGURA.
  const { columnas } = FIGURA;
  const lado = info.width / columnas;
  const filas = info.height / lado;
  if (!Number.isInteger(lado) || CLIPS_POR_FILAS[filas] === undefined) {
    throw new Error(
      `${rutaImagen} mide ${info.width}×${info.height}: una hoja del taller son ${columnas} columnas ` +
        'por 3 o 4 filas (6 las de 8 direcciones) de celdas cuadradas',
    );
  }

  const clips = {} as Record<string, AtlasDerivado['clips']['idle']>;
  let cajaDeClic: [number, number, number, number] | null = null;
  let altura = 0;
  for (const [fila, def] of clipsDeHoja(filas).entries()) {
    const celdas = Array.from({ length: columnas }, (_, col) =>
      celda(data, info.width, col, fila, lado),
    );
    let frames: number = columnas;
    while (frames > 0) {
      const ultima = celdas[frames - 1] as Celda;
      const previa = celdas[frames - 2];
      if (ultima.vacia || (previa !== undefined && diferencia(ultima, previa) < REPETIDO)) frames--;
      else break;
    }
    if (frames === 0)
      throw new Error(`${rutaImagen}: el clip «${def.clip}» no tiene ni un fotograma`);
    const validas = celdas.slice(0, frames);
    if (validas.some((c) => c.vacia)) {
      throw new Error(`${rutaImagen}: el clip «${def.clip}» tiene una celda vacía en medio`);
    }
    const apoyos = validas.map((c) => apoyoDeCelda(c, lado));
    // En 6 filas el ancla es UNA por dirección, la del reposo: un cuerpo que cae
    // tendido no tiene tronco a media altura, y recentrarlo lo movería de su casilla.
    const fija = filas === 6 ? clips.idle?.anchor : undefined;
    const anchor: readonly [number, number] = fija ?? [
      mediana(apoyos.map((a) => a[0])),
      mediana(apoyos.map((a) => a[1])),
    ];
    clips[def.clip] = { row: fila, frames, fps: def.fps, loop: def.loop, anchor };

    if (def.clip === 'idle') {
      const [, y0, , y1] = caja(validas[0] as Celda, lado, ALFA_ALTURA);
      altura = y1 - y0 + 1;
      const cajas = validas.map((c) => caja(c, lado, ALFA_FIGURA));
      cajaDeClic = [
        Math.min(...cajas.map((c) => c[0])) - anchor[0],
        Math.min(...cajas.map((c) => c[1])) - anchor[1],
        Math.max(...cajas.map((c) => c[2])) - anchor[0],
        Math.max(...cajas.map((c) => c[3])) - anchor[1],
      ];
    }
  }

  return {
    imagen: basename(rutaImagen),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    cell: lado,
    columns: columnas,
    altura,
    cajaDeClic: cajaDeClic as [number, number, number, number],
    clips: clips as AtlasDerivado['clips'],
    ...(clips.death === undefined
      ? {}
      : { cadaver: { clip: 'death' as const, frame: clips.death.frames - 1 } }),
    derivadoPor: 'tools/taller/derivar.ts',
  };
}

/** La ruta del JSON de una hoja: al lado, mismo nombre, `.json`. */
export function rutaDelJson(rutaImagen: string): string {
  return rutaImagen.replace(/\.(webp|png)$/, '.json');
}

export async function escribirDerivado(rutaImagen: string): Promise<AtlasDerivado> {
  const derivado = await derivarAtlas(rutaImagen);
  await writeFile(rutaDelJson(rutaImagen), `${JSON.stringify(derivado, null, 2)}\n`);
  return derivado;
}

/** El JSON de una pieza suelta del mapa: su tamaño y dónde pisa el suelo. */
export interface PiezaDerivada {
  readonly imagen: string;
  readonly sha256: string;
  readonly ancho: number;
  readonly alto: number;
  /** El centro de su base: la mediana de x de la franja más baja (15 %) y la fila más baja. */
  readonly ancla: readonly [number, number];
  readonly derivadoPor: 'tools/taller/derivar.ts';
}

export async function derivarPieza(rutaImagen: string): Promise<PiezaDerivada> {
  const bytes = await readFile(rutaImagen);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alfa = (x: number, y: number): number => data[(y * info.width + x) * 4 + 3] as number;
  let y1 = -1;
  let y0 = info.height;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (alfa(x, y) >= ALFA_FIGURA) {
        if (y < y0) y0 = y;
        y1 = y;
        break;
      }
    }
  }
  if (y1 < 0) throw new Error(`${rutaImagen} no tiene nada opaco`);
  const franja = Math.max(2, Math.round((y1 - y0 + 1) * 0.15));
  const xs: number[] = [];
  for (let y = y1 - franja + 1; y <= y1; y++) {
    for (let x = 0; x < info.width; x++) if (alfa(x, y) >= ALFA_FIGURA) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  return {
    imagen: basename(rutaImagen),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ancho: info.width,
    alto: info.height,
    ancla: [xs[Math.floor(xs.length / 2)] as number, y1],
    derivadoPor: 'tools/taller/derivar.ts',
  };
}

export async function escribirPiezaDerivada(rutaImagen: string): Promise<PiezaDerivada> {
  const d = await derivarPieza(rutaImagen);
  await writeFile(rutaDelJson(rutaImagen), `${JSON.stringify(d, null, 2)}\n`);
  return d;
}

/** El JSON de una tira de efecto: cuántos fotogramas tienen algo y la caja que ocupan todos. */
export interface EfectoDerivado {
  readonly imagen: string;
  readonly sha256: string;
  readonly celda: number;
  readonly fotogramas: number;
  /** Unión de las cajas del alfa de todos los fotogramas, dentro de una celda: [x0, y0, x1, y1]. */
  readonly caja: readonly [number, number, number, number];
  readonly derivadoPor: 'tools/taller/derivar.ts';
}

export async function derivarEfecto(rutaImagen: string): Promise<EfectoDerivado> {
  const bytes = await readFile(rutaImagen);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lado = info.height;
  if (info.width % lado !== 0) throw new Error(`${rutaImagen} no es una tira de celdas cuadradas`);
  let fotogramas = 0;
  const caja: [number, number, number, number] = [lado, lado, -1, -1];
  for (let f = 0; f < info.width / lado; f++) {
    let alguno = false;
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        if ((data[(y * info.width + f * lado + x) * 4 + 3] as number) < ALFA_FIGURA) continue;
        alguno = true;
        if (x < caja[0]) caja[0] = x;
        if (y < caja[1]) caja[1] = y;
        if (x > caja[2]) caja[2] = x;
        if (y > caja[3]) caja[3] = y;
      }
    }
    if (alguno) fotogramas++;
  }
  return {
    imagen: basename(rutaImagen),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    celda: lado,
    fotogramas,
    caja,
    derivadoPor: 'tools/taller/derivar.ts',
  };
}

export async function escribirEfectoDerivado(rutaImagen: string): Promise<EfectoDerivado> {
  const d = await derivarEfecto(rutaImagen);
  await writeFile(rutaDelJson(rutaImagen), `${JSON.stringify(d, null, 2)}\n`);
  return d;
}
