/**
 * Director de la partida.
 *
 * Decide quién juega cada turno: el agente conectado, o la IA heurística si no
 * hay agente o si su respuesta no sirve. Nunca deja la partida encallada por
 * culpa del agente.
 */

import { chooseBattleAction } from '@core/ai/tactics.js';
import { type BattleTakeover, playAiTurn } from '@core/ai/turn.js';
import { activeStack, applyAction } from '@core/battle/battle.js';
import type { BattleAction } from '@core/battle/types.js';
import { serializeAdventureTurn, serializeBattleTurn } from '@core/contract/serialize.js';
import { createRng } from '@core/rng.js';
import {
  type AdventureAction,
  applyAdventureAction,
  currentPlayer,
  type GameContext,
  type GameState,
  resolvePendingBattle,
  settleBattle,
  sidesOwnedBy,
} from '@core/state/game.js';
import { newGame } from '@core/state/setup.js';
import type { PlayerId } from '@core/types.js';
import type { AgentLink } from './agent-link.js';
import {
  describeAccion,
  MOTIVO_PARTIDA_TERMINADA,
  MOTIVO_TRAS_END_TURN,
  notaAccionAceptada,
  notaAccionSustituida,
  notaTurnoAventura,
} from './notas.js';

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

  /**
   * La batalla que nazca a mitad del turno de otro, ofrecida al agente.
   *
   * Es lo que rompe el nudo de «el agente solo decide en la mitad de sus
   * batallas»: el turno del rival era una llamada atómica a `core` que cerraba
   * por dentro las batallas que provocaba. El tipo vive en `core` y la
   * implementación aquí, así que el núcleo sigue sin saber que existe un
   * director.
   */
  private readonly takeover: BattleTakeover = () => this.playBattle();

  /** Juega el turno del jugador que toca. */
  async playTurn(): Promise<TurnReport> {
    const player = currentPlayer(this.state);
    const usaAgente = this.agentPlayers.has(player.id) && this.link.connected;

    if (!usaAgente) {
      // Aunque el turno sea del rival, el agente puede tener que DEFENDER lo
      // que ese turno le eche encima.
      await playAiTurn(this.state, this.ctx, this.link.connected ? this.takeover : undefined);
      return { player: player.id, by: 'heuristic', actions: 0, problems: [] };
    }

    try {
      return await this.playAgentTurn(player.id);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.note(`El agente no pudo jugar el turno (${motivo}); toma el relevo la IA de reglas.`);
      // La partida no se detiene por un fallo del agente. Y sin takeover: si
      // acaba de fallar, no se le vuelve a preguntar dentro del mismo turno.
      if (this.state.pendingBattle !== null) resolvePendingBattle(this.state, this.ctx);
      await playAiTurn(this.state, this.ctx);
      return { player: player.id, by: 'heuristic', actions: 0, problems: [motivo] };
    }
  }

  private async playAgentTurn(playerId: PlayerId): Promise<TurnReport> {
    // El día se anota antes: `end_turn` puede pasar de día y la nota tiene que
    // hablar del turno que el agente acaba de jugar, no del siguiente.
    const dia = this.state.day;
    const respuesta = await this.link.ask(
      'adventure_turn',
      serializeAdventureTurn(this.state, playerId),
    );
    const plan = respuesta.data;
    if (plan.reasoning !== undefined) this.note(`Agente: ${plan.reasoning}`);

    const problems: string[] = [];
    let aplicadas = 0;

    /** Lo que ya no se va a intentar, contado una por una y con su motivo. */
    const descartar = (resto: readonly unknown[], motivo: string): void => {
      for (const a of resto) problems.push(`${describeAccion(a as AdventureAction)}: ${motivo}`);
    };

    for (const [i, accion] of plan.actions.entries()) {
      if (this.state.finished !== null) {
        descartar(plan.actions.slice(i), MOTIVO_PARTIDA_TERMINADA);
        break;
      }
      if (accion.type === 'end_turn') {
        // El `end_turn` sí se honra —el turno se cierra abajo—, así que cuenta
        // como aplicada. Lo que venía DETRÁS no se aplica y antes desaparecía en
        // silencio: `problems` volvía vacío y la nota decía «aplicado entero».
        aplicadas++;
        descartar(plan.actions.slice(i + 1), MOTIVO_TRAS_END_TURN);
        break;
      }

      try {
        applyAdventureAction(this.state, accion as AdventureAction, this.ctx, playerId);
        aplicadas++;
      } catch (err) {
        // Una acción ilegal se descarta y se le cuenta al agente, tal y como
        // promete el contrato; las siguientes siguen aplicándose.
        problems.push(
          `${describeAccion(accion as AdventureAction)}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      if (this.state.pendingBattle !== null) {
        await this.playBattle();
        // Si nadie la tomó, la cierra la IA: dejarla pendiente reventaría todas
        // las acciones que quedaran del turno con «hay una batalla pendiente».
        if (this.state.pendingBattle !== null) resolvePendingBattle(this.state, this.ctx);
      }
    }

    if (this.state.finished === null) {
      applyAdventureAction(this.state, { type: 'end_turn' }, this.ctx, playerId);
    }

    if (problems.length > 0) this.note(`Acciones rechazadas: ${problems.length}`);
    // El veredicto sale SIEMPRE, también cuando salió perfecto: un silencio es
    // ambiguo en un canal que puede perder mensajes.
    this.link.report(
      respuesta.requestId,
      true,
      problems.length > 0 ? problems : undefined,
      // Intentadas es exactamente lo que entró más lo que se rechazó: un
      // segundo contador que subir en el orden correcto dentro de un bucle con
      // `continue` miente el día que alguien meta un `break`.
      notaTurnoAventura(dia, aplicadas, aplicadas + problems.length, problems),
    );
    return { player: playerId, by: 'agent', actions: aplicadas, problems };
  }

  /**
   * Juega la batalla pendiente: el agente lleva los bandos que sean suyos y la
   * IA de reglas el resto. Con los dos bandos suyos se le pregunta por separado,
   * cada uno con su propio `battle_turn`.
   */
  private async playBattle(): Promise<void> {
    const pending = this.state.pendingBattle;
    if (pending === null) return;
    // Qué bandos son suyos lo dice el núcleo, que es donde vive `battleOwners`:
    // esto lo derivaba aquí y la consulta `battle_state` por su cuenta, y las
    // dos copias ya discrepaban con un jugador que llevara los dos bandos.
    const bandos = sidesOwnedBy(this.state, pending, this.agentPlayers);
    // No es asunto del agente: se devuelve sin cerrarla y la cierra quien la
    // abrió, que es el contrato del takeover.
    if (bandos.size === 0) return;

    const battle = pending.battle;
    let guard = 0;

    while (battle.finished === null && guard < 800) {
      guard++;
      const s = activeStack(battle);
      if (s === null) break;

      if (!bandos.has(s.side)) {
        applyAction(battle, chooseBattleAction(battle), this.ctx.rng);
        continue;
      }

      // El `catch` devuelve `null` en vez de asignar a un `let` sin tipo: así
      // `respuesta` queda tipada por lo que promete `ask` —el esquema zod de
      // `battle_turn`— en lugar de ser un `any` que se va ensanchando.
      const respuesta = await this.link
        .ask('battle_turn', serializeBattleTurn(battle, s.side))
        .catch((err: unknown) => {
          this.note(
            `El agente falló en la batalla (${err instanceof Error ? err.message : String(err)}); la termina la IA.`,
          );
          return null;
        });
      if (respuesta === null) break;

      const accion = respuesta.data.action as BattleAction;
      try {
        applyAction(battle, accion, this.ctx.rng);
        this.link.report(respuesta.requestId, true, undefined, notaAccionAceptada(s.id, accion));
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        this.note(`Acción de batalla rechazada: ${motivo}`);
        // Para no bloquear el turno se juega la de la heurística — y se MIDE lo
        // que cuesta antes de contárselo: un `cast` sustituto no consume el
        // turno del stack, gasta el maná del héroe. Suponerlo mentiría en una
        // de cada cuatro sustituciones.
        const sustituta = chooseBattleAction(battle);
        const heroe = battle.heroes[s.side];
        const manaAntes = heroe?.mana ?? 0;
        applyAction(battle, sustituta, this.ctx.rng);
        const manaGastado = manaAntes - (heroe?.mana ?? 0);
        // Si la sustituta remató, la promesa del `cast` —«se te volverá a pedir
        // acción para ella»— sería falsa: el bucle sale por `battle.finished` y
        // no hay más peticiones. También se mide, no se supone.
        this.link.report(
          respuesta.requestId,
          false,
          [motivo],
          notaAccionSustituida(
            s.id,
            motivo,
            sustituta,
            manaGastado,
            heroe?.name ?? null,
            battle.finished !== null,
          ),
        );
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
