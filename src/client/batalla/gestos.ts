/**
 * Los gestos de la batalla, los mismos en la partida y la arena (`GestosDeBatalla`; R3 de
 * la reorganización, 07-11-2026): los botones del panel (`clic`), las teclas (`tecla`) y
 * el puntero sobre el tablero (`mover`, `soltar`, `salir`), sobre la sesión de batalla
 * común (`SesionDeBatalla`) y la escena (`EscenaBatalla`). Cada página dice cuándo no se
 * acepta nada mientras se cuenta la jugada (`jugadaEnCurso`, su única puerta, que pone en
 * la barra que se espere) y pide el fotograma; lo que solo tiene una página —rendirse,
 * «Resolver sola», «Continuar», «Solo la rueda del héroe», la formación de la tropa, el
 * editor de la arena— se queda en ella. En la partida, desde el 07-11-2026 (decisión del
 * usuario), el segundo clic de un doble clic no cuenta en ningún botón salvo los que suman
 * de uno en uno, y no llega aquí: lo para antes `repartirClic` (`partida/reparto-del-clic.ts`).
 *
 * Hasta R3 cada página llevaba su copia, y ya divergían: la arena no jugaba el segundo
 * clic de un doble clic (M12 de su QA) en «Terminar turno», los poderes, el arma, la
 * muralla y «Listo», y la partida solo en «Listo», así que en la partida un doble clic en
 * «Terminar turno» cerraba también el turno de la unidad suya siguiente. Ahora, en las dos.
 */
import type { SesionDeBatalla } from '../sesion/batalla/sesion-de-batalla.js';
import { FLECHAS_AL_COLOCAR } from './colocar.js';
import type { EscenaBatalla } from './escena.js';
import { jugadaDelBotonDeMuralla, modoDelBoton } from './poderes.js';

/** Lo que los gestos piden de la página: la de la partida o la de la arena. */
export interface PaginaDeLaBatalla {
  /** La sesión de la batalla de ahora, o `null` si no hay (la arena antes de «Luchar»). */
  readonly sesion: () => SesionDeBatalla | null;
  /** El tablero sobre el que se pulsa. */
  readonly escena: Pick<EscenaBatalla, 'mover' | 'pulsar' | 'salir'>;
  /**
   * La puerta de los gestos mientras se cuenta la jugada: si el tablero aún cuenta, dice
   * en la barra que se espere y devuelve `true`, y el gesto no se aplica.
   */
  readonly jugadaEnCurso: () => boolean;
  readonly pedirFotograma: () => void;
}

/** Los botones de la batalla (`data-action`) que atienden los gestos de las dos páginas. */
const BOTONES_DE_LA_BATALLA: ReadonlySet<string> = new Set([
  'battle-end-turn',
  'battle-spell',
  'battle-poder',
  'battle-arma',
  'battle-muralla',
  'despliegue-elegir',
  'desplegado',
]);

/**
 * Los que no juegan el segundo clic de un doble clic (M12 de QA de la arena): el segundo
 * caía en el botón ya repintado y jugaba en la unidad SIGUIENTE —cerraba su turno, usaba
 * su poder, cerraba la tanda del otro bando— sin que nadie lo pidiera. Elegir un hechizo
 * o a quién se coloca no juega nada: se quedan como estaban.
 */
const DE_UN_SOLO_CLIC: ReadonlySet<string> = new Set([
  'battle-end-turn',
  'battle-poder',
  'battle-arma',
  'battle-muralla',
  'desplegado',
]);

/** Lo que dice un atributo del botón, o lanza con `siFalta`: un botón sin él es un fallo del marcado. */
function datoDe(boton: Element, atributo: string, siFalta: string): string {
  const dato = boton.getAttribute(atributo);
  if (dato === null) throw new Error(siFalta);
  return dato;
}

/** Los gestos de la batalla de una página (`PaginaDeLaBatalla`): cabecera del fichero. */
export class GestosDeBatalla {
  constructor(private readonly pagina: PaginaDeLaBatalla) {}

