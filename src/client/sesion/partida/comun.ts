/**
 * Lo común de las piezas de la sesión de la partida (`sesion/partida/`, R6 de la
 * reorganización, 07-11-2026): lo que cada pieza lee de la sesión (`DueñoDeLasPiezas`), de
 * donde cada una toma lo suyo en su `Dueño…`, como el despliegue toma lo suyo en
 * `DueñoDelDespliegue` (`sesion/batalla/despliegue.ts`).
 *
 * Las piezas no importan la sesión (`sesion/partida.ts`), ni para un tipo: la sesión las
 * importa a ellas, y un tipo de vuelta ataría las dos carpetas en un ciclo
 * (`invariantes-capas`). Lo que comparten con ella se escribe aquí: la escena en que se
 * está (`Scene`, que era de `sesion/partida.ts`).
 *
 * **Todo por función**: las piezas nacen con los campos de la sesión, antes de que su
 * constructor ponga la partida y su azar, y la partida cambia (los tests ponen otra a
 * media prueba, `s.state = …`), así que una pieza que copiara algo al nacer lo tendría
 * sin poner o viejo.
 */
import type { Desenlace } from '@core/state/desenlace.js';
import type { GameContext, GameState, Player } from '@core/state/tipos.js';
import type { Town } from '@core/town/town.js';
import type { Hero, PlayerId, Point } from '@core/types.js';

/** La escena en que se está (`Session.scene`). */
export type Scene = 'adventure' | 'town' | 'battle' | 'tropa' | 'morada' | 'ayuntamiento' | 'lugar';

/** Lo que las piezas leen de la sesión (`Session`), cada una con un `Pick` de lo suyo. */
export interface DueñoDeLasPiezas {
  /** La partida (`Session.state`). */
  estado(): GameState;
  /** Su azar (`Session.ctx`), el que reciben las acciones. */
  ctx(): GameContext;
  /** El jugador de la persona (`Session.viewer`). */
  viewer(): PlayerId;
  /**
   * Cuántas veces ha cambiado algo que se ve (`Session.version`): con ella se guardan las vistas.
   */
  version(): number;
  /** Algo que se ve ha cambiado: sube la versión. */
  tocar(): void;
  /** Escribe la barra de estado (`Session.status`), que no sube la versión. */
  barra(texto: string): void;
  /** La escena en que se está. */
  escena(): Scene;
  /** Pasa a la escena `escena` (sube la versión). */
  irA(escena: Scene): void;
  /**
   * Una acción de la persona con la guarda delante (`Session.run`; por defecto,
   * `bloqueoDeTurno`): la barra dice el rechazo o se vacía, y sube la versión. Verdadero
   * si salió bien.
   */
  run(fn: () => void, bloqueo?: string | null): boolean;
  /**
   * Por qué no es el turno de la persona (`Session.turnoAjeno`, la frase del núcleo), o
   * `null`: la guarda de contratar, que con el héroe de salida pendiente es lo que se hace.
   */
  turnoAjeno(): string | null;
  /**
   * Por qué no se puede jugar ahora (`Session.bloqueoDeTurno`: el turno y el héroe de
   * salida por elegir), o `null`: la compuerta de toda acción de la persona.
   */
  bloqueoDeTurno(): string | null;
  /** El oro de la persona (`Session.oro`). */
  oro(): number;
  /** El jugador de la persona (`Session.jugador`): su oro y su niebla. */
  jugador(): Player;
  /** Los héroes de la persona (`Session.myHeroes`). */
  misHeroes(): readonly Hero[];
  /** Cómo acabó la partida para quien mira (`Session.desenlace`), o `null` si sigue viva. */
  desenlace(): Desenlace | null;
  /** El héroe elegido (`Session.selectedHero`), o `null`. */
  heroeSeleccionado(): Hero | null;
  /** Elige al héroe `id` (`Session.selectedHeroId`: suelta la pieza elegida y sube la versión). */
  seleccionarHeroe(id: string | null): void;
  /** El id de la base abierta (`Session.openTownId`), o `null`. */
  idDeLaBaseAbierta(): string | null;
  /** La base abierta (`Session.activeTown`), o `null`. */
  baseAbierta(): Town | null;
}

/** Si `a` y `b` son la misma casilla: el clic en el mapa, la llegada de una marcha y andar. */
export function sameTile(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
