/**
 * Estado de partida y bucle de turnos del mapa de aventura.
 *
 * Un turno de jugador es: mover héroes, construir en los pueblos, reclutar, y
 * pasar. Cuando todos han pasado, avanza el día; los lunes crecen las moradas.
 */
import {
  alAsalto,
  aplicarDespliegue,
  type BattleSide,
  createBattle,
  mandoDe,
} from '../battle/battle.js';
import { colocarBlocker } from '../battle/despliegue.js';
import { resumenDeBatalla } from '../battle/resumen.js';
import type { BattleHero, BattleStack, BattleState, Side } from '../battle/types.js';
import { SIDES } from '../battle/types.js';
import {
  equipoDelPortadorBlocker,
  equipoDeSerieDe,
  equipoPuestoDe,
  unidadDelJuego,
  unidadDelJuegoSiExiste,
} from '../catalogo.js';
import {
  combateBlocker,
  gruposAlTope,
  loNeutralAlTope,
  type ReglasDelCombate,
} from '../combate.js';
import {
  ECONOMIA,
  figuraDelHeroe,
  tipoDeHeroePorDefecto,
  tipoSeInfiltra,
  tiposDeHeroe,
} from '../data.js';
import { radioALaEscala } from '../escala.js';
import { problemaDeTipo, type VeteranoEnBase, veteranosEn } from '../hero/ascenso.js';
import {
  conEquipoDe,
  deDondeSale,
  destinoDeEquipo,
  equipoDe,
  idsPuestos,
  nadaEnElHueco,
  PIEZAS_DE_BOTIN,
  type Portador,
  pieza,
  piezaSiExiste,
  ponerPieza,
  puestoBlocker,
  quitarPieza,
  sacarDeLaMochila,
  seVende,
} from '../hero/equipo.js';
import {
  EXPERIENCIA_INICIAL_DE_HEROE,
  RANGO_MAXIMO_DE_TROPA,
  rangoDeHeroe,
  rangoDeTropa,
} from '../hero/experiencia.js';
import {
  cuerposDelHeroe,
  empezarElDia,
  type Hero,
  heroeRecienHecho,
  learnable,
  maxMana,
  moraleBonus,
} from '../hero/hero.js';
import { infiltracionBlocker, precioDeLaBarrera } from '../hero/infiltracion.js';
import {
  ejercitoDe,
  gruposDe,
  individuosDe,
  licenciar,
  troopsAsStacks,
  withTroops,
} from '../hero/troop.js';
import { Casillas, type CasillasLeidas, casillasDelCuadrado } from '../map/casillas.js';
import {
  barreraEn,
  blocksMovement,
  costeEnElAlcance,
  findPath,
  type GameMap,
  inBounds,
  isEnterable,
  type MapObject,
  type Mirada,
  objectAt,
  type PathStep,
  pathFromReachable,
  pointKey,
  type Reachable,
  reachableFrom,
  sePasa,
} from '../map/map.js';
import {
  objetosDeLaZona,
  regionDescubierta,
  regionesQueDescubre,
  zonaDeNiebla,
} from '../map/niebla.js';
import { muroBlocker } from '../map/recinto.js';
import { dueñoEnLaFoto, dueñosDeLaRed, estructura, regionMasCercana } from '../map/regiones.js';
import { type Barrera, NOMBRE_DE_BARRERA } from '../map/terrain.js';
import {
  batallaDe,
  type Cobro as CobroDelMundo,
  claveDeEncuentro,
  claveDeOpcion,
  daPremio,
  type Efecto,
  type EstadoDelMundo,
  esPremio,
  type Lugar,
  lugarDe,
  type Opcion,
  recordarLaConversacion,
} from '../mundo/formato.js';
import { mundoDe, opcionBlocker, opcionDe, type RefDeOpcion } from '../mundo/reglas.js';
import { createRng, type Rng } from '../rng.js';
import {
  applyWeeklyGrowth,
  build as buildInTown,
  mageGuildLevel,
  moraleFromBuildings,
  oroBlocker,
  payRecruit,
  primeraCiudadDe,
  type Town,
  tieneArmeria,
  townSpells,
} from '../town/town.js';
import type {
  Army,
  Controller,
  FactionId,
  Hex,
  PlayerId,
  Point,
  Troop,
  Veterania,
} from '../types.js';
import { enumerar, type Hueco } from '../types.js';
import {
  type AsaltanteRecordado,
  casillasPeligrosas,
  dispersados,
  dondeBrotan,
  emboscador,
  mascaraDeOcupacion,
  pasoDePatrulla,
  type Raider,
  recordarAsaltantes,
  vigiaDeLaMarcha,
} from './asaltantes.js';
import {
  currentPlayer,
  dayOfWeek,
  describePlayer,
  destinoDeRecluta,
  hayHuecoDeHeroe,
  heroById,
  heroeEnElPueblo,
  heroesOf,
  playerById,
  reclutarBlocker,
  townById,
  townsOf,
  turnBlocker,
  week,
} from './consultas.js';
import {
  type Atacante,
  type BattleFoe,
  type GameEvent,
  type GameEventDraft,
  type Ocupante,
  SE_VE_POR,
} from './events.js';
import { rentaDelDia } from './renta.js';
import {
  casillaDelSitio,
  castilloSuyoDelHeroe,
  ciudadQueMandaBlocker,
  comoEstaElSitio,
  defensaDeLaIA,
  delSitio,
  dueñoDeLaCiudad,
  dueñoDelSitio,
  ejercitoDeLaDefensa,
  enUnNodo,
  type Guarnicion,
  guarnicionDe,
  guarnicionHostil,
  heroeAjenoEn,
  idDelSitio,
  type LaDefensa,
  type LineaDeDefensa,
  laDefensa,
  laGuarnicion,
  mejorarElPuesto,
  moverTropa,
  murallaDelSitio,
  nombreDelSitio,
  objetoDelSitio,
  ocupanteDe,
  ponerLaGuarnicion,
  quitarLaGuarnicion,
  repartir,
  repartirTropa,
  type Sitio,
  type SitioVisto,
  sitioDeLaCiudad,
  sitioDelHeroe,
  sitioDelObjeto,
  sitioEn,
  sitioPorId,
} from './sitios.js';
import {
  type AdventureAction,
  type DefensaElegida,
  type Enfrentamiento,
  type GameContext,
  type GameState,
  MAX_HEROES_PER_PLAYER,
  type PendingBattle,
  type Player,
  type RememberedObject,
} from './tipos.js';

/**
 * El objeto `obj` como se ve hoy: una copia (la memoria no puede cambiar con el
 * mapa) y, de una ciudad o un pueblo, su dueño y su ocupante de ahora. La única
 * forma de apuntar un recuerdo: la leen `explorar`, `revealEverything` y lo que se
 * mira vivo (`objetosConocidos`).
 */
function recuerdoDe(state: GameState, obj: MapObject): RememberedObject {
  const recuerdo = { day: state.day, object: { ...obj } };
  if (obj.kind !== 'town' && obj.kind !== 'village') return recuerdo;
  return { ...recuerdo, sitio: comoEstaElSitio(state, sitioDelObjeto(state, obj)) };
}

/**
 * Radio de lo que un héroe mira AHORA: el 4 de fheroes2 a la escala del mapa
 * (`radioALaEscala`, #229: 5 en el 42×42).
 *
 * **Ya no explora** (regla nuestra, 02-11-2026, petición del usuario: «Añada una
 * niebla de eventos en torno a héroes y nodos controlados por el jugador. Lo que
 * pase cerca en un radio x se ve. Si no, no»): lo explorado se descubre por
 * regiones al pisarlas (`descubrir`, `core/map/niebla.ts`) y este radio es solo lo
 * que se ve pasar —héroes rivales, el estado vivo de los objetos, los grupos de
 * asaltantes y la crónica—, y solo sobre lo ya explorado (`visibleNow`). Es el
 * cuadrado y no el disco del original: 121 casillas.
 */
export const HERO_SCOUT_RADIUS = radioALaEscala(4);

/**
 * Radio de lo que un castillo **o un nodo propio** mira AHORA (regla nuestra,
 * 02-11-2026: el usuario quiere la niebla de eventos «en torno a héroes y nodos
 * controlados por el jugador», 5 para el héroe y 6 para castillos y nodos).
 *
 * El número es el 5 del castillo de fheroes2 (`GameStatic::getFogDiscoveryDistance`,
 * `CASTLE: 5`, sin ramificar por el fuerte) a la escala del mapa (#229: 6 en el
 * 42×42). Lo llevaba solo el castillo (#72: un héroe enemigo acampado pegado a tu
 * capital no producía un solo `hero_moved` que te llegara, 0 de 60 escenarios; con
 * este radio, 60 de 60); desde la niebla por regiones lo lleva también cada nodo
 * tuyo, que es donde se ve llegar al rival a tu territorio. Como el del héroe, no
 * explora: mira lo explorado (`visibleNow`).
 */
export const NODE_SCOUT_RADIUS = radioALaEscala(5);

/** Si la batalla es una emboscada: la abrió un grupo, y el emboscado es un héroe. */
function esEmboscada<T extends Enfrentamiento>(
  p: T,
): p is Extract<T, { readonly attacker: { readonly kind: 'raider' } }> {
  return p.attacker.kind === 'raider';
}

// ---------------------------------------------------------------- creación

export interface GameConfig {
  readonly seed: number;
  /**
   * El tope de días, **obligatorio**: toda partida se acaba y hay que decir
   * cuándo. Su valor por defecto lo pone `newGame`, que es la única puerta por
   * la que se crean partidas, y así el número vive en un solo sitio en vez de
   * en dos `??` que puedan divergir.
   */
  readonly maxDays: number;
  /** La complejidad del combate, **obligatoria**: la pone `newGame` (por defecto, `COMBATE_COMPLETO`). */
  readonly combate: ReglasDelCombate;
  readonly map: GameMap;
  readonly players: readonly { id: PlayerId; faction: FactionId; controller: Controller }[];
  /**
   * El héroe de salida de cada jugador, ya hecho (`newGame`). Cada uno se paga y se
   * asienta en su base por la puerta de contratar (`hireHero`), salvo el de
   * `porElegir`, que queda pendiente (`Player.heroeDeSalida`).
   */
  readonly heroes: readonly Hero[];
  /** El jugador que elige su héroe de salida en la base; ninguno si falta. */
  readonly porElegir?: PlayerId | undefined;
  readonly towns: readonly Town[];
  /** Las guarniciones con que nace cada sitio (`BuiltMap.guarniciones`); ninguna si falta. */
  readonly guarniciones?: Readonly<Record<string, Guarnicion>>;
  /** Los asaltantes con los que empieza la partida; ninguno si falta. */
  readonly raiders?: readonly Raider[];
  /** El mundo, si la partida es de uno (`GameState.mundo`). */
  readonly mundo?: EstadoDelMundo;
}

export function createGame(config: GameConfig): GameState {
  // El tope se valida AQUÍ y no solo en el borde del entorno, porque la regla es
  // del juego y no de quién la pide. `enteroDelEntorno` ya rechazaba un
  // `HEROES_MAX_DAYS=0` con una frase buena, pero `newGame({ maxDays: 0 })` —o
  // un `-5`— se aceptaba y jugaba **un día**, terminando «sin resolver» en
  // silencio: la misma regla con dos severidades según por qué puerta entres,
  // que es lo que este repositorio llama fallar callando.
  if (!Number.isInteger(config.maxDays) || config.maxDays < 1) {
    throw new Error(
      `una partida de ${config.maxDays} días no es una partida: el tope tiene que ser un entero ≥ 1`,
    );
  }
  const sinCombate = combateBlocker(config.combate);
  if (sinCombate !== null) throw new Error(`no se puede jugar ese combate: ${sinCombate}`);
  // Lo que nace sin héroe, en el tope de la partida (`loNeutralAlTope`, una copia:
  // el mapa de `config` no se toca). El mapa no depende de él —misma semilla, mismo
  // mapa—, la partida sí. Con el de siempre, nada cambia.
  const { map, towns, raiders = [], ...nacidas } = loNeutralAlTope(config, config.combate.tope);

  const players: Player[] = config.players.map((p) => ({
    id: p.id,
    faction: p.faction,
    controller: p.controller,
    oro: ECONOMIA.oroDeSalida,
    fog: Casillas.vacias(config.map),
    memory: new Map<string, RememberedObject>(),
    asaltantesVistos: new Map<string, AsaltanteRecordado>(),
    defeated: false,
    // La primera ciudad suya del mapa: el dueño con que nace una ciudad vive en su
    // objeto, en el orden de las ciudades del plan.
    base:
      primeraCiudadDe(
        config.map.objects.filter((o) => o.kind === 'town'),
        p.id,
      )?.id ?? null,
    heroeDeSalida: null,
  }));

  const state: GameState = {
    seed: config.seed,
    day: 1,
    maxDays: config.maxDays,
    combate: config.combate,
    map,
    players,
    // Los de salida entran por `hireHero`, abajo: pagados como todo héroe.
    heroes: [],
    towns: towns.map((t) => ({
      ...t,
      available: { ...t.available },
      buildings: [...t.buildings],
    })),
    // El primero del día 1 (`ordenDelDia`); `?? 0` solo para una partida sin
    // jugadores, que no juega nadie.
    current: ordenDelDia(config.players, 1)[0] ?? 0,
    pendingBattle: null,
    // Copia de un nivel, como los héroes (la hace `loNeutralAlTope`): la casilla y
    // la tropa de un grupo se SUSTITUYEN al moverse o al pelear, nunca se mutan,
    // así que no hace falta clonar lo que `buildMap` acaba de crear.
    raiders: [...raiders],
    finished: null,
    log: [],
    siguienteVeterano: 1,
    siguienteBotin: 0,
    siguienteHeroe: 1,
    // Las que nacen con el mapa (`BuiltMap.guarniciones`), copiadas: la partida las
    // cambia y el mapa no.
    guarniciones: Object.fromEntries(
      Object.entries(nacidas.guarniciones ?? {}).map(([id, g]) => [
        id,
        { dueño: g.dueño, tropa: [...g.tropa] },
      ]),
    ),
  };
  if (config.mundo !== undefined) {
    state.mundo = {
      historia: config.mundo.historia,
      estados: { ...config.mundo.estados },
      marcas: [...config.mundo.marcas],
      cobradas: { ...config.mundo.cobradas },
      vencidos: { ...config.mundo.vencidos },
      conversaciones: { ...config.mundo.conversaciones },
    };
  }

  // Los pueblos arrancan con la hornada de la primera semana.
  crecerLasMoradas(state);

  // Cada héroe de salida, pagado y asentado en su base por la puerta de todo
  // héroe, en el sitio donde antes solo se fijaban sus puntos y miraba: antes que
  // los castillos y que el primer hecho, así que la niebla y lo apuntado salen
  // en el mismo orden que cuando nacía gratis.
  for (const hero of config.heroes) {
    const player = playerById(state, hero.owner);
    player.heroeDeSalida = { ...hero, army: [...hero.army] };
    if (hero.owner === config.porElegir) continue;
    if (player.base === null) {
      throw new Error(
        `el ${describePlayer(state, player.id)} no tiene base donde asentar a su héroe de salida`,
      );
    }
    hireHero(state, player.id, player.base, hero.tipo);
  }
  for (const town of state.towns) revealAroundTown(state, town);

  emit(state, { kind: 'day_start', day: 1, week: 1, actor: null, at: null });
  // Los grupos con los que nace el mapa se cuentan igual que los que brotan un
  // lunes: la regla de quién se entera es UNA —el sello, al ocurrir— y no
  // depende de cuándo nació el grupo. Lo que no inunda la crónica de la
  // persona no es callarlos aquí, sino que el panel no pinta este hecho de
  // mapa (`renderLog`): el grupo ya se ve en el lienzo.
  for (const raider of state.raiders) contarBrote(state, raider);
  startTurn(state);
  return state;
}

/**
 * El héroe mira alrededor: descubre la región que pisa Y apunta lo que ve.
 *
 * Las dos cosas van juntas a propósito. Separarlas es exactamente el bug que
 * había: la casilla quedaba explorada para siempre y el objeto se leía del
 * estado vivo, así que el agente se enteraba de una captura ocurrida a veinte
 * casillas de su héroe más cercano.
 */
function revealAround(state: GameState, hero: Hero): void {
  const player = state.players.find((p) => p.id === hero.owner);
  if (player === undefined) return;
  descubrir(state, player, hero.at);
  mirarDesde(state, player, hero.at, HERO_SCOUT_RADIUS);
}

/**
 * El castillo mira alrededor, igual que un héroe: descubre sus regiones Y apunta.
 *
 * Se llama donde un castillo puede empezar a mirar o mirar algo nuevo: al crear
 * la partida (para TODOS los jugadores, porque solo el primero pasa por
 * `startTurn`: así cada uno empieza con las regiones de su base descubiertas), al
 * empezar el turno de su dueño y al capturarlo.
 */
function revealAroundTown(state: GameState, town: Town): void {
  const dueño = dueñoDeLaCiudad(state, town);
  if (dueño === null) return;
  const player = playerById(state, dueño);
  descubrir(state, player, town.at);
  mirarDesde(state, player, town.at, NODE_SCOUT_RADIUS);
}

/**
 * Un nodo propio mira alrededor, como un castillo (02-11-2026: la niebla de
 * eventos va «en torno a héroes y nodos controlados por el jugador»). Al empezar
 * el turno de su dueño y al tomarlo, antes de contarlo: quien lo toma ya está
 * mirando desde él.
 */
function revealAroundNode(state: GameState, nodo: Extract<MapObject, { kind: 'node' }>): void {
  if (nodo.owner === null) return;
  const player = playerById(state, nodo.owner);
  descubrir(state, player, nodo.at);
  mirarDesde(state, player, nodo.at, NODE_SCOUT_RADIUS);
}

/**
 * Descubre lo que se ve al llegar a `sitio`: **las regiones enteras** que ese
 * sitio pisa (`regionesQueDescubre`: la suya, o todas las que une un nodo, una
 * ciudad o el puente de una ciudad-puente), con su zona (`zonaDeNiebla`), y apunta
 * en `memory` cada objeto de ellas como está ahora: entrar en una región es verla
 * entera (petición del usuario, 02-11-2026). Una región ya descubierta no se toca:
 * si se volviera a apuntar, el recuerdo de sus objetos se refrescaría desde lejos.
 *
 * **El único escritor de `fog`** con `revealEverything` (lo vigila
 * `invariantes.test.ts`). Un mapa sin regiones (los de los tests de pathfinding)
 * no tiene por dónde partirse: es una sola zona, y se descubre entero.
 */
function descubrir(state: GameState, player: Player, sitio: Point): void {
  const { map } = state;
  if (map.regions.length === 0) {
    if (player.fog.size === map.width * map.height) return;
    player.fog.marcarCuadrado({ x: 0, y: 0 }, Math.max(map.width, map.height));
    for (const obj of map.objects) {
      player.memory.set(obj.id, recuerdoDe(state, obj));
    }
    return;
  }
  for (const k of regionesQueDescubre(map, sitio)) {
    if (regionDescubierta(map, player.fog, k)) continue;
    player.fog.marcarIndices(zonaDeNiebla(map, k));
    for (const obj of objetosDeLaZona(map, k)) {
      player.memory.set(obj.id, recuerdoDe(state, obj));
    }
  }
}

/**
 * Lo que se mira AHORA desde `centro`: el cuadrado de `radio` sobre lo ya
 * explorado. Refresca el recuerdo de los objetos que caen ahí y el de los grupos
 * de asaltantes (`recordarAsaltantes`). No explora: eso es `descubrir`.
 */
function mirarDesde(state: GameState, player: Player, centro: Point, radio: number): void {
  // El cuadrado se pregunta con dos restas y no con el `Set` de sus claves: era
  // el 10 % del banco (#95) levantar 81 cadenas por paso para mirar en ellas
  // la casilla de cada objeto del mapa. El orden de `memory` sigue siendo el de
  // `state.map.objects`.
  for (const obj of state.map.objects) {
    if (
      Math.abs(obj.at.x - centro.x) <= radio &&
      Math.abs(obj.at.y - centro.y) <= radio &&
      player.fog.has(obj.at)
    ) {
      player.memory.set(obj.id, recuerdoDe(state, obj));
    }
  }
  const mirando = casillasDelCuadrado(state.map, centro, radio).filter((q) => player.fog.has(q));
  recordarAsaltantes(state, player.asaltantesVistos, mirando);
}

/**
 * Le descubre el mapa entero a un jugador: explorado Y observado.
 *
 * Existe para los tests y para mirar una partida por dentro. Desde que la
 * niebla recuerda, llenar `fog` a mano ya NO basta —lo que se sabe de cada
 * objeto vive en `memory`—, y quien solo llenara `fog` vería un mapa entero y
 * vacío. Que esa trampa esté escrita una vez y no copiada en cada test es justo
 * lo que evita que la próxima copia se quede a medias.
 */
export function revealEverything(state: GameState, playerId: PlayerId): void {
  const player = playerById(state, playerId);
  player.fog.marcarCuadrado({ x: 0, y: 0 }, Math.max(state.map.width, state.map.height));
  for (const obj of state.map.objects) {
    player.memory.set(obj.id, recuerdoDe(state, obj));
  }
  recordarAsaltantes(state, player.asaltantesVistos, player.fog);
}

