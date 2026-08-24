/** Hechizos de combate: catálogo tipado y su efecto sobre la batalla. */
import spellsJson from '../../../data/spells.json' with { type: 'json' };
import { creature } from '../data.js';
import { applyDamage } from './damage.js';
import type { StackEffect } from './effects.js';
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
  /** Lo que dura unas rondas. Lo cuelga del stack el motor, no el hechizo. */
  readonly effect?: StackEffect;
}

/**
 * Lo que rinde el hechizo con este lanzador: su base más lo que aporta el poder
 * mágico. Está exportada porque la IA necesita el MISMO número para valorar un
 * lanzamiento sin aplicarlo (`tactics.ts`); cuando lo recalculaba por su cuenta
 * había cuatro copias de la fórmula y cualquier cambio dejaba a la IA puntuando
 * con la vieja.
 */
export function spellAmount(s: Spell, caster: Pick<BattleHero, 'spellPower'>): number {
  return (s.basePower ?? 0) + (s.perPower ?? 0) * caster.spellPower;
}

/** Dura el poder mágico del lanzador en rondas, que es lo del original. */
function temporalEffect(kind: 'speed' | 'luck', s: Spell, caster: BattleHero): StackEffect {
  return {
    kind,
    amount: s.amount ?? 0,
    source: s.id,
    roundsLeft: Math.max(1, caster.spellPower),
  };
}

/**
 * El efecto temporal que dejaría este hechizo, o `null` si no deja ninguno.
 *
 * Se calcula aparte de aplicarlo porque `legalActions` necesita saber si el
 * objetivo sería inmune ANTES de ofrecer el lanzamiento: así no se le propone
 * al agente una Maldición sobre un esqueleto que después va a rebotar.
 */
export function effectOfSpell(s: Spell, caster: BattleHero): StackEffect | null {
  if (s.kind !== 'speed' && s.kind !== 'luck') return null;
  return temporalEffect(s.kind, s, caster);
}

/** Aplica el hechizo al objetivo. El coste de maná lo descuenta el motor. */
export function castSpell(s: Spell, caster: BattleHero, target: BattleStack): SpellResult {
  switch (s.kind) {
    case 'damage': {
      const power = spellAmount(s, caster);
      const killed = applyDamage(target, power);
      return { damage: power, killed };
    }
    case 'speed':
    case 'luck':
      // Dentro del `case` el tipo ya está acotado: aquí el efecto existe
      // siempre, así que no hay rama `null` que fingir que puede pasar.
      return { damage: 0, killed: 0, effect: temporalEffect(s.kind, s, caster) };
    case 'heal': {
      const amount = spellAmount(s, caster);
      const maxHp = creature(target.creature).hp;
      target.topHp = Math.min(maxHp, target.topHp + amount);
      return { damage: 0, killed: 0 };
    }
  }
}
