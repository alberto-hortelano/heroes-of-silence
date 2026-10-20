/**
 * Estado de partida y bucle de turnos del mapa de aventura.
 *
 * Un turno de jugador es: mover héroes, construir en los pueblos, reclutar, y
 * pasar. Cuando todos han pasado, avanza el día; los lunes crecen las moradas.
 */
import { autoResolve, type BattleOutcome } from '../ai/tactics.js';
import { type BattleMember, type BattleSide, createBattle, mandoDe } from '../battle/battle.js';
import { stackHp } from '../battle/damage.js';
import { resumenDeBatalla } from '../battle/resumen.js';
import type { BattleHero, BattleStack, BattleState, Side } from '../battle/types.js';
import { personajeDe, SIDES } from '../battle/types.js';
import {
  equipoDelPortadorBlocker,
  equipoDeSerieDe,
  equipoPuestoDe,
  unidadDelJuego,
  unidadDelJuegoSiExiste,
} from '../catalogo.js';
import { figuraDelHeroe, tipoDeHeroePorDefecto } from '../data.js';
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
  type Hero,
  heroeRecienHecho,
  learnable,
  luckBonus,
  maxMana,
  maxMovePoints,
  moraleBonus,
} from '../hero/hero.js';
import {
  armyLeadership,
  CUPO_GUARNICION,
  capacidadDe,
  characterOf,
  ejercitoDe,
  GARRISON_LEADERSHIP,
  gruposDe,
  licenciar,
  troopBlocker,
  troopRoom,
  troopsAsStacks,
  troopsThatFit,
  withTroops,
} from '../hero/troop.js';
import { Casillas, type CasillasLeidas, casillasDelCuadrado } from '../map/casillas.js';
import {
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
} from '../map/map.js';
import { territorio } from '../map/regiones.js';
import { createRng, type Rng } from '../rng.js';
import { CHARACTER_BODY, type Character } from '../rpg/character.js';
import { combatProfile } from '../rpg/stats.js';
import {
  applyWeeklyGrowth,
  build as buildInTown,
  dailyIncome,
  mageGuildLevel,
  moraleFromBuildings,
  payRecruit,
  primeraCiudadDe,
  recruitBlocker,
  recruitCost,
  type Town,
  tieneArmeria,
  townSpells,
} from '../town/town.js';
import type {
  Army,
  Controller,
  FactionId,
  PlayerId,
  Point,
  ResourceKind,
  Resources,
  Troop,
  Veterania,
} from '../types.js';
import {
  addResources,
  canAfford,
  describirCoste,
  EMPTY_RESOURCES,
  enumerar,
  type Hueco,
  subtractResources,
} from '../types.js';
import {
  type AsaltanteRecordado,
  casillasPeligrosas,
  dispersados,
  dondeBrotan,
  emboscador,
  grupoALaVistaDesde,
  mascaraDeOcupacion,
  pasoDePatrulla,
  type Raider,
  recordarAsaltantes,
  vigiaDeLaMarcha,
} from './asaltantes.js';
import {
  type Atacante,
  type BattleFoe,
  type GameEvent,
  type GameEventDraft,
  SE_VE_POR,
} from './events.js';

export interface Player {
  readonly id: PlayerId;
  readonly faction: FactionId;
  controller: Controller;
  resources: Resources;
  /** Casillas ya exploradas (`Casillas`, un byte por casilla, #146). */
  readonly fog: Casillas;
  /**
   * Lo último OBSERVADO de cada objeto del mapa, por id de objeto.
   *
   * La niebla filtraba el espacio pero no el tiempo: bastaba haber pisado una
   * casilla el día 3 para ver, el día 20, quién posee la mina AHORA. Lo que se
   * recuerda es lo que se vio, con el día en que se vio, así que hay algo que
   * reconocer — y una mina que dejó de dar oro sin cambiar de dueño en el mapa
   * conocido es justo la señal de que allí ha pasado algo.
   */
  memory: Map<string, RememberedObject>;
  /**
   * Lo último OBSERVADO de cada grupo de asaltantes, por id de grupo: lo que la
   * IA de reglas teme (`casillasPeligrosas`, #164). Se escribe junto a `memory`
   * (`explorar`, con `recordarAsaltantes`) y no viaja a nadie: el agente y la
   * pantalla ven los grupos de ahora (`asaltantesALaVista`).
   */
  asaltantesVistos: Map<string, AsaltanteRecordado>;
  defeated: boolean;
  /**
   * El id del castillo al que vuelve un héroe derrotado o rendido, o `null` si
   * no tiene ninguno.
   *
   * PROVISIONAL (fase 1b): es el primer castillo que el jugador tenía al empezar
   * la partida y no cambia aunque conquiste otros. La «base única» formal es de
   * la fase 3. Que la base siga siendo SUYA no se guarda aquí: se pregunta a
   * `Town.owner` cada vez, porque el dueño de un castillo vive en un solo sitio
   * (`captureTown`) y una segunda copia es lo que ya costó #47.
   */
  readonly base: string | null;
}

/** Un objeto del mapa tal y como se vio, y cuándo. */
export interface RememberedObject {
  readonly day: number;
  readonly object: MapObject;
}

/**
 * Producción diaria de cada tipo de mina, para el dueño de su región si está
 * unida a su base (`startTurn`).
 */
export const MINE_YIELD: Readonly<Record<ResourceKind, number>> = {
  gold: 1000,
  wood: 2,
  ore: 2,
  mercury: 1,
  sulfur: 1,
  crystal: 1,
  gems: 1,
};

/**
 * Radio de visión de un héroe: el 4 de fheroes2 a la escala del mapa
 * (`radioALaEscala`, #229: 5 en el 42×42).
 */
export const HERO_SCOUT_RADIUS = radioALaEscala(4);

/**
 * Radio de visión de un pueblo o castillo (#72).
 *
 * Era su propia casilla y nada más, así que un héroe enemigo acampado pegado a
 * tu capital no producía un solo `hero_moved` que te llegara: 0 de 60 escenarios
 * medidos; con este radio, 60 de 60.
 *
 * **El número es del original y la forma no.** `GameStatic::getFogDiscoveryDistance`
 * (`game/game_static.cpp`) da `CASTLE: 5` y `HEROES: 4` —nuestro
 * `HERO_SCOUT_RADIUS` ya coincidía—, y `Castle::Scout()` la llama **sin
 * ramificar por el fuerte**: no depende de la fortificación, y el enum no tiene
 * un valor `TOWN` aparte. Lo que allí es un disco chapucero aquí es el cuadrado
 * de `marcarCuadrado`, así que el héroe **ya diverge** —81 casillas contra 69— e
 * igualar la forma es otra tarea. Se copia el número, y desde #229 se lleva a la
 * escala del mapa como la marcha (`radioALaEscala`: 5 → 6 en el 42×42).
 *
 * Y alimenta las DOS mitades de la niebla: `visibleNow` y también `fog` y
 * `memory` (`revealAroundTown`). Durante un tiempo solo alimentó la primera, y
 * con los asaltantes eso dejó de ser un dato de más para el agente y pasó a ser
 * una emboscada a ciegas: el agente veía el grupo de la región de casa sobre una
 * casilla `terrain: null` y la persona, que pinta con `fog`, no lo veía en 96 de
 * 200 semillas el día 1 — y lo pisaba.
 */
export const TOWN_SCOUT_RADIUS = radioALaEscala(5);

/**
 * Cómo terminó una partida: quién ganó, o `null` si **no ganó nadie**.
 *
 * Tiene nombre porque lo devuelven cuatro sitios —el estado, `playAiGame`, el
 * director y el arnés del banco— y escrito inline en cada uno son cuatro
 * declaraciones de la misma cosa, libres de divergir en cuanto a alguien se le
 * ocurra añadirle el día o el motivo.
 */
export interface GameOutcome {
  readonly winner: PlayerId | null;
}

/**
 * Quién pelea contra quién en una batalla del mapa: un héroe que ataca a
 * cualquier cosa, o un grupo de asaltantes que **embosca a un héroe**.
 *
 * Es una unión y no `{ attacker: Atacante; foe: BattleFoe }` para que el tipo
 * diga lo que la regla dice: un grupo solo embosca a héroes. Con los dos campos
 * sueltos cabía un asaltante contra un monstruo, y quien cerraba la emboscada
 * tenía que lanzar por un caso que nadie puede construir.
 *
 * Era `attackerHeroId: string`, y la frase «el atacante es siempre un jugador»
 * vivía en dos comentarios del servidor; los asaltantes la hicieron falsa.
 */
export type Enfrentamiento =
  | { readonly attacker: Extract<Atacante, { kind: 'hero' }>; readonly foe: BattleFoe }
  | {
      readonly attacker: Extract<Atacante, { kind: 'raider' }>;
      readonly foe: Extract<BattleFoe, { kind: 'hero' }>;
    };

