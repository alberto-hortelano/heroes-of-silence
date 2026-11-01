/**
 * El `<dialog id="rueda">` vivo: cuándo se abre, qué pinta y qué hacen sus gestos.
 * Uno para la batalla de la partida y la de la arena (F5 de la tarea del combate
 * en el juego, 19-10-2026; antes vivía en `arena/main.ts`). El marcado es de
 * `rueda.ts`; elegir y cancelar, de la sesión (`CruceDeLaRueda`); aquí solo se
 * conecta.
 *
 * Cada fotograma, quien pinta llama a `pintar`: mientras el animador cuenta un
 * cruce, su desenlace al ritmo del paso (`data-tramo`); si no se cuenta nada y la
 * sesión espera una elección, la rueda para elegir; si no, cerrada. Con algo en la
 * cola, la elección espera a que acabe: el tablero no puede ir por detrás. Así la
 * rueda se abre cuando quien pega ya ha llegado: la sesión lo planta ante su
 * objetivo (su `move`) antes de pedir la elección, y esta espera a la marcha
 * (decisión del usuario, 13-10-2026: primero se anda, luego se elige). Con carga
 * no hay marcha que esperar: se elige antes de correr (31-10-2026), y la carrera
 * llega en el registro tras el cruce.
 */
import { formaDeLaBatalla, type HechoDelCruce } from '@core/battle/rueda.js';
import type { BattleState, Side } from '@core/battle/types.js';
import type { CruceEnCurso } from '../anim.js';
import { pintar } from '../html.js';
import type { RuedaPendiente } from '../session.js';
import { FigurasDeLaRueda } from './figuras.js';
import {
  ajustarLaRueda,
  type CaraDeLosContrincantes,
  renderDesenlace,
  renderEleccion,
  tipoDeLaTecla,
  tramosDelDesenlace,
} from './rueda.js';

/** Lo que la rueda pide de la sesión: la de la partida, la de la arena y la del espectador. */
export interface SesionConRueda {
  readonly battle: BattleState | null;
  readonly ruedaPendiente: RuedaPendiente | null;
  /**
   * El bando de quien mira la rueda: la rueda dice «Tu golpe» o «Tu respuesta» y
   * marca a cada uno «tú» o «rival». `null` si mira más de uno (la arena con los
   * dos bandos de la persona, que se dicen por su lado del campo) o ninguno (el
   * espectador).
   */
  readonly quienMira: Side | null;
  elegirEnLaRueda(tipo: string): void;
  cancelarGolpe(): boolean;
}

/** Lo que la rueda pide de la escena de batalla (`EscenaBatalla`): si cuenta, y qué cruce. */
export interface QuienCuentaElCruce {
  readonly ocupada: boolean;
  cruceEnCurso(): CruceEnCurso | null;
}

export interface OpcionesDeLaRueda {
  /** La sesión de ahora, o `null` si no hay batalla. */
  readonly sesion: () => SesionConRueda | null;
  readonly escena: QuienCuentaElCruce;
  /**
   * Lo que la página pone ahora alrededor de la figura de los dos que se cruzan
   * (`CaraDeLosContrincantes`: la arena, el botón de su ficha y su vista previa),
   * o `null` para la figura sola.
   */
  readonly cara: () => CaraDeLosContrincantes | null;
  readonly pedirFotograma: () => void;
  /**
   * Un gesto en la rueda mientras se cuenta su desenlace: la página dice que se
   * espere (la partida y la arena, `jugadaEnCurso`). Sin él (el espectador, que no
   * elige), nada.
   */
  readonly alPulsarMientrasCuenta?: () => void;
}

export class DialogoDeLaRueda {
  /**
   * Lo que la rueda lleva pintado: el cruce que se cuenta (su hecho del registro)
   * o la elección que espera la sesión (`ruedaPendiente`, el mismo objeto
   * mientras dura su fase). Se repinta solo al cambiar, por identidad: repintar
   * en cada fotograma reiniciaría las animaciones del desenlace.
   */
  private pintada: HechoDelCruce | RuedaPendiente | null = null;
  /** Las figuras de la cabecera pintada (`FigurasDeLaRueda`): las anima `animar`. */
  private readonly figuras = new FigurasDeLaRueda();

