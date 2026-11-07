/**
 * La escena de la tropa: el tablero de despliegue con el héroe y los suyos en su
 * formación (02-11-2026, «la vista de tropa pasa a ser la de despliegue»). Se ve
 * y se maneja como el despliegue de una batalla, solo con lo propio: el mismo
 * pintado (`tableroAlColocar`) y el mismo clic (`clicAlColocar`) de
 * `batalla/colocar.ts`, sobre la batalla de la formación
 * (`VistaDeLaTropa.batalla`), y quién está bajo el puntero, también de allí.
 * Pulsar a uno lo elige —su ficha y su equipo, en el panel—; pulsar una casilla
 * verde lo pone ahí, o lo cambia con quien salga en ella (`Session.formacion`, el
 * mismo `DespliegueEnPantalla` de la batalla, que juega `formar`).
 *
 * Solo traduce el puntero: lo que vale lo dice el núcleo por la sesión, y lo que
 * pinta lo compone la sesión (`vistaDeLaTropa`).
 */
import type { BattleState } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { BattleAnimator } from '../../batalla/anim.js';
import {
  type ClicAlColocar,
  clicAlColocar,
  pulsarAlColocar,
  señalarAlColocar,
  type TableroBajoElPuntero,
  tableroAlColocar,
} from '../../batalla/colocar.js';
import { AYUDA_DE_LA_TROPA } from '../../comun/dichos.js';
import { type CajaDeFigura, cajaDeFigura, drawBatalla } from '../../render/batalla.js';
import { enPantalla, planoDeHex, type Tablero, tableroPara } from '../../render/proyeccion.js';
import type { Session } from '../../sesion/partida.js';

const NINGUN_BANDO: ReadonlySet<never> = new Set();

export class EscenaTropa {
  /**
   * Las figuras del tablero, con su compás y su reposo: las de la batalla. No
   * cuenta nada (la formación no tiene registro); en el despliegue, el animador
   * pone a cada uno en su casilla al observarla.
   */
  private readonly animador = new BattleAnimator();
  private tablero: Tablero = tableroPara(1, 1);
  private hoverHex: Hex | null = null;
  private hoverStack: string | null = null;
  private puntero: { x: number; y: number } | null = null;
  /**
   * La identidad de las figuras para el animador, rehecha solo cuando cambia la
   * batalla de la formación (`Session` la guarda por versión y héroe).
   */
  private identidad: { readonly batalla: BattleState; readonly clave: string } | null = null;

  constructor(private readonly sesion: () => Session) {}

  /**
   * Lo que `main.ts` escribe en `canvas[data-tropa]`, o vacío fuera de la escena:
   * el stack del elegido en la formación (`stackDelPortador`).
   */
  get marca(): string {
    return this.sesion().formacion.elegido?.id ?? '';
  }

  /** El tablero en un lienzo de `ancho × alto`: el de la batalla, sin muralla. */
  encuadrar(ancho: number, alto: number): void {
    this.tablero = tableroPara(ancho, alto);
  }

  dibujar(
    ctx: CanvasRenderingContext2D,
    ancho: number,
    alto: number,
    _densidad: number,
    ahora: number,
  ): void {
    this.encuadrar(ancho, alto);
    const vista = this.sesion().vistaDeLaTropa();
    if (vista === null) return;
    const b = vista.batalla;
    this.alDia(vista.heroId, b, ahora);
    drawBatalla(
      ctx,
      tableroAlColocar(this.sesion().formacion, {
        battle: b,
        tablero: this.tablero,
        ancho,
        alto,
        hoverHex: this.hoverHex,
        hoverStack: this.hoverStack,
        puntero: this.puntero,
        figura: (st) => this.animador.figura(st),
        efectos: this.animador.efectos(b),
        ...this.animador.aDistancia(b),
        // La tropa es de quien juega: nada en gris.
        sinDueño: NINGUN_BANDO,
        clima: { sitio: vista.clima, ahora },
      }),
    );
  }

  /**
   * El animador, en hora con la formación de ahora: la batalla de la formación
   * es otra en cada versión, pero las figuras son las mismas mientras sea el mismo
   * héroe con los mismos (`identidad`), y no vuelven a nacer a cada colocación.
   */
  private alDia(heroId: string, b: BattleState, ahora: number): void {
    if (this.identidad === null || this.identidad.batalla !== b) {
      this.identidad = { batalla: b, clave: `${heroId}|${b.stacks.map((s) => s.id).join(',')}` };
    }
    this.animador.observe(b, this.identidad.clave);
    this.animador.tick(ahora);
  }

  /** El ratón encima: señala y dice en la barra lo que haría el clic. Verdadero si haría algo. */
  mover(px: number, py: number): boolean {
    this.puntero = { x: px, y: py };
    const s = this.sesion();
    const t = this.bajoElPuntero();
    if (t === null) return false;
    const señal = señalarAlColocar(s.formacion, t, px, py);
    this.hoverHex = señal.hoverHex;
    this.hoverStack = señal.hoverStack;
    s.status = señal.dicho ?? AYUDA_DE_LA_TROPA;
    return señal.clic.kind !== 'nada';
  }

  salir(): void {
    this.hoverHex = null;
    this.hoverStack = null;
    this.puntero = null;
  }

  /** Un clic: elige a uno de los suyos o coloca al elegido. Verdadero si hizo algo. */
  pulsar(px: number, py: number): boolean {
    const clic = this.clicEn(px, py);
    if (clic === null || clic.kind === 'nada') return false;
    pulsarAlColocar(this.sesion().formacion, clic);
    return true;
  }

  /**
   * Dónde se pinta el centro de la casilla `hex` en el lienzo encuadrado: lo lee
   * `pnpm capturas` para pulsar donde pulsaría la persona.
   */
  centroDe(hex: Hex): { readonly x: number; readonly y: number } {
    return enPantalla(this.tablero, planoDeHex(hex));
  }

  /** La caja de la figura del stack `id` de la formación (para `pnpm capturas`), o `null`. */
  cajaDe(id: string): CajaDeFigura | null {
    const st = this.sesion()
      .vistaDeLaTropa()
      ?.batalla.stacks.find((x) => x.id === id);
    return st === undefined ? null : cajaDeFigura(this.tablero, this.animador.figura(st).en);
  }

  /**
   * Qué haría un clic ahí (`clicAlColocar`, el del despliegue), o `null` fuera de
   * la escena. Lo lee también `pnpm capturas`, para pulsar el cuerpo de una
   * figura donde la escena lo lee como elegirla (el centro de una casilla verde
   * gana a la figura que lo tapa).
   */
  clicEn(px: number, py: number): ClicAlColocar | null {
    const t = this.bajoElPuntero();
    return t === null ? null : clicAlColocar(this.sesion().formacion, t, px, py);
  }

  /** El tablero bajo el puntero (`batalla/colocar.ts`, el de la batalla), o `null` fuera de la escena. */
  private bajoElPuntero(): TableroBajoElPuntero | null {
    const vista = this.sesion().vistaDeLaTropa();
    if (vista === null) return null;
    return {
      battle: vista.batalla,
      tablero: this.tablero,
      figura: (st) => this.animador.figura(st),
    };
  }
}
