/**
 * Los ríos del procedimental (#144, 16-10-2026): varias fronteras de agua
 * seguidas, con boca en el borde del mapa, lagos en su curso y la ciudad de
 * cada cruce como vado (`core/map/rios.ts`). Lo de fuera del río sigue la
 * regla de las charcas: ningún cruce con dos brazos de agua que no sean de un
 * río.
 *
 * Las medidas sobre el mapa hecho son las de `tools/qa/rios.ts`
 * (`riosDelMapa`), que no sabe nada del generador: valen también para un mapa
 * del agente.
 */
import { describe, expect, it } from 'vitest';
import {
  BORDE,
  BrazosDeAgua,
  crucesDeLaRed,
  type EntradaDelRio,
  elegirRio,
  ponerLagos,
  R_LAGO,
} from '../src/core/map/rios.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { riosDelMapa } from '../tools/qa/rios.js';
import { itLento, rango, segunPrisa } from './lento.js';

/**
 * Una red sintética de 18×12 en seis bloques de 6×6, en espejo de 180°:
 *
 *     0 2 4
 *     5 3 1
 *
 * Dos cruces de cuatro regiones, X1 en (6,6) y X2 en (12,6), cada uno con su
 * ciudad. Las parejas 0-2, 2-4, 0-5, 3-5, 1-3 y 1-4 llegan al borde; 2-3 va
 * de un cruce al otro.
 */
function redDeSeis(admiteAgua: (k: number) => boolean = () => true): EntradaDelRio {
  const W = 18;
  const H = 12;
  const N = W * H;
  const regiones = 6;
  const BLOQUES = [
    [0, 2, 4],
    [5, 3, 1],
  ] as const;
  const etiqueta = new Int32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      etiqueta[y * W + x] = BLOQUES[Math.floor(y / 6)]![Math.floor(x / 6)] as number;
  const clave = (a: number, b: number): number => Math.min(a, b) * regiones + Math.max(a, b);
  const parejaDe = (r: number): number => (r % 2 === 0 ? r + 1 : r - 1);
  // El muro y sus parejas, como el paso 1 de `engordarFronteras`.
  const parejaDeMuro = new Int32Array(N).fill(-1);
  const asomadas: (readonly number[] | undefined)[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    const celdas = new Set([etiqueta[i] as number]);
    let muro = false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const e = etiqueta[(y + dy) * W + x + dx] as number;
        celdas.add(e);
        if (e < (etiqueta[i] as number)) muro = true;
      }
    if (!muro) continue;
    const lista = [...celdas].sort((a, b) => a - b);
    parejaDeMuro[i] = clave(lista[0] as number, etiqueta[i] as number);
    asomadas[i] = lista;
  }
  const ciudades = [6 * W + 6, 6 * W + 12];
  const claveEspejo = (k: number): number =>
    clave(parejaDe(Math.floor(k / regiones)), parejaDe(k % regiones));
  const fino = (k: number): number => {
    let n = 0;
    for (let i = 0; i < N; i++)
      if ((parejaDeMuro[i] === k || parejaDeMuro[i] === claveEspejo(k)) && !ciudades.includes(i))
        n++;
    return n;
  };
  return {
    W,
    H,
    parejaDeMuro,
    asomadas,
    nodos: ciudades,
    ciudades,
    regiones,
    niveles: [1, 1, 1, 1, 1, 1],
    admiteAgua,
    otraBarrera: () => 'mountain',
    fino,
    claveEspejo,
  };
}

const nombre = (k: number): string => `${Math.floor(k / 6)}-${k % 6}`;

