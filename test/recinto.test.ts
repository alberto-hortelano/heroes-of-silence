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
 * - Las casas: apiñadas por todo el recinto, dentro del octógono, fuera de la
 *   calle de cada puerta y de donde pisa el héroe, sin tapar el vano de un arco
 *   (`tapaElArco`, por la silueta de su imagen; el guardia, visto morder), a la
 *   escala del pueblo y sin la misma al lado.
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { type CatalogoEnBruto, catalogoValidado } from '../src/client/render/escenario/catalogo.js';
import { modulosDelRecinto } from '../src/client/render/escenario/colocar.js';
import { contornoDeLaPlaza } from '../src/client/render/escenario/huella.js';
import { type ConImagen, pasilloDe } from '../src/client/render/escenario/pasillo.js';
import {
  ARRANQUE_DEL_ARCO,
  anilloMalOrdenado,
  anilloSobreLaSenda,
  arcosTapados,
  CARA_DEL_RECINTO,
  CARAS,
  type CajaEnPantalla,
  type Cara,
  cajaEnPantalla,
  callesDeLasPuertas,
  casasRepetidasJuntas,
  contornoDelRecinto,
  crucesConElContorno,
  DENTRO_DE_LOS_CHAFLANES,
  dentroDelContorno,
  EJE_DE_LA_CARA,
  ESCALA_DEL_MODULO,
  enLaPlaza,
  FONDO_DE_LA_CALLE,
  GRUESO_DEL_TORREON,
  huecosDelAnillo,
  LIBRE_BAJO_EL_HEROE,
  LUZ_DEL_ARCO,
  MEDIA_CALLE,
  type Par,
  PIE_EN_LA_PLAZA,
  type PiezaDelRecinto,
  PLAZA_AL_SUR,
  PX_POR_CASILLA_DEL_PUEBLO,
  pieDelHeroe,
  puertaDelEje,
  RADIO_DE_TORRE,
  ROCE_DEL_RECINTO,
  recintoDe,
  sendasSinRoces,
  tapaElArco,
  tapaElPieDelHeroe,
  vanoDelArco,
} from '../src/client/render/escenario/recinto.js';
import { SEMIANCHO_DE_LA_HUELLA, type Senda } from '../src/client/render/escenario/sendas.js';
import { PIES } from '../src/client/render/mapa.js';
import { recintoDeLaCiudad } from '../src/core/map/recinto.js';
import { FRANJAS_DEL_PERFIL, siluetaDeModulo } from '../tools/taller/derivar.js';
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

const seSolapan = (a: CajaEnPantalla, b: CajaEnPantalla) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

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

  it('las puertas, de vértice a vértice: su pie en el medio de su cara, o en el vértice de abajo de una de delante que baja (a su escala, hacia el medio)', () => {
    for (const p of recintoCon([...CARAS]).arcos) {
      const k = C.caras.find((c) => c.cara === p.cara);
      if (k === undefined) throw new Error(`sin la cara ${p.cara}`);
      const baja = Math.abs(k.a[1] - k.b[1]) > 1e-9 && !['n', 'ne', 'no'].includes(k.cara);
      // Con su escala propia (`ESCALA_DEL_MODULO`, vuelta 4), la pieza encoge
      // alrededor del medio de su cara y su junta de abajo se corre con ella.
      const propia = ESCALA_DEL_MODULO[puertaDelEje(EJE_DE_LA_CARA[p.cara as Cara])] ?? 1;
      const abajo = k.a[1] >= k.b[1] ? k.a : k.b;
      const [x, y] = baja
        ? [
            k.medio[0] + propia * (abajo[0] - k.medio[0]),
            k.medio[1] + propia * (abajo[1] - k.medio[1]),
          ]
        : k.medio;
      expect(p.x, p.cara).toBeCloseTo(x, 9);
      expect(p.y, p.cara).toBeCloseTo(y, 9);
    }
    // La del este y el oeste baja y tiene escala propia: el caso se mira.
    expect(ESCALA_DEL_MODULO['puerta-e-o']).toBeLessThan(1);
  });

  it('ninguna pieza con la clave del pintor más abajo que su pie (`separar`)', () => {
    // También las casas, que bajan con el tramo de delante (`techoDeLaCasa`).
    // Con la torre de abajo del este o del oeste subida a la clave del tramo en
    // diagonal que la toca (20dbc295), se pintaba encima de los pinos y picos
    // que tiene delante fuera del recinto (s34 town-2).
    for (const { r } of todos)
      for (const p of [...r.torres, ...r.tramos, ...r.arcos, ...r.casas])
        expect(p.clave ?? p.y, `${p.que} ${p.cara}`).toBeLessThanOrEqual(p.y);
  });

  it('el orden de cada torre con las piezas de sus caras es el de la geometría (`anilloMalOrdenado`); al revés, muerde', () => {
    const pintadas = (r: (typeof todos)[number]['r']) =>
      [...r.torres, ...r.tramos, ...r.arcos].map((pieza) => ({
        pieza,
        clave: pieza.clave ?? pieza.y,
        x: pieza.x,
      }));
    for (const { puertas, r } of todos)
      expect(anilloMalOrdenado(C, pintadas(r)), puertas.join(',')).toEqual([]);
    // Romper a mano: la torre de arriba del sureste otra vez detrás del tramo en
    // diagonal que la toca, con la clave de su pie y el tramo con la de su
    // vértice de abajo (20dbc295 sin el orden del anillo).
    const r = recintoCon([]);
    const se = r.tramos.find((p) => p.cara === 'se');
    const torre = r.torres.find((p) => p.cara === 'se');
    if (se === undefined || torre === undefined)
      throw new Error('sin el tramo o la torre del sureste');
    const rotas = pintadas(r).map((p) =>
      p.pieza === se ? { ...p, clave: Math.max(se.y, torre.y) + 0.5 } : p,
    );
    expect(anilloMalOrdenado(C, rotas).length).toBeGreaterThan(0);
  });

  it('ninguna casa se pinta después del tramo o la puerta de una cara de delante en diagonal o del sur con que se solapa', () => {
    // El muro que se ve por fuera va delante de las casas que tapa; el que el
    // orden del anillo baja detrás de la torre de su vértice de arriba se las
    // lleva con él (`techoDeLaCasa`).
    let solapadas = 0;
    for (const { puertas, r } of todos)
      for (const p of [...r.tramos, ...r.arcos].filter((q) =>
        ['se', 's', 'so'].includes(q.cara ?? ''),
      ))
        for (const c of r.casas)
          if (seSolapan(cajaEnPantalla(p), cajaEnPantalla(c))) {
            solapadas++;
            expect(
              c.clave ?? c.y,
              `${puertas.join(',')}: casa en ${c.x},${c.y} y ${p.que} ${p.cara}`,
            ).toBeLessThan(p.clave ?? p.y);
          }
    // Las hay: la regla se mira.
    expect(solapadas).toBeGreaterThan(0);
  });
});

