/**
 * Motor de batalla táctica.
 *
 * Reglas de HoMM2 que se respetan aquí: orden de turno por velocidad con el
 * atacante ganando los empates, contraataque único por ronda, tiradores que no
 * pueden disparar con un enemigo encima, moral que da o quita turnos, suerte
 * que dobla o parte el daño, y un hechizo de héroe por ronda.
 */
import { HEROE, hasTrait, hexSize, isShooter, LIDERAZGO } from '../data.js';
import { cifrasDeCatalogo, cifrasVeteranas, nivelDeTropa } from '../hero/experiencia.js';
import { HERO_BODY } from '../hero/hero.js';
import type { Rng } from '../rng.js';
import type { CombatProfile } from '../rpg/stats.js';
import type { CreatureTrait, FactionId, Hex, Stack, UnitInfo } from '../types.js';
import { SPEED_TO_HEXES } from '../types.js';
import {
  areAdjacent,
  BOARD_WIDTH,
  hexDistance,
  hexEquals,
  hexKey,
  isInside,
  occupiedHexes,
  type Paso,
  reachable,
} from './board.js';
import { CHANCE_PER_POINT, computeDamage, herir } from './damage.js';
import {
  applyEffect,
  clampMoraleLuck,
  effectTotal,
  type StackEffect,
  tickEffects,
} from './effects.js';
import { castSpell, effectOfSpell, type Spell, spell } from './spells.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  OrigenDelStack,
  Side,
} from './types.js';
import { otroBando, SIDES } from './types.js';

export interface BattleSide {
  /**
   * Lo que sale al tablero, en orden de despliegue. Desde la tropa de
   * individuos la partida manda un stack de 1 por individuo
   * (`troopsAsStacks`); el motor sigue sabiendo jugar stacks de N.
   */
  readonly army: readonly Stack[];
  readonly hero: HeroeDelBando | null;
  /** Bonus de moral/suerte del héroe (habilidades, artefactos, edificios). */
  readonly moraleBonus?: number;
  readonly luckBonus?: number;
  /**
   * Los personajes del ejército (`Stack.member`), con su perfil y los PV con
   * los que llegan. Lo monta quien conoce `GameState.characters`
   * —`battleSideForHero`—: el motor no sabe de dónde salen, solo los juega.
   */
  readonly members?: ReadonlyMap<string, BattleMember>;
}

/**
 * El héroe de un bando, tal como entra: lo que el motor guarda en
 * `BattleState.heroes` (`mando`: su magia y su rendición) y las cifras con las
 * que pisa el tablero (`cuerpo`, de `heroUnit`). Van juntos para que no pueda
 * haber héroe sin cuerpo ni cuerpo sin héroe; el cuerpo se queda en su stack
 * y no se copia al estado, que nadie lo leería allí.
 */
export interface HeroeDelBando {
  readonly mando: BattleHero;
  readonly cuerpo: UnitInfo;
}

/** Un personaje listo para entrar al tablero. */
export interface BattleMember {
  readonly profile: CombatProfile;
  /** PV actuales: entra herido si lo está. */
  readonly hp: number;
}

/** Columnas de salida de cada bando, contando desde su borde. */
const COLUMNAS_DE_SALIDA = 3;

/** Las filas, del centro hacia fuera: el centro es lo primero que se llena. */
const DEL_CENTRO_A_FUERA: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/**
 * El hex de cabeza de cada unidad, en el orden en que llegan.
 *
 * Las tres columnas del borde: primero las grandes, una por fila del centro
 * hacia fuera, con la cabeza en la segunda columna y la cola en la del borde;
 * luego las pequeñas, columna a columna desde el borde y cada columna del
 * centro hacia fuera. Se calcula en el marco del atacante y se refleja para el
 * defensor, cuya cola queda a la derecha (`occupiedHexes`).
 *
 * `primera`, si la hay, es la pequeña que coge el primer hueco —el centro de la
 * columna del borde— aunque llegue la última: es el sitio del héroe, detrás de
 * su tropa. Se dice aquí y no reordenando la lista fuera, porque el orden de la
 * lista es también el de `stacks`, y de ese orden cuelgan los empates.
 *
 * Es la única regla, para uno o para siete. Hasta la fase 1a convivía con las
 * filas de HoMM2 para cinco o menos (`ROWS_BY_COUNT`), que se habían quedado
 * solo para no mover los tests del motor: el juego no tenía motivo, y un
 * ejército saltaba de formación abierta a compacta al pasar de cinco a seis
 * individuos.
 *
 * No comprueba si caben porque caben siempre: un bando lleva como mucho
 * `LIDERAZGO.maxPorBando` individuos, y un test de datos (`tropa.test.ts`) fija
 * que ese número de grandes —dos hexes cada una— no pasa de los 27 de un lado y
 * que no hay más grandes que filas.
 */
function despliegue(units: readonly UnitInfo[], side: Side, primera: number | null): Hex[] {
  const marco = (h: Hex): Hex =>
    side === 'attacker' ? h : { col: BOARD_WIDTH - 1 - h.col, row: h.row };

  const out: Hex[] = new Array<Hex>(units.length);
  const ocupadas = new Set<string>();
  let fila = 0;
  units.forEach((u, i) => {
    if (hexSize(u) <= 1) return;
    const row = DEL_CENTRO_A_FUERA[fila++]!;
    out[i] = { col: 1, row };
    ocupadas.add(hexKey({ col: 0, row })).add(hexKey({ col: 1, row }));
  });

  const huecos: Hex[] = [];
  for (let col = 0; col < COLUMNAS_DE_SALIDA; col++) {
    for (const row of DEL_CENTRO_A_FUERA) {
      if (!ocupadas.has(hexKey({ col, row }))) huecos.push({ col, row });
    }
  }
  let siguiente = 0;
  if (primera !== null) {
    if (hexSize(units[primera]!) > 1) {
      throw new Error(`${units[primera]!.name} va detrás de su tropa y no cabe en un solo hex`);
    }
    out[primera] = huecos[siguiente++]!;
  }
  units.forEach((u, i) => {
    if (hexSize(u) > 1 || i === primera) return;
    out[i] = huecos[siguiente++]!;
  });
  return out.map(marco);
}

