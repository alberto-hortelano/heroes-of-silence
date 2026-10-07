/**
 * El catálogo de la escena leído del disco (`catalogo.ts`): los índices de cada
 * hoja de `assets/mapa/modulos/`, los JSON derivados de cada pieza de
 * `assets/mapa/` y, para las dos piezas del atlas viejo que no traen JSON (mina
 * y cofre), su medida sacada de la imagen.
 *
 * `pnpm taller catalogo-escena` lo escribe en `assets/mapa/escena.json`, que es
 * lo que leerá el juego: un solo fichero en vez de setenta.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type Catalogo,
  type CatalogoEnBruto,
  catalogoValidado,
  type JuntasDeLadera,
  type Modulo,
  type Pieza,
  RUTA_DEL_CATALOGO,
} from '../../../src/client/render/escenario/catalogo.js';
import { derivarPieza } from '../derivar.js';

const RAIZ = resolve(import.meta.dirname, '../../..');
const MAPA = join(RAIZ, 'assets/mapa');

/** Las piezas del atlas viejo que el escenógrafo usa y no traen su JSON. */
const DEL_ATLAS = ['atlas/mina', 'atlas/cofre'] as const;

interface IndiceDeHoja {
  readonly modulos: readonly {
    readonly imagen: string;
    readonly ancho: number;
    readonly alto: number;
    readonly ancla: readonly [number, number];
    /** Solo las laderas (§20): `pnpm taller derivar-laderas` las lleva de la guía al módulo. */
    readonly ladera?: JuntasDeLadera;
  }[];
}

interface PiezaDerivadaEnDisco {
  readonly ancho?: number;
  readonly alto?: number;
  readonly ancla?: readonly [number, number];
}

const porNombre = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Las hojas que siguen en disco pero el juego ya no usa: las laterales de la
 * vuelta 1 de #156 (§18), que sustituyeron las laderas (§20). No se borran sin
 * preguntar; así no viajan en el catálogo.
 */
const RETIRADAS = /^laterales-/;

export async function leerCatalogo(): Promise<Catalogo> {
  const hojas: Record<string, Modulo[]> = {};
  for (const f of (await readdir(join(MAPA, 'modulos'))).sort(porNombre)) {
    if (!f.endsWith('.json') || f.endsWith('.procedencia.json')) continue;
    const hoja = f.slice(0, -'.json'.length);
    if (RETIRADAS.test(hoja)) continue;
    const j = JSON.parse(await readFile(join(MAPA, 'modulos', f), 'utf8')) as IndiceDeHoja;
    hojas[hoja] = j.modulos
      .map((m) => ({
        src: `modulos/${hoja}/${m.imagen}`,
        nw: m.ancho,
        nh: m.alto,
        ax: m.ancla[0],
        ay: m.ancla[1],
        nombre: m.imagen.replace(/\.webp$/, ''),
        ...(m.ladera === undefined ? {} : { ladera: m.ladera }),
      }))
      .sort((a, b) => a.ay - b.ay);
  }
  const piezas: Record<string, Pieza> = {};
  for (const f of (await readdir(MAPA)).sort(porNombre)) {
    if (!f.endsWith('.json') || f.endsWith('.procedencia.json') || f === 'escena.json') continue;
    const j = JSON.parse(await readFile(join(MAPA, f), 'utf8')) as PiezaDerivadaEnDisco;
    if (j.ancho === undefined || j.alto === undefined || j.ancla === undefined) continue;
    const id = f.slice(0, -'.json'.length);
    piezas[id] = { src: `${id}.webp`, nw: j.ancho, nh: j.alto, ax: j.ancla[0], ay: j.ancla[1] };
  }
  for (const id of DEL_ATLAS) {
    const d = await derivarPieza(join(MAPA, `${id}.webp`));
    piezas[id] = { src: `${id}.webp`, nw: d.ancho, nh: d.alto, ax: d.ancla[0], ay: d.ancla[1] };
  }
  // Lo que lee el juego: una ladera sin sus juntas lanza aquí, no al pintar.
  return catalogoValidado({ hojas, piezas } satisfies CatalogoEnBruto);
}

export function textoDelCatalogo(c: Catalogo): string {
  return `${JSON.stringify(c, null, 1)}\n`;
}

/** Rehace `assets/mapa/escena.json` y devuelve el catálogo. */
export async function escribirCatalogo(): Promise<Catalogo> {
  const c = await leerCatalogo();
  await writeFile(join(RAIZ, RUTA_DEL_CATALOGO), textoDelCatalogo(c));
  return c;
}
