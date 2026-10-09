/**
 * Los interruptores de reglas de la arena (`battle/reglas.ts`): cada regla de
 * fheroes2 hace lo que dice su cita, y con todas en «nuestra» nada cambia.
 *
 * Las cifras que se comprueban son las de la fuente (las citas están en el
 * código, junto a cada regla); aquí se ejercen por el motor, no por la tabla de
 * textos.
 */
import { describe, expect, it } from 'vitest';
import {
  activeStack,
  applyAction,
  type BattleSide,
  crearBatallaConReglas,
  opcionesDeDanio,
  probabilidadDeMoralBaja,
  stackById,
} from '../src/core/battle/battle.js';
import {
  CHANCE_PER_POINT,
  computeDamage,
  damageMultiplier,
  effectiveDefense,
  expectedDamage,
  multiplicadorFheroes2,
} from '../src/core/battle/damage.js';
import { efectoDeTirada } from '../src/core/battle/effects.js';
import {
  NOMBRES_DE_REGLA,
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasALaURL,
  reglasDeLaURL,
} from '../src/core/battle/reglas.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { bando, con, mando } from './batalla-de-prueba.js';

function batalla(
  izquierda: BattleSide,
  derecha: BattleSide,
  reglas: ReglasDeBatalla,
  semilla = 1,
): { b: BattleState; rng: Rng } {
  const rng = createRng(semilla);
  return { b: crearBatallaConReglas(izquierda, derecha, rng, reglas), rng };
}

/** Un `Rng` que cuenta las tiradas de `int`: la Bendición de fheroes2 no gasta ninguna. */
function contando(rng: Rng): { rng: Rng; ints: () => number } {
  let n = 0;
  return {
    rng: {
      ...rng,
      int: (a, b) => {
        n++;
        return rng.int(a, b);
      },
    },
    ints: () => n,
  };
}

describe('la URL de las reglas', () => {
  it('ida y vuelta: lo que se escribe es lo que se lee, y vacío son las del juego', () => {
    expect(reglasDeLaURL(null)).toBe(REGLAS_DEL_JUEGO);
    expect(reglasDeLaURL('')).toBe(REGLAS_DEL_JUEGO);
    expect(reglasALaURL(REGLAS_DEL_JUEGO)).toBe('');
    for (const n of NOMBRES_DE_REGLA) {
      const r = reglasDeLaURL(n);
      expect(r[n]).toBe('fheroes2');
      expect(reglasALaURL(r)).toBe(n);
    }
    const todas = reglasDeLaURL(NOMBRES_DE_REGLA.join(','));
    expect(NOMBRES_DE_REGLA.every((n) => todas[n] === 'fheroes2')).toBe(true);
    // El orden de la URL es el de la lista, escriba quien escriba.
    expect(reglasALaURL(reglasDeLaURL('heroe,tirador'))).toBe('tirador,heroe');
  });

  it('un nombre que no es una regla se rechaza diciendo cuáles valen', () => {
    expect(() => reglasDeLaURL('tirador,magia')).toThrow(
      `«magia» no es una regla de la arena; valen ${NOMBRES_DE_REGLA.join(', ')}`,
    );
    expect(() => reglasDeLaURL('tirador,tirador')).toThrow('está dos veces');
  });

  it('las del juego no se pueden encender a mano', () => {
    expect(Object.isFrozen(REGLAS_DEL_JUEGO)).toBe(true);
  });
});