describe('elegir el río (red sintética de seis regiones)', () => {
  const e = redDeSeis();
  const cruces = crucesDeLaRed(e);

  it('dos cruces, y las parejas del borde llevan el borde entre sus extremos', () => {
    expect(cruces.casillas.length).toBe(2);
    for (const p of ['0-2', '2-4', '0-5', '3-5', '1-3', '1-4'])
      expect(cruces.extremos.get(Number(p[0]) * 6 + Number(p[2])), p).toContain(BORDE);
    expect(cruces.extremos.get(2 * 6 + 3)).not.toContain(BORDE);
  });

  it('el río tiene boca y, con su espejo, ningún cruce con tres brazos', () => {
    for (let s = 1; s <= 30; s++) {
      const rio = elegirRio(e, cruces, createRng(s));
      expect(rio, `semilla ${s}`).not.toBeNull();
      if (rio === null) continue;
      expect(rio.parejas.length).toBeGreaterThanOrEqual(2);
      expect(
        cruces.extremos.get(rio.parejas[0] as number),
        rio.parejas.map(nombre).join(),
      ).toContain(BORDE);
      const brazos = new Map<number, number>();
      for (const k of rio.agua)
        for (const c of cruces.extremos.get(k) ?? [])
          if (c !== BORDE) brazos.set(c, (brazos.get(c) ?? 0) + 1);
      for (const [c, n] of brazos)
        expect(n, `cruce ${c} con ${rio.parejas.map(nombre).join()}`).toBeLessThanOrEqual(2);
    }
  });

  it('sin parejas que admitan agua no hay río; y uno que el resto del vestido no aguanta no se elige', () => {
    expect(
      elegirRio(
        redDeSeis(() => false),
        crucesDeLaRed(redDeSeis(() => false)),
        createRng(1),
      ),
    ).toBeNull();
    expect(elegirRio(e, cruces, createRng(1), () => false)).toBeNull();
  });

  it('la regla de las charcas: con el río puesto, los demás brazos de sus cruces no admiten agua', () => {
    const rio = elegirRio(e, cruces, createRng(7));
    expect(rio).not.toBeNull();
    const brazos = new BrazosDeAgua(cruces, e.claveEspejo);
    for (const k of rio!.agua) brazos.poner(k);
    for (const k of cruces.parejas) {
      if (rio!.agua.has(k)) continue;
      const tocaElRio = (cruces.extremos.get(k) ?? []).some((c) => c !== BORDE && brazos.de(c) > 0);
      expect(brazos.admite(k), nombre(k)).toBe(!tocaElRio);
    }
    // Sin río, la primera pareja que se pone deja sin agua a las de su cruce.
    const sueltas = new BrazosDeAgua(cruces, e.claveEspejo);
    expect(sueltas.admite(2 * 6 + 3)).toBe(true);
    sueltas.poner(0 * 6 + 2);
    sueltas.poner(1 * 6 + 3);
    expect(sueltas.admite(2 * 6 + 3)).toBe(false);
    // Una clave sin muro (dos regiones que solo se asoman al cruce) no lleva agua.
    expect(sueltas.admite(0 * 6 + 3)).toBe(false);
  });
});

