/**
 * Los modos de la arena: lo que una pelea de la arena puede jugar distinto del
 * juego y no es una regla de fheroes2 (`reglas.ts`). Son tres: cómo cae el golpe
 * cuerpo a cuerpo (la rueda, `rueda.ts`), si salir del contacto cuesta
 * (`contacto.ts`, #259) y si carga a pie todo el que pega cuerpo a cuerpo
 * (`carga.ts`, #260).
 *
 * Van juntos en `BattleState.arena`, que pone `crearBatallaConReglas` y no cambia:
 * el juego, el servidor, el agente y el banco pelean con `MODOS_DEL_JUEGO`, que
 * pone `createBattle`, y solo la arena enciende uno (lo vigila
 * `test/invariantes.test.ts`). Cada modo tiene una sola lectura en el motor
 * (`conRueda`, `pagaElContacto`, `cargaDelStack`).
 *
 * El golpe y el contacto llevan interruptor en la página y van en la URL
 * (`?golpe=rueda`, `?contacto=paga`): un descriptor por modo (`GOLPE`,
 * `CONTACTO`) y una sola lectura y escritura de la URL (`modoDeLaURL`,
 * `modoALaURL`). La carga a pie no tiene interruptor: la arena la juega siempre.
 */
import { MODOS_DEL_CONTACTO, type ModoDelContacto } from './contacto.js';
import { MODOS_DEL_GOLPE, type ModoDelGolpe } from './rueda.js';

/** Los modos de una pelea: uno por regla de la arena. */
export interface ModosDeArena {
  /** La tirada de siempre (`azar`) o la rueda del golpe (`rueda`). */
  readonly golpe: ModoDelGolpe;
  /** Salir de una casilla cuesta 1 (`libre`) o 1 + los enemigos en contacto (`paga`). */
  readonly contacto: ModoDelContacto;
  /** Si carga todo el que pega cuerpo a cuerpo, además del rasgo `charge`. */
  readonly cargaAPie: boolean;
}

/** Los del juego: ninguno encendido. Congelados, como `REGLAS_DEL_JUEGO`. */
export const MODOS_DEL_JUEGO: ModosDeArena = Object.freeze({
  golpe: 'azar',
  contacto: 'libre',
  cargaAPie: false,
});

/**
 * Los de la arena antes de los interruptores: como el juego, con la carga a pie
 * (#260, 14-10-2026: «todos los que pegan cuerpo a cuerpo, y el jinete más»).
 */
export const MODOS_DE_LA_ARENA: ModosDeArena = Object.freeze({
  ...MODOS_DEL_JUEGO,
  cargaAPie: true,
});

/** Los modos que llevan interruptor en la página y van en la URL. */
export type ClaveConInterruptor = 'golpe' | 'contacto';

/** Lo que la página puede conmutar: los modos con interruptor. */
export type ModosConInterruptor = Pick<ModosDeArena, ClaveConInterruptor>;

/**
 * Un modo con interruptor: el campo de `ModosDeArena`, el parámetro de la URL, los
 * valores que admite, el que no se escribe y cómo se nombra en un rechazo («no es
 * un modo del golpe»). Lo que se enseña en la página (rótulos y descripciones) es
 * del cliente (`renderModo`).
 */
export interface Interruptor<K extends ClaveConInterruptor = ClaveConInterruptor> {
  readonly clave: K;
  readonly parametro: string;
  readonly modos: readonly ModosDeArena[K][];
  readonly porDefecto: ModosDeArena[K];
  readonly nombre: string;
}

export const GOLPE: Interruptor<'golpe'> = Object.freeze({
  clave: 'golpe',
  parametro: 'golpe',
  modos: MODOS_DEL_GOLPE,
  porDefecto: MODOS_DEL_JUEGO.golpe,
  nombre: 'modo del golpe',
});

export const CONTACTO: Interruptor<'contacto'> = Object.freeze({
  clave: 'contacto',
  parametro: 'contacto',
  modos: MODOS_DEL_CONTACTO,
  porDefecto: MODOS_DEL_JUEGO.contacto,
  nombre: 'modo del contacto',
});

/** Los interruptores, en el orden en que se enseñan y se escriben en la URL. */
export const INTERRUPTORES: readonly (Interruptor<'golpe'> | Interruptor<'contacto'>)[] = [
  GOLPE,
  CONTACTO,
];

/**
 * El modo que pide la URL para el interruptor `d`. Ausente o vacío, el de por
 * defecto; lo que no es un modo se rechaza diciendo cuáles valen, como
 * `reglasDeLaURL`: un enlace copiado con una errata reproduciría otra pelea sin
 * decirlo. Lo leen la URL y los botones de la página, que traen el modo escrito.
 */
export function modoDeLaURL<K extends ClaveConInterruptor>(
  d: Interruptor<K>,
  texto: string | null,
): ModosDeArena[K] {
  if (texto === null || texto.trim() === '') return d.porDefecto;
  const modo = d.modos.find((m) => m === texto.trim());
  if (modo === undefined) {
    throw new Error(`«${texto}» no es un ${d.nombre}; valen ${d.modos.join(', ')}`);
  }
  return modo;
}

/** La inversa de `modoDeLaURL`: lo que va en la URL, o `''` con el de por defecto, que no se escribe. */
export function modoALaURL<K extends ClaveConInterruptor>(
  d: Interruptor<K>,
  modo: ModosDeArena[K],
): string {
  return modo === d.porDefecto ? '' : modo;
}

/** `modos` con el de `d` puesto a `modo`: lo que hacen la URL y el botón al conmutar. */
export function conModo<K extends ClaveConInterruptor>(
  modos: ModosConInterruptor,
  d: Interruptor<K>,
  modo: ModosDeArena[K],
): ModosConInterruptor {
  return { ...modos, [d.clave]: modo };
}
