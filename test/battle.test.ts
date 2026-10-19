import { describe, expect, it, vi } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { Session } from '../src/client/session.js';
import { renderBattleLog, renderSide } from '../src/client/views/panels.js';
import { chooseBattleAction, chooseBattleActionAndCosts } from '../src/core/ai/tactics.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import {
  activeStack,
  applyAction,
  armyMorale,
  ataqueBlocker,
  type BattleSide,
  cargaDesde,
  casillasDeCarga,
  createBattle,
  enemiesOf,
  firmaDelTurno,
  isAlive,
  legalActions,
  legalActionsAndCosts,
  mismoTurno,
  movableFrom,
  movableHexes,
  pasosQueQuedan,
  seHaMovido,
  stackById,
  stackHexes,
  stackSpeed,
} from '../src/core/battle/battle.js';
import * as board from '../src/core/battle/board.js';
import { CARGA, CARGA_MINIMA, cargaEfectiva } from '../src/core/battle/carga.js';
import {
  computeDamage,
  damageMultiplier,
  effectiveAttack,
  herir,
  stackHp,
} from '../src/core/battle/damage.js';
import {
  applyEffect,
  effectiveLuck,
  effectTotal,
  tickEffects,
} from '../src/core/battle/effects.js';
import { validarMuralla } from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import type {
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
  TurnoDeUnidad,
} from '../src/core/battle/types.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { cuentaTiros } from '../src/core/data.js';
import { umbral } from '../src/core/hero/experiencia.js';
import { heroUnit } from '../src/core/hero/hero.js';
import type { Rng } from '../src/core/rng.js';
import { createRng } from '../src/core/rng.js';
import type { CreatureTrait, Hex, Stack, UnitInfo } from '../src/core/types.js';
import {
  aMano,
  bandoDePersonajes,
  conCifrasAMano,
  FACCION_B,
  forzarTurno,
  JINETE,
  monstruoVivo,
  NO_MUERTO,
  PESADA,
  simular,
  TIRADOR,
  TIRADOR_NO_MUERTO,
  TROPA,
  TROPA_BARATA,
} from './helpers.js';

/**
 * `reachable` es el BFS del tablero y `movableFrom` es su ÚNICO llamante, así
 * que contarle las llamadas cuenta exactamente los recorridos que hace
 * `legalActions`.
 *
 * Se envuelve el módulo en vez de espiar el export, y no por gusto: la llamada
 * de `movableFrom` va por el enlace local de su módulo, así que un
 * `vi.spyOn(board, 'reachable')` se quedaría mirando un objeto por el que no
 * pasa nadie y contaría cero pase lo que pase. El envoltorio llama al original,
 * de modo que ninguna otra prueba de este fichero cambia de comportamiento.
 */
vi.mock('../src/core/battle/board.js', async (original) => {
  const real = await original<typeof import('../src/core/battle/board.js')>();
  return { ...real, reachable: vi.fn(real.reachable) };
});

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
  hero: hero === null ? null : { mando: hero, cuerpo },
});

const hero = (over: Partial<BattleHero> = {}): BattleHero => ({
  name: 'Prueba',
  // Sin base a la que volver: un héroe de test no se rinde salvo que se diga.
  retreat: { blocked: 'no tienes base a la que volver' },
  ataque: 0,
  defensa: 0,
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
    origen: { kind: 'catalogo', oro: unidadDelJuego(id).cost.gold ?? 0, veterania: null },
    initialCount: count,
    count,
    topHp: unit.hp,
    hex: { col: 0, row: 0 },
    shotsLeft: 0,
    escalera: false,
    retaliated: false,
    defending: false,
    waited: false,
    acted: false,
    gotMoraleBonus: false,
    morale: 0,
    luck: 0,
    effects: [],
    ganado: { experiencia: 0, bajas: 0, heroes: [] },
  };
}

/**
 * El no-muerto lento y duro del catálogo (3 casillas, el doble de PV que la
 * tropa): un alcance que cabe en la vista y un blanco que aguanta un hechizo.
 */
const ZOMBI = 'zombi';

/** Las cifras de `base` con el rasgo `rasgo` además de los suyos: el catálogo no lo trae. */
function con(base: string, rasgo: CreatureTrait, cambios: Partial<UnitInfo> = {}): UnitInfo {
  return aMano(base, { ...cambios, traits: [...(unidadDelJuego(base).traits ?? []), rasgo] });
}

/**
 * Una unidad de dos casillas, hecha a mano (`hexes: 2`): ninguna del catálogo
 * lo es, y el despliegue y la carga las siguen jugando.
 */
const GRANDE = aMano(NO_MUERTO, { hexes: 2 });

/**
 * Un bando con `grandes` de dos casillas (cada uno como personaje,
 * `bandoDePersonajes`) seguidos de `resto`, del catálogo.
 */
function conGrandes(grandes: number, resto: readonly Stack[] = []): BattleSide {
  const b = bandoDePersonajes(Array.from({ length: grandes }, () => GRANDE));
  return { ...b, army: [...b.army, ...resto] };
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
    const killed = herir(s, llega + armaduraDe(s.unit), null).muertos;
    expect(killed).toBe(2);
    expect(s.count).toBe(8);
    expect(stackHp(s)).toBe(10 * hp - llega);
  });

  it('un daño menor que un efectivo no mata a nadie', () => {
    const s = stackOf(PESADA, 3);
    const llega = Math.floor(s.unit.hp / 2);
    expect(herir(s, llega + armaduraDe(s.unit), null).muertos).toBe(0);
    expect(s.count).toBe(3);
    expect(s.topHp).toBe(s.unit.hp - llega);
  });

  it('el exceso de daño no resucita ni deja restos', () => {
    const s = stackOf(TROPA_BARATA, 4);
    expect(herir(s, 9999, null).muertos).toBe(4);
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
    );
    const campesino = stackById(state, 'attacker-0');
    // Dos facciones y un no-muerto: 0 por la mezcla y −1 por él (#199).
    expect(campesino.morale).toBe(-1);
    herir(stackById(state, 'attacker-1'), 9999, null);
    // Una ronda entera a la defensiva, para pasar por el final de ronda y por
    // cada `advance`, que es donde se colaría un recálculo.
    const rng = createRng(1);
    while (state.round < 2) applyAction(state, { type: 'defend' }, rng);
    expect(state.finished).toBeNull();
    expect(campesino.morale).toBe(-1);
  });
});

