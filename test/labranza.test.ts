/**
 * La labranza en campos (20-10-2026, `docs/agents/2026-10-20-labranza-en-campos/`):
 * la cubierta del suelo `dirt` era un confeti de parcelas sueltas, atrezo al
 * azar y matas de la pradera. Ahora la regla (`labranza.ts`) agrupa las
 * casillas en campos de un cultivo, con una parcela por casilla, centrada; el
 * atrezo y las casas sueltas van pocos y donde tienen sentido; y la escena los
 * pone por su nombre, con las parcelas como suelo y las casas como volumen.
 */
import { RedDeCaminos } from '@core/map/map.js';
import { esBarrera, type TerrainKind } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { bajoLaCopa } from '../src/client/render/escenario/colocar.js';
import {
  APARTAN_LA_LABRANZA,
  ATREZO,
  CAMPO_MAS_GRANDE,
  CAMPOS_POR_ATREZO,
  CAMPOS_POR_CASA,
  CASA_LEJOS_DEL_CAMINO,
  type Cultivo,
  casillasConCamino,
  ENTRE_ATREZO,
  ENTRE_CASAS,
  type EntradaDeLabranza,
  ESCALA_EN_LA_LINDE,
  type Labranza,
  LEJOS_DE_UN_OBJETO,
  labranzaDe,
  MODULOS_DE_LA_LABRANZA,
  type ObjetoDelMapa,
  PARCELAS,
} from '../src/client/render/escenario/labranza.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { esVolumen, separar } from '../src/client/render/escenario/pintar.js';
import { partidaDe } from './helpers.js';

const W = 16;
const H = 16;

/** Un mapa de W × H todo labranza, salvo `camino` (que no es labranza) y con `pueblo` cerca. */
function entrada(
  semilla: number,
  camino: (x: number, y: number) => boolean = () => false,
  pueblo: (x: number, y: number) => boolean = () => false,
  objetos: readonly ObjetoDelMapa[] = [],
): EntradaDeLabranza {
  const enLaLabranza = new Uint8Array(W * H);
  const deCamino = new Uint8Array(W * H);
  const cercaDePueblo = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      deCamino[i] = camino(x, y) ? 1 : 0;
      enLaLabranza[i] = camino(x, y) ? 0 : 1;
      cercaDePueblo[i] = pueblo(x, y) ? 1 : 0;
    }
  return { W, H, enLaLabranza, camino: deCamino, cercaDePueblo, objetos, semilla };
}

/** El camino y el pueblo con que se prueban el atrezo y las casas. */
const CAMINO = (x: number, y: number) => y === 8 && x < 12;
const PUEBLO = (x: number, y: number) => x >= 12 && y >= 12;
/** Una mina, un cofre y un monstruo: el monstruo no aparta nada. */
const OBJETOS: readonly ObjetoDelMapa[] = [
  { kind: 'mine', x: 3, y: 3 },
  { kind: 'chest', x: 10, y: 12 },
  { kind: 'monster', x: 6, y: 13 },
];
/** La distancia de Chebyshev de la casilla `i` al objeto más cercano que aparta la labranza. */
const alObjeto = (i: number) =>
  Math.min(
    ...OBJETOS.filter((o) => APARTAN_LA_LABRANZA.has(o.kind)).map((o) =>
      Math.max(Math.abs((i % W) - o.x), Math.abs(Math.floor(i / W) - o.y)),
    ),
  );

/** Las vecinas en cruz, y si `(x, y)` cae en el mapa de W × H. */
const CRUZ = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const dentro = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

const SEMILLAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const cheb = (i: number, j: number) =>
  Math.max(Math.abs((i % W) - (j % W)), Math.abs(Math.floor(i / W) - Math.floor(j / W)));
const tamaños = (l: Labranza) => {
  const n = new Map<number, number>();
  for (const c of l.campo) if (c !== -1) n.set(c, (n.get(c) ?? 0) + 1);
  return n;
};
const cultivados = (l: Labranza) => l.cultivos.filter((c) => c !== null).length;

