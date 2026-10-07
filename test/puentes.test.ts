/**
 * Los puentes (#157): el nodo de agua es agua, la pieza sale de las orillas y
 * no de las vecinas, se apoya por el centro de su tablero, la senda acaba en
 * sus estribos y ninguna pared lo tapa.
 *
 * Las rejillas son a mano y las cuentas, las de las semillas 1-10; las de 1-40
 * (101 puentes) se miden con los guiones de `docs/agents/2026-10-07-puentes/`.
 */
import type { MapObject } from '@core/map/map.js';
import { isWalkable, type TerrainKind } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { EscenaAventura, focoDe } from '../src/client/escenas/aventura.js';
import { centrarEn, mundoAPixel, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import {
  analizar,
  type MapaDeEscena,
  regionPisable,
} from '../src/client/render/escenario/analizar.js';
import {
  CATALOGO_VACIO,
  type CatalogoEnBruto,
  catalogoValidado,
} from '../src/client/render/escenario/catalogo.js';
import {
  altoLibreAnteLosPuentes,
  CUBIERTA_PARA_QUEDARSE,
  componer,
  cubiertoDeLaCara,
  puentesTapados,
  type Sprite,
  tablerosAlPaso,
  tapaUnTablero,
} from '../src/client/render/escenario/colocar.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import {
  asentar,
  ejeMasCercano,
  type Punto,
  puenteBajo,
  puenteDe,
  sendasDeEstriboEnAgua,
  tramosHastaLosEstribos,
  vadosDeLosEstribos,
} from '../src/client/render/escenario/puentes.js';
import {
  bandaDeCara,
  rampas,
  relieve,
  SEMIANCHO_DE_PARED,
} from '../src/client/render/escenario/relieve.js';
import {
  claveDeFigura,
  escenarioDe,
  MASTIL_SOBRE_EL_NODO,
  OVALO_BAJO_EL_ASIENTO,
  pisada,
  topeDeAlejar,
} from '../src/client/render/escenario/superficie.js';
import { PIES } from '../src/client/render/mapa.js';
import { Session } from '../src/client/session.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';

/** Las semillas de los recuentos: 26 puentes. Las cifras de 1-40 están en `medir.ts` de la tarea. */
const SEMILLAS = Array.from({ length: 10 }, (_, k) => k + 1);

const SUELO: Readonly<Record<string, TerrainKind>> = {
  '.': 'grass',
  d: 'dirt',
  '~': 'water',
  N: 'dirt',
};

/** Un mapa de una rejilla de texto: `~` agua, `.` prado, `d` tierra y `N` el nodo. */
function mapaDe(filas: readonly string[], conCamino = false): MapaDeEscena {
  const W = (filas[0] as string).length;
  const terrain = filas.flatMap((f) => [...f].map((c) => SUELO[c] as TerrainKind));
  const y = filas.findIndex((f) => f.includes('N'));
  const at = { x: (filas[y] as string).indexOf('N'), y };
  const nodo: MapObject = { kind: 'node', id: 'nodo-0', at, owner: null };
  return {
    width: W,
    height: filas.length,
    terrain,
    caminos: {
      tramos: conCamino
        ? [
            [
              { x: at.x, y: at.y - 1 },
              { x: at.x, y: at.y },
            ],
            [
              { x: at.x, y: at.y },
              { x: at.x, y: at.y + 1 },
            ],
          ]
        : [],
    },
    objects: [nodo],
  };
}

/** El puente del único nodo de la rejilla, con el nivel que se le dé (o todo a 1). */
function puenteDeRejilla(
  filas: readonly string[],
  opciones: { conCamino?: boolean; nivel?: (x: number, y: number) => number } = {},
) {
  const map = mapaDe(filas, opciones.conCamino);
  const a = analizar(map);
  const nivel = Array.from({ length: a.W * a.H }, (_, i) =>
    (opciones.nivel ?? (() => 1))(i % a.W, Math.floor(i / a.W)),
  );
  return puenteDe(map.objects[0] as MapObject, a, nivel, map.caminos.tramos, catalogoDelDisco());
}

const RIO_A_LO_ANCHO = ['.....', '.....', '~~N~~', '.....', '.....'];
const RIO_HACIA_EL_FONDO = ['..~..', '..~..', '..N..', '..~..', '..~..'];

