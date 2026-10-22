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
import { type EncuadreDeLaMorada, encuadrarLaMorada } from '../render/morada/fila.js';
import type { Tablero } from '../render/proyeccion.js';
import { AYUDA_DE_LA_MORADA, type Session } from '../session.js';
import { type DePie, EscenaDePie } from './de-pie.js';

/** La caja de cada figura de la morada con la cámara `t`: la de combate, sin hondo. */
export function cajasDeLaMorada(t: Tablero): CajaEn {
  return (en) => cajaDeFiguraEn(t, en);
}

/**
 * Lo que va detrás de la fila: la base con la cámara de la morada y su edificio
 * abierto (`EscenaBase.pintarLaMorada`). Devuelve lo que va delante de la fila
 * (la lluvia y el rayo de la base), o `null`. En `pnpm capturas`, que encuadra en
 * Node, nada.
 */
export type FondoDeLaMorada = (
  ctx: CanvasRenderingContext2D,
  lienzo: LienzoDePie,
  camara: Tablero,
  vista: VistaDeLaMorada,
  ahora: number,
) => (() => void) | null;

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
      const delante = fondo(ctx, lienzo, encuadre.camara, vista, pie.ahora);
      pintarDePie(ctx, pie);
      delante?.();
    },
  };
}

export class EscenaMorada extends EscenaDePie<VistaDeLaMorada, EncuadreDeLaMorada> {
  constructor(sesion: () => Session, fondo: FondoDeLaMorada) {
    super(sesion, deLaMorada(fondo));
  }
}
