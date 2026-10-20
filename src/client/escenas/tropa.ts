/**
 * La escena de la tropa: el héroe elegido y los suyos en semicírculo, mirando a
 * la cámara. Pulsar a uno lo elige (`elegirEnLaTropa`) y el panel enseña su ficha
 * y su equipo. Es una escena de pie (`escenas/de-pie.ts`) con el arco de
 * `render/tropa/arco.ts`.
 */
import { type EncuadreDeLaTropa, encuadrarLaTropa } from '../render/tropa/arco.js';
import { cajasDeLaTropa, pintarLaTropa } from '../render/tropa/pintar.js';
import { AYUDA_DE_LA_TROPA, type Session } from '../session.js';
import type { VistaDeLaTropa } from '../tropa/vista.js';
import { type DePie, EscenaDePie } from './de-pie.js';

const DE_LA_TROPA: DePie<VistaDeLaTropa, EncuadreDeLaTropa> = {
  escena: 'tropa',
  ayuda: AYUDA_DE_LA_TROPA,
  frases: { elegida: 'su ficha está en el panel.', otra: 'pulsa para ver su ficha.' },
  vista: (s) => s.vistaDeLaTropa(),
  // El héroe va aparte del arco: `encuadrarLaTropa` cuenta su tropa.
  encuadrar: (lienzo, vista) => encuadrarLaTropa(lienzo, vista.figuras.length - 1),
  caja: cajasDeLaTropa,
  // `canvas.dataset.tropa`: el id de la figura elegida.
  marca: (vista) => vista.figuras[vista.elegida]?.id ?? '',
  elegir: (s, vista, i) => s.elegirEnLaTropa(vista.figuras[i]!.quien),
  pintar: (ctx, { lienzo, encuadre, pie }) =>
    pintarLaTropa(ctx, { ...pie, lienzo, horizonte: encuadre.horizonte }),
};

export class EscenaTropa extends EscenaDePie<VistaDeLaTropa, EncuadreDeLaTropa> {
  constructor(sesion: () => Session) {
    super(sesion, DE_LA_TROPA);
  }
}
