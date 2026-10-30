/**
 * El jurado de la revisión de animaciones: de los juicios de ChatGPT y de Claude a
 * lo que se corrige.
 *
 *   pnpm taller jurado unir <id> [dN…]      une los hallazgos de los dos jueces, cada uno con su fuente
 *   pnpm taller jurado arbitrar <id> [dN…]  el árbitro de ChatGPT, y el prompt del de Claude
 *   pnpm taller jurado cruzar <id> [dN…]    cruza los dos árbitros y la respuesta del visor
 *
 * Por qué la UNIÓN: los dos jueces se equivocan en cosas distintas (Claude se deja
 * los espejos, ChatGPT los desplazamientos de 6 px); juntos pasan del 86 % al 95 %
 * de lo fabricado, y exigir que coincidan pierde la cuarta parte (experimentos §4).
 * Por qué dos árbitros y la disputa como defecto probable: de 5 disputas que miró el
 * usuario, 4 eran reales (§5).
 *
 * Todo vive en la carpeta de cada clip (`revisar.ts`): `juicio.gpt.json`,
 * `juicio.claude.json` → `union.json` → `arbitraje.{gpt,claude}.json` →
 * `veredicto.json` de la dirección e `instrucciones-<h>.txt` por hoja.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { HOJAS_DE_FIGURA } from '../../../src/shared/arte.js';
import { juzgarConCodex } from '../codex.js';
import {
  type Arbitraje,
  arbitrajeSchema,
  type Hallazgo,
  hallazgoSchema,
  type Juicio,
  juicioSchema,
  leerCon,
  leerSiHay,
  type Respuestas,
  respuestasSchema,
} from './esquemas.js';
import {
  apuntarHuella,
  carpetaDelClip,
  cifrasDe,
  deAntesDeLaHoja,
  escribirSiCambia,
  type Figura,
  hojaDelClip,
  huellaDeLosPaneles,
  idDelClip,
  imagenesDe,
  juicioVigente,
  RAIZ,
} from './revisar.js';

export const JUECES = ['gpt', 'claude'] as const;
export type Juez = (typeof JUECES)[number];

/** Un hallazgo de la unión, con quién lo vio. */
export interface HallazgoUnido {
  readonly indice: number;
  readonly fuentes: readonly Juez[];
  readonly hallazgo: Hallazgo;
}

const unidoSchema = z.array(
  z.object({
    indice: z.number().int(),
    fuentes: z.array(z.enum(JUECES)),
    hallazgo: hallazgoSchema,
  }),
);

/** La unión de un clip (`union.json`, la escribe `unir`). */
const leerUnion = (dir: string): HallazgoUnido[] => leerCon(unidoSchema, join(dir, 'union.json'));

/**
 * La unión de los hallazgos de los jueces: todos, cada uno con su fuente. Dos de
 * jueces distintos con la misma categoría y el mismo tipo y algún fotograma en
 * común son el mismo defecto: queda uno, con las dos fuentes y los fotogramas de
 * los dos (la severidad, la mayor).
 */
export function unirHallazgos(juicios: Partial<Record<Juez, Juicio>>): HallazgoUnido[] {
  const fuera: { fuentes: Juez[]; hallazgo: Hallazgo }[] = [];
  for (const juez of JUECES) {
    for (const h of juicios[juez]?.hallazgos ?? []) {
      const igual = fuera.find(
        (u) =>
          !u.fuentes.includes(juez) &&
          u.hallazgo.categoria === h.categoria &&
          u.hallazgo.tipo === h.tipo &&
          u.hallazgo.fotogramas.some((f) => h.fotogramas.includes(f)),
      );
      if (igual === undefined) {
        fuera.push({ fuentes: [juez], hallazgo: h });
        continue;
      }
      igual.fuentes.push(juez);
      igual.hallazgo = {
        ...igual.hallazgo,
        fotogramas: [...new Set([...igual.hallazgo.fotogramas, ...h.fotogramas])].sort(
          (a, b) => a - b,
        ),
        severidad: Math.max(igual.hallazgo.severidad, h.severidad) as Hallazgo['severidad'],
      };
    }
  }
  return fuera.map((u, indice) => ({ indice, ...u }));
}

/** Qué quedó de cada hallazgo tras los árbitros y el visor. */
export type Estado = 'real' | 'falso' | 'disputa';

