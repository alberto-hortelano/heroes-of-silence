/**
 * La huella de los caminos (#191): la senda ancha, de borde roto y casi recta
 * donde la rejilla va recta.
 */
import { describe, expect, it } from 'vitest';
import { azarDe } from '../src/client/render/escenario/esparcir.js';
import { discosDe } from '../src/client/render/escenario/huella.js';
import {
  ANCHO_DE_SENDA,
  encadenar,
  IRREGULARIDAD_DE_SENDA,
  suavizar,
  VAIVEN,
  VAIVEN_EN_LO_RECTO,
} from '../src/client/render/escenario/sendas.js';

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
