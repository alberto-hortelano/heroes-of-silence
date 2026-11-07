import { describe, expect, it, vi } from 'vitest';
import { marcadoDe } from '../src/client/comun/html.js';
import { Session } from '../src/client/sesion/partida.js';
import { renderSide } from '../src/client/views/panels.js';
import { completarCruce } from '../src/core/ai/rueda.js';
import { chooseBattleAction, chooseBattleActionAndCosts } from '../src/core/ai/tactics.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { applyAction } from '../src/core/battle/battle.js';
import * as board from '../src/core/battle/board.js';
import { CARGA } from '../src/core/battle/carga.js';
import {
  activeStack,
  cargaDesde,
  casillasDeCarga,
  enemiesOf,
  firmaDelTurno,
  isAlive,
  movableFrom,
  movableHexes,
  stackById,
  stackHexes,
  stackSpeed,
} from '../src/core/battle/consultas.js';
import {
  computeDamage,
  damageMultiplier,
  effectiveAttack,
  herir,
  stackHp,
} from '../src/core/battle/damage.js';
import { applyEffect, effectTotal, tickEffects } from '../src/core/battle/effects.js';
import { ataqueBlocker, legalActions, legalActionsAndCosts } from '../src/core/battle/legalidad.js';
import { armyMorale, type BattleSide, createBattle } from '../src/core/battle/montaje.js';
import type {
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
  TurnoDeUnidad,
} from '../src/core/battle/types.js';
import { HERO_BODY, MAX_ROUNDS } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { heroUnit } from '../src/core/hero/hero.js';
import { umbral } from '../src/core/hero/rango.js';
import type { Rng } from '../src/core/rng.js';
import { createRng } from '../src/core/rng.js';
import type { CreatureTrait, Hex, Stack, UnitInfo } from '../src/core/types.js';
import { unidadDelJuego } from '../src/core/unidad/catalogo.js';
import {
  aCiegas,
  agresiva,
  aMano,
  conCifrasAMano,
  forzarTurno,
  muralla,
  NORMAL,
} from './batalla-de-prueba.js';
import {
  FACCION_B,
  JINETE,
  NO_MUERTO,
  PESADA,
  TIRADOR,
  TIRADOR_NO_MUERTO,
  TROPA,
  TROPA_BARATA,
} from './comun.js';
import { monstruoVivo } from './partida-de-prueba.js';

/**
 * `alcanceConCostes` y `reachable` son el recorrido del tablero: el primero paga
 * el contacto (desde el 19-10-2026) y el segundo, el BFS sin costes, lo hace
 * cuando no hay un enemigo cerca, que entonces dan lo mismo (`recorrer`, simplify
 * de F3-F6), y cuando `movimientoBlocker` explica un rechazo. Contarles las
 * llamadas (`recorridos`) cuenta exactamente los recorridos que hace
 * `legalActions`.
 *
 * Se envuelve el módulo en vez de espiar el export, y no por gusto: la llamada
 * de `movableFrom` va por el enlace local de su módulo, así que un
 * `vi.spyOn(board, 'alcanceConCostes')` se quedaría mirando un objeto por el que
 * no pasa nadie y contaría cero pase lo que pase. El envoltorio llama al
 * original, de modo que ninguna otra prueba de este fichero cambia de
 * comportamiento.
 */
/**
 * `applyAction` con la rueda en Normal contra Normal si el golpe no trae sus
 * elecciones (desde el 19-10-2026 todo golpe cuerpo a cuerpo pasa por ella, y sin
 * elecciones se planta): este fichero mira las reglas de siempre; la rueda, en
 * `rueda.test.ts`.
 */
function aplicar(
  state: BattleState,
  accion: BattleAction,
  rng: Rng,
  movibles?: Parameters<typeof applyAction>[3],
): void {
  const conRueda =
    accion.type === 'attack' && accion.golpe === undefined && accion.respuesta === undefined
      ? { ...accion, ...NORMAL }
      : accion;
  applyAction(state, conRueda, rng, movibles);
}

vi.mock('../src/core/battle/board.js', async (original) => {
  const real = await original<typeof import('../src/core/battle/board.js')>();
  return {
    ...real,
    alcanceConCostes: vi.fn(real.alcanceConCostes),
    reachable: vi.fn(real.reachable),
  };
});

/** Los recorridos del tablero desde el último `aCero`: los dos espías juntos. */
function recorridos(): number {
  return (
    vi.mocked(board.alcanceConCostes).mock.calls.length +
    vi.mocked(board.reachable).mock.calls.length
  );
}

function aCero(): void {
  vi.mocked(board.alcanceConCostes).mockClear();
  vi.mocked(board.reachable).mockClear();
}

/**
 * Un bando. Con héroe, el héroe pisa el tablero (fase 1b): una figura más, con
 * `cuerpo` como cifras.
 */
const side = (
  army: readonly Stack[],
  hero: BattleHero | null = null,
  cuerpo: UnitInfo = heroUnit({
    name: 'Prueba',
    attack: 0,
    defense: 0,
    experience: umbral(5),
    equipo: {},
  }),
): BattleSide => ({
  army,
  hero: hero === null ? null : { mando: hero, cuerpo, desnudo: cuerpo, figura: HERO_BODY },
});

const hero = (over: Partial<BattleHero> = {}): BattleHero => ({
  name: 'Prueba',
  // Sin base a la que volver: un héroe de test no se rinde salvo que se diga.
  retreat: { blocked: 'no tienes base a la que volver' },
  spellPower: 3,
  knowledge: 3,
  mana: 30,
  castThisRound: false,
  spells: [],
  ...over,
});

/**
 * Un stack suelto, fuera de tablero: para probar lecturas sin montar batalla.
 * Con `unit`, esas cifras (una unidad hecha a mano) en vez de las del catálogo.
 */
function stackOf(id: string, count: number, unit: UnitInfo = unidadDelJuego(id)): BattleStack {
  return {
    id,
    side: 'attacker',
    slot: 0,
    body: id,
    unit,
    origen: { kind: 'catalogo', unidad: id, oro: unidadDelJuego(id).oro, veterania: null },
    initialCount: count,
    count,
    topHp: unit.hp,
    hex: { col: 0, row: 0 },
    escalera: false,
    retaliated: false,
    acted: false,
    morale: 0,
    effects: [],
    ganado: { experiencia: 0, bajas: 0, heroes: [] },
    apuntado: null,
    recargando: 0,
    granada: null,
    granadasLanzadas: 0,
    hechizoEnElAire: null,
  };
}

/**
 * Uno de 3 casillas (fuerza 2, agilidad 3, con la Espada y la rodela, que pesan 1):
 * un alcance que cabe en la vista. Era el zombi hasta el catálogo retocado del
 * 02-11-2026, en que el zombi pasó a agilidad 2.
 */
const DE_TRES = 'esqueleto-guerrero';

/** Las cifras de `base` con el rasgo `rasgo` además de los suyos: el catálogo no lo trae. */
function con(base: string, rasgo: CreatureTrait, cambios: Partial<UnitInfo> = {}): UnitInfo {
  return aMano(base, { ...cambios, traits: [...(unidadDelJuego(base).traits ?? []), rasgo] });
}

describe('fórmula de daño', () => {
  it('cada punto de ataque de ventaja suma un 10 %, con tope en +300 %', () => {
    expect(damageMultiplier(5, 5)).toBe(1);
    expect(damageMultiplier(6, 5)).toBeCloseTo(1.1);
    expect(damageMultiplier(15, 5)).toBeCloseTo(2.0);
    expect(damageMultiplier(100, 5)).toBeCloseTo(4.0);
  });

  it('cada punto de defensa de ventaja resta un 2,5 %, con suelo en -70 %', () => {
    expect(damageMultiplier(5, 6)).toBeCloseTo(0.975);
    expect(damageMultiplier(5, 45)).toBeCloseTo(0.3);
    expect(damageMultiplier(1, 500)).toBeCloseTo(0.3);
  });
});

