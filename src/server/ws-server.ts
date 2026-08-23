/**
 * Servidor de la partida.
 *
 * Abre dos canales: uno para el agente (por donde entra el puente MCP) y otro
 * para quien quiera mirar la partida desde el navegador. La partida avanza
 * sola; si el agente no está conectado cuando le toca, se le espera un rato y,
 * si no aparece, juega la IA de reglas.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { creature } from '@core/data.js';
import { AgentLink } from './agent-link.js';
import { Director } from './director.js';
import { AGENT_PORT, SPECTATOR_PORT, type ServerToSpectatorMsg } from './protocol.js';
import { serializeAdventureTurn, serializeBattleTurn } from '@core/contract/serialize.js';

const SEED = Number(process.env['HEROES_SEED'] ?? 20260823);
const MAX_DAYS = Number(process.env['HEROES_MAX_DAYS'] ?? 200);
/** Cuánto se espera a que el agente se conecte antes de tirar de heurística. */
const WAIT_FOR_AGENT_MS = Number(process.env['HEROES_WAIT_AGENT_MS'] ?? 120_000);

const link = new AgentLink();
const director = new Director(link, { seed: SEED, agentPlayers: [1] });

// ---------------------------------------------------------------- consultas

link.onQuery((what, args) => {
  switch (what) {
    case 'game_state': {
      const player = Number(args['player'] ?? 1);
      return serializeAdventureTurn(director.state, player);
    }
    case 'battle_state': {
      const pending = director.state.pendingBattle;
      if (pending === null) return { battle: null, note: 'ahora mismo no hay ninguna batalla' };
      return serializeBattleTurn(pending.battle, 'attacker');
    }
    case 'map': {
      const state = director.state;
      return {
        width: state.map.width,
        height: state.map.height,
        terrain: state.map.terrain,
        roads: [...state.map.roads],
        objects: state.map.objects,
      };
    }
    default:
      throw new Error(`consulta desconocida: "${what}"`);
  }
});

// ---------------------------------------------------------------- agente

const agentServer = new WebSocketServer({ port: AGENT_PORT });
agentServer.on('connection', (socket) => {
  console.log('[servidor] el puente del agente se ha conectado');
  link.attach(socket);
});
console.log(`[servidor] canal del agente en ws://localhost:${AGENT_PORT}`);

// ---------------------------------------------------------------- mirones

const spectators = new Set<WebSocket>();
const spectatorServer = new WebSocketServer({ port: SPECTATOR_PORT });
spectatorServer.on('connection', (socket) => {
  spectators.add(socket);
  socket.on('close', () => spectators.delete(socket));
  broadcast();
});
console.log(`[servidor] canal de espectadores en ws://localhost:${SPECTATOR_PORT}`);

function broadcast(): void {
  if (spectators.size === 0) return;
  const state = director.state;
  const msg: ServerToSpectatorMsg = {
    type: 'snapshot',
    day: state.day,
    current: state.current,
    finished: state.finished,
    view: {
      map: {
        width: state.map.width,
        height: state.map.height,
        terrain: state.map.terrain,
        roads: [...state.map.roads],
        objects: state.map.objects,
      },
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        faction: p.faction,
        resources: p.resources,
        defeated: p.defeated,
        fog: [...p.fog],
      })),
      heroes: state.heroes.map((h) => ({
        id: h.id,
        owner: h.owner,
        name: h.name,
        at: h.at,
        movePoints: h.movePoints,
        army: h.army,
      })),
      towns: state.towns.map((t) => ({
        id: t.id,
        owner: t.owner,
        name: t.name,
        at: t.at,
        buildings: t.buildings,
        garrison: t.garrison,
      })),
      log: state.log.slice(-40),
      directorLog: director.log.slice(-20),
    },
  };
  const raw = JSON.stringify(msg);
  for (const s of spectators) {
    if (s.readyState === s.OPEN) s.send(raw);
  }
}

// ---------------------------------------------------------------- partida

async function esperarAgente(): Promise<void> {
  if (link.connected) return;
  console.log(
    `[servidor] esperando al agente hasta ${Math.round(WAIT_FOR_AGENT_MS / 1000)} s…\n` +
      '           conéctalo abriendo Claude Code en otra terminal de este proyecto\n' +
      '           y pidiéndole que juegue con las tools heroes_listen / heroes_respond.',
  );
  const hasta = Date.now() + WAIT_FOR_AGENT_MS;
  while (!link.connected && Date.now() < hasta) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!link.connected) console.log('[servidor] no ha venido nadie; juega la IA de reglas.');
}

async function jugar(): Promise<void> {
  while (!director.finished && director.state.day <= MAX_DAYS) {
    if (director.agentPlayers.has(director.state.current)) await esperarAgente();

    const informe = await director.playTurn();
    console.log(
      `[servidor] día ${director.state.day} · jugador ${informe.player} · ` +
        `${informe.by === 'agent' ? 'agente' : 'reglas'} · ${informe.actions} acciones` +
        (informe.problems.length > 0 ? ` · ${informe.problems.length} rechazadas` : ''),
    );
    broadcast();
  }

  const state = director.state;
  console.log('\n──────── fin de la partida ────────');
  console.log(
    state.finished === null
      ? `Sin resolver tras ${MAX_DAYS} días.`
      : `Gana el jugador ${state.finished.winner}.`,
  );
  for (const p of state.players) {
    const heroes = state.heroes.filter((h) => h.owner === p.id);
    const pueblos = state.towns.filter((t) => t.owner === p.id);
    const tropas = heroes
      .flatMap((h) => h.army.filter((s) => s !== null))
      .map((s) => `${s!.count}×${creature(s!.creature).name}`)
      .join(', ');
    console.log(
      `  jugador ${p.id} (${p.faction}): ${pueblos.length} castillos, ${heroes.length} héroes` +
        (tropas === '' ? '' : ` — ${tropas}`),
    );
  }
  console.log(`  minas en juego: ${state.map.objects.filter((o) => o.kind === 'mine').length}`);
  console.log(`  casillas exploradas por el agente: ${state.players[1]?.fog.size ?? 0}`);
  broadcast();
}

jugar().catch((err) => {
  console.error('[servidor] la partida ha reventado:', err);
  process.exitCode = 1;
});
