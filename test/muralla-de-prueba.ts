/**
 * La muralla del tablero de batalla en los tests (`muralla-alta`, `-de-batalla`,
 * `-dentro-fuera`, `-gruesa` y `-puerta`): las formas de ejemplo de la arena, un
 * bando de uno, el duelo puesto a mano y lo que se compara de una lista de casillas
 * o de jugadas. Cada test llevaba su copia, y el duelo, cuatro firmas (fase T de la
 * reorganización, 06-11-2026).
 */

import { FORMAS_DE_EJEMPLO } from '../src/core/arena/murallas.js';
import { hexKey } from '../src/core/battle/board.js';
import { stackById } from '../src/core/battle/consultas.js';
import { type BattleSide, createBattle } from '../src/core/battle/montaje.js';
import type { BattleAction, BattleState, MurallaDeBatalla } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack, UnitInfo } from '../src/core/types.js';
import { aMano, bandoAMano, forzarTurno } from './batalla-de-prueba.js';
import { NO_MUERTO } from './comun.js';

/** La forma de ejemplo de la arena que se llama `nombre` (`FORMAS_DE_EJEMPLO`); lanza si no hay. */
export const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};

/** La columna 7 entera, y la misma con la puerta en (7,4). */
export const LINEA = forma('Línea recta');
export const CON_PUERTA = forma('Línea con puerta');

/** Una casilla del tablero. */
export const h = (col: number, row: number): Hex => ({ col, row });

/** Las claves de unas casillas, para comparar conjuntos. */
export const claves = (hexes: readonly Hex[]): Set<string> => new Set(hexes.map(hexKey));

/** Los tipos de unas jugadas, en su orden. */
export const tipos = (acciones: readonly BattleAction[]): string[] => acciones.map((a) => a.type);

/** Un bando con esa tropa y sin héroe. */
export const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });

/** Un volador (el vampiro): `flying`, que nadie del catálogo lleva. */
export const VAMPIRO = aMano(NO_MUERTO, { name: 'Vampiro', traits: ['undead', 'flying'] });

/** Un bando de uno: `cuantos` (3) de una unidad del catálogo, o uno hecho a mano. */
const deUno = (quien: string | UnitInfo, cuantos = 3): BattleSide =>
  typeof quien === 'string' ? lado([{ creature: quien, count: cuantos }]) : bandoAMano([quien]);

/** Les da escalera a los atacantes de esos puestos, como la casilla del montaje. */
export function conEscalera(state: BattleState, ...puestos: number[]): void {
  for (const i of puestos) stackById(state, `attacker-${i}`).escalera = true;
}

/** Quién pelea en un duelo y dónde: una unidad del catálogo o una hecha a mano, y su casilla. */
type EnSuCasilla = readonly [string | UnitInfo, Hex];

/**
 * Un duelo tras `muralla`, con cada uno donde diga el test y el turno de quien
 * diga (`attacker-0` si no): el atacante, `cuantos` (3) de una unidad del catálogo
 * o uno hecho a mano, y uno o varios defensores (`defender-0`, `defender-1`…, en
 * su orden), todos de un mismo bando. `escalera`: si el atacante la lleva. Las
 * casillas se ponen a mano, sin despliegue (tiene su propio test), y el azar es
 * siempre el de la semilla 3.
 */
export function duelo({
  muralla,
  atacante,
  defensores,
  turnoDe = 'attacker-0',
  escalera = false,
  cuantos = 3,
}: {
  readonly muralla: MurallaDeBatalla;
  readonly atacante: EnSuCasilla;
  readonly defensores: readonly EnSuCasilla[];
  readonly turnoDe?: string;
  readonly escalera?: boolean;
  readonly cuantos?: number;
}): BattleState {
  const [primero] = defensores;
  if (primero === undefined) throw new Error('un duelo lleva al menos un defensor');
  const quienes = defensores.map(([quien]) => quien);
  const delCatalogo = quienes.filter((q): q is string => typeof q === 'string');
  if (quienes.length > 1 && delCatalogo.length < quienes.length) {
    throw new Error('varios defensores van del catálogo: uno hecho a mano pelea solo');
  }
  const defensor =
    quienes.length === 1
      ? deUno(primero[0], cuantos)
      : lado(delCatalogo.map((creature) => ({ creature, count: cuantos })));
  const state = createBattle(
    deUno(atacante[0], cuantos),
    defensor,
    createRng(3),
    COMBATE_COMPLETO,
    muralla,
  );
  if (escalera) conEscalera(state, 0);
  stackById(state, 'attacker-0').hex = atacante[1];
  defensores.forEach(([, en], i) => {
    stackById(state, `defender-${i}`).hex = en;
  });
  forzarTurno(state, turnoDe);
  return state;
}
