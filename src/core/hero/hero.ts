/** Héroes: atributos, ejército y movimiento diario. */
import { creature } from '../data.js';
import type { Army, FactionId, PlayerId, Point, SpeedTier, Stack } from '../types.js';
import { MAX_ARMY_SLOTS, SPEED_TO_MOVE_POINTS } from '../types.js';

/** Habilidades secundarias del slice. Cada una en básico/avanzado/experto. */
export type SkillId = 'logistics' | 'pathfinding' | 'wisdom' | 'leadership' | 'luck';
export type SkillLevel = 1 | 2 | 3;

export interface Hero {
  readonly id: string;
  owner: PlayerId;
  readonly name: string;
  readonly faction: FactionId;
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  mana: number;
  level: number;
  experience: number;
  army: Army;
  at: Point;
  movePoints: number;
  spells: string[];
  skills: Partial<Record<SkillId, SkillLevel>>;
}

/** Puntos de maná máximos: 10 × Conocimiento (`heroes.cpp` de fheroes2). */
export function maxMana(hero: Pick<Hero, 'knowledge'>): number {
  return hero.knowledge * 10;
}

/** La criatura más lenta del ejército; sin ejército, el héroe va a pie ligero. */
export function slowestSpeed(army: Army): SpeedTier {
  let slowest: SpeedTier | null = null;
  let slowestPoints = Infinity;
  for (const stack of army) {
    if (stack === null) continue;
    const speed = creature(stack.creature).speed;
    const points = SPEED_TO_MOVE_POINTS[speed];
    if (points < slowestPoints) {
      slowestPoints = points;
      slowest = speed;
    }
  }
  return slowest ?? 'ultra_fast';
}

/** Bonus porcentual de Logística: +10 %, +20 % o +30 %. */
export function logisticsBonus(hero: Pick<Hero, 'skills'>): number {
  const level = hero.skills.logistics;
  return level === undefined ? 0 : level * 0.1;
}

/** Puntos de movimiento del día: los marca la criatura más lenta. */
export function maxMovePoints(hero: Pick<Hero, 'army' | 'skills'>): number {
  const base = SPEED_TO_MOVE_POINTS[slowestSpeed(hero.army)];
  return Math.round(base * (1 + logisticsBonus(hero)));
}

/** Bonus de moral que el héroe da a su ejército (Liderazgo). */
export function moraleBonus(hero: Pick<Hero, 'skills'>): number {
  return hero.skills.leadership ?? 0;
}

export function luckBonus(hero: Pick<Hero, 'skills'>): number {
  return hero.skills.luck ?? 0;
}

/** Nivel máximo de hechizo que puede aprender, según Sabiduría. */
export function maxSpellLevel(hero: Pick<Hero, 'skills'>): number {
  const wisdom = hero.skills.wisdom;
  if (wisdom === undefined) return 2;
  return 2 + wisdom;
}

/**
 * De lo que ofrece un gremio, qué se llevaría este héroe: lo que aún no sabe y
 * le deja aprender su Sabiduría. Devuelve ids en el orden de la oferta.
 *
 * Es la única puerta por la que `maxSpellLevel()` se lee de verdad. La puerta
 * no muerde en partida todavía —sin gremio de nivel 3 no hay hechizo que
 * recortar— pero queda leída y probada para el día que #3 aterrice; hasta
 * entonces `hero.skills` solo se escribe al crear la partida (#6, #15).
 */
export function learnable(
  hero: Pick<Hero, 'spells' | 'skills'>,
  oferta: readonly { readonly id: string; readonly level: number }[],
): string[] {
  const tope = maxSpellLevel(hero);
  const sabidos = new Set(hero.spells);
  return oferta.filter((s) => s.level <= tope && !sabidos.has(s.id)).map((s) => s.id);
}

// ---------------------------------------------------------------- ejército

export function emptyArmy(): Army {
  return [null, null, null, null, null];
}

export function armySize(army: Army): number {
  return army.reduce((n, s) => n + (s === null ? 0 : s.count), 0);
}

export function isArmyEmpty(army: Army): boolean {
  return army.every((s) => s === null || s.count === 0);
}

/**
 * Añade criaturas al ejército: engorda el stack existente o toma un hueco.
 * Devuelve `null` si no hay sitio — el llamante decide qué hacer, no se pierde
 * la tropa en silencio.
 */
export function addToArmy(army: Army, creatureId: string, count: number): Army | null {
  const out = [...army];
  const existing = out.findIndex((s) => s !== null && s.creature === creatureId);
  if (existing >= 0) {
    const stack = out[existing] as Stack;
    out[existing] = { creature: creatureId, count: stack.count + count };
    return out;
  }
  const free = out.indexOf(null);
  if (free < 0) return null;
  out[free] = { creature: creatureId, count };
  return out;
}

/** Elimina los stacks vacíos dejando los huecos donde estaban. */
export function pruneArmy(army: Army): Army {
  return army.map((s) => (s === null || s.count <= 0 ? null : s));
}

export function armySlotsUsed(army: Army): number {
  return army.filter((s) => s !== null).length;
}

export function hasFreeSlot(army: Army): boolean {
  return armySlotsUsed(army) < MAX_ARMY_SLOTS;
}

// ---------------------------------------------------------------- progreso

/** Experiencia necesaria para alcanzar cierto nivel (curva suave). */
export function experienceForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(1000 * 1.4 ** (level - 2));
}

export function levelFromExperience(exp: number): number {
  let level = 1;
  while (exp >= experienceForLevel(level + 1)) level++;
  return level;
}