export type PendingBattle = Enfrentamiento & { readonly battle: BattleState };

/** Si la batalla es una emboscada: la abrió un grupo, y el emboscado es un héroe. */
function esEmboscada<T extends Enfrentamiento>(
  p: T,
): p is Extract<T, { readonly attacker: { readonly kind: 'raider' } }> {
  return p.attacker.kind === 'raider';
}

export interface GameState {
  readonly seed: number;
  /** Día 1 en adelante. Los lunes son los días 1, 8, 15… */
  day: number;
  /**
   * El último día que se juega. Pasado él, la partida termina sin ganador.
   *
   * Se pide en `newGame({ maxDays })` y lo aplica `advanceDay`. Por qué vive
   * aquí y no en el bucle de cada conductor, en `finished`, tres campos abajo.
   */
  readonly maxDays: number;
  map: GameMap;
  players: Player[];
  heroes: Hero[];
  towns: Town[];
  current: PlayerId;
  pendingBattle: PendingBattle | null;
  /**
   * Los grupos de asaltantes en pie (`state/asaltantes.ts`). Son actores, como
   * los héroes, y no objetos del mapa: se mueven cada día, y la memoria de la
   * niebla —que copia objetos— los enseñaría donde ya no están.
   */
  raiders: Raider[];
  /**
   * La partida ha terminado, y `winner` dice quién ganó **o que no ganó nadie**.
   *
   * **Este docstring es el sitio donde se cuenta el porqué del tope de días**;
   * el resto del repositorio apunta aquí en vez de repetirlo.
   *
   * `!== null` significa «terminó» y nada más. Antes significaba «terminó **con**
   * ganador», y el tope de días vivía fuera —`MAX_DAYS` en `ws-server.ts`,
   * `DIAS_POR_DEFECTO` en el banco y un parámetro de `playAiGame`, cada uno con
   * su bucle—, así que al agotarse los días el bucle salía y esto se quedaba en
   * `null`: el núcleo sosteniendo que la partida seguía viva cuando ya no la
   * jugaba nadie. Un cuarto conductor que se olvidara del suyo jugaba hasta el
   * fin de los tiempos, y los que sí lo tenían tapaban el hueco por su cuenta:
   * de ahí nacieron el booleano `partidaTerminada` de `ws-server.ts` y el
   * `winner: number | null` del protocolo, los dos parcheando lo mismo desde
   * fuera.
   *
   * El `null` de dentro es ese empate por tiempo, y obliga a decidir qué se
   * enseña. Lo que **no** obliga es `tsc`: `finished.winner === viewer` con un
   * `null` delante compila y contesta «has perdido», así que la clasificación
   * de tres se escribe una vez por lector —`client/desenlace.ts`— y no en cada
   * ternario.
   */
  finished: GameOutcome | null;
  /**
   * La crónica. `readonly` es un candado, no adorno: el único `push` está en
   * `emit`, y con el array de solo lectura cualquier otro **no compila**.
   *
   * Es lo que sostiene «un hecho, un sitio» aquí: si el reparto se apoyara en
   * que todo el mundo se acuerde de llamar a `emit`, el emisor número veinte
   * nacería sin protagonista y sin sello. Y lo sostiene `tsc` en cada build, no
   * una expresión regular: un guardia por texto no sabe distinguir este
   * `log.push` del de `battle.ts`, que es otro tipo y otro canal.
   *
   * Los consumidores no se enteran: `slice`, `some`, `map`, `filter` y `at`
   * valen igual sobre un array de solo lectura.
   */
  readonly log: readonly GameEvent[];
  /**
   * Los personajes por id: individuos con atributos propios (`rpg/character.ts`)
   * que van como individuos en el ejército de un héroe con `Troop.member`.
   *
   * **Ausente en una partida de estrategia**, no vacío: `newGame` no lo escribe
   * y nada de la estrategia lo lee, así que no hay forma de que su presencia
   * mueva una partida. Lo lee la ida a la batalla (`battleSideForHero`) y lo
   * escribe la vuelta (`woundsFromBattle`), y solo si el ejército lleva algún
   * miembro.
   */
  characters?: Record<string, Character>;
  /**
   * El número del próximo veterano (`Veterania.id`). Un contador del estado y
   * no un id derivado de dónde está el individuo: se mueve de héroe a
   * guarnición y vuelve, y su identidad tiene que sobrevivir a eso. Se lleva
   * el primero al ganar su primer punto, en el orden de `stacks`, así que es
   * determinista.
   */
  siguienteVeterano: number;
  /**
   * Cuántas piezas de botín se han repartido. Cada reparto tira de **su propia
   * corriente** (`createRng` sobre la semilla de la partida y este número) y no
   * de `ctx.rng`: así el botín no desplaza ni una tirada de batalla, y que lo
   * hiciera se vería en el volcado del banco como partidas distintas en vez de
   * como líneas de botín añadidas. Es la misma idea que `siguienteVeterano`: un
   * contador del estado, determinista.
   */
  siguienteBotin: number;
  /**
   * El número del próximo héroe contratado (`hireHero`). Antes el id salía de
   * `hero-<jugador>-<cuántos héroes hay>-<día>`, y eso se repetía: con tres
   * jugadores, el 0 contrata, el 2 pierde la base y su héroe sale de
   * `state.heroes`, y la segunda contratación del 0 ese mismo día recibía el
   * mismo id que la primera (#126). Un contador no depende de cuántos quedan.
   */
  siguienteHeroe: number;
}

export interface GameContext {
  readonly rng: Rng;
}

/** Lo que cuesta contratar a un héroe nuevo en un pueblo propio. */
export const HERO_HIRE_COST = 2500;
/** Héroes simultáneos por jugador. */
export const MAX_HEROES_PER_PLAYER = 4;

export type AdventureAction =
  | { readonly type: 'move_hero'; readonly hero: string; readonly to: Point }
  | { readonly type: 'hire_hero'; readonly town: string }
  | {
      readonly type: 'recruit';
      readonly town: string;
      readonly creature: string;
      readonly count: number;
    }
  | { readonly type: 'build'; readonly town: string; readonly building: string }
  /**
   * Licenciar `count` individuos de `creature` del ejército de un héroe que
   * está en un castillo suyo (`dismissBlocker`). Es lo que deja cambiar una
   * tropa barata por una mejor: el cupo y el liderazgo se llenan con lo primero
   * que se recluta, y sin esto un héroe se quedaba con ella para siempre.
   */
  | {
      readonly type: 'dismiss';
      readonly hero: string;
      readonly creature: string;
      readonly count: number;
    }
  /**
   * Comprar en la armería de `town` una pieza que se vende (`seVende`, `item`) para
   * la mochila del héroe propio que está dentro (`buyBlocker`).
   */
  | { readonly type: 'buy_item'; readonly town: string; readonly item: string }
  /**
   * Ponerle a alguien una pieza de la mochila del héroe `hero`: al héroe si no se
   * dice a quién; a `veteran`, el individuo de su tropa con esa hoja; o a
   * `creature`, el primer novato sin hoja de ese tipo, que pasa a tenerla; o a
   * `puesto`, el individuo de ese puesto de su tropa (la escena de la tropa, donde
   * se pulsa a uno: el contrato del agente no lo lleva). Lo que ocupaba el hueco
   * vuelve a la mochila (`equipBlocker`).
   */
  | {
      readonly type: 'equip';
      readonly hero: string;
      readonly item: string;
      readonly veteran?: string;
      readonly creature?: string;
      readonly puesto?: number;
    }
  /**
   * Quitarle a alguien la pieza de `slot` y devolverla a la mochila
   * (`unequipBlocker`). El hueco llega ya comprobado: lo traducen las dos
   * puertas por las que entra como texto, `accionDelAgente` (el inglés del
   * contrato) y la sesión del cliente (`esHueco`).
   */
  | {
      readonly type: 'unequip';
      readonly hero: string;
      readonly slot: Hueco;
      readonly veteran?: string;
      /** El individuo de ese puesto de la tropa, como en `equip`. */
      readonly puesto?: number;
    }
  | { readonly type: 'end_turn' };

// ---------------------------------------------------------------- consultas

export function week(state: GameState): number {
  return Math.floor((state.day - 1) / 7) + 1;
}

export function dayOfWeek(state: GameState): number {
  return ((state.day - 1) % 7) + 1;
}

export function currentPlayer(state: GameState): Player {
  const p = state.players.find((x) => x.id === state.current);
  if (p === undefined) throw new Error(`jugador desconocido: ${state.current}`);
  return p;
}

