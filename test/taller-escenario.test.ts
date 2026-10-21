/**
 * Las reglas puras del escenógrafo (`src/client/render/escenario/`): el esqueleto
 * que hace de una franja de muro UNA muralla, el relieve que pone las caras de
 * roca hacia la cámara, el esparcido que llena sin amontonar, y la escena de un
 * mapa real sin nada apoyado sobre un objeto.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { carasLisas, perfilesDelCatalogo } from '../src/client/render/escenario/caras.js';
import { RUTA_DEL_CATALOGO } from '../src/client/render/escenario/catalogo.js';
import { caidas, rampasDesviadas } from '../src/client/render/escenario/celdas.js';
import {
  APARTE,
  bajadasSinPieza,
  bajadasTapadas,
  COLOR_DE_BAJADA,
  COLOR_DE_DIAGONAL,
  celdasMalCubiertas,
  envolturaDelRecinto,
  laderasEnfrentadas,
  modulosDeLadera,
  RADIO_DEL_RECINTO,
  radioDeLaReserva,
  SEMIANCHO_DE_PARED,
  sendasPorObjeto,
} from '../src/client/render/escenario/colocar.js';
import { azarDe, esparcir } from '../src/client/render/escenario/esparcir.js';
import {
  type ConImagen,
  cajaDeSprite,
  type Forma,
  Obstaculos,
  pasilloDe,
  tramoEnCaja,
} from '../src/client/render/escenario/pasillo.js';
import { esVolumen } from '../src/client/render/escenario/pintar.js';
import { ALTO_DE_NIVEL, relieve } from '../src/client/render/escenario/relieve.js';
import {
  encadenar,
  SEMIANCHO_DEL_PASILLO,
  SEMIANCHO_DEL_PASILLO_DE_MASA,
  type Senda,
  suavizar,
  VAIVEN,
} from '../src/client/render/escenario/sendas.js';
import type { MapObject } from '../src/core/map/map.js';
import type { TerrainKind } from '../src/core/map/terrain.js';
import { newGame } from '../src/core/state/setup.js';
import { leerCatalogo, textoDelCatalogo } from '../tools/taller/escenario/catalogo-disco.js';
import { catalogoDelDisco, escenaDe } from './helpers.js';

describe('el relieve', () => {
  // La 9 hasta el acantilado en línea (#215), que la dejó sin agua encajada.
  // La 3 desde #226: en el mapa de 42×42 la 2 no tiene agua encajada. La 5
  // desde las fronteras onduladas (#229, 09-10-2026): la 3 se quedó sin ella.
  // La 2 desde el río continuo (#144): la 5 se quedó sin desnivel (en 1-12,
  // la 2 es la primera con agua encajada: 18 casillas). La 8 desde el río de
  // lago de 20 casillas (17-10-2026), que dejó la 2 sin desnivel (en 1-12, la
  // primera con agua encajada: 12 casillas).
  const SEMILLA = 8;
  const a = analizar(newGame({ seed: SEMILLA }).map);
  const r = relieve(a);

  it('una cara cuelga de las casillas altas hacia las de abajo en pantalla, de junta a junta', () => {
    const { caras, celdas } = caidas(r.nivel, a.W, a.H, a.suelo);
    expect(caras.length).toBeGreaterThan(0);
    // Por celdas (R4): en cada pared al sur, las dos casillas de arriba del
    // vértice caen al menos su caída sobre las dos de abajo.
    const n = (x: number, y: number) => r.nivel[y * a.W + x] as number;
    for (const c of celdas.filter((k) => k.tipo === 'S')) {
      const arriba = Math.min(n(c.vx - 1, c.vy - 1), n(c.vx, c.vy - 1));
      const abajo = Math.max(n(c.vx - 1, c.vy), n(c.vx, c.vy));
      expect(arriba - abajo).toBeGreaterThanOrEqual(c.caida);
    }
    // Y cada cara va de media casilla en media casilla.
    for (const c of caras) expect([c.x0 % 1, c.x1 % 1].map(Math.abs)).toEqual([0.5, 0.5]);
  });

  it('el agua de frontera va encajada por debajo de su orilla, el barranco; la de dentro, a ras', () => {
    let encajadas = 0;
    for (const f of a.franjas.filter((k) => k.barrera === 'water'))
      for (const i of f.casillas) {
        const orilla = r.nivel[a.fuente[i] as number] as number;
        expect(r.nivel[i] as number).toBeLessThanOrEqual(orilla);
        if ((r.nivel[i] as number) < orilla) encajadas++;
      }
    expect(encajadas).toBeGreaterThan(0);
  });

  it('el relieve no es un escalón por suelo: hay fronteras entre regiones al mismo nivel', () => {
    // Dos regiones vecinas a través de una franja, al mismo nivel: se separan por río o bosque.
    let mismoNivel = 0;
    for (const f of a.franjas.filter((k) => k.uso === 'borde')) {
      const niveles = new Set(f.casillas.map((i) => r.nivel[a.fuente[i] as number]));
      if (niveles.size === 1) mismoNivel++;
    }
    expect(mismoNivel).toBeGreaterThan(0);
  });

  it('el nivel es del mapa (#143): subir una región sube lo que se pisa de ella y nada más', () => {
    const map = newGame({ seed: SEMILLA }).map;
    const k = map.regions.findIndex((reg) => reg.nivel === 1);
    const subido = {
      ...map,
      regions: map.regions.map((reg, j) => (j === k ? { ...reg, nivel: 2 as const } : reg)),
    };
    const otro = relieve(analizar(subido));
    for (let i = 0; i < a.W * a.H; i++) {
      if (a.red.regionDe[i] === k) expect(otro.nivel[i]).toBe(2);
      else if ((a.red.regionDe[i] as number) >= 0) expect(otro.nivel[i]).toBe(r.nivel[i]);
    }
  });
});

describe('las sendas', () => {
  const recta = [0, 1, 2, 3, 4].map((x) => [x + 0.5, 0.5, x + 1.5, 0.5] as const);

  it('una fila de tramos es UNA senda, y un cruce en T da tres que se tocan en él', () => {
    expect(encadenar(recta)).toHaveLength(1);
    const t = [...recta, [2.5, 0.5, 2.5, 1.5] as const, [2.5, 1.5, 2.5, 2.5] as const];
    const lineas = encadenar(t);
    expect(lineas).toHaveLength(3);
    for (const l of lineas) expect([l[0], l.at(-1)]).toContainEqual([2.5, 0.5]);
  });

  it('suavizar no mueve los extremos y no se aparta más que el vaivén', () => {
    const [l] = encadenar(recta);
    const s = suavizar(l as [number, number][], azarDe(4));
    expect(s[0]).toEqual([0.5, 0.5]);
    expect(s.at(-1)).toEqual([5.5, 0.5]);
    for (const [, y] of s) expect(Math.abs(y - 0.5)).toBeLessThanOrEqual(VAIVEN + 1e-9);
    // Y serpentea: no es la recta de casillas.
    expect(Math.max(...s.map(([, y]) => Math.abs(y - 0.5)))).toBeGreaterThan(0.05);
  });
});

describe('el pasillo de la senda', () => {
  const S = SEMIANCHO_DEL_PASILLO;
  // Una L (de la casilla 0,0 a la 1,0 y bajando a la 1,1) y una diagonal suelta.
  const ele: Senda = [
    [0.5, 0.5],
    [1.5, 0.5],
    [1.5, 1.5],
  ];
  const diagonal: Senda = [
    [4.5, 0.5],
    [5.5, 1.5],
  ];
  const p = pasilloDe([ele, diagonal], S);
  const m = SEMIANCHO_DEL_PASILLO_DE_MASA;
  const deMasa = pasilloDe([ele, diagonal], m);
  /** Un punto: un sprite de alto 0, cuya caja es su pie. */
  const punto = (x: number, y: number) => ({ x, y, nw: 1, nh: 1, ax: 0.5, ay: 1, alto: 0 });

  it('cubre la unión entre dos casillas, el codo de una L y el medio de una diagonal', () => {
    // Lejos del centro de toda casilla: un disco por casilla no los cubriría.
    expect(p.pisa(punto(1.0, 0.5 + S - 0.05))).toBe(true);
    const k = (S - 0.05) / Math.SQRT2;
    expect(p.pisa(punto(5.0 + k, 1.0 - k))).toBe(true);
    expect(p.pisa(punto(1.5 + S - 0.05, 0.5))).toBe(true);
  });

  it('no pasa de su media anchura', () => {
    expect(p.pisa(punto(1.0, 0.5 + S + 0.1))).toBe(false);
    const k = (S + 0.1) / Math.SQRT2;
    expect(p.pisa(punto(5.0 + k, 1.0 - k))).toBe(false);
    expect(deMasa.pisa(punto(1.0, 0.5 + m - 0.05))).toBe(true);
    expect(deMasa.pisa(punto(1.0, 0.5 + m + 0.05))).toBe(false);
  });

  it('mide el rectángulo del sprite, no su pie', () => {
    // Una mata ancha (2:1) con el pie 0,6 por debajo de la senda: el pie está
    // fuera del pasillo y la imagen, que crece hacia arriba, lo cruza.
    const mata = { x: 1.0, y: 0.5 + S + 0.2, nw: 200, nh: 100, ax: 100, ay: 98, alto: 1 };
    expect(p.pisa(mata, 0)).toBe(false);
    expect(p.pisa(mata)).toBe(true);
    const alto = p.altoLibre(mata);
    expect(alto).toBeGreaterThan(0);
    expect(alto).toBeLessThan(mata.alto);
    expect(p.pisa(mata, alto)).toBe(false);
    expect(p.pisa(mata, alto + 0.01)).toBe(true);
    // Lejos de la senda, o cerca sin llegar, su alto entero y no una milésima menos.
    expect(p.altoLibre({ ...mata, y: 4 })).toBe(mata.alto);
  });

  it('con el pie dentro, `altoLibre` contesta 0 por atajo, sin bisección: es lo que daría', () => {
    const pie = { x: 1.0, y: 0.55, nw: 200, nh: 100, ax: 100, ay: 98, alto: 1 };
    expect(p.pisa(pie, 0)).toBe(true);
    expect(p.altoLibre(pie)).toBe(0);
    // Ni el alto más pequeño saca la caja del pasillo: el pie ya está dentro.
    expect(p.pisa(pie, 1e-6)).toBe(true);
  });

  it('el marcador (sin imagen) mide lo que pinta: un cuadrado de su alto con el pie abajo en medio', () => {
    const caja = cajaDeSprite({ x: 2, y: 3, nw: 1, nh: 1, ax: 0.5, ay: 1, alto: 0.8 });
    for (const [k, v] of [1.6, 2.2, 2.4, 3].entries()) expect(caja[k]).toBeCloseTo(v, 9);
  });

  it('un tramo corta una caja si comparte con ella un trozo, no si solo la toca en un punto', () => {
    const t: [number, number] = [0, 0];
    // La atraviesa: de x = 1 a 3 sobre un tramo de 0 a 4.
    expect(tramoEnCaja(0, 1, 4, 1, 1, 0, 3, 2, t)).toBe(true);
    expect(t).toEqual([0.25, 0.75]);
    // Corre por un borde: lo comparte entero.
    expect(tramoEnCaja(0, 0, 4, 0, 1, 0, 3, 2)).toBe(true);
    // Pasa por una esquina o acaba en un borde: un punto, no un trozo.
    expect(tramoEnCaja(0, 2, 2, 0, 1, 1, 3, 3)).toBe(false);
    expect(tramoEnCaja(0, 1, 1, 1, 1, 0, 3, 2)).toBe(false);
    // Y lejos, nada.
    expect(tramoEnCaja(0, 5, 4, 5, 1, 0, 3, 2)).toBe(false);
    // Para el índice, tocar en un punto es estar a distancia 0: la esquina pisa.
    // El sprite de caja [1, 1, 3, 3].
    const esquina = { x: 2, y: 3, nw: 1, nh: 1, ax: 0.5, ay: 1, alto: 2 };
    expect(
      pasilloDe(
        [
          [
            [0, 2],
            [2, 0],
          ],
        ],
        0.01,
      ).pisa(esquina),
    ).toBe(true);
  });

  it('un tramo que cae en varias casillas y un trozo de muchos tramos se miden igual que sueltos', () => {
    // Una senda larga y fina: varios trozos y tramos en muchas casillas.
    const larga: Senda = Array.from({ length: 60 }, (_, i) => [
      0.5 + i * 0.1,
      3.5 + (i % 3) * 0.02,
    ]);
    const junta = pasilloDe([larga], S);
    const sueltos = larga
      .slice(1)
      .map((b, i) => pasilloDe([[larga[i] as readonly [number, number], b]], S));
    for (let x = 0; x < 7; x += 0.37)
      for (let y = 2.5; y < 4.6; y += 0.13) {
        // La caja [x, y, x + 0,3, y + 0,2].
        const caja = { x: x + 0.15, y: y + 0.2, nw: 3, nh: 2, ax: 1.5, ay: 2, alto: 0.2 };
        expect(junta.pisa(caja)).toBe(sueltos.some((q) => q.pisa(caja)));
      }
  });
});

