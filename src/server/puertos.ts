/**
 * De dónde salen los dos puertos del servidor.
 *
 * Eran literales en `protocol.ts`, y eso hacía que `pnpm qa` —que levanta su
 * propio servidor— saliera 1 con `EADDRINUSE` en cuanto había un `pnpm partida`
 * abierto, que es **la forma documentada de jugar con el agente**. Ese choque
 * no era solo una molestia: es la fricción que empuja a liberar el puerto
 * matando procesos por patrón, y en una máquina compartida eso se lleva por
 * delante cosas de otros (`CLAUDE.md`, «La máquina es compartida»).
 *
 * Por defecto siguen siendo 9881 y 9880, así que quien no sepa que esto existe
 * no nota nada. Con **`0` el puerto lo elige el sistema**, que es lo que usa el
 * arnés: entonces ya no hay puerto que chocar con nadie.
 *
 * Quien pida `0` tiene que enterarse de cuál le tocó: por eso `ws-server.ts`
 * imprime el puerto **real**, el que le devuelve el socket ya escuchando, y no
 * el que pidió. Con `0` el número pedido es mentira, y una traza que miente es
 * peor que no tenerla.
 */

/** Puerto del canal con el puente MCP (el agente). */
export const AGENT_PORT_POR_DEFECTO = 9881;
/** Puerto del canal con los clientes que miran la partida. */
export const SPECTATOR_PORT_POR_DEFECTO = 9880;

/**
 * Igual que `parseSeed`: sin variable o con la variable vacía no hay nada que
 * rechazar. Lo que no es un puerto se rechaza **diciéndolo**, porque un
 * `HEROES_AGENT_PORT=ochomil` convertido en `NaN` abre un servidor en un puerto
 * al azar y deja al puente buscándolo donde no está.
 */
function puerto(nombre: string, valor: string | undefined, porDefecto: number): number {
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(
      `${nombre}="${valor}" no es un puerto: tiene que ser un entero entre 0 y 65535, y 0 significa "que lo elija el sistema"`,
    );
  }
  return n;
}

export function puertoAgente(): number {
  return puerto('HEROES_AGENT_PORT', process.env.HEROES_AGENT_PORT, AGENT_PORT_POR_DEFECTO);
}

export function puertoEspectadores(): number {
  return puerto(
    'HEROES_SPECTATOR_PORT',
    process.env.HEROES_SPECTATOR_PORT,
    SPECTATOR_PORT_POR_DEFECTO,
  );
}
