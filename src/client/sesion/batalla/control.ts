/**
 * Lo que la escena de batalla necesita de quien juega (`ControlDeBatalla`) y lo que
 * las dos sesiones que la juegan —la de la partida (`Session`) y la de la arena
 * (`SesionDeArena`)— calculan con la misma regla: lo que se ofrece a la persona y lo
 * que se pinta con ello (`accionesDeBatalla`, `opcionesDeHechizo`, `CalculoDeBatalla`),
 * la clave de su caché (`claveDeBatalla`, `claveConMagia`), el motivo del núcleo
 * dicho para la barra (`motivoExigido`, `motivoDeLaActiva`, `comoFrase`…) y el único
 * bucle de «juega la IA hasta que te toque» (`jugarIAMientras`).
 *
 * Era el principio de `sesion/partida.ts` (antes, `session.ts`) hasta la fase C de la
 * reorganización (07-11-2026), con las piezas de la pelea que comparten las dos
 * sesiones, que viven al lado: lo apuntado, los poderes, la muralla, el arma, el
 * despliegue, el libro y el cruce de la rueda.
 */
import { chooseBattleAction } from '@core/ai/tactics.js';
import type { TanteoADistancia } from '@core/battle/a-distancia.js';
import { applyAction, MAX_JUGADAS } from '@core/battle/battle.js';
import {
  activeStack,
  type CasillaDeCarga,
  casillasDeCarga,
  firmaDelTurno,
  movimientoBlocker,
  SIN_CARGAS,
} from '@core/battle/consultas.js';
import { firmaDelDespliegue } from '@core/battle/despliegue.js';
import { castBlocker } from '@core/battle/lanzar.js';
import { ataqueBlocker, legalActionsAndCosts } from '@core/battle/legalidad.js';
import { type Prevision, previsionDe } from '@core/battle/prevision.js';
import type { BattleAction, BattleStack, BattleState, Side } from '@core/battle/types.js';
import { enOrdenDelLibro, nombreDeHechizo } from '@core/magia/catalogo.js';
import type { Rng } from '@core/rng.js';
import type { ClimaDelSitio } from '@core/state/clima.js';
import type { Hex, PlayerId } from '@core/types.js';
import type { ArmaDeLaActiva, ModoDelArma } from './arma.js';
import type { DespliegueEnPantalla } from './despliegue.js';
import type { MurallaDeLaActiva } from './muralla.js';

/** Una entrada del libro de hechizos tal y como la pinta el panel de batalla. */
export interface SpellOption {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  /** Stacks sobre los que se puede lanzar ahora mismo, según `legalActions`. */
  readonly targets: readonly string[];
  readonly castable: boolean;
  /** Por qué no se puede lanzar, escrito para la persona. Vacío si sí se puede. */
  readonly motivo: string;
}

/** Lo que la escena de batalla lee en cada fotograma, calculado una vez por jugada. */
export interface CalculoDeBatalla {
  acciones: BattleAction[];
  movibles: Hex[];
  opciones: SpellOption[];
  cargas: readonly CasillaDeCarga[];
}

/**
 * La magia de una batalla tal como la lee la escena: qué hechizo hay elegido,
 * sobre quién cae y por qué no. La llevan la partida y la arena, las dos con un
 * `LibroDeBatalla`.
 */
export interface HechizosDeBatalla {
  readonly selectedSpell: string | null;
  castTargets(): readonly string[];
  castRejection(targetId: string): string;
}

/**
 * Lo que la escena de batalla necesita de quien juega: leer la batalla, saber si
 * le toca a la persona, las listas legales y mandar una acción. Lo implementan la
 * partida (`Session`) y la arena (`SesionDeArena`), así que el ratón, el ángulo,
 * la carga y los tramos son el mismo código en las dos pantallas y no una copia.
 *
 * **La batalla se lee por aquí ya ocultada** (`batallaALaVista`): la escena no ve
 * la batalla entera de la sesión (`Session.battle`, `SesionDeArena.battle`), así
 * que no puede pintar, señalar ni pulsar a quien aún no se ve. La única
 * excepción, `batallaEntera`, es del animador.
 */
