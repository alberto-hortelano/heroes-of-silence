/**
 * Sesión de juego del cliente.
 *
 * Es la única puerta del cliente al núcleo: las vistas piden cosas aquí y
 * pintan lo que devuelve, nunca tocan el `GameState` por su cuenta. Cuando
 * llegue el bridge por WebSocket, lo que cambia es esta capa y solo esta.
 */
import { chooseBattleAction } from '@core/ai/tactics.js';
import { playAiTurn } from '@core/ai/turn.js';
import {
  batallaDeArena,
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
  escalaBlocker,
  legalActions,
  MAX_JUGADAS,
  movimientoBlocker,
  type Prevision,
  pasosQueQuedan,
  poderBlocker,
  previsionDe,
  puertasBlocker,
  quienNoEscala,
  SIN_CARGAS,
  stackById,
  surrenderBlocker,
} from '@core/battle/battle.js';
import { bonoEnLoAlto, type MurallaDeBatalla, SIN_MURALLA } from '@core/battle/muralla.js';
import { type PoderId, poder } from '@core/battle/poderes.js';
import type { ReglasDeBatalla } from '@core/battle/reglas.js';
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
      : a.type === 'poder' && a.poder === apuntado.id;
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
  const acciones = battle.finished === null ? legalActions(battle) : [];
  return {
    acciones,
    // Los hexes a los que ir son las entradas `move` de la misma lista: antes se
    // pedían aparte con `movableHexes`, que era recorrer el tablero otra vez para
    // dar la misma respuesta.
    movibles: turno === null ? [] : acciones.flatMap((a) => (a.type === 'move' ? [a.to] : [])),
    // Las cargas se enseñan con el movimiento posible (decisión del usuario):
    // salen de `casillasDeCarga`, la misma regla que las cobra.
    cargas: turno === null ? SIN_CARGAS : casillasDeCarga(turno.battle, turno.stack),
  };
}

/**
 * «¿Se ha movido la batalla?»: toda acción aplicada deja una línea en el
 * registro y mueve el turno —su ordinal, o lo gastado en él—. Es la clave de las
 * cachés de las dos sesiones y la versión de la arena.
 */
