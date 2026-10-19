/**
 * Sesión de juego del cliente.
 *
 * Es la única puerta del cliente al núcleo: las vistas piden cosas aquí y
 * pintan lo que devuelve, nunca tocan el `GameState` por su cuenta. Cuando
 * llegue el bridge por WebSocket, lo que cambia es esta capa y solo esta.
 */
import { pasoDelCruce } from '@core/ai/rueda.js';
import { chooseBattleAction } from '@core/ai/tactics.js';
import { playAiTurn } from '@core/ai/turn.js';
import {
  batallaDeArena,
  type CatalogoDeLaArena,
  catalogoDelMontaje,
  conUnidad,
  LADOS,
  type LadoDeArena,
  type RetoqueDeArena,
  retocarEnBatalla,
} from '@core/arena.js';
import {
  activeStack,
  applyAction,
  ataqueBlocker,
  type CasillaDeCarga,
  casillasDeCarga,
  castBlocker,
  contactoBlocker,
  escalaBlocker,
  faseDelTurno,
  firmaDelTurno,
  legalActionsAndCosts,
  MAX_JUGADAS,
  movimientoBlocker,
  type Prevision,
  pasosQueQuedan,
  poderBlocker,
  previsionDe,
  previsionDeLaRueda,
  puertasBlocker,
  quienNoEscala,
  SIN_CARGAS,
  soltarElGolpe,
  stackById,
  surrenderBlocker,
} from '@core/battle/battle.js';
import { bonoEnLoAlto, type MurallaDeBatalla, SIN_MURALLA } from '@core/battle/muralla.js';
import { type PoderId, poder } from '@core/battle/poderes.js';
import {
  esTipoDeGolpe,
  type PapelEnLaRueda,
  type TipoDeGolpe,
  tipoDeGolpeBlocker,
} from '@core/battle/rueda.js';
import { enOrdenDelLibro, spell } from '@core/battle/spells.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
  TipoDeEscala,
  TipoDePuerta,
} from '@core/battle/types.js';
import { cuerpoDe } from '@core/catalogo.js';
import type { CatalogoDeEquipo } from '@core/hero/equipo.js';
import { HERO_BODY, type Hero, maxMana } from '@core/hero/hero.js';
import { armyLeadership, GARRISON_LEADERSHIP, heroLeadership } from '@core/hero/troop.js';
import type { CasillasLeidas } from '@core/map/casillas.js';
import type { MapObject, PathStep } from '@core/map/map.js';
import { createRng, type Rng } from '@core/rng.js';
import {
  type AsaltantesALaVista,
  asaltantesALaVista,
  emboscadaEnLaRuta,
  loQueLaPara,
  type VistaAsaltante,
} from '@core/state/asaltantes.js';
import { type Desenlace, desenlaceDe, finDePartida } from '@core/state/desenlace.js';
import { cronicaPara, type DefeatReason, type GameEventDraft } from '@core/state/events.js';
import {
  applyAdventureAction,
  battleOwners,
  caminoHasta,
  destinoDeRecluta,
  type GameContext,
  type GameState,
  heroById,
  heroeEnLaBase,
  heroesALaVista,
  heroesOf,
  objetosConocidos,
  type Player,
  pasosDeHoy,
  puedeAndarHoy,
  type RecruitCapacity,
  reclutarBlocker,
  recruitCapacity,
  resolvePendingBattle,
  settleBattle,
  sidesOwnedBy,
  townById,
  townsOf,
  turnBlocker,
  visibleNow,
  week,
} from '@core/state/game.js';
import { newGame } from '@core/state/setup.js';
import { building } from '@core/town/buildings.js';
import { construidoEn, sitiosConstruidos } from '@core/town/sitios.js';
import { alcaideDe, vecinosDeLaBase, vozDe } from '@core/town/voces.js';
import {
  esHueco,
  type Hex,
  HUECOS,
  huecoDesconocido,
  type PlayerId,
  type Point,
  type UnitInfo,
} from '@core/types.js';
import { quienesDe } from './desenlace.js';
import type { VistaDeLaBase } from './render/base/escena.js';

/** Lo que dice la barra en la base cuando el ratón no señala nada. */
export const AYUDA_DE_LA_BASE =
  'Pulsa el suelo para andar, un edificio para entrar o a alguien para hablar. Escape vuelve al mapa.';

export type Scene = 'adventure' | 'town' | 'battle';

/**
 * Un paso de la ruta previsualizada: `hoy` si lo alcanza el movimiento del día;
 * `peligro` desde el paso en que un grupo a la vista emboscaría al héroe —ahí se
 * para la marcha—, y ese primer paso lleva además quién (`emboscada`).
 */
interface RoutePreview extends PathStep {
  readonly hoy: boolean;
  readonly peligro: boolean;
  readonly emboscada?: VistaAsaltante;
}

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
interface CalculoDeBatalla {
  acciones: BattleAction[];
  movibles: Hex[];
  opciones: SpellOption[];
  cargas: readonly CasillaDeCarga[];
}

/**
 * El empate por días se cuenta con la misma frase en los dos sitios, y las de
 * victoria y derrota no: al acabar el mapa hay espacio para explicar qué pasó y
 * al cerrar una batalla no. Escrito una vez porque **es** una sola frase; los
 * pares vecinos son dos a propósito.
 */
const SIN_RESOLVER = 'Nadie gana: se han agotado los días.';

/**
 * `ajena` no se alcanza desde aquí: una `Session` siempre lleva un jugador. La
 * fila existe porque la unión la comparte con la crónica, que sí la pinta para
 * el espectador — y prefiero una frase verdadera a un `never` que diga que este
 * caso no puede pasar cuando en el otro lector pasa todos los días.
 */
const FIN_AJENO = 'La partida ha terminado.';

/**
 * Es `Record<…, Record<Desenlace, string>>` y no un `switch`, y eso es el guardia.
 *
 * Con `switch` de sentencia —el que asigna a `this.status` y hace `break`— un
 * cuarto desenlace **no pone nada rojo**: se comprobó plantando uno en la unión
 * y `pnpm typecheck` salía verde por aquí. La tabla lo caza con
 * `TS2741: Property … is missing`, que es lo que hace falta el día que exista
 * otra forma de acabar una partida.
 */
const AL_ACABARSE_EL_MAPA: Record<DefeatReason, Record<Desenlace, string>> = {
  // La regla de la partida: la base cae y su dueño queda fuera. Antes decía
  // «has conquistado el mapa» y «el enemigo se ha quedado con todo», que con
  // perder la base eliminando ya no eran verdad — el derrotado sigue con sus
  // héroes en el mapa (I1 de la 2a).
  lost_base: {
    ganada: '¡Victoria! Has tomado la base rival.',
    perdida: 'Derrota: has perdido tu base.',
    'sin resolver': SIN_RESOLVER,
    ajena: FIN_AJENO,
  },
  nothing_left: {
    ganada: '¡Victoria! El rival no tiene héroes ni ciudades.',
    perdida: 'Derrota: no te quedan héroes ni ciudades.',
    'sin resolver': SIN_RESOLVER,
    ajena: FIN_AJENO,
  },
};

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
 */
export interface ControlDeBatalla {
  readonly battle: BattleState | null;
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
   * Si el siguiente clic en una columna elige el muro de «Poner escalera» o de
   * «Subir» (lo pone el botón cuando hay más de un muro al pie). Solo la arena
   * tiene muralla: en la partida es siempre `null`.
   */
  muroPorElegir: TipoDeEscala | null;
  /**
   * Si el siguiente clic en una portada elige la puerta de «Abrir puerta» o de
   * «Cerrar puerta» (lo pone el botón cuando hay más de una puerta que abrir o
   * cerrar). En la partida, siempre `null`.
   */
  puertaPorElegir: TipoDePuerta | null;
  /**
   * Lo que apunta el siguiente clic en una unidad, o `null`: el hechizo elegido
   * del libro o, en la arena, el poder de la activa que espera un aliado. Es uno
   * solo: elegir uno suelta el otro.
   */
  readonly apuntado: Apuntado | null;
  /** Por qué lo apuntado no vale sobre ese stack, con la frase del núcleo (`castBlocker`, `poderBlocker`). */
  rechazoDeLoApuntado(targetId: string): string;
  playBattleAction(action: BattleAction): void;
}

/**
 * Lo que apunta el siguiente clic en una unidad (`ControlDeBatalla.apuntado`):
 * un hechizo del libro del héroe o un poder de la unidad activa. Los dos se
 * apuntan igual: la jugada sobre ese objetivo sale de la lista legal
 * (`esDeLoApuntado`) y el rechazo lo escribe el núcleo.
 */
