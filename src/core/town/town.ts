/** Castillos: construcción, moradas y reclutamiento. */
import { creature, factionLineup } from '../data.js';
import type { Army, FactionId, PlayerId, Point, Resources } from '../types.js';
import { canAfford, scaleResources, subtractResources } from '../types.js';
import { allBuildings, building, prebuiltBuildings } from './buildings.js';

export interface Town {
  readonly id: string;
  owner: PlayerId | null;
  readonly name: string;
  readonly faction: FactionId;
  readonly at: Point;
  /** Ids de edificios construidos. */
  buildings: string[];
  /** Ya se construyó hoy: uno por día. */
  builtToday: boolean;
  /** Criaturas disponibles para reclutar, por id. */
  available: Record<string, number>;
  /** Guarnición: defiende el pueblo si no hay héroe. */
  garrison: Army;
}

export function createTown(
  id: string,
  name: string,
  faction: FactionId,
  at: Point,
  owner: PlayerId | null,
): Town {
  return {
    id,
    owner,
    name,
    faction,
    at,
    buildings: prebuiltBuildings(),
    builtToday: false,
    available: {},
    garrison: [null, null, null, null, null],
  };
}

export function hasBuilding(town: Town, id: string): boolean {
  return town.buildings.includes(id);
}

/** Oro por día que genera el pueblo (se queda con el ayuntamiento mejor). */
export function dailyIncome(town: Town): number {
  let best = 0;
  for (const id of town.buildings) {
    const b = building(id);
    if (b.income !== undefined && b.income > best) best = b.income;
  }
  return best;
}

export function mageGuildLevel(town: Town): number {
  let level = 0;
  for (const id of town.buildings) {
    const b = building(id);
    if (b.mageGuildLevel !== undefined && b.mageGuildLevel > level) level = b.mageGuildLevel;
  }
  return level;
}

export function hasWalls(town: Town): boolean {
  return town.buildings.some((id) => building(id).grantsWalls === true);
}

export function moraleFromBuildings(town: Town): number {
  return town.buildings.reduce((n, id) => n + (building(id).moraleBonus ?? 0), 0);
}

/** Motivo por el que no se puede construir, o `null` si sí se puede. */
export function buildBlocker(town: Town, buildingId: string, purse: Resources): string | null {
  const b = building(buildingId);
  if (hasBuilding(town, buildingId)) return 'ya está construido';
  if (town.builtToday) return 'ya se ha construido hoy en este pueblo';
  for (const req of b.requires ?? []) {
    if (!hasBuilding(town, req)) return `falta construir "${building(req).name}"`;
  }
  if (!canAfford(purse, b.cost)) return 'recursos insuficientes';
  return null;
}

export function canBuild(town: Town, buildingId: string, purse: Resources): boolean {
  return buildBlocker(town, buildingId, purse) === null;
}

/** Construye y devuelve los recursos que quedan. Lanza si no era posible. */
export function build(town: Town, buildingId: string, purse: Resources): Resources {
  const b = building(buildingId);
  const blocker = buildBlocker(town, buildingId, purse);
  // El mensaje lo lee una persona: va el nombre del edificio, no su id.
  if (blocker !== null) throw new Error(`no se puede construir ${b.name}: ${blocker}`);

  town.buildings = [...town.buildings, buildingId];
  town.builtToday = true;

  // Una morada recién construida trae ya su primera hornada.
  if (b.dwellingLevel !== undefined) {
    const c = creatureOfLevel(town, b.dwellingLevel);
    town.available[c] = (town.available[c] ?? 0) + creature(c).growth;
  }
  // Una mejora convierte lo disponible al tipo mejorado.
  if (b.upgradesLevel !== undefined) {
    const base = baseCreatureOfLevel(town, b.upgradesLevel);
    const upgraded = creature(base).upgradesTo;
    if (upgraded !== undefined) {
      const pending = town.available[base] ?? 0;
      delete town.available[base];
      town.available[upgraded] = (town.available[upgraded] ?? 0) + pending;
    }
  }

  return subtractResources(purse, b.cost);
}

function baseCreatureOfLevel(town: Town, level: number): string {
  const found = factionLineup(town.faction).find((c) => c.level === level);
  if (found === undefined) {
    throw new Error(`la facción ${town.faction} no tiene criatura de nivel ${level}`);
  }
  return found.id;
}

/** Qué criatura produce la morada de ese nivel, ya mejorada si procede. */
export function creatureOfLevel(town: Town, level: number): string {
  const base = baseCreatureOfLevel(town, level);
  const upgradeBuilt = town.buildings.some((id) => building(id).upgradesLevel === level);
  if (!upgradeBuilt) return base;
  return creature(base).upgradesTo ?? base;
}

/** Moradas construidas y la criatura que produce cada una. */
export function dwellings(town: Town): { level: number; creature: string }[] {
  return town.buildings
    .map((id) => building(id))
    .filter((b) => b.dwellingLevel !== undefined)
    .map((b) => ({ level: b.dwellingLevel as number, creature: creatureOfLevel(town, b.dwellingLevel as number) }))
    .sort((a, b) => a.level - b.level);
}

/** El lunes cada morada suelta su crecimiento semanal. */
export function applyWeeklyGrowth(town: Town, multiplier = 1): void {
  for (const { creature: id } of dwellings(town)) {
    town.available[id] = (town.available[id] ?? 0) + creature(id).growth * multiplier;
  }
}

export function recruitCost(creatureId: string, count: number): Resources {
  return scaleResources(creature(creatureId).cost, count);
}

/** Motivo por el que no se puede reclutar, o `null`. */
export function recruitBlocker(
  town: Town,
  creatureId: string,
  count: number,
  purse: Resources,
): string | null {
  if (count <= 0) return 'cantidad no válida';
  const available = town.available[creatureId] ?? 0;
  if (available < count) return `solo hay ${available} disponibles`;
  if (!canAfford(purse, recruitCost(creatureId, count))) return 'recursos insuficientes';
  return null;
}

/** Descuenta lo reclutado del pueblo. Devuelve los recursos restantes. */
export function payRecruit(
  town: Town,
  creatureId: string,
  count: number,
  purse: Resources,
): Resources {
  const blocker = recruitBlocker(town, creatureId, count, purse);
  if (blocker !== null) throw new Error(`no se puede reclutar: ${blocker}`);
  town.available[creatureId] = (town.available[creatureId] ?? 0) - count;
  return subtractResources(purse, recruitCost(creatureId, count));
}

/** Edificios que se podrían construir hoy en este pueblo. */
export function availableBuildings(town: Town, purse: Resources): string[] {
  return allBuildings()
    .filter((b) => canBuild(town, b.id, purse))
    .map((b) => b.id);
}
