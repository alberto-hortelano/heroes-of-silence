/**
 * El puente MCP (`src/server/mcp/server.ts`) como proceso: lo que solo se ve
 * arrancándolo de verdad.
 *
 * Su cierre (#113): cuando el agente cuelga, el stdin del puente da EOF y el
 * puente tiene que cerrar su WebSocket y salir **solo**. Durante meses no lo
 * hacía —el socket con la partida mantenía vivo el proceso— y quien lo mataba
 * era el `SIGTERM` que `StdioClientTransport.close()` manda a los dos segundos:
 * 2 de los 3,3 s de cada `pnpm qa`. Por eso aquí nadie le manda señales: se le
 * cierra el stdin y se espera a que salga por su pie, con código 0.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { type WebSocket, WebSocketServer } from 'ws';
import { AgentLink } from '../src/server/agent-link.js';
import { CABECERA_VEREDICTOS, PREFIJO_FIN } from '../src/server/notas.js';

/**
 * Lo que se le da al puente para salir tras el EOF. Sin el arreglo no sale
 * nunca: con 5 s no hay carrera posible con el plazo de 500 ms del puente.
 */
const PLAZO_PARA_SALIR_MS = 5_000;

let puente: ChildProcessWithoutNullStreams | null = null;
let partida: WebSocketServer | null = null;

afterEach(() => {
  // Si el test falla, el puente sigue vivo: es hijo de este proceso y se le
  // mata por su PID, no por su nombre.
  if (puente !== null && puente.exitCode === null && puente.signalCode === null) puente.kill();
  puente = null;
  partida?.close();
  partida = null;
});

/** Una línea de JSON-RPC, que es como habla el transporte stdio del SDK. */
function escribir(p: ChildProcessWithoutNullStreams, msg: object): void {
  p.stdin.write(`${JSON.stringify(msg)}\n`);
}

/** Espera la respuesta JSON-RPC con ese `id` en el stdout del puente. */
function respuesta(p: ChildProcessWithoutNullStreams, id: number): Promise<unknown> {
  return new Promise((resolve) => {
    let resto = '';
    const alLeer = (trozo: Buffer): void => {
      resto += String(trozo);
      const lineas = resto.split('\n');
      resto = lineas.pop() ?? '';
      for (const linea of lineas) {
        const msg = JSON.parse(linea) as { id?: number };
        if (msg.id === id) {
          p.stdout.off('data', alLeer);
          resolve(msg);
        }
      }
    };
    p.stdout.on('data', alLeer);
  });
}

describe('puente MCP como proceso', () => {
  it('al cerrarse su stdin cierra el WebSocket con la partida y sale solo, con 0', async () => {
    // Una partida de mentira: contesta a las consultas y apunta cuándo se cierra el canal.
    partida = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(partida, 'listening');
    const puerto = (partida.address() as AddressInfo).port;
    const conectado = new Promise<WebSocket>((resolve) => {
      partida?.on('connection', (ws) => {
        // Lo primero que dice un servidor de verdad (`AgentLink.attach`): sin
        // esto el puente no da el canal por abierto.
        ws.send(JSON.stringify({ type: 'partida', id: 'de-mentira' }));
        ws.on('message', (raw) => {
          const msg = JSON.parse(String(raw)) as { type: string; queryId?: string };
          if (msg.type === 'query') {
            ws.send(
              JSON.stringify({ type: 'query_result', queryId: msg.queryId, ok: true, data: {} }),
            );
          }
        });
        resolve(ws);
      });
    });

    const p = spawn('node_modules/.bin/tsx', ['src/server/mcp/server.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, HEROES_SERVER: `ws://127.0.0.1:${puerto}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    puente = p;
    let errores = '';
    p.stderr.on('data', (t: Buffer) => {
      errores += String(t);
    });

    escribir(p, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    });
    await respuesta(p, 1);
    escribir(p, { jsonrpc: '2.0', method: 'notifications/initialized' });
    // La conexión con la partida es perezosa: una consulta la abre, que es lo
    // que retenía el proceso.
    escribir(p, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'game_state', arguments: {} },
    });
    await respuesta(p, 2);
    const ws = await conectado;
    const canalCerrado = once(ws, 'close');

    p.stdin.end();
    const salida = await Promise.race([
      once(p, 'exit') as Promise<[number | null, NodeJS.Signals | null]>,
      new Promise<'colgado'>((r) => setTimeout(() => r('colgado'), PLAZO_PARA_SALIR_MS)),
    ]);

    expect(
      salida,
      `el puente sigue vivo ${PLAZO_PARA_SALIR_MS} ms después del EOF de su stdin. stderr:\n${errores}`,
    ).toEqual([0, null]);
    await canalCerrado;
  });
});

