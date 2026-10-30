/**
 * C1 de la revisión de animaciones (`tools/taller/encuadre.ts`): cada fotograma se
 * mueve para que el tronco pintado siga a la cadera del maniquí. Con una figura
 * pintada de verdad puesta en siete celdas sobre una cadera fabricada y un
 * fotograma movido a mano, C1 lo tiene que deshacer; sobre ruido no puede mover
 * nada, y nada se mueve más del tope.
 */
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.js';
import {
  type CeldaRgba,
  desplazamientosDelTronco,
  fondoDe,
  HUNDIMIENTO_TOLERADO,
  mejorRecolocacion,
  recolocarConElSuelo,
  recolocarConLosPies,
  TOPE,
} from '../tools/taller/encuadre.js';
import { saltoDelClip, UMBRAL_DEL_SALTO } from '../tools/taller/revision/salto.js';

const RAIZ = join(import.meta.dirname, '..');
const LADO = 384;

/** La primera celda (el reposo) de la hoja A de d0 del caballero de la muerte. */
let figura: Uint8Array;
beforeAll(async () => {
  figura = new Uint8Array(
    await sharp(join(RAIZ, 'assets/unidades/caballero-de-la-muerte/d0/hoja-a.webp'))
      .extract({ left: 0, top: 0, width: LADO, height: LADO })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  );
});

/** La figura movida (dx, dy) dentro de su celda. */
function movida(dx: number, dy: number): CeldaRgba {
  const data = new Uint8Array(LADO * LADO * 4);
  for (let y = 0; y < LADO; y++)
    for (let x = 0; x < LADO; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= LADO || sy >= LADO) continue;
      for (let k = 0; k < 4; k++)
        data[(y * LADO + x) * 4 + k] = figura[(sy * LADO + sx) * 4 + k] as number;
    }
  return { data, lado: LADO };
}

/** Una cadera que sube y baja y avanza un poco, como la de una carrera. */
const CADERA: readonly (readonly [number, number])[] = [
  [0, 0],
  [2, -4],
  [4, -7],
  [3, -4],
  [1, 0],
  [-1, -4],
  [-2, -6],
];

