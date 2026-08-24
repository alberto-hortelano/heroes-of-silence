/**
 * Del plan declarativo al mapa jugable.
 *
 * El agente NO dibuja el mapa: devuelve un plan (regiones de terreno, pueblos,
 * minas, monstruos, tesoros) y este módulo lo convierte en un `GameMap`
 * determinista. Lo mismo hace el generador procedural de respaldo, así que
 * ambos caminos pasan por la misma validación de jugabilidad.
 */

import type { Rng } from '../rng.js';
import { createTown, type Town } from '../town/town.js';
import type { FactionId, PlayerId, Point, ResourceKind } from '../types.js';
import {
  createEmptyMap,
  findPath,
  type GameMap,
  inBounds,
  type MapObject,
  pointKey,
} from './map.js';
import { isWalkable, type TerrainKind } from './terrain.js';

export interface TerrainRegion {
  readonly terrain: TerrainKind;
  readonly center: Point;
  /** Radio en casillas. La región es una mancha redondeada, no un cuadrado. */
  readonly radius: number;
}

export interface PlannedTown {
  readonly id: string;
  readonly name: string;
  readonly faction: FactionId;
  readonly at: Point;
  /** `null` = pueblo neutral, sin dueño. */
  readonly owner: PlayerId | null;
}

export interface MapPlan {
  readonly width: number;
  readonly height: number;
  readonly baseTerrain: TerrainKind;
  readonly regions: readonly TerrainRegion[];
  readonly towns: readonly PlannedTown[];
  readonly heroStarts: readonly { readonly player: PlayerId; readonly at: Point }[];
  readonly mines: readonly {
    readonly at: Point;
    readonly resource: ResourceKind;
    readonly owner?: PlayerId;
  }[];
  readonly resources: readonly {
    readonly at: Point;
    readonly resource: ResourceKind;
    readonly amount: number;
  }[];
  readonly monsters: readonly {
    readonly at: Point;
    readonly creature: string;
    readonly count: number;
  }[];
  readonly chests: readonly { readonly at: Point; readonly gold: number }[];
  readonly roads?: readonly Point[];
}

export interface BuiltMap {
  readonly map: GameMap;
  readonly towns: Town[];
}

// ---------------------------------------------------------------- validación

/**
 * Comprueba que el plan da una partida jugable. Devuelve la lista de problemas;
 * vacía = plan válido. Se aplica igual al plan del agente que al procedural:
 * un mapa con un castillo inalcanzable rompe la partida venga de donde venga.
 */
export function validateMapPlan(plan: MapPlan): string[] {
  const problemas: string[] = [];

  if (plan.width < 8 || plan.height < 8)
    problemas.push('el mapa es demasiado pequeño (mínimo 8×8)');
  if (plan.width > 128 || plan.height > 128)
    problemas.push('el mapa es demasiado grande (máximo 128×128)');

  const dentro = (p: Point): boolean =>
    p.x >= 0 && p.x < plan.width && p.y >= 0 && p.y < plan.height;

  const ocupadas = new Map<string, string>();
  const ocupar = (p: Point, quien: string): void => {
    const k = pointKey(p);
    if (!dentro(p)) {
      problemas.push(`${quien} está fuera del mapa en (${p.x},${p.y})`);
      return;
    }
    const previo = ocupadas.get(k);
    if (previo !== undefined) {
      problemas.push(`(${p.x},${p.y}) la ocupan dos cosas: ${previo} y ${quien}`);
      return;
    }
    ocupadas.set(k, quien);
  };

  for (const t of plan.towns) ocupar(t.at, `pueblo "${t.id}"`);
  for (const m of plan.mines) ocupar(m.at, `mina de ${m.resource}`);
  for (const r of plan.resources) ocupar(r.at, `recurso ${r.resource}`);
  for (const m of plan.monsters) ocupar(m.at, `monstruo ${m.creature}`);
  for (const c of plan.chests) ocupar(c.at, 'cofre');

  if (plan.towns.length < 2) problemas.push('hacen falta al menos dos pueblos');
  if (plan.heroStarts.length < 2) problemas.push('hacen falta al menos dos posiciones de inicio');

  const conPueblo = new Set(plan.towns.filter((t) => t.owner !== null).map((t) => t.owner));
  for (const inicio of plan.heroStarts) {
    if (!dentro(inicio.at)) {
      problemas.push(`el inicio del jugador ${inicio.player} cae fuera del mapa`);
    }
    if (!conPueblo.has(inicio.player)) {
      problemas.push(`el jugador ${inicio.player} no tiene ningún pueblo`);
    }
  }

  if (problemas.length > 0) return problemas;

  // Conectividad real, sobre el mapa ya construido: cada héroe debe poder
  // llegar a cada pueblo. Los monstruos no se cuentan como muro: son la gracia.
  const { map } = buildMap(plan);
  const sinMonstruos: GameMap = {
    ...map,
    objects: map.objects.filter((o) => o.kind !== 'monster'),
  };
  for (const inicio of plan.heroStarts) {
    for (const pueblo of plan.towns) {
      if (findPath(sinMonstruos, inicio.at, pueblo.at) === null) {
        problemas.push(
          `el jugador ${inicio.player} no puede llegar al pueblo "${pueblo.id}" desde su inicio`,
        );
      }
    }
  }

  return problemas;
}

