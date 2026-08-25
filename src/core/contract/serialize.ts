/**
 * Qué ve el agente en cada petición.
 *
 * Se manda un resumen, no el estado entero: lo justo para decidir, con ids
 * estables para que pueda pedir detalles con las tools de consulta. Volcar el
 * mundo completo en cada turno llenaría su contexto de ruido.
 */
import { legalActions, stackHexes, stackSpeed } from '../battle/battle.js';
import { stackHp } from '../battle/damage.js';
import { effectiveLuck } from '../battle/effects.js';
import type { BattleState, Side } from '../battle/types.js';
import { creature, isShooter } from '../data.js';
import { maxMana, maxMovePoints } from '../hero/hero.js';
import { pointKey } from '../map/map.js';
import { cronicaPara } from '../state/events.js';
import { type GameState, heroesOf, townsOf, visibleNow, week } from '../state/game.js';
import { building } from '../town/buildings.js';
import {
  availableBuildings,
  dailyIncome,
  dwellings,
  mageGuildLevel,
  townSpells,
} from '../town/town.js';
import type { Army, PlayerId } from '../types.js';
import { RESOURCE_KINDS } from '../types.js';

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

  // Dos capas, y la diferencia importa: `fog` es «esto lo conozco alguna vez» y
  // `mirando` es «esto lo estoy viendo ahora». Del presente solo se puede
  // afirmar lo segundo; de lo demás se manda el RECUERDO, con su fecha.
  const mirando = visibleNow(state, playerId);
  const observado = (p: { x: number; y: number }): boolean => mirando.has(pointKey(p));
  const vivos = new Map(state.map.objects.map((o) => [o.id, o]));

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
      // Sin esto el agente decide adónde caminar sin saber qué sabe su héroe: la
      // batalla le ofrece los `cast` legales, pero para entonces ya ha elegido.
      spells: h.spells,
      army: armyView(h.army),
    })),
    towns: townsOf(state, playerId).map((t) => ({
      id: t.id,
      name: t.name,
      at: t.at,
      income: dailyIncome(t),
      mageGuild: mageGuildLevel(t),
      // Ids, como `buildings` y `recruitable`: el detalle lo da la tool
      // `spell_list` y no hace falta repetirlo en cada turno.
      teaches: townSpells(t).map((s) => s.id),
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
    // Solo lo que este jugador ha OBSERVADO, y tal como lo observó. El agente no
    // ve por las paredes, y tampoco ve el futuro de una casilla que dejó atrás:
    // `lastSeen` dice de qué día es cada dato, y si es de ayer puede haber
    // dejado de ser verdad.
    knownMap: {
      width: state.map.width,
      height: state.map.height,
      // El `switch` de dentro cubre la unión entera de `o.kind`, así que no hay
      // camino sin `return` — pero eso lo sabe `tsc` y no el linter, que no mira
      // tipos. Un `default` para callarlo escondería justo lo que interesa ver
      // rojo: que un `kind` nuevo del mapa no se está serializando.
      // biome-ignore lint/suspicious/useIterableCallbackReturn: lo garantiza el tipo, no el linter
      objects: [...player.memory.values()].map((recuerdo) => {
        // Lo que se está mirando ahora es presente; lo demás, memoria.
        const mirandolo = observado(recuerdo.object.at);
        const o = mirandolo ? (vivos.get(recuerdo.object.id) ?? recuerdo.object) : recuerdo.object;
        const cuando = { lastSeen: mirandolo ? state.day : recuerdo.day };
        switch (o.kind) {
          case 'mine':
            return {
              kind: o.kind,
              id: o.id,
              at: o.at,
              resource: o.resource,
              owner: o.owner,
              ...cuando,
            };
          case 'resource':
            return {
              kind: o.kind,
              id: o.id,
              at: o.at,
              resource: o.resource,
              amount: o.amount,
              taken: o.taken,
              ...cuando,
            };
          case 'town':
            return { kind: o.kind, id: o.id, at: o.at, owner: o.owner, ...cuando };
          case 'monster':
            return {
              kind: o.kind,
              id: o.id,
              at: o.at,
              creature: o.creature,
              count: o.count,
              defeated: o.defeated,
              ...cuando,
            };
          case 'chest':
            return { kind: o.kind, id: o.id, at: o.at, gold: o.gold, taken: o.taken, ...cuando };
        }
      }),
    },
    // Un héroe enemigo se ve o no se ve: no hay recuerdo que mandar, porque una
    // posición de anteayer es ruido y no intel. Antes bastaba con haber pisado
    // esa casilla alguna vez, así que el agente seguía al rival por medio mapa
    // sin tener a nadie cerca.
    enemyHeroes: state.heroes
      .filter((h) => h.owner !== playerId && observado(h.at))
      .map((h) => ({ id: h.id, owner: h.owner, at: h.at, army: armyView(h.army) })),
    // La crónica pasa por la niebla, igual que el mapa desde #35: antes iba el
    // log ENTERO y el agente le seguía los pasos al rival leyendo su diario. La
    // regla completa —a quién le consta, cuántos caben y el sello que se queda
    // en casa— la escribe `cronicaPara`, y el porqué con su medida está en la
    // cabecera de `events.ts`. Aquí solo se dice el tamaño de la ventana.
    recentEvents: cronicaPara(state, playerId, 25),
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
      // La suerte va ya con los efectos aplicados: el contrato promete el
      // valor con el que se va a tirar, no el de la ficha. La moral no tiene
      // efectos temporales que aplicar, así que es la suya y ya.
      morale: s.morale,
      luck: effectiveLuck(s),
      // Y aparte, cuánto le queda a cada cosa: sin esto el agente ve el número
      // cambiar de una ronda a otra sin saber por qué ni hasta cuándo.
      effects: s.effects.map((e) => ({
        kind: e.kind,
        amount: e.amount,
        source: e.source,
        roundsLeft: e.roundsLeft,
      })),
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
