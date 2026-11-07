/**
 * Lo que espera el siguiente clic en el tablero, uno solo (`LoApuntado`): el hechizo
 * del libro, el poder de la activa o el muro o la puerta de la muralla; y lo común a
 * los botones que lo apuntan (`unaOElegir`: con una jugada posible se juega ya, con
 * varias se espera el clic), con quien juega lo que piden (`QuienJuega`: la sesión de
 * la partida y la de la arena). Era parte de `sesion/partida.ts` hasta la fase C de
 * la reorganización (07-11-2026).
 */
import type { BattleAction, JugadaDeMuralla } from '@core/battle/types.js';
import type { Apuntado, TurnoPropio } from './control.js';
import type { LibroDeBatalla } from './libro.js';
import type { PoderesDeLaActiva } from './poderes.js';

/**
 * Lo que espera el siguiente clic en el tablero: lo apuntado sobre una unidad
 * (`Apuntado`: el hechizo o el poder) o la jugada de la muralla cuyo muro o puerta
 * se elige (`MurallaDeLaActiva`).
 */
type LoQueEspera = Apuntado | { readonly kind: 'muralla'; readonly id: JugadaDeMuralla };

/**
 * Lo que espera el siguiente clic en el tablero, **uno solo**: el hechizo del
 * libro, el poder de la activa (`Apuntado`) o el muro o la puerta de la muralla
 * (simplify de la fase 2 del puesto fronterizo: vivía aparte y Escape no lo
 * soltaba). Lo comparten el libro (`LibroDeBatalla`), los poderes
 * (`PoderesDeLaActiva`) y la muralla (`MurallaDeLaActiva`) de cada sesión: apuntar
 * uno suelta el otro sin que ninguno se lo diga al otro, y soltar lo que haya es
 * una función (`soltar`): tras una jugada, con Escape, al cerrar la batalla.
 */
export class LoApuntado {
  private valor: LoQueEspera | null = null;

  /** `alCambiar`: la partida sube su versión; la arena la deriva de aquí (`clave`). */
  constructor(private readonly alCambiar: () => void = () => {}) {}

  /** Lo apuntado sobre una unidad, el hechizo o el poder; la muralla no apunta a nadie. */
  get actual(): Apuntado | null {
    return this.valor === null || this.valor.kind === 'muralla' ? null : this.valor;
  }

  /** La jugada de la muralla que espera el clic en un muro o una puerta, o `null`. */
  get muralla(): JugadaDeMuralla | null {
    return this.valor?.kind === 'muralla' ? this.valor.id : null;
  }

  /** Lo que espera, dicho como clave: lo leen las cachés y la versión de la sesión. */
  get clave(): string {
    return this.valor === null ? '' : `${this.valor.kind}:${this.valor.id}`;
  }

  /** Apunta `a`, soltando lo que hubiera. */
  apuntar(a: LoQueEspera): void {
    if (this.valor?.kind === a.kind && this.valor.id === a.id) return;
    this.valor = a;
    this.alCambiar();
  }

  /** Suelta lo que espera si es de la clase `kind` (o lo que sea, sin ella); dice si soltó algo. */
  soltar(kind?: LoQueEspera['kind']): boolean {
    if (this.valor === null || (kind !== undefined && this.valor.kind !== kind)) return false;
    this.valor = null;
    this.alCambiar();
    return true;
  }

  /** El id apuntado de la clase `kind`, o `null`. */
  de(kind: Apuntado['kind']): string | null {
    return this.valor?.kind === kind ? this.valor.id : null;
  }
}

/** Por qué lo apuntado no vale sobre `targetId`: la frase del libro o la del poder. */
export function rechazoDeLoApuntado(
  hechizos: LibroDeBatalla,
  poderes: PoderesDeLaActiva,
  apuntado: Apuntado | null,
  targetId: string,
): string {
  if (apuntado === null) return '';
  return apuntado.kind === 'hechizo'
    ? hechizos.castRejection(targetId)
    : poderes.rechazo(apuntado.id, targetId);
}

/** Quien juega lo que piden los botones: la sesión de la partida y la de la arena. */
export interface QuienJuega {
  readonly turnoPropio: TurnoPropio | null;
  status: string;
  battleLegalActions(): readonly BattleAction[];
  playBattleAction(action: BattleAction): void;
}

/**
 * Lo común a los botones de escala, puerta y poder: con una sola jugada posible
 * (`posibles`), se juega ya; con varias, el siguiente clic en el tablero elige
 * (`esperar(true)` lo deja esperando y la barra dice `pide`), y pulsar el botón
 * otra vez lo cancela; con ninguna, el motivo del núcleo (`motivo`) o `ninguna`.
 */
export function unaOElegir(
  s: Pick<QuienJuega, 'status' | 'playBattleAction'>,
  posibles: readonly BattleAction[],
  o: {
    readonly esperando: boolean;
    readonly esperar: (si: boolean) => void;
    readonly motivo: () => string | null;
    readonly ninguna: string;
    readonly pide: string;
  },
): void {
  const unica = posibles.length === 1 ? posibles[0] : undefined;
  if (unica !== undefined) {
    o.esperar(false);
    s.playBattleAction(unica);
    return;
  }
  if (posibles.length === 0) {
    s.status = o.motivo() ?? o.ninguna;
    return;
  }
  const espera = !o.esperando;
  o.esperar(espera);
  s.status = espera ? o.pide : '';
}
