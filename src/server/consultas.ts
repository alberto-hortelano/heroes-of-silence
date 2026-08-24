/**
 * Las consultas que el agente puede hacer fuera de turno.
 *
 * Están aquí y no dentro de `ws-server.ts` porque ese módulo abre dos puertos
 * en cuanto se importa: la única forma de probar que un agente que DEFIENDE ve
 * su batalla con sus ojos era sacarlas de allí. `ws-server.ts` se queda con el
 * cableado, que es lo que no se puede probar de todos modos.
 */
import { serializeAdventureTurn, serializeBattleTurn } from '@core/contract/serialize.js';
import { type GameState, sidesOwnedBy } from '@core/state/game.js';

export function responderConsulta(
  state: GameState,
  what: string,
  args: Record<string, unknown>,
): unknown {
  switch (what) {
    case 'game_state': {
      const player = Number(args.player ?? 1);
      return serializeAdventureTurn(state, player);
    }

    case 'battle_state': {
      const pending = state.pendingBattle;
      if (pending === null) return { battle: null, note: 'ahora mismo no hay ninguna batalla' };
      const player = Number(args.player ?? 1);
      // El bando sale del dueño y lo deriva el núcleo, no una constante ni una
      // copia de la regla. Cuando esto decía 'attacker' pasara lo que pasara,
      // un agente que defendía veía su batalla del revés: sus stacks marcados
      // como del enemigo.
      const suyos = sidesOwnedBy(state, pending, [player]);
      if (suyos.size === 0) {
        // Ni mentirle ni negarle la vista: se le enseña la del atacante y se le
        // dice que no es la suya.
        return {
          ...(serializeBattleTurn(pending.battle, 'attacker') as object),
          note: `el jugador ${player} no está en esta batalla: la ves con los ojos del atacante`,
        };
      }
      // Llevar los DOS bandos es posible —`agentPlayers` acepta varios
      // jugadores—, y una vista tiene un solo punto de vista: se elige el del
      // atacante y se dice, en vez de callarse cuál de los dos se está viendo.
      const vista = serializeBattleTurn(
        pending.battle,
        suyos.has('attacker') ? 'attacker' : 'defender',
      );
      if (suyos.size === 1) return vista;
      return {
        ...(vista as object),
        note: `el jugador ${player} lleva los dos bandos de esta batalla: la ves con los ojos del atacante`,
      };
    }

    case 'map': {
      return {
        width: state.map.width,
        height: state.map.height,
        terrain: state.map.terrain,
        roads: [...state.map.roads],
        objects: state.map.objects,
      };
    }

    default:
      throw new Error(`consulta desconocida: "${what}"`);
  }
}
