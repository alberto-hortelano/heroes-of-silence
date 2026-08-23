/** Catálogo de criaturas: carga `data/creatures.json` y lo tipa. */
import creaturesJson from '../../data/creatures.json' with { type: 'json' };
import type { Creature, CreatureTrait, FactionId, SpeedTier } from './types.js';

const byId = new Map<string, Creature>();

for (const raw of creaturesJson.creatures) {
  const creature: Creature = {
    id: raw.id,
    faction: raw.faction as FactionId,
    level: raw.level,
    name: raw.name,
    attack: raw.attack,
    defense: raw.defense,
    damage: [raw.damage[0] as number, raw.damage[1] as number],
    hp: raw.hp,
    speed: raw.speed as SpeedTier,
    growth: raw.growth,
    cost: raw.cost,
    ...('shots' in raw ? { shots: raw.shots as number } : {}),
    ...('hexes' in raw ? { hexes: raw.hexes as number } : {}),
    ...('traits' in raw ? { traits: raw.traits as readonly CreatureTrait[] } : {}),
    ...('upgradesTo' in raw ? { upgradesTo: raw.upgradesTo as string } : {}),
  };
  byId.set(creature.id, creature);
}

/** Lanza si el id no existe: un id de criatura inventado es un bug, no un vacío. */
export function creature(id: string): Creature {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`criatura desconocida: "${id}"`);
  return found;
}

export function allCreatures(): readonly Creature[] {
  return [...byId.values()];
}

/** Las 6 criaturas base de una facción, de nivel 1 a 6 (sin mejoras). */
export function factionLineup(faction: FactionId): readonly Creature[] {
  const upgrades = new Set(
    allCreatures()
      .map((c) => c.upgradesTo)
      .filter((id): id is string => id !== undefined),
  );
  return allCreatures()
    .filter((c) => c.faction === faction && !upgrades.has(c.id))
    .sort((a, b) => a.level - b.level);
}

export function hasTrait(c: Creature, trait: CreatureTrait): boolean {
  return c.traits?.includes(trait) ?? false;
}

export function isShooter(c: Creature): boolean {
  return (c.shots ?? 0) > 0;
}

export function hexSize(c: Creature): number {
  return c.hexes ?? 1;
}
