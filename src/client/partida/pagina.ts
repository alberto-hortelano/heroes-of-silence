/**
 * La página de la partida, para las piezas que la montan (R7 de la reorganización,
 * 07-11-2026): los elementos que se buscan al cargarla, las escenas de dentro, lo que la
 * página cambia mientras vive y la página entera (`PaginaDeLaPartida`). `main.ts` lo construye
 * todo en el orden de siempre y cada pieza de `partida/` recibe lo que lee de ello.
 */
import type { EscenaBatalla } from '../batalla/escena.js';
import type { GestosDeBatalla } from '../batalla/gestos.js';
import type { DialogoDeLaRueda } from '../batalla/rueda/dialogo.js';
import type { Desarrollo } from '../desarrollo/tipos.js';
import type { ajustarLienzo } from '../render/lienzo.js';
import type { Session } from '../sesion/partida.js';
import { EscenaAyuntamiento } from './ayuntamiento/escena.js';
import type { EscenaBase } from './base/escena.js';
import type { PuertaDeFinDeTurno } from './fin-de-turno.js';
import type { EscenaLugar } from './lugar/escena.js';
import type { EscenaAventura } from './mapa/escena.js';
import { EscenaMorada } from './morada/escena.js';
import { EscenaTropa } from './tropa/escena.js';

/** Los elementos de la página (`index.html`) que se buscan al cargarla. */
export interface ElementosDeLaPartida {
  readonly app: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly lienzo: HTMLElement;
  readonly minimapa: HTMLCanvasElement;
  readonly elDay: HTMLElement;
  readonly elResources: HTMLElement;
  readonly elTurn: HTMLElement;
  readonly elSide: HTMLElement;
  readonly elStatus: HTMLElement;
  readonly elActions: HTMLElement;
  readonly elSeed: HTMLElement;
  readonly haciaEnemigo: HTMLElement;
  readonly conversacion: HTMLDialogElement;
  /**
   * La rueda del golpe (`batalla/rueda/dialogo.ts`): modal sobre el lienzo, mientras se elige y
   * se cuenta un cruce.
   */
  readonly elRueda: HTMLDialogElement;
  /**
   * «¿Volver al menú?» (botón «Menú» de la barra de arriba): «Abandonar la partida» es el
   * `restart`.
   */
  readonly salirAlMenu: HTMLDialogElement;
  /** Dejar y recoger tropa en un sitio propio (`partida/guarnicion.ts`). */
  readonly elGuarnicion: HTMLDialogElement;
  /** Con quién se defiende el héroe atacado en su sitio (`partida/guarnicion.ts`). */
  readonly elDefensa: HTMLDialogElement;
  /** Quién te ataca y dónde, sobre el mapa, antes de la batalla (`partida/aviso.ts`). */
  readonly elAviso: HTMLDialogElement;
  readonly stage: HTMLElement;
  readonly lateral: HTMLElement;
}

/** Busca los elementos de la página, uno a uno y en el orden de siempre. */
export function elementosDeLaPartida(): ElementosDeLaPartida {
  return {
    app: document.getElementById('app') as HTMLElement,
    canvas: document.getElementById('canvas') as HTMLCanvasElement,
    lienzo: document.getElementById('lienzo') as HTMLElement,
    minimapa: document.getElementById('minimapa') as HTMLCanvasElement,
    elDay: document.getElementById('day') as HTMLElement,
    elResources: document.getElementById('resources') as HTMLElement,
    elTurn: document.getElementById('turn') as HTMLElement,
    elSide: document.getElementById('side') as HTMLElement,
    elStatus: document.getElementById('status') as HTMLElement,
    elActions: document.getElementById('actions') as HTMLElement,
    elSeed: document.getElementById('seed') as HTMLElement,
    haciaEnemigo: document.getElementById('hacia-enemigo') as HTMLElement,
    conversacion: document.getElementById('conversacion') as HTMLDialogElement,
    elRueda: document.getElementById('rueda') as HTMLDialogElement,
    salirAlMenu: document.getElementById('salir-al-menu') as HTMLDialogElement,
    elGuarnicion: document.getElementById('guarnicion') as HTMLDialogElement,
    elDefensa: document.getElementById('defensa') as HTMLDialogElement,
    elAviso: document.getElementById('aviso') as HTMLDialogElement,
    stage: document.getElementById('stage') as HTMLElement,
    lateral: document.getElementById('lateral') as HTMLElement,
  };
}

/**
 * Las escenas de dentro: se entra en ellas desde otra (la tropa desde el mapa, la
 * morada desde la base), abren con el lateral arriba y, al salir, reponen el de la
 * escena de la que se vino. Cada una con su escena de pie, el `data-*` que deja en
 * el lienzo para `pnpm capturas` y su salida, la de la sesión. Construye las tres que
 * son suyas, en este orden; la del lugar, que se pulsa también desde sus botones, la
 * trae hecha (`main.ts`).
 */
