/**
 * El lugar de un mundo en que está la persona (F1a del mapa vivo): cuál, con qué
 * héroe y, si habla con alguien, en qué nodo de la conversación va.
 *
 * Es estado del cliente y no del núcleo, como dónde está la figura en la base:
 * navegar por un árbol de diálogo no cambia la partida. Lo que sí la cambia —una
 * opción con efectos— sale por `aplicar`, que le da `Session`: la única puerta
 * al núcleo (`invariantes.test.ts`). Las preguntas (qué puntos están, qué
 * opciones valen y por qué no) son las del núcleo (`core/mundo/reglas.ts`).
 */
import { hojaDeUnidad } from '@core/catalogo.js';
import { figuraDelHeroe } from '@core/data.js';
import type { Lugar } from '@core/mundo/formato.js';
import {
  type Ante,
  anteDelLugar,
  inicioDe,
  nodoDe,
  type OpcionALaVista,
  opcionesDe,
  puntosDe,
} from '@core/mundo/reglas.js';
import type { AdventureAction, GameState } from '@core/state/game.js';
import type { FactionId, PlayerId } from '@core/types.js';

/** Un punto de interés como lo pinta la escena y lo lista el panel. */
export interface PuntoALaVista {
  readonly id: string;
  /** De 0 (izquierda) a 1 (derecha) en la escena. */
  readonly x: number;
  readonly nombre: string;
  /** El papel de una persona; `null`, una cosa. */
  readonly papel: string | null;
  /** La hoja con que se pinta una persona (`hojaDeUnidad` de su cuerpo); `null`, una cosa. */
  readonly cuerpo: string | null;
}

/** Lo que la escena y el panel leen del lugar abierto. */
export interface VistaDelLugar {
  readonly lugar: string;
  readonly nombre: string;
  /** El nombre de su estado de ahora. */
  readonly estado: string;
  /** La facción de la plaza que le sirve de fondo. */
  readonly fondo: FactionId;
  readonly owner: PlayerId;
  readonly puntos: readonly PuntoALaVista[];
  readonly caminante: { readonly id: string; readonly nombre: string; readonly cuerpo: string };
  /** Cuántas veces se ha abierto: otra apertura empieza a la izquierda y sin hablar con nadie. */
  readonly apertura: number;
}

/** La conversación abierta, como la pinta el diálogo. */
export interface VistaDeLaConversacion {
  readonly punto: string;
  readonly quien: string;
  readonly papel: string | null;
  readonly texto: string;
  readonly opciones: readonly OpcionALaVista[];
}

/** Lo que pasó al elegir una opción. */
export type TrasElegir = 'sigue' | 'cerrada' | 'batalla' | 'apagada';

export class EnElLugar {
  private abierto: { readonly lugar: string; readonly heroe: string } | null = null;
  private conversando: { readonly punto: string; nodo: string } | null = null;
  private aperturas = 0;

  constructor(
    private readonly estado: () => GameState,
    /** Aplica una acción del núcleo; `false` si la rechazó (el motivo ya está en la barra). */
    private readonly aplicar: (a: AdventureAction) => boolean,
    /** Avisa de que algo que se ve ha cambiado (sube la versión de la sesión). */
    private readonly tocar: () => void,
  ) {}

  /** El id del lugar abierto, o `null`. */
  get lugar(): string | null {
    return this.abierto?.lugar ?? null;
  }

  /** Si se está hablando con alguien. */
  get hablando(): string | null {
    return this.conversando?.punto ?? null;
  }

  abrir(lugar: string, heroe: string): void {
    this.abierto = { lugar, heroe };
    this.conversando = null;
    this.aperturas++;
    this.tocar();
  }

  /** Vuelve a la escena del lugar sin empezar de nuevo (tras una batalla). */
  volver(lugar: string, heroe: string): void {
    this.abierto = { lugar, heroe };
    this.conversando = null;
    this.tocar();
  }

  cerrar(): void {
    this.abierto = null;
    this.conversando = null;
    this.tocar();
  }

  private ante(): Ante | null {
    if (this.abierto === null) return null;
    const a = anteDelLugar(this.estado(), this.abierto.heroe, this.abierto.lugar);
    return 'motivo' in a ? null : a;
  }

  vista(): VistaDelLugar | null {
    const a = this.ante();
    if (a === null) return null;
    const l: Lugar = a.lugar;
    return {
      lugar: l.id,
      nombre: l.nombre,
      estado: l.estados[a.mundo.estados[l.id] ?? ''] ?? '',
      fondo: l.fondo.plaza,
      owner: a.hero.owner,
      puntos: puntosDe(a).map((p) => ({
        id: p.id,
        x: p.x,
        nombre: p.persona?.nombre ?? p.cosa?.nombre ?? p.id,
        papel: p.persona?.papel ?? null,
        cuerpo: p.persona === undefined ? null : hojaDeUnidad(p.persona.cuerpo),
      })),
      caminante: { id: a.hero.id, nombre: a.hero.name, cuerpo: figuraDelHeroe(a.hero) },
      apertura: this.aperturas,
    };
  }

  /** Empieza a hablar con un punto (o a mirar una cosa): su nodo de inicio. */
  hablar(punto: string): void {
    const a = this.ante();
    const p = a === null ? undefined : puntosDe(a).find((x) => x.id === punto);
    if (a === null || p === undefined) return;
    this.conversando = { punto, nodo: inicioDe(a, p) };
    this.tocar();
  }

  dejarDeHablar(): void {
    if (this.conversando === null) return;
    this.conversando = null;
    this.tocar();
  }

  conversacion(): VistaDeLaConversacion | null {
    const a = this.ante();
    const c = this.conversando;
    if (a === null || c === null) return null;
    // El punto puede haber dejado de estar (Corvo, pagado el peaje): la
    // conversación sigue hasta que se cierre.
    const p = a.lugar.puntos.find((x) => x.id === c.punto);
    if (p === undefined) return null;
    return {
      punto: p.id,
      quien: p.persona?.nombre ?? p.cosa?.nombre ?? p.id,
      papel: p.persona?.papel ?? null,
      texto: nodoDe(a, p, c.nodo).texto,
      opciones: opcionesDe(a, p, c.nodo),
    };
  }

  /**
   * Elige la opción `i` del nodo de ahora: si hace algo, lo aplica el núcleo; luego
   * va a su nodo o cierra. Una apagada no hace nada (su motivo ya se lee debajo).
   */
  elegir(i: number): TrasElegir {
    const a = this.ante();
    const c = this.conversando;
    if (a === null || c === null || this.abierto === null) return 'cerrada';
    const p = a.lugar.puntos.find((x) => x.id === c.punto);
    if (p === undefined) return 'cerrada';
    const op = opcionesDe(a, p, c.nodo)[i];
    if (op === undefined) throw new Error(`el nodo ${c.nodo} no tiene la opción ${i}`);
    if (op.motivo !== null) return 'apagada';
    if (op.hace) {
      const hecho = this.aplicar({
        type: 'elegir_en_lugar',
        hero: this.abierto.heroe,
        lugar: this.abierto.lugar,
        punto: c.punto,
        nodo: c.nodo,
        opcion: i,
      });
      if (!hecho) return 'apagada';
      if (this.estado().pendingBattle !== null) {
        this.conversando = null;
        this.tocar();
        return 'batalla';
      }
    }
    if (op.ir === null) {
      this.conversando = null;
      this.tocar();
      return 'cerrada';
    }
    c.nodo = op.ir;
    this.tocar();
    return 'sigue';
  }
}
