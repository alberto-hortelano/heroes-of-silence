/**
 * Las rampas (#225, §35): donde un camino baja de frente a la cámara por un
 * borde recto y hay su arte, la pared se abre —el cuerpo en el hueco y un
 * costado a cada lado— en vez de llevar la bajada encima. Con rejillas a mano
 * (`rampasDeFrente`), con el arte del repo (`spriteDeRampa`, el guardia
 * `rampasSinSusPiezas`) y en un mapa real (s12, la de roca de (12, 8)).
 */
import { describe, expect, it } from 'vitest';
import { type CatalogoEnBruto, catalogoValidado } from '../src/client/render/escenario/catalogo.js';
import {
  type Bajada,
  celdas,
  celdasDeLaRampa,
  claveDeCelda,
  enSuRampa,
  esVisto,
  type Rampa,
  rampasDeFrente,
} from '../src/client/render/escenario/celdas.js';
import {
  componer,
  hojaDeRampa,
  piezasDeRampa,
  rampasSinSusPiezas,
  type Sprite,
  spriteDeRampa,
} from '../src/client/render/escenario/colocar.js';
import { newGame } from '../src/core/state/setup.js';
import { catalogoDelDisco } from './helpers.js';

const catalogo = catalogoDelDisco();

/** Las paredes que se ven de una rejilla de niveles escrita a mano, una cifra por casilla. */
function deRejilla(filas: readonly string[]) {
  const W = (filas[0] as string).length;
  const H = filas.length;
  const nivel = filas.flatMap((f) => [...f].map(Number));
  const suelo = Array.from({ length: W * H }, () => 'grass' as const);
  return { W, nivel, vistas: celdas(nivel, W, H, suelo).filter((c) => esVisto(c.tipo)) };
}

/** Un tramo de camino de `(x, y)` a `(x, y + 1)`. */
const bajando = (x: number, y: number) =>
  [
    { x, y },
    { x, y: y + 1 },
  ] as const;
const conArte = () => true;

