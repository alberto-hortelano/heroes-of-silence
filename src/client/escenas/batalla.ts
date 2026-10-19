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
import { type CasillaDeCarga, isAlive, SIN_CARGAS, stackHexes } from '@core/battle/battle.js';
import { hexEquals, hexKey, ULTIMA_FILA } from '@core/battle/board.js';
import { mismaPuerta, nivelDe } from '@core/battle/muralla.js';
import type {
  BattleAction,
  BattleStack,
  Side,
  TipoDeEscala,
  TipoDePuerta,
} from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { BattleAnimator } from '../anim.js';
import {
  type Angulo,
  alzadoDeLaMuralla,
  bandosSinDueño,
  cajaDeFigura,
  claveDePortada,
  dentroDeLaFigura,
  drawBatalla,
  portadaBajo,
  tableroA,
} from '../render/batalla.js';
import {
  altoConAlzado,
  cercaDelCentro,
  hexEnPixel,
  type Tablero,
  tableroPara,
  verticesHex,
} from '../render/proyeccion.js';
import { type Apuntado, type ControlDeBatalla, esDeLoApuntado } from '../session.js';
import { nombreEnElCampo } from '../views/distintivo.js';
import { AVISO_DE_ESPERA } from '../views/panels.js';
import { textoDePrevision } from '../views/prevision.js';
import { accionContra, golpeEnPixel } from './angulo.js';

const SIN_NADA: ReadonlySet<string> = new Set();

/** ¿Es una de las dos jugadas de la escala, que llevan muro? */
function esEscala(a: BattleAction): a is Extract<BattleAction, { type: TipoDeEscala }> {
  return a.type === 'poner_escalera' || a.type === 'subir';
}

/** ¿Es una de las dos jugadas de la puerta, que llevan puerta? */
function esDePuerta(a: BattleAction): a is Extract<BattleAction, { type: TipoDePuerta }> {
  return a.type === 'abrir_puerta' || a.type === 'cerrar_puerta';
}
const NINGUN_BANDO: ReadonlySet<Side> = new Set();

/**
 * La carga dicha para la barra: cuántas casillas y cuánto daño suma, con el
 * tanto por ciento que trae la carga (`CasillaDeCarga.porciento`: el del jinete o,
 * en la arena, el de a pie). Solo se dice sobre el ENEMIGO: una
 * casilla vacía de la recta no promete nada, porque el clic ahí solo mueve
 * (decisión del usuario, 02-10-2026).
 */
function rotuloDeCarga(carga: CasillaDeCarga): string {
  return `cargando ${carga.hexes} casillas (+${carga.porciento} % de daño)`;
}

/**
 * Lo que dice la barra con el puntero sobre un enemigo: desde qué casilla se le
 * golpearía, si desde ahí se carga, cuánto, y la previsión del golpe
 * (`textoDePrevision`), si se da. Exportada porque `pnpm capturas` espera a leer
 * en la página exactamente esta frase.
 */
export function rotuloDeAngulo(
  elegida: Hex,
  carga: CasillaDeCarga | undefined,
  prevision?: string,
): string {
  const { col, row } = elegida;
  const golpe = `Golpearías desde (${col},${row})${carga === undefined ? '' : `, ${rotuloDeCarga(carga)}`}.`;
  return prevision === undefined ? golpe : `${golpe} ${prevision}`;
}

/**
 * La carga del golpe que se elegiría: la de ese enemigo desde esa casilla, si la
 * hay. Exportada porque `pnpm capturas` la busca igual para esperar la frase.
 */
export function cargaContra(
  cargas: readonly CasillaDeCarga[],
  angulo: Pick<Angulo, 'objetivo' | 'elegida'>,
): CasillaDeCarga | undefined {
  return cargas.find((c) => c.target === angulo.objetivo && hexEquals(c.at, angulo.elegida));
}

/**
 * Lo que dice la barra con un clic fuera de toda unidad mientras se apunta
 * (`ControlDeBatalla.apuntado`): el hechizo del libro o el poder que espera aliado.
 */
