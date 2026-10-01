/**
 * Del plan declarativo al mapa jugable.
 *
 * El agente NO dibuja el mapa: devuelve un plan (manchas de terreno, regiones,
 * muros, nodos, ciudades, minas, monstruos, tesoros) y este módulo lo
 * convierte en un `GameMap` determinista. Lo mismo hace el generador
 * procedural de respaldo, así que ambos caminos pasan por la misma validación
 * de jugabilidad — y desde la fase 2, por la misma comprobación de que el mapa
 * **es una red de nodos** (`problemasDeRed`).
 */

import { ASALTANTES, guarnicionDeBase, guarnicionNeutral, problemasDeGrupo } from '../data.js';
import { CUPO_GUARNICION, ejercitoDe } from '../hero/troop.js';
import type { Rng } from '../rng.js';
import {
  problemasDeAsaltante,
  type Raider,
  type RaiderPlaneado,
  regionDeCasilla,
  tocaUnNodo,
} from '../state/asaltantes.js';
import { createTown, primeraCiudadDe, type Town } from '../town/town.js';
import type { Army, FactionId, PlayerId, Point, ResourceKind } from '../types.js';
import {
  createEmptyMap,
  type GameMap,
  inBounds,
  type MapObject,
  type MapRegion,
  pointKey,
} from './map.js';
import {
  aPunto,
  type Estructura,
  estructura,
  juntoANodo,
  problemasDeRed,
  regionesQueToca,
  territorio,
  VECINAS,
} from './regiones.js';
import { isWalkable, type TerrainKind } from './terrain.js';

/**
 * Una mancha de terreno: solo pinta, no separa nada.
 *
 * Se llamaba `TerrainRegion` y vivía en `MapPlan.regions`, y con el mapa de
 * nodos el nombre chocaba: una **región** es ahora una zona de juego encerrada
 * por nodos, y esto es un círculo de nieve. El cambio de nombre es a propósito
 * y en el mismo sitio, para que ningún plan viejo se cuele con el campo
 * equivocado: un `regions` de manchas no pasa el esquema nuevo.
 */
export interface TerrainPatch {
  readonly terrain: TerrainKind;
  readonly center: Point;
  /** Radio en casillas. La mancha es redondeada, no un cuadrado. */
  readonly radius: number;
}

/** Los dos terrenos con los que se levanta un muro: la cordillera y el río. */
export const WALL_TERRAINS = ['mountain', 'water'] as const;
type WallTerrain = (typeof WALL_TERRAINS)[number];

/**
 * Un tramo de muro, **recto**: `from` y `to` comparten fila o columna, y se
 * pintan los dos extremos y todo lo de en medio.
 *
 * Ortogonal y no libre por una razón de 8-vecindad: un muro en diagonal de una
 * casilla de grueso deja huecos de esquina por los que se cuela un héroe en
 * diagonal. Con tramos rectos ese hueco no se puede escribir.
 */
export interface PlannedWall {
  readonly terrain: WallTerrain;
  readonly from: Point;
  readonly to: Point;
}

export interface PlannedTown {
  readonly id: string;
  readonly name: string;
  readonly faction: FactionId;
  /** Una ciudad **es un nodo**: va en el muro, entre regiones, y no se repite en `nodes`. */
  readonly at: Point;
  /** `null` = ciudad neutral, que nace con la guarnición de `data/ciudades.json`. */
  readonly owner: PlayerId | null;
}

export interface MapPlan {
  readonly width: number;
  readonly height: number;
  readonly baseTerrain: TerrainKind;
  readonly patches: readonly TerrainPatch[];
  /** Las regiones del mapa de nodos, tal cual las guarda el mapa (`MapRegion`). */
  readonly regions: readonly MapRegion[];
  readonly walls: readonly PlannedWall[];
  /** Los pasos entre regiones que no son ciudad. */
  readonly nodes: readonly Point[];
  readonly towns: readonly PlannedTown[];
  readonly heroStarts: readonly { readonly player: PlayerId; readonly at: Point }[];
  /** Sin dueño: una mina produce para quien tenga su región (`regionOwner`). */
  readonly mines: readonly { readonly at: Point; readonly resource: ResourceKind }[];
  /** Los pueblos, dentro de una región. Son de quien la tenga. */
  readonly villages: readonly { readonly name: string; readonly at: Point }[];
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
  // El `| undefined` escrito no es ruido: con `exactOptionalPropertyTypes` un
  // `roads?: …` rechaza el `undefined` que produce un `.optional()` de zod, y
  // `mapPlanSchema` y este tipo son la misma cosa declarada dos veces (#27).
  readonly roads?: readonly Point[] | undefined;
  /**
   * Los grupos de asaltantes con los que empieza la partida (`state/asaltantes.ts`).
   * Opcional, con el mismo idioma que `roads`: un plan sin ellos es válido y
   * la partida empieza sin ninguno —brotarán los lunes—.
   */
  readonly raiders?: readonly RaiderPlaneado[] | undefined;
}

export interface BuiltMap {
  readonly map: GameMap;
  readonly towns: Town[];
  readonly raiders: Raider[];
}