export function playerById(state: GameState, id: PlayerId): Player {
  const p = state.players.find((x) => x.id === id);
  if (p === undefined) throw new Error(`jugador desconocido: ${id}`);
  return p;
}

export function heroById(state: GameState, id: string): Hero {
  const h = state.heroes.find((x) => x.id === id);
  if (h === undefined) throw new Error(`héroe desconocido: "${id}"`);
  return h;
}

export function townById(state: GameState, id: string): Town {
  const t = state.towns.find((x) => x.id === id);
  if (t === undefined) throw new Error(`pueblo desconocido: "${id}"`);
  return t;
}

export function heroesOf(state: GameState, player: PlayerId): Hero[] {
  return state.heroes.filter((h) => h.owner === player);
}

/**
 * El héroe PROPIO que está en la base `town`, o `null`. Solo los de `player`: un
 * rival parado en tu castillo no camina por tu base ni le pone voz el narrador.
 */
export function heroeEnLaBase(state: GameState, player: PlayerId, town: Town): Hero | null {
  return heroesOf(state, player).find((h) => h.at.x === town.at.x && h.at.y === town.at.y) ?? null;
}

export function townsOf(state: GameState, player: PlayerId): Town[] {
  return state.towns.filter((t) => t.owner === player);
}

/**
 * El héroe del dueño de `town` que está en su casilla, o `undefined` si no hay
 * ninguno (o el pueblo no tiene dueño). **Una regla con dos lectores**: a quién
 * va un recluta (`destinoDeRecluta`) y de qué tropa salen los veteranos de la
 * base (`veteranosEnSuBase`). Escrita en cada uno, el día que cambie —un héroe
 * de al lado que también cuente, por ejemplo— el veterano que el narrador ve en
 * la base no sería el que se puede reclutar con.
 */
export function heroeEnElPueblo(state: GameState, town: Town): Hero | undefined {
  if (town.owner === null) return undefined;
  return heroesOf(state, town.owner).find((h) => pointKey(h.at) === pointKey(town.at));
}

/**
 * Si `player` puede tener un héroe más: el tope (`MAX_HEROES_PER_PLAYER`) escrito
 * una vez, para los dos caminos por los que nace un héroe —contratarlo y
 * ascender a un veterano— y para el director, que no pregunta por un ascenso
 * que el tope no dejaría hacer.
 */
export function hayHuecoDeHeroe(state: GameState, player: PlayerId): boolean {
  return heroesOf(state, player).length < MAX_HEROES_PER_PLAYER;
}

/** A dónde va lo que se recluta en un pueblo, y con qué tope de liderazgo. */
export interface DestinoDeRecluta {
  /** El héroe del dueño que está dentro, o `undefined` si va a la guarnición. */
  readonly hero: Hero | undefined;
  readonly army: Army;
  readonly tope: number;
  /** Cuántos individuos caben como mucho: `CUPO_HEROE` o `CUPO_GUARNICION`. */
  readonly cupo: number;
  /** Cómo lo nombra la frase de rechazo: «el ejército» o «la guarnición». */
  readonly quien: string;
}

/**
 * La regla de a dónde va un recluta: al héroe del dueño que esté en el pueblo,
 * con su liderazgo; si no hay ninguno, a la guarnición, con el suyo.
 *
 * Una sola regla con dos lectores —`recruit`, que la aplica, y `planRecruits`,
 * que planifica con ella—. Copiada en los dos, el día que cambie uno la IA
 * pediría lo que el motor rechaza, y la partida lanzaría en el turno de la IA.
 */
export function destinoDeRecluta(state: GameState, town: Town): DestinoDeRecluta {
  if (town.owner === null) throw new Error(`no se puede reclutar en ${town.name}: no tiene dueño`);
  const hero = heroeEnElPueblo(state, town);
  return hero === undefined
    ? {
        hero,
        army: town.garrison,
        tope: GARRISON_LEADERSHIP,
        cupo: CUPO_GUARNICION,
        quien: 'la guarnición',
      }
    : { hero, army: hero.army, ...capacidadDe(hero), quien: 'el ejército' };
}

/**
 * Por qué no se pueden reclutar `count` de `creatureId` en `town` con `purse`,
 * o `null`: primero lo que el pueblo puede dar —hay tantos, alcanza el oro— y
 * luego si caben en `destino`. Lo leen la acción `recruit`, que lanza con él, y
 * el panel de la morada, que apaga «+1» y «Todo» y pone el motivo en su `title`.
 */
export function reclutarBlocker(
  town: Town,
  creatureId: string,
  count: number,
  destino: Pick<DestinoDeRecluta, 'army' | 'tope' | 'cupo' | 'quien'>,
  purse: Resources,
): string | null {
  return (
    recruitBlocker(town, creatureId, count, purse) ??
    troopBlocker(destino.army, destino.tope, destino.cupo, creatureId, count, destino.quien)
  );
}

/** Cuántos individuos de una criatura se pueden reclutar ahora, y por qué no más. */
export interface RecruitCapacity {
  /** Los que ofrece el pueblo esta semana. */
  readonly disponibles: number;
  /** Los que caben en el liderazgo del destino. */
  readonly caben: number;
  /** De los que hay y caben, cuántos se pueden pagar con `purse`. */
  readonly maximo: number;
  /** Lo que ocupa uno en el liderazgo. */
  readonly ocupaUno: number;
  /** Lo que ya ocupa el destino. */
  readonly ocupado: number;
  readonly tope: number;
  /** «el ejército» o «la guarnición», como lo nombra el rechazo. */
  readonly quien: string;
}

/**
 * Lo máximo que se puede reclutar de `creatureId` hacia `destino` con `purse`.
 *
 * Es la cuenta que hacía `planRecruits` por dentro, sacada aquí para que la
 * lean la IA y la pantalla: el botón «todo» del castillo reclutaba
 * `town.available` sin mirar el liderazgo ni el oro, y el núcleo lo rechazaba
 * entero —«no cabe»— en vez de dar lo que cabía. **Es la misma cuenta, línea a
 * línea, incluido el `while` que baja de uno en uno hasta que se puede pagar**:
 * con un coste de varios recursos la división no es trivial, y cambiarla por
 * otra fórmula movería el ancla del banco si alguna vez discrepara.
 *
 * Toma el destino y no el estado porque la IA planifica varias criaturas
 * seguidas sobre un ejército que va creciendo y un monedero que va menguando;
 * quien solo quiere la foto de ahora lo saca con `destinoDeRecluta`.
 */
export function recruitCapacity(
  town: Town,
  creatureId: string,
  destino: Pick<DestinoDeRecluta, 'army' | 'tope' | 'cupo' | 'quien'>,
  purse: Resources,
): RecruitCapacity {
  const disponibles = town.available[creatureId] ?? 0;
  const caben = troopRoom(destino.army, destino.tope, destino.cupo, creatureId);
  let maximo = Math.min(disponibles, caben);
  while (maximo > 0 && !canAfford(purse, recruitCost(creatureId, maximo))) maximo--;
  return {
    disponibles,
    caben,
    maximo,
    ocupaUno: unidadDelJuego(creatureId).leadership,
    ocupado: armyLeadership(destino.army),
    tope: destino.tope,
    quien: destino.quien,
  };
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
  readonly map: GameMap;
  readonly players: readonly { id: PlayerId; faction: FactionId; controller: Controller }[];
  readonly heroes: readonly Hero[];
  readonly towns: readonly Town[];
  /** Los asaltantes con los que empieza la partida; ninguno si falta. */
  readonly raiders?: readonly Raider[];
  readonly startingResources?: Partial<Resources>;
}

/**
 * Con qué empieza cada reino, copiado de `Kingdom::_getKingdomStartingResources`
 * (fheroes2, `kingdom/kingdom.cpp`), dificultad NORMAL: `{7500, 20, 5, 20, 5, 5,
 * 5}` sobre `Cost {gold, wood, mercury, ore, sulfur, crystal, gems}`.
 *
 * Antes decía `7500 oro, 10 madera, 10 mineral, 2 de cada raro`, que **no es
 * ninguna fila del original**: el oro sale de NORMAL y el material de HARD
 * (`{5000, 10, 2, 10, 2, 2, 2}`). Media fila de cada, sin declararlo — la misma
 * divergencia silenciosa que el coste de las moradas, y en la misma dirección:
 * oro de sobra y materia prima a la mitad.
 */
