/**
 * Los dos lados de la arena —la izquierda ataca y la derecha defiende— y de dónde
 * sale lo que va en ellos (`FuenteDeArena`).
 *
 * Era parte de `core/arena.ts`, repartido en `arena/` en la fase N de la
 * reorganización (07-11-2026); lo que hace la arena y por qué, en `montaje.ts`.
 */
import type { Side } from '../battle/types.js';
import type { Unidad } from '../unidad/formato.js';

/**
 * Los dos lados del montaje y lo que el motor sabe de ellos: la izquierda ataca
 * y la derecha defiende. Una tabla, porque «izquierdo», «izquierda» y
 * `attacker` se escribían a mano en siete sitios.
 */
export type Lado = 'izquierda' | 'derecha';
export const LADOS: Readonly<
  Record<Lado, { readonly bando: Side; readonly adjetivo: string; readonly rotulo: string }>
> = {
  izquierda: { bando: 'attacker', adjetivo: 'izquierdo', rotulo: 'Izquierda' },
  derecha: { bando: 'defender', adjetivo: 'derecho', rotulo: 'Derecha' },
};

/** El lado del montaje de un bando del motor. */
export function ladoDe(bando: Side): Lado {
  return bando === LADOS.izquierda.bando ? 'izquierda' : 'derecha';
}
// ------------------------------------------------------------- la fuente

/**
 * De dónde sale una unidad del montaje: del catálogo de unidades (las cinco
 * facciones). Las criaturas del juego ya no entran en la arena (13-10-2026, el
 * usuario: «solo cuentan los 5 que hay en la arena»). `escalera` es si sale con
 * escalera para la muralla: es del montaje, no de la unidad (la misma hoja puede
 * ir con ella o sin ella).
 */
export interface FuenteDeArena {
  readonly unidad: Unidad;
  readonly escalera?: boolean;
}
