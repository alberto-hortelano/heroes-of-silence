/**
 * Las consultas que el agente puede hacer fuera de turno.
 *
 * Están aquí y no dentro de `ws-server.ts` porque ese módulo abre dos puertos
 * en cuanto se importa: la única forma de probar que un agente que DEFIENDE ve
 * su batalla con sus ojos era sacarlas de allí. `ws-server.ts` se queda con el
 * cableado, que es lo que no se puede probar de todos modos.
 */
import {
  serializeAdventureTurn,
  serializeBattleTurn,
  serializeKnownMap,
} from '@core/contract/serialize.js';
import { type GameState, sidesOwnedBy } from '@core/state/game.js';
import type { PlayerId } from '@core/types.js';

/**
 * La partida vista por quien responde una consulta: el estado **y qué
 * jugadores lleva el agente**.
 *
 * Se toma por su FORMA y no como el tipo `Director` a propósito. Este módulo se
 * separó de `ws-server.ts` para poder probarlo sin abrir puertos, y depender
 * del director le devolvería media clase encima; un `Director` encaja aquí sin
 * que nadie importe a nadie, y un test puede preguntar con un objeto de dos
 * campos.
 */
export interface PartidaConsultable {
  readonly state: GameState;
  readonly agentPlayers: ReadonlySet<PlayerId>;
}

export function responderConsulta(
  partida: PartidaConsultable,
  what: string,
  args: Record<string, unknown>,
): unknown {
  const state = partida.state;
  switch (what) {
    case 'game_state': {
      const player = jugadorDelAgente(partida, args);
      return serializeAdventureTurn(state, player);
    }

    case 'battle_state': {
      // El candado va ANTES de la guarda de `pending`, y el orden es la regla
      // (#83). Al revés, `battle_state{player:0}` contestaba `ok=true` —con
      // `battle: null`— mientras `game_state{player:0}` y `map{player:0}` lo
      // rechazaban: el candado tapaba dos puertas de tres y la de al lado le
      // enseñaba al agente que preguntar por el rival es legal, hasta el día en
      // que hubiera una batalla en curso y dejara de serlo. Se comprueba de
      // quién se pregunta antes de mirar si hay algo que enseñar.
      const player = jugadorDelAgente(partida, args);
      const pending = state.pendingBattle;
      if (pending === null) return { battle: null, note: 'ahora mismo no hay ninguna batalla' };
      // El bando sale del dueño y lo deriva el núcleo, no una constante ni una
      // copia de la regla. Cuando esto decía 'attacker' pasara lo que pasara,
      // un agente que defendía veía su batalla del revés: sus stacks marcados
      // como del enemigo.
      const suyos = sidesOwnedBy(state, pending, [player]);
      if (suyos.size === 0) {
        // Ni mentirle ni negarle la vista: se le enseña la del atacante y se le
        // dice que no es la suya. Aquí sí vale, y en `game_state` no: esto pasa
        // con un jugador SUYO —una batalla entre el rival y un monstruo— y lo
        // que se le enseña es un campo de batalla, no el diario del rival.
        //
        // Lo que sí cambia es lo que va dentro: `'ajena'` quita el maná y el
        // libro de ese héroe, que **es el de otra persona** —el monstruo es
        // siempre el defensor, así que el atacante es siempre un jugador— y las
        // acciones legales, que son las de un stack que no manda quien pregunta.
        return {
          ...(serializeBattleTurn(pending.battle, 'attacker', 'ajena') as object),
          note: `el jugador ${player} no está en esta batalla: la ves con los ojos del atacante, sin su maná ni su libro de hechizos, y no juegas tú`,
        };
      }
      // Llevar los DOS bandos es posible —`agentPlayers` acepta varios
      // jugadores—, y una vista tiene un solo punto de vista: se elige el del
      // atacante y se dice, en vez de callarse cuál de los dos se está viendo.
      const vista = serializeBattleTurn(
        pending.battle,
        suyos.has('attacker') ? 'attacker' : 'defender',
        'propia',
      );
      if (suyos.size === 1) return vista;
      return {
        ...(vista as object),
        note: `el jugador ${player} lleva los dos bandos de esta batalla: la ves con los ojos del atacante`,
      };
    }

    case 'map': {
      // Pasa por la niebla y por el candado del jugador, como las otras dos
      // (#74). Devolvía `state.map` entero —terreno, caminos y objetos, el
      // medio mapa que este jugador no ha pisado incluido— y sin mirar
      // siquiera por quién se preguntaba: la puerta se tapia antes de
      // publicarla como tool, que es #33 y va aparte.
      const player = jugadorDelAgente(partida, args);
      return serializeKnownMap(state, player);
    }

    default:
      throw new Error(`consulta desconocida: "${what}"`);
  }
}

/**
 * Por qué jugador se pregunta, comprobado contra los que lleva el agente.
 *
 * Sin esta comprobación el parámetro `player` era la puerta de al lado de la
 * niebla, abierta de par en par y **anunciada en la tool**: `game_state` con el
 * jugador del rival devolvía su crónica entera, sus recursos, sus héroes y sus
 * castillos, y `battle_state` el maná y el libro de hechizos de su héroe. El
 * mismo día en que la crónica dejó de contarle el diario del rival por la
 * puerta principal.
 *
 * Y aquí NO vale el precedente de la batalla ajena —enseñarla con una nota—,
 * porque enseñarla *es* la fuga. Se rechaza; y como el agente solo puede
 * corregirse con lo que se le diga, el motivo **nombra los jugadores que sí
 * lleva** en vez de limitarse a negar.
 *
 * Se lanza, que es lo que hace la otra negativa de este módulo (`consulta
 * desconocida`): el canal ya tiene por dónde —`query_result` con `ok:false`
 * lleva el mensaje tal cual hasta el agente—, y una negativa devuelta como si
 * fuera un dato le enseña que un rechazo se parece a una respuesta.
 */
function jugadorDelAgente(partida: PartidaConsultable, args: Record<string, unknown>): PlayerId {
  // Ordenados, y no en el orden de iteración del `Set`: el motivo que lee el
  // agente tiene que ser el mismo en dos partidas iguales.
  const suyos = [...partida.agentPlayers].sort((a, b) => a - b);

  if (args.player === undefined || args.player === null) {
    // No pedir jugador es preguntar por el tuyo, y «el tuyo» es el primero que
    // lleva — no un 1 escrito a mano, que era mentira en cuanto el agente
    // llevaba al 0.
    if (suyos[0] === undefined) throw new Error(SIN_JUGADORES);
    return suyos[0];
  }

  const player = Number(args.player);
  if (!partida.agentPlayers.has(player)) {
    throw new Error(
      `no puedes consultar por el jugador ${String(args.player)}: no es tuyo. ${losQueLleva(suyos)}`,
    );
  }
  return player;
}

const SIN_JUGADORES =
  'este agente no lleva ningún jugador, así que no hay estado suyo que consultar';

function losQueLleva(suyos: readonly PlayerId[]): string {
  if (suyos.length === 0) return SIN_JUGADORES;
  if (suyos.length === 1) return `Llevas el jugador ${suyos[0]}: pregunta por ese.`;
  return `Llevas los jugadores ${suyos.join(', ')}: pregunta por uno de esos.`;
}
