/**
 * La muralla (#183): un lienzo seguido de puerta a la barrera vecina, la puerta
 * unida a los dos lados, torres que no se apilan y el guardia que cuenta lo
 * PINTADO (`murallaSinLeer`), no el esqueleto. La auditoría 3 midió el 66 % de
 * las casillas de muro sin una pieza cerca y 6 de 15 puertas solas en el llano
 * con `murallasPartidas` a 0.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { ejeDe } from '../src/client/render/escenario/esqueleto.js';
import {
  ENTRE_TORRES,
  murallaSinLeer,
  RADIO_DE_MURALLA,
  type TramoPintado,
  torresDe,
  trazaDeMuralla,
} from '../src/client/render/escenario/muralla.js';
import { escenaDe, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

type Casilla = readonly [number, number];

/** Las casillas `#` de un dibujo, y la `P` (la puerta) aparte. */
function dibujo(filas: readonly string[]): { muro: Casilla[]; puertas: Casilla[] } {
  const muro: Casilla[] = [];
  const puertas: Casilla[] = [];
  filas.forEach((f, y) => {
    [...f].forEach((ch, x) => {
      if (ch === '#') muro.push([x, y]);
      if (ch === 'P') puertas.push([x, y]);
    });
  });
  return { muro, puertas };
}

const clave = ([x, y]: Casilla) => `${x},${y}`;
const nunca = () => false;

describe('la línea de una muralla', () => {
  it('pasa por la puerta y sale de ella a los dos lados', () => {
    const { muro, puertas } = dibujo(['####P####', '####.####']);
    const e = trazaDeMuralla(muro, puertas, nunca);
    const p = clave(puertas[0] as Casilla);
    const desdeLaPuerta = e.pasos.filter((q) => clave(q.a) === p || clave(q.b) === p);
    // Una al oeste y otra al este, no dos del mismo lado.
    const lados = desdeLaPuerta.map((q) => (clave(q.a) === p ? q.b[0] : q.a[0]) - 4);
    expect(new Set(lados.map(Math.sign))).toEqual(new Set([-1, 1]));
  });

  it('se alarga hasta la barrera vecina en vez de quedarse a una casilla', () => {
    // Una franja de 2 de ancho que acaba contra algo en x = 9 (un acantilado).
    const { muro } = dibujo(['##########', '##########']);
    const toca = (x: number) => x >= 9;
    const e = trazaDeMuralla(muro, [], (x) => toca(x));
    expect(e.casillas.some(([x]) => toca(x))).toBe(true);
  });

  it('en una mancha gorda ninguna casilla queda lejos de la línea', () => {
    const { muro } = dibujo(['#####', '#####', '#####', '#####', '#####']);
    const e = trazaDeMuralla(muro, [], nunca);
    for (const c of muro)
      expect(e.casillas.some((l) => Math.hypot(l[0] - c[0], l[1] - c[1]) <= RADIO_DE_MURALLA)).toBe(
        true,
      );
  });

  it('en una franja en escalera, lo lejano se cose por lo más cercano: un espolón, no otro muro (§29)', () => {
    // La franja de s1 (13-16, 1-6), con su puerta al sureste y el acantilado al
    // noroeste. Cosida a la punta de la línea por el borde de la franja, quedaban
    // dos muros de norte a sur a dos casillas, (13, 2-4) y (15, 3-5).
    const { muro, puertas } = dibujo(['.#...', '##...', '####.', '####.', '..##.', '..##P']);
    const e = trazaDeMuralla(muro, puertas, (x, y) => x <= 0 && y <= 1);
    const ns = (x: number) => e.pasos.filter((p) => p.a[0] === x && p.b[0] === x).length;
    expect(ns(2), 'el lienzo de norte a sur').toBeGreaterThan(1);
    expect(ns(0), 'otro paralelo a dos casillas').toBe(0);
    for (const c of muro)
      expect(e.casillas.some((l) => Math.hypot(l[0] - c[0], l[1] - c[1]) <= RADIO_DE_MURALLA)).toBe(
        true,
      );
  });

  it('un cuadrado de 2×2, que el adelgazado borra entero, deja algo en pie (s25)', () => {
    const { muro } = dibujo(['##', '##']);
    expect(trazaDeMuralla(muro, [], nunca).casillas.length).toBeGreaterThan(0);
  });
});

describe('las torres', () => {
  it('de norte a sur no se apilan: a ENTRE_TORRES como poco, y ninguna junto a la puerta', () => {
    // Una franja N-S con quiebros, como s9 (8,28-30), y una puerta en medio.
    const { muro, puertas } = dibujo([
      '.#.',
      '.##',
      '..#',
      '.#.',
      '.P.',
      '.#.',
      '##.',
      '#..',
      '.#.',
      '.#.',
    ]);
    const e = trazaDeMuralla(muro, puertas, nunca);
    expect(e.pasos.some((p) => ejeDe(p) === 'profundidad')).toBe(true);
    const torres = torresDe(e, puertas);
    expect(torres.length).toBeGreaterThan(0);
    for (const t of torres)
      for (const u of torres)
        if (t !== u)
          expect(Math.hypot(t[0] - u[0], t[1] - u[1])).toBeGreaterThanOrEqual(ENTRE_TORRES);
    for (const t of torres)
      expect(Math.max(Math.abs(t[0] - 1), Math.abs(t[1] - 4))).toBeGreaterThan(1);
  });
});

