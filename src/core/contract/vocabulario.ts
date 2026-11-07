/**
 * **El vocabulario del contrato del agente**: lo que el agente lee y escribe en
 * inglés y el núcleo nombra en español, traducido en un solo sitio. Lo leen el
 * esquema y la prosa del contrato (`esquemas.ts`, `formato.ts`), lo que se le
 * manda (las vistas y las peticiones) y lo que manda él (el director). Tres familias:
 *
 * - **Los huecos de equipo** (decisión del usuario, 12-10-2026: «los huecos van en
 *   inglés en el contrato del agente ya»), **simétricos por uso** (simplify de F2):
 *   el arma de cuerpo a cuerpo (`melee_weapon`), la segunda (`second_melee_weapon`,
 *   25-10-2026: la lanza dejó su hueco `lance` y es un arma más), la que dispara
 *   (`ranged_weapon`), la armadura y el escudo. Por dentro —el núcleo, la crónica,
 *   el cable del espectador— siguen en español (`HUECOS`). El de disparar es
 *   `ranged_weapon` y no `ranged`, que es una opción del daño: dos cosas con el
 *   mismo nombre no se distinguirían en el cable. Un hueco del contrato es
 *   un `Slot`, que **solo produce este módulo**: el tipo lleva una marca que nadie
 *   más puede poner sin un `as Slot`, y eso lo vigila `test/invariantes.test.ts`.
 * - **La rueda del golpe y los poderes** (F6, 19-10-2026): el agente elige su golpe
 *   al atacar (`hit`) y su respuesta cuando le golpean (`battle_response`), y usa
 *   los poderes de sus unidades con la jugada `power`, que se llama como la del
 *   núcleo y como su hecho.
 * - **La muralla** (fase 2 del puesto fronterizo, 04-11-2026): las cuatro jugadas de
 *   la escala y la puerta (`JUGADA_DE_MURALLA`) y los hechos que las cuentan.
 *
 * Eran dos módulos (`huecos.ts`, `golpes.ts`) hasta el simplify de F3-F6
 * (19-10-2026): una sola puerta para lo que se traduce.
 */
import {
  type CruceDeLaRueda,
  type FormaDeLaRueda,
  tipoDeGolpeBlocker,
} from '../battle/formas-de-la-rueda.js';
import type { PuertaDeMuralla } from '../battle/muralla.js';
import type {
  BattleAction,
  BattleEvent,
  JugadaDeMuralla,
  TipoDeEscala,
  TipoDePuerta,
} from '../battle/types.js';
import type { MejoraDelPuesto } from '../map/map.js';
import { tipoDelVeterano } from '../state/sitios.js';
import type { AdventureAction, GameState } from '../state/tipos.js';
import {
  type Hex,
  HUECOS,
  type Hueco,
  huecoDesconocido,
  type TipoDeGolpe,
  TODOS_LOS_GOLPES,
} from '../types.js';

// ---------------------------------------------------------------- los puestos

/**
 * Cómo se dice en el contrato la obra de un puesto (`node.mejora`, puesto
 * fronterizo, fase 3): el `upgrade` del nodo en `knownMap`. Sin obra, `none` (la
 * caseta de un paso tomado, o un paso que nadie ha tomado).
 */
export const UPGRADE_DE_MEJORA = {
  ninguna: 'none',
  empalizada: 'palisade',
  muralla: 'wall',
} as const satisfies Readonly<Record<MejoraDelPuesto, string>>;

/** Lo que puede valer el `upgrade` de un nodo en el contrato. */
export type Upgrade = (typeof UPGRADE_DE_MEJORA)[MejoraDelPuesto];

/** Los tres, en el orden de la tabla: lo que el arnés de QA admite en un nodo. */
export const UPGRADES: readonly Upgrade[] = Object.values(UPGRADE_DE_MEJORA);

/** Si `valor` es un `upgrade` del contrato (`UPGRADES`). */
export function esUpgrade(valor: unknown): valor is Upgrade {
  return (UPGRADES as readonly unknown[]).includes(valor);
}

// ---------------------------------------------------------------- los huecos

declare const MARCA_DE_SLOT: unique symbol;

