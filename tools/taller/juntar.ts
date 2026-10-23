/**
 * Juntar las hojas pintadas de una dirección en su atlas. Vive aparte de
 * `trabajador.ts` porque aquel arranca la cola al importarse, y esto lo prueba
 * `test/taller-8d.test.ts` con hojas de mentira.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { CARPETA_DE_LAS_FIGURAS, figuraDelBanco } from '../../src/core/npcs.js';
import {
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  hojasDeFigura,
  hojasDeLasAcciones,
} from '../../src/shared/arte.js';
import { clipDeDisparoDe } from '../art/poses.js';
import { leerBancoDeDisco } from '../npcs/banco.js';
import { escribirDerivado, type OpcionesDeDerivar } from './derivar.js';
import { apilarHojas, derivacionDeUnidad, juegoEn8dDe, sha256 } from './poses-8d.js';

/**
 * Qué hojas se juntan en la carpeta de una dirección (`…/<id>/dN/`) y con qué se
 * deriva su atlas: de una unidad de `assets/unidades/`, las de su juego de armas
 * (con la C si dispara) y su suelta y su ritmo (`derivacionDeUnidad`); de una figura
 * del banco de NPC (`assets/npcs/`), las de sus acciones (`hojasDeLasAcciones`,
 * `data/npcs.json` de la raíz de la carpeta: la de los tests es temporal). Lo leen
 * el juntado (`juntarDireccion`) y `pnpm taller derivar`. Lanza con una carpeta de
 * `assets/npcs/` que no es de ninguna figura del banco. Vive aquí y no en `npcs.ts`,
 * que lo carga `pnpm dev` (`/__npcs`): lo de las unidades trae el taller entero, y
 * con él el escenógrafo del cliente, que la configuración de vite no sabe cargar.
 */
export function derivacionDeLaCarpeta(dirN: string): {
  readonly hojas: readonly HojaDeFigura[];
  /** Con qué se deriva: se pide al derivar, cuando ya están las hojas. */
  readonly derivar: () => Promise<OpcionesDeDerivar>;
} {
  const figura = dirname(resolve(dirN));
  const id = basename(figura);
  const raiz = resolve(dirname(figura), ...CARPETA_DE_LAS_FIGURAS.split('/').map(() => '..'));
  if (resolve(raiz, CARPETA_DE_LAS_FIGURAS) !== dirname(figura)) {
    return {
      hojas: hojasDeFigura(clipDeDisparoDe(juegoEn8dDe(id)) !== null),
      derivar: () => derivacionDeUnidad(id),
    };
  }
  const npc = figuraDelBanco(leerBancoDeDisco(raiz), id);
  if (npc === undefined) {
    throw new Error(`${dirN}: "${id}" no es una figura del banco de NPC (\`pnpm npcs estado\`)`);
  }
  const hojas = hojasDeLasAcciones(npc.acciones);
  return { hojas, derivar: async () => ({ hojas }) };
}

/**
 * Junta las hojas de una dirección en `atlas.webp` y lo deriva, con las hojas y la
 * derivación de su carpeta (`derivacionDeLaCarpeta`): de una unidad
 * (`assets/unidades/<id>/dN/`), la A y la B, 6 filas, y la C del disparo si la
 * unidad dispara, 7 (`HOJAS_DE_FIGURA`), con la suelta de su maniquí; de una figura
 * del banco de NPC (`assets/npcs/<id>/dN/`), las de sus acciones: la A sola (3
 * filas) o con la B si lleva `todas`. Apunta en `atlas.composicion.json` el sha256
 * de cada hoja, que es la que lleva la procedencia. Si falta una, nada: quien
 * dispara espera a su C.
 */
export async function juntarDireccion(dir: string): Promise<string | null> {
  const { hojas: letras, derivar } = derivacionDeLaCarpeta(dir);
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
  await escribirDerivado(atlas, await derivar());
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
