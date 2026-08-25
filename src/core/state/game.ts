/**
 * Estado de partida y bucle de turnos del mapa de aventura.
 *
 * Un turno de jugador es: mover héroes, construir en los pueblos, reclutar, y
 * pasar. Cuando todos han pasado, avanza el día; los lunes crecen las moradas.
 */
import { autoResolve, type BattleOutcome } from '../ai/tactics.js';
import { type BattleSide, createBattle } from '../battle/battle.js';
import type { BattleHero, BattleState, Side } from '../battle/types.js';
import { SIDES } from '../battle/types.js';
import { creature } from '../data.js';
import {
  addToArmy,
  type Hero,
  isArmyEmpty,
  learnable,
  luckBonus,
  maxMana,
  maxMovePoints,
  moraleBonus,
  pruneArmy,
} from '../hero/hero.js';
import {
  findPath,
  type GameMap,
  inBounds,
  type MapObject,
  objectAt,
  pointKey,
  visibleFrom,
} from '../map/map.js';
import type { Rng } from '../rng.js';
import {
  applyWeeklyGrowth,
  build as buildInTown,
  dailyIncome,
  mageGuildLevel,
  moraleFromBuildings,
  payRecruit,
  type Town,
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
  Stack,
} from '../types.js';
import { addResources, EMPTY_RESOURCES } from '../types.js';
import type { BattleFoe, GameEvent, GameEventDraft } from './events.js';

export interface Player {
  readonly id: PlayerId;
  readonly faction: FactionId;
  controller: Controller;
  resources: Resources;
  /** Casillas ya exploradas, por clave "x,y". */
  fog: Set<string>;
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
  defeated: boolean;
}

/** Un objeto del mapa tal y como se vio, y cuándo. */
export interface RememberedObject {
  readonly day: number;
  readonly object: MapObject;
}

/** Producción diaria de cada tipo de mina. */
export const MINE_YIELD: Readonly<Record<ResourceKind, number>> = {
  gold: 1000,
  wood: 2,
  ore: 2,
  mercury: 1,
  sulfur: 1,
  crystal: 1,
  gems: 1,
};

/** Radio de visión de un héroe. */
export const HERO_SCOUT_RADIUS = 4;

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
 * de `visibleFrom`, así que el héroe **ya diverge** —81 casillas contra 69— e
 * igualar la forma es otra tarea. Se copia el número.
 *
 * Y esto alimenta `visibleNow`, **no `fog` ni `memory`**: un objeto pegado a tu
 * capital te da eventos y sale en `enemyHeroes`, pero no entra en `knownMap`.
 * Que el pueblo despeje también la niebla es otra decisión y otro coste.
 */
export const TOWN_SCOUT_RADIUS = 5;

export interface PendingBattle {
  readonly attackerHeroId: string;
  readonly foe: BattleFoe;
  readonly battle: BattleState;
}

export interface GameState {
  readonly seed: number;
  /** Día 1 en adelante. Los lunes son los días 1, 8, 15… */
  day: number;
  map: GameMap;
  players: Player[];
  heroes: Hero[];
  towns: Town[];
  current: PlayerId;
  pendingBattle: PendingBattle | null;
  finished: { winner: PlayerId } | null;
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

export function townsOf(state: GameState, player: PlayerId): Town[] {
  return state.towns.filter((t) => t.owner === player);
}

// ---------------------------------------------------------------- creación

export interface GameConfig {
  readonly seed: number;
  readonly map: GameMap;
  readonly players: readonly { id: PlayerId; faction: FactionId; controller: Controller }[];
  readonly heroes: readonly Hero[];
  readonly towns: readonly Town[];
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
  const players: Player[] = config.players.map((p) => ({
    id: p.id,
    faction: p.faction,
    controller: p.controller,
    resources: addResources(DEFAULT_STARTING_RESOURCES, config.startingResources ?? {}),
    fog: new Set<string>(),
    memory: new Map<string, RememberedObject>(),
    defeated: false,
  }));

