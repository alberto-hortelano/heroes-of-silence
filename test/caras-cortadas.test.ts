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
 * ahora, 4, 18 y 1, 0, 1 y 0. La muesca de una casilla de la puerta de una
 * ciudad en la línea del acantilado (s57) la quita el generador
 * (`puertasSinMuesca`, #222; `test/puertas-sin-muesca.test.ts`).
 *
 * El resto de #222, en la escena (09-10-2026): la frontal y la ladera también
 * pasan por detrás del objeto de su pie, y la diagonal por detrás del que pinta
 * encima el camino que taparía, con la clave del pintor (`Sprite.clave`) y no
 * moviendo su pie; la que taparía el tablero de un puente va por detrás de él;
 * y la que un puente solo toca en la punta de su filo lleva pieza
 * (`celdasBajoLosPuentes(…, true)`). Se vio morder quitando cada una: sin la
 * pared por detrás del objeto, s37 y s66 en rojo; sin la del puente, s30 y
 * s92; sin las caras junto al puente, s30. Y con el código de antes, las
 * cuatro de la muestra.
 */
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import {
  CABO_SUELTO,
  CORTE_JUNTO_A_UN_OBJETO,
  carasCortadas,
} from '../src/client/render/escenario/caras.js';
import type { Modulo } from '../src/client/render/escenario/catalogo.js';
import { type Sprite, sitioDe } from '../src/client/render/escenario/colocar.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { claveDe } from '../src/client/render/escenario/pintar.js';
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
 * Los mapas reales: en el bucle rápido, cuatro que lo daban antes de #222; en
 * la orden lenta, 1-40, las de la auditoría 7 (s57 y s443) y las que quedan
 * en 1-200. Lo que queda, por semilla (abajo).
 */
// Con #224 (el vestido se repite por una silla y abre esquinas) cambian: s6 es
// otro mapa y no lo da; s2, s22 y s24, otros mapas, sí; s3, por la esquina de
// (27,22) que se abre a la meseta para que el camino baje de frente a la
// ciudad de (27,23): la cara de (24-26, 23) acaba ahora a su lado. En 1-100,
// 8 → 13; en 101-250, 17 → 18 (09-10-2026).
//
// Desde #226 (el mapa de 42×42, 450 casillas por región) todos los mapas son
// otros, y la lista se re-mide (09-10-2026): en 1-40, 9 → 3; en 1-100, 13 → 14.
// Quedaban s17 (la cara de la fila 30 que acaba junto al pueblo de (32,30) y el
// nodo de acantilado de (29,30)), s30 (la de la fila 20 entre la ciudad de
// (18,21) y el puente de (21,21), como el de s12 de antes) y s37 (la de la fila
// 25 entre la mina de (1,26) y el nodo de acantilado de (5,26)).
//
// Con la rampa de muesca (§36) s17 ya no lo da: el nodo de (29,30) es su muesca
// y la pieza lleva la esquina de la cara de la fila 30 (09-10-2026).
//
// Con #222 (la pared pasa por detrás del objeto de su pie con la clave del
// pintor, la que taparía un tablero por detrás del puente, y la que un puente
// solo toca en la punta de su filo lleva pieza), en 1-40, 2 → 0, y en 1-200,
// 23 → 4 (09-10-2026). Las cuatro que quedan las tapa la senda, no un objeto:
// la diagonal que cerraría la cara cae sobre el camino que sale del pie de la
// esquina (s105 (21, 35) a la mina de (21, 36) y (26, 37) de la ciudad de (26,
// 36); s174 (27, 18), entre dos ciudades) o del de una bajada que no es una
// rampa de muesca (s143 (33, 25), basalto: la muesca solo tiene arte de roca y
// arenisca). La muestra del bucle rápido, las que lo daban antes: s37 (la mina
// de (1, 26)), s66 (el nodo de acantilado de (5, 23)), s30 (el puente de
// (21, 21), en la junta de dos paredes) y s92 (el de (13, 25), en diagonal).
//
// Con las fronteras onduladas (#229) todos los mapas son otros, y se re-mide con
// el código de #222 (09-10-2026): en 1-40, 1 (s32); en 1-200, 5 (s32, s64,
// s68, s141 y s190, una cada una). Sin #222, esos mismos mapas daban 5 en 1-40
// y 20 en 1-200: #222 arregla s3, s12, s22 y s28 (las de la muestra rápida),
// y en 41-200 s49, s65, s85, s89, s96, s116, s136, s148, s158, s173 y s197.
// Los cinco que quedan, sin mirar caso a caso.
//
// Con las dos puertas de la mina (#230) todos los mapas son otros otra vez
// (09-10-2026): en 1-40, 1 (s8); en 1-200, 3 (s8, s78 y s121, una cada una), y
// ninguna junto a una mina: s8 (fila 9) acaba junto a la ciudad de (14,10), s78
// (fila 33) junto al nodo de (4,33) y s121 (fila 39) entre el pueblo de (13,39)
// y el nodo de (16,41). s32, s64, s68, s141 y s190 se quedan en la lista lenta,
// ya sin ninguna.
//
// Con la muralla como cierre de un paso (#232, 10-10-2026), otros mapas donde
// estaba el muro y en los que se visten otra vez: en 1-200, 4 (s16 con dos,
// s61 y s121, que sigue igual); s8 y s78 ya no lo dan. Sin mirar caso a caso.
//
// Con los ríos (#144, 16-10-2026), otros mapas: de las 51 de la lista lenta,
// 1 (s7); s16, s61 y s121 ya no lo dan. Sin mirar caso a caso.
//
// Con el río de una casilla al pie de la meseta (#144, paso 2b, 16-10-2026),
// otros mapas: 1 (s1); la s7 ya no lo da. Sin mirar caso a caso.
//
// Con el río continuo (#144, 16-10-2026), otros mapas: de las 51 de la lista
// lenta, 1 (s22, la cara nevada de una casilla de la fila 40, (26,5-27,5), que
// acaba junto a la ciudad de (28,40)); la s1 ya no lo da. En 1-120, solo esa.
// En la muestra rápida, la 57 en vez de la 3, que se quedó sin meseta: la de
// más paredes que pasan por detrás de un objeto de 1-120 (17).
//
// Con la ciudad-puente en su orilla (#144, paso 2, 16-10-2026), 3, aceptadas por
// el usuario: s22 sigue; s14 y s26, cada una con su porqué en `QUEDAN`. Sin
// agua de frontera fuera del río (QA del río continuo, H3), 4: s28 es otro mapa
// y su ciudad-puente recorta una cara como la de s14. Con el río de lago de 20
// casillas (17-10-2026), 5: s36 es otro mapa (de lago).
const QUEDAN: Readonly<Record<number, number>> = {
  // La frontal de una casilla de (14,40), junto a la orilla donde se pinta la ciudad de (13,40), que su reserva recorta.
  14: 1,
  // La cara nevada de una casilla de la fila 40, (26,5-27,5), que acaba junto a la ciudad de (28,40).
  22: 1,
  // (25,5-26,5, 31), lejos de toda ciudad-puente: la reserva de la ciudad en su orilla mueve el azar de la escena.
  26: 1,
  // La frontal de una casilla de (18,39), junto a la orilla (17,38) donde se pinta la ciudad-puente de (16,38), que su reserva recorta.
  28: 1,
  // La frontal de una casilla de (38,24), entre la ciudad de (36,23) y el nodo de (40,24), sin sitio para más pared.
  36: 1,
};
const SEMILLAS = segunPrisa(
  [57, 12, 22, 28],
  [...rango(1, 40), 57, 61, 64, 68, 78, 89, 96, 121, 141, 190, 443],
);

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ningún bloque de frontal suelto junto a un objeto, contado por fuera y por el informe`, () => {
      const { map, escena: e } = partidaDe(semilla);
      // Donde se pinta cada objeto: la ciudad-puente (#144), en su orilla.
      const a = analizar(map);
      const objetos = map.objects
        .filter((o) => ['town', 'village', 'mine', 'node'].includes(o.kind))
        .map((o) => [sitioDe(a, o).x, sitioDe(a, o).y] as const);
      const cortadas = carasCortadas(e.relieve.caras, e.sprites, objetos, e.W);
      expect(cortadas.length).toBe(QUEDAN[semilla] ?? 0);
      expect(e.informe.carasCortadas).toBe(cortadas.length);
    });

  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: la pared que va detrás de otra cosa se queda en su sitio, justo antes de un objeto (Sprite.clave)`, () => {
      // La clave del pintor solo adelanta (#222): la pared que pasa por detrás
      // de una ciudad, un nodo o un puente se pinta antes que él, a una o dos
      // centésimas, y su pie sigue donde lo leen los guardias.
      const { escena: e } = partidaDe(semilla);
      const conClave = e.sprites.filter((s) => s.clase === 'pared' && s.clave !== undefined);
      const objetos = e.sprites.filter((s) => s.clase === 'objeto').map(claveDe);
      for (const s of conClave) {
        const k = s.clave as number;
        expect(k).toBeLessThan(s.y);
        expect(objetos.some((o) => o - k > 0 && o - k <= 0.02 + 1e-9)).toBe(true);
      }
    });
});
