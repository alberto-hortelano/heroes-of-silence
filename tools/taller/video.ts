/**
 * Transferencia de movimiento (las pruebas del 10-10-2026): en vez de pintar
 * la hoja de una vez, cada acción de la hoja A se hace con un modelo de vídeo
 * que mueve al personaje con el movimiento del maniquí (Wan 2.2 Animate Move,
 * Kling Motion Control). Por cada acción y dirección:
 *
 *   1. el vídeo del maniquí: su clip a 12 fps, encuadrado en 16:9 sobre gris;
 *   2. la imagen del personaje: su figura del giro en esa dirección, igual encuadrada;
 *   3. el modelo devuelve el vídeo del personaje con ese movimiento;
 *   4. de él salen los siete fotogramas de la fila (los mismos instantes que
 *      muestrea la hoja del maniquí, `poses.json`).
 *
 * Las tres filas se componen en una hoja sobre gris, que el taller trata como el
 * crudo de cualquier otro motor: recorte del fondo, empaquetado contra el
 * maniquí y atlas.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA, HOJAS_DE_FIGURA, NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import { type FilaDePose, OCHO_DIRECCIONES } from '../art/poses.js';
import { FalClient } from '../gen/fal.js';
import type { Generacion } from './codex.js';
import { componentes, enFilas, figuras } from './empaquetar.js';
import type { Encargo } from './encargo.js';
import { aRaster } from './recorte.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** Dónde guarda `pnpm taller maniqui <id> --fotogramas` los fotogramas enteros de cada clip. */
export const carpetaDeFotogramas = (id: string): string => join(RAIZ, '.cache/taller/maniqui', id);

/** El fondo de los vídeos y de la imagen del personaje: el gris que el taller recorta. */
const GRIS = { r: 128, g: 128, b: 128 } as const;
/** El cuadro de los vídeos: 16:9, la figura de pie ocupando `ALTO_DE_LA_FIGURA` del alto. */
const CUADRO = { width: 1280, height: 720 } as const;
// 0,7 y no 0,8: con 0,8 los pies de la carrera de Kling tocaban el borde (d1, 10-10-2026).
const ALTO_DE_LA_FIGURA = 0.7;
/** Lo mínimo que dura un vídeo del maniquí: el clip se repite hasta llegar (Kling pide unos segundos). */
export const DURACION_MINIMA = 3;

/** Una fila de la hoja del maniquí tal como la apunta su `poses.json`. */
export type FilaDelManiqui = FilaDePose & { readonly indices: readonly number[] };

/**
 * Los fotogramas del render que forman el vídeo de una fila: su tramo (o el clip
 * entero), de ida y vuelta si la fila es en vaivén, repetido hasta durar
 * `DURACION_MINIMA` segundos a `fps`.
 */
export function secuenciaDeLaFila(
  fila: FilaDelManiqui,
  fotogramas: number,
  fps = OCHO_DIRECCIONES.fps,
): number[] {
  const [desde, hasta] =
    fila.tramo === undefined
      ? [0, fotogramas - 1]
      : (fila.tramo.map((t) => Math.round(t * fps)) as [number, number]);
  const ida = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const vuelta = fila.vaiven ? ida.slice(1, -1).reverse() : [];
  const vez = [...ida, ...vuelta];
  const fuera: number[] = [];
  while (fuera.length < DURACION_MINIMA * fps) fuera.push(...vez);
  return fuera;
}

/**
 * Dónde cae en la secuencia cada columna de la fila: el primer sitio, desde el
 * de la columna anterior, con su fotograma (en vaivén, las columnas de la vuelta
 * caen en la vuelta).
 */
export function columnasEnLaSecuencia(
  indices: readonly number[],
  secuencia: readonly number[],
): number[] {
  let desde = 0;
  return indices.map((i) => {
    const j = secuencia.indexOf(i, desde);
    if (j < 0) throw new Error(`el fotograma ${i} no está en la secuencia del vídeo`);
    desde = j;
    return j;
  });
}

/** La caja del alfa de una imagen: [x0, y0, x1, y1]. */
async function cajaDelAlfa(png: Buffer | string): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if ((data[(y * info.width + x) * 4 + 3] as number) >= 40) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) throw new Error('una imagen sin nada opaco');
  return [x0, y0, x1, y1];
}

/**
 * Pone una imagen con alfa en el cuadro de los vídeos, sobre gris: escalada por
 * `escala` y con el punto (`cx`, `pie`) de la imagen en el centro del cuadro y a
 * `pie` de su alto. Todos los fotogramas de un vídeo con la misma escala y el
 * mismo punto, para que el maniquí no salte.
 */
