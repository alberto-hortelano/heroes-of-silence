/**
 * La ciudad amurallada (`docs/agents/2026-10-20-ciudad-amurallada/`, vuelta 2:
 * el octógono con una puerta por entrada; vuelta 3: las puertas son del núcleo):
 * la regla pura del recinto (`recinto.ts`), con los módulos del catálogo del
 * repo y sendas escritas a mano.
 *
 * - El octógono: ocho caras iguales, cerrado, también contra el borde.
 * - Lo que roza, fuera (`sendasSinRoces`); lo que va a la ciudad, tal cual.
 * - La plaza: cubre el octógono y por delante no pasa de `PLAZA_AL_SUR` (H9).
 * - El anillo: en los 256 juegos de puertas, una torre en cada vértice, la pieza
 *   de su eje en cada puerta y ningún hueco (el guardia, visto morder).
 * - Las casas: apiñadas, dentro del octógono, fuera de la calle de cada puerta
 *   y de la plaza mayor, a la escala del pueblo y sin la misma al lado.
 */
import { describe, expect, it } from 'vitest';
import { modulosDelRecinto } from '../src/client/render/escenario/colocar.js';
import { contornoDeLaPlaza } from '../src/client/render/escenario/huella.js';
import { type ConImagen, pasilloDe } from '../src/client/render/escenario/pasillo.js';
import {
  anilloSobreLaSenda,
  CARA_DEL_RECINTO,
  CARAS,
  type Cara,
  callesDeLasPuertas,
  casasRepetidasJuntas,
  centroDeLaPlazaMayor,
  contornoDelRecinto,
  crucesConElContorno,
  DENTRO_DE_LOS_CHAFLANES,
  dentroDelContorno,
  EJE_DE_LA_CARA,
  enLaPlaza,
  huecosDelAnillo,
  MEDIA_CALLE,
  type Par,
  PIE_EN_LA_PLAZA,
  type PiezaDelRecinto,
  PLAZA_AL_SUR,
  PLAZA_MAYOR,
  PX_POR_CASILLA_DEL_PUEBLO,
  puertaDelEje,
  RADIO_DE_TORRE,
  ROCE_DEL_RECINTO,
  recintoDe,
  sendasSinRoces,
  tapaLaPlazaMayor,
} from '../src/client/render/escenario/recinto.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from '../src/client/render/escenario/sendas.js';
import { PIES } from '../src/client/render/mapa.js';
import { recintoDeLaCiudad } from '../src/core/map/recinto.js';
import { catalogoDelDisco, recta } from './helpers.js';

const faltan = new Set<string>();
const MODULOS = modulosDelRecinto(catalogoDelDisco(), faltan);

/** La ciudad de las pruebas: (10, 10) de un mapa de 30 × 30; su recinto va de 9 a 11. */
const AT = { x: 10, y: 10 };
const RECT = recintoDeLaCiudad(AT, 30, 30);
const C = contornoDelRecinto(RECT);
const [CX, CY] = C.centro;

/** La senda del centro de la ciudad hacia `(dx, dy)`, `largo` casillas. */
const haciaFuera = (dx: number, dy: number, largo = 4): Senda => {
  const d = Math.hypot(dx, dy);
  return recta([CX, CY], [CX + (dx * largo) / d, CY + (dy * largo) / d]);
};

/** La dirección de la normal de cada cara (la que sale por ella). */
const DIRECCION: Readonly<Record<Cara, Par>> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  so: [-1, 1],
  o: [-1, 0],
  no: [-1, -1],
};

/** La calle de las casas: lo que deja `componer` (`MEDIA_CALLE` del eje de cada puerta). */
const calleDe = (puertas: readonly Cara[]) => {
  const calle = pasilloDe<ConImagen>(callesDeLasPuertas({ contorno: C, puertas }), MEDIA_CALLE);
  return (p: PiezaDelRecinto) => {
    const ancho = (p.alto * p.nw) / p.nh;
    const izquierda = p.x - (p.ax * p.alto) / p.nh;
    return !calle.pisa({
      nw: 1,
      nh: 1,
      ax: 0.5,
      ay: 1,
      x: izquierda + ancho / 2,
      y: p.y,
      alto: 0.05,
      ancho,
    });
  };
};

const recintoCon = (puertas: readonly Cara[], id = 'town-7') =>
  recintoDe({
    id,
    rect: RECT,
    semilla: 15,
    puertas,
    modulos: MODULOS,
    entraLaCasa: calleDe(puertas),
  });

