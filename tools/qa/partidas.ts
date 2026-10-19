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
import { playAiTurn } from '../../src/core/ai/turn.js';
import { createBattle } from '../../src/core/battle/battle.js';
import { troopsAsStacks } from '../../src/core/hero/troop.js';
import { createRng } from '../../src/core/rng.js';
import type { GameOutcome, GameState } from '../../src/core/state/game.js';
import { newGame, startingArmy } from '../../src/core/state/setup.js';
import { FACTION_IDS, type FactionId } from '../../src/core/types.js';

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
 * El `await` no cambia ni una tirada: `playAiTurn` es asíncrona desde que el
 * director puede quedarse la batalla que nace a mitad del turno del rival, y
 * aquí no hay director. Por eso las semillas siguen dando lo mismo.
 *
 * `alAcabarTurno` es para el informe que tiene que mirar DURANTE la partida
 * —`veterania.ts` cuenta quién pisa su base, y al final el héroe puede haber
 * caído—. Es el mismo bucle que `playAiGame`, turno a turno; sin esto, ese
 * informe se copiaba el bucle y la semilla, que es lo que este fichero existe
 * para no tener copiado.
 */
export async function partidaDeSemilla(
  semilla: number,
  dias: number = DIAS_POR_DEFECTO,
  alAcabarTurno?: (state: GameState) => void,
): Promise<{ state: GameState; fin: GameOutcome }> {
  // El tope se pide al crear la partida y lo aplica `advanceDay` (`GameState.finished`).
  const state = newGame({ seed: semilla, maxDays: dias });
  const ctx = { rng: createRng(semilla) };
  while (state.finished === null) {
    await playAiTurn(state, ctx);
    alAcabarTurno?.(state);
  }
  // El desenlace se devuelve **ya estrechado**, en vez de dejar que cada informe
  // lo saque de `state.finished`, que es `| null` por tipo: era el mismo
  // `if (fin === null) throw` escrito en los dos, o sea justo el par de tripas
  // copiadas que este fichero existe para no tener.
  return { state, fin: state.finished };
}

/**
 * La batalla de una semilla: el ejército de salida de una facción contra el de la
 * siguiente, rotando por las cinco con la semilla (`FACTION_IDS`), resuelta por
 * la IA táctica.
 *
 * Va aparte de la partida porque una batalla resuelta ya no está en el
 * `GameState`, así que ni el barrido puede leerle las rondas ni el banco puede
 * cronometrar `legalActions` sin el ruido del mapa.
 */
export function batallaDeSemilla(semilla: number): BattleOutcome {
  const rng = createRng(semilla * PRIMO_DE_BATALLA);
  const n = FACTION_IDS.length;
  const a = FACTION_IDS[((semilla % n) + n) % n] as FactionId;
  const b = FACTION_IDS[(((semilla + 1) % n) + n) % n] as FactionId;
  const battle = createBattle(
    { army: troopsAsStacks(startingArmy(a, rng)), hero: null },
    { army: troopsAsStacks(startingArmy(b, rng)), hero: null },
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
