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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type Banco,
  FIGURAS_NUEVAS_POR_MUNDO,
  type FiguraDeNpc,
  figuraDelBanco,
  leerBanco,
  type PeticionDeFigura,
  problemasDePeticion,
} from '../../src/core/npcs.js';
import { NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';

export const RAIZ = resolve(import.meta.dirname, '../..');
/** El índice del banco, relativo a la raíz. */
export const RUTA_DEL_BANCO = 'data/npcs.json';
/** El arte del banco, relativo a la raíz. */
export const DIR_DEL_ARTE = 'assets/npcs';

/** El `_comment` del fichero si no trae uno: el que trae se conserva al escribir. */
const COMENTARIO =
  'El banco de figuras de NPC (22-10-2026): la gente que no pelea, la de la base y la de los lugares. Lo escribe solo `tools/npcs/banco.ts` (`pnpm npcs pedir` y el motor de narrativa al aceptar un mundo); el arte va en assets/npcs/<id>/ y lo pinta el taller. Si una figura está pintada no se escribe aquí: se deriva del disco.';

/** El fichero crudo, tal cual: lo que sirve `/__npcs` y lo que se reescribe. */
export function crudoDelBanco(raiz = RAIZ): { _comment?: unknown; figuras: unknown[] } {
  const ruta = join(raiz, RUTA_DEL_BANCO);
  let texto: string;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch (err) {
    throw new Error(
      `${RUTA_DEL_BANCO} no se puede leer: ${err instanceof Error ? err.message : err}`,
    );
  }
  try {
    return JSON.parse(texto) as { _comment?: unknown; figuras: unknown[] };
  } catch (err) {
    throw new Error(
      `${RUTA_DEL_BANCO} no es JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** El banco leído y juzgado (`leerBanco`), o lanza con todos sus problemas. */
export function leerBancoDeDisco(raiz = RAIZ): Banco {
  return leerBanco(crudoDelBanco(raiz));
}

/** Cuánto arte tiene una figura en disco. */
export type EstadoDeFigura =
  | { readonly estado: 'pendiente' }
  | { readonly estado: 'a-medias'; readonly motivo: string }
  | { readonly estado: 'pintada'; readonly direcciones: readonly unknown[] };

/**
 * Cuánto arte tiene la figura `id`: sus ocho `dN/atlas.json` y `atlas.webp`
 * (pintada, con los JSON leídos), ninguno (pendiente: pedida y en el taller) o
 * algunos (a medias, con el motivo: el taller va dirección a dirección).
 */
export function estadoDeFigura(id: string, raiz = RAIZ): EstadoDeFigura {
  const dir = join(raiz, DIR_DEL_ARTE, id);
  const hechas = NOMBRES_DE_DIRECCION.map((_, d) =>
    ['atlas.json', 'atlas.webp'].every((f) => existsSync(join(dir, `d${d}`, f))),
  );
  const n = hechas.filter(Boolean).length;
  if (n === 0) return { estado: 'pendiente' };
  if (n < hechas.length) {
    const faltan = hechas.flatMap((h, d) => (h ? [] : [`d${d}`]));
    return {
      estado: 'a-medias',
      motivo: `${id} tiene ${n} de sus ${hechas.length} direcciones (le faltan ${faltan.join(', ')}): el taller la está pintando`,
    };
  }
  return {
    estado: 'pintada',
    direcciones: hechas.map(
      (_, d) => JSON.parse(readFileSync(join(dir, `d${d}`, 'atlas.json'), 'utf8')) as unknown,
    ),
  };
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
    const e = estadoDeFigura(f.id, raiz);
    hojas[f.id] =
      e.estado === 'pintada'
        ? { direcciones: e.direcciones, incompleta: null }
        : {
            direcciones: null,
            incompleta: e.estado === 'a-medias' ? e.motivo : `${f.id} está pedida y sin pintar`,
          };
  }
  return { banco: crudo, hojas };
}

/** Las carpetas de `assets/npcs/` que no son de ninguna figura del banco: arte suelto. */
export function carpetasSinFigura(raiz = RAIZ): string[] {
  const dir = join(raiz, DIR_DEL_ARTE);
  if (!existsSync(dir)) return [];
  const ids = new Set(leerBancoDeDisco(raiz).figuras.map((f) => f.id));
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !ids.has(e.name))
    .map((e) => e.name);
}

/** Escribe el banco: juzgado entero antes (`leerBanco`), y de golpe (temporal y `rename`). */
async function escribirBanco(raiz: string, figuras: readonly FiguraDeNpc[]): Promise<void> {
  const antes = crudoDelBanco(raiz);
  const nuevo = {
    _comment: typeof antes._comment === 'string' ? antes._comment : COMENTARIO,
    figuras,
  };
  leerBanco(nuevo);
  const ruta = join(raiz, RUTA_DEL_BANCO);
  const temporal = `${ruta}.${process.pid}.tmp`;
  await writeFile(temporal, `${JSON.stringify(nuevo, null, 2)}\n`);
  await rename(temporal, ruta);
}

/**
 * Acepta unas peticiones de figura (las de un mundo, `historia.figuras`, o las de
 * `pnpm npcs pedir`): relee el banco del disco, **lanza sin escribir nada** si
 * alguna no vale o su id ya es de otra figura, las añade con quién las pidió, las
 * escribe y encola lo primero de cada una en el taller (`encolarLoQueSigue`).
 * Devuelve las figuras nuevas y lo encolado.
 */
export async function aceptarPeticiones(
  peticiones: Readonly<Record<string, PeticionDeFigura>>,
  pedidaPor: string,
  raiz = RAIZ,
): Promise<{ readonly figuras: readonly FiguraDeNpc[]; readonly encolados: readonly string[] }> {
  const banco = leerBancoDeDisco(raiz);
  const problemas: string[] = [];
  for (const [id, p] of Object.entries(peticiones)) {
    problemas.push(...problemasDePeticion(p, `figuras.${id}`));
    if (figuraDelBanco(banco, id) !== undefined)
      problemas.push(`figuras.${id}: "${id}" ya es una figura del banco: reutilízala sin pedirla`);
  }
  if (problemas.length > 0) {
    throw new Error(`no se aceptan las figuras pedidas:\n- ${problemas.join('\n- ')}`);
  }
  const nuevas = Object.entries(peticiones).map(
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
  await escribirBanco(raiz, [...banco.figuras, ...nuevas]);
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
  const historia = JSON.parse(await readFile(ruta, 'utf8')) as {
    figuras?: Record<string, PeticionDeFigura>;
  };
  const pedidas = historia.figuras ?? {};
  if (Object.keys(pedidas).length > FIGURAS_NUEVAS_POR_MUNDO) {
    throw new Error(
      `el mundo "${id}" pide ${Object.keys(pedidas).length} figuras y el tope es ${FIGURAS_NUEVAS_POR_MUNDO}`,
    );
  }
  const hecho = await aceptarPeticiones(pedidas, id, raiz);
  if (historia.figuras !== undefined) {
    const { figuras: _ya, ...sin } = historia;
    await writeFile(ruta, `${JSON.stringify(sin, null, 2)}\n`);
  }
  return hecho;
}