async function enElCuadro(
  png: Buffer | string,
  escala: number,
  cx: number,
  pie: number,
): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(png).metadata();
  const w = Math.max(1, Math.round(width * escala));
  const h = Math.max(1, Math.round(height * escala));
  const img = await sharp(png).resize(w, h).png().toBuffer();
  const left = Math.round(CUADRO.width / 2 - cx * escala);
  const top = Math.round(CUADRO.height * (0.5 + ALTO_DE_LA_FIGURA / 2) - pie * escala);
  // Lo que se sale del cuadro se recorta: sharp no compone fuera de él.
  const ex = { l: Math.max(0, -left), t: Math.max(0, -top) };
  const recortada = await sharp(img)
    .extract({
      left: ex.l,
      top: ex.t,
      width: Math.min(w - ex.l, CUADRO.width - Math.max(0, left)),
      height: Math.min(h - ex.t, CUADRO.height - Math.max(0, top)),
    })
    .png()
    .toBuffer();
  return sharp({ create: { ...CUADRO, channels: 3, background: GRIS } })
    .composite([{ input: recortada, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();
}

/**
 * El vídeo del maniquí de una fila en una dirección: sus fotogramas del render
 * (`--fotogramas`), con la escala y el encuadre del reposo, a 12 fps, en MP4.
 */
export async function videoDelManiqui(
  id: string,
  fila: FilaDelManiqui,
  d: number,
  destino: string,
): Promise<{ ruta: string; secuencia: number[] }> {
  const dir = join(carpetaDeFotogramas(id), fila.anim);
  if (!existsSync(join(dir, 'meta.json')))
    throw new Error(
      `faltan los fotogramas de «${fila.anim}»: pnpm taller maniqui ${id} --fotogramas`,
    );
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as {
    frame_count: number;
  };
  const secuencia = secuenciaDeLaFila(fila, meta.frame_count);
  const fichero = (f: number) => join(dir, `dir_${d}_frame_${String(f).padStart(3, '0')}.png`);
  // La escala, del alto del maniquí de pie; el punto, el centro de la caja del primer fotograma.
  const [x0, , x1, y1] = await cajaDelAlfa(fichero(secuencia[0] as number));
  const escala = (CUADRO.height * ALTO_DE_LA_FIGURA) / OCHO_DIRECCIONES.altoDelManiqui;
  const temporal = await mkdtemp(join(tmpdir(), 'video-maniqui-'));
  try {
    for (const [k, f] of secuencia.entries())
      await writeFile(
        join(temporal, `f_${String(k).padStart(4, '0')}.png`),
        await enElCuadro(fichero(f), escala, (x0 + x1) / 2, y1),
      );
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(OCHO_DIRECCIONES.fps),
      '-i',
      join(temporal, 'f_%04d.png'),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '16',
      destino,
    ]);
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
  return { ruta: destino, secuencia };
}

/**
 * La imagen del personaje en una dirección: su figura del giro (la lámina de 4×2
 * en el orden de `NOMBRES_DE_DIRECCION`), en el cuadro de los vídeos y a la
 * altura del maniquí.
 */
export async function imagenDelPersonaje(id: string, d: number): Promise<Buffer> {
  // El giro va recortado a su contenido, no en una rejilla exacta: sus ocho
  // figuras se buscan como las de cualquier hoja (dos filas de cuatro).
  const giro = await readFile(join(RAIZ, 'assets/unidades', id, 'giro.webp'));
  const r = await aRaster(giro);
  const c = enFilas(figuras(componentes(r), 2), 2, 4)[Math.floor(d / 4)]?.[d % 4];
  if (c === undefined) throw new Error(`${id}: el giro no tiene la figura de la dirección ${d}`);
  const figura = await sharp(giro)
    .extract({ left: c.x0, top: c.y0, width: c.x1 - c.x0 + 1, height: c.y1 - c.y0 + 1 })
    .png()
    .toBuffer();
  const alto = c.y1 - c.y0 + 1;
  return enElCuadro(
    figura,
    (CUADRO.height * ALTO_DE_LA_FIGURA) / alto,
    (c.x1 - c.x0) / 2,
    alto - 1,
  );
}

/** Los fotogramas de un vídeo, en PNG, en orden. */
async function fotogramasDelVideo(video: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'video-salida-'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, join(dir, 'f_%04d.png')]);
  return (await readdir(dir)).sort().map((f) => join(dir, f));
}

type Motor = NonNullable<Encargo['motor']>;

/** Lo que identifica un fichero subido en la clave de la caché: su sha256. */
const huella = (bytes: Buffer): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** El coste de un vídeo de `segundos`: el del motor es por segundo. */
export const costeDelVideo = (motor: Motor, segundos: number): number =>
  Math.round(motor.coste * segundos * 1000) / 1000;

/** La entrada del endpoint de vídeo de un motor: el vídeo del maniquí, la imagen y sus `params`. */
export function cargaDeVideo(motor: Motor, video: string, imagen: string): Record<string, unknown> {
  return { video_url: video, image_url: imagen, ...motor.params };
}

