/**
 * Lo que el servidor lee del entorno, y cómo se rechaza lo que no vale.
 *
 * Nació para los dos puertos, y se llamaba `puertos.ts`, porque `pnpm qa`, que levanta su
 * propio servidor, salía 1 con `EADDRINUSE` en cuanto había un `pnpm partida`
 * abierto, que es **la forma documentada de jugar con el agente**. Ese choque no
 * era solo una molestia: es la fricción que empuja a liberar el puerto matando
 * procesos por patrón, y en una máquina compartida eso se lleva por delante
 * cosas de otros (`CLAUDE.md`, «La máquina es compartida»).
 *
 * Hoy vive aquí **toda** la configuración de entorno del servidor, y el motivo
 * es que el parser era el mismo escrito cuatro veces —`parseSeed`, el de los
 * puertos, y sendos `Number(env ?? …)` para el tope de días y el plazo del
 * agente— con dos de las cuatro copias **sin validar**. Un `Number` de lo que no
 * es un número da `NaN`, y un `NaN` no falla: se cuela y hace otra cosa. Los dos
 * casos medidos, que no son teóricos:
 *
 *  - `HEROES_AGENT_PORT=ochomil` abría el servidor en un puerto al azar y dejaba
 *    al puente llamando al 9881 de siempre.
 *  - `HEROES_WAIT_AGENT_MS=abc` es peor: **`setTimeout(f, NaN)` dispara a 1 ms**
 *    —node lo avisa con un `TimeoutNaNWarning` y sigue—, así que el servidor
 *    decidía que «no ha venido nadie» y se jugaba la partida entera con la IA de
 *    reglas mientras el agente esperaba su turno. El aviso se pierde entre las
 *    trazas de arranque y lo que se lee es una frase perfectamente normal: el
 *    fallo llega disfrazado de partida sin agente.
 *
 * Por eso pasan los cuatro por `enteroDelEntorno`, y por eso vive donde hay un
 * test que lo pueda ejercer: `ws-server.ts` arranca el servidor al importarlo,
 * así que lo que se quede allí no lo puede probar nadie.
 *
 * La otra mitad de la regla es la de `parseSeed`: **sin variable, o con la
 * variable vacía, no hay nada que rechazar**. No pedir no es un error.
 */

/** Puerto del canal con el puente MCP (el agente). */
export const AGENT_PORT_POR_DEFECTO = 9881;
/** Puerto del canal con los clientes que miran la partida. */
export const SPECTATOR_PORT_POR_DEFECTO = 9880;
/** Cuánto se espera a que el agente se conecte antes de tirar de heurística. */
export const ESPERA_AL_AGENTE_POR_DEFECTO = 120_000;

/**
 * Un entero del entorno, o `undefined` si no se ha pedido.
 *
 * `queEs` y `comoTieneQueSer` no son adorno ni se derivan del rango: un mensaje
 * genérico —«tiene que ser un entero entre 0 y 65535»— perdería lo que de verdad
 * necesita saber quien lo lee, que en el puerto es que **el 0 significa algo** y
 * en el plazo que el 0 es no esperar a nadie. Cada variable escribe su frase.
 */
export function enteroDelEntorno(
  nombre: string,
  regla: {
    readonly queEs: string;
    readonly comoTieneQueSer: string;
    readonly min: number;
    readonly max?: number;
  },
): number | undefined {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') return undefined;
  const n = Number(valor);
  // `isSafeInteger` y no `isInteger`, y la diferencia la encontró QA: `1e21`
  // pasa el segundo —es entero— y produce **exactamente la partida que no
  // termina nunca** que esta validación existe para evitar, porque `day >= 1e21`
  // no se cumple jamás. Y por encima de 2⁵³ el `Number` ya ni conserva lo que le
  // escribieron: `9007199254740993` vuelve como `…992`, un valor que nadie pidió
  // y que nadie ve cambiar. Lo seguro no es un tope de gusto: es donde el
  // `Number` deja de saber contar.
  if (!Number.isSafeInteger(n) || n < regla.min || (regla.max !== undefined && n > regla.max)) {
    throw new Error(
      `${nombre}="${valor}" no es ${regla.queEs}: tiene que ser ${regla.comoTieneQueSer}`,
    );
  }
  return n;
}

const REGLA_DE_PUERTO = {
  queEs: 'un puerto',
  comoTieneQueSer: 'un entero entre 0 y 65535, y 0 significa "que lo elija el sistema"',
  min: 0,
  max: 65535,
} as const;

export function puertoAgente(): number {
  return enteroDelEntorno('HEROES_AGENT_PORT', REGLA_DE_PUERTO) ?? AGENT_PORT_POR_DEFECTO;
}

export function puertoEspectadores(): number {
  return enteroDelEntorno('HEROES_SPECTATOR_PORT', REGLA_DE_PUERTO) ?? SPECTATOR_PORT_POR_DEFECTO;
}

/**
 * El último día que se juega, o `undefined` si no se pide otro.
 *
 * Devuelve `undefined` y no un número por defecto, al revés que sus tres
 * vecinos, porque el suyo **no es del servidor**: lo pone `newGame`, que es
 * quien crea la partida. Escribir aquí un 200 sería otra copia del mismo
 * número, y esto es configuración — la regla de qué pasa al agotarse vive en
 * `advanceDay`.
 */
export function maxDiasDelEntorno(): number | undefined {
  return enteroDelEntorno('HEROES_MAX_DAYS', {
    queEs: 'un tope de días',
    comoTieneQueSer: 'un entero ≥ 1, como 200',
    min: 1,
  });
}

export function esperaAlAgente(): number {
  return (
    enteroDelEntorno('HEROES_WAIT_AGENT_MS', {
      queEs: 'un plazo de espera',
      comoTieneQueSer:
        'un entero de milisegundos ≥ 0, como 120000 (dos minutos), y 0 es no esperar a nadie',
      min: 0,
    }) ?? ESPERA_AL_AGENTE_POR_DEFECTO
  );
}