/**
 * Moral del ejército por diversidad de facciones: +1 si todas las criaturas
 * son de la misma, y penalización creciente a partir de tres facciones
 * distintas. Los no-muertos son inmunes y se resuelven aparte.
 *
 * Mira las unidades YA resueltas, no el `Army`: así «un personaje no tiene
 * facción» se dice una sola vez —`faction: null` en `rpg/stats.ts`— y aquí solo
 * se lee. Quien no tiene facción ni rompe la unidad de un ejército de caballeros
 * ni la da. Un ejército SOLO de personajes no tiene ninguna facción que
 * compartir, así que no cobra el +1 —su moral sale de la voluntad de cada uno—.
 * En estrategia ese caso no existe: todo stack es una criatura con facción, y
 * un ejército vacío no pone a nadie en el tablero.
 */
export function armyMorale(units: readonly UnitInfo[]): number {
  const factions = new Set<FactionId>();
  for (const unit of units) {
    if (unit.faction !== null) factions.add(unit.faction);
  }
  if (factions.size === 0) return 0;
  if (factions.size === 1) return 1;
  if (factions.size === 2) return 0;
  return -(factions.size - 2);
}

export function createBattle(attacker: BattleSide, defender: BattleSide, _rng: Rng): BattleState {
  const stacks: BattleStack[] = [];

  for (const [side, setup] of [
    ['attacker', attacker],
    ['defender', defender],
  ] as const) {
    personajesSinRepetir(setup);
    // El héroe pisa el tablero (fase 1b) y cuenta como uno más del bando.
    const cuantos = setup.army.length + (setup.hero === null ? 0 : 1);
    // Antes de colocar a nadie. La regla es del juego (`data/liderazgo.json`) y
    // la respetan todas las puertas —reclutar, la guarnición, el plan de mapa—;
    // esto es la red, por si un camino nuevo se la salta.
    if (cuantos > LIDERAZGO.maxPorBando) {
      const bando = side === 'attacker' ? 'el atacante' : 'el defensor';
      throw new Error(
        `no caben: ${bando} trae ${cuantos} y un bando lleva como mucho ${LIDERAZGO.maxPorBando}`,
      );
    }
    // Una lista, en el orden de `stacks`: la tropa por su puesto y el héroe el
    // ÚLTIMO, con `slot = army.length`, así que pierde los empates de
    // iniciativa con los suyos y los ids de la tropa no se mueven por tenerlo.
    const entradas = setup.army.map((stack, slot) => resolveUnit(stack, slot, setup));
    if (setup.hero !== null) entradas.push(entradaDelHeroe(setup.hero, setup.army.length));
    const units = entradas.map((e) => e.unit);
    const hexes = despliegue(units, side, setup.hero === null ? null : entradas.length - 1);
    const baseMorale = armyMorale(units) + (setup.moraleBonus ?? 0);
    const luckBonus = setup.luckBonus ?? 0;

    entradas.forEach((e, i) => {
      stacks.push({
        id: e.origen.kind === 'heroe' ? `${side}-heroe` : `${side}-${e.slot}`,
        side,
        slot: e.slot,
        body: e.body,
        unit: e.unit,
        origen: e.origen,
        initialCount: e.count,
        count: e.count,
        topHp: e.topHp,
        hex: hexes[i]!,
        shotsLeft: e.unit.shots ?? 0,
        retaliated: false,
        defending: false,
        waited: false,
        acted: false,
        gotMoraleBonus: false,
        // Una regla para todos: la moral y la suerte propias —0 en una criatura
        // y en el héroe— más las del bando, recortadas una vez. Los no-muertos, a 0.
        morale: hasTrait(e.unit, 'undead') ? 0 : clampMoraleLuck(baseMorale + e.ownMorale),
        luck: clampMoraleLuck(luckBonus + e.ownLuck),
        effects: [],
        ganado: { experiencia: 0, bajas: 0, heroes: [] },
      });
    });
  }

  const state: BattleState = {
    round: 0,
    stacks,
    queue: [],
    activeId: null,
    heroes: { attacker: attacker.hero?.mando ?? null, defender: defender.hero?.mando ?? null },
    log: [],
    finished: null,
  };

  beginRound(state, _rng);
  return state;
}

/**
 * Un personaje es un individuo: no puede aparecer dos veces en el mismo ejército.
 *
 * Si lo hiciera, los dos stacks entrarían con sus PV y saldrían con PV
 * distintos, y `woundsFromBattle` escribiría los dos sobre el mismo personaje:
 * ganaría la última escritura y una herida se perdería sin que nadie lo dijera.
 * Hoy ningún camino del juego lo produce; se cierra en la puerta de la batalla,
 * que es donde ya se validan el `count` y los PV, antes de que lo produzca uno.
 */
function personajesSinRepetir(setup: BattleSide): void {
  const vistos = new Set<string>();
  for (const stack of setup.army) {
    if (stack.member === undefined) continue;
    if (vistos.has(stack.member)) {
      const nombre = setup.members?.get(stack.member)?.profile.unit.name ?? stack.member;
      throw new Error(`${nombre} aparece dos veces en el ejército`);
    }
    vistos.add(stack.member);
  }
}

/** Un stack resuelto y todavía sin colocar: lo que `createBattle` empuja. */
interface Entrada {
  readonly slot: number;
  readonly body: string;
  readonly unit: UnitInfo;
  readonly origen: OrigenDelStack;
  readonly count: number;
  readonly topHp: number;
  readonly ownMorale: number;
  readonly ownLuck: number;
}

/**
 * De dónde salen las cifras de un stack de la tropa: del catálogo, o del perfil
 * de su personaje. Con `entradaDelHeroe`, es el ÚNICO sitio que decide, y se
 * decide una vez: después todo el motor lee `BattleStack.unit` y no vuelve a
 * preguntar.
 *
 * Devuelve la moral y la suerte PROPIAS —0 y 0 en una criatura— y no las
 * finales: las del bando las suma `createBattle` para todos igual. La rama de la
 * criatura devuelve la misma referencia del catálogo, así que el volcado del
 * banco no se mueve.
 */
