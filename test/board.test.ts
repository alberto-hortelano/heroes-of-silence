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
  rectaLibre,
} from '../src/core/battle/board.js';
import { createRng } from '../src/core/rng.js';

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
      expect(dist.get(hexKey(h))?.steps).toBe(hexDistance(from, h));
    }
  });

  it('cada paso trae el hex de SU clave, que es lo que ya no se reconstruye (#76)', () => {
    // El BFS tenía el `Hex` en la mano y lo tiraba para quedarse con la clave;
    // `movableFrom` la volvía a partir por la coma para filtrar los que no
    // caben y `movableHexes` otra vez para devolverlos. Ahora viaja dentro, y
    // lo que hay que sujetar es que sea el de su clave y no el del vecino: un
    // desfase ahí movería a la unidad a otra casilla sin que nada se queje.
    const muro = new Set([hexKey({ col: 6, row: 4 })]);
    const dist = reachable({ col: 5, row: 4 }, 3, muro);
    expect(dist.size).toBeGreaterThan(1);
    for (const [k, paso] of dist) expect(hexKey(paso.at)).toBe(k);
    expect(dist.has(hexKey({ col: 6, row: 4 }))).toBe(false);
  });

  it('reachable descubre en el mismo orden que el BFS de claves de antes', () => {
    // El orden del `Map` es regla: la IA se queda con la primera de varias
    // casillas empatadas. Al pasar el BFS a índices y a un `Uint8Array`, lo que
    // tiene que sobrevivir es justo eso; lo comprueba contra el BFS ingenuo de
    // antes, sobre tableros con obstáculos sorteados.
    const rng = createRng(11);
    for (let prueba = 0; prueba < 50; prueba++) {
      const muro = new Set<string>();
      for (const h of allHexes()) if (rng.int(0, 3) === 0) muro.add(hexKey(h));
      const from = { col: rng.int(0, BOARD_WIDTH - 1), row: rng.int(0, BOARD_HEIGHT - 1) };
      const pasos = rng.int(1, 8);
      const ingenuo: string[] = [hexKey(from)];
      const vistos = new Set(ingenuo);
      let frente = [from];
      for (let paso = 1; paso <= pasos; paso++) {
        const siguiente = [];
        for (const h of frente) {
          for (const n of neighbours(h)) {
            const k = hexKey(n);
            if (vistos.has(k) || muro.has(k)) continue;
            vistos.add(k);
            ingenuo.push(k);
            siguiente.push(n);
          }
        }
        frente = siguiente;
      }
      expect([...reachable(from, pasos, muro).keys()]).toEqual(ingenuo);
    }
  });

  it('reachable desde fuera del tablero lanza en vez de inventarse vecinas', () => {
    expect(() => reachable({ col: -1, row: 4 }, 3, new Set())).toThrow(
      'no se puede buscar camino desde (-1,4): está fuera del tablero',
    );
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

describe('rectaLibre: las 6 rectas del hexágono (la carga, 02-10-2026)', () => {
  const libre = new Set<string>();

  /**
   * Las tres primeras casillas de cada recta, escritas a mano y no calculadas:
   * en odd-r la columna de las diagonales depende de la paridad de la fila, y
   * una fila par y una impar se equivocan por separado.
   */
  const RECTAS: Record<string, Record<string, [number, number][]>> = {
    'fila par (5,4)': {
      E: [
        [6, 4],
        [7, 4],
        [8, 4],
      ],
      W: [
        [4, 4],
        [3, 4],
        [2, 4],
      ],
      abajoDerecha: [
        [5, 5],
        [6, 6],
        [6, 7],
      ],
      abajoIzquierda: [
        [4, 5],
        [4, 6],
        [3, 7],
      ],
      arribaDerecha: [
        [5, 3],
        [6, 2],
        [6, 1],
      ],
      arribaIzquierda: [
        [4, 3],
        [4, 2],
        [3, 1],
      ],
    },
    'fila impar (5,3)': {
      E: [
        [6, 3],
        [7, 3],
        [8, 3],
      ],
      W: [
        [4, 3],
        [3, 3],
        [2, 3],
      ],
      abajoDerecha: [
        [6, 4],
        [6, 5],
        [7, 6],
      ],
      abajoIzquierda: [
        [5, 4],
        [4, 5],
        [4, 6],
      ],
      arribaDerecha: [
        [6, 2],
        [6, 1],
        [7, 0],
      ],
      arribaIzquierda: [
        [5, 2],
        [4, 1],
        [4, 0],
      ],
    },
  };

  for (const [nombre, rectas] of Object.entries(RECTAS)) {
    const desde = nombre.startsWith('fila par') ? { col: 5, row: 4 } : { col: 5, row: 3 };
    for (const [dir, casillas] of Object.entries(rectas)) {
      it(`${nombre}, ${dir}: cada casilla a su distancia, y la del medio bloqueada la corta`, () => {
        casillas.forEach(([col, row], i) => {
          expect(rectaLibre(desde, { col, row }, libre)).toBe(i + 1);
        });
        const [c1, r1] = casillas[1] as [number, number];
        const [c2, r2] = casillas[2] as [number, number];
        // Una unidad en medio corta la recta; en el destino no: dónde se puede
        // acabar lo decide quien pregunta.
        expect(
          rectaLibre(desde, { col: c2, row: r2 }, new Set([hexKey({ col: c1, row: r1 })])),
        ).toBeNull();
        expect(
          rectaLibre(desde, { col: c2, row: r2 }, new Set([hexKey({ col: c2, row: r2 })])),
        ).toBe(3);
      });
    }
  }

  it('fuera de recta, o en el mismo sitio, no hay recta', () => {
    expect(rectaLibre({ col: 5, row: 4 }, { col: 7, row: 5 }, libre)).toBeNull();
    expect(rectaLibre({ col: 5, row: 4 }, { col: 5, row: 4 }, libre)).toBeNull();
  });

  it('una casilla fuera del tablero no tiene recta: se dice, no se mide', () => {
    // En cúbicas la recta se sabe sin andar, así que sin esto (11,4) daría 6
    // desde (5,4) como si existiera.
    expect(() => rectaLibre({ col: 5, row: 4 }, { col: 11, row: 4 }, libre)).toThrow(
      '(11,4) está fuera del tablero: no hay recta',
    );
  });

  it('en todo el tablero, hay recta exactamente cuando una coordenada cúbica no cambia', () => {
    // Criterio independiente de la implementación: en coordenadas cúbicas las
    // seis rectas son las que dejan fija una de las tres. La conversión odd-r
    // se escribe aquí otra vez a propósito, sin pasar por `board.ts`.
    const cubo = (col: number, row: number) => {
      const q = col - (row - (row & 1)) / 2;
      return { q, r: row, s: -q - row };
    };
    let rectas = 0;
    for (const a of allHexes()) {
      for (const b of allHexes()) {
        const ca = cubo(a.col, a.row);
        const cb = cubo(b.col, b.row);
        const enRecta =
          (a.col !== b.col || a.row !== b.row) && (ca.q === cb.q || ca.r === cb.r || ca.s === cb.s);
        const d = rectaLibre(a, b, libre);
        expect(d, `(${a.col},${a.row}) → (${b.col},${b.row})`).toBe(
          enRecta ? hexDistance(a, b) : null,
        );
        if (enRecta) rectas++;
      }
    }
    expect(rectas).toBeGreaterThan(0);
  });
});
