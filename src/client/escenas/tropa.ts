/**
 * La escena de la tropa: el héroe elegido y los suyos en semicírculo, mirando a
 * la cámara. Pulsar a uno lo elige y el panel enseña su ficha y su equipo.
 *
 * La escena solo traduce el puntero: a quién se elige lo guarda la sesión
 * (`elegirEnLaTropa`), que es de donde lo leen el panel y la vista, y poner y
 * quitar van por los botones del panel a la sesión, como siempre. Lo único suyo
 * es a quién señala el ratón.
 */

import { playerColor } from '../render/palette.js';
import type { Tablero } from '../render/proyeccion.js';
import { camaraDeLaTropa, colocarLaTropa, vistaEnPasos } from '../render/tropa/arco.js';
import { type FiguraEnLaEscena, figuraBajo, pintarLaTropa } from '../render/tropa/pintar.js';
import { AYUDA_DE_LA_TROPA, type Session } from '../session.js';
import type { VistaDeLaTropa } from '../tropa/vista.js';

export class EscenaTropa {
  private lienzo = { ancho: 1, alto: 1 };
  private señalada: number | null = null;

  constructor(private readonly sesion: () => Session) {}

  encuadrar(ancho: number, alto: number): void {
    this.lienzo = { ancho, alto };
  }

  /** La cámara de ahora (la lee `pnpm capturas` para pulsar donde pinta la página). */
  camara(): Tablero {
    return camaraDeLaTropa(this.lienzo);
  }

  /** Las figuras de la vista, ya colocadas en el arco. */
  figuras(vista: VistaDeLaTropa): FiguraEnLaEscena[] {
    const en = colocarLaTropa(vista.figuras.length - 1, vistaEnPasos(this.lienzo));
    return vista.figuras.map((f, i) => ({
      id: f.id,
      nombre: f.nombre,
      cuerpo: f.cuerpo,
      en: en[i]!,
    }));
  }

  /**
   * Lo que `main.ts` escribe en `canvas.dataset.tropa`: el id de la figura
   * elegida, o vacío fuera de la escena. Es por donde esperan los tests del
   * navegador y `pnpm capturas`.
   */
  get marca(): string {
    const vista = this.sesion().vistaDeLaTropa();
    return vista === null ? '' : (vista.figuras[vista.elegida]?.id ?? '');
  }

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number, ahora: number): void {
    this.encuadrar(ancho, alto);
    const vista = this.sesion().vistaDeLaTropa();
    if (vista === null) return;
    const figuras = this.figuras(vista);
    pintarLaTropa(ctx, {
      lienzo: this.lienzo,
      t: this.camara(),
      figuras,
      elegida: vista.elegida,
      señalada: this.señalada !== null && this.señalada < figuras.length ? this.señalada : null,
      color: playerColor(vista.owner),
      ahora,
    });
  }

  private bajo(px: number, py: number): { vista: VistaDeLaTropa; i: number } | null {
    const vista = this.sesion().vistaDeLaTropa();
    if (vista === null) return null;
    const i = figuraBajo(this.camara(), this.figuras(vista), px, py);
    return i === null ? null : { vista, i };
  }

  /** El ratón encima: señala y dice en la barra a quién. Verdadero si hay a quién pulsar. */
  mover(px: number, py: number): boolean {
    const s = this.sesion();
    const b = this.bajo(px, py);
    this.señalada = b?.i ?? null;
    if (b === null) {
      if (s.scene === 'tropa') s.status = AYUDA_DE_LA_TROPA;
      return false;
    }
    const f = b.vista.figuras[b.i]!;
    s.status =
      b.i === b.vista.elegida
        ? `${f.nombre}: su ficha está en el panel.`
        : `${f.nombre}: pulsa para ver su ficha.`;
    return true;
  }

  salir(): void {
    this.señalada = null;
  }

  /** Un clic: elige a quien esté debajo. En el suelo no hace nada. */
  pulsar(px: number, py: number): void {
    const b = this.bajo(px, py);
    if (b === null) return;
    const f = b.vista.figuras[b.i]!;
    this.sesion().elegirEnLaTropa(f.quien);
    this.sesion().status = `${f.nombre}: su ficha está en el panel.`;
  }
}
