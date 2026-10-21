/**
 * La cubierta es la del suelo que se pinta donde tiene el pie (#220, auditoría
 * 7 §4). Lo alto de un acantilado y el nodo sin camino que va al alto tomaban
 * la del suelo más cercano de cualquier nivel (`Analisis.suelo`), el de la
 * región baja de al lado: nieve y abetos nevados sobre la lava de s13 (16-24,
 * 4-7), hierba sobre la nieve de s80 (18, 12-13), coles sobre la lava de s57
 * (0-5, 8). Antes del arreglo, `cubiertaDeOtroNivel` daba 494 piezas en 1-40
 * (s13 56, s80 53, s57 18); ahora, 0.
 *
 * Y la frontal de basalto lleva su tono, el de sus laderas (#220, §3).
 */

import type { Suelo } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { cubiertaDeOtroNivel, type Sprite } from '../src/client/render/escenario/colocar.js';
import { partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

/** Una pieza de la hoja `hoja` con el pie en `(x, y)`. */
const pieza = (hoja: string, x: number, y: number, clase: Sprite['clase'] = 'cubierta') => ({
  src: `modulos/${hoja}/1.webp`,
  x,
  y,
  clase,
});

describe('cubiertaDeOtroNivel: el guardia muerde', () => {
  // Dos casillas: lava a la izquierda, nieve a la derecha.
  const pintado: Suelo[] = ['lava', 'snow'];

  it('la nieve sobre la lava cuenta; en la nieve, no', () => {
    const nieve = pieza('cubierta-snow', 0.5, 0.9);
    expect(cubiertaDeOtroNivel([nieve], pintado, 2)).toEqual([nieve]);
    expect(cubiertaDeOtroNivel([{ ...nieve, x: 1.5 }], pintado, 2)).toEqual([]);
  });

  it('un abeto nevado de cubierta cuenta en cualquier suelo: lo que se pisa no lleva árboles (14-10-2026)', () => {
    const abeto = pieza('abetos-nevados', 0.4, 0.8);
    const enLaNieve = { ...abeto, x: 1.4 };
    expect(cubiertaDeOtroNivel([abeto, enLaNieve], pintado, 2)).toEqual([abeto, enLaNieve]);
  });

  it('la mezcla de su suelo (lo áspero en la lava) no cuenta, ni la roca, ni un marcador', () => {
    expect(
      cubiertaDeOtroNivel(
        [
          pieza('cubierta-lava', 0.5, 0.9),
          pieza('cubierta-rough', 0.5, 0.9),
          pieza('rocas-caidas', 0.5, 0.9, 'roca'),
          { ...pieza('cubierta-snow', 0.5, 0.9), src: null },
        ],
        pintado,
        2,
      ),
    ).toEqual([]);
  });
});

/**
 * Los casos de la auditoría 7 en `pnpm verify`; en la orden lenta, además, 1-40.
 * La 51 en vez de la 13 desde #226: en 42×42 la meseta de lava sobre la nieve
 * era la de s51 (17-22, 8-9), y la s13 no tiene lava en lo alto. Desde las
 * fronteras onduladas (#229), la de s18 (27-31, 15-24), y desde las dos puertas
 * de la mina (#230, 09-10-2026), que dejan la s18 sin meseta, la de s36 (30-34, 0-8).
 * Desde el río de una casilla (#144, paso 2), que deja la s36 sin lava, la de s24.
 * Desde el río continuo (#144), que deja la s24 sin meseta, la de s63.
 */
const SEMILLAS = LENTO ? [...rango(1, 40), 57, 63, 80] : [63, 80, 57];

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ninguna cubierta es de otro suelo que el que se pinta, por fuera y por el informe`, () => {
      const { escena: e } = partidaDe(semilla);
      expect(e.informe.cubiertaDeOtroNivel).toBe(0);
      expect(cubiertaDeOtroNivel(e.sprites, e.suelo, e.W)).toEqual([]);
    });

  it('s98: lo alto de la meseta de lava, con la nieve como suelo más cercano, lleva roca y nada de nieve', () => {
    // Era s13 (16-24, 4-7) en 34×34; desde #226, s51 (17-22, 8-9), y desde
    // las fronteras onduladas (#229), s18 (27-31, 15-24), y desde las dos
    // puertas de la mina (#230, 09-10-2026), s36 (30-34, 0-8). Con los ríos
    // (#144, 16-10-2026) se busca por lo que es: las casillas de acantilado con
    // la nieve como suelo más cercano y lava pintada (17 en s36; con el río de
    // una casilla, #144 paso 2, 0 en s36 y 17 en s24; con el río continuo,
    // #144, 0 en s24, que no tiene meseta, y 20 en s63, la primera de 1-120
    // con alguna; también s70 y s94; con el recinto de las ciudades del
    // núcleo, vuelta 3, 26 en s98, la única de 1-120).
    const { map, escena: e } = partidaDe(98);
    const a = analizar(map);
    const casillas = new Set<number>();
    for (let i = 0; i < map.terrain.length; i++)
      if (map.terrain[i] === 'cliff' && a.suelo[i] === 'snow' && e.suelo[i] === 'lava')
        casillas.add(i);
    expect(casillas.size).toBeGreaterThan(10);
    const enLoAlto = e.sprites.filter((s) => casillas.has(Math.floor(s.y) * e.W + Math.floor(s.x)));
    expect(enLoAlto.filter((s) => s.clase === 'roca').length).toBeGreaterThan(10);
    // La lava es `comoLaBarrera`: su cubierta de lo alto se cambia por roca (`rocaEnLoAlto`).
    expect(enLoAlto.filter((s) => /nevad|snow/.test(s.src ?? ''))).toEqual([]);
  });
});

describe('la frontal de basalto (#220, auditoría 7 §3)', () => {
  it('s63: lleva tono, como sus laderas y diagonales', () => {
    // La s13 desde #226 no lleva basalto; la s51 llevaba las tres piezas,
    // desde #229 la s18, desde #230 (09-10-2026) la s36, y desde el río de una
    // casilla (#144, paso 2) la s24, y desde el río continuo (#144), que la
    // dejó sin meseta, la s63, la de la meseta de lava de arriba.
    const basalto = partidaDe(63).escena.sprites.filter((s) =>
      /^modulos\/(paredes|laderas|diagonales)-basalto/.test(s.src ?? ''),
    );
    expect(new Set(basalto.map((s) => s.src?.split('/')[1]?.split('-')[0]))).toEqual(
      new Set(['paredes', 'laderas', 'diagonales']),
    );
    for (const s of basalto) expect(s.tono, s.src ?? '').toBeDefined();
  });
});
