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
 *     queda en `{}` sin decir nada, y la vista lleva uno, `fog`; los caminos
 *     van como tramos—;
 *  2. que un turno de N acciones dé N fotogramas, que es lo que #30 necesita
 *     para enseñar una batalla acción a acción en vez de un pase de
 *     diapositivas;
 *  3. que `view.battle` deje de ser `null` mientras se decide una batalla y
 *     vuelva a serlo al acabarla, porque el espectador cambia de escena con eso;
 *  4. que los dueños de los bandos viajen, que es lo que le deja pintar cada
 *     bando del color de su jugador sin rederivar `battleOwners` por su cuenta.
 */

import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { adaptarBatalla, adaptarEscena } from '../src/client/espectador/adaptar.js';
import { type Catalogo, RUTA_DEL_CATALOGO } from '../src/client/render/escenario/catalogo.js';
import { componer } from '../src/client/render/escenario/colocar.js';
import type { AdventureScene } from '../src/client/render/mapa.js';
import { createBattle } from '../src/core/battle/battle.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { unidadDelJuego, unidadesDelJuego } from '../src/core/catalogo.js';
import { tiposDeHeroe } from '../src/core/data.js';
import { umbral } from '../src/core/hero/experiencia.js';
import type { Hero } from '../src/core/hero/hero.js';
import { aPunto, pointKey, reachableFrom } from '../src/core/map/map.js';
import { isWalkable } from '../src/core/map/terrain.js';
import { createRng } from '../src/core/rng.js';
import { CHARACTER_BODY, createCharacter, defaultBuild } from '../src/core/rpg/character.js';
import { combatProfile } from '../src/core/rpg/stats.js';
import {
  applyAdventureAction,
  ascenderVeterano,
  type GameState,
  resolvePendingBattle,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point, UnitInfo } from '../src/core/types.js';
import { AgentLink } from '../src/server/agent-link.js';
import { Director } from '../src/server/director.js';
import {
  construirVista,
  type SpectatorView,
  type VistaHeroe,
} from '../src/server/vista-espectador.js';
import { ponVeteranoEnLaBase } from '../tools/qa/veterano-en-la-base.js';
import {
  conCaminos,
  costesDelAlcance,
  monstruoVivo,
  sinGuarnicionDeSalida,
  TROPA,
} from './helpers.js';

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
  const [clave] = [...costesDelAlcance(reachableFrom(state.map, desde)).entries()]
    .filter(([, coste]) => coste > 0)
    .sort((a, b) => a[1] - b[1])[0]!;
  const [x, y] = clave.split(',').map(Number);
  return { x: x as number, y: y as number };
}

