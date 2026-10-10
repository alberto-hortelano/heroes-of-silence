/**
 * El desnivel es de la región y la barrera lo explica (#143).
 *
 * El generador sortea el nivel de cada pareja de regiones antes que sus
 * barreras, y la barrera de cada frontera sale de las que admiten sus niveles
 * (`barrerasDeLaPareja`): el acantilado solo entre dos niveles distintos y dos
 * niveles distintos solo por acantilado, montaña o agua. Aquí se mira en el
 * mapa ya hecho, sin escena: por franja 8-conexa de cada barrera, los niveles
 * de las regiones que se pisan a su lado, con la misma regla que valida los
 * planes del agente (`problemasDeNiveles`, #209; aquí había una copia). Antes el nivel lo inventaba el
 * escenógrafo después y sin verlo: 98 de 258 franjas de acantilado de 1-40
 * separaban dos regiones al mismo nivel, y el 79 % de los cambios de nivel no
 * cruzaba un acantilado.
 */
import { describe, expect, it } from 'vitest';
import barrerasJson from '../data/barreras.json' with { type: 'json' };
import relieveJson from '../data/relieve.json' with { type: 'json' };
import { NIVEL_POR_SUELO, validarBarreras, validarRelieve } from '../src/core/data.js';
import { generateMapPlan } from '../src/core/map/generate.js';
import { problemasDeNiveles } from '../src/core/map/regiones.js';
import { BARRERAS_DE_DESNIVEL, SUELOS_PISABLES } from '../src/core/map/terrain.js';
import { barrerasDeLaPareja, mesasDelRelieve } from '../src/core/map/vestir.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { itLento, rango, segunPrisa } from './lento.js';

describe('el desnivel lo explica una barrera (#143)', () => {
  // s1, la de las marcas; 3 y 4, donde una barrera de un cruce de tres
  // regiones tocaba la tercera a otro nivel (`desnivelEnLosCruces`: sin él,
  // fallan 49 de 1-200).
  it.each(segunPrisa([1, 3, 4], rango(1, 200)))(
    'semilla %i: el acantilado separa dos niveles y dos niveles los separa acantilado, montaña o agua',
    (semilla) => {
      expect(problemasDeNiveles(newGame({ seed: semilla }).map)).toEqual([]);
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
  itLento(
    'el reparto de suelos no cambia: cada suelo de fuera, entre el 11 y el 16 % de las regiones de 1-200',
    () => {
      // Un sorteo de barreras filtrado por niveles podía tirar más vestidos de
      // unas parejas de suelos que de otras y sesgar el mapa (los de arena roja de
      // s1 y s9 se miraron así: es azar). Medido el 08-10-2026, de la 1 a la 200:
      // antes (aebb1c7) 11,5-14,5 %, después 11,3-14,4 %; la tierra, 20 % (casa).
      const cuenta = new Map<string, number>();
      for (const s of rango(1, 200))
        for (const r of generateMapPlan(createRng(s)).regions)
          cuenta.set(r.terrain ?? '', (cuenta.get(r.terrain ?? '') ?? 0) + 1);
      const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
      for (const suelo of SUELOS_PISABLES) {
        const parte = (100 * (cuenta.get(suelo) ?? 0)) / total;
        if (suelo === 'dirt') expect(parte, suelo).toBe(20);
        else {
          expect(parte, suelo).toBeGreaterThanOrEqual(11);
          expect(parte, suelo).toBeLessThanOrEqual(16);
        }
      }
    },
  );
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

  it('un muro como obstáculo se rechaza: la muralla es el cierre de un paso (#232)', () => {
    const roto = structuredClone(barrerasJson) as { obstaculos: Record<string, object> };
    roto.obstaculos.dirt = { forest: 2, wall: 2 };
    expect(() => validarBarreras(roto)).toThrow(/"obstaculos.dirt" pide "wall"/);
  });
});

describe('ni una mesa en el relieve (`mesasDelRelieve`, #216, s33 con #232)', () => {
  /** Filas de nivel y barrera: `M` barrera, `.` se pisa; el dígito de al lado, su nivel. */
  const rejilla = (filas: readonly string[]) => {
    const W = (filas[0] as string).length / 2;
    const celdas = filas.flatMap((f) =>
      Array.from({ length: W }, (_, k) => f.slice(2 * k, 2 * k + 2)),
    );
    return {
      W,
      H: filas.length,
      nivel: celdas.map((c) => Number(c[1])),
      sePisa: (i: number) => celdas[i]?.[0] === '.',
    };
  };

  it('una montaña a 2 en un llano a 1, sin nada a su nivel al lado, es una mesa', () => {
    const r = rejilla(['.1.1.1.1', '.1M2M2.1', '.1M2M2.1', '.1.1.1.1']);
    expect(mesasDelRelieve(r.W, r.H, r.nivel, r.sePisa)).toEqual([5]);
  });

  it('la que toca su meseta, o una barrera más alta, no', () => {
    const conMeseta = rejilla(['.2.2.1.1', '.1M2M2.1', '.1M2M2.1', '.1.1.1.1']);
    expect(mesasDelRelieve(conMeseta.W, conMeseta.H, conMeseta.nivel, conMeseta.sePisa)).toEqual(
      [],
    );
    const bajoUnaCumbre = rejilla(['.3M3.1.1', '.1M2M2.1', '.1M2M2.1', '.1.1.1.1']);
    expect(
      mesasDelRelieve(bajoUnaCumbre.W, bajoUnaCumbre.H, bajoUnaCumbre.nivel, bajoUnaCumbre.sePisa),
    ).toEqual([]);
  });
});
