/**
 * El equipo fuera de batalla: por qué no se compra una pieza en la armería
 * (`buyBlocker`) ni se la pone o se la quita el héroe o uno de su tropa
 * (`equipBlocker`, `ponerseBlocker`, `unequipBlocker`); la mochila, que solo crece
 * por `aLaMochila`, y la hoja de servicios en blanco (`hojaNueva`). Las acciones que
 * los aplican, en `game.ts` (`applyAdventureAction`).
 *
 * Vivía en `game.ts` hasta la fase N de la reorganización (07-11-2026), que lo
 * repartió por lo que hace.
 */
import { nadaEnElHueco } from '../equipo/manos.js';
import { deDondeSale, pieza, piezaSiExiste, seVende } from '../equipo/pieza.js';
import { destinoDeEquipo, equipoDe, type Portador } from '../equipo/portador.js';
import { oroBlocker, type Town, tieneArmeria } from '../town/town.js';
import type { Hero, Hueco, PlayerId, Troop, Veterania } from '../types.js';
import {
  equipoDelPortadorBlocker,
  equipoDeSerieDe,
  equipoPuestoDe,
  unidadDelJuego,
} from '../unidad/catalogo.js';
import { heroeEnElPueblo, heroeSuyo, playerById } from './consultas.js';
import { ciudadQueMandaBlocker } from './sitios.js';
import type { AdventureAction, GameState } from './tipos.js';

/**
 * Echa a la mochila de `hero` las piezas `ids`, en ese orden; un `null` es «no
 * había nada» y se salta. **La única escritura de la mochila que añade**: la
 * usan el botín, la compra, lo que se quita al equipar o desequipar, lo que
 * devuelve la tropa licenciada y lo que trae el veterano que asciende. La
 * mochila se sustituye entera, nunca se muta.
 */
export function aLaMochila(hero: Hero, ...ids: readonly (string | null)[]): void {
  const nuevas = ids.filter((id) => id !== null);
  if (nuevas.length > 0) hero.mochila = [...hero.mochila, ...nuevas];
}

/**
 * Una hoja de servicios en blanco, con su id del contador de siempre. **La única
 * forma de abrir una**: la abren el novato que gana su primer punto
 * (`conVeterania`) y el que se equipa. Experiencia 0, así que sigue siendo de
 * nivel 1 y no cobra nada por tenerla; lo que cambia es que ahora es ALGUIEN.
 */
export function hojaNueva(state: GameState): Veterania {
  return {
    id: `veterano-${state.siguienteVeterano++}`,
    experiencia: 0,
    batallas: 0,
    bajas: 0,
    heroes: [],
  };
}

/**
 * Por qué `player` no puede comprar `item` en `town` ahora, o `null`. La frase es
 * para la persona —la enseña el panel del castillo— y para el agente, que la
 * recibe en su veredicto. En el orden en que se entiende: el pueblo, la armería,
 * quién recibe, qué se pide y con qué se paga.
 */
export function buyBlocker(
  state: GameState,
  town: Town,
  item: string,
  player: PlayerId,
): string | null {
  // Ocupada, la armería tampoco vende (P4: la ciudad entera deja de servir).
  const manda = ciudadQueMandaBlocker(state, town, player);
  if (manda !== null) return manda;
  if (!tieneArmeria(town)) return `${town.name} no tiene armería: constrúyela primero`;
  const hero = heroeEnElPueblo(state, town);
  if (hero === undefined) {
    return `no hay ningún héroe tuyo en ${town.name}: lo comprado va a su mochila`;
  }
  const pieza = piezaSiExiste(item);
  if (pieza === null) return `no existe ninguna pieza "${item}"`;
  if (!seVende(pieza)) {
    return `la armería no vende ${pieza.nombre}: ${deDondeSale(pieza)}`;
  }
  const sinOro = oroBlocker(pieza.precio, playerById(state, player).oro);
  return sinOro === null ? null : `${pieza.nombre}: ${sinOro}`;
}

/**
 * Por qué no se puede hacer ese `equip`, o `null`. Se equipa **en cualquier
 * sitio fuera de batalla** —el botín cae en el camino— y de la mochila del héroe
 * que se nombra, a él mismo o a un individuo de su tropa.
 */
export function equipBlocker(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'equip' }>,
): string | null {
  const hero = heroeSuyo(state, player, action.hero);
  if ('motivo' in hero) return hero.motivo;
  const pieza = piezaSiExiste(action.item);
  if (pieza === null) return `no existe ninguna pieza "${action.item}"`;
  if (!hero.mochila.includes(pieza.id)) {
    return `${hero.name} no lleva ${pieza.nombre} en la mochila`;
  }
  const quien = destinoDeEquipo(hero, action);
  if ('motivo' in quien) return quien.motivo;
  return ponerseBlocker(hero, quien, pieza.id, action.hueco);
}

/**
 * Por qué el portador `quien` de `hero` no se puede poner la pieza `id` (que
 * existe), o `null`: la pregunta de siempre sobre lo que llevaría puesto, el
 * equipo de serie de su unidad incluido (`equipoDelPortadorBlocker`: un mandoble
 * no entra con el escudo de serie). La leen `equipBlocker` y la IA, antes de
 * equipar y antes de comprar para alguien.
 */
export function ponerseBlocker(
  hero: Hero,
  quien: Portador,
  id: string,
  hueco?: Hueco,
): string | null {
  const en = hueco ?? pieza(id).hueco;
  const llevaria = equipoPuestoDe(hero, quien, { ...equipoDe(hero, quien), [en]: id });
  return equipoDelPortadorBlocker(
    nombreDelPortador(hero, quien),
    llevaria,
    id,
    equipoDeSerieDe(hero, quien),
    en,
  );
}

/** Cómo se nombra al portador `quien` de `hero` en un motivo: el héroe o la unidad. */
function nombreDelPortador(hero: Hero, quien: Portador): string {
  if ('heroe' in quien) return hero.name;
  const t = hero.army[quien.indice] as Troop;
  return `esa unidad de ${unidadDelJuego(t.creature).name}`;
}

/** Por qué no se puede hacer ese `unequip`, o `null`. */
export function unequipBlocker(
  state: GameState,
  player: PlayerId,
  action: Extract<AdventureAction, { type: 'unequip' }>,
): string | null {
  const hero = heroeSuyo(state, player, action.hero);
  if ('motivo' in hero) return hero.motivo;
  const quien = destinoDeEquipo(hero, action);
  if ('motivo' in quien) return quien.motivo;
  const nombre = nombreDelPortador(hero, quien);
  const { [action.slot]: quitada, ...resto } = equipoDe(hero, quien);
  if (quitada === undefined) return nadaEnElHueco(nombre, action.slot);
  // Sin arma no se combate (todo golpe cuerpo a cuerpo pasa por la rueda, que va
  // con la del arma; 19-10-2026): lo que quede puesto, con lo de serie de su
  // unidad, tiene que llevar una. Quitar la propia de una tropa deja la de serie.
  return equipoDelPortadorBlocker(nombre, equipoPuestoDe(hero, quien, resto), null);
}