  /**
   * Un clic en un botón con `data-action`: si es de la batalla, lo atiende —o lo deja,
   * con un segundo clic o mientras se cuenta— y devuelve `true`; si no, `false`, y la
   * página sigue con lo suyo. `clics`, los seguidos (`MouseEvent.detail`).
   */
  clic(accion: string | null, boton: Element, clics: number): boolean {
    if (accion === null || !BOTONES_DE_LA_BATALLA.has(accion)) return false;
    // `detail` cuenta los clics seguidos: el segundo de un doble clic no es otra jugada.
    if (clics > 1 && DE_UN_SOLO_CLIC.has(accion)) return true;
    const s = this.pagina.sesion();
    if (s === null || this.pagina.jugadaEnCurso()) return true;
    switch (accion) {
      case 'battle-end-turn':
        s.playBattleAction({ type: 'end_turn' });
        break;
      case 'battle-spell':
        // Elegir el hechizo no es una jugada; lanzarlo sobre alguien, sí (el tablero).
        s.hechizos.selectSpell(datoDe(boton, 'data-spell', 'el botón del hechizo no dice cuál es'));
        break;
      case 'battle-poder':
        // Un poder de la activa (`PoderesDeLaActiva`): con un aliado posible, ya; con
        // varios, el clic en el tablero elige.
        s.poderes.usar(datoDe(boton, 'data-poder', 'el botón del poder no dice cuál es'));
        break;
      case 'battle-arma':
        // El selector de arma del tirador activo (`ArmaDeLaActiva`).
        s.arma.elegir(modoDelBoton(boton));
        break;
      case 'battle-muralla':
        // La muralla (`MurallaDeLaActiva`): con un muro o una puerta posibles, ya; con
        // varios, el clic en el tablero elige.
        s.muralla.elegir(jugadaDelBotonDeMuralla(boton));
        break;
      case 'despliegue-elegir':
        // A quién se coloca en el despliegue (el teclado, sin el lienzo).
        s.despliegue.elegir(datoDe(boton, 'data-stack', 'el botón del despliegue no dice a quién'));
        break;
      case 'desplegado':
        // «Listo»: cierra la tanda de la persona; si la iniciativa es del rival, mueve él.
        s.despliegue.listo();
        break;
    }
    this.pagina.pedirFotograma();
    return true;
  }

  /**
   * Una tecla en la batalla: Escape suelta lo que espera el clic (el hechizo, el poder,
   * el muro o la puerta); en el despliegue, las flechas mueven al elegido a la casilla de
   * al lado (`FLECHAS_AL_COLOCAR`), que juzga el núcleo como un clic; la Q alterna el arma
   * del tirador activo; y Espacio cierra el turno de la unidad de la persona que actúa,
   * que con el movimiento en tramos es lo que más se pulsa. Con el foco en un botón,
   * Espacio es pulsar ESE botón —Rendirse, Continuar—, lo que el navegador hace con él: no
   * se le roba la tecla. Lo de antes de mirarla (los diálogos abiertos, lo que se escribe
   * en un campo, Escape mantenido) lo decide la página.
   */
  tecla(ev: KeyboardEvent): void {
    const s = this.pagina.sesion();
    if (s === null) return;
    if (ev.key === 'Escape') {
      if (!this.pagina.jugadaEnCurso()) {
        s.soltarLoApuntado();
        this.pagina.pedirFotograma();
      }
      return;
    }
    const flecha = FLECHAS_AL_COLOCAR[ev.key];
    if (flecha !== undefined) {
      if (s.despliegue.enCurso !== null && !this.pagina.jugadaEnCurso()) {
        ev.preventDefault();
        s.despliegue.mover(flecha[0], flecha[1]);
        this.pagina.pedirFotograma();
      }
      return;
    }
    if ((ev.key === 'q' || ev.key === 'Q') && !(ev.ctrlKey || ev.metaKey || ev.altKey)) {
      if (!this.pagina.jugadaEnCurso() && s.arma.conSelector) {
        s.arma.alternar();
        this.pagina.pedirFotograma();
      }
      return;
    }
    if (ev.key !== ' ') return;
    if (ev.target instanceof Element && ev.target.closest('button') !== null) return;
    ev.preventDefault();
    if (!ev.repeat && s.turnoPropio !== null && !this.pagina.jugadaEnCurso()) {
      s.playBattleAction({ type: 'end_turn' });
    }
    this.pagina.pedirFotograma();
  }

  /** El puntero sobre el tablero: señala lo que haría el clic. */
  mover(x: number, y: number): void {
    if (this.pagina.sesion() === null) return;
    this.pagina.escena.mover(x, y);
  }

  /** El dedo o el botón que se levanta: señala y, si no se está contando, pulsa. */
  soltar(x: number, y: number): void {
    if (this.pagina.sesion() === null) return;
    this.pagina.escena.mover(x, y);
    if (!this.pagina.jugadaEnCurso()) this.pagina.escena.pulsar(x, y);
  }

  /** El puntero que sale del lienzo: no se señala nada. */
  salir(): void {
    if (this.pagina.sesion() !== null) this.pagina.escena.salir();
  }
}
