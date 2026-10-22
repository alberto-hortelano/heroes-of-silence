import { rangoDeTropa } from '../hero/experiencia.js';
import type { Hex, PoderId, UnitInfo, Veterania } from '../types.js';
import type { Paso } from './board.js';
import type { CuandoVence, EffectKind, StackEffect } from './effects.js';
import type { EstadoDePuerta, MurallaDeBatalla, PuertaDeMuralla } from './muralla.js';
import type { Punto, TipoDeGolpe, TiposDeLaRueda } from './rueda.js';

export type Side = 'attacker' | 'defender';

/**
 * Los dos bandos, para recorrerlos.
 *
 * Estaba escrito a mano en tres sitios —el motor, el director y la consulta de
 * batalla—, que es una lista de dos elementos hasta el día que alguien añada un
 * tercer bando y solo actualice dos.
 */
export const SIDES: readonly Side[] = ['attacker', 'defender'];

/** El bando de enfrente. Estaba escrito a mano en cuatro sitios. */
export function otroBando(side: Side): Side {
  return side === 'attacker' ? 'defender' : 'attacker';
}

/**
 * De dónde sale un stack del tablero, y por tanto sus cifras y lo que pasa con
 * él al acabar: una criatura del catálogo, un personaje de
 * `GameState.characters` o el héroe del bando.
 *
 * Es un discriminante y no dos campos opcionales (`member?`, `commander?`) más
 * una pregunta por la referencia del catálogo, porque así quien reparte por el
 * origen escribe un `switch` exhaustivo: el día que llegue un cuarto origen, el
 * que se lo deje no compila. Con los opcionales, un stack sin ninguno de los dos
 * era «del catálogo» por descarte, y eso es lo que un origen nuevo habría
 * heredado en silencio.
 */
export type OrigenDelStack =
  | {
      readonly kind: 'catalogo';
      /**
       * La unidad del catálogo que es (`data/unidades.json`): de ella salen sus
       * cifras, su cuerpo sin equipo (`cuerpoDe`) y lo que dicen de ella el
       * resumen, el agente y la vuelta al ejército. `body` es solo su arte.
       */
      readonly unidad: string;
      /**
       * El oro de catálogo de UN individuo: lo que vale para la rendición. Va
       * aquí porque `unit` ya no es siempre la referencia del catálogo —la de
       * un veterano es una copia con sus cifras— y era la referencia la que
       * traía el precio.
       */
      readonly oro: number;
      /** La hoja con la que ENTRÓ, o `null` si es un novato. La de salida la escribe `settleBattle`. */
      readonly veterania: Veterania | null;
    }
  | { readonly kind: 'personaje'; readonly id: string; readonly veterania: Veterania | null }
  | {
      readonly kind: 'heroe';
      /**
       * Su cuerpo sin el equipo (`cuerpoDelHeroe`): el héroe no está en ningún
       * catálogo, y es de donde `cuerpoDe` saca lo que le suma lo que lleva.
       */
      readonly desnudo: UnitInfo;
    };

/** Lo que un stack ha ganado en esta batalla: lo apunta `herir`, lo cobra `settleBattle`. */
export interface Ganado {
  /** `PV quitados × índice de poder del que los recibe`, sumado golpe a golpe. */
  experiencia: number;
  /** Individuos enemigos que ha matado. */
  bajas: number;
  /** Los nombres de los héroes rivales que ha derribado. */
  heroes: string[];
}

/**
 * El personaje de `GameState.characters` que es este stack, o `null`. Con un
 * `switch` que devuelve: un origen nuevo no compila hasta que se decida si es
 * un personaje.
 */
export function personajeDe(origen: OrigenDelStack): string | null {
  switch (origen.kind) {
    case 'personaje':
      return origen.id;
    case 'catalogo':
    case 'heroe':
      return null;
  }
}

