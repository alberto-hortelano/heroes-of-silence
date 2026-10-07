/**
 * La cara de acantilado se pinta solo bajo la silueta de su pared (#159), y el
 * pedregal que queda donde no entró una pared toma el tono de lo que tiene
 * alrededor (#170).
 *
 * Se vieron morder a mano (07-10-2026): con `pintada` igual a la banda entera,
 * lo de antes, `carasLisas` da 911 en las semillas 1-40; con el pedregal con
 * el tono de su cara siempre, 108 peñascos sueltos con el tono de otro suelo
 * (56 oscuros, de basalto o de arenisca).
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  altoDeLaSilueta,
  carasLisas,
  columnasDeCara,
  PASO_DE_CARA,
  perfilesDelCatalogo,
  pintadaDeCara,
} from '../src/client/render/escenario/caras.js';
import {
  type CatalogoEnBruto,
  catalogoValidado,
  type Modulo,
} from '../src/client/render/escenario/catalogo.js';
import {
  materialDeCara,
  type Sprite,
  tonoDelPedregalSuelto,
} from '../src/client/render/escenario/colocar.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import {
  bandaDeCara,
  CARA_DE_SUELO,
  type Cara,
  type CaraDeEscena,
} from '../src/client/render/escenario/relieve.js';
import type { Suelo } from '../src/core/map/terrain.js';
import { FRANJAS_DEL_PERFIL, perfilDeModulo } from '../tools/taller/derivar.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const catalogo = catalogoDelDisco();
const perfilDe = perfilesDelCatalogo(catalogo);

/** Una cara de una casilla y caída 3, como la del sur del castillo de la semilla 2. */
const CARA: Cara = { y: 2, x0: 0, x1: 0, caida: 3, material: 'cara-roca' };
const [, FILO, , PIE] = bandaDeCara(CARA);

/** El módulo `m` de pared plantado en el pie de `CARA`, en `x`, con `alto` casillas. */
function pared(m: Modulo, x: number, alto: number): Sprite {
  return {
    src: m.src,
    nw: m.nw,
    nh: m.nh,
    ax: m.ax,
    ay: m.ay,
    x,
    y: PIE + 0.05,
    alto,
    clase: 'pared',
    color: '#4c463e',
    capa: 0,
    sombra: true,
  };
}

const roca = catalogo.hojas['paredes-roca']?.[0] as Modulo;

/** La cara con lo que se pintaría de ella con `sprites`. */
const conPintada = (sprites: readonly Sprite[]): CaraDeEscena => ({
  ...CARA,
  rampas: [],
  pintada: pintadaDeCara(CARA, sprites, perfilDe),
});

/** La cara pintada entera, la banda de punta a punta: lo de antes de #159. */
const entera = (c: CaraDeEscena): CaraDeEscena => {
  const [, filo, , pie] = bandaDeCara(c);
  return { ...c, pintada: columnasDeCara(c).map((): [number, number] => [filo, pie]) };
};

