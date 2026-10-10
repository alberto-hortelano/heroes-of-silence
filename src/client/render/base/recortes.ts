/**
 * Dónde cae en pantalla lo pintado del cuadro de la plaza: una placa, el recorte
 * de un edificio o, sin arte, el bloque que lo marca. Es la única cuenta que
 * leen el pintor y el golpe (`cajaDelEdificio`), para que lo que se pinta y lo
 * que se pulsa no puedan discrepar.
 *
 * No hay escala ni ancla que cuadrar (vuelta 3): un recorte sale del cuadro en
 * su sitio exacto, así que basta llevar su esquina con `planoDelCuadro` y
 * ampliarlo lo que el lienzo amplía un píxel del tramo, `paso / 128`.
 */
import type { SitioId } from '@core/town/sitios.js';
import {
  type Disposicion,
  planoDelCuadro,
  type SitioEnLaPlaza,
  TRAMO,
} from '../../../shared/base.js';
import { enPantalla, type Tablero } from '../proyeccion.js';
import type { ArteDeLaBase, MedidasDelRecorte, RecorteDeLaBase } from './arte.js';

/** El alto del bloque de un edificio sin arte, en pasos; de ancho, la banda de su región. */
export const BLOQUE = { alto: 2.4, margen: 0.12 } as const;

/** Algo del cuadro en pantalla: su caja y cuántos píxeles de pantalla vale uno del tramo. */
export interface EnPantalla {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
  readonly k: number;
}

/** Lo que se amplía un píxel del tramo en este lienzo. */
export const escalaDelCuadro = (t: Tablero): number => t.paso / TRAMO.pxPorPaso;

/** La placa de un tramo entera en pantalla. */
export function colocarLaPlaca(
  t: Tablero,
  d: Pick<Disposicion, 'bajar' | 'fuera'>,
  tramo: number,
): EnPantalla {
  const k = escalaDelCuadro(t);
  const p = enPantalla(t, planoDelCuadro(d, tramo, [0, 0]));
  return { x: p.x, y: p.y, ancho: TRAMO.ancho * k, alto: TRAMO.alto * k, k };
}

/** El recorte de un edificio en pantalla, en su sitio del cuadro. */
export function colocarEnElCuadro(
  t: Tablero,
  d: Pick<Disposicion, 'bajar' | 'fuera'>,
  r: MedidasDelRecorte,
): EnPantalla {
  const k = escalaDelCuadro(t);
  const p = enPantalla(t, planoDelCuadro(d, r.tramo, r.en));
  return { x: p.x, y: p.y, ancho: r.ancho * k, alto: r.alto * k, k };
}

/** El bloque de un edificio sin arte: la banda de su región, de su pie a `BLOQUE.alto` pasos. */
export function bloqueDelSitio(
  t: Tablero,
  d: Pick<Disposicion, 'bajar' | 'fuera'>,
  sitio: Pick<SitioEnLaPlaza, 'tramo' | 'region'>,
): EnPantalla {
  const { x0, x1, pie } = sitio.region;
  const a = enPantalla(t, planoDelCuadro(d, sitio.tramo, [x0, pie]));
  const b = enPantalla(t, planoDelCuadro(d, sitio.tramo, [x1, pie]));
  const margen = BLOQUE.margen * t.paso;
  const alto = BLOQUE.alto * t.paso;
  return { x: a.x + margen, y: a.y - alto, ancho: b.x - a.x - 2 * margen, alto, k: 1 };
}

/**
 * Dónde está en pantalla el edificio construido en `sitio`: su recorte si ha
 * llegado (`pieza`) y, si no, el bloque que lo marca (`pieza: null`).
 */
export function cajaDelEdificio(
  t: Tablero,
  d: Pick<Disposicion, 'bajar' | 'fuera' | 'sitios'>,
  e: { readonly sitio: SitioId; readonly edificio: string },
  arte: ArteDeLaBase | null,
): { caja: EnPantalla; pieza: RecorteDeLaBase | null } {
  const pieza = arte?.edificios.get(e.edificio) ?? null;
  return {
    caja: pieza === null ? bloqueDelSitio(t, d, d.sitios[e.sitio]) : colocarEnElCuadro(t, d, pieza),
    pieza,
  };
}

/**
 * Un punto de un sitio que se ve siempre pintado, con arte o sin él: el medio de
 * su puerta, medio paso por encima del umbral. Lo pulsan los tests y
 * `pnpm capturas`, sin escribir un píxel a mano.
 */
export function dondePulsarElSitio(
  t: Tablero,
  sitio: Pick<SitioEnLaPlaza, 'umbral'>,
): { x: number; y: number } {
  const p = enPantalla(t, sitio.umbral.en);
  return { x: p.x, y: p.y - 0.5 * t.paso };
}
