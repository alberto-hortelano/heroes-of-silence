/**
 * Lo que sobra tras una batalla (08-11-2026, «Levantar zombi»;
 * docs/agents/2026-11-08-levantar-zombi/): lo levantado de un cadáver vuelve con su
 * bando; si con él no cabe, se deja justo lo que sobra —lo que elige la persona o, si
 * no elige, la regla de la IA—, el equipo de quien se deja va a la mochila del héroe
 * (de una guarnición, se pierde) y la crónica lo cuenta. Un bando sin dueño no se
 * lleva lo levantado. Reglas, no jugabilidad.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/comun/html.js';
import { renderLoQueSobra } from '../src/client/partida/guarnicion.js';
import { Session } from '../src/client/sesion/partida.js';
import { applyAction } from '../src/core/battle/battle.js';
import { stackById } from '../src/core/battle/consultas.js';
import type { BattleState, Side } from '../src/core/battle/types.js';
import { armyLeadership, capacidadDe } from '../src/core/hero/troop.js';
import { settleBattle } from '../src/core/state/cierre.js';
import { heroById, heroesOf } from '../src/core/state/consultas.js';
import { newGame } from '../src/core/state/setup.js';
import { dueñoDeLaCiudad, guarnicionDeLaCiudad } from '../src/core/state/sitios.js';
import {
  dejarBlocker,
  loQueDejaLaIA,
  sobrantesTrasLaBatalla,
} from '../src/core/state/sobrantes.js';
import type { GameState } from '../src/core/state/tipos.js';
import type { Army, Hero, Hex } from '../src/core/types.js';
import { ctx, TROPA_BARATA } from './comun.js';
import { turnoDe } from './magia-de-prueba.js';
import {
  conSuEquipo,
  darLaCiudad,
  ejercito,
  forzarBatalla,
  guarnecer,
  ponerMonstruo,
} from './partida-de-prueba.js';

/** El cadáver de `id`, a mano: muerto en su casilla, con su `perished`. */
function matar(b: BattleState, id: string): Hex {
  const s = stackById(b, id);
  s.count = 0;
  s.topHp = 0;
  b.log.push({ kind: 'perished', stack: id });
  return { ...s.hex };
}

/** Acaba la batalla a mano: los de `pierde`, todos muertos. */
function acabar(b: BattleState, pierde: Side): void {
  for (const s of b.stacks) {
    if (s.side !== pierde || s.count <= 0) continue;
    matar(b, s.id);
  }
  b.finished = { winner: pierde === 'attacker' ? 'defender' : 'attacker' };
}

/**
 * Una partida con el héroe de 0 lleno (`army`) que ataca a dos orcos, levanta un
 * zombi del primero con «Levantar zombi» y gana: la batalla queda pendiente,
 * terminada y sin cerrar.
 */
function conUnZombiDeMas(army: Army): { state: GameState; hero: Hero } {
  const state = newGame({ seed: 41 });
  const c = ctx(41);
  const hero = heroesOf(state, 0)[0] as Hero;
  hero.army = army;
  hero.spells = ['levantar_zombi'];
  hero.mana = 50;
  ponerMonstruo(state, 'orko-dos-armas', 2);
  forzarBatalla(state, c, hero);
  const b = (state.pendingBattle as NonNullable<GameState['pendingBattle']>).battle;
  turnoDe(b, 'attacker', c.rng);
  const at = matar(b, 'defender-0');
  stackById(b, 'attacker-heroe').hex = { col: at.col - 1, row: at.row };
  for (const s of b.stacks) {
    if (s.count > 0 && s.hex.col === at.col && s.hex.row === at.row) s.hex = { col: 0, row: 0 };
  }
  applyAction(b, { type: 'cast', spell: 'levantar_zombi', at }, c.rng);
  expect(b.stacks.at(-1)?.origen).toMatchObject({ unidad: 'zombi', levantadoDe: 'defender-0' });
  acabar(b, 'defender');
  return { state, hero };
}

const LLENO = (): Army => ejercito({ creature: TROPA_BARATA, count: 6 });

