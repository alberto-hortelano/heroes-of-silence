/**
 * La cámara de la base: el escenario lateral visto como el tablero de combate.
 *
 * El paso es el de una batalla en ese lienzo (`pasoDeLaBase`), así que un adulto
 * mide lo mismo en los dos; el suelo se aplasta a 25° (`COMPRESION_SUELO`), como
 * el arte, y no a los 35° a los que el combate sube la cámara cuando sobra alto:
 * con 35°, la raya de atrás de la franja quedaría medio paso por encima del
 * empedrado pintado (pregunta B de la vuelta 2). La vertical es fija, con el
 * suelo abajo; la horizontal sigue a quien camina, con tope en los bordes, como
 * `followCamera` de la rama `archivo/gpt-rpg`.
 *
 * Los puntos se pasan a pantalla y de vuelta con `enPantalla` y `planoDePixel`
 * de `proyeccion.ts`, los mismos del combate.
 */
import { COMPRESION_SUELO, MARGEN_ABAJO } from '../../../shared/arte.js';
import { type Disposicion, FONDO_DE_LA_FRANJA } from '../../../shared/base.js';
import { pasoDeLaBase, type Tablero } from '../proyeccion.js';

export interface Lienzo {
  readonly ancho: number;
  readonly alto: number;
}

/** Cuánto tarda la cámara en recorrer ~63 % de lo que le falta, en ms (`followCamera`). */
const SUAVIDAD_MS = 160;
/** Por debajo de esto, en pasos, la cámara se pega a su meta. */
const PEGADA = 0.01;

/** El tablero de la base con la cámara en `camaraX` (el paso del borde izquierdo de la vista). */
export function camaraDeLaBase(lienzo: Lienzo, camaraX: number): Tablero {
  const paso = pasoDeLaBase(lienzo.ancho, lienzo.alto);
  const compresion = COMPRESION_SUELO;
  return {
    paso,
    compresion,
    origenX: -camaraX * paso,
    origenY: lienzo.alto - (MARGEN_ABAJO + FONDO_DE_LA_FRANJA * compresion) * paso,
  };
}

/**
 * Dónde se queda la cámara con el foco en `focoX`: centrada en él, con tope en
 * `[0, ancho − vista]`; si el escenario cabe entero, centrado en el lienzo.
 */
export function camaraQuieta(d: Pick<Disposicion, 'ancho'>, lienzo: Lienzo, focoX: number): number {
  const vista = lienzo.ancho / pasoDeLaBase(lienzo.ancho, lienzo.alto);
  if (vista >= d.ancho) return (d.ancho - vista) / 2;
  return Math.max(0, Math.min(d.ancho - vista, focoX - vista / 2));
}

/** Un paso de la cámara hacia su meta en `dt` ms: se acerca suave y se pega al llegar. */
export function seguir(
  camaraX: number,
  focoX: number,
  d: Pick<Disposicion, 'ancho'>,
  lienzo: Lienzo,
  dt: number,
): number {
  const meta = camaraQuieta(d, lienzo, focoX);
  const siguiente = camaraX + (meta - camaraX) * (1 - Math.exp(-Math.max(0, dt) / SUAVIDAD_MS));
  return Math.abs(meta - siguiente) < PEGADA ? meta : siguiente;
}
