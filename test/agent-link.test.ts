import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { creature } from '../src/core/data.js';
import type { Hero } from '../src/core/hero/hero.js';
import { pointKey, reachableFrom } from '../src/core/map/map.js';
import { cronicaPara, sinSello, visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  type GameContext,
  type GameState,
  revealEverything,
} from '../src/core/state/game.js';
import type { Town } from '../src/core/town/town.js';
import type { Point } from '../src/core/types.js';
import { AgentLink } from '../src/server/agent-link.js';
import { responderConsulta } from '../src/server/consultas.js';
import { Director } from '../src/server/director.js';

/** Agente de mentira: responde leyendo el payload, como haría uno de verdad. */
interface FakeAgent {
  readonly socket: WebSocket;
  readonly seen: { requestId: string; kind: string; payload: any }[];
  /** Los veredictos que le llegan de vuelta: la otra mitad del canal. */
  readonly results: { requestId: string; ok: boolean; problems?: string[]; note?: string }[];
  /** El aviso de fin de partida, que llega sin haberlo pedido. */
  readonly finales: { winner: number | null; note: string }[];
  close: () => void;
}

/** Un respiro para que el socket entregue lo que el servidor acaba de mandar. */
async function respira(ms = 60): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

const abiertos: (() => void)[] = [];
afterEach(() => {
  for (const cerrar of abiertos.splice(0)) cerrar();
});

/**
 * Un servidor de mentira atado a `link`, sin nadie al otro lado todavía.
 *
 * Separado de `montar` porque hay tres cosas que mirar ANTES de que llegue el
 * agente: que se le espera, que no se le espera dos veces, y que el aviso de fin
 * de partida sobrevive a que no hubiera nadie escuchando.
 */
async function servidorDePruebas(link: AgentLink): Promise<string> {
  const wss = new WebSocketServer({ port: 0 });
  await once(wss, 'listening');
  wss.on('connection', (s) => link.attach(s));
  abiertos.push(() => wss.close());
  return `ws://localhost:${(wss.address() as AddressInfo).port}`;
}

/**
 * Un agente conectado a `link`.
 *
 * `responder` puede devolver `undefined`: eso es **un agente que se calla**, que
 * antes se montaba a mano y copiado en dos sitios —y sin registrar el socket en
 * `abiertos`, así que el puerto se quedaba abierto—.
 */
async function conectaAgente(
  url: string,
  responder: (kind: string, payload: any) => unknown,
): Promise<FakeAgent> {
  const socket = new WebSocket(url);
  const seen: FakeAgent['seen'] = [];
  const results: FakeAgent['results'] = [];
  const finales: FakeAgent['finales'] = [];
  // El oyente se ata ANTES de esperar a `open`, como hace el puente de verdad:
  // atarlo después pierde lo que el servidor mande nada más conectar, que es
  // justo el aviso de fin de partida guardado para quien llega tarde.
  socket.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === 'game_over') {
      finales.push({ winner: msg.winner, note: msg.note });
      return;
    }
    if (msg.type === 'result') {
      results.push({
        requestId: msg.requestId,
        ok: msg.ok,
        problems: msg.problems,
        note: msg.note,
      });
      return;
    }
    if (msg.type !== 'request') return;
    seen.push({ requestId: msg.requestId, kind: msg.kind, payload: msg.payload });
    const data = responder(msg.kind, msg.payload);
    // `undefined` es un agente que se calla: ni contesta ni se le fuerza a ello.
    if (data === undefined) return;
    socket.send(JSON.stringify({ type: 'response', requestId: msg.requestId, data }));
  });
  await once(socket, 'open');

  socket.send(JSON.stringify({ type: 'hello', client: 'test' }));
  // Un respiro para que el servidor registre la conexión.
  await respira(50);

  abiertos.push(() => socket.close());
  return { socket, seen, results, finales, close: () => socket.close() };
}

async function montar(
  responder: (kind: string, payload: any) => unknown,
  plazoMs = 4000,
): Promise<{ link: AgentLink; agent: FakeAgent }> {
  const link = new AgentLink(plazoMs);
  const agent = await conectaAgente(await servidorDePruebas(link), responder);
  return { link, agent };
}

/** La casilla pisable más cercana a `desde`, para plantar a alguien al lado. */
function vecina(state: GameState, desde: Point): Point {
  const [clave] = [...reachableFrom(state.map, desde).costs.entries()]
    .filter(([, coste]) => coste > 0)
    .sort((a, b) => a[1] - b[1])[0]!;
  const [x, y] = clave.split(',').map(Number);
  return { x: x as number, y: y as number };
}

/**
 * Planta al héroe del rival junto a `objetivo` con lo justo para llegar.
 *
 * Los puntos de movimiento son exactos a propósito: con 20000 el rival ganaba
 * la batalla y seguía andando hasta quedarse con el castillo vacío del agente,
 * que entonces perdía la partida en el mismo turno — y el test dejaba de medir
 * lo que decía medir.
 */
