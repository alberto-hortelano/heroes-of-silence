/**
 * Las laderas (#156): las caídas al este y al oeste llevan una ladera de su
 * lado (§20), encadenada de norte a sur con sus remates. Con el relieve por
 * celdas (R4) la cadena va de junta a junta, corrida media fila, y donde gira
 * hacia la cámara sigue una diagonal (`celdas.test.ts`), no la `esquina`. Aquí,
 * con rejillas y sprites a mano y el arte del repo; en mapas reales, en
 * `taller-escenario.test.ts`.
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
import { caidas } from '../src/client/render/escenario/celdas.js';
import {
  colocarLadera,
  componer,
  hojaDeLadera,
  juegoDeLadera,
  juntasColocadas,
  laderasEnfrentadas,
  materialDeCara,
  modulosDeLadera,
  type PiezaDeLadera,
  piezasDeLadera,
  type Sprite,
} from '../src/client/render/escenario/colocar.js';
import { azarDe } from '../src/client/render/escenario/esparcir.js';
import {
  ALTO_DE_NIVEL,
  bordeDeLadera,
  type Ladera,
  pieDeLadera,
  TALUD_DE_LADERA,
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
import { catalogoDelDisco, sha256 } from './helpers.js';

/** Las caídas por celdas de una rejilla de niveles escrita a mano, una cifra por casilla. */
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

describe('las laderas salen del relieve por celdas', () => {
  // Una meseta de 3 × 4 casillas (x 2-4, y 1-4) un nivel por encima del resto.
  const meseta = ['1111111', '1122211', '1122211', '1122211', '1122211', '1111111'];

  it('una meseta de 3 × 4 da dos laderas de junta a junta, corridas media fila, con sus remates', () => {
    // Las celdas de los vértices de las esquinas de la meseta son diagonales: la
    // cadena va de la junta del medio de la fila 1 a la del medio de la fila 4.
    // Al norte sigue de espaldas (remata); al sur, por la diagonal (no remata).
    expect(deRejilla(meseta).laderas).toEqual([
      {
        x: 4,
        y0: 1.5,
        y1: 3.5,
        lado: 'este',
        caida: 1,
        material: 'cara-roca',
        inicio: true,
        fin: false,
      },
      {
        x: 2,
        y0: 1.5,
        y1: 3.5,
        lado: 'oeste',
        caida: 1,
        material: 'cara-roca',
        inicio: true,
        fin: false,
      },
    ]);
    expect(deRejilla(meseta, 'sand').laderas.map((l) => l.material)).toEqual([
      'cara-arenisca',
      'cara-arenisca',
    ]);
  });

  it('un barranco de una casilla no lleva ninguna de sus dos laderas: van a los barrancos', () => {
    // La columna 1 baja entre dos altas: la ladera este de x 0 y la oeste de
    // x 2 caían las dos en ella y tapaban su fondo (QA de #156, H1).
    const barranco = deRejilla(['2222', '2122', '2122', '2222']);
    expect(barranco.laderas.filter((l) => l.x <= 2)).toEqual([]);
    expect(barranco.barrancos.map((c) => [c.vx, c.vy, c.tipo])).toEqual([
      [1, 2, 'E'],
      [2, 2, 'O'],
    ]);
  });

  it('la cadena se corta donde cambia la caída, y la mayor remata por donde sigue la menor', () => {
    // La columna 1 cae 1 al este en la fila 1 y 2 en las filas 2-3.
    const { laderas } = deRejilla(['1111', '1211', '1311', '1311', '1111']);
    expect(
      laderas.filter((l) => l.lado === 'este').map((l) => [l.y0, l.y1, l.caida, l.inicio, l.fin]),
    ).toEqual([
      [1.5, 1.5, 1, true, false],
      [2.5, 2.5, 2, true, false],
    ]);
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
  const solo = { inicio: true, fin: true };

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

  it('sin remate donde la cadena sigue (un escalón con la de al lado), con medios hasta la punta', () => {
    const ps = piezasDeLadera(l(2, 5), { inicio: false, fin: false }, juego, azarDe(2));
    expect(casillas(ps)).toEqual([2, 3, 4, 5]);
    expect(papeles(ps).every((p) => p === 'medio' || p === 'largo')).toBe(true);
  });

  it('con una sola fila gana el fin, y si no remata al sur, el inicio', () => {
    const una = l(3, 3);
    expect(piezasDeLadera(una, solo, juego, azarDe(1))).toEqual([{ modulo: juego.fin, y: 3 }]);
    expect(piezasDeLadera(una, { inicio: true, fin: false }, juego, azarDe(1))).toEqual([
      { modulo: juego.inicio, y: 3 },
    ]);
  });

  it('corrida media fila, como la deja el relieve por celdas, cubre de junta a junta', () => {
    const ps = piezasDeLadera(l(1.5, 4.5), solo, juego, azarDe(3));
    expect(casillas(ps)).toEqual([1.5, 2.5, 3.5, 4.5]);
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
      for (const p of piezasDeLadera(l, { inicio: true, fin: true }, juego, azarDe(7))) {
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
      /medio-a» de «laderas-roca-este-1» no trae sus juntas de ladera: derívalas \(pnpm taller derivar-relieve\)/,
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
    expect(() => componer(map, 1, sinJuntas)).toThrow(/derivar-relieve/);
  });

  it('una hoja sin uno de sus papeles lanza al montar su juego', () => {
    const ms = catalogo.hojas['laderas-roca-este-1'] ?? [];
    expect(() =>
      juegoDeLadera(
        'laderas-roca-este-1',
        ms.filter((m) => m.ladera?.papel !== 'fin'),
      ),
    ).toThrow(/lleva un módulo «fin», y trae 0/);
  });
});

describe('las juntas de cada ladera salen de su guía (`pnpm taller derivar-relieve`)', () => {
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
      // Todos, también la `esquina`, que ya no entra en el juego pero sigue en la hoja.
      const todos = (catalogo.hojas[hoja] ?? []).map((m) => m as ModuloDeLadera);
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
      .flatMap((h) => (catalogo.hojas[h] ?? []).map((x) => [h, x as ModuloDeLadera] as const))
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
