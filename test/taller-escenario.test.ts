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
import { RUTA_DEL_CATALOGO } from '../src/client/render/escenario/catalogo.js';
import {
  APARTE,
  colocarLadera,
  componentesDePasos,
  hojaDeLadera,
  juegoDeLadera,
  juntasColocadas,
  laderasEnfrentadas,
  laderasMalCubiertas,
  modulosDeLadera,
  paredesFueraDelPie,
  paredesSobreRampa,
  pasilloDeLaPared,
  SOLAPE_DE_ESQUINA,
} from '../src/client/render/escenario/colocar.js';
import { azarDe, esparcir } from '../src/client/render/escenario/esparcir.js';
import { ejeDe, esqueleto } from '../src/client/render/escenario/esqueleto.js';
import { cajaDeSprite, Pasillo, tramoEnCaja } from '../src/client/render/escenario/pasillo.js';
import {
  ALTO_DE_NIVEL,
  bandaDeCara,
  type Cara,
  esquinas,
  FRONTAL_DE_ESQUINA,
  HOLGURA_DE_RAMPA,
  nivelDeRegion,
  rampas,
  relieve,
  SEMIANCHO_DE_PARED,
} from '../src/client/render/escenario/relieve.js';
import {
  encadenar,
  SEMIANCHO_DEL_PASILLO,
  SEMIANCHO_DEL_PASILLO_DE_MASA,
  type Senda,
  suavizar,
  VAIVEN,
} from '../src/client/render/escenario/sendas.js';
import { newGame } from '../src/core/state/setup.js';
import { leerCatalogo, textoDelCatalogo } from '../tools/taller/escenario/catalogo-disco.js';
import { catalogoDelDisco, escenaDe } from './helpers.js';

function franja(filas: readonly string[]): [number, number][] {
  const c: [number, number][] = [];
  filas.forEach((f, y) => {
    [...f].forEach((ch, x) => {
      if (ch === '#') c.push([x, y]);
    });
  });
  return c;
}

describe('el esqueleto de una franja', () => {
  it('una franja de 3 de ancho da UNA línea, no tres en paralelo', () => {
    const e = esqueleto(franja(['##########', '##########', '##########']));
    expect(componentesDePasos(e.casillas, e.pasos)).toBe(1);
    // Una línea: ninguna casilla con más de dos pasos.
    const grado = new Map<string, number>();
    for (const p of e.pasos)
      for (const c of [p.a, p.b]) grado.set(`${c}`, (grado.get(`${c}`) ?? 0) + 1);
    expect(Math.max(...grado.values())).toBeLessThanOrEqual(2);
    expect(new Set(e.pasos.map(ejeDe))).toEqual(new Set(['horizontal']));
  });

  it('una franja en L gira una vez y la torre va en el giro', () => {
    const e = esqueleto(
      franja(['##.......', '##.......', '##.......', '##.......', '#########', '#########']),
    );
    expect(componentesDePasos(e.casillas, e.pasos)).toBe(1);
    const ejes = new Set(e.pasos.map(ejeDe));
    expect(ejes.has('horizontal')).toBe(true);
    expect(ejes.has('profundidad')).toBe(true);
    expect(e.juntas.length).toBeGreaterThanOrEqual(3); // dos extremos y el giro
  });

  it('una franja en diagonal va por pasos diagonales', () => {
    const e = esqueleto(franja(['##....', '###...', '.###..', '..###.', '...###', '....##']));
    expect(componentesDePasos(e.casillas, e.pasos)).toBe(1);
    expect(e.pasos.map(ejeDe)).toContain('diagonal-baja');
  });
});

