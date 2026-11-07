/**
 * **La salida de cada bando**: en qué casillas puede empezar la tropa de un bando
 * y si cabe. Las columnas de su borde, columna a columna desde el borde y cada
 * columna del centro hacia fuera, saltándose los muros.
 *
 * Vive aparte de `battle.ts` (simplify de la fase 2 del puesto fronterizo,
 * 04-11-2026) porque la pregunta la hacen dos: el despliegue de toda batalla
 * (`despliegue.ts`: la zona de cada unidad, `zonaDeSalida`, con sus columnas) y
 * la regla de la muralla del mapa (`murallaDelMapaBlocker`, en `muralla.ts`), que
 * exige que quepa un bando entero tras ella. Con la salida en `battle.ts`, aquella
 * regla vivía allí y `state/sitios.ts` importaba las 4 000 líneas de la batalla
 * para juzgar un JSON; y con la fase de despliegue (02-11-2026, en `main`) la zona
 * se escribió otra vez en `despliegue.ts`: al fusionarlas (05-11-2026) queda una.
 *
 * Depende solo de `board.ts`: los muros le llegan como conjunto de claves
 * (`casillasDeMuro`), no como muralla, para que `muralla.ts` pueda importarla sin
 * un ciclo.
 */
import { conPlural } from '../texto.js';
import type { Hex } from '../types.js';
import { COLUMNAS_DE_SALIDA, espejo, hexKey, isInside } from './board.js';
import type { Side } from './types.js';

/** Las filas, del centro hacia fuera: el centro es lo primero que se llena. */
const DEL_CENTRO_A_FUERA: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/** Del marco del atacante, en el que se calcula la salida, al del tablero (el del defensor es `espejo`). */
export function enElMarco(side: Side, h: Hex): Hex {
  return side === 'attacker' ? h : espejo(h);
}

/**
 * La zona de salida de `columnas` columnas de `side`, en el marco del ATACANTE y
 * en el orden en que se llena: columna a columna desde el borde y cada columna
 * del centro hacia fuera. Sin los muros (`muros`, por `hexKey`, en el marco del
 * tablero).
 *
 * Toda unidad ocupa una casilla (13-10-2026: «todo el mundo un hexe»). **Una
 * puerta no se salta**: es el lado entre dos casillas, y sus dos casillas son
 * suelo para los dos bandos (`cierreDeLaMuralla`).
 */
export function zonaEnSuMarco(columnas: number, side: Side, muros: ReadonlySet<string>): Hex[] {
  const zona: Hex[] = [];
  for (let col = 0; col < columnas; col++) {
    for (const row of DEL_CENTRO_A_FUERA) {
      const h = { col, row };
      if (isInside(h) && !muros.has(hexKey(enElMarco(side, h)))) zona.push(h);
    }
  }
  return zona;
}

/**
 * Los huecos de salida de `side` para `cuantos` con las columnas de todos
 * (`COLUMNAS_DE_SALIDA`), en el marco del atacante y en el orden en que se
 * llenan; y si no caben, por qué. La frase es la misma que dice el despliegue
 * cuando no caben (`despliegue.ts`, `noCaben`).
 */
export function salidaDe(
  cuantos: number,
  side: Side,
  muros: ReadonlySet<string>,
): { readonly huecos: readonly Hex[]; readonly motivo: string | null } {
  const huecos = zonaEnSuMarco(COLUMNAS_DE_SALIDA, side, muros);
  const motivo = cuantos > huecos.length ? noCabenEnLaSalida(huecos.length, side, cuantos) : null;
  return { huecos, motivo };
}

/**
 * «la muralla deja 3 casillas de salida a la izquierda y hacen falta 7». La única
 * frase, que leen `salidaDe` y el despliegue (`noCaben`).
 */
export function noCabenEnLaSalida(huecos: number, side: Side, cuantos: number): string {
  const lado = side === 'attacker' ? 'la izquierda' : 'la derecha';
  return `la muralla deja ${conPlural(huecos, 'casilla')} de salida a ${lado} y ${haceFalta(cuantos)}`;
}

function haceFalta(n: number): string {
  return `${n === 1 ? 'hace' : 'hacen'} falta ${n}`;
}