export interface Apuntado {
  readonly kind: 'hechizo' | 'poder';
  readonly id: string;
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
const NINGUNA_TUYA = 'Ahora no mueve ninguna unidad tuya.';

type TurnoPropio = { battle: BattleState; stack: BattleStack; side: Side };

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
function accionesDeBatalla(battle: BattleState, turno: TurnoPropio | null): AccionesDeBatalla {
  const { actions: acciones, costs } =
    battle.finished === null ? legalActionsAndCosts(battle) : { actions: [], costs: new Map() };
  return {
    acciones,
    // Los hexes a los que ir son las entradas `move` de la misma lista: antes se
    // pedían aparte con `movableHexes`, que era recorrer el tablero otra vez para
    // dar la misma respuesta.
    movibles: turno === null ? [] : acciones.flatMap((a) => (a.type === 'move' ? [a.to] : [])),
    // Las cargas se enseñan con el movimiento posible (decisión del usuario):
    // salen de `casillasDeCarga`, la misma regla que las cobra.
    // Con el recorrido que ya hizo la lista, si es el de la misma unidad.
    cargas:
      turno === null
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
 * que le quitó la Finta). Es la clave de las
 * cachés de las dos sesiones y la versión de la arena.
 */
function claveDeBatalla(b: BattleState): string {
  return `${b.log.length}|${b.turno === null ? '' : firmaDelTurno(b.turno)}`;
}

/**
 * La clave de las cachés del cálculo de batalla de las dos sesiones: la de
 * `claveDeBatalla` con el maná y el «ya lanzó» de los dos héroes. Van en la clave
 * aunque hoy solo cambien con un `cast` (que ya deja línea): son lo único de lo
 * que dependen los hechizos que no pasa por el registro, y un test que los toca a
 * mano vería una lista vieja.
 */
function claveConMagia(b: BattleState): string {
  const { attacker: ha, defender: hd } = b.heroes;
  return `${claveDeBatalla(b)}|${ha?.mana}|${ha?.castThisRound}|${hd?.mana}|${hd?.castThisRound}`;
}

/** Lo apuntado en la clave de una caché o de la versión: su clase y su id. */
function claveDeLoApuntado(a: Apuntado | null): string {
  return a === null ? '' : `${a.kind}:${a.id}`;
}

/**
 * Por qué la unidad activa no puede actuar contra ese enemigo: ni dispararle ni
 * golpearlo. La frase es del núcleo (`ataqueBlocker`) —«ya se ha movido este
 * turno: no puede disparar…»— y aquí solo se le pone mayúscula y punto. Quien la
 * pide ya ha visto que no hay acción legal contra él, así que el núcleo TIENE que
 * dar motivo.
 */
function motivoContra(turno: TurnoPropio | null, targetId: string): string {
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
function motivoExigido(
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
function motivoDeLaActiva(
  turno: TurnoPropio | null,
  pregunta: (battle: BattleState) => string | null,
): string | null {
  if (turno === null) return NINGUNA_TUYA;
  const motivo = pregunta(turno.battle);
  return motivo === null ? null : comoFrase(motivo);
}

/**
 * Lo que apunta el siguiente clic en una unidad, **uno solo** (`Apuntado`): el
 * hechizo del libro o el poder de la activa. Lo comparten el libro
 * (`LibroDeBatalla`) y los poderes (`PoderesDeLaActiva`) de cada sesión: apuntar
 * uno suelta el otro sin que ninguno se lo diga al otro, y soltar lo que haya es
 * una función (`soltar`): tras una jugada, con Escape, al cerrar la batalla.
 */
export class LoApuntado {
  private valor: Apuntado | null = null;

  /** `alCambiar`: la partida sube su versión; la arena la deriva de aquí. */
  constructor(private readonly alCambiar: () => void = () => {}) {}

  get actual(): Apuntado | null {
    return this.valor;
  }

  /** Apunta `a`, soltando lo que hubiera. */
  apuntar(a: Apuntado): void {
    if (this.valor?.kind === a.kind && this.valor.id === a.id) return;
    this.valor = a;
    this.alCambiar();
  }

  /** Suelta lo apuntado si es de la clase `kind` (o lo que sea, sin ella); dice si soltó algo. */
  soltar(kind?: Apuntado['kind']): boolean {
    if (this.valor === null || (kind !== undefined && this.valor.kind !== kind)) return false;
    this.valor = null;
    this.alCambiar();
    return true;
  }

  /** El id apuntado de la clase `kind`, o `null`. */
  de(kind: Apuntado['kind']): string | null {
    return this.valor?.kind === kind ? this.valor.id : null;
  }
}

/** Por qué lo apuntado no vale sobre `targetId`: la frase del libro o la del poder. */
function rechazoDeLoApuntado(
  hechizos: LibroDeBatalla,
  poderes: PoderesDeLaActiva,
  apuntado: Apuntado | null,
  targetId: string,
): string {
  if (apuntado === null) return '';
  return apuntado.kind === 'hechizo'
    ? hechizos.castRejection(targetId)
    : poderes.rechazo(apuntado.id, targetId);
}

/** Quien juega lo que piden los botones: la sesión de la partida y la de la arena. */
interface QuienJuega {
  readonly turnoPropio: TurnoPropio | null;
  status: string;
  battleLegalActions(): readonly BattleAction[];
  playBattleAction(action: BattleAction): void;
}

/**
 * Lo común a los botones de escala, puerta y poder: con una sola jugada posible
 * (`posibles`), se juega ya; con varias, el siguiente clic en el tablero elige
 * (`esperar(true)` lo deja esperando y la barra dice `pide`), y pulsar el botón
 * otra vez lo cancela; con ninguna, el motivo del núcleo (`motivo`) o `ninguna`.
 */
export function unaOElegir(
  s: Pick<QuienJuega, 'status' | 'playBattleAction'>,
  posibles: readonly BattleAction[],
  o: {
    readonly esperando: boolean;
    readonly esperar: (si: boolean) => void;
    readonly motivo: () => string | null;
    readonly ninguna: string;
    readonly pide: string;
  },
): void {
  const unica = posibles.length === 1 ? posibles[0] : undefined;
  if (unica !== undefined) {
    o.esperar(false);
    s.playBattleAction(unica);
    return;
  }
  if (posibles.length === 0) {
    s.status = o.motivo() ?? o.ninguna;
    return;
  }
  const espera = !o.esperando;
  o.esperar(espera);
  s.status = espera ? o.pide : '';
}

/**
 * Los poderes de la unidad activa (Curar, Bendecir) tal como los usa la persona:
 * el que espera el clic en un aliado (lo apunta su botón cuando hay más de uno) y
 * qué hace el botón. Común a la partida y la arena (F6 de la tarea del combate en
 * el juego, 19-10-2026: la partida no los usaba). Con el hechizo elegido del libro,
 * es lo apuntado (`ControlDeBatalla.apuntado`): elegir uno suelta el otro. Las
 * frases son del núcleo (`poderBlocker`).
 */
export class PoderesDeLaActiva {
  constructor(
    private readonly dueño: QuienJuega,
    private readonly apuntados: LoApuntado,
  ) {}

  /** El poder que espera aliado, o `null`. */
  get apuntado(): PoderId | null {
    return this.apuntados.de('poder');
  }

  /** Deja el poder `id` esperando aliado (soltando el hechizo), o lo suelta con `null`. */
  apuntar(id: PoderId | null): void {
    if (id === null) this.apuntados.soltar('poder');
    else this.apuntados.apuntar({ kind: 'poder', id });
  }

  /** Por qué la activa no puede usar `id` ahora, o `null` si puede (`poderBlocker`). */
  motivo(id: PoderId): string | null {
    return motivoDeLaActiva(this.dueño.turnoPropio, (b) => poderBlocker(b, id));
  }

  /** Por qué el poder apuntado no vale sobre `targetId`, con la frase del núcleo. */
  rechazo(id: PoderId, targetId: string): string {
    return motivoExigido(
      this.dueño.turnoPropio,
      (b) => poderBlocker(b, id, targetId),
      `«${id}» sobre ${targetId}`,
    );
  }

  /**
   * El botón del poder `id`: con un solo aliado posible lo usa ya; sin ninguno, la
   * barra dice por qué; con varios, lo deja esperando el clic en uno (o lo suelta
   * si ya esperaba).
   */
  usar(id: PoderId): void {
    unaOElegir(
      this.dueño,
      this.dueño.battleLegalActions().filter((a) => a.type === 'power' && a.poder === id),
      {
        esperando: this.apuntado === id,
        esperar: (si) => this.apuntar(si ? id : null),
        motivo: () => this.motivo(id),
        ninguna: 'No hay ningún aliado sobre el que usarlo.',
        pide: 'Elige el aliado sobre el que usarlo: pulsa en uno de los marcados, o Escape para cancelar.',
      },
    );
  }
}

/**
 * Por qué la unidad activa no puede ir a ese hex: «ahí hay muro», «la puerta
 * solo la cruza quien defiende», «no llega: le quedan 2 casillas»… La frase es
 * del núcleo (`movimientoBlocker`); antes la escena decía «No puedes llegar a
 * ese hexágono.» para todo, y con una muralla delante no explicaba nada. Quien
 * la pide ya ha visto que no hay `move` allí, así que el núcleo TIENE que dar
 * motivo.
 */
function motivoDeMovimiento(turno: TurnoPropio | null, hex: Hex): string {
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
function jugarIAMientras(
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
function previsionPropia(turno: TurnoPropio | null, accion: BattleAction): Prevision | null {
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
function opcionesDeHechizo(
  turno: TurnoPropio | null,
  acciones: readonly BattleAction[],
): SpellOption[] {
  if (turno === null) return [];
  const hero = turno.battle.heroes[turno.side];
  if (hero === null || hero.spells.length === 0) return [];

  // En el orden del libro, el mismo que el panel del mapa (#54).
  return enOrdenDelLibro(hero.spells).map((sp) => {
    const id = sp.id;
    // Un solo predicado para las tres preguntas —sobre quién, si se puede, y
    // por qué no—: el par (hechizo, objetivo) sale de la lista legal y el
    // motivo lo escribe el núcleo.
    const targets = acciones.flatMap((a) =>
      a.type === 'cast' && a.spell === id && a.target !== undefined ? [a.target] : [],
    );
    const castable = targets.length > 0;
    // Con `castable` verdadero el bloqueo es `null` por construcción, así que
    // solo se pregunta cuando hace falta. Y si no lo es, el núcleo TIENE que
    // dar motivo: las dos respuestas salen de la misma función.
    const motivo = castable ? '' : castBlocker(turno.battle, turno.side, id);
    if (motivo === null) {
      throw new Error(`${sp.name} no se ofrece y el núcleo no dice por qué`);
    }
    return { id, name: sp.name, cost: sp.cost, targets, castable, motivo };
  });
}

/** Lo que el libro necesita de la sesión que lo lleva. */
interface DueñoDelLibro {
  readonly turnoPropio: TurnoPropio | null;
  /** Las opciones de ahora, de la caché de la sesión (`opcionesDeHechizo`). */
  spellOptions(): readonly SpellOption[];
  status: string;
}

/**
 * El hechizo elegido y lo que se hace con él: elegirlo, soltarlo, sobre quién
 * cae y por qué no. Uno para la partida y la arena, que antes solo tenía la
 * partida; cada sesión le da su turno, sus opciones y su barra.
 */
export class LibroDeBatalla implements HechizosDeBatalla {
  constructor(
    private readonly dueño: DueñoDelLibro,
    private readonly apuntados: LoApuntado,
  ) {}

  /** El hechizo elegido: lo apuntado, si es un hechizo (`LoApuntado`). */
  get selectedSpell(): string | null {
    return this.apuntados.de('hechizo');
  }
  set selectedSpell(v: string | null) {
    if (v === null) this.apuntados.soltar('hechizo');
    else this.apuntados.apuntar({ kind: 'hechizo', id: v });
  }

  /** Ids de los stacks sobre los que se puede lanzar el hechizo elegido. */
  castTargets(): readonly string[] {
    const elegido = this.selectedSpell;
    if (elegido === null) return [];
    return this.dueño.spellOptions().find((o) => o.id === elegido)?.targets ?? [];
  }

  /**
   * Por qué el hechizo elegido no se puede lanzar sobre ese stack.
   *
   * Apuntar mal es una regla del juego —a un aliado, a un inmune, a un muerto—,
   * así que la frase la escribe el núcleo y la pantalla solo la enseña. Si el
   * par no está entre las acciones legales, el bloqueador TIENE motivo: son las
   * dos caras de la misma función.
   */
  castRejection(targetId: string): string {
    const turno = this.dueño.turnoPropio;
    const elegido = this.selectedSpell;
    if (turno === null || elegido === null) return '';
    const motivo = castBlocker(turno.battle, turno.side, elegido, targetId);
    if (motivo === null) {
      throw new Error(
        `${spell(elegido).name} no se ofrece sobre ${targetId} y el núcleo no dice por qué`,
      );
    }
    return motivo;
  }

  /** Elige hechizo, o lo suelta si ya estaba elegido. */
  selectSpell(spellId: string): void {
    if (this.selectedSpell === spellId) {
      this.clearSpell();
      return;
    }
    const opcion = this.dueño.spellOptions().find((o) => o.id === spellId);
    if (opcion === undefined) return;
    if (!opcion.castable) {
      this.dueño.status = `No puedes lanzar ${opcion.name}: ${opcion.motivo}.`;
      return;
    }
    this.selectedSpell = spellId;
    this.dueño.status = `${opcion.name}: elige sobre quién lanzarlo.`;
  }

  clearSpell(): void {
    if (this.selectedSpell === null) return;
    this.selectedSpell = null;
    this.dueño.status = '';
  }
}

export class Session implements ControlDeBatalla {
  state: GameState;
  readonly ctx: GameContext;
  /** El jugador que maneja la persona sentada delante. */
  readonly viewer = 0;

  /**
   * Cuántas veces ha cambiado algo que se ve. Sube con cada acción, cada cambio
   * de selección, de escena o de barra de estado.
   *
   * Existe porque `main.ts` repintaba los paneles **sesenta veces por segundo**
   * para descubrir, comparando el marcado ya serializado, que no había cambiado
   * nada. Ahora quien pinta mira este número: si no se ha movido, lo de antes
   * sigue valiendo — los paneles, la lista de lo que hay en el mapa, el
   * minimapa. Los campos de abajo son accesores por eso y no por gusto: una
   * asignación a pelo no subiría la versión y el panel se quedaría viejo.
   */
  get version(): number {
    return this.versionActual;
  }
  private versionActual = 0;
  private tocar(): void {
    this.versionActual++;
  }

  get scene(): Scene {
    return this.escena;
  }
  set scene(v: Scene) {
    this.escena = v;
    this.tocar();
  }
  private escena: Scene = 'adventure';

  get selectedHeroId(): string | null {
    return this.heroeElegido;
  }
  set selectedHeroId(v: string | null) {
    // La pieza elegida es de la mochila de UN héroe: con otro delante, el panel
    // le ofrecía «Ponérsela» a quien no la lleva y el clic acababa en un rechazo.
    if (v !== this.heroeElegido) this.piezaElegida = null;
    this.heroeElegido = v;
    this.tocar();
  }
  private heroeElegido: string | null = null;

  /**
   * El libro de la batalla: el hechizo que la persona ha elegido y está a punto
   * de lanzar sobre alguien, sobre quién cae y por qué no. Vive aquí y no en
   * `main.ts` porque lo lee también el panel; `main.ts` solo guarda estado de
   * píxel. Es el mismo de la arena, y elegir sube la versión.
   */
  /** Lo que apunta el siguiente clic, uno solo: cambiarlo sube la versión. */
  readonly apuntados = new LoApuntado(() => this.tocar());
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this, this.apuntados);
  /** El poder de la activa que espera el clic en un aliado (`PoderesDeLaActiva`, el de la arena). */
  readonly poderes = new PoderesDeLaActiva(this, this.apuntados);

  get openTownId(): string | null {
    return this.puebloAbierto;
  }
  set openTownId(v: string | null) {
    this.puebloAbierto = v;
    this.tocar();
  }
  private puebloAbierto: string | null = null;

  get revealAll(): boolean {
    return this.todoALaVista;
  }
  set revealAll(v: boolean) {
    this.todoALaVista = v;
    this.tocar();
  }
  private todoALaVista = false;

  /**
   * La barra de estado. Es lo único que NO sube la versión, y a propósito: se
   * reescribe a cada casilla que pisa el ratón, ningún panel la lee —`main.ts`
   * la copia a su barra comparando el texto— y subir la versión por ella tiraba
   * a cada paso del ratón todo lo que el mapa guarda entre fotogramas.
   *
   * **Con la partida terminada, la barra es del desenlace** (#162), y la regla
   * está en la lectura, no en cada escritor: #158 c la puso en `señalar` y un
   * clic —`clickTile` → `bloqueoDeTurno`— seguía tapando el «Derrota…» con
   * «la partida ha terminado». Lo que se escriba después se guarda y no se lee
   * hasta otra partida, que es otra sesión: no lo hay.
   */
  get status(): string {
    const desenlace = this.desenlace;
    return desenlace === null ? this.barra : this.alAcabarseElMapa(desenlace);
  }
  set status(texto: string) {
    this.barra = texto;
  }
  private barra = '';

  /** La partida no tiene muralla: no hay muro que elegir (`ControlDeBatalla`). */
  muroPorElegir: TipoDeEscala | null = null;
  /** Ni puerta (`ControlDeBatalla`). */
  puertaPorElegir: TipoDePuerta | null = null;
  /** Lo apuntado: el hechizo del libro o el poder de la activa (desde F6, también en la partida). */
  get apuntado(): Apuntado | null {
    return this.apuntados.actual;
  }

  /** Escape: suelta lo apuntado, hechizo o poder, y limpia la barra que lo pedía. */
  soltarLoApuntado(): void {
    if (this.apuntados.soltar()) this.status = '';
  }

  /** Quien mira la rueda del golpe (`SesionConRueda.quienMira`): la persona, por su bando. */
  get quienMira(): Side | null {
    return this.miBando;
  }

  /**
   * Mientras juegan los rivales no se acepta nada de la persona.
   *
   * Desde que `playAiTurn` es asíncrona, `endTurn()` devuelve antes de que el
   * turno del rival haya terminado: pulsar «fin de turno» dos veces, o entrar
   * en un castillo a construir mientras corre, eran acciones alcanzables que
   * antes no existían. La bandera entra en `isPlayersTurn`, que ya gobierna el
   * botón, los paneles y `clickTile`, así que las cierra las tres de una vez.
   */
  private turnoDelRivalEnCurso = false;

  /**
   * El golpe que espera la rueda: la persona elige por su bando y la IA, a ciegas,
   * por el del rival.
   */
  private readonly rueda: CruceDeLaRueda;

  constructor(seed: number) {
    // La semilla no se guarda aquí: `newGame` la deja en `state.seed`, que es
    // de donde la lee quien la enseña. Un hecho en dos sitios se desincroniza
    // el día que esta capa hable por WebSocket —`this.seed` sería la que pidió
    // el cliente y `state.seed` la que abrió el servidor—.
    this.state = newGame({ seed, controllers: { 0: 'human', 1: 'ai' } });
    this.ctx = { rng: createRng(seed ^ 0x5eed) };
    this.rueda = new CruceDeLaRueda(
      {
        sesion: this,
        alMoverse: () => this.tocar(),
        seguirLaIA: () => this.advanceEnemyTurns(),
      },
      this.ctx.rng,
      (side) => side !== this.miBando,
    );
    this.selectedHeroId = heroesOf(this.state, this.viewer)[0]?.id ?? null;
  }

  // ------------------------------------------------------------ consultas

  get isPlayersTurn(): boolean {
    return (
      this.state.current === this.viewer &&
      this.state.finished === null &&
      !this.turnoDelRivalEnCurso
    );
  }

  /**
   * Por qué acabó la partida para quien mira: la tuya si perdiste, la del último
   * rival eliminado si ganaste, `null` si sigue viva o se agotaron los días. La
   * busca el núcleo (`finDePartida`), que es quien la lee también para el agente.
   */
  get causaDelFinal(): DefeatReason | null {
    return finDePartida(this.state, quienesDe(this.viewer))?.causa ?? null;
  }

  /** Cómo acabó la partida para quien mira, o `null` si sigue viva. */
  get desenlace(): Desenlace | null {
    const fin = this.state.finished;
    return fin === null ? null : desenlaceDe(fin.winner, quienesDe(this.viewer));
  }

  get selectedHero() {
    if (this.selectedHeroId === null) return null;
    return this.state.heroes.find((h) => h.id === this.selectedHeroId) ?? null;
  }

  myHeroes() {
    return heroesOf(this.state, this.viewer);
  }

  myTowns() {
    return townsOf(this.state, this.viewer);
  }

  // ------------------------------------------------- héroes en espera (#17)

  /**
   * Los héroes que la persona ha mandado a dormir: no los ofrece «Siguiente
   * héroe» ni cuentan en el aviso de fin de turno. Es estado de quien juega y
   * no del núcleo, a propósito: no cambia ninguna regla —un héroe dormido anda
   * igual si se le manda—, el agente no lo necesita (decide cada turno por su
   * cuenta) y guardarlo en `GameState` lo habría metido en el volcado del banco
   * y en la serialización para nada. Se guarda por id; el de un héroe que ya no
   * está no estorba, porque solo se pregunta por los que están.
   */
  private readonly dormidos = new Set<string>();

  estaDormido(heroId: string): boolean {
    return this.dormidos.has(heroId);
  }

  /** Duerme al héroe si está despierto y lo despierta si duerme. */
  alternarSueño(heroId: string): void {
    const heroe = this.myHeroes().find((h) => h.id === heroId);
    if (heroe === undefined) {
      this.status = 'Solo puedes dormir o despertar a tus héroes.';
      return;
    }
    const duerme = this.dormidos.delete(heroId);
    if (!duerme) this.dormidos.add(heroId);
    this.status = duerme
      ? `${heroe.name} se despierta.`
      : `${heroe.name} duerme: no se le esperará.`;
    this.tocar();
  }

  /**
   * Los héroes despiertos que todavía pueden dar un paso hoy, en el orden de
   * `myHeroes`. Si dar un paso es posible lo responde el núcleo (`puedeAndarHoy`).
   */
  quienesPuedenAndar(): Hero[] {
    return this.myHeroes().filter((h) => !this.dormidos.has(h.id) && puedeAndarHoy(this.state, h));
  }

  /**
   * Elige al siguiente héroe que aún puede andar, después del elegido y dando la
   * vuelta. Devuelve si eligió a alguien, para que quien lo llama lleve la
   * cámara; si no hay nadie, lo dice la barra.
   */
  siguienteHeroe(): boolean {
    const mios = this.myHeroes();
    const listos = new Set(this.quienesPuedenAndar().map((h) => h.id));
    if (listos.size === 0) {
      this.status =
        mios.length === 0
          ? 'No tienes héroes en el mapa.'
          : 'Ningún héroe despierto puede andar hoy: pasa el turno.';
      return false;
    }
    const desde = mios.findIndex((h) => h.id === this.selectedHeroId);
    for (let k = 1; k <= mios.length; k++) {
      const heroe = mios[(desde + k + mios.length) % mios.length];
      if (heroe === undefined || !listos.has(heroe.id)) continue;
      this.selectedHeroId = heroe.id;
      this.status = `${heroe.name} seleccionado.`;
      return true;
    }
    throw new Error('hay héroes que pueden andar y ninguno está entre los tuyos');
  }

  /**
   * Los héroes por los que se pregunta antes de pasar el turno, mientras la
   * pregunta siga en pie, o `null`. La pregunta vale solo para la versión en que
   * se hizo: cualquier cosa que cambie lo que se ve —mover, elegir otro héroe,
   * dormirlo— la retira sola, y con ella no puede quedarse en pantalla un aviso
   * que ya no es cierto. El clic que confirma no sube la versión antes de llegar.
   */
  get avisoDeFinDeTurno(): readonly Hero[] | null {
    const a = this.aviso;
    return a !== null && a.version === this.version ? a.heroes : null;
  }
  private aviso: { readonly version: number; readonly heroes: readonly Hero[] } | null = null;

  /**
   * ¿Se puede pasar ya el turno sin preguntar? Si quedan héroes despiertos que
   * pueden andar, deja la pregunta en pie (`avisoDeFinDeTurno`) y dice que no.
   * No es un `confirm()` del navegador: la pregunta la pintan los paneles.
   */
  pedirFinDeTurno(): boolean {
    const quienes = this.quienesPuedenAndar();
    if (quienes.length === 0) return true;
    this.tocar();
    this.aviso = { version: this.version, heroes: quienes };
    return false;
  }

  /** «Seguir jugando»: retira la pregunta sin pasar el turno. */
  retirarAvisoDeFinDeTurno(): void {
    if (this.aviso === null) return;
    this.aviso = null;
    this.tocar();
  }

  /** El jugador de la persona: sus recursos y su niebla. */
  get jugador(): Player {
    const propio = this.state.players.find((p) => p.id === this.viewer);
    if (propio === undefined) throw new Error(`el jugador ${this.viewer} no está en la partida`);
    return propio;
  }

  get resources() {
    return this.jugador.resources;
  }

  /** Lo explorado por la persona, o `null` si se ha pedido verlo todo. */
  get explorado(): CasillasLeidas | null {
    return this.revealAll ? null : this.jugador.fog;
  }

  /**
   * La ruta ENTERA del héroe seleccionado hasta `to`, con cada paso marcado
   * según llegue hoy o no.
   *
   * Antes se cortaba en `movePoints` y la pantalla solo sabía pintar lo de hoy:
   * a quien señalaba un castillo a tres días no se le enseñaba por dónde iba a ir.
   * El clic sigue moviendo hasta donde llegue hoy (`moveHeroTo`); lo de otro día
   * es solo para verlo, porque un destino de varios días pediría que el núcleo
   * lo recordara.
   */
  previewPath(to: Point): RoutePreview[] {
    const hero = this.selectedHero;
    if (hero === null || !this.isPlayersTurn) return [];
    const camino = caminoHasta(this.state, hero, to);
    if (camino === null) return [];
    // Con los grupos que la persona ve y no con todos: uno que no se ve no
    // avisa, o la ruta le contaría lo que tapa la niebla.
    const emboscada = emboscadaEnLaRuta(this.state, hero, camino, this.asaltantesALaVista());
    const hoy = pasosDeHoy(camino, hero);
    return camino.map((paso, i) => ({
      ...paso,
      hoy: i < hoy,
      peligro: emboscada !== null && i >= emboscada.paso,
      ...(emboscada !== null && i === emboscada.paso ? { emboscada: emboscada.raider } : {}),
    }));
  }

  /**
   * Las casillas que la persona está mirando AHORA, para la niebla de dos tonos.
   *
   * `visibleNow` recorre héroes y castillos; se pide en cada fotograma, así que se
   * guarda mientras no cambie nada que la mueva: la crónica crece con cada
   * movimiento y captura, y el turno cambia al pasar de día.
   */
  visibles(): CasillasLeidas {
    const clave = `${this.state.log.length}|${this.state.day}|${this.state.current}`;
    if (this.cacheVisibles === null || this.cacheVisibles.clave !== clave) {
      this.cacheVisibles = { clave, casillas: visibleNow(this.state, this.viewer) };
    }
    return this.cacheVisibles.casillas;
  }
  private cacheVisibles: { clave: string; casillas: CasillasLeidas } | null = null;

  /**
   * Los grupos de asaltantes que la persona ve: los que pinta el lienzo, lee la
   * barra y avisan en la ruta. La regla es del núcleo (`asaltantesALaVista`:
   * basta ver su región). Con «Ver mapa entero», todos y sin caché.
   */
  asaltantesALaVista(): AsaltantesALaVista {
    if (this.revealAll) return asaltantesALaVista(this.state, null);
    // Se guarda mientras `visibles()` devuelva las mismas casillas: los grupos se
    // mueven al pasar de día y se van con un hecho de la crónica, que son justo
    // las dos cosas que lo renuevan.
    const mirando = this.visibles();
    if (this.cacheAsaltantes?.mirando !== mirando) {
      this.cacheAsaltantes = { mirando, grupos: asaltantesALaVista(this.state, mirando) };
    }
    return this.cacheAsaltantes.grupos;
  }
  private cacheAsaltantes: {
    mirando: CasillasLeidas;
    grupos: AsaltantesALaVista;
  } | null = null;

  /**
   * Los héroes que la persona ve: los suyos y los rivales que está mirando
   * AHORA. La regla es del núcleo (`heroesALaVista`, la del `enemyHeroes` del
   * agente); la leen el lienzo, el minimapa y la barra. Antes pintaban
   * `state.heroes` recortado por `fog`, y el rival se veía andar por cualquier
   * casilla pisada alguna vez (#64). Son unos pocos: no se guarda.
   */
  heroesALaVista(): readonly Hero[] {
    return heroesALaVista(this.state, this.viewer, this.revealAll ? null : this.visibles());
  }

  /**
   * Los objetos del mapa como los sabe la persona: vivos donde mira ahora y,
   * en lo demás explorado, como los vio por última vez (`objetosConocidos`, la
   * misma regla que el `knownMap` del agente). La bandera de un castillo o un
   * nodo lejano es la de su último dueño visto, no la de hoy (#64).
   *
   * Se guarda mientras `visibles()` devuelva las mismas casillas y no se mueva
   * `version`: el recuerdo crece al explorar, que es andar, y lo vivo cambia con
   * una acción; las dos cosas renuevan una de las dos llaves. El lienzo lo pide a
   * cada fotograma, y el minimapa rehace su fondo cuando cambia este array.
   */
  objetosConocidos(): readonly MapObject[] {
    if (this.revealAll) return this.state.map.objects;
    const mirando = this.visibles();
    const c = this.cacheObjetos;
    if (c !== null && c.mirando === mirando && c.version === this.version) return c.objetos;
    const objetos = objetosConocidos(this.state, this.viewer, mirando).map((r) => r.object);
    this.cacheObjetos = { mirando, version: this.version, objetos };
    return objetos;
  }
  private cacheObjetos: {
    mirando: CasillasLeidas;
    version: number;
    objetos: readonly MapObject[];
  } | null = null;

  /**
   * La crónica que le consta a la persona: lo suyo, el reloj y lo que estaba
   * mirando cuando pasó (`cronicaPara`, la misma regla que la del agente). Iba
   * entera a propósito mientras el lienzo pintaba con `fog`, para que no se
   * viera al rival en el mapa sin una línea que lo contara; con el lienzo en
   * `visibleNow` (#64) iría al revés, contando lo que el mapa calla. Con «Ver
   * mapa entero», entera.
   */
  cronica(cuantos: number): readonly GameEventDraft[] {
    return this.revealAll
      ? this.state.log.slice(-cuantos)
      : cronicaPara(this.state, this.viewer, cuantos);
  }

  /**
   * El liderazgo que ocupa una tropa y su tope: la de un héroe, o la guarnición
   * de un castillo. Las dos por el mismo camino, para que el panel pinte la
   * misma fila con una sola llamada.
   */
  liderazgo(de: { readonly heroe: string } | { readonly guarnicion: string }): {
    ocupado: number;
    tope: number;
  } {
    if ('heroe' in de) {
      const hero = heroById(this.state, de.heroe);
      return { ocupado: armyLeadership(hero.army), tope: heroLeadership(hero) };
    }
    const town = townById(this.state, de.guarnicion);
    return { ocupado: armyLeadership(town.garrison), tope: GARRISON_LEADERSHIP };
  }

  // ------------------------------------------------------------ aventura

  /** Selecciona lo que haya en la casilla, o mueve el héroe hasta ella. */
  clickTile(p: Point): void {
    const bloqueo = this.bloqueoDeTurno();
    if (bloqueo !== null) {
      this.status = bloqueo;
      return;
    }

    const heroeAqui = this.myHeroes().find((h) => h.at.x === p.x && h.at.y === p.y);
    if (heroeAqui !== undefined && heroeAqui.id !== this.selectedHeroId) {
      this.selectedHeroId = heroeAqui.id;
      this.status = `${heroeAqui.name} seleccionado.`;
      return;
    }

    const puebloAqui = this.myTowns().find((t) => t.at.x === p.x && t.at.y === p.y);
    const heroSeleccionado = this.selectedHero;
    if (
      puebloAqui !== undefined &&
      (heroSeleccionado === null || sameTile(heroSeleccionado.at, p))
    ) {
      this.openTown(puebloAqui.id);
      return;
    }

    if (heroSeleccionado === null) {
      this.status = 'No tienes ningún héroe seleccionado.';
      return;
    }

    this.moveHeroTo(heroSeleccionado.id, p);
  }

  moveHeroTo(heroId: string, to: Point): void {
    const hero = heroById(this.state, heroId);
    // Pulsar donde ya está el héroe no es un destino sin camino: el camino es
    // vacío porque ya ha llegado. Decía «No hay camino hasta ahí», que es falso.
    if (sameTile(hero.at, to)) {
      this.status = `${hero.name} ya está en esa casilla: pulsa otra para moverlo.`;
      return;
    }
    // Se manda el destino tal cual: el núcleo anda lo que dé el día y, si no
    // hay camino o no da ni un paso, lo dice él con su frase —quién cierra el
    // paso, si es alguien (M2 de la 2a)—; aquí solo se le pone la mayúscula.
    try {
      applyAdventureAction(
        this.state,
        { type: 'move_hero', hero: heroId, to },
        this.ctx,
        this.viewer,
      );
      this.status = '';
    } catch (err) {
      this.status = comoFrase(mensaje(err));
      return;
    }
    // Mandarlo a andar es despertarlo: si no, se queda fuera de «Siguiente
    // héroe» después de haberlo usado, y es lo que hace el original.
    this.dormidos.delete(heroId);
    this.tocar();

    if (this.state.pendingBattle !== null) {
      this.scene = 'battle';
      this.status = '¡Batalla!';
      // Si la iniciativa la tiene el enemigo, mueve él primero: sin esto la
      // batalla se quedaba esperando a una persona que no podía hacer nada.
      this.advanceEnemyTurns();
      return;
    }

    // La marcha se ha parado al descubrir un grupo que la emboscaría (#130), y
    // se dice. `applyAdventureAction` no devuelve nada: el hecho es el último
    // de la crónica porque la parada vuelve justo después de escribirlo.
    const ultimo = this.state.log.at(-1);
    if (ultimo?.kind === 'march_halted' && ultimo.hero === heroId) {
      this.status = `${hero.name} se detiene: ${loQueLaPara(ultimo.troops)}.`;
      return;
    }

    // Entrar en la base rival vacía acaba la partida, y abría su castillo
    // encima: el fin y su causa se quedaban detrás de una pantalla de compras
    // que ya no sirve de nada.
    if (this.desenlace !== null) return;
    // Donde se quedó, que es el destino o el último paso pagable del día.
    const pueblo = this.myTowns().find((t) => sameTile(t.at, hero.at));
    if (pueblo !== undefined) this.openTown(pueblo.id);
  }

  /** La frase de la barra al acabarse el mapa, por la causa que selló el núcleo. */
  private alAcabarseElMapa(desenlace: Desenlace): string {
    // Sin causa solo se acaba por días, y esa fila es la misma en las dos.
    return AL_ACABARSE_EL_MAPA[this.causaDelFinal ?? 'lost_base'][desenlace];
  }

  async endTurn(): Promise<void> {
    if (!this.isPlayersTurn) return;
    this.aviso = null;
    try {
      applyAdventureAction(this.state, { type: 'end_turn' }, this.ctx, this.viewer);
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    this.turnoDelRivalEnCurso = true;
    this.tocar();
    try {
      await this.runAiTurns();
    } catch (err) {
      // Si el turno del rival revienta, el tablero se quedaba **muerto y mudo**:
      // la bandera bajaba, pero nadie escribía nada, `state.current` se quedaba
      // en la IA, el botón seguía deshabilitado y el fallo solo salía por la
      // consola como `unhandledrejection`. Sigue sin ser tu turno —eso no se
      // puede inventar—, pero ahora se dice por qué.
      this.status = `El turno del rival se ha interrumpido: ${mensaje(err)}`;
    } finally {
      // Pase lo que pase: una bandera que se queda arriba deja el juego mudo
      // para siempre, y eso es peor que el fallo que la dejó ahí.
      this.turnoDelRivalEnCurso = false;
      this.tocar();
    }
  }

  /** Deja que los rivales jueguen hasta que vuelva a tocarle a la persona. */
  private async runAiTurns(): Promise<void> {
    let guard = 0;
    // La condición NO puede ser `!this.isPlayersTurn`: con la bandera dentro de
    // ese getter es falso mientras corre esto, y el bucle daría las 20 vueltas
    // del guardia jugando días enteros de golpe. Se pregunta por el estado.
    while (this.state.finished === null && this.state.current !== this.viewer && guard < 20) {
      // Las batallas en las que el rival ataca a la persona las juega ella
      // (#116, `defender`). Si una se quedara a medias, la IA pelearía por ella,
      // pero sin rendirse: rendirse le cobra su oro y esa decisión es solo suya
      // (H-1 de la fase 1b).
      await playAiTurn(this.state, this.ctx, { batallas: { human: () => this.defender() } });
      guard++;
    }
    // Si se acabó, la barra ya dice cómo (`status`).
    if (this.desenlace === null) this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
  }

  /**
   * La persona juega las batallas en las que la atacan (#116), rueda incluida: el
   * turno del rival se para en la batalla que acaba de nacer, la escena pasa a ella
   * y se espera a que la persona la cierre («Continuar» o «Resolver sola», que
   * pasan por `afterBattle`). Es el `BattleTakeover` de `playAiTurn`, el mismo
   * contrato que el del agente: si te la quedas, la cierras. Una batalla que no va
   * con la persona no se toca: la cierra la IA.
   */
  private async defender(): Promise<void> {
    if (this.miBando === null) return;
    const cerrada = new Promise<void>((resolve) => {
      this.alCerrarLaDefensa = resolve;
    });
    this.scene = 'battle';
    this.status = '¡Te atacan! Defiéndete.';
    // Si la iniciativa la tiene el rival, mueve él primero.
    this.advanceEnemyTurns();
    // Lo que juega el rival llega sin un gesto de la persona: quien pinta no sabría
    // que hay una batalla que enseñar.
    this.alCambiarSinGesto();
    await cerrada;
  }

  /** Quien cierra la defensa en curso y deja seguir el turno del rival, o `null`. */
  private alCerrarLaDefensa: (() => void) | null = null;

  /**
   * Lo que se llama cuando algo que se ve cambia sin un gesto de la persona (una
   * defensa que se abre a media jugada del rival). Lo pone quien pinta, para
   * pedir fotograma; por defecto, nada.
   */
  alCambiarSinGesto: () => void = () => {};

  // ------------------------------------------------------------ castillo

  /**
   * Lo que `heroId` aprendió la última vez que aprendió en `townId`, o nada. Lo
   * lee el panel del castillo (#54): es la crónica, leída aquí, que es lo único
   * que dice que el aprendizaje OCURRIÓ y no solo que el gremio lo ofrece.
   */
  aprendidoEn(heroId: string, townId: string): readonly string[] {
    for (let i = this.state.log.length - 1; i >= 0; i--) {
      const e = this.state.log[i];
      if (e?.kind !== 'spells_learned') continue;
      if (e.hero === heroId && e.town === townId) return e.spells;
    }
    return [];
  }

  openTown(townId: string): void {
    this.aperturas++;
    this.openTownId = townId;
    this.scene = 'town';
    // Lo que decía la barra era del mapa («haz clic en el mapa para mover a tu
    // héroe»): en la base no significa nada.
    this.status = AYUDA_DE_LA_BASE;
  }

  /**
   * Cuántas veces se ha abierto una base en esta sesión. La escena de la base
   * (`EscenaBase`) empieza en la entrada y sin nada abierto cada vez que cambia,
   * también al volver a la misma base.
   */
  get aperturaDeLaBase(): number {
    return this.aperturas;
  }
  private aperturas = 0;

  closeTown(): void {
    this.openTownId = null;
    this.scene = 'adventure';
    // El último rótulo del castillo hablaba de solares y reclutas: fuera de
    // allí no significa nada.
    this.status = '';
  }

  /** El castillo abierto ahora mismo, o `null` si no hay ninguno. */
  get activeTown(): ReturnType<typeof townById> | null {
    if (this.openTownId === null) return null;
    return townById(this.state, this.openTownId);
  }

  /**
   * El héroe PROPIO que está en la base abierta, o `null`. Solo los propios: un
   * rival parado en tu castillo no te enseña su ejército ni camina por tu base.
   */
  heroeEnLaBase(): Hero | null {
    const town = this.activeTown;
    return town === null ? null : heroeEnLaBase(this.state, this.viewer, town);
  }

  /**
   * Lo que se ve en la base abierta (`render/base/`): qué se ha levantado en
   * cada sitio, quién hay y qué dice hoy, y quién camina —el héroe si está
   * dentro, si no el alcaide—. Se rehace cuando cambia la partida (`version`),
   * no en cada fotograma.
   *
   * Lo que dicen es SIEMPRE el respaldo en el navegador: esta sesión juega en
   * local y nunca habla con el agente, así que `Town.voces` no se escribe aquí.
   */
  vistaDeLaBase(): VistaDeLaBase | null {
    const town = this.activeTown;
    if (town === null) return null;
    const c = this.cacheDeLaBase;
    if (c !== null && c.version === this.version && c.townId === town.id) return c.vista;
    const semana = week(this.state);
    const heroe = this.heroeEnLaBase();
    const alcaide = alcaideDe(town.faction);
    const vista: VistaDeLaBase = {
      faccion: town.faction,
      townId: town.id,
      owner: town.owner,
      edificios: sitiosConstruidos(town).map((sitio) => {
        const edificio = construidoEn(town, sitio) as string;
        return { sitio, edificio, nombre: building(edificio).name };
      }),
      gente: vecinosDeLaBase(town).map((v) => ({
        id: v.id,
        nombre: v.nombre,
        papel: v.papel,
        sitio: v.sitio,
        clave: v.clave,
        linea: vozDe(town, v.id, semana, this.state.day),
      })),
      caminante:
        heroe === null
          ? { id: `alcaide-${town.id}`, nombre: alcaide.nombre, cuerpo: alcaide.cuerpo }
          : { id: heroe.id, nombre: heroe.name, cuerpo: HERO_BODY },
    };
    this.cacheDeLaBase = { version: this.version, townId: town.id, vista };
    return vista;
  }
  private cacheDeLaBase: { version: number; townId: string; vista: VistaDeLaBase } | null = null;

  build(buildingId: string): void {
    if (this.openTownId === null) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'build', town: this.openTownId as string, building: buildingId },
        this.ctx,
        this.viewer,
      ),
    );
  }

  /**
   * Cuánto se puede reclutar de esa criatura en el castillo abierto: lo que hay,
   * lo que cabe y lo que se paga. La cuenta es la del núcleo (`recruitCapacity`),
   * la misma con la que planifica la IA, así que «todo» pide justo lo que el
   * núcleo acepta.
   */
  recruitPlan(creatureId: string): RecruitCapacity | null {
    const town = this.activeTown;
    if (town === null || town.owner === null) return null;
    return recruitCapacity(town, creatureId, destinoDeRecluta(this.state, town), this.resources);
  }

  /**
   * Por qué no se puede reclutar ni uno de esa criatura en el castillo abierto,
   * o `null`: la frase del núcleo (`reclutarBlocker`), la misma con que lanzaría
   * la acción. Con ella el panel apaga «+1» y «Todo» en vez de ofrecerlos.
   */
  motivoParaNoReclutar(creatureId: string): string | null {
    const town = this.activeTown;
    if (town === null || town.owner === null) return null;
    return reclutarBlocker(town, creatureId, 1, destinoDeRecluta(this.state, town), this.resources);
  }

  /**
   * «Todo»: lo que cabe y se paga, no lo que hay. Si no cabe ni uno se pide uno,
   * para que el motivo lo escriba el núcleo en vez de redactarlo aquí.
   */
  recruitAll(creatureId: string): void {
    const plan = this.recruitPlan(creatureId);
    if (plan === null) return;
    this.recruit(creatureId, Math.max(1, plan.maximo));
  }

  recruit(creatureId: string, count: number): void {
    if (this.openTownId === null || count <= 0) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'recruit', town: this.openTownId as string, creature: creatureId, count },
        this.ctx,
        this.viewer,
      ),
    );
  }

  /**
   * Licenciar `count` individuos de un héroe. Sin comprobar nada aquí: el
   * motivo de un rechazo lo escribe el núcleo (`dismissBlocker`) y sale en la
   * barra, como el de reclutar.
   */
  dismiss(heroId: string, creatureId: string, count: number): void {
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'dismiss', hero: heroId, creature: creatureId, count },
        this.ctx,
        this.viewer,
      ),
    );
  }

  // ------------------------------------------------------------ equipo

  /**
   * La pieza de la mochila que la persona ha elegido para ponérsela a alguien,
   * o `null`. Es estado de vista, como el hechizo elegido: lo leen el panel del
   * héroe —que enseña «Equipar» donde se puede— y el clic que la pone.
   */
  get selectedItem(): string | null {
    // Se pregunta al leer y no se apunta al cambiar: la pieza puede dejar la
    // mochila por más caminos que un clic —el héroe muere, se la pone otro
    // panel, la licencia…— y cada uno tendría que acordarse de soltarla.
    const item = this.piezaElegida;
    if (item === null) return null;
    return this.selectedHero?.mochila.includes(item) === true ? item : null;
  }
  private piezaElegida: string | null = null;

  /** Elegir una pieza de la mochila del héroe elegido; elegir la misma otra vez la suelta. */
  selectItem(itemId: string): void {
    this.piezaElegida = this.selectedItem === itemId ? null : itemId;
    this.tocar();
  }

  /**
   * Comprar `itemId` en la armería del castillo abierto, para la mochila del
   * héroe que está dentro. El motivo de un rechazo lo escribe el núcleo
   * (`buyBlocker`) y sale en la barra.
   */
  buyItem(itemId: string): void {
    if (this.openTownId === null) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'buy_item', town: this.openTownId as string, item: itemId },
        this.ctx,
        this.viewer,
      ),
    );
  }

  /**
   * Ponerle la pieza elegida al héroe (`a` vacío), a un individuo con hoja
   * (`veteran`) o al primer novato sin equipar de un tipo (`creature`). Al
   * acabar, bien o mal, la pieza deja de estar elegida.
   */
  equip(heroId: string, a: { readonly veteran?: string; readonly creature?: string } = {}): void {
    const item = this.selectedItem;
    if (item === null) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'equip', hero: heroId, item, ...a },
        this.ctx,
        this.viewer,
      ),
    );
    this.piezaElegida = null;
    this.tocar();
  }

  /**
   * Quitar la pieza del hueco `slot` al héroe o al individuo `veteran`, a la
   * mochila. El hueco llega del marcado como texto: esta es su puerta al núcleo,
   * y uno que no lo es sale en la barra con su motivo.
   */
  unequip(heroId: string, slot: string, veteran?: string): void {
    this.run(() => {
      if (!esHueco(slot)) throw new Error(huecoDesconocido(slot, HUECOS));
      applyAdventureAction(
        this.state,
        {
          type: 'unequip',
          hero: heroId,
          slot,
          ...(veteran === undefined ? {} : { veteran }),
        },
        this.ctx,
        this.viewer,
      );
    });
  }

  hireHero(): void {
    if (this.openTownId === null) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'hire_hero', town: this.openTownId as string },
        this.ctx,
        this.viewer,
      ),
    );
  }

  // ------------------------------------------------------------ batalla

  get battle(): BattleState | null {
    return this.state.pendingBattle?.battle ?? null;
  }

  /**
   * El bando de la persona en la batalla pendiente, DERIVADO del dueño.
   *
   * Suponer `attacker` colaba mientras la persona solo jugaba las batallas que
   * empezaba ella. Pero es la misma suposición que el ciclo de #29 quitó del
   * servidor, y aquí quedaban seis: el día que la persona pueda defender —o que
   * esta capa hable por WebSocket, que es lo que anuncia la cabecera— pintaría
   * los stacks del enemigo como propios, le preguntaría a `castBlocker` por el
   * héroe equivocado y dejaría al rival mover con la IA en su propio turno.
   *
   * La derivación es literalmente la del director (`sidesOwnedBy`), así que las
   * dos mitades del arreglo no pueden separarse. `null` es «esta batalla no va
   * conmigo»: nada que mover y ningún turno propio.
   */
  get dueños(): Readonly<Record<Side, PlayerId | null>> | null {
    const pending = this.state.pendingBattle;
    return pending === null ? null : battleOwners(this.state, pending);
  }

  get miBando(): Side | null {
    const pending = this.state.pendingBattle;
    if (pending === null) return null;
    const bandos = sidesOwnedBy(this.state, pending, [this.viewer]);
    // Con los dos bandos en la misma mano se juega el atacante, que es quien
    // inició: es lo mismo que decide el director cuando el agente lleva a los dos.
    if (bandos.has('attacker')) return 'attacker';
    return bandos.has('defender') ? 'defender' : null;
  }

  /**
   * La batalla y su stack activo, pero solo cuando el turno es de verdad de la
   * persona. Son las cuatro guardas de «¿me toca?», escritas una vez: estaban
   * copiadas en `battleMovable` y en `spellOptions`, y la escena de batalla las
   * volvía a escribir para saber si marcar objetivos. Ahora la lee también ella.
   */
  get turnoPropio(): TurnoPropio | null {
    const battle = this.battle;
    if (battle === null || battle.finished !== null) return null;
    const side = this.miBando;
    const stack = activeStack(battle);
    if (side === null || stack === null || stack.side !== side) return null;
    return { battle, stack, side };
  }

  /**
   * Las acciones legales y lo que se deriva de ellas, guardado mientras la
   * batalla no se mueva.
   *
   * La escena las pide en cada fotograma, y cada petición era el BFS del tablero
   * más un `castBlocker` por hechizo y objetivo. Toda acción aplicada deja una
   * línea en el registro y mueve el turno —su ordinal, o lo gastado en él—, así
   * que la clave es esa —el patrón de `visibles()`—, con la batalla por
   * identidad delante: una batalla nueva empieza con el registro corto y podría
   * coincidir.
   */
  private calculoDeBatalla(): CalculoDeBatalla {
    const battle = this.battle;
    if (battle === null) return { acciones: [], movibles: [], opciones: [], cargas: SIN_CARGAS };
    const clave = `${claveConMagia(battle)}|${claveDeLoApuntado(this.apuntados.actual)}`;
    const c = this.cacheBatalla;
    if (c !== null && c.battle === battle && c.clave === clave) return c.valor;
    const comunes = accionesDeBatalla(battle, this.turnoPropio);
    const valor = { ...comunes, opciones: opcionesDeHechizo(this.turnoPropio, comunes.acciones) };
    this.cacheBatalla = { battle, clave, valor };
    return valor;
  }
  private cacheBatalla: {
    battle: BattleState;
    clave: string;
    valor: CalculoDeBatalla;
  } | null = null;

  /**
   * Las cargas que tiene a mano la unidad activa: contra qué enemigo, desde qué
   * casilla y con cuántas casillas. Vacío si no es tuya o no carga.
   */
  battleCharges(): readonly CasillaDeCarga[] {
    return this.calculoDeBatalla().cargas;
  }

  /** Las casillas que le quedan este turno a la unidad activa, si es tuya. */
  battleStepsLeft(): number | null {
    const turno = this.turnoPropio;
    return turno === null ? null : pasosQueQuedan(turno.battle, turno.stack);
  }

  /** Hexes a los que puede ir el stack activo, si es de la persona. */
  battleMovable(): readonly Hex[] {
    return this.calculoDeBatalla().movibles;
  }

  battleLegalActions(): readonly BattleAction[] {
    return this.calculoDeBatalla().acciones;
  }

  /** El héroe de la persona en la batalla en curso, el de SU bando. */
  get battleHero() {
    const bando = this.miBando;
    if (bando === null) return null;
    return this.battle?.heroes[bando] ?? null;
  }

  /** El libro tal y como se pinta (`opcionesDeHechizo`), de la caché. */
  spellOptions(): readonly SpellOption[] {
    return this.calculoDeBatalla().opciones;
  }

  /**
   * Por qué la unidad activa no puede actuar contra ese enemigo: ni dispararle
   * ni golpearlo. Como `LibroDeBatalla.castRejection`, la frase es del núcleo (`ataqueBlocker`)
   * —«ya se ha movido este turno: no puede disparar…»— y aquí solo se le pone
   * mayúscula y punto. Quien la pide ya ha visto que no hay acción legal contra
   * él, así que el núcleo TIENE que dar motivo.
   */
  attackRejection(targetId: string): string {
    return motivoContra(this.turnoPropio, targetId);
  }

  prevision(action: BattleAction): Prevision | null {
    return previsionPropia(this.turnoPropio, action);
  }

  moveRejection(hex: Hex): string {
    return motivoDeMovimiento(this.turnoPropio, hex);
  }

  rechazoDeLoApuntado(targetId: string): string {
    return rechazoDeLoApuntado(this.hechizos, this.poderes, this.apuntado, targetId);
  }

  /** Por qué la activa no puede usar el poder `p` ahora, o `null` (el botón deshabilitado). */
  motivoDePoder(p: PoderId): string | null {
    return this.poderes.motivo(p);
  }

  /**
   * La rendición tal y como se pinta: cuánto costaría y, si no se puede, por
   * qué. Las dos cosas las da el núcleo en una llamada (`surrenderBlocker`),
   * igual que el motivo de un hechizo sale de `castBlocker`; la pantalla no
   * decide nada. `null` cuando no es el turno de la persona.
   */
  surrenderOption(): { readonly coste: number; readonly motivo: string | null } | null {
    const turno = this.turnoPropio;
    if (turno === null) return null;
    return surrenderBlocker(turno.battle, turno.side);
  }

  /**
   * El golpe que espera la rueda, si lo hay (`CruceDeLaRueda`, el mismo de la
   * arena): la persona elige su golpe y, cuando la golpean cuerpo a cuerpo, su
   * respuesta, sin ver lo del otro. Sin batalla, ninguno.
   */
  get ruedaPendiente(): RuedaPendiente | null {
    return this.battle === null ? null : this.rueda.pendiente;
  }

  /**
   * Por qué los botones de la batalla no hacen nada mientras la rueda espera, o
   * `null` (`motivoDeLaRueda`): el panel los apaga con esta frase en su `title`.
   */
  get motivoDeLaRueda(): string | null {
    return motivoDeLaRueda(this.ruedaPendiente);
  }

  /**
   * Aplica la acción de la persona y deja que la IA juegue lo suyo. Un golpe
   * cuerpo a cuerpo no se da de una vez: quien pega anda hasta su objetivo y la
   * rueda (`ruedaPendiente`) espera su elección (`elegirEnLaRueda`).
   */
  playBattleAction(action: BattleAction): void {
    if (this.battle !== null) this.rueda.jugar(this.battle, action);
  }

  /** Lo que elige la persona en la rueda (`CruceDeLaRueda.elegirYJugar`). */
  elegirEnLaRueda(tipo: string): void {
    if (this.battle !== null) this.rueda.elegirYJugar(this.battle, tipo);
  }

  /** Escape en la rueda (`CruceDeLaRueda.cancelarGolpe`). Devuelve si se canceló. */
  cancelarGolpe(): boolean {
    return this.battle !== null && this.rueda.cancelarGolpe(this.battle);
  }

  /**
   * Deja que la IA mueva mientras el turno NO sea del bando de la persona. Si la
   * IA golpea cuerpo a cuerpo a una unidad de la persona, se para: anda hasta ella
   * y la rueda pide la respuesta.
   */
  advanceEnemyTurns(): void {
    const battle = this.battle;
    const mio = this.miBando;
    if (battle === null || mio === null) return;
    const jugadas = jugarIAMientras(
      battle,
      this.ctx.rng,
      (s) => s.side !== mio,
      (a) => this.rueda.completar(battle, a),
    );
    if (jugadas > 0 || this.rueda.pendiente !== null) this.tocar();
    if (battle.finished !== null) this.status = 'La batalla ha terminado.';
  }

  /** Resuelve el resto de la batalla con la IA en ambos bandos. */
  autoResolveBattle(): void {
    if (this.state.pendingBattle === null) return;
    // Con un golpe plantado ante la rueda, la IA no sabría qué hacer con él.
    if (this.rueda.pendiente !== null) {
      this.status = comoFrase(ELIGE_EN_LA_RUEDA);
      return;
    }
    // Delegar la batalla no es delegar el oro: la IA no se rinde por la persona.
    resolvePendingBattle(this.state, this.ctx);
    this.afterBattle();
  }

  /** Cierra la batalla terminada y vuelve al mapa. */
  finishBattle(): void {
    const battle = this.battle;
    if (battle === null || battle.finished === null) return;
    settleBattle(this.state, this.ctx);
    this.afterBattle();
  }

  private afterBattle(): void {
    // Si era una defensa (#116), el turno del rival sigue desde aquí.
    const defensa = this.alCerrarLaDefensa;
    this.alCerrarLaDefensa = null;
    defensa?.();
    this.scene = 'adventure';
    this.apuntados.soltar();
    if (this.selectedHero === null) {
      this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
    }
    // «¡Batalla!» se quedaba en la barra ya de vuelta en el mapa: se borra. Si
    // la batalla cerró la partida, la barra dice cómo sin que se escriba aquí
    // (`status`); antes era un «¡Victoria!» a secas, sin la causa.
    this.status = '';
  }

  // ------------------------------------------------------------ interno

  /**
   * Las acciones del castillo, con la guarda de turno delante.
   *
   * `build`, `recruit` y `hireHero` no la tenían: mientras el turno fue
   * síncrono no había un instante en el que pulsarlas fuera de turno, y desde
   * que no lo es sí. El núcleo también las rechaza —lo cierran los dos lados—,
   * pero aquí se dice antes y sin excepción.
   */
  private run(fn: () => void): void {
    const bloqueo = this.bloqueoDeTurno();
    if (bloqueo !== null) {
      this.status = bloqueo;
      return;
    }
    try {
      fn();
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
    }
    this.tocar();
  }

  /**
   * Por qué no se puede jugar ahora, o `null`. **La frase la escribe el núcleo.**
   *
   * Había tres redacciones de esto —una en `game.ts` y dos aquí— y la única que
   * decía QUIÉN está jugando era la del núcleo, que no se veía nunca porque el
   * cliente comprobaba el turno antes de llamar. Ahora el cliente enseña y no
   * redacta, igual que hace con `buildBlocker` en la pantalla de castillo.
   *
   * La excepción es la ventana de la bandera: mientras el turno del rival se
   * está resolviendo dentro de esta misma sesión, `state.current` ya puede ser
   * el nuestro y el núcleo diría que sí es tu turno. Eso el núcleo no lo sabe ni
   * tiene por qué, así que esa frase —y solo esa— la pone el cliente.
   */
  private bloqueoDeTurno(): string | null {
    if (this.isPlayersTurn) return null;
    return (
      turnBlocker(this.state, this.viewer) ?? 'Espera: el turno del rival aún se está resolviendo.'
    );
  }
}

