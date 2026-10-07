/**
 * Las fronteras del suelo (`fronteras.ts`, R1 de #169): deterministas por
 * semilla, sin huecos ni solapes, y una frontera recta entre casillas deja de
 * pintarse recta sin que un suelo se meta más de una casilla y media en el otro.
 */
import { describe, expect, it } from 'vitest';
import {
  type AlturaDeSuelo,
  type Fronteras,
  fronterasDelSuelo,
} from '../src/client/render/escenario/fronteras.js';

const R = 8;
const W = 30;
const H = 24;
/** Nieve a la izquierda de x = 15 y hierba a la derecha: la recta de s13. */
const recta = (semilla: number) => ({
  W,
  H,
  semilla,
  suelo: Array.from({ length: W * H }, (_, i) => (i % W < 15 ? 'snow' : 'grass')),
});
/** Una textura de rayas: altura que cambia a escala de muestra. */
const rayas: AlturaDeSuelo = {
  lado: 32,
  luz: Array.from(
    { length: 32 * 32 },
    (_, i) => (((i % 32) * 7 + Math.floor(i / 32) * 3) % 10) / 10,
  ),
};
const sinAltura = () => undefined;

/** Lo que se ve de cada suelo en el píxel `p`, desde los alfas acumulados. */
function vistos(f: Fronteras, p: number): number[] {
  // Pintados en orden con source-over: lo de debajo queda por (1 − α') de cada uno.
  const v = f.suelos.map(() => 0);
  let queda = 1;
  for (let k = f.suelos.length - 1; k >= 0; k--) {
    const a = ((f.alfas[k] as Uint8ClampedArray)[p] as number) / 255;
    v[k] = a * queda;
    queda *= 1 - a;
  }
  return v;
}

describe('las fronteras del suelo', () => {
  it('son las mismas con la misma semilla y otras con otra', () => {
    const a = fronterasDelSuelo(recta(13), () => rayas, R);
    const b = fronterasDelSuelo(recta(13), () => rayas, R);
    const c = fronterasDelSuelo(recta(57), () => rayas, R);
    expect(a.alfas.map((x) => Buffer.from(x).toString('base64'))).toEqual(
      b.alfas.map((x) => Buffer.from(x).toString('base64')),
    );
    expect(
      Buffer.from(a.alfas[0] as Uint8ClampedArray).equals(
        Buffer.from(c.alfas[0] as Uint8ClampedArray),
      ),
    ).toBe(false);
  });

  it('cubren cada punto entero, sin que asome lo de debajo', () => {
    const f = fronterasDelSuelo(recta(13), () => rayas, R);
    for (let p = 0; p < f.ancho * f.alto; p++) {
      const total = vistos(f, p).reduce((s, x) => s + x, 0);
      if (Math.abs(total - 1) > 1e-9) throw new Error(`el píxel ${p} cubre ${total}`);
    }
  });

  it('lo lejos de una frontera es de su suelo entero', () => {
    const f = fronterasDelSuelo(recta(13), () => rayas, R);
    const nieve = f.alfas[f.suelos.indexOf('snow')] as Uint8ClampedArray;
    for (let py = 0; py < f.alto; py++) {
      expect(nieve[py * f.ancho + 5 * R]).toBe(255);
      expect(vistos(f, py * f.ancho + 25 * R)[f.suelos.indexOf('grass')]).toBe(1);
    }
  });

  /**
   * Por fila, la x (en casillas) donde la nieve deja de ser lo que más se ve.
   * Una recta da la misma en todas las filas.
   */
  const cruces = (f: Fronteras) => {
    const k = f.suelos.indexOf('snow');
    const fuera: number[] = [];
    for (let py = 0; py < f.alto; py++) {
      let px = 0;
      while (px < f.ancho && (vistos(f, py * f.ancho + px)[k] as number) >= 0.5) px++;
      fuera.push((px + 0.5) / R);
    }
    return fuera;
  };

  for (const [nombre, alturas] of [
    ['con la altura de las texturas', () => rayas],
    ['sin texturas', sinAltura],
  ] as const)
    it(`una frontera recta no se pinta recta, y se aleja a lo sumo 1,5 casillas (${nombre})`, () => {
      for (const semilla of [1, 13, 57]) {
        const xs = cruces(fronterasDelSuelo(recta(semilla), alturas, R));
        const lejos = xs.filter((x) => Math.abs(x - 15) > 1.5);
        expect(lejos, `semilla ${semilla}`).toEqual([]);
        // Serpentea: entre la fila que más entra y la que menos, al menos una casilla.
        expect(Math.max(...xs) - Math.min(...xs), `semilla ${semilla}`).toBeGreaterThanOrEqual(1);
        // Y no es una diagonal: el cruce cambia de sentido a lo largo de la frontera.
        let giros = 0;
        let antes = 0;
        for (let i = 1; i < xs.length; i++) {
          const d = Math.sign((xs[i] as number) - (xs[i - 1] as number));
          if (d !== 0 && antes !== 0 && d !== antes) giros++;
          if (d !== 0) antes = d;
        }
        expect(giros, `semilla ${semilla}`).toBeGreaterThanOrEqual(3);
      }
    });

  it('la altura de la textura mueve la frontera', () => {
    // Solo la nieve tiene textura: la misma en los dos suelos se cancelaría al compararlos.
    const con = cruces(fronterasDelSuelo(recta(13), (s) => (s === 'snow' ? rayas : undefined), R));
    const sin = cruces(fronterasDelSuelo(recta(13), sinAltura, R));
    expect(con).not.toEqual(sin);
  });

  it('dice qué falla si el suelo no casa con el mapa', () => {
    expect(() =>
      fronterasDelSuelo({ W: 3, H: 3, semilla: 1, suelo: ['grass'] }, sinAltura, R),
    ).toThrow('el suelo tiene 1 casillas y el mapa 3×3');
    expect(() => fronterasDelSuelo(recta(1), () => ({ lado: 4, luz: [0, 1] }), R)).toThrow(
      'la altura de un suelo tiene 2 muestras y no 4²',
    );
  });
});