/**
 * Qué es el héroe para quien cuenta una batalla —la crónica (`resumenDeBatalla`),
 * el agente (`creature` de su stack, el `target` de un hechizo)— y su figura
 * genérica: la de la arena cuando no se elige ninguna (`FIGURA_GENERICA`), el
 * Y Bot de espada y escudo (`render/personajes.ts`).
 *
 * Como `CHARACTER_BODY`, no está en el catálogo a propósito: un lector que lo
 * buscara con `creature()` lanza en vez de leer cifras prestadas. Las cifras
 * del héroe salen de `heroUnit`. **No es su arte en el juego**: desde el
 * 19-10-2026 (vuelta 2 del arranque) el héroe de la partida pisa el tablero y el
 * mapa con la hoja de su tipo (`figuraDelHeroe`), y por eso `queEs` no lo saca
 * de `body`: con la figura, la crónica habría contado «heroe-lich» donde contaba
 * «hero».
 *
 * Vive aquí y no en `hero/hero.ts`, donde estaba, porque lo lee `queEs`: desde
 * aquí, importarlo de allí cerraba un ciclo (`hero` → `troop` → `catalogo` → …).
 */
export const HERO_BODY = 'hero';

/**
 * Qué es un stack para quien lo cuenta —la crónica (`resumenDeBatalla`) y el
 * agente—: la unidad del catálogo que es; el héroe, `HERO_BODY`, sea cual sea su
 * figura, y el personaje, por su cuerpo (`CHARACTER_BODY`).
 */
export function queEs(s: Pick<BattleStack, 'origen' | 'body'>): string {
  switch (s.origen.kind) {
    case 'catalogo':
      return s.origen.unidad;
    case 'heroe':
      return HERO_BODY;
    case 'personaje':
      return s.body;
  }
}

/**
 * El rango con el que entró este stack: 1 para un novato, un monstruo y el
 * héroe —que no es tropa: su rango va en sus cifras—. Con un `switch` que
 * devuelve, como `personajeDe`.
 *
 * Tiene tres lectores —los galones de la figura, la fila de «En el campo» y el
 * `veteranRank` del agente— y los tres preguntan lo mismo: el rango, no la
 * hoja. Antes cada uno sacaba la hoja y la convertía por su cuenta.
 */
export function rangoDeVeterania(origen: OrigenDelStack): number {
  switch (origen.kind) {
    case 'catalogo':
    case 'personaje':
      return rangoDeTropa(origen.veterania);
    case 'heroe':
      return 1;
  }
}

