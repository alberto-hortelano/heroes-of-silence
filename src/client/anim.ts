/**
 * Poses de las unidades durante la batalla.
 *
 * El motor no sabe nada de esto: resuelve la batalla de golpe y deja un
 * registro de eventos. Aquí se lee ese registro y se decide qué pose enseña
 * cada unidad y durante cuánto tiempo. Así la animación es puro adorno y el
 * juego sigue funcionando exactamente igual sin ella.
 */
import type { BattleEvent } from '@core/battle/types.js';

export type Pose = 'idle' | 'ready' | 'attack' | 'hit' | 'die' | 'win';

interface Activa {
  readonly pose: Pose;
  readonly hasta: number;
}

/** Cuánto dura cada pose en pantalla, en milisegundos. */
const DURACION: Readonly<Record<Pose, number>> = {
  idle: 0,
  ready: 700,
  attack: 550,
  hit: 450,
  die: 1200,
  win: 1500,
};

export class BattleAnimator {
  private readonly activas = new Map<string, Activa>();
  /** Cuántos eventos del registro se han mirado ya. */
  private leidos = 0;
  private ahora = (): number => performance.now();

  /** Reinicia el seguimiento: batalla nueva, registro nuevo. */
  reset(): void {
    this.activas.clear();
    this.leidos = 0;
  }

  /** Lee los eventos que aún no se habían visto y reparte poses. */
  observe(log: readonly BattleEvent[], muertos: ReadonlySet<string>): void {
    if (log.length < this.leidos) this.reset();

    for (let i = this.leidos; i < log.length; i++) {
      const e = log[i] as BattleEvent;
      switch (e.kind) {
        case 'attack':
          this.set(e.stack, 'attack');
          if (!muertos.has(e.target)) this.set(e.target, 'hit');
          break;
        case 'shoot':
          this.set(e.stack, 'attack');
          if (!muertos.has(e.target)) this.set(e.target, 'hit');
          break;
        case 'defend':
          this.set(e.stack, 'ready');
          break;
        case 'perished':
          this.set(e.stack, 'die');
          break;
        default:
          break;
      }
    }
    this.leidos = log.length;
  }

  private set(stack: string, pose: Pose): void {
    this.activas.set(stack, { pose, hasta: this.ahora() + DURACION[pose] });
  }

  /**
   * Pose que toca pintar, o `null` si esa unidad ya no se pinta.
   *
   * Una unidad aniquilada se sigue viendo mientras dura su pose de muerte y
   * desaparece después: si se borrara en el acto, el golpe que la mata no se
   * llegaría a ver nunca.
   */
  poseOf(stack: string, opciones: { muerto: boolean; defendiendo: boolean }): Pose | null {
    const activa = this.activas.get(stack);
    const viva = activa !== undefined && this.ahora() < activa.hasta;

    if (opciones.muerto) return viva && activa.pose === 'die' ? 'die' : null;
    if (viva) return activa.pose;
    return opciones.defendiendo ? 'ready' : 'idle';
  }

  /** ¿Queda alguna pose en marcha? Si sí, hay que seguir repintando. */
  get busy(): boolean {
    const t = this.ahora();
    for (const a of this.activas.values()) {
      if (t < a.hasta) return true;
    }
    return false;
  }
}
