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
import { type GameState, heroesOf, playerById, townsOf, visibleNow, week } from '../state/game.js';
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

/**
 * Los objetos del mapa **tal como los recuerda un jugador**, cada uno con la
 * fecha de su recuerdo.
 *
 * Está fuera de `serializeAdventureTurn` porque tiene dos consumidores: el
 * `knownMap` de cada turno y la consulta `map` (#74), que hasta ahora devolvía
 * `state.map.objects` entero —el mapa del rival incluido—. La regla de «qué
 * objetos conoce este jugador» se escribe aquí y solo aquí; si se copiara, la
 * copia volvería a quedarse atrás, que es exactamente lo que pasó.
 *
 * Levanta su propio `visibleNow`, sin recibirlo: la consulta no tiene ningún
 * otro motivo para construirlo, y encadenárselo al llamante haría que el
 * próximo se lo pasara mal calculado. Son 81 claves por héroe una vez por
 * petición del agente, no algo que corra dentro de una partida.
 */
export function knownObjects(state: GameState, playerId: PlayerId) {
  const player = playerById(state, playerId);

  // Dos capas, y la diferencia importa: `fog` es «esto lo conozco alguna vez» y
  // `mirando` es «esto lo estoy viendo ahora». Del presente solo se puede
  // afirmar lo segundo; de lo demás se manda el RECUERDO, con su fecha.
  const mirando = visibleNow(state, playerId);
  const vivos = new Map(state.map.objects.map((o) => [o.id, o]));

  // El `switch` de dentro cubre la unión entera de `o.kind` y no lleva
  // `default`: un `default` para callar al linter escondería justo lo que
  // interesa ver rojo, que un `kind` nuevo del mapa no se serializa.
  //
  // Quien lo pone rojo es el `never` de abajo, y no el `biome-ignore` que
  // hubo aquí: comprobado quitando el `case 'chest'`, con el `ignore`
  // puesto **compilaba y linteaba limpio**. Un guardia ciego durante todo
  // el tiempo que nadie lo rompió a mano.
  return [...player.memory.values()].map((recuerdo) => {
    // Lo que se está mirando ahora es presente; lo demás, memoria.
    const mirandolo = mirando.has(pointKey(recuerdo.object.at));
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
    // Exhaustivo: con un `kind` nuevo del mapa, `o` deja de ser `never`
    // aquí y esta línea NO compila. Y como termina en `throw`, el linter
    // ya ve que no hay camino sin salida y no hace falta callarlo.
    const sinSerializar: never = o;
    throw new Error(`objeto del mapa sin serializar: ${JSON.stringify(sinSerializar)}`);
  });
}

/**
 * El mapa **filtrado por la niebla de un jugador**: lo que responde la consulta
 * `map` (#74), que antes devolvía `state.map` tal cual.
 *
 * La capa es `fog` —«lo exploré alguna vez»— y no `visibleNow`, y el motivo es
 * que el terreno y los caminos **no cambian**: el recuerdo de un hecho estático
 * *es* el hecho, así que no lleva `lastSeen`. Los objetos sí cambian y por eso
 * siguen viniendo de `memory` con su fecha.
 *
 * **Una casilla sin explorar va como `null` en `terrain`**, no como hierba: el
 * índice sigue siendo `y * width + x`, igual que en `state.map.terrain`, y el
 * agente puede distinguir llanura de ignorancia. Al día 6 el 45,3 % de las
 * casillas serían mentira si se rellenaran con un terreno por defecto.
 *
 * `roads` solo trae las claves exploradas. Su ausencia **no** significa que no
 * haya camino: lo desambigua el terreno de esa misma casilla, que si es `null`
 * quiere decir que ahí no se sabe nada de nada.
 */
export function serializeKnownMap(state: GameState, playerId: PlayerId): unknown {
  const player = playerById(state, playerId);
  const { width, terrain, roads } = state.map;

  return {
    width,
    height: state.map.height,
    terrain: terrain.map((t, i) =>
      player.fog.has(pointKey({ x: i % width, y: Math.floor(i / width) })) ? t : null,
    ),
    roads: [...roads].filter((clave) => player.fog.has(clave)),
    objects: knownObjects(state, playerId),
  };
}

export function serializeAdventureTurn(state: GameState, playerId: PlayerId): unknown {
  const player = playerById(state, playerId);

  // `visibleNow` otra vez —`knownObjects` levanta el suyo—, y aquí se usa para
  // lo que no es el mapa: qué héroes enemigos se están viendo AHORA.
  const mirando = visibleNow(state, playerId);
  const observado = (p: { x: number; y: number }): boolean => mirando.has(pointKey(p));

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
      objects: knownObjects(state, playerId),
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
