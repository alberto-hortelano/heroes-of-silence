/**
 * La tirada de muralla de norte a sur (§29, `tirada.ts`): un muro que se aleja
 * de la cámara se lee como un solo muro, sin el testero de una pieza a media
 * tirada. «Los muros perpendiculares están mal, están como partidos por el
 * medio» (el usuario, 21-10-2026): en el recinto de cada ciudad, sus caras del
 * este y del oeste iban en dos piezas en la misma columna y la de atrás
 * enseñaba su testero a media cara (s16, town-0); en la muralla del mapa, una
 * pieza por paso (s41 (20, 25-27)).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  type CatalogoEnBruto,
  catalogoValidado,
  esTramoNorteSur,
} from '../src/client/render/escenario/catalogo.js';
import { type Sprite, testerosDeLaEscena } from '../src/client/render/escenario/colocar.js';
import { ALTO_DEL_TRAMO_NORTE_SUR } from '../src/client/render/escenario/muralla.js';
import { claveDe } from '../src/client/render/escenario/pintar.js';
import { ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO } from '../src/client/render/escenario/recinto.js';
import {
  FONDO_DEL_ADARVE,
  pasoEnCasillas,
  type SpriteDeTirada,
  testerosAMediaTirada,
  tiradaNorteSur,
} from '../src/client/render/escenario/tirada.js';
import {
  guiaDelMuroNorteSur,
  juntasDelMuro,
  LARGO_DEL_ADARVE,
  TORCIDO_MAXIMO,
} from '../tools/taller/muros.js';
import { catalogoDelDisco, escenaDe } from './helpers.js';

const RAIZ = join(import.meta.dirname, '..');

const catalogo = catalogoDelDisco();
const NS1 = catalogo.piezas['muro-ns-1'];
if (NS1?.tirada === undefined) throw new Error('falta muro-ns-1 en el catálogo, con su tirada');
const M = { nh: NS1.nh, tirada: NS1.tirada };
const pasoDe = (src: string) => catalogo.piezas[src.replace(/\.webp$/, '')]?.tirada;

/** Un tramo `muro-ns-1` puesto como sprite, para el guardia. */
const tramo = (x: number, y: number, alto: number): SpriteDeTirada => ({
  src: 'muro-ns-1.webp',
  x,
  y,
  alto,
  nw: NS1.nw,
  nh: NS1.nh,
  clave: y,
});

describe('tiradaNorteSur', () => {
  it('de un trecho que mide su adarve, la pieza de siempre: el pie en el sur y en su x', () => {
    const alto = ALTO_DEL_TRAMO_NORTE_SUR;
    expect(tiradaNorteSur(M, alto, 4.5, 10 - alto * FONDO_DEL_ADARVE, 10)).toEqual([
      { x: 4.5, y: 10 },
    ]);
  });

  it('la cara del recinto (1,23), en dos piezas a un paso, centradas en la cara', () => {
    const alto = ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO;
    const [px, py] = pasoEnCasillas(M, alto);
    const ps = tiradaNorteSur(M, alto, 9, 6.887, 8.113, 0.155);
    expect(ps).toHaveLength(2);
    const [delante, atras] = ps as [{ x: number; y: number }, { x: number; y: number }];
    expect(delante.y).toBe(8.113);
    expect(atras.y - delante.y).toBeCloseTo(py, 12);
    expect(atras.x - delante.x).toBeCloseTo(px, 12);
    // Centrada de lado en la cara, y el adarve de la de atrás llega a la torre del norte.
    expect((atras.x + delante.x) / 2).toBeCloseTo(9, 12);
    expect(atras.y - alto * FONDO_DEL_ADARVE).toBeLessThanOrEqual(6.887 + 2 * 0.155);
  });

  it('una tirada de tres pasos del mapa llega de punta a punta, salvo la holgura, a un paso', () => {
    const alto = ALTO_DEL_TRAMO_NORTE_SUR;
    const fondo = alto * FONDO_DEL_ADARVE;
    const norte = 25.25 - fondo;
    const ps = tiradaNorteSur(M, alto, 20.5, norte, 27.25, 0.125);
    expect(ps[0]?.y).toBe(27.25);
    expect((ps.at(-1)?.y ?? 0) - fondo).toBeLessThanOrEqual(norte + 0.25 + 1e-9);
    // Una menos no llegaría.
    expect((ps.at(-2)?.y ?? 0) - fondo).toBeGreaterThan(norte + 0.25);
  });

  it('lanza con un trecho al revés o un paso que no sube', () => {
    expect(() => tiradaNorteSur(M, 1.6, 0, 5, 5)).toThrow(/de norte a sur/);
    expect(() => tiradaNorteSur({ nh: 100, tirada: [10, 0] }, 1.6, 0, 4, 6)).toThrow(
      /hacia arriba/,
    );
  });
});

