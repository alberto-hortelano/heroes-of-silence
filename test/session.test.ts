/**
 * La puerta del cliente al núcleo, ahora que el turno del rival es asíncrono.
 *
 * `Session` no toca el DOM —pinta `main.ts`, decide esto—, así que se prueba
 * igual que el resto. Lo que se mira aquí es lo que abrió el `endTurn()`
 * asíncrono: la reentrada. Antes no había un solo instante en el que pulsar dos
 * veces significara algo; ahora sí, y hay que cerrarlo.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { Session } from '../src/client/session.js';
import { renderSide } from '../src/client/views/panels.js';
import { armyLeadership, GARRISON_LEADERSHIP } from '../src/core/hero/troop.js';
import { Casillas } from '../src/core/map/casillas.js';
import { pointFromKey, reachableFrom } from '../src/core/map/map.js';
import { isWalkable } from '../src/core/map/terrain.js';
import { asaltantesALaVista } from '../src/core/state/asaltantes.js';
import {
  applyAdventureAction,
  HERO_SCOUT_RADIUS,
  heroesOf,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import {
  anteLaBase,
  costesDelAlcance,
  pegadoA,
  planDeNodos,
  primeraMarchaQueSePara,
} from './helpers.js';

describe('sesión del cliente: el turno del rival', () => {
  it('mientras juega el rival no es tu turno, y pulsar otra vez no hace nada', async () => {
    // Guarda dos cosas a la vez. La reentrada: la segunda pulsación no puede
    // colar un día de más. Y el fallo más probable de este cambio: si el bucle
    // de `runAiTurns` preguntara por `isPlayersTurn` —que ahora incluye la
    // bandera— daría las 20 vueltas de su tope y aquí saldrían seis días.
    const s = new Session(12);
    expect(s.state.day).toBe(1);
    const primero = s.endTurn();

    // La bandera está arriba: el botón sale deshabilitado y `clickTile` calla.
    expect(s.isPlayersTurn).toBe(false);
    const segundo = s.endTurn();

    await Promise.all([primero, segundo]);

    // Un solo día, y el control de vuelta en la persona.
    expect(s.state.day).toBe(2);
    expect(s.state.current).toBe(s.viewer);
    expect(s.isPlayersTurn).toBe(true);
  });

  it('construir en turno ajeno se rechaza con un motivo escrito para la persona', async () => {
    const s = new Session(13);
    // Al día 2, que la persona cierra: en serpiente (`ordenDelDia`) abre
    // también el 3 y el rival no juega en medio.
    await s.endTurn();
    expect(s.state.day).toBe(2);
    expect(s.state.current).toBe(s.viewer);
    s.openTown(s.myTowns()[0]!.id);
    const edificios = s.activeTown!.buildings.length;

    const enCurso = s.endTurn();
    s.build('town_hall');
    s.hireHero();

    // `state.current` ya vuelve a ser el nuestro y lo único que sabe que hay
    // algo a medias es la bandera, que baja al resolverse `endTurn()`. Esa
    // frase la pone el cliente porque el núcleo no puede saberla.
    expect(s.state.current).toBe(s.viewer);
    expect(s.status).toBe('Espera: el turno del rival aún se está resolviendo.');
    expect(s.activeTown!.buildings.length).toBe(edificios);

    await enCurso;
    expect(s.isPlayersTurn).toBe(true);
    expect(s.state.day).toBe(3);
  });

  it('cuando el turno es del rival de verdad, la frase la escribe el núcleo', () => {
    // Es lo que verá el cliente el día que hable por WebSocket, y lo que ya ve
    // el agente: la única redacción que dice QUIÉN está jugando. Vivía en
    // `game.ts` y no se enseñaba jamás, porque el cliente comprobaba el turno
    // antes de llamar y respondía con dos frases suyas que no lo decían.
    const s = new Session(15);
    s.openTown(s.myTowns()[0]!.id);
    const edificios = s.activeTown!.buildings.length;

    s.state.current = 1;
    s.build('town_hall');

    expect(s.status).toBe('todavía no es tu turno: ahora juega el jugador 1 (necromancer)');
    expect(s.activeTown!.buildings.length).toBe(edificios);

    // Y `clickTile` enseña la misma, en vez de su propio «Espera tu turno.».
    s.clickTile({ x: 0, y: 0 });
    expect(s.status).toBe('todavía no es tu turno: ahora juega el jugador 1 (necromancer)');
  });

  it('si el turno del rival revienta, el tablero lo DICE en vez de quedarse mudo', async () => {
    // Ningún camino real produce hoy este fallo, así que se fuerza desde fuera.
    // Lo que había: el `finally` bajaba la bandera y nadie escribía nada, el
    // botón seguía deshabilitado porque `state.current` se queda en la IA, y el
    // motivo solo salía por la consola como `unhandledrejection`.
    const s = new Session(14);
    (s as unknown as { runAiTurns: () => Promise<void> }).runAiTurns = () => {
      throw new Error('el rival ha reventado a mitad');
    };

    await s.endTurn();

    expect(s.status).toContain('el rival ha reventado a mitad');
    // Y la bandera vuelve abajo pase lo que pase: si se quedara arriba, el
    // juego se quedaría mudo para siempre, que es peor que el fallo.
    expect((s as unknown as { turnoDelRivalEnCurso: boolean }).turnoDelRivalEnCurso).toBe(false);
  });
});

describe('sesión del cliente: el bando de la persona', () => {
  /**
   * Una batalla en la que la persona DEFIENDE. Hoy no llega ninguna al cliente
   * —`playAiTurn` autorresuelve lo que el rival le echa encima—, así que se monta
   * a mano: el héroe del jugador 1 entra en la casilla del héroe del jugador 0.
   */
  function meAtacan(semilla: number) {
    const s = new Session(semilla);
    const mio = heroesOf(s.state, 0)[0]!;
    const suyo = heroesOf(s.state, 1)[0]!;
    s.state.current = 1;
    suyo.at = pegadoA(s.state, mio.at);
    suyo.movePoints = 100000;
    applyAdventureAction(s.state, { type: 'move_hero', hero: suyo.id, to: mio.at }, s.ctx, 1);
    if (s.state.pendingBattle === null) throw new Error('el rival no llegó a atacar');
    return { s, mio };
  }

  it('defendiendo, el bando sale del dueño y no de suponerse atacante', () => {
    const { s, mio } = meAtacan(7);

    expect(s.miBando).toBe('defender');
    // El libro de hechizos que se pinta es el MÍO. Suponiendo `attacker` era el
    // del rival: se le habría ofrecido a la persona lanzar con el maná del otro.
    expect(s.battleHero?.name).toBe(mio.name);
  });

  it('con el rival activo no se le puede mover NADA a la persona', () => {
    const { s } = meAtacan(7);
    const activo = s.battle!.stacks.find((x) => x.id === s.battle!.turno?.stack)!;
    expect(activo.side).toBe('attacker');

    // Aquí mordía de verdad: dando por hecho que la persona es el atacante, el
    // tablero pintaba en verde los hexes del stack del RIVAL y dejaba moverlo.
    expect(s.battleMovable()).toEqual([]);
    expect(s.spellOptions()).toEqual([]);
  });

  it('el turno del rival lo juega la IA hasta que le toca a la persona', () => {
    const { s } = meAtacan(7);

    s.advanceEnemyTurns();

    const battle = s.battle!;
    if (battle.finished === null) {
      const activo = battle.stacks.find((x) => x.id === battle.turno?.stack)!;
      // Lo contrario de lo que hacía: se paraba al ver un atacante —creyéndolo
      // suyo— y devolvía el mando con el turno del rival a medias.
      expect(activo.side).toBe('defender');
      expect(s.battleMovable().length).toBeGreaterThan(0);
    }
  });
});

