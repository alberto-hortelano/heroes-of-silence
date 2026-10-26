/**
 * Verificación de extremo a extremo del bucle del agente.
 *
 * Arranca el servidor de la partida, se conecta al puente MCP como cliente
 * real (el mismo transporte que usa Claude Code) y juega unos turnos con una
 * política tonta. Si esto pasa, el circuito completo funciona:
 *
 *   servidor ⇄ WebSocket ⇄ puente MCP ⇄ stdio ⇄ agente
 *
 * Lo que mira, además de que no reviente (#44). Durante mucho tiempo esto daba
 * verde sin haber mirado la mitad: cuatro de cuatro acciones descartadas salían
 * igual de verdes que un turno perfecto.
 *
 *  1. **Los veredictos.** Lee el bloque `CÓMO FUE LO ANTERIOR` de cada escucha
 *     y cuenta cuántas respuestas entraron y cuántas se descartaron, con el
 *     motivo. Revienta si alguna respuesta entera fue rechazada.
 *  2. **Que lo pedido se aplique.** `game_state` antes y después del primer
 *     turno de aventura, exigiendo un cambio CONCRETO: un edificio más, o el
 *     héroe en otra casilla.
 *  3. **Las seis tools de consulta**, por su contenido y no por su ausencia de
 *     error: `battle_state` en plena batalla, `game_state`, `map` con su niebla,
 *     `creature_stats`, `spell_list` y `building_list`. Todas pasan por
 *     `consulta()`, así que el recuento del final cuenta lo que de verdad se ha
 *     ejercitado.
 *
 * La partida se juega en la semilla que busca `partida-del-arnes.ts`: la
 * primera cuya partida, jugada antes en el proceso, da ocasión de ver todo lo de
 * abajo que depende del mapa (#131). `QA_SEMILLA=N` juega la N sin buscar.
 *
 * Uso: pnpm qa
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';
import { COMO_SE_LEE_EL_MAPA } from '../../src/core/contract/serialize.js';
import {
  CABECERA_ESTADO,
  CABECERA_RESPUESTA,
  leeVeredictos,
  leQuedan,
  MARCA_KIND,
  PREFIJO_CORTE,
  PREFIJO_FIN,
  PREFIJO_RELEVO,
  SANGRIA_PROBLEMA,
  type Veredicto,
} from '../../src/server/notas.js';
import type { ServerToSpectatorMsg } from '../../src/server/protocol.js';
import {
  contestaElArnes,
  entornoDelArnes,
  RESPUESTA_MALA,
  semillaDelArnes,
  sinTorcidos,
  TURNOS_DEL_ARNES,
} from './partida-del-arnes.js';
import { FIRMA_DEL_MAPA } from './politica.js';
import { arrancarServidor, type ServidorDePartida } from './servidor.js';

const TURNOS = TURNOS_DEL_ARNES;
/** El kind de la petición, leído por el marcador que lo escribe `notas.ts`. */
const RE_KIND = new RegExp(`${MARCA_KIND}(\\w+)`);
/** El número de la petición, que es por el que se busca después su veredicto. */
const RE_PETICION = /^Petición (\S+) ·/;

function log(msg: string): void {
  console.log(`\x1b[36m[qa]\x1b[0m ${msg}`);
}

/** El servidor de la partida: lo arranca y lo para `servidor.ts`, el mismo de `capturas.ts`. */
let servidor: ServidorDePartida | null = null;
/** El cliente MCP, aquí fuera para poder cerrarlo desde `terminar`. */
let cliente: Client | null = null;

async function terminar(codigo: number): Promise<never> {
  // El puente MCP es un hijo aparte y sin esto se quedaba suelto después de
  // cada pasada, así que `close()` hace falta. `close()` le cierra el stdin y
  // el puente, al ver el EOF, cierra su WebSocket y sale solo (#113): unos
  // 15 ms. Hasta el 08-10-2026 no lo hacía —el socket lo mantenía vivo— y lo
  // mataba el `SIGTERM` que el SDK manda a los dos segundos, que eran 2 de los
  // 3,3 s de cada pasada. Lo vigila `test/puente-mcp.test.ts`.
  if (cliente !== null) {
    const c = cliente;
    cliente = null;
    await c.close().catch(() => {});
  }
  servidor?.parar();
  process.exit(codigo);
}

// Si a este proceso lo cortan por teclado, el servidor se va con él: en su
// propio grupo ya no le llega el Ctrl+C del terminal.
for (const señal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(señal, () => void terminar(130));
}

/** Todo lo que hay que contar al final, en un sitio: el resumen lo lee un humano. */
const veredictos: Veredicto[] = [];
const consultadas = new Set<string>();
/**
 * Las decisiones de batalla en orden: qué unidad decidía y qué se le mandó. Con
 * el turno en tramos (02-10-2026) se exige que al menos una unidad encadene dos
 * `move` aceptados en el mismo turno, leído de los veredictos y no supuesto.
 */
const decisionesDeBatalla: {
  requestId: string;
  stack: string;
  turnId: number;
  accion: string;
  stepsLeft: number;
}[] = [];
/**
 * La rueda del golpe por el contrato (F6 de 2026-10-18): las respuestas pedidas
 * (`battle_response`), la primera mandada MAL a propósito («mega», que no es un
 * golpe) para ver que el veredicto la descarta diciéndolo, la elige la IA y la
 * batalla sigue siendo del agente; y las demás, de la lista, que entran. El golpe
 * del agente (`hit`) se mira en los veredictos de sus `attack`.
 */
const rueda: { pedidas: string[]; mala: string | null } = { pedidas: [], mala: null };
/** Lo que el arnés contesta mal a propósito (la respuesta mala y el escudo), apuntado por `contestaElArnes`. */
const torcidos = sinTorcidos();

/** Qué cambió en la partida por haberlo pedido. `null` = todavía sin comprobar. */
let cambioAplicado: string | null = null;
/**
 * Si alguna batalla de esta partida le ofreció rendirse al agente (fase 1b).
 * Solo se mira y se avisa: la política no se rinde —el arnés juega el mapa tal
 * cual, sin preparar la batalla—, y el circuito de la rendición por el contrato
 * lo cubre un test (`agent-link.test.ts`), que sí puede construirla.
 */
let rendicionOfrecida = false;
/**
 * Los asaltantes que el agente ha visto en su `knownMap`, por id, y cuántas
 * emboscadas le constan en la crónica. El criterio del ciclo es que `pnpm qa`
 * **se encuentre con alguno**: si el turno no los trajera, el circuito daría
 * verde sin haber ejercitado nada de lo que el agente tiene que ver.
 */
const asaltantesVistos = new Set<string>();
const emboscadasVistas = new Set<string>();
/**
 * Las licencias que le constan al agente en su crónica: el arnés licencia
 * cuando el héroe está en su castillo con la tropa llena (`politica.ts`), y que
 * conste es que el `dismiss` cruzó el circuito y se aplicó, no solo que validó.
 */
const licenciasVistas = new Set<string>();
/**
 * El equipo, cruzado de verdad: las compras que le constan al agente en su
 * crónica (`item_bought`) y el primer individuo de su tropa que aparece con
 * `equipment` en un turno, comprobado **una vez** contra `game_state`. El
 * servidor del arnés pone la armería en la base (`partida-con-veterano.ts`) y la
 * política compra y equipa (`politica.ts`); sin este recuento, un `buy_item` que
 * validara y no se aplicara, o un `equip` que se perdiera, saldrían verdes.
 */
