/**
 * Lo que se pregunta a una partida sin cambiarla: el día y la semana, quién juega,
 * de quién es cada héroe y cada ciudad, a dónde va un recluta y si es tu turno; la
 * base de cada jugador y a qué casilla de ella vuelve un héroe; de quién es cada
 * bando de una batalla, y por quién no se rinde la IA.
 *
 * Vivía en `game.ts`, que la usa, y la regla de un lugar (`mundo/reglas.ts`)
 * pregunta de quién es el turno: con las dos en el mismo fichero, `game.ts` y
 * `mundo/reglas.ts` se importaban el uno al otro, un ciclo de importación en
 * ejecución (fase N de la reorganización, 07-11-2026). Lo de la base y de los
 * bandos llegó al repartir `game.ts` (paso N10 de la misma fase): lo preguntan
 * varios de los módulos en que se partió.
 */

import { SIDES, type Side } from '../battle/types.js';
import { armyLeadership, capacidadDe, troopBlocker, troopRoom } from '../hero/troop.js';
import { pointKey } from '../map/geometria.js';
import { blocksMovement, isEnterable, objectAt, sePasa } from '../map/map.js';
import { recruitBlocker, recruitCost, type Town } from '../town/town.js';
import type { Army, Hero, PlayerId, Point } from '../types.js';
import { unidadDelJuego } from '../unidad/catalogo.js';
import {
  cupoDeLaGuarnicion,
  dueñoDeLaCiudad,
  guarnicionDe,
  laGuarnicion,
  sitioDeLaCiudad,
} from './sitios.js';
import {
  type Enfrentamiento,
  type GameState,
  MAX_HEROES_PER_PLAYER,
  type PendingBattle,
  type Player,
} from './tipos.js';

// ---------------------------------------------------------------- consultas

export function week(state: GameState): number {
  return Math.floor((state.day - 1) / 7) + 1;
}

export function dayOfWeek(state: GameState): number {
  return ((state.day - 1) % 7) + 1;
}

export function currentPlayer(state: GameState): Player {
  const p = state.players.find((x) => x.id === state.current);
  if (p === undefined) throw new Error(`jugador desconocido: ${state.current}`);
  return p;
}

export function playerById(state: GameState, id: PlayerId): Player {
  const p = state.players.find((x) => x.id === id);
  if (p === undefined) throw new Error(`jugador desconocido: ${id}`);
  return p;
}

export function heroById(state: GameState, id: string): Hero {
  const h = state.heroes.find((x) => x.id === id);
  if (h === undefined) throw new Error(`héroe desconocido: "${id}"`);
  return h;
}

export function townById(state: GameState, id: string): Town {
  const t = state.towns.find((x) => x.id === id);
  if (t === undefined) throw new Error(`pueblo desconocido: "${id}"`);
  return t;
}

export function heroesOf(state: GameState, player: PlayerId): Hero[] {
  return state.heroes.filter((h) => h.owner === player);
}

/**
 * El héroe PROPIO que está en la base `town`, o `null`. Solo los de `player`: un
 * rival parado en tu castillo no camina por tu base ni le pone voz el narrador.
 */
export function heroeEnLaBase(state: GameState, player: PlayerId, town: Town): Hero | null {
  return heroesOf(state, player).find((h) => h.at.x === town.at.x && h.at.y === town.at.y) ?? null;
}

/** Las ciudades de `player` (`dueñoDeLaCiudad`: en el muro, las tomadas; dentro de una región, las de sus regiones). */
export function townsOf(state: GameState, player: PlayerId): Town[] {
  return state.towns.filter((t) => dueñoDeLaCiudad(state, t) === player);
}

/**
 * El héroe del dueño de `town` que está en su casilla, o `undefined` si no hay
 * ninguno (o el pueblo no tiene dueño): `heroeEnLaBase` con el dueño de la ciudad.
 * **Una regla con varios lectores**: a quién va un recluta (`destinoDeRecluta`), de
 * qué tropa salen los veteranos de la base (`veteranosEnSuBase`) y a quién va lo
 * que se compra en la armería (`buyBlocker`, `buy_item` y la IA). Escrita en cada
 * uno, el día que cambie —un héroe de al lado que también cuente, por ejemplo— el
 * veterano que el narrador ve en la base no sería el que se puede reclutar con.
 */
