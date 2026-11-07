/**
 * La sesión de la partida (`Session`): lo que la persona hace en la partida, del mapa
 * a la base y a la batalla.
 *
 * Es de la puerta del cliente al núcleo, la carpeta `sesion/`: las vistas piden cosas
 * aquí y pintan lo que devuelve, nunca tocan el `GameState` por su cuenta. Cuando
 * llegue el bridge por WebSocket, lo que cambia es esta capa y solo esta. La pelea en
 * pantalla que comparte con la arena (lo apuntado, el libro, los poderes, la muralla,
 * el arma, el despliegue y el cruce de la rueda) vive en `sesion/batalla/`, y la
 * sesión de la arena, en `sesion/sesion-de-arena.ts`: las dos estaban aquí hasta la
 * fase C de la reorganización (07-11-2026). Desde R1, las dos extienden la sesión de
 * batalla común (`SesionDeBatalla`), que lleva las piezas, la caché y la jugada de la
 * persona; aquí queda lo que la partida pone en ella.
 */
import { playAiTurn } from '@core/ai/turn.js';
import { activeStack, surrenderBlocker } from '@core/battle/consultas.js';
import type { BattleStack, BattleState, Side } from '@core/battle/types.js';
import type { ReglasDelCombate } from '@core/combate.js';
import type { Portador } from '@core/equipo/portador.js';
import { type BancoPintado, SIN_BANCO } from '@core/gente/banco.js';
import { figurasDeLaGente } from '@core/gente/figuras.js';
import { alcaideDe, ID_DEL_ALCAIDE, vecinosDeLaBase, vozDe } from '@core/gente/voces.js';
import { infiltracionBlocker } from '@core/hero/infiltracion.js';
import { figuraDelHeroe } from '@core/hero/tipos-de-heroe.js';
import { armyLeadership, heroLeadership } from '@core/hero/troop.js';
import type { CasillasLeidas } from '@core/map/casillas.js';
import type { MapObject, ObraDelPuesto } from '@core/map/tipos.js';
import { type Lugar, lugarSiExiste, type MundoLeido } from '@core/mundo/formato.js';
import { partidaDelMundo } from '@core/mundo/partida.js';
import { estadoDicho, lugarEn } from '@core/mundo/reglas.js';
import { createRng, type Rng } from '@core/rng.js';
import { type AsaltantesALaVista, loQueLaPara } from '@core/state/asaltantes.js';
import type { ClimaDeLaPartida, ClimaDelSitio, ClimaForzado } from '@core/state/clima.js';
import {
  battleOwners,
  destinoDeRecluta,
  heroById,
  heroeEnLaBase,
  heroesOf,
  type RecruitCapacity,
  reclutarBlocker,
  recruitCapacity,
  sidesOwnedBy,
  townById,
  townsOf,
  turnBlocker,
  week,
} from '@core/state/consultas.js';
import { type Desenlace, desenlaceDe, finDePartida } from '@core/state/desenlace.js';
import type { DefeatReason, GameEvent, GameEventDraft, Ocupante } from '@core/state/events.js';
import { applyAdventureAction } from '@core/state/game.js';
import { salidaPendienteBlocker } from '@core/state/heroes.js';
import { puedeAndarHoy } from '@core/state/marcha.js';
import { type RentaDelDia, rentaDelDia } from '@core/state/renta.js';
import { newGame } from '@core/state/setup.js';
import {
  ciudadQueMandaBlocker,
  cupoDeLaGuarnicion,
  dueñoDeLaCiudad,
  guarnicionDe,
  ocupanteDe,
  ocupanteDicho,
  type Sitio,
  sitioDeLaCiudad,
  sitioPorId,
  sitioSiExiste,
} from '@core/state/sitios.js';
import type { GameContext, GameState, Player } from '@core/state/tipos.js';
import { building } from '@core/town/buildings.js';
import { construidoEn, type SitioId, sitiosConstruidos } from '@core/town/sitios.js';
import type { Town } from '@core/town/town.js';
import type { FactionId, Hero, PlayerId, Point } from '@core/types.js';
import { AYUDA_DE_LA_BASE, AYUDA_DEL_DESPLIEGUE, AYUDA_DEL_MAPA } from '../comun/dichos.js';
import { mensajeDe } from '../comun/errores.js';
import { quienesDe } from '../comun/quien-mira.js';
import type { VistaDeLaBase } from '../render/base/escena.js';
import { cuerpoDeLaPersona } from '../render/figuras/cuerpo-de-gente.js';
import type { SitioOcupado } from '../render/mapa/sitios-sabidos.js';
import type { TurnoPropio } from './batalla/control.js';
import type { DespliegueEnPantalla } from './batalla/despliegue.js';
import { SesionDeBatalla } from './batalla/sesion-de-batalla.js';
import { ALaVista } from './partida/a-la-vista.js';
import { AtaqueALaPersona, type VistaDelAviso } from './partida/ataque.js';
import { AyuntamientoEnPantalla } from './partida/ayuntamiento.js';
import { CierreDeLaBatalla } from './partida/cierre-de-batalla.js';
import { ClimaEnPantalla } from './partida/clima.js';
import { type DueñoDeLasPiezas, type Scene, sameTile } from './partida/comun.js';
import { DefensaEnPantalla, type VistaDeLaDefensa } from './partida/defensa.js';
import { EquipoEnPantalla } from './partida/equipo.js';
import { GuarnicionEnPantalla, type VistaDeLaGuarnicion } from './partida/guarnicion.js';
import { EnElLugar, type TrasElegir } from './partida/lugar.js';
import { MarchaEnElMapa, type MarchaEnPantalla, type RoutePreview } from './partida/marcha.js';
import { MoradaEnPantalla } from './partida/morada.js';
import { TropaEnPantalla } from './partida/tropa.js';
import type { VistaDelAyuntamiento } from './vistas/ayuntamiento.js';
import type { VistaDeLaMorada } from './vistas/morada.js';
import type { VistaDeLaTropa } from './vistas/tropa.js';

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

export class Session extends SesionDeBatalla {
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

