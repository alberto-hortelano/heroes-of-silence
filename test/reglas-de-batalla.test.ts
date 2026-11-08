/**
 * Las reglas nuestras que la arena comparaba con las de fheroes2 hasta el
 * 19-10-2026, cuando se fueron los interruptores (`battle/reglas.ts`): el
 * tirador pierde la mitad a más de 5 casillas y el ataque del héroe no cuenta en
 * su tropa. Se ejercen por el motor. (Defender y el turno extra de la moral se
 * fueron el 26-10-2026, con sus pruebas; la Bendición, con la suerte, el
 * 02-11-2026.)
 */

import { describe, expect, it } from 'vitest';
import { stackById } from '../src/core/battle/consultas.js';
import { damageMultiplier, expectedDamage } from '../src/core/battle/damage.js';
import { opcionesDeDanio } from '../src/core/battle/golpe.js';
import { type BattleSide, createBattle } from '../src/core/battle/montaje.js';
import type { BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { UnitInfo } from '../src/core/types.js';
import { unidad } from '../src/core/unidad/catalogo.js';
import { cuerpoDeCombate } from '../src/core/unidad/formato.js';
import { bando, conCifrasAMano, mando } from './batalla-de-prueba.js';
import { PESADA } from './comun.js';

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
