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

  it('la nieve o un abeto nevado sobre la lava cuentan; en la nieve, no', () => {
    const nieve = pieza('cubierta-snow', 0.5, 0.9);
    const abeto = pieza('abetos-nevados', 0.4, 0.8);
    expect(cubiertaDeOtroNivel([nieve, abeto], pintado, 2)).toEqual([nieve, abeto]);
    expect(
      cubiertaDeOtroNivel(
        [
          { ...nieve, x: 1.5 },
          { ...abeto, x: 1.4 },
        ],
        pintado,
        2,
      ),
    ).toEqual([]);
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
 * es la de s51 (17-22, 8-9), y la s13 no tiene lava en lo alto.
 */
const SEMILLAS = LENTO ? [...rango(1, 40), 51, 57, 80] : [51, 80, 57];

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ninguna cubierta es de otro suelo que el que se pinta, por fuera y por el informe`, () => {
      const { escena: e } = partidaDe(semilla);
      expect(e.informe.cubiertaDeOtroNivel).toBe(0);
      expect(cubiertaDeOtroNivel(e.sprites, e.suelo, e.W)).toEqual([]);
    });

  it('s51 (17-22, 8-9): lo alto de la meseta de lava, con la nieve como suelo más cercano, lleva roca y nada de nieve', () => {
    // Era s13 (16-24, 4-7) en 34×34; desde #226 la misma meseta está en s51.
    // Hasta la columna 22: en (23,8) remata la ladera este de la nieve de
    // (20-22, 6-7), que cae al agua y es nevada porque es de la nieve (#216).
    const { map, escena: e } = partidaDe(51);
    const a = analizar(map);
    const enLoAlto = e.sprites.filter((s) => {
      const i = Math.floor(s.y) * e.W + Math.floor(s.x);
      return (
        s.x >= 17 &&
        s.x < 23 &&
        s.y >= 8 &&
        s.y < 10 &&
        map.terrain[i] === 'cliff' &&
        // Que el guardia no mire al vacío: ahí el suelo más cercano es la nieve.
        a.suelo[i] === 'snow'
      );
    });
    expect(enLoAlto.filter((s) => s.clase === 'roca').length).toBeGreaterThan(10);
    // La lava es `comoLaBarrera`: su cubierta de lo alto se cambia por roca (`rocaEnLoAlto`).
    expect(enLoAlto.filter((s) => /nevad|snow/.test(s.src ?? ''))).toEqual([]);
  });
});

describe('la frontal de basalto (#220, auditoría 7 §3)', () => {
  it('s51: lleva tono, como sus laderas y diagonales', () => {
    // La s13 desde #226 no lleva basalto; la s51 lleva las tres piezas.
    const basalto = partidaDe(51).escena.sprites.filter((s) =>
      /^modulos\/(paredes|laderas|diagonales)-basalto/.test(s.src ?? ''),
    );
    expect(new Set(basalto.map((s) => s.src?.split('/')[1]?.split('-')[0]))).toEqual(
      new Set(['paredes', 'laderas', 'diagonales']),
    );
    for (const s of basalto) expect(s.tono, s.src ?? '').toBeDefined();
  });
});
