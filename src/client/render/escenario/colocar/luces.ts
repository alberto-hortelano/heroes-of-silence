/**
 * La luz y el aire de la escena (`Escena.luces`): el fuego de las ciudades, en el
 * medio de su recinto, y el de los pueblos, las brasas de la lava y los jirones de
 * niebla del agua y de la ciénaga.
 */
import type { Analisis } from '../analizar.js';
import type { Rect } from '../recinto/octogono.js';
import type { Luz } from './escena.js';

/** El fuego de una ciudad: su radio y su clase (`luces`). */
const LUZ_DE_LA_CIUDAD = { r: 1.6, clase: 'fuego' } as const;

/** Dónde va el fuego de una ciudad: el medio de su recinto, un poco al norte. */
export function luzDelRecinto(r: Rect): { readonly x: number; readonly y: number } {
  return { x: (r.i0 + r.i1 + 1) / 2, y: (r.j0 + r.j1 + 1) / 2 - 0.2 };
}

/**
 * Dónde hay luz y dónde niebla. Las ciudades y pueblos llevan su resplandor; la
 * lava, una brasa de cada tantas casillas; el agua y lo más bajo, jirones de
 * niebla. Todo con su propio azar, así que no mueve nada de lo colocado.
 */
export function luces(
  a: Analisis,
  nivel: ArrayLike<number>,
  azar: () => number,
  recintos: ReadonlyMap<string, Rect>,
): Luz[] {
  const fuera: Luz[] = [];
  for (const o of a.objetos) {
    // La de una ciudad, en el medio de su recinto, donde están sus casas (la
    // ciudad-puente también: desde la fase 2 está en el medio de su recinto).
    const r = recintos.get(o.id);
    if (o.kind === 'town' && r !== undefined)
      fuera.push({ ...LUZ_DE_LA_CIUDAD, ...luzDelRecinto(r) });
    if (o.kind === 'village')
      fuera.push({ x: o.at.x + 0.5, y: o.at.y + 0.4, r: 1.1, clase: 'fuego' });
  }
  for (let i = 0; i < a.W * a.H; i++) {
    const x = i % a.W;
    const y = (i - x) / a.W;
    const suelo = a.suelo[i];
    const agua = a.franjaDe[i] !== -1 && a.franjas[a.franjaDe[i] as number]?.barrera === 'water';
    // Brasa solo en lava rodeada de lava: en la linde quemaba la nieve de al lado.
    const enLava =
      suelo === 'lava' &&
      [-1, 0, 1].every((dy) =>
        [-1, 0, 1].every((dx) => (a.suelo[i + dy * a.W + dx] ?? 'lava') === 'lava'),
      );
    if (enLava && azar() < 0.15)
      fuera.push({ x: x + azar(), y: y + azar(), r: 0.5 + azar() * 0.6, clase: 'brasa' });
    if ((agua || ((nivel[i] as number) <= 0 && suelo === 'swamp')) && azar() < 0.18)
      fuera.push({ x: x + azar(), y: y + azar(), r: 1.2 + azar() * 1.4, clase: 'niebla' });
  }
  return fuera;
}
