/**
 * Hacia dónde mira una figura: la dirección de vista en ocho sectores.
 *
 * Es la REGLA, y no sabe nada del arte: sale del vector en pantalla hacia la
 * casilla siguiente del camino o hacia el objetivo, y la guarda el animador
 * (`anim.ts`). Qué hoja pinta cada dirección es otra tabla, del lado de pintar
 * (`INDICE_DE_HOJA`, en `render/personajes.ts`): toda figura tiene sus ocho
 * direcciones y ninguna se espeja. El arte de perfil, que solo sabía mirar a la
 * derecha o espejado, se retiró el 03-10-2026 con la llegada del Y Bot en 8
 * direcciones como respaldo de toda figura.
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
  return direccionEnPantalla(hacia.x - desde.x, (hacia.y - desde.y) * COMPRESION_SUELO, antes);
}

/**
 * La dirección de un vector YA en pantalla (x a la derecha, y hacia abajo): la
 * del mapa de aventura, que tiene su propia cámara y no pasa por el plano del
 * tablero. Sin vector se conserva `antes`.
 */
export function direccionEnPantalla(dx: number, dyPantalla: number, antes: Direccion): Direccion {
  // En pantalla la y crece hacia abajo; el norte es hacia arriba.
  const dy = -dyPantalla;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return antes;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECCIONES[((sector % 8) + 8) % 8] as Direccion;
}
