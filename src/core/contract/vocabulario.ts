/**
 * **El vocabulario del contrato del agente**: lo que el agente lee y escribe en
 * inglés y el núcleo nombra en español, traducido en un solo sitio. Lo leen el
 * esquema y la prosa del contrato (`agent.ts`), lo que se le manda
 * (`serialize.ts`) y lo que manda él (el director). Dos familias:
 *
 * - **Los huecos de equipo** (decisión del usuario, 12-10-2026: «los huecos van en
 *   inglés en el contrato del agente ya»), **simétricos por uso** (simplify de F2):
 *   el arma de cuerpo a cuerpo (`melee_weapon`), la que dispara (`ranged_weapon`),
 *   la lanza (`lance`), la armadura y el escudo. Por dentro —el núcleo, la crónica,
 *   el cable del espectador— siguen en español (`HUECOS`). La lanza es `lance` y no
 *   `charge`, que ya es el rasgo del jinete en el contrato (`traits`), y el de
 *   disparar, `ranged_weapon` y no `ranged`, que es una opción del daño: dos cosas
 *   con el mismo nombre no se distinguirían en el cable. Un hueco del contrato es
 *   un `Slot`, que **solo produce este módulo**: el tipo lleva una marca que nadie
 *   más puede poner sin un `as Slot`, y eso lo vigila `test/invariantes.test.ts`.
 * - **La rueda del golpe y los poderes** (F6, 19-10-2026): el agente elige su golpe
 *   al atacar (`hit`) y su respuesta cuando le golpean (`battle_response`), y usa
 *   los poderes de sus unidades con la jugada `power`, que se llama como la del
 *   núcleo y como su hecho.
 *
 * Eran dos módulos (`huecos.ts`, `golpes.ts`) hasta el simplify de F3-F6
 * (19-10-2026): una sola puerta para lo que se traduce.
 */
import type { BattleAction, BattleEvent } from '../battle/types.js';
import type { AdventureAction } from '../state/game.js';
import {
  type Hex,
  HUECOS,
  type Hueco,
  huecoDesconocido,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
} from '../types.js';

// ---------------------------------------------------------------- los huecos

declare const MARCA_DE_SLOT: unique symbol;

/** Un hueco como lo nombra el contrato del agente (`SLOT_DE_HUECO`). */
export type Slot = string & { readonly [MARCA_DE_SLOT]: true };

/** Cómo se llama cada hueco en el contrato. */
export const SLOT_DE_HUECO: Readonly<Record<Hueco, Slot>> = {
  arma: 'melee_weapon' as Slot,
  distancia: 'ranged_weapon' as Slot,
  lanza: 'lance' as Slot,
  armadura: 'armor' as Slot,
  escudo: 'shield' as Slot,
};

/** Los cinco, en el orden de `HUECOS`: lo que se le ofrece al agente. */
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
 * `slot` de `unequip`, que llega en inglés y como texto. Texto y no un `z.enum`
 * en el esquema: un hueco mal escrito descarta ESA acción con su motivo
 * (`huecoDelSlot`, dentro del `try` del director), no el turno entero.
 */
export type AccionDelAgente =
  | Exclude<AdventureAction, { readonly type: 'unequip' }>
  | (Omit<Extract<AdventureAction, { readonly type: 'unequip' }>, 'slot'> & {
      readonly slot: string;
    });

/**
 * La acción del agente tal como la juega el núcleo: hoy solo cambia el `slot` de
 * `unequip`, del inglés del contrato al hueco de dentro. Lo demás pasa tal cual.
 */
export function accionDelAgente(a: AccionDelAgente): AdventureAction {
  return a.type === 'unequip' ? { ...a, slot: huecoDelSlot(a.slot) } : a;
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
} as const satisfies Readonly<Record<TipoDeGolpe, string>>;

/** Un tipo de la rueda como lo nombra el contrato del agente (`HIT_DE_GOLPE`). */
export type Hit = (typeof HIT_DE_GOLPE)[TipoDeGolpe];

/** Los siete, en el orden de `TIPOS_DE_GOLPE` (el anillo desde arriba y Normal al final). */
export const HITS: readonly Hit[] = TIPOS_DE_GOLPE.map((t) => HIT_DE_GOLPE[t]);

/**
 * El tipo de un `hit` (o de un `response`) del agente, o excepción con los que
 * valen. Lanza y no devuelve `null`: quien la llama está dentro del `try` del
 * director, que descarta esa jugada con este motivo y dice qué se jugó.
 */
export function golpeDelHit(hit: string): TipoDeGolpe {
  const tipo = TIPOS_DE_GOLPE.find((t) => HIT_DE_GOLPE[t] === hit);
  if (tipo === undefined) {
    throw new Error(`«${hit}» no es un golpe de la rueda; valen ${HITS.join(', ')}`);
  }
  return tipo;
}

type Ataque = Extract<BattleAction, { type: 'attack' }>;
type Poder = Extract<BattleAction, { type: 'power' }>;

/**
 * Una acción de batalla tal como la escribe el agente: la del núcleo, salvo el
 * golpe (`hit`, texto del contrato, sin la respuesta, que elige el otro) y el id
 * del poder, que va en `power` (en el núcleo, `poder`). Texto y no un `z.enum` en el
 * esquema: un `hit` mal escrito descarta ESA jugada con su motivo, no la batalla.
 */
export type AccionDeBatallaDelAgente =
  | Exclude<BattleAction, Ataque | Poder>
  | {
      readonly type: 'attack';
      readonly target: string;
      readonly from?: Hex;
      readonly hit?: string;
    }
  | { readonly type: 'power'; readonly power: string; readonly target: string };

/** La acción del agente tal como la juega el núcleo; lanza con un `hit` que no es un golpe. */
export function accionDeBatallaDelAgente(a: AccionDeBatallaDelAgente): BattleAction {
  switch (a.type) {
    case 'attack': {
      const { hit, ...resto } = a;
      return hit === undefined ? resto : { ...resto, golpe: golpeDelHit(hit) };
    }
    case 'power':
      return { type: 'power', poder: a.power, target: a.target };
    default:
      return a;
  }
}

/**
 * Una acción del núcleo como la lee el agente (la lista legal): el id del poder,
 * en `power`; el golpe, sin lo elegido en la rueda (la lista no lo lleva: lo elige
 * él con `hit`). Lo demás, tal cual.
 */
export function accionAlAgente(a: BattleAction): AccionDeBatallaDelAgente {
  switch (a.type) {
    case 'attack': {
      const { golpe: _golpe, respuesta: _respuesta, ...resto } = a;
      return resto;
    }
    case 'power':
      return { type: 'power', power: a.poder, target: a.target };
    default:
      return a;
  }
}

/**
 * Un hecho del registro de la batalla como lo lee el agente: el cruce, con los
 * dos tipos en los nombres del contrato (`hit` el de quien pegó, `response` el
 * de quien respondió), que son los que él manda. Lo demás, tal cual.
 */
export function hechoAlAgente(e: BattleEvent) {
  if (e.kind !== 'cruce') return e;
  const { golpe, respuesta, ...resto } = e;
  return { ...resto, hit: HIT_DE_GOLPE[golpe], response: HIT_DE_GOLPE[respuesta] };
}
