/**
 * El canal del espectador: la vista tipada y el fotograma por acción.
 *
 * Dos cosas que antes no se podían comprobar y por el mismo motivo: la vista se
 * montaba a mano dentro de `broadcast()` —una función que solo corre con un
 * servidor levantado— y viajaba como `unknown`. Ahora la monta `construirVista`,
 * que es una función pura sobre un `GameState`, y se le puede preguntar.
 *
 * Lo que se mira aquí:
 *
 *  1. que el viaje por JSON no le quite nada —es la trampa de #10: un `Set` se
 *     queda en `{}` sin decir nada, y la vista lleva DOS (`roads` y `fog`)—;
 *  2. que un turno de N acciones dé N fotogramas, que es lo que #30 necesita
 *     para enseñar una batalla acción a acción en vez de un pase de
 *     diapositivas;
 *  3. que `view.battle` deje de ser `null` mientras se decide una batalla y
 *     vuelva a serlo al acabarla, porque el espectador cambia de escena con eso;
 *  4. que los dueños de los bandos viajen, que es lo que le deja pintar cada
 *     bando del color de su jugador sin rederivar `battleOwners` por su cuenta.
 */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { adaptarEscena } from '../src/client/espectador/adaptar.js';
import type { AdventureScene } from '../src/client/render/adventure.js';
import type { BattleState } from '../src/core/battle/types.js';
import type { Hero } from '../src/core/hero/hero.js';
import { pointKey, reachableFrom } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import {
  applyAdventureAction,
  type GameState,
  resolvePendingBattle,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import { AgentLink } from '../src/server/agent-link.js';
import { Director } from '../src/server/director.js';
import { construirVista, type SpectatorView } from '../src/server/vista-espectador.js';
import { monstruoVivo } from './helpers.js';

const abiertos: (() => void)[] = [];
afterEach(() => {
  for (const cerrar of abiertos.splice(0)) cerrar();
});

/** Un agente de mentira atado a un `AgentLink`, como el de `agent-link.test.ts`. */
async function montar(
  responder: (kind: string, payload: any) => unknown,
): Promise<{ link: AgentLink; cerrar: () => void }> {
  const link = new AgentLink(4000);
  const wss = new WebSocketServer({ port: 0 });
  await once(wss, 'listening');
  wss.on('connection', (s) => link.attach(s));
  abiertos.push(() => wss.close());

  const socket = new WebSocket(`ws://localhost:${(wss.address() as AddressInfo).port}`);
  socket.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'request') return;
    const data = responder(msg.kind, msg.payload);
    if (data === undefined) return;
    socket.send(JSON.stringify({ type: 'response', requestId: msg.requestId, data }));
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'hello', client: 'test' }));
  await new Promise((r) => setTimeout(r, 50));
  abiertos.push(() => socket.close());
  return { link, cerrar: () => socket.close() };
}

/** La casilla pisable más cercana, para plantar a alguien al lado. */
function vecina(state: GameState, desde: Point): Point {
  const [clave] = [...reachableFrom(state.map, desde).costs.entries()]
    .filter(([, coste]) => coste > 0)
    .sort((a, b) => a[1] - b[1])[0]!;
  const [x, y] = clave.split(',').map(Number);
  return { x: x as number, y: y as number };
}

describe('la vista del espectador', () => {
  it('sobrevive a un JSON de ida y vuelta, que es donde mueren los `Set`', () => {
    // `roads` y `fog` son `Set` en el estado. `JSON.stringify` los deja en `{}`
    // sin decir nada —lo mismo que avisa #10 para el guardado—, así que un mapa
    // sin caminos y una niebla vacía habrían llegado al espectador sin que nada
    // se pusiera rojo. Aquí se comprueba que salen como listas y que vuelven.
    const state = newGame({ seed: 5 });
    state.map.roads.add(pointKey({ x: 2, y: 2 }));
    const vista = construirVista(state, ['una nota del director']);

    expect(vista.map.roads).toContain('2,2');
    expect(Array.isArray(vista.map.roads)).toBe(true);
    expect(Array.isArray(vista.players[0]?.fog)).toBe(true);

    const ida: SpectatorView = JSON.parse(JSON.stringify(vista));
    expect(ida).toEqual(vista);
    expect(ida.directorLog).toEqual(['una nota del director']);
  });

  it('sin batalla, `battle` es `null`, que es casi toda la partida', () => {
    const state = newGame({ seed: 5 });
    expect(construirVista(state, []).battle).toBeNull();
  });

  it('la crónica viaja SIN el sello: quién más miraba es contabilidad de casa', () => {
    // El espectador lo ve todo, así que `seen` no le dice nada — y salía entero
    // por aquí mientras el mensaje del agente lo borraba a propósito.
    const state = newGame({ seed: 5 });
    const vista = construirVista(state, []);
    expect(vista.log.length).toBeGreaterThan(0);
    for (const e of vista.log) expect(e).not.toHaveProperty('seen');
  });
});