  const state: GameState = {
    seed: config.seed,
    day: 1,
    map: config.map,
    players,
    heroes: config.heroes.map((h) => ({ ...h, army: [...h.army] })),
    towns: config.towns.map((t) => ({
      ...t,
      available: { ...t.available },
      buildings: [...t.buildings],
    })),
    current: config.players[0]?.id ?? 0,
    pendingBattle: null,
    finished: null,
    log: [],
  };

  // Los pueblos arrancan con la hornada de la primera semana.
  for (const town of state.towns) applyWeeklyGrowth(town);

  for (const hero of state.heroes) {
    hero.movePoints = maxMovePoints(hero);
    revealAround(state, hero);
  }

  emit(state, { kind: 'day_start', day: 1, week: 1, actor: null, at: null });
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
  const alcance = new Set(visibleFrom(state.map, hero.at, HERO_SCOUT_RADIUS));
  for (const key of alcance) player.fog.add(key);
  for (const obj of state.map.objects) {
    if (alcance.has(pointKey(obj.at))) {
      player.memory.set(obj.id, { day: state.day, object: { ...obj } });
    }
  }
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
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) player.fog.add(pointKey({ x, y }));
  }
  for (const obj of state.map.objects) {
    player.memory.set(obj.id, { day: state.day, object: { ...obj } });
  }
}

/**
 * Las casillas que un jugador está viendo AHORA MISMO: el entorno de cada uno
 * de sus héroes y el de cada uno de sus pueblos, que siempre tienen a alguien.
 *
 * Es la otra mitad de `fog`. `fog` dice «esto lo conozco»; esto dice «esto lo
 * estoy mirando», y solo de lo que se mira se puede afirmar el presente.
 */
export function visibleNow(state: GameState, playerId: PlayerId): Set<string> {
  const claves = new Set<string>();
  for (const hero of heroesOf(state, playerId)) {
    for (const key of visibleFrom(state.map, hero.at, HERO_SCOUT_RADIUS)) claves.add(key);
  }
  for (const town of townsOf(state, playerId)) {
    for (const key of visibleFrom(state.map, town.at, TOWN_SCOUT_RADIUS)) claves.add(key);
  }
  return claves;
}