describe('sesión del cliente: reclutar lo que cabe y ver la ruta entera', () => {
  it('«todo» pide lo que cabe: con el liderazgo casi lleno, el máximo es menor que lo disponible', () => {
    const s = new Session(7);
    const town = s.myTowns()[0]!;
    // La base nace llena (`guarnicionBase`): aquí se mide «todo» con sitio.
    town.garrison = [];
    s.openTown(town.id);
    town.available.peasant = 12;

    const plan = s.recruitPlan('peasant')!;
    // La guarnición de salida tiene 20 de liderazgo y el campesino ocupa 2.
    expect(plan.disponibles).toBe(12);
    expect(plan.maximo).toBeLessThan(plan.disponibles);

    // Uno más del máximo: el núcleo lo rechaza diciendo que no cabe.
    s.recruit('peasant', plan.maximo + 1);
    expect(s.status).toMatch(/no cabe/);
    expect(town.garrison.length).toBe(0);

    // Y «todo» recluta exactamente el máximo, sin mensaje de error.
    s.recruitAll('peasant');
    expect(s.status).toBe('');
    expect(town.garrison.length).toBe(plan.maximo);
    expect(s.recruitPlan('peasant')!.maximo).toBe(0);

    // Con el cupo lleno, «todo» no calla: el motivo lo escribe el núcleo.
    s.recruitAll('peasant');
    expect(s.status).toMatch(/no cabe/);
  });

  it('la ruta previsualizada llega hasta el destino y marca lo que no se alcanza hoy', () => {
    const s = new Session(7);
    const heroe = s.selectedHero!;
    // Lejos: la otra esquina del mapa, que no se anda en un día. La casilla
    // con ruta más cercana a (W − 4, H − 4), anillo a anillo: desde #229 esa
    // casilla de la semilla 7 queda detrás del héroe rival, que no se cruza.
    const esquina = { x: s.state.map.width - 4, y: s.state.map.height - 4 };
    let lejos = esquina;
    let ruta = s.previewPath(lejos);
    for (let r = 1; ruta.length === 0 && r < 6; r++) {
      for (let dy = -r; dy <= r && ruta.length === 0; dy++) {
        for (let dx = -r; dx <= r && ruta.length === 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          lejos = { x: esquina.x + dx, y: esquina.y + dy };
          ruta = s.previewPath(lejos);
        }
      }
    }
    expect(ruta.length).toBeGreaterThan(0);
    expect(ruta.at(-1)!.at).toEqual(lejos);
    expect(ruta.some((p) => !p.hoy)).toBe(true);
    // Lo de hoy va primero y en un tramo: no hay un paso de hoy después de uno de otro día.
    const primeroOtroDia = ruta.findIndex((p) => !p.hoy);
    expect(ruta.slice(primeroOtroDia).every((p) => !p.hoy)).toBe(true);
    for (const p of ruta) expect(p.hoy).toBe(p.cost <= heroe.movePoints);
  });

  it('el liderazgo del héroe es lo que ocupa su ejército sobre su tope', () => {
    const s = new Session(7);
    const heroe = s.selectedHero!;
    // Lo ocupado no se escribe con la cifra de la semilla: el ejército de salida
    // sale del mismo `rng` que el mapa, y cada mapa tira distinto —fue 14 con el
    // de esquinas, 10 con el de nodos de 24, 14 con el de 28 y 12 con el denso
    // de 34—. Se pide a la misma suma que la guarnición de abajo; el tope sí es
    // fijo, el de un héroe de nivel 5.
    const ocupado = armyLeadership(heroe.army);
    expect(ocupado).toBeGreaterThan(0);
    expect(s.liderazgo({ heroe: heroe.id })).toEqual({ ocupado, tope: 20 });
  });

  it('la guarnición va por el mismo camino, con el tope de guarnición', () => {
    const s = new Session(7);
    const pueblo = s.myTowns()[0]!;
    expect(s.liderazgo({ guarnicion: pueblo.id })).toEqual({
      ocupado: armyLeadership(pueblo.garrison),
      tope: GARRISON_LEADERSHIP,
    });
  });

  it('lo que ve el héroe ahora está explorado, y lo visible se rehace al moverse', () => {
    // Decía «lo visible es un subconjunto de lo explorado», y era verdad por
    // casualidad: con el castillo en (3,3) y el héroe en (4,4), el cuadrado de
    // 5 del castillo y el de 4 del héroe llegaban a la misma columna. El
    // castillo **no despeja niebla** —`TOWN_SCOUT_RADIUS` alimenta
    // `visibleNow` y no `fog`, y está escrito allí—, así que en cuanto el mapa
    // de nodos movió la base, su borde quedó visible sin explorar. Lo que sí
    // tiene que estar explorado es lo que ve el héroe.
    const s = new Session(7);
    const fog = s.state.players[0]!.fog;
    const antes = s.visibles();
    const heroe0 = s.selectedHero!;
    const delHeroe = Casillas.vacias(s.state.map);
    delHeroe.marcarCuadrado(heroe0.at, HERO_SCOUT_RADIUS);
    expect(delHeroe.size).toBeGreaterThan(0);
    for (const k of delHeroe) {
      expect(antes.has(k)).toBe(true);
      expect(fog.has(k)).toBe(true);
    }
    expect(s.visibles()).toBe(antes); // la caché: el mismo objeto sin cambios
    const heroe = s.selectedHero!;
    // Un destino a dos pasos que de verdad se pise: a dos casillas a la derecha
    // puede haber cordillera desde el mapa de nodos.
    const alcance = reachableFrom(s.state.map, heroe.at);
    const destino = [...costesDelAlcance(alcance).entries()]
      .filter(([, c]) => c > 0 && c <= heroe.movePoints)
      .map(([k]) => pointFromKey(k))
      .find((p) => Math.max(Math.abs(p.x - heroe.at.x), Math.abs(p.y - heroe.at.y)) === 2)!;
    s.moveHeroTo(heroe.id, destino);
    expect(heroe.at).toEqual(destino);
    expect(s.visibles()).not.toBe(antes);
  });
});

