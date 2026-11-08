/**
 * La raíz del repositorio para las herramientas: la única que se calcula desde
 * dónde está un fichero (la de los tests es la suya, `test/comun.ts`).
 *
 * Cada herramienta llevaba su copia, `resolve(import.meta.dirname, '../..')`, con
 * la profundidad de su carpeta escrita a mano (43 copias, con `'../../..'` las de
 * las subcarpetas del taller, y alguna más subiendo en línea). Mover un fichero de
 * carpeta rompía su copia **al ejecutarse**, y `tsc` no lo ve: la ruta sale bien
 * formada y apunta a otro sitio. Con una sola, quien se mueve cambia su `import` y
 * el compilador lo comprueba (fase H de la reorganización, 08-11-2026). Lo vigila
 * `invariantes-capas.test.ts`.
 *
 * **Sin barra al final** (quien recorta lo relativo hace `ruta.replace(`${RAIZ}/`,
 * '')`) y decodificada: `import.meta.dirname` ya viene sin el percent-encoding de
 * `new URL(…).pathname`, que en un checkout con espacios daba otra ruta.
 *
 * `vite.config.ts` empaqueta lo que importa y le reescribe `import.meta.dirname`
 * fichero a fichero con el de su original, así que también vale ahí.
 */
import { resolve } from 'node:path';

export const RAIZ = resolve(import.meta.dirname, '../..');
