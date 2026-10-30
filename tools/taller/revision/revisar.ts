/**
 * La revisión de lo pintado (C3 de `docs/agents/2026-10-30-evaluar-animaciones/`):
 * por clip, los paneles que miran los jueces (la tira, la superposición de los
 * muñecos, el encuadre con piel de cebolla, la coherencia con el giro y el bucle),
 * las cifras de apoyo y el prompt del jurado; y el juicio de ChatGPT.
 *
 *   pnpm taller revisar <id> [dN…] [--sin-juez] [--clips=idle,walk]
 *
 * Deja todo en `.cache/taller/revision/<id>/d<n>/<clip>/`: los PNG, `cifras.json`,
 * `paneles.json` (qué es cada panel, escrito junto a quien lo dibuja, `vision.py`),
 * `prompt.md` (el mismo para ChatGPT y para los subagentes de Claude, que escriben
 * `juicio.claude.json`) y `juicio.gpt.json`. Los paneles ganaron a la tira en los
 * dos jueces y las cifras en el prompt no ayudaron (experimentos §4): no van.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { CARPETA_DE_LAS_FIGURAS } from '../../../src/core/npcs.js';
import { HOJAS_DE_FIGURA, NOMBRES_DE_DIRECCION } from '../../../src/shared/arte.js';
import { carpetaDeManiqui } from '../../art/poses.js';
import { juzgarConCodex } from '../codex.js';
import { DIR_DEL_MANIQUI_CIVIL } from '../npcs.js';
import { sha256 } from '../poses-8d.js';
import { juicioSchema, leerCon } from './esquemas.js';
import { hojasSobreOtroManiqui } from './maniqui.js';
import { paneles } from './vision.js';

export const RAIZ = resolve(import.meta.dirname, '../../..');
/** Donde deja la revisión todo lo suyo. */
export const DIR_DE_LA_REVISION = '.cache/taller/revision';
const JUEZ = join(RAIZ, 'tools/taller/revision/juez.md');

/** Dónde vive lo de una figura: su arte, su maniquí y su revisión. */
export interface Figura {
  readonly id: string;
  /** `assets/unidades/<id>` o `assets/npcs/<id>`. */
  readonly arte: string;
  /** La carpeta de su maniquí, con las hojas y los esqueletos. */
  readonly maniqui: string;
  /** `.cache/taller/revision/<id>`. */
  readonly revision: string;
}

/** Lo de una figura, o lanza si no tiene arte. */
export function figura(id: string): Figura {
  const deUnidad = `assets/unidades/${id}`;
  const deNpc = `${CARPETA_DE_LAS_FIGURAS}/${id}`;
  if (existsSync(join(RAIZ, deUnidad)))
    return {
      id,
      arte: deUnidad,
      maniqui: relative(RAIZ, carpetaDeManiqui(id)),
      revision: `${DIR_DE_LA_REVISION}/${id}`,
    };
  if (existsSync(join(RAIZ, deNpc)))
    return {
      id,
      arte: deNpc,
      maniqui: DIR_DEL_MANIQUI_CIVIL,
      revision: `${DIR_DE_LA_REVISION}/${id}`,
    };
  throw new Error(`«${id}» no tiene arte ni en assets/unidades/ ni en ${CARPETA_DE_LAS_FIGURAS}/`);
}

/** La carpeta de la revisión de un clip. */
export const carpetaDelClip = (f: Figura, d: number, clip: string): string =>
  join(RAIZ, f.revision, `d${d}`, clip);

/** Las direcciones de los argumentos (`d0 d3`), o las ocho. */
export function direccionesDe(args: readonly string[]): number[] {
  const ds = args.filter((a) => /^d[0-7]$/.test(a)).map((a) => Number(a.slice(1)));
  const raras = args.filter((a) => !a.startsWith('--') && /^d/.test(a) && !/^d[0-7]$/.test(a));
  if (raras.length > 0)
    throw new Error(
      `«${raras.join(', ')}» no son direcciones: van de d0 a d${NOMBRES_DE_DIRECCION.length - 1}`,
    );
  return ds.length > 0 ? ds : [...NOMBRES_DE_DIRECCION.keys()];
}

/** Lo que `vision.py` dice de cada panel (`paneles.json`). */
const panelesSchema = z.array(z.object({ imagen: z.string(), descripcion: z.string() }));
const cifrasSchema = z.object({
  clip: z.string(),
  hoja: z.string(),
  fila: z.number().int(),
  bucle: z.boolean(),
  fotogramas: z.number().int(),
});
export type CifrasDelClip = z.infer<typeof cifrasSchema>;

/** Las cifras de un clip ya montado (`cifras.json`). */
export function cifrasDe(dir: string): CifrasDelClip {
  return leerCon(cifrasSchema, join(dir, 'cifras.json'));
}