describe('los que esperan vuelven por orden de llegada (#81, regla nuestra)', () => {
  /** Que espere todo el que tenga turno hasta que vuelva uno que ya esperó. */
  function esperanTodos(state: BattleState, rng: Rng): string[] {
    const orden: string[] = [];
    for (let s = activeStack(state); s !== null && !s.waited; s = activeStack(state)) {
      orden.push(s.id);
      applyAction(state, { type: 'wait' }, rng);
    }
    return orden;
  }

  /** Quién vuelve, en orden, cerrando cada turno a la defensiva. */
  function vuelven(state: BattleState, rng: Rng): string[] {
    const orden: string[] = [];
    const ronda = state.round;
    while (state.round === ronda && state.finished === null) {
      orden.push((activeStack(state) as BattleStack).id);
      applyAction(state, { type: 'defend' }, rng);
    }
    return orden;
  }

  function batalla(): BattleState {
    const state = createBattle(
      side([
        { creature: TROPA_BARATA, count: 5 },
        { creature: PESADA, count: 5 },
      ]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(1),
    );
    // Sin moral: un turno extra al defenderse metería a alguien dos veces.
    for (const s of state.stacks) s.morale = 0;
    return state;
  }

  it('no del más lento al más rápido: en el orden en que esperaron', () => {
    const state = batalla();
    const rng = createRng(1);
    const esperaron = esperanTodos(state, rng);
    expect(esperaron).toHaveLength(3);
    // Solo dice algo si de verdad son velocidades distintas.
    const v = esperaron.map((id) => stackSpeed(stackById(state, id)));
    expect(v[0]).toBeGreaterThan(v[2] as number);
    expect(vuelven(state, rng)).toEqual(esperaron);
  });

  it('ni del más rápido al más lento: una Prisa recibida mientras espera no lo adelanta', () => {
    const state = batalla();
    const rng = createRng(1);
    const esperaron = esperanTodos(state, rng);
    const ultimo = stackById(state, esperaron[2] as string);
    applyEffect(ultimo, { kind: 'speed', amount: 10, source: 'haste', roundsLeft: 3 });
    expect(stackSpeed(ultimo)).toBeGreaterThan(
      stackSpeed(stackById(state, esperaron[0] as string)),
    );
    expect(vuelven(state, rng)).toEqual(esperaron);
  });
});

describe('despliegue inicial', () => {
  it('coloca cada bando en su borde y respeta la cola de las unidades grandes', () => {
    const state = createBattle(
      side([{ creature: TROPA_BARATA, count: 10 }]),
      conGrandes(1),
      createRng(1),
    );
    expect(stackById(state, 'attacker-0').hex.col).toBe(0);
    // El grande ocupa 2 hexes: sale en la fila del medio (la 4, par) con la
    // cabeza en la 10 y la cola en la 11, el espejo de un grande atacante.
    expect(stackById(state, 'defender-0').hex).toEqual({ col: 10, row: 4 });
  });

  it('empieza en la ronda 1 con un stack activo', () => {
    const state = createBattle(
      side([{ creature: TIRADOR, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(7),
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
    );
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('en un empate de velocidad mueve el atacante', () => {
    const state = createBattle(
      side([{ creature: NO_MUERTO, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(3),
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
  });

  /** Quién tiene turno, en orden, hasta `rondas` rondas, cerrando cada uno a la defensiva. */
  function turnos(state: BattleState, rng: Rng, rondas: number): string[] {
    const orden: string[] = [];
    while (state.round <= rondas && state.finished === null) {
      orden.push((activeStack(state) as BattleStack).id);
      applyAction(state, { type: 'defend' }, rng);
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
    herir(stackById(state, 'defender-0'), 9999, null);
    applyAction(state, { type: 'defend' }, rng);
    expect(activeStack(state)!.id).toBe('defender-1');
  });

  it('el paralizado por la moral no cuenta como el último que actuó (#199)', () => {
    // En fheroes2, `_lastActiveUnitArmyColor` solo se apunta cuando la unidad
    // va a actuar de verdad; la moral baja va antes. El atacante 0 actuó, el
    // defensor 0 se queda quieto, y el empate siguiente sigue siendo del
    // defensor.
    const state = empatados(2, 2);
    stackById(state, 'defender-0').morale = -1;
    const rng: Rng = { ...createRng(1), chance: () => true };
    applyAction(state, { type: 'defend' }, rng);
    expect(state.log.at(-1)).toEqual({ kind: 'morale', stack: 'defender-0', good: false });
    expect(activeStack(state)!.id).toBe('defender-1');
  });

  it('la moral alta repite turno en el acto, sin pasar por el desempate (#199)', () => {
    const state = empatados(2, 2);
    stackById(state, 'attacker-0').morale = 1;
    const rng: Rng = { ...createRng(1), chance: () => true };
    applyAction(state, { type: 'defend' }, rng);
    expect(state.log.at(-1)).toEqual({ kind: 'morale', stack: 'attacker-0', good: true });
    expect(activeStack(state)!.id).toBe('attacker-0');
    // Y después, el empate es del defensor: el último que actuó fue un atacante.
    applyAction(state, { type: 'defend' }, rng);
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('una Prisa a media ronda no adelanta en la cola: la velocidad es la de empezar (fheroes2 sí lo haría; pendiente)', () => {
    const state = empatados(2, 2);
    applyEffect(stackById(state, 'attacker-1'), {
      kind: 'speed',
      amount: 10,
      source: 'haste',
      roundsLeft: 3,
    });
    applyAction(state, { type: 'defend' }, createRng(1));
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('los hechizos de velocidad cambian el orden', () => {
    const state = createBattle(
      side([{ creature: NO_MUERTO, count: 5 }]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      createRng(3),
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
    );
    simular(state, rng);

    // El log se recorre por rondas: entre dos 'round_start', cada stack puede
    // aparecer como contraatacante una sola vez.
    let contraestaRonda = new Set<string>();
    for (const evento of state.log) {
      if (evento.kind === 'round_start') contraestaRonda = new Set();
      if (evento.kind === 'attack' && evento.retaliation) {
        expect(contraestaRonda.has(evento.stack)).toBe(false);
        contraestaRonda.add(evento.stack);
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

describe('tiradores', () => {
  /**
   * Un tirador con munición: ninguna unidad del catálogo la lleva (tiran con su
   * arma, sin contar tiros), pero el motor la sigue contando para el perfil de un
   * personaje (el guardabosques), así que va hecho a mano.
   */
  const conMunicion = (rng: Rng): BattleState =>
    conCifrasAMano(
      createBattle(
        side([{ creature: TIRADOR, count: 10 }]),
        side([{ creature: NO_MUERTO, count: 10 }]),
        rng,
      ),
      'attacker-0',
      aMano(TIRADOR, { shots: 12 }),
    );

  it('gastan munición al disparar y no pueden hacerlo con un enemigo encima', () => {
    const rng = createRng(21);
    const state = conMunicion(rng);
    const arquero = stackById(state, 'attacker-0');
    const municionInicial = arquero.shotsLeft;
    const disparo = legalActions(state).find((a) => a.type === 'shoot');
    expect(disparo).toBeDefined();
    applyAction(state, disparo!, rng);
    expect(arquero.shotsLeft).toBe(municionInicial - 1);
    expect(state.log.some((e) => e.kind === 'shoot')).toBe(true);
  });

  it('sin munición no se le ofrece el disparo, y el motivo lo dice (la del personaje se cuenta)', () => {
    // La arena y el catálogo no cuentan tiros (13-10-2026), pero quien lleva
    // munición sí: `cuentaTiros`.
    const rng = createRng(21);
    const state = conMunicion(rng);
    expect(cuentaTiros(unidadDelJuego(TIRADOR))).toBe(false);
    const arquero = stackById(state, 'attacker-0');
    expect(cuentaTiros(arquero.unit)).toBe(true);
    arquero.shotsLeft = 0;
    expect(legalActions(state).some((a) => a.type === 'shoot')).toBe(false);
    expect(() => applyAction(state, { type: 'shoot', target: 'defender-0' }, rng)).toThrow(
      'attacker-0 se ha quedado sin munición',
    );
  });
});

describe('hechizos', () => {
  it('la flecha mágica gasta maná y daña al enemigo', () => {
    const rng = createRng(31);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 10, spellPower: 3 });
    const state = createBattle(
      side([{ creature: JINETE, count: 10 }], lanzador),
      side([{ creature: NO_MUERTO, count: 10 }]),
      rng,
    );
    const objetivo = stackById(state, 'defender-0');
    const vidaPrevia = stackHp(objetivo);

    const conjuro = legalActions(state).find((a) => a.type === 'cast');
    expect(conjuro).toBeDefined();
    applyAction(state, conjuro!, rng);

    expect(lanzador.mana).toBe(7);
    expect(stackHp(objetivo)).toBeLessThan(vidaPrevia);
    expect(lanzador.castThisRound).toBe(true);
  });

  it('el héroe no puede lanzar dos hechizos en la misma ronda', () => {
    const rng = createRng(32);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 30 });
    const state = createBattle(
      side([{ creature: JINETE, count: 10 }], lanzador),
      side([{ creature: NO_MUERTO, count: 10 }]),
      rng,
    );
    applyAction(state, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' }, rng);
    expect(() =>
      applyAction(state, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' }, rng),
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
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
    expect(() => applyAction(state, { type: 'move', to: { col: 10, row: 8 } }, rng)).toThrow();
    expect(() => applyAction(state, { type: 'attack', target: 'defender-0' }, rng)).toThrow();
    expect(() => applyAction(state, { type: 'shoot', target: 'defender-0' }, rng)).toThrow(
      /no es tirador/,
    );
  });
});

/**
 * Batalla fija para mirar `legalActions` con lupa: un zombi —lento, así que su
 * alcance cabe en la vista— pegado al arquero, con CUATRO enemigos delante.
 *
 * El activo se fija a mano porque `turno` es un campo y no una tirada: si la
 * lista dependiera de quién gana la iniciativa, el día que cambie un desempate
 * este test diría que se rompió `legalActions`.
 */
function batallaDeCuatroEnemigos(): BattleState {
  const state = createBattle(
    side([{ creature: ZOMBI, count: 5 }]),
    side([
      { creature: TROPA_BARATA, count: 6 },
      { creature: TIRADOR, count: 4 },
      { creature: TROPA, count: 3 },
      { creature: JINETE, count: 2 },
    ]),
    createRng(7),
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

    const espia = vi.mocked(board.reachable);
    espia.mockClear();
    legalActions(state);
    // Con el BFS dentro del bucle de ataques eran 1 + 4 = 5.
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('devuelve exactamente la misma lista, en el mismo orden', () => {
    // Golden tomado del código de ANTES de izar el BFS. De este orden cuelgan
    // los desempates de la IA —`chooseBattleAction` se queda con el primero de
    // varios empatados—, así que reordenarlo cambia partidas enteras aunque el
    // conjunto sea idéntico. Por eso se compara con `toEqual` sobre el array y
    // no con `expect.arrayContaining`.
    //
    // Re-anclado UNA vez, a propósito, al quedar un solo despliegue (fase 1a):
    // los cuatro defensores salen ahora en la columna 10, filas 4, 3, 5 y 2 —del
    // centro hacia fuera— en vez de 0, 2, 4, 6 de las filas de HoMM2. Cambian
    // las casillas libres y los ataques posibles; el orden en que se listan es
    // la misma regla de antes, y por eso este test sigue diciendo algo.
    //
    // Y otra vez con el tablero de filas de 12 y 11 (11-10-2026): los
    // defensores de las filas pares salen en la columna 11 —(11,4) y (11,2)— y
    // los de las impares en la 10, así que (10,4), (10,2) y (10,1) quedan libres.
    expect(legalActions(batallaDeCuatroEnemigos())).toEqual([
      { type: 'defend' },
      { type: 'wait' },
      { type: 'move', to: { col: 9, row: 4 } },
      { type: 'move', to: { col: 10, row: 4 } },
      { type: 'move', to: { col: 8, row: 3 } },
      { type: 'move', to: { col: 9, row: 2 } },
      { type: 'move', to: { col: 10, row: 2 } },
      { type: 'move', to: { col: 8, row: 5 } },
      { type: 'move', to: { col: 9, row: 5 } },
      { type: 'move', to: { col: 8, row: 4 } },
      { type: 'move', to: { col: 7, row: 3 } },
      { type: 'move', to: { col: 8, row: 2 } },
      { type: 'move', to: { col: 8, row: 1 } },
      { type: 'move', to: { col: 9, row: 1 } },
      { type: 'move', to: { col: 10, row: 1 } },
      { type: 'attack', target: 'defender-0', from: { col: 10, row: 4 } },
      { type: 'attack', target: 'defender-1' },
      { type: 'attack', target: 'defender-1', from: { col: 10, row: 4 } },
      { type: 'attack', target: 'defender-1', from: { col: 10, row: 2 } },
      { type: 'attack', target: 'defender-2', from: { col: 10, row: 4 } },
      { type: 'attack', target: 'defender-2', from: { col: 9, row: 5 } },
      { type: 'attack', target: 'defender-3', from: { col: 10, row: 2 } },
      { type: 'attack', target: 'defender-3', from: { col: 10, row: 1 } },
      // Al final, siempre: con el turno en tramos (2026-10-02) cerrar a mano es
      // una acción más, y al final no mueve lo que encuentra un `find` de la IA.
      { type: 'end_turn' },
    ]);
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

    const espia = vi.mocked(board.reachable);
    espia.mockClear();
    const { action, movibles } = chooseBattleActionAndCosts(state);
    // Si la IA dejara de avanzar en este tablero, el test dejaría de medir lo
    // que dice medir y hay que buscarle otro.
    expect(action.type).toBe('move');
    applyAction(state, action, createRng(1), movibles);

    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('sin recorrido en la mano, moveTo sigue haciendo el suyo (#78)', () => {
    // El director y el cliente no traen recorrido, y tienen que seguir
    // moviéndose igual: la pista es opcional de verdad.
    const state = batallaDeCuatroEnemigos();
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };

    const espia = vi.mocked(board.reachable);
    espia.mockClear();
    applyAction(state, { type: 'move', to: { col: 2, row: 4 } }, createRng(1));

    expect(espia).toHaveBeenCalledTimes(1);
    expect(stackById(state, 'attacker-0').hex).toEqual({ col: 2, row: 4 });
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
    applyAction(aPelo, carga, createRng(51));

    const conPista = montar(createRng(51));
    const s = activeStack(conPista) as BattleStack;
    const turno = conPista.turno as TurnoDeUnidad;
    const conRecorrido = {
      firma: firmaDelTurno(turno),
      puertas: '',
      costs: movableFrom(conPista, s),
    };
    applyAction(conPista, carga, createRng(51), conRecorrido);

    expect(conPista.log).toEqual(aPelo.log);
    const golpe = aPelo.log.find((e) => e.kind === 'attack' && !e.retaliation);
    expect(golpe).toMatchObject({ charge: 3 });
    expect(3).toBeLessThan(stackSpeed(stackById(aPelo, 'attacker-0')));
  });

  it('un recorrido de otro stack se rechaza diciéndolo (#78)', () => {
    // Las claves de un mapa de costes ajeno son las mismas «col,row», así que
    // mirarlo no distingue de quién es: por eso viaja al lado de qué turno es
    // y se compara. Sin esto, cobrar la carga con el recorrido del vecino
    // saldría en silencio con otro número de hexes.
    const state = batallaDeCuatroEnemigos();
    const s = activeStack(state) as BattleStack;
    const turno = state.turno as TurnoDeUnidad;
    const suyo = { firma: firmaDelTurno(turno), puertas: '', costs: movableFrom(state, s) };
    applyAction(state, { type: 'defend' }, createRng(1));
    const otro = activeStack(state) as BattleStack;
    expect(otro.id).not.toBe(s.id);

    expect(() => applyAction(state, { type: 'defend' }, createRng(1), suyo)).toThrow(
      `el recorrido que traes es del turno ${turno.n} con 0 casillas gastadas, y ahora le toca a ${otro.id} en el turno ${turno.n + 1} con 0 casillas gastadas`,
    );
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
    );

    let turnos = 0;
    while (state.finished === null && turnos < 2000) {
      const acciones = legalActions(state);
      expect(acciones.length).toBeGreaterThan(0);
      // Preferir agresión para que la batalla converja.
      const eleccion =
        acciones.find((a) => a.type === 'shoot') ??
        acciones.find((a) => a.type === 'attack') ??
        acciones.find((a) => a.type === 'move') ??
        acciones[0]!;
      applyAction(state, eleccion, rng);
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
      );
      let n = 0;
      while (state.finished === null && n < 1000) {
        const acciones = legalActions(state);
        applyAction(state, acciones.find((a) => a.type === 'attack') ?? acciones[0]!, rng);
        n++;
      }
      return JSON.stringify(state.log);
    };
    expect(jugar(99)).toBe(jugar(99));
    expect(jugar(99)).not.toBe(jugar(100));
  });
});

/** Pasa a la ronda siguiente haciendo que todo el mundo se defienda. */
function pasarRonda(state: BattleState, rng: Rng): void {
  const ronda = state.round;
  let n = 0;
  while (state.round === ronda && state.finished === null && n < 60) {
    applyAction(state, { type: 'defend' }, rng);
    n++;
  }
}

/** Pega dos stacks el uno al otro para no depender de que se busquen. */
function enfrentar(
  a: { hex: { col: number; row: number } },
  b: { hex: { col: number; row: number } },
): void {
  a.hex = { col: 5, row: 4 };
  b.hex = { col: 6, row: 4 };
}

describe('efectos temporales (#9)', () => {
  it('la lentitud caduca de verdad y se anuncia en el parte', () => {
    const rng = createRng(7);
    const lanzador = hero({ spells: ['slow'], mana: 30, spellPower: 2 });
    const state = createBattle(
      side([{ creature: NO_MUERTO, count: 5 }], lanzador),
      side([{ creature: NO_MUERTO, count: 5 }]),
      rng,
    );
    const objetivo = stackById(state, 'defender-0');
    const base = stackSpeed(objetivo);

    expect(state.round).toBe(1);
    applyAction(state, { type: 'cast', spell: 'slow', target: 'defender-0' }, rng);
    expect(stackSpeed(objetivo)).toBe(base - 2);
    // Con poder mágico 2 vive dos rondas: la que se lanza y la siguiente.
    expect(state.log.some((e) => e.kind === 'effect' && e.source === 'slow')).toBe(true);

    pasarRonda(state, rng);
    expect(state.round).toBe(2);
    expect(stackSpeed(objetivo)).toBe(base - 2);

    pasarRonda(state, rng);
    expect(state.round).toBe(3);
    expect(stackSpeed(objetivo)).toBe(base);
    expect(objetivo.effects).toEqual([]);
    expect(state.log.some((e) => e.kind === 'effect_end' && e.source === 'slow')).toBe(true);
  });

  it('un no-muerto es inmune a la maldición: ni se ofrece ni se acepta', () => {
    const rng = createRng(8);
    const lanzador = hero({ spells: ['curse'], mana: 30, spellPower: 3 });
    const state = createBattle(
      // El campeón es lo más rápido del tablero: así el turno activo es el del
      // bando que tiene héroe y se le puede pedir el lanzamiento.
      side([{ creature: JINETE, count: 5 }], lanzador),
      side([{ creature: NO_MUERTO, count: 5 }]),
      rng,
    );
    const esqueleto = stackById(state, 'defender-0');
    const suerteAntes = effectiveLuck(esqueleto);

    // El esqueleto es el único enemigo, así que no queda ni un `cast` legal.
    expect(legalActions(state).some((a) => a.type === 'cast')).toBe(false);

    // Y pedirlo a mano tampoco cuela: lo rechaza la MISMA función que decidió
    // no ofrecerlo, con el motivo escrito para la persona. Antes se aceptaba,
    // rebotaba y cobraba igual el maná y la tirada de la ronda; ahora ni eso.
    expect(() =>
      applyAction(state, { type: 'cast', spell: 'curse', target: 'defender-0' }, rng),
    ).toThrow(/inmune a "Maldición"/);
    expect(esqueleto.effects).toEqual([]);
    expect(effectiveLuck(esqueleto)).toBe(suerteAntes);
    expect(lanzador.mana).toBe(30);
    expect(lanzador.castThisRound).toBe(false);
  });

  it('la maldición sí muerde a un vivo, y el recorte a −3 se hace al leer', () => {
    const s = stackOf(TROPA, 10);
    s.luck = -2; // ya venía con la suerte en contra
    applyEffect(s, { kind: 'luck', amount: -1, source: 'curse', roundsLeft: 3 });
    applyEffect(s, { kind: 'luck', amount: -1, source: 'curse_on_hit', roundsLeft: 3 });

    // Orígenes distintos SÍ se suman, y la lista los guarda enteros: −4. El
    // recorte se hace AL LEER, no al escribir, así que caducar uno devuelve el
    // valor exacto sin descuadrar nada.
    expect(s.effects).toHaveLength(2);
    expect(effectiveLuck(s)).toBe(-3);
  });

  it('el mismo origen refresca en vez de acumularse: dos miedos no dan −4', () => {
    const rng = createRng(66);
    const state = conCifrasAMano(
      createBattle(
        // Uno contra cincuenta: el que asusta aguanta dos contraataques (con PV
        // de sobra) y los esqueletos dos mordiscos, así que la batalla llega
        // entera a la segunda ronda, que es lo que se quiere mirar.
        side([{ creature: PESADA, count: 1 }]),
        side([{ creature: NO_MUERTO, count: 50 }]),
        rng,
      ),
      'attacker-0',
      con(PESADA, 'fear', { hp: 2000 }),
    );
    const asusta = stackById(state, 'attacker-0');
    const esqueleto = stackById(state, 'defender-0');
    enfrentar(asusta, esqueleto);
    const base = unidadDelJuego(NO_MUERTO).attack;

    expect(state.turno?.stack).toBe('attacker-0');
    applyAction(state, { type: 'attack', target: 'defender-0' }, rng);
    expect(effectiveAttack(esqueleto)).toBe(base - 2);

    // El esqueleto cierra la ronda y quien asusta vuelve a morder con el miedo
    // anterior todavía vivo (le quedaba 1 ronda de las 2).
    applyAction(state, { type: 'defend' }, rng);
    expect(state.round).toBe(2);
    expect(esqueleto.effects.filter((e) => e.source === 'fear')).toHaveLength(1);
    applyAction(state, { type: 'attack', target: 'defender-0' }, rng);

    // Sin política de acumulación esto sería −4 sostenido, y una Lentitud por
    // ronda iría a −2, −4, −6.
    const miedos = esqueleto.effects.filter((e) => e.source === 'fear');
    expect(miedos).toHaveLength(1);
    expect(effectiveAttack(esqueleto)).toBe(base - 2);
    // Y refrescar alarga: vuelve a durar las dos rondas enteras.
    expect(miedos[0]!.roundsLeft).toBe(2);
  });

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
  it('charge: la caballería que llega de lejos pega más que la que ya estaba', () => {
    const quieta = createRng(51);
    const cargando = createRng(51);

    const montar = (rng: ReturnType<typeof createRng>) =>
      createBattle(
        side([{ creature: JINETE, count: 10 }]),
        side([{ creature: TROPA, count: 40 }]),
        rng,
      );

    const a = montar(quieta);
    stackById(a, 'attacker-0').hex = { col: 5, row: 4 };
    stackById(a, 'defender-0').hex = { col: 6, row: 4 };
    applyAction(a, { type: 'attack', target: 'defender-0' }, quieta);

    const b = montar(cargando);
    stackById(b, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(b, 'defender-0').hex = { col: 6, row: 4 };
    applyAction(b, { type: 'attack', target: 'defender-0', from: { col: 5, row: 4 } }, cargando);

    const golpe = (state: typeof a) =>
      state.log.find((e) => e.kind === 'attack' && !e.retaliation) as
        | Extract<(typeof state.log)[number], { kind: 'attack' }>
        | undefined;

    const sinCarga = golpe(a);
    const conCarga = golpe(b);
    expect(sinCarga?.charge).toBeUndefined();
    expect(conCarga?.charge).toBe(5);
    expect(conCarga!.damage).toBeGreaterThan(sinCarga!.damage);
  });

  it('charge: el parte cuenta los hexes que se cobran, no los que se anduvieron', () => {
    const jinetes = stackOf(JINETE, 10);
    const piqueros = stackOf(TROPA, 40);
    const cinco = computeDamage(jinetes, piqueros, createRng(52), {
      reglas: REGLAS_DEL_JUEGO,
      chargeHexes: 5,
    });
    const siete = computeDamage(jinetes, piqueros, createRng(52), {
      reglas: REGLAS_DEL_JUEGO,
      chargeHexes: 7,
    });

    // Por encima del tope, cargar más no pega más. El evento copia lo que la
    // fórmula cobró: si lo dedujera por su cuenta anunciaría «carga de 7 hexes»
    // con el daño de cinco.
    expect(siete.damage).toBe(cinco.damage);
    expect(cinco.charge).toBe(5);
    expect(siete.charge).toBe(5);

    // Y quien no tiene el rasgo no carga por mucho que corra.
    const aPie = computeDamage(piqueros, jinetes, createRng(52), {
      reglas: REGLAS_DEL_JUEGO,
      chargeHexes: 5,
    });
    expect(aPie.charge).toBe(0);
  });

  it('fear: quien asusta (el dragón óseo de antes) asusta a los no-muertos, que es donde la moral no llega', () => {
    // Espejo no-muerto: con el aura de moral del original esto no haría NADA,
    // porque `createBattle` fuerza `morale: 0` a todo lo no-muerto.
    const rng = createRng(61);
    const state = conCifrasAMano(
      createBattle(
        side([{ creature: NO_MUERTO, count: 2 }]),
        side([{ creature: NO_MUERTO, count: 40 }]),
        rng,
      ),
      'attacker-0',
      con(NO_MUERTO, 'fear'),
    );
    const asusta = stackById(state, 'attacker-0');
    const esqueleto = stackById(state, 'defender-0');
    enfrentar(asusta, esqueleto);

    expect(effectiveAttack(esqueleto)).toBe(unidadDelJuego(NO_MUERTO).attack);
    applyAction(state, { type: 'attack', target: 'defender-0' }, rng);

    expect(esqueleto.effects.some((e) => e.source === 'fear' && e.amount === -2)).toBe(true);
    expect(effectiveAttack(esqueleto)).toBe(unidadDelJuego(NO_MUERTO).attack - 2);
    expect(
      state.log.some((e) => e.kind === 'effect' && e.source === 'fear' && e.effect === 'attack'),
    ).toBe(true);

    // Y el miedo se nota en el golpe: mismo dado, menos daño.
    const conMiedo = computeDamage(esqueleto, asusta, createRng(5), { reglas: REGLAS_DEL_JUEGO });
    const sinMiedo = computeDamage({ ...esqueleto, effects: [] }, asusta, createRng(5), {
      reglas: REGLAS_DEL_JUEGO,
    });
    expect(conMiedo.damage).toBeLessThan(sinMiedo.damage);
  });

  it('curse_on_hit: quien maldice al golpear (la momia de antes) maldice a un vivo y rebota en un no-muerto', () => {
    const maldice = con(NO_MUERTO, 'curse_on_hit');
    const rng = createRng(62);
    const contraVivos = conCifrasAMano(
      createBattle(
        side([{ creature: NO_MUERTO, count: 5 }]),
        side([{ creature: TROPA, count: 30 }]),
        rng,
      ),
      'attacker-0',
      maldice,
    );
    enfrentar(stackById(contraVivos, 'attacker-0'), stackById(contraVivos, 'defender-0'));
    applyAction(contraVivos, { type: 'attack', target: 'defender-0' }, rng);

    const piquero = stackById(contraVivos, 'defender-0');
    expect(piquero.effects.some((e) => e.source === 'curse_on_hit' && e.amount === -1)).toBe(true);
    expect(effectiveLuck(piquero)).toBe(-1);
    expect(contraVivos.log.some((e) => e.kind === 'effect' && e.source === 'curse_on_hit')).toBe(
      true,
    );

    // Espejo no-muerto: quien maldice no desmoraliza a un esqueleto.
    const rng2 = createRng(63);
    const contraMuertos = conCifrasAMano(
      createBattle(
        side([{ creature: NO_MUERTO, count: 5 }]),
        side([{ creature: NO_MUERTO, count: 30 }]),
        rng2,
      ),
      'attacker-0',
      maldice,
    );
    enfrentar(stackById(contraMuertos, 'attacker-0'), stackById(contraMuertos, 'defender-0'));
    applyAction(contraMuertos, { type: 'attack', target: 'defender-0' }, rng2);

    const esqueleto = stackById(contraMuertos, 'defender-0');
    expect(esqueleto.effects).toEqual([]);
    expect(contraMuertos.log.some((e) => e.kind === 'immune' && e.source === 'curse_on_hit')).toBe(
      true,
    );
  });

  /** El tirador que salpica (el liche de antes), a mano: el catálogo no lo trae. */
  const salpica = con(TIRADOR_NO_MUERTO, 'splash_shot');

  it('splash_shot: el disparo del que salpica salpica también a los suyos', () => {
    const rng = createRng(64);
    const state = conCifrasAMano(
      createBattle(
        side([
          { creature: TIRADOR_NO_MUERTO, count: 5 },
          { creature: NO_MUERTO, count: 30 },
        ]),
        side([{ creature: TROPA, count: 30 }]),
        rng,
      ),
      'attacker-0',
      salpica,
    );
    const liche = stackById(state, 'attacker-0');
    const aliado = stackById(state, 'attacker-1');
    const objetivo = stackById(state, 'defender-0');
    liche.hex = { col: 0, row: 4 };
    aliado.hex = { col: 5, row: 4 };
    objetivo.hex = { col: 6, row: 4 };

    const aliadoAntes = aliado.count;
    expect(state.turno?.stack).toBe('attacker-0');
    applyAction(state, { type: 'shoot', target: 'defender-0' }, rng);

    expect(aliado.count).toBeLessThan(aliadoAntes);
    expect(
      state.log.some((e) => e.kind === 'shoot' && e.splash === true && e.target === 'attacker-1'),
    ).toBe(true);
  });

  it('splash_shot: la IA no se dispara a los suyos si tiene otro objetivo', () => {
    const rng = createRng(65);
    const state = conCifrasAMano(
      createBattle(
        side([
          { creature: TIRADOR_NO_MUERTO, count: 5 },
          { creature: NO_MUERTO, count: 30 },
        ]),
        side([
          { creature: TROPA, count: 30 },
          { creature: TIRADOR, count: 10 },
        ]),
        rng,
      ),
      'attacker-0',
      salpica,
    );
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(state, 'attacker-1').hex = { col: 5, row: 4 };
    stackById(state, 'defender-0').hex = { col: 6, row: 4 }; // pegado al aliado
    stackById(state, 'defender-1').hex = { col: 9, row: 1 }; // limpio
    // El turno, a mano: el arquero de enfrente es más rápido.
    forzarTurno(state, 'attacker-0');
    const eleccion = chooseBattleAction(state);
    // Disparar al piquero era legal —y `legalActions` lo sigue ofreciendo—,
    // pero se llevaría por delante a su propio esqueleto.
    expect(eleccion).toEqual({ type: 'shoot', target: 'defender-1' });
    expect(legalActions(state).some((a) => a.type === 'shoot' && a.target === 'defender-0')).toBe(
      true,
    );
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

  it('lo lanzable se ancla en el hecho: con maná sí, sin maná no, y nunca sobre quien es inmune', () => {
    const { session, heroe } = sesionEnBatalla(61, { spells: ['magic_arrow', 'curse'], mana: 30 });
    const opciones = session.spellOptions();
    expect(opciones.map((o) => o.id)).toEqual(['magic_arrow', 'curse']);

    // La Flecha mágica se puede lanzar sobre el único enemigo que hay.
    const flecha = opciones.find((o) => o.id === 'magic_arrow')!;
    expect(flecha.castable).toBe(true);
    expect(flecha.targets).toEqual(['defender-0']);
    expect(flecha.motivo).toBe('');

    // La Maldición rebota en un no-muerto, así que no le queda a quién: el
    // motivo lo escribe el núcleo y el panel lo enseña tal cual.
    const maldicion = opciones.find((o) => o.id === 'curse')!;
    expect(maldicion.castable).toBe(false);
    expect(maldicion.targets).toEqual([]);
    expect(maldicion.motivo).toBe('no hay ningún objetivo válido');

    // Y sin maná deja de ser lanzable: `castable` sigue al estado, no es un sí
    // fijo por estar en el libro.
    heroe.mana = 0;
    expect(session.spellOptions().find((o) => o.id === 'magic_arrow')!.castable).toBe(false);
  });

  it('apuntar mal se explica con la frase del núcleo, no con una de la pantalla', () => {
    // El clic sobre un objetivo imposible es una regla del juego —un aliado, un
    // inmune, un muerto—, así que la explicación tiene que salir de `core`.
    // Antes la pantalla redactaba la suya y perdía el motivo concreto.
    const { session } = sesionEnBatalla(63, { spells: ['haste'], mana: 30 });
    session.hechizos.selectSpell('haste');

    expect(session.hechizos.castRejection('defender-0')).toBe('"Prisa" va dirigido a un aliado');
  });

  it('lo que no se puede lanzar no se ofrece, y el motivo está escrito para la persona', () => {
    const { session, heroe } = sesionEnBatalla(62, { spells: ['magic_arrow'], mana: 1 });
    expect(session.spellOptions()[0]!.castable).toBe(false);
    expect(session.spellOptions()[0]!.motivo).toBe('maná insuficiente: cuesta 3 y quedan 1');

    // Y si lo intenta igual, ve el motivo en vez de que no pase nada.
    session.hechizos.selectSpell('magic_arrow');
    expect(session.hechizos.selectedSpell).toBeNull();
    expect(session.status).toContain('maná insuficiente');

    heroe.mana = 30;
    heroe.castThisRound = true;
    expect(session.spellOptions().every((o) => !o.castable)).toBe(true);
    expect(session.spellOptions()[0]!.motivo).toMatch(/ya lanzó/);
  });

  it('lanzar sale de las acciones legales, gasta maná y NO consume el turno del stack', () => {
    const { session, heroe, battle } = sesionEnBatalla(63, { spells: ['magic_arrow'], mana: 20 });
    const activoAntes = battle.turno?.stack;
    expect(activoAntes).toBe('attacker-0');

    session.hechizos.selectSpell('magic_arrow');
    expect(session.hechizos.selectedSpell).toBe('magic_arrow');
    expect(session.hechizos.castTargets()).toEqual(['defender-0']);

    // Esto es lo que hace el clic en `main.ts`: buscar, no construir.
    const conjuro = session
      .battleLegalActions()
      .find((a) => a.type === 'cast' && a.spell === 'magic_arrow' && a.target === 'defender-0');
    expect(conjuro).toBeDefined();
    session.playBattleAction(conjuro!);

    expect(heroe.mana).toBe(17);
    expect(battle.turno?.stack).toBe(activoAntes);
    expect(session.hechizos.selectedSpell).toBeNull();
    // Ya lanzó esta ronda: el libro entero queda apagado hasta la siguiente.
    expect(session.spellOptions().every((o) => !o.castable)).toBe(true);
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
function escenaDeCarga(atacante: string): BattleState {
  const state = createBattle(
    side([{ creature: atacante, count: 10 }]),
    side([{ creature: NO_MUERTO, count: 10 }]),
    createRng(7),
  );
  stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
  stackById(state, 'defender-0').hex = { col: 3, row: 4 };
  return state;
}

/** El `from` de la acción, o `null` si la IA no eligió acercarse y golpear. */
function casillaElegida(state: BattleState): Hex | null {
  const a = chooseBattleAction(state);
  return a.type === 'attack' ? (a.from ?? null) : null;
}

describe('la IA elige la casilla de ataque por daño esperado (#50)', () => {
  it('con carga se va a la casilla que carga en línea recta, aunque otra cueste más pasos', () => {
    // Re-escrito con la carga en recta (02-10-2026). Antes la escena era el
    // zombi en (3,4) y la IA rodeaba hasta (4,4) por 5 pasos de carga; con la
    // regla nueva un rodeo no carga nada. Ahora el zombi está en (5,4): (4,4)
    // está en recta a 4 casillas y carga 4; (5,3) y (5,5) cuestan 6 pasos —con
    // la regla vieja habrían cobrado el tope, 5— y no cargan nada.
    const state = escenaDeCarga(JINETE);
    stackById(state, 'defender-0').hex = { col: 5, row: 4 };
    expect(state.turno?.stack).toBe('attacker-0');
    const s = stackById(state, 'attacker-0');
    const zombi = stackById(state, 'defender-0');
    expect(cargaDesde(state, s, { col: 4, row: 4 }, zombi)).toBe(4);
    expect(cargaDesde(state, s, { col: 5, row: 5 }, zombi)).toBe(0);
    expect(movableFrom(state, s).get('5,5')?.steps).toBe(6);
    expect(casillaElegida(state)).toEqual({ col: 4, row: 4 });
  });

  it('sin carga no da rodeos: el criterio es el daño, no la distancia', () => {
    // Misma escena y misma disyuntiva, con una unidad sin el rasgo. Todas las
    // casillas pegan lo mismo —`computeDamage` no mira el hex salvo por la
    // carga—, así que irse lejos solo sirve para acabar el turno más expuesto.
    const state = escenaDeCarga(PESADA);
    expect(state.turno?.stack).toBe('attacker-0');
    expect(casillaElegida(state)).toEqual({ col: 2, row: 4 });
  });

  it('a igual daño gana la barata, y el coste se LEE: no se supone del orden', () => {
    // Hoy la primera casilla de `legalActions` es siempre la más barata porque
    // `reachable` es un BFS y `movableHexes` conserva su orden. Eso es un
    // accidente del recorrido, no un contrato — y el ciclo de rendimiento ya
    // reescribió esa cola una vez. Aquí se le da la vuelta al orden de
    // enumeración: si la heurística se apoyara en `cargas[0]`, elegiría la de
    // coste 4 y este test se pondría rojo.
    const espia = vi.mocked(board.reachable);
    const real = espia.getMockImplementation() as typeof board.reachable;
    espia.mockImplementation((from, maxSteps, blocked) =>
      // El mismo mapa con las entradas al revés: mismos hexes, mismos costes.
      reverse(real(from, maxSteps, blocked)),
    );
    try {
      const state = escenaDeCarga(PESADA);
      expect(casillaElegida(state)).toEqual({ col: 2, row: 4 });
    } finally {
      espia.mockImplementation(real);
    }
  });
});

/**
 * La IA busca la carga (decisión del usuario, 02-10-2026): si desde donde está
 * no se le carga al objetivo, da un tramo de lado que lo deja en recta y le
 * carga en el SIGUIENTE tramo del mismo turno. El jinete en (0,4) y el zombi en
 * (5,3): de salida ninguna recta acaba en él; subiendo a (0,3) —un paso— la
 * fila 3 lleva a (4,3) en cuatro, y 1 + 4 caben en los 6 de la caballería.
 */
function escenaDePasoDeLado(otro?: Hex): BattleState {
  const defensores: Stack[] = [{ creature: NO_MUERTO, count: 10 }];
  if (otro !== undefined) defensores.push({ creature: NO_MUERTO, count: 10 });
  const state = createBattle(
    side([{ creature: JINETE, count: 10 }]),
    side(defensores),
    createRng(7),
  );
  stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
  stackById(state, 'defender-0').hex = { col: 5, row: 3 };
  if (otro !== undefined) stackById(state, 'defender-1').hex = otro;
  return state;
}

/** El tramo de lado y el golpe de después, con lo que cobra el golpe. */
function pasoYGolpe(state: BattleState): {
  paso: BattleAction;
  golpe: BattleAction;
  turnos: [number, number];
  cobrada: number | undefined;
} {
  const rng = createRng(1);
  const n0 = state.turno?.n ?? -1;
  const paso = chooseBattleAction(state);
  applyAction(state, paso, rng);
  const n1 = state.turno?.n ?? -1;
  const golpe = chooseBattleAction(state);
  const antes = state.log.length;
  applyAction(state, golpe, rng);
  const e = state.log.slice(antes).find((x) => x.kind === 'attack' && !x.retaliation);
  return { paso, golpe, turnos: [n0, n1], cobrada: e?.kind === 'attack' ? e.charge : undefined };
}

describe('la IA busca la carga: un tramo de lado y la recta en el siguiente', () => {
  it('de salida no hay carga; tras un paso a (0,3), carga 4 desde (4,3) en el mismo turno', () => {
    const state = escenaDePasoDeLado();
    expect(state.turno?.stack).toBe('attacker-0');
    const s = stackById(state, 'attacker-0');
    expect(casillasDeCarga(state, s)).toEqual([]);
    const { paso, golpe, turnos, cobrada } = pasoYGolpe(state);
    expect(paso).toEqual({ type: 'move', to: { col: 0, row: 3 } });
    // Lo que se cobra es lo que el motor anunciaba tras el tramo, y es este turno.
    expect(golpe).toEqual({ type: 'attack', target: 'defender-0', from: { col: 4, row: 3 } });
    expect(turnos[0]).toBe(turnos[1]);
    expect(cobrada).toBe(4);
  });

  it('sin el rasgo, la misma unidad no da el paso de lado', () => {
    const state = escenaDePasoDeLado();
    const s = stackById(state, 'attacker-0');
    const jinete = unidadDelJuego(JINETE);
    (s as { unit: UnitInfo }).unit = { ...jinete, traits: [] };
    const a = chooseBattleAction(state);
    expect(a.type).toBe('attack');
  });

  it('no se planta pegado a otro enemigo: con uno junto a (0,3) sube a (1,3) y carga 3', () => {
    // Pegado a otro, el tramo siguiente le golpearía a ese —la rama de quien ya
    // se alcanza va antes— y la carga se perdería.
    const state = escenaDePasoDeLado({ col: 0, row: 2 });
    const { paso, golpe, turnos, cobrada } = pasoYGolpe(state);
    expect(paso).toEqual({ type: 'move', to: { col: 1, row: 3 } });
    expect(golpe).toEqual({ type: 'attack', target: 'defender-0', from: { col: 4, row: 3 } });
    expect(turnos[0]).toBe(turnos[1]);
    expect(cobrada).toBe(3);
  });

  it('si la recta no cabe en lo que queda del tramo, decide como sin el rasgo', () => {
    // El paso más barato que alinea es (0,3), a 1, con una recta de 4 detrás: le
    // hacen falta 5. Con 4 no cabe ninguno y la regla no deja al jinete plantado
    // delante del zombi para el turno que viene, así que hace lo de siempre: lo
    // mismo que la misma unidad sin `charge`. Con 5, el paso y la carga de 4.
    const conQuedan = (quedan: number, conRasgo: boolean): BattleState => {
      const state = escenaDePasoDeLado();
      const s = stackById(state, 'attacker-0');
      if (!conRasgo) (s as { unit: UnitInfo }).unit = { ...unidadDelJuego(JINETE), traits: [] };
      (state.turno as { gastado: number }).gastado = stackSpeed(s) - quedan;
      expect(pasosQueQuedan(state, s)).toBe(quedan);
      return state;
    };
    for (const quedan of [3, 4]) {
      expect(chooseBattleAction(conQuedan(quedan, true))).toEqual(
        chooseBattleAction(conQuedan(quedan, false)),
      );
    }
    const { paso, cobrada } = pasoYGolpe(conQuedan(5, true));
    expect(paso).toEqual({ type: 'move', to: { col: 0, row: 3 } });
    expect(cobrada).toBe(4);
  });
});

function reverse<K, V>(m: Map<K, V>): Map<K, V> {
  return new Map([...m].reverse());
}

describe('la IA lanza hechizos (#24)', () => {
  it('lanza la flecha mágica cuando rinde más que su coste, y no gasta el turno', () => {
    const rng = createRng(71);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 20, spellPower: 1 });
    const state = createBattle(
      side([{ creature: JINETE, count: 10 }], lanzador),
      side([{ creature: NO_MUERTO, count: 10 }]),
      rng,
    );

    const decision = chooseBattleAction(state);
    expect(decision).toEqual({ type: 'cast', spell: 'magic_arrow', target: 'defender-0' });

    // La segunda vuelta sobre el MISMO stack devuelve una acción de combate:
    // `castThisRound` corta el bucle, así que la IA no se cuelga lanzando.
    applyAction(state, decision, rng);
    expect(state.turno?.stack).toBe('attacker-0');
    expect(lanzador.mana).toBe(17);
    expect(chooseBattleAction(state).type).not.toBe('cast');
  });

  it('sin maná no lo intenta', () => {
    const rng = createRng(72);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 0, spellPower: 1 });
    const state = createBattle(
      side([{ creature: JINETE, count: 10 }], lanzador),
      side([{ creature: NO_MUERTO, count: 10 }]),
      rng,
    );
    expect(chooseBattleAction(state).type).not.toBe('cast');
    expect(lanzador.mana).toBe(0);
  });
});

/**
 * Cinco espadachines del atacante en (0,4), con turno, contra lo que se diga en
 * la misma fila; el héroe del atacante, con el libro que se pida, en una
 * esquina. El espadachín anda 4 y golpea a 5: a 6 solo llega con la Prisa.
 */
function escenaDeHechizo(
  libro: readonly string[],
  enemigo: { creature: string; count: number; col: number },
  heroeRival = false,
  poder = 1,
  espadachines = 5,
): BattleState {
  const state = createBattle(
    side(
      [{ creature: PESADA, count: espadachines }],
      hero({ spells: libro, mana: 20, spellPower: poder }),
    ),
    side([{ creature: enemigo.creature, count: enemigo.count }], heroeRival ? hero() : null),
    createRng(92),
  );
  stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
  stackById(state, 'attacker-heroe').hex = { col: 0, row: 0 };
  stackById(state, 'defender-0').hex = { col: enemigo.col, row: 4 };
  if (heroeRival) stackById(state, 'defender-heroe').hex = { col: 10, row: 8 };
  forzarTurno(state, 'attacker-0');
  return state;
}

describe('la IA valora los hechizos por lo que compran en esta batalla (#92)', () => {
  it('la Prisa vale el golpe que compra hoy: ni cuando ya llega ni cuando ni con ella llega', () => {
    const conZombisEn = (col: number): BattleState =>
      escenaDeHechizo(['haste'], { creature: NO_MUERTO, count: 5, col });
    // A 6 casillas el espadachín no llega (4 + 1) y con la Prisa sí (6 + 1).
    expect(chooseBattleAction(conZombisEn(6))).toEqual({
      type: 'cast',
      spell: 'haste',
      target: 'attacker-0',
    });
    // A 4 ya llega: la Prisa no le compra nada en esta ronda, que es la única
    // que dura con Poder 1. Antes valía lo mismo en los dos casos.
    expect(chooseBattleAction(conZombisEn(4)).type).not.toBe('cast');
    // A 10 tampoco llega con ella.
    expect(chooseBattleAction(conZombisEn(10)).type).not.toBe('cast');
  });

  it('la Prisa sobre quien ya actuó esta ronda no vale nada', () => {
    const state = escenaDeHechizo(['haste'], { creature: NO_MUERTO, count: 5, col: 6 });
    // El turno pasa al héroe, y el espadachín ya actuó: de los dos, el único
    // que podría aprovecharla hoy no va a volver a moverse.
    stackById(state, 'attacker-0').acted = true;
    forzarTurno(state, 'attacker-heroe');
    expect(chooseBattleAction(state).type).not.toBe('cast');
  });

  it('la Lentitud vale el golpe que le quita al enemigo que aún no ha actuado', () => {
    // Espadachines rivales a 5: llegan (4 + 1) y frenados no (2 + 1).
    const state = escenaDeHechizo(['slow'], { creature: PESADA, count: 5, col: 5 });
    expect(chooseBattleAction(state)).toEqual({
      type: 'cast',
      spell: 'slow',
      target: 'defender-0',
    });
    // Si ya actuó, la Lentitud de una ronda no le quita nada.
    stackById(state, 'defender-0').acted = true;
    expect(chooseBattleAction(state).type).not.toBe('cast');
  });

  it('un refresco no compra la ronda que ya cubre el mismo origen', () => {
    const state = escenaDeHechizo(['slow'], { creature: PESADA, count: 5, col: 5 }, false, 3);
    const rivales = stackById(state, 'defender-0');
    expect(chooseBattleAction(state).type).toBe('cast');
    // Con la Lentitud ya encima, relanzarla no le quita el golpe de hoy —ya
    // está quitado— y de las rondas siguientes solo compra las que el mismo
    // origen no cubre, que aquí son ninguna.
    applyEffect(rivales, { kind: 'speed', amount: -2, source: 'slow', roundsLeft: 3 });
    expect(chooseBattleAction(state).type).not.toBe('cast');
    // Y cuando se disipa vuelve a valer la pena: la resta no es un veto.
    rivales.effects = [];
    expect(chooseBattleAction(state).type).toBe('cast');
  });

  it('las rondas siguientes cuentan hasta el final estimado de la batalla, no hasta el de la Lentitud', () => {
    // Cinco pesadas a 10 casillas: hoy no llegan ni sin frenar, así que la
    // Lentitud de Poder 3 solo compra las dos rondas siguientes.
    const contra = (espadachines: number): BattleState =>
      escenaDeHechizo(['slow'], { creature: PESADA, count: 5, col: 10 }, false, 3, espadachines);
    // Con cinco espadachines la batalla da para esas dos rondas, y valen.
    expect(chooseBattleAction(contra(5))).toEqual({
      type: 'cast',
      spell: 'slow',
      target: 'defender-0',
    });
    // Con veinte, las pesadas caen en la primera: no hay ronda siguiente que
    // comprar.
    expect(chooseBattleAction(contra(20)).type).not.toBe('cast');
  });

  it('la Flecha va a quien más amenaza le quita al rival: al héroe, que es su bando entero', () => {
    // Cinco zombis y el héroe rival: la Flecha les quita lo mismo a cualquiera
    // de los dos, pero matar al héroe gana la batalla.
    const conHeroe = escenaDeHechizo(['magic_arrow'], { creature: ZOMBI, count: 5, col: 10 }, true);
    expect(chooseBattleAction(conHeroe)).toEqual({
      type: 'cast',
      spell: 'magic_arrow',
      target: 'defender-heroe',
    });
    // Sin héroe rival, a los zombis.
    const sinHeroe = escenaDeHechizo(['magic_arrow'], { creature: ZOMBI, count: 5, col: 10 });
    expect(chooseBattleAction(sinHeroe)).toEqual({
      type: 'cast',
      spell: 'magic_arrow',
      target: 'defender-0',
    });
  });

  it('el umbral sigue en PV: una Flecha que solo puede quitar 1 PV no se lanza', () => {
    const state = escenaDeHechizo(['magic_arrow'], {
      creature: TROPA_BARATA,
      count: 1,
      col: 10,
    });
    expect(chooseBattleAction(state).type).not.toBe('cast');
  });
});

describe('la IA espera en vez de plantarse (#24)', () => {
  it('se defiende cuando no alcanza a nadie ni puede moverse', () => {
    const rng = createRng(74);
    const state = createBattle(
      side([
        { creature: JINETE, count: 5 },
        { creature: TROPA_BARATA, count: 5 },
        { creature: TROPA_BARATA, count: 5 },
      ]),
      side([{ creature: NO_MUERTO, count: 5 }]),
      rng,
    );
    // El campeón queda embotellado en la esquina por los suyos: (0,0) solo
    // tiene dos vecinos dentro del tablero y los dos están ocupados.
    stackById(state, 'attacker-0').hex = { col: 0, row: 0 };
    stackById(state, 'attacker-1').hex = { col: 1, row: 0 };
    stackById(state, 'attacker-2').hex = { col: 0, row: 1 };
    stackById(state, 'defender-0').hex = { col: 10, row: 8 };

    expect(state.turno?.stack).toBe('attacker-0');
    expect(movableHexes(state, stackById(state, 'attacker-0'))).toEqual([]);

    // Antes esto era un `wait`, y era una tautología: quien no puede llegarme
    // hoy tampoco llegará al final de la ronda, así que ceder la iniciativa no
    // compra nada y el +20 % de defensa sí. `defend` es la única cola terminal.
    expect(chooseBattleAction(state)).toEqual({ type: 'defend' });
  });
});

/**
 * La escena de #52: el jinete del atacante contra una pesada (el piquero de
 * antes), en la fila 4.
 *
 * El jinete corre 7 hexes y la pesada 4, así que el jinete mueve primero y la
 * pesada le alcanza a 5 (sus pasos más el hex desde el que golpea). Con ella
 * al otro extremo, avanzar deja al jinete dentro de ese radio y esperar lo deja
 * pegando al final de la ronda.
 */
function escenaDeEspera(piqueroEn: Hex, piqueroYaActuo = false): BattleState {
  const state = createBattle(
    side([{ creature: JINETE, count: 5 }]),
    side([{ creature: PESADA, count: 5 }]),
    createRng(74),
  );
  stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
  stackById(state, 'defender-0').hex = piqueroEn;
  stackById(state, 'defender-0').acted = piqueroYaActuo;
  return state;
}

describe('la IA aprovecha el segundo tramo (02-10-2026)', () => {
  it('tras moverse, si ahora alcanza a alguien, le pega en vez de cerrar', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 5,
      row: 4,
    });
    applyAction(state, { type: 'move', to: { col: 4, row: 4 } }, createRng(1));
    expect(state.turno?.stack).toBe('attacker-0');
    expect(chooseBattleAction(state)).toEqual({ type: 'attack', target: 'defender-0' });
  });

  it('tras moverse sin nadie a mano y sin poder acercarse más, cierra: ni espera ni se defiende', () => {
    // Le queda una casilla y la única que le acerca la tapa un aliado: antes de
    // los tramos la cola era `wait` o `defend`, que tras moverse ya no son legales.
    const state = createBattle(
      side([
        { creature: PESADA, count: 5 },
        { creature: TROPA_BARATA, count: 5 },
      ]),
      side([{ creature: TROPA, count: 5 }]),
      createRng(3),
    );
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(state, 'attacker-1').hex = { col: 1, row: 4 };
    stackById(state, 'defender-0').hex = { col: 10, row: 4 };
    forzarTurno(state, 'attacker-0', 3);
    expect(legalActions(state).some((a) => a.type === 'move')).toBe(true);
    expect(chooseBattleAction(state)).toEqual({ type: 'end_turn' });
  });

  it('lo que elige la IA está SIEMPRE en la lista legal, también tras un tramo', () => {
    // La lista legal cambia tras moverse —sin `wait`, `defend` ni `shoot`—, y la
    // IA tiene dos colas que los devolvían. Treinta batallas enteras, decisión a
    // decisión: una sola fuera de la lista se dice con su batalla.
    let tramos = 0;
    for (let semilla = 1; semilla <= 30; semilla++) {
      const rng = createRng(semilla);
      const state = createBattle(
        side([
          { creature: JINETE, count: 3 },
          { creature: TIRADOR, count: 4 },
          { creature: PESADA, count: 3 },
        ]),
        side([
          { creature: NO_MUERTO, count: 6 },
          { creature: TIRADOR_NO_MUERTO, count: 2 },
          { creature: PESADA, count: 2 },
        ]),
        rng,
      );
      for (let n = 0; state.finished === null && n < 3000; n++) {
        const s = activeStack(state) as BattleStack;
        const accion = chooseBattleAction(state);
        if (seHaMovido(state, s)) tramos++;
        expect(legalActions(state), `semilla ${semilla}`).toContainEqual(accion);
        applyAction(state, accion, rng);
      }
      expect(state.finished, `semilla ${semilla}`).not.toBeNull();
    }
    expect(tramos).toBeGreaterThan(0);
  });
});

describe('la IA cede la iniciativa en vez de meter el morro (#52)', () => {
  it('espera si al avanzar quedaría dentro del alcance de quien aún no ha movido', () => {
    const state = escenaDeEspera({ col: 10, row: 4 });
    expect(state.turno?.stack).toBe('attacker-0');
    expect(stackSpeed(stackById(state, 'attacker-0'))).toBe(7);
    expect(stackSpeed(stackById(state, 'defender-0'))).toBe(4);

    // Avanzar lo dejaría en (7,4), a 3 hexes del piquero: dentro de sus 4+1.
    expect(chooseBattleAction(state)).toEqual({ type: 'wait' });
  });

  it('y no es otra tautología: si el enemigo ya actuó, avanza', () => {
    // Misma escena, mismo alcance, misma distancia. Lo único que cambia es que
    // el piquero ya gastó su turno, así que no hay iniciativa que cederle: si
    // la regla se disparase igual, sería «esperar por esperar» con otro
    // disfraz, que es justo lo que se acaba de borrar.
    const state = escenaDeEspera({ col: 10, row: 4 }, true);
    expect(chooseBattleAction(state)).toEqual({ type: 'move', to: { col: 7, row: 4 } });
  });

  it('golpear gana a esperar: la espera es la alternativa a avanzar, no al ataque', () => {
    // Con el piquero a tiro de carga, la rama de acercarse y golpear resuelve
    // antes: ceder la iniciativa para pegar al final de la ronda no vale nada
    // cuando ya se puede pegar ahora.
    const state = escenaDeEspera({ col: 7, row: 4 });
    expect(chooseBattleAction(state).type).toBe('attack');
  });

  it('quien ya esperó esta ronda no vuelve a esperar', () => {
    // El motor lo rechazaría (`legalActions` deja de ofrecer `wait`), así que
    // sin esta condición la heurística devolvería una acción ilegal. Es también
    // lo que impide que dos stacks se pasen la ronda cediéndose el turno.
    const state = escenaDeEspera({ col: 10, row: 4 });
    stackById(state, 'attacker-0').waited = true;
    expect(chooseBattleAction(state)).toEqual({ type: 'move', to: { col: 7, row: 4 } });
  });
});

/**
 * El parte de guerra, que es lo que lee la persona durante la batalla.
 *
 * Con los eventos puestos a mano, igual que la crónica del mapa en
 * `cronica.test.ts`: lo que se afirma aquí es el COLOR, y hacen falta los seis
 * casos —moral alta y baja, suerte buena y mala, el efecto que suma y el que
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
  );
  stackById(state, 'attacker-0').hex = en;
  stackById(state, 'defender-0').hex = enDefensor;
  forzarTurno(state, 'attacker-0');
  return state;
}

describe('el turno en tramos (2026-10-02)', () => {
  it('dos `move` seguidos dejan a la misma unidad activa, y el que pasa del presupuesto se rechaza', () => {
    // Espadachín: velocidad media, 4 casillas.
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    const antes = { ...(state.turno as TurnoDeUnidad) };
    applyAction(state, { type: 'move', to: { col: 2, row: 4 } }, createRng(1));
    // El MISMO turno, por su ordinal, con lo andado apuntado.
    expect(state.turno).toEqual({ n: antes.n, stack: 'attacker-0', gastado: 2 });
    expect(mismoTurno(antes, state.turno)).toBe(true);
    expect(pasosQueQuedan(state, s)).toBe(2);
    // Lo que le queda manda: nada de lo que se ofrece cuesta más de 2.
    for (const p of movableFrom(state, s).values()) expect(p.steps).toBeLessThanOrEqual(2);
    expect(() =>
      applyAction(state, { type: 'move', to: { col: 5, row: 4 } }, createRng(1)),
    ).toThrow('attacker-0 no puede moverse a (5,4)');
    // El rechazo no ha tocado nada: sigue en su sitio y con lo mismo gastado.
    expect(s.hex).toEqual({ col: 2, row: 4 });
    expect(state.turno).toEqual({ n: antes.n, stack: 'attacker-0', gastado: 2 });
  });

  it('si agota el presupuesto sin nadie al alcance, el turno se cierra solo', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    applyAction(state, { type: 'move', to: { col: 2, row: 4 } }, createRng(1));
    applyAction(state, { type: 'move', to: { col: 4, row: 4 } }, createRng(1));
    expect(stackById(state, 'attacker-0').acted).toBe(true);
    expect(state.turno?.stack).not.toBe('attacker-0');
  });

  it('el hechizo del héroe no deja abierto un turno agotado: no es la unidad haciendo nada', () => {
    // «Qué queda tras moverse» se lee de la lista legal, y la lista trae el
    // `cast` del héroe: si contara, la unidad sin casillas ni nadie al lado se
    // quedaría esperando un clic que no decide nada.
    const state = createBattle(
      side([{ creature: PESADA, count: 5 }], hero({ spells: ['magic_arrow'] })),
      side([{ creature: TROPA, count: 5 }]),
      createRng(3),
    );
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(state, 'defender-0').hex = { col: 10, row: 4 };
    const cuerpo = state.stacks.find((x) => x.side === 'attacker' && x.origen.kind === 'heroe');
    if (cuerpo === undefined) throw new Error('el bando con héroe no trae su cuerpo');
    cuerpo.hex = { col: 0, row: 8 };
    forzarTurno(state, 'attacker-0');
    applyAction(state, { type: 'move', to: { col: 2, row: 4 } }, createRng(1));
    expect(legalActions(state).some((a) => a.type === 'cast')).toBe(true);
    applyAction(state, { type: 'move', to: { col: 4, row: 4 } }, createRng(1));
    expect(stackById(state, 'attacker-0').acted).toBe(true);
    expect(state.turno?.stack).not.toBe('attacker-0');
  });

  it('con el presupuesto agotado y un enemigo al lado, el turno sigue: le queda golpear', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 5,
      row: 4,
    });
    applyAction(state, { type: 'move', to: { col: 4, row: 4 } }, createRng(1));
    expect(state.turno).toMatchObject({ stack: 'attacker-0', gastado: 4 });
    expect(legalActions(state)).toEqual([
      { type: 'attack', target: 'defender-0' },
      { type: 'end_turn' },
    ]);
  });

  it('tras moverse no se dispara, ni se espera, ni se defiende: ni se ofrece ni se acepta', () => {
    // Arquero: muy lento, 2 casillas; tras una le queda otra y el turno sigue.
    const state = duelo(TIRADOR, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    expect(legalActions(state)).toContainEqual({ type: 'shoot', target: 'defender-0' });
    applyAction(state, { type: 'move', to: { col: 1, row: 4 } }, createRng(1));
    expect(state.turno?.stack).toBe('attacker-0');

    const tipos = new Set(legalActions(state).map((a) => a.type));
    expect(tipos.has('shoot')).toBe(false);
    expect(tipos.has('wait')).toBe(false);
    expect(tipos.has('defend')).toBe(false);
    expect(tipos.has('end_turn')).toBe(true);

    const rng = createRng(1);
    expect(() => applyAction(state, { type: 'shoot', target: 'defender-0' }, rng)).toThrow(
      'attacker-0 ya se ha movido este turno: no puede disparar',
    );
    expect(() => applyAction(state, { type: 'wait' }, rng)).toThrow(
      'attacker-0 ya se ha movido este turno: no puede esperar',
    );
    expect(() => applyAction(state, { type: 'defend' }, rng)).toThrow(
      'attacker-0 ya se ha movido este turno: no puede defenderse',
    );
  });

  it('por qué no se puede actuar contra un enemigo lo dice el núcleo, y al tirador movido le dice el bueno', () => {
    // Hallazgo de QA (H2): el cliente escribía «No alcanzas a esa unidad» a un
    // arquero que se acababa de mover, con un arco de alcance ilimitado.
    const arquero = duelo(TIRADOR, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    expect(ataqueBlocker(arquero, 'defender-0')).toBeNull();
    applyAction(arquero, { type: 'move', to: { col: 1, row: 4 } }, createRng(1));
    expect(ataqueBlocker(arquero, 'defender-0')).toBe(
      'ya se ha movido este turno: no puede disparar, y no alcanza a esa unidad cuerpo a cuerpo este turno',
    );
    // El rechazo del motor sale de la misma redacción, con el id delante.
    expect(() =>
      applyAction(arquero, { type: 'shoot', target: 'defender-0' }, createRng(1)),
    ).toThrow('attacker-0 ya se ha movido este turno: no puede disparar');

    // A quien no tira no se le habla de disparar.
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

  it('`ataqueBlocker` y la lista legal son las dos caras de la misma regla', () => {
    // `null` si y solo si la lista trae un golpe o un disparo contra él, en
    // tableros con y sin tramo, con tiradores y sin ellos.
    const casos: BattleState[] = [];
    for (const [quien, rival] of [
      [TIRADOR, { col: 10, row: 4 }],
      [TIRADOR, { col: 1, row: 4 }],
      [PESADA, { col: 10, row: 4 }],
      [PESADA, { col: 5, row: 4 }],
      [JINETE, { col: 7, row: 2 }],
    ] as const) {
      casos.push(duelo(quien, { col: 0, row: 4 }, TROPA, rival));
      const tramo = duelo(quien, { col: 0, row: 4 }, TROPA, rival);
      applyAction(tramo, { type: 'move', to: { col: 1, row: 3 } }, createRng(1));
      if (tramo.turno?.stack === 'attacker-0') casos.push(tramo);
    }
    let conMotivo = 0;
    for (const st of casos) {
      const ofrece = legalActions(st).some(
        (a) => (a.type === 'attack' || a.type === 'shoot') && a.target === 'defender-0',
      );
      const motivo = ataqueBlocker(st, 'defender-0');
      expect(motivo === null).toBe(ofrece);
      if (motivo !== null) conMotivo++;
    }
    expect(conMotivo).toBeGreaterThan(0);
    expect(conMotivo).toBeLessThan(casos.length);
  });

  it('un tirador que no se ha movido dispara como siempre', () => {
    const state = duelo(TIRADOR, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    // Sin moral: un turno extra dejaría `acted` en falso y no es lo que se mide.
    stackById(state, 'attacker-0').morale = 0;
    applyAction(state, { type: 'shoot', target: 'defender-0' }, createRng(1));
    expect(state.log.some((e) => e.kind === 'shoot')).toBe(true);
    expect(stackById(state, 'attacker-0').acted).toBe(true);
  });

  it('`end_turn` cierra el turno y tira la moral; la moral extra estrena turno con 0 gastado', () => {
    // Moral +3: un turno extra 1 de cada 8 veces. Se buscan semillas hasta ver
    // las dos ramas, y las dos tienen que salir.
    let extra = 0;
    let normal = 0;
    for (let semilla = 1; semilla <= 80; semilla++) {
      const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
        col: 10,
        row: 4,
      });
      const s = stackById(state, 'attacker-0');
      s.morale = 3;
      applyAction(state, { type: 'move', to: { col: 1, row: 4 } }, createRng(semilla));
      const antes = { ...(state.turno as TurnoDeUnidad) };
      applyAction(state, { type: 'end_turn' }, createRng(semilla));
      const buena = state.log.some((e) => e.kind === 'morale' && e.good);
      // Haya extra o no, lo que viene es OTRO turno: el ordinal siguiente.
      expect(state.turno?.n).toBe(antes.n + 1);
      expect(mismoTurno(antes, state.turno)).toBe(false);
      if (buena) {
        extra++;
        // La misma unidad, y aun así otro turno, no el de antes reabierto: es
        // el caso que engañó dos veces a quien miraba solo quién actúa.
        expect(state.turno).toEqual({ n: antes.n + 1, stack: 'attacker-0', gastado: 0 });
        expect(pasosQueQuedan(state, s)).toBe(stackSpeed(s));
      } else {
        normal++;
        expect(s.acted).toBe(true);
        expect(state.turno?.stack).not.toBe('attacker-0');
      }
    }
    expect(extra).toBeGreaterThan(0);
    expect(normal).toBeGreaterThan(0);
  });

  it('una Lentitud a mitad de turno recorta lo que queda, sin bajar de 0', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 10,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    applyAction(state, { type: 'move', to: { col: 3, row: 4 } }, createRng(1));
    expect(pasosQueQuedan(state, s)).toBe(1);
    applyEffect(s, { kind: 'speed', amount: -2, roundsLeft: 2, source: 'slow' });
    expect(stackSpeed(s)).toBe(2);
    expect(pasosQueQuedan(state, s)).toBe(0);
    expect(movableFrom(state, s).size).toBe(0);
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
    const viejo = { firma: firmaDelTurno(turno), puertas: '', costs: movableFrom(state, s) };
    applyAction(state, { type: 'move', to: { col: 1, row: 4 } }, createRng(1));
    expect(() =>
      applyAction(state, { type: 'move', to: { col: 5, row: 4 } }, createRng(1), viejo),
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
    applyAction(state, { type: 'end_turn' }, createRng(1));
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
  // Caballería: muy rápida, 6 casillas, con `charge`.
  it('una recta libre de 3 carga 3; de 2, nada; de 6, el tope de 5', () => {
    const tres = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 4,
      row: 4,
    });
    applyAction(
      tres,
      { type: 'attack', target: 'defender-0', from: { col: 3, row: 4 } },
      createRng(1),
    );
    expect(cargaCobrada(tres)).toBe(3);

    const dos = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 3,
      row: 4,
    });
    applyAction(
      dos,
      { type: 'attack', target: 'defender-0', from: { col: 2, row: 4 } },
      createRng(1),
    );
    expect(cargaCobrada(dos)).toBe(0);
    expect(CARGA_MINIMA).toBe(3);

    const seis = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 7,
      row: 4,
    });
    // La recta se mide entera y el tope lo pone el daño: lo que se ANUNCIA ya
    // viene recortado, para que un «»6» pintado no acabe cobrando 5.
    const jinete = stackById(seis, 'attacker-0');
    expect(cargaDesde(seis, jinete, { col: 6, row: 4 }, stackById(seis, 'defender-0'))).toBe(6);
    expect(cargaEfectiva(6, CARGA.jinete)).toBe(CARGA.jinete.tope);
    expect(casillasDeCarga(seis, jinete)).toEqual([
      { target: 'defender-0', at: { col: 6, row: 4 }, hexes: CARGA.jinete.tope, porciento: 50 },
    ]);
    applyAction(
      seis,
      { type: 'attack', target: 'defender-0', from: { col: 6, row: 4 } },
      createRng(1),
    );
    expect(cargaCobrada(seis)).toBe(5);
  });

  it('una casilla a la que solo se llega con rodeo no carga, por muchos pasos que cueste', () => {
    // (5,5) cuesta 6 pasos —con la regla vieja, el tope— y no está en recta.
    const state = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 5,
      row: 4,
    });
    expect(movableFrom(state, stackById(state, 'attacker-0')).get('5,5')?.steps).toBe(6);
    applyAction(
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
    );
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(state, 'defender-0').hex = { col: 5, row: 4 };
    stackById(state, 'defender-1').hex = { col: 2, row: 4 };
    forzarTurno(state, 'attacker-0');
    const s = stackById(state, 'attacker-0');
    // (4,4) se alcanza rodeando al campesino, pero la recta pasa por él.
    expect(movableFrom(state, s).has('4,4')).toBe(true);
    expect(cargaDesde(state, s, { col: 4, row: 4 }, stackById(state, 'defender-0'))).toBe(0);
    applyAction(
      state,
      { type: 'attack', target: 'defender-0', from: { col: 4, row: 4 } },
      createRng(1),
    );
    expect(cargaCobrada(state)).toBe(0);
  });

  it('se recalcula por tramo: 2 de un tramo y una recta de 3 en el siguiente cargan 3, no 5', () => {
    const state = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 6,
      row: 4,
    });
    applyAction(state, { type: 'move', to: { col: 2, row: 4 } }, createRng(1));
    expect(state.turno).toMatchObject({ stack: 'attacker-0', gastado: 2 });
    applyAction(
      state,
      { type: 'attack', target: 'defender-0', from: { col: 5, row: 4 } },
      createRng(1),
    );
    expect(cargaCobrada(state)).toBe(3);
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
      applyAction(st, a, createRng(1));
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

  it('sin el rasgo no hay carga ni se anuncia', () => {
    const state = duelo(PESADA, { col: 0, row: 4 }, TROPA, {
      col: 4,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    expect(casillasDeCarga(state, s)).toEqual([]);
    expect(cargaDesde(state, s, { col: 3, row: 4 }, stackById(state, 'defender-0'))).toBe(0);
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
    applyAction(state, giro, createRng(1));
    expect(cargaCobrada(state)).toBe(0);
  });

  it('a un enemigo pegado de salida no se le carga: ni quieto ni alejándose para volver', () => {
    const state = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 1,
      row: 4,
    });
    const s = stackById(state, 'attacker-0');
    expect(casillasDeCarga(state, s)).toEqual([]);
    applyAction(state, { type: 'attack', target: 'defender-0' }, createRng(1));
    expect(cargaCobrada(state)).toBe(0);
  });

  it('una casilla vacía de la recta sin nadie detrás no se anuncia: desde ahí solo se mueve', () => {
    // Antes salían todas las de la recta a 3 o más; ahora solo la que tiene al
    // enemigo justo detrás.
    const state = duelo(JINETE, { col: 0, row: 4 }, TROPA, {
      col: 5,
      row: 4,
    });
    expect(casillasDeCarga(state, stackById(state, 'attacker-0'))).toEqual([
      { target: 'defender-0', at: { col: 4, row: 4 }, hexes: 4, porciento: 40 },
    ]);
  });

  it('contra un enemigo de dos casillas basta con que la que sigue a la recta sea una de ellas', () => {
    // El grande defiende mirando a la izquierda: cabeza en (3,2), cola en (4,2).
    // El jinete viene del este por la fila 2 y la recta termina en la COLA.
    const state = duelo(JINETE, { col: 8, row: 2 }, conGrandes(1), { col: 3, row: 2 }, 1);
    const dragon = stackById(state, 'defender-0');
    expect(stackHexes(dragon)).toEqual([
      { col: 3, row: 2 },
      { col: 4, row: 2 },
    ]);
    const s = stackById(state, 'attacker-0');
    expect(cargaDesde(state, s, { col: 5, row: 2 }, dragon)).toBe(3);
    expect(casillasDeCarga(state, s)).toContainEqual({
      target: 'defender-0',
      at: { col: 5, row: 2 },
      hexes: 3,
      porciento: 30,
    });
    applyAction(
      state,
      { type: 'attack', target: 'defender-0', from: { col: 5, row: 2 } },
      createRng(1),
    );
    expect(cargaCobrada(state)).toBe(3);
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

  it('la moral y la suerte se pintan por lo que son para quien lee, no por su signo (#198)', () => {
    // La moral alta del ENEMIGO salía en verde: se pintaba por `good`. Aquí la
    // persona es el atacante (el jinete); el defensor, el no-muerto.
    expect(parte([{ kind: 'morale', stack: 'attacker-0', good: true }])).toContain(
      `<div class="win">Moral alta de ${NOMBRE_A}, de tu bando: turno extra</div>`,
    );
    expect(parte([{ kind: 'morale', stack: 'attacker-0', good: false }])).toContain(
      `<div class="lose">Moral baja de ${NOMBRE_A}, de tu bando: turno perdido</div>`,
    );
    expect(parte([{ kind: 'morale', stack: 'defender-0', good: true }])).toContain(
      `<div class="lose">Moral alta de ${NOMBRE_B}, del enemigo: turno extra</div>`,
    );
    expect(parte([{ kind: 'morale', stack: 'defender-0', good: false }])).toContain(
      `<div class="win">Moral baja de ${NOMBRE_B}, del enemigo: turno perdido</div>`,
    );
    expect(parte([{ kind: 'luck', stack: 'attacker-0', good: true }])).toContain(
      `<div class="win">Golpe afortunado de ${NOMBRE_A}, de tu bando</div>`,
    );
    expect(parte([{ kind: 'luck', stack: 'attacker-0', good: false }])).toContain(
      `<div class="lose">Golpe desafortunado de ${NOMBRE_A}, de tu bando</div>`,
    );
    expect(parte([{ kind: 'luck', stack: 'defender-0', good: true }])).toContain(
      `<div class="lose">Golpe afortunado de ${NOMBRE_B}, del enemigo</div>`,
    );
    expect(parte([{ kind: 'luck', stack: 'defender-0', good: false }])).toContain(
      `<div class="win">Golpe desafortunado de ${NOMBRE_B}, del enemigo</div>`,
    );
  });

  it('en una batalla ajena la moral y la suerte no llevan color: no hay «ti» para el que sean buenas', () => {
    const ajena = parte(
      [
        { kind: 'morale', stack: 'attacker-0', good: true },
        { kind: 'luck', stack: 'defender-0', good: false },
      ],
      'ajena',
    );
    expect(ajena).toContain(`<div>Moral alta de ${NOMBRE_A}, del atacante: turno extra</div>`);
    expect(ajena).toContain(`<div>Golpe desafortunado de ${NOMBRE_B}, del defensor</div>`);
  });

  it('un efecto se pinta por lo que suma o resta a la unidad, dicho desde quien lee (#198)', () => {
    const efecto = (stack: string, amount: number): BattleEvent => ({
      kind: 'effect',
      stack,
      effect: amount > 0 ? 'speed' : 'attack',
      amount,
      source: amount > 0 ? 'haste' : 'fear',
      rounds: amount > 0 ? 3 : 1,
    });
    expect(parte([efecto('attacker-0', 2)])).toContain(
      `<div class="win">Prisa sobre ${NOMBRE_A}, de tu bando: velocidad +2 durante 3 rondas</div>`,
    );
    expect(parte([efecto('attacker-0', -2)])).toContain(
      `<div class="lose">Terror sobre ${NOMBRE_A}, de tu bando: ataque -2 durante 1 ronda</div>`,
    );
    // El terror sobre el enemigo es bueno para ti, y la prisa del enemigo, mala.
    expect(parte([efecto('defender-0', -2)])).toContain(
      `<div class="win">Terror sobre ${NOMBRE_B}, del enemigo: ataque -2 durante 1 ronda</div>`,
    );
    expect(parte([efecto('defender-0', 2)])).toContain(
      `<div class="lose">Prisa sobre ${NOMBRE_B}, del enemigo: velocidad +2 durante 3 rondas</div>`,
    );
  });

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

  it('ataques, disparos y hechizos dicen quién a quién (#18)', () => {
    // «Ataque: 12 de daño, 3 bajas» no decía ni quién ni a quién. Los criterios:
    // nombre del que golpea, flecha, nombre del golpeado, y el modo detrás.
    const golpes = parte([
      {
        kind: 'attack',
        stack: 'attacker-0',
        target: 'defender-0',
        damage: 12,
        killed: 3,
        retaliation: false,
      },
      {
        kind: 'attack',
        stack: 'defender-0',
        target: 'attacker-0',
        damage: 4,
        killed: 1,
        retaliation: true,
      },
      {
        kind: 'attack',
        stack: 'attacker-0',
        target: 'defender-0',
        damage: 20,
        killed: 0,
        retaliation: false,
        charge: 3,
      },
      { kind: 'shoot', stack: 'attacker-0', target: 'defender-0', damage: 8, killed: 1 },
      {
        kind: 'shoot',
        stack: 'attacker-0',
        target: 'defender-0',
        damage: 2,
        killed: 0,
        splash: true,
      },
      {
        kind: 'cast',
        side: 'attacker',
        spell: 'magic_arrow',
        target: 'defender-0',
        damage: 10,
        killed: 2,
      },
      { kind: 'cast', side: 'defender', spell: 'haste', target: 'defender-0' },
    ]);
    expect(golpes).toContain(`<div>${NOMBRE_A}\u00a0→ ${NOMBRE_B}: 12 de daño, 3 bajas</div>`);
    // «1 baja», no «1 bajas».
    expect(golpes).toContain(
      `<div>${NOMBRE_B}\u00a0→ ${NOMBRE_A} (contraataque): 4 de daño, 1 baja</div>`,
    );
    expect(golpes).toContain(
      `<div>${NOMBRE_A}\u00a0→ ${NOMBRE_B} (carga de 3 casillas, +30 %): 20 de daño, 0 bajas</div>`,
    );
    expect(golpes).toContain(
      `<div>${NOMBRE_A}\u00a0→ ${NOMBRE_B} (disparo): 8 de daño, 1 baja</div>`,
    );
    expect(golpes).toContain(
      `<div>${NOMBRE_A}\u00a0→ ${NOMBRE_B} (salpicadura): 2 de daño, 0 bajas</div>`,
    );
    expect(golpes).toContain(
      `<div>Lanzas Flecha mágica sobre ${NOMBRE_B}: 10 de daño, 2 bajas</div>`,
    );
    expect(golpes).toContain(`<div>El enemigo lanza Prisa sobre ${NOMBRE_B}</div>`);
    expect(golpes).not.toMatch(/<div>(Ataque|Contraataque|Disparo|Hechizo)\b/);
  });

  it('un golpe y lo que se disipa dicen el bando cuando el nombre está en los dos', () => {
    // La batalla espejo: «Jinete → Jinete» no dice quién pega a quién.
    const battle = createBattle(
      side([{ creature: JINETE, count: 10 }], hero()),
      side([{ creature: JINETE, count: 10 }]),
      createRng(1),
    );
    battle.log.length = 0;
    battle.log.push(
      {
        kind: 'attack',
        stack: 'attacker-0',
        target: 'defender-0',
        damage: 5,
        killed: 0,
        retaliation: false,
      },
      { kind: 'effect_end', stack: 'defender-0', source: 'slow' },
    );
    const mio = marcadoDe(renderBattleLog(battle, 'attacker'));
    expect(mio).toContain(
      `<div>${NOMBRE_A} (tuyo)\u00a0→ ${NOMBRE_A} (enemigo): 5 de daño, 0 bajas</div>`,
    );
    expect(mio).toContain(`<div>Se disipa Lentitud de ${NOMBRE_A}, del enemigo</div>`);
    const ajena = marcadoDe(renderBattleLog(battle, null));
    expect(ajena).toContain(
      `<div>${NOMBRE_A} (atacante)\u00a0→ ${NOMBRE_A} (defensor): 5 de daño, 0 bajas</div>`,
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
      );
      const piquero = stackById(state, 'attacker-0');
      const campesino = stackById(state, 'defender-0');
      enfrentar(piquero, campesino);
      // Por el motor entero y no por `computeDamage`, que ya ni recibe al héroe:
      // lo que se mira es que nadie se lo sume por otro camino. El turno, a mano:
      // el héroe es más rápido que su tropa.
      forzarTurno(state, 'attacker-0');
      applyAction(state, { type: 'attack', target: 'defender-0' }, rng);
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
      createBattle(side(individuos(TROPA_BARATA, 8)), side(individuos(NO_MUERTO, 3)), createRng(1)),
    ).toThrow('no caben: el atacante trae 8 y un bando lleva como mucho 7');
    expect(() =>
      createBattle(side(individuos(TROPA_BARATA, 3)), side(individuos(NO_MUERTO, 9)), createRng(1)),
    ).toThrow('no caben: el defensor trae 9 y un bando lleva como mucho 7');
  });

  it('siete grandes caben, uno por fila, con la cola dentro del tablero', () => {
    const state = createBattle(side(individuos(TROPA_BARATA, 3)), conGrandes(7), createRng(2));
    const hexes = hexesDe(state, 'defender');
    expect(hexes).toHaveLength(14);
    expect(new Set(hexes).size).toBe(14);
    // La cola del grande defensor queda a su derecha, dentro del tablero.
    for (const s of state.stacks.filter((x) => x.side === 'defender')) {
      expect(stackHexes(s).every((h) => board.isInside(h))).toBe(true);
    }
  });

  it('pocos individuos salen por la misma regla que muchos', () => {
    // No hay caso especial para cinco o menos: del centro hacia fuera en la
    // columna del borde, y la grande con la cabeza una columna hacia dentro.
    // Con las filas de HoMM2 de antes, estos cinco salían en 0, 2, 4, 6 y 8.
    const state = createBattle(side(individuos(TROPA_BARATA, 5)), conGrandes(1), createRng(3));
    const atacantes = state.stacks.filter((s) => s.side === 'attacker');
    expect(atacantes.map((s) => s.hex)).toEqual([4, 3, 5, 2, 6].map((row) => ({ col: 0, row })));
    expect(stackById(state, 'defender-0').hex).toEqual({ col: 10, row: 4 });
  });

  it('con el mismo ejército en los dos lados, el defensor sale en el espejo exacto del atacante', () => {
    // El tablero de filas de 12 y 11 es su propio espejo (11-10-2026): con 11
    // en todas las filas, el defensor de una fila impar salía media casilla más
    // cerca del centro que el atacante de la suya.
    const ejercitos: BattleSide[] = [
      side(individuos(TROPA_BARATA, 7)),
      conGrandes(3, individuos(NO_MUERTO, 4)),
      conGrandes(7),
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
      const state = createBattle(ejercito, ejercito, createRng(5));
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
    // Y con una muralla que es su propio espejo: muros en la salida de los dos
    // lados y la puerta entre la cabeza y la cola de las grandes de la fila 3
    // —impar: en el defensor, entre la 9 y la 10, no la 10 y la 11 de las
    // pares—, que las manda a otra fila en los dos bandos por igual.
    const muros = [
      { col: 2, row: 3 },
      { col: 0, row: 6 },
      { col: 1, row: 2 },
    ];
    const muralla = validarMuralla({
      muros: [...muros, ...muros.map(board.espejo)],
      puertas: [
        { a: { col: 0, row: 3 }, b: { col: 1, row: 3 } },
        { a: board.espejo({ col: 1, row: 3 }), b: board.espejo({ col: 0, row: 3 }) },
      ],
    });
    const ejercito = conGrandes(3, individuos(NO_MUERTO, 4));
    const state = createBattle(ejercito, ejercito, createRng(5), muralla);
    const atacantes = state.stacks.filter((s) => s.side === 'attacker');
    const defensores = state.stacks.filter((s) => s.side === 'defender');
    expect(atacantes.some((s) => s.hex.row === 3 && stackHexes(s).length > 1)).toBe(false);
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
    );
    simular(state, rng);
    expect(state.finished).not.toBeNull();
  });
});

/**
 * Dos pesadas entre un goblin suelto y malherido y diez esqueletos, a cinco
 * casillas de cada uno y los dos ya movidos (que no salte la espera). El goblin
 * y el esqueleto pegan y aguantan lo mismo, así que con `threat / vida` el
 * goblin, a media vida, vale el doble por PV: iba a por él, que muere de un
 * golpe con daño de sobra, mientras los diez le pegaban.
 */
function escenaDeAQuienIr(): BattleState {
  const state = createBattle(
    side([{ creature: PESADA, count: 2 }]),
    side([
      { creature: TROPA_BARATA, count: 1 },
      { creature: NO_MUERTO, count: 10 },
    ]),
    createRng(11),
  );
  const suelto = stackById(state, 'defender-0');
  suelto.topHp = Math.floor(suelto.unit.hp / 2);
  stackById(state, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(state, 'defender-0').hex = { col: 0, row: 4 };
  stackById(state, 'defender-1').hex = { col: 10, row: 4 };
  for (const id of ['defender-0', 'defender-1']) stackById(state, id).acted = true;
  forzarTurno(state, 'attacker-0');
  return state;
}

describe('la IA va a por quien su golpe le quita más amenaza (#79)', () => {
  it('deja al goblin suelto y va a golpear a los diez esqueletos', () => {
    const a = chooseBattleAction(escenaDeAQuienIr());
    expect(a).toMatchObject({ type: 'attack', target: 'defender-1' });
    expect(a.type === 'attack' && a.from !== undefined).toBe(true);
  });
});
