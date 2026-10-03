/**
 * Las anclas de las poses del Y Bot en 8 direcciones, derivadas y comprometidas:
 *
 *   pnpm taller derivar-poses
 *
 * El Y Bot es el respaldo de toda figura que no tiene arte propio (decisión del
 * usuario, 03-10-2026), y el cliente lo pinta tal cual sale de sprite-forge
 * —`_poses/<juego>-8d/dN-a.png` (reposo, marcha, carga) y `dN-b.png` (ataque,
 * daño, muerte)—. Esos PNG no traen anclas: las anclas son cosa del recorte, no
 * del render. Medirlas en el navegador al cargar sería un ancla que nadie
 * compromete ni compara (#120), así que se miden aquí con `derivarAtlas`, la
 * misma regla que mide el arte, y se escriben en `_poses/atlas-8d.json` con el
 * sha256 de cada PNG. `test/personajes.test.ts` vuelve a derivar una dirección y
 * exige el mismo JSON.
 *
 * **La muerte no se eleva.** `derivarAtlas` sube 64 px el ancla de la muerte
 * porque las hojas PINTADAS se empaquetan con esa fila subida en su celda; el
 * render crudo la tiene donde la pone el maniquí, y con la elevación el cadáver
 * del Y Bot se hundiría 64 px en el suelo.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import { carpetaDePoses, DIR_POSES, type JuegoEn8d, OCHO_DIRECCIONES } from '../art/poses.js';
import { type AtlasDerivado, derivarAtlas } from './derivar.js';
import { JUEGOS_EN_8D } from './unidades.js';

const RAIZ = resolve(import.meta.dirname, '../..');
/** Donde se juntan las dos hojas de cada dirección para medirlas: no se versiona. */
const DIR_JUNTAS = join(RAIZ, '.cache/taller/poses-8d');
export const RUTA_DEL_ATLAS_8D = join(DIR_POSES, 'atlas-8d.json');

/** Una dirección del Y Bot: sus dos hojas con su sha256 y el atlas de 6 filas medido. */
export interface DireccionDePoses extends Omit<AtlasDerivado, 'imagen' | 'sha256' | 'derivadoPor'> {
  /** Filas 0-2 en `a`, filas 3-5 en `b` (la fila `r` de `b` es la `r − 3` de su imagen). */
  readonly hojas: {
    readonly a: { readonly imagen: string; readonly sha256: string };
    readonly b: { readonly imagen: string; readonly sha256: string };
  };
}

/** La hoja de 6 filas que se mide, en la caché: el visor del taller la enseña. */
export const rutaJunta = (juego: JuegoEn8d, d: number): string =>
  join(DIR_JUNTAS, `${juego}-d${d}.png`);

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** Junta las dos hojas de la dirección `d` de un juego, las mide y lo devuelve. */
export async function derivarDireccionDePoses(
  juego: JuegoEn8d,
  d: number,
): Promise<DireccionDePoses> {
  const origen = carpetaDePoses(juego);
  const [a, b] = await Promise.all(
    (['a', 'b'] as const).map((h) => readFile(join(origen, `d${d}-${h}.png`))),
  );
  const { celda } = OCHO_DIRECCIONES;
  const { width, height } = await sharp(a as Buffer).metadata();
  if (height !== 3 * celda) {
    throw new Error(
      `${origen}/d${d}-a.png mide ${height} de alto: una hoja de poses son 3 filas de ${celda}`,
    );
  }
  await mkdir(DIR_JUNTAS, { recursive: true });
  const ruta = rutaJunta(juego, d);
  await sharp({
    create: { width, height: 6 * celda, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: a as Buffer, left: 0, top: 0 },
      { input: b as Buffer, left: 0, top: 3 * celda },
    ])
    .png()
    .toFile(ruta);
  const {
    imagen: _i,
    sha256: _s,
    derivadoPor: _p,
    ...atlas
  } = await derivarAtlas(ruta, {
    elevacionDeLaMuerte: 0,
  });
  return {
    hojas: {
      a: { imagen: `d${d}-a.png`, sha256: sha256(a as Buffer) },
      b: { imagen: `d${d}-b.png`, sha256: sha256(b as Buffer) },
    },
    ...atlas,
  };
}

export interface AtlasDePoses {
  readonly _comment: string;
  readonly derivadoPor: 'tools/taller/poses-8d.ts';
  /** Por juego de armas, sus 8 direcciones en el orden de `NOMBRES_DE_DIRECCION`. */
  readonly juegos: Readonly<Record<string, readonly DireccionDePoses[]>>;
}

/** Mide las 8 direcciones de cada juego con poses y escribe `atlas-8d.json`. */
export async function escribirAtlasDePoses(): Promise<AtlasDePoses> {
  const juegos: Record<string, DireccionDePoses[]> = {};
  const n = NOMBRES_DE_DIRECCION.length;
  for (const juego of JUEGOS_EN_8D) {
    if (!existsSync(join(carpetaDePoses(juego), `d${n - 1}-b.png`))) {
      throw new Error(
        `el juego «${juego}» no tiene sus ${n} direcciones en ${carpetaDePoses(juego)}`,
      );
    }
    juegos[juego] = [];
    for (let d = 0; d < n; d++) juegos[juego].push(await derivarDireccionDePoses(juego, d));
  }
  const atlas: AtlasDePoses = {
    _comment:
      'Derivado de los PNG de _poses/<juego>-8d con `pnpm taller derivar-poses`: no se edita a mano. Lo lee el cliente (render/personajes.ts).',
    derivadoPor: 'tools/taller/poses-8d.ts',
    juegos,
  };
  await writeFile(RUTA_DEL_ATLAS_8D, `${JSON.stringify(atlas, null, 2)}\n`);
  return atlas;
}