describe('el índice de obstáculos (#151): cada forma mide a su manera', () => {
  const mata = (x: number, y: number, alto = 1) => ({
    x,
    y,
    nw: 100,
    nh: 100,
    ax: 50,
    ay: 100,
    alto,
  });
  // Un objeto en (5, 5) con una reserva de 0,5: un trazo de un solo punto que mide
  // el pie de todo, y el rectángulo de lo que, más alto que 0,6, va delante (al sur).
  const reserva: Forma<ConImagen> = {
    trazos: [[[5, 5]]],
    alcance: 0.5,
    mide: (s, alto) =>
      alto > 0.6 && s.y > 5 ? { radio: 0.5, soloElPie: false } : { radio: 0.5, soloElPie: true },
  };
  const ninguna: Forma<ConImagen> = {
    trazos: [
      [
        [5, 5],
        [9, 5],
      ],
    ],
    alcance: 1,
    mide: () => null,
  };
  const o = new Obstaculos([reserva, ninguna]);

  it('un objeto es un trazo de un punto: el pie en su disco pisa, fuera no', () => {
    expect(o.pisa(mata(5.3, 5.3, 0.4))).toBe(true);
    expect(o.pisa(mata(5.5, 5.5, 0.4))).toBe(false);
    // La forma que no mira a nadie no pisa aunque pase por encima.
    expect(o.pisa(mata(7, 5, 0.4))).toBe(false);
  });

  it('lo alto que va delante se mide por su rectángulo y encoge hasta el umbral de la regla', () => {
    const arbol = mata(5, 5.8);
    expect(o.pisa(arbol, 0)).toBe(false);
    expect(o.pisa(arbol)).toBe(true);
    const alto = o.altoLibre(arbol);
    // Su caja sale del disco a 0,3 de alto; por debajo de 0,6 la regla solo mira el pie.
    expect(alto).toBeLessThanOrEqual(0.6);
    expect(alto).toBeCloseTo(0.6, 2);
    // Detrás (al norte), lo tapa el objeto: no se mide su rectángulo.
    expect(o.altoLibre(mata(5, 4.4))).toBe(1);
  });

  it('cerca de una forma, dentro de su alcance pero fuera de su medida, el alto entero', () => {
    // Antes de #151 la bisección corría con cualquier tramo cerca y dejaba el
    // alto una milésima por debajo aunque cupiera entero.
    const estrecha = new Obstaculos([
      { trazos: [[[0, 0]]], alcance: 0.5, mide: () => ({ radio: 0.2, soloElPie: false }) },
    ]);
    expect(estrecha.altoLibre(mata(0.8, 0.5))).toBe(1);
    expect(estrecha.altoLibre(mata(0.1, 0.5))).toBeLessThan(1);
  });

  it('un tope manda como una forma: pisa por encima de su alto, y `altoLibre` da el menor', () => {
    // Un tope de 0,5 solo para lo que está a la izquierda de x = 3; a la derecha, nada.
    const conTope = new Obstaculos(
      [reserva],
      [(s, hasta) => (s.x < 3 ? Math.min(0.5, hasta) : hasta)],
    );
    expect(conTope.pisa(mata(1, 1, 0.5))).toBe(false);
    expect(conTope.pisa(mata(1, 1, 0.6))).toBe(true);
    expect(conTope.altoLibre(mata(1, 1))).toBe(0.5);
    expect(conTope.altoLibre(mata(4, 1))).toBe(1);
    // Con la reserva más estricta que el tope, manda la reserva.
    expect(conTope.altoLibre(mata(5, 5.8))).toBeCloseTo(0.6, 2);
  });

  it('`en` dice qué forma de las que se piden alcanza un punto', () => {
    expect(o.en(5.2, 5.2, (f) => f === reserva)).toBe(reserva);
    expect(o.en(5.6, 5, (f) => f === reserva)).toBeUndefined();
    expect(o.en(7, 5, (f) => f === reserva)).toBeUndefined();
  });

  it('lanza con un alcance que no es positivo o una medida que pasa de él', () => {
    expect(() => pasilloDe([[[0, 0]]], 0)).toThrow(/alcance positivo/);
    const tramposa = new Obstaculos([
      { trazos: [[[0, 0]]], alcance: 0.2, mide: () => ({ radio: 0.5, soloElPie: true }) },
    ]);
    expect(() => tramposa.pisa(mata(0.1, 0.1))).toThrow(/más que su alcance/);
  });
});

