/**
 * La escena de batalla: traduce el píxel a la acción legal y le da tiempo al
 * animador para contar lo que ha pasado.
 *
 * La acción que se manda **sale siempre de la lista de legales** de la sesión;
 * aquí no se construye ninguna. Y mientras el animador tiene algo en la cola no
 * se acepta nada: el tablero que se ve todavía no es el del estado, y un clic
 * sobre una figura que aún está andando caería sobre el hex equivocado. Esa
 * puerta no está aquí sino en `main.ts`, una sola para el lienzo, los botones y
 * el teclado: con una por sitio, «Resolver sola» y Escape se colaban.
 */
import { isAlive, stackHexes } from '@core/battle/battle.js';
import { hexEquals } from '@core/battle/board.js';
import type { BattleAction, BattleStack } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { BattleAnimator } from '../anim.js';
import { cajaDeFigura, drawBatalla } from '../render/batalla.js';
import { cercaDelCentro, hexEnPixel, type Tablero, tableroPara } from '../render/proyeccion.js';
import type { Session } from '../session.js';

const SIN_NADA: ReadonlySet<string> = new Set();

/** Lo que dice la barra a quien pulsa mientras la jugada se cuenta. */
export const AVISO_DE_ESPERA = 'Espera a que termine la jugada.';

/**
 * Lo que hace un clic sobre un enemigo: disparar si se puede; si no, golpear sin
 * moverse; si no, el primer golpe que haya, moviéndose hasta él.
 *
 * Exportada y pura porque la usan dos: esta escena, y el guion de capturas, que
 * tiene que aplicar en su espejo la MISMA acción que el cliente va a mandar. Con
 * la regla copiada allí, el día que cambie aquí el espejo se separaría de la
 * página sin que nada lo dijera hasta tres pasos después.
 */
export function accionContra(
  acciones: readonly BattleAction[],
  objetivo: string,
): BattleAction | undefined {
  return (
    acciones.find((a) => a.type === 'shoot' && a.target === objetivo) ??
    acciones.find((a) => a.type === 'attack' && a.target === objetivo && a.from === undefined) ??
    acciones.find((a) => a.type === 'attack' && a.target === objetivo)
  );
}

export class EscenaBatalla {
  private readonly animador = new BattleAnimator();
  private tablero: Tablero = tableroPara(1, 1);
  private hoverHex: Hex | null = null;
  private hoverStack: string | null = null;
  /**
   * Lo que decía la barra antes del aviso de espera, mientras el aviso está
   * puesto. El aviso habla de la jugada que se está contando: acabada, ya no es
   * verdad y se quita solo, sin esperar al siguiente gesto.
   */
  private antesDelAviso: string | null = null;

  constructor(private readonly sesion: () => Session) {}

  /**
   * Pone al animador en hora: lee lo nuevo del registro y avanza la cola hasta
   * `ahora`. Lo llama `main.ts` una vez por fotograma y antes de dejar pasar un
   * gesto; las lecturas de abajo no cambian nada.
   */
  sincronizar(ahora: number): void {
    const b = this.sesion().battle;
    if (b === null) return;
    this.animador.observe(b);
    this.animador.tick(ahora);
    if (this.antesDelAviso !== null && !this.animador.busy) {
      const s = this.sesion();
      // Si entre tanto la sesión ha escrito otra cosa, manda la sesión.
      if (s.status === AVISO_DE_ESPERA) s.status = this.antesDelAviso;
      this.antesDelAviso = null;
    }
  }

  /**
   * La puerta de los gestos mientras la jugada se cuenta: si hay algo en la cola
   * lo dice en la barra y devuelve `true` para que el gesto no se aplique. El
   * aviso se retira solo en `sincronizar` cuando la cola se vacía.
   */
  rechazarSiOcupada(ahora: number): boolean {
    this.sincronizar(ahora);
    if (!this.animador.busy) return false;
    const s = this.sesion();
    if (this.antesDelAviso === null) this.antesDelAviso = s.status;
    s.status = AVISO_DE_ESPERA;
    return true;
  }

