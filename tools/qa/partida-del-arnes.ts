/**
 * La partida del arnés —la de `pnpm qa` y la del espectador de `pnpm capturas`—
 * jugada aquí mismo, sin servidor, sin puente MCP y sin puertos: un `Director`
 * con un `AgentLink` atado a un socket de mentira que contesta con `politica.ts`.
 *
 * Existe para BUSCAR la semilla de esas dos partidas en vez de escribirla. El
 * plan de mapa del arnés era la semilla 7, escrita en `politica.ts`, y cada
 * cambio del generador la movía: 7 → 3 → 5 → 3 → 9 → 7 en cinco ciclos (#131),
 * cada vez porque en seis turnos dejaba de haber batalla, de equipar o de ver un
 * asaltante, y cada vez se re-buscaba a mano corriendo `pnpm qa` semilla a
 * semilla. El espectador además jugaba la semilla 50 del servidor, también fija.
 *
 * Lo que se busca es COBERTURA, nunca que algo salga bien: una semilla donde una
 * respuesta entera se rechaza, o el ascenso se cae, no se salta —esas son las
 * que el arnés tiene que poner en rojo—. Se mira solo que la partida dé ocasión
 * de ver lo que el arnés exige ver.
 *
 * Una semilla es las dos cosas a la vez: la del servidor (`HEROES_SEED`) y la
 * del plan que manda la política. Con las dos iguales, el plan es el mismo mapa
 * que el servidor habría generado solo, con los pueblos renombrados: lo que
 * distingue los dos mundos es la firma (`FIRMA_DEL_MAPA`), que el arnés exige.
 */
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { LADO_DEL_MAPA } from '../../src/core/map/generate.js';
import { parseSeed } from '../../src/core/rng.js';
import { AgentLink } from '../../src/server/agent-link.js';
import { Director } from '../../src/server/director.js';
import { pedirMapaAlAgente } from '../../src/server/mapa-del-agente.js';
import type { ServerToAgentMsg } from '../../src/server/protocol.js';
import { decidir } from './politica.js';
import { prepararPartidaDelArnes } from './veterano-en-la-base.js';

/** El tope de días de la partida del arnés (`HEROES_MAX_DAYS`): el mismo en `pnpm qa`, el espectador y aquí. */
export const DIAS_DEL_ARNES = 12;

/**
 * El entorno del servidor de la partida del arnés: su semilla y su tope de días,
 * los mismos con que se buscó. Lo comparten `pnpm qa` y el espectador.
 */
export function entornoDelArnes(semilla: number): Readonly<Record<string, string>> {
  return {
    HEROES_SEED: String(semilla),
    HEROES_MAX_DAYS: String(DIAS_DEL_ARNES),
    HEROES_WAIT_AGENT_MS: '30000',
  };
}

/** Los turnos de mapa que juega `pnpm qa` antes de cerrar (`QA_TURNS`, 6 por defecto). */
export const TURNOS_DEL_ARNES = Number(process.env.QA_TURNS ?? 6);

/**
 * Cuántas semillas se prueban como mucho. Cada una es una partida jugada en el
 * proceso, ~0,1 s (medido el 08-10-2026: 50-140 ms, hasta el sexto turno o
 * hasta el final), así que no encontrar ninguna cuesta unos 12 s. Era 40 hasta
 * el recinto de las ciudades en el núcleo (vuelta 3, 21-10-2026): en 1-40 solo
 * tres semillas daban ocasión de ver el equipo (28, 29 y 35), y ninguna además
 * dos respuestas de la rueda; la primera que lo da todo es la 112.
 */
export const TOPE_DE_SEMILLAS_DEL_ARNES = 120;

/** Una petición del servidor, con lo que la política contestó. */
export interface Peticion {
  readonly requestId: string;
  readonly kind: string;
  readonly payload: any;
  readonly respuesta: unknown;
}

