/**
 * Cómo acabó una partida **para quien la mira**, y por qué, en un solo sitio.
 *
 * Lo preguntan tres: la barra y el lateral del cliente, la crónica (también la
 * del espectador) y la nota de fin que recibe el agente (#123). Antes la
 * respuesta estaba escrita tres veces —un ternario en `notas.ts`, la búsqueda
 * de la causa en `game.ts` y `desenlaceDe` en el cliente—, y la de la nota no
 * sabía contestar «ajena» más que con su propio `tuyos.size === 0`.
 *
 * Vive en su propio módulo, y solo con `import type` de la partida, por el
 * espectador: la crónica la pinta también quien solo mira, y arrastrar
 * `game.ts` a su paquete sería cruzar la frontera que el espectador existe para
 * no cruzar.
 */
import type { PlayerId } from '../types.js';
import type { DefeatReason } from './events.js';
import type { GameState } from './game.js';

export type Desenlace = 'ganada' | 'perdida' | 'sin resolver' | 'ajena';

/**
 * `winner` es el `finished.winner` del núcleo, o el `actor` de un `game_over`,
 * que es el mismo dato: `finishGame` sella el evento con el ganador. `quienes`
 * son los jugadores que lleva quien mira; vacío, no lleva a nadie.
 *
 * Son **cuatro** respuestas y no dos, y la trampa es que `tsc` no caza las que
 * faltan: `winner === viewer` con un `null` delante es `false`, así que un
 * ternario de dos contesta «has perdido» a un empate por días, y a quien mira
 * sin bando —el espectador— le pintaba «Fin de la partida» en el rojo de
 * derrota en la misma pantalla que decía «has ganado».
 *
 * El orden de las dos primeras preguntas importa: una partida sin resolver lo
 * está **para todos**, también para quien no lleva bando, así que `sin
 * resolver` gana a `ajena`. Al revés, el espectador dejaría de enterarse de que
 * nadie ganó.
 */
export function desenlaceDe(winner: PlayerId | null, quienes: ReadonlySet<PlayerId>): Desenlace {
  return winner === null ? 'sin resolver' : conGanador(winner, quienes);
}

function conGanador(
  winner: PlayerId,
  quienes: ReadonlySet<PlayerId>,
): Exclude<Desenlace, 'sin resolver'> {
  if (quienes.size === 0) return 'ajena';
  return quienes.has(winner) ? 'ganada' : 'perdida';
}

/**
 * El final entero: el desenlace, y —si alguien ganó— quién y por qué. Con
 * ganador la causa siempre está, y el tipo lo dice, así que quien indexa una
 * tabla por `causa` y `desenlace` no necesita ni un `!` ni un ternario.
 */
export type FinDePartida =
  | { readonly desenlace: 'sin resolver'; readonly ganador: null; readonly causa: null }
  | {
      readonly desenlace: Exclude<Desenlace, 'sin resolver'>;
      readonly ganador: PlayerId;
      readonly causa: DefeatReason;
    };

/**
 * Cómo acabó la partida para `quienes`, o `null` si sigue viva. La causa la
 * decide `checkDefeat` y la sella en el `player_defeated`: aquí solo se busca,
 * no se deduce del mapa. Si `quienes` perdió, la suya; si ganó —o no lleva a
 * nadie—, la del último eliminado.
 *
 * Una partida con ganador y sin ningún `player_defeated` es una partida rota,
 * y se dice.
 */
export function finDePartida(
  state: GameState,
  quienes: ReadonlySet<PlayerId>,
): FinDePartida | null {
  const fin = state.finished;
  if (fin === null) return null;
  if (fin.winner === null) return { desenlace: 'sin resolver', ganador: null, causa: null };
  const desenlace = conGanador(fin.winner, quienes);
  let causa: DefeatReason | null = null;
  for (const e of state.log) {
    if (e.kind !== 'player_defeated') continue;
    if (desenlace !== 'perdida' || (e.actor !== null && quienes.has(e.actor))) causa = e.reason;
  }
  if (causa === null) {
    throw new Error(
      `la partida la ganó el jugador ${fin.winner} y la crónica no dice quién quedó eliminado ni por qué`,
    );
  }
  return { desenlace, ganador: fin.winner, causa };
}