  /**
   * Dónde estaba el puntero la última vez que se movió, en la ventana, y dónde
   * estaba al pintarse la rueda de una fase nueva (`aquietar`).
   *
   * La rueda de cada fase sale con el puntero donde lo dejó quien eligió antes, y
   * el `:hover` encendía el sector de debajo y abría su nota: con los dos bandos
   * «Yo», quien respondía veía qué había pulsado quien pegaba (H1 de QA,
   * 13-10-2026). Así que la rueda nace quieta (`data-quieta`: el CSS no enciende
   * nada por el `:hover`) hasta que el puntero se mueve DE VERDAD —un
   * `pointermove` en el mismo píxel no cuenta: el navegador puede mandarlo al
   * cambiar lo de debajo— o se pulsa.
   *
   * Una tecla NO la despierta: quien responde con el teclado no ha movido el
   * ratón, que sigue encima de lo que pulsó el otro, y despertarla encendía ese
   * sector y abría su nota junto al que tenía el foco (H1b, vuelta 2 de QA). El
   * teclado no necesita el `:hover`: el foco enciende su sector por
   * `:focus-visible`, que no mira `data-quieta`.
   */
  private punteroEn: { readonly x: number; readonly y: number } | null = null;
  private quietaEn: { readonly x: number; readonly y: number } | null = null;

