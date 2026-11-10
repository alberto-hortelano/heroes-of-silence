/**
 * **Los hechos que lee el agente no llevan claves ni enumerados en español**
 * (10-11-2026, #292; `src/core/contract/hechos.ts`).
 *
 * El compilador obliga a que cada hecho del núcleo tenga su caso en los dos
 * traductores, pero no sabe qué es español. Eso lo sabe
 * `test/fugas-de-los-hechos.ts`, con una **lista cerrada**: toda clave que sale de `hechoAlAgente` o de
 * `hechoDeLaCronicaAlAgente`, a cualquier profundidad, ha de estar en
 * `CLAVES_DE_LOS_HECHOS`. Una clave nueva —venga de un hecho nuevo, de un campo
 * nuevo o de un `...resto` que la arrastre— se pone roja aquí, y quien la añade a
 * la lista la lee al escribirla.
 *
 * Las muestras son `satisfies Record<kind, …>`: un hecho nuevo sin muestra no
 * compila. Cada una lleva **todos** sus opcionales, que es donde se cuela una clave.
 * Lo que la muestra olvide lo cazan los hechos de verdad: aquí, el registro de una
 * batalla; para la crónica, la partida de la IA que ya juega `test/cronica.test.ts`
 * (el mismo `fugasDe`, sin jugarla otra vez).
 *
 * Visto morder (10-11-2026): con `corre` devuelto en el `move` traducido, con
 * `faltan` en vez de `remaining` en `march_cut` y con una clave de más en `aimed`,
 * que pasa tal cual (esta, también en la batalla de verdad), sale rojo diciendo el
 * hecho y la clave.
 */
import { describe, expect, it } from 'vitest';
import { autoResolve } from '../src/core/ai/tactics.js';
import { applyEffect } from '../src/core/battle/effects.js';
import { createBattle } from '../src/core/battle/montaje.js';
import { type BattleEvent, EFFECT_KINDS } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { serializeBattleTurn } from '../src/core/contract/batalla.js';
import { hechoAlAgente, hechoDeLaCronicaAlAgente } from '../src/core/contract/hechos.js';
import { HIT_DE_GOLPE } from '../src/core/contract/vocabulario.js';
import { CUANDO_SALTA } from '../src/core/magia/formato.js';
import { createRng } from '../src/core/rng.js';
import type { GameEventDraft } from '../src/core/state/events.js';
import { TODOS_LOS_GOLPES } from '../src/core/types.js';
import { JINETE, NO_MUERTO, PESADA, SANADOR, TIRADOR, TIRADOR_NO_MUERTO } from './comun.js';
import { CLAVES_DE_LOS_HECHOS, fugasDe, fugasDeTodos } from './fugas-de-los-hechos.js';

const HEX = { col: 3, row: 4 };
const OTRO = { col: 4, row: 4 };
const PUERTA = { a: HEX, b: OTRO };

