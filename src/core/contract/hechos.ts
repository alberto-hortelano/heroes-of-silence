/**
 * **Los hechos que lee el agente** (10-11-2026, #292): el registro de la batalla
 * (`log` de `battle_turn`) y la crónica de la partida (`recentEvents`), con las
 * claves y los enumerados en las palabras del contrato. El núcleo emite sus hechos
 * en sus nombres de dentro —varios en español: `cruce`, `parado`, `faltan`,
 * `lugar`…— y así los leen la pantalla y el espectador (`state.log` crudo); aquí se
 * traducen **al servirlos al agente**, y en ningún otro sitio.
 *
 * Dos traductores con la misma disciplina:
 *
 * - **Sin `default` y con el tipo de retorno escrito**: un hecho nuevo del núcleo
 *   sin su caso no compila.
 * - **Cada hecho que se traduce se construye campo a campo**, sin `...resto` del
 *   hecho del núcleo: un campo nuevo en español no se cuela por el resto. Lo que ya
 *   está en inglés de punta a punta pasa tal cual.
 *
 * Lo que eso no puede saber —qué es español— lo vigila
 * `test/hechos-del-agente.test.ts` con una lista cerrada de claves. Y que la
 * crónica no salga hacia el agente por otra puerta (`cronicaPara` a secas), un
 * guardia de `test/invariantes-partida.test.ts`.
 *
 * Las tablas de palabras están en `vocabulario.ts`: las leen también las vistas, y
 * un hecho y su vista tienen que decir la misma.
 */
import type { Punto } from '../battle/cifras-de-la-rueda.js';
import type { ResumenDeBatalla } from '../battle/resumen.js';
import type { BattleEvent, PuertaDeMuralla, Side } from '../battle/types.js';
import {
  type Atacante,
  type BattleFoe,
  cronicaPara,
  type GameEvent,
  type GameEventDraft,
  type Origen,
} from '../state/events.js';
import type { Hex, PlayerId } from '../types.js';
import { ocupanteAlAgente } from './vistas.js';
import {
  CUANDO_AL_AGENTE,
  EFECTO_AL_AGENTE,
  type Effect,
  type Expires,
  escaleraAlAgente,
  HIT_DE_GOLPE,
  type Hit,
  LUGAR_AL_AGENTE,
  origenAlAgente,
  puertaAlAgente,
  UPGRADE_DE_MEJORA,
  type Upgrade,
  VENCE_AL_AGENTE,
  type When,
} from './vocabulario.js';

/**
 * Un campo opcional del contrato: con valor, `{ clave: valor }`; sin él, nada (lo
 * que no hay no viaja, y con `exactOptionalPropertyTypes` un `undefined` escrito no
 * es lo mismo que un campo que falta).
 */
function si<K extends string, V>(clave: K, valor: V | undefined): { readonly [P in K]?: V } {
  return (valor === undefined ? {} : { [clave]: valor }) as { readonly [P in K]?: V };
}

// ---------------------------------------------------------------- la batalla

/** Los hechos de la batalla que ya van en inglés de punta a punta: pasan tal cual. */
type TalCualDeBatalla =
  | 'round_start'
  | 'aimed'
  | 'thrown'
  | 'raised'
  | 'perished'
  | 'climbed'
  | 'surrender'
  | 'finished';

/**
 * Un hecho del registro de la batalla como lo lee el agente. Escrito, y no inferido,
 * para que un hecho nuevo del núcleo sin su caso no compile (`hechoAlAgente` no
 * tiene `default`) y para que una clave nueva tenga que escribirse aquí.
 */
