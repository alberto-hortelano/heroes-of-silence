/**
 * Las laderas (#156): las caídas al este y al oeste llevan una ladera de su
 * lado (§20), encadenada de norte a sur con sus remates, y una esquina donde
 * giran hacia la cámara. Aquí, con rejillas, sendas y sprites a mano y el arte
 * del repo; en mapas reales, en `taller-escenario.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MapaDeEscena } from '../src/client/render/escenario/analizar.js';
import {
  type Catalogo,
  type CatalogoEnBruto,
  catalogoValidado,
  type ModuloDeLadera,
} from '../src/client/render/escenario/catalogo.js';
import {
  colocarLadera,
  componer,
  hojaDeLadera,
  indiceDeLaderas,
  juegoDeLadera,
  juntasColocadas,
  laderasEnfrentadas,
  laderasMalCubiertas,
  materialDeCara,
  modulosDeLadera,
  type PiezaDeLadera,
  paredesSobreRampa,
  pasilloDeLaPared,
  piezasDeLadera,
  rematesDeLadera,
  SOLAPE_DE_ESQUINA,
  type Sprite,
  tramoDeFrontal,
} from '../src/client/render/escenario/colocar.js';
import { azarDe } from '../src/client/render/escenario/esparcir.js';
import {
  ALTO_DE_NIVEL,
  bordeDeLadera,
  caidas,
  esquinas,
  FRONTAL_DE_ESQUINA,
  type Ladera,
  pieDeLadera,
  rampas,
  TALUD_DE_LADERA,
  topesDeCara,
} from '../src/client/render/escenario/relieve.js';
import type { Suelo } from '../src/core/map/terrain.js';
import { mascaraDeGuia, registrarLadera } from '../tools/taller/derivar.js';
import {
  encargosDeLaderas,
  type GeometriaDeLadera,
  guiaDeHoja,
  PIEZAS,
  papelDe,
} from '../tools/taller/laderas.js';
import { catalogoDelDisco, recta, sha256 } from './helpers.js';

/** Las caídas de una rejilla de niveles escrita a mano, una cifra por casilla. */
function deRejilla(filas: readonly string[], suelo: Suelo = 'grass') {
  const W = (filas[0] as string).length;
  const H = filas.length;
  const nivel = filas.flatMap((f) => [...f].map(Number));
  return caidas(
    nivel,
    W,
    H,
    Array.from({ length: W * H }, () => suelo),
  );
}

const cerca = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const catalogo = catalogoDelDisco();
const juegoDe = (hoja: string) => juegoDeLadera(hoja, catalogo.hojas[hoja] ?? []);

/** El sprite del módulo `m` desde la casilla `y` de `l`, como lo pone `componer`. */
const sprite = (m: ModuloDeLadera, l: Ladera, y: number): Sprite => ({
  src: m.src,
  nw: m.nw,
  nh: m.nh,
  ax: m.ax,
  ay: m.ay,
  ...colocarLadera(m, l, y),
  clase: 'pared',
  color: '#4c463e',
  capa: 0,
  sombra: true,
});