/**
 * Las casillas que un jugador está viendo AHORA MISMO: el radio de cada uno de
 * sus héroes, castillos y nodos (`miradasDe`), **solo sobre lo explorado**
 * (02-11-2026, decisión del usuario: nada se ve sobre el negro; un héroe rival
 * tras una cordillera de una región sin pisar no se ve aunque esté a tres
 * casillas).
 *
 * Es la otra mitad de `fog`. `fog` dice «esto lo conozco»; esto dice «esto lo
 * estoy mirando», y solo de lo que se mira se puede afirmar el presente.
 */
export function visibleNow(state: GameState, playerId: PlayerId): Casillas {
  const casillas = Casillas.vacias(state.map);
  const { fog } = playerById(state, playerId);
  for (const { centro, radio } of miradasDe(state, playerId))
    casillas.marcarCuadradoDentroDe(centro, radio, fog);
  return casillas;
}

/**
 * Desde dónde mira AHORA un jugador: cada héroe (`HERO_SCOUT_RADIUS`) y cada
 * castillo y nodo suyo (`NODE_SCOUT_RADIUS`). Es `visibleNow` sin el recorte de lo
 * explorado y sin levantar las claves.
 */
export function miradasDe(state: GameState, playerId: PlayerId): Mirada[] {
  const out: Mirada[] = [];
  for (const hero of heroesOf(state, playerId))
    out.push({ centro: hero.at, radio: HERO_SCOUT_RADIUS });
  for (const town of townsOf(state, playerId))
    out.push({ centro: town.at, radio: NODE_SCOUT_RADIUS });
  for (const obj of state.map.objects) {
    if (obj.kind === 'node' && obj.owner === playerId)
      out.push({ centro: obj.at, radio: NODE_SCOUT_RADIUS });
  }
  return out;
}

/**
 * Los héroes que ve un jugador: los suyos y los que está mirando AHORA
 * (`mirando`, que es `visibleNow`; `null` es «todos», la convención del cliente
 * para «Ver mapa entero»).
 *
 * **La única regla de qué héroe se ve**: la leen el `enemyHeroes` del agente y
 * el lienzo, el minimapa y la barra de quien juega (`Session.heroesALaVista`).
 * Un héroe se ve o no se ve, y no deja recuerdo: una posición de anteayer es
 * ruido y no intel. El lienzo pintaba con `fog` —bastaba haber pisado la casilla
 * alguna vez— y enseñaba al rival andando por medio mapa sin nadie cerca (#64).
 */
export function heroesALaVista(
  state: GameState,
  playerId: PlayerId,
  mirando: CasillasLeidas | null,
): Hero[] {
  if (mirando === null) return [...state.heroes];
  return state.heroes.filter((h) => h.owner === playerId || mirando.has(h.at));
}

/**
 * Lo que un jugador sabe de cada objeto del mapa: el objeto VIVO si está
 * mirando su casilla ahora, y si no, el RECUERDO de `memory` con el día en que
 * se vio. Solo trae lo explorado: `memory` se llena al descubrir una región
 * (`descubrir`) y al mirar desde cerca (`mirarDesde`).
 *
 * **La única regla de qué estado de un objeto se enseña**: la leen `knownObjects`
 * del agente —que pone el día como `lastSeen`— y el lienzo, el minimapa y la
 * barra de quien juega (`Session.objetosConocidos`). Así la bandera de un
 * castillo o de un nodo es la del último dueño visto, y el cofre que se llevó el
 * rival lejos sigue ahí hasta que se vuelva a mirar (#64). `mirando` a `null`
 * es «todo», vivo y de hoy.
 */
export function objetosConocidos(
  state: GameState,
  playerId: PlayerId,
  mirando: CasillasLeidas | null,
): RememberedObject[] {
  if (mirando === null) return state.map.objects.map((object) => recuerdoDe(state, object));
  const vivos = new Map(state.map.objects.map((o) => [o.id, o]));
  return [...playerById(state, playerId).memory.values()].map((recuerdo) => {
    if (!mirando.has(recuerdo.object.at)) return recuerdo;
    const vivo = vivos.get(recuerdo.object.id);
    return vivo === undefined ? { ...recuerdo, day: state.day } : recuerdoDe(state, vivo);
  });
}

/**
 * Si un jugador está mirando ahora mismo esa casilla CONCRETA.
 *
 * Es `visibleNow(state, p).has(q)` sin construir las casillas, y la
 * distinción no es celo de micro-optimización: `emit` pregunta por UNA casilla
 * por evento y por jugador, y la forma con `Set` levantaba las 81 claves del
 * cuadrado de visión —nueve por nueve— para tirarlas. De los 9 654 ns que
 * costaba responder, 7 930 eran los `pointKey` y los `Set.add`.
 *
 * Medido de dos maneras que coinciden: por perfil (`--cpu-prof` por self time,
 * 2,76 % del cómputo del barrido, que baja a 0,24 %) y por reloj, las 40
 * semillas enteras dentro del proceso y en régimen —2 106 ms con el `Set`,
 * 2 032 con el predicado: **un 3,5 %**—. Es lo que hay: una décima de segundo
 * en el barrido, nada en una partida. Se hace porque las cuatro líneas son más
 * simples que el `Set`, no porque se note al jugar.
 *
 * Lo que NO vale es una caché por turno: `hero_moved` se emite paso a paso —el
 * 56 % de los eventos— y `hero.at` cambia entre pasos, así que una caché
 * sellaría observadores equivocados.
 *
 * Poda fuera del mapa igual que `marcarCuadrado`, y por eso las dos formas son
 * equivalentes para CUALQUIER punto y no solo para los que existen. La misma
 * regla escrita dos veces es lo que este repositorio no perdona: las ata un
 * test que las compara casilla a casilla sobre una partida jugada.
 */
export function visibleNowAt(state: GameState, playerId: PlayerId, q: Point): boolean {
  if (!inBounds(state.map, q)) return false;
  // Lo que no se ha explorado no se mira, aunque caiga en el radio.
  if (!playerById(state, playerId).fog.has(q)) return false;
  // Se recorre `state.heroes` y no `heroesOf`, que filtra a un array nuevo: en
  // este camino la asignación es justo lo que se venía a quitar.
  for (const hero of state.heroes) {
    if (hero.owner !== playerId) continue;
    const dx = Math.abs(hero.at.x - q.x);
    const dy = Math.abs(hero.at.y - q.y);
    if (dx <= HERO_SCOUT_RADIUS && dy <= HERO_SCOUT_RADIUS) return true;
  }
  for (const town of state.towns) {
    // La distancia antes que el dueño: es lo barato, y casi siempre basta.
    const dx = Math.abs(town.at.x - q.x);
    const dy = Math.abs(town.at.y - q.y);
    if (dx > NODE_SCOUT_RADIUS || dy > NODE_SCOUT_RADIUS) continue;
    if (dueñoDeLaCiudad(state, town) === playerId) return true;
  }
  for (const obj of state.map.objects) {
    if (obj.kind !== 'node' || obj.owner !== playerId) continue;
    const dx = Math.abs(obj.at.x - q.x);
    const dy = Math.abs(obj.at.y - q.y);
    if (dx <= NODE_SCOUT_RADIUS && dy <= NODE_SCOUT_RADIUS) return true;
  }
  return false;
}

// ---------------------------------------------------------------- crónica

/**
 * Escribe un hecho en la crónica, sellado con quién lo estaba mirando.
 * **El único sitio que toca `state.log`.**
 *
 * El sello se pone AL OCURRIR y no al leer, y eso es la decisión de fondo: la
 * crónica es memoria, no una ventana. Recalcular al leer no era la opción
 * barata sino la imposible —el héroe muerto ya no tiene dueño a quien
 * preguntar— y encima filtraría al revés: 133 eventos por 40 semillas que no vi
 * cuando pasaron y cuya casilla hoy sí miro. Medido: el 14,8 % de los eventos
 * del rival cambia de veredicto según cuándo se evalúe.
 *
 * **Y el sello se calcula DESPUÉS de la mutación**, que es la trampa del
 * cambio: cuando se sella la muerte de un héroe, el héroe ya no está en el
 * mapa y su dueño no mira desde ninguna parte; cuando se sella una captura, el
 * castillo ya lleva la bandera nueva. A esos dos no los salva el sello, los
 * salvan las cláusulas de «siempre» de `visibleTo` — `actor` y `from`.
 *
 * Recorre `state.players` EN ORDEN, nunca la iteración de un `Set`: el `JSON`
 * de dos partidas con la misma semilla tiene que salir idéntico.
 *
 * `state.log` es de solo lectura para que «el único sitio» lo compruebe el
 * compilador; el `as` de aquí abajo es la única grieta, y está a la vista y
 * comentada en vez de repartida por diecinueve sitios.
 */
function emit(state: GameState, draft: GameEventDraft): void {
  // «`game_over` es el último hecho» es una regla del núcleo y no una
  // costumbre de los bucles: un hecho escrito después del final lanza aquí,
  // donde se escribe, en vez de esperar a que lo vea el invariante de la
  // crónica en las semillas que lo pisen. Los `return` de los bucles se quedan:
  // son los que hacen que no se llegue aquí.
  if (state.finished !== null && draft.kind !== 'game_over') {
    throw new Error(
      `la partida ya ha terminado y se iba a escribir "${draft.kind}" después del final`,
    );
  }
  const sitio = draft.at;
  const seen: PlayerId[] = [];
  // Un hecho sin sitio no lo observa nadie, y no es un agujero: los cuatro que
  // no tienen casilla —el día, el turno, la derrota y el fin— van siempre.
  if (sitio !== null) {
    for (const p of state.players) {
      if (observa(state, p.id, draft, sitio)) seen.push(p.id);
    }
  }
  (state.log as GameEvent[]).push({ ...draft, seen });
}

/**
 * Si `p` observa un hecho ocurrido en `sitio`, con la vara que dice `SE_VE_POR`:
 * por su casilla (`visibleNowAt`: el radio de sus héroes, castillos y nodos sobre
 * lo explorado), y la marcha que se para por un grupo, por la casilla del héroe
 * **y** la del grupo: si no, la crónica le contaría al rival que mira al héroe un
 * grupo y su tropa que su niebla le tapa (H4 de QA).
 */
function observa(state: GameState, p: PlayerId, draft: GameEventDraft, sitio: Point): boolean {
  switch (SE_VE_POR[draft.kind]) {
    case 'casilla':
      return visibleNowAt(state, p, sitio);
    case 'casilla y grupo': {
      if (draft.kind !== 'march_halted') {
        throw new Error(`"${draft.kind}" se sella por su grupo y no lleva grupo`);
      }
      const grupo = state.raiders.find((r) => r.id === draft.raider);
      if (grupo === undefined) {
        throw new Error(`la marcha se para por el grupo ${draft.raider}, que no está en el mapa`);
      }
      return visibleNowAt(state, p, sitio) && visibleNowAt(state, p, grupo.at);
    }
  }
}

// ---------------------------------------------------------------- turnos

function startTurn(state: GameState): void {
  const player = currentPlayer(state);
  emit(state, { kind: 'turn_start', actor: player.id, at: null });

  // Ingresos del día: lo que está UNIDO A LA BASE, y nada más (`rentaDelDia`).
  const renta = rentaDelDia(state, player.id);
  for (const town of townsOf(state, player.id)) {
    town.builtToday = false;
    // Su recuerdo de lo que tiene alrededor es de hoy, igual que el de un héroe
    // quieto: un grupo que patrulla junto a casa se ve donde está.
    revealAroundTown(state, town);
  }
  // Y cada nodo suyo, que también mira (la niebla de eventos, 02-11-2026).
  for (const obj of state.map.objects) {
    if (obj.kind === 'node' && obj.owner === player.id) revealAroundNode(state, obj);
  }
  player.oro += renta.total;

  for (const hero of heroesOf(state, player.id)) {
    empezarElDia(hero);
    // El maná se recupera poco a poco, salvo en un pueblo con gremio.
    const enPueblo = townsOf(state, player.id).some(
      (t) => pointKey(t.at) === pointKey(hero.at) && mageGuildLevel(t) > 0,
    );
    hero.mana = enPueblo ? maxMana(hero) : Math.min(maxMana(hero), hero.mana + 1);
    // Y mira alrededor al levantarse: un héroe quieto también ve. Sin esto, su
    // recuerdo del nodo que tiene al lado sería del día en que llegó.
    revealAround(state, hero);
  }
}

/**
 * El orden de los turnos en el día `dia`: **en serpiente** (regla nuestra, se
 * aparta de fheroes2, donde el orden es fijo). Los días impares van en el orden
 * de `players` y los pares al revés, así que quien cierra un día abre el
 * siguiente: día 1 j0, j1; día 2 j1, j0; día 3 j0, j1…
 *
 * Con el orden fijo, j0 abría todos los días y llegaba antes a lo que se
 * disputa: en 1 000 partidas de la IA contra sí misma ganaba 603, y separando
 * los efectos, abrir el día valía +63 (±8) de esos 603 frente a +30 de la base 0
 * y +16 del caballero (`docs/historia.md`). En serpiente, abrir el día deja de
 * ser de uno solo.
 *
 * Es el ÚNICO sitio que sabe el orden: lo leen el paso de turno (`nextPlayer`),
 * el primer turno de la partida (`createGame`) y lo que se le dice al agente
 * (`serializeAdventureTurn`). Va con todos los jugadores, también los
 * eliminados: quien pasa el turno se salta a los que ya no juegan.
 */
export function ordenDelDia(
  jugadores: readonly { readonly id: PlayerId }[],
  dia: number,
): readonly PlayerId[] {
  if (!Number.isInteger(dia) || dia < 1) {
    throw new Error(`no hay orden de turnos para el día ${dia}: los días empiezan en el 1`);
  }
  const orden = jugadores.map((j) => j.id);
  return dia % 2 === 1 ? orden : orden.reverse();
}

function nextPlayer(state: GameState, ctx: GameContext): void {
  // Lo de «volvió a casa» dura hasta que su dueño acaba un turno: en él ya ha podido
  // recoger (`Hero.vueltoACasa`).
  for (const hero of heroesOf(state, state.current)) delete hero.vueltoACasa;
  const vivos = state.players.filter((p) => !p.defeated);
  if (vivos.length <= 1) {
    // Sin nadie vivo no gana nadie, y ahora se puede decir: antes esto coronaba
    // al jugador de turno —`?? state.current`— porque `winner` no admitía otra
    // cosa, o sea que la única salida era mentir. No mueve ninguna de las 200
    // partidas del banco: todas tienen exactamente un `player_defeated`.
    finishGame(state, vivos[0]?.id ?? null);
    return;
  }
  const juega = (id: PlayerId): boolean => !playerById(state, id).defeated;

  // Primero, quien quede por jugar HOY detrás del que cierra.
  const hoy = ordenDelDia(state.players, state.day);
  const siguienteHoy = hoy.slice(hoy.indexOf(state.current) + 1).find(juega);
  if (siguienteHoy !== undefined) {
    state.current = siguienteHoy;
    startTurn(state);
    return;
  }

  // Si no queda nadie, empieza un día nuevo…
  advanceDay(state, ctx);
  // …y ese día nuevo puede no llegar a existir: `advanceDay` termina la
  // partida al agotarse el tope. Sin esta línea, `startTurn` correría sobre
  // una partida acabada y le escribiría un `turn_start` detrás del
  // `game_over`.
  //
  // Quien lo vigila es el test del tope en `game.test.ts` y NO el invariante
  // de «`game_over` es el último hecho», que es a quien apuntaba esta frase:
  // sus veinte semillas juegan a 200 días y acaban por conquista, así que no
  // pisan esta salida. Quitando la línea, el invariante se queda verde y el
  // otro saca «expected turn_start to match game_over». Citar al guardia
  // equivocado es peor que no citar ninguno: el que lea esto y lo dé por
  // cubierto no irá a mirar.
  if (state.finished !== null) return;
  // Lo abre el primero vivo del orden de mañana, que en serpiente suele ser el
  // mismo que acaba de cerrar: juega dos turnos seguidos con el cambio de día
  // (los asaltantes, la hornada del lunes) en medio. Hay al menos dos vivos.
  state.current = ordenDelDia(state.players, state.day).find(juega) as PlayerId;
  startTurn(state);
}

/**
 * Pasa de día, o termina la partida si ya no quedan.
 *
 * El tope se mira **antes** de incrementar, y el orden no es cosmético: al
 * revés se emitiría un `day_start` de un día que no juega nadie —una línea de
 * más en la crónica de cada partida que llegue al tope, y el ancla del banco
 * movida—. Así el último día jugado es exactamente `maxDays`, y `game_over`
 * queda de último hecho.
 */
function advanceDay(state: GameState, ctx: GameContext): void {
  if (state.day >= state.maxDays) {
    finishGame(state, null);
    return;
  }
  state.day += 1;
  emit(state, { kind: 'day_start', day: state.day, week: week(state), actor: null, at: null });
  if (dayOfWeek(state) === 1) crecerLasMoradas(state);
  moverAsaltantes(state, ctx.rng);
  if (dayOfWeek(state) === 1) brotarAsaltantes(state, ctx.rng);
}

/**
 * El crecimiento de la semana de cada ciudad, **salvo la ocupada** (P4 de la tarea
 * 2, 05-11-2026: «tampoco crecen sus moradas»; y la semana se pierde, no se
 * aplaza, pregunta 4). **El único que llama a `applyWeeklyGrowth`** (lo vigila
 * `test/invariantes.test.ts`): al nacer la partida y cada lunes.
 */
function crecerLasMoradas(state: GameState): void {
  for (const town of state.towns) {
    if (ocupanteDe(state, sitioDeLaCiudad(town)) !== null) continue;
    applyWeeklyGrowth(town);
  }
}

/**
 * La patrulla del día: cada grupo, en orden, da su paso (`pasoDePatrulla`). Va
 * con el reloj y no con ningún jugador, al empezar el día y antes del primer
 * turno: así lo que el agente ve en su turno es dónde está cada grupo HOY.
 *
 * **No se cuenta en la crónica.** Era `raider_moved`, el 20 % del volcado del
 * banco, y no lo leía nadie: el panel no lo pintaba, al agente le llegaba por
 * el sello y le comía la ventana de 25 hechos, y el lienzo anima la marcha con
 * la posición, que está en el estado. Dónde está un grupo es estado, no hecho.
 */
function moverAsaltantes(state: GameState, rng: Rng): void {
  const W = state.map.width;
  const ocupadas = mascaraDeOcupacion(state);
  for (const raider of state.raiders) {
    const from = raider.at;
    const to = pasoDePatrulla(state, raider, rng, ocupadas);
    if (to.x === from.x && to.y === from.y) continue;
    ocupadas[from.y * W + from.x] = 0;
    ocupadas[to.y * W + to.x] = 1;
    raider.at = to;
  }
}

/** Que un grupo está en el mapa, contado: lo ve quien mire su casilla al nacer. */
function contarBrote(state: GameState, raider: Raider): void {
  emit(state, {
    kind: 'raider_spawned',
    raider: raider.id,
    troops: raider.troops,
    actor: null,
    at: raider.at,
  });
}

/**
 * El brote del lunes (`dondeBrotan`). El id lleva el día y el orden del brote,
 * así que no hace falta guardar un contador en el estado y dos partidas con la
 * misma semilla dan los mismos ids.
 */
function brotarAsaltantes(state: GameState, rng: Rng): void {
  for (const [k, plan] of dondeBrotan(state, rng).entries()) {
    const raider: Raider = {
      id: `raider-d${state.day}-${k}`,
      at: plan.at,
      troops: plan.troops,
    };
    state.raiders.push(raider);
    contarBrote(state, raider);
  }
}

/**
 * Los grupos cuya región acaba de tener dueño se van. Lo llama `tomarElNodo`, el
 * único sitio donde una región puede ganar dueño:
 * el dueño de una región es una consecuencia de sus nodos.
 */
function dispersarAsaltantes(state: GameState): void {
  for (const { raider, dueño } of dispersados(state)) {
    dejarAsaltante(state, raider.id, []);
    emit(state, { kind: 'raider_dispersed', raider: raider.id, actor: dueño, at: raider.at });
  }
}

/** Se acabó. `winner` es `null` cuando se agotaron los días y no ganó nadie. */
function finishGame(state: GameState, winner: PlayerId | null): void {
  if (state.finished !== null) return;
  state.finished = { winner };
  // `actor: null` es exacto y no un hueco: no lo hace ningún jugador, igual que
  // el `day_start`. Y `visibleTo` da `game_over` a todo el mundo sin mirar el
  // actor, así que el reparto no se entera.
  emit(state, { kind: 'game_over', actor: winner, at: null });
}

/**
 * Un jugador está eliminado en cuanto **pierde su base**, aunque le queden
 * héroes o ciudades. Es la regla de victoria de NuevaJugabilidad —«se gana
 * tomando las bases rivales»—, que el usuario adelantó de la fase 3 al ver la
 * fase 2a: la base es la única ciudad donde se reaparece y de la que cuelga
 * toda la renta (`territorio`), así que perderla es perder la partida.
 *
 * La otra mitad, sin héroes y sin castillos, se queda para quien **no tuvo
 * nunca** base (`Player.base === null`), que solo dan los estados de prueba:
 * con base, quedarse sin castillos ya es haberla perdido.
 */
