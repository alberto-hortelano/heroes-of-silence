/**
 * Los mundos en disco (`assets/mundos/<id>/`): leerlos, juzgarlos con la misma
 * función que la página (`problemasDelMundo`) y, además, su biblia
 * (`problemaDeLaBiblia`), escribir uno nuevo (su `mundo.json` y su plan congelado)
 * y su lectura para el motor (`.cache/mundos/<id>/`).
 *
 * Lo comparten la orden `pnpm mundo` y el servidor de desarrollo que genera un
 * mundo desde el menú (`tools/mundo/motor.ts`).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { buildMap, type MapPlan } from '../../src/core/map/generate.js';
import {
  idDeMundoBlocker,
  type Mundo,
  type MundoLeido,
  noEsJson,
} from '../../src/core/mundo/formato.js';
import { type LecturaParaElMotor, lecturaParaElMotor } from '../../src/core/mundo/lectura.js';
import { mundoNuevo, type PedidoDeMundo } from '../../src/core/mundo/partida.js';
import { type CrudosDelMundo, leerMundo, problemasDelMundo } from '../../src/core/mundo/validar.js';

export const RAIZ = resolve(import.meta.dirname, '../..');
export const DIR_MUNDOS = join(RAIZ, 'assets/mundos');
export const DIR_LECTURAS = join(RAIZ, '.cache/mundos');

/** La carpeta de un mundo, o lanza si el id no tiene la forma: va en una ruta de disco. */
export function carpetaDe(id: string): string {
  const motivo = idDeMundoBlocker(id);
  if (motivo !== null) throw new Error(motivo);
  return join(DIR_MUNDOS, id);
}

/** La carpeta de la lectura de un mundo para el motor. */
export function lecturaDe(id: string): string {
  carpetaDe(id);
  return join(DIR_LECTURAS, id);
}

/**
 * Los ficheros de un mundo, en el orden en que se leen. `mundo.json` y el plan los
 * escribe `pnpm mundo nuevo` (o el menú); la biblia y la historia, el motor (`motor`:
 * cómo se dicen en la espera, y lo que se le recuerda si falta uno). De aquí salen lo
 * que el motor puede escribir (`argumentosDelMotor`), lo que se cuenta que hace
 * (`queHace`), la frase del que falta (`noEsta`) y qué línea del validador es un
 * problema (`problemaDeLaLinea`).
 */
export const FICHEROS_DEL_MUNDO = [
  { nombre: 'mundo.json', motor: null },
  { nombre: 'plan.json', motor: null },
  {
    nombre: 'biblia.md',
    motor: {
      la: 'la biblia',
      una: 'una biblia',
      falta: 'la escribe el motor antes que la historia',
    },
  },
  {
    nombre: 'historia.json',
    motor: { la: 'la historia', una: 'una historia', falta: 'la escribe el motor' },
  },
] as const;

export type FicheroDelMundo = (typeof FICHEROS_DEL_MUNDO)[number];
export type FicheroDelMotor = Extract<FicheroDelMundo, { motor: object }>;

/** Los que escribe el motor: la biblia y la historia. */
export const FICHEROS_DEL_MOTOR: readonly FicheroDelMotor[] = FICHEROS_DEL_MUNDO.filter(
  (f): f is FicheroDelMotor => f.motor !== null,
);

/** La ruta de un fichero de un mundo; lanza con un id que no tiene la forma (`carpetaDe`). */
export function rutaDelFichero(id: string, nombre: FicheroDelMundo['nombre']): string {
  return join(carpetaDe(id), nombre);
}

/** Una ruta dentro del repositorio, relativa a él: la que se le dice al motor y a la persona. */
export function enElRepo(ruta: string): string {
  return relative(RAIZ, ruta);
}

/** La fila de la tabla de un fichero del mundo. */
function fichero<N extends FicheroDelMundo['nombre']>(
  nombre: N,
): Extract<FicheroDelMundo, { nombre: N }> {
  const f = FICHEROS_DEL_MUNDO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`«${nombre}» no es un fichero de un mundo`);
  return f as Extract<FicheroDelMundo, { nombre: N }>;
}

/** Lo que se dice de un fichero que falta; del motor, que lo escribe él y dónde. */
function noEsta(id: string, f: FicheroDelMundo): string {
  return f.motor === null
    ? `${f.nombre}: no está en assets/mundos/${id}/`
    : `${f.nombre}: no está; ${f.motor.falta} (${enElRepo(rutaDelFichero(id, f.nombre))})`;
}

/**
 * Un problema como lo escribe `pnpm mundo validar`, uno por línea. Su inversa es
 * `problemaDeLaLinea`, que lee el motor en la respuesta del validador.
 */
export function lineaDeProblema(problema: string): string {
  return `- ${problema}`;
}