/** Un stack dentro de una batalla. Mutable: el motor lo modifica en sitio. */
export interface BattleStack {
  readonly id: string;
  readonly side: Side;
  /** Puesto de origen en el ejército (su índice), para desempatar la iniciativa. */
  readonly slot: number;
  /**
   * El id del ARTE: qué sprite se pinta y qué id viaja al agente. No es de
   * donde salen las cifras —eso es `unit`—, y por eso dejó de llamarse
   * `creature`: el nombre invitaba a volver al catálogo con él, y para un
   * personaje eso es el centinela `CHARACTER_BODY`, que el catálogo no tiene.
   */
  readonly body: string;
  /**
   * Las cifras de combate, resueltas UNA vez en `createBattle`. Es la única
   * fuente: para una criatura es la misma referencia del catálogo, para un
   * personaje las de su perfil. Ninguna lectura de batalla vuelve a
   * `creature(...)`, y lo vigila `test/invariantes.test.ts`.
   *
   * La arena cambia las cifras de un tipo a media pelea (`retocarEnBatalla`)
   * sustituyendo el stack entero en `BattleState.stacks`, no escribiendo aquí.
   */
  readonly unit: UnitInfo;
  /**
   * Criatura, personaje o héroe. El héroe (fase 1b) es uno por bando con héroe
   * y ninguno en un monstruo o una guarnición; si cae, su bando pierde aunque
   * le quede tropa (`checkFinished`).
   */
  readonly origen: OrigenDelStack;
  /**
   * Efectivos con los que ENTRÓ al tablero.
   *
   * Se escribe una vez y no se toca: es el minuendo de las bajas, que es lo
   * único que las cuenta. `count` solo baja —ningún hechizo resucita: `heal`
   * repone `topHp` y nada más (`spells.ts`)—, así que `initialCount - count`
   * son los muertos exactos. El día que exista resurrección, esa resta pasa a
   * ser un máximo y hará falta el `std::min` que el original ya escribe.
   */
  readonly initialCount: number;
  /** Efectivos vivos. 0 = destruido. */
  count: number;
  /** HP restante del efectivo de arriba; el resto están intactos. */
  topHp: number;
  /** La casilla que ocupa: toda unidad, una (13-10-2026). */
  hex: Hex;
  /**
   * Lleva una escalera para subir a la muralla (`poner_escalera`). Llega con
   * el personaje (`BattleMember.escalera`, solo en la arena) si la puede usar, y
   * se le quita al ponerla: la escalera se queda contra el muro, para quien llegue.
   */
  escalera: boolean;
  /** Ya contraatacó en esta ronda. */
  retaliated: boolean;
  defending: boolean;
  /** Pasó el turno con "esperar" y actuará al final de la ronda. */
  waited: boolean;
  /** Ya consumió su turno en esta ronda. */
  acted: boolean;
  /** Ya recibió un turno extra por moral alta en esta ronda. */
  gotMoraleBonus: boolean;
  /** Moral (héroe, diversidad de facción, edificios), ya recortada a [−3,+3]
   * al montar la batalla: quien la lee para tirar el dado no tiene que volver
   * a recortarla. Hoy nada la altera temporalmente; si algo lo hiciera, iría
   * en `effects` y se sumaría al leer, como la suerte — nunca escribiendo
   * aquí, que es el bug que cerró #9. */
  morale: number;
  /** Suerte BASE. Los hechizos y los rasgos no la tocan: lo suyo va en
   * `effects` y se suma al leer con `effectiveLuck`. */
  luck: number;
  /** Lo temporal: prisa, lentitud, maldición, miedo. Caduca en `beginRound`. */
  effects: StackEffect[];
  ganado: Ganado;
  /**
   * La herida que las cifras de ahora no dejan restar, en PV: solo la arena, al
   * retocar a media pelea (`retocarEnBatalla`). Bajar la vida por debajo de la
   * herida deja el stack a 1 PV; lo que no cupo se apunta aquí para que volver a
   * subirla no lo devuelva (N3 de QA). Sin él, nada que deber. Sin munición
   * (13-10-2026) no hay tiros que deber, y por eso es un número, como
   * `BattleHero.manaGastadoDeMas`.
   */
  readonly gastadoDeMas?: number;
}

/**
 * El héroe que dirige un bando: su magia y si puede rendirse.
 *
 * Su cuerpo no va aquí: pisa el tablero como un stack más (`origen: heroe`), y
 * sus cifras viven en ese stack, que es donde las lee el motor. Desde la fase 1b
 * el héroe **no bonifica a su tropa** (decisión del usuario: «solo su cuerpo»):
 * lo que tenía de ataque y defensa es de su cuerpo (`heroUnit`), y por eso
 * `effectiveAttack`, `effectiveDefense` y el daño dejaron de recibirlo. Las
 * bonificaciones volverán como habilidades de cada tipo de héroe. Este es el
 * único sitio que lo cuenta.
 */
export interface BattleHero {
  readonly name: string;
  /**
   * Si puede rendirse, con cuánto oro cuenta para pagarlo; o por qué no puede.
   *
   * Lo monta quien conoce el mapa (`battleSideForHero`): el motor no sabe de
   * bases ni de monederos, y no tiene por qué. El oro no puede cambiar en plena
   * batalla —con una pendiente no se acepta ninguna acción de aventura—, así
   * que copiarlo al entrar no se queda viejo.
   */
  readonly retreat: { readonly purse: number } | { readonly blocked: string };
  readonly spellPower: number;
  readonly knowledge: number;
  mana: number;
  /** Ya lanzó su hechizo de esta ronda. */
  castThisRound: boolean;
  readonly spells: readonly string[];
  /** El maná gastado que el Conocimiento de ahora no deja restar (`BattleStack.gastadoDeMas`). */
  readonly manaGastadoDeMas?: number;
}

