/**
 * La senda entra en la ciudad amurallada por el arco de una puerta (vuelta 2 de
 * `docs/agents/2026-10-20-ciudad-amurallada/`): `tendidosDeLasPuertas` da a cada
 * senda que cruza el octógono el tramo recto de su puerta, y
 * `sendasPorLosTendidos` (`celdas.ts`, la misma mecánica que las rampas de las
 * bajadas) la lleva por él sin mover sus extremos. «Ninguna abertura más ancha
 * que su puerta» es `sendasFueraDeLaPuerta`, y se le ve morder.
 */
import { describe, expect, it } from 'vitest';
import { sendasPorLosTendidos } from '../src/client/render/escenario/celdas.js';
import {
  type Cara,
  contornoDelRecinto,
  crucesConElContorno,
  type Par,
  puertasDelRecinto,
  SALIDA_DE_LA_PUERTA,
  sendasFueraDeLaPuerta,
  tendidosDeLasPuertas,
} from '../src/client/render/escenario/recinto.js';
import type { Senda } from '../src/client/render/escenario/sendas.js';
import { recintoDeLaCiudad } from '../src/core/map/recinto.js';
import { recta } from './helpers.js';

const RECT = recintoDeLaCiudad({ x: 10, y: 10 }, 30, 30);
const C = contornoDelRecinto(RECT);
const [CX, CY] = C.centro;
const cara = (k: Cara) => C.caras.find((c) => c.cara === k) as (typeof C.caras)[number];

/** La senda del centro hacia `(dx, dy)`, hasta `largo` casillas. */
const haciaFuera = (dx: number, dy: number, largo = 5): Senda => {
  const d = Math.hypot(dx, dy);
  return recta([CX, CY], [CX + (dx * largo) / d, CY + (dy * largo) / d]);
};

/** Lo que dista `p` de la senda `l` (de sus puntos: van cada décima o menos). */
const aLaSenda = (l: Senda, [x, y]: Par) =>
  Math.min(...l.map(([a, b]) => Math.hypot(a - x, b - y)));

/** El recinto con las puertas que piden las sendas, y las sendas por sus arcos. */
function porLasPuertas(sendas: readonly Senda[], rio?: Cara) {
  const puertas = puertasDelRecinto(C, sendas, rio);
  const r = { id: 'town-7', contorno: C, puertas, ...(rio === undefined ? {} : { rio }) };
  return { r, pintadas: sendasPorLosTendidos(sendas, tendidosDeLasPuertas(sendas, [r])) };
}

describe('la senda pasa por el arco de su puerta', () => {
  // Hacia (1, −1,8) cruza el noreste a 0,42 del medio de su cara: lejos del arco.
  const senda = haciaFuera(1, -1.8);
  const { r, pintadas } = porLasPuertas([senda]);
  const [l] = pintadas;
  if (l === undefined) throw new Error('sin senda');
  const ne = cara('ne');

  it('la puerta es la del noreste', () => {
    expect(r.puertas).toEqual(['ne']);
  });

  it('por el medio del arco, y recta por su normal hasta la salida', () => {
    for (let s = 0; s <= SALIDA_DE_LA_PUERTA.ne + 1e-9; s += 0.1)
      expect(
        aLaSenda(l, [ne.medio[0] + ne.normal[0] * s, ne.medio[1] + ne.normal[1] * s]),
        `a ${s.toFixed(1)} del arco`,
      ).toBeLessThanOrEqual(0.06);
    const [cruce] = crucesConElContorno(C, l);
    expect(
      Math.hypot((cruce?.[0] ?? 0) - ne.medio[0], (cruce?.[1] ?? 0) - ne.medio[1]),
    ).toBeLessThanOrEqual(0.06);
  });

  it('sus extremos no se mueven', () => {
    expect(l[0]).toEqual(senda[0]);
    expect(l.at(-1)).toEqual(senda.at(-1));
  });

  it('el guardia: la pintada, sin cruces fuera del arco; sin el tendido, con uno (muerde)', () => {
    expect(sendasFueraDeLaPuerta(pintadas, [r])).toEqual([]);
    expect(sendasFueraDeLaPuerta([senda], [r])).toHaveLength(1);
  });
});

describe('dos sendas por una cara: una puerta, y se abren en Y fuera de ella', () => {
  const sendas = [haciaFuera(0.25, 1), haciaFuera(-0.25, 1)];
  const { r, pintadas } = porLasPuertas(sendas);
  const s = cara('s');

  it('las dos por el arco del sur', () => {
    expect(r.puertas).toEqual(['s']);
    for (const l of pintadas) expect(aLaSenda(l, s.medio)).toBeLessThanOrEqual(0.06);
    expect(sendasFueraDeLaPuerta(pintadas, [r])).toEqual([]);
  });

  it('juntas en la salida y separadas más allá', () => {
    const salida: Par = [s.medio[0], s.medio[1] + SALIDA_DE_LA_PUERTA.s];
    for (const l of pintadas) expect(aLaSenda(l, salida)).toBeLessThanOrEqual(0.06);
    const [a, b] = pintadas.map((l) => l.at(-1) as Par);
    expect(
      Math.hypot((a?.[0] ?? 0) - (b?.[0] ?? 0), (a?.[1] ?? 0) - (b?.[1] ?? 0)),
    ).toBeGreaterThan(2);
  });
});

describe('la ciudad-puente', () => {
  it('la cara del río lleva puerta y ningún tendido: el puente llega a su arco', () => {
    const senda = haciaFuera(0, -1);
    const puertas = puertasDelRecinto(C, [senda], 's');
    expect(puertas).toEqual(['n', 's']);
    const tendidos = tendidosDeLasPuertas(
      [senda, haciaFuera(0.1, 1)],
      [{ contorno: C, puertas, rio: 's' }],
    );
    expect(tendidos.map((t) => t.senda)).toEqual([0]);
  });
});