describe('la casilla del nodo de agua es agua (#157)', () => {
  it('en una rejilla a mano: une el río, va al nivel del agua y no tiene caras', () => {
    const map = mapaDe(RIO_A_LO_ANCHO);
    const a = analizar(map);
    const nodo = 2 * 5 + 2;
    expect(a.terreno[nodo]).toBe('water');
    // El mapa no se toca: la escena lleva su propia copia.
    expect(map.terrain[nodo]).toBe('dirt');
    expect(a.franjaDe[nodo]).toBe(a.franjaDe[2 * 5]);
    expect(a.franjaDe[nodo]).toBe(a.franjaDe[2 * 5 + 4]);
    const rel = relieve(a, 1);
    const orillas = [1 * 5 + 2, 3 * 5 + 2].map((i) => rel.nivel[i] as number);
    expect(rel.nivel[nodo]).toBe(Math.max(-1, Math.min(...orillas) - 1));
    expect(rel.nivel[nodo]).toBe(rel.nivel[2 * 5]);
    // Ninguna cara cuelga de la casilla del nodo: el agua es lo bajo.
    expect(rel.caras.some((c) => c.y === 2 && c.x0 <= 2 && c.x1 >= 2)).toBe(false);
  });

  it('en las semillas 1-10, toda casilla de puente está en el agua de la escena', () => {
    for (const s of SEMILLAS) {
      const { map, escena: e } = partidaDe(s);
      const agua = new Set(e.agua);
      for (const pu of e.puentes) {
        const o = map.objects.find((x) => x.id === pu.id) as MapObject;
        expect(agua.has(o.at.y * e.W + o.at.x), `s${s} ${pu.id}`).toBe(true);
      }
    }
  });
});

describe('la pieza sale de las orillas, no de las vecinas', () => {
  it('cruza entre las dos orillas que se miran: N-S, E-O y las dos diagonales', () => {
    expect(puenteDeRejilla(RIO_A_LO_ANCHO).eje).toBe('ns');
    expect(puenteDeRejilla(RIO_HACIA_EL_FONDO).eje).toBe('eo');
    const ns = puenteDeRejilla(RIO_A_LO_ANCHO);
    expect(ns.centro).toEqual([2.5, 2.5]);
    expect(ns.pieza).toBe('puente-troncos-ns');
    expect(puenteDeRejilla(['~~~..', '~~~.~', '~~N~~', '~.~~~', '..~~~']).eje).toBe('ne-so');
    expect(puenteDeRejilla(['..~~~', '~.~~~', '~~N~~', '~~~.~', '~~~..']).eje).toBe('no-se');
  });

  it('un cruce quebrado (oeste ↔ noreste) va en la diagonal más cercana, entre las orillas y con el medio visible en el nodo', () => {
    const p = puenteDeRejilla(['~~~dd', '~~~dd', '..N~~', '~~~~~', '~~~~~']);
    expect(p.eje).toBe('ne-so');
    // Entre (1, 2) y (3, 1) el punto medio de sus centros es (2,5; 2), pero
    // alzado el tablero caería en la fila de arriba: se corre lo justo hacia
    // abajo para que su medio, como se ve, caiga en la casilla del nodo (H2).
    const altura = (p.tablero[0] as Punto)[1] - (p.tablero[1] as Punto)[1];
    expect(p.centro[0]).toBe(2.5);
    expect(p.centro[1]).toBeGreaterThan(2);
    expect(p.centro[1]).toBeLessThanOrEqual(2.5);
    expect(Math.floor(p.centro[1] - altura)).toBe(2);
  });

  it('el eje más cercano corta en tan 22,5°', () => {
    expect(ejeMasCercano(2, 0.8)).toBe('eo');
    expect(ejeMasCercano(2, 0.9)).toBe('no-se');
    expect(ejeMasCercano(0.8, -2)).toBe('ns');
    expect(ejeMasCercano(-0.9, 2)).toBe('ne-so');
  });

  it('sube con la orilla alta al norte (N-S) o al este (E-O); con la alta al sur o al oeste, el plano', () => {
    const alNorte = (_x: number, y: number) => (y < 2 ? 2 : 1);
    const alSur = (_x: number, y: number) => (y > 2 ? 2 : 1);
    const alEste = (x: number) => (x > 2 ? 2 : 1);
    const alOeste = (x: number) => (x < 2 ? 2 : 1);
    const ns = { conCamino: true };
    expect(puenteDeRejilla(RIO_A_LO_ANCHO, { ...ns, nivel: alNorte }).pieza).toBe(
      'puente-piedra-ns-sube',
    );
    expect(puenteDeRejilla(RIO_A_LO_ANCHO, { ...ns, nivel: alSur }).pieza).toBe('puente-piedra-ns');
    expect(puenteDeRejilla(RIO_HACIA_EL_FONDO, { ...ns, nivel: alEste }).pieza).toBe(
      'puente-piedra-eo-sube',
    );
    expect(puenteDeRejilla(RIO_HACIA_EL_FONDO, { ...ns, nivel: alOeste }).pieza).toBe(
      'puente-piedra-eo',
    );
    // Los de troncos no tienen arte que suba (§21): el plano.
    expect(puenteDeRejilla(RIO_A_LO_ANCHO, { nivel: alNorte }).pieza).toBe('puente-troncos-ns');
  });

  it('sin el arte, el puente se decide igual y sale su marcador', () => {
    const map = mapaDe(RIO_A_LO_ANCHO, true);
    const e = componer(map, 1, CATALOGO_VACIO);
    expect(e.puentes.map((p) => p.pieza)).toEqual(['puente-piedra-ns']);
    expect(e.informe.modulosQueFaltan).toContain('puente-piedra-ns');
    const s = e.sprites.find((x) => x.objeto?.id === 'nodo-0');
    expect(s?.src).toBeNull();
  });

  it('en las semillas 1-10 salen los cruces del diagnóstico', () => {
    const rectos: Record<string, number> = {};
    let piedra = 0;
    let total = 0;
    let quebrados = 0;
    let quebradosEnDiagonal = 0;
    for (const s of SEMILLAS)
      for (const p of partidaDe(s).escena.puentes) {
        total++;
        if (p.clase === 'piedra') piedra++;
        if (p.centro[0] === p.nodo[0] && p.centro[1] === p.nodo[1] && p.escala === 1)
          rectos[p.eje] = (rectos[p.eje] ?? 0) + 1;
        else {
          quebrados++;
          if (p.eje === 'ne-so' || p.eje === 'no-se') quebradosEnDiagonal++;
        }
      }
    expect(total).toBe(26);
    // 8 y 9 rectos (en 1-10 no hay diagonal que se mire) y 9 quebrados: casi
    // todos en diagonal, y alguno recto si así su medio cae en el nodo (`asentar`).
    expect(rectos).toEqual({ ns: 8, eo: 9 });
    expect(quebrados).toBe(9);
    expect(quebradosEnDiagonal).toBe(8);
    expect(piedra).toBe(10);
  });
});