describe('testerosAMediaTirada', () => {
  it('muerde con la de atrás más allá de su paso y bajo el adarve de la de delante', () => {
    // La cara del oeste de s16, town-0: la de atrás corrida un paso y una
    // décima, con su pie aún bajo el adarve de la de delante; su corte asoma.
    const alto = ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO;
    const [, py] = pasoEnCasillas(M, alto);
    expect(-py * 1.1).toBeLessThan(alto * FONDO_DEL_ADARVE);
    const antes = [tramo(9, 8.113 + py * 1.1, alto), tramo(9, 8.113, alto)];
    expect(testerosAMediaTirada(antes, [], pasoDe)).toHaveLength(1);
    // A su paso, no.
    expect(
      testerosAMediaTirada([tramo(9, 8.113 + py, alto), tramo(9, 8.113, alto)], [], pasoDe),
    ).toEqual([]);
  });

  it('muerde con la muralla del mapa de antes: una pieza por paso, sin nada en la junta', () => {
    const antes = [tramo(20.5, 25.25, 1.6), tramo(20.5, 26.25, 1.6), tramo(20.5, 27.25, 1.6)];
    expect(testerosAMediaTirada(antes, [], pasoDe)).toHaveLength(2);
  });

  it('no dice nada de una tirada (`tiradaNorteSur`) ni del testero de delante', () => {
    for (const [alto, norte, sur, holgura] of [
      [ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO, 6.887, 8.113, 0.155],
      [ALTO_DEL_TRAMO_NORTE_SUR, 25.25 - 1.6 * FONDO_DEL_ADARVE, 27.25, 0.125],
    ] as const) {
      const ps = tiradaNorteSur(M, alto, 9, norte, sur, holgura).map((p) => tramo(p.x, p.y, alto));
      expect(ps.length).toBeGreaterThan(1);
      expect(testerosAMediaTirada(ps, [], pasoDe)).toEqual([]);
    }
  });

  it('la junta que tapa una torre que se pinta después no cuenta; una que no la cubre, sí', () => {
    const antes = [tramo(20.5, 25.25, 1.6), tramo(20.5, 26.25, 1.6)];
    const torre = (y: number, alto: number): SpriteDeTirada => ({
      src: 'modulos/muro/torre-redonda.webp',
      x: 20.5,
      y,
      alto,
      nw: 210,
      nh: 379,
      clave: y,
    });
    expect(testerosAMediaTirada(antes, [torre(25.75, 1.4)], pasoDe)).toEqual([]);
    // Baja: su cima no llega a la del testero.
    expect(testerosAMediaTirada(antes, [torre(25.75, 0.4)], pasoDe)).toHaveLength(1);
  });
});

describe('el paso de la tirada en el catálogo', () => {
  const bruto = (piezas: CatalogoEnBruto['piezas']): CatalogoEnBruto => ({ hojas: {}, piezas });
  const sinTirada = { src: NS1.src, nw: NS1.nw, nh: NS1.nh, ax: NS1.ax, ay: NS1.ay };

  it('todo tramo de norte a sur lo lleva, y nada más', () => {
    for (const [id, p] of Object.entries(catalogo.piezas))
      expect(p.tirada !== undefined, id).toBe(esTramoNorteSur(id));
  });

  it('sin él, o con uno que no sube, el catálogo lanza diciendo cómo derivarlo', () => {
    expect(() => catalogoValidado(bruto({ 'muro-ns-1': sinTirada }))).toThrow(/derivar-muros/);
    expect(() =>
      catalogoValidado(bruto({ 'muro-ns-1': { ...sinTirada, tirada: [79, 381] } })),
    ).toThrow(/hacia arriba/);
    expect(() =>
      catalogoValidado(bruto({ 'nodo-puerta-hondo': { ...sinTirada, tirada: [79, -381] } })),
    ).toThrow(/no es un tramo de norte a sur/);
  });
});

