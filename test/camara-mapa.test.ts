/**
 * La cámara del mapa: que el clic caiga en la casilla que se ve, a cualquier
 * zoom, y que la vista no se salga del mapa.
 */
import { describe, expect, it } from 'vitest';
import {
  acotar,
  arrastrar,
  type CamaraMapa,
  casillaAPixel,
  centrarEn,
  type Encuadre,
  pixelACasilla,
  TILE_MAX,
  TILE_MIN,
  zoom,
} from '../src/client/render/camara-mapa.js';

const E: Encuadre = { ancho: 1000, alto: 700, mapaAncho: 24, mapaAlto: 24 };

describe('la cámara del mapa', () => {
  for (const tile of [TILE_MIN, 70, TILE_MAX]) {
    it(`casilla → píxel → casilla vuelve a la misma a ${tile} px`, () => {
      const c: CamaraMapa = { tile, x: 3.37, y: -0.25 };
      for (let y = 0; y < 10; y++) {
        for (let x = 3; x < 13; x++) {
          const p = casillaAPixel(c, { x, y });
          expect(pixelACasilla(c, p.x, p.y)).toEqual({ x, y });
          // Y cerca de los bordes de la casilla, sin salirse.
          expect(pixelACasilla(c, p.x - tile * 0.49, p.y + tile * 0.49)).toEqual({ x, y });
        }
      }
    });
  }

  it('no deja ver más de media casilla fuera del mapa por ningún lado', () => {
    const lejos = acotar({ tile: 70, x: 500, y: -500 }, E);
    expect(lejos.x).toBeCloseTo(24 - E.ancho / 70 + 0.5);
    expect(lejos.y).toBe(-0.5);
    const atras = arrastrar(lejos, 100_000, -100_000, E);
    expect(atras.x).toBe(-0.5);
    expect(atras.y).toBeCloseTo(24 - E.alto / 70 + 0.5);
  });

  it('un mapa que cabe entero se centra en vez de pegarse a una esquina', () => {
    const c = acotar({ tile: TILE_MIN, x: 0, y: 0 }, { ...E, mapaAncho: 8, mapaAlto: 8 });
    const izquierda = casillaAPixel(c, { x: 0, y: 0 }).x - TILE_MIN / 2;
    const derecha = casillaAPixel(c, { x: 7, y: 0 }).x + TILE_MIN / 2;
    expect(izquierda).toBeCloseTo(E.ancho - derecha);
  });

  it('centrar en un héroe lo pone en el centro del lienzo, si el borde lo deja', () => {
    const c = centrarEn({ tile: 70, x: 0, y: 0 }, { x: 12, y: 12 }, E);
    const p = casillaAPixel(c, { x: 12, y: 12 });
    expect(p.x).toBeCloseTo(E.ancho / 2);
    expect(p.y).toBeCloseTo(E.alto / 2);
    // En la esquina, el borde manda: el héroe queda dentro, aunque no centrado.
    const esquina = centrarEn(c, { x: 0, y: 0 }, E);
    expect(esquina.x).toBe(-0.5);
  });

  it('el zoom no mueve lo que hay bajo el puntero, y se para en sus topes', () => {
    const c = centrarEn({ tile: 70, x: 0, y: 0 }, { x: 12, y: 12 }, E);
    const ancla = { x: 420, y: 310 };
    const antes = { x: ancla.x / c.tile + c.x, y: ancla.y / c.tile + c.y };
    const cerca = zoom(c, 1, E, ancla);
    expect(cerca.tile).toBe(70 + 12);
    expect(ancla.x / cerca.tile + cerca.x).toBeCloseTo(antes.x);
    expect(ancla.y / cerca.tile + cerca.y).toBeCloseTo(antes.y);
    let tope = c;
    for (let i = 0; i < 20; i++) tope = zoom(tope, 1, E);
    expect(tope.tile).toBe(TILE_MAX);
    for (let i = 0; i < 20; i++) tope = zoom(tope, -1, E);
    expect(tope.tile).toBe(TILE_MIN);
  });
});
