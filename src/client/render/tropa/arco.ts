/**
 * Dónde se pone cada uno en la escena de la tropa y con qué cámara se mira.
 *
 * Es un escenario lateral con el suelo a 25° (`COMPRESION_SUELO`) y **a la escala
 * del combate** como mucho (`pasoDeLaBase`, decisión del usuario del 20-10-2026):
 * las hojas no tienen resolución para más y, agrandadas para llenar la escena,
 * pixelaban. Solo se encoge si el arco no cabe (siete figuras en un móvil). Lo que
 * sobra de alto se reparte con el grupo en la parte de abajo y el horizonte del
 * campo detrás del héroe, así que el grupo pisa suelo y no flota bajo el cielo.
 *
 * El héroe va al fondo y en el centro, y su tropa en arco a los dos lados, con
 * los extremos delante: un semicírculo que mira hacia la cámara. En el orden del
 * ejército de izquierda a derecha, con el héroe en medio: la primera mitad a su
 * izquierda. Lo de más al fondo se pinta un poco más pequeño (`PERSPECTIVA`):
 * con la cámara tan cerca, es lo que dice que los extremos están delante y no
 * solo más abajo.
 */
import { COMPRESION_SUELO } from '../../../shared/arte.js';
import type { Plano } from '../../../shared/base.js';
import { type CajaDeFigura, cajaDeFiguraEn } from '../batalla.js';
import { pasoDeLaBase, type Tablero } from '../proyeccion.js';

/** Lo que el héroe se mete hacia el fondo respecto a los extremos del arco, en pasos. */
export const HONDO_DEL_ARCO = 1.5;
/**
 * Lo que encoge lo del fondo del arco: el héroe mide `1 − PERSPECTIVA` de lo que
 * mide un extremo, y lo de en medio, a proporción de su hondo.
 */
export const PERSPECTIVA = 0.16;
/**
 * La separación entre dos vecinos del lado largo del arco, en pasos: nunca más ni
 * menos. La caja de una figura mide 0,40 de ancho; con 0,43 queda un dedo entre
 * los dos extremos, que van delante y enteros, y entre los de dentro, más
 * pequeños, queda más.
 */
export const SEPARACION = { minima: 0.43, maxima: 0.75 } as const;
/**
 * Lo que sobra de alto con las figuras a la escala del combate, cuánto va debajo
 * de los pies de delante: el resto queda encima del héroe, en el fondo del campo.
 */
export const LIBRE_DEBAJO = 0.35;
/**
 * El aire del encuadre, en partes del lienzo: encima del héroe, debajo de los
 * pies de delante (y además su aro, `AL_PIE`) y a cada lado.
 */
const MARGEN = { arriba: 0.07, abajo: 0.04, lados: 0.04 } as const;
/** Lo que el aro y la sombra bajan de los pies, en partes del alto de la figura. */
const AL_PIE = 0.12;
/**
 * El horizonte del campo del fondo, desde la cabeza del héroe hacia abajo, en
 * partes de su alto: detrás de los hombros. Así el grupo pisa suelo de punta a
 * punta y lo de arriba es la linde del bosque del campo, no cielo.
 */
const HORIZONTE_EN_EL_HEROE = 0.3;

/** Una figura de pie a un paso de un píxel: de ella salen el alto y el ancho en pasos. */
const UNA = cajaDeFiguraEn(
  { paso: 1, origenX: 0, origenY: 0, compresion: COMPRESION_SUELO },
  { x: 0, y: 0 },
);

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

/** Lo que mide lo que pisa en `y` respecto a un extremo del arco (`y = 0`): 1 delante. */
export function escalaDelHondo(y: number): number {
  return 1 + (PERSPECTIVA * y) / HONDO_DEL_ARCO;
}

/**
 * Dónde pisa cada uno, en pasos, con el héroe en (0, −`HONDO_DEL_ARCO`): `[0]` es
 * el héroe y `[1 + i]` el `i`-ésimo de su tropa. Los dos lados llegan al mismo
 * radio (`separacion` por los del lado largo), así que con un número impar el
 * arco sigue siendo simétrico y sus dos extremos van delante del todo.
 */
export function colocarLaTropa(tropa: number, separacion: number): Plano[] {
  const { izquierda, derecha } = ladosDelArco(tropa);
  const radio = Math.max(1, izquierda, derecha) * separacion;
  // Una parábola y no un arco de círculo: con el suelo a 25°, de lejos se lee
  // igual, y la profundidad de cada uno sale sin trigonometría.
  const en = (x: number): Plano => {
    const u = x / radio;
    return { x, y: -HONDO_DEL_ARCO * (1 - u * u) };
  };
  return [
    en(0),
    ...Array.from({ length: tropa }, (_, i) =>
      i < izquierda
        ? en((-radio * (izquierda - i)) / izquierda)
        : en((radio * (i - izquierda + 1)) / derecha),
    ),
  ];
}

/**
 * La caja de una figura de la escena: la de `cajaDeFiguraEn` (los pies en su
 * sitio), encogida por lo honda que está (`escalaDelHondo`).
 */
