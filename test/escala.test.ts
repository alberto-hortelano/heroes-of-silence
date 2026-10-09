/**
 * La escala del mapa (#226): el área por región y la marcha son un solo hecho.
 * Si alguien sube el área y no la marcha, o escribe la marcha a mano, esto lo dice.
 */
import { describe, expect, it } from 'vitest';
import {
  AREA_DE_REFERENCIA,
  AREA_POR_REGION,
  marchaALaEscala,
  raizEntera,
} from '../src/core/escala.js';
import { maxMovePoints } from '../src/core/hero/hero.js';
import { SPEED_TIERS, SPEED_TO_MOVE_POINTS } from '../src/core/types.js';

describe('la raíz entera', () => {
  it('es ⌊√n⌋ en todo un rango, y en los cuadrados y sus vecinos', () => {
    for (let n = 0; n <= 5000; n++) {
      const r = raizEntera(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
    expect(raizEntera(1_500_000)).toBe(1224);
  });

  it('lanza con lo que no es un entero ≥ 0', () => {
    for (const n of [-1, 1.5, Number.NaN]) expect(() => raizEntera(n)).toThrow(/entero ≥ 0/);
  });
});

describe('la marcha sale del área (#226)', () => {
  it('cada escalón de fheroes2, ×√(AREA_POR_REGION / AREA_DE_REFERENCIA), hacia abajo', () => {
    for (const v of SPEED_TIERS) {
      const p = SPEED_TO_MOVE_POINTS[v];
      const m = marchaALaEscala(p);
      // m² ≤ p² · A / B < (m + 1)², en enteros: sin coma flotante que redondee.
      expect(m * m * AREA_DE_REFERENCIA).toBeLessThanOrEqual(p * p * AREA_POR_REGION);
      expect((m + 1) * (m + 1) * AREA_DE_REFERENCIA).toBeGreaterThan(p * p * AREA_POR_REGION);
    }
    // Las cifras de hoy, para leerlas: 450 casillas por región sobre 300.
    expect(SPEED_TIERS.map((v) => marchaALaEscala(SPEED_TO_MOVE_POINTS[v]))).toEqual([
      1224, 1347, 1469, 1592, 1714, 1837,
    ]);
  });

  it('maxMovePoints la aplica: un héroe anda la tabla a escala, no la tabla', () => {
    const army = [{ creature: 'zombie' }];
    expect(maxMovePoints({ army, skills: {} }, undefined)).toBe(
      marchaALaEscala(SPEED_TO_MOVE_POINTS.very_slow),
    );
  });
});