/** Las imágenes de un clip, en el orden en que las describe el prompt. */
export function imagenesDe(dir: string): string[] {
  return leerCon(panelesSchema, join(dir, 'paneles.json')).map((p) => join(dir, p.imagen));
}

/** El id con que el juez llama a un clip: el que va en el campo `clip` del juicio. */
export const idDelClip = (f: Figura, d: number, clip: string): string => `${f.id}-d${d}-${clip}`;

/**
 * El prompt del jurado para un clip ya montado: `juez.md` con lo de ese clip y la
 * descripción de cada panel en su orden. Lo escribe en `prompt.md` y lo devuelve.
 */
/**
 * Lo que se le dice al juez de una hoja pintada sobre otro render del maniquí (QA,
 * H1): lo que difiera por el cambio de maniquí no es un fallo del pintor. La hoja
 * va a repintarse de todos modos (`versiones`); su juicio solo da instrucciones.
 */
export const SOBRE_OTRO_MANIQUI =
  '- OJO: esta hoja se pintó sobre una versión ANTERIOR del maniquí, y los paneles enseñan el de hoy. Lo que difiera de su pose por ese cambio (otro gesto, otro reposo, otro golpe) NO es un fallo del pintor: apúntalo igualmente como hallazgo, con la corrección que llevaría la pintura al maniquí de hoy, porque servirá de instrucción para repintarla; y en `resumen` di qué es del cambio de maniquí y qué no.';

export async function promptDelJuez(
  dir: string,
  id: string,
  sobreOtroManiqui = false,
): Promise<string> {
  const cifras = cifrasDe(dir);
  const descr = leerCon(panelesSchema, join(dir, 'paneles.json'));
  const reemplazos: Record<string, string> = {
    '{{CLIP}}': `«${cifras.clip}»`,
    '{{N}}': String(cifras.fotogramas),
    '{{BUCLE}}': cifras.bucle ? 'que se repite en bucle' : 'que se juega una vez',
    '{{BUCLE_REGLA}}': cifras.bucle
      ? '- Es un bucle: del último fotograma se vuelve al primero, y ese paso debe ser tan suave como los demás.'
      : '',
    '{{PANELES}}': descr.map((p, i) => `- Imagen ${i + 1}: ${p.descripcion}.`).join('\n'),
    '{{ID}}': id,
    '{{MANIQUI_NUEVO}}': sobreOtroManiqui ? SOBRE_OTRO_MANIQUI : '',
  };
  let texto = await readFile(JUEZ, 'utf8');
  for (const [k, v] of Object.entries(reemplazos)) texto = texto.split(k).join(v);
  await escribirSiCambia(join(dir, 'prompt.md'), texto);
  await escribirSiCambia(join(dir, HUELLA_DE_LOS_PANELES), huellaDeLosPaneles(dir));
  return texto;
}

/**
 * La huella de lo que mira un juez de un clip: el sha256 de su prompt y de cada panel
 * (QA, H2). Un juicio guardado con otra huella es de otra hoja (o de otros paneles):
 * no vale. `paneles.huella` solo se reescribe si cambia, así su fecha dice cuándo
 * cambió lo que se juzga (la miran los juicios de Claude, que no llevan huella).
 */
export const HUELLA_DE_LOS_PANELES = 'paneles.huella';
export function huellaDeLosPaneles(dir: string, ...extra: string[]): string {
  const partes = [
    readFileSync(join(dir, 'prompt.md')),
    ...imagenesDe(dir).map((r) => readFileSync(r)),
    ...extra.map((t) => Buffer.from(t)),
  ];
  return sha256(Buffer.from(partes.map(sha256).join('\n')));
}

/** Escribe `texto` en `ruta` solo si no está ya así (la fecha dice cuándo cambió). */
export async function escribirSiCambia(ruta: string, texto: string): Promise<void> {
  if (existsSync(ruta) && readFileSync(ruta, 'utf8') === texto) return;
  await writeFile(ruta, texto);
}

/**
 * Si el juicio guardado en `salida` es de lo que hoy tiene la huella `huella`. Uno
 * de antes de las huellas (sin `.huella` al lado) vale si es más nuevo que todo lo
 * que juzgó (`fuentes`, las hojas): entonces se le apunta la huella de hoy.
 */
export function juicioVigente(
  salida: string,
  huella: string,
  fuentes: readonly string[] = [],
): boolean {
  if (!existsSync(salida)) return false;
  if (existsSync(`${salida}.huella`)) return readFileSync(`${salida}.huella`, 'utf8') === huella;
  if (fuentes.length === 0 || fuentes.some((r) => !existsSync(r))) return false;
  if (fuentes.some((r) => statSync(r).mtimeMs > statSync(salida).mtimeMs)) return false;
  writeFileSync(`${salida}.huella`, huella);
  return true;
}