const comprasVistas = new Set<string>();
const equipo: { visto: string | null } = { visto: null };
/**
 * Los huecos en inglés (12-10-2026): el `equipment` de cada héroe trae
 * exactamente estos cinco (sin accesorio desde el 18-10-2026), y un `unequip` con `slot: "shield"` cruza el puente,
 * se traduce (`accionDelAgente`) y lo contesta el NÚCLEO —el héroe no lleva
 * escudo, así que lo descarta `unequipBlocker` diciéndolo—. Si el `slot` no se
 * tradujera, el motivo sería «no hay ningún hueco», no este.
 */
// Escrita a mano, no leída de `SLOTS`: es lo que se espera ver en el cable. Desde el
// 25-10-2026 la lanza es un arma más y su hueco `lance` dejó sitio a la segunda arma.
const SLOTS_DEL_CONTRATO = [
  'melee_weapon',
  'second_melee_weapon',
  'ranged_weapon',
  'armor',
  'shield',
];
const escudo: { requestId: string | null; heroe: string | null; visto: string | null } = {
  requestId: null,
  heroe: null,
  visto: null,
};
/**
 * El clima que pide el narrador (`weather` del `adventure_turn`), cruzado de
 * verdad: el primer turno de mapa pide una tormenta buena y un «granizo»; el
 * veredicto tiene que traer el rechazo con su motivo y la nota la aceptada, y el
 * fotograma del espectador, la tormenta en esa región.
 */
const clima: {
  requestId: string | null;
  region: { x: number; y: number } | null;
  visto: string | null;
} = { requestId: null, region: null, visto: null };
/** El último fotograma del canal de espectadores: de ahí se lee el clima que ve quien mira. */
let ultimoFotograma: ServerToSpectatorMsg | null = null;
/**
 * Cuánto de la ventana de `recentEvents` se llevan los hechos de asaltantes.
 * Era un riesgo del plan —la patrulla podía ahogar los 25 hechos que caben—;
 * la patrulla dejó de ser un hecho, y lo que queda se mide en vez de suponerse.
 */
const cuotaDeAsaltantes = { asaltantes: 0, total: 0 };
/**
 * El ascenso de la tropa a héroe, cruzado de verdad: la petición
 * `hero_from_troop` que llegó, el nombre que le dio la política y si el héroe
 * apareció después en su turno y en `game_state` con su tipo y su historia. La partida del
 * arnés no produce un nivel 5 sola, así que el servidor se arranca con uno
 * puesto en la base (`partida-con-veterano.ts`); sin este recuento, un ascenso
 * que no se pidiera o no se aplicara saldría verde.
 */
const ascenso: { requestId: string | null; nombre: string | null; visto: string | null } = {
  requestId: null,
  nombre: null,
  visto: null,
};

/**
 * Las voces de la base (`town_voices`), cruzadas de verdad: cuántas peticiones
 * salen frente a los turnos de mapa —el riesgo de la crítica era que casi
 * doblaran las peticiones del agente— y que al menos una reciba su veredicto
 * bueno. Sin esto, una petición que no se emitiera saldría verde.
 */
const voces: { pedidas: string[]; ultimaPayload: any } = { pedidas: [], ultimaPayload: null };

/** Que las voces crucen: al menos una pedida, con veredicto, y bueno. Y el recuento. */
function exigeLasVoces(turnos: number): void {
  if (voces.pedidas.length === 0) {
    throw new Error('no ha llegado ningún "town_voices": la base del agente no ha pedido voces');
  }
  const conVeredicto = voces.pedidas
    .map((id) => veredictos.find((v) => v.requestId === id))
    .filter((v) => v !== undefined);
  if (conVeredicto.length === 0) {
    throw new Error(`ningún "town_voices" ha recibido veredicto (${voces.pedidas.join(', ')})`);
  }
  const malo = conVeredicto.find((v) => !v.ok);
  if (malo !== undefined) throw new Error(`unas voces se rechazaron: ${detalle(malo)}`);
  const porTurno = turnos === 0 ? 0 : voces.pedidas.length / turnos;
  log(
    `voces: ${voces.pedidas.length} "town_voices" para ${turnos} "adventure_turn" (${porTurno.toFixed(2)} por turno); ${conVeredicto.length} con veredicto bueno; ` +
      `la última pidió ${voces.ultimaPayload?.towns?.length ?? 0} base(s) y ${(voces.ultimaPayload?.towns ?? []).reduce((n: number, t: any) => n + (t.npcs?.length ?? 0), 0)} persona(s)`,
  );
}

/** Una consulta que tiene que devolver JSON. Si no, es que el puente miente. */
async function consulta(
  client: Client,
  nombre: string,
  args: Record<string, unknown> = {},
): Promise<any> {
  const r = await client.callTool({ name: nombre, arguments: args });
  if (r.isError === true) throw new Error(`la consulta "${nombre}" ha fallado: ${textoDe(r)}`);
  consultadas.add(nombre);
  try {
    return JSON.parse(textoDe(r));
  } catch {
    throw new Error(`la consulta "${nombre}" no ha devuelto JSON:\n${textoDe(r).slice(0, 300)}`);
  }
}

/**
 * El edificio concreto que la respuesta pide levantar, si pide alguno.
 *
 * Lanza si la respuesta no pide NADA: entonces no hay nada que comprobar
 * después, y esperar un cambio que nunca iba a venir daría un rojo que señala
 * al servidor cuando el fallo es de aquí. La política de este arnés siempre
 * pide al menos moverse.
 */
function loPedido(respuesta: unknown): { town: string; id: string } | null {
  const acciones = (respuesta as { actions?: any[] }).actions;
  if (!Array.isArray(acciones) || acciones.length === 0) {
    throw new Error(
      `la política no ha pedido ninguna acción de aventura: ${JSON.stringify(respuesta).slice(0, 200)}`,
    );
  }
  const build = acciones.find((a) => a?.type === 'build');
  return build === undefined ? null : { town: String(build.town), id: String(build.building) };
}

/**
 * Qué se ve distinto en la partida por lo que se PIDIÓ, o `null` si nada.
 *
 * Va atado a la acción concreta y no a «algo ha cambiado», y el motivo salió de
 * romperlo a mano: mandando una respuesta que zod rechaza, la IA de reglas toma
 * el relevo y construye por su cuenta — así que «el castillo tiene un edificio
 * más» salía verde con la respuesta del agente en la basura. Un cambio sin
 * dueño no prueba que se aplicara lo pedido.
 *
 * Lo que se mira es lo que la política tonta hace SIEMPRE —el primero de
 * `canBuildNow`—, no un resultado de partida: apoyarlo en que capturó una mina
 * lo pondría rojo el día que cambie la IA, sin que el circuito se rompa.
 */
