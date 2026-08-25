/**
 * El arnés que comparten los dos informes del núcleo.
 *
 * `banco.ts` y `barrido-semillas.ts` miden cosas distintas a propósito —el
 * barrido mide la IA (¿siguen terminando las partidas?), el banco mide el
 * código (¿tarda menos y sale lo mismo?)— pero lo hacían con las tripas
 * COPIADAS: la misma `createRng(semilla * 7919)`, el mismo emparejamiento de
 * facciones y el mismo bucle de partidas hasta la misma línea de salida.
 *
 * El coste no eran las veinticinco líneas repetidas. Era que el día que una de
 * las dos fórmulas cambiara, las dos herramientas medirían batallas distintas
 * **sin decirlo**, y lo que se rompe entonces es justo lo que el banco vende:
 * que su cifra es comparable entre pasadas.
 *
 * Mismo motivo que `politica.ts`, que existe exactamente por esto. Dos
 * informes, un arnés.
 *
 * Aquí no se imprime nada ni se mide el reloj: eso es de cada informe.
 */

import type { BattleOutcome } from '../../src/core/ai/tactics.js';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { playAiGame } from '../../src/core/ai/turn.js';
import { createBattle } from '../../src/core/battle/battle.js';
import { createRng } from '../../src/core/rng.js';
import type { GameState } from '../../src/core/state/game.js';
import { newGame, startingArmy } from '../../src/core/state/setup.js';

/** Días de tope: pasados estos, una partida que no ha acabado no acaba. */
export const DIAS_POR_DEFECTO = 300;

/**
 * Semillas y partidas de la tanda por defecto de cada informe.
 *
 * El banco juega 200 porque su sha256 tiene que cubrir suficientes desempates;
 * el barrido juega 40 porque lo que cuenta —cuántas no terminan— ya se ve ahí y
 * se corre a mano muchas veces.
 */
export const SEMILLAS_DEL_BANCO = 200;
export const SEMILLAS_DEL_BARRIDO = 40;

/**
 * De semilla de partida a semilla de batalla espejo.
 *
 * Un primo grande para que dos semillas consecutivas no den batallas parecidas.
 * Vive AQUÍ y en ningún otro sitio: era la línea que las dos herramientas
 * tenían copiada, y la que las habría separado en silencio.
 */
const PRIMO_DE_BATALLA = 7919;

/**
 * Juega entera la partida de una semilla, con la IA de reglas en los dos
 * bandos.
 *
 * El `await` no cambia ni una tirada: `playAiGame` es asíncrona desde que el
 * director puede quedarse la batalla que nace a mitad del turno del rival, y
 * aquí no hay director. Por eso las semillas siguen dando lo mismo.
 */
export async function partidaDeSemilla(
  semilla: number,
  dias: number = DIAS_POR_DEFECTO,
): Promise<GameState> {
  const state = newGame({ seed: semilla });
  await playAiGame(state, { rng: createRng(semilla) }, dias);
  return state;
}

/**
 * La batalla espejo de una semilla: el ejército de salida del caballero contra
 * el del nigromante, resuelta por la IA táctica.
 *
 * Va aparte de la partida porque una batalla resuelta ya no está en el
 * `GameState`, así que ni el barrido puede leerle las rondas ni el banco puede
 * cronometrar `legalActions` sin el ruido del mapa.
 */
export function batallaDeSemilla(semilla: number): BattleOutcome {
  const rng = createRng(semilla * PRIMO_DE_BATALLA);
  const battle = createBattle(
    { army: startingArmy('knight', rng), hero: null },
    { army: startingArmy('necromancer', rng), hero: null },
    rng,
  );
  return autoResolve(battle, rng);
}

/**
 * El recuento que cierra los dos informes: `0/200 → []`.
 *
 * Sin la etiqueta, porque el banco alinea sus cifras en columna y el barrido
 * no. Lo que tiene que salir igual en los dos es esto.
 */
export function resumenSinTerminar(sinTerminar: readonly number[], total: number): string {
  return `${sinTerminar.length}/${total} → [${sinTerminar.join(', ')}]`;
}