/**
 * Un lado del montaje para la sesión: sus unidades y su héroe (`LadoDeArena`) y
 * quién lo mueve, entero: la persona o la IA.
 */
export type LadoDeSesion = LadoDeArena & { readonly ia: boolean };

/**
 * La batalla de la arena (`/arena/`): dos bandos de unidades del borrador o del
 * catálogo, con un héroe cada uno si se quiere, sin partida alrededor, y en cada
 * unidad decide la persona o la IA. Las reglas son las del juego (`createBattle`),
 * las mismas para los dos lados.
 *
 * Vive aquí porque `session.ts` es la única puerta del cliente al núcleo —lo
 * vigila `invariantes.test.ts`—, y la arena aplica reglas igual que la partida.
 * Qué bandos lleva la IA se decide al montar y no cambia. Cuál es el «bando de
 * la persona» se deriva de la unidad activa, porque la persona puede llevar los
 * dos lados.
 *
 * **Montar no es empezar.** El constructor deja la batalla en su primera
 * jugada, y la IA no mueve hasta `empezar()`. Así quien la pinta puede mirar el
 * tablero de salida antes: cuando la IA jugaba ya en el constructor, el animador
 * veía la batalla por primera vez con todo eso hecho, lo daba por contado y, con
 * todas las unidades en IA, solo se veía el final (H1 de QA).
 *
 * La magia es la de la partida (`LibroDeBatalla`): lanza el héroe del lado de la
 * unidad que mueve la persona, con su maná y una vez por ronda.
 */
