/**
 * Juntar las hojas pintadas de una dirección en su atlas. Vive aparte de
 * `trabajador.ts` porque aquel arranca la cola al importarse, y esto lo prueba
 * `test/taller-8d.test.ts` con hojas de mentira.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { HOJAS_DE_FIGURA, hojasDeFigura } from '../../src/shared/arte.js';
import { clipDeDisparoDe } from '../art/poses.js';
import { escribirDerivado } from './derivar.js';
import { apilarHojas, juegoEn8dDe, sha256, sueltaDeUnidad } from './poses-8d.js';

/**
 * Junta las hojas de una dirección (`assets/unidades/<id>/dN/`) en `atlas.webp`
 * y lo deriva: la A y la B, 6 filas, y la C del disparo si la unidad dispara, 7
 * (`HOJAS_DE_FIGURA`), con la suelta de su maniquí. Apunta en
 * `atlas.composicion.json` el sha256 de cada hoja, que es la que lleva la
 * procedencia. Si falta una, nada: quien dispara espera a su C.
 */
export async function juntarDireccion(dir: string): Promise<string | null> {
  const id = basename(dirname(dir));
  const letras = hojasDeFigura(clipDeDisparoDe(juegoEn8dDe(id)) !== null);
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
  const suelta = await sueltaDeUnidad(id);
  await escribirDerivado(atlas, suelta === null ? {} : { suelta });
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
