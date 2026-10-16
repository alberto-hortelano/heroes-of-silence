/**
 * La cubierta de lo que se pisa no imita la barrera (#184, auditoría 3 §2.2).
 *
 * En la lava, la arena, la ciénaga y lo áspero la cubierta es de la misma roca
 * o madera que la barrera de al lado. Antes de este arreglo iba con la misma
 * densidad y las mismas piezas que lo alto del acantilado: en las semillas de la
 * auditoría la cubierta de lo pisable tapaba 1,28 casillas² por casilla (lo alto
 * de un acantilado, 0,75); el guardia de hoy daba 3 647 piezas más altas que su
 * esbeltez y 41 regiones densas. Ahora es baja (`tumbado`), rala y sin árboles
 * (huella 0,31; la región más densa de 1-40 y la 57, 0,43), y el informe lo
 * recuenta (`cubiertaComoLaBarrera`). Que ningún suelo que se pisa lleve
 * árboles (la ciénaga de s9 junto al bosque, entre ellos) lo vigila
 * `test/pisable-junto-al-bosque.test.ts` (14-10-2026).
 */

import type { Suelo } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import {
  cubiertaComoLaBarrera,
  HUELLA_DE_LO_PISABLE,
  type Sprite,
  tumbado,
} from '../src/client/render/escenario/colocar.js';
import { partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

/** Una pieza de cubierta con imagen de `nw`×`nh` y pie en `(x, y)`. */
function pieza(x: number, y: number, nw: number, nh: number, alto: number): Sprite {
  return {
    src: 'modulos/prueba/1.webp',
    nw,
    nh,
    ax: nw / 2,
    ay: nh,
    x,
    y,
    alto,
    clase: 'cubierta',
    color: '#000',
    capa: 0,
    sombra: false,
  };
}

describe('tumbado: lo esbelto se encoge hasta la esbeltez que se le pide', () => {
  it('un módulo el doble de alto que ancho, con esbeltez 1, se pinta a la mitad', () => {
    expect(tumbado(pieza(0, 0, 100, 200, 0.5), 1).alto).toBeCloseTo(0.25);
  });

  it('el tumbado sigue como es, y sin esbeltez o sin imagen nada cambia', () => {
    expect(tumbado(pieza(0, 0, 300, 100, 0.5), 1.3).alto).toBe(0.5);
    expect(tumbado(pieza(0, 0, 100, 200, 0.5), undefined).alto).toBe(0.5);
    expect(tumbado({ ...pieza(0, 0, 100, 200, 0.5), src: null }, 1.3).alto).toBe(0.5);
  });
});

describe('cubiertaComoLaBarrera: el guardia muerde', () => {
  // Un llano de 4 × 4, una sola región pisable (16 casillas, se mide).
  const W = 4;
  const lava: Suelo[] = Array(16).fill('lava');
  const region = new Int32Array(16);

  it('un árbol o una aguja a su alto en lo que se pisa de la lava cuenta', () => {
    const arbol = pieza(1.5, 1.9, 200, 280, 0.8);
    const aguja = pieza(2.5, 2.9, 190, 236, 0.5);
    const guijarro = tumbado(pieza(0.5, 0.9, 190, 236, 0.5), 1.3);
    expect(cubiertaComoLaBarrera([arbol, aguja, guijarro], lava, region, W).altas).toEqual([
      arbol,
      aguja,
    ]);
  });

  it('en la hierba, o en lo que no se pisa, no cuenta', () => {
    const arbol = pieza(1.5, 1.9, 200, 280, 0.8);
    const hierba: Suelo[] = Array(16).fill('grass');
    expect(cubiertaComoLaBarrera([arbol], hierba, region, W).altas).toEqual([]);
    const barrera = new Int32Array(16).fill(-1);
    expect(cubiertaComoLaBarrera([arbol], lava, barrera, W).altas).toEqual([]);
  });

  it('una región sembrada más densa que HUELLA_DE_LO_PISABLE cuenta; rala, no', () => {
    // Peñascos tumbados (0,6 × 0,3 casillas = 0,18 casillas²), bajos para no ser «altas».
    const peñascos = (porCasilla: number) =>
      rango(0, 15).flatMap((i) =>
        rango(1, porCasilla).map(() =>
          pieza((i % W) + 0.5, Math.floor(i / W) + 0.9, 200, 100, 0.3),
        ),
      );
    const densa = peñascos(Math.ceil(HUELLA_DE_LO_PISABLE / 0.18) + 1);
    expect(cubiertaComoLaBarrera(densa, lava, region, W)).toEqual({
      altas: [],
      regionesDensas: [0],
    });
    expect(cubiertaComoLaBarrera(peñascos(1), lava, region, W).regionesDensas).toEqual([]);
  });

  it('un enclave de menos de nueve casillas no se mide por su media', () => {
    const enclave = new Int32Array(16).fill(-1);
    enclave[5] = 0;
    const charcos = rango(1, 10).map(() => pieza(1.5, 1.9, 300, 100, 0.4));
    expect(cubiertaComoLaBarrera(charcos, lava, enclave, W).regionesDensas).toEqual([]);
  });
});

/**
 * En la orden lenta, 1-40 y la 57; en `pnpm verify`, las de la auditoría que
 * más lo enseñaban: la lava de s28, la ciénaga de s9 y la arena de s24.
 */
const SEMILLAS = LENTO ? [...rango(1, 40), 57] : [28, 9, 24];

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: la cubierta de lo que se pisa no imita la barrera, por fuera y por el informe`, () => {
      const { map, escena: e } = partidaDe(semilla);
      const a = analizar(map);
      expect(e.informe.cubiertaComoLaBarrera).toBe(0);
      expect(cubiertaComoLaBarrera(e.sprites, a.suelo, a.region, e.W)).toEqual({
        altas: [],
        regionesDensas: [],
      });
    });
});