export const DEFAULT_STARTING_RESOURCES: Resources = {
  wood: 20,
  ore: 20,
  mercury: 5,
  sulfur: 5,
  crystal: 5,
  gems: 5,
  gold: 7500,
};

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

  const players: Player[] = config.players.map((p) => ({
    id: p.id,
    faction: p.faction,
    controller: p.controller,
    resources: addResources(DEFAULT_STARTING_RESOURCES, config.startingResources ?? {}),
    fog: Casillas.vacias(config.map),
    memory: new Map<string, RememberedObject>(),
    asaltantesVistos: new Map<string, AsaltanteRecordado>(),
    defeated: false,
    base: primeraCiudadDe(config.towns, p.id)?.id ?? null,
  }));

  const state: GameState = {
    seed: config.seed,
    day: 1,
    maxDays: config.maxDays,
    map: config.map,
    players,
    heroes: config.heroes.map((h) => ({ ...h, army: [...h.army] })),
    towns: config.towns.map((t) => ({
      ...t,
      available: { ...t.available },
      buildings: [...t.buildings],
    })),
    // El primero del día 1 (`ordenDelDia`); `?? 0` solo para una partida sin
    // jugadores, que no juega nadie.
    current: ordenDelDia(config.players, 1)[0] ?? 0,
    pendingBattle: null,
    // Copia de un nivel, como los héroes: la casilla y la tropa de un grupo se
    // SUSTITUYEN al moverse o al pelear, nunca se mutan, así que no hace falta
    // clonar lo que `buildMap` acaba de crear.
    raiders: (config.raiders ?? []).map((r) => ({ ...r })),
    finished: null,
    log: [],
    siguienteVeterano: 1,
    siguienteBotin: 0,
    siguienteHeroe: 1,
  };

  // Los pueblos arrancan con la hornada de la primera semana.
  for (const town of state.towns) applyWeeklyGrowth(town);

  for (const hero of state.heroes) {
    hero.movePoints = maxMovePoints(hero, state.characters);
    revealAround(state, hero);
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
 * El héroe mira alrededor: explora Y apunta lo que ve.
 *
 * Las dos cosas van juntas a propósito. Separarlas es exactamente el bug que
 * había: la casilla quedaba explorada para siempre y el objeto se leía del
 * estado vivo, así que el agente se enteraba de una captura ocurrida a veinte
 * casillas de su héroe más cercano.
 */
function revealAround(state: GameState, hero: Hero): void {
  const player = state.players.find((p) => p.id === hero.owner);
  if (player === undefined) return;
  explorar(state, player, hero.at, HERO_SCOUT_RADIUS);
}

/**
 * El castillo mira alrededor, igual que un héroe: explora Y apunta.
 *
 * Se llama donde un castillo puede empezar a mirar o mirar algo nuevo: al crear
 * la partida (para TODOS los jugadores, porque solo el primero pasa por
 * `startTurn`), al empezar el turno de su dueño y al capturarlo. Con eso, toda
 * casilla de `visibleNow` que venga de un castillo está ya en `fog`: el lienzo y
 * el agente miran el mismo cuadrado.
 */
function revealAroundTown(state: GameState, town: Town): void {
  if (town.owner === null) return;
  explorar(state, playerById(state, town.owner), town.at, TOWN_SCOUT_RADIUS);
}

function explorar(state: GameState, player: Player, centro: Point, radio: number): void {
  player.fog.marcarCuadrado(centro, radio);
  // El cuadrado se pregunta con dos restas y no con el `Set` de sus claves: era
  // el 10 % del banco (#95) levantar 81 cadenas por paso para mirar en ellas
  // la casilla de cada objeto del mapa. Los objetos están todos dentro del
  // mapa, así que el recorte de `marcarCuadrado` no cambia a quién se apunta, y
  // el orden de `memory` sigue siendo el de `state.map.objects`.
  for (const obj of state.map.objects) {
    if (Math.abs(obj.at.x - centro.x) <= radio && Math.abs(obj.at.y - centro.y) <= radio) {
      player.memory.set(obj.id, { day: state.day, object: { ...obj } });
    }
  }
  recordarAsaltantes(state, player.asaltantesVistos, casillasDelCuadrado(state.map, centro, radio));
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
    player.memory.set(obj.id, { day: state.day, object: { ...obj } });
  }
  recordarAsaltantes(state, player.asaltantesVistos, player.fog);
}

/**
 * Las casillas que un jugador está viendo AHORA MISMO: el entorno de cada uno
 * de sus héroes y el de cada uno de sus pueblos, que siempre tienen a alguien.
 *
 * Es la otra mitad de `fog`. `fog` dice «esto lo conozco»; esto dice «esto lo
 * estoy mirando», y solo de lo que se mira se puede afirmar el presente.
 */
export function visibleNow(state: GameState, playerId: PlayerId): Casillas {
  const casillas = Casillas.vacias(state.map);
  for (const { centro, radio } of miradasDe(state, playerId))
    casillas.marcarCuadrado(centro, radio);
  return casillas;
}

/**
 * Desde dónde mira AHORA un jugador: cada héroe y cada pueblo suyo, con su
 * radio. Es `visibleNow` sin levantar las claves, para quien pregunta por una
 * región y no por todo (`grupoALaVistaDesde`).
 */