function plantarRival(state: GameState, objetivo: Point): Hero {
  const rival = state.heroes.find((h) => h.owner === 0) as Hero;
  rival.at = vecina(state, objetivo);
  rival.army = [{ creature: 'paladin', count: 40 }, null, null, null, null];
  rival.movePoints = reachableFrom(state.map, rival.at).costs.get(pointKey(objetivo)) ?? 200;
  return rival;
}

/**
 * Monta lo único que el agente no podía vivir hasta ahora: que le ataquen.
 *
 * El héroe del rival (jugador 0) aparece pegado al del agente (jugador 1) con
 * un ejército aplastante, que es lo que `chooseHeroDestination` necesita para
 * decidirse a atacarlo. Devuelve el héroe del agente, el que va a defender.
 */
function rivalAlAtaque(state: GameState): Hero {
  const mio = state.heroes.find((h) => h.owner === 1) as Hero;
  plantarRival(state, mio.at);
  return mio;
}

/**
 * Una batalla en la que el agente NO participa: el rival contra un monstruo.
 *
 * Es el único modo de tener una batalla ajena en una partida de dos, y hace
 * falta para ejercer la rama de «no estás en esta batalla» sin inventarse un
 * jugador que no lleva nadie.
 */
function rivalContraMonstruo(state: GameState, ctx: GameContext): void {
  const monstruo = state.map.objects.find((o) => o.kind === 'monster' && !o.defeated);
  if (monstruo === undefined) throw new Error('el mapa no trae ningún monstruo vivo');
  const rival = plantarRival(state, monstruo.at);
  applyAdventureAction(state, { type: 'move_hero', hero: rival.id, to: monstruo.at }, ctx, 0);
}

/** Lo mismo, pero contra un castillo del agente. Sin murallas: eso es #7. */
function rivalAlCastillo(state: GameState): Town {
  const pueblo = state.towns.find((t) => t.owner === 1) as Town;
  const mio = state.heroes.find((h) => h.owner === 1) as Hero;

  // El héroe del agente se lleva lejos: pegado al castillo, el rival preferiría
  // atacarle a él y este test no miraría lo que dice mirar.
  const lejos = [...reachableFrom(state.map, pueblo.at).costs.entries()]
    .filter(([, coste]) => coste > 900)
    .sort((a, b) => a[1] - b[1])[0];
  if (lejos === undefined) throw new Error('el mapa no da para alejar al héroe del castillo');
  const [x, y] = lejos[0].split(',').map(Number);
  mio.at = { x: x as number, y: y as number };

  pueblo.garrison = [{ creature: 'skeleton', count: 30 }, null, null, null, null];
  plantarRival(state, pueblo.at);
  return pueblo;
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

  it('si el agente se calla, el turno no se queda colgado y se le DICE que llegó tarde', async () => {
    const { link, agent } = await montar(() => undefined, 300);

    const director = new Director(link, { seed: 105, agentPlayers: [0] });
    const informe = await director.playTurn();
    await respira();

    expect(informe.by).toBe('heuristic');
    expect(informe.problems[0]).toMatch(/no respondió/);

    // El plazo agotado borraba la petición y rechazaba SIN mandar ningún
    // `result`: el agente perdía el turno y su siguiente escucha no traía una
    // línea sobre ese `requestId`. Es el silencio ambiguo justo donde más
    // importa distinguir «se perdió» de «llegó tarde».
    const aviso = agent.results.find((r) => r.requestId === agent.seen[0]!.requestId);
    expect(aviso?.ok).toBe(false);
    expect(aviso?.note).toContain('No llegó tu respuesta a "adventure_turn"');
    expect(aviso?.note).toMatch(/no lo contestes/);
  });

  it('al agente se le espera la primera vez, y SOLO la primera', async () => {
    // El servidor sondeaba `connected` hasta agotar el plazo antes de CADA
    // turno. Con el puente caído a mitad, una partida de 200 días se convertía
    // en horas de nada esperando a alguien que ya no iba a volver.
    const link = new AgentLink(500);
    const url = await servidorDePruebas(link);

    const esperando = link.esperaPrimerAgente(30_000);
    const agent = await conectaAgente(url, () => ({ actions: [] }));
    expect(await esperando).toBe(true);

    agent.close();
    await respira();
    expect(link.connected).toBe(false);

    const desde = Date.now();
    expect(await link.esperaPrimerAgente(30_000)).toBe(false);
    // Sin esperar: ya vino alguien una vez, y eso no se olvida.
    expect(Date.now() - desde).toBeLessThan(500);
  });

  it('al reconectar, el `close` del agente VIEJO no mata la petición del nuevo', async () => {
    // `attach` cierra el socket anterior, pero su `close` llega DESPUÉS de que el
    // nuevo esté atado, y `failAll` se llamaba sin la guarda que la línea de
    // encima sí tenía. Resultado: el agente recién conectado perdía su primer
    // turno sin haber hecho nada, y encima recibía un veredicto diciéndole que
    // se había desconectado — estando conectado.
    //
    // El orden se fija a mano y no se sortea: el viejo se pausa, así que no
    // contesta al cierre y su `close` se queda esperando hasta que se le
    // reanuda. Ese es el instante en el que muerde el fallo.
    const link = new AgentLink(2000);
    const url = await servidorDePruebas(link);

    const viejo = await conectaAgente(url, () => undefined);
    // El motivo se recoge en el acto: el rechazo llega DENTRO del `attach` del
    // nuevo, y una promesa rechazada sin nadie escuchando es un
    // `unhandledRejection` que vitest cuenta como error del fichero entero.
    const fallo = link.ask('adventure_turn', { day: 1 }).catch((err: Error) => err.message);
    await respira(20);
    viejo.socket.pause();

    const nuevo = await conectaAgente(url, () => undefined);
    expect(await fallo).toMatch(/relevo/);

    // La petición del NUEVO, en vuelo y sin contestar todavía.
    const segunda = link.ask('adventure_turn', { day: 1 });
    await respira();
    expect(nuevo.seen).toHaveLength(1);

    // Y ahora sí: llega el `close` del socket viejo.
    viejo.socket.resume();
    await respira();

    // El nuevo sigue siendo el agente, y su petición sigue viva.
    expect(link.connected).toBe(true);
    nuevo.socket.send(
      JSON.stringify({
        type: 'response',
        requestId: nuevo.seen[0]!.requestId,
        data: { actions: [] },
      }),
    );
    const respuesta = await segunda;
    expect(respuesta.requestId).toBe(nuevo.seen[0]!.requestId);

    // Y no se le ha contado una desconexión que no ha tenido.
    const mentira = nuevo.results.find((r) => /desconectado/.test(r.note ?? ''));
    expect(mentira).toBeUndefined();
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
    revealEverything(director.state, 0);
    // Se le da un ejército de sobra para que la batalla la gane él.
    director.state.heroes[0]!.army = [{ creature: 'paladin', count: 40 }, null, null, null, null];
    director.state.heroes[0]!.movePoints = 20000;

    const informe = await director.playTurn();

    expect(informe.by).toBe('agent');
    expect(peticionesDeBatalla).toBeGreaterThan(0);
    expect(director.state.pendingBattle).toBeNull();
    expect(director.state.log.some((e) => e.kind === 'battle_ended')).toBe(true);
  });
});