/**
 * El lado del mapa que juega una partida si nadie pide otro: lo leen el
 * generador y el servidor, que antes lo copiaba a mano (`ws-server.ts`).
 *
 * **Elegido midiendo, no a ojo** (ciclo «el camino cuesta», 02-10-2026): con los
 * asaltantes puestos, el menor lado con mediana ≥ 8 días, p90 ≤ 20 y 0 partidas
 * sin terminar en 1 000 semillas. La tabla de cada lado está en `CLAUDE.md`, y
 * cómo se mide en `tools/qa/tamanos.ts`.
 */
export const LADO_DEL_MAPA = 28;

/** Los ids que `buildMap` les pone a los objetos que el plan no nombra. */
const idDeNodo = (i: number): string => `node-${i}`;
const idDePueblo = (i: number): string => `village-${i}`;

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

  // Los muros, antes que nada: `buildMap` los pinta y un tramo fuera del mapa o
  // torcido no se puede pintar. Torcido se rechaza en vez de enderezarse: un
  // muro en diagonal deja huecos de esquina (`PlannedWall`).
  for (const m of plan.walls) {
    const tramo = `el muro de (${m.from.x},${m.from.y}) a (${m.to.x},${m.to.y})`;
    if (!inBounds(plan, m.from) || !inBounds(plan, m.to))
      problemas.push(`${tramo} se sale del mapa`);
    if (m.from.x !== m.to.x && m.from.y !== m.to.y) {
      problemas.push(
        `${tramo} no es recto: un tramo de muro va en una fila o en una columna, y uno en diagonal deja huecos por las esquinas`,
      );
    }
    if (!(WALL_TERRAINS as readonly string[]).includes(m.terrain)) {
      problemas.push(`${tramo} es de "${m.terrain}": un muro es ${WALL_TERRAINS.join(' o ')}`);
    }
  }

  const ocupadas = new Map<string, string>();
  const ocupar = (p: Point, quien: string): void => {
    const k = pointKey(p);
    if (!inBounds(plan, p)) {
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

  for (const t of plan.towns) ocupar(t.at, `la ciudad "${t.id}"`);
  for (const n of plan.nodes) ocupar(n, 'un nodo');
  for (const m of plan.mines) ocupar(m.at, `mina de ${m.resource}`);
  for (const v of plan.villages) ocupar(v.at, `el pueblo "${v.name}"`);
  for (const r of plan.resources) ocupar(r.at, `recurso ${r.resource}`);
  for (const m of plan.monsters) ocupar(m.at, `monstruo ${m.creature}`);
  for (const c of plan.chests) ocupar(c.at, 'cofre');
  for (const r of plan.raiders ?? [])
    ocupar(r.at, `el grupo de asaltantes de (${r.at.x},${r.at.y})`);
  // Los inicios también ocupan casilla: dos héroes en la misma o un héroe
  // **encima del castillo rival** daban partidas degeneradas sin reventar.
  for (const i of plan.heroStarts) ocupar(i.at, `el inicio del jugador ${i.player}`);

  if (plan.towns.length < 2) problemas.push('hacen falta al menos dos ciudades');
  if (plan.heroStarts.length < 2) problemas.push('hacen falta al menos dos posiciones de inicio');

  // Un id repetido no choca con nada al construir: `buildMap` crea dos `Town` y
  // dos objetos con el mismo id, y a partir de ahí todo lo que busca por id
  // encuentra el primero. Y los ids de ciudad comparten espacio con los que
  // `buildMap` pone a nodos y pueblos: `player.memory` va por id de objeto, así
  // que una ciudad llamada "node-0" taparía el recuerdo de ese nodo.
  const reservados = new Set([
    ...plan.nodes.map((_, i) => idDeNodo(i)),
    ...plan.villages.map((_, i) => idDePueblo(i)),
  ]);
  const vistos = new Set<string>();
  for (const t of plan.towns) {
    if (vistos.has(t.id))
      problemas.push(`hay dos ciudades con el id "${t.id}": tienen que ser únicos`);
    if (reservados.has(t.id)) {
      problemas.push(
        `la ciudad "${t.id}" lleva un id que el motor reserva para los nodos y los pueblos ("node-N", "village-N"): ponle otro`,
      );
    }
    vistos.add(t.id);
  }

  // Un jugador con dos inicios da dos héroes `hero-<player>`. La comprobación
  // es de UNICIDAD, no de cuáles: qué jugadores tenía que haber lo sabe quien
  // pidió el mapa, y eso no es asunto de `core`.
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
    if (!conPueblo.has(inicio.player)) {
      problemas.push(`el jugador ${inicio.player} no tiene ninguna ciudad`);
    }
  }

  // Y al revés: una ciudad de un jugador que no juega es un tercer bando
  // fantasma que el reparto de jugadores no ve.
  const jugadores = new Set<PlayerId>(plan.heroStarts.map((i) => i.player));
  for (const t of plan.towns) {
    if (t.owner !== null && !jugadores.has(t.owner)) {
      problemas.push(
        `la ciudad "${t.id}" es del jugador ${t.owner}, que no tiene posición de inicio en este mapa: o le pones una, o déjala neutral con "owner": null`,
      );
    }
  }

  // La criatura de un monstruo es el ÚNICO texto del plan que el motor ejecuta
  // en vez de leer: `buildMap` la copia verbatim y el primer turno de la IA
  // llama a `creature(id)`, que lanza. La comprobación vive aquí y no en el
  // esquema porque esta es la puerta de los DOS productores de planes, y un
  // `z.enum` dejaría al generador de casa sin vigilar justo en este campo. Y
  // un monstruo son `count` individuos que no pasan de un bando: `createBattle`
  // lanzaría al pisarlo, con la partida ya en marcha.
  for (const m of plan.monsters) {
    problemas.push(...problemasDeGrupo([m], `el monstruo de (${m.at.x},${m.at.y})`));
  }
  // Un grupo de asaltantes, además, no pasa del techo de `data/asaltantes.json`:
  // más fuerte que eso es un muro, y el agente no puede diseñar uno.
  for (const r of plan.raiders ?? []) {
    problemas.push(
      ...problemasDeAsaltante(r.troops, `el grupo de asaltantes de (${r.at.x},${r.at.y})`),
    );
  }

  if (problemas.length > 0) return problemas;

  const { map, towns } = buildMap(plan);

  // Nada se queda sobre un muro y nada que no sea nodo se pone en un nodo.
  // Antes `buildMap` **saneaba en silencio** el terreno bajo un objeto —lo
  // convertía en tierra—, y con muros eso es abrir un agujero en la red sin que
  // nadie lo pida: una mina en mitad de una cordillera sería un paso. Ahora se
  // dice, y la única casilla que el muro cede es la de un nodo o una ciudad,
  // que es una regla declarada (`buildMap`).
  const sobreRegion = (p: Point, quien: string): void => {
    const terreno = map.terrain[p.y * map.width + p.x] as TerrainKind;
    if (!isWalkable(terreno)) {
      problemas.push(
        `${quien} en (${p.x},${p.y}) cae sobre ${terreno}: tiene que estar dentro de una región`,
      );
    }
  };
  for (const m of plan.mines) sobreRegion(m.at, `la mina de ${m.resource}`);
  for (const v of plan.villages) sobreRegion(v.at, `el pueblo "${v.name}"`);
  for (const r of plan.resources) sobreRegion(r.at, `el recurso ${r.resource}`);
  for (const m of plan.monsters) sobreRegion(m.at, `el monstruo ${m.creature}`);
  for (const c of plan.chests) sobreRegion(c.at, 'el cofre');
  for (const i of plan.heroStarts) sobreRegion(i.at, `el inicio del jugador ${i.player}`);
  for (const r of plan.raiders ?? []) sobreRegion(r.at, 'el grupo de asaltantes');
  if (problemas.length > 0) return problemas;

  // La red, y con ella la conectividad. Aquí había un `findPath` de cada inicio
  // a cada ciudad, y con el mapa de nodos sobra: cada inicio está en una
  // región, cada ciudad toca dos y todas las regiones se alcanzan unas desde
  // otras por nodos que no bloquean, así que no queda ciudad a la que no se
  // llegue. Un guardia que ya no puede morder no se deja de adorno.
  problemas.push(...problemasDeRed(map));
  if (problemas.length > 0) return problemas;

  // Los asaltantes, con la red ya leída: dónde puede vivir uno es una pregunta
  // de regiones. Las mismas reglas que cumplen los que brotan en partida
  // (`dondeBrotan`), para que el plan no pueda poner lo que la partida no.
  problemas.push(...problemasDeAsaltantes(plan, map, towns));
  return problemas;
}