/** Un hueco como lo nombra el contrato del agente (`SLOT_DE_HUECO`). */
export type Slot = string & { readonly [MARCA_DE_SLOT]: true };

/** Cómo se llama cada hueco en el contrato. */
export const SLOT_DE_HUECO: Readonly<Record<Hueco, Slot>> = {
  arma: 'melee_weapon' as Slot,
  segunda: 'second_melee_weapon' as Slot,
  distancia: 'ranged_weapon' as Slot,
  armadura: 'armor' as Slot,
  escudo: 'shield' as Slot,
  montura: 'mount' as Slot,
};

/** Los seis, en el orden de `HUECOS`: lo que se le ofrece al agente. */
export const SLOTS: readonly Slot[] = HUECOS.map((h) => SLOT_DE_HUECO[h]);

/**
 * El hueco de un `slot` del agente, o excepción con los que valen. Lanza y no
 * devuelve `null`: quien la llama (`accionDelAgente`) está dentro del `try` del
 * director, que descarta esa acción con este motivo y sigue con las demás.
 */
export function huecoDelSlot(slot: string): Hueco {
  const hueco = HUECOS.find((h) => SLOT_DE_HUECO[h] === slot);
  if (hueco === undefined) {
    throw new Error(huecoDesconocido(slot, SLOTS));
  }
  return hueco;
}

/**
 * Una acción de aventura tal como la escribe el agente: la del núcleo, salvo el
 * `slot` de `unequip` y de `equip` (25-10-2026: dónde se pone un arma), que llega
 * en inglés y como texto. Texto y no un `z.enum` en el esquema: un hueco mal
 * escrito descarta ESA acción con su motivo (`huecoDelSlot`, dentro del `try` del
 * director), no el turno entero.
 */
export type AccionDelAgente =
  | Exclude<
      AdventureAction,
      // `repartir_tropa` es de la pantalla de la guarnición: el agente deja y recoge
      // (que no pueda cambiar uno por otro con los dos llenos va a backlog). Y
      // `mejorar_el_puesto`, del diálogo del puesto: su jugada del agente, backlog.
      {
        readonly type:
          | 'unequip'
          | 'equip'
          | 'dejar_tropa'
          | 'recoger_tropa'
          | 'repartir_tropa'
          | 'mejorar_el_puesto';
      }
    >
  | (Omit<Extract<AdventureAction, { readonly type: 'unequip' }>, 'slot'> & {
      readonly slot: string;
    })
  | (Omit<Extract<AdventureAction, { readonly type: 'equip' }>, 'hueco'> & {
      readonly slot?: string;
    })
  /**
   * Dejar y recoger tropa en la guarnición del sitio suyo donde está el héroe
   * (04-11-2026): en el contrato, en inglés, siempre con `creature` y `count`, y con
   * `veteran` como en `equip`. El núcleo, con el veterano, no lleva lo demás
   * (`PedidoDeTropa`): lo traduce `accionDelAgente`.
   */
  | {
      readonly type: 'leave_troops' | 'take_troops';
      readonly hero: string;
      readonly creature: string;
      readonly count: number;
      readonly veteran?: string;
    };

/**
 * La acción del agente tal como la juega el núcleo: cambia el `slot` de `unequip`
 * y de `equip`, del inglés del contrato al hueco de dentro, y `leave_troops` y
 * `take_troops` a `dejar_tropa` y `recoger_tropa`. Lo demás pasa tal cual.
 *
 * Con `veteran`, el núcleo mueve a ese individuo y nada más (`PedidoDeTropa`), así
 * que lo que el agente escribe al lado se mira aquí, con la partida (`state`): uno
 * solo, y de su tipo (`tipoDelVeterano`). Lanza con el motivo, dentro del `try` del
 * director, como un hueco mal escrito.
 */
