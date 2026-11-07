/**
 * Lo que se pregunta a una partida sin cambiarla: el día y la semana, quién juega,
 * de quién es cada héroe y cada ciudad, a dónde va un recluta y si es tu turno.
 *
 * Vivía en `game.ts`, que la usa, y la regla de un lugar (`mundo/reglas.ts`)
 * pregunta de quién es el turno: con las dos en el mismo fichero, `game.ts` y
 * `mundo/reglas.ts` se importaban el uno al otro, un ciclo de importación en
 * ejecución (fase N de la reorganización, 07-11-2026).
 */

import type { Hero } from '../hero/hero.js';
import { armyLeadership, capacidadDe, troopBlocker, troopRoom } from '../hero/troop.js';
import { pointKey } from '../map/map.js';
import { recruitBlocker, recruitCost, type Town } from '../town/town.js';
import type { Army, PlayerId } from '../types.js';
import { unidadDelJuego } from '../unidad/catalogo.js';
import { cupoDeLaGuarnicion, dueñoDeLaCiudad, guarnicionDe, sitioDeLaCiudad } from './sitios.js';
import { type GameState, MAX_HEROES_PER_PLAYER, type Player } from './tipos.js';

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
 * ninguno (o el pueblo no tiene dueño). **Una regla con dos lectores**: a quién
 * va un recluta (`destinoDeRecluta`) y de qué tropa salen los veteranos de la
 * base (`veteranosEnSuBase`). Escrita en cada uno, el día que cambie —un héroe
 * de al lado que también cuente, por ejemplo— el veterano que el narrador ve en
 * la base no sería el que se puede reclutar con.
 */
export function heroeEnElPueblo(state: GameState, town: Town): Hero | undefined {
  const dueño = dueñoDeLaCiudad(state, town);
  if (dueño === null) return undefined;
  return heroesOf(state, dueño).find((h) => pointKey(h.at) === pointKey(town.at));
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
