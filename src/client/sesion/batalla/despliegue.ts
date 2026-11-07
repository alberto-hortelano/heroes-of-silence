/**
 * El despliegue de la persona en pantalla (`DespliegueEnPantalla`), una pieza para la
 * partida, la arena y la tropa: a quién se coloca, dónde y «Listo»; las reglas son del
 * núcleo. Lo que la escena pide de quien coloca (`ColocacionEnPantalla`) se declara
 * aquí, con la pieza que lo cumple, y la escena (`batalla/colocar.ts`) lo lee. Eran
 * parte de `sesion/partida.ts` y de `batalla/colocar.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { stackById } from '@core/battle/consultas.js';
import {
  aplicarDespliegue,
  batallaALaVista,
  colocarBlocker,
  type DespliegueAhora,
  despliegueDe,
  enCasilla,
  suyoEn,
  TANDAS,
  zonaDe,
} from '@core/battle/despliegue.js';
import type { BattleStack, BattleState } from '@core/battle/types.js';
import type { Rng } from '@core/rng.js';
import type { Hex } from '@core/types.js';
import { AYUDA_DEL_DESPLIEGUE } from '../../comun/dichos.js';
import { comoFrase } from './control.js';

/** Lo que la escena necesita de quien coloca: `DespliegueEnPantalla` (la batalla y la formación de la tropa). */
export interface ColocacionEnPantalla {
  /** A quién se coloca ahora, o `null` si no hay nadie. */
  readonly elegido: BattleStack | null;
  /** Dónde puede salir el elegido, en el marco del tablero. */
  readonly zona: readonly Hex[];
  esColocable(id: string): boolean;
  elegir(id: string): void;
  colocarEn(at: Hex): void;
  /** Lo que haría colocar al elegido en `at`, o por qué no: para la barra. */
  dichoDeColocar(at: Hex): string;
}

/**
 * Lo que la pieza del despliegue necesita de quien la lleva: la batalla en que se
 * coloca, la barra, cómo se coloca y, si se cierra, cómo. La llevan la partida y
 * la arena (`enLaBatalla`: colocar y cerrar son `aplicarDespliegue`) y la tropa
 * (`Session.formacion`: colocar es `formar` por `run`, y no se cierra).
 */
interface DueñoDelDespliegue {
  /** La batalla en que se coloca, o `null` si no hay. */
  batalla(): BattleState | null;
  /**
   * ¿Se despliega ya? La arena, desde que empieza la pelea (`empezar`); sin él,
   * siempre. Quién despliega no lo decide el cliente: el núcleo solo se para en las
   * tandas de la persona (`BattleSide.despliegaAMano`), así que una tanda abierta
   * es suya.
   */
  enMarcha?(): boolean;
  barra(texto: string): void;
  /** Por qué no se coloca nada ahora aunque haya despliegue, ya como frase: en la tropa, el turno. */
  bloqueo?(): string | null;
  /** Pone a `stack` en `at`, ya juzgado por `colocarBlocker`; verdadero si se hizo (si no, ya lo dijo). */
  colocar(stack: BattleStack, at: Hex): boolean;
  /** Cierra la tanda abierta («Listo»); sin él no se cierra (la tropa: se guarda al colocar). */
  cerrar?(): void;
  /** Tras cerrar una tanda: si la batalla ya empezó, la IA juega lo suyo. */
  trasCerrar?(): void;
  /** Lo que se ve cambió (la partida sube su versión; la arena la deriva de `clave`). */
  alCambiar(): void;
  /**
   * Quién está elegido, si lo guarda quien lleva la pieza: la tropa, el de su
   * ficha (`elegidoEnLaTropa`), que eligen también los botones del panel. Sin él,
   * lo guarda la pieza, atado a la batalla en que se eligió.
   */
  readonly elegido?: {
    leer(b: BattleState): string;
    poner(id: string): void;
  };
  /** Lo que dice la barra al elegir a `nombre`. */
  dichoAlElegir?(nombre: string): string;
}

