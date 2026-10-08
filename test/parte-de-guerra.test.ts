/**
 * El parte de guerra cuenta la espera y la defensa (#82).
 *
 * Se callaban desde que el parte existe, cuando la IA no las jugaba nunca. Desde
 * #52 la IA espera en 49 de cada 100 batallas espejo, y quien mira veía a una
 * unidad quedarse quieta sin una línea que dijera que había cedido la
 * iniciativa. Los hechos de aquí los escribe el motor (`applyAction`), no se
 * fabrican a mano: lo que se comprueba es lo que de verdad llega al parte.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import { activeStack, applyAction, createBattle } from '../src/core/battle/battle.js';
import { effectiveDefense } from '../src/core/battle/damage.js';
import type { BattleState, Side } from '../src/core/battle/types.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import { startingArmy } from '../src/core/state/setup.js';

function espejo(semilla: number): { battle: BattleState; rng: ReturnType<typeof createRng> } {
  const rng = createRng(semilla);
  const battle = createBattle(
    { army: troopsAsStacks(startingArmy('knight', rng)), hero: null },
    { army: troopsAsStacks(startingArmy('necromancer', rng)), hero: null },
    rng,
  );
  return { battle, rng };
}

const parte = (battle: BattleState, mio: Side | null): string =>
  marcadoDe(renderBattleLog(battle, mio));

const otro = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');

describe('el parte de guerra cuenta la espera y la defensa (#82)', () => {
  it('la espera nombra a la unidad y su bando desde quien lee, y dice que cede la iniciativa', () => {
    const { battle, rng } = espejo(1);
    const quien = activeStack(battle);
    if (quien === null) throw new Error('la batalla espejo no tiene unidad activa');
    applyAction(battle, { type: 'wait' }, rng);
    const linea = 'cede la iniciativa y pasa al final de la ronda';

    expect(parte(battle, quien.side)).toContain(
      `<div>Espera ${quien.unit.name}, de tu bando: ${linea}</div>`,
    );
    expect(parte(battle, otro(quien.side))).toContain(
      `<div>Espera ${quien.unit.name}, del enemigo: ${linea}</div>`,
    );
    // El espectador y la arena leen sin bando: atacante o defensor, como la rendición.
    const rol = quien.side === 'attacker' ? 'atacante' : 'defensor';
    expect(parte(battle, null)).toContain(
      `<div>Espera ${quien.unit.name}, del ${rol}: ${linea}</div>`,
    );
  });

  it('la defensa dice la cifra que de verdad aplica el motor y hasta cuándo', () => {
    const { battle, rng } = espejo(1);
    const quien = activeStack(battle);
    if (quien === null) throw new Error('la batalla espejo no tiene unidad activa');
    applyAction(battle, { type: 'defend' }, rng);

    // La cifra no se copia en el test: sale de lo que `effectiveDefense` hace
    // con el stack defendiéndose, así que si cambia la regla y no el texto,
    // esto se pone rojo.
    const pct = Math.round((effectiveDefense(quien) / quien.unit.defense - 1) * 100);
    expect(pct).toBeGreaterThan(0);
    expect(parte(battle, quien.side)).toContain(
      `<div>Se defiende ${quien.unit.name}, de tu bando: +${pct}\u00a0% de defensa hasta el final de la ronda</div>`,
    );
  });

  it('cada espera que juega la IA en una batalla entera sale en el parte, una línea por espera', () => {
    // La primera semilla espejo en la que la IA espera: la regla de #52 se
    // dispara en la mitad de las batallas, así que no hay que ir lejos.
    let resuelta: BattleState | null = null;
    for (let s = 1; s <= 50 && resuelta === null; s++) {
      const { battle, rng } = espejo(s);
      const { state } = autoResolve(battle, rng);
      if (state.log.slice(-40).some((e) => e.kind === 'wait')) resuelta = state;
    }
    if (resuelta === null)
      throw new Error('ninguna de 50 batallas espejo espera en sus 40 últimos hechos');
    const esperas = resuelta.log.slice(-40).filter((e) => e.kind === 'wait').length;
    const lineas = parte(resuelta, null).match(/<div>Espera /g) ?? [];
    expect(lineas.length).toBe(esperas);
  });

  it('una espera de una unidad que no está en el campo lanza, no se pinta como «alguien»', () => {
    const { battle } = espejo(1);
    battle.log.push({ kind: 'wait', stack: 'fantasma' });
    expect(() => parte(battle, null)).toThrow(
      'el parte habla de una unidad que no está en el campo: fantasma',
    );
  });
});