describe('lo que se pinta de una cara (#159)', () => {
  it('las columnas van de x0 a x1 + 1 cada PASO_DE_CARA, las dos puntas incluidas', () => {
    const xs = columnasDeCara(CARA);
    expect(xs).toHaveLength(Math.round(1 / PASO_DE_CARA) + 1);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBeCloseTo(1, 9);
  });

  it('sin pared, nada: se ve el suelo de abajo, no un rectángulo liso', () => {
    expect(conPintada([]).pintada.every((t) => t === null)).toBe(true);
  });

  it('con un módulo de pared, cada columna empieza en lo alto de su silueta, no en el filo, y no pasa del pie', () => {
    const s = pared(roca, 0.5, CARA.caida * 0.6 + 0.4);
    const { pintada } = conPintada([s]);
    const xs = columnasDeCara(CARA);
    let bajoElFilo = 0;
    for (const [i, t] of pintada.entries()) {
      const alto = altoDeLaSilueta(s, perfilDe(s), xs[i] as number);
      expect(t, `columna ${i}`).not.toBeNull();
      const [desde, hasta] = t as readonly [number, number];
      expect(desde).toBeCloseTo(Math.max(FILO, alto as number), 9);
      expect(hasta).toBeLessThanOrEqual(PIE);
      if (desde > FILO + 0.02) bajoElFilo++;
    }
    // El perfil del arte, no la caja: alguna columna empieza por debajo del filo.
    expect(bajoElFilo).toBeGreaterThan(0);
  });

  it('una pared que no cubre la cara entera deja sin pintar lo que no tapa, con el borde donde acaba su silueta', () => {
    // Corrida a la derecha: lo de la izquierda de su caja no se pinta.
    const s = pared(roca, 1.4, 1.6);
    const { pintada } = conPintada([s]);
    const [x0] = cajaDeSprite(s);
    const xs = columnasDeCara(CARA);
    for (const [i, t] of pintada.entries())
      if ((xs[i] as number) < x0) expect(t, `columna ${i}`).toBeNull();
    expect(pintada.some((t) => t === null)).toBe(true);
    expect(pintada.some((t) => t !== null)).toBe(true);
  });

  it('carasLisas: 0 con lo que se pinta, y lo cuenta con la banda entera (muerde)', () => {
    // Una pared baja, la de junto a la senda: la mitad de arriba de la banda queda sin tapar.
    const s = pared(roca, 0.5, CARA.caida * 0.6 * 0.5);
    const c = conPintada([s]);
    expect(carasLisas([c], [s], perfilDe)).toEqual([]);
    const lisas = carasLisas([entera(c)], [s], perfilDe);
    expect(lisas.length).toBeGreaterThan(0);
    expect(lisas[0]?.cara).toBe(0);
    // Y sin pared ninguna, la banda entera es un solo trozo liso de punta a punta.
    expect(carasLisas([entera(conPintada([]))], [], perfilDe)).toEqual([{ cara: 0, a: 0, b: 1 }]);
  });

  it('dos paredes con un hueco alto entre ellas en la misma columna: se pinta el tramo más largo, no el hueco', () => {
    // Una pared colgada arriba (la de una escalera que no baja al pie) y otra
    // abajo: pintada de punta a punta, el hueco era una tira lisa (s37 y7 x19).
    const arriba = { ...pared(roca, 0.5, 0.5), y: FILO + 0.4 };
    const abajo = pared(roca, 0.5, 0.9);
    const c = conPintada([arriba, abajo]);
    expect(carasLisas([c], [arriba, abajo], perfilDe)).toEqual([]);
    const mitad = c.pintada[10] as readonly [number, number];
    expect(mitad[0]).toBeGreaterThan(FILO + 0.4);
  });
});

describe('el perfil de un módulo: lo deriva el taller y lo comprueba el catálogo', () => {
  it('perfilDeModulo: por franja, dónde empieza lo opaco en la columna que empieza más abajo; sin nada, 1', async () => {
    // 64 × 40: la mitad izquierda opaca desde la fila 20, la derecha desde la
    // 10, salvo las 4 últimas columnas, vacías; y en la franja 0, una columna
    // que empieza en la fila 30.
    const [w, h] = [64, 40];
    const datos = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w - 4; x++) {
        const desde = x === 1 ? 30 : x < w / 2 ? 20 : 10;
        if (y >= desde) datos[(y * w + x) * 4 + 3] = 255;
      }
    const ruta = `${process.env.TMPDIR ?? '/tmp'}/perfil-${process.pid}.png`;
    await sharp(datos, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(ruta);
    const perfil = await perfilDeModulo(ruta);
    expect(perfil).toHaveLength(FRANJAS_DEL_PERFIL);
    expect(perfil[0]).toBe(0.75);
    expect(perfil.slice(1, 16)).toEqual(new Array(15).fill(0.5));
    expect(perfil.slice(16, 30)).toEqual(new Array(14).fill(0.25));
    expect(perfil.slice(30)).toEqual([1, 1]);
  });

  it('toda pared, ladera y peñasco del catálogo del repo trae su perfil, y nada más lo trae', () => {
    for (const [hoja, ms] of Object.entries(catalogo.hojas))
      for (const m of ms)
        expect(m.perfil !== undefined, `${hoja}/${m.nombre}`).toBe(
          /^(paredes|laderas)-/.test(hoja) || hoja === 'rocas-caidas',
        );
  });

  it('catalogoValidado lanza sin el perfil de una pared, con perfil fuera de una que tapa una cara, o con fracciones fuera de 0-1', () => {
    const crudo = catalogo as unknown as CatalogoEnBruto;
    const conRoca = (ms: CatalogoEnBruto['hojas'][string]): CatalogoEnBruto => ({
      ...crudo,
      hojas: { ...crudo.hojas, 'paredes-roca': ms },
    });
    const roca = crudo.hojas['paredes-roca'] ?? [];
    expect(() => catalogoValidado(conRoca(roca.map(({ perfil: _, ...m }) => m)))).toThrow(
      /no trae el perfil de su silueta: rehaz el catálogo \(pnpm taller catalogo-escena\)/,
    );
    expect(() =>
      catalogoValidado(conRoca(roca.map((m) => ({ ...m, perfil: [0.2, 1.5] })))),
    ).toThrow(/su perfil son fracciones del alto entre 0 y 1/);
    const [hoja, ms] = Object.entries(crudo.hojas).find(([h]) => h.startsWith('frondosos')) ?? [];
    expect(() =>
      catalogoValidado({
        ...crudo,
        hojas: {
          ...crudo.hojas,
          [hoja as string]: (ms ?? []).map((m) => ({ ...m, perfil: [0.5] })),
        },
      }),
    ).toThrow(/trae perfil y su hoja no tapa ninguna cara/);
  });
});