/** Una muestra de cada hecho de la batalla, con todos sus opcionales y una por variante. */
const DE_BATALLA = {
  round_start: [{ kind: 'round_start', round: 2 }],
  move: [{ kind: 'move', stack: 'a1', to: OTRO, path: [HEX, OTRO], charge: true, corre: true }],
  cruce: TODOS_LOS_GOLPES.map((golpe) => ({
    kind: 'cruce' as const,
    stack: 'a1',
    target: 'd1',
    golpe,
    respuesta: golpe,
    punto: 3 as const,
  })),
  attack: [
    {
      kind: 'attack',
      stack: 'a1',
      target: 'd1',
      damage: 7,
      killed: 1,
      retaliation: false,
      charge: 2,
      punto: 4,
      parado: 3,
    },
  ],
  aimed: [{ kind: 'aimed', stack: 'a1', at: HEX }],
  thrown: [{ kind: 'thrown', stack: 'a1', at: HEX }],
  blast: [
    {
      kind: 'blast',
      stack: 'a1',
      at: HEX,
      target: 'd1',
      damage: 5,
      killed: 0,
      cuarto: 4,
      parado: 2,
    },
  ],
  shoot: [
    {
      kind: 'shoot',
      stack: 'a1',
      at: HEX,
      target: 'd1',
      damage: 5,
      killed: 0,
      parado: 2,
      splash: true,
    },
  ],
  cast: [
    {
      kind: 'cast',
      side: 'attacker',
      spell: 'rayo',
      target: 'd1',
      at: HEX,
      diferido: true,
      damage: 9,
      killed: 1,
      parado: 1,
    },
  ],
  power: [
    { kind: 'power', stack: 'a1', poder: 'curar', target: 'a2', at: HEX, cura: 6, diferido: true },
  ],
  spell_hit: [
    { kind: 'spell_hit', spell: 'rayo', stack: 'd1', damage: 9, killed: 1, parado: 1, cura: 2 },
  ],
  triggered: CUANDO_SALTA.map((cuando) => ({
    kind: 'triggered' as const,
    stack: 'd1',
    spell: 'espinas',
    cuando,
  })),
  raised: [{ kind: 'raised', stack: 'a9', from: 'd1', spell: 'levantar', at: HEX }],
  retoque: [{ kind: 'retoque', nombre: 'Piquero', stacks: ['a1'], cambios: ['ataque 3 → 10'] }],
  effect: [
    ...EFFECT_KINDS.flatMap((effect) =>
      (['empezar', 'terminar'] as const).map((vence) => ({
        kind: 'effect' as const,
        stack: 'd1',
        effect,
        amount: 2,
        dicho: 'no puede moverse',
        source: 'rayo',
        rounds: 3,
        vence,
        turnoDe: 'a1',
      })),
    ),
    // Lo que cuelga la rueda del golpe: su `source` es el tipo con que se golpeó
    // (`deLaRueda`). El QA lo cazó en casi toda batalla y aquí no había ni uno (H1).
    ...TODOS_LOS_GOLPES.map((golpe) => ({
      kind: 'effect' as const,
      stack: 'd1',
      effect: 'defense' as const,
      amount: 1,
      source: golpe,
      rounds: 2,
      vence: 'empezar' as const,
    })),
  ],
  effect_end: [
    { kind: 'effect_end', stack: 'd1', source: 'rayo' },
    ...TODOS_LOS_GOLPES.map((golpe) => ({
      kind: 'effect_end' as const,
      stack: 'd1',
      source: golpe,
    })),
  ],
  perished: [{ kind: 'perished', stack: 'd1' }],
  ladder_placed: [{ kind: 'ladder_placed', stack: 'a1', pie: HEX, muro: OTRO }],
  climbed: [{ kind: 'climbed', stack: 'a1', from: HEX, to: OTRO }],
  gate_opened: [{ kind: 'gate_opened', stack: 'd1', puerta: PUERTA }],
  gate_closed: [{ kind: 'gate_closed', stack: 'd1', puerta: PUERTA }],
  surrender: [{ kind: 'surrender', side: 'defender' }],
  finished: [{ kind: 'finished', winner: 'attacker' }],
} satisfies Record<BattleEvent['kind'], readonly BattleEvent[]>;

const ORIGEN = { actor: 1, at: { x: 5, y: 6 } };
const SIN_SITIO = { actor: null, at: null };
const RIVAL_DE_LUGAR = {
  kind: 'lugar',
  lugar: 'molino',
  encuentro: 'bandidos',
  opcion: { punto: 'puerta', nodo: 'n1', opcion: 2 },
} as const;
const RESUMEN = {
  rounds: 3,
  casts: [{ side: 'attacker', spell: 'rayo', target: 'zombi', killed: 1 }],
  lost: { attacker: [{ creature: 'zombi', count: 2 }], defender: [] },
} as const;
const TROPA = [{ creature: 'zombi', count: 2 }];