export function accionDelAgente(a: AccionDelAgente, state: GameState): AdventureAction {
  switch (a.type) {
    case 'unequip':
      return { ...a, slot: huecoDelSlot(a.slot) };
    case 'leave_troops':
    case 'take_troops': {
      const type = a.type === 'leave_troops' ? 'dejar_tropa' : 'recoger_tropa';
      if (a.veteran === undefined) {
        return { type, hero: a.hero, creature: a.creature, count: a.count };
      }
      if (a.count !== 1) throw new Error(`un veterano es uno solo: no se mueven ${a.count}`);
      const tipo = tipoDelVeterano(state, a.hero, a.veteran);
      if (tipo !== null && tipo !== a.creature) {
        throw new Error(`el veterano "${a.veteran}" es de tipo "${tipo}", no "${a.creature}"`);
      }
      return { type, hero: a.hero, veterano: a.veteran };
    }
    case 'equip': {
      const { slot, ...resto } = a;
      return slot === undefined ? resto : { ...resto, hueco: huecoDelSlot(slot) };
    }
    default:
      return a;
  }
}

// ---------------------------------------------------------------- la rueda y los poderes

/** Cómo se llama cada tipo de la rueda en el contrato. */
export const HIT_DE_GOLPE = {
  ofensivo: 'offensive',
  fuerte: 'strong',
  finta: 'feint',
  defensivo: 'defensive',
  rapido: 'quick',
  romperGuardia: 'guard_break',
  normal: 'normal',
  // Los fusionados de las ruedas de 3 y 5 (22-10-2026): siempre con sus dos
  // partes en el nombre, también en la de 3, donde la persona los lee «Ofensivo»,
  // «Defensivo» y «Rápido».
  ofensivoFuerte: 'offensive_strong',
  defensivoFinta: 'defensive_feint',
  rapidoRomper: 'quick_guard_break',
} as const satisfies Readonly<Record<TipoDeGolpe, string>>;

/** Un tipo de la rueda como lo nombra el contrato del agente (`HIT_DE_GOLPE`). */
export type Hit = (typeof HIT_DE_GOLPE)[TipoDeGolpe];

/**
 * Los de la rueda `forma`, en su orden (el anillo desde arriba en el sentido del
 * reloj y Normal al final, si lo lleva): lo que vale en la batalla.
 */
export function hitsDeLaRueda(forma: FormaDeLaRueda): readonly Hit[] {
  return forma.golpes.map((t) => HIT_DE_GOLPE[t]);
}

/**
 * El tipo de un `hit` (o de un `response`) del agente en la rueda `forma` de su
 * batalla, o excepción con los que valen en ella: un golpe de otra rueda
 * (`"quick"` en la de 3) se rechaza diciendo de cuál es la batalla. Lanza y no
 * devuelve `null`: quien la llama está dentro del `try` del director, que
 * descarta esa jugada con este motivo y dice qué se jugó.
 */
export function golpeDelHit(hit: string, forma: FormaDeLaRueda): TipoDeGolpe {
  const tipo = TODOS_LOS_GOLPES.find((t) => HIT_DE_GOLPE[t] === hit);
  if (tipo !== undefined && tipoDeGolpeBlocker(tipo, forma) === null) return tipo;
  // El motivo, en las palabras del contrato: los `hit` que valen, no los tipos de dentro.
  const que =
    tipo === undefined
      ? 'no es un golpe de la rueda'
      : `no es un golpe de la rueda de ${forma.golpes.length} de esta batalla`;
  throw new Error(`«${hit}» ${que}; valen ${hitsDeLaRueda(forma).join(', ')}`);
}

/** Cómo se cruzan los tipos de una rueda, en las palabras del contrato (`crossing`). */
export const CRUCE_AL_AGENTE = {
  distancia: 'distance',
  ciclo: 'cycle',
} as const satisfies Readonly<Record<CruceDeLaRueda, string>>;

/**
 * La rueda de la batalla como la lee el agente (`wheel`): de cuántos tipos es, el
 * anillo en su orden (`ring`), si lleva Normal en el centro y cómo se cruzan:
 * `distance` (la de 7, por la distancia en el anillo) o `cycle` (las de 3 y 5:
 * cada uno gana al siguiente de `ring`, y el último al primero).
 */
export function ruedaAlAgente(forma: FormaDeLaRueda) {
  return {
    types: forma.golpes.length,
    ring: forma.anillo.map((t) => HIT_DE_GOLPE[t]),
    center: forma.centro,
    crossing: CRUCE_AL_AGENTE[forma.cruce],
  };
}

