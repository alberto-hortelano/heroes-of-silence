import { describe, expect, it, vi } from 'vitest';
import { Session } from '../src/client/session.js';
import { renderSide } from '../src/client/views/panels.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  armyMorale,
  type BattleSide,
  createBattle,
  enemiesOf,
  isAlive,
  legalActions,
  movableHexes,
  stackById,
  stackSpeed,
} from '../src/core/battle/battle.js';
import * as board from '../src/core/battle/board.js';
import {
  applyDamage,
  computeDamage,
  damageMultiplier,
  effectiveAttack,
  stackHp,
} from '../src/core/battle/damage.js';
import {
  applyEffect,
  effectiveLuck,
  effectTotal,
  tickEffects,
} from '../src/core/battle/effects.js';
import type {
  BattleEvent,
  BattleHero,
  BattleStack,
  BattleState,
} from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import type { Rng } from '../src/core/rng.js';
import { createRng } from '../src/core/rng.js';
import type { Army, Hex } from '../src/core/types.js';
import { monstruoVivo, simular } from './helpers.js';

/**
 * `reachable` es el BFS del tablero y `movableCosts` es su ÚNICO llamante, así
 * que contarle las llamadas cuenta exactamente los recorridos que hace
 * `legalActions`.
 *
 * Se envuelve el módulo en vez de espiar el export, y no por gusto: la llamada
 * de `movableCosts` va por el enlace local de su módulo, así que un
 * `vi.spyOn(board, 'reachable')` se quedaría mirando un objeto por el que no
 * pasa nadie y contaría cero pase lo que pase. El envoltorio llama al original,
 * de modo que ninguna otra prueba de este fichero cambia de comportamiento.
 */
vi.mock('../src/core/battle/board.js', async (original) => {
  const real = await original<typeof import('../src/core/battle/board.js')>();
  return { ...real, reachable: vi.fn(real.reachable) };
});

const side = (army: Army, hero: BattleHero | null = null): BattleSide => ({ army, hero });

const hero = (over: Partial<BattleHero> = {}): BattleHero => ({
  name: 'Prueba',
  attack: 0,
  defense: 0,
  spellPower: 3,
  knowledge: 3,
  mana: 30,
  castThisRound: false,
  spells: [],
  ...over,
});

/** Un stack suelto, fuera de tablero: para probar lecturas sin montar batalla. */
function stackOf(id: string, count: number): BattleStack {
  return {
    id,
    side: 'attacker',
    slot: 0,
    creature: id,
    count,
    topHp: creature(id).hp,
    hex: { col: 0, row: 0 },
    shotsLeft: 0,
    retaliated: false,
    defending: false,
    waited: false,
    acted: false,
    gotMoraleBonus: false,
    morale: 0,
    luck: 0,
    effects: [],
  };
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
  it('mata efectivos enteros y deja al de arriba herido', () => {
    const s = stackOf('swordsman', 10); // 25 hp cada uno
    expect(stackHp(s)).toBe(250);
    const killed = applyDamage(s, 60);
    expect(killed).toBe(2);
    expect(s.count).toBe(8);
    expect(stackHp(s)).toBe(190);
  });

  it('un daño menor que un efectivo no mata a nadie', () => {
    const s = stackOf('swordsman', 3);
    expect(applyDamage(s, 5)).toBe(0);
    expect(s.count).toBe(3);
    expect(s.topHp).toBe(20);
  });

  it('el exceso de daño no resucita ni deja restos', () => {
    const s = stackOf('peasant', 4);
    expect(applyDamage(s, 9999)).toBe(4);
    expect(s.count).toBe(0);
    expect(stackHp(s)).toBe(0);
  });
});

describe('moral por composición del ejército', () => {
  it('premia al ejército de una sola facción', () => {
    expect(armyMorale([{ creature: 'peasant', count: 10 }, null, null, null, null])).toBe(1);
    expect(
      armyMorale([
        { creature: 'peasant', count: 10 },
        { creature: 'archer', count: 5 },
        null,
        null,
        null,
      ]),
    ).toBe(1);
  });

  it('no premia a un ejército mixto de dos facciones', () => {
    expect(
      armyMorale([
        { creature: 'peasant', count: 10 },
        { creature: 'skeleton', count: 10 },
        null,
        null,
        null,
      ]),
    ).toBe(0);
  });
});

