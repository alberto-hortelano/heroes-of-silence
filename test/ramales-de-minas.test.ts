/**
 * Las dos puertas de la mina (#230): «Las minas podrían tener un camino hacia la
 * derecha para poder usar el que menos forzado quede» (marca del usuario en
 * s26000 (23,4)). Con una sola puerta, la de debajo, el ramal de una mina con el
 * radio al lado salía por debajo y doblaba su esquina para llegar a él.
 *
 * Se mira el mapa ya hecho, con la misma medida que `tools/qa/ramales.ts`: un
 * ramal **da la vuelta** si pisa tres o más vecinas de su mina. En el bucle
 * rápido, tres de las semillas de 1-20 donde alguno la daba antes (s1, s4 y s19,
 * con dos en s19; también s3, s7, s14 y s15); en la lenta, 1-200 con un techo:
 * 99 antes, 20
 * después (09-10-2026), los que quedan sin otro sitio por donde llegar (s16
 * (29,28): el radio pasa por el noroeste y la puerta de la derecha da a una
 * barrera).
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/state/setup.js';
import { ramalesDeMinas } from '../tools/qa/ramales.js';
import { LENTO, rango, segunPrisa } from './lento.js';

// Con los ríos (#144, 16-10-2026) la s19 es otro mapa y le queda una (como a
// s23 y s29 de 1-30): va la s14, otra de las que la daban antes de #230.
const SEMILLAS = segunPrisa([1, 4, 14], rango(1, 200));
/** En 1-200: 99 antes de #230, 20 después; 21 con los ríos (#144). */
const TECHO_EN_LA_LENTA = 25;

describe('la mina sale por la puerta menos forzada (#230)', () => {
  it('ningún ramal de mina da la vuelta a su mina donde antes la daba', () => {
    const vueltas: string[] = [];
    const porLaDerecha = { n: 0 };
    for (const s of SEMILLAS) {
      for (const r of ramalesDeMinas(newGame({ seed: s }).map)) {
        if (r.vuelta)
          vueltas.push(`s${s} ${r.mina} (${r.x},${r.y}) por ${r.sale}, ${r.pasos} pasos`);
        if (r.sale === 'e') porLaDerecha.n++;
      }
    }
    if (LENTO) expect(vueltas.length).toBeLessThanOrEqual(TECHO_EN_LA_LENTA);
    else expect(vueltas).toEqual([]);
    // Y la de la derecha se usa: en 1-200 sale por ella el 46 % (2 043 de 4 400).
    expect(porLaDerecha.n).toBeGreaterThan(0);
  });
});
