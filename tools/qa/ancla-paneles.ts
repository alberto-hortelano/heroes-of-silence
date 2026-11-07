/**
 * Reescribe el ancla del marcado de los paneles, `test/fixtures/paneles.txt`.
 *
 *     npx tsx tools/qa/ancla-paneles.ts
 *
 * Se corre A MANO y a propósito, y es la comprobación misma: ningún test compara
 * contra el ancla desde el 03-11-2026 (`b0e0ba5f`, que sacó los tests que fijan
 * cifras del catálogo, por decisión del usuario; las escenas, en
 * `test/escenas-paneles.ts`). Tras correrlo, `git diff test/fixtures/` dice si el
 * marcado se movió: si no se quería, es un fallo; si se quería, el fichero va en el
 * commit con el cambio que lo justifica. Un ancla que se regenera sola en cada
 * cambio no ancla nada: se limitaría a certificar lo que acabe de salir.
 *
 * Existe porque la reescritura de `views/panels.ts` para que pase por la puerta
 * de escapar toca sus 169 interpolaciones y no debe mover ni un byte de lo
 * pintado: el ancla se generó con el código de ANTES de tocarlo.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { volcado } from '../../test/escenas-paneles.js';

const destino = fileURLToPath(new URL('../../test/fixtures/paneles.txt', import.meta.url));
const texto = await volcado();
writeFileSync(destino, texto, 'utf8');
console.log(`ancla escrita: ${texto.split('\n').length - 1} líneas, ${texto.length} bytes`);