describe('las casas del recinto', () => {
  // Medido el 21-10-2026 con el catálogo del repo: 18 sin puertas y 14 con tres
  // (llena, sin plaza mayor; con ella y las calles hasta ella, 17 y 12). Con
  // tres eran 15 hasta que ninguna casa tapa un arco (H1): una tapaba el del noreste.
  const sinPuertas = recintoCon([]);
  const conTres = recintoCon(['ne', 'se', 'so']);

  it('apiñadas: muchas sin puertas, y las calles dejan sitio', () => {
    expect(sinPuertas.casas.length).toBeGreaterThanOrEqual(18);
    expect(conTres.casas.length).toBeGreaterThanOrEqual(14);
    expect(conTres.casas.length).toBeLessThan(sinPuertas.casas.length);
  });

  it('donde pisa el héroe, libre: ninguna casa lo tapa, en ningún juego de puertas, y el guardia muerde', () => {
    for (const puertas of JUEGOS)
      for (const c of recintoCon(puertas).casas)
        expect(tapaElPieDelHeroe(C, c), `${puertas.join(',')}: ${c.nombre} en ${c.x},${c.y}`).toBe(
          false,
        );
    const [a] = sinPuertas.casas;
    if (a === undefined) throw new Error('sin casas');
    const [px, py] = pieDelHeroe(C);
    // Con el pie justo delante, su tejado queda bajo los pies del héroe; justo
    // detrás, su fachada; y más allá, nada.
    const { ancho, hondo } = LIBRE_BAJO_EL_HEROE;
    expect(tapaElPieDelHeroe(C, { ...a, x: px, y: py + 0.2 })).toBe(true);
    expect(tapaElPieDelHeroe(C, { ...a, x: px, y: py - hondo / 2 })).toBe(true);
    expect(tapaElPieDelHeroe(C, { ...a, x: px, y: py - hondo - 0.01 })).toBe(false);
    // De lado, a lo que abre las piernas: la imagen empieza en `izquierda`.
    const izquierda = (x: number) => x + (a.ax * a.alto) / a.nh;
    expect(tapaElPieDelHeroe(C, { ...a, x: izquierda(px + ancho / 2), y: py })).toBe(true);
    expect(tapaElPieDelHeroe(C, { ...a, x: izquierda(px + ancho + 0.01), y: py })).toBe(false);
  });

  it('el héroe pisa donde lo pinta el mapa (`PIES.heroe`)', () => {
    expect(PIE_EN_LA_PLAZA).toBeCloseTo(PIES.heroe - 0.5, 9);
    expect(pieDelHeroe(C)).toEqual([CX, CY + PIE_EN_LA_PLAZA]);
  });

  it('una calle corta en cada puerta: de fuera de su arco a lo justo dentro', () => {
    const puertas: Cara[] = ['n', 'se', 'so', 'o'];
    const calles = callesDeLasPuertas({ contorno: C, puertas });
    expect(calles).toHaveLength(4);
    for (const [i, cara] of puertas.entries()) {
      const l = calles[i] as Senda;
      const k = C.caras.find((q) => q.cara === cara);
      if (k === undefined) throw new Error(cara);
      const [x0, y0] = l[0] as Par;
      const [x1, y1] = l.at(-1) as Par;
      expect(dentroDelContorno(C, x0, y0)).toBe(false);
      expect(dentroDelContorno(C, x1, y1)).toBe(true);
      const fondo = Math.hypot(x1 - k.medio[0], y1 - k.medio[1]);
      expect(fondo, cara).toBeCloseTo(FONDO_DE_LA_CALLE, 9);
      // Ninguna llega a donde pisa el héroe: la ciudad no lleva plaza mayor.
      const [hx, hy] = pieDelHeroe(C);
      expect(Math.hypot(x1 - hx, y1 - hy), cara).toBeGreaterThan(0.5);
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

  it('el vano de un arco es la boca de la guía: de frente, inclinada en las diagonales y de canto al este y al oeste', () => {
    const r = LUZ_DEL_ARCO / 2;
    const g = GRUESO_DEL_TORREON / 2;
    const caja = (cara: Cara) => {
      const k = C.caras.find((q) => q.cara === cara);
      if (k === undefined) throw new Error(cara);
      const v = vanoDelArco(k);
      return {
        k,
        v,
        x0: Math.min(...v.map((c) => c.x0)),
        x1: Math.max(...v.map((c) => c.x1)),
        y0: Math.min(...v.map((c) => c.y0)),
        y1: Math.max(...v.map((c) => c.y1)),
      };
    };
    // La del norte, de frente: en la cara de dentro del torreón, de media luz a
    // cada lado y del suelo a lo alto del arco.
    const n = caja('n');
    expect(n.x0).toBeCloseTo(n.k.medio[0] - r, 9);
    expect(n.x1).toBeCloseTo(n.k.medio[0] + r, 9);
    expect(n.y1).toBeCloseTo(n.k.medio[1] + g, 9);
    expect(n.y0).toBeCloseTo(n.k.medio[1] + g - ARRANQUE_DEL_ARCO - r, 9);
    // La del noroeste, inclinada: su suelo sube hacia la derecha, y su caja no
    // es la de la boca (el muro de debajo de su punta derecha no es vano).
    const no = caja('no');
    const [primera, ultima] = [no.v[0], no.v.at(-1)];
    if (primera === undefined || ultima === undefined) throw new Error('sin columnas');
    expect(primera.y1).toBeGreaterThan(ultima.y1 + 0.2);
    expect(no.x1 - no.x0).toBeCloseTo(2 * r * Math.SQRT1_2, 9);
    // La del oeste, de canto: la línea de la cara de dentro de su torreón.
    const o = caja('o');
    expect(o.x0).toBeCloseTo(o.k.medio[0] + g, 9);
    expect(o.x1).toBeCloseTo(o.x0, 9);
  });

  it('ninguna tapa el vano de un arco, en ningún juego de puertas (H1)', () => {
    for (const puertas of JUEGOS) {
      const r = recintoCon(puertas);
      const arcos = r.arcos.map((a) => ({ cara: a.cara as Cara, clave: a.clave ?? a.y }));
      expect(arcosTapados(C, arcos, r.casas), puertas.join(',')).toEqual([]);
    }
  });

  it('el guardia de los arcos muerde: la casa 1 bajo el arco del noroeste, como en s16 (10, 7)', () => {
    const r = recintoCon(['no']);
    const [arco] = r.arcos;
    const uno = MODULOS.casas.find((m) => m.nombre === '1');
    if (arco === undefined || uno === undefined) throw new Error('sin el arco o la casa 1');
    const k = C.caras.find((q) => q.cara === 'no');
    if (k === undefined) throw new Error('sin la cara noroeste');
    // Donde la ponía la regla de antes: el medio de la cara más (0,18, 0,71),
    // a 0,63 por la normal, pasado el fondo de la calle de entonces (0,6).
    const casa = {
      ...uno,
      que: 'casa' as const,
      x: k.medio[0] + 0.18,
      y: k.medio[1] + 0.71,
      alto: uno.nh / PX_POR_CASILLA_DEL_PUEBLO,
    };
    const arcos = [{ cara: 'no' as const, clave: arco.clave ?? arco.y }];
    expect(arcosTapados(C, arcos, [casa])).toHaveLength(1);
    // La misma, pintada antes que el arco: la tapa él a ella.
    expect(arcosTapados(C, [{ cara: 'no', clave: casa.y + 0.01 }], [casa])).toEqual([]);
    // Y más al sur, donde su tejado ya no sube al vano.
    expect(arcosTapados(C, arcos, [{ ...casa, y: casa.y + 0.6 }])).toEqual([]);
  });

  it('por la silueta, no por la caja: la esquina transparente de un tejado no tapa', () => {
    const k = C.caras.find((q) => q.cara === 'n');
    const tres = MODULOS.casas.find((m) => m.nombre === '3');
    if (k === undefined || tres?.silueta === undefined) throw new Error('sin la cara o la casa 3');
    const vano = vanoDelArco(k);
    const derecha = Math.max(...vano.map((c) => c.x1));
    const abajo = Math.max(...vano.map((c) => c.y1));
    const alto = tres.nh / PX_POR_CASILLA_DEL_PUEBLO;
    const escala = alto / tres.nh;
    // Su caja entra 0,01 en el vano por la izquierda y 0,12 por arriba; lo
    // opaco de su primera franja empieza al 61 % de su alto, debajo del vano.
    const casa = {
      ...tres,
      x: derecha - 0.01 + tres.ax * escala,
      y: abajo - 0.12 + tres.ay * escala,
      alto,
    };
    const { silueta: _sinSilueta, ...soloLaCaja } = casa;
    expect(tapaElArco(vano, k.medio[1] - 1, soloLaCaja)).toBe(true);
    expect(tapaElArco(vano, k.medio[1] - 1, casa)).toBe(false);
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

describe('la silueta de una casa: la deriva el taller y la comprueba el catálogo', () => {
  it('siluetaDeModulo: por franja, de la columna que más alto empieza a la que más abajo acaba; sin nada, vacía', async () => {
    // 64 × 40: un tejado en punta (la columna x empieza en |x − 31| / 2 + 4) y
    // la fachada hasta la fila 36, salvo las 4 últimas columnas, vacías.
    const [w, h] = [64, 40];
    const datos = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w - 4; x++)
        if (y >= Math.abs(x - 31) / 2 + 4 && y < 36) datos[(y * w + x) * 4 + 3] = 255;
    const ruta = `${process.env.TMPDIR ?? '/tmp'}/silueta-${process.pid}.png`;
    await sharp(datos, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(ruta);
    const silueta = await siluetaDeModulo(ruta);
    expect(silueta).toHaveLength(FRANJAS_DEL_PERFIL);
    // La franja 0 (columnas 0 y 1): la 1 empieza más alto, en la fila 19.
    expect(silueta[0]).toEqual([Math.floor((19 / 40) * 1000) / 1000, 0.9]);
    // La del medio (30 y 31): la punta, en la fila 4.
    expect(silueta[15]).toEqual([0.1, 0.9]);
    expect(silueta.slice(30)).toEqual([
      [1, 0],
      [1, 0],
    ]);
  });

  it('toda casa del catálogo del repo trae su silueta, y nada más la trae', () => {
    for (const [hoja, ms] of Object.entries(catalogoDelDisco().hojas))
      for (const m of ms)
        expect(m.silueta !== undefined, `${hoja}/${m.nombre}`).toBe(hoja === 'casas');
  });

  it('catalogoValidado lanza sin la silueta de una casa, con una fuera de 0-1, o en otra hoja', () => {
    const crudo = catalogoDelDisco() as unknown as CatalogoEnBruto;
    const conCasas = (ms: CatalogoEnBruto['hojas'][string]): CatalogoEnBruto => ({
      ...crudo,
      hojas: { ...crudo.hojas, casas: ms },
    });
    const casas = crudo.hojas.casas ?? [];
    expect(() => catalogoValidado(conCasas(casas.map(({ silueta: _, ...m }) => m)))).toThrow(
      /no trae la silueta de su imagen: rehaz el catálogo \(pnpm taller catalogo-escena\)/,
    );
    expect(() =>
      catalogoValidado(conCasas(casas.map((m) => ({ ...m, silueta: [[0.2, 1.5]] })))),
    ).toThrow(/su silueta son pares \[arriba, abajo\] de fracciones del alto entre 0 y 1/);
    expect(() =>
      catalogoValidado(conCasas(casas.map((m) => ({ ...m, silueta: [[0.2]] })))),
    ).toThrow(/su silueta son pares/);
    const muro = crudo.hojas.muro ?? [];
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: { ...crudo.hojas, muro: muro.map((m) => ({ ...m, silueta: [[0, 1]] })) },
      }),
    ).toThrow(/trae silueta y su hoja no la lleva/);
  });
});
