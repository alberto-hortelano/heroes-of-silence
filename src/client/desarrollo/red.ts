/**
 * Lo que pinta la vista de regiones (`regiones.ts`), derivado del mapa una vez:
 * qué región es cada casilla, por dónde pasa cada borde, dónde va la etiqueta de
 * cada región y qué nodo une qué regiones. **Solo en `pnpm dev`.**
 *
 * Sin DOM, para poder probarlo: la vista solo lo copia al lienzo. Nada de esto
 * es una regla nueva: la región de cada casilla y las regiones de cada nodo son
 * las de `estructura` (`core/map/regiones.ts`), la misma red que leen la renta, la
 * IA y el contrato; aquí solo se ponen en forma de dibujo.
 */

import type { GameMap, MapObject } from '@core/map/map.js';
import { estructura } from '@core/map/regiones.js';
import type { Point } from '@core/types.js';

/** Una región lista para pintar. */
export interface RegionPintada {
  readonly id: string;
  readonly nombre: string;
  readonly nivel: number;
  /** Índice en `map.regions`: el de su color. */
  readonly indice: number;
  readonly casillas: number;
  /** El centro de la casilla de la región más alejada de su borde: donde va la etiqueta. */
  readonly etiqueta: Point;
}

/** Un nodo de la red (un objeto `node` o una ciudad) listo para pintar. */
export interface NodoPintado {
  readonly id: string;
  /** El centro de su casilla. */
  readonly centro: Point;
  readonly ciudad: boolean;
  /** El objeto del mapa, vivo: el dueño se lee de él en cada fotograma. */
  readonly objeto: MapObject;
  /** Las regiones que toca (índices en `map.regions`), de `estructura`. */
  readonly regiones: readonly number[];
}

export interface RedPintada {
  readonly ancho: number;
  readonly alto: number;
  /** La región de cada casilla, o −1 (barrera, nodo o fuera de toda región); de `estructura`. */
  readonly regionDe: Int32Array;
  readonly regiones: readonly RegionPintada[];
  readonly nodos: readonly NodoPintado[];
  /**
   * Los bordes, en casillas del mundo: cada cuatro números, un lado de casilla
   * `x0, y0, x1, y1` que separa dos casillas de región distinta, o una región de
   * lo que no lo es (barrera, nodo o el marco del mapa).
   */
  readonly bordes: Float32Array;
  /** Los tramos de camino de centro a centro de casilla, cuatro números cada uno. */
  readonly caminos: Float32Array;
}

/**
 * La casilla de cada región más alejada de lo que no es ella (en 8 vecinas, y el
 * marco del mapa cuenta como fuera); en un empate, la más cercana a su centroide.
 * En una región en C el centroide cae fuera; esta casilla, nunca.
 */
export function casillasDeEtiqueta(
  ancho: number,
  alto: number,
  regionDe: Int32Array,
  regiones: number,
): Point[] {
  const n = ancho * alto;
  // Distancia de Chebyshev a lo que no es la misma región: BFS desde todo borde.
  const dist = new Int32Array(n).fill(-1);
  const cola: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = regionDe[i] as number;
    if (r < 0) continue;
    const x = i % ancho;
    const y = (i - x) / ancho;
    let enElBorde = false;
    for (let dy = -1; dy <= 1 && !enElBorde; dy++)
      for (let dx = -1; dx <= 1 && !enElBorde; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) enElBorde = true;
        else if (regionDe[ny * ancho + nx] !== r) enElBorde = true;
      }
    if (enElBorde) {
      dist[i] = 0;
      cola.push(i);
    }
  }
  for (let k = 0; k < cola.length; k++) {
    const i = cola[k] as number;
    const x = i % ancho;
    const y = (i - x) / ancho;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const j = ny * ancho + nx;
        if (dist[j] !== -1 || regionDe[j] !== regionDe[i]) continue;
        dist[j] = (dist[i] as number) + 1;
        cola.push(j);
      }
  }
  // Centroides, en enteros ×cuenta para comparar sin dividir.
  const sx = new Float64Array(regiones);
  const sy = new Float64Array(regiones);
  const cuenta = new Int32Array(regiones);
  for (let i = 0; i < n; i++) {
    const r = regionDe[i] as number;
    if (r < 0) continue;
    sx[r]! += i % ancho;
    sy[r]! += Math.floor(i / ancho);
    cuenta[r]! += 1;
  }
  const mejor = new Int32Array(regiones).fill(-1);
  const cerca = new Float64Array(regiones);
  for (let i = 0; i < n; i++) {
    const r = regionDe[i] as number;
    if (r < 0) continue;
    const c = cuenta[r] as number;
    const ex = (i % ancho) - (sx[r] as number) / c;
    const ey = Math.floor(i / ancho) - (sy[r] as number) / c;
    const d2 = ex * ex + ey * ey;
    const b = mejor[r] as number;
    if (
      b === -1 ||
      (dist[i] as number) > (dist[b] as number) ||
      (dist[i] === dist[b] && d2 < (cerca[r] as number))
    ) {
      mejor[r] = i;
      cerca[r] = d2;
    }
  }
  return [...mejor].map((i, r) => {
    if (i === -1)
      throw new Error(`la región ${r} no tiene ninguna casilla: no hay dónde poner su etiqueta`);
    return { x: i % ancho, y: Math.floor(i / ancho) };
  });
}

