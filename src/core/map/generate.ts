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
  RedDeCaminos,
  type TramoDeCamino,
  tramosDeCasillas,
} from './map.js';
import {
  aPunto,
  type Estructura,
  estructura,
  juntoANodo,
  problemasDeRed,
  regionesQueToca,
  rellenar,
  territorio,
  VECINAS,
  vecindad,
} from './regiones.js';
import {
  BARRERAS,
  type Barrera,
  esBarrera,
  isWalkable,
  SUELOS_PISABLES,
  type Suelo,
  type TerrainKind,
} from './terrain.js';
import {
  barreraDe,
  conEjePleno,
  engordarFronteras,
  espejoDe,
  parejaDe,
  ponerObstaculos,
  trazarCaminos,
} from './vestir.js';

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

/**
 * Un tramo de muro, **recto**: `from` y `to` comparten fila o columna, y se
 * pintan los dos extremos y todo lo de en medio.
 *
 * Ortogonal y no libre por una razón de 8-vecindad: un muro en diagonal de una
 * casilla de grueso deja huecos de esquina por los que se cuela un héroe en
 * diagonal. Con tramos rectos ese hueco no se puede escribir.
 */
export interface PlannedWall {
  readonly terrain: Barrera;
  readonly from: Point;
  readonly to: Point;
}

/**
 * Una región tal como la declara un plan: la de la red (`MapRegion`) y, si se
 * quiere, **el suelo entero** que lleva.
 *
 * El suelo es del plan y no del mapa: `buildMap` lo pinta y no lo guarda, así
 * que `GameMap.regions` sigue siendo la red y nada más. Pintar no cambia qué se
 * pisa —solo se pinta lo pisable de la región—, de modo que la red que valida
 * `problemasDeRed` es la misma con suelo o sin él.
 */
