/**
 * El mapa lo diseña el agente, y la partida empieza igual si no lo diseña.
 *
 * `map_generate` es una de las tres promesas que abre `CLAUDE.md` —«los mapas
 * los diseña ese mismo agente»— y llevaba desde el primer día con el esquema
 * escrito, `validateMapPlan` y `buildMap` probados, `serializeMapRequest`
 * serializando… y **ningún llamante**. Este módulo es el llamante.
 *
 * Vive aparte de `ws-server.ts` por el mismo motivo que `consultas.ts`: aquel
 * módulo abre dos puertos en cuanto se importa y no se puede probar, así que se
 * queda con el cableado y lo que tiene reglas sale aquí, donde un test lo
 * alcanza con un agente de mentira.
 *
 * **No hay reintento.** Un plan que no llega, que llega tarde o que no se puede
 * jugar se descarta con su motivo y se sigue con el generador procedimental,
 * exactamente como una acción de aventura ilegal. Insistir dejaría la partida
 * sin empezar a merced de un agente que no acierta.
 */

import type { MapGenerateResponse } from '@core/contract/agent.js';
import { serializeMapRequest } from '@core/contract/serialize.js';
import { type MapPlan, validateMapPlan } from '@core/map/generate.js';
import type { PlayerId } from '@core/types.js';
import type { AgentAnswer, AgentLink } from './agent-link.js';
import { notaMapaAceptado, notaMapaRechazado } from './notas.js';

export interface PeticionDeMapa {
  readonly width: number;
  readonly height: number;
  /** Los jugadores de la partida: exactamente los inicios que debe traer. */
  readonly players: readonly PlayerId[];
}

export interface MapaDelAgente {
  /** El plan si sirve; `null` si no hay agente, no contestó o no era jugable. */
  readonly plan: MapPlan | null;
  /** De dónde salió el mapa, o por qué no salió de él. Lo lee una persona. */
  readonly motivo: string;
}

export async function pedirMapaAlAgente(
  link: AgentLink,
  peticion: PeticionDeMapa,
): Promise<MapaDelAgente> {
  // Sin agente atado, `ask` lanzaría en el acto: se dice antes y con las
  // palabras de una persona, que es quien va a leer la consola del servidor.
  if (!link.connected) return { plan: null, motivo: 'no hay ningún agente conectado' };

  // El tipo se escribe y no se infiere porque el `try` solo abraza al `ask`:
  // meter dentro la validación y el `report` convertiría un fallo de los
  // nuestros en un «no llegó tu respuesta», que es mentirle al agente sobre lo
  // que pasó. Es además el primer uso de `MapGenerateResponse`.
  let respuesta: AgentAnswer<MapGenerateResponse>;
  try {
    respuesta = await link.ask(
      'map_generate',
      serializeMapRequest({
        width: peticion.width,
        height: peticion.height,
        players: peticion.players.length,
      }),
    );
  } catch (err) {
    // Al agente ya se lo ha dicho `ask`: el plazo agotado y la respuesta que no
    // valida llevan su nota, y desde este ciclo esa nota ya no le promete que
    // «ese turno lo juega la IA de reglas», que para un mapa era falso. Aquí
    // solo queda contarlo en la consola.
    return { plan: null, motivo: err instanceof Error ? err.message : String(err) };
  }

  const plan = respuesta.data.plan;
  const problemas = [...validateMapPlan(plan), ...jugadoresCambiados(plan, peticion.players)];
  if (problemas.length > 0) {
    link.report(respuesta.requestId, false, problemas, notaMapaRechazado(problemas));
    return { plan: null, motivo: `el plan del agente no es jugable: ${problemas.join('; ')}` };
  }

  link.report(
    respuesta.requestId,
    true,
    undefined,
    notaMapaAceptado(plan.width, plan.height, plan.towns.length),
  );
  return { plan, motivo: `${plan.width}×${plan.height}, ${plan.towns.length} pueblos` };
}

/**
 * Que los inicios del plan sean EXACTAMENTE los jugadores que se pidieron.
 *
 * Lo comprueba el servidor y no `core`, y no es capricho de dónde ponerlo:
 * `validateMapPlan` mira que un plan sea **jugable** —dos pueblos, nadie
 * aislado, un inicio por jugador— y no puede saber CUÁLES son los jugadores,
 * porque eso lo sabe quien pidió el mapa. Un plan con los jugadores 3 y 4 es
 * perfectamente jugable y deja al agente sin un solo turno: `agentPlayers.has`
 * no se cumple nunca, todos los informes dicen «reglas» y no se rompe nada. Ese
 * silencio es justo el que hay que cerrar.
 *
 * `serializeMapRequest` le dice al agente **cuántos** jugadores hay, no cuáles;
 * el día que el payload lleve los ids, esta comprobación se muere sola.
 */
function jugadoresCambiados(plan: MapPlan, esperados: readonly PlayerId[]): string[] {
  const problemas: string[] = [];
  const trae = new Set(plan.heroStarts.map((h) => h.player));
  const lista = esperados.join(', ');

  for (const p of esperados) {
    if (!trae.has(p)) {
      problemas.push(
        `falta la posición de inicio del jugador ${p}: esta partida la juegan los jugadores ${lista}, y "heroStarts" tiene que traerlos todos`,
      );
    }
  }
  // Ordenado, y no en el orden del `Set`: el motivo que lee el agente tiene que
  // ser el mismo en dos partidas iguales.
  for (const p of [...trae].sort((a, b) => a - b)) {
    if (!esperados.includes(p)) {
      problemas.push(
        `el jugador ${p} no juega esta partida: los jugadores son ${lista}, numerados desde 0`,
      );
    }
  }
  return problemas;
}
