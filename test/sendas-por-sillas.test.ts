/**
 * Ninguna senda pasa por una silla del relieve, y la que cambia de nivel lo
 * hace de frente (#224).
 *
 * La marca del usuario en s55 (27,16): «el camino acaba en un muro de roca».
 * El tramo (26,15)-(27,16) iba de nivel 1 a nivel 1 en diagonal entre dos
 * acantilados a nivel 2 que se tocan por la esquina: una silla. La escena une
 * lo alto por ese vértice («el alto une», `celdas`), pone ahí una diagonal
 * cóncava y una ladera, y la senda pasa por debajo. `desnivelesSinBarrera` solo
 * mira vecinas en cruz y no lo veía.
 *
 * Y la bajada: un tramo que cambia de nivel en diagonal cruza el filo por una
 * esquina, sin pared a ningún lado, y la escena no puede ponerle una rampa
 * recta con sus dos costados (#225). Tampoco por la esquina de la meseta, donde
 * a un lado no queda pared (`costado`).
 *
 * La regla es del núcleo (`pasoTorcido`); el nivel, el de la escena
 * (`relieve`), no el que estima el generador. El generador lo cobra al trazar
 * (`cobroDelTorcido`), abre a su región la esquina de lo que queda
 * (`abrirEsquinasTorcidas`) y, si no hay esquina que abrir, viste otra vez.
 *
 * Fuera, por regla:
 * - **los puentes**: el puente es su paso, con su pieza por eje y su vado;
 * - **la bajada en diagonal a una ciudad** que la región solo toca por un
 *   vértice (`soloPorUnVertice`): donde se juntan tres regiones o más, solo una
 *   le llega en cruz, porque dos casillas de regiones distintas no se tocan ni
 *   por un vértice. Por una silla, no: ese vestido no vale;
 * - **la bajada por la esquina de la meseta a una ciudad**, por lo mismo: la
 *   región que le llega en cruz no tiene otra casilla por donde. Se mide.
 *
 * Se vio morder (09-10-2026) con `vestir.ts` y `generate.ts` de antes, con esta
 * misma regla: s55, 4 sillas, 1 en diagonal y 1 por la esquina; s6, 3 sillas y
 * 4 en diagonal; s57, 4 en diagonal. En 1-200, 117 sillas, 265 en diagonal (212 a un
 * paso y 53 a una ciudad que la región toca en cruz) y 2 por la esquina a un
 * paso. Con esto, ninguna.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { relieve } from '../src/client/render/escenario/relieve.js';
import { buildMap, generateMapPlan } from '../src/core/map/generate.js';
import type { GameMap } from '../src/core/map/map.js';
import { rioAnteLaCiudad } from '../src/core/map/recinto.js';
import { pasoTorcido, soloPorUnVertice } from '../src/core/map/regiones.js';
import { ABIERTA, abrirEsquinasTorcidas } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { itLento, rango, segunPrisa } from './lento.js';

/** Los tramos torcidos de un mapa que no están fuera por regla, dichos. */
function torcidasDe(map: GameMap): string[] {
  const W = map.width;
  const H = map.height;
  const a = analizar(map);
  const { nivel } = relieve(a);
  const en = (o: { at: { x: number; y: number } }) => o.at.y * W + o.at.x;
  // Los puentes: los de los nodos de agua y el de cada ciudad-puente, la casilla
  // del río que tiene delante (`rioAnteLaCiudad`).
  const ciudades = map.objects.filter((o) => o.kind === 'town');
  const puentes = new Set([
    ...map.objects.filter((o) => o.kind === 'node' && o.barrera === 'water').map(en),
    ...ciudades.flatMap((o) => {
      const p = rioAnteLaCiudad(map, o.at);
      return p === null ? [] : [p.acceso.y * W + p.acceso.x];
    }),
  ]);
  // Lo que entra en el recinto de una ciudad (la ciudad amurallada, fase 2) lo
  // pinta su muralla y no se mira, como hace el generador; solo que lo que llega
  // a una puerta no sea una silla.
  const enUnRecinto = (i: number) =>
    ciudades.some(
      (o) => Math.max(Math.abs(o.at.x - (i % W)), Math.abs(o.at.y - Math.floor(i / W))) <= 1,
    );
  const fuera: string[] = [];
  for (const [P, Q] of map.caminos.tramos) {
    const p = P.y * W + P.x;
    const q = Q.y * W + Q.x;
    if (puentes.has(p) || puentes.has(q)) continue;
    const como = pasoTorcido(W, H, nivel, p, q);
    if (como === null) continue;
    if (enUnRecinto(p) && enUnRecinto(q)) continue;
    if (como !== 'silla' && (enUnRecinto(p) || enUnRecinto(q))) continue;
    fuera.push(`${como} (${P.x},${P.y})-(${Q.x},${Q.y})`);
  }
  return fuera;
}

