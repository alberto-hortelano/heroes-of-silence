/**
 * El arte de la muralla del tablero de batalla (06-11-2026): el índice de cajas
 * que lee el lienzo (`assets/batalla/muralla/indice.json`) está derivado de sus
 * imágenes y se juzga al cargarse; las guías no van al build.
 *
 * Por qué mira esto: el lienzo pone cada pieza por su caja y cada cara por su
 * cuerpo (`render/arte-de-la-muralla.ts`). Una imagen repintada sin rederivar
 * el índice se pintaría corrida o cortada sin que nada fallara, y un índice
 * tocado a mano, a medias.
 */
import { describe, expect, it } from 'vitest';
import indice from '../assets/batalla/muralla/indice.json' with { type: 'json' };
import {
  leerIndiceDeLaMuralla,
  PIEZAS_DE_LA_MURALLA,
  TODAS_LAS_PIEZAS_DE_LA_MURALLA,
} from '../src/shared/muralla-de-batalla.js';
import { seCopiaAlBuild } from '../tools/build/publico.js';
import { medirLaMuralla } from '../tools/taller/muralla-de-batalla.js';

describe('el arte de la muralla de batalla', () => {
  it('el índice es el que sale de medir las imágenes en disco', async () => {
    expect(await medirLaMuralla()).toEqual(indice);
  });

  it('el índice se lee, y cada cara lleva su cuerpo', () => {
    const leido = leerIndiceDeLaMuralla(indice);
    for (const p of Object.values(PIEZAS_DE_LA_MURALLA)) {
      const cara = leido[p.cara];
      if (cara !== undefined) expect(cara.cuerpo).toBeGreaterThan(cara.caja[1]);
    }
  });

  it('un índice tocado a mano se rechaza diciendo qué pieza', () => {
    expect(() =>
      leerIndiceDeLaMuralla({ almena: { ancho: 1, alto: 1, caja: [0, 0, 1, 1] } }),
    ).toThrow(/«almena» no es ninguna pieza/);
    expect(() =>
      leerIndiceDeLaMuralla({ escalera: { ancho: 10, alto: 10, caja: [0, 0, 20, 5] } }),
    ).toThrow(/«escalera» tiene una caja que no cabe/);
    expect(() =>
      leerIndiceDeLaMuralla({ 'cara-piedra': { ancho: 10, alto: 10, caja: [0, 0, 10, 10] } }),
    ).toThrow(/«cara-piedra» lleva cuerpo y no es una cara, o al revés/);
  });

  it('las piezas van al build y sus guías no', () => {
    for (const p of TODAS_LAS_PIEZAS_DE_LA_MURALLA)
      expect(seCopiaAlBuild(`batalla/muralla/${p}.webp`)).toBe(true);
    expect(seCopiaAlBuild('batalla/muralla/indice.json')).toBe(true);
    expect(seCopiaAlBuild('batalla/muralla/_guias/cara-piedra.png')).toBe(false);
  });
});
