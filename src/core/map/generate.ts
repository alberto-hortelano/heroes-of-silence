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
  // Los dos opcionales llevan el `| undefined` escrito, y no es ruido: con
  // `exactOptionalPropertyTypes` un `owner?: PlayerId` acepta que la propiedad
  // FALTE y rechaza que valga `undefined`, mientras que un `.optional()` de zod
  // produce justo lo segundo. Nadie lo había notado porque `mapPlanSchema` no
  // tenía llamante: el plan del agente y este tipo no se habían encontrado nunca
  // hasta que `map_generate` tuvo quien lo pidiera (#27). Es la misma cosa
  // declarada dos veces, así que las dos declaraciones tienen que decir lo mismo.
  readonly mines: readonly {
    readonly at: Point;
    readonly resource: ResourceKind;
    readonly owner?: PlayerId | undefined;
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
  readonly roads?: readonly Point[] | undefined;
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

  // Un id de pueblo repetido no choca con nada al construir: `buildMap` crea
  // dos `Town` y dos `MapObject` con el mismo id, y a partir de ahí todo lo que
  // busca un pueblo por su id —construir, reclutar, capturar, la pantalla del
  // castillo— encuentra el primero y el segundo es inalcanzable. Es el tipo de
  // plan que sale de un agente que numera mal, y hoy pasaba entero.
  const vistos = new Set<string>();
  for (const t of plan.towns) {
    if (vistos.has(t.id))
      problemas.push(`hay dos pueblos con el id "${t.id}": tienen que ser únicos`);
    vistos.add(t.id);
  }

  // Y un jugador con dos inicios da dos héroes `hero-<player>`, con el mismo
  // problema un piso más abajo: `setup.ts` deriva el id del jugador, no del
  // orden. La comprobación es de UNICIDAD, no de cuáles: qué jugadores tenía que
  // haber lo sabe quien pidió el mapa, y eso no es asunto de `core`.
  const conInicio = new Set<PlayerId>();
  for (const inicio of plan.heroStarts) {
    if (conInicio.has(inicio.player)) {
      problemas.push(
        `el jugador ${inicio.player} tiene dos posiciones de inicio: solo puede tener una`,
      );
    }
    conInicio.add(inicio.player);
  }

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

  // Minas de los siete recursos, dos de cada por bando y en espejo.
  //
  // Decía `['gold', 'wood', 'ore', 'crystal']`, así que **no existía una sola
  // mina de gemas, mercurio ni azufre en ningún mapa**. Con eso, seis
  // edificios que los piden —las dos moradas de nivel 6, `knight_upgrade_6`,
  // `necromancer_upgrade_4/5` y `mage_guild_2`— eran inalcanzables durase lo
  // que durase la partida: la otra fuente son los montones sueltos, y la IA
  // recoge una mediana de 0 en toda la partida.
  //
  // La lista sigue escrita y no se deriva de `RESOURCE_KINDS` porque el ORDEN
  // fija en qué columna cae cada mina: derivarla movía el oro de la columna 2
  // a la 14 —del lado de casa al centro del mapa— y eso solo, sin cambiar
  // ninguna otra cifra, dejaba una partida sin terminar de 200. Las cuatro que
  // ya existían se quedan donde estaban y las tres nuevas continúan la fila.
  // Que no vuelva a quedarse corta lo vigila un test contra `RESOURCE_KINDS`,
  // que es donde ese guardia sirve de algo: aquí sería tautológico.
  //
  // Dos por recurso es la única cifra de este ciclo que no tiene fuente en el
  // original —HoMM2 no tiene generador de mapas— y se fija midiendo, con las
  // otras tres palancas puestas y 400 semillas del barrido: con **una** queda
  // 1 partida sin terminar (la 43) y con **dos**, ninguna. Con **tres** el
  // barrido sigue limpio pero la victoria se da la vuelta —el caballero pasa
  // de ganar 184 de 200 a 69— y la mediana vuelve a subir a 7 días.
  //
  // `b` es el espejo exacto de `a`, casilla a casilla, porque si un bando nace
  // con una mina de gemas a mano y el otro no, la partida la decide el
  // generador y no quien juega.
  const MINAS_POR_RECURSO = 2;
  const recursosMina: readonly ResourceKind[] = [
    'gold',
    'wood',
    'ore',
    'crystal',
    'gems',
    'mercury',
    'sulfur',
  ];
  const mines: { at: Point; resource: ResourceKind }[] = [];
  for (const [i, resource] of recursosMina.entries()) {
    for (let k = 0; k < MINAS_POR_RECURSO; k++) {
      const a: Point = { x: 2 + i * 2, y: 7 + k * 2 };
      const b: Point = { x: width - 3 - i * 2, y: height - 8 - k * 2 };
      // Y aquí SÍ se mira lo que devuelve `tomar`. Con cuatro recursos en una
      // sola fila la colisión era imposible y el `boolean` se tiraba; con
      // catorce minas por bando deja de serlo, y sin esto la segunda mina de
      // una casilla se perdería en silencio hasta salir mucho después como un
      // `validateMapPlan` que no señala a nadie.
      for (const p of [a, b]) {
        if (!tomar(p)) {
          throw new Error(
            `no se puede colocar la mina de ${resource}: (${p.x},${p.y}) ya está ocupada`,
          );
        }
      }
      mines.push({ at: a, resource }, { at: b, resource });
    }
  }

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
