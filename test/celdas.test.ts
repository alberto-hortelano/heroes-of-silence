/**
 * El relieve por celdas de vértice (R4/R5, `celdas.ts`): de un nivel por
 * casilla, una pared por vértice y grupo de umbrales, de junta a junta; las
 * bajadas donde una senda cruza una caída; y los guardias que miden lo puesto
 * (`celdasMalCubiertas`, `bajadasSinPieza`, `bajadasTapadas`). Con rejillas a
 * mano y el arte del repo; en mapas reales, en `taller-escenario.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  type CatalogoEnBruto,
  catalogoValidado,
  type ModuloDeBajada,
  type ModuloDeDiagonal,
} from '../src/client/render/escenario/catalogo.js';
import {
  abajoDe,
  type Bajada,
  bajadasDe,
  type Celda,
  caidas,
  celdas,
  esVisto,
  filosDe,
  JUNTAS,
  porJunta,
  rampaDe,
  vecinaEn,
} from '../src/client/render/escenario/celdas.js';
import {
  bajadasSinPieza,
  bajadasTapadas,
  celdasMalCubiertas,
  filosColocados,
  hojaDeBajada,
  hojaDeDiagonal,
  marcadorDeBajada,
  marcadorDeDiagonal,
  type Sprite,
  spriteDeBajada,
  spriteDeDiagonal,
} from '../src/client/render/escenario/colocar.js';
import type { Suelo } from '../src/core/map/terrain.js';
import { catalogoDelDisco, recta } from './helpers.js';

/** Las celdas de una rejilla de niveles escrita a mano, una cifra por casilla. */
function deRejilla(filas: readonly string[], suelo: Suelo = 'grass') {
  const W = (filas[0] as string).length;
  const H = filas.length;
  const nivel = filas.flatMap((f) => [...f].map(Number));
  const s = Array.from({ length: W * H }, () => suelo);
  return { W, H, nivel, suelo: s, celdas: celdas(nivel, W, H, s), caidas: caidas(nivel, W, H, s) };
}

const tipos = (cs: readonly Celda[]) => cs.map((c) => `${c.vx},${c.vy} ${c.tipo}`).sort();
const catalogo = catalogoDelDisco();

