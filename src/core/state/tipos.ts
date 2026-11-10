/**
 * La forma de la partida, sin reglas: el estado (`GameState`), sus jugadores, lo que
 * recuerdan, la batalla que espera y las acciones del mapa (`AdventureAction`).
 *
 * Vivía al principio de `game.ts`, y quien solo necesitaba la forma —la regla de un
 * lugar, los sitios, la renta, los asaltantes, el clima— importaba el fichero de las
 * reglas entero: `mundo/reglas.ts` y `game.ts` se importaban el uno al otro, un ciclo
 * de importación en ejecución (fase N de la reorganización, 07-11-2026).
 */
import type { BattleState } from '../battle/types.js';
import type { ReglasDelCombate } from '../combate.js';
import type { Portador } from '../equipo/portador.js';
import type { Casillas } from '../map/casillas.js';
import type { GameMap, MapObject, ObraDelPuesto } from '../map/tipos.js';
import type { EstadoDelMundo } from '../mundo/formato.js';
import type { Rng } from '../rng.js';
import type { Town } from '../town/town.js';
import type {
  Controller,
  FactionId,
  Guarnicion,
  Hero,
  Hex,
  Hueco,
  PlayerId,
  Point,
  Raider,
} from '../types.js';
import type { AsaltanteRecordado } from './asaltantes.js';
import type { PedidoDeClima } from './clima.js';
import type { Atacante, BattleFoe, GameEvent } from './events.js';
import type { PedidoDeReparto, PedidoDeTropa, SitioVisto } from './sitios.js';

export interface Player {
  readonly id: PlayerId;
  readonly faction: FactionId;
  controller: Controller;
  /**
   * Su oro, el único recurso. Entra por la renta del
   * día (`rentaDelDia`) y los cofres, y sale al construir, reclutar, comprar,
   * contratar y rendirse.
   */
  oro: number;
  /** Casillas ya exploradas (`Casillas`, un byte por casilla, #146). */
  readonly fog: Casillas;
  /**
   * Lo último OBSERVADO de cada objeto del mapa, por id de objeto.
   *
   * La niebla filtraba el espacio pero no el tiempo: bastaba haber pisado una
   * casilla el día 3 para ver, el día 20, quién posee el nodo AHORA. Lo que se
   * recuerda es lo que se vio, con el día en que se vio, así que hay algo que
   * reconocer — y un pueblo que dejó de dar oro sin que cambie nada en el mapa
   * conocido es justo la señal de que allí ha pasado algo.
   */
  memory: Map<string, RememberedObject>;
  /**
   * Lo último OBSERVADO de cada grupo de asaltantes, por id de grupo: lo que la
   * IA de reglas teme (`casillasPeligrosas`, #164). Se escribe junto a `memory`
   * (`mirarDesde`, con `recordarAsaltantes`) y no viaja a nadie: el agente y la
   * pantalla ven los grupos de ahora (`asaltantesALaVista`).
   */
  asaltantesVistos: Map<string, AsaltanteRecordado>;
  defeated: boolean;
  /**
   * El id del castillo al que vuelve un héroe derrotado o rendido, o `null` si
   * no tiene ninguno.
   *
   * PROVISIONAL (fase 1b): es el primer castillo que el jugador tenía al empezar
   * la partida y no cambia aunque conquiste otros. La «base única» formal es de
   * la fase 3. Que la base siga siendo SUYA no se guarda aquí: se pregunta a
   * `dueñoDeLaCiudad` cada vez, porque el dueño de un castillo vive en un solo
   * sitio (su objeto del mapa, que escribe `tomarElNodo`) y una segunda copia es
   * lo que ya costó #47.
   */
  readonly base: string | null;
  /**
   * El héroe de salida **que aún no se ha elegido**, o `null` si no hay ninguno
   * pendiente (lo normal). Lo hace `newGame` como siempre —nombre, cifras, tropa de
   * su tirada— y se queda aquí, fuera de `state.heroes`, hasta que su jugador lo
   * elige y lo paga en su base (`hire_hero` con `tipo`, `hireHero`): solo la
   * persona que empieza sin `?heroe=` (`NewGameOptions.tipoDelHeroe` a `null`); la
   * IA, el agente y `newGame` por defecto lo pagan al crear la partida, por la
   * misma puerta. Mientras está pendiente, su jugador no hace nada más
   * (`salidaPendienteBlocker`). Es «el de salida», no «sin héroes»: un jugador que
   * pierde al suyo a media partida sigue pasando el turno.
   */
  heroeDeSalida: Hero | null;
}

