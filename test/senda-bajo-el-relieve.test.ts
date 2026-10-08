/**
 * La senda que desaparece bajo una pieza del relieve (#189): el contador del
 * informe (`sendaBajoElRelieve`) y su techo medido.
 *
 * No es 0. La pared nunca se corta ni se aparta de la senda (R4/R5), y el
 * trazado del núcleo solo puede cobrar de más el pie de lo alto que sabe que lo
 * será (`recargosDelTrazado`, vestir.ts): un pasillo de una casilla al pie de un
 * desnivel sigue llevando su camino. Lo que se puede, lo hace la senda pintada,
 * que se aparta dentro de su casilla de lo que la tapa (`apartarDeLoQueTapa`,
 * #206). Medido en 1-40 con la huella de #191 (08-10-2026): 12,5 tramos por
 * mapa antes de #189, 9,1 con el coste del pie, 6,3 con los niveles del mapa
 * (#143) y 4,5 con la senda apartada.
 *
 * Se vio morder a mano: sin apartar la senda (`apartadas = suavizadas` en
 * `componer`), la media de 1-40 sube de 4,5 a 6,3 y la de la muestra del bucle
 * rápido, de 4,0 a 7,75. Antes, sin el coste del pie (los dos a 0 en
 * vestir.ts), la de 1-40 subía de 9,1 a 12,3.
 */
import { describe, expect, it } from 'vitest';
import type { Modulo } from '../src/client/render/escenario/catalogo.js';
import {
  COLOR_DE_BAJADA,
  SENDA_CORTADA,
  type Sprite,
  sendaBajoElRelieve,
} from '../src/client/render/escenario/colocar.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { ANCHO_DE_SENDA } from '../src/client/render/escenario/sendas.js';
import { catalogoDelDisco, escenaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const catalogo = catalogoDelDisco();

/**
 * Lo más que se admite de media por mapa: entre lo de ahora (4,5 en 1-40, 4,0
 * en la muestra) y lo de antes de apartar la senda (6,3 y 7,75, #206).
 */
const TECHO_POR_MAPA = 5;

const roca = catalogo.hojas['paredes-roca']?.[0] as Modulo;

/** Una frontal de roca con el pie en `(x, y)`, de 1,8 casillas de alto. */
const pared = (x: number, y: number): Sprite => ({
  src: roca.src,
  nw: roca.nw,
  nh: roca.nh,
  ax: roca.ax,
  ay: roca.ay,
  x,
  y,
  alto: 1.8,
  clase: 'pared',
  color: '#4c463e',
  capa: 0,
  sombra: true,
});

describe('la senda bajo el relieve (#189)', () => {
  const muro = pared(5, 5);
  const [x0, y0, x1, y1] = cajaDeSprite(muro);
  const xm = (x0 + x1) / 2;
  // Al pie de la pared, con la huella entera bajo su silueta en todo su ancho.
  const bajo = y1 - 0.3;

  it('una senda que pasa bajo la silueta de una pared más de media casilla se cuenta', () => {
    expect(x1 - x0).toBeGreaterThan(SENDA_CORTADA);
    const tapada = sendaBajoElRelieve(
      [muro],
      [
        [
          [x0 - 1, bajo],
          [x1 + 1, bajo],
        ],
      ],
      catalogo,
    );
    expect(tapada).toHaveLength(1);
    expect(tapada[0]).toMatch(/^senda bajo el relieve desde .*: \d+\.\d\d casillas$/);
  });

  it('por encima de la silueta, o cruzándola por menos de media casilla, no', () => {
    expect(
      sendaBajoElRelieve(
        [muro],
        [
          [
            [x0 - 1, y0 - 0.2],
            [x1 + 1, y0 - 0.2],
          ],
        ],
        catalogo,
      ),
    ).toEqual([]);
    expect(
      sendaBajoElRelieve(
        [muro],
        [
          [
            [xm, y1 - 0.3],
            [xm, y1 + 1],
          ],
        ],
        catalogo,
      ),
    ).toEqual([]);
  });

  it('si un borde de la huella asoma, la senda no ha desaparecido: no cuenta', () => {
    // El centro al pie de la pared y el borde de abajo, fuera de su caja.
    const asoma = y1 - ANCHO_DE_SENDA / 4;
    expect(
      sendaBajoElRelieve(
        [muro],
        [
          [
            [x0 - 1, asoma],
            [x1 + 1, asoma],
          ],
        ],
        catalogo,
      ),
    ).toEqual([]);
  });

  it('lo que tapa una bajada no cuenta: es la rampa que lleva la senda por la pared', () => {
    const senda = [
      [
        [xm - 0.4, bajo],
        [xm + 0.4, bajo],
      ],
    ] as const;
    expect(sendaBajoElRelieve([muro], senda, catalogo)).toHaveLength(1);
    const bajada: Sprite = { ...muro, src: null, color: COLOR_DE_BAJADA, y: y1 + 0.01, alto: 3 };
    expect(sendaBajoElRelieve([muro, bajada], senda, catalogo)).toEqual([]);
  });

  it('ni lo que no es relieve: una masa o un objeto se apartan de la senda por su cuenta', () => {
    const arbol: Sprite = { ...muro, clase: 'masa' };
    expect(
      sendaBajoElRelieve(
        [arbol],
        [
          [
            [x0 - 1, bajo],
            [x1 + 1, bajo],
          ],
        ],
        catalogo,
      ),
    ).toEqual([]);
  });

  it(`en los mapas del procedimental, de media no pasa de ${TECHO_POR_MAPA} tramos por mapa`, () => {
    // La muestra: la 1, la de las capturas, y las que más tienen de 1-40 con
    // el acantilado en línea (#215: 6, 20 y 22, con 5, 6 y 4; con menos
    // mesetas, #210, eran 5, 8 y 26; antes, 3, 12 y 28, #206).
    const semillas = segunPrisa([1, 6, 20, 22], rango(1, 40));
    const cuentas = semillas.map((s) => escenaDe(s).informe.sendaBajoElRelieve);
    // Que mire algo: en ninguna semilla de la muestra rápida es 0. En 1-40,
    // con menos mesetas (#210), la mitad se queda en 0: 20 de 40 y 1,2 de
    // media (4,5 antes; 08-10-2026).
    expect(cuentas.filter((n) => n > 0).length).toBeGreaterThanOrEqual(segunPrisa(4, 15));
    expect(cuentas.reduce((a, b) => a + b, 0) / semillas.length).toBeLessThanOrEqual(
      TECHO_POR_MAPA,
    );
  });
});