/** El problema de una línea de `pnpm mundo validar` (`lineaDeProblema`), o `null` si no es una. */
export function problemaDeLaLinea(linea: string): string | null {
  const l = linea.trim();
  if (!l.startsWith('- ')) return null;
  const problema = l.slice(2);
  return FICHEROS_DEL_MUNDO.some((f) => problema.startsWith(`${f.nombre}: `)) ? problema : null;
}

/** Un mundo en disco: su biblia (o `null` si no está) y sus JSON, o los problemas de leerlos. */
export type MundoEnDisco = { readonly biblia: string | null } & (
  | { readonly crudos: CrudosDelMundo }
  | { readonly problemas: readonly string[] }
);

/**
 * Un mundo en disco, leído una vez y todo a la vez. Un JSON que falta o no es JSON se
 * dice con su nombre, como los problemas de dentro; la biblia que falta no es un
 * problema de leer, la juzga `problemaDeLaBiblia`. Sin carpeta, `sinMundo`.
 */
export async function leerCrudos(
  id: string,
): Promise<MundoEnDisco | { readonly sinMundo: string }> {
  if (!existsSync(carpetaDe(id)))
    return { sinMundo: `no hay ningún mundo "${id}" en assets/mundos/` };
  const textos = await Promise.all(
    FICHEROS_DEL_MUNDO.map(async (f) => {
      const ruta = rutaDelFichero(id, f.nombre);
      return [f.nombre, existsSync(ruta) ? await readFile(ruta, 'utf8') : null] as const;
    }),
  );
  const texto = new Map(textos);
  const problemas: string[] = [];
  const json = (nombre: 'mundo.json' | 'plan.json' | 'historia.json'): unknown => {
    const t = texto.get(nombre) ?? null;
    if (t === null) {
      problemas.push(noEsta(id, fichero(nombre)));
      return undefined;
    }
    try {
      return JSON.parse(t);
    } catch (err) {
      problemas.push(noEsJson(nombre.replace(/\.json$/, ''), err));
      return undefined;
    }
  };
  const crudos = {
    mundo: json('mundo.json'),
    plan: json('plan.json'),
    historia: json('historia.json'),
  };
  const biblia = texto.get('biblia.md') ?? null;
  return problemas.length > 0 ? { biblia, problemas } : { biblia, crudos };
}

/**
 * Un mundo en disco ya leído, para jugarlo o medirlo, con el texto de su biblia (o
 * `null`: no la exige, para medir también los mundos de antes). Lanza con los
 * problemas de leerlo o de juzgarlo (`leerMundo`).
 */
export async function leerMundoDeDisco(
  id: string,
): Promise<{ readonly mundo: MundoLeido; readonly biblia: string | null }> {
  const leido = await leerCrudos(id);
  if ('sinMundo' in leido) throw new Error(leido.sinMundo);
  if ('problemas' in leido) {
    throw new Error(
      `el mundo "${id}" no se puede leer:\n${leido.problemas.map(lineaDeProblema).join('\n')}`,
    );
  }
  return { mundo: leerMundo(leido.crudos, id), biblia: leido.biblia };
}

/**
 * Cuántas palabras lleva como poco una biblia. Lo justo para que no sea un
 * resumen disfrazado: la skill pide de 1 500 a 4 000, y una de 400 ya no cabe en
 * un párrafo (qué pasó antes, quién es quién, la trama y sus desenlaces). Es un
 * suelo contra la biblia vacía o ridícula, no una medida de calidad: esa la mira
 * quien lee la biblia (el QA), no el validador.
 */
export const PALABRAS_MINIMAS_DE_LA_BIBLIA = 400;

/** Las palabras de un texto: lo que va entre blancos. La cuenta de la biblia y de su medida. */
export function palabrasDe(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}

/**
 * Lo que le falta a la biblia de un mundo (`biblia.md`, la trama en prosa que el
 * motor escribe antes que `historia.json`), o `null` si vale. `texto` es lo que hay
 * en el fichero, o `null` si no está. Solo en disco: el juego no la lee, la página
 * no la carga (`client/mundo/cargar.ts`) y ningún mundo va al build; la piden
 * `pnpm mundo validar` y el servidor que genera, por `validarEnDisco`.
 */
export function problemaDeLaBiblia(texto: string | null, id: string): string | null {
  if (texto === null) return noEsta(id, fichero('biblia.md'));
  const palabras = palabrasDe(texto);
  return palabras < PALABRAS_MINIMAS_DE_LA_BIBLIA
    ? `biblia.md: tiene ${palabras} palabras y una biblia lleva al menos ${PALABRAS_MINIMAS_DE_LA_BIBLIA}: qué pasó antes, quién es quién, la trama y sus desenlaces`
    : null;
}

/**
 * Todos los problemas de un mundo en disco: vacío, se juega. **La biblia primero**:
 * es lo primero que escribe el motor, y se juzga aunque falten los JSON.
 */
