/**
 * Motor de batalla táctica.
 *
 * Reglas de HoMM2 que se respetan aquí: orden de turno por velocidad con el
 * atacante ganando los empates, contraataque único por ronda, tiradores que no
 * pueden disparar con un enemigo encima, moral que da o quita turnos, suerte
 * que dobla o parte el daño, y un hechizo de héroe por ronda.
 */
import { creature, hasTrait, hexSize, isShooter } from '../data.js';
import type { Rng } from '../rng.js';
import type { Army, FactionId, Hex } from '../types.js';
import { SPEED_TO_HEXES } from '../types.js';
import {
  areAdjacent,
  hexDistance,
  hexEquals,
  hexKey,
  isInside,
  occupiedHexes,
  reachable,
} from './board.js';
import { applyDamage, computeDamage, CHANCE_PER_POINT } from './damage.js';
import { castSpell, spell } from './spells.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
} from './types.js';
import { otherSide } from './types.js';

export interface BattleSide {
  readonly army: Army;
  readonly hero: BattleHero | null;
  /** Bonus de moral/suerte del héroe (habilidades, artefactos, edificios). */
  readonly moraleBonus?: number;
  readonly luckBonus?: number;
}

/** Filas de salida según cuántos stacks trae el ejército. */
const ROWS_BY_COUNT: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [1, 3, 5, 7],
  5: [0, 2, 4, 6, 8],
};

/**
 * Moral del ejército por diversidad de facciones: +1 si todas las criaturas
 * son de la misma, y penalización creciente a partir de tres facciones
 * distintas. Los no-muertos son inmunes y se resuelven aparte.
 */
export function armyMorale(army: Army): number {
  const factions = new Set<FactionId>();
  for (const stack of army) {
    if (stack === null) continue;
    factions.add(creature(stack.creature).faction);
  }
  if (factions.size <= 1) return 1;
  if (factions.size === 2) return 0;
  return -(factions.size - 2);
}