describe('las paredes por celda de vértice', () => {
  it('una meseta rectangular: en sus esquinas de delante, dos convexas, y ninguna recta S, E u O en ellas', () => {
    // La meseta ocupa x 2-4, y 1-3.
    const { celdas: cs } = deRejilla(['111111', '112221', '112221', '112221', '111111']);
    const vistas = cs.filter((c) => esVisto(c.tipo));
    expect(tipos(vistas.filter((c) => c.tipo.includes('-')))).toEqual([
      '2,4 SO-convexa',
      '5,4 SE-convexa',
    ]);
    // Las rectas van entre ellas: S de junta a junta en x 3-4, E y O en y 2-3.
    expect(tipos(vistas.filter((c) => !c.tipo.includes('-')))).toEqual([
      '2,2 O',
      '2,3 O',
      '3,4 S',
      '4,4 S',
      '5,2 E',
      '5,3 E',
    ]);
    // Las de detrás, de espaldas: el reborde.
    expect(
      cs
        .filter((c) => !esVisto(c.tipo))
        .map((c) => c.tipo)
        .sort(),
    ).toEqual(['N', 'N', 'NE-convexa', 'NO-convexa']);
  });

  it('una escalera a 45° alterna convexas y cóncavas, sin rectas S ni E en medio', () => {
    // Alto todo lo que queda al noroeste de la diagonal.
    const { celdas: cs } = deRejilla(['22221', '22211', '22111', '21111', '11111']);
    const vistas = cs.filter((c) => esVisto(c.tipo));
    expect(new Set(vistas.map((c) => c.tipo))).toEqual(new Set(['SE-convexa', 'SE-concava']));
    // Alternan por la diagonal: el vértice de la punta de cada peldaño da la
    // convexa, y el del rincón de encima, la cóncava.
    expect(tipos(vistas)).toEqual([
      '1,3 SE-concava',
      '1,4 SE-convexa',
      '2,2 SE-concava',
      '2,3 SE-convexa',
      '3,1 SE-concava',
      '3,2 SE-convexa',
      '4,1 SE-convexa',
    ]);
  });

  it('la silla se resuelve «el alto une»: dos rincones', () => {
    const { celdas: cs } = deRejilla(['21', '12']);
    expect(tipos(cs)).toEqual(['1,1 NE-concava', '1,1 SO-concava']);
  });

  it('una celda de tres niveles da dos paredes, una por grupo de umbrales con el mismo caso', () => {
    // NO 3, NE 2, SO 1, SE 1: con t = 2, caso 12 (S); con t = 3, caso 8 (SE convexa).
    const { celdas: cs } = deRejilla(['32', '11']);
    expect(cs.map((c) => [c.tipo, c.desde, c.caida])).toEqual([
      ['S', 2, 1],
      ['SE-convexa', 3, 1],
    ]);
  });

  it('el mismo tipo en dos grupos seguidos es una sola pared con la caída de los dos', () => {
    // NO 3, NE 3, SO 3, SE 0 con NO bajando: el rincón SE (caso 14) y, más
    // arriba, la silla (caso 6) que también lo da. Dos piezas se montaban.
    const { celdas: cs } = deRejilla(['13', '30']);
    const se = cs.filter((c) => c.tipo === 'SE-concava');
    expect(se.map((c) => [c.desde, c.caida])).toEqual([[1, 3]]);
  });

  it('el contorno se cierra: cada junta la comparten exactamente dos paredes de un mismo umbral', () => {
    const {
      celdas: cs,
      W,
      H,
    } = deRejilla(['1111111', '1223221', '1233321', '1223221', '1122111', '1111111']);
    const juntas = porJunta(cs);
    for (const c of cs)
      for (const [x, y] of filosDe(c)) {
        // En el borde de la rejilla no hay vecina.
        if (x <= 0.5 || y <= 0.5 || x >= W - 0.5 || y >= H - 0.5) continue;
        const v = vecinaEn(c, [x, y], juntas);
        expect(v, `${c.vx},${c.vy} ${c.tipo} en ${x},${y}`).toBeDefined();
        // Y la vecina pasa por el mismo punto.
        expect(filosDe(v as Celda).some(([a, b]) => a === x && b === y)).toBe(true);
      }
  });

  it('las juntas de cada tipo caen en el medio de un lado de casilla, y su clase la da el lado', () => {
    for (const [tipo, [a, b]] of Object.entries(JUNTAS)) {
      for (const [x, y, clase] of [a, b]) {
        expect(Math.abs(x) + Math.abs(y), tipo).toBe(0.5);
        expect(
          x === 0 ? clase !== 'S' && clase !== 'N' : clase === 'S' || clase === 'N',
          tipo,
        ).toBe(true);
      }
    }
  });
});

