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
import type { SitioId } from '@core/town/sitios.js';
import type { FactionId } from '@core/types.js';
import { disposicionDe } from '../../shared/base.js';
import type { VistaDeLaMorada } from '../morada/vista.js';
import { cajaDeFiguraEn } from '../render/batalla.js';
import { type CajaEn, type LienzoDePie, pintarDePie } from '../render/de-pie.js';
import { type EncuadreDeLaMorada, encuadrarLaMorada } from '../render/morada/fila.js';
import type { Tablero } from '../render/proyeccion.js';
import { AYUDA_DE_LA_MORADA, type Session } from '../session.js';
import { type DePie, EscenaDePie, type VistaDePie } from './de-pie.js';

/** La caja de cada figura de la morada con la cámara `t`: la de combate, sin hondo. */
export function cajasDeLaMorada(t: Tablero): CajaEn {
  return (en) => cajaDeFiguraEn(t, en);
}

/**
 * Lo que va detrás de la fila: la base con la cámara de la morada y su edificio
 * abierto (`EscenaBase.pintarLaMorada`). En `pnpm capturas`, que encuadra en Node,
 * nada. Lo usa también el ayuntamiento (`escenas/ayuntamiento.ts`), con su vista.
 */
export type FondoDeLaMorada<V extends { readonly edificio: string } = VistaDeLaMorada> = (
  ctx: CanvasRenderingContext2D,
  lienzo: LienzoDePie,
  camara: Tablero,
  vista: V,
  ahora: number,
) => void;

/** Lo que la fila ante un edificio lee de su vista: dónde está y qué edificio es. */
type VistaAnteUnEdificio = VistaDePie & {
  readonly faccion: FactionId;
  readonly sitio: SitioId;
  readonly edificio: string;
};

/**
 * Una escena de pie ante un edificio de la base (la morada, el ayuntamiento):
 * la fila y la cámara de `encuadre` ante su sitio (la de la morada si no se da
 * otra), la caja de combate y, detrás, la base con ese edificio (`fondo`). Lo que
 * cambia de una a otra lo da `de`: su escena, sus frases, su vista y a quién se
 * elige.
 */
export function anteUnEdificio<V extends VistaAnteUnEdificio>(
  fondo: FondoDeLaMorada<V>,
  de: Pick<
    DePie<V, EncuadreDeLaMorada>,
    'escena' | 'ayuda' | 'frases' | 'vista' | 'marca' | 'elegir'
  >,
  encuadre: typeof encuadrarLaMorada = encuadrarLaMorada,
): DePie<V, EncuadreDeLaMorada> {
  return {
    ...de,
    encuadrar: (lienzo, vista) =>
      encuadre(lienzo, disposicionDe(vista.faccion), vista.sitio, vista.figuras.length),
    caja: cajasDeLaMorada,
    pintar: (ctx, { lienzo, vista, encuadre, pie }) => {
      fondo(ctx, lienzo, encuadre.camara, vista, pie.ahora);
      pintarDePie(ctx, pie);
    },
  };
}

function deLaMorada(fondo: FondoDeLaMorada): DePie<VistaDeLaMorada, EncuadreDeLaMorada> {
  return anteUnEdificio(fondo, {
    escena: 'morada',
    ayuda: AYUDA_DE_LA_MORADA,
    frases: {
      elegida: 'su ficha y su reclutamiento están en el panel.',
      otra: 'pulsa para ver su ficha y reclutar.',
    },
    vista: (s) => s.vistaDeLaMorada(),
    // `canvas.dataset.morada`: `<edificio>:<unidad elegida>`.
    marca: (vista) => `${vista.edificio}:${vista.figuras[vista.elegida]?.id ?? ''}`,
    elegir: (s, vista, i) => s.elegirEnLaMorada(vista.figuras[i]!.id),
  });
}

export class EscenaMorada extends EscenaDePie<VistaDeLaMorada, EncuadreDeLaMorada> {
  constructor(sesion: () => Session, fondo: FondoDeLaMorada) {
    super(sesion, deLaMorada(fondo));
  }
}
