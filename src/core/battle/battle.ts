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
import type { Army, CreatureTrait, FactionId, Hex } from '../types.js';
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
import {
  applyEffect,
  clampMoraleLuck,
  effectTotal,
  tickEffects,
  type StackEffect,
} from './effects.js';
import { castSpell, effectOfSpell, spell, type Spell } from './spells.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
} from './types.js';
import { otherSide, SIDES } from './types.js';

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
        morale: hasTrait(info, 'undead') ? 0 : clampMoraleLuck(baseMorale),
        luck: clampMoraleLuck(setup.luckBonus ?? 0),
        effects: [],
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
  return Math.max(1, base + effectTotal(s, 'speed'));
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
 * Hexes a los que el stack puede moverse este turno, con lo que cuesta llegar
 * a cada uno, indexados por `hexKey`.
 *
 * El coste no es un extra: es lo que la carga necesita saber. Antes `moveTo`
 * validaba el destino con `movableHexes` y volvía a lanzar el BFS para contar
 * los hexes recorridos — dos recorridos para la misma pregunta.
 */
export function movableCosts(state: BattleState, s: BattleStack): Map<string, number> {
  const info = creature(s.creature);
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

  const out = new Map<string, number>();
  for (const [key, coste] of dist) {
    const h = parseHexKey(key);
    if (hexEquals(h, s.hex) || !fits(h)) continue;
    out.set(key, coste);
  }
  return out;
}

/** Hexes a los que el stack puede moverse este turno. */
export function movableHexes(state: BattleState, s: BattleStack): Hex[] {
  return [...movableCosts(state, s).keys()].map(parseHexKey);
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
      // Los hexes recorridos NO se guardan en el stack: viajan hasta el golpe
      // como argumento. Un campo `hexesMoved` habría que resetearlo en
      // `beginRound` y en `endTurn`, y el día que se olvidara uno el
      // contraatacante cargaría con los hexes de su turno anterior.
      const recorridos = action.from === undefined ? 0 : moveTo(state, s, action.from);
      if (!canReachMelee(s, target)) {
        throw new Error(`${s.id} no alcanza a ${target.id} cuerpo a cuerpo`);
      }
      melee(state, s, target, rng, recorridos);
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

/** Mueve el stack y devuelve cuántos hexes ha recorrido de verdad. */
function moveTo(state: BattleState, s: BattleStack, to: Hex): number {
  // El coste real del camino, no la distancia en línea recta: rodear a un
  // enemigo cuesta más hexes y la carga tiene que notarlo. Sale del mismo
  // recorrido que decide si el destino es legal, así que no hay una segunda
  // cuenta que pueda discrepar de la primera.
  const recorridos = movableCosts(state, s).get(hexKey(to));
  if (recorridos === undefined) {
    throw new Error(`${s.id} no puede moverse a (${to.col},${to.row})`);
  }

  s.hex = to;
  state.log.push({ kind: 'move', stack: s.id, to });
  return recorridos;
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
  const info = creature(stack.creature);
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
  const info = creature(attacker.creature);
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
  const info = creature(attacker.creature);
  const result = computeDamage(
    attacker,
    state.heroes[attacker.side],
    target,
    state.heroes[target.side],
    rng,
    { chargeHexes: hexesMoved },
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
    const killed = applyDamage(otro, damage);
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
function targetBlocker(
  hero: BattleHero,
  s: Spell,
  side: Side,
  target: BattleStack,
): string | null {
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
    return `${creature(target.creature).name} es inmune a "${s.name}"`;
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
  const result = castSpell(s, hero, target);

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

  return out;
}
