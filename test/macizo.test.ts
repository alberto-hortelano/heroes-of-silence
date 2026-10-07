/**
 * El macizo (#171): una franja de montaña crece de la falda a la cumbre, la
 * cresta tiene cumbres y collados, y en la escena los picos de dentro son
 * mayores, más esbeltos y más claros que los de la falda.
 *
 * Lo que se ve lo miran `pnpm taller escenario` y las capturas de
 * `docs/agents/2026-10-07-cumbres/`; aquí, las reglas que lo sostienen.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { ALTO_DE_FALDA, macizoDe, radioDePico } from '../src/client/render/escenario/macizo.js';
import { escenaDe, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

/** Las casillas `[x0, x1) × [y0, y1)` de un mapa de ancho `W`. */
function rectangulo(W: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const fuera: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fuera.push(y * W + x);
  return fuera;
}

const llano = () => 0.5;

describe('el campo del macizo', () => {
  const W = 16;
  const H = 12;
  // Una franja de 8 × 6 en mitad del mapa: hondura 3 en su centro.
  const ancha = macizoDe(rectangulo(W, 4, 3, 12, 9), W, H, llano);

  it('la hondura es del punto: 0 en el filo, crece hacia dentro y es la distancia euclídea', () => {
    expect(ancha.hondura(4.01, 6)).toBeCloseTo(0.01, 5);
    expect(ancha.hondura(4.5, 6)).toBeCloseTo(0.5, 5);
    expect(ancha.hondura(7, 6)).toBeCloseTo(3, 5);
    // En la esquina, la distancia a la esquina de fuera, no la de una rejilla.
    expect(ancha.hondura(4.6, 3.8)).toBeCloseTo(0.6, 5);
    // Fuera de la franja, 0.
    expect(ancha.hondura(2, 6)).toBe(0);
  });

  it('el alto sube de la falda a la cresta sin bajar en el camino', () => {
    expect(ancha.alto(4.001, 6)).toBeCloseTo(ALTO_DE_FALDA, 2);
    let antes = 0;
    for (let x = 4.05; x <= 7; x += 0.1) {
      const a = ancha.alto(x, 6);
      expect(a).toBeGreaterThanOrEqual(antes);
      antes = a;
    }
    expect(ancha.alto(7, 6)).toBeGreaterThan(2 * ALTO_DE_FALDA);
    expect(ancha.cumbre(4.001, 6)).toBeLessThan(0.01);
    expect(ancha.cumbre(7, 6)).toBeGreaterThan(0.3);
  });

  it('el borde del mapa no es borde: la franja sigue más allá', () => {
    const alBorde = macizoDe(rectangulo(W, 0, 0, 4, H), W, H, llano);
    expect(alBorde.hondura(0.05, 6)).toBeCloseTo(3.95, 5);
    expect(alBorde.hondura(3.9, 6)).toBeCloseTo(0.1, 5);
  });

  it('una banda estrecha llega a su cresta, pero sube menos que una ancha', () => {
    const estrecha = macizoDe(rectangulo(W, 4, 0, 6, H), W, H, llano);
    // Su hondura mayor es 1: en el medio de la banda ya es cresta.
    expect(estrecha.cumbre(5, 6)).toBeCloseTo(ancha.cumbre(7, 6), 5);
    expect(estrecha.alto(5, 6)).toBeGreaterThan(ALTO_DE_FALDA + 0.5);
    expect(estrecha.alto(5, 6)).toBeLessThan(ancha.alto(7, 6));
  });

  it('el ruido hace cumbres y collados a lo largo de la cresta', () => {
    const ruido = (x: number) => (x < 8 ? 0 : 1);
    const cresta = macizoDe(rectangulo(W, 0, 3, W, 9), W, H, ruido);
    const collado = cresta.alto(4, 6);
    const cumbre = cresta.alto(12, 6);
    expect(cumbre).toBeGreaterThan(1.8 * collado);
    // En la falda el ruido no cuenta: la falda es pareja.
    expect(cresta.alto(4, 3.001)).toBeCloseTo(cresta.alto(12, 3.001), 2);
  });

  it('el radio entre picos crece con su alto: falda apretada, cumbres espaciadas', () => {
    expect(radioDePico(3)).toBeGreaterThan(radioDePico(1));
    expect(radioDePico(ALTO_DE_FALDA)).toBeLessThan(0.5);
  });
});

describe('la escena: los picos de una cordillera crecen hacia dentro', () => {
  const semillas = segunPrisa([1, 57], rango(1, 10));
  for (const semilla of semillas)
    it(`semilla ${semilla}: más altos, más esbeltos y más claros en la cresta que en la falda`, () => {
      const { map } = partidaDe(semilla);
      const escena = escenaDe(semilla);
      const a = analizar(map);
      const franjas = a.franjas.filter((f) => f.barrera === 'mountain');
      const macizos = franjas.map((f) => ({
        dentro: new Set(f.casillas),
        // El ruido no cambia la hondura: llega con el llano.
        macizo: macizoDe(f.casillas, a.W, a.H, llano),
      }));
      const picos = escena.sprites.filter(
        (s) => s.clase === 'masa' && s.src?.startsWith('modulos/picos-') === true,
      );
      const falda: (typeof picos)[number][] = [];
      const cresta: (typeof picos)[number][] = [];
      for (const s of picos) {
        const i =
          Math.floor(Math.min(s.y, a.H - 0.01)) * a.W + Math.floor(Math.min(s.x, a.W - 0.01));
        const suyo = macizos.find((m) => m.dentro.has(i));
        if (suyo === undefined) continue;
        const d = suyo.macizo.hondura(s.x, s.y);
        if (d < 0.25) falda.push(s);
        else if (d >= 0.75) cresta.push(s);
      }
      expect(falda.length).toBeGreaterThan(10);
      expect(cresta.length).toBeGreaterThan(5);
      const media = (l: readonly number[]) => l.reduce((x, y) => x + y, 0) / l.length;
      // El alto: lo que hace que se lea como macizo y no como alfombra.
      expect(media(cresta.map((s) => s.alto))).toBeGreaterThan(
        1.5 * media(falda.map((s) => s.alto)),
      );
      // La silueta: los esbeltos arriba.
      const esbeltez = (s: (typeof picos)[number]) => s.nh / s.nw;
      expect(media(cresta.map(esbeltez))).toBeGreaterThan(media(falda.map(esbeltez)));
      // La luz: la falda en sombra.
      const oscura = (s: (typeof picos)[number]) => s.tono?.includes('brightness(0.78)') === true;
      expect(falda.filter(oscura).length / falda.length).toBeGreaterThan(0.5);
      expect(cresta.filter(oscura).length / cresta.length).toBeLessThan(0.2);
    });

  it('no hay más picos que antes por casilla de montaña: el tope de volúmenes no se gasta aquí', () => {
    // Antes del macizo (07-10-2026): 2,38 en la semilla 1, 2,83 en la 57 y 2,58 en la 34.
    for (const semilla of segunPrisa([1, 57, 34], rango(1, 10))) {
      const { map } = partidaDe(semilla);
      const a = analizar(map);
      const casillas = a.franjas
        .filter((f) => f.barrera === 'mountain')
        .reduce((n, f) => n + f.casillas.length, 0);
      if (casillas === 0) continue;
      const picos = escenaDe(semilla).sprites.filter(
        (s) => s.clase === 'masa' && s.src?.startsWith('modulos/picos-') === true,
      ).length;
      expect(picos / casillas, `semilla ${semilla}`).toBeLessThan(2.9);
    }
  });
});