export class SesionDeArena implements ControlDeBatalla {
  readonly battle: BattleState;
  readonly semilla: number;
  /**
   * El catálogo con que se pelea: las unidades del montaje y sus piezas
   * (`catalogoDelMontaje`). La batalla no lo lleva, así que el retoque lo pide de
   * aquí y aquí deja lo retocado (`retocar`), y de aquí sale el cuerpo sin equipo
   * de cada stack (`cuerpoDe`).
   */
  private catalogo: CatalogoDeLaArena;
  /** Lo que apunta el siguiente clic, uno solo (la versión lo lee de aquí). */
  readonly apuntados = new LoApuntado();
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this, this.apuntados);
  /** El poder de la activa que espera el clic en un aliado (`PoderesDeLaActiva`). */
  readonly poderes = new PoderesDeLaActiva(this, this.apuntados);
  /** En la arena los bandos no son de ningún jugador: los dos llevan su color de bando. */
  readonly dueños = null;
  private readonly rng: Rng;
  /** Qué bandos mueve la IA, enteros: sus unidades y su héroe. */
  private readonly iaDelBando: Readonly<Record<Side, boolean>>;
  /** El golpe que espera la rueda: la IA elige por sus bandos y la persona por los suyos. */
  private readonly rueda: CruceDeLaRueda;
  private empezada = false;

  /**
   * Lo que mira el panel para repintarse: cambia con cada jugada y con el hechizo
   * elegido, que es lo mismo que mira la caché. No hay contador aparte que se
   * pueda desacompasar.
   */
  get version(): string {
    return `${claveDeBatalla(this.battle)}|${claveDeLoApuntado(this.apuntados.actual)}|${this.rueda.pendiente?.fase ?? ''}`;
  }

  /**
   * El golpe que espera la rueda, si lo hay (`CruceDeLaRueda`, el mismo de la
   * partida): la fase, quién pega a quién, qué bando elige y lo que daría cada
   * tipo, sin lo que eligió el otro.
   */
  get ruedaPendiente(): RuedaPendiente | null {
    return this.rueda.pendiente;
  }

  /** Lo mismo que en `Session` (`motivoDeLaRueda`). */
  get motivoDeLaRueda(): string | null {
    return motivoDeLaRueda(this.ruedaPendiente);
  }

  /** No es parte de la versión, por lo mismo que en `Session`: la reescribe el puntero. */
  status = '';

  /** El botón de la escala esperando el clic en una columna (`ControlDeBatalla`). */
  muroPorElegir: TipoDeEscala | null = null;
  /** El botón de la puerta esperando el clic en una portada (`ControlDeBatalla`). */
  puertaPorElegir: TipoDePuerta | null = null;
  get apuntado(): Apuntado | null {
    return this.apuntados.actual;
  }

  /** Escape: suelta lo apuntado, hechizo o poder, y limpia la barra que lo pedía. */
  soltarLoApuntado(): void {
    if (this.apuntados.soltar()) this.status = '';
  }

  rechazoDeLoApuntado(targetId: string): string {
    return rechazoDeLoApuntado(this.hechizos, this.poderes, this.apuntado, targetId);
  }

  /**
   * El cuerpo de `s` sin lo que lleva, con el catálogo de esta pelea (`cuerpoDe`):
   * lo que el panel resta para decir qué le suma el equipo.
   */
  cuerpoDe(s: BattleStack): UnitInfo | null {
    return cuerpoDe(s, this.catalogo);
  }

  constructor(
    montaje: {
      readonly izquierda: LadoDeSesion;
      readonly derecha: LadoDeSesion;
      /** La muralla del tablero; sin ella, ninguna (`SIN_MURALLA`). */
      readonly muralla?: MurallaDeBatalla;
      /** El catálogo de equipo con que se pelea, hecho (`catalogoDeEquipo`, o `EQUIPO_DEL_JUEGO`). */
      readonly equipo: CatalogoDeEquipo;
    },
    semilla: number,
  ) {
    this.semilla = semilla;
    this.rng = createRng(semilla);
    const delMontaje = {
      izquierda: montaje.izquierda,
      derecha: montaje.derecha,
      muralla: montaje.muralla ?? SIN_MURALLA,
      equipo: montaje.equipo,
    };
    this.catalogo = catalogoDelMontaje(delMontaje);
    this.battle = batallaDeArena(delMontaje, this.rng);
    this.iaDelBando = {
      [LADOS.izquierda.bando]: montaje.izquierda.ia,
      [LADOS.derecha.bando]: montaje.derecha.ia,
    } as Record<Side, boolean>;
    this.rueda = new CruceDeLaRueda(
      { sesion: this, alMoverse: () => {}, seguirLaIA: () => this.avanzarIA() },
      this.rng,
      (side) => this.iaDelBando[side],
    );
  }

  /**
   * Arranca la pelea: la IA juega hasta la primera unidad de la persona, o
   * entera si las lleva todas. Una vez: llamarla dos veces es un error de quien
   * monta.
   */
  empezar(): void {
    if (this.empezada) throw new Error('esta batalla de la arena ya ha empezado');
    this.empezada = true;
    this.avanzarIA();
  }

  /** ¿Esta unidad la mueve la IA? La de un bando de la IA. */
  laLlevaLaIA(stackId: string): boolean {
    return this.iaDelBando[stackById(this.battle, stackId).side];
  }

  get turnoPropio(): TurnoPropio | null {
    const battle = this.battle;
    if (!this.empezada || battle.finished !== null) return null;
    const stack = activeStack(battle);
    if (stack === null || this.iaDelBando[stack.side]) return null;
    return { battle, stack, side: stack.side };
  }

  get miBando(): Side | null {
    return this.turnoPropio?.side ?? null;
  }

  /**
   * Quien mira la rueda del golpe (`SesionConRueda.quienMira`): el bando de la
   * persona si lleva uno solo; con los dos suyos (o ninguno), `null`, y la rueda
   * los dice por su lado del campo.
   */
  get quienMira(): Side | null {
    const suyos = (['attacker', 'defender'] as const).filter((b) => !this.iaDelBando[b]);
    return suyos.length === 1 ? (suyos[0] as Side) : null;
  }

  /** Como en `Session`, guardado por jugada: la escena lo pide en cada fotograma. */
  private calculo(): CalculoDeBatalla {
    const clave = `${claveConMagia(this.battle)}|${this.empezada}`;
    if (this.cache !== null && this.cache.clave === clave) return this.cache.valor;
    const turno = this.turnoPropio;
    const comunes = accionesDeBatalla(this.battle, turno);
    const valor = { ...comunes, opciones: opcionesDeHechizo(turno, comunes.acciones) };
    this.cache = { clave, valor };
    return valor;
  }
  private cache: { clave: string; valor: CalculoDeBatalla } | null = null;

  battleLegalActions(): readonly BattleAction[] {
    return this.calculo().acciones;
  }

  battleMovable(): readonly Hex[] {
    return this.calculo().movibles;
  }

  battleCharges(): readonly CasillaDeCarga[] {
    return this.calculo().cargas;
  }

  /** El libro del héroe del lado que mueve la persona, como en la partida. */
  spellOptions(): readonly SpellOption[] {
    return this.calculo().opciones;
  }

  /**
   * El héroe del lado de la unidad activa de la persona, con su maná máximo
   * (`maxMana`, la regla del núcleo), o `null`.
   */
  get heroeEnJuego(): { readonly mando: BattleHero; readonly manaMaximo: number } | null {
    const turno = this.turnoPropio;
    const mando = turno === null ? null : this.battle.heroes[turno.side];
    return mando === null ? null : { mando, manaMaximo: maxMana(mando) };
  }

  /** Las casillas que le quedan este turno a la unidad activa, si es de la persona. */
  battleStepsLeft(): number | null {
    const turno = this.turnoPropio;
    return turno === null ? null : pasosQueQuedan(turno.battle, turno.stack);
  }

  /**
   * Por qué la unidad activa de la persona no puede salir de su casilla
   * (`contactoBlocker`: rodeada, lo que le queda no paga salir), como frase, o
   * `null`. El panel lo dice sin que se señale ninguna casilla.
   */
  sinSalida(): string | null {
    const turno = this.turnoPropio;
    const motivo = turno === null ? null : contactoBlocker(turno.battle, turno.stack);
    return motivo === null ? null : comoFrase(motivo);
  }

  /**
   * Si la unidad activa de la persona ha golpeado con Finta y le queda solo el
   * tramo de andar (`faseDelTurno`): el panel lo dice en vez de invitar a golpear
   * (R2 de QA de #263).
   */
  trasLaFinta(): boolean {
    const turno = this.turnoPropio;
    return turno !== null && faseDelTurno(turno.battle) === 'trasLaFinta';
  }

  attackRejection(targetId: string): string {
    return motivoContra(this.turnoPropio, targetId);
  }

  prevision(action: BattleAction): Prevision | null {
    return previsionPropia(this.turnoPropio, action);
  }

  moveRejection(hex: Hex): string {
    return motivoDeMovimiento(this.turnoPropio, hex);
  }

  /**
   * Por qué la unidad activa —tuya— no puede poner su escalera o subir contra
   * ningún muro de su pie (`escalaBlocker`), como frase; `null` si puede. Lo
   * pinta el botón deshabilitado.
   */
  motivoDeEscala(tipo: TipoDeEscala): string | null {
    return motivoDeLaActiva(this.turnoPropio, (b) => escalaBlocker(b, tipo));
  }

  /**
   * Por qué la unidad activa —tuya— no puede abrir (o cerrar) ninguna puerta
   * (`puertasBlocker`), como frase; `null` si puede alguna. Lo pinta el botón
   * deshabilitado.
   */
  motivoDePuerta(tipo: TipoDePuerta): string | null {
    return motivoDeLaActiva(this.turnoPropio, (b) => puertasBlocker(b, tipo));
  }

  /**
   * Si `s` no escala nunca (`quienNoEscala`: defiende, dos casillas, vuela), el
   * motivo; `null` si puede llegar a escalar. Con él, sus botones de escala no
   * salen: al defensor le ocupaban sitio siempre deshabilitados (QA, M5).
   */
  noEscalaNunca(s: BattleStack): string | null {
    return quienNoEscala(s.side, s.unit);
  }

  /** Lo que suma a la defensa de `s` estar en lo alto (`bonoEnLoAlto`), para la ficha. */
  defensaEnLoAlto(s: BattleStack): number {
    return bonoEnLoAlto(this.battle, s);
  }

  /**
   * Por qué la unidad activa —tuya— no puede usar ese poder sobre nadie
   * (`poderBlocker`), como frase; `null` si puede. Lo pinta el botón deshabilitado.
   */
  motivoDePoder(p: PoderId): string | null {
    return this.poderes.motivo(p);
  }

  /**
   * Cambia las cifras de un tipo, o del héroe de un lado, en la pelea en curso
   * (`retocarEnBatalla`): devuelve el motivo si no entra, sin tocar nada, o `null`
   * si ha entrado. El turno y lo elegido se conservan; lo elegido que con las
   * cifras nuevas ya no se puede jugar se suelta y la barra lo dice.
   */
  retocar(r: RetoqueDeArena): string | null {
    // Con la rueda a medias, la acción guardada se juega con las cifras de
    // cuando se eligió: cambiarlas debajo podría dejarla ilegal.
    if (this.rueda.pendiente !== null) return comoFrase(ELIGE_EN_LA_RUEDA);
    const largo = this.battle.log.length;
    const motivo = retocarEnBatalla(this.battle, r, this.catalogo);
    if (motivo !== null) return comoFrase(motivo);
    if (r.kind === 'piezas') this.catalogo = { ...this.catalogo, equipo: r.equipo };
    if (r.kind === 'tipo') this.catalogo = conUnidad(this.catalogo, r.fuente.unidad);
    // Lo que entra y cambia algo deja su `retoque` en el registro; lo que deja la
    // ficha como estaba no escribe nada, y no se dice «Cambiado» (N1 de QA).
    if (this.battle.log.length === largo) {
      // Una pieza que nadie de esta pelea lleva, o un cambio que no mueve ninguna
      // cifra (su nombre, su precio), entra igual y vale para la siguiente.
      this.status =
        r.kind === 'piezas'
          ? 'Ninguna cifra de esta pelea cambia con eso: vale para la pelea siguiente.'
          : 'Sin cambios: la ficha ya decía eso.';
      return null;
    }
    const suelto = this.soltarLoQueNoVale();
    this.status =
      suelto === null
        ? 'Cambiado: vale ya en esta pelea.'
        : `Cambiado: vale ya en esta pelea. Con las cifras nuevas no se puede usar ${suelto}: suelto.`;
    return null;
  }

  /**
   * Suelta lo apuntado si la lista legal ya no trae ninguna jugada suya, y dice
   * qué soltó (su nombre), o `null` si nada. Lo apuntado es uno solo, así que se
   * suelta como mucho una cosa.
   */
  private soltarLoQueNoVale(): string | null {
    const a = this.apuntado;
    if (a === null || this.battleLegalActions().some((x) => esDeLoApuntado(a, x))) return null;
    this.apuntados.soltar();
    return a.kind === 'hechizo' ? spell(a.id).name : poder(a.id).nombre;
  }

  /**
   * Aplica la jugada de la persona y deja a la IA mover las suyas hasta la
   * siguiente. Con la rueda, un golpe cuerpo a cuerpo sin elegir no se da: quien
   * pega anda hasta su objetivo y la rueda (`ruedaPendiente`) espera su elección.
   */
  playBattleAction(action: BattleAction): void {
    this.rueda.jugar(this.battle, action);
  }

  /** Lo que elige en la rueda quien le toca (`CruceDeLaRueda.elegirYJugar`). */
  elegirEnLaRueda(tipo: string): void {
    this.rueda.elegirYJugar(this.battle, tipo);
  }

  /** Escape en la rueda (`CruceDeLaRueda.cancelarGolpe`). Devuelve si se canceló. */
  cancelarGolpe(): boolean {
    return this.rueda.cancelarGolpe(this.battle);
  }

  /**
   * Con todas en IA la batalla se juega entera aquí, de una vez: el animador la
   * cuenta después. Con la rueda, la IA elige su golpe a ciegas; si golpea a una
   * unidad de la persona, se para y la rueda pide la respuesta.
   */
  private avanzarIA(): void {
    jugarIAMientras(
      this.battle,
      this.rng,
      (s) => this.iaDelBando[s.side],
      (accion) => this.rueda.completar(this.battle, accion),
    );
    if (this.battle.finished !== null) this.status = 'La batalla ha terminado.';
  }
}