describe('el agente defiende', () => {
  it('cuando el rival le ataca un héroe, la batalla se le ofrece acción a acción', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'battle_turn') return { actions: [] };
      // De `legalActions` nunca falla: es la promesa del contrato, y el
      // defensor la tiene igual que el atacante.
      return { action: payload.legalActions[0] };
    });

    const director = new Director(link, { seed: 201, agentPlayers: [1] });
    const mio = rivalAlAtaque(director.state);
    const misCriaturas = new Set(mio.army.flatMap((s) => (s === null ? [] : [s.creature])));
    expect(director.state.current).toBe(0); // el turno es del RIVAL

    await director.playTurn();

    const batallas = agent.seen.filter((p) => p.kind === 'battle_turn');
    expect(batallas.length).toBeGreaterThan(0);
    // El bando bien orientado: lo suyo es lo suyo.
    for (const peticion of batallas) {
      expect(peticion.payload.yourSide).toBe('defender');
      const mios = peticion.payload.stacks.filter((s: any) => s.side === 'defender');
      expect(mios.length).toBeGreaterThan(0);
      for (const s of mios) expect(misCriaturas.has(s.creature)).toBe(true);
    }
    // Y sus acciones entraron: no es una consulta decorativa.
    await respira();
    const acuses = agent.results.filter((r) => batallas.some((p) => p.requestId === r.requestId));
    expect(acuses.some((r) => r.ok)).toBe(true);
    expect(director.state.pendingBattle).toBeNull();
  });

  it('también defiende un castillo suyo, sin héroe propio en el tablero', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'battle_turn') return { actions: [] };
      return { action: payload.legalActions[0] };
    });

    const director = new Director(link, { seed: 202, agentPlayers: [1] });
    const pueblo = rivalAlCastillo(director.state);

    await director.playTurn();

    const batallas = agent.seen.filter((p) => p.kind === 'battle_turn');
    expect(batallas.length).toBeGreaterThan(0);
    expect(batallas[0]!.payload.yourSide).toBe('defender');
    // Un castillo defiende con su guarnición y sin héroe: sin murallas, que
    // siguen siendo #7.
    expect(batallas[0]!.payload.hero).toBeNull();
    const guarnicion = batallas[0]!.payload.stacks.filter((s: any) => s.side === 'defender');
    expect(guarnicion.every((s: any) => s.creature === 'skeleton')).toBe(true);
    expect(pueblo.at).toBeDefined();
    expect(director.state.pendingBattle).toBeNull();
  });

  it('si el agente se calla defendiendo, la termina la heurística y el turno pasa', async () => {
    const { link } = await montar(() => undefined, 300);

    const director = new Director(link, { seed: 203, agentPlayers: [1] });
    rivalAlAtaque(director.state);

    await director.playTurn();

    // La partida no se detiene por un agente callado, defendiendo tampoco.
    expect(director.state.pendingBattle).toBeNull();
    expect(director.state.log.some((e) => e.kind === 'battle_ended')).toBe(true);
    expect(director.state.current).toBe(1);
    expect(director.log.some((l) => /falló en la batalla/.test(l))).toBe(true);
  });

  it('la consulta battle_state le enseña su bando, no el del atacante', async () => {
    // El segundo `'attacker'` cableado del racimo: `ws-server.ts` servía esta
    // tool con el bando fijo, así que un agente defensor la consultaba y veía
    // sus propios stacks marcados como del enemigo.
    // Las vistas se toman DENTRO de la decisión del agente, que es el único
    // momento en el que hay una batalla en curso que consultar.
    let vistaDelAgente: any = null;
    let vistaDelRival: any = null;
    let director!: Director;

    const { link } = await montar((kind, payload) => {
      if (kind !== 'battle_turn') return { actions: [] };
      if (vistaDelAgente === null) {
        vistaDelAgente = responderConsulta(director, 'battle_state', { player: 1 });
        // La del rival ya no se pide con el director del agente —eso es la fuga
        // que cierra el candado de más abajo—, sino con la misma partida vista
        // por un agente que llevara al 0. Lo que se sigue afirmando es lo mismo:
        // el bando se DERIVA del dueño.
        vistaDelRival = responderConsulta(
          { state: director.state, agentPlayers: new Set([0]) },
          'battle_state',
          { player: 0 },
        );
      }
      return { action: payload.legalActions[0] };
    });

    director = new Director(link, { seed: 204, agentPlayers: [1] });
    const mio = rivalAlAtaque(director.state);

    await director.playTurn();

    expect(vistaDelAgente.yourSide).toBe('defender');
    expect(vistaDelRival.yourSide).toBe('attacker');
    // Y lo que ve como suyo es de verdad suyo.
    const misCriaturas = new Set(mio.army.flatMap((s) => (s === null ? [] : [s.creature])));
    const mios = vistaDelAgente.stacks.filter((s: any) => s.side === vistaDelAgente.yourSide);
    expect(mios.length).toBeGreaterThan(0);
    for (const s of mios) expect(misCriaturas.has(s.creature)).toBe(true);
  });

  it('a un jugador SUYO que no está en la batalla se le avisa en vez de mentirle', async () => {
    // El rival se pelea con un monstruo neutral: una batalla de verdad en la que
    // el agente no pinta nada. Antes esto se probaba preguntando por el «jugador
    // 7», que ya no llega hasta aquí — lo para el candado del jugador, y la
    // rama de «no estás en esta batalla» se quedaría sin nadie que la ejerza.
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 205, agentPlayers: [1] });
    rivalContraMonstruo(director.state, director.ctx);
    expect(director.state.pendingBattle).not.toBeNull();

    const vista = responderConsulta(director, 'battle_state', { player: 1 }) as any;
    expect(vista.yourSide).toBe('attacker');
    expect(vista.note).toMatch(/no está en esta batalla/);
  });
});