describe('los lagos', () => {
  /** Dos regiones, la de arriba (0) y la de abajo (1), con un muro en la fila `muro`. */
  function dos(H: number, muroEn: number) {
    const W = 20;
    const N = W * H;
    const etiqueta = new Int32Array(N);
    const muro = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const y = Math.floor(i / W);
      etiqueta[i] = y < muroEn ? 0 : 1;
      if (y === muroEn) muro[i] = 1;
    }
    const tipos = new Int8Array(N).fill(-1);
    for (let i = 0; i < N; i++) if (muro[i] === 1) tipos[i] = 1;
    return {
      W,
      H,
      etiqueta,
      muro,
      tipos,
      pasillo: new Uint8Array(N),
      nodos: [] as number[],
      semillas: [
        { x: 2, y: 1 },
        { x: 2, y: H - 1 },
      ],
      regiones: 2,
      ruido: () => true,
      agua: 1,
      abierta: -1,
    };
  }

  it('el que se pone toca solo sus dos regiones y es agua', () => {
    const e = dos(11, 5);
    const centro = 5 * e.W + 10;
    const { lago, sinSitio } = ponerLagos(e, [{ centro, pareja: 1 }]);
    expect(sinSitio).toEqual([]);
    const casillas = [...lago.keys()].filter((i) => lago[i] === 1);
    // El disco y el anillo (la moneda cae siempre a favor): radio R_LAGO + 1.
    expect(casillas.length).toBeGreaterThan(20);
    for (const i of casillas) {
      expect(e.tipos[i]).toBe(1);
      const dx = (i % e.W) - 10;
      const dy = Math.floor(i / e.W) - 5;
      expect(dx * dx + dy * dy).toBeLessThanOrEqual((R_LAGO + 1) * (R_LAGO + 1) + 1);
    }
  });

  it('el que partiría una región no se pone', () => {
    // La región de abajo mide dos filas: el lago la cortaría en dos.
    const e = dos(8, 5);
    const antes = Int8Array.from(e.tipos);
    const centro = 5 * e.W + 10;
    const { lago, sinSitio } = ponerLagos(e, [{ centro, pareja: 1 }]);
    expect(sinSitio).toEqual([centro]);
    expect(lago.every((v) => v === 0)).toBe(true);
    expect(e.tipos).toEqual(antes);
  });

  it('ni en un pasillo ni junto a otra región', () => {
    const e = dos(11, 5);
    for (let y = 0; y < e.H; y++) e.pasillo[y * e.W + 10] = 1;
    // Una tercera región en la columna 13 de arriba.
    for (let y = 0; y < 3; y++) e.etiqueta[y * e.W + 13] = 2;
    const { lago } = ponerLagos({ ...e, regiones: 3 }, [{ centro: 5 * e.W + 10, pareja: 1 }]);
    for (let y = 0; y < e.H; y++) expect(lago[y * e.W + 10]).toBe(0);
    for (let i = 0; i < lago.length; i++) {
      if (lago[i] === 0) continue;
      const x = i % e.W;
      const y = Math.floor(i / e.W);
      // A dos o menos de la tercera región, nada.
      expect(Math.abs(x - 13) <= 2 && y <= 4, `(${x}, ${y})`).toBe(false);
    }
  });
});

/**
 * En los mapas del juego. En `pnpm verify`, las semillas que antes de los ríos
 * tenían ciudades con tres brazos de agua (s10, s24, s28); en la orden lenta,
 * 1-40.
 */
describe('los ríos en los mapas del juego', () => {
  it.each(segunPrisa([10, 24, 28], rango(1, 40)))(
    'semilla %i: todo río tiene boca y su agua va a un nivel',
    (semilla) => {
      const r = riosDelMapa(newGame({ seed: semilla }).map);
      expect(r.ciudadesDeRioSinBoca).toEqual([]);
      expect(r.riosConEscalon).toEqual([]);
    },
  );

  it.each([10, 24, 28])('semilla %i: ninguna ciudad con tres brazos de agua', (semilla) => {
    expect(riosDelMapa(newGame({ seed: semilla }).map).ciudadesConTresBrazos).toEqual([]);
  });

  itLento('en 1-40: casi todos los mapas con río, y lo de los cruces medido', () => {
    // Medido el 16-10-2026 (tools/qa/rios.ts): 37 de 40 mapas con río, todos
    // con boca, 29 de borde a borde; ninguna ciudad con tres brazos (eran 3 en
    // s14 mientras el lago pintaba trozos de su anillo sueltos) y 3 charcas
    // sueltas (s5 y s9, de parejas sueltas que se juntan en un cruce sin ciudad).
    let conRio = 0;
    let tres = 0;
    let charcas = 0;
    for (const s of rango(1, 40)) {
      const r = riosDelMapa(newGame({ seed: s }).map);
      if (r.rios > 0) conRio++;
      tres += r.ciudadesConTresBrazos.length;
      charcas += r.charcasSueltas;
    }
    expect(conRio).toBeGreaterThanOrEqual(34);
    expect(tres).toBe(0);
    expect(charcas).toBeLessThanOrEqual(4);
  });
});
