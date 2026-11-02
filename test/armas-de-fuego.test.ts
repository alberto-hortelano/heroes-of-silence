/**
 * Las armas de fuego (02-11-2026, regla nuestra; `docs/agents/2026-11-02-armas-de-fuego-y-granadas/`):
 * disparan como cualquier tirador (el disparo diferido, que sigue sin tests propios
 * por decisión del usuario), pero su disparo **perfora la armadura** y el arma
 * **recarga** unos turnos, contando el del disparo. Escrito desde los criterios 4 y 5
 * de los requisitos, con las unidades del imperio del catálogo y ninguna tirada al
 * azar (`createRng` con semilla).
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  apuntarBlocker,
  createBattle,
  legalActions,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { UnitInfo } from '../src/core/types.js';
import { avanzarHasta, forzarTurno } from './helpers.js';

/** `tirador` en (2,4) contra un coracero (brigantina: 2 de armadura) en (8,4), con el turno del tirador. */
function aTiro(tirador: string): BattleState {
  const b = createBattle(
    { army: [{ creature: tirador, count: 1 }], hero: null },
    { army: [{ creature: 'imperio-coracero', count: 1 }], hero: null },
    createRng(1),
    COMBATE_COMPLETO,
  );
  stackById(b, 'attacker-0').hex = { col: 2, row: 4 };
  stackById(b, 'defender-0').hex = { col: 8, row: 4 };
  forzarTurno(b, 'attacker-0');
  return b;
}

/** Cierra turnos sin hacer nada hasta que le toque a `id`. */
function hastaSuTurno(b: BattleState, id: string, rng: Rng): void {
  expect(avanzarHasta(b, rng, id, () => ({ type: 'end_turn' }))).toBe(true);
}

type Disparo = Extract<BattleEvent, { kind: 'shoot' }>;
function disparos(b: BattleState): Disparo[] {
  return b.log.filter((e): e is Disparo => e.kind === 'shoot');
}

describe('las armas de fuego', () => {
  it('el disparo de un arma de fuego perfora la armadura, y la previsión lo dice; el de una ballesta no', () => {
    for (const [tirador, perfora] of [
      ['imperio-arcabucero', true],
      ['imperio-ballestero', false],
    ] as const) {
      const rng = createRng(7);
      const b = aTiro(tirador);
      const at = stackById(b, 'defender-0').hex;
      const p = previsionDe(b, { type: 'aim', at });
      if (p === null || p.kind !== 'disparo')
        throw new Error(`${tirador}: sin previsión del disparo`);
      const causas = p.modificadores.map((m) => m.causa);
      expect(causas.includes('perfora la armadura'), tirador).toBe(perfora);
      expect(causas.includes('−2 armadura'), tirador).toBe(!perfora);
      applyAction(b, { type: 'aim', at }, rng);
      hastaSuTurno(b, 'attacker-0', rng);
      const [d] = disparos(b);
      if (d === undefined) throw new Error(`${tirador}: no salió el disparo`);
      expect(d.target, tirador).toBe('defender-0');
      // Nadie se ha movido: la previsión de antes es la del disparo, en un cuarto fijo.
      expect(d.damage, tirador).toBe(p.danio.min);
      expect(p.danio.min, tirador).toBe(p.danio.max);
      expect(d.parado ?? 0, tirador).toBe(perfora ? 0 : 2);
    }
  });

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

  it('tras disparar, la culebrina (recarga 2) no apunta en ese turno ni en el siguiente; luego, sí', () => {
    const rng = createRng(3);
    const b = aTiro('imperio-artillero-culebrina');
    applyAction(b, { type: 'aim', at: stackById(b, 'defender-0').hex }, rng);
    hastaSuTurno(b, 'attacker-0', rng);
    expect(disparos(b)).toHaveLength(1);
    // El turno del disparo cuenta como el primero de los dos.
    expect(apuntarBlocker(b)).toBe('Artillero con culebrina está recargando: le faltan 2 turnos');
    expect(legalActions(b).some((a) => a.type === 'aim')).toBe(false);
    applyAction(b, { type: 'end_turn' }, rng);
    hastaSuTurno(b, 'attacker-0', rng);
    expect(apuntarBlocker(b)).toBe('Artillero con culebrina está recargando: le falta 1 turno');
    applyAction(b, { type: 'end_turn' }, rng);
    hastaSuTurno(b, 'attacker-0', rng);
    expect(apuntarBlocker(b)).toBeNull();
    expect(legalActions(b).some((a) => a.type === 'aim')).toBe(true);
    // Un arma sin recarga, como siempre: el ballestero apunta en el turno del disparo.
    const c = aTiro('imperio-ballestero');
    applyAction(c, { type: 'aim', at: stackById(c, 'defender-0').hex }, rng);
    hastaSuTurno(c, 'attacker-0', rng);
    expect(disparos(c)).toHaveLength(1);
    expect(apuntarBlocker(c)).toBeNull();
  });
});