function checkDefeat(state: GameState): void {
  for (const player of state.players) {
    if (player.defeated) continue;
    const perdioLaBase = player.base !== null && baseOf(state, player.id) === null;
    const sinNada =
      heroesOf(state, player.id).length === 0 && townsOf(state, player.id).length === 0;
    if (perdioLaBase || sinNada) {
      player.defeated = true;
      // Con las dos a la vez manda la base: es la regla de la partida, y la
      // otra solo existe para quien nunca tuvo base.
      const reason = perdioLaBase ? 'lost_base' : 'nothing_left';
      emit(state, { kind: 'player_defeated', reason, actor: player.id, at: null });
    }
  }
  const vivos = state.players.filter((p) => !p.defeated);
  if (vivos.length === 1) finishGame(state, vivos[0]!.id);
}

// ---------------------------------------------------------------- acciones

/**
 * Aplica una acción de mapa.
 *
 * `quien` es **quién dice ser el que actúa**, y es obligatorio: una acción no
 * lleva dentro a su autor, así que sin este dato el núcleo daba por hecho que
 * quien llama es el jugador de turno. Con un `endTurn()` asíncrono en el
 * cliente eso dejó de ser cierto —se puede construir o reclutar mientras corre
 * el turno del rival—, y lo único que salía era `ese pueblo no es tuyo`, que es
 * verdad a medias y despista: el pueblo sí es tuyo, lo que no es tuyo es el
 * turno.
 *
 * Fue opcional un rato y no compraba nada: una comprobación que se apaga sola
 * al olvidar un argumento es la única que no avisa de que falta.
 *
 * `alcance` sí es opcional, y por lo contrario: es una **pista de rendimiento**
 * —el Dijkstra desde el héroe, ya recorrido— que solo tiene quien acaba de
 * hacerlo. El cliente, el servidor y el agente no traen camino, así que sin
 * ella `move_hero` recorre el mapa como siempre. Lo que no es opcional es que
 * salga del sitio donde está el héroe: eso lo comprueba `caminoDelHeroe`.
 */
export function applyAdventureAction(
  state: GameState,
  action: AdventureAction,
  ctx: GameContext,
  quien: PlayerId,
  alcance?: Reachable,
): void {
  if (state.pendingBattle !== null) {
    throw new Error('hay una batalla pendiente de resolver');
  }
  // La partida terminada y el turno ajeno los dice `turnBlocker`, que es donde
  // vive la frase: aquí no se reescribe ninguna de las dos.
  const bloqueo = turnBlocker(state, quien);
  if (bloqueo !== null) throw new Error(bloqueo);
  // Con el héroe de salida por elegir, lo único que se hace es elegirlo.
  if (action.type !== 'hire_hero') {
    const pendiente = salidaPendienteBlocker(state, quien);
    if (pendiente !== null) throw new Error(pendiente);
  }

  // Quién actúa se anota ANTES de la acción: `end_turn` cambia `state.current`,
  // y el que acaba de meter su héroe en el castillo es el jugador saliente.
  const actor = currentPlayer(state).id;
  const antes = fotoDeLosSitios(state);
  aplicar(state, action, ctx, alcance);
  anotarLosSitios(state, antes);

  // Y nada se aprende después del final. `aplicar` puede terminar la partida
  // —capturar el último castillo del rival lo hace—, y esta sincronía iba
  // detrás sin preguntar: en 34 de 200 semillas la crónica acababa con «Fin de
  // la partida» y DEBAJO «El jugador 1 aprende: Prisa, Lentitud», que además se
  // pinta así en pantalla. La regla que rompía está escrita en `settleBattle`
  // —`game_over` es el ÚLTIMO hecho del registro— y no la vigilaba nadie;
  // ahora sí (`test/invariantes.test.ts`).
  if (state.finished === null) syncSpellbooks(state, actor);
}

/** De quién es un sitio y quién lo ocupa, en un instante (`fotoDeLosSitios`). */
type SitioEnLaFoto = SitioVisto & { readonly sitio: Sitio };

/**
 * De quién es cada ciudad y cada pueblo y quién lo ocupa, ahora: lo que compara
 * `anotarLosSitios` al acabar una acción o una batalla. Los dueños, de una pasada
 * por la red (`dueñosDeLaRed`), no uno por sitio.
 */
function fotoDeLosSitios(state: GameState): ReadonlyMap<string, SitioEnLaFoto> {
  const dueños = dueñosDeLaRed(state);
  const foto = new Map<string, SitioEnLaFoto>();
  for (const o of state.map.objects) {
    if (o.kind !== 'town' && o.kind !== 'village') continue;
    const sitio = sitioDelObjeto(state, o);
    foto.set(o.id, { sitio, ...comoEstaElSitio(state, sitio, dueñoEnLaFoto(dueños, o.id)) });
  }
  return foto;
}

/** Si dos ocupantes son el mismo (el mismo héroe, o una guarnición del mismo dueño). */
function mismoOcupante(a: Ocupante | null, b: Ocupante | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'heroe') return b.kind === 'heroe' && a.heroId === b.heroId;
  return b.kind === 'guarnicion' && a.dueño === b.dueño;
}

/**
 * **La crónica de los sitios** (tarea 2, 05-11-2026): compara la foto de antes
 * (`fotoDeLosSitios`) con la de ahora y cuenta lo que cambió sin que nadie lo
 * hiciera a propósito —una ciudad de dentro de una región que cambia de dueño con
 * ella (`town_owner_changed`; la del muro ya lo cuenta `tomarElNodo`), un sitio que
 * queda ocupado (`site_occupied`) y uno que deja de estarlo (`site_freed`)—. Así
 * marcharse, perder una batalla, cerrar una región y la guarnición que se queda
 * dentro de lo que cambia de dueño (P1) son un solo camino, y ninguna acción tiene
 * que acordarse de contarlo. Cada hecho, con su dueño de protagonista y en su
 * casilla. Lo llaman `applyAdventureAction` y `settleBattle`, al acabar; tras
 * `game_over`, nada (es el último hecho).
 */
function anotarLosSitios(state: GameState, antes: ReadonlyMap<string, SitioEnLaFoto>): void {
  if (state.finished !== null) return;
  for (const [id, ahora] of fotoDeLosSitios(state)) {
    const previo = antes.get(id);
    if (previo === undefined) continue;
    const at = casillaDelSitio(ahora.sitio);
    if (
      ahora.sitio.kind === 'ciudad' &&
      previo.dueño !== ahora.dueño &&
      !enUnNodo(state, ahora.sitio)
    ) {
      emit(state, {
        kind: 'town_owner_changed',
        town: id,
        from: previo.dueño,
        to: ahora.dueño,
        actor: ahora.dueño,
        at,
      });
    }
    if (mismoOcupante(previo.ocupante, ahora.ocupante)) continue;
    if (ahora.ocupante !== null) {
      emit(state, { kind: 'site_occupied', site: id, by: ahora.ocupante, actor: ahora.dueño, at });
    } else if (ahora.dueño !== null) {
      // Sin dueño ya no hay ocupación que acabe: no se le cuenta a nadie que se
      // «liberó» un sitio que ya no es suyo.
      emit(state, { kind: 'site_freed', site: id, actor: ahora.dueño, at });
    }
  }
}

/**
 * Los héroes propios parados en un pueblo propio con gremio aprenden lo que ese
 * gremio enseña, sin duplicados y hasta donde les deje su Sabiduría.
 *
 * Es sincronía, no acción: no hay nada ilegal que rechazar, así que no lanza —
 * y por eso no existe una acción de "aprender" ni en el cliente ni en el
 * contrato del agente. Se pasa entera tras cada acción de aventura (≤4 héroes
 * por unos pocos pueblos) en vez de parchear por separado los tres caminos que
 * llevan a aprender —entrar al pueblo, contratar allí y construir el gremio con
 * el héroe dentro—, que es donde se olvidaría el cuarto. Al entrar y no al
 * empezar el turno, para que quien lee "enseña Prisa" no tenga que esperar a
 * mañana para saberla.
 */
function syncSpellbooks(state: GameState, playerId: PlayerId): void {
  const pueblos = townsOf(state, playerId);
  if (pueblos.length === 0) return;

  for (const hero of heroesOf(state, playerId)) {
    const town = pueblos.find((t) => pointKey(t.at) === pointKey(hero.at));
    if (town === undefined) continue;
    const nuevos = learnable(hero, townSpells(town));
    if (nuevos.length === 0) continue;
    hero.spells = [...hero.spells, ...nuevos];
    emit(state, {
      kind: 'spells_learned',
      hero: hero.id,
      town: town.id,
      spells: nuevos,
      actor: hero.owner,
      at: town.at,
    });
  }
}

function aplicar(
  state: GameState,
  action: AdventureAction,
  ctx: GameContext,
  alcance: Reachable | undefined,
): void {
  switch (action.type) {
    case 'end_turn':
      nextPlayer(state, ctx);
      return;

    case 'move_hero':
      moveHero(state, action.hero, action.to, ctx, alcance);
      return;

    case 'hire_hero': {
      hireHero(state, currentPlayer(state).id, action.town, action.tipo);
      return;
    }

    case 'build': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const manda = ciudadQueMandaBlocker(state, town, player.id);
      if (manda !== null) throw new Error(`no se puede construir: ${manda}`);
      player.oro = buildInTown(town, action.building, player.oro);
      emit(state, {
        kind: 'built',
        town: town.id,
        building: action.building,
        actor: player.id,
        at: town.at,
      });
      return;
    }

    case 'recruit': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const manda = ciudadQueMandaBlocker(state, town, player.id);
      if (manda !== null) throw new Error(`no se puede reclutar: ${manda}`);

      const destino = destinoDeRecluta(state, town);
      // Lo que el pueblo puede dar y lo que cabe (`reclutarBlocker`), ANTES de
      // cobrar: `payRecruit` descuenta las criaturas del pueblo y el oro del
      // monedero, y un rechazo después de pagar sería tropa pagada y perdida.
      const motivo = reclutarBlocker(town, action.creature, action.count, destino, player.oro);
      if (motivo !== null) throw new Error(`no se puede reclutar: ${motivo}`);
      const ampliado = withTroops(destino.army, action.creature, action.count);

      player.oro = payRecruit(town, action.creature, action.count, player.oro);
      const hero = destino.hero;
      // Reclutar no toca los puntos de hoy: se fijan al empezar el día
      // (`startTurn`), y la tropa nueva cuenta a partir de mañana.
      if (hero !== undefined) hero.army = ampliado;
      else ponerLaGuarnicion(state, sitioDeLaCiudad(town), player.id, ampliado);
      emit(state, {
        kind: 'recruited',
        town: town.id,
        creature: action.creature,
        count: action.count,
        actor: player.id,
        at: town.at,
      });
      return;
    }

    case 'dismiss': {
      const hero = heroById(state, action.hero);
      const player = currentPlayer(state);
      if (hero.owner !== player.id) throw new Error(`${hero.name} no es de tu bando`);
      const noSe = dismissBlocker(state, hero, action.creature, action.count);
      if (noSe !== null) throw new Error(`no se puede licenciar: ${noSe}`);
      const { queda, seVan } = licenciar(hero.army, action.creature, action.count);
      hero.army = queda;
      // Lo que llevaban puesto vuelve a la mochila: se licencia en un castillo
      // propio, con el héroe delante, y tirar una espada con quien se va no lo
      // pidió nadie (decisión del usuario sobre el plan).
      aLaMochila(hero, ...seVan.flatMap((t) => idsPuestos(t.veterania?.equipo)));
      emit(state, {
        kind: 'dismissed',
        hero: hero.id,
        creature: action.creature,
        count: action.count,
        actor: player.id,
        at: hero.at,
      });
      return;
    }

    case 'dejar_tropa':
    case 'recoger_tropa': {
      const player = currentPlayer(state);
      // Lanza con `intercambioBlocker`, la regla que leen también la pantalla y el agente.
      const { hero, sitio, creature, count } = moverTropa(state, player.id, action.type, action);
      emit(state, {
        kind: action.type === 'dejar_tropa' ? 'troops_left' : 'troops_taken',
        hero: hero.id,
        site: idDelSitio(sitio),
        creature,
        count,
        actor: player.id,
        at: hero.at,
      });
      return;
    }

    case 'repartir_tropa': {
      const player = currentPlayer(state);
      // Lanza con `repartirTropaBlocker`, la regla que lee también la pantalla.
      const { hero, sitio, deja, recoge } = repartirTropa(state, player.id, action);
      emit(state, {
        kind: 'troops_exchanged',
        hero: hero.id,
        site: idDelSitio(sitio),
        left: deja,
        taken: recoge,
        actor: player.id,
        at: hero.at,
      });
      return;
    }

    case 'mejorar_el_puesto': {
      const player = currentPlayer(state);
      // Lanza con `mejorarBlocker`, la regla que lee también el botón del diálogo.
      const { hero, nodo, obra, precio } = mejorarElPuesto(
        state,
        player.id,
        action.hero,
        action.obra,
        player.oro,
      );
      player.oro -= precio;
      emit(state, {
        kind: 'outpost_upgraded',
        hero: hero.id,
        site: nodo.id,
        to: obra,
        cost: precio,
        actor: player.id,
        at: nodo.at,
      });
      return;
    }

    case 'buy_item': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const noSe = buyBlocker(state, town, action.item, player.id);
      if (noSe !== null) throw new Error(`no se puede comprar: ${noSe}`);
      // `buyBlocker` ya ha mirado que el héroe está y que la pieza existe.
      const hero = heroeEnElPueblo(state, town) as Hero;
      const pieza = piezaSiExiste(action.item)!;
      player.oro -= pieza.precio;
      aLaMochila(hero, pieza.id);
      emit(state, {
        kind: 'item_bought',
        hero: hero.id,
        town: town.id,
        item: pieza.id,
        actor: player.id,
        at: town.at,
      });
      return;
    }

    case 'equip': {
      const hero = heroById(state, action.hero);
      const noSe = equipBlocker(state, currentPlayer(state).id, action);
      if (noSe !== null) throw new Error(`no se puede equipar: ${noSe}`);
      // Equipar es estado y no un hecho, como la patrulla de un asaltante: no se
      // cuenta en la crónica. Lo que cuenta es de dónde salió la pieza.
      const quien = destinoDeEquipo(hero, action) as Portador;
      // Todo o nada: lo que puede lanzar va antes de tocar al héroe. Sacaba la
      // pieza de la mochila antes de `ponerPieza`, y cuando esa lanzaba la pieza
      // se perdía (H1 del QA de fuerza y agilidad, 26-10-2026). Y con lo de serie
      // debajo, que es lo que mira `equipBlocker`: la daga de un arquero es su
      // primera arma.
      const { equipo, quitada } = ponerPieza(
        equipoDe(hero, quien),
        action.item,
        undefined,
        action.hueco,
        equipoDeSerieDe(hero, quien),
      );
      const vestido = conEquipoDe(hero, quien, equipo, () => hojaNueva(state));
      hero.mochila = sacarDeLaMochila(hero.mochila, action.item);
      vestir(hero, vestido);
      aLaMochila(hero, quitada);
      return;
    }

    case 'elegir_en_lugar': {
      // Antes que la pregunta de la opción, que mira el turno del dueño del héroe:
      // con el héroe del rival diría «todavía no es tu turno», y sí lo es.
      const deOtro = state.heroes.find((h) => h.id === action.hero);
      if (deOtro !== undefined && deOtro.owner !== currentPlayer(state).id) {
        throw new Error('no se puede elegir eso: ese héroe no es tuyo');
      }
      const noSe = opcionBlocker(state, action.hero, action);
      if (noSe !== null) throw new Error(`no se puede elegir eso: ${noSe}`);
      const hero = heroById(state, action.hero);
      const { lugar, opcion } = opcionDe(state, action.hero, action);
      anotarLaEleccion(mundoDe(state), action, opcion, hero);
      // Con batalla, lo que da la opción se da al ganarla, entero (`applyVictory`; M1
      // de la vuelta 2 de QA de la F1a): perder no da nada y deja volver a pelear.
      const hace = opcion.hace ?? [];
      const ahora = batallaDe(opcion) === null ? hace : hace.filter((e) => !esPremio(e));
      aplicarEfectos(state, hero.owner, hero, lugar, ahora, ctx, action);
      return;
    }

    case 'formar': {
      // La formación entera se calcula una vez: la juzga y la mueve la misma
      // batalla de la formación, con las reglas del despliegue.
      const juicio = juzgarFormar(state, currentPlayer(state).id, action);
      if ('motivo' in juicio) throw new Error(`no se puede formar: ${juicio.motivo}`);
      const { hero, batalla, stack } = juicio;
      aplicarDespliegue(batalla, { type: 'colocar', stack: stack.id, at: action.at }, ctx.rng);
      // Estado y no un hecho, como equipar: nadie lo cuenta en la crónica. Se
      // guarda la formación ENTERA tal como queda: quien no tenía casilla la tenía
      // por la regla de hoy en un hueco libre, y al vaciar o llenar uno se
      // correría solo, sin que nadie lo hubiera movido.
      hero.salida = stackDelPortador(batalla, { heroe: true }).hex;
      hero.army = hero.army.map((t, indice) => ({
        ...t,
        salida: stackDelPortador(batalla, { indice }).hex,
      }));
      return;
    }

    case 'unequip': {
      const hero = heroById(state, action.hero);
      const noSe = unequipBlocker(state, currentPlayer(state).id, action);
      if (noSe !== null) throw new Error(`no se puede desequipar: ${noSe}`);
      // El `as` lo respalda `unequipBlocker`, que acaba de decir que sí.
      const quien = destinoDeEquipo(hero, action) as Portador;
      const { equipo, quitada } = quitarPieza(equipoDe(hero, quien), action.slot);
      vestir(hero, conEquipoDe(hero, quien, equipo));
      aLaMochila(hero, quitada);
      return;
    }
  }
}

/**
 * Aplica los efectos de un lugar, en orden, cada uno con su hecho en la crónica.
 * **La única escritura** de lo que da o quita un lugar y del estado y las marcas
 * de `GameState.mundo` (lo cobrado y la conversación, `anotarLaEleccion`): la
 * llaman la opción elegida (`elegir_en_lugar`) y el cierre de una batalla de un
 * lugar (`alGanar`, `alPerder`). Quien llama ya ha comprobado que se puede
 * (`opcionBlocker`, o la validación del mundo, que en `alGanar` no deja pagos ni
 * tropa y en `alPerder` solo deja estado y marca): aquí no se falla a medias.
 *
 * `hero` es quien recibe lo que se da; al perder puede haber caído ya, y entonces
 * es `null` (`alPerder` no da nada). `dueño` es el protagonista de los hechos.
 * `ctx` y `ref` (la opción elegida) solo hacen falta si hay batalla: la abre
 * `abrirBatalla`, como un ataque, y la batalla recuerda qué opción la abrió.
 */
function aplicarEfectos(
  state: GameState,
  dueño: PlayerId,
  hero: Hero | null,
  lugar: Lugar,
  efectos: readonly Efecto[],
  ctx: GameContext | null,
  ref: RefDeOpcion | null = null,
): void {
  const mundo = mundoDe(state);
  const at = lugar.at;
  const player = playerById(state, dueño);
  const delHeroe = (que: string): Hero => {
    if (hero === null) throw new Error(`«${que}» en ${lugar.nombre} sin héroe que lo reciba`);
    return hero;
  };
  for (const e of efectos) {
    if ('estado' in e) {
      const from = mundo.estados[lugar.id] as string;
      if (from === e.estado) continue;
      mundo.estados[lugar.id] = e.estado;
      emit(state, {
        kind: 'place_state',
        lugar: lugar.id,
        nombre: lugar.nombre,
        estado: e.estado,
        from,
        dicho: lugar.estados[e.estado] ?? e.estado,
        actor: dueño,
        at,
      });
    } else if ('marca' in e) {
      if (mundo.marcas.includes(e.marca)) continue;
      mundo.marcas.push(e.marca);
      emit(state, { kind: 'world_mark', marca: e.marca, lugar: lugar.id, actor: dueño, at });
    } else if ('oro' in e) {
      player.oro += e.oro;
      emit(
        state,
        e.oro > 0
          ? { kind: 'gold_gained', amount: e.oro, from: 'lugar', lugar: lugar.id, actor: dueño, at }
          : { kind: 'gold_paid', amount: -e.oro, lugar: lugar.id, actor: dueño, at },
      );
    } else if ('pieza' in e) {
      const h = delHeroe('pieza');
      aLaMochila(h, e.pieza);
      emit(state, {
        kind: 'loot_found',
        hero: h.id,
        item: e.pieza,
        from: 'lugar',
        lugar: lugar.id,
        actor: dueño,
        at,
      });
    } else if ('quitar' in e) {
      const h = delHeroe('quitar');
      h.mochila = sacarDeLaMochila(h.mochila, e.quitar);
      emit(state, {
        kind: 'item_given',
        hero: h.id,
        item: e.quitar,
        lugar: lugar.id,
        actor: dueño,
        at,
      });
    } else if ('tropa' in e) {
      const h = delHeroe('tropa');
      h.army = withTroops(h.army, e.tropa.unidad, e.tropa.n);
      emit(state, {
        kind: 'troops_joined',
        hero: h.id,
        creature: e.tropa.unidad,
        count: e.tropa.n,
        lugar: lugar.id,
        actor: dueño,
        at,
      });
    } else {
      const h = delHeroe('batalla');
      if (ctx === null || ref === null)
        throw new Error(`una batalla de ${lugar.nombre} sin la opción que la abra`);
      abrirBatalla(
        state,
        {
          attacker: { kind: 'hero', heroId: h.id },
          foe: {
            kind: 'lugar',
            lugar: lugar.id,
            encuentro: e.batalla,
            opcion: { punto: ref.punto, nodo: ref.nodo, opcion: ref.opcion },
          },
        },
        ctx,
      );
    }
  }
}