export interface ControlDeBatalla {
  /**
   * Lo que de la batalla ve la persona (`batallaALaVista`): en el despliegue, sin
   * el rival que aún no ha desplegado (el defensor despliega sin ver a nadie). Es
   * lo que la escena pinta, señala y pulsa, y lo que dicen los paneles; lo que
   * cambia la batalla lo hace la sesión sobre la entera. Fuera del despliegue, el
   * mismo objeto que la entera.
   */
  readonly batallaALaVista: BattleState | null;
  /**
   * La batalla entera, también lo que la persona aún no ve. **Solo para el
   * animador** (`EscenaBatalla.sincronizar`): al cerrar el despliegue, el rival que
   * aparece tiene que estar ya en su casilla para que su primera jugada se cuente
   * andando desde ella, y con la vista no lo estaría. Lo vigila `invariantes-cliente.test.ts`.
   */
  readonly batallaEntera: BattleState | null;
  /** El despliegue de la persona en pantalla: a quién se coloca, dónde, y «Listo». */
  readonly despliegue: DespliegueEnPantalla;
  /** La barra de estado: la escena escribe en ella lo que señala el puntero. */
  status: string;
  /** La batalla y la unidad activa, solo si esa unidad la mueve la persona. */
  readonly turnoPropio: TurnoPropio | null;
  /** El bando de la persona; `null` si no lleva ninguno ahora. */
  readonly miBando: Side | null;
  /**
   * De quién es cada bando (`battleOwners`), para teñir de gris el que no es de
   * nadie; `null` donde los bandos no son de jugadores, que es la arena.
   */
  readonly dueños: Readonly<Record<Side, PlayerId | null>> | null;
  /** La magia, o `null` donde no hay héroe que lance. */
  readonly hechizos: HechizosDeBatalla | null;
  /**
   * El clima del sitio de la batalla (presentación): en la partida, el de la
   * región donde se pelea (`climaDeLaBatalla`); en la arena, el despejado o el
   * de `?clima=`.
   */
  readonly climaDeLaBatalla: ClimaDelSitio;
  battleLegalActions(): readonly BattleAction[];
  battleMovable(): readonly Hex[];
  battleCharges(): readonly CasillaDeCarga[];
  attackRejection(targetId: string): string;
  /**
   * Lo que daría esa acción de la lista legal —golpe, disparo o hechizo—, de la
   * misma cuenta que aplica el daño (`previsionDe`); `null` si no hace daño o no
   * es el turno de la persona.
   */
  prevision(action: BattleAction): Prevision | null;
  /** Por qué la unidad activa no puede ir a ese hex, con la frase del núcleo (`movimientoBlocker`). */
  moveRejection(hex: Hex): string;
  /**
   * La muralla de la activa (`MurallaDeLaActiva`): el muro o la puerta que espera el
   * clic en el tablero (lo pone el botón cuando hay más de uno) y los motivos de sus
   * botones. La partida y la arena, la misma pieza.
   */
  readonly muralla: MurallaDeLaActiva;
  /**
   * Lo que apunta el siguiente clic en una unidad, o `null`: el hechizo elegido
   * del libro o, en la arena, el poder de la activa que espera un aliado. Es uno
   * solo: elegir uno suelta el otro.
   */
  readonly apuntado: Apuntado | null;
  /** Por qué lo apuntado no vale sobre ese stack, con la frase del núcleo (`castBlocker`, `poderBlocker`). */
  rechazoDeLoApuntado(targetId: string): string;
  /**
   * El selector de arma de la activa (`ArmaDeLaActiva`): «Cuerpo a cuerpo» o «A
   * distancia», qué ofrece la lista de cada modo, y el tanteo y el clic del disparo.
   */
  readonly arma: ArmaDeLaActiva;
  playBattleAction(action: BattleAction): void;
}

/**
 * Lo que apunta el siguiente clic en una unidad (`ControlDeBatalla.apuntado`):
 * un hechizo del libro del héroe o un poder de la unidad activa. Los dos se
 * apuntan igual: la jugada sobre ese objetivo sale de la lista legal
 * (`esDeLoApuntado`) y el rechazo lo escribe el núcleo.
 */