function describeCambio(
  antes: any,
  despues: any,
  pedido: { town: string; id: string } | null,
): string | null {
  if (pedido !== null) {
    const tenia: string[] =
      (antes.towns ?? []).find((t: any) => t.id === pedido.town)?.buildings ?? [];
    const tiene: string[] =
      (despues.towns ?? []).find((t: any) => t.id === pedido.town)?.buildings ?? [];
    if (tiene.includes(pedido.id) && !tenia.includes(pedido.id)) {
      return `el castillo ${pedido.town} tiene ahora "${pedido.id}", que es exactamente lo que se pidió`;
    }
    // Se pidió construir: o entra ESO, o no cuenta. Otro edificio distinto
    // significa que lo levantó otro.
    return null;
  }

  // Sin `build` en la respuesta —la política solo lo mete si hay algo que
  // pueda pagar— queda el movimiento del héroe. Es más débil: no se compara
  // con la casilla pedida porque el héroe se queda a medio camino cuando se le
  // acaba el movimiento, así que lo que se afirma es que se movió.
  const a = antes.heroes?.[0]?.at;
  const d = despues.heroes?.[0]?.at;
  if (a !== undefined && d !== undefined && (a.x !== d.x || a.y !== d.y)) {
    return `el héroe se movió de (${a.x},${a.y}) a (${d.x},${d.y})`;
  }
  return null;
}

/**
 * Espera a ver el cambio en vez de suponerlo aplicado.
 *
 * `heroes_respond` devuelve en cuanto ENTREGA la respuesta; aplicarla es cosa
 * del director, unos milisegundos después. Preguntar una sola vez y no ver nada
 * sería un rojo por carrera, no por circuito roto.
 */
async function esperaElCambio(client: Client, antes: any, respuesta: unknown): Promise<void> {
  // Qué se va a poder comprobar sale de la respuesta que se acaba de mandar: se
  // calcula aquí, que es el único sitio que lo usa, en vez de enhebrarlo por dos
  // firmas desde el bucle.
  const pedido = loPedido(respuesta);
  for (let i = 0; i < 40; i++) {
    const cambio = describeCambio(antes, await consulta(client, 'game_state'), pedido);
    if (cambio !== null) {
      cambioAplicado = cambio;
      log(`comprobado que se aplica: ${cambio}`);
      return;
    }
    await sleep(100);
  }
  throw new Error(
    pedido === null
      ? 'el turno se aceptó pero el héroe sigue en su casilla: no se aplicó nada de lo pedido'
      : `el turno se aceptó pero el castillo ${pedido.town} sigue sin "${pedido.id}": no se aplicó lo pedido`,
  );
}

/**
 * Que la partida se esté jugando en el mapa que diseñó el agente.
 *
 * Es la prueba de punta a punta de #27, y hace falta porque el camino de
 * respaldo es **silencioso por diseño**: si el plan se rechazara, el servidor
 * jugaría el procedimental, la partida seguiría, los veredictos seguirían
 * entrando y `pnpm qa` saldría verde sin haber ejercitado una sola línea del
 * mapa del agente. Lo único que distingue los dos mundos es el nombre de los
 * pueblos, así que se mira eso.
 */
function exigeElMapaDelAgente(estado: any): void {
  const ids: string[] = (estado.towns ?? []).map((t: any) => String(t.id));
  if (ids.some((id) => id.startsWith(FIRMA_DEL_MAPA))) {
    log(`el mapa lo diseñó el agente: pueblos ${ids.join(', ')}`);
    return;
  }
  throw new Error(
    `la partida NO se juega en el mapa del agente: sus pueblos son ${ids.join(', ') || '(ninguno)'} ` +
      `y ninguno lleva la firma "${FIRMA_DEL_MAPA}*". O el plan se rechazó y el servidor está ` +
      'jugando el procedimental —que es verde sin haber probado nada de #27—, o la política dejó ' +
      'de firmarlo. Mira la línea "[servidor] mapa …" de arriba: dice cuál de las dos.',
  );
}

/** Un veredicto con sus motivos debajo, sangrados como los escribe el puente. */
function detalle(v: Veredicto): string {
  return `${v.requestId}: ${v.nota}${v.problemas.map((p) => `\n${SANGRIA_PROBLEMA}${p}`).join('')}`;
}

/** El recuento de veredictos, y el rojo si alguna respuesta entera se cayó. */
function informaVeredictos(): void {
  const entraron = veredictos.filter((v) => v.ok);
  // La respuesta mala de la rueda se manda a propósito y se mira aparte (`exigeLaRueda`).
  const descartadas = veredictos.filter((v) => !v.ok && v.requestId !== rueda.mala);
  log(
    `${veredictos.length} veredictos, ${entraron.length} entraron, ${descartadas.length} descartadas`,
  );
  // También los descartes parciales: el turno entró, pero con acciones caídas y
  // su motivo. No son rojo —el contrato dice que se descartan una a una— pero
  // salir sin nombrarlos es volver a dar verde sin mirar.
  const parciales = entraron.filter((v) => v.problemas.length > 0);
  for (const v of parciales) {
    log(`entró con ${v.problemas.length} acciones descartadas — ${detalle(v)}`);
  }

  if (veredictos.length === 0) {
    throw new Error('el canal no ha acusado ni un solo veredicto: nadie está informando de nada');
  }
  if (descartadas.length > 0) {
    throw new Error(
      `hubo respuestas rechazadas ENTERAS, que es el circuito roto:\n  ${descartadas.map(detalle).join('\n  ')}`,
    );
  }
  // Aquí NO va un `entraron.length === 0`: después de las dos comprobaciones de
  // arriba es aritmética —los dos conjuntos parten los veredictos—, así que no
  // podía dispararse ni editando el código de alrededor. Y contaba veredictos,
  // no acciones: un turno aceptado con `actions: []` habría salido verde. Lo
  // que de verdad exige que entre algo es `cambioAplicado`, que mira que el
  // edificio pedido APAREZCA.
}

/**
 * Que ninguna batalla ofreciera rendirse se avisa, como `battle_state`: depende
 * de la batalla que toque —hace falta base propia, no estar defendiéndola y el
 * oro—, pero no se calla.
 */
function avisaRendicion(): void {
  if (rendicionOfrecida) {
    log('rendición: alguna batalla la ofreció en `legalActions`');
    return;
  }
  console.warn('\x1b[33m[qa] AVISO: ninguna batalla ofreció rendirse en esta partida\x1b[0m');
}

/**
 * Que el veterano de la base se hiciera héroe por el circuito entero: se pidió,
 * su veredicto entró y el héroe está en el turno siguiente y en `game_state`, con
 * su tipo y su historia.
 * Rojo en cualquier otro caso, también si no llegó a pedirse: el servidor del
 * arnés lo pone en la base precisamente para que se pida.
 */
function exigeElAscenso(): void {
  if (ascenso.requestId === null) {
    throw new Error(
      'no ha llegado ningún "hero_from_troop": el veterano de rango 5 de la base no se ha ofrecido al narrador',
    );
  }
  const v = veredictos.find((x) => x.requestId === ascenso.requestId);
  if (v === undefined) {
    throw new Error(`el "hero_from_troop" ${ascenso.requestId} no ha recibido veredicto`);
  }
  if (!v.ok) throw new Error(`el ascenso se rechazó: ${detalle(v)}`);
  if (ascenso.visto === null) {
    throw new Error(
      `el ascenso entró (${v.nota}) pero ningún "adventure_turn" posterior ha llegado para ver a "${ascenso.nombre}"`,
    );
  }
  log(`ascenso: ${ascenso.visto}`);
}