describe('la pieza se apoya por el centro de su tablero', () => {
  it('su alto en casillas es su imagen entre su casilla, y el ancla baja del tablero al suelo', () => {
    const cat = catalogoDelDisco();
    let vistos = 0;
    for (const s of SEMILLAS) {
      const e = partidaDe(s).escena;
      for (const pu of e.puentes) {
        const sp = e.sprites.find((x) => x.objeto?.id === pu.id);
        const p = cat.piezas[pu.pieza];
        expect(sp?.src, pu.pieza).toBe(`${pu.pieza}.webp`);
        if (sp === undefined || p?.puente === undefined) throw new Error(`${pu.pieza} sin medir`);
        // Por su escala: 1 en los rectos; la que asienta los estribos en los quebrados.
        expect(sp.alto * p.puente.pxPorCasilla).toBeCloseTo(p.nh * pu.escala, 6);
        expect(sp.ay).toBeCloseTo(p.ay + p.puente.altura * p.puente.pxPorCasilla, 6);
        expect([sp.x, sp.y]).toEqual(pu.centro);
        vistos++;
      }
    }
    expect(vistos).toBe(26);
  });

  it('el catálogo lanza con un puente sin medidas, con medidas que no son de un puente o que no valen', () => {
    const pieza = { src: 'x.webp', nw: 10, nh: 10, ax: 5, ay: 5 };
    const medidas = { pxPorCasilla: 400, altura: 0.4, largo: 2.96 };
    const con = (piezas: CatalogoEnBruto['piezas']) => () =>
      catalogoValidado({ hojas: {}, piezas });
    expect(con({ 'puente-piedra-ns': pieza })).toThrow(/derivar-puentes/);
    expect(con({ ciudad: { ...pieza, puente: medidas } })).toThrow(/no es un puente/);
    expect(con({ 'puente-troncos-eo': { ...pieza, puente: { ...medidas, largo: 0 } } })).toThrow(
      /largo es un número positivo/,
    );
    expect(con({ 'puente-troncos-eo': { ...pieza, puente: medidas } })).not.toThrow();
  });
});

describe('la senda llega a los estribos y no cruza por encima', () => {
  it('en una rejilla a mano: lo que quedaba bajo el puente se salta, sin gancho', () => {
    const tramos = [0.5, 1.5, 2.5, 3.5].map((y) => [2.5, y, 2.5, y + 1] as const);
    const fuera = tramosHastaLosEstribos(tramos, [
      {
        nodo: [2.5, 2.5],
        centro: [2.5, 2.5],
        extremos: [
          [2.5, 1.02],
          [2.5, 3.98],
        ],
      },
    ]);
    expect(fuera).toEqual([
      [2.5, 1.02, 2.5, 0.5],
      [2.5, 3.98, 2.5, 4.5],
    ]);
  });

  it('en las semillas 1-10: nada de la senda a menos de 0,3 del centro, y cada camino del nodo acaba en un estribo', () => {
    for (const s of SEMILLAS) {
      const { map, escena: e } = partidaDe(s);
      for (const pu of e.puentes) {
        const [cx, cy] = pu.centro;
        for (const senda of e.sendas)
          for (const [x, y] of senda)
            expect(Math.hypot(x - cx, y - cy), `s${s} ${pu.id}`).toBeGreaterThanOrEqual(0.3);
        const o = map.objects.find((x) => x.id === pu.id) as MapObject;
        const llegan = map.caminos.tramos.filter(([p, q]) =>
          [p, q].some((r) => r.x === o.at.x && r.y === o.at.y),
        ).length;
        const enUnEstribo = e.sendas
          .flatMap((senda) => [senda[0], senda.at(-1)])
          .filter((p) =>
            pu.extremos.some(
              (x) => p !== undefined && Math.abs(p[0] - x[0]) + Math.abs(p[1] - x[1]) < 1e-9,
            ),
          ).length;
        expect(enUnEstribo, `s${s} ${pu.id}`).toBe(llegan);
      }
    }
  });
});