/** Arranca el puente contra `url` y lo deja inicializado como cliente MCP. */
async function arrancarPuente(url: string): Promise<ChildProcessWithoutNullStreams> {
  const p = spawn('node_modules/.bin/tsx', ['src/server/mcp/server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HEROES_SERVER: url },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  puente = p;
  escribir(p, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    },
  });
  await respuesta(p, 1);
  escribir(p, { jsonrpc: '2.0', method: 'notifications/initialized' });
  return p;
}

let idDeLlamada = 10;
/** Llama a una tool del puente y devuelve su texto. */
async function llamar(
  p: ChildProcessWithoutNullStreams,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  idDeLlamada += 1;
  const id = idDeLlamada;
  const vuelta = respuesta(p, id);
  escribir(p, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  const r = (await vuelta) as { result: { content: { text: string }[] } };
  return r.result.content.map((c) => c.text).join('\n');
}

/**
 * Un servidor que sirve partidas de verdad (`AgentLink`) por un solo puerto, y
 * al que se le puede cambiar la partida: `reinicia` corta los canales abiertos
 * —el servidor que se muere— y las conexiones siguientes van a otro enlace,
 * que es lo que ve el puente cuando alguien relanza `pnpm partida`.
 */
async function servidorDePartidas(primera: AgentLink): Promise<{
  url: string;
  reinicia: (siguiente: AgentLink) => Promise<void>;
  apaga: () => Promise<void>;
}> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  partida = wss;
  await once(wss, 'listening');
  let actual: AgentLink = primera;
  const vivos = new Set<WebSocket>();
  wss.on('connection', (ws) => {
    vivos.add(ws);
    ws.on('close', () => vivos.delete(ws));
    actual.attach(ws);
  });
  const cortaLosCanales = async (): Promise<void> => {
    const cerrados = [...vivos].map((ws) => once(ws, 'close'));
    for (const ws of vivos) ws.close();
    await Promise.all(cerrados);
    // El `close` del lado del puente llega a la vez que este; un respiro para
    // que su siguiente escucha no se cruce con él.
    await new Promise((r) => setTimeout(r, 100));
  };
  return {
    url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`,
    reinicia: async (siguiente) => {
      actual = siguiente;
      await cortaLosCanales();
    },
    apaga: async () => {
      wss.close();
      await cortaLosCanales();
    },
  };
}

/**
 * Una respuesta que no encaja en el esquema: el enlace la rechaza y manda un
 * veredicto, que es justo lo que se queda en el buzón del puente.
 */
const RESPUESTA_MALA = '{"nada": true}';

/**
 * Pide una decisión de batalla y se queda con el error que acabará dando. El
 * rechazo se recoge YA: esperarlo después de `heroes_respond` lo dejaba un rato
 * sin manejar y vitest lo cuenta como error.
 */
function pedir(link: AgentLink, payload: object): Promise<unknown> {
  return link.ask('battle_turn', payload).then(
    () => 'aceptada',
    (err: unknown) => err,
  );
}

describe('puente MCP entre dos partidas (#118)', () => {
  it('la primera escucha de una partida nueva no trae los veredictos de la anterior', async () => {
    const a = new AgentLink(5_000);
    const servidor = await servidorDePartidas(a);
    const p = await arrancarPuente(servidor.url);

    const escuchaA = llamar(p, 'heroes_listen');
    expect(await a.esperaPrimerAgente(5_000)).toBe(true);
    const pideA = pedir(a, { de: 'A' });
    expect(await escuchaA).toContain('"de": "A"');
    await llamar(p, 'heroes_respond', { response: RESPUESTA_MALA });
    expect(String(await pideA)).toMatch(/respuesta inválida/);

    // El servidor de A se muere con el veredicto aún sin recoger, y arranca B.
    const b = new AgentLink(5_000);
    await servidor.reinicia(b);

    const escuchaB = llamar(p, 'heroes_listen');
    expect(await b.esperaPrimerAgente(5_000)).toBe(true);
    const pideB = pedir(b, { de: 'B' });
    const textoB = await escuchaB;
    expect(textoB).toContain('"de": "B"');
    expect(textoB, 'la escucha de B trae un veredicto de A').not.toContain(CABECERA_VEREDICTOS);

    await llamar(p, 'heroes_respond', { response: RESPUESTA_MALA });
    expect(String(await pideB)).toMatch(/respuesta inválida/);
  }, 15_000);

  it('una partida terminada no tapa a la siguiente que arranca en el mismo puerto', async () => {
    const a = new AgentLink(5_000);
    const servidor = await servidorDePartidas(a);
    const p = await arrancarPuente(servidor.url);

    const escuchaA = llamar(p, 'heroes_listen');
    expect(await a.esperaPrimerAgente(5_000)).toBe(true);
    const pideA = pedir(a, { de: 'A' });
    await escuchaA;
    await llamar(p, 'heroes_respond', { response: RESPUESTA_MALA });
    expect(String(await pideA)).toMatch(/respuesta inválida/);
    a.gameOver(0, 'La partida A ha terminado.');

    // El fin de A, con su veredicto: ahí sí, que es la misma partida.
    const finA = await llamar(p, 'heroes_listen');
    expect(finA.startsWith(PREFIJO_FIN)).toBe(true);
    expect(finA).toContain(CABECERA_VEREDICTOS);

    const b = new AgentLink(5_000);
    await servidor.reinicia(b);

    const escuchaB = llamar(p, 'heroes_listen');
    expect(await b.esperaPrimerAgente(5_000)).toBe(true);
    const pideB = pedir(b, { de: 'B' });
    const textoB = await escuchaB;
    expect(textoB, 'la escucha de B repite el final de A').not.toContain('La partida A');
    expect(textoB).toContain('"de": "B"');
    expect(textoB).not.toContain(CABECERA_VEREDICTOS);

    await llamar(p, 'heroes_respond', { response: RESPUESTA_MALA });
    expect(String(await pideB)).toMatch(/respuesta inválida/);
  }, 15_000);

  it('terminada la partida y apagado el servidor, la escucha sigue contando cómo acabó', async () => {
    // Lo que ya hacía antes y no se puede perder: buscar otra partida tras el
    // final no puede convertir un servidor apagado en un error.
    const a = new AgentLink(5_000);
    const servidor = await servidorDePartidas(a);
    const p = await arrancarPuente(servidor.url);

    await llamar(p, 'game_state'); // abre el canal; la partida no contesta consultas
    expect(await a.esperaPrimerAgente(5_000)).toBe(true);
    a.gameOver(0, 'La partida A ha terminado.');
    expect((await llamar(p, 'heroes_listen')).startsWith(PREFIJO_FIN)).toBe(true);

    await servidor.apaga();
    const otraVez = await llamar(p, 'heroes_listen');
    expect(otraVez.startsWith(PREFIJO_FIN)).toBe(true);
    expect(otraVez).toContain('La partida A');
  }, 15_000);

  it('si el canal se corta y vuelve a la MISMA partida, el veredicto pendiente llega igual', async () => {
    // La otra cara: el veredicto llega SIEMPRE pegado a la siguiente petición de
    // su partida. Una desconexión pasajera no es otra partida.
    const a = new AgentLink(5_000);
    const servidor = await servidorDePartidas(a);
    const p = await arrancarPuente(servidor.url);

    const escucha1 = llamar(p, 'heroes_listen');
    expect(await a.esperaPrimerAgente(5_000)).toBe(true);
    const pide1 = pedir(a, { turno: 1 });
    await escucha1;
    await llamar(p, 'heroes_respond', { response: RESPUESTA_MALA });
    expect(String(await pide1)).toMatch(/respuesta inválida/);

    await servidor.reinicia(a);

    const escucha2 = llamar(p, 'heroes_listen');
    // El puente reconecta en esta escucha: se espera a que esté atado.
    for (let i = 0; i < 50 && !a.connected; i++) await new Promise((r) => setTimeout(r, 20));
    expect(a.connected).toBe(true);
    const pide2 = pedir(a, { turno: 2 });
    const texto2 = await escucha2;
    expect(texto2).toContain('"turno": 2');
    expect(texto2).toContain(CABECERA_VEREDICTOS);
    expect(texto2).toContain('req-1');

    await llamar(p, 'heroes_respond', { response: RESPUESTA_MALA });
    expect(String(await pide2)).toMatch(/respuesta inválida/);
  }, 15_000);
});
