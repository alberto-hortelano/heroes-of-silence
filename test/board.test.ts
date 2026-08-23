import { describe, expect, it } from 'vitest';
import {
  allHexes,
  areAdjacent,
  BOARD_HEIGHT,
  BOARD_SIZE,
  BOARD_WIDTH,
  findPath,
  hexDistance,
  hexKey,
  neighbours,
  occupiedHexes,
  reachable,
} from '../src/core/battle/board.js';

describe('rejilla de batalla', () => {
  it('mide 11 x 9 = 99 hexes', () => {
    expect(BOARD_WIDTH).toBe(11);
    expect(BOARD_HEIGHT).toBe(9);
    expect(BOARD_SIZE).toBe(99);
    expect(allHexes()).toHaveLength(99);
  });

  it('un hex interior tiene exactamente 6 vecinos', () => {
    expect(neighbours({ col: 5, row: 4 })).toHaveLength(6);
    expect(neighbours({ col: 5, row: 3 })).toHaveLength(6);
  });

  it('las esquinas tienen menos vecinos y ninguno se sale del tablero', () => {
    for (const h of allHexes()) {
      for (const n of neighbours(h)) {
        expect(n.col).toBeGreaterThanOrEqual(0);
        expect(n.col).toBeLessThan(BOARD_WIDTH);
        expect(n.row).toBeGreaterThanOrEqual(0);
        expect(n.row).toBeLessThan(BOARD_HEIGHT);
      }
    }
    expect(neighbours({ col: 0, row: 0 }).length).toBeLessThan(6);
  });

  // El test que caza los errores de offset odd-r: la lista de vecinos y la
  // función de distancia se calculan por caminos distintos y deben coincidir.
  it('todo vecino está a distancia 1, y todo hex a distancia 1 es vecino', () => {
    for (const h of allHexes()) {
      const vecinos = new Set(neighbours(h).map(hexKey));
      for (const other of allHexes()) {
        const d = hexDistance(h, other);
        if (d === 1) expect(vecinos.has(hexKey(other))).toBe(true);
        else expect(vecinos.has(hexKey(other))).toBe(false);
      }
      expect(vecinos.size).toBe(neighbours(h).length);
    }
  });

  it('la distancia es simétrica y nula sobre sí misma', () => {
    for (const a of allHexes()) {
      expect(hexDistance(a, a)).toBe(0);
      for (const b of allHexes()) expect(hexDistance(a, b)).toBe(hexDistance(b, a));
    }
  });

  it('la vecindad es recíproca', () => {
    for (const h of allHexes()) {
      for (const n of neighbours(h)) {
        expect(neighbours(n).map(hexKey)).toContain(hexKey(h));
      }
    }
  });
});

describe('movimiento', () => {
  it('alcanza más hexes cuanto más rápida es la unidad', () => {
    const sinObstaculos = new Set<string>();
    const lento = reachable({ col: 5, row: 4 }, 2, sinObstaculos).size;
    const rapido = reachable({ col: 5, row: 4 }, 5, sinObstaculos).size;
    expect(rapido).toBeGreaterThan(lento);
    expect(reachable({ col: 5, row: 4 }, 0, sinObstaculos).size).toBe(1);
  });

  it('el coste que devuelve reachable coincide con la distancia en campo abierto', () => {
    const from = { col: 5, row: 4 };
    const dist = reachable(from, 20, new Set());
    for (const h of allHexes()) {
      expect(dist.get(hexKey(h))).toBe(hexDistance(from, h));
    }
  });

  it('rodea a las unidades bloqueadas en vez de atravesarlas', () => {
    const from = { col: 0, row: 4 };
    const to = { col: 2, row: 4 };
    const muro = new Set([hexKey({ col: 1, row: 4 })]);
    const camino = findPath(from, to, muro);
    expect(camino).not.toBeNull();
    expect(camino!.map(hexKey)).not.toContain(hexKey({ col: 1, row: 4 }));
    expect(camino!.length).toBeGreaterThan(hexDistance(from, to));
    expect(areAdjacent(camino!.at(-1)!, to) || hexKey(camino!.at(-1)!) === hexKey(to)).toBe(true);
  });

  it('devuelve null cuando el destino está rodeado', () => {
    const to = { col: 5, row: 4 };
    const cerco = new Set(neighbours(to).map(hexKey));
    expect(findPath({ col: 0, row: 0 }, to, cerco)).toBeNull();
  });
});

describe('unidades grandes', () => {
  it('ocupan dos hexes, con la cola detrás según el bando', () => {
    expect(occupiedHexes({ col: 5, row: 4 }, 1, true)).toHaveLength(1);
    const atacante = occupiedHexes({ col: 5, row: 4 }, 2, true);
    expect(atacante).toEqual([
      { col: 5, row: 4 },
      { col: 4, row: 4 },
    ]);
    const defensor = occupiedHexes({ col: 5, row: 4 }, 2, false);
    expect(defensor).toEqual([
      { col: 5, row: 4 },
      { col: 6, row: 4 },
    ]);
  });
});