describe('las laderas salen del relieve', () => {
  // Una meseta de 3 × 4 casillas (x 2-4, y 1-4) un nivel por encima del resto.
  const meseta = ['1111111', '1122211', '1122211', '1122211', '1122211', '1111111'];

  it('una meseta de 3 × 4 da dos laderas de 4, una por lado, con su caída y su material', () => {
    expect(deRejilla(meseta).laderas).toEqual([
      { x: 4, y0: 1, y1: 4, lado: 'este', caida: 1, material: 'cara-roca' },
      { x: 2, y0: 1, y1: 4, lado: 'oeste', caida: 1, material: 'cara-roca' },
    ]);
    expect(deRejilla(meseta, 'sand').laderas.map((l) => l.material)).toEqual([
      'cara-arenisca',
      'cara-arenisca',
    ]);
  });

  it('los cantos son las casillas de las laderas, fila a fila y el este antes que el oeste', () => {
    // El azar de los peñascos del canto va en este orden: cambiarlo cambia el mapa.
    expect(deRejilla(['1111', '1221', '1221', '1111']).cantos).toEqual([
      [1, 1, 'oeste'],
      [2, 1, 'este'],
      [1, 2, 'oeste'],
      [2, 2, 'este'],
    ]);
    expect(deRejilla(['111', '121', '111']).cantos).toEqual([
      [1, 1, 'este'],
      [1, 1, 'oeste'],
    ]);
  });

  it('un barranco de una casilla no lleva ninguna de sus dos laderas, pero sus cantos siguen', () => {
    // La columna 1 baja entre dos altas: la ladera este de x 0 y la oeste de
    // x 2 caían las dos en ella y tapaban su fondo (QA de #156, H1).
    const barranco = deRejilla(['2222', '2122', '2122', '2222']);
    expect(barranco.laderas.filter((l) => l.x <= 2)).toEqual([]);
    expect(barranco.cantos.filter(([x]) => x <= 2)).toEqual([
      [0, 1, 'este'],
      [2, 1, 'oeste'],
      [0, 2, 'este'],
      [2, 2, 'oeste'],
    ]);
  });

  it('la cadena se parte por la fila del barranco; donde lo bajo mide dos casillas, sigue', () => {
    // Filas 1 y 3: barranco de una casilla (x 1). Fila 2: lo bajo son x 1 y x 2.
    const { laderas } = deRejilla(['22222', '21222', '21122', '21222', '22222']);
    expect(laderas).toEqual([
      { x: 0, y0: 2, y1: 2, lado: 'este', caida: 1, material: 'cara-roca' },
      { x: 3, y0: 2, y1: 2, lado: 'oeste', caida: 1, material: 'cara-roca' },
    ]);
  });

  it('la cadena se corta donde cambia la caída', () => {
    const { laderas } = deRejilla(['1111', '1211', '1311', '1311', '1111']);
    expect(laderas.filter((l) => l.lado === 'este').map((l) => [l.y0, l.y1, l.caida])).toEqual([
      [1, 1, 1],
      [2, 3, 2],
    ]);
  });

  it('la meseta lleva esquina a los dos lados de su cara: la ladera acaba donde la cara', () => {
    const { caras, laderas } = deRejilla(meseta);
    const es = esquinas(caras, laderas);
    const k = caras.findIndex((c) => c.y === 4 && c.x0 === 2 && c.x1 === 4);
    expect(es[k]?.este?.lado).toBe('este');
    expect(es[k]?.oeste?.lado).toBe('oeste');
    expect(es.filter((e) => e.este !== undefined || e.oeste !== undefined)).toHaveLength(1);
  });

  it('con otra caída en la cara que en la ladera no hay esquina', () => {
    // La meseta cae 1 al este y 3 al sur.
    const { caras, laderas } = deRejilla(['22222', '23322', '23322', '20000']);
    expect(laderas.find((l) => l.lado === 'este' && l.x === 2)?.caida).toBe(1);
    expect(caras.find((c) => c.y === 2)?.caida).toBe(3);
    expect(esquinas(caras, laderas).every((e) => e.este === undefined)).toBe(true);
  });

  it('una cara de una casilla con ladera a los dos lados lleva una sola esquina, la del este', () => {
    const { caras, laderas } = deRejilla(['11111', '11211', '11211', '11111']);
    const es = esquinas(caras, laderas);
    const k = caras.findIndex((c) => c.x0 === 2 && c.x1 === 2);
    expect(es[k]?.este).toBeDefined();
    expect(es[k]?.oeste).toBeUndefined();
  });

  it('una escalera de tres peldaños da tres esquinas, una por peldaño', () => {
    // Alto todo lo que queda al noreste de la diagonal: cada fila acaba en un
    // peldaño de una casilla que cae al sur y al oeste.
    const { caras, laderas } = deRejilla(['22222', '12222', '11222', '11122', '11112']);
    const conEsquina = esquinas(caras, laderas).flatMap((e) =>
      e.oeste === undefined ? [] : [e.oeste],
    );
    expect(conEsquina.map((l) => [l.x, l.y0, l.y1])).toEqual([
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ]);
    // La última fila no tiene sur: su ladera no lleva esquina.
    expect(laderas.filter((l) => l.lado === 'oeste')).toHaveLength(4);
  });
});

