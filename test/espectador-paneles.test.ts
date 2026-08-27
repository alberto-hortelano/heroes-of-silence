/**
 * El panel del espectador, probado sin navegador.
 *
 * Existe por B-1. El panel vivía dentro de `espectador/main.ts`, que toca
 * `document` nada más importarse, así que **no se podía probar**: `vitest` corre
 * en `node`. Un `?? -1` escrito «por si acaso» convertía el `null` de un bando
 * neutral —que `playerColor` sabe pintar gris desde su primera línea— en un −1
 * que nadie trata, `PLAYER_COLORS[-1]` daba `undefined`, y la página se paraba
 * entera en la primera batalla contra un monstruo. Tres líneas de test lo
 * cazaban; no había dónde escribirlas.
 *
 * Ahora el panel es puro y esto es lo que lo guarda.
 */
import { describe, expect, it } from 'vitest';
import { batalla, panelDelEspectador } from '../src/client/espectador/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import type { BattleState } from '../src/core/battle/types.js';
import type { Hero } from '../src/core/hero/hero.js';
import { reachableFrom } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { applyAdventureAction, type GameState } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { construirVista, type SpectatorView } from '../src/server/vista-espectador.js';
import { forzarBatalla, monstruoVivo } from './helpers.js';

/** Una partida con una batalla contra un MONSTRUO: el defensor no es de nadie. */
function contraUnNeutral(semilla: number): { state: GameState; vista: SpectatorView } {
  const state = newGame({ seed: semilla });
  const ctx = { rng: createRng(semilla) };
  const heroe = state.heroes.find((h) => h.owner === state.current) as Hero;
  forzarBatalla(state, ctx, heroe);
  return { state, vista: construirVista(state, []) };
}

/** Y una contra otro HÉROE, donde los dos bandos tienen dueño. */
function contraUnHeroe(semilla: number): SpectatorView {
  const state = newGame({ seed: semilla });
  const mio = state.heroes.find((h) => h.owner === 1) as Hero;
  const suyo = state.heroes.find((h) => h.owner === 0) as Hero;
  const [clave] = [...reachableFrom(state.map, mio.at).costs.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => a[1] - b[1])[0] as [string, number];
  const [x, y] = clave.split(',').map(Number);
  suyo.at = { x: x as number, y: y as number };
  suyo.movePoints = 20000;
  applyAdventureAction(
    state,
    { type: 'move_hero', hero: suyo.id, to: mio.at },
    { rng: createRng(semilla) },
    0,
  );
  return construirVista(state, []);
}

