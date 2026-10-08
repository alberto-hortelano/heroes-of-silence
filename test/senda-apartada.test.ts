/**
 * La senda que se aparta de lo que la tapa (#206, `apartarDeLoQueTapa`): la
 * pared del relieve no se aparta de la senda (R4/R5), así que es la senda
 * pintada la que se corre, dentro de su casilla, del pie de lo alto.
 */
import { describe, expect, it } from 'vitest';
import {
  APARTE_DE_LO_QUE_TAPA,
  apartarDeLoQueTapa,
  type Senda,
} from '../src/client/render/escenario/sendas.js';
import { recta } from './helpers.js';

/** Una senda de oeste a este por el medio de la fila 5, de x = 2 a x = 12. */
const senda: Senda = recta([2, 5.5], [12, 5.5]);
/** Lo que cuelga de una pared al norte, de x = 6 a x = 8: tapa hasta y = 5,7. */
const pared = (x: number, y: number) => x >= 6 && x <= 8 && y <= 5.7;
const nada = () => false;
const todo = () => true;
const max = (l: Senda, f: (p: readonly [number, number]) => number) => Math.max(...l.map(f));

describe('la senda se aparta de lo que la tapa (#206)', () => {
  it('sale de debajo hacia el lado libre, sin pasar del tope y con los extremos quietos', () => {
    const [apartada] = apartarDeLoQueTapa([senda], pared, nada, todo) as [Senda];
    const bajo = apartada.filter(([x]) => x >= 6 && x <= 8);
    // Toda la que estaba debajo asoma, hacia el sur: su huella llega a 0,16
    // del trazo, y a 0,06 ya no hay pared.
    expect(bajo.every(([x, y]) => !pared(x, y + 0.06) && y > 5.5)).toBe(true);
    expect(max(apartada, ([, y]) => y - 5.5)).toBeLessThanOrEqual(APARTE_DE_LO_QUE_TAPA + 1e-9);
    expect(apartada[0]).toEqual(senda[0]);
    expect(apartada.at(-1)).toEqual(senda.at(-1));
    // Entra y sale suave: entre dos puntos seguidos, nunca un escalón.
    for (let i = 1; i < apartada.length; i++)
      expect(
        Math.abs((apartada[i]?.[1] as number) - (apartada[i - 1]?.[1] as number)),
      ).toBeLessThan(0.05);
  });

  it('no mueve lo fijo: junto a una bajada, la senda la cruza por su rampa', () => {
    const [apartada] = apartarDeLoQueTapa([senda], pared, (x) => x >= 5 && x <= 9, todo) as [Senda];
    expect(apartada.filter(([x]) => x >= 5 && x <= 9)).toEqual(
      senda.filter(([x]) => x >= 5 && x <= 9),
    );
  });

  it('no pasa a una casilla que no admite, y lo que no sale de debajo se queda donde estaba', () => {
    // Toda la casilla tapada: ningún corrimiento de 0,35 la saca.
    const honda = (x: number, y: number) => x >= 6 && x <= 8 && y <= 6;
    expect(apartarDeLoQueTapa([senda], honda, nada, todo)).toEqual([senda]);
    // Pegada al sur de su casilla, saldría a la fila de abajo, que no se admite.
    const alSur = recta([2, 5.9], [12, 5.9]);
    const corta = (x: number, y: number) => x >= 6 && x <= 8 && y <= 6.2;
    const [apartada] = apartarDeLoQueTapa(
      [alSur],
      corta,
      nada,
      (_x, y, [, y0]) => Math.floor(y) === Math.floor(y0),
    ) as [Senda];
    expect(apartada).toEqual(alSur);
  });

  it('una senda sin nada encima sale tal cual', () => {
    expect(apartarDeLoQueTapa([senda], nada, nada, todo)[0]).toBe(senda);
  });
});
