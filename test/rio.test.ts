/**
 * El río continuo del procedimental (#144, 16-10-2026): «un río es algo
 * continuo». Se traza antes de repartir las regiones (`core/map/rio.ts`), el
 * vestido lo escribe como agua una sola vez (`ponerTipo`) y nadie lo parte.
 *
 * - `trazarRio`: el cauce, una línea de una casilla en cruz, sin tiradas rectas
 *   de más de `tramoMaximo`, que no se toca, en espejo exacto y fuera del marco
 *   salvo el canal de su boca.
 * - `nivelesDelRio`: el río al llano, la ciénaga que lo toca al 1, ningún cañón.
 * - **El guardia de continuidad**: en los mapas del juego, cada río del trazado
 *   (`ProceduralOptions.alTrazarElRio`) sigue entero en el mapa hecho, medido
 *   con las definiciones de `tools/qa/rios.ts` (agua, puente o ciudad-puente);
 *   y en el río solo hay puentes con dos orillas y ciudades-puente.
 */
import { describe, expect, it } from 'vitest';
import { FORMAS_DEL_RIO, RIOS, validarRios } from '../src/core/data.js';
import { buildMap, generateMapPlan, LADO_DEL_MAPA } from '../src/core/map/generate.js';
import { estructura } from '../src/core/map/regiones.js';
import {
  alOtroLado,
  ladosDelRio,
  nivelesDelRio,
  rioBajoLaCiudad,
  rioEntero,
  type TrazadoDelRio,
  trazarRio,
} from '../src/core/map/rio.js';
import { BARRERAS, type Nivel } from '../src/core/map/terrain.js';
import { ABIERTA, conElRio, esDelRio, ponerTipo } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import type { Point } from '../src/core/types.js';
import { riosDelMapa } from '../tools/qa/rios.js';
import { rango, segunPrisa } from './lento.js';

const W = LADO_DEL_MAPA;
const H = LADO_DEL_MAPA;
const N = W * H;

/** Semillas de región como las de `intentarRed`: las dos casas y parejas en espejo. */
function semillasDe(seed: number): Point[] {
  const rng = createRng(seed);
  const cheb = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const semillas: Point[] = [
    { x: 3, y: 3 },
    { x: W - 4, y: H - 4 },
  ];
  for (let g = 0; semillas.length < 10 && g < 1000; g++) {
    const p = { x: rng.int(1, W - 2), y: rng.int(1, H - 2) };
    const m = { x: W - 1 - p.x, y: H - 1 - p.y };
    if (cheb(p, m) < 6 || semillas.some((s) => cheb(s, p) < 6 || cheb(s, m) < 6)) continue;
    semillas.push(p, m);
  }
  return semillas;
}

/** El primer río que sale de `forma` con las semillas de `seed` y tiradas desde `seed`. */
function unRio(forma: (typeof FORMAS_DEL_RIO)[number], seed: number): TrazadoDelRio {
  const semillas = semillasDe(seed);
  const rng = createRng(seed * 7919);
  for (let k = 0; k < 50; k++) {
    const t = trazarRio(rng, W, H, semillas, forma);
    if (t !== null) return t;
  }
  throw new Error(`no sale un río ${forma} con la semilla ${seed} en 50 tiradas`);
}