describe('en la escena', () => {
  it('la muralla del mapa de s41 lleva su tirada de norte a sur, sin testeros a media tirada', () => {
    // s41 (20, 25-27): tres pasos de norte a sur entre una torre y una puerta
    // de este a oeste, sin nada en las juntas. Una pieza por paso, la de atrás
    // enseñaba su testero en cada junta.
    const e = escenaDe(41);
    const ns = e.sprites.filter(
      (s) =>
        /^muro-ns-\d\.webp$/.test(s.src ?? '') &&
        s.objeto === undefined &&
        Math.floor(s.x) === 20 &&
        s.y > 25 &&
        s.y < 28,
    );
    expect(ns.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ns.map((s) => s.src)).size).toBe(1);
    expect(e.informe.testerosAMediaTirada).toBe(0);
    // Recta: todas en la x de su columna (el arte no se corre de lado al subir;
    // las piezas de antes se torcían ~0,4 casillas en tres pasos, s105).
    for (const s of ns) expect(Math.abs(s.x - 20.5)).toBeLessThan(0.01);
    // Romper a mano: las mismas piezas, una por paso, como iban.
    const sur = Math.max(...ns.map((s) => s.y));
    const porPaso = new Map(
      [...ns].sort((a, b) => b.y - a.y).map((s, k) => [s, { ...s, y: sur - k, clave: sur - k }]),
    );
    const comoIban = e.sprites.map((s) => porPaso.get(s) ?? s);
    expect(testerosDeLaEscena(comoIban, catalogo).length).toBeGreaterThan(0);
  });

  it('el recinto de s16, town-0: sus caras del este y del oeste en su tirada; corridas, muerde', () => {
    const e = escenaDe(16);
    const caras = [0, 1].map(() => [] as Sprite[]);
    const ns = e.sprites.filter(
      (s) => /^muro-ns-\d\.webp$/.test(s.src ?? '') && s.objeto?.id === 'town-0',
    );
    const medio = ns.reduce((m, s) => m + s.x, 0) / ns.length;
    for (const s of ns) caras[s.x < medio ? 0 : 1]?.push(s);
    for (const c of caras) expect(c).toHaveLength(2);
    // Rectas: las dos de cada cara, casi en la misma x (el paso apenas se corre).
    for (const [a, b] of caras as [Sprite, Sprite][])
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.02);
    expect(testerosDeLaEscena(e.sprites, catalogo)).toEqual([]);
    // Romper a mano: la de atrás un paso y una décima detrás de la de delante,
    // con el pie aún bajo su adarve: su corte asoma a media cara.
    const corridas = new Map<Sprite, Sprite>();
    for (const c of caras) {
      const sur = Math.max(...c.map((s) => s.y));
      for (const s of c) {
        const t = pasoDe(s.src ?? '');
        if (t === undefined) throw new Error(`${s.src} sin tirada`);
        const [, py] = pasoEnCasillas({ nh: s.nh, tirada: t }, s.alto);
        const y = s.y === sur ? sur : sur + py * 1.1;
        corridas.set(s, { ...s, y, clave: y - 0.005 });
      }
    }
    const rotos = testerosDeLaEscena(
      e.sprites.map((s) => corridas.get(s) ?? s),
      catalogo,
    );
    expect(rotos).toHaveLength(2);
  });
});

describe('el arte recto (tools/taller/muros.ts)', () => {
  it('la guía: el adarve de 1,07 casillas de fondo, con las dos juntas en la misma columna', () => {
    const { geometria } = guiaDelMuroNorteSur();
    const [atras, delante] = geometria.junta;
    expect(delante[0]).toBe(atras[0]);
    expect((delante[1] - atras[1]) / geometria.casilla).toBeCloseTo(LARGO_DEL_ADARVE, 2);
    expect(LARGO_DEL_ADARVE).toBeCloseTo(ALTO_DEL_TRAMO_NORTE_SUR * FONDO_DEL_ADARVE, 12);
  });

  it('las dos piezas del catálogo suben rectas: su paso apenas se corre de lado', () => {
    for (const id of ['muro-ns-1', 'muro-ns-2']) {
      const t = catalogo.piezas[id]?.tirada;
      if (t === undefined) throw new Error(`falta ${id}`);
      expect(Math.abs(t[0]) / -t[1], id).toBeLessThanOrEqual(TORCIDO_MAXIMO);
    }
  });

  it('una pieza torcida no se deriva: lanza diciendo que no va recta', async () => {
    // La pieza de verdad, cizallada como las de antes (0,2 de lado por lo que sube).
    const ruta = join(RAIZ, 'assets/mapa/muro-ns-1.webp');
    const torcida = join(RAIZ, '.cache', 'muro-ns-torcido.webp');
    mkdirSync(dirname(torcida), { recursive: true });
    await sharp(ruta)
      .affine([1, -0.2, 0, 1], { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ lossless: true })
      .toFile(torcida);
    await expect(juntasDelMuro(torcida)).rejects.toThrow(/no va recto/);
  });
});

describe('en el recinto, la punta de atrás de la tirada va detrás de la torre del norte', () => {
  it('s16, town-0: la pieza de atrás de cada cara se pinta antes que la torre de su vértice norte', () => {
    const e = escenaDe(16);
    const delRecinto = e.sprites.filter((s) => s.objeto?.id === 'town-0');
    const ns = delRecinto.filter((s) => /^muro-ns-\d\.webp$/.test(s.src ?? ''));
    const torres = delRecinto.filter((s) => s.recinto === 'torre');
    const medio = ns.reduce((m, s) => m + s.x, 0) / ns.length;
    for (const lado of [true, false]) {
      const cara = ns.filter((s) => s.x < medio === lado);
      const atras = cara.reduce((a, s) => (s.y < a.y ? s : a));
      const norte = torres
        .filter((t) => Math.abs(t.x - atras.x) < 0.1)
        .reduce((a, t) => (t.y < a.y ? t : a));
      expect(claveDe(atras)).toBeLessThan(claveDe(norte));
    }
  });
});
