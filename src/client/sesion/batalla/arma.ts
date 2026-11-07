/**
 * El selector de arma de la activa (`ArmaDeLaActiva`: «Cuerpo a cuerpo» o «A
 * distancia») y el disparo diferido tal como los usa la persona, la misma pieza en la
 * partida y la arena; los botones que lo pintan, en `batalla/poderes.ts`. Era parte
 * de `sesion/partida.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import {
  aDistanciaBlocker,
  type TanteoADistancia,
  tanteoADistancia,
} from '@core/battle/a-distancia.js';
import { tiroADistanciaDe } from '@core/battle/armas.js';
import { armasDe } from '@core/battle/damage.js';
import type { BattleState } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import type { QuienJuega } from './apuntado.js';
import { comoFrase, motivoDeLaActiva, NINGUNA_TUYA, rechazoDelTanteo } from './control.js';

/**
 * Con qué arma juega la activa: el selector de arma (26-10-2026, petición del
 * usuario: «Un arquero no puede cargar, le sale la casilla de cargar pero solo
 * puede disparar. En lugar de apuntar como accion, que haya un selector de arma
 * para usar»). Solo lo lleva quien dispara (`isShooter`); quien no, pelea siempre
 * cuerpo a cuerpo. Con dos armas de cuerpo a cuerpo no se elige entre ellas: el
 * golpe ya va con lo mejor de cada una.
 */
export type ModoDelArma = 'cuerpo' | 'distancia';

/**
 * El selector de arma de la activa y el disparo diferido (25-10-2026, sin validar
 * por el usuario) tal como los usa la persona, el mismo en la partida y la arena.
 * **El modo es del cliente**, como lo apuntado: el núcleo no lo sabe, y el contrato
 * del agente tampoco (`attack` es cuerpo a cuerpo y `aim` a distancia: la jugada
 * ya lo dice). Lo que cambia es qué de la lista legal se ofrece (`delModo`): en
 * «A distancia», apuntar y nada de andar ni golpear; en «Cuerpo a cuerpo», andar,
 * cargar y golpear y nada de apuntar. Lo que marca el tablero y lo que hace el clic
 * salen de esa misma lista: antes el tablero marcaba andar y cargar a un arquero y
 * el clic en un enemigo solo apuntaba (`golpeEnPixel` prefería el `aim`).
 *
 * El tirador empieza su turno en «A distancia» si puede apuntar
 * (`aDistanciaBlocker`); si no (se ha movido, tiene a alguien encima), en «Cuerpo a
 * cuerpo». Lo elegido vale para ese turno de esa unidad: con otra activa, o con
 * otro turno de la misma, vuelve al de por defecto.
 *
 * En «A distancia» el clic en cualquier casilla apunta (lo juzga el núcleo al
 * aplicarlo: la lista legal trae solo las de los enemigos), con la recta que se
 * tantea al pasar el puntero (`tanteoADistancia`). Aquí no se decide nada.
 */
export class ArmaDeLaActiva {
  /** Lo elegido con el botón o la Q, atado al turno en que se eligió. */
  private elegido: {
    readonly battle: BattleState;
    readonly n: number;
    readonly stack: string;
    readonly modo: ModoDelArma;
  } | null = null;

  /** `alCambiar`: la partida sube su versión; la arena la deriva de `modo`. */
  constructor(
    private readonly dueño: QuienJuega,
    private readonly alCambiar: () => void = () => {},
  ) {}

  /** ¿Lleva selector la activa? Solo si es tuya y dispara o lanza granadas. */
  get conSelector(): boolean {
    const turno = this.dueño.turnoPropio;
    return turno !== null && tiroADistanciaDe(turno.stack.unit) !== null;
  }

