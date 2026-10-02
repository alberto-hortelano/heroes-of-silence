/**
 * La partida del servidor con un veterano de nivel 5 en la base del jugador del
 * agente (el 1) desde el día 1. La arranca `pnpm qa` en lugar de
 * `src/server/ws-server.ts`, para que el ascenso de la tropa a héroe cruce el
 * circuito entero —servidor, puente MCP, agente— en cada pasada.
 *
 * Es la única forma de abrir `preparar`, y es a propósito: un `import` desde
 * `tools/`. Ni una variable de entorno ni un mensaje del cable lo alcanzan, así
 * que la partida de verdad no tiene puerta de trampas.
 */
import { arrancarPartida } from '../../src/server/partida.js';
import { ponVeteranoEnLaBase } from './veterano-en-la-base.js';

void arrancarPartida({
  preparar: (state) => {
    const id = ponVeteranoEnLaBase(state, 1);
    console.log(`[qa] veterano ${id} de nivel 5 puesto en la base del jugador 1`);
  },
});