/**
 * Lo que impide que los asaltantes de un plan vivan donde se les pone: dentro
 * de una región, sin tocar un nodo —taparía un paso—, en una región sin dueño
 * —se dispersaría antes de empezar— y en una donde no empieza ningún héroe:
 * un grupo encima de un inicio es una emboscada antes del primer turno.
 */
function problemasDeAsaltantes(plan: MapPlan, map: GameMap, towns: readonly Town[]): string[] {
  const raiders = plan.raiders ?? [];
  if (raiders.length === 0) return [];
  const problemas: string[] = [];
  const t = territorio({ map, towns, players: [] });
  const conInicio = new Set(plan.heroStarts.map((i) => regionDeCasilla(map, i.at)));
  for (const r of raiders) {
    const quien = `el grupo de asaltantes de (${r.at.x},${r.at.y})`;
    const region = regionDeCasilla(map, r.at);
    if (region < 0) {
      problemas.push(`${quien} no está dentro de ninguna región`);
      continue;
    }
    const nombre = map.regions[region]?.id;
    if (tocaUnNodo(map, r.at)) {
      problemas.push(
        `${quien} está pegado a un nodo o a una ciudad: taparía el paso; ponlo al menos a dos casillas de cualquier nodo`,
      );
    }
    if (t.dueñoDeRegion[region] !== null) {
      problemas.push(
        `${quien} está en la región "${nombre}", que ya tiene dueño: un asaltante solo vive en una región sin dueño`,
      );
    }
    if (conInicio.has(region)) {
      problemas.push(
        `${quien} está en la región "${nombre}", donde empieza un héroe: los asaltantes no nacen donde hay alguien`,
      );
    }
  }
  return problemas;
}