/**
 * Busca al héroe recién nacido en el `adventure_turn` que sigue al ascenso —que
 * ya trae `type` y `story`, y llega después de aplicarlo, así que no hay nada que
 * esperar— y lo cruza **una vez** con `game_state`, la otra puerta por la que el
 * agente lo puede ver: las dos tienen que decir lo mismo de él.
 */
async function cruzaElHeroeNacido(client: Client, turno: any): Promise<void> {
  const enElTurno = (turno.heroes ?? []).find((x: any) => x.name === ascenso.nombre);
  if (enElTurno === undefined) {
    throw new Error(
      `el ascenso entró pero el "adventure_turn" siguiente no trae a "${ascenso.nombre}" entre sus héroes`,
    );
  }
  if (typeof enElTurno.type !== 'string' || typeof enElTurno.story !== 'string') {
    throw new Error(`el héroe nacido llega sin "type" o sin "story": ${JSON.stringify(enElTurno)}`);
  }
  const estado = await consulta(client, 'game_state');
  const enElEstado = (estado.heroes ?? []).find((x: any) => x.id === enElTurno.id);
  if (
    enElEstado === undefined ||
    enElEstado.type !== enElTurno.type ||
    enElEstado.story !== enElTurno.story
  ) {
    throw new Error(
      `game_state no dice lo mismo del héroe nacido que su turno: ${JSON.stringify(enElEstado)} frente a ${JSON.stringify(enElTurno)}`,
    );
  }
  // I1: el héroe que queda en la casilla de la base es quien la defiende, solo
  // con su tropa. Si se queda vacío con guarnición al lado, la base cae ante
  // dos campesinos esa misma noche.
  const base = (turno.towns ?? []).find((t: any) => t.id === turno.yourBase);
  const enLaCasilla = (turno.heroes ?? []).find(
    (x: any) => base !== undefined && x.at.x === base.at.x && x.at.y === base.at.y,
  );
  // `garrison` viaja agrupada por criatura: los individuos son la suma de `count`.
  const guarnicion = (base?.garrison ?? []).reduce((n: number, g: any) => n + g.count, 0);
  if (enLaCasilla !== undefined && enLaCasilla.army.length === 0 && guarnicion > 0) {
    throw new Error(
      `tras el ascenso, ${enLaCasilla.name} ocupa la base sin tropa y con ${guarnicion} individuos de guarnición que no pelean: la base queda indefensa`,
    );
  }
  const h = enElTurno;
  if (h.rank !== 5 || typeof h.level !== 'number') {
    throw new Error(
      `el héroe nacido de la tropa no trae "rank" 5 y su "level" derivado: rank ${h.rank}, level ${h.level}`,
    );
  }
  ascenso.visto = `${h.name} (${h.id}), tipo ${h.type}, rango ${h.rank}, nivel ${h.level}, tropa: ${h.army.length}, «${h.story}»`;
}

/**
 * Busca en el turno un individuo con `id` que lleve algo en su `equipment` —un
 * novato al que se le puso una pieza, o un veterano— y lo cruza con `game_state`: las dos puertas tienen
 * que decir lo mismo de lo que lleva. Y el héroe tiene que traer sus cinco huecos
 * y su mochila, que es lo que el agente lee para decidir qué ponerse.
 */
async function cruzaElEquipo(client: Client, turno: any): Promise<void> {
  for (const h of turno.heroes ?? []) {
    if (h.equipment === undefined || !Array.isArray(h.backpack)) {
      throw new Error(
        `el héroe ${h.id} llega sin "equipment" o sin "backpack": ${JSON.stringify(h)}`,
      );
    }
    if (JSON.stringify(Object.keys(h.equipment)) !== JSON.stringify(SLOTS_DEL_CONTRATO)) {
      throw new Error(
        `el "equipment" del héroe ${h.id} no trae exactamente ${SLOTS_DEL_CONTRATO.join(', ')}: ${JSON.stringify(h.equipment)}`,
      );
    }
  }
  const conPieza = (turno.heroes ?? []).flatMap((h: any) =>
    (h.army ?? [])
      .filter(
        (g: any) =>
          typeof g.id === 'string' &&
          Object.values(g.equipment ?? {}).some((id: unknown) => id !== null),
      )
      .map((g: any) => ({ heroe: h.id, fila: g })),
  );
  const primero = conPieza[0];
  if (primero === undefined) return;
  const estado = await consulta(client, 'game_state');
  const heroe = (estado.heroes ?? []).find((x: any) => x.id === primero.heroe);
  const fila = (heroe?.army ?? []).find((g: any) => g.id === primero.fila.id);
  if (
    fila === undefined ||
    JSON.stringify(fila.equipment) !== JSON.stringify(primero.fila.equipment)
  ) {
    throw new Error(
      `game_state no dice lo mismo del individuo equipado que su turno: ${JSON.stringify(fila)} frente a ${JSON.stringify(primero.fila)}`,
    );
  }
  equipo.visto = `${primero.fila.creature} ${primero.fila.id} de ${primero.heroe} lleva ${JSON.stringify(primero.fila.equipment)} (cruzado con game_state)`;
}

/**
 * Que el clima pedido cruzara el circuito: el «granizo» vuelve rechazado con su
 * motivo tras «weather», la nota cuenta la tormenta aceptada y el canal de
 * espectadores la enseña en su región.
 */
function exigeElClima(): void {
  if (clima.requestId === null || clima.region === null) {
    throw new Error('ningún turno de mapa ha pedido clima: "weather" no ha cruzado el circuito');
  }
  const v = veredictos.find((x) => x.requestId === clima.requestId);
  const malo = v?.problemas.find((p) => p.startsWith('weather '));
  if (
    malo === undefined ||
    !/"granizo" no es un tiempo: valen despejado, niebla, lluvia, tormenta/.test(malo)
  ) {
    throw new Error(
      `el pedido de clima «granizo» no se ha descartado con su motivo: ${JSON.stringify(v)}`,
    );
  }
  if (v === undefined || !/Clima: tormenta en .+ hasta el día \d+/.test(v.nota)) {
    throw new Error(`la nota del turno no cuenta la tormenta aceptada: ${v?.nota}`);
  }
  if (clima.visto === null) {
    throw new Error(
      'el canal de espectadores no ha enseñado la tormenta pedida en su región ("clima.regiones")',
    );
  }
  log(`clima: «${malo}» — «${v.nota}» — ${clima.visto}`);
}

/** Si el último fotograma del espectador trae la tormenta pedida en la región de `clima.region`. */
function miraElClimaDelEspectador(): void {
  if (clima.region === null || clima.visto !== null || ultimoFotograma === null) return;
  const { view } = ultimoFotograma;
  const at = clima.region;
  const k = view.map.regions.findIndex((r) => r.at.x === at.x && r.at.y === at.y);
  if (k >= 0 && view.clima.regiones[k]?.tiempo === 'tormenta') {
    clima.visto = `el espectador ve tormenta en ${view.map.regions[k]?.name} el día ${ultimoFotograma.day}`;
  }
}

