/**
 * Las regiones definen el mapa (#195): el número de regiones por bando es el
 * dato y el lado sale de él.
 *
 * Aparte de `regiones.test.ts` y `lado-del-generador.test.ts` por tiempo: los
 * dos rozan el minuto en la orden lenta (#194).
 */
import { describe, expect, it } from 'vitest';
import {
  generateMapPlan,
  LADO_DEL_MAPA,
  LADO_MAXIMO_DEL_GENERADOR,
  LADO_MINIMO_DEL_GENERADOR,
  ladoDelMapa,
  REGIONES_MAXIMAS_POR_BANDO,
  REGIONES_MINIMAS_POR_BANDO,
  REGIONES_POR_BANDO,
  regionesDelMapa,
} from '../src/core/map/generate.js';
import { createRng } from '../src/core/rng.js';
import { rango, segunPrisa } from './lento.js';

describe('el lado sale de las regiones (#195)', () => {
  it('ladoDelMapa es la inversa exacta de regionesDelMapa en todo el rango', () => {
    const malos: string[] = [];
    for (const r of rango(REGIONES_MINIMAS_POR_BANDO, REGIONES_MAXIMAS_POR_BANDO)) {
      const lado = ladoDelMapa(r);
      if (regionesDelMapa(lado, lado) !== r)
        malos.push(`${r} regiones → ${lado}×${lado} → ${regionesDelMapa(lado, lado)} regiones`);
    }
    expect(malos).toEqual([]);
    expect(LADO_DEL_MAPA).toBe(ladoDelMapa(REGIONES_POR_BANDO));
  });

  it('el rango de regiones es el del lado que sabe hacer el generador (#102)', () => {
    // El lado mínimo (26 desde el recinto de las ciudades, medido) da el mínimo de regiones; pedido por regiones,
    // el mínimo sale más grande (30 desde #226, con 450 casillas por región).
    expect(regionesDelMapa(LADO_MINIMO_DEL_GENERADOR, LADO_MINIMO_DEL_GENERADOR)).toBe(
      REGIONES_MINIMAS_POR_BANDO,
    );
    expect(ladoDelMapa(REGIONES_MINIMAS_POR_BANDO)).toBeGreaterThanOrEqual(
      LADO_MINIMO_DEL_GENERADOR,
    );
    expect(ladoDelMapa(REGIONES_MAXIMAS_POR_BANDO)).toBeLessThanOrEqual(LADO_MAXIMO_DEL_GENERADOR);
    // Una región más ya no cabe en el lado máximo: el rango no se queda corto.
    expect(regionesDelMapa(LADO_MAXIMO_DEL_GENERADOR, LADO_MAXIMO_DEL_GENERADOR)).toBe(
      REGIONES_MAXIMAS_POR_BANDO,
    );
  });

  it('fuera de su rango, o pedido por regiones y por lado a la vez, lo dice antes de intentarlo', () => {
    for (const r of [REGIONES_MINIMAS_POR_BANDO - 1, REGIONES_MAXIMAS_POR_BANDO + 1, 4.5]) {
      expect(() => ladoDelMapa(r)).toThrow(
        `el generador procedimental no hace mapas de ${r} regiones por bando: van de ${REGIONES_MINIMAS_POR_BANDO} a ${REGIONES_MAXIMAS_POR_BANDO}`,
      );
      expect(() => generateMapPlan(createRng(1), { regionesPorBando: r })).toThrow(
        /no hace mapas de .* regiones por bando/,
      );
    }
    expect(() => generateMapPlan(createRng(1), { regionesPorBando: 4, width: 30 })).toThrow(
      'al generador se le pide el mapa por regiones (4 por bando) o por lado (30×?), no por las dos cosas: el lado sale de las regiones',
    );
  });
});

describe('el generador hace las regiones pedidas (#195)', () => {
  it('del lado derivado', () => {
    // En el bucle rápido, el mínimo y el del juego; en la lenta, más tamaños y
    // semillas, con el máximo (64×64, segundos por plan) en una.
    const casos: (readonly [number, number])[] = segunPrisa(
      [
        [3, 1],
        [REGIONES_POR_BANDO, 1],
      ],
      [
        ...[3, 4, 5, 6, 7, 9].flatMap((r) => rango(1, 3).map((s) => [r, s] as const)),
        [REGIONES_MAXIMAS_POR_BANDO, 1],
      ],
    );
    const malos: string[] = [];
    for (const [r, s] of casos) {
      const donde = `${r} regiones s${s}`;
      const plan = generateMapPlan(createRng(s), { regionesPorBando: r });
      const lado = ladoDelMapa(r);
      if (plan.width !== lado || plan.height !== lado)
        malos.push(`${donde}: ${plan.width}×${plan.height}, no ${lado}×${lado}`);
      if (plan.regions.length !== 2 * r)
        malos.push(`${donde}: ${plan.regions.length} regiones, no ${2 * r}`);
    }
    expect(malos).toEqual([]);
  });
});
