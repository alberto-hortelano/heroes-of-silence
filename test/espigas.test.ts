/**
 * Una elevación no acaba de repente (#210).
 *
 * La queja del usuario: «la falta de coherencia con los desniveles… una
 * elevacion no puede acabar de repente, sin continuidad». La auditoría 5 lo
 * midió en 10 semillas: 112 casillas de tierra o acantilado más altas que sus
 * dos vecinas este y oeste —lenguas de tierra en el agua, el pasillo de un nodo
 * por el agua, espolones de acantilado en lo bajo— y 351 lados de caída 3, del
 * agua encajada un nivel bajo su orilla más baja entre dos mesetas.
 *
 * El nivel de cada casilla sale de una regla del núcleo (`nivelesDelRelieve`),
 * la misma que pinta la escena (`relieve`) y que mira el generador al engordar
 * las fronteras (`quitarEspigas`, en `vestir.ts`):
 * - el agua, plana, a ras de la más baja de las regiones que toca su franja;
 * - lo demás, por las dos regiones que separa en esa casilla, al de la alta;
 * - y ninguna barrera ni nodo de una casilla de ancho por encima de sus dos
 *   lados: baja hasta lo más alto de ellos.
 * Lo que se pisa va al nivel de su región y no se toca: sus espigas las quita
 * el generador, rellenándolas de la barrera baja o ensanchando el pasillo.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { relieve } from '../src/client/render/escenario/relieve.js';
import { generateMapPlan } from '../src/core/map/generate.js';
import { espigasDelRelieve, nivelesDelRelieve } from '../src/core/map/regiones.js';
import type { TerrainKind } from '../src/core/map/terrain.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { itLento, rango, segunPrisa } from './lento.js';

/** Un terreno a mano: una letra por casilla (`g` hierba, `~` agua, `/` acantilado, `^` montaña). */
function rejilla(filas: readonly string[]): {
  W: number;
  H: number;
  terreno: TerrainKind[];
} {
  const LETRA: Record<string, TerrainKind> = {
    g: 'grass',
    '~': 'water',
    '/': 'cliff',
    '^': 'mountain',
  };
  return {
    W: (filas[0] as string).length,
    H: filas.length,
    terreno: filas.flatMap((f) => [...f].map((c) => LETRA[c] as TerrainKind)),
  };
}

/** Las regiones de una rejilla, por casilla: una letra por casilla, `.` sin región. */
const regionesDe = (filas: readonly string[]): Int32Array =>
  Int32Array.from(filas.flatMap((f) => [...f].map((c) => (c === '.' ? -1 : Number(c)))));

