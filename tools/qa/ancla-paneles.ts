/**
 * Reescribe el ancla del marcado de los paneles, `test/fixtures/paneles.txt`.
 *
 *     npx tsx tools/qa/ancla-paneles.ts
 *
 * Se corre A MANO y a propósito, nunca desde el test. Un ancla que se regenera
 * sola no ancla nada: se limitaría a certificar lo que acabe de salir. Cuando
 * `pnpm test` la ve moverse, la pregunta es si el cambio de píxel se quería —y
 * solo entonces se corre esto y se commitea el fichero con el cambio que lo
 * justifica.
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
