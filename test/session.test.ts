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
import { renderEleccion } from '../src/client/rueda/rueda.js';
import { AYUDA_DEL_MAPA, Session } from '../src/client/session.js';
import { renderActions, renderSide } from '../src/client/views/panels.js';
import { poderBlocker, terminarElDespliegue } from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import { unidadesDelJuego } from '../src/core/catalogo.js';
import { combateCon } from '../src/core/combate.js';
import { armyLeadership, GARRISON_LEADERSHIP } from '../src/core/hero/troop.js';
import { Casillas } from '../src/core/map/casillas.js';
import { pointFromKey, reachableFrom } from '../src/core/map/map.js';
import { puertasDeLaCiudad } from '../src/core/map/recinto.js';
import { applyAdventureAction, HERO_SCOUT_RADIUS, heroesOf } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { dwellings } from '../src/core/town/town.js';
import type { Hex, UnitInfo } from '../src/core/types.js';
import { sesionAntesDelMonstruo, sesionContraMonstruo } from './batalla-de-cliente.js';
import {
  anteLaBase,
  costesDelAlcance,
  ejercito,
  fueraDeSuBase,
  guarnecer,
  guarnicionDeLaCiudad,
  hastaQue,
  pegadoA,
  planDeNodos,
  primeraSemillaCon,
  unoDeLaRueda,
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

    const frase = `todavía no es tu turno: ahora juega el jugador 1 (${s.state.players.find((p) => p.id === 1)!.faction})`;
    expect(s.status).toBe(frase);
    expect(s.activeTown!.buildings.length).toBe(edificios);

    // Y `clickTile` enseña la misma, en vez de su propio «Espera tu turno.».
    s.clickTile({ x: 0, y: 0 });
    expect(s.status).toBe(frase);
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
    // Nace en el despliegue de la persona (02-11-2026): se acepta tal cual, sin
    // que la IA mueva, que es lo que estos tests miran después.
    terminarElDespliegue(s.state.pendingBattle.battle, s.ctx.rng);
    return { s, mio };
  }

  /**
   * Una de esas batallas en la que abre el rival: quién abre lo decide la
   * iniciativa de las dos tropas (velocidad y puesto), que cambia con la facción
   * que sortea cada semilla.
   */
  const elRivalAbre = () =>
    primeraSemillaCon('una defensa en la que abre el rival', (n) => {
      const r = meAtacan(n);
      const b = r.s.battle!;
      return b.stacks.find((x) => x.id === b.turno?.stack)?.side === 'attacker' ? r : undefined;
    }).caso;

  it('defendiendo, el bando sale del dueño y no de suponerse atacante', () => {
    const { s, mio } = meAtacan(7);

    expect(s.miBando).toBe('defender');
    // El libro de hechizos que se pinta es el MÍO. Suponiendo `attacker` era el
    // del rival: se le habría ofrecido a la persona lanzar con el maná del otro.
    expect(s.battleHero?.name).toBe(mio.name);
  });

  it('con el rival activo no se le puede mover NADA a la persona', () => {
    const { s } = elRivalAbre();
    const activo = s.battle!.stacks.find((x) => x.id === s.battle!.turno?.stack)!;
    expect(activo.side).toBe('attacker');

    // Aquí mordía de verdad: dando por hecho que la persona es el atacante, el
    // tablero pintaba en verde los hexes del stack del RIVAL y dejaba moverlo.
    expect(s.battleMovable()).toEqual([]);
    expect(s.spellOptions()).toEqual([]);
  });

  it('el turno del rival lo juega la IA hasta que le toca a la persona', () => {
    const { s } = elRivalAbre();

    s.advanceEnemyTurns();

    const battle = s.battle!;
    if (battle.finished === null) {
      const activo = battle.stacks.find((x) => x.id === battle.turno?.stack)!;
      if (s.ruedaPendiente !== null) {
        // Golpeó a una unidad de la persona: se para ahí, plantado, y le toca
        // a ella responder (F5).
        expect(s.ruedaPendiente.fase).toBe('respuesta');
        expect(activo.side).toBe('attacker');
      } else {
        // Lo contrario de lo que hacía: se paraba al ver un atacante —creyéndolo
        // suyo— y devolvía el mando con el turno del rival a medias.
        expect(activo.side).toBe('defender');
        // Desde el catálogo retocado (02-11-2026) quien abre por la persona en la
        // primera semilla es un arquero elfo, y un tirador empieza su turno «A
        // distancia», donde no se marca andar (el selector de arma, 26-10-2026): la
        // lista legal es suya, y en «Cuerpo a cuerpo» anda.
        expect(s.battleLegalActions().some((a) => a.type !== 'end_turn')).toBe(true);
        if (s.arma.modo === 'distancia') s.arma.elegir('cuerpo');
        expect(s.battleMovable().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('sesión del cliente: reclutar lo que cabe y ver la ruta entera', () => {
  it('«todo» pide lo que cabe: con el liderazgo casi lleno, el máximo es menor que lo disponible', () => {
    const s = new Session(7);
    const town = s.myTowns()[0]!;
    // La base nace llena (`guarnicionBase`): aquí se mide «todo» con sitio. Y el
    // héroe nace dentro (19-10-2026), donde reclutaría en su tropa: fuera.
    guarnecer(s.state, town, []);
    fueraDeSuBase(s.state, 0);
    s.openTown(town.id);
    // Lo primero que cría la morada que la base trae hecha.
    const recluta = dwellings(town)[0]!.creature;
    town.available[recluta] = 12;

    const plan = s.recruitPlan(recluta)!;
    // Doce no caben: una guarnición lleva 20 de liderazgo y siete individuos.
    expect(plan.disponibles).toBe(12);
    expect(plan.maximo).toBeLessThan(plan.disponibles);

    // Uno más del máximo: el núcleo lo rechaza diciendo que no cabe.
    s.recruit(recluta, plan.maximo + 1);
    expect(s.status).toMatch(/no cabe/);
    expect(guarnicionDeLaCiudad(s.state, town).length).toBe(0);

    // Y «todo» recluta exactamente el máximo, sin mensaje de error.
    s.recruitAll(recluta);
    expect(s.status).toBe('');
    expect(guarnicionDeLaCiudad(s.state, town).length).toBe(plan.maximo);
    expect(s.recruitPlan(recluta)!.maximo).toBe(0);

    // Con el cupo lleno, «todo» no calla: el motivo lo escribe el núcleo.
    s.recruitAll(recluta);
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

  it('la guarnición va por el mismo camino, con el tope de guarnición', () => {
    const s = new Session(7);
    const pueblo = s.myTowns()[0]!;
    expect(s.liderazgo({ guarnicion: pueblo.id })).toEqual({
      ocupado: armyLeadership(guarnicionDeLaCiudad(s.state, pueblo)),
      tope: GARRISON_LEADERSHIP,
    });
  });

  it('lo que ve el héroe ahora es su cuadrado sobre lo explorado, y lo visible se rehace al moverse', () => {
    // Decía «lo visible es un subconjunto de lo explorado» y comprobaba que todo
    // el cuadrado del héroe estuviera explorado. Desde la niebla por regiones
    // (02-11-2026) el radio ya no explora: lo explorado son regiones enteras y lo
    // que se mira es el radio sobre ellas, así que de su cuadrado se ve justo lo
    // explorado, y nada fuera de lo explorado se ve.
    const s = new Session(7);
    const fog = s.state.players[0]!.fog;
    const antes = s.visibles();
    const heroe0 = s.selectedHero!;
    const delHeroe = Casillas.vacias(s.state.map);
    delHeroe.marcarCuadrado(heroe0.at, HERO_SCOUT_RADIUS);
    expect(delHeroe.size).toBeGreaterThan(0);
    for (const k of delHeroe) expect(antes.has(k), `(${k.x},${k.y})`).toBe(fog.has(k));
    for (const k of antes) expect(fog.has(k)).toBe(true);
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
    // Una vecina a la que se pase de un paso, buscada y no supuesta: con el mapa
    // de 32 la de la derecha del inicio de la semilla 7 era montaña, y un paso
    // rechazado no cambia nada que versionar. El héroe nace en su base, en el
    // medio de su recinto, y de ahí solo se pasa a una puerta (`recinto.ts`):
    // con la primera vecina que se pisa, desde las ciudades en su región
    // (05-11-2026) la s7 daba la muralla y el héroe acababa en la puerta de
    // debajo.
    const vecina = puertasDeLaCiudad(s.state.map, heroe.at)[0]?.casilla;
    if (vecina === undefined)
      throw new Error('el héroe de la s7 no nace en una ciudad con puertas');
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
    // «Listo» al despliegue: la IA mueve si abre ella (`advanceEnemyTurns`).
    s.despliegue.listo();
    if (s.turnoPropio === null) throw new Error('a la persona no le toca');

    const acciones = s.battleLegalActions();
    expect(s.battleLegalActions()).toBe(acciones); // el mismo objeto: no se recalcula
    // Los hexes a los que ir son los `move` de esa misma lista, en su orden.
    expect(s.battleMovable()).toEqual(acciones.flatMap((a) => (a.type === 'move' ? [a.to] : [])));

    const v = s.version;
    s.playBattleAction({ type: 'end_turn' });
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
      'no hay ningún hueco "casco": son arma, segunda, distancia, armadura, escudo, montura',
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
    // La armadura: el arma no se quita, que sin ella no se combate (19-10-2026).
    session.unequip(aldo.id, 'armadura');
    const gambeson = aldo.mochila[0]!;
    session.selectItem(gambeson);
    expect(session.selectedItem).toBe(gambeson);

    // Otro héroe delante: su panel le ofrecía «Ponérsela» con la mochila vacía.
    session.selectedHeroId = 'otro';
    expect(session.selectedItem).toBeNull();
    session.selectedHeroId = aldo.id;
    expect(session.selectedItem).toBeNull();

    // Y si sale de la mochila por otro camino que el clic de equipar.
    session.selectItem(gambeson);
    aldo.mochila = [];
    expect(session.selectedItem).toBeNull();
  });
});

describe('los poderes de la tropa en la batalla del mapa (F6)', () => {
  it('una unidad con poder de la persona lo usa: el botón, el aliado que se elige y la jugada', () => {
    // Hasta F6 el panel de la partida decía «su tropa no tiene poderes» aunque la
    // unidad los trajera. Ahora son los botones de la arena (`botonesDePoder`) y el
    // gesto, el mismo (`PoderesDeLaActiva`). La unidad, la primera del catálogo con
    // un poder; el poder, el suyo.
    const conPoder = unidadesDelJuego().find((u) => (u.poderes?.length ?? 0) > 0);
    if (conPoder === undefined) throw new Error('ninguna unidad del catálogo tiene un poder');
    const poder = conPoder.poderes![0]!;
    const { s, at } = sesionAntesDelMonstruo();
    s.selectedHero!.army = ejercito({ creature: conPoder.id, count: 3 });
    s.clickTile(at);
    s.despliegue.listoTalCual();
    if (s.battle === null) throw new Error('con ese ejército no se abre la batalla');
    // Los suyos, heridos de salida: con más de un aliado sobre el que usarlo, el
    // botón espera el clic.
    for (const x of s.battle.stacks) {
      if (x.side === s.miBando && x.origen.kind !== 'heroe') x.topHp -= 1;
    }
    const conPoderes = () => (s.turnoPropio?.stack.unit.poderes?.length ?? 0) > 0;
    for (let i = 0; i < 40 && !conPoderes(); i++) {
      if (s.ruedaPendiente !== null) s.elegirEnLaRueda(unoDeLaRueda(s.battle));
      else if (s.turnoPropio !== null) s.playBattleAction({ type: 'end_turn' });
      else throw new Error('ni le toca a la persona ni espera la rueda');
    }
    expect(conPoderes()).toBe(true);
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain(`data-action="battle-poder" data-poder="${poder}"`);

    // Con varios aliados posibles, el botón deja el poder esperando el clic.
    const aliados = s.battleLegalActions().filter((a) => a.type === 'power' && a.poder === poder);
    expect(aliados.length).toBeGreaterThan(1);
    const version = s.version;
    s.poderes.usar(poder);
    expect(s.apuntado).toEqual({ kind: 'poder', id: poder });
    expect(s.status).toContain('Elige el aliado');
    expect(s.version).toBeGreaterThan(version);
    expect(marcadoDe(renderSide(s))).toContain(`data-poder="${poder}" class="poder primary"`);
    // Un enemigo no vale, y lo dice el núcleo.
    const enemigo = s.battle.stacks.find((x) => x.side !== s.miBando && x.count > 0)!;
    const motivo = poderBlocker(s.battle, poder, enemigo.id);
    expect(motivo).not.toBeNull();
    // Dicho como frase de la barra: con mayúscula y punto.
    expect(s.rechazoDeLoApuntado(enemigo.id)).toBe(
      `${motivo!.charAt(0).toUpperCase()}${motivo!.slice(1)}.`,
    );
    // Y sobre un aliado se juega: el registro lo cuenta y lo apuntado se suelta.
    const quien = s.turnoPropio!.stack.id;
    s.playBattleAction(aliados[0]!);
    const hecho = s.battle.log.find((e) => e.kind === 'power');
    expect(hecho).toMatchObject({ kind: 'power', stack: quien, poder });
    expect(s.apuntado).toBeNull();
  });
});

describe('la rueda y las defensas de la persona en la partida (F5)', () => {
  /**
   * Juega la batalla con la persona acercando sus unidades al enemigo más cercano
   * (los monstruos guardan su sitio) hasta que `hasta` se cumpla; si no puede
   * acercarse más, cierra el turno, y su respuesta en la rueda, si se la piden, es
   * `unoDeLaRueda` (Normal, si la rueda lo lleva). Lanza si la batalla se acaba antes.
   */
  function jugarHasta(s: Session, hasta: () => boolean): void {
    for (let i = 0; i < 400; i++) {
      if (hasta()) return;
      const b = s.battle;
      if (b === null || b.finished !== null) break;
      if (s.ruedaPendiente !== null) {
        s.elegirEnLaRueda(unoDeLaRueda(b));
        continue;
      }
      const turno = s.turnoPropio;
      if (turno === null) throw new Error('ni le toca a la persona ni espera la rueda');
      const enemigos = b.stacks.filter((x) => x.side !== turno.side && x.count > 0);
      const lejos = (h: Hex) => Math.min(...enemigos.map((x) => hexDistance(h, x.hex)));
      const ahora = lejos(turno.stack.hex);
      const paso = s
        .battleLegalActions()
        .filter((a) => a.type === 'move')
        .sort((x, y) => lejos(x.to) - lejos(y.to))[0];
      s.playBattleAction(
        paso !== undefined && lejos(paso.to) < ahora ? paso : { type: 'end_turn' },
      );
    }
    throw new Error('la batalla no llegó a lo que se esperaba');
  }

  /** Un golpe cuerpo a cuerpo de la persona en la lista legal, si lo hay. */
  const golpeLegal = (s: Session) => s.battleLegalActions().find((a) => a.type === 'attack');

  /**
   * Los botones de la batalla apagados por la rueda, con su motivo (H3 de QA,
   * 19-10-2026): con el diálogo modal encima, «Terminar turno» y «Resolver sola»
   * se veían encendidos y el clic no llegaba.
   */
  const APAGADOS_POR_LA_RUEDA =
    '<fieldset class="contando" disabled title="Elige antes en la rueda del golpe.">';

  it('el golpe de la persona anda hasta su objetivo y deja la rueda en la fase del golpe', () => {
    const s = sesionContraMonstruo();
    jugarHasta(s, () => s.ruedaPendiente === null && golpeLegal(s) !== undefined);
    const golpe = golpeLegal(s)!;
    const cruces = () => s.battle!.log.filter((e) => e.kind === 'cruce').length;
    const antes = cruces();
    const version = s.version;

    s.playBattleAction(golpe);

    // Plantado: anduvo, no golpeó, y la rueda espera a la persona.
    const p = s.ruedaPendiente!;
    expect(p.fase).toBe('golpe');
    expect(p.bando).toBe(s.miBando);
    expect(p.atacante.side).toBe(s.miBando);
    expect(s.battle!.golpeEnCurso).not.toBeNull();
    expect(cruces()).toBe(antes);
    expect(s.version).toBeGreaterThan(version);
    // Con la rueda abierta no se juega otra cosa ni se delega la batalla, y los
    // botones lo dicen apagados: los de la unidad y «Resolver sola».
    const lado = marcadoDe(renderSide(s));
    expect(lado).toContain(APAGADOS_POR_LA_RUEDA);
    expect(lado.indexOf(APAGADOS_POR_LA_RUEDA)).toBeLessThan(lado.indexOf('battle-end-turn'));
    expect(marcadoDe(renderActions(s))).toContain(APAGADOS_POR_LA_RUEDA);
    s.playBattleAction({ type: 'end_turn' });
    expect(s.status).toBe('Elige antes en la rueda del golpe.');
    s.autoResolveBattle();
    expect(s.status).toBe('Elige antes en la rueda del golpe.');
    expect(s.battle).not.toBeNull();

    // Elige: el monstruo responde a ciegas y el golpe se da con lo elegido.
    s.elegirEnLaRueda('fuerte');
    const cruce = s.battle!.log.find((e) => e.kind === 'cruce' && e.stack === p.atacante.id);
    expect(cruce).toMatchObject({ kind: 'cruce', golpe: 'fuerte', target: p.objetivo.id });
    // El suyo ya no está plantado; el de un monstruo que le pegue después, puede.
    expect(s.battle!.golpeEnCurso?.stack).not.toBe(p.atacante.id);
    // Dado el golpe, los botones vuelven, salvo que la rueda ya pida otra respuesta.
    if (s.ruedaPendiente === null) {
      expect(marcadoDe(renderActions(s))).not.toContain(APAGADOS_POR_LA_RUEDA);
    }
  });

  it('con la rueda de 3, el golpe de la persona abre sus tres sectores y se da (QA de la complejidad, vuelta 1)', () => {
    // Antes, la previsión del golpe suponía Normal: la rueda no se abría, la barra
    // decía «"normal" no es un golpe de la rueda de 3» y la unidad se quedaba
    // plantada sin salida (ni Escape, ni «Terminar turno»).
    const s = sesionContraMonstruo({ combate: combateCon(7, 3) });
    jugarHasta(s, () => s.ruedaPendiente === null && golpeLegal(s) !== undefined);
    s.playBattleAction(golpeLegal(s)!);
    expect(s.status).toBe('');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda de 3 no se abre al golpear');
    expect(p.fase).toBe('golpe');
    expect(Object.keys(p.prevision.porTipo ?? {})).toEqual([
      'ofensivoFuerte',
      'rapidoRomper',
      'defensivoFinta',
    ]);
    // Se pinta con sus tres botones y sin Normal.
    const m = marcadoDe(renderEleccion(s.battle!, p, s.miBando, null));
    expect(m.match(/data-golpe="[a-zA-Z]+"/g)).toEqual([
      'data-golpe="ofensivoFuerte"',
      'data-golpe="rapidoRomper"',
      'data-golpe="defensivoFinta"',
    ]);
    s.elegirEnLaRueda('rapidoRomper');
    expect(s.status).toBe('');
    const cruce = s.battle!.log.find((e) => e.kind === 'cruce' && e.stack === p.atacante.id);
    expect(cruce).toMatchObject({ kind: 'cruce', golpe: 'rapidoRomper', target: p.objetivo.id });
    expect(s.battle!.golpeEnCurso?.stack).not.toBe(p.atacante.id);
  });

  it('un tipo que no existe se dice en la barra y la rueda sigue esperando', () => {
    const s = sesionContraMonstruo();
    jugarHasta(s, () => s.ruedaPendiente === null && golpeLegal(s) !== undefined);
    s.playBattleAction(golpeLegal(s)!);
    const p = s.ruedaPendiente;
    s.elegirEnLaRueda('patada');
    expect(s.status).toMatch(/patada/);
    expect(s.ruedaPendiente).toBe(p);
  });

  it('Escape antes de elegir suelta el golpe: se queda donde llegó, sin golpear', () => {
    const s = sesionContraMonstruo();
    jugarHasta(s, () => s.ruedaPendiente === null && golpeLegal(s) !== undefined);
    s.playBattleAction(golpeLegal(s)!);
    const quien = s.ruedaPendiente!.atacante;
    const donde = { ...quien.hex };

    expect(s.cancelarGolpe()).toBe(true);

    expect(s.ruedaPendiente).toBeNull();
    expect(s.battle!.golpeEnCurso).toBeNull();
    expect(s.status).toMatch(/^Golpe cancelado/);
    expect(s.battle!.log.some((e) => e.kind === 'cruce' && e.stack === quien.id)).toBe(false);
    expect(quien.hex).toEqual(donde);
  });

  it('cuando golpean a la persona, elige su respuesta sin ver el golpe; esa no se cancela', () => {
    const s = sesionContraMonstruo();
    jugarHasta(s, () => s.ruedaPendiente?.fase === 'respuesta');
    const p = s.ruedaPendiente!;
    expect(p.bando).toBe(s.miBando);
    expect(p.objetivo.side).toBe(s.miBando);
    expect(p.atacante.side).not.toBe(s.miBando);
    // Lo que se enseña no lleva el golpe que ya eligió la IA: ni la acción ni el tipo.
    // `golpeQueViene` (01-11-2026) dice, por respuesta, lo que quitaría cada golpe posible: no cuál eligió.
    expect(Object.keys(p).sort()).toEqual(['atacante', 'bando', 'fase', 'golpeQueViene', 'objetivo', 'prevision']);
    expect(JSON.stringify(p.prevision)).not.toMatch(/"golpe"/);
    expect(JSON.stringify(p.golpeQueViene)).not.toMatch(/"golpe"/);

    expect(s.cancelarGolpe()).toBe(false);
    expect(s.status).toBe('El golpe ya viene: elige la respuesta en la rueda.');
    // «Resolver sola» tampoco hace nada mientras se responde: apagado (H3).
    expect(marcadoDe(renderActions(s))).toContain(APAGADOS_POR_LA_RUEDA);

    s.elegirEnLaRueda('defensivo');
    const cruce = s.battle!.log.find((e) => e.kind === 'cruce' && e.target === p.objetivo.id);
    expect(cruce).toMatchObject({ kind: 'cruce', respuesta: 'defensivo', stack: p.atacante.id });
  });

  it('una base que se defiende sin héroe no habla de «este héroe» en los hechizos (H2)', async () => {
    // s1: con «Fin de turno» y nada más, el día 3 el imperio ataca la base y la
    // guarnición se defiende sola (lo reprodujo el QA del 19-10-2026). El panel
    // decía «Este héroe no conoce ninguno» de un héroe que no está.
    const s = new Session(1);
    // El héroe nace en la base (19-10-2026): fuera, que aquí se defiende sola.
    fueraDeSuBase(s.state, 0);
    // El ataque llega con su aviso en el mapa (arreglo 3 del 06-11-2026): se lee y se defiende.
    let aviso: Session['avisoDelAtaque'] = null;
    s.alCambiarSinGesto = () => {
      aviso = s.avisoDelAtaque;
      s.defenderElAtaque();
    };
    // Una función y no `s.scene` a pelo: el compilador no sabe que `endTurn` la cambia.
    const enBatalla = () => s.scene === 'battle';
    for (let dia = 0; dia < 5 && !enBatalla(); dia++) {
      const turno = s.endTurn();
      await hastaQue(() => enBatalla() || s.isPlayersTurn);
      if (!enBatalla()) await turno;
    }
    expect(s.scene).toBe('battle');
    // Sin héroe, atacan a la guarnición de la base, y la cámara miraba allí.
    const base = s.myTowns()[0]!;
    const dicho = aviso as Session['avisoDelAtaque'];
    expect(dicho?.titulo).toBe(`¡Te atacan en ${base.name}!`);
    expect(dicho?.frase).toMatch(new RegExp(` ataca a la guarnición de ${base.name}\\.$`));
    expect(dicho?.at).toEqual(base.at);
    const mio = s.miBando!;
    expect(s.battle!.heroes[mio]).toBeNull();
    // La guarnición también despliega a mano (es de la persona).
    expect(s.despliegue.enCurso?.side).toBe(mio);
    s.despliegue.listo();
    for (let i = 0; i < 40 && s.turnoPropio === null; i++) s.elegirEnLaRueda('normal');
    expect(s.turnoPropio).not.toBeNull();
    const panel = marcadoDe(renderSide(s));
    expect(panel).not.toContain('Este héroe');
    expect(panel).toContain('Sin héroe en esta batalla: nadie lanza hechizos');
  });
});

describe('la partida empieza en la base (19-10-2026)', () => {
  it('abrirSuBase abre la base con el héroe dentro; al salir, el mapa, y el héroe anda', () => {
    const s = new Session(5, 'orkos');
    expect(s.jugador.faction).toBe('orkos');
    s.abrirSuBase();
    expect(s.scene).toBe('town');
    expect(s.activeTown?.id).toBe(s.jugador.base);
    const heroe = s.heroeEnLaBase();
    expect(heroe?.faction).toBe('orkos');
    expect(heroe?.at).toEqual(s.activeTown?.at);
    expect(s.vistaDeLaBase()!.caminante.id).toBe(heroe!.id);
    // Pasea con la hoja de su tipo, no con el Y Bot (vuelta 2).
    expect(s.vistaDeLaBase()!.caminante.cuerpo).toBe('heroe-orko-kaudillo');

    s.closeTown();
    expect(s.scene).toBe('adventure');
    // La primera salida dice cómo se anda; las demás, nada.
    expect(s.status).toBe(AYUDA_DEL_MAPA);
    s.openTown(s.jugador.base!);
    s.closeTown();
    expect(s.status).toBe('');
    const fuera = pegadoA(s.state, heroe!.at);
    s.clickTile(fuera);
    expect(heroe!.at).toEqual(fuera);
  });

  it('sin facción, la de la semilla: la misma partida que con la que la semilla saca', () => {
    const sola = new Session(9);
    const conLaSuya = new Session(9, sola.jugador.faction);
    expect(JSON.stringify(conLaSuya.state)).toBe(JSON.stringify(sola.state));
  });
});

describe('el héroe elegido en el menú (vuelta 2, 19-10-2026)', () => {
  it('la sesión abre con el tipo pedido, y la base lo pinta con su hoja', () => {
    const s = new Session(5, 'no-muertos', 'vampiro');
    const heroe = s.myHeroes()[0]!;
    expect(heroe.tipo).toBe('vampiro');
    s.abrirSuBase();
    expect(s.vistaDeLaBase()!.caminante).toMatchObject({ id: heroe.id, cuerpo: 'heroe-vampiro' });
  });

  it('un tipo de otra facción no abre partida, y lo dice', () => {
    expect(() => new Session(5, 'no-muertos', 'cantora')).toThrow(
      '"cantora" no es un tipo de héroe de no-muertos: valen nigromante, vampiro, lich',
    );
  });
});

describe('«Solo la rueda del héroe» (complejidad del combate, 22-10-2026)', () => {
  /**
   * Juega la batalla de la persona yendo a por el enemigo más cercano y golpeando
   * en cuanto puede; cada vez que la rueda se abre, `alAbrirse` la mira antes de
   * elegir `unoDeLaRueda` (Normal, si la rueda lo lleva).
   */
  function jugarConRueda(
    s: Session,
    alAbrirse: (p: NonNullable<Session['ruedaPendiente']>) => void,
  ): void {
    for (let i = 0; i < 600; i++) {
      const b = s.battle;
      if (b === null || b.finished !== null) return;
      const p = s.ruedaPendiente;
      if (p !== null) {
        alAbrirse(p);
        s.elegirEnLaRueda(unoDeLaRueda(b));
        // Lo elegido vale: la rueda no se queda esperando lo mismo.
        expect(s.ruedaPendiente, s.status).not.toBe(p);
        continue;
      }
      const turno = s.turnoPropio;
      if (turno === null) throw new Error('ni le toca a la persona ni espera la rueda');
      const legales = s.battleLegalActions();
      const golpe = legales.find((a) => a.type === 'attack');
      if (golpe !== undefined) {
        s.playBattleAction(golpe);
        continue;
      }
      const enemigos = b.stacks.filter((x) => x.side !== turno.side && x.count > 0);
      const lejos = (h: Hex) => Math.min(...enemigos.map((x) => hexDistance(h, x.hex)));
      const paso = legales
        .filter((a) => a.type === 'move')
        .sort((x, y) => lejos(x.to) - lejos(y.to))[0];
      s.playBattleAction(
        paso !== undefined && lejos(paso.to) < lejos(turno.stack.hex) ? paso : { type: 'end_turn' },
      );
    }
    throw new Error('la batalla no acaba');
  }

  /** De la persona en un cruce: quien pega si golpea ella, el golpeado si responde. */
  const suyo = (p: NonNullable<Session['ruedaPendiente']>) =>
    p.fase === 'golpe' ? p.atacante : p.objetivo;

  it('activa, la rueda se abre solo para el héroe; la tropa de la persona cruza sin ella, como el rival', () => {
    const s = sesionContraMonstruo();
    s.soloRuedaDelHeroe = true;
    const mio = s.miBando;
    let delHeroe = 0;
    jugarConRueda(s, (p) => {
      expect(suyo(p).origen.kind, `${p.fase} de ${suyo(p).id}`).toBe('heroe');
      delHeroe++;
    });
    const log = s.battle!.log;
    // La tropa de la persona golpeó o respondió en la rueda, y lo eligió la IA.
    const deSuTropa = log.filter(
      (e) =>
        e.kind === 'cruce' &&
        [e.stack, e.target].some((id) => {
          const x = s.battle!.stacks.find((st) => st.id === id);
          return x?.side === mio && x.origen.kind !== 'heroe';
        }),
    );
    expect(deSuTropa.length).toBeGreaterThan(0);
    // Y el héroe, por su lado, sí: o golpeó o le golpearon con la rueda abierta.
    const cruzoElHeroe = log.some(
      (e) => e.kind === 'cruce' && [e.stack, e.target].includes(`${mio}-heroe`),
    );
    expect(delHeroe > 0).toBe(cruzoElHeroe);
  });

  it('con la rueda de 3, el golpe del héroe abre la rueda y se da; la tropa cruza sin ella (QA, vuelta 1)', () => {
    // Justo el golpe del héroe era el que se atascaba con la rueda de 3.
    const s = sesionContraMonstruo({ combate: combateCon(7, 3), soloRuedaDelHeroe: true });
    const mio = s.miBando;
    // Monstruos que aguanten: con la fuerza y la agilidad (25-10-2026) el héroe los
    // tumbaba antes de que su tropa llegara a cruzarse con ninguno.
    for (const st of s.battle!.stacks) {
      if (st.side === mio) continue;
      const w = st as { unit: UnitInfo; topHp: number };
      w.unit = { ...w.unit, hp: w.unit.hp * 10 };
      w.topHp = w.unit.hp;
    }
    const fases: string[] = [];
    jugarConRueda(s, (p) => {
      expect(suyo(p).origen.kind, `${p.fase} de ${suyo(p).id}`).toBe('heroe');
      // Los tres sectores; al responder sin contraataque (ya devolvió uno esta
      // ronda), ninguno da daño y la previsión no trae ninguno.
      expect([0, 3]).toContain(Object.keys(p.prevision.porTipo ?? {}).length);
      if (p.fase === 'golpe') expect(Object.keys(p.prevision.porTipo ?? {})).toHaveLength(3);
      fases.push(p.fase);
    });
    expect(fases).toContain('golpe');
    const log = s.battle!.log;
    // El héroe golpeó con la rueda de 3, y su tropa cruzó con lo que eligió la IA.
    expect(
      log.some(
        (e) => e.kind === 'cruce' && e.stack === `${mio}-heroe` && e.golpe === 'ofensivoFuerte',
      ),
    ).toBe(true);
    const deSuTropa = log.filter(
      (e) =>
        e.kind === 'cruce' &&
        [e.stack, e.target].some((id) => {
          const x = s.battle!.stacks.find((st) => st.id === id);
          return x?.side === mio && x.origen.kind !== 'heroe';
        }),
    );
    expect(deSuTropa.length).toBeGreaterThan(0);
  });

  it('se cambia a media batalla y vale desde el siguiente golpe', () => {
    const s = sesionContraMonstruo();
    expect(s.soloRuedaDelHeroe).toBe(false);
    let deLaTropa = 0;
    let trasCambiar = 0;
    jugarConRueda(s, (p) => {
      if (s.soloRuedaDelHeroe) {
        expect(suyo(p).origen.kind).toBe('heroe');
        trasCambiar++;
        return;
      }
      // Apagada, como siempre: también la tropa. A la primera, se enciende.
      if (suyo(p).origen.kind !== 'heroe') {
        deLaTropa++;
        s.alternarSoloRuedaDelHeroe();
        expect(s.status).toBe(
          'Solo eliges en la rueda con tu héroe: la de tu tropa la elige la IA.',
        );
      }
    });
    expect(deLaTropa).toBe(1);
    expect(trasCambiar).toBeGreaterThanOrEqual(0);
    // Y se apaga igual.
    s.alternarSoloRuedaDelHeroe();
    expect(s.soloRuedaDelHeroe).toBe(false);
    expect(marcadoDe(renderActions(s))).not.toContain('data-action="solo-rueda-del-heroe" checked');
  });

  it('una defensa sin su héroe (la guarnición sola) no le abre ninguna rueda', async () => {
    const s = new Session(1, undefined, undefined, undefined, true);
    fueraDeSuBase(s.state, 0);
    s.alCambiarSinGesto = () => s.defenderElAtaque();
    const enBatalla = () => s.scene === 'battle';
    for (let dia = 0; dia < 5 && !enBatalla(); dia++) {
      const turno = s.endTurn();
      for (let i = 0; i < 100 && !enBatalla() && !s.isPlayersTurn; i++) {
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!enBatalla()) await turno;
    }
    expect(s.scene).toBe('battle');
    expect(s.battle!.heroes[s.miBando!]).toBeNull();
    s.despliegue.listo();
    const cruces = () => s.battle!.log.filter((e) => e.kind === 'cruce').length;
    for (let i = 0; i < 400 && s.battle!.finished === null; i++) {
      expect(s.ruedaPendiente).toBeNull();
      s.playBattleAction({ type: 'end_turn' });
    }
    expect(s.battle!.finished).not.toBeNull();
    // Le golpearon, y respondió la IA por ella.
    expect(cruces()).toBeGreaterThan(0);
  });
});
