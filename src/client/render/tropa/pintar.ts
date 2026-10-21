/**
 * Pinta la escena de la tropa: el campo del combate detrás, y el héroe y su
 * tropa en arco, de pie, mirando a la cámara (`S`) y respirando (`idle`).
 *
 * Las figuras, su orden y su aro son los de `render/de-pie.ts` (los mismos de la
 * morada), con la caja del encuadre (`cajaEnLaTropa`: la de una de combate,
 * encogida por su hondo).
 */
import { pintarFondo } from '../batalla.js';
import { type CajaEn, type PintadoDePie, pintarDePie } from '../de-pie.js';
import type { Tablero } from '../proyeccion.js';
import { cajaEnLaTropa } from './arco.js';

export interface PintadoDeLaTropa extends PintadoDePie {
  readonly lienzo: { readonly ancho: number; readonly alto: number };
  /** El horizonte del campo del fondo, en píxeles (`EncuadreDeLaTropa.horizonte`). */
  readonly horizonte: number;
}

/** La caja de cada figura de la tropa con la cámara `t`. */
export function cajasDeLaTropa(t: Tablero): CajaEn {
  return (en) => cajaEnLaTropa(t, en);
}

export function pintarLaTropa(ctx: CanvasRenderingContext2D, v: PintadoDeLaTropa): void {
  pintarFondo(ctx, { ancho: v.lienzo.ancho, alto: v.lienzo.alto, horizonte: v.horizonte });
  pintarDePie(ctx, v);
}