describe('dónde para la frontal de una cara (`topesDeCara`, `tramoDeFrontal`)', () => {
  // Una escalera: cada fila acaba en un peldaño de una casilla que cae al sur y
  // al oeste (caras en y 0-3), y la cara de cada fila sigue en la de abajo.
  const { caras, laderas } = deRejilla(['22222', '12222', '11222', '11122', '11112']);
  const sinNada = caras.map(() => ({ oeste: false, este: false }));
  const conEsquinas = esquinas(caras, laderas).map((e) => ({
    oeste: e.oeste !== undefined,
    este: e.este !== undefined,
  }));
  const fila = (y: number) => caras.findIndex((c) => c.y === y);

  it('sin esquinas puestas, la frontal sigue por el peldaño de al lado', () => {
    expect(topesDeCara(fila(1), caras, sinNada)).toEqual({ oeste: 'sigue', este: 'sigue' });
    expect(topesDeCara(fila(0), caras, sinNada)).toEqual({ oeste: 'suelto', este: 'sigue' });
  });

  it('con ellas, para en la suya, y junto a la del peldaño de al lado ni sigue ni se corre', () => {
    expect(topesDeCara(fila(1), caras, conEsquinas)).toEqual({
      oeste: 'esquina',
      este: 'esquina-vecina',
    });
    expect(topesDeCara(fila(0), caras, conEsquinas)).toEqual({
      oeste: 'suelto',
      este: 'esquina-vecina',
    });
  });

  it('el tramo de la frontal por cada tope', () => {
    const c = { y: 3, x0: 2, x1: 5, caida: 1, material: 'cara-roca' };
    expect(tramoDeFrontal(c, { oeste: 'suelto', este: 'suelto' })).toEqual({
      desde: 2.2,
      hasta: 5.85,
      izq: 1.5,
      der: 6.5,
    });
    const enEsquina = tramoDeFrontal(c, { oeste: 'esquina', este: 'esquina' });
    cerca(enEsquina.desde, 2 + FRONTAL_DE_ESQUINA - SOLAPE_DE_ESQUINA);
    cerca(enEsquina.hasta, 6 - FRONTAL_DE_ESQUINA + SOLAPE_DE_ESQUINA);
    // En su esquina no se corre más allá.
    expect([enEsquina.izq, enEsquina.der]).toEqual([enEsquina.desde, enEsquina.hasta]);
    expect(tramoDeFrontal(c, { oeste: 'esquina-vecina', este: 'sigue' })).toEqual({
      desde: 2.2,
      hasta: 6.5,
      izq: 2.2,
      der: 6.5,
    });
  });
});

describe('lo que baja por una ladera aparta las laderas, sin abrir tajo ni quitar la frontal', () => {
  const l: Ladera = { x: 3, y0: 2, y1: 5, lado: 'este', caida: 1, material: 'cara-roca' };

  it('una senda que cruza el canto de este a oeste entra en `juntoDeLadera`, no en `junto`', () => {
    // En `junto` apartaba también la frontal de la cara de al lado y la dejaba
    // lisa (QA de #156, H2: s19 x27 y5).
    const b = rampas([], [l], [recta([2.5, 3.5], [6.5, 3.5])]);
    expect(b.porCara).toEqual([]);
    expect(b.juntoDeLadera.length).toBeGreaterThan(0);
    expect(b.junto).toEqual([]);
  });

  it('la que corre al pie, sin tocar el filo, no', () => {
    // Dentro de la banda (x de 4 a 4,45) pero lejos del filo, en x = 4.
    expect(rampas([], [l], [recta([4.3, 1], [4.3, 8])]).juntoDeLadera).toEqual([]);
  });

  it('la que pasa junto al filo por debajo de la última casilla, por su pie, no', () => {
    // y = 6,4: dentro de la banda (el pie cuelga hasta 6,6) pero bajo la fila 5.
    expect(rampas([], [l], [recta([2.5, 6.4], [6.5, 6.4])]).juntoDeLadera).toEqual([]);
  });

  it('al oeste, el filo es el borde izquierdo de la casilla alta', () => {
    const o: Ladera = { ...l, lado: 'oeste' };
    expect(rampas([], [o], [recta([1, 3.5], [4.5, 3.5])]).juntoDeLadera.length).toBeGreaterThan(0);
    expect(rampas([], [o], [recta([2.7, 1], [2.7, 8])]).juntoDeLadera).toEqual([]);
  });

  it('el guardia mide la ladera contra lo que baja por una ladera, y la frontal no', () => {
    const juego = juegoDe(hojaDeLadera(l));
    const medio = sprite(juego.medios[0] as ModuloDeLadera, l, 3);
    const frontal: Sprite = { ...medio, src: 'paredes-roca/3.webp' };
    const { junto, juntoDeLadera } = rampas([], [l], [recta([2.5, 3.5], [6.5, 3.5])]);
    const deLadera = modulosDeLadera(catalogo);
    const pisan = paredesSobreRampa([medio, frontal], pasilloDeLaPared(junto), {
      pasillo: pasilloDeLaPared([...junto, ...juntoDeLadera]),
      es: (s) => s.src !== null && deLadera.has(s.src),
    });
    expect(pisan).toEqual([medio]);
  });

  it('una senda que baja por un canto y sigue al pie de una cara no le abre tajo', () => {
    // Encadenadas con la cara, la senda que bajaba por la ladera y seguía por la
    // banda de la cara la abría, y la cara perdía su pared.
    const cara = { y: 3, x0: 4, x1: 7, caida: 1, material: 'cara-roca' };
    const lado: Ladera = { x: 3, y0: 3, y1: 4, lado: 'este', caida: 1, material: 'cara-roca' };
    const b = rampas([cara], [lado], [recta([2.5, 4.3], [8, 4.3])]);
    expect(b.porCara).toEqual([[]]);
  });
});

