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

/**
 * Una semilla escrita por una persona —`?seed=777` en el navegador,
 * `HEROES_SEED=777` en el servidor—, `null` si no ha pedido ninguna, o el
 * motivo por el que lo que escribió no lo es.
 *
 * Vive en `core` y no en el cliente porque la regla es del motor: `createRng`
 * hace `seed >>> 0`, así que un `-1` o un `NaN` no revienta, **se convierte en
 * otra partida en silencio** — y quien escribe una semilla quiere ESA. Estaba
 * validada solo en `main.ts` y el servidor aceptaba cualquier cosa.
 *
 * **No pedir semilla no es un error**, y por eso devuelve `null` en vez de
 * lanzar: rechazar es para lo que se pidió y no se puede dar, como `abc`. Los
 * dos llamantes discrepaban justo aquí —`HEROES_SEED=` vacía mataba el
 * servidor mientras `?seed=` vacío sorteaba en el navegador—, y la discrepancia
 * era la mitad de la regla que cada uno se escribía por su cuenta antes de
 * llamar. Lo que hace con el `null` sí es de cada uno: el navegador sortea, el
 * servidor tira de su semilla por defecto.
 *
 * Devolver `null` y no `0` es lo que cierra la trampa de verdad: `Number(null)`
 * y `Number('')` son 0, una semilla perfectamente legal, así que «no pediste
 * ninguna» y «pediste la 0» serían la misma partida.
 */
export function parseSeed(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  const seed = Number(texto);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`"${texto}" no es una semilla: tiene que ser un número entero ≥ 0, como 777`);
  }
  return seed;
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
