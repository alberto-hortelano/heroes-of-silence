/** Catálogo de edificios del castillo. */
import buildingsJson from '../../../data/buildings.json' with { type: 'json' };
import type { Resources } from '../types.js';

export interface Building {
  readonly id: string;
  readonly name: string;
  readonly cost: Partial<Resources>;
  /** Oro por día que aporta (solo los ayuntamientos). */
  readonly income?: number;
  /** Ya está construido al fundar el pueblo. */
  readonly prebuilt?: boolean;
  readonly requires?: readonly string[];
  /** Nivel de morada: produce la criatura de ese nivel de la facción. */
  readonly dwellingLevel?: number;
  /** Convierte la morada de ese nivel en su versión mejorada. */
  readonly upgradesLevel?: number;
  readonly mageGuildLevel?: number;
  readonly grantsWalls?: boolean;
  readonly moraleBonus?: number;
}

const byId = new Map<string, Building>();
for (const raw of buildingsJson.buildings) {
  byId.set(raw.id, {
    id: raw.id,
    name: raw.name,
    cost: raw.cost,
    ...('income' in raw ? { income: raw.income as number } : {}),
    ...('prebuilt' in raw ? { prebuilt: raw.prebuilt as boolean } : {}),
    ...('requires' in raw ? { requires: raw.requires as readonly string[] } : {}),
    ...('dwellingLevel' in raw ? { dwellingLevel: raw.dwellingLevel as number } : {}),
    ...('upgradesLevel' in raw ? { upgradesLevel: raw.upgradesLevel as number } : {}),
    ...('mageGuildLevel' in raw ? { mageGuildLevel: raw.mageGuildLevel as number } : {}),
    ...('grantsWalls' in raw ? { grantsWalls: raw.grantsWalls as boolean } : {}),
    ...('moraleBonus' in raw ? { moraleBonus: raw.moraleBonus as number } : {}),
  });
}

export function building(id: string): Building {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`edificio desconocido: "${id}"`);
  return found;
}

export function allBuildings(): readonly Building[] {
  return [...byId.values()];
}

export function prebuiltBuildings(): string[] {
  return allBuildings()
    .filter((b) => b.prebuilt === true)
    .map((b) => b.id);
}
