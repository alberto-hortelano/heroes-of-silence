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
  type FuenteDeArena,
  type HeroeDeArena,
  LADOS,
  type Lado,
} from '@core/arena.js';
import {
  activeStack,
  applyAction,
  ataqueBlocker,
  type CasillaDeCarga,
  casillasDeCarga,
  castBlocker,
  legalActions,
  MAX_JUGADAS,
  type Prevision,
  pasosQueQuedan,
  previsionDe,
  SIN_CARGAS,
  surrenderBlocker,
} from '@core/battle/battle.js';
import type { ReglasDeBatalla } from '@core/battle/reglas.js';
import { enOrdenDelLibro, spell } from '@core/battle/spells.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
} from '@core/battle/types.js';
import { type Hero, maxMana } from '@core/hero/hero.js';
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
  heroesALaVista,
  heroesOf,
  objetosConocidos,
  type Player,
  pasosDeHoy,
  puedeAndarHoy,
  type RecruitCapacity,
  recruitCapacity,
  resolvePendingBattle,
  settleBattle,
  sidesOwnedBy,
  townById,
  townsOf,
  turnBlocker,
  visibleNow,
} from '@core/state/game.js';
import { newGame } from '@core/state/setup.js';
import type { Hex, PlayerId, Point } from '@core/types.js';
import { quienesDe } from './desenlace.js';

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
  playBattleAction(action: BattleAction): void;
}

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
  if (turno === null) return '';
  const motivo = ataqueBlocker(turno.battle, targetId);
  if (motivo === null) {
    throw new Error(`no se ofrece ninguna acción contra ${targetId} y el núcleo no dice por qué`);
  }
  return comoFrase(motivo);
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
    this.openTownId = townId;
    this.scene = 'town';
  }

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

  /** Quitar la pieza del hueco `slot` al héroe o al individuo `veteran`, a la mochila. */
  unequip(heroId: string, slot: string, veteran?: string): void {
    this.run(() =>
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
      ),
    );
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

/** Una unidad del montaje de la arena: de dónde sale y quién la mueve. */
export interface PuestoDeArena {
  readonly fuente: FuenteDeArena;
  readonly ia: boolean;
}

/** Un lado del montaje para la sesión: sus puestos y su héroe, con quién lo mueve. */
export interface LadoDeSesion {
  readonly puestos: readonly PuestoDeArena[];
  readonly heroe: { readonly datos: HeroeDeArena; readonly ia: boolean } | null;
}

/**
 * La batalla de la arena (`/arena/`): dos bandos de unidades del borrador o del
 * catálogo, con un héroe cada uno si se quiere, sin partida alrededor, y en cada
 * unidad decide la persona o la IA. Las reglas (`reglas.ts`) son las del montaje,
 * las mismas para los dos lados.
 *
 * Vive aquí porque `session.ts` es la única puerta del cliente al núcleo —lo
 * vigila `invariantes.test.ts`—, y la arena aplica reglas igual que la partida.
 * Qué unidades lleva la IA se decide al montar y no cambia: es un conjunto de
 * ids de stack. Cuál es el «bando de la persona» se deriva de la unidad activa,
 * porque la persona puede llevar unidades de los dos lados.
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
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this);
  /** En la arena los bandos no son de ningún jugador: los dos llevan su color de bando. */
  readonly dueños = null;
  private readonly rng: Rng;
  private readonly manejaIA: ReadonlySet<string>;
  private empezada = false;

  /**
   * Lo que mira el panel para repintarse: cambia con cada jugada y con el hechizo
   * elegido, que es lo mismo que mira la caché. No hay contador aparte que se
   * pueda desacompasar.
   */
  get version(): string {
    return `${claveDeBatalla(this.battle)}|${this.hechizos.selectedSpell}`;
  }

  /** No es parte de la versión, por lo mismo que en `Session`: la reescribe el puntero. */
  status = '';

  constructor(
    montaje: {
      readonly izquierda: LadoDeSesion;
      readonly derecha: LadoDeSesion;
      readonly reglas: ReglasDeBatalla;
    },
    semilla: number,
  ) {
    this.semilla = semilla;
    this.reglas = montaje.reglas;
    this.rng = createRng(semilla);
    const lado = (l: LadoDeSesion) => ({
      unidades: l.puestos.map((p) => p.fuente),
      heroe: l.heroe?.datos ?? null,
    });
    this.battle = batallaDeArena(
      {
        izquierda: lado(montaje.izquierda),
        derecha: lado(montaje.derecha),
        reglas: montaje.reglas,
      },
      this.rng,
    );
    // El stack de cada puesto, por bando y `slot`, que es como lo monta el motor;
    // no por el formato del id, que es cosa suya. El héroe, por su origen.
    const ia = new Set<string>();
    for (const l of ['izquierda', 'derecha'] as const satisfies readonly Lado[]) {
      const bando = LADOS[l].bando;
      const { puestos, heroe } = montaje[l];
      puestos.forEach((p, slot) => {
        const st = this.battle.stacks.find(
          (s) => s.side === bando && s.slot === slot && s.origen.kind !== 'heroe',
        );
        if (st === undefined)
          throw new Error(
            `el puesto ${slot + 1} del bando ${LADOS[l].adjetivo} no ha salido al campo`,
          );
        if (p.ia) ia.add(st.id);
      });
      if (heroe !== null) {
        const st = this.battle.stacks.find((s) => s.side === bando && s.origen.kind === 'heroe');
        if (st === undefined)
          throw new Error(`el héroe del bando ${LADOS[l].adjetivo} no ha salido al campo`);
        if (heroe.ia) ia.add(st.id);
      }
    }
    this.manejaIA = ia;
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

  /** ¿Esta unidad la mueve la IA? */
  laLlevaLaIA(stackId: string): boolean {
    return this.manejaIA.has(stackId);
  }

  get turnoPropio(): TurnoPropio | null {
    const battle = this.battle;
    if (!this.empezada || battle.finished !== null) return null;
    const stack = activeStack(battle);
    if (stack === null || this.manejaIA.has(stack.id)) return null;
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

  /** Aplica la jugada de la persona y deja a la IA mover las suyas hasta la siguiente. */
  playBattleAction(action: BattleAction): void {
    if (this.turnoPropio === null) {
      this.status = 'Ahora no mueve ninguna unidad tuya.';
      return;
    }
    try {
      applyAction(this.battle, action, this.rng);
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    // Como en la partida: lanzado el hechizo, o con otra unidad activa, el
    // elegido ya no tiene sentido.
    this.hechizos.selectedSpell = null;
    this.avanzarIA();
  }

  /** Con todas en IA la batalla se juega entera aquí, de una vez: el animador la cuenta después. */
  private avanzarIA(): void {
    jugarIAMientras(this.battle, this.rng, (s) => this.manejaIA.has(s.id));
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
