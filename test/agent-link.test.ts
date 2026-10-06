import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { activeStack, applyAction } from '../src/core/battle/battle.js';
import { creature } from '../src/core/data.js';
import { type Hero, heroUnit } from '../src/core/hero/hero.js';
import {
  generateMapPlan,
  LADO_DEL_MAPA,
  type MapPlan,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { pointFromKey, pointKey, reachableFrom } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { cronicaPara, sinSello, visibleTo } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  baseOf,
  type GameContext,
  type GameState,
  MAX_HEROES_PER_PLAYER,
  revealEverything,
} from '../src/core/state/game.js';
import type { Town } from '../src/core/town/town.js';
import type { Point } from '../src/core/types.js';
import { AgentLink } from '../src/server/agent-link.js';
import { responderConsulta } from '../src/server/consultas.js';
import { Director } from '../src/server/director.js';
import { pedirMapaAlAgente } from '../src/server/mapa-del-agente.js';
import { SIN_PARTIDA_TODAVIA } from '../src/server/notas.js';
import { ponVeteranoEnLaBase } from '../tools/qa/veterano-en-la-base.js';
import { conCaminos, ejercito, ponerMonstruo, sinGuarnicionDeSalida } from './helpers.js';

/** Agente de mentira: responde leyendo el payload, como haría uno de verdad. */
interface FakeAgent {
  readonly socket: WebSocket;
  readonly seen: { requestId: string; kind: string; payload: any }[];
  /** Los veredictos que le llegan de vuelta: la otra mitad del canal. */
  readonly results: { requestId: string; ok: boolean; problems?: string[]; note?: string }[];
  /** El aviso de fin de partida, que llega sin haberlo pedido. */
  readonly finales: { winner: number | null; note: string }[];
  /**
   * Una consulta fuera de turno, por el cable y no llamando a `responderConsulta`.
   *
   * Los demás tests de consultas preguntan directamente al módulo, que es más
   * barato y basta para lo que miran. Esto hace falta cuando lo que se
   * comprueba es qué le LLEGA al agente: que un rechazo viaja como
   * `query_result ok:false` con su motivo, y no como un socket que se muere.
   */
  pregunta: (
    what: string,
    args?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
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
  const esperando = new Map<string, (r: { ok: boolean; data?: unknown; error?: string }) => void>();
  let contador = 0;
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
    if (msg.type === 'query_result') {
      esperando.get(msg.queryId)?.({ ok: msg.ok, data: msg.data, error: msg.error });
      esperando.delete(msg.queryId);
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
  const pregunta: FakeAgent['pregunta'] = (what, args = {}) => {
    contador += 1;
    const queryId = `q-${contador}`;
    return new Promise((resolve) => {
      esperando.set(queryId, resolve);
      socket.send(JSON.stringify({ type: 'query', queryId, what, args }));
    });
  };
  return { socket, seen, results, finales, pregunta, close: () => socket.close() };
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
  rival.army = ejercito({ creature: 'paladin', count: 6 });
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

  pueblo.garrison = ejercito({ creature: 'skeleton', count: 7 });
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

  it('el agente compra y se equipa por el cable, leyendo solo la petición', async () => {
    const { link, agent } = await montar((kind, payload) => {
      if (kind !== 'adventure_turn') return {};
      const town = payload.towns.find((t: any) => t.armory !== undefined);
      const hero = payload.heroes[0];
      const pieza = town.armory.find((a: any) => a.slot === 'armadura').item;
      return {
        actions: [
          { type: 'buy_item', town: town.id, item: pieza },
          { type: 'equip', hero: hero.id, item: pieza, creature: hero.army[0].creature },
          { type: 'unequip', hero: hero.id, slot: 'arma' },
          // Y dos que no valen, que se descartan una a una con el motivo del
          // núcleo. El hueco inventado tumbaba el turno ENTERO cuando `slot` era
          // un `z.enum`: ni la compra ni el equipo de arriba llegaban (M3).
          { type: 'equip', hero: hero.id, item: 'talisman_vital' },
          { type: 'unequip', hero: hero.id, slot: 'casco' },
        ],
      };
    });
    const director = new Director(link, { seed: 101, agentPlayers: [0] });
    const base = director.state.towns.find((t) => t.owner === 0)!;
    const hero = director.state.heroes.find((h) => h.owner === 0)!;
    hero.at = base.at;
    base.buildings.push('armory');
    director.state.players[0]!.resources = { ...director.state.players[0]!.resources, gold: 20000 };

    const informe = await director.playTurn();

    expect(agent.seen[0]?.kind).toBe('adventure_turn');
    expect(informe.actions).toBe(3);
    expect(informe.problems).toHaveLength(2);
    expect(informe.problems[0]).toMatch(/no lleva Talismán vital en la mochila/);
    expect(informe.problems[1]).toMatch(
      /no hay ningún hueco "casco": son arma, armadura, accesorio/,
    );
    const equipado = hero.army.find((t) => t.veterania?.equipo !== undefined);
    expect(equipado?.veterania?.equipo).toEqual({ armadura: 'cota_de_malla' });
    expect(hero.equipo.arma).toBeUndefined();
    expect(hero.mochila).toEqual(['espada_de_armeria']);
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
    // «no la contestes»: la nota se generalizó al entrar `map_generate`, que no
    // es un turno. Lo que se afirma sigue siendo lo mismo — que le dice qué NO
    // hacer, porque contestar tarde es tirar otra decisión.
    expect(aviso?.note).toMatch(/no la contestes/i);
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
    director.state.heroes[0]!.army = ejercito({ creature: 'paladin', count: 6 });
    director.state.heroes[0]!.movePoints = 20000;

    const informe = await director.playTurn();

    expect(informe.by).toBe('agent');
    expect(peticionesDeBatalla).toBeGreaterThan(0);
    expect(director.state.pendingBattle).toBeNull();
    expect(director.state.log.some((e) => e.kind === 'battle_ended')).toBe(true);
  });
});

describe('el agente se rinde (fase 1b)', () => {
  it('la rendición se le ofrece, entra por el contrato y el héroe vuelve a su base', async () => {
    // Lo cubría `pnpm qa` reescribiendo el mapa para forzar la batalla; ahora
    // juega el mapa tal cual y solo avisa, y el circuito se prueba aquí, donde
    // la batalla se puede construir.
    let rendida = false;
    const { link, agent } = await montar((kind, payload) => {
      if (kind === 'adventure_turn') {
        if (rendida) return { actions: [] };
        const hero = payload.heroes[0];
        const monstruo = payload.knownMap.objects.find(
          (o: any) => o.kind === 'monster' && !o.defeated,
        );
        if (monstruo === undefined) return { actions: [] };
        return { actions: [{ type: 'move_hero', hero: hero.id, to: monstruo.at }] };
      }
      if (kind === 'battle_turn') {
        const acciones = payload.legalActions as any[];
        if (acciones.some((a) => a.type === 'surrender')) {
          rendida = true;
          return { action: { type: 'surrender' } };
        }
        return { action: acciones[0] };
      }
      return {};
    });

    const director = new Director(link, { seed: 106, agentPlayers: [0] });
    revealEverything(director.state, 0);
    // Vacía: de camino al monstruo el héroe pasa por casa, y con la guarnición
    // de salida dentro se la llevaría y el precio ya no sería el de dos arqueros.
    sinGuarnicionDeSalida(director.state);
    const heroe = director.state.heroes[0]!;
    heroe.army = ejercito({ creature: 'archer', count: 2 });
    heroe.movePoints = 20000;
    const oroAntes = director.state.players[0]!.resources.gold;

    await director.playTurn();
    await respira();

    const batallas = agent.seen.filter((p) => p.kind === 'battle_turn');
    const conRendicion = batallas.find((p) =>
      (p.payload.legalActions as any[]).some((a) => a.type === 'surrender'),
    );
    // Se ofrece, con su precio y con el oro con el que se compara (H-2)…
    expect(conRendicion).toBeDefined();
    const precio = Math.ceil((2 * creature('archer').cost.gold! * 50) / 100);
    expect(conRendicion!.payload.legalActions).toContainEqual({ type: 'surrender', gold: precio });
    expect(conRendicion!.payload.yourGold).toBe(oroAntes);
    // …entra, y el veredicto dice cuánto se pagó…
    const acuse = agent.results.find((r) => r.requestId === conRendicion!.requestId);
    expect(acuse?.ok).toBe(true);
    expect(acuse?.note).toContain(`Has pagado ${precio} de oro`);
    // …y el héroe vuelve a su base con los dos arqueros, pagando el 50 % de su oro.
    const vuelta = director.state.log.find((e) => e.kind === 'hero_returned');
    expect(vuelta).toMatchObject({ hero: heroe.id, surrendered: true });
    expect(director.state.log.some((e) => e.kind === 'hero_defeated')).toBe(false);
    const base = director.state.towns.find((t) => t.id === director.state.players[0]!.base)!;
    expect(pointKey(heroe.at)).toBe(pointKey(base.at));
    expect(heroe.army).toEqual(ejercito({ creature: 'archer', count: 2 }));
    expect(oroAntes - director.state.players[0]!.resources.gold).toBe(precio);
    // …y la crónica que le llega después lo cuenta también.
    expect(vuelta).toMatchObject({ surrendered: true, gold: precio });
  });
  it('si su acción se descarta, la sustituta de la IA nunca es rendirse por él (H-1)', async () => {
    // Una acción imposible en cada turno de batalla: todas las del agente se
    // juegan con la sustituta de la IA. En esta posición, sin veto, la IA de
    // reglas elegía rendirse y le cobraba el oro al agente.
    let rendirseSeOfrecio = false;
    const { link, agent } = await montar((kind, payload) => {
      if (kind === 'adventure_turn') {
        const hero = payload.heroes[0];
        const monstruo = payload.knownMap.objects.find(
          (o: any) => o.kind === 'monster' && !o.defeated,
        );
        if (monstruo === undefined) return { actions: [] };
        return { actions: [{ type: 'move_hero', hero: hero.id, to: monstruo.at }] };
      }
      if (kind === 'battle_turn') {
        if ((payload.legalActions as any[]).some((a) => a.type === 'surrender')) {
          rendirseSeOfrecio = true;
        }
        return { action: { type: 'move', to: { col: 99, row: 99 } } };
      }
      return {};
    });

    const director = new Director(link, { seed: 106, agentPlayers: [0] });
    revealEverything(director.state, 0);
    const heroe = director.state.heroes[0]!;
    heroe.army = ejercito({ creature: 'peasant', count: 2 });
    heroe.movePoints = 20000;
    // Monstruos llenos y de nivel alto: dos campesinos contra siete vampiros
    // pesan menos de un tercio. `creature` es de solo lectura en el tipo porque
    // la partida no la cambia nunca; el andamio del test sí.
    for (const o of director.state.map.objects) {
      if (o.kind !== 'monster') continue;
      o.count = 7;
      (o as { creature: string }).creature = 'vampire';
    }
    const oroAntes = director.state.players[0]!.resources.gold;

    await director.playTurn();
    await respira();

    // Se le ofrecía rendirse…
    expect(rendirseSeOfrecio).toBe(true);
    expect(agent.results.some((r) => r.ok === false)).toBe(true);
    // …y la IA, jugando en su lugar, no lo hizo.
    expect(director.state.log.filter((e) => e.kind === 'hero_returned' && e.surrendered)).toEqual(
      [],
    );
    expect(director.state.players[0]!.resources.gold).toBe(oroAntes);
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
      // Su héroe pisa el tablero (fase 1b): uno, marcado, y el resto su tropa.
      expect(mios.filter((s: any) => s.commander === true).length).toBeLessThanOrEqual(1);
      for (const s of mios.filter((x: any) => x.commander !== true)) {
        expect(misCriaturas.has(s.creature)).toBe(true);
      }
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
    // Antes de jugar: si pierde, el héroe vuelve a su base sin ejército (fase 1b).
    const misCriaturas = new Set(mio.army.flatMap((s) => (s === null ? [] : [s.creature])));

    await director.playTurn();

    expect(vistaDelAgente.yourSide).toBe('defender');
    expect(vistaDelRival.yourSide).toBe('attacker');
    // Y lo que ve como suyo es de verdad suyo.
    const mios = vistaDelAgente.stacks.filter((s: any) => s.side === vistaDelAgente.yourSide);
    expect(mios.length).toBeGreaterThan(0);
    // El héroe va aparte: es el `commander`, y el resto, su tropa.
    expect(mios.some((s: any) => s.commander === true && s.name === mio.name)).toBe(true);
    for (const s of mios.filter((x: any) => x.commander !== true)) {
      expect(misCriaturas.has(s.creature)).toBe(true);
    }
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

  it('pero esa batalla ajena llega sin el maná ni el libro del héroe de otro', async () => {
    // #73. La premisa del issue era falsa por el lado bueno: no es «solo con
    // monstruos neutrales, que no tienen secretos». `battleOwners` pone al
    // monstruo de DEFENSOR, así que el atacante es siempre un jugador y lo que
    // volvía era el héroe de una persona, con su maná y su libro.
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 206, agentPlayers: [1] });
    const state = director.state;
    rivalContraMonstruo(state, director.ctx);
    expect(state.pendingBattle).not.toBeNull();

    const suyo = state.heroes.find((h) => h.owner === 0) as Hero;
    expect(suyo.spells.length).toBeGreaterThan(0);

    const ajena = responderConsulta(director, 'battle_state', { player: 1 }) as any;
    // El tablero entero se sigue viendo: la decisión sigue siendo no negar la
    // vista, y lo que cambia es lo que va dentro.
    expect(ajena.stacks.length).toBeGreaterThan(0);
    expect(ajena.round).toBeGreaterThan(0);
    expect(ajena.hero.name).toBe(suyo.name);
    // Sus cifras de combate ya no van en `hero`: es un stack del tablero.
    expect(ajena.hero.attack).toBeUndefined();
    const cuerpo = ajena.stacks.find((s: any) => s.commander === true && s.side === 'attacker');
    expect(cuerpo.attack).toBe(heroUnit(suyo).attack);
    expect(ajena.note).toMatch(/no está en esta batalla/);
    // Lo del bando, que no sale: con cuánto cuenta y qué sabe lanzar.
    expect(ajena.hero.mana).toBeUndefined();
    expect(ajena.hero.spells).toBeUndefined();
    // Y la cuarta fuga, la que no estaba en el issue: `legalActions` es la del
    // stack ACTIVO sea de quien sea, y sus `cast` enumeran ese mismo libro
    // filtrado por ese mismo maná. La misma puerta, la de al lado.
    expect(ajena.legalActions).toBeUndefined();

    // Lo que se afirma de verdad es lo que sale por el cable, no la forma del
    // objeto: una fuga es que el dato aparezca, aunque sea dentro de otra cosa.
    const cable = entregado(director, 'battle_state', { player: 1 });
    expect(cable).not.toContain('"mana":');
    expect(cable).not.toContain('"spells":');
    for (const hechizo of suyo.spells) expect(cable).not.toContain(hechizo);

    // Y al dueño de ese héroe se le siguen dando los dos: un arreglo que se los
    // quite a todos no es un arreglo.
    const propia = responderConsulta({ state, agentPlayers: new Set([0]) }, 'battle_state', {
      player: 0,
    }) as any;
    expect(propia.hero.name).toBe(suyo.name);
    expect(typeof propia.hero.mana).toBe('number');
    expect(propia.hero.spells).toEqual(suyo.spells);
  });
});

/**
 * Lo que una consulta ENTREGA de verdad, en JSON, o cadena vacía si la
 * rechaza.
 *
 * Se mide lo que sale por el cable y no el mecanismo del rechazo a propósito:
 * una fuga es que el dato aparezca, venga como respuesta o disfrazado de nota.
 * El motivo lo mira el `toThrow` de al lado, que es lo otro que se promete.
 *
 * Está fuera de su `describe` porque lo usan dos: el candado del `player` y la
 * niebla de la consulta `map`.
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

  it('en TU batalla, cuando manda el otro bando, la ausencia se explica (#84)', async () => {
    // El guardia de #73 (arriba) cubre la batalla AJENA. Esta es la otra rama y
    // no tenía ninguno: tu propia batalla, con el turno en una unidad del rival.
    // `legalActions` es la del stack activo sea de quien sea, así que ahí
    // desaparece — y hasta ahora desaparecía en silencio.
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
    const pendiente = director.state.pendingBattle;
    if (pendiente === null) throw new Error('hacía falta una batalla del agente');
    const batalla = pendiente.battle;

    // Los DOS casos salen de la misma batalla y sin fabricar estado: se juega
    // `defend`, que consume el turno y pasa al siguiente, hasta haber visto una
    // unidad de cada bando con el turno. Una nota que se emitiera SIEMPRE
    // pasaría la mitad de este test; por eso se afirman las dos direcciones.
    const rng = createRng(84);
    let conElMio = 0;
    let conElSuyo = 0;
    for (let i = 0; i < 40 && (conElMio === 0 || conElSuyo === 0); i++) {
      const activo = activeStack(batalla);
      if (activo === null || batalla.finished !== null) break;
      const vista = responderConsulta(director, 'battle_state', { player: 1 }) as any;
      expect(vista.yourSide).toBe('defender');
      if (activo.side === 'defender') {
        conElMio++;
        expect(vista.legalActions, 'te toca a ti: la lista tiene que venir').toBeDefined();
        expect(vista.legalActions.length).toBeGreaterThan(0);
        expect(vista.note, 'no hay nada que explicar cuando el campo está').toBeUndefined();
      } else {
        conElSuyo++;
        expect(vista.legalActions).toBeUndefined();
        // La nota dice de quién es el turno, cuál es tu bando y qué hacer.
        expect(vista.note).toMatch(/no viene con "legalActions"/);
        expect(vista.note).toMatch(/bando attacker/);
        expect(vista.note).toMatch(/llevas el defender/);
        expect(vista.note).toMatch(/battle_turn/);
      }
      applyAction(batalla, { type: 'defend' }, rng);
    }
    expect(conElMio, 'la batalla tiene que enseñar un turno tuyo').toBeGreaterThan(0);
    expect(conElSuyo, 'y uno del rival, o esto no prueba nada').toBeGreaterThan(0);
  });

  it('battle_state SIN batalla también comprueba de quién se pregunta (#83)', async () => {
    // La guarda de «no hay batalla» iba ANTES del candado, así que
    // `battle_state{player:0}` contestaba `ok=true` con `battle: null` mientras
    // `game_state{player:0}` y `map{player:0}` lo rechazaban. No filtraba nada
    // —no hay nada que enseñar—, pero le enseñaba al agente que preguntar por el
    // rival es legal, y esa lección deja de valer en cuanto empieza una batalla.
    // El sitio donde muerde es este: sin batalla en curso.
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 409, agentPlayers: [1] });
    expect(director.state.pendingBattle).toBeNull();

    expect(() => responderConsulta(director, 'battle_state', { player: 0 })).toThrow(
      /no es tuyo.*Llevas el jugador 1/s,
    );
    // Y lo suyo se sigue contestando: el candado no puede haberse llevado por
    // delante la respuesta honesta de que ahora mismo no hay ninguna batalla.
    const suya = responderConsulta(director, 'battle_state', { player: 1 }) as {
      battle: null;
      note: string;
    };
    expect(suya.battle).toBeNull();
    expect(suya.note).toMatch(/no hay ninguna batalla/);
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

/**
 * La consulta `map`, que devolvía el mapa entero (#74).
 *
 * Es la tercera salida del núcleo escrita antes de que existiera «lo que este
 * jugador ve»: `width, height, terrain, roads, objects` de `state.map`, sin
 * mirar por quién se preguntaba. Se tapió antes de que la alcanzara nadie, que
 * es más barato que quitárselo a un agente que ya lo tenía; desde #33 la
 * alcanza la tool `map` del puente, así que esto ya no guarda una puerta
 * tapiada sino una publicada.
 */
describe('la consulta `map` pasa por la niebla', () => {
  /** El jugador `id` de esa partida, con su `fog` y su `memory`. */
  const jugador = (state: GameState, id: number) => state.players.find((p) => p.id === id)!;

  it('un objeto que no he explorado no sale en mi mapa, y sí en el de quien sí', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 406, agentPlayers: [1] });
    const state = director.state;
    // El rival lo ha visto todo; yo, lo que se ve desde mi castillo. Así el
    // mismo objeto tiene que salir en un mapa y faltar en el otro.
    revealEverything(state, 0);

    const mio = jugador(state, 1);
    const lejano = state.map.objects.find((o) => !mio.fog.has(pointKey(o.at)));
    if (lejano === undefined) throw new Error('la semilla 406 ya no deja nada sin explorar');

    const mapa1 = JSON.parse(entregado(director, 'map', { player: 1 })) as {
      objects: { id: string }[];
    };
    const mapa0 = JSON.parse(
      entregado({ state, agentPlayers: new Set([0]) }, 'map', { player: 0 }),
    ) as { objects: { id: string }[] };

    // Los DOS sentidos: solo la ausencia daría verde con un arreglo que
    // devolviera la lista vacía a todo el mundo.
    expect(mapa1.objects.map((o) => o.id)).not.toContain(lejano.id);
    expect(mapa0.objects.map((o) => o.id)).toContain(lejano.id);
    // Y lo que sí conozco me sigue llegando: filtrar no es vaciar.
    expect(mapa1.objects.length).toBeGreaterThan(0);
  });

  it('una casilla sin explorar va como hueco, no como terreno inventado', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 407, agentPlayers: [1] });
    const state = director.state;
    const mio = jugador(state, 1);

    // El generador no dibuja caminos todavía, así que se ponen a mano: uno
    // dentro de la niebla y otro fuera. Con los del mapa generado —cero— este
    // trozo del test sería una comprobación vacía que pasaría siempre.
    // Fuera de la diagonal: en (15,15) leer la clave del revés es la identidad.
    const explorada = [...mio.fog].find((k) => {
      const p = pointFromKey(k);
      return p.x !== p.y;
    });
    if (explorada === undefined)
      throw new Error('la semilla 407 ya no deja una casilla fuera de la diagonal');
    const ignorada = [...Array(state.map.width * state.map.height).keys()]
      .map((i) => pointKey({ x: i % state.map.width, y: Math.floor(i / state.map.width) }))
      .find((clave) => !mio.fog.has(clave));
    if (ignorada === undefined) throw new Error('la semilla 407 ya no deja nada sin explorar');
    state.map = conCaminos(state.map, explorada, ignorada);

    const mapa = JSON.parse(entregado(director, 'map', { player: 1 })) as {
      width: number;
      height: number;
      terrain: (string | null)[];
      roads: { x: number; y: number }[];
    };

    expect(mapa.width).toBe(state.map.width);
    expect(mapa.height).toBe(state.map.height);

    // Casilla a casilla, y contando las dos clases: si una saliera a cero, el
    // test pasaría por el motivo equivocado.
    let conocidas = 0;
    let huecos = 0;
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const i = y * state.map.width + x;
        if (mio.fog.has(pointKey({ x, y }))) {
          expect(mapa.terrain[i], `(${x},${y}) explorada`).toBe(state.map.terrain[i]);
          conocidas++;
        } else {
          expect(mapa.terrain[i], `(${x},${y}) sin explorar`).toBeNull();
          huecos++;
        }
      }
    }
    expect(conocidas).toBeGreaterThan(0);
    expect(huecos).toBeGreaterThan(0);

    // Puntos, no claves: se comparan por `pointKey` para no depender del orden.
    expect(mapa.roads.map(pointKey)).toContain(explorada);
    expect(mapa.roads.map(pointKey)).not.toContain(ignorada);
  });

  it('la tool `map` y el `knownMap` del turno traen lo MISMO, campo a campo (#85)', async () => {
    // `MAPA_DESCRIPCION` le promete al agente que la tool «es lo mismo que
    // viaja en "knownMap" dentro de adventure_turn». Era falso: el turno
    // llevaba `{width, height, objects}` escrito a mano. Lo que lo hace verdad
    // es que las dos salgan de `serializeKnownMap`, y lo que lo comprueba es
    // esto — que la frase publicada no vuelva a ser una promesa sin guardia.
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 410, agentPlayers: [1] });
    const state = director.state;
    const mio = jugador(state, 1);

    // Con un camino dentro de la niebla: si `roads` fuera `[]` en las dos, la
    // igualdad de ese campo se cumpliría por vacío.
    const explorada = [...mio.fog].find((k) => {
      const p = pointFromKey(k);
      return p.x !== p.y;
    });
    if (explorada === undefined)
      throw new Error('la semilla 410 ya no deja una casilla fuera de la diagonal');
    state.map = conCaminos(state.map, explorada);

    const porLaTool = responderConsulta(director, 'map', { player: 1 }) as Record<string, unknown>;
    const porElTurno = (
      responderConsulta(director, 'game_state', { player: 1 }) as {
        knownMap: Record<string, unknown>;
      }
    ).knownMap;

    expect(porElTurno).toEqual(porLaTool);

    // Y los conjuntos de claves aparte: `toEqual` pasa por alto un campo cuyo
    // valor sea `undefined`, así que añadir uno a UNA sola de las dos puertas
    // podría colarse. Con esto sale rojo.
    expect(Object.keys(porElTurno).sort()).toEqual(Object.keys(porLaTool).sort());
    expect(Object.keys(porLaTool).sort()).toEqual([
      'height',
      'objects',
      'raiders',
      'roads',
      'terrain',
      'width',
    ]);

    // Y que lo comparado no esté vacío, o esto pasaría con dos mapas a oscuras.
    const terreno = porLaTool.terrain as (string | null)[];
    expect(terreno.some((t) => t !== null)).toBe(true);
    expect(terreno.some((t) => t === null)).toBe(true);
    expect((porLaTool.roads as { x: number; y: number }[]).map(pointKey)).toContain(explorada);
    expect((porLaTool.objects as unknown[]).length).toBeGreaterThan(0);
  });

  it('y el mapa del rival se rechaza igual que su estado, sin entregar un byte', async () => {
    const { link } = await montar(() => ({ actions: [] }));
    const director = new Director(link, { seed: 408, agentPlayers: [1] });

    expect(entregado(director, 'map', { player: 0 })).toBe('');
    expect(() => responderConsulta(director, 'map', { player: 0 })).toThrow(
      /no es tuyo.*Llevas el jugador 1/s,
    );
    // Sin `player` contesta por el suyo, como las otras dos.
    expect(entregado(director, 'map', {})).not.toBe('');
  });
});

