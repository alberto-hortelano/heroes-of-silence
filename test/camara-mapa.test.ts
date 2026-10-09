/**
 * La cámara del mapa: que el clic caiga en la casilla que se ve, a cualquier
 * zoom, que la vista no se salga del mapa y que no se aleje más de lo que se
 * puede pintar.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  acotar,
  arrastrar,
  type CamaraMapa,
  casillaAPixel,
  centrarEn,
  contarVolumenes,
  type Encuadre,
  MAX_VOLUMENES_VISIBLES,
  pixelACasilla,
  TILE_LEGIBLE,
  TILE_MAX,
  tileMinimo,
  volumenesALoSumo,
  volumenesEn,
  zoom,
} from '../src/client/render/camara-mapa.js';
import { escenarioDe, topeDeAlejar } from '../src/client/render/escenario/superficie.js';
import { ajustarLienzo, densidadConPresupuesto, pixelesDe } from '../src/client/render/lienzo.js';
import {
  PIXELES_AL_ACERCAR,
  PIXELES_DEL_MAPA,
  presupuestoConHolgura,
  presupuestoDelMapa,
} from '../src/client/render/mapa.js';
import { newGame } from '../src/core/state/setup.js';

const E: Encuadre = { ancho: 1000, alto: 700, mapaAncho: 24, mapaAlto: 24 };

describe('la cámara del mapa', () => {
  for (const tile of [TILE_LEGIBLE, 70, TILE_MAX]) {
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
    const c = acotar({ tile: TILE_LEGIBLE, x: 0, y: 0 }, { ...E, mapaAncho: 8, mapaAlto: 8 });
    const izquierda = casillaAPixel(c, { x: 0, y: 0 }).x - TILE_LEGIBLE / 2;
    const derecha = casillaAPixel(c, { x: 7, y: 0 }).x + TILE_LEGIBLE / 2;
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
    expect(tope.tile).toBe(TILE_LEGIBLE);
  });
});

describe('el tope de alejar sale de los volúmenes que caben', () => {
  /** `n` volúmenes en cada casilla de un mapa de `lado`×`lado`. */
  const uniforme = (lado: number, n: number) =>
    contarVolumenes(
      lado,
      lado,
      Array.from({ length: lado * lado * n }, (_, i) => {
        const k = Math.floor(i / n);
        return { x: (k % lado) + 0.5, y: Math.floor(k / lado) + 0.9 };
      }),
    );

  it('la suma prefija cuenta lo de cada ventana, y una base fuera del mapa cuenta en su borde', () => {
    const c = contarVolumenes(4, 3, [
      { x: 0.5, y: 0.5 },
      { x: 3.9, y: 2.9 },
      { x: 3.2, y: 2.1 },
      { x: -1, y: 7 },
    ]);
    expect(volumenesEn(c, 0, 0, 4, 3)).toBe(4);
    expect(volumenesEn(c, 3, 2, 4, 3)).toBe(2);
    expect(volumenesEn(c, 0, 2, 1, 3)).toBe(1);
    expect(volumenesEn(c, 1, 0, 3, 2)).toBe(0);
    expect(volumenesEn(c, -10, -10, 99, 99)).toBe(4);
  });

  it('sin volúmenes, el tope es el de legibilidad', () => {
    expect(tileMinimo(contarVolumenes(34, 34, []), 1280, 800)).toEqual({
      tile: TILE_LEGIBLE,
      exceso: 0,
    });
  });

  it('con más densidad, el tope sube; y a ese tope la ventana más densa cabe', () => {
    const ralo = uniforme(60, 1);
    const denso = uniforme(60, 4);
    const tRalo = tileMinimo(ralo, 1280, 800).tile;
    const tDenso = tileMinimo(denso, 1280, 800).tile;
    expect(tDenso).toBeGreaterThan(tRalo);
    expect(volumenesALoSumo(denso, tDenso, 1280, 800)).toBeLessThanOrEqual(MAX_VOLUMENES_VISIBLES);
    // Y es el menor: un píxel menos ya no cabe.
    expect(volumenesALoSumo(denso, tDenso - 1, 1280, 800)).toBeGreaterThan(MAX_VOLUMENES_VISIBLES);
  });

  it('con un lienzo mayor, el tope sube: cuántos caben depende de la pantalla', () => {
    const c = uniforme(80, 3);
    expect(tileMinimo(c, 1920, 1080).tile).toBeGreaterThan(tileMinimo(c, 1280, 800).tile);
  });

  it('nunca pasa de TILE_MAX, por denso que sea, y entonces dice cuántos sobran (H4)', () => {
    const c = uniforme(40, 400);
    const { tile, exceso } = tileMinimo(c, 1920, 1080);
    expect(tile).toBe(TILE_MAX);
    expect(exceso).toBe(volumenesALoSumo(c, TILE_MAX, 1920, 1080) - MAX_VOLUMENES_VISIBLES);
    expect(exceso).toBeGreaterThan(0);
  });

  it('cuando sí cabe, el exceso es 0', () => {
    const c = uniforme(80, 3);
    for (const [w, h] of [
      [1280, 800],
      [1920, 1080],
    ] as const) {
      const { tile, exceso } = tileMinimo(c, w, h);
      expect(exceso).toBe(0);
      expect(volumenesALoSumo(c, tile, w, h)).toBeLessThanOrEqual(MAX_VOLUMENES_VISIBLES);
    }
  });

  it('en 7680×4320 el mapa real no cabe: se avisa en consola, una vez por escena y lienzo', () => {
    // En 48×48 y no en el lado de siempre: el de 34 anda cerca del tope y
    // cruza la raya cada vez que cambia lo que despeja el pasillo de la senda
    // (historia.md, «Caminos»). Lo que se mira es el aviso, no los caminos.
    // La 3 y no la 4242 desde #195: con las minas por región, la 4242 se quedó
    // en 1 532 volúmenes a 110 px y cabe; la 3 llevaba 3 507, lejos de la raya.
    // La 1 desde #210: con menos mesetas y la senda sin cortar el agua, la 3
    // cabe a 108 px. La 2 desde #216: sin los picos que tapaban las paredes, la
    // 1 cabe a 108; la 2 lleva 3 366 a 110 px.
    const esc = escenarioDe(newGame({ seed: 2, width: 48, height: 48 }).map, 2);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(topeDeAlejar(esc, 7680, 4320)).toBe(TILE_MAX);
      expect(topeDeAlejar(esc, 7680, 4320)).toBe(TILE_MAX);
      expect(aviso).toHaveBeenCalledTimes(1);
      const cuantos = String(aviso.mock.calls[0]?.[0]).match(/7680×4320.*hasta (\d+)/)?.[1];
      expect(Number(cuantos)).toBeGreaterThan(MAX_VOLUMENES_VISIBLES);
      // En una pantalla normal, ni un aviso.
      topeDeAlejar(esc, 1920, 1080);
      expect(aviso).toHaveBeenCalledTimes(1);
    } finally {
      aviso.mockRestore();
    }
  });

  it('la cámara no se aleja más allá del tope que se le da', () => {
    const e: Encuadre = { ...E, tileMinimo: 62 };
    let c = centrarEn({ tile: 70, x: 0, y: 0 }, { x: 12, y: 12 }, e);
    for (let i = 0; i < 20; i++) c = zoom(c, -1, e);
    expect(c.tile).toBe(62);
    expect(acotar({ tile: 10, x: 0, y: 0 }, e).tile).toBe(62);
  });

  it('en un mapa de verdad, al tope no se pintan más de 2 000 volúmenes mire donde mire', () => {
    // La 80, la de más volúmenes de las del taller: la 1 se quedó en 968 con
    // los claros de las cordilleras (#218), y la premisa dejaba de cumplirse.
    const map = newGame({ seed: 80 }).map;
    const { conteo, separada } = escenarioDe(map, 80);
    const t = tileMinimo(conteo, 1280, 800).tile;
    expect(t).toBeGreaterThanOrEqual(TILE_LEGIBLE);
    // La premisa: el mapa entero no cabría en un fotograma de un solo golpe.
    expect(separada.volumenes.length).toBeGreaterThan(MAX_VOLUMENES_VISIBLES / 2);
    expect(volumenesALoSumo(conteo, t, 1280, 800)).toBeLessThanOrEqual(MAX_VOLUMENES_VISIBLES);
  });
});

