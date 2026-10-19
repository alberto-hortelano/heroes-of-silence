/**
 * Las figuras de los dos que se cruzan en la cabecera de la rueda: su lienzo y
 * quién lo anima. Comunes a la partida, la arena y el espectador (simplify de
 * F3-F6, 19-10-2026: hasta entonces solo la arena las ponía, desde su página);
 * lo que la arena añade —el botón de la ficha y la vista previa— lo pone su
 * `CaraDeLosContrincantes` alrededor de esta figura.
 */
import type { BattleStack } from '@core/battle/types.js';
import { FIGURA } from '../../shared/arte.js';
import type { Direccion } from '../direccion.js';
import { type Html, html } from '../html.js';
import { COLOR_BANDO } from '../render/batalla.js';
import {
  claveDelDibujo,
  colocarFigura,
  hayFigurasAnimadas,
  pintarFigura,
  pintarSombraDeFigura,
} from '../render/figura.js';
import { arteDe, MIRADA_DE_PRESENTACION } from '../render/personajes.js';

/** Lo que mide el lienzo de una figura de la cabecera, en píxeles. */
const TAMAÑO = { ancho: 80, alto: 96 } as const;

/**
 * El lienzo de la figura de `x` (`canvas.figura`), del color de su bando. Lo
 * anima `FigurasDeLaRueda`; decorativo: su nombre va al lado.
 */
export function figuraDelContrincante(x: Pick<BattleStack, 'body' | 'side'>): Html {
  return html`<canvas class="figura" data-figura="${x.body}" data-bando="${x.side}" width="${String(TAMAÑO.ancho)}" height="${String(TAMAÑO.alto)}" aria-hidden="true"></canvas>`;
}

/** Una figura recogida de la cabecera: su lienzo, su arte y su bando. */
interface FiguraDeLaCabecera {
  readonly lienzo: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly body: string;
  readonly atacante: boolean;
}

/**
 * Las figuras de la cabecera que se ve: las recoge el diálogo al pintar una cara
 * nueva (`recoger`), las suelta al cerrarse, y quien pinta los fotogramas las
 * anima (`animar`). Cada una respira en su sitio, mirando a la otra: la del
 * atacante, a la derecha; la del defensor, a la izquierda.
 */
export class FigurasDeLaRueda {
  private figuras: FiguraDeLaCabecera[] = [];
  /** Lo último que se pintó en cada lienzo (`claveDelDibujo`): lo que no cambia no se repinta. */
  private readonly pintado = new WeakMap<HTMLCanvasElement, string>();

  recoger(raiz: Element): void {
    this.figuras = [];
    for (const lienzo of raiz.querySelectorAll('canvas[data-figura]')) {
      if (!(lienzo instanceof HTMLCanvasElement)) continue;
      const ctx = lienzo.getContext('2d');
      if (ctx === null) continue;
      this.figuras.push({
        lienzo,
        ctx,
        body: lienzo.getAttribute('data-figura') as string,
        atacante: lienzo.getAttribute('data-bando') === 'attacker',
      });
    }
  }

  soltar(): void {
    this.figuras = [];
  }

  /** Pinta las que han cambiado; devuelve si hay que seguir animando. */
  animar(ahora: number): boolean {
    for (const { lienzo, ctx, body, atacante } of this.figuras) {
      const arte = arteDe(body);
      // Llena el 80 % del marco: `pintarFigura` escala contra un adulto.
      const alto = (lienzo.height * 0.8 * FIGURA.alturaAdulto) / arte.alturaPropia;
      const mira: Direccion = atacante ? MIRADA_DE_PRESENTACION : 'SO';
      const colocada = colocarFigura({
        id: `rueda-${body}-${atacante ? 'a' : 'd'}`,
        body,
        clip: 'idle',
        tiempo: ahora,
        x: lienzo.width / 2,
        suelo: lienzo.height - 8,
        alto,
        mira,
        color: COLOR_BANDO[atacante ? 'attacker' : 'defender'],
        rotulo: body.slice(0, 3),
      });
      const clave = claveDelDibujo(colocada);
      if (this.pintado.get(lienzo) === clave) continue;
      this.pintado.set(lienzo, clave);
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      pintarSombraDeFigura(ctx, colocada);
      pintarFigura(ctx, colocada);
    }
    return this.figuras.length > 0 && hayFigurasAnimadas();
  }
}
