/**
 * La ciudad amurallada (`docs/agents/2026-10-20-ciudad-amurallada/`, vuelta 2:
 * el octógono con una puerta por entrada): la regla pura del recinto
 * (`recinto.ts`), con los módulos del catálogo del repo y sendas escritas a mano.
 *
 * - El rectángulo: el 3 × 3 de la ciudad, corrido hacia dentro junto al borde;
 *   el de la ciudad-puente, con su orilla y sin su puente.
 * - El octógono: ocho caras iguales, cerrado, también contra el borde.
 * - Las puertas: cada senda, por la cara que cruza (y la vecina, si delante de
 *   la suya no se pisa); dos por una cara, una puerta; la del río.
 * - Lo que va dentro, una cuerda; lo que roza, fuera.
 * - El anillo: en los 256 juegos de puertas, una torre en cada vértice, la pieza
 *   de su eje en cada puerta y ningún hueco (el guardia, visto morder).
 * - Las casas: apiñadas, dentro del octógono, fuera de la calle, a la escala
 *   del pueblo y sin la misma al lado.
 */
import { describe, expect, it } from 'vitest';
import { modulosDelRecinto } from '../src/client/render/escenario/colocar.js';
import { type ConImagen, pasilloDe } from '../src/client/render/escenario/pasillo.js';
import {
  anilloSobreLaSenda,
  CARA_DEL_RECINTO,
  CARAS,
  type Cara,
  callesDeLasPuertas,
  caraDelCruce,
  casasRepetidasJuntas,
  contornoDelRecinto,
  crucesConElContorno,
  DENTRO_DE_LOS_CHAFLANES,
  dentroDelContorno,
  EJE_DE_LA_CARA,
  EXCURSION_JUNTO_A_LA_MURALLA,
  huecosDelAnillo,
  LUZ_DEL_ARCO,
  type Par,
  type PiezaDelRecinto,
  PX_POR_CASILLA_DEL_PUEBLO,
  puertaDelEje,
  puertasDelRecinto,
  RADIO_DE_TORRE,
  ROCE_DEL_RECINTO,
  recintoDe,
  sendasPorDentro,
} from '../src/client/render/escenario/recinto.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from '../src/client/render/escenario/sendas.js';
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

