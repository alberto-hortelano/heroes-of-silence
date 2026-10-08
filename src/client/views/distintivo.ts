/**
 * Cómo se llama una unidad en el campo de batalla cuando hay más de una igual.
 *
 * Siete «Piquero» en el mismo bando no se distinguían ni en el parte ni en «En
 * el campo» (#198): «Espera Piquero, del enemigo» no decía cuál. Lo que se le
 * añade es una letra, A, B, C…, que no se confunde con ninguna de las cifras que
 * rodean al nombre (efectivos, vida, daño, ronda) y cabe en la chapa del tablero.
 *
 * La letra sale del ORDEN de `battle.stacks` entre los del mismo bando y el
 * mismo nombre, contando también a los caídos: `createBattle` los mete por su
 * puesto y nadie los saca ni los reordena, así que la letra de una unidad no
 * cambia en toda la batalla, ni cuando cae una hermana. No se guarda en `core`
 * porque se deriva entera de lo que ya viaja: el espectador la saca igual de los
 * stacks que le llegan.
 *
 * Solo hay letra si hay homónimos: un héroe, un personaje (que no se repiten:
 * `personajesSinRepetir`) o una criatura sola se llaman como siempre.
 */
import type { BattleStack, BattleState } from '@core/battle/types.js';

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** «Piquero B», o «Piquero» si es el único Piquero de su bando. */
export function nombreEnElCampo(battle: BattleState, s: BattleStack): string {
  const iguales = battle.stacks.filter((x) => x.side === s.side && x.unit.name === s.unit.name);
  if (iguales.length === 1) return s.unit.name;
  // Por id y no por identidad: el tablero pinta a veces una copia del stack
  // (la jugada que aún se cuenta) y la letra tiene que ser la misma.
  const i = iguales.findIndex((x) => x.id === s.id);
  if (i < 0) {
    throw new Error(`no se puede nombrar a ${s.unit.name} (${s.id}): no está en esta batalla`);
  }
  const letra = LETRAS[i];
  // Un bando lleva 7 como mucho (`LIDERAZGO.maxPorBando`); 26 es la red.
  if (letra === undefined) {
    throw new Error(`no hay letra para el ${i + 1}.º ${s.unit.name} de un bando: pasan de 26`);
  }
  return `${s.unit.name} ${letra}`;
}