type HechoAlAgente =
  | Extract<BattleEvent, { kind: TalCualDeBatalla }>
  | {
      readonly kind: 'move';
      readonly stack: string;
      readonly to: Hex;
      readonly path: readonly Hex[];
      readonly charge?: true;
    }
  | {
      readonly kind: 'clash';
      readonly stack: string;
      readonly target: string;
      readonly hit: Hit;
      readonly response: Hit;
      readonly point: Punto;
    }
  | {
      readonly kind: 'attack';
      readonly stack: string;
      readonly target: string;
      readonly damage: number;
      readonly killed: number;
      readonly retaliation: boolean;
      readonly charge?: number;
      readonly point?: Punto;
      readonly blocked?: number;
    }
  | {
      readonly kind: 'blast';
      readonly stack: string;
      readonly at: Hex;
      readonly target: string | null;
      readonly damage: number;
      readonly killed: number;
      readonly quarter: number;
      readonly blocked?: number;
    }
  | {
      readonly kind: 'shoot';
      readonly stack: string;
      readonly at: Hex;
      readonly target: string | null;
      readonly damage: number;
      readonly killed: number;
      readonly blocked?: number;
      readonly splash?: boolean;
    }
  | {
      readonly kind: 'cast';
      readonly side: Side;
      readonly spell: string;
      readonly target?: string;
      readonly at?: Hex;
      readonly deferred?: true;
      readonly damage?: number;
      readonly killed?: number;
      readonly blocked?: number;
    }
  | {
      readonly kind: 'power';
      readonly stack: string;
      readonly power: string;
      readonly target?: string;
      readonly at?: Hex;
      readonly healed?: number;
      readonly deferred?: true;
    }
  | {
      readonly kind: 'spell_hit';
      readonly spell: string;
      readonly stack: string;
      readonly damage: number;
      readonly killed: number;
      readonly blocked?: number;
      readonly healed?: number;
    }
  | {
      readonly kind: 'triggered';
      readonly stack: string;
      readonly spell: string;
      readonly when: When;
    }
  | {
      readonly kind: 'retouch';
      readonly name: string;
      readonly stacks: readonly string[];
      readonly changes: readonly string[];
    }
  | {
      readonly kind: 'effect';
      readonly stack: string;
      readonly effect: Effect;
      readonly amount: number;
      readonly summary?: string;
      /** Quién lo puso (`origenAlAgente`): un id, o el golpe de la rueda con su palabra de `hit`. */
      readonly source: string;
      readonly rounds: number;
      readonly expires?: Expires;
      readonly turnOf?: string;
    }
  | { readonly kind: 'effect_end'; readonly stack: string; readonly source: string }
  | {
      readonly kind: 'ladder_placed';
      readonly stack: string;
      readonly foot: Hex;
      readonly wall: Hex;
    }
  | {
      readonly kind: 'gate_opened' | 'gate_closed';
      readonly stack: string;
      readonly gate: PuertaDeMuralla;
    };

/**
 * Un hecho del registro de la batalla como lo lee el agente (la tabla, en
 * `docs/areas/agente.md`, «Los hechos, traducidos»): el cruce de la rueda es
 * `clash` (no `crossing`, que ya es un campo de `wheel`) con los golpes en `hit` y
 * `response`, los que él manda; lo que paró la armadura, `blocked`; el cuarto de la
 * granada, `quarter`; lo diferido, `deferred`; el poder, `power`, como su jugada; la
 * cura, `healed`; el efecto, con la palabra de `stacks[].effects[].kind`
 * (`EFECTO_AL_AGENTE`) y su `summary`; la escalera y la puerta, con los nombres con
 * que las juega.
 *
 * `move.corre` no se traduce: **se quita**. Dice si el lienzo anima el tramo
 * corriendo o andando y ninguna regla lo lee. `retoque` solo lo emite la arena: a
 * una partida del agente no llega, y su caso está para que el `switch` siga entero.
 */