/** Un objeto del mapa tal y como se vio, y cuándo. */
export interface RememberedObject {
  readonly day: number;
  readonly object: MapObject;
  /**
   * De una ciudad o un pueblo, de quién era y quién lo ocupaba cuando se vio
   * (`dueñoDelSitio`, `ocupanteDe`): el dueño de uno de dentro de una región no
   * está en su objeto, se deriva, y la niebla tiene que recordar el que se vio y
   * no el de ahora (ciudades y pueblos en su región, 05-11-2026). Sin él, el objeto
   * no es un sitio con dueño (un cofre, un monstruo) o es un paso, cuyo dueño ya
   * va en el objeto.
   */
  readonly sitio?: SitioVisto;
}

/**
 * Cómo terminó una partida: quién ganó, o `null` si **no ganó nadie**.
 *
 * Tiene nombre porque lo devuelven cuatro sitios —el estado, `playAiGame`, el
 * director y el arnés del banco— y escrito inline en cada uno son cuatro
 * declaraciones de la misma cosa, libres de divergir en cuanto a alguien se le
 * ocurra añadirle el día o el motivo.
 */
export interface GameOutcome {
  readonly winner: PlayerId | null;
}

/**
 * Quién pelea contra quién en una batalla del mapa: un héroe que ataca a
 * cualquier cosa, o un grupo de asaltantes que **embosca a un héroe**.
 *
 * Es una unión y no `{ attacker: Atacante; foe: BattleFoe }` para que el tipo
 * diga lo que la regla dice: un grupo solo embosca a héroes. Con los dos campos
 * sueltos cabía un asaltante contra un monstruo, y quien cerraba la emboscada
 * tenía que lanzar por un caso que nadie puede construir.
 *
 * Era `attackerHeroId: string`, y la frase «el atacante es siempre un jugador»
 * vivía en dos comentarios del servidor; los asaltantes la hicieron falsa.
 */
export type Enfrentamiento =
  | { readonly attacker: Extract<Atacante, { kind: 'hero' }>; readonly foe: BattleFoe }
  | {
      readonly attacker: Extract<Atacante, { kind: 'raider' }>;
      readonly foe: Extract<BattleFoe, { kind: 'hero' }>;
    };

/**
 * La defensa elegida de una batalla pendiente: el héroe atacado en un sitio suyo
 * con guarnición y ese sitio, por sus ids (`PendingBattle` es estado que se puede
 * guardar). La pone `dejarPendiente` y la lee quien la deja rehacer
 * (`defensaPosible`): que se pueda elegir es de la batalla, no de la crónica.
 */
export interface DefensaElegida {
  readonly hero: string;
  readonly sitio: string;
}

export type PendingBattle = Enfrentamiento & {
  readonly battle: BattleState;
  /** Con quién defiende el héroe atacado en su sitio, si lo está (D1 del puesto fronterizo). */
  readonly defensa?: DefensaElegida;
};

