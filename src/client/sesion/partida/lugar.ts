/**
 * El lugar de un mundo en que está la persona (F1a del mapa vivo): cuál, con qué
 * héroe y, si habla con alguien, en qué nodo de la conversación va; entrar en su escena
 * y salir de ella, y elegir en la conversación, que puede abrir una batalla.
 *
 * Guarda solo con qué héroe: el lugar es el de su casilla (`anteDelHeroe`), así
 * que no hay dos sitios que puedan decir cosas distintas.
 *
 * Es estado del cliente y no del núcleo, como dónde está la figura en la base:
 * navegar por un árbol de diálogo no cambia la partida. Lo que sí la cambia —una
 * opción con efectos— es una acción de la persona (`elegir_en_lugar`), con la guarda
 * del turno de la sesión (`run`). Las preguntas (qué puntos están, qué
 * opciones valen y por qué no) son las del núcleo (`core/mundo/reglas.ts`).
 *
 * Es una pieza de la sesión de la partida desde R6 de la reorganización (07-11-2026):
 * vivía en `sesion/lugar.ts` (antes, `lugar/sesion.ts`) con lo que leía de la sesión
 * en cuatro funciones sueltas, y entrar, salir y lo de después de elegir, en `Session`,
 * que delega en ella.
 */
import { type BancoPintado, figuraQueSePinta } from '@core/gente/banco.js';
import { figuraDelHeroe } from '@core/hero/tipos-de-heroe.js';
import { nombreDelPunto } from '@core/mundo/formato.js';
import {
  type Ante,
  anteDelHeroe,
  estadoDicho,
  inicioDe,
  lugarEn,
  nodoDe,
  nodoDeEntrada,
  type OpcionALaVista,
  opcionesDe,
  puntosDe,
} from '@core/mundo/reglas.js';
import { heroById } from '@core/state/consultas.js';
import { applyAdventureAction } from '@core/state/game.js';
import type { AdventureAction } from '@core/state/tipos.js';
import type { FactionId, PlayerId, Point } from '@core/types.js';
import { AYUDA_DEL_LUGAR, AYUDA_DEL_MAPA } from '../../comun/dichos.js';
import { cuerpoDeLaPersona } from '../../render/figuras/cuerpo-de-gente.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Un punto de interés como lo pinta la escena y lo lista el panel. */
export interface PuntoALaVista {
  readonly id: string;
  /** De 0 (izquierda) a 1 (derecha) en la escena. */
  readonly x: number;
  readonly nombre: string;
  /** El papel de una persona; `null`, una cosa. */
  readonly papel: string | null;
  /**
   * Con qué se pinta una persona: su figura del banco de NPC, la más parecida
   * mientras se pinta (`figuraQueSePinta`) o el Y Bot civil; `null`, una cosa.
   */
  readonly cuerpo: string | null;
}

/** Lo que la escena y el panel leen del lugar abierto. */
export interface VistaDelLugar {
  readonly lugar: string;
  readonly nombre: string;
  /** Su casilla del mapa: la que lee su clima (`Session.climaDelLugar`). */
  readonly at: Point;
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
  /** Si no se está en el inicio de la conversación: la pantalla ofrece «Volver al principio». */
  readonly lejosDelInicio: boolean;
}

/** Lo que pasó al elegir una opción. */
export type TrasElegir = 'sigue' | 'cerrada' | 'batalla' | 'apagada';

/** Lo que la pieza del lugar lee de la sesión. */
interface DueñoDelLugar
  extends Pick<
    DueñoDeLasPiezas,
    'estado' | 'ctx' | 'viewer' | 'tocar' | 'barra' | 'irA' | 'run' | 'seleccionarHeroe'
  > {
  /** El banco de figuras de NPC y lo pintado de él (`Session.gente`): la figura de cada persona. */
  gente(): BancoPintado;
  /** Pasa a la batalla que acaba de abrirse, como desde el mapa (`Session.entrarEnLaBatalla`). */
  entrarEnLaBatalla(): void;
}