/**
 * Que el `unequip` con `slot: "shield"` llegara al núcleo: su veredicto trae el
 * motivo de `unequipBlocker` («no lleva nada en Escudo»), que solo se escribe si
 * el hueco se tradujo. Con el `slot` sin traducir sería «no hay ningún hueco», y
 * con la acción perdida, nada. Y el hueco va por su nombre para la persona
 * («Escudo»), nunca por la clave de dentro («escudo»), que el agente no escribió.
 */
function exigeElEscudo(): void {
  if (escudo.requestId === null) {
    throw new Error('ningún turno de mapa ha traído un héroe con "shield": null en su "equipment"');
  }
  const v = veredictos.find((x) => x.requestId === escudo.requestId);
  const motivo = v?.problemas.find((p) => p.startsWith(`unequip shield de ${escudo.heroe}:`));
  if (motivo === undefined || !/no lleva nada en Escudo/.test(motivo)) {
    throw new Error(
      `el "unequip" con "slot": "shield" de la petición ${escudo.requestId} no lo ha contestado el núcleo: ${motivo ?? `sin veredicto (${JSON.stringify(v)})`}`,
    );
  }
  if (/\bescudo\b/.test(motivo)) {
    throw new Error(
      `el motivo del "unequip" con "slot": "shield" nombra el hueco por su clave de dentro («escudo»), no por su nombre: ${motivo}`,
    );
  }
  escudo.visto = motivo;
  log(`escudo: "slot": "shield" cruza el puente y lo contesta el núcleo — «${motivo}»`);
}

/**
 * Que el turno en tramos haya cruzado el circuito: una unidad del agente con dos
 * `move` seguidos en el MISMO turno —el mismo `turnId` en las dos peticiones—,
 * los dos aceptados, y el primero acusado con el turno ABIERTO y las casillas
 * que le quedan en la segunda petición.
 *
 * Las dos mitades hacen falta y miden cosas distintas. El `turnId` es el hecho:
 * dos `move` seguidos de la misma unidad pueden ser dos turnos (la moral extra
 * hasta el 26-10-2026, o el último que queda en pie), y es lo que coló dos veces a quien miraba solo
 * quién actúa. La nota es lo que mide el director: sin ella, la sonda que
 * invierte su medida —anunciar «cerrado» cuando sigue abierto— saldría verde.
 */
function exigeDosTramos(): void {
  const veredicto = (id: string) => veredictos.find((v) => v.requestId === id);
  let tramos = 0;
  for (let i = 0; i + 1 < decisionesDeBatalla.length; i++) {
    const a = decisionesDeBatalla[i]!;
    const b = decisionesDeBatalla[i + 1]!;
    if (a.turnId !== b.turnId || a.accion !== 'move' || b.accion !== 'move') continue;
    const va = veredicto(a.requestId);
    const vb = veredicto(b.requestId);
    if (
      va?.ok === true &&
      vb?.ok === true &&
      va.nota.includes('Su turno sigue abierto') &&
      va.nota.includes(leQuedan(b.stepsLeft))
    ) {
      if (tramos === 0) log(`dos tramos: ${a.stack} — «${va.nota}»`);
      tramos++;
    }
  }
  if (tramos === 0) {
    throw new Error(
      `ninguna unidad del agente ha encadenado dos "move" aceptados en el mismo turno (${decisionesDeBatalla.length} decisiones de batalla)`,
    );
  }
  log(
    `turno en tramos: ${tramos} veces dos "move" seguidos en el mismo "turnId", los dos aceptados`,
  );
}

/**
 * Que la rueda cruce el contrato en las dos direcciones: el `hit` de un `attack`
 * del agente entra y su veredicto lo dice; se le piden respuestas
 * (`battle_response`) y entran; y la mala (`RESPUESTA_MALA`) se descarta con el
 * motivo del núcleo, la elige la IA y la batalla sigue siendo suya (criterio 4).
 */