export function cajaEnLaTropa(t: Tablero, en: Plano): CajaDeFigura {
  const c = cajaDeFiguraEn(t, en);
  const s = escalaDelHondo(en.y);
  return { ...c, alto: c.alto * s, ancho: c.ancho * s };
}

/** La escena entera: la cámara, dónde pisa cada uno y dónde cae el horizonte del campo. */
export interface EncuadreDeLaTropa {
  readonly camara: Tablero;
  /** `[0]` el héroe y `[1 + i]` el `i`-ésimo de su tropa, en pasos. */
  readonly en: readonly Plano[];
  /** La línea del horizonte del campo del fondo, en píxeles del lienzo. */
  readonly horizonte: number;
}

/** Del pie más bajo (más su aro) a lo que baja `y = 0`, en pasos: lo que el arco pide por debajo de los extremos. */
function bajoLosPies(en: readonly Plano[]): number {
  return Math.max(
    ...en.map((p) => p.y * COMPRESION_SUELO + AL_PIE * UNA.alto * escalaDelHondo(p.y)),
  );
}

/** Lo que pide cada lado del héroe en horizontal con `separacion`, en pasos: el radio y media caja. */
function mitadDelArco(tropa: number, separacion: number): number {
  const { izquierda, derecha } = ladosDelArco(tropa);
  const lado = Math.max(izquierda, derecha);
  // Los extremos van delante (escala 1); sin tropa, solo el héroe, al fondo.
  return lado === 0
    ? (UNA.ancho * escalaDelHondo(-HONDO_DEL_ARCO)) / 2
    : lado * separacion + UNA.ancho / 2;
}

/**
 * La tropa con que se mide el alto del encuadre: la que hay, o un extremo si no
 * hay nadie. Con el héroe solo medido por él, iba abajo del todo con media escena
 * de cielo encima; así va al fondo del suelo, donde va siempre.
 */
function delArco(tropa: number): number {
  return Math.max(1, tropa);
}

/** Lo libre a cada lado del héroe, en píxeles. */
function anchoLibre(lienzo: { readonly ancho: number }): number {
  return (lienzo.ancho * (1 - 2 * MARGEN.lados)) / 2;
}

/** Lo que el arco pide en vertical por paso: de la cabeza del héroe a lo de bajo los pies de delante. */
function altoDelArco(tropa: number): number {
  // No depende de la separación: el hondo va por `x / radio`. Y es el de un arco
  // con sus extremos aunque no los haya (`delArco`): el héroe solo se queda donde
  // estaría con su tropa.
  const en = colocarLaTropa(delArco(tropa), 1);
  const cabeza = Math.max(
    ...en.map((p) => -p.y * COMPRESION_SUELO + UNA.alto * escalaDelHondo(p.y)),
  );
  return cabeza + bajoLosPies(en);
}

/**
 * El paso más grande con que el arco de `tropa` cabe en el lienzo: por el alto
 * (el héroe arriba con su aire y los de delante abajo) y por el ancho, con la
 * separación cerrada hasta `SEPARACION.minima` antes de encoger a nadie.
 */
function pasoQueCabe(
  lienzo: { readonly ancho: number; readonly alto: number },
  tropa: number,
): number {
  const porElAlto = (lienzo.alto * (1 - MARGEN.arriba - MARGEN.abajo)) / altoDelArco(tropa);
  return Math.min(porElAlto, anchoLibre(lienzo) / mitadDelArco(tropa, SEPARACION.minima));
}

/**
 * La cámara de la escena para el héroe y `tropa` de los suyos en `lienzo`: el
 * héroe en el medio, el paso el del combate (`pasoDeLaBase`) o, si el arco no
 * cabe con él, el más grande con que cabe, y lo que sobra de alto repartido con
 * `LIBRE_DEBAJO` debajo de los pies. Con ese paso, la separación más abierta que quepa.
 */
export function encuadrarLaTropa(
  lienzo: { readonly ancho: number; readonly alto: number },
  tropa: number,
): EncuadreDeLaTropa {
  const paso = Math.min(pasoDeLaBase(lienzo.ancho, lienzo.alto), pasoQueCabe(lienzo, tropa));
  const libre = Math.max(
    0,
    lienzo.alto * (1 - MARGEN.arriba - MARGEN.abajo) - altoDelArco(tropa) * paso,
  );
  const { izquierda, derecha } = ladosDelArco(tropa);
  const lado = Math.max(1, izquierda, derecha);
  const separacion = Math.max(
    SEPARACION.minima,
    Math.min(SEPARACION.maxima, (anchoLibre(lienzo) / paso - UNA.ancho / 2) / lado),
  );
  const en = colocarLaTropa(tropa, separacion);
  const camara: Tablero = {
    paso,
    compresion: COMPRESION_SUELO,
    origenX: lienzo.ancho / 2,
    origenY:
      lienzo.alto * (1 - MARGEN.abajo) -
      libre * LIBRE_DEBAJO -
      bajoLosPies(colocarLaTropa(delArco(tropa), 1)) * paso,
  };
  const heroe = cajaEnLaTropa(camara, en[0]!);
  return { camara, en, horizonte: heroe.suelo - heroe.alto * (1 - HORIZONTE_EN_EL_HEROE) };
}
