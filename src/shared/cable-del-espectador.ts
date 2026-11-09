/**
 * El cable del espectador: lo que el servidor de la partida le manda a quien mira,
 * declarado UNA vez. El mensaje es `SpectatorSnapshotMsg` y la vista que lleva,
 * `SpectatorView`.
 *
 * La vista vivía a mano dentro de `broadcast()` y el mensaje que la llevaba decía
 * `view: unknown`, así que quien la pintara tendría que reimplementar el esquema
 * del emisor por su cuenta — que es exactamente lo que acaba de morder en
 * `MapPlan` contra `mapPlanSchema`. Hay un solo tipo, este; un solo constructor,
 * `construirVista` (`src/server/vista-espectador.ts`), y una sola vuelta,
 * `adaptar.ts` (`src/client/espectador/`), y los dos extremos compilan contra él.
 *
 * Vive en `shared` desde la fase S de la reorganización (07-11-2026) porque lo leen
 * el servidor, que lo escribe, y el espectador, que lo pinta. Vivía en el servidor
 * (la vista en `vista-espectador.ts`, el mensaje en `protocol.ts`) y el cliente lo
 * importaba de `src/server/`: tipos solo, pero la página no compilaba sin el
 * servidor. Nada del cliente importa el servidor desde entonces (lo vigila
 * `invariantes-cliente.test.ts`).
 *
 * **Sin zod, y es deliberado.** Lo que hizo falta validar en `MapPlan` lo escribe
 * el AGENTE, que es un modelo y puede escribir cualquier cosa. Esto lo escribe
 * el servidor y lo lee una página de este repositorio: los dos lados salen del
 * mismo `tsc`. Lo único que se comprueba en ejecución, y en el otro extremo, es
 * que el mensaje diga `type: 'snapshot'`.
 */
import type { BattleStack, BattleState, Side } from '../core/battle/types.js';
import type { TerrainKind } from '../core/map/terrain.js';
import type { MapObject, MapRegion } from '../core/map/tipos.js';
import type { ClimaDeLaPartida } from '../core/state/clima.js';
import type { GameEventDraft, Ocupante } from '../core/state/events.js';
import type {
  FactionId,
  Hex,
  PlayerId,
  Point,
  UnitInfo,
  Veterania,
  VistaAsaltante,
} from '../core/types.js';

/**
 * El mapa tal como viaja. Los caminos van como **tramos** (#153), los mismos que
 * pinta el cliente, y **planos**: índices `y * width + x`, dos por tramo
 * (`[i, k, i, k, …]`), y las casillas sueltas aparte. Como pares de `{x, y}`
 * la vista de la semilla 1 pesaba 27,6 KB y así pesa 22,4, y va un mensaje
 * por acción. `adaptar.ts`, en el cliente, es su inversa exacta: rehace la red
 * con `desdeTramos`.
 */
export interface VistaMapa {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
  readonly tramos: readonly number[];
  readonly sueltas: readonly number[];
  readonly objects: readonly MapObject[];
  /**
   * Las regiones declaradas del mapa de nodos (fase 2a). Viajan ya, aunque el
   * visor todavía no pinte el territorio (es de la 2b), para que el cable sea
   * la imagen entera del mapa y no haya que volver a abrir esta frontera.
   */
  readonly regions: readonly MapRegion[];
}

interface VistaJugador {
  readonly id: PlayerId;
  readonly faction: FactionId;
  /** Su oro, el único recurso. */
  readonly oro: number;
  readonly defeated: boolean;
  /**
   * Casillas exploradas, por índice `y·W + x` (`Casillas.indices`, #146): la
   * misma moneda que `tramos` y `sueltas`. Eran claves `"x,y"`.
   */
  readonly fog: readonly number[];
}

export interface VistaHeroe {
  readonly id: string;
  readonly owner: PlayerId;
  readonly name: string;
  readonly at: Point;
  readonly movePoints: number;
  /**
   * Su facción y su tipo, los ids: de ellos saca el espectador, con las mismas
   * funciones del núcleo que la partida, el nombre del tipo que enseña
   * (`nombreDeTipoDeHeroe`) y la hoja con que lo pinta (`figuraDelHeroe`).
   * Hasta la vuelta 2 del arranque (19-10-2026) viajaba el nombre ya redactado;
   * con la figura, eran dos cosas derivadas del mismo par.
   */
  readonly faction: FactionId;
  readonly tipo: string;
  /** La historia del héroe nacido de la tropa, o `null` si no tiene. */
  readonly historia: string | null;
  /**
   * Los NOMBRES de lo que lleva puesto, en el orden de los huecos: el espectador
   * solo lo pinta, y así no tiene que buscar el catálogo para una línea.
   */
  readonly equipo: readonly string[];
}

