/**
 * Mientras la hoja de una figura no ha llegado, no se pinta nada (20-10-2026:
 * «quita unos círculos rojos con una letra que aparecen antes de cargar las
 * animaciones»). El marcador de color con su inicial queda para la figura que de
 * verdad no tiene arte: su imagen falló o no existe (`figuraEnCamino`).
 */
import { describe, expect, it } from 'vitest';
import {
  claveDelDibujo,
  colocarFigura,
  pintarFigura,
  pintarSombraDeFigura,
} from '../src/client/render/figura.js';

/** Un lienzo que lanza si alguien pinta en él. */
const lienzoQueNoSeToca = new Proxy({} as CanvasRenderingContext2D, {
  get(_, prop) {
    throw new Error(`se ha pintado en el lienzo (${String(prop)})`);
  },
});

describe('una figura cuya hoja aún no ha llegado', () => {
  // Sin la lista de hojas (`registrarLasHojas` no ha contestado), un cuerpo del
  // taller aún no se sabe qué arte lleva: es lo primero que se ve al abrir.
  const c = colocarFigura({
    id: 'h1',
    body: 'heroe-goblin-chaman',
    clip: 'idle',
    tiempo: 0,
    x: 100,
    suelo: 200,
    alto: 120,
    mira: 'S',
    color: '#c0392b',
    rotulo: 'G',
  });

  it('se coloca como cargando, sin fotograma', () => {
    expect(c.p).toBeNull();
    expect(c.cargando).toBe(true);
  });

  it('no pinta ni el marcador ni la sombra', () => {
    expect(() => pintarFigura(lienzoQueNoSeToca, c)).not.toThrow();
    expect(() => pintarSombraDeFigura(lienzoQueNoSeToca, c)).not.toThrow();
    expect(claveDelDibujo(c)).toMatch(/^cargando\|/);
  });

  it('sin arte de verdad (no carga), el marcador sí se pinta', () => {
    expect(() => pintarFigura(lienzoQueNoSeToca, { ...c, cargando: false })).toThrow(
      /se ha pintado/,
    );
  });
});
