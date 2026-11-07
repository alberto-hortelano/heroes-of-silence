/**
 * Lo común de las piezas de la sesión de la partida (`sesion/partida/`, R6 de la
 * reorganización, 07-11-2026): lo que cada pieza lee de la sesión (`DueñoDeLasPiezas`), de
 * donde cada una toma lo suyo en su `Dueño…`, como el despliegue toma lo suyo en
 * `DueñoDelDespliegue` (`sesion/batalla/despliegue.ts`).
 *
 * Las piezas no importan la sesión (`sesion/partida.ts`), ni para un tipo: la sesión las
 * importa a ellas, y un tipo de vuelta ataría las dos carpetas en un ciclo
 * (`invariantes-capas`). Lo que comparten con ella se escribe aquí.
 *
 * **Todo por función**: las piezas nacen con los campos de la sesión, antes de que su
 * constructor ponga la partida y su azar, y la partida cambia (los tests ponen otra a
 * media prueba, `s.state = …`), así que una pieza que copiara algo al nacer lo tendría
 * sin poner o viejo.
 */
import type { GameContext, GameState } from '@core/state/tipos.js';
import type { Hero, PlayerId } from '@core/types.js';

/** Lo que las piezas leen de la sesión (`Session`), cada una con un `Pick` de lo suyo. */
export interface DueñoDeLasPiezas {
  /** La partida (`Session.state`). */
  estado(): GameState;
  /** Su azar (`Session.ctx`), el que reciben las acciones. */
  ctx(): GameContext;
  /** El jugador de la persona (`Session.viewer`). */
  viewer(): PlayerId;
  /** Algo que se ve ha cambiado: sube la versión (`Session.version`). */
  tocar(): void;
  /**
   * Una acción de la persona con la guarda delante (`Session.run`; por defecto,
   * `bloqueoDeTurno`): la barra dice el rechazo o se vacía, y sube la versión. Verdadero
   * si salió bien.
   */
  run(fn: () => void, bloqueo?: string | null): boolean;
  /** El héroe elegido (`Session.selectedHero`), o `null`. */
  heroeSeleccionado(): Hero | null;
  /** El id de la base abierta (`Session.openTownId`), o `null`. */
  idDeLaBaseAbierta(): string | null;
}