export type BattleEvent =
  | { kind: 'round_start'; round: number }
  /**
   * `path`: las casillas que pisa, sin la de salida y con `to`. El tablero anda
   * por ahí: con solo `to`, la figura iba en línea recta y se la veía cruzar por
   * encima de unidades que el camino real rodea (1 de cada 9 movimientos). Un
   * volador lleva solo `[to]`: va por el aire, en recta.
   *
   * `charge`: el tramo es la carrera de una carga (el golpe que lo cierra la
   * cobra). Lo escribe el núcleo, que la mide antes de andar (`cargaDesde`): con
   * la rueda, entre la carrera y el golpe va el `cruce`, y el animador ya no
   * puede deducirla mirando el paso de al lado.
   */
  | { kind: 'move'; stack: string; to: Hex; path: readonly Hex[]; charge?: true }
  /**
   * La rueda del golpe (`rueda.ts`): lo que eligieron quien pega y
   * quien recibe y dónde cae el golpe. Va DESPUÉS del `move` del golpe y justo
   * antes de su `attack`: primero se anda, luego se elige, luego se golpea
   * (decisión del usuario, 13-10-2026). El contraataque, si lo hubo, lleva su
   * punto en su `attack` (`contraataqueDelCruce`).
   */
  | {
      kind: 'cruce';
      stack: string;
      target: string;
      golpe: TipoDeGolpe;
      respuesta: TipoDeGolpe;
      punto: Punto;
    }
  | {
      kind: 'attack';
      stack: string;
      target: string;
      damage: number;
      killed: number;
      retaliation: boolean;
      /** Las casillas de carga que cobró; con qué cifras, las de quien pegó (`cifrasDeCarga`). */
      charge?: number;
      /** El punto del cruce de la rueda en que cayó: todo golpe cuerpo a cuerpo lo lleva. */
      punto?: Punto;
      /**
       * Lo que paró la armadura del objetivo (la arena, #262; `trasLaArmadura`):
       * `damage` ya va restado. Sin el campo, nada: el juego no lo escribe. Se
       * llama como en `Herida`, `TrasLaArmadura` y el lienzo: un nombre de punta a
       * punta.
       */
      parado?: number;
    }
  | {
      kind: 'shoot';
      stack: string;
      target: string;
      damage: number;
      killed: number;
      /** Lo que paró la armadura del objetivo, como en `attack`. */
      parado?: number;
      splash?: boolean;
    }
  | { kind: 'wait'; stack: string }
  | { kind: 'defend'; stack: string }
  | {
      kind: 'cast';
      side: Side;
      spell: string;
      target?: string;
      damage?: number;
      killed?: number;
      /** Lo que paró la armadura del objetivo, como en `attack`. */
      parado?: number;
    }
  /**
   * Una unidad usa un poder sobre `target` (`poderes.ts`). `cura`,
   * los PV que repuso, si cura; lo que deja un poder de efecto va detrás, en su
   * propio `effect`, como el del hechizo.
   */
  | { kind: 'power'; stack: string; poder: PoderId; target: string; cura?: number }
  /**
   * La arena cambió a media pelea las cifras de `nombre` —un tipo entero o el
   * héroe de un lado— en estos `stacks` (`retocarEnBatalla`). No es una jugada:
   * ni gasta turno ni lo mueve; queda en el registro para que el parte lo cuente
   * y para que quien guarda por el registro se entere. `cambios`, qué campo de la
   * ficha cambió, ya en palabras («ataque 3 → 10», «hechizos: − Prisa»;
   * `cambiosDeLaFicha`, `arena.ts`). Nunca vacío: un retoque que deja la ficha
   * como estaba no escribe ninguno.
   */
  | { kind: 'retoque'; nombre: string; stacks: readonly string[]; cambios: readonly string[] }
  | { kind: 'morale'; stack: string; good: boolean }
  | { kind: 'luck'; stack: string; good: boolean }
  | {
      kind: 'effect';
      stack: string;
      effect: EffectKind;
      amount: number;
      source: string;
      rounds: number;
      /**
       * Dura hasta que empiece o termine el próximo turno del afectado (la rueda),
       * con `rounds` de tope.
       */
      vence?: CuandoVence;
    }
  | { kind: 'effect_end'; stack: string; source: string }
  | { kind: 'immune'; stack: string; source: string }
  | { kind: 'perished'; stack: string }
  /** Un atacante apoya su escalera en `muro` desde `pie`: se queda puesta. */
  | { kind: 'ladder_placed'; stack: string; pie: Hex; muro: Hex }
  /** Un atacante sube de `from` (el pie) al muro `to`, por escalera o escalando. */
  | { kind: 'climbed'; stack: string; from: Hex; to: Hex }
  /** Quien defiende abre la puerta `puerta`, al principio del turno de `stack`. */
  | { kind: 'gate_opened'; stack: string; puerta: PuertaDeMuralla }
  /** Quien defiende cierra la puerta `puerta`, al principio del turno de `stack`. */
  | { kind: 'gate_closed'; stack: string; puerta: PuertaDeMuralla }
  /** Un bando se rinde: pierde, y lo que paga está en `finished.surrender`. */
  | { kind: 'surrender'; side: Side }
  | { kind: 'finished'; winner: Side };

