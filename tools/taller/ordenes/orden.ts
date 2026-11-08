/**
 * Lo que comparten las órdenes de `pnpm taller` (`ordenes/`): su forma, `Orden` (su
 * ayuda y qué hace), la cola del repositorio, `COLA`, y la facción de un argumento.
 * La tabla que las junta y despacha es `ORDENES`, en `trabajador.ts`.
 */
import { FACTION_IDS, type FactionId } from '../../../src/core/types.js';
import { RAIZ } from '../../comun/raiz.js';
import { colaDelTaller } from '../cola.js';

/** La facción de un argumento de la línea de órdenes, o lanza con el uso. */
export function faccionDe(arg: string | undefined, uso: string): FactionId {
  const f = FACTION_IDS.find((x) => x === arg);
  if (f === undefined) {
    throw new Error(`uso: ${uso} (la facción es una de ${FACTION_IDS.join(', ')}, no «${arg}»)`);
  }
  return f;
}
export const COLA = colaDelTaller(RAIZ);

/**
 * Una orden de `pnpm taller`: cómo se escribe, que es su ayuda (una línea o varias,
 * `pnpm taller <orden> …` y lo que hace), y qué hace con lo que la sigue.
 */
export interface Orden {
  readonly uso: string;
  readonly correr: (resto: readonly string[]) => Promise<void> | void;
}
