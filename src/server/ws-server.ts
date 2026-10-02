/**
 * Servidor de la partida.
 *
 * Abre dos canales: uno para el agente (por donde entra el puente MCP) y otro
 * para quien quiera mirar la partida desde el navegador. La partida avanza
 * sola; si el agente no está conectado cuando le toca, se le espera un rato y,
 * si no aparece, juega la IA de reglas.
 */

import { arrancarPartida } from './partida.js';

// El cuerpo vive en `partida.ts`, que es una función y se puede llamar con algo
// que preparar (`tools/qa/partida-con-veterano.ts`). Esto la llama sin nada:
// la partida de siempre.
void arrancarPartida();