export interface HallazgoCruzado extends HallazgoUnido {
  readonly arbitros: Partial<Record<Juez, string>>;
  /** `disputa` sin respuesta del visor cuenta como defecto probable. */
  readonly estado: Estado;
  /** Lo que contestó la persona en el visor, si lo miró. */
  readonly persona?: string;
  /** Si va a las instrucciones del pintor: real, o disputa sin respuesta. */
  readonly defecto: boolean;
}

/** El id del caso del visor de una disputa: lo escribe `casosDeDisputa` y lo lee `cruzarArbitrajes`. */
export const casoDeDisputa = (d: number, clip: string, indice: number): string =>
  `disp-d${d}-${clip}-${indice}`;
/** Las respuestas del visor a una disputa: la última dice «no se ve». */
export const OPCIONES_DE_DISPUTA = ['sí, y se nota jugando', 'sí, pero apenas', 'no'] as const;

/**
 * Cruza los dos árbitros: real si los dos dicen real, falso si los dos dicen falso,
 * y disputa si no coinciden o alguno duda. Lo omitido por un árbitro entra como
 * disputa. Una disputa la resuelve la respuesta del visor («no» → falso; si no,
 * real) y, sin ella, cuenta como defecto probable.
 */
export function cruzarArbitrajes(
  union: readonly HallazgoUnido[],
  arbitrajes: Partial<Record<Juez, Arbitraje>>,
  respuestas: Respuestas,
  caso: (indice: number) => string,
): HallazgoCruzado[] {
  const omitidos: HallazgoUnido[] = [];
  for (const juez of JUECES)
    for (const o of arbitrajes[juez]?.omitidos ?? [])
      omitidos.push({ indice: union.length + omitidos.length, fuentes: [juez], hallazgo: o });
  return [...union, ...omitidos].map((u) => {
    const arbitros: Partial<Record<Juez, string>> = {};
    for (const juez of JUECES) {
      const dec = arbitrajes[juez]?.decisiones.find((x) => x.indice === u.indice);
      if (dec !== undefined) arbitros[juez] = dec.decision;
      // Lo que un árbitro añadió, él lo da por real.
      else if (u.indice >= union.length && u.fuentes.includes(juez)) arbitros[juez] = 'real';
    }
    const [a, b] = JUECES.map((j) => arbitros[j]);
    let estado: Estado = a === b && (a === 'real' || a === 'falso') ? a : 'disputa';
    const persona = respuestas[caso(u.indice)]?.valor;
    if (estado === 'disputa' && persona !== undefined) estado = persona === 'no' ? 'falso' : 'real';
    return {
      ...u,
      arbitros,
      estado,
      ...(persona === undefined ? {} : { persona }),
      defecto: estado !== 'falso',
    };
  });
}

/** La severidad desde la que un defecto va a las instrucciones del pintor. */
export const SEVERIDAD_MINIMA = 2;

/**
 * Las instrucciones para el pintor de cada hoja: los defectos de severidad ≥
 * `SEVERIDAD_MINIMA`, con su fila (la del clip en la hoja) y sus fotogramas. Sin el
 * encuadre: se corrige sin el modelo (C1, `encuadre.ts`).
 */
export function instruccionesPorHoja(
  clips: readonly {
    readonly clip: string;
    readonly hoja: string;
    readonly fila: number;
    readonly hallazgos: readonly HallazgoCruzado[];
  }[],
): Record<string, string> {
  const porHoja: Record<string, string[]> = {};
  for (const c of clips)
    for (const h of c.hallazgos) {
      if (
        !h.defecto ||
        h.hallazgo.severidad < SEVERIDAD_MINIMA ||
        h.hallazgo.categoria === 'encuadre'
      )
        continue;
      porHoja[c.hoja] ??= [];
      (porHoja[c.hoja] as string[]).push(
        `- Fila ${c.fila + 1} (${c.clip}), columna(s) ${h.hallazgo.fotogramas.join(', ')}: ${h.hallazgo.correccion}`,
      );
    }
  return Object.fromEntries(Object.entries(porHoja).map(([h, l]) => [h, l.join('\n')]));
}