export function hechoAlAgente(e: BattleEvent): HechoAlAgente {
  switch (e.kind) {
    case 'move':
      return {
        kind: e.kind,
        stack: e.stack,
        to: e.to,
        path: e.path,
        ...si('charge', e.charge),
      };
    case 'cruce':
      return {
        kind: 'clash',
        stack: e.stack,
        target: e.target,
        hit: HIT_DE_GOLPE[e.golpe],
        response: HIT_DE_GOLPE[e.respuesta],
        point: e.punto,
      };
    case 'attack':
      return {
        kind: e.kind,
        stack: e.stack,
        target: e.target,
        damage: e.damage,
        killed: e.killed,
        retaliation: e.retaliation,
        ...si('charge', e.charge),
        ...si('point', e.punto),
        ...si('blocked', e.parado),
      };
    case 'blast':
      return {
        kind: e.kind,
        stack: e.stack,
        at: e.at,
        target: e.target,
        damage: e.damage,
        killed: e.killed,
        quarter: e.cuarto,
        ...si('blocked', e.parado),
      };
    case 'shoot':
      return {
        kind: e.kind,
        stack: e.stack,
        at: e.at,
        target: e.target,
        damage: e.damage,
        killed: e.killed,
        ...si('blocked', e.parado),
        ...si('splash', e.splash),
      };
    case 'cast':
      return {
        kind: e.kind,
        side: e.side,
        spell: e.spell,
        ...si('target', e.target),
        ...si('at', e.at),
        ...si('deferred', e.diferido),
        ...si('damage', e.damage),
        ...si('killed', e.killed),
        ...si('blocked', e.parado),
      };
    case 'power':
      return {
        kind: e.kind,
        stack: e.stack,
        power: e.poder,
        ...si('target', e.target),
        ...si('at', e.at),
        ...si('healed', e.cura),
        ...si('deferred', e.diferido),
      };
    case 'spell_hit':
      return {
        kind: e.kind,
        spell: e.spell,
        stack: e.stack,
        damage: e.damage,
        killed: e.killed,
        ...si('blocked', e.parado),
        ...si('healed', e.cura),
      };
    case 'triggered':
      return { kind: e.kind, stack: e.stack, spell: e.spell, when: CUANDO_AL_AGENTE[e.cuando] };
    case 'retoque':
      return { kind: 'retouch', name: e.nombre, stacks: e.stacks, changes: e.cambios };
    case 'effect':
      return {
        kind: e.kind,
        stack: e.stack,
        effect: EFECTO_AL_AGENTE[e.effect],
        amount: e.amount,
        ...si('summary', e.dicho),
        source: origenAlAgente(e.source),
        rounds: e.rounds,
        ...si('expires', e.vence === undefined ? undefined : VENCE_AL_AGENTE[e.vence]),
        ...si('turnOf', e.turnoDe),
      };
    case 'effect_end':
      return { kind: e.kind, stack: e.stack, source: origenAlAgente(e.source) };
    case 'ladder_placed':
      return { kind: e.kind, stack: e.stack, ...escaleraAlAgente(e) };
    case 'gate_opened':
    case 'gate_closed':
      return { kind: e.kind, stack: e.stack, gate: puertaAlAgente(e.puerta) };
    // Tal cual: ya van en inglés de punta a punta (`TalCualDeBatalla`).
    case 'round_start':
    case 'aimed':
    case 'thrown':
    case 'raised':
    case 'perished':
    case 'climbed':
    case 'surrender':
    case 'finished':
      return e;
  }
}

// ---------------------------------------------------------------- la crónica

/** Los hechos de la crónica que se traducen; los demás ya van en inglés y pasan tal cual. */
type TraducidoDeLaCronica =
  | 'march_cut'
  | 'gold_gained'
  | 'gold_paid'
  | 'place_state'
  | 'world_mark'
  | 'item_given'
  | 'troops_joined'
  | 'site_occupied'
  | 'loot_found'
  | 'outpost_upgraded'
  | 'battle_started'
  | 'battle_ended'
  | 'troop_rank_up';

/** El rival de una batalla del mapa como lo lee el agente: el de un lugar, con sus claves del contrato. */
type RivalAlAgente =
  | Exclude<BattleFoe, { readonly kind: 'lugar' }>
  | {
      readonly kind: typeof LUGAR_AL_AGENTE;
      readonly place: string;
      readonly encounter: string;
      readonly option: { readonly point: string; readonly node: string; readonly option: number };
    };

