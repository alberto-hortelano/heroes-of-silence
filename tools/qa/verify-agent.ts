/**
 * Verificación de extremo a extremo del bucle del agente.
 *
 * Arranca el servidor de la partida, se conecta al puente MCP como cliente
 * real (el mismo transporte que usa Claude Code) y juega unos turnos con una
 * política tonta. Si esto pasa, el circuito completo funciona:
 *
 *   servidor ⇄ WebSocket ⇄ puente MCP ⇄ stdio ⇄ agente
 *
 * Uso: npx tsx tools/qa/verify-agent.ts
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TURNOS = Number(process.env['QA_TURNS'] ?? 6);

function log(msg: string): void {
  console.log(`\x1b[36m[qa]\x1b[0m ${msg}`);
}

const servidor = spawn('npx', ['tsx', 'src/server/ws-server.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, HEROES_MAX_DAYS: '12', HEROES_WAIT_AGENT_MS: '30000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let salidaServidor = '';
servidor.stdout.on('data', (d: Buffer) => {
  salidaServidor += d.toString();
  process.stdout.write(`\x1b[90m${d.toString()}\x1b[0m`);
});
servidor.stderr.on('data', (d: Buffer) => process.stderr.write(`\x1b[31m${d.toString()}\x1b[0m`));

// Si el servidor se cae —un puerto ya ocupado, por ejemplo— no tiene sentido
// seguir esperando bloqueado una petición que ya no va a llegar.
servidor.on('exit', (codigo) => {
  if (codigo === 0 || codigo === null) return;
  console.error(`\x1b[31m[qa] el servidor de la partida ha muerto (código ${codigo})\x1b[0m`);
  process.exit(1);
});

function terminar(codigo: number): never {
  servidor.kill('SIGTERM');
  process.exit(codigo);
}

async function main(): Promise<void> {
  log('esperando a que arranque el servidor…');
  for (let i = 0; i < 60 && !salidaServidor.includes('canal del agente'); i++) await sleep(250);
  if (!salidaServidor.includes('canal del agente')) throw new Error('el servidor no arrancó');

  log('conectando al puente MCP por stdio…');
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/server/mcp/server.ts'],
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: 'qa-agent', version: '1.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  const nombres = tools.tools.map((t) => t.name).sort();
  log(`tools publicadas: ${nombres.join(', ')}`);
  for (const obligatoria of ['heroes_listen', 'heroes_respond', 'game_state', 'creature_stats']) {
    if (!nombres.includes(obligatoria)) throw new Error(`falta la tool "${obligatoria}"`);
  }

  // Consulta que no depende del turno: catálogo estático.
  const ficha = await client.callTool({
    name: 'creature_stats',
    arguments: { creature: 'paladin' },
  });
  const fichaTexto = textoDe(ficha);
  if (!fichaTexto.includes('Paladín')) throw new Error('creature_stats no devuelve la ficha');
  log('creature_stats responde correctamente');

  let turnos = 0;
  let batallas = 0;

  while (turnos < TURNOS) {
    const recibido = await client.callTool({ name: 'heroes_listen', arguments: {} });
    const texto = textoDe(recibido);
    const kind = /kind: (\w+)/.exec(texto)?.[1];
    const payload = extraerEstado(texto);
    if (kind === undefined || payload === null) throw new Error(`petición ilegible:\n${texto.slice(0, 400)}`);

    const respuesta = decidir(kind, payload);
    if (kind === 'battle_turn') batallas++;
    else turnos++;

    const r = await client.callTool({
      name: 'heroes_respond',
      arguments: { response: JSON.stringify(respuesta) },
    });
    if (r.isError === true) throw new Error(`heroes_respond ha fallado: ${textoDe(r)}`);
    log(`turno ${turnos}/${TURNOS} — respondido "${kind}"`);
  }

  log(`terminado: ${turnos} turnos de mapa y ${batallas} decisiones de batalla`);
  await client.close();
  terminar(0);
}

function textoDe(resultado: unknown): string {
  const content = (resultado as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
}

/** El estado viaja entre "ESTADO:" y "CÓMO RESPONDER:". */
function extraerEstado(texto: string): any | null {
  const desde = texto.indexOf('ESTADO:');
  const hasta = texto.indexOf('CÓMO RESPONDER:');
  if (desde < 0 || hasta < 0) return null;
  try {
    return JSON.parse(texto.slice(desde + 'ESTADO:'.length, hasta).trim());
  } catch {
    return null;
  }
}

/** Política mínima: construir, reclutar, avanzar, y en batalla pegar. */
function decidir(kind: string, payload: any): unknown {
  switch (kind) {
    case 'adventure_turn': {
      const acciones: unknown[] = [];
      const town = payload.towns?.[0];
      if (town?.canBuildNow?.[0] !== undefined) {
        acciones.push({ type: 'build', town: town.id, building: town.canBuildNow[0].id });
      }
      const reclutable = town?.recruitable?.find((r: any) => r.available > 0);
      if (reclutable !== undefined) {
        acciones.push({
          type: 'recruit',
          town: town.id,
          creature: reclutable.creature,
          count: Math.min(2, reclutable.available),
        });
      }
      const hero = payload.heroes?.[0];
      if (hero !== undefined) {
        const objetivo = payload.knownMap?.objects?.find(
          (o: any) => (o.kind === 'resource' && !o.taken) || (o.kind === 'mine' && o.owner === null),
        );
        acciones.push({
          type: 'move_hero',
          hero: hero.id,
          to: objetivo?.at ?? { x: hero.at.x + 1, y: hero.at.y },
        });
      }
      return { actions: acciones, reasoning: 'qa: construyo, recluto y exploro' };
    }
    case 'battle_turn': {
      const acciones = payload.legalActions as any[];
      const elegida =
        acciones.find((a) => a.type === 'shoot') ??
        acciones.find((a) => a.type === 'attack') ??
        acciones.find((a) => a.type === 'move') ??
        acciones[0];
      return { action: elegida };
    }
    default:
      return {};
  }
}

main().catch((err) => {
  console.error('\x1b[31m[qa] ha fallado:\x1b[0m', err);
  terminar(1);
});