describe('la vista del espectador', () => {
  it('sobrevive a un JSON de ida y vuelta, que es donde mueren los `Set`', () => {
    // `fog` es un `Set` en el estado. `JSON.stringify` lo deja en `{}` sin
    // decir nada —lo mismo que avisa #10 para el guardado—, así que una niebla
    // vacía habría llegado al espectador sin que nada se pusiera rojo. Aquí se
    // comprueba que sale como lista y que vuelve.
    const state = newGame({ seed: 5 });
    const vista = construirVista(state, ['una nota del director']);

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
    state.players[0]?.fog.add({ x: 9, y: 9 });
    // Una casilla de camino suelta, que viaja aparte de los tramos.
    const libre = state.map.terrain.findIndex(
      (t, i) => isWalkable(t) && !state.map.caminos.indices.includes(i),
    );
    state.map = conCaminos(state.map, pointKey(aPunto(libre, state.map.width)));

    const escena = adaptarEscena(JSON.parse(JSON.stringify(construirVista(state, []))));

    // La niebla, que viaja como índices y esta función rehace en `Casillas`.
    expect(escena.players[0]?.fog.indices()).toEqual(state.players[0]?.fog.indices());
    expect(escena.players[0]?.fog.has({ x: 9, y: 9 })).toBe(true);
    // Y la red de caminos, que viaja plana: los mismos tramos y las mismas
    // sueltas, así que el espectador pinta lo que pinta el cliente (#153).
    expect(state.map.caminos.tramos.length).toBeGreaterThan(0);
    expect(escena.map.caminos).toEqual(state.map.caminos);
    expect(escena.map.width).toBe(state.map.width);
    expect(escena.map.terrain).toEqual(state.map.terrain);
    expect(escena.map.regions).toEqual(state.map.regions);
    expect(escena.map.regions.length).toBeGreaterThan(0);
    // La barrera de cada nodo, que el escenógrafo lee para su pieza (#145).
    expect(escena.map.objects).toEqual(state.map.objects);
    expect(escena.map.objects.filter((o) => o.kind === 'node').length).toBeGreaterThan(0);
  });

  it('un mapa que no es una red de caminos lanza diciendo por qué, y no toca el terreno guardado', () => {
    // H1 y H2 de la QA de #153. El espectador adapta ANTES de enseñar (`aplicar`
    // en `main.ts`), así que lo que lanza aquí no sustituye a la vista buena y
    // su motivo es lo que sale en la barra: tiene que leerse.
    const state = newGame({ seed: 5 });
    const buena: SpectatorView = JSON.parse(JSON.stringify(construirVista(state, [])));
    const terreno = adaptarEscena(buena).map.terrain;
    const otroTerreno = [...buena.map.terrain];
    otroTerreno[0] = otroTerreno[0] === 'water' ? 'grass' : 'water';
    const con = (map: Partial<SpectatorView['map']> & Record<string, unknown>): SpectatorView => ({
      ...buena,
      // Con una casilla de terreno cambiada: si el fotograma malo llegara a
      // guardarlo, el siguiente bueno ya no devolvería el array de antes.
      map: { ...buena.map, terrain: otroTerreno, ...map },
    });

    // El formato de antes de #153: un `pnpm partida` sin actualizar manda `roads`.
    const { tramos: _t, sueltas: _s, ...sinTramos } = buena.map;
    const vieja = {
      ...buena,
      map: { ...sinTramos, terrain: otroTerreno, roads: ['1,1'] },
    } as unknown as SpectatorView;
    expect(() => adaptarEscena(vieja)).toThrow(
      /el mapa llega sin `tramos` ni `sueltas`: el servidor habla el formato de antes de #153/,
    );
    // Un índice de menos: antes salía un tramo con una punta en (NaN,NaN).
    expect(() => adaptarEscena(con({ tramos: buena.map.tramos.slice(0, -1) }))).toThrow(
      /los tramos de camino llegan con \d+ índices, y van dos por tramo/,
    );
    const W = buena.map.width;
    expect(() => adaptarEscena(con({ tramos: [0, 2 * W + 2] }))).toThrow(
      /de \(0,0\) a \(2,2\) no une dos casillas vecinas distintas/,
    );
    expect(() => adaptarEscena(con({ tramos: [0, 1, 1, 0] }))).toThrow(/está repetido/);
    expect(() => adaptarEscena(con({ tramos: [W * buena.map.height, 0] }))).toThrow(
      /cae fuera del mapa/,
    );
    // Un nodo sin la barrera que cruza: el servidor de antes de #145.
    const sinBarrera = buena.map.objects.map((o) => {
      if (o.kind !== 'node') return o;
      const { barrera: _, ...resto } = o;
      return resto;
    }) as unknown as SpectatorView['map']['objects'];
    expect(sinBarrera.some((o) => o.kind === 'node')).toBe(true);
    expect(() => adaptarEscena(con({ objects: sinBarrera }))).toThrow(
      /el nodo node-\d+ llega sin la barrera que cruza: el servidor habla el formato de antes de #145/,
    );
    // Una región sin su nivel de altura: el servidor de antes de #143.
    const sinNivel = buena.map.regions.map(({ nivel: _, ...resto }) => resto);
    expect(() =>
      adaptarEscena(con({ regions: sinNivel as unknown as SpectatorView['map']['regions'] })),
    ).toThrow(
      /la región region-0 llega sin su nivel de altura: el servidor habla el formato de antes de #143/,
    );
    // Ninguno de los rechazados ha cambiado el terreno guardado: uno bueno con
    // un array recién copiado recibe el de antes, no el suyo.
    const copia = { ...buena, map: { ...buena.map, terrain: [...buena.map.terrain] } };
    expect(adaptarEscena(copia).map.terrain).toBe(terreno);
  });

  it('el héroe nacido de la tropa cruza el cable con su tipo y su historia', () => {
    // El tipo viaja por su NOMBRE —el espectador no sabe la facción del héroe
    // para buscarlo— y la historia tal cual; los demás, con la suya a `null`.
    const state = newGame({ seed: 5 });
    const id = ponVeteranoEnLaBase(state, 1);
    // Un tipo que no es el de por defecto (el primero) de su facción.
    const tipo = tiposDeHeroe(state.players[1]!.faction)[1]!;
    ascenderVeterano(state, 1, id, {
      name: 'Ana <la> Paciente',
      story: 'Guardó la puerta & no se movió.',
      heroType: tipo.id,
    });
    // Los héroes no pasan por `adaptarEscena` (#64: el lienzo los recibe aparte
    // de la escena); se leen del fotograma tal como lo pinta `main.ts`.
    const vista = JSON.parse(JSON.stringify(construirVista(state, [])));
    adaptarEscena(vista);
    const heroes: VistaHeroe[] = vista.heroes;
    expect(heroes.map((h) => h.id)).toEqual(state.heroes.map((h) => h.id));
    const nacida = heroes.find((h) => h.id === `hero-${id}`) as VistaHeroe;
    expect(nacida).toMatchObject({
      name: 'Ana <la> Paciente',
      nombreDelTipo: tipo.nombre,
      historia: 'Guardó la puerta & no se movió.',
    });
    const otros = heroes.filter((h) => h.id !== nacida.id);
    expect(otros.map((h) => h.historia)).toEqual(otros.map(() => null));
    // Los demás, con el tipo de por defecto de su facción.
    const porDefecto = (h: VistaHeroe): string =>
      tiposDeHeroe(state.heroes.find((x) => x.id === h.id)!.faction)[0]!.nombre;
    expect(otros.map((h) => h.nombreDelTipo)).toEqual(otros.map(porDefecto));
  });

  it('el terreno que no cambia vuelve como EL MISMO array, para no rehacer la superficie', () => {
    // El lienzo rehace la superficie del mapa cuando el array de terreno es
    // otro; cada fotograma del cable trae uno recién parseado.
    const state = newGame({ seed: 5 });
    const cable = (): SpectatorView => JSON.parse(JSON.stringify(construirVista(state, [])));
    const primero = adaptarEscena(cable()).map.terrain;
    expect(adaptarEscena(cable()).map.terrain).toBe(primero);
    state.map.terrain[0] = state.map.terrain[0] === 'water' ? 'grass' : 'water';
    const cambiado = adaptarEscena(cable()).map.terrain;
    expect(cambiado).not.toBe(primero);
    expect(cambiado).toEqual(state.map.terrain);
  });

  it('la escena del mapa que sale del cable es la de la partida: misma semilla, mismo mapa vestido', () => {
    // Antes el espectador componía con la semilla 0: el mismo mapa con otros
    // árboles, otras rocas y otros caminos que quien juega.
    const state = newGame({ seed: 7 });
    const vista: SpectatorView = JSON.parse(JSON.stringify(construirVista(state, [])));
    expect(vista.seed).toBe(7);
    const escena = adaptarEscena(vista);
    const catalogo = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', RUTA_DEL_CATALOGO), 'utf8'),
    ) as Catalogo;
    expect(JSON.stringify(componer(escena.map, vista.seed, catalogo))).toBe(
      JSON.stringify(componer(state.map, state.seed, catalogo)),
    );
  });

  it('un `GameState` satisface `AdventureScene` sin adaptar nada', () => {
    // Es la otra mitad del criterio 11: `main.ts` no cambió ni un carácter al
    // hacer estructural el tipo del lienzo, y esto lo deja escrito para que no
    // se rompa por accidente. Si dejara de valer, esta línea no compila.
    const state: AdventureScene = newGame({ seed: 5 });
    expect(state.map.width).toBeGreaterThan(0);
  });
});

