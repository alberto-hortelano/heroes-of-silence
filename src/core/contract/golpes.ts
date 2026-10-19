/**
 * La rueda del golpe y los poderes en el contrato del agente (F6 de la tarea del
 * combate en el juego, 19-10-2026): el agente elige su golpe al atacar (`hit`) y
 * su respuesta cuando le golpean (`battle_response`), y usa los poderes de sus
 * unidades (`power`). Todo en inglés, como el resto de sus claves; por dentro, el
 * núcleo sigue con sus nombres (`TipoDeGolpe`, la jugada `poder`).
 *
 * **Esta es la única traducción**, como la de los huecos (`huecos.ts`): la leen
 * el esquema y la prosa del contrato, la lista legal y el registro que se le
 * mandan (`accionAlAgente`, `hechoAlAgente`) y lo que manda él
 * (`accionDeBatallaDelAgente`, `golpeDelHit`, en el director). Un golpe del
 * contrato es un `Hit`, que solo produce este módulo.
 */
import type { BattleAction, BattleEvent } from '../battle/types.js';
import { type Hex, TIPOS_DE_GOLPE, type TipoDeGolpe } from '../types.js';

declare const MARCA_DE_HIT: unique symbol;

/** Un tipo de la rueda como lo nombra el contrato del agente (`HIT_DE_GOLPE`). */
export type Hit = string & { readonly [MARCA_DE_HIT]: true };

/** Cómo se llama cada tipo de la rueda en el contrato. */
export const HIT_DE_GOLPE: Readonly<Record<TipoDeGolpe, Hit>> = {
  ofensivo: 'offensive' as Hit,
  fuerte: 'strong' as Hit,
  finta: 'feint' as Hit,
  defensivo: 'defensive' as Hit,
  rapido: 'quick' as Hit,
  romperGuardia: 'guard_break' as Hit,
  normal: 'normal' as Hit,
};

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
type Poder = Extract<BattleAction, { type: 'poder' }>;

/**
 * Una acción de batalla tal como la escribe el agente: la del núcleo, salvo el
 * golpe (`hit`, texto del contrato, sin la respuesta, que elige el otro) y el
 * poder (`power`, con el id del poder en `power`). Texto y no un `z.enum` en el
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
      return { type: 'poder', poder: a.power, target: a.target };
    default:
      return a;
  }
}

/**
 * Una acción del núcleo como la lee el agente (la lista legal): el poder, como
 * `power`; el golpe, sin lo elegido en la rueda (la lista no lo lleva: lo elige
 * él con `hit`). Lo demás, tal cual.
 */
export function accionAlAgente(a: BattleAction): AccionDeBatallaDelAgente {
  switch (a.type) {
    case 'attack': {
      const { golpe: _golpe, respuesta: _respuesta, ...resto } = a;
      return resto;
    }
    case 'poder':
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
