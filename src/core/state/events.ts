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
import type { PlayerId, Point, ResourceKind } from '../types.js';

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
  | { readonly kind: 'town'; readonly townId: string };

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
  /** El jugador que lo hace, o `null` si no lo hace nadie: el reloj y el día. */
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

/** Los diecisiete hechos, sin protagonista todavía. */
type Cuerpo =
  | { kind: 'day_start'; day: number; week: number }
  | { kind: 'turn_start' }
  | { kind: 'hero_moved'; hero: string; to: Point; spent: number }
  | { kind: 'resource_gained'; resource: ResourceKind; amount: number }
  | { kind: 'mine_captured'; mine: string; from: PlayerId | null }
  | { kind: 'town_captured'; town: string; from: PlayerId | null }
  | { kind: 'built'; town: string; building: string }
  | { kind: 'recruited'; town: string; creature: string; count: number }
  | { kind: 'hero_hired'; hero: string; town: string }
  | { kind: 'spells_learned'; hero: string; town: string; spells: string[] }
  | { kind: 'garrison_taken'; hero: string; town: string }
  | { kind: 'battle_started'; attacker: string; foe: BattleFoe }
  | { kind: 'battle_ended'; winner: 'attacker' | 'defender'; foe: BattleFoe }
  | { kind: 'hero_defeated'; hero: string }
  | { kind: 'level_up'; hero: string; level: number }
  | { kind: 'player_defeated' }
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
 * Una mina propia capturada lejos **no** entra en esa excepción: el original no
 * te avisa, y el contrato ya enseña a leer la señal —una mina tuya que dejó de
 * dar recursos es que allí ha pasado algo—.
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
    case 'resource_gained':
    case 'mine_captured':
    case 'built':
    case 'recruited':
    case 'hero_hired':
    case 'spells_learned':
    case 'garrison_taken':
    case 'battle_started':
    case 'battle_ended':
    case 'hero_defeated':
    case 'level_up':
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