export interface GameState {
  readonly seed: number;
  /** Día 1 en adelante. Los lunes son los días 1, 8, 15… */
  day: number;
  /**
   * El último día que se juega. Pasado él, la partida termina sin ganador.
   *
   * Se pide en `newGame({ maxDays })` y lo aplica `advanceDay`. Por qué vive
   * aquí y no en el bucle de cada conductor, en `finished`, tres campos abajo.
   */
  readonly maxDays: number;
  /**
   * La complejidad del combate que se eligió al empezar (`core/combate.ts`): el
   * tope de tropa por bando y la rueda. No cambia en toda la partida; la leen cada
   * batalla (`createBattle`), lo que se recluta y se recoge, la IA y el agente
   * (`you.combat`). Ningún hecho de la crónica la lleva: con 7 / 7 el banco no se
   * mueve.
   */
  readonly combate: ReglasDelCombate;
  map: GameMap;
  players: Player[];
  heroes: Hero[];
  towns: Town[];
  current: PlayerId;
  pendingBattle: PendingBattle | null;
  /**
   * Los grupos de asaltantes en pie (`state/asaltantes.ts`). Son actores, como
   * los héroes, y no objetos del mapa: se mueven cada día, y la memoria de la
   * niebla —que copia objetos— los enseñaría donde ya no están.
   */
  raiders: Raider[];
  /**
   * La partida ha terminado, y `winner` dice quién ganó **o que no ganó nadie**.
   *
   * **Este docstring es el sitio donde se cuenta el porqué del tope de días**;
   * el resto del repositorio apunta aquí en vez de repetirlo.
   *
   * `!== null` significa «terminó» y nada más. Antes significaba «terminó **con**
   * ganador», y el tope de días vivía fuera —`MAX_DAYS` en `ws-server.ts`,
   * `DIAS_POR_DEFECTO` en el banco y un parámetro de `playAiGame`, cada uno con
   * su bucle—, así que al agotarse los días el bucle salía y esto se quedaba en
   * `null`: el núcleo sosteniendo que la partida seguía viva cuando ya no la
   * jugaba nadie. Un cuarto conductor que se olvidara del suyo jugaba hasta el
   * fin de los tiempos, y los que sí lo tenían tapaban el hueco por su cuenta:
   * de ahí nacieron el booleano `partidaTerminada` de `ws-server.ts` y el
   * `winner: number | null` del protocolo, los dos parcheando lo mismo desde
   * fuera.
   *
   * El `null` de dentro es ese empate por tiempo, y obliga a decidir qué se
   * enseña. Lo que **no** obliga es `tsc`: `finished.winner === viewer` con un
   * `null` delante compila y contesta «has perdido», así que la clasificación
   * de tres se escribe una vez por lector —`client/comun/quien-mira.ts`— y no en cada
   * ternario.
   */
  finished: GameOutcome | null;
  /**
   * La crónica. `readonly` es un candado, no adorno: el único `push` está en
   * `emit`, y con el array de solo lectura cualquier otro **no compila**.
   *
   * Es lo que sostiene «un hecho, un sitio» aquí: si el reparto se apoyara en
   * que todo el mundo se acuerde de llamar a `emit`, el emisor número veinte
   * nacería sin protagonista y sin sello. Y lo sostiene `tsc` en cada build, no
   * una expresión regular: un guardia por texto no sabe distinguir este
   * `log.push` del de `battle.ts`, que es otro tipo y otro canal.
   *
   * Los consumidores no se enteran: `slice`, `some`, `map`, `filter` y `at`
   * valen igual sobre un array de solo lectura.
   */
  readonly log: readonly GameEvent[];
  /**
   * El mundo de la partida (`core/mundo/`): su historia y lo que cambia de ella
   * —el estado de cada lugar y las marcas puestas—. **Ausente sin mundo**:
   * `newGame` solo lo escribe con una historia, y nada del procedimental lo lee,
   * así que su presencia no puede mover una partida del banco.
   * Lo escriben solo las acciones de los lugares (`elegir_en_lugar`) y el cierre
   * de sus batallas.
   */
  mundo?: EstadoDelMundo;
  /**
   * El número del próximo veterano (`Veterania.id`). Un contador del estado y
   * no un id derivado de dónde está el individuo: se mueve de héroe a
   * guarnición y vuelve, y su identidad tiene que sobrevivir a eso. Se lleva
   * el primero al ganar su primer punto, en el orden de `stacks`, así que es
   * determinista.
   */
  siguienteVeterano: number;
  /**
   * Cuántas piezas de botín se han repartido. Cada reparto tira de **su propia
   * corriente** (`createRng` sobre la semilla de la partida y este número) y no
   * de `ctx.rng`: así el botín no desplaza ni una tirada de batalla, y que lo
   * hiciera se vería en el volcado del banco como partidas distintas en vez de
   * como líneas de botín añadidas. Es la misma idea que `siguienteVeterano`: un
   * contador del estado, determinista.
   */
  siguienteBotin: number;
  /**
   * El número del próximo héroe contratado (`hireHero`). Antes el id salía de
   * `hero-<jugador>-<cuántos héroes hay>-<día>`, y eso se repetía: con tres
   * jugadores, el 0 contrata, el 2 pierde la base y su héroe sale de
   * `state.heroes`, y la segunda contratación del 0 ese mismo día recibía el
   * mismo id que la primera (#126). Un contador no depende de cuántos quedan.
   */
  siguienteHeroe: number;
  /**
   * El clima que pidió el narrador, por id de región, hasta el día `hasta`
   * (`state/clima.ts`). **Presentación**, como `Town.voces`: ninguna regla lo
   * lee, no escribe en la crónica y el banco no lo ve. Ausente sin agente: el
   * clima sale entero de la semilla. Lo escribe solo `pedirClima` y lo lee
   * `climaDeLaPartida`.
   */
  climaPedido?: Record<string, PedidoDeClima>;
  /**
   * La tropa que guarda cada sitio —ciudad, paso o pueblo—, por su id, con su
   * dueño (`state/sitios.ts`): quien la dejó, el de la base al nacer, o `null`, la
   * neutral de una ciudad neutral. Sin entrada, el sitio no guarda nada. **Solo la
   * escribe `sitios.ts`** (dejar, recoger, reclutar sin héroe, la defensa y lo que
   * sobrevive o se pierde en una batalla; lo vigila `test/invariantes-partida.test.ts`).
   */
  guarniciones: Record<string, Guarnicion>;
}