describe('el mapa no pinta más píxeles que su presupuesto (H1 de la vuelta 1 de QA)', () => {
  it('el lienzo de una ventana de 1920×1080 cabe entero: no cambia nada', () => {
    expect(densidadConPresupuesto(1, 1560, 957, PIXELES_DEL_MAPA)).toBe(1);
    expect(densidadConPresupuesto(2, 390, 520, PIXELES_DEL_MAPA)).toBe(2);
  });

  it('en una pantalla mayor la densidad baja hasta llenar el presupuesto, y no más', () => {
    for (const [dpr, w, h] of [
      [1, 3480, 2036],
      [1, 2200, 1316],
      [2, 1080, 768],
      [1, 7320, 4196],
    ] as const) {
      const d = densidadConPresupuesto(dpr, w, h, PIXELES_DEL_MAPA);
      expect(d).toBeLessThan(dpr);
      const pixeles = Math.floor(w * d) * Math.floor(h * d);
      expect(pixeles).toBeLessThanOrEqual(PIXELES_DEL_MAPA);
      expect(pixeles).toBeGreaterThan(PIXELES_DEL_MAPA * 0.99);
    }
  });

  it('un presupuesto que no son píxeles se rechaza diciéndolo', () => {
    expect(() => densidadConPresupuesto(1, 100, 100, 0)).toThrow(/presupuesto/);
    expect(() => densidadConPresupuesto(1, 100, 100, Number.NaN)).toThrow(/presupuesto/);
  });

  it('`preparar` con presupuesto encoge el lienzo y escala el contexto; sin él, vuelve a la pantalla', () => {
    const transformaciones: number[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getBoundingClientRect: () => ({ width: 3480, height: 2036 }),
      getContext: () => ({ setTransform: (a: number) => transformaciones.push(a) }),
    };
    const globales = globalThis as Record<string, unknown>;
    const antes = { window: globales.window, ResizeObserver: globales.ResizeObserver };
    globales.window = { devicePixelRatio: 1, addEventListener: () => undefined };
    globales.ResizeObserver = class {
      observe(): void {}
    };
    try {
      const lienzo = ajustarLienzo(canvas as unknown as HTMLCanvasElement, () => undefined);
      expect([canvas.width, canvas.height]).toEqual([3480, 2036]);
      // El presupuesto se pide con la caja y la densidad de ahora, no con las del fotograma anterior.
      const pedidos: [number, number, number][] = [];
      const medida = lienzo.preparar((caja, dpr) => {
        pedidos.push([caja.width, caja.height, dpr]);
        return PIXELES_DEL_MAPA;
      });
      expect(pedidos).toEqual([[3480, 2036, 1]]);
      // Quien pinta sigue en píxeles CSS: la caja no cambia, cambia el lienzo.
      expect(medida).toEqual({ width: 3480, height: 2036 });
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(PIXELES_DEL_MAPA);
      expect(transformaciones.at(-1)).toBeCloseTo(canvas.width / 3480, 3);
      lienzo.preparar();
      expect([canvas.width, canvas.height]).toEqual([3480, 2036]);
      expect(transformaciones.at(-1)).toBe(1);
    } finally {
      globales.window = antes.window;
      globales.ResizeObserver = antes.ResizeObserver;
    }
  });
});

