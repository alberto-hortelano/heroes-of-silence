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
  /** El daño que llegó, tras la armadura del objetivo (`herir`). */
  readonly damage: number;
  readonly killed: number;
  /** Lo que paró la armadura del objetivo (la arena); 0 sin ella o si no hiere. */
  readonly parado: number;
  /** PV que repuso, si cura (`curaDe`). */
  readonly cura: number;
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
 * Quien lanza un hechizo, en lo que el hechizo necesita de él: cuánto hiere o
 * cura (`cantidad`) y cuántas rondas dura lo que deja (`rondas`). El héroe es un
 * caso (`delHeroe`: su poder mágico); el poder de una unidad de la arena, otro
 * (`battle/poderes.ts`: las cifras de `data/poderes.json`). Así la Curación del
 * héroe y el «Curar» del monje son la misma cura, con el mismo tope, y las dos
 * Bendiciones el mismo efecto, del mismo origen.
 */
export interface Lanzador {
  readonly cantidad: number;
  readonly rondas: number;
}

/** El héroe como lanzador de `s`: su poder da lo que rinde y lo que dura. */
export function delHeroe(s: Spell, caster: Pick<BattleHero, 'spellPower'>): Lanzador {
  return { cantidad: spellAmount(s, caster), rondas: duracionDeLoQueLanza(caster) };
}

/**
 * Cuántas rondas dura lo que lanza un héroe: su poder, y al menos una. Lo leen el
 * hechizo y la ficha del héroe de la arena, que antes lo recalculaba.
 */
export function duracionDeLoQueLanza(caster: Pick<BattleHero, 'spellPower'>): number {
  return Math.max(1, caster.spellPower);
}

/**
 * El efecto temporal que dejaría este hechizo lanzado por `l`, o `null` si no deja
 * ninguno. El único constructor del efecto de un hechizo: dura las rondas del
 * lanzador y, con el interruptor (e) en fheroes2, la Bendición y la Maldición
 * fijan la tirada (`efectoConReglas`).
 *
 * Se calcula aparte de aplicarlo porque `legalActions` necesita saber si el
 * objetivo sería inmune ANTES de ofrecer el lanzamiento: así no se le propone
 * al agente una Maldición sobre un esqueleto que después va a rebotar.
 */
export function efectoDe(s: Spell, l: Lanzador, reglas: ReglasDeBatalla): StackEffect | null {
  if (s.kind !== 'speed' && s.kind !== 'luck') return null;
  return temporal(s.kind, s, l, reglas);
}

/** `efectoDe` con el tipo ya acotado: dentro del `case` de `castSpell`, sin rama `null`. */
function temporal(
  kind: 'speed' | 'luck',
  s: Spell,
  l: Lanzador,
  reglas: ReglasDeBatalla,
): StackEffect {
  return efectoConReglas(
    { kind, amount: s.amount ?? 0, source: s.id, roundsLeft: l.rondas },
    reglas,
  );
}

/**
 * Los PV que repondría `s` lanzado por `l` sobre `target`: su cantidad, sin pasar
 * de la vida de un individuo; 0 si no cura. La regla del tope, una vez: la aplica
 * `castSpell` y la enseñan la previsión, el bloqueador del poder y la IA.
 */
export function curaDe(s: Spell, l: Lanzador, target: Pick<BattleStack, 'topHp' | 'unit'>): number {
  return s.kind === 'heal' ? Math.min(l.cantidad, target.unit.hp - target.topHp) : 0;
}

/**
 * Aplica el hechizo al objetivo: el daño y la cura, aquí; el efecto que dura lo
 * devuelve para que lo cuelgue el motor, que es quien sabe anotarlo. El coste de
 * maná, si lo hay, también es del motor.
 *
 * `autor` es el stack que cobra el daño (el cuerpo del héroe): un hechizo le da
 * experiencia como un golpe (`herir`). `null` si no hay cuerpo que cobre.
 */
export function castSpell(
  s: Spell,
  l: Lanzador,
  target: BattleStack,
  autor: BattleStack | null,
  reglas: ReglasDeBatalla,
): SpellResult {
  switch (s.kind) {
    case 'damage': {
      const h = herir(target, l.cantidad, autor);
      return { damage: h.danio, killed: h.muertos, cura: 0, parado: h.parado };
    }
    case 'speed':
    case 'luck':
      return { damage: 0, killed: 0, cura: 0, parado: 0, effect: temporal(s.kind, s, l, reglas) };
    case 'heal': {
      const cura = curaDe(s, l, target);
      target.topHp += cura;
      return { damage: 0, killed: 0, cura, parado: 0 };
    }
  }
}
