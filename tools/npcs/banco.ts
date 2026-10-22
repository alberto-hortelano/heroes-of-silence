/**
 * El banco de figuras de NPC en disco: **el único que lee y escribe
 * `data/npcs.json`** (lo vigila `invariantes.test.ts`). La forma, el vocabulario y
 * la validación son del núcleo (`src/core/npcs.ts`); aquí, el fichero y el arte.
 *
 * Si una figura está pintada **no se escribe**: se deriva de si sus ocho
 * `dN/atlas.json` están en `assets/npcs/<id>/` (`estadoDeFigura`). Una pedida que
 * no tiene cola (pedida en otro clon, o la cola se borró) se vuelve a encolar con
 * `pnpm npcs encolar`.
 *
 * Lo lee también `pnpm dev` para servir `/__npcs` (`vite.config.ts`), así que el
 * taller (pesado: Codex, sharp, el maniquí) se carga a demanda solo al encolar.
 */
import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type Banco,
  CARPETA_DE_LAS_FIGURAS,
  FIGURAS_NUEVAS_POR_MUNDO,
  type FiguraDeNpc,
  leerBanco,
  type PeticionDeFigura,
  problemasDePeticiones,
  RUTA_DEL_BANCO,
} from '../../src/core/npcs.js';
import { comentarioDe, escribirAtomico, jsonDe } from '../json.js';
import {
  arteEnOchoDirecciones,
  type CarpetaDeArte,
  direccionesDe,
} from '../taller/arte-en-disco.js';

export const RAIZ = resolve(import.meta.dirname, '../..');

/** El arte del banco en disco, figura a figura: lo que pinta el taller dirección a dirección. */
export const ARTE_DEL_BANCO: CarpetaDeArte = {
  dir: CARPETA_DE_LAS_FIGURAS,
  aMedias: 'el taller la está pintando',
};

/** El `_comment` del fichero si no trae uno: el que trae se conserva al escribir. */
const COMENTARIO =
  'El banco de figuras de NPC (22-10-2026): la gente que no pelea, la de la base y la de los lugares. Lo escribe solo `tools/npcs/banco.ts` (`pnpm npcs pedir` y el motor de narrativa al aceptar un mundo); el arte va en assets/npcs/<id>/ y lo pinta el taller. Si una figura está pintada no se escribe aquí: se deriva del disco.';

/** El fichero crudo, tal cual: lo que sirve `/__npcs` y lo que se reescribe. */
export function crudoDelBanco(raiz = RAIZ): unknown {
  const crudo = jsonDe(raiz, RUTA_DEL_BANCO);
  if (crudo === undefined) throw new Error(`${RUTA_DEL_BANCO} no existe`);
  return crudo;
}

/** El banco leído y juzgado (`leerBanco`), o lanza con todos sus problemas. */
export function leerBancoDeDisco(raiz = RAIZ): Banco {
  return leerBanco(crudoDelBanco(raiz));
}

/** Cuánto arte tiene una figura en disco. */
export type EstadoDeFigura =
  | { readonly estado: 'pendiente' }
  | { readonly estado: 'a-medias'; readonly motivo: string }
  | { readonly estado: 'pintada' };

/**
 * Cuánto arte tiene la figura `id` (`arteEnOchoDirecciones`): sus ocho
 * `dN/atlas.json` y `atlas.webp` (pintada), ninguno (pendiente: pedida y en el
 * taller) o algunos (a medias, con el motivo: el taller va dirección a dirección).
 * Solo mira si están: sus JSON los lee lo que se sirve (`loQueSeSirve`).
 */
export function estadoDeFigura(id: string, raiz = RAIZ): EstadoDeFigura {
  const arte = arteEnOchoDirecciones(raiz, id, ARTE_DEL_BANCO);
  if (arte.hecho === 'entero') return { estado: 'pintada' };
  if (arte.hecho === 'ninguno') return { estado: 'pendiente' };
  return { estado: 'a-medias', motivo: arte.motivo };
}

/** Las hojas del banco como las lee la página: por id, sus direcciones o por qué aún no. */
export interface HojaDeNpc {
  readonly direcciones: readonly unknown[] | null;
  /** Por qué no se pinta aún: pendiente o a medias. `null`, pintada. */
  readonly incompleta: string | null;
}

/**
 * Lo que sirve `/__npcs`: el banco crudo (lo juzga la página, `leerBanco`) y las
 * hojas de cada figura. Lanza con un banco roto: el servidor responde 500 y la
 * página lo dice (`arranque.ts`).
 */
