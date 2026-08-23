/**
 * Director de la partida.
 *
 * Decide quién juega cada turno: el agente conectado, o la IA heurística si no
 * hay agente o si su respuesta no sirve. Nunca deja la partida encallada por
 * culpa del agente.
 */
import { serializeAdventureTurn, serializeBattleTurn } from '@core/contract/serialize.js';
import { chooseBattleAction } from '@core/ai/tactics.js';
import { playAiTurn } from '@core/ai/turn.js';
import { activeStack, applyAction } from '@core/battle/battle.js';
import { createRng } from '@core/rng.js';
import {
  applyAdventureAction,
  currentPlayer,
  resolvePendingBattle,
  settleBattle,
  type AdventureAction,
  type GameContext,
  type GameState,
} from '@core/state/game.js';
import { newGame } from '@core/state/setup.js';
import type { PlayerId } from '@core/types.js';
import type { AgentLink } from './agent-link.js';

export interface DirectorOptions {
  readonly seed?: number;
  /** Jugadores cuyo turno decide el agente. */
  readonly agentPlayers?: readonly PlayerId[];
}

export interface TurnReport {
  readonly player: PlayerId;
  readonly by: 'agent' | 'heuristic';
  readonly actions: number;
  readonly problems: readonly string[];
}

export class Director {
  state: GameState;
  readonly ctx: GameContext;
  readonly agentPlayers: Set<PlayerId>;
  readonly log: string[] = [];

  constructor(
    private readonly link: AgentLink,
    options: DirectorOptions = {},
  ) {
    const seed = options.seed ?? 20260823;
    this.state = newGame({ seed });
    this.ctx = { rng: createRng(seed ^ 0xa9e7) };
    this.agentPlayers = new Set(options.agentPlayers ?? [1]);
  }

  get finished(): boolean {
    return this.state.finished !== null;
  }

  /** Juega el turno del jugador que toca. */
  async playTurn(): Promise<TurnReport> {
    const player = currentPlayer(this.state);
    const usaAgente = this.agentPlayers.has(player.id) && this.link.connected;

    if (!usaAgente) {
      playAiTurn(this.state, this.ctx);
      return { player: player.id, by: 'heuristic', actions: 0, problems: [] };
    }

    try {
      return await this.playAgentTurn(player.id);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.note(`El agente no pudo jugar el turno (${motivo}); toma el relevo la IA de reglas.`);
      // La partida no se detiene por un fallo del agente.
      if (this.state.pendingBattle !== null) resolvePendingBattle(this.state, this.ctx);
      playAiTurn(this.state, this.ctx);
      return { player: player.id, by: 'heuristic', actions: 0, problems: [motivo] };
    }
  }

  private async playAgentTurn(playerId: PlayerId): Promise<TurnReport> {
    const respuesta = await this.link.ask('adventure_turn', serializeAdventureTurn(this.state, playerId));
    if (respuesta.reasoning !== undefined) this.note(`Agente: ${respuesta.reasoning}`);

    const problems: string[] = [];
    let aplicadas = 0;

    for (const accion of respuesta.actions) {
      if (this.state.finished !== null) break;
      if (accion.type === 'end_turn') break;

      try {
        applyAdventureAction(this.state, accion as AdventureAction, this.ctx);
        aplicadas++;
      } catch (err) {
        // Una acción ilegal se descarta y se le cuenta al agente, tal y como
        // promete el contrato; las siguientes siguen aplicándose.
        problems.push(`${describe(accion)}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (this.state.pendingBattle !== null) {
        await this.playBattle(playerId);
      }
    }

    if (this.state.finished === null) {
      applyAdventureAction(this.state, { type: 'end_turn' }, this.ctx);
    }

    if (problems.length > 0) this.note(`Acciones rechazadas: ${problems.length}`);
    return { player: playerId, by: 'agent', actions: aplicadas, problems };
  }

  /** Juega la batalla pendiente: el agente lleva su bando, la IA el otro. */
  private async playBattle(playerId: PlayerId): Promise<void> {
    const pending = this.state.pendingBattle;
    if (pending === null) return;
    const battle = pending.battle;

    // El agente es siempre el atacante aquí: la batalla nace de su movimiento.
    const suBando = 'attacker' as const;
    let guard = 0;

    while (battle.finished === null && guard < 800) {
      guard++;
      const s = activeStack(battle);
      if (s === null) break;

      if (s.side !== suBando) {
        applyAction(battle, chooseBattleAction(battle), this.ctx.rng);
        continue;
      }

      let accion;
      try {
        const r = await this.link.ask('battle_turn', serializeBattleTurn(battle, suBando));
        accion = r.action;
      } catch (err) {
        this.note(
          `El agente falló en la batalla (${err instanceof Error ? err.message : String(err)}); la termina la IA.`,
        );
        break;
      }

      try {
        applyAction(battle, accion as never, this.ctx.rng);
      } catch (err) {
        this.note(`Acción de batalla rechazada: ${err instanceof Error ? err.message : String(err)}`);
        // Para no bloquear el turno, se resuelve con la heurística y se sigue.
        applyAction(battle, chooseBattleAction(battle), this.ctx.rng);
      }
    }

    if (battle.finished === null) {
      resolvePendingBattle(this.state, this.ctx);
    } else {
      settleBattle(this.state, this.ctx);
    }
  }

  private note(line: string): void {
    this.log.push(line);
    console.log(`[director] ${line}`);
  }
}

function describe(action: { type: string }): string {
  return action.type;
}