  /**
   * Lo que las piezas de la sesión (`sesion/partida/`) leen de ella, por función: la
   * partida y su azar nacen en el constructor, después que las piezas, y la partida puede
   * cambiar. Cada pieza toma lo suyo (`DueñoDeLasPiezas`, `sesion/partida/comun.ts`).
   */
  private readonly dueñoDeLasPiezas: DueñoDeLasPiezas = {
    estado: () => this.state,
    ctx: () => this.ctx,
    viewer: () => this.viewer,
    version: () => this.version,
    tocar: () => this.tocar(),
    barra: (texto) => {
      this.status = texto;
    },
    escena: () => this.scene,
    irA: (escena) => {
      this.scene = escena;
    },
    run: (fn, bloqueo) => this.run(fn, bloqueo),
    turnoAjeno: () => this.turnoAjeno(),
    bloqueoDeTurno: () => this.bloqueoDeTurno(),
    oro: () => this.oro,
    jugador: () => this.jugador,
    misHeroes: () => this.myHeroes(),
    desenlace: () => this.desenlace,
    heroeSeleccionado: () => this.selectedHero,
    seleccionarHeroe: (id) => {
      this.selectedHeroId = id;
    },
    idDeLaBaseAbierta: () => this.openTownId,
    baseAbierta: () => this.activeTown,
  };

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
    if (v !== this.heroeElegido) this.equipo.soltar();
    this.heroeElegido = v;
    this.tocar();
  }
  private heroeElegido: string | null = null;

  /**
   * Lo que se ve de la pelea cambia (`SesionDeBatalla.alCambiar`): lo apuntado, el
   * arma, el despliegue, la rueda o la IA que juega. Sube la versión, como todo.
   */
  protected override alCambiar(): void {
    this.tocar();
  }

  /** El azar de la partida (`ctx.rng`), el mismo de la pelea: nace en el constructor. */
  protected override azar(): Rng {
    return this.ctx.rng;
  }

  /**
   * La IA mueve el bando que no es de la persona, y ninguno si la batalla no es suya
   * (`miBando` es `null`): no juega nada por ella.
   */
  protected override laIAMueve(): ((s: BattleStack) => boolean) | null {
    const mio = this.miBando;
    return mio === null ? null : (s) => s.side !== mio;
  }

  /**
   * La IA elige en la rueda por el rival y, con «Solo la rueda del héroe», también por
   * la tropa de la persona: a ella se le abre solo para su héroe. Se lee en cada
   * golpe, así que cambiarla a media batalla vale desde el siguiente.
   */
  protected override laIAEligePor(quien: BattleStack): boolean {
    return quien.side !== this.miBando || (this.soloRuedaDelHeroe && quien.origen.kind !== 'heroe');
  }

  /** Con la pantalla de la defensa abierta no se juega nada de la batalla (`DefensaEnPantalla.eligiendo`). */
  protected override frenoDeLaDefensa(): boolean {
    return this.defensaEnPantalla.eligiendo();
  }

  get openTownId(): string | null {
    return this.puebloAbierto;
  }
  set openTownId(v: string | null) {
    this.puebloAbierto = v;
    this.tocar();
  }
  private puebloAbierto: string | null = null;

  /** «Ver mapa entero» (`ALaVista.todo`): cambiarlo sube la versión. */
  get revealAll(): boolean {
    return this.aLaVista.todo;
  }
  set revealAll(v: boolean) {
    this.aLaVista.todo = v;
  }

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
  override get status(): string {
    const desenlace = this.desenlace;
    return desenlace === null ? this.barra : this.alAcabarseElMapa(desenlace);
  }
  override set status(texto: string) {
    this.barra = texto;
  }
  private barra = '';

  /** Quien mira la rueda del golpe (`SesionConRueda.quienMira`): la persona, por su bando. */
  override get quienMira(): Side | null {
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
   * «Solo la rueda del héroe» (22-10-2026, decisión del usuario): la persona sigue
   * moviendo y atacando con toda su tropa, pero la rueda se le abre solo cuando su
   * héroe golpea o responde; la del resto de su tropa la elige la IA a ciegas,
   * como la del rival. Una batalla sin su héroe (la defensa de una guarnición) no
   * le abre ninguna. Es de quien juega y no del núcleo: no cambia ninguna regla,
   * solo quién elige.
   */
  soloRuedaDelHeroe: boolean;

  /** Cambia «Solo la rueda del héroe»; vale desde el siguiente golpe. */
  alternarSoloRuedaDelHeroe(): void {
    this.soloRuedaDelHeroe = !this.soloRuedaDelHeroe;
    this.status = this.soloRuedaDelHeroe
      ? 'Solo eliges en la rueda con tu héroe: la de tu tropa la elige la IA.'
      : 'Eliges en la rueda con toda tu tropa.';
    this.tocar();
  }

  /**
   * El lugar de un mundo en que se está y la conversación abierta, entrar y salir de su
   * escena y elegir en ella (`EnElLugar`, `sesion/partida/lugar.ts`): estado del cliente;
   * lo que cambia la partida es una acción de la persona, con la guarda de esta sesión
   * (`run`). La página lee la conversación de él, y lo demás, por los de abajo
   * («lugares»), que delegan en él.
   */
  readonly lugar: EnElLugar = new EnElLugar({
    ...this.dueñoDeLasPiezas,
    gente: () => this.gente,
    entrarEnLaBatalla: () => this.entrarEnLaBatalla(),
  });

  /**
   * @param faccion la de la persona (la elegida en el menú o la de `?faccion=`);
   *   sin ella, la que saque la semilla. El rival, otra: lo decide el núcleo
   *   (`faccionesDeLaSemilla`), no la sesión.
   * @param tipoDelHeroe el tipo de su héroe de salida, ya elegido y pagado (el de
   *   `?heroe=`); con `null`, **por elegir en la base**, ante el ayuntamiento (así
   *   empieza la partida sin `?heroe=`; lo mismo en `NewGameOptions`); sin él
   *   (`undefined`, lo que pasan los tests), el de por defecto de su facción, ya
   *   pagado. Uno que no es de su facción lo rechaza el núcleo (`newGame`)
   *   diciendo cuáles valen.
   * @param combate la complejidad del combate (`?tropa=`, `?rueda=`); sin ella, la
   *   de siempre (7 / 7). Una que no vale la rechaza el núcleo (`createGame`).
   * @param soloRuedaDelHeroe si la persona lleva solo la rueda de su héroe
   *   (`?solo-heroe=1`); se puede cambiar en la batalla (`soloRuedaDelHeroe`).
   * @param gente el banco de figuras de NPC y lo pintado de él (`render/figuras/gente.ts`):
   *   de ahí sale la figura de la gente de la base y de los lugares; sin él, el Y Bot.
   */
  constructor(
    seed: number,
    faccion?: FactionId,
    tipoDelHeroe?: string | null,
    combate?: ReglasDelCombate,
    soloRuedaDelHeroe = false,
    mundo?: MundoLeido,
    readonly gente: BancoPintado = SIN_BANCO,
  ) {
    super();
    this.soloRuedaDelHeroe = soloRuedaDelHeroe;
    // La semilla no se guarda aquí: `newGame` la deja en `state.seed`, que es
    // de donde la lee quien la enseña. Un hecho en dos sitios se desincroniza
    // el día que esta capa hable por WebSocket —`this.seed` sería la que pidió
    // el cliente y `state.seed` la que abrió el servidor—.
    //
    // Con un mundo (`?mundo=`), la partida es la suya: su plan, su semilla, su
    // facción, su héroe y sus lugares (`partidaDelMundo`); de lo demás, solo la
    // complejidad del combate, que es de quien juega y no del mundo.
    this.state =
      mundo === undefined
        ? newGame({
            seed,
            controllers: { 0: 'human', 1: 'ai' },
            faccionDelJugador: faccion,
            tipoDelHeroe,
            combate,
          })
        : partidaDelMundo(mundo, { 0: 'human', 1: 'ai' }, undefined, combate);
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

  /** El jugador de la persona: su oro y su niebla. */
  get jugador(): Player {
    const propio = this.state.players.find((p) => p.id === this.viewer);
    if (propio === undefined) throw new Error(`el jugador ${this.viewer} no está en la partida`);
    return propio;
  }

  /** El oro de la persona, el único recurso. */
  get oro(): number {
    return this.jugador.oro;
  }

  /**
   * Lo que cobrará la persona al empezar su turno, y de dónde sale: la cuenta
   * del núcleo (`rentaDelDia`), la misma que suma `startTurn` y que lee el
   * agente. La barra la enseña («+N/día») con lo que da cada ciudad y pueblo.
   *
   * Se guarda mientras no se mueva `version`, como `objetosConocidos`: la barra
   * se repinta también al llegar arte, y cada vez rehacía `territorio`.
   */
  get renta(): RentaDelDia {
    const c = this.cacheDeLaRenta;
    if (c !== null && c.version === this.version) return c.renta;
    const renta = rentaDelDia(this.state, this.viewer);
    this.cacheDeLaRenta = { version: this.version, renta };
    return renta;
  }
  private cacheDeLaRenta: { readonly version: number; readonly renta: RentaDelDia } | null = null;

  /**
   * Lo que la persona ve del mapa —la niebla, los grupos, los héroes, los objetos como
   * los sabe, lo que le consta de la crónica— y lo que se guarda entre fotogramas:
   * `ALaVista` (`sesion/partida/a-la-vista.ts`), en la que delegan estos. La marcha que
   * se enseña cambia lo que se ve, y la pieza la lee de aquí.
   */
  private readonly aLaVista: ALaVista = new ALaVista({
    ...this.dueñoDeLasPiezas,
    marcha: () => this.marcha.queSeVe(),
    nieblaDeLaMarcha: () => this.marcha.niebla(),
  });

  /** Lo explorado por la persona, o `null` si se ha pedido verlo todo (`ALaVista.explorado`). */
  get explorado(): CasillasLeidas | null {
    return this.aLaVista.explorado;
  }

  /** La ruta entera del héroe seleccionado hasta `to`, cada paso con si llega hoy (`MarchaEnElMapa.ruta`). */
  previewPath(to: Point): RoutePreview[] {
    return this.marcha.ruta(to);
  }

  /** Las casillas que la persona está mirando AHORA, para la niebla de dos tonos (`ALaVista.visibles`). */
  visibles(): CasillasLeidas {
    return this.aLaVista.visibles();
  }

  /** Los grupos de asaltantes que la persona ve (`ALaVista.asaltantes`). */
  asaltantesALaVista(): AsaltantesALaVista {
    return this.aLaVista.asaltantes();
  }

  /** Los héroes que la persona ve: los suyos y los rivales que mira ahora (`ALaVista.heroes`). */
  heroesALaVista(): readonly Hero[] {
    return this.aLaVista.heroes();
  }

  /** Los objetos del mapa como los sabe la persona (`ALaVista.objetos`). */
  objetosConocidos(): readonly MapObject[] {
    return this.aLaVista.objetos();
  }

  /** Las ciudades y los pueblos que la persona sabe ocupados (`ALaVista.ocupados`). */
  ocupados(): readonly SitioOcupado[] {
    return this.aLaVista.ocupados();
  }

  /**
   * Por qué quien juega no manda hoy en la ciudad `town` (`ciudadQueMandaBlocker`:
   * no es suya, o un héroe o una guarnición de otro la ocupa), o `null`. Lo lee la
   * pantalla de la ciudad, que apaga con ella reclutar, construir y contratar.
   */
  mandaEn(town: Town): string | null {
    return ciudadQueMandaBlocker(this.state, town, this.viewer);
  }

  /**
   * Quién ocupa la ciudad `town` y cómo se dice («una guarnición neutral»), o
   * `null` (`ocupanteDe`, la regla de la ocupación). Lo lee la ficha de la ciudad,
   * que dice como ocupante la guarnición ajena y no como la suya (vuelta 1 de QA de
   * la tarea 2, H1).
   */
  ocupanteDeLaCiudad(town: Town): { readonly ocupante: Ocupante; readonly quien: string } | null {
    const ocupante = ocupanteDe(this.state, sitioDeLaCiudad(town));
    return ocupante === null ? null : { ocupante, quien: ocupanteDicho(this.state, ocupante) };
  }

  /** La crónica que le consta a la persona; con «Ver mapa entero», entera (`ALaVista.cronica`). */
  cronica(cuantos: number): readonly GameEventDraft[] {
    return this.aLaVista.cronica(cuantos);
  }

  /**
   * El liderazgo que ocupa una tropa y su tope: la de un héroe, o la guarnición
   * de un sitio (una ciudad, un paso o un pueblo, por su id: `guarnicionDe` y
   * `cupoDeLaGuarnicion`). Por el mismo camino, para que el panel de la base y la
   * pantalla de la guarnición pinten la misma fila con una sola llamada.
   */
  liderazgo(de: { readonly heroe: string } | { readonly guarnicion: string }): {
    ocupado: number;
    tope: number;
  } {
    if ('heroe' in de) {
      const hero = heroById(this.state, de.heroe);
      return { ocupado: armyLeadership(hero.army), tope: heroLeadership(hero) };
    }
    const sitio = sitioPorId(this.state, de.guarnicion);
    return {
      ocupado: armyLeadership(guarnicionDe(this.state, sitio)),
      tope: cupoDeLaGuarnicion(this.state).tope,
    };
  }

  /**
   * Por qué el grupo de `hero` no se infiltra (`infiltracionBlocker`), o `null`
   * si cruza barreras a un día por casilla. Lo lee el panel del héroe.
   */
  infiltracion(hero: Hero): string | null {
    return infiltracionBlocker(hero);
  }

  /** El sitio de un hecho de la crónica por su id, para nombrarlo (`renderLog`), o `null`. */
  sitioDeLaCronica(id: string): Sitio | null {
    return sitioSiExiste(this.state, id);
  }

  // ------------------------------------------------------------ aventura

  /**
   * La marcha del héroe en el mapa —la ruta, mandarlo andar y la marcha que el mapa
   * enseña mientras anda—: `MarchaEnElMapa` (`sesion/partida/marcha.ts`), en la que delegan
   * estos. Lo que abre la llegada lo hace esta sesión (`alAcabarLaMarcha`).
   */
  private readonly marcha: MarchaEnElMapa = new MarchaEnElMapa({
    ...this.dueñoDeLasPiezas,
    esTuTurno: () => this.isPlayersTurn,
    asaltantesALaVista: () => this.asaltantesALaVista(),
    conocido: () => this.aLaVista.conocido(),
    todoALaVista: () => this.revealAll,
    despertar: (heroId) => {
      this.dormidos.delete(heroId);
    },
    alLlegar: (hero, ultimo) => this.alAcabarLaMarcha(hero, ultimo),
  });

  /**
   * Si el mapa enseña al héroe andando su marcha (`MarchaEnElMapa.enseñar`): lo pone la
   * página (`main.ts`); sin ella, lo que abre la llegada se abre en el acto.
   */
  get enseñarLaMarcha(): boolean {
    return this.marcha.enseñar;
  }
  set enseñarLaMarcha(v: boolean) {
    this.marcha.enseñar = v;
  }

  /** La marcha que se enseña ahora, o `null` (`MarchaEnElMapa.enCurso`). */
  get marchaEnCurso(): MarchaEnPantalla | null {
    return this.marcha.enCurso;
  }

  /** El mapa enseña al héroe que anda en la casilla `pisada` de su marcha (`MarchaEnElMapa.pisar`). */
  pisarEnLaMarcha(pisada: number): void {
    this.marcha.pisar(pisada);
  }

  /** Los puntos de movimiento que enseña el panel de `hero` (`MarchaEnElMapa.movimientoALaVista`). */
  movimientoALaVista(hero: Hero): number {
    return this.marcha.movimientoALaVista(hero);
  }

  /** La marcha llega (o se salta): abre lo que esperaba a la llegada (`MarchaEnElMapa.acabar`). */
  acabarLaMarcha(): void {
    this.marcha.acabar();
  }

  /** Selecciona lo que haya en la casilla, o mueve el héroe hasta ella. */
  clickTile(p: Point): void {
    // Un clic mientras el héroe anda solo lo hace llegar: lo que hubiera bajo el
    // puntero se elige con el mapa ya quieto.
    if (this.marcha.enCurso !== null) {
      this.acabarLaMarcha();
      return;
    }
    // Solo el turno: con el héroe de salida por elegir, pulsar la base la abre (es
    // donde se elige); mover no hay a quién.
    const bloqueo = this.turnoAjeno();
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

    // Pulsar al héroe en un paso o un pueblo suyo abre su guarnición, como el
    // castillo abre la base (la de la ciudad, en la base).
    if (sameTile(heroSeleccionado.at, p) && this.enSuPasoOPueblo(heroSeleccionado)) {
      this.abrirLaGuarnicion(heroSeleccionado.id);
      return;
    }

    // Pulsar el lugar en que ya está el héroe es entrar en él, como en un pueblo.
    if (sameTile(heroSeleccionado.at, p) && lugarEn(this.state, p) !== null) {
      this.abrirElLugar(heroSeleccionado.id);
      return;
    }

    this.moveHeroTo(heroSeleccionado.id, p);
  }

  /** Manda al héroe `heroId` hacia `to` (`MarchaEnElMapa.andar`). */
  moveHeroTo(heroId: string, to: Point): void {
    this.marcha.andar(heroId, to);
  }

  /** Lo que abre la llegada de la marcha de `hero`: `ultimo`, el último hecho de su marcha. */
  private alAcabarLaMarcha(hero: Hero, ultimo: GameEvent | undefined): void {
    const pending = this.state.pendingBattle;
    if (pending !== null) {
      const entrar = (): void => this.entrarEnLaBatalla();
      // Una emboscada no la eligió la persona: al acabar la marcha, antes de la
      // batalla, el aviso de quién y dónde, como cuando la atacan en el turno del rival.
      if (pending.attacker.kind !== 'raider' || !this.ataque.avisar(entrar)) entrar();
      return;
    }

    // La marcha se ha parado al descubrir un grupo que la emboscaría (#130), y
    // se dice.
    if (ultimo?.kind === 'march_halted' && ultimo.hero === hero.id) {
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
    // Se entra en un lugar al ACABAR la marcha en él (no al pasar, como el cofre).
    else if (lugarEn(this.state, hero.at) !== null) this.abrirElLugar(hero.id);
    // Y parar en un paso o un pueblo suyo abre su guarnición; pasar de largo, no.
    else if (this.enSuPasoOPueblo(hero)) this.abrirLaGuarnicion(hero.id);
  }

  // ------------------------------------------------------------ guarnición

  /**
   * La guarnición en pantalla, el reparto de la tropa y la obra del puesto:
   * `GuarnicionEnPantalla` (`sesion/partida/guarnicion.ts`), en la que delegan estos.
   */
  private readonly guarnicion = new GuarnicionEnPantalla(this.dueñoDeLasPiezas);

  /** Si `hero` está en un paso o un pueblo suyo (`GuarnicionEnPantalla.enSuPasoOPueblo`). */
  enSuPasoOPueblo(hero: Hero): boolean {
    return this.guarnicion.enSuPasoOPueblo(hero);
  }

  /** El héroe cuya guarnición está abierta (`<dialog id="guarnicion">`), o `null`. */
  get guarnicionAbierta(): string | null {
    return this.guarnicion.abierta;
  }

  /** Abre la pantalla de repartir la tropa del sitio suyo donde está `heroId` (`GuarnicionEnPantalla.abrir`). */
  abrirLaGuarnicion(heroId: string): void {
    this.guarnicion.abrir(heroId);
  }

  /** Escape o «Cancelar»: se cierra y lo editado se descarta. */
  cerrarLaGuarnicion(): void {
    this.guarnicion.cerrar();
  }

  /** Lo que enseña la pantalla de la guarnición, o `null` (`GuarnicionEnPantalla.vista`). */
  vistaDeLaGuarnicion(): VistaDeLaGuarnicion | null {
    return this.guarnicion.vista();
  }

  /** «Levantar la empalizada» o «Amurallar» del diálogo del puesto (`GuarnicionEnPantalla.mejorar`). */
  mejorarElPuesto(obra: ObraDelPuesto): void {
    this.guarnicion.mejorar(obra);
  }

  /** Pasa uno al otro lado del reparto que se edita (`GuarnicionEnPantalla.mover`). */
  moverEnElReparto(hacia: 'heroe' | 'guarnicion', creature: string, veterano?: string): void {
    this.guarnicion.mover(hacia, creature, veterano);
  }

  /** «Confirmar»: manda el reparto al núcleo y cierra la pantalla (`GuarnicionEnPantalla.confirmar`). */
  confirmarElReparto(): void {
    this.guarnicion.confirmar();
  }

  // ------------------------------------------------------------ la defensa

  /**
   * La defensa de la persona: abrir la batalla en que la atacan y elegir con quién
   * defiende: `DefensaEnPantalla` (`sesion/partida/defensa.ts`), en la que delegan estos.
   */
  private readonly defensaEnPantalla = new DefensaEnPantalla({
    ...this.dueñoDeLasPiezas,
    desplegando: () => this.despliegue.enCurso !== null,
    queMuevaLaIA: () => this.advanceEnemyTurns(),
  });

  /** La pantalla de la defensa, o `null` (`DefensaEnPantalla.vista`). */
  get defensa(): VistaDeLaDefensa | null {
    return this.defensaEnPantalla.vista;
  }

  /** Uno más (o uno menos) de `creature` en la defensa que se elige (`DefensaEnPantalla.cambiar`). */
  cambiarLaDefensa(creature: string, cambio: 1 | -1): void {
    this.defensaEnPantalla.cambiar(creature, cambio);
  }

  /** «Defender» (`DefensaEnPantalla.confirmar`). */
  confirmarLaDefensa(): void {
    this.defensaEnPantalla.confirmar();
  }

  /** Escape o «Como propone la IA»: se defiende con la propuesta (`DefensaEnPantalla.dejarLaDeLaIA`). */
  dejarLaDefensaDeLaIA(): void {
    this.defensaEnPantalla.dejarLaDeLaIA();
  }

  // ------------------------------------------------------------ lugares

  /** El título del mundo que se juega, o `null` sin mundo. */
  get tituloDelMundo(): string | null {
    return this.state.mundo?.historia.titulo ?? null;
  }

  /** El lugar `lugarId` del mundo de la partida, o `null`: la crónica lo nombra por él. */
  lugarDelMundo(lugarId: string): Lugar | null {
    const m = this.state.mundo;
    return m === undefined ? null : lugarSiExiste(m.historia, lugarId);
  }

  /** El nombre del estado de ahora de un lugar, para el rótulo del mapa. */
  estadoDelLugar(lugarId: string): string | null {
    const m = this.state.mundo;
    const l = m === undefined ? null : lugarSiExiste(m.historia, lugarId);
    return m === undefined || l === null ? null : estadoDicho(m, l);
  }

  /** Entra en la escena del lugar donde está el héroe `heroId` (`EnElLugar.entrar`). */
  abrirElLugar(heroId: string): void {
    this.lugar.entrar(heroId);
  }

  /** Sale del lugar al mapa (`EnElLugar.salir`). */
  salirDelLugar(): void {
    this.lugar.salir();
  }

  /**
   * Elige la opción `i` de la conversación abierta; si abre una batalla, se pasa a ella
   * como desde el mapa (`EnElLugar.elegir`).
   */
  elegirEnElLugar(i: number): TrasElegir {
    return this.lugar.elegir(i);
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
      this.status = mensajeDe(err);
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
      this.status = `El turno del rival se ha interrumpido: ${mensajeDe(err)}`;
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
      // (#116, `AtaqueALaPersona.defender`). Si una se quedara a medias, la IA pelearía por ella,
      // pero sin rendirse: rendirse le cobra su oro y esa decisión es solo suya
      // (H-1 de la fase 1b).
      await playAiTurn(this.state, this.ctx, { batallas: { human: () => this.ataque.defender() } });
      guard++;
    }
    // Si se acabó, la barra ya dice cómo (`status`).
    if (this.desenlace === null) this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
  }

  /**
   * Un ataque a la persona: el aviso en el mapa antes de su batalla y, en el turno del
   * rival, la defensa que espera a que la cierre: `AtaqueALaPersona`
   * (`sesion/partida/ataque.ts`), en la que delegan estos. Lo que se abre al defender lo
   * dice la defensa (`DefensaEnPantalla.abrir`).
   */
  private readonly ataque = new AtaqueALaPersona({
    ...this.dueñoDeLasPiezas,
    miBando: () => this.miBando,
    abrirLaDefensa: () => this.defensaEnPantalla.abrir(),
    alCambiarSinGesto: () => this.alCambiarSinGesto(),
    resolverSola: () => this.autoResolveBattle(),
  });

  /** El aviso de un ataque a la persona, antes de su batalla, o `null` (`AtaqueALaPersona.aviso`). */
  get avisoDelAtaque(): VistaDelAviso | null {
    return this.ataque.aviso;
  }

  /** «Defender» en el aviso: se cierra y se abre la batalla (`AtaqueALaPersona.defenderElAtaque`). */
  defenderElAtaque(): void {
    this.ataque.defenderElAtaque();
  }

  /** «Resolver sola» en el aviso: la IA pelea por la persona (`AtaqueALaPersona.resolverElAtaqueSola`). */
  resolverElAtaqueSola(): void {
    this.ataque.resolverElAtaqueSola();
  }

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

  /**
   * Abre la base `townId`. La suya, con el héroe de salida por elegir, abre ante el
   * ayuntamiento, eligiéndolo: se entre desde el mapa, desde «Castillos» o al
   * empezar (QA H4, 22-10-2026: desde la lista abría la base y no la elección).
   */
  openTown(townId: string): void {
    this.aperturas++;
    this.openTownId = townId;
    this.scene = 'town';
    // Lo que decía la barra era del mapa («haz clic en el mapa para mover a tu
    // héroe»): en la base no significa nada.
    this.status = AYUDA_DE_LA_BASE;
    if (this.heroeDeSalidaPendiente && townId === this.jugador.base) this.abrirElAyuntamiento();
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

  /**
   * Abre la base de la persona, donde nace su héroe: así empieza la partida
   * (19-10-2026, «empieza en la base»). Salir de ella (`closeTown`) lleva al mapa.
   */
  abrirSuBase(): void {
    const base = this.jugador.base;
    if (base === null) throw new Error('no se puede abrir tu base: no tienes ninguna');
    // Sin héroe de salida elegido, se empieza ante el ayuntamiento (`openTown`).
    this.openTown(base);
    this.ayudaAlSalir = AYUDA_DEL_MAPA;
  }

  /** La ayuda del mapa, para la primera salida de la base en que empieza la partida. */
  private ayudaAlSalir: string | null = null;

  closeTown(): void {
    this.openTownId = null;
    this.scene = 'adventure';
    // El último rótulo del castillo hablaba de solares y reclutas: fuera de
    // allí no significa nada. Al salir por primera vez, cómo se anda; con el
    // héroe de salida por elegir no se anda, y la ayuda espera a la salida de
    // después (QA H7, 22-10-2026).
    if (this.heroeDeSalidaPendiente) {
      this.status = this.bloqueoDeTurno() ?? '';
      return;
    }
    this.status = this.ayudaAlSalir ?? '';
    this.ayudaAlSalir = null;
  }

  /**
   * El clima que se pinta, con lo que fuerce `?clima=`, y el del sitio de la batalla, la
   * base y el lugar: `ClimaEnPantalla` (`sesion/partida/clima.ts`), en la que delegan estos.
   */
  private readonly climaEnPantalla = new ClimaEnPantalla({
    ...this.dueñoDeLasPiezas,
    casillaDelLugar: () => this.lugar.casilla(),
  });

  /** Fija lo que fuerza `?clima=`; lanza con una región que este mapa no tiene (`ClimaEnPantalla.fijar`). */
  fijarElClima(forzado: ClimaForzado | null): void {
    this.climaEnPantalla.fijar(forzado);
  }

  /** El clima de hoy de cada región, con lo forzado encima (`ClimaEnPantalla.clima`). */
  get clima(): ClimaDeLaPartida {
    return this.climaEnPantalla.clima;
  }

  /** El clima de la batalla pendiente: el de la región donde se pelea (`ControlDeBatalla`). */
  override get climaDeLaBatalla(): ClimaDelSitio {
    return this.climaEnPantalla.deLaBatalla;
  }

  /** El clima de la base abierta, o `null` sin base abierta (`ClimaEnPantalla.deLaBase`). */
  get climaDeLaBase(): ClimaDelSitio | null {
    return this.climaEnPantalla.deLaBase;
  }

  /** El clima del lugar abierto, o `null` sin lugar abierto (`ClimaEnPantalla.delLugar`). */
  get climaDelLugar(): ClimaDelSitio | null {
    return this.climaEnPantalla.delLugar;
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
    const figuras = this.figurasDeLaGente(town.faction);
    const cuerpo = (persona: string): string => cuerpoDeLaPersona(figuras.get(persona) ?? null);
    const vista: VistaDeLaBase = {
      faccion: town.faction,
      townId: town.id,
      owner: dueñoDeLaCiudad(this.state, town),
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
        cuerpo: cuerpo(v.id),
        linea: vozDe(town, v.id, semana, this.state.day),
      })),
      caminante:
        heroe === null
          ? {
              id: `alcaide-${town.id}`,
              nombre: alcaide.nombre,
              cuerpo: cuerpo(ID_DEL_ALCAIDE),
            }
          : { id: heroe.id, nombre: heroe.name, cuerpo: figuraDelHeroe(heroe) },
    };
    this.cacheDeLaBase = { version: this.version, townId: town.id, vista };
    return vista;
  }
  private cacheDeLaBase: { version: number; townId: string; vista: VistaDeLaBase } | null = null;

  /**
   * La figura de cada persona de la gente de `faccion`, del banco de NPC
   * (`figurasDeLaGente`; sin ninguna de su facción, el Y Bot civil). Una vez por
   * facción: no depende de la partida que se juega, sino de la semilla, el mundo y
   * el banco, que no cambian en una sesión.
   */
  private figurasDeLaGente(faccion: FactionId): ReadonlyMap<string, string | null> {
    let figuras = this.figurasPorFaccion.get(faccion);
    if (figuras === undefined) {
      figuras = figurasDeLaGente(this.state, faccion, this.gente);
      this.figurasPorFaccion.set(faccion, figuras);
    }
    return figuras;
  }

  private readonly figurasPorFaccion = new Map<FactionId, ReadonlyMap<string, string | null>>();

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
    if (town === null || dueñoDeLaCiudad(this.state, town) === null) return null;
    return recruitCapacity(town, creatureId, destinoDeRecluta(this.state, town), this.oro);
  }

  /**
   * Por qué no se puede reclutar ni uno de esa criatura en el castillo abierto,
   * o `null`: la frase del núcleo (`reclutarBlocker`), la misma con que lanzaría
   * la acción. Con ella el panel apaga «+1» y «Todo» en vez de ofrecerlos.
   */
  motivoParaNoReclutar(creatureId: string): string | null {
    const town = this.activeTown;
    if (town === null || dueñoDeLaCiudad(this.state, town) === null) return null;
    return (
      this.bloqueoDeTurno() ??
      this.mandaEn(town) ??
      reclutarBlocker(town, creatureId, 1, destinoDeRecluta(this.state, town), this.oro)
    );
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
   * La pieza de la mochila elegida y lo que se hace con el equipo desde el panel del héroe
   * y la armería: `EquipoEnPantalla` (`sesion/partida/equipo.ts`), en la que delegan estos.
   */
  private readonly equipo = new EquipoEnPantalla(this.dueñoDeLasPiezas);

  /** La pieza de la mochila elegida para ponérsela a alguien, o `null` (`EquipoEnPantalla.elegida`). */
  get selectedItem(): string | null {
    return this.equipo.elegida;
  }

  /** Elegir una pieza de la mochila del héroe elegido; elegir la misma otra vez la suelta. */
  selectItem(itemId: string): void {
    this.equipo.elegir(itemId);
  }

  /** Comprar `itemId` en la armería de la base abierta (`EquipoEnPantalla.comprar`). */
  buyItem(itemId: string): void {
    this.equipo.comprar(itemId);
  }

  /** Ponerle la pieza elegida al héroe o a uno de su tropa (`EquipoEnPantalla.poner`). */
  equip(heroId: string, a: { readonly veteran?: string; readonly creature?: string } = {}): void {
    this.equipo.poner(heroId, a);
  }

  /** Quitar lo del hueco `slot` al héroe o a un veterano, a la mochila (`EquipoEnPantalla.quitar`). */
  unequip(heroId: string, slot: string, veteran?: string): void {
    this.equipo.quitar(heroId, slot, veteran);
  }

  // ------------------------------------------------------------ la morada en escena

  /**
   * La morada de la base en escena: `MoradaEnPantalla` (`sesion/partida/morada.ts`), en la
   * que delegan estos. Lo que se recluta en ella lo dice la base (`recruitPlan`,
   * `motivoParaNoReclutar`).
   */
  private readonly morada = new MoradaEnPantalla({
    ...this.dueñoDeLasPiezas,
    reclutamiento: (id) => ({
      plan: this.recruitPlan(id),
      motivo: this.motivoParaNoReclutar(id),
    }),
  });

  /** Entra en la morada levantada en `sitio` de la base abierta (`MoradaEnPantalla.abrir`). */
  abrirLaMorada(sitio: SitioId): void {
    this.morada.abrir(sitio);
  }

  /** Vuelve de la morada a la base, que sigue abierta (`MoradaEnPantalla.cerrar`). */
  cerrarLaMorada(): void {
    this.morada.cerrar();
  }

  /** Elegir una unidad de la morada (`MoradaEnPantalla.elegir`). */
  elegirEnLaMorada(id: string): void {
    this.morada.elegir(id);
  }

  /** Lo que se ve en la escena de la morada, o `null` fuera de ella (`MoradaEnPantalla.vista`). */
  vistaDeLaMorada(): VistaDeLaMorada | null {
    return this.morada.vista();
  }

  // ------------------------------------------------------------ el ayuntamiento en escena

  /**
   * Si la persona tiene aún por elegir su héroe de salida (`Player.heroeDeSalida`):
   * hasta entonces no se juega nada más (`bloqueoDeTurno`, con la frase del núcleo).
   */
  get heroeDeSalidaPendiente(): boolean {
    return this.jugador.heroeDeSalida !== null;
  }

  /**
   * El ayuntamiento de la base en escena y contratar: `AyuntamientoEnPantalla`
   * (`sesion/partida/ayuntamiento.ts`), en la que delegan estos.
   */
  private readonly ayuntamiento = new AyuntamientoEnPantalla({
    ...this.dueñoDeLasPiezas,
    heroeDeSalidaPendiente: () => this.heroeDeSalidaPendiente,
    heroeEnLaBase: () => this.heroeEnLaBase(),
  });

  /** Entra en la escena del ayuntamiento de la base abierta (`AyuntamientoEnPantalla.abrir`). */
  abrirElAyuntamiento(): void {
    this.ayuntamiento.abrir();
  }

  /** Vuelve del ayuntamiento a la base, que sigue abierta (`AyuntamientoEnPantalla.cerrar`). */
  cerrarElAyuntamiento(): void {
    this.ayuntamiento.cerrar();
  }

  /** Elegir un candidato del ayuntamiento (`AyuntamientoEnPantalla.elegir`). */
  elegirEnElAyuntamiento(tipo: string): void {
    this.ayuntamiento.elegir(tipo);
  }

  /** Lo que se ve en la escena del ayuntamiento, o `null` fuera de ella (`AyuntamientoEnPantalla.vista`). */
  vistaDelAyuntamiento(): VistaDelAyuntamiento | null {
    return this.ayuntamiento.vista();
  }

  /**
   * Contrata en la base abierta un héroe del tipo `tipo`, o elige y paga el de salida
   * (`AyuntamientoEnPantalla.contratar`).
   */
  hireHero(tipo?: string): void {
    this.ayuntamiento.contratar(tipo);
  }

  // ------------------------------------------------------------ la tropa en escena

  /**
   * La tropa del héroe en escena, su formación y su equipo: `TropaEnPantalla`
   * (`sesion/partida/tropa.ts`), en la que delegan estos.
   */
  private readonly tropa = new TropaEnPantalla(this.dueñoDeLasPiezas);

  /**
   * La formación del héroe en la escena de la tropa (`TropaEnPantalla.formacion`): la
   * misma pieza que el despliegue de una batalla, sobre la batalla de la formación.
   */
  get formacion(): DespliegueEnPantalla {
    return this.tropa.formacion;
  }

  /** Por qué no se puede abrir ahora la escena de la tropa, o `null` (`TropaEnPantalla.blocker`). */
  tropaBlocker(): string | null {
    return this.tropa.blocker();
  }

  /** Abre la escena de la tropa del héroe elegido (`TropaEnPantalla.abrir`). */
  abrirLaTropa(): void {
    this.tropa.abrir();
  }

  /** Vuelve al mapa con el mismo héroe elegido (`TropaEnPantalla.cerrar`). */
  cerrarLaTropa(): void {
    this.tropa.cerrar();
  }

  /** A quién se mira en la escena de la tropa (`TropaEnPantalla.elegido`). */
  get elegidoEnLaTropa(): Portador {
    return this.tropa.elegido;
  }

  /** Elegir a alguien de la tropa (`TropaEnPantalla.elegir`). */
  elegirEnLaTropa(q: Portador): void {
    this.tropa.elegir(q);
  }

  /** Lo que se ve en la escena de la tropa, o `null` fuera de ella (`TropaEnPantalla.vista`). */
  vistaDeLaTropa(): VistaDeLaTropa | null {
    return this.tropa.vista();
  }

  /** Ponerle `item` de la mochila del héroe al elegido de la tropa (`TropaEnPantalla.poner`). */
  ponerALaElegida(item: string, enHueco?: string): void {
    this.tropa.poner(item, enHueco);
  }

  /** Quitarle al elegido de la tropa lo del hueco `slot` (`TropaEnPantalla.quitar`). */
  quitarALaElegida(slot: string): void {
    this.tropa.quitar(slot);
  }

  // ------------------------------------------------------------ batalla

  /** La batalla pendiente de la partida, la que se pelea ahora, o `null`. */
  override get battle(): BattleState | null {
    return this.state.pendingBattle?.battle ?? null;
  }

  /** Lo que dice la barra al entrar en una batalla: el despliegue, si es suyo, o `si no`. */
  private alEntrarEnLaBatalla(siNo: string): string {
    return this.despliegue.enCurso === null ? siNo : AYUDA_DEL_DESPLIEGUE;
  }

  /**
   * Pasa a la batalla que acaba de abrirse: la de la marcha que acaba en ella y la de una
   * opción de un lugar (`EnElLugar.elegir`).
   */
  private entrarEnLaBatalla(): void {
    this.scene = 'battle';
    this.status = this.alEntrarEnLaBatalla('¡Batalla!');
    // Si la iniciativa la tiene el enemigo, mueve él primero: sin esto la
    // batalla se quedaba esperando a una persona que no podía hacer nada.
    this.advanceEnemyTurns();
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
  override get dueños(): Readonly<Record<Side, PlayerId | null>> | null {
    const pending = this.state.pendingBattle;
    return pending === null ? null : battleOwners(this.state, pending);
  }

  override get miBando(): Side | null {
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
  override get turnoPropio(): TurnoPropio | null {
    const battle = this.battle;
    if (battle === null || battle.finished !== null) return null;
    const side = this.miBando;
    const stack = activeStack(battle);
    if (side === null || stack === null || stack.side !== side) return null;
    return { battle, stack, side };
  }

  /** El héroe de la persona en la batalla en curso, el de SU bando. */
  get battleHero() {
    const bando = this.miBando;
    if (bando === null) return null;
    return this.battle?.heroes[bando] ?? null;
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
   * Deja que la IA mueva mientras el turno NO sea del bando de la persona
   * (`SesionDeBatalla.seguirLaIA`, con `laIAMueve`). Si la IA golpea cuerpo a cuerpo a
   * una unidad de la persona, se para: se planta ante ella y la rueda pide la
   * respuesta.
   */
  advanceEnemyTurns(): void {
    this.seguirLaIA();
  }

  /**
   * El cierre de la batalla de la persona —«Resolver sola», «Continuar» y volver al mapa o
   * al lugar con lo que pasó dicho en la barra—: `CierreDeLaBatalla`
   * (`sesion/partida/cierre-de-batalla.ts`), en la que delegan estos.
   */
  private readonly cierre = new CierreDeLaBatalla({
    ...this.dueñoDeLasPiezas,
    batalla: () => this.battle,
    eligiendoLaDefensa: () => this.defensaEnPantalla.eligiendo(),
    golpePlantado: () => this.rueda.pendiente !== null,
    lugarDeLaBatalla: () => this.lugar.deLaBatalla(),
    soltarLosApuntados: () => {
      this.apuntados.soltar();
    },
    trasLaBatalla: () => this.ataque.trasLaBatalla(),
    volverAlLugar: (heroId) => this.lugar.volver(heroId),
  });

  /** Resuelve el resto de la batalla con la IA en ambos bandos (`CierreDeLaBatalla.resolverSola`). */
  autoResolveBattle(): void {
    this.cierre.resolverSola();
  }

  /** Cierra la batalla terminada y vuelve al mapa o al lugar (`CierreDeLaBatalla.continuar`). */
  finishBattle(): void {
    this.cierre.continuar();
  }

  // ------------------------------------------------------------ interno

  /**
   * Las acciones del castillo, con la guarda de turno delante (`bloqueo`, por
   * defecto `bloqueoDeTurno`; contratar pasa solo la del turno).
   *
   * `build`, `recruit` y `hireHero` no la tenían: mientras el turno fue
   * síncrono no había un instante en el que pulsarlas fuera de turno, y desde
   * que no lo es sí. El núcleo también las rechaza —lo cierran los dos lados—,
   * pero aquí se dice antes y sin excepción.
   */
  private run(fn: () => void, bloqueo = this.bloqueoDeTurno()): boolean {
    if (bloqueo !== null) {
      this.status = bloqueo;
      return false;
    }
    let bien = false;
    try {
      fn();
      this.status = '';
      bien = true;
    } catch (err) {
      this.status = mensajeDe(err);
    }
    this.tocar();
    // Quien lo llama puede decir en la barra qué pasó si salió bien («El gambesón
    // vuelve a la mochila»): lo de un rechazo ya lo ha escrito el núcleo.
    return bien;
  }

  /**
   * Por qué no se puede jugar ahora, o `null`: el turno (`turnoAjeno`) y, si no, el
   * héroe de salida por elegir (`salidaPendienteBlocker`). **La compuerta de toda
   * acción** de la persona: la leen las acciones (`run`), la tropa y lo que se
   * apaga en pantalla (reclutar, construir, el fin de turno). Contratar mira solo
   * el turno (`turnoAjeno`): con el de salida pendiente es lo único que se hace.
   * Abrir y cerrar escenas o pulsar el mapa (`clickTile`) no pasan por aquí.
   */
  bloqueoDeTurno(): string | null {
    return this.turnoAjeno() ?? salidaPendienteBlocker(this.state, this.viewer);
  }

  /**
   * Por qué no es el turno de la persona, o `null`. **La frase la escribe el núcleo.**
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
  private turnoAjeno(): string | null {
    if (this.isPlayersTurn) return null;
    return (
      turnBlocker(this.state, this.viewer) ?? 'Espera: el turno del rival aún se está resolviendo.'
    );
  }
}
