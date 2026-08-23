/**
 * Qué ve el agente en cada petición.
 *
 * Se manda un resumen, no el estado entero: lo justo para decidir, con ids
 * estables para que pueda pedir detalles con las tools de consulta. Volcar el
 * mundo completo en cada turno llenaría su contexto de ruido.
 */
import { legalActions, stackHexes, stackSpeed } from '../battle/battle.js';
import { stackHp } from '../battle/damage.js';
import type { BattleState, Side } from '../battle/types.js';
import { creature, isShooter } from '../data.js';
import { maxMana, maxMovePoints, type Hero } from '../hero/hero.js';
import { pointKey } from '../map/map.js';
import { availableBuildings, dailyIncome, dwellings, mageGuildLevel } from '../town/town.js';
import { building } from '../town/buildings.js';
import type { Army, PlayerId } from '../types.js';
import { RESOURCE_KINDS } from '../types.js';
import {
  heroesOf,
  townsOf,
  week,
  type GameState,
} from '../state/game.js';

function armyView(army: Army): { slot: number; creature: string; count: number; speed: string }[] {
  return army.flatMap((stack, slot) =>
    stack === null
      ? []
      : [
          {
            slot,
            creature: stack.creature,
            count: stack.count,
            speed: creature(stack.creature).speed,
          },
        ],
  );
}

export function serializeAdventureTurn(state: GameState, playerId: PlayerId): unknown {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) throw new Error(`jugador desconocido: ${playerId}`);

  const visible = (p: { x: number; y: number }): boolean => player.fog.has(pointKey(p));

  return {
    kind: 'adventure_turn',
    you: {
      player: playerId,
      faction: player.faction,
      day: state.day,
      week: week(state),
      resources: Object.fromEntries(RESOURCE_KINDS.map((k) => [k, player.resources[k]])),
    },
    heroes: heroesOf(state, playerId).map((h) => ({
      id: h.id,
      name: h.name,
      at: h.at,
      movePoints: h.movePoints,
      maxMovePoints: maxMovePoints(h),
      attack: h.attack,
      defense: h.defense,
      spellPower: h.spellPower,
      knowledge: h.knowledge,
      mana: `${h.mana}/${maxMana(h)}`,
      army: armyView(h.army),
    })),
    towns: townsOf(state, playerId).map((t) => ({
      id: t.id,
      name: t.name,
      at: t.at,
      income: dailyIncome(t),
      mageGuild: mageGuildLevel(t),
      builtToday: t.builtToday,
      buildings: t.buildings,
      canBuildNow: availableBuildings(t, player.resources).map((id) => ({
        id,
        name: building(id).name,
        cost: building(id).cost,
      })),
      recruitable: dwellings(t).map(({ creature: id }) => ({
        creature: id,
        available: t.available[id] ?? 0,
        cost: creature(id).cost,
      })),
      garrison: armyView(t.garrison),
    })),
    // Solo lo que este jugador ha explorado: el agente no ve por las paredes.
    knownMap: {
      width: state.map.width,
      height: state.map.height,
      objects: state.map.objects
        .filter((o) => visible(o.at))
        .map((o) => {
          switch (o.kind) {
            case 'mine':
              return { kind: o.kind, id: o.id, at: o.at, resource: o.resource, owner: o.owner };
            case 'resource':
              return { kind: o.kind, id: o.id, at: o.at, resource: o.resource, amount: o.amount, taken: o.taken };
            case 'town':
              return { kind: o.kind, id: o.id, at: o.at, owner: o.owner };
            case 'monster':
              return { kind: o.kind, id: o.id, at: o.at, creature: o.creature, count: o.count, defeated: o.defeated };
            case 'chest':
              return { kind: o.kind, id: o.id, at: o.at, gold: o.gold, taken: o.taken };
          }
        }),
    },
    enemyHeroes: state.heroes
      .filter((h) => h.owner !== playerId && visible(h.at))
      .map((h) => ({ id: h.id, owner: h.owner, at: h.at, army: armyView(h.army) })),
    recentEvents: state.log.slice(-25),
  };
}

export function serializeBattleTurn(battle: BattleState, side: Side): unknown {
  const stackView = (s: (typeof battle.stacks)[number]) => {
    const info = creature(s.creature);
    return {
      id: s.id,
      side: s.side,
      creature: s.creature,
      name: info.name,
      count: s.count,
      hp: stackHp(s),
      hex: s.hex,
      occupies: stackHexes(s),
      speed: stackSpeed(s),
      attack: info.attack,
      defense: info.defense,
      damage: info.damage,
      shooter: isShooter(info),
      shotsLeft: s.shotsLeft,
      traits: info.traits ?? [],
      morale: s.morale,
      luck: s.luck,
      defending: s.defending,
      waited: s.waited,
    };
  };

  const hero = battle.heroes[side];

  return {
    kind: 'battle_turn',
    round: battle.round,
    yourSide: side,
    activeStack: battle.activeId,
    board: { width: 11, height: 9, layout: 'offset odd-r; el atacante entra por la columna 0' },
    stacks: battle.stacks.filter((s) => s.count > 0).map(stackView),
    hero:
      hero === null
        ? null
        : {
            name: hero.name,
            attack: hero.attack,
            defense: hero.defense,
            spellPower: hero.spellPower,
            mana: hero.mana,
            castThisRound: hero.castThisRound,
            spells: hero.spells,
          },
    // Todas las acciones legales del stack activo: elegir una nunca falla.
    legalActions: legalActions(battle),
    log: battle.log.slice(-30),
  };
}

export interface MapRequestOptions {
  readonly width: number;
  readonly height: number;
  readonly players: number;
  readonly theme?: string;
}

export function serializeMapRequest(opts: MapRequestOptions): unknown {
  return {
    kind: 'map_generate',
    want: {
      width: opts.width,
      height: opts.height,
      players: opts.players,
      theme: opts.theme ?? 'un valle en disputa entre un reino caballeresco y una necrópolis',
    },
    palette: {
      terrains: ['grass', 'dirt', 'sand', 'snow', 'swamp', 'lava', 'rough', 'water'],
      resources: RESOURCE_KINDS,
      factions: ['knight', 'necromancer'],
      creaturesForGuards: [
        'peasant',
        'archer',
        'pikeman',
        'swordsman',
        'skeleton',
        'zombie',
        'mummy',
        'vampire',
      ],
    },
    advice: [
      'Reparte las minas para que ningún jugador nazca sin madera ni mineral.',
      'Los monstruos custodian lo bueno: cuanto mejor el premio, más dura la guardia.',
      'Deja el centro del mapa disputado y los bordes seguros.',
    ],
  };
}