function resolveUnit(stack: Stack, slot: number, setup: BattleSide): Entrada {
  // La experiencia es de un individuo: un stack de N con hoja de servicios no
  // sabría de cuál de los N es, igual que un personaje no puede ser dos.
  if (stack.veterania !== undefined && stack.count !== 1) {
    throw new Error(
      `el veterano ${stack.veterania.id} es uno solo y viene en un stack de ${stack.count}`,
    );
  }
  if (stack.member === undefined) {
    // `cifrasDeCatalogo`, la misma regla que leen la IA y el agente por
    // `troopUnit`: un veterano pisa el tablero con las cifras que ellos le ven,
    // y un novato con la referencia del catálogo tal cual.
    const unit = cifrasDeCatalogo(stack.creature, stack.veterania);
    return {
      slot,
      body: stack.creature,
      unit,
      origen: {
        kind: 'catalogo',
        oro: unit.cost.gold ?? 0,
        veterania: stack.veterania ?? null,
      },
      count: stack.count,
      topHp: unit.hp,
      ownMorale: 0,
      ownLuck: 0,
    };
  }
  const id = stack.member;
  if (stack.count !== 1) {
    throw new Error(`un personaje es uno solo: "${id}" viene en un stack de ${stack.count}`);
  }
  const miembro = setup.members?.get(id);
  if (miembro === undefined) {
    throw new Error(`el personaje "${id}" está en el ejército pero no se sabe quién es`);
  }
  // Antes que los límites: `NaN <= 0` y `NaN > max` son los dos falsos, así
  // que un PV imposible pasaba por delante de las dos comprobaciones de abajo y
  // la batalla empezaba con `topHp: NaN`. Y `2.5` entraba con dos PV y medio.
  if (!Number.isSafeInteger(miembro.hp)) {
    throw new Error(
      `${miembro.profile.unit.name} llega con ${miembro.hp} PV: los PV son un número entero`,
    );
  }
  if (miembro.hp <= 0) {
    throw new Error(`${miembro.profile.unit.name} no puede entrar en batalla: tiene 0 PV`);
  }
  if (miembro.hp > miembro.profile.unit.hp) {
    throw new Error(
      `${miembro.profile.unit.name} llega con ${miembro.hp} PV y su máximo es ${miembro.profile.unit.hp}`,
    );
  }
  // Un personaje no tiene rasgos, así que tampoco la inmunidad del no-muerto:
  // entra herido si lo está, con su moral y su suerte. La veteranía se le suma
  // con la misma regla que a una criatura (`cifrasVeteranas`), y no cambia sus
  // PV: entra con los que trae.
  return {
    slot,
    body: stack.creature,
    unit: cifrasVeteranas(miembro.profile.unit, nivelDeTropa(stack.veterania)),
    origen: { kind: 'personaje', id, veterania: stack.veterania ?? null },
    count: 1,
    topHp: miembro.hp,
    ownMorale: miembro.profile.morale,
    ownLuck: miembro.profile.luck,
  };
}

/** El héroe como una entrada más: uno, sano siempre —no arrastra heridas—. */
function entradaDelHeroe(heroe: HeroeDelBando, slot: number): Entrada {
  return {
    slot,
    body: HERO_BODY,
    unit: heroe.cuerpo,
    origen: { kind: 'heroe' },
    count: 1,
    topHp: heroe.cuerpo.hp,
    ownMorale: 0,
    ownLuck: 0,
  };
}

// ---------------------------------------------------------------- consultas

export function stackById(state: BattleState, id: string): BattleStack {
  const found = state.stacks.find((s) => s.id === id);
  if (found === undefined) throw new Error(`stack desconocido: "${id}"`);
  return found;
}

export function isAlive(s: BattleStack): boolean {
  return s.count > 0;
}

/**
 * Σ `f` sobre lo que un bando tiene en pie, en el orden de `stacks`. Es la
 * suma; qué se suma —efectivos, amenaza, peso— lo decide quien la pide, y
 * cada medida sigue siendo suya.
 */
export function sumaDelBando(
  state: BattleState,
  side: Side,
  f: (s: BattleStack) => number,
): number {
  let total = 0;
  for (const s of state.stacks) {
    if (s.side === side && isAlive(s)) total += f(s);
  }
  return total;
}

export function activeStack(state: BattleState): BattleStack | null {
  return state.activeId === null ? null : stackById(state, state.activeId);
}

export function stackSpeed(s: BattleStack): number {
  const base = SPEED_TO_HEXES[s.unit.speed];
  return Math.max(1, base + effectTotal(s, 'speed'));
}

/** Todos los hexes ocupados por un stack (uno, o dos si es grande). */
export function stackHexes(s: BattleStack): Hex[] {
  return occupiedHexes(s.hex, hexSize(s.unit), s.side === 'attacker');
}

/** Hexes ocupados por alguien, excluyendo opcionalmente a un stack. */
export function blockedHexes(state: BattleState, exceptId?: string): Set<string> {
  const blocked = new Set<string>();
  for (const s of state.stacks) {
    if (!isAlive(s) || s.id === exceptId) continue;
    for (const h of stackHexes(s)) blocked.add(hexKey(h));
  }
  return blocked;
}

export function enemiesOf(state: BattleState, s: BattleStack): BattleStack[] {
  return state.stacks.filter((o) => isAlive(o) && o.side !== s.side);
}

/** ¿Hay un enemigo pegado? Un tirador así no puede disparar. */
export function isEngaged(state: BattleState, s: BattleStack): boolean {
  const own = stackHexes(s);
  return enemiesOf(state, s).some((e) =>
    stackHexes(e).some((eh) => own.some((oh) => areAdjacent(oh, eh))),
  );
}

/** ¿Puede `s` golpear a `target` desde donde está? */
export function canReachMelee(s: BattleStack, target: BattleStack): boolean {
  const own = stackHexes(s);
  return stackHexes(target).some((th) => own.some((oh) => areAdjacent(oh, th)));
}

/**
 * Hexes a los que el stack puede moverse este turno, con la casilla y los pasos
 * que cuesta llegar a cada uno, indexados por `hexKey`.
 *
 * Los pasos no son un extra: son lo que la carga necesita saber. Antes `moveTo`
 * validaba el destino con `movableHexes` y volvía a lanzar el BFS para contar
 * los hexes recorridos — dos recorridos para la misma pregunta.
 *
 * Y el `Hex` tampoco: **el BFS ya lo tenía en la mano** y lo tiraba para
 * quedarse con la clave. Reconstruirlo costaba partir la cadena por la coma y
 * convertir dos trozos a número, aquí para filtrar los que no caben y otra vez
 * en `movableHexes` para devolverlos. Se llamaba `movableCosts`, y el nombre
 * cambió a propósito con la firma: así el typecheck señala a todos los
 * llamantes en vez de dejar que alguno se quede con la versión de antes
 * creyendo que sigue valiendo.
 */
