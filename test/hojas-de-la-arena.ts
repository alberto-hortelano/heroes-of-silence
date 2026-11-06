/**
 * Las hojas de la arena del repo, leídas del disco una vez por fichero de test
 * (`hojasDelTaller`). Aparte de los demás ayudantes porque leerlas trae el lado de
 * disco de la arena y, con él, el taller: un test que no las pide no lo carga.
 * (De `test/helpers.ts`, fase T, 06-11-2026.)
 */
import { resolve } from 'node:path';
import type { Hoja } from '../src/core/unidad.js';
import { hojasDelTaller } from '../tools/arena/borrador.js';

let hojasLeidas: readonly Hoja[] | null = null;

/** Las hojas de la arena del repo, leídas una vez por fichero de test. */
export function hojasDeLaArena(): readonly Hoja[] {
  hojasLeidas ??= hojasDelTaller(resolve(import.meta.dirname, '..'));
  return hojasLeidas;
}

/** La hoja `id` de la arena del repo; lanza si no está. */
export function hojaDeLaArena(id: string): Hoja {
  const hoja = hojasDeLaArena().find((h) => h.id === id);
  if (hoja === undefined) throw new Error(`no hay hoja ${id}`);
  return hoja;
}