export function miradasDe(state: GameState, playerId: PlayerId): Mirada[] {
  const out: Mirada[] = [];
  for (const hero of heroesOf(state, playerId))
    out.push({ centro: hero.at, radio: HERO_SCOUT_RADIUS });
  for (const town of townsOf(state, playerId))
    out.push({ centro: town.at, radio: TOWN_SCOUT_RADIUS });
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
 * se vio. Solo trae lo explorado: `memory` se llena junto con `fog` (`explorar`).
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
  if (mirando === null) return state.map.objects.map((object) => ({ day: state.day, object }));
  const vivos = new Map(state.map.objects.map((o) => [o.id, o]));
  return [...playerById(state, playerId).memory.values()].map((recuerdo) => {
    if (!mirando.has(recuerdo.object.at)) return recuerdo;
    return { day: state.day, object: vivos.get(recuerdo.object.id) ?? recuerdo.object };
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
  // Se recorre `state.heroes` y no `heroesOf`, que filtra a un array nuevo: en
  // este camino la asignación es justo lo que se venía a quitar.
  for (const hero of state.heroes) {
    if (hero.owner !== playerId) continue;
    const dx = Math.abs(hero.at.x - q.x);
    const dy = Math.abs(hero.at.y - q.y);
    if (dx <= HERO_SCOUT_RADIUS && dy <= HERO_SCOUT_RADIUS) return true;
  }
  for (const town of state.towns) {
    if (town.owner !== playerId) continue;
    const dx = Math.abs(town.at.x - q.x);
    const dy = Math.abs(town.at.y - q.y);
    if (dx <= TOWN_SCOUT_RADIUS && dy <= TOWN_SCOUT_RADIUS) return true;
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
 * lo de un grupo de asaltantes —que brota o se dispersa— con la regla de qué
 * grupo se ve (basta mirar su región, #130); la marcha que se para por un grupo,
 * por la casilla del héroe **y** el grupo; lo demás, por su casilla. Si no, la
 * crónica diría «nadie lo vio» de un grupo que el mapa y el agente sí enseñan, o
 * le contaría al rival que mira al héroe un grupo y su tropa que su niebla le
 * tapa (H4 de QA).
 */
function observa(state: GameState, p: PlayerId, draft: GameEventDraft, sitio: Point): boolean {
  switch (SE_VE_POR[draft.kind]) {
    case 'region':
      return grupoALaVistaDesde(state.map, miradasDe(state, p), sitio);
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
      return (
        visibleNowAt(state, p, sitio) &&
        grupoALaVistaDesde(state.map, miradasDe(state, p), grupo.at)
      );
    }
  }
}

// ---------------------------------------------------------------- turnos

function startTurn(state: GameState): void {
  const player = currentPlayer(state);
  emit(state, { kind: 'turn_start', actor: player.id, at: null });

  // Ingresos del día: lo que está UNIDO A LA BASE, y nada más (fase 2a).
  //
  // Una ciudad cobra su ayuntamiento solo si sigue conectada; una mina produce
  // para el dueño de su región solo si esa región es suya **y** está conectada
  // —el usuario corrigió aquí el plan: «una región cerrada pero desconectada de
  // la base NO da renta»—. Las dos preguntas salen de UNA búsqueda desde la
  // base (la foto de `territorio`), y por eso cortar un nodo se nota en todo
  // lo que colgaba detrás a la vez, sin que nadie tenga que apuntar nada.
  const { red, conexion: conexiones } = territorio(state);
  const conexion = conexiones.get(player.id);
  if (conexion === undefined)
    throw new Error(`el jugador ${player.id} no está en la foto del territorio`);
  let income = { ...EMPTY_RESOURCES };
  for (const town of townsOf(state, player.id)) {
    if (conexion.nodos.has(town.id)) income = addResources(income, { gold: dailyIncome(town) });
    town.builtToday = false;
    // Su recuerdo de lo que tiene alrededor es de hoy, igual que el de un héroe
    // quieto: un grupo que patrulla junto a casa se ve donde está.
    revealAroundTown(state, town);
  }
  for (const obj of state.map.objects) {
    if (obj.kind !== 'mine') continue;
    const region = red.regionDe[obj.at.y * state.map.width + obj.at.x] as number;
    if (conexion.regiones.has(region)) {
      income = addResources(income, { [obj.resource]: MINE_YIELD[obj.resource] });
    }
  }
  player.resources = addResources(player.resources, income);

  for (const hero of heroesOf(state, player.id)) {
    hero.movePoints = maxMovePoints(hero, state.characters);
    // El maná se recupera poco a poco, salvo en un pueblo con gremio.
    const enPueblo = townsOf(state, player.id).some(
      (t) => pointKey(t.at) === pointKey(hero.at) && mageGuildLevel(t) > 0,
    );
    hero.mana = enPueblo ? maxMana(hero) : Math.min(maxMana(hero), hero.mana + 1);
    // Y mira alrededor al levantarse: un héroe quieto también ve. Sin esto, su
    // recuerdo de la mina que tiene al lado sería del día en que llegó.
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
  if (dayOfWeek(state) === 1) {
    for (const town of state.towns) applyWeeklyGrowth(town);
  }
  moverAsaltantes(state, ctx.rng);
  if (dayOfWeek(state) === 1) brotarAsaltantes(state, ctx.rng);
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
 * Los grupos cuya región acaba de tener dueño se van. Lo llaman `captureNode` y
 * `captureTown`, que son los únicos sitios donde una región puede ganar dueño:
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
 * Por qué `quien` no puede actuar ahora mismo, o `null` si sí puede.
 *
 * La frase la escribe el núcleo y la enseña quien la pida, igual que
 * `buildBlocker` y `castBlocker`: antes había tres redacciones de esto —una
 * aquí y dos en el cliente— y la única que decía **quién** está jugando era la
 * que no se veía nunca, porque el cliente comprobaba el turno antes de llamar.
 */
export function turnBlocker(state: GameState, quien: PlayerId): string | null {
  if (state.finished !== null) return 'la partida ya ha terminado';
  if (quien === state.current) return null;
  return `todavía no es tu turno: ahora juega el ${describePlayer(state, state.current)}`;
}

/**
 * Quién es un jugador, con **el mismo número que ve todo lo demás**: el agente
 * ve el id en `owner`, en `you`, en las consultas y en la nota de fin de
 * partida, y dos numeraciones para la misma cosa es una trampa. `playerById`
 * **lanza** si el id no existe, en vez de degradar a un `jugador 7` con pinta
 * de dato bueno.
 */
export function describePlayer(state: GameState, id: PlayerId): string {
  return `jugador ${id} (${playerById(state, id).faction})`;
}

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

  // Quién actúa se anota ANTES de la acción: `end_turn` cambia `state.current`,
  // y el que acaba de meter su héroe en el castillo es el jugador saliente.
  const actor = currentPlayer(state).id;
  aplicar(state, action, ctx, alcance);

  // Y nada se aprende después del final. `aplicar` puede terminar la partida
  // —capturar el último castillo del rival lo hace—, y esta sincronía iba
  // detrás sin preguntar: en 34 de 200 semillas la crónica acababa con «Fin de
  // la partida» y DEBAJO «El jugador 1 aprende: Prisa, Lentitud», que además se
  // pinta así en pantalla. La regla que rompía está escrita en `settleBattle`
  // —`game_over` es el ÚLTIMO hecho del registro— y no la vigilaba nadie;
  // ahora sí (`test/invariantes.test.ts`).
  if (state.finished === null) syncSpellbooks(state, actor);
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
      hireHero(state, action.town);
      return;
    }

    case 'build': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      if (town.owner !== player.id) throw new Error('ese pueblo no es tuyo');
      player.resources = buildInTown(town, action.building, player.resources);
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
      if (town.owner !== player.id) throw new Error('ese pueblo no es tuyo');

      const destino = destinoDeRecluta(state, town);
      // Lo que el pueblo puede dar y lo que cabe (`reclutarBlocker`), ANTES de
      // cobrar: `payRecruit` descuenta las criaturas del pueblo y el oro del
      // monedero, y un rechazo después de pagar sería tropa pagada y perdida.
      const motivo = reclutarBlocker(
        town,
        action.creature,
        action.count,
        destino,
        player.resources,
      );
      if (motivo !== null) throw new Error(`no se puede reclutar: ${motivo}`);
      const ampliado = withTroops(destino.army, action.creature, action.count);

      player.resources = payRecruit(town, action.creature, action.count, player.resources);
      const hero = destino.hero;
      // Reclutar no toca los puntos de hoy: se fijan al empezar el día
      // (`startTurn`), y la tropa nueva cuenta a partir de mañana.
      if (hero !== undefined) hero.army = ampliado;
      else {
        town.garrison = ampliado;
      }
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

    case 'buy_item': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      const noSe = buyBlocker(state, town, action.item, player.id);
      if (noSe !== null) throw new Error(`no se puede comprar: ${noSe}`);
      // `buyBlocker` ya ha mirado que el héroe está y que la pieza existe.
      const hero = heroeEnElPueblo(state, town) as Hero;
      const pieza = piezaSiExiste(action.item)!;
      player.resources = subtractResources(player.resources, { gold: pieza.precio });
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
      hero.mochila = sacarDeLaMochila(hero.mochila, action.item);
      const { equipo, quitada } = ponerPieza(equipoDe(hero, quien), action.item);
      vestir(
        hero,
        conEquipoDe(hero, quien, equipo, () => hojaNueva(state)),
      );
      aLaMochila(hero, quitada);
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
  if (town.owner !== player) return `${town.name} no es de tu bando`;
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
  const jugador = playerById(state, player);
  if (!canAfford(jugador.resources, { gold: pieza.precio })) {
    return `${pieza.nombre} cuesta ${describirCoste({ gold: pieza.precio })} y no te alcanza`;
  }
  return null;
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
  return ponerseBlocker(hero, quien, pieza.id);
}

/**
 * Por qué el portador `quien` de `hero` no se puede poner la pieza `id` (que
 * existe), o `null`: la pregunta de siempre sobre lo que llevaría puesto, el
 * equipo de serie de su unidad incluido (`equipoDelPortadorBlocker`: un mandoble
 * no entra con el escudo de serie). La leen `equipBlocker` y la IA, antes de
 * equipar y antes de comprar para alguien.
 */
export function ponerseBlocker(hero: Hero, quien: Portador, id: string): string | null {
  const llevaria = equipoPuestoDe(hero, quien, { ...equipoDe(hero, quien), [pieza(id).hueco]: id });
  return equipoDelPortadorBlocker(
    nombreDelPortador(hero, quien),
    llevaria,
    id,
    equipoDeSerieDe(hero, quien),
  );
}

/** Cómo se nombra al portador `quien` de `hero` en un motivo: el héroe, la unidad o el personaje. */
function nombreDelPortador(hero: Hero, quien: Portador): string {
  if ('heroe' in quien) return hero.name;
  const t = hero.army[quien.indice] as Troop;
  return t.member === undefined
    ? `esa unidad de ${unidadDelJuego(t.creature).name}`
    : 'ese personaje';
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
 * Por qué ese héroe no puede licenciar `count` × `creature` ahora, o `null`.
 * La frase es para la persona: la lanza la acción, y de ahí la leen la barra
 * del castillo (`session.ts` enseña el error del núcleo, no redacta) y el
 * agente en su veredicto.
 *
 * Solo en un castillo propio —la base u otro—: licenciar en mitad del camino
 * sería tirar tropa para pasar una emboscada más ligero, y lo que se pidió es
 * poder **cambiarla** por otra mejor, que es algo que se hace donde se recluta.
 * Un personaje no se licencia así: es uno y tiene nombre, y no está en el
 * catálogo.
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
  const castillo = state.towns.find(
    (t) => t.owner === hero.owner && pointKey(t.at) === pointKey(hero.at),
  );
  if (castillo === undefined) {
    return `${hero.name} no está en un castillo suyo: la tropa se licencia en la base o en un castillo propio`;
  }
  // La frase dice el NOMBRE de la criatura y no su id: «"peasant"» era una
  // palabra en inglés en la barra del castillo. Un id que no está en el catálogo
  // —el agente puede mandar cualquier texto— se nombra tal cual, diciendo que no
  // existe, en vez de reventar en `creature()` con un error que no es el motivo.
  if (creatureId === CHARACTER_BODY) {
    return 'un personaje no se licencia: es uno y tiene nombre, no un individuo de la tropa';
  }
  const especie = unidadDelJuegoSiExiste(creatureId);
  if (especie === null) {
    return `no existe ninguna unidad "${creatureId}", así que ${hero.name} no lleva ninguna`;
  }
  const lleva = hero.army.filter((t) => t.creature === creatureId && t.member === undefined).length;
  if (lleva === 0) return `${hero.name} no lleva individuos de tipo ${especie.name}`;
  if (count > lleva) {
    return `${hero.name} lleva ${lleva} × ${especie.name} y no puede licenciar ${count}`;
  }
  return null;
}

/**
 * Contrata un héroe nuevo en un pueblo propio.
 *
 * Sin esto, perder al único héroe deja al jugador inerte para siempre: conserva
 * el castillo, así que no está derrotado, pero no puede volver a mover una sola
 * pieza. La partida se quedaba encallada hasta el límite de días.
 */
function hireHero(state: GameState, townId: string): void {
  const town = townById(state, townId);
  const player = currentPlayer(state);
  if (town.owner !== player.id) throw new Error('ese pueblo no es tuyo');
  if (!hayHuecoDeHeroe(state, player.id)) {
    throw new Error('ya tienes el máximo de héroes');
  }
  if (player.resources.gold < HERO_HIRE_COST) throw new Error('oro insuficiente');
  if (state.heroes.some((h) => pointKey(h.at) === pointKey(town.at))) {
    throw new Error('ya hay un héroe en el pueblo');
  }

  // La `c` (de «contratado») lo separa del inicial, `hero-<jugador>`, y del
  // ascendido, `hero-veterano-<n>`: los tres viven en el mismo espacio de ids.
  const id = `hero-${player.id}-c${state.siguienteHeroe++}`;
  const hero = heroeRecienHecho({
    id,
    owner: player.id,
    name: `Capitán de ${town.name}`,
    faction: town.faction,
    at: town.at,
    experience: EXPERIENCIA_INICIAL_DE_HEROE,
    tipo: tipoDeHeroePorDefecto(town.faction),
  });
  hero.movePoints = maxMovePoints(hero, state.characters);

  player.resources = addResources(player.resources, { gold: -HERO_HIRE_COST });
  state.heroes.push(hero);
  emit(state, {
    kind: 'hero_hired',
    hero: id,
    town: town.id,
    actor: player.id,
    at: town.at,
  });

  takeGarrison(state, hero, town);
  revealAround(state, hero);
}

/**
 * Los veteranos de rango máximo que `player` tiene en su base ahora mismo: en la
 * guarnición y en la tropa de su héroe que está allí (`veteranosEn`). Sin base,
 * ninguno: no hay dónde hacerse héroe.
 */
export function veteranosEnSuBase(state: GameState, player: PlayerId): VeteranoEnBase[] {
  const base = baseOf(state, player);
  return base === null ? [] : veteranosEn(base, heroeEnElPueblo(state, base));
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
 * **Quien quede en la casilla del castillo recoge la guarnición** (`takeGarrison`,
 * la misma puerta que el contratado y el que vuelve vencido): el nacido si nace
 * en ella, y si no, el héroe del dueño que ya la ocupaba —el portador, cuando
 * el veterano venía en su tropa—, con el nacido al lado y sin tropa. Antes no la recogía nadie, porque «un héroe sin tropa en su base no
 * corre peligro». Era falso: con el héroe del dueño dentro la ciudad la defiende
 * **solo él con su tropa** (regla del usuario), así que la guarnición dejaba de
 * pelear y la base caía esa misma noche ante dos campesinos —las semillas 11 y
 * 23 de la sonda de QA, que sin ascenso aguantaban—. La recoge el de la casilla
 * y no «el nacido» porque es el que defiende: dársela al de al lado dejaba el
 * mismo agujero con otro nombre. Decisión del usuario: «Recoge la guarnición».
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
    v.base.garrison = fuera(v.base.garrison);
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
  const enLaCasilla = heroeEnElPueblo(state, v.base);
  if (enLaCasilla !== undefined) takeGarrison(state, enLaCasilla, v.base);
  revealAround(state, hero);
  return hero;
}

/**
 * Un héroe que entra en su pueblo se lleva la guarnición que le quepa en el
 * liderazgo y en su cupo de individuos, en orden; lo que no cabe se queda
 * guardando el pueblo en vez de desaparecer. No lanza: entrar en casa no es
 * pedir tropa.
 *
 * **No toca los puntos de movimiento.** Los del día se fijan al empezarlo
 * (`startTurn`) con la tropa que se tenía, y lo que se una después —esta tropa
 * o la que se recluta— cuenta desde mañana. Antes se recortaban aquí al de la
 * criatura más lenta, y eso hacía que recoger tropa de paso dejara sin puntos
 * una marcha ya cobrada: había que distinguir pasar de llegar. Regla de juego
 * por verificar contra fheroes2; no se cita como suya.
 */
function takeGarrison(state: GameState, hero: Hero, town: Town): void {
  if (town.owner !== hero.owner) return;
  const { tope, cupo } = capacidadDe(hero);
  const { dentro, fuera } = troopsThatFit(hero.army, tope, cupo, town.garrison);
  if (dentro.length === 0) return;
  hero.army = [...hero.army, ...dentro];
  town.garrison = fuera;
  emit(state, {
    kind: 'garrison_taken',
    hero: hero.id,
    town: town.id,
    actor: hero.owner,
    at: town.at,
  });
}

/**
 * Las casillas que un héroe de `player` puede **alcanzar pero no cruzar**: lo
 * que `enemyAt` da por batalla y el mapa no sabe —un héroe ajeno y un castillo
 * ajeno con guarnición—. Los monstruos ya los bloquea el mapa.
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
  const out: Point[] = [];
  for (const h of state.heroes) if (h.owner !== player) out.push(h.at);
  for (const t of state.towns) if (t.owner !== player && t.garrison.length > 0) out.push(t.at);
  // Un grupo de asaltantes es hostil para todos: se alcanza —atacarlo es
  // pedirlo de destino— y no se cruza.
  for (const r of state.raiders) out.push(r.at);
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
  return reachableFrom(state.map, hero.at, casillasHostiles(state, hero.owner), peligro);
}

/**
 * El camino de un héroe hasta `to`, con lo hostil como final de trayecto: el
 * mismo que va a andar `move_hero`. Lo pide la pantalla para enseñar la ruta.
 */
export function caminoHasta(state: GameState, hero: Hero, to: Point): PathStep[] | null {
  return caminoEsquivando(state, hero, to, casillasHostiles(state, hero.owner));
}

/**
 * El Dijkstra del héroe con una lista de hostiles **elegida a mano**. No se
 * exporta, y es a propósito: fuera de aquí la lista es siempre la de la partida
 * (`caminoHasta`), y con esta abierta cualquiera podría pasarle `[]` y cruzar
 * por encima de una guarnición. Solo la usa, además, `porQueNoLlega`, que
 * necesita preguntar «¿y si este no estuviera?» para saber a quién culpar.
 */
function caminoEsquivando(
  state: GameState,
  hero: Hero,
  to: Point,
  hostiles: readonly Point[],
): PathStep[] | null {
  return findPath(state.map, hero.at, to, hostiles);
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
 *     culpar.
 *  2. Lo hostil que el héroe **alcanza**: lo que tiene delante.
 *  3. De eso, lo que basta quitar para pasar. Si nada basta solo —dos héroes
 *     guardando los dos pasos de una región—, son todos los de delante.
 */
export function porQueNoLlega(state: GameState, hero: Hero, to: Point): string {
  const frase = `no hay camino hasta (${to.x},${to.y})`;
  if (caminoEsquivando(state, hero, to, []) === null) return frase;
  const hostiles = casillasHostiles(state, hero.owner);
  const alcance = alcanceDelHeroe(state, hero);
  const delante = hostiles.filter((h) => costeEnElAlcance(alcance, h) !== null);
  const bastan = delante.filter(
    (h) =>
      caminoEsquivando(
        state,
        hero,
        to,
        hostiles.filter((o) => pointKey(o) !== pointKey(h)),
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
  const ciudad = state.towns.find((t) => pointKey(t.at) === pointKey(at));
  if (ciudad !== undefined) return `la ciudad ${ciudad.name}, con guarnición, ${donde}`;
  if (state.raiders.some((r) => pointKey(r.at) === pointKey(at))) {
    return `un grupo de asaltantes ${donde}`;
  }
  throw new Error(
    `(${at.x},${at.y}) se tiene por hostil y no hay en ella ni héroe, ni ciudad, ni asaltantes`,
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
  if (hoy === 0) throw new Error('no quedan puntos de movimiento para dar ni un paso');

  // Si por el camino se ve un grupo que la emboscaría y que la ruta no avisaba,
  // la marcha se para donde lo ve (#130; la regla, en `vigiaDeLaMarcha`). Casi
  // siempre no hay —la IA no pisa las regiones de los que ha visto—, y entonces el bucle no paga
  // nada. De un solo paso no hay «más adelante», y mirarlo mediría la fuerza
  // del héroe antes que la batalla, que es quien tiene que lanzar si su
  // ejército no vale.
  const miradas = (): readonly Mirada[] => miradasDe(state, player.id);
  const vigia = camino.length > 1 ? vigiaDeLaMarcha(state, hero, camino, miradas) : null;

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
    // tiene ocasión de cambiar de idea (#130). Lo que recoge el paso —guarnición,
    // un nodo que dispersa grupos— cambia quién la emboscaría, y siempre deja un
    // hecho en la crónica. También en el último paso de hoy: la parada gana al
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
 * **El héroe va antes que la ciudad, y es una regla decidida, no un orden de
 * comprobación**: si atacan una ciudad con el héroe del dueño dentro, defiende
 * **solo el héroe con su tropa** (`defenderSide`), y esa batalla es la final.
 * Si pierde, `applyVictory` captura la ciudad, `captureTown` se lleva la
 * guarnición que no llegó a pelear y, si era la base, `checkDefeat` elimina a su
 * dueño. La guarnición que no viaja con él no pelea; quien la quiera en la
 * batalla la recoge en su tropa al pasar por casa.
 *
 * QA la señaló como fallo (I2 de la 2a: la guarnición inicial se queda fuera
 * justo cuando el dueño vuelve a defender) y el usuario la confirmó con estas
 * palabras: «Solo el heroe con su tropa, es la batalla final (si pierde)». La
 * fija un test de `game.test.ts`; sumar la guarnición al héroe es otra
 * decisión, suya.
 */
function enemyAt(state: GameState, at: Point, player: PlayerId): BattleFoe | null {
  const obj = objectAt(state.map, at);
  if (obj !== undefined && obj.kind === 'monster' && !obj.defeated) {
    return { kind: 'monster', objectId: obj.id };
  }

  const asaltante = state.raiders.find((r) => pointKey(r.at) === pointKey(at));
  if (asaltante !== undefined) return { kind: 'raider', raiderId: asaltante.id };

  const heroeEnemigo = state.heroes.find(
    (h) => h.owner !== player && pointKey(h.at) === pointKey(at),
  );
  if (heroeEnemigo !== undefined) return { kind: 'hero', heroId: heroeEnemigo.id };

  const pueblo = state.towns.find((t) => pointKey(t.at) === pointKey(at));
  if (pueblo !== undefined && pueblo.owner !== player) {
    const defendido = pueblo.garrison.length > 0;
    if (defendido) return { kind: 'town', townId: pueblo.id };
  }
  return null;
}

/**
 * Lo que pasa al pisar una casilla: se recogen recursos y cofres, se toma el
 * nodo y se toma el castillo vacío (o se recoge su tropa, si es tuyo).
 *
 * Corre en **cada casilla del camino**, no solo en la última, y es lo que hace
 * que un nodo se tome cruzándolo y que la tropa de casa se recoja al pasar. La
 * mina y el pueblo ya no hacen nada aquí: son de quien tenga su región.
 */
function collectAt(state: GameState, hero: Hero, at: Point): void {
  const player = playerById(state, hero.owner);
  const obj = objectAt(state.map, at);

  if (obj !== undefined) {
    switch (obj.kind) {
      case 'resource':
        if (!obj.taken) {
          obj.taken = true;
          player.resources = addResources(player.resources, { [obj.resource]: obj.amount });
          emit(state, {
            kind: 'resource_gained',
            resource: obj.resource,
            amount: obj.amount,
            actor: player.id,
            at,
          });
        }
        break;
      case 'chest':
        if (!obj.taken) {
          obj.taken = true;
          player.resources = addResources(player.resources, { gold: obj.gold });
          emit(state, {
            kind: 'resource_gained',
            resource: 'gold',
            amount: obj.gold,
            actor: player.id,
            at,
          });
        }
        break;
      case 'node':
        if (obj.owner !== player.id) captureNode(state, obj, player.id);
        break;
      default:
        break;
    }
  }

  const pueblo = state.towns.find((t) => pointKey(t.at) === pointKey(at));
  if (pueblo !== undefined) {
    if (pueblo.owner !== player.id) {
      captureTown(state, pueblo, player.id);
      checkDefeat(state);
    }
    // La tropa de casa se recoge también al pasar: desde que los puntos del día
    // no los recorta la tropa nueva (`takeGarrison`), recogerla de camino ya no
    // deja sin puntos una marcha cobrada.
    else takeGarrison(state, hero, pueblo);
  }
}

/**
 * Cambia de dueño un nodo de la red. **El único escritor de `node.owner`**: es
 * la regla de «un hecho, un sitio», y aquí es más fácil que con el castillo
 * porque el nodo tiene una sola cara —el objeto del mapa— y no dos.
 *
 * De quién era se lee ANTES de escribir el dueño nuevo: después ya no hay a
 * quién preguntárselo, y es el dato con el que su dueño de ayer se entera.
 */
function captureNode(
  state: GameState,
  nodo: Extract<MapObject, { kind: 'node' }>,
  player: PlayerId,
): void {
  const anterior = nodo.owner;
  nodo.owner = player;
  emit(state, { kind: 'node_captured', node: nodo.id, from: anterior, actor: player, at: nodo.at });
  dispersarAsaltantes(state);
}

/**
 * Cambia de dueño un castillo. Las DOS caras del mismo hecho, juntas.
 *
 * `Town.owner` es el libro de cuentas —quién cobra, quién construye, quién
 * pierde la partida al quedarse sin ninguno— y el objeto del mapa es la
 * bandera: lo que ve quien pasa por delante, lo que pinta el cliente y lo que
 * recuerda la niebla. Mientras esta función solo escribió la primera, las dos
 * copias divergían en la primera captura y no volvían a coincidir jamás.
 *
 * Lo que provocaba no era un detalle de pintado: la IA veía el castillo ENEMIGO
 * donde tenía el suyo, y como un castillo enemigo vale 40000 y estaba a un paso,
 * se pasaba la partida entrando en su propia casa. Dos jugadores haciendo eso a
 * la vez no se encuentran nunca — y ninguno se queda sin castillos, que es la
 * única forma de perder. Ese era el ~10 % de partidas que no terminaban.
 */
function captureTown(state: GameState, town: Town, player: PlayerId): void {
  // De quién era, antes de que deje de serlo. Es el dato con el que su dueño de
  // ayer se entera de que lo ha perdido: sin leerlo aquí no hay forma de
  // escribirlo, porque un instante después el castillo ya es de otro.
  const anterior = town.owner;
  town.owner = player;
  town.garrison = [];
  const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === town.id);
  if (bandera === undefined || bandera.kind !== 'town') {
    throw new Error(`el castillo ${town.id} no tiene objeto en el mapa`);
  }
  bandera.owner = player;
  revealAroundTown(state, town);
  emit(state, {
    kind: 'town_captured',
    town: town.id,
    from: anterior,
    actor: player,
    at: town.at,
  });
  // Una ciudad es un nodo: tomarla puede cerrar una región, y los grupos que
  // la patrullaban se van. Antes de la nota de abajo y sin ser una derrota.
  dispersarAsaltantes(state);
  // Sin `checkDefeat` aquí, y es a propósito: la captura es UNA parte de lo que
  // pasa, y quien la llama comprueba la derrota al acabar lo suyo. Tomar la base
  // con su héroe dentro es capturar **y después** derrotar al héroe; si la
  // derrota se mirase aquí, `game_over` saldría antes que `hero_defeated`, y
  // eso `emit` ya no lo deja escribir.
}

// ---------------------------------------------------------------- batallas

/**
 * Los personajes del ejército de un héroe, listos para `createBattle`, o
 * `undefined` si no lleva ninguno —que es siempre, en estrategia—.
 */
function membersOf(state: GameState, hero: Hero): ReadonlyMap<string, BattleMember> | undefined {
  let out: Map<string, BattleMember> | undefined;
  for (const s of hero.army) {
    if (s.member === undefined) continue;
    const c = characterOf(state.characters, s.member, `${hero.name} lleva en el ejército`);
    out ??= new Map();
    out.set(s.member, { profile: combatProfile(c), hp: c.hp });
  }
  return out;
}

/**
 * La base de un jugador, si todavía es suya; `null` si no la tuvo nunca o la
 * ha perdido. El dueño se pregunta a `Town.owner`, que es donde vive.
 */
export function baseOf(state: GameState, player: PlayerId): Town | null {
  const id = playerById(state, player).base;
  if (id === null) return null;
  const town = townById(state, id);
  return town.owner === player ? town : null;
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
  return { purse: playerById(state, hero.owner).resources.gold };
}

function battleSideForHero(state: GameState, hero: Hero, side: Side): BattleSide {
  const pueblo = state.towns.find(
    (t) => t.owner === hero.owner && pointKey(t.at) === pointKey(hero.at),
  );
  const members = membersOf(state, hero);
  return {
    ...(members === undefined ? {} : { members }),
    army: troopsAsStacks(hero.army),
    hero: {
      ...cuerposDelHeroe(hero),
      mando: mandoDe(hero, retiradaDe(state, hero, side)),
      figura: figuraDelHeroe(hero),
    },
    moraleBonus: moraleBonus(hero) + (pueblo === undefined ? 0 : moraleFromBuildings(pueblo)),
    luckBonus: luckBonus(hero),
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
 * El bando que defiende. Con un héroe, **su tropa y nada más**, también dentro
 * de su propia ciudad: la guarnición no se suma. Es la regla decidida por el
 * usuario que cuenta `enemyAt` (I2 de la 2a), no una rama que falte.
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
    case 'town': {
      const pueblo = townById(state, foe.townId);
      return {
        army: troopsAsStacks(pueblo.garrison),
        hero: null,
        moraleBonus: moraleFromBuildings(pueblo),
      };
    }
    case 'raider':
      return ladoDeAsaltante(state, foe.raiderId);
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
      defender = null;
      break;
    case 'hero':
      defender = heroById(state, foe.heroId).owner;
      break;
    case 'town':
      defender = townById(state, foe.townId).owner;
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
    case 'town':
      return townById(state, foe.townId).at;
    case 'raider':
      return raiderById(state, foe.raiderId).at;
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
  emit(state, { kind: 'battle_started', attacker, foe, ...dejarPendiente(state, quienes, ctx) });
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
  const lugar = dejarPendiente(state, { attacker, foe }, ctx);
  emit(
    state,
    faltan > 0
      ? { kind: 'battle_started', attacker, foe, ...lugar, faltan }
      : { kind: 'battle_started', attacker, foe, ...lugar },
  );
}

/**
 * Crea la batalla, la deja en `pendingBattle` y dice de quién es y dónde, que
 * es lo que lleva el `battle_started`.
 */
function dejarPendiente(
  state: GameState,
  quienes: Enfrentamiento,
  ctx: GameContext,
): { actor: PlayerId; at: Point } {
  const battle = createBattle(
    attackerSide(state, quienes.attacker),
    defenderSide(state, quienes.foe),
    ctx.rng,
  );
  const pending: PendingBattle = { ...quienes, battle };
  state.pendingBattle = pending;
  // La casilla se deriva aquí también, y no se toma del paso que abrió la
  // batalla: así el sitio que dice el `battle_started` y el que dice el
  // `battle_ended` no son dos respuestas que puedan dejar de coincidir.
  return { actor: protagonista(state, pending), at: lugarDelRival(state, quienes.foe) };
}

/**
 * Los jugadores que no lleva la IA de reglas (`Player.controller`: la persona y
 * el agente). Por sus bandos pelea la IA cuando le toca resolver, pero no se
 * rinde: rendirse les cuesta oro y esa decisión es solo de su dueño.
 */
export function sinLaIA(state: GameState): ReadonlySet<PlayerId> {
  return new Set(state.players.filter((p) => p.controller !== 'ai').map((p) => p.id));
}

/**
 * Juega la batalla pendiente con la IA táctica y aplica el resultado. Por los
 * bandos de los jugadores que no lleva ella (`sinLaIA`) pelea, pero no se rinde.
 */
export function resolvePendingBattle(state: GameState, ctx: GameContext): BattleOutcome {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  const outcome = autoResolve(
    pending.battle,
    ctx.rng,
    sidesOwnedBy(state, pending, sinLaIA(state)),
  );
  settleBattle(state, ctx);
  return outcome;
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
  // La casilla, LEÍDA AQUÍ: con los dos bandos todavía en pie. Después hay
  // héroes que salen del mapa y castillos que cambian de bandera, y preguntar
  // entonces sería preguntar por alguien que ya no está. Es el mismo patrón que
  // el `const dueño = hero.owner` de más abajo, y por eso el dato no hace falta
  // guardarlo en `PendingBattle`.
  const at = lugarDelRival(state, pending.foe);
  // El botín, decidido AQUÍ por la misma razón: si el que pierde es una ciudad
  // neutral, un instante después de capturarla ya es de quien gana.
  const botin = botinDe(state, pending, winner);
  // Las heridas, PRIMERO: antes de que el héroe que pierde salga del mapa con
  // su ejército. Lo que se escribe es del personaje, no del héroe, y tiene que
  // quedar escrito pase lo que pase con quien lo llevaba.
  woundsFromBattle(state, pending.battle);
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
          base = { creature: s.origen.unidad };
          break;
        case 'personaje':
          // `member` viaja de vuelta: sin él, el superviviente volvería al mapa
          // convertido en un individuo «character» que nadie sabe leer.
          base = { creature: s.body, member: s.origen.id };
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

  checkDefeat(state);
}

/**
 * Quién cobra botín de esta batalla, o `null`: **el héroe que gana a un bando
 * neutral que no es un monstruo** —un grupo de asaltantes, atacado o
 * emboscando, o la guarnición de una ciudad neutral—. Una ciudad rival
 * guarnecida no da: no es una guarnición de nadie, es la del rival. Se pregunta
 * antes de aplicar nada, porque la ciudad deja de ser neutral al capturarla.
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
  if (perdedor.kind === 'town' && townById(state, perdedor.townId).owner === null) {
    return { heroId: ganador.heroId, from: 'town' };
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
    jugador.resources = addResources(jugador.resources, { gold: -precio });
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
 * que ya trae puesta), y sin movimiento hasta mañana. Mira alrededor y, si cae
 * en el castillo, se lleva la guarnición que le quepa: es su casa.
 */
function volverABase(state: GameState, hero: Hero, base: Town, precio: number | null): void {
  if (precio === null) hero.army = [];
  hero.at = casillaDeVuelta(state, hero, base);
  hero.movePoints = 0;
  revealAround(state, hero);
  const comun = { kind: 'hero_returned', hero: hero.id, town: base.id } as const;
  const origen = { actor: hero.owner, at: hero.at };
  emit(
    state,
    precio === null
      ? { ...comun, surrendered: false, ...origen }
      : { ...comun, surrendered: true, gold: precio, ...origen },
  );
  if (pointKey(hero.at) === pointKey(base.at)) takeGarrison(state, hero, base);
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
        if (!isEnterable(state.map, p) || vistas.has(pointKey(p))) continue;
        vistas.add(pointKey(p));
        if (!ocupada(p) && objectAt(state.map, p) === undefined) return p;
        cola.push(p);
      }
    }
  }
  throw new Error(`${hero.name} no tiene casilla libre a la que volver junto a ${base.name}`);
}

/**
 * Los PV con los que cada personaje sale de la batalla, escritos en
 * `state.characters`: las heridas duran más que la batalla.
 *
 * Los de los DOS bandos, porque un personaje puede defender. El que cae queda a
 * 0 y sale del ejército por el mismo camino que cualquier stack a 0
 * (`superviviente`); sigue en `characters`, y qué le pasa después —si se levanta,
 * si se pierde— es de la fase siguiente, no de esta.
 */
function woundsFromBattle(state: GameState, battle: BattleState): void {
  if (state.characters === undefined) return;
  for (const s of battle.stacks) {
    // Ni la criatura ni el héroe arrastran heridas: el héroe entra sano.
    const id = personajeDe(s.origen);
    if (id === null) continue;
    // `battleSideForHero` ya lanzó si faltaba al entrar: faltar al salir es
    // que alguien lo borró a mitad de batalla, y eso también se dice.
    characterOf(state.characters, id, 'la batalla devuelve').hp = stackHp(s);
  }
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
      const pueblo = state.towns.find(
        (t) => t.owner === derrotado.owner && pointKey(t.at) === pointKey(at),
      );
      if (pueblo !== undefined) captureTown(state, pueblo, hero.owner);
      heroeVencido(state, derrotado, precio, at);
      break;
    }
    case 'town': {
      const pueblo = townById(state, foe.townId);
      captureTown(state, pueblo, hero.owner);
      break;
    }
    case 'raider':
      // Un grupo sin héroe no se rinde: perder es caer entero.
      dejarAsaltante(state, foe.raiderId, []);
      break;
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
    case 'town': {
      const pueblo = townById(state, foe.townId);
      pueblo.garrison = army;
      break;
    }
    case 'raider':
      // Repele al héroe y sigue patrullando con lo que le quede.
      dejarAsaltante(state, foe.raiderId, army);
      break;
  }
}