describe('adaptar: la vuelta del cable', () => {
  it('`adaptarEscena` es la inversa EXACTA de `construirVista`', () => {
    // Las dos mitades de una misma conversión escritas en ficheros distintos son
    // justo lo que se desincroniza. Aquí se cierra el círculo entero: estado →
    // vista → JSON → escena, y lo que sale tiene que ser lo que entró.
    const state = newGame({ seed: 5 });
    state.map.roads.add(pointKey({ x: 2, y: 2 }));
    state.map.roads.add(pointKey({ x: 3, y: 2 }));
    state.players[0]?.fog.add(pointKey({ x: 9, y: 9 }));

    const escena = adaptarEscena(JSON.parse(JSON.stringify(construirVista(state, []))));

    // Los `Set`, que es lo que el JSON destruye y esta función rehace.
    expect(escena.map.roads).toEqual(state.map.roads);
    expect(escena.players[0]?.fog).toEqual(state.players[0]?.fog);
    expect(escena.map.roads.has('2,2')).toBe(true);
    expect(escena.map.width).toBe(state.map.width);
    expect(escena.map.terrain).toEqual(state.map.terrain);
    expect(escena.heroes.map((h) => h.id)).toEqual(state.heroes.map((h) => h.id));
  });

  it('un `GameState` satisface `AdventureScene` sin adaptar nada', () => {
    // Es la otra mitad del criterio 11: `main.ts` no cambió ni un carácter al
    // hacer estructural el tipo del lienzo, y esto lo deja escrito para que no
    // se rompa por accidente. Si dejara de valer, esta línea no compila.
    const state: AdventureScene = newGame({ seed: 5 });
    expect(state.map.width).toBeGreaterThan(0);
  });
});

