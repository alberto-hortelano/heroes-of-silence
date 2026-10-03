/**
 * Que una barrera no se confunda con un suelo, medido y no a ojo.
 *
 * QA de «mapas densos» (vuelta 1, H1 y H2): el acantilado se pintaba a ΔE 11 de
 * la tierra de casa y el muro a 15 del `rough`, y quien jugaba veía mesetas y
 * plazas donde había barreras. La distancia es la ΔE76 de CIELAB (sRGB, D65):
 * por debajo de ~10 dos colores se toman por el mismo en un mapa; el umbral de
 * 20 es el que pidió QA. La trama de `tramarBarreras` ayuda encima, pero el
 * color tiene que bastar solo —es lo que lee el minimapa—.
 */
import { describe, expect, it } from 'vitest';
import { FONDO_INEXPLORADO } from '../src/client/render/minimapa.js';
import { pigments } from '../src/client/render/terreno.js';
import { BARRERAS, SUELOS_PISABLES } from '../src/core/map/terrain.js';

type Rgb = readonly [number, number, number];

function lab([r, g, b]: Rgb): [number, number, number] {
  const lineal = (u: number) => {
    const c = u / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

const deltaE = (a: Rgb, b: Rgb): number => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

const UMBRAL = 20;

describe('los pigmentos del mapa', () => {
  it(`cada barrera está a ΔE76 ≥ ${UMBRAL} de cada suelo y de las otras barreras`, () => {
    const cerca: string[] = [];
    for (const b of BARRERAS) {
      for (const s of SUELOS_PISABLES) {
        const d = deltaE(pigments[b], pigments[s]);
        if (d < UMBRAL) cerca.push(`${b}/${s} ${d.toFixed(1)}`);
      }
      for (const otra of BARRERAS) {
        if (otra <= b) continue;
        const d = deltaE(pigments[b], pigments[otra]);
        if (d < UMBRAL) cerca.push(`${b}/${otra} ${d.toFixed(1)}`);
      }
    }
    expect(cerca).toEqual([]);
  });

  it(`en el minimapa, cada barrera está a ΔE76 ≥ ${UMBRAL} del fondo de lo inexplorado`, () => {
    // El muro estaba a 16,9 y una frontera de muro se perdía en la niebla (N2).
    const cerca = BARRERAS.map((b) => ({ b, d: deltaE(pigments[b], FONDO_INEXPLORADO) }))
      .filter(({ d }) => d < UMBRAL)
      .map(({ b, d }) => `${b} ${d.toFixed(1)}`);
    expect(cerca).toEqual([]);
  });

  it('la medida reconoce lo que QA vio: el acantilado de antes y la tierra, a 11', () => {
    // Si la fórmula estuviera rota y diera números grandes, el test de arriba
    // sería verde por vacío.
    expect(deltaE([120, 86, 52], [111, 94, 70])).toBeCloseTo(11.3, 1);
    expect(deltaE([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 0);
  });
});
