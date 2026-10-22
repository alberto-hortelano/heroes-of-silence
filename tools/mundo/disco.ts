/**
 * Los mundos en disco (`assets/mundos/<id>/`): leerlos, juzgarlos con la misma
 * función que la página (`problemasDelMundo`), escribir uno nuevo (su `mundo.json`
 * y su plan congelado) y su lectura para el motor (`.cache/mundos/<id>/`).
 *
 * Lo comparten la orden `pnpm mundo` y el servidor de desarrollo que genera un
 * mundo desde el menú (`tools/mundo/motor.ts`).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildMap, type MapPlan } from '../../src/core/map/generate.js';
import { idDeMundoBlocker, type Mundo, noEsJson } from '../../src/core/mundo/formato.js';
import { type LecturaParaElMotor, lecturaParaElMotor } from '../../src/core/mundo/lectura.js';
import { mundoNuevo, type PedidoDeMundo } from '../../src/core/mundo/partida.js';
import { type CrudosDelMundo, problemasDelMundo } from '../../src/core/mundo/validar.js';

export const RAIZ = resolve(import.meta.dirname, '../..');
export const DIR_MUNDOS = join(RAIZ, 'assets/mundos');
export const DIR_LECTURAS = join(RAIZ, '.cache/mundos');

export const FICHEROS = ['mundo', 'plan', 'historia'] as const;

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
 * Los tres ficheros de un mundo, o los problemas de leerlos: el que falta o no es
 * JSON se dice con su nombre, como los problemas de dentro.
 */
export async function leerCrudos(
  id: string,
): Promise<{ crudos: CrudosDelMundo } | { problemas: string[] }> {
  const dir = carpetaDe(id);
  if (!existsSync(dir)) return { problemas: [`no hay ningún mundo "${id}" en assets/mundos/`] };
  // Los tres a la vez, cada uno con su problema o su contenido, en el orden de `FICHEROS`.
  const leidos = await Promise.all(
    FICHEROS.map(async (f): Promise<{ problema: string } | { crudo: unknown }> => {
      const ruta = join(dir, `${f}.json`);
      if (!existsSync(ruta)) {
        return {
          problema:
            f === 'historia'
              ? `historia.json: no está; la escribe el motor (assets/mundos/${id}/historia.json)`
              : `${f}.json: no está en assets/mundos/${id}/`,
        };
      }
      try {
        return { crudo: JSON.parse(await readFile(ruta, 'utf8')) };
      } catch (err) {
        return { problema: noEsJson(f, err) };
      }
    }),
  );
  const problemas = leidos.flatMap((l) => ('problema' in l ? [l.problema] : []));
  if (problemas.length > 0) return { problemas };
  const [mundo, plan, historia] = leidos.map((l) => ('crudo' in l ? l.crudo : undefined));
  return { crudos: { mundo, plan, historia } };
}

/** Todos los problemas de un mundo en disco: vacío, se juega. */
export async function validarEnDisco(id: string): Promise<string[]> {
  const leido = await leerCrudos(id);
  return 'problemas' in leido ? leido.problemas : problemasDelMundo(leido.crudos, id);
}

/** Si hay un mundo con ese id: su `mundo.json`. Lo que se pide con él no se genera (409). */
export function hayMundo(id: string): boolean {
  return existsSync(join(carpetaDe(id), 'mundo.json'));
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
  if (existsSync(join(carpetaDe(id), 'historia.json'))) return false;
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
  await writeFile(join(dir, 'mundo.json'), `${JSON.stringify(mundo, null, 2)}\n`);
  await writeFile(join(dir, 'plan.json'), `${JSON.stringify(plan)}\n`);
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
  const dir = carpetaDe(id);
  const mundo = JSON.parse(await readFile(join(dir, 'mundo.json'), 'utf8')) as Mundo;
  const plan = JSON.parse(await readFile(join(dir, 'plan.json'), 'utf8')) as MapPlan;
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