export function movableFrom(state: BattleState, s: BattleStack): Map<string, Paso> {
  const info = s.unit;
  const blocked = blockedHexes(state, s.id);
  const size = hexSize(info);
  const facingRight = s.side === 'attacker';

  const fits = (head: Hex): boolean => {
    const cells = occupiedHexes(head, size, facingRight);
    return cells.every((c) => isInside(c) && !blocked.has(hexKey(c)));
  };

  // Los voladores ignoran lo que hay en medio: solo les importa dónde aterrizan.
  const volando = hasTrait(info, 'flying');
  const dist = reachable(s.hex, stackSpeed(s), volando ? new Set() : blocked);

  const out = new Map<string, Paso>();
  for (const [key, paso] of dist) {
    if (hexEquals(paso.at, s.hex) || !fits(paso.at)) continue;
    out.set(key, paso);
  }
  return out;
}

/** Hexes a los que el stack puede moverse este turno. */
export function movableHexes(state: BattleState, s: BattleStack): Hex[] {
  return [...movableFrom(state, s).values()].map((p) => p.at);
}

// ---------------------------------------------------------------- rondas

function initiativeOrder(state: BattleState): string[] {
  return state.stacks
    .filter(isAlive)
    .slice()
    .sort((a, b) => {
      const speedDiff = stackSpeed(b) - stackSpeed(a);
      if (speedDiff !== 0) return speedDiff;
      // Empate entre bandos: mueve el atacante.
      if (a.side !== b.side) return a.side === 'attacker' ? -1 : 1;
      return a.slot - b.slot;
    })
    .map((s) => s.id);
}

/** Tope de rondas: una batalla que no converge se cierra, no se cuelga. */
export const MAX_ROUNDS = 100;

function beginRound(state: BattleState, rng: Rng): void {
  // Comprobar el final ANTES de montar la ronda: si un bando llega vacío (dos
  // héroes recién contratados sin tropas, por ejemplo), montar la cola y
  // volver a llamarse era una recursión infinita.
  checkFinished(state);
  if (state.finished !== null) {
    state.activeId = null;
    return;
  }

  if (state.round >= MAX_ROUNDS) {
    finishByExhaustion(state);
    return;
  }

  state.round += 1;
  // El rótulo de ronda va ANTES de que caduquen los efectos: así el
  // `effect_end` se lee dentro de la ronda en la que se disipa, y no colgando
  // del final de la anterior.
  state.log.push({ kind: 'round_start', round: state.round });

  for (const s of state.stacks) {
    s.acted = false;
    s.waited = false;
    s.defending = false;
    s.retaliated = false;
    s.gotMoraleBonus = false;
    // Caducar es filtrar: el stack nunca guardó el bono, así que quitarlo de
    // la lista lo devuelve solo a su valor base. No hay nada que revertir.
    for (const caducado of tickEffects(s)) {
      state.log.push({ kind: 'effect_end', stack: s.id, source: caducado.source });
    }
  }
  for (const side of SIDES) {
    const hero = state.heroes[side];
    if (hero !== null) hero.castThisRound = false;
  }
  // La iniciativa se monta DESPUÉS de caducar: una Prisa que expira ya no
  // cuenta para el orden de esta ronda.
  state.queue = initiativeOrder(state);
  if (state.queue.length === 0) {
    finishByExhaustion(state);
    return;
  }
  advance(state, rng);
}

/** Cierra una batalla que no avanza. Gana quien conserve más efectivos. */
function finishByExhaustion(state: BattleState): void {
  if (state.finished !== null) return;
  const vivos = (side: Side): number => sumaDelBando(state, side, (s) => s.count);
  const winner: Side = vivos('attacker') > vivos('defender') ? 'attacker' : 'defender';
  state.finished = { winner };
  state.activeId = null;
  state.log.push({ kind: 'finished', winner });
}

/** Pasa al siguiente stack con turno, saltando muertos y desmoralizados. */
function advance(state: BattleState, rng: Rng): void {
  if (state.finished !== null) {
    state.activeId = null;
    return;
  }

  while (state.queue.length > 0) {
    const id = state.queue.shift() as string;
    const s = stackById(state, id);
    if (!isAlive(s)) continue;

    // Moral baja: el stack se queda paralizado y pierde el turno.
    const moral = s.morale;
    if (moral < 0 && rng.chance(-moral * CHANCE_PER_POINT)) {
      s.acted = true;
      state.log.push({ kind: 'morale', stack: s.id, good: false });
      continue;
    }

    state.activeId = id;
    return;
  }

  beginRound(state, rng);
}

/** Cierra el turno del stack activo y decide si la moral le regala otro. */
function endTurn(state: BattleState, s: BattleStack, rng: Rng): void {
  checkFinished(state);
  if (state.finished !== null) {
    state.activeId = null;
    return;
  }

  const moral = s.morale;
  if (isAlive(s) && moral > 0 && !s.gotMoraleBonus && rng.chance(moral * CHANCE_PER_POINT)) {
    s.gotMoraleBonus = true;
    s.acted = false;
    state.log.push({ kind: 'morale', stack: s.id, good: true });
    state.queue.unshift(s.id);
  } else {
    s.acted = true;
  }

  advance(state, rng);
}

/**
 * Un bando pierde cuando se queda sin nadie en pie **o cuando cae su héroe**,
 * aunque le quede tropa (fase 1b): el héroe es el que manda, y sin él la tropa
 * no sigue peleando.
 */
function bandoVencido(state: BattleState, side: Side): boolean {
  let alguienVivo = false;
  for (const s of state.stacks) {
    if (s.side !== side) continue;
    if (s.origen.kind === 'heroe' && !isAlive(s)) return true;
    if (isAlive(s)) alguienVivo = true;
  }
  return !alguienVivo;
}

function checkFinished(state: BattleState): void {
  if (state.finished !== null) return;
  const attackerLost = bandoVencido(state, 'attacker');
  const defenderLost = bandoVencido(state, 'defender');
  if (!attackerLost && !defenderLost) return;

  // Sin atacante no hay conquista: el empate a cero lo gana el defensor. Y con
  // héroes en el tablero hay otro empate posible —un disparo del liche que
  // salpica a los dos comandantes a la vez—, que se resuelve igual.
  const winner: Side = attackerLost ? 'defender' : 'attacker';
  state.finished = { winner };
  state.activeId = null;
  state.log.push({ kind: 'finished', winner });
}