describe('la regla de la labranza (pura)', () => {
  it.each(SEMILLAS)(
    's%i: toda casilla en un campo, de 3 a 6 de mediana y ninguno de más de 7',
    (s) => {
      const l = labranzaDe(entrada(s));
      expect([...l.campo].every((c) => c >= 0)).toBe(true);
      const n = [...tamaños(l).values()].sort((a, b) => a - b);
      const mediana = n[Math.floor(n.length / 2)] as number;
      expect(mediana).toBeGreaterThanOrEqual(3);
      expect(mediana).toBeLessThanOrEqual(6);
      expect(Math.max(...n)).toBeLessThanOrEqual(CAMPO_MAS_GRANDE);
    },
  );

  it.each(SEMILLAS)(
    's%i: un cultivo por campo, cada parcela de su cultivo y una por casilla cultivada',
    (s) => {
      const l = labranzaDe(entrada(s));
      const deCasilla = l.parcelas.filter((p) => !p.junta);
      for (const p of l.parcelas) {
        const cultivo = l.cultivos[l.campo[p.i] as number] as Cultivo | null;
        expect(cultivo, `parcela en la casilla ${p.i}, de un campo en barbecho`).not.toBeNull();
        expect(PARCELAS[cultivo as Cultivo]).toContain(p.nombre);
      }
      const cultivadas = [...l.campo].filter((c) => l.cultivos[c] !== null).length;
      expect(deCasilla.length).toBe(cultivadas);
      expect(new Set(deCasilla.map((p) => p.i)).size).toBe(deCasilla.length);
    },
  );

  it.each(SEMILLAS)('s%i: entre el 15 y el 45 % de la labranza queda en barbecho', (s) => {
    // En un mapa abierto, sin caminos ni bosques que dejen trozos sueltos, dos
    // campos vecinos no quedan los dos en barbecho y la parte baja: 17-24 % en
    // 1-10. En los mapas de 1-10 y 15, un 34,5 % (`barbecho.mts` de la tarea).
    const l = labranzaDe(entrada(s));
    const barbecho = [...l.campo].filter((c) => l.cultivos[c] === null).length / (W * H);
    expect(barbecho).toBeGreaterThanOrEqual(0.15);
    expect(barbecho).toBeLessThanOrEqual(0.45);
  });

  it('dos campos vecinos no quedan los dos en barbecho', () => {
    for (const s of SEMILLAS) {
      const l = labranzaDe(entrada(s));
      for (let i = 0; i < W * H; i++) {
        const x = i % W;
        const c = l.campo[i] as number;
        for (const j of [x + 1 < W ? i + 1 : -1, i + W < W * H ? i + W : -1]) {
          if (j === -1 || l.campo[j] === c) continue;
          expect(
            l.cultivos[c] === null && l.cultivos[l.campo[j] as number] === null,
            `s${s}: barbecho a los dos lados de ${i}-${j}`,
          ).toBe(false);
        }
      }
    }
  });

  it('dentro del campo la parcela va centrada y entera; en la linde, más pequeña y corrida hacia dentro', () => {
    for (const s of SEMILLAS) {
      const l = labranzaDe(entrada(s));
      for (const p of l.parcelas.filter((q) => !q.junta)) {
        const x = p.i % W;
        const y = Math.floor(p.i / W);
        const mismo = (dx: number, dy: number) =>
          dentro(x + dx, y + dy) && l.campo[p.i + dy * W + dx] === l.campo[p.i];
        const lados = CRUZ.filter(([dx, dy]) => !mismo(dx, dy));
        if (lados.length === 0) {
          expect([p.x, p.y, p.escala]).toEqual([x + 0.5, y + 0.5, 1]);
          continue;
        }
        expect(p.escala).toBe(ESCALA_EN_LA_LINDE);
        // Hacia dentro: lejos de cada lado que da a otro campo, salvo si el de
        // enfrente también da a otro (una fila o columna sola: va al medio).
        for (const [dx, dy] of lados) {
          const hacia = dx * (p.x - x - 0.5) + dy * (p.y - y - 0.5);
          const enfrente = lados.some(([u, v]) => u === -dx && v === -dy);
          if (enfrente) expect(hacia).toBeCloseTo(0);
          else expect(hacia).toBeLessThan(0);
        }
      }
    }
  });

  it('la junta va entre dos casillas del mismo campo, una encima de otra', () => {
    const l = labranzaDe(entrada(3));
    const juntas = l.parcelas.filter((p) => p.junta);
    expect(juntas.length).toBeGreaterThan(0);
    for (const p of juntas) {
      expect(l.campo[p.i + W]).toBe(l.campo[p.i]);
      expect(p.y).toBe(Math.floor(p.i / W) + 1);
    }
  });

  it('la misma semilla da la misma labranza, y otra, otra', () => {
    const a = labranzaDe(entrada(7));
    expect(labranzaDe(entrada(7))).toEqual(a);
    expect(labranzaDe(entrada(8)).parcelas).not.toEqual(a.parcelas);
  });

  it('un camino de lado a lado parte los campos: ninguna parcela en él ni un campo a los dos lados', () => {
    for (const s of SEMILLAS) {
      const l = labranzaDe(entrada(s, (_, y) => y === 8));
      expect(l.parcelas.filter((p) => Math.floor(p.i / W) === 8)).toEqual([]);
      expect(l.parcelas.filter((p) => p.junta && Math.floor(p.i / W) === 7)).toEqual([]);
      const arriba = new Set([...l.campo.slice(0, 8 * W)]);
      expect([...l.campo.slice(9 * W)].filter((c) => arriba.has(c))).toEqual([]);
    }
  });

  it('el atrezo va poco y donde tiene sentido, nunca sobre una parcela ni junto a otro', () => {
    let total = 0;
    for (const s of SEMILLAS) {
      const e = entrada(s, CAMINO, PUEBLO, OBJETOS);
      const l = labranzaDe(e);
      total += l.atrezo.length;
      expect(l.atrezo.length).toBeLessThanOrEqual(Math.floor(cultivados(l) / CAMPOS_POR_ATREZO));
      const conParcela = new Set(l.parcelas.filter((p) => !p.junta).map((p) => p.i));
      const cultivoEn = (x: number, y: number) =>
        dentro(x, y) ? l.cultivos[l.campo[y * W + x] as number] : undefined;
      for (const a of l.atrezo) {
        const x = a.i % W;
        const y = Math.floor(a.i / W);
        if (a.cual === 'cerca') {
          // En el borde sur de una parcela de la linde.
          expect(conParcela.has(a.i)).toBe(true);
          expect(a.y).toBeCloseTo(y + 0.95);
          continue;
        }
        expect(conParcela.has(a.i), `${a.cual} sobre una parcela`).toBe(false);
        expect(alObjeto(a.i), `${a.cual} pegado a un objeto`).toBeGreaterThanOrEqual(
          LEJOS_DE_UN_OBJETO,
        );
        if (a.cual === 'almiar') {
          // Arrimado a su trigo: el primero en cruz.
          const [dx, dy] = CRUZ.find(([u, v]) => cultivoEn(x + u, y + v) === 'trigo') as [
            number,
            number,
          ];
          expect([a.x, a.y]).toEqual([x + 0.5 + dx * 0.3, y + 0.75 + dy * 0.3]);
        } else expect([a.x, a.y]).toEqual([x + 0.5, y + 0.75]);
        if (a.cual === 'carreta') {
          const ocho = [-1, 0, 1].flatMap((dy) =>
            [-1, 0, 1].map((dx) => [x + dx, y + dy] as const),
          );
          expect(e.cercaDePueblo[a.i] === 1 || ocho.some(([u, v]) => CAMINO(u, v))).toBe(true);
        }
      }
      for (const [k, a] of l.atrezo.entries())
        for (const b of l.atrezo.slice(k + 1))
          expect(cheb(a.i, b.i)).toBeGreaterThanOrEqual(ENTRE_ATREZO);
    }
    expect(total, 'sin atrezo en diez semillas no se prueba nada').toBeGreaterThan(5);
  });

  it('las casas: pocas, junto a un campo, lejos del camino, del pueblo, de los objetos y de otra casa, nunca sobre una parcela', () => {
    let total = 0;
    for (const s of SEMILLAS) {
      const e = entrada(s, CAMINO, PUEBLO, OBJETOS);
      const l = labranzaDe(e);
      total += l.casas.length;
      expect(l.casas.length).toBeLessThanOrEqual(Math.floor(cultivados(l) / CAMPOS_POR_CASA));
      const conParcela = new Set(l.parcelas.filter((p) => !p.junta).map((p) => p.i));
      for (const c of l.casas) {
        expect(e.cercaDePueblo[c.i]).toBe(0);
        expect(conParcela.has(c.i)).toBe(false);
        expect(alObjeto(c.i), 'pegada a un objeto').toBeGreaterThanOrEqual(LEJOS_DE_UN_OBJETO);
        // Lejos del camino (H1): el héroe no se para encima de ella.
        for (let j = 0; j < W * H; j++)
          if (e.camino[j] === 1)
            expect(cheb(c.i, j), `casa ${c.i} junto al camino ${j}`).toBeGreaterThanOrEqual(
              CASA_LEJOS_DEL_CAMINO,
            );
        expect(l.deRelleno[c.i]).toBe(0);
        const x = c.i % W;
        const y = Math.floor(c.i / W);
        expect(
          CRUZ.some(
            ([dx, dy]) =>
              dentro(x + dx, y + dy) &&
              l.cultivos[l.campo[(y + dy) * W + x + dx] as number] !== null,
          ),
        ).toBe(true);
      }
      for (const [k, a] of l.casas.entries())
        for (const b of l.casas.slice(k + 1))
          expect(cheb(a.i, b.i)).toBeGreaterThanOrEqual(ENTRE_CASAS);
    }
    expect(total, 'sin casas en diez semillas no se prueba nada').toBeGreaterThan(3);
  });

  it('una parcela que no entra saca su casilla de los campos: ni manchas de una casilla ni un almiar sin su trigo', () => {
    /** No entra en una de cada siete casillas; en otra de cada siete, solo encogida. */
    const noEntra = (i: number) => (i * 5 + Math.floor(i / W)) % 7 === 0;
    const encogida = (i: number) => (i * 5 + Math.floor(i / W)) % 7 === 3;
    let almiares = 0;
    for (const s of SEMILLAS) {
      const l = labranzaDe({
        ...entrada(s, CAMINO, PUEBLO),
        escalaQueEntra: (p) => (noEntra(p.i) ? null : encogida(p.i) ? p.escala * 0.7 : p.escala),
      });
      const deCasilla = new Map(l.parcelas.filter((p) => !p.junta).map((p) => [p.i, p]));
      for (const p of l.parcelas.filter((q) => !q.junta)) {
        expect(noEntra(p.i), `parcela en la casilla ${p.i}, donde no entra`).toBe(false);
        if (encogida(p.i)) expect(p.escala).toBeLessThan(ESCALA_EN_LA_LINDE);
      }
      // Toda parcela de casilla tiene al lado, en cruz, otra de su campo.
      for (const p of deCasilla.values()) {
        const x = p.i % W;
        const y = Math.floor(p.i / W);
        expect(
          CRUZ.some(
            ([dx, dy]) =>
              dentro(x + dx, y + dy) &&
              l.campo[(y + dy) * W + x + dx] === l.campo[p.i] &&
              deCasilla.has((y + dy) * W + x + dx),
          ),
          `s${s}: mancha de una casilla en ${p.i}`,
        ).toBe(true);
      }
      // Una casilla donde no entra la parcela queda fuera de los campos o en barbecho.
      for (let i = 0; i < W * H; i++)
        if (noEntra(i) && l.campo[i] !== -1)
          expect(l.cultivos[l.campo[i] as number], `s${s}: casilla ${i} cultivada`).toBeNull();
      for (const a of l.atrezo.filter((b) => b.cual === 'almiar')) {
        almiares++;
        const x = a.i % W;
        const y = Math.floor(a.i / W);
        expect(
          CRUZ.some(([dx, dy]) => {
            const p = deCasilla.get((y + dy) * W + x + dx);
            return dentro(x + dx, y + dy) && p !== undefined && PARCELAS.trigo.includes(p.nombre);
          }),
          `s${s}: almiar en ${a.i} sin parcela de trigo al lado`,
        ).toBe(true);
      }
    }
    expect(almiares, 'sin almiares en diez semillas no se prueba nada').toBeGreaterThan(3);
  });

  it('una casa o un atrezo que no entra va al siguiente sitio (RV1-H1)', () => {
    /** No entra en las columnas pares: la mitad de los sitios de cada lista. */
    const noEntra = (i: number) => (i % W) % 2 === 0;
    let rechazadas = 0;
    let casas = 0;
    let atrezo = 0;
    for (const s of SEMILLAS) {
      const libre = labranzaDe(entrada(s, CAMINO, PUEBLO));
      rechazadas += [...libre.casas, ...libre.atrezo].filter((p) => noEntra(p.i)).length;
      const preguntadas: number[] = [];
      const l = labranzaDe({
        ...entrada(s, CAMINO, PUEBLO),
        entraLaPieza: (p) => {
          preguntadas.push(p.i);
          return !noEntra(p.i);
        },
      });
      for (const p of [...l.casas, ...l.atrezo])
        expect(noEntra(p.i), `s${s}: pieza en la casilla ${p.i}, donde no entra`).toBe(false);
      // Se pregunta por la pieza que se pone, en su sitio: el almiar, arrimado.
      for (const p of [...l.casas, ...l.atrezo]) expect(preguntadas).toContain(p.i);
      casas += l.casas.length;
      atrezo += l.atrezo.length;
    }
    expect(rechazadas, 'sin rechazos, no se prueba el siguiente sitio').toBeGreaterThan(3);
    expect(casas, 'que no entre en un sitio no deja sin casas').toBeGreaterThan(3);
    expect(atrezo, 'ni sin atrezo').toBeGreaterThan(3);
  });

  it('el camino de la labranza son las casillas de los tramos y las sueltas', () => {
    const red = RedDeCaminos.desdeTramos(
      [
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      ],
      W,
      H,
      [{ x: 9, y: 5 }],
    );
    const camino = casillasConCamino(red, W, H);
    const marcadas = [...camino.keys()].filter((i) => camino[i] === 1);
    expect(marcadas).toEqual([1 * W + 1, 2 * W + 2, 5 * W + 9]);
  });

  it('una escala que crece al entrar lanza', () => {
    expect(() => labranzaDe({ ...entrada(1), escalaQueEntra: (p) => p.escala + 0.1 })).toThrow(
      /no crece al entrar/,
    );
  });
});