// ---------------------------------------------------------------- construcción

export function buildMap(plan: MapPlan): BuiltMap {
  const map = createEmptyMap(plan.width, plan.height, plan.baseTerrain);

  // Regiones: manchas redondeadas pintadas en orden, la última manda.
  for (const region of plan.regions) {
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        const dx = x - region.center.x;
        const dy = y - region.center.y;
        if (dx * dx + dy * dy <= region.radius * region.radius) {
          map.terrain[y * plan.width + x] = region.terrain;
        }
      }
    }
  }

  for (const p of plan.roads ?? []) {
    if (inBounds(map, p)) map.roads.add(pointKey(p));
  }

  const objects: MapObject[] = [];
  for (const t of plan.towns) objects.push({ kind: 'town', id: t.id, at: t.at, owner: t.owner });
  for (const [i, m] of plan.mines.entries()) {
    objects.push({
      kind: 'mine',
      id: `mine-${i}`,
      at: m.at,
      resource: m.resource,
      owner: m.owner ?? null,
    });
  }
  for (const [i, r] of plan.resources.entries()) {
    objects.push({
      kind: 'resource',
      id: `res-${i}`,
      at: r.at,
      resource: r.resource,
      amount: r.amount,
      taken: false,
    });
  }
  for (const [i, m] of plan.monsters.entries()) {
    objects.push({
      kind: 'monster',
      id: `mon-${i}`,
      at: m.at,
      creature: m.creature,
      count: m.count,
      defeated: false,
    });
  }
  for (const [i, c] of plan.chests.entries()) {
    objects.push({ kind: 'chest', id: `chest-${i}`, at: c.at, gold: c.gold, taken: false });
  }

  // Nada relevante puede quedar sobre agua: se sanea el terreno bajo el objeto
  // en lugar de mover el objeto, que descolocaría el diseño del plan.
  for (const o of objects) {
    const idx = o.at.y * plan.width + o.at.x;
    if (!isWalkable(map.terrain[idx] as TerrainKind)) map.terrain[idx] = 'dirt';
  }
  for (const inicio of plan.heroStarts) {
    const idx = inicio.at.y * plan.width + inicio.at.x;
    if (!isWalkable(map.terrain[idx] as TerrainKind)) map.terrain[idx] = 'dirt';
  }

  map.objects.push(...objects);

  const towns = plan.towns.map((t) => createTown(t.id, t.name, t.faction, t.at, t.owner));
  return { map, towns };
}

// ---------------------------------------------------------------- procedural