// ---------------------------------------------------------------- acciones

/**
 * El recorrido del tablero que el llamante YA hizo, y de qué stack es.
 *
 * `stack` no es redundante: un mapa de costes de otro stack tiene las mismas
 * claves «x,y» y no hay forma de distinguirlo mirándolo. Quien lo calculó dice
 * para quién, y `applyAction` lo compara con el que está actuando.
 */
export interface Movibles {
  readonly stack: string;
  readonly costs: ReadonlyMap<string, Paso>;
}

/**
 * Aplica la acción del stack activo. Lanza si es ilegal: no la corrige.
 *
 * `movibles` es una **pista de rendimiento**: el mismo `movableFrom` que ya
 * calculó quien eligió la acción. No es un atajo que se salte la comprobación
 * —la legalidad del destino se sigue leyendo del mapa, solo que del recorrido
 * ya hecho en vez de uno nuevo—. Sin ella, `moveTo` recorre el tablero como
 * siempre: es lo que hacen el director y el cliente, que no traen recorrido.
 */
export function applyAction(
  state: BattleState,
  action: BattleAction,
  rng: Rng,
  movibles?: Movibles,
): void {
  if (state.finished !== null) throw new Error('la batalla ya ha terminado');
  const s = activeStack(state);
  if (s === null) throw new Error('no hay stack activo');
  if (movibles !== undefined && movibles.stack !== s.id) {
    throw new Error(`el recorrido que traes es de ${movibles.stack} y quien actúa es ${s.id}`);
  }

  switch (action.type) {
    case 'wait': {
      if (s.waited) throw new Error(`${s.id} ya esperó en esta ronda`);
      s.waited = true;
      state.log.push({ kind: 'wait', stack: s.id });
      state.queue.push(s.id);
      advance(state, rng);
      return;
    }

    case 'defend': {
      s.defending = true;
      state.log.push({ kind: 'defend', stack: s.id });
      endTurn(state, s, rng);
      return;
    }

    case 'move': {
      moveTo(state, s, action.to, movibles?.costs);
      endTurn(state, s, rng);
      return;
    }

    case 'attack': {
      const target = stackById(state, action.target);
      if (!isAlive(target)) throw new Error(`${target.id} ya está destruido`);
      if (target.side === s.side) throw new Error('no se puede atacar a un aliado');
      // Los hexes recorridos NO se guardan en el stack: viajan hasta el golpe
      // como argumento. Un campo `hexesMoved` habría que resetearlo en
      // `beginRound` y en `endTurn`, y el día que se olvidara uno el
      // contraatacante cargaría con los hexes de su turno anterior.
      const recorridos =
        action.from === undefined ? 0 : moveTo(state, s, action.from, movibles?.costs);
      if (!canReachMelee(s, target)) {
        throw new Error(`${s.id} no alcanza a ${target.id} cuerpo a cuerpo`);
      }
      melee(state, s, target, rng, recorridos);
      endTurn(state, s, rng);
      return;
    }

    case 'shoot': {
      const target = stackById(state, action.target);
      if (!isShooter(s.unit)) throw new Error(`${s.id} no es tirador`);
      if (s.shotsLeft <= 0) throw new Error(`${s.id} se ha quedado sin munición`);
      if (isEngaged(state, s)) throw new Error(`${s.id} tiene un enemigo encima`);
      if (!isAlive(target)) throw new Error(`${target.id} ya está destruido`);
      if (target.side === s.side) throw new Error('no se puede disparar a un aliado');
      shoot(state, s, target, rng);
      endTurn(state, s, rng);
      return;
    }

    case 'cast': {
      castHeroSpell(state, s.side, action.spell, action.target);
      // Lanzar un hechizo no consume el turno del stack: el héroe actúa aparte.
      return;
    }

    case 'surrender': {
      const { coste, motivo } = surrenderBlocker(state, s.side);
      if (motivo !== null) throw new Error(`no se puede rendir: ${motivo}`);
      if (action.gold !== undefined && action.gold !== coste) {
        throw new Error(`no se puede rendir por ${action.gold} de oro: ahora cuesta ${coste}`);
      }
      // El precio, UNA vez: se escribe en `finished` y de ahí lo lee quien lo
      // cobra (`settleBattle`). Calcularlo otra vez al cobrar daría la misma
      // cifra hoy, y el día que algo cambie en medio, dos.
      const winner = otroBando(s.side);
      state.log.push({ kind: 'surrender', side: s.side });
      state.finished = { winner, surrender: { gold: coste } };
      state.activeId = null;
      state.log.push({ kind: 'finished', winner });
      return;
    }
  }
}

/**
 * Lo que cuesta rendirse: un porcentaje del oro de catálogo de la tropa viva
 * que se salva, redondeado hacia arriba. El héroe no cuenta —no es tropa—, ni
 * un personaje, que no tiene precio de catálogo.
 *
 * Proporcional a lo que se salva, como en HoMM: rendirse con el ejército entero
 * cuesta, rendirse con dos campesinos casi nada. El porcentaje es provisional
 * y está en `data/heroe.json`, declarado inventado (decisión del usuario: 50 %).
 */
function surrenderCost(state: BattleState, side: Side): number {
  const oro = sumaDelBando(state, side, oroDeCatalogo);
  return Math.ceil((oro * HEROE.rendicion.porcentajeDelOro) / 100);
}

/**
 * El oro de catálogo de un stack: lo que vale para la rendición. Un `switch`
 * que devuelve, y no uno que suma: así un origen nuevo no compila hasta que
 * alguien decida cuánto vale, en vez de valer 0 en silencio.
 */
function oroDeCatalogo(s: BattleStack): number {
  switch (s.origen.kind) {
    case 'catalogo':
      // El precio viaja en el origen: `unit` ya no es siempre la referencia
      // del catálogo —la de un veterano es una copia con sus cifras—, y volver
      // a `creature(body)` es lo que prohíbe `test/invariantes.test.ts`. Un
      // veterano cuesta lo mismo que un novato: rendirse paga la tropa, no su
      // historia.
      return s.origen.oro * s.count;
    case 'personaje':
    case 'heroe':
      return 0;
  }
}

/**
 * Lo que costaría rendirse y, si no se puede, por qué (`motivo`; `null` si se
 * puede). Las dos cosas en una llamada porque las piden juntas los tres que la
 * leen —`applyAction` al rechazar, `legalActions` al ofrecer y la pantalla para
 * rotular el botón—, y el motivo «cuesta N» ya necesita el precio. Como
 * `castBlocker`, la frase la escribe el núcleo.
 */