describe('qué módulos lleva una ladera (§20)', () => {
  const l = (y0: number, y1: number): Ladera => ({
    x: 5,
    y0,
    y1,
    lado: 'este',
    caida: 1,
    material: 'cara-roca',
  });
  const juego = juegoDe('laderas-roca-este-1');
  /** Las casillas que cubre cada pieza, para ver que no hay hueco ni solape. */
  const casillas = (ps: readonly PiezaDeLadera[]) =>
    ps.flatMap((p) => Array.from({ length: p.modulo.ladera.largo }, (_, k) => p.y + k));
  const papeles = (ps: readonly PiezaDeLadera[]) => ps.map((p) => p.modulo.ladera.papel);
  const solo = { inicio: true, fin: true, esquina: false };

  it('inicio al norte, fin al sur y en medio sin repetir el de al lado, sin hueco ni solape', () => {
    for (let semilla = 1; semilla <= 30; semilla++) {
      const ps = piezasDeLadera(l(2, 9), solo, juego, azarDe(semilla));
      expect(casillas(ps)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
      expect(ps[0]?.modulo).toBe(juego.inicio);
      expect(ps.at(-1)?.modulo).toBe(juego.fin);
      for (const [k, p] of ps.entries()) {
        if (k > 0) expect(p.modulo).not.toBe(ps[k - 1]?.modulo);
        if (k > 0 && k < ps.length - 1) expect(['medio', 'largo']).toContain(p.modulo.ladera.papel);
      }
    }
  });

  it('un largo solo entra si le quedan sus casillas antes del remate', () => {
    // Inicio, una casilla libre y fin: ahí no cabe un largo.
    for (let semilla = 1; semilla <= 30; semilla++)
      expect(piezasDeLadera(l(2, 4), solo, juego, azarDe(semilla))[1]?.modulo.ladera.papel).toBe(
        'medio',
      );
    // Con cadenas largas, alguno sale.
    const todas = Array.from({ length: 30 }, (_, k) =>
      papeles(piezasDeLadera(l(0, 9), solo, juego, azarDe(k))),
    ).flat();
    expect(todas).toContain('largo');
  });

  it('la esquina remata el sur en lugar del fin', () => {
    const ps = piezasDeLadera(l(2, 5), { ...solo, esquina: true }, juego, azarDe(4));
    expect(ps[0]?.modulo).toBe(juego.inicio);
    expect(ps.at(-1)).toEqual({ modulo: juego.esquina, y: 5 });
    expect(papeles(ps)).not.toContain('fin');
  });

  it('sin remate donde la cadena sigue (un escalón con la de al lado), con medios hasta la punta', () => {
    const ps = piezasDeLadera(
      l(2, 5),
      { inicio: false, fin: false, esquina: false },
      juego,
      azarDe(2),
    );
    expect(casillas(ps)).toEqual([2, 3, 4, 5]);
    expect(papeles(ps).every((p) => p === 'medio' || p === 'largo')).toBe(true);
  });

  it('con una sola casilla gana la esquina, luego el fin y luego el inicio', () => {
    const una = l(3, 3);
    expect(
      piezasDeLadera(una, { inicio: true, fin: true, esquina: true }, juego, azarDe(1)),
    ).toEqual([{ modulo: juego.esquina, y: 3 }]);
    expect(piezasDeLadera(una, solo, juego, azarDe(1))).toEqual([{ modulo: juego.fin, y: 3 }]);
    expect(
      piezasDeLadera(una, { inicio: true, fin: false, esquina: false }, juego, azarDe(1)),
    ).toEqual([{ modulo: juego.inicio, y: 3 }]);
  });

  it('en un escalón de caída rematan las puntas de la mayor y la menor sigue', () => {
    // La columna 0 cae 2 niveles al este en y 1-2 y 1 nivel en y 3-4.
    const { laderas } = deRejilla(['33333', '31111', '31111', '32222', '32222', '33333']);
    const indice = indiceDeLaderas(laderas);
    const deLa0 = laderas.filter((x) => x.lado === 'este' && x.x === 0);
    const mayor = deLa0.find((x) => x.caida === 2) as Ladera;
    const menor = deLa0.find((x) => x.caida === 1) as Ladera;
    expect(mayor).toMatchObject({ y0: 1, y1: 2 });
    expect(menor).toMatchObject({ y0: 3, y1: 4 });
    expect(rematesDeLadera(mayor, indice)).toEqual({ inicio: true, fin: true });
    expect(rematesDeLadera(menor, indice)).toEqual({ inicio: false, fin: true });
    // Al revés, la mayor al sur: la menor no remata al sur y la mayor sí al norte.
    const alReves = deRejilla(['33333', '32222', '32222', '31111', '31111', '33333']).laderas;
    const [arriba, abajo] = [1, 2].map(
      (c) => alReves.find((x) => x.lado === 'este' && x.x === 0 && x.caida === c) as Ladera,
    );
    const otro = indiceDeLaderas(alReves);
    expect(rematesDeLadera(arriba as Ladera, otro)).toEqual({ inicio: true, fin: false });
    expect(rematesDeLadera(abajo as Ladera, otro)).toEqual({ inicio: true, fin: true });
  });

  it('donde solo cambia el material, con la misma caída, siguen las dos sin remate', () => {
    const roca: Ladera = { x: 4, y0: 0, y1: 2, lado: 'oeste', caida: 2, material: 'cara-roca' };
    const nieve: Ladera = { ...roca, y0: 3, y1: 5, material: 'cara-nevada' };
    // Otra columna y otro lado no cuentan.
    const otras: Ladera[] = [
      { ...roca, x: 5, y0: 3, y1: 5 },
      { ...roca, lado: 'este', y0: 3, y1: 5 },
    ];
    const todas = indiceDeLaderas([roca, nieve, ...otras]);
    expect(rematesDeLadera(roca, todas)).toEqual({ inicio: true, fin: false });
    expect(rematesDeLadera(nieve, todas)).toEqual({ inicio: false, fin: true });
    expect(rematesDeLadera(roca, indiceDeLaderas([roca, ...otras]))).toEqual({
      inicio: true,
      fin: true,
    });
  });
});

describe('la colocación de las laderas con el arte del repo', () => {
  it('cada pieza pone su filo en el borde de la casilla alta y su pie, con el talud, donde empieza la siguiente', () => {
    for (const [lado, caida] of [
      ['oeste', 2],
      ['este', 1],
      ['este', 3],
    ] as const) {
      const l: Ladera = { x: 5, y0: 2, y1: 9, lado, caida, material: 'cara-roca' };
      const hoja = hojaDeLadera(l);
      expect(hoja).toBe(`laderas-roca-${lado}-${caida}`);
      const talud = (lado === 'este' ? 1 : -1) * TALUD_DE_LADERA[caida];
      const juego = juegoDe(hoja);
      for (const p of piezasDeLadera(
        l,
        { inicio: true, fin: true, esquina: false },
        juego,
        azarDe(7),
      )) {
        const { filo, pie } = juntasColocadas(p.modulo, colocarLadera(p.modulo, l, p.y));
        cerca(filo[0], bordeDeLadera(l));
        cerca(filo[1], p.y);
        cerca(pie[1], p.y + p.modulo.ladera.largo + caida * ALTO_DE_NIVEL);
        cerca(pie[1], pieDeLadera(l, p.y + p.modulo.ladera.largo - 1)[1]);
        // El talud lo trae el arte (registrado sobre la guía): a unos píxeles.
        expect(Math.abs(pie[0] - (bordeDeLadera(l) + talud))).toBeLessThan(0.03);
      }
    }
  });

  it('una caída de 4 lleva la hoja de 3, estirada hasta su pie', () => {
    const l: Ladera = { x: 5, y0: 2, y1: 2, lado: 'este', caida: 4, material: 'cara-nevada' };
    expect(hojaDeLadera(l)).toBe('laderas-nevadas-este-3');
    const m = juegoDe('laderas-nevadas-este-3').fin;
    const de3 = colocarLadera(m, { ...l, caida: 3 }, 2);
    const de4 = colocarLadera(m, l, 2);
    cerca(juntasColocadas(m, de4).pie[1] - juntasColocadas(m, de3).pie[1], ALTO_DE_NIVEL);
    expect(de4.alto).toBeGreaterThan(de3.alto);
  });

  it('un material de cara sin paredes lanza, en vez de caer a la roca', () => {
    expect(() => materialDeCara('cara-marmol')).toThrow(/cara-marmol.*MATERIAL_DE_CARA/);
    expect(() =>
      hojaDeLadera({ x: 0, y0: 0, y1: 0, lado: 'este', caida: 1, material: 'cara-marmol' }),
    ).toThrow(/cara-marmol/);
  });
});

describe('un catálogo de laderas sin sus juntas no llega a pintarse', () => {
  const crudo = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'assets/mapa/escena.json'), 'utf8'),
  ) as CatalogoEnBruto;
  /** El catálogo con el módulo `medio-a` de `laderas-roca-este-1` cambiado. */
  const con = (
    cambio: (m: Record<string, unknown>) => Record<string, unknown>,
  ): CatalogoEnBruto => ({
    ...crudo,
    hojas: {
      ...crudo.hojas,
      'laderas-roca-este-1': (crudo.hojas['laderas-roca-este-1'] ?? []).map((m) =>
        m.nombre === 'medio-a' ? (cambio(m) as (typeof crudo.hojas)[string][number]) : m,
      ),
    },
  });

  it('al cargarlo lanza diciendo qué módulo y qué hacer', () => {
    expect(() => catalogoValidado(con(({ ladera: _, ...m }) => m))).toThrow(
      /medio-a» de «laderas-roca-este-1» no trae sus juntas de ladera: derívalas \(pnpm taller derivar-laderas\)/,
    );
    const juntas = (crudo.hojas['laderas-roca-este-1']?.[0]?.ladera ?? {}) as Record<
      string,
      unknown
    >;
    expect(() =>
      catalogoValidado(con((m) => ({ ...m, ladera: { ...juntas, filo: [3] } }))),
    ).toThrow(/son pares/);
    expect(() => catalogoValidado(con((m) => ({ ...m, ladera: { ...juntas, largo: 3 } })))).toThrow(
      /1 o 2 casillas/,
    );
    expect(() =>
      catalogoValidado(con((m) => ({ ...m, ladera: { ...juntas, papel: 'tramo' } }))),
    ).toThrow(/«tramo»/);
    // Y una hoja que no es de laderas no las trae.
    const roca = crudo.hojas['paredes-roca'] ?? [];
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: { ...crudo.hojas, 'paredes-roca': roca.map((m) => ({ ...m, ladera: juntas })) },
      } as unknown as CatalogoEnBruto),
    ).toThrow(/no es una ladera/);
  });

  it('y si llega a `componer` sin pasar por la carga, lanza también', () => {
    // Un mapa de 9 × 9 con una mesa de acantilado de 2 × 3: dos laderas y una cara.
    const W = 9;
    const map: MapaDeEscena = {
      width: W,
      height: W,
      terrain: Array.from({ length: W * W }, (_, i) =>
        i % W >= 3 && i % W <= 4 && Math.floor(i / W) >= 3 && Math.floor(i / W) <= 5
          ? 'cliff'
          : 'grass',
      ),
      caminos: { tramos: [] },
      objects: [],
    };
    // Con el catálogo del repo se compone, con sus laderas.
    expect(componer(map, 1, catalogo).sprites.some((s) => s.src?.includes('/laderas-'))).toBe(true);
    const sinJuntas: Catalogo = {
      ...catalogo,
      hojas: Object.fromEntries(
        Object.entries(catalogo.hojas).map(([h, ms]) => [h, ms.map(({ ladera: _, ...m }) => m)]),
      ),
    };
    expect(() => componer(map, 1, sinJuntas)).toThrow(/derivar-laderas/);
  });

  it('una hoja sin uno de sus papeles lanza al montar su juego', () => {
    const ms = catalogo.hojas['laderas-roca-este-1'] ?? [];
    expect(() =>
      juegoDeLadera(
        'laderas-roca-este-1',
        ms.filter((m) => m.ladera?.papel !== 'esquina'),
      ),
    ).toThrow(/lleva un módulo «esquina», y trae 0/);
  });
});

