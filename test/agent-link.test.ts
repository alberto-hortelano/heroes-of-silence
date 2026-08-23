import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { AgentLink } from '../src/server/agent-link.js';
import { Director } from '../src/server/director.js';

/** Agente de mentira: responde leyendo el payload, como haría uno de verdad. */
interface FakeAgent {
  readonly socket: WebSocket;
  readonly seen: { kind: string; payload: unknown }[];
  close: () => void;
}

const abiertos: (() => void)[] = [];
afterEach(() => {
  for (const cerrar of abiertos.splice(0)) cerrar();
});

async function montar(
  responder: (kind: string, payload: any) => unknown,
): Promise<{ link: AgentLink; agent: FakeAgent }> {
  const wss = new WebSocketServer({ port: 0 });
  await once(wss, 'listening');
  const { port } = wss.address() as AddressInfo;

  const link = new AgentLink(4000);
  wss.on('connection', (s) => link.attach(s));

  const socket = new WebSocket(`ws://localhost:${port}`);
  await once(socket, 'open');

  const seen: { kind: string; payload: unknown }[] = [];
  socket.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'request') return;
    seen.push({ kind: msg.kind, payload: msg.payload });
    socket.send(
      JSON.stringify({ type: 'response', requestId: msg.requestId, data: responder(msg.kind, msg.payload) }),
    );
  });

  socket.send(JSON.stringify({ type: 'hello', client: 'test' }));
  // Un respiro para que el servidor registre la conexión.
  await new Promise((r) => setTimeout(r, 50));

  const agent: FakeAgent = { socket, seen, close: () => socket.close() };
  abiertos.push(() => {
    socket.close();
    wss.close();
  });
  return { link, agent };
}

describe('enlace con el agente', () => {
  it('el agente juega su turno y el motor aplica sus acciones', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'adventure_turn') return {};
      // Decide leyendo SOLO lo que trae la petición: si esto basta, el
      // contrato es suficiente para jugar.
      const town = payload.towns[0];
      const hero = payload.heroes[0];
      const acciones: unknown[] = [];
      if (town?.canBuildNow?.[0] !== undefined) {
        acciones.push({ type: 'build', town: town.id, building: town.canBuildNow[0].id });
      }
      const reclutable = town?.recruitable?.find((r: any) => r.available > 0);
      if (reclutable !== undefined) {
        acciones.push({ type: 'recruit', town: town.id, creature: reclutable.creature, count: 1 });
      }
      if (hero !== undefined) {
        acciones.push({ type: 'move_hero', hero: hero.id, to: { x: hero.at.x + 1, y: hero.at.y } });
      }
      return { actions: acciones, reasoning: 'construyo, recluto y avanzo' };
    });

    const director = new Director(link, { seed: 101, agentPlayers: [0] });
    expect(link.connected).toBe(true);

    const antes = director.state.towns[0]!.buildings.length;
    const informe = await director.playTurn();

    expect(informe.by).toBe('agent');
    expect(informe.actions).toBeGreaterThan(0);
    expect(agent.seen[0]?.kind).toBe('adventure_turn');
    expect(director.state.towns[0]!.buildings.length).toBe(antes + 1);
    // Y el turno ha pasado al rival.
    expect(director.state.current).not.toBe(0);
  });

  it('una acción ilegal se descarta, se le cuenta al agente y el turno sigue', async () => {
    const { link } = await montar((kind, payload) => {
      if (kind !== 'adventure_turn') return {};
      const town = payload.towns[0];
      return {
        actions: [
          { type: 'move_hero', hero: 'no-existe', to: { x: 1, y: 1 } },
          { type: 'build', town: town.id, building: town.canBuildNow[0].id },
        ],
      };
    });

    const director = new Director(link, { seed: 102, agentPlayers: [0] });
    const informe = await director.playTurn();

    expect(informe.by).toBe('agent');
    expect(informe.problems.length).toBe(1);
    expect(informe.problems[0]).toMatch(/héroe desconocido/);
    // La acción buena de después sí se aplicó.
    expect(informe.actions).toBe(1);
  });

  it('una respuesta que no cumple el esquema no toca el estado', async () => {
    const { link } = await montar(() => ({ actions: [{ type: 'invocar_dragón' }] }));
    const director = new Director(link, { seed: 103, agentPlayers: [0] });

    const informe = await director.playTurn();

    // Cae en la IA de reglas, que sí construye: lo que importa es que la
    // respuesta inválida no se aplicó a medias.
    expect(informe.by).toBe('heuristic');
    expect(informe.problems[0]).toMatch(/respuesta inválida/);
    expect(director.state.finished).toBeNull();
  });

  it('sin agente conectado, juega la IA de reglas', async () => {
    const link = new AgentLink(500);
    const director = new Director(link, { seed: 104, agentPlayers: [0] });
    const informe = await director.playTurn();
    expect(informe.by).toBe('heuristic');
    expect(director.state.current).not.toBe(0);
  });

  it('si el agente se calla, el turno no se queda colgado', async () => {
    const wss = new WebSocketServer({ port: 0 });
    await once(wss, 'listening');
    const { port } = wss.address() as AddressInfo;

    const link = new AgentLink(300); // tiempo de espera muy corto
    wss.on('connection', (s) => link.attach(s));
    const mudo = new WebSocket(`ws://localhost:${port}`);
    await once(mudo, 'open');
    await new Promise((r) => setTimeout(r, 50));
    abiertos.push(() => {
      mudo.close();
      wss.close();
    });

    const director = new Director(link, { seed: 105, agentPlayers: [0] });
    const informe = await director.playTurn();

    expect(informe.by).toBe('heuristic');
    expect(informe.problems[0]).toMatch(/no respondió/);
  });

  it('el agente puede jugar una batalla acción a acción', async () => {
    let peticionesDeBatalla = 0;
    const { link } = await montar((kind, payload) => {
      if (kind === 'adventure_turn') {
        const hero = payload.heroes[0];
        // Se busca un monstruo visible y se le echa encima el héroe.
        const monstruo = payload.knownMap.objects.find(
          (o: any) => o.kind === 'monster' && !o.defeated,
        );
        if (monstruo === undefined) return { actions: [] };
        return { actions: [{ type: 'move_hero', hero: hero.id, to: monstruo.at }] };
      }
      if (kind === 'battle_turn') {
        peticionesDeBatalla++;
        // Elegir de "legalActions" nunca falla: es la promesa del contrato.
        const acciones = payload.legalActions as any[];
        const ataque = acciones.find((a) => a.type === 'attack') ?? acciones[0];
        return { action: ataque };
      }
      return {};
    });

    const director = new Director(link, { seed: 106, agentPlayers: [0] });
    // Se le descubre el mapa: con la niebla inicial no vería ningún monstruo
    // al que atacar, y el test no probaría nada.
    for (let y = 0; y < director.state.map.height; y++) {
      for (let x = 0; x < director.state.map.width; x++) {
        director.state.players[0]!.fog.add(`${x},${y}`);
      }
    }
    // Se le da un ejército de sobra para que la batalla la gane él.
    director.state.heroes[0]!.army = [
      { creature: 'paladin', count: 40 },
      null,
      null,
      null,
      null,
    ];
    director.state.heroes[0]!.movePoints = 20000;

    const informe = await director.playTurn();

    expect(informe.by).toBe('agent');
    expect(peticionesDeBatalla).toBeGreaterThan(0);
    expect(director.state.pendingBattle).toBeNull();
    expect(director.state.log.some((e) => e.kind === 'battle_ended')).toBe(true);
  });
});