interface VistaPueblo {
  readonly id: string;
  /** De quién es (`dueñoDeLaCiudad`): el de su objeto en el muro, el de su región dentro. */
  readonly owner: PlayerId | null;
  readonly name: string;
  readonly at: Point;
  readonly buildings: readonly string[];
  /**
   * Lo que dice hoy la gente a la que el narrador ha puesto voz, ya resuelto: el
   * espectador no tiene pantalla de base y solo lo lista. Sin narrador va vacío
   * —las frases de respaldo no son noticia y engordarían cada fotograma—.
   */
  readonly voces: readonly VozEnLaBase[];
}

/**
 * Una ciudad o un pueblo como lo ve el espectador: de quién es (derivado:
 * `dueñoDelSitio`, que el espectador no puede preguntar porque no tiene la
 * partida), si está en el muro y quién lo ocupa (`ocupanteDe`). Lo leen su mapa
 * (la bandera y la marca de la ocupación) y sus paneles (tarea 2, 05-11-2026).
 */
interface VistaSitio {
  readonly id: string;
  readonly at: Point;
  readonly owner: PlayerId | null;
  readonly ocupante: Ocupante | null;
}

export interface VozEnLaBase {
  readonly npc: string;
  readonly nombre: string;
  readonly papel: string;
  readonly linea: string;
}

/**
 * Un stack de batalla tal y como viaja: **sin `unit` si sus cifras salen del
 * catálogo**, que el espectador ya tiene —`cifrasDeUnidad(origen.unidad, …)`,
 * con la experiencia que viaja en el origen—, y con `unit` si es el héroe, cuyas
 * cifras no están en ninguna otra parte.
 *
 * Mandar el catálogo por el cable costaba +2 097 B en una batalla de 5 contra 5
 * (+72 % del estado de batalla) en cada fotograma, o sea ~90 KB por partida,
 * para repetir una tabla que las dos puntas ya tienen. `adaptarBatalla`, en el
 * cliente, es la inversa exacta.
 */
export type StackEnCable = Omit<BattleStack, 'unit' | 'ganado' | 'origen'> & {
  readonly unit?: UnitInfo;
  readonly origen: OrigenEnCable;
};

/**
 * Lo que viaja de un veterano: quién es, la experiencia y lo que lleva puesto,
 * que es de donde salen sus cifras y sus galones. **La hoja de servicios
 * —batallas, bajas y héroes derribados— no viaja**: vive en el núcleo porque la
 * usará la tropa que se hace héroe (ciclo B), y el espectador no pinta ninguna
 * de las tres.
 *
 * El equipo sí, y no por pintarlo: sin él, `cifrasDeUnidad` rehace en el
 * espectador las cifras de un veterano con un arma propia SIN ella, y el tablero
 * enseñaría un ataque que no es el que pelea.
 */
export type VeteraniaEnCable = Pick<Veterania, 'id' | 'experiencia' | 'equipo'>;

/**
 * El origen tal y como viaja: el del núcleo **sin el precio** —`oro` lo lee la
 * rendición, que el espectador ni calcula ni pinta— y con la veteranía
 * recortada a `VeteraniaEnCable`. La casilla de la formación (`salida`) viaja
 * tal cual si la trae: es un par de números, y así la vuelta sigue siendo la
 * inversa exacta.
 */
type OrigenEnCable =
  | {
      readonly kind: 'catalogo';
      readonly unidad: string;
      readonly veterania: VeteraniaEnCable | null;
      readonly salida?: Hex;
      /** El cadáver del que se levantó (`levantadoDe`): con él, el espectador no lo pinta. */
      readonly levantadoDe?: string;
    }
  | { readonly kind: 'heroe'; readonly desnudo: UnitInfo };

export interface BatallaEnCable extends Omit<BattleState, 'stacks'> {
  readonly stacks: readonly StackEnCable[];
}

/**
 * La batalla en curso, con **de quién es cada bando**.
 *
 * Los dueños viajan porque el espectador pinta cada bando del color de su
 * jugador, y sin esto tendría que rederivarlo del `foe` — o sea, una tercera
 * copia de `battleOwners`, que ya se escribió dos veces y ya discrepó una.
 *
 * Fuera de `unit`, el `BattleState` viaja tal cual: no lleva ni un `Set` ni un
 * `Map` dentro, así que el viaje por JSON no le quita nada. Comprobado en
 * `test/espectador.test.ts`.
 */