describe('(a) el tirador', () => {
  /** Un arquero y un piquero a `distancia` casillas en la misma fila. */
  function aDistancia(reglas: ReglasDeBatalla, distancia: number) {
    const { b } = batalla(
      bando([{ creature: 'archer', count: 10 }]),
      bando([{ creature: 'pikeman', count: 10 }]),
      reglas,
    );
    const arquero = stackById(b, 'attacker-0');
    const piquero = stackById(b, 'defender-0');
    arquero.hex = { col: 1, row: 4 };
    piquero.hex = { col: 1 + distancia, row: 4 };
    return { b, arquero, piquero };
  }

  it('a 8 casillas: nuestra pega la mitad, fheroes2 entero', () => {
    const nuestra = aDistancia(REGLAS_DEL_JUEGO, 8);
    const f2 = aDistancia(con('tirador'), 8);
    const d = (x: typeof nuestra) =>
      expectedDamage(
        x.arquero,
        x.piquero,
        opcionesDeDanio(x.b, x.arquero, x.piquero, { ranged: true, distance: 8 }),
      );
    expect(d(nuestra) / d(f2)).toBeCloseTo(0.5);
  });

  it('cuerpo a cuerpo con flechas: fheroes2 la mitad, nuestra entero; sin flechas, entero', () => {
    const nuestra = aDistancia(REGLAS_DEL_JUEGO, 1);
    const f2 = aDistancia(con('tirador'), 1);
    const d = (x: typeof nuestra) =>
      expectedDamage(x.arquero, x.piquero, opcionesDeDanio(x.b, x.arquero, x.piquero));
    expect(d(f2) / d(nuestra)).toBeCloseTo(0.5);
    // `isArchers()` es `GetShots() > 0`: sin flechas ya no es tirador.
    f2.arquero.shotsLeft = 0;
    expect(d(f2) / d(nuestra)).toBeCloseTo(1);
  });

  it('por el motor: el contraataque del arquero pegado también sale a la mitad', () => {
    // El piquero golpea al arquero; el arquero devuelve el golpe cuerpo a cuerpo.
    const golpe = (reglas: ReglasDeBatalla) => {
      const { b, rng } = batalla(
        bando([{ creature: 'pikeman', count: 1 }]),
        bando([{ creature: 'archer', count: 40 }]),
        reglas,
        3,
      );
      stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
      stackById(b, 'defender-0').hex = { col: 6, row: 4 };
      applyAction(b, { type: 'attack', target: 'defender-0' }, rng);
      const r = b.log.find((e) => e.kind === 'attack' && e.retaliation);
      if (r === undefined || r.kind !== 'attack') throw new Error('no hubo contraataque');
      return r.damage;
    };
    // Mismo dado (misma semilla, mismas tiradas): la mitad, redondeada.
    expect(golpe(con('tirador'))).toBe(Math.max(1, Math.round(golpe(REGLAS_DEL_JUEGO) / 2)));
  });
});

describe('(b) ataque contra defensa', () => {
  it('fheroes2: +10 % hasta +20 puntos, −5 % hasta −16, de la cita', () => {
    expect(multiplicadorFheroes2(0)).toBe(1);
    expect(multiplicadorFheroes2(20)).toBeCloseTo(3);
    expect(multiplicadorFheroes2(25)).toBeCloseTo(3);
    expect(multiplicadorFheroes2(-16)).toBeCloseTo(0.2);
    expect(multiplicadorFheroes2(-20)).toBeCloseTo(0.2);
    expect(multiplicadorFheroes2(-4)).toBeCloseTo(0.8);
    // Y la nuestra, para que se vea la diferencia.
    expect(damageMultiplier(0, 20)).toBeCloseTo(0.5);
    expect(damageMultiplier(0, 40)).toBeCloseTo(0.3);
    expect(damageMultiplier(40, 0)).toBeCloseTo(4);
  });

  it('el motor la elige por la regla de la batalla', () => {
    // Campesino (A 1) contra piquero (D 9): r = −8.
    const ratio = (reglas: ReglasDeBatalla) => {
      const { b } = batalla(
        bando([{ creature: 'peasant', count: 10 }]),
        bando([{ creature: 'pikeman', count: 10 }]),
        reglas,
      );
      const a = stackById(b, 'attacker-0');
      const d = stackById(b, 'defender-0');
      return expectedDamage(a, d, opcionesDeDanio(b, a, d)) / (1 * 10);
    };
    expect(ratio(REGLAS_DEL_JUEGO)).toBeCloseTo(1 - 8 * 0.025);
    expect(ratio(con('ataqueDefensa'))).toBeCloseTo(1 - 8 * 0.05);
  });
});