export class EnElLugar {
  /** El héroe que está en el lugar abierto, o `null`. */
  private heroe: string | null = null;
  private conversando: { readonly punto: string; nodo: string } | null = null;
  private aperturas = 0;

  constructor(private readonly dueño: DueñoDelLugar) {}

  /** Cuántas veces se ha abierto un lugar: lo que cambia al empezar de nuevo. */
  get apertura(): number {
    return this.aperturas;
  }

  /** Si se está hablando con alguien. */
  get hablando(): string | null {
    return this.conversando?.punto ?? null;
  }

  /**
   * Abre la escena del lugar en que está `heroe`, sin conversación. `deNuevo`: otra
   * apertura, que empieza a la izquierda; sin él, vuelve a la que había (tras una
   * batalla en el lugar).
   */
  abrir(heroe: string, deNuevo = true): void {
    this.heroe = heroe;
    this.conversando = null;
    if (deNuevo) this.aperturas++;
    this.dueño.tocar();
  }

  cerrar(): void {
    this.heroe = null;
    this.conversando = null;
    this.dueño.tocar();
  }

  /** Entra en la escena del lugar donde está el héroe `heroId`, con él elegido. */
  entrar(heroId: string): void {
    const hero = heroById(this.dueño.estado(), heroId);
    const l = lugarEn(this.dueño.estado(), hero.at);
    if (l === null) {
      this.dueño.barra(`${hero.name} no está en ningún lugar.`);
      return;
    }
    this.dueño.seleccionarHeroe(heroId);
    this.abrir(heroId);
    this.dueño.irA('lugar');
    this.dueño.barra(AYUDA_DEL_LUGAR);
  }

  /**
   * Vuelve a la escena del lugar donde está el héroe `heroId` tras una batalla en él, ya en
   * su estado nuevo (P-d del usuario): sin otra apertura (`abrir`, sin `deNuevo`). Lo pide
   * el cierre de la batalla (`CierreDeLaBatalla`).
   */
  volver(heroId: string): void {
    this.abrir(heroId, false);
    this.dueño.irA('lugar');
    this.dueño.barra(AYUDA_DEL_LUGAR);
  }

  /**
   * Sale del lugar al mapa, con la ayuda del mapa en la barra (M8 de la vuelta 2: quedaba en
   * blanco).
   */
  salir(): void {
    this.cerrar();
    this.dueño.irA('adventure');
    this.dueño.barra(AYUDA_DEL_MAPA);
  }

  /** El lugar y el héroe de la batalla pendiente, si es de un lugar: al cerrarla se vuelve a él. */
  deLaBatalla(): { readonly heroe: string } | null {
    const p = this.dueño.estado().pendingBattle;
    if (p === null || p.foe.kind !== 'lugar' || p.attacker.kind !== 'hero') return null;
    return { heroe: p.attacker.heroId };
  }

  private ante(): Ante | null {
    if (this.heroe === null) return null;
    const a = anteDelHeroe(this.dueño.estado(), this.heroe);
    return 'motivo' in a ? null : a;
  }

  /**
   * La casilla del lugar abierto, o `null`: lo que lee su clima en cada fotograma, sin la vista
   * entera.
   */
  casilla(): Point | null {
    return this.ante()?.lugar.at ?? null;
  }

  vista(): VistaDelLugar | null {
    const a = this.ante();
    if (a === null) return null;
    const l = a.lugar;
    const gente = this.dueño.gente();
    return {
      lugar: l.id,
      nombre: l.nombre,
      at: l.at,
      estado: estadoDicho(a.mundo, l),
      fondo: l.fondo.plaza,
      owner: a.hero.owner,
      puntos: puntosDe(a).map((p) => ({
        id: p.id,
        x: p.x,
        nombre: nombreDelPunto(p),
        papel: p.persona?.papel ?? null,
        cuerpo:
          p.persona === undefined
            ? null
            : cuerpoDeLaPersona(
                figuraQueSePinta(
                  gente,
                  p.persona.figura,
                  `${this.dueño.estado().seed}|${l.id}|${p.id}`,
                  a.mundo.historia.figuras,
                ),
              ),
      })),
      caminante: { id: a.hero.id, nombre: a.hero.name, cuerpo: figuraDelHeroe(a.hero) },
      apertura: this.aperturas,
    };
  }

