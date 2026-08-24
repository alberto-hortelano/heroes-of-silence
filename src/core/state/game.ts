/**
 * Estado de partida y bucle de turnos del mapa de aventura.
 *
 * Un turno de jugador es: mover héroes, construir en los pueblos, reclutar, y
 * pasar. Cuando todos han pasado, avanza el día; los lunes crecen las moradas.
 */
import { autoResolve, type BattleOutcome } from '../ai/tactics.js';
import { createBattle, type BattleSide } from '../battle/battle.js';
import type { BattleHero, BattleState, Side } from '../battle/types.js';
import { SIDES } from '../battle/types.js';
import { creature } from '../data.js';
import {
  addToArmy,
  isArmyEmpty,
  learnable,
  luckBonus,
  maxMana,
  maxMovePoints,
  moraleBonus,
  pruneArmy,
  type Hero,
} from '../hero/hero.js';
import { findPath, objectAt, pointKey, visibleFrom, type GameMap, type MapObject } from '../map/map.js';
import type { Rng } from '../rng.js';
import {
  applyWeeklyGrowth,
  build as buildInTown,
  dailyIncome,
  mageGuildLevel,
  moraleFromBuildings,
  payRecruit,
  townSpells,
  type Town,
} from '../town/town.js';
import type { Army, Controller, FactionId, PlayerId, Point, ResourceKind, Resources, Stack } from '../types.js';
import { addResources, EMPTY_RESOURCES } from '../types.js';

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
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

export type BattleFoe =
  | { readonly kind: 'monster'; readonly objectId: string }
  | { readonly kind: 'hero'; readonly heroId: string }
  | { readonly kind: 'town'; readonly townId: string };

export interface PendingBattle {
  readonly attackerHeroId: string;
  readonly foe: BattleFoe;
  readonly battle: BattleState;
}

export type GameEvent =
  | { kind: 'day_start'; day: number; week: number }
  | { kind: 'turn_start'; player: PlayerId }
  | { kind: 'hero_moved'; hero: string; to: Point; spent: number }
  | { kind: 'resource_gained'; player: PlayerId; resource: ResourceKind; amount: number }
  | { kind: 'mine_captured'; player: PlayerId; mine: string }
  | { kind: 'town_captured'; player: PlayerId; town: string }
  | { kind: 'built'; town: string; building: string }
  | { kind: 'recruited'; town: string; creature: string; count: number }
  | { kind: 'hero_hired'; player: PlayerId; hero: string; town: string }
  | { kind: 'spells_learned'; hero: string; town: string; spells: string[] }
  | { kind: 'garrison_taken'; hero: string; town: string }
  | { kind: 'battle_started'; attacker: string; foe: BattleFoe }
  | { kind: 'battle_ended'; winner: 'attacker' | 'defender'; foe: BattleFoe }
  | { kind: 'hero_defeated'; hero: string }
  | { kind: 'player_defeated'; player: PlayerId }
  | { kind: 'game_over'; winner: PlayerId };

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
  log: GameEvent[];
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
  | { readonly type: 'recruit'; readonly town: string; readonly creature: string; readonly count: number }
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
  readonly players: readonly { id: PlayerId; name: string; faction: FactionId; controller: Controller }[];
  readonly heroes: readonly Hero[];
  readonly towns: readonly Town[];
  readonly startingResources?: Partial<Resources>;
}

export const DEFAULT_STARTING_RESOURCES: Resources = {
  wood: 10,
  ore: 10,
  mercury: 2,
  sulfur: 2,
  crystal: 2,
  gems: 2,
  gold: 7500,
};

