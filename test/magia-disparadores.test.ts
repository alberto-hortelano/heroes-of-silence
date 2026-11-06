/**
 * Los disparadores de un hechizo (06-11-2026, el editor de magia): los tres del
 * usuario —Zombi pegajoso, Luz cegadora, Berserker— de punta a punta, y las
 * reacciones con cargas y al morir. Reglas, no jugabilidad.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, ataqueBlocker, legalActions, stackById } from '../src/core/battle/battle.js';
import { danioPorIndividuo, effectiveAttack, stackHp } from '../src/core/battle/damage.js';
import type { BattleState } from '../src/core/battle/types.js';
import { hechizo } from '../src/core/magia/catalogo.js';
import type { Rng } from '../src/core/rng.js';
import { de, montar, otraVez, turnoDe, turnoDeId } from './magia-de-prueba.js';

/** Que `quien` golpee cuerpo a cuerpo a `a` (pegados), Normal contra Normal. */
function golpear(b: BattleState, rng: Rng, quien: string, a: string): void {
  turnoDeId(b, quien, rng);
  applyAction(b, { type: 'attack', target: a, golpe: 'normal', respuesta: 'normal' }, rng);
}

/** Un rayo de prueba que mata a cualquiera, sin armadura. */
const RAYO = de('rayo', {
  objetivo: 'cualquiera',
  efectos: [{ tipo: 'danio', cantidad: 999, armadura: false }],
});

/** El orco pegado al escudero de (3,4). */
const PEGADO = { 'defender-0': { col: 4, row: 4 } };

describe('Zombi pegajoso', () => {
  it('al que le golpea le impide golpear y disparar hasta el próximo turno del zombi', () => {
    const { b, rng } = montar([hechizo('zombi_pegajoso')], { casillas: PEGADO });
    applyAction(b, { type: 'cast', spell: 'zombi_pegajoso', target: 'attacker-0' }, rng);
    expect(stackById(b, 'attacker-0').effects[0]).toMatchObject({
      kind: 'disparador',
      roundsLeft: 100,
    });
    // El orco es más rápido que el escudero: para que su próximo turno llegue antes
    // que el del zombi, el zombi se queda sin turno en esta ronda.
    turnoDeId(b, 'defender-0', rng);
    b.queue = b.queue.filter((id) => id !== 'attacker-0');
    golpear(b, rng, 'defender-0', 'attacker-0');
    const orco = stackById(b, 'defender-0');
    expect(orco.effects).toEqual([
      expect.objectContaining({
        kind: 'impide',
        que: ['golpear', 'disparar'],
        hasta: expect.objectContaining({ al: 'empezar', de: 'attacker-0' }),
        seAcabaSiMuere: 'attacker-0',
      }),
    ]);
    expect(b.log.some((e) => e.kind === 'triggered' && e.spell === 'zombi_pegajoso')).toBe(true);
    // Su próximo turno, sin golpe ni disparo, con el motivo del núcleo.
    turnoDeId(b, 'defender-0', rng);
    expect(legalActions(b).some((a) => a.type === 'attack')).toBe(false);
    expect(ataqueBlocker(b, 'attacker-0')).toMatch(/no puede golpear \(Zombi pegajoso\)/);
    // Llega el turno del zombi: el orco ya puede.
    turnoDeId(b, 'attacker-0', rng);
    expect(orco.effects).toHaveLength(0);
  });

  it('si el zombi cae, el que le golpeó vuelve a poder', () => {
    const { b, rng } = montar([hechizo('zombi_pegajoso'), RAYO], { casillas: PEGADO });
    applyAction(b, { type: 'cast', spell: 'zombi_pegajoso', target: 'attacker-0' }, rng);
    turnoDeId(b, 'defender-0', rng);
    b.queue = b.queue.filter((id) => id !== 'attacker-0');
    golpear(b, rng, 'defender-0', 'attacker-0');
    const zombi = stackById(b, 'attacker-0');
    const orco = stackById(b, 'defender-0');
    expect(zombi.count).toBeGreaterThan(0);
    expect(orco.effects).toHaveLength(1);
    turnoDe(b, 'attacker', rng);
    otraVez(b);
    applyAction(b, { type: 'cast', spell: 'rayo', target: zombi.id }, rng);
    expect(zombi.count).toBe(0);
    expect(orco.effects).toHaveLength(0);
  });
});

describe('Luz cegadora', () => {
  it('al lanzarse, los enemigos pegados al aliado atacan peor; los de lejos, no', () => {
    const { b, rng } = montar([hechizo('luz_cegadora')], { casillas: PEGADO });
    const orco = stackById(b, 'defender-0');
    const lejos = stackById(b, 'defender-1');
    const ataque = effectiveAttack(orco);
    const ataqueLejos = effectiveAttack(lejos);
    applyAction(b, { type: 'cast', spell: 'luz_cegadora', target: 'attacker-0' }, rng);
    expect(effectiveAttack(orco)).toBe(ataque - 3);
    expect(effectiveAttack(lejos)).toBe(ataqueLejos);
  });
});

describe('Berserker', () => {
  it('fuerza +3, y al empezar cada turno suyo se hiere 6 sin armadura', () => {
    const { b, rng } = montar([hechizo('berserker')]);
    const s = stackById(b, 'attacker-1');
    const [lo] = danioPorIndividuo(s);
    applyAction(b, { type: 'cast', spell: 'berserker', target: s.id }, rng);
    expect(danioPorIndividuo(s)[0]).toBe(lo + 3);
    const antes = stackHp(s);
    turnoDeId(b, s.id, rng);
    expect(stackHp(s)).toBe(antes - 6);
  });
});

describe('las reacciones', () => {
  it('con cargas, salta las veces que dice y se quita', () => {
    const replica = de('replica', {
      objetivo: 'aliado',
      duracion: 'pelea',
      efectos: [
        {
          tipo: 'disparador',
          cuando: 'alSerGolpeado',
          a: 'otro',
          cargas: 1,
          efectos: [{ tipo: 'danio', cantidad: 4, armadura: false }],
        },
      ],
    });
    const { b, rng } = montar([replica], { casillas: PEGADO });
    applyAction(b, { type: 'cast', spell: 'replica', target: 'attacker-0' }, rng);
    const orco = stackById(b, 'defender-0');
    const antes = stackHp(orco);
    golpear(b, rng, 'defender-0', 'attacker-0');
    expect(b.log.filter((e) => e.kind === 'triggered')).toHaveLength(1);
    expect(b.log.some((e) => e.kind === 'spell_hit' && e.stack === orco.id && e.damage === 4)).toBe(
      true,
    );
    expect(stackHp(orco)).toBeLessThanOrEqual(antes - 4);
    expect(stackById(b, 'attacker-0').effects.some((e) => e.kind === 'disparador')).toBe(false);
  });

  it('al morir, hiere a los de alrededor que dice, y a nadie más', () => {
    const { b, rng } = montar([hechizo('venganza_postuma'), RAYO], { casillas: PEGADO });
    applyAction(b, { type: 'cast', spell: 'venganza_postuma', target: 'attacker-0' }, rng);
    const orco = stackById(b, 'defender-0');
    const antes = stackHp(orco);
    otraVez(b);
    applyAction(b, { type: 'cast', spell: 'rayo', target: 'attacker-0' }, rng);
    expect(stackById(b, 'attacker-0').count).toBe(0);
    expect(stackHp(orco)).toBe(Math.max(0, antes - 20));
    expect(stackHp(stackById(b, 'defender-1'))).toBe(stackById(b, 'defender-1').unit.hp);
  });
});