export interface Apuntado {
  /**
   * El disparo no es de aquí: es el modo «A distancia» del selector de arma
   * (`ArmaDeLaActiva`), que no se suelta con un hechizo ni con Escape.
   */
  readonly kind: 'hechizo' | 'poder';
  readonly id: string;
}

/** Cómo se nombra lo apuntado en una frase: el hechizo o el poder. */
export function nombreDeLoApuntado(a: Apuntado): string {
  return nombreDeHechizo(a.id);
}

/** ¿Es `a` una jugada de lo apuntado (sobre `objetivo`, si se dice)? */
export function esDeLoApuntado(apuntado: Apuntado, a: BattleAction, objetivo?: string): boolean {
  const suya =
    apuntado.kind === 'hechizo'
      ? a.type === 'cast' && a.spell === apuntado.id
      : a.type === 'power' && a.poder === apuntado.id;
  return suya && (objetivo === undefined || ('target' in a && a.target === objetivo));
}

/** Lo que dice la barra a quien pide algo a la unidad activa cuando no es suya. */
export const NINGUNA_TUYA = 'Ahora no mueve ninguna unidad tuya.';

export type TurnoPropio = { battle: BattleState; stack: BattleStack; side: Side };

/** Lo que la batalla ofrece a la persona ahora: lo comparten la partida y la arena. */
interface AccionesDeBatalla {
  acciones: BattleAction[];
  movibles: Hex[];
  cargas: readonly CasillaDeCarga[];
}

/**
 * Las acciones legales y lo que se deriva de ellas, una regla para las dos
 * sesiones. Las legales se piden aunque no sea tu turno —la escena las usa para
 * leer el clic y el núcleo rechaza lo que no toca—; lo que se pinta (a dónde ir,
 * a quién cargar), solo si la unidad activa es tuya.
 */
export function accionesDeBatalla(
  battle: BattleState,
  turno: TurnoPropio | null,
  modo: ModoDelArma,
): AccionesDeBatalla {
  const { actions: todas, costs } =
    battle.finished === null ? legalActionsAndCosts(battle) : { actions: [], costs: new Map() };
  // Lo que ofrece el modo del selector de arma, solo en tu turno: lo del rival se
  // pide para leer el clic y no tiene selector.
  const acciones = turno === null ? todas : delModo(todas, modo);
  return {
    acciones,
    // Los hexes a los que ir son las entradas `move` de la misma lista: antes se
    // pedían aparte con `movableHexes`, que era recorrer el tablero otra vez para
    // dar la misma respuesta.
    movibles: turno === null ? [] : acciones.flatMap((a) => (a.type === 'move' ? [a.to] : [])),
    // Las cargas se enseñan con el movimiento posible (decisión del usuario):
    // salen de `casillasDeCarga`, la misma regla que las cobra.
    // Con el recorrido que ya hizo la lista, si es el de la misma unidad.
    // «A distancia» no anda: sin cargas que enseñar.
    cargas:
      turno === null || modo === 'distancia'
        ? SIN_CARGAS
        : casillasDeCarga(
            turno.battle,
            turno.stack,
            turno.battle === battle && activeStack(battle) === turno.stack ? costs : undefined,
          ),
  };
}

/**
 * «¿Se ha movido la batalla?»: toda acción aplicada deja una línea en el
 * registro y mueve el turno (`firmaDelTurno`: su ordinal, lo gastado en él o lo
 * que le quitó la Finta). Es la clave de la caché de las dos sesiones
 * (`SesionDeBatalla`) y la versión de la arena. Plantarse sin andar (la
 * carga, que se elige antes de correr, o el golpe ya pegado) no deja línea ni
 * gasta, pero cambia la firma: lleva el golpe plantado. Y colocar en el despliegue
 * tampoco deja línea: sin `firmaDelDespliegue`, la figura colocada no se movía
 * en pantalla.
 */
export function claveDeBatalla(b: BattleState): string {
  return `${b.log.length}|${b.turno === null ? '' : firmaDelTurno(b.turno, b.golpeEnCurso)}|${firmaDelDespliegue(b)}`;
}