/**
 * Lo que el mundo recuerda de una opción elegida, antes de aplicarla: su premio,
 * cobrado por el dueño de `hero` (`cobradas`; el de una opción con batalla, al
 * ganarla, `applyVictory`), y dónde queda la conversación de ese jugador con su
 * punto (`recordarLaConversacion`). Con lo de `aplicarEfectos` y el encuentro
 * ganado, lo único que escribe `GameState.mundo`.
 */
function anotarLaEleccion(
  mundo: EstadoDelMundo,
  ref: RefDeOpcion,
  opcion: Opcion,
  hero: Hero,
): void {
  if (daPremio(opcion) && batallaDe(opcion) === null)
    mundo.cobradas[claveDeOpcion(ref)] ??= cobroDe(hero);
  recordarLaConversacion(mundo.conversaciones, hero.owner, ref, opcion);
}

/** Quién cobra: el dueño de `hero` y su nombre, que dicen las frases del otro jugador. */
function cobroDe(hero: Hero): CobroDelMundo {
  return { jugador: hero.owner, heroe: hero.name };
}

/** La opción que abrió la batalla de un lugar, o lanza. */
function opcionDeLaBatalla(lugar: Lugar, foe: Extract<BattleFoe, { kind: 'lugar' }>): Opcion {
  const punto = lugar.puntos.find((p) => p.id === foe.opcion.punto);
  const opcion =
    lugar.dialogos[punto?.dialogo ?? '']?.nodos[foe.opcion.nodo]?.opciones[foe.opcion.opcion];
  if (opcion === undefined) {
    throw new Error(
      `la batalla de «${lugar.nombre}» no sabe qué opción la abrió (${foe.opcion.punto}/${foe.opcion.nodo}/${foe.opcion.opcion})`,
    );
  }
  return opcion;
}

/** El encuentro de una batalla de un lugar, o lanza. */
function encuentroDe(state: GameState, foe: Extract<BattleFoe, { kind: 'lugar' }>) {
  const lugar = lugarDe(mundoDe(state).historia, foe.lugar);
  const encuentro = lugar.encuentros[foe.encuentro];
  if (encuentro === undefined) {
    throw new Error(`«${lugar.nombre}» no tiene ningún encuentro "${foe.encuentro}"`);
  }
  return { lugar, encuentro };
}

/**
 * Escribe en `hero` lo que calcula `conEquipoDe`, que no lo toca: el estado
 * guarda la referencia del héroe, así que se cambian sus campos y no el héroe.
 */
function vestir(hero: Hero, vestido: Pick<Hero, 'equipo' | 'army'>): void {
  hero.equipo = vestido.equipo;
  hero.army = vestido.army;
}

/**
 * Echa a la mochila de `hero` las piezas `ids`, en ese orden; un `null` es «no
 * había nada» y se salta. **La única escritura de la mochila que añade**: la
 * usan el botín, la compra, lo que se quita al equipar o desequipar, lo que
 * devuelve la tropa licenciada y lo que trae el veterano que asciende. La
 * mochila se sustituye entera, nunca se muta.
 */
function aLaMochila(hero: Hero, ...ids: readonly (string | null)[]): void {
  const nuevas = ids.filter((id) => id !== null);
  if (nuevas.length > 0) hero.mochila = [...hero.mochila, ...nuevas];
}

/**
 * Una hoja de servicios en blanco, con su id del contador de siempre. **La única
 * forma de abrir una**: la abren el novato que gana su primer punto
 * (`conVeterania`) y el que se equipa. Experiencia 0, así que sigue siendo de
 * nivel 1 y no cobra nada por tenerla; lo que cambia es que ahora es ALGUIEN.
 */
function hojaNueva(state: GameState): Veterania {
  return {
    id: `veterano-${state.siguienteVeterano++}`,
    experiencia: 0,
    batallas: 0,
    bajas: 0,
    heroes: [],
  };
}

/**
 * Por qué `player` no puede comprar `item` en `town` ahora, o `null`. La frase es
 * para la persona —la enseña el panel del castillo— y para el agente, que la
 * recibe en su veredicto. En el orden en que se entiende: el pueblo, la armería,
 * quién recibe, qué se pide y con qué se paga.
 */
export function buyBlocker(
  state: GameState,
  town: Town,
  item: string,
  player: PlayerId,
): string | null {
  // Ocupada, la armería tampoco vende (P4: la ciudad entera deja de servir).
  const manda = ciudadQueMandaBlocker(state, town, player);
  if (manda !== null) return manda;
  if (!tieneArmeria(town)) return `${town.name} no tiene armería: constrúyela primero`;
  const hero = heroeEnElPueblo(state, town);
  if (hero === undefined) {
    return `no hay ningún héroe tuyo en ${town.name}: lo comprado va a su mochila`;
  }
  const pieza = piezaSiExiste(item);
  if (pieza === null) return `no existe ninguna pieza "${item}"`;
  if (!seVende(pieza)) {
    return `la armería no vende ${pieza.nombre}: ${deDondeSale(pieza)}`;
  }
  const sinOro = oroBlocker(pieza.precio, playerById(state, player).oro);
  return sinOro === null ? null : `${pieza.nombre}: ${sinOro}`;
}

/** El héroe `heroId`, si existe y es de `player`; o por qué no. */
function heroeSuyo(
  state: GameState,
  player: PlayerId,
  heroId: string,
): Hero | { readonly motivo: string } {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  if (hero.owner !== player) return { motivo: `${hero.name} no es de tu bando` };
  return hero;
}

/**
 * Por qué no se puede hacer ese `equip`, o `null`. Se equipa **en cualquier
 * sitio fuera de batalla** —el botín cae en el camino— y de la mochila del héroe
 * que se nombra, a él mismo o a un individuo de su tropa.
 */
export function equipBlocker(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'equip' }>,
): string | null {
  const hero = heroeSuyo(state, player, action.hero);
  if ('motivo' in hero) return hero.motivo;
  const pieza = piezaSiExiste(action.item);
  if (pieza === null) return `no existe ninguna pieza "${action.item}"`;
  if (!hero.mochila.includes(pieza.id)) {
    return `${hero.name} no lleva ${pieza.nombre} en la mochila`;
  }
  const quien = destinoDeEquipo(hero, action);
  if ('motivo' in quien) return quien.motivo;
  return ponerseBlocker(hero, quien, pieza.id, action.hueco);
}

/**
 * Por qué el portador `quien` de `hero` no se puede poner la pieza `id` (que
 * existe), o `null`: la pregunta de siempre sobre lo que llevaría puesto, el
 * equipo de serie de su unidad incluido (`equipoDelPortadorBlocker`: un mandoble
 * no entra con el escudo de serie). La leen `equipBlocker` y la IA, antes de
 * equipar y antes de comprar para alguien.
 */
export function ponerseBlocker(
  hero: Hero,
  quien: Portador,
  id: string,
  hueco?: Hueco,
): string | null {
  const en = hueco ?? pieza(id).hueco;
  const llevaria = equipoPuestoDe(hero, quien, { ...equipoDe(hero, quien), [en]: id });
  return equipoDelPortadorBlocker(
    nombreDelPortador(hero, quien),
    llevaria,
    id,
    equipoDeSerieDe(hero, quien),
    en,
  );
}

/** Cómo se nombra al portador `quien` de `hero` en un motivo: el héroe o la unidad. */
function nombreDelPortador(hero: Hero, quien: Portador): string {
  if ('heroe' in quien) return hero.name;
  const t = hero.army[quien.indice] as Troop;
  return `esa unidad de ${unidadDelJuego(t.creature).name}`;
}

/** Por qué no se puede hacer ese `unequip`, o `null`. */
export function unequipBlocker(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'unequip' }>,
): string | null {
  const hero = heroeSuyo(state, player, action.hero);
  if ('motivo' in hero) return hero.motivo;
  const quien = destinoDeEquipo(hero, action);
  if ('motivo' in quien) return quien.motivo;
  const nombre = nombreDelPortador(hero, quien);
  const { [action.slot]: quitada, ...resto } = equipoDe(hero, quien);
  if (quitada === undefined) return nadaEnElHueco(nombre, action.slot);
  // Sin arma no se combate (todo golpe cuerpo a cuerpo pasa por la rueda, que va
  // con la del arma; 19-10-2026): lo que quede puesto, con lo de serie de su
  // unidad, tiene que llevar una. Quitar la propia de una tropa deja la de serie.
  return equipoDelPortadorBlocker(nombre, equipoPuestoDe(hero, quien, resto), null);
}

/**
 * Por qué no se puede hacer ese `formar`, o `null`. Se forma en cualquier sitio
 * fuera de batalla y sin gastar nada; el turno y el héroe de salida pendiente
 * los mira `applyAdventureAction`, como en `equip`. La casilla la juzga la regla
 * del despliegue (`colocarBlocker`) sobre la batalla de la formación: en el marco
 * del atacante y sin muralla, que es como se guarda; en un intercambio, también
 * si el otro cabe en la casilla que deja `quien`.
 */
export function formarBlocker(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'formar' }>,
): string | null {
  const juicio = juzgarFormar(state, player, action);
  return 'motivo' in juicio ? juicio.motivo : null;
}

/** Lo de `formarBlocker`, con la batalla de la formación que lo juzgó para que la acción la mueva. */
function juzgarFormar(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'formar' }>,
):
  | { readonly hero: Hero; readonly batalla: BattleState; readonly stack: BattleStack }
  | { readonly motivo: string } {
  const hero = heroeSuyo(state, player, action.hero);
  if ('motivo' in hero) return hero;
  const { quien, at } = action;
  if (!('heroe' in quien)) {
    const sinNadie = puestoBlocker(hero, quien.indice);
    if (sinNadie !== null) return { motivo: sinNadie };
  }
  const batalla = batallaDeLaFormacion(state, hero.id);
  const stack = stackDelPortador(batalla, quien);
  const motivo = colocarBlocker(batalla, stack.id, at);
  return motivo === null ? { hero, batalla, stack } : { motivo };
}

/**
 * La batalla que enseña la formación de `heroId`: su bando de atacante,
 * desplegando a mano, contra nadie. Lo que la tropa enseña es lo que saldrá,
 * porque es el mismo `createBattle` con el mismo `asentar` y las mismas cifras de
 * cada uno (de ellas, su zona); y sobre ella juzga y mueve `formar` con las
 * reglas del despliegue (`colocarBlocker`, `aplicarDespliegue`). La tanda del
 * atacante queda abierta y no se tira nada (el `rng`, de la semilla, no se llega
 * a usar). La leen la vista de la tropa, `formar` y `formacionDe`.
 */
export function batallaDeLaFormacion(state: GameState, heroId: string): BattleState {
  const hero = heroById(state, heroId);
  return createBattle(
    { ...battleSideForHero(state, hero, 'attacker'), despliegaAMano: true },
    { army: [], hero: null },
    createRng(state.seed),
    state.combate,
  );
}

/**
 * El stack de `quien` en una batalla de la formación (`batallaDeLaFormacion`):
 * el héroe por su origen y cada uno de la tropa por su puesto (`slot`). Con
 * `portadorDelStack`, la única traducción entre el portador y su figura del
 * tablero; nadie escribe los ids a mano.
 */
export function stackDelPortador(batalla: BattleState, quien: Portador): BattleStack {
  const s = batalla.stacks.find((x) =>
    'heroe' in quien
      ? x.origen.kind === 'heroe'
      : x.origen.kind !== 'heroe' && x.slot === quien.indice,
  );
  if (s === undefined) {
    const dicho = 'heroe' in quien ? 'el héroe' : `el puesto ${quien.indice}`;
    throw new Error(`la formación no tiene a ${dicho}`);
  }
  return s;
}

/** El portador de un stack de una batalla de la formación: la inversa de `stackDelPortador`. */
export function portadorDelStack(s: Pick<BattleStack, 'origen' | 'slot'>): Portador {
  return s.origen.kind === 'heroe' ? { heroe: true } : { indice: s.slot };
}

/**
 * Dónde sale cada uno de `hero` en el marco del atacante: lo guardado
 * (`Hero.salida`, `Troop.salida`) donde valga, y los demás por la regla de hoy en
 * un hueco libre. La tropa, por su puesto.
 */
export function formacionDe(
  state: GameState,
  hero: Hero,
): { readonly heroe: Hex; readonly tropa: readonly Hex[] } {
  const b = batallaDeLaFormacion(state, hero.id);
  return {
    heroe: stackDelPortador(b, { heroe: true }).hex,
    tropa: hero.army.map((_, indice) => stackDelPortador(b, { indice }).hex),
  };
}

/**
 * Por qué ese héroe no puede licenciar `count` × `creature` ahora, o `null`.
 * La frase es para la persona: la lanza la acción, y de ahí la leen la barra
 * del castillo (`session.ts` enseña el error del núcleo, no redacta) y el
 * agente en su veredicto.
 *
 * Solo en un castillo propio —la base u otro—: licenciar en mitad del camino
 * sería tirar tropa para pasar una emboscada más ligero, y lo que se pidió es
 * poder **cambiarla** por otra mejor, que es algo que se hace donde se recluta.
 */
function dismissBlocker(
  state: GameState,
  hero: Hero,
  creatureId: string,
  count: number,
): string | null {
  if (!Number.isSafeInteger(count) || count < 1) {
    return `son individuos: se licencian de 1 en adelante, no ${count}`;
  }
  const castillo = castilloSuyoDelHeroe(state, hero);
  if (castillo === undefined) {
    return `${hero.name} no está en un castillo suyo: la tropa se licencia en la base o en un castillo propio`;
  }
  // La frase dice el NOMBRE de la criatura y no su id: «"peasant"» era una
  // palabra en inglés en la barra del castillo. Un id que no está en el catálogo
  // —el agente puede mandar cualquier texto— se nombra tal cual, diciendo que no
  // existe, en vez de reventar en `unidadDelJuego` con un error que no es el motivo.
  const especie = unidadDelJuegoSiExiste(creatureId);
  if (especie === null) {
    return `no existe ninguna unidad "${creatureId}", así que ${hero.name} no lleva ninguna`;
  }
  const lleva = hero.army.filter((t) => t.creature === creatureId).length;
  if (lleva === 0) return `${hero.name} no lleva individuos de tipo ${especie.name}`;
  if (count > lleva) {
    return `${hero.name} lleva ${lleva} × ${especie.name} y no puede licenciar ${count}`;
  }
  return null;
}

/**
 * Por qué `quien` no puede contratar en `townId` un héroe del tipo `tipo` (sin él,
 * el de por defecto de la facción del pueblo), o `null` si puede. **La única
 * regla de contratar**, también la del héroe de salida: la leen `hireHero` (que
 * lanza con ella), la IA (`planHires`) y los candidatos de la pantalla
 * (`candidatosAHeroe`). No mira
 * el turno: eso es de `turnBlocker`.
 *
 * Con el de salida pendiente, solo en su base y con el oro; sin él, lo de
 * siempre: el tope de héroes y que no haya nadie dentro.
 */
export function contratarBlocker(
  state: GameState,
  quien: PlayerId,
  townId: string,
  tipo?: string,
): string | null {
  const town = townById(state, townId);
  const player = playerById(state, quien);
  // Ocupada, no se contrata (pregunta 4 de la tarea 2): lo dice su frase.
  const manda = ciudadQueMandaBlocker(state, town, player.id);
  if (manda !== null) return manda;
  if (player.heroeDeSalida !== null) {
    if (player.base !== town.id) {
      return `tu héroe de salida se elige en tu base, ${baseDe(state, player)}`;
    }
  } else {
    if (!hayHuecoDeHeroe(state, player.id)) {
      return `ya tienes el máximo de héroes (${MAX_HEROES_PER_PLAYER})`;
    }
    if (state.heroes.some((h) => pointKey(h.at) === pointKey(town.at))) {
      return `ya hay un héroe en ${town.name}`;
    }
  }
  if (tipo !== undefined) {
    const tipoMalo = problemaDeTipo(town.faction, tipo);
    if (tipoMalo !== null) return tipoMalo;
  }
  return oroBlocker(ECONOMIA.precioDelHeroe, player.oro);
}

/** El nombre de la base de `player`, o «ninguna» (para las frases). */
function baseDe(state: GameState, player: Player): string {
  return player.base === null ? 'que no tienes' : townById(state, player.base).name;
}

/**
 * Por qué `quien` no puede hacer nada más que elegir su héroe de salida, o `null`
 * si no lo tiene pendiente. La mira `applyAdventureAction` para toda acción salvo
 * `hire_hero`, y la enseña la pantalla en lo que apaga (reclutar, construir,
 * pasar el turno). Solo mira el de salida: sin héroes a media partida se juega.
 */
export function salidaPendienteBlocker(state: GameState, quien: PlayerId): string | null {
  const player = playerById(state, quien);
  if (player.heroeDeSalida === null) return null;
  return `antes de nada, elige a tu héroe de salida ante el ayuntamiento de ${baseDe(state, player)}`;
}

/**
 * Contrata en `townId` un héroe del tipo `tipo` para `quien`, pagando el precio de
 * todo héroe (`ECONOMIA.precioDelHeroe`). **La única puerta por la que entra un
 * héroe pagado**: la de salida y la de después.
 *
 * Con el de salida pendiente lo asienta: el que hizo `newGame` (nombre, cifras y
 * tropa de su tirada), con el tipo elegido, en su base, **sin hecho en la
 * crónica** (el de salida nunca lo tuvo). Sin él, uno nuevo, 1/1 y sin tropa.
 * Ninguno recoge la guarnición: la tropa entre héroe y sitio la mueven solo
 * `dejar_tropa`, `recoger_tropa` y la defensa (la recogida automática se retiró
 * el 04-11-2026).
 *
 * Sin esto, perder al único héroe deja al jugador inerte para siempre: conserva
 * el castillo, así que no está derrotado, pero no puede volver a mover una sola
 * pieza. La partida se quedaba encallada hasta el límite de días.
 */
function hireHero(state: GameState, quien: PlayerId, townId: string, tipo?: string): void {
  const motivo = contratarBlocker(state, quien, townId, tipo);
  if (motivo !== null) throw new Error(`no se puede contratar un héroe: ${motivo}`);
  const town = townById(state, townId);
  const player = playerById(state, quien);
  player.oro -= ECONOMIA.precioDelHeroe;

  const pendiente = player.heroeDeSalida;
  if (pendiente !== null) {
    const hero: Hero = { ...pendiente, tipo: tipo ?? pendiente.tipo };
    empezarElDia(hero);
    // En el orden de los jugadores, como cuando nacían todos juntos: quien lee
    // `state.heroes` (la IA, los paneles) ve lo mismo eligiendo que sin elegir.
    const puesto = state.players.findIndex((p) => p.id === player.id);
    const detras = state.heroes.findIndex(
      (h) => state.players.findIndex((p) => p.id === h.owner) > puesto,
    );
    state.heroes.splice(detras === -1 ? state.heroes.length : detras, 0, hero);
    player.heroeDeSalida = null;
    revealAround(state, hero);
    return;
  }

  // La `c` (de «contratado») lo separa del inicial, `hero-<jugador>`, y del
  // ascendido, `hero-veterano-<n>`: los tres viven en el mismo espacio de ids.
  const id = `hero-${player.id}-c${state.siguienteHeroe++}`;
  const hero = heroeRecienHecho({
    id,
    owner: player.id,
    name: nombreDelContratado(town),
    faction: town.faction,
    at: town.at,
    experience: EXPERIENCIA_INICIAL_DE_HEROE,
    tipo: tipo ?? tipoDeHeroePorDefecto(town.faction),
  });
  empezarElDia(hero);

  state.heroes.push(hero);
  emit(state, {
    kind: 'hero_hired',
    hero: id,
    town: town.id,
    actor: player.id,
    at: town.at,
  });

  revealAround(state, hero);
}

/** El nombre de un héroe contratado en `town`: lo leen `hireHero` y los candidatos. */
function nombreDelContratado(town: Town): string {
  return `Capitán de ${town.name}`;
}

/** Un tipo de héroe que se puede contratar en un pueblo: lo que enseña su ficha. */
export interface CandidatoAHeroe {
  /** El id de su tipo (`data/tipos-de-heroe.json`), el que lleva `hire_hero`. */
  readonly tipo: string;
  /** El nombre de su tipo y lo que dice de él el cuaderno. */
  readonly nombreDelTipo: string;
  readonly descripcion: string;
  readonly precio: number;
  /**
   * Si el tipo se infiltra (`tipoSeInfiltra`, `data/infiltradores.json`): con toda
   * su tropa con el rasgo, cruza barreras a un día por casilla (`hero/infiltracion.ts`).
   */
  readonly seInfiltra: boolean;
  /** Por qué no se puede contratar (`contratarBlocker`; el turno no), o `null`. */
  readonly motivo: string | null;
}