describe('sesión del cliente: la versión y lo que se guarda entre fotogramas', () => {
  it('la versión sube con una acción y con la selección, y no con la barra de estado', () => {
    const s = new Session(7);
    const v0 = s.version;
    s.status = 'la barra se reescribe a cada paso del ratón';
    expect(s.version).toBe(v0);
    s.selectedHeroId = null;
    expect(s.version).toBeGreaterThan(v0);
    const v1 = s.version;
    s.revealAll = true;
    expect(s.version).toBeGreaterThan(v1);
    const v2 = s.version;
    const heroe = heroesOf(s.state, 0)[0]!;
    // Una vecina que se pise, buscada y no supuesta: con el mapa de 32 la de
    // la derecha del inicio de la semilla 7 es montaña, y un paso rechazado no
    // cambia nada que versionar.
    const vecina = [-1, 0, 1]
      .flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: heroe.at.x + dx, y: heroe.at.y + dy })))
      .find(
        (p) =>
          (p.x !== heroe.at.x || p.y !== heroe.at.y) &&
          isWalkable(s.state.map.terrain[p.y * s.state.map.width + p.x]!),
      )!;
    s.moveHeroTo(heroe.id, vecina);
    expect(heroe.at).toEqual(vecina);
    expect(s.version).toBeGreaterThan(v2);
  });

  it('las acciones de batalla se calculan una vez por jugada, y los hexes salen de ellas', () => {
    const s = new Session(7);
    const mio = heroesOf(s.state, 0)[0]!;
    const suyo = heroesOf(s.state, 1)[0]!;
    // La persona ataca: su héroe entra en la casilla del rival.
    mio.at = pegadoA(s.state, suyo.at);
    mio.movePoints = 100000;
    applyAdventureAction(s.state, { type: 'move_hero', hero: mio.id, to: suyo.at }, s.ctx, 0);
    if (s.state.pendingBattle === null) throw new Error('no hubo batalla');
    s.advanceEnemyTurns();
    if (s.turnoPropio === null) throw new Error('a la persona no le toca');

    const acciones = s.battleLegalActions();
    expect(s.battleLegalActions()).toBe(acciones); // el mismo objeto: no se recalcula
    // Los hexes a los que ir son los `move` de esa misma lista, en su orden.
    expect(s.battleMovable()).toEqual(acciones.flatMap((a) => (a.type === 'move' ? [a.to] : [])));

    const v = s.version;
    s.playBattleAction({ type: 'defend' });
    expect(s.version).toBeGreaterThan(v);
    expect(s.battleLegalActions()).not.toBe(acciones);
  });
});