export function surrenderBlocker(
  state: BattleState,
  side: Side,
): { readonly coste: number; readonly motivo: string | null } {
  const coste = surrenderCost(state, side);
  return { coste, motivo: motivoParaNoRendirse(state, side, coste) };
}

function motivoParaNoRendirse(state: BattleState, side: Side, coste: number): string | null {
  if (state.finished !== null) return 'la batalla ya ha terminado';
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  if ('blocked' in hero.retreat) return hero.retreat.blocked;
  if (coste > hero.retreat.purse) return `cuesta ${coste} de oro y tienes ${hero.retreat.purse}`;
  return null;
}

/** Mueve el stack y devuelve cuántos hexes ha recorrido de verdad. */
function moveTo(
  state: BattleState,
  s: BattleStack,
  to: Hex,
  costes?: ReadonlyMap<string, Paso>,
): number {
  // El coste real del camino, no la distancia en línea recta: rodear a un
  // enemigo cuesta más hexes y la carga tiene que notarlo. Sale del mismo
  // recorrido que decide si el destino es legal, así que no hay una segunda
  // cuenta que pueda discrepar de la primera — y si el llamante ya lo hizo, es
  // literalmente ese, no uno equivalente.
  const paso = (costes ?? movableFrom(state, s)).get(hexKey(to));
  if (paso === undefined) {
    throw new Error(`${s.id} no puede moverse a (${to.col},${to.row})`);
  }

  s.hex = to;
  state.log.push({ kind: 'move', stack: s.id, to });
  return paso.steps;
}

/**
 * ¿Rebota este efecto contra el objetivo?
 *
 * Los no-muertos no tienen ánimo que quebrar: son inmunes a la mala suerte
 * venga de donde venga — Maldición del héroe o el golpe de una momia. Vive
 * aquí y no en `effects.ts` porque es una regla del juego que mira los rasgos
 * de la criatura, no aritmética de una lista. La consultan `applyStackEffect`
 * —para el efecto que deja un golpe— y `targetBlocker` —para que ni se ofrezca
 * ni se acepte un hechizo que va a rebotar.
 */
function isImmuneTo(stack: BattleStack, effect: StackEffect): boolean {
  const info = stack.unit;
  return effect.kind === 'luck' && effect.amount < 0 && hasTrait(info, 'undead');
}

/**
 * Cuelga un efecto del stack y lo cuenta en el registro.
 * Si el objetivo es inmune no se acumula nada y se anota el rebote: sin esto
 * una momia dejaría tres maldiciones sobre un esqueleto que no las siente.
 */
function applyStackEffect(state: BattleState, target: BattleStack, effect: StackEffect): void {
  if (isImmuneTo(target, effect)) {
    state.log.push({ kind: 'immune', stack: target.id, source: effect.source });
    return;
  }
  // Lo que se anota es el efecto YA colgado, no el que se pidió: si refrescó a
  // uno del mismo origen, las rondas que se leen en el parte son las que de
  // verdad le quedan.
  const vivo = applyEffect(target, effect);
  state.log.push({
    kind: 'effect',
    stack: target.id,
    effect: vivo.kind,
    amount: vivo.amount,
    source: vivo.source,
    rounds: vivo.roundsLeft,
  });
}

function melee(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  hexesMoved: number,
): void {
  const info = attacker.unit;
  const hits = hasTrait(info, 'double_attack') ? 2 : 1;

  for (let i = 0; i < hits && isAlive(target); i++) {
    strike(state, attacker, target, rng, false, hexesMoved);
  }

  // Contraataque: uno por ronda, y solo si el atacante lo permite.
  if (
    isAlive(target) &&
    isAlive(attacker) &&
    !target.retaliated &&
    !hasTrait(info, 'no_retaliation') &&
    canReachMelee(target, attacker)
  ) {
    // El contraataque no carga: se devuelve el golpe desde donde se está.
    target.retaliated = true;
    strike(state, target, attacker, rng, true, 0);
  }
}

/** El dragón óseo: ataque −2 durante 2 rondas. Ver la nota de la tabla. */
const FEAR_ATTACK_PENALTY = -2;
const FEAR_ROUNDS = 2;
/** La momia deja maldición al golpear: suerte −1 durante 3 rondas. */
const CURSE_ON_HIT_LUCK = -1;
const CURSE_ON_HIT_ROUNDS = 3;

/**
 * Lo que un golpe deja pegado al objetivo, según el rasgo de quien pega. El
 * quinto rasgo de este tipo es una fila más, no otro bloque igual al de al
 * lado.
 *
 * Está aquí y no en `effects.ts` a propósito: el libro mayor de efectos no
 * tiene por qué saber que existen un dragón y una momia. Y se puede compartir
 * entre golpes porque `applyEffect` guarda una copia; si guardara este objeto,
 * `tickEffects` le iría bajando el `roundsLeft` hasta que el miedo no durase
 * nada.
 */
const ON_HIT_EFFECTS: readonly { trait: CreatureTrait; effect: StackEffect }[] = [
  // DIVERGENCIA DELIBERADA de fheroes2, decidida por el usuario: allí `fear` es
  // un aura de moral −1. Aquí no serviría de nada, porque `createBattle` fuerza
  // `morale: 0` a los no-muertos y el nigromante entero lo es: en un espejo
  // nigromante el rasgo quedaría medio muerto, que es justo el bug que se está
  // cerrando. Muerde por el ataque, que sí pasa por `effectiveAttack` y sí
  // siente un esqueleto.
  {
    trait: 'fear',
    effect: {
      kind: 'attack',
      amount: FEAR_ATTACK_PENALTY,
      roundsLeft: FEAR_ROUNDS,
      source: 'fear',
    },
  },
  {
    trait: 'curse_on_hit',
    effect: {
      kind: 'luck',
      amount: CURSE_ON_HIT_LUCK,
      roundsLeft: CURSE_ON_HIT_ROUNDS,
      source: 'curse_on_hit',
    },
  },
];