/** Una muestra de cada hecho de la crónica, con todos sus opcionales y una por variante. */
const DE_LA_CRONICA = {
  day_start: [{ kind: 'day_start', ...SIN_SITIO, day: 3, week: 1 }],
  turn_start: [{ kind: 'turn_start', ...ORIGEN, at: null }],
  hero_moved: [{ kind: 'hero_moved', ...ORIGEN, hero: 'h1', to: { x: 6, y: 6 }, spent: 100 }],
  march_cut: [{ kind: 'march_cut', ...ORIGEN, hero: 'h1', faltan: 4 }],
  gold_gained: [
    { kind: 'gold_gained', ...ORIGEN, amount: 500 },
    { kind: 'gold_gained', ...ORIGEN, amount: 500, from: 'lugar', lugar: 'molino' },
  ],
  gold_paid: [{ kind: 'gold_paid', ...ORIGEN, amount: 200, lugar: 'molino' }],
  place_state: [
    {
      kind: 'place_state',
      ...ORIGEN,
      lugar: 'molino',
      nombre: 'El molino',
      estado: 'quemado',
      from: 'entero',
      dicho: 'Quemado',
    },
  ],
  world_mark: [{ kind: 'world_mark', ...ORIGEN, marca: 'molino-quemado', lugar: 'molino' }],
  item_given: [{ kind: 'item_given', ...ORIGEN, hero: 'h1', item: 'espada', lugar: 'molino' }],
  troops_joined: [
    { kind: 'troops_joined', ...ORIGEN, hero: 'h1', creature: 'zombi', count: 2, lugar: 'molino' },
  ],
  node_captured: [{ kind: 'node_captured', ...ORIGEN, node: 'n1', from: 2 }],
  town_captured: [{ kind: 'town_captured', ...ORIGEN, town: 't1', from: null }],
  town_owner_changed: [{ kind: 'town_owner_changed', ...ORIGEN, town: 't1', from: 2, to: 1 }],
  site_occupied: [
    { kind: 'site_occupied', ...ORIGEN, site: 't1', by: { kind: 'heroe', heroId: 'h2', dueño: 2 } },
    { kind: 'site_occupied', ...ORIGEN, site: 't1', by: { kind: 'guarnicion', dueño: null } },
  ],
  site_freed: [{ kind: 'site_freed', ...ORIGEN, site: 't1' }],
  built: [{ kind: 'built', ...ORIGEN, town: 't1', building: 'cuartel' }],
  recruited: [{ kind: 'recruited', ...ORIGEN, town: 't1', creature: 'zombi', count: 2 }],
  dismissed: [{ kind: 'dismissed', ...ORIGEN, hero: 'h1', creature: 'zombi', count: 1 }],
  left_behind: [
    {
      kind: 'left_behind',
      ...ORIGEN,
      hero: 'h1',
      site: null,
      creature: 'zombi',
      count: 1,
      lost: ['espada'],
    },
  ],
  hero_hired: [{ kind: 'hero_hired', ...ORIGEN, hero: 'h3', town: 't1' }],
  loot_found: [
    { kind: 'loot_found', ...ORIGEN, hero: 'h1', item: 'espada', from: 'raider' },
    { kind: 'loot_found', ...ORIGEN, hero: 'h1', item: 'espada', from: 'lugar', lugar: 'molino' },
  ],
  item_bought: [{ kind: 'item_bought', ...ORIGEN, hero: 'h1', town: 't1', item: 'espada' }],
  hero_promoted: [
    { kind: 'hero_promoted', ...ORIGEN, hero: 'h4', town: 't1', creature: 'zombi', name: 'Ana' },
  ],
  spells_learned: [{ kind: 'spells_learned', ...ORIGEN, hero: 'h1', town: 't1', spells: ['rayo'] }],
  troops_left: [
    { kind: 'troops_left', ...ORIGEN, hero: 'h1', site: 'n1', creature: 'zombi', count: 1 },
  ],
  troops_taken: [
    { kind: 'troops_taken', ...ORIGEN, hero: 'h1', site: 'n1', creature: 'zombi', count: 1 },
  ],
  troops_exchanged: [
    { kind: 'troops_exchanged', ...ORIGEN, hero: 'h1', site: 'n1', left: TROPA, taken: TROPA },
  ],
  outpost_upgraded: [
    { kind: 'outpost_upgraded', ...ORIGEN, hero: 'h1', site: 'n1', to: 'empalizada', cost: 1500 },
    { kind: 'outpost_upgraded', ...ORIGEN, hero: 'h1', site: 'n1', to: 'muralla', cost: 4000 },
  ],
  defense_set: [
    { kind: 'defense_set', ...ORIGEN, hero: 'h1', site: 'n1', fighting: 4, staying: 2 },
  ],
  battle_started: [
    {
      kind: 'battle_started',
      ...ORIGEN,
      attacker: { kind: 'hero', heroId: 'h1' },
      foe: RIVAL_DE_LUGAR,
    },
    {
      kind: 'battle_started',
      ...ORIGEN,
      attacker: { kind: 'hero', heroId: 'h1' },
      foe: { kind: 'garrison', site: 't1' },
    },
    {
      kind: 'battle_started',
      ...ORIGEN,
      attacker: { kind: 'hero', heroId: 'h1' },
      foe: { kind: 'monster', objectId: 'm1' },
    },
    {
      kind: 'battle_started',
      ...ORIGEN,
      attacker: { kind: 'raider', raiderId: 'r1' },
      foe: { kind: 'hero', heroId: 'h1' },
      faltan: 3,
    },
  ],
  battle_ended: [
    {
      kind: 'battle_ended',
      ...ORIGEN,
      winner: 'attacker',
      foe: RIVAL_DE_LUGAR,
      owners: { attacker: 1, defender: null },
      ...RESUMEN,
    },
    {
      kind: 'battle_ended',
      ...ORIGEN,
      winner: 'defender',
      foe: { kind: 'raider', raiderId: 'r1' },
      owners: { attacker: 1, defender: null },
      ...RESUMEN,
    },
  ],
  raider_spawned: [{ kind: 'raider_spawned', ...ORIGEN, actor: null, raider: 'r1', troops: TROPA }],
  raider_dispersed: [{ kind: 'raider_dispersed', ...ORIGEN, raider: 'r1' }],
  march_halted: [{ kind: 'march_halted', ...ORIGEN, hero: 'h1', raider: 'r1', troops: TROPA }],
  hero_defeated: [{ kind: 'hero_defeated', ...ORIGEN, hero: 'h1' }],
  hero_returned: [
    { kind: 'hero_returned', ...ORIGEN, hero: 'h1', town: 't1', surrendered: false },
    { kind: 'hero_returned', ...ORIGEN, hero: 'h1', town: 't1', surrendered: true, gold: 900 },
  ],
  rank_up: [{ kind: 'rank_up', ...ORIGEN, hero: 'h1', rank: 6 }],
  troop_rank_up: [
    { kind: 'troop_rank_up', ...ORIGEN, creature: 'zombi', rank: 2, veterano: 'veterano-3' },
  ],
  player_defeated: [{ kind: 'player_defeated', ...ORIGEN, at: null, reason: 'lost_base' }],
  game_over: [{ kind: 'game_over', ...SIN_SITIO }],
} satisfies Record<GameEventDraft['kind'], readonly GameEventDraft[]>;