describe('el fin de partida cuenta la causa que selló el núcleo (I1 de la 2a)', () => {
  it('al perder la base: «has perdido tu base», con el héroe vivo en el mapa', async () => {
    const s = new Session(5);
    anteLaBase(s.state, 1, 0);
    await s.endTurn();
    expect(s.desenlace).toBe('perdida');
    expect(heroesOf(s.state, 0)).toHaveLength(1);
    expect(s.causaDelFinal).toBe('lost_base');
    expect(s.status).toBe('Derrota: has perdido tu base.');
    const lateral = marcadoDe(renderSide(s));
    expect(lateral).toContain('Has perdido tu base');
    expect(lateral).not.toContain('castillos ni héroes');
  });

  it('al tomar la base rival: «has tomado la base rival»', () => {
    const s = new Session(5);
    const { base, atacante } = anteLaBase(s.state, 0, 1);
    s.moveHeroTo(atacante.id, base.at);
    expect(s.desenlace).toBe('ganada');
    expect(heroesOf(s.state, 1)).toHaveLength(1);
    expect(s.causaDelFinal).toBe('lost_base');
    expect(s.status).toBe('¡Victoria! Has tomado la base rival.');
    // Y en el mapa, no en el castillo recién tomado: abrirlo tapaba el final.
    expect(s.scene).toBe('adventure');
    expect(marcadoDe(renderSide(s))).toContain('Has tomado la base rival');
  });

  it('con la partida terminada, un clic no tapa el desenlace de la barra (#162)', () => {
    const s = new Session(5);
    const { base, atacante } = anteLaBase(s.state, 0, 1);
    s.moveHeroTo(atacante.id, base.at);
    const fin = '¡Victoria! Has tomado la base rival.';
    expect(s.status).toBe(fin);
    // El clic en el mapa: `clickTile` → `bloqueoDeTurno` escribía «la partida
    // ha terminado» encima. Y en una casilla con héroe propio, «… seleccionado».
    s.clickTile({ x: 0, y: 0 });
    expect(s.status).toBe(fin);
    s.clickTile(heroesOf(s.state, 0)[0]!.at);
    expect(s.status).toBe(fin);
    // Lo del castillo pasa por `run`, con la misma guarda de turno.
    s.hireHero();
    expect(s.status).toBe(fin);
    // La regla es de la lectura: ningún escritor la salta.
    s.status = 'Cualquier otra cosa.';
    expect(s.status).toBe(fin);
  });

  it('la batalla que cierra la partida deja en la barra el desenlace con su causa (#162)', () => {
    // La 5 otra vez desde #195 (la 6 desde #188, cuando en la 5 se perdía; con
    // las minas por región, en la 6 se pierde y en la 5 se gana).
    const s = new Session(5);
    const { base, atacante } = anteLaBase(s.state, 0, 1);
    // El dueño dentro de su base la defiende solo con su tropa: sin tropa, solo
    // él contra toda la del atacante, para que la batalla se gane. Con un
    // esqueleto a su lado se ganaba hasta #79: desde que la IA elige a quién ir
    // por el daño que de verdad hace, el esqueleto va a por los arqueros y no
    // a por los campesinos, y la defensa aguanta.
    const defensor = heroesOf(s.state, 1)[0]!;
    defensor.at = { ...base.at };
    defensor.army = [];
    s.moveHeroTo(atacante.id, base.at);
    expect(s.scene).toBe('battle');
    // «Resolver sola» la juega y la cierra (`afterBattle`, lo mismo que «Continuar»).
    s.autoResolveBattle();
    expect(s.scene).toBe('adventure');
    expect(s.desenlace).toBe('ganada');
    // Antes, un «¡Victoria!» a secas, sin la causa que sí dice el mapa.
    expect(s.status).toBe('¡Victoria! Has tomado la base rival.');
  });

  it('una partida con ganador y sin player_defeated en la crónica se dice rota', () => {
    const s = new Session(5);
    s.state.finished = { winner: 1 };
    expect(() => s.causaDelFinal).toThrow(
      'la partida la ganó el jugador 1 y la crónica no dice quién quedó eliminado ni por qué',
    );
  });
});