it('el catálogo del repo trae todo lo del recinto', () => {
  expect([...faltan]).toEqual([]);
});

describe('el octógono (`contornoDelRecinto`)', () => {
  it('ocho caras iguales, cerradas, con su normal hacia fuera', () => {
    expect(C.caras.map((k) => k.cara)).toEqual([...CARAS]);
    for (const [n, k] of C.caras.entries()) {
      expect(Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1])).toBeCloseTo(CARA_DEL_RECINTO, 3);
      expect(C.caras[(n + 1) % 8]?.a).toEqual(k.b);
      // La normal, de largo 1 y hacia fuera: el medio más ella ya no está dentro.
      expect(Math.hypot(...k.normal)).toBeCloseTo(1, 9);
      const [dx, dy] = DIRECCION[k.cara];
      expect(k.normal[0] * dx + k.normal[1] * dy).toBeGreaterThan(0);
      expect(
        dentroDelContorno(C, k.medio[0] - k.normal[0] * 0.01, k.medio[1] - k.normal[1] * 0.01),
      ).toBe(true);
      expect(
        dentroDelContorno(C, k.medio[0] + k.normal[0] * 0.01, k.medio[1] + k.normal[1] * 0.01),
      ).toBe(false);
    }
  });

  it('dentro de su rectángulo, también junto al borde del mapa', () => {
    for (const r of [RECT, recintoDeLaCiudad({ x: 1, y: 1 }, 30, 30)]) {
      const c = contornoDelRecinto(r);
      for (const [x, y] of c.vertices) {
        expect(x).toBeGreaterThan(r.i0);
        expect(x).toBeLessThan(r.i1 + 1);
        expect(y).toBeGreaterThan(r.j0);
        expect(y).toBeLessThan(r.j1 + 1);
      }
    }
  });
});

describe('lo que roza, fuera (`sendasSinRoces`)', () => {
  it('la que pasa rozando una cara sin ir a la ciudad se queda fuera, lejos de torres y muro (s38 (11,20))', () => {
    const y = C.vertices[0]?.[1] as number;
    const l: Senda = [
      ...recta([CX - 4, y - 1], [CX - 0.5, y + 0.3]),
      ...recta([CX - 0.4, y + 0.3], [CX + 4, y - 1]),
    ];
    expect(crucesConElContorno(C, l).length).toBe(2);
    const [d] = sendasSinRoces([l], [C]);
    if (d === undefined) throw new Error('sin senda');
    expect(crucesConElContorno(C, d)).toEqual([]);
    expect(d[0]).toEqual(l[0]);
    expect(d.at(-1)).toEqual(l.at(-1));
    expect(anilloSobreLaSenda({ contorno: C, puertas: [] }, [d], SEMIANCHO_DE_LA_HUELLA)).toEqual(
      [],
    );
    // La que entra más de `ROCE_DEL_RECINTO` no roza: se queda como está.
    const honda: Senda = [
      ...recta([CX - 4, y - 1], [CX - 0.5, y + ROCE_DEL_RECINTO + 0.3]),
      ...recta([CX - 0.4, y + ROCE_DEL_RECINTO + 0.3], [CX + 4, y - 1]),
    ];
    const [h] = sendasSinRoces([honda], [C]);
    expect(crucesConElContorno(C, h as Senda)).toHaveLength(2);
  });

  it('la que va a la ciudad (acaba dentro) no se toca', () => {
    const l = haciaFuera(1, -1);
    expect(sendasSinRoces([l], [C])).toEqual([l]);
  });

  it('si al correrla se saldría del mapa, no se corre', () => {
    const y = C.vertices[0]?.[1] as number;
    const l: Senda = [
      ...recta([CX - 4, y - 1], [CX - 0.5, y + 0.3]),
      ...recta([CX - 0.4, y + 0.3], [CX + 4, y - 1]),
    ];
    const [d] = sendasSinRoces([l], [C], (_x, yy) => yy >= y - 0.2);
    expect(crucesConElContorno(C, d as Senda)).toHaveLength(2);
  });
});

