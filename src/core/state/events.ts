/**
 * Los hechos de una partida, cada uno con protagonista y sitio.
 *
 * Vive aparte de `game.ts` por dos motivos. El primero es que no depende de
 * nada —solo de `types.ts`—, así que `game.ts` lo importa y él no importa a
 * `game.ts`: no hay ciclo. El segundo es que la regla de reparto —quién se
 * entera de qué— es del núcleo y de nadie más, y aquí queda pegada al tipo que
 * la hace posible.
 *
 * `actor` y `at` son **obligatorios en toda variante**, y eso es el diseño, no
 * un descuido de ergonomía: con `actor?` el compilador deja de forzar y el
 * emisor número veinte nace anónimo, que es exactamente el bug que se cierra
 * aquí. Mientras el evento no dijera de quién era ni dónde pasaba, la crónica
 * solo se podía mandar entera, y el agente seguía leyendo el diario del rival
 * —2767 de 6287 eventos entregados, el 44 %— después de que #35 le hubiera
 * quitado el mapa.
 */
import type { ResumenDeBatalla } from '../battle/resumen.js';
import type { Side } from '../battle/types.js';
import type { GrupoDeTropa } from '../data.js';
import type { PlayerId, Point } from '../types.js';

/**
 * Contra qué se libra una batalla del mapa.
 *
 * Vive aquí y no en `game.ts` porque es el cuerpo de dos eventos, y este módulo
 * es el que no importa a nadie: si estuviera arriba, el tipo de los eventos
 * tendría que ir a buscarlo y el ciclo volvería.
 */
export type BattleFoe =
  | { readonly kind: 'monster'; readonly objectId: string }
  | { readonly kind: 'hero'; readonly heroId: string }
  | { readonly kind: 'town'; readonly townId: string }
  /** Un grupo de asaltantes al que ataca un héroe (`state/asaltantes.ts`). */
  | { readonly kind: 'raider'; readonly raiderId: string };

/**
 * Quién abre una batalla del mapa.
 *
 * Fue siempre un héroe —`attackerHeroId: string`, y «el atacante es siempre un
 * jugador» escrito en dos comentarios del servidor— hasta que hubo asaltantes:
 * un grupo que **embosca** al héroe que pisa su región ataca él, y el héroe
 * defiende. Contarlo al revés —el héroe «ataca» y se marca como emboscada—
 * habría ahorrado tocar `settleBattle` a costa de decirle `yourSide: attacker`
 * a quien acaban de emboscar: una mentira al agente, y por eso no.
 */
export type Atacante = Extract<BattleFoe, { readonly kind: 'hero' | 'raider' }>;

/**
 * Por qué queda eliminado un jugador. `lost_base` es la regla de la partida:
 * perder la base elimina aunque queden héroes y ciudades. `nothing_left` es la
 * de quien no tuvo nunca base, que solo dan los estados de prueba.
 */
export type DefeatReason = 'lost_base' | 'nothing_left';

/**
 * Añade `X` a cada miembro de la unión, uno a uno.
 *
 * El `T extends unknown` no filtra nada: está para que TypeScript **distribuya**
 * sobre la unión. Un `Cuerpo & Origen` a secas también compilaría, pero la
 * unión dejaría de estar discriminada por `kind` y todo `switch` sobre ella
 * dejaría de estrechar.
 */
type Con<T, X> = T extends unknown ? T & X : never;

/** Quién protagoniza el hecho y en qué casilla pasa. */
type Origen = {
  /**
   * El jugador que lo hace, o `null` si no lo hace nadie.
   *
   * Son **dos** casos y hasta hace poco era uno: el reloj (`day_start`, que no
   * lo pasa nadie, pasa) y el final **sin ganador** (`game_over` al agotarse los
   * días). El segundo entró con el tope de días y dejó caducada esta frase
   * cuando decía «el reloj y el día» — y no se puso nada rojo, porque el test
   * que la vigila juega una semilla que acaba por conquista.
   */
  readonly actor: PlayerId | null;
  /** La casilla donde ocurre, o `null` si el hecho no pasa en ningún sitio. */
  readonly at: Point | null;
};

