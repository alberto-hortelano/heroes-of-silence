/**
 * La puerta de «Fin de turno»: el botón y el Espacio pasan por aquí.
 *
 * La sesión ya rechaza un segundo `endTurn()` MIENTRAS juega el rival. Lo que no
 * cubría es el instante de después: el turno del rival se resuelve en unos
 * milisegundos, así que dos Espacios seguidos llegaban los dos con el turno ya
 * devuelto y pasaban dos días; quien quería pasar uno se encontraba en el día 3
 * sin haber visto el 2. Ahora, cuando vuelve el turno, hay una pausa en la que
 * «Fin de turno» se ignora: lo que dura el cambio de día.
 *
 * Vive fuera de `main.ts` porque `main.ts` toca el DOM al importarse y esto
 * tiene que tener test.
 */
import type { Session } from './session.js';

/** Lo que dura el cambio de día, en milisegundos: la pausa tras volver el turno. */
export const PAUSA_TRAS_EL_RIVAL = 600;

export class PuertaDeFinDeTurno {
  /** Cuándo volvió el turno a la persona por última vez. */
  private volvio = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly reloj: () => number,
    private readonly pausa = PAUSA_TRAS_EL_RIVAL,
  ) {}

  /**
   * ¿Se acepta ahora «Fin de turno»? No mientras no sea el turno de la persona
   * —incluido el del rival en curso—, ni con algo contándose en pantalla
   * (`animando`), ni durante la pausa del cambio de día.
   */
  abierta(s: Session, animando: boolean): boolean {
    if (!s.isPlayersTurn || s.scene !== 'adventure' || animando) return false;
    return this.reloj() - this.volvio >= this.pausa;
  }

  /**
   * Pasa el turno si la puerta está abierta; si no, no hace nada y devuelve
   * `false`. No escribe en la barra: un Espacio de más mientras cambia el día
   * no es un error de quien juega, y pisaría lo que la barra dice del día nuevo.
   *
   * Sin `confirmado`, si quedan héroes despiertos que pueden andar, no pasa:
   * deja la pregunta en pie (`Session.pedirFinDeTurno`, #17) y devuelve `false`.
   * Confirma el botón «Terminar el turno» de esa pregunta, o Intro. `alPasar`
   * corre justo antes de pasar, y solo si se pasa: la ruta pintada se borra al
   * pasar el turno, no al preguntar, que la persona puede querer seguirla.
   */
  async pasar(
    s: Session,
    animando: boolean,
    confirmado = false,
    alPasar: () => void = () => {},
  ): Promise<boolean> {
    if (!this.abierta(s, animando)) return false;
    if (!confirmado && !s.pedirFinDeTurno()) return false;
    alPasar();
    try {
      await s.endTurn();
    } finally {
      this.volvio = this.reloj();
    }
    return true;
  }
}