export function escenasDeDentro(sesion: () => Session, castillo: EscenaBase, lugar: EscenaLugar) {
  return {
    tropa: { de: new EscenaTropa(sesion), cerrar: (s: Session) => s.cerrarLaTropa() },
    morada: {
      // Detrás de la fila, la base con su edificio abierto: no se sale de ella.
      de: new EscenaMorada(sesion, (ctx, lienzo, camara, vista, ahora) =>
        castillo.pintarLaMorada(ctx, lienzo, camara, vista.edificio, ahora),
      ),
      cerrar: (s: Session) => s.cerrarLaMorada(),
    },
    ayuntamiento: {
      // Detrás de la fila, la base con el ayuntamiento por fuera (no tiene versión
      // abierta) y sin quien anduvo: delante solo van los candidatos.
      de: new EscenaAyuntamiento(sesion, (ctx, lienzo, camara, vista, ahora) =>
        castillo.pintarLaMorada(ctx, lienzo, camara, vista.edificio, ahora, { caminante: false }),
      ),
      cerrar: (s: Session) => s.cerrarElAyuntamiento(),
    },
    // Escape cierra primero la conversación y, sin ella, sale al mapa.
    lugar: {
      de: lugar,
      cerrar: (s: Session) =>
        s.lugar.hablando !== null ? s.lugar.dejarDeHablar() : s.salirDelLugar(),
    },
  } as const;
}
type EscenasDeDentro = ReturnType<typeof escenasDeDentro>;
export type EscenaDeDentro = keyof EscenasDeDentro;
/** Si la escena es una de dentro. */
export const esDeDentro = (dentro: EscenasDeDentro, escena: string): escena is EscenaDeDentro =>
  escena in dentro;

/**
 * Lo que la página cambia mientras vive: nueve de los diez `let` de módulo de `main.ts` hasta
 * R7 de la reorganización (07-11-2026). El décimo, `session`, solo se asignaba al abrir la
 * partida, y es un `const` (`abrirLaPartida`). En un objeto, para que lo lean y lo escriban las
 * piezas de la página desde sus ficheros: el `let` de un módulo no se asigna desde otro.
 */
export interface EstadoDeLaPagina {
  /**
   * El modo «marcar fallo» y la vista de regiones (`desarrollo/herramientas.ts`): solo en
   * `pnpm dev`.
   */
  desarrollo: Desarrollo | null;
  /**
   * Los paneles se rehacen cuando la sesión dice que algo ha cambiado (`version`),
   * cuando la partida es otra o
   * cuando el tablero de batalla empieza o acaba de contar una jugada (sus botones
   * van apagados mientras tanto, #165); la barra, además, cuando llega arte (el
   * icono del oro). Antes se generaba su marcado en cada fotograma para
   * compararlo con el anterior.
   */
  paneles: {
    sesion: Session;
    version: number;
    arte: number;
    contando: boolean;
    base: string;
  } | null;
  /** Cuántas veces ha llegado arte (`cargarArte`): con cada una se repinta la barra de arriba. */
  arteLlegado: number;
  /** La escena del último fotograma: al cambiar, se recoloca lo que depende de ella. */
  escenaPintada: string;
  /**
   * La escena de donde se entró en una de dentro (el mapa o la base) y lo bajado
   * en su lateral, y lo que toca poner tras repintar los paneles.
   */
  escenaDeAntes: string;
  lateralDeAntes: number;
  lateralPendiente: number | null;
  /**
   * Tras elegir un candidato del ayuntamiento (en el lienzo o en su botón), su ficha
   * con «Contratar» se trae a la vista si no se veía (QA H2, 22-10-2026). En un
   * teléfono pequeño el panel va debajo del lienzo y asoma una franja: quien tocaba
   * una figura no veía pasar nada. Se lee en el fotograma que repinta el panel, con
   * la ficha ya nueva.
   */
  fichaALaVista: boolean;
  /** La última unidad propia a la que se llevó el marco, para no pelear con el dedo. */
  activaSeguida: string | null;
}

/**
 * La página de la partida, entera: lo que `main.ts` monta al cargarla —los elementos, la
 * partida abierta, sus escenas, la rueda del golpe, los gestos de la batalla, la puerta de
 * «Fin de turno», el lienzo— y lo que cambia mientras vive. Las piezas de `partida/` (`dibujo`,
 * `dialogos`, `gestos`, `puntero`, `clic`, `teclado`) la reciben, o lo que leen de ella con un
 * `Pick`, y ninguna registra nada ni hace nada al importarse: `main.ts` las instala en el orden
 * de siempre, que es comportamiento (dos oyentes del mismo evento en el mismo nodo corren en el
 * orden en que se registraron).
 */
export interface PaginaDeLaPartida extends ElementosDeLaPartida {
  /** La partida abierta (`abrirLaPartida`): una por página, porque «Partida nueva» recarga. */
  readonly session: Session;
  /** Pide un fotograma (el bucle de dibujo de `main.ts`, `comun/bucle.ts`). */
  readonly pedirFotograma: () => void;
  readonly aventura: EscenaAventura;
  readonly batalla: EscenaBatalla;
  readonly castillo: EscenaBase;
  /** La escena de un lugar de un mundo: se entra desde el mapa, como en la tropa. */
  readonly lugar: EscenaLugar;
  readonly dentro: EscenasDeDentro;
  /** La rueda del golpe de la partida, la misma de la arena (`batalla/rueda/dialogo.ts`). */
  readonly rueda: DialogoDeLaRueda;
  /** Los gestos de la batalla, los de la arena (`batalla/gestos.ts`). */
  readonly gestos: GestosDeBatalla;
  readonly finDeTurno: PuertaDeFinDeTurno;
  /** El lienzo a la medida de su caja (`ajustarLienzo`) y su contexto. */
  readonly principal: ReturnType<typeof ajustarLienzo>;
  readonly ctx: CanvasRenderingContext2D;
  readonly estado: EstadoDeLaPagina;
}
