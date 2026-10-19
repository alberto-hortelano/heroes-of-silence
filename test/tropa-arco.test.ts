/**
 * El semicírculo de la escena de la tropa (C2): de 1 a 7 figuras —el héroe y
 * hasta seis de su tropa— se ven enteras y sin pisarse en los lienzos de la
 * escena en el escritorio (1440×900 y 1280×720: el marco de la base, 20/11) y en
 * el móvil (380 px de alto, el ancho de la pantalla), con el héroe en el centro y
 * al fondo, y a la escala de una batalla.
 */
import { describe, expect, it } from 'vitest';
import { cajaDeFiguraEn } from '../src/client/render/batalla.js';
import { pasoDeLaBase } from '../src/client/render/proyeccion.js';
import {
  camaraDeLaTropa,
  colocarLaTropa,
  ladosDelArco,
  vistaEnPasos,
} from '../src/client/render/tropa/arco.js';
import { CUPO_HEROE } from '../src/core/hero/troop.js';

/**
 * Los lienzos de la escena: 1440×900 y 1280×720 en el marco de 20/11, y el del
 * móvil; a 375 de ancho la página lo da de 349×370 (medido con Playwright,
 * 19-10-2026), y 359×380 por si el borde adelgaza.
 */
const LIENZOS = [
  { ancho: 1080, alto: 594 },
  { ancho: 960, alto: 528 },
  { ancho: 359, alto: 380 },
  { ancho: 349, alto: 370 },
] as const;

describe('el semicírculo de la tropa', () => {
  it('cabe el héroe con toda la tropa que puede llevar', () => {
    expect(CUPO_HEROE).toBeLessThanOrEqual(6);
  });

  for (const lienzo of LIENZOS) {
    for (let tropa = 0; tropa <= 6; tropa++) {
      it(`${tropa + 1} figuras en ${lienzo.ancho}×${lienzo.alto}: enteras, sin pisarse, el héroe en medio y al fondo`, () => {
        const t = camaraDeLaTropa(lienzo);
        expect(t.paso).toBe(pasoDeLaBase(lienzo.ancho, lienzo.alto));
        const en = colocarLaTropa(tropa, vistaEnPasos(lienzo));
        expect(en).toHaveLength(tropa + 1);
        const cajas = en.map((p) => cajaDeFiguraEn(t, p));
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
        // El héroe, en el medio del lienzo y el más hondo (el que menos baja).
        expect(cajas[0]!.x).toBe(lienzo.ancho / 2);
        for (const c of cajas.slice(1)) expect(c.suelo).toBeGreaterThan(cajas[0]!.suelo);
      });
    }
  }

  it('en el orden del ejército de izquierda a derecha, con el héroe en medio', () => {
    const en = colocarLaTropa(5, 12);
    const { izquierda } = ladosDelArco(5);
    expect(izquierda).toBe(3);
    const xs = [...en.slice(1, 1 + izquierda), en[0]!, ...en.slice(1 + izquierda)].map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // Los dos extremos del lado largo, delante del todo.
    expect(en[1]!.y).toBeCloseTo(0);
  });
});