describe('sin camino, la barra dice qué lo cierra (M2 de la 2a)', () => {
  it('la frase la escribe el núcleo: la ciudad guarnecida que guarda el único paso', () => {
    const s = new Session(1);
    s.state = newGame({ seed: 1, plan: planDeNodos() });
    const hero = heroesOf(s.state, 0)[0]!;
    hero.at = { x: 14, y: 4 };
    s.moveHeroTo(hero.id, { x: 19, y: 4 });
    expect(s.status).toBe(
      'No hay camino hasta (19,4): lo cierra la ciudad Torreblanca, con guarnición, en (17,4).',
    );
    expect(hero.at).toEqual({ x: 14, y: 4 });
  });
});

describe('el hueco que llega del marcado pasa por la sesión', () => {
  it('uno que no es un hueco sale en la barra con los que valen, y nada cambia', () => {
    const session = new Session(12);
    const aldo = session.myHeroes()[0]!;
    const antes = { ...aldo.equipo };
    session.unequip(aldo.id, 'casco');
    expect(session.status).toBe(
      'no hay ningún hueco "casco": son arma, distancia, lanza, armadura, escudo',
    );
    expect(aldo.equipo).toEqual(antes);
    // Y el vacío, por su nombre: «Escudo», no la clave.
    session.unequip(aldo.id, 'escudo');
    expect(session.status).toBe(`no se puede desequipar: ${aldo.name} no lleva nada en Escudo`);
  });
});

