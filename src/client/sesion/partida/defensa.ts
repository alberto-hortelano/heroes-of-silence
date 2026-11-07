/**
 * La defensa de la persona en pantalla (`DefensaEnPantalla`): la batalla en que la atacan,
 * que se abre en la escena de la batalla y, con el héroe en un sitio suyo con guarnición,
 * pregunta antes de la primera jugada con quién defiende (D1 del puesto fronterizo). Lo que
 * hay, lo que pelea y por qué no más ni menos lo dice el núcleo (`defensaPorElegir`); aquí,
 * lo que se cambia hasta «Defender» y los nombres. Lo pinta `partida/guarnicion.ts` en
 * `<dialog id="defensa">`. Era parte de `Session` (`sesion/partida.ts`) hasta R6 de la
 * reorganización (07-11-2026); la sesión delega en ella.
 */
import { defensaPorElegir, elegirLaDefensa } from '@core/state/batallas.js';
import { type FilaDeLaDefensa, type LaDefensa, nombreDelSitio } from '@core/state/sitios.js';
import type { Hero } from '@core/types.js';
import { unidadDelJuego } from '@core/unidad/catalogo.js';
import { mensajeDe } from '../../comun/errores.js';
import { comoFrase } from '../batalla/control.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** La pantalla de la defensa (`Session.defensa`): la del núcleo, con los nombres. */
export interface VistaDeLaDefensa extends Omit<LaDefensa, 'filas'> {
  readonly hero: Hero;
  readonly sitio: string;
  readonly filas: readonly (FilaDeLaDefensa & { readonly nombre: string })[];
}

/** Lo que la pieza de la defensa lee de la sesión. */
interface DueñoDeLaDefensa
  extends Pick<DueñoDeLasPiezas, 'estado' | 'ctx' | 'viewer' | 'tocar' | 'barra' | 'irA'> {
  /** Si la batalla pendiente está desplegando la tanda de la persona (`SesionDeBatalla.despliegue`). */
  desplegando(): boolean;
  /** Que la IA mueva si la iniciativa es del rival (`Session.advanceEnemyTurns`). */
  queMuevaLaIA(): void;
}

export class DefensaEnPantalla {
  /**
   * Con cuántos de cada tipo defiende la persona, mientras elige (`<dialog
   * id="defensa">`), o `null` si no elige nada: solo lo que ha cambiado, sobre la
   * propuesta de la IA (la de `defensaDeLaIA`, ya repartida al nacer la batalla).
   */
  private elegida: Map<string, number> | null = null;

  constructor(private readonly dueño: DueñoDeLaDefensa) {}

  /**
   * La batalla de la defensa, en pantalla. Con el héroe en un sitio suyo con
   * guarnición, antes de la primera jugada se elige con quién defiende (D1 del
   * puesto fronterizo): la batalla empieza al confirmar (`confirmar`) o
   * al dejar la propuesta de la IA, y empieza desplegando (`empezar`).
   */
  abrir(): void {
    this.dueño.irA('battle');
    if (defensaPorElegir(this.dueño.estado(), this.dueño.viewer()) !== null) {
      this.elegida = new Map();
      this.dueño.barra('¡Te atacan! Elige con quién defiendes.');
      return;
    }
    this.dueño.barra(this.frase());
    // Si la iniciativa la tiene el rival, mueve él primero (tras el despliegue, al pulsar «Listo»).
    this.dueño.queMuevaLaIA();
  }

  /**
   * La pantalla de la defensa, o `null`: lo que hay, lo que pelea y por qué no
   * más ni menos, todo del núcleo (`defensaPorElegir`); aquí solo los nombres.
   */
  get vista(): VistaDeLaDefensa | null {
    const elegida = this.elegida;
    if (elegida === null) return null;
    const pedida = [...elegida].map(([creature, count]) => ({ creature, count }));
    const d = defensaPorElegir(this.dueño.estado(), this.dueño.viewer(), pedida);
    if (d === null) return null;
    return {
      ...d,
      sitio: nombreDelSitio(d.sitio),
      filas: d.filas.map((f) => ({ ...f, nombre: unidadDelJuego(f.creature).name })),
    };
  }

  /** Uno más (o uno menos) de `creature` en la defensa que se elige. */
  cambiar(creature: string, cambio: 1 | -1): void {
    const vista = this.vista;
    const fila = vista?.filas.find((f) => f.creature === creature);
    if (vista === null || fila === undefined) return;
    const motivo = cambio === 1 ? (fila.motivoMas ?? fila.notaMas) : fila.motivoMenos;
    if (motivo !== null) {
      this.dueño.barra(comoFrase(motivo));
      return;
    }
    this.elegida?.set(creature, fila.pelean + cambio);
    this.dueño.barra('');
    this.dueño.tocar();
  }

  /**
   * «Defender»: si la persona cambió la propuesta, el núcleo reparte y vuelve a
   * montar la batalla (`elegirLaDefensa`); con ella o sin cambios, empieza la
   * batalla (si la iniciativa es del rival, mueve él). Un rechazo se queda en la
   * pantalla con su motivo.
   */
  confirmar(): void {
    const vista = this.vista;
    if (vista === null) return;
    if (vista.motivo !== null) {
      this.dueño.barra(comoFrase(vista.motivo));
      return;
    }
    if (vista.filas.some((f) => f.pelean !== f.propuesta)) {
      try {
        elegirLaDefensa(
          this.dueño.estado(),
          this.dueño.ctx(),
          this.dueño.viewer(),
          vista.filas.map((f) => ({ creature: f.creature, count: f.pelean })),
        );
      } catch (err) {
        this.dueño.barra(comoFrase(mensajeDe(err)));
        return;
      }
    }
    this.empezar();
  }

  /**
   * Si la pantalla de la defensa está abierta: hasta cerrarla no se juega nada de
   * la batalla, y la barra lo dice. La compuerta de jugar y de «Resolver sola».
   */
  eligiendo(): boolean {
    if (this.elegida === null) return false;
    this.dueño.barra('Antes de nada, elige con quién defiendes.');
    return true;
  }

  /** Escape o «Como propone la IA»: se defiende con la propuesta, sin cambiarla. */
  dejarLaDeLaIA(): void {
    if (this.elegida === null) return;
    this.empezar();
  }

  /**
   * Cierra la pantalla de la defensa y empieza la batalla. Sin `alCambiarSinGesto`:
   * lo cierra un gesto (un clic o Escape), que ya pide fotograma, y quien espera
   * esa señal para saber que hay una defensa nueva (`pnpm capturas`) la tomaría por
   * otra.
   */
  private empezar(): void {
    this.elegida = null;
    this.dueño.barra(this.frase());
    this.dueño.queMuevaLaIA();
    this.dueño.tocar();
  }

  /**
   * Lo que dice la barra al empezar una defensa: la defensa empieza desplegando,
   * sin ver al rival (decisión del usuario, 02-11-2026: «el despliegue lo hace
   * primero el atacado, sin los enemigos»), también tras elegir con quién se
   * defiende, que vuelve a montar la batalla.
   */
  private frase(): string {
    return this.dueño.desplegando()
      ? '¡Te atacan! Despliega a los tuyos: aún no ves al enemigo. «Listo» empieza la batalla.'
      : '¡Te atacan! Defiéndete.';
  }
}
