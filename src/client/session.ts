/**
 * Sesión de juego del cliente.
 *
 * Es la única puerta del cliente al núcleo: las vistas piden cosas aquí y
 * pintan lo que devuelve, nunca tocan el `GameState` por su cuenta. Cuando
 * llegue el bridge por WebSocket, lo que cambia es esta capa y solo esta.
 */
import { chooseBattleAction } from '@core/ai/tactics.js';
import { playAiTurn } from '@core/ai/turn.js';
import { batallaDeArena, LADOS, type UnidadDeArena } from '@core/arena.js';
import {
  activeStack,
  applyAction,
  ataqueBlocker,
  type CasillaDeCarga,
  casillasDeCarga,
  castBlocker,
  legalActions,
  MAX_JUGADAS,
  pasosQueQuedan,
  SIN_CARGAS,
  surrenderBlocker,
} from '@core/battle/battle.js';
import { spell } from '@core/battle/spells.js';
import type { BattleAction, BattleStack, BattleState, Side } from '@core/battle/types.js';
import { armyLeadership, GARRISON_LEADERSHIP, heroLeadership } from '@core/hero/troop.js';
import type { PathStep } from '@core/map/map.js';
import { createRng, type Rng } from '@core/rng.js';
import { emboscadaEnLaRuta, type VistaAsaltante } from '@core/state/asaltantes.js';
import type { DefeatReason } from '@core/state/events.js';
import {
  applyAdventureAction,
  caminoHasta,
  destinoDeRecluta,
  type GameContext,
  type GameState,
  heroById,
  heroesOf,
  type Player,
  porQueNoLlega,
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
import { type Desenlace, desenlaceDe } from './desenlace.js';

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
 * Las dos son `Record<Desenlace, string>` y no un `switch`, y eso es el guardia.
 *
 * Con `switch` de sentencia —el que asigna a `this.status` y hace `break`— un
 * cuarto desenlace **no pone nada rojo**: se comprobó plantando uno en la unión
 * y `pnpm typecheck` salía verde por estos dos sitios. La tabla lo caza con
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

const AL_CERRARSE_LA_BATALLA: Record<Desenlace, string> = {
  ganada: '¡Victoria!',
  perdida: 'Derrota.',
  'sin resolver': SIN_RESOLVER,
  ajena: FIN_AJENO,
};

/**
 * La magia de una batalla tal como la lee la escena: qué hechizo hay elegido,
 * sobre quién cae y por qué no. Solo la tiene quien lleva héroe —la partida—;
 * la arena no tiene ni libro ni maná y no declara nada de esto.
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
  /** La magia, o `null` donde no hay héroe que lance. */
  readonly hechizos: HechizosDeBatalla | null;
  battleLegalActions(): readonly BattleAction[];
  battleMovable(): readonly Hex[];
  battleCharges(): readonly CasillaDeCarga[];
  attackRejection(targetId: string): string;
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
  return `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.`;
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

export class Session implements ControlDeBatalla, HechizosDeBatalla {
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
   * Hechizo que la persona ha elegido y está a punto de lanzar sobre alguien.
   * Vive aquí y no en `main.ts` porque lo lee también el panel; `main.ts` solo
   * guarda estado de píxel.
   */
  get selectedSpell(): string | null {
    return this.hechizoElegido;
  }
  set selectedSpell(v: string | null) {
    this.hechizoElegido = v;
    this.tocar();
  }
  private hechizoElegido: string | null = null;

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
   */
  status = '';

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
   * Por qué acabó la partida, leído del `player_defeated` que la cerró, o `null`
   * si sigue viva o se agotaron los días. La causa la decide `checkDefeat` y la
   * sella en el hecho: aquí solo se busca, no se deduce del mapa.
   *
   * Si perdiste, la tuya; si ganaste, la del último rival eliminado. Una partida
   * con ganador y sin ningún `player_defeated` es una partida rota, y se dice.
   */
  get causaDelFinal(): DefeatReason | null {
    const fin = this.state.finished;
    if (fin === null || fin.winner === null) return null;
    const perdiYo = fin.winner !== this.viewer;
    const derrotas = this.state.log.filter(
      (e) => e.kind === 'player_defeated' && (!perdiYo || e.actor === this.viewer),
    );
    const ultima = derrotas.at(-1);
    if (ultima === undefined || ultima.kind !== 'player_defeated') {
      throw new Error(
        `la partida la ganó el jugador ${fin.winner} y la crónica no dice quién quedó eliminado ni por qué`,
      );
    }
    return ultima.reason;
  }

  /** Cómo acabó la partida para quien mira, o `null` si sigue viva. */
  get desenlace(): Desenlace | null {
    const fin = this.state.finished;
    return fin === null ? null : desenlaceDe(fin.winner, this.viewer);
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
  get explorado(): ReadonlySet<string> | null {
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
    // Con lo que la persona mira AHORA y no con todo: un grupo que no se ve no
    // avisa, o la ruta le contaría lo que tapa la niebla. Con «Ver mapa entero»
    // se mira todo, igual que se pinta todo.
    const mirando = this.revealAll ? null : this.visibles();
    const emboscada = emboscadaEnLaRuta(this.state, hero, camino, mirando);
    return camino.map((paso, i) => ({
      ...paso,
      hoy: paso.cost <= hero.movePoints,
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
  visibles(): ReadonlySet<string> {
    const clave = `${this.state.log.length}|${this.state.day}|${this.state.current}`;
    if (this.cacheVisibles === null || this.cacheVisibles.clave !== clave) {
      this.cacheVisibles = { clave, casillas: visibleNow(this.state, this.viewer) };
    }
    return this.cacheVisibles.casillas;
  }
  private cacheVisibles: { clave: string; casillas: ReadonlySet<string> } | null = null;

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
    const camino = caminoHasta(this.state, hero, to);
    if (camino === null || camino.length === 0) {
      // La frase la escribe el núcleo, que sabe si lo cierra el mapa o alguien
      // plantado en el paso (M2 de la 2a); aquí solo se le pone la mayúscula.
      const motivo = porQueNoLlega(this.state, hero, to);
      this.status = `${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}.`;
      return;
    }

    // Se avanza hasta donde alcance el movimiento del día.
    const alcanzable = camino.filter((paso) => paso.cost <= hero.movePoints);
    if (alcanzable.length === 0) {
      this.status = 'No te quedan puntos de movimiento para dar ni un paso.';
      return;
    }

    const destino = alcanzable.at(-1)!.at;
    try {
      applyAdventureAction(
        this.state,
        { type: 'move_hero', hero: heroId, to: destino },
        this.ctx,
        this.viewer,
      );
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    this.tocar();

    if (this.state.pendingBattle !== null) {
      this.scene = 'battle';
      this.status = '¡Batalla!';
      // Si la iniciativa la tiene el enemigo, mueve él primero: sin esto la
      // batalla se quedaba esperando a una persona que no podía hacer nada.
      this.advanceEnemyTurns();
      return;
    }

    // Entrar en la base rival vacía acaba la partida, y abría su castillo
    // encima: el fin y su causa se quedaban detrás de una pantalla de compras
    // que ya no sirve de nada.
    const desenlace = this.desenlace;
    if (desenlace !== null) {
      this.status = this.alAcabarseElMapa(desenlace);
      return;
    }
    const pueblo = this.myTowns().find((t) => sameTile(t.at, destino));
    if (pueblo !== undefined) this.openTown(pueblo.id);
  }

  /** La frase de la barra al acabarse el mapa, por la causa que selló el núcleo. */
  private alAcabarseElMapa(desenlace: Desenlace): string {
    // Sin causa solo se acaba por días, y esa fila es la misma en las dos.
    return AL_ACABARSE_EL_MAPA[this.causaDelFinal ?? 'lost_base'][desenlace];
  }

  async endTurn(): Promise<void> {
    if (!this.isPlayersTurn) return;
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
    const desenlace = this.desenlace;
    if (desenlace === null) {
      this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
    } else {
      this.status = this.alAcabarseElMapa(desenlace);
    }
  }

  // ------------------------------------------------------------ castillo

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
    // El maná y el «ya lanzó» de los dos héroes van en la clave aunque hoy solo
    // cambien con un `cast` (que ya deja línea): son lo único de lo que dependen
    // los hechizos que no pasa por el registro, y un test que los toca a mano
    // vería una lista vieja.
    const { attacker: ha, defender: hd } = battle.heroes;
    const clave = `${claveDeBatalla(battle)}|${this.selectedSpell}|${ha?.mana}|${ha?.castThisRound}|${hd?.mana}|${hd?.castThisRound}`;
    const c = this.cacheBatalla;
    if (c !== null && c.battle === battle && c.clave === clave) return c.valor;
    const comunes = accionesDeBatalla(battle, this.turnoPropio);
    const valor = { ...comunes, opciones: this.opcionesDeHechizo(comunes.acciones) };
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

  /** La partida tiene héroe: su magia la lleva esta misma sesión. */
  get hechizos(): HechizosDeBatalla {
    return this;
  }

  /** El héroe de la persona en la batalla en curso, el de SU bando. */
  get battleHero() {
    const bando = this.miBando;
    if (bando === null) return null;
    return this.battle?.heroes[bando] ?? null;
  }

  /**
   * El libro de hechizos tal y como se pinta: qué se puede lanzar ahora mismo y,
   * si no, por qué.
   *
   * `castable` no recalcula ninguna regla: es «existe un `cast` de este hechizo
   * entre las acciones legales». Y el motivo lo escribe el núcleo
   * (`castBlocker`), igual que el del castillo sale de `buildBlocker`.
   */
  spellOptions(): readonly SpellOption[] {
    return this.calculoDeBatalla().opciones;
  }

  private opcionesDeHechizo(acciones: readonly BattleAction[]): SpellOption[] {
    const turno = this.turnoPropio;
    if (turno === null) return [];
    const hero = this.battleHero;
    if (hero === null || hero.spells.length === 0) return [];

    return hero.spells.map((id) => {
      const sp = spell(id);
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

  /**
   * Por qué el hechizo elegido no se puede lanzar sobre ese stack.
   *
   * Apuntar mal es una regla del juego —a un aliado, a un inmune, a un muerto—,
   * así que la frase la escribe el núcleo y la pantalla solo la enseña. Si el
   * par no está entre las acciones legales, el bloqueador TIENE motivo: son las
   * dos caras de la misma función.
   */
  castRejection(targetId: string): string {
    const turno = this.turnoPropio;
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

  /**
   * Por qué la unidad activa no puede actuar contra ese enemigo: ni dispararle
   * ni golpearlo. Como `castRejection`, la frase es del núcleo (`ataqueBlocker`)
   * —«ya se ha movido este turno: no puede disparar…»— y aquí solo se le pone
   * mayúscula y punto. Quien la pide ya ha visto que no hay acción legal contra
   * él, así que el núcleo TIENE que dar motivo.
   */
  attackRejection(targetId: string): string {
    return motivoContra(this.turnoPropio, targetId);
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

  /** Ids de los stacks sobre los que se puede lanzar el hechizo elegido. */
  castTargets(): readonly string[] {
    const elegido = this.selectedSpell;
    if (elegido === null) return [];
    return this.spellOptions().find((o) => o.id === elegido)?.targets ?? [];
  }

  /** Elige hechizo, o lo suelta si ya estaba elegido. */
  selectSpell(spellId: string): void {
    if (this.selectedSpell === spellId) {
      this.clearSpell();
      return;
    }
    const opcion = this.spellOptions().find((o) => o.id === spellId);
    if (opcion === undefined) return;
    if (!opcion.castable) {
      this.status = `No puedes lanzar ${opcion.name}: ${opcion.motivo}.`;
      return;
    }
    this.selectedSpell = spellId;
    this.status = `${opcion.name}: elige sobre quién lanzarlo.`;
  }

  clearSpell(): void {
    if (this.selectedSpell === null) return;
    this.selectedSpell = null;
    this.status = '';
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
    this.selectedSpell = null;
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
    this.selectedSpell = null;
    if (this.selectedHero === null) {
      this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
    }
    // «¡Batalla!» se quedaba en la barra ya de vuelta en el mapa: se borra, y si
    // la batalla cerró la partida se dice cómo.
    const desenlace = this.desenlace;
    this.status = desenlace === null ? '' : AL_CERRARSE_LA_BATALLA[desenlace];
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

/** Una unidad del montaje de la arena: sus cifras y quién la mueve. */
export interface PuestoDeArena {
  readonly unidad: UnidadDeArena;
  readonly ia: boolean;
}

/**
 * La batalla de la arena (`/arena/`): dos bandos de unidades con cifras del
 * borrador, sin partida alrededor, y en cada unidad decide la persona o la IA.
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
 * No hay hechizos: sin héroe no hay libro ni maná, y `hechizos` es `null`.
 */
export class SesionDeArena implements ControlDeBatalla {
  readonly battle: BattleState;
  readonly semilla: number;
  readonly hechizos = null;
  private readonly rng: Rng;
  private readonly manejaIA: ReadonlySet<string>;
  private empezada = false;

  /**
   * Lo que mira el panel para repintarse: cambia con cada jugada, que es lo
   * mismo que mira la caché. No hay contador aparte que se pueda desacompasar.
   */
  get version(): string {
    return claveDeBatalla(this.battle);
  }

  /** No es parte de la versión, por lo mismo que en `Session`: la reescribe el puntero. */
  status = '';

  constructor(
    izquierda: readonly PuestoDeArena[],
    derecha: readonly PuestoDeArena[],
    semilla: number,
  ) {
    this.semilla = semilla;
    this.rng = createRng(semilla);
    this.battle = batallaDeArena(
      izquierda.map((p) => p.unidad),
      derecha.map((p) => p.unidad),
      this.rng,
    );
    // El stack de cada puesto, por bando y `slot`, que es como lo monta el motor;
    // no por el formato del id, que es cosa suya.
    const ia = new Set<string>();
    for (const [lado, puestos] of [
      ['izquierda', izquierda],
      ['derecha', derecha],
    ] as const) {
      const bando = LADOS[lado].bando;
      puestos.forEach((p, slot) => {
        const st = this.battle.stacks.find((s) => s.side === bando && s.slot === slot);
        if (st === undefined) throw new Error(`la unidad ${p.unidad.name} no ha salido al campo`);
        if (p.ia) ia.add(st.id);
      });
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
  private calculo(): AccionesDeBatalla {
    const clave = claveDeBatalla(this.battle);
    if (this.cache !== null && this.cache.clave === clave) return this.cache.valor;
    const valor = accionesDeBatalla(this.battle, this.turnoPropio);
    this.cache = { clave, valor };
    return valor;
  }
  private cache: { clave: string; valor: AccionesDeBatalla } | null = null;

  battleLegalActions(): readonly BattleAction[] {
    return this.calculo().acciones;
  }

  battleMovable(): readonly Hex[] {
    return this.calculo().movibles;
  }

  battleCharges(): readonly CasillaDeCarga[] {
    return this.calculo().cargas;
  }

  /** Las casillas que le quedan este turno a la unidad activa, si es de la persona. */
  battleStepsLeft(): number | null {
    const turno = this.turnoPropio;
    return turno === null ? null : pasosQueQuedan(turno.battle, turno.stack);
  }

  attackRejection(targetId: string): string {
    return motivoContra(this.turnoPropio, targetId);
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