/** La elección de héroe en un pueblo: lo que no depende del tipo, una vez, y los candidatos. */
export interface EleccionDeHeroe {
  /** El nombre que llevará, sea cual sea el tipo: el del de salida o el del contratado. */
  readonly nombre: string;
  /**
   * La tropa con que sale el de salida, la misma con cualquier tipo; `null`: es
   * una contratación, y el contratado sale sin ninguna.
   */
  readonly tropa: Army | null;
  readonly candidatos: readonly CandidatoAHeroe[];
}

/**
 * Los héroes que `quien` puede contratar en `townId`: **uno por tipo** de la
 * facción del pueblo, en el orden del cuaderno (el de por defecto, el primero),
 * sin sorteo. La única lista de candidatos: la leen la escena del ayuntamiento y
 * su panel. Todos cuestan lo mismo y salen con lo mismo; lo que cambia es la
 * figura, el texto y si se infiltra (la única regla que da un tipo, 05-11-2026).
 * No mira el turno: eso lo pone
 * quien enseña la lista (la sesión sabe además del turno del rival en curso).
 */
export function candidatosAHeroe(
  state: GameState,
  quien: PlayerId,
  townId: string,
): EleccionDeHeroe {
  const town = townById(state, townId);
  const pendiente = playerById(state, quien).heroeDeSalida;
  return {
    nombre: pendiente?.name ?? nombreDelContratado(town),
    tropa: pendiente?.army ?? null,
    candidatos: tiposDeHeroe(town.faction).map((t) => ({
      tipo: t.id,
      nombreDelTipo: t.nombre,
      descripcion: t.descripcion,
      precio: ECONOMIA.precioDelHeroe,
      seInfiltra: tipoSeInfiltra(town.faction, t.id),
      motivo: contratarBlocker(state, quien, townId, t.id),
    })),
  };
}

/**
 * Los veteranos de rango máximo que `player` tiene en su base ahora mismo: en la
 * guarnición y en la tropa de su héroe que está allí (`veteranosEn`). Sin base,
 * ninguno: no hay dónde hacerse héroe.
 */
export function veteranosEnSuBase(state: GameState, player: PlayerId): VeteranoEnBase[] {
  const base = baseOf(state, player);
  return base === null
    ? []
    : veteranosEn(base, guarnicionDe(state, sitioDeLaCiudad(base)), heroeEnElPueblo(state, base));
}

/**
 * El veterano `veteranoId` de `player`, si puede hacerse héroe sea del tipo que
 * sea, o por qué no: la base, el nivel y el hueco de héroe. **La única búsqueda
 * del veterano**, que leen `ascensoBlocker` para la frase y `ascenderVeterano`
 * para el resultado, sin volver a buscarlo.
 *
 * «No está en tu base» cubre también al que ya se hizo héroe: al ascender sale
 * de la tropa, así que un segundo intento con el mismo id no lo encuentra. Es lo
 * que hace que un individuo no dé dos héroes, sin un registro aparte que
 * mantener al día.
 */
function ascensoPosible(
  state: GameState,
  player: PlayerId,
  veteranoId: string,
): VeteranoEnBase | { readonly motivo: string } {
  if (baseOf(state, player) === null) {
    return { motivo: 'no tienes base: un veterano solo se hace héroe en ella' };
  }
  const v = veteranosEnSuBase(state, player).find((x) => x.veterania.id === veteranoId);
  if (v === undefined) {
    return {
      motivo: `el veterano "${veteranoId}" no está en tu base con rango ${RANGO_MAXIMO_DE_TROPA}: solo se hace héroe quien llega al tope y está allí`,
    };
  }
  if (!hayHuecoDeHeroe(state, player)) {
    return {
      motivo: `ya tienes ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes: el veterano espera en la base hasta que haya sitio`,
    };
  }
  return v;
}

/**
 * Por qué el veterano `veteranoId` de `player` no puede hacerse héroe de tipo
 * `heroType`, o `null` si puede. **La única que lo decide**: la lee
 * `ascenderVeterano` para lanzar, y su frase es la que el director le devuelve
 * al narrador. Por eso está escrita para que la lea él.
 */
export function ascensoBlocker(
  state: GameState,
  player: PlayerId,
  veteranoId: string,
  heroType: string,
): string | null {
  const posible = ascensoPosible(state, player, veteranoId);
  if ('motivo' in posible) return posible.motivo;
  return problemaDeTipo(playerById(state, player).faction, heroType);
}

/**
 * El veterano `veteranoId` de `player` se hace héroe con lo que eligió el
 * narrador: **nace en la base** —en su casilla o, si la ocupa otro héroe, en la
 * primera libre de al lado (`casillaDeVuelta`)—, con la experiencia del
 * individuo (la del tope o más, así que héroe de ese nivel o más: una sola
 * escala), las cifras del contratado, el ejército vacío y **sin movimiento** el
 * día en que nace. El individuo sale de donde estaba: la guarnición o la tropa
 * del héroe que lo llevaba.
 *
 * **Nadie recoge la guarnición** (04-11-2026): recogía el de la casilla del
 * castillo porque con el héroe dentro la ciudad la defendía «solo él con su
 * tropa», y la guarnición se quedaba fuera de la batalla. Desde que el héroe que
 * defiende su sitio elige con quién de su ejército y de la guarnición
 * (`defensaDeLaIA`, `elegirLaDefensa`), la guarnición pelea aunque no la lleve.
 *
 * El id es `hero-<id del veterano>`, único porque el del veterano lo es y porque
 * el individuo sale de la tropa al ascender; el de `hireHero` es
 * `hero-<jugador>-c<n>`, con su propio contador (`siguienteHeroe`).
 *
 * Lanza con la frase de `ascensoBlocker` si no puede.
 */
export function ascenderVeterano(
  state: GameState,
  player: PlayerId,
  veteranoId: string,
  eleccion: { readonly name: string; readonly story: string; readonly heroType: string },
): Hero {
  // Las dos mitades de `ascensoBlocker`, en su orden, sin buscar dos veces.
  const v = ascensoPosible(state, player, veteranoId);
  if ('motivo' in v) throw new Error(`no se puede hacer héroe: ${v.motivo}`);
  const tipoMalo = problemaDeTipo(playerById(state, player).faction, eleccion.heroType);
  if (tipoMalo !== null) throw new Error(`no se puede hacer héroe: ${tipoMalo}`);

  const fuera = (army: Army): Army => army.filter((t) => t.veterania?.id !== veteranoId);
  if (v.heroe === null) {
    const sitio = sitioDeLaCiudad(v.base);
    ponerLaGuarnicion(state, sitio, player, fuera(guarnicionDe(state, sitio)));
  } else {
    const portador = heroById(state, v.heroe);
    portador.army = fuera(portador.army);
  }

  const hero = heroeRecienHecho({
    id: `hero-${veteranoId}`,
    owner: player,
    name: eleccion.name,
    faction: playerById(state, player).faction,
    at: v.base.at,
    experience: v.veterania.experiencia,
    tipo: eleccion.heroType,
    origen: { creature: v.creature, historia: eleccion.story },
  });
  // Nace con su equipo base, como todo héroe (`heroeRecienHecho`), y lo que
  // llevaba puesto de tropa se lo lleva en la mochila: es suyo, y el usuario lo
  // pidió así en vez de que sustituyera al base.
  aLaMochila(hero, ...idsPuestos(v.veterania.equipo));
  hero.at = casillaDeVuelta(state, hero, v.base);
  state.heroes.push(hero);
  emit(state, {
    kind: 'hero_promoted',
    hero: hero.id,
    town: v.base.id,
    creature: v.creature,
    name: hero.name,
    actor: player,
    at: hero.at,
  });
  revealAround(state, hero);
  return hero;
}

/**
 * Las casillas que un héroe de `player` puede **alcanzar pero no cruzar**: lo
 * que `enemyAt` da por batalla y el mapa no sabe —un héroe ajeno, un castillo
 * ajeno con guarnición y un paso o un pueblo con guarnición ajena—. Los
 * monstruos ya los bloquea el mapa.
 *
 * Existe para que nadie se meta en una batalla que no eligió a mitad de un
 * paso estrecho: con los pasos de la red, un héroe plantado junto a uno es una
 * batalla para todo el que lo cruce, y la semilla 54 del barrido no terminaba
 * —248 derrotas chocando en el mismo paso—. Antes el Dijkstra los cruzaba y
 * solo la IA se defendía, con
 * una segunda pasada por la cadena de predecesores de cada candidato
 * descartando lo que pasara por encima de uno: 147 de los 209 ms de
 * `chooseHeroDestination`, y la persona y el agente sin la misma defensa.
 */
export function casillasHostiles(state: GameState, player: PlayerId): Point[] {
  // Una casilla, una vez: el héroe rival en su ciudad es también la guarnición de
  // ella (desde que la de la ciudad vive en `GameState.guarniciones`), y repetida
  // `porQueNoLlega` lo nombraba dos veces.
  const vistas = new Set<string>();
  const out: Point[] = [];
  const poner = (at: Point): void => {
    const k = pointKey(at);
    if (vistas.has(k)) return;
    vistas.add(k);
    out.push(at);
  };
  for (const h of state.heroes) if (h.owner !== player) poner(h.at);
  for (const at of guarnicionesAjenas(state, player)) poner(at);
  // Un grupo de asaltantes es hostil para todos: se alcanza —atacarlo es
  // pedirlo de destino— y no se cruza.
  for (const r of state.raiders) poner(r.at);
  return out;
}

/**
 * Las casillas de las ciudades, pasos y pueblos con guarnición hostil para
 * `player` (`guarnicionHostil`, la regla que leen también `enemyAt`, `queLoCierra`
 * y la IA), en el orden de los objetos del mapa.
 */
function guarnicionesAjenas(state: GameState, player: PlayerId): Point[] {
  const out: Point[] = [];
  for (const o of state.map.objects) {
    if (o.kind !== 'node' && o.kind !== 'village' && o.kind !== 'town') continue;
    if (guarnicionHostil(state, o.id, player) !== null) out.push(o.at);
  }
  return out;
}

/**
 * Todo lo que alcanza un héroe desde donde está, con lo hostil de la partida
 * (`casillasHostiles`) como final de trayecto. Es el alcance de la IA y de
 * quien quiera mirar a dónde llega un héroe.
 *
 * Con `evitarEmboscadas`, es el alcance **prudente** de la IA: las regiones
 * donde a este héroe lo emboscarían (`casillasPeligrosas`) no se pisan. Solo
 * endurece —se llega a menos sitios, nunca a más—, así que lo hostil sigue sin
 * cruzarse. Es una opción y no una segunda función porque es
 * el mismo Dijkstra con una marca más, y el Dijkstra del mapa solo se lanza
 * desde aquí (`test/invariantes.test.ts`).
 */
export function alcanceDelHeroe(
  state: GameState,
  hero: Hero,
  opciones: { readonly evitarEmboscadas?: boolean } = {},
): Reachable {
  const peligro =
    opciones.evitarEmboscadas === true
      ? casillasPeligrosas(state, hero, playerById(state, hero.owner).asaltantesVistos)
      : null;
  return alcanceConPrecio(state, hero, peligro, precioDeLaBarrera(hero));
}

/** `alcanceDelHeroe` con el precio de la barrera ya sabido: `porQueNoLlega` lo pide una vez. */
function alcanceConPrecio(
  state: GameState,
  hero: Hero,
  peligro: Uint8Array | null,
  barrera: number | null,
): Reachable {
  return reachableFrom(state.map, hero.at, casillasHostiles(state, hero.owner), peligro, barrera);
}

/**
 * El camino de un héroe hasta `to`, con lo hostil como final de trayecto: el
 * mismo que va a andar `move_hero`. Lo pide la pantalla para enseñar la ruta.
 */
export function caminoHasta(state: GameState, hero: Hero, to: Point): PathStep[] | null {
  return caminoEsquivando(
    state,
    hero,
    to,
    casillasHostiles(state, hero.owner),
    precioDeLaBarrera(hero),
  );
}

/**
 * El Dijkstra del héroe con una lista de hostiles **elegida a mano**. No se
 * exporta, y es a propósito: fuera de aquí la lista es siempre la de la partida
 * (`caminoHasta`), y con esta abierta cualquiera podría pasarle `[]` y cruzar
 * por encima de una guarnición. Solo la usa, además, `porQueNoLlega`, que
 * necesita preguntar «¿y si este no estuviera?» para saber a quién culpar, y
 * «¿y si se infiltrara?» (`barrera`, el precio de la barrera, que se pide una vez).
 */
function caminoEsquivando(
  state: GameState,
  hero: Hero,
  to: Point,
  hostiles: readonly Point[],
  barrera: number | null,
): PathStep[] | null {
  return findPath(state.map, hero.at, to, hostiles, barrera);
}

/**
 * Cuántos pasos de `camino` se pagan hoy con los puntos que le quedan a `hero`:
 * el héroe anda eso y lo demás es de otro día. El coste del camino es acumulado
 * y creciente, así que lo de hoy es siempre un prefijo. Lo leen la marcha
 * (`moveHero`) y la ruta que se pinta, y tienen que decir lo mismo.
 */
export function pasosDeHoy(camino: readonly PathStep[], hero: Hero): number {
  const primeroQueNo = camino.findIndex((paso) => paso.cost > hero.movePoints);
  return primeroQueNo === -1 ? camino.length : primeroQueNo;
}

/** «(6,5) es montaña y cuesta el día entero de marcha»: la casilla de barrera `at`, dicha. */
function laBarrera(at: Point, barrera: Barrera): string {
  return `(${at.x},${at.y}) es ${NOMBRE_DE_BARRERA[barrera]} y cuesta el día entero de marcha`;
}

/**
 * Si la marcha de hoy por `camino` (`hoy`, de `pasosDeHoy`) se para ante una
 * barrera —el primer paso de otro día es una casilla de barrera, que quien se
 * infiltra paga con el día entero (`hero/infiltracion.ts`)—, por qué, dicho para
 * la persona: «(6,5) es montaña y cuesta el día entero de marcha: se entra
 * mañana». Si no, `null`. La lee la ruta que se pinta (`Session.previewPath`):
 * pararse en el borde con casi todo el movimiento no se entendía (H2 de la vuelta
 * 1 de QA, 05-11-2026). Mañana se entra siempre: el día empieza con su precio.
 */
export function barreraDeMañana(
  map: GameMap,
  camino: readonly PathStep[],
  hoy: number,
): string | null {
  const paso = camino[hoy];
  const barrera = paso === undefined ? null : barreraEn(map, paso.at);
  return paso === undefined || barrera === null
    ? null
    : `${laBarrera(paso.at, barrera)}: se entra mañana`;
}

/**
 * ¿Puede `hero` dar hoy al menos un paso? Es la pregunta de «te quedan héroes
 * con movimiento» al pasar el turno (#17), y no es `movePoints > 0`: con 40
 * puntos y la casilla más barata a 100, el héroe no anda, y avisar por él era
 * pedir a la persona que mirase a uno que no puede hacer nada. Se responde con
 * el mismo alcance que la marcha (`alcanceDelHeroe`), así que lo hostil cuenta
 * como destino de un paso —atacarlo es moverse—, igual que en `move_hero`.
 */
export function puedeAndarHoy(state: GameState, hero: Hero): boolean {
  if (hero.movePoints <= 0) return false;
  const alcance = alcanceDelHeroe(state, hero);
  // La primera descubierta es el origen, que cuesta 0 y no es un paso.
  return alcance.descubiertas.some(
    (i, n) => n > 0 && (alcance.costes[i] ?? Number.POSITIVE_INFINITY) <= hero.movePoints,
  );
}

/**
 * Por qué `hero` no llega a `to`, en una frase para la persona, o el agente.
 *
 * Decía siempre «no hay camino hasta (x,y)», y con «lo hostil se alcanza pero
 * no se cruza» eso es falso a la vista: el camino existe, lo cierra una ciudad
 * guarnecida o un héroe rival plantado en el paso (M2 de la QA de la 2a).
 * Ahora se nombra quién. Se pregunta en tres pasos, y solo cuando ya se sabe
 * que no hay camino, así que el coste lo paga el rechazo y no la marcha:
 *
 *  1. Sin nada hostil, ¿se llega? Si no, el mapa no da paso y no hay a quién
 *     culpar, salvo que lo abriera infiltrarse: entonces se dice por qué este
 *     grupo no se infiltra (`infiltracionBlocker`).
 *  2. Lo hostil que el héroe **alcanza**: lo que tiene delante.
 *  3. De eso, lo que basta quitar para pasar. Si nada basta solo —dos héroes
 *     guardando los dos pasos de una región—, son todos los de delante.
 */
export function porQueNoLlega(state: GameState, hero: Hero, to: Point): string {
  // La muralla de una ciudad no se pisa: se dice, con sus puertas.
  const muro = muroBlocker(state.map, to, (at) => {
    const ciudad = state.towns.find((t) => pointKey(t.at) === pointKey(at));
    return ciudad === undefined ? `la ciudad de (${at.x},${at.y})` : ciudad.name;
  });
  if (muro !== null) return muro;
  const frase = `no hay camino hasta (${to.x},${to.y})`;
  const barrera = precioDeLaBarrera(hero);
  if (caminoEsquivando(state, hero, to, [], barrera) === null) {
    // Una barrera la cruza solo quien se infiltra: si infiltrándose llegaría, se
    // dice por qué este grupo no (con su marcha del día de precio, la que pagaría).
    const motivo = barrera === null ? infiltracionBlocker(hero) : null;
    if (motivo === null || caminoEsquivando(state, hero, to, [], hero.marchaDelDia) === null) {
      return frase;
    }
    return `${frase} sin cruzar una barrera: solo la cruza un grupo que se infiltra, y ${motivo}`;
  }
  const hostiles = casillasHostiles(state, hero.owner);
  const alcance = alcanceConPrecio(state, hero, null, barrera);
  const delante = hostiles.filter((h) => costeEnElAlcance(alcance, h) !== null);
  const bastan = delante.filter(
    (h) =>
      caminoEsquivando(
        state,
        hero,
        to,
        hostiles.filter((o) => pointKey(o) !== pointKey(h)),
        barrera,
      ) !== null,
  );
  const cierran = (bastan.length > 0 ? bastan : delante).map((at) => queLoCierra(state, hero, at));
  if (cierran.length === 0) return frase;
  return `${frase}: ${cierran.length === 1 ? 'lo cierra' : 'lo cierran'} ${enumerar(cierran)}`;
}

/** Qué hostil hay en esa casilla, con nombre: el héroe va antes, como en `enemyAt`. */
function queLoCierra(state: GameState, hero: Hero, at: Point): string {
  const donde = `en (${at.x},${at.y})`;
  const rival = state.heroes.find((h) => h.owner !== hero.owner && pointKey(h.at) === pointKey(at));
  if (rival !== undefined) return `el héroe rival ${rival.name} ${donde}`;
  const sitio = sitioEn(state, at);
  if (sitio !== null && guarnicionHostil(state, sitio, hero.owner) !== null) {
    return sitio.kind === 'ciudad'
      ? `la ciudad ${sitio.town.name}, con guarnición, ${donde}`
      : `${nombreDelSitio(sitio)}, con guarnición`;
  }
  if (state.raiders.some((r) => pointKey(r.at) === pointKey(at))) {
    return `un grupo de asaltantes ${donde}`;
  }
  throw new Error(
    `(${at.x},${at.y}) se tiene por hostil y no hay en ella ni héroe, ni ciudad, ni guarnición, ni asaltantes`,
  );
}

/**
 * El camino del héroe: del recorrido que trae el llamante, o de uno nuevo.
 *
 * La pista **no es un atajo que se salte una regla**: es el mismo Dijkstra que
 * lanzaría esta puerta, ya hecho. `reachableFrom` tiene un solo constructor en
 * `core`, así que desconfiar de sus costes sería `core` desconfiando de `core`;
 * lo que el llamante sí puede equivocar es **de qué origen** viene el alcance
 * —reutilizar el de antes de moverse—, y eso es lo único que se comprueba.
 *
 * Existe porque la IA ya recorre el mapa desde el héroe para decidir a dónde
 * va, y nueve líneas después esta puerta lo recorría otra vez desde el mismo
 * sitio hasta el mismo destino: 868 de las 1 028 llamadas a `findPath` de 40
 * partidas, el 6,5 % del banco.
 */
function caminoDelHeroe(
  state: GameState,
  hero: Hero,
  to: Point,
  alcance: Reachable | undefined,
): PathStep[] | null {
  if (alcance === undefined) return caminoHasta(state, hero, to);
  if (costeEnElAlcance(alcance, hero.at) !== 0) {
    throw new Error(
      `el alcance que traes no sale de donde está ${hero.name}: (${hero.at.x},${hero.at.y})`,
    );
  }
  return pathFromReachable(state.map, alcance, hero.at, to);
}

