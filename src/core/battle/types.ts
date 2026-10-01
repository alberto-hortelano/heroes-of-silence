import { nivelDeTropa } from '../hero/experiencia.js';
import type { Hex, UnitInfo, Veterania } from '../types.js';
import type { EffectKind, StackEffect } from './effects.js';

export type Side = 'attacker' | 'defender';

/**
 * Los dos bandos, para recorrerlos.
 *
 * Estaba escrito a mano en tres sitios —el motor, el director y la consulta de
 * batalla—, que es una lista de dos elementos hasta el día que alguien añada un
 * tercer bando y solo actualice dos.
 */
export const SIDES: readonly Side[] = ['attacker', 'defender'];

/** El bando de enfrente. Estaba escrito a mano en cuatro sitios. */
export function otroBando(side: Side): Side {
  return side === 'attacker' ? 'defender' : 'attacker';
}

/**
 * De dónde sale un stack del tablero, y por tanto sus cifras y lo que pasa con
 * él al acabar: una criatura del catálogo, un personaje de
 * `GameState.characters` o el héroe del bando.
 *
 * Es un discriminante y no dos campos opcionales (`member?`, `commander?`) más
 * una pregunta por la referencia del catálogo, porque así quien reparte por el
 * origen escribe un `switch` exhaustivo: el día que llegue un cuarto origen, el
 * que se lo deje no compila. Con los opcionales, un stack sin ninguno de los dos
 * era «del catálogo» por descarte, y eso es lo que un origen nuevo habría
 * heredado en silencio.
 */
export type OrigenDelStack =
  | {
      readonly kind: 'catalogo';
      /**
       * El oro de catálogo de UN individuo: lo que vale para la rendición. Va
       * aquí porque `unit` ya no es siempre la referencia del catálogo —la de
       * un veterano es una copia con sus cifras— y era la referencia la que
       * traía el precio.
       */
      readonly oro: number;
      /** La hoja con la que ENTRÓ, o `null` si es un novato. La de salida la escribe `settleBattle`. */
      readonly veterania: Veterania | null;
    }
  | { readonly kind: 'personaje'; readonly id: string; readonly veterania: Veterania | null }
  | { readonly kind: 'heroe' };

/** Lo que un stack ha ganado en esta batalla: lo apunta `herir`, lo cobra `settleBattle`. */
export interface Ganado {
  /** `PV quitados × nivel del que los recibe`, sumado golpe a golpe. */
  experiencia: number;
  /** Individuos enemigos que ha matado. */
  bajas: number;
  /** Los nombres de los héroes rivales que ha derribado. */
  heroes: string[];
}

/**
 * El personaje de `GameState.characters` que es este stack, o `null`. Con un
 * `switch` que devuelve: un origen nuevo no compila hasta que se decida si es
 * un personaje.
 */
export function personajeDe(origen: OrigenDelStack): string | null {
  switch (origen.kind) {
    case 'personaje':
      return origen.id;
    case 'catalogo':
    case 'heroe':
      return null;
  }
}

/**
 * El nivel de veteranía con el que entró este stack: 1 para un novato, un
 * monstruo y el héroe —que no es tropa: su nivel va en sus cifras—. Con un
 * `switch` que devuelve, como `personajeDe`.
 *
 * Tiene tres lectores —los galones de la figura, la fila de «En el campo» y el
 * `veteranLevel` del agente— y los tres preguntan lo mismo: el nivel, no la
 * hoja. Antes cada uno sacaba la hoja y la convertía por su cuenta.
 */
export function nivelDeVeterania(origen: OrigenDelStack): number {
  switch (origen.kind) {
    case 'catalogo':
    case 'personaje':
      return nivelDeTropa(origen.veterania);
    case 'heroe':
      return 1;
  }
}

/** Un stack dentro de una batalla. Mutable: el motor lo modifica en sitio. */
export interface BattleStack {
  readonly id: string;
  readonly side: Side;
  /** Puesto de origen en el ejército (su índice), para desempatar la iniciativa. */
  readonly slot: number;
  /**
   * El id del ARTE: qué sprite se pinta y qué id viaja al agente. No es de
   * donde salen las cifras —eso es `unit`—, y por eso dejó de llamarse
   * `creature`: el nombre invitaba a volver al catálogo con él, y para un
   * personaje eso es el centinela `CHARACTER_BODY`, que el catálogo no tiene.
   */
  readonly body: string;
  /**
   * Las cifras de combate, resueltas UNA vez en `createBattle`. Es la única
   * fuente: para una criatura es la misma referencia del catálogo, para un
   * personaje las de su perfil. Ninguna lectura de batalla vuelve a
   * `creature(...)`, y lo vigila `test/invariantes.test.ts`.
   */
  readonly unit: UnitInfo;
  /**
   * Criatura, personaje o héroe. El héroe (fase 1b) es uno por bando con héroe
   * y ninguno en un monstruo o una guarnición; si cae, su bando pierde aunque
   * le quede tropa (`checkFinished`).
   */
  readonly origen: OrigenDelStack;
  /**
   * Efectivos con los que ENTRÓ al tablero.
   *
   * Se escribe una vez y no se toca: es el minuendo de las bajas, que es lo
   * único que las cuenta. `count` solo baja —ningún hechizo resucita: `heal`
   * repone `topHp` y nada más (`spells.ts`)—, así que `initialCount - count`
   * son los muertos exactos. El día que exista resurrección, esa resta pasa a
   * ser un máximo y hará falta el `std::min` que el original ya escribe.
   */
  readonly initialCount: number;
  /** Efectivos vivos. 0 = destruido. */
  count: number;
  /** HP restante del efectivo de arriba; el resto están intactos. */
  topHp: number;
  /** Hex de cabeza. Las unidades grandes ocupan también el de detrás. */
  hex: Hex;
  shotsLeft: number;
  /** Ya contraatacó en esta ronda. */
  retaliated: boolean;
  defending: boolean;
  /** Pasó el turno con "esperar" y actuará al final de la ronda. */
  waited: boolean;
  /** Ya consumió su turno en esta ronda. */
  acted: boolean;
  /** Ya recibió un turno extra por moral alta en esta ronda. */
  gotMoraleBonus: boolean;
  /** Moral (héroe, diversidad de facción, edificios), ya recortada a [−3,+3]
   * al montar la batalla: quien la lee para tirar el dado no tiene que volver
   * a recortarla. Hoy nada la altera temporalmente; si algo lo hiciera, iría
   * en `effects` y se sumaría al leer, como la suerte — nunca escribiendo
   * aquí, que es el bug que cerró #9. */
  morale: number;
  /** Suerte BASE. Los hechizos y los rasgos no la tocan: lo suyo va en
   * `effects` y se suma al leer con `effectiveLuck`. */
  luck: number;
  /** Lo temporal: prisa, lentitud, maldición, miedo. Caduca en `beginRound`. */
  effects: StackEffect[];
  ganado: Ganado;
}