/**
 * El socket de mentira: lo que `AgentLink` usa de un `WebSocket` —`on`, `send`
 * y `close`—. Contesta en el turno siguiente del bucle de eventos, como un
 * agente que contestara al instante por el cable, y no dentro del `send`: el
 * enlace todavía no ha apuntado la petición como pendiente cuando la manda.
 */
class SocketDelArnes extends EventEmitter {
  readonly peticiones: Peticion[] = [];
  constructor(private readonly semilla: number) {
    super();
  }
  send(raw: string): void {
    const msg = JSON.parse(raw) as ServerToAgentMsg;
    if (msg.type !== 'request') return;
    const respuesta = decidir(msg.kind, msg.payload, this.semilla);
    const { requestId, kind, payload } = msg;
    this.peticiones.push({ requestId, kind, payload, respuesta });
    setImmediate(() =>
      this.emit(
        'message',
        JSON.stringify({ type: 'response', requestId: msg.requestId, data: respuesta }),
      ),
    );
  }
  close(): void {
    this.emit('close');
  }
}

/**
 * Juega la partida del arnés de `semilla` y devuelve las peticiones que le
 * llegaron al agente, en orden, con lo que contestó la política.
 * Con `turnos`, para al acabar el turno del jugador en que el agente contesta
 * su `turnos`-ésimo turno de mapa, que es donde `pnpm qa` deja de escuchar.
 */
export async function jugarPartidaDelArnes(
  semilla: number,
  turnos = Number.POSITIVE_INFINITY,
): Promise<readonly Peticion[]> {
  const socket = new SocketDelArnes(semilla);
  const link = new AgentLink();
  link.attach(socket as unknown as WebSocket);
  const { plan, motivo } = await pedirMapaAlAgente(link, {
    width: LADO_DEL_MAPA,
    height: LADO_DEL_MAPA,
    players: [0, 1],
  });
  // Un plan rechazado no es una semilla sin escena: es el arnés roto, y `pnpm qa`
  // lo pondría rojo por la firma. Se dice aquí, antes de buscar más.
  if (plan === null)
    throw new Error(`semilla ${semilla}: el servidor rechaza el plan del arnés: ${motivo}`);
  const director = new Director(link, {
    seed: semilla,
    plan,
    agentPlayers: [1],
    maxDays: DIAS_DEL_ARNES,
    preparar: prepararPartidaDelArnes,
  });
  const deMapa = () => socket.peticiones.filter((p) => p.kind === 'adventure_turn').length;
  while (director.desenlace === null && deMapa() < turnos) await director.playTurn();
  return socket.peticiones;
}

/**
 * Lo que `pnpm qa` exige VER y que depende de la partida, y no encuentra en la
 * de esta semilla; vacío si lo tiene todo. Se lee como lo lee el arnés: hasta
 * su `turnos`-ésimo turno de mapa, y lo que provoca una respuesta solo cuenta
 * si después hay otra petición que el arnés escuche: el veredicto y los hechos
 * le llegan pegados a ella.
 *
 * Cada condición es la OCASIÓN, no el acierto: que la política mandó `equip`
 * y hubo otro turno después para verlo, no que el individuo saliera equipado.
 * Si la ocasión está y lo de verdad falla, la semilla vale y el arnés da rojo.
 */