describe('nada que se pinte encima tapa un puente', () => {
  it('en las semillas 1-10, contado desde el orden del pintor', () => {
    for (const s of SEMILLAS) {
      const e = partidaDe(s).escena;
      expect(puentesTapados(e.sprites, e.puentes), `semilla ${s}`).toEqual([]);
      expect(e.informe.puentesTapados, `semilla ${s}`).toBe(0);
    }
  });

  describe('en un puente a mano, con su tablero de (4, 5) a (6, 5) alzado 0,4', () => {
    const puente = {
      id: 'p',
      centro: [5, 5] as const,
      tablero: [
        [4, 5],
        [4, 4.6],
        [6, 4.6],
        [6, 5],
      ] as const,
    };
    const sprite = (y: number, clase: Sprite['clase'], alto = 1): Sprite => ({
      src: 'x.webp',
      nw: 100,
      nh: 100,
      ax: 50,
      ay: 100,
      x: 5,
      y,
      alto,
      clase,
      color: '#000',
      capa: 0,
      sombra: false,
    });
    const delPuente: Sprite = { ...sprite(5, 'objeto', 1.5), objeto: { id: 'p', kind: 'node' } };
    const tableros = tablerosAlPaso([puente]);

    it('la pared de detrás pisa el tablero y no lo tapa: la pinta antes el pintor y la puerta la deja', () => {
      const detras = sprite(4.9, 'pared');
      expect(cajaDeSprite(detras)[3]).toBeGreaterThan(4.6);
      expect(puentesTapados([detras, delPuente], [puente])).toEqual([]);
      expect(altoLibreAnteLosPuentes(detras, tableros, SEMIANCHO_DE_PARED)).toBe(1);
    });

    it('la de delante lo tapa: el guardia la cuenta y la puerta la encoge', () => {
      const delante = sprite(5.3, 'pared');
      expect(puentesTapados([delPuente, delante], [puente])).toEqual([delante]);
      expect(altoLibreAnteLosPuentes(delante, tableros, SEMIANCHO_DE_PARED)).toBeLessThan(1);
    });

    it('lo plano va al suelo, debajo del puente: delante y encima del tablero, ni lo tapa ni se aparta', () => {
      const mata = sprite(5.3, 'cubierta', 0.5);
      expect(puentesTapados([delPuente, mata], [puente])).toEqual([]);
      expect(tapaUnTablero(mata, tableros, SEMIANCHO_DE_PARED)).toBe(false);
      expect(tapaUnTablero(sprite(5.3, 'cubierta', 0.9), tableros, SEMIANCHO_DE_PARED)).toBe(true);
    });

    it('el guardia lanza si el puente no está entre lo que se pinta', () => {
      expect(() => puentesTapados([sprite(5.3, 'pared')], [puente])).toThrow(
        /no está entre los volúmenes/,
      );
    });
  });

  it('la línea del puente abre tajo en la cara como una senda, pero no aparta la pared como ella', () => {
    const cara = { y: 2, x0: 0, x1: 8, caida: 1, material: 'cara-roca' };
    const linea = [
      [4.5, 2.5],
      [4.5, 4.5],
    ] as const;
    const comoSenda = rampas([cara], [], [linea]);
    const comoCorte = rampas([cara], [], [], [linea]);
    expect(comoCorte.porCara).toEqual(comoSenda.porCara);
    expect(comoCorte.porCara[0]).toHaveLength(1);
    expect(comoSenda.junto.length).toBeGreaterThan(0);
    expect(comoCorte.junto).toEqual([]);
  });
});

describe('la cara que cede su pared a un puente no se queda lisa', () => {
  it('en las semillas 1-10: la que se abre está junto a un puente, sin rampa, y la pared la tapa menos de lo que pide quedarse', () => {
    let abiertas = 0;
    for (const s of SEMILLAS) {
      const e = partidaDe(s).escena;
      const paredes = e.sprites.filter((x) => x.clase === 'pared').map((x) => cajaDeSprite(x));
      for (const c of e.relieve.caras) {
        if (c.abierta !== true) continue;
        abiertas++;
        const [x0, y0, x1, y1] = bandaDeCara(c);
        const cerca = e.puentes.some(
          ({ centro: [cx, cy] }) =>
            Math.max(x0 - cx, cx - x1, 0) <= 2 && Math.max(y0 - cy, cy - y1, 0) <= 2,
        );
        expect(cerca, `s${s} cara ${c.y} ${c.x0}-${c.x1}`).toBe(true);
        expect(c.rampas).toEqual([]);
        // Medido aquí, con otro paso: lo que tapa la pared a un cuarto y a la
        // mitad de su alto. Solo a un cuarto contaba como tapada la cara de s6
        // y3 x28, donde queda de la pared un remate de arriba que no baja ni a la
        // mitad: se abre bien, y el remate hace de canto de la orilla.
        const xs = Array.from(
          { length: Math.round((x1 - x0) / 0.1) },
          (_, k) => x0 + 0.05 + k * 0.1,
        );
        const tapadas = xs.filter((x) =>
          [y0 + (y1 - y0) / 4, (y0 + y1) / 2].every((y) =>
            paredes.some(([px0, py0, px1, py1]) => x >= px0 && x <= px1 && y >= py0 && y <= py1),
          ),
        );
        expect(tapadas.length / xs.length, `s${s} cara ${c.y}`).toBeLessThan(
          CUBIERTA_PARA_QUEDARSE,
        );
      }
    }
    // Que el test no pase en vacío: alguna se abre.
    expect(abiertas).toBeGreaterThan(0);
  });
});

