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
import {
  type CruceDeLaRueda,
  type FormaDeLaRueda,
  tipoDeGolpeBlocker,
} from '../battle/formas-de-la-rueda.js';
import type { BattleAction, BattleEvent } from '../battle/types.js';
import type { AdventureAction } from '../state/game.js';
import {
  type Hex,
  HUECOS,
  type Hueco,
  huecoDesconocido,
  type TipoDeGolpe,
  TODOS_LOS_GOLPES,
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

/**
 * La acción del agente tal como la juega el núcleo en una batalla con la rueda
 * `forma`; lanza con un `hit` que no es un golpe de ella.
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