describe('las juntas de cada ladera salen de su guía (`pnpm taller derivar-laderas`)', () => {
  const RAIZ = join(import.meta.dirname, '..');
  const MODULOS = join(RAIZ, 'assets/mapa/modulos');
  const hojas = encargosDeLaderas().map((e) => basename(e.salida));
  const indice = (hoja: string) =>
    JSON.parse(readFileSync(join(MODULOS, `${hoja}.json`), 'utf8')) as {
      modulos: { imagen: string; sha256: string }[];
    };

  it('las 24 hojas traen los ocho módulos con el papel y el largo de su pieza, y filo y pie dentro de la imagen', () => {
    expect(hojas).toHaveLength(24);
    for (const hoja of hojas) {
      const ms = juegoDe(hoja);
      const todos = [ms.inicio, ms.fin, ms.esquina, ...ms.medios, ...ms.largos];
      expect(todos.map((m) => m.nombre).sort()).toEqual(PIEZAS.map((p) => p.nombre).sort());
      const caida = Number(hoja.at(-1)) as 1 | 2 | 3;
      const este = hoja.includes('-este-');
      for (const m of todos) {
        const donde = `${hoja}/${m.nombre}`;
        const pieza = PIEZAS.find((p) => p.nombre === m.nombre);
        expect(pieza, donde).toBeDefined();
        expect(m.ladera.papel, donde).toBe(papelDe(pieza as (typeof PIEZAS)[number]));
        expect(m.ladera.largo, donde).toBe(pieza?.largo);
        const [fx, fy] = m.ladera.filo;
        const [px, py] = m.ladera.pie;
        for (const [x, y] of [m.ladera.filo, m.ladera.pie]) {
          expect(x, donde).toBeGreaterThanOrEqual(0);
          expect(x, donde).toBeLessThan(m.nw);
          // El `inicio` llega a su junta norte en una loma más baja que el filo
          // (#160): ese filo es la referencia de la junta y puede caer algo por
          // encima de lo pintado.
          const holgura = m.ladera.papel === 'inicio' && y === fy ? 0.12 * m.nh : 0;
          expect(y, donde).toBeGreaterThanOrEqual(-holgura);
          expect(y, donde).toBeLessThanOrEqual(m.nh);
        }
        // El pie, abajo y hacia donde cae: la ladera mira al este o al oeste.
        expect(py, donde).toBeGreaterThan(fy);
        expect(este ? px > fx : px < fx, donde).toBe(true);
        // La escala que da la caída, la misma que da el talud (el pintor respeta la guía).
        const k = (m.ladera.largo + caida * ALTO_DE_NIVEL) / (py - fy);
        expect(Math.abs(Math.abs(px - fx) * k - TALUD_DE_LADERA[caida]), donde).toBeLessThan(0.01);
      }
    }
    // Las demás hojas no las llevan.
    expect(catalogo.hojas['paredes-roca']?.some((m) => m.ladera !== undefined)).toBe(false);
  });

  it('cada módulo sigue siendo la imagen que se registró', () => {
    // Un módulo repintado sin volver a derivar se queda con las juntas del viejo.
    for (const hoja of hojas)
      for (const mod of indice(hoja).modulos)
        expect(sha256(join(MODULOS, hoja, mod.imagen)), `${hoja}/${mod.imagen}`).toBe(mod.sha256);
  });

  it('volver a registrar el módulo más pequeño da lo apuntado', async () => {
    // Uno y no los 192: registrar cuesta de 0,1 a 0,4 s por módulo, según lo que mida.
    const [hoja, m] = hojas
      .flatMap((h) => juegoDe(h).medios.map((x) => [h, x] as const))
      .concat(
        hojas.flatMap((h) =>
          [juegoDe(h).inicio, juegoDe(h).fin, juegoDe(h).esquina].map((x) => [h, x] as const),
        ),
      )
      .sort((p, q) => p[1].nw * p[1].nh - q[1].nw * q[1].nh)[0] as readonly [
      string,
      ModuloDeLadera,
    ];
    const guia = join(RAIZ, 'assets/mapa/guias', guiaDeHoja(hoja));
    const pieza = (
      JSON.parse(readFileSync(`${guia}.json`, 'utf8')) as { piezas: GeometriaDeLadera[] }
    ).piezas.find((p) => p.nombre === m.nombre) as GeometriaDeLadera;
    const r = await registrarLadera(
      join(MODULOS, hoja, `${m.nombre}.webp`),
      await mascaraDeGuia(`${guia}.png`),
      pieza,
    );
    expect(r).toEqual({ filo: m.ladera.filo, pie: m.ladera.pie });
  });
});

