/** Hechizos de combate: catálogo tipado y su efecto sobre la batalla. */
import spellsJson from '../../../data/spells.json' with { type: 'json' };
import { herir } from './damage.js';
import type { StackEffect } from './effects.js';
import { efectoConReglas, type ReglasDeBatalla } from './reglas.js';
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

/**
 * El orden en que se lee una lista de hechizos: por nivel, luego por coste y,
 * a igualdad, por id. Es el del gremio (`townSpells`) y el del libro del héroe
 * en pantalla, escrito una vez.
 *
 * El libro en el estado (`hero.spells`) NO se reordena: va en el orden en que se
 * aprendió, y de ese orden cuelga cómo la IA recorre sus hechizos —reordenarlo
 * movía las partidas del banco—. Quien lo enseña lo ordena al pintar con
 * `enOrdenDelLibro`; antes un héroe inicial (`magic_arrow` de `setup`, lo demás
 * después) y uno contratado con los mismos hechizos los enseñaban distinto (#54).
 */
export function ordenDelLibro(a: Spell, b: Spell): number {
  return a.level - b.level || a.cost - b.cost || a.id.localeCompare(b.id);
}

/** Los hechizos de `ids` en el orden del libro. Lanza con un id desconocido. */
export function enOrdenDelLibro(ids: readonly string[]): Spell[] {
  return ids.map(spell).sort(ordenDelLibro);
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

/**
 * Dura el poder mágico del lanzador en rondas, que es lo del original. Con el
 * interruptor (e) en fheroes2, la Bendición y la Maldición fijan la tirada
 * (`efectoConReglas`).
 */
function temporalEffect(
  kind: 'speed' | 'luck',
  s: Spell,
  caster: BattleHero,
  reglas: ReglasDeBatalla,
): StackEffect {
  return efectoConReglas(
    { kind, amount: s.amount ?? 0, source: s.id, roundsLeft: duracionDeLoQueLanza(caster) },
    reglas,
  );
}

/**
 * Cuántas rondas dura lo que lanza un héroe: su poder, y al menos una. Lo leen el
 * hechizo y la ficha del héroe de la arena, que antes lo recalculaba.
 */
export function duracionDeLoQueLanza(caster: Pick<BattleHero, 'spellPower'>): number {
  return Math.max(1, caster.spellPower);
}

/**
 * El efecto temporal que dejaría este hechizo, o `null` si no deja ninguno.
 *
 * Se calcula aparte de aplicarlo porque `legalActions` necesita saber si el
 * objetivo sería inmune ANTES de ofrecer el lanzamiento: así no se le propone
 * al agente una Maldición sobre un esqueleto que después va a rebotar.
 */
export function effectOfSpell(
  s: Spell,
  caster: BattleHero,
  reglas: ReglasDeBatalla,
): StackEffect | null {
  if (s.kind !== 'speed' && s.kind !== 'luck') return null;
  return temporalEffect(s.kind, s, caster, reglas);
}

/**
 * Aplica el hechizo al objetivo. El coste de maná lo descuenta el motor.
 *
 * `autor` es el stack del héroe que lo lanza: el daño de un hechizo es suyo y
 * le da experiencia como un golpe (`herir`). `null` si no hay cuerpo que cobre.
 */
export function castSpell(
  s: Spell,
  caster: BattleHero,
  target: BattleStack,
  autor: BattleStack | null,
  reglas: ReglasDeBatalla,
): SpellResult {
  switch (s.kind) {
    case 'damage': {
      const power = spellAmount(s, caster);
      const killed = herir(target, power, autor);
      return { damage: power, killed };
    }
    case 'speed':
    case 'luck':
      // Dentro del `case` el tipo ya está acotado: aquí el efecto existe
      // siempre, así que no hay rama `null` que fingir que puede pasar.
      return { damage: 0, killed: 0, effect: temporalEffect(s.kind, s, caster, reglas) };
    case 'heal': {
      target.topHp += curaDe(s, caster, target);
      return { damage: 0, killed: 0 };
    }
  }
}

/**
 * Los PV que repondría una Curación sobre `target`: su cantidad, sin pasar de la
 * vida de un individuo. La aplica `castSpell` y la enseña la previsión.
 */
export function curaDe(
  s: Spell,
  caster: Pick<BattleHero, 'spellPower'>,
  target: Pick<BattleStack, 'topHp' | 'unit'>,
): number {
  return Math.min(spellAmount(s, caster), target.unit.hp - target.topHp);
}
