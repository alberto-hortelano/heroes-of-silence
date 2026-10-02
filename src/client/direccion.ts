/**
 * Hacia dónde mira una figura: la dirección de vista en ocho sectores.
 *
 * Es la REGLA, y no sabe nada del arte: sale del vector en pantalla hacia la
 * casilla siguiente del camino o hacia el objetivo, y la guarda el animador
 * (`anim.ts`). Lo que el arte de hoy sabe pintar con ella —derecha o espejado—
 * es otra función, del lado de pintar (`espejadoPara`, en `render/figura.ts`).
 * **El arte de perfil es temporal** (decisión del usuario, 02-10-2026: «tendrá
 * las 8 direcciones»): cuando lleguen las hojas de ocho, cambia esa traducción
 * —el atlas dirá qué direcciones trae— y esta regla no.
 */
import { COMPRESION_SUELO } from '../shared/arte.js';
import type { Plano } from './render/proyeccion.js';

/** Los ocho sectores, en el sentido contrario a las agujas desde el este. */
export const DIRECCIONES = ['E', 'NE', 'N', 'NO', 'O', 'SO', 'S', 'SE'] as const;
export type Direccion = (typeof DIRECCIONES)[number];

/**
 * La dirección de `desde` hacia `hacia`, dos puntos del plano del tablero.
 *
 * El vector se mira **en pantalla**: el plano se aplasta en vertical por la
 * cámara, y los sectores son los del arte, que se renderizó a 25°
 * (`COMPRESION_SUELO`). Con el plano sin aplastar, la vecina de arriba a la
 * derecha caería en el sector del norte por poco. Sin vector —el mismo punto—
 * no hay hacia dónde girarse y se conserva `antes`.
 */
export function direccionHacia(desde: Plano, hacia: Plano, antes: Direccion): Direccion {
  const dx = hacia.x - desde.x;
  // En pantalla la y crece hacia abajo; el norte es hacia arriba.
  const dy = -(hacia.y - desde.y) * COMPRESION_SUELO;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return antes;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECCIONES[((sector % 8) + 8) % 8] as Direccion;
}

/** ¿Tiene lado —este u oeste— esta dirección? El norte y el sur puros, no. */
export function tieneLado(d: Direccion): boolean {
  return d !== 'N' && d !== 'S';
}
