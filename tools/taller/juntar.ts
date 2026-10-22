/**
 * Juntar las hojas pintadas de una dirección en su atlas. Vive aparte de
 * `trabajador.ts` porque aquel arranca la cola al importarse, y esto lo prueba
 * `test/taller-8d.test.ts` con hojas de mentira.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { figuraDelBanco } from '../../src/core/npcs.js';
import { HOJAS_DE_FIGURA, hojasDeFigura } from '../../src/shared/arte.js';
import { clipDeDisparoDe } from '../art/poses.js';
import { leerBancoDeDisco } from '../npcs/banco.js';
import { escribirDerivado } from './derivar.js';
import { derivacionDeNpc, letrasDeNpc } from './npcs.js';
import { apilarHojas, derivacionDeUnidad, juegoEn8dDe, sha256 } from './poses-8d.js';

/** La raíz del repo de una carpeta `…/assets/npcs/<id>/dN`: la de los tests es temporal. */
const raizDe = (dir: string): string => dirname(dirname(dirname(dirname(dir))));

/**
 * Junta las hojas de una dirección (`assets/unidades/<id>/dN/`) en `atlas.webp`
 * y lo deriva: la A y la B, 6 filas, y la C del disparo si la unidad dispara, 7
 * (`HOJAS_DE_FIGURA`), con la suelta de su maniquí. La de una figura del banco de
 * NPC (`assets/npcs/<id>/dN/`), la A sola (3 filas) o con la B si lleva `todas`. Apunta en
 * `atlas.composicion.json` el sha256 de cada hoja, que es la que lleva la
 * procedencia. Si falta una, nada: quien dispara espera a su C.
 */
export async function juntarDireccion(dir: string): Promise<string | null> {
  const id = basename(dirname(dir));
  // Una figura del banco de NPC (`assets/npcs/<id>/dN/`): sus hojas y su derivación
  // salen de sus acciones (`data/npcs.json`), no de un juego de armas de la tropa.
  const esNpc = basename(dirname(dirname(dir))) === 'npcs';
  const npc = esNpc ? figuraDelBanco(leerBancoDeDisco(raizDe(dir)), id) : undefined;
  if (esNpc && npc === undefined) {
    throw new Error(`${dir}: "${id}" no es una figura del banco de NPC (data/npcs.json)`);
  }
  const letras =
    npc === undefined
      ? hojasDeFigura(clipDeDisparoDe(juegoEn8dDe(id)) !== null)
      : letrasDeNpc(npc.acciones);
  const rutas = letras.map((h) => join(dir, `hoja-${h}.webp`));
  if (!rutas.every((r) => existsSync(r))) return null;
  const pngs = await Promise.all(rutas.map((r) => readFile(r)));
  const hojas = letras.map((hoja, i) => ({
    hoja,
    ruta: rutas[i] as string,
    png: pngs[i] as Buffer,
  }));
  const webp = await (await apilarHojas(hojas)).webp({ lossless: true, effort: 6 }).toBuffer();
  const atlas = join(dir, 'atlas.webp');
  await writeFile(atlas, webp);
  await escribirDerivado(
    atlas,
    npc === undefined ? await derivacionDeUnidad(id) : derivacionDeNpc(npc),
  );
  await writeFile(
    join(dir, 'atlas.composicion.json'),
    `${JSON.stringify(
      {
        atlas: 'atlas.webp',
        sha256: sha256(webp),
        hojas: hojas.map(({ hoja, ruta, png }) => ({
          imagen: basename(ruta),
          sha256: sha256(png),
          filas: HOJAS_DE_FIGURA[hoja],
        })),
      },
      null,
      2,
    )}\n`,
  );
  return atlas;
}