describe('la plaza (`ladosDeLaPlaza`, `enLaPlaza`, `contornoDeLaPlaza`)', () => {
  /** Lo que `(x, y)` sale por delante de las caras sureste, sur y suroeste del octógono. */
  const porDelante = (x: number, y: number) =>
    Math.max(
      ...C.caras
        .filter((k) => k.cara === 'se' || k.cara === 's' || k.cara === 'so')
        .map((k) => (x - k.a[0]) * k.normal[0] + (y - k.a[1]) * k.normal[1]),
    );

  it('cubre el octógono entero', () => {
    for (const [x, y] of C.vertices) expect(enLaPlaza(RECT, x, y), `${x},${y}`).toBe(true);
    for (const k of C.caras) expect(enLaPlaza(RECT, ...k.medio), k.cara).toBe(true);
  });

  it('por delante no pasa de `PLAZA_AL_SUR` del pie de la muralla (H9 de la vuelta 2)', () => {
    for (const semilla of [1, 7, 15, 99]) {
      const contorno = contornoDeLaPlaza(RECT, semilla);
      expect(contorno.length).toBeGreaterThan(50);
      for (const [x, y] of contorno)
        expect(porDelante(x, y), `${x.toFixed(2)},${y.toFixed(2)}`).toBeLessThanOrEqual(
          PLAZA_AL_SUR + 1e-9,
        );
    }
    // Lo mismo que mira el pintor lo mira `enLaPlaza`; con el rectángulo de antes
    // (0,12 de más por el sur), la plaza asomaba bajo el muro.
    expect(porDelante(CX, RECT.j1 + 1 + 0.12)).toBeGreaterThan(PLAZA_AL_SUR);
    expect(enLaPlaza(RECT, CX, RECT.j1 + 1 + 0.12)).toBe(false);
    expect(enLaPlaza(RECT, CX, RECT.j1 + 1 - 0.02 + PLAZA_AL_SUR / 2)).toBe(true);
  });
});

/** Los 256 juegos de caras con puerta. */
const JUEGOS: Cara[][] = Array.from({ length: 256 }, (_, m) =>
  CARAS.filter((_c, k) => (m >> k) & 1),
);

describe('el anillo (`recintoDe`) en los 256 juegos de puertas', () => {
  const todos = JUEGOS.map((puertas) => ({ puertas, r: recintoCon(puertas) }));

  it('una torre en cada vértice, la puerta de su eje en cada cara con puerta y lo liso en las demás', () => {
    for (const { puertas, r } of todos) {
      expect(r.torres).toHaveLength(8);
      for (const v of C.vertices)
        expect(r.torres.some((t) => t.x === v[0] && t.y === v[1] + RADIO_DE_TORRE)).toBe(true);
      expect(r.arcos.map((p) => p.cara)).toEqual(puertas);
      for (const p of r.arcos) expect(p.nombre).toBe(puertaDelEje(EJE_DE_LA_CARA[p.cara as Cara]));
      const lisas = new Set(r.tramos.map((p) => p.cara));
      expect([...lisas].sort()).toEqual(CARAS.filter((k) => !puertas.includes(k)).sort());
    }
  });

  it('cerrado: ningún punto del octógono sin la base de una pieza', () => {
    for (const { puertas, r } of todos) expect(huecosDelAnillo(r), puertas.join(',')).toEqual([]);
  });

  it('el guardia muerde: sin un tramo, o sin una puerta, el anillo queda abierto', () => {
    const r = recintoCon(['n', 'se']);
    expect(huecosDelAnillo({ ...r, tramos: r.tramos.slice(1) }).length).toBeGreaterThan(0);
    expect(huecosDelAnillo({ ...r, arcos: r.arcos.slice(1) }).length).toBeGreaterThan(0);
  });

  it('las puertas, de vértice a vértice: su pie en el medio de su cara, o en el vértice de abajo de una de delante que baja', () => {
    for (const p of recintoCon([...CARAS]).arcos) {
      const k = C.caras.find((c) => c.cara === p.cara);
      if (k === undefined) throw new Error(`sin la cara ${p.cara}`);
      const baja = Math.abs(k.a[1] - k.b[1]) > 1e-9 && !['n', 'ne', 'no'].includes(k.cara);
      const abajo = k.a[1] >= k.b[1] ? k.a : k.b;
      const [x, y] = baja ? abajo : k.medio;
      expect([p.x, p.y], p.cara).toEqual([x, y]);
    }
  });

  it('ninguna pieza con la clave del pintor más abajo que su pie (`separar`)', () => {
    for (const { r } of todos)
      for (const p of [...r.torres, ...r.tramos, ...r.arcos])
        expect(p.clave ?? p.y, `${p.que} ${p.cara}`).toBeLessThanOrEqual(p.y);
  });
});