describe('despliegue inicial', () => {
  it('coloca cada bando en su borde y respeta la cola de las unidades grandes', () => {
    const state = createBattle(
      side([{ creature: 'peasant', count: 10 }, null, null, null, null]),
      side([{ creature: 'bone_dragon', count: 1 }, null, null, null, null]),
      createRng(1),
    );
    expect(stackById(state, 'attacker-0').hex.col).toBe(0);
    // El dragón óseo ocupa 2 hexes: arranca en la 9 para que su cola quepa.
    expect(stackById(state, 'defender-0').hex.col).toBe(9);
  });

  it('empieza en la ronda 1 con un stack activo', () => {
    const state = createBattle(
      side([{ creature: 'archer', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      createRng(7),
    );
    expect(state.round).toBe(1);
    expect(activeStack(state)).not.toBeNull();
  });
});

describe('iniciativa', () => {
  it('mueve primero al más rápido', () => {
    const state = createBattle(
      side([{ creature: 'zombie', count: 5 }, null, null, null, null]), // very_slow
      side([{ creature: 'champion', count: 5 }, null, null, null, null]), // ultra_fast
      createRng(3),
    );
    expect(activeStack(state)!.id).toBe('defender-0');
  });

  it('en un empate de velocidad mueve el atacante', () => {
    const state = createBattle(
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      createRng(3),
    );
    expect(activeStack(state)!.id).toBe('attacker-0');
  });

  it('los hechizos de velocidad cambian el orden', () => {
    const state = createBattle(
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
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
      side([{ creature: 'swordsman', count: 20 }, null, null, null, null]),
      side([{ creature: 'pikeman', count: 20 }, null, null, null, null]),
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

  it('los vampiros no reciben contraataque', () => {
    const rng = createRng(5);
    const state = createBattle(
      side([{ creature: 'vampire', count: 10 }, null, null, null, null]),
      side([{ creature: 'peasant', count: 40 }, null, null, null, null]),
      rng,
    );
    simular(state, rng);
    const golpes = state.log.filter((e) => e.kind === 'attack');
    expect(golpes.length).toBeGreaterThan(0);
    expect(golpes.some((e) => e.kind === 'attack' && e.retaliation)).toBe(false);
  });
});

describe('tiradores', () => {
  it('gastan munición al disparar y no pueden hacerlo con un enemigo encima', () => {
    const rng = createRng(21);
    const state = createBattle(
      side([{ creature: 'archer', count: 10 }, null, null, null, null]),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      rng,
    );
    const arquero = stackById(state, 'attacker-0');
    const municionInicial = arquero.shotsLeft;
    const disparo = legalActions(state).find((a) => a.type === 'shoot');
    expect(disparo).toBeDefined();
    applyAction(state, disparo!, rng);
    expect(arquero.shotsLeft).toBe(municionInicial - 1);
    expect(state.log.some((e) => e.kind === 'shoot')).toBe(true);
  });
});

describe('hechizos', () => {
  it('la flecha mágica gasta maná y daña al enemigo', () => {
    const rng = createRng(31);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 10, spellPower: 3 });
    const state = createBattle(
      side([{ creature: 'champion', count: 10 }, null, null, null, null], lanzador),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
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
      side([{ creature: 'champion', count: 10 }, null, null, null, null], lanzador),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
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
      side([{ creature: 'champion', count: 5 }, null, null, null, null]),
      side([{ creature: 'zombie', count: 5 }, null, null, null, null]),
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
 * El activo se fija a mano porque `activeId` es un campo y no una tirada: si la
 * lista dependiera de quién gana la iniciativa, el día que cambie un desempate
 * este test diría que se rompió `legalActions`.
 */
function batallaDeCuatroEnemigos(): BattleState {
  const state = createBattle(
    side([{ creature: 'zombie', count: 5 }, null, null, null, null]),
    side([
      { creature: 'peasant', count: 6 },
      { creature: 'archer', count: 4 },
      { creature: 'pikeman', count: 3 },
      { creature: 'cavalry', count: 2 },
      null,
    ]),
    createRng(7),
  );
  stackById(state, 'attacker-0').hex = { col: 9, row: 3 };
  state.activeId = 'attacker-0';
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
      { type: 'attack', target: 'defender-0', from: { col: 10, row: 2 } },
      { type: 'attack', target: 'defender-0', from: { col: 9, row: 1 } },
      { type: 'attack', target: 'defender-1' },
      { type: 'attack', target: 'defender-1', from: { col: 10, row: 4 } },
      { type: 'attack', target: 'defender-1', from: { col: 10, row: 2 } },
      { type: 'attack', target: 'defender-2', from: { col: 10, row: 4 } },
      { type: 'attack', target: 'defender-2', from: { col: 9, row: 5 } },
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
});

describe('batalla completa', () => {
  it('termina con un solo bando en pie', () => {
    const rng = createRng(1234);
    const state = createBattle(
      side([
        { creature: 'swordsman', count: 20 },
        { creature: 'archer', count: 15 },
        null,
        null,
        null,
      ]),
      side([{ creature: 'skeleton', count: 40 }, { creature: 'lich', count: 5 }, null, null, null]),
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
        side([{ creature: 'pikeman', count: 12 }, null, null, null, null]),
        side([{ creature: 'zombie', count: 18 }, null, null, null, null]),
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
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null], lanzador),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
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
      side([{ creature: 'champion', count: 5 }, null, null, null, null], lanzador),
      side([{ creature: 'skeleton', count: 5 }, null, null, null, null]),
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
    const s = stackOf('pikeman', 10);
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
    const state = createBattle(
      // Uno contra cincuenta: el dragón aguanta dos contraataques y el
      // esqueleto aguanta dos mordiscos, así que la batalla llega entera a la
      // segunda ronda, que es lo que se quiere mirar.
      side([{ creature: 'bone_dragon', count: 1 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 50 }, null, null, null, null]),
      rng,
    );
    const dragon = stackById(state, 'attacker-0');
    const esqueleto = stackById(state, 'defender-0');
    enfrentar(dragon, esqueleto);
    const base = creature('skeleton').attack;

    expect(state.activeId).toBe('attacker-0');
    applyAction(state, { type: 'attack', target: 'defender-0' }, rng);
    expect(effectiveAttack(esqueleto, null)).toBe(base - 2);

    // El esqueleto cierra la ronda y el dragón vuelve a morder con el miedo
    // anterior todavía vivo (le quedaba 1 ronda de las 2).
    applyAction(state, { type: 'defend' }, rng);
    expect(state.round).toBe(2);
    expect(esqueleto.effects.filter((e) => e.source === 'fear')).toHaveLength(1);
    applyAction(state, { type: 'attack', target: 'defender-0' }, rng);

    // Sin política de acumulación esto sería −4 sostenido, y una Lentitud por
    // ronda iría a −2, −4, −6.
    const miedos = esqueleto.effects.filter((e) => e.source === 'fear');
    expect(miedos).toHaveLength(1);
    expect(effectiveAttack(esqueleto, null)).toBe(base - 2);
    // Y refrescar alarga: vuelve a durar las dos rondas enteras.
    expect(miedos[0]!.roundsLeft).toBe(2);
  });

  it('refrescar nunca acorta lo que ya estaba puesto', () => {
    const s = stackOf('skeleton', 10);
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
    const a = stackOf('skeleton', 10);
    applyEffect(a, plantilla);
    tickEffects(a);
    expect(plantilla.roundsLeft).toBe(2);

    const b = stackOf('skeleton', 10);
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
        side([{ creature: 'cavalry', count: 10 }, null, null, null, null]),
        side([{ creature: 'pikeman', count: 40 }, null, null, null, null]),
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
    const jinetes = stackOf('cavalry', 10);
    const piqueros = stackOf('pikeman', 40);
    const cinco = computeDamage(jinetes, null, piqueros, null, createRng(52), { chargeHexes: 5 });
    const siete = computeDamage(jinetes, null, piqueros, null, createRng(52), { chargeHexes: 7 });

    // Por encima del tope, cargar más no pega más. El evento copia lo que la
    // fórmula cobró: si lo dedujera por su cuenta anunciaría «carga de 7 hexes»
    // con el daño de cinco.
    expect(siete.damage).toBe(cinco.damage);
    expect(cinco.charge).toBe(5);
    expect(siete.charge).toBe(5);

    // Y quien no tiene el rasgo no carga por mucho que corra.
    const aPie = computeDamage(piqueros, null, jinetes, null, createRng(52), { chargeHexes: 5 });
    expect(aPie.charge).toBe(0);
  });

  it('fear: el dragón óseo asusta a los no-muertos, que es donde la moral no llega', () => {
    // Espejo nigromante: con el aura de moral del original esto no haría NADA,
    // porque `createBattle` fuerza `morale: 0` a todo lo no-muerto.
    const rng = createRng(61);
    const state = createBattle(
      side([{ creature: 'bone_dragon', count: 2 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 40 }, null, null, null, null]),
      rng,
    );
    const dragon = stackById(state, 'attacker-0');
    const esqueleto = stackById(state, 'defender-0');
    enfrentar(dragon, esqueleto);

    expect(effectiveAttack(esqueleto, null)).toBe(creature('skeleton').attack);
    applyAction(state, { type: 'attack', target: 'defender-0' }, rng);

    expect(esqueleto.effects.some((e) => e.source === 'fear' && e.amount === -2)).toBe(true);
    expect(effectiveAttack(esqueleto, null)).toBe(creature('skeleton').attack - 2);
    expect(
      state.log.some((e) => e.kind === 'effect' && e.source === 'fear' && e.effect === 'attack'),
    ).toBe(true);

    // Y el miedo se nota en el golpe: mismo dado, menos daño.
    const conMiedo = computeDamage(esqueleto, null, dragon, null, createRng(5));
    const sinMiedo = computeDamage({ ...esqueleto, effects: [] }, null, dragon, null, createRng(5));
    expect(conMiedo.damage).toBeLessThan(sinMiedo.damage);
  });

  it('curse_on_hit: la momia maldice a un vivo y rebota en un no-muerto', () => {
    const rng = createRng(62);
    const contraVivos = createBattle(
      side([{ creature: 'mummy', count: 5 }, null, null, null, null]),
      side([{ creature: 'pikeman', count: 30 }, null, null, null, null]),
      rng,
    );
    enfrentar(stackById(contraVivos, 'attacker-0'), stackById(contraVivos, 'defender-0'));
    applyAction(contraVivos, { type: 'attack', target: 'defender-0' }, rng);

    const piquero = stackById(contraVivos, 'defender-0');
    expect(piquero.effects.some((e) => e.source === 'curse_on_hit' && e.amount === -1)).toBe(true);
    expect(effectiveLuck(piquero)).toBe(-1);
    expect(contraVivos.log.some((e) => e.kind === 'effect' && e.source === 'curse_on_hit')).toBe(
      true,
    );

    // Espejo nigromante: una momia no desmoraliza a un esqueleto.
    const rng2 = createRng(63);
    const contraMuertos = createBattle(
      side([{ creature: 'mummy', count: 5 }, null, null, null, null]),
      side([{ creature: 'skeleton', count: 30 }, null, null, null, null]),
      rng2,
    );
    enfrentar(stackById(contraMuertos, 'attacker-0'), stackById(contraMuertos, 'defender-0'));
    applyAction(contraMuertos, { type: 'attack', target: 'defender-0' }, rng2);

    const esqueleto = stackById(contraMuertos, 'defender-0');
    expect(esqueleto.effects).toEqual([]);
    expect(contraMuertos.log.some((e) => e.kind === 'immune' && e.source === 'curse_on_hit')).toBe(
      true,
    );
  });

  it('splash_shot: el disparo del liche salpica también a los suyos', () => {
    const rng = createRng(64);
    const state = createBattle(
      side([{ creature: 'lich', count: 5 }, { creature: 'skeleton', count: 30 }, null, null, null]),
      side([{ creature: 'pikeman', count: 30 }, null, null, null, null]),
      rng,
    );
    const liche = stackById(state, 'attacker-0');
    const aliado = stackById(state, 'attacker-1');
    const objetivo = stackById(state, 'defender-0');
    liche.hex = { col: 0, row: 4 };
    aliado.hex = { col: 5, row: 4 };
    objetivo.hex = { col: 6, row: 4 };

    const aliadoAntes = aliado.count;
    expect(state.activeId).toBe('attacker-0');
    applyAction(state, { type: 'shoot', target: 'defender-0' }, rng);

    expect(aliado.count).toBeLessThan(aliadoAntes);
    expect(
      state.log.some((e) => e.kind === 'shoot' && e.splash === true && e.target === 'attacker-1'),
    ).toBe(true);
  });

  it('splash_shot: la IA no se dispara a los suyos si tiene otro objetivo', () => {
    const rng = createRng(65);
    const state = createBattle(
      side([{ creature: 'lich', count: 5 }, { creature: 'skeleton', count: 30 }, null, null, null]),
      side([
        { creature: 'pikeman', count: 30 },
        { creature: 'archer', count: 10 },
        null,
        null,
        null,
      ]),
      rng,
    );
    stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
    stackById(state, 'attacker-1').hex = { col: 5, row: 4 };
    stackById(state, 'defender-0').hex = { col: 6, row: 4 }; // pegado al aliado
    stackById(state, 'defender-1').hex = { col: 9, row: 1 }; // limpio

    expect(state.activeId).toBe('attacker-0');
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
      side([{ creature: 'champion', count: 10 }, null, null, null, null], heroe),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      session.ctx.rng,
    );
    // El rival es un monstruo REAL del mapa. Con un id inventado la batalla se
    // juega igual mientras nadie la cierre, y el primer test que llamara a
    // `finishBattle()` se estrellaría contra "monstruo no encontrado": un fallo
    // del andamio con toda la pinta de ser del núcleo.
    session.state.pendingBattle = {
      attackerHeroId: session.myHeroes()[0]!.id,
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
    session.selectSpell('haste');

    expect(session.castRejection('defender-0')).toBe('"Prisa" va dirigido a un aliado');
  });

  it('lo que no se puede lanzar no se ofrece, y el motivo está escrito para la persona', () => {
    const { session, heroe } = sesionEnBatalla(62, { spells: ['magic_arrow'], mana: 1 });
    expect(session.spellOptions()[0]!.castable).toBe(false);
    expect(session.spellOptions()[0]!.motivo).toBe('maná insuficiente: cuesta 3 y quedan 1');

    // Y si lo intenta igual, ve el motivo en vez de que no pase nada.
    session.selectSpell('magic_arrow');
    expect(session.selectedSpell).toBeNull();
    expect(session.status).toContain('maná insuficiente');

    heroe.mana = 30;
    heroe.castThisRound = true;
    expect(session.spellOptions().every((o) => !o.castable)).toBe(true);
    expect(session.spellOptions()[0]!.motivo).toMatch(/ya lanzó/);
  });

  it('lanzar sale de las acciones legales, gasta maná y NO consume el turno del stack', () => {
    const { session, heroe, battle } = sesionEnBatalla(63, { spells: ['magic_arrow'], mana: 20 });
    const activoAntes = battle.activeId;
    expect(activoAntes).toBe('attacker-0');

    session.selectSpell('magic_arrow');
    expect(session.selectedSpell).toBe('magic_arrow');
    expect(session.castTargets()).toEqual(['defender-0']);

    // Esto es lo que hace el clic en `main.ts`: buscar, no construir.
    const conjuro = session
      .battleLegalActions()
      .find((a) => a.type === 'cast' && a.spell === 'magic_arrow' && a.target === 'defender-0');
    expect(conjuro).toBeDefined();
    session.playBattleAction(conjuro!);

    expect(heroe.mana).toBe(17);
    expect(battle.activeId).toBe(activoAntes);
    expect(session.selectedSpell).toBeNull();
    // Ya lanzó esta ronda: el libro entero queda apagado hasta la siguiente.
    expect(session.spellOptions().every((o) => !o.castable)).toBe(true);
  });

  it('volver a pulsar el hechizo elegido lo suelta', () => {
    const { session } = sesionEnBatalla(64, { spells: ['magic_arrow'], mana: 20 });
    session.selectSpell('magic_arrow');
    session.selectSpell('magic_arrow');
    expect(session.selectedSpell).toBeNull();
    expect(session.castTargets()).toEqual([]);
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
    side([{ creature: atacante, count: 10 }, null, null, null, null]),
    side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
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
  it('con carga se va a la casilla que más cobra, aunque sea la más lejana', () => {
    const state = escenaDeCarga('cavalry');
    expect(state.activeId).toBe('attacker-0');

    // (4,4) cuesta 5 pasos: el tope de la carga, +50 % de daño. Antes se
    // elegía (2,4), la más barata, que es la que MENOS carga cobra.
    expect(casillaElegida(state)).toEqual({ col: 4, row: 4 });
  });

  it('sin carga no da rodeos: el criterio es el daño, no la distancia', () => {
    // Misma escena y misma disyuntiva, con una unidad sin el rasgo. Todas las
    // casillas pegan lo mismo —`computeDamage` no mira el hex salvo por la
    // carga—, así que irse lejos solo sirve para acabar el turno más expuesto.
    const state = escenaDeCarga('swordsman');
    expect(state.activeId).toBe('attacker-0');
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
      const state = escenaDeCarga('swordsman');
      expect(casillaElegida(state)).toEqual({ col: 2, row: 4 });
    } finally {
      espia.mockImplementation(real);
    }
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
      side([{ creature: 'champion', count: 10 }, null, null, null, null], lanzador),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      rng,
    );

    const decision = chooseBattleAction(state);
    expect(decision).toEqual({ type: 'cast', spell: 'magic_arrow', target: 'defender-0' });

    // La segunda vuelta sobre el MISMO stack devuelve una acción de combate:
    // `castThisRound` corta el bucle, así que la IA no se cuelga lanzando.
    applyAction(state, decision, rng);
    expect(state.activeId).toBe('attacker-0');
    expect(lanzador.mana).toBe(17);
    expect(chooseBattleAction(state).type).not.toBe('cast');
  });

  it('sin maná no lo intenta', () => {
    const rng = createRng(72);
    const lanzador = hero({ spells: ['magic_arrow'], mana: 0, spellPower: 1 });
    const state = createBattle(
      side([{ creature: 'champion', count: 10 }, null, null, null, null], lanzador),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
      rng,
    );
    expect(chooseBattleAction(state).type).not.toBe('cast');
    expect(lanzador.mana).toBe(0);
  });

  it('elige con criterio: una Lentitud sobre un ejército gordo sí, una Prisa sobre tres campesinos no', () => {
    const rng = createRng(73);
    const derrocha = hero({ spells: ['haste'], mana: 30, spellPower: 3 });
    const tacaña = createBattle(
      side([{ creature: 'peasant', count: 3 }, null, null, null, null], derrocha),
      side([{ creature: 'zombie', count: 3 }, null, null, null, null]),
      rng,
    );
    // Medio turno extra de tres campesinos vale ≈1,5: no llega ni de lejos a
    // los 12 que exige gastar 3 de maná.
    expect(chooseBattleAction(tacaña).type).not.toBe('cast');

    const listo = hero({ spells: ['slow'], mana: 30, spellPower: 3 });
    const gorda = createBattle(
      // El cruzado va primero: el turno tiene que ser del bando que tiene héroe
      // para que haya un lanzamiento que decidir.
      side([{ creature: 'crusader', count: 1 }, null, null, null, null], listo),
      side([{ creature: 'zombie', count: 60 }, null, null, null, null]),
      rng,
    );
    // Frenar a sesenta zombis sí: la heurística no es solo de daño.
    expect(chooseBattleAction(gorda)).toEqual({
      type: 'cast',
      spell: 'slow',
      target: 'defender-0',
    });
  });
});

describe('la IA espera en vez de plantarse (#24)', () => {
  it('un refresco no se paga al precio de un lanzamiento nuevo', () => {
    const rng = createRng(75);
    const listo = hero({ spells: ['slow'], mana: 30, spellPower: 3 });
    const state = createBattle(
      side([{ creature: 'crusader', count: 1 }, null, null, null, null], listo),
      side([{ creature: 'zombie', count: 12 }, null, null, null, null]),
      rng,
    );
    const zombis = stackById(state, 'defender-0');

    // Sobre el objetivo limpio compra las tres rondas de golpe y sí sale a
    // cuenta: es el caso con el que se calibró el umbral, y no se toca.
    expect(chooseBattleAction(state)).toEqual({
      type: 'cast',
      spell: 'slow',
      target: 'defender-0',
    });

    // Con la Lentitud ya encima y dos rondas por delante, relanzar solo compra
    // la TERCERA —el mismo origen refresca, no apila—, y a ese precio no sale.
    // Antes la IA la relanzaba cada ronda pagando por tres.
    applyEffect(zombis, { kind: 'speed', amount: -2, source: 'slow', roundsLeft: 2 });
    expect(chooseBattleAction(state).type).not.toBe('cast');
    expect(listo.mana).toBe(30);

    // Y cuando se disipa vuelve a valer la pena: la resta no es un veto.
    zombis.effects = [];
    expect(chooseBattleAction(state).type).toBe('cast');
  });

  it('se defiende cuando no alcanza a nadie ni puede moverse', () => {
    const rng = createRng(74);
    const state = createBattle(
      side([
        { creature: 'champion', count: 5 },
        { creature: 'peasant', count: 5 },
        { creature: 'peasant', count: 5 },
        null,
        null,
      ]),
      side([{ creature: 'zombie', count: 5 }, null, null, null, null]),
      rng,
    );
    // El campeón queda embotellado en la esquina por los suyos: (0,0) solo
    // tiene dos vecinos dentro del tablero y los dos están ocupados.
    stackById(state, 'attacker-0').hex = { col: 0, row: 0 };
    stackById(state, 'attacker-1').hex = { col: 1, row: 0 };
    stackById(state, 'attacker-2').hex = { col: 0, row: 1 };
    stackById(state, 'defender-0').hex = { col: 10, row: 8 };

    expect(state.activeId).toBe('attacker-0');
    expect(movableHexes(state, stackById(state, 'attacker-0'))).toEqual([]);

    // Antes esto era un `wait`, y era una tautología: quien no puede llegarme
    // hoy tampoco llegará al final de la ronda, así que ceder la iniciativa no
    // compra nada y el +20 % de defensa sí. `defend` es la única cola terminal.
    expect(chooseBattleAction(state)).toEqual({ type: 'defend' });
  });
});

/**
 * La escena de #52: campeón del atacante contra un piquero, en la fila 4.
 *
 * El campeón corre 7 hexes y el piquero 4, así que el campeón mueve primero y
 * el piquero le alcanza a 5 (sus pasos más el hex desde el que golpea). Con el
 * piquero al otro extremo, avanzar deja al campeón dentro de ese radio y
 * esperar lo deja pegando al final de la ronda.
 */
function escenaDeEspera(piqueroEn: Hex, piqueroYaActuo = false): BattleState {
  const state = createBattle(
    side([{ creature: 'champion', count: 5 }, null, null, null, null]),
    side([{ creature: 'pikeman', count: 5 }, null, null, null, null]),
    createRng(74),
  );
  stackById(state, 'attacker-0').hex = { col: 0, row: 4 };
  stackById(state, 'defender-0').hex = piqueroEn;
  stackById(state, 'defender-0').acted = piqueroYaActuo;
  return state;
}

describe('la IA cede la iniciativa en vez de meter el morro (#52)', () => {
  it('espera si al avanzar quedaría dentro del alcance de quien aún no ha movido', () => {
    const state = escenaDeEspera({ col: 10, row: 4 });
    expect(state.activeId).toBe('attacker-0');
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
describe('el parte de guerra pinta de quién es cada cosa', () => {
  /**
   * `deQuien` elige a quién pertenece el héroe atacante, que es de donde
   * `session.miBando` deriva el bando de quien lee: `'mio'` deja al jugador de
   * atacante y `'ajena'` monta una batalla del rival contra un monstruo, en la
   * que la persona no lleva ninguno de los dos bandos.
   */
  function parte(eventos: BattleEvent[], deQuien: 'mio' | 'ajena' = 'mio'): string {
    const session = new Session(71);
    const battle = createBattle(
      side([{ creature: 'champion', count: 10 }, null, null, null, null], hero()),
      side([{ creature: 'zombie', count: 10 }, null, null, null, null]),
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
      attackerHeroId: atacante.id,
      foe: { kind: 'monster', objectId: monstruoVivo(session.state).id },
      battle,
    };
    session.scene = 'battle';
    return renderSide(session);
  }

  it('la moral y la suerte se pintan por su signo', () => {
    expect(parte([{ kind: 'morale', stack: 'attacker-0', good: true }])).toContain(
      '<div class="win">Moral alta: turno extra</div>',
    );
    expect(parte([{ kind: 'morale', stack: 'attacker-0', good: false }])).toContain(
      '<div class="lose">Moral baja: turno perdido</div>',
    );
    expect(parte([{ kind: 'luck', stack: 'attacker-0', good: true }])).toContain(
      '<div class="win">¡Golpe afortunado!</div>',
    );
    expect(parte([{ kind: 'luck', stack: 'attacker-0', good: false }])).toContain(
      '<div class="lose">Golpe desafortunado</div>',
    );
  });

  it('un efecto se pinta por lo que suma o resta, no por quién lo puso', () => {
    const prisa = parte([
      {
        kind: 'effect',
        stack: 'attacker-0',
        effect: 'speed',
        amount: 2,
        source: 'haste',
        rounds: 3,
      },
    ]);
    expect(prisa).toContain('<div class="win">Prisa: velocidad +2 durante 3 rondas</div>');

    const miedo = parte([
      {
        kind: 'effect',
        stack: 'attacker-0',
        effect: 'attack',
        amount: -2,
        source: 'fear',
        rounds: 1,
      },
    ]);
    expect(miedo).toContain('<div class="lose">Terror: ataque -2 durante 1 ronda</div>');
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
      '<div class="lose">Una unidad tuya ha sido aniquilada</div>',
    );
    expect(parte([{ kind: 'perished', stack: 'defender-0' }])).toContain(
      '<div class="win">Una unidad enemiga ha sido aniquilada</div>',
    );
  });

  it('en una batalla ajena no se pinta de nadie: ni victoria ni derrota', () => {
    // Sin bando propio no hay «tuya» ni «enemiga» que valga, y tampoco color:
    // inventarse uno es lo que hacía la versión de antes con todo el mundo.
    const ajena = parte([{ kind: 'perished', stack: 'attacker-0' }], 'ajena');
    expect(ajena).toContain('<div>Una unidad ha sido aniquilada</div>');
    expect(ajena).not.toContain('class="lose"');
    expect(ajena).not.toContain('class="win"');
  });

  it('un evento que el parte no cuenta no deja rastro, y ya no cae por un `default`', () => {
    // `move`, `wait` y `defend` están escritos uno a uno con su frase vacía. El
    // `default` que los tapaba tapaba igual al `kind` que se añada mañana; quien
    // lo impide ahora es el `never` del final, roto a mano y visto rojo en `tsc`.
    const mudos = parte([
      { kind: 'move', stack: 'attacker-0', to: { col: 3, row: 3 } },
      { kind: 'wait', stack: 'attacker-0' },
      { kind: 'defend', stack: 'attacker-0' },
    ]);
    expect(mudos).toContain('<h3>Parte de guerra</h3><div class="log"></div>');
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