/** Lo que dice la barra a quien quiere hacer otra cosa con la rueda abierta. */
const ELIGE_EN_LA_RUEDA = 'elige antes en la rueda del golpe';

/**
 * Por qué no se juega nada más con la rueda abierta, como frase, o `null` si no
 * espera nada. La misma de la barra (`ELIGE_EN_LA_RUEDA`): con ella el panel apaga
 * sus botones, que con el diálogo modal encima no recibían el clic y se veían
 * encendidos (H3 de QA, 19-10-2026).
 */
function motivoDeLaRueda(pendiente: RuedaPendiente | null): string | null {
  return pendiente === null ? null : comoFrase(ELIGE_EN_LA_RUEDA);
}

/**
 * El golpe que espera la rueda (`battle/rueda.ts`) y lo que se hace con él, para
 * las dos sesiones: la de la partida y la de la arena eligen igual (F5 de la tarea
 * del combate en el juego, 19-10-2026; antes vivía solo en la arena). Cada una
 * dice quién lleva cada bando (`laLlevaLaIA`): lo de la IA lo sortea
 * `completarCruce` a ciegas, y lo de la persona espera aquí.
 *
 * Primero se anda y luego se elige (decisión del usuario, 13-10-2026): un golpe
 * al que le falta lo de una persona planta a quien pega ante su objetivo (el
 * `attack` sin elecciones, `BattleState.golpeEnCurso`) y abre la fase; la vista
 * abre el diálogo cuando el animador acaba la marcha. En la fase `golpe` elige
 * quien pega, y la acción va sin golpe; en `respuesta`, quien recibe, y la acción
 * lleva ya el golpe elegido, que **no sale de aquí**: `pendiente` enseña la fase,
 * no la elección del otro.
 *
 * Solo hay un golpe a la vez y es de la batalla en la que se plantó: quien lo
 * lleva no deja jugar otra cosa mientras espera (`ELIGE_EN_LA_RUEDA`).
 */