describe('lo que sobra (sobrantesTrasLaBatalla, dejarBlocker)', () => {
  it('con el zombi, el ejército del héroe se pasa del cupo y lo dice', () => {
    const { state, hero } = conUnZombiDeMas(LLENO());
    const [s, ...mas] = sobrantesTrasLaBatalla(state);
    expect(mas).toEqual([]);
    expect(s).toMatchObject({
      side: 'attacker',
      dueño: hero.owner,
      quien: { kind: 'heroe', heroe: hero },
      tropa: [
        { creature: TROPA_BARATA, count: 6 },
        { creature: 'zombi', count: 1 },
      ],
      ...capacidadDe(hero, state.combate.tope),
    });
  });

  it('se deja justo lo que sobra: ni menos, ni más, ni de lo que no vuelve', () => {
    const { state } = conUnZombiDeMas(LLENO());
    const s = sobrantesTrasLaBatalla(state)[0];
    if (s === undefined) throw new Error('sin sobrante');
    expect(dejarBlocker(s, {})).toMatch(
      /^aún sobra: serían 7 de 6 individuos y \d+ de \d+ de liderazgo$/,
    );
    expect(dejarBlocker(s, { zombi: 1 })).toBeNull();
    expect(dejarBlocker(s, { [TROPA_BARATA]: 1 })).toBeNull();
    expect(dejarBlocker(s, { [TROPA_BARATA]: 2 })).toMatch(/^dejas de más: aún cabe un /);
    expect(dejarBlocker(s, { zombi: 2 })).toBe('vuelven 1 × Zombie, y no se dejan 2');
    expect(dejarBlocker(s, { 'templario-escudo': 1 })).toMatch(/^no vuelve ningún .* que dejar$/);
  });

  it('la regla de la IA deja lo de menos rango y más barato, y nunca de más', () => {
    const { state } = conUnZombiDeMas(LLENO());
    const s = sobrantesTrasLaBatalla(state)[0];
    if (s === undefined) throw new Error('sin sobrante');
    // Los dos de rango 1: el goblin, más barato que el zombi.
    expect(s.propuesta).toEqual({ [TROPA_BARATA]: 1 });
    expect(dejarBlocker(s, s.propuesta)).toBeNull();
    // Por liderazgo: con un tope corto, la IA deja hasta caber y vuelve lo que quepa.
    const corto = { tope: 7, cupo: 99 };
    const army = ejercito({ creature: TROPA_BARATA, count: 6 }, { creature: 'zombi', count: 1 });
    const d = loQueDejaLaIA(army, corto);
    expect(dejarBlocker({ ...s, ...corto }, d)).toBeNull();
  });
});