  /** ¿Sigue contándose algo? Mientras sí, no se aceptan clics. */
  get ocupada(): boolean {
    return this.animador.busy;
  }

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number): void {
    const s = this.sesion();
    const battle = s.battle;
    if (battle === null) return;
    this.encuadrar(ancho, alto);
    const quieta = this.animador.busy;
    const turno = quieta ? null : s.turnoPropio;
    const atacables = new Set<string>();
    if (turno !== null && s.selectedSpell === null) {
      for (const a of s.battleLegalActions()) {
        if (a.type === 'attack' || a.type === 'shoot') atacables.add(a.target);
      }
    }
    drawBatalla(ctx, {
      battle,
      tablero: this.tablero,
      ancho,
      alto,
      movibles: quieta || s.selectedSpell !== null ? [] : s.battleMovable(),
      atacables,
      objetivosHechizo: s.selectedSpell === null ? SIN_NADA : new Set(s.castTargets()),
      hoverHex: this.hoverHex,
      hoverStack: this.hoverStack,
      figura: (st) => this.animador.figura(st),
      efectos: this.animador.efectos(battle),
    });
  }

  /** Ajusta el tablero al lienzo. Aparte de `dibujar` para probar el clic sin lienzo. */
  encuadrar(ancho: number, alto: number): void {
    this.tablero = tableroPara(ancho, alto);
  }

  /**
   * Cuántos individuos enemigos quedan fuera de la franja `[desde, hasta]` del
   * lienzo, a cada lado. En el móvil el tablero se desplaza en su marco y el
   * marco empieza en la unidad propia: sin esto, nada decía que el enemigo
   * estaba a la derecha, fuera de la vista.
   */
  enemigosFuera(desde: number, hasta: number): { izquierda: number; derecha: number } {
    const s = this.sesion();
    const battle = s.battle;
    const fuera = { izquierda: 0, derecha: 0 };
    if (battle === null || battle.finished !== null) return fuera;
    for (const st of battle.stacks) {
      if (!isAlive(st) || st.side === s.miBando) continue;
      const x = cajaDeFigura(this.tablero, st, this.animador.figura(st).en).x;
      if (x < desde) fuera.izquierda += st.count;
      else if (x > hasta) fuera.derecha += st.count;
    }
    return fuera;
  }

  /**
   * Dónde está, en el lienzo, la unidad que le toca mover a la persona, o `null`
   * si no le toca. En el móvil el tablero es más ancho que la pantalla y
   * `main.ts` desplaza el marco hasta ella cada vez que cambia: si no, la que
   * actúa podía quedar fuera de la vista sin que nada lo dijera.
   */
  activaPropia(): { id: string; x: number } | null {
    if (this.animador.busy) return null;
    const turno = this.sesion().turnoPropio;
    if (turno === null) return null;
    const { stack } = turno;
    return { id: stack.id, x: cajaDeFigura(this.tablero, stack, this.animador.figura(stack).en).x };
  }

  mover(px: number, py: number): void {
    this.hoverHex = hexEnPixel(this.tablero, px, py);
    // Lo que se señala es lo que haría el clic: si el centro de un hex al que se
    // puede ir gana a la figura que lo tapa, la figura no se ilumina.
    this.hoverStack =
      this.movimientoEn(px, py) === undefined ? (this.unidadEn(px, py)?.id ?? null) : null;
  }

  /**
   * El movimiento que gana el clic aunque una figura tape el hex: el punto cae
   * cerca del centro de un hex al que la unidad activa puede ir.
   *
   * La figura de la fila de delante sube por encima de la de detrás, y como el
   * clic buscaba primero la figura, pulsar el centro de un hex libre de la fila
   * de atrás atacaba a quien lo tapaba (29 de 1011 destinos en cinco batallas).
   * Un hex al que se puede ir está vacío, así que su centro no es de nadie; el
   * resto de la caja de la figura sigue siendo de la figura.
   */
  private movimientoEn(px: number, py: number): BattleAction | undefined {
    const s = this.sesion();
    if (s.selectedSpell !== null) return undefined;
    const hex = hexEnPixel(this.tablero, px, py);
    if (hex === null || !cercaDelCentro(this.tablero, hex, px, py)) return undefined;
    return s.battleLegalActions().find((a) => a.type === 'move' && hexEquals(a.to, hex));
  }

  /**
   * Qué haría un clic en ese punto: moverse a un hex, o la unidad sobre la que
   * cae. Exportada para el guion de capturas, que tiene que pulsar a una unidad
   * en un punto que el cliente lea como esa unidad.
   */
  objetivoEn(px: number, py: number): BattleStack | undefined {
    return this.movimientoEn(px, py) === undefined ? this.unidadEn(px, py) : undefined;
  }

  /**
   * La unidad bajo el puntero: primero por su figura —de delante atrás, que es
   * la que tapa— y si no, por su hex. Con solo el hex, pulsar el cuerpo de una
   * figura caía en el hex de la fila de atrás.
   */
  private unidadEn(px: number, py: number): BattleStack | undefined {
    const battle = this.sesion().battle;
    if (battle === null) return undefined;
    let mejor: { s: BattleStack; suelo: number } | null = null;
    for (const s of battle.stacks) {
      if (!isAlive(s)) continue;
      const c = cajaDeFigura(this.tablero, s, this.animador.figura(s).en);
      const dentro =
        Math.abs(px - c.x) <= c.ancho / 2 && py <= c.suelo + 4 && py >= c.suelo - c.alto;
      if (dentro && (mejor === null || c.suelo > mejor.suelo)) mejor = { s, suelo: c.suelo };
    }
    if (mejor !== null) return mejor.s;
    const hex = hexEnPixel(this.tablero, px, py);
    return hex === null ? undefined : this.stackEn(hex);
  }

  salir(): void {
    this.hoverHex = null;
    this.hoverStack = null;
  }

  private stackEn(hex: Hex): BattleStack | undefined {
    const battle = this.sesion().battle;
    if (battle === null) return undefined;
    return battle.stacks.find((s) => isAlive(s) && stackHexes(s).some((h) => hexEquals(h, hex)));
  }

  /** Un clic en el tablero. Quien llama ya ha comprobado que no hay nada contándose. */
  pulsar(px: number, py: number): void {
    const session = this.sesion();
    const battle = session.battle;
    if (battle === null || battle.finished !== null) return;

    const directo = this.movimientoEn(px, py);
    if (directo !== undefined) {
      session.playBattleAction(directo);
      return;
    }
    const objetivo = this.unidadEn(px, py);
    const hex = hexEnPixel(this.tablero, px, py);
    const acciones = session.battleLegalActions();

    // Con un hechizo elegido, el clic apunta: va ANTES que atacar y moverse.
    const hechizo = session.selectedSpell;
    if (hechizo !== null) {
      if (objetivo === undefined) {
        session.status = 'Elige una unidad sobre la que lanzarlo, o pulsa Escape para cancelar.';
        return;
      }
      const conjuro = acciones.find(
        (a) => a.type === 'cast' && a.spell === hechizo && a.target === objetivo.id,
      );
      if (conjuro !== undefined) {
        session.playBattleAction(conjuro);
        return;
      }
      // La selección se mantiene: quien apuntó mal vuelve a apuntar.
      session.status = session.castRejection(objetivo.id);
      return;
    }

    // Clic sobre un enemigo: disparar si se puede, si no cargar contra él.
    if (objetivo !== undefined && objetivo.side !== session.miBando) {
      const accion = accionContra(acciones, objetivo.id);
      if (accion !== undefined) {
        session.playBattleAction(accion);
        return;
      }
      session.status = 'No alcanzas a esa unidad este turno.';
      return;
    }

    if (hex === null) return;
    const movimiento = acciones.find((a) => a.type === 'move' && hexEquals(a.to, hex));
    if (movimiento !== undefined) {
      session.playBattleAction(movimiento);
      return;
    }
    session.status = 'No puedes llegar a ese hexágono.';
  }
}