describe('las rampas: dónde se abre la pared (#225)', () => {
  // Una meseta de 2 con el borde recto en la fila 1 de la columna 0 a la 8.
  const recta = deRejilla(['222222222', '222222222', '111111111', '111111111']);

  it('un camino que baja de frente por un borde recto de cinco casillas abre una rampa', () => {
    const rs = rampasDeFrente(recta.nivel, recta.W, recta.vistas, [bajando(4, 1)], conArte);
    expect(rs).toEqual([{ x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' }]);
    // Sustituye las paredes S de los vértices 3 a 6 de su filo.
    expect(celdasDeLaRampa(rs[0] as Rampa)).toEqual(['3,2,S,2', '4,2,S,2', '5,2,S,2', '6,2,S,2']);
    for (const k of celdasDeLaRampa(rs[0] as Rampa))
      expect(recta.vistas.map(claveDeCelda)).toContain(k);
    // El tramo al revés (de lo bajo a lo alto) es el mismo camino.
    expect(
      rampasDeFrente(
        recta.nivel,
        recta.W,
        recta.vistas,
        [
          [
            { x: 4, y: 2 },
            { x: 4, y: 1 },
          ],
        ],
        conArte,
      ),
    ).toHaveLength(1);
  });

  it('sin cinco casillas rectas, sin arte, con el pie en el agua o de espaldas: la bajada de siempre', () => {
    // Junto al borde del mapa no hay vértice de fuera que mirar.
    expect(rampasDeFrente(recta.nivel, recta.W, recta.vistas, [bajando(1, 1)], conArte)).toEqual(
      [],
    );
    // Un rincón a la derecha del hueco (s55, (30, 15)): la casilla (6, 2) es alta.
    const rincon = deRejilla(['222222222', '222222222', '111111222', '111111111']);
    expect(rampasDeFrente(rincon.nivel, rincon.W, rincon.vistas, [bajando(4, 1)], conArte)).toEqual(
      [],
    );
    expect(
      rampasDeFrente(recta.nivel, recta.W, recta.vistas, [bajando(4, 1)], () => false),
    ).toEqual([]);
    expect(
      rampasDeFrente(recta.nivel, recta.W, recta.vistas, [bajando(4, 1)], conArte, () => false),
    ).toEqual([]);
    // Lo alto al sur: baja hacia el norte, de espaldas.
    const espaldas = deRejilla(['111111111', '111111111', '222222222', '222222222']);
    expect(
      rampasDeFrente(espaldas.nivel, espaldas.W, espaldas.vistas, [bajando(4, 1)], conArte),
    ).toEqual([]);
    // Dos caídas en el mismo filo (de 3 a 1) no son una pared de caída 1: tampoco el piloto.
    const dos = deRejilla(['333333333', '333333333', '111111111', '111111111']);
    expect(
      rampasDeFrente(dos.nivel, dos.W, dos.vistas, [bajando(4, 1)], (_m, c) => c === 1),
    ).toEqual([]);
  });

  it('dos rampas que se pisarían: va la primera', () => {
    const ancha = deRejilla(['22222222222', '22222222222', '11111111111', '11111111111']);
    const rs = rampasDeFrente(
      ancha.nivel,
      ancha.W,
      ancha.vistas,
      [bajando(3, 1), bajando(5, 1), bajando(7, 1)],
      conArte,
    );
    expect(rs.map((r) => r.x)).toEqual([3, 7]);
  });

  it('la bajada de una rampa baja al sur por el medio de su hueco y no lleva pieza de bajadas', () => {
    const b: Bajada = {
      rumbo: 'so',
      caida: 1,
      material: 'cara-roca',
      arriba: [4.3, 2],
      alto: [4, 1],
      bajo: [4, 2],
    };
    const r: Rampa = { x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' };
    expect(enSuRampa(b, [r])).toEqual({ ...b, rumbo: 's', arriba: [4.5, 2], deUnaRampa: true });
    expect(enSuRampa(b, [{ ...r, x: 5 }])).toBe(b);
  });
});

describe('las piezas de la rampa, con el arte del repo', () => {
  const r: Rampa = { x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' };
  const hoja = hojaDeRampa(r);
  const piezas = piezasDeRampa(catalogo, hoja);

  it('el piloto de roca y arenisca de caída 1 está entero; lo demás no tiene rampa', () => {
    expect(hoja).toBe('rampa-roca-1');
    expect(piezas).not.toBeNull();
    expect(piezasDeRampa(catalogo, 'rampa-arenisca-1')).not.toBeNull();
    expect(piezasDeRampa(catalogo, 'rampa-basalto-1')).toBeNull();
    expect(piezasDeRampa(catalogo, 'rampa-roca-2')).toBeNull();
  });

  const puestas = (): Sprite[] =>
    piezas === null
      ? []
      : (['costado-izq', 'cuerpo', 'costado-der'] as const).map((p) =>
          spriteDeRampa(piezas[p], hoja, r),
        );

  it('cada pieza en su tramo del filo, y el guardia no las cuenta', () => {
    expect(rampasSinSusPiezas(puestas(), [r], catalogo)).toEqual([]);
  });

  it('el guardia muerde: sin un costado, corrido o con una frontal sobre el hueco', () => {
    const [izq, cuerpo, der] = puestas() as [Sprite, Sprite, Sprite];
    expect(rampasSinSusPiezas([cuerpo, der], [r], catalogo)).toEqual([
      'rampa en 4,1: 0 piezas costado-izq en su sitio',
    ]);
    expect(rampasSinSusPiezas([izq, cuerpo, { ...der, x: der.x + 0.3 }], [r], catalogo)).toEqual([
      'rampa en 4,1: 0 piezas costado-der en su sitio',
    ]);
    expect(rampasSinSusPiezas([izq, cuerpo, der, izq], [r], catalogo)).toEqual([
      'rampa en 4,1: 2 piezas costado-izq en su sitio',
    ]);
    const frontal = (catalogo.hojas['paredes-roca'] ?? [])[0];
    if (frontal === undefined) throw new Error('sin frontales de roca');
    const tapa: Sprite = {
      src: frontal.src,
      nw: frontal.nw,
      nh: frontal.nh,
      ax: frontal.ax,
      ay: frontal.ay,
      x: 4.5,
      y: 2.65,
      alto: 1,
      clase: 'pared',
      color: '#4c463e',
      capa: 0,
      sombra: true,
    };
    expect(rampasSinSusPiezas([izq, cuerpo, der, tapa], [r], catalogo)).toEqual([
      expect.stringMatching(/^rampa en 4,1: la frontal .*paredes-roca.* tapa el hueco$/),
    ]);
  });

  it('`catalogoValidado` lanza con una pieza de rampa sin juntas, y con juntas donde no van', () => {
    const crudo = catalogo as unknown as CatalogoEnBruto;
    const ms = crudo.hojas[hoja] ?? [];
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: { ...crudo.hojas, [hoja]: ms.map(({ rampa: _, ...m }) => m) },
      }),
    ).toThrow(/«rampa-roca-1» no trae sus juntas de rampa: derívalas/);
    const juntas = ms[0]?.rampa;
    if (juntas === undefined) throw new Error('la rampa de roca sin juntas');
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: {
          ...crudo.hojas,
          'paredes-roca': (crudo.hojas['paredes-roca'] ?? []).map((m) => ({
            ...m,
            rampa: juntas,
          })),
        },
      }),
    ).toThrow(/no es una rampa/);
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: {
          ...crudo.hojas,
          [hoja]: ms.map((m) => ({ ...m, rampa: { filo: [[0, 0]], pieza: 'cuerpo', rumbo: 's' } })),
        },
      }),
    ).toThrow(/dos pares/);
  });
});

