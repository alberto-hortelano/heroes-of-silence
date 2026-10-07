/**
 * Las herramientas de desarrollo del cliente: solo tipos.
 *
 * Lo que hay en `desarrollo/` existe **solo en `pnpm dev`**: `main.ts` lo trae
 * con un `import()` detrás de `HERRAMIENTAS_DE_DESARROLLO`, que en `vite build`
 * vale `false`, y el plugin `sinDesarrollo` de `vite.config.ts` rompe el build
 * si algo se cuela. Este fichero se puede importar desde fuera, pero **solo con
 * `import type`**: un tipo no deja rastro en el bundle (lo vigila
 * `invariantes.test.ts`).
 *
 * Los de la marca salen de sus esquemas (`esquema.ts`): la forma se escribe una vez.
 */
import type { z } from 'zod';
import type { esquemaDeMarca, esquemaDeMarcaNueva, esquemaDeQueHay } from './esquema.js';

/** Lo que el cliente necesita del modo «marcar fallo». */
export interface Desarrollo {
  /** El modo está puesto: un clic en el mapa marca en vez de mover. */
  readonly activo: boolean;
  /** Pinta encima del mapa el punto marcado (el aspa). */
  dibujar(ctx: CanvasRenderingContext2D): void;
  /** Si la tecla es suya (M, Escape en el modo) y la ha tratado. */
  tecla(ev: KeyboardEvent): boolean;
  /** Un clic (no un arrastre) en el mapa con el modo puesto, en píxeles CSS del lienzo. */
  clic(px: number, py: number): void;
}

/** Lo que hay en un punto y su casilla (`queHayEn`). */
export type QueHay = z.infer<typeof esquemaDeQueHay>;
export type SpriteAhi = QueHay['sprites'][number];
export type CaraAhi = QueHay['caras'][number];
export type PuenteAhi = NonNullable<QueHay['puente']>;

/** Lo que manda el cliente al guardar. */
export type MarcaNueva = z.infer<typeof esquemaDeMarcaNueva>;
/** Una marca en disco (`docs/revision/marcas/<id>.json`). */
export type Marca = z.infer<typeof esquemaDeMarca>;
export type Punto2 = MarcaNueva['punto'];
