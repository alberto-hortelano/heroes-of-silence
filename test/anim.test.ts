/**
 * La cola de la batalla: lo que el motor resuelve de golpe se cuenta en orden,
 * y mientras se cuenta no se aceptan clics.
 *
 * El reloj lo pone `tick`, una vez por fotograma; las lecturas no lo tocan.
 */
import { describe, expect, it } from 'vitest';
import { BattleAnimator, DURACION } from '../src/client/anim.js';
import { planoDeHex } from '../src/client/render/proyeccion.js';
import { createBattle } from '../src/core/battle/battle.js';
import type { BattleState } from '../src/core/battle/types.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import { ejercito } from './helpers.js';

function batalla(): BattleState {
  return createBattle(
    { army: troopsAsStacks(ejercito({ creature: 'peasant', count: 2 })), hero: null },
    { army: troopsAsStacks(ejercito({ creature: 'skeleton', count: 2 })), hero: null },
    createRng(1),
  );
}

describe('el animador de batalla', () => {
  it('la primera lectura no anima nada: toma las posiciones de ahora', () => {
    const t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    expect(a.busy).toBe(false);
    const s = b.stacks[0]!;
    expect(a.figura(s).en).toEqual(planoDeHex(s.hex));
  });

  it('un movimiento se interpola y bloquea hasta acabar; dos van uno detrás de otro', () => {
    let t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    const [s1, s2] = b.stacks as [BattleState['stacks'][number], BattleState['stacks'][number]];
    const desde1 = planoDeHex(s1.hex);
    const desde2 = planoDeHex(s2.hex);
    const destino1 = { col: s1.hex.col + 2, row: s1.hex.row };
    const destino2 = { col: s2.hex.col + 1, row: s2.hex.row };
    // Lo que haría el motor: mover y apuntarlo en el registro.
    s1.hex = destino1;
    b.log.push({ kind: 'move', stack: s1.id, to: destino1 });
    s2.hex = destino2;
    b.log.push({ kind: 'move', stack: s2.id, to: destino2 });
    a.observe(b);
    a.tick(t);

    expect(a.busy).toBe(true);
    t = DURACION.move / 2;
    a.tick(t);
    const medio = a.figura(s1);
    expect(medio.clip).toBe('walk');
    expect(medio.en.x).toBeCloseTo((desde1.x + planoDeHex(destino1).x) / 2);
    // El segundo espera su turno en su sitio de antes.
    expect(a.figura(s2).en).toEqual(desde2);

    t = DURACION.move + 1;
    a.tick(t);
    expect(a.figura(s1).en).toEqual(planoDeHex(destino1));
    expect(a.figura(s2).clip).toBe('walk');
    t = DURACION.move * 2 + 2;
    a.tick(t);
    expect(a.busy).toBe(false);
    expect(a.figura(s2).en).toEqual(planoDeHex(destino2));
  });

  it('una unidad que cae se sigue viendo hasta que su caída se ha contado', () => {
    let t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    const [atacante, , victima] = b.stacks as BattleState['stacks'];
    victima!.count = 0;
    b.log.push({
      kind: 'attack',
      stack: atacante!.id,
      target: victima!.id,
      damage: 5,
      killed: 1,
      retaliation: false,
    });
    b.log.push({ kind: 'perished', stack: victima!.id });
    a.observe(b);
    a.tick(t);
    expect(a.figura(victima!).visible).toBe(true);
    expect(a.figura(atacante!).clip).toBe('attack');
    expect(a.efectos(b).some((e) => e.tipo === 'danio')).toBe(false);
    t = DURACION.attack * 0.8;
    a.tick(t);
    expect(a.efectos(b).some((e) => e.tipo === 'danio')).toBe(true);
    t = DURACION.attack + DURACION.perished + 2;
    a.tick(t);
    expect(a.figura(victima!).visible).toBe(false);
    expect(a.busy).toBe(false);
  });

  it('preguntar si está ocupado no mueve la cola: solo la mueve el reloj', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 1, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino });
    a.observe(b);
    a.tick(0);
    // Ya ha pasado de sobra lo que dura el paso, pero nadie ha dado la hora.
    for (let i = 0; i < 3; i++) expect(a.busy).toBe(true);
    expect(a.figura(s1).clip).toBe('walk');
    a.tick(DURACION.move + 1);
    expect(a.busy).toBe(false);
  });

  it('la misma batalla recién parseada no se reinicia: lo nuevo del registro se encola', () => {
    // Lo que le pasa al espectador: cada fotograma del cable trae otro objeto.
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(structuredClone(b), 1);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 2, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino });
    const otraCopia = structuredClone(b);
    a.observe(otraCopia, 1);
    a.tick(DURACION.move / 2);
    expect(a.busy).toBe(true);
    expect(a.figura(otraCopia.stacks[0]!).clip).toBe('walk');
    // Otra batalla, aunque el registro sea igual de largo, empieza quieta.
    a.observe(structuredClone(b), 2);
    a.tick(DURACION.move / 2);
    expect(a.busy).toBe(false);
  });

  it('a ritmo 2 un paso dura la mitad, y cambiar el ritmo a mitad no mueve el que ya va', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 1, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino });
    a.velocidad = 2;
    a.observe(b);
    a.tick(0);
    // Ya empezado a ritmo 2: volver a 1 no lo estira.
    a.velocidad = 1;
    a.tick(DURACION.move / 2 - 1);
    expect(a.busy).toBe(true);
    a.tick(DURACION.move / 2 + 1);
    expect(a.busy).toBe(false);
    expect(a.figura(s1).en).toEqual(planoDeHex(destino));
  });
});