export interface RegionPlaneada extends MapRegion {
  // El `| undefined` escrito, por lo mismo que en `roads`: el esquema lo
  // declara con `.optional()` y con `exactOptionalPropertyTypes` no casarían.
  readonly terrain?: TerrainKind | undefined;
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

/** Lo que llevan los planes de los dos productores, el agente y el procedimental. */
interface PlanComun {
  readonly width: number;
  readonly height: number;
  readonly baseTerrain: TerrainKind;
  readonly patches: readonly TerrainPatch[];
  /** Las regiones del mapa de nodos; el mapa guarda de cada una lo de `MapRegion`. */
  readonly regions: readonly RegionPlaneada[];
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
  /**
   * Los grupos de asaltantes con los que empieza la partida (`state/asaltantes.ts`).
   * Opcional, con el mismo idioma que `roads`: un plan sin ellos es válido y
   * la partida empieza sin ninguno —brotarán los lunes—.
   */
  readonly raiders?: readonly RaiderPlaneado[] | undefined;
}

/**
 * El plan del agente, el que sale de `mapPlanSchema`: los caminos como
 * **casillas**, `roads`, de las que `caminosDelPlan` deriva los tramos.
 */
export interface PlanConCasillas extends PlanComun {
  // El `| undefined` escrito no es ruido: con `exactOptionalPropertyTypes` un
  // `roads?: …` rechaza el `undefined` que produce un `.optional()` de zod.
  readonly roads?: readonly Point[] | undefined;
  readonly tramos?: undefined;
}

/**
 * El plan del procedimental: los caminos como **tramos**, tal como los traza
 * `trazarCaminos` (#153). El esquema del agente no los tiene —zod los quitaría
 * sin decir nada—, así que lo que tenga que pasar por él va antes por
 * `planDelAgente`.
 */
export interface PlanConTramos extends PlanComun {
  readonly tramos: readonly TramoDeCamino[];
  readonly roads?: undefined;
}

/**
 * Un plan de mapa, del agente o del procedimental. Sus caminos van de una de
 * las dos maneras y nunca de las dos: lo impide el tipo, no un `throw`.
 */
export type MapPlan = PlanConCasillas | PlanConTramos;

export interface BuiltMap {
  readonly map: GameMap;
  readonly towns: Town[];
  readonly raiders: Raider[];
}

/**
 * El lado del mapa que juega una partida si nadie pide otro: lo leen el
 * generador y el servidor, que antes lo copiaba a mano (`ws-server.ts`).
 *
 * **Elegido midiendo, no a ojo**, con la regla que fijó el usuario: el menor
 * lado con mediana ≥ 8 días, p90 ≤ 20 y 0 partidas sin terminar en 1 000
 * semillas. Era 28 desde «el camino cuesta» (02-10-2026); con los mapas densos
 * (03-10-2026) —fronteras de 2-3 casillas, obstáculos que bloquean, caminos y
 * `AREA_POR_REGION` de 300— el 32 se queda en mediana 7 y el **34** la cumple en
 * las dos tandas de mil (8 / 15 / 45 y 8 / 15 / 30, 0 sin terminar). Re-medido
 * tras la vuelta de simplify, que cambia el mapa de cada semilla: 8 / 15 / 22 en
 * 100 y 8 / 15 / 31 en 1 000, 0 sin terminar; el 32 sigue en mediana 7. La
 * tabla de cada lado está en `CLAUDE.md`, y cómo se mide en `tools/qa/tamanos.ts`.
 */
export const LADO_DEL_MAPA = 34;

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
    if (!esBarrera(m.terrain)) {
      problemas.push(`${tramo} es de "${m.terrain}": un muro es ${BARRERAS.join(', ')}`);
    }
  }

  // El suelo de una región se pisa: una barrera ahí no la «pinta», la borraría,
  // y eso es un muro, que va en `walls`.
  for (const r of plan.regions) {
    if (r.terrain === undefined) continue;
    // Contra la lista y no con `isWalkable`, que dice que sí a lo que no es
    // barrera: un `"ice"` inventado pasaba y `buildMap` pintaba un terreno que
    // nadie sabe leer (QA de «mapas densos», vuelta 2, N3).
    if (esBarrera(r.terrain)) {
      problemas.push(
        `la región "${r.id}" pide de suelo "${r.terrain}", que no se pisa: el suelo de una región es uno de ${SUELOS_PISABLES.join(', ')}, y las barreras van en "walls"`,
      );
    } else if (!(SUELOS_PISABLES as readonly string[]).includes(r.terrain)) {
      problemas.push(
        `la región "${r.id}" pide de suelo "${r.terrain}", que no es ningún terreno: el suelo de una región es uno de ${SUELOS_PISABLES.join(', ')}`,
      );
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

  // Un camino fuera del mapa no se puede construir (`RedDeCaminos` lanza), y
  // el agente recibe todas las clases de problema de una vez (N4): con alguno
  // fuera, lo demás se mira en el mapa sin caminos, que tiene el mismo terreno.
  const caminosFuera = casillasDelPlan(plan).filter((p) => !inBounds(plan, p));
  const { roads: _roads, tramos: _tramos, ...sinCaminos } = plan;
  const { map, towns } = buildMap(caminosFuera.length === 0 ? plan : sinCaminos);

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
  // Un camino tampoco: `map.ts` no lo abre —la barrera sigue sin pisarse—, pero
  // el cliente lo pinta encima, y una carretera sobre un acantilado le dice a
  // quien mira, y al agente, que por ahí se pasa. Se aceptaba en silencio (QA de
  // «mapas densos», H4). Y uno fuera del mapa se tiraba sin decirlo.
  // Agrupados: un plan con 500 caminos fuera del mapa devolvía 500 frases, y el
  // agente las recibe todas en su rechazo (QA de «mapas densos», vuelta 2, N4).
  const caminosSobreBarrera: { p: Point; terreno: TerrainKind }[] = [];
  for (const p of casillasDelPlan(plan)) {
    if (!inBounds(plan, p)) continue;
    const terreno = map.terrain[p.y * map.width + p.x] as TerrainKind;
    if (!isWalkable(terreno)) caminosSobreBarrera.push({ p, terreno });
  }
  const [unoSobre] = caminosSobreBarrera;
  if (caminosSobreBarrera.length === 1 && unoSobre !== undefined) {
    problemas.push(
      `el camino de (${unoSobre.p.x},${unoSobre.p.y}) cae sobre ${unoSobre.terreno}: un camino solo va por casillas que se pisan`,
    );
  } else if (caminosSobreBarrera.length > 1) {
    problemas.push(
      `${caminosSobreBarrera.length} casillas de camino caen sobre una barrera —${enumerarCasillas(caminosSobreBarrera.map(({ p, terreno }) => `(${p.x},${p.y}) sobre ${terreno}`))}—: un camino solo va por casillas que se pisan`,
    );
  }
  const [unoFuera] = caminosFuera;
  if (caminosFuera.length === 1 && unoFuera !== undefined) {
    problemas.push(`el camino de (${unoFuera.x},${unoFuera.y}) se sale del mapa`);
  } else if (caminosFuera.length > 1) {
    problemas.push(
      `${caminosFuera.length} casillas de camino se salen del mapa: ${enumerarCasillas(caminosFuera.map((p) => `(${p.x},${p.y})`))}`,
    );
  }
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

/** Las primeras casillas de una lista larga y cuántas quedan: la frase no crece con el plan. */
const CASILLAS_QUE_SE_NOMBRAN = 5;
function enumerarCasillas(casillas: readonly string[]): string {
  const nombradas = casillas.slice(0, CASILLAS_QUE_SE_NOMBRAN).join(', ');
  const resto = casillas.length - CASILLAS_QUE_SE_NOMBRAN;
  return resto > 0 ? `${nombradas} y ${resto} más` : nombradas;
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

/**
 * Las casillas de camino de un plan, las escriba quien las escriba: las de
 * `roads` (el agente) o los extremos de `tramos` (el procedimental). Es lo que
 * valida `validateMapPlan`, con el mismo texto para los dos.
 */
function casillasDelPlan(plan: MapPlan): readonly Point[] {
  return plan.tramos !== undefined ? plan.tramos.flat() : (plan.roads ?? []);
}

/**
 * **La puerta** de los caminos de un plan al mapa (#153). El procedimental trae
 * sus tramos y van tal cual; el agente escribe casillas y sus tramos los deriva
 * `tramosDeCasillas`, con la regla con la que siempre se le pintaron. Lanza con
 * una casilla fuera del mapa (`RedDeCaminos`): `validateMapPlan` la rechaza
 * antes de construir nada.
 */
export function caminosDelPlan(plan: MapPlan): RedDeCaminos {
  const { width, height } = plan;
  if (plan.tramos !== undefined) return RedDeCaminos.desdeTramos(plan.tramos, width, height);
  const { tramos, sueltas } = tramosDeCasillas(plan.roads ?? [], width, height);
  return RedDeCaminos.desdeTramos(tramos, width, height, sueltas);
}

/**
 * El plan procedimental escrito como lo escribe el agente: los caminos como
 * casillas. Es **la única conversión** de uno a otro, y la necesita quien hace
 * pasar un plan del generador por `mapPlanSchema` (la política de `pnpm qa`):
 * zod quita `tramos` sin decir nada y el mapa saldría sin un camino. Las
 * casillas son las de la red de los tramos; sus tramos, al construirlo, los
 * vuelve a derivar `tramosDeCasillas` con la regla de adyacencia del agente.
 */
export function planDelAgente(plan: PlanConTramos): PlanConCasillas {
  const { tramos: _, ...comun } = plan;
  const red = caminosDelPlan(plan);
  return { ...comun, roads: red.indices.map((i) => aPunto(i, plan.width)) };
}

export function buildMap(plan: MapPlan): BuiltMap {
  const base = createEmptyMap(plan.width, plan.height, plan.baseTerrain);
  // De cada región, lo de la red: el suelo se pinta aquí abajo y no se guarda.
  const map: GameMap = {
    ...base,
    regions: plan.regions.map((r) => ({ id: r.id, name: r.name, at: { ...r.at } })),
    caminos: caminosDelPlan(plan),
  };
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

  pintarSuelosDeRegion(map, plan);

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

/**
 * El suelo entero de cada región que lo declara: un relleno 8-conexo desde su
 * casilla por lo pisable que no es nodo, que es exactamente la definición de
 * región de `regiones.ts`. Va después de abrir los nodos y no pinta ninguno, así
 * que lo que se pisa no cambia y la red tampoco: solo el color del suelo.
 *
 * Una región declarada sobre un muro no pinta nada, y no se calla: la rechaza
 * `problemasDeRed` al validar, que es quien sabe decir por qué.
 */
function pintarSuelosDeRegion(map: GameMap, plan: MapPlan): void {
  const W = map.width;
  const esNodo = new Uint8Array(W * map.height);
  for (const p of [...plan.nodes, ...plan.towns.map((t) => t.at)]) {
    if (inBounds(map, p)) esNodo[p.y * W + p.x] = 1;
  }
  const libre = (i: number): boolean =>
    esNodo[i] === 0 && isWalkable(map.terrain[i] as TerrainKind);
  // Una marca compartida por todas las regiones: dos regiones distintas no se
  // tocan sin nodo, así que un relleno nunca entra en lo pintado por otro.
  const visto = new Uint8Array(W * map.height);
  for (const r of plan.regions) {
    const suelo = r.terrain;
    if (suelo === undefined || !inBounds(map, r.at)) continue;
    const origen = r.at.y * W + r.at.x;
    if (visto[origen] === 1 || !libre(origen)) continue;
    visto[origen] = 1;
    const toma = (j: number): boolean => {
      if (visto[j] === 1 || !libre(j)) return false;
      visto[j] = 1;
      return true;
    };
    for (const i of rellenar(W, map.height, origen, toma)) map.terrain[i] = suelo;
  }
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
 * Redes finas que se trazan antes de rendirse diciéndolo. Mide solo la red: el
 * vestido tiene sus propios intentos sobre cada una. Se exporta para que el
 * test del mensaje de error no lleve la cifra escrita.
 */
export const INTENTOS_DE_RED = 30;
/**
 * Vestidos que se prueban sobre una misma red fina ya validada antes de tirarla.
 * Un vestido que falla —unos suelos que no admiten cuatro barreras, un engorde
 * que parte una región, unos obstáculos que no caben— no dice nada malo de la
 * red, y tirarla con él era pagar otra vez el Voronoi, los nodos y el perfil.
 */
const INTENTOS_DE_VESTIDO = 10;

/**
 * Mapa de nodos de dos jugadores. Es el respaldo cuando no hay agente y el
 * ejemplo de referencia de qué forma debe tener un plan.
 *
 * **Voronoi con semillas en espejo**, que es la opción B del plan y la que se
 * midió: cada semilla es una región, las fronteras entre celdas se trazan como
 * un muro fino de una casilla, y cada pareja de regiones vecinas tiene un paso
 * en mitad de su frontera. Los cruces de Voronoi son de grado 3 por naturaleza,
 * que es donde van las ciudades neutrales, y el grafo de regiones no es un
 * árbol —con muros rectos de BSP sí lo era, y había un solo camino de la base a
 * cada ciudad—.
 *
 * **Esa red fina se valida y solo después se viste** (`vestir.ts`, mapas densos,
 * 03-10-2026): la frontera engorda a 2-3 casillas con su barrera según los
 * suelos, cada región lleva su suelo entero, obstáculos que bloquean y caminos.
 * Vestir solo convierte casillas pisables en barrera, que nunca abre un paso, y
 * el grafo de regiones y nodos que validó el perfil es el mismo. El nodo queda
 * en un estrechamiento de una casilla, y es la única excepción al grosor.
 *
 * El espejo de las **semillas** es exacto y el de los **muros** no: un muro de
 * una casilla no se puede reflejar sin abrir huecos (se midió: 75 % de fugas);
 * el engorde y los obstáculos van en espejo cuando el reflejo vale.
 * Así que el equilibrio no se pide por simetría sino por **perfil**: las dos
 * bases tienen que tener sus dos ciudades más cercanas a los mismos saltos, y
 * la más cercana a dos como mucho. Si una red no lo cumple se traza otra con
 * el mismo `rng`, y tras `INTENTOS_DE_RED` se lanza diciendo en qué fase se
 * agotaron los intentos.
 *
 * **Un vestido que falla no tira la red**: se vuelve a vestir la misma hasta
 * `INTENTOS_DE_VESTIDO` veces. Medido (03-10-2026, 200 semillas por lado de 24
 * a 48): ninguna semilla necesita más de 14 redes (24×24; 5 o menos de 28 en
 * adelante), y de las redes equilibradas, entre el 49 y el 81 % se visten a la
 * primera y entre el 86 y el 96 % en diez intentos. Unas pocas (1-12 de 200) no
 * se visten ni en cien —los suelos sorteados no son lo que falla, es la forma
 * de la red—, y para esas es mejor otra red que insistir. Con 20 y 10, 0 planes
 * sin salir en ningún lado. Con el engorde casilla a casilla de #169
 * (07-10-2026) el vestido falla más en 24×24, y con 20 redes no salían 18 de
 * 2 000; con 30, 1 (eran 9 antes de #169). En 34×34 y 48×48, 0 con las dos.
 * Medido otra vez el 07-10-2026 con el veto de bajo las diagonales (#166 H10):
 * 2 de 2 000 en 24×24 (la 395 y la 1 062; sin el veto, 0), 0 de 2 000 en
 * 34×34, que es el lado del juego, y 0 de 200 en 48×48.
 *
 * La red de cada intento la lee `estructura` y la valida `problemasDeRed`, las
 * mismas que leen y validan cualquier plan: el generador no lleva una segunda
 * implementación de qué es una región. Y los **dos caminos disjuntos** de cada
 * base a sus ciudades cercanas —lo de «aislar es posible pero no trivial»— no
 * se comprueban aquí: había un bucle que lo hacía y en 1 050 planes no rechazó
 * ninguno, porque el dual de Voronoi ya lo da. Lo vigila, y muerde, la
 * auditoría de `test/regiones.test.ts`. El plan que sale pasa además entero por
 * `validateMapPlan` (`validadoPorLaPuerta`): el procedimental no entrega nada
 * que la puerta del agente rechace.
 */
export function generateMapPlan(rng: Rng, opts: ProceduralOptions = {}): PlanConTramos {
  const width = opts.width ?? LADO_DEL_MAPA;
  const height = opts.height ?? LADO_DEL_MAPA;
  let redesMalas = 0;
  const fallos: Record<FaseDelVestido, { veces: number; ultimo: string }> = {
    fronteras: { veces: 0, ultimo: '' },
    objetos: { veces: 0, ultimo: '' },
    obstáculos: { veces: 0, ultimo: '' },
  };
  for (let intento = 0; intento < INTENTOS_DE_RED; intento++) {
    const red = intentarRed(rng, width, height);
    if (red === null) {
      redesMalas++;
      continue;
    }
    for (let vestido = 0; vestido < INTENTOS_DE_VESTIDO; vestido++) {
      const plan = vestirRed(rng, red, opts);
      if (!('fase' in plan)) return validadoPorLaPuerta(plan);
      fallos[plan.fase].veces++;
      fallos[plan.fase].ultimo = plan.motivo;
    }
  }
  const vestidos = FASES_DEL_VESTIDO.filter((fase) => fallos[fase].veces > 0).map(
    (fase) => `${fallos[fase].veces} en ${fase} (la última: ${fallos[fase].ultimo})`,
  );
  throw new Error(
    `no sale un mapa de nodos de ${width}×${height} en ${INTENTOS_DE_RED} redes: ` +
      `${redesMalas} no salieron equilibradas` +
      (vestidos.length > 0
        ? `, y las otras no se dejaron vestir en ${INTENTOS_DE_VESTIDO} intentos cada una: ${vestidos.join('; ')}`
        : ''),
  );
}

/**
 * El plan del generador pasa por la misma puerta que el del agente
 * (`validateMapPlan`) antes de entregarse. Lo que rechace es un fallo del
 * generador, no un mapa raro que se arregle con otro intento, y por eso lanza en
 * vez de reintentar: un reintento callado taparía el fallo y cambiaría la
 * partida de esa semilla sin que nadie lo viera. Sin esta puerta, 24×24 sembraba
 * un asaltante en una región con dueño (#178) y solo lo veía quien validase el
 * plan a mano. Cuesta ~1 ms por plan, frente a 11-16 de generarlo.
 */
function validadoPorLaPuerta(plan: PlanConTramos): PlanConTramos {
  const problemas = validateMapPlan(plan);
  if (problemas.length > 0) {
    throw new Error(
      `el generador ha hecho un plan de ${plan.width}×${plan.height} que validateMapPlan rechaza, y eso es un fallo del generador: ${problemas.join('; ')}`,
    );
  }
  return plan;
}

/** En qué paso del vestido se rindió un intento, para que el error final lo diga. */
const FASES_DEL_VESTIDO = ['fronteras', 'objetos', 'obstáculos'] as const;
type FaseDelVestido = (typeof FASES_DEL_VESTIDO)[number];

/** Un vestido que no vale: en qué fase y por qué. */
interface VestidoFallido {
  readonly fase: FaseDelVestido;
  readonly motivo: string;
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
const SUELOS: readonly Suelo[] = ['grass', 'rough', 'snow', 'swamp', 'sand', 'lava'];

/**
 * Casillas de mapa por región: cuántas parejas de regiones caben en un lado.
 *
 * Era 144, y con la frontera de una casilla y el suelo libre bastaba. Con
 * fronteras de 2-3 casillas, obstáculos que bloquean y los objetos de siempre,
 * las regiones de 144 se quedaban en 25-35 casillas pisables y el generador no
 * encontraba sitio: en 30 semillas de 36×36, 29 sin mapa. La palanca que eligió
 * el usuario es **dar más área**, no bajar `REGION_MINIMA` ni adelgazar la
 * frontera («los mapas actuales son muy pequeños, no hay problema por
 * agrandarlos»). Medido (03-10-2026, 30 semillas por celda): con 200 fallaban
 * 1-8 de 30; con 300, 0 de 100 en 24, 28, 32, 36, 40 y 48.
 */
const AREA_POR_REGION = 300;
/** Distancia mínima (Chebyshev) entre dos semillas: por debajo, las regiones salen raquíticas. */
const SEPARACION_DE_SEMILLAS = 6;
/** Una región más pequeña que esto no tiene sitio para lo que se le reparte. */
const REGION_MINIMA = 10;

/** Si alguna región de `regionDe` tiene menos casillas que `REGION_MINIMA`: la regla, una vez. */
function hayRegionRaquitica(regionDe: Int32Array, regiones: number): boolean {
  const tamaño = new Int32Array(regiones);
  for (const r of regionDe) if (r >= 0) tamaño[r]! += 1;
  return tamaño.some((t) => t < REGION_MINIMA);
}

/**
 * Lo que se ve delante de cada entrada de cada nodo, marcado con un 1.
 * `juntoANodo` ya veta la entrada; esto veta:
 *
 * - La casilla siguiente en cada eje, `n + 2d` en las ocho direcciones. Las
 *   ocho, y no solo las del eje que eligió el vestido, porque el eje corto y el
 *   nodo sin eje no protegen esa casilla con el pasillo, y así no hace falta
 *   saber cuál fue.
 * - La de debajo de las dos entradas diagonales del sur, `n + (±1, 2)`. La
 *   cámara mira desde el sur, así que lo que está ahí se pinta delante de la
 *   entrada y la tapa: en un puente diagonal es el estribo de abajo, y un pueblo
 *   ahí se comía la rampa (#166 H10: s49 node-12; 34 de 1 015 puentes en las
 *   semillas 1-400, todos en este desfase). Y su reflejo, `n + (±1, −2)`, que
 *   no tapa nada: `colocarPar` pone cada cosa y su espejo (giro de 180°), y un
 *   veto que no es simétrico le niega el espejo más a menudo. Medido en 1-400:
 *   con solo el del sur, lo sembrado con espejo exacto baja del 91,4 al 89,8 %
 *   y el jugador 0 gana 115 de las 200 partidas del banco (eran 93); con los
 *   dos, 91,8 % y 91.
 */
const DELANTE_DE_NODO: readonly (readonly [number, number])[] = [
  ...[-2, 0, 2].flatMap((dy) =>
    [-2, 0, 2].filter((dx) => dx !== 0 || dy !== 0).map((dx) => [dx, dy] as const),
  ),
  [-1, 2],
  [1, 2],
  [-1, -2],
  [1, -2],
];
function delanteDeNodo(W: number, H: number, nodos: readonly number[]): Uint8Array {
  const marca = new Uint8Array(W * H);
  for (const n of nodos) {
    const x = n % W;
    const y = Math.floor(n / W);
    for (const [dx, dy] of DELANTE_DE_NODO) {
      if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) marca[(y + dy) * W + x + dx] = 1;
    }
  }
  return marca;
}

/**
 * Una red fina ya validada y equilibrada: lo que el vestido necesita para
 * vestirla, tantas veces como haga falta, sin volver a trazarla.
 */
interface RedFina {
  readonly W: number;
  readonly H: number;
  readonly semillas: readonly Point[];
  readonly etiqueta: Int32Array;
  readonly muro: Uint8Array;
  /** Los nodos, por índice plano; los primeros `ciudades` son cruces. */
  readonly nodos: readonly number[];
  readonly regions: readonly MapRegion[];
  /** El mapa provisional con sus nodos como objetos. */
  readonly conNodos: GameMap;
  readonly red: Estructura;
  /** Las dos bases, como índice de nodo. */
  readonly b0: number;
  readonly b1: number;
  readonly neutrales: readonly number[];
  /** Saltos desde cada base, para la facción de cada ciudad neutral. */
  readonly d0: ReadonlyMap<number, number>;
  readonly d1: ReadonlyMap<number, number>;
  /** Los nodos que llevan camino desde cada región (`crucesConCamino`). */
  readonly conCamino: readonly (readonly number[])[];
}

/** Un intento de red fina: la red si sale válida y equilibrada, `null` si no. */
function intentarRed(rng: Rng, W: number, H: number): RedFina | null {
  const cheb = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const espejo = (p: Point): Point => ({ x: W - 1 - p.x, y: H - 1 - p.y });
  const punto = (i: number): Point => aPunto(i, W);

  // 1. Semillas: las dos de casa en las esquinas y el resto por parejas en espejo.
  //    Las semillas 2k y 2k+1 son siempre espejo la una de la otra.
  const semillas: Point[] = [
    { x: 3, y: 3 },
    { x: W - 4, y: H - 4 },
  ];
  const pares = Math.max(2, Math.round((W * H) / AREA_POR_REGION));
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
  for (let i = 0; i < W * H; i++) if (muro[i] === 0 && regionDe[i] === -1) return null;
  if (hayRegionRaquitica(regionDe, semillas.length)) return null;

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
  // que caiga a dos casillas o menos de otro nodo, igual que las ciudades. Dos
  // nodos vecinos no valen (`problemasDeRed`), y a dos casillas comparten
  // vecinas: el camino que llega a uno quedaría unido, en el dibujo, al otro.
  // La regla es del generador y no de `problemasDeRed`: los caminos del agente
  // los escribe él, y un plan con dos nodos a dos casillas es jugable.
  //
  // Del medio, el más cercano que tenga **eje pleno** (`conEjePleno`, dos
  // casillas de su región a cada lado) y no caiga junto a otro nodo: el medio a
  // secas caía a veces en un escalón del muro, sin dos vecinas opuestas, y el
  // vestido lo dejaba en esquina (119 de 12 309 nodos en 1-1000; así, 17 de 12 342).
  // Qué parejas llevan paso no cambia: si el medio cae junto a otro nodo, la
  // pareja se queda sin él, como antes. Buscar un paso lejos de ese nodo daba
  // ~1,4 pasos más por mapa (12 309 → 13 683 en 1-1000), y la densidad de
  // pasos no es cosa de #169 (decisión del coordinador). Si ninguno tiene eje,
  // el medio.
  for (const lista of porPareja.values()) {
    const medio = Math.floor(lista.length / 2);
    if (cerca(lista[medio] as number, 2)) continue;
    let elegido = -1;
    for (const [k, c] of lista.entries()) {
      if (elegido !== -1 && Math.abs(k - medio) >= Math.abs(elegido - medio)) continue;
      if (cerca(c, 2) || !conEjePleno(W, H, c, etiqueta, muro)) continue;
      elegido = k;
    }
    const n = lista[elegido === -1 ? medio : elegido] as number;
    if (cerca(n, 2)) continue;
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

  // Qué nodo lleva camino entre cada pareja de vecinas: si no hay reparto, la
  // red no vale y se traza otra, sin pagar el vestido.
  const conCamino = crucesConCamino(red, [
    { nodo: b0, casa: 0 },
    { nodo: b1, casa: 1 },
    ...neutrales.map((nodo) => ({ nodo })),
  ]);
  if (conCamino === null) return null;
  return {
    W,
    H,
    semillas,
    etiqueta,
    muro,
    nodos,
    regions,
    conNodos,
    red,
    b0,
    b1,
    neutrales,
    d0,
    d1,
    conCamino,
  };
}

/**
 * Qué nodos llevan camino desde cada región, por índice de nodo: **exactamente
 * un cruce con camino por pareja de regiones vecinas** (decisión del usuario,
 * variante B de #149). Un nodo es cruce de la pareja (a, b) si le llega camino
 * desde las dos; los demás nodos que comparten se cruzan igual, sin camino.
 *
 * Cada pareja prefiere una ciudad a un paso —una ciudad toca tres regiones, y
 * con camino desde las tres es el cruce de tres parejas con tres radios— y,
 * entre iguales, el nodo más cerca (Chebyshev) de las semillas de las dos;
 * desempata el índice. Pero una ciudad con camino desde a, b y c ya es el cruce
 * de las tres parejas y ninguna puede tener otro, así que se reparte con vuelta
 * atrás: las parejas con menos nodos comunes primero y, en cada una, el primer
 * nodo que no le dé a otra pareja un segundo cruce.
 *
 * Las ciudades con `casa` (las bases) llevan camino desde ella; toda otra
 * ciudad que no sea cruce de nada lleva un radio desde su región más cercana,
 * que no la hace cruce de nada. `null` si no hay reparto: la red se descarta
 * antes de vestirla.
 */
export function crucesConCamino(
  red: Estructura,
  ciudades: readonly { readonly nodo: number; readonly casa?: number }[],
): number[][] | null {
  const cheb = (a: Point, b: Point): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const cuesta = (n: number, regiones: readonly number[]): number =>
    regiones.reduce((t, r) => t + cheb(red.nodos[n]?.at as Point, red.regiones[r]?.at as Point), 0);
  const pareja = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const esCiudad = new Set(ciudades.map((c) => c.nodo));

  /** Desde qué regiones llega el camino a cada nodo. */
  const llegaDesde = new Map<number, ReadonlySet<number>>();
  for (const { nodo, casa } of ciudades) {
    if (casa === undefined) continue;
    if (!(red.nodos[nodo]?.regiones ?? []).includes(casa)) {
      throw new Error(`la base del nodo ${nodo} no toca su región de casa, la ${casa}`);
    }
    llegaDesde.set(nodo, new Set([casa]));
  }
  /** Las parejas que ya tienen su cruce. */
  const servida = new Set<string>();
  /** Las parejas de las que `n` pasaría a ser cruce si le llegara camino desde `a` y `b`. */
  const parejasNuevas = (n: number, a: number, b: number): string[] => {
    const ya = llegaDesde.get(n) ?? new Set<number>();
    const desde = [...new Set([...ya, a, b])].sort((x, y) => x - y);
    const nuevas: string[] = [];
    for (const [i, x] of desde.entries()) {
      for (const y of desde.slice(i + 1)) if (!(ya.has(x) && ya.has(y))) nuevas.push(pareja(x, y));
    }
    return nuevas;
  };

  const comunes = new Map<string, { a: number; b: number; nodos: number[] }>();
  for (const [n, nodo] of red.nodos.entries()) {
    for (const [i, a] of nodo.regiones.entries()) {
      for (const b of nodo.regiones.slice(i + 1)) {
        const p = comunes.get(pareja(a, b)) ?? { a: Math.min(a, b), b: Math.max(a, b), nodos: [] };
        p.nodos.push(n);
        comunes.set(pareja(a, b), p);
      }
    }
  }
  const parejas = [...comunes.values()];
  for (const p of parejas) {
    p.nodos.sort(
      (x, y) =>
        Number(esCiudad.has(y)) - Number(esCiudad.has(x)) ||
        cuesta(x, [p.a, p.b]) - cuesta(y, [p.a, p.b]) ||
        x - y,
    );
  }
  parejas.sort((p, q) => p.nodos.length - q.nodos.length || p.a - q.a || p.b - q.b);

  const repartir = (k: number): boolean => {
    const p = parejas[k];
    if (p === undefined) return true;
    if (servida.has(pareja(p.a, p.b))) return repartir(k + 1);
    for (const n of p.nodos) {
      const nuevas = parejasNuevas(n, p.a, p.b);
      if (nuevas.some((q) => servida.has(q))) continue;
      const antes = llegaDesde.get(n);
      llegaDesde.set(n, new Set([...(antes ?? []), p.a, p.b]));
      for (const q of nuevas) servida.add(q);
      if (repartir(k + 1)) return true;
      for (const q of nuevas) servida.delete(q);
      if (antes === undefined) llegaDesde.delete(n);
      else llegaDesde.set(n, antes);
    }
    return false;
  };
  if (!repartir(0)) return null;

  for (const { nodo } of ciudades) {
    if (llegaDesde.has(nodo)) continue;
    const regiones = red.nodos[nodo]?.regiones ?? [];
    const mejor = [...regiones].sort((x, y) => cuesta(nodo, [x]) - cuesta(nodo, [y]) || x - y)[0];
    if (mejor === undefined) throw new Error(`la ciudad del nodo ${nodo} no toca ninguna región`);
    llegaDesde.set(nodo, new Set([mejor]));
  }
  const lleva: number[][] = red.regiones.map(() => []);
  for (const [n, desde] of [...llegaDesde].sort((x, y) => x[0] - y[0])) {
    for (const r of desde) lleva[r]?.push(n);
  }
  return lleva;
}

/**
 * Viste una red fina (`vestir.ts`): suelos, fronteras gruesas, objetos,
 * obstáculos y caminos. Todo lo que hace convierte casillas pisables en barrera,
 * y eso nunca abre un paso. Devuelve el plan, o en qué fase y por qué este
 * vestido no vale —la red sigue valiendo, y `generateMapPlan` la vuelve a vestir—.
 */
function vestirRed(
  rng: Rng,
  fina: RedFina,
  opts: ProceduralOptions,
): PlanConTramos | VestidoFallido {
  const { W, H, semillas, etiqueta, muro, nodos, regions, conNodos, red, b0, b1 } = fina;
  const { neutrales, d0, d1 } = fina;
  const [f0, f1] = opts.factions ?? (['knight', 'necromancer'] as const);
  const N = W * H;
  const punto = (i: number): Point => aPunto(i, W);
  const indice = (p: Point): number => p.y * W + p.x;
  const fallo = (fase: FaseDelVestido, motivo: string): VestidoFallido => ({ fase, motivo });

  // 8. Un suelo por pareja de regiones, en espejo; las de casa, de tierra. Va
  //    antes que las fronteras porque la barrera de cada una sale de sus suelos.
  const suelos: Suelo[] = [];
  for (let k = 0; k < semillas.length; k += 2) {
    const suelo: Suelo = k === 0 ? 'dirt' : rng.pick(SUELOS);
    suelos[k] = suelo;
    suelos[parejaDe(k)] = suelo;
  }

  // 9. Las fronteras, gruesas y de su tipo. El mapa grueso se vuelve a validar
  //    entero: lo que se puede haber roto es una región partida o raquítica.
  const grueso = engordarFronteras({ W, H, etiqueta, muro, nodos, semillas, suelos, rng });
  if (typeof grueso === 'string') return fallo('fronteras', grueso);
  const { tipos, pasillo } = grueso;
  const regionsGruesas = regions.map((r, k) => ({ ...r, at: grueso.semillas[k] as Point }));
  // Las bases, ya con su dueño: así `territorio` dice de quién es cada región
  // el primer día, con la misma regla que la partida.
  const dueñoDeBase = new Map<string, PlayerId>([
    [red.nodos[b0]?.id as string, 0],
    [red.nodos[b1]?.id as string, 1],
  ]);
  const mapaGrueso: GameMap = {
    ...createEmptyMap(W, H, 'grass'),
    regions: regionsGruesas,
    objects: conNodos.objects.map((o) => ({ ...o, owner: dueñoDeBase.get(o.id) ?? null })),
  };
  for (let i = 0; i < N; i++) {
    const b = barreraDe(tipos, i);
    if (b !== null) mapaGrueso.terrain[i] = b;
  }
  const problemas = problemasDeRed(mapaGrueso);
  if (problemas.length > 0) return fallo('fronteras', problemas[0] as string);
  const alEmpezar = territorio({ map: mapaGrueso, towns: [], players: [] });
  const redGruesa = alEmpezar.red;
  const regionGruesa = redGruesa.regionDe;
  if (hayRegionRaquitica(regionGruesa, semillas.length)) {
    return fallo('fronteras', `alguna región se queda en menos de ${REGION_MINIMA} casillas`);
  }

  const ocupadas = new Set<number>(nodos);
  // Lo pegado a un nodo no se usa, para que nada tape la entrada a la región.
  const junto = juntoANodo(mapaGrueso);
  // Ni lo que se ve delante de una entrada (`n + 2d` y, bajo las diagonales
  // del sur, `n + (±1, 2)`, con su reflejo): una mina o un pueblo ahí se planta delante del
  // puente o del paso (#166 H10, s57 node-16 y s49 node-12). Va aparte de `juntoANodo`, que también acota la patrulla de los
  // asaltantes, y esto es solo de dónde se siembra.
  const delante = delanteDeNodo(W, H, nodos);
  // Las casillas que valen de cada región, una vez: abiertas, sin pegarse a un
  // nodo, fuera del pasillo de entrada y de su eje. Lo ocupado se descuenta al
  // pedirlas.
  const sinUsar = (i: number): boolean => junto[i] === 0 && pasillo[i] === 0 && delante[i] === 0;
  const candidatas: number[][] = semillas.map(() => []);
  for (let i = 0; i < N; i++) {
    const r = regionGruesa[i] as number;
    if (r !== -1 && sinUsar(i)) candidatas[r]?.push(i);
  }
  const libres = (r: number): number[] => (candidatas[r] ?? []).filter((i) => !ocupadas.has(i));
  // Coloca algo en la región `r` y su espejo en la pareja de `r`: la misma
  // casilla reflejada si está libre y es de esa región, si no otra al azar.
  const colocarPar = (r: number): [Point, Point] | null => {
    const lista = libres(r);
    if (lista.length === 0) return null;
    const a = rng.pick(lista);
    ocupadas.add(a);
    const im = espejoDe(a, N);
    let b: number;
    if (regionGruesa[im] === parejaDe(r) && !ocupadas.has(im) && sinUsar(im)) {
      b = im;
    } else {
      const otra = libres(parejaDe(r));
      if (otra.length === 0) return null;
      b = rng.pick(otra);
    }
    ocupadas.add(b);
    return [punto(a), punto(b)];
  };

  // Los inicios: pegados a la base, dentro de la región de casa.
  const inicio = (b: number, casa: number): Point | null => {
    const at = red.nodos[b]?.at as Point;
    const { desde, vecinas } = vecindad(W, H);
    for (let k = desde[indice(at)]!; k < desde[indice(at) + 1]!; k++) {
      const j = vecinas[k]!;
      if (regionGruesa[j] !== casa || ocupadas.has(j)) continue;
      ocupadas.add(j);
      return punto(j);
    }
    return null;
  };
  const startA = inicio(b0, 0);
  const startB = inicio(b1, 1);
  if (startA === null || startB === null) {
    return fallo('objetos', 'no queda sitio para un inicio junto a su base');
  }

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
    if (par === null) return fallo('objetos', 'no hay sitio para las minas');
    mines.push({ at: par[0], resource }, { at: par[1], resource });
  }

  // Un pueblo en cada región que no es la de casa.
  const villages: { name: string; at: Point }[] = [];
  for (const r of fuera) {
    const par = colocarPar(r);
    if (par === null) return fallo('objetos', 'no hay sitio para los pueblos');
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
    if (par === null) return fallo('objetos', 'no hay sitio para los monstruos');
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
    if (par === null) return fallo('objetos', 'no hay sitio para los recursos sueltos');
    resources.push({ at: par[0], resource, amount }, { at: par[1], resource, amount });
  }

  const chests: { at: Point; gold: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const gold = rng.int(500, 2000);
    const par = colocarPar(fuera[(i + 1) % fuera.length] as number);
    if (par === null) return fallo('objetos', 'no hay sitio para los cofres');
    chests.push({ at: par[0], gold }, { at: par[1], gold });
  }

  // Un grupo de asaltantes en cada región donde no empieza nadie, en espejo y
  // con la misma tropa: lo que se siembra en un lado se siembra en el otro,
  // igual que las minas. Las dos de casa se quedan sin, porque en ellas está el
  // héroe y los asaltantes no nacen donde hay alguien; las que TOCAN una base
  // sí llevan, que es la corrección del usuario al plan («No, también en
  // casa»). Va después de todo lo demás para no mover ninguna otra casilla.
  // Una región llena se queda sin grupo en vez de tirar el intento: un mapa de
  // nodos bueno no se descarta por no caber un asaltante. Y una con dueño
  // también, con su pareja para no romper el espejo: la de fuera cuyo único
  // nodo es una base es de ese jugador desde el primer día, y un asaltante solo
  // vive en una región sin dueño (`problemasDeAsaltantes`). La red fina la da en
  // 24×24 (semillas 469 y 3481, #178), y el plan salía inválido.
  const raiders: RaiderPlaneado[] = [];
  for (let k = 2; k < semillas.length; k += 2) {
    const dueños = [alEmpezar.dueñoDeRegion[k], alEmpezar.dueñoDeRegion[parejaDe(k)]];
    if (dueños.some((d) => d !== null)) continue;
    const troops = rng.pick(ASALTANTES.composiciones);
    const par = colocarPar(k);
    if (par === null) continue;
    raiders.push({ at: par[0], troops }, { at: par[1], troops });
  }

  // 10. Los obstáculos, con todo lo demás ya puesto: no caen sobre nada, no
  //     tocan la frontera y no dejan nada sin alcanzar desde los nodos.
  const vetadas = new Uint8Array(N);
  for (const i of ocupadas) vetadas[i] = 1;
  for (const r of regionsGruesas) vetadas[indice(r.at)] = 1;
  for (let i = 0; i < N; i++) if (junto[i] === 1 || pasillo[i] === 1) vetadas[i] = 1;
  const monstruos = new Uint8Array(N);
  for (const m of monsters) monstruos[indice(m.at)] = 1;
  const nodosDeRegion = redGruesa.regiones.map((reg) =>
    reg.nodos.map((n) => indice(redGruesa.nodos[n]?.at as Point)),
  );
  const caben = ponerObstaculos({
    W,
    H,
    tipos,
    regionDe: regionGruesa,
    regiones: semillas.length,
    suelos,
    nodosDeRegion,
    vetadas,
    monstruos,
    rng,
  });
  if (!caben) {
    return fallo('obstáculos', 'alguna región no llega a la densidad mínima de obstáculos');
  }

  // 11. Los caminos: radiales desde el centro de cada región a sus minas, sus
  //     pueblos y los nodos que le tocan en el reparto de la red.
  const objetivos = fina.conCamino.map((ks) => ks.map((k) => nodos[k] as number));
  for (const o of [...mines, ...villages]) {
    objetivos[regionGruesa[indice(o.at)] as number]?.push(indice(o.at));
  }
  const trazado = trazarCaminos({
    W,
    H,
    tipos,
    regionDe: regionGruesa,
    regiones: semillas.length,
    suelos,
    nodosDeRegion,
    objetivos,
    monstruos,
    ocupadas,
  });
  const tramos = trazado.map(([p, q]): TramoDeCamino => [punto(p), punto(q)]);

  // Los muros, por tramos de fila del mismo tipo: frontera y obstáculos juntos.
  // Las casillas de nodo van dentro del tramo y `buildMap` las abre: es la
  // regla declarada, y así el muro se lee entero.
  const walls: PlannedWall[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const terrain = barreraDe(tipos, y * W + x);
      if (terrain === null) continue;
      let fin = x;
      while (fin + 1 < W && barreraDe(tipos, y * W + fin + 1) === terrain) fin++;
      walls.push({ terrain, from: { x, y }, to: { x: fin, y } });
      x = fin;
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
    patches: [],
    // Con su suelo entero, que `buildMap` pinta casilla a casilla.
    regions: regionsGruesas.map((r, k) => ({ ...r, terrain: suelos[k] as Suelo })),
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
    tramos,
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
