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
 *  3. **Las cinco tools de consulta**, por su contenido y no por su ausencia de
 *     error: `battle_state` en plena batalla, `game_state`, `creature_stats`,
 *     `spell_list` y `building_list`. Todas pasan por `consulta()`, así que el
 *     recuento del final cuenta lo que de verdad se ha ejercitado.
 *
 * Uso: npx tsx tools/qa/verify-agent.ts
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CABECERA_ESTADO,
  CABECERA_RESPUESTA,
  leeVeredictos,
  MARCA_KIND,
  PREFIJO_CORTE,
  PREFIJO_FIN,
  PREFIJO_RELEVO,
  SANGRIA_PROBLEMA,
  type Veredicto,
} from '../../src/server/notas.js';
import { decidir } from './politica.js';

const TURNOS = Number(process.env.QA_TURNS ?? 6);
/** El kind de la petición, leído por el marcador que lo escribe `notas.ts`. */
const RE_KIND = new RegExp(`${MARCA_KIND}(\\w+)`);

function log(msg: string): void {
  console.log(`\x1b[36m[qa]\x1b[0m ${msg}`);
}

// `detached` le da al servidor su propio grupo de procesos, y por eso: `npx` no
// reenvía la señal a su hijo, así que matar al envoltorio dejaba vivo el
// servidor de la partida con el puerto 9881 cogido — y el siguiente `pnpm qa`
// moría con EADDRINUSE antes de verificar nada. Con el grupo se mata entero.
const servidor = spawn('npx', ['tsx', 'src/server/ws-server.ts'], {
  cwd: process.cwd(),
  // Puerto 0 en los dos canales: lo elige el sistema. Antes eran literales, y
  // `pnpm qa` salía 1 con EADDRINUSE en cuanto había un `pnpm partida` abierto —
  // que es la forma documentada de jugar con el agente. Con 0 no hay puerto que
  // chocar, así que el arnés convive con la partida de al lado (#61).
  env: {
    ...process.env,
    HEROES_MAX_DAYS: '12',
    HEROES_WAIT_AGENT_MS: '30000',
    HEROES_AGENT_PORT: '0',
    HEROES_SPECTATOR_PORT: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

let salidaServidor = '';
let servidorVivo = true;
/** El cliente MCP, aquí fuera para poder cerrarlo desde `terminar`. */
let cliente: Client | null = null;
servidor.stdout.on('data', (d: Buffer) => {
  salidaServidor += d.toString();
  process.stdout.write(`\x1b[90m${d.toString()}\x1b[0m`);
});
servidor.stderr.on('data', (d: Buffer) => process.stderr.write(`\x1b[31m${d.toString()}\x1b[0m`));

// Si el servidor se cae —un puerto ya ocupado, por ejemplo— no tiene sentido
// seguir esperando bloqueado una petición que ya no va a llegar.
servidor.on('exit', (codigo) => {
  servidorVivo = false;
  if (codigo === 0 || codigo === null) return;
  console.error(`\x1b[31m[qa] el servidor de la partida ha muerto (código ${codigo})\x1b[0m`);
  process.exit(1);
});

function pararServidor(): void {
  // Señalar un pid ya recogido puede alcanzar a otro proceso que haya heredado
  // ese número: dos líneas de guarda por no jugársela.
  if (!servidorVivo || servidor.pid === undefined) return;
  servidorVivo = false;
  try {
    // El menos es el grupo entero: el envoltorio de `npx` y el node de dentro.
    process.kill(-servidor.pid, 'SIGTERM');
  } catch (err) {
    // ESRCH es que ya se había muerto solo. Cualquier otra cosa hay que verla:
    // significa que el puerto se queda cogido y el siguiente `pnpm qa` es rojo
    // por un motivo que no tiene nada que ver con lo que verifica.
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
      console.error(`\x1b[31m[qa] no se ha podido parar el servidor: ${String(err)}\x1b[0m`);
    }
  }
}

async function terminar(codigo: number): Promise<never> {
  // El puente MCP es un hijo aparte (`npx tsx mcp/server.ts`) y solo se muere
  // cuando su stdin da EOF, que es lo que hace `close()`: sin esto se quedaba
  // suelto después de cada pasada.
  if (cliente !== null) {
    const c = cliente;
    cliente = null;
    await c.close().catch(() => {});
  }
  pararServidor();
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
/** Qué cambió en la partida por haberlo pedido. `null` = todavía sin comprobar. */
let cambioAplicado: string | null = null;

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

/** Un veredicto con sus motivos debajo, sangrados como los escribe el puente. */
function detalle(v: Veredicto): string {
  return `${v.requestId}: ${v.nota}${v.problemas.map((p) => `\n${SANGRIA_PROBLEMA}${p}`).join('')}`;
}

/** El recuento de veredictos, y el rojo si alguna respuesta entera se cayó. */
function informaVeredictos(): void {
  const entraron = veredictos.filter((v) => v.ok);
  const descartadas = veredictos.filter((v) => !v.ok);
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

/** Cierra con el resumen de todo lo que se ha verificado. */
async function terminarBien(turnos: number, batallas: number, motivo: string): Promise<void> {
  informaVeredictos();

  if (cambioAplicado === null) {
    throw new Error('no se ha llegado a comprobar que ninguna acción se aplicara de verdad');
  }
  const faltan = ['game_state', 'creature_stats', 'spell_list', 'building_list'].filter(
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
  log(`consultas ejercitadas: ${[...consultadas].sort().join(', ')}`);
  log(`${motivo}: ${turnos} turnos de mapa y ${batallas} decisiones de batalla`);
  await terminar(0);
}

/** La URL que el servidor acaba de anunciar, con el puerto que le tocó de verdad. */
const RE_CANAL = /canal del agente en (ws:\/\/\S+)/;

async function main(): Promise<void> {
  log('esperando a que arranque el servidor…');
  for (let i = 0; i < 60 && !RE_CANAL.test(salidaServidor); i++) await sleep(250);
  const anuncio = RE_CANAL.exec(salidaServidor);
  if (anuncio === null) throw new Error('el servidor no arrancó');
  // No se puede suponer: el puerto se lo acaba de dar el sistema, y esta traza
  // la escribe el servidor desde `listening`, o sea cuando ya está escuchando.
  const url = anuncio[1] as string;
  log(`el servidor escucha en ${url}`);

  log('conectando al puente MCP por stdio…');
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/server/mcp/server.ts'],
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
    'creature_stats',
    'spell_list',
    'building_list',
  ]) {
    if (!nombres.includes(obligatoria)) throw new Error(`falta la tool "${obligatoria}"`);
  }

  // Consulta que no depende del turno: catálogo estático. Va por `consulta()`
  // como las otras tres —devuelve JSON igual que ellas—, y por eso ahora entra
  // en el recuento: el arnés ejercitaba cinco tools y su propio informe decía
  // cuatro, que es contar mal justo en la línea que existe para contar.
  const ficha = (await consulta(client, 'creature_stats', { creature: 'paladin' })) as {
    name?: string;
  };
  if (ficha.name !== 'Paladín') {
    throw new Error(`creature_stats no devuelve la ficha: ${JSON.stringify(ficha).slice(0, 200)}`);
  }
  log('creature_stats responde correctamente');

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
      await terminarBien(turnos, batallas, 'terminado por fin de partida');
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

    const respuesta = decidir(kind, payload);
    if (kind === 'battle_turn') batallas++;
    else turnos++;

    const r = await client.callTool({
      name: 'heroes_respond',
      arguments: { response: JSON.stringify(respuesta) },
    });
    if (r.isError === true) throw new Error(`heroes_respond ha fallado: ${textoDe(r)}`);
    log(`turno ${turnos}/${TURNOS} — respondido "${kind}"`);

    if (antes !== null) await esperaElCambio(client, antes, respuesta);
  }

  await terminarBien(turnos, batallas, 'terminado');
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
