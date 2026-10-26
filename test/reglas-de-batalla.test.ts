/**
 * Las reglas nuestras que la arena comparaba con las de fheroes2 hasta el
 * 19-10-2026, cuando se fueron los interruptores (`battle/reglas.ts`): el
 * tirador pierde la mitad a más de 5 casillas, la Bendición es suerte +1 y el
 * ataque del héroe no cuenta en su tropa. Se ejercen por el motor. (Defender y
 * el turno extra de la moral se fueron el 26-10-2026, con sus pruebas.)
 */

import { describe, expect, it } from 'vitest';
import {
  activeStack,
  applyAction,
  type BattleSide,
  createBattle,
  opcionesDeDanio,
  stackById,
} from '../src/core/battle/battle.js';
import { computeDamage, damageMultiplier, expectedDamage } from '../src/core/battle/damage.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { unidad } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { UnitInfo } from '../src/core/types.js';
import { cuerpoDeCombate } from '../src/core/unidad.js';
import { bando, mando } from './batalla-de-prueba.js';
import { conCifrasAMano, PESADA } from './helpers.js';

function batalla(
  izquierda: BattleSide,
  derecha: BattleSide,
  semilla = 1,
): { b: BattleState; rng: Rng } {
  const rng = createRng(semilla);
  return { b: createBattle(izquierda, derecha, rng, COMBATE_COMPLETO), rng };
}

/**
 * El cuerpo de `id` sin su equipo de serie, con `cambios`: sin la armadura, que se
 * resta al final de todo lo que llega, para que se lean los multiplicadores tal
 * cual.
 */
const desnudo = (id: string, cambios: Partial<UnitInfo> = {}): UnitInfo => ({
  ...cuerpoDeCombate(unidad(id)),
  ...cambios,
});

/** El espadachín de las cuentas: A 7, D 9, daño 40-60, sin armadura. */
const ESPADACHIN = desnudo(PESADA, {
  name: 'Espadachín',
  attack: 7,
  defense: 9,
  damage: [40, 60],
});

/** Los stacks de `b` de cada bando, cada uno con las cifras hechas a mano de su bando. */
function aManoEn(b: BattleState, atacante: UnitInfo, defensor: UnitInfo): BattleState {
  for (const s of b.stacks) {
    if (s.origen.kind === 'heroe') continue;
    conCifrasAMano(b, s.id, s.side === 'attacker' ? atacante : defensor);
  }
  return b;
}

/** Un `Rng` que cuenta las tiradas de `int`. */
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

describe('la Bendición', () => {
  it('es suerte +1, y la tirada se tira', () => {
    const { b, rng } = batalla(
      bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
      bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    );
    aManoEn(b, ESPADACHIN, ESPADACHIN);
    const yo = activeStack(b) as BattleStack;
    applyAction(b, { type: 'cast', spell: 'bless', target: yo.id }, rng);
    expect(yo.effects).toEqual([expect.objectContaining({ kind: 'luck', amount: 1 })]);
    const otro = b.stacks.find((s) => s.side !== yo.side && s.origen.kind !== 'heroe')!;
    const c = contando(createRng(9));
    computeDamage(yo, otro, c.rng, opcionesDeDanio(b, yo, otro));
    expect(c.ints()).toBe(1);
  });
});

describe('el héroe', () => {
  it('su ataque no cuenta en su tropa', () => {
    const { b } = batalla(
      bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
      bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    );
    aManoEn(b, ESPADACHIN, ESPADACHIN);
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    expect(expectedDamage(a, d, opcionesDeDanio(b, a, d))).toBeCloseTo(
      5 * 50 * damageMultiplier(7, 9),
    );
  });
});