describe('el trazado del río (`trazarRio`)', () => {
  const casos = FORMAS_DEL_RIO.flatMap((forma) => [1, 2, 3].map((seed) => [forma, seed] as const));

  it.each(casos)(
    '%s, semilla %i: una línea de una casilla, en espejo, que no se toca',
    (forma, seed) => {
      const t = unRio(forma, seed);
      const { mascara, lago } = t;
      // En espejo exacto.
      for (let i = 0; i < N; i++) expect(mascara[i]).toBe(mascara[N - 1 - i]);
      expect(t.rios).toHaveLength(forma === 'frontera' ? 1 : 2);
      const junto = (i: number) => {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (
              x + dx >= 0 &&
              y + dy >= 0 &&
              x + dx < W &&
              y + dy < H &&
              lago[(y + dy) * W + x + dx] === 1
            )
              return true;
        return false;
      };
      const rio = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < W && y < H && mascara[y * W + x] === 1;
      for (let i = 0; i < N; i++) {
        if (mascara[i] === 0 || junto(i)) continue;
        const x = i % W;
        const y = (i - x) / W;
        // Fuera de los lagos, de una casilla: ni un bloque de 2×2…
        expect(rio(x + 1, y) && rio(x, y + 1) && rio(x + 1, y + 1)).toBe(false);
        // …y cada casilla con dos vecinas en cruz del río, o una en la boca.
        const enCruz = [rio(x - 1, y), rio(x + 1, y), rio(x, y - 1), rio(x, y + 1)].filter(Boolean);
        const enElMarco = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        expect(enCruz.length).toBe(enElMarco ? 1 : 2);
      }
      // Sin tiradas rectas de más de `tramoMaximo` pasos (`tramoMaximo + 1` casillas).
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const)
        for (let i = 0; i < N; i++) {
          let n = 0;
          let x = i % W;
          let y = (i - x) / W;
          while (rio(x, y) && !junto(y * W + x)) {
            n++;
            x += dx;
            y += dy;
          }
          expect(n).toBeLessThanOrEqual(RIOS.tramoMaximo + 1);
        }
      // Del marco solo pisa el canal de sus bocas, que están en el marco.
      for (const b of t.bocas) {
        const x = b % W;
        const y = (b - x) / W;
        expect(x === 0 || y === 0 || x === W - 1 || y === H - 1).toBe(true);
      }
      const enUnCanal = (i: number) =>
        t.bocas.some((b) => {
          const bx = b % W;
          const by = (b - bx) / W;
          const x = i % W;
          const y = (i - x) / W;
          return (
            (x === bx && Math.abs(y - by) <= RIOS.marco) ||
            (y === by && Math.abs(x - bx) <= RIOS.marco)
          );
        });
      for (let i = 0; i < N; i++) {
        const x = i % W;
        const y = (i - x) / W;
        if (mascara[i] === 1 && Math.min(x, y, W - 1 - x, H - 1 - y) < RIOS.marco)
          expect(enUnCanal(i), `(${x},${y})`).toBe(true);
      }
    },
  );

  it('las dos orillas de una casilla del río están a lados distintos, aunque el río no parta el mapa', () => {
    const t = unRio('lago', 1);
    const lados = ladosDelRio(W, H, t.mascara);
    // Un tramo recto de este a oeste: lo de arriba y lo de abajo, a lados distintos.
    const m = [...t.mascara.keys()].find(
      (i) =>
        t.mascara[i] === 1 &&
        t.lago[i] === 0 &&
        t.mascara[i - 1] === 1 &&
        t.mascara[i + 1] === 1 &&
        t.mascara[i - W] === 0 &&
        t.mascara[i + W] === 0,
    ) as number;
    expect(m).toBeDefined();
    expect(alOtroLado(W, H, t.mascara, lados, m - W, m + W)).toBe(true);
    expect(alOtroLado(W, H, t.mascara, lados, m - W - 1, m - W + 1)).toBe(false);
  });

  it('data/rios.json: las tres formas con peso, y el cargador lanza con lo que no vale', () => {
    expect(RIOS.formas.map((f) => f.forma)).toEqual([...FORMAS_DEL_RIO]);
    expect(() =>
      validarRios({
        formas: { frontera: 1, esquina: 1 },
        tramoMaximo: 4,
        marco: 4,
        radioDelLago: 2,
      }),
    ).toThrow(/"formas.lago" pesa undefined/);
    expect(() =>
      validarRios({
        formas: { frontera: 1, esquina: 1, lago: 1, mar: 1 },
        tramoMaximo: 1,
        marco: 4,
        radioDelLago: 2,
      }),
    ).toThrow(/"mar", que no es una forma.*"tramoMaximo" tiene que ser un entero de 2 a 64/);
  });
});

describe('la única escritura de la rejilla del vestido (`ponerTipo`)', () => {
  it('el río se escribe como agua una vez, y después ponerTipo lanza si se toca, diciendo dónde', () => {
    const tipos = new Int8Array(12).fill(ABIERTA);
    const rio = new Uint8Array(12);
    rio[5] = 1;
    conElRio(tipos, rio, 4);
    expect(tipos[5]).toBe(BARRERAS.indexOf('water'));
    expect(esDelRio(tipos, 5)).toBe(true);
    expect(esDelRio(tipos, 6)).toBe(false);
    expect(() => ponerTipo(tipos, 5, BARRERAS.indexOf('mountain'))).toThrow(
      /la casilla \(1,1\) es del río y se iba a volver mountain: el río no se corta/,
    );
    expect(() => ponerTipo(tipos, 5, ABIERTA)).toThrow(/tierra que se pisa/);
    // Lo demás se escribe como siempre, y una rejilla sin río no lanza.
    ponerTipo(tipos, 6, BARRERAS.indexOf('mountain'));
    expect(tipos[6]).toBe(BARRERAS.indexOf('mountain'));
    const sinRio = new Int8Array(4).fill(ABIERTA);
    ponerTipo(sinRio, 1, 0);
    expect(sinRio[1]).toBe(0);
  });
});

