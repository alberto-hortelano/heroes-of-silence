/**
 * RNG determinista sembrado. Toda tirada del juego pasa por aquí: sin esto no
 * hay partidas reproducibles, y un test de batalla sería una lotería.
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** Entero en [min, max], ambos incluidos. */
  int(min: number, max: number): number;
  /** true con probabilidad `p`. */
  chance(p: number): boolean;
  /** Elemento al azar; lanza si el array está vacío. */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: pequeño, rápido y de calidad suficiente para un juego por turnos. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() sobre un array vacío');
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}