const mapaDe = (semilla: number): GameMap => buildMap(generateMapPlan(createRng(semilla))).map;

/** Un nivel por casilla, de filas de dígitos. */
const niveles = (filas: readonly string[]): number[] => filas.flatMap((f) => [...f].map(Number));

describe('la regla del paso torcido (#224)', () => {
  // 3 × 3, de (0,1) a (1,2) y alrededor.
  it('una silla: en diagonal, a un mismo nivel, con las dos esquinas más altas', () => {
    const nivel = niveles(['222', '122', '212']);
    expect(pasoTorcido(3, 3, nivel, 3, 7)).toBe('silla');
    // Con una esquina a ras, ya no: la escena no une lo alto por ese vértice.
    expect(pasoTorcido(3, 3, niveles(['222', '112', '212']), 3, 7)).toBeNull();
    // En cruz no hay vértice que pisar.
    expect(pasoTorcido(3, 3, nivel, 6, 7)).toBe(null);
  });

  it('cambiar de nivel en diagonal es torcido; en cruz, con pared a los dos lados, de frente', () => {
    expect(pasoTorcido(3, 3, niveles(['222', '211', '111']), 0, 4)).toBe('diagonal');
    // La muesca: la punta baja (1,1) entre dos casillas altas.
    expect(pasoTorcido(3, 3, niveles(['222', '212', '111']), 1, 4)).toBeNull();
    // El borde recto: lo alto sigue a los lados de la alta, lo bajo a los de la baja.
    expect(pasoTorcido(3, 3, niveles(['222', '111', '111']), 1, 4)).toBeNull();
  });

  it('por la esquina de la meseta, sin pared a un lado, es torcido', () => {
    // Lo alto acaba en (1,0): a su derecha, lo bajo junto a las dos puntas.
    expect(pasoTorcido(3, 3, niveles(['221', '111', '111']), 1, 4)).toBe('costado');
    // El borde del mapa no cuenta como lado sin pared.
    expect(pasoTorcido(2, 2, niveles(['21', '11']), 0, 2)).toBe('costado');
    expect(pasoTorcido(1, 2, niveles(['2', '1']), 0, 1)).toBeNull();
  });

  it('una región toca una casilla solo por un vértice si no tiene ninguna en cruz con ella', () => {
    const regionDe = Int32Array.from([0, -1, 1, -1, -1, -1, 2, 2, 2]);
    expect(soloPorUnVertice(3, 3, regionDe, 0, 4)).toBe(true);
    expect(soloPorUnVertice(3, 3, regionDe, 2, 4)).toBe(false);
  });
});