/** Los clips revisados de una dirección, con su carpeta. */
function clipsRevisados(
  f: Figura,
  d: number,
  clips?: readonly string[],
): { clip: string; dir: string }[] {
  return Object.values(HOJAS_DE_FIGURA)
    .flat()
    .filter((clip) => clips === undefined || clips.includes(clip))
    .map((clip) => ({ clip, dir: carpetaDelClip(f, d, clip) }))
    .filter(({ dir }) => existsSync(join(dir, 'prompt.md')));
}

/** Las órdenes que dejan cada fichero del jurado (QA, H11: decir qué falta y con qué). */
const ordenDe = (f: Figura, d: number, clip: string) => ({
  'juicio.gpt': `pnpm taller revisar ${f.id} d${d} --clips=${clip}`,
  'juicio.claude': 'un subagente de Claude con su prompt.md (paso 2 de /revisar-animaciones)',
  union: `pnpm taller jurado unir ${f.id} d${d} --clips=${clip}`,
  'arbitraje.gpt': `pnpm taller jurado arbitrar ${f.id} d${d} --clips=${clip}`,
  'arbitraje.claude':
    'un subagente de Claude con su arbitraje.prompt.md (paso 3 de /revisar-animaciones)',
});

/**
 * Lo que no cuadra de un juicio con su clip (QA, H7): otro `clip` que el suyo,
 * fotogramas fuera de 1..n. El esquema no lo puede saber.
 */
export function problemasDelJuicio(j: Juicio, id: string, n: number): string[] {
  const fuera: string[] = [];
  if (j.clip !== id) fuera.push(`es del clip «${j.clip}» y no de «${id}»`);
  for (const [i, h] of j.hallazgos.entries()) {
    const malos = h.fotogramas.filter((x) => x < 1 || x > n);
    if (malos.length > 0)
      fuera.push(`el hallazgo ${i} nombra fotogramas fuera de 1-${n}: ${malos.join(', ')}`);
  }
  return fuera;
}

/**
 * Lo que no cuadra de un arbitraje con su unión (QA, H7): otro `clip`, índices
 * repetidos o que no existen, omitidos con fotogramas fuera de 1..n.
 */
export function problemasDelArbitraje(
  a: Arbitraje,
  id: string,
  union: number,
  n: number,
): string[] {
  const fuera: string[] = [];
  if (a.clip !== id) fuera.push(`es del clip «${a.clip}» y no de «${id}»`);
  const vistos = new Set<number>();
  for (const x of a.decisiones) {
    if (x.indice < 0 || x.indice >= union)
      fuera.push(`decide el hallazgo [${x.indice}], que no existe (hay ${union})`);
    if (vistos.has(x.indice)) fuera.push(`decide el hallazgo [${x.indice}] dos veces`);
    vistos.add(x.indice);
  }
  for (const [i, o] of a.omitidos.entries()) {
    const malos = o.fotogramas.filter((x) => x < 1 || x > n);
    if (malos.length > 0)
      fuera.push(`el omitido ${i} nombra fotogramas fuera de 1-${n}: ${malos.join(', ')}`);
  }
  return fuera;
}

/**
 * Lee el fichero de un juez de un clip, o lanza diciendo con qué orden se hace:
 * si falta, si es de antes de los paneles de hoy (los de Claude, que no llevan
 * huella) o si es de otros paneles (los de ChatGPT, por su huella; QA, H2).
 */
function delJuez<T>(
  esquema: z.ZodType<T>,
  dir: string,
  nombre: 'juicio.gpt' | 'juicio.claude' | 'arbitraje.gpt' | 'arbitraje.claude',
  orden: string,
  hoja: string,
  huella?: string,
): T {
  const ruta = join(dir, `${nombre}.json`);
  const v = leerSiHay(esquema, ruta);
  if (v === undefined) throw new Error(`falta ${ruta}: hazlo con ${orden}`);
  if (huella !== undefined ? !juicioVigente(ruta, huella, [hoja]) : deAntesDeLaHoja(ruta, hoja))
    throw new Error(
      `${ruta} es de otros paneles (la hoja cambió desde entonces): rehazlo con ${orden}`,
    );
  return v;
}

