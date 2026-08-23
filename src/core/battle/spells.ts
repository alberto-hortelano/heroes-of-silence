/** Hechizos de combate: catálogo tipado y su efecto sobre la batalla. */
import spellsJson from '../../../data/spells.json' with { type: 'json' };
import { creature } from '../data.js';
import { applyDamage } from './damage.js';
import type { BattleHero, BattleStack } from './types.js';

export type SpellKind = 'damage' | 'speed' | 'luck' | 'heal';
export type SpellTarget = 'enemy' | 'ally';

export interface Spell {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly cost: number;
  readonly kind: SpellKind;
  readonly target: SpellTarget;
  readonly basePower?: number;
  readonly perPower?: number;
  readonly amount?: number;
}

const byId = new Map<string, Spell>();
for (const raw of spellsJson.spells) {
  byId.set(raw.id, {
    id: raw.id,
    name: raw.name,
    level: raw.level,
    cost: raw.cost,
    kind: raw.kind as SpellKind,
    target: raw.target as SpellTarget,
    ...('basePower' in raw ? { basePower: raw.basePower as number } : {}),
    ...('perPower' in raw ? { perPower: raw.perPower as number } : {}),
    ...('amount' in raw ? { amount: raw.amount as number } : {}),
  });
}

export function spell(id: string): Spell {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`hechizo desconocido: "${id}"`);
  return found;
}

export function allSpells(): readonly Spell[] {
  return [...byId.values()];
}

export interface SpellResult {
  readonly damage: number;
  readonly killed: number;
}

/** Aplica el hechizo al objetivo. El coste de maná lo descuenta el motor. */
export function castSpell(s: Spell, caster: BattleHero, target: BattleStack): SpellResult {
  switch (s.kind) {
    case 'damage': {
      const power = (s.basePower ?? 0) + (s.perPower ?? 0) * caster.spellPower;
      const killed = applyDamage(target, power);
      return { damage: power, killed };
    }
    case 'speed': {
      target.speedBonus += s.amount ?? 0;
      return { damage: 0, killed: 0 };
    }
    case 'luck': {
      target.luck = Math.max(-3, Math.min(3, target.luck + (s.amount ?? 0)));
      return { damage: 0, killed: 0 };
    }
    case 'heal': {
      const amount = (s.basePower ?? 0) + (s.perPower ?? 0) * caster.spellPower;
      const maxHp = creature(target.creature).hp;
      target.topHp = Math.min(maxHp, target.topHp + amount);
      return { damage: 0, killed: 0 };
    }
  }
}