/** El sello: quién estaba mirando ese sitio **cuando ocurrió**. */
type Sello = {
  /**
   * Los jugadores que observaban `at` en el instante del hecho, en el orden de
   * `state.players`.
   *
   * Es un array de ids y no un `Set` ni una máscara de bits, y el motivo lo
   * avisa #10: `JSON.stringify` no salva un `Set`. El día que exista guardar y
   * cargar, la crónica volvería del disco con el sello convertido en `{}` y
   * todo el mundo se enteraría de todo otra vez. Con dos jugadores son 0–2
   * números sobre los 141 eventos de una partida: no hay nada que optimizar.
   *
   * En orden de `state.players` y nunca el de la iteración de un `Set`: dos
   * partidas con la misma semilla tienen que dar el mismo `JSON`.
   */
  readonly seen: readonly PlayerId[];
};

/** Los hechos, sin protagonista todavía. */
type Cuerpo =
  | { kind: 'day_start'; day: number; week: number }
  | { kind: 'turn_start' }
  | { kind: 'hero_moved'; hero: string; to: Point; spent: number }
  /**
   * La marcha de un héroe se acaba porque no le quedan puntos para el paso
   * siguiente, sin haber llegado (#121). `at` es donde se queda y `faltan` los
   * pasos que le quedaban del camino calculado al salir. La escribe `moveHero`,
   * que es quien sabe por qué paró: una batalla o el final paran por otro motivo
   * y no la escriben. La IA recorta antes (`stepTowards`) y no la escribe nunca.
   * `at` se repite aquí solo para estrecharlo: siempre hay casilla, y quien lo
   * cuenta no tiene que preguntar por `null`.
   */
  | { kind: 'march_cut'; hero: string; faltan: number; at: Point }
  /** El oro de un cofre: lo único que se recoge del mapa. */
  | { kind: 'gold_gained'; amount: number }
  /** Un nodo de la red cambia de dueño al pisarlo (fase 2a). */
  | { kind: 'node_captured'; node: string; from: PlayerId | null }
  | { kind: 'town_captured'; town: string; from: PlayerId | null }
  | { kind: 'built'; town: string; building: string }
  | { kind: 'recruited'; town: string; creature: string; count: number }
  /** Un héroe licencia tropa en un castillo suyo, para hacer sitio a otra mejor. */
  | { kind: 'dismissed'; hero: string; creature: string; count: number }
  | { kind: 'hero_hired'; hero: string; town: string }
  /**
   * El héroe que gana una batalla contra un grupo de asaltantes o toma una ciudad
   * neutral guarnecida se lleva una pieza de equipo a la mochila (`repartirBotin`).
   * `from` dice de qué: es lo que la crónica cuenta y lo que mide el arnés.
   */
  | { kind: 'loot_found'; hero: string; item: string; from: 'raider' | 'town' }
  /** Un héroe compra una pieza en la armería de un pueblo suyo. Equipar no es un hecho: es estado. */
  | { kind: 'item_bought'; hero: string; town: string; item: string }
  /**
   * Un veterano de rango máximo se hace héroe en su base (ciclo B de «la tropa
   * crece»): `hero` es el id del nuevo, `creature` lo que era y `name` el nombre
   * que le dio el narrador. Solo ocurre con agente —«solo con narrador»—, así
   * que en una partida sin él no sale nunca y el volcado del banco no lo ve.
   */
  | { kind: 'hero_promoted'; hero: string; town: string; creature: string; name: string }
  | { kind: 'spells_learned'; hero: string; town: string; spells: string[] }
  | { kind: 'garrison_taken'; hero: string; town: string }
  | { kind: 'battle_started'; attacker: Atacante; foe: BattleFoe }
  /**
   * Un grupo embosca a un héroe **antes de que llegue** a donde iba: `faltan`
   * son los pasos del camino que le quedaban (> 0). Lo escribe `moveHero`, que
   * es quien sabe a dónde iba; la emboscada en el destino es la variante de
   * arriba, porque ahí la marcha llegó. Así quien cuenta la marcha —la nota del
   * agente— lee el hecho y no deduce nada comparando casillas.
   */
  | {
      kind: 'battle_started';
      attacker: Extract<Atacante, { readonly kind: 'raider' }>;
      foe: Extract<BattleFoe, { readonly kind: 'hero' }>;
      faltan: number;
      at: Point;
    }
  /**
   * La batalla terminó. Además del ganador, lo que sobrevive de dentro
   * (`ResumenDeBatalla`, #93): rondas, hechizos lanzados y bajas por bando.
   * `owners` dice de quién era cada bando —`null` un monstruo, un grupo o una
   * guarnición neutral—, que es lo que deja leer «lo tuyo» en `lost` y `casts`
   * sin ir a buscar al estado héroes que quizá ya no están.
   */
  | ({
      kind: 'battle_ended';
      winner: Side;
      foe: BattleFoe;
      owners: Readonly<Record<Side, PlayerId | null>>;
    } & ResumenDeBatalla)
  /**
   * Un grupo de asaltantes está en el mapa: los del mapa de salida al empezar
   * la partida y los que brotan un lunes en una región sin dueño. Lo hace el
   * reloj (`actor: null`) y se entera quien mirara su casilla. La patrulla
   * diaria NO es un hecho: es estado (`GameState.raiders`).
   */
  | { kind: 'raider_spawned'; raider: string; troops: readonly GrupoDeTropa[] }
  /**
   * Un grupo se dispersa porque su región acaba de tener dueño. `actor` es
   * quien la cerró: es su hecho, aunque el grupo esté lejos de donde la cerró.
   */
  | { kind: 'raider_dispersed'; raider: string }
  /**
   * La marcha de un héroe se para porque, andando, ve un grupo (`raider`) que lo
   * emboscaría más adelante en la ruta con la fuerza de ahora y que no es el que
   * la ruta avisaba al salir (#130; la regla, en `vigiaDeLaMarcha`). `at` es
   * donde se queda; lo andado y lo gastado cuentan. `troops` es la tropa del
   * grupo al verlo, para contarlo sin ir a buscarlo al estado. El grupo avisado
   * no para nada: quien pidió la ruta decidió pisarlo. `at` se estrecha como en
   * `march_cut`: siempre hay casilla.
   */
  | {
      kind: 'march_halted';
      hero: string;
      raider: string;
      troops: readonly GrupoDeTropa[];
      at: Point;
    }
  | { kind: 'hero_defeated'; hero: string }
  /**
   * El héroe vuelve a su base tras perder una batalla (fase 1b). Va DESPUÉS de
   * su `hero_defeated` si cayó peleando, y solo si se rindió (`surrendered`),
   * que no es caer. `at` es la casilla donde reaparece.
   *
   * Rendido, lleva lo que pagó (`gold`): la crónica es lo único que queda de la
   * batalla después de liquidarla, y sin la cifra la persona veía bajar su oro
   * sin una línea que dijera cuánto (H-2 de la fase 1b). Dos variantes y no un
   * `gold` opcional: así no existe una rendición sin precio ni una caída con él.
   */
  | { kind: 'hero_returned'; hero: string; town: string; surrendered: false }
  | { kind: 'hero_returned'; hero: string; town: string; surrendered: true; gold: number }
  /**
   * Un héroe sube de rango (su experiencia): uno por rango. Su NIVEL no va aquí:
   * es el de sus cifras (`nivelDeUnidad`), que el rango sube o no.
   */
  | { kind: 'rank_up'; hero: string; rank: number }
  /**
   * Un individuo de la tropa sube de rango: uno por rango, como `rank_up`. `veterano` es su `Veterania.id` —la tropa que se hace héroe
   * (ciclo B) tiene que poder decir CUÁL—; `actor` es su dueño. No dice quién lo
   * llevaba: no lo leía nadie, y un campo que nadie lee en cada hecho es volcado
   * y payload de más.
   */
  | { kind: 'troop_rank_up'; creature: string; rank: number; veterano: string }
  /**
   * Un jugador queda eliminado, y **por qué**. Sin el motivo, el cliente
   * escribía la regla de antes del mapa de nodos —«no te quedan castillos ni
   * héroes»— con el héroe del derrotado todavía en el mapa (I1 de la 2a): la
   * causa la decide `checkDefeat`, y quien la cuente tiene que leerla de aquí
   * en vez de suponerla.
   */
  | { kind: 'player_defeated'; reason: DefeatReason }
  | { kind: 'game_over' };

