import { describe, expect, it } from 'vitest';
import {
  alcanceConCostes,
  allHexes,
  anchoDeFila,
  areAdjacent,
  BOARD_HEIGHT,
  BOARD_SIZE,
  bandoDeSalida,
  caminoDe,
  carreraConCostes,
  espejo,
  FORMA_DEL_TABLERO,
  findPath,
  hexDistance,
  hexKey,
  indiceDe,
  isInside,
  lineaLibre,
  neighbours,
  reachable,
  rectaLibre,
  siguienteEnRecta,
  tableroDelContrato,
} from '../src/core/battle/board.js';
import { createRng } from '../src/core/rng.js';
import type { Hex } from '../src/core/types.js';
import { segunPrisa } from './lento.js';

describe('rejilla de batalla: filas de 12 y 11, simétrica (11-10-2026)', () => {
  it('9 filas, las pares de 12 y las impares de 11: 104 hexes', () => {
    expect(BOARD_HEIGHT).toBe(9);
    expect(BOARD_SIZE).toBe(104);
    expect(allHexes()).toHaveLength(104);
    for (let row = 0; row < BOARD_HEIGHT; row++) {
      const fila = allHexes().filter((h) => h.row === row);
      expect(fila.map((h) => h.col)).toEqual(
        Array.from({ length: row % 2 === 0 ? 12 : 11 }, (_, c) => c),
      );
      expect(anchoDeFila(row)).toBe(fila.length);
    }
  });

  it('la casilla 12.ª de una fila impar no existe; la de una par, sí', () => {
    for (let row = 0; row < BOARD_HEIGHT; row++) {
      expect(isInside({ col: 11, row }), `(11,${row})`).toBe(row % 2 === 0);
      expect(isInside({ col: 10, row })).toBe(true);
      expect(isInside({ col: 12, row })).toBe(false);
      expect(isInside({ col: -1, row })).toBe(false);
    }
    expect(isInside({ col: 0, row: -1 })).toBe(false);
    expect(isInside({ col: 0, row: 9 })).toBe(false);
  });

  it('el índice es la posición en allHexes, sin huecos, y lanza fuera del tablero', () => {
    allHexes().forEach((h, i) => {
      expect(indiceDe(h)).toBe(i);
    });
    // Con el rectángulo de antes (-1,1) daba el índice de (10,0) sin quejarse.
    expect(() => indiceDe({ col: -1, row: 1 })).toThrow('(-1,1) está fuera del tablero');
    expect(() => indiceDe({ col: 11, row: 1 })).toThrow('(11,1) está fuera del tablero');
  });

  it('las vecinas del borde derecho no pisan el hueco de las filas impares', () => {
    const claves = (h: { col: number; row: number }) => neighbours(h).map(hexKey).sort();
    // (11,0): el oeste y, abajo, la última de la fila 1.
    expect(claves({ col: 11, row: 0 })).toEqual(['10,0', '10,1'].sort());
    // (11,2): arriba y abajo la (10, impar), al oeste la (10,2).
    expect(claves({ col: 11, row: 2 })).toEqual(['10,1', '10,2', '10,3'].sort());
    // (10,1): ya no tiene este; sí las dos de arriba y las dos de abajo.
    expect(claves({ col: 10, row: 1 })).toEqual(['9,1', '10,0', '11,0', '10,2', '11,2'].sort());
    // (0,1): el borde izquierdo, como siempre.
    expect(claves({ col: 0, row: 1 })).toEqual(['0,0', '1,0', '1,1', '0,2', '1,2'].sort());
    for (const h of allHexes()) for (const n of neighbours(h)) expect(isInside(n)).toBe(true);
  });

  it('el contrato dice la forma derivada, no un 11 escrito a mano', () => {
    expect(tableroDelContrato()).toEqual({
      rows: 9,
      evenRowWidth: 12,
      oddRowWidth: 11,
      cells: 104,
      layout: `${FORMA_DEL_TABLERO}; el atacante entra por la columna 0`,
    });
    expect(FORMA_DEL_TABLERO).toContain('104 casillas');
  });

  it('un hex interior tiene exactamente 6 vecinos', () => {
    expect(neighbours({ col: 5, row: 4 })).toHaveLength(6);
    expect(neighbours({ col: 5, row: 3 })).toHaveLength(6);
  });

  it('las esquinas tienen menos vecinos y ninguno se sale del tablero', () => {
    for (const h of allHexes()) {
      for (const n of neighbours(h)) {
        expect(n.col).toBeGreaterThanOrEqual(0);
        expect(n.col).toBeLessThan(anchoDeFila(n.row));
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
      const from = rng.pick(allHexes());
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
    // En cúbicas la recta se sabe sin andar, así que sin esto (11,3) daría 6
    // desde (5,3) como si existiera.
    expect(() => rectaLibre({ col: 5, row: 3 }, { col: 11, row: 3 }, libre)).toThrow(
      '(11,3) está fuera del tablero: no hay recta',
    );
    expect(rectaLibre({ col: 5, row: 4 }, { col: 11, row: 4 }, libre)).toBe(6);
  });

  it('ninguna recta entre dos casillas del tablero pasa por el hueco de una fila impar', () => {
    // El paso se pregunta por índice, y `indiceDe` lanza fuera del tablero: si
    // alguna recta pisara (11, impar) por el camino, esto lanzaría.
    const todoVale = () => true;
    for (const a of allHexes()) {
      for (const b of allHexes()) {
        expect(() => rectaLibre(a, b, libre, todoVale)).not.toThrow();
      }
    }
  });

  it('la carga hasta el borde: la casilla que seguiría al hueco no existe', () => {
    // De (10,0) abajo a la derecha: (10,1) y luego (11,2), que existe (fila par).
    expect(siguienteEnRecta({ col: 10, row: 0 }, { col: 10, row: 1 })).toEqual({ col: 11, row: 2 });
    // Y al revés, de (11,2) arriba a la izquierda: (10,1) y luego (10,0).
    expect(siguienteEnRecta({ col: 11, row: 2 }, { col: 10, row: 1 })).toEqual({ col: 10, row: 0 });
    // De (10,4) arriba a la derecha: (10,3), (11,2) y luego el hueco (11,1).
    expect(siguienteEnRecta({ col: 10, row: 4 }, { col: 11, row: 2 })).toBeNull();
    // Al este por una impar, (10,1) es la última; por una par, (11,0).
    expect(siguienteEnRecta({ col: 8, row: 1 }, { col: 10, row: 1 })).toBeNull();
    expect(siguienteEnRecta({ col: 9, row: 0 }, { col: 11, row: 0 })).toBeNull();
    expect(rectaLibre({ col: 0, row: 0 }, { col: 11, row: 0 }, libre)).toBe(11);
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

describe('espejo: el tablero es su propio espejo izquierda-derecha', () => {
  it('es su propia inversa, lleva cada casilla a otra que existe y la fila no cambia', () => {
    for (const h of allHexes()) {
      const e = espejo(h);
      expect(isInside(e)).toBe(true);
      expect(e.row).toBe(h.row);
      expect(espejo(e)).toEqual(h);
    }
    expect(espejo({ col: 0, row: 0 })).toEqual({ col: 11, row: 0 });
    expect(espejo({ col: 0, row: 1 })).toEqual({ col: 10, row: 1 });
    expect(() => espejo({ col: 11, row: 1 })).toThrow('(11,1) está fuera del tablero');
  });

  it('conserva distancias y vecinas', () => {
    for (const a of allHexes()) {
      expect(neighbours(espejo(a)).map(hexKey).sort()).toEqual(
        neighbours(a)
          .map((n) => hexKey(espejo(n)))
          .sort(),
      );
      for (const b of allHexes()) expect(hexDistance(espejo(a), espejo(b))).toBe(hexDistance(a, b));
    }
  });

  it('las salidas son espejo una de otra: 27 casillas por bando', () => {
    const del = (side: 'attacker' | 'defender') =>
      allHexes().filter((h) => bandoDeSalida(h) === side);
    expect(del('attacker')).toHaveLength(27);
    expect(del('defender').map(hexKey).sort()).toEqual(
      del('attacker')
        .map((h) => hexKey(espejo(h)))
        .sort(),
    );
    expect(bandoDeSalida({ col: 9, row: 0 })).toBe('defender');
    expect(bandoDeSalida({ col: 8, row: 0 })).toBeNull();
    expect(bandoDeSalida({ col: 8, row: 1 })).toBe('defender');
    expect(() => bandoDeSalida({ col: 11, row: 1 })).toThrow('(11,1) está fuera del tablero');
  });

  it('las rectas de la carga, dadas la vuelta, siguen siendo rectas de la misma largura', () => {
    const libre = new Set<string>();
    for (const a of allHexes()) {
      for (const b of allHexes()) {
        expect(rectaLibre(espejo(a), espejo(b), libre)).toBe(rectaLibre(a, b, libre));
      }
    }
  });
});

/** Empates de borde del tablero con una casilla fuera (ver el test de la generosidad). */
const EMPATES_EN_EL_BORDE = 80;

describe('lineaLibre: el tiro, simétrico y generoso (11-10-2026)', () => {
  const todas = allHexes();

  it('un tiro y su espejo pasan o se tapan igual, con una casilla tapando en medio', () => {
    // Exhaustivo en la orden lenta (104³ tríos); en el bucle rápido, una
    // muestra sembrada que muerde: con el empujón de antes solo, 2 296 de los
    // 1 124 864 tríos (1 de cada ~490) salían distintos en el espejo, y 4 000
    // sacan unos 8 (comprobado rompiéndolo, 12-10-2026).
    const rng = createRng(2026_10_11);
    const trios = segunPrisa(
      () => Array.from({ length: 4000 }, () => [rng.pick(todas), rng.pick(todas), rng.pick(todas)]),
      () => todas.flatMap((a) => todas.flatMap((b) => todas.map((c) => [a, b, c]))),
    )();
    for (const [a, b, c] of trios as [Hex, Hex, Hex][]) {
      expect(
        lineaLibre(espejo(a), espejo(b), new Set([hexKey(espejo(c))])),
        `(${a.col},${a.row}) → (${b.col},${b.row}) tapando (${c.col},${c.row})`,
      ).toBe(lineaLibre(a, b, new Set([hexKey(c)])));
    }
  });

  it('generosa en los tres empates: el rayo que va justo por el borde de dos casillas no lo tapa una sola', () => {
    // Decisión del usuario (11-10-2026): el tiro pasa si pasa con el empujón o
    // con su espejo. Eso solo es generoso si en cada empate de borde los dos
    // rayos van por casillas distintas. Los empates son de tres familias, por
    // el par de ejes cúbicos en que difieren las dos casillas: `q−s` (el borde
    // vertical, vecinas de la misma fila), `q−r` y `r−s` (los bordes en
    // diagonal). En el tablero hay 1 188, 2 132 y 2 132 empates de cada una;
    // con el `+1, +2, −3` de antes solo la primera salía a lados opuestos, y
    // 4 264 tiros quedaban tapados por una sola casilla, los de las dos
    // diagonales (visto morder, 12-10-2026).
    //
    // Se buscan los empates sin `board.ts`: el punto `i` de `n` del segmento,
    // en cúbicas multiplicadas por `n`, y las casillas a la menor distancia
    // euclídea de él (en el plano `q + r + s = 0` es la suma de los cuadrados).
    const cubo = (h: Hex) => {
      const q = h.col - (h.row - (h.row & 1)) / 2;
      return [q, h.row, -q - h.row] as const;
    };
    const deCubo = ([q, r]: readonly number[]) => ({
      col: (q as number) + ((r as number) - ((r as number) & 1)) / 2,
      row: r as number,
    });
    const porFamilia = { 'q−s': 0, 'q−r': 0, 'r−s': 0 };
    const tapadas: string[] = [];
    let enElBorde = 0;
    for (const a of todas) {
      for (const b of todas) {
        const n = hexDistance(a, b);
        const [ca, cb] = [cubo(a), cubo(b)];
        for (let i = 1; i < n; i++) {
          const p = [0, 1, 2].map(
            (k) => (ca[k] as number) * n + ((cb[k] as number) - (ca[k] as number)) * i,
          );
          // Las casillas de alrededor: `q` y `r` a una de su parte entera, y `s` lo que falte.
          const cerca = (x: number) => [-1, 0, 1, 2].map((d) => Math.floor(x / n) + d);
          const candidatas = cerca(p[0]!).flatMap((q) => cerca(p[1]!).map((r) => [q, r, -q - r]));
          const dist = (c: number[]) => c.reduce((t, x, k) => t + (p[k]! - x * n) ** 2, 0);
          const menor = Math.min(...candidatas.map(dist));
          const empatadas = [
            ...new Map(
              candidatas.filter((c) => dist(c) === menor).map((c) => [c.join(), c]),
            ).values(),
          ];
          if (empatadas.length !== 2) continue; // un vértice (tres) o ningún empate
          const [x, y] = empatadas as [number[], number[]];
          const familia = x[1] === y[1] ? 'q−s' : x[2] === y[2] ? 'q−r' : 'r−s';
          porFamilia[familia]++;
          for (const c of [x, y]) {
            const h = deCubo(c);
            if (!isInside(h)) continue; // la de fuera no se puede tapar
            // Un empate de borde con la otra casilla fuera del tablero no es
            // generoso, a propósito: fuera cuenta como tapado (QA I1), así que
            // decide la de dentro. Se cuentan aparte.
            if (empatadas.some((e) => !isInside(deCubo(e)))) {
              enElBorde++;
              if (familia !== 'q−s')
                tapadas.push(`empate de borde fuera de la familia vertical: ${familia}`);
              continue;
            }
            if (!lineaLibre(a, b, new Set([hexKey(h)]))) {
              tapadas.push(
                `${familia}: (${a.col},${a.row}) → (${b.col},${b.row}) tapado solo por (${h.col},${h.row})`,
              );
            }
          }
        }
      }
    }
    expect(tapadas.slice(0, 10), `${tapadas.length} tiros tapados por una sola casilla`).toEqual(
      [],
    );
    // Los empates con una casilla fuera son pocos y solo de la familia
    // vertical (el borde de la (11, impar) y de la columna −1).
    expect(enElBorde).toBe(EMPATES_EN_EL_BORDE);
    // Y que mire algo: las tres familias salen en el tablero.
    for (const [familia, n] of Object.entries(porFamilia)) expect(n, familia).toBeGreaterThan(0);
  });

  it('con cortes (puertas cerradas) también es simétrica', () => {
    // Una puerta en cada fila, entre las columnas 5 y 6 (y su espejo, que en
    // las pares es la misma y en las impares la de 4 y 5).
    const cortesDe = (pares: [{ col: number; row: number }, { col: number; row: number }][]) => {
      const out = new Set<number>();
      for (const [x, y] of pares) {
        out.add(indiceDe(x) * BOARD_SIZE + indiceDe(y));
        out.add(indiceDe(y) * BOARD_SIZE + indiceDe(x));
      }
      return out;
    };
    const puertas = Array.from({ length: BOARD_HEIGHT }, (_, row) => [
      { col: 5, row },
      { col: 6, row },
    ]) as [{ col: number; row: number }, { col: number; row: number }][];
    const cortes = cortesDe(puertas);
    const reflejados = cortesDe(puertas.map(([x, y]) => [espejo(y), espejo(x)]));
    for (const a of todas) {
      for (const b of todas) {
        expect(lineaLibre(espejo(a), espejo(b), new Set(), reflejados)).toBe(
          lineaLibre(a, b, new Set(), cortes),
        );
      }
    }
  });

  it('fuera del tablero cuenta como tapado: nadie tira a través de un muro rozando el borde', () => {
    // Decisión del usuario (12-10-2026, QA I1): de (0,0) a (0,2) el segmento va
    // justo por el borde entre (0,1) y la (-1,1), que no existe; de (11,0) a
    // (11,2), entre (10,1) y el hueco (11,1). Cuando la casilla de fuera «se
    // saltaba», el rayo que iba por ella pasaba siempre, y con la de dentro
    // tapada el tiro atravesaba el muro por el marco. Ahora decide la de dentro.
    expect(lineaLibre({ col: 0, row: 0 }, { col: 0, row: 2 }, new Set(['0,1']))).toBe(false);
    expect(lineaLibre({ col: 11, row: 0 }, { col: 11, row: 2 }, new Set(['10,1']))).toBe(false);
    // Sin nada en medio, pasa (también con cortes vacíos): la casilla de fuera
    // tapa ese rayo, no el tiro.
    expect(lineaLibre({ col: 0, row: 0 }, { col: 0, row: 2 }, new Set())).toBe(true);
    expect(lineaLibre({ col: 0, row: 0 }, { col: 0, row: 2 }, new Set(), new Set())).toBe(true);
    expect(lineaLibre({ col: 11, row: 0 }, { col: 11, row: 8 }, new Set())).toBe(true);
    // Tapada de verdad, por las dos: en medio de una fila.
    expect(lineaLibre({ col: 2, row: 4 }, { col: 6, row: 4 }, new Set(['4,4']))).toBe(false);
  });

  it('una fila entera de muro no la cruza ningún tiro, tampoco por el borde (QA I1)', () => {
    // Con la casilla de fuera saltada, 8 tiros cruzaban la fila 1 y 12 la 3
    // (`0,0→0,2…` por la izquierda y `11,0→11,2…` por la derecha).
    for (let row = 1; row < BOARD_HEIGHT - 1; row++) {
      const muro = new Set(todas.filter((h) => h.row === row).map(hexKey));
      const pasan: string[] = [];
      for (const a of todas.filter((h) => h.row < row)) {
        for (const b of todas.filter((h) => h.row > row)) {
          if (lineaLibre(a, b, muro)) pasan.push(`(${a.col},${a.row}) → (${b.col},${b.row})`);
        }
      }
      expect(pasan.slice(0, 8), `fila ${row}: ${pasan.length} tiros la cruzan`).toEqual([]);
    }
  });
});

describe('alcanceConCostes: el recorrido con lo que cuesta salir de cada casilla (#259)', () => {
  const enTexto = (m: ReadonlyMap<string, { steps: number; at: Hex }>) =>
    [...m.entries()].map(
      ([k, p]) =>
        `${k}:${p.steps}:${caminoDe(p as never)
          .map(hexKey)
          .join('>')}`,
    );

  it('con coste 1 en todo da exactamente lo que `reachable`: casillas, orden, pasos y camino', () => {
    // 300 casos al azar: origen, presupuesto de 0 a 8, ocupadas y, la mitad,
    // un paso prohibido en un sentido (la muralla). El orden del `Map` es parte de
    // la regla (lo leen los desempates de la IA), así que se compara entero.
    const rng = createRng(259);
    const casillas = allHexes();
    for (let caso = 0; caso < 300; caso++) {
      const desde = casillas[rng.int(0, BOARD_SIZE - 1)] as Hex;
      const tope = rng.int(0, 8);
      const ocupadas = new Set<string>();
      for (let i = rng.int(0, 30); i > 0; i--) {
        ocupadas.add(hexKey(casillas[rng.int(0, BOARD_SIZE - 1)] as Hex));
      }
      const cortes = new Set<number>();
      for (let i = rng.int(0, 1) * 40; i > 0; i--) {
        cortes.add(rng.int(0, BOARD_SIZE - 1) * BOARD_SIZE + rng.int(0, BOARD_SIZE - 1));
      }
      const paso =
        cortes.size === 0 ? undefined : (a: number, b: number) => !cortes.has(a * BOARD_SIZE + b);
      expect(enTexto(alcanceConCostes(desde, tope, ocupadas, () => 1, paso))).toEqual(
        enTexto(reachable(desde, tope, ocupadas, paso)),
      );
    }
  });

  it('el camino es el más barato: rodea la casilla cara', () => {
    // De (2,4) a (5,4): recto pasa por (3,4) y (4,4); si salir de (3,4) cuesta 5,
    // sale más barato por la fila 3 o la 5, a 4. Empatan, y gana la que se
    // descubrió antes: en el orden de `neighbours`, la fila 5 va antes que la 3.
    const caro = indiceDe({ col: 3, row: 4 });
    const m = alcanceConCostes({ col: 2, row: 4 }, 6, new Set(), (i) => (i === caro ? 5 : 1));
    const p = m.get('5,4');
    expect(p?.steps).toBe(4);
    expect(caminoDe(p!).map(hexKey)).toEqual(['2,5', '3,5', '4,5', '5,4']);
    // Entrar en la casilla cara cuesta 1; salir de ella, 5.
    expect(m.get('3,4')?.steps).toBe(1);
    expect(m.get('4,4')?.steps).toBe(3);
  });

  it('el origen que cuesta más que el presupuesto no deja salir', () => {
    const m = alcanceConCostes({ col: 5, row: 4 }, 4, new Set(), () => 5);
    expect([...m.keys()]).toEqual(['5,4']);
  });

  it('un coste que no es un entero de 1 o más se dice', () => {
    expect(() => alcanceConCostes({ col: 5, row: 4 }, 4, new Set(), () => 0)).toThrow(
      'salir de (5,4) no puede costar 0: un paso cuesta un entero de 1 o más',
    );
  });

  it('la carrera en recta paga cada casilla de la que sale, y fuera de recta no hay', () => {
    const caro = indiceDe({ col: 2, row: 4 });
    const p = carreraConCostes({ col: 0, row: 4 }, { col: 4, row: 4 }, (i) => (i === caro ? 3 : 1));
    expect(p?.steps).toBe(6);
    expect(caminoDe(p!).map(hexKey)).toEqual(['1,4', '2,4', '3,4', '4,4']);
    expect(carreraConCostes({ col: 0, row: 4 }, { col: 4, row: 2 }, () => 1)).toBeNull();
  });
});
