/**
 * La complejidad del combate en la URL de la partida (22-10-2026): `?tropa=`,
 * `?rueda=` y `?solo-heroe=1`. **El único sitio que la lee y la escribe**: la
 * escriben «Nuevo juego» (`inicio/inicio.ts`), la partida al abrirse y la casilla
 * de la batalla (`main.ts`), y la leen `main.ts` y el menú (`combateParaElMenu`),
 * así que una recarga, un enlace o el menú abierto desde él juegan lo mismo. Qué vale lo dice el núcleo (`parseTope`, `parseRueda`); aquí
 * solo se lee y se escribe la barra. Pequeño a propósito, junto a `semilla.ts`:
 * no importa nada del cliente.
 */
import type { TiposDeLaRueda } from '@core/battle/formas-de-la-rueda.js';
import { combateCon, parseRueda, parseTope, type ReglasDelCombate } from '@core/combate.js';
import { unaVezEnLaURL } from '@core/validar.js';

/** Los parámetros de la URL que la llevan. */
export type ParametroDelCombate = 'tropa' | 'rueda' | 'solo-heroe';

/** Lo que pide una URL: `null` en lo que no pide (el de siempre). */
export interface CombateDeLaURL {
  readonly tope: number | null;
  readonly rueda: TiposDeLaRueda | null;
  readonly soloHeroe: boolean;
}

/**
 * Lo que pide la query `search`. Cada parámetro, con la regla de `?seed=`: vacío es
 * no pedir, repetido o lo que no vale lanza diciendo qué vale. Lo que lanza se le
 * pasa a `alFallar` con su parámetro (la partida dice cada uno con su salida) y
 * queda como no pedido.
 */
export function combateDeLaURL(
  search: string,
  alFallar: (parametro: ParametroDelCombate, motivo: unknown) => void,
): CombateDeLaURL {
  const q = new URLSearchParams(search);
  const leer = <T>(
    parametro: ParametroDelCombate,
    leerlo: (texto: string | null) => T,
  ): T | null => {
    try {
      return leerlo(unaVezEnLaURL(q.getAll(parametro), parametro));
    } catch (motivo) {
      alFallar(parametro, motivo);
      return null;
    }
  };
  return {
    tope: leer('tropa', parseTope),
    rueda: leer('rueda', parseRueda),
    soloHeroe: leer('solo-heroe', soloHeroeDe) ?? false,
  };
}

/** `?solo-heroe=`: sin él, o vacío, no; con `1`, sí; lo demás lanza diciendo qué vale. */
function soloHeroeDe(valor: string | null): boolean {
  if (valor === null || valor.trim() === '') return false;
  if (valor.trim() !== '1') {
    throw new Error(`«${valor}» no vale para «Solo la rueda del héroe»: pon 1 o quítalo`);
  }
  return true;
}

/**
 * Escribe en `url` la complejidad con que se juega: siempre el tope y la rueda
 * (también la de siempre, para que la URL reproduzca la partida entera), y
 * `solo-heroe` solo si se lleva solo la rueda del héroe.
 */
export function combateALaURL(url: URL, combate: ReglasDelCombate, soloHeroe: boolean): void {
  url.searchParams.set('tropa', String(combate.tope));
  url.searchParams.set('rueda', String(combate.rueda));
  if (soloHeroe) url.searchParams.set('solo-heroe', '1');
  else url.searchParams.delete('solo-heroe');
}

/**
 * Con qué arranca «Nuevo juego» lo que pide la query `search`: la complejidad y la
 * casilla, la de siempre en lo que no pide. Así «Nuevo juego» y «Partida rápida»
 * juegan lo mismo con `?tropa=3&rueda=5&solo-heroe=1` y sin semilla (QA de la
 * complejidad, vuelta 1: «Nuevo juego» enseñaba 7 / 7 y pisaba la URL, y la rápida
 * la conservaba). `null` si algo no vale: entonces no se pregunta y la partida
 * dice por qué, con su salida, como con `?seed=` (`main.ts`).
 */
export function combateParaElMenu(
  search: string,
): { readonly combate: ReglasDelCombate; readonly soloHeroe: boolean } | null {
  let vale = true;
  // Lo que no vale lo dice la partida al arrancar: aquí solo se sabe que lo hay.
  const pedido = combateDeLaURL(search, () => {
    vale = false;
  });
  if (!vale) return null;
  return { combate: combateCon(pedido.tope, pedido.rueda), soloHeroe: pedido.soloHeroe };
}
