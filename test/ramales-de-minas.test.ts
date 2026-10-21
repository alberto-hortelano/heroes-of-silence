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
// s23 y s29 de 1-30): va la s14, otra de las que la daban antes de #230. Con
// el río de una casilla (#144, paso 2) le queda una a la s1 (como a s2, s19,
// s27 y s29 de 1-30): va la s3, otra de las de antes de #230. Con el río de una
// casilla al pie de la meseta (#144, paso 2b) le queda una a la s4 (como a s19,
// s26 y s29 de 1-30; la de s4, (4,39), sin otro sitio: el radio pasa por el
// noroeste y al oeste de la puerta de debajo hay bosque): va la s7, otra de las
// de antes de #230. Sin agua de frontera fuera del río (QA del río continuo,
// H3) le queda una a la s7 ((3,37), junto al borde, como a s10 de 1-20): va la
// s1, que vuelve a no tener ninguna. Con el recinto de las ciudades del núcleo
// (vuelta 3, 21-10-2026) le queda una a la s3 (mine-5 (39,39), junto al borde):
// va la s4, que vuelve a no tener ninguna.
const SEMILLAS = segunPrisa([1, 4, 14], rango(1, 200));
/**
 * En 1-200: 99 antes de #230, 20 después; 21 con los ríos (#144); 24 con el paso 2b; 31 con el río
 * continuo (#144, paso 1 del rediseño, 16-10-2026); 26 sin agua de frontera fuera del río (QA del río continuo, H3); 25 con el recinto de las ciudades del núcleo (vuelta 3, 21-10-2026). No es el río a la vista: los que se añaden rodean
 * lagos de obstáculo, el borde o la esquina de la casa de abajo (mine-3 y mine-5). Es el veto de las
 * esquinas del río en la búsqueda, que aparta los radios, y los vestidos que se tiran cuando una
 * senda aún la corta, que dan otros mapas: sin ninguno de los dos, 24; con el veto, 27; con los dos, 31. El techo es lo medido más uno.
 */
const TECHO_EN_LA_LENTA = 27;

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