describe('las rampas en un mapa real: s12, (12, 8)', () => {
  const map = newGame({ seed: 12 }).map;
  const e = componer(map, 12, catalogo);
  const r = e.relieve.rampas.find((k) => k.x === 12 && k.y === 8);

  it('se abre la pared: tres piezas, ninguna frontal en el hueco y la bajada sin su pieza', () => {
    expect(r).toBeDefined();
    expect(e.informe.rampasSinSusPiezas).toBe(0);
    expect(rampasSinSusPiezas(e.sprites, e.relieve.rampas, catalogo)).toEqual([]);
    expect(e.sprites.filter((s) => s.src?.includes('/rampa-roca-1/') === true)).toHaveLength(3);
    // Sus paredes no son de la cara: ni se pintan ni piden frontal.
    const fuera = new Set(celdasDeLaRampa(r as Rampa));
    expect(e.relieve.celdas.filter((c) => fuera.has(claveDeCelda(c)))).toEqual([]);
    const b = e.relieve.bajadas.find((k) => k.alto[0] === 12 && k.alto[1] === 8);
    expect(b).toMatchObject({ rumbo: 's', arriba: [12.5, 9], deUnaRampa: true });
    // Sin pieza de bajadas en su filo.
    expect(
      e.sprites.filter(
        (s) => s.src?.includes('/bajadas-') === true && Math.abs(s.x - 12.5) < 0.6 && s.y < 11,
      ),
    ).toEqual([]);
    expect([
      e.informe.celdasMalCubiertas,
      e.informe.bajadasSinPieza,
      e.informe.bajadasTapadas,
      e.informe.bajadasSobreNodo,
      e.informe.rampasDesviadas,
      e.informe.sendaBajoElRelieve,
      e.informe.paredesTapadas,
      e.informe.carasCortadas,
    ]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('sin el arte de la rampa, todo como antes: la bajada encima de la pared entera', () => {
    const sin = {
      ...catalogo,
      hojas: Object.fromEntries(
        Object.entries(catalogo.hojas).filter(([h]) => !h.startsWith('rampa-')),
      ),
    };
    const s = componer(map, 12, sin);
    expect(s.relieve.rampas).toEqual([]);
    expect(s.relieve.bajadas.some((b) => b.deUnaRampa === true)).toBe(false);
    expect(s.informe.rampasSinSusPiezas).toBe(0);
    expect(s.relieve.celdas.length).toBeGreaterThan(e.relieve.celdas.length);
  });
});
