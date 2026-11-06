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
  pintarSombraDeFigura,
} from '../src/client/render/figura.js';
import { cajaDeLaCelda, pintarLoTapadoDeLaFigura } from '../src/client/render/figura-tapada.js';

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
 * sin figura («me asaltaron unos bandidos y no tenían arte», 06-11-2026), y
 * repintado encima al trasluz, sobre la nieve y de noche, en una mancha rojiza:
 * el mapa pinta lo tapado en silueta (`pintarLoTapadoDeLosAsaltantes`), con la
 * máscara de lo que lo tapa menos lo que va delante. Lo que se compone se mira
 * en el navegador; aquí, que sin arte no se toca nada y que con arte la máscara
 * se pinta en el sitio de la celda y lo de delante se resta.
 */
describe('lo tapado de una figura', () => {
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
  const colores = { contorno: '#fff', borde: '#000', relleno: '#f0f' };
  const identidad = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  it('sin arte (cargando o marcador) no pinta nada ni pide la máscara', () => {
    const c = colocarFigura(figura);
    expect(c.p).toBeNull();
    const tapa = vi.fn();
    for (const sinArte of [c, { ...c, cargando: false }]) {
      expect(cajaDeLaCelda(sinArte, identidad)).toBeNull();
      pintarLoTapadoDeLaFigura(lienzoQueNoSeToca, sinArte, identidad, colores, tapa, null);
    }
    expect(tapa).not.toHaveBeenCalled();
  });

  it('con arte, la máscara va en el sitio de la celda, lo de delante se resta y sale una copia', () => {
    const pasos: string[] = [];
    /** Un lienzo de mentira que apunta lo que importa: transformaciones, modos y copias. */
    const lienzo = (nombre: string) => {
      const c = {
        canvas: { width: 512, height: 512, nombre },
        globalAlpha: 1,
        fillStyle: '',
        set globalCompositeOperation(m: string) {
          if (m !== 'source-over') pasos.push(`${nombre} ${m}`);
        },
        setTransform: (...t: number[]) => pasos.push(`${nombre} setTransform ${t.join(',')}`),
        drawImage: (img: { nombre?: string }, ...a: number[]) =>
          pasos.push(`${nombre} drawImage ${img.nombre ?? '?'} ${a.slice(-4).join(',')}`),
        clearRect: () => {},
        fillRect: () => {},
        save: () => {},
        restore: () => {},
      };
      return c;
    };
    let n = 0;
    vi.stubGlobal('document', {
      createElement: () => {
        const nombre = `paso${n++}`;
        return {
          width: 512,
          height: 512,
          getContext: () => lienzo(nombre),
        };
      },
    });
    try {
      const c: FiguraColocada = {
        f: figura,
        cargando: false,
        p: {
          arte: { propio: true } as never,
          celda: { image: { nombre: 'atlas' }, x: 0, y: 0, size: 384 } as never,
          imagen: '/unidades/zombi/d0/atlas-tapado.webp',
          lado: 60,
          dx: -30,
          dy: -53,
        },
      };
      // A densidad 2: la celda va de (70, 147) a (130, 207) en la pantalla, y de
      // (140, 294) a (260, 414) en el lienzo.
      const enPantalla = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
      expect(cajaDeLaCelda(c, enPantalla)).toEqual([140, 294, 260, 414]);
      const vistos: string[] = [];
      pintarLoTapadoDeLaFigura(
        lienzo('pantalla') as unknown as CanvasRenderingContext2D,
        c,
        enPantalla,
        colores,
        (_, poner) => {
          vistos.push('tapa');
          poner({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        },
        (_, poner) => {
          vistos.push('delante');
          poner(enPantalla);
        },
      );
      expect(vistos).toEqual(['tapa', 'delante']);
      // El margen del contorno: 1,68 + 1,2 px, y 2 más, redondeado hacia arriba.
      const [bx, by] = [140 - 5, 294 - 5];
      // La máscara es el lienzo de paso en que se resta lo de delante.
      const resta = pasos.find((p) => p.endsWith(' destination-out'));
      const mascara = pasos.filter((p) => p.startsWith(`${resta?.split(' ')[0]} `));
      // Lo que tapa, en el lienzo de la pantalla corrido a la esquina de la caja;
      // lo de delante, con la transformación de las figuras, después y restado.
      const enLaCaja = (t: string) => mascara.indexOf(`${resta?.split(' ')[0]} setTransform ${t}`);
      expect(enLaCaja(`1,0,0,1,${-bx},${-by}`)).toBeGreaterThanOrEqual(0);
      expect(enLaCaja(`2,0,0,2,${-bx},${-by}`)).toBeGreaterThan(mascara.indexOf(resta!));
      expect(mascara.indexOf(resta!)).toBeGreaterThan(enLaCaja(`1,0,0,1,${-bx},${-by}`));
      // Y a la pantalla, una sola copia en píxeles del lienzo, en su caja.
      const aLaPantalla = pasos.filter((p) => p.startsWith('pantalla drawImage'));
      expect(aLaPantalla).toHaveLength(1);
      expect(aLaPantalla[0]).toMatch(new RegExp(`^pantalla drawImage paso\\d ${bx},${by},`));

      // Guardada: la segunda vez, con la misma clave, solo la copia a la pantalla;
      // con otra (otro zoom, otro sitio respecto a lo que la tapa), se compone otra vez.
      const tapa = vi.fn();
      const otraVez = (clave: string, origen: readonly [number, number]) => {
        pasos.length = 0;
        pintarLoTapadoDeLaFigura(
          lienzo('pantalla') as unknown as CanvasRenderingContext2D,
          c,
          enPantalla,
          colores,
          tapa,
          null,
          { id: 'raider-0', clave, origen },
        );
        return pasos.filter((p) => p.includes('drawImage')).map((p) => p.split(' ')[0]);
      };
      expect(otraVez('70|1,2', [10, 20])).not.toEqual(['pantalla']);
      expect(tapa).toHaveBeenCalledTimes(1);
      expect(otraVez('70|1,2', [10, 20])).toEqual(['pantalla']);
      expect(tapa).toHaveBeenCalledTimes(1);
      expect(otraVez('70|1,2', [11, 20])).not.toEqual(['pantalla']);
      expect(otraVez('110|1,2', [11, 20])).not.toEqual(['pantalla']);
      expect(tapa).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