export function loQueSeSirve(raiz = RAIZ): {
  readonly banco: unknown;
  readonly hojas: Readonly<Record<string, HojaDeNpc>>;
} {
  const crudo = crudoDelBanco(raiz);
  const banco = leerBanco(crudo);
  const hojas: Record<string, HojaDeNpc> = {};
  for (const f of banco.figuras) {
    const h = direccionesDe(raiz, f.id, ARTE_DEL_BANCO);
    hojas[f.id] =
      h.direcciones === null && h.incompleta === null
        ? { direcciones: null, incompleta: `${f.id} está pedida y sin pintar` }
        : h;
  }
  return { banco: crudo, hojas };
}

/** Las carpetas de `assets/npcs/` que no son de ninguna figura de `banco`: arte suelto. */
export function carpetasSinFigura(banco: Banco, raiz = RAIZ): string[] {
  const dir = join(raiz, CARPETA_DE_LAS_FIGURAS);
  if (!existsSync(dir)) return [];
  const ids = new Set(banco.figuras.map((f) => f.id));
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !ids.has(e.name))
    .map((e) => e.name);
}

/** Escribe el banco: juzgado entero antes (`leerBanco`), con el `_comment` del disco y de golpe. */
function escribirBanco(raiz: string, figuras: readonly FiguraDeNpc[]): void {
  const nuevo = {
    _comment: comentarioDe(jsonDe(raiz, RUTA_DEL_BANCO), COMENTARIO),
    figuras,
  };
  leerBanco(nuevo);
  escribirAtomico([{ ruta: join(raiz, RUTA_DEL_BANCO), contenido: nuevo }]);
}

/**
 * Acepta unas peticiones de figura (las de un mundo, `historia.figuras`, o las de
 * `pnpm npcs pedir`): relee el banco del disco, **lanza sin escribir nada** si no
 * valen (`problemasDePeticiones`, la regla con que las juzga la historia; con
 * `tope`, cuántas), las añade con quién las pidió, las escribe y encola lo primero
 * de cada una en el taller (`encolarLoQueSigue`). Devuelve las figuras nuevas y lo
 * encolado.
 */
export async function aceptarPeticiones(
  peticiones: unknown,
  pedidaPor: string,
  raiz = RAIZ,
  tope?: number,
): Promise<{ readonly figuras: readonly FiguraDeNpc[]; readonly encolados: readonly string[] }> {
  const banco = leerBancoDeDisco(raiz);
  const problemas = problemasDePeticiones(peticiones, banco, 'figuras', tope);
  if (problemas.length > 0) {
    throw new Error(`no se aceptan las figuras pedidas:\n- ${problemas.join('\n- ')}`);
  }
  const nuevas = Object.entries(peticiones as Readonly<Record<string, PeticionDeFigura>>).map(
    ([id, p]): FiguraDeNpc => ({
      id,
      descripcion: p.descripcion,
      etiquetas: p.etiquetas,
      talla: p.talla,
      acciones: p.acciones,
      pedidaPor,
    }),
  );
  if (nuevas.length === 0) return { figuras: [], encolados: [] };
  escribirBanco(raiz, [...banco.figuras, ...nuevas]);
  const { encolarLoQueSigue } = await import('../taller/npcs.js');
  const encolados: string[] = [];
  for (const f of nuevas) encolados.push(...(await encolarLoQueSigue(f, raiz)));
  return { figuras: nuevas, encolados };
}

/**
 * Acepta las figuras que pidió un mundo ya validado: pasan al banco
 * (`aceptarPeticiones`, pedidas por ese mundo) y la historia se reescribe **sin
 * `figuras`**: un hecho, un sitio, ya viven en el banco y la historia las nombra por
 * id. Lo llama el servidor de desarrollo al validar la historia del motor
 * (`tools/mundo/motor.ts`). Sin figuras pedidas, nada. Lanza sin tocar la historia si
 * el banco no las acepta.
 */
export async function aceptarElMundo(
  id: string,
  raiz = RAIZ,
): Promise<{ readonly figuras: readonly FiguraDeNpc[]; readonly encolados: readonly string[] }> {
  const ruta = join(raiz, 'assets/mundos', id, 'historia.json');
  const historia = JSON.parse(await readFile(ruta, 'utf8')) as { figuras?: unknown };
  const hecho = await aceptarPeticiones(historia.figuras ?? {}, id, raiz, FIGURAS_NUEVAS_POR_MUNDO);
  if (historia.figuras !== undefined) {
    const { figuras: _ya, ...sin } = historia;
    await writeFile(ruta, `${JSON.stringify(sin, null, 2)}\n`);
  }
  return hecho;
}