export function heroeEnElPueblo(state: GameState, town: Town): Hero | undefined {
  const dueño = dueñoDeLaCiudad(state, town);
  return dueño === null ? undefined : (heroeEnLaBase(state, dueño, town) ?? undefined);
}

/**
 * La ciudad **de su bando** en la que está `hero`, o `undefined`: donde se licencia
 * tropa y con cuya muralla y moral defiende. Sin la guarnición suya en una ajena:
 * para eso, `sitioDelHeroe`.
 */
export function castilloSuyoDelHeroe(state: GameState, hero: Hero): Town | undefined {
  const town = state.towns.find((t) => t.at.x === hero.at.x && t.at.y === hero.at.y);
  return town !== undefined && dueñoDeLaCiudad(state, town) === hero.owner ? town : undefined;
}

/**
 * Si `player` puede tener un héroe más: el tope (`MAX_HEROES_PER_PLAYER`) escrito
 * una vez, para los dos caminos por los que nace un héroe —contratarlo y
 * ascender a un veterano— y para el director, que no pregunta por un ascenso
 * que el tope no dejaría hacer.
 */
export function hayHuecoDeHeroe(state: GameState, player: PlayerId): boolean {
  return heroesOf(state, player).length < MAX_HEROES_PER_PLAYER;
}

/** A dónde va lo que se recluta en un pueblo, y con qué tope de liderazgo. */
export interface DestinoDeRecluta {
  /** El héroe del dueño que está dentro, o `undefined` si va a la guarnición. */
  readonly hero: Hero | undefined;
  readonly army: Army;
  readonly tope: number;
  /** Cuántos individuos caben como mucho: el del héroe (`capacidadDe`) o el tope de la partida. */
  readonly cupo: number;
  /** Cómo lo nombra la frase de rechazo: «el ejército» o «la guarnición». */
  readonly quien: string;
}

/**
 * La regla de a dónde va un recluta: al héroe del dueño que esté en el pueblo,
 * con su liderazgo; si no hay ninguno, a la guarnición, con el suyo.
 *
 * Una sola regla con dos lectores —`recruit`, que la aplica, y `planRecruits`,
 * que planifica con ella—. Copiada en los dos, el día que cambie uno la IA
 * pediría lo que el motor rechaza, y la partida lanzaría en el turno de la IA.
 */
export function destinoDeRecluta(state: GameState, town: Town): DestinoDeRecluta {
  if (dueñoDeLaCiudad(state, town) === null) {
    throw new Error(`no se puede reclutar en ${town.name}: no tiene dueño`);
  }
  const hero = heroeEnElPueblo(state, town);
  return hero === undefined
    ? {
        hero,
        army: guarnicionDe(state, sitioDeLaCiudad(town)),
        ...cupoDeLaGuarnicion(state),
        quien: 'la guarnición',
      }
    : { hero, army: hero.army, ...capacidadDe(hero, state.combate.tope), quien: 'el ejército' };
}

/**
 * Por qué no se pueden reclutar `count` de `creatureId` en `town` con `oro`,
 * o `null`: primero lo que el pueblo puede dar —hay tantos, alcanza el oro— y
 * luego si caben en `destino`. Lo leen la acción `recruit`, que lanza con él, y
 * el panel de la morada, que apaga «+1» y «Todo» y pone el motivo en su `title`.
 */
export function reclutarBlocker(
  town: Town,
  creatureId: string,
  count: number,
  destino: Pick<DestinoDeRecluta, 'army' | 'tope' | 'cupo' | 'quien'>,
  oro: number,
): string | null {
  return (
    recruitBlocker(town, creatureId, count, oro) ??
    troopBlocker(destino.army, destino.tope, destino.cupo, creatureId, count, destino.quien)
  );
}

/** Cuántos individuos de una criatura se pueden reclutar ahora, y por qué no más. */
export interface RecruitCapacity {
  /** Los que ofrece el pueblo esta semana. */
  readonly disponibles: number;
  /** Los que caben en el liderazgo del destino. */
  readonly caben: number;
  /** De los que hay y caben, cuántos se pueden pagar con `oro`. */
  readonly maximo: number;
  /** Lo que ocupa uno en el liderazgo. */
  readonly ocupaUno: number;
  /** Lo que ya ocupa el destino. */
  readonly ocupado: number;
  readonly tope: number;
  /** «el ejército» o «la guarnición», como lo nombra el rechazo. */
  readonly quien: string;
}