function moveHero(
  state: GameState,
  heroId: string,
  to: Point,
  ctx: GameContext,
  alcance?: Reachable,
): void {
  const hero = heroById(state, heroId);
  const player = currentPlayer(state);
  if (hero.owner !== player.id) throw new Error('ese héroe no es tuyo');

  const camino = caminoDelHeroe(state, hero, to, alcance);
  if (camino === null) throw new Error(porQueNoLlega(state, hero, to));
  if (camino.length === 0) return;
  // El héroe anda lo que le dé el día y la marcha entra aunque no llegue: se
  // lanza solo si no da ni un paso, antes de tocar nada.
  const hoy = pasosDeHoy(camino, hero);
  if (hoy === 0) {
    // Qué cuesta el primero y qué queda: con una barrera delante (quien se
    // infiltra la paga con el día entero) no se adivinaría por qué no anda. Sin
    // «no quedan puntos», que con 1436 de 1616 se leía contradictorio (H2 de la
    // vuelta 1 de QA).
    const { at, cost } = camino[0] as PathStep;
    const barrera = barreraEn(state.map, at);
    throw new Error(
      `${hero.name} hoy no da ni un paso: ${
        barrera === null
          ? `el primero, a (${at.x},${at.y}), cuesta ${cost} y le quedan ${hero.movePoints}`
          : `${laBarrera(at, barrera)} (${cost}), y le quedan ${hero.movePoints}; se entra mañana`
      }`,
    );
  }

  // Si por el camino se ve un grupo que la emboscaría y que la ruta no avisaba,
  // la marcha se para donde lo ve (#130; la regla, en `vigiaDeLaMarcha`). Casi
  // siempre no hay —la IA no pisa las regiones de los que ha visto—, y entonces el bucle no paga
  // nada. De un solo paso no hay «más adelante», y mirarlo mediría la fuerza
  // del héroe antes que la batalla, que es quien tiene que lanzar si su
  // ejército no vale.
  const seVe = (at: Point): boolean => visibleNowAt(state, player.id, at);
  const vigia = camino.length > 1 ? vigiaDeLaMarcha(state, hero, camino, seVe) : null;

  for (let i = 0; i < hoy; i++) {
    const paso = camino[i] as (typeof camino)[number];
    const coste = paso.cost - (camino[i - 1]?.cost ?? 0);

    // Un enemigo en la casilla destino desencadena batalla y detiene la marcha.
    const enemigo = enemyAt(state, paso.at, player.id);
    if (enemigo !== null) {
      hero.movePoints -= coste;
      abrirBatalla(state, { attacker: { kind: 'hero', heroId: hero.id }, foe: enemigo }, ctx);
      return;
    }

    hero.movePoints -= coste;
    hero.at = paso.at;
    revealAround(state, hero);
    emit(state, {
      kind: 'hero_moved',
      hero: hero.id,
      to: paso.at,
      spent: coste,
      actor: hero.owner,
      at: paso.at,
    });
    const antesDeRecoger = state.log.length;
    collectAt(state, hero, paso.at);
    // Desde que el castillo no bloquea, se puede tomar la base del rival a
    // MITAD de camino, y eso acaba la partida: seguir andando escribiría
    // `hero_moved` debajo del `game_over`, que `emit` ya no deja escribir.
    if (state.finished !== null) return;
    // Pisar la región de un grupo que le saca el margen es la emboscada: el
    // grupo ataca, el héroe defiende y la marcha se para aquí. Después de
    // `collectAt` porque esa casilla ya es suya —ha llegado—, y un nodo tomado
    // de camino pudo dispersar al grupo antes de que lo viera.
    const asaltante = emboscador(state, hero);
    if (asaltante !== null) {
      emboscar(state, asaltante, hero, camino.length - 1 - i, ctx);
      return;
    }
    if (vigia === null || i === camino.length - 1) continue;
    // Ver por el camino al que la emboscaría para la marcha aquí, con lo andado
    // ya andado y gastado: la ruta no lo avisaba al salir, y quien la pidió
    // tiene ocasión de cambiar de idea (#130). Lo que recoge el paso —un cofre, un
    // nodo que dispersa grupos— puede cambiar quién la emboscaría, y siempre deja
    // un hecho en la crónica. También en el último paso de hoy: la parada gana al
    // `march_cut`, porque dice por qué conviene no seguir y no solo que se acabó
    // el día.
    const visto = vigia(i + 1, state.log.length > antesDeRecoger);
    if (visto !== null) {
      emit(state, {
        kind: 'march_halted',
        hero: hero.id,
        raider: visto.id,
        troops: visto.troops,
        actor: hero.owner,
        at: hero.at,
      });
      return;
    }
  }
  // Llegó al final de lo de hoy sin batalla, ni parada, ni final: si el camino
  // seguía, se dice aquí, que es donde se sabe por qué paró.
  if (hoy < camino.length) {
    emit(state, {
      kind: 'march_cut',
      hero: hero.id,
      faltan: camino.length - hoy,
      actor: hero.owner,
      at: hero.at,
    });
  }
}

/**
 * Qué hay de hostil en esa casilla, si algo.
 *
 * **El héroe va antes que el sitio**: si atacan una ciudad, un paso o un pueblo
 * con el héroe del dueño dentro, la batalla es contra él, y defiende con quien
 * elija de su ejército y de la guarnición (`defensaDeLaIA` al nacer la batalla,
 * `elegirLaDefensa` si la rehace la persona; D1 del puesto fronterizo, 04-11-2026).
 * Si pierde, `applyVictory` entrega el sitio y lo que no eligió se pierde con él.
 * Sustituye a la regla de antes («con el héroe dentro defiende solo él con su
 * tropa», I2 de la 2a), que dejaba fuera a la guarnición.
 *
 * Sin héroe, la guarnición entera de la ciudad, el paso o el pueblo, si no es de
 * quien llega (`garrison`, D2; también la neutral de una ciudad neutral, y la que
 * ocupa un sitio que ya es de quien llega: P1 de la tarea 2). Un héroe enemigo en
 * un sitio de quien llega es el que lo ocupa: pelear con él es recuperarlo.
 */
function enemyAt(state: GameState, at: Point, player: PlayerId): BattleFoe | null {
  const obj = objectAt(state.map, at);
  if (obj !== undefined && obj.kind === 'monster' && !obj.defeated) {
    return { kind: 'monster', objectId: obj.id };
  }

  const asaltante = state.raiders.find((r) => pointKey(r.at) === pointKey(at));
  if (asaltante !== undefined) return { kind: 'raider', raiderId: asaltante.id };

  const heroeEnemigo = heroeAjenoEn(state, at, player);
  if (heroeEnemigo !== undefined) return { kind: 'hero', heroId: heroeEnemigo.id };

  const sitio = sitioEn(state, at);
  if (sitio !== null && guarnicionHostil(state, sitio, player) !== null) {
    return { kind: 'garrison', site: idDelSitio(sitio) };
  }
  return null;
}

/**
 * Lo que pasa al pisar una casilla: se recoge el cofre y se toma el sitio del muro
 * (el paso, y la ciudad o el pueblo en el muro) que no es suyo y no tiene
 * guarnición hostil (con ella, la casilla es hostil y antes hay batalla).
 *
 * Corre en **cada casilla del camino**, no solo en la última, y es lo que hace
 * que un nodo se tome cruzándolo. La tropa de casa ya no se recoge al pasar
 * (04-11-2026): se recoge parando, con `recoger_tropa`. Una ciudad o un pueblo de
 * dentro de una región no se toman (es de quien tenga su región): el héroe de otro
 * bando que se queda en su casilla lo ocupa (`ocupanteDe`), sin quedárselo.
 */
function collectAt(state: GameState, hero: Hero, at: Point): void {
  const player = playerById(state, hero.owner);
  const obj = objectAt(state.map, at);

  if (obj !== undefined) {
    switch (obj.kind) {
      case 'chest':
        if (!obj.taken) {
          obj.taken = true;
          player.oro += obj.gold;
          emit(state, {
            kind: 'gold_gained',
            amount: obj.gold,
            actor: player.id,
            at,
          });
        }
        break;
      default:
        break;
    }
  }

  const sitio = sitioEn(state, at);
  if (sitio !== null && enUnNodo(state, sitio) && dueñoDelSitio(state, sitio) !== player.id) {
    tomarElNodo(state, sitio, player.id);
    if (sitio.kind === 'ciudad') checkDefeat(state);
  }
}

/**
 * El sitio que pierde quien lo guardaba pasa a `ganador`, con lo que se quedó en
 * él: el del muro (el paso, la base, la ciudad-puente, el pueblo en un nodo), por
 * `tomarElNodo`, que borra su guarnición; el de dentro de una región, que no es de
 * nadie por sí mismo, se queda sin guarnición (`quitarLaGuarnicion`) y es de quien
 * tenga su región. Lo llaman las dos batallas que se pierden en un sitio: la del
 * héroe que lo defendía y la de la guarnición sola.
 */
function entregarElSitio(state: GameState, sitio: Sitio, ganador: PlayerId): void {
  if (enUnNodo(state, sitio)) tomarElNodo(state, sitio, ganador);
  else quitarLaGuarnicion(state, idDelSitio(sitio));
}

/**
 * El dueño de ayer de un sitio del muro **vio caerlo**: lo miraba desde él
 * mismo (un nodo y un castillo propios miran a 6) hasta el instante en que cambió
 * de bandera, así que su recuerdo es ya la bandera nueva, de hoy. Sin esto, el mapa
 * le seguía pintando el nodo como suyo hasta que alguien suyo volviera a mirarlo
 * (H1 de la vuelta 1 de QA de la niebla por regiones, 02-11-2026: en 63 de 87
 * nodos quitados). Lo de alrededor no: deja de mirarlo con la bandera.
 */
function vioCaerlo(state: GameState, anterior: PlayerId | null, obj: MapObject): void {
  if (anterior === null) return;
  playerById(state, anterior).memory.set(obj.id, recuerdoDe(state, obj));
}

/**
 * Cambia de dueño un sitio del muro: un paso, una ciudad o un pueblo en un nodo.
 * **El único escritor del `owner` de un objeto del mapa** (lo vigila
 * `test/invariantes.test.ts`): es la regla de «un hecho, un sitio», y desde la
 * tarea 2 (05-11-2026) la ciudad tiene una sola cara —su objeto— como el paso:
 * `Town.owner` se fue, y con él las dos copias que divergían en la primera captura
 * (#47: la IA veía enemigo su propio castillo y se pasaba la partida entrando en
 * casa). Un sitio de dentro de una región no se toma: lanza.
 *
 * De quién era se lee ANTES de escribir el dueño nuevo: después ya no hay a quién
 * preguntárselo, y es el dato con el que su dueño de ayer se entera.
 *
 * El sitio tomado pierde la guarnición que tuviera (`quitarLaGuarnicion`): la del
 * dueño de antes, vencida o la que no eligió para defenderlo (D1), o la neutral.
 * Así la guarnición de un sitio del muro es siempre de su dueño. La ciudad mira
 * alrededor con su dueño nuevo.
 */
function tomarElNodo(state: GameState, sitio: Sitio, player: PlayerId): void {
  if (!enUnNodo(state, sitio)) {
    throw new Error(
      `${nombreDelSitio(sitio)} está dentro de una región: no se toma, es de quien tenga la región`,
    );
  }
  const objeto = objetoDelSitio(state, sitio);
  const anterior = objeto.owner;
  objeto.owner = player;
  quitarLaGuarnicion(state, objeto.id);
  // Quien lo toma ya mira desde él, y quien lo pierde vio caer su bandera (la
  // niebla por regiones de main, 02-11-2026), antes de contarlo.
  if (sitio.kind === 'ciudad') revealAroundTown(state, sitio.town);
  else if (objeto.kind === 'node') revealAroundNode(state, objeto);
  vioCaerlo(state, anterior, objeto);
  if (sitio.kind === 'ciudad') {
    emit(state, {
      kind: 'town_captured',
      town: sitio.town.id,
      from: anterior,
      actor: player,
      at: sitio.town.at,
    });
  } else {
    emit(state, {
      kind: 'node_captured',
      node: objeto.id,
      from: anterior,
      actor: player,
      at: objeto.at,
    });
  }
  // Un nodo que cambia de dueño puede cerrar una región, y los grupos que la
  // patrullaban se van. Antes de la nota de abajo y sin ser una derrota.
  dispersarAsaltantes(state);
  // Sin `checkDefeat` aquí, y es a propósito: la captura es UNA parte de lo que
  // pasa, y quien la llama comprueba la derrota al acabar lo suyo. Tomar la base
  // con su héroe dentro es capturar **y después** derrotar al héroe; si la
  // derrota se mirase aquí, `game_over` saldría antes que `hero_defeated`, y
  // eso `emit` ya no lo deja escribir.
}

// ---------------------------------------------------------------- batallas

/**
 * La base de un jugador, si todavía es suya; `null` si no la tuvo nunca o la
 * ha perdido. El dueño se pregunta a `dueñoDeLaCiudad` (la base está en el muro:
 * el de su objeto, que escribe `tomarElNodo`).
 */
export function baseOf(state: GameState, player: PlayerId): Town | null {
  const id = playerById(state, player).base;
  if (id === null) return null;
  const town = townById(state, id);
  return dueñoDeLaCiudad(state, town) === player ? town : null;
}

/**
 * Si el héroe puede rendirse, y con cuánto oro; o por qué no. Rendirse es
 * volver a la base, así que sin base no hay rendición, y defendiéndola
 * tampoco: no hay a dónde huir.
 *
 * Se mira dónde está el héroe y **en qué bando**, no solo dónde está: un
 * atacante que sale de su castillo a por algo pegado a la muralla también está
 * en su base, y ese sí puede rendirse —vuelve con lo que salve—. Mirar solo
 * `hero.at` se probó y cambiaba 318 líneas del volcado del banco, la primera en
 * la semilla 5, justo por esas salidas.
 */
function retiradaDe(
  state: GameState,
  hero: Hero,
  side: Side,
): { readonly purse: number } | { readonly blocked: string } {
  const base = baseOf(state, hero.owner);
  if (base === null) return { blocked: 'no tienes base a la que volver' };
  if (side === 'defender' && pointKey(base.at) === pointKey(hero.at)) {
    return { blocked: 'defiendes tu base: no hay a dónde huir' };
  }
  return { purse: playerById(state, hero.owner).oro };
}

function battleSideForHero(state: GameState, hero: Hero, side: Side): BattleSide {
  const pueblo = castilloSuyoDelHeroe(state, hero);
  return {
    army: troopsAsStacks(hero.army),
    hero: {
      ...cuerposDelHeroe(hero),
      mando: mandoDe(hero, retiradaDe(state, hero, side)),
      figura: figuraDelHeroe(hero),
      ...(hero.salida === undefined ? {} : { salida: hero.salida }),
    },
    moraleBonus: moraleBonus(hero) + (pueblo === undefined ? 0 : moraleFromBuildings(pueblo)),
  };
}

/**
 * La vuelta de `battleSideForHero`: lo que la batalla mutó y el héroe del mapa
 * se lleva puesto.
 *
 * Vive pegada a la ida porque la inversa estaba escrita DOS veces —el atacante
 * en `settleBattle` y el defensor que sobrevive en `applyDefenderSurvivors`— y
 * la línea del maná hubo que añadirla a cada copia por separado. El camino del
 * defensor solo se ejecuta cuando el atacante pierde, así que el próximo campo
 * que la batalla mute se habría añadido a uno de los dos sitios y habría llegado
 * a partida en verde. Hoy la llama solo `settleBattle`, para los dos héroes.
 */
function restoreHeroFromBattle(mapHero: Hero, battleHero: BattleHero | null, army: Army): void {
  mapHero.army = army;
  // `battleSideForHero` copia el héroe a un objeto aparte, así que lo que se
  // gastó en la batalla no ha tocado al del mapa: hay que traerlo. Sin esta
  // línea el héroe gastaba 12 lanzando y volvía con 20/20 — la magia sería
  // gratis y la recarga del gremio, un adorno.
  if (battleHero !== null) mapHero.mana = battleHero.mana;
}

/**
 * El bando que defiende. Con un héroe, su ejército, que en su sitio es el que
 * eligió de su tropa y de la guarnición antes de montar la batalla
 * (`montarLaBatalla`, `enemyAt`); sin héroe, la guarnición entera.
 */
function defenderSide(state: GameState, foe: BattleFoe): BattleSide {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId);
      if (obj === undefined || obj.kind !== 'monster') throw new Error('monstruo no encontrado');
      return {
        // Un monstruo del mapa son `count` individuos: cada uno en su hex. La
        // misma conversión que la tropa de un héroe, no una propia.
        army: troopsAsStacks(withTroops([], obj.creature, obj.count)),
        hero: null,
      };
    }
    case 'hero': {
      const enemigo = heroById(state, foe.heroId);
      return battleSideForHero(state, enemigo, 'defender');
    }
    case 'raider':
      return ladoDeAsaltante(state, foe.raiderId);
    case 'garrison': {
      // La de una ciudad lleva la moral de sus edificios, como cuando era su propia
      // clase de batalla (`town`, hasta la tarea 2).
      const sitio = sitioPorId(state, foe.site);
      return {
        army: troopsAsStacks(guarnicionDe(state, sitio)),
        hero: null,
        ...(sitio.kind === 'ciudad' ? { moraleBonus: moraleFromBuildings(sitio.town) } : {}),
      };
    }
    case 'lugar':
      // La tropa del encuentro, como un grupo de asaltantes: sin héroe ni dueño, y
      // en el tope de tropa de la partida (`gruposAlTope`), como todo lo neutral.
      return {
        army: troopsAsStacks(
          ejercitoDe(gruposAlTope(encuentroDe(state, foe).encuentro.tropa, state.combate.tope)),
        ),
        hero: null,
      };
  }
}

/**
 * El bando de un grupo de asaltantes, ataque o defienda: su tropa y sin héroe.
 * El único sitio que lo construye, para que emboscar y ser atacado no puedan
 * desplegar al mismo grupo de dos maneras.
 */
function ladoDeAsaltante(state: GameState, id: string): BattleSide {
  return { army: troopsAsStacks(ejercitoDe(raiderById(state, id).troops)), hero: null };
}

/**
 * Lo que le queda en pie a un grupo después de una batalla, o nada: un grupo
 * sin nadie deja de existir. La única escritura de la tropa de un grupo y el
 * único sitio que lo borra, gane, pierda o se disperse.
 */
function dejarAsaltante(state: GameState, id: string, army: Army): void {
  if (army.length > 0) raiderById(state, id).troops = gruposDe(army);
  else state.raiders = state.raiders.filter((r) => r.id !== id);
}

/** El grupo de asaltantes con ese id; lanza si ya no está. */
function raiderById(state: GameState, id: string): Raider {
  const r = state.raiders.find((x) => x.id === id);
  if (r === undefined) throw new Error(`grupo de asaltantes desconocido: "${id}"`);
  return r;
}

/** El bando que ataca: el héroe con su tropa, o el grupo que embosca. */
function attackerSide(state: GameState, atacante: Atacante): BattleSide {
  switch (atacante.kind) {
    case 'hero':
      return battleSideForHero(state, heroById(state, atacante.heroId), 'attacker');
    case 'raider':
      return ladoDeAsaltante(state, atacante.raiderId);
  }
}

/**
 * De quién es cada bando de una batalla pendiente.
 *
 * Borra dos constantes cableadas que decían `'attacker'` porque el único camino
 * que existía a una batalla era el ataque del agente: el del director y el de la
 * consulta `battle_state`. El defensor es `null` cuando enfrente hay un
 * monstruo, que no tiene dueño; un pueblo lo tiene igual que un héroe, y por eso
 * el agente también defiende su castillo.
 */
export function battleOwners(
  state: GameState,
  pending: Enfrentamiento,
): Readonly<Record<Side, PlayerId | null>> {
  const foe = pending.foe;
  let defender: PlayerId | null;
  switch (foe.kind) {
    case 'monster':
    case 'raider':
    case 'lugar':
      defender = null;
      break;
    case 'hero':
      defender = heroById(state, foe.heroId).owner;
      break;
    case 'garrison':
      // La tropa defiende por su dueño, no por el del sitio (P1): la neutral, por
      // nadie; la que ocupa un sitio ajeno, por quien la dejó.
      defender = laGuarnicion(state, foe.site)?.dueño ?? null;
      break;
  }
  // Un grupo de asaltantes no es de nadie: cuando embosca, el atacante es
  // `null` igual que un monstruo cuando defiende.
  const attacker =
    pending.attacker.kind === 'hero' ? heroById(state, pending.attacker.heroId).owner : null;
  return { attacker, defender };
}

/**
 * Dónde se libra una batalla: la casilla del DEFENSOR, que es a la que el
 * atacante intentó entrar.
 *
 * Estuvo guardada en `PendingBattle` como una cuarta copia de un hecho que el
 * estado ya tiene, con el argumento de que el evento que cuenta la muerte del
 * perdedor se escribe DESPUÉS de borrarlo del mapa. El argumento solo vale si
 * se deriva ENTONCES, y no hace falta: `settleBattle` la lee una vez al
 * principio, con los dos bandos todavía en pie, y la local sobrevive a todas
 * las mutaciones que vienen detrás.
 *
 * Que el campo desaparezca importa porque `PendingBattle` es estado
 * serializable y #10 lo va a guardar: un campo copiado es un campo que puede
 * volver del disco contradiciendo al mapa, que es la forma exacta de #47.
 */
export function lugarDelRival(state: GameState, foe: BattleFoe): Point {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId);
      if (obj === undefined) throw new Error(`el monstruo ${foe.objectId} ya no está en el mapa`);
      return obj.at;
    }
    case 'hero':
      return heroById(state, foe.heroId).at;
    case 'raider':
      return raiderById(state, foe.raiderId).at;
    case 'garrison':
      return casillaDelSitio(sitioPorId(state, foe.site));
    case 'lugar':
      return encuentroDe(state, foe).lugar.at;
  }
}