describe('(c) la moral baja', () => {
  it('la probabilidad por punto es 1/24 o 1/12', () => {
    expect(probabilidadDeMoralBaja(REGLAS_DEL_JUEGO)).toBe(CHANCE_PER_POINT);
    expect(probabilidadDeMoralBaja(con('moralBaja'))).toBeCloseTo(1 / 12);
  });

  it('por el motor, en 3 000 batallas con moral −1: alrededor de 1/12 y de 1/24', () => {
    // Piqueros (una facción: +1) con −2 del héroe: moral −1. El atacante empata
    // en velocidad y abre la ronda, así que su primer turno es la tirada.
    const frecuencia = (reglas: ReglasDeBatalla): number => {
      let paralizados = 0;
      const n = 3000;
      for (let semilla = 1; semilla <= n; semilla++) {
        const { b } = batalla(
          bando([{ creature: 'pikeman', count: 1 }], { moral: -2 }),
          bando([{ creature: 'pikeman', count: 1 }]),
          reglas,
          semilla,
        );
        expect(stackById(b, 'attacker-0').morale).toBe(-1);
        if (b.log.some((e) => e.kind === 'morale' && e.stack === 'attacker-0' && !e.good)) {
          paralizados++;
        }
      }
      return paralizados / n;
    };
    const f2 = frecuencia(con('moralBaja'));
    const nuestra = frecuencia(REGLAS_DEL_JUEGO);
    // Cuatro desviaciones típicas de holgura: √(p(1−p)/n) ≈ 0,005 y 0,0036.
    expect(Math.abs(f2 - 1 / 12)).toBeLessThan(0.02);
    expect(Math.abs(nuestra - 1 / 24)).toBeLessThan(0.0146);
  });
});

describe('(d) defender', () => {
  it('fheroes2: sin bono de defensa', () => {
    const { b } = batalla(
      bando([{ creature: 'pikeman', count: 1 }]),
      bando([{ creature: 'pikeman', count: 1 }]),
      REGLAS_DEL_JUEGO,
    );
    const p = stackById(b, 'defender-0');
    p.defending = true;
    expect(effectiveDefense(p, REGLAS_DEL_JUEGO)).toBeCloseTo(9 * 1.2);
    expect(effectiveDefense(p, con('defender'))).toBe(9);
  });

  it('fheroes2: tras defender no hay turno extra por moral; nuestra, a veces sí', () => {
    // Moral +3 (una facción +1, y +2): 1/8 de turno extra con nuestra.
    const extras = (reglas: ReglasDeBatalla): number => {
      let n = 0;
      for (let semilla = 1; semilla <= 400; semilla++) {
        const { b, rng } = batalla(
          bando([{ creature: 'pikeman', count: 1 }], { moral: 2 }),
          bando([{ creature: 'pikeman', count: 1 }]),
          reglas,
          semilla,
        );
        const quien = activeStack(b);
        if (quien?.id !== 'attacker-0') continue;
        applyAction(b, { type: 'defend' }, rng);
        if (b.log.some((e) => e.kind === 'morale' && e.good)) n++;
      }
      return n;
    };
    expect(extras(con('defender'))).toBe(0);
    expect(extras(REGLAS_DEL_JUEGO)).toBeGreaterThan(20);
  });
});