/**
 * Lo máximo que se puede reclutar de `creatureId` hacia `destino` con `oro`.
 *
 * Es la cuenta que hacía `planRecruits` por dentro, sacada aquí para que la
 * lean la IA y la pantalla: el botón «todo» del castillo reclutaba
 * `town.available` sin mirar el liderazgo ni el oro, y el núcleo lo rechazaba
 * entero —«no cabe»— en vez de dar lo que cabía.
 *
 * Toma el destino y no el estado porque la IA planifica varias criaturas
 * seguidas sobre un ejército que va creciendo y un monedero que va menguando;
 * quien solo quiere la foto de ahora lo saca con `destinoDeRecluta`.
 */
export function recruitCapacity(
  town: Town,
  creatureId: string,
  destino: Pick<DestinoDeRecluta, 'army' | 'tope' | 'cupo' | 'quien'>,
  oro: number,
): RecruitCapacity {
  const disponibles = town.available[creatureId] ?? 0;
  const caben = troopRoom(destino.army, destino.tope, destino.cupo, creatureId);
  const uno = recruitCost(creatureId, 1);
  const pagables = uno === 0 ? Number.POSITIVE_INFINITY : Math.floor(oro / uno);
  const maximo = Math.max(0, Math.min(disponibles, caben, pagables));
  return {
    disponibles,
    caben,
    maximo,
    ocupaUno: unidadDelJuego(creatureId).leadership,
    ocupado: armyLeadership(destino.army),
    tope: destino.tope,
    quien: destino.quien,
  };
}

/**
 * Por qué `quien` no puede actuar ahora mismo, o `null` si sí puede.
 *
 * La frase la escribe el núcleo y la enseña quien la pida, igual que
 * `buildBlocker` y `castBlocker`: antes había tres redacciones de esto —una
 * aquí y dos en el cliente— y la única que decía **quién** está jugando era la
 * que no se veía nunca, porque el cliente comprobaba el turno antes de llamar.
 */
export function turnBlocker(state: GameState, quien: PlayerId): string | null {
  if (state.finished !== null) return 'la partida ya ha terminado';
  if (quien === state.current) return null;
  return `todavía no es tu turno: ahora juega el ${describePlayer(state, state.current)}`;
}

/**
 * Quién es un jugador, con **el mismo número que ve todo lo demás**: el agente
 * ve el id en `owner`, en `you`, en las consultas y en la nota de fin de
 * partida, y dos numeraciones para la misma cosa es una trampa. `playerById`
 * **lanza** si el id no existe, en vez de degradar a un `jugador 7` con pinta
 * de dato bueno.
 */
export function describePlayer(state: GameState, id: PlayerId): string {
  return `jugador ${id} (${playerById(state, id).faction})`;
}

/** El héroe `heroId`, si existe y es de `player`; o por qué no. */
export function heroeSuyo(
  state: GameState,
  player: PlayerId,
  heroId: string,
): Hero | { readonly motivo: string } {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero === undefined) return { motivo: `no existe ningún héroe "${heroId}"` };
  if (hero.owner !== player) return { motivo: `${hero.name} no es de tu bando` };
  return hero;
}

/**
 * La base de un jugador, si todavía es suya; `null` si no la tuvo nunca o la
 * ha perdido. El dueño se pregunta a `dueñoDeLaCiudad` (la base está en el muro:
 * el de su objeto, que escribe `tomarElNodo`).
 */
export function baseOf(state: GameState, player: PlayerId): Town | null {
  const id = playerById(state, player).base;
  if (id === null) return null;
  const town = townById(state, id);
  return dueñoDeLaCiudad(state, town) === player ? town : null;
}

/**
 * La casilla del castillo, o si la ocupa otro héroe la primera libre —que se
 * pueda pisar, sin objeto y sin héroe— de una búsqueda en anchura desde el
 * castillo que **para en cuanto la encuentra**.
 *
 * Antes era el orden de descubrimiento de un `reachableFrom` del mapa entero
 * —un Dijkstra completo para mirar, casi siempre, las ocho vecinas—. Las dos
 * dan la misma casilla siempre que alguna vecina del castillo esté libre: el
 * Dijkstra descubre las ocho de golpe al sacar el origen, en el mismo orden de
 * `dy` por fuera y `dx` por dentro que se usa aquí. Si las ocho estuvieran
 * ocupadas, esta da la más cercana en pasos y aquella la más cercana en coste.
 * Comprobado ejecutando las dos a la vez en cada vuelta: 1 491 en las 200
 * partidas del banco y 8 894 en 1 200 partidas, 0 distintas. Con una salvedad
 * que hay que saber: en ninguna de ellas estaba ocupado el castillo —la IA no
 * contrata un segundo héroe mientras tiene uno—, así que la rama de la búsqueda
 * solo la ejercen los tests.
 */
