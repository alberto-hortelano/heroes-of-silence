/**
 * La escala del mapa (#226): el área por región y la marcha son un solo hecho.
 * Si alguien sube el área y no la marcha, o escribe la marcha a mano, esto lo dice.
 */
import { describe, expect, it } from 'vitest';
import {
  AREA_DE_REFERENCIA,
  AREA_POR_REGION,
  acumuladoALaEscala,
  deHoyALaEscala,
  marchaALaEscala,
  radioALaEscala,
  raizEntera,
} from '../src/core/escala.js';
import { maxMovePoints } from '../src/core/hero/hero.js';
import { HERO_SCOUT_RADIUS, TOWN_SCOUT_RADIUS } from '../src/core/state/game.js';
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
    // Las cifras de hoy, para leerlas: 450 casillas por región sobre 300. La de
    // `crawling` (una casilla: el peso baja la agilidad hasta 1; regla nuestra) es
    // la de `very_slow`.
    expect(SPEED_TIERS.map((v) => marchaALaEscala(SPEED_TO_MOVE_POINTS[v]))).toEqual([
      1224, 1224, 1347, 1469, 1592, 1714, 1837,
    ]);
  });

  it('maxMovePoints la aplica: un héroe anda la tabla a escala, no la tabla', () => {
    // El troll, de agilidad 2: dos casillas.
    const army = [{ creature: 'troll-maza' }];
    expect(maxMovePoints({ army, skills: {} }, undefined)).toBe(
      marchaALaEscala(SPEED_TO_MOVE_POINTS.very_slow),
    );
  });
});

describe('la vista sale del área (#229)', () => {
  it('cada radio, ×√(AREA_POR_REGION / AREA_DE_REFERENCIA), al entero más cercano', () => {
    for (let r = 0; r <= 40; r++) {
      const v = radioALaEscala(r);
      // |v − r·√(A/B)| ≤ ½, en enteros: (2v − 1)² · B ≤ 4r² · A < (2v + 1)² · B.
      const x4 = 4 * r * r * AREA_POR_REGION;
      expect(Math.max(0, 2 * v - 1) ** 2 * AREA_DE_REFERENCIA).toBeLessThanOrEqual(x4);
      expect((2 * v + 1) ** 2 * AREA_DE_REFERENCIA).toBeGreaterThan(x4);
    }
  });

  it('los radios del héroe y del castillo son los de fheroes2 a escala, no la cita', () => {
    // fheroes2: héroe 4, castillo 5 (`getFogDiscoveryDistance`); con 450 sobre 300, 5 y 6.
    expect([HERO_SCOUT_RADIUS, TOWN_SCOUT_RADIUS]).toEqual([radioALaEscala(4), radioALaEscala(5)]);
    expect([HERO_SCOUT_RADIUS, TOWN_SCOUT_RADIUS]).toEqual([5, 6]);
  });

  it('lanza con lo que no es un entero ≥ 0', () => {
    for (const n of [-1, 2.5, Number.NaN])
      expect(() => radioALaEscala(n)).toThrow(/radio de vista/);
  });
});

describe('lo que se anda por casillas sale del área (#229)', () => {
  it('lo acumulado es ⌊días · porDía · √(A / B)⌋, en enteros', () => {
    for (const porDia of [1, 2, 3])
      for (let dias = 0; dias <= 400; dias++) {
        const a = acumuladoALaEscala(porDia, dias);
        const x = dias * dias * porDia * porDia * AREA_POR_REGION;
        expect(a * a * AREA_DE_REFERENCIA).toBeLessThanOrEqual(x);
        expect((a + 1) * (a + 1) * AREA_DE_REFERENCIA).toBeGreaterThan(x);
      }
  });

  it('cada día, lo de hoy menos lo de ayer: días de 2 y de 3 que suman lo acumulado', () => {
    let suma = 0;
    const vistos = new Set<number>();
    for (let dia = 1; dia <= 300; dia++) {
      const hoy = deHoyALaEscala(2, dia);
      vistos.add(hoy);
      suma += hoy;
      expect(suma).toBe(acumuladoALaEscala(2, dia));
    }
    // Con 450 sobre 300: 2 × 1,2247 = 2,449 de media, nunca 2 fijos.
    expect([...vistos].sort()).toEqual([2, 3]);
    expect(suma).toBe(734);
  });

  it('lanza con un día que no es de la partida', () => {
    for (const d of [0, -1, 1.5]) expect(() => deHoyALaEscala(2, d)).toThrow(/día de la partida/);
  });
});