describe('(e) Bendición y Maldición', () => {
  function conLibro(reglas: ReglasDeBatalla) {
    return batalla(
      bando([{ creature: 'swordsman', count: 5 }], { heroe: mando() }),
      bando([{ creature: 'swordsman', count: 5 }], { heroe: mando() }),
      reglas,
    );
  }

  it('fheroes2: la Bendición fija el daño máximo y no gasta tirada', () => {
    const { b, rng } = conLibro(con('bendicion'));
    const yo = activeStack(b) as BattleStack;
    applyAction(b, { type: 'cast', spell: 'bless', target: yo.id }, rng);
    expect(yo.effects).toEqual([
      expect.objectContaining({ kind: 'tirada', amount: 1, source: 'bless' }),
    ]);
    expect(efectoDeTirada(yo)).toBe(1);
    const otro = b.stacks.find((s) => s.side !== yo.side && s.origen.kind !== 'heroe')!;
    const c = contando(createRng(9));
    const r = computeDamage(yo, otro, c.rng, opcionesDeDanio(b, yo, otro));
    expect(c.ints()).toBe(0);
    // 5 espadachines × 6 (su máximo) contra A 7 / D 9: ×0,95.
    expect(r.damage).toBe(Math.round(5 * 6 * damageMultiplier(7, 9)));
  });

  it('nuestra: la Bendición es suerte +1 y la tirada se tira', () => {
    const { b, rng } = conLibro(REGLAS_DEL_JUEGO);
    const yo = activeStack(b) as BattleStack;
    applyAction(b, { type: 'cast', spell: 'bless', target: yo.id }, rng);
    expect(yo.effects).toEqual([expect.objectContaining({ kind: 'luck', amount: 1 })]);
    const otro = b.stacks.find((s) => s.side !== yo.side && s.origen.kind !== 'heroe')!;
    const c = contando(createRng(9));
    computeDamage(yo, otro, c.rng, opcionesDeDanio(b, yo, otro));
    expect(c.ints()).toBe(1);
  });

  it('la Maldición sustituye a la Bendición, y lo dice el parte', () => {
    const { b, rng } = conLibro(con('bendicion'));
    const yo = activeStack(b) as BattleStack;
    applyAction(b, { type: 'cast', spell: 'bless', target: yo.id }, rng);
    // El héroe rival le echa la Maldición en la ronda siguiente (una por ronda).
    b.heroes[yo.side === 'attacker' ? 'defender' : 'attacker']!.castThisRound = false;
    const rival = yo.side === 'attacker' ? 'defender' : 'attacker';
    b.turno = { n: 999, stack: b.stacks.find((s) => s.side === rival)!.id, gastado: 0 };
    applyAction(b, { type: 'cast', spell: 'curse', target: yo.id }, rng);
    expect(yo.effects.map((e) => [e.kind, e.source, e.amount])).toEqual([['tirada', 'curse', -1]]);
    expect(efectoDeTirada(yo)).toBe(-1);
    expect(b.log).toContainEqual({ kind: 'effect_end', stack: yo.id, source: 'bless' });
  });

  it('la Maldición de la momia sigue al interruptor, y el no-muerto es inmune en los dos', () => {
    const golpe = (reglas: ReglasDeBatalla, victima: string) => {
      const { b, rng } = batalla(
        bando([{ creature: 'mummy', count: 5 }]),
        bando([{ creature: victima, count: 20 }]),
        reglas,
        4,
      );
      stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
      stackById(b, 'defender-0').hex = { col: 6, row: 4 };
      while (activeStack(b)?.id !== 'attacker-0') applyAction(b, { type: 'wait' }, rng);
      applyAction(b, { type: 'attack', target: 'defender-0' }, rng);
      return { b, v: stackById(b, 'defender-0') };
    };
    const f2 = golpe(con('bendicion'), 'pikeman');
    expect(f2.v.effects).toEqual([
      expect.objectContaining({ kind: 'tirada', amount: -1, source: 'curse_on_hit' }),
    ]);
    const nuestra = golpe(REGLAS_DEL_JUEGO, 'pikeman');
    expect(nuestra.v.effects).toEqual([
      expect.objectContaining({ kind: 'luck', amount: -1, source: 'curse_on_hit' }),
    ]);
    for (const reglas of [REGLAS_DEL_JUEGO, con('bendicion')]) {
      const { b, v } = golpe(reglas, 'skeleton');
      expect(v.effects).toEqual([]);
      expect(b.log).toContainEqual({ kind: 'immune', stack: v.id, source: 'curse_on_hit' });
    }
  });
});

describe('(f) el ataque y la defensa del héroe', () => {
  function conHeroes(reglas: ReglasDeBatalla) {
    return batalla(
      bando([{ creature: 'swordsman', count: 5 }], { heroe: mando({ ataque: 4, defensa: 0 }) }),
      bando([{ creature: 'swordsman', count: 5 }], { heroe: mando({ ataque: 0, defensa: 3 }) }),
      reglas,
    );
  }

  it('fheroes2: el ataque de su héroe y la defensa del rival cuentan en la tropa', () => {
    const { b } = conHeroes(con('heroe'));
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    const o = opcionesDeDanio(b, a, d);
    expect([o.ataqueDelMando, o.defensaDelMando]).toEqual([4, 3]);
    // 7 + 4 contra 9 + 3: r = −1.
    expect(expectedDamage(a, d, o)).toBeCloseTo(5 * 5 * damageMultiplier(11, 12));
  });

  it('nuestra: no cuentan, y el héroe no se los suma a sí mismo en ninguna', () => {
    const { b } = conHeroes(REGLAS_DEL_JUEGO);
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    const o = opcionesDeDanio(b, a, d);
    expect(o.ataqueDelMando).toBeUndefined();
    expect(expectedDamage(a, d, o)).toBeCloseTo(5 * 5 * damageMultiplier(7, 9));
    const f2 = conHeroes(con('heroe')).b;
    const heroe = stackById(f2, 'attacker-heroe');
    expect(opcionesDeDanio(f2, heroe, stackById(f2, 'defender-0')).ataqueDelMando).toBe(0);
  });
});
