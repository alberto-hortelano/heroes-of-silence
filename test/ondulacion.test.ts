/**
 * La ondulación del reparto de regiones (#229): el ruido que quiebra los
 * bisectores de Voronoi. Lo que se ata aquí es su forma —enteros, acotado,
 * determinista y antisimétrico en el espejo de las semillas— y que `sinPuas`
 * quita los dedos de una casilla. Que quiebre los tramos rectos lo mide
 * `tools/qa/rectitud.ts`, con sus techos en la orden lenta de `regiones.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { ONDULACION, ondulacion, sinPuas } from '../src/core/map/generate.js';
import { createRng } from '../src/core/rng.js';

describe('la ondulación de las fronteras (#229)', () => {
  it('es antisimétrica en el espejo: el punto movido del reflejo es el reflejo del movido', () => {
    for (const [W, H] of [
      [42, 42],
      [24, 64],
    ] as const) {
      const { dx, dy } = ondulacion(createRng(7), W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const m = (H - 1 - y) * W + (W - 1 - x);
          expect((dx[i] as number) + (dx[m] as number)).toBe(0);
          expect((dy[i] as number) + (dy[m] as number)).toBe(0);
        }
      }
    }
  });

  it('es entera, acotada por dos amplitudes y la misma con la misma semilla', () => {
    const { paso, amplitud } = ONDULACION;
    const a = ondulacion(createRng(3), 42, 42);
    const b = ondulacion(createRng(3), 42, 42);
    expect(a.dx).toEqual(b.dx);
    expect(a.dy).toEqual(b.dy);
    // n(p) − n(p′), cada uno una media de valores en [−amplitud, amplitud] × paso².
    const tope = 2 * amplitud * paso * paso;
    for (const v of [...a.dx, ...a.dy]) expect(Math.abs(v)).toBeLessThanOrEqual(tope);
    // Y se mueve de verdad: no es todo cero.
    expect(a.dx.some((v) => v !== 0)).toBe(true);
  });

  it('sinPuas quita el dedo de una casilla y deja la frontera de verdad', () => {
    // Región 0 a la izquierda, 1 a la derecha, y un dedo de la 1 metido en la 0.
    const W = 6;
    const H = 5;
    const etiqueta = new Int32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 3; x < W; x++) etiqueta[y * W + x] = 1;
    etiqueta[2 * W + 1] = 1;
    sinPuas(etiqueta, W, H);
    expect(etiqueta[2 * W + 1]).toBe(0);
    // La frontera recta no se toca: cada casilla tiene la mitad de vecinas iguales o más.
    for (let y = 0; y < H; y++) {
      expect(etiqueta[y * W + 2]).toBe(0);
      expect(etiqueta[y * W + 3]).toBe(1);
    }
  });
});
