/**
 * El ancla del marcado de los paneles.
 *
 * No comprueba que el marcado sea BUENO: comprueba que sea **el mismo**. Existe
 * para una tarea concreta —pasar las 169 interpolaciones de `views/panels.ts`
 * por la puerta de escapar sin mover un píxel— y para la clase de cambio que
 * viene detrás: uno mecánico, sobre líneas que ningún test mira, donde un
 * espacio de más o un `&lt;` donde había un `<` no lo ve nadie.
 *
 * Las catorce escenas están en `escenas-paneles.ts` y buscan ramas, no realismo:
 * el castillo con héroe dentro y sin él, la batalla en marcha y terminada, el
 * turno del rival —lo único que enseña un botón deshabilitado—, y dos volcados
 * sintéticos con los quince hechos del parte de guerra y los diecisiete de la
 * crónica, que jugando no salen nunca todos.
 *
 * Si sale rojo: mira el diff. Si el cambio de píxel se quería, se regenera con
 * `npx tsx tools/qa/ancla-paneles.ts` y el fichero va en el mismo commit que lo
 * justifica. El generador NO lo llama este test a propósito: un ancla que se
 * repone sola certifica lo que acabe de salir.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { volcado } from './escenas-paneles.js';

const ANCLA = fileURLToPath(new URL('fixtures/paneles.txt', import.meta.url));

describe('el marcado de los paneles', () => {
  it('sale byte a byte igual que su ancla', async () => {
    const esperado = readFileSync(ANCLA, 'utf8');
    const salida = await volcado();

    // Se comparan por líneas y no de un tirón: con 34 KB en un solo `toBe`, el
    // diff que enseña vitest es ilegible y lo que importa es la PRIMERA línea
    // que se mueve, que es la que dice qué interpolación se torció.
    const suyas = esperado.split('\n');
    const mias = salida.split('\n');
    for (let i = 0; i < Math.max(suyas.length, mias.length); i++) {
      expect(mias[i], `línea ${i + 1} del volcado`).toBe(suyas[i]);
    }
    expect(salida).toBe(esperado);
  });
});