describe('el guardia de las laderas (`laderasMalCubiertas`)', () => {
  const l: Ladera = { x: 5, y0: 2, y1: 5, lado: 'oeste', caida: 1, material: 'cara-roca' };
  const juego = juegoDe(hojaDeLadera(l));
  const [a, b] = juego.medios as [ModuloDeLadera, ModuloDeLadera];
  const modulos = modulosDeLadera(catalogo);
  const nunca = () => false;
  const mide = (sprites: readonly Sprite[], cabe: (l: Ladera, y: number) => boolean = nunca) =>
    laderasMalCubiertas(sprites, [l], modulos, cabe);
  /** Una cadena en su sitio: un medio por casilla, alternando. */
  const bien = [2, 3, 4, 5].map((y) => sprite(y % 2 === 0 ? a : b, l, y));

  it('una cadena en su sitio no cuenta, ni las casillas vacías donde no cabía nada', () => {
    expect(mide(bien)).toEqual([]);
    expect(mide([])).toEqual([]);
    // Sin arte no hay laderas que reconocer.
    expect(laderasMalCubiertas(bien, [l], new Map(), nunca)).toEqual([]);
  });

  it('un módulo corrido una casilla deja una casilla con dos y otra sin ninguna', () => {
    const corrida = [bien[0], bien[1], sprite(a, l, 3), bien[3]] as Sprite[];
    expect(mide(corrida)).toEqual(['5,3,oeste: 2 laderas']);
    expect(mide(corrida, () => true)).toEqual([
      '5,3,oeste: 2 laderas',
      '5,4,oeste: hueco, y cabía una ladera',
    ]);
  });

  it('un hueco donde cabía una ladera cuenta; donde no cabía, no', () => {
    const sinUna = bien.filter((_, k) => k !== 2);
    expect(mide(sinUna, (_, y) => y === 4)).toEqual(['5,4,oeste: hueco, y cabía una ladera']);
    expect(mide(sinUna)).toEqual([]);
  });

  it('una ladera con los peñascos del canto debajo cuenta', () => {
    const peñasco: Sprite = {
      ...(bien[1] as Sprite),
      src: 'modulos/rocas-caidas/1.webp',
      clase: 'roca',
      x: l.x - 0.05,
      y: 3.5,
    };
    expect(mide([...bien, peñasco])).toEqual(['5,3,oeste: ladera y peñascos']);
    // Sin la ladera, los peñascos son lo que va.
    expect(mide([...bien.filter((_, k) => k !== 1), peñasco])).toEqual([]);
  });

  it('fuera de su sitio: hundida, subida, de otro lado, de otra caída, fuera de su cadena o corrida', () => {
    const t = bien[1] as Sprite;
    const deOtraHoja = (hoja: string) => {
      const m = juegoDe(hoja).medios[0] as ModuloDeLadera;
      return { ...sprite(m, l, 3) };
    };
    for (const [nombre, mala] of [
      ['hundida', { ...t, y: t.y + 0.1 }],
      ['subida', { ...t, y: t.y - 0.5 }],
      ['estirada', { ...t, alto: t.alto * 1.1 }],
      ['de otro lado', deOtraHoja('laderas-roca-este-1')],
      ['de otra caída', deOtraHoja('laderas-roca-oeste-2')],
      ['de otro material', deOtraHoja('laderas-nevadas-oeste-1')],
      ['fuera de su cadena', sprite(a, l, 7)],
      ['corrida en x', { ...t, x: t.x + 2 }],
    ] as const) {
      const fuera = mide([...bien.filter((_, k) => k !== 1), mala]);
      expect(
        fuera.some((f) => f.includes('fuera de toda ladera de su hoja')),
        nombre,
      ).toBe(true);
    }
  });
});