export async function validarEnDisco(id: string): Promise<string[]> {
  const leido = await leerCrudos(id);
  if ('sinMundo' in leido) return [leido.sinMundo];
  const biblia = problemaDeLaBiblia(leido.biblia, id);
  return [
    ...(biblia === null ? [] : [biblia]),
    ...('problemas' in leido ? leido.problemas : problemasDelMundo(leido.crudos, id)),
  ];
}

/** Si hay un mundo con ese id: su `mundo.json`. Lo que se pide con él no se genera (409). */
export function hayMundo(id: string): boolean {
  return existsSync(rutaDelFichero(id, 'mundo.json'));
}

/**
 * Si un id es de un mundo generado desde el menú (`gen-<AAAAMMDD>-<semilla>`): el
 * único que se borra solo. Uno puesto a mano (`prueba`, `ejemplo`) no se borra nunca.
 */
export function esGenerado(id: string): boolean {
  return id.startsWith('gen-');
}

/** Lanza si `id` no es de un mundo generado: lo que no lo es no se borra (`esGenerado`). */
function soloGenerado(id: string): void {
  if (!esGenerado(id))
    throw new Error(`el mundo "${id}" no es uno generado («gen-…»): no se borra`);
}

/**
 * Borra un mundo a medias —su carpeta y su lectura— si no tiene historia: lo que
 * deja una generación fallida antes de que el motor escribiera nada, que no se
 * juega y no se puede arreglar (H11 del QA de la F1a). Uno con historia se queda:
 * aunque no valga, se puede mirar y corregir con `pnpm mundo validar`. Lo llama
 * solo quien creó la carpeta (`tools/mundo/motor.ts`), y solo con un `gen-*`. `true`
 * si borró.
 */
export async function borrarSinHistoria(id: string): Promise<boolean> {
  soloGenerado(id);
  if (existsSync(rutaDelFichero(id, 'historia.json'))) return false;
  await borrarMundoGenerado(id);
  return true;
}

/**
 * Borra un mundo generado entero, con su historia y su lectura: lo que deja una
 * generación cancelada (M7 de la vuelta 2: quien cancela no quiere ese mundo). Lanza
 * con un id que no es `gen-*`.
 */
export async function borrarMundoGenerado(id: string): Promise<void> {
  soloGenerado(id);
  await rm(carpetaDe(id), { recursive: true, force: true });
  await rm(lecturaDe(id), { recursive: true, force: true });
}

/**
 * Escribe el `mundo.json` y el plan congelado de un mundo nuevo. No pisa uno que
 * ya existe: un mundo se genera una vez y se juega muchas.
 */
export async function escribirMundoNuevo(pedido: PedidoDeMundo): Promise<Mundo> {
  const dir = carpetaDe(pedido.id);
  if (hayMundo(pedido.id)) {
    throw new Error(`ya hay un mundo "${pedido.id}": bórralo a mano si quieres rehacerlo`);
  }
  const { mundo, plan } = mundoNuevo(pedido);
  await mkdir(dir, { recursive: true });
  await writeFile(rutaDelFichero(pedido.id, 'mundo.json'), `${JSON.stringify(mundo, null, 2)}\n`);
  await writeFile(rutaDelFichero(pedido.id, 'plan.json'), `${JSON.stringify(plan)}\n`);
  return mundo;
}

/**
 * La lectura de un mundo para el motor: `lectura.json` y, si `conPng`, `mapa.png`
 * (el mapa pintado por el taller), en `.cache/mundos/<id>/`. Pide solo el
 * `mundo.json` y el plan: la historia es lo que el motor va a escribir.
 */
export async function escribirLectura(
  id: string,
  conPng: boolean,
  alPintar?: () => void,
): Promise<{ lectura: LecturaParaElMotor; dir: string }> {
  const mundo = JSON.parse(await readFile(rutaDelFichero(id, 'mundo.json'), 'utf8')) as Mundo;
  const plan = JSON.parse(await readFile(rutaDelFichero(id, 'plan.json'), 'utf8')) as MapPlan;
  // Un mapa para la lectura y para el PNG: construirlo es lo más caro de leer.
  const hecho = buildMap(plan);
  const lectura = lecturaParaElMotor(mundo, plan, hecho);
  const salida = lecturaDe(id);
  await mkdir(salida, { recursive: true });
  await writeFile(join(salida, 'lectura.json'), `${JSON.stringify(lectura, null, 2)}\n`);
  if (conPng) {
    alPintar?.();
    // A demanda: Playwright y el escenógrafo solo hacen falta para el PNG.
    const { escenarioDeMapa } = await import('../taller/escenario/escenario.js');
    await escenarioDeMapa(hecho.map, mundo.semilla, `mundo-${id}`, 32, join(salida, 'mapa.png'));
  }
  return { lectura, dir: salida };
}