export function casillaDeVuelta(state: GameState, hero: Hero, base: Town): Point {
  const ocupada = (p: Point): boolean =>
    state.heroes.some((h) => h.id !== hero.id && pointKey(h.at) === pointKey(p)) ||
    state.raiders.some((r) => pointKey(r.at) === pointKey(p));
  if (!ocupada(base.at)) return base.at;
  const vistas = new Set<string>([pointKey(base.at)]);
  const cola: Point[] = [base.at];
  for (let i = 0; i < cola.length; i++) {
    const desde = cola[i]!;
    // Como en el Dijkstra del mapa: de una casilla con objeto que bloquea no se
    // sigue, salvo del origen, que es el propio castillo.
    const objeto = objectAt(state.map, desde);
    if (i > 0 && objeto !== undefined && blocksMovement(objeto)) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const p = { x: desde.x + dx, y: desde.y + dy };
        if (!isEnterable(state.map, p) || !sePasa(state.map, desde, p) || vistas.has(pointKey(p)))
          continue;
        vistas.add(pointKey(p));
        if (!ocupada(p) && objectAt(state.map, p) === undefined) return p;
        cola.push(p);
      }
    }
  }
  throw new Error(`${hero.name} no tiene casilla libre a la que volver junto a ${base.name}`);
}

/**
 * De quién es cada bando de una batalla pendiente.
 *
 * Borra dos constantes cableadas que decían `'attacker'` porque el único camino
 * que existía a una batalla era el ataque del agente: el del director y el de la
 * consulta `battle_state`. El defensor es `null` cuando enfrente hay un
 * monstruo, que no tiene dueño; un pueblo lo tiene igual que un héroe, y por eso
 * el agente también defiende su castillo.
 */
export function battleOwners(
  state: GameState,
  pending: Enfrentamiento,
): Readonly<Record<Side, PlayerId | null>> {
  const foe = pending.foe;
  let defender: PlayerId | null;
  switch (foe.kind) {
    case 'monster':
    case 'raider':
    case 'lugar':
      defender = null;
      break;
    case 'hero':
      defender = heroById(state, foe.heroId).owner;
      break;
    case 'garrison':
      // La tropa defiende por su dueño, no por el del sitio (P1): la neutral, por
      // nadie; la que ocupa un sitio ajeno, por quien la dejó.
      defender = laGuarnicion(state, foe.site)?.dueño ?? null;
      break;
  }
  // Un grupo de asaltantes no es de nadie: cuando embosca, el atacante es
  // `null` igual que un monstruo cuando defiende.
  const attacker =
    pending.attacker.kind === 'hero' ? heroById(state, pending.attacker.heroId).owner : null;
  return { attacker, defender };
}

/**
 * Qué bandos de una batalla lleva alguno de `jugadores`. Vacío: no va con ellos.
 *
 * Es el compañero que le faltaba a `battleOwners`, y faltaba de verdad: el
 * director y la consulta `battle_state` derivaban esto cada uno por su cuenta y
 * **ya no coincidían** cuando un jugador llevaba los dos bandos —uno devolvía
 * los dos y el otro se quedaba con `attacker` por ser el primero del array—. Ese
 * caso existe desde que `agentPlayers` acepta varios jugadores.
 */
export function sidesOwnedBy(
  state: GameState,
  pending: PendingBattle,
  jugadores: Iterable<PlayerId>,
): ReadonlySet<Side> {
  const suyos = new Set(jugadores);
  const dueños = battleOwners(state, pending);
  const bandos = new Set<Side>();
  for (const bando of SIDES) {
    const dueño = dueños[bando];
    if (dueño !== null && suyos.has(dueño)) bandos.add(bando);
  }
  return bandos;
}

/**
 * Los jugadores que no lleva la IA de reglas (`Player.controller`: la persona y
 * el agente). Por sus bandos pelea la IA cuando le toca resolver, pero no se
 * rinde: rendirse les cuesta oro y esa decisión es solo de su dueño.
 */
export function sinLaIA(state: GameState): ReadonlySet<PlayerId> {
  return new Set(state.players.filter((p) => p.controller !== 'ai').map((p) => p.id));
}
