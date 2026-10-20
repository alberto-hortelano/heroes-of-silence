/**
 * El semicírculo de la escena de la tropa (C2): de 1 a 7 figuras —el héroe y hasta
 * seis de su tropa— se ven enteras y sin pisarse en los lienzos de la escena, el
 * héroe en el centro y al fondo, los extremos delante (más abajo y más grandes), y
 * nadie más grande que en una batalla (decisión del usuario del 20-10-2026: las
 * hojas no tienen resolución para más y pixelaban).
 */
import { describe, expect, it } from 'vitest';
import { cajaDeFiguraEn } from '../src/client/render/batalla.js';
import { pasoDeLaBase } from '../src/client/render/proyeccion.js';
import {
  cajaEnLaTropa,
  colocarLaTropa,
  encuadrarLaTropa,
  escalaDelHondo,
  HONDO_DEL_ARCO,
  ladosDelArco,
  SEPARACION,
} from '../src/client/render/tropa/arco.js';
import { CUPO_HEROE } from '../src/core/hero/troop.js';
import { COMPRESION_SUELO } from '../src/shared/arte.js';

/** El alto de una figura de pie en una batalla en ese lienzo. */
function altoEnLaBatalla(lienzo: { readonly ancho: number; readonly alto: number }): number {
  const paso = pasoDeLaBase(lienzo.ancho, lienzo.alto);
  return cajaDeFiguraEn(
    { paso, origenX: 0, origenY: 0, compresion: COMPRESION_SUELO },
    { x: 0, y: 0 },
  ).alto;
}

/**
 * Los lienzos de la escena, medidos con Playwright (19-10-2026): el marco de 20/11
 * a 1440×900, 1280×720 y 1024×768, y el del móvil a 375 de ancho; y el de 380 px
 * de alto que tenía el móvil antes, por si vuelve.
 */
const LIENZOS = [
  { ancho: 1080, alto: 588 },
  { ancho: 920, alto: 500 },
  { ancho: 664, alto: 359 },
  { ancho: 349, alto: 187 },
  { ancho: 349, alto: 370 },
] as const;

describe('el semicírculo de la tropa', () => {
  it('cabe el héroe con toda la tropa que puede llevar', () => {
    expect(CUPO_HEROE).toBeLessThanOrEqual(6);
  });

  for (const lienzo of LIENZOS) {
    for (let tropa = 0; tropa <= 6; tropa++) {
      it(`${tropa + 1} figuras en ${lienzo.ancho}×${lienzo.alto}: enteras, sin pisarse, el héroe en medio y al fondo, nadie mayor que en la batalla`, () => {
        const e = encuadrarLaTropa(lienzo, tropa);
        expect(e.en).toHaveLength(tropa + 1);
        const cajas = e.en.map((p) => cajaEnLaTropa(e.camara, p));
        for (const c of cajas) {
          expect(c.x - c.ancho / 2).toBeGreaterThanOrEqual(0);
          expect(c.x + c.ancho / 2).toBeLessThanOrEqual(lienzo.ancho);
          expect(c.suelo - c.alto).toBeGreaterThanOrEqual(0);
          expect(c.suelo).toBeLessThanOrEqual(lienzo.alto);
        }
        // Sin pisarse: de izquierda a derecha, cada caja empieza donde acaba la anterior.
        const porX = [...cajas].sort((a, b) => a.x - b.x);
        for (let i = 1; i < porX.length; i++) {
          expect(porX[i]!.x - porX[i]!.ancho / 2).toBeGreaterThan(
            porX[i - 1]!.x + porX[i - 1]!.ancho / 2,
          );
        }
        // El héroe, en el medio del lienzo y el más hondo: el que menos baja y el más pequeño.
        const heroe = cajas[0]!;
        expect(heroe.x).toBe(lienzo.ancho / 2);
        for (const c of cajas.slice(1)) {
          expect(c.suelo).toBeGreaterThan(heroe.suelo);
          expect(c.alto).toBeGreaterThan(heroe.alto);
        }
        // Nadie más grande que en una batalla en ese lienzo: los de delante, como allí.
        const tope = altoEnLaBatalla(lienzo);
        for (const c of cajas) expect(c.alto).toBeLessThanOrEqual(tope + 1e-9);
        // El horizonte del campo, detrás del héroe y no bajo sus pies (E3).
        expect(e.horizonte).toBeGreaterThan(heroe.suelo - heroe.alto);
        expect(e.horizonte).toBeLessThan(heroe.suelo);
      });
    }

    it(`en ${lienzo.ancho}×${lienzo.alto}, el paso es el del combate y con más figuras no crece`, () => {
      const pasos = Array.from({ length: 7 }, (_, t) => encuadrarLaTropa(lienzo, t).camara.paso);
      expect(pasos[0]).toBe(pasoDeLaBase(lienzo.ancho, lienzo.alto));
      for (let t = 1; t < 7; t++) expect(pasos[t]).toBeLessThanOrEqual(pasos[t - 1]!);
    });

    it(`en ${lienzo.ancho}×${lienzo.alto}, el héroe solo pisa donde pisa con su tropa`, () => {
      const solo = encuadrarLaTropa(lienzo, 0);
      const con = encuadrarLaTropa(lienzo, 4);
      expect(cajaEnLaTropa(solo.camara, solo.en[0]!).suelo).toBeCloseTo(
        cajaEnLaTropa(con.camara, con.en[0]!).suelo,
      );
    });
  }

  it('en el orden del ejército de izquierda a derecha, con el héroe en medio', () => {
    const en = colocarLaTropa(5, SEPARACION.minima);
    const { izquierda } = ladosDelArco(5);
    expect(izquierda).toBe(3);
    const xs = [...en.slice(1, 1 + izquierda), en[0]!, ...en.slice(1 + izquierda)].map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('con un lado más corto el arco sigue simétrico: los dos extremos delante y a la misma distancia', () => {
    for (const tropa of [3, 5]) {
      const en = colocarLaTropa(tropa, 0.5);
      const { izquierda } = ladosDelArco(tropa);
      const primero = en[1]!;
      const ultimo = en[tropa]!;
      expect(primero.y).toBeCloseTo(0);
      expect(ultimo.y).toBeCloseTo(0);
      expect(ultimo.x).toBeCloseTo(-primero.x);
      expect(en[1 + izquierda - 1]!.x).toBeLessThan(0);
    }
    expect(colocarLaTropa(0, 0.5)).toEqual([{ x: 0, y: -HONDO_DEL_ARCO }]);
  });

  it('lo del fondo se encoge a proporción de su hondo', () => {
    expect(escalaDelHondo(0)).toBe(1);
    expect(escalaDelHondo(-HONDO_DEL_ARCO)).toBeLessThan(1);
    expect(escalaDelHondo(-HONDO_DEL_ARCO / 2)).toBeCloseTo(
      (1 + escalaDelHondo(-HONDO_DEL_ARCO)) / 2,
    );
  });
});
