/**
 * Lo que comparten las órdenes de `pnpm taller` (`ordenes/`): su forma, `Orden` (su
 * ayuda y qué hace), la cola del repositorio, `COLA`, la facción de un argumento y
 * cuál se corre, `elegirOrden`. La tabla que las junta es `ORDENES`, en `trabajador.ts`.
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

/** Lo que sale de la línea de órdenes: la ayuda, una orden con lo que la sigue, o un error. */
type Eleccion =
  | { readonly que: 'ayuda' }
  | { readonly que: 'orden'; readonly orden: Orden; readonly resto: readonly string[] }
  | { readonly que: 'desconocida'; readonly motivo: string };

/**
 * Qué hace `pnpm taller` con lo que se le escribe. **Sin orden, la ayuda**, no el
 * trabajador (#327, 11-11-2026): hasta entonces `pnpm taller` a secas vaciaba la cola, y
 * un agente que lo lanzó por error el 10-11 pintó con Codex una imagen que nadie había
 * pedido. Vaciar la cola es `pnpm taller trabajar`, y hay que escribirlo.
 *
 * Es pura (no toca `process`) para probarla sin arrancar nada: `trabajador.ts` la llama
 * con `ORDENES` y la línea de órdenes.
 */
export function elegirOrden(
  ordenes: Readonly<Record<string, Orden>>,
  argv: readonly string[],
): Eleccion {
  const [orden, ...resto] = argv;
  if (orden === undefined) return { que: 'ayuda' };
  // `Object.hasOwn`: «constructor» o «toString» no son órdenes aunque el objeto los herede.
  const laOrden = Object.hasOwn(ordenes, orden) ? ordenes[orden] : undefined;
  if (laOrden !== undefined) return { que: 'orden', orden: laOrden, resto };
  return {
    que: 'desconocida',
    motivo: `orden desconocida «${orden}»: hay ${Object.keys(ordenes).join(', ')} («pnpm taller ayuda» dice cómo se escribe cada una)`,
  };
}
