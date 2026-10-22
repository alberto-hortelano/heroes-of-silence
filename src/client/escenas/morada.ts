/**
 * La escena de una morada: dentro de la base, con la cámara acercada a ella, el
 * edificio abierto (sin la pared de delante, con su sala) y, delante, en el
 * empedrado, una figura por unidad que produce, en fila y mirando a la cámara.
 * Pulsar una la elige (`elegirEnLaMorada`) y el panel enseña su ficha y su
 * reclutamiento. Es una escena de pie (`escenas/de-pie.ts`) con la fila y la
 * cámara de `render/morada/fila.ts`.
 *
 * El fondo es la base misma (`FondoDeLaMorada`, que en la página pinta
 * `EscenaBase.pintarLaMorada`, con la versión abierta del edificio si la hay):
 * alrededor sigue la plaza (vuelta 2, 20-10-2026).
 */
import { disposicionDe } from '../../shared/base.js';
import type { VistaDeLaMorada } from '../morada/vista.js';
import { cajaDeFiguraEn } from '../render/batalla.js';
import { type CajaEn, type LienzoDePie, pintarDePie } from '../render/de-pie.js';
import type { LuzSobreLaFigura } from '../render/figura.js';
import { type EncuadreDeLaMorada, encuadrarLaMorada } from '../render/morada/fila.js';
import type { Tablero } from '../render/proyeccion.js';
import { AYUDA_DE_LA_MORADA, type Session } from '../session.js';
import { type DePie, EscenaDePie } from './de-pie.js';

/** La caja de cada figura de la morada con la cámara `t`: la de combate, sin hondo. */
export function cajasDeLaMorada(t: Tablero): CajaEn {
  return (en) => cajaDeFiguraEn(t, en);
}

/** Lo que el fondo de la morada deja para la fila: la luz que cae sobre ella y lo que va delante. */
export interface ClimaDeLaFila {
  /** La luz del clima de la base sobre las figuras (`Figura.luz`). */
  readonly luz: LuzSobreLaFigura | undefined;
  /** La lluvia y el rayo de la base, delante de la fila. */
  readonly delante: () => void;
}

/**
 * Lo que va detrás de la fila: la base con la cámara de la morada y su edificio
 * abierto (`EscenaBase.pintarLaMorada`). Devuelve el clima de la fila (la luz
 * sobre las figuras y lo que va delante de ellas), o `null`. En `pnpm capturas`,
 * que encuadra en Node, nada.
 */
export type FondoDeLaMorada = (
  ctx: CanvasRenderingContext2D,
  lienzo: LienzoDePie,
  camara: Tablero,
  vista: VistaDeLaMorada,
  ahora: number,
) => ClimaDeLaFila | null;

function deLaMorada(fondo: FondoDeLaMorada): DePie<VistaDeLaMorada, EncuadreDeLaMorada> {
  return {
    escena: 'morada',
    ayuda: AYUDA_DE_LA_MORADA,
    frases: {
      elegida: 'su ficha y su reclutamiento están en el panel.',
      otra: 'pulsa para ver su ficha y reclutar.',
    },
    vista: (s) => s.vistaDeLaMorada(),
    encuadrar: (lienzo, vista) =>
      encuadrarLaMorada(lienzo, disposicionDe(vista.faccion), vista.sitio, vista.figuras.length),
    caja: cajasDeLaMorada,
    // `canvas.dataset.morada`: `<edificio>:<unidad elegida>`.
    marca: (vista) => `${vista.edificio}:${vista.figuras[vista.elegida]?.id ?? ''}`,
    elegir: (s, vista, i) => s.elegirEnLaMorada(vista.figuras[i]!.id),
    pintar: (ctx, { lienzo, vista, encuadre, pie }) => {
      const clima = fondo(ctx, lienzo, encuadre.camara, vista, pie.ahora);
      pintarDePie(ctx, { ...pie, luz: clima?.luz });
      clima?.delante();
    },
  };
}

export class EscenaMorada extends EscenaDePie<VistaDeLaMorada, EncuadreDeLaMorada> {
  constructor(sesion: () => Session, fondo: FondoDeLaMorada) {
    super(sesion, deLaMorada(fondo));
  }
}
