/**
 * Mapa de aventura: una cuadrícula de terreno con objetos encima.
 *
 * A diferencia de la batalla (hexágonos), el mapa es cuadrado y se recorre en
 * ocho direcciones, como HoMM2.
 */
import type { Point, ResourceKind } from '../types.js';
import {
  DIAGONAL_FACTOR,
  isWalkable,
  ROAD_COST,
  TERRAIN_COST,
  type TerrainKind,
} from './terrain.js';

export type MapObject =
  | {
      readonly kind: 'mine';
      readonly id: string;
      readonly at: Point;
      readonly resource: ResourceKind;
      owner: number | null;
    }
  | {
      readonly kind: 'resource';
      readonly id: string;
      readonly at: Point;
      readonly resource: ResourceKind;
      readonly amount: number;
      taken: boolean;
    }
  | { readonly kind: 'town'; readonly id: string; readonly at: Point; owner: number | null }
  | {
      readonly kind: 'monster';
      readonly id: string;
      readonly at: Point;
      readonly creature: string;
      count: number;
      defeated: boolean;
    }
  | {
      readonly kind: 'chest';
      readonly id: string;
      readonly at: Point;
      readonly gold: number;
      taken: boolean;
    };

export interface GameMap {
  readonly width: number;
  readonly height: number;
  /** Terreno por casilla, en orden de filas. */
  readonly terrain: TerrainKind[];
  /** Casillas con camino, por clave "x,y". */
  readonly roads: Set<string>;
  readonly objects: MapObject[];
}

export function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

export function parsePointKey(key: string): Point {
  const [x, y] = key.split(',').map(Number);
  return { x: x as number, y: y as number };
}

export function inBounds(map: GameMap, p: Point): boolean {
  return p.x >= 0 && p.x < map.width && p.y >= 0 && p.y < map.height;
}

export function terrainAt(map: GameMap, p: Point): TerrainKind {
  if (!inBounds(map, p)) throw new Error(`(${p.x},${p.y}) está fuera del mapa`);
  return map.terrain[p.y * map.width + p.x] as TerrainKind;
}

export function objectAt(map: GameMap, p: Point): MapObject | undefined {
  const key = pointKey(p);
  return map.objects.find((o) => pointKey(o.at) === key);
}

/** ¿Bloquea el paso este objeto? Los monstruos vivos y los pueblos, sí. */
export function blocksMovement(o: MapObject): boolean {
  if (o.kind === 'monster') return !o.defeated;
  return o.kind === 'town' || o.kind === 'mine';
}

/**
 * ¿Se puede terminar el movimiento aquí? Un objeto recogible se pisa (y se
 * recoge); un monstruo se "pisa" para desencadenar la batalla.
 */
export function isEnterable(map: GameMap, p: Point): boolean {
  if (!inBounds(map, p)) return false;
  return isWalkable(terrainAt(map, p));
}

/** Coste de entrar en `to` viniendo de `from`. */
export function stepCost(map: GameMap, from: Point, to: Point): number {
  const base = map.roads.has(pointKey(to)) ? ROAD_COST : TERRAIN_COST[terrainAt(map, to)];
  const diagonal = from.x !== to.x && from.y !== to.y;
  return Math.round(diagonal ? base * DIAGONAL_FACTOR : base);
}

/** Las 8 casillas vecinas dentro del mapa. */
export function neighbours(map: GameMap, p: Point): Point[] {
  const out: Point[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = { x: p.x + dx, y: p.y + dy };
      if (inBounds(map, n)) out.push(n);
    }
  }
  return out;
}

export interface PathStep {
  readonly at: Point;
  /** Coste acumulado desde el origen. */
  readonly cost: number;
}

/**
 * Camino más barato de `from` a `to` con Dijkstra.
 *
 * Los objetos que bloquean paso no se pueden atravesar, pero SÍ pueden ser el
 * destino: así se interactúa con una mina o se ataca a un monstruo.
 */