export function createBattle(
  attacker: BattleSide,
  defender: BattleSide,
  _rng: Rng,
): BattleState {
  const stacks: BattleStack[] = [];

  for (const [side, setup] of [
    ['attacker', attacker],
    ['defender', defender],
  ] as const) {
    const filled = setup.army
      .map((stack, slot) => ({ stack, slot }))
      .filter((s): s is { stack: NonNullable<(typeof s)['stack']>; slot: number } => s.stack !== null);

    const rows = ROWS_BY_COUNT[filled.length] ?? ROWS_BY_COUNT[5]!;
    const baseMorale = armyMorale(setup.army) + (setup.moraleBonus ?? 0);

    filled.forEach(({ stack, slot }, index) => {
      const info = creature(stack.creature);
      const big = hexSize(info) > 1;
      // Las unidades grandes arrancan una columna hacia dentro: su cola ocupa
      // la columna del borde y se saldría del tablero.
      const col = side === 'attacker' ? (big ? 1 : 0) : big ? 9 : 10;
      const row = rows[index] ?? 4;

      stacks.push({
        id: `${side}-${slot}`,
        side,
        slot,
        creature: stack.creature,
        count: stack.count,
        topHp: info.hp,
        hex: { col, row },
        shotsLeft: info.shots ?? 0,
        retaliated: false,
        defending: false,
        waited: false,
        acted: false,
        gotMoraleBonus: false,
        morale: hasTrait(info, 'undead') ? 0 : Math.max(-3, Math.min(3, baseMorale)),
        luck: Math.max(-3, Math.min(3, setup.luckBonus ?? 0)),
        speedBonus: 0,
      });
    });
  }

  const state: BattleState = {
    round: 0,
    stacks,
    queue: [],
    activeId: null,
    heroes: { attacker: attacker.hero, defender: defender.hero },
    log: [],
    finished: null,
  };

  beginRound(state, _rng);
  return state;
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

export function activeStack(state: BattleState): BattleStack | null {
  return state.activeId === null ? null : stackById(state, state.activeId);
}

export function stackSpeed(s: BattleStack): number {
  const base = SPEED_TO_HEXES[creature(s.creature).speed];
  return Math.max(1, base + s.speedBonus);
}

/** Todos los hexes ocupados por un stack (uno, o dos si es grande). */
export function stackHexes(s: BattleStack): Hex[] {
  return occupiedHexes(s.hex, hexSize(creature(s.creature)), s.side === 'attacker');
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

export function alliesOf(state: BattleState, s: BattleStack): BattleStack[] {
  return state.stacks.filter((o) => isAlive(o) && o.side === s.side);
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

/** Hexes a los que el stack puede moverse este turno. */
export function movableHexes(state: BattleState, s: BattleStack): Hex[] {
  const blocked = blockedHexes(state, s.id);
  const size = hexSize(creature(s.creature));
  const facingRight = s.side === 'attacker';
  const speed = stackSpeed(s);

  const fits = (head: Hex): boolean => {
    const cells = occupiedHexes(head, size, facingRight);
    return cells.every((c) => isInside(c) && !blocked.has(hexKey(c)));
  };

  // Los voladores ignoran lo que hay en medio: solo les importa dónde aterrizan.
  if (hasTrait(creature(s.creature), 'flying')) {
    const dist = reachable(s.hex, speed, new Set());
    return [...dist.keys()]
      .map(parseHexKey)
      .filter((h) => !hexEquals(h, s.hex) && fits(h));
  }

  const dist = reachable(s.hex, speed, blocked);
  return [...dist.keys()]
    .map(parseHexKey)
    .filter((h) => !hexEquals(h, s.hex) && fits(h));
}

function parseHexKey(key: string): Hex {
  const [col, row] = key.split(',').map(Number);
  return { col: col as number, row: row as number };
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
  for (const s of state.stacks) {
    s.acted = false;
    s.waited = false;
    s.defending = false;
    s.retaliated = false;
    s.gotMoraleBonus = false;
  }
  for (const side of ['attacker', 'defender'] as const) {
    const hero = state.heroes[side];
    if (hero !== null) hero.castThisRound = false;
  }
  state.queue = initiativeOrder(state);
  if (state.queue.length === 0) {
    finishByExhaustion(state);
    return;
  }
  state.log.push({ kind: 'round_start', round: state.round });
  advance(state, rng);
}

/** Cierra una batalla que no avanza. Gana quien conserve más efectivos. */
function finishByExhaustion(state: BattleState): void {
  if (state.finished !== null) return;
  const vivos = (side: Side): number =>
    state.stacks.filter((s) => s.side === side && isAlive(s)).reduce((n, s) => n + s.count, 0);
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
    if (s.morale < 0 && rng.chance(Math.min(-s.morale, 3) * CHANCE_PER_POINT)) {
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

  if (
    isAlive(s) &&
    s.morale > 0 &&
    !s.gotMoraleBonus &&
    rng.chance(Math.min(s.morale, 3) * CHANCE_PER_POINT)
  ) {
    s.gotMoraleBonus = true;
    s.acted = false;
    state.log.push({ kind: 'morale', stack: s.id, good: true });
    state.queue.unshift(s.id);
  } else {
    s.acted = true;
  }

  advance(state, rng);
}

function checkFinished(state: BattleState): void {
  if (state.finished !== null) return;
  const attackerAlive = state.stacks.some((s) => s.side === 'attacker' && isAlive(s));
  const defenderAlive = state.stacks.some((s) => s.side === 'defender' && isAlive(s));
  if (attackerAlive && defenderAlive) return;

  // Sin atacante no hay conquista: el empate a cero lo gana el defensor.
  const winner: Side = attackerAlive ? 'attacker' : 'defender';
  state.finished = { winner };
  state.activeId = null;
  state.log.push({ kind: 'finished', winner });
}

// ---------------------------------------------------------------- acciones

/** Aplica la acción del stack activo. Lanza si es ilegal: no la corrige. */
export function applyAction(state: BattleState, action: BattleAction, rng: Rng): void {
  if (state.finished !== null) throw new Error('la batalla ya ha terminado');
  const s = activeStack(state);
  if (s === null) throw new Error('no hay stack activo');

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
      moveTo(state, s, action.to);
      endTurn(state, s, rng);
      return;
    }

    case 'attack': {
      const target = stackById(state, action.target);
      if (!isAlive(target)) throw new Error(`${target.id} ya está destruido`);
      if (target.side === s.side) throw new Error('no se puede atacar a un aliado');
      if (action.from !== undefined) moveTo(state, s, action.from);
      if (!canReachMelee(s, target)) {
        throw new Error(`${s.id} no alcanza a ${target.id} cuerpo a cuerpo`);
      }
      melee(state, s, target, rng);
      endTurn(state, s, rng);
      return;
    }

    case 'shoot': {
      const target = stackById(state, action.target);
      if (!isShooter(creature(s.creature))) throw new Error(`${s.id} no es tirador`);
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
  }
}

function moveTo(state: BattleState, s: BattleStack, to: Hex): void {
  const legal = movableHexes(state, s);
  if (!legal.some((h) => hexEquals(h, to))) {
    throw new Error(`${s.id} no puede moverse a (${to.col},${to.row})`);
  }
  s.hex = to;
  state.log.push({ kind: 'move', stack: s.id, to });
}

function melee(state: BattleState, attacker: BattleStack, target: BattleStack, rng: Rng): void {
  const info = creature(attacker.creature);
  const hits = hasTrait(info, 'double_attack') ? 2 : 1;

  for (let i = 0; i < hits && isAlive(target); i++) {
    strike(state, attacker, target, rng, false);
  }

  // Contraataque: uno por ronda, y solo si el atacante lo permite.
  if (
    isAlive(target) &&
    isAlive(attacker) &&
    !target.retaliated &&
    !hasTrait(info, 'no_retaliation') &&
    canReachMelee(target, attacker)
  ) {
    target.retaliated = true;
    strike(state, target, attacker, rng, true);
  }
}

function strike(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  retaliation: boolean,
): void {
  const result = computeDamage(
    attacker,
    state.heroes[attacker.side],
    target,
    state.heroes[target.side],
    rng,
  );
  const killed = applyDamage(target, result.damage);

  if (result.lucky) state.log.push({ kind: 'luck', stack: attacker.id, good: true });
  if (result.unlucky) state.log.push({ kind: 'luck', stack: attacker.id, good: false });

  state.log.push({
    kind: 'attack',
    stack: attacker.id,
    target: target.id,
    damage: result.damage,
    killed,
    retaliation,
  });

  // Los vampiros señores recuperan efectivos con lo que drenan.
  if (hasTrait(creature(attacker.creature), 'life_drain') && !retaliation) {
    healFromDrain(attacker, result.damage);
  }

  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
}

function healFromDrain(s: BattleStack, damage: number): void {
  const info = creature(s.creature);
  const maxHp = info.hp;
  const currentTotal = (s.count - 1) * maxHp + s.topHp;
  const healed = Math.min(currentTotal + damage, maxHp * s.count);
  s.topHp = healed - (s.count - 1) * maxHp;
}

function shoot(state: BattleState, shooter: BattleStack, target: BattleStack, rng: Rng): void {
  const info = creature(shooter.creature);
  shooter.shotsLeft -= 1;
  const shots = hasTrait(info, 'double_shot') ? 2 : 1;

  for (let i = 0; i < shots && isAlive(target); i++) {
    const distance = Math.min(
      ...stackHexes(shooter).flatMap((sh) =>
        stackHexes(target).map((th) => hexDistance(sh, th)),
      ),
    );
    const result = computeDamage(
      shooter,
      state.heroes[shooter.side],
      target,
      state.heroes[target.side],
      rng,
      { ranged: true, distance },
    );
    const killed = applyDamage(target, result.damage);

    if (result.lucky) state.log.push({ kind: 'luck', stack: shooter.id, good: true });
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: target.id,
      damage: result.damage,
      killed,
    });
    if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
  }
}

function castHeroSpell(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId: string | undefined,
): void {
  const hero = state.heroes[side];
  if (hero === null) throw new Error(`el bando ${side} no tiene héroe`);
  if (hero.castThisRound) throw new Error('el héroe ya lanzó un hechizo esta ronda');
  if (!hero.spells.includes(spellId)) throw new Error(`el héroe no conoce "${spellId}"`);

  const s = spell(spellId);
  if (hero.mana < s.cost) throw new Error('maná insuficiente');
  if (targetId === undefined) throw new Error(`"${spellId}" necesita un objetivo`);

  const target = stackById(state, targetId);
  if (!isAlive(target)) throw new Error('el objetivo ya está destruido');
  const wantsEnemy = s.target === 'enemy';
  if (wantsEnemy === (target.side === side)) {
    throw new Error(`"${spellId}" va dirigido a ${wantsEnemy ? 'un enemigo' : 'un aliado'}`);
  }

  hero.mana -= s.cost;
  hero.castThisRound = true;
  const result = castSpell(s, hero, target);

  state.log.push({
    kind: 'cast',
    side,
    spell: spellId,
    target: targetId,
    damage: result.damage,
    killed: result.killed,
  });
  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
  checkFinished(state);
}

// ---------------------------------------------------------------- legalidad

/** Acciones legales del stack activo. La usan la IA y el validador del agente. */
export function legalActions(state: BattleState): BattleAction[] {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return [];

  const out: BattleAction[] = [{ type: 'defend' }];
  if (!s.waited) out.push({ type: 'wait' });

  const info = creature(s.creature);
  const enemies = enemiesOf(state, s);
  const engaged = isEngaged(state, s);

  if (isShooter(info) && s.shotsLeft > 0 && !engaged) {
    for (const e of enemies) out.push({ type: 'shoot', target: e.id });
  }

  for (const h of movableHexes(state, s)) out.push({ type: 'move', to: h });

  // Ataques: desde donde está, o moviéndose a un hex desde el que alcance.
  for (const e of enemies) {
    if (canReachMelee(s, e)) out.push({ type: 'attack', target: e.id });
    for (const h of movableHexes(state, s)) {
      const probe: BattleStack = { ...s, hex: h };
      if (canReachMelee(probe, e)) out.push({ type: 'attack', target: e.id, from: h });
    }
  }

  const hero = state.heroes[s.side];
  if (hero !== null && !hero.castThisRound) {
    for (const spellId of hero.spells) {
      const sp = spell(spellId);
      if (hero.mana < sp.cost) continue;
      const targets = sp.target === 'enemy' ? enemies : alliesOf(state, s);
      for (const t of targets) out.push({ type: 'cast', spell: spellId, target: t.id });
    }
  }

  return out;
}