/**
 * Cómo terminó una batalla. `surrender` está cuando la cerró una rendición, con
 * el oro que costó: **el precio se calcula una vez, al rendirse, y se lee de
 * aquí** —quien lo cobra en el mapa no vuelve a calcularlo—, así que el que se
 * anunció y el que se cobra no pueden ser dos. Quién se rindió no se guarda:
 * es siempre el que pierde.
 */
export interface BattleFinish {
  readonly winner: Side;
  readonly surrender?: { readonly gold: number };
}

/**
 * El turno de la unidad que está actuando: cuál es, quién lo juega y cuántas
 * casillas lleva gastadas en él.
 *
 * `gastado` vive aquí, dentro de un objeto que solo crea `abrirTurno` —uno nuevo
 * en cada activación—, y no como un campo del stack, que es lo que avisaba el
 * comentario de los recorridos de la carga: un `hexesMoved` en el stack había
 * que resetearlo en `beginRound` y en `endTurn`, y el día que se olvidara uno
 * la unidad empezaría su turno con el presupuesto de otro. Aquí no hay nada que
 * resetear: el turno siguiente es otro objeto. La moral extra y `wait` vuelven a
 * pasar por `abrirTurno`, así que también estrenan turno con 0.
 */
export interface TurnoDeUnidad {
  /**
   * El ordinal del turno en la batalla: 1, 2, 3… Lo pone `abrirTurno` y nadie más.
   * Es lo que responde «¿sigue siendo el MISMO turno?» (`mismoTurno`), y la
   * respuesta no se puede sacar de quién actúa: la moral extra le abre a la
   * misma unidad un turno nuevo, y los cuatro sitios que lo deducían cada uno a
   * su manera —por identidad del objeto, por lo gastado que crece, por la nota—
   * se dejaron engañar por ella dos veces. Y no se puede sacar de la identidad
   * del objeto en cuanto el estado cruza un `structuredClone` o el cable.
   */
  readonly n: number;
  readonly stack: string;
  /** Casillas recorridas en este turno: cada `move` suma lo que cuesta su camino. */
  gastado: number;
  /**
   * Tras golpear con Finta (la rueda del golpe): las casillas que
   * resta de lo que le queda por andar (`casillasQueQuitaLaFinta`). Puesto, el
   * resto del turno es un tramo **solo de andar** (`faseDelTurno`, `faseBlocker`): andar o
   * terminar. Lo pone solo `melee` (lo vigila `test/invariantes.test.ts`), y no
   * hay que quitarlo: el turno siguiente es otro objeto.
   */
  finta?: number;
}

/**
 * Una ficha de la arena en palabras: cada campo, su valor como se lee en la
 * ficha («3», «1-5», «Monje»), y las listas (rasgos, habilidades, hechizos) por
 * sus nombres, para decir lo que entra y lo que sale.
 */
export type FichaEnPalabras = Readonly<Record<string, string | readonly string[]>>;

