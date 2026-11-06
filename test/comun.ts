/**
 * Lo que comparten los tests sin ser de un área: la raíz del repositorio.
 *
 * Un solo sitio para ella (fase T de la reorganización de la arquitectura,
 * 06-11-2026): cada test que leía del disco llevaba su copia, y una copia con otra
 * forma —con barra al final, o percent-encoded— rompía en silencio a quien la
 * recortaba.
 */
import { resolve } from 'node:path';

/**
 * La raíz del repositorio, **sin barra al final** (`taller-huesos` corta
 * `RAIZ.length + 1` para quedarse con lo relativo) y decodificada.
 *
 * `new URL(...).pathname` devuelve la ruta PERCENT-ENCODED: en un checkout que
 * viva en una ruta con espacios o paréntesis daba `…/ruta%20con%20(…)/repo` y
 * los guardias morían con ENOENT al cargar el módulo, antes de que ninguno
 * llegara a comprobar nada. `import.meta.dirname` ya viene decodificado.
 */
export const RAIZ = resolve(import.meta.dirname, '..');
