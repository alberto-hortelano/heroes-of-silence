/**
 * Con qué cámara se mira una morada y dónde se pone cada unidad que produce.
 *
 * La morada no saca de la base (vuelta 2, 20-10-2026, decisión del usuario: «queda
 * una sala en el vacío; que se muestre integrada en la base»): la cámara es la de
 * la base (`camaraDeLaBase`), acercada hasta que las figuras miden lo de su hoja
 * (`pasoDeLaHoja`; nunca se aleja: si la base ya va a la hoja, no se acerca) y
 * centrada en el edificio, con el tope de la base; la vertical es la de siempre,
 * con la franja abajo, así que lo alto de un edificio alto se corta y la sala, que
 * va abajo, se ve.
 *
 * Una figura por unidad (de una a cuatro), de pie y en fila justo delante de la
 * puerta, en el empedrado (`filaDeLosReclutas`): sin perspectiva entre ellas, con
 * la separación más abierta que quepa entre `SEPARACION.minima` y
 * `SEPARACION.maxima`, centrada en la puerta y corrida lo que haga falta para que se
 * vea entera. Quien anduvo espera delante de la fila (`dondeEsperaEnLaMorada`): su
 * cabeza queda por debajo de los pies de los reclutas.
 */
import type { SitioId } from '@core/town/sitios.js';
import { COMPRESION_SUELO, MARGEN_ABAJO } from '../../../shared/arte.js';
import {
  alaFranja,
  type Disposicion,
  FONDO_DE_LA_FRANJA,
  type Plano,
  planoDelCuadro,
} from '../../../shared/base.js';
import { camaraDeLaBase, camaraQuieta } from '../base/camara.js';
import { type LienzoDePie, MARGEN, pasoDeLaHoja, SEPARACION_MINIMA, UNA } from '../de-pie.js';
import { pasoDeLaBase, type Tablero } from '../proyeccion.js';

/**
 * La separación entre dos vecinas de la fila, en pasos: con más de 1,2 la fila ya
 * no se lee como un grupo.
 */
export const SEPARACION = { minima: SEPARACION_MINIMA, maxima: 1.2 } as const;

/**
 * Lo que la fila de los reclutas se mete por delante de la puerta de su morada, en
 * pasos: justo delante de la casa abierta (decisión del usuario del 20-10-2026:
 * «que los reclutas queden justo delante de la morada abierta»).
 */
export const DELANTE_DE_LA_PUERTA = 0.7;
/**
 * Dónde espera quien anduvo hasta la morada, en pasos de hondo: delante de la
 * fila, en el borde de delante de la franja (su aro cae en `MARGEN_ABAJO`), y no
 * en la puerta (decisión del usuario del 20-10-2026: «que se quede delante, más
 * lejos de lo que van a aparecer los reclutas»). Con la fila a ~0,85, lo que media a 25° (~1,1 pasos en pantalla) es más que lo que mide una
 * figura con su aro (0,95 + 0,11): su cabeza no tapa el aro de la elegida (QA M2 de
 * la vuelta 2: a 0,3, el casco lo tapaba con una sola unidad).
 */
export const DONDE_ESPERA = FONDO_DE_LA_FRANJA;

/** La hondura de la fila de los reclutas de la morada de `sitio`: delante de su puerta. */
export function filaDeLosReclutas(d: Disposicion, sitio: SitioId): number {
  const p = d.sitios[sitio].puerta;
  return alaFranja(d, { x: p.x, y: p.y + DELANTE_DE_LA_PUERTA }).y;
}

/** Adónde va quien camina para entrar en la morada de `sitio`: delante de su puerta y de la fila. */
export function dondeEsperaEnLaMorada(d: Disposicion, sitio: SitioId): Plano {
  return alaFranja(d, { x: d.sitios[sitio].puerta.x, y: DONDE_ESPERA });
}

/**
 * Lo que tiene que verse de la casa abierta por encima del pie de su puerta, en
 * altos de figura: la sala, hasta su techo (la puerta mide 1,15). En una ventana
 * baja, la cámara se acerca menos para que se vea (QA I1 de la vuelta 2: a 700×900,
 * a la escala de la hoja, solo se veían el empedrado y el pie del hogar); la fila
 * de los reclutas, que va delante, cabe con ella.
 */
export const ALTO_DE_LA_SALA = 2.2;

/**
 * El aire de la fila a cada lado de la vista, en pasos, desde el centro de la de
 * la punta: media figura más su media caja.
 */
const AIRE = UNA.ancho;

export interface EncuadreDeLaMorada {
  /** La cámara de la base acercada a la morada. */
  readonly camara: Tablero;
  /** El paso del borde izquierdo de la vista (`camaraDeLaBase`). */
  readonly camaraX: number;
  /** Dónde pisa cada figura, en pasos del escenario de la base, de izquierda a derecha. */
  readonly en: readonly Plano[];
}

/**
 * El paso más grande con que caben `n` en fila con la separación mínima y el aire,
 * y con la sala de la casa abierta a la vista (la vertical es la de la base: el pie
 * de la puerta va a `puerta` de hondo, y encima, `ALTO_DE_LA_SALA`).
 */
function pasoQueCabe(l: LienzoDePie, n: number, puerta: number): number {
  const ancho = (n - 1) * SEPARACION.minima + 2 * AIRE;
  const debajo = MARGEN_ABAJO + (FONDO_DE_LA_FRANJA - puerta) * COMPRESION_SUELO;
  return Math.min(
    l.ancho / ancho,
    (l.alto * (1 - MARGEN.arriba)) / (debajo + ALTO_DE_LA_SALA * UNA.alto),
  );
}

/**
 * La cámara de la morada de `sitio` de la base `d` para `n` figuras en `lienzo`.
 * Lanza con `n < 1`: una morada que no produce nada no existe (`moradasBlocker`),
 * y encuadrar a nadie es un bug.
 */
export function encuadrarLaMorada(
  lienzo: LienzoDePie,
  d: Disposicion,
  sitio: SitioId,
  n: number,
): EncuadreDeLaMorada {
  if (n < 1) throw new Error(`no se puede encuadrar una morada con ${n} unidades`);
  const fila = filaDeLosReclutas(d, sitio);
  const paso = Math.min(
    Math.max(pasoDeLaBase(lienzo.alto), pasoDeLaHoja(lienzo.densidad)),
    pasoQueCabe(lienzo, n, d.sitios[sitio].puerta.y),
  );
  const s = d.sitios[sitio];
  const foco = planoDelCuadro(d, s.tramo, [(s.region.x0 + s.region.x1) / 2, s.region.pie]).x;
  const camaraX = camaraQuieta(d, lienzo, foco, paso);
  const vista = lienzo.ancho / paso;
  const separacion =
    n === 1
      ? 0
      : Math.max(SEPARACION.minima, Math.min(SEPARACION.maxima, (vista - 2 * AIRE) / (n - 1)));
  // Centrada en la puerta y corrida para caber: en el tope de la base (el
  // monasterio, en x ≈ 3) la puerta queda cerca del borde de la vista.
  const centro = alaFranja(d, s.puerta).x;
  const medio = ((n - 1) * separacion) / 2;
  const desde = camaraX + AIRE + medio;
  const hasta = camaraX + vista - AIRE - medio;
  const x = Math.max(desde, Math.min(hasta, centro));
  const en = Array.from({ length: n }, (_, i) => ({
    x: x - medio + i * separacion,
    y: fila,
  }));
  return { camara: camaraDeLaBase(lienzo, camaraX, paso, lienzo.densidad), camaraX, en };
}
