/**
 * El progreso de la generación de un mundo (F1a del mapa vivo): lo que escribe el
 * motor en el servidor de desarrollo (`tools/mundo/motor.ts`) y lo que pinta la
 * espera de «El mundo» (`desarrollo/mundo.ts`), en un sitio. Sin dependencias: lo
 * cargan los dos lados, como `esquema.ts` el de las marcas.
 */

export type Fase = 'congelar' | 'pintar' | 'motor' | 'validar' | 'listo' | 'fallido';

/** Lo que pregunta la pantalla de espera (`GET /__mundos/<id>/progreso`). */
export interface Progreso {
  readonly id: string;
  readonly fase: Fase;
  readonly lineas: readonly string[];
  readonly empezo: number;
  /** Cuándo llegó la última línea del motor (ms de época). */
  readonly ultima: number;
  /** Cuántas veces ha validado el motor. */
  readonly validaciones: number;
  /**
   * Lo que dijo la última validación del motor que no pasó: cuántos problemas y el
   * primero. Se borra cuando una pasa. Es lo que se lee de su trabajo, no sus órdenes.
   */
  readonly ultimoProblema?: string | undefined;
  /** Lo que no valió, si falló al validar. */
  readonly problemas?: readonly string[];
  /** Por qué falló, para la persona. */
  readonly motivo?: string;
}

/** Si una generación ya no sigue: acabó bien o falló. */
export function terminada(fase: Fase): boolean {
  return fase === 'listo' || fase === 'fallido';
}
