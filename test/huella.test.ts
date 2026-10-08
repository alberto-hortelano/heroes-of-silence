/**
 * La huella de los caminos (#191, #190): la senda ancha, de borde roto y casi
 * recta donde la rejilla va recta; y la trocha de cada paso sin camino de
 * bosque, montaña o acantilado, que no es camino y nada tapa.
 */
import { describe, expect, it } from 'vitest';
import {
  formaDeLasTrochas,
  type Sprite,
  trochasTapadas,
} from '../src/client/render/escenario/colocar.js';
import { azarDe } from '../src/client/render/escenario/esparcir.js';
import { discosDe } from '../src/client/render/escenario/huella.js';
import {
  BARRERAS_CON_TROCHA,
  pasaElCamino,
  SEMIANCHO_DE_LA_TROCHA,
  trochasDeLosPasos,
  VAIVEN_DE_TROCHA,
} from '../src/client/render/escenario/nodos.js';
import { Obstaculos } from '../src/client/render/escenario/pasillo.js';
import {
  ANCHO_DE_SENDA,
  encadenar,
  IRREGULARIDAD_DE_SENDA,
  suavizar,
  VAIVEN,
  VAIVEN_EN_LO_RECTO,
} from '../src/client/render/escenario/sendas.js';
import { partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

/** Una fila de `n` casillas, de izquierda a derecha, por la y = 0,5. */
const fila = (n: number) =>
  Array.from({ length: n }, (_, x) => [x + 0.5, 0.5, x + 1.5, 0.5] as const);

describe('la senda: menos vaivén en lo recto (#191)', () => {
  it('una recta de doce casillas no se aparta más que el vaivén de lo recto', () => {
    for (const semilla of [1, 2, 3, 4, 5]) {
      const [l] = encadenar(fila(12));
      const s = suavizar(l as [number, number][], azarDe(semilla));
      const mayor = Math.max(...s.map(([, y]) => Math.abs(y - 0.5)));
      expect(mayor, `semilla ${semilla}`).toBeLessThanOrEqual(VAIVEN * VAIVEN_EN_LO_RECTO + 1e-9);
    }
  });

  it('una escalera de giros sí serpentea con el vaivén entero', () => {
    // Derecha, abajo, derecha, abajo…: cada tramo recto es de una casilla.
    const escalera = Array.from({ length: 10 }, (_, k) => {
      const x = Math.floor((k + 1) / 2);
      const y = Math.floor(k / 2);
      return k % 2 === 0
        ? ([x + 0.5, y + 0.5, x + 1.5, y + 0.5] as const)
        : ([x + 0.5, y + 0.5, x + 0.5, y + 1.5] as const);
    });
    const [l] = encadenar(escalera);
    let mayor = 0;
    for (const semilla of [1, 2, 3, 4, 5]) {
      const s = suavizar(l as [number, number][], azarDe(semilla));
      // Lo que se aparta de la diagonal de la escalera (x − y = 0,5 tras los puntos medios).
      for (const [x, y] of s) mayor = Math.max(mayor, Math.abs(x - y - 0.5) / Math.SQRT2);
    }
    expect(mayor).toBeGreaterThan(VAIVEN * VAIVEN_EN_LO_RECTO);
  });
});

describe('la huella: un borde roto dentro de sus cotas (`discosDe`)', () => {
  const [l] = encadenar(fila(20));
  const linea = suavizar(l as [number, number][], azarDe(9));
  const [discos] = discosDe([linea], ANCHO_DE_SENDA / 2, IRREGULARIDAD_DE_SENDA, 7);

  it('el radio varía, y nunca sale de la media anchura por (1 ± la irregularidad)', () => {
    const radios = (discos ?? []).map(([, , r]) => r);
    const m = ANCHO_DE_SENDA / 2;
    const tope = IRREGULARIDAD_DE_SENDA.lenta + IRREGULARIDAD_DE_SENDA.rapida;
    expect(Math.min(...radios)).toBeGreaterThanOrEqual(m * (1 - tope) - 1e-9);
    expect(Math.max(...radios)).toBeLessThanOrEqual(m * (1 + tope) + 1e-9);
    // Y no es un trazo de ancho fijo.
    expect(Math.max(...radios) - Math.min(...radios)).toBeGreaterThan(0.2 * m);
  });

  it('cubre la línea entera: empieza y acaba en sus puntas, sin huecos de más de un paso', () => {
    const d = discos ?? [];
    expect(d[0]?.slice(0, 2)).toEqual(linea[0]);
    expect(d.at(-1)?.slice(0, 2)).toEqual(linea.at(-1));
    for (let i = 1; i < d.length; i++) {
      const [x0, y0] = d[i - 1] as readonly number[];
      const [x1, y1] = d[i] as readonly number[];
      expect(
        Math.hypot((x1 as number) - (x0 as number), (y1 as number) - (y0 as number)),
      ).toBeLessThanOrEqual(0.0400001);
    }
  });

  it('la misma semilla da el mismo borde, y otra semilla otro', () => {
    expect(discosDe([linea], 0.16, IRREGULARIDAD_DE_SENDA, 7)).toEqual([discos]);
    expect(discosDe([linea], 0.16, IRREGULARIDAD_DE_SENDA, 8)).not.toEqual([discos]);
  });
});

describe('la trocha de los pasos sin camino (#190)', () => {
  it(`semillas ${segunPrisa('1, 5 y 36', '1-40')}: todo paso de bosque, montaña o acantilado lleva senda o trocha, y solo uno de los dos`, () => {
    let trochas = 0;
    for (const s of segunPrisa([1, 5, 36], rango(1, 40))) {
      const { map, escena } = partidaDe(s);
      const puentes = new Set(escena.puentes.map((p) => p.id));
      const pasos = map.objects.filter(
        (o) => o.kind === 'node' && !puentes.has(o.id) && BARRERAS_CON_TROCHA.includes(o.barrera),
      );
      for (const o of pasos) {
        const centro = [o.at.x + 0.5, o.at.y + 0.5];
        // La trocha pasa por el nodo: su eje lo cruza, y un punto suyo cae a
        // menos de medio paso (0,125 en lo recto, 0,18 en diagonal) más su vaivén.
        const suya = escena.trochas.filter((t) =>
          t.some(
            ([x, y]) =>
              Math.hypot(x - (centro[0] as number), y - (centro[1] as number)) <=
              0.18 + VAIVEN_DE_TROCHA,
          ),
        );
        const conCamino = pasaElCamino(map.caminos.tramos, o.at);
        expect(conCamino || suya.length > 0, `semilla ${s}, nodo ${o.id} sin senda ni trocha`).toBe(
          true,
        );
        expect(conCamino && suya.length > 0, `semilla ${s}, nodo ${o.id} con senda y trocha`).toBe(
          false,
        );
      }
      trochas += escena.trochas.length;
      expect(escena.informe.trochasTapadas, `semilla ${s}`).toBe(0);
      expect(trochasTapadas(escena.sprites, escena.trochas), `semilla ${s}`).toEqual([]);
    }
    // Que el guardia mire algo: 19 trochas en 1, 5 y 36 (08-10-2026).
    expect(trochas).toBeGreaterThanOrEqual(segunPrisa(12, 120));
  });

  it('no es camino: la trocha no cambia los tramos del mapa', () => {
    const { map } = partidaDe(1);
    const antes = JSON.stringify(map.caminos);
    trochasDeLosPasos(map, new Set(), 1);
    expect(JSON.stringify(map.caminos)).toBe(antes);
  });

  describe('el guardia `trochasTapadas` muerde', () => {
    const trocha = [
      [2.5, 5.5],
      [8.5, 5.5],
    ] as const;
    const sprite = (y: number, clase: Sprite['clase'], alto: number): Sprite => ({
      src: 'x.webp',
      nw: 100,
      nh: 100,
      ax: 50,
      ay: 100,
      x: 5.5,
      y,
      alto,
      clase,
      color: '#000',
      capa: 0,
      sombra: false,
    });

    it('un abeto bajo (no volumen) encima de la trocha se cuenta, y la puerta lo encoge hasta salir', () => {
      const abeto = sprite(5.7, 'cubierta', 0.6);
      expect(trochasTapadas([abeto], [trocha])).toHaveLength(1);
      const puerta = new Obstaculos([formaDeLasTrochas([trocha])]);
      expect(puerta.pisa(abeto)).toBe(true);
      const libre = puerta.altoLibre(abeto);
      expect(libre).toBeLessThan(abeto.alto);
      expect(trochasTapadas([{ ...abeto, alto: libre }], [trocha])).toEqual([]);
    });

    it('uno a más de su arcén, no; ni el muro y la pared, que no se apartan', () => {
      expect(
        trochasTapadas([sprite(5.5 - SEMIANCHO_DE_LA_TROCHA - 0.05, 'cubierta', 0.3)], [trocha]),
      ).toEqual([]);
      expect(trochasTapadas([sprite(6, 'muro', 1), sprite(6, 'pared', 1)], [trocha])).toEqual([]);
    });
  });
});