describe('los niveles con el río (`nivelesDelRio`)', () => {
  it('el río va al llano: la ciénaga que lo toca sube al 1, con su pareja, y lo demás no se mueve', () => {
    const niveles: Nivel[] = [1, 1, 0, 0, 2, 2, 0, 0];
    expect(nivelesDelRio(niveles, new Set([2, 4]), [])).toEqual([1, 1, 1, 1, 2, 2, 0, 0]);
  });

  it('ni encajado: de una pareja que lo cruza con las dos orillas a 2, baja la de menor índice', () => {
    const niveles: Nivel[] = [1, 1, 2, 2, 2, 2, 2, 2];
    // 5 (a 2) y 6 (a 2) lo cruzan: baja la 5 y su pareja, la 4. 2 y 1, no: una ya está abajo.
    expect(
      nivelesDelRio(niveles, new Set([1, 2, 5, 6]), [
        [1, 2],
        [5, 6],
      ]),
    ).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });
});

/** Si el nodo de `at` en el río es un puente con una orilla de una región distinta a cada lado de un río recto. */
function puenteConDosOrillas(map: ReturnType<typeof buildMap>['map'], at: Point): boolean {
  const { regionDe } = estructura(map);
  const t = (x: number, y: number) => map.terrain[y * map.width + x];
  const r = (x: number, y: number) => regionDe[y * map.width + x] as number;
  const { x, y } = at;
  if (t(x - 1, y) === 'water' && t(x + 1, y) === 'water')
    return r(x, y - 1) >= 0 && r(x, y + 1) >= 0 && r(x, y - 1) !== r(x, y + 1);
  if (t(x, y - 1) === 'water' && t(x, y + 1) === 'water')
    return r(x - 1, y) >= 0 && r(x + 1, y) >= 0 && r(x - 1, y) !== r(x + 1, y);
  return false;
}

describe('el río de los mapas del juego, entero (el guardia de continuidad)', () => {
  // En el bucle rápido, 1-40; en la orden lenta, 1-200. Muerde: con
  // `sinAguaEnLasEsquinas` escribiendo sin `ponerTipo` y sin el `rioEntero` del
  // generador, la esquina que pasa a montaña corta el río (implementacion.md).
  it('cada río del trazado sigue entero en el mapa hecho, con su boca; en él, solo puentes y ciudades-puente', () => {
    const malos: string[] = [];
    const formas = new Map<string, number>();
    for (const s of segunPrisa(rango(1, 40), rango(1, 200))) {
      let trazado: TrazadoDelRio | undefined;
      const plan = generateMapPlan(createRng(s), {
        alTrazarElRio: (t) => {
          trazado = t;
        },
      });
      if (trazado === undefined) {
        malos.push(`s${s}: el generador no dijo su río`);
        continue;
      }
      formas.set(trazado.forma, (formas.get(trazado.forma) ?? 0) + 1);
      const { map } = buildMap(plan);
      const r = riosDelMapa(map, trazado);
      if (r.roto !== null) malos.push(`s${s}: ${r.roto}`);
      if (r.largos.length !== trazado.rios.length)
        malos.push(
          `s${s}: ${r.largos.length} ríos en el mapa, y el trazado lleva ${trazado.rios.length}`,
        );
      for (const o of map.objects) {
        if (trazado.mascara[o.at.y * W + o.at.x] === 0) continue;
        if (o.kind === 'town' && !rioBajoLaCiudad(map, o.at))
          malos.push(
            `s${s}: la ciudad de (${o.at.x},${o.at.y}) está en el río sin que pase por debajo`,
          );
        if (o.kind === 'node' && (o.barrera !== 'water' || !puenteConDosOrillas(map, o.at)))
          malos.push(
            `s${s}: el nodo de (${o.at.x},${o.at.y}) está en el río y no es un puente entre dos orillas`,
          );
      }
    }
    expect(malos).toEqual([]);
    // Y salen las tres formas.
    expect([...formas.keys()].sort()).toEqual([...FORMAS_DEL_RIO].sort());
  });

  it('rioEntero dice dónde se corta y si va en dos trozos', () => {
    const t = unRio('esquina', 2);
    const esAgua = (i: number) => t.mascara[i] === 1;
    expect(rioEntero(t, esAgua)).toBeNull();
    const corte = t.rios[0]?.[10] as number;
    expect(rioEntero(t, (i) => esAgua(i) && i !== corte)).toMatch(
      new RegExp(`se corta en \\(${corte % W},${Math.floor(corte / W)}\\)`),
    );
  });
});
