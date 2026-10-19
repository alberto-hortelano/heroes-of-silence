/**
 * Pinta la escena de la tropa: el campo del combate detrás, y el héroe y su
 * tropa en arco, de pie, mirando a la cámara (`S`) y respirando (`idle`).
 *
 * Las figuras son las de siempre (`pintarFiguraConSombra`), con la caja del
 * encuadre (`cajaEnLaTropa`: la de una de combate, encogida por su hondo) y la
 * hoja que les da la vista; sin arte, su marcador con la inicial. Se pintan de atrás adelante para que la de delante
 * tape a la de detrás. La elegida lleva el aro dorado grueso y la que señala el
 * ratón, el fino.
 */
import type { Plano } from '../../../shared/base.js';
import { dentroDeLaFigura, pintarAroDeFigura, pintarFondo } from '../batalla.js';
import { pintarFiguraConSombra } from '../figura.js';
import type { Tablero } from '../proyeccion.js';
import { cajaEnLaTropa } from './arco.js';

/** Una figura de la escena, ya colocada: quién es (para su compás), cómo se pinta y dónde pisa. */
export interface FiguraEnLaEscena {
  readonly id: string;
  readonly nombre: string;
  readonly cuerpo: string;
  readonly en: Plano;
}

export interface PintadoDeLaTropa {
  readonly lienzo: { readonly ancho: number; readonly alto: number };
  readonly t: Tablero;
  /** El horizonte del campo del fondo, en píxeles (`EncuadreDeLaTropa.horizonte`). */
  readonly horizonte: number;
  readonly figuras: readonly FiguraEnLaEscena[];
  /** El índice de la elegida y el de la señalada en `figuras`, o `null`. */
  readonly elegida: number;
  readonly señalada: number | null;
  readonly color: string;
  /** Milisegundos para el reloj del reposo. */
  readonly ahora: number;
}

/** De atrás adelante: el orden en que se pintan (y, al revés, en que se pulsan). */
export function deAtrasAdelante(figuras: readonly FiguraEnLaEscena[]): number[] {
  return figuras.map((_, i) => i).sort((a, b) => figuras[a]!.en.y - figuras[b]!.en.y || a - b);
}

/**
 * La figura bajo un píxel, o `null`: de delante atrás, la primera cuyo cuerpo lo
 * cubre (`dentroDeLaFigura`, la regla del clic de la batalla y de la base).
 */
export function figuraBajo(
  t: Tablero,
  figuras: readonly FiguraEnLaEscena[],
  px: number,
  py: number,
): number | null {
  for (const i of deAtrasAdelante(figuras).reverse()) {
    if (dentroDeLaFigura(cajaEnLaTropa(t, figuras[i]!.en), px, py)) return i;
  }
  return null;
}

export function pintarLaTropa(ctx: CanvasRenderingContext2D, v: PintadoDeLaTropa): void {
  pintarFondo(ctx, { ancho: v.lienzo.ancho, alto: v.lienzo.alto, horizonte: v.horizonte });
  for (const i of deAtrasAdelante(v.figuras)) {
    const f = v.figuras[i]!;
    const c = cajaEnLaTropa(v.t, f.en);
    if (i === v.elegida) pintarAroDeFigura(ctx, c, 3);
    else if (i === v.señalada) pintarAroDeFigura(ctx, c, 1.5);
    pintarFiguraConSombra(ctx, {
      id: f.id,
      body: f.cuerpo,
      clip: 'idle',
      tiempo: v.ahora,
      x: c.x,
      suelo: c.suelo,
      alto: c.alto,
      mira: 'S',
      color: v.color,
      rotulo: f.nombre.charAt(0).toUpperCase(),
    });
  }
}