/** Lo que escribe quien aplica la regla: el hecho, con su protagonista y su sitio. */
export type GameEventDraft = Con<Cuerpo, Origen>;

/**
 * Lo que se guarda en `state.log`: el borrador, ya sellado por `emit`.
 *
 * Se distribuye UNA vez sobre `Cuerpo` y no dos. `Con<GameEventDraft, Sello>`
 * daba exactamente lo mismo volviendo a recorrer la unión entera, y `Con` viene
 * con ocho líneas de docstring justo porque es delicado.
 */
export type GameEvent = Con<Cuerpo, Origen & Sello>;

/**
 * Con qué vara se sella cada hecho que tiene sitio (`emit`): por su casilla; por
 * la región, que es como se ve un grupo de asaltantes (#130); o, la marcha que
 * se para por un grupo, por la casilla del héroe **y** el grupo: el hecho lleva
 * su id y su tropa, y al rival que mira al héroe sin ver la región del grupo se
 * los contaría la crónica (H4 de QA). Exhaustivo por `kind`: un hecho nuevo de
 * un grupo no puede olvidarse de decirlo. Los que no tienen sitio no se sellan;
 * dicen `casilla` por decir algo.
 */
export const SE_VE_POR: Readonly<
  Record<GameEvent['kind'], 'casilla' | 'region' | 'casilla y grupo'>