/**
 * Si un jugador está mirando ahora mismo esa casilla CONCRETA.
 *
 * Es `visibleNow(state, p).has(pointKey(q))` sin construir el `Set`, y la
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
 * Poda fuera del mapa igual que `visibleFrom`, y por eso las dos formas son
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
  const sitio = draft.at;
  const seen: PlayerId[] = [];
  // Un hecho sin sitio no lo observa nadie, y no es un agujero: los cuatro que
  // no tienen casilla —el día, el turno, la derrota y el fin— van siempre.
  if (sitio !== null) {
    for (const p of state.players) {
      if (visibleNowAt(state, p.id, sitio)) seen.push(p.id);
    }
  }
  (state.log as GameEvent[]).push({ ...draft, seen });
}

// ---------------------------------------------------------------- turnos

function startTurn(state: GameState): void {
  const player = currentPlayer(state);
  emit(state, { kind: 'turn_start', actor: player.id, at: null });

  // Ingresos del día: ayuntamientos y minas.
  let income = { ...EMPTY_RESOURCES };
  for (const town of townsOf(state, player.id)) {
    income = addResources(income, { gold: dailyIncome(town) });
    town.builtToday = false;
  }
  for (const obj of state.map.objects) {
    if (obj.kind === 'mine' && obj.owner === player.id) {
      income = addResources(income, { [obj.resource]: MINE_YIELD[obj.resource] });
    }
  }
  player.resources = addResources(player.resources, income);

  for (const hero of heroesOf(state, player.id)) {
    hero.movePoints = maxMovePoints(hero);
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

function nextPlayer(state: GameState): void {
  const vivos = state.players.filter((p) => !p.defeated);
  if (vivos.length <= 1) {
    finishGame(state, vivos[0]?.id ?? state.current);
    return;
  }

  const orden = state.players.map((p) => p.id);
  const actual = orden.indexOf(state.current);
  for (let i = 1; i <= orden.length; i++) {
    const candidato = orden[(actual + i) % orden.length] as PlayerId;
    const jugador = playerById(state, candidato);
    if (jugador.defeated) continue;

    // Si damos la vuelta al orden, empieza un día nuevo.
    if (actual + i >= orden.length) advanceDay(state);
    state.current = candidato;
    startTurn(state);
    return;
  }
}

function advanceDay(state: GameState): void {
  state.day += 1;
  emit(state, { kind: 'day_start', day: state.day, week: week(state), actor: null, at: null });
  if (dayOfWeek(state) === 1) {
    for (const town of state.towns) applyWeeklyGrowth(town);
  }
}

function finishGame(state: GameState, winner: PlayerId): void {
  if (state.finished !== null) return;
  state.finished = { winner };
  emit(state, { kind: 'game_over', actor: winner, at: null });
}

/** Un jugador sin pueblos ni héroes está eliminado. */
function checkDefeat(state: GameState): void {
  for (const player of state.players) {
    if (player.defeated) continue;
    const sinHeroes = heroesOf(state, player.id).length === 0;
    const sinPueblos = townsOf(state, player.id).length === 0;
    if (sinHeroes && sinPueblos) {
      player.defeated = true;
      emit(state, { kind: 'player_defeated', actor: player.id, at: null });
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
 */
export function applyAdventureAction(
  state: GameState,
  action: AdventureAction,
  ctx: GameContext,
  quien: PlayerId,
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
  aplicar(state, action, ctx);
  syncSpellbooks(state, actor);
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

function aplicar(state: GameState, action: AdventureAction, ctx: GameContext): void {
  switch (action.type) {
    case 'end_turn':
      nextPlayer(state);
      return;

    case 'move_hero':
      moveHero(state, action.hero, action.to, ctx);
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

      // Va al héroe que esté en el pueblo; si no hay ninguno, a la guarnición.
      const hero = heroesOf(state, player.id).find((h) => pointKey(h.at) === pointKey(town.at));
      const destino: Army = hero?.army ?? town.garrison;
      const ampliado = addToArmy(destino, action.creature, action.count);
      if (ampliado === null) throw new Error('no quedan huecos en el ejército');

      player.resources = payRecruit(town, action.creature, action.count, player.resources);
      if (hero !== undefined) {
        hero.army = ampliado;
        hero.movePoints = Math.min(hero.movePoints, maxMovePoints(hero));
      } else {
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
  }
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
  if (heroesOf(state, player.id).length >= MAX_HEROES_PER_PLAYER) {
    throw new Error('ya tienes el máximo de héroes');
  }
  if (player.resources.gold < HERO_HIRE_COST) throw new Error('oro insuficiente');
  if (state.heroes.some((h) => pointKey(h.at) === pointKey(town.at))) {
    throw new Error('ya hay un héroe en el pueblo');
  }

  const id = `hero-${player.id}-${state.heroes.length}-${state.day}`;
  const hero: Hero = {
    id,
    owner: player.id,
    name: `Capitán de ${town.name}`,
    faction: town.faction,
    attack: 1,
    defense: 1,
    spellPower: 1,
    knowledge: 1,
    mana: 10,
    level: 1,
    experience: 0,
    army: [null, null, null, null, null],
    at: town.at,
    movePoints: 0,
    spells: [],
    skills: {},
  };
  hero.movePoints = maxMovePoints(hero);

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

/** Un héroe que entra en su pueblo se lleva la guarnición que le quepa. */
function takeGarrison(state: GameState, hero: Hero, town: Town): void {
  if (town.owner !== hero.owner) return;
  let army = hero.army;
  let quedan: Army = [null, null, null, null, null];
  let movidas = false;

  for (const [i, stack] of town.garrison.entries()) {
    if (stack === null || stack.count <= 0) continue;
    const ampliado = addToArmy(army, stack.creature, stack.count);
    if (ampliado === null) {
      // No cabe: se queda en el pueblo en vez de desaparecer.
      const resto = [...quedan];
      resto[i] = stack;
      quedan = resto;
      continue;
    }
    army = ampliado;
    movidas = true;
  }

  if (!movidas) return;
  hero.army = army;
  town.garrison = quedan;
  hero.movePoints = Math.min(hero.movePoints, maxMovePoints(hero));
  emit(state, {
    kind: 'garrison_taken',
    hero: hero.id,
    town: town.id,
    actor: hero.owner,
    at: town.at,
  });
}

function moveHero(state: GameState, heroId: string, to: Point, ctx: GameContext): void {
  const hero = heroById(state, heroId);
  const player = currentPlayer(state);
  if (hero.owner !== player.id) throw new Error('ese héroe no es tuyo');

  const camino = findPath(state.map, hero.at, to);
  if (camino === null) throw new Error(`no hay camino hasta (${to.x},${to.y})`);
  if (camino.length === 0) return;

  for (let i = 0; i < camino.length; i++) {
    const paso = camino[i] as (typeof camino)[number];
    const coste = paso.cost - (camino[i - 1]?.cost ?? 0);
    if (hero.movePoints < coste) {
      throw new Error('no quedan puntos de movimiento para llegar');
    }

    // Un enemigo en la casilla destino desencadena batalla y detiene la marcha.
    const enemigo = enemyAt(state, paso.at, player.id);
    if (enemigo !== null) {
      hero.movePoints -= coste;
      startBattle(state, hero, enemigo, ctx);
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
    collectAt(state, hero, paso.at);
  }
}

/** Qué hay de hostil en esa casilla, si algo. */
function enemyAt(state: GameState, at: Point, player: PlayerId): BattleFoe | null {
  const obj = objectAt(state.map, at);
  if (obj !== undefined && obj.kind === 'monster' && !obj.defeated) {
    return { kind: 'monster', objectId: obj.id };
  }

  const heroeEnemigo = state.heroes.find(
    (h) => h.owner !== player && pointKey(h.at) === pointKey(at),
  );
  if (heroeEnemigo !== undefined) return { kind: 'hero', heroId: heroeEnemigo.id };

  const pueblo = state.towns.find((t) => pointKey(t.at) === pointKey(at));
  if (pueblo !== undefined && pueblo.owner !== player) {
    const defendido = !isArmyEmpty(pueblo.garrison);
    if (defendido) return { kind: 'town', townId: pueblo.id };
  }
  return null;
}

/** Recoge lo que haya en la casilla: recursos, cofres, minas y pueblos vacíos. */
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
      case 'mine':
        if (obj.owner !== player.id) {
          // De quién era se lee ANTES de escribir el dueño nuevo: después ya no
          // hay a quién preguntárselo. Lo escribe quien captura, que es el
          // único que lo sabe sin adivinar.
          const anterior = obj.owner;
          obj.owner = player.id;
          emit(state, {
            kind: 'mine_captured',
            mine: obj.id,
            from: anterior,
            actor: player.id,
            at: obj.at,
          });
        }
        break;
      default:
        break;
    }
  }

  const pueblo = state.towns.find((t) => pointKey(t.at) === pointKey(at));
  if (pueblo !== undefined) {
    if (pueblo.owner !== player.id) captureTown(state, pueblo, player.id);
    else takeGarrison(state, hero, pueblo);
  }
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
  town.garrison = [null, null, null, null, null];
  const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === town.id);
  if (bandera === undefined || bandera.kind !== 'town') {
    throw new Error(`el castillo ${town.id} no tiene objeto en el mapa`);
  }
  bandera.owner = player;
  emit(state, {
    kind: 'town_captured',
    town: town.id,
    from: anterior,
    actor: player,
    at: town.at,
  });
  checkDefeat(state);
}

// ---------------------------------------------------------------- batallas

function battleSideForHero(state: GameState, hero: Hero): BattleSide {
  const pueblo = state.towns.find(
    (t) => t.owner === hero.owner && pointKey(t.at) === pointKey(hero.at),
  );
  return {
    army: hero.army,
    hero: {
      name: hero.name,
      attack: hero.attack,
      defense: hero.defense,
      spellPower: hero.spellPower,
      knowledge: hero.knowledge,
      mana: hero.mana,
      castThisRound: false,
      spells: hero.spells,
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
 * a partida en verde.
 */
function restoreHeroFromBattle(mapHero: Hero, battleHero: BattleHero | null, army: Army): void {
  mapHero.army = army;
  // `battleSideForHero` copia el héroe a un objeto aparte, así que lo que se
  // gastó en la batalla no ha tocado al del mapa: hay que traerlo. Sin esta
  // línea el héroe gastaba 12 lanzando y volvía con 20/20 — la magia sería
  // gratis y la recarga del gremio, un adorno.
  if (battleHero !== null) mapHero.mana = battleHero.mana;
}

function defenderSide(state: GameState, foe: BattleFoe): BattleSide {
  switch (foe.kind) {
    case 'monster': {
      const obj = state.map.objects.find((o) => o.id === foe.objectId);
      if (obj === undefined || obj.kind !== 'monster') throw new Error('monstruo no encontrado');
      return {
        army: [{ creature: obj.creature, count: obj.count }, null, null, null, null],
        hero: null,
      };
    }
    case 'hero': {
      const enemigo = heroById(state, foe.heroId);
      return battleSideForHero(state, enemigo);
    }
    case 'town': {
      const pueblo = townById(state, foe.townId);
      return {
        army: pueblo.garrison,
        hero: null,
        moraleBonus: moraleFromBuildings(pueblo),
      };
    }
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
  pending: PendingBattle,
): Readonly<Record<Side, PlayerId | null>> {
  const foe = pending.foe;
  const defender =
    foe.kind === 'monster'
      ? null
      : foe.kind === 'hero'
        ? heroById(state, foe.heroId).owner
        : townById(state, foe.townId).owner;
  return { attacker: heroById(state, pending.attackerHeroId).owner, defender };
}

/**
 * Dónde se libra una batalla pendiente: la casilla del DEFENSOR, que es a la
 * que el atacante intentó entrar.
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
function battleAt(state: GameState, pending: PendingBattle): Point {
  const foe = pending.foe;
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

/** Prepara la batalla y la deja pendiente: la juega la IA o el jugador. */
function startBattle(state: GameState, hero: Hero, foe: BattleFoe, ctx: GameContext): void {
  const battle = createBattle(battleSideForHero(state, hero), defenderSide(state, foe), ctx.rng);
  const pending = { attackerHeroId: hero.id, foe, battle };
  state.pendingBattle = pending;
  // La casilla se deriva aquí también, y no se toma del paso que abrió la
  // batalla: así el sitio que dice el `battle_started` y el que dice el
  // `battle_ended` no son dos respuestas que puedan dejar de coincidir.
  emit(state, {
    kind: 'battle_started',
    attacker: hero.id,
    foe,
    actor: hero.owner,
    at: battleAt(state, pending),
  });
}

/** Juega la batalla pendiente con la IA táctica y aplica el resultado. */
export function resolvePendingBattle(state: GameState, ctx: GameContext): BattleOutcome {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  const outcome = autoResolve(pending.battle, ctx.rng);
  settleBattle(state, ctx);
  return outcome;
}

/** Reparte las consecuencias de una batalla ya terminada. */
export function settleBattle(state: GameState, _ctx: GameContext): void {
  const pending = state.pendingBattle;
  if (pending === null) throw new Error('no hay batalla pendiente');
  if (pending.battle.finished === null) throw new Error('la batalla no ha terminado');

  const { winner } = pending.battle.finished;
  const hero = heroById(state, pending.attackerHeroId);
  // La casilla, LEÍDA AQUÍ: con los dos bandos todavía en pie. Después hay
  // héroes que salen del mapa y castillos que cambian de bandera, y preguntar
  // entonces sería preguntar por alguien que ya no está. Es el mismo patrón que
  // el `const dueño = hero.owner` de más abajo, y por eso el dato no hace falta
  // guardarlo en `PendingBattle`.
  const at = battleAt(state, pending);
  const superviviente = (side: 'attacker' | 'defender'): Army => {
    const slots: (Stack | null)[] = [null, null, null, null, null];
    for (const s of pending.battle.stacks) {
      if (s.side !== side || s.count <= 0) continue;
      slots[s.slot] = { creature: s.creature, count: s.count };
    }
    return pruneArmy(slots);
  };

  restoreHeroFromBattle(hero, pending.battle.heroes.attacker, superviviente('attacker'));
  const heroeAtacanteVivo = winner === 'attacker';

  // El cierre de la batalla se registra ANTES de sus consecuencias: capturar
  // el último pueblo del rival termina la partida, y "game_over" tiene que ser
  // el último evento del registro, no quedar sepultado bajo el de la batalla.
  emit(state, {
    kind: 'battle_ended',
    winner,
    foe: pending.foe,
    actor: hero.owner,
    at,
  });
  state.pendingBattle = null;

  if (heroeAtacanteVivo) {
    hero.experience += experienceFor(pending, state);
    applyVictory(state, hero, pending.foe, at);
  } else {
    // El atacante derrotado desaparece del mapa con su ejército. Su dueño se
    // lee ANTES del filtro: un instante después el héroe ya no está y el evento
    // que cuenta su muerte no tendría a quién atribuirse — que es justo por qué
    // el 10,9 % de la crónica era inatribuible.
    const dueño = hero.owner;
    state.heroes = state.heroes.filter((h) => h.id !== hero.id);
    emit(state, { kind: 'hero_defeated', hero: hero.id, actor: dueño, at });
    applyDefenderSurvivors(state, pending, superviviente('defender'));
  }

  checkDefeat(state);
}

function experienceFor(pending: PendingBattle, _state: GameState): number {
  // Experiencia proporcional a lo que se ha destruido.
  let exp = 0;
  for (const s of pending.battle.stacks) {
    if (s.side !== 'defender') continue;
    const info = creature(s.creature);
    exp += info.hp * info.level * 2;
  }
  return exp;
}

function applyVictory(state: GameState, hero: Hero, foe: BattleFoe, at: Point): void {
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
      // Igual que con el atacante: el dueño se lee mientras el héroe existe.
      const dueño = derrotado.owner;
      state.heroes = state.heroes.filter((h) => h.id !== derrotado.id);
      emit(state, { kind: 'hero_defeated', hero: derrotado.id, actor: dueño, at });
      break;
    }
    case 'town': {
      const pueblo = townById(state, foe.townId);
      captureTown(state, pueblo, hero.owner);
      break;
    }
  }
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
        const vivos = army.reduce((n, s) => n + (s?.count ?? 0), 0);
        monstruo.count = vivos;
        monstruo.defeated = vivos === 0;
      }
      break;
    }
    case 'hero': {
      // Lo simétrico del atacante, con la misma función. Solo se llega aquí
      // cuando el atacante cae; si el defensor pierde, desaparece del mapa y no
      // hay nada que devolverle.
      const defensor = heroById(state, foe.heroId);
      restoreHeroFromBattle(defensor, pending.battle.heroes.defender, army);
      break;
    }
    case 'town': {
      const pueblo = townById(state, foe.townId);
      pueblo.garrison = army;
      break;
    }
  }
}