describe('los cruces quebrados se asientan con los dos estribos en tierra', () => {
  it('en una rejilla a mano: el punto medio dejaba un estribo en el agua, y se corre o se encoge', () => {
    // El nodo 4 de la semilla 8, copiado, de piedra: norte ↔ suroeste, con las
    // orillas en (2, 1) y (1, 3). Desde su punto medio, a la escala 1, el
    // tablero de piedra es largo y un estribo cae en el agua.
    const filas = ['~~~dd', '~~d~d', '~~N~~', '~.~~~', '...~~'];
    const a = analizar(mapaDe(filas));
    const region = ([x, y]: readonly [number, number]) => regionPisable(a, x, y);
    const largo = catalogoDelDisco().piezas['puente-piedra-ne-so']?.puente?.largo ?? 0;
    const u = largo / 2 / Math.SQRT2;
    expect([region([2 - u, 2.5 + u]), region([2 + u, 2.5 - u])]).toContain(-1);
    const p = puenteDeRejilla(filas, { conCamino: true });
    expect(p.clase).toBe('piedra');
    expect([p.centro, p.escala]).not.toEqual([[2, 2.5], 1]);
    // Y el medio del tablero, como se ve, en la casilla del nodo (H2): aquí, de
    // norte a sur hasta la orilla de (2, 4), que es la misma que la de (1, 3).
    const altura = (p.tablero[0] as Punto)[1] - (p.tablero[1] as Punto)[1];
    expect([Math.floor(p.centro[0]), Math.floor(p.centro[1] - altura)]).toEqual([2, 2]);
    const [r0, r1] = p.extremos.map(region);
    expect(r0).toBeGreaterThanOrEqual(0);
    expect(r1).toBeGreaterThanOrEqual(0);
    expect(r0).not.toBe(r1);
  });

  it('asentar devuelve null si ninguna posición deja los dos estribos en tierra', () => {
    const map = mapaDe(['~~~~~', '~~~~~', '~~N~~', '~~~~~', '~~~~~']);
    const a = analizar(map);
    expect(
      asentar([2.5, 2.5], [2.5, 2.5], [1, 0], [0, 1], a, () => ({ largo: 2, altura: 0.3 })),
    ).toBeNull();
  });

  it('en las semillas 1-10, ningún estribo en el agua ni fuera de su orilla', () => {
    for (const s of SEMILLAS) {
      const { map, escena: e } = partidaDe(s);
      const a = analizar(map);
      for (const pu of e.puentes) {
        const regiones = pu.extremos.map(([x, y]) => regionPisable(a, x, y));
        expect(Math.min(...regiones), `s${s} ${pu.id}`).toBeGreaterThanOrEqual(0);
        expect(regiones[0], `s${s} ${pu.id}`).not.toBe(regiones[1]);
        expect(pu.escala, `s${s} ${pu.id}`).toBeGreaterThanOrEqual(0.7);
        expect(pu.escala, `s${s} ${pu.id}`).toBeLessThanOrEqual(1.15);
      }
    }
  });
});

describe('la marca del dueño va sobre el tablero, no en el río', () => {
  it('en las semillas 1-10: en la línea del tablero alzada, y en la casilla del nodo', () => {
    for (const s of SEMILLAS) {
      const { map, escena } = partidaDe(s);
      for (const pu of escena.puentes) {
        const o = map.objects.find((x) => x.id === pu.id) as MapObject;
        const [[x0, y0], , , [x1, y1]] = pu.tablero as [Punto, Punto, Punto, Punto];
        const altura = y0 - (pu.tablero[1] as Punto)[1];
        const [ax, ay] = pu.asiento;
        // Sobre la recta del tablero, alzada su altura.
        const cruz = (x1 - x0) * (ay + altura - y0) - (y1 - y0) * (ax - x0);
        expect(Math.abs(cruz), `s${s} ${pu.id}`).toBeLessThan(1e-9);
        expect(Math.floor(ax), `s${s} ${pu.id}`).toBe(o.at.x);
        expect(Math.floor(ay), `s${s} ${pu.id}`).toBe(o.at.y);
      }
    }
  });
});

describe('el asiento de la marca es siempre un punto', () => {
  it('en las semillas 1-10: todo lo horneado lo tiene; el centro de su casilla, o en un puente el tablero con el óvalo centrado en él', () => {
    for (const s of SEMILLAS) {
      const { map } = partidaDe(s);
      const esc = escenarioDe(map, s);
      const puentes = new Map(esc.escena.puentes.map((p) => [p.id, p.asiento]));
      expect([...esc.asientoDeObjeto.keys()].sort()).toEqual([...esc.claveDeObjeto.keys()].sort());
      for (const o of map.objects) {
        const a = esc.asientoDeObjeto.get(o.id);
        if (!esc.claveDeObjeto.has(o.id)) continue;
        const p = puentes.get(o.id);
        expect(a, `s${s} ${o.id}`).toEqual(
          p === undefined ? [o.at.x + 0.5, o.at.y + 0.5] : [p[0], p[1] - OVALO_BAJO_EL_ASIENTO],
        );
      }
    }
  });
});