/**
 * Tres acciones que entran en el turno del agente, leídas de lo que le llega:
 * levantar lo primero que se pueda en su base, reclutar uno de lo primero que
 * tenga disponible y acabar. Se leen del turno y no se escriben: la facción del
 * jugador sale de la semilla, y con ella sus moradas y sus unidades.
 */
function tresAcciones(payload: any): unknown[] {
  const base = payload.towns.find((t: any) => t.id === payload.yourBase);
  const obra = base.canBuildNow[0].id as string;
  const recluta = base.recruitable.find((r: any) => r.available > 0).creature as string;
  return [
    { type: 'build', town: base.id, building: obra },
    { type: 'recruit', town: base.id, creature: recluta, count: 1 },
    { type: 'end_turn' },
  ];
}

describe('el fotograma por acción', () => {
  it('un turno de N acciones da N fotogramas, y no uno', async () => {
    // Antes había UNO por turno: una batalla entera caía entre dos snapshots.
    const { link } = await montar((kind, payload) =>
      kind === 'adventure_turn' ? { actions: tresAcciones(payload) } : undefined,
    );

    const fotogramas: number[] = [];
    const director = new Director(link, {
      seed: 5,
      agentPlayers: [1],
      onFrame: () => fotogramas.push(director.state.day),
    });
    // La base nace llena (`guarnicionBase`) y el héroe no está dentro: sin
    // vaciarla, el `recruit` se descartaría y serían dos acciones y no tres.
    sinGuarnicionDeSalida(director.state);
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
    // La 6: con la 5, desde las dos puertas de la mina (#230) dos fotogramas
    // seguidos de la batalla salen con el mismo registro (91 y 91: una acción
    // que no deja hecho), y la última comprobación no lo admite.
    const semilla = 6;
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
    //
    // «Pegado» es en el registro CRUDO y del MISMO stack. Antes se miraba la
    // lista ya filtrada y sin mirar quién: un `move` de un stack seguido del
    // `attack` de otro contaba como una carga, y con el héroe en el tablero
    // (fase 1b) esta semilla sacaba tres acciones de menos.
    const primarias = new Set(['move', 'wait', 'defend', 'shoot', 'cast', 'attack', 'surrender']);
    const hechos = batalla.log.filter(
      (e) => primarias.has(e.kind) && !(e.kind === 'attack' && e.retaliation),
    );
    const cargas = batalla.log.filter((e, i) => {
      const siguiente = batalla.log[i + 1];
      return (
        e.kind === 'move' &&
        siguiente?.kind === 'attack' &&
        !siguiente.retaliation &&
        siguiente.stack === e.stack
      );
    }).length;
    const acciones = hechos.length - cargas;

    expect(acciones).toBeGreaterThan(1);
    // El `+1` es el fotograma del `move_hero` que ABRIÓ la batalla: en él la
    // batalla ya está desplegada, y es el primero que ve quien mira. Puede
    // haber más: un `end_turn` (cerrar el turno tras un tramo de `move`) es una
    // acción y da su fotograma, pero no deja hecho en el registro. Con el mapa
    // de #189 sale uno en esta semilla (y en 1, 2, 7 y 8), y la cuenta exacta
    // de antes daba uno de menos. Por eso, además, cada fotograma lleva como
    // mucho UNA acción: sin el `this.frame()` del bucle se juntarían.
    expect(enBatalla).toBeGreaterThanOrEqual(acciones + 1);
    let desde = 0;
    for (const hasta of largos.slice(1)) {
      const trozo = batalla.log.slice(desde, hasta);
      const deEste = trozo.filter(
        (e) => primarias.has(e.kind) && !(e.kind === 'attack' && e.retaliation),
      ).length;
      const cargasDeEste = trozo.filter((e, i) => {
        const siguiente = trozo[i + 1];
        return (
          e.kind === 'move' &&
          siguiente?.kind === 'attack' &&
          !siguiente.retaliation &&
          siguiente.stack === e.stack
        );
      }).length;
      expect(deEste - cargasDeEste, `fotograma de ${desde} a ${hasta}`).toBeLessThanOrEqual(1);
      desde = hasta;
    }
    // Y son fotogramas de verdad repartidos, no N copias del final: el registro
    // crece en cada uno, salvo en los de las acciones que no dejan hecho (el
    // `end_turn` de arriba), que son como mucho los fotogramas de más. Con los
    // ríos (#144) esta semilla saca uno así en mitad de la batalla.
    expect(largos).toEqual([...largos].sort((a, b) => a - b));
    expect(largos.length - new Set(largos).size).toBeLessThanOrEqual(enBatalla - (acciones + 1));
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
    const { link } = await montar((kind, payload) =>
      kind === 'adventure_turn' ? { actions: tresAcciones(payload) } : undefined,
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
    sinGuarnicionDeSalida(director.state);
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

  /**
   * Si estas cifras son las de una criatura del catálogo —la MISMA referencia,
   * no unas que se le parezcan—. Vivía en `core/data.ts` desde que el precio de
   * rendición se leía de la referencia; desde que viaja en `origen.oro` solo la
   * pregunta este test, y aquí está.
   */
  const esDelCatalogo = (u: UnitInfo): boolean => unidadesDelJuego().some((c) => c === u);

  /**
   * La batalla sin lo que el cable no manda (`stackAlCable`): lo ganado y la
   * hoja de servicios vuelven vacíos de `adaptarBatalla`, y las cifras que
   * viajan (héroe y personaje) llegan sin `equipo`; la ida y vuelta se compara
   * en todo lo demás. Se quita exactamente eso, y no se relaja la comparación
   * entera. (Las del catálogo las rehace el espectador con `cifrasDeUnidad`, y
   * esas sí lo llevan.)
   */
  const sinCuerpo = (u: UnitInfo): UnitInfo => {
    const { equipo: _puesto, ...cifras } = u;
    return cifras;
  };
  const sinLoQueNoViaja = (b: BattleState): BattleState => ({
    ...b,
    stacks: b.stacks.map(
      (s): BattleStack => ({
        ...s,
        unit: s.origen.kind === 'catalogo' ? s.unit : sinCuerpo(s.unit),
        ganado: { experiencia: 0, bajas: 0, heroes: [] },
        origen:
          s.origen.kind === 'heroe' || s.origen.veterania === null
            ? s.origen
            : {
                ...s.origen,
                veterania: { ...s.origen.veterania, batallas: 0, bajas: 0, heroes: [] },
              },
      }),
    ),
  });

  it('una criatura viaja SIN `unit`, el héroe CON la suya, y `adaptarBatalla` lo rehace todo', () => {
    const { state } = conBatalla();
    const batalla = state.pendingBattle!.battle;
    const ida: SpectatorView = JSON.parse(JSON.stringify(construirVista(state, [])));
    // El catálogo no viaja: las dos puntas ya lo tienen. El cuerpo del héroe
    // (fase 1b) no está en el catálogo, así que viaja como el de un personaje.
    // Lo decide `origen`, y el origen tiene que decir la verdad: un novato del
    // catálogo lleva EXACTAMENTE la referencia del catálogo, y lo que no es del
    // catálogo no la lleva. (Un veterano del catálogo no la lleva tampoco —sus
    // cifras son una copia con la veteranía—, y tiene su propio test abajo.)
    const comandantes = batalla.stacks.filter((s) => s.origen.kind === 'heroe');
    expect(comandantes.length).toBeGreaterThan(0);
    for (const s of batalla.stacks) {
      const novatoDelCatalogo = s.origen.kind === 'catalogo' && s.origen.veterania === null;
      expect(esDelCatalogo(s.unit), s.id).toBe(novatoDelCatalogo);
      const enCable = ida.battle!.estado.stacks.find((x) => x.id === s.id)!;
      expect('unit' in enCable, s.id).toBe(s.origen.kind !== 'catalogo');
    }
    for (const c of comandantes) {
      const viaja = ida.battle!.estado.stacks.find((x) => x.id === c.id)!.unit!;
      // Lo puesto (`UnitInfo.equipo`) no viaja: sus cifras ya van sumadas.
      expect(c.unit.equipo, c.id).toBeDefined();
      expect('equipo' in viaja, c.id).toBe(false);
      expect(viaja).toEqual(sinCuerpo(c.unit));
    }
    expect(adaptarBatalla(ida.battle!)).toEqual(sinLoQueNoViaja(batalla));
  });

  it('un veterano del catálogo viaja SIN `unit` y llega con sus cifras de veterano', () => {
    const { state } = conBatalla();
    const batalla = createBattle(
      {
        army: [
          {
            creature: TROPA,
            count: 1,
            veterania: { id: 'v-1', experiencia: umbral(4), batallas: 3, bajas: 4, heroes: [] },
          },
        ],
        hero: null,
      },
      { army: [{ creature: 'zombi', count: 3 }], hero: null },
      createRng(5),
    );
    state.pendingBattle = { ...state.pendingBattle!, battle: batalla };
    const ida: SpectatorView = JSON.parse(JSON.stringify(construirVista(state, [])));
    const [veterano] = ida.battle!.estado.stacks;
    // Las cifras no viajan: se derivan de catálogo + veteranía, que sí viaja.
    expect(veterano!.unit).toBeUndefined();
    // Viaja quién es y su experiencia, y nada de la hoja de servicios ni del
    // precio ni de lo ganado: el espectador no pinta ninguna de las cuatro.
    expect(veterano!.origen).toEqual({
      kind: 'catalogo',
      veterania: { id: 'v-1', experiencia: umbral(4) },
    });
    expect('ganado' in veterano!).toBe(false);
    const vuelta = adaptarBatalla(ida.battle!);
    expect(vuelta).toEqual(sinLoQueNoViaja(batalla));
    // `sinLoQueNoViaja` deja el precio: no viaja y se rehace del catálogo, el mismo.
    // Rango 4: más ataque que el novato del catálogo. Si el espectador
    // rehiciera con `unidadDelJuego(body)` a secas, le pintaría cifras de novato.
    expect(vuelta.stacks[0]!.unit.attack).toBe(batalla.stacks[0]!.unit.attack);
    expect(vuelta.stacks[0]!.unit.attack).toBeGreaterThan(unidadDelJuego(TROPA).attack);
  });

  it('un personaje viaja CON su `unit`, que no está en ninguna otra parte', () => {
    const { state } = conBatalla();
    const aren = createCharacter('aren', defaultBuild);
    const batalla = createBattle(
      {
        army: [{ creature: CHARACTER_BODY, count: 1, member: aren.id }],
        hero: null,
        members: new Map([[aren.id, { profile: combatProfile(aren), hp: 20 }]]),
      },
      { army: [{ creature: 'zombi', count: 3 }], hero: null },
      createRng(5),
    );
    state.pendingBattle = { ...state.pendingBattle!, battle: batalla };

    const ida: SpectatorView = JSON.parse(JSON.stringify(construirVista(state, [])));
    const [suyo, zombi] = ida.battle!.estado.stacks;
    expect(suyo!.unit?.name).toBe('Aren');
    expect(zombi!.unit).toBeUndefined();
    expect(adaptarBatalla(ida.battle!)).toEqual(sinLoQueNoViaja(batalla));
  });

  it('un cuerpo que no está en el catálogo y llega sin `unit` lanza, no se inventa', () => {
    const { state } = conBatalla();
    const vista = construirVista(state, []);
    const roto = {
      ...vista.battle!,
      estado: {
        ...vista.battle!.estado,
        stacks: [{ ...vista.battle!.estado.stacks[0]!, body: CHARACTER_BODY }],
      },
    };
    expect(() => adaptarBatalla(roto)).toThrow(/no hay ninguna unidad «character»/);
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