function claveDeBatalla(b: BattleState): string {
  return `${b.log.length}|${b.turno?.n}|${b.turno?.gastado}`;
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
 * arena solo cambian el predicado. Al tope (`MAX_JUGADAS`) **lanza**, en las
 * dos: un bucle que no avanza no se corta callando.
 */
function jugarIAMientras(
  battle: BattleState,
  rng: Rng,
  laLlevaLaIA: (s: BattleStack) => boolean,
): number {
  let jugadas = 0;
  while (battle.finished === null) {
    const s = activeStack(battle);
    if (s === null || !laLlevaLaIA(s)) break;
    if (jugadas >= MAX_JUGADAS) {
      throw new Error(`la IA lleva ${MAX_JUGADAS} jugadas seguidas sin soltar la batalla`);
    }
    applyAction(battle, chooseBattleAction(battle), rng);
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
  private elegido: string | null = null;

  constructor(
    private readonly dueño: DueñoDelLibro,
    private readonly alCambiar: () => void = () => {},
  ) {}

  get selectedSpell(): string | null {
    return this.elegido;
  }
  set selectedSpell(v: string | null) {
    this.elegido = v;
    this.alCambiar();
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
  /** Por quién no se rinde nunca la IA de reglas: por la persona (H-1 de la 1b). */
  private readonly sinRendirsePorMi: ReadonlySet<PlayerId> = new Set([this.viewer]);

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
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this, () => this.tocar());

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
  /** Lo apuntado, en la partida, solo puede ser un hechizo: la tropa del juego no tiene poderes. */
  get apuntado(): Apuntado | null {
    const id = this.hechizos.selectedSpell;
    return id === null ? null : { kind: 'hechizo', id };
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

  constructor(seed: number) {
    // La semilla no se guarda aquí: `newGame` la deja en `state.seed`, que es
    // de donde la lee quien la enseña. Un hecho en dos sitios se desincroniza
    // el día que esta capa hable por WebSocket —`this.seed` sería la que pidió
    // el cliente y `state.seed` la que abrió el servidor—.
    this.state = newGame({ seed, controllers: { 0: 'human', 1: 'ai' } });
    this.ctx = { rng: createRng(seed ^ 0x5eed) };
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
      // La IA de reglas resuelve también las batallas en las que el rival ataca
      // a la persona; por ella pelea, pero no se rinde: rendirse le cobra su oro
      // y esa decisión es solo suya (H-1 de la fase 1b).
      await playAiTurn(this.state, this.ctx, { noSeRinden: this.sinRendirsePorMi });
      guard++;
    }
    // Si se acabó, la barra ya dice cómo (`status`).
    if (this.desenlace === null) this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
  }

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
    const clave = `${claveConMagia(battle)}|${this.hechizos.selectedSpell}`;
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
    return this.hechizos.castRejection(targetId);
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

  /** Aplica la acción de la persona y deja que la IA juegue lo suyo. */
  playBattleAction(action: BattleAction): void {
    const battle = this.battle;
    if (battle === null) return;
    try {
      applyAction(battle, action, this.ctx.rng);
      this.tocar();
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    // Una acción aplicada deja el hechizo elegido sin sentido: o se acaba de
    // lanzar —y el héroe ya no puede volver a lanzar esta ronda— o el stack
    // activo ha cambiado. Se suelta aquí y no en cada llamante.
    this.hechizos.selectedSpell = null;
    this.advanceEnemyTurns();
  }

  /** Deja que la IA mueva mientras el turno NO sea del bando de la persona. */
  advanceEnemyTurns(): void {
    const battle = this.battle;
    const mio = this.miBando;
    if (battle === null || mio === null) return;
    if (jugarIAMientras(battle, this.ctx.rng, (s) => s.side !== mio) > 0) this.tocar();
    if (battle.finished !== null) this.status = 'La batalla ha terminado.';
  }

  /** Resuelve el resto de la batalla con la IA en ambos bandos. */
  autoResolveBattle(): void {
    if (this.state.pendingBattle === null) return;
    // Delegar la batalla no es delegar el oro: la IA no se rinde por la persona.
    resolvePendingBattle(this.state, this.ctx, this.sinRendirsePorMi);
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
    this.scene = 'adventure';
    this.hechizos.selectedSpell = null;
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
 * unidad decide la persona o la IA. Las reglas (`reglas.ts`) son las del montaje,
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
  readonly reglas: ReglasDeBatalla;
  /** Elegir un hechizo suelta el poder apuntado: el clic apunta una sola cosa (`apuntado`). */
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this, () => {
    if (this.hechizos.selectedSpell !== null) this.poderApuntado = null;
  });
  /** En la arena los bandos no son de ningún jugador: los dos llevan su color de bando. */
  readonly dueños = null;
  private readonly rng: Rng;
  /** Qué bandos mueve la IA, enteros: sus unidades y su héroe. */
  private readonly iaDelBando: Readonly<Record<Side, boolean>>;
  private empezada = false;

  /**
   * Lo que mira el panel para repintarse: cambia con cada jugada y con el hechizo
   * elegido, que es lo mismo que mira la caché. No hay contador aparte que se
   * pueda desacompasar.
   */
  get version(): string {
    return `${claveDeBatalla(this.battle)}|${this.hechizos.selectedSpell}|${this.poderApuntado}`;
  }

  /** No es parte de la versión, por lo mismo que en `Session`: la reescribe el puntero. */
  status = '';

  /** El botón de la escala esperando el clic en una columna (`ControlDeBatalla`). */
  muroPorElegir: TipoDeEscala | null = null;
  /** El botón de la puerta esperando el clic en una portada (`ControlDeBatalla`). */
  puertaPorElegir: TipoDePuerta | null = null;
  /**
   * El poder de la activa que espera el clic en un aliado (lo pone su botón
   * cuando hay más de uno). Con el hechizo elegido del libro, es lo apuntado
   * (`apuntado`): elegir uno suelta el otro (`apuntarPoder` y el libro).
   */
  private poderApuntado: PoderId | null = null;

  get apuntado(): Apuntado | null {
    const hechizo = this.hechizos.selectedSpell;
    if (hechizo !== null) return { kind: 'hechizo', id: hechizo };
    return this.poderApuntado === null ? null : { kind: 'poder', id: this.poderApuntado };
  }

  /** Deja el poder `id` esperando aliado (o lo suelta con `null`), soltando el hechizo. */
  apuntarPoder(id: PoderId | null): void {
    if (id !== null) this.hechizos.selectedSpell = null;
    this.poderApuntado = id;
  }

  rechazoDeLoApuntado(targetId: string): string {
    const a = this.apuntado;
    if (a === null) return '';
    if (a.kind === 'hechizo') return this.hechizos.castRejection(targetId);
    return motivoExigido(
      this.turnoPropio,
      (b) => poderBlocker(b, a.id, targetId),
      `«${a.id}» sobre ${targetId}`,
    );
  }

  constructor(
    montaje: {
      readonly izquierda: LadoDeSesion;
      readonly derecha: LadoDeSesion;
      readonly reglas: ReglasDeBatalla;
      /** La muralla del tablero; sin ella, ninguna (`SIN_MURALLA`). */
      readonly muralla?: MurallaDeBatalla;
    },
    semilla: number,
  ) {
    this.semilla = semilla;
    this.reglas = montaje.reglas;
    this.rng = createRng(semilla);
    this.battle = batallaDeArena(
      {
        izquierda: montaje.izquierda,
        derecha: montaje.derecha,
        reglas: montaje.reglas,
        muralla: montaje.muralla ?? SIN_MURALLA,
      },
      this.rng,
    );
    this.iaDelBando = {
      [LADOS.izquierda.bando]: montaje.izquierda.ia,
      [LADOS.derecha.bando]: montaje.derecha.ia,
    } as Record<Side, boolean>;
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
    return motivoDeLaActiva(this.turnoPropio, (b) => poderBlocker(b, p));
  }

  /**
   * Cambia las cifras de un tipo, o del héroe de un lado, en la pelea en curso
   * (`retocarEnBatalla`): devuelve el motivo si no entra, sin tocar nada, o `null`
   * si ha entrado. El turno y lo elegido se conservan; lo elegido que con las
   * cifras nuevas ya no se puede jugar se suelta y la barra lo dice.
   */
  retocar(r: RetoqueDeArena): string | null {
    const largo = this.battle.log.length;
    const motivo = retocarEnBatalla(this.battle, r);
    if (motivo !== null) return comoFrase(motivo);
    // Lo que entra y cambia algo deja su `retoque` en el registro; lo que deja la
    // ficha como estaba no escribe nada, y no se dice «Cambiado» (N1 de QA).
    if (this.battle.log.length === largo) {
      this.status = 'Sin cambios: la ficha ya decía eso.';
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
    this.hechizos.selectedSpell = null;
    this.poderApuntado = null;
    return a.kind === 'hechizo' ? spell(a.id).name : poder(a.id).nombre;
  }

  /** Aplica la jugada de la persona y deja a la IA mover las suyas hasta la siguiente. */
  playBattleAction(action: BattleAction): void {
    if (this.turnoPropio === null) {
      this.status = NINGUNA_TUYA;
      return;
    }
    try {
      applyAction(this.battle, action, this.rng);
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    // Como en la partida: lanzado el hechizo, o con otra unidad activa, lo
    // apuntado ya no tiene sentido, se pueda aún o no.
    this.hechizos.selectedSpell = null;
    this.poderApuntado = null;
    this.avanzarIA();
  }

  /** Con todas en IA la batalla se juega entera aquí, de una vez: el animador la cuenta después. */
  private avanzarIA(): void {
    jugarIAMientras(this.battle, this.rng, (s) => this.iaDelBando[s.side]);
    if (this.battle.finished !== null) this.status = 'La batalla ha terminado.';
  }
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
