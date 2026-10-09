/**
 * Las regiones definen el mapa (#195): el número de regiones por bando es el
 * dato, el lado sale de él y cada región trae sus minas.
 *
 * Aparte de `regiones.test.ts` y `lado-del-generador.test.ts` por tiempo: los
 * dos rozan el minuto en la orden lenta (#194).
 */
import { describe, expect, it } from 'vitest';
import {
  buildMap,
  generateMapPlan,
  LADO_DEL_MAPA,
  LADO_MAXIMO_DEL_GENERADOR,
  LADO_MINIMO_DEL_GENERADOR,
  ladoDelMapa,
  minasDeLasRegiones,
  REGIONES_MAXIMAS_POR_BANDO,
  REGIONES_MINIMAS_POR_BANDO,
  REGIONES_POR_BANDO,
  regionesDelMapa,
} from '../src/core/map/generate.js';
import { estructura } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import { RESOURCE_KINDS, type ResourceKind } from '../src/core/types.js';
import { rango, segunPrisa } from './lento.js';

const RAROS: readonly ResourceKind[] = ['crystal', 'gems', 'mercury', 'sulfur'];
const ordenadas = (xs: readonly ResourceKind[]): ResourceKind[] => [...xs].sort();

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
    // El lado mínimo (24, medido) da el mínimo de regiones; pedido por regiones,
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

describe('las minas van por región (#195)', () => {
  it('el reparto: la casa con las básicas, cada región de fuera con una rara y una básica', () => {
    for (const r of rango(REGIONES_MINIMAS_POR_BANDO, REGIONES_MAXIMAS_POR_BANDO)) {
      const reparto = minasDeLasRegiones(r);
      expect(reparto).toHaveLength(r);
      expect(reparto[0]).toEqual(['gold', 'wood', 'ore']);
      for (const deFuera of reparto.slice(1)) {
        expect(deFuera).toHaveLength(2);
        expect(RAROS).toContain(deFuera[0]);
        expect(['gold', 'wood', 'ore']).toContain(deFuera[1]);
      }
      // El total escala con las regiones: dos por región, y la de casa una más.
      expect(reparto.flat()).toHaveLength(2 * r + 1);
    }
    // En el mapa por defecto, las siete: tres de oro, dos de madera y de mineral
    // y una de cada rara (antes, 14 fijas, dos de cada).
    const porRecurso = new Map<ResourceKind, number>();
    for (const m of minasDeLasRegiones(REGIONES_POR_BANDO).flat())
      porRecurso.set(m, (porRecurso.get(m) ?? 0) + 1);
    expect(Object.fromEntries(porRecurso)).toEqual({
      gold: 3,
      wood: 2,
      ore: 2,
      crystal: 1,
      gems: 1,
      mercury: 1,
      sulfur: 1,
    });
    expect([...porRecurso.keys()].sort()).toEqual([...RESOURCE_KINDS].sort());
  });

  it('el generador hace las regiones pedidas, del lado derivado, y cada región lleva sus minas en espejo', () => {
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
      const { map } = buildMap(plan);
      const { regionDe } = estructura(map);
      const enRegion = plan.regions.map((): ResourceKind[] => []);
      for (const m of plan.mines)
        enRegion[regionDe[m.at.y * map.width + m.at.x] as number]?.push(m.resource);
      // La región 2k es del jugador 0 y la 2k+1, su espejo: las dos llevan el
      // reparto `k` (la casa es la 0 y la 1).
      const reparto = minasDeLasRegiones(r);
      for (const [k, minas] of enRegion.entries()) {
        const esperado = reparto[k >> 1] ?? [];
        if (ordenadas(minas).join() !== ordenadas(esperado).join())
          malos.push(`${donde}: la región ${k} lleva [${minas}], no [${esperado}]`);
      }
      if (plan.mines.length !== 2 * (2 * r + 1))
        malos.push(`${donde}: ${plan.mines.length} minas, no ${2 * (2 * r + 1)}`);
    }
    expect(malos).toEqual([]);
  });
});