describe('la pieza elegida es de la mochila de un héroe (M1)', () => {
  it('se suelta al cambiar de héroe y al dejar de estar en su mochila', () => {
    const session = new Session(12);
    const aldo = session.myHeroes()[0]!;
    session.selectedHeroId = aldo.id;
    session.unequip(aldo.id, 'arma');
    const espada = aldo.mochila[0]!;
    session.selectItem(espada);
    expect(session.selectedItem).toBe(espada);

    // Otro héroe delante: su panel le ofrecía «Ponérsela» con la mochila vacía.
    session.selectedHeroId = 'otro';
    expect(session.selectedItem).toBeNull();
    session.selectedHeroId = aldo.id;
    expect(session.selectedItem).toBeNull();

    // Y si sale de la mochila por otro camino que el clic de equipar.
    session.selectItem(espada);
    aldo.mochila = [];
    expect(session.selectedItem).toBeNull();
  });
});

describe('los asaltantes que se ven y la marcha que se para (#130)', () => {
  it('la sesión ve los grupos con la regla del núcleo, y la barra dice por qué se para el héroe', () => {
    let probadas = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = new Session(seed);
      expect(s.asaltantesALaVista().map((r) => r.id)).toEqual(
        asaltantesALaVista(s.state, visibleNow(s.state, s.viewer)).map((r) => r.id),
      );
      const hero = s.selectedHero!;
      const destino = primeraMarchaQueSePara(s.state, hero);
      if (destino === null) continue;
      const antes = s.asaltantesALaVista().length;
      s.moveHeroTo(hero.id, destino);
      probadas++;
      expect(s.state.log.at(-1)?.kind).toBe('march_halted');
      expect(s.status).toMatch(new RegExp(`^${hero.name} se detiene: ve \\d+ asaltantes`));
      // La caché de la sesión no se queda con los de antes de andar.
      expect(s.asaltantesALaVista().length).toBeGreaterThan(antes);
      break;
    }
    expect(probadas).toBe(1);
  });
});