type Ataque = Extract<BattleAction, { type: 'attack' }>;
type Poder = Extract<BattleAction, { type: 'power' }>;
type DeLaMuralla = Extract<BattleAction, { type: JugadaDeMuralla }>;

/**
 * Las jugadas de la muralla en las palabras del contrato (fase 2 del puesto
 * fronterizo, 04-11-2026): las cuatro del núcleo, que van en español por dentro
 * (`poner_escalera`, `subir`, `abrir_puerta`, `cerrar_puerta`), con el muro en
 * `wall` y la puerta en `gate`. Hasta esta fase el `default` de `accionAlAgente`
 * las dejaba pasar en español, y no se veía porque el mapa no llevaba muralla. **La
 * tabla**: de ella salen la inversa (`JUGADA_DEL_AGENTE`), el esquema y la prosa
 * (`esquemas.ts`, `formato.ts`) y lo que el arnés de QA exige ver cruzar (`JUGADAS_DE_MURALLA`).
 */
export const JUGADA_DE_MURALLA = {
  poner_escalera: 'place_ladder',
  subir: 'climb',
  abrir_puerta: 'open_gate',
  cerrar_puerta: 'close_gate',
} as const satisfies Readonly<Record<DeLaMuralla['type'], string>>;

/** Las cuatro, en el orden de la tabla: las que el arnés de QA exige ver cruzar (`exigeLaMuralla`). */
export const JUGADAS_DE_MURALLA: readonly string[] = Object.values(JUGADA_DE_MURALLA);

/** La inversa de `JUGADA_DE_MURALLA`, derivada: del nombre del agente al del núcleo. */
const JUGADA_DEL_AGENTE = Object.fromEntries(
  Object.entries(JUGADA_DE_MURALLA).map(([nucleo, agente]) => [agente, nucleo]),
) as { readonly [K in DeLaMuralla['type'] as (typeof JUGADA_DE_MURALLA)[K]]: K };

/** Una escalera puesta como la lee el agente: su pie (`foot`) y su muro (`wall`). */
export function escaleraAlAgente(e: { readonly pie: Hex; readonly muro: Hex }) {
  return { foot: e.pie, wall: e.muro };
}

/** Una puerta como la lee el agente: sus dos casillas, `a` y `b` (`gate`). */
export function puertaAlAgente(p: PuertaDeMuralla): PuertaDeMuralla {
  return { a: p.a, b: p.b };
}

/**
 * Una acción de batalla tal como la escribe el agente: la del núcleo, salvo el
 * golpe (`hit`, texto del contrato, sin la respuesta, que elige el otro), el id
 * del poder, que va en `power` (en el núcleo, `poder`), y las cuatro de la muralla
 * (`JUGADA_DE_MURALLA`). Texto y no un `z.enum` en el esquema: un `hit` mal escrito
 * descarta ESA jugada con su motivo, no la batalla.
 */
export type AccionDeBatallaDelAgente =
  | Exclude<BattleAction, Ataque | Poder | DeLaMuralla>
  | {
      readonly type: 'attack';
      readonly target: string;
      readonly from?: Hex;
      readonly hit?: string;
    }
  | {
      readonly type: 'power';
      readonly power: string;
      readonly target?: string;
      readonly at?: Hex;
    }
  | {
      readonly type: (typeof JUGADA_DE_MURALLA)[TipoDeEscala];
      readonly wall: Hex;
    }
  | {
      readonly type: (typeof JUGADA_DE_MURALLA)[TipoDePuerta];
      readonly gate: PuertaDeMuralla;
    };

/**
 * La acción del agente tal como la juega el núcleo en una batalla con la rueda
 * `forma`; lanza con un `hit` que no es un golpe de ella. Sin `default`: una jugada
 * nueva del contrato que no se traduzca no compila.
 */