export function findPath(map: GameMap, from: Point, to: Point): PathStep[] | null {
  if (!inBounds(map, from) || !inBounds(map, to)) return null;
  if (pointKey(from) === pointKey(to)) return [];
  if (!isEnterable(map, to)) return null;

  const bloqueadas = new Set<string>();
  for (const o of map.objects) {
    if (blocksMovement(o)) bloqueadas.add(pointKey(o.at));
  }

  const destino = pointKey(to);
  const coste = new Map<string, number>([[pointKey(from), 0]]);
  const previo = new Map<string, Point>();
  const pendientes = new Set<string>([pointKey(from)]);

  while (pendientes.size > 0) {
    // Cola de prioridad ingenua: los mapas del prototipo son de decenas de
    // casillas por lado, no de miles.
    let actualKey: string | null = null;
    let mejor = Infinity;
    for (const k of pendientes) {
      const c = coste.get(k) as number;
      if (c < mejor) {
        mejor = c;
        actualKey = k;
      }
    }
    if (actualKey === null) break;
    pendientes.delete(actualKey);

    if (actualKey === destino) {
      const pasos: PathStep[] = [];
      let cur = parsePointKey(actualKey);
      while (pointKey(cur) !== pointKey(from)) {
        pasos.unshift({ at: cur, cost: coste.get(pointKey(cur)) as number });
        cur = previo.get(pointKey(cur)) as Point;
      }
      return pasos;
    }

    const actual = parsePointKey(actualKey);
    for (const n of neighbours(map, actual)) {
      const nk = pointKey(n);
      if (!isEnterable(map, n)) continue;
      // Un obstáculo solo se admite si es el destino final.
      if (bloqueadas.has(nk) && nk !== destino) continue;

      const nuevo = (coste.get(actualKey) as number) + stepCost(map, actual, n);
      if (nuevo < (coste.get(nk) ?? Infinity)) {
        coste.set(nk, nuevo);
        previo.set(nk, actual);
        pendientes.add(nk);
      }
    }
  }

  return null;
}

/**
 * Lo que sabe una pasada de Dijkstra desde un origen: lo que cuesta llegar a
 * cada casilla y por dónde se llega.
 *
 * `prev` va siempre y no tras una bandera: construirlo no se paga aparte —es
 * un `set` en la misma rama que ya escribe el coste— y una bandera que cambia
 * la forma del retorno obliga a todos los llamantes a estrechar un tipo para
 * pedir algo que sale gratis.
 */
export interface Reachable {
  /** Coste de llegar a cada casilla, por clave "x,y". */
  readonly costs: Map<string, number>;
  /** Desde qué casilla se llega a cada una. El origen no está: no viene de nada. */
  readonly prev: Map<string, Point>;
}

/**
 * Coste de llegar a cada casilla desde `from`, en una sola pasada de Dijkstra,
 * **y por dónde**.
 *
 * Existe porque la IA necesita comparar decenas de destinos por turno: llamar a
 * `findPath` una vez por candidato multiplica el mismo trabajo por treinta.
 * Las casillas bloqueadas (monstruos, pueblos, minas) se registran con su coste
 * de entrada pero no se expanden: se puede llegar a ellas, no atravesarlas.
 *
 * Los predecesores son lo que evita el SEGUNDO recorrido: quien ya llamó aquí
 * para elegir a dónde ir no necesita relanzar `findPath` para saber por dónde
 * se va — retrocede por `prev` desde el destino. Se llamaba `reachableCosts`, y
 * el nombre cambió a propósito con la firma: así el typecheck señala a todos
 * los llamantes en vez de dejar que alguno se quede con la versión de antes
 * creyendo que sigue valiendo.
 */
export function reachableFrom(map: GameMap, from: Point, maxCost: number): Reachable {
  const coste = new Map<string, number>([[pointKey(from), 0]]);
  const previo = new Map<string, Point>();
  const cerradas = new Set<string>();
  const pendientes = new Set<string>([pointKey(from)]);

  const bloqueadas = new Set<string>();
  for (const o of map.objects) {
    if (blocksMovement(o)) bloqueadas.add(pointKey(o.at));
  }

  while (pendientes.size > 0) {
    let actualKey: string | null = null;
    let mejor = Infinity;
    for (const k of pendientes) {
      const c = coste.get(k) as number;
      if (c < mejor) {
        mejor = c;
        actualKey = k;
      }
    }
    if (actualKey === null) break;
    pendientes.delete(actualKey);
    cerradas.add(actualKey);

    // Desde una casilla bloqueada no se sigue: es final de trayecto. La
    // excepción es el origen — el héroe suele estar ENCIMA de su pueblo o de
    // una mina recién capturada, y tratarlo como muro lo dejaba sin rutas.
    if (bloqueadas.has(actualKey) && actualKey !== pointKey(from)) continue;

    const actual = parsePointKey(actualKey);
    for (const n of neighbours(map, actual)) {
      const nk = pointKey(n);
      if (cerradas.has(nk) || !isEnterable(map, n)) continue;
      const nuevo = mejor + stepCost(map, actual, n);
      if (nuevo > maxCost) continue;
      if (nuevo < (coste.get(nk) ?? Infinity)) {
        coste.set(nk, nuevo);
        previo.set(nk, actual);
        pendientes.add(nk);
      }
    }
  }

  return { costs: coste, prev: previo };
}

/** Casillas visibles desde `p` con radio `radius` (distancia de Chebyshev). */
export function visibleFrom(map: GameMap, p: Point, radius: number): string[] {
  const out: string[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (inBounds(map, q)) out.push(pointKey(q));
    }
  }
  return out;
}

export function createEmptyMap(
  width: number,
  height: number,
  fill: TerrainKind = 'grass',
): GameMap {
  return {
    width,
    height,
    terrain: new Array<TerrainKind>(width * height).fill(fill),
    roads: new Set<string>(),
    objects: [],
  };
}