  /**
   * Empieza a hablar con un punto (o a mirar una cosa): donde quedó la conversación de
   * quien juega con él, o su inicio (`nodoDeEntrada`, del núcleo; H14 de la vuelta 2).
   */
  hablar(punto: string): void {
    const a = this.ante();
    const p = a === null ? undefined : puntosDe(a).find((x) => x.id === punto);
    if (a === null || p === undefined) return;
    this.conversando = { punto, nodo: nodoDeEntrada(a, p) };
    this.dueño.tocar();
  }

  /**
   * «Volver al principio»: la conversación abierta, a su inicio. Es de la pantalla
   * y no cambia nada de la partida: el núcleo sigue recordando dónde quedó.
   */
  alPrincipio(): void {
    const a = this.ante();
    const c = this.conversando;
    const p = a === null || c === null ? undefined : a.lugar.puntos.find((x) => x.id === c.punto);
    if (a === null || c === null || p === undefined) return;
    c.nodo = inicioDe(a, p);
    this.dueño.tocar();
  }

  dejarDeHablar(): void {
    if (this.conversando === null) return;
    this.conversando = null;
    this.dueño.tocar();
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
      quien: nombreDelPunto(p),
      papel: p.persona?.papel ?? null,
      texto: nodoDe(a, p, c.nodo).texto,
      opciones: opcionesDe(a, p, c.nodo),
      lejosDelInicio: c.nodo !== inicioDe(a, p),
    };
  }

  /**
   * Elige la opción `i` de la conversación abierta (`elegirLaOpcion`); si abre
   * una batalla, se pasa a ella como desde el mapa.
   */
  elegir(i: number): TrasElegir {
    const tras = this.elegirLaOpcion(i);
    if (tras === 'batalla') {
      this.dueño.entrarEnLaBatalla();
    } else if (tras !== 'apagada') {
      // La acción deja la barra en blanco (`run`) y en el lugar no se mueve el
      // ratón por el lienzo mientras se elige: lo que toca allí (M8 de la vuelta 2).
      this.dueño.barra(AYUDA_DEL_LUGAR);
    }
    return tras;
  }

  /**
   * Elige la opción `i` del nodo de ahora: si hace algo, lo aplica el núcleo; luego
   * va a su nodo o cierra. Una apagada no hace nada (su motivo ya se lee debajo).
   */
  private elegirLaOpcion(i: number): TrasElegir {
    const a = this.ante();
    const c = this.conversando;
    if (a === null || c === null) return 'cerrada';
    const p = a.lugar.puntos.find((x) => x.id === c.punto);
    if (p === undefined) return 'cerrada';
    const op = opcionesDe(a, p, c.nodo)[i];
    if (op === undefined) throw new Error(`el nodo ${c.nodo} no tiene la opción ${i}`);
    if (op.motivo !== null) return 'apagada';
    if (op.hace) {
      const hecho = this.aplicar({
        type: 'elegir_en_lugar',
        hero: a.hero.id,
        lugar: a.lugar.id,
        punto: c.punto,
        nodo: c.nodo,
        opcion: i,
      });
      if (!hecho) return 'apagada';
      if (this.dueño.estado().pendingBattle !== null) {
        this.conversando = null;
        this.dueño.tocar();
        return 'batalla';
      }
    }
    if (op.ir === null) {
      this.conversando = null;
      this.dueño.tocar();
      return 'cerrada';
    }
    c.nodo = op.ir;
    this.dueño.tocar();
    return 'sigue';
  }

  /** Una opción con efectos, por la puerta de la sesión: con la guarda de turno (`run`). */
  private aplicar(a: AdventureAction): boolean {
    return this.dueño.run(() =>
      applyAdventureAction(this.dueño.estado(), a, this.dueño.ctx(), this.dueño.viewer()),
    );
  }
}