export class CruceDeLaRueda {
  private cruce: {
    readonly accion: BattleAction & { type: 'attack' };
    readonly pendiente: RuedaPendiente;
  } | null = null;

  constructor(
    private readonly conductor: ConductorDelCruce,
    private readonly rng: Rng,
    private readonly laLlevaLaIA: (side: Side) => boolean,
  ) {}

  /**
   * La jugada de la persona (`playBattleAction` de las dos sesiones): con la rueda
   * abierta o sin turno propio no se acepta, y la barra dice por qué. Un golpe
   * cuerpo a cuerpo sin elegir anda y abre la fase del golpe (`completar`):
   * plantarse hace las comprobaciones del golpe antes de andar, así que uno que no
   * se puede dar no mueve a nadie ni abre la rueda. Lo demás, se aplica.
   */
  jugar(battle: BattleState, accion: BattleAction): void {
    const { sesion } = this.conductor;
    if (this.cruce !== null) {
      sesion.status = comoFrase(ELIGE_EN_LA_RUEDA);
      return;
    }
    if (sesion.turnoPropio === null) {
      sesion.status = NINGUNA_TUYA;
      return;
    }
    let lista: BattleAction | null;
    try {
      lista = this.completar(battle, accion);
    } catch (err) {
      sesion.status = mensaje(err);
      return;
    }
    // Plantado, la rueda espera: el tablero cuenta la marcha y luego se abre.
    this.conductor.alMoverse();
    if (lista === null) sesion.status = '';
    else this.aplicar(battle, lista);
  }