export function createGame(config: GameConfig): GameState {
  const players: Player[] = config.players.map((p) => ({
    id: p.id,
    name: p.name,
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
    towns: config.towns.map((t) => ({ ...t, available: { ...t.available }, buildings: [...t.buildings] })),
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

  state.log.push({ kind: 'day_start', day: 1, week: 1 });
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
 * de sus héroes, más el suelo de sus pueblos, que siempre tienen a alguien.
 *
 * Es la otra mitad de `fog`. `fog` dice «esto lo conozco»; esto dice «esto lo
 * estoy mirando», y solo de lo que se mira se puede afirmar el presente.
 */
export function visibleNow(state: GameState, playerId: PlayerId): Set<string> {
  const claves = new Set<string>();
  for (const hero of heroesOf(state, playerId)) {
    for (const key of visibleFrom(state.map, hero.at, HERO_SCOUT_RADIUS)) claves.add(key);
  }
  for (const town of townsOf(state, playerId)) claves.add(pointKey(town.at));
  return claves;
}

// ---------------------------------------------------------------- turnos

function startTurn(state: GameState): void {
  const player = currentPlayer(state);
  state.log.push({ kind: 'turn_start', player: player.id });

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
    if ((actual + i) >= orden.length) advanceDay(state);
    state.current = candidato;
    startTurn(state);
    return;
  }
}

function advanceDay(state: GameState): void {
  state.day += 1;
  state.log.push({ kind: 'day_start', day: state.day, week: week(state) });
  if (dayOfWeek(state) === 1) {
    for (const town of state.towns) applyWeeklyGrowth(town);
  }
}

function finishGame(state: GameState, winner: PlayerId): void {
  if (state.finished !== null) return;
  state.finished = { winner };
  state.log.push({ kind: 'game_over', winner });
}

/** Un jugador sin pueblos ni héroes está eliminado. */
function checkDefeat(state: GameState): void {
  for (const player of state.players) {
    if (player.defeated) continue;
    const sinHeroes = heroesOf(state, player.id).length === 0;
    const sinPueblos = townsOf(state, player.id).length === 0;
    if (sinHeroes && sinPueblos) {
      player.defeated = true;
      state.log.push({ kind: 'player_defeated', player: player.id });
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
 * Quién es un jugador, con **el mismo número que ve todo lo demás**.
 *
 * Existe porque esta frase se escribía de dos maneras: `player.name` es
 * `Jugador ${id + 1}`, así que `turnBlocker` decía «ahora juega Jugador 1» del
 * jugador cuyo id es 0 — y el agente ve el id en todas partes (`owner`, `you`,
 * `player` de las consultas, la nota de fin de partida). Dos numeraciones para
 * la misma cosa es una trampa en cualquier sitio, y aquí la lee un modelo que
 * decide con ella. La facción dice más que el número y no compite con él.
 *
 * `playerById` **lanza** con su mensaje si el id no existe, en vez de degradar a
 * un `jugador 7` con pinta de dato bueno.
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
    state.log.push({ kind: 'spells_learned', hero: hero.id, town: town.id, spells: nuevos });
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
      state.log.push({ kind: 'built', town: town.id, building: action.building });
      return;
    }

    case 'recruit': {
      const town = townById(state, action.town);
      const player = currentPlayer(state);
      if (town.owner !== player.id) throw new Error('ese pueblo no es tuyo');

      // Va al héroe que esté en el pueblo; si no hay ninguno, a la guarnición.
      const hero = heroesOf(state, player.id).find(
        (h) => pointKey(h.at) === pointKey(town.at),
      );
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
      state.log.push({
        kind: 'recruited',
        town: town.id,
        creature: action.creature,
        count: action.count,
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
  state.log.push({ kind: 'hero_hired', player: player.id, hero: id, town: town.id });

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
  state.log.push({ kind: 'garrison_taken', hero: hero.id, town: town.id });
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
    state.log.push({ kind: 'hero_moved', hero: hero.id, to: paso.at, spent: coste });
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
          state.log.push({
            kind: 'resource_gained',
            player: player.id,
            resource: obj.resource,
            amount: obj.amount,
          });
        }
        break;
      case 'chest':
        if (!obj.taken) {
          obj.taken = true;
          player.resources = addResources(player.resources, { gold: obj.gold });
          state.log.push({
            kind: 'resource_gained',
            player: player.id,
            resource: 'gold',
            amount: obj.gold,
          });
        }
        break;
      case 'mine':
        if (obj.owner !== player.id) {
          obj.owner = player.id;
          state.log.push({ kind: 'mine_captured', player: player.id, mine: obj.id });
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
  town.owner = player;
  town.garrison = [null, null, null, null, null];
  const bandera = state.map.objects.find((o) => o.kind === 'town' && o.id === town.id);
  if (bandera === undefined || bandera.kind !== 'town') {
    throw new Error(`el castillo ${town.id} no tiene objeto en el mapa`);
  }
  bandera.owner = player;
  state.log.push({ kind: 'town_captured', player, town: town.id });
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
      return { army: [{ creature: obj.creature, count: obj.count }, null, null, null, null], hero: null };
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
  state.pendingBattle = { attackerHeroId: hero.id, foe, battle };
  state.log.push({ kind: 'battle_started', attacker: hero.id, foe });
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
  state.log.push({ kind: 'battle_ended', winner, foe: pending.foe });
  state.pendingBattle = null;

  if (heroeAtacanteVivo) {
    hero.experience += experienceFor(pending, state);
    applyVictory(state, hero, pending.foe);
  } else {
    // El atacante derrotado desaparece del mapa con su ejército.
    state.heroes = state.heroes.filter((h) => h.id !== hero.id);
    state.log.push({ kind: 'hero_defeated', hero: hero.id });
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

function applyVictory(state: GameState, hero: Hero, foe: BattleFoe): void {
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
      state.heroes = state.heroes.filter((h) => h.id !== derrotado.id);
      state.log.push({ kind: 'hero_defeated', hero: derrotado.id });
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