describe('el fotograma por acción', () => {
  it('un turno de N acciones da N fotogramas, y no uno', async () => {
    // Antes había UNO por turno: una batalla entera caía entre dos snapshots.
    const acciones = [
      { type: 'build', town: 'town-1', building: 'necromancer_dwelling_2' },
      { type: 'recruit', town: 'town-1', creature: 'skeleton', count: 1 },
      { type: 'end_turn' },
    ];
    const { link } = await montar((kind) =>
      kind === 'adventure_turn' ? { actions: acciones } : undefined,
    );

    const fotogramas: number[] = [];
    const director = new Director(link, {
      seed: 5,
      agentPlayers: [1],
      onFrame: () => fotogramas.push(director.state.day),
    });
    // El turno del jugador 0 primero, que lo juega la heurística: no da
    // fotogramas por acción y eso está declarado en `DirectorOptions.onFrame`.
    await director.playTurn();
    expect(fotogramas).toHaveLength(0);

    await director.playTurn();
    // Las tres del agente: dos acciones aplicadas más el `end_turn`, que también
    // mueve el tablero —cambia el turno y puede cambiar el día—.
    expect(fotogramas).toHaveLength(3);
  });

  it('cada acción de BATALLA da su fotograma, no uno al acabar — criterio 16', async () => {
    // El guardia que faltaba, y faltaba entero: QA quitó los tres `this.frame()`
    // del bucle de batalla y los 379 tests siguieron verdes. O sea que el
    // fotograma por acción —43 de 61 fotogramas de una partida, lo que este
    // ciclo existe para dar— no lo defendía nada.
    //
    // El montaje es juego NORMAL: el héroe del agente entra en la casilla de un
    // monstruo. Los dos caminos de `applyAction` del bucle se ejercitan, porque
    // el bando del monstruo lo juega la heurística y el del agente se le
    // pregunta.
    const semilla = 5;
    const base = newGame({ seed: semilla });
    const heroe = base.heroes.find((h) => h.owner === 1) as Hero;
    const monstruo = monstruoVivo(base);

    const { link } = await montar((kind, payload) => {
      if (kind === 'adventure_turn') {
        return { actions: [{ type: 'move_hero', hero: heroe.id, to: monstruo.at }] };
      }
      if (kind === 'battle_turn') {
        const acciones = payload.legalActions as { type: string }[];
        return {
          action:
            acciones.find((a) => a.type === 'attack') ??
            acciones.find((a) => a.type === 'move') ??
            acciones[0],
        };
      }
      return undefined;
    });

    const director = new Director(link, { seed: semilla, agentPlayers: [1], onFrame: () => {} });
    // El mismo estado, con el héroe ya pegado al monstruo y con movimiento de
    // sobra: lo que se mide es el bucle de batalla, no el pathfinding.
    director.state = base;
    const suyo = base.heroes.find((h) => h.owner === 1) as Hero;
    suyo.at = { x: monstruo.at.x - 1, y: monstruo.at.y };
    suyo.movePoints = 5000;
    base.current = 1;

    /** Cuántos fotogramas se emiten con una batalla en curso, y su registro. */
    let enBatalla = 0;
    let campo: BattleState | null = null;
    const largos: number[] = [];
    (director as unknown as { mirador: () => void }).mirador = () => {
      const pending = director.state.pendingBattle;
      if (pending === null) return;
      enBatalla++;
      campo = pending.battle;
      largos.push(pending.battle.log.length);
    };

    await director.playTurn();

    const batalla = campo as BattleState | null;
    if (batalla === null) throw new Error('el montaje no abrió ninguna batalla');

    // Cuántas acciones se aplicaron de verdad, derivado del registro. Tres
    // reglas, y las tres son del motor y no de este test:
    //  - cada acción deja UN hecho primario: `move`, `wait`, `defend`, `shoot`,
    //    `cast` o `attack`;
    //  - el `attack` de un contraataque NO es una acción: es parte de la del
    //    otro, y por eso se filtra por `retaliation`;
    //  - un `attack` con `from` **se mueve y luego pega**, así que deja un `move`
    //    pegado delante del `attack`. Eso es UNA acción, no dos. Sin esta
    //    tercera regla la cuenta sale dos de más en esta misma semilla.
    const primarias = new Set(['move', 'wait', 'defend', 'shoot', 'cast', 'attack']);
    const hechos = batalla.log.filter(
      (e) => primarias.has(e.kind) && !(e.kind === 'attack' && e.retaliation),
    );
    const cargas = hechos.filter(
      (e, i) => e.kind === 'move' && hechos[i + 1]?.kind === 'attack',
    ).length;
    const acciones = hechos.length - cargas;

    expect(acciones).toBeGreaterThan(1);
    // El `+1` es el fotograma del `move_hero` que ABRIÓ la batalla: en él la
    // batalla ya está desplegada, y es el primero que ve quien mira.
    expect(enBatalla).toBe(acciones + 1);
    // Y son fotogramas de verdad repartidos, no N copias del final: el registro
    // crece en cada uno.
    expect(largos).toEqual([...largos].sort((a, b) => a - b));
    expect(new Set(largos).size).toBe(largos.length);
  });

  it('sin `onFrame` el director juega exactamente igual', async () => {
    // La opción es opcional de verdad: `pnpm banco` y los 300 tests corren sin
    // ella, y un observador no puede cambiar la partida.
    const acciones = [{ type: 'end_turn' }];
    const a = await montar((kind) =>
      kind === 'adventure_turn' ? { actions: acciones } : undefined,
    );
    const conMirador = new Director(a.link, { seed: 5, agentPlayers: [1], onFrame: () => {} });
    await conMirador.playTurn();
    await conMirador.playTurn();

    const b = await montar((kind) =>
      kind === 'adventure_turn' ? { actions: acciones } : undefined,
    );
    const sinMirador = new Director(b.link, { seed: 5, agentPlayers: [1] });
    await sinMirador.playTurn();
    await sinMirador.playTurn();

    expect(JSON.stringify(sinMirador.state.log)).toBe(JSON.stringify(conMirador.state.log));
  });

  it('un mirón que revienta NO se lleva la partida por delante, y se dice', async () => {
    // La primera redacción de este test PASABA con el `try` desactivado, y por
    // el motivo equivocado: `playTurn` ya tiene su propio `catch` y la partida
    // seguía igual, solo que con la heurística tomando el relevo y el motivo
    // metido en OTRA nota. O sea, el test no distinguía «lo maneja `frame()`» de
    // «se lo traga el de arriba». Lo que lo distingue son estas tres cosas:
    // el turno lo sigue jugando el AGENTE, las tres acciones entran, y el mirón
    // se llama UNA vez y se desengancha.
    const acciones = [
      { type: 'build', town: 'town-1', building: 'necromancer_dwelling_2' },
      { type: 'recruit', town: 'town-1', creature: 'skeleton', count: 1 },
      { type: 'end_turn' },
    ];
    const { link } = await montar((kind) =>
      kind === 'adventure_turn' ? { actions: acciones } : undefined,
    );
    let llamadas = 0;
    const director = new Director(link, {
      seed: 5,
      agentPlayers: [1],
      onFrame: () => {
        llamadas++;
        throw new Error('al mirón se le ha muerto el socket');
      },
    });
    await director.playTurn();
    const informe = await director.playTurn();

    expect(informe.by).toBe('agent');
    expect(informe.actions).toBe(3);
    expect(llamadas).toBe(1);
    // Y el motivo queda escrito donde lo lee una persona, con la frase de este
    // fallo y no con la del relevo de la heurística.
    expect(director.log.join('\n')).toContain('se deja de retransmitir');
    expect(director.log.join('\n')).toContain('al mirón se le ha muerto el socket');
    expect(director.log.join('\n')).not.toContain('toma el relevo');
  });
});