export function faltaParaElArnes(
  peticiones: readonly Peticion[],
  turnos = TURNOS_DEL_ARNES,
): readonly string[] {
  const escuchadas: Peticion[] = [];
  for (const p of peticiones) {
    escuchadas.push(p);
    if (escuchadas.filter((q) => q.kind === 'adventure_turn').length >= turnos) break;
  }
  /** Si después de la petición `i` el arnés escucha otra de mapa: ahí le llega lo que provocó. */
  const turnoDespues = (i: number) =>
    escuchadas.slice(i + 1).some((p) => p.kind === 'adventure_turn');
  const mando = (p: Peticion, tipo: string) =>
    ((p.respuesta as { actions?: { type: string }[] }).actions ?? []).some((a) => a.type === tipo);
  const conOcasion = (tipo: string) =>
    escuchadas.some((p, i) => p.kind === 'adventure_turn' && mando(p, tipo) && turnoDespues(i));

  const batallas = escuchadas.filter((p) => p.kind === 'battle_turn');
  const accion = (p: Peticion) => (p.respuesta as { action: { type: string } }).action.type;
  const dosTramos = batallas.some((a, i) => {
    const b = batallas[i + 1];
    return (
      b !== undefined &&
      a.payload.turnId === b.payload.turnId &&
      accion(a) === 'move' &&
      accion(b) === 'move' &&
      // El veredicto de la segunda llega con la petición siguiente.
      escuchadas.indexOf(b) < escuchadas.length - 1
    );
  });
  const ascenso = escuchadas.findIndex((p) => p.kind === 'hero_from_troop');

  const faltan: string[] = [];
  if (!dosTramos)
    faltan.push('una unidad del agente que mande dos «move» seguidos en el mismo turno');
  if (
    !escuchadas.some(
      (p) => p.kind === 'adventure_turn' && (p.payload.knownMap?.raiders?.length ?? 0) > 0,
    )
  )
    faltan.push('un grupo de asaltantes en el knownMap de un turno');
  if (!conOcasion('dismiss')) faltan.push('un «dismiss» con un turno después para verlo');
  if (!conOcasion('buy_item')) faltan.push('un «buy_item» con un turno después para verlo');
  // El equipo, como lo exige `pnpm qa` (`cruzaElEquipo`): un individuo con algo
  // puesto en un turno de mapa, y no solo un «equip» con turno después. Con las
  // minas por región (#195) la semilla 4 equipaba al novato y lo perdía en la
  // batalla del día 4, y el arnés salía rojo con una semilla que esto daba por buena.
  const equipadoEn = (p: Peticion) =>
    p.kind === 'adventure_turn' &&
    (p.payload.heroes ?? []).some((h: { army?: { id?: unknown; equipment?: object }[] }) =>
      (h.army ?? []).some(
        (g) =>
          typeof g.id === 'string' &&
          Object.values(g.equipment ?? {}).some((id: unknown) => id !== null),
      ),
    );
  if (!conOcasion('equip') || !escuchadas.some(equipadoEn))
    faltan.push('un «equip» con un turno después donde se vea el individuo equipado');
  if (ascenso < 0 || !turnoDespues(ascenso))
    faltan.push('un «hero_from_troop» con un turno después para ver al nacido');
  // La rueda, como la exige `pnpm qa` (`exigeLaRueda`): la primera respuesta
  // va mala a propósito y otra tiene que entrar, así que hacen falta dos, la
  // segunda con una petición después para leer su veredicto. Con el recinto de
  // las ciudades en el núcleo (vuelta 3, 21-10-2026) la semilla que salía
  // primero pedía una sola, y el arnés daba rojo con una semilla que esto daba
  // por buena.
  const respuestas = escuchadas.flatMap((p, i) => (p.kind === 'battle_response' ? [i] : []));
  const segunda = respuestas[1];
  if (segunda === undefined || segunda >= escuchadas.length - 1)
    faltan.push('dos «battle_response», la segunda con una petición después para ver su veredicto');
  return faltan;
}

/**
 * Las decisiones de batalla que el espectador puede ver contar como mucho. No
 * es una regla del juego sino el plazo de la pasada (`PLAZO_DEL_GAME_OVER_MS`,
 * 82 s): el espectador cuenta cada acción del agente a su ritmo y va detrás
 * del servidor. Con el plan 18 (152 decisiones, quince finales) no llegaba al
 * fin en el plazo; con el 7 (42) lo enseñaba a los 15 s del `game_over`.
 */
