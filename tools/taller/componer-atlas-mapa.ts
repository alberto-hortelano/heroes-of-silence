/**
 * Compone `assets/rpg/map-atlas.png` con las piezas pintadas de
 * `assets/mapa/atlas/`, una por celda de 256 en una rejilla de 4×4.
 *
 *   pnpm taller componer-atlas-mapa
 *
 * Cada pieza se coloca donde estaba el objeto antiguo de su celda: con la misma
 * base y el mismo centro horizontal, y cabiendo en su misma caja. Así
 * `render/mapa.ts`, que pinta una celda entera escalada y la apoya por abajo, las
 * pone en el mismo sitio sin que haya que tocarlo. Las cajas antiguas se miden
 * sobre el atlas que se va a sustituir, así que se apuntan en el JSON de la
 * primera composición (`colocacion`) y las siguientes las reutilizan: medirlas
 * sobre el atlas ya rehecho iría encogiendo las piezas en cada pasada.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { ALFA_FIGURA } from './empaquetar.js';
import { ATLAS_ANTIGUO, CELDAS_DEL_ATLAS, CELDAS_REUTILIZADAS } from './mapa.js';

const RAIZ = resolve(import.meta.dirname, '../..');
const LADO = 256;
const COLUMNAS = 4;
const MARGEN = 4;

type Caja = readonly [number, number, number, number];

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** Caja del alfa (x0, y0, x1, y1 inclusivos) de una región. */
async function cajaDe(imagen: Buffer, region?: { left: number; top: number }): Promise<Caja> {
  let s = sharp(imagen).ensureAlpha();
  if (region) s = s.extract({ ...region, width: LADO, height: LADO });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if ((data[(y * info.width + x) * 4 + 3] as number) < ALFA_FIGURA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('una pieza sin nada opaco');
  return [x0, y0, x1, y1];
}

export const RUTA_ATLAS = join(RAIZ, 'assets/rpg/map-atlas.png');
export const RUTA_JSON = join(RAIZ, 'assets/rpg/map-atlas.json');

export async function componerAtlasMapa(): Promise<string> {
  // Las cajas de colocación: las de la primera composición, o medidas sobre el atlas antiguo.
  let colocacion: Record<string, Caja>;
  const previo = existsSync(RUTA_JSON)
    ? (JSON.parse(await readFile(RUTA_JSON, 'utf8')) as { colocacion?: Record<string, Caja> })
    : {};
  if (previo.colocacion !== undefined) {
    colocacion = previo.colocacion;
  } else {
    const antiguo = await readFile(join(RAIZ, ATLAS_ANTIGUO));
    colocacion = {};
    for (const [i, c] of CELDAS_DEL_ATLAS.entries()) {
      colocacion[c.id] = await cajaDe(antiguo, {
        left: (i % COLUMNAS) * LADO,
        top: Math.floor(i / COLUMNAS) * LADO,
      });
    }
  }

  const capas: OverlayOptions[] = [];
  const fuentes: { celda: string; fuente: string; sha256: string }[] = [];
  for (const [i, c] of CELDAS_DEL_ATLAS.entries()) {
    const fuente = CELDAS_REUTILIZADAS[c.id] ?? `assets/mapa/atlas/${c.id}.webp`;
    const bytes = await readFile(join(RAIZ, fuente));
    fuentes.push({ celda: c.id, fuente, sha256: sha256(bytes) });
    const [px0, py0, px1, py1] = await cajaDe(bytes);
    const recorte = await sharp(bytes)
      .extract({ left: px0, top: py0, width: px1 - px0 + 1, height: py1 - py0 + 1 })
      .png()
      .toBuffer();
    const [x0, y0, x1, y1] = colocacion[c.id] as Caja;
    const base = Math.min(y1, LADO - MARGEN);
    const centro = (x0 + x1) / 2;
    const escala = Math.min(
      (x1 - x0 + 1) / (px1 - px0 + 1),
      (base - Math.max(MARGEN, y0) + 1) / (py1 - py0 + 1),
      (2 * Math.min(centro - MARGEN, LADO - MARGEN - centro)) / (px1 - px0 + 1),
    );
    const w = Math.max(1, Math.round((px1 - px0 + 1) * escala));
    const h = Math.max(1, Math.round((py1 - py0 + 1) * escala));
    capas.push({
      input: await sharp(recorte).resize(w, h, { kernel: 'mitchell' }).png().toBuffer(),
      left: (i % COLUMNAS) * LADO + Math.round(centro - w / 2),
      top: Math.floor(i / COLUMNAS) * LADO + base - h + 1,
    });
  }

  const png = await sharp({
    create: {
      width: LADO * COLUMNAS,
      height: LADO * COLUMNAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
  await writeFile(RUTA_ATLAS, png);
  await escribirJsonAtlasMapa(colocacion, fuentes);
  return RUTA_ATLAS;
}

/** Lo que se mide de cada celda del atlas: su caja y su ancla (centro de la base). */
export async function derivarCeldas(
  png: Buffer,
): Promise<{ id: string; caja: Caja; ancla: readonly [number, number] }[]> {
  const fuera = [];
  for (const [i, c] of CELDAS_DEL_ATLAS.entries()) {
    const caja = await cajaDe(png, {
      left: (i % COLUMNAS) * LADO,
      top: Math.floor(i / COLUMNAS) * LADO,
    });
    fuera.push({
      id: c.id,
      caja,
      ancla: [Math.round((caja[0] + caja[2]) / 2), caja[3]] as const,
    });
  }
  return fuera;
}

async function escribirJsonAtlasMapa(
  colocacion: Record<string, Caja>,
  fuentes: readonly { celda: string; fuente: string; sha256: string }[],
): Promise<void> {
  const png = await readFile(RUTA_ATLAS);
  const json = {
    imagen: 'map-atlas.png',
    sha256: sha256(png),
    celda: LADO,
    columnas: COLUMNAS,
    celdas: await derivarCeldas(png),
    colocacion,
    fuentes,
    derivadoPor: 'tools/taller/componer-atlas-mapa.ts',
  };
  await writeFile(RUTA_JSON, `${JSON.stringify(json, null, 2)}\n`);
}