/** El punto del tablero alzado a la fracción `t` (−0,5 un extremo, 0,5 el otro). */
function enElTablero(pu: { readonly tablero: readonly Punto[] }, t: number): Punto {
  const [a, b] = [pu.tablero[1], pu.tablero[2]] as [Punto, Punto];
  return [a[0] + (t + 0.5) * (b[0] - a[0]), a[1] + (t + 0.5) * (b[1] - a[1])];
}

/** Si la casilla `(x, y)` de un mapa se pisa: lo que el cliente le pasa a `puenteBajo`. */
const pisableEn =
  (map: Pick<MapaDeEscena, 'width' | 'height' | 'terrain'>) => (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    return isWalkable(map.terrain[y * map.width + x] as TerrainKind);
  };

describe('pulsar el puente lleva a su nodo (H2 del QA de #157)', () => {
  it('en un puente a mano: el tablero y el arco cogen el puente; el centro de la orilla, no', () => {
    const filas = RIO_HACIA_EL_FONDO;
    const pu = puenteDeRejilla(filas);
    const pisable = pisableEn(mapaDe(filas));
    expect(pu.eje).toBe('eo');
    // El medio del tablero, alzado, y el arco de debajo, sobre la casilla del nodo.
    expect(puenteBajo([pu], ...enElTablero(pu, 0), pisable)).toBe(pu);
    expect(puenteBajo([pu], 2.5, 2.45, pisable)).toBe(pu);
    // La casilla de agua de encima, donde asoma el pretil.
    expect(puenteBajo([pu], 2.5, 1.95, pisable)).toBe(pu);
    // El centro de la casilla de la orilla, aunque el estribo pase por él: es la orilla.
    expect(puenteBajo([pu], 1.5, 2.5, pisable)).toBeNull();
    expect(puenteBajo([pu], 0.5, 0.5, pisable)).toBeNull();
  });

  it('en las semillas 1-10: el tablero coge su puente sobre el agua y sobre su nodo; sobre otra tierra, nunca', () => {
    // La tierra de otra casilla manda aunque el tablero la tape en pantalla:
    // en un N-S es la orilla norte, por donde se entra (H9 del QA de #157).
    let sobreTierra = 0;
    for (const s of SEMILLAS) {
      const { map, escena } = partidaDe(s);
      const pisable = pisableEn(map);
      for (const pu of escena.puentes) {
        const nodo = pu.nodo.map(Math.floor).join(',');
        for (let k = -25; k <= 25; k += 5) {
          const punto = enElTablero(pu, k / 100);
          const casilla = punto.map(Math.floor) as [number, number];
          const coge = puenteBajo(escena.puentes, ...punto, pisable)?.id;
          if (casilla.join(',') === nodo || !pisable(...casilla)) {
            expect(coge, `s${s} ${pu.id} t=${k / 100}`).toBe(pu.id);
          } else {
            sobreTierra++;
            expect(coge, `s${s} ${pu.id} t=${k / 100}`).toBeUndefined();
          }
        }
      }
    }
    // Que la prueba de la tierra no pase en vacío.
    expect(sobreTierra).toBeGreaterThan(0);
  });

  it('en las semillas 1-40, el medio del tablero cae en la casilla del nodo salvo en 4, y ahí la toca', () => {
    // El medio alzado fuera de la casilla del nodo: 26 de 101 antes del arreglo.
    let fuera = 0;
    for (let s = 1; s <= 40; s++) {
      const { map, escena } = partidaDe(s);
      for (const pu of escena.puentes) {
        const o = map.objects.find((x) => x.id === pu.id) as MapObject;
        const enElNodo = ([x, y]: Punto) => Math.floor(x) === o.at.x && Math.floor(y) === o.at.y;
        if (enElNodo(enElTablero(pu, 0))) continue;
        fuera++;
        const toca = Array.from({ length: 41 }, (_, k) => enElTablero(pu, -0.5 + k / 40));
        expect(toca.some(enElNodo), `s${s} ${pu.id}`).toBe(true);
      }
    }
    expect(fuera).toBe(4);
  });

  it('en el cliente, s15: pulsar el tablero del puente de (16,1) sobre el agua lo señala y anda hacia él', () => {
    // Antes: «No hay camino hasta (16,0).», y el héroe no se movía.
    const s = new Session(15);
    s.revealAll = true;
    const esc = escenarioDe(s.state.map, s.state.seed);
    const escena = new EscenaAventura(() => s);
    const [ancho, alto] = [1600, 1000];
    escena.encuadrar(ancho, alto);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho,
      alto,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
      tileMinimo: topeDeAlejar(esc, ancho, alto),
    });
    const nodo = s.state.map.objects.find(
      (o) => o.kind === 'node' && o.at.x === 16 && o.at.y === 1,
    ) as MapObject;
    const pu = esc.escena.puentes.find((p) => p.id === nodo.id);
    if (pu === undefined) throw new Error('s15 ya no tiene el puente de (16,1)');
    // Hacia el noreste del medio: el tablero se ve sobre el agua de (16,0).
    const punto = enElTablero(pu, 0.2);
    expect(punto.map(Math.floor)).toEqual([16, 0]);
    const p = mundoAPixel(camara, ...punto);
    escena.mover(p.x, p.y);
    expect(s.status).toMatch(/^Paso sin dueño · /);
    const antes = { ...s.selectedHero!.at };
    escena.bajar(p.x, p.y);
    escena.soltar(p.x, p.y, false);
    expect(s.status).not.toMatch(/No hay camino/);
    expect(s.selectedHero!.at).not.toEqual(antes);
  });
  it('en el cliente, s18: pulsar al héroe que espera en la orilla norte de un N-S no lo baja al puente (H9)', () => {
    // El tablero alzado de (4,10) tapa en pantalla la casilla de la orilla
    // norte, (4,9): pulsar las piernas del héroe que esperaba en ella lo bajaba
    // al puente y lo tomaba.
    const s = new Session(18);
    s.revealAll = true;
    const esc = escenarioDe(s.state.map, s.state.seed);
    const escena = new EscenaAventura(() => s);
    const [ancho, alto] = [1600, 1000];
    escena.encuadrar(ancho, alto);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho,
      alto,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
      tileMinimo: topeDeAlejar(esc, ancho, alto),
    });
    const nodo = s.state.map.objects.find(
      (o) => o.kind === 'node' && o.at.x === 4 && o.at.y === 10,
    ) as MapObject;
    const pu = esc.escena.puentes.find((p) => p.id === nodo.id);
    if (pu === undefined) throw new Error('s18 ya no tiene el puente de (4,10)');
    expect(pu.eje).toBe('ns');
    const pulsar = (x: number, y: number): void => {
      const p = mundoAPixel(camara, x, y);
      escena.mover(p.x, p.y);
      escena.bajar(p.x, p.y);
      escena.soltar(p.x, p.y, false);
    };
    // Las piernas y el centro de la orilla caen bajo el tablero: que la prueba no pase en vacío.
    const pisable = pisableEn(s.state.map);
    expect(puenteBajo(esc.escena.puentes, 4.5, 9.55, () => false)).toBe(pu);
    expect(puenteBajo(esc.escena.puentes, 4.5, 9.55, pisable)).toBeNull();
    expect(puenteBajo(esc.escena.puentes, 4.5, 9.5, pisable)).toBeNull();
    // Al centro de la orilla norte: el héroe llega a ella, no al puente.
    pulsar(4.5, 9.5);
    expect(s.selectedHero!.at).toEqual({ x: 4, y: 9 });
    // Sus piernas: ya está ahí, y no se mueve.
    const p = mundoAPixel(camara, 4.5, 9.55);
    escena.mover(p.x, p.y);
    expect(s.status).not.toMatch(/^Paso sin dueño/);
    pulsar(4.5, 9.55);
    expect(s.selectedHero!.at).toEqual({ x: 4, y: 9 });
    // Y el tablero sobre el nodo sigue llevando al puente.
    pulsar(...enElTablero(pu, 0));
    expect(s.selectedHero!.at).toEqual({ x: 4, y: 10 });
  });
});