describe('el cierre con lo que sobra (settleBattle)', () => {
  it('sin elegir, la regla de la IA: el héroe vuelve en su límite y la crónica lo cuenta', () => {
    const { state, hero } = conUnZombiDeMas(LLENO());
    settleBattle(state, ctx(1));
    const h = heroById(state, hero.id);
    const { tope, cupo } = capacidadDe(h, state.combate.tope);
    expect(h.army.length).toBe(cupo);
    expect(armyLeadership(h.army)).toBeLessThanOrEqual(tope);
    const dejado = state.log.filter((e) => e.kind === 'left_behind');
    expect(dejado).toMatchObject([{ hero: hero.id, site: null, count: 1, lost: [], actor: 0 }]);
    // Después del cierre de la batalla, como sus consecuencias.
    const fin = state.log.findIndex((e) => e.kind === 'battle_ended');
    expect(state.log.indexOf(dejado[0] as (typeof state.log)[number])).toBeGreaterThan(fin);
  });

  it('lo que elige la persona: deja el zombi y se queda con los suyos', () => {
    const { state, hero } = conUnZombiDeMas(LLENO());
    settleBattle(state, ctx(1), { attacker: { zombi: 1 } });
    expect(heroById(state, hero.id).army).toEqual(LLENO());
    expect(state.log.filter((e) => e.kind === 'left_behind')).toMatchObject([
      { creature: 'zombi', count: 1 },
    ]);
  });

  it('con sitio para él, el zombi se queda en el ejército y no se deja nada', () => {
    const { state, hero } = conUnZombiDeMas(ejercito({ creature: TROPA_BARATA, count: 2 }));
    expect(sobrantesTrasLaBatalla(state)).toEqual([]);
    settleBattle(state, ctx(1));
    expect(heroById(state, hero.id).army.map((t) => t.creature)).toEqual([
      TROPA_BARATA,
      TROPA_BARATA,
      'zombi',
    ]);
    expect(state.log.some((e) => e.kind === 'left_behind')).toBe(false);
  });

  it('lo que no vale lanza con su frase, sin tocar la partida', () => {
    const { state } = conUnZombiDeMas(LLENO());
    expect(() => settleBattle(state, ctx(1), { attacker: { [TROPA_BARATA]: 2 } })).toThrow(
      /^no se puede cerrar la batalla: dejas de más/,
    );
    expect(() => settleBattle(state, ctx(1), { defender: { zombi: 1 } })).toThrow(
      'no se puede cerrar la batalla: al defender no le sobra nada que dejar',
    );
    expect(state.pendingBattle).not.toBeNull();
  });

  it('lo que llevaba puesto quien se deja va a la mochila del héroe', () => {
    const armado = conSuEquipo('imperio-piquero', { armadura: 'gambeson' }, 'v-piquero');
    const { state, hero } = conUnZombiDeMas([
      ...ejercito({ creature: TROPA_BARATA, count: 5 }),
      armado,
    ]);
    const antes = heroById(state, hero.id).mochila.length;
    settleBattle(state, ctx(1), { attacker: { 'imperio-piquero': 1 } });
    const h = heroById(state, hero.id);
    expect(h.army.some((t) => t.creature === 'imperio-piquero')).toBe(false);
    expect(h.mochila.length).toBe(antes + 1);
    expect(h.mochila).toContain('gambeson');
  });

  it('un monstruo no se lleva lo levantado: su tropa vuelve sin ello', () => {
    const { state } = conUnZombiDeMas(LLENO());
    const b = (state.pendingBattle as NonNullable<GameState['pendingBattle']>).battle;
    // Gana el monstruo, y en su bando hay uno levantado (como si lo levantara un poder).
    const orco = stackById(b, 'defender-1');
    orco.count = 1;
    orco.topHp = orco.unit.hp;
    const levantado = b.stacks.at(-1) as BattleState['stacks'][number];
    b.stacks[b.stacks.length - 1] = { ...levantado, side: 'defender' };
    for (const s of b.stacks) if (s.side === 'attacker') s.count = 0;
    b.finished = { winner: 'defender' };
    expect(sobrantesTrasLaBatalla(state)).toEqual([]);
    settleBattle(state, ctx(1));
    const monstruo = state.map.objects.find(
      (o) => o.kind === 'monster' && o.creature === 'orko-dos-armas',
    );
    expect(monstruo).toMatchObject({ count: 1 });
  });

  it('el que pierde sin rendirse no deja nada: lo pierde todo, también lo levantado', () => {
    const { state, hero } = conUnZombiDeMas(LLENO());
    const b = (state.pendingBattle as NonNullable<GameState['pendingBattle']>).battle;
    // Gana el monstruo: cae el cuerpo del héroe y su tropa sigue en pie, zombi incluido.
    const orco = stackById(b, 'defender-1');
    orco.count = 1;
    orco.topHp = orco.unit.hp;
    matar(b, 'attacker-heroe');
    b.finished = { winner: 'defender' };
    // Tiene dueño (la regla del dueño, `battleOwners`), pero no vuelve a ningún sitio:
    // no hay nada que elegir, ni que dejar.
    expect(sobrantesTrasLaBatalla(state)).toEqual([]);
    expect(() => settleBattle(state, ctx(1), { attacker: { zombi: 1 } })).toThrow(
      'no se puede cerrar la batalla: al attacker no le sobra nada que dejar',
    );
    settleBattle(state, ctx(1));
    expect(state.log.some((e) => e.kind === 'left_behind')).toBe(false);
    // Vuelve a su base sin tropa, o cae si no tiene.
    const h = state.heroes.find((x) => x.id === hero.id);
    expect(h === undefined || h.army.length === 0).toBe(true);
  });

  it('la guarnición que deja a uno equipado pierde lo que llevaba, y la crónica lo dice', () => {
    const state = newGame({ seed: 7 });
    const c = ctx(7);
    const mio = heroesOf(state, 0)[0] as Hero;
    mio.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    // Una ciudad del rival, con su guarnición llena (el cupo, el tope de la partida).
    const ciudad = state.towns.find(
      (t) => dueñoDeLaCiudad(state, t) === null && guarnicionDeLaCiudad(state, t).length > 0,
    );
    if (ciudad === undefined) throw new Error('sin ciudad neutral');
    darLaCiudad(state, ciudad, 1);
    const armado = conSuEquipo('imperio-piquero', { armadura: 'gambeson' }, 'v-g');
    guarnecer(
      state,
      ciudad,
      [...ejercito({ creature: TROPA_BARATA, count: state.combate.tope - 1 }), armado],
      1,
    );
    forzarBatalla(state, c, mio, ciudad.at);
    const b = (state.pendingBattle as NonNullable<GameState['pendingBattle']>).battle;
    // La guarnición gana y vuelve con uno levantado de más.
    const zombi = {
      ...b.stacks.find((s) => s.side === 'defender'),
    } as BattleState['stacks'][number];
    b.stacks.push({
      ...zombi,
      id: 'defender-99',
      slot: 99,
      origen: {
        kind: 'catalogo',
        unidad: 'zombi',
        oro: 0,
        veterania: null,
        levantadoDe: 'attacker-0',
      },
    });
    acabar(b, 'attacker');
    const [s] = sobrantesTrasLaBatalla(state);
    expect(s).toMatchObject({ side: 'defender', dueño: 1, quien: { kind: 'sitio' } });
    settleBattle(state, c, { defender: { 'imperio-piquero': 1 } });
    expect(guarnicionDeLaCiudad(state, ciudad).some((t) => t.creature === 'imperio-piquero')).toBe(
      false,
    );
    expect(state.log.filter((e) => e.kind === 'left_behind')).toMatchObject([
      {
        hero: null,
        site: ciudad.id,
        creature: 'imperio-piquero',
        count: 1,
        lost: ['gambeson'],
        actor: 1,
      },
    ]);
  });
});

