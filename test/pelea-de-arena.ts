/**
 * Lo que la sesión de la arena le pasa a `retocarEnBatalla`, para los tests que
 * retocan una batalla a mano: el catálogo de su pelea (sus unidades) con las
 * piezas que se digan. `montar` recuerda el montaje de cada batalla.
 */
import {
  batallaDeArena,
  type CatalogoDeLaArena,
  catalogoDeLaPelea,
  type MontajeDeArena,
} from '../src/core/arena.js';
import type { BattleState } from '../src/core/battle/types.js';
import type { CatalogoDeEquipo } from '../src/core/hero/equipo.js';
import type { Rng } from '../src/core/rng.js';

const MONTAJES = new WeakMap<BattleState, MontajeDeArena>();

/** `batallaDeArena`, recordando su montaje para `catalogoDe`. */
export function montar(m: MontajeDeArena, rng: Rng): BattleState {
  const b = batallaDeArena(m, rng);
  MONTAJES.set(b, m);
  return b;
}

/** El catálogo de la pelea `b`: las unidades de su montaje con las piezas `eq`. */
export function catalogoDe(b: BattleState, eq: CatalogoDeEquipo): CatalogoDeLaArena {
  const m = MONTAJES.get(b);
  if (m === undefined) throw new Error('esta batalla no la montó `montar`');
  return catalogoDeLaPelea(
    [...m.izquierda.unidades, ...m.derecha.unidades].map((f) => f.unidad),
    eq,
  );
}
