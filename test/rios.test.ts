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
import { aguasDeLaEscena, nivelPintado } from '../src/client/render/escenario/escalon.js';
import {
  BORDE,
  BrazosDeAgua,
  crucesDeLaRed,
  type EntradaDelRio,
  elegirRio,
  ponerLagos,
  R_LAGO,
} from '../src/core/map/rios.js';
import { BARRERAS } from '../src/core/map/terrain.js';
import {
  ABIERTA,
  aguaALaVista,
  lineasQueSeparan,
  separadasDeCerca,
} from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { riosDelMapa } from '../tools/qa/rios.js';
import { itLento, rango } from './lento.js';

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
  it.each([10, 24, 28])('semilla %i: todo río tiene boca', (semilla) => {
    expect(riosDelMapa(newGame({ seed: semilla }).map).ciudadesDeRioSinBoca).toEqual([]);
  });

  it.each([10, 24, 28])(
    'semilla %i: su agua va a un nivel, y ninguna ciudad con tres brazos de agua',
    (semilla) => {
      const r = riosDelMapa(newGame({ seed: semilla }).map);
      expect(r.riosConEscalon).toEqual([]);
      expect(r.ciudadesConTresBrazos).toEqual([]);
    },
  );

  itLento('en 1-40: casi todos los mapas con río, y lo de los cruces medido', () => {
    // Medido el 16-10-2026 (tools/qa/rios.ts). Con el paso 1, 37 de 40 mapas
    // con río, todos con boca, ninguna ciudad con tres brazos ni río con
    // escalón, y 3 charcas sueltas. Con el paso 2, en 1-40 queda una ciudad con
    // tres brazos (s9 (21,22): el río entre dos niveles pasa a dos de la
    // ciudad) y un río con escalón (s39 (12,21): un trozo de agua junto a un
    // puente que se queda a la altura de su orilla). No es el río de una
    // casilla: en 1-200 el paso 1 dejaba 9 ciudades con tres brazos, 9 ríos con
    // escalón y 6 ciudades de río sin boca, en 12 mapas, y el paso 2, 5, 7 y 0
    // en 8. El cero de 1-40 era de esas semillas, no una regla. Con el paso 2b
    // (el río de una casilla también entre dos niveles), 5 ciudades de río sin
    // boca en 1-200, en 3 mapas (s21, tres; s55, s146): el río al pie de la
    // meseta, de una casilla, se corta donde una senda pasa en diagonal por su
    // esquina (`sinAguaEnLasEsquinas` la pasa a montaña) o junto a una espiga;
    // tres brazos 5 → 8 y escalones 7 → 7.
    let conRio = 0;
    let sinBoca = 0;
    let tres = 0;
    let escalones = 0;
    let charcas = 0;
    for (const s of rango(1, 40)) {
      const r = riosDelMapa(newGame({ seed: s }).map);
      if (r.rios > 0) conRio++;
      sinBoca += r.ciudadesDeRioSinBoca.length;
      tres += r.ciudadesConTresBrazos.length;
      escalones += r.riosConEscalon.length;
      charcas += r.charcasSueltas;
    }
    expect(conRio).toBeGreaterThanOrEqual(34);
    expect(sinBoca).toBeLessThanOrEqual(3);
    expect(tres).toBeLessThanOrEqual(1);
    expect(escalones).toBeLessThanOrEqual(1);
    expect(charcas).toBeLessThanOrEqual(4);
  });
});

/**
 * El paso 2 (16-10-2026): el agua del río entre dos regiones al mismo nivel se
 * adelgaza a una casilla (`adelgazarRios`), y esa agua a su nivel es la línea
 * que deja dos regiones a dos pasos (`separadasDeCerca`), como el acantilado
 * entre dos niveles.
 */
