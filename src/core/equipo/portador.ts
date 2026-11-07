/**
 * A quién de un héroe se le pone o se le quita una pieza (`Portador`): a él o a un
 * individuo de su tropa; cómo se nombra en una acción (`destinoDeEquipo` y sus dos
 * inversas, `pedidoDeEquipo` y `pedidoDelPuesto`), lo que lleva (`equipoDe`) y sus
 * campos con lo de uno de ellos cambiado (`conEquipoDe`); y su mochila
 * (`sacarDeLaMochila`).
 *
 * Era la sección «a quién» de `hero/equipo.ts`, repartido en `equipo/` en la fase N
 * de la reorganización (07-11-2026); qué es el equipo y dónde vive, en `vestir.ts`.
 */
import type { Equipo, Hero, Troop, Veterania } from '../types.js';

// ---------------------------------------------------------------- a quién

/** A quién de un héroe se le pone o se le quita una pieza: a él, o a un individuo de su tropa. */
export type Portador = { readonly heroe: true } | { readonly indice: number };

/**
 * Cómo se nombra a quién: nada es el héroe; `veteran`, un id de hoja; `creature`,
 * un novato de ese tipo; `puesto`, el individuo de ese puesto de la tropa (lo que
 * escribe la escena de la tropa, donde cada uno tiene su sitio; el contrato del
 * agente no lo lleva: su esquema no lo declara y zod lo quita).
 */
export interface DestinoPedido {
  readonly veteran?: string | undefined;
  readonly creature?: string | undefined;
  readonly puesto?: number | undefined;
}

/**
 * Por qué no hay nadie en el puesto `puesto` (0-based) de la tropa de `hero`, o
 * `null`. La leen `destinoDeEquipo` y `formarBlocker`.
 */
export function puestoBlocker(hero: Pick<Hero, 'name' | 'army'>, puesto: number): string | null {
  return Number.isInteger(puesto) && hero.army[puesto] !== undefined
    ? null
    : `${hero.name} no lleva a nadie en el puesto ${puesto} de su tropa`;
}

/**
 * A quién de `hero` va la pieza que se pide así, o por qué no hay nadie. **La
 * única lectura de `veteran` y `creature`**: la leen las acciones `equip` y
 * `unequip`, sus dos *blockers*, la IA —que comprueba que lo que pide le llega a
 * quien ella eligió— y el panel. Antes eran cuatro `findIndex` repartidos.
 *
 * Sin `veteran` ni `creature`, el héroe. Con `veteran`, el individuo de su tropa
 * con esa hoja. Con `creature`, **el primer novato sin hoja de ese tipo**: un
 * novato sin hoja es fungible —cuál de tres piqueros recibe la espada no
 * importa— y uno con hoja ya tiene nombre (su id) y se nombra con `veteran`. Con
 * `puesto`, el de ese puesto de la tropa, sea quien sea: la escena de la tropa
 * nombra al que se pulsó, y la pieza no se va a otro novato igual en otro sitio
 * del arco.
 */
export function destinoDeEquipo(
  hero: Pick<Hero, 'name' | 'army'>,
  pedido: DestinoPedido,
): Portador | { readonly motivo: string } {
  const { veteran, creature: especieId, puesto } = pedido;
  if (veteran !== undefined && especieId !== undefined) {
    return { motivo: 'di a quién se la pones con "veteran" o con "creature", no con los dos' };
  }
  if (puesto !== undefined) {
    if (veteran !== undefined || especieId !== undefined) {
      return { motivo: 'di a quién se la pones por su puesto o por su nombre, no por los dos' };
    }
    const sinNadie = puestoBlocker(hero, puesto);
    if (sinNadie !== null) return { motivo: sinNadie };
    return { indice: puesto };
  }
  if (veteran !== undefined) {
    const indice = hero.army.findIndex((t) => t.veterania?.id === veteran);
    if (indice < 0) {
      return { motivo: `${hero.name} no lleva a nadie con el id "${veteran}" en su tropa` };
    }
    return { indice };
  }
  if (especieId !== undefined) {
    // Sin el catálogo de unidades: lo importa a este módulo, y desde aquí sería un
    // ciclo que se cuelga al cargar. La unidad se nombra por su id, que es lo que
    // escribió quien pregunta.
    const indice = hero.army.findIndex(
      (t) => t.creature === especieId && t.veterania === undefined,
    );
    if (indice < 0) {
      // La pista de «veteran» solo si hay a quién nombrar con ella: sin ninguno
      // de ese tipo, sugerir un id es mandar a buscar a alguien que no está.
      const conId = hero.army.some((t) => t.creature === especieId && t.veterania !== undefined);
      return {
        motivo: conId
          ? `${hero.name} no lleva ninguna unidad «${especieId}» sin id: a uno que ya lo tiene —el que va en su propia fila— se le nombra con "veteran"`
          : `${hero.name} no lleva ninguna unidad «${especieId}» en su tropa`,
      };
    }
    return { indice };
  }
  return { heroe: true };
}