// ---------------------------------------------------------------- construcción

/**
 * La guarnición con la que nace una ciudad, en individuos: la neutral la de su
 * facción, la base la de la facción de su dueño —que es la suya: la facción de
 * un jugador sale de su base— y el resto de ciudades con dueño, ninguna.
 */
function guarnicionInicial(t: PlannedTown, towns: readonly PlannedTown[]): Army {
  const grupos =
    t.owner === null
      ? guarnicionNeutral(t.faction)
      : primeraCiudadDe(towns, t.owner) === t
        ? guarnicionDeBase(t.faction)
        : [];
  return ejercitoDe(grupos);
}

export function buildMap(plan: MapPlan): BuiltMap {
  const base = createEmptyMap(plan.width, plan.height, plan.baseTerrain);
  const map: GameMap = { ...base, regions: plan.regions.map((r) => ({ ...r })) };
  const pintar = (p: Point, t: TerrainKind): void => {
    if (inBounds(map, p)) map.terrain[p.y * plan.width + p.x] = t;
  };

  // Manchas: redondeadas, pintadas en orden, la última manda.
  for (const mancha of plan.patches) {
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        const dx = x - mancha.center.x;
        const dy = y - mancha.center.y;
        if (dx * dx + dy * dy <= mancha.radius * mancha.radius) pintar({ x, y }, mancha.terrain);
      }
    }
  }

  // Muros, encima de las manchas: un muro manda sobre el color del suelo.
  for (const m of plan.walls) {
    const x0 = Math.min(m.from.x, m.to.x);
    const x1 = Math.max(m.from.x, m.to.x);
    const y0 = Math.min(m.from.y, m.to.y);
    const y1 = Math.max(m.from.y, m.to.y);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pintar({ x, y }, m.terrain);
  }

  // **La regla declarada**: un nodo o una ciudad abre la casilla en la que está.
  // Es lo que deja escribir un muro de punta a punta y poner el paso encima,
  // en vez de partir el tramo en dos alrededor del nodo. Es la ÚNICA casilla
  // que se abre: todo lo demás que caiga en un muro se rechaza
  // (`validateMapPlan`), no se sanea.
  for (const p of [...plan.nodes, ...plan.towns.map((t) => t.at)]) {
    if (inBounds(map, p) && !isWalkable(map.terrain[p.y * plan.width + p.x] as TerrainKind)) {
      pintar(p, 'dirt');
    }
  }

  for (const p of plan.roads ?? []) {
    if (inBounds(map, p)) map.roads.add(pointKey(p));
  }

  const objects: MapObject[] = [];
  for (const t of plan.towns) objects.push({ kind: 'town', id: t.id, at: t.at, owner: t.owner });
  for (const [i, n] of plan.nodes.entries()) {
    objects.push({ kind: 'node', id: idDeNodo(i), at: n, owner: null });
  }
  for (const [i, m] of plan.mines.entries()) {
    objects.push({ kind: 'mine', id: `mine-${i}`, at: m.at, resource: m.resource });
  }
  for (const [i, v] of plan.villages.entries()) {
    objects.push({ kind: 'village', id: idDePueblo(i), name: v.name, at: v.at });
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
  map.objects.push(...objects);

  const towns = plan.towns.map((t) => {
    const town = createTown(t.id, t.name, t.faction, t.at, t.owner);
    // Una ciudad neutral nace guarnecida (decisión del usuario, fase 2a): hay
    // que pelear para tomarla. Y la base también: con «perder la base elimina»,
    // una base vacía hacía de cada partida una carrera a por la del rival.
    town.garrison = guarnicionInicial(t, plan.towns);
    return town;
  });
  // Los asaltantes no son objetos del mapa sino actores de la partida, así que
  // salen aparte, con un id que no comparte espacio con ningún objeto.
  const raiders = (plan.raiders ?? []).map((r, i) => ({
    id: `raider-${i}`,
    at: { ...r.at },
    troops: r.troops,
  }));
  return { map, towns, raiders };
}

// ---------------------------------------------------------------- procedural

export interface ProceduralOptions {
  readonly width?: number;
  readonly height?: number;
  readonly factions?: readonly [FactionId, FactionId];
  readonly monsterCount?: number;
  readonly resourceCount?: number;
}

/** Intentos del generador antes de rendirse diciéndolo. */
const INTENTOS_DE_RED = 20;

