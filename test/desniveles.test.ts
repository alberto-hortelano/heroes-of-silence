/**
 * El desnivel es de la región y la barrera lo explica (#143).
 *
 * El generador sortea el nivel de cada pareja de regiones antes que sus
 * barreras, y la barrera de cada frontera sale de las que admiten sus niveles
 * (`barrerasDeLaPareja`): el acantilado solo entre dos niveles distintos y dos
 * niveles distintos solo por acantilado, montaña o agua. Aquí se mira en el
 * mapa ya hecho, sin escena: por franja 8-conexa de cada barrera, los niveles
 * de las regiones que se pisan a su lado. Antes el nivel lo inventaba el
 * escenógrafo después y sin verlo: 98 de 258 franjas de acantilado de 1-40
 * separaban dos regiones al mismo nivel, y el 79 % de los cambios de nivel no
 * cruzaba un acantilado.
 */
import { describe, expect, it } from 'vitest';
import barrerasJson from '../data/barreras.json' with { type: 'json' };
import relieveJson from '../data/relieve.json' with { type: 'json' };
import { NIVEL_POR_SUELO, validarBarreras, validarRelieve } from '../src/core/data.js';
import { generateMapPlan } from '../src/core/map/generate.js';
import type { GameMap } from '../src/core/map/map.js';
import { estructura } from '../src/core/map/regiones.js';
import {
  BARRERAS_DE_DESNIVEL,
  esBarrera,
  SUELOS_PISABLES,
  type TerrainKind,
} from '../src/core/map/terrain.js';
import { barrerasDeLaPareja } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { itLento, rango, segunPrisa } from './lento.js';

/**
 * Lo que no cuadra entre barreras y niveles en un mapa: cada franja 8-conexa de
 * una barrera, con los niveles de las regiones de sus vecinas que se pisan.
 */
function desnivelesSinExplicar(map: GameMap): string[] {
  const W = map.width;
  const H = map.height;
  const { regionDe } = estructura(map);
  const vista = new Uint8Array(W * H);
  const fuera: string[] = [];
  for (let i = 0; i < W * H; i++) {
    const t = map.terrain[i] as TerrainKind;
    if (vista[i] === 1 || !esBarrera(t)) continue;
    const pila = [i];
    vista[i] = 1;
    const niveles = new Set<number>();
    while (pila.length > 0) {
      const j = pila.pop() as number;
      const x = j % W;
      const y = (j - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const k = ny * W + nx;
          const r = regionDe[k] as number;
          if (r >= 0) niveles.add(map.regions[r]?.nivel as number);
          if (vista[k] === 0 && map.terrain[k] === t) {
            vista[k] = 1;
            pila.push(k);
          }
        }
    }
    const donde = `${t} de (${i % W},${Math.floor(i / W)})`;
    if (t === 'cliff' && niveles.size < 2)
      fuera.push(`${donde} no separa dos niveles (${[...niveles]})`);
    if (!BARRERAS_DE_DESNIVEL.includes(t) && niveles.size > 1)
      fuera.push(`${donde} separa los niveles ${[...niveles].sort()}`);
  }
  return fuera;
}

describe('el desnivel lo explica una barrera (#143)', () => {
  // s1, la de las marcas; 3 y 4, donde una barrera de un cruce de tres
  // regiones tocaba la tercera a otro nivel (`desnivelEnLosCruces`: sin él,
  // fallan 49 de 1-200).
  it.each(segunPrisa([1, 3, 4], rango(1, 200)))(
    'semilla %i: el acantilado separa dos niveles y dos niveles los separa acantilado, montaña o agua',
    (semilla) => {
      expect(desnivelesSinExplicar(newGame({ seed: semilla }).map)).toEqual([]);
    },
  );

  it('el mapa guarda el nivel de cada región; las de casa, al llano', () => {
    const map = newGame({ seed: 1 }).map;
    for (const r of map.regions) expect([0, 1, 2]).toContain(r.nivel);
    expect(map.regions[0]?.nivel).toBe(1);
    expect(map.regions[1]?.nivel).toBe(1);
  });

  itLento('en 1-200 sale más de un nivel y hay acantilados, montañas y agua', () => {
    const cuenta = new Map<string, number>();
    for (const s of rango(1, 200)) {
      const plan = generateMapPlan(createRng(s));
      for (const r of plan.regions)
        cuenta.set(`nivel ${r.nivel}`, (cuenta.get(`nivel ${r.nivel}`) ?? 0) + 1);
      for (const w of plan.walls) cuenta.set(w.terrain, (cuenta.get(w.terrain) ?? 0) + 1);
    }
    for (const k of [
      'nivel 0',
      'nivel 1',
      'nivel 2',
      'cliff',
      'mountain',
      'water',
      'forest',
      'wall',
    ])
      expect(cuenta.get(k) ?? 0, k).toBeGreaterThan(0);
  });
});

describe('las tablas de barreras y relieve casan (#143)', () => {
  it('toda pareja de suelos, a los niveles que pueden tener, admite alguna barrera', () => {
    for (const a of SUELOS_PISABLES)
      for (const b of SUELOS_PISABLES)
        for (const na of NIVEL_POR_SUELO[a])
          for (const nb of NIVEL_POR_SUELO[b]) {
            const quedan = barrerasDeLaPareja(a, b, na.nivel, nb.nivel).map((c) => c.barrera);
            expect(quedan.length, `${a}@${na.nivel} / ${b}@${nb.nivel}`).toBeGreaterThan(0);
            if (na.nivel === nb.nivel) expect(quedan).not.toContain('cliff');
            else for (const q of quedan) expect(BARRERAS_DE_DESNIVEL).toContain(q);
          }
  });

  it('data/relieve.json se valida al cargar, y cada rotura se dice con su sitio', () => {
    expect(() => validarRelieve(relieveJson)).not.toThrow();
    const roto = structuredClone(relieveJson) as { nivelPorSuelo: Record<string, unknown> };
    delete roto.nivelPorSuelo.snow;
    roto.nivelPorSuelo.grass = { '3': 1 };
    roto.nivelPorSuelo.sand = { '1': 0 };
    roto.nivelPorSuelo.agua = { '1': 1 };
    expect(() => validarRelieve(roto)).toThrow(/no tiene fila para el suelo "snow"/);
    expect(() => validarRelieve(roto)).toThrow(/"nivelPorSuelo.grass" pide el nivel "3"/);
    expect(() => validarRelieve(roto)).toThrow(/"nivelPorSuelo.sand.1" pesa 0/);
    expect(() => validarRelieve(roto)).toThrow(/fila para "agua", que no es un suelo/);
    expect(() => validarRelieve({})).toThrow(/no trae "nivelPorSuelo"/);
  });

  it('un acantilado como obstáculo se rechaza: dentro de una región sería una mesa', () => {
    const roto = structuredClone(barrerasJson) as { obstaculos: Record<string, object> };
    roto.obstaculos.sand = { cliff: 1, mountain: 1 };
    expect(() => validarBarreras(roto)).toThrow(/"obstaculos.sand" pide "cliff"/);
  });
});