describe('las casas del recinto', () => {
  // Medido el 21-10-2026 con el catálogo del repo: 17 sin puertas y 12 con tres
  // (con la plaza mayor y las calles hasta ella; antes, 20 y 15).
  const sinPuertas = recintoCon([]);
  const conTres = recintoCon(['ne', 'se', 'so']);

  it('apiñadas: muchas sin puertas, y las calles dejan sitio', () => {
    expect(sinPuertas.casas.length).toBeGreaterThanOrEqual(16);
    expect(conTres.casas.length).toBeGreaterThanOrEqual(11);
    expect(conTres.casas.length).toBeLessThan(sinPuertas.casas.length);
  });

  it('la plaza mayor, libre: ninguna casa la tapa, en ningún juego de puertas, y el guardia muerde', () => {
    for (const puertas of JUEGOS)
      for (const c of recintoCon(puertas).casas)
        expect(tapaLaPlazaMayor(C, c), `${puertas.join(',')}: ${c.nombre} en ${c.x},${c.y}`).toBe(
          false,
        );
    const [a] = sinPuertas.casas;
    if (a === undefined) throw new Error('sin casas');
    const [px, py] = centroDeLaPlazaMayor(C);
    // Con el pie justo delante del claro, su tejado lo tapa.
    expect(tapaLaPlazaMayor(C, { ...a, x: px, y: py + PLAZA_MAYOR + 0.1 })).toBe(true);
    expect(tapaLaPlazaMayor(C, { ...a, x: px + 2, y: py })).toBe(false);
  });

  it('la plaza mayor, donde pisa quien está en la ciudad (`PIES.heroe`)', () => {
    expect(PIE_EN_LA_PLAZA).toBeCloseTo(PIES.heroe - 0.5, 9);
  });

  it('una calle de cada puerta, de fuera de su arco a la plaza mayor', () => {
    const puertas: Cara[] = ['n', 'se', 'so'];
    const calles = callesDeLasPuertas({ contorno: C, puertas });
    expect(calles).toHaveLength(3);
    for (const l of calles) {
      expect(l.at(-1)).toEqual(centroDeLaPlazaMayor(C));
      const [x, y] = l[0] as Par;
      expect(dentroDelContorno(C, x, y)).toBe(false);
    }
  });

  it('todas con el pie dentro del octógono, y ninguna en la calle de una puerta', () => {
    for (const { puertas, r } of JUEGOS.filter((_j, m) => m % 17 === 0).map((puertas) => ({
      puertas,
      r: recintoCon(puertas),
    }))) {
      const enLaCalle = calleDe(puertas);
      for (const c of r.casas) {
        expect(dentroDelContorno(C, c.x, c.y, DENTRO_DE_LOS_CHAFLANES - 1e-9)).toBe(true);
        expect(enLaCalle(c), `${c.nombre} en ${c.x},${c.y}`).toBe(true);
      }
    }
  });

  it('a la escala del pueblo: de 0,55 a 0,86 de ancho, cada una por su imagen', () => {
    for (const c of sinPuertas.casas) {
      const ancho = (c.alto * c.nw) / c.nh;
      expect(ancho).toBeCloseTo(c.nw / PX_POR_CASILLA_DEL_PUEBLO, 9);
      expect(ancho).toBeGreaterThanOrEqual(0.55 - 1e-9);
      expect(ancho).toBeLessThanOrEqual(0.86);
    }
  });

  it('pegadas a la muralla: la primera fila junto al muro norte y la última junto al sur', () => {
    const ys = sinPuertas.casas.map((c) => c.y);
    expect(Math.min(...ys) - (C.vertices[0]?.[1] as number)).toBeLessThanOrEqual(0.35);
    expect((C.vertices[4]?.[1] as number) - Math.max(...ys)).toBeLessThanOrEqual(0.2);
  });

  it('nunca la misma casa al lado ni detrás, solapada, en ningún juego de puertas', () => {
    for (const puertas of JUEGOS)
      expect(casasRepetidasJuntas(recintoCon(puertas).casas)).toEqual([]);
  });

  it('el guardia de las casas muerde: la misma casa repetida al lado', () => {
    const [a] = sinPuertas.casas;
    if (a === undefined) throw new Error('sin casas');
    const ancho = (a.alto * a.nw) / a.nh;
    expect(casasRepetidasJuntas([a, { ...a, x: a.x + ancho + 0.04 }])).toHaveLength(1);
  });
});

describe('cada ciudad, distinta y estable', () => {
  it('el mismo id y la misma semilla dan lo mismo; otro id, otra ciudad', () => {
    const a = recintoCon(['s']);
    expect(recintoCon(['s'])).toEqual(a);
    const otra = recintoCon(['s'], 'town-8');
    expect(otra.casas.map((c) => c.nombre)).not.toEqual(a.casas.map((c) => c.nombre));
  });
});