/**
 * Qué bandos de una batalla lleva alguno de `jugadores`. Vacío: no va con ellos.
 *
 * Es el compañero que le faltaba a `battleOwners`, y faltaba de verdad: el
 * director y la consulta `battle_state` derivaban esto cada uno por su cuenta y
 * **ya no coincidían** cuando un jugador llevaba los dos bandos —uno devolvía
 * los dos y el otro se quedaba con `attacker` por ser el primero del array—. Ese
 * caso existe desde que `agentPlayers` acepta varios jugadores.
 */
export function sidesOwnedBy(
  state: GameState,
  pending: PendingBattle,
  jugadores: Iterable<PlayerId>,
): ReadonlySet<Side> {
  const suyos = new Set(jugadores);
  const dueños = battleOwners(state, pending);
  const bandos = new Set<Side>();
  for (const bando of SIDES) {
    const dueño = dueños[bando];
    if (dueño !== null && suyos.has(dueño)) bandos.add(bando);
  }
  return bandos;
}

/**
 * El jugador que protagoniza una batalla: el dueño del héroe que ataca o, si
 * embosca un grupo, el del héroe emboscado. Se lee de `battleOwners`, que es
 * quien sabe de quién es cada bando, en vez de volver a mirar los héroes.
 * Siempre hay uno: toda batalla del mapa lleva un héroe dentro, y el tipo
 * (`Enfrentamiento`) no deja escribir un grupo contra otra cosa.
 */
function protagonista(state: GameState, pending: Enfrentamiento): PlayerId {
  const dueños = battleOwners(state, pending);
  const quien = dueños.attacker ?? dueños.defender;
  if (quien === null)
    throw new Error('una batalla del mapa sin ningún jugador en ninguno de los dos bandos');
  return quien;
}

/** Prepara la batalla y la deja pendiente: la juega la IA o el jugador. */
function abrirBatalla(state: GameState, quienes: Enfrentamiento, ctx: GameContext): void {
  const { attacker, foe } = quienes;
  const { defensa, ...lugar } = dejarPendiente(state, quienes, ctx);
  emit(state, { kind: 'battle_started', attacker, foe, ...lugar });
  contarLaDefensa(state, defensa);
}

/**
 * Un grupo embosca a un héroe que anda. `faltan` son los pasos del camino que
 * le quedaban: si no es 0, la marcha se ha cortado antes del destino y el hecho
 * lo lleva escrito, para que quien la cuenta —la nota del agente— no tenga que
 * deducirlo comparando casillas. Emboscado en el destino, llegó: sin `faltan`.
 */
function emboscar(
  state: GameState,
  raider: Raider,
  hero: Hero,
  faltan: number,
  ctx: GameContext,
): void {
  const attacker = { kind: 'raider', raiderId: raider.id } as const;
  const foe = { kind: 'hero', heroId: hero.id } as const;
  const { defensa, ...lugar } = dejarPendiente(state, { attacker, foe }, ctx);
  emit(
    state,
    faltan > 0
      ? { kind: 'battle_started', attacker, foe, ...lugar, faltan }
      : { kind: 'battle_started', attacker, foe, ...lugar },
  );
  contarLaDefensa(state, defensa);
}

/**
 * Crea la batalla, la deja en `pendingBattle` y dice de quién es y dónde, que
 * es lo que lleva el `battle_started`.
 *
 * Si el defensor es un héroe en un sitio suyo con guarnición, antes de montarla
 * se elige con quién defiende (D1): la propuesta de la IA (`defensaDeLaIA`), que la
 * persona puede rehacer antes de la primera jugada (`elegirLaDefensa`). Montar la
 * batalla no tira (`createBattle` no usa el azar), así que rehacerla no mueve la
 * partida.
 */
function dejarPendiente(
  state: GameState,
  quienes: Enfrentamiento,
  ctx: GameContext,
): { actor: PlayerId; at: Point; defensa: DefensaElegida | null } {
  let defensa: DefensaElegida | null = null;
  if (quienes.foe.kind === 'hero') {
    const hero = heroById(state, quienes.foe.heroId);
    const enJuego = sitioQueSeDefiende(state, quienes.foe);
    const sitio = enJuego?.suyo === true ? enJuego.sitio : null;
    if (sitio !== null && guarnicionDe(state, sitio).length > 0) {
      repartir(state, hero, sitio, defensaDeLaIA(state, hero, sitio));
      defensa = { hero: hero.id, sitio: idDelSitio(sitio) };
    }
  }
  const pending: PendingBattle = {
    ...quienes,
    battle: montarLaBatalla(state, quienes, ctx),
    ...(defensa === null ? {} : { defensa }),
  };
  state.pendingBattle = pending;
  // La casilla se deriva aquí también, y no se toma del paso que abrió la
  // batalla: así el sitio que dice el `battle_started` y el que dice el
  // `battle_ended` no son dos respuestas que puedan dejar de coincidir.
  return {
    actor: protagonista(state, pending),
    at: lugarDelRival(state, quienes.foe),
    defensa,
  };
}

/**
 * Monta el tablero de una batalla del mapa con los bandos de ahora. **La única
 * llamada a `createBattle` de `state/`** (lo vigila `test/invariantes.test.ts`): la
 * hacen la batalla que nace y la defensa que se rehace.
 *
 * Con la muralla del sitio que se defiende (fases 2 y 3 del puesto fronterizo:
 * piedra en una ciudad, madera en un pueblo, la de su obra en un paso,
 * `murallaDelSitio`), y entonces **todo el bando
 * atacante lleva escalera**, el héroe incluido (D8, `alAsalto`): la muralla del
 * mapa cierra, y sin escaleras nadie que ande la cruzaría.
 */
function montarLaBatalla(state: GameState, quienes: Enfrentamiento, ctx: GameContext): BattleState {
  const muralla = murallaDelSitio(sitioQueSeDefiende(state, quienes.foe)?.sitio ?? null);
  // El bando de la persona despliega a mano, en pantalla (fase de despliegue,
  // 02-11-2026): su guarnición también. La IA, el agente y lo que no es de nadie
  // despliegan solos, y sin ningún bando de la persona la batalla nace ya en la
  // ronda 1, como antes: el banco y el agente no se enteran. Rehacer la defensa
  // la vuelve a montar y se despliega otra vez.
  const dueños = battleOwners(state, quienes);
  const aMano = (side: Side, lado: BattleSide): BattleSide => {
    const dueño = dueños[side];
    return dueño !== null && playerById(state, dueño).controller === 'human'
      ? { ...lado, despliegaAMano: true }
      : lado;
  };
  return createBattle(
    aMano('attacker', alAsalto(attackerSide(state, quienes.attacker), muralla)),
    aMano('defender', defenderSide(state, quienes.foe)),
    ctx.rng,
    state.combate,
    muralla,
  );
}

/**
 * El sitio en juego en una batalla contra `foe`.
 *
 * `sitio`: dónde se pelea tras una muralla —la guarnición de una ciudad, un paso o
 * un pueblo, o **el sitio de la casilla del héroe atacado, sea de quien sea** (P3
 * de la tarea 2: el que ocupa un pueblo ajeno también se defiende tras su
 * empalizada)—. `suyo`: si el héroe defiende un sitio suyo (`sitioDelHeroe`: el
 * sitio o la guarnición son de su bando), y entonces elige con quién de la
 * guarnición defiende y, si pierde, lo entrega. El que ocupa un sitio ajeno no
 * tiene nada que entregar: perder lo echa. La guarnición sola, suyo siempre.
 * Un monstruo, un grupo de asaltantes o un lugar no defienden sitio: `null`.
 *
 * **LA pregunta del sitio en juego** (simplify de la fase 2): la leen la defensa
 * que se elige (`dejarPendiente`), la muralla de la batalla (`montarLaBatalla`) y lo
 * que se entrega al perder (`applyVictory`), así que no puede haber una batalla tras
 * la muralla de un sitio que entrega otro.
 */
function sitioQueSeDefiende(
  state: GameState,
  foe: BattleFoe,
): { readonly sitio: Sitio; readonly suyo: boolean } | null {
  switch (foe.kind) {
    case 'garrison':
      return { sitio: sitioPorId(state, foe.site), suyo: true };
    case 'hero': {
      const hero = heroById(state, foe.heroId);
      const sitio = sitioEn(state, hero.at);
      return sitio === null ? null : { sitio, suyo: sitioDelHeroe(state, hero) !== null };
    }
    case 'monster':
    case 'raider':
    case 'lugar':
      return null;
  }
}

/**
 * Un ataque a quien defiende, dicho para el aviso que lo precede (arreglo 3 de la
 * tanda del 06-11-2026: «centrar el lugar del ataque en el mapa y mostrar un popup
 * que diga quién te ataca y muestre dónde»): dónde se pelea, quién ataca, a quién
 * y en qué sitio. Lo arma `elAtaque`; lo dice la sesión.
 */
export interface Ataque {
  /** Dónde se pelea: la casilla de lo atacado (`lugarDelRival`). */
  readonly at: Point;
  /** Quién ataca: un héroe con su facción, o un grupo de asaltantes que embosca. */
  readonly quien:
    | { readonly kind: 'heroe'; readonly nombre: string; readonly faccion: FactionId }
    | { readonly kind: 'asaltantes'; readonly individuos: number };
  /** A quién: un héroe, o la guarnición del sitio, sola. */
  readonly aQuien:
    | { readonly kind: 'heroe'; readonly nombre: string }
    | { readonly kind: 'guarnicion' };
  /** El sitio en juego (`sitioQueSeDefiende`), dicho, o `null` en campo abierto. */
  readonly sitio: { readonly nombre: string; readonly delSitio: string } | null;
  /**
   * La región donde se pelea, por su nombre (`MapRegion.name`): lo que nombra el
   * sitio del ataque en campo abierto (06-11-2026: «embosca a … en (11,5)» no se
   * leía como un lugar). `dentro` si la casilla es de la región; si no (una
   * barrera, un nodo), es la más cercana (`regionMasCercana`). `null` en un mapa
   * sin regiones.
   */
  readonly region: { readonly nombre: string; readonly dentro: boolean } | null;
}

/** La región de la casilla `p` por su nombre, o la más cercana (`Ataque.region`). */
function regionDelAtaque(map: GameMap, p: Point): Ataque['region'] {
  const i = p.y * map.width + p.x;
  const propia = estructura(map).regionDe[i] ?? -1;
  const k = propia >= 0 ? propia : (regionMasCercana(map)[i] ?? -1);
  const region = k < 0 ? undefined : map.regions[k];
  return region === undefined ? null : { nombre: region.name, dentro: propia >= 0 };
}

/**
 * El ataque de la batalla `pending`, o `null` si lo atacado no se defiende: un
 * monstruo, un grupo de asaltantes o un lugar, que solo ataca quien juega.
 */
export function elAtaque(state: GameState, pending: Enfrentamiento): Ataque | null {
  const { foe, attacker } = pending;
  let aQuien: Ataque['aQuien'];
  if (foe.kind === 'hero') aQuien = { kind: 'heroe', nombre: heroById(state, foe.heroId).name };
  else if (foe.kind === 'garrison') aQuien = { kind: 'guarnicion' };
  else return null;
  let quien: Ataque['quien'];
  if (attacker.kind === 'hero') {
    const h = heroById(state, attacker.heroId);
    quien = { kind: 'heroe', nombre: h.name, faccion: playerById(state, h.owner).faction };
  } else {
    quien = {
      kind: 'asaltantes',
      individuos: individuosDe(raiderById(state, attacker.raiderId).troops),
    };
  }
  const enJuego = sitioQueSeDefiende(state, foe);
  const at = lugarDelRival(state, foe);
  return {
    at,
    quien,
    aQuien,
    sitio:
      enJuego === null
        ? null
        : { nombre: nombreDelSitio(enJuego.sitio), delSitio: delSitio(enJuego.sitio) },
    region: regionDelAtaque(state.map, at),
  };
}

/**
 * El hecho de la defensa elegida, detrás del `battle_started` (o de lo que la
 * rehace). Solo la cuenta: que se pueda rehacer lo dice la batalla pendiente.
 */
function contarLaDefensa(state: GameState, defensa: DefensaElegida | null): void {
  if (defensa === null) return;
  const hero = heroById(state, defensa.hero);
  const sitio = sitioPorId(state, defensa.sitio);
  emit(state, {
    kind: 'defense_set',
    hero: hero.id,
    site: idDelSitio(sitio),
    fighting: hero.army.length,
    staying: guarnicionDe(state, sitio).length,
    actor: hero.owner,
    at: hero.at,
  });
}

/**
 * Si la batalla no ha empezado: nadie ha jugado nada todavía (el registro solo
 * trae el comienzo de la primera ronda) y el primer turno sigue abierto, **o aún se
 * despliega** (ronda 0, `BattleState.despliegue`: la batalla de la persona nace
 * desplegando desde la fase de despliegue de `main`, fusionada el 05-11-2026; sin
 * esto, quien defendía su sitio no llegaba a elegir con quién). Hasta entonces se
 * puede rehacer la defensa sin que haya dos batallas distintas; rehacerla vuelve a
 * montar la batalla, y lo que se hubiera colocado se coloca otra vez.
 */
function batallaSinEmpezar(battle: BattleState): boolean {
  const enElPrimerTurno = battle.round === 1 && (battle.turno === null || battle.turno.n === 1);
  const desplegando = battle.round === 0 && battle.despliegue !== null;
  return (
    battle.finished === null &&
    (enElPrimerTurno || desplegando) &&
    battle.golpeEnCurso === null &&
    battle.log.every((e) => e.kind === 'round_start')
  );
}

/** La defensa que `player` puede elegir ahora: quién la hace, dónde, y cómo queda (`laDefensa`). */
export type DefensaPorElegir = LaDefensa & { readonly hero: Hero; readonly sitio: Sitio };

/**
 * Por qué `player` no puede elegir ahora la defensa de su héroe atacado, o `null`:
 * tiene que haber una batalla pendiente en la que **defiende un héroe suyo en un
 * sitio suyo con guarnición** (la que guarda `PendingBattle.defensa`), y sin
 * empezar. No mira lo que se pide: eso lo añade `defensaBlocker`.
 */
function defensaPosible(
  state: GameState,
  player: PlayerId,
): { readonly hero: Hero; readonly sitio: Sitio } | { readonly motivo: string } {
  const pending = state.pendingBattle;
  if (pending === null) return { motivo: 'no hay ninguna batalla pendiente' };
  if (pending.foe.kind !== 'hero') return { motivo: 'en esta batalla no defiende ningún héroe' };
  const hero = heroById(state, pending.foe.heroId);
  if (hero.owner !== player) return { motivo: `${hero.name} no es de tu bando` };
  if (pending.defensa === undefined) {
    return {
      motivo: `${hero.name} no defiende un sitio suyo con guarnición: pelea con su ejército`,
    };
  }
  if (!batallaSinEmpezar(pending.battle)) {
    return { motivo: 'la batalla ya ha empezado: la defensa se elige antes de la primera jugada' };
  }
  return { hero, sitio: sitioPorId(state, pending.defensa.sitio) };
}

/**
 * La defensa que `player` puede elegir ahora, o `null` si no hay ninguna
 * (`defensaPosible`): de cada tipo entre el ejército y la guarnición, cuántos hay,
 * cuántos pelean ahora y cuántos con `pedida`, con el motivo del núcleo para no
 * subir o bajar uno y para no defender así (`laDefensa`). La lee la pantalla de la
 * defensa, que solo lo pinta.
 */
export function defensaPorElegir(
  state: GameState,
  player: PlayerId,
  pedida: readonly LineaDeDefensa[] = [],
): DefensaPorElegir | null {
  const posible = defensaPosible(state, player);
  if ('motivo' in posible) return null;
  const { hero, sitio } = posible;
  return { ...laDefensa(state, hero, sitio, pedida), hero, sitio };
}

/**
 * Por qué `player` no puede defender con `pedida`, o `null`: lo de
 * `defensaPosible` y lo que pide (`ejercitoDeLaDefensa`: los tipos, que los haya,
 * que quepan en su ejército y que lo de fuera quepa en la guarnición).
 */
export function defensaBlocker(
  state: GameState,
  player: PlayerId,
  pedida: readonly LineaDeDefensa[],
): string | null {
  const posible = defensaPosible(state, player);
  if ('motivo' in posible) return posible.motivo;
  const ejercito = ejercitoDeLaDefensa(state, posible.hero, posible.sitio, pedida);
  return 'motivo' in ejercito ? ejercito.motivo : null;
}

/**
 * La persona rehace la defensa de su héroe atacado en su sitio antes de la primera
 * jugada: reparte su ejército y la guarnición con lo que pide y **vuelve a montar
 * la batalla** con los bandos de ahora (`montarLaBatalla`; montar no tira, así que
 * la partida no se mueve). Fuera del turno, como `ascenderVeterano`: la defensa
 * nace en el turno del rival. Lanza con `defensaBlocker`.
 */
export function elegirLaDefensa(
  state: GameState,
  ctx: GameContext,
  player: PlayerId,
  pedida: readonly LineaDeDefensa[],
): void {
  const posible = defensaPosible(state, player);
  if ('motivo' in posible) throw new Error(`no se puede elegir la defensa: ${posible.motivo}`);
  const { hero, sitio } = posible;
  const ejercito = ejercitoDeLaDefensa(state, hero, sitio, pedida);
  if ('motivo' in ejercito) throw new Error(`no se puede elegir la defensa: ${ejercito.motivo}`);
  const pending = state.pendingBattle as PendingBattle;
  repartir(state, hero, sitio, ejercito);
  state.pendingBattle = { ...pending, battle: montarLaBatalla(state, pending, ctx) };
  contarLaDefensa(state, { hero: hero.id, sitio: idDelSitio(sitio) });
}

/**
 * Los jugadores que no lleva la IA de reglas (`Player.controller`: la persona y
 * el agente). Por sus bandos pelea la IA cuando le toca resolver, pero no se
 * rinde: rendirse les cuesta oro y esa decisión es solo de su dueño.
 */
export function sinLaIA(state: GameState): ReadonlySet<PlayerId> {
  return new Set(state.players.filter((p) => p.controller !== 'ai').map((p) => p.id));
}

