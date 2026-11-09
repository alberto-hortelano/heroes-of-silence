import { rangoDeTropa } from '../hero/rango.js';
import type {
  Afecta,
  AQuien,
  CifraDeHechizo,
  CuandoSalta,
  DisiparDe,
  Duracion,
  Hechizo,
  Impedible,
  SeAcabaSiMuere,
} from '../magia/formato.js';
import type { Hex, PoderId, Stack, TipoDeGolpe, UnitInfo, Veterania } from '../types.js';
import type { Punto } from './cifras-de-la-rueda.js';
import type { TiposDeLaRueda } from './formas-de-la-rueda.js';

export type Side = 'attacker' | 'defender';

/**
 * Los dos bandos, para recorrerlos.
 *
 * Estaba escrito a mano en tres sitios —el motor, el director y la consulta de
 * batalla—, que es una lista de dos elementos hasta el día que alguien añada un
 * tercer bando y solo actualice dos.
 */
export const SIDES: readonly Side[] = ['attacker', 'defender'];

/**
 * Tope de rondas: una batalla que no converge se cierra, no se cuelga. Aquí y no
 * en `battle.ts` para que lo lea también lo que dura «toda la pelea» de un hechizo
 * (`spells.ts`) sin un ciclo de importación; `battle.ts` lo reexporta.
 */
export const MAX_ROUNDS = 100;

/** El bando de enfrente. Estaba escrito a mano en cuatro sitios. */
export function otroBando(side: Side): Side {
  return side === 'attacker' ? 'defender' : 'attacker';
}

/**
 * De dónde sale un stack del tablero, y por tanto sus cifras y lo que pasa con
 * él al acabar: una criatura del catálogo o el héroe del bando.
 *
 * Es un discriminante y no un campo opcional (`commander?`) más una pregunta por
 * la referencia del catálogo, porque así quien reparte por el origen escribe un
 * `switch` exhaustivo: el día que llegue otro origen, el que se lo deje no
 * compila. Con el opcional, un stack sin él era «del catálogo» por descarte, y
 * eso es lo que un origen nuevo habría heredado en silencio.
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
      /**
       * Su casilla en la formación de quien lo lleva (`Troop.salida`), si la
       * trae: viaja como la veteranía y `settleBattle` se la devuelve al volver.
       */
      readonly salida?: Hex;
      /**
       * El id del cadáver del que se levantó a media pelea (`levantar`, 08-11-2026,
       * «Levantar zombi»), si no entró al montarla. **El único sitio del hecho**:
       * que ese cadáver está gastado se deriva de aquí (`cadaverGastado`), sin
       * marcarlo en él. Viaja al espectador, que deja de pintar el cadáver.
       */
      readonly levantadoDe?: string;
    }
  | {
      readonly kind: 'heroe';
      /**
       * Su cuerpo sin el equipo (`cuerpoDelHeroe`): el héroe no está en ningún
       * catálogo, y es de donde `cuerpoDe` saca lo que le suma lo que lleva.
       */
      readonly desnudo: UnitInfo;
    };

/** Lo que un stack ha ganado en esta batalla: lo apunta `herir`, lo cobra `settleBattle`. */
interface Ganado {
  /** `PV quitados × índice de poder del que los recibe`, sumado golpe a golpe. */
  experiencia: number;
  /** Individuos enemigos que ha matado. */
  bajas: number;
  /** Los nombres de los héroes rivales que ha derribado. */
  heroes: string[];
}

/**
 * Qué es el héroe para quien cuenta una batalla —la crónica (`resumenDeBatalla`),
 * el agente (`creature` de su stack, el `target` de un hechizo)— y su figura
 * genérica: la de la arena cuando no se elige ninguna (`FIGURA_GENERICA`), el
 * Y Bot de espada y escudo (`render/figuras/personajes.ts`).
 *
 * No está en el catálogo a propósito: un lector que lo buscara en él
 * (`unidadDelJuego`) lanza en vez de leer cifras prestadas. Las cifras del héroe salen de
 * `heroUnit`. **No es su arte en el juego**: desde el
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
 * agente—: la unidad del catálogo que es, y el héroe, `HERO_BODY`, sea cual sea
 * su figura.
 */
export function queEs(s: Pick<BattleStack, 'origen'>): string {
  switch (s.origen.kind) {
    case 'catalogo':
      return s.origen.unidad;
    case 'heroe':
      return HERO_BODY;
  }
}