/**
 * Mapa de nodos de dos jugadores. Es el respaldo cuando no hay agente y el
 * ejemplo de referencia de qué forma debe tener un plan.
 *
 * **Voronoi con semillas en espejo**, que es la opción B del plan y la que se
 * midió: cada semilla es una región, las fronteras entre celdas se levantan
 * como cordillera de una casilla, y cada pareja de regiones vecinas tiene un
 * paso en mitad de su frontera. Los cruces de Voronoi son de grado 3 por
 * naturaleza, que es donde van las ciudades neutrales, y el grafo de regiones
 * no es un árbol —con muros rectos de BSP sí lo era, y había un solo camino de
 * la base a cada ciudad—.
 *
 * El espejo de las **semillas** es exacto y el de los **muros** no: un muro de
 * una casilla no se puede reflejar sin abrir huecos (se midió: 75 % de fugas).
 * Así que el equilibrio no se pide por simetría sino por **perfil**: las dos
 * bases tienen que tener sus dos ciudades más cercanas a los mismos saltos, y
 * la más cercana a dos como mucho. Si un intento no lo cumple se tira otro con
 * el mismo `rng`, y tras `INTENTOS_DE_RED` se lanza: medido en 200 semillas, la
 * mediana es 0 reintentos y el máximo 4.
 *
 * La red de cada intento la lee `estructura` y la valida `problemasDeRed`, las
 * mismas que leen y validan cualquier plan: el generador no lleva una segunda
 * implementación de qué es una región. Y los **dos caminos disjuntos** de cada
 * base a sus ciudades cercanas —lo de «aislar es posible pero no trivial»— no
 * se comprueban aquí: había un bucle que lo hacía y en 1 050 planes no rechazó
 * ninguno, porque el dual de Voronoi ya lo da. Lo vigila, y muerde, la
 * auditoría de `test/regiones.test.ts`.
 */
export function generateMapPlan(rng: Rng, opts: ProceduralOptions = {}): MapPlan {
  const width = opts.width ?? LADO_DEL_MAPA;
  const height = opts.height ?? LADO_DEL_MAPA;
  for (let intento = 0; intento < INTENTOS_DE_RED; intento++) {
    const plan = intentarRed(rng, width, height, opts);
    if (plan !== null) return plan;
  }
  throw new Error(
    `no sale un mapa de nodos de ${width}×${height} en ${INTENTOS_DE_RED} intentos: el generador no sabe repartir regiones equilibradas en ese tamaño`,
  );
}

const NOMBRES_DE_REGION = [
  'Llanos del Cierzo',
  'Valle Hondo',
  'Robledal',
  'Páramo Gris',
  'Vega del Molino',
  'Hoya de los Cuervos',
  'Campos de Ceniza',
  'Sierra Baja',
  'Navas del Rey',
  'Pinar Viejo',
  'Cañada Real',
  'Tierra Quemada',
  'Marjal',
  'Altozano',
  'Hondonada',
  'Encinar',
];
const NOMBRES_DE_CIUDAD = [
  'Torreblanca',
  'Puenteroto',
  'Alcázar Hondo',
  'Peñagrís',
  'Castroviejo',
  'Fuenteseca',
  'Monteluz',
  'Valdefrío',
];
const NOMBRES_DE_PUEBLO = [
  'Aldea del Pozo',
  'Villarrasa',
  'Las Ventas',
  'Molinos',
  'Cabañas',
  'El Soto',
  'Quintana',
  'Hontanar',
];
/** Un nombre de la lista, y si se acaba, el mismo con número: nunca dos iguales. */
const nombre = (lista: readonly string[], i: number): string =>
  i < lista.length
    ? (lista[i] as string)
    : `${lista[i % lista.length]} ${Math.floor(i / lista.length) + 1}`;

/** El terreno de cada pareja de regiones que no es la de casa. */
const SUELOS: readonly TerrainKind[] = ['grass', 'rough', 'snow', 'swamp', 'sand', 'lava'];

/** Distancia mínima (Chebyshev) entre dos semillas: por debajo, las regiones salen raquíticas. */
const SEPARACION_DE_SEMILLAS = 6;
/** Una región más pequeña que esto no tiene sitio para lo que se le reparte. */
const REGION_MINIMA = 10;