/** Reparte las consecuencias de una batalla ya terminada. */
export function settleBattle(state: GameState, _ctx: GameContext): void {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  if (pending.battle.finished === null) throw new Error('la batalla no ha terminado');

  const finished = pending.battle.finished;
  const winner = finished.winner;
  // Quién la protagoniza, leído ahora, con los dos bandos en pie.
  const actor = protagonista(state, pending);
  // De quién es cada sitio y quién lo ocupa, antes de las consecuencias.
  const sitiosAntes = fotoDeLosSitios(state);
  // La casilla, LEÍDA AQUÍ: con los dos bandos todavía en pie. Después hay
  // héroes que salen del mapa y castillos que cambian de bandera, y preguntar
  // entonces sería preguntar por alguien que ya no está. Es el mismo patrón que
  // el `const dueño = hero.owner` de más abajo, y por eso el dato no hace falta
  // guardarlo en `PendingBattle`.
  const at = lugarDelRival(state, pending.foe);
  // El botín, decidido AQUÍ por la misma razón: si el que pierde es una ciudad
  // neutral, un instante después de capturarla ya es de quien gana.
  const botin = botinDe(state, pending, winner);
  // Los vivos de un bando, en su orden de salida. Un stack de N —el motor los
  // sigue sabiendo jugar— vuelve como N individuos, aunque la partida solo le
  // mande de 1. Sin ordenar: `createBattle` empuja cada bando en orden de
  // `slot` y nadie añade ni reordena stacks después, así que el orden de
  // `stacks` YA es el de salida.
  //
  // Y vuelven con su experiencia: la que traían más la que han ganado, en el
  // mismo individuo. Solo los de un bando con dueño —la tropa de un héroe o la
  // guarnición de un castillo de alguien—: un monstruo, un asaltante o una
  // guarnición neutral no tienen campaña que recordar.
  const dueños = battleOwners(state, pending);
  const ascensos: Ascenso[] = [];
  const superviviente = (side: 'attacker' | 'defender'): Army => {
    const vivos: Troop[] = [];
    const cobro: Cobro = { state, dueño: dueños[side], ascensos };
    for (const s of pending.battle.stacks) {
      if (s.side !== side || s.count <= 0) continue;
      let base: Troop;
      switch (s.origen.kind) {
        case 'catalogo':
          base = { creature: s.origen.unidad, ...salidaDelOrigen(s.origen) };
          break;
        case 'heroe':
          // El héroe no es tropa: vuelve al mapa como héroe, no como un
          // individuo «hero» de su propio ejército —que nadie sabría leer—.
          continue;
      }
      const t = conVeterania(cobro, base, s);
      for (let i = 0; i < s.count; i++) vivos.push(t);
    }
    return vivos;
  };

  const supervivientesDelDefensor = superviviente('defender');
  const supervivientesDelAtacante = superviviente('attacker');
  // Lo que la batalla les mutó —el maná, y la tropa que queda en pie— vuelve a
  // los DOS héroes aquí, una vez y por la misma función, gane quien gane. Antes
  // se devolvía en tres sitios según quién perdiera, y el defensor que perdía
  // se restauraba dentro de `applyVictory`, que no es su asunto.
  if (!esEmboscada(pending)) {
    const atacante = heroById(state, pending.attacker.heroId);
    restoreHeroFromBattle(atacante, pending.battle.heroes.attacker, supervivientesDelAtacante);
  }
  if (pending.foe.kind === 'hero') {
    const defensor = heroById(state, pending.foe.heroId);
    restoreHeroFromBattle(defensor, pending.battle.heroes.defender, supervivientesDelDefensor);
  }
  // Lo que cuesta la rendición, si la hubo. La paga siempre el que pierde.
  const precio = finished.surrender?.gold ?? null;

  // El cierre de la batalla se registra ANTES de sus consecuencias: capturar
  // el último pueblo del rival termina la partida, y "game_over" tiene que ser
  // el último evento del registro, no quedar sepultado bajo el de la batalla.
  emit(state, {
    kind: 'battle_ended',
    winner,
    foe: pending.foe,
    owners: dueños,
    ...resumenDeBatalla(pending.battle),
    actor,
    at,
  });
  state.pendingBattle = null;

  // La experiencia, AQUÍ: después de contar que terminó y antes de sus
  // consecuencias, que es cuando los dos héroes siguen en el mapa —un héroe
  // vencido sin base sale de él dos líneas más abajo—. Los dos cobran, gane o
  // pierda cada uno: se gana por el daño hecho, no por ganar (la regla es del
  // usuario, no de fheroes2).
  for (const st of pending.battle.stacks) {
    if (st.origen.kind !== 'heroe') continue;
    const quien = st.side === 'attacker' ? pending.attacker : pending.foe;
    if (quien.kind !== 'hero') continue;
    ganarExperiencia(state, heroById(state, quien.heroId), st.ganado.experiencia, at);
  }
  for (const a of ascensos) {
    emit(state, {
      kind: 'troop_rank_up',
      creature: a.creature,
      rank: a.rank,
      veterano: a.veterano,
      actor: a.dueño,
      at,
    });
  }

  if (esEmboscada(pending)) {
    const emboscado = heroById(state, pending.foe.heroId);
    if (winner === 'attacker') {
      dejarAsaltante(state, pending.attacker.raiderId, supervivientesDelAtacante);
      heroeVencido(state, emboscado, precio, at);
    } else {
      // Sin héroe no se rinde: perder es caer entero.
      dejarAsaltante(state, pending.attacker.raiderId, []);
    }
  } else {
    const hero = heroById(state, pending.attacker.heroId);
    if (winner === 'attacker') {
      applyVictory(state, hero, pending.foe, precio, at);
    } else {
      heroeVencido(state, hero, precio, at);
      applyDefenderSurvivors(state, pending, supervivientesDelDefensor);
    }
  }
  // Después de las consecuencias —el grupo disperso, la ciudad ya suya— y antes
  // de mirar si alguien ha perdido la partida: `game_over` es el último hecho.
  if (botin !== null) repartirBotin(state, heroById(state, botin.heroId), botin.from, at);

  // Lo que la batalla cambió en los sitios (el ocupante echado, el pueblo que
  // vuelve a dar), antes de mirar si alguien ha perdido: `game_over` es el último.
  anotarLosSitios(state, sitiosAntes);
  checkDefeat(state);
}

/**
 * Quién cobra botín de esta batalla, o `null`: **el héroe que gana a un bando
 * neutral que no es un monstruo** —un grupo de asaltantes, atacado o
 * emboscando, o la guarnición neutral de una ciudad—. Una ciudad rival
 * guarnecida no da: no es una guarnición de nadie, es la del rival. Se pregunta
 * antes de aplicar nada, porque la guarnición se pierde al ganarle.
 */
function botinDe(
  state: GameState,
  pending: PendingBattle,
  winner: Side,
): { readonly heroId: string; readonly from: 'raider' | 'town' } | null {
  const [ganador, perdedor] =
    winner === 'attacker' ? [pending.attacker, pending.foe] : [pending.foe, pending.attacker];
  if (ganador.kind !== 'hero') return null;
  if (perdedor.kind === 'raider') return { heroId: ganador.heroId, from: 'raider' };
  if (perdedor.kind === 'garrison') {
    const sitio = sitioPorId(state, perdedor.site);
    if (sitio.kind === 'ciudad' && laGuarnicion(state, sitio)?.dueño === null) {
      return { heroId: ganador.heroId, from: 'town' };
    }
  }
  return null;
}

/**
 * Lo que le pasa a un héroe que pierde una batalla. **El único camino**: antes
 * eran dos ramas de borrado —el atacante en `settleBattle` y el defensor en
 * `applyVictory`—, y la vuelta a la base habría tenido que escribirse en las
 * dos.
 *
 * En este orden, y el orden importa:
 *
 * 1. **Si se rindió, paga** `precio`, el que fijó el motor al rendirse. No le
 *    puede faltar y no se vuelve a mirar: `surrenderBlocker` no ofrece la
 *    rendición sin el oro, y el oro no cambia en plena batalla.
 * 2. **Si su base sigue siendo suya, vuelve a ella** (`volverABase`).
 * 3. **Si no, desaparece**, como hasta la fase 1b. Un rendido no llega aquí:
 *    sin base no se ofrece la rendición.
 *
 * El castillo en el que defendía, si lo había, ya lo ha capturado
 * `applyVictory`: si era su base, aquí ya no le queda.
 *
 * Una derrota en combate cuenta `hero_defeated` —el héroe cayó— y, si vuelve,
 * **después** `hero_returned`. Una rendición solo `hero_returned`: no cayó.
 */
function heroeVencido(state: GameState, hero: Hero, precio: number | null, at: Point): void {
  // El dueño se lee al principio: si el héroe sale del mapa, un instante
  // después el evento que lo cuenta no tendría a quién atribuirse — que es
  // justo por qué el 10,9 % de la crónica era inatribuible.
  const dueño = hero.owner;
  const rendido = precio !== null;
  if (rendido) {
    const jugador = playerById(state, dueño);
    jugador.oro -= precio;
  }

  const base = baseOf(state, dueño);
  if (base === null) {
    // Sin base, desaparece como siempre. Primero sale del mapa y DESPUÉS se
    // cuenta: el sello se calcula tras la mutación (`emit`), así que su dueño
    // ya no mira la casilla en la que acaba de caer, y la noticia le llega por
    // `actor`. La rendición exige base, así que aquí solo llega quien cayó.
    state.heroes = state.heroes.filter((h) => h.id !== hero.id);
    emit(state, { kind: 'hero_defeated', hero: hero.id, actor: dueño, at });
    return;
  }
  // Con base, cae y vuelve: dos hechos, en ese orden. El primero se sella con
  // el héroe todavía en el campo de batalla; el segundo, donde reaparece.
  if (!rendido) emit(state, { kind: 'hero_defeated', hero: hero.id, actor: dueño, at });
  volverABase(state, hero, base, precio);
}

/**
 * El héroe vencido reaparece en su base: en la casilla del castillo o, si la
 * ocupa otro héroe, en la primera casilla libre más cercana (`casillaDeVuelta`).
 *
 * Con el ejército vacío, salvo si se rindió (entonces con la tropa que salvó,
 * que ya trae puesta), y sin movimiento hasta mañana. Mira alrededor. La
 * guarnición no la recoge aquí: se recoge con `recoger_tropa` (04-11-2026), y lo
 * hace la IA al empezar su turno porque el héroe queda marcado (`Hero.vueltoACasa`).
 */
function volverABase(state: GameState, hero: Hero, base: Town, precio: number | null): void {
  if (precio === null) hero.army = [];
  hero.at = casillaDeVuelta(state, hero, base);
  hero.movePoints = 0;
  // Volver a casa es llegar a ella: la IA recoge al empezar su turno (`playAiTurn`)
  // lo que le quepa de la guarnición, como al que acaba una marcha en su sitio.
  hero.vueltoACasa = true;
  revealAround(state, hero);
  const comun = { kind: 'hero_returned', hero: hero.id, town: base.id } as const;
  const origen = { actor: hero.owner, at: hero.at };
  emit(
    state,
    precio === null
      ? { ...comun, surrendered: false, ...origen }
      : { ...comun, surrendered: true, gold: precio, ...origen },
  );
}

/**
 * La casilla del castillo, o si la ocupa otro héroe la primera libre —que se
 * pueda pisar, sin objeto y sin héroe— de una búsqueda en anchura desde el
 * castillo que **para en cuanto la encuentra**.
 *
 * Antes era el orden de descubrimiento de un `reachableFrom` del mapa entero
 * —un Dijkstra completo para mirar, casi siempre, las ocho vecinas—. Las dos
 * dan la misma casilla siempre que alguna vecina del castillo esté libre: el
 * Dijkstra descubre las ocho de golpe al sacar el origen, en el mismo orden de
 * `dy` por fuera y `dx` por dentro que se usa aquí. Si las ocho estuvieran
 * ocupadas, esta da la más cercana en pasos y aquella la más cercana en coste.
 * Comprobado ejecutando las dos a la vez en cada vuelta: 1 491 en las 200
 * partidas del banco y 8 894 en 1 200 partidas, 0 distintas. Con una salvedad
 * que hay que saber: en ninguna de ellas estaba ocupado el castillo —la IA no
 * contrata un segundo héroe mientras tiene uno—, así que la rama de la búsqueda
 * solo la ejercen los tests.
 */
function casillaDeVuelta(state: GameState, hero: Hero, base: Town): Point {
  const ocupada = (p: Point): boolean =>
    state.heroes.some((h) => h.id !== hero.id && pointKey(h.at) === pointKey(p)) ||
    state.raiders.some((r) => pointKey(r.at) === pointKey(p));
  if (!ocupada(base.at)) return base.at;
  const vistas = new Set<string>([pointKey(base.at)]);
  const cola: Point[] = [base.at];
  for (let i = 0; i < cola.length; i++) {
    const desde = cola[i]!;
    // Como en el Dijkstra del mapa: de una casilla con objeto que bloquea no se
    // sigue, salvo del origen, que es el propio castillo.
    const objeto = objectAt(state.map, desde);
    if (i > 0 && objeto !== undefined && blocksMovement(objeto)) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const p = { x: desde.x + dx, y: desde.y + dy };
        if (!isEnterable(state.map, p) || !sePasa(state.map, desde, p) || vistas.has(pointKey(p)))
          continue;
        vistas.add(pointKey(p));
        if (!ocupada(p) && objectAt(state.map, p) === undefined) return p;
        cola.push(p);
      }
    }
  }
  throw new Error(`${hero.name} no tiene casilla libre a la que volver junto a ${base.name}`);
}

/** Un individuo que cruza un rango en esta batalla: un `troop_rank_up` por rango. */
interface Ascenso {
  readonly creature: string;
  readonly rank: number;
  readonly veterano: string;
  readonly dueño: PlayerId;
}

/**
 * El superviviente con su hoja de servicios al día: la que traía más lo que el
 * motor le apuntó en `ganado`, y un `Ascenso` por cada nivel que cruza.
 *
 * Un novato que no ha ganado nada vuelve como entró, sin `veterania`: así el
 * ejército de quien no pelea no cambia de forma y el contador de veteranos solo
 * avanza para quien de verdad lo es. Sin dueño —monstruo, asaltante, guarnición
 * neutral— no acumula nada.
 */
/** Con qué se cobra la experiencia de un bando al cerrar: lo mismo para todos sus stacks. */
interface Cobro {
  readonly state: GameState;
  /** El dueño del bando; `null` —monstruo, asaltante, guarnición neutral— no acumula. */
  readonly dueño: PlayerId | null;
  /** Donde se apuntan los ascensos, que se emiten después. */
  readonly ascensos: Ascenso[];
}

/**
 * La casilla de la formación con que entró (`OrigenDelStack.salida`): vuelve con
 * él, como su veteranía. `settleBattle` es el único que rehace al superviviente.
 */
function salidaDelOrigen(o: { readonly salida?: Hex }): { readonly salida?: Hex } {
  return o.salida === undefined ? {} : { salida: o.salida };
}

function conVeterania({ state, dueño, ascensos }: Cobro, base: Troop, s: BattleStack): Troop {
  if (dueño === null) return base;
  const previa = s.origen.kind === 'heroe' ? null : s.origen.veterania;
  if (previa === null && s.ganado.experiencia === 0) return base;
  // Aquí no se mira `count`: un bando con dueño se monta siempre con
  // `troopsAsStacks`, que da stacks de 1, y un veterano en un stack de N lo
  // rechaza `createBattle` al entrar. Es la única comprobación, en la puerta.
  // Parte de la hoja que traía o de una en blanco (`hojaNueva`, la misma que se
  // abre al equipar): una sola regla de cómo nace una hoja. Y se copia entera:
  // lo que esta cuenta no toca —el equipo— tiene que volver con él.
  // Reconstruirla campo a campo lo perdía en la primera batalla sin que nada se
  // pusiera rojo.
  const hoja = previa ?? hojaNueva(state);
  const veterania: Veterania = {
    ...hoja,
    experiencia: hoja.experiencia + s.ganado.experiencia,
    batallas: hoja.batallas + 1,
    bajas: hoja.bajas + s.ganado.bajas,
    heroes: [...hoja.heroes, ...s.ganado.heroes],
  };
  const antes = rangoDeTropa(previa);
  const despues = rangoDeTropa(veterania);
  for (let n = antes + 1; n <= despues; n++) {
    ascensos.push({ creature: base.creature, rank: n, veterano: veterania.id, dueño });
  }
  return { ...base, veterania };
}

/**
 * Le da la experiencia al héroe y le cobra los rangos que salgan, uno a uno:
 * **un `rank_up` por rango ganado** y no uno por batalla. Es el sitio en el
 * que el día que subir de rango REPARTA algo —habilidades— se reparte.
 *
 * El héroe no tiene tope (decisión del usuario: el 5 es solo de la tropa), así
 * que `rangoDe` va sin él y sigue la misma tabla Fibonacci de la tropa. Y
 * empieza donde la tropa acaba, en el 5 con su experiencia (`RANGO_INICIAL_DE_HEROE`):
 * una sola escala, así que su primer ascenso es al 6 y cuesta 128 000 (base × 8). Lo que
 * le da cada rango está en datos: su cuerpo (`data/heroe.json`) y su liderazgo
 * (`data/liderazgo.json`); su nivel, el de ese cuerpo (`nivelDeUnidad`).
 */
function ganarExperiencia(state: GameState, hero: Hero, exp: number, at: Point): void {
  if (exp <= 0) return;
  const antes = rangoDeHeroe(hero);
  hero.experience += exp;
  for (let rank = antes + 1; rank <= rangoDeHeroe(hero); rank++) {
    emit(state, { kind: 'rank_up', hero: hero.id, rank, actor: hero.owner, at });
  }
}

function applyVictory(
  state: GameState,
  hero: Hero,
  foe: BattleFoe,
  precio: number | null,
  at: Point,
): void {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId) as
        | Extract<MapObject, { kind: 'monster' }>
        | undefined;
      if (obj !== undefined) {
        obj.defeated = true;
        obj.count = 0;
      }
      break;
    }
    case 'hero': {
      const derrotado = heroById(state, foe.heroId);
      // Si defendía en un castillo suyo, el castillo es del que gana: lo decide
      // lo que hay en la casilla, no a dónde vuelve el héroe. Hasta aquí era un
      // caso especial de la base dentro de `heroeVencido`, y un héroe que perdía
      // defendiendo otro castillo suyo no lo entregaba. Primero la captura y
      // después el héroe pregunta si le queda base: si era esa, ya no.
      // Lo mismo si defendía un paso o un pueblo suyo: lo que no eligió para
      // defenderlo se pierde con el sitio (D1).
      // `at` es la casilla del vencido (`lugarDelRival`): su sitio, el que defendía.
      // El que ocupaba un sitio ajeno no entrega nada: perder lo echa (y el sitio
      // vuelve a dar a su dueño, `anotarLosSitios`).
      const enJuego = sitioQueSeDefiende(state, foe);
      if (enJuego?.suyo === true) entregarElSitio(state, enJuego.sitio, hero.owner);
      heroeVencido(state, derrotado, precio, at);
      break;
    }
    case 'raider':
      // Un grupo sin héroe no se rinde: perder es caer entero.
      dejarAsaltante(state, foe.raiderId, []);
      break;
    case 'garrison':
      // La guarnición cae entera (`entregarElSitio`). Quien gana no entra: se queda
      // en la casilla de antes, como en toda batalla.
      entregarElSitio(state, sitioPorId(state, foe.site), hero.owner);
      break;
    case 'lugar': {
      // Lo que da ganar: lo que da la opción que la abrió (oro, pieza, tropa: la tropa
      // se comprobó al elegirla, y tras ganar el ejército no es mayor) y su `alGanar`
      // (estado, marca, oro o una pieza: la validación no deja más).
      const { lugar, encuentro } = encuentroDe(state, foe);
      // Ganado una vez, no se vuelve a cobrar (`yaCobrado`, `core/mundo/reglas.ts`).
      const mundo = mundoDe(state);
      mundo.vencidos[claveDeEncuentro(lugar.id, foe.encuentro)] ??= cobroDe(hero);
      // Lo que da la opción que la abrió se da ahora, entero, y se cobra ahora (M1
      // de la vuelta 2): antes se daba al elegirla y, al perder, la opción quedaba
      // cobrada y el encuentro no se volvía a pelear.
      const opcion = opcionDeLaBatalla(lugar, foe);
      if (daPremio(opcion)) {
        mundo.cobradas[claveDeOpcion({ lugar: lugar.id, ...foe.opcion })] ??= cobroDe(hero);
      }
      const premios = (opcion.hace ?? []).filter(esPremio);
      aplicarEfectos(state, hero.owner, hero, lugar, [...premios, ...encuentro.alGanar], null);
      break;
    }
  }
}

/**
 * Una pieza de botín a la mochila de `hero`, sorteada entre lo común y lo
 * especial (`PIEZAS_DE_BOTIN`), y el hecho que lo cuenta. **La única puerta del
 * botín**, y la llama un solo sitio: el cierre de la batalla, con lo que decide
 * `botinDe`.
 *
 * La tirada sale de **una corriente propia** y no de `ctx.rng`: una semilla
 * derivada de la de la partida y del número de reparto (`siguienteBotin`). Así
 * el botín no se come ni una tirada de batalla —el resto de la partida se juega
 * igual con él que sin él, y eso es lo que deja comprobar en el volcado del
 * banco que solo añade líneas— y sigue siendo reproducible: misma semilla, mismo
 * orden de repartos, mismas piezas.
 */
function repartirBotin(state: GameState, hero: Hero, from: 'raider' | 'town', at: Point): void {
  const n = state.siguienteBotin++;
  // Dos mezclas enteras (`imul`, que el núcleo permite) para que la semilla del
  // reparto n de una partida no sea la del reparto n+1 de la de al lado.
  const semilla =
    (Math.imul(state.seed ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b)) >>> 0;
  const pieza = createRng(semilla).pick(PIEZAS_DE_BOTIN);
  aLaMochila(hero, pieza.id);
  emit(state, { kind: 'loot_found', hero: hero.id, item: pieza.id, from, actor: hero.owner, at });
}

function applyDefenderSurvivors(state: GameState, pending: PendingBattle, army: Army): void {
  // Se copia a una constante local: dentro de los callbacks de `find` el
  // estrechamiento sobre `pending.foe` se pierde.
  const foe = pending.foe;
  switch (foe.kind) {
    case 'monster': {
      const monstruo = state.map.objects.find(
        (o) => o.kind === 'monster' && o.id === foe.objectId,
      ) as Extract<MapObject, { kind: 'monster' }> | undefined;
      if (monstruo !== undefined) {
        monstruo.count = army.length;
        monstruo.defeated = army.length === 0;
      }
      break;
    }
    case 'hero': {
      // Su maná, su tropa y su experiencia ya los devolvió `settleBattle`, a
      // los dos héroes por igual: aquí no queda nada que hacer.
      break;
    }
    case 'raider':
      // Repele al héroe y sigue patrullando con lo que le quede.
      dejarAsaltante(state, foe.raiderId, army);
      break;
    case 'garrison': {
      // La guarnición sigue guardando con lo que le quede, del mismo dueño (el suyo,
      // no el del sitio: P1; `null`, la neutral).
      const sitio = sitioPorId(state, foe.site);
      const g = laGuarnicion(state, sitio);
      if (g === null) throw new Error(`la guarnición ${delSitio(sitio)} resiste sin tropa`);
      ponerLaGuarnicion(state, sitio, g.dueño, army);
      break;
    }
    case 'lugar': {
      // El encuentro no queda en el mapa: si se vuelve, es entero. Lo que cambia
      // es el mundo (`alPerder`: estado o marca), y lo protagoniza quien perdió,
      // que quizá ya no esté en el mapa (sin base cae del todo): por su dueño.
      const { lugar, encuentro } = encuentroDe(state, foe);
      const dueño = battleOwners(state, pending).attacker;
      if (dueño === null)
        throw new Error(`la batalla de ${lugar.nombre} sin dueño que la perdiera`);
      aplicarEfectos(state, dueño, null, lugar, encuentro.alPerder, null);
      break;
    }
  }
}