const todosDeBatalla: readonly BattleEvent[] = Object.values(DE_BATALLA).flat();
const todosDeLaCronica: readonly GameEventDraft[] = Object.values(DE_LA_CRONICA).flat();

describe('los hechos que lee el agente', () => {
  it('la lista de claves está ordenada y sin repetir: se lee de arriba abajo', () => {
    expect([...new Set(CLAVES_DE_LOS_HECHOS)].sort()).toEqual([...CLAVES_DE_LOS_HECHOS]);
  });

  it('ningún hecho de la batalla sale con una clave fuera de la lista ni con un enumerado del núcleo', () => {
    expect(fugasDeTodos(todosDeBatalla, hechoAlAgente)).toEqual([]);
  });

  it('ningún hecho de la crónica sale con una clave fuera de la lista ni con un enumerado del núcleo', () => {
    expect(fugasDeTodos(todosDeLaCronica, hechoDeLaCronicaAlAgente)).toEqual([]);
  });

  it('el guardia muerde: los hechos del núcleo, sin traducir, llevan fugas', () => {
    // La premisa de los dos de arriba: si la lista o las muestras se quedaran
    // sin lo español, pasarían por no mirar nada.
    const deBatalla = fugasDeTodos(todosDeBatalla, (e) => e);
    for (const clave of ['corre', 'punto', 'parado', 'cuarto', 'diferido', 'poder', 'cura']) {
      expect(deBatalla.some((f) => f.includes(`«${clave}»`))).toBe(true);
    }
    expect(deBatalla).toContain('[cruce] «kind» vale «cruce», que es la palabra del núcleo');
    expect(deBatalla).toContain('[effect] «effect» vale «armadura», que es la palabra del núcleo');
    // El origen de un efecto (H1 del QA): el golpe de la rueda, en los dos hechos
    // que lo llevan; un id del catálogo, aunque sea una palabra del núcleo, no.
    expect(deBatalla).toContain(
      '[effect] «source» vale «romperGuardia», que es la palabra del núcleo',
    );
    expect(deBatalla).toContain(
      '[effect_end] «source» vale «defensivo», que es la palabra del núcleo',
    );
    expect(deBatalla.some((f) => f.includes('«source» vale «rayo»'))).toBe(false);
    expect(fugasDe({ kind: 'effect_end', stack: 'd1', source: 'armadura' })).toEqual([]);
    const deLaCronica = fugasDeTodos(todosDeLaCronica, (e) => e);
    for (const clave of ['faltan', 'lugar', 'marca', 'estado', 'dicho', 'veterano', 'by.dueño']) {
      expect(deLaCronica.some((f) => f.includes(`«${clave}»`))).toBe(true);
    }
    expect(deLaCronica).toContain(
      '[battle_started] «foe.kind» vale «lugar», que es la palabra del núcleo',
    );
    expect(deLaCronica).toContain(
      '[gold_gained] «from» vale «lugar», que es la palabra del núcleo',
    );
  });

  it('traducir no pierde campos: solo `corre`, que es del lienzo, se queda en casa', () => {
    for (const e of todosDeBatalla) {
      const antes = Object.keys(e).filter((k) => k !== 'corre').length;
      expect(Object.keys(hechoAlAgente(e)), e.kind).toHaveLength(antes);
    }
    for (const e of todosDeLaCronica) {
      expect(Object.keys(hechoDeLaCronicaAlAgente(e)), e.kind).toHaveLength(Object.keys(e).length);
    }
  });

  it('la batalla, en las palabras del contrato (la tabla del plan)', () => {
    const uno = <K extends keyof typeof DE_BATALLA>(k: K) =>
      hechoAlAgente((DE_BATALLA[k] as readonly BattleEvent[])[0] as BattleEvent);
    expect(uno('move')).toEqual({
      kind: 'move',
      stack: 'a1',
      to: OTRO,
      path: [HEX, OTRO],
      charge: true,
    });
    expect(uno('cruce')).toEqual({
      kind: 'clash',
      stack: 'a1',
      target: 'd1',
      hit: 'offensive',
      response: 'offensive',
      point: 3,
    });
    expect(uno('attack')).toMatchObject({ point: 4, blocked: 3, charge: 2 });
    expect(uno('blast')).toMatchObject({ quarter: 4, blocked: 2 });
    expect(uno('shoot')).toMatchObject({ blocked: 2, splash: true });
    expect(uno('cast')).toMatchObject({ deferred: true, blocked: 1 });
    expect(uno('power')).toEqual({
      kind: 'power',
      stack: 'a1',
      power: 'curar',
      target: 'a2',
      at: HEX,
      healed: 6,
      deferred: true,
    });
    expect(uno('spell_hit')).toMatchObject({ blocked: 1, healed: 2 });
    expect(
      DE_BATALLA.triggered.map((e) => hechoAlAgente(e)).map((e) => 'when' in e && e.when),
    ).toEqual(['turn_start', 'turn_end', 'struck', 'strikes', 'death']);
    expect(uno('retoque')).toEqual({
      kind: 'retouch',
      name: 'Piquero',
      stacks: ['a1'],
      changes: ['ataque 3 → 10'],
    });
    const efectos = DE_BATALLA.effect.map((e) => hechoAlAgente(e));
    expect(efectos[0]).toEqual({
      kind: 'effect',
      stack: 'd1',
      effect: 'speed',
      amount: 2,
      summary: 'no puede moverse',
      source: 'rayo',
      rounds: 3,
      expires: 'turn_start',
      turnOf: 'a1',
    });
    expect([...new Set(efectos.map((e) => 'effect' in e && e.effect))]).toEqual([
      'speed',
      'attack',
      'defense',
      'armor',
      'strength',
      'agility',
      'prevents',
      'ward',
      'trigger',
    ]);
    expect(efectos[1]).toMatchObject({ expires: 'turn_end' });
    expect(uno('ladder_placed')).toEqual({
      kind: 'ladder_placed',
      stack: 'a1',
      foot: HEX,
      wall: OTRO,
    });
    expect(uno('gate_opened')).toEqual({ kind: 'gate_opened', stack: 'd1', gate: PUERTA });
  });

  it('sin sus opcionales, un hecho no los lleva: ni la clave con `undefined`', () => {
    const golpe = hechoAlAgente({
      kind: 'attack',
      stack: 'a1',
      target: 'd1',
      damage: 1,
      killed: 0,
      retaliation: true,
    });
    expect(Object.keys(golpe)).toEqual([
      'kind',
      'stack',
      'target',
      'damage',
      'killed',
      'retaliation',
    ]);
    const efecto = hechoAlAgente({
      kind: 'effect',
      stack: 'd1',
      effect: 'escudo',
      amount: 0,
      source: 'rayo',
      rounds: 1,
    });
    expect(efecto).toEqual({
      kind: 'effect',
      stack: 'd1',
      effect: 'ward',
      amount: 0,
      source: 'rayo',
      rounds: 1,
    });
  });

  it('la crónica, en las palabras del contrato y de las vistas (la tabla del plan)', () => {
    const de = <K extends keyof typeof DE_LA_CRONICA>(k: K) =>
      (DE_LA_CRONICA[k] as readonly GameEventDraft[]).map(hechoDeLaCronicaAlAgente);
    expect(de('march_cut')).toEqual([{ kind: 'march_cut', ...ORIGEN, hero: 'h1', remaining: 4 }]);
    expect(de('gold_gained')).toEqual([
      { kind: 'gold_gained', ...ORIGEN, amount: 500 },
      { kind: 'gold_gained', ...ORIGEN, amount: 500, from: 'place', place: 'molino' },
    ]);
    expect(de('gold_paid')).toEqual([
      { kind: 'gold_paid', ...ORIGEN, amount: 200, place: 'molino' },
    ]);
    expect(de('place_state')).toEqual([
      {
        kind: 'place_state',
        ...ORIGEN,
        place: 'molino',
        name: 'El molino',
        state: 'quemado',
        from: 'entero',
        stateName: 'Quemado',
      },
    ]);
    expect(de('world_mark')).toEqual([
      { kind: 'world_mark', ...ORIGEN, mark: 'molino-quemado', place: 'molino' },
    ]);
    expect(de('item_given')[0]).toMatchObject({ place: 'molino' });
    expect(de('troops_joined')[0]).toMatchObject({ place: 'molino' });
    // Como `occupiedBy` de `knownMap` (`ocupanteView`): una sola forma para el hecho y la vista.
    expect(de('site_occupied').map((e) => 'by' in e && e.by)).toEqual([
      { hero: 'h2', owner: 2 },
      { garrison: null },
    ]);
    expect(de('loot_found')).toEqual([
      { kind: 'loot_found', ...ORIGEN, hero: 'h1', item: 'espada', from: 'raider' },
      { kind: 'loot_found', ...ORIGEN, hero: 'h1', item: 'espada', from: 'place', place: 'molino' },
    ]);
    // La palabra del `upgrade` del nodo (`UPGRADE_DE_MEJORA`) y de la jugada `upgrade_outpost`.
    expect(de('outpost_upgraded')).toEqual([
      {
        kind: 'outpost_upgraded',
        ...ORIGEN,
        hero: 'h1',
        site: 'n1',
        upgrade: 'palisade',
        cost: 1500,
      },
      { kind: 'outpost_upgraded', ...ORIGEN, hero: 'h1', site: 'n1', upgrade: 'wall', cost: 4000 },
    ]);
    const lugar = {
      kind: 'place',
      place: 'molino',
      encounter: 'bandidos',
      option: { point: 'puerta', node: 'n1', option: 2 },
    };
    const empezadas = de('battle_started');
    expect(empezadas[0]).toEqual({
      kind: 'battle_started',
      ...ORIGEN,
      attacker: { kind: 'hero', heroId: 'h1' },
      foe: lugar,
    });
    expect(empezadas[1]).toMatchObject({ foe: { kind: 'garrison', site: 't1' } });
    expect(empezadas[3]).toMatchObject({ foe: { kind: 'hero', heroId: 'h1' }, remaining: 3 });
    expect(de('battle_ended')[0]).toEqual({
      kind: 'battle_ended',
      ...ORIGEN,
      winner: 'attacker',
      foe: lugar,
      owners: { attacker: 1, defender: null },
      ...RESUMEN,
    });
    expect(de('troop_rank_up')).toEqual([
      { kind: 'troop_rank_up', ...ORIGEN, creature: 'zombi', rank: 2, veteran: 'veterano-3' },
    ]);
  });

  it('el origen de un efecto de la rueda llega con la palabra de `hit`, en los hechos y en la vista', () => {
    const colgado = {
      kind: 'effect',
      stack: 'd1',
      effect: 'defense',
      amount: 1,
      rounds: 2,
    } as const;
    expect(hechoAlAgente({ ...colgado, source: 'romperGuardia' })).toMatchObject({
      source: 'guard_break',
    });
    expect(hechoAlAgente({ kind: 'effect_end', stack: 'd1', source: 'defensivo' })).toEqual({
      kind: 'effect_end',
      stack: 'd1',
      source: 'defensive',
    });
    // Un id (hechizo, poder, rasgo) pasa tal cual.
    for (const source of ['rayo', 'escudo_arcano', 'fear']) {
      expect(hechoAlAgente({ ...colgado, source })).toMatchObject({ source });
    }
    // La vista: `stacks[].effects[].source`, por la misma función.
    const lado = (creature: string) => ({ army: [{ creature, count: 1 }], hero: null });
    const batalla = createBattle(lado(PESADA), lado(NO_MUERTO), createRng(7), COMBATE_COMPLETO);
    const [uno] = batalla.stacks;
    if (uno === undefined) throw new Error('la batalla no tiene stacks');
    const pegar = (source: string) =>
      applyEffect(uno, { kind: 'defense', amount: 1, source, roundsLeft: 2 });
    pegar('rapidoRomper');
    pegar('piel_de_piedra');
    const { stacks } = serializeBattleTurn(batalla, 'attacker', 'ajena', null);
    const origenes = stacks.flatMap((s) => s.effects.map((e) => e.source));
    expect(origenes).toEqual(['quick_guard_break', 'piel_de_piedra']);
    expect(fugasDe(stacks, null)).toEqual([]);
  });

  it('en una batalla de verdad, ningún hecho del registro llega al agente con fugas', () => {
    // Lo que la muestra olvide de los hechos que pasan tal cual (`return e`): un
    // opcional nuevo en español no rompería ninguna muestra. Una batalla, no una
    // partida: la IA en los dos bandos, con tirador, jinete y sanador.
    const lado = (...tipos: string[]) => ({
      army: tipos.map((creature) => ({ creature, count: 1 })),
      hero: null,
    });
    const rng = createRng(7);
    const batalla = createBattle(
      lado(PESADA, JINETE, SANADOR, TIRADOR),
      lado(NO_MUERTO, TIRADOR_NO_MUERTO, NO_MUERTO),
      rng,
      COMBATE_COMPLETO,
    );
    autoResolve(batalla, rng);
    expect(new Set(batalla.log.map((e) => e.kind)).size).toBeGreaterThanOrEqual(5);
    expect(fugasDeTodos(batalla.log, hechoAlAgente)).toEqual([]);
    // La rueda cuelga efectos en casi toda batalla cuerpo a cuerpo, y su origen
    // llega como un `hit` (H1 del QA): si aquí no hubiera ninguno, lo de arriba no
    // habría mirado un `source` de la rueda.
    const hits: readonly string[] = Object.values(HIT_DE_GOLPE);
    const deLaRueda = batalla.log
      .map(hechoAlAgente)
      .filter((e) => e.kind === 'effect' && hits.includes(e.source));
    expect(deLaRueda.length).toBeGreaterThan(0);
  });
});