describe('el guardia del barranco (`laderasEnfrentadas`)', () => {
  const este: Ladera = { x: 2, y0: 3, y1: 4, lado: 'este', caida: 1, material: 'cara-roca' };
  const oeste: Ladera = { ...este, x: 4, lado: 'oeste' };
  const modulos = modulosDeLadera(catalogo);
  const medio = (l: Ladera, y: number) =>
    sprite(juegoDe(hojaDeLadera(l)).medios[0] as ModuloDeLadera, l, y);

  it('dos laderas de lados opuestos con los pies en la misma casilla y fila cuentan', () => {
    expect(laderasEnfrentadas([medio(este, 3), medio(oeste, 3)], modulos)).toEqual([
      '3,3: laderas de los dos lados al pie',
    ]);
  });

  it('en filas distintas, con lo bajo de dos casillas, de un solo lado o sin arte, no', () => {
    expect(laderasEnfrentadas([medio(este, 3), medio(oeste, 4)], modulos)).toEqual([]);
    expect(laderasEnfrentadas([medio(este, 3), medio({ ...oeste, x: 5 }, 3)], modulos)).toEqual([]);
    expect(laderasEnfrentadas([medio(este, 3), medio(este, 4)], modulos)).toEqual([]);
    expect(laderasEnfrentadas([medio(este, 3), medio(oeste, 3)], new Map())).toEqual([]);
  });
});