/** Lo que la pieza sabe del despliegue de ahora, calculado una vez por batalla, tanda y elegido. */
interface FotoDelDespliegue {
  readonly enCurso: DespliegueAhora | null;
  readonly elegido: BattleStack | null;
  readonly zona: readonly Hex[];
}

const SIN_FOTO: FotoDelDespliegue = { enCurso: null, elegido: null, zona: [] };

/**
 * El despliegue de la persona en pantalla (fase de despliegue, 02-11-2026), una
 * pieza para la partida, la arena y la tropa, como `ArmaDeLaActiva`: quién está
 * elegido, su zona, colocarlo en una casilla (o cambiarlo con quien la ocupe) y
 * «Listo». Las reglas son del núcleo (`colocarBlocker`, `aplicarDespliegue`,
 * `formar`): aquí solo se elige a quién, se escribe la barra y se pide lo que se ve
 * (`batallaALaVista`). Lo pintan y lo pulsan las escenas por
 * `batalla/colocar.ts`.
 */
export class DespliegueEnPantalla implements ColocacionEnPantalla {
  /** El elegido con el clic o su botón, atado a la batalla en que se eligió (sin `dueño.elegido`). */
  private elegidoId: { readonly battle: BattleState; readonly id: string } | null = null;
  /** La foto de ahora (`FotoDelDespliegue`), con lo que la decide. */
  private foto: {
    readonly battle: BattleState;
    readonly despliegue: BattleState['despliegue'];
    readonly enMarcha: boolean;
    readonly pedido: string | null;
    readonly valor: FotoDelDespliegue;
  } | null = null;
  /** Lo que se ve, guardado por batalla y tanda: colocar mueve stacks que la vista comparte. */
  private vista: {
    readonly battle: BattleState;
    readonly despliegue: BattleState['despliegue'];
    readonly valor: BattleState;
  } | null = null;

  constructor(private readonly dueño: DueñoDelDespliegue) {}

  /** El despliegue que hace la persona ahora, o `null` si no hay (o aún no ha empezado). */
  get enCurso(): DespliegueAhora | null {
    return this.ahora().enCurso;
  }

  /** A quién se coloca: el elegido, si sigue siendo colocable; si no, el primero de la tanda. */
  get elegido(): BattleStack | null {
    return this.ahora().elegido;
  }

  /** La zona de salida del elegido (`zonaDe`), en el marco del tablero; vacía sin despliegue. */
  get zona(): readonly Hex[] {
    return this.ahora().zona;
  }

  /** Lo que la arena mete en su versión: la tanda y el elegido (las casillas ya van en la firma). */
  get clave(): string {
    const { enCurso, elegido } = this.ahora();
    return enCurso === null ? '' : `${enCurso.tanda}:${elegido?.id ?? ''}`;
  }

  /** ¿Se coloca `id` en esta tanda? */
  esColocable(id: string): boolean {
    return this.enCurso?.colocables.includes(id) ?? false;
  }

  /**
   * Lo que de la batalla ve la persona (`batallaALaVista`): en el despliegue, desde
   * el bando de la tanda abierta, sin el rival que aún no ha desplegado; si no, la
   * batalla tal cual. Guardada por batalla y tanda: la escena la pide en cada
   * fotograma y en cada movimiento del ratón, y la del núcleo es una copia nueva
   * cada vez.
   */
  aLaVista(): BattleState | null {
    const b = this.dueño.batalla();
    if (b === null) return null;
    const d = b.despliegue;
    if (d === null || !this.enMarcha()) return b;
    const v = this.vista;
    if (v !== null && v.battle === b && v.despliegue === d) return v.valor;
    const valor = batallaALaVista(b, TANDAS[d.tanda]!.side);
    this.vista = { battle: b, despliegue: d, valor };
    return valor;
  }