/** Un hecho de la crónica como lo lee el agente (`recentEvents`). Escrito, como `HechoAlAgente`. */
type HechoDeLaCronicaAlAgente =
  | Exclude<GameEventDraft, { kind: TraducidoDeLaCronica }>
  | (Origen &
      (
        | { readonly kind: 'march_cut'; readonly hero: string; readonly remaining: number }
        | { readonly kind: 'gold_gained'; readonly amount: number }
        | {
            readonly kind: 'gold_gained';
            readonly amount: number;
            readonly from: typeof LUGAR_AL_AGENTE;
            readonly place: string;
          }
        | { readonly kind: 'gold_paid'; readonly amount: number; readonly place: string }
        | {
            readonly kind: 'place_state';
            readonly place: string;
            readonly name: string;
            readonly state: string;
            readonly from: string;
            readonly stateName: string;
          }
        | { readonly kind: 'world_mark'; readonly mark: string; readonly place: string }
        | {
            readonly kind: 'item_given';
            readonly hero: string;
            readonly item: string;
            readonly place: string;
          }
        | {
            readonly kind: 'troops_joined';
            readonly hero: string;
            readonly creature: string;
            readonly count: number;
            readonly place: string;
          }
        | {
            readonly kind: 'site_occupied';
            readonly site: string;
            readonly by: ReturnType<typeof ocupanteAlAgente>;
          }
        | {
            readonly kind: 'loot_found';
            readonly hero: string;
            readonly item: string;
            readonly from: 'raider' | 'town';
          }
        | {
            readonly kind: 'loot_found';
            readonly hero: string;
            readonly item: string;
            readonly from: typeof LUGAR_AL_AGENTE;
            readonly place: string;
          }
        | {
            readonly kind: 'outpost_upgraded';
            readonly hero: string;
            readonly site: string;
            readonly upgrade: Upgrade;
            readonly cost: number;
          }
        | {
            readonly kind: 'battle_started';
            readonly attacker: Atacante;
            readonly foe: RivalAlAgente;
            readonly remaining?: number;
          }
        | {
            readonly kind: 'battle_ended';
            readonly winner: Side;
            readonly foe: RivalAlAgente;
            readonly owners: Readonly<Record<Side, PlayerId | null>>;
            readonly rounds: ResumenDeBatalla['rounds'];
            readonly casts: ResumenDeBatalla['casts'];
            readonly lost: ResumenDeBatalla['lost'];
          }
        | {
            readonly kind: 'troop_rank_up';
            readonly creature: string;
            readonly rank: number;
            readonly veteran: string;
          }
      ));

/** El rival de una batalla, con el de un lugar en las claves del contrato. Sin `default`. */
function rivalAlAgente(foe: BattleFoe): RivalAlAgente {
  switch (foe.kind) {
    case 'lugar':
      return {
        kind: LUGAR_AL_AGENTE,
        place: foe.lugar,
        encounter: foe.encuentro,
        option: { point: foe.opcion.punto, node: foe.opcion.nodo, option: foe.opcion.opcion },
      };
    case 'monster':
    case 'hero':
    case 'raider':
    case 'garrison':
      return foe;
  }
}

/**
 * Un hecho de la crónica como lo lee el agente: lo de un lugar, en `place`; los
 * pasos que le quedaban a una marcha, `remaining`; el veterano, `veteran`, como en
 * las jugadas; quién ocupa un sitio, con la forma de `occupiedBy` de `knownMap`
 * (`ocupanteAlAgente`); la obra de un puesto, en `upgrade` y con la palabra del nodo
 * (`UPGRADE_DE_MEJORA`): un mismo hecho se dice igual aquí que en las vistas. Los
 * nombres propios y las frases para la persona (`name`, `stateName`) van como son.
 */
