/**
 * La puerta del cliente al núcleo, ahora que el turno del rival es asíncrono.
 *
 * `Session` no toca el DOM —pinta `main.ts`, decide esto—, así que se prueba
 * igual que el resto. Lo que se mira aquí es lo que abrió el `endTurn()`
 * asíncrono: la reentrada. Antes no había un solo instante en el que pulsar dos
 * veces significara algo; ahora sí, y hay que cerrarlo.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../src/client/session.js';
import { applyAdventureAction, heroesOf } from '../src/core/state/game.js';

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
    s.openTown(s.myTowns()[0]!.id);
    const edificios = s.activeTown!.buildings.length;

    const enCurso = s.endTurn();
    s.build('town_hall');
    s.hireHero();

    // Con la IA local el turno del rival se juega ENTERO de forma síncrona
    // dentro de `endTurn()`, así que aquí `state.current` ya ha vuelto a ser el
    // nuestro y lo único que sabe que hay algo a medias es la bandera. Esa
    // frase la pone el cliente porque el núcleo no puede saberla.
    expect(s.status).toBe('Espera: el turno del rival aún se está resolviendo.');
    expect(s.activeTown!.buildings.length).toBe(edificios);

    await enCurso;
    expect(s.isPlayersTurn).toBe(true);
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
    const activo = s.battle!.stacks.find((x) => x.id === s.battle!.activeId)!;
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
      const activo = battle.stacks.find((x) => x.id === battle.activeId)!;
      // Lo contrario de lo que hacía: se paraba al ver un atacante —creyéndolo
      // suyo— y devolvía el mando con el turno del rival a medias.
      expect(activo.side).toBe('defender');
      expect(s.battleMovable().length).toBeGreaterThan(0);
    }
  });
});