export const DECISIONES_DEL_ESPECTADOR = 60;

/**
 * Lo que la pasada del espectador necesita de la partida entera, y no tiene:
 * un ascenso que enseñar, al menos dos turnos de batalla del agente (la captura
 * se hace en el segundo) y no más decisiones de las que caben en su plazo.
 */
export function faltaParaElEspectador(peticiones: readonly Peticion[]): readonly string[] {
  const batallas = peticiones.filter((p) => p.kind === 'battle_turn').length;
  const faltan: string[] = [];
  if (!peticiones.some((p) => p.kind === 'hero_from_troop')) faltan.push('un «hero_from_troop»');
  if (batallas < 2) faltan.push(`dos turnos de batalla del agente (hay ${batallas})`);
  if (batallas > DECISIONES_DEL_ESPECTADOR)
    faltan.push(`como mucho ${DECISIONES_DEL_ESPECTADOR} decisiones de batalla (hay ${batallas})`);
  return faltan;
}

/** Una semilla de la partida del arnés y cómo se llegó a ella, para decirlo en la consola. */
export interface SemillaDelArnes {
  readonly semilla: number;
  readonly como: string;
}

/**
 * La primera semilla desde 1 cuya partida del arnés no echa nada en falta según
 * `falta`. Lanza, con lo que le faltaba a cada una, si ninguna del tope lo da.
 *
 * `QA_SEMILLA=N` se salta la búsqueda y juega la N: para reproducir una partida
 * o ver qué pasa en una que la búsqueda descarta. Pasa por `parseSeed`, como
 * `HEROES_SEED`: lo que no es semilla lanza diciéndolo.
 *
 * El director escribe cada nota en la consola; durante la búsqueda se calla,
 * que son partidas que nadie ha pedido ver. Solo `console.log`: un aviso o un
 * error del enlace siguen saliendo.
 */
async function primeraSemilla(
  turnos: number,
  falta: (peticiones: readonly Peticion[]) => readonly string[],
  criterio: string,
): Promise<SemillaDelArnes> {
  const pedida = parseSeed(process.env.QA_SEMILLA);
  if (pedida !== null) return { semilla: pedida, como: 'pedida con QA_SEMILLA, sin buscar' };
  const motivos: string[] = [];
  const log = console.log;
  console.log = () => {};
  try {
    for (let semilla = 1; semilla <= TOPE_DE_SEMILLAS_DEL_ARNES; semilla++) {
      const faltan = falta(await jugarPartidaDelArnes(semilla, turnos));
      if (faltan.length === 0) {
        return { semilla, como: `buscada jugando la partida en el proceso: ${criterio}` };
      }
      motivos.push(`  ${semilla}: falta ${faltan.join('; ')}`);
    }
  } finally {
    console.log = log;
  }
  throw new Error(
    `ninguna partida del arnés de las semillas 1–${TOPE_DE_SEMILLAS_DEL_ARNES} da ${criterio}:\n${motivos.join('\n')}`,
  );
}

/** La semilla de `pnpm qa`: la del servidor y la del plan de mapa. */
export function semillaDelArnes(): Promise<SemillaDelArnes> {
  return primeraSemilla(
    TURNOS_DEL_ARNES,
    (m) => faltaParaElArnes(m),
    `la primera que en ${TURNOS_DEL_ARNES} turnos da ocasión de ver dos tramos, asaltantes, licencia, compra, equipo y ascenso`,
  );
}

/** La semilla de la pasada del espectador de `pnpm capturas`: la del servidor y la del plan de mapa. */
export function semillaDelEspectador(): Promise<SemillaDelArnes> {
  return primeraSemilla(
    Number.POSITIVE_INFINITY,
    faltaParaElEspectador,
    `la primera que trae ascenso y de 2 a ${DECISIONES_DEL_ESPECTADOR} decisiones de batalla del agente`,
  );
}