/**
 * La clave de la caché del cálculo de batalla de las dos sesiones
 * (`SesionDeBatalla`): la de `claveDeBatalla` con el maná y el «ya lanzó» de los
 * dos héroes. Van en la clave aunque hoy solo cambien con un `cast` (que ya deja
 * línea): son lo único de lo que dependen los hechizos que no pasa por el
 * registro, y un test que los toca a mano vería una lista vieja.
 */
export function claveConMagia(b: BattleState): string {
  const { attacker: ha, defender: hd } = b.heroes;
  return `${claveDeBatalla(b)}|${ha?.mana}|${ha?.castThisRound}|${hd?.mana}|${hd?.castThisRound}`;
}

/**
 * Por qué la unidad activa no puede actuar contra ese enemigo: ni dispararle ni
 * golpearlo. La frase es del núcleo (`ataqueBlocker`) —«ya se ha movido este
 * turno: no puede disparar…»— y aquí solo se le pone mayúscula y punto. Quien la
 * pide ya ha visto que no hay acción legal contra él, así que el núcleo TIENE que
 * dar motivo.
 */
export function motivoContra(turno: TurnoPropio | null, targetId: string): string {
  return motivoExigido(
    turno,
    (b) => ataqueBlocker(b, targetId),
    `ninguna acción contra ${targetId}`,
    '',
  );
}

/**
 * El motivo del núcleo de algo que la lista legal no ofrece, como frase de la
 * barra. Quien lo pide ya ha visto que no está en la lista, así que el núcleo
 * TIENE que dar motivo: si no lo da, se lanza diciendo qué no se ofrecía (`que`).
 * Sin unidad tuya activa, `sinTurno`.
 */
export function motivoExigido(
  turno: TurnoPropio | null,
  pregunta: (battle: BattleState) => string | null,
  que: string,
  sinTurno = NINGUNA_TUYA,
): string {
  if (turno === null) return sinTurno;
  const motivo = pregunta(turno.battle);
  if (motivo === null) throw new Error(`no se ofrece ${que} y el núcleo no dice por qué`);
  return comoFrase(motivo);
}

/**
 * Por qué la unidad activa —tuya— no puede hacer algo que pinta un botón
 * deshabilitado (`escalaBlocker`, `puertasBlocker`, `poderBlocker`), como frase;
 * `null` si puede.
 */
export function motivoDeLaActiva(
  turno: TurnoPropio | null,
  pregunta: (battle: BattleState) => string | null,
): string | null {
  if (turno === null) return NINGUNA_TUYA;
  const motivo = pregunta(turno.battle);
  return motivo === null ? null : comoFrase(motivo);
}

/**
 * Por qué no se puede jugar a distancia en la casilla de un tanteo, dicho para la
 * barra (la frase del núcleo). La misma al pulsar (`apuntarA`) y al pasar el
 * puntero (`EscenaBatalla`): con el puntero, la granada fuera de alcance caía en el
 * motivo del cuerpo a cuerpo o en nada (H1 del QA de las granadas, 02-11-2026).
 */
export function rechazoDelTanteo(t: Extract<TanteoADistancia, { kind: 'no' }>): string {
  return comoFrase(t.motivo);
}

/**
 * Lo de la lista legal que se ofrece en `modo` (`ArmaDeLaActiva`): «A distancia»
 * no anda ni golpea; «Cuerpo a cuerpo» no apunta. Lo demás (terminar, hechizos,
 * poderes, puertas, escalas, rendirse) va en los dos.
 */
function delModo(acciones: BattleAction[], modo: ModoDelArma): BattleAction[] {
  return modo === 'distancia'
    ? acciones.filter((a) => a.type !== 'move' && a.type !== 'attack')
    : acciones.filter((a) => a.type !== 'aim' && a.type !== 'throw');
}

/**
 * Por qué la unidad activa no puede ir a ese hex: «ahí hay muro», «la puerta
 * solo la cruza quien defiende», «no llega: le quedan 2 casillas»… La frase es
 * del núcleo (`movimientoBlocker`); antes la escena decía «No puedes llegar a
 * ese hexágono.» para todo, y con una muralla delante no explicaba nada. Quien
 * la pide ya ha visto que no hay `move` allí, así que el núcleo TIENE que dar
 * motivo.
 */
