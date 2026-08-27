/**
 * Las consultas que el agente puede hacer fuera de turno.
 *
 * Están aquí y no dentro de `ws-server.ts` porque ese módulo abre dos puertos
 * en cuanto se importa: la única forma de probar que un agente que DEFIENDE ve
 * su batalla con sus ojos era sacarlas de allí. `ws-server.ts` se queda con el
 * cableado, que es lo que no se puede probar de todos modos.
 */
import { activeStack } from '@core/battle/battle.js';
import type { BattleState, Side } from '@core/battle/types.js';
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
          note: `el jugador ${player} no está en esta batalla: la ves con los ojos del atacante, sin su maná, sin su libro de hechizos y sin "legalActions", porque ahí no juegas tú`,
        };
      }
      // Llevar los DOS bandos es posible —`agentPlayers` acepta varios
      // jugadores—, y una vista tiene un solo punto de vista: se elige el del
      // atacante y se dice, en vez de callarse cuál de los dos se está viendo.
      const mio = suyos.has('attacker') ? 'attacker' : 'defender';
      const vista = serializeBattleTurn(pending.battle, mio, 'propia') as object;
      if (suyos.size === 1) {
        // La ausencia que faltaba por explicar (#84). `legalActions` viaja solo
        // si el stack activo es del bando mirado, así que en TU propia batalla
        // desaparece cada vez que le toca al rival, y esta era la única de las
        // tres ramas del `case` que la devolvía callando.
        //
        // **Y hoy tampoco se alcanza jugando, que es más de lo que parece.** No
        // solo es que la petición empujada no falle nunca la condición
        // —`director.ts` llama con el bando del stack que decide—: es que
        // `playBattle` aplica las acciones del rival de forma síncrona, así que
        // entre dos `heroes_respond` no hay ventana en la que consultar y ver a
        // otro activo. Medido: 15 de 15 consultas con `legalActions` y ~325
        // sondeos sin una sola ausencia. Se escribe igual porque la alternativa
        // es que el día que aparezca la ventana —una batalla que el agente mire
        // sin jugarla, dos agentes, una pausa entre acciones— la ausencia vuelva
        // a ser muda; pero **no se cuente como cubierto lo que no se ejerce**.
        //
        // Si está o no se le pregunta al objeto YA serializado, y no se vuelve a
        // escribir aquí la condición de `serializeBattleTurn`: sería la tercera
        // declaración de la misma regla, con las dos libres de divergir sin que
        // nada se pusiera rojo.
        if ('legalActions' in vista) return vista;
        return { ...vista, note: sinAccionesLegales(pending.battle, mio, false) };
      }
      // Este caso no lo produce hoy ningún servidor publicado —`ws-server.ts`
      // fija `agentPlayers: [1]`—, así que llevar los dos bandos es alcanzable
      // en tests y no jugando. Se deja dicho aquí y no en la nota: al agente le
      // sería ruido, porque lo que necesita saber es qué está viendo, no cuántas
      // configuraciones del servidor existen.
      // La misma pregunta al objeto ya serializado que en la rama de arriba, y
      // por el mismo motivo: la nota dice lo que PASA y no lo que pasaría. La
      // primera redacción de esta rama explicaba la ausencia en hipotético
      // —«cuando viene, es la del atacante»— y era además una segunda escritura
      // a mano de la regla que la función de abajo ya redacta: dos textos libres
      // de divergir, y este sin un test que lo alcance.
      const cabecera = `el jugador ${player} lleva los dos bandos de esta batalla: la ves con los ojos del atacante`;
      if ('legalActions' in vista) {
        return { ...vista, note: `${cabecera}, y "legalActions" es la de una unidad suya.` };
      }
      return { ...vista, note: `${cabecera}. ${sinAccionesLegales(pending.battle, mio, true)}` };
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

/**
 * Por qué tu propia batalla viene sin `legalActions`.
 *
 * La lista es la del **stack activo, sea de quien sea**, y sus entradas `cast`
 * enumeran el libro y el maná de ese héroe: por eso no se manda cuando el turno
 * lo tiene el rival (#73). Lo que faltaba era decirlo. Un agente que ve
 * desaparecer un campo sin explicación no distingue «no te toca» de «esta
 * consulta se ha roto», y esta casa ya decidió que un silencio no vale como
 * respuesta.
 *
 * De quién es el turno se lo pregunta al núcleo con la misma función que usa el
 * serializador, no a una copia de la regla; y si no hay nadie activo se dice
 * eso, sin inventarse un bando que no existe.
 *
 * `ambos` distingue los dos motivos, porque **no son el mismo** y decir el que
 * no es sería peor que callarse: con un bando tuyo la lista falta porque no te
 * toca; con los dos, el turno también es tuyo y lo que falta es punto de vista
 * —una vista tiene uno solo, y es el del atacante—.
 */
function sinAccionesLegales(battle: BattleState, mirado: Side, ambos: boolean): string {
  const activo = activeStack(battle);
  if (activo === null) {
    return `esta batalla no viene con "legalActions" porque ahora mismo ninguna unidad tiene el turno. La ves con los ojos del ${mirado}: espera a que el servidor te pida "battle_turn".`;
  }
  if (ambos) {
    return `No viene "legalActions" porque el turno lo tiene una unidad del bando ${activo.side} —que también es tuyo— y la lista es siempre la del stack activo, o sea que no es la del ${mirado} que estás mirando. El servidor te pedirá "battle_turn" cuando le toque decidir a esa unidad.`;
  }
  return `esta batalla no viene con "legalActions" porque el turno lo tiene una unidad del bando ${activo.side} y tú llevas el ${mirado}: la lista es siempre la del stack activo, o sea que sería la suya. No es que no puedas hacer nada, es que ahora no te toca: cuando le toque a una unidad tuya, el servidor te pedirá "battle_turn" con la lista ya hecha. Volver a consultar más tarde también la trae.`;
}

const SIN_JUGADORES =
  'este agente no lleva ningún jugador, así que no hay estado suyo que consultar';

function losQueLleva(suyos: readonly PlayerId[]): string {
  if (suyos.length === 0) return SIN_JUGADORES;
  if (suyos.length === 1) return `Llevas el jugador ${suyos[0]}: pregunta por ese.`;
  return `Llevas los jugadores ${suyos.join(', ')}: pregunta por uno de esos.`;
}