/** Los lados de casilla entre regiones distintas, o entre una región y lo que no lo es. */
export function bordesDeRegiones(ancho: number, alto: number, regionDe: Int32Array): Float32Array {
  const lados: number[] = [];
  const en = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= ancho || y >= alto ? -1 : (regionDe[y * ancho + x] as number);
  // Cada lado vertical a la izquierda de x y cada horizontal encima de y, del 0 al ancho/alto:
  // así el marco del mapa también se mira, una sola vez.
  for (let y = 0; y < alto; y++)
    for (let x = 0; x <= ancho; x++) {
      const a = en(x - 1, y);
      const b = en(x, y);
      if (a !== b && (a >= 0 || b >= 0)) lados.push(x, y, x, y + 1);
    }
  for (let y = 0; y <= alto; y++)
    for (let x = 0; x < ancho; x++) {
      const a = en(x, y - 1);
      const b = en(x, y);
      if (a !== b && (a >= 0 || b >= 0)) lados.push(x, y, x + 1, y);
    }
  return Float32Array.from(lados);
}

const cache = new WeakMap<GameMap, RedPintada>();

/** La red del mapa en forma de dibujo, una vez por mapa (el terreno y los nodos no cambian). */
export function redPintada(map: GameMap): RedPintada {
  const hecha = cache.get(map);
  if (hecha !== undefined) return hecha;
  const e = estructura(map);
  const etiquetas = casillasDeEtiqueta(map.width, map.height, e.regionDe, map.regions.length);
  const casillas = new Int32Array(map.regions.length);
  for (const r of e.regionDe) if (r >= 0) casillas[r]! += 1;
  const objetos = new Map(map.objects.map((o) => [o.id, o]));
  const caminos: number[] = [];
  for (const [a, b] of map.caminos.tramos) caminos.push(a.x + 0.5, a.y + 0.5, b.x + 0.5, b.y + 0.5);
  const red: RedPintada = {
    ancho: map.width,
    alto: map.height,
    regionDe: e.regionDe,
    regiones: map.regions.map((r, k) => {
      const p = etiquetas[k] as Point;
      return {
        id: r.id,
        nombre: r.name,
        nivel: r.nivel,
        indice: k,
        casillas: casillas[k] as number,
        etiqueta: { x: p.x + 0.5, y: p.y + 0.5 },
      };
    }),
    nodos: e.nodos.map((n) => {
      const objeto = objetos.get(n.id);
      if (objeto === undefined)
        throw new Error(`el nodo ${n.id} de la red no está entre los objetos del mapa`);
      return {
        id: n.id,
        centro: { x: n.at.x + 0.5, y: n.at.y + 0.5 },
        ciudad: n.ciudad,
        objeto,
        regiones: n.regiones,
      };
    }),
    bordes: bordesDeRegiones(map.width, map.height, e.regionDe),
    caminos: Float32Array.from(caminos),
  };
  cache.set(map, red);
  return red;
}
