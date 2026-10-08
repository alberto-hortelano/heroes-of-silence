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
