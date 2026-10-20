/**
 * Una escena de figuras de pie que se eligen con el puntero: la de la tropa
 * (`escenas/tropa.ts`) y la de la morada (`escenas/morada.ts`) son dos
 * configuraciones de esta (`DePie`).
 *
 * La escena solo traduce el puntero: a quién se elige lo guarda la sesión, que es
 * de donde lo leen el panel y la vista, y lo demás va por los botones del panel a
 * la sesión, como siempre. Lo único suyo es a quién señala el ratón. Cómo se
 * colocan y se pintan las figuras es de `render/de-pie.ts` y del encuadre de cada
 * una.
 */
import type { PlayerId } from '@core/types.js';
import type { Plano } from '../../shared/base.js';
import {
  type CajaEn,
  type FiguraEnLaEscena,
  figuraBajo,
  type LienzoDePie,
  type PintadoDePie,
} from '../render/de-pie.js';
import { playerColor } from '../render/palette.js';
import type { Tablero } from '../render/proyeccion.js';
import type { Scene, Session } from '../session.js';

/** Lo que la escena lee de la vista que compone la sesión: quién sale y a quién se mira. */
export interface VistaDePie {
  /** Su color tiñe las figuras (`playerColor`). */
  readonly owner: PlayerId | null;
  readonly figuras: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly cuerpo: string;
  }[];
  /** El índice en `figuras` de la elegida. */
  readonly elegida: number;
}

/** Lo que la escena lee del encuadre: la cámara y dónde pisa cada figura, en el orden de la vista. */
export interface EncuadreDePie {
  readonly camara: Tablero;
  readonly en: readonly Plano[];
}

type Lienzo = LienzoDePie;

/** Lo que distingue a una escena de pie de otra. */
export interface DePie<V extends VistaDePie, E extends EncuadreDePie> {
  /** La escena de la sesión en que vive: fuera de ella, el ratón no escribe su ayuda. */
  readonly escena: Scene;
  /** Lo que dice la barra con el ratón sobre el suelo. */
  readonly ayuda: string;
  /** Lo que dice la barra, tras el nombre, con el ratón sobre la elegida y sobre otra. */
  readonly frases: { readonly elegida: string; readonly otra: string };
  vista(s: Session): V | null;
  encuadrar(lienzo: Lienzo, vista: V): E;
  caja(camara: Tablero): CajaEn;
  /** Lo que `main.ts` escribe en el lienzo para `pnpm capturas`: a quién se mira. */
  marca(vista: V): string;
  /** Elegir la figura `i` de la vista: lo guarda la sesión. */
  elegir(s: Session, vista: V, i: number): void;
  /** El fondo y, encima, las figuras (`pintarDePie`). */
  pintar(
    ctx: CanvasRenderingContext2D,
    v: {
      readonly lienzo: Lienzo;
      readonly vista: V;
      readonly encuadre: E;
      readonly pie: PintadoDePie;
    },
  ): void;
}

export class EscenaDePie<V extends VistaDePie, E extends EncuadreDePie> {
  private lienzo: Lienzo = { ancho: 1, alto: 1, densidad: 1 };
  private señalada: number | null = null;

  constructor(
    private readonly sesion: () => Session,
    private readonly de: DePie<V, E>,
  ) {}

  encuadrar(ancho: number, alto: number, densidad: number): void {
    this.lienzo = { ancho, alto, densidad };
  }

  /**
   * El encuadre de ahora para la vista: la cámara y dónde pisa cada uno (lo lee
   * también `pnpm capturas` para pulsar donde pinta la página).
   */
  encuadre(vista: V): E {
    return this.de.encuadrar(this.lienzo, vista);
  }

  /** Las figuras de la vista, ya colocadas. */
  figuras(vista: V, e: E = this.encuadre(vista)): FiguraEnLaEscena[] {
    return vista.figuras.map((f, i) => ({
      id: f.id,
      nombre: f.nombre,
      cuerpo: f.cuerpo,
      en: e.en[i]!,
    }));
  }

  /**
   * Lo que `main.ts` escribe en el `data-*` del lienzo de esta escena, o vacío
   * fuera de ella. Es por donde esperan los tests del navegador y `pnpm capturas`.
   */
  get marca(): string {
    const vista = this.de.vista(this.sesion());
    return vista === null ? '' : this.de.marca(vista);
  }

  dibujar(
    ctx: CanvasRenderingContext2D,
    ancho: number,
    alto: number,
    densidad: number,
    ahora: number,
  ): void {
    this.encuadrar(ancho, alto, densidad);
    const vista = this.de.vista(this.sesion());
    if (vista === null) return;
    const encuadre = this.encuadre(vista);
    const figuras = this.figuras(vista, encuadre);
    this.de.pintar(ctx, {
      lienzo: this.lienzo,
      vista,
      encuadre,
      pie: {
        caja: this.de.caja(encuadre.camara),
        figuras,
        elegida: vista.elegida,
        señalada: this.señalada !== null && this.señalada < figuras.length ? this.señalada : null,
        color: playerColor(vista.owner),
        ahora,
      },
    });
  }

  private bajo(px: number, py: number): { vista: V; i: number } | null {
    const vista = this.de.vista(this.sesion());
    if (vista === null) return null;
    const e = this.encuadre(vista);
    const i = figuraBajo(this.de.caja(e.camara), this.figuras(vista, e), px, py);
    return i === null ? null : { vista, i };
  }

  /** El ratón encima: señala y dice en la barra a quién. Verdadero si hay a quién pulsar. */
  mover(px: number, py: number): boolean {
    const s = this.sesion();
    const b = this.bajo(px, py);
    this.señalada = b?.i ?? null;
    if (b === null) {
      if (s.scene === this.de.escena) s.status = this.de.ayuda;
      return false;
    }
    const f = b.vista.figuras[b.i]!;
    s.status = `${f.nombre}: ${b.i === b.vista.elegida ? this.de.frases.elegida : this.de.frases.otra}`;
    return true;
  }

  salir(): void {
    this.señalada = null;
  }

  /** Un clic: elige a quien esté debajo. En el suelo no hace nada. */
  pulsar(px: number, py: number): void {
    const b = this.bajo(px, py);
    if (b === null) return;
    const s = this.sesion();
    this.de.elegir(s, b.vista, b.i);
    s.status = `${b.vista.figuras[b.i]!.nombre}: ${this.de.frases.elegida}`;
  }
}
