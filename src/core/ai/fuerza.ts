/**
 * La fuerza de un ejército y la regla de cuándo se pelea con un neutral.
 *
 * Vivía dentro de `strategy.ts` y salió de ahí cuando la regla tuvo **tres
 * lectores**: la IA que decide si ataca a un monstruo, la IA que decide si
 * ataca a un asaltante, y el asaltante que decide si embosca a un héroe
 * (`state/asaltantes.ts`). Ese tercero lo llama `game.ts`, y `game.ts` no puede
 * importar `strategy.ts` —que importa `game.ts`— sin cerrar un ciclo. Este
 * módulo no importa el estado: solo el catálogo y la tropa.
 */
import type { GrupoDeTropa } from '../data.js';
import { type Hero, heroUnit } from '../hero/hero.js';
import { ejercitoDe, type Personajes, troopUnit } from '../hero/troop.js';
import type { Army, UnitInfo } from '../types.js';

/** Fuerza bruta de un individuo: lo que pega por lo que aguanta. */
export function unitPower(info: UnitInfo): number {
  return ((info.damage[0] + info.damage[1]) / 2) * info.hp;
}

/**
 * Fuerza bruta de un ejército. Pide los personajes porque un individuo puede
 * serlo, y sus cifras salen de su perfil y no del catálogo.
 */
export function armyPower(army: Army, characters: Personajes): number {
  let power = 0;
  for (const t of army) power += unitPower(troopUnit(t, characters));
  return power;
}

/**
 * La fuerza de un héroe con su tropa: lo que pesa su ejército **más su propio
 * cuerpo**, que desde la fase 1b pelea en el tablero.
 *
 * Es la única fuerza de héroe que mira la IA, y existe para que lo sea: sin el
 * cuerpo, un héroe recién vuelto a su base con el ejército vacío valía 0, no
 * perseguía a nadie y no atacaba nada — y la partida podía no acabar.
 */
export function fuerzaDe(hero: Hero, characters: Personajes): number {
  return armyPower(hero.army, characters) + unitPower(heroUnit(hero));
}

/**
 * La fuerza de un grupo neutral escrito en grupos de tropa —un asaltante, o los
 * que se proponen en un plan—: la misma medida que la de un héroe, sin cuerpo
 * porque no lo lleva.
 */
export function poderDe(grupo: { readonly troops: readonly GrupoDeTropa[] }): number {
  return armyPower(ejercitoDe(grupo.troops), undefined);
}

/**
 * Cuánto más fuerte hay que ser para meterse con un grupo **neutral**: un
 * monstruo quieto o un asaltante que patrulla.
 *
 * El 1,6 es el de siempre de los monstruos —«un prototipo que se suicida no se
 * puede probar»— y el asaltante lo usa **en las dos direcciones**: el héroe lo
 * ataca si le saca un 1,6, y él embosca al héroe si es él quien se lo saca. En
 * medio no pelea nadie, y por eso la regla no puede ser asimétrica: con dos
 * márgenes, uno de los dos huecos sería una batalla que la IA cree perdida y
 * el asaltante cree ganada, o al revés.
 */
export const MARGEN_CONTRA_NEUTRALES = 1.6;

/** Si `mia` le saca el margen a `suya`: **la** regla de «se cree capaz». */
export function ventajaClara(mia: number, suya: number): boolean {
  return mia > suya * MARGEN_CONTRA_NEUTRALES;
}