describe('C1: el tronco sigue a la cadera del maniquí', () => {
  it('deshace un fotograma movido (+6, −4) a 1 px o menos, con la media en 0', () => {
    const extra: [number, number][] = CADERA.map((_, i) => (i === 3 ? [6, -4] : [0, 0]));
    const celdas = CADERA.map(([x, y], i) => movida(x + extra[i]![0], y + extra[i]![1]));
    const { desplazamientos } = desplazamientosDelTronco(celdas, CADERA, true);
    // Lo que queda de lo fabricado en cada fotograma, tras moverlo: igual en todos.
    const quedan = desplazamientos.map(([dx, dy], i) => [extra[i]![0] + dx, extra[i]![1] + dy]);
    for (const eje of [0, 1]) {
      const v = quedan.map((q) => q[eje] as number);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
      const media =
        desplazamientos.reduce((s, d) => s + (d[eje] as number), 0) / desplazamientos.length;
      expect(Math.abs(media)).toBeLessThanOrEqual(1);
    }
    // Al revés de lo movido, menos la media: (−6 + 6/7, 4 − 4/7), redondeado.
    expect(desplazamientos[3]).toEqual([-5, 3]);
  });

  it('bien colocado, no mueve nada', () => {
    const celdas = CADERA.map(([x, y]) => movida(x, y));
    const { desplazamientos } = desplazamientosDelTronco(celdas, CADERA, true);
    for (const [dx, dy] of desplazamientos) {
      expect(Math.abs(dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(dy)).toBeLessThanOrEqual(1);
    }
  });

  it('sobre ruido no mueve nada: ningún par se parece lo bastante', () => {
    const rng = createRng(7);
    const celdas = CADERA.map(() => {
      const data = new Uint8Array(LADO * LADO * 4);
      for (let y = 100; y < 300; y++)
        for (let x = 150; x < 230; x++)
          for (let k = 0; k < 4; k++) data[(y * LADO + x) * 4 + k] = rng.int(0, 255);
      return { data, lado: LADO };
    });
    const { desplazamientos, pares } = desplazamientosDelTronco(celdas, CADERA, true);
    expect(pares.every((p) => p.ncc < 0.5)).toBe(true);
    expect(desplazamientos.every(([dx, dy]) => dx === 0 && dy === 0)).toBe(true);
  });

  it('respeta el tope: más que eso no es encuadre', () => {
    // Lo pintado no se mueve y el maniquí dice que la cadera avanzó 12 px por fotograma.
    const celdas = CADERA.map(() => movida(0, 0));
    const lejos = CADERA.map((_, i) => [12 * i, 0] as const);
    const { desplazamientos } = desplazamientosDelTronco(celdas, lejos, false);
    const xs = desplazamientos.map(([dx]) => dx);
    expect(Math.max(...xs.map(Math.abs))).toBe(TOPE);
    expect(xs[0]).toBe(-TOPE);
    expect(xs[6]).toBe(TOPE);
  });

  // QA del 30-10-2026, H3: con la media a 0, C1 hundía los pies de los fotogramas
  // apoyados (hasta 15 px bajo el suelo en la carga del caballero d1).
  // El piquero, revisado por el usuario (30-10-2026): con la línea fija del suelo el
  // cuerpo no podía bajar cuando el maniquí bajaba, y saltaba 7-21 px en el centrado.
  it('el cuerpo baja cuando baja el maniquí, y no se hunde bajo su pie', () => {
    const celdas = CADERA.map(() => movida(0, 0));
    const fondo = fondoDe(celdas[0]!)!;
    // El maniquí baja el tronco 12 px en el 4 y su pie más bajo baja lo mismo (cae,
    // o el pie avanza hacia la cámara): el pintado tiene que bajar con él.
    const baja = CADERA.map((_, i) => [0, i === 3 ? 12 : 0] as const);
    const piesQueBajan = CADERA.map((_, i) => fondo + (i === 3 ? 12 : 0));
    const r = recolocarConLosPies(celdas, baja, true, piesQueBajan).desplazamientos;
    // Lo que se mueve el 4 frente a los demás: lo que bajó el maniquí; y baja él, no
    // suben los otros (que flotarían sobre su pie).
    expect(r[3]![1] - r[0]![1]).toBeGreaterThanOrEqual(11);
    expect(r[3]![1]).toBeGreaterThanOrEqual(8);
    // Con la línea fija (la regla de antes), no bajaba: el salto que vio el usuario.
    const antes = recolocarConElSuelo(
      celdas,
      baja,
      true,
      fondo,
      CADERA.map(() => 0),
    ).desplazamientos;
    expect(antes[3]![1] - antes[0]![1]).toBeLessThan(2);
    // Si el pie del maniquí NO baja (solo se agacha), el pintado no se hunde más de lo tolerado.
    const piesQuietos = CADERA.map(() => fondo);
    const q = recolocarConLosPies(celdas, baja, true, piesQuietos).desplazamientos;
    for (const [i, [, dy]] of q.entries())
      expect(fondo + dy, `fotograma ${i + 1}`).toBeLessThanOrEqual(fondo + HUNDIMIENTO_TOLERADO);
    // En x, lo de siempre.
    expect(q.map(([dx]) => dx)).toEqual(
      desplazamientosDelTronco(celdas, baja, true).desplazamientos.map(([dx]) => dx),
    );
  });

  it('de varias recolocaciones se queda la que menos salta: nunca peor que la de antes', () => {
    const salta = CADERA.map(([x, y], i) => movida(x + (i === 3 ? 9 : 0), y));
    const buena = desplazamientosDelTronco(salta, CADERA, true).desplazamientos;
    const mala = CADERA.map((_, i) => [i === 2 ? 14 : 0, 0] as const);
    const m = mejorRecolocacion(salta, CADERA, true, [mala, buena]);
    expect(m.cual).toBe(1);
    expect(m.salto).toBeLessThanOrEqual(1);
  });

  // La detección automática del encuadre (el piquero, 30-10-2026): lo que salta el
  // cuerpo más de lo que se mueve el maniquí, con el par donde salta.
  it('mide el salto del cuerpo y dice dónde', () => {
    const quieto = CADERA.map(([x, y]) => movida(x, y));
    expect(saltoDelClip(quieto, CADERA, true)?.px ?? 0).toBeLessThanOrEqual(1);
    const salta = CADERA.map(([x, y], i) => movida(x + (i === 3 ? 9 : 0), y));
    const s = saltoDelClip(salta, CADERA, true);
    expect(s?.px).toBeGreaterThan(UMBRAL_DEL_SALTO);
    expect([s?.de, s?.a]).toEqual(expect.arrayContaining([4]));
  });
});