describe('el diálogo de lo que sobra (la persona, en «Continuar»)', () => {
  /** Una sesión con la batalla de su héroe lleno ganada y un zombi levantado de más. */
  function sesionConUnZombiDeMas(army: Army = LLENO()): { s: Session; hero: Hero } {
    const s = new Session(41);
    const hero = s.myHeroes()[0] as Hero;
    hero.army = army;
    ponerMonstruo(s.state, 'orko-dos-armas', 2);
    forzarBatalla(s.state, s.ctx, hero);
    const b = s.state.pendingBattle!.battle;
    // A mano, sin jugar el despliegue: uno levantado de su bando, al final (`levantar`).
    const suyo = b.stacks.find((x) => x.side === 'attacker' && x.origen.kind === 'catalogo')!;
    b.stacks.push({
      ...suyo,
      id: 'attacker-99',
      slot: 99,
      origen: {
        kind: 'catalogo',
        unidad: 'zombi',
        oro: 0,
        veterania: null,
        levantadoDe: 'defender-0',
      },
    });
    acabar(b, 'defender');
    s.scene = 'battle';
    return { s, hero };
  }

  it('«Continuar» no cierra la batalla: abre el diálogo con lo que propone la IA', () => {
    const { s } = sesionConUnZombiDeMas();
    s.finishBattle();
    expect(s.state.pendingBattle).not.toBeNull();
    const v = s.sobrantes;
    expect(v).not.toBeNull();
    expect(v?.motivo).toBeNull();
    expect(v?.filas.map((f) => [f.creature, f.vuelven])).toEqual([
      [TROPA_BARATA, 6],
      ['zombi', 1],
    ]);
    expect(v?.filas.reduce((n, f) => n + f.deja, 0)).toBe(1);
    const marcado = marcadoDe(renderLoQueSobra(v!));
    expect(marcado).toContain('No cabe todo lo que vuelve');
    expect(marcado).toContain('data-action="sobra-seguir" class="primary"');
  });

  it('lo que no vale apaga «Seguir» con la frase del núcleo y no cierra; lo que vale, cierra', () => {
    const { s, hero } = sesionConUnZombiDeMas();
    s.finishBattle();
    // Que no deje nada: aún sobra.
    for (const f of s.sobrantes!.filas) {
      for (let i = 0; i < f.deja; i++) s.cambiarLoQueSobra(f.creature, -1);
    }
    expect(s.sobrantes?.motivo).toMatch(/^aún sobra: serían 7 de 6 individuos/);
    expect(marcadoDe(renderLoQueSobra(s.sobrantes!))).toContain('aria-disabled="true"');
    s.confirmarLoQueSobra();
    expect(s.state.pendingBattle).not.toBeNull();
    expect(s.status).toMatch(/aún sobra/i);
    // Deja el zombi: vale, y «Seguir» cierra la batalla y vuelve al mapa diciéndolo.
    s.cambiarLoQueSobra('zombi', 1);
    expect(s.sobrantes?.motivo).toBeNull();
    s.confirmarLoQueSobra();
    expect(s.state.pendingBattle).toBeNull();
    expect(s.sobrantes).toBeNull();
    expect(heroById(s.state, hero.id).army).toEqual(LLENO());
    expect(s.status).toContain('dejas 1 × Zombie, que no caben');
  });

  it('lo que propone el diálogo es lo que deja la IA al cerrar, aunque uno suba de rango en la batalla', () => {
    // Un goblin (el más barato) y cinco piqueros, llenos, y el zombi de más. El goblin
    // sube al rango 2 en la batalla: sin contar esa experiencia, la IA deja al goblin
    // (rango 1, lo más barato); contándola, dejaría al zombi. Lo que se propone y lo
    // que se aplica tienen que salir de la misma cuenta (H-A de /simplify, 09-11-2026).
    const escenario = (): Session => {
      const { s } = sesionConUnZombiDeMas([
        ...ejercito({ creature: TROPA_BARATA, count: 1 }),
        ...ejercito({ creature: 'imperio-piquero', count: 5 }),
      ]);
      const goblin = stackById(s.state.pendingBattle!.battle, 'attacker-0');
      expect(goblin.origen).toMatchObject({ unidad: TROPA_BARATA });
      goblin.ganado = { ...goblin.ganado, experiencia: 2700 };
      return s;
    };
    const conDialogo = escenario();
    conDialogo.finishBattle();
    const propuesta = conDialogo.sobrantes!.filas.flatMap((f) =>
      f.deja > 0 ? [[f.creature, f.deja]] : [],
    );
    expect(propuesta).toEqual([[TROPA_BARATA, 1]]);
    const sola = escenario();
    settleBattle(sola.state, sola.ctx);
    const dejado = sola.state.log.flatMap((e) =>
      e.kind === 'left_behind' ? [[e.creature, e.count]] : [],
    );
    expect(dejado).toEqual(propuesta);
    // Quien se va no cuenta su ascenso: se deja antes de cobrar la experiencia.
    expect(sola.state.log.some((e) => e.kind === 'troop_rank_up')).toBe(false);
  });

  it('«Resolver sola» también pregunta: juega la batalla y abre el diálogo', () => {
    const { s } = sesionConUnZombiDeMas();
    s.state.pendingBattle!.battle.finished = null;
    // Que quede uno del rival: la IA la juega hasta el final.
    const orco = s.state.pendingBattle!.battle.stacks.find((x) => x.id === 'defender-1')!;
    orco.count = 1;
    orco.topHp = 1;
    s.autoResolveBattle();
    // Con el orco a 1 PV gana el héroe con todos en pie: le sobra uno, y se le pregunta.
    expect(s.state.pendingBattle?.battle.finished).toMatchObject({ winner: 'attacker' });
    expect(s.sobrantes).not.toBeNull();
  });
});
