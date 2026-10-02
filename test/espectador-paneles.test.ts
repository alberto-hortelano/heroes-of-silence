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
import { Reproductor } from '../src/client/espectador/reproductor.js';
import {
  batallaTerminada,
  FINAL_VISIBLE_MS,
  mismaBatalla,
  RITMO_MAXIMO,
  retencionDelFinal,
  ritmoDeReproduccion,
  TelonDeBatalla,
} from '../src/client/espectador/telon.js';
import { marcadoDe } from '../src/client/html.js';
import { autoResolve, chooseBattleAction } from '../src/core/ai/tactics.js';
import { activeStack, applyAction, legalActions } from '../src/core/battle/battle.js';
import type { BattleState } from '../src/core/battle/types.js';
import type { Hero } from '../src/core/hero/hero.js';
import { reachableFrom } from '../src/core/map/map.js';
import { createRng } from '../src/core/rng.js';
import { applyAdventureAction, type GameState, settleBattle } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { SpectatorSnapshotMsg } from '../src/server/protocol.js';
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

  it('el tipo y la historia del héroe nacido de la tropa se pintan, escapados', () => {
    // La historia la escribe el narrador: es prosa ajena, como el `reasoning`.
    const { vista } = contraUnNeutral(1);
    const [primero, ...resto] = vista.heroes;
    const conHistoria: SpectatorView = {
      ...vista,
      heroes: [
        { ...primero!, nombreDelTipo: 'Vampiro', historia: 'Mordió <b>tres</b> veces & volvió' },
        ...resto,
      ],
    };
    const salida = marcadoDe(panelDelEspectador(conHistoria, null));
    expect(salida).toContain(`${primero!.name} · Vampiro`);
    expect(salida).toContain('Mordió &lt;b&gt;tres&lt;/b&gt; veces &amp; volvió');
    expect(salida).not.toContain('<b>tres');
    // Sin historia no se pinta la línea: el inicial y el contratado no tienen.
    expect(marcadoDe(panelDelEspectador(vista, null))).not.toContain('class="cost historia"');
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

/**
 * H-3 de la QA de la fase 1b: el fotograma de la batalla terminada y el del mapa
 * llegaban en el mismo tic, el segundo pisaba al primero, y el espectador no
 * pintaba nunca el final —ni «Se rinde … por N de oro» ni «Fin: gana …»—.
 */
describe('el telón retiene el final de una batalla', () => {
  /** Los tres fotogramas que manda el director alrededor del final de una batalla. */
  function finalDeBatalla(): {
    enCurso: SpectatorSnapshotMsg;
    terminada: SpectatorSnapshotMsg;
    mapa: SpectatorSnapshotMsg;
  } {
    const { state } = contraUnNeutral(4);
    const foto = (): SpectatorSnapshotMsg => ({
      type: 'snapshot',
      day: state.day,
      current: state.current,
      finished: null,
      view: JSON.parse(JSON.stringify(construirVista(state, []))),
    });
    const enCurso = foto();
    autoResolve(state.pendingBattle!.battle, createRng(4));
    const terminada = foto();
    settleBattle(state, { rng: createRng(4) });
    return { enCurso, terminada, mapa: foto() };
  }

  it('el final y el mapa llegan juntos: primero se aplica el final, y el mapa espera', () => {
    const { enCurso, terminada, mapa } = finalDeBatalla();
    expect(batallaTerminada(enCurso)).toBe(false);
    expect(batallaTerminada(terminada)).toBe(true);
    expect(batallaTerminada(mapa)).toBe(false);
    // Y lo que se retiene es lo que había que ver: el «Fin», arriba del panel
    // y no al final de la caja del parte, que se queda con el scroll arriba.
    expect(marcadoDe(panelDelEspectador(terminada.view, null))).toMatch(
      /<div class="desenlace"><div class="log">.*Fin: gana el/,
    );
    expect(marcadoDe(panelDelEspectador(enCurso.view, null))).not.toContain('desenlace');

    const telon = new TelonDeBatalla(batallaTerminada, 1000);
    telon.llega(enCurso);
    expect(telon.avanzar(0, false)).toBe(enCurso);
    // El director manda los dos en el mismo tic.
    telon.llega(terminada);
    telon.llega(mapa);
    expect(telon.avanzar(10, false)).toBe(terminada);
    // Mientras el animador cuenta los últimos golpes, el reloj no corre.
    expect(telon.avanzar(20, true)).toBeNull();
    expect(telon.avanzar(5000, true)).toBeNull();
    // Quieto ya, el final se queda a la vista el mínimo…
    expect(telon.avanzar(5010, false)).toBeNull();
    expect(telon.avanzar(6000, false)).toBeNull();
    expect(telon.pendiente).toBe(true);
    // …y luego pasa al mapa.
    expect(telon.avanzar(6010, false)).toBe(mapa);
    expect(telon.pendiente).toBe(false);
  });

  it('una rendición se lee arriba con su precio', () => {
    const { state } = contraUnNeutral(4);
    const b = state.pendingBattle!.battle;
    const rng = createRng(4);
    // Se juega con la IA hasta que el atacante —el héroe— pueda rendirse.
    for (let i = 0; i < 200 && b.finished === null; i++) {
      const s = activeStack(b)!;
      const rendicion = legalActions(b).find((a) => a.type === 'surrender');
      if (s.side === 'attacker' && rendicion !== undefined) {
        applyAction(b, rendicion, rng);
        break;
      }
      applyAction(b, chooseBattleAction(b), rng);
    }
    expect(b.finished?.surrender).toBeDefined();
    const marcado = marcadoDe(panelDelEspectador(construirVista(state, []), null));
    const desenlace = marcado.slice(marcado.indexOf('class="desenlace"'));
    expect(desenlace).toMatch(
      new RegExp(
        `^class="desenlace"><div class="log"><div>Se rinde el atacante por ${b.finished!.surrender!.gold} de oro</div><div>Fin: gana el defensor</div>`,
      ),
    );
  });

  it('atrasado, el final se retiene comprimido; con solo el siguiente detrás, entero', () => {
    const { enCurso, terminada, mapa } = finalDeBatalla();
    // Al día: el final y el mapa juntos, y nada más. El mínimo entero.
    expect(retencionDelFinal(1000, 1)).toBe(1000);
    expect(retencionDelFinal(1000, 0)).toBe(1000);
    // Con nueve más detrás del mapa, al ritmo de nueve de atraso.
    expect(retencionDelFinal(1000, 10)).toBe(1000 / ritmoDeReproduccion(9));
    expect(retencionDelFinal(1000, 10_000)).toBe(1000 / RITMO_MAXIMO);

    const telon = new TelonDeBatalla(batallaTerminada, 1000);
    telon.llega(enCurso);
    telon.avanzar(0, false);
    telon.llega(terminada);
    for (let i = 0; i < 10; i++) telon.llega(mapa);
    expect(telon.avanzar(10, false)).toBe(terminada);
    const corto = retencionDelFinal(1000, 10);
    expect(telon.avanzar(11, false)).toBeNull();
    expect(telon.avanzar(11 + corto - 1, false)).toBeNull();
    // Antes del mínimo entero ya pasa: el final no para la partida.
    expect(telon.avanzar(11 + corto, false)).toBe(mapa);
  });

  it('nunca aplica dos de golpe: el mapa espera a que el animador acabe, aunque no haya final', () => {
    const { enCurso, mapa } = finalDeBatalla();
    const telon = new TelonDeBatalla(batallaTerminada, 1000);
    telon.llega(enCurso);
    telon.llega(mapa);
    expect(telon.avanzar(0, false)).toBe(enCurso);
    expect(telon.atrasados).toBe(1);
    // El animador cuenta lo que trajo `enCurso`: el mapa no lo pisa.
    expect(telon.avanzar(10, true)).toBeNull();
    expect(telon.avanzar(20, false)).toBe(mapa);
  });
});

/**
 * H-7 de la segunda pasada de QA de la fase 1b. Con un agente rápido la batalla
 * entera llega en unos 40 ms; el telón la aplicaba de golpe, el animador la
 * contaba desde el principio en el fotograma final, el panel decía «Fin» con los
 * muertos de pie, y el espectador acababa 22 s detrás de la partida.
 */
describe('el espectador cuenta cada batalla en orden', () => {
  /** Una batalla de verdad, fotografiada tras CADA acción, como hace el director. */
  function fotogramasDeUnaBatalla(
    semilla: number,
    conMapaAlFinal: boolean,
  ): SpectatorSnapshotMsg[] {
    const { state } = contraUnNeutral(semilla);
    const foto = (): SpectatorSnapshotMsg => ({
      type: 'snapshot',
      day: state.day,
      current: state.current,
      finished: null,
      view: JSON.parse(JSON.stringify(construirVista(state, []))),
    });
    const b = state.pendingBattle!.battle;
    const rng = createRng(semilla);
    const fotos: SpectatorSnapshotMsg[] = [];
    for (let i = 0; i < 300 && b.finished === null; i++) {
      applyAction(b, chooseBattleAction(b), rng);
      fotos.push(foto());
    }
    expect(b.finished).not.toBeNull();
    if (conMapaAlFinal) {
      settleBattle(state, { rng });
      fotos.push(foto());
    }
    return fotos;
  }

  /**
   * El bucle de la página sin la página: un `paso` cada 16 ms hasta que no
   * quede nada, apuntando lo que vería quien mira en cada instante.
   */
  function reproducir(r: Reproductor, hasta = 600_000) {
    const puestos: { t: number; f: SpectatorSnapshotMsg; batalla: number }[] = [];
    const finesVistos: { t: number; caidosEnPie: number; contando: boolean }[] = [];
    let t = 0;
    for (; t < hasta; t += 16) {
      for (const f of r.paso(t)) puestos.push({ t, f, batalla: r.numeroDeBatalla });
      const b = r.batalla;
      // Lo que dice el panel, tal y como lo pinta la página en este instante.
      const ultimo = puestos.at(-1)?.f;
      if (ultimo !== undefined && b !== null) {
        const panel = marcadoDe(panelDelEspectador(ultimo.view, null, r.contando));
        if (/Fin: gana el|Se rinde/.test(panel))
          finesVistos.push({ t, caidosEnPie: r.caidosEnPie(), contando: r.contando });
      }
      if (!r.pendiente && !r.contando) break;
    }
    return { puestos, finesVistos, fin: t };
  }

  it('dos batallas seguidas en la misma ráfaga: en orden, sin saltos y sin mezclarse', () => {
    const a = fotogramasDeUnaBatalla(4, false);
    const b = fotogramasDeUnaBatalla(5, true);
    // Sin fotograma de mapa entre las dos: el caso que la regla vieja («aparece
    // una batalla después de no haber ninguna») contaba como una sola.
    const todos = [...a, ...b];
    const r = new Reproductor(1000);
    for (const f of todos) r.llega(f);
    const { puestos, finesVistos } = reproducir(r);

    // Uno a uno y en el orden en que llegaron: ni uno saltado.
    expect(puestos.map((p) => p.f)).toEqual(todos);
    // Cada fotograma con su batalla: los de A son la 1 y los de B la 2.
    expect(puestos.slice(0, a.length).every((p) => p.batalla === 1)).toBe(true);
    expect(puestos.slice(a.length, a.length + b.length - 1).every((p) => p.batalla === 2)).toBe(
      true,
    );
    // Y el «Fin» de cada una solo se da por visto con el tablero en su final.
    expect(finesVistos.length).toBeGreaterThan(0);
    expect(finesVistos.filter((v) => v.caidosEnPie > 0 || v.contando)).toEqual([]);
  });

  it('el final se sigue viendo el mínimo, ya contado, antes de pasar a lo siguiente', () => {
    const a = fotogramasDeUnaBatalla(4, true);
    const r = new Reproductor(1000);
    for (const f of a) r.llega(f);
    const { puestos } = reproducir(r);
    const final = puestos[a.length - 2]!;
    const mapa = puestos[a.length - 1]!;
    expect(batallaTerminada(final.f)).toBe(true);
    expect(mapa.f.view.battle).toBeNull();
    expect(mapa.t - final.t).toBeGreaterThanOrEqual(1000);
  });

  it('atrasado, acelera: una ráfaga se cuenta entera y antes que a ritmo normal', () => {
    const fotos = [...fotogramasDeUnaBatalla(4, true), ...fotogramasDeUnaBatalla(5, true)];
    const deGolpe = new Reproductor(FINAL_VISIBLE_MS);
    for (const f of fotos) deGolpe.llega(f);
    const rafaga = reproducir(deGolpe);
    // Al día: llegan de uno en uno y cada uno cuando el anterior ya se contó.
    const alDia = new Reproductor(FINAL_VISIBLE_MS);
    let t = 0;
    const cola = [...fotos];
    for (; t < 600_000; t += 16) {
      if (!alDia.pendiente && !alDia.contando) {
        const f = cola.shift();
        if (f === undefined) break;
        alDia.llega(f);
      }
      alDia.paso(t);
    }
    expect(rafaga.puestos.map((p) => p.f)).toEqual(fotos);
    expect(rafaga.fin).toBeLessThan(t * 0.6);
  });

  it('el ritmo: normal al día, proporcional al retraso y con techo', () => {
    expect(ritmoDeReproduccion(0)).toBe(1);
    expect(ritmoDeReproduccion(4)).toBeGreaterThan(ritmoDeReproduccion(2));
    expect(ritmoDeReproduccion(1000)).toBe(RITMO_MAXIMO);
    expect(() => ritmoDeReproduccion(-1)).toThrow(/es un recuento/);
  });

  it('`mismaBatalla`: la misma crece; otra no, aunque los stacks se llamen igual', () => {
    const a = fotogramasDeUnaBatalla(4, false).map((f) => f.view.battle!.estado);
    // La 6 y no la 5: con el mapa de 28 las semillas 4 y 5 dan la MISMA
    // batalla —cuatro de tropa contra seis esqueletos, y el héroe abre igual—,
    // así que su primer fotograma es idéntico y nada podría distinguirlas. Lo
    // que este test mira es que dos batallas distintas no se confundan.
    const b = fotogramasDeUnaBatalla(6, false).map((f) => f.view.battle!.estado);
    expect(mismaBatalla(null, a[0]!)).toBe(false);
    expect(mismaBatalla(a[0]!, a[1]!)).toBe(true);
    expect(mismaBatalla(a[0]!, a.at(-1)!)).toBe(true);
    // El mismo final repetido sigue siendo el mismo.
    expect(mismaBatalla(a.at(-1)!, a.at(-1)!)).toBe(true);
    // Lo que llega después de un final, con más registro, es otra.
    expect(mismaBatalla(a.at(-1)!, b.at(-1)!)).toBe(false);
    expect(mismaBatalla(a.at(-1)!, b[0]!)).toBe(false);
    // Y la de en medio de A no continúa en B.
    expect(mismaBatalla(a[0]!, b.at(-1)!)).toBe(false);
  });

  it('el animador no frena por debajo de 1: lo dice', () => {
    const r = new Reproductor();
    expect(() => {
      r.animador.velocidad = 0.5;
    }).toThrow(/ritmo 0.5/);
  });
});