> = {
  day_start: 'casilla',
  turn_start: 'casilla',
  hero_moved: 'casilla',
  march_cut: 'casilla',
  gold_gained: 'casilla',
  node_captured: 'casilla',
  town_captured: 'casilla',
  built: 'casilla',
  recruited: 'casilla',
  dismissed: 'casilla',
  hero_hired: 'casilla',
  loot_found: 'casilla',
  item_bought: 'casilla',
  hero_promoted: 'casilla',
  spells_learned: 'casilla',
  garrison_taken: 'casilla',
  battle_started: 'casilla',
  battle_ended: 'casilla',
  raider_spawned: 'region',
  raider_dispersed: 'region',
  march_halted: 'casilla y grupo',
  hero_defeated: 'casilla',
  hero_returned: 'casilla',
  rank_up: 'casilla',
  troop_rank_up: 'casilla',
  player_defeated: 'casilla',
  game_over: 'casilla',
};

/**
 * Si a `p` le consta ese hecho. **La única función que lo decide.**
 *
 * Ni el contrato del agente ni la pantalla reimplementan esto: la leen. Y el
 * `switch` es exhaustivo y **no tiene `default`** a propósito — un `kind` nuevo
 * sin reparto no compila, en vez de colarse por la rama de abajo con la
 * respuesta que tocara.
 *
 * Eso no es, en cambio, el motivo de que sea un `switch` y no una tabla, que es
 * lo que decía aquí antes: está comprobado que una tabla
 * `Record<E['kind'], Politica>` obliga exactamente igual —`TS2741: Property …
 * is missing`—. El motivo real es el **estrechamiento**: dentro de la cláusula
 * de `town_captured` el tipo ya es esa variante, y por eso se puede leer
 * `e.from`, que una tabla indexada por `kind` no tendría delante. En este
 * repositorio el comentario ES el documento de diseño, y uno que enseña algo
 * falso al siguiente que dude entre tabla y `switch` cuesta más que ninguno.
 *
 * Tres reglas, en orden:
 *
 *  - **El reloj y el final, siempre**, sean de quien sean. Ocultar `day_start`
 *    o `game_over` no es niebla, es una partida rota. `turn_start` va con
 *    ellos: no tiene casilla que observar y en una partida de dos el agente ya
 *    sabe que no le toca — esconderlo no le quita información, le rompe la
 *    máquina de estados.
 *  - **Lo tuyo, siempre**, por `actor`. Y eso cubre de paso lo que te pasa a ti
 *    protagonizándolo el rival: el `actor` de `hero_defeated` es el dueño del
 *    MUERTO, así que perder un héroe te consta aunque te lo maten a veinte
 *    casillas de cualquiera de los tuyos.
 *  - **Lo demás, solo si lo estabas mirando**: `seen`, sellado al ocurrir.
 *
 * Con una excepción, y es la trampa del diseño: perder un castillo se sabe
 * siempre, y eso lo dice `from` y **no** el sello. Cuando `emit` calcula el
 * sello, el castillo ya ha cambiado de bandera y su dueño de ayer no lo mira ya
 * desde ninguna parte — se selló a sí mismo fuera. Lo mismo le pasa al héroe
 * muerto, que ya no está en `state.heroes`, y por eso los dos van por las
 * cláusulas de «siempre».
 *
 * Un nodo propio tomado lejos **no** entra en esa excepción: no te avisa nadie,
 * y la señal es la renta —un pueblo o una ciudad que deja de darte oro es que
 * alguien ha cortado un paso—.
 */