describe('el tono del pedregal de una cara, según lo que tiene alrededor (#170)', () => {
  const peñasco = (x: number, y: number): Sprite => ({
    ...pared(catalogo.hojas['rocas-caidas']?.[0] as Modulo, x, 0.35),
    y,
    tono: materialDeCara('cara-basalto').pedregal,
  });
  const llano = (): Suelo => 'dirt';

  it('suelto en el llano, el de su suelo: el del basalto era una mancha negra', () => {
    const p = peñasco(5.5, 5.5);
    expect(tonoDelPedregalSuelto(p, [p], llano)).toBe(materialDeCara(CARA_DE_SUELO.dirt).pedregal);
  });

  it('con una pared al lado, el de su cara', () => {
    const p = peñasco(0.5, PIE - 0.3);
    const muro = pared(roca, 0.5, 2.2);
    expect(tonoDelPedregalSuelto(p, [p, muro], llano)).toBe(p.tono);
  });
});

/**
 * Los mapas reales: las semillas de los casos de #159 y #170 en el bucle
 * rápido, y 1-40 en la orden lenta.
 */
const SEMILLAS = segunPrisa([2, 9], rango(1, 40));

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS) {
    const e = partidaDe(semilla).escena;

    it(`semilla ${semilla}: ninguna cara se pinta lisa, contado por fuera y por el informe`, () => {
      expect(e.informe.carasLisas).toBe(0);
      expect(carasLisas(e.relieve.caras, e.sprites, perfilDe)).toEqual([]);
      // Cada tramo pintado cae en su banda, de arriba abajo.
      for (const c of e.relieve.caras) {
        const [, filo, , pie] = bandaDeCara(c);
        expect(c.pintada).toHaveLength(columnasDeCara(c).length);
        for (const t of c.pintada) {
          if (t === null) continue;
          expect(t[0]).toBeGreaterThanOrEqual(filo);
          expect(t[1]).toBeLessThanOrEqual(pie);
          expect(t[1]).toBeGreaterThan(t[0]);
        }
      }
    });

    it(`semilla ${semilla}: ningún peñasco suelto, sin pared al lado, con el tono de otro suelo`, () => {
      const paredes = e.sprites
        .filter((s) => s.clase === 'pared' && s.src !== null && !s.src.includes('rocas-caidas'))
        .map((s) => cajaDeSprite(s));
      const sueltos = e.sprites.filter((s) => {
        if (s.clase !== 'pared' || !s.src?.includes('rocas-caidas')) return false;
        const suelo = e.suelo[
          Math.min(e.H - 1, Math.floor(s.y)) * e.W + Math.min(e.W - 1, Math.floor(s.x))
        ] as Suelo;
        if (s.tono === materialDeCara(CARA_DE_SUELO[suelo]).pedregal) return false;
        return !paredes.some(
          ([a, b, c, d]) => s.x >= a - 0.3 && s.x <= c + 0.3 && s.y >= b && s.y <= d + 0.3,
        );
      });
      expect(sueltos.map((s) => `${s.tono} en ${s.x.toFixed(2)},${s.y.toFixed(2)}`)).toEqual([]);
    });
  }

  // La marca del usuario: s2 (23, 9), «Cuadrado de fondo», un bloque liso bajo el
  // castillo. #161 cambió la red de s2 y ese castillo ya no está ahí: se busca el
  // primer caso igual, una cara de caída ≥ 2 bajo una ciudad que con la banda
  // entera se contaba lisa.
  it('bajo una ciudad al borde de un acantilado, la cara deja de ser un bloque liso', () => {
    for (let s = 1; s <= 40; s++) {
      const { map, escena: e } = partidaDe(s);
      const ciudades = map.objects.filter((o) => o.kind === 'town');
      const c = e.relieve.caras.find(
        (f) =>
          f.caida >= 2 &&
          ciudades.some((o) => o.at.y === f.y && o.at.x >= f.x0 && o.at.x <= f.x1) &&
          carasLisas([entera(f)], e.sprites, perfilDe).length > 0,
      );
      if (c === undefined) continue;
      expect(carasLisas([c], e.sprites, perfilDe), `s${s} cara ${c.y} ${c.x0}-${c.x1}`).toEqual([]);
      return;
    }
    throw new Error('ninguna ciudad al borde de un acantilado en las semillas 1-40');
  });
});
