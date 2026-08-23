import { describe, expect, it } from 'vitest';
import {
  activeStack,
  applyAction,
  armyMorale,
  createBattle,
  isAlive,
  legalActions,
  stackById,
  stackSpeed,
  type BattleSide,
} from '../src/core/battle/battle.js';
import {
  applyDamage,
  computeDamage,
  damageMultiplier,
  effectiveAttack,
  stackHp,
} from '../src/core/battle/damage.js';
import { applyEffect, effectiveLuck, effectTotal, tickEffects } from '../src/core/battle/effects.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import type { Rng } from '../src/core/rng.js';
import type { BattleHero, BattleStack, BattleState } from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { simular } from './helpers.js';
import type { Army } from '../src/core/types.js';

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
      side([
        { creature: 'skeleton', count: 40 },
        { creature: 'lich', count: 5 },
        null,
        null,
        null,
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
function enfrentar(a: { hex: { col: number; row: number } }, b: { hex: { col: number; row: number } }): void {
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

  it('un no-muerto es inmune a la maldición, y no se le ofrece lanzarla', () => {
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

    // Y si alguien lo pide a mano de todos modos, rebota en vez de acumularse.
    applyAction(state, { type: 'cast', spell: 'curse', target: 'defender-0' }, rng);
    expect(state.log.some((e) => e.kind === 'immune' && e.source === 'curse')).toBe(true);
    expect(esqueleto.effects).toEqual([]);
    expect(effectiveLuck(esqueleto)).toBe(suerteAntes);
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
    expect(state.log.some((e) => e.kind === 'effect' && e.source === 'fear' && e.effect === 'attack')).toBe(true);

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
    expect(contraVivos.log.some((e) => e.kind === 'effect' && e.source === 'curse_on_hit')).toBe(true);

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
    expect(contraMuertos.log.some((e) => e.kind === 'immune' && e.source === 'curse_on_hit')).toBe(true);
  });

  it('splash_shot: el disparo del liche salpica también a los suyos', () => {
    const rng = createRng(64);
    const state = createBattle(
      side([
        { creature: 'lich', count: 5 },
        { creature: 'skeleton', count: 30 },
        null,
        null,
        null,
      ]),
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
      side([
        { creature: 'lich', count: 5 },
        { creature: 'skeleton', count: 30 },
        null,
        null,
        null,
      ]),
      side([{ creature: 'pikeman', count: 30 }, { creature: 'archer', count: 10 }, null, null, null]),
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
    expect(legalActions(state).some((a) => a.type === 'shoot' && a.target === 'defender-0')).toBe(true);
  });
});