describe('aplicación de daño a un stack', () => {
  // Lo que llega es el daño menos la armadura de quien lo recibe (#262):
  // `herir` la resta, así que cada golpe se escribe con ella encima.
  it('mata efectivos enteros y deja al de arriba herido', () => {
    const s = stackOf(PESADA, 10);
    const { hp } = s.unit;
    expect(stackHp(s)).toBe(10 * hp);
    const llega = 2 * hp + hp / 2;
    const killed = herir(s, { damage: llega + armaduraDe(s.unit), perfora: false }, null).muertos;
    expect(killed).toBe(2);
    expect(s.count).toBe(8);
    expect(stackHp(s)).toBe(10 * hp - llega);
  });

  it('un daño menor que un efectivo no mata a nadie', () => {
    const s = stackOf(PESADA, 3);
    const llega = Math.floor(s.unit.hp / 2);
    expect(herir(s, { damage: llega + armaduraDe(s.unit), perfora: false }, null).muertos).toBe(0);
    expect(s.count).toBe(3);
    expect(s.topHp).toBe(s.unit.hp - llega);
  });

  it('el exceso de daño no resucita ni deja restos', () => {
    const s = stackOf(TROPA_BARATA, 4);
    expect(herir(s, { damage: 9999, perfora: false }, null).muertos).toBe(4);
    expect(s.count).toBe(0);
    expect(stackHp(s)).toBe(0);
  });
});

describe('moral por composición del ejército', () => {
  const u = (id: string) => unidadDelJuego(id);

  it('premia al ejército de una sola facción', () => {
    expect(armyMorale([u(TROPA)])).toBe(1);
    expect(armyMorale([u(TROPA), u(PESADA)])).toBe(1);
  });

  it('no premia a un ejército mixto de dos facciones', () => {
    expect(armyMorale([u(TROPA), u(PESADA), u(JINETE)])).toBe(1);
    expect(armyMorale([u(TROPA), u(TROPA_BARATA)])).toBe(0);
    // La facción es lo que cuenta, no la unidad: la misma con otra facción mezcla.
    const otra: UnitInfo = { ...u(TROPA), faction: FACCION_B };
    expect(armyMorale([u(TROPA), otra])).toBe(0);
  });

  it('con algún no-muerto, −1 al ejército entero, como fheroes2 (#199)', () => {
    // «Some undead in army -1» (`army.cpp`): dos facciones con no-muertos no
    // se quedan en 0, bajan a −1.
    expect(armyMorale([u(TROPA_BARATA), u(NO_MUERTO)])).toBe(-1);
  });

  it('y el no-muerto anula el +1 de una sola facción (#199)', () => {
    // Un ejército solo de no-muertos: una facción, pero sin el +1 y con el −1.
    expect(armyMorale([u(NO_MUERTO), u(TIRADOR_NO_MUERTO)])).toBe(-1);
    // Quien no tiene facción tampoco es no-muerto: ni da el −1 ni quita el +1.
    const sinFaccion = { ...u(NO_MUERTO), faction: null, traits: [] };
    expect(armyMorale([u(TROPA_BARATA), sinFaccion])).toBe(1);
  });

  it('el −1 lo pagan los vivos: el no-muerto sigue a 0 (#199)', () => {
    const state = createBattle(
      side([
        { creature: TROPA_BARATA, count: 5 },
        { creature: NO_MUERTO, count: 5 },
      ]),
      side([{ creature: TROPA, count: 5 }]),
      createRng(1),
      COMBATE_COMPLETO,
    );
    expect(stackById(state, 'attacker-0').morale).toBe(-1);
    expect(stackById(state, 'attacker-1').morale).toBe(0);
    // El otro bando no se entera: la mezcla es de cada ejército.
    expect(stackById(state, 'defender-0').morale).toBe(1);
  });

  it('quien no tiene facción no cuenta: ni rompe la unidad ni la da', () => {
    const sinFaccion = { ...u(TROPA_BARATA), faction: null };
    expect(armyMorale([u(TROPA_BARATA), sinFaccion])).toBe(1);
    expect(armyMorale([sinFaccion])).toBe(0);
  });

  it('se fija al empezar la batalla: muerto el de otra facción, la mezcla sigue costando (#49)', () => {
    // Igual que fheroes2: la mezcla se cuenta sobre el ejército de fuera de la
    // batalla, que no se entera de las bajas hasta que la batalla acaba.
    const state = createBattle(
      side([
        { creature: TROPA_BARATA, count: 5 },
        { creature: NO_MUERTO, count: 5 },
      ]),
      side([{ creature: TROPA, count: 5 }]),
      createRng(1),
      COMBATE_COMPLETO,
    );
    const campesino = stackById(state, 'attacker-0');
    // Dos facciones y un no-muerto: 0 por la mezcla y −1 por él (#199).
    expect(campesino.morale).toBe(-1);
    herir(stackById(state, 'attacker-1'), { damage: 9999, perfora: false }, null);
    // Una ronda entera cerrando turnos, para pasar por el final de ronda y por
    // cada `advance`, que es donde se colaría un recálculo.
    const rng = createRng(1);
    while (state.round < 2) aplicar(state, { type: 'end_turn' }, rng);
    expect(state.finished).toBeNull();
    expect(campesino.morale).toBe(-1);
  });
});