/** El golpe plantado que espera la rueda (`BattleState.golpeEnCurso`). */
export interface GolpeEnCurso {
  readonly stack: string;
  readonly target: string;
  /** Las casillas de la recta de carga con que llegó (`cargaDesde`); 0 si no carga. */
  readonly carga: number;
  /**
   * La carrera que anduvo por la recta para cobrar la carga cuando salir del
   * contacto cuesta (`CargaMedida.carrera`); `null` si anduvo el camino del
   * recorrido.
   */
  readonly carrera: Paso | null;
  /**
   * Lo que costaba el camino más barato hasta donde llegó: si se suelta el golpe
   * (`soltarElGolpe`), sin carga, lo gastado vuelve a esto.
   */
  readonly barato: number;
}

export interface BattleState {
  round: number;
  stacks: BattleStack[];
  /**
   * Ids pendientes de actuar en esta ronda, en el orden en que les tocará si
   * nada cambia: primero los que aún no han tenido turno —cada bando por su
   * velocidad y su puesto, intercalados por `GetCurrentUnit`— y detrás, por
   * orden de llegada, los que esperaron. `advance` reordena los primeros antes
   * de sacar a cada uno, porque el desempate depende de quién actuó el último.
   */
  queue: string[];
  /**
   * La velocidad con la que cada stack entró en la cola de esta ronda. El
   * orden se fija al empezar la ronda: una Prisa lanzada a media ronda vale
   * para moverse, no para adelantarse en la cola.
   */
  iniciativa: Record<string, number>;
  /**
   * El bando del último stack que de verdad tuvo turno —el que la moral baja
   * deja paralizado no cuenta—, de una ronda a la siguiente. Es el
   * `_lastActiveUnitArmyColor` de fheroes2: en un empate de velocidad mueve el
   * otro bando. `null` antes del primer turno, y entonces mueve el atacante.
   */
  ultimoBando: Side | null;
  /** El turno abierto, o `null` si no actúa nadie (batalla terminada o sin montar). */
  turno: TurnoDeUnidad | null;
  heroes: Record<Side, BattleHero | null>;
  /**
   * Muros y puertas del tablero (`muralla.ts`). No cambia en toda la batalla; en
   * las del mapa, hoy, `SIN_MURALLA`. Solo la arena la pone.
   */
  readonly muralla: MurallaDeBatalla;
  /**
   * De cuántos tipos es la rueda del golpe de esta batalla (`RUEDAS`,
   * `formas-de-la-rueda.ts`): la de la partida o la del montaje de la arena. No
   * cambia en toda la batalla y viaja tal cual al espectador, que pinta con ella.
   */
  readonly rueda: TiposDeLaRueda;
  /**
   * El golpe de quien se ha plantado ante su objetivo y espera la
   * rueda: quién, contra quién y la carga de la carrera con que llegó (medida
   * antes de andar; al pegar ya no se puede medir). Lo pone el `attack` sin
   * elecciones («plantarse», `applyAction`), lo quita el golpe o `soltarElGolpe`.
   * Mientras está puesto, la única jugada que vale es ese golpe con sus dos
   * elecciones (`golpeEnCursoBlocker`). Lo elegido no va aquí: va a ciegas en
   * quien lo guarda (la sesión). Siempre `null` si nadie se ha plantado: la IA
   * y el agente golpean de una vez, con las dos elecciones (`completarCruce`).
   */
  golpeEnCurso: GolpeEnCurso | null;
  /**
   * La ficha de cada tipo y de cada héroe tal como pelea ahora, dicha en
   * palabras campo a campo (`fichaEnPalabras`, `arena.ts`): lo que escribe la
   * persona, no las cifras del cuerpo. Solo la arena la pone al montar y la pone
   * al día al retocar: el parte del retoque dice qué campo cambió comparando la
   * de antes con la nueva (N1 y N2 de QA), y un retoque que no cambia nada no
   * escribe nada. La clave, `claveDeFicha`.
   */
  readonly fichasDeArena?: Record<string, FichaEnPalabras>;
  /**
   * Las escaleras apoyadas en la muralla, con su pie y su muro. Crece con cada
   * `poner_escalera` y no se quita: va fuera de `muralla`, que no cambia en toda
   * la batalla y se guarda en cachés por objeto.
   */
  escaleras: { readonly pie: Hex; readonly muro: Hex }[];
  /**
   * Cada puerta de la muralla, abierta o cerrada, en el orden de
   * `muralla.puertas`. Empiezan cerradas; las abre y las cierra quien defiende
   * (`abrir_puerta`, `cerrar_puerta`). Fuera de `muralla` por lo mismo que las
   * escaleras. Sin muralla, vacía.
   */
  puertas: EstadoDePuerta[];
  log: BattleEvent[];
  finished: BattleFinish | null;
}