export interface ProceduralOptions {
  readonly width?: number;
  readonly height?: number;
  readonly factions?: readonly [FactionId, FactionId];
  readonly monsterCount?: number;
  readonly resourceCount?: number;
}

/**
 * Mapa simétrico de dos jugadores. Es el respaldo cuando no hay agente y el
 * ejemplo de referencia de qué forma debe tener un plan.
 */
export function generateMapPlan(rng: Rng, opts: ProceduralOptions = {}): MapPlan {
  const width = opts.width ?? 24;
  const height = opts.height ?? 24;
  const [f0, f1] = opts.factions ?? (['knight', 'necromancer'] as const);

  const ocupadas = new Set<string>();
  const tomar = (p: Point): boolean => {
    const k = pointKey(p);
    if (ocupadas.has(k)) return false;
    ocupadas.add(k);
    return true;
  };
  const libre = (margen = 1): Point => {
    for (let intento = 0; intento < 500; intento++) {
      const p = {
        x: rng.int(margen, width - 1 - margen),
        y: rng.int(margen, height - 1 - margen),
      };
      if (tomar(p)) return p;
    }
    throw new Error('no queda sitio libre en el mapa');
  };

  // Los dos bandos, en esquinas opuestas.
  const townA: Point = { x: 3, y: 3 };
  const townB: Point = { x: width - 4, y: height - 4 };
  tomar(townA);
  tomar(townB);
  const startA: Point = { x: townA.x + 1, y: townA.y + 1 };
  const startB: Point = { x: townB.x - 1, y: townB.y - 1 };
  tomar(startA);
  tomar(startB);

  const regions: TerrainRegion[] = [
    { terrain: 'dirt', center: townA, radius: 4 },
    { terrain: 'dirt', center: townB, radius: 4 },
    {
      terrain: 'rough',
      center: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      radius: 5,
    },
    {
      terrain: 'swamp',
      center: { x: Math.floor(width * 0.25), y: Math.floor(height * 0.75) },
      radius: 3,
    },
    {
      terrain: 'snow',
      center: { x: Math.floor(width * 0.75), y: Math.floor(height * 0.25) },
      radius: 3,
    },
  ];

  // Una mina de cada recurso por bando, en espejo.
  const recursosMina: ResourceKind[] = ['gold', 'wood', 'ore', 'crystal'];
  const mines: MapPlan['mines'] = recursosMina.flatMap((resource, i) => {
    const a: Point = { x: 2 + i * 2, y: 7 };
    const b: Point = { x: width - 3 - i * 2, y: height - 8 };
    tomar(a);
    tomar(b);
    return [
      { at: a, resource },
      { at: b, resource },
    ];
  });

  const monstruosPosibles = ['peasant', 'skeleton', 'zombie', 'archer', 'pikeman', 'mummy'];
  const monsters = Array.from({ length: opts.monsterCount ?? 8 }, () => {
    const especie = rng.pick(monstruosPosibles);
    return { at: libre(2), creature: especie, count: rng.int(4, 14) };
  });

  const recursosSueltos: ResourceKind[] = ['wood', 'ore', 'crystal', 'gems', 'mercury', 'sulfur'];
  const resources = Array.from({ length: opts.resourceCount ?? 10 }, () => ({
    at: libre(1),
    resource: rng.pick(recursosSueltos),
    amount: rng.int(3, 8),
  }));

  const chests = Array.from({ length: 4 }, () => ({ at: libre(1), gold: rng.int(500, 2000) }));

  return {
    width,
    height,
    baseTerrain: 'grass',
    regions,
    towns: [
      { id: 'town-0', name: 'Valdeluz', faction: f0, at: townA, owner: 0 },
      { id: 'town-1', name: 'Cripta Gris', faction: f1, at: townB, owner: 1 },
    ],
    heroStarts: [
      { player: 0, at: startA },
      { player: 1, at: startB },
    ],
    mines,
    resources,
    monsters,
    chests,
  };
}