  /** Lo que elige quien le toca en la rueda (`elegir`), y la jugada si ya está lista. */
  elegirYJugar(battle: BattleState, tipo: string): void {
    let lista: BattleAction | null;
    try {
      lista = this.elegir(battle, tipo);
    } catch (err) {
      this.conductor.sesion.status = mensaje(err);
      return;
    }
    this.conductor.alMoverse();
    if (lista !== null) this.aplicar(battle, lista);
  }

  /** Escape en la rueda (`cancelar`), y la IA sigue si le toca. Devuelve si se canceló. */
  cancelarGolpe(battle: BattleState): boolean {
    const { sesion } = this.conductor;
    try {
      sesion.status = this.cancelar(battle);
    } catch (err) {
      sesion.status = mensaje(err);
      return false;
    }
    this.conductor.alMoverse();
    this.conductor.seguirLaIA();
    return true;
  }

  /**
   * Aplica una jugada lista y deja a la IA mover lo suyo. Una jugada aplicada deja
   * lo apuntado sin sentido —el hechizo ya se lanzó, o la unidad activa es otra—:
   * se suelta aquí y no en cada llamante.
   */
  private aplicar(battle: BattleState, accion: BattleAction): void {
    const { sesion } = this.conductor;
    try {
      applyAction(battle, accion, this.rng);
      this.conductor.alMoverse();
      sesion.status = '';
    } catch (err) {
      sesion.status = mensaje(err);
      return;
    }
    sesion.apuntados.soltar();
    this.conductor.seguirLaIA();
  }