/** La calle de las casas: lo que deja `componer` (media luz del arco del eje de cada puerta). */
const calleDe = (puertas: readonly Cara[]) => {
  const calle = pasilloDe<ConImagen>(
    callesDeLasPuertas({ contorno: C, puertas }),
    LUZ_DEL_ARCO / 2,
  );
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

describe('las puertas (`puertasDelRecinto`, `caraDelCruce`)', () => {
  it('cada senda, por la cara que cruza: las ocho', () => {
    for (const cara of CARAS)
      expect(puertasDelRecinto(C, [haciaFuera(...DIRECCION[cara])]), cara).toEqual([cara]);
  });

  it('el cruce de (1, −1,5) desde el centro va al noreste, y el de (0,5, −1,5) al norte', () => {
    expect(puertasDelRecinto(C, [haciaFuera(1, -1.5)])).toEqual(['ne']);
    expect(puertasDelRecinto(C, [haciaFuera(0.5, -1.5)])).toEqual(['n']);
  });

  it('dos sendas por una cara, una puerta; la del río va siempre', () => {
    expect(puertasDelRecinto(C, [haciaFuera(0.1, 1), haciaFuera(-0.1, 1)])).toEqual(['s']);
    expect(puertasDelRecinto(C, [haciaFuera(1, 0)], 's')).toEqual(['e', 's']);
    expect(puertasDelRecinto(C, [], 'n')).toEqual(['n']);
  });

  it('si delante de su cara no se pisa, la vecina por la que sigue la senda; si ninguna, la suya', () => {
    // La senda sale por el sur pegada al vértice del suroeste y sigue al suroeste
    // (s25 (19,28)): con lo de debajo de la cara sur sin pisar, la del suroeste.
    const k = C.caras.find((c) => c.cara === 's');
    if (k === undefined) throw new Error('sin cara sur');
    const cruce: Par = [k.a[0] + 0.85 * (k.b[0] - k.a[0]), k.a[1]];
    const fuera = recta(cruce, [cruce[0] - 1.2, cruce[1] + 1.2]);
    const sinElSur = (_x: number, y: number) => y < RECT.j1 + 1;
    expect(caraDelCruce(C, cruce, fuera, () => true).cara).toBe('s');
    expect(caraDelCruce(C, cruce, fuera, (x, y) => sinElSur(x, y) || x < cruce[0] - 0.3).cara).toBe(
      'so',
    );
    // Si la vecina queda lejos de la senda, no: rodearía la muralla hasta ella.
    const medio: Par = [k.medio[0], k.medio[1]];
    const alSur = recta(medio, [medio[0], medio[1] + 2]);
    expect(caraDelCruce(C, medio, alSur, sinElSur).cara).toBe('s');
  });
});

describe('lo que va dentro, una cuerda; lo que roza, fuera (`sendasPorDentro`)', () => {
  it('la senda que entra, da vueltas y llega al centro cruza una vez, con sus extremos donde estaban', () => {
    const l: Senda = [
      ...recta([CX - 4, CY - 2], [CX - 1, CY - 0.8]),
      ...recta([CX - 0.9, CY - 0.7], [CX + 1, CY + 1]),
      ...recta([CX + 1, CY + 1.1], [CX, CY]),
    ];
    const [d] = sendasPorDentro([l], [C]);
    if (d === undefined) throw new Error('sin senda');
    expect(d[0]).toEqual(l[0]);
    expect(d.at(-1)).toEqual(l.at(-1));
    expect(crucesConElContorno(C, d)).toHaveLength(1);
  });

  it('la que sale por una cara y vuelve a entrar sin alejarse cuenta un cruce (s13 (16,36))', () => {
    // Entra por el norte, sale por el oeste media casilla y vuelve a entrar.
    const l: Senda = [
      ...recta([CX - 0.4, CY - 4], [CX - 0.4, CY - 0.5]),
      ...recta([CX - 0.5, CY - 0.4], [C.vertices[7]?.[0] ?? 0, CY]),
      ...recta([CX - 2, CY + 0.1], [CX - 0.5, CY + 0.5]),
      ...recta([CX - 0.4, CY + 0.5], [CX, CY + 1]),
    ];
    expect(crucesConElContorno(C, l).length).toBeGreaterThan(1);
    const [d] = sendasPorDentro([l], [C]);
    expect(crucesConElContorno(C, d as Senda)).toHaveLength(1);
    expect(EXCURSION_JUNTO_A_LA_MURALLA).toBeGreaterThanOrEqual(0.6);
  });

  it('la que pasa rozando una cara sin ir a la ciudad se queda fuera, lejos de torres y muro (s38 (11,20))', () => {
    const y = C.vertices[0]?.[1] as number;
    const l: Senda = [
      ...recta([CX - 4, y - 1], [CX - 0.5, y + 0.3]),
      ...recta([CX - 0.4, y + 0.3], [CX + 4, y - 1]),
    ];
    expect(crucesConElContorno(C, l).length).toBe(2);
    const [d] = sendasPorDentro([l], [C]);
    if (d === undefined) throw new Error('sin senda');
    expect(crucesConElContorno(C, d)).toEqual([]);
    expect(d[0]).toEqual(l[0]);
    expect(d.at(-1)).toEqual(l.at(-1));
    expect(anilloSobreLaSenda({ contorno: C, puertas: [] }, [d], SEMIANCHO_DE_LA_HUELLA)).toEqual(
      [],
    );
    // La que entra más de `ROCE_DEL_RECINTO` sí pasa por la ciudad, por dos puertas.
    const honda: Senda = [
      ...recta([CX - 4, y - 1], [CX - 0.5, y + ROCE_DEL_RECINTO + 0.3]),
      ...recta([CX - 0.4, y + ROCE_DEL_RECINTO + 0.3], [CX + 4, y - 1]),
    ];
    const [h] = sendasPorDentro([honda], [C]);
    expect(crucesConElContorno(C, h as Senda)).toHaveLength(2);
  });

  it('si al correrla se saldría del mapa, no se corre', () => {
    const y = C.vertices[0]?.[1] as number;
    const l: Senda = [
      ...recta([CX - 4, y - 1], [CX - 0.5, y + 0.3]),
      ...recta([CX - 0.4, y + 0.3], [CX + 4, y - 1]),
    ];
    const [d] = sendasPorDentro([l], [C], (_x, yy) => yy >= y - 0.2);
    expect(crucesConElContorno(C, d as Senda)).toHaveLength(2);
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
  // Medido el 21-10-2026 con el catálogo del repo: 20 sin puertas, 15 con tres.
  const sinPuertas = recintoCon([]);
  const conTres = recintoCon(['ne', 'se', 'so']);

  it('apiñadas: muchas sin puertas, y las calles dejan sitio', () => {
    expect(sinPuertas.casas.length).toBeGreaterThanOrEqual(18);
    expect(conTres.casas.length).toBeGreaterThanOrEqual(13);
    expect(conTres.casas.length).toBeLessThan(sinPuertas.casas.length);
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