describe('la bandera del dueño se planta en el tablero (H1 del QA de #157)', () => {
  it('en las semillas 1-10: el pie del mástil está en el tablero alzado, hacia su extremo de la derecha (abajo en N-S)', () => {
    for (const s of SEMILLAS) {
      const { map } = partidaDe(s);
      const esc = escenarioDe(map, s);
      for (const pu of esc.escena.puentes) {
        const [mx, my] = pu.mastil;
        const [px, py] = enElTablero(pu, 0.28);
        expect(mx, `s${s} ${pu.id}`).toBeCloseTo(px, 9);
        // En una pieza que sube, el tablero sube un nivel (0,6) de punta a punta.
        const subida = !pu.pieza.endsWith('-sube')
          ? 0
          : (pu.eje === 'eo' ? 1 : -1) * 0.28 * 0.6 * pu.escala;
        expect(my, `s${s} ${pu.id}`).toBeCloseTo(py - subida, 9);
        expect(esc.mastilDeNodo.get(pu.id)).toEqual(pu.mastil);
      }
      // Los demás nodos, como siempre: sobre el centro de su casilla.
      for (const o of map.objects) {
        if (o.kind !== 'node' || esc.escena.puentes.some((p) => p.id === o.id)) continue;
        expect(esc.mastilDeNodo.get(o.id)).toEqual([
          o.at.x + 0.5,
          o.at.y + 0.5 - MASTIL_SOBRE_EL_NODO,
        ]);
      }
    }
  });
});