function strike(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  retaliation: boolean,
  hexesMoved: number,
): void {
  const info = attacker.unit;
  const result = computeDamage(attacker, target, rng, { chargeHexes: hexesMoved });
  const killed = herir(target, result.damage, attacker);

  if (result.lucky) state.log.push({ kind: 'luck', stack: attacker.id, good: true });
  if (result.unlucky) state.log.push({ kind: 'luck', stack: attacker.id, good: false });

  state.log.push({
    kind: 'attack',
    stack: attacker.id,
    target: target.id,
    damage: result.damage,
    killed,
    retaliation,
    // La carga la dice `computeDamage`, que es quien la cobró: preguntarlo otra
    // vez aquí dejaba el parte contando 7 hexes mientras el bono se había
    // topado en los 5 que caben en +50 %.
    ...(result.charge > 0 ? { charge: result.charge } : {}),
  });

  // Los vampiros señores recuperan efectivos con lo que drenan.
  if (hasTrait(info, 'life_drain') && !retaliation) {
    healFromDrain(attacker, result.damage);
  }

  // Lo que el golpe deja pegado. Va ANTES del contraataque a propósito: al
  // dragón óseo le devuelven el golpe ya asustados, que es donde se nota.
  // Un contraataque no asusta ni maldice: solo el que ataca de verdad.
  if (!retaliation && isAlive(target)) {
    for (const { trait, effect } of ON_HIT_EFFECTS) {
      if (hasTrait(info, trait)) applyStackEffect(state, target, effect);
    }
  }

  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
}

function healFromDrain(s: BattleStack, damage: number): void {
  const info = s.unit;
  const maxHp = info.hp;
  const currentTotal = (s.count - 1) * maxHp + s.topHp;
  const healed = Math.min(currentTotal + damage, maxHp * s.count);
  s.topHp = healed - (s.count - 1) * maxHp;
}

function shoot(state: BattleState, shooter: BattleStack, target: BattleStack, rng: Rng): void {
  const info = shooter.unit;
  shooter.shotsLeft -= 1;
  const shots = hasTrait(info, 'double_shot') ? 2 : 1;

  for (let i = 0; i < shots && isAlive(target); i++) {
    const distance = Math.min(
      ...stackHexes(shooter).flatMap((sh) => stackHexes(target).map((th) => hexDistance(sh, th))),
    );
    const result = computeDamage(shooter, target, rng, { ranged: true, distance });
    const killed = herir(target, result.damage, shooter);

    if (result.lucky) state.log.push({ kind: 'luck', stack: shooter.id, good: true });
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: target.id,
      damage: result.damage,
      killed,
    });
    if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });

    if (hasTrait(info, 'splash_shot')) splash(state, shooter, target, result.damage);
  }
}

/**
 * A quién alcanza la salpicadura de un disparo sobre `target`: todo lo vivo
 * pegado a él, **de cualquier bando**, como en el original.
 *
 * Está exportada porque la IA necesita la MISMA respuesta para no dispararse a
 * los suyos (`tactics.ts`). Cuando la deducía por su cuenta, el día que
 * cambiara el radio la IA habría seguido jugando con la forma vieja sin que
 * nadie se enterase.
 */
export function splashTargets(state: BattleState, target: BattleStack): BattleStack[] {
  // "Pegado al objetivo" y "alcanza al objetivo cuerpo a cuerpo" son la misma
  // pregunta, así que se hace con la misma función.
  return state.stacks.filter(
    (otro) => otro.id !== target.id && isAlive(otro) && canReachMelee(otro, target),
  );
}

/**
 * La salpicadura del liche. Se reparte el daño YA calculado, sin volver a
 * tirar: una tirada por disparo mantiene los tests legibles y la semilla
 * estable.
 *
 * El tirador nunca se salpica a sí mismo: para estar pegado a su objetivo
 * tendría un enemigo encima, y con un enemigo encima `isEngaged` no le deja
 * disparar.
 */
function splash(
  state: BattleState,
  shooter: BattleStack,
  target: BattleStack,
  damage: number,
): void {
  for (const otro of splashTargets(state, target)) {
    const killed = herir(otro, damage, shooter);
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: otro.id,
      damage,
      killed,
      splash: true,
    });
    if (!isAlive(otro)) state.log.push({ kind: 'perished', stack: otro.id });
  }
}

/** Se escribe una vez y se lee en dos: el bloqueador y el estrechamiento. */
const SIN_HEROE = 'este bando no tiene héroe';

/**
 * Motivo por el que el héroe de `side` no puede lanzar `spellId` —sobre
 * `targetId` si se apunta a alguien—, o `null` si sí puede. Mismo patrón que
 * `buildBlocker` en `town.ts`: la frase la escribe el núcleo y la pantalla la
 * enseña tal cual, así que el panel de batalla no reimplementa ni una regla.
 *
 * Es la ÚNICA redacción de estas reglas: la consultan `castHeroSpell` al lanzar
 * y `legalActions` al ofrecer. Cuando `legalActions` las repetía a mano, la
 * promesa que `agent.ts` le hace al agente —«elegir de `legalActions` nunca
 * falla»— la sostenía una copia, y la quinta regla que entrara (un silencio, un
 * tope de nivel) se habría aplicado al lanzar y no al ofrecer.
 *
 * Sin objetivo la pregunta es «¿puede lanzarlo sobre alguien?»; con objetivo,
 * «¿sobre ese?».
 */
export function castBlocker(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId?: string,
): string | null {
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  if (hero.castThisRound) return 'el héroe ya lanzó un hechizo esta ronda';
  // El id se comprueba contra el libro ANTES de buscarlo en el catálogo: con un
  // id inventado, "no lo conoce" es más cierto y más útil que reventar.
  if (!hero.spells.includes(spellId)) return `el héroe no conoce "${spellId}"`;
  const s = spell(spellId);
  if (hero.mana < s.cost) return `maná insuficiente: cuesta ${s.cost} y quedan ${hero.mana}`;

  if (targetId !== undefined) {
    const target = state.stacks.find((t) => t.id === targetId);
    if (target === undefined) return `no hay ninguna unidad "${targetId}"`;
    return targetBlocker(hero, s, side, target);
  }
  return state.stacks.some((t) => targetBlocker(hero, s, side, t) === null)
    ? null
    : 'no hay ningún objetivo válido';
}

