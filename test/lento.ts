/**
 * El bucle rápido y la orden lenta (#167).
 *
 * `pnpm verify` lo pasa cada agente varias veces por tarea, y había subido a
 * ~64 s por los guardias que se miden sobre muchas semillas o sobre todo el arte
 * del repo. Cada uno de esos guardias corre en `pnpm verify` con unas pocas
 * semillas —las justas para que muerda— y con todas en `pnpm verify:lento`
 * (`HEROES_LENTO=1`), que corre en CI. Lo que solo tiene sentido como medida
 * (una cuenta exacta sobre diez semillas, una mediana) va con `itLento` y en el
 * bucle rápido sale como saltado: se ve que existe y dónde corre.
 *
 * El criterio de qué es lento, con la tabla de tiempos, está en
 * `docs/agents/2026-10-07-verify-rapido/implementacion.md`.
 */
import { it } from 'vitest';

function leerLento(valor: string | undefined): boolean {
  if (valor === undefined || valor === '' || valor === '0') return false;
  if (valor === '1') return true;
  // Un `HEROES_LENTO=si` que se leyera como «rápido» daría un verde que no
  // midió lo que quien lo lanzó creía.
  throw new Error(
    `HEROES_LENTO=${valor} no se entiende: vale 1 (la orden lenta, \`pnpm verify:lento\`) o nada (el bucle rápido)`,
  );
}

/** Si corre la orden lenta: todas las semillas y todo el arte. */
export const LENTO = leerLento(process.env.HEROES_LENTO);

/** `rapido` en `pnpm verify`, `lento` en `pnpm verify:lento`. */
export const segunPrisa = <T>(rapido: T, lento: T): T => (LENTO ? lento : rapido);

/** Las semillas de `desde` a `hasta`, las dos incluidas. */
export const rango = (desde: number, hasta: number): number[] =>
  Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k);

/** Un test que solo corre en la orden lenta: una medida, no un guardia que muerda con una semilla. */
export const itLento = it.runIf(LENTO);
