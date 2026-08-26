/**
 * Rejilla de batalla: 11 × 9 = 99 hexes (verificado en `battle_board.h` de
 * fheroes2). Coordenadas offset **odd-r**: filas horizontales, y las filas
 * impares van desplazadas media celda a la derecha.
 */
import type { Hex } from '../types.js';

export const BOARD_WIDTH = 11;
export const BOARD_HEIGHT = 9;
export const BOARD_SIZE = BOARD_WIDTH * BOARD_HEIGHT;

export function isInside(h: Hex): boolean {
  return h.col >= 0 && h.col < BOARD_WIDTH && h.row >= 0 && h.row < BOARD_HEIGHT;
}

export function hexKey(h: Hex): string {
  return `${h.col},${h.row}`;
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.col === b.col && a.row === b.row;
}

/** Los 6 vecinos, en orden E, SE, SW, W, NW, NE. Filtrados al tablero. */
export function neighbours(h: Hex): Hex[] {
  const odd = h.row % 2 === 1;
  const shift = odd ? 1 : 0;
  const candidates: Hex[] = [
    { col: h.col + 1, row: h.row },
    { col: h.col - 1 + shift, row: h.row + 1 },
    { col: h.col + shift, row: h.row + 1 },
    { col: h.col - 1, row: h.row },
    { col: h.col - 1 + shift, row: h.row - 1 },
    { col: h.col + shift, row: h.row - 1 },
  ];
  // El orden importa poco, pero los duplicados sí: en odd-r, SE y SW comparten
  // columna cuando shift los junta. Se filtran junto a los de fuera del tablero.
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const c of candidates) {
    if (!isInside(c)) continue;
    const k = hexKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// -------------------------------------------------------------- distancia

interface Cube {
  q: number;
  r: number;
  s: number;
}

function toCube(h: Hex): Cube {
  const q = h.col - (h.row - (h.row % 2)) / 2;
  const r = h.row;
  return { q, r, s: -q - r };
}

/** Distancia en hexes entre dos casillas. */
export function hexDistance(a: Hex, b: Hex): number {
  const ca = toCube(a);
  const cb = toCube(b);
  return Math.max(Math.abs(ca.q - cb.q), Math.abs(ca.r - cb.r), Math.abs(ca.s - cb.s));
}

export function areAdjacent(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1;
}

// -------------------------------------------------------------- ocupación

/**
 * Una unidad grande ocupa su hex de cabeza y el de detrás. "Detrás" depende del
 * bando: el atacante mira a la derecha, así que su cola queda a la izquierda.
 */
export function occupiedHexes(head: Hex, size: number, facingRight: boolean): Hex[] {
  if (size <= 1) return [head];
  const tail: Hex = { col: facingRight ? head.col - 1 : head.col + 1, row: head.row };
  return [head, tail];
}

// -------------------------------------------------------------- pathfinding

/**
 * Un hex alcanzado por el BFS: la casilla y a cuántos pasos queda.
 *
 * El `Hex` viaja aquí dentro porque quien lo mete YA lo tiene en la mano —sale
 * de `neighbours`, que lo acaba de construir— y quien lo saca lo necesita. Sin
 * él, la clave se partía por la coma y se convertían dos trozos a número **dos
 * veces por hex**: una en `movableFrom` para filtrar los que no caben y otra en
 * `movableHexes` para devolverlos. Es el mismo motivo por el que
 * `NodoFrontera.at` lleva su `Point` en el mapa de aventura.
 */
export interface Paso {
  readonly at: Hex;
  /** Pasos desde el origen. */
  readonly steps: number;
}

/**
 * Hexes alcanzables desde `from` con `maxSteps` pasos, esquivando `blocked`.
 * BFS: en un tablero de 99 casillas no hay nada que optimizar.
 * Devuelve un mapa hexKey → paso (incluye `from` con 0 pasos).
 */
export function reachable(
  from: Hex,
  maxSteps: number,
  blocked: ReadonlySet<string>,
): Map<string, Paso> {
  const dist = new Map<string, Paso>([[hexKey(from), { at: from, steps: 0 }]]);
  let frontier: Hex[] = [from];

  for (let step = 1; step <= maxSteps; step++) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbours(h)) {
        const k = hexKey(n);
        if (dist.has(k) || blocked.has(k)) continue;
        dist.set(k, { at: n, steps: step });
        next.push(n);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return dist;
}

/**
 * Camino más corto de `from` a `to` (sin incluir `from`), o `null` si no llega.
 * `blocked` no debe contener `to` si se quiere llegar a él.
 */
export function findPath(from: Hex, to: Hex, blocked: ReadonlySet<string>): Hex[] | null {
  if (hexEquals(from, to)) return [];
  const cameFrom = new Map<string, Hex>();
  const seen = new Set<string>([hexKey(from)]);
  let frontier: Hex[] = [from];

  while (frontier.length > 0) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbours(h)) {
        const k = hexKey(n);
        if (seen.has(k) || blocked.has(k)) continue;
        seen.add(k);
        cameFrom.set(k, h);
        if (hexEquals(n, to)) {
          const path: Hex[] = [n];
          let cur = h;
          while (!hexEquals(cur, from)) {
            path.unshift(cur);
            cur = cameFrom.get(hexKey(cur)) as Hex;
          }
          return path;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/** Todos los hexes del tablero, de arriba abajo y de izquierda a derecha. */
export function allHexes(): Hex[] {
  const out: Hex[] = [];
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) out.push({ col, row });
  }
  return out;
}