  /**
   * Lo que la rueda enseña ahora, o `null` si no espera a nadie. Se calcula una
   * vez, al abrir la fase (con la rueda abierta la batalla no se mueve), y es el
   * mismo objeto mientras dura: quien pinta repinta al cambiar.
   */
  get pendiente(): RuedaPendiente | null {
    return this.cruce?.pendiente ?? null;
  }

  /**
   * Un paso del cruce (`pasoDelCruce`, el mismo del director): la acción con lo de
   * la rueda que le toque a la IA y lista para darse; o, si falta lo de una
   * persona, `null`: quien pega se ha plantado ante su objetivo y la rueda queda
   * abierta en su fase. Lo que no es un golpe, la misma acción. Lanza con la frase
   * del núcleo si plantarse no vale: uno que no se puede dar no mueve a nadie.
   */
  completar(battle: BattleState, accion: BattleAction): BattleAction | null {
    const paso = pasoDelCruce(battle, accion, this.rng, this.laLlevaLaIA);
    if ('lista' in paso) return paso.lista;
    const atacante = activeStack(battle);
    if (atacante === null) throw new Error('la rueda espera un golpe y no le toca a nadie');
    this.cruce = {
      accion: paso.accion,
      pendiente: {
        fase: paso.falta,
        atacante,
        objetivo: stackById(battle, paso.accion.target),
        bando: paso.bando,
        prevision: previsionDeLaRueda(battle, paso.accion, paso.falta),
      },
    };
    return null;
  }

  /**
   * Lo que elige quien le toca: en la fase `golpe`, quien pega; si el objetivo es
   * de la IA, ella responde a ciegas y sale la acción lista, y si es de una
   * persona, la rueda pasa a la `respuesta` sin enseñar el golpe (`null`). En la
   * `respuesta`, la acción lista. `tipo` llega del marcado: uno que no es un tipo,
   * o una rueda que no espera nada, lanza con la frase para la barra.
   */
  elegir(battle: BattleState, tipo: string): BattleAction | null {
    const c = this.cruce;
    if (c === null) throw new Error('La rueda no espera ninguna elección.');
    if (!esTipoDeGolpe(tipo)) throw new Error(`${tipoDeGolpeBlocker(tipo)}.`);
    const elegido: Partial<Record<PapelEnLaRueda, TipoDeGolpe>> = { [c.pendiente.fase]: tipo };
    this.cruce = null;
    return this.completar(battle, { ...c.accion, ...elegido });
  }

  /**
   * Escape en la rueda: deja el golpe sin dar, solo antes de elegirlo. Quien pega
   * ya anduvo: se queda donde llegó y sigue su turno, sin la carga de esa carrera
   * (`soltarElGolpe`); si no le queda nada, el turno se cierra y juega quien siga
   * (eso lo hace la sesión). La respuesta no se cancela: el golpe ya viene, y lanza
   * diciéndolo. Devuelve la frase de la barra.
   */
  cancelar(battle: BattleState): string {
    if (this.cruce?.pendiente.fase !== 'golpe') {
      throw new Error(
        this.cruce === null
          ? 'La rueda no espera ninguna elección.'
          : 'El golpe ya viene: elige la respuesta en la rueda.',
      );
    }
    // La carga de la carrera se pierde al soltar: se dice (R6 de QA de #260).
    const conCarga = this.cruce.pendiente.prevision.carga !== null;
    this.cruce = null;
    soltarElGolpe(battle, this.rng);
    return conCarga ? 'Golpe cancelado: se pierde la carga.' : 'Golpe cancelado.';
  }
}

/**
 * Lo que el cruce pide de la sesión que lo conduce (la de la partida y la de la
 * arena): su barra, su turno y lo apuntado; qué hace cuando la batalla se mueve
 * (la partida sube su versión; la arena la deriva de la batalla) y cómo sigue la
 * IA hasta la siguiente jugada de la persona.
 */
interface ConductorDelCruce {
  readonly sesion: {
    status: string;
    readonly turnoPropio: TurnoPropio | null;
    readonly apuntados: LoApuntado;
  };
  readonly alMoverse: () => void;
  readonly seguirLaIA: () => void;
}

/** Lo que la rueda enseña a quien elige (`CruceDeLaRueda.pendiente`). */
export interface RuedaPendiente {
  readonly fase: PapelEnLaRueda;
  readonly atacante: BattleStack;
  readonly objetivo: BattleStack;
  /** El bando que elige ahora. */
  readonly bando: Side;
  readonly prevision: ReturnType<typeof previsionDeLaRueda>;
}

function sameTile(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Los errores del núcleo llevan un mensaje escrito para la persona. */
function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Un motivo del núcleo («no quedan puntos…») como frase de la barra. */
function comoFrase(motivo: string): string {
  return `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.`;
}