  /** Elige a `id` para colocarlo, o dice en la barra por qué no (la frase del núcleo). */
  elegir(id: string): void {
    const b = this.dueño.batalla();
    const { enCurso, elegido } = this.ahora();
    if (b === null || enCurso === null) {
      this.dueño.barra(SIN_DESPLIEGUE);
      return;
    }
    const s = stackById(b, id);
    if (!enCurso.colocables.includes(id)) {
      this.dueño.barra(
        comoFrase(colocarBlocker(b, id, s.hex) ?? `${s.unit.name} no se coloca ahora`),
      );
      return;
    }
    if (elegido?.id === id) return;
    this.ponerElegido(b, id);
    this.dueño.barra(
      this.dueño.dichoAlElegir?.(s.unit.name) ??
        `${s.unit.name}: pulsa la casilla verde donde sale.`,
    );
    this.dueño.alCambiar();
  }

  /** Lo que haría colocar al elegido en `at`, para la barra: dónde saldría, con quién se cambia, o por qué no. */
  dichoDeColocar(at: Hex): string {
    const juicio = this.juzgar(at);
    if ('motivo' in juicio) return juicio.motivo;
    const { e, otro } = juicio;
    return otro === undefined
      ? `${e.unit.name} saldría en ${enCasilla(at)}.`
      : `${e.unit.name} y ${otro.unit.name} se cambiarían de sitio.`;
  }

  /** Coloca al elegido en `at` (o lo cambia con quien esté ahí), o dice en la barra por qué no. */
  colocarEn(at: Hex): void {
    const juicio = this.juzgar(at);
    if ('motivo' in juicio) {
      this.dueño.barra(juicio.motivo);
      return;
    }
    const { b, e, otro } = juicio;
    if (!this.dueño.colocar(e, { col: at.col, row: at.row })) return;
    // Sigue elegido el mismo: quien coloca a varios en fila no tiene que volver a elegirlo.
    if (this.dueño.elegido === undefined) this.elegidoId = { battle: b, id: e.id };
    this.dueño.barra(
      otro === undefined
        ? `${e.unit.name} sale en ${enCasilla(at)}.`
        : `${e.unit.name} y ${otro.unit.name} se cambian de sitio.`,
    );
    this.dueño.alCambiar();
  }

  /** Las flechas: el elegido a la casilla de al lado (`dc`, `df`); la juzga el núcleo como un clic. */
  mover(dc: number, df: number): void {
    const e = this.elegido;
    if (e === null) {
      this.dueño.barra(SIN_DESPLIEGUE);
      return;
    }
    this.colocarEn({ col: e.hex.col + dc, row: e.hex.row + df });
  }

  /** «Listo»: cierra la tanda de la persona; la siguiente, la de la IA o la ronda 1, siguen. */
  listo(): void {
    const cerrar = this.dueño.cerrar;
    if (cerrar === undefined) throw new Error('este despliegue no se cierra: se guarda al colocar');
    if (this.enCurso === null) {
      this.dueño.barra(SIN_DESPLIEGUE);
      return;
    }
    cerrar();
    this.elegidoId = null;
    // Con los dos bandos de la persona (la arena), el otro despliega ahora, ya
    // viendo al primero.
    this.dueño.barra(this.enCurso === null ? '¡A la batalla!' : AYUDA_DEL_DESPLIEGUE);
    this.dueño.trasCerrar?.();
    this.dueño.alCambiar();
  }

  /**
   * «Listo» en cada tanda que quede de la persona, sin tocar a nadie: la batalla
   * sale con la formación o la regla de hoy, como si se pulsara «Listo» hasta el
   * final. La única forma de aceptar el despliegue tal cual: la usan los tests y
   * `pnpm capturas`, que quieren la batalla ya empezada.
   */
  listoTalCual(): void {
    while (this.enCurso !== null) this.listo();
  }

  private enMarcha(): boolean {
    return this.dueño.enMarcha?.() ?? true;
  }