describe('el río de una casilla (paso 2)', () => {
  /** Una rejilla de 7×5 con la columna 3 de `barrera` entre la región 0 (x < 3) y la 1 (x > 3). */
  function columna(barrera: number) {
    const W = 7;
    const H = 5;
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    for (let y = 0; y < H; y++) tipos[y * W + 3] = barrera;
    return { W, H, tipos, nivel: new Array(W * H).fill(1) as number[] };
  }
  const AGUA = BARRERAS.indexOf('water');
  const ACANTILADO = BARRERAS.indexOf('cliff');
  const MONTAÑA = BARRERAS.indexOf('mountain');
  const todas = () => true;

  /** Una rejilla de 5×7 con la fila 3 de agua entre la región de arriba (y < 3, a `norte`) y la de abajo (y > 3, a `sur`); el agua, a ras de la más baja. */
  function fila(norte: number, sur: number) {
    const W = 5;
    const H = 7;
    const tipos = new Int8Array(W * H).fill(ABIERTA);
    const nivel = new Array(W * H).fill(0) as number[];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (y === 3) tipos[i] = AGUA;
        nivel[i] = y < 3 ? norte : y > 3 ? sur : Math.min(norte, sur);
      }
    return { W, H, tipos, nivel, i: 2 * W + 2, q: 4 * W + 2 };
  }

  it('las líneas que separan: agua entre dos iguales; acantilado o agua entre dos niveles', () => {
    expect(lineasQueSeparan(1, 2)).toEqual(['cliff', 'water']);
    expect(lineasQueSeparan(0, 0)).toEqual(['water']);
  });

  it('el agua al pie de lo alto se ve salvo con lo alto justo al norte y nada de agua al sur (paso 2b)', () => {
    // La meseta al sur: el río de una casilla queda a su espalda y se ve.
    const alSur = fila(1, 2);
    expect(aguaALaVista(alSur.W, alSur.H, alSur.tipos, alSur.nivel, 3 * alSur.W + 2, todas)).toBe(
      true,
    );
    expect(
      separadasDeCerca(
        alSur.W,
        alSur.H,
        alSur.tipos,
        alSur.nivel,
        alSur.i,
        alSur.q,
        1,
        2,
        todas,
        true,
      ),
    ).toBe(true);
    // La meseta al norte: su cara cuelga sobre el agua y la tapa; no separa.
    const alNorte = fila(2, 1);
    const m = 3 * alNorte.W + 2;
    expect(aguaALaVista(alNorte.W, alNorte.H, alNorte.tipos, alNorte.nivel, m, todas)).toBe(false);
    expect(
      separadasDeCerca(
        alNorte.W,
        alNorte.H,
        alNorte.tipos,
        alNorte.nivel,
        alNorte.i,
        alNorte.q,
        2,
        1,
        todas,
        true,
      ),
    ).toBe(false);
    // Con otra fila de agua al sur, la primera se ve (el río va a dos); si esa
    // otra fila no cuenta (se abre a la vez), no.
    alNorte.tipos[m + alNorte.W] = AGUA;
    alNorte.nivel[m + alNorte.W] = 1;
    expect(aguaALaVista(alNorte.W, alNorte.H, alNorte.tipos, alNorte.nivel, m, todas)).toBe(true);
    expect(
      aguaALaVista(alNorte.W, alNorte.H, alNorte.tipos, alNorte.nivel, m, (j) => j !== m + 5),
    ).toBe(false);
  });

  it('separadasDeCerca: su línea en medio, a su nivel, y a dos pasos justos', () => {
    const agua = columna(AGUA);
    const i = 2 * agua.W + 2;
    const q = 2 * agua.W + 4;
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 1, todas)).toBe(true);
    // Entre dos niveles, el agua a ras de la más baja también (paso 2b), pero
    // solo para quien la pide (el 7d y quien adelgaza el río); a ras de la
    // alta, no: sería un cañón bajo la orilla baja.
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 2, todas, true)).toBe(
      true,
    );
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 2, todas)).toBe(false);
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 0, 1, todas, true)).toBe(
      false,
    );
    const acantilado = columna(ACANTILADO);
    expect(
      separadasDeCerca(
        acantilado.W,
        acantilado.H,
        acantilado.tipos,
        acantilado.nivel,
        i,
        q,
        1,
        2,
        todas,
      ),
    ).toBe(true);
    expect(
      separadasDeCerca(
        acantilado.W,
        acantilado.H,
        acantilado.tipos,
        acantilado.nivel,
        i,
        q,
        1,
        1,
        todas,
      ),
    ).toBe(false);
    // Un agua más baja que las dos orillas es un cañón, no su línea.
    const encajada = columna(AGUA);
    for (let y = 0; y < encajada.H; y++) encajada.nivel[y * encajada.W + 3] = 0;
    expect(
      separadasDeCerca(encajada.W, encajada.H, encajada.tipos, encajada.nivel, i, q, 1, 1, todas),
    ).toBe(false);
    // La montaña de una casilla no separa a nadie.
    const montaña = columna(MONTAÑA);
    expect(
      separadasDeCerca(montaña.W, montaña.H, montaña.tipos, montaña.nivel, i, q, 1, 1, todas),
    ).toBe(false);
    // Lo que `cuenta` deja fuera (lo que se abre a la vez) no separa.
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, q, 1, 1, () => false)).toBe(
      false,
    );
    // A un paso se tocan, aunque haya agua alrededor.
    expect(separadasDeCerca(agua.W, agua.H, agua.tipos, agua.nivel, i, i + 1, 1, 1, todas)).toBe(
      false,
    );
  });

  // s6 y s32: ríos entre iguales (40 y 64 casillas lejos de nodos y lagos, el
  // 16-10-2026, tras el paso 2b; antes s9 y s23). En la orden lenta, la medida
  // de 1-40.
  it.each([6, 32])('semilla %i: el río entre iguales mide una casilla', (semilla) => {
    const r = riosDelMapa(newGame({ seed: semilla }).map);
    const total = r.anchosDelRio.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(30);
    expect(r.anchosDelRio[0] / total).toBeGreaterThanOrEqual(0.85);
    expect(r.anchosDelRio[2] + r.anchosDelRio[3]).toBeLessThanOrEqual(total * 0.05);
  });

  // Paso 2b, decisión del usuario (16-10-2026): entre dos niveles, a una casilla
  // donde se ve; con lo alto justo al norte, a dos. s4 y s5 (21 y 32 casillas sin
  // lo alto al norte, 46 y 47 con él, el 16-10-2026).
  it.each([4, 5])(
    'semilla %i: entre dos niveles, de una sin lo alto al norte y de dos bajo su cara',
    (semilla) => {
      const r = riosDelMapa(newGame({ seed: semilla }).map);
      const total = r.anchosEntreNiveles.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(20);
      expect(r.anchosEntreNiveles[0] / total).toBeGreaterThanOrEqual(0.85);
      const bajoLaCara = r.anchosBajoLaCara.reduce((a, b) => a + b, 0);
      expect(bajoLaCara).toBeGreaterThan(20);
      expect(r.anchosBajoLaCara[0]).toBe(0);
      expect(r.aguaBajoLaCara).toEqual([]);
    },
  );

  itLento('en 1-40: el río, de una casilla salvo bajo la cara de lo alto, que va a dos', () => {
    // Medido el 16-10-2026 (tools/qa/rios.ts; ancho en ocho vecinas, y bajo la
    // cara, lo hondo de su columna). Entre iguales, 18/64/18 % (1/2/3) en el
    // paso 1 → 89/8/3 % en el paso 2 → 85/12/3 % en el 2b. Entre dos niveles
    // sin lo alto al norte, 20/62/18 → 18/61/21 → 78/16/6 %; con lo alto al
    // norte, por lo hondo de su columna, 2/18/31/49 → 1/17/29/53 → 1/47/19/32 %
    // (1/2/3/≥ 4), y el agua de una casilla bajo la cara, 9 → 5 → 6 (lo que deja
    // el engorde junto a los cruces y los nodos: s1, s10, s15, s22 dos y s40).
    // Y sin cañones: el agua encajada (las dos vecinas de un eje por encima),
    // 128 → 118 → 68; sin llenar las muescas que deja lo bajo, 148.
    const iguales = [0, 0, 0, 0];
    const niveles = [0, 0, 0, 0];
    const cara = [0, 0, 0, 0];
    let tapada = 0;
    let encajada = 0;
    for (const s of rango(1, 40)) {
      const r = riosDelMapa(newGame({ seed: s }).map);
      for (let k = 0; k < 4; k++) {
        iguales[k]! += r.anchosDelRio[k]!;
        niveles[k]! += r.anchosEntreNiveles[k]!;
        cara[k]! += r.anchosBajoLaCara[k]!;
      }
      tapada += r.aguaBajoLaCara.length;
      encajada += r.aguaEncajada;
    }
    const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(iguales[0]! / suma(iguales)).toBeGreaterThanOrEqual(0.6);
    expect((iguales[2]! + iguales[3]!) / suma(iguales)).toBeLessThanOrEqual(0.05);
    expect(niveles[0]! / suma(niveles)).toBeGreaterThanOrEqual(0.6);
    expect(cara[0]! / suma(cara)).toBeLessThanOrEqual(0.03);
    expect(tapada).toBeLessThanOrEqual(6);
    expect(encajada).toBeLessThanOrEqual(80);
  });

  // Paso 2b (16-10-2026): el río de una casilla al pie de una meseta, al este,
  // al oeste y al norte de ella (lo alto al sur). Lo alto se adelanta sobre lo
  // bajo (`ORILLA`, 0,06-0,3) y el agua se cierra donde queda encima, así que
  // pierde algo de su casilla, pero ninguna casilla del río baja de la mitad
  // (medido: 0,56-0,63 con las semillas 1-3; 0,88 entre iguales). Lo que tapa
  // encima —la ladera de 0,45 a su pie, el reborde de la espalda— es del
  // escenario y se mira en las capturas (`paso2b-cerca-*`).
  it.each([
    ['oeste', 1],
    ['este', 2],
    ['sur', 3],
  ] as const)(
    'el pintor: con lo alto al %s, el río de una casilla sigue con media casilla de agua (semilla %i)',
    (lado, semilla) => {
      const W = 9;
      const H = 9;
      const nivel = new Array(W * H).fill(1) as number[];
      const agua: number[] = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (lado === 'sur') {
            if (y === 4) agua.push(i);
            if (y > 4) nivel[i] = 2;
          } else {
            if (x === 4) agua.push(i);
            if ((lado === 'oeste' && x < 4) || (lado === 'este' && x > 4)) nivel[i] = 2;
          }
        }
      const np = nivelPintado({ W, H, nivel, semilla });
      const a = aguasDeLaEscena({ W, H, nivel, agua }, np);
      const { R } = np;
      for (let k = 0; k < H; k++) {
        let llenos = 0;
        for (let t = 0; t < R; t++)
          for (let u = 0; u < R; u++) {
            const px = lado === 'sur' ? k * R + u : 4 * R + t;
            const py = lado === 'sur' ? 4 * R + t : k * R + u;
            if ((a.agua.alfa[py * np.ancho + px] as number) >= 128) llenos++;
          }
        expect(llenos / (R * R)).toBeGreaterThanOrEqual(0.5);
      }
    },
  );

  it('el pintor: un río de una casilla lleva agua entera, su barro y la espuma de sus dos orillas', () => {
    const W = 9;
    const H = 9;
    const nivel = new Array(W * H).fill(1) as number[];
    const agua: number[] = [];
    for (let y = 0; y < H; y++) agua.push(y * W + 4);
    const np = nivelPintado({ W, H, nivel, semilla: 1 });
    const a = aguasDeLaEscena({ W, H, nivel, agua }, np);
    const { R } = np;
    const fila = (m: { alfa: Uint8ClampedArray }, px: number) =>
      m.alfa[(4 * R + R / 2) * np.ancho + px] as number;
    const dentro = rango(4 * R, 5 * R - 1);
    // El agua, entera en tres cuartos de la casilla: la orilla no se la come.
    expect(dentro.filter((px) => fila(a.agua, px) === 255).length).toBeGreaterThanOrEqual(0.7 * R);
    // La espuma, un anillo en cada orilla y nada en medio.
    expect(fila(a.espuma, 4 * R + 1)).toBeGreaterThan(0);
    expect(fila(a.espuma, 5 * R - 2)).toBeGreaterThan(0);
    expect(fila(a.espuma, 4 * R + R / 2)).toBe(0);
    // El barro, una franja fina fuera: a una casilla ya no hay.
    expect(fila(a.barro, 4 * R - 1)).toBeGreaterThan(0);
    expect(fila(a.barro, 3 * R)).toBe(0);
    expect(fila(a.barro, 6 * R)).toBe(0);
    // Sin centro hondo: lo hondo es lo de agua a los cuatro lados (el lago).
    expect(dentro.every((px) => fila(a.hondo, px) === 0)).toBe(true);
  });
});