describe('las bajadas (R5)', () => {
  // Una meseta de nivel 2 (x 1-3, y 0-1) sobre un llano de 1.
  const r = deRejilla(['122211', '122211', '111111', '111111']);
  const tramo = (p: readonly [number, number], q: readonly [number, number]) =>
    [
      { x: p[0], y: p[1] },
      { x: q[0], y: q[1] },
    ] as const;
  const de = (tramos: readonly (readonly [{ x: number; y: number }, { x: number; y: number }])[]) =>
    bajadasDe(r.nivel, r.W, r.suelo, r.celdas, tramos, []);

  it('el rumbo sale del tramo del núcleo, de lo alto a lo bajo, y al norte no hay pieza', () => {
    expect(de([tramo([2, 1], [2, 2])]).map((b) => b.rumbo)).toEqual(['s']);
    expect(de([tramo([2, 2], [2, 1])]).map((b) => b.rumbo)).toEqual(['s']);
    expect(de([tramo([3, 1], [4, 2])]).map((b) => b.rumbo)).toEqual(['se']);
    expect(de([tramo([1, 1], [0, 2])]).map((b) => b.rumbo)).toEqual(['so']);
    expect(de([tramo([3, 0], [4, 0])]).map((b) => b.rumbo)).toEqual(['e']);
    expect(de([tramo([1, 0], [0, 0])]).map((b) => b.rumbo)).toEqual(['o']);
    // Al mismo nivel no hay bajada.
    expect(de([tramo([1, 2], [2, 2])])).toEqual([]);
  });

  it('`arriba` cae en el filo: en el lado de casilla en las rectas, en el cuarto de círculo en la esquina', () => {
    const [s] = de([tramo([2, 1], [2, 2])]);
    expect(s?.arriba).toEqual([2.5, 2]);
    // La esquina SE de la meseta es una convexa en el vértice (4, 2): la recta
    // de centro a centro la corta a 0,354 del centro de la casilla alta.
    const [se] = de([tramo([3, 1], [4, 2])]);
    const d = Math.hypot((se?.arriba[0] ?? 0) - 3.5, (se?.arriba[1] ?? 0) - 1.5);
    expect(d).toBeCloseTo(0.5, 6);
  });

  it('con la senda pintada, `arriba` es donde ella cruza el filo, si lo cruza a menos de media casilla', () => {
    const [b] = bajadasDe(
      r.nivel,
      r.W,
      r.suelo,
      r.celdas,
      [tramo([2, 1], [2, 2])],
      [recta([2.8, 1.5], [2.8, 2.5])],
    );
    expect(b?.arriba[0]).toBeCloseTo(2.8, 6);
    expect(b?.arriba[1]).toBeCloseTo(2, 6);
  });

  it('el pie bajo `arriba` y la rampa por donde va la senda', () => {
    const b: Bajada = {
      rumbo: 'e',
      caida: 1,
      material: 'cara-roca',
      arriba: [4, 0.5],
      alto: [3, 0],
      bajo: [4, 0],
    };
    expect(abajoDe(b)).toEqual([4.45, 1.1]);
    // De lado, la rampa sigue la senda en pantalla, que no baja: casi horizontal.
    const [p, q] = rampaDe(b);
    expect(p).toEqual([4, 0.5]);
    expect(q[1]).toBe(0.5);
    expect(q[0]).toBeGreaterThan(4.45);
  });
});