describe.each([15, 19])('la labranza en la escena de la semilla %i', (semilla) => {
  const { map, escena } = partidaDe(semilla);
  /** Si el pie de `s` está en tierra que se pisa: el suelo que se pinta es `dirt` y no es barrera. */
  const enLaTierra = (s: { x: number; y: number }) => {
    const i = Math.floor(s.y) * map.width + Math.floor(s.x);
    return escena.suelo[i] === 'dirt' && !esBarrera(map.terrain[i] as TerrainKind);
  };
  // Las de la labranza: las casas de una ciudad, de la misma hoja, son de su recinto (`recinto.ts`).
  const de = (hoja: string) =>
    escena.sprites.filter((s) => s.src?.startsWith(`modulos/${hoja}/`) && s.objeto === undefined);
  const nombre = (src: string | null) => (src as string).replace(/^.*\/(\d+)\.webp$/, '$1');
  const tierra = de('cubierta-dirt');
  const deParcela = new Set(Object.values(PARCELAS).flat());
  const deAtrezo = new Set<string>(Object.values(ATREZO));
  const parcelas = tierra.filter((s) => deParcela.has(nombre(s.src)));
  const atrezo = tierra.filter((s) => deAtrezo.has(nombre(s.src)));

  it('sin pradera en la tierra que se pisa', () => {
    expect(de('cubierta-grass').filter(enLaTierra)).toEqual([]);
  });

  it('las parcelas, centradas en su casilla o en la junta con la de debajo, y planas', () => {
    /** Si la parte fraccionaria `f` es `v`, también por la vuelta (0,999… es 0). */
    const cerca = (f: number, v: number) => Math.abs(((f - v + 0.5) % 1) - 0.5) < 1e-6;
    // Que no pase en vacío: en s15, 95 desde el recinto de las ciudades del
    // núcleo (vuelta 3, otros mapas); eran más de 100.
    expect(parcelas.length).toBeGreaterThan(80);
    const sitios = [0.5, 0.5 - (1 - ESCALA_EN_LA_LINDE) / 2, 0.5 + (1 - ESCALA_EN_LA_LINDE) / 2];
    for (const s of parcelas) {
      expect(s.plano).toBe(true);
      expect(esVolumen(s)).toBe(false);
      expect(enLaTierra(s)).toBe(true);
      const [x0, y0, x1, y1] = cajaDeSprite(s);
      const cx = (x0 + x1) / 2 - Math.floor((x0 + x1) / 2);
      const cy = (y0 + y1) / 2 - Math.floor((y0 + y1) / 2);
      expect(
        sitios.some((v) => cerca(cx, v)),
        `x ${cx}`,
      ).toBe(true);
      expect(
        [0, ...sitios].some((v) => cerca(cy, v)),
        `y ${cy}`,
      ).toBe(true);
    }
    const { planos } = separar(escena);
    expect(parcelas.every((s) => planos.includes(s))).toBe(true);
  });

  it('el atrezo, pocos y en su sitio de la casilla; lo alto de la tierra, solo piedras y matas', () => {
    expect(atrezo.length).toBeLessThanOrEqual(parcelas.length / 10);
    // En el medio de su casilla, la cerca en su borde sur y el almiar arrimado a su trigo.
    const cerca = (f: number, vs: readonly number[]) =>
      vs.some((v) => Math.abs(((f - v + 1.5) % 1) - 0.5) < 1e-6);
    for (const s of atrezo) {
      expect(enLaTierra(s)).toBe(true);
      expect(cerca(s.x, [0.5, 0.2, 0.8]), `x ${s.x}`).toBe(true);
      expect(cerca(s.y, [0.75, 0.95, 0.45, 0.05]), `y ${s.y}`).toBe(true);
    }
    // Una pieza de la tierra con el pie fuera de la tierra que se pisa: lo alto
    // de un acantilado o el pie de una muralla de tierra.
    const enLoAlto = tierra.filter((s) => !enLaTierra(s));
    expect(enLoAlto.filter((s) => MODULOS_DE_LA_LABRANZA.has(nombre(s.src)))).toEqual([]);
  });

  /** Las parcelas de casilla (no las de la junta), por su casilla, con su cultivo. */
  const W_ = map.width;
  const deCasilla = new Map<number, Cultivo>();
  for (const s of parcelas) {
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    if (Math.abs(cy - Math.floor(cy) - 0.5) > 0.25) continue;
    const n = nombre(s.src);
    const cultivo = (Object.keys(PARCELAS) as Cultivo[]).find((c) => PARCELAS[c].includes(n));
    deCasilla.set(Math.floor(cy) * W_ + Math.floor(cx), cultivo as Cultivo);
  }

  it('ninguna mancha de cultivo de una sola casilla (H5)', () => {
    const sueltas = [...deCasilla].filter(([i, c]) =>
      CRUZ.every(([dx, dy]) => {
        const x = (i % W_) + dx;
        return x < 0 || x >= W_ || deCasilla.get(i + dy * W_ + dx) !== c;
      }),
    );
    expect(sueltas.map(([i]) => `(${i % W_}, ${Math.floor(i / W_)})`)).toEqual([]);
  });

  it('el almiar, al lado de una parcela de trigo que se ve (H5)', () => {
    const almiares = atrezo.filter((s) => nombre(s.src) === ATREZO.almiar);
    for (const a of almiares) {
      // Arrimado: el centro de una casilla con parcela de trigo, a menos de una
      // casilla de su pie (sin arrimar, el de la vecina del norte quedaba a 1,25).
      const junto = [...deCasilla].some(
        ([i, c]) =>
          c === 'trigo' &&
          Math.max(Math.abs((i % W_) + 0.5 - a.x), Math.abs(Math.floor(i / W_) + 0.5 - a.y)) < 1,
      );
      expect(junto, `almiar en (${a.x}, ${a.y})`).toBe(true);
    }
  });

  it('ninguna parcela bajo la copa de un bosque (H4)', () => {
    const bajo = bajoLaCopa(escena.sprites);
    expect(parcelas.filter(bajo).map((s) => [s.x, s.y])).toEqual([]);
  });

  it('ni casas ni atrezo bajo la copa de un bosque (RV1-H1)', () => {
    const bajo = bajoLaCopa(escena.sprites);
    const piezas = [...de('casas'), ...atrezo];
    expect(piezas.length).toBeGreaterThan(0);
    expect(piezas.filter(bajo).map((s) => [s.src, s.x, s.y])).toEqual([]);
  });

  it('casas, almiares y carretas, lejos de los objetos; las casas, lejos de los caminos (H3, H1)', () => {
    const lejos = escena.sprites.filter(
      (s) =>
        (s.src?.startsWith('modulos/casas/') === true && s.objeto === undefined) ||
        (s.src?.startsWith('modulos/cubierta-dirt/') === true &&
          [ATREZO.almiar, ATREZO.carreta].includes(nombre(s.src) as '10')),
    );
    expect(lejos.length).toBeGreaterThan(0);
    const objetos = map.objects.filter((o) => APARTAN_LA_LABRANZA.has(o.kind));
    // La casilla de la pieza: el pie va a x + 0,5 e y + 0,75 (la casa, 0,8), y el
    // almiar se arrima 0,3 a su trigo, así que redondeando sale la suya.
    const casilla = (s: { x: number; y: number }) => [
      Math.round(s.x - 0.5),
      Math.round(s.y - 0.75),
    ];
    for (const s of lejos) {
      const [x, y] = casilla(s) as [number, number];
      for (const o of objetos)
        expect(
          Math.max(Math.abs(o.at.x - x), Math.abs(o.at.y - y)),
          `${s.src} en (${x}, ${y}) junto a ${o.kind} (${o.at.x}, ${o.at.y})`,
        ).toBeGreaterThanOrEqual(LEJOS_DE_UN_OBJETO);
    }
    const caminos = map.caminos.indices.map((i) => ({
      x: i % map.width,
      y: Math.floor(i / map.width),
    }));
    for (const s of lejos.filter((c) => c.src?.startsWith('modulos/casas/'))) {
      const [x, y] = [Math.floor(s.x), Math.floor(s.y)];
      for (const p of caminos)
        expect(
          Math.max(Math.abs(p.x - x), Math.abs(p.y - y)),
          `casa en (${x}, ${y}) junto al camino (${p.x}, ${p.y})`,
        ).toBeGreaterThanOrEqual(CASA_LEJOS_DEL_CAMINO);
    }
  });

  it('toda la labranza, con el mismo tono', () => {
    const tonos = new Set([...tierra, ...de('casas')].map((s) => s.tono));
    expect(tonos.size).toBe(1);
    expect([...tonos][0]).toMatch(/saturate\(0\.\d+\)/);
  });

  it('las casas, pequeñas, en la tierra y con volumen: una figura puede quedar detrás', () => {
    const casas = de('casas');
    expect(casas.length).toBeGreaterThan(0);
    const { volumenes } = separar(escena);
    for (const s of casas) {
      expect(enLaTierra(s)).toBe(true);
      const [x0, , x1] = cajaDeSprite(s);
      expect(x1 - x0).toBeLessThanOrEqual(0.8);
      expect(s.plano).toBe(false);
      expect(volumenes.some((v) => v.s === s)).toBe(true);
    }
    for (const [k, a] of casas.entries())
      for (const b of casas.slice(k + 1))
        expect(
          Math.max(
            Math.abs(Math.floor(a.x) - Math.floor(b.x)),
            Math.abs(Math.floor(a.y) - Math.floor(b.y)),
          ),
        ).toBeGreaterThanOrEqual(ENTRE_CASAS);
  });
});