/**
 * El parámetro `player` de las consultas, que era la puerta de al lado.
 *
 * El ciclo de #59 cerró la crónica del rival por la puerta principal —lo que
 * llega en `adventure_turn`— y dejó esta abierta y anunciada en la tool: pedir
 * `game_state{player:0}` devolvía la crónica del rival, sus recursos, sus héroes
 * y sus castillos. Lo que se afirma aquí es el EFECTO: que eso ya no sale por el
 * cable, se pida como se pida.
 */
describe('una consulta solo habla de los jugadores que lleva el agente', () => {
  /**
   * Lo que una consulta ENTREGA de verdad, en JSON, o cadena vacía si la
   * rechaza.
   *
   * Se mide lo que sale por el cable y no el mecanismo del rechazo a propósito:
   * una fuga es que el dato aparezca, venga como respuesta o disfrazado de nota.
   * El motivo lo mira el `toThrow` de al lado, que es lo otro que se promete.
   */
  function entregado(
    partida: { state: GameState; agentPlayers: ReadonlySet<number> },
    what: string,
    args: Record<string, unknown>,
  ): string {
    try {
      return JSON.stringify(responderConsulta(partida, what, args));
    } catch (err) {
      // Rechazada: no entrega nada, que es justo lo que este test quiere medir.
      // No se traga el error — lo devuelve como «cero bytes entregados».
      if (!(err instanceof Error)) throw err;
      return '';
    }
  }

  it('game_state del rival ya no devuelve su crónica, y dice por cuál preguntar', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 401, agentPlayers: [1] });
    // Un puñado de turnos de la IA para que los dos tengan diario propio.
    for (let i = 0; i < 8; i++) await director.playTurn();

    // Los hechos que le constan al rival y a mí NO, dentro de su ventana de 25:
    // exactamente lo que este ciclo dejó de mandar por la puerta principal.
    const ventana = new Set(cronicaPara(director.state, 0, 25).map((e) => JSON.stringify(e)));
    const soloSuyos = director.state.log
      .filter((e) => visibleTo(e, 0) && !visibleTo(e, 1))
      .map((e) => JSON.stringify(sinSello(e)))
      .filter((s) => ventana.has(s));
    expect(soloSuyos.length).toBeGreaterThan(0);

    const fugado = entregado(director, 'game_state', { player: 0 });
    for (const hecho of soloSuyos) expect(fugado).not.toContain(hecho);
    // Y tampoco lo demás que iba en el mismo paquete: el punto de vista entero.
    expect(fugado).not.toContain('"player":0');

    // Se rechaza DICIÉNDOLO, y nombrando el jugador que sí lleva: es lo único
    // con lo que el agente puede corregirse en vez de reintentar.
    expect(() => responderConsulta(director, 'game_state', { player: 0 })).toThrow(
      /no es tuyo.*Llevas el jugador 1/s,
    );

    // Lo suyo sigue llegando entero.
    const mio = JSON.parse(entregado(director, 'game_state', { player: 1 }));
    expect(mio.you.player).toBe(1);
    expect(mio.recentEvents.length).toBeGreaterThan(0);
  });

  it('sin `player` se contesta por el suyo, sea cual sea, y no por un 1 escrito a mano', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 402, agentPlayers: [0] });
    const vista = JSON.parse(entregado(director, 'game_state', {})) as any;
    expect(vista.you.player).toBe(0);
  });

  it('battle_state del rival tampoco: su maná y su libro no salen', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 403, agentPlayers: [1] });
    const mio = rivalAlAtaque(director.state);
    const rival = director.state.heroes.find((h) => h.owner === 0) as Hero;
    applyAdventureAction(
      director.state,
      { type: 'move_hero', hero: rival.id, to: mio.at },
      director.ctx,
      rival.owner,
    );
    expect(director.state.pendingBattle).not.toBeNull();

    // La vista del atacante trae `hero`: nombre, maná y hechizos del héroe
    // rival. Preguntar por él era leerle el libro.
    expect(entregado(director, 'battle_state', { player: 0 })).toBe('');
    expect(() => responderConsulta(director, 'battle_state', { player: 0 })).toThrow(
      /no es tuyo.*Llevas el jugador 1/s,
    );

    const mia = JSON.parse(entregado(director, 'battle_state', { player: 1 })) as any;
    expect(mia.yourSide).toBe('defender');
    expect(mia.hero.name).toBe(mio.name);
  });

  it('un jugador que no existe se rechaza igual, y con el mismo motivo', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 404, agentPlayers: [1] });
    expect(() => responderConsulta(director, 'game_state', { player: 7 })).toThrow(
      /jugador 7: no es tuyo/,
    );
  });

  it('un agente con dos jugadores los nombra los dos y contesta por los dos', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 405, agentPlayers: [1, 0] });
    for (const id of [0, 1]) {
      const vista = JSON.parse(entregado(director, 'game_state', { player: id })) as any;
      expect(vista.you.player).toBe(id);
    }
    expect(() => responderConsulta(director, 'game_state', { player: 7 })).toThrow(
      /Llevas los jugadores 0, 1/,
    );
  });
});