describe('el vestido abre la esquina de un paso torcido (#224)', () => {
  // 4 × 4: el nodo en (1,1), a nivel 1; la región 0 (nivel 2) le llega solo por
  // (2,2), en diagonal; la 1 (nivel 1), por (0,1). Lo demás, barrera a nivel 2.
  const W = 4;
  const H = 4;
  const B = 0;
  // Todo es frontera, el nodo no guarda barrera y no hay ciudades.
  const sinMas = {
    deFrontera: () => true,
    admiteUnaMas: () => true,
    barreraDeNodo: new Map(),
    ciudades: [],
  } as const;
  const entrada = () => {
    const tipos = Int8Array.from([
      B,
      B,
      B,
      B,
      ABIERTA,
      ABIERTA,
      B,
      B,
      B,
      B,
      ABIERTA,
      ABIERTA,
      B,
      B,
      ABIERTA,
      ABIERTA,
    ]);
    const regionDe = Int32Array.from([-1, -1, -1, -1, 1, -1, -1, -1, -1, -1, 0, 0, -1, -1, 0, 0]);
    const nivel = niveles(['2222', '1122', '2222', '2222']);
    return { tipos, regionDe, nivel };
  };

  it('la abre a la región que bajaba en diagonal, y la rampa queda de frente', () => {
    const { tipos, regionDe, nivel } = entrada();
    const abiertas = abrirEsquinasTorcidas({
      W,
      H,
      tipos,
      regionDe,
      nodos: new Set([5]),
      nivel,
      niveles: [2, 1],
      puentes: new Set(),
      ...sinMas,
      tramos: [[10, 5]],
    });
    // Las esquinas son (1,2) y (2,1). (1,2) tocaría por un vértice la región 1
    // de (0,1); (2,1) solo toca la 0 y el nodo, y la rampa de (2,1) a (1,1)
    // queda de frente, con lo alto encima y debajo de su punta alta.
    expect(abiertas).toBe(1);
    expect(tipos[6]).toBe(ABIERTA);
    expect(regionDe[6]).toBe(0);
    expect(tipos[9]).not.toBe(ABIERTA);
    expect(pasoTorcido(W, H, [...nivel.slice(0, 6), 2, ...nivel.slice(7)], 6, 5)).toBeNull();
  });

  it('no abre la esquina que tocaría otra región por un vértice', () => {
    const { tipos, regionDe, nivel } = entrada();
    // La región 1 se asoma también a (2,1), desde (2,0); a (1,2) ya se asomaba.
    tipos[2] = ABIERTA;
    regionDe[2] = 1;
    const abiertas = abrirEsquinasTorcidas({
      W,
      H,
      tipos,
      regionDe,
      nodos: new Set([5]),
      nivel,
      niveles: [2, 1],
      puentes: new Set(),
      ...sinMas,
      tramos: [[10, 5]],
    });
    expect(abiertas).toBe(0);
  });

  it('ni un obstáculo: solo lo que era frontera antes de ponerlos', () => {
    const { tipos, regionDe, nivel } = entrada();
    const abiertas = abrirEsquinasTorcidas({
      W,
      H,
      tipos,
      regionDe,
      nodos: new Set([5]),
      nivel,
      niveles: [2, 1],
      puentes: new Set(),
      ...sinMas,
      deFrontera: (i) => i !== 6,
      tramos: [[10, 5]],
    });
    expect(abiertas).toBe(0);
  });

  it('al tramo de un puente no lo toca', () => {
    const { tipos, regionDe, nivel } = entrada();
    const abiertas = abrirEsquinasTorcidas({
      W,
      H,
      tipos,
      regionDe,
      nodos: new Set([5]),
      nivel,
      niveles: [2, 1],
      puentes: new Set([5]),
      ...sinMas,
      tramos: [[10, 5]],
    });
    expect(abiertas).toBe(0);
  });
});

describe('las sendas del procedimental no pasan por una silla ni bajan torcidas (#224)', () => {
  // s55, la de la marca; s6, un paso de montaña al que se bajaba en diagonal
  // (18,6), y s57, uno al que se bajaba por la esquina de la meseta (19,13).
  // Las tres daban torcidas con el vestido de antes.
  it.each(segunPrisa([55, 6, 57], rango(1, 200)))('semilla %i: ninguna', (semilla) => {
    expect(torcidasDe(mapaDe(semilla))).toEqual([]);
  });

  itLento('en 1-200, las bajadas a una ciudad por un vértice son las que quedan', () => {
    // Medido el 09-10-2026: 570 en diagonal y 89 por la esquina de la meseta
    // (eran 905 y 37 con el vestido de antes: las que se enderezan quedan a veces
    // en cruz por la esquina). Es una medida: si sube mucho,
    // algo dejó de cobrarse al trazar o de abrirse al vestir.
    let ciudad = 0;
    for (const s of rango(1, 200)) {
      const map = mapaDe(s);
      const W = map.width;
      const { nivel } = relieve(analizar(map));
      const ciudades = new Set(
        map.objects.filter((o) => o.kind === 'town').map((o) => o.at.y * W + o.at.x),
      );
      for (const [P, Q] of map.caminos.tramos) {
        const p = P.y * W + P.x;
        const q = Q.y * W + Q.x;
        if (
          (ciudades.has(p) || ciudades.has(q)) &&
          pasoTorcido(W, map.height, nivel, p, q) !== null
        )
          ciudad++;
      }
    }
    expect(ciudad).toBeLessThanOrEqual(700);
  });
});