/** Cómo se nombra a un portador en una acción: lo que escribe `pedidoDeEquipo`, sin campos a `undefined`. */
export type PedidoDeEquipo =
  | Record<string, never>
  | { readonly veteran: string }
  | { readonly creature: string };

/**
 * **La inversa de `destinoDeEquipo`**: cómo se nombra en una acción `equip` o
 * `unequip` al portador `quien` de `hero`. El héroe, sin nada; el de hoja, por su
 * id; el novato, por su tipo —y entonces la pieza va al **primer** novato de ese
 * tipo, que no tiene por qué ser `quien`: son fungibles, y quien la pide lo sabe
 * preguntándole a `destinoDeEquipo`—. La lee la IA; la escena de la tropa nombra
 * por el puesto (`pedidoDelPuesto`).
 */
export function pedidoDeEquipo(hero: Pick<Hero, 'army'>, quien: Portador): PedidoDeEquipo {
  if ('heroe' in quien) return {};
  const t = individuo(hero, quien);
  return t.veterania !== undefined ? { veteran: t.veterania.id } : { creature: t.creature };
}

/**
 * **La inversa exacta de `destinoDeEquipo`** por el puesto: cómo se nombra a
 * `quien` para que la pieza le llegue a él y no a otro novato de su tipo
 * (`destinoDeEquipo(hero, pedidoDelPuesto(quien))` es `quien`). La lee la escena
 * de la tropa; la IA y el agente siguen nombrando por tipo (`pedidoDeEquipo`).
 */
export function pedidoDelPuesto(
  quien: Portador,
): Record<string, never> | { readonly puesto: number } {
  return 'heroe' in quien ? {} : { puesto: quien.indice };
}

/** Lo que lleva puesto el portador `quien` de `hero`. */
export function equipoDe(hero: Pick<Hero, 'equipo' | 'army'>, quien: Portador): Equipo {
  if ('heroe' in quien) return hero.equipo;
  return individuo(hero, quien).veterania?.equipo ?? {};
}

/**
 * Los campos de `hero` con `equipo` puesto en el portador `quien`, sin tocar el
 * héroe: quien llama los escribe (`vestir`, en `game.ts`), porque el estado guarda la
 * referencia del héroe. El equipo de un individuo vive en su hoja, así que a un
 * novato sin ella **se le abre** con `abrirHoja` —la da el estado, que lleva el
 * contador de ids—: deja de ser fungible al llevar algo.
 */
export function conEquipoDe(
  hero: Pick<Hero, 'equipo' | 'army'>,
  quien: Portador,
  equipo: Equipo,
  abrirHoja?: () => Veterania,
): Pick<Hero, 'equipo' | 'army'> {
  if ('heroe' in quien) return { equipo, army: hero.army };
  const t = individuo(hero, quien);
  let hoja = t.veterania;
  if (hoja === undefined) {
    if (abrirHoja === undefined) {
      throw new Error(
        `el ${t.creature} ${quien.indice} de la tropa no tiene hoja y nadie ha dicho cómo abrírsela`,
      );
    }
    hoja = abrirHoja();
  }
  const army = [...hero.army];
  army[quien.indice] = { ...t, veterania: { ...hoja, equipo } };
  return { equipo: hero.equipo, army };
}

function individuo(hero: Pick<Hero, 'army'>, quien: { readonly indice: number }): Troop {
  const t = hero.army[quien.indice];
  if (t === undefined) {
    throw new Error(`la tropa no tiene a nadie en el puesto ${quien.indice}`);
  }
  return t;
}

/** La mochila sin UNA copia de `id` (la primera). Lanza si no está. */
export function sacarDeLaMochila(mochila: readonly string[], id: string): string[] {
  const i = mochila.indexOf(id);
  if (i < 0) throw new Error(`la mochila no lleva "${id}"`);
  return [...mochila.slice(0, i), ...mochila.slice(i + 1)];
}
