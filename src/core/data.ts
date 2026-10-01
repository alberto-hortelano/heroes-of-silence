/** Catálogo de criaturas: carga `data/creatures.json` y lo tipa. */
import creaturesJson from '../../data/creatures.json' with { type: 'json' };
import heroeJson from '../../data/heroe.json' with { type: 'json' };
import liderazgoJson from '../../data/liderazgo.json' with { type: 'json' };
import type { Creature, CreatureTrait, FactionId, SpeedTier, UnitInfo } from './types.js';
import { SPEED_TIERS } from './types.js';

const byId = new Map<string, Creature>();

for (const raw of creaturesJson.creatures) {
  const creature: Creature = {
    id: raw.id,
    faction: raw.faction as FactionId,
    level: raw.level,
    leadership: raw.leadership,
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

/**
 * Si estas cifras son las de una criatura del catálogo —la misma referencia,
 * no unas que se le parezcan—. Es como el motor de batalla sabe si un stack
 * trae cifras de catálogo sin volver a buscarlo por su `body`, que es lo que
 * vigila `test/invariantes.test.ts`: `createBattle` guarda la referencia del
 * catálogo tal cual, así que la identidad basta.
 */
export function esDelCatalogo(u: UnitInfo): u is Creature {
  return 'id' in u && typeof u.id === 'string' && byId.get(u.id) === u;
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

export function hasTrait(c: UnitInfo, trait: CreatureTrait): boolean {
  return c.traits?.includes(trait) ?? false;
}

export function isShooter(c: UnitInfo): boolean {
  return (c.shots ?? 0) > 0;
}

export function hexSize(c: UnitInfo): number {
  return c.hexes ?? 1;
}

/**
 * Las reglas del liderazgo, de `data/liderazgo.json`. **Provisionales**: las
 * cifras las define el usuario cuando cierre la economía, y por eso viven en
 * datos y no en el código.
 */
export interface ReglasDeLiderazgo {
  /** Tope de un héroe: `base + porNivel × (nivel − 1)`, sin pasar de `max`. */
  readonly heroe: { readonly base: number; readonly porNivel: number; readonly max: number };
  /** Tope de la tropa que guarda un castillo sin héroe. */
  readonly guarnicion: number;
  /** Lo que ocupa un personaje (`Troop.member`), que no está en el catálogo. */
  readonly personaje: number;
  /**
   * Cuántos individuos pisan el tablero por bando, como mucho: un héroe es él
   * más `maxPorBando − 1` de tropa; un monstruo o una guarnición, `maxPorBando`.
   */
  readonly maxPorBando: number;
}

export const LIDERAZGO: ReglasDeLiderazgo = {
  heroe: { ...liderazgoJson.heroe },
  guarnicion: liderazgoJson.guarnicion,
  personaje: liderazgoJson.personaje,
  maxPorBando: liderazgoJson.maxPorBando,
};

/**
 * El héroe como figura del tablero y el precio de rendirse, de
 * `data/heroe.json`. **Inventado y provisional**, y así lo dice su `_comment`:
 * en fheroes2 el héroe no pisa el tablero, así que no hay fila que copiar.
 */
export interface ReglasDelHeroe {
  readonly combate: {
    readonly pv: { readonly base: number; readonly porNivel: number };
    readonly ataquePorNivel: number;
    readonly defensaPorNivel: number;
    readonly danio: { readonly min: number; readonly max: number; readonly maxPorNivel: number };
    readonly velocidad: SpeedTier;
  };
  readonly rendicion: { readonly porcentajeDelOro: number };
}

/** Un JSON se edita a mano: una velocidad mal escrita se dice al cargar, no en la batalla. */
function velocidadDelHeroe(v: string): SpeedTier {
  const tier = SPEED_TIERS.find((t) => t === v);
  if (tier === undefined) {
    throw new Error(
      `data/heroe.json: la velocidad "${v}" no existe; valen ${SPEED_TIERS.join(', ')}`,
    );
  }
  return tier;
}

export const HEROE: ReglasDelHeroe = {
  combate: {
    pv: { ...heroeJson.combate.pv },
    ataquePorNivel: heroeJson.combate.ataquePorNivel,
    defensaPorNivel: heroeJson.combate.defensaPorNivel,
    danio: { ...heroeJson.combate.danio },
    velocidad: velocidadDelHeroe(heroeJson.combate.velocidad),
  },
  rendicion: { ...heroeJson.rendicion },
};
