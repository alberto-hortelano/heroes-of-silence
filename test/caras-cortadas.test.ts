/**
 * El borde de la meseta no acaba en un bloque suelto junto a un objeto (#221):
 * la pared del desnivel pasa por detrás de las minas, los pueblos, las
 * ciudades y los nodos de su pie (`ponerPared`) mientras no los tape a ellos
 * ni a su camino, y el contador (`carasCortadas`) cuenta las tiradas de
 * frontal de no más de `CABO_SUELTO` casillas con una punta que acaba en el
 * llano junto a uno.
 *
 * Se vio morder (09-10-2026): con la pared que se saltaba la reserva de un
 * objeto (lo de antes), el contador da 13 en 1-40 y 72 en 1-200, y en la
 * muestra del bucle rápido 2, 1, 2 y 1 (s57, s443, s10 y s37); con la de
 * ahora, 4, 18 y 1, 0, 1 y 0. Lo que queda, en `QUEDAN`: la muesca de una
 * casilla de una ciudad entre dos niveles con el camino de su puerta por ella
 * (s57, s10, s6: la diagonal que la remataría tapa el camino) y el puente
 * (s12: la pared que cruza su línea no lleva pieza, `celdasBajoLosPuentes`, y
 * el tablero empieza 0,3 más allá).
 */
import { describe, expect, it } from 'vitest';
import {
  CABO_SUELTO,
  CORTE_JUNTO_A_UN_OBJETO,
  carasCortadas,
} from '../src/client/render/escenario/caras.js';
import type { Modulo } from '../src/client/render/escenario/catalogo.js';
import type { Sprite } from '../src/client/render/escenario/colocar.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { bandaDeCara, type Cara } from '../src/client/render/escenario/relieve.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const catalogo = catalogoDelDisco();
const roca = catalogo.hojas['paredes-roca']?.[0] as Modulo;
const W = 20;

/** Una cara de una casilla en el medio del mapa: de x 5,5 a 6,5, colgando de la fila 4. */
const CARA: Cara = { y: 4, x0: 5.5, x1: 5.5, caida: 1, material: 'cara-roca' };
const [, , , PIE] = bandaDeCara(CARA);

/** Una frontal de `CARA` en `x`, de la hoja `src` (las `paredes-*` son las frontales). */
const frontal = (x: number, src = roca.src): Sprite => ({
  src,
  nw: roca.nw,
  nh: roca.nh,
  ax: roca.ax,
  ay: roca.ay,
  x,
  y: PIE + 0.05,
  alto: 1,
  clase: 'pared',
  color: '#4c463e',
  capa: 0,
  sombra: true,
  filaAlta: CARA.y,
});

describe('las tiradas de frontal cortadas junto a un objeto (#221)', () => {
  const bloque = frontal(6);
  const [a, , b] = cajaDeSprite(bloque);
  /** Una mina a la derecha del bloque, al pie de la cara. */
  const mina: readonly [number, number] = [7, 5];

  it('el bloque suelto, con nada a los lados y una mina al lado, cuenta', () => {
    expect(b - a).toBeLessThanOrEqual(CABO_SUELTO);
    expect(carasCortadas([CARA], [bloque], [mina], W)).toEqual([{ cara: 0, a, b }]);
  });

  it('lejos de todo objeto, no: es otra cosa', () => {
    const lejos: readonly [number, number] = [6 + CORTE_JUNTO_A_UN_OBJETO + 2, 5];
    expect(carasCortadas([CARA], [bloque], [lejos], W)).toEqual([]);
  });

  it('si sus dos puntas siguen en otra pared (la diagonal de cada esquina), no', () => {
    const otra = (x: number): Sprite => ({ ...frontal(x, 'otra/diagonal.webp'), filaAlta: 3 });
    const diagonales = [otra(a - 0.4), otra(b + 0.4)];
    expect(carasCortadas([CARA], [bloque, ...diagonales], [mina], W)).toEqual([]);
    // Una sola no basta: la otra punta sigue en el llano.
    expect(carasCortadas([CARA], [bloque, diagonales[0] as Sprite], [mina], W)).toHaveLength(1);
  });

  it('el pedregal no sigue la pared: un peñasco al lado no la remata', () => {
    const peñasco: Sprite = { ...frontal(b + 0.3, 'modulos/rocas-caidas/1.webp'), filaAlta: 3 };
    expect(carasCortadas([CARA], [bloque, peñasco], [mina], W)).toHaveLength(1);
  });

  it('si la punta se mete detrás de un objeto, sigue: la pared no acaba a la vista', () => {
    const ciudad: Sprite = { ...frontal(b + 0.6), src: null, clase: 'objeto', y: PIE - 0.2 };
    const izquierda: Sprite = { ...ciudad, x: a - 0.6 };
    expect(carasCortadas([CARA], [bloque, ciudad, izquierda], [mina], W)).toEqual([]);
  });

  it('una tirada más ancha que CABO_SUELTO no cuenta, ni la que llega al borde del mapa', () => {
    const larga = { ...CARA, x0: 2.5, x1: 5.5 };
    const tres = [frontal(3), frontal(4), frontal(5), frontal(6)];
    expect(carasCortadas([larga], tres, [mina], W)).toEqual([]);
    // Junto al borde la cara empieza a media casilla: el vértice del borde no se mira.
    const remate = (x: number): Sprite => ({ ...frontal(x, 'otra/diagonal.webp'), filaAlta: 3 });
    const enElBorde = { ...CARA, x0: 0.5, x1: 0.5 };
    const [, , fin] = cajaDeSprite(frontal(1));
    expect(carasCortadas([enElBorde], [frontal(1), remate(fin + 0.4)], [[1, 5]], W)).toEqual([]);
    // La misma, lejos del borde, sí.
    const dentro = { ...CARA, x0: 3.5, x1: 3.5 };
    expect(carasCortadas([dentro], [frontal(4), remate(fin + 3.4)], [[4, 5]], W)).toHaveLength(1);
  });
});

/**
 * Los mapas reales: las semillas de la auditoría 7 (s57 (29-33, 25), s443
 * (12-13, 15)) y dos de 1-40 que lo daban (s10 entre dos ciudades, s37), y
 * 1-40 en la orden lenta. Lo que queda, por semilla (arriba).
 */
const QUEDAN: Readonly<Record<number, number>> = { 6: 1, 10: 1, 12: 2, 57: 1 };
const SEMILLAS = segunPrisa([57, 443, 10, 37], [...rango(1, 40), 57, 443]);

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ningún bloque de frontal suelto junto a un objeto, contado por fuera y por el informe`, () => {
      const { map, escena: e } = partidaDe(semilla);
      const objetos = map.objects
        .filter((o) => ['town', 'village', 'mine', 'node'].includes(o.kind))
        .map((o) => [o.at.x, o.at.y] as const);
      const cortadas = carasCortadas(e.relieve.caras, e.sprites, objetos, e.W);
      expect(cortadas.length).toBe(QUEDAN[semilla] ?? 0);
      expect(e.informe.carasCortadas).toBe(cortadas.length);
    });
});