export function motivoDeMovimiento(turno: TurnoPropio | null, hex: Hex): string {
  return motivoExigido(
    turno,
    (b) => movimientoBlocker(b, hex),
    `moverse a (${hex.col},${hex.row})`,
  );
}

/**
 * La IA juega mientras la unidad activa sea suya, y devuelve cuántas jugadas
 * hizo. El único bucle de «juega la IA hasta que te toque»: la partida y la
 * arena solo cambian el predicado y lo que completa la jugada. Al tope
 * (`MAX_JUGADAS`) **lanza**, en las dos: un bucle que no avanza no se corta
 * callando.
 */
export function jugarIAMientras(
  battle: BattleState,
  rng: Rng,
  laLlevaLaIA: (s: BattleStack) => boolean,
  antes: (accion: BattleAction) => BattleAction | null,
): number {
  let jugadas = 0;
  while (battle.finished === null) {
    const s = activeStack(battle);
    if (s === null || !laLlevaLaIA(s)) break;
    if (jugadas >= MAX_JUGADAS) {
      throw new Error(`la IA lleva ${MAX_JUGADAS} jugadas seguidas sin soltar la batalla`);
    }
    // `antes` completa la jugada con la rueda del golpe o la para (`null`): si la
    // IA golpea a una unidad de la persona, se espera ahí a que responda.
    const accion = antes(chooseBattleAction(battle));
    if (accion === null) break;
    applyAction(battle, accion, rng);
    jugadas++;
  }
  return jugadas;
}

/**
 * La previsión de una acción de la persona, o `null` si no es su turno o la
 * acción no hace daño. La escena solo la pide sobre acciones de la lista legal,
 * así que el núcleo, si lanza, lanza por un fallo de quien pregunta.
 */
export function previsionPropia(turno: TurnoPropio | null, accion: BattleAction): Prevision | null {
  return turno === null ? null : previsionDe(turno.battle, accion);
}

/**
 * El libro de hechizos tal y como se pinta: qué se puede lanzar ahora mismo y,
 * si no, por qué. `castable` no recalcula ninguna regla: es «existe un `cast`
 * de este hechizo entre las acciones legales». Y el motivo lo escribe el núcleo
 * (`castBlocker`), igual que el del castillo sale de `buildBlocker`. El héroe es
 * el del bando de la unidad activa de la persona: en la partida es el suyo; en
 * la arena, donde la persona puede llevar unidades de los dos lados, el del lado
 * que mueve.
 */
export function opcionesDeHechizo(
  turno: TurnoPropio | null,
  acciones: readonly BattleAction[],
): SpellOption[] {
  if (turno === null) return [];
  const hero = turno.battle.heroes[turno.side];
  if (hero === null || hero.spells.length === 0) return [];

  // En el orden del libro, el mismo que el panel del mapa (#54).
  return enOrdenDelLibro(hero.spells, turno.battle.libro).map((sp) => {
    const id = sp.id;
    // Un solo predicado para las tres preguntas —sobre quién, si se puede, y
    // por qué no—: el par (hechizo, objetivo) sale de la lista legal y el
    // motivo lo escribe el núcleo.
    const targets = acciones.flatMap((a) =>
      a.type === 'cast' && a.spell === id && a.target !== undefined ? [a.target] : [],
    );
    const castable = acciones.some((a) => a.type === 'cast' && a.spell === id);
    // Con `castable` verdadero el bloqueo es `null` por construcción, así que
    // solo se pregunta cuando hace falta. Y si no lo es, el núcleo TIENE que
    // dar motivo: las dos respuestas salen de la misma función.
    const motivo = castable ? '' : castBlocker(turno.battle, turno.side, id);
    if (motivo === null) {
      throw new Error(`${sp.nombre} no se ofrece y el núcleo no dice por qué`);
    }
    return { id, name: sp.nombre, cost: sp.mana, targets, castable, motivo };
  });
}

/** Un motivo del núcleo («no quedan puntos…») como frase de la barra. */
export function comoFrase(motivo: string): string {
  return `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.`;
}
