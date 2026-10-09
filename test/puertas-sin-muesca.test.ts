/**
 * La puerta de una ciudad no muerde la línea del acantilado (#222): «una
 * elevación no puede acabar de repente, sin continuidad».
 *
 * La muesca: una ciudad en la fila de arriba de un acantilado de dos de hondo,
 * con su puerta (la casilla de debajo) atravesando la de abajo entre dos
 * acantilados. En la escena es un barranco de una casilla sin laderas
 * (`sinBarrancos`), y la diagonal que remataría la cara de al lado tapa el
 * camino de la puerta: la cara acaba en seco (s57 (31,25), con
 * `carasCortadas`). El generador abre a lo bajo el acantilado del costado de la
 * puerta y la línea sube a la fila de la ciudad (`puertasSinMuesca`).
 *
 * Se mira el mapa hecho, por su forma: un costado de la puerta es acantilado,
 * con acantilado encima (el costado de la ciudad) y lo que se pisa debajo (la
 * cara cuelga de él junto a la puerta). Se vio morder (09-10-2026): sin
 * `puertasSinMuesca`, 59 costados en 52 puertas de 1-1000 (s57 tres, s162 y
 * s263 dos); con él, 5. Los que quedan, en `QUEDAN`: lo que habría que cerrar
 * de la meseta es el pasillo de otro nodo (s10 (25,13), la ciudad de al lado) o
 * toca uno (s167 (14,6), junto al paso de (15,7)).
 *
 * Desde #226 (el mapa de 42×42, 450 casillas por región) todos los mapas son
 * otros y la lista se re-mide (09-10-2026): en 1-1000, 5 → 4 (s21, s312, s563 y
 * s674, un costado este cada una); en 1-200 queda solo s21 (24,19).
 */
import { describe, expect, it } from 'vitest';
import { buildMap, generateMapPlan } from '../src/core/map/generate.js';
import type { GameMap } from '../src/core/map/map.js';
import { isWalkable } from '../src/core/map/terrain.js';
import { createRng } from '../src/core/rng.js';
import { rango, segunPrisa } from './lento.js';

/** Cada costado de la puerta de una ciudad que muerde la línea, como `(x,y)` de la puerta. */
function muescasDe(map: GameMap): string[] {
  const W = map.width;
  const H = map.height;
  const t = (x: number, y: number) => map.terrain[y * W + x];
  const fuera: string[] = [];
  for (const o of map.objects) {
    const { x, y } = o.at;
    if (o.kind !== 'town' || y + 2 >= H || !isWalkable(t(x, y + 1) as never)) continue;
    for (const s of [-1, 1])
      if (
        x + s >= 0 &&
        x + s < W &&
        t(x + s, y + 1) === 'cliff' &&
        t(x + s, y) === 'cliff' &&
        isWalkable(t(x + s, y + 2) as never)
      )
        fuera.push(`(${x},${y + 1}) ${s < 0 ? 'oeste' : 'este'}`);
  }
  return fuera;
}

const mapaDe = (semilla: number): GameMap => buildMap(generateMapPlan(createRng(semilla))).map;

/** Lo que queda en 1-200, por semilla (arriba). */
const QUEDAN: Readonly<Record<number, readonly string[]>> = {
  21: ['(24,19) este'],
};

describe('la puerta de una ciudad no muerde la línea del acantilado (#222)', () => {
  // En el bucle rápido, las que lo daban en 34×34 (s57, s162, s263; en 42×42
  // son otros mapas, pero no cuesta mirarlas) y la que queda, para que
  // `QUEDAN` no se quede viejo sin que nadie lo vea.
  const semillas = segunPrisa([57, 162, 263, 21], rango(1, 200));
  for (const s of semillas)
    it(`semilla ${s}`, () => {
      expect(muescasDe(mapaDe(s))).toEqual(QUEDAN[s] ?? []);
    });
});