describe('el guardia cuenta lo pintado', () => {
  // Una muralla de oeste a este con una puerta en (3, 0), y el muro a sus dos lados.
  const franja = { id: 0, casillas: [0, 1, 2, 4, 5, 6].map((x): Casilla => [x, 0]) };
  const puerta = { id: 'p', at: [3, 0] as Casilla, paso: [0, 1] as Casilla };
  const esMuro = (x: number, y: number) => y === 0 && x >= 0 && x <= 6 && x !== 3;
  const linea: TramoPintado[] = [0, 1, 2, 3, 4, 5].map((x) => ({
    franja: 0,
    a: [x, 0],
    b: [x + 1, 0],
  }));

  it('la muralla entera, con la puerta unida a los dos lados: nada', () => {
    expect(murallaSinLeer([franja], [puerta], esMuro, linea)).toEqual({
      sinMuralla: [],
      puertasSueltas: [],
      huecos: 0,
    });
  });

  it('un tramo que no entró parte la línea', () => {
    const sinUno = linea.filter((t) => t.a[0] !== 4);
    expect(murallaSinLeer([franja], [puerta], esMuro, sinUno).huecos).toBe(1);
  });

  it('sin el tramo de un lado, la puerta está suelta', () => {
    const sinLado = linea.filter((t) => t.b[0] !== 3);
    expect(murallaSinLeer([franja], [puerta], esMuro, sinLado).puertasSueltas).toEqual(['p']);
  });

  it('sin nada pintado, cada casilla de muro sale sin muralla', () => {
    expect(murallaSinLeer([franja], [puerta], esMuro, []).sinMuralla).toHaveLength(6);
  });

  it('lo que llega a una ciudad por los dos lados no está partido: su pieza es la muralla', () => {
    const partida = linea.filter((t) => t.a[0] !== 4 && t.a[0] !== 5);
    const huella: Casilla[] = [[5, 1]];
    expect(murallaSinLeer([franja], [], esMuro, partida, [huella]).huecos).toBe(0);
  });
});

describe('en las partidas', () => {
  const SEMILLAS = segunPrisa([1, 2, 9, 33], rango(1, 40));
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ninguna casilla de muro sin muralla, ninguna puerta suelta, ninguna línea partida`, () => {
      const e = escenaDe(semilla);
      expect(e.informe.muralla).toEqual({ sinMuralla: [], puertasSueltas: [], huecos: 0 });
      expect(e.informe.murallasPartidas).toBe(0);
    });

  it('y el guardia mira algo: hay muros, puertas y tramos', () => {
    const map = partidaDe(1).map;
    const a = analizar(map);
    expect(a.franjas.filter((f) => f.barrera === 'wall').length).toBeGreaterThan(5);
    expect([...a.pasos.values()].filter((p) => p.barrera === 'wall').length).toBeGreaterThan(0);
    expect(escenaDe(1).sprites.filter((s) => s.clase === 'muro').length).toBeGreaterThan(30);
  });

  it('en una casilla de muro no se siembra la cubierta del campo (los huertos de s57)', () => {
    for (const semilla of [1, 57]) {
      const map = partidaDe(semilla).map;
      const e = escenaDe(semilla);
      const enMuro = e.sprites.filter(
        (s) =>
          s.clase === 'cubierta' &&
          map.terrain[Math.floor(s.y) * map.width + Math.floor(s.x)] === 'wall',
      );
      expect(enMuro.map((s) => `${s.src} en ${s.x.toFixed(2)},${s.y.toFixed(2)}`)).toEqual([]);
    }
  });
});

describe('la muralla de norte a sur, de lado (§29)', () => {
  it('sus tramos son las piezas muro-ns, de 1,6 de alto y por el medio, y no la tira de la hoja', () => {
    // s2 lleva tres puertas N-S, (9,11), (24,14) y (9,19), con su lienzo arriba y abajo.
    const e = escenaDe(2);
    const ns = e.sprites.filter((s) => /^muro-ns-[12]\.webp$/.test(s.src ?? ''));
    expect(ns.length).toBeGreaterThan(5);
    expect(new Set(ns.map((s) => s.src))).toEqual(new Set(['muro-ns-1.webp', 'muro-ns-2.webp']));
    for (const s of ns) {
      expect(s.clase).toBe('muro');
      expect(s.alto).toBe(1.6);
      expect(s.ax).toBe(s.nw / 2);
    }
    expect(e.sprites.filter((s) => s.src === 'modulos/muro/profundidad.webp')).toEqual([]);
  });

  it('la puerta N-S se mide por el alto y se apoya en el pie de su arco', () => {
    const e = escenaDe(2);
    const puertas = e.sprites.filter((s) => s.src === 'nodo-puerta-hondo.webp');
    expect(puertas.map((s) => s.objeto?.id).sort()).toEqual(['node-2', 'node-4', 'node-7']);
    for (const s of puertas) {
      expect(s.alto).toBe(2.6);
      expect(s.ay / s.nh).toBeCloseTo(0.625);
      expect(s.ax).toBe(s.nw / 2);
    }
  });
});
