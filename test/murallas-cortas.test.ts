/**
 * La muralla, solo en zonas pequeñas (#208): «Con la muralla como separador
 * deberíamos limitarlo, no encaja que haya una muralla desde una ciudad a
 * otra, limita la muralla a zonas pequeñas».
 *
 * Se mira el mapa ya hecho, no el vestido: una muralla es lo que la escena une
 * en una —el muro y los nodos de muro, que son sus puertas, 8-conexo—, y se le
 * pide que no pase de `LARGO_MAXIMO_DE_MURALLA` de largo (el lado mayor de su
 * caja) ni toque dos ciudades (una casilla a Chebyshev ≤ 1 de cada una, que es
 * lo que tapa la pieza de la ciudad). En el bucle rápido, las semillas que lo
 * rompían antes: s1 (de Valdeluz a una neutral y de 11 de largo), s9 (15),
 * s22 (dos ruinas pegadas, 9) y s91 (34, la más larga de 1-200).
 */
import { describe, expect, it } from 'vitest';
import { buildMap, generateMapPlan } from '../src/core/map/generate.js';
import type { GameMap } from '../src/core/map/map.js';
import { LARGO_MAXIMO_DE_MURALLA } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { rango, segunPrisa } from './lento.js';

interface Muralla {
  readonly largo: number;
  readonly ciudades: readonly string[];
  readonly desde: string;
}

/** Las murallas de un mapa, como las ve la escena: muro y puertas de muro, 8-conexo. */
function murallasDe(map: GameMap): Muralla[] {
  const W = map.width;
  const H = map.height;
  const en = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (map.terrain[i] === 'wall') en[i] = 1;
  for (const o of map.objects)
    if (o.kind === 'node' && o.barrera === 'wall') en[o.at.y * W + o.at.x] = 1;
  const towns = map.objects.filter((o) => o.kind === 'town');
  const vista = new Uint8Array(W * H);
  const murallas: Muralla[] = [];
  for (let i = 0; i < W * H; i++) {
    if (en[i] === 0 || vista[i] === 1) continue;
    vista[i] = 1;
    const casillas = [i];
    for (let q = 0; q < casillas.length; q++) {
      const c = casillas[q] as number;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = (c % W) + dx;
          const y = Math.floor(c / W) + dy;
          if (x < 0 || y < 0 || x >= W || y >= H || en[y * W + x] === 0) continue;
          if (vista[y * W + x] === 1) continue;
          vista[y * W + x] = 1;
          casillas.push(y * W + x);
        }
    }
    const xs = casillas.map((c) => c % W);
    const ys = casillas.map((c) => Math.floor(c / W));
    murallas.push({
      largo: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1,
      ciudades: towns
        .filter((t) =>
          casillas.some(
            (c) => Math.max(Math.abs((c % W) - t.at.x), Math.abs(Math.floor(c / W) - t.at.y)) <= 1,
          ),
        )
        .map((t) => t.id),
      desde: `(${xs[0]},${ys[0]})`,
    });
  }
  return murallas;
}

const mapaDe = (semilla: number): GameMap => buildMap(generateMapPlan(createRng(semilla))).map;

describe('la muralla, solo en zonas pequeñas (#208)', () => {
  const semillas = segunPrisa([1, 9, 22, 91], rango(1, 200));

  it(`ninguna muralla pasa de ${LARGO_MAXIMO_DE_MURALLA} casillas ni va de una ciudad a otra`, () => {
    const malas = semillas.flatMap((s) =>
      murallasDe(mapaDe(s))
        .filter((m) => m.largo > LARGO_MAXIMO_DE_MURALLA || m.ciudades.length >= 2)
        .map((m) => `s${s} ${m.desde}: largo ${m.largo}, ciudades ${m.ciudades.join(', ') || '—'}`),
    );
    expect(malas).toEqual([]);
  });

  it('el muro no desaparece: sigue habiendo murallas cortas', () => {
    // Quitar el muro del generador pasaría el guardia de arriba sin hacer lo
    // que se pidió, que es limitarlo. Medido en 1-200 (08-10-2026): con el
    // tope, 1,96 murallas por mapa separan dos regiones (2,75 antes), y hay muro
    // de frontera en 175 de 200 mapas (194 antes).
    const conMuralla = semillas.filter((s) => murallasDe(mapaDe(s)).length > 0);
    expect(conMuralla.length).toBeGreaterThanOrEqual(Math.ceil(semillas.length * 0.8));
  });
});