export function accionDeBatallaDelAgente(
  a: AccionDeBatallaDelAgente,
  forma: FormaDeLaRueda,
): BattleAction {
  switch (a.type) {
    case 'attack': {
      const { hit, ...resto } = a;
      return hit === undefined ? resto : { ...resto, golpe: golpeDelHit(hit, forma) };
    }
    case 'power': {
      const { power, type: _t, ...resto } = a;
      return { type: 'power', poder: power, ...resto };
    }
    case 'place_ladder':
    case 'climb':
      return { type: JUGADA_DEL_AGENTE[a.type], muro: a.wall };
    case 'open_gate':
    case 'close_gate':
      return { type: JUGADA_DEL_AGENTE[a.type], puerta: a.gate };
    case 'move':
    case 'aim':
    case 'throw':
    case 'cast':
    case 'surrender':
    case 'end_turn':
      return a;
  }
}

/**
 * Una acción del núcleo como la lee el agente (la lista legal): el id del poder,
 * en `power`; el golpe, sin lo elegido en la rueda (la lista no lo lleva: lo elige
 * él con `hit`); las de la muralla, con sus nombres del contrato. Lo demás, tal
 * cual. **Sin `default`** (plan de la fase 2): una jugada nueva del núcleo que no
 * tenga aquí su caso no compila, en vez de colarse en español.
 */
export function accionAlAgente(a: BattleAction): AccionDeBatallaDelAgente {
  switch (a.type) {
    case 'attack': {
      const { golpe: _golpe, respuesta: _respuesta, ...resto } = a;
      return resto;
    }
    case 'power': {
      const { poder, type: _t, ...resto } = a;
      return { type: 'power', power: poder, ...resto };
    }
    case 'poner_escalera':
    case 'subir':
      return { type: JUGADA_DE_MURALLA[a.type], wall: a.muro };
    case 'abrir_puerta':
    case 'cerrar_puerta':
      return { type: JUGADA_DE_MURALLA[a.type], gate: puertaAlAgente(a.puerta) };
    case 'move':
    case 'aim':
    case 'throw':
    case 'cast':
    case 'surrender':
    case 'end_turn':
      return a;
  }
}

type DeLaTraduccion = 'cruce' | 'ladder_placed' | 'gate_opened' | 'gate_closed';

/**
 * Un hecho del registro como lo lee el agente (`hechoAlAgente`): los que se traducen
 * con sus nombres del contrato, y los demás tal cual. Escrito, y no inferido, para que
 * un hecho nuevo del núcleo sin su caso no compile (la función no tiene `default`).
 */
export type HechoAlAgente =
  | Exclude<BattleEvent, { kind: DeLaTraduccion }>
  | (Omit<Extract<BattleEvent, { kind: 'cruce' }>, 'golpe' | 'respuesta'> & {
      readonly hit: Hit;
      readonly response: Hit;
    })
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
 * Un hecho del registro de la batalla como lo lee el agente: el cruce, con los
 * dos tipos en los nombres del contrato (`hit` el de quien pegó, `response` el
 * de quien respondió), que son los que él manda; la escalera puesta, con su pie
 * (`foot`) y su muro (`wall`), y la puerta abierta o cerrada, con la puerta
 * (`gate`): los nombres con que él las juega. Lo demás, tal cual.
 */
export function hechoAlAgente(e: BattleEvent): HechoAlAgente {
  switch (e.kind) {
    case 'cruce': {
      const { golpe, respuesta, ...resto } = e;
      return { ...resto, hit: HIT_DE_GOLPE[golpe], response: HIT_DE_GOLPE[respuesta] };
    }
    case 'ladder_placed':
      return { kind: e.kind, stack: e.stack, ...escaleraAlAgente(e) };
    case 'gate_opened':
    case 'gate_closed':
      return { kind: e.kind, stack: e.stack, gate: puertaAlAgente(e.puerta) };
    // Tal cual. `power` (`poder`) y `retoque` (`nombre`, `cambios`) llevan aún campos
    // en español: renombrarlos cambia el contrato (backlog del simplify de la fase 2).
    case 'round_start':
    case 'move':
    case 'attack':
    case 'aimed':
    case 'shoot':
    case 'thrown':
    case 'blast':
    case 'cast':
    case 'power':
    case 'spell_hit':
    case 'triggered':
    case 'retoque':
    case 'effect':
    case 'effect_end':
    case 'perished':
    case 'climbed':
    case 'surrender':
    case 'finished':
      return e;
  }
}
