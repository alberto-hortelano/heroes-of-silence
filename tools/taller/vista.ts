/**
 * Láminas de revisión de un lote: lo que se le enseña al usuario ANTES de
 * engancharlo al juego (los ids todavía no existen en el catálogo).
 *
 *   pnpm taller vista templario-escudo templario-mandoble …
 *
 * Escribe en `.cache/taller/vista/`:
 *  - `lote.png`: cada unidad sobre `campo.webp`, al tamaño al que la pinta la
 *    batalla, con la sombra del contrato de luz (`sombraDeFigura`), mirando a
 *    la derecha y espejada a la izquierda, como atacante y defensor;
 *  - `<id>.webp`: animado, reposo, marcha y ataque a su reloj, en los dos
 *    sentidos. Una fila de poses parecidas no es un ciclo de marcha: se revisa
 *    reproduciéndolo, no mirando la hoja.
 *
 * Que la lámina se vea bien NO es la aceptación: la aceptación es del usuario,
 * con capturas del juego cuando las unidades existan.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { sombraDeFigura } from '../../src/shared/arte.js';
import type { AtlasDerivado } from './derivar.js';

const RAIZ = resolve(import.meta.dirname, '../..');
export const DIR_VISTA = join(RAIZ, '.cache/taller/vista');
/** Alto en pantalla de una figura adulta en la batalla (≈ 0,95 × el paso del tablero). */
const ALTO_EN_JUEGO = 132;

interface Hoja {
  readonly id: string;
  readonly png: Buffer;
  readonly atlas: AtlasDerivado;
}

async function cargar(id: string): Promise<Hoja> {
  const dir = join(RAIZ, 'assets/unidades', id);
  const atlas = JSON.parse(await readFile(join(dir, 'atlas.json'), 'utf8')) as AtlasDerivado;
  const png = await sharp(await readFile(join(dir, 'atlas.webp')))
    .png()
    .toBuffer();
  return { id, png, atlas };
}

/** Un fotograma recortado y escalado como lo dibuja `drawCharacter`: la celda a `escala`. */
async function fotograma(
  h: Hoja,
  clip: keyof AtlasDerivado['clips'],
  i: number,
  escala: number,
  espejo: boolean,
): Promise<{ img: Buffer; ancla: [number, number]; lado: number }> {
  const { cell } = h.atlas;
  const c = h.atlas.clips[clip];
  const lado = Math.round(cell * escala);
  let img = sharp(h.png)
    .extract({ left: i * cell, top: c.row * cell, width: cell, height: cell })
    .resize(lado, lado);
  if (espejo) img = img.flop();
  const ax = espejo ? cell - c.anchor[0] : c.anchor[0];
  return {
    img: await img.png().toBuffer(),
    ancla: [Math.round(ax * escala), Math.round(c.anchor[1] * escala)],
    lado,
  };
}

/** La sombra de suelo de una figura, como la pinta la batalla: elipse desplazada según la luz. */
function sombra(x: number, suelo: number, alto: number): OverlayOptions {
  const s = sombraDeFigura(alto);
  const rx = alto * 0.36;
  const ry = rx * 0.42;
  const w = Math.ceil(rx * 2 + Math.abs(s.x) + 4);
  const h = Math.ceil(ry * 2 + Math.abs(s.y) + 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${rx + 2 + s.x * 0.35}" cy="${ry + 2 + s.y * 0.2}" rx="${rx}" ry="${ry}" fill="black" fill-opacity="${s.opacidad + 0.12}"/></svg>`;
  return { input: Buffer.from(svg), left: Math.round(x - rx - 2), top: Math.round(suelo - ry - 2) };
}

async function lamina(hojas: readonly Hoja[]): Promise<Buffer> {
  const ancho = 260 * hojas.length + 120;
  const alto = 520;
  const campo = await sharp(join(RAIZ, 'assets/rpg/campo.webp'))
    .resize(ancho, Math.round(alto * 1.9), { fit: 'cover' })
    .extract({ left: 0, top: Math.round(alto * 0.8), width: ancho, height: alto })
    .png()
    .toBuffer();
  const capas: OverlayOptions[] = [];
  for (const [n, h] of hojas.entries()) {
    const escala = ALTO_EN_JUEGO / 160;
    for (const [fila, espejo] of [false, true].entries()) {
      const x = 120 + n * 260 + (espejo ? 90 : 0);
      const suelo = 230 + fila * 230;
      const f = await fotograma(h, 'idle', 0, escala, espejo);
      capas.push(sombra(x, suelo, h.atlas.altura * escala));
      capas.push({ input: f.img, left: x - f.ancla[0], top: suelo - f.ancla[1] });
    }
  }
  return sharp(campo).composite(capas).png().toBuffer();
}

/** Los tres clips en bucle, en los dos sentidos, como un WebP animado de 12 fps. */
async function animacion(h: Hoja): Promise<Buffer> {
  const FPS = 12;
  const DUR = 2; // segundos
  const clips = ['idle', 'walk', 'attack'] as const;
  const W = 3 * 200;
  const H = 2 * 230;
  const escala = 1;
  const paginas: Buffer[] = [];
  for (let t = 0; t < FPS * DUR; t++) {
    const capas: OverlayOptions[] = [];
    for (const [k, clip] of clips.entries()) {
      const c = h.atlas.clips[clip];
      const i = c.loop
        ? Math.floor((t / FPS) * c.fps) % c.frames
        : Math.min(c.frames - 1, Math.floor(((t % FPS) / FPS) * c.fps));
      for (const [fila, espejo] of [false, true].entries()) {
        const f = await fotograma(h, clip, i, escala * 0.82, espejo);
        const x = 100 + k * 200;
        const suelo = 210 + fila * 230;
        capas.push(sombra(x, suelo, h.atlas.altura * 0.82));
        capas.push({ input: f.img, left: x - f.ancla[0], top: suelo - f.ancla[1] });
      }
    }
    paginas.push(
      await sharp({ create: { width: W, height: H, channels: 4, background: '#6f7550' } })
        .composite(capas)
        .raw()
        .toBuffer(),
    );
  }
  return sharp(Buffer.concat(paginas), {
    raw: { width: W, height: H * paginas.length, channels: 4, pageHeight: H },
  })
    .webp({ quality: 85, loop: 0, delay: Array(paginas.length).fill(Math.round(1000 / FPS)) })
    .toBuffer();
}

export async function vista(ids: readonly string[]): Promise<string[]> {
  await mkdir(DIR_VISTA, { recursive: true });
  const hojas = await Promise.all(ids.map(cargar));
  const fuera = [join(DIR_VISTA, 'lote.png')];
  await writeFile(fuera[0] as string, await lamina(hojas));
  for (const h of hojas) {
    const r = join(DIR_VISTA, `${h.id}.webp`);
    await writeFile(r, await animacion(h));
    fuera.push(r);
  }
  return fuera;
}