const SIN_OBJETIVO: Readonly<Record<Apuntado['kind'], string>> = {
  hechizo: 'Elige una unidad sobre la que lanzarlo, o pulsa Escape para cancelar.',
  poder: 'Elige un aliado sobre el que usarlo, o pulsa Escape para cancelar.',
};

export class EscenaBatalla {
  private readonly animador = new BattleAnimator();
  private tablero: Tablero = tableroPara(1, 1);
  private hoverHex: Hex | null = null;
  private hoverStack: string | null = null;
  /** Dónde está el puntero, para recalcular el ángulo cuando cambia la jugada. */
  private puntero: { x: number; y: number } | null = null;
  /**
   * El ángulo bajo el puntero y la lista legal con la que se calculó. Se
   * calcula al mover el ratón y se lee en cada fotograma; si entre tanto la
   * jugada cambia —la sesión da otra lista—, se recalcula una vez con el
   * puntero donde está, y no se pinta el de una jugada que ya pasó.
   */
  private angulo: {
    readonly acciones: readonly BattleAction[];
    readonly valor: Angulo | null;
  } | null = null;
  /**
   * Lo último que esta escena escribió en la barra al señalar. Al dejar de
   * señalar se quita, pero solo si sigue siendo lo que hay: si la sesión ha
   * escrito otra cosa entre tanto, manda la sesión.
   */
  private rotulo: string | null = null;
  /**
   * Lo que decía la barra antes del aviso de espera, mientras el aviso está
   * puesto. El aviso habla de la jugada que se está contando: acabada, ya no es
   * verdad y se quita solo, sin esperar al siguiente gesto.
   */
  private antesDelAviso: string | null = null;
  /**
   * Un gesto que espera a que la cola se vacíe: «Continuar» aparece en cuanto
   * la batalla termina, con la última muerte aún contándose, y tiene que bastar
   * con pulsarlo una vez. Va atado a la batalla en la que se pulsó: si es otra,
   * o ya no hay, se olvida.
   */
  private pendiente: { readonly batalla: unknown; readonly accion: () => void } | null = null;

  constructor(private readonly sesion: () => ControlDeBatalla) {}