export function visibleTo(e: GameEvent, p: PlayerId): boolean {
  switch (e.kind) {
    case 'day_start':
    case 'turn_start':
    case 'player_defeated':
    case 'game_over':
      return true;

    case 'town_captured':
      return e.actor === p || e.from === p || e.seen.includes(p);

    case 'hero_moved':
    case 'march_cut':
    case 'gold_gained':
    case 'node_captured':
    case 'built':
    case 'recruited':
    case 'dismissed':
    case 'hero_hired':
    case 'loot_found':
    case 'item_bought':
    case 'hero_promoted':
    case 'spells_learned':
    case 'garrison_taken':
    case 'battle_started':
    case 'battle_ended':
    case 'hero_defeated':
    case 'hero_returned':
    case 'rank_up':
    case 'troop_rank_up':
    case 'raider_spawned':
    case 'raider_dispersed':
    case 'march_halted':
      return e.actor === p || e.seen.includes(p);
  }
}

/**
 * El hecho como se cuenta fuera: sin el sello.
 *
 * Quién MÁS estaba mirando es contabilidad de casa. Decírselo a alguien es una
 * fuga por la puerta de al lado, y este ciclo la dejó abierta en el mensaje del
 * espectador después de cerrarla en el del agente: por eso el borrado se
 * escribe aquí una vez y no en cada salida.
 */
export function sinSello(e: GameEvent): GameEventDraft {
  const { seen: _seen, ...resto } = e;
  return resto;
}

/**
 * La crónica que le consta a `player`, lista para entregar: los `n` hechos más
 * recientes que pasan la niebla, en orden y sin el sello.
 *
 * `visibleTo` estaba exportada y documentada como la única que decide, pero la
 * COMPOSICIÓN no: vivía como tres eslabones encadenados en el consumidor, y las
 * dos reglas que no son `visibleTo` —filtrar ANTES de cortar, y borrar el
 * sello— las sostenía un comentario. El error del que avisa es real y
 * silencioso: cortando primero, la ventana del agente encoge de 25 a 18
 * —medido— y no lo nota ningún test que no cuente los eventos que llegan. Con
 * un segundo llamante ya a la vista (#34, el espectador), la regla se escribe
 * una vez.
 *
 * Recorre el log desde el FINAL y para al llegar a `n`, en vez de filtrarlo
 * entero para quedarse con la cola. Es la misma semántica —el filtro sigue
 * yendo antes que el corte— y con logs de verdad (≤359 eventos) el ahorro son
 * ~8 µs por llamada, o sea nada: se escribe así porque es lo que se quiere
 * decir, no porque se note.
 *
 * Toma el estado por su FORMA y no por el tipo `GameState`: este módulo no
 * importa a `game.ts` —es todo el motivo de que viva aparte— y de lo único que
 * depende aquí es del log.
 */
export function cronicaPara(
  state: { readonly log: readonly GameEvent[] },
  player: PlayerId,
  n: number,
): GameEventDraft[] {
  const cronica: GameEventDraft[] = [];
  for (let i = state.log.length - 1; i >= 0 && cronica.length < n; i--) {
    // El `!` y no un `as`: el índice está acotado por el propio bucle, y en
    // este módulo el `as` sobre un log es justo lo que vigila un invariante.
    const e = state.log[i]!;
    if (visibleTo(e, player)) cronica.push(sinSello(e));
  }
  return cronica.reverse();
}