describe('el relieve', () => {
  const a = analizar(newGame({ seed: 9 }).map);
  const r = relieve(a);

  it('una cara cuelga de la casilla alta hacia la de abajo en pantalla', () => {
    expect(r.caras.length).toBeGreaterThan(0);
    for (const c of r.caras)
      for (let x = c.x0; x <= c.x1; x++) {
        const alta = r.nivel[c.y * a.W + x] as number;
        const baja = r.nivel[(c.y + 1) * a.W + x] as number;
        expect(alta - baja).toBe(c.caida);
      }
  });

  it('el agua va encajada por debajo de su orilla: el barranco', () => {
    for (const f of a.franjas.filter((k) => k.barrera === 'water'))
      for (const i of f.casillas)
        expect(r.nivel[i] as number).toBeLessThan(r.nivel[a.fuente[i] as number] as number);
  });

  it('el relieve no es un escalón por suelo: hay fronteras entre regiones al mismo nivel', () => {
    // Dos regiones vecinas a través de una franja, al mismo nivel: se separan por río o cañón.
    let mismoNivel = 0;
    for (const f of a.franjas.filter((k) => k.uso === 'borde')) {
      const niveles = new Set(f.casillas.map((i) => r.nivel[a.fuente[i] as number]));
      if (niveles.size === 1) mismoNivel++;
    }
    expect(mismoNivel).toBeGreaterThan(0);
  });

  it('la ciénaga va abajo y la nieve y la lava arriba', () => {
    for (const reg of a.regiones) {
      if (reg.suelo === 'swamp') expect(nivelDeRegion('swamp', 0, 0.9)).toBe(0);
      if (reg.suelo === 'snow') expect(nivelDeRegion('snow', 0, 0.9)).toBe(2);
    }
    expect(nivelDeRegion('grass', 0, 0.9)).toBe(1);
    expect(nivelDeRegion('grass', 0.5, 0.9)).toBe(2);
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
  const p = new Pasillo([ele, diagonal], S);
  /** Un punto como caja: el pasillo lo cubre si alguno de sus tramos le queda a menos de la media anchura. */
  const punto = (x: number, y: number) => [x, y, x, y] as const;

  it('cubre la unión entre dos casillas, el codo de una L y el medio de una diagonal', () => {
    // Lejos del centro de toda casilla: un disco por casilla no los cubriría.
    expect(p.pisa(punto(1.0, 0.5 + S - 0.05), S)).toBe(true);
    const k = (S - 0.05) / Math.SQRT2;
    expect(p.pisa(punto(5.0 + k, 1.0 - k), S)).toBe(true);
    expect(p.pisa(punto(1.5 + S - 0.05, 0.5), S)).toBe(true);
  });

  it('no pasa de la media anchura que se pregunta', () => {
    expect(p.pisa(punto(1.0, 0.5 + S + 0.1), S)).toBe(false);
    const k = (S + 0.1) / Math.SQRT2;
    expect(p.pisa(punto(5.0 + k, 1.0 - k), S)).toBe(false);
    // El mismo índice contesta por una media anchura menor.
    const m = SEMIANCHO_DEL_PASILLO_DE_MASA;
    expect(p.pisa(punto(1.0, 0.5 + m - 0.05), m)).toBe(true);
    expect(p.pisa(punto(1.0, 0.5 + m + 0.05), m)).toBe(false);
  });

  it('mide el rectángulo del sprite, no su pie', () => {
    // Una mata ancha (2:1) con el pie 0,6 por debajo de la senda: el pie está
    // fuera del pasillo y la imagen, que crece hacia arriba, lo cruza.
    const mata = { x: 1.0, y: 0.5 + S + 0.2, nw: 200, nh: 100, ax: 100, ay: 98, alto: 1 };
    expect(p.pisa(punto(mata.x, mata.y), S)).toBe(false);
    expect(p.pisa(cajaDeSprite(mata), S)).toBe(true);
    const alto = p.altoLibre(mata, S);
    expect(alto).toBeGreaterThan(0);
    expect(alto).toBeLessThan(mata.alto);
    expect(p.pisa(cajaDeSprite(mata, alto), S)).toBe(false);
    expect(p.pisa(cajaDeSprite(mata, alto + 0.01), S)).toBe(true);
    // Lejos de la senda, su alto entero.
    expect(p.altoLibre({ ...mata, y: 4 }, S)).toBe(mata.alto);
  });

  it('con el pie dentro, `altoLibre` contesta 0 por atajo, sin bisección: es lo que daría', () => {
    const pie = { x: 1.0, y: 0.55, nw: 200, nh: 100, ax: 100, ay: 98, alto: 1 };
    expect(p.pisa(punto(pie.x, pie.y), S)).toBe(true);
    expect(p.altoLibre(pie, S)).toBe(0);
    // Ni el alto más pequeño saca la caja del pasillo: el pie ya está dentro.
    expect(p.pisa(cajaDeSprite(pie, 1e-6), S)).toBe(true);
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
    // Para el pasillo, tocar en un punto es estar a distancia 0: la esquina pisa.
    expect(
      new Pasillo(
        [
          [
            [0, 2],
            [2, 0],
          ],
        ],
        S,
      ).pisa([1, 1, 3, 3], 0.01),
    ).toBe(true);
  });

  it('lanza con una media anchura que no es positiva o que pasa de la que se construyó', () => {
    expect(() => new Pasillo([ele], 0)).toThrow(/media anchura positiva/);
    expect(() => p.pisa(punto(1, 1), S + 0.01)).toThrow(/hasta 0.4/);
    expect(() => p.pisa([0, 0, 1, 1], 0)).toThrow(/no se puede preguntar/);
  });

  it('un tramo que cae en varias casillas y un trozo de muchos tramos se miden igual que sueltos', () => {
    // Una senda larga y fina: varios trozos y tramos en muchas casillas.
    const larga: Senda = Array.from({ length: 60 }, (_, i) => [
      0.5 + i * 0.1,
      3.5 + (i % 3) * 0.02,
    ]);
    const junta = new Pasillo([larga], S);
    const sueltos = larga
      .slice(1)
      .map((b, i) => new Pasillo([[larga[i] as readonly [number, number], b]], S));
    for (let x = 0; x < 7; x += 0.37)
      for (let y = 2.5; y < 4.6; y += 0.13) {
        const caja = [x, y, x + 0.3, y + 0.2] as const;
        expect(junta.pisa(caja, S)).toBe(sueltos.some((q) => q.pisa(caja, S)));
      }
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
  for (const semilla of [1, 3, 7, 9]) {
    const map = newGame({ seed: semilla }).map;
    const e = escenaDe(semilla);
    // Las laderas no viajan en la escena: se sacan del relieve, como `componer`.
    const { laderas } = relieve(analizar(map), semilla);

    it(`semilla ${semilla}: con el catálogo del repo no falta ningún módulo`, () => {
      expect(e.informe.modulosQueFaltan).toEqual([]);
    });

    it(`semilla ${semilla}: nada se apoya sobre un objeto ni un camino, y cada muralla es una línea`, () => {
      expect(e.informe.basesSobreReserva).toBe(0);
      expect(e.informe.murallasPartidas).toBe(0);
    });

    it(`semilla ${semilla}: toda casilla de barrera queda bajo su formación o bajo un objeto`, () => {
      expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
    });

    it(`semilla ${semilla}: ninguna mata, roca, orilla, árbol ni pico corta el pasillo de la senda`, () => {
      expect(e.informe.spritesSobreSenda).toBe(0);
      // Y medido aquí, no solo con la cuenta del informe: con los trazos que se
      // pintan, el rectángulo con el que se pinta cada sprite y la tabla de
      // qué clase se aparta cuánto.
      const pasillo = new Pasillo(e.sendas, SEMIANCHO_DEL_PASILLO);
      const cortan = e.sprites.filter((s) => {
        const r = APARTE[s.clase];
        return s.capa === 0 && r !== null && pasillo.pisa(cajaDeSprite(s), r.semiancho);
      });
      expect(cortan.map((s) => `${s.clase} ${s.src} en ${s.x},${s.y}`)).toEqual([]);
      // Que el guardia no mire al vacío: hay sendas, y hay de todo lo que vigila.
      expect(e.sendas.length).toBeGreaterThan(10);
      for (const [clase, r] of Object.entries(APARTE))
        if (r !== null) expect(e.sprites.some((s) => s.clase === clase)).toBe(true);
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

    // Las rampas (#150): las de las caras a mano están en `rampas.test.ts`.
    const rs = e.relieve.caras.flatMap((c) => c.rampas.map((r) => ({ c, r })));

    it(`semilla ${semilla}: ninguna pared pisa la senda que baja ni la de junto a ella, y ninguna va cortada`, () => {
      // Recontado aquí, con la senda de junto a las rampas derivada otra vez de la escena.
      // Las laderas se miden también contra lo que baja por una ladera; la
      // frontal, no (QA de #156, H2).
      const { junto, juntoDeLadera } = rampas(e.relieve.caras, laderas, e.sendas);
      const deLadera = modulosDeLadera(catalogo);
      const pisan = paredesSobreRampa(e.sprites, pasilloDeLaPared(junto), {
        pasillo: pasilloDeLaPared([...junto, ...juntoDeLadera]),
        es: (s) => s.src !== null && deLadera.has(s.src),
      });
      expect(pisan.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
      expect(e.informe.paredesSobreRampa).toBe(0);
      // Sin cortes rectos (decisión del usuario, 06-10-2026): una pared se
      // encoge, se corre o se quita, pero nunca lleva `recorte`.
      const cortadas = e.sprites.filter((s) => s.clase === 'pared' && s.recorte !== undefined);
      expect(cortadas.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
    });

    it(`semilla ${semilla}: toda pared se apoya en el pie de su cara, y su pedregal, en su banda y fuera de la senda`, () => {
      // Recontado aquí y no solo en el informe. Una pared corrida que conservaba
      // la y de su sitio quedaba de pie en el río, bajo su acantilado (#150, N1).
      const fuera = paredesFueraDelPie(e.sprites, e.relieve.caras);
      expect(fuera.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
      expect(e.informe.paredesFueraDelPie).toBe(0);
      // El pedregal no pisa ninguna senda, tampoco la que no baja (N3).
      const pasillo = new Pasillo(e.sendas, SEMIANCHO_DE_PARED);
      const peñascos = e.sprites.filter(
        (s) => s.clase === 'pared' && s.src?.includes('/rocas-caidas/') === true,
      );
      expect(peñascos.length).toBeGreaterThan(10);
      const pisan = peñascos.filter((s) => pasillo.pisa(cajaDeSprite(s), SEMIANCHO_DE_PARED));
      expect(pisan.map((s) => `${s.src} en ${s.x},${s.y}`)).toEqual([]);
    });

    // Las laderas (#156, §20): las de a mano están en `laderas.test.ts`.
    const puestas = e.sprites.filter((s) => s.src?.includes('/laderas-') === true);

    it(`semilla ${semilla}: las caídas al este y al oeste llevan ladera de su lado, con sus remates y esquinas`, () => {
      for (const lado of ['este', 'oeste'])
        expect(puestas.filter((s) => s.src?.includes(`-${lado}-`)).length).toBeGreaterThan(5);
      for (const nombre of ['inicio', 'medio-', 'fin', 'esquina'])
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

    it(`semilla ${semilla}: cada casilla de ladera lleva una ladera, los peñascos del canto o nada`, () => {
      // Recontado aquí desde los sprites. Lo que el test no sabe es si en una
      // casilla vacía cabía una ladera (las reservas viven en \`componer\`):
      // eso lo cuenta solo el informe.
      expect(
        laderasMalCubiertas(e.sprites, laderas, modulosDeLadera(catalogo), () => false),
      ).toEqual([]);
      expect(e.informe.laderasMalCubiertas).toBe(0);
      // Y hay de los tres: el recuento no pasa en blanco.
      const deCanto = e.sprites.filter(
        (s) => s.clase === 'roca' && s.src?.includes('/rocas-caidas/') === true,
      );
      expect(puestas.length).toBeGreaterThan(0);
      expect(deCanto.length).toBeGreaterThan(0);
    });

    it(`semilla ${semilla}: ninguna frontal monta sobre la frontal de una esquina más de SOLAPE_DE_ESQUINA`, () => {
      // La frontal de la esquina corre \`FRONTAL_DE_ESQUINA\` hacia la meseta
      // desde el filo de la esquina puesta (sus juntas); la caja del sprite no
      // sirve, que lleva el derrubio (de 0,89 a 1,3 casillas dentro de la cara).
      const rel = relieve(analizar(map), semilla);
      let vistas = 0;
      for (const [k, es] of esquinas(rel.caras, laderas).entries())
        for (const l of [es.oeste, es.este]) {
          if (l === undefined) continue;
          const c = rel.caras[k] as Cara;
          const hoja = hojaDeLadera(l);
          const m = juegoDeLadera(hoja, catalogo.hojas[hoja] ?? []).esquina;
          const p = colocarLadera(m, l, l.y1);
          const esquina = e.sprites.find((s) => s.src === m.src && s.x === p.x && s.y === p.y);
          if (esquina === undefined) continue;
          vistas++;
          const borde = juntasColocadas(m, esquina).filo[0];
          const pie = c.y + 1 + c.caida * ALTO_DE_NIVEL;
          // Lo que cada frontal de la cara entra en la frontal de la esquina, por
          // su ancla (que lleva hasta 0,05 de azar).
          const montan = e.sprites
            .filter(
              (s) =>
                s.src?.includes('/paredes-') === true &&
                Math.abs(s.y - pie - 0.05) <= 0.07 &&
                s.x >= c.x0 - 0.6 &&
                s.x <= c.x1 + 1.6,
            )
            .map((s) => ({
              s,
              entra:
                l.lado === 'este'
                  ? s.x - (borde - FRONTAL_DE_ESQUINA)
                  : borde + FRONTAL_DE_ESQUINA - s.x,
            }))
            .filter(({ entra }) => entra > SOLAPE_DE_ESQUINA + 0.051);
          expect(montan.map(({ s, entra }) => `${s.src} en ${s.x}: ${entra}`)).toEqual([]);
        }
      expect(vistas).toBeGreaterThan(0);
    });

    it(`semilla ${semilla}: hay rampas, alguna en diagonal, y cada tajo cae en su cara y solo llega a un extremo si la senda pasa a la holgura de él`, () => {
      expect(rs.some(({ r }) => cajaDe(r.trazos)[2] - cajaDe(r.trazos)[0] >= 0.3)).toBe(true);
      for (const { c, r } of rs) {
        const [x0, y0, x1, y1] = bandaDeCara(c);
        const [tx0, ty0, tx1, ty1] = cajaDe(r.trazos);
        expect(r.a).toBeGreaterThanOrEqual(x0);
        expect(r.b).toBeLessThanOrEqual(x1);
        expect(r.a).toBeLessThan(r.b);
        expect([tx0 >= r.a, tx1 <= r.b, ty0 >= y0 - 1e-9, ty1 <= y1 + 1e-9]).toEqual([
          true,
          true,
          true,
          true,
        ]);
        expect(r.dentro).toEqual([tx0 - HOLGURA_DE_RAMPA > x0, tx1 + HOLGURA_DE_RAMPA < x1]);
      }
    });
  }
});

/** La caja de todos los puntos de unos trazos: `[x0, y0, x1, y1]`. */
function cajaDe(trazos: readonly Senda[]): [number, number, number, number] {
  const xs = trazos.flat().map(([x]) => x);
  const ys = trazos.flat().map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

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