export function hechoDeLaCronicaAlAgente(e: GameEventDraft): HechoDeLaCronicaAlAgente {
  const origen = { actor: e.actor, at: e.at };
  switch (e.kind) {
    case 'march_cut':
      return { kind: e.kind, ...origen, hero: e.hero, remaining: e.faltan };
    case 'gold_gained':
      return e.from === undefined
        ? { kind: e.kind, ...origen, amount: e.amount }
        : { kind: e.kind, ...origen, amount: e.amount, from: LUGAR_AL_AGENTE, place: e.lugar };
    case 'gold_paid':
      return { kind: e.kind, ...origen, amount: e.amount, place: e.lugar };
    case 'place_state':
      return {
        kind: e.kind,
        ...origen,
        place: e.lugar,
        name: e.nombre,
        state: e.estado,
        from: e.from,
        stateName: e.dicho,
      };
    case 'world_mark':
      return { kind: e.kind, ...origen, mark: e.marca, place: e.lugar };
    case 'item_given':
      return { kind: e.kind, ...origen, hero: e.hero, item: e.item, place: e.lugar };
    case 'troops_joined':
      return {
        kind: e.kind,
        ...origen,
        hero: e.hero,
        creature: e.creature,
        count: e.count,
        place: e.lugar,
      };
    case 'site_occupied':
      return { kind: e.kind, ...origen, site: e.site, by: ocupanteAlAgente(e.by) };
    case 'loot_found':
      return e.from === 'lugar'
        ? {
            kind: e.kind,
            ...origen,
            hero: e.hero,
            item: e.item,
            from: LUGAR_AL_AGENTE,
            place: e.lugar,
          }
        : { kind: e.kind, ...origen, hero: e.hero, item: e.item, from: e.from };
    case 'outpost_upgraded':
      return {
        kind: e.kind,
        ...origen,
        hero: e.hero,
        site: e.site,
        upgrade: UPGRADE_DE_MEJORA[e.to],
        cost: e.cost,
      };
    case 'battle_started':
      return {
        kind: e.kind,
        ...origen,
        attacker: e.attacker,
        foe: rivalAlAgente(e.foe),
        ...si('remaining', 'faltan' in e ? e.faltan : undefined),
      };
    case 'battle_ended':
      return {
        kind: e.kind,
        ...origen,
        winner: e.winner,
        foe: rivalAlAgente(e.foe),
        owners: e.owners,
        rounds: e.rounds,
        casts: e.casts,
        lost: e.lost,
      };
    case 'troop_rank_up':
      return { kind: e.kind, ...origen, creature: e.creature, rank: e.rank, veteran: e.veterano };
    // Tal cual: ya van en inglés de punta a punta.
    case 'day_start':
    case 'turn_start':
    case 'hero_moved':
    case 'node_captured':
    case 'town_captured':
    case 'town_owner_changed':
    case 'site_freed':
    case 'built':
    case 'recruited':
    case 'dismissed':
    case 'left_behind':
    case 'hero_hired':
    case 'item_bought':
    case 'hero_promoted':
    case 'spells_learned':
    case 'troops_left':
    case 'troops_taken':
    case 'troops_exchanged':
    case 'defense_set':
    case 'raider_spawned':
    case 'raider_dispersed':
    case 'march_halted':
    case 'hero_defeated':
    case 'hero_returned':
    case 'rank_up':
    case 'player_defeated':
    case 'game_over':
      return e;
  }
}

/**
 * La crónica que le consta a `player`, **como la lee el agente**: los `n` hechos
 * más recientes que pasan la niebla (`cronicaPara`, que es quien lo decide), cada
 * uno traducido. **El paso único**: hacia el agente, nadie más del contrato ni del
 * servidor llama a `cronicaPara` (lo vigila `test/invariantes-partida.test.ts`).
 */
export function cronicaAlAgente(
  state: { readonly log: readonly GameEvent[] },
  player: PlayerId,
  n: number,
): HechoDeLaCronicaAlAgente[] {
  return cronicaPara(state, player, n).map(hechoDeLaCronicaAlAgente);
}