function exigeLaRueda(): void {
  const golpe = veredictos.find((v) => v.ok && /Golpeaste con "/.test(v.nota));
  if (golpe === undefined) {
    throw new Error(
      'ningún "attack" del agente ha entrado con su "hit": el golpe no cruza el contrato',
    );
  }
  log(`golpe: «${golpe.nota}»`);
  // El disparo diferido (25-10-2026) no se exige: va sin comprobaciones hasta que
  // el usuario lo valide jugando. Solo se dice si un `aim` del agente cruzó.
  const apunta = veredictos.find((v) => v.ok && /apuntar a \(/.test(v.nota));
  log(
    apunta === undefined
      ? 'disparo: ningún "aim" del agente en esta partida (no se exige)'
      : `disparo: «${apunta.nota}»`,
  );
  if (rueda.mala === null) {
    throw new Error('no se ha pedido ni una respuesta de la rueda ("battle_response")');
  }
  const mala = veredictos.find((v) => v.requestId === rueda.mala);
  if (
    mala === undefined ||
    mala.ok ||
    !mala.problemas.some((p) => p.includes(`«${RESPUESTA_MALA}» no es un golpe de la rueda`)) ||
    !/la eligió la IA de reglas a ciegas/.test(mala.nota) ||
    !/La batalla sigue siendo tuya/.test(mala.nota)
  ) {
    throw new Error(
      `la respuesta «${RESPUESTA_MALA}» no se ha descartado diciéndolo: ${JSON.stringify(mala)}`,
    );
  }
  log(`respuesta mala: «${mala.problemas[0]}» — «${mala.nota}»`);
  const buenas = rueda.pedidas
    .filter((id) => id !== rueda.mala)
    .map((id) => veredictos.find((v) => v.requestId === id));
  const entradas = buenas.filter((v) => v?.ok === true && /respondiste "/.test(v.nota));
  if (entradas.length === 0) {
    throw new Error(
      `de ${rueda.pedidas.length} respuestas pedidas ninguna ha entrado: ${JSON.stringify(buenas.slice(0, 2))}`,
    );
  }
  log(
    `respuestas: ${rueda.pedidas.length} pedidas, ${entradas.length} entraron — «${entradas[0]?.nota}»`,
  );
}

/** Cierra con el resumen de todo lo que se ha verificado. */
async function terminarBien(
  turnos: number,
  batallas: number,
  mapas: number,
  motivo: string,
): Promise<void> {
  informaVeredictos();
  exigeDosTramos();

  if (cambioAplicado === null) {
    throw new Error('no se ha llegado a comprobar que ninguna acción se aplicara de verdad');
  }
  avisaRendicion();
  exigeLasVoces(turnos);
  const faltan = ['game_state', 'map', 'creature_stats', 'spell_list', 'building_list'].filter(
    (n) => !consultadas.has(n),
  );
  if (faltan.length > 0) throw new Error(`tools de consulta sin ejercitar: ${faltan.join(', ')}`);
  if (!consultadas.has('battle_state')) {
    // Aviso y no rojo: que haya batalla depende de que el rival ataque, no de
    // la política del arnés. Ponerlo rojo sería un arnés más frágil que lo que
    // verifica — pero callarlo sería perder la cobertura de batalla en
    // silencio, que es justo el pecado que este ciclo viene a cerrar.
    console.warn(
      '\x1b[33m[qa] AVISO: no ha habido ninguna batalla, así que battle_state no se ha ejercitado\x1b[0m',
    );
  }
  if (asaltantesVistos.size === 0) {
    throw new Error(
      'el agente no ha visto ni un grupo de asaltantes en ningún knownMap: el turno no los trae, o el arnés no los encuentra',
    );
  }
  log(
    `asaltantes: ${asaltantesVistos.size} grupos vistos en el knownMap, ${emboscadasVistas.size} emboscadas en la crónica; ` +
      `los hechos de asaltantes son ${cuotaDeAsaltantes.asaltantes} de ${cuotaDeAsaltantes.total} de recentEvents`,
  );
  if (licenciasVistas.size === 0) {
    throw new Error(
      'el agente no ha licenciado tropa ni una vez: `dismiss` no ha cruzado el circuito',
    );
  }
  log(`licencias: ${licenciasVistas.size} en la crónica del agente`);
  if (comprasVistas.size === 0) {
    throw new Error(
      'el agente no ha comprado nada en la armería: `buy_item` no ha cruzado el circuito',
    );
  }
  if (equipo.visto === null) {
    throw new Error(
      'ningún individuo de la tropa del agente ha llegado equipado a un turno: `equip` no ha cruzado el circuito',
    );
  }
  log(`equipo: ${comprasVistas.size} compras en la crónica; ${equipo.visto}`);
  exigeElEscudo();
  exigeElClima();
  exigeElAscenso();
  exigeLaRueda();
  log(`consultas ejercitadas: ${[...consultadas].sort().join(', ')}`);
  // Peticiones por batalla: la cifra que mueve pedirle al agente también la
  // respuesta de la rueda (F6 del plan de 2026-10-18). Una batalla nueva se
  // reconoce porque su `turnId` vuelve a empezar: es el ordinal del turno DENTRO
  // de su batalla, así que solo baja al cambiar de batalla.
  const nBatallas = decisionesDeBatalla.filter(
    (d, i) => i === 0 || d.turnId < decisionesDeBatalla[i - 1]!.turnId,
  ).length;
  // Desde F6, también las respuestas de la rueda: cada una es una petición más.
  const pedidas = batallas + rueda.pedidas.length;
  log(
    `batallas del agente: ${nBatallas}, ${(pedidas / Math.max(1, nBatallas)).toFixed(1)} peticiones de batalla por batalla ` +
      `(${(batallas / Math.max(1, nBatallas)).toFixed(1)} turnos y ${(rueda.pedidas.length / Math.max(1, nBatallas)).toFixed(1)} respuestas)`,
  );
  log(
    `${motivo}: ${mapas} ${mapas === 1 ? 'mapa diseñado' : 'mapas diseñados'}, ` +
      `${turnos} turnos de mapa, ${batallas} decisiones de batalla y ` +
      `${ascenso.requestId === null ? 0 : 1} ascenso de tropa a héroe`,
  );
  await terminar(0);
}

/** La semilla de la partida: la del servidor y la del plan de mapa que manda la política. */
let semilla = 0;

async function main(): Promise<void> {
  const buscada = await semillaDelArnes();
  semilla = buscada.semilla;
  log(`semilla ${semilla}, ${buscada.como}`);
  log('esperando a que arranque el servidor…');
  // Puertos que elige el sistema: el arnés convive con un `pnpm partida` abierto
  // (#61). El de verdad lo anuncia el servidor desde `listening`.
  servidor = await arrancarServidor(entornoDelArnes(semilla), {
    // La misma partida con un veterano de rango 5 en la base del agente: es
    // como se cruza el ascenso, que la partida sola casi nunca produce.
    entrada: 'tools/qa/partida-con-veterano.ts',
    eco: (trozo, deError) =>
      deError
        ? process.stderr.write(`\x1b[31m${trozo}\x1b[0m`)
        : process.stdout.write(`\x1b[90m${trozo}\x1b[0m`),
    // Si el servidor se cae, no tiene sentido seguir esperando bloqueado una
    // petición que ya no va a llegar.
    alMorir: (codigo) => {
      console.error(`\x1b[31m[qa] el servidor de la partida ha muerto (código ${codigo})\x1b[0m`);
      process.exit(1);
    },
  });
  const url = `ws://localhost:${servidor.agente}`;
  log(`el servidor escucha en ${url}`);
  // Un espectador de verdad, para ver que el clima pedido le llega como a la partida.
  const espectador = new WebSocket(`ws://localhost:${servidor.espectador}`);
  espectador.on('message', (raw) => {
    ultimoFotograma = JSON.parse(String(raw)) as ServerToSpectatorMsg;
    miraElClimaDelEspectador();
  });
  espectador.on('error', (err) => log(`el canal de espectadores falla: ${err.message}`));

  log('conectando al puente MCP por stdio…');
  // `tsx` directo y NO `npx tsx`, y la diferencia son **dos segundos de los
  // cinco** que tardaba `pnpm qa`. El envoltorio mete un proceso de más entre
  // el SDK y el puente, y el cierre del SDK son dos carreras de 2 s en cadena
  // (`stdin.end()`, luego `SIGTERM`, luego `SIGKILL`): con `npx` en medio, el
  // nieto retiene las tuberías, el `'close'` no llega dentro de la ventana y
  // las dos carreras se agotan enteras. Medido, cuatro pasadas intercaladas:
  // 5,18-5,19 s con `npx` contra 3,08-3,25 s sin él, rangos sin solaparse.
  //
  // El servidor de la partida va además `detached` y se mata por grupo
  // (`servidor.ts`); a este lo cierra el SDK, que no sabe nada de grupos.
  const transport = new StdioClientTransport({
    command: 'node_modules/.bin/tsx',
    args: ['src/server/mcp/server.ts'],
    env: { ...process.env, HEROES_SERVER: url } as Record<string, string>,
  });
  const client = new Client({ name: 'qa-agent', version: '1.0.0' });
  await client.connect(transport);
  cliente = client;

  const tools = await client.listTools();
  const nombres = tools.tools.map((t) => t.name).sort();
  log(`tools publicadas: ${nombres.join(', ')}`);
  for (const obligatoria of [
    'heroes_listen',
    'heroes_respond',
    'game_state',
    'battle_state',
    'map',
    'creature_stats',
    'spell_list',
    'building_list',
  ]) {
    if (!nombres.includes(obligatoria)) throw new Error(`falta la tool "${obligatoria}"`);
  }

  // La tool `map` y el `knownMap` de cada turno devuelven el MISMO objeto desde
  // la misma función, así que su descripción también es una sola
  // (`COMO_SE_LEE_EL_MAPA`, pegada a `serializeKnownMap`). Se comprueba aquí y
  // no en un test porque `mcp/server.ts` abre el transporte al importarlo:
  // desde vitest no se puede afirmar nada de él, y lo que hay que afirmar es
  // justo lo que un cliente MCP recibe. Antes eran dos prosas escritas a mano
  // que se citaban la una a la otra, y la de la tool se había quedado sin el
  // agua infranqueable y sin los costes.
  const descripcionDelMapa = tools.tools.find((t) => t.name === 'map')?.description ?? '';
  if (!descripcionDelMapa.includes(COMO_SE_LEE_EL_MAPA)) {
    throw new Error(
      'la descripción de la tool "map" ya no lleva COMO_SE_LEE_EL_MAPA: el mismo objeto ha vuelto a tener dos prosas',
    );
  }
  log('la tool `map` publica la MISMA descripción de knownMap que el turno');

  // Consulta que no depende del turno: catálogo estático. Va por `consulta()`
  // como las otras tres —devuelve JSON igual que ellas—, y por eso ahora entra
  // en el recuento: el arnés ejercitaba cinco tools y su propio informe decía
  // cuatro, que es contar mal justo en la línea que existe para contar.
  const ficha = (await consulta(client, 'creature_stats', { creature: 'templario-escudo' })) as {
    name?: string;
    dwelling?: string | null;
    level?: number;
    powerIndex?: number;
    armor?: number;
    equipment?: Record<string, string | null>;
  };
  if (ficha.name !== 'Guerrero con escudo') {
    throw new Error(`creature_stats no devuelve la ficha: ${JSON.stringify(ficha).slice(0, 200)}`);
  }
  // El catálogo de las cinco facciones (19-10-2026): el edificio que la produce
  // viaja como `dwelling`, `level` es la primera cifra de `powerIndex`, y con su
  // equipo de serie (`equipment`, por hueco del contrato) y su armadura.
  if (
    ficha.dwelling !== 'templarios_pueblo' ||
    typeof ficha.powerIndex !== 'number' ||
    ficha.level !== Math.floor(ficha.powerIndex / 100) ||
    ficha.equipment?.melee_weapon !== 'espada' ||
    ficha.armor !== 7 ||
    'morada' in ficha ||
    'equipoDeSerie' in ficha
  ) {
    throw new Error(
      `creature_stats no trae "dwelling", "equipment", "armor", "level" y "powerIndex" como dice el contrato: ${JSON.stringify(ficha).slice(0, 400)}`,
    );
  }
  log(
    `creature_stats responde correctamente: guerrero con escudo, de ${ficha.dwelling}, índice ${ficha.powerIndex}, nivel ${ficha.level}, armadura ${ficha.armor}`,
  );

  // Los otros dos catálogos, por su CONTENIDO: antes solo se comprobaba que
  // estuvieran publicados, que es lo mismo que no comprobarlos.
  const hechizos = (await consulta(client, 'spell_list')) as { id: string }[];
  if (!hechizos.some((s) => s.id === 'haste')) {
    throw new Error(`spell_list no trae "haste": ${hechizos.map((s) => s.id).join(', ')}`);
  }
  const edificios = (await consulta(client, 'building_list')) as { id: string }[];
  if (!edificios.some((b) => b.id === 'castle')) {
    throw new Error(`building_list no trae "castle": ${edificios.length} edificios`);
  }
  log(`spell_list: ${hechizos.length} hechizos · building_list: ${edificios.length} edificios`);

  let turnos = 0;
  let batallas = 0;
  let mapas = 0;

  while (turnos < TURNOS) {
    const recibido = await client.callTool({ name: 'heroes_listen', arguments: {} });
    const texto = textoDe(recibido);

    // Los veredictos viajan pegados a la petición Y al fin de partida, así que
    // se recogen antes de mirar de qué clase es la escucha: en el fin llegan
    // los acuses de las últimas acciones, y esa es su única oportunidad.
    veredictos.push(...leeVeredictos(texto));

    // La partida puede acabarse antes de agotar los turnos —desde que el agente
    // defiende sus batallas, pierde y termina el día 3—, y eso es un final
    // limpio, no una petición ilegible. Que llegue este mensaje ES lo que se
    // verifica: antes el puente callaba y el cliente MCP moría por timeout.
    if (texto.startsWith(PREFIJO_FIN)) {
      const resumen = texto.split('\n')[0] ?? '';
      if (!/Gana el jugador|sin resolver/.test(resumen)) {
        throw new Error(`la partida acaba sin decir quién ganó:\n${resumen}`);
      }
      log(resumen);
      await terminarBien(turnos, batallas, mapas, 'terminado por fin de partida');
    }

    if (texto.startsWith(PREFIJO_RELEVO)) {
      // El arnés escucha en serie, así que esto no puede pasar: si pasa, hay dos
      // escuchas donde debería haber una y el fallo es de aquí, no del circuito.
      throw new Error(
        `una escucha ha relevado a otra, y este arnés solo llama de una en una:\n${texto.slice(0, 300)}`,
      );
    }

    if (texto.startsWith(PREFIJO_CORTE)) {
      // Se avisa en vez de colgarse, que ya es la mitad del arreglo; pero el
      // circuito se ha roto sin terminar la partida, y eso es rojo.
      throw new Error(`el canal con la partida se ha muerto:\n${texto.slice(0, 300)}`);
    }

    const kind = RE_KIND.exec(texto)?.[1];
    const payload = extraerEstado(texto);
    if (kind === undefined || payload === null)
      throw new Error(`petición ilegible:\n${texto.slice(0, 400)}`);

    // El mapa conocido, y por su CONTENIDO. Se pide aquí dentro y no al
    // conectar porque hasta que no llega una petición de TURNO no hay partida
    // que consultar: durante el `map_generate` el director todavía es `null` y
    // la consulta se rechaza diciéndolo, que es lo correcto y aquí sería ruido. Lo que se exige es lo que distingue esta tool de la vista
    // del espectador: el terreno entero —width×height, índice y*width+x— y **al
    // menos una casilla `null`**. Ese `null` ES la niebla; un mapa sin ninguno
    // sería la puerta que se tapió en #74 abierta otra vez por la tool nueva
    // (#33), y saldría verde con solo mirar que no da error.
    if (!consultadas.has('map') && kind !== 'map_generate') {
      const conocido = await consulta(client, 'map');
      const casillas = conocido.width * conocido.height;
      if (!Array.isArray(conocido.terrain) || conocido.terrain.length !== casillas) {
        const tiene = Array.isArray(conocido.terrain) ? conocido.terrain.length : 'ni un array';
        throw new Error(
          `map devuelve ${tiene} donde un mapa de ${conocido.width}×${conocido.height} son ${casillas} casillas`,
        );
      }
      const tapadas = conocido.terrain.filter((t: unknown) => t === null).length;
      if (tapadas === 0) {
        throw new Error(
          'map devuelve el mapa entero sin una sola casilla tapada: no está pasando por la niebla',
        );
      }
      log(
        `map: ${casillas} casillas, ${tapadas} tapadas por la niebla, ` +
          `${conocido.objects.length} objetos conocidos`,
      );
    }

    // La batalla, vista con los ojos del agente y mientras la está jugando: es
    // el único momento en que `battle_state` tiene algo que enseñar.
    if (kind === 'battle_turn' && !consultadas.has('battle_state')) {
      const vista = await consulta(client, 'battle_state');
      if (!Array.isArray(vista.stacks) || vista.stacks.length === 0) {
        throw new Error(
          `battle_state no enseña ninguna unidad: ${JSON.stringify(vista).slice(0, 200)}`,
        );
      }
      log(
        `battle_state: ronda ${vista.round}, ${vista.stacks.length} stacks, bando ${vista.yourSide}`,
      );
    }

    // El estado de ANTES del primer turno de aventura, para poder exigir
    // después un cambio concreto y no fiarse de que «no dio error».
    const antes =
      kind === 'adventure_turn' && cambioAplicado === null
        ? await consulta(client, 'game_state')
        : null;
    // El primer estado que se mira es el que dice en qué mapa se juega.
    if (antes !== null) exigeElMapaDelAgente(antes);

    if (kind === 'battle_turn') {
      // H-2 de la fase 1b: el agente decidía a ciegas una acción que le cuesta
      // oro. El turno trae su oro y la rendición su precio, por el MCP de verdad.
      if (typeof payload.yourGold !== 'number') {
        throw new Error(
          `el turno de batalla no trae "yourGold": ${JSON.stringify(payload).slice(0, 200)}`,
        );
      }
      const acciones: any[] = payload.legalActions ?? [];
      const rendicion = acciones.find((a) => a.type === 'surrender');
      if (rendicion !== undefined && typeof rendicion.gold !== 'number') {
        throw new Error(`"surrender" llega sin su precio: ${JSON.stringify(rendicion)}`);
      }
      rendicionOfrecida ||= rendicion !== undefined;
      // Lo que le queda de turno a la unidad: sin esto no puede repartir sus
      // casillas en tramos.
      for (const campo of ['stepsLeft', 'turnId'] as const) {
        if (typeof payload[campo] !== 'number') {
          throw new Error(
            `el turno de batalla no trae "${campo}": ${JSON.stringify(payload).slice(0, 200)}`,
          );
        }
      }
    }

    if (kind === 'adventure_turn') {
      // Solo si el ascenso entró: uno rechazado lo cuenta `exigeElAscenso` al
      // final, con su motivo, en vez de un «no está en el turno» sin contexto.
      const entro = veredictos.find((x) => x.requestId === ascenso.requestId)?.ok === true;
      if (entro && ascenso.visto === null) await cruzaElHeroeNacido(client, payload);
      for (const r of payload.knownMap?.raiders ?? []) asaltantesVistos.add(r.id);
      for (const e of payload.recentEvents ?? []) {
        cuotaDeAsaltantes.total++;
        if (String(e.kind).startsWith('raider_')) cuotaDeAsaltantes.asaltantes++;
        // La misma emboscada sale en varias ventanas seguidas: se cuenta por su
        // contenido, que la identifica sin un id que el hecho no tiene.
        if (e.kind === 'battle_started' && e.attacker?.kind === 'raider') {
          emboscadasVistas.add(JSON.stringify(e));
        }
        if (e.kind === 'dismissed') licenciasVistas.add(JSON.stringify(e));
        if (e.kind === 'item_bought') comprasVistas.add(JSON.stringify(e));
      }
      if (equipo.visto === null) await cruzaElEquipo(client, payload);
      if (payload.heroes?.some((h: any) => typeof h.strength !== 'number')) {
        throw new Error(
          'un héroe del turno llega sin "strength": el agente no puede saber si lo emboscan',
        );
      }
    }
    // La política, con los dos torcidos a propósito (`contestaElArnes`, la misma
    // que juega la búsqueda de la semilla): una vez, el primer turno de mapa con
    // un héroe, quitarle el escudo que no lleva, con el hueco en inglés (lo cuenta
    // `exigeElEscudo` con su veredicto); y la primera respuesta de la rueda, mala.
    const yaTorcido = { ...torcidos };
    let respuesta = contestaElArnes(kind, payload, semilla, torcidos);
    if (yaTorcido.escudo === null && torcidos.escudo !== null) {
      escudo.requestId = RE_PETICION.exec(texto)?.[1] ?? null;
      escudo.heroe = torcidos.escudo;
    }
    // Una vez, el primer turno de mapa: una tormenta en una región que ve y un
    // «granizo», que no es un tiempo. Lo cuenta `exigeElClima` con su veredicto.
    const vistas: { at: { x: number; y: number } }[] = payload.world?.weather ?? [];
    if (kind === 'adventure_turn' && clima.requestId === null && vistas.length > 0) {
      clima.requestId = RE_PETICION.exec(texto)?.[1] ?? null;
      clima.region = (vistas[0] as { at: { x: number; y: number } }).at;
      respuesta = {
        ...(respuesta as object),
        weather: [
          { at: clima.region, weather: 'tormenta', days: 3 },
          { at: clima.region, weather: 'granizo' },
        ],
      };
    }
    // `map_generate` se cuenta aparte y NO como turno de mapa: mezclarlo movería
    // la cifra del informe y dejaría de ser comparable con los 3 turnos y 9
    // decisiones de las pasadas anteriores.
    // El ascenso tampoco es un turno de mapa: va antes del `adventure_turn`.
    if (kind === 'battle_turn') {
      batallas++;
      decisionesDeBatalla.push({
        requestId: RE_PETICION.exec(texto)?.[1] ?? '',
        stack: String(payload.activeStack),
        turnId: Number(payload.turnId),
        accion: String((respuesta as { action: { type: string } }).action.type),
        stepsLeft: Number(payload.stepsLeft),
      });
    } else if (kind === 'battle_response') {
      // Tampoco es un turno de mapa. La primera, mal a propósito (`exigeLaRueda`).
      // Y sin el golpe del otro: si viniera, la elección no sería a ciegas.
      if ('hit' in payload || 'golpe' in payload) {
        throw new Error(
          `la petición de respuesta trae el golpe del atacante: ${JSON.stringify(payload).slice(0, 200)}`,
        );
      }
      const id = RE_PETICION.exec(texto)?.[1] ?? '';
      rueda.pedidas.push(id);
      if (!yaTorcido.mala && torcidos.mala) rueda.mala = id;
    } else if (kind === 'map_generate') mapas++;
    else if (kind === 'town_voices') {
      // Tampoco es un turno de mapa: va antes del `adventure_turn`, como el ascenso.
      voces.pedidas.push(RE_PETICION.exec(texto)?.[1] ?? '');
      voces.ultimaPayload = payload;
    } else if (kind === 'hero_from_troop') {
      ascenso.requestId = RE_PETICION.exec(texto)?.[1] ?? null;
      ascenso.nombre = String((respuesta as { name: string }).name);
    } else turnos++;

    const r = await client.callTool({
      name: 'heroes_respond',
      arguments: { response: JSON.stringify(respuesta) },
    });
    if (r.isError === true) throw new Error(`heroes_respond ha fallado: ${textoDe(r)}`);
    log(`turno ${turnos}/${TURNOS} — respondido "${kind}"`);

    if (antes !== null) await esperaElCambio(client, antes, respuesta);
  }

  await terminarBien(turnos, batallas, mapas, 'terminado');
}

function textoDe(resultado: unknown): string {
  const content = (resultado as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
}

/** El estado viaja entre las dos cabeceras que escribe `notas.ts`. */
function extraerEstado(texto: string): any | null {
  const desde = texto.indexOf(CABECERA_ESTADO);
  const hasta = texto.indexOf(CABECERA_RESPUESTA);
  if (desde < 0 || hasta < 0) return null;
  try {
    return JSON.parse(texto.slice(desde + CABECERA_ESTADO.length, hasta).trim());
  } catch {
    return null;
  }
}

main().catch(async (err) => {
  console.error('\x1b[31m[qa] ha fallado:\x1b[0m', err);
  await terminar(1);
});
