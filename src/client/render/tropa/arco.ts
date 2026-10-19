/**
 * Dónde se pone cada uno en la escena de la tropa y con qué cámara se mira.
 *
 * Es un escenario lateral como la base caminable: el paso es el de una batalla
 * en ese lienzo (`pasoDeLaBase` → `escalaDelCombate`) y el suelo va a 25°
 * (`COMPRESION_SUELO`), así que cada figura mide lo que mide en el combate. No
 * se recorre: la cámara está quieta, con el héroe en el medio del lienzo.
 *
 * El héroe va al fondo y en el centro, y su tropa en arco a los dos lados, con
 * los extremos más cerca de la cámara: un semicírculo que mira hacia ella. En el
 * orden del ejército de izquierda a derecha, con el héroe en medio: la primera
 * mitad a su izquierda.
 */
import { COMPRESION_SUELO, MARGEN_ABAJO } from '../../../shared/arte.js';
import type { Plano } from '../../../shared/base.js';
import { pasoDeLaBase, type Tablero } from '../proyeccion.js';

/** Lo que el héroe se mete hacia el fondo respecto a los extremos del arco, en pasos. */
export const HONDO_DEL_ARCO = 1.2;
/** La separación entre dos vecinos del arco, en pasos: nunca más ni menos. */
export const SEPARACION = { minima: 0.55, maxima: 1.0 } as const;
/**
 * Lo que se deja libre a los lados, en pasos: el ancho de una figura (0,40 de su
 * caja, `cajaDeFiguraEn`) y otro tanto de aire.
 */
const AIRE_A_LOS_LADOS = 0.8;

/**
 * Cuántos de los `tropa` van a la izquierda del héroe y cuántos a la derecha: la
 * primera mitad, redondeada hacia arriba, a la izquierda.
 */
export function ladosDelArco(tropa: number): {
  readonly izquierda: number;
  readonly derecha: number;
} {
  const izquierda = Math.ceil(tropa / 2);
  return { izquierda, derecha: tropa - izquierda };
}

/**
 * Dónde pisa cada uno, en pasos, con el héroe en (0, −`HONDO_DEL_ARCO`): `[0]` es
 * el héroe y `[1 + i]` el `i`-ésimo de su tropa. `vista` es el ancho del lienzo en
 * pasos, del que sale la separación (para que el arco entero quepa).
 */
export function colocarLaTropa(tropa: number, vista: number): Plano[] {
  const { izquierda, derecha } = ladosDelArco(tropa);
  const lado = Math.max(1, izquierda, derecha);
  const separacion = Math.max(
    SEPARACION.minima,
    Math.min(SEPARACION.maxima, (vista - AIRE_A_LOS_LADOS) / (2 * lado)),
  );
  const radio = lado * separacion;
  // Una parábola y no un arco de círculo: con el suelo a 25°, de lejos se lee
  // igual, y la profundidad de cada uno sale sin trigonometría.
  const en = (x: number): Plano => {
    const u = x / radio;
    return { x, y: -HONDO_DEL_ARCO * (1 - u * u) };
  };
  return [
    en(0),
    ...Array.from({ length: tropa }, (_, i) =>
      en(i < izquierda ? -(izquierda - i) * separacion : (i - izquierda + 1) * separacion),
    ),
  ];
}

/** La cámara de la escena: el paso del combate, el suelo a 25°, el héroe en el medio y lo de delante abajo. */
export function camaraDeLaTropa(lienzo: {
  readonly ancho: number;
  readonly alto: number;
}): Tablero {
  const paso = pasoDeLaBase(lienzo.ancho, lienzo.alto);
  return {
    paso,
    compresion: COMPRESION_SUELO,
    origenX: lienzo.ancho / 2,
    origenY: lienzo.alto - MARGEN_ABAJO * paso,
  };
}

/** El ancho del lienzo en pasos de la cámara de la escena: lo que se le pasa a `colocarLaTropa`. */
export function vistaEnPasos(lienzo: { readonly ancho: number; readonly alto: number }): number {
  return lienzo.ancho / pasoDeLaBase(lienzo.ancho, lienzo.alto);
}
