/**
 * La escena del ayuntamiento (22-10-2026, decisión del usuario D2): dentro de la
 * base, con la cámara acercada al ayuntamiento como a una morada, y delante, en el
 * empedrado, una figura por tipo de héroe de la facción, en fila y mirando a la
 * cámara. Pulsar uno lo elige (`elegirEnElAyuntamiento`) y el panel enseña su
 * ficha, su precio y el botón de contratarlo. Así se elige el héroe de salida al
 * empezar y se contrata uno después.
 *
 * Es la escena de la morada con otra vista (`anteUnEdificio`): la misma fila y el
 * mismo fondo (`EscenaBase.pintarLaMorada`), que con el ayuntamiento pinta su
 * exterior, sin versión abierta, y sin quien anduvo delante de los candidatos. La
 * cámara es otra (`encuadrarElAyuntamiento`): enseña el edificio entero.
 */
import type { VistaDelAyuntamiento } from '../ayuntamiento/vista.js';
import { type EncuadreDeLaMorada, encuadrarElAyuntamiento } from '../render/morada/fila.js';
import { AYUDA_DEL_AYUNTAMIENTO, type Session } from '../session.js';
import { type DePie, EscenaDePie } from './de-pie.js';
import { anteUnEdificio, type FondoDeLaMorada } from './morada.js';

/** Lo que va detrás de la fila: la base con la cámara del ayuntamiento. */
export type FondoDelAyuntamiento = FondoDeLaMorada<VistaDelAyuntamiento>;

function delAyuntamiento(
  fondo: FondoDelAyuntamiento,
): DePie<VistaDelAyuntamiento, EncuadreDeLaMorada> {
  return anteUnEdificio(
    fondo,
    {
      escena: 'ayuntamiento',
      ayuda: AYUDA_DEL_AYUNTAMIENTO,
      frases: {
        elegida: 'su ficha y su precio están en el panel.',
        otra: 'pulsa para ver su ficha y su precio.',
      },
      vista: (s) => s.vistaDelAyuntamiento(),
      // `canvas.dataset.ayuntamiento`: el tipo elegido.
      marca: (vista) => vista.figuras[vista.elegida]?.id ?? '',
      elegir: (s, vista, i) => s.elegirEnElAyuntamiento(vista.figuras[i]!.id),
    },
    // Un exterior, no una sala abierta: el edificio entero con los candidatos delante.
    encuadrarElAyuntamiento,
  );
}

export class EscenaAyuntamiento extends EscenaDePie<VistaDelAyuntamiento, EncuadreDeLaMorada> {
  constructor(sesion: () => Session, fondo: FondoDelAyuntamiento) {
    super(sesion, delAyuntamiento(fondo));
  }
}