describe('quien pisa un puente se pinta en su tablero (H3 del QA de #157)', () => {
  it('en las semillas 1-10: en la casilla del nodo, los pies en el asiento y después del puente', () => {
    for (const s of SEMILLAS) {
      const { map } = partidaDe(s);
      const esc = escenarioDe(map, s);
      for (const pu of esc.escena.puentes) {
        const at = { x: Math.floor(pu.nodo[0]), y: Math.floor(pu.nodo[1]) };
        const p = pisada(esc, at, PIES.heroe);
        expect([p.x, p.y], `s${s} ${pu.id}`).toEqual(pu.asiento);
        // A igual clave se pinta antes el volumen: la figura va encima del puente.
        expect(p.clave).toBeGreaterThanOrEqual(esc.claveDeObjeto.get(pu.id) as number);
      }
      // Fuera de los puentes, como antes.
      const p = pisada(esc, { x: 0, y: 0 }, PIES.heroe);
      expect(p).toEqual({ x: 0.5, y: PIES.heroe, clave: claveDeFigura(esc, 0, PIES.heroe) });
    }
  });
});

describe('la senda llega al estribo por tierra (H4 del QA de #157)', () => {
  it('en una rejilla a mano: la diagonal entre dos orillas que se tocan por la esquina lleva vado', () => {
    // El estribo sur cae en (2,3), que solo toca la orilla de (1,4) por la esquina.
    const agua = new Set(['2,2', '1,3', '2,4']);
    const esAgua = (x: number, y: number) => agua.has(`${x},${y}`);
    const puente = { extremos: [[2.5, 1.02] as Punto, [2.5, 3.98] as Punto] as const };
    const senda: Punto[] = Array.from({ length: 21 }, (_, k) => [2.5 - k * 0.05, 3.98 + k * 0.05]);
    const vados = vadosDeLosEstribos([senda], [puente], esAgua);
    expect(vados).toHaveLength(1);
    expect(vados[0]?.[0]).toEqual([2.5, 3.98]);
    expect(sendasDeEstriboEnAgua([senda], [puente], vados, esAgua)).toEqual([]);
    expect(sendasDeEstriboEnAgua([senda], [puente], [], esAgua)).toHaveLength(1);
    // La que no pasa por agua no lleva vado.
    const seca: Punto[] = [
      [2.5, 3.98],
      [2.5, 4.9],
    ];
    expect(vadosDeLosEstribos([seca], [puente], () => false)).toEqual([]);
  });

  it('en las semillas 1-10: ninguna senda de estribo pasa por agua pintada, y sin vados pasarían', () => {
    let sinVados = 0;
    for (const s of SEMILLAS) {
      const e = partidaDe(s).escena;
      const agua = new Set(e.agua);
      const esAgua = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < e.W && y < e.H && agua.has(y * e.W + x);
      expect(sendasDeEstriboEnAgua(e.sendas, e.puentes, e.vados, esAgua), `s${s}`).toEqual([]);
      expect(e.informe.sendasDeEstriboEnAgua).toBe(0);
      sinVados += sendasDeEstriboEnAgua(e.sendas, e.puentes, [], esAgua).length;
      for (const v of e.vados) expect(v.length, `s${s}`).toBeGreaterThan(1);
    }
    expect(sinVados).toBe(7);
  });
});

describe('la cara que cede su pared a un puente y se queda abre lo que la pared no tapa (H5 del QA de #157)', () => {
  it('en las semillas 1-10: cada hueco, junto a un puente, sin pared encima y en una cara que se queda', () => {
    let huecos = 0;
    for (const s of SEMILLAS) {
      const e = partidaDe(s).escena;
      const paredes = e.sprites.filter((x) => x.clase === 'pared').map((x) => cajaDeSprite(x));
      for (const c of e.relieve.caras) {
        if (c.huecos === undefined) continue;
        const [x0, y0, x1, y1] = bandaDeCara(c);
        expect(c.abierta, `s${s} cara ${c.y}`).toBeUndefined();
        expect(c.rampas).toEqual([]);
        expect(cubiertoDeLaCara(c, e.sprites)).toBeGreaterThanOrEqual(CUBIERTA_PARA_QUEDARSE);
        const cerca = e.puentes.some(
          ({ centro: [cx, cy] }) =>
            Math.max(x0 - cx, cx - x1, 0) <= 2 && Math.max(y0 - cy, cy - y1, 0) <= 2,
        );
        expect(cerca, `s${s} cara ${c.y} ${c.x0}-${c.x1}`).toBe(true);
        for (const h of c.huecos) {
          huecos++;
          expect(h.b - h.a).toBeGreaterThanOrEqual(0.15);
          expect(h.dentro).toEqual([h.a > x0, h.b < x1]);
          // En su medio, a media altura, ninguna pared: es lo liso que se veía.
          const [x, y] = [(h.a + h.b) / 2, (y0 + y1) / 2];
          const tapa = paredes.some(([a, b, cc, d]) => x >= a && x <= cc && y >= b && y <= d);
          expect(tapa, `s${s} cara ${c.y} hueco ${h.a}-${h.b}`).toBe(false);
        }
      }
    }
    expect(huecos).toBe(5);
  });
});
