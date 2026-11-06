/**
 * Mientras la hoja de una figura no ha llegado, no se pinta nada (20-10-2026:
 * «quita unos círculos rojos con una letra que aparecen antes de cargar las
 * animaciones»). El marcador de color con su inicial queda para la figura que de
 * verdad no tiene arte: su imagen falló o no existe (`figuraEnCamino`).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  claveDelDibujo,
  colocarFigura,
  type FiguraColocada,
  pintarFigura,
  pintarFiguraAlTrasluz,
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

/**
 * Un grupo de asaltantes detrás de un pico quedaba en su estandarte y su chapa,
 * sin figura («me asaltaron unos bandidos y no tenían arte», 06-11-2026): el mapa
 * lo vuelve a pintar al trasluz encima de lo que tiene altura
 * (`pintarAsaltantesAlTrasluz`). Al trasluz va solo el arte, a su alfa.
 */
describe('una figura al trasluz', () => {
  const figura = {
    id: 'raider-0',
    body: 'zombi',
    clip: 'idle',
    tiempo: 0,
    x: 100,
    suelo: 200,
    alto: 60,
    mira: 'S',
    color: '#8a8a8a',
    rotulo: '6',
  } as const;

  it('sin arte (cargando o marcador) no pinta nada', () => {
    const c = colocarFigura(figura);
    expect(c.p).toBeNull();
    expect(() => pintarFiguraAlTrasluz(lienzoQueNoSeToca, c, 0.45)).not.toThrow();
    expect(() =>
      pintarFiguraAlTrasluz(lienzoQueNoSeToca, { ...c, cargando: false }, 0.45),
    ).not.toThrow();
  });

  it('con arte, la celda a ese alfa, sin sombra ni marcador', () => {
    const pasos: string[] = [];
    const lienzo = {
      canvas: {},
      drawImage: () => pasos.push('drawImage'),
      set globalAlpha(a: number) {
        pasos.push(`alfa ${a}`);
      },
      save: () => pasos.push('save'),
      restore: () => pasos.push('restore'),
      getTransform: () => ({ a: 1, b: 0 }),
    };
    vi.stubGlobal('document', {
      createElement: () => ({ getContext: () => ({ ...lienzo, canvas: {} }) }),
    });
    try {
      const c: FiguraColocada = {
        f: figura,
        cargando: false,
        p: {
          arte: { propio: true } as never,
          celda: { image: {}, x: 0, y: 0, size: 384 } as never,
          imagen: '/unidades/zombi/d0/atlas-trasluz.webp',
          lado: 60,
          dx: -30,
          dy: -53,
        },
      };
      pintarFiguraAlTrasluz(lienzo as unknown as CanvasRenderingContext2D, c, 0.45);
      // La celda se copia al lienzo de paso (la caché) y de él a la pantalla, a 0,45.
      expect(pasos).toEqual(['drawImage', 'save', 'alfa 0.45', 'drawImage', 'restore']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