export interface GameContext {
  readonly rng: Rng;
}

/** Héroes simultáneos por jugador. */
export const MAX_HEROES_PER_PLAYER = 4;

export type AdventureAction =
  | { readonly type: 'move_hero'; readonly hero: string; readonly to: Point }
  /**
   * Contratar en `town` un héroe del tipo `tipo` (de la facción del pueblo; sin él,
   * el de por defecto), al precio de todo héroe (`ECONOMIA.precioDelHeroe`). Con el
   * héroe de salida pendiente, es elegirlo y pagarlo en la base (`hireHero`). El
   * contrato del agente no lleva `tipo`: contrata el de por defecto.
   */
  | { readonly type: 'hire_hero'; readonly town: string; readonly tipo?: string }
  | {
      readonly type: 'recruit';
      readonly town: string;
      readonly creature: string;
      readonly count: number;
    }
  | { readonly type: 'build'; readonly town: string; readonly building: string }
  /**
   * Licenciar `count` individuos de `creature` del ejército de un héroe, esté
   * donde esté del mapa (`dismissBlocker`). Es lo que deja cambiar una
   * tropa barata por una mejor: el cupo y el liderazgo se llenan con lo primero
   * que se recluta, y sin esto un héroe se quedaba con ella para siempre.
   */
  | {
      readonly type: 'dismiss';
      readonly hero: string;
      readonly creature: string;
      readonly count: number;
    }
  /**
   * Comprar en la armería de `town` una pieza que se vende (`seVende`, `item`) para
   * la mochila del héroe propio que está dentro (`buyBlocker`).
   */
  | { readonly type: 'buy_item'; readonly town: string; readonly item: string }
  /**
   * Dejar tropa del ejército de `hero` en la guarnición del sitio suyo donde está
   * —una ciudad, un paso o un pueblo— (`dejar_tropa`), o recogerla de ella
   * (`recoger_tropa`): `count` de `creature` (los que se irían, `elQueSeIria`) o el
   * veterano `veterano` (`PedidoDeTropa`). La regla, `intercambioBlocker`
   * (`state/sitios.ts`). Sustituye a la recogida al pasar por casa, que se retiró.
   */
  | ({ readonly type: 'dejar_tropa' | 'recoger_tropa' } & PedidoDeTropa)
  /**
   * Repartir de una vez la tropa entre `hero` y la guarnición del sitio suyo donde
   * está: `enElHeroe` dice todo lo que va con él (`LineaDelReparto`) y lo demás queda
   * guardando. Se juzga solo el reparto final (`repartirTropaBlocker`), así que con
   * los dos llenos se cambia uno por otro (D9 de la tarea del puesto fronterizo). La
   * manda la pantalla de la guarnición al confirmar, y el agente con su
   * `distribute_troops` (`accionDelAgente`); la IA sigue con `dejar_tropa` y
   * `recoger_tropa`.
   */
  | ({ readonly type: 'repartir_tropa' } & PedidoDeReparto)
  /**
   * Hacer la obra `obra` del puesto (el paso tomado) donde está `hero`, suyo: la
   * siguiente, de la caseta a la empalizada y de la empalizada a la muralla, pagada
   * en oro e inmediata (`mejorarBlocker`, `state/sitios.ts`). Se nombra la obra para
   * que el segundo clic de un doble clic no compre la que sigue (QA de la fase 3). La batalla en el paso se pelea
   * después tras la muralla de su obra (`murallaDelSitio`). La manda el diálogo de
   * la guarnición, y el agente con su `upgrade_outpost` (`accionDelAgente`); la IA de
   * reglas no mejora.
   */
  | { readonly type: 'mejorar_el_puesto'; readonly hero: string; readonly obra: ObraDelPuesto }
  /**
   * Ponerle a alguien una pieza de la mochila del héroe `hero`: al héroe si no se
   * dice a quién; a `veteran`, el individuo de su tropa con esa hoja; o a
   * `creature`, el primer novato sin hoja de ese tipo, que pasa a tenerla; o a
   * `puesto`, el individuo de ese puesto de su tropa (la escena de la tropa, donde
   * se pulsa a uno: el contrato del agente no lo lleva). En `hueco`, o en el suyo
   * si no se dice: un arma de cuerpo a cuerpo va también en `segunda` (25-10-2026,
   * «se permiten dos armas»). Lo que ocupaba el hueco vuelve a la mochila
   * (`equipBlocker`).
   */
  | {
      readonly type: 'equip';
      readonly hero: string;
      readonly item: string;
      readonly veteran?: string;
      readonly creature?: string;
      readonly puesto?: number;
      readonly hueco?: Hueco;
    }
  /**
   * Quitarle a alguien la pieza de `slot` y devolverla a la mochila
   * (`unequipBlocker`). El hueco llega ya comprobado: lo traducen las dos
   * puertas por las que entra como texto, `accionDelAgente` (el inglés del
   * contrato) y la sesión del cliente (`esHueco`).
   */
  | {
      readonly type: 'unequip';
      readonly hero: string;
      readonly slot: Hueco;
      readonly veteran?: string;
      /** El individuo de ese puesto de la tropa, como en `equip`. */
      readonly puesto?: number;
    }
  /**
   * Poner a `quien` (el héroe o el individuo de un puesto de su tropa) en la
   * casilla `at` de la formación de `hero`, en el marco del atacante; si ahí sale
   * otro de los suyos, se cambian (02-11-2026, «la vista de tropa pasa a ser la de
   * despliegue»). La formación es de donde arranca el despliegue de cada batalla
   * (`Troop.salida`, `Hero.salida`, `asentar`). Es estado y no un hecho, como
   * `equip`: no gasta nada ni va a la crónica (`formarBlocker`). El contrato del
   * agente no lo lleva (backlog).
   */
  | {
      readonly type: 'formar';
      readonly hero: string;
      readonly quien: Portador;
      readonly at: Hex;
    }
  /**
   * Elegir una opción de la conversación de un punto de un lugar de un mundo
   * (`core/mundo/`), con el héroe que está en él. Solo las opciones que hacen algo
   * (`hace`): ir de un nodo a otro es de quien conversa, no del núcleo. Aplica sus
   * efectos todos o ninguno (`opcionBlocker` antes), cada uno con su hecho; una
   * batalla, la última, queda pendiente como cualquier otra.
   */
  | {
      readonly type: 'elegir_en_lugar';
      readonly hero: string;
      readonly lugar: string;
      readonly punto: string;
      readonly nodo: string;
      readonly opcion: number;
    }
  | { readonly type: 'end_turn' };