describe('el esparcido', () => {
  it('ningún punto más cerca de otro que su radio, y nada fuera de donde se pide', () => {
    const azar = azarDe(3);
    const pts = esparcir(
      [0, 0, 10, 10],
      () => 0.4,
      (x) => !(x > 4 && x < 6),
      azar,
    );
    expect(pts.length).toBeGreaterThan(200);
    for (const p of pts) expect(p.x > 4 && p.x < 6).toBe(false);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const p = pts[i] as { x: number; y: number };
        const q = pts[j] as { x: number; y: number };
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(0.4);
      }
  });

  it('es determinista: la misma semilla, los mismos puntos', () => {
    const uno = esparcir(
      [0, 0, 5, 5],
      () => 0.5,
      () => true,
      azarDe(7),
    );
    const otro = esparcir(
      [0, 0, 5, 5],
      () => 0.5,
      () => true,
      azarDe(7),
    );
    expect(uno).toEqual(otro);
  });
});

const RAIZ = resolve(import.meta.dirname, '..');

describe('la escena de un mapa real', () => {
  const catalogo = catalogoDelDisco();
  // La 13 en vez de la 7, que con menos mesetas (#210) se quedó sin desnivel;
  // la 6 y la 7 en vez de la 3 y la 9, que con el acantilado en línea (#215)
  // se quedaron sin laderas a un lado o sin alguna clase de lo que se aparta;
  // la 9 y la 2 en vez de la 1 y la 7, que con los vestidos que se repiten por
  // una silla (#224) se quedaron con 2 y 1 laderas al oeste; la 3 y la 7 en
  // vez de la 9 y la 13 desde #226 (mapa de 42×42): la 13 se quedó sin
  // desnivel y la 9 sin el inicio de una ladera; la 4 y la 5 en vez de la 7 y
  // la 2 desde las dos puertas de la mina (#230, 09-10-2026): las dos se
  // quedaron sin desnivel (todas sus regiones al 1); la 15 en vez de la 4
  // desde los ríos (#144, 16-10-2026), que la dejaron sin desnivel; la 2 en
  // vez de la 15 desde el río de una casilla (#144, paso 2), por lo mismo; la
  // 7 y la 9 en vez de la 3 y la 5 desde el río continuo (#144), por lo mismo;
  // la 5 en vez de la 6 sin agua de frontera fuera del río (QA del río
  // continuo, H3), por lo mismo; la 12 y la 14 en vez de la 5 y la 2 desde el
  // río de lago de 20 casillas (17-10-2026), por lo mismo.
  for (const semilla of [7, 12, 14, 9]) {
    const map = newGame({ seed: semilla }).map;
    const e = escenaDe(semilla);

    it(`semilla ${semilla}: con el catálogo del repo no falta ningún módulo`, () => {
      expect(e.informe.modulosQueFaltan).toEqual([]);
    });

    it(`semilla ${semilla}: nada se apoya sobre un objeto ni un camino, y cada muralla es una línea`, () => {
      expect(e.informe.basesSobreReserva).toBe(0);
      expect(e.informe.murallasPartidas).toBe(0);
    });

    it(`semilla ${semilla}: la senda entra en cada mina y cada pueblo por su puerta, y no los cruza (#188)`, () => {
      expect(e.informe.sendasPorObjeto).toBe(0);
    });

    it(`semilla ${semilla}: toda casilla de barrera queda bajo su formación o bajo un objeto`, () => {
      expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
    });

    it(`semilla ${semilla}: ninguna mata, roca, orilla, árbol ni pico corta el pasillo de la senda`, () => {
      expect(e.informe.spritesSobreSenda).toBe(0);
      // Y medido aquí, no solo con la cuenta del informe: con los trazos que se
      // pintan, el rectángulo con el que se pinta cada sprite y la tabla de
      // qué clase se aparta cuánto.
      const pasillos = new Map(
        Object.values(APARTE).flatMap((r) =>
          r === null ? [] : [[r.semiancho, pasilloDe(e.sendas, r.semiancho)] as const],
        ),
      );
      const cortan = e.sprites.filter((s) => {
        const r = APARTE[s.clase];
        return s.capa === 0 && r !== null && pasillos.get(r.semiancho)?.pisa(s) === true;
      });
      expect(cortan.map((s) => `${s.clase} ${s.src} en ${s.x},${s.y}`)).toEqual([]);
      // Que el guardia no mire al vacío: hay sendas, y hay de todo lo que vigila.
      expect(e.sendas.length).toBeGreaterThan(10);
      for (const [clase, r] of Object.entries(APARTE))
        if (r !== null) expect(e.sprites.some((s) => s.clase === clase)).toBe(true);
    });

    it(`semilla ${semilla}: ningún volumen de lo que se aparta tapa un objeto que tiene detrás (#151)`, () => {
      // Recontado desde lo puesto, sin preguntar a la puerta: el rectángulo de
      // cada árbol, pico, roca o mata alta que se pinta después del objeto
      // (`separar`: por su y, y a igual y de oeste a este) no llega a su reserva.
      // Los recintos de las ciudades, aparte: su reserva es su rectángulo (abajo).
      const objetos = e.sprites.filter(
        (s) =>
          s.objeto !== undefined &&
          s.objeto.kind !== 'town' &&
          !e.puentes.some((p) => p.id === s.objeto?.id),
      );
      const volumenes = e.sprites.filter(
        (s) => s.capa === 0 && APARTE[s.clase] !== null && esVolumen(s),
      );
      const tapan: string[] = [];
      for (const o of objetos) {
        const mo = map.objects.find((m) => m.id === o.objeto?.id);
        if (mo === undefined) throw new Error(`el objeto ${o.objeto?.id} no está en el mapa`);
        const [cx, cy] = [mo.at.x + 0.5, mo.at.y + 0.5];
        const r = radioDeLaReserva(mo);
        for (const v of volumenes) {
          if (v.y < o.y || (v.y === o.y && v.x <= o.x)) continue;
          const [x0, y0, x1, y1] = cajaDeSprite(v);
          // El árbol de bosque que va en la reserva (`Sprite.enLaReserva`, vuelta
          // de QA 1 de 2026-10-14-pisable-junto-al-bosque) no toca la caja del objeto.
          if (v.enLaReserva === true) {
            const [a0, b0, a1, b1] = cajaDeSprite(o);
            if (x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0)
              tapan.push(`${v.src} en ${v.x},${v.y} tapa la imagen de ${mo.id}`);
            continue;
          }
          const dx = Math.max(x0 - cx, 0, cx - x1);
          const dy = Math.max(y0 - cy, 0, cy - y1);
          if (dx * dx + dy * dy < r * r) tapan.push(`${v.src} en ${v.x},${v.y} tapa ${mo.id}`);
        }
      }
      // Lo que se pinta después del muro sur de un recinto (su envoltura) no
      // llega con su rectángulo a `RADIO_DEL_RECINTO` de sus casillas.
      for (const r of e.recintos) {
        const env = envolturaDelRecinto(r.id, r.rect);
        const [a0, b0, a1, b1] = [
          r.rect.i0 + 0.5,
          r.rect.j0 + 0.5,
          r.rect.i1 + 0.5,
          r.rect.j1 + 0.5,
        ];
        for (const v of volumenes) {
          if (v.y < env.y || (v.y === env.y && v.x <= env.x)) continue;
          const [x0, y0, x1, y1] = cajaDeSprite(v);
          const dx = Math.max(x0 - a1, 0, a0 - x1);
          const dy = Math.max(y0 - b1, 0, b0 - y1);
          if (dx * dx + dy * dy < RADIO_DEL_RECINTO * RADIO_DEL_RECINTO)
            tapan.push(`${v.src} en ${v.x},${v.y} tapa el recinto de ${r.id}`);
        }
      }
      expect(tapan).toEqual([]);
      // Que el guardia no mire al vacío: hay volúmenes delante de algún objeto.
      expect(
        objetos.some((o) =>
          volumenes.some((v) => v.y > o.y && Math.abs(v.x - o.x) < 2 && v.y - o.y < 3),
        ),
      ).toBe(true);
    });

    it(`semilla ${semilla}: lo que se aparta sale de las hojas que su clase declara`, () => {
      for (const s of e.sprites) {
        const r = APARTE[s.clase];
        if (r === null || s.src === null) continue;
        expect(r.hojas).toContain(s.src.split('/')[1]);
      }
    });

    it(`semilla ${semilla}: ninguna masa ni muro se apoya en una casilla que se pisa lejos de su franja`, () => {
      const a = analizar(map);
      for (const s of e.sprites) {
        if (s.clase !== 'masa' && s.clase !== 'muro') continue;
        const x = Math.min(a.W - 1, Math.max(0, Math.floor(s.x)));
        const y = Math.min(a.H - 1, Math.max(0, Math.floor(s.y - 0.3)));
        let cerca = false;
        for (let dy = -1; dy <= 1 && !cerca; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const k = (y + dy) * a.W + x + dx;
            if (a.franjaDe[k] !== undefined && (a.franjaDe[k] as number) !== -1) cerca = true;
          }
        expect(cerca).toBe(true);
      }
    });

    it(`semilla ${semilla}: ninguna pared va cortada, y toda frontal se apoya en el pie de su cara`, () => {
      // Sin cortes rectos (decisión del usuario, 06-10-2026): una pared nunca
      // lleva \`recorte\`. Con el relieve por celdas no se corre ni se encoge
      // por la senda: la bajada se pinta encima (R5).
      const cortadas = e.sprites.filter((s) => s.clase === 'pared' && s.recorte !== undefined);
      expect(cortadas.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
      const fuera = e.sprites.filter(
        (s) =>
          s.src?.includes('/paredes-') === true &&
          !e.relieve.caras.some(
            (c) =>
              s.x >= c.x0 - 1 &&
              s.x <= c.x1 + 2 &&
              Math.abs(s.y - (c.y + 1 + c.caida * ALTO_DE_NIVEL) - 0.05) <= 0.07,
          ),
      );
      expect(fuera.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
    });

    it(`semilla ${semilla}: el pedregal de las caras no pisa ninguna senda`, () => {
      // El pedregal no pisa ninguna senda, tampoco la que no baja (#150, N3).
      const pasillo = pasilloDe(e.sendas, SEMIANCHO_DE_PARED);
      const peñascos = e.sprites.filter(
        (s) => s.clase === 'pared' && s.src?.includes('/rocas-caidas/') === true,
      );
      const pisan = peñascos.filter((s) => pasillo.pisa(s));
      expect(pisan.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
    });

    it(`semilla ${semilla}: cada pared vista lleva su pieza en su sitio, y cada bajada la suya sin tapar`, () => {
      // Recontado aquí desde los sprites. Lo que el test no sabe es por qué una
      // pared quedó vacía (las reservas viven en \`componer\`): eso lo cuenta solo
      // el informe; aquí, dos piezas en una celda o una fuera de toda celda.
      const { barrancos } = caidas(
        relieve(analizar(map)).nivel,
        map.width,
        map.height,
        analizar(map).suelo,
      );
      expect(
        celdasMalCubiertas(
          e.sprites,
          { vistas: e.relieve.celdas, barrancos },
          catalogo,
          () => 'reserva',
        ),
      ).toEqual([]);
      expect(e.informe.celdasMalCubiertas).toBe(0);
      expect(bajadasSinPieza(e.sprites, e.relieve.bajadas, catalogo)).toEqual([]);
      expect(bajadasTapadas(e.sprites, e.relieve.bajadas, catalogo)).toEqual([]);
      expect([
        e.informe.bajadasSinPieza,
        e.informe.bajadasTapadas,
        e.informe.bajadasSobreNodo,
        e.informe.rampasDesviadas,
      ]).toEqual([0, 0, 0, 0]);
      // La senda pintada pasa por cada rampa, del filo al pie (#192).
      expect(rampasDesviadas(e.relieve.bajadas, e.sendas)).toEqual([]);
      // Que el guardia no mire al vacío: hay diagonales (con arte o marcador) y bajadas.
      expect(
        e.sprites.some(
          (s) => s.src?.includes('/diagonales-') === true || s.color === COLOR_DE_DIAGONAL,
        ),
      ).toBe(true);
      expect(e.relieve.bajadas.length).toBeGreaterThan(0);
      // Con el lote entero de §23 en el repo, ninguna va ya con marcador.
      expect(
        e.sprites.filter(
          (s) => s.src === null && (s.color === COLOR_DE_DIAGONAL || s.color === COLOR_DE_BAJADA),
        ).length,
      ).toBe(0);
    });

    // Las laderas (#156, §20): las de a mano están en `laderas.test.ts`.
    const puestas = e.sprites.filter((s) => s.src?.includes('/laderas-') === true);

    it(`semilla ${semilla}: las caídas al este y al oeste llevan ladera de su lado, con sus remates y sin esquinas`, () => {
      // Sin las crestas, que llevaban ladera a los dos lados, hay menos (#143):
      // de 9-33 por lado en 1, 3, 7 y 9 a 5-12.
      for (const lado of ['este', 'oeste'])
        expect(puestas.filter((s) => s.src?.includes(`-${lado}-`)).length).toBeGreaterThan(3);
      // La esquina de §20 ya no entra: dobla la diagonal (R4).
      expect(puestas.some((s) => s.src?.includes('/esquina'))).toBe(false);
      for (const nombre of ['inicio', 'medio-', 'fin'])
        expect(
          puestas.some((s) => s.src?.includes(`/${nombre}`)),
          nombre,
        ).toBe(true);
      expect(puestas.every((s) => s.clase === 'pared' && s.recorte === undefined)).toBe(true);
    });

    it(`semilla ${semilla}: ningún barranco de una casilla lleva laderas de los dos lados`, () => {
      // Recontado desde los sprites: los pies de dos laderas enfrentadas en la
      // misma casilla tapaban el agua del fondo (QA de #156, H1).
      expect(laderasEnfrentadas(e.sprites, modulosDeLadera(catalogo))).toEqual([]);
      expect(e.informe.laderasEnfrentadas).toBe(0);
    });

    it(`semilla ${semilla}: ninguna cara de acantilado se pinta lisa (#159)`, () => {
      // Recontado aquí con los perfiles del catálogo: lo que se pinta de cada
      // cara y no tapa la silueta de ninguna pared.
      expect(carasLisas(e.relieve.caras, e.sprites, perfilesDelCatalogo(catalogo))).toEqual([]);
      expect(e.informe.carasLisas).toBe(0);
    });
  }
});

describe('lo que importaría el juego', () => {
  it('el catálogo del repo es el que sale del disco: `pnpm taller catalogo-escena` está al día', async () => {
    expect(readFileSync(join(RAIZ, RUTA_DEL_CATALOGO), 'utf8')).toBe(
      textoDelCatalogo(await leerCatalogo()),
    );
  });

  it('componer y pintar no arrastran nada de Node: corren en el navegador', () => {
    // Se sigue cada import relativo desde las dos puertas y se mira qué trae de fuera.
    const deFuera = new Map<string, string>();
    const vistos = new Set<string>();
    const pendientes = [
      'src/client/render/escenario/colocar.ts',
      'src/client/render/escenario/pintar.ts',
    ];
    for (let f = pendientes.pop(); f !== undefined; f = pendientes.pop()) {
      if (vistos.has(f)) continue;
      vistos.add(f);
      const texto = readFileSync(join(RAIZ, f), 'utf8');
      for (const m of texto.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*'([^']+)'/gms)) {
        const ruta = m[1] as string;
        // `import type` se borra al compilar: no viaja al navegador.
        if (/^\s*(?:import|export)\s+type\b/.test(m[0])) continue;
        if (ruta.startsWith('.')) {
          pendientes.push(join(dirname(f), ruta.replace(/\.js$/, '.ts')));
        } else if (ruta.startsWith('@core/')) {
          // El núcleo es puro por su propio guardia: se sigue igual, por si acaso.
          pendientes.push(join('src/core', ruta.slice('@core/'.length).replace(/\.js$/, '.ts')));
        } else deFuera.set(ruta, f);
      }
      for (const m of texto.matchAll(/(?:import\s*\(|^\s*import\s*)'([^']+)'/gm))
        deFuera.set(m[1] as string, f);
    }
    expect(vistos.size).toBeGreaterThan(5);
    expect([...deFuera].map(([r, f]) => `${r} (desde ${f})`)).toEqual([]);
  });
});

describe('las sendas por un objeto con puerta (#188)', () => {
  // Una mina en (2,1) de un 5×4 de hierba: sus puertas son (2,2) y, a la
  // derecha, (3,1) (#230).
  const mina = {
    kind: 'mine',
    id: 'mine-0',
    at: { x: 2, y: 1 },
    resource: 'gold',
    owner: null,
  } as const;
  const terreno = new Array<TerrainKind>(20).fill('grass');
  const tramo = (x0: number, y0: number, x1: number, y1: number) =>
    [x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5] as const;
  const malas = (
    tramos: (readonly [number, number, number, number])[],
    t = terreno,
    o: MapObject = mina,
  ) => sendasPorObjeto(tramos, [o], t, 5, 4).map((m) => m.id);
  const pueblo: MapObject = {
    kind: 'village',
    id: 'village-0',
    name: 'Pueblo',
    at: { x: 2, y: 1 },
  };

  it('un ramal desde la puerta vale; cruzarla, entrar de lado o no llegar, no', () => {
    expect(malas([tramo(1, 2, 2, 2), tramo(2, 2, 3, 2), tramo(2, 2, 2, 1)])).toEqual([]);
    expect(malas([tramo(1, 1, 2, 1), tramo(2, 1, 3, 1)])).toEqual(['mine-0']);
    expect(malas([tramo(1, 1, 2, 1)])).toEqual(['mine-0']);
    expect(malas([tramo(2, 0, 2, 1)])).toEqual(['mine-0']);
    expect(malas([tramo(1, 2, 2, 1)])).toEqual(['mine-0']);
    expect(malas([])).toEqual(['mine-0']);
  });

  it('la mina también por su puerta de la derecha; el pueblo, no (#230)', () => {
    expect(malas([tramo(2, 1, 3, 1), tramo(3, 1, 3, 2)])).toEqual([]);
    expect(malas([tramo(2, 1, 3, 1)], terreno, pueblo)).toEqual(['village-0']);
    expect(malas([tramo(2, 1, 2, 2)], terreno, pueblo)).toEqual([]);
    // Con la de debajo tapada, la de la derecha sigue siendo la que vale.
    const sinLaDeDebajo = terreno.map((t, i) => (i === 12 ? 'mountain' : t));
    expect(malas([tramo(2, 1, 3, 1)], sinLaDeDebajo)).toEqual([]);
    expect(malas([tramo(1, 1, 2, 1)], sinLaDeDebajo)).toEqual(['mine-0']);
  });

  it('sin puerta que se pise, vale cualquier tramo, pero uno', () => {
    const tapada = terreno.map((t, i) => (i === 12 || i === 8 ? 'mountain' : t));
    expect(malas([tramo(1, 1, 2, 1)], tapada)).toEqual([]);
    expect(malas([tramo(1, 1, 2, 1), tramo(2, 1, 3, 1)], tapada)).toEqual(['mine-0']);
  });
});
