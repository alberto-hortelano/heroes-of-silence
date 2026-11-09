/**
 * El stack recién puesto en el tablero (`stackNuevo`): lo comparten quien lo monta
 * (`createBattle`, `montaje.ts`) y quien lo levanta de un cadáver (`levantar`,
 * `battle.ts`). Aparte de los dos porque el motor no puede importar el montaje (el
 * montaje importa el despliegue, que importa el motor). Nace en /simplify de
 * «Levantar zombi» (09-11-2026).
 */

import type { UnitInfo } from '../types.js';
import { type Hex, hasTrait } from '../types.js';
import { quienNoEscala } from './asalto.js';
import type { BattleStack, OrigenDelStack, Side } from './types.js';

/** Un stack resuelto y todavía sin colocar: lo que `createBattle` empuja. */
export interface Entrada {
  readonly slot: number;
  readonly body: string;
  readonly unit: UnitInfo;
  readonly origen: OrigenDelStack;
  readonly count: number;
  /** Si lleva escalera (`StackDeBatalla.escalera`). */
  readonly escalera: boolean;
}

/**
 * El stack que pone en el tablero una entrada, en `hex`, con la moral `moral` de su
 * bando (un no-muerto, 0): **la única forma de un stack recién puesto**, la de quien
 * entra al montar (`createBattle`) y la de quien se levanta de un cadáver
 * (`levantar`, `battle.ts`). Hasta /simplify (09-11-2026) `levantar` copiaba el
 * literal entero, y un campo nuevo del stack habría nacido solo en uno de los dos.
 */
export function stackNuevo(e: Entrada, side: Side, hex: Hex, moral: number): BattleStack {
  return {
    id: e.origen.kind === 'heroe' ? `${side}-heroe` : `${side}-${e.slot}`,
    side,
    slot: e.slot,
    body: e.body,
    unit: e.unit,
    origen: e.origen,
    initialCount: e.count,
    count: e.count,
    topHp: e.unit.hp,
    hex,
    // La escalera solo va con quien puede ponerla: el defensor y el volador no
    // escalan (`quienNoEscala`).
    escalera: e.escalera && quienNoEscala(side, e.unit) === null,
    retaliated: false,
    acted: false,
    // Una regla para todos: la del bando, recortada una vez. Los no-muertos, a 0.
    morale: hasTrait(e.unit, 'undead') ? 0 : moral,
    effects: [],
    ganado: { experiencia: 0, bajas: 0, heroes: [] },
    apuntado: null,
    recargando: 0,
    granada: null,
    granadasLanzadas: 0,
    hechizoEnElAire: null,
  };
}
