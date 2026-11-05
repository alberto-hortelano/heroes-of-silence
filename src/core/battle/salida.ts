/**
 * **La salida de cada bando**: en qué casillas empieza la tropa de un bando y si
 * caben. Las tres columnas de su borde (`COLUMNAS_DE_SALIDA`), columna a columna
 * desde el borde y cada columna del centro hacia fuera, saltándose los muros.
 *
 * Vive aparte de `battle.ts` (simplify de la fase 2 del puesto fronterizo,
 * 04-11-2026) porque la pregunta la hacen dos: el despliegue de toda batalla
 * (`battle.ts`) y la regla de la muralla del mapa (`murallaDelMapaBlocker`, en
 * `muralla.ts`), que exige que quepa un bando entero tras ella. Con la salida en
 * `battle.ts`, aquella regla vivía allí y `state/sitios.ts` importaba las 4 000
 * líneas de la batalla para juzgar un JSON.
 *
 * Depende solo de `board.ts`: los muros le llegan como conjunto de claves
 * (`casillasDeMuro`), no como muralla, para que `muralla.ts` pueda importarla sin
 * un ciclo.
 */
import type { Hex } from '../types.js';
import { COLUMNAS_DE_SALIDA, espejo, hexKey } from './board.js';
import type { Side } from './types.js';

/** Las filas, del centro hacia fuera: el centro es lo primero que se llena. */
const DEL_CENTRO_A_FUERA: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/** Del marco del atacante, en el que se calcula la salida, al del tablero (el del defensor es `espejo`). */
export function enElMarco(side: Side, h: Hex): Hex {
  return side === 'attacker' ? h : espejo(h);
}

/**
 * Los huecos de salida de `side` para `cuantos`, en el marco del atacante: lo que
 * no es muro (`muros`, por `hexKey`, en el marco del tablero) de las columnas de
 * salida, en el orden en que se llenan; y si no caben, por qué.
 */
export function salidaDe(
  cuantos: number,
  side: Side,
  muros: ReadonlySet<string>,
): { readonly huecos: readonly Hex[]; readonly motivo: string | null } {
  const cerrada = (h: Hex): boolean => muros.has(hexKey(enElMarco(side, h)));
  const lado = side === 'attacker' ? 'la izquierda' : 'la derecha';
  const huecos: Hex[] = [];
  for (let col = 0; col < COLUMNAS_DE_SALIDA; col++) {
    for (const row of DEL_CENTRO_A_FUERA) {
      const h = { col, row };
      if (!cerrada(h)) huecos.push(h);
    }
  }
  const motivo =
    cuantos > huecos.length
      ? `la muralla deja ${unaOVarias(huecos.length, 'casilla')} de salida a ${lado} y ${haceFalta(cuantos)}`
      : null;
  return { huecos, motivo };
}

/** «1 casilla», «0 casillas», «3 casillas»: QA vio «deja 1 filas de salida» (M6). */
function unaOVarias(n: number, palabra: string): string {
  return `${n} ${palabra}${n === 1 ? '' : 's'}`;
}

function haceFalta(n: number): string {
  return `${n === 1 ? 'hace' : 'hacen'} falta ${n}`;
}