/** `jurado unir`: valida los dos juicios y escribe `union.json` de cada clip. */
export async function unir(
  f: Figura,
  ds: readonly number[],
  clips?: readonly string[],
): Promise<void> {
  for (const d of ds)
    for (const { clip, dir } of clipsRevisados(f, d, clips)) {
      const juicios: Partial<Record<Juez, Juicio>> = {};
      const huella = huellaDeLosPaneles(dir);
      const { fotogramas } = cifrasDe(dir);
      for (const juez of JUECES) {
        const nombre = `juicio.${juez}` as const;
        const j = delJuez(
          juicioSchema,
          dir,
          nombre,
          ordenDe(f, d, clip)[nombre],
          hojaDelClip(f, d, dir),
          juez === 'gpt' ? huella : undefined,
        );
        const problemas = problemasDelJuicio(j, idDelClip(f, d, clip), fotogramas);
        if (problemas.length > 0)
          throw new Error(
            `${join(dir, `${nombre}.json`)}: ${problemas.join('; ')}. Rehazlo con ${ordenDe(f, d, clip)[nombre]}`,
          );
        juicios[juez] = j;
      }
      const union = unirHallazgos(juicios);
      await writeFile(join(dir, 'union.json'), `${JSON.stringify(union, null, 1)}\n`);
      console.log(
        `d${d} ${clip.padEnd(7)} ${union.length} hallazgos (${union.filter((u) => u.fuentes.length > 1).length} de los dos)`,
      );
    }
}

/** El prompt del árbitro: el del juez hasta sus reglas, y la lista unida para decidir. */
export function promptDelArbitro(
  promptDelJuez: string,
  union: readonly HallazgoUnido[],
  id: string,
): string {
  const base = promptDelJuez.split('Mira cada fotograma con cuidado')[0] as string;
  const lineas =
    union.length === 0
      ? ['  (ningún hallazgo)']
      : union.map(
          (u) =>
            `  [${u.indice}] ${u.hallazgo.categoria}/${u.hallazgo.tipo} fotogramas ${u.hallazgo.fotogramas.join(', ')} sev ${u.hallazgo.severidad}: ${u.hallazgo.que_se_ve}`,
        );
  return `${base}Dos jueces ya revisaron este clip. Eres el ÁRBITRO: mira tú las imágenes con cuidado y decide, hallazgo a hallazgo, si el defecto es REAL (se ve en esos fotogramas), FALSO (no está, o es una diferencia que las reglas no cuentan: estilo, arma del personaje frente al palo, volumen de la armadura) o DUDOSO. Después añade en \`omitidos\` los defectos reales de severidad 2 o más que ningún juez vio, con la corrección que le darías al pintor. No te fíes de los jueces: compruébalo todo.

Hallazgos de los jueces:
${lineas.join('\n')}

Devuelve SOLO el JSON del esquema: en \`decisiones\`, una por hallazgo, con \`indice\` (el número entre corchetes). \`clip\`: «${id}».`;
}

/** `jurado arbitrar`: el árbitro de ChatGPT de cada clip y el prompt del de Claude. */
export async function arbitrar(
  f: Figura,
  ds: readonly number[],
  clips?: readonly string[],
): Promise<void> {
  const tareas: Promise<void>[] = [];
  for (const d of ds)
    for (const { clip, dir } of clipsRevisados(f, d, clips)) {
      if (!existsSync(join(dir, 'union.json')))
        throw new Error(`falta ${join(dir, 'union.json')}: hazlo con ${ordenDe(f, d, clip).union}`);
      const union = leerUnion(dir);
      const prompt = promptDelArbitro(
        await readFile(join(dir, 'prompt.md'), 'utf8'),
        union,
        idDelClip(f, d, clip),
      );
      await escribirSiCambia(join(dir, 'arbitraje.prompt.md'), prompt);
      const salida = join(dir, 'arbitraje.gpt.json');
      const huella = huellaDeLosPaneles(dir, prompt);
      if (juicioVigente(salida, huella, [hojaDelClip(f, d, dir)])) continue;
      if (existsSync(salida))
        console.log(`  ↻ ${salida} era de otra unión o de otros paneles: se rehace`);
      tareas.push(
        juzgarConCodex(prompt, imagenesDe(dir), arbitrajeSchema, salida).then(async (a) => {
          await apuntarHuella(salida, huella);
          console.log(
            `d${d} ${clip.padEnd(7)} árbitro de ChatGPT: ${a.decisiones.map((x) => `[${x.indice}] ${x.decision}`).join(', ') || 'nada que decidir'}; ${a.omitidos.length} omitidos`,
          );
        }),
      );
    }
  await Promise.all(tareas);
}