/**
 * El rango con el que entró este stack: 1 para un novato, un monstruo y el
 * héroe —que no es tropa: su rango va en sus cifras—. Con un `switch` que
 * devuelve: un origen nuevo no compila hasta que se decida su rango.
 *
 * Tiene tres lectores —los galones de la figura, la fila de «En el campo» y el
 * `veteranRank` del agente— y los tres preguntan lo mismo: el rango, no la
 * hoja. Antes cada uno sacaba la hoja y la convertía por su cuenta.
 */
export function rangoDeVeterania(origen: OrigenDelStack): number {
  switch (origen.kind) {
    case 'catalogo':
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
   * `creature`: el nombre invitaba a volver al catálogo con él, y la hoja no es
   * la unidad (qué unidad es lo dice `origen`).
   */
  readonly body: string;
  /**
   * Las cifras de combate, resueltas UNA vez en `createBattle`. Es la única
   * fuente: para una criatura novata es la misma referencia del catálogo, para
   * el héroe las de su cuerpo. Ninguna lectura de batalla vuelve a
   * `creature(...)`, y lo vigila `test/invariantes-batalla.test.ts`.
   *
   * La arena cambia las cifras de un tipo a media pelea (`retocarEnBatalla`)
   * sustituyendo el stack entero en `BattleState.stacks`, no escribiendo aquí.
   */
  readonly unit: UnitInfo;
  /**
   * Criatura o héroe. El héroe (fase 1b) es uno por bando con héroe
   * y ninguno en un monstruo o una guarnición; si cae, su bando pierde aunque
   * le quede tropa (`checkFinished`).
   */
  readonly origen: OrigenDelStack;
  /**
   * Efectivos con los que ENTRÓ al tablero.
   *
   * Se escribe una vez y no se toca: es el minuendo de las bajas, que es lo
   * único que las cuenta. `count` solo baja —la cura repone `topHp` y nada más
   * (`spells.ts`), y nadie resucita—, así que `initialCount - count` son los
   * muertos exactos. Levantar un cadáver (08-11-2026) no lo cambia: no devuelve
   * la vida al stack caído, crea otro con su `initialCount` de 1 (`levantar`,
   * `battle.ts`), que si cae cuenta como un muerto más. El día que exista
   * resurrección, esa resta pasa a ser un máximo y hará falta el `std::min` que el
   * original ya escribe.
   */
  readonly initialCount: number;
  /** Efectivos vivos. 0 = destruido. */
  count: number;
  /** HP restante del efectivo de arriba; el resto están intactos. */
  topHp: number;
  /** La casilla que ocupa: toda unidad, una (13-10-2026). */
  hex: Hex;
  /**
   * Lleva una escalera para subir a la muralla (`poner_escalera`). Llega con su
   * stack (`StackDeBatalla.escalera`: la del puesto en la arena, o la de todo el bando
   * atacante contra una muralla del mapa, `alAsalto`) si la puede usar, y se le
   * quita al ponerla: la escalera se queda contra el muro, para quien llegue.
   */
  escalera: boolean;
  /** Ya contraatacó en esta ronda. */
  retaliated: boolean;
  /** Ya consumió su turno en esta ronda. */
  acted: boolean;
  /** Moral (héroe, diversidad de facción, edificios), ya recortada a [−3,+3]
   * al montar la batalla. **Sin efecto en la batalla** (26-10-2026, decisión del
   * usuario: «La moral solo debe servir para la huida, nunca dar un turno
   * extra»): se enseña en la ficha y espera a la huida, que aún no existe. Hoy
   * nada la altera temporalmente; si algo lo hiciera, iría
   * en `effects` y se sumaría al leer — nunca escribiendo aquí, que es el bug
   * que cerró #9. Sin suerte desde el 02-11-2026 (decisión del usuario). */
  morale: number;
  /** Lo temporal: prisa, lentitud, miedo, la rueda. Caduca en `beginRound`. */
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
  /**
   * La casilla a la que apuntó en su último turno (`aim`, el disparo diferido,
   * 25-10-2026, regla nuestra sin validar por el usuario), o `null`. El disparo
   * sale al empezar su siguiente turno (`dispararLoApuntado`) y se borra; si muere
   * antes o la batalla acaba, se pierde. Viaja al espectador con el stack.
   */
  apuntado: Hex | null;
  /**
   * Los turnos que le faltan para volver a apuntar con su arma de fuego (02-11-2026,
   * `recargaDe`): lo pone el disparo, contando el turno en que sale, y lo baja el
   * cierre de cada turno suyo (`endTurn`). 0, puede apuntar. Lo escribe solo
   * `battle.ts` (lo vigila `invariantes-batalla.test.ts`); viaja al espectador.
   */
  recargando: number;
  /**
   * La casilla a la que lanzó una granada en su último turno (`throw`), o `null`:
   * explota al empezar su siguiente turno (`explotarLaGranada`) y se borra; si muere
   * antes o la batalla acaba, no explota. Lo escribe solo `battle.ts`.
   */
  granada: Hex | null;
  /**
   * Las granadas lanzadas en esta batalla: lo que le queda se deriva de lo que lleva
   * su pieza (`granadasQueQuedan`), así que un retoque de la arena a media pelea no
   * descuadra la cuenta. Lo escribe solo `battle.ts`.
   */
  granadasLanzadas: number;
  /**
   * El hechizo diferido que lanzó (06-11-2026, el editor de magia: `entrega.diferido`),
   * o `null`: sale al empezar su siguiente turno (`alEmpezarSuTurno`) y se borra; si
   * cae antes o la batalla acaba, se pierde. Lo escribe solo `battle.ts`.
   */
  hechizoEnElAire: HechizoEnElAire | null;
}

/**
 * Una unidad del catálogo que se puede levantar de un cadáver, ya resuelta por la
 * misma puerta que quien entra al montar (`resolveUnit`): su hoja, sus cifras de
 * novato y su origen (con su oro), al que `levantar` añade `levantadoDe`.
 */
export interface Levantable {
  readonly body: string;
  readonly unit: UnitInfo;
  readonly origen: Extract<OrigenDelStack, { readonly kind: 'catalogo' }>;
}

/** Un hechizo diferido en el aire: cuál, dónde caerá y con el poder de quien lo lanzó. */
interface HechizoEnElAire {
  readonly hechizo: string;
  readonly at: Hex;
  readonly poder: number;
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
   *
   * `corre`: sin carga, el tramo es de más de la mitad de su movimiento máximo
   * (`seCorre`), y el lienzo lo anima corriendo, con el clip y el ritmo de la carga;
   * si no, caminando (25-10-2026). Solo se ve: ninguna regla lo lee.
   */
  | {
      kind: 'move';
      stack: string;
      to: Hex;
      path: readonly Hex[];
      charge?: true;
      corre?: true;
    }
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
      /** Las casillas de carga que cobró (`CARGA`); montada o no, lo dice quien pegó (`cargaMontada`). */
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
  /** El tirador apunta a `at` (`aim`): el disparo sale al empezar su siguiente turno. */
  | { kind: 'aimed'; stack: string; at: Hex }
  /** `stack` lanza una granada a `at` (`throw`): explota al empezar su siguiente turno. */
  | { kind: 'thrown'; stack: string; at: Hex }
  /**
   * La granada de `stack` explota en `at` y da a `target` con la tirada en el cuarto
   * `cuarto` (4 en la casilla, 2 en las vecinas, `explosionDe`); uno por alcanzado,
   * o uno con `target` a `null` si no había nadie (entonces `damage` y `killed` son 0).
   */
  | {
      kind: 'blast';
      stack: string;
      at: Hex;
      target: string | null;
      damage: number;
      killed: number;
      cuarto: number;
      /** Lo que paró la armadura del objetivo, como en `attack`. */
      parado?: number;
    }
  /**
   * El disparo diferido sale de `stack` hacia `at` y da a `target`, el primero de
   * la recta (`lineaDelDisparo`), sea del bando que sea; `null` si la recta llega
   * a la casilla sin nadie o la para un muro, al bajar de él, o una puerta cerrada
   * (entonces `damage` y `killed` son 0).
   * La salpicadura va en otro `shoot` con `splash`, sobre el mismo `at`.
   */
  | {
      kind: 'shoot';
      stack: string;
      at: Hex;
      target: string | null;
      damage: number;
      killed: number;
      /** Lo que paró la armadura del objetivo, como en `attack`. */
      parado?: number;
      splash?: boolean;
    }
  | {
      kind: 'cast';
      side: Side;
      spell: string;
      target?: string;
      /** La casilla a la que se lanzó (`objetivo: casilla`). */
      at?: Hex;
      /** Diferido: aún no cae (`hechizoEnElAire`). */
      diferido?: true;
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
  | {
      kind: 'power';
      stack: string;
      poder: PoderId;
      target?: string;
      at?: Hex;
      cura?: number;
      diferido?: true;
    }
  /**
   * Lo que hizo un hechizo (o un disparador) a uno que alcanzó, cuando alcanza a
   * más de uno o va a una casilla (06-11-2026): el daño, lo que paró la armadura y
   * la cura. Lo que deja colgado va en su `effect`. `spell`, el hechizo; `stack`,
   * a quién.
   */
  | {
      kind: 'spell_hit';
      spell: string;
      stack: string;
      damage: number;
      killed: number;
      parado?: number;
      cura?: number;
    }
  /** Un disparador colgado de `stack` saltó (`cuando`), del hechizo `spell`. */
  | { kind: 'triggered'; stack: string; spell: string; cuando: CuandoSalta }
  /**
   * El hechizo `spell` levanta `stack`, nuevo, del cadáver `from` en `at` (08-11-2026,
   * «Levantar zombi»): va tras el `cast` o el `power` que lo lanzó. El cadáver queda
   * gastado y deja de verse. El bando es el del stack nuevo.
   */
  | { kind: 'raised'; stack: string; from: string; spell: string; at: Hex }
  /**
   * La arena cambió a media pelea las cifras de `nombre` —un tipo entero o el
   * héroe de un lado— en estos `stacks` (`retocarEnBatalla`). No es una jugada:
   * ni gasta turno ni lo mueve; queda en el registro para que el parte lo cuente
   * y para que quien guarda por el registro se entere. `cambios`, qué campo de la
   * ficha cambió, ya en palabras («ataque 3 → 10», «hechizos: − Prisa»;
   * `cambiosDeLaFicha`, `arena/ficha.ts`). Nunca vacío: un retoque que deja la ficha
   * como estaba no escribe ninguno.
   */
  | { kind: 'retoque'; nombre: string; stacks: readonly string[]; cambios: readonly string[] }
  | {
      kind: 'effect';
      stack: string;
      effect: EffectKind;
      /** La cifra que suma; lo que no es una cifra (impide, escudo, disparador), 0 y su `dicho`. */
      amount: number;
      /** Lo que hace, si no es una cifra (`dichoDelEfecto`). */
      dicho?: string;
      source: string;
      rounds: number;
      /**
       * Dura hasta que empiece o termine el próximo turno del afectado (la rueda),
       * con `rounds` de tope.
       */
      vence?: CuandoVence;
      /** De quién es ese turno, si no es del afectado (un hechizo: `HastaElTurno.de`). */
      turnoDe?: string;
    }
  | { kind: 'effect_end'; stack: string; source: string }
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
 * resetear: el turno siguiente es otro objeto.
 */
export interface TurnoDeUnidad {
  /**
   * El ordinal del turno en la batalla: 1, 2, 3… Lo pone `abrirTurno` y nadie más.
   * Es lo que responde «¿sigue siendo el MISMO turno?» (`mismoTurno`), y la
   * respuesta no se puede sacar de quién actúa: la misma unidad puede tener dos
   * turnos seguidos (la última de una ronda que abre la siguiente; hasta el 26-10-2026 también
   * la moral extra, que engañó dos veces a los cuatro sitios que lo deducían cada
   * uno a su manera —por identidad del objeto, por lo gastado que crece, por la
   * nota—). Y no se puede sacar de la identidad
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
   * terminar. Lo pone solo `melee` (lo vigila `test/invariantes-batalla.test.ts`), y no
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

/**
 * Una carga medida: las casillas de su recta y la carrera que se anda para
 * cobrarla (`medirCargas`). Vive aquí porque la guarda el golpe plantado.
 */
export interface CargaMedida {
  /** Las casillas de la recta (`CARGA_MINIMA` o más), sin el tope: lo que da `cargaDesde`. */
  readonly recta: number;
  /**
   * Lo que se anda para cobrarla: la recta, pagando lo que cuesta salir de cada
   * casilla (`carreraConCostes`), que puede costar más que el camino más barato.
   * Su `at` es la casilla de llegada, desde la que se golpea.
   */
  readonly carrera: Paso;
}

/**
 * El golpe plantado que espera la rueda (`BattleState.golpeEnCurso`). Sin carga,
 * quien pega ya anduvo y está ante su objetivo; **con carga, no ha corrido**: la
 * carga se elige antes de correr (decisión del usuario, 31-10-2026), y la carrera
 * que correrá al golpear va en `carga`.
 */
export interface GolpeEnCurso {
  readonly stack: string;
  readonly target: string;
  /**
   * La carga por correr: la recta y la carrera hasta la casilla desde la que
   * golpeará (`carga.carrera.at`); `null` si no carga.
   */
  readonly carga: CargaMedida | null;
}

/**
 * El despliegue en curso (`BattleState.despliegue`): qué tanda está abierta (un
 * índice en `TANDAS`, `despliegue.ts`) y qué bandos despliega una persona. Las
 * tandas de los demás pasan solas (`BattleSide.despliegaAMano`).
 */
interface DespliegueEnCurso {
  readonly tanda: number;
  readonly aMano: readonly Side[];
}

/**
 * Lo que se hace en el despliegue (`aplicarDespliegue`): poner a uno del bando
 * que despliega en una casilla de su zona (o cambiarlo con quien la ocupe, de su
 * misma tanda), o dar la tanda por desplegada. No es una `BattleAction`: esa es
 * el vocabulario del turno, del agente y de la IA, y el despliegue va antes de
 * cualquier turno.
 */
export type AccionDeDespliegue =
  | { readonly type: 'colocar'; readonly stack: string; readonly at: Hex }
  | { readonly type: 'desplegado' };

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
   * El bando del último stack que tuvo turno, de una ronda a la siguiente. Es el
   * `_lastActiveUnitArmyColor` de fheroes2: en un empate de velocidad mueve el
   * otro bando. `null` antes del primer turno, y entonces mueve el atacante.
   */
  ultimoBando: Side | null;
  /**
   * La fase de despliegue, antes de la primera ronda (02-11-2026, «añade al
   * combate una fase previa de despliegue»): la tanda abierta, o `null` si ya se
   * desplegó todo y la batalla va por rondas. Mientras no es `null` no hay turno
   * ni cola ni iniciativa: solo `aplicarDespliegue`. Sin bandos a mano, toda
   * batalla sale de `createBattle` ya con `null` y la ronda 1 abierta.
   */
  despliegue: DespliegueEnCurso | null;
  /** El turno abierto, o `null` si no actúa nadie (batalla terminada o sin montar). */
  turno: TurnoDeUnidad | null;
  heroes: Record<Side, BattleHero | null>;
  /**
   * Muros y puertas del tablero (`muralla.ts`). No cambia en toda la batalla. La
   * pone la arena (la que se dibuje) y la batalla del mapa (la de su sitio:
   * `murallaDelSitio`, piedra en una ciudad, madera en un pueblo, la de su obra
   * en un paso; sin sitio, `SIN_MURALLA`).
   */
  readonly muralla: MurallaDeBatalla;
  /**
   * De cuántos tipos es la rueda del golpe de esta batalla (`RUEDAS`,
   * `formas-de-la-rueda.ts`): la de la partida o la del montaje de la arena. No
   * cambia en toda la batalla y viaja tal cual al espectador, que pinta con ella.
   */
  readonly rueda: TiposDeLaRueda;
  /**
   * Los hechizos de esta batalla: los de los libros de los héroes y los poderes de
   * las unidades, **resueltos al montarla** (`createBattle`) y por id, como las
   * cifras de cada stack: la arena pelea con hechizos sin guardar y el espectador los
   * recibe por el cable. Lo lee `hechizoDeLaBatalla`; lo cambia solo el retoque de
   * la arena.
   */
  libro: Readonly<Record<string, Hechizo>>;
  /**
   * Lo que se puede levantar de un cadáver en esta batalla, por id de unidad: las
   * que nombran los `levantar` de su libro, **resueltas al montarla** con su catálogo
   * (`createBattle`, `levantablesDe`), como las cifras de cada stack: la batalla no
   * lleva catálogo, y la arena levanta con las cifras de la página. Vacío sin ningún
   * `levantar` en el libro. Lo lee `levantar` (`battle.ts`); lo rehace el retoque de
   * la arena. Sin bando: la partida no pasa catálogo y la arena pasa el mismo a los dos.
   */
  levantables: Readonly<Record<string, Levantable>>;
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
   * palabras campo a campo (`fichaEnPalabras`, `arena/ficha.ts`): lo que escribe la
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
  /**
   * El tirador apunta a la casilla `at` y cierra su turno (`apuntarBlocker`): el
   * disparo sale al empezar su siguiente turno, desde donde esté, por la recta, y
   * da al primero que encuentre (`lineaDelDisparo`; 25-10-2026, regla nuestra).
   */
  | { type: 'aim'; at: Hex }
  /**
   * Quien lleva granada la lanza por encima a la casilla `at`, a su alcance, y
   * cierra su turno (`lanzarBlocker`): explota al empezar su siguiente turno en esa
   * casilla y sus seis vecinas (`explosionDe`; 02-11-2026, regla nuestra).
   */
  | { type: 'throw'; at: Hex }
  /**
   * El héroe del bando activo lanza un hechizo de su libro (`castBlocker`), sin gastar
   * el turno de la unidad: a la unidad `target`, a la casilla `at` o, sobre sí o el
   * tablero, a nada (06-11-2026, el editor de magia).
   */
  | { type: 'cast'; spell: string; target?: string; at?: Hex }
  /**
   * La unidad activa usa uno de sus poderes (`UnitInfo.poderes`) sobre el aliado
   * `target`, sin haberse movido: es el turno entero (`poderBlocker`). La tienen
   * las unidades con una habilidad que da poder (`unidadDeCombate`), en la arena y
   * en la partida; el agente la escribe `power` (`accionDeBatallaDelAgente`).
   */
  | { type: 'power'; poder: PoderId; target?: string; at?: Hex }
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

/** Las cuatro jugadas de la muralla: las de la escala y las de la puerta. */
export type JugadaDeMuralla = TipoDeEscala | TipoDePuerta;

// ------------------------------------------------- el paso, la muralla y los efectos
//
// La forma de lo que guarda la batalla de un recorrido del tablero (`Paso`), de su
// muralla y de los efectos de un stack vivía en `board.ts`, `muralla.ts` y
// `effects.ts`, que importan este módulo: desde la fase N de la reorganización
// (07-11-2026) vive aquí, y este módulo no importa nada de `battle/` salvo las dos
// hojas de la rueda (`cifras-de-la-rueda.ts`, `formas-de-la-rueda.ts`). Las reglas
// siguen en su sitio.

/**
 * Un hex alcanzado por el BFS: la casilla y a cuántos pasos queda.
 *
 * El `Hex` viaja aquí dentro porque quien lo mete YA lo tiene en la mano —sale
 * de `neighbours`, que lo acaba de construir— y quien lo saca lo necesita. Sin
 * él, la clave se partía por la coma y se convertían dos trozos a número **dos
 * veces por hex**: una en `movableFrom` para filtrar los que no caben y otra en
 * `movableHexes` para devolverlos. Es el mismo motivo por el que
 * `NodoFrontera.at` lleva su `Point` en el mapa de aventura.
 */
export interface Paso {
  readonly at: Hex;
  /** Pasos desde el origen. */
  readonly steps: number;
  /**
   * El paso desde el que se llegó aquí, o `null` en el origen: la cadena hasta
   * el origen ES el camino que se anda (`caminoDe`). Va en el propio paso y no
   * en el mapa porque `movableFrom` filtra el mapa —quita el origen y lo que no
   * cabe— y las casillas de en medio pueden ser de las quitadas.
   */
  readonly previo: Paso | null;
}

/**
 * Una puerta: el lado que comparten `a` y `b`, dos casillas de suelo de la misma
 * fila, `b` justo al este de `a`. No ocupa ninguna de las dos.
 */
export interface PuertaDeMuralla {
  readonly a: Hex;
  readonly b: Hex;
}

/**
 * De qué está hecha una muralla: la **piedra** de las ciudades y la **madera** de la
 * empalizada de los pueblos (puesto fronterizo, fase 2, 04-11-2026). Solo cambia
 * cómo se pinta y lo que se dice: las reglas del muro son las mismas (el bono de lo
 * alto, el de la arena para los dos: pregunta 5 del plan).
 */
export type MaterialDeMuralla = (typeof MATERIALES_DE_MURALLA)[number];

/** Los materiales, en el orden en que se dicen: la lista de la que sale el tipo. */
export const MATERIALES_DE_MURALLA = ['piedra', 'madera'] as const;

export interface MurallaDeBatalla {
  readonly muros: readonly Hex[];
  readonly puertas: readonly PuertaDeMuralla[];
  /** De qué está hecha (`MaterialDeMuralla`): obligatorio, también en la arena (piedra). */
  readonly material: MaterialDeMuralla;
}

/**
 * Una puerta de la muralla en una batalla: abierta o cerrada, y el turno
 * (`TurnoDeUnidad.n`) en que se cambió por última vez, porque cada puerta se
 * cambia una vez por turno de unidad. Vive en `BattleState.puertas`, en el orden
 * de `MurallaDeBatalla.puertas`: la muralla está congelada y se guarda en cachés
 * por objeto, y esto cambia.
 */
export interface EstadoDePuerta extends PuertaDeMuralla {
  abierta: boolean;
  cambiadaEn: number | null;
}

/**
 * Los tipos de efecto que existen. Es una lista de valores y no solo un tipo
 * porque `test/invariantes-batalla.test.ts` la recorre para exigir que cada uno tenga
 * quien lo lea: un tipo que nadie suma se colgaría del stack sin hacer nada.
 * `'defense'` lo suma `effectiveDefense` (`damage.ts`); lo ponen Defensivo y
 * Romper guardia de la rueda del golpe y los hechizos. Las cifras que añadió la
 * magia (06-11-2026): `armadura` (la lee `trasLaArmadura`), `fuerza` y
 * `agilidad` (el daño de cada golpe, `danioConLosEfectos`; la agilidad, también la
 * defensa y las casillas). Y lo que no es una cifra: `impide` (`impedidoPor`),
 * `escudo` (`herir`) y `disparador` (`saltar`, `battle.ts`). Mismo patrón que
 * `CREATURE_TRAITS` en `types.ts`.
 */
export const EFFECT_KINDS = [
  'speed',
  'attack',
  'defense',
  'armadura',
  'fuerza',
  'agilidad',
  'impide',
  'escudo',
  'disparador',
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Los tipos que son una cifra que se suma al leer (`effectTotal`). */
export const CIFRAS_DE_EFECTO = [
  'speed',
  'attack',
  'defense',
  'armadura',
  'fuerza',
  'agilidad',
] as const;

export type CifraDeEfecto = (typeof CIFRAS_DE_EFECTO)[number];

/** Lo que tienen todos los efectos: quién lo puso, lo que le queda y cuándo se va. */
interface ComunDelEfecto {
  /** Quién lo puso: el id del hechizo ('slow'), el del rasgo ('fear') o el tipo de la rueda. */
  readonly source: string;
  /** Rondas que le quedan. Baja una en cada `beginRound`. */
  roundsLeft: number;
  /**
   * Si dura «hasta el próximo turno de alguien» (la rueda del golpe, un hechizo):
   * hasta cuándo. `roundsLeft` sigue de tope, por si ese turno no llega.
   */
  readonly hasta?: HastaElTurno;
  /** De un hechizo: el bando de quien lo lanzó (lo lee `disipar`). */
  readonly bando?: Side;
  /** De un hechizo: se quita si cae este stack (`seAcabaSiMuere`; `anotarLaMuerte`). */
  readonly seAcabaSiMuere?: string;
}

/** Un efecto que suma a una cifra. */
interface EfectoDeCifra extends ComunDelEfecto {
  readonly kind: CifraDeEfecto;
  readonly amount: number;
}

/** No puede hacer lo de `que` mientras dure (`impedidoPor`). */
export interface EfectoQueImpide extends ComunDelEfecto {
  readonly kind: 'impide';
  readonly que: readonly Impedible[];
}

/** Se come el daño que llega, tras la armadura, hasta agotarse (`herir`). */
interface EfectoDeEscudo extends ComunDelEfecto {
  readonly kind: 'escudo';
  /** Lo que le queda por comerse; con 0 se quita. */
  queda: number;
}

/** Un disparador colgado: sus efectos, ya con las cifras de quien lo lanzó. */
export interface EfectoDisparador extends ComunDelEfecto {
  readonly kind: 'disparador';
  readonly disparador: DisparadorResuelto;
  /** Las veces que le quedan por saltar; `null`, mientras dure. */
  cargas: number | null;
}

export type StackEffect = EfectoDeCifra | EfectoQueImpide | EfectoDeEscudo | EfectoDisparador;

/**
 * Un efecto de un hechizo con las cantidades ya calculadas con el poder de quien
 * lo lanzó: lo que guarda un disparador (`DisparadorResuelto`). Lo resuelve
 * `resolverEfecto` (`spells.ts`).
 */
export type EfectoResuelto =
  | { readonly tipo: 'danio'; readonly cantidad: number; readonly armadura: boolean }
  | { readonly tipo: 'cura'; readonly cantidad: number }
  | { readonly tipo: 'disipar'; readonly de: DisiparDe }
  | { readonly tipo: 'cifra'; readonly cifra: CifraDeHechizo; readonly valor: number }
  | { readonly tipo: 'impide'; readonly que: readonly Impedible[] }
  | { readonly tipo: 'escudo'; readonly absorbe: number };

/**
 * Un disparador como se cuelga: el de su hechizo con las cantidades resueltas, el
 * poder de quien lo lanzó (para las rondas «poder» de lo que deja) y quién lo lanzó.
 * Se guarda entero en el efecto: editar el hechizo a media pelea (la arena) no
 * cambia lo ya echado.
 */
export interface DisparadorResuelto {
  readonly cuando: CuandoSalta;
  readonly yAlLanzarse: boolean;
  readonly a: AQuien;
  readonly radio: number;
  readonly afecta: Afecta;
  readonly duracion: Duracion | null;
  readonly seAcabaSiMuere: SeAcabaSiMuere | null;
  readonly efectos: readonly EfectoResuelto[];
  readonly poder: number;
  /** El stack que lo lanzó. */
  readonly lanzador: string;
  /** Cómo se dice, ya hecho (`dichoDelEfecto` del disparador). */
  readonly dicho: string;
}

/**
 * Hasta qué turno dura un efecto: el `turno.n` en que se colgó, cuándo vence
 * (`al`) y de quién es ese turno (`de`, un stack; sin él, el del afectado). El
 * turno en que nace no cuenta: se quita con otro `n`.
 */
export interface HastaElTurno {
  readonly turno: number;
  readonly al: CuandoVence;
  readonly de?: string;
}

/**
 * Cuándo vence un efecto de la rueda: al **empezar** el siguiente turno del
 * afectado (Defensivo: `abrirTurno`) o al **terminarlo** (Romper guardia: `endTurn`). Decisión del
 * usuario, 14-10-2026. El único nombre de esto: lo leen el efecto, el evento, la
 * rueda y su nota.
 */
export type CuandoVence = 'empezar' | 'terminar';

// ------------------------------------------------- lo que entra de cada bando
//
// La tropa (`StackDeBatalla`) y el héroe (`HeroeDelBando`) de un bando tal como los
// recibe `createBattle`. Vivían en `battle.ts` hasta la fase N de la reorganización
// (07-11-2026). `BattleSide`, que los junta, sigue junto a `createBattle`: lleva el
// catálogo de su tropa (`CatalogoDeUnidades`), y `unidad/catalogo.ts` lee de aquí la
// forma de un stack, así que nombrarlo aquí cerraría un ciclo de tipos entre dos
// carpetas.

/**
 * Un stack de la tropa tal como entra: el del ejército y, si lleva, su escalera
 * para subir a la muralla (`poner_escalera`). La ponen la arena (por puesto) y
 * la batalla del mapa con muralla (a todo el bando atacante, `alAsalto`), y
 * no llega al tablero si no la puede usar (`quienNoEscala`).
 */
export type StackDeBatalla = Stack & { readonly escalera?: boolean };

/**
 * El héroe de un bando, tal como entra: lo que el motor guarda en
 * `BattleState.heroes` (`mando`: su magia y su rendición) y las cifras con las
 * que pisa el tablero (`cuerpo`, de `heroUnit`). Van juntos para que no pueda
 * haber héroe sin cuerpo ni cuerpo sin héroe; el cuerpo se queda en su stack
 * y no se copia al estado, que nadie lo leería allí.
 */
export interface HeroeDelBando {
  readonly mando: BattleHero;
  readonly cuerpo: UnitInfo;
  /**
   * El mismo cuerpo sin el equipo (`cuerpoDelHeroe`): va a su origen
   * (`OrigenDelStack.desnudo`), de donde `cuerpoDe` lo lee.
   */
  readonly desnudo: UnitInfo;
  /**
   * El id del ARTE con el que pisa el tablero (`BattleStack.body`): en la partida,
   * la hoja de su tipo (`figuraDelHeroe`); en la arena, la que se elija entre las
   * hojas de héroe o la genérica (`HERO_BODY`). Sin opcional: con un `?? HERO_BODY`
   * aquí, la partida pintó al héroe con el Y Bot sin que nada lo dijera («la imagen
   * es el y_bot», 19-10-2026). Lo que el héroe ES para la crónica no sale de aquí
   * (`queEs`).
   */
  readonly figura: string;
  /**
   * Si entra con escalera (`poner_escalera`): solo el héroe que ataca una muralla
   * del mapa (`alAsalto`). La arena no se la da: allí la escalera es de un puesto.
   */
  readonly escalera?: boolean;
  /**
   * Su casilla en la formación (`Hero.salida`, en el marco del atacante): la
   * pide al asentar (`asentar`), como la tropa la suya (`Troop.salida`).
   */
  readonly salida?: Hex;
}