describe('la batalla en la vista', () => {
  /**
   * Una batalla de verdad en curso: el héroe del jugador 0 entra en el del 1.
   *
   * Se monta con el director parado a mitad —el agente contesta a
   * `adventure_turn` pero se CALLA en `battle_turn`— porque lo que hay que mirar
   * es la vista MIENTRAS se decide, y con el agente respondiendo la batalla se
   * acaba dentro de la misma llamada.
   */
  function conBatalla(): { state: GameState; atacante: Hero } {
    const state = newGame({ seed: 5 });
    const ctx = { rng: createRng(5) };
    const mio = state.heroes.find((h) => h.owner === 1) as Hero;
    const atacante = state.heroes.find((h) => h.owner === 0) as Hero;
    atacante.at = vecina(state, mio.at);
    atacante.movePoints = 20000;
    applyAdventureAction(state, { type: 'move_hero', hero: atacante.id, to: mio.at }, ctx, 0);
    if (state.pendingBattle === null) throw new Error('no se abrió ninguna batalla');
    return { state, atacante };
  }

  it('mientras se decide, `battle` deja de ser `null` y dice de quién es cada bando', () => {
    const { state } = conBatalla();
    const vista = construirVista(state, []);
    expect(vista.battle).not.toBeNull();
    // Los dueños, que es lo que le deja pintar cada bando de su color sin
    // rederivar `battleOwners` — una tercera copia de algo que ya discrepó una vez.
    expect(vista.battle?.dueños).toEqual({ attacker: 0, defender: 1 });
    expect(vista.battle?.estado.stacks.length).toBeGreaterThan(0);
  });

  it('el `BattleState` viaja entero por JSON: no lleva ni un `Set` ni un `Map`', () => {
    const { state } = conBatalla();
    const vista = construirVista(state, []);
    expect(JSON.parse(JSON.stringify(vista.battle))).toEqual(vista.battle);
  });

  it('y al acabarla vuelve a ser `null`, que es como el espectador cambia de escena', () => {
    const { state } = conBatalla();
    expect(construirVista(state, []).battle).not.toBeNull();

    // La cierra quien la abrió, que es el contrato: `resolvePendingBattle` es
    // exactamente lo que llama el director cuando no se la queda nadie.
    resolvePendingBattle(state, { rng: createRng(5) });

    expect(state.pendingBattle).toBeNull();
    expect(construirVista(state, []).battle).toBeNull();
  });
});