  /** Lo que se pidió elegir, sin juzgar si vale ahora. */
  private pedido(b: BattleState): string | null {
    const guardado = this.dueño.elegido;
    if (guardado !== undefined) return guardado.leer(b);
    const e = this.elegidoId;
    return e !== null && e.battle === b ? e.id : null;
  }

  private ponerElegido(b: BattleState, id: string): void {
    if (this.dueño.elegido !== undefined) this.dueño.elegido.poner(id);
    else this.elegidoId = { battle: b, id };
  }

  /**
   * La foto de ahora: se rehace solo si cambian la batalla, su tanda, si se
   * despliega ya o lo pedido. Colocar no la cambia: mueve el stack elegido, el
   * mismo objeto, y su zona no depende de dónde esté.
   */
  private ahora(): FotoDelDespliegue {
    const b = this.dueño.batalla();
    if (b === null) return SIN_FOTO;
    const enMarcha = this.enMarcha();
    const pedido = this.pedido(b);
    const f = this.foto;
    if (
      f !== null &&
      f.battle === b &&
      f.despliegue === b.despliegue &&
      f.enMarcha === enMarcha &&
      f.pedido === pedido
    ) {
      return f.valor;
    }
    const valor = fotoDelDespliegue(b, enMarcha, pedido);
    this.foto = { battle: b, despliegue: b.despliegue, enMarcha, pedido, valor };
    return valor;
  }

  /** El elegido en `at`: con quién se cambiaría, o el motivo para no poder, ya como frase. */
  private juzgar(
    at: Hex,
  ):
    | { readonly b: BattleState; readonly e: BattleStack; readonly otro: BattleStack | undefined }
    | { readonly motivo: string } {
    const b = this.dueño.batalla();
    const e = this.elegido;
    if (b === null || e === null) return { motivo: SIN_DESPLIEGUE };
    const bloqueo = this.dueño.bloqueo?.() ?? null;
    if (bloqueo !== null) return { motivo: bloqueo };
    const motivo = colocarBlocker(b, e.id, at);
    if (motivo !== null) return { motivo: comoFrase(motivo) };
    return { b, e, otro: suyoEn(b, e, at) };
  }
}

/** La foto de `b` (`DespliegueEnPantalla.ahora`): la tanda abierta, el elegido y su zona. */
function fotoDelDespliegue(
  b: BattleState,
  enMarcha: boolean,
  pedido: string | null,
): FotoDelDespliegue {
  const enCurso = !enMarcha || b.finished !== null ? null : despliegueDe(b);
  if (enCurso === null) return SIN_FOTO;
  const id =
    pedido !== null && enCurso.colocables.includes(pedido) ? pedido : enCurso.colocables[0];
  const elegido = id === undefined ? null : stackById(b, id);
  return { enCurso, elegido, zona: elegido === null ? [] : zonaDe(b, elegido.id) };
}

/**
 * El despliegue de una batalla en pantalla, la de la partida o la de la arena:
 * colocar y cerrar son `aplicarDespliegue` con el azar de la batalla (cerrar el
 * despliegue abre la ronda 1).
 */
export function enLaBatalla(o: {
  readonly batalla: () => BattleState | null;
  readonly enMarcha?: () => boolean;
  readonly barra: (texto: string) => void;
  readonly rng: () => Rng;
  readonly trasCerrar: () => void;
  readonly alCambiar: () => void;
}): DespliegueEnPantalla {
  const laBatalla = (): BattleState => {
    const b = o.batalla();
    if (b === null) throw new Error('no hay batalla en la que desplegar');
    return b;
  };
  return new DespliegueEnPantalla({
    ...o,
    colocar: (stack, at) => {
      aplicarDespliegue(laBatalla(), { type: 'colocar', stack: stack.id, at }, o.rng());
      return true;
    },
    cerrar: () => aplicarDespliegue(laBatalla(), { type: 'desplegado' }, o.rng()),
  });
}

/** La barra de quien pide colocar sin despliegue en curso. */
const SIN_DESPLIEGUE = 'Ahora no hay nadie tuyo que desplegar.';