describe('despliegue inicial', () => {
  it('coloca cada bando en su borde: el defensor, en el espejo del atacante', () => {
    const state = createBattle(
      side([{ creature: TROPA_BARATA, count: 10 }]),
      side([{ creature: NO_MUERTO, count: 1 }]),
      createRng(1),
      COMBATE_COMPLETO,
    );
    expect(stackById(state, 'attacker-0').hex).toEqual({ col: 0, row: 4 });
    expect(stackById(state, 'defender-0').hex).toEqual(board.espejo({ col: 0, row: 4 }));
  });

  it('empieza en la ronda 1 con un stack activo', () => {
    const state = createBattle(
      side([{ creature: TIRADOR, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(7),
      COMBATE_COMPLETO,
    );
    expect(state.round).toBe(1);
    expect(activeStack(state)).not.toBeNull();
  });
});

describe('iniciativa', () => {
  it('mueve primero al más rápido', () => {
    const state = createBattle(
      side([{ creature: NO_MUERTO, count: 5 }]), // 4 casillas
      side([{ creature: JINETE, count: 5 }]), // 7 casillas
      createRng(3),
      COMBATE_COMPLETO,
    );
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('en un empate de velocidad mueve el atacante', () => {
    const state = createBattle(
      side([{ creature: NO_MUERTO, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(3),
      COMBATE_COMPLETO,
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
  });

  /** Quién tiene turno, en orden, hasta `rondas` rondas, cerrando cada uno sin más. */
  function turnos(state: BattleState, rng: Rng, rondas: number): string[] {
    const orden: string[] = [];
    while (state.round <= rondas && state.finished === null) {
      orden.push((activeStack(state) as BattleStack).id);
      aplicar(state, { type: 'end_turn' }, rng);
    }
    return orden;
  }

  /** Esqueletos contra esqueletos: todos a la misma velocidad y sin moral. */
  function empatados(atacantes: number, defensores: number): BattleState {
    const esqueletos = (n: number): Stack[] =>
      Array.from({ length: n }, () => ({ creature: NO_MUERTO, count: 5 }));
    const state = createBattle(
      side(esqueletos(atacantes)),
      side(esqueletos(defensores)),
      createRng(3),
      COMBATE_COMPLETO,
    );
    for (const s of state.stacks) s.morale = 0;
    return state;
  }

  it('los empates entre bandos se alternan, no se los queda el atacante (#199)', () => {
    // fheroes2, `GetCurrentUnit`: tras cada turno, el empate es del otro bando.
    const state = empatados(2, 2);
    expect(turnos(state, createRng(1), 1)).toEqual([
      'attacker-0',
      'defender-0',
      'attacker-1',
      'defender-1',
    ]);
  });

  it('la cola enseña ya el orden alternado que se jugará (#199)', () => {
    const state = empatados(2, 2);
    expect(activeStack(state)!.id).toBe('attacker-0');
    expect(state.queue).toEqual(['defender-0', 'attacker-1', 'defender-1']);
  });

  it('y la ronda siguiente empieza por el contrario del último que actuó (#199)', () => {
    // Tres contra uno: la ronda 1 acaba en un atacante, así que la 2 la abre
    // el defensor. Se lleva de una ronda a otra (`_lastActiveUnitArmyColor`).
    const state = empatados(2, 1);
    expect(turnos(state, createRng(1), 2)).toEqual([
      'attacker-0',
      'defender-0',
      'attacker-1',
      'defender-0',
      'attacker-0',
      'attacker-1',
    ]);
  });

  it('quien muere antes de su turno no gasta el empate de su bando (#199)', () => {
    // Si la cola se fijara al empezar la ronda, tras el muerto iría el
    // atacante 1, que era el siguiente previsto. fheroes2 elige uno a uno.
    const state = empatados(2, 2);
    const rng = createRng(1);
    expect(activeStack(state)!.id).toBe('attacker-0');
    herir(stackById(state, 'defender-0'), { damage: 9999, perfora: false }, null);
    aplicar(state, { type: 'end_turn' }, rng);
    expect(activeStack(state)!.id).toBe('defender-1');
  });

  it('la moral no da ni quita turnos, aunque salga toda tirada (26-10-2026)', () => {
    // «La moral solo debe servir para la huida, nunca dar un turno extra» (el
    // usuario): con +1 de una sola facción, un escudero de 6 casillas andaba
    // 6 + 6 en la ronda 1 y cruzaba el tablero. Con `chance` siempre verdadero,
    // la regla de antes daba el turno extra a la moral +3 y quitaba el suyo a la
    // −3 en el primer turno de cada uno.
    const state = empatados(2, 2);
    stackById(state, 'attacker-0').morale = 3;
    stackById(state, 'defender-0').morale = -3;
    const rng: Rng = { ...createRng(1), chance: () => true };
    expect(turnos(state, rng, 2)).toEqual([
      'attacker-0',
      'defender-0',
      'attacker-1',
      'defender-1',
      // La ronda 1 la cerró un defensor: el empate de la 2 es del atacante.
      'attacker-0',
      'defender-0',
      'attacker-1',
      'defender-1',
    ]);
  });

  it('una Prisa a media ronda no adelanta en la cola: la velocidad es la de empezar (fheroes2 sí lo haría; pendiente)', () => {
    const state = empatados(2, 2);
    applyEffect(stackById(state, 'attacker-1'), {
      kind: 'speed',
      amount: 10,
      source: 'haste',
      roundsLeft: 3,
    });
    aplicar(state, { type: 'end_turn' }, createRng(1));
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('los hechizos de velocidad cambian el orden', () => {
    const state = createBattle(
      side([{ creature: NO_MUERTO, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(3),
      COMBATE_COMPLETO,
    );
    const s = stackById(state, 'attacker-0');
    const base = stackSpeed(s);
    applyEffect(s, { kind: 'speed', amount: 2, source: 'haste', roundsLeft: 3 });
    expect(stackSpeed(s)).toBe(base + 2);
  });
});

describe('combate cuerpo a cuerpo', () => {
  it('ningún stack contraataca más de una vez por ronda', () => {
    const rng = createRng(11);
    const state = createBattle(
      side([{ creature: PESADA, count: 20 }]),
      side([{ creature: TROPA, count: 20 }]),
      rng,
      COMBATE_COMPLETO,
    );
    simular(state, rng);

    // El log se recorre por rondas: entre dos 'round_start', cada stack puede
    // contraatacar una sola vez. Un contraataque son los golpes de su intercambio
    // (Rápido devuelve dos), que van tras el `cruce` de su golpe.
    let contraestaRonda = new Set<string>();
    let contraEsteGolpe = new Set<string>();
    for (const evento of state.log) {
      if (evento.kind === 'round_start') contraestaRonda = new Set();
      if (evento.kind === 'cruce') contraEsteGolpe = new Set();
      if (evento.kind === 'attack' && evento.retaliation && !contraEsteGolpe.has(evento.stack)) {
        expect(contraestaRonda.has(evento.stack)).toBe(false);
        contraestaRonda.add(evento.stack);
        contraEsteGolpe.add(evento.stack);
      }
    }
    expect(state.log.some((e) => e.kind === 'attack' && e.retaliation)).toBe(true);
  });

  it('quien no recibe contraataque (`no_retaliation`) no lo recibe', () => {
    const rng = createRng(5);
    const state = conCifrasAMano(
      createBattle(
        side([{ creature: PESADA, count: 10 }]),
        side([{ creature: TROPA_BARATA, count: 40 }]),
        rng,
        COMBATE_COMPLETO,
      ),
      'attacker-0',
      con(PESADA, 'no_retaliation'),
    );
    simular(state, rng);
    // Sus golpes no se devuelven; los que recibe, él sí los devuelve.
    const suyos = state.log.filter((e) => e.kind === 'attack' && e.stack === 'attacker-0');
    expect(suyos.some((e) => e.kind === 'attack' && !e.retaliation)).toBe(true);
    expect(
      state.log.some((e) => e.kind === 'attack' && e.retaliation && e.target === 'attacker-0'),
    ).toBe(false);
  });
});

describe('hechizos', () => {
  it('el héroe no puede lanzar dos hechizos en la misma ronda', () => {
    const rng = createRng(32);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 30 });
    const state = createBattle(
      side([{ creature: JINETE, count: 10 }], lanzador),
      side([{ creature: NO_MUERTO, count: 10 }]),
      rng,
      COMBATE_COMPLETO,
    );
    aplicar(state, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' }, rng);
    expect(() =>
      aplicar(state, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' }, rng),
    ).toThrow(/ya lanzó/);
  });
});

describe('acciones ilegales', () => {
  it('se rechazan en vez de corregirse en silencio', () => {
    const rng = createRng(41);
    const state = createBattle(
      side([{ creature: JINETE, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      rng,
      COMBATE_COMPLETO,
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
    expect(() => aplicar(state, { type: 'move', to: { col: 10, row: 8 } }, rng)).toThrow();
    expect(() => aplicar(state, { type: 'attack', target: 'defender-0' }, rng)).toThrow();
  });
});

/**
 * Batalla fija para mirar `legalActions` con lupa: uno de 3 casillas (`DE_TRES`)
 * —lento, así que su alcance cabe en la vista— pegado al arquero, con CUATRO
 * enemigos delante.
 *
 * El activo se fija a mano porque `turno` es un campo y no una tirada: si la
 * lista dependiera de quién gana la iniciativa, el día que cambie un desempate
 * este test diría que se rompió `legalActions`.
 */
function batallaDeCuatroEnemigos(): BattleState {
  const state = createBattle(
    side([{ creature: DE_TRES, count: 5 }]),
    side([
      { creature: TROPA_BARATA, count: 6 },
      { creature: TIRADOR, count: 4 },
      { creature: TROPA, count: 3 },
      { creature: JINETE, count: 2 },
    ]),
    createRng(7),
    COMBATE_COMPLETO,
  );
  stackById(state, 'attacker-0').hex = { col: 9, row: 3 };
  forzarTurno(state, 'attacker-0');
  return state;
}

describe('legalActions recorre el tablero una sola vez (#48)', () => {
  it('lanza un BFS por llamada, no uno por enemigo', () => {
    const state = batallaDeCuatroEnemigos();
    // `enemiesOf` del núcleo, no una copia: el helper que había aquí fijaba el
    // bando a mano —`side !== 'attacker'`—, así que el día que el activo fuera
    // el defensor contaría el bando equivocado y el `toBe(4)` seguiría verde
    // diciendo otra cosa.
    expect(enemiesOf(state, activeStack(state) as BattleStack)).toHaveLength(4);

    aCero();
    legalActions(state);
    // Con el BFS dentro del bucle de ataques eran 1 + 4 = 5.
    expect(recorridos()).toBe(1);
  });

  it('sus `move` son `movableHexes` tal cual, que es de lo que tira la IA', () => {
    // La IA táctica ya no relanza el BFS para saber a dónde puede avanzar:
    // filtra los `move` de la lista que acaba de pedir. Eso solo vale si son
    // exactamente los mismos hexes Y en el mismo orden, porque de ese orden
    // sale la casilla elegida cuando dos quedan a la misma distancia. Este
    // test es lo que sujeta esa suposición: si `legalActions` empezara a
    // filtrar, reordenar o completar sus `move`, aquí se ve.
    const state = batallaDeCuatroEnemigos();
    const s = activeStack(state) as BattleStack;
    const movimientos = legalActions(state)
      .filter((a) => a.type === 'move')
      .map((a) => a.to);

    expect(movimientos.length).toBeGreaterThan(0);
    expect(movimientos).toEqual(movableHexes(state, s));
  });

  it('los costes que devuelve son los de `movableFrom`, sin un BFS de más', () => {
    // De este mapa cuelga la elección de casilla de #50, y el motivo de que
    // venga de aquí es que el BFS ya se ha hecho: pedirlo aparte costaba
    // +17,6 % en 300 batallas, pagado íntegro por unidades sin `charge`.
    // Si algún día `legalActionsAndCosts` devolviera un mapa recortado, o de
    // otro stack, la IA elegiría a ciegas y el `throw` de `mejorCarga` no lo
    // vería: las claves seguirían siendo las mismas.
    const state = batallaDeCuatroEnemigos();
    const s = activeStack(state) as BattleStack;
    const { actions, costs } = legalActionsAndCosts(state);

    expect(costs).toEqual(movableFrom(state, s));
    expect(costs.size).toBeGreaterThan(0);
    // Y son los mismos hexes que los `move`, en el mismo orden.
    expect([...costs.keys()]).toEqual(
      actions.filter((a) => a.type === 'move').map((a) => `${a.to.col},${a.to.row}`),
    );
  });

  it('los hexes de `movableHexes` son los de las claves de `movableFrom` (#76)', () => {
    // `movableHexes` devolvía la clave partida por la coma; ahora devuelve el
    // `Hex` que el BFS metió en el paso. Si los dos se separaran, la lista
    // legal ofrecería un `move` a una casilla y el motor cobraría la de otra —
    // y las claves seguirían cuadrando, que es lo que lo haría invisible.
    const state = batallaDeCuatroEnemigos();
    const s = activeStack(state) as BattleStack;
    const pasos = movableFrom(state, s);

    expect(pasos.size).toBeGreaterThan(0);
    expect(movableHexes(state, s).map((h) => `${h.col},${h.row}`)).toEqual([...pasos.keys()]);
    for (const [k, paso] of pasos) expect(`${paso.at.col},${paso.at.row}`).toBe(k);
  });

  it('elegir y aplicar un avance cuesta UN recorrido, no dos (#78)', () => {
    // El tercer BFS del mismo turno del mismo stack: `legalActions` hacía el
    // primero, `mejorCarga` lo leía de ahí, y `moveTo` volvía a hacerlo entero
    // solo para contar los hexes de la carga. 970 de 3 170 en 300 batallas.
    const state = batallaDeCuatroEnemigos();
    // Lejos de todos, que es la rama que llega a `moveTo`: pegado a un enemigo
    // la IA pega desde donde está y no se mueve.
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };

    aCero();
    const { action, movibles } = chooseBattleActionAndCosts(state);
    // Si la IA dejara de avanzar en este tablero, el test dejaría de medir lo
    // que dice medir y hay que buscarle otro.
    expect(action.type).toBe('move');
    aplicar(state, action, createRng(1), movibles);

    expect(recorridos()).toBe(1);
  });

  it('la carga cobra los mismos hexes con recorrido traído que sin él (#78)', () => {
    // Lo que se lee del mapa es el daño: `chargeHexes` sale de ahí. Si el
    // recorrido traído discrepara del que haría `moveTo`, la caballería
    // pegaría distinto — y eso mueve partidas sin que el tipo cambie.
    const montar = (rng: ReturnType<typeof createRng>): BattleState => {
      const s = createBattle(
        side([{ creature: JINETE, count: 10 }]),
        side([{ creature: TROPA, count: 40 }]),
        rng,
        COMBATE_COMPLETO,
      );
      stackById(s, 'attacker-0').hex = { col: 0, row: 4 };
      stackById(s, 'defender-0').hex = { col: 4, row: 4 };
      return s;
    };
    // Tres hexes y no los cinco de la carga máxima **a propósito**: en el techo
    // el motor recorta, así que un recorrido que dijera uno de MÁS daría el
    // mismo daño y este test lo dejaría pasar. Comprobado a mano: con `+1` en
    // el techo nada se mueve; aquí, con `+1` y con `−1`, se ve.
    const carga = {
      type: 'attack',
      target: 'defender-0',
      from: { col: 3, row: 4 },
    } as const;

    const aPelo = montar(createRng(51));
    aplicar(aPelo, carga, createRng(51));

    const conPista = montar(createRng(51));
    const s = activeStack(conPista) as BattleStack;
    const turno = conPista.turno as TurnoDeUnidad;
    const conRecorrido = {
      firma: firmaDelTurno(turno, conPista.golpeEnCurso),
      puertas: '',
      costs: movableFrom(conPista, s),
    };
    aplicar(conPista, carga, createRng(51), conRecorrido);

    expect(conPista.log).toEqual(aPelo.log);
    const golpe = aPelo.log.find((e) => e.kind === 'attack' && !e.retaliation);
    expect(golpe).toMatchObject({ charge: 3 });
    expect(3).toBeLessThan(stackSpeed(stackById(aPelo, 'attacker-0')));
  });

  it('sin stack activo no hay lista ni costes, y no revienta', () => {
    const state = batallaDeCuatroEnemigos();
    state.turno = null;
    expect(legalActionsAndCosts(state)).toEqual({ actions: [], costs: new Map() });
  });
});

describe('batalla completa', () => {
  it('termina con un solo bando en pie', () => {
    const rng = createRng(1234);
    const state = createBattle(
      side([
        { creature: PESADA, count: 20 },
        { creature: TIRADOR, count: 15 },
      ]),
      side([
        { creature: NO_MUERTO, count: 40 },
        { creature: TIRADOR_NO_MUERTO, count: 5 },
      ]),
      rng,
      COMBATE_COMPLETO,
    );

    let turnos = 0;
    while (state.finished === null && turnos < 2000) {
      const acciones = legalActions(state);
      expect(acciones.length).toBeGreaterThan(0);
      // Preferir agresión para que la batalla converja.
      const eleccion =
        acciones.find((a) => a.type === 'attack') ??
        acciones.find((a) => a.type === 'move') ??
        acciones[0]!;
      aplicar(state, eleccion, rng);
      turnos++;
    }

    expect(state.finished).not.toBeNull();
    const ganador = state.finished!.winner;
    const vivosGanador = state.stacks.filter((s) => s.side === ganador && isAlive(s));
    const vivosPerdedor = state.stacks.filter((s) => s.side !== ganador && isAlive(s));
    expect(vivosGanador.length).toBeGreaterThan(0);
    expect(vivosPerdedor).toHaveLength(0);
    expect(state.log.at(-1)).toEqual({ kind: 'finished', winner: ganador });
  });

  it('es determinista: la misma semilla da la misma batalla', () => {
    const jugar = (semilla: number): string => {
      const rng = createRng(semilla);
      const state = createBattle(
        side([{ creature: TROPA, count: 12 }]),
        side([{ creature: NO_MUERTO, count: 18 }]),
        rng,
        COMBATE_COMPLETO,
      );
      let n = 0;
      while (state.finished === null && n < 1000) {
        // Agresiva y con la rueda a ciegas, que tira del `rng`: con `acciones[0]`,
        // que era `defend`, no se movía nadie y la semilla la daban la moral y la
        // suerte; con la rueda fija, dos semillas daban la misma batalla.
        aplicar(state, completarCruce(state, agresiva(state), rng).accion, rng);
        n++;
      }
      return JSON.stringify(state.log);
    };
    expect(jugar(99)).toBe(jugar(99));
    expect(jugar(99)).not.toBe(jugar(100));
  });
});

/** Pega dos stacks el uno al otro para no depender de que se busquen. */
function enfrentar(
  a: { hex: { col: number; row: number } },
  b: { hex: { col: number; row: number } },
): void {
  a.hex = { col: 5, row: 4 };
  b.hex = { col: 6, row: 4 };
}

describe('efectos temporales (#9)', () => {
  it('refrescar nunca acorta lo que ya estaba puesto', () => {
    const s = stackOf(NO_MUERTO, 10);
    applyEffect(s, { kind: 'speed', amount: -2, source: 'slow', roundsLeft: 4 });
    applyEffect(s, { kind: 'speed', amount: -2, source: 'slow', roundsLeft: 2 });
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0]!.roundsLeft).toBe(4);
    expect(effectTotal(s, 'speed')).toBe(-2);
  });

  it('aplicar un efecto no gasta la plantilla de quien lo puso', () => {
    // `ON_HIT_EFFECTS` es una constante compartida entre todos los golpes: si
    // `applyEffect` guardara el objeto en vez de una copia, `tickEffects` le
    // iría bajando el `roundsLeft` y el miedo duraría cada vez menos.
    const plantilla = { kind: 'attack' as const, amount: -2, source: 'fear', roundsLeft: 2 };
    const a = stackOf(NO_MUERTO, 10);
    applyEffect(a, plantilla);
    tickEffects(a);
    expect(plantilla.roundsLeft).toBe(2);

    const b = stackOf(NO_MUERTO, 10);
    applyEffect(b, plantilla);
    expect(b.effects[0]!.roundsLeft).toBe(2);
  });
});

describe('rasgos de criatura (#8)', () => {
  it('fear: quien asusta (el dragón óseo de antes) asusta a los no-muertos, que es donde la moral no llega', () => {
    // Espejo no-muerto: con el aura de moral del original esto no haría NADA,
    // porque `createBattle` fuerza `morale: 0` a todo lo no-muerto.
    const rng = createRng(61);
    const state = conCifrasAMano(
      createBattle(
        side([{ creature: NO_MUERTO, count: 2 }]),
        side([{ creature: NO_MUERTO, count: 40 }]),
        rng,
        COMBATE_COMPLETO,
      ),
      'attacker-0',
      con(NO_MUERTO, 'fear'),
    );
    const asusta = stackById(state, 'attacker-0');
    const esqueleto = stackById(state, 'defender-0');
    enfrentar(asusta, esqueleto);

    expect(effectiveAttack(esqueleto)).toBe(unidadDelJuego(NO_MUERTO).attack);
    aplicar(state, { type: 'attack', target: 'defender-0' }, rng);

    expect(
      esqueleto.effects.some((e) => e.source === 'fear' && e.kind === 'attack' && e.amount === -2),
    ).toBe(true);
    expect(effectiveAttack(esqueleto)).toBe(unidadDelJuego(NO_MUERTO).attack - 2);
    expect(
      state.log.some((e) => e.kind === 'effect' && e.source === 'fear' && e.effect === 'attack'),
    ).toBe(true);

    // Y el miedo se nota en el golpe: mismo dado, menos daño.
    const conMiedo = computeDamage(esqueleto, asusta, createRng(5), {});
    const sinMiedo = computeDamage({ ...esqueleto, effects: [] }, asusta, createRng(5), {});
    expect(conMiedo.damage).toBeLessThan(sinMiedo.damage);
  });
});

describe('el libro de hechizos del jugador (#4)', () => {
  /**
   * Una sesión con una batalla en curso, montada con la misma `createBattle`
   * que usa `startBattle`. Interesa el panel de hechizos, no el paseo por el
   * mapa hasta topar con el monstruo.
   */
  function sesionEnBatalla(semilla: number, over: Partial<BattleHero>) {
    const session = new Session(semilla);
    const heroe = hero(over);
    const battle = createBattle(
      side([{ creature: JINETE, count: 10 }], heroe),
      side([{ creature: NO_MUERTO, count: 10 }]),
      session.ctx.rng,
      COMBATE_COMPLETO,
    );
    // El rival es un monstruo REAL del mapa. Con un id inventado la batalla se
    // juega igual mientras nadie la cierre, y el primer test que llamara a
    // `finishBattle()` se estrellaría contra "monstruo no encontrado": un fallo
    // del andamio con toda la pinta de ser del núcleo.
    session.state.pendingBattle = {
      attacker: { kind: 'hero', heroId: session.myHeroes()[0]!.id },
      foe: { kind: 'monster', objectId: monstruoVivo(session.state).id },
      battle,
    };
    session.scene = 'battle';
    return { session, heroe, battle };
  }

  it('lo lanzable se ancla en el hecho: con maná sí, sin maná no', () => {
    const { session, heroe } = sesionEnBatalla(61, { spells: ['magic_arrow'], mana: 30 });
    const opciones = session.spellOptions();
    expect(opciones.map((o) => o.id)).toEqual(['magic_arrow']);

    // La Flecha mágica se puede lanzar sobre el único enemigo que hay.
    const flecha = opciones.find((o) => o.id === 'magic_arrow')!;
    expect(flecha.castable).toBe(true);
    expect(flecha.targets).toEqual(['defender-0']);
    expect(flecha.motivo).toBe('');

    // Y sin maná deja de ser lanzable: `castable` sigue al estado, no es un sí
    // fijo por estar en el libro.
    heroe.mana = 0;
    expect(session.spellOptions().find((o) => o.id === 'magic_arrow')!.castable).toBe(false);
  });

  it('volver a pulsar el hechizo elegido lo suelta', () => {
    const { session } = sesionEnBatalla(64, { spells: ['magic_arrow'], mana: 20 });
    session.hechizos.selectSpell('magic_arrow');
    session.hechizos.selectSpell('magic_arrow');
    expect(session.hechizos.selectedSpell).toBeNull();
    expect(session.hechizos.castTargets()).toEqual([]);
  });
});

/**
 * La escena de #50, con sus seis casillas ya contadas.
 *
 * Atacante en (0,4) y zombi en (3,4): las seis vecinas del zombi cuestan
 * 2, 3, 3, 4, 4 y 5 pasos, y la de coste 5 —(4,4), la de detrás— hay que
 * rodearla porque el zombi tapa el camino recto. Con eso el tablero ofrece a la
 * vez el tope de carga (+50 % a los 5 hexes) y una casilla barata que no carga
 * nada, que es exactamente la disyuntiva que #50 decide.
 */
/**
 * El jinete de `state` con las 7 casillas que tenía antes de pesar su barda
 * (25-10-2026: con fuerza y agilidad anda 6): la geometría de estas escenas es de
 * ellas.
 */
function conSieteCasillas(state: BattleState, id = 'attacker-0'): BattleState {
  const s = stackById(state, id) as { unit: UnitInfo };
  s.unit = { ...s.unit, speed: 'ultra_fast' };
  return state;
}

describe('la IA lanza hechizos (#24)', () => {
  it('sin maná no lo intenta', () => {
    const rng = createRng(72);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 0, spellPower: 1 });
    const state = createBattle(
      side([{ creature: JINETE, count: 10 }], lanzador),
      side([{ creature: NO_MUERTO, count: 10 }]),
      rng,
      COMBATE_COMPLETO,
    );
    expect(chooseBattleAction(state).type).not.toBe('cast');
    expect(lanzador.mana).toBe(0);
  });
});

describe('la IA cierra el turno en vez de plantarse (#24)', () => {
  it('cierra el turno cuando no alcanza a nadie ni puede moverse', () => {
    const rng = createRng(74);
    const state = createBattle(
      side([
        { creature: JINETE, count: 5 },
        { creature: TROPA_BARATA, count: 5 },
        { creature: TROPA_BARATA, count: 5 },
      ]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      rng,
      COMBATE_COMPLETO,
    );
    // El campeón queda embotellado en la esquina por los suyos: (0,0) solo
    // tiene dos vecinos dentro del tablero y los dos están ocupados.
    stackById(state, 'attacker-0').hex = { col: 0, row: 0 };
    stackById(state, 'attacker-1').hex = { col: 1, row: 0 };
    stackById(state, 'attacker-2').hex = { col: 0, row: 1 };
    stackById(state, 'defender-0').hex = { col: 10, row: 8 };

    expect(state.turno?.stack).toBe('attacker-0');
    expect(movableHexes(state, stackById(state, 'attacker-0'))).toEqual([]);

    // Antes esto era un `defend` (y antes un `wait`): sin las dos jugadas,
    // retiradas el 26-10-2026, la cola terminal es `end_turn`.
    expect(chooseBattleAction(state)).toEqual({ type: 'end_turn' });
  });
});

/**
 * El parte de guerra, que es lo que lee la persona durante la batalla.
 *
 * Con los eventos puestos a mano, igual que la crónica del mapa en
 * `cronica.test.ts`: lo que se afirma aquí es el COLOR, y hacen falta los
 * casos —moral alta y baja, el efecto que suma y el que
 * resta, y el final ganado y perdido— que ninguna semilla da juntos.
 *
 * Y hacía falta: `renderBattleLog` no tenía ni una línea de test, y sus cuatro
 * ternarios `win`/`lose` escritos a mano se cambiaron por el helper `clase()`
 * sin nada que lo comprobara. El bando de quien lo lee lo DERIVA la sesión del
 * dueño de la batalla, así que aquí el atacante es el jugador.
 */
/**
 * Dos stacks, uno por bando, puestos a mano y con el turno abierto del atacante.
 * El activo se fija y no se sortea: la iniciativa no es lo que se mide aquí.
 */
function duelo(
  atacante: string,
  en: Hex,
  defensor: string | BattleSide,
  enDefensor: Hex,
  n = 5,
): BattleState {
  const state = createBattle(
    side([{ creature: atacante, count: n }]),
    typeof defensor === 'string' ? side([{ creature: defensor, count: n }]) : defensor,
    createRng(3),
    COMBATE_COMPLETO,
  );
  stackById(state, 'attacker-0').hex = en;
  stackById(state, 'defender-0').hex = enDefensor;
  forzarTurno(state, 'attacker-0');
  return state;
}

describe('el turno en tramos (2026-10-02)', () => {
  it('por qué no se puede actuar contra un enemigo lo dice el núcleo', () => {
    // A quien no tira no se le habla de disparar. (El caso del tirador movido se
    // fue con el disparo diferido, que va sin tests: 25-10-2026.)
    const lejos = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    expect(ataqueBlocker(lejos, 'defender-0')).toBe(
      'no alcanza a esa unidad cuerpo a cuerpo este turno',
    );
    const cerca = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 4,
      row: 4,
    });
    expect(ataqueBlocker(cerca, 'defender-0')).toBeNull();
    expect(ataqueBlocker(cerca, 'attacker-0')).toBe('no se puede atacar a un aliado');
  });

  it('un recorrido de antes del tramo se rechaza: el mismo stack, otro presupuesto', () => {
    // El recorrido traído es una pista de rendimiento; con tramos, uno calculado
    // antes de moverse dejaría ir más lejos de lo que queda.
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    const turno = state.turno as TurnoDeUnidad;
    const n = turno.n;
    const viejo = {
      firma: firmaDelTurno(turno, state.golpeEnCurso),
      puertas: '',
      costs: movableFrom(state, s),
    };
    aplicar(state, { type: 'move', to: { col: 1, row: 4 } }, createRng(1));
    expect(() =>
      aplicar(state, { type: 'move', to: { col: 5, row: 4 } }, createRng(1), viejo),
    ).toThrow(
      `el recorrido que traes es del turno ${n} con 0 casillas gastadas, y ahora le toca a attacker-0 en el turno ${n} con 1 casilla gastada`,
    );
  });

  it('`end_turn` se ofrece siempre, la última, y sin moverse cierra igual', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    expect(legalActions(state).at(-1)).toEqual({ type: 'end_turn' });
    aplicar(state, { type: 'end_turn' }, createRng(1));
    expect(stackById(state, 'attacker-0').acted).toBe(true);
  });
});

/** La carga del golpe (no del contraataque) del registro, o 0 si no cargó. */
function cargaCobrada(state: BattleState): number {
  const golpe = state.log.find((e) => e.kind === 'attack' && !e.retaliation);
  if (golpe === undefined || golpe.kind !== 'attack') throw new Error('no hubo golpe');
  return golpe.charge ?? 0;
}

describe('la carga en línea recta (decisión del usuario, 02-10-2026)', () => {
  it('una casilla a la que solo se llega con rodeo no carga, por muchos pasos que cueste', () => {
    // (5,5) está a 6 casillas —con la regla vieja, el tope—, cuesta 7 con el
    // contacto, y no está en recta.
    const state = conSieteCasillas(
      duelo(JINETE, { col: 0, row: 4 }, TROPA, {
        col: 5,
        row: 4,
      }),
    );
    expect(movableFrom(state, stackById(state, 'attacker-0')).get('5,5')?.steps).toBe(7);
    aplicar(
      state,
      { type: 'attack', target: 'defender-0', from: { col: 5, row: 5 } },
      createRng(1),
    );
    expect(cargaCobrada(state)).toBe(0);
  });

  it('una unidad en medio de la recta la corta, aunque se llegue rodeándola', () => {
    const state = createBattle(
      side([{ creature: JINETE, count: 5 }]),
      side([
        { creature: TROPA, count: 5 },
        { creature: TROPA_BARATA, count: 5 },
      ]),
      createRng(3),
      COMBATE_COMPLETO,
    );
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(state, 'defender-0').hex = { col: 5, row: 4 };
    stackById(state, 'defender-1').hex = { col: 2, row: 4 };
    // El rodeo cuesta 6 con el contacto: con las 5 del caballo (31-10-2026) no llega.
    conSieteCasillas(state);
    forzarTurno(state, 'attacker-0');
    const s = stackById(state, 'attacker-0');
    // (4,4) se alcanza rodeando al campesino, pero la recta pasa por él.
    expect(movableFrom(state, s).has('4,4')).toBe(true);
    expect(cargaDesde(state, s, { col: 4, row: 4 }, stackById(state, 'defender-0'))).toBe(0);
    aplicar(
      state,
      { type: 'attack', target: 'defender-0', from: { col: 4, row: 4 } },
      createRng(1),
    );
    expect(cargaCobrada(state)).toBe(0);
  });

  it('lo que se anuncia es lo que se cobra: `casillasDeCarga` contra el golpe, casilla a casilla', () => {
    // Un tablero con cuatro enemigos y rectas cortadas, para que haya de todo:
    // casillas que cargan, que no, y que cargan distinto.
    const montar = (): BattleState => {
      const st = createBattle(
        side([{ creature: JINETE, count: 5 }]),
        side([
          { creature: TROPA, count: 5 },
          { creature: TROPA_BARATA, count: 5 },
          { creature: TIRADOR, count: 5 },
          { creature: PESADA, count: 5 },
        ]),
        createRng(3),
        COMBATE_COMPLETO,
      );
      stackById(st, 'attacker-0').hex = { col: 2, row: 4 };
      stackById(st, 'defender-0').hex = { col: 6, row: 4 };
      stackById(st, 'defender-1').hex = { col: 4, row: 2 };
      stackById(st, 'defender-2').hex = { col: 3, row: 7 };
      stackById(st, 'defender-3').hex = { col: 7, row: 6 };
      forzarTurno(st, 'attacker-0');
      return st;
    };
    const base = montar();
    const anuncio = casillasDeCarga(base, stackById(base, 'attacker-0'));
    let conCarga = 0;
    let sinCarga = 0;
    for (const a of legalActions(base)) {
      if (a.type !== 'attack' || a.from === undefined) continue;
      const st = montar();
      aplicar(st, a, createRng(1));
      const cobrada = cargaCobrada(st);
      const anunciada = anuncio.filter(
        (c) => c.target === a.target && board.hexEquals(c.at, a.from as Hex),
      );
      expect(anunciada.length).toBeLessThanOrEqual(1);
      expect(cobrada, `contra ${a.target} desde (${a.from.col},${a.from.row})`).toBe(
        anunciada[0]?.hexes ?? 0,
      );
      if (cobrada > 0) conCarga++;
      else sinCarga++;
    }
    expect(conCarga).toBeGreaterThan(0);
    expect(sinCarga).toBeGreaterThan(0);
  });

  it('sin el rasgo carga a pie, y se anuncia con sus cifras (#260; en toda batalla desde el 19-10-2026)', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 4,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    expect(casillasDeCarga(state, s)).toEqual([
      {
        target: 'defender-0',
        at: { col: 3, row: 4 },
        hexes: 3,
        porciento: 3 * CARGA.porcentaje,
      },
    ]);
    expect(cargaDesde(state, s, { col: 3, row: 4 }, stackById(state, 'defender-0'))).toBe(3);
  });

  // H1 de QA, decisión del usuario: «el enemigo tiene que estar en la línea
  // recta, no se puede cargar contra un enemigo que esté al lado».
  it('una recta que llega y gira para pegar al de al lado no carga, aunque la casilla esté en recta', () => {
    // (3,4) está en la recta E a 3 casillas, pero lo que sigue es (4,4), vacía;
    // el piquero está en (3,3), la vecina de arriba.
    const state = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 3,
      row: 3,
    });
    const s = stackById(state, 'attacker-0');
    const giro = { type: 'attack', target: 'defender-0', from: { col: 3, row: 4 } } as const;
    expect(legalActions(state)).toContainEqual(giro);
    expect(cargaDesde(state, s, giro.from, stackById(state, 'defender-0'))).toBe(0);
    expect(casillasDeCarga(state, s).some((c) => board.hexEquals(c.at, giro.from))).toBe(false);
    aplicar(state, giro, createRng(1));
    expect(cargaCobrada(state)).toBe(0);
  });

  it('a un enemigo pegado de salida no se le carga: ni quieto ni alejándose para volver', () => {
    const state = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 1,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    expect(casillasDeCarga(state, s)).toEqual([]);
    aplicar(state, { type: 'attack', target: 'defender-0' }, createRng(1));
    expect(cargaCobrada(state)).toBe(0);
  });
});

describe('el parte de guerra pinta de quién es cada cosa', () => {
  /** Los nombres de los dos bandos del parte: el jinete atacante y el no-muerto. */
  const NOMBRE_A = unidadDelJuego(JINETE).name;
  const NOMBRE_B = unidadDelJuego(NO_MUERTO).name;

  /**
   * `deQuien` elige a quién pertenece el héroe atacante, que es de donde
   * `session.miBando` deriva el bando de quien lee: `'mio'` deja al jugador de
   * atacante y `'ajena'` monta una batalla del rival contra un monstruo, en la
   * que la persona no lleva ninguno de los dos bandos.
   */
  function parte(eventos: BattleEvent[], deQuien: 'mio' | 'ajena' = 'mio'): string {
    const session = new Session(71);
    const battle = createBattle(
      side([{ creature: JINETE, count: 10 }], hero()),
      side([{ creature: NO_MUERTO, count: 10 }]),
      session.ctx.rng,
      COMBATE_COMPLETO,
    );
    // El registro del despliegue estorba: lo que se mira son estas líneas.
    battle.log.length = 0;
    battle.log.push(...eventos);
    const atacante =
      deQuien === 'mio'
        ? session.myHeroes()[0]!
        : session.state.heroes.find((h) => h.owner !== session.viewer)!;
    session.state.pendingBattle = {
      attacker: { kind: 'hero', heroId: atacante.id },
      foe: { kind: 'monster', objectId: monstruoVivo(session.state).id },
      battle,
    };
    session.scene = 'battle';
    return marcadoDe(renderSide(session));
  }

  it('el final se pinta desde el bando de quien lee, no desde el atacante', () => {
    // Es el mismo error que el ciclo de #29 le quitó al servidor: dar por hecho
    // que quien lee es el atacante le canta «Victoria» a quien acaba de perder.
    expect(parte([{ kind: 'finished', winner: 'attacker' }])).toContain(
      '<div class="win">Fin: gana el atacante</div>',
    );
    expect(parte([{ kind: 'finished', winner: 'defender' }])).toContain(
      '<div class="lose">Fin: gana el defensor</div>',
    );
  });

  it('una unidad aniquilada se pinta por su bando, no siempre como derrota', () => {
    // Salía SIEMPRE en `lose`, y la mitad de las veces la que caía era del
    // rival: a la persona se le pintaba de derrota su mejor jugada. Es la misma
    // misatribución que el ciclo de #59 le quitó a `hero_defeated` en la crónica
    // del mapa, veinte líneas más arriba en el mismo fichero.
    expect(parte([{ kind: 'perished', stack: 'attacker-0' }])).toContain(
      `<div class="lose">Aniquilada la unidad ${NOMBRE_A}, de tu bando</div>`,
    );
    expect(parte([{ kind: 'perished', stack: 'defender-0' }])).toContain(
      `<div class="win">Aniquilada la unidad ${NOMBRE_B}, del enemigo</div>`,
    );
  });

  it('en una batalla ajena no se pinta de nadie: ni victoria ni derrota', () => {
    // Sin bando propio no hay «tuya» ni «enemiga» que valga, y tampoco color:
    // inventarse uno es lo que hacía la versión de antes con todo el mundo.
    const ajena = parte([{ kind: 'perished', stack: 'attacker-0' }], 'ajena');
    expect(ajena).toContain(`<div>Aniquilada la unidad ${NOMBRE_A}, del atacante</div>`);
    expect(ajena).not.toContain('class="lose"');
    expect(ajena).not.toContain('class="win"');
  });

  it('el movimiento no deja rastro en el parte, y ya no cae por un `default`', () => {
    // `move` está escrito con su frase vacía. El `default` que lo tapaba tapaba
    // igual al `kind` que se añada mañana; quien lo impide ahora es el `never`
    // del final, roto a mano y visto rojo en `tsc`. `wait` y `defend` callaban
    // aquí también hasta #82: su línea la cubre `parte-de-guerra.test.ts`.
    const mudos = parte([
      { kind: 'move', stack: 'attacker-0', to: { col: 3, row: 3 }, path: [{ col: 3, row: 3 }] },
    ]);
    expect(mudos).toContain(
      '<h3>Parte de guerra</h3><div class="log" data-al-final="parte"></div>',
    );
  });

  it('una línea sin color no lleva un `class` vacío colgando', () => {
    // `clase()` devuelve el atributo ENTERO o nada, en vez de rellenar un
    // `class="…"` que ya estaba escrito. Por eso el parte de quien no lleva
    // ninguno de los dos bandos deja de emitir `<div class="">` en su línea
    // de final, que es lo único que este cambio movió en pantalla.
    expect(parte([{ kind: 'round_start', round: 2 }])).toContain('<div>— Ronda 2 —</div>');
    expect(parte([{ kind: 'round_start', round: 2 }])).not.toContain('class=""');
  });
});

describe('el héroe ya no bonifica a su tropa (fase 1b)', () => {
  it('el mismo golpe pega lo mismo con un héroe de ataque 0 que con uno de 40', () => {
    // Hasta la 1b `effectiveAttack` sumaba `hero.attack` a cada criatura. Ahora
    // el héroe pelea con su cuerpo (decisión del usuario: «solo su cuerpo»), y
    // su ataque es el de ese cuerpo, no el de sus piqueros.
    const golpe = (ataqueDelHeroe: number): number => {
      const rng = createRng(90);
      const cuerpo = heroUnit({
        name: 'Prueba',
        attack: ataqueDelHeroe,
        defense: 0,
        experience: umbral(5),
        equipo: {},
      });
      const state = createBattle(
        side([{ creature: TROPA, count: 1 }], hero(), cuerpo),
        side([{ creature: TROPA_BARATA, count: 1 }]),
        rng,
        COMBATE_COMPLETO,
      );
      const piquero = stackById(state, 'attacker-0');
      const campesino = stackById(state, 'defender-0');
      enfrentar(piquero, campesino);
      // Por el motor entero y no por `computeDamage`, que ya ni recibe al héroe:
      // lo que se mira es que nadie se lo sume por otro camino. El turno, a mano:
      // el héroe es más rápido que su tropa.
      forzarTurno(state, 'attacker-0');
      aplicar(state, { type: 'attack', target: 'defender-0' }, rng);
      const ev = state.log.find((e) => e.kind === 'attack' && e.stack === 'attacker-0');
      if (ev === undefined || ev.kind !== 'attack') throw new Error('el piquero no pegó');
      return ev.damage;
    };
    expect(golpe(40)).toBe(golpe(0));
    // Y el cuerpo sí lo lleva: es su propia ficha.
    expect(
      heroUnit({ name: 'X', attack: 40, defense: 0, experience: umbral(5), equipo: {} }).attack,
    ).toBe(40);
  });
});

describe('despliegue de una tropa de individuos', () => {
  /** `n` individuos de esa criatura, cada uno un stack de 1: lo que manda la partida. */
  const individuos = (creatureId: string, n: number): Stack[] =>
    Array.from({ length: n }, () => ({ creature: creatureId, count: 1 }));

  /** Todos los hexes que pisa un bando, sin repetir: si se repite alguno, se solapan. */
  function hexesDe(state: BattleState, lado: 'attacker' | 'defender'): string[] {
    return state.stacks
      .filter((s) => s.side === lado)
      .flatMap((s) => stackHexes(s).map((h) => `${h.col},${h.row}`));
  }

  it('siete individuos por bando, sin que dos pisen el mismo hex', () => {
    // Antes del sexto todo iba bien; del sexto en adelante caían todos a la
    // fila 4 de la columna del borde, unos encima de otros, sin aviso.
    const state = createBattle(
      side(individuos(TROPA_BARATA, 7)),
      side(individuos(NO_MUERTO, 7)),
      createRng(1),
      COMBATE_COMPLETO,
    );
    for (const lado of ['attacker', 'defender'] as const) {
      const hexes = hexesDe(state, lado);
      expect(hexes).toHaveLength(7);
      expect(new Set(hexes).size).toBe(7);
    }
    // Cada bando en sus tres columnas: el atacante a la izquierda, el defensor
    // a la derecha. Ni uno dentro del campo del otro.
    for (const s of state.stacks) {
      const col = s.hex.col;
      if (s.side === 'attacker') expect(col).toBeLessThanOrEqual(2);
      else expect(col).toBeGreaterThanOrEqual(8);
    }
  });

  it('el octavo no cabe y se dice, nombrando el bando', () => {
    // La regla del usuario: un bando lleva como mucho 7 (un héroe y seis, o
    // siete sin héroe). Antes el tope era el del tablero, 27.
    expect(() =>
      createBattle(
        side(individuos(TROPA_BARATA, 8)),
        side(individuos(NO_MUERTO, 3)),
        createRng(1),
        COMBATE_COMPLETO,
      ),
    ).toThrow('no caben: el atacante trae 8 y un bando lleva como mucho 7');
    expect(() =>
      createBattle(
        side(individuos(TROPA_BARATA, 3)),
        side(individuos(NO_MUERTO, 9)),
        createRng(1),
        COMBATE_COMPLETO,
      ),
    ).toThrow('no caben: el defensor trae 9 y un bando lleva como mucho 7');
  });

  it('pocos individuos salen por la misma regla que muchos', () => {
    // No hay caso especial para cinco o menos: del centro hacia fuera en la
    // columna del borde. Con las filas de HoMM2 de antes, estos cinco salían en
    // 0, 2, 4, 6 y 8.
    const state = createBattle(
      side(individuos(TROPA_BARATA, 5)),
      side(individuos(NO_MUERTO, 1)),
      createRng(3),
      COMBATE_COMPLETO,
    );
    const atacantes = state.stacks.filter((s) => s.side === 'attacker');
    expect(atacantes.map((s) => s.hex)).toEqual([4, 3, 5, 2, 6].map((row) => ({ col: 0, row })));
  });

  it('con el mismo ejército en los dos lados, el defensor sale en el espejo exacto del atacante', () => {
    // El tablero de filas de 12 y 11 es su propio espejo (11-10-2026): con 11
    // en todas las filas, el defensor de una fila impar salía media casilla más
    // cerca del centro que el atacante de la suya.
    const ejercitos: BattleSide[] = [
      side(individuos(TROPA_BARATA, 7)),
      side([...individuos(PESADA, 3), ...individuos(NO_MUERTO, 4)]),
      side([
        { creature: JINETE, count: 4 },
        { creature: TIRADOR, count: 9 },
      ]),
    ];
    // Las casillas de un stack dadas la vuelta, en el orden de las claves.
    const huellaEspejada = (s: BattleStack) =>
      stackHexes(s)
        .map((h) => board.hexKey(board.espejo(h)))
        .sort();
    const huella = (s: BattleStack) => stackHexes(s).map(board.hexKey).sort();
    for (const ejercito of ejercitos) {
      const state = createBattle(ejercito, ejercito, createRng(5), COMBATE_COMPLETO);
      const del = (lado: Side) => state.stacks.filter((s) => s.side === lado);
      const atacantes = del('attacker');
      const defensores = del('defender');
      expect(defensores).toHaveLength(atacantes.length);
      atacantes.forEach((a, i) => {
        const d = defensores[i] as BattleStack;
        expect(d.hex).toEqual(board.espejo(a.hex));
        expect(huella(d)).toEqual(huellaEspejada(a));
      });
    }
    // Y con una muralla que es su propio espejo: muros y una puerta en la salida
    // de los dos lados, que se saltan en los dos bandos por igual.
    const muros = [
      { col: 2, row: 3 },
      { col: 0, row: 6 },
      { col: 1, row: 2 },
    ];
    const espejada = muralla(
      [...muros, ...muros.map(board.espejo)],
      [
        { a: { col: 0, row: 3 }, b: { col: 1, row: 3 } },
        { a: board.espejo({ col: 1, row: 3 }), b: board.espejo({ col: 0, row: 3 }) },
      ],
    );
    const ejercito = side(individuos(NO_MUERTO, 7));
    const state = createBattle(ejercito, ejercito, createRng(5), COMBATE_COMPLETO, espejada);
    const atacantes = state.stacks.filter((s) => s.side === 'attacker');
    const defensores = state.stacks.filter((s) => s.side === 'defender');
    atacantes.forEach((a, i) => {
      expect(huella(defensores[i] as BattleStack)).toEqual(huellaEspejada(a));
    });
  });

  it('una batalla de muchos individuos se juega hasta el final', () => {
    const rng = createRng(4);
    const state = createBattle(
      side([...individuos(TROPA, 4), ...individuos(TIRADOR, 3)]),
      side(individuos(NO_MUERTO, 7)),
      rng,
      COMBATE_COMPLETO,
    );
    simular(state, rng);
    expect(state.finished).not.toBeNull();
  });
});

/**
 * Juega un duelo 1 contra 1 entero con la IA de reglas decidiendo por los dos
 * lados, en (3,4) contra (7,4), que los deja a tiro en la primera ronda (las
 * casillas de salida de `CharacterTrial`, de la rama de archivo `gpt-rpg`).
 *
 * El bucle es a mano y no `autoResolve` a propósito: así se ve que
 * `chooseBattleAction` decide por los DOS bandos, y el cierre por tope se
 * distingue del cierre por muerte. Si salta cualquiera de los dos topes, lanza
 * diciendo cuál: el de `MAX_ROUNDS` y el de acciones, porque un bucle de acciones
 * que no avanza de ronda también se colgaría.
 */
function dueloEntero(atacante: BattleSide, defensor: BattleSide, semilla: number): BattleState {
  const rng = createRng(semilla);
  const batalla = createBattle(atacante, defensor, rng, COMBATE_COMPLETO);
  batalla.stacks[0]!.hex = { col: 3, row: 4 };
  batalla.stacks[1]!.hex = { col: 7, row: 4 };
  for (let acciones = 0; batalla.finished === null; acciones++) {
    if (acciones > 1000) {
      throw new Error(`el duelo no termina: 1000 acciones y va por la ronda ${batalla.round}`);
    }
    aCiegas(batalla, chooseBattleAction(batalla), rng);
  }
  if (batalla.round > MAX_ROUNDS) throw new Error('el duelo se cerró por el tope de rondas');
  return batalla;
}

const solo = (creature: string): BattleSide => ({
  army: [{ creature, count: 1 }],
  hero: null,
});

describe('duelo de individuos con el motor del núcleo', () => {
  it('un duelo 1 contra 1 se juega entero con la IA de reglas', () => {
    const batalla = dueloEntero(solo('templario-mandoble'), solo('zombi'), 91);
    // Uno de los dos cae: `dueloEntero` ya lanzó si se cerró por tope.
    const vivos = batalla.stacks.filter((s) => s.count > 0);
    expect(vivos).toHaveLength(1);
    expect(vivos[0]!.side).toBe(batalla.finished!.winner);
    // Hubo golpes de verdad y no solo esperas.
    expect(batalla.log.some((e) => e.kind === 'attack')).toBe(true);
  });
});

/**
 * Juega la batalla hasta el final (o hasta `maxTurnos`), con la rueda a ciegas
 * (`aCiegas`). Devuelve los turnos usados.
 */
function simular(state: BattleState, rng: Rng, maxTurnos = 3000): number {
  let n = 0;
  while (state.finished === null && n < maxTurnos) {
    aCiegas(state, agresiva(state), rng);
    n++;
  }
  return n;
}