/** Apunta junto a un juicio la huella de lo que juzgó. */
export const apuntarHuella = (salida: string, huella: string): Promise<void> =>
  writeFile(`${salida}.huella`, huella);

/**
 * Si un fichero de un juez sin huella (los de Claude) es de antes de la hoja que
 * juzga: su fecha frente a la de la hoja (QA, H2).
 */
export function deAntesDeLaHoja(fichero: string, hoja: string): boolean {
  return existsSync(hoja) && statSync(fichero).mtimeMs < statSync(hoja).mtimeMs;
}

/** La hoja pintada de la que sale un clip revisado (la que hay que repintar si falla). */
export const hojaDelClip = (f: Figura, d: number, dir: string): string =>
  join(RAIZ, f.arte, `d${d}`, `hoja-${cifrasDe(dir).hoja}.webp`);

/** Los clips de todas las hojas, para validar `--clips=`. */
export const TODOS_LOS_CLIPS: readonly string[] = Object.values(HOJAS_DE_FIGURA).flat();

/** Lanza si `--clips=` nombra uno que no existe (QA, H9: salía 0 sin hacer nada). */
export function comprobarClips(clips: readonly string[] | undefined): void {
  const raros = (clips ?? []).filter((c) => !TODOS_LOS_CLIPS.includes(c));
  if (raros.length > 0)
    throw new Error(`«${raros.join(', ')}» no son clips: hay ${TODOS_LOS_CLIPS.join(', ')}`);
}

/**
 * Revisa unas direcciones de una figura: monta los paneles de cada clip, escribe su
 * prompt y, salvo con `sinJuez`, pide el juicio de ChatGPT de los que no lo tengan
 * (como mucho tres a la vez, `juzgarConCodex`). Devuelve las carpetas de los clips.
 */
export async function revisar(
  id: string,
  direcciones: readonly number[],
  opciones: { readonly sinJuez?: boolean; readonly clips?: readonly string[] } = {},
): Promise<string[]> {
  comprobarClips(opciones.clips);
  const f = figura(id);
  // Las hojas pintadas sobre otro render del maniquí (QA, H1): se avisa y el juez lo sabe.
  const sobreOtro = new Map(hojasSobreOtroManiqui(RAIZ, f.arte).map((r) => [r.hoja, r.motivo]));
  const dirs: string[] = [];
  for (const d of direcciones) {
    const avisadas = Object.keys(HOJAS_DE_FIGURA).filter((h) => sobreOtro.has(`d${d}-${h}`));
    if (avisadas.length > 0)
      console.log(
        `⚠ d${d}: ${avisadas.map((h) => `hoja ${h.toUpperCase()}`).join(' y ')} pintada sobre OTRO maniquí (${sobreOtro.get(`d${d}-${avisadas[0]}`)}). No se juzga como fallo del pintor: va directa a «pnpm taller versiones ${id} d${d} <h>»; su juicio solo sirve de instrucciones.`,
      );
    await paneles({
      unidad: id,
      direccion: d,
      carpetaDelArte: f.arte,
      maniqui: f.maniqui,
      filasDeHoja: HOJAS_DE_FIGURA,
      ...(opciones.clips === undefined ? {} : { clips: opciones.clips }),
      salida: join(f.revision, `d${d}`),
    });
    const base = join(RAIZ, f.revision, `d${d}`);
    for (const clip of Object.values(HOJAS_DE_FIGURA).flat()) {
      const dir = join(base, clip);
      if (!existsSync(join(dir, 'paneles.json'))) continue;
      if (opciones.clips !== undefined && !opciones.clips.includes(clip)) continue;
      await promptDelJuez(dir, idDelClip(f, d, clip), sobreOtro.has(`d${d}-${cifrasDe(dir).hoja}`));
      dirs.push(dir);
    }
  }
  if (opciones.sinJuez === true) return dirs;
  await Promise.all(
    dirs.map(async (dir) => {
      const salida = join(dir, 'juicio.gpt.json');
      const huella = huellaDeLosPaneles(dir);
      const d = Number(basename(dirname(dir)).slice(1));
      if (juicioVigente(salida, huella, [hojaDelClip(f, d, dir)])) return;
      if (existsSync(salida))
        console.log(
          `  ↻ ${relative(RAIZ, salida)} era de otros paneles (la hoja cambió): se rehace`,
        );
      const j = await juzgarConCodex(
        await readFile(join(dir, 'prompt.md'), 'utf8'),
        imagenesDe(dir),
        juicioSchema,
        salida,
      );
      await apuntarHuella(salida, huella);
      console.log(
        `${relative(RAIZ, dir).padEnd(50)} ${j.veredicto.padEnd(8)} ${j.hallazgos.map((h) => `${h.tipo}[${h.fotogramas.join(',')}]s${h.severidad}`).join('; ')}`,
      );
    }),
  );
  return dirs;
}