describe('las piezas en su sitio, con el arte del repo', () => {
  const r = deRejilla(['111111', '112221', '112221', '112221', '111111']);
  const convexa = r.celdas.find((c) => c.tipo === 'SE-convexa') as Celda;

  it('una diagonal pone sus dos filos en los de su celda', () => {
    const hoja = hojaDeDiagonal(convexa);
    expect(hoja).toBe('diagonales-roca-se-1');
    for (const m of catalogo.hojas[hoja] ?? []) {
      const s = spriteDeDiagonal(m as ModuloDeDiagonal, hoja, convexa);
      if (m.diagonal?.papel !== 'convexa') continue;
      const [a, b] = filosColocados(m as ModuloDeDiagonal, s);
      const [fa, fb] = filosDe(convexa);
      for (const [p, q] of [
        [a, fa],
        [b, fb],
      ] as const) {
        // A una centésima: los dos filos se registran por separado, a píxel.
        expect(p[0]).toBeCloseTo(q[0], 2);
        expect(p[1]).toBeCloseTo(q[1], 2);
      }
    }
  });

  it('en caída 3 va la pieza de 2, estirada en alto, con sus filos en su sitio', () => {
    const tres: Celda = { ...convexa, caida: 3 };
    expect(hojaDeDiagonal(tres)).toBe('diagonales-roca-se-2');
    // La de 2 aún no está pedida: se prueba la cuenta con la de 1 en su lugar,
    // que en caída 3 se estira 3/2 en alto, como la de 2.
    const m = (catalogo.hojas['diagonales-roca-se-1'] ?? []).find(
      (k) => k.diagonal?.papel === 'convexa',
    ) as ModuloDeDiagonal;
    const s = spriteDeDiagonal(m, 'diagonales-roca-se-1', tres);
    expect(s.ancho).toBeDefined();
    expect(s.alto / (s.ancho as number)).toBeCloseTo((1.5 * m.nh) / m.nw, 6);
    // Estirada en alto, la media casilla que separa sus filos en y crece a
    // 0,75: no caen los dos en su sitio. Van centrados (la media de los dos en
    // la de la celda), cada uno a un octavo de casilla; en x, en su sitio.
    const [a, b] = filosColocados(m, s);
    const [fa, fb] = filosDe(convexa);
    expect(a[0]).toBeCloseTo(fa[0], 2);
    expect(b[0]).toBeCloseTo(fb[0], 2);
    expect((a[1] + b[1]) / 2).toBeCloseTo((fa[1] + fb[1]) / 2, 2);
    expect(Math.abs(a[1] - fa[1])).toBeLessThan(0.13);
  });

  it('`catalogoValidado` lanza con una diagonal o una bajada sin juntas, y con juntas donde no van', () => {
    const crudo = catalogo as unknown as CatalogoEnBruto;
    const sin = (hoja: string, campo: 'diagonal' | 'bajada'): CatalogoEnBruto => ({
      ...crudo,
      hojas: {
        ...crudo.hojas,
        [hoja]: (crudo.hojas[hoja] ?? []).map((m) => {
          const { [campo]: _, ...resto } = m;
          return resto as (typeof crudo.hojas)[string][number];
        }),
      },
    });
    expect(() => catalogoValidado(sin('diagonales-roca-se-1', 'diagonal'))).toThrow(
      /«diagonales-roca-se-1» no trae sus juntas de diagonal: derívalas \(pnpm taller derivar-relieve\)/,
    );
    expect(() => catalogoValidado(sin('bajadas-roca-1', 'bajada'))).toThrow(
      /«bajadas-roca-1» no trae sus juntas de bajada/,
    );
    const juntas = crudo.hojas['diagonales-roca-se-1']?.[0]?.diagonal ?? {
      filo: [],
      papel: '',
    };
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: {
          ...crudo.hojas,
          'paredes-roca': (crudo.hojas['paredes-roca'] ?? []).map((m) => ({
            ...m,
            diagonal: juntas,
          })),
        },
      }),
    ).toThrow(/no es una diagonal/);
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: {
          ...crudo.hojas,
          'diagonales-roca-se-1': (crudo.hojas['diagonales-roca-se-1'] ?? []).map((m) => ({
            ...m,
            diagonal: { filo: [[1, 2]], papel: 'convexa' },
          })),
        },
      }),
    ).toThrow(/dos pares/);
  });
});