/**
 * La ventana en la que ya hay agente y todavía no hay partida.
 *
 * Nace con el arranque asíncrono de #27: si el mapa lo diseña el agente, no
 * puede haber `GameState` hasta que lo entregue, y hasta entonces el `Director`
 * es `null`. `ws-server.ts` no se puede probar —abre dos puertos en cuanto se
 * importa—, así que lo que se prueba aquí es la FORMA de su guarda: que un
 * `onQuery` que lanza le llega al agente como un rechazo con su motivo, y no
 * como un socket muerto ni como un silencio.
 */
describe('el agente pregunta antes de que exista la partida', () => {
  it('le llega el motivo por el cable, y el canal sigue vivo', async () => {
    const link = new AgentLink(4000);
    const url = await servidorDePruebas(link);
    // La misma guarda que monta `ws-server.ts` mientras `director === null`.
    let director: Director | null = null;
    link.onQuery((what, args) => {
      if (director === null) throw new Error(SIN_PARTIDA_TODAVIA);
      return responderConsulta(director, what, args);
    });
    const agent = await conectaAgente(url, () => undefined);

    const antes = await agent.pregunta('game_state', {});
    expect(antes.ok).toBe(false);
    // El motivo dice qué falta y quién tiene que hacerlo: un rechazo que no
    // nombra la salida deja al agente reintentando lo mismo.
    expect(antes.error).toMatch(/todavía no hay partida/);
    expect(antes.error).toContain('map_generate');

    // Y en cuanto la partida existe, la misma consulta contesta: el rechazo era
    // del momento y no de la tool. Sin esto, un guardia que se quedara pegado
    // pasaría este test igual de verde.
    director = new Director(link, { seed: 410, agentPlayers: [1] });
    const despues = await agent.pregunta('game_state', {});
    expect(despues.ok).toBe(true);
    expect((despues.data as any).you.player).toBe(1);
  });
});

