/**
 * La partida del servidor con un veterano de rango 5 y una armería en la base del
 * jugador del agente (el 1) desde el día 1. La arranca `pnpm qa` en lugar de
 * `src/server/ws-server.ts`, para que el ascenso de la tropa a héroe cruce el
 * circuito entero —servidor, puente MCP, agente— en cada pasada, y con él la
 * compra y el equipo.
 *
 * Es la única forma de abrir `preparar`, y es a propósito: un `import` desde
 * `tools/`. Ni una variable de entorno ni un mensaje del cable lo alcanzan, así
 * que la partida de verdad no tiene puerta de trampas.
 */
import { arrancarPartida } from '../../src/server/partida.js';
import { prepararPartidaDelArnes } from './veterano-en-la-base.js';

void arrancarPartida({
  preparar: (state) => {
    const { veterano, base } = prepararPartidaDelArnes(state);
    console.log(`[qa] veterano ${veterano} de nivel 5 puesto en la base del jugador 1`);
    console.log(`[qa] armería puesta en ${base} del jugador 1, con oro para comprar`);
  },
});
