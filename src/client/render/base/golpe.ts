/**
 * Qué hay bajo un clic en la base: una persona, un edificio o el suelo.
 *
 * Se mira **de delante a atrás**, en el orden inverso al que se pinta
 * (`componerBase`): lo primero que se toca es lo que se ve encima. Una persona
 * delante de un edificio se lleva el clic. El edificio se toca por lo pintado
 * (la máscara de alfa de su recorte, puesta donde la pone `cajaDelEdificio`) y,
 * sin arte, por el bloque que lo marca. Quien camina no es un golpe: se pulsa a
 * través de él. La figura se toca como en una batalla (`dentroDeLaFigura`).
 */
import type { SitioId } from '@core/town/sitios.js';
import type { Disposicion, Plano } from '../../../shared/base.js';
import { cajaDeFiguraEn, dentroDeLaFigura } from '../batalla.js';
import { planoDePixel, type Tablero } from '../proyeccion.js';
import { type ArteDeLaBase, mascaraDe } from './arte.js';
import type { Elemento } from './escena.js';
import { cajaDelEdificio } from './recortes.js';

export type Golpe =
  | { readonly tipo: 'pnj'; readonly id: string }
  | { readonly tipo: 'sitio'; readonly sitio: SitioId }
  | { readonly tipo: 'suelo'; readonly en: Plano };

/** El alfa a partir del cual un píxel de un recorte cuenta como suyo. */
const ALFA_QUE_TOCA = 40;

function tocaElEdificio(
  t: Tablero,
  d: Pick<Disposicion, 'bajar' | 'fuera' | 'sitios'>,
  e: Extract<Elemento, { tipo: 'edificio' }>,
  arte: ArteDeLaBase | null,
  px: number,
  py: number,
): boolean {
  const { caja, pieza } = cajaDelEdificio(t, d, e, arte);
  if (px < caja.x || py < caja.y || px > caja.x + caja.ancho || py > caja.y + caja.alto) {
    return false;
  }
  const m = pieza === null ? null : mascaraDe(pieza);
  if (m === null) return true;
  const mx = Math.floor(((px - caja.x) / caja.ancho) * m.ancho);
  const my = Math.floor(((py - caja.y) / caja.alto) * m.alto);
  if (mx < 0 || my < 0 || mx >= m.ancho || my >= m.alto) return false;
  return (m.alfa[my * m.ancho + mx] as number) >= ALFA_QUE_TOCA;
}

export function queHayBajo(
  d: Pick<Disposicion, 'bajar' | 'fuera' | 'sitios'>,
  elementos: readonly Elemento[],
  arte: ArteDeLaBase | null,
  t: Tablero,
  px: number,
  py: number,
): Golpe {
  for (let i = elementos.length - 1; i >= 0; i--) {
    const e = elementos[i] as Elemento;
    if (e.tipo === 'figura') {
      if (e.pnj && dentroDeLaFigura(cajaDeFiguraEn(t, e.en), px, py)) {
        return { tipo: 'pnj', id: e.id };
      }
    } else if (tocaElEdificio(t, d, e, arte, px, py)) {
      return { tipo: 'sitio', sitio: e.sitio };
    }
  }
  return { tipo: 'suelo', en: planoDePixel(t, px, py) };
}