/**
 * El mapa lo diseña el agente (#27), y la partida empieza igual si no lo diseña.
 *
 * `map_generate` es una de las tres promesas del proyecto y llevaba desde el
 * primer día con el esquema escrito, `validateMapPlan` y `buildMap` probados… y
 * ningún llamante. Lo que se mira aquí son los **cuatro** caminos, porque los
 * tres malos son los que tienen que caer de pie: sin agente, sin respuesta, con
 * un plan injugable y con un plan de otros jugadores. En los tres se sigue con
 * el generador procedimental y **al agente se le dice por qué**.
 */
describe('el agente diseña el mapa', () => {
  // El lado del generador y no un literal: el plan bueno de abajo sale de
  // `generateMapPlan` sin tamaño, y pedir otro sería rechazarlo por medir.
  const PETICION = { width: LADO_DEL_MAPA, height: LADO_DEL_MAPA, players: [0, 1] as const };
  const PEDIDO = `${LADO_DEL_MAPA}×${LADO_DEL_MAPA}`;

  /** El acuse de la petición de mapa, ya entregado por el cable. */
  async function acuseDelMapa(agent: FakeAgent) {
    await respira();
    const peticion = agent.seen.find((s) => s.kind === 'map_generate');
    expect(peticion, 'no se le pidió ningún mapa').toBeDefined();
    return agent.results.find((r) => r.requestId === peticion?.requestId);
  }

  it('un plan bueno se acepta, se le acusa, y la partida se juega en él', async () => {
    const suyo = generateMapPlan(createRng(21));
    const { link, agent } = await montar(() => ({ plan: suyo }));

    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).not.toBeNull();
    expect(motivo).toContain(PEDIDO);

    // Devolverlo no basta: lo que prueba #27 es que la partida se juega en él.
    const director = new Director(link, { seed: 411, agentPlayers: [1], plan: plan as MapPlan });
    expect(director.state.towns.map((t) => t.id)).toEqual(suyo.towns.map((t) => t.id));

    const acuse = await acuseDelMapa(agent);
    expect(acuse?.ok).toBe(true);
    expect(acuse?.note).toMatch(/plan de mapa entró/);
  });

  it('sin agente conectado no se pide nada y no revienta', async () => {
    const link = new AgentLink(400);
    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).toBeNull();
    expect(motivo).toMatch(/ningún agente conectado/);
  });

  it('si no contesta, se sigue — y se le dice, sin prometerle un turno', async () => {
    // El plazo corto es del test; el de verdad son los 300 s de `ask`.
    const { link, agent } = await montar(() => undefined, 400);
    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).toBeNull();
    expect(motivo).toMatch(/no respondió/);

    const acuse = await acuseDelMapa(agent);
    expect(acuse?.ok).toBe(false);
    // La cola que decía «ese turno lo juega la IA de reglas» es FALSA aquí: un
    // mapa no es un turno y no hay heurística que lo sustituya.
    expect(acuse?.note).not.toContain('juega la IA de reglas en tu lugar');
    expect(acuse?.note).toMatch(/generador procedimental/);
  });

  it('un plan injugable se rechaza con sus problemas, uno a uno', async () => {
    // Pasa el esquema y no pasa `validateMapPlan`: un cofre encima del pueblo.
    const base = generateMapPlan(createRng(22));
    const { link, agent } = await montar(() => ({
      plan: { ...base, chests: [...base.chests, { at: base.towns[0]!.at, gold: 500 }] },
    }));

    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).toBeNull();
    expect(motivo).toMatch(/la ocupan dos cosas/);

    const acuse = await acuseDelMapa(agent);
    expect(acuse?.ok).toBe(false);
    expect(acuse?.problems?.join(' ')).toMatch(/la ocupan dos cosas/);
    // Y se le dice que no habrá segunda oportunidad, en vez de dejarle esperando.
    expect(acuse?.note).toMatch(/no se te va a volver a pedir/i);
  });

  it('un plan con una criatura inventada muere en la PUERTA, no en el primer turno', async () => {
    // El bloqueante, por el camino entero. Antes de esto el servidor aceptaba
    // el plan, le mandaba al agente «Tu plan de mapa entró» y reventaba en
    // `playAiTurn` con «criatura desconocida». Fail-loud en el sitio equivocado:
    // ruidoso DESPUÉS del acuse, que es cuando ya no se puede corregir.
    const base = generateMapPlan(createRng(24));
    const { link, agent } = await montar(() => ({
      plan: { ...base, monsters: [{ at: base.monsters[0]!.at, creature: 'no-existe', count: 3 }] },
    }));

    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).toBeNull();
    expect(motivo).toMatch(/criatura que no existe: "no-existe"/);

    const acuse = await acuseDelMapa(agent);
    // Lo que más importa: el acuse dice que NO, no que sí.
    expect(acuse?.ok).toBe(false);
    expect(acuse?.problems?.join(' ')).toMatch(/Las que valen:/);
  });

  it('un plan de otro tamaño se rechaza: 48×48 pedido el del generador', async () => {
    const grande = generateMapPlan(createRng(25), { width: 48, height: 48 });
    const { link, agent } = await montar(() => ({ plan: grande }));

    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).toBeNull();
    expect(motivo).toContain(`mide 48×48 y se te pidió ${PEDIDO}`);
    expect((await acuseDelMapa(agent))?.ok).toBe(false);
  });

  it('un plan con OTROS jugadores se rechaza, que si no deja al agente sin turnos', async () => {
    // Es jugable —`validateMapPlan` lo acepta entero— y deja al agente sin una
    // sola petición: `agentPlayers.has(current)` nunca se cumple, todos los
    // informes dicen «reglas» y no se rompe nada. El silencio es el bug.
    const base = generateMapPlan(createRng(23));
    const ajeno = {
      ...base,
      towns: base.towns.map((t) => ({ ...t, owner: t.owner === null ? null : t.owner + 3 })),
      heroStarts: base.heroStarts.map((h) => ({ ...h, player: h.player + 3 })),
    };
    expect(validateMapPlan(ajeno), 'el plan tiene que ser JUGABLE para probar esto').toEqual([]);

    const { link, agent } = await montar(() => ({ plan: ajeno }));
    const { plan, motivo } = await pedirMapaAlAgente(link, PETICION);
    expect(plan).toBeNull();
    expect(motivo).toMatch(/falta la posición de inicio del jugador 0/);

    const acuse = await acuseDelMapa(agent);
    expect(acuse?.ok).toBe(false);
    const problemas = acuse?.problems?.join(' ') ?? '';
    expect(problemas).toMatch(/falta la posición de inicio del jugador 0/);
    expect(problemas).toMatch(/falta la posición de inicio del jugador 1/);
    expect(problemas).toMatch(/el jugador 3 no juega esta partida/);
    expect(problemas).toMatch(/el jugador 4 no juega esta partida/);
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
    mio.army = ejercito({ creature: 'champion', count: 5 });
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

    // Era la 304: con los mapas densos (03-10-2026) la batalla de esa semilla
    // ya no sacaba la rama del maná. Lo que se mide es la nota, no el mapa.
    const director = new Director(link, { seed: 306, agentPlayers: [1] });
    rivalAlAtaque(director.state);
    // Sin oro para rendirse: si no, la heurística sustituta se rinde en la
    // primera decisión —seis paladines contra su tropa— y la batalla acaba
    // antes de que salgan las ramas del turno y del maná, que es lo que se mide.
    director.state.players[1]!.resources = { ...director.state.players[1]!.resources, gold: 0 };
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
      // La cuarta, desde el turno en tramos: un `move` sustituto que deja el
      // turno abierto no ha consumido nada más que casillas.
      const diceTramo = r.note!.includes('Eso NO ha cerrado el turno de');
      const diceMana = /de maná/.test(r.note!);
      // Una de las CUATRO frases, exactamente: ni dos ni ninguna. La tercera es la
      // sustituta que remata, y en esta misma batalla sale (`req-5`): con dos
      // ramas, esa nota hablaba del turno de una unidad en una ronda que ya no
      // iba a jugarse.
      expect(
        [diceTurnoGastado, diceNoConsumido, diceTerminada, diceTramo].filter(Boolean),
      ).toHaveLength(1);
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
    // El agente va al monstruo que se ha cambiado por el zombi, nombrado por su
    // id. Antes cogía el primer monstruo de `knownMap.objects`, que coincidía con
    // el que cambia `ponerMonstruo` solo por el orden en que la niebla los había
    // apuntado; desde que el castillo también apunta lo que ve (H1), ese orden
    // es otro y el héroe se iba a pelear con un monstruo distinto.
    let objetivo = '';
    const { link, agent } = await montar((kind, payload) => {
      if (kind === 'adventure_turn') {
        const monstruo = payload.knownMap.objects.find((o: any) => o.id === objetivo);
        if (monstruo === undefined) throw new Error(`el agente no ve el monstruo ${objetivo}`);
        return { actions: [{ type: 'move_hero', hero: payload.heroes[0].id, to: monstruo.at }] };
      }
      // Legal en el esquema y sin sentido en el tablero: la juega la heurística.
      if (kind === 'battle_turn') return { action: { type: 'attack', target: 'no-existe' } };
      return {};
    });

    const director = new Director(link, { seed: 307, agentPlayers: [0] });
    revealEverything(director.state, 0);

    const heroe = director.state.heroes.find((h) => h.owner === 0) as Hero;
    heroe.army = ejercito({ creature: 'paladin', count: 6 });
    heroe.movePoints = 20000;
    // Con qué se remata: una flecha que se lleva al monstruo entero de una.
    heroe.spells = ['magic_arrow'];
    heroe.mana = 20;
    heroe.spellPower = 10; // 10 + 10×poder = 110 de daño

    // UN zombi: 15 PV, justo por encima del umbral de la heurística (4 PV por
    // punto de maná × 3) —por debajo no lanzaría— y muy por debajo de 110, así
    // que una flecha se lleva al monstruo entero. Antes era un stack de
    // `⌈12/PV⌉`; con la tropa de individuos cada uno es un hex, y la flecha da
    // a uno solo.
    objetivo = ponerMonstruo(director.state, 'zombie', 1).id;

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
    mio.army = ejercito({ creature: 'champion', count: 5 });

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

    // La semilla importa: en algunas el rival plantado al lado no ataca. Con los
    // mapas densos la 305 dejó de valer (307) y volvió a valer al cambiar el
    // vestido (03-10-2026); 303, 304, 306, 309 y 310 también valen hoy.
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

describe('la tropa se hace héroe, por el cable', () => {
  /** El agente que contesta los turnos con nada y el ascenso con lo que le digan. */
  const narrador =
    (ascenso: (payload: any) => unknown) =>
    (kind: string, payload: any): unknown => {
      if (kind === 'hero_from_troop') return ascenso(payload);
      if (kind === 'adventure_turn') return { actions: [] };
      return undefined;
    };
  const bueno = (p: any) => ({
    name: `Héroe de ${p.veteran.id}`,
    story: `Fue ${p.veteran.creatureName} en ${p.veteran.battles} batallas.`,
    heroType: p.heroTypes[1].id,
  });

  it('una respuesta buena crea el héroe antes del turno, y el turno ya lo trae con su tipo', async () => {
    const { link, agent } = await montar(narrador(bueno));
    let veterano = '';
    const director = new Director(link, {
      seed: 501,
      agentPlayers: [0],
      preparar: (s) => {
        veterano = ponVeteranoEnLaBase(s, 0);
      },
    });
    await director.playTurn();
    await respira();

    // Primero el ascenso y después el turno: el héroe nacido sale ya en él.
    expect(agent.seen.map((p) => p.kind)).toEqual(['hero_from_troop', 'adventure_turn']);
    const peticion = agent.seen[0]!.payload;
    expect(peticion.veteran).toMatchObject({
      id: veterano,
      level: 5,
      experience: 220,
      battles: 3,
      kills: 5,
      heroesDefeated: ['Sir Arnés'],
      in: 'garrison',
    });
    expect(peticion.you.faction).toBe('knight');
    expect(peticion.heroTypes.map((t: any) => t.id)).toEqual([
      'caballero',
      'monje',
      'inquisidor',
      'gran_maestre',
    ]);
    expect(peticion.heroes).toEqual({ count: 1, max: 4 });

    const turno = agent.seen[1]!.payload;
    expect(turno.heroes).toHaveLength(2);
    const nacido = turno.heroes.find((h: any) => h.name === `Héroe de ${veterano}`);
    expect(nacido).toMatchObject({ type: 'monje', level: 5, movePoints: 0 });
    // Nace en la casilla del castillo y se lleva la guarnición (I1): una base
    // defendida por un héroe sin tropa caía esa noche ante dos campesinos.
    expect(nacido.at).toEqual(turno.towns.find((t: any) => t.id === turno.yourBase).at);
    expect(nacido.army.length).toBeGreaterThan(0);
    expect(nacido.story).toMatch(/batallas/);
    // El que ya estaba lleva su tipo por defecto y no trae historia.
    const viejo = turno.heroes.find((h: any) => h.id !== nacido.id);
    expect(viejo.type).toBe('caballero');
    expect('story' in viejo).toBe(false);

    const veredicto = agent.results.find((r) => r.requestId === agent.seen[0]!.requestId)!;
    expect(veredicto.ok).toBe(true);
    expect(veredicto.note).toMatch(/es ya un héroe tuyo de tipo monje y nivel 5/);
    // La nota dice la tropa con la que quedó, no la que se suponía.
    expect(veredicto.note).toMatch(/Se ha llevado \d+ individuos de la guarnición/);
    expect(veredicto.note).not.toMatch(/sin tropa/);
  });

  for (const [caso, ascenso, motivo] of [
    [
      'un esquema malo (nombre con salto de línea)',
      (p: any) => ({ ...bueno(p), name: 'Dos\nlíneas' }),
      /una sola línea/,
    ],
    [
      'un tipo de la otra facción',
      (p: any) => ({ ...bueno(p), heroType: 'lich' }),
      /"lich" no es un tipo de héroe de knight/,
    ],
  ] as const) {
    it(`${caso}: el estado queda igual y el veredicto lo dice sin hablar de la IA de reglas`, async () => {
      const { link, agent } = await montar(narrador(ascenso));
      const director = new Director(link, {
        seed: 502,
        agentPlayers: [0],
        preparar: (s) => ponVeteranoEnLaBase(s, 0),
      });
      const heroes = director.state.heroes.length;
      const guarnicion = JSON.stringify(director.state.towns.map((t) => t.garrison));
      await director.playTurn();
      await respira();

      expect(director.state.heroes).toHaveLength(heroes);
      // El veterano sigue en la guarnición: ningún individuo se ha movido.
      const ascensoId = agent.seen.find((p) => p.kind === 'hero_from_troop')!.requestId;
      expect(JSON.stringify(director.state.towns.map((t) => t.garrison))).toBe(guarnicion);
      const veredicto = agent.results.find((r) => r.requestId === ascensoId)!;
      expect(veredicto.ok).toBe(false);
      expect(veredicto.problems?.join(' ')).toMatch(motivo);
      expect(veredicto.note).not.toMatch(/IA de reglas/);
      expect(veredicto.note).toMatch(/no se te volverá a preguntar hasta que salga de la base/);
      // Y el turno sigue: el ascenso fallido no se come el `adventure_turn`.
      expect(agent.seen.some((p) => p.kind === 'adventure_turn')).toBe(true);
    });
  }

  it('si no contesta a tiempo, nada cambia y el turno sigue', async () => {
    const { link, agent } = await montar(
      narrador(() => undefined),
      300,
    );
    const director = new Director(link, {
      seed: 503,
      agentPlayers: [0],
      preparar: (s) => ponVeteranoEnLaBase(s, 0),
    });
    const heroes = director.state.heroes.length;
    await director.playTurn();
    await respira();

    expect(director.state.heroes).toHaveLength(heroes);
    const ascensoId = agent.seen.find((p) => p.kind === 'hero_from_troop')!.requestId;
    const veredicto = agent.results.find((r) => r.requestId === ascensoId)!;
    expect(veredicto.ok).toBe(false);
    expect(veredicto.note).toMatch(/no respondiste a tiempo/);
    expect(veredicto.note).not.toMatch(/IA de reglas/);
    expect(agent.seen.some((p) => p.kind === 'adventure_turn')).toBe(true);
  });

  it('no se le vuelve a preguntar por el mismo mientras siga en la base, y sí cuando vuelve', async () => {
    const { link, agent } = await montar(narrador((p) => ({ ...bueno(p), heroType: 'lich' })));
    let veterano = '';
    const director = new Director(link, {
      seed: 504,
      agentPlayers: [0],
      preparar: (s) => {
        veterano = ponVeteranoEnLaBase(s, 0);
      },
    });
    const ascensos = (): number => agent.seen.filter((p) => p.kind === 'hero_from_troop').length;

    await director.playTurn(); // agente
    await director.playTurn(); // rival
    await director.playTurn(); // agente otra vez, el veterano sigue en la base
    await respira();
    expect(ascensos()).toBe(1);

    // Un turno sin él en la base —ha salido—, y vuelve.
    const base = director.state.towns.find((t) => t.owner === 0 && t.garrison.length > 0)!;
    const el = base.garrison.find((t) => t.veterania?.id === veterano)!;
    base.garrison = base.garrison.filter((t) => t !== el);
    await director.playTurn(); // rival
    await director.playTurn(); // agente, sin el veterano
    await respira();
    expect(ascensos()).toBe(1);
    base.garrison = [el, ...base.garrison];
    await director.playTurn(); // rival
    await director.playTurn(); // agente: ha vuelto
    await respira();
    expect(ascensos()).toBe(2);
  });

  it(`con ${MAX_HEROES_PER_PLAYER} héroes no se pregunta nada`, async () => {
    const { link, agent } = await montar(narrador(bueno));
    const director = new Director(link, {
      seed: 505,
      agentPlayers: [0],
      preparar: (s) => {
        ponVeteranoEnLaBase(s, 0);
        const modelo = s.heroes.find((h) => h.owner === 0)!;
        for (let i = 1; i < MAX_HEROES_PER_PLAYER; i++) {
          s.heroes.push({ ...modelo, id: `relleno-${i}`, at: { x: 0, y: i } });
        }
      },
    });
    await director.playTurn();
    await respira();
    expect(agent.seen.map((p) => p.kind)).toEqual(['adventure_turn']);
    expect(director.log.some((l) => /no se pregunta/.test(l))).toBe(true);
    // Y se le dice al agente, en su turno y en una línea (M4): antes iba solo a
    // la consola del director, y el agente tenía que deducirlo.
    const aviso = agent.seen[0]!.payload.veteransWaiting;
    expect(aviso).toBe(
      `1 veterano de nivel 5 espera en tu base para hacerse héroe, pero ya tienes ${MAX_HEROES_PER_PLAYER} de ${MAX_HEROES_PER_PLAYER} héroes: no se te preguntará hasta que haya sitio.`,
    );
  });

  it('con dos veteranos en la guarnición, la segunda petición dice dónde está el segundo DESPUÉS del primer ascenso', async () => {
    // El primer nacido ocupa el castillo y recoge la guarnición (I1), y con ella
    // al segundo veterano: la petición de este tiene que decir que ya va en la
    // tropa de ese héroe, no en la guarnición de la foto de antes (N1 de QA).
    const { link, agent } = await montar(narrador(bueno));
    let segundo = '';
    const director = new Director(link, {
      seed: 11,
      agentPlayers: [0],
      preparar: (s) => {
        ponVeteranoEnLaBase(s, 0);
        const base = baseOf(s, 0)!;
        const [primero, otro, ...resto] = base.garrison;
        segundo = `veterano-${s.siguienteVeterano++}`;
        base.garrison = [
          primero!,
          { ...otro!, veterania: { ...primero!.veterania!, id: segundo } },
          ...resto,
        ];
      },
    });
    await director.playTurn();
    await respira();

    const peticiones = agent.seen.filter((p) => p.kind === 'hero_from_troop');
    expect(peticiones).toHaveLength(2);
    expect(peticiones[0]!.payload.veteran.in).toBe('garrison');
    const nacido = `hero-${peticiones[0]!.payload.veteran.id}`;
    expect(peticiones[1]!.payload.veteran).toMatchObject({ id: segundo, in: { hero: nacido } });
  });

  it('sin tope lleno el turno no trae el aviso de veteranos esperando', async () => {
    const { link, agent } = await montar(narrador(bueno));
    const director = new Director(link, {
      seed: 505,
      agentPlayers: [0],
      preparar: (s) => {
        ponVeteranoEnLaBase(s, 0);
      },
    });
    await director.playTurn();
    await respira();
    expect(agent.seen.map((p) => p.kind)).toEqual(['hero_from_troop', 'adventure_turn']);
    expect('veteransWaiting' in agent.seen[1]!.payload).toBe(false);
  });
});