/** Las respuestas del visor de una figura, o ninguna. */
export function respuestasDe(f: Figura): Respuestas {
  const ruta = join(RAIZ, f.revision, 'visor', 'respuestas.json');
  return leerSiHay(respuestasSchema, ruta) ?? {};
}

/** El veredicto de una dirección, tal como lo escribe `cruzar`. */
export interface Veredicto {
  readonly direccion: number;
  readonly clips: {
    readonly clip: string;
    readonly hoja: string;
    readonly fila: number;
    readonly hallazgos: HallazgoCruzado[];
  }[];
}

/** `jurado cruzar`: `veredicto.json` de cada dirección e `instrucciones-<h>.txt` por hoja. */
export async function cruzar(
  f: Figura,
  ds: readonly number[],
  soloClips?: readonly string[],
): Promise<Veredicto[]> {
  const respuestas = respuestasDe(f);
  const fuera: Veredicto[] = [];
  for (const d of ds) {
    const clips: Veredicto['clips'] = [];
    for (const { clip, dir } of clipsRevisados(f, d, soloClips)) {
      if (!existsSync(join(dir, 'union.json')))
        throw new Error(`falta ${join(dir, 'union.json')}: hazlo con ${ordenDe(f, d, clip).union}`);
      const union = leerUnion(dir);
      const { hoja, fila, fotogramas } = cifrasDe(dir);
      const promptDelArbitro = existsSync(join(dir, 'arbitraje.prompt.md'))
        ? readFileSync(join(dir, 'arbitraje.prompt.md'), 'utf8')
        : '';
      const arbitrajes: Partial<Record<Juez, Arbitraje>> = {};
      for (const juez of JUECES) {
        const nombre = `arbitraje.${juez}` as const;
        const a = delJuez(
          arbitrajeSchema,
          dir,
          nombre,
          ordenDe(f, d, clip)[nombre],
          hojaDelClip(f, d, dir),
          juez === 'gpt' ? huellaDeLosPaneles(dir, promptDelArbitro) : undefined,
        );
        const problemas = problemasDelArbitraje(a, idDelClip(f, d, clip), union.length, fotogramas);
        if (problemas.length > 0)
          throw new Error(
            `${join(dir, `${nombre}.json`)}: ${problemas.join('; ')}. Rehazlo con ${ordenDe(f, d, clip)[nombre]}`,
          );
        arbitrajes[juez] = a;
      }
      clips.push({
        clip,
        hoja,
        fila,
        hallazgos: cruzarArbitrajes(union, arbitrajes, respuestas, (i) =>
          casoDeDisputa(d, clip, i),
        ),
      });
    }
    const base = join(RAIZ, f.revision, `d${d}`);
    // Con `--clips`, lo de los demás clips se queda como estaba.
    const antes =
      soloClips !== undefined && existsSync(join(base, 'veredicto.json'))
        ? (
            JSON.parse(readFileSync(join(base, 'veredicto.json'), 'utf8')) as Veredicto
          ).clips.filter((c) => !soloClips.includes(c.clip))
        : [];
    const v: Veredicto = { direccion: d, clips: [...antes, ...clips] };
    await writeFile(join(base, 'veredicto.json'), `${JSON.stringify(v, null, 1)}\n`);
    // Las de cada hoja con algo que corregir; las de antes de una hoja que ya no tiene
    // nada se borran, para que no se cuelen en la versión `todo` (QA, H2).
    const instrucciones = instruccionesPorHoja(v.clips);
    for (const h of new Set(v.clips.map((c) => c.hoja))) {
      const ruta = join(base, `instrucciones-${h}.txt`);
      const texto = instrucciones[h];
      if (texto === undefined) await rm(ruta, { force: true });
      else await writeFile(ruta, `${texto}\n`);
    }
    for (const c of clips) {
      const cuenta = (e: Estado) => c.hallazgos.filter((h) => h.estado === e).length;
      const sinMirar = c.hallazgos.filter(
        (h) => h.estado === 'disputa' && h.persona === undefined,
      ).length;
      console.log(
        `d${d} ${c.clip.padEnd(7)} reales ${cuenta('real')}, falsos ${cuenta('falso')}, en disputa ${cuenta('disputa')}${sinMirar > 0 ? ` (${sinMirar} para el visor)` : ''}`,
      );
    }
    fuera.push(v);
  }
  return fuera;
}