export type BattleAction =
  /**
   * Gasta casillas del turno sin cerrarlo: la unidad puede moverse otra vez o
   * atacar. Se cierra solo si ya no le queda nada que hacer (`quedaAlgoQueHacer`).
   */
  | { type: 'move'; to: Hex }
  /**
   * Mueve (si hace falta) hasta `from` y golpea a `target`. `golpe` y `respuesta`
   * son lo que eligieron en la rueda quien pega y quien recibe, obligatorios para
   * dar el golpe; sin ninguno de los dos, quien pega se planta (`cruceBlocker`,
   * `golpeEnCurso`). El agente manda el suyo como `hit` y su respuesta con
   * `battle_response` (`contract/vocabulario.ts`); lo que nadie elige, la IA a ciegas
   * (`completarCruce`).
   */
  | { type: 'attack'; target: string; from?: Hex; golpe?: TipoDeGolpe; respuesta?: TipoDeGolpe }
  | { type: 'shoot'; target: string }
  | { type: 'wait' }
  | { type: 'defend' }
  | { type: 'cast'; spell: string; target?: string }
  /**
   * La unidad activa usa uno de sus poderes (`UnitInfo.poderes`) sobre el aliado
   * `target`, sin haberse movido: es el turno entero (`poderBlocker`). La tienen
   * las unidades con una habilidad que da poder (`unidadDeCombate`), en la arena y
   * en la partida; el agente la escribe `power` (`accionDeBatallaDelAgente`).
   */
  | { type: 'power'; poder: PoderId; target: string }
  /**
   * El bando de la unidad activa se rinde (`surrenderBlocker` dice si puede).
   * `gold` es el precio: `legalActions` lo trae puesto, para que quien decide
   * sepa lo que paga ANTES de pagarlo. Quien la manda puede omitirlo; si lo
   * pone, tiene que ser el precio de ahora — un precio viejo se rechaza en vez
   * de cobrar otro sin decirlo.
   */
  | { type: 'surrender'; gold?: number }
  /** Cierra el turno de la unidad activa sin hacer nada más (tras moverse, por ejemplo). */
  | { type: 'end_turn' }
  /**
   * El atacante apoya su escalera en `muro`, al pie del que está, sin haberse
   * movido: es el turno entero (`escaleraBlocker`).
   */
  | { type: 'poner_escalera'; muro: Hex }
  /**
   * El atacante sube a `muro` por la escalera de su pie o escalando, sin haberse
   * movido: arriba se queda y el turno se cierra (`subirBlocker`).
   */
  | { type: 'subir'; muro: Hex }
  /**
   * Quien defiende abre (o cierra) la puerta `puerta` al principio del turno
   * de una unidad suya, antes de moverse: no gasta el turno, como `cast`
   * (`puertaBlocker`).
   */
  | { type: 'abrir_puerta'; puerta: PuertaDeMuralla }
  | { type: 'cerrar_puerta'; puerta: PuertaDeMuralla };

/** Las dos jugadas de la puerta, que eligen una puerta (`puertaBlocker`). */
export type TipoDePuerta = Extract<BattleAction, { puerta: PuertaDeMuralla }>['type'];

/** Las dos jugadas de la escala, que eligen un muro (`escalaDesde`). */
export type TipoDeEscala = Extract<BattleAction, { muro: Hex }>['type'];