describe('los guardias del relieve por celdas, mordiendo', () => {
  const r = deRejilla(['111111', '112221', '112221', '112221', '111111']);
  const { caidas: rel } = r;
  const sinRazon = () => null;
  /** Las piezas de la meseta, como las pondría `componer`: diagonales y laderas con marcador o arte. */
  const diagonales = rel.diagonales.map((c) => {
    const hoja = hojaDeDiagonal(c);
    const papel = c.tipo.endsWith('convexa') ? 'convexa' : 'concava';
    const m = (catalogo.hojas[hoja] ?? []).find((k) => k.diagonal?.papel === papel);
    return m === undefined
      ? marcadorDeDiagonal(c)
      : spriteDeDiagonal(m as ModuloDeDiagonal, hoja, c);
  });
  const soloDiagonales = { vistas: rel.diagonales, barrancos: [] };

  it('cada diagonal con su pieza no cuenta; sin ella, o con dos, sí', () => {
    expect(celdasMalCubiertas(diagonales, soloDiagonales, catalogo, sinRazon)).toEqual([]);
    expect(
      celdasMalCubiertas(diagonales.slice(1), soloDiagonales, catalogo, sinRazon),
    ).toHaveLength(1);
    // Vacía con una razón declarada, no.
    expect(
      celdasMalCubiertas(diagonales.slice(1), soloDiagonales, catalogo, () => 'reserva'),
    ).toEqual([]);
    expect(
      celdasMalCubiertas(
        [...diagonales, diagonales[0] as Sprite],
        soloDiagonales,
        catalogo,
        sinRazon,
      ),
    ).toEqual([expect.stringMatching(/2 piezas/)]);
  });

  it('una diagonal corrida, o el marcador fuera de su sitio, queda fuera de toda celda', () => {
    const corrida = { ...(diagonales[0] as Sprite), x: (diagonales[0] as Sprite).x + 0.3 };
    expect(
      celdasMalCubiertas(
        [corrida, ...diagonales.slice(1)],
        soloDiagonales,
        catalogo,
        () => 'reserva',
      ),
    ).toEqual([expect.stringMatching(/fuera de toda celda/)]);
    const c = rel.diagonales[0] as Celda;
    const marcador = { ...marcadorDeDiagonal(c), y: marcadorDeDiagonal(c).y + 0.2 };
    expect(
      celdasMalCubiertas([marcador], { vistas: [c], barrancos: [] }, catalogo, sinRazon),
    ).toEqual([expect.stringMatching(/fuera de toda celda/), expect.stringMatching(/sin pieza/)]);
  });

  it('una caída al sur sin frontal que cubra el centro de su celda cuenta', () => {
    const s = rel.vistas.filter((c) => c.tipo === 'S');
    expect(celdasMalCubiertas([], { vistas: s, barrancos: [] }, catalogo, sinRazon)).toHaveLength(
      2,
    );
  });

  const b: Bajada = {
    rumbo: 's',
    caida: 1,
    material: 'cara-roca',
    arriba: [3.5, 4],
    alto: [3, 3],
    bajo: [3, 4],
  };
  const m = (catalogo.hojas[hojaDeBajada(b)] ?? []).find(
    (k) => k.bajada?.rumbo === 's',
  ) as ModuloDeBajada;
  const bajada = spriteDeBajada(m, hojaDeBajada(b), b, 4.72);

  it('una bajada con su pieza, o su marcador, no cuenta; sin ella, sí', () => {
    expect(bajadasSinPieza([bajada], [b], catalogo)).toEqual([]);
    expect(bajadasSinPieza([marcadorDeBajada(b, 4.72)], [b], catalogo)).toEqual([]);
    expect(bajadasSinPieza([], [b], catalogo)).toHaveLength(1);
    expect(bajadasSinPieza([{ ...bajada, x: bajada.x + 0.2 }], [b], catalogo)).toHaveLength(1);
  });

  it('lo que se pinta después de la bajada sobre su camino la tapa; lo de antes, otra bajada o lo plano, no', () => {
    const pared = (y: number): Sprite => ({
      ...marcadorDeDiagonal(rel.diagonales[0] as Celda),
      x: 3.5,
      y,
      alto: 1.5,
    });
    expect(bajadasTapadas([bajada, pared(4.2)], [b], catalogo)).toEqual([]);
    expect(bajadasTapadas([bajada, pared(5.5)], [b], catalogo)).toEqual([
      expect.stringMatching(/la tapa pared/),
    ]);
    expect(bajadasTapadas([bajada, marcadorDeBajada(b, 5.5)], [b], catalogo)).toEqual([]);
    const mata: Sprite = { ...pared(5.5), clase: 'cubierta', alto: 0.4 };
    expect(bajadasTapadas([bajada, mata], [b], catalogo)).toEqual([]);
  });
});