/** Un intento de red: el plan si sale equilibrado, `null` si no. */
function intentarRed(rng: Rng, W: number, H: number, opts: ProceduralOptions): MapPlan | null {
  const [f0, f1] = opts.factions ?? (['knight', 'necromancer'] as const);
  const cheb = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const espejo = (p: Point): Point => ({ x: W - 1 - p.x, y: H - 1 - p.y });
  const punto = (i: number): Point => aPunto(i, W);

  // 1. Semillas: las dos de casa en las esquinas y el resto por parejas en espejo.
  //    Las semillas 2k y 2k+1 son siempre espejo la una de la otra.
  const semillas: Point[] = [
    { x: 3, y: 3 },
    { x: W - 4, y: H - 4 },
  ];
  const pares = Math.max(2, Math.round((W * H) / 144));
  for (let guarda = 0; semillas.length < 2 + pares * 2 && guarda < 1000; guarda++) {
    const p = { x: rng.int(1, W - 2), y: rng.int(1, H - 2) };
    const m = espejo(p);
    if (cheb(p, m) < SEPARACION_DE_SEMILLAS) continue;
    if (
      semillas.some(
        (s) => cheb(s, p) < SEPARACION_DE_SEMILLAS || cheb(s, m) < SEPARACION_DE_SEMILLAS,
      )
    )
      continue;
    semillas.push(p, m);
  }

  // 2. Cada casilla, de la semilla más cercana (empate: la de índice menor).
  const etiqueta = new Int32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let mejor = 0;
      let mejorD = -1;
      for (const [k, s] of semillas.entries()) {
        const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
        if (mejorD === -1 || d < mejorD) {
          mejorD = d;
          mejor = k;
        }
      }
      etiqueta[y * W + x] = mejor;
    }
  }

  // 3. Muro: la casilla con alguna vecina de etiqueta menor. Así dos casillas
  //    abiertas de regiones distintas no pueden ser vecinas —la de etiqueta
  //    mayor sería muro—, que es justo lo que hace falta en 8-vecindad.
  const muro = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const { x, y } = punto(i);
    for (const [dx, dy] of VECINAS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if ((etiqueta[ny * W + nx] as number) < (etiqueta[i] as number)) {
        muro[i] = 1;
        break;
      }
    }
  }
  for (const s of semillas) if (muro[s.y * W + s.x] === 1) return null;

  // 4. El mapa provisional, todavía sin nodos, y su red: la lee `estructura`,
  //    la misma que leerá la partida, y no una copia del generador. Una
  //    etiqueta partida en dos trozos deja uno sin semilla, que sale de la red
  //    como casilla abierta sin región.
  const regions = semillas.map((s, k) => ({ id: `region-${k}`, name: nombreDeRegion(k), at: s }));
  const sinNodos: GameMap = { ...createEmptyMap(W, H, 'grass'), regions };
  for (let i = 0; i < W * H; i++) if (muro[i] === 1) sinNodos.terrain[i] = 'mountain';
  const regionDe = estructura(sinNodos).regionDe;
  const tamaño = new Int32Array(semillas.length);
  for (let i = 0; i < W * H; i++) {
    if (muro[i] === 1) continue;
    const r = regionDe[i] as number;
    if (r === -1) return null;
    tamaño[r]! += 1;
  }
  if (tamaño.some((t) => t < REGION_MINIMA)) return null;

  // 5. Candidatas a nodo: casillas de muro que tocan dos regiones abiertas o más.
  const cruces: number[] = [];
  const porPareja = new Map<string, number[]>();
  for (let i = 0; i < W * H; i++) {
    if (muro[i] === 0) continue;
    const r = regionesQueToca(W, H, regionDe, punto(i));
    if (r.length >= 3) cruces.push(i);
    if (r.length === 2) {
      const clave = `${r[0]}-${r[1]}`;
      const lista = porPareja.get(clave) ?? [];
      lista.push(i);
      porPareja.set(clave, lista);
    }
  }
  const nodos: number[] = [];
  const cerca = (i: number, d: number): boolean => nodos.some((n) => cheb(punto(n), punto(i)) <= d);
  // Las ciudades, en los cruces y separadas: dos casillas de un mismo cruce son
  // la misma ciudad. Van primero, así que sus índices de nodo son 0..n−1 y en
  // el orden de sus casillas.
  for (const c of cruces) {
    if (cerca(c, 2)) continue;
    nodos.push(c);
  }
  const ciudades = nodos.length;
  // Un paso por pareja de regiones vecinas, en el medio de su frontera, salvo
  // que caiga pegado a otro nodo: dos nodos vecinos no valen (`problemasDeRed`).
  for (const lista of porPareja.values()) {
    const n = lista[Math.floor(lista.length / 2)] as number;
    if (cerca(n, 1)) continue;
    nodos.push(n);
  }

  // 6. La red con sus nodos se valida con la misma comprobación que cualquier
  //    plan (`problemasDeRed`): región sin nodo, región inalcanzable. Lo que
  //    devuelve `estructura` usa como índice de nodo el de `nodos`.
  const conNodos: GameMap = {
    ...sinNodos,
    objects: nodos.map((n, k) => ({ kind: 'node', id: `n${k}`, at: punto(n), owner: null })),
  };
  if (problemasDeRed(conNodos).length > 0) return null;
  const red = estructura(conNodos);

  // Las bases: el nodo de la región de casa más cercano a su esquina.
  const base = (casa: number, esquina: Point): number | null => {
    let mejor: number | null = null;
    let mejorD = -1;
    for (const n of red.regiones[casa]?.nodos ?? []) {
      const p = red.nodos[n]?.at as Point;
      const d = (p.x - esquina.x) * (p.x - esquina.x) + (p.y - esquina.y) * (p.y - esquina.y);
      if (mejorD === -1 || d < mejorD) {
        mejorD = d;
        mejor = n;
      }
    }
    return mejor;
  };
  const b0 = base(0, { x: 2, y: 2 });
  const b1 = base(1, { x: W - 3, y: H - 3 });
  if (b0 === null || b1 === null || b0 === b1) return null;
  // Los cruces que no son base: las ciudades neutrales.
  const cruceros = Array.from({ length: ciudades }, (_, k) => k).filter(
    (c) => c !== b0 && c !== b1,
  );
  if (cruceros.length < 2) return null;

  // 7. Equilibrio por perfil: las dos bases, con sus dos ciudades más cercanas
  //    a los mismos saltos, y la más cercana a dos como mucho. Los saltos se
  //    cuentan una vez por base. Los dos caminos disjuntos a cada una no se
  //    comprueban aquí: medido en 1 050 planes, el dual de Voronoi los da
  //    siempre, y quien los vigila —y sí muerde— es la auditoría de
  //    `test/regiones.test.ts`.
  const d0 = saltosDesde(red, b0);
  const d1 = saltosDesde(red, b1);
  const cercanas = (d: ReadonlyMap<number, number>): { c: number; d: number }[] =>
    cruceros
      .map((c) => ({ c, d: d.get(c) ?? 99 }))
      .sort((a, b2) => a.d - b2.d || a.c - b2.c)
      .slice(0, 2);
  const c0 = cercanas(d0);
  const c1 = cercanas(d1);
  if (c0.map((x) => x.d).join() !== c1.map((x) => x.d).join()) return null;
  if ((c0[0]?.d ?? 99) > 2) return null;

  // Cada cruce que no es base es una ciudad neutral. Hubo un límite —solo las
  // dos más cercanas a cada base— puesto cuando la derrota la decidía otra
  // regla; con «perder la base elimina» se volvió a medir sin él (1 000
  // semillas, 01-10-2026): 0 sin terminar, mediana 4 días, p90 7, máximo 20,
  // lo mismo que con el límite. Sobraba y se quitó.
  const neutrales = cruceros;

  // ---- A partir de aquí la red es buena: se viste.

  const ocupadas = new Set<number>(nodos);
  // Lo pegado a un nodo no se usa, para que nada tape la entrada a la región.
  const junto = juntoANodo(conNodos);
  // Las casillas que valen de cada región, una vez: abiertas y sin pegarse a un
  // nodo. Lo ocupado se descuenta al pedirlas.
  const candidatas: number[][] = semillas.map(() => []);
  for (let i = 0; i < W * H; i++) {
    const r = regionDe[i] as number;
    if (r !== -1 && junto[i] === 0) candidatas[r]?.push(i);
  }
  const libres = (r: number): number[] => (candidatas[r] ?? []).filter((i) => !ocupadas.has(i));
  // Coloca algo en la región `r` y su espejo en la pareja de `r`: la misma
  // casilla reflejada si está libre y es de esa región, si no otra al azar.
  const pareja = (r: number): number => (r % 2 === 0 ? r + 1 : r - 1);
  const colocarPar = (r: number): [Point, Point] | null => {
    const lista = libres(r);
    if (lista.length === 0) return null;
    const a = rng.pick(lista);
    ocupadas.add(a);
    const m = espejo(punto(a));
    const im = m.y * W + m.x;
    let b: number;
    if (regionDe[im] === pareja(r) && !ocupadas.has(im) && junto[im] === 0) {
      b = im;
    } else {
      const otra = libres(pareja(r));
      if (otra.length === 0) return null;
      b = rng.pick(otra);
    }
    ocupadas.add(b);
    return [punto(a), punto(b)];
  };

  // Los inicios: pegados a la base, dentro de la región de casa.
  const inicio = (b: number, casa: number): Point | null => {
    const at = red.nodos[b]?.at as Point;
    for (const [dx, dy] of VECINAS) {
      const v = { x: at.x + dx, y: at.y + dy };
      if (!inBounds(sinNodos, v)) continue;
      const j = v.y * W + v.x;
      if (regionDe[j] === casa && !ocupadas.has(j)) {
        ocupadas.add(j);
        return v;
      }
    }
    return null;
  };
  const startA = inicio(b0, 0);
  const startB = inicio(b1, 1);
  if (startA === null || startB === null) return null;

  // Las regiones de cada lado: las pares son del jugador 0 y las impares su espejo.
  const ladoA = semillas.map((_, k) => k).filter((k) => k % 2 === 0);

  // Minas: dos de cada uno de los siete recursos por bando, como antes. Las
  // tres primeras —oro, madera y mineral— en la región de casa, y el resto
  // repartido por las demás regiones del bando en orden.
  const recursosMina: readonly ResourceKind[] = [
    'gold',
    'wood',
    'ore',
    'crystal',
    'gems',
    'mercury',
    'sulfur',
  ];
  const minasPorBando = [...recursosMina, ...recursosMina];
  const mines: { at: Point; resource: ResourceKind }[] = [];
  const fuera = ladoA.filter((k) => k !== 0);
  for (const [i, resource] of minasPorBando.entries()) {
    const r = i < 3 ? 0 : (fuera[(i - 3) % fuera.length] as number);
    const par = colocarPar(r);
    if (par === null) return null;
    mines.push({ at: par[0], resource }, { at: par[1], resource });
  }

  // Un pueblo en cada región que no es la de casa.
  const villages: { name: string; at: Point }[] = [];
  for (const r of fuera) {
    const par = colocarPar(r);
    if (par === null) return null;
    villages.push(
      { name: nombre(NOMBRES_DE_PUEBLO, villages.length), at: par[0] },
      { name: nombre(NOMBRES_DE_PUEBLO, villages.length + 1), at: par[1] },
    );
  }

  const monstruosPosibles = ['peasant', 'skeleton', 'zombie', 'archer', 'pikeman', 'mummy'];
  const monsters: { at: Point; creature: string; count: number }[] = [];
  const parejasDeMonstruos = Math.floor((opts.monsterCount ?? 8) / 2);
  for (let i = 0; i < parejasDeMonstruos; i++) {
    const especie = rng.pick(monstruosPosibles);
    const count = rng.int(3, CUPO_GUARNICION);
    const par = colocarPar(fuera[i % fuera.length] as number);
    if (par === null) return null;
    monsters.push(
      { at: par[0], creature: especie, count },
      { at: par[1], creature: especie, count },
    );
  }

  const recursosSueltos: ResourceKind[] = ['wood', 'ore', 'crystal', 'gems', 'mercury', 'sulfur'];
  const resources: { at: Point; resource: ResourceKind; amount: number }[] = [];
  const parejasDeRecursos = Math.floor((opts.resourceCount ?? 10) / 2);
  for (let i = 0; i < parejasDeRecursos; i++) {
    const resource = rng.pick(recursosSueltos);
    const amount = rng.int(3, 8);
    const par = colocarPar(ladoA[i % ladoA.length] as number);
    if (par === null) return null;
    resources.push({ at: par[0], resource, amount }, { at: par[1], resource, amount });
  }

  const chests: { at: Point; gold: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const gold = rng.int(500, 2000);
    const par = colocarPar(fuera[(i + 1) % fuera.length] as number);
    if (par === null) return null;
    chests.push({ at: par[0], gold }, { at: par[1], gold });
  }

  // Un grupo de asaltantes en cada región donde no empieza nadie, en espejo y
  // con la misma tropa: lo que se siembra en un lado se siembra en el otro,
  // igual que las minas. Las dos de casa se quedan sin, porque en ellas está el
  // héroe y los asaltantes no nacen donde hay alguien; las que TOCAN una base
  // sí llevan, que es la corrección del usuario al plan («No, también en
  // casa»). Va después de todo lo demás para no mover ninguna otra casilla.
  // Una región llena se queda sin grupo en vez de tirar el intento: un mapa de
  // nodos bueno no se descarta por no caber un asaltante.
  const raiders: RaiderPlaneado[] = [];
  for (let k = 2; k < semillas.length; k += 2) {
    const troops = rng.pick(ASALTANTES.composiciones);
    const par = colocarPar(k);
    if (par === null) continue;
    raiders.push({ at: par[0], troops }, { at: par[1], troops });
  }

  // Los muros, por tramos de fila. Las casillas de nodo van dentro del tramo y
  // `buildMap` las abre: es la regla declarada, y así el muro se lee entero.
  const walls: PlannedWall[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (muro[y * W + x] === 0) continue;
      let fin = x;
      while (fin + 1 < W && muro[y * W + fin + 1] === 1) fin++;
      walls.push({ terrain: 'mountain', from: { x, y }, to: { x: fin, y } });
      x = fin;
    }
  }

  // Un suelo por pareja de regiones, en espejo; las de casa, de tierra.
  const patches: TerrainPatch[] = [];
  for (let k = 0; k < semillas.length; k += 2) {
    const terrain: TerrainKind = k === 0 ? 'dirt' : rng.pick(SUELOS);
    for (const s of [semillas[k] as Point, semillas[k + 1] as Point]) {
      patches.push({ terrain, center: s, radius: 3 });
    }
  }

  // Cada ciudad neutral, de la facción del bando que la tiene más cerca.
  const en = (k: number): Point => red.nodos[k]?.at as Point;
  const towns: PlannedTown[] = [
    { id: 'town-0', name: 'Valdeluz', faction: f0, at: en(b0), owner: 0 },
    { id: 'town-1', name: 'Cripta Gris', faction: f1, at: en(b1), owner: 1 },
    ...neutrales.map((c, i) => ({
      id: `town-${i + 2}`,
      name: nombre(NOMBRES_DE_CIUDAD, i),
      faction: (d0.get(c) ?? 99) <= (d1.get(c) ?? 99) ? f0 : f1,
      at: en(c),
      owner: null,
    })),
  ];
  const ciudadesEnNodo = new Set([b0, b1, ...neutrales]);

  return {
    width: W,
    height: H,
    baseTerrain: 'grass',
    patches,
    regions,
    walls,
    nodes: nodos.flatMap((_, k) => (ciudadesEnNodo.has(k) ? [] : [en(k)])),
    towns,
    heroStarts: [
      { player: 0, at: startA },
      { player: 1, at: startB },
    ],
    mines,
    villages,
    resources,
    monsters,
    chests,
    raiders,
  };
}

/** El nombre de la región `k` del generador: las dos de casa, por su ciudad. */
function nombreDeRegion(k: number): string {
  if (k === 0) return 'Tierras de Valdeluz';
  if (k === 1) return 'Tierras de Cripta Gris';
  return nombre(NOMBRES_DE_REGION, k - 2);
}

/** Saltos de nodo a nodo pasando por regiones, desde `desde`. */
function saltosDesde(red: Estructura, desde: number): Map<number, number> {
  const dist = new Map<number, number>([[desde, 0]]);
  const cola = [desde];
  const regionVista = new Set<number>();
  for (let q = 0; q < cola.length; q++) {
    const n = cola[q] as number;
    for (const r of red.nodos[n]?.regiones ?? []) {
      if (regionVista.has(r)) continue;
      regionVista.add(r);
      for (const m of red.regiones[r]?.nodos ?? []) {
        if (dist.has(m)) continue;
        dist.set(m, (dist.get(n) as number) + 1);
        cola.push(m);
      }
    }
  }
  return dist;
}