  /**
   * Pone al animador en hora: lee lo nuevo del registro y avanza la cola hasta
   * `ahora`. Lo llama `main.ts` una vez por fotograma y antes de dejar pasar un
   * gesto; las lecturas de abajo no cambian nada.
   */
  sincronizar(ahora: number): void {
    const b = this.sesion().battle;
    if (this.pendiente !== null && this.pendiente.batalla !== b) this.pendiente = null;
    if (b === null) return;
    this.animador.observe(b);
    this.animador.tick(ahora);
    if (this.antesDelAviso !== null && !this.animador.busy) {
      const s = this.sesion();
      // Si entre tanto la sesión ha escrito otra cosa, manda la sesión.
      if (s.status === AVISO_DE_ESPERA) s.status = this.antesDelAviso;
      this.antesDelAviso = null;
    }
    // Lo último: la acción puede cerrar la batalla, y lo que escriba en la barra
    // no lo tiene que pisar la vuelta del aviso.
    if (this.pendiente !== null && !this.animador.busy) {
      const { accion } = this.pendiente;
      this.pendiente = null;
      accion();
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

  /**
   * Hace `accion` en cuanto la jugada termine de contarse: ya si no hay nada en
   * la cola; si no, en el `sincronizar` que la vacíe, una sola vez y sin aviso
   * de espera. Si se pide dos veces, gana la última.
   */
  alAcabar(ahora: number, accion: () => void): void {
    this.sincronizar(ahora);
    if (!this.animador.busy) {
      accion();
      return;
    }
    this.pendiente = { batalla: this.sesion().battle, accion };
  }

  /** ¿Sigue contándose algo? Mientras sí, no se aceptan clics. */
  get ocupada(): boolean {
    return this.animador.busy;
  }

  /** El cruce de la rueda que se cuenta ahora, si lo hay (`BattleAnimator.cruceEnCurso`). */
  cruceEnCurso(): ReturnType<BattleAnimator['cruceEnCurso']> {
    return this.animador.cruceEnCurso();
  }

  /**
   * Los dos que se cruzan en la rueda que se ve (hoy, solo la arena: en la
   * partida aún no se abre, F5): los del cruce que se cuenta o, con la cola
   * vacía, los del golpe plantado que espera la
   * elección (`BattleState.golpeEnCurso`, que solo se lee). Es cuando la arena
   * enseña la rueda (`pintarLaRueda`, `main.ts`); si no, `null`. Lo elegido no
   * sale de aquí: no está en el estado.
   */
  enLaRueda(): { readonly atacante: string; readonly objetivo: string } | null {
    const cruce = this.animador.cruceEnCurso();
    if (cruce !== null) return { atacante: cruce.evento.stack, objetivo: cruce.evento.target };
    const g = this.sesion().battle?.golpeEnCurso ?? null;
    if (g === null || this.animador.busy) return null;
    return { atacante: g.stack, objetivo: g.target };
  }

  dibujar(ctx: CanvasRenderingContext2D, ancho: number, alto: number): void {
    const s = this.sesion();
    const battle = s.battle;
    if (battle === null) return;
    this.encuadrar(ancho, alto);
    const quieta = this.animador.busy;
    const turno = quieta ? null : s.turnoPropio;
    const atacables = new Set<string>();
    const escalables = new Set<string>();
    const puertasPorElegir = new Set<string>();
    const apunta = s.apuntado;
    if (turno !== null && apunta === null) {
      for (const a of s.battleLegalActions()) {
        if (a.type === 'attack' || a.type === 'shoot') atacables.add(a.target);
        if (esEscala(a) && (s.muroPorElegir === null || s.muroPorElegir === a.type)) {
          escalables.add(hexKey(a.muro));
        }
        if (esDePuerta(a) && s.puertaPorElegir === a.type) {
          puertasPorElegir.add(claveDePortada(a.puerta));
        }
      }
    }
    drawBatalla(ctx, {
      battle,
      tablero: this.tablero,
      ancho,
      alto,
      movibles: quieta || apunta !== null ? [] : s.battleMovable(),
      cargas: quieta || apunta !== null ? SIN_CARGAS : s.battleCharges(),
      angulo: quieta ? null : this.anguloActual(),
      atacables,
      escalables,
      puertasPorElegir,
      objetivosHechizo:
        apunta === null ? SIN_NADA : this.objetivosDe(apunta, s.battleLegalActions()),
      hoverHex: this.hoverHex,
      hoverStack: this.hoverStack,
      puntero: this.puntero,
      figura: (st) => this.animador.figura(st),
      // La vida y quién actúa, al ritmo de la cola: mientras gira la rueda o se
      // cuenta la jugada de la IA, los de antes de lo que aún no se ha visto.
      activo: this.animador.activo(battle),
      enLaRueda: this.enLaRueda(),
      efectos: this.animador.efectos(battle),
      sinDueño: s.dueños === null ? NINGUN_BANDO : bandosSinDueño(s.dueños),
    });
  }

  /**
   * Ajusta el tablero al lienzo, con el sitio que pide lo alto de la muralla
   * (`alzadoDeLaMuralla`; sin muralla, el de siempre). Aparte de `dibujar` para
   * probar el clic sin lienzo.
   */
  encuadrar(ancho: number, alto: number): void {
    this.tablero = tableroPara(ancho, alto, this.alzado());
  }

  /**
   * El alto que necesita el lienzo para que, con `ancho` y un marco de
   * `altoVisible`, la muralla quepa sin encoger el tablero: el marco tal cual sin
   * muralla, y alargado con ella (`altoConAlzado`). Lo pide la arena, que deja
   * desplazar el marco en vertical.
   */
  altoDelLienzo(ancho: number, altoVisible: number): number {
    return altoConAlzado(ancho, altoVisible, this.alzado());
  }

  /**
   * Dónde acaba el tablero por abajo, en el lienzo: el vértice de abajo de la
   * última fila y un poco de margen para el aro de quien la pisa. La arena,
   * con el lienzo alargado, coloca el marco para que se vea ahí el final.
   */
  pieDelTablero(): number {
    const t = this.tablero;
    const v = verticesHex(t, { col: 0, row: ULTIMA_FILA })[3] as { y: number };
    return v.y + t.paso * 0.12;
  }

  private alzado(): number {
    const battle = this.sesion().battle;
    return battle === null ? 0 : alzadoDeLaMuralla(battle.muralla);
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
    this.puntero = { x: px, y: py };
    this.angulo = null;
    this.hoverHex = this.hexBajo(px, py);
    // Lo que se señala es lo que haría el clic: si el centro de un hex al que se
    // puede ir gana a la figura que lo tapa, la figura no se ilumina.
    const movimiento = this.movimientoEn(px, py);
    this.hoverStack = movimiento === undefined ? (this.unidadEn(px, py)?.id ?? null) : null;
    this.rotular(this.rotuloEn(movimiento));
  }

  /**
   * El ángulo del golpe si el puntero está sobre un enemigo al que la unidad
   * activa —tuya— puede golpear cuerpo a cuerpo: todas las casillas desde las
   * que lo alcanza y la más cercana al puntero. `null` si dispararía (un tirador
   * no se acerca a golpear lo que puede tirar), si hay un hechizo elegido o si
   * no hay a quién.
   */
  anguloEn(px: number, py: number): Angulo | null {
    const golpe = this.golpeEn(px, py);
    if (golpe === undefined) return null;
    const { acciones, objetivo, hexActual } = golpe;
    const g = golpeEnPixel(acciones, objetivo, hexActual, this.tablero, px, py);
    if (g === undefined || 'disparo' in g) return null;
    return { objetivo, candidatas: g.opciones.map((o) => o.desde), elegida: g.elegida.desde };
  }

  /**
   * Lo que manda un clic en ese punto si cae sobre un enemigo: el disparo o el
   * golpe desde la casilla resaltada. `undefined` si ahí no hay enemigo o no se
   * le alcanza. La usan `pulsar` y el espejo de `pnpm capturas`, que tiene que
   * aplicar la MISMA acción que manda la página.
   */
  accionContraEn(px: number, py: number): BattleAction | undefined {
    const golpe = this.golpeEn(px, py);
    if (golpe === undefined) return undefined;
    return accionContra(golpe.acciones, golpe.objetivo, golpe.hexActual, this.tablero, px, py);
  }

  /** El ángulo del puntero de ahora, calculado una vez por gesto o por jugada. */
  private anguloActual(): Angulo | null {
    if (this.puntero === null) return null;
    const acciones = this.sesion().battleLegalActions();
    if (this.angulo === null || this.angulo.acciones !== acciones) {
      this.angulo = { acciones, valor: this.anguloEn(this.puntero.x, this.puntero.y) };
    }
    return this.angulo.valor;
  }

  /**
   * Lo que hace falta para golpear al enemigo bajo el puntero, si lo hay y la
   * unidad activa es tuya: la lista legal, a quién y desde dónde está ahora.
   * Un movimiento que gana el clic, o un hechizo elegido, no son un golpe.
   */
  private golpeEn(
    px: number,
    py: number,
  ): { acciones: readonly BattleAction[]; objetivo: string; hexActual: Hex } | undefined {
    const s = this.sesion();
    const turno = s.turnoPropio;
    if (turno === null || s.apuntado !== null) return undefined;
    if (this.movimientoEn(px, py) !== undefined) return undefined;
    const objetivo = this.unidadEn(px, py);
    if (objetivo === undefined || objetivo.side === s.miBando) return undefined;
    return { acciones: s.battleLegalActions(), objetivo: objetivo.id, hexActual: turno.stack.hex };
  }

  /** Lo que la barra dice de lo señalado, o `null` si no hay nada que decir. */
  private rotuloEn(movimiento: BattleAction | undefined): string | null {
    const s = this.sesion();
    if (this.animador.busy) return null;
    // Sobre una casilla a la que ir no se promete carga: el clic ahí solo mueve.
    if (movimiento !== undefined) return null;
    const apuntada = this.previsionDeLoApuntado();
    if (apuntada !== null) return apuntada;
    const angulo = this.anguloActual();
    if (angulo !== null) {
      const accion =
        this.puntero === null ? undefined : this.accionContraEn(this.puntero.x, this.puntero.y);
      return rotuloDeAngulo(
        angulo.elegida,
        cargaContra(s.battleCharges(), angulo),
        this.previsionEn(accion) ?? undefined,
      );
    }
    return this.motivoSinGolpe();
  }

  /**
   * La previsión de lo que haría el clic sobre el enemigo señalado —el golpe
   * desde la casilla resaltada o el disparo, `accion`—, dicha para la barra;
   * `null` si ahí no hay nada que golpear.
   */
  private previsionEn(accion: BattleAction | undefined): string | null {
    return accion === undefined ? null : this.previsionDicha(accion);
  }

  /**
   * La previsión de una acción de la lista legal, dicha. La cuenta es del núcleo
   * (`ControlDeBatalla.prevision`) y se hace una vez por acción: el ratón la pide
   * en cada movimiento, y la acción es un objeto de la lista legal en caché, que
   * se rehace cuando la batalla se mueve. Con ella se van sus entradas.
   */
  private previsionDicha(accion: BattleAction): string | null {
    const hecha = this.previsiones.get(accion);
    if (hecha !== undefined) return hecha;
    const p = this.sesion().prevision(accion);
    const dicha = p === null ? null : textoDePrevision(p, this.nombre());
    this.previsiones.set(accion, dicha);
    return dicha;
  }
  private readonly previsiones = new WeakMap<BattleAction, string | null>();

  /**
   * Con un hechizo o un poder apuntando y el puntero sobre una unidad sobre la
   * que se puede, lo que haría; `null` si no se apunta nada, ni a nadie válido.
   */
  private previsionDeLoApuntado(): string | null {
    const s = this.sesion();
    const apunta = s.apuntado;
    if (apunta === null || this.puntero === null) return null;
    const objetivo = this.unidadEn(this.puntero.x, this.puntero.y);
    if (objetivo === undefined) return null;
    const accion = s.battleLegalActions().find((a) => esDeLoApuntado(apunta, a, objetivo.id));
    if (accion === undefined) return null;
    return this.previsionDicha(accion);
  }

  /**
   * Los stacks sobre los que cae lo apuntado, para marcarlos: los de sus jugadas
   * de la lista legal. Se guardan mientras la lista y lo apuntado sean los mismos
   * (la lista la guarda la sesión por jugada): la escena los pide en cada fotograma.
   */
  private objetivosDe(a: Apuntado, acciones: readonly BattleAction[]): ReadonlySet<string> {
    const m = this.objetivosApuntados;
    if (m !== null && m.acciones === acciones && m.kind === a.kind && m.id === a.id) return m.set;
    const set = new Set(
      acciones.flatMap((x) =>
        esDeLoApuntado(a, x) && 'target' in x && x.target !== undefined ? [x.target] : [],
      ),
    );
    this.objetivosApuntados = { acciones, kind: a.kind, id: a.id, set };
    return set;
  }
  private objetivosApuntados: {
    readonly acciones: readonly BattleAction[];
    readonly kind: Apuntado['kind'];
    readonly id: string;
    readonly set: ReadonlySet<string>;
  } | null = null;

  /** Cómo se llama cada stack en el campo, para la previsión. */
  private nombre(): (id: string) => string {
    const battle = this.sesion().battle;
    return (id) => {
      const st = battle?.stacks.find((x) => x.id === id);
      return battle === null || st === undefined ? id : nombreEnElCampo(battle, st);
    };
  }

  /**
   * Sobre un enemigo al que la unidad activa no puede ni disparar ni golpear, el
   * motivo del núcleo: el MISMO que escribe el clic (`attackRejection`), para que
   * quien explora con el ratón no tenga que pulsar para enterarse (N3 de QA,
   * 02-10-2026). Si dispararía, lo que daría el disparo (la previsión).
   */
  private motivoSinGolpe(): string | null {
    if (this.puntero === null) return null;
    const { x, y } = this.puntero;
    const golpe = this.golpeEn(x, y);
    if (golpe === undefined) return null;
    const accion = this.accionContraEn(x, y);
    // Si dispararía, lo que dice es lo que daría el disparo.
    if (accion?.type === 'shoot') {
      const p = this.previsionEn(accion);
      return p === null ? null : `Dispararías. ${p}`;
    }
    if (accion !== undefined) return null;
    return this.sesion().attackRejection(golpe.objetivo);
  }

  private rotular(texto: string | null): void {
    const s = this.sesion();
    if (texto !== null) {
      s.status = texto;
      this.rotulo = texto;
      return;
    }
    if (this.rotulo !== null && s.status === this.rotulo) s.status = '';
    this.rotulo = null;
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
    if (s.apuntado !== null) return undefined;
    // Lo alto de una columna primero, que es lo que se ve; y si ahí no se va,
    // el suelo de debajo: la columna tapa medio hex de la fila de detrás, y su
    // centro quedaba sin clic (visto en el navegador, 09-10-2026).
    const arriba = this.muroBajo(px, py);
    const suelo = hexEnPixel(this.tablero, px, py);
    for (const hex of [arriba, suelo]) {
      if (hex === null || !cercaDelCentro(this.tableroDe(hex), hex, px, py)) continue;
      const mover = s.battleLegalActions().find((a) => a.type === 'move' && hexEquals(a.to, hex));
      if (mover !== undefined) return mover;
    }
    return undefined;
  }

  /**
   * El hex bajo el puntero, con las columnas de la muralla: primero lo alto de
   * una columna —que tapa lo que hay detrás—, luego el suelo. Es la regla del
   * clic y del puntero sobre el tablero.
   */
  private hexBajo(px: number, py: number): Hex | null {
    return this.muroBajo(px, py) ?? hexEnPixel(this.tablero, px, py);
  }

  /** El muro cuya columna tiene lo alto bajo el puntero, o `null`. */
  private muroBajo(px: number, py: number): Hex | null {
    const battle = this.sesion().battle;
    // Sin muros no hay columna que buscar: se pregunta en cada movimiento del ratón.
    if (battle === null || battle.muralla.muros.length === 0) return null;
    const h = hexEnPixel(tableroA(this.tablero, 1), px, py);
    return h !== null && nivelDe(battle.muralla, h) === 1 ? h : null;
  }

  /** El tablero en el que está `hex`: el de lo alto si es un muro. */
  private tableroDe(hex: Hex): Tablero {
    const battle = this.sesion().battle;
    return battle === null ? this.tablero : tableroA(this.tablero, nivelDe(battle.muralla, hex));
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
      const f = this.animador.figura(s);
      const c = cajaDeFigura(this.tablero, s, f.en, f.elevacion);
      if (dentroDeLaFigura(c, px, py) && (mejor === null || c.suelo > mejor.suelo))
        mejor = { s, suelo: c.suelo };
    }
    if (mejor !== null) return mejor.s;
    const hex = this.hexBajo(px, py);
    return hex === null ? undefined : this.stackEn(hex);
  }

  salir(): void {
    this.hoverHex = null;
    this.hoverStack = null;
    this.puntero = null;
    this.angulo = null;
    this.rotular(null);
  }

  private stackEn(hex: Hex): BattleStack | undefined {
    const battle = this.sesion().battle;
    if (battle === null) return undefined;
    return battle.stacks.find((s) => isAlive(s) && stackHexes(s).some((h) => hexEquals(h, hex)));
  }

  /**
   * Un clic en una columna con escala: la del botón que espera un muro
   * (`muroPorElegir`) o, sin botón, subir —o si no, poner la escalera— contra
   * ese muro. Devuelve si el clic era suyo. Con un botón esperando, un clic en
   * otro sitio se queda en él y lo dice.
   */
  private pulsarEscala(hex: Hex | null, acciones: readonly BattleAction[]): boolean {
    const session = this.sesion();
    const tipo = session.muroPorElegir;
    const contra = (t: TipoDeEscala): BattleAction | undefined =>
      hex === null ? undefined : acciones.find((a) => a.type === t && hexEquals(a.muro, hex));
    const accion = tipo !== null ? contra(tipo) : (contra('subir') ?? contra('poner_escalera'));
    if (accion !== undefined) {
      session.muroPorElegir = null;
      session.playBattleAction(accion);
      return true;
    }
    if (tipo === null) return false;
    session.status = `${tipo === 'subir' ? 'Para subir' : 'Para poner la escalera'}, pulsa en lo alto de una columna marcada al pie de la unidad.`;
    return true;
  }

  /**
   * Un clic con el botón de la puerta esperando (`puertaPorElegir`): en la
   * portada de una puerta que se puede abrir (o cerrar), se juega; en otro
   * sitio, se queda esperando y lo dice. Devuelve si el clic era suyo: sin botón
   * esperando, no lo es.
   */
  private pulsarPuerta(px: number, py: number, acciones: readonly BattleAction[]): boolean {
    const session = this.sesion();
    const tipo = session.puertaPorElegir;
    const battle = session.battle;
    if (tipo === null || battle === null) return false;
    // Ya no hay puerta que elegir (otra unidad, o se ha movido): el botón deja de esperar.
    if (!acciones.some((a) => a.type === tipo)) {
      session.puertaPorElegir = null;
      return false;
    }
    const puerta = portadaBajo(this.tablero, battle.muralla, { x: px, y: py });
    const accion =
      puerta === null
        ? undefined
        : acciones.find((a) => a.type === tipo && mismaPuerta(a.puerta, puerta));
    if (accion !== undefined) {
      session.puertaPorElegir = null;
      session.playBattleAction(accion);
      return true;
    }
    session.status = `${tipo === 'abrir_puerta' ? 'Para abrirla' : 'Para cerrarla'}, pulsa en la portada de una puerta marcada.`;
    return true;
  }

  /** Un clic en el tablero. Quien llama ya ha comprobado que no hay nada contándose. */
  pulsar(px: number, py: number): void {
    const session = this.sesion();
    const battle = session.battle;
    if (battle === null || battle.finished !== null) return;

    const acciones = session.battleLegalActions();
    // La puerta antes que nada: su portada tapa casillas que también se mueven.
    const apunta = session.apuntado;
    if (apunta === null && this.pulsarPuerta(px, py, acciones)) return;
    const directo = this.movimientoEn(px, py);
    if (directo !== undefined) {
      session.muroPorElegir = null;
      session.playBattleAction(directo);
      return;
    }
    const hex = this.hexBajo(px, py);
    if (apunta === null && this.pulsarEscala(hex, acciones)) return;
    const objetivo = this.unidadEn(px, py);

    // Con un hechizo elegido o un poder esperando, el clic apunta: va ANTES que
    // atacar y moverse.
    if (apunta !== null) {
      if (objetivo === undefined) {
        session.status = SIN_OBJETIVO[apunta.kind];
        return;
      }
      const jugada = acciones.find((a) => esDeLoApuntado(apunta, a, objetivo.id));
      if (jugada !== undefined) {
        session.playBattleAction(jugada);
        return;
      }
      // La selección se mantiene: quien apuntó mal vuelve a apuntar.
      session.status = session.rechazoDeLoApuntado(objetivo.id);
      return;
    }

    // Clic sobre un enemigo: disparar si se puede; si no, golpear desde la
    // casilla resaltada, la más cercana al puntero.
    if (objetivo !== undefined && objetivo.side !== session.miBando) {
      const accion = this.accionContraEn(px, py);
      if (accion !== undefined) {
        session.playBattleAction(accion);
        return;
      }
      session.status = session.attackRejection(objetivo.id);
      return;
    }

    if (hex === null) return;
    const movimiento = acciones.find((a) => a.type === 'move' && hexEquals(a.to, hex));
    if (movimiento !== undefined) {
      session.playBattleAction(movimiento);
      return;
    }
    session.status = session.moveRejection(hex);
  }
}
