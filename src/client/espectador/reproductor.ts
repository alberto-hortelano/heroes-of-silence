/**
 * El reproductor del espectador: el telón, el animador y qué batalla es cada
 * una, juntos y sin DOM. Puro, y por eso con tests.
 *
 * Las tres piezas vivían sueltas en `main.ts`, que toca `document` al
 * importarse, así que la forma en que se encadenaban —qué se le pasa al telón,
 * cuándo sube el número de batalla, cuándo se pinta el panel— no la probaba
 * nadie. Y era justo ahí donde estaba H-7: cada pieza hacía bien lo suyo y el
 * encadenado le daba al animador la batalla entera de golpe. Aquí se prueba el
 * encadenado con la misma clase que usa la página.
 */
import type { BattleState, Side } from '@core/battle/types.js';
import type { PlayerId } from '@core/types.js';
import type { SpectatorSnapshotMsg } from '../../server/protocol.js';
import { BattleAnimator } from '../anim.js';
import { adaptarBatalla } from './adaptar.js';
import {
  batallaTerminada,
  FINAL_VISIBLE_MS,
  mismaBatalla,
  ritmoDeReproduccion,
  TelonDeBatalla,
} from './telon.js';

const SIN_DUEÑOS: Readonly<Record<Side, PlayerId | null>> = { attacker: null, defender: null };

export class Reproductor {
  /** El mismo animador que el cliente que juega: lo lee el lienzo. */
  readonly animador = new BattleAnimator();
  private readonly telon: TelonDeBatalla<SpectatorSnapshotMsg>;
  private ultimo: SpectatorSnapshotMsg | null = null;
  private batallaActual: BattleState | null = null;
  /**
   * Qué batalla es, para el animador: sube cada vez que el fotograma trae una que
   * no es la de antes (`mismaBatalla`). Cada fotograma del cable trae la batalla
   * recién parseada, así que el objeto no sirve para saber si es la misma.
   */
  private numero = 0;

  constructor(minimo = FINAL_VISIBLE_MS) {
    this.telon = new TelonDeBatalla(batallaTerminada, minimo);
  }

  /** Llega un fotograma del cable; se pone cuando toque, no ahora. */
  llega(f: SpectatorSnapshotMsg): void {
    this.telon.llega(f);
  }

  /**
   * Un fotograma de pantalla: pone lo siguiente del cable si toca, ajusta el
   * ritmo al retraso y avanza el animador hasta `ahora`. Devuelve los fotogramas
   * del cable recién puestos, en orden; vacío si sigue el de antes.
   *
   * Normalmente es uno. Son varios cuando los primeros no traen nada que contar
   * —un fotograma de mapa, un `defend` que no mueve a nadie—: cada uno se pone
   * y el animador lo lee, y como no deja nada en su cola el siguiente entra en
   * el mismo fotograma de pantalla en vez de esperar al próximo. No es un salto:
   * el animador ve los registros uno detrás de otro, igual que si hubieran
   * llegado separados. Lo que se ahorra son 16 ms por fotograma vacío, que con
   * medio centenar en cola es casi un segundo de retraso.
   */
  paso(ahora: number): SpectatorSnapshotMsg[] {
    const puestos: SpectatorSnapshotMsg[] = [];
    // Primero se acaba lo que ya estaba contándose: si terminó en este instante,
    // lo siguiente entra ahora y no un fotograma de pantalla después.
    this.contar(ahora);
    for (;;) {
      const llegado = this.telon.avanzar(ahora, this.contando);
      if (llegado === null) break;
      const nueva = llegado.view.battle;
      if (nueva !== null && !mismaBatalla(this.ultimo?.view.battle?.estado ?? null, nueva.estado)) {
        this.numero++;
      }
      this.ultimo = llegado;
      this.batallaActual = nueva === null ? null : adaptarBatalla(nueva);
      puestos.push(llegado);
      // El ritmo se fija ANTES de que el animador lea el registro nuevo: cada
      // paso guarda su duración al empezar.
      this.animador.velocidad = ritmoDeReproduccion(this.telon.atrasados);
      this.contar(ahora);
    }
    this.animador.velocidad = ritmoDeReproduccion(this.telon.atrasados);
    return puestos;
  }

  private contar(ahora: number): void {
    if (this.batallaActual === null) return;
    this.animador.observe(this.batallaActual, this.numero);
    this.animador.tick(ahora);
  }

  /** La batalla que se ve, ya adaptada; `null` si se ve el mapa. */
  get batalla(): BattleState | null {
    return this.batallaActual;
  }

  /**
   * De quién es cada bando de la batalla que se ve, tal como viaja en el cable
   * (`battleOwners` en el servidor). Sin batalla, de nadie.
   */
  get dueños(): Readonly<Record<Side, PlayerId | null>> {
    return this.ultimo?.view.battle?.dueños ?? SIN_DUEÑOS;
  }

  /** El número de la batalla que se ve: cambia cuando empieza otra. */
  get numeroDeBatalla(): number {
    return this.numero;
  }

  /** Si el animador todavía cuenta lo que trajo el último fotograma. */
  get contando(): boolean {
    return this.batallaActual !== null && this.animador.busy;
  }

  /** Si queda algo en la cola: mientras sí, hay que seguir pidiendo fotogramas. */
  get pendiente(): boolean {
    return this.telon.pendiente;
  }

  /** Cuántos fotogramas del cable esperan detrás del que se ve. */
  get atrasados(): number {
    return this.telon.atrasados;
  }

  /**
   * Cuántas unidades muertas se están pintando todavía en pie. Al día —con el
   * animador quieto— tiene que ser 0: la caída de cada una ya se ha contado.
   */
  caidosEnPie(): number {
    const b = this.batallaActual;
    if (b === null) return 0;
    let n = 0;
    for (const s of b.stacks) {
      if (s.count <= 0 && this.animador.figura(s).visible) n++;
    }
    return n;
  }
}