  constructor(
    readonly el: HTMLDialogElement,
    private readonly o: OpcionesDeLaRueda,
  ) {
    window.addEventListener(
      'pointermove',
      (ev) => {
        this.punteroEn = { x: ev.clientX, y: ev.clientY };
      },
      { capture: true, passive: true },
    );
    el.addEventListener('pointermove', (ev) => {
      if (el.dataset.quieta === undefined || enLaCabecera(ev)) return;
      const q = this.quietaEn;
      if (q !== null && ev.clientX === q.x && ev.clientY === q.y) return;
      this.despertar();
    });
    el.addEventListener('pointerdown', (ev) => {
      if (!enLaCabecera(ev)) this.despertar();
    });
    el.addEventListener('click', (ev) => {
      const boton = (ev.target as Element).closest('[data-golpe]');
      if (boton === null) {
        // El diálogo es modal: mientras cuenta el desenlace, un clic en el tablero
        // cae aquí y se perdía sin decir nada, cuando en una marcha la barra dice
        // que se espere (H4 de QA, 19-10-2026). La cabecera es para mirar.
        if (o.escena.ocupada && !enLaCabecera(ev)) o.alPulsarMientrasCuenta?.();
        return;
      }
      if (ev.detail > 1) return;
      this.elegir(boton.getAttribute('data-golpe') ?? '');
    });
    // Las teclas: del 1 al número de tipos de la rueda de la batalla elige el
    // sector de su número (`tipoDeLaTecla`, la misma tabla que pinta las
    // etiquetas), las flechas pasan el foco de uno a otro e Intro pulsa el que lo
    // tiene (el botón, por sí mismo).
    el.addEventListener('keydown', (ev) => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const battle = o.sesion()?.battle ?? null;
      const tipo = battle === null ? null : tipoDeLaTecla(ev.key, formaDeLaBatalla(battle));
      if (tipo !== null) {
        ev.preventDefault();
        this.elegir(tipo);
        return;
      }
      const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
      if (paso === undefined) return;
      ev.preventDefault();
      const botones = [...el.querySelectorAll<HTMLElement>('button[data-golpe]')];
      if (botones.length === 0) return;
      const ahora = botones.indexOf(document.activeElement as HTMLElement);
      const siguiente = ahora < 0 ? 0 : (ahora + paso + botones.length) % botones.length;
      botones[siguiente]?.focus();
    });
    // Escape: cancela el golpe solo antes de elegirlo, y quien pega se queda donde
    // llegó, con su turno (`soltarElGolpe`); si no, la sesión dice por qué no (la
    // respuesta no se cancela: el golpe ya viene). El desenlace se cuenta entero:
    // el diálogo no se cierra solo.
    el.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      const s = o.sesion();
      if (s === null || o.escena.ocupada) return;
      if (s.cancelarGolpe()) this.cerrar();
      o.pedirFotograma();
    });
  }

  /** La rueda, cada fotograma (ver la cabecera del fichero). */
  pintar(): void {
    const s = this.o.sesion();
    const battle = s?.battle ?? null;
    if (s === null || battle === null) {
      this.cerrar();
      return;
    }
    const cruce = this.o.escena.cruceEnCurso();
    const pendiente = cruce === null && !this.o.escena.ocupada ? s.ruedaPendiente : null;
    let enfocar = false;
    if (cruce !== null) {
      if (this.pintada !== cruce.evento) {
        // Solo al cambiar de cruce: el desenlace busca el suyo en el registro.
        pintar(this.el, renderDesenlace(battle, cruce, s.quienMira, this.o.cara()));
        this.ajustar(battle);
        this.pintada = cruce.evento;
      }
      const tramos = tramosDelDesenlace(cruce.t);
      if (this.el.dataset.tramo !== tramos) this.el.dataset.tramo = tramos;
    } else if (pendiente !== null) {
      if (this.pintada !== pendiente) {
        delete this.el.dataset.tramo;
        pintar(this.el, renderEleccion(battle, pendiente, s.quienMira, this.o.cara()));
        this.ajustar(battle);
        this.aquietar();
        this.pintada = pendiente;
        enfocar = true;
      }
    } else {
      this.cerrar();
      return;
    }
    if (!this.el.open) this.el.showModal();
    // El foco, en el diálogo y en ningún sector: uno enfocado parecería preelegido
    // (y abría su nota). Las flechas empiezan por el primero. El de la fase
    // anterior no se conserva: lleva otra `data-fase`.
    if (enfocar) this.el.focus();
  }

  cerrar(): void {
    this.pintada = null;
    delete this.el.dataset.tramo;
    this.despertar();
    this.figuras.soltar();
    if (!this.el.open) return;
    this.el.close();
  }

  /**
   * Las figuras de los dos de la cabecera, cada fotograma (quien pinta las pide
   * con la rueda abierta). Devuelve si hay que seguir animando.
   */
  animar(ahora: number): boolean {
    return this.el.open && this.figuras.animar(ahora);
  }

  private ajustar(battle: BattleState): void {
    ajustarLaRueda(this.el, formaDeLaBatalla(battle));
    this.figuras.recoger(this.el);
  }

  /**
   * Elige en la rueda: el clic en un sector, su tecla o Intro con el foco en él.
   * La sesión dice si no espera nada; mientras se cuenta un desenlace no se elige
   * —la rueda de la siguiente fase aún no se ve— y la página dice que se espere.
   */
  private elegir(tipo: string): void {
    const s = this.o.sesion();
    if (s === null) return;
    if (this.o.escena.ocupada) {
      this.o.alPulsarMientrasCuenta?.();
      return;
    }
    s.elegirEnLaRueda(tipo);
    this.o.pedirFotograma();
  }

  private aquietar(): void {
    this.el.dataset.quieta = '';
    this.quietaEn = this.punteroEn;
  }

  private despertar(): void {
    delete this.el.dataset.quieta;
    this.quietaEn = null;
  }
}

/**
 * Si el gesto cae en la cabecera de la rueda (los dos que se cruzan, #261): ni
 * pasar por ella ni pulsarla despierta los sectores. Al ir a mirar quién es quién,
 * el puntero no ha pasado por la rueda.
 */
function enLaCabecera(ev: Event): boolean {
  return ev.target instanceof Element && ev.target.closest('.cabecera-de-rueda') !== null;
}