export interface VistaBatalla {
  readonly estado: BatallaEnCable;
  readonly dueños: Readonly<Record<Side, PlayerId | null>>;
  /**
   * La región del clima donde se pelea (`regionDeLaBatalla`), en `map.regions`
   * (−1 en un mapa sin regiones): el espectador saca de ella el clima del
   * tablero con la misma cuenta que la partida (`climaDeLaRegion`), también con
   * lo que fuerce `?clima=`.
   */
  readonly region: number;
}

export interface SpectatorView {
  /**
   * La semilla de la partida. No reproduce la partida —con el mapa del agente no
   * lo hace—, pero es la de la escena del mapa (`componer(mapa, semilla)`): sin
   * ella, el espectador vestía el mismo mapa con otros árboles que quien juega.
   */
  readonly seed: number;
  readonly map: VistaMapa;
  readonly players: readonly VistaJugador[];
  readonly heroes: readonly VistaHeroe[];
  readonly towns: readonly VistaPueblo[];
  /** Cada ciudad y cada pueblo, con su dueño derivado y su ocupante (`VistaSitio`). */
  readonly sitios: readonly VistaSitio[];
  /**
   * Los grupos de asaltantes, con su tropa contada: la figura lleva el cuerpo
   * de su primera criatura y la chapa, cuántos son. La forma es la del núcleo
   * (`VistaAsaltante`), la misma que pinta el lienzo.
   */
  readonly raiders: readonly VistaAsaltante[];
  /**
   * Los últimos hechos, **sin el sello**: es `GameEventDraft` y no `GameEvent`, y
   * el tipo lo dice en vez de dejarlo en una nota. Lo que se quita es `seen`
   * —quién más estaba mirando—, que es contabilidad de casa.
   */
  readonly log: readonly GameEventDraft[];
  /** Lo que va diciendo el director, incluido el `reasoning` del agente. */
  readonly directorLog: readonly string[];
  /** `null` la mayor parte de la partida: casi siempre no hay batalla. */
  readonly battle: VistaBatalla | null;
  /**
   * El clima de hoy de cada región (`climaDeLaPartida`), derivado aquí y no en el
   * espectador: lo pedido por el narrador vive en el estado, y así el espectador
   * ve lo mismo que la partida sin una segunda cuenta. Es JSON plano: viaja tal cual.
   */
  readonly clima: ClimaDeLaPartida;
}

export interface SpectatorSnapshotMsg {
  readonly type: 'snapshot';
  /**
   * Qué partida es: el mismo id que se le presenta al agente (`AgentLink.partida`,
   * #118). Lo necesita el espectador desde que reconecta solo (#104): un servidor
   * que vuelve tras un reinicio trae OTRA partida, y sin esto sus fotogramas se
   * pintaban encima de los de la anterior como si fueran la misma —el día, la
   * crónica y la cola del telón son de la vieja—. Con él, el espectador empieza
   * limpio y lo dice.
   */
  readonly partida: string;
  readonly day: number;
  readonly current: number;
  /**
   * La partida ha terminado, y **también cuando no gana nadie**.
   *
   * Es `state.finished` tal cual más la nota escrita para quien lee. Nació como
   * parche —el núcleo no sabía decir «se agotaron los días» y el espectador se
   * quedaba mirando el último día para siempre— y la forma resultó ser la
   * buena: sobrevive entera. Lo que se murió es el booleano que la sostenía
   * desde fuera.
   */
  readonly finished: { readonly winner: number | null; readonly note: string } | null;
  /**
   * Estado del mapa, los jugadores y la batalla en curso, ya sin `Set` ni `Map`.
   *
   * Decía `unknown`, y eso obligaba a quien lo pintara a reimplementar el
   * esquema del emisor por su cuenta: dos declaraciones de la misma cosa que
   * nadie compara, que es el bug que acaba de morder en `MapPlan` contra
   * `mapPlanSchema`. Ahora es un tipo, `SpectatorView`, y los dos extremos
   * compilan contra él.
   */
  readonly view: SpectatorView;
}

/**
 * Un solo brazo, y por ahora es lo honesto.
 *
 * Aquí vivía un `SpectatorLogMsg` con `readonly lines: string[]` y **cero
 * emisores** (#32). No se emitió nunca porque no tiene sujeto: el snapshot ya
 * lleva `view.log` con los últimos 40 hechos ESTRUCTURADOS y `view.directorLog`
 * con lo que dice el director, así que una lista de cadenas sueltas es
 * estrictamente más pobre que lo que ya viaja. Emitirlo habría sido fabricarle
 * un motivo.
 *
 * Se borra en vez de dejarlo declarado: un tipo con cero emisores lo lee alguien
 * dentro de seis meses, se cree que funciona, y escribe el cliente que lo espera.
 */
export type ServerToSpectatorMsg = SpectatorSnapshotMsg;