describe('la regla del nivel de cada casilla (#210)', () => {
  it('el agua va plana, a ras de la región más baja que toca, y no se encaja', () => {
    // Región 0 a nivel 2 arriba, región 1 a nivel 0 abajo; el río entre las dos.
    const { W, H, terreno } = rejilla(['ggggg', '~~~~~', '~~~~~', 'ggggg']);
    const regionDe = regionesDe(['00000', '.....', '.....', '11111']);
    const nivel = nivelesDelRelieve(W, H, terreno, regionDe, [2, 0], []);
    expect([...nivel]).toEqual([2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Entre dos mesetas a 2, a 2: un río en lo alto, sin cañón.
    expect([...nivelesDelRelieve(W, H, terreno, regionDe, [2, 2], [])].every((n) => n === 2)).toBe(
      true,
    );
  });

  it('un acantilado va al nivel alto de las dos regiones que separa ahí, no al de toda su franja', () => {
    // La franja de acantilado separa 0 (nivel 1) de 1 (nivel 0) a la izquierda y
    // 2 (nivel 2) de 1 a la derecha. A la izquierda va a 1, no a 2.
    const filas = ['ggg/ggg', 'ggg/ggg', '///////', 'ggggggg'];
    const regs = ['000.222', '000.222', '.......', '1111111'];
    const { W, H, terreno } = rejilla(filas);
    const nivel = nivelesDelRelieve(W, H, terreno, regionesDe(regs), [1, 0, 2], []);
    expect(nivel[2 * W]).toBe(1);
    expect(nivel[2 * W + 6]).toBe(2);
  });

  it('el espolón de una casilla de ancho baja a lo que tiene a los lados; la tierra no se toca', () => {
    // Una montaña de la meseta (región 0, nivel 2) que se mete en lo bajo
    // (región 1, nivel 0) como un dedo de una casilla.
    const filas = ['ggggg', '^^^^^', 'gg^gg', 'gg^gg', 'ggggg'];
    const regs = ['00000', '.....', '11.11', '11.11', '11111'];
    const { W, H, terreno } = rejilla(filas);
    const nivel = nivelesDelRelieve(W, H, terreno, regionesDe(regs), [2, 0], []);
    expect(nivel[2 * W + 2]).toBe(0);
    expect(nivel[3 * W + 2]).toBe(0);
    expect(nivel[W + 2]).toBe(2);
    expect(espigasDelRelieve(W, H, nivel)).toEqual([]);
    // Y el guardia muerde: una lengua de tierra de la meseta en el agua baja.
    const lengua = rejilla(['ggggg', '~~g~~', '~~g~~', 'ggggg']);
    const suyas = regionesDe(['00000', '..0..', '..0..', '11111']);
    const n = nivelesDelRelieve(lengua.W, lengua.H, lengua.terreno, suyas, [2, 0], []);
    expect(espigasDelRelieve(lengua.W, lengua.H, n)).toEqual([7, 12]);
  });

  it('el paso sin camino que iría al alto con agua a los lados baja con ella', () => {
    // El nodo (2,1) une la región 0 (nivel 2) con la 1 (nivel 1), y el agua
    // de los lados va a 1: al alto sería un pilar.
    const { W, H, terreno } = rejilla(['ggggg', '~~g~~', 'ggggg']);
    const regionDe = regionesDe(['00000', '.....', '11111']);
    const nodo = { casilla: W + 2, regiones: [0, 1], alBajo: false };
    const nivel = nivelesDelRelieve(W, H, terreno, regionDe, [2, 1], [nodo]);
    expect(nivel[W + 2]).toBe(1);
  });
});

describe('en los mapas del procedimental (#210)', () => {
  it.each(segunPrisa([2, 5], rango(1, 200)))(
    'semilla %i: ninguna caída de más de 2 y el agua plana',
    (semilla) => {
      const map = newGame({ seed: semilla }).map;
      const a = analizar(map);
      const { nivel } = relieve(a);
      const W = map.width;
      for (let i = 0; i < W * map.height; i++)
        for (const j of [i % W < W - 1 ? i + 1 : -1, i + W < W * map.height ? i + W : -1]) {
          if (j < 0) continue;
          const caida = Math.abs((nivel[i] as number) - (nivel[j] as number));
          expect(caida, `(${i % W},${Math.floor(i / W)})`).toBeLessThanOrEqual(2);
          if (a.terreno[i] === 'water' && a.terreno[j] === 'water') expect(caida).toBe(0);
        }
    },
  );

  itLento('el alto es la excepción: menos de una región de cada cuatro a nivel 2 en 1-200', () => {
    // Con la nieve y la lava siempre a 2 eran el 35,6 % de las regiones y el
    // 39,3 % de las casillas; s13 llevaba el 72 % a 2 (auditoría 5). Con los
    // pesos de `data/relieve.json` de #210, 19,0 % y 21,6 % (08-10-2026).
    const cuenta = [0, 0, 0];
    for (const s of rango(1, 200))
      for (const r of generateMapPlan(createRng(s)).regions) cuenta[r.nivel ?? 1]! += 1;
    const total = cuenta[0]! + cuenta[1]! + cuenta[2]!;
    expect((100 * cuenta[2]!) / total).toBeLessThan(25);
    expect((100 * cuenta[1]!) / total).toBeGreaterThan(50);
  });
});
