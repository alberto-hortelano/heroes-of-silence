/**
 * Las rampas (#225, §35): donde un camino baja de frente a la cámara por un
 * borde recto y hay su arte, la pared se abre —el cuerpo en el hueco y un
 * costado a cada lado— en vez de llevar la bajada encima. Con rejillas a mano
 * (`rampasDeFrente`), con el arte del repo (`spriteDeRampa`, el guardia
 * `rampasSinSusPiezas`) y en un mapa real (s106, la de roca de (34, 19); era s62 (4, 7)
 * antes de las fronteras onduladas de #229, y s12 (12, 8) en 34×34, antes de #226).
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
    expect(rs).toEqual([{ forma: 'recta', x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' }]);
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
      rampasDeFrente(dos.nivel, dos.W, dos.vistas, [bajando(4, 1)], (_f, _m, c) => c === 1),
    ).toEqual([]);
  });

  it('la muesca de una de hondo (la casilla baja entre dos altas) abre una rampa de muesca (§36)', () => {
    // El hueco en (4, 2), entre (3, 2) y (5, 2), y lo bajo delante.
    const muesca = deRejilla(['222222222', '222222222', '222212222', '111111111', '111111111']);
    const rs = rampasDeFrente(muesca.nivel, muesca.W, muesca.vistas, [bajando(4, 1)], conArte);
    expect(rs).toEqual([
      { forma: 'muesca', x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' },
    ]);
    // Sustituye las cuatro diagonales: los rincones del fondo y las esquinas de delante.
    expect(celdasDeLaRampa(rs[0] as Rampa)).toEqual([
      '4,2,SE-concava,2',
      '5,2,SO-concava,2',
      '4,3,SE-convexa,2',
      '5,3,SO-convexa,2',
    ]);
    for (const k of celdasDeLaRampa(rs[0] as Rampa))
      expect(muesca.vistas.map(claveDeCelda)).toContain(k);
    // Sin el arte de la muesca (sí el de la recta), la bajada de siempre.
    expect(
      rampasDeFrente(muesca.nivel, muesca.W, muesca.vistas, [bajando(4, 1)], (f) => f === 'recta'),
    ).toEqual([]);
    // Con un lado que sigue al sur (una ladera debajo de la esquina): no es esta forma.
    const sigue = deRejilla(['222222222', '222222222', '222212222', '111211111', '111111111']);
    expect(rampasDeFrente(sigue.nivel, sigue.W, sigue.vistas, [bajando(4, 1)], conArte)).toEqual(
      [],
    );
    // Con el pie en el agua, tampoco.
    expect(
      rampasDeFrente(muesca.nivel, muesca.W, muesca.vistas, [bajando(4, 1)], conArte, () => false),
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
    const r: Rampa = { forma: 'recta', x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' };
    expect(enSuRampa(b, [r])).toEqual({ ...b, rumbo: 's', arriba: [4.5, 2], deUnaRampa: true });
    expect(enSuRampa(b, [{ ...r, x: 5 }])).toBe(b);
  });
});

describe('las piezas de la rampa, con el arte del repo', () => {
  const r: Rampa = { forma: 'recta', x: 4, y: 1, caida: 1, desde: 2, material: 'cara-roca' };
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
      : (['costado-izq', 'cuerpo', 'costado-der'] as const).map((p) => {
          const m = piezas[p];
          if (m === undefined) throw new Error(`sin la pieza ${p}`);
          return spriteDeRampa(m, hoja, r);
        });

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
    // La muesca (§36) lleva su pieza, no las de la recta.
    const deMuesca = crudo.hojas['rampa-muesca-roca-1'] ?? [];
    expect(deMuesca).toHaveLength(1);
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: {
          ...crudo.hojas,
          'rampa-muesca-roca-1': deMuesca.map((m) => ({
            ...m,
            rampa: { ...(m.rampa as NonNullable<typeof m.rampa>), pieza: 'cuerpo' },
          })),
        },
      }),
    ).toThrow(/su pieza es una de muesca \(rampa muesca\), y dice «cuerpo»/);
  });
});

// Desde #226 (el mapa de 42×42) la s12 es otro mapa y no lleva rampa. Con
// arte salen 1 en 1-200 y 19 en 1-1000 (eran 5 y 27 en 34×34; 09-10-2026),
// todas de caída 1. Con las fronteras onduladas (#229, 09-10-2026), 2 en
// 1-200 (s106 (34, 19) y s139 (32, 32), las dos de roca). Con los ríos (#144,
// 16-10-2026), 3 en 1-300 (s117 (35, 21), de roca; s164 y s277, de arenisca).
// Con el río continuo (#144), en 1-120 solo s75 (23, 17), de roca. Con el
// recinto de las ciudades del núcleo (vuelta 3, 21-10-2026), en 1-200 solo s126
// (32, 34), de roca (y 6 muescas).
const SEMILLA = 126;
const [RX, RY] = [32, 34];

describe(`las rampas en un mapa real: s${SEMILLA}, (${RX}, ${RY})`, () => {
  const map = newGame({ seed: SEMILLA }).map;
  const e = componer(map, SEMILLA, catalogo);
  const r = e.relieve.rampas.find((k) => k.x === RX && k.y === RY);

  it('se abre la pared: tres piezas, ninguna frontal en el hueco y la bajada sin su pieza', () => {
    expect(r).toBeDefined();
    expect(e.informe.rampasSinSusPiezas).toBe(0);
    expect(rampasSinSusPiezas(e.sprites, e.relieve.rampas, catalogo)).toEqual([]);
    expect(e.sprites.filter((s) => s.src?.includes('/rampa-roca-1/') === true)).toHaveLength(3);
    // Sus paredes no son de la cara: ni se pintan ni piden frontal.
    const fuera = new Set(celdasDeLaRampa(r as Rampa));
    expect(e.relieve.celdas.filter((c) => fuera.has(claveDeCelda(c)))).toEqual([]);
    const b = e.relieve.bajadas.find((k) => k.alto[0] === RX && k.alto[1] === RY);
    expect(b).toMatchObject({ rumbo: 's', arriba: [RX + 0.5, RY + 1], deUnaRampa: true });
    // Sin pieza de bajadas en su filo.
    expect(
      e.sprites.filter(
        (s) =>
          s.src?.includes('/bajadas-') === true && Math.abs(s.x - (RX + 0.5)) < 0.6 && s.y < RY + 3,
      ),
    ).toEqual([]);
    expect([
      e.informe.celdasMalCubiertas,
      e.informe.bajadasSinPieza,
      e.informe.bajadasTapadas,
      e.informe.bajadasSobreNodo,
      e.informe.rampasDesviadas,
      e.informe.paredesTapadas,
      e.informe.carasCortadas,
    ]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // La senda bajo el relieve no es 0 en todo mapa (techo de media 5): la
    // rampa no añade ninguno.
    const sinRampas = {
      ...catalogo,
      hojas: Object.fromEntries(
        Object.entries(catalogo.hojas).filter(([h]) => !h.startsWith('rampa-')),
      ),
    };
    expect(e.informe.sendaBajoElRelieve).toBeLessThanOrEqual(
      componer(map, SEMILLA, sinRampas).informe.sendaBajoElRelieve,
    );
  });

  it('sin el arte de la rampa, todo como antes: la bajada encima de la pared entera', () => {
    const sin = {
      ...catalogo,
      hojas: Object.fromEntries(
        Object.entries(catalogo.hojas).filter(([h]) => !h.startsWith('rampa-')),
      ),
    };
    const s = componer(map, SEMILLA, sin);
    expect(s.relieve.rampas).toEqual([]);
    expect(s.relieve.bajadas.some((b) => b.deUnaRampa === true)).toBe(false);
    expect(s.informe.rampasSinSusPiezas).toBe(0);
    expect(s.relieve.celdas.length).toBeGreaterThan(e.relieve.celdas.length);
  });
});

// Con la ciudad amurallada (20-10-2026) el caso es s11 (32, 9), de roca, la
// única muesca de su mapa (4 en 1-120: s11, s78 y s98 de roca, s97 de
// arenisca): dentro de un recinto no hay paredes, y la muesca de una ciudad
// que entra por detrás ya no sale. Con el río continuo (#144) era s18 (39, 31),
// de roca, la única muesca de su mapa (11 en 1-120: s9, s30, s60 y s110, de
// arenisca; s67 y s78, dos; s18, s33 y s98, de roca y solas en su mapa).
// Con el río de una casilla (#144, paso 2) el caso era s41 (20, 31), de roca,
// la única muesca de su mapa (5 en 1-80: s17, de arenisca; s57, dos; s41 y s62,
// solas en su mapa). Con los ríos (#144, 16-10-2026) era s10 (14, 14), de roca, la única
// muesca de su mapa (14 en 1-300; de roca y solas en su mapa, s10, s41, s62,
// s181, s257, s259, s270 y s300). Con las dos puertas de la mina (#230,
// 09-10-2026) era s134 (32, 12), de
// roca, la única muesca de su mapa (6 muescas en 1-200, todas de roca y caída 1,
// una por mapa: s111, s131, s134, s153, s156 y s174). Era s126 (31, 33) desde las
// fronteras onduladas (#229; 11 muescas en 1-200, 3 de arenisca; eran 27), cuando
// en s88, s134 y s153 la pieza de la muesca quitaba caras cortadas (1-2 → 0), y el
// test pide las mismas con y sin ella. Era s16 (30, 11) desde #226 (mapa de
// 42×42) y s3 (4, 20) en 34×34.
// Con las puertas de las ciudades (fase 2, 21-10-2026), s78 (23, 9), de roca y
// la única muesca de 1-120 (era s11 (32, 9) desde el recinto del núcleo).
const [MS, MX, MY] = [78, 23, 9];
describe(`la rampa de muesca en un mapa real: s${MS}, (${MX}, ${MY}) (§36)`, () => {
  const map = newGame({ seed: MS }).map;
  const e = componer(map, MS, catalogo);
  const r = e.relieve.rampas.find((k) => k.x === MX && k.y === MY);
  const sinMuesca = {
    ...catalogo,
    hojas: Object.fromEntries(
      Object.entries(catalogo.hojas).filter(([h]) => !h.startsWith('rampa-muesca-')),
    ),
  };

  /** La pieza de la muesca de (MX, MY). */
  const suya = (s: Sprite) =>
    s.src?.includes('/rampa-muesca-roca-1/') === true && Math.abs(s.x - (MX + 0.5)) < 1.5;

  it('una pieza en la muesca, sin sus cuatro diagonales ni la bajada de siempre', () => {
    expect(r).toMatchObject({ forma: 'muesca', material: 'cara-roca', caida: 1 });
    expect(e.informe.rampasSinSusPiezas).toBe(0);
    // La suya, y la única del mapa.
    expect(e.sprites.filter(suya)).toHaveLength(1);
    expect(e.relieve.rampas.filter((k) => k.forma === 'muesca')).toHaveLength(1);
    const fuera = new Set(celdasDeLaRampa(r as Rampa));
    expect(fuera.size).toBe(4);
    expect(e.relieve.celdas.filter((c) => fuera.has(claveDeCelda(c)))).toEqual([]);
    const b = e.relieve.bajadas.find((k) => k.alto[0] === MX && k.alto[1] === MY);
    expect(b).toMatchObject({ rumbo: 's', arriba: [MX + 0.5, MY + 1], deUnaRampa: true });
    expect(
      e.sprites.filter(
        (s) =>
          /\/(bajadas|diagonales)-/.test(s.src ?? '') &&
          Math.abs(s.x - (MX + 0.5)) < 0.8 &&
          s.y > MY + 0.5 &&
          s.y < MY + 3,
      ),
    ).toEqual([]);
    expect([
      e.informe.celdasMalCubiertas,
      e.informe.bajadasSinPieza,
      e.informe.bajadasTapadas,
      e.informe.bajadasSobreNodo,
      e.informe.rampasDesviadas,
      e.informe.paredesTapadas,
    ]).toEqual([0, 0, 0, 0, 0, 0]);
    // Las caras cortadas y la senda bajo el relieve, como sin el arte de la
    // muesca (lo que haya en otro sitio, con y sin ella).
    const s = componer(map, MS, sinMuesca);
    expect(e.informe.carasCortadas).toBe(s.informe.carasCortadas);
    expect(e.informe.sendaBajoElRelieve).toBeLessThanOrEqual(s.informe.sendaBajoElRelieve);
  });

  it('el guardia muerde: la pieza corrida, o una diagonal sobre el hueco', () => {
    const i = e.sprites.findIndex(suya);
    const pieza = e.sprites[i] as Sprite;
    const sin = e.sprites.filter((_, k) => k !== i);
    expect(
      rampasSinSusPiezas([...sin, { ...pieza, x: pieza.x + 0.3 }], [r as Rampa], catalogo),
    ).toEqual([`rampa en ${MX},${MY}: 0 piezas muesca en su sitio`]);
    const diagonal = (catalogo.hojas['diagonales-roca-se-1'] ?? [])[0];
    if (diagonal === undefined) throw new Error('sin diagonales de roca');
    const tapa: Sprite = {
      src: diagonal.src,
      nw: diagonal.nw,
      nh: diagonal.nh,
      ax: diagonal.ax,
      ay: diagonal.ay,
      x: MX + 0.5,
      y: MY + 1.9,
      alto: 1,
      clase: 'pared',
      color: '#4c463e',
      capa: 0,
      sombra: true,
    };
    expect(rampasSinSusPiezas([...e.sprites, tapa], [r as Rampa], catalogo)).toEqual([
      expect.stringMatching(
        new RegExp(`^rampa en ${MX},${MY}: la pieza .*diagonales-roca-se-1.* tapa el hueco$`),
      ),
    ]);
  });

  it('sin el arte de la muesca, las cuatro diagonales y la bajada encima, como antes', () => {
    const s = componer(map, MS, sinMuesca);
    expect(s.relieve.rampas.some((k) => k.forma === 'muesca')).toBe(false);
    expect(s.relieve.bajadas.find((k) => k.alto[0] === MX && k.alto[1] === MY)?.deUnaRampa).toBe(
      undefined,
    );
    expect(s.informe.rampasSinSusPiezas).toBe(0);
    // Las diagonales de fuera de las muescas, las mismas con su arte y sin él:
    // las cuatro que sustituye cada una gastan su tirada igual.
    const muescas = e.relieve.rampas.filter((k) => k.forma === 'muesca');
    const diagonales = (l: readonly Sprite[]) =>
      l
        .filter((k) => k.src?.includes('/diagonales-') === true)
        .filter((k) =>
          muescas.every((m) => Math.abs(k.x - (m.x + 0.5)) > 1.2 || k.y < m.y || k.y > m.y + 3.5),
        )
        .map((k) => `${k.src} ${k.x.toFixed(2)},${k.y.toFixed(2)}`);
    expect(diagonales(e.sprites)).toEqual(diagonales(s.sprites));
  });
});