/**
 * Pinta la hoja A de un encargo con un motor de vídeo: una llamada por acción,
 * los siete fotogramas de cada una en su fila, y la hoja compuesta sobre gris en
 * la caché de fal como crudo.
 */
export async function generarConVideo(encargo: Encargo): Promise<Generacion> {
  const motor = encargo.motor;
  const ocho = encargo.ocho;
  if (motor === undefined || ocho === undefined)
    throw new Error(`${encargo.id}: un encargo de vídeo lleva motor y ocho`);
  const id = encargo.salida.split('/').at(-3) as string;
  const d = ocho.direccion;
  const poses = JSON.parse(
    await readFile(join(RAIZ, 'assets/unidades/_poses/unidades', `${id}-8d`, 'poses.json'), 'utf8'),
  ) as { sheets: Record<string, FilaDelManiqui[]> };
  const filas = poses.sheets[ocho.hoja];
  if (filas === undefined) throw new Error(`${id}: su maniquí no tiene la hoja ${ocho.hoja}`);
  const cliente = new FalClient({
    cacheDir: join(RAIZ, 'tools/gen/.cache'),
    spendFile: join(RAIZ, 'tools/gen/spend.json'),
    budgetUsd: Number(process.env.TALLER_FAL_TOPE ?? '20'),
    ...(process.env.TALLER_FAL_ENV === undefined ? {} : { envPath: process.env.TALLER_FAL_ENV }),
  });
  // Los endpoints de vídeo quieren URLs: se suben; la caché va por el contenido.
  const bytesDeLaImagen = await imagenDelPersonaje(id, d);
  const imagen = await cliente.subir(bytesDeLaImagen, 'image/png', `${id}-d${d}-personaje.png`);
  const lado = CUADRO.height;
  const temporal = await mkdtemp(join(tmpdir(), 'video-hoja-'));
  const capas: { input: Buffer; left: number; top: number }[] = [];
  let claves = '';
  let coste = 0;
  try {
    for (const [f, fila] of filas.entries()) {
      const { ruta, secuencia } = await videoDelManiqui(
        id,
        fila,
        d,
        join(temporal, `${fila.clip}.mp4`),
      );
      const bytesDelVideo = await readFile(ruta);
      const paraLaClave = cargaDeVideo(motor, huella(bytesDelVideo), huella(bytesDeLaImagen));
      const carga = cargaDeVideo(
        motor,
        await cliente.subir(bytesDelVideo, 'video/mp4', `${id}-d${d}-${fila.clip}.mp4`),
        imagen,
      );
      const segundos = secuencia.length / OCHO_DIRECCIONES.fps;
      const intento = motor.intento === undefined ? '' : `intento-${motor.intento}`;
      const salida = await cliente.fichero(
        motor.endpoint,
        carga,
        costeDelVideo(motor, segundos),
        `${encargo.id} ${fila.clip}`,
        (r) => (r.video as { url?: string } | undefined)?.url,
        'mp4',
        intento,
        paraLaClave,
      );
      claves += `${FalClient.key(motor.endpoint, paraLaClave, intento)} `;
      coste += costeDelVideo(motor, segundos);
      const fotos = await fotogramasDelVideo(salida.path);
      // El vídeo de salida puede tener otro número de fotogramas: se llevan por el tiempo.
      for (const [col, j] of columnasEnLaSecuencia(fila.indices, secuencia).entries()) {
        const k = Math.min(fotos.length - 1, Math.round((j * fotos.length) / secuencia.length));
        // El cuadrado central del fotograma, que es donde está la figura.
        const foto = await sharp(fotos[k] as string)
          .resize(CUADRO.width, CUADRO.height, { fit: 'fill' })
          .extract({ left: (CUADRO.width - lado) / 2, top: 0, width: lado, height: lado })
          .png()
          .toBuffer();
        capas.push({ input: foto, left: col * lado, top: f * lado });
      }
    }
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
  const hoja = await sharp({
    create: {
      width: FIGURA.columnas * lado,
      height: HOJAS_DE_FIGURA[ocho.hoja].length * lado,
      channels: 3,
      background: GRIS,
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
  const crudo = join(
    RAIZ,
    'tools/gen/.cache',
    `hoja-${encargo.id}${motor.intento ? `-${motor.intento}` : ''}.png`,
  );
  await mkdir(join(RAIZ, 'tools/gen/.cache'), { recursive: true });
  await writeFile(crudo, hoja);
  return {
    hilo: `fal:${claves.trim()}`,
    crudo,
    mensaje: `${motor.endpoint}, ${filas.length} vídeos (${NOMBRES_DE_DIRECCION[d]})`,
    coste: Math.round(coste * 1000) / 1000,
  };
}
