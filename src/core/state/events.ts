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
  | { kind: 'turn_start'; player: PlayerId }
  | { kind: 'hero_moved'; hero: string; to: Point; spent: number }
  | { kind: 'resource_gained'; player: PlayerId; resource: ResourceKind; amount: number }
  | { kind: 'mine_captured'; player: PlayerId; mine: string; from: PlayerId | null }
  | { kind: 'town_captured'; player: PlayerId; town: string; from: PlayerId | null }
  | { kind: 'built'; town: string; building: string }
  | { kind: 'recruited'; town: string; creature: string; count: number }
  | { kind: 'hero_hired'; player: PlayerId; hero: string; town: string }
  | { kind: 'spells_learned'; hero: string; town: string; spells: string[] }
  | { kind: 'garrison_taken'; hero: string; town: string }
  | { kind: 'battle_started'; attacker: string; foe: BattleFoe }
  | { kind: 'battle_ended'; winner: 'attacker' | 'defender'; foe: BattleFoe }
  | { kind: 'hero_defeated'; hero: string }
  | { kind: 'player_defeated'; player: PlayerId }
  | { kind: 'game_over'; winner: PlayerId };

/** Lo que escribe quien aplica la regla: el hecho, con su protagonista y su sitio. */
export type GameEventDraft = Con<Cuerpo, Origen>;

/** Lo que se guarda en `state.log`: el borrador, ya sellado por `emit`. */
export type GameEvent = Con<GameEventDraft, Sello>;