/** Por qué este stack no vale como objetivo de este hechizo. */
function targetBlocker(hero: BattleHero, s: Spell, side: Side, target: BattleStack): string | null {
  if (!isAlive(target)) return 'el objetivo ya está destruido';
  const wantsEnemy = s.target === 'enemy';
  if (wantsEnemy === (target.side === side)) {
    return `"${s.name}" va dirigido a ${wantsEnemy ? 'un enemigo' : 'un aliado'}`;
  }
  // La inmunidad se pregunta a la misma función que decide al aplicar el efecto,
  // no a una copia de la regla: nada de ofrecer una Maldición sobre un no-muerto
  // para que después rebote.
  const efecto = effectOfSpell(s, hero);
  if (efecto !== null && isImmuneTo(target, efecto)) {
    return `${target.unit.name} es inmune a "${s.name}"`;
  }
  return null;
}

function castHeroSpell(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId: string | undefined,
): void {
  // El nulo se comprueba aquí, y no solo dentro del bloqueador, porque el
  // estrechamiento no cruza la llamada. El motivo sigue escrito una sola vez.
  const hero = state.heroes[side];
  if (hero === null) throw new Error(`no se puede lanzar: ${SIN_HEROE}`);

  const blocker = castBlocker(state, side, spellId, targetId);
  if (blocker !== null) throw new Error(`no se puede lanzar: ${blocker}`);

  const s = spell(spellId);
  if (targetId === undefined) throw new Error(`"${s.name}" necesita un objetivo`);
  const target = stackById(state, targetId);

  hero.mana -= s.cost;
  hero.castThisRound = true;
  // El cuerpo del héroe es quien cobra la experiencia del hechizo. Está vivo
  // seguro: si cae, su bando pierde (`checkFinished`) y aquí no se llega.
  const cuerpo = state.stacks.find((x) => x.side === side && x.origen.kind === 'heroe') ?? null;
  const result = castSpell(s, hero, target, cuerpo);

  state.log.push({
    kind: 'cast',
    side,
    spell: spellId,
    target: targetId,
    damage: result.damage,
    killed: result.killed,
  });

  // El hechizo no muta el stack: devuelve el efecto y lo cuelga el motor, que
  // es quien sabe anotarlo en el registro. Aquí no puede rebotar —`castBlocker`
  // rechaza al objetivo inmune antes de cobrar el maná—, pero `applyStackEffect`
  // sigue comprobándolo porque el mismo camino lo usan los golpes con rasgo.
  if (result.effect !== undefined) applyStackEffect(state, target, result.effect);
  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
  checkFinished(state);
}

// ---------------------------------------------------------------- legalidad

/** Acciones legales del stack activo. La usan la IA y el validador del agente. */
export function legalActions(state: BattleState): BattleAction[] {
  return legalActionsAndCosts(state).actions;
}

/**
 * Lo mismo, y además el mapa de costes con el que se ha construido la lista.
 *
 * Existe porque ese coste ya se calcula aquí —es el BFS de `movableFrom`— y
 * hasta ahora se tiraba: la lista se quedaba con las claves, así que el
 * llamante que necesitara el coste tenía que recorrer el tablero otra vez. La
 * IA lo necesita para elegir desde qué casilla golpear (#50), y volver a
 * pedirlo era **el 100 % del sobrecoste de aquel cambio, pagado entero por
 * unidades sin `charge`** — las únicas que no pueden aprovecharlo, y hoy son
 * todas: 1258 de 1258 decisiones. Medido en 300 batallas: 150 ms con el
 * segundo recorrido, 128 ms sin él, que es exactamente la línea base.
 *
 * Devolver el mapa **no** relaja el contrato del que cuelga el desempate de la
 * IA: el coste se sigue **leyendo**, solo que del recorrido que ya se hizo en
 * vez de uno nuevo. Las claves del mapa son, en ese orden, los `move` de la
 * lista.
 */
export function legalActionsAndCosts(state: BattleState): {
  actions: BattleAction[];
  costs: Map<string, Paso>;
} {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return { actions: [], costs: new Map() };

  const out: BattleAction[] = [{ type: 'defend' }];
  if (!s.waited) out.push({ type: 'wait' });

  const info = s.unit;
  const enemies = enemiesOf(state, s);
  const engaged = isEngaged(state, s);

  if (isShooter(info) && s.shotsLeft > 0 && !engaged) {
    for (const e of enemies) out.push({ type: 'shoot', target: e.id });
  }

  // Un solo BFS por llamada. Estaba dentro del bucle de ataques, así que con
  // cuatro enemigos el tablero se recorría cinco veces para dar la misma
  // respuesta: 1 + E. La lista no cambia ni de contenido ni de orden porque se
  // recorre la misma secuencia, solo que sin recalcularla.
  const costs = movableFrom(state, s);
  const alcanzables = [...costs.values()].map((p) => p.at);
  for (const h of alcanzables) out.push({ type: 'move', to: h });

  // Ataques: desde donde está, o moviéndose a un hex desde el que alcance.
  // Es `canReachMelee` desplegada a mano: con individuos este doble bucle se
  // corre ~100 veces por batalla sobre decenas de casillas, y copiar el stack
  // entero por sonda para preguntar lo que solo depende de su cabeza y su
  // tamaño era la mitad de su coste. Las casillas del enemigo, una vez por él.
  const tamaño = hexSize(info);
  const miraALaDerecha = s.side === 'attacker';
  for (const e of enemies) {
    if (canReachMelee(s, e)) out.push({ type: 'attack', target: e.id });
    const suyas = stackHexes(e);
    for (const h of alcanzables) {
      const mias = occupiedHexes(h, tamaño, miraALaDerecha);
      if (suyas.some((th) => mias.some((oh) => areAdjacent(oh, th)))) {
        out.push({ type: 'attack', target: e.id, from: h });
      }
    }
  }

  // Rendirse lo ofrece la misma función que lo rechaza al aplicarlo, y con su
  // precio puesto: es la única acción que cuesta recursos fuera de la batalla.
  const rendicion = surrenderBlocker(state, s.side);
  if (rendicion.motivo === null) out.push({ type: 'surrender', gold: rendicion.coste });

  // Ni una regla de lanzamiento escrita aquí: la lista ofrece exactamente los
  // pares (hechizo, objetivo) que `castBlocker` deja pasar, que es la misma
  // función que después decide si el lanzamiento sale adelante.
  const hero = state.heroes[s.side];
  if (hero !== null) {
    for (const spellId of hero.spells) {
      if (castBlocker(state, s.side, spellId) !== null) continue;
      for (const t of state.stacks) {
        if (castBlocker(state, s.side, spellId, t.id) === null) {
          out.push({ type: 'cast', spell: spellId, target: t.id });
        }
      }
    }
  }

  return { actions: out, costs };
}