/**
 * El héroe que dirige un bando: su magia y si puede rendirse.
 *
 * Su cuerpo no va aquí: pisa el tablero como un stack más (`origen: heroe`), y
 * sus cifras viven en ese stack, que es donde las lee el motor. Desde la fase 1b
 * el héroe **no bonifica a su tropa** (decisión del usuario: «solo su cuerpo»):
 * lo que tenía de ataque y defensa es de su cuerpo (`heroUnit`), y por eso
 * `effectiveAttack`, `effectiveDefense` y el daño dejaron de recibirlo. Las
 * bonificaciones volverán como habilidades de cada tipo de héroe. Este es el
 * único sitio que lo cuenta.
 */
export interface BattleHero {
  readonly name: string;
  /**
   * Si puede rendirse, con cuánto oro cuenta para pagarlo; o por qué no puede.
   *
   * Lo monta quien conoce el mapa (`battleSideForHero`): el motor no sabe de
   * bases ni de monederos, y no tiene por qué. El oro no puede cambiar en plena
   * batalla —con una pendiente no se acepta ninguna acción de aventura—, así
   * que copiarlo al entrar no se queda viejo.
   */
  readonly retreat: { readonly purse: number } | { readonly blocked: string };
  readonly spellPower: number;
  readonly knowledge: number;
  mana: number;
  /** Ya lanzó su hechizo de esta ronda. */
  castThisRound: boolean;
  readonly spells: readonly string[];
}

export type BattleEvent =
  | { kind: 'round_start'; round: number }
  | { kind: 'move'; stack: string; to: Hex }
  | {
      kind: 'attack';
      stack: string;
      target: string;
      damage: number;
      killed: number;
      retaliation: boolean;
      charge?: number;
    }
  | {
      kind: 'shoot';
      stack: string;
      target: string;
      damage: number;
      killed: number;
      splash?: boolean;
    }
  | { kind: 'wait'; stack: string }
  | { kind: 'defend'; stack: string }
  | { kind: 'cast'; side: Side; spell: string; target?: string; damage?: number; killed?: number }
  | { kind: 'morale'; stack: string; good: boolean }
  | { kind: 'luck'; stack: string; good: boolean }
  | {
      kind: 'effect';
      stack: string;
      effect: EffectKind;
      amount: number;
      source: string;
      rounds: number;
    }
  | { kind: 'effect_end'; stack: string; source: string }
  | { kind: 'immune'; stack: string; source: string }
  | { kind: 'perished'; stack: string }
  /** Un bando se rinde: pierde, y lo que paga está en `finished.surrender`. */
  | { kind: 'surrender'; side: Side }
  | { kind: 'finished'; winner: Side };

/**
 * Cómo terminó una batalla. `surrender` está cuando la cerró una rendición, con
 * el oro que costó: **el precio se calcula una vez, al rendirse, y se lee de
 * aquí** —quien lo cobra en el mapa no vuelve a calcularlo—, así que el que se
 * anunció y el que se cobra no pueden ser dos. Quién se rindió no se guarda:
 * es siempre el que pierde.
 */
export interface BattleFinish {
  readonly winner: Side;
  readonly surrender?: { readonly gold: number };
}

export interface BattleState {
  round: number;
  stacks: BattleStack[];
  /** Ids en orden de iniciativa pendientes de actuar en esta ronda. */
  queue: string[];
  activeId: string | null;
  heroes: Record<Side, BattleHero | null>;
  log: BattleEvent[];
  finished: BattleFinish | null;
}

export type BattleAction =
  | { type: 'move'; to: Hex }
  /** Mueve (si hace falta) hasta `from` y golpea a `target`. */
  | { type: 'attack'; target: string; from?: Hex }
  | { type: 'shoot'; target: string }
  | { type: 'wait' }
  | { type: 'defend' }
  | { type: 'cast'; spell: string; target?: string }
  /**
   * El bando de la unidad activa se rinde (`surrenderBlocker` dice si puede).
   * `gold` es el precio: `legalActions` lo trae puesto, para que quien decide
   * sepa lo que paga ANTES de pagarlo. Quien la manda puede omitirlo; si lo
   * pone, tiene que ser el precio de ahora — un precio viejo se rechaza en vez
   * de cobrar otro sin decirlo.
   */
  | { type: 'surrender'; gold?: number };