describe('el panel de batalla del espectador', () => {
  it('pinta una batalla contra un monstruo NEUTRAL sin lanzar — B-1', () => {
    // El bando de un monstruo es `null` y así tiene que quedarse: la defensa que
    // lo convertía en −1 paraba la página. Dos semillas, que son las dos que
    // reprodujo QA.
    for (const semilla of [1, 2]) {
      const { state, vista } = contraUnNeutral(semilla);
      expect(vista.battle?.dueños).toEqual({ attacker: state.current, defender: null });

      const salida = marcadoDe(batalla(vista));
      expect(salida).toContain('neutral');
      // El gris de lo neutral, que es lo que `playerColor(null)` devuelve.
      expect(salida).toContain('#7d7364');
      expect(salida).not.toContain('undefined');
    }
  });

  it('y el panel entero tampoco lanza con esa misma batalla', () => {
    // El fallo no estaba en `batalla()` sino en lo que colgaba de ella, y lo que
    // se rompía era el panel entero — y con él el bucle de dibujo.
    const { vista } = contraUnNeutral(1);
    const salida = marcadoDe(panelDelEspectador(vista, null));
    expect(salida).toContain('Batalla · ronda');
    expect(salida).toContain('Parte de guerra');
  });

  it('con dos bandos con dueño pinta el color de cada uno', () => {
    const vista = contraUnHeroe(5);
    expect(vista.battle?.dueños).toEqual({ attacker: 0, defender: 1 });
    const salida = marcadoDe(batalla(vista));
    expect(salida).toContain('#d94f4f'); // jugador 0
    expect(salida).toContain('#4f7fd9'); // jugador 1
    expect(salida).not.toContain('neutral');
  });

  it('pinta el parte de guerra, que es el «qué acaba de pasar» del criterio 16', () => {
    // El dato ya viajaba dentro de `battle.log`; lo que faltaba era pintarlo. Y
    // va con `mio: null`, que es la rama de `renderBattleLog` que hasta hoy no
    // llamaba nadie: sin bando propio no se pinta ni victoria ni derrota.
    const { vista } = contraUnNeutral(1);
    const estado = vista.battle?.estado as BattleState;
    estado.log.push(
      { kind: 'round_start', round: 2 },
      {
        kind: 'attack',
        stack: estado.stacks[0]!.id,
        target: estado.stacks[0]!.id,
        damage: 9,
        killed: 1,
        retaliation: false,
      },
      { kind: 'perished', stack: estado.stacks[0]!.id },
      { kind: 'finished', winner: 'attacker' },
    );
    const salida = marcadoDe(batalla(vista));
    expect(salida).toContain('— Ronda 2 —');
    expect(salida).toContain('9 de daño, 1 bajas');
    // Sin bando propio: «una unidad», no «una unidad tuya» ni «enemiga».
    expect(salida).toContain('<div>Una unidad ha sido aniquilada</div>');
    expect(salida).toContain('<div>Fin: gana el atacante</div>');
  });

  it('la etiqueta `suerte` también se pinta — el hueco M-7 del ancla', () => {
    // `ETIQUETA_EFECTO` tiene tres entradas y el ancla solo pinta dos: una
    // partida normal no reparte efectos de suerte. Se cubre aquí en vez de
    // mover el ancla, que ancla otra cosa.
    const { vista } = contraUnNeutral(1);
    const estado = vista.battle?.estado as BattleState;
    estado.log.push({
      kind: 'effect',
      stack: estado.stacks[0]!.id,
      effect: 'luck',
      amount: 1,
      source: 'haste',
      rounds: 2,
    });
    expect(marcadoDe(batalla(vista))).toContain('suerte +1 durante 2 rondas');
  });
});

describe('el fin de la partida en el panel', () => {
  it('sin fin no dice nada', () => {
    const { vista } = contraUnNeutral(1);
    expect(marcadoDe(panelDelEspectador(vista, null))).not.toContain('Fin de la partida');
  });

  it('con ganador lo dice, y SIN ganador también — M-3', () => {
    // Una partida agotada sin resolver dejaba al espectador en el último día sin
    // una línea: `state.finished` se queda en `null` y el aviso solo salía por el
    // canal del agente.
    const { vista } = contraUnNeutral(1);
    const conGanador = marcadoDe(
      panelDelEspectador(vista, { winner: 0, note: 'Gana el jugador 0 (knight).' }),
    );
    expect(conGanador).toContain('Fin de la partida');
    expect(conGanador).toContain('Gana el jugador 0 (knight).');

    const sinGanador = marcadoDe(
      panelDelEspectador(vista, {
        winner: null,
        note: 'La partida se ha quedado sin resolver tras 13 días: no gana nadie.',
      }),
    );
    expect(sinGanador).toContain('Fin de la partida');
    expect(sinGanador).toContain('no gana nadie');
  });
});

describe('el panel del espectador escapa lo ajeno', () => {
  it('un nombre de héroe hostil sale como texto', () => {
    // `hireHero` deriva el nombre del héroe del pueblo, que lo escribe el agente.
    const { state, vista } = contraUnNeutral(1);
    void state;
    const conNombreMalo: SpectatorView = {
      ...vista,
      heroes: vista.heroes.map((h) => ({ ...h, name: '<img src=x onerror=alert(1)>' })),
    };
    const salida = marcadoDe(panelDelEspectador(conNombreMalo, null));
    expect(salida).toContain('&lt;img');
    expect(salida).not.toContain('<img');
  });

  it('y el `reasoning` del director también, que es el canal más ancho', () => {
    const { vista } = contraUnNeutral(1);
    const conProsaMala: SpectatorView = {
      ...vista,
      directorLog: ['Agente: </div><script>alert(1)</script>'],
    };
    const salida = marcadoDe(panelDelEspectador(conProsaMala, null));
    expect(salida).toContain('&lt;script&gt;');
    expect(salida).not.toContain('<script>');
  });
});

/** Que `monstruoVivo` siga existiendo es lo que hace determinista el montaje. */
void monstruoVivo;