  /** El modo de la activa ahora: el elegido en este turno o el de por defecto. */
  get modo(): ModoDelArma {
    const turno = this.dueño.turnoPropio;
    if (turno === null || tiroADistanciaDe(turno.stack.unit) === null) return 'cuerpo';
    // Sin poder apuntar (o lanzar), «A distancia» no deja hacer nada: manda el cuerpo a cuerpo.
    if (aDistanciaBlocker(turno.battle) !== null) return 'cuerpo';
    const e = this.elegido;
    const n = turno.battle.turno?.n;
    if (e !== null && e.battle === turno.battle && e.n === n && e.stack === turno.stack.id) {
      return e.modo;
    }
    return 'distancia';
  }

  /** Por qué la activa no puede pelear en `modo` ahora, o `null` si puede (el botón apagado). */
  motivo(modo: ModoDelArma): string | null {
    if (modo === 'cuerpo') return motivoDeLaActiva(this.dueño.turnoPropio, () => null);
    return motivoDeLaActiva(this.dueño.turnoPropio, (b) => aDistanciaBlocker(b));
  }

  /** El rótulo del botón: el modo y con qué armas («Cuerpo a cuerpo (Espada y Daga)»). */
  rotulo(modo: ModoDelArma): string {
    const turno = this.dueño.turnoPropio;
    const nombre = modo === 'cuerpo' ? 'Cuerpo a cuerpo' : 'A distancia';
    if (turno === null) return nombre;
    const uso = modo === 'cuerpo' ? 'arma' : 'distancia';
    const fila = armasDe(turno.stack.unit).find((f) => f.uso === uso && f.carga === null);
    return fila?.arma == null ? nombre : `${nombre} (${fila.arma})`;
  }

  /** Pasa a `modo`, o dice en la barra por qué no. */
  elegir(modo: ModoDelArma): void {
    const turno = this.dueño.turnoPropio;
    if (turno === null) {
      this.dueño.status = NINGUNA_TUYA;
      return;
    }
    const tiro = tiroADistanciaDe(turno.stack.unit);
    if (tiro === null) {
      this.dueño.status = comoFrase(`${turno.stack.unit.name} no lleva arma a distancia`);
      return;
    }
    const motivo = this.motivo(modo);
    if (motivo !== null) {
      this.dueño.status = motivo;
      return;
    }
    if (this.modo === modo) return;
    const n = turno.battle.turno?.n ?? 0;
    this.elegido = { battle: turno.battle, n, stack: turno.stack.id, modo };
    this.dueño.status =
      modo === 'cuerpo'
        ? 'Cuerpo a cuerpo: pulsa un hexágono verde para andar, o un enemigo para golpearlo.'
        : tiro === 'granada'
          ? 'Granada: pulsa la casilla a la que lanzarla, a su alcance; explota al empezar su siguiente turno en ella y en sus vecinas, también sobre los tuyos.'
          : 'A distancia: pulsa la casilla a la que apuntar; el disparo sale al empezar su siguiente turno y da al primero de la recta, también a un aliado.';
    this.alCambiar();
  }

  /** La Q: el otro modo. */
  alternar(): void {
    this.elegir(this.modo === 'cuerpo' ? 'distancia' : 'cuerpo');
  }

  /**
   * La jugada a distancia en `at` y lo que se vería con ella ahora, o por qué no
   * (`tanteoADistancia`: el núcleo elige entre apuntar y lanzar); `null` sin turno tuyo.
   */
  tanteo(at: Hex): TanteoADistancia | null {
    const turno = this.dueño.turnoPropio;
    return turno === null ? null : tanteoADistancia(turno.battle, at);
  }

  /** Apunta (o lanza) a `at`, o dice en la barra por qué no (la frase del núcleo). */
  apuntarA(at: Hex): void {
    const t = this.tanteo(at);
    if (t === null) {
      this.dueño.status = NINGUNA_TUYA;
      return;
    }
    if (t.kind === 'no') {
      this.dueño.status = rechazoDelTanteo(t);
      return;
    }
    this.dueño.playBattleAction(t.jugada);
  }
}