describe('el agente sabe cómo le fue', () => {
  it('un turno de aventura limpio devuelve UN result con ok y su nota', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'adventure_turn') return {};
      const town = payload.towns[0];
      return { actions: [{ type: 'build', town: town.id, building: town.canBuildNow[0].id }] };
    });

    const director = new Director(link, { seed: 301, agentPlayers: [0] });
    await director.playTurn();
    await respira();

    const aventura = agent.seen.find((p) => p.kind === 'adventure_turn')!;
    const veredictos = agent.results.filter((r) => r.requestId === aventura.requestId);
    // Uno por turno, ni cero ni dos.
    expect(veredictos).toHaveLength(1);
    expect(veredictos[0]!.ok).toBe(true);
    expect(veredictos[0]!.note).toMatch(/1 acción/);
    expect(veredictos[0]!.problems).toBeUndefined();
  });

  it('un turno con una acción ilegal lo cuenta con su motivo', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'adventure_turn') return {};
      const town = payload.towns[0];
      return {
        actions: [
          { type: 'move_hero', hero: 'no-existe', to: { x: 1, y: 1 } },
          { type: 'build', town: town.id, building: town.canBuildNow[0].id },
        ],
      };
    });

    const director = new Director(link, { seed: 302, agentPlayers: [0] });
    await director.playTurn();
    await respira();

    const aventura = agent.seen.find((p) => p.kind === 'adventure_turn')!;
    const veredicto = agent.results.find((r) => r.requestId === aventura.requestId)!;
    expect(veredicto.ok).toBe(true);
    expect(veredicto.note).toMatch(/1 de 2/);
    expect(veredicto.problems?.[0]).toMatch(/héroe desconocido/);
  });

  it('lo que va detrás de un end_turn se cuenta, no desaparece', async () => {
    // El `break` del `end_turn` tiraba las acciones siguientes sin aplicarlas,
    // sin meterlas en `problems` y sin contarlas: con
    // `[build, end_turn, build, recruit]` el agente recibía
    // `{"actions":1,"problems":[]}` y «Turno del día 1 aplicado entero: 1
    // acción». Dos acciones desaparecidas y cero palabras sobre ellas, que es el
    // silencio ambiguo que este canal promete no tener — y `end_turn` está en la
    // lista de acciones válidas del contrato, así que no es un uso retorcido.
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'adventure_turn') return {};
      const town = payload.towns[0];
      const reclutable = town.recruitable.find((r: any) => r.available > 0);
      return {
        actions: [
          { type: 'build', town: town.id, building: town.canBuildNow[0].id },
          { type: 'end_turn' },
          { type: 'build', town: town.id, building: town.canBuildNow[1].id },
          { type: 'recruit', town: town.id, creature: reclutable.creature, count: 1 },
        ],
      };
    });

    const director = new Director(link, { seed: 308, agentPlayers: [0] });
    const construidos = director.state.towns.find((t) => t.owner === 0)!.buildings.length;
    const informe = await director.playTurn();
    await respira();

    // Ni se aplican a escondidas: el turno se cerró y se quedó cerrado.
    expect(director.state.towns.find((t) => t.owner === 0)!.buildings.length).toBe(construidos + 1);
    expect(director.state.current).not.toBe(0);

    // Y se cuentan las cuatro: la que entró, el cierre, y las dos que no.
    expect(informe.problems).toHaveLength(2);
    for (const p of informe.problems) expect(p).toMatch(/detrás de tu end_turn/);
    const veredicto = agent.results.find((r) => r.requestId === agent.seen[0]!.requestId)!;
    expect(veredicto.note).toMatch(/2 de 4/);
    expect(veredicto.note).not.toMatch(/aplicado entero/);
    // Con el nombre de cada una, para poder volver a pedirlas mañana.
    expect(veredicto.problems).toHaveLength(2);
    expect(veredicto.problems!.some((p) => p.startsWith('recruit'))).toBe(true);
  });

  it('una acción de batalla que cuela también se acusa, en una línea', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'battle_turn') return { actions: [] };
      return { action: payload.legalActions[0] };
    });

    const director = new Director(link, { seed: 303, agentPlayers: [1] });
    const mio = rivalAlAtaque(director.state);
    // Un campeón (7 hexes) contra los 40 paladines del rival (alcance 5+1): en
    // la ronda 1 mueve primero, no llega a nadie, y avanzar lo dejaría a tiro
    // de quien todavía no ha actuado. Eso es exactamente la regla de #52, así
    // que la sustituta de la heurística es un `wait`. Montado a mano y no
    // buscado por semilla: el ejército de salida no da esa escena nunca.
    mio.army = [{ creature: 'champion', count: 5 }, null, null, null, null];
    await director.playTurn();
    await respira();

    const batallas = agent.seen.filter((p) => p.kind === 'battle_turn');
    expect(batallas.length).toBeGreaterThan(0);
    const acuses = agent.results.filter(
      (r) => r.ok && batallas.some((p) => p.requestId === r.requestId),
    );
    expect(acuses.length).toBeGreaterThan(0);
    // Una línea corta, no un informe: el precio de no callar nunca.
    for (const a of acuses) {
      expect(a.note).toMatch(/aplicada\.$/);
      expect(a.note!.length).toBeLessThan(80);
    }
  });

  it('una acción de batalla rechazada dice qué jugó la IA y qué costó', async () => {
    const { link, agent } = await montar((kind) => {
      if (kind !== 'battle_turn') return { actions: [] };
      // Legal en el esquema y sin sentido en el tablero: el motor la rechaza y
      // la heurística juega en su lugar, que es lo que hay que contar.
      return { action: { type: 'attack', target: 'no-existe' } };
    });

    const director = new Director(link, { seed: 304, agentPlayers: [1] });
    rivalAlAtaque(director.state);
    await director.playTurn();
    await respira();

    const batallas = agent.seen.filter((p) => p.kind === 'battle_turn');
    expect(batallas.length).toBeGreaterThan(0);
    const rechazos = agent.results.filter(
      (r) => !r.ok && batallas.some((p) => p.requestId === r.requestId),
    );
    expect(rechazos.length).toBeGreaterThan(0);

    let conTurnoGastado = 0;
    let conManaGastado = 0;
    for (const r of rechazos) {
      expect(r.problems?.[0]).toBeTruthy();
      expect(r.note).toMatch(/juega la IA de reglas en tu lugar/);
      // Se clasifica por la FRASE entera, no por la letra de antes. El detector
      // de antes era `/[^O] ha consumido el turno/`, y sobre un `cast` con 0 de
      // maná daba `true`: contaba como «gastó el turno» exactamente el caso que
      // la nota existe para no afirmar.
      const diceTurnoGastado = r.note!.includes('Eso ha consumido el turno de');
      const diceNoConsumido = r.note!.includes('Eso NO ha consumido el turno de');
      const diceTerminada = r.note!.includes('ha TERMINADO la batalla');
      const diceMana = /de maná/.test(r.note!);
      // Una de las TRES frases, exactamente: ni dos ni ninguna. La tercera es la
      // sustituta que remata, y en esta misma batalla sale (`req-5`): con dos
      // ramas, esa nota hablaba del turno de una unidad en una ronda que ya no
      // iba a jugarse.
      expect([diceTurnoGastado, diceNoConsumido, diceTerminada].filter(Boolean)).toHaveLength(1);
      // Y el maná solo se menciona donde el turno NO se consumió.
      if (diceMana) expect(diceTurnoGastado).toBe(false);
      if (diceTurnoGastado) conTurnoGastado++;
      if (diceMana) conManaGastado++;
    }
    // Y las DOS ramas salen de verdad en esta batalla: la heurística sustituta
    // lanza `magic_arrow` cuando le compensa. Si la nota fuera una fórmula fija
    // —«te ha costado el turno»— aquí estaría mintiendo.
    expect(conTurnoGastado).toBeGreaterThan(0);
    expect(conManaGastado).toBeGreaterThan(0);
  });

  it('un hechizo sustituto que TERMINA la batalla no promete otra petición', async () => {
    // La nota del `cast` decía siempre «se te volverá a pedir acción para ella».
    // Si el hechizo remata —`spellValue` valora explícitamente el golpe que mata,
    // `min(daño, hp)`— el bucle sale por `battle.finished` y esa petición no
    // llega nunca: el agente se queda esperando el turno de la unidad que acaba
    // de ganar. El escenario está montado para forzarlo, que es lo que QA no
    // consiguió en una partida de verdad.
    const { link, agent } = await montar((kind, payload) => {
      if (kind === 'adventure_turn') {
        const monstruo = payload.knownMap.objects.find(
          (o: any) => o.kind === 'monster' && !o.defeated,
        );
        if (monstruo === undefined) throw new Error('el mapa de esta semilla no trae monstruos');
        return { actions: [{ type: 'move_hero', hero: payload.heroes[0].id, to: monstruo.at }] };
      }
      // Legal en el esquema y sin sentido en el tablero: la juega la heurística.
      if (kind === 'battle_turn') return { action: { type: 'attack', target: 'no-existe' } };
      return {};
    });

    const director = new Director(link, { seed: 307, agentPlayers: [0] });
    revealEverything(director.state, 0);

    const heroe = director.state.heroes.find((h) => h.owner === 0) as Hero;
    heroe.army = [{ creature: 'paladin', count: 40 }, null, null, null, null];
    heroe.movePoints = 20000;
    // Con qué se remata: una flecha que se lleva al monstruo entero de una.
    heroe.spells = ['magic_arrow'];
    heroe.mana = 20;
    heroe.spellPower = 10; // 10 + 10×poder = 110 de daño

    const monstruo = director.state.map.objects.find((o) => o.kind === 'monster' && !o.defeated);
    if (monstruo === undefined || monstruo.kind !== 'monster') throw new Error('sin monstruo');
    // Justo por encima del umbral de la heurística (4 PV por punto de maná × 3):
    // por debajo no lanzaría, y por encima de 110 no mataría de una.
    monstruo.count = Math.max(1, Math.ceil(12 / creature(monstruo.creature).hp));

    await director.playTurn();
    await respira();

    const batallas = agent.seen.filter((p) => p.kind === 'battle_turn');
    // UNA sola petición: la promesa de otra habría sido falsa, y esto lo mide.
    expect(batallas).toHaveLength(1);
    const veredicto = agent.results.find((r) => r.requestId === batallas[0]!.requestId)!;
    expect(veredicto.ok).toBe(false);
    expect(veredicto.note).toContain('hechizo magic_arrow');
    expect(veredicto.note).toContain('ha TERMINADO la batalla');
    expect(veredicto.note).not.toContain('se te volverá a pedir acción');
    expect(director.state.pendingBattle).toBeNull();
  });

  it('una espera sustituta se explica como espera, y no promete la petición a secas', async () => {
    // La cuarta rama de `notaAccionSustituida`, la que abrió #52, y la única que
    // `pnpm qa` no puede ejercitar: su partida no descarta ni una acción, así
    // que nunca llega a haber sustituta. Aquí sí, y por el camino de verdad —
    // director, heurística y canal—, no llamando a la función a mano.
    //
    // La escena está MONTADA, no buscada por semilla: con el ejército de salida
    // el defensor nunca es el más rápido del tablero, y la regla de #52 solo
    // compra algo a quien tiene enemigos pendientes detrás en la cola.
    const { link, agent } = await montar((kind) => {
      if (kind !== 'battle_turn') return { actions: [] };
      // Legal en el esquema, imposible en el tablero: la juega la heurística.
      return { action: { type: 'attack', target: 'no-existe' } };
    });

    const director = new Director(link, { seed: 303, agentPlayers: [1] });
    const mio = rivalAlAtaque(director.state);
    // Un campeón (7 hexes) contra los 40 paladines del rival (alcance 5+1). Es
    // el más rápido, así que abre la ronda: no llega a nadie desde su borde, y
    // el paso adelante lo dejaría a tiro de quien todavía no ha actuado. Esa es
    // exactamente la regla de #52, así que la sustituta de la heurística es un
    // `wait`. Con el ejército de salida del nigromante no pasa: el paladín es
    // más rápido que el esqueleto y que el zombi, y mueve antes que los dos.
    mio.army = [{ creature: 'champion', count: 5 }, null, null, null, null];

    await director.playTurn();
    await respira();
    const esperas = agent.results.filter((r) => r.note?.includes('en tu lugar: espera.') === true);
    expect(esperas.length).toBeGreaterThan(0);
    for (const r of esperas) {
      expect(r.ok).toBe(false);
      // No consume el turno: eso era la mentira original.
      expect(r.note).toContain('Eso NO ha consumido el turno de');
      expect(r.note).not.toContain('Eso ha consumido el turno de');
      // Y la petición prometida va CONDICIONADA: de 476 esperas medidas, 101
      // —el 21,2 %— no la reciben porque el stack muere o la batalla acaba
      // mientras espera. Prometerla a secas era la misma mentira una casilla
      // más allá.
      expect(r.note).toContain('actuará al final de la ronda');
      expect(r.note).toMatch(/SI llega viva/);
      // Y no se le cobra un maná que no ha perdido.
      expect(r.note).not.toMatch(/de maná/);
    }
  });

  it('dos veredictos entre dos peticiones llegan los dos, en orden', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind === 'battle_turn') return { action: payload.legalActions[0] };
      return { actions: [] };
    });

    const director = new Director(link, { seed: 305, agentPlayers: [1] });
    rivalAlAtaque(director.state);

    await director.playTurn(); // turno del rival: batalla defendida
    await director.playTurn(); // turno del agente: informe de aventura
    await respira();

    const deBatalla = agent.seen.filter((p) => p.kind === 'battle_turn').map((p) => p.requestId);
    const deAventura = agent.seen
      .filter((p) => p.kind === 'adventure_turn')
      .map((p) => p.requestId);
    expect(deBatalla.length).toBeGreaterThan(0);
    expect(deAventura.length).toBeGreaterThan(0);

    // Los dos tipos de veredicto conviven en el mismo canal, sin pisarse.
    expect(agent.results.filter((r) => deBatalla.includes(r.requestId)).length).toBeGreaterThan(0);
    expect(agent.results.filter((r) => deAventura.includes(r.requestId)).length).toBe(1);
    // Y el informe del turno llega DESPUÉS de los acuses de sus batallas: un
    // veredicto que adelanta a su petición hablaría de otra cosa.
    const ultimoDeBatalla = agent.results.reduce(
      (ultimo, r, i) => (deBatalla.includes(r.requestId) ? i : ultimo),
      -1,
    );
    const elDeAventura = agent.results.findIndex((r) => deAventura.includes(r.requestId));
    expect(elDeAventura).toBeGreaterThan(ultimoDeBatalla);
  });

  it('el aviso de fin de partida viaja por el cable tal cual', async () => {
    // Lo único de este test es el CABLE: qué dice la nota se lee en
    // `notas.test.ts`, sin montar una partida entera para volver a afirmarlo.
    const { link, agent } = await montar(() => ({ actions: [] }));

    link.gameOver(0, 'Gana el jugador 0 (knight) — has perdido.');
    await respira();

    expect(agent.finales).toHaveLength(1);
    expect(agent.finales[0]!.winner).toBe(0);
    expect(agent.finales[0]!.note).toBe('Gana el jugador 0 (knight) — has perdido.');
  });

  it('una partida que revienta también se cuenta, sin inventarse un ganador', async () => {
    const { link, agent } = await montar(() => ({ actions: [] }));

    link.gameOver(
      null,
      'La partida se ha interrumpido por un fallo del servidor: se acabó el mapa',
    );
    await respira();

    expect(agent.finales).toHaveLength(1);
    expect(agent.finales[0]!.winner).toBeNull();
    expect(agent.finales[0]!.note).toContain('fallo del servidor');
  });

  it('quien conecta DESPUÉS del final también se entera', async () => {
    // El aviso se mandaba una vez y `send` no hace nada sin socket: un puente
    // que conectaba o reconectaba después de acabar la partida no lo recibía
    // NUNCA y su `heroes_listen` se bloqueaba para siempre. Es el cuelgue que
    // este ciclo vino a cerrar, en el único camino donde el agente no puede
    // diagnosticarlo: reinicio de la sesión, caída del puente al final.
    const link = new AgentLink(500);
    const url = await servidorDePruebas(link);

    link.gameOver(1, 'Gana el jugador 1 (necromancer) — has ganado.');
    const tardon = await conectaAgente(url, () => ({ actions: [] }));
    await respira();

    expect(tardon.finales).toHaveLength(1);
    expect(tardon.finales[0]!.winner).toBe(1);
    expect(tardon.finales[0]!.note).toContain('has ganado');
  });

  it('una respuesta que no valida se le explica, con nota además de problemas', async () => {
    const { link, agent } = await montar(() => ({ actions: [{ type: 'invocar_dragón' }] }));
    const director = new Director(link, { seed: 306, agentPlayers: [0] });

    await director.playTurn();
    await respira();

    expect(agent.results).toHaveLength(1);
    expect(agent.results[0]!.ok).toBe(false);
    expect(agent.results[0]!.note).toMatch(/IA de reglas/);
    expect(agent.results[0]!.problems?.length).toBeGreaterThan(0);
  });
});
