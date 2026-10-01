/**
 * El tablero a 25°: que el píxel que se pulsa sea el hex que se ve.
 *
 * La proyección aplasta el eje vertical, y la inversa tiene que deshacerlo
 * exactamente: un hex que no vuelve sobre sí mismo es un clic que mueve la unidad
 * al hex de al lado. Se prueba a cuatro tamaños de lienzo porque el paso y la
 * elevación salen del tamaño, y un error de escala solo se ve cuando cambian.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPRESION_MAXIMA,
  centroDeStack,
  centroHex,
  cercaDelCentro,
  hexEnPixel,
  planoDeHex,
  tableroPara,
  verticesHex,
} from '../src/client/render/proyeccion.js';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../src/core/battle/board.js';
import { COMPRESION_SUELO } from '../src/shared/arte.js';

const TAMANOS = [
  [1280, 720],
  [760, 420],
  // El lienzo de escritorio a 1440×900, donde sobra alto y la cámara se levanta
  // hasta su tope, y el del móvil, donde el alto manda y el suelo sigue a 25°.
  [1086, 778],
  [860, 380],
] as const;

describe('el tablero proyectado', () => {
  for (const [ancho, alto] of TAMANOS) {
    it(`los 99 hexes hacen ida y vuelta en ${ancho}×${alto}`, () => {
      const t = tableroPara(ancho, alto);
      for (let row = 0; row < BOARD_HEIGHT; row++) {
        for (let col = 0; col < BOARD_WIDTH; col++) {
          const c = centroHex(t, { col, row });
          expect(hexEnPixel(t, c.x, c.y)).toEqual({ col, row });
          // Y cerca del borde, sin salirse: un 80 % del camino hacia cada vértice.
          for (const v of verticesHex(t, { col, row })) {
            const px = c.x + (v.x - c.x) * 0.8;
            const py = c.y + (v.y - c.y) * 0.8;
            expect(hexEnPixel(t, px, py)).toEqual({ col, row });
          }
        }
      }
    });

    it(`fuera del tablero no hay hex en ${ancho}×${alto}`, () => {
      const t = tableroPara(ancho, alto);
      expect(hexEnPixel(t, -1000, -1000)).toBeNull();
      // Justo a la izquierda del primer hex: el más cercano es (0,0), pero el
      // punto no cae dentro, y eso es lo que el test de Voronoi solo no ve.
      const c = centroHex(t, { col: 0, row: 0 });
      expect(hexEnPixel(t, c.x - t.paso * 0.6, c.y)).toBeNull();
      // Y encima de la primera fila, donde están las cabezas de las figuras.
      expect(hexEnPixel(t, c.x, c.y - t.paso)).toBeNull();
    });

    it(`el tablero cabe en el lienzo en ${ancho}×${alto}`, () => {
      const t = tableroPara(ancho, alto);
      for (const h of [
        { col: 0, row: 0 },
        { col: BOARD_WIDTH - 1, row: BOARD_HEIGHT - 1 },
        { col: BOARD_WIDTH - 1, row: 1 },
      ]) {
        for (const v of verticesHex(t, h)) {
          expect(v.x).toBeGreaterThanOrEqual(0);
          expect(v.x).toBeLessThanOrEqual(ancho);
          expect(v.y).toBeGreaterThanOrEqual(0);
          expect(v.y).toBeLessThanOrEqual(alto);
        }
      }
    });
  }

  it('si sobra alto la cámara se levanta, sin pasar de su tope; si no, el suelo sigue a 25°', () => {
    // Escritorio: antes el tablero ocupaba la franja de abajo y dejaba cielo.
    expect(tableroPara(1086, 778).compresion).toBeCloseTo(COMPRESION_MAXIMA, 10);
    // 1280×720 está entre los dos: ni el tope ni los 25°.
    const medio = tableroPara(1280, 720).compresion;
    expect(medio).toBeGreaterThan(COMPRESION_SUELO);
    expect(medio).toBeLessThan(COMPRESION_MAXIMA);
    // Móvil: el alto manda, y levantar la cámara no cabría.
    expect(tableroPara(860, 380).compresion).toBe(COMPRESION_SUELO);
    // Un lienzo absurdamente alto no pone el suelo de canto.
    expect(tableroPara(1086, 5000).compresion).toBe(COMPRESION_MAXIMA);
  });

  it('en escritorio las filas ocupan un 40 % más de alto que a 25° con el mismo paso', () => {
    const t = tableroPara(1086, 778);
    const a25 = { ...t, compresion: COMPRESION_SUELO };
    const filas = (x: typeof t) =>
      centroHex(x, { col: 0, row: BOARD_HEIGHT - 1 }).y - centroHex(x, { col: 0, row: 0 }).y;
    expect(filas(t) / filas(a25)).toBeGreaterThan(1.35);
  });

  it('el centro de un hex es suyo para el clic, y su borde no', () => {
    const t = tableroPara(1086, 778);
    const h = { col: 5, row: 4 };
    const c = centroHex(t, h);
    expect(cercaDelCentro(t, h, c.x, c.y)).toBe(true);
    for (const v of verticesHex(t, h)) {
      expect(cercaDelCentro(t, h, c.x + (v.x - c.x) * 0.8, c.y + (v.y - c.y) * 0.8)).toBe(false);
      expect(cercaDelCentro(t, h, c.x + (v.x - c.x) * 0.4, c.y + (v.y - c.y) * 0.4)).toBe(true);
    }
  });

  it('el centro de una unidad es su hex, o el punto medio de los dos si es grande', () => {
    const h = { col: 3, row: 4 };
    expect(centroDeStack([h])).toEqual(planoDeHex(h));
    const d = { col: 4, row: 4 };
    expect(centroDeStack([h, d])).toEqual({
      x: (planoDeHex(h).x + planoDeHex(d).x) / 2,
      y: planoDeHex(h).y,
    });
  });
});