describe('el presupuesto de píxeles depende del zoom: al acercar, densidad plena', () => {
  const plenos = pixelesDe;
  const USUARIO = plenos(1623, 930, 1.09);
  const QHD = plenos(2200, 1317, 1);
  const CUATRO_K = plenos(3480, 2037, 1);

  it('al tope de alejar se queda el presupuesto de siempre en cuanto el lienzo lo pasa', () => {
    for (const [p, tope] of [
      [USUARIO, 52],
      [QHD, 46],
      [QHD, 63],
      [CUATRO_K, 80],
    ] as const)
      expect(presupuestoDelMapa(tope, tope, p)).toBe(PIXELES_DEL_MAPA);
    // Un lienzo que ya cabe no cambia: con o sin presupuesto, la misma densidad.
    expect(presupuestoDelMapa(46, 46, plenos(1560, 957, 1))).toBeUndefined();
  });

  it('en el zoom máximo, densidad plena en la pantalla del usuario y en 2560×1440 (semillas 1 y 7)', () => {
    for (const seed of [1, 7]) {
      const esc = escenarioDe(newGame({ seed }).map, seed);
      for (const [w, h, dpr] of [
        [1623, 930, 1.09],
        [2200, 1317, 1],
      ] as const) {
        const tope = topeDeAlejar(esc, w, h);
        expect(presupuestoDelMapa(TILE_MAX, tope, plenos(w, h, dpr)), `${seed} ${w}×${h}`).toBe(
          undefined,
        );
      }
    }
    // Y con los topes que se midieron en 2560×1440.
    expect(presupuestoDelMapa(TILE_MAX, 46, QHD)).toBeUndefined();
    expect(presupuestoDelMapa(TILE_MAX, 63, QHD)).toBeUndefined();
  });

  it('en 3840×2160 el presupuesto se queda también en el zoom máximo (decisión del usuario)', () => {
    expect(CUATRO_K).toBeGreaterThan(PIXELES_AL_ACERCAR);
    expect(presupuestoDelMapa(TILE_MAX, 80, CUATRO_K)).toBe(PIXELES_DEL_MAPA);
  });

  it('es monótono: acercando no se vuelve nunca al presupuesto', () => {
    for (const p of [USUARIO, QHD, CUATRO_K, plenos(1560, 957, 1)])
      for (const tope of [40, 46, 63, 80]) {
        let plena = false;
        for (let tile = tope; tile <= TILE_MAX; tile++) {
          const r = presupuestoDelMapa(tile, tope, p);
          if (plena) expect(r, `${p} ${tope} ${tile}`).toBeUndefined();
          plena = r === undefined;
        }
      }
  });

  it('con holgura: la rueda que va y viene en el umbral no cambia de densidad a cada paso', () => {
    // 2560×1440 con el tope de la semilla 7: entra a plena entre 87 y 99.
    expect(presupuestoDelMapa(87, 63, QHD)).toBe(PIXELES_DEL_MAPA);
    expect(presupuestoDelMapa(99, 63, QHD)).toBeUndefined();
    const presupuesto = presupuestoConHolgura();
    const pasos = [75, 87, 99, 87, 99, 87, 75, 87, 99].map((tile) => presupuesto(tile, 63, QHD));
    expect(pasos).toEqual([
      PIXELES_DEL_MAPA,
      PIXELES_DEL_MAPA,
      undefined,
      // Un paso atrás sigue a plena…
      undefined,
      undefined,
      undefined,
      // …y dos ya no.
      PIXELES_DEL_MAPA,
      PIXELES_DEL_MAPA,
      undefined,
    ]);
    // Al tope de alejar, la holgura no deja la pantalla del usuario a plena.
    expect(presupuestoDelMapa(52, 52, USUARIO, true)).toBe(PIXELES_DEL_MAPA);
  });

  it('una casilla que no mide nada se rechaza diciéndolo', () => {
    expect(() => presupuestoDelMapa(0, 46, QHD)).toThrow(/casillas/);
    expect(() => presupuestoDelMapa(110, Number.NaN, QHD)).toThrow(/casillas/);
  });
});
