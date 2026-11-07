/**
 * Las armas de fuego (02-11-2026, regla nuestra; `docs/agents/2026-11-02-armas-de-fuego-y-granadas/`):
 * disparan como cualquier tirador (el disparo diferido, que sigue sin tests propios
 * por decisión del usuario), pero su disparo **perfora la armadura** y el arma
 * **recarga** unos turnos, contando el del disparo. Escrito desde los criterios 4 y 5
 * de los requisitos, con las unidades del imperio del catálogo y ninguna tirada al
 * azar (`createRng` con semilla).
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/core/battle/battle.js';
import { stackById } from '../src/core/battle/consultas.js';
import { createBattle } from '../src/core/battle/montaje.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { UnitInfo } from '../src/core/types.js';
import { avanzarHasta, forzarTurno } from './batalla-de-prueba.js';

/** Cierra turnos sin hacer nada hasta que le toque a `id`. */
function hastaSuTurno(b: BattleState, id: string, rng: Rng): void {
  expect(avanzarHasta(b, rng, id, () => ({ type: 'end_turn' }))).toBe(true);
}

type Disparo = Extract<BattleEvent, { kind: 'shoot' }>;
function disparos(b: BattleState): Disparo[] {
  return b.log.filter((e): e is Disparo => e.kind === 'shoot');
}

describe('las armas de fuego', () => {
  it('lo que salpica un arma de fuego también perfora la armadura', () => {
    // Hallazgo F2 de /simplify (02-11-2026): la perforación viajaba como un opcional
    // de `herir` y la salpicadura no lo pasaba: perforaba el blanco y no lo salpicado.
    const rng = createRng(7);
    const b = createBattle(
      { army: [{ creature: 'imperio-arcabucero', count: 1 }], hero: null },
      {
        army: [
          { creature: 'imperio-coracero', count: 1 },
          { creature: 'imperio-coracero', count: 1 },
        ],
        hero: null,
      },
      createRng(1),
      COMBATE_COMPLETO,
    );
    const tirador = stackById(b, 'attacker-0');
    tirador.hex = { col: 2, row: 4 };
    (tirador as { unit: UnitInfo }).unit = {
      ...tirador.unit,
      traits: [...(tirador.unit.traits ?? []), 'splash_shot'],
    };
    stackById(b, 'defender-0').hex = { col: 8, row: 4 };
    stackById(b, 'defender-1').hex = { col: 9, row: 4 };
    forzarTurno(b, 'attacker-0');
    applyAction(b, { type: 'aim', at: { col: 8, row: 4 } }, rng);
    hastaSuTurno(b, 'attacker-0', rng);
    const salpicado = disparos(b).find((d) => d.splash === true);
    if (salpicado === undefined) throw new Error('no salpicó');
    expect(salpicado.target).toBe('defender-1');
    expect(salpicado.parado ?? 0).toBe(0);
  });
});
