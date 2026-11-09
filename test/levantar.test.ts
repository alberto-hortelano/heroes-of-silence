/**
 * Levantar un cadáver (08-11-2026, «Levantar zombi»; docs/agents/2026-11-08-levantar-zombi/):
 * el objetivo `cadaver` y el efecto `levantar` en la batalla. Que cada rechazo diga su
 * motivo, qué sale de cada cadáver, que el levantado nazca donde y como dice la regla
 * (sin turno en esta ronda, dentro de la siguiente, sin contar contra el tope) y que el
 * cadáver se gaste. Reglas, no jugabilidad: ninguna cifra se mide.
 */
import { describe, expect, it } from 'vitest';
import { BattleAnimator } from '../src/client/batalla/anim.js';
import { applyAction } from '../src/core/battle/battle.js';
import { cadaverEn, cadaverGastado, stackById } from '../src/core/battle/consultas.js';
import { castBlocker, poderBlocker } from '../src/core/battle/lanzar.js';
import { legalActions } from '../src/core/battle/legalidad.js';
import { createBattle } from '../src/core/battle/montaje.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { resumenDeBatalla } from '../src/core/battle/resumen.js';
import { queLevanta } from '../src/core/battle/spells.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { catalogoDeHechizos } from '../src/core/magia/catalogo.js';
import { createRng } from '../src/core/rng.js';
import { cifrasDeUnidad } from '../src/core/unidad/catalogo.js';
import { bando, mando } from './batalla-de-prueba.js';
import { de, montar, otraVez, turnoDe, turnoDeId } from './magia-de-prueba.js';

const LEVANTAR = de('levantar', {
  entrega: { tipo: 'alcance', casillas: 6 },
  objetivo: 'cadaver',
  efectos: [{ tipo: 'levantar', vivos: 'zombi', de: { zombi: 'esqueleto-guerrero' } }],
});
/** Mata a quien toque, sin armadura. */
const RAYO = de('rayo', {
  objetivo: 'cualquiera',
  efectos: [{ tipo: 'danio', cantidad: 999, armadura: false }],
});

/** La batalla de `montar` con el orco de (6,4) ya muerto: su cadáver, en (6,4). */
function conUnCadaver(hechizos = [LEVANTAR, RAYO]) {
  const m = montar(hechizos);
  applyAction(m.b, { type: 'cast', spell: 'rayo', target: 'defender-0' }, m.rng);
  otraVez(m.b);
  return m;
}

const AQUI = { col: 6, row: 4 };

/** Un stack de `unidad` muerto, para preguntar qué sale de él. */
function muerto(unidad: string): Pick<BattleStack, 'origen' | 'unit'> {
  return {
    origen: { kind: 'catalogo', unidad, oro: 0, veterania: null },
    unit: cifrasDeUnidad(unidad, undefined),
  };
}

describe('qué sale de cada cadáver (queLevanta)', () => {
  it('de un vivo de cualquier bando, un zombi; del zombi, un esqueleto; del esqueleto y otros no-muertos, nada', () => {
    expect(queLevanta(LEVANTAR, muerto('templario-escudo'))).toBe('zombi');
    expect(queLevanta(LEVANTAR, muerto('orko-dos-armas'))).toBe('zombi');
    expect(queLevanta(LEVANTAR, muerto('zombi'))).toBe('esqueleto-guerrero');
    expect(queLevanta(LEVANTAR, muerto('esqueleto-guerrero'))).toBeNull();
    expect(queLevanta(LEVANTAR, muerto('esqueleto-arquero'))).toBeNull();
    expect(queLevanta(LEVANTAR, muerto('espectro'))).toBeNull();
    expect(queLevanta(LEVANTAR, muerto('caballero-de-la-muerte'))).toBeNull();
  });

  it('del cuerpo del héroe, nada', () => {
    const cuerpo = {
      origen: { kind: 'heroe' as const, desnudo: cifrasDeUnidad('zombi', undefined) },
      unit: cifrasDeUnidad('zombi', undefined),
    };
    expect(queLevanta(LEVANTAR, cuerpo)).toBeNull();
  });
});

describe('los rechazos, con su motivo (castBlocker)', () => {
  it('sin ningún cadáver en el tablero, el botón lo dice', () => {
    const { b } = montar([LEVANTAR]);
    expect(castBlocker(b, 'attacker', 'levantar')).toBe('no hay ningún cadáver que levantar');
    expect(legalActions(b).filter((a) => a.type === 'cast')).toEqual([]);
  });

  it('una casilla sin cadáver, una con alguien vivo y una fuera de alcance', () => {
    const { b } = conUnCadaver();
    expect(castBlocker(b, 'attacker', 'levantar')).toBeNull();
    expect(castBlocker(b, 'attacker', 'levantar', undefined, { col: 5, row: 5 })).toBe(
      'en (5,5) no hay ningún cadáver',
    );
    expect(castBlocker(b, 'attacker', 'levantar', undefined, { col: 7, row: 4 })).toMatch(
      /^en \(7,4\) hay una unidad viva \(/,
    );
    expect(castBlocker(b, 'attacker', 'levantar', 'defender-0')).toBe(
      '«levantar» se lanza a un cadáver',
    );
    const corto = de('levantar', { ...LEVANTAR, entrega: { tipo: 'alcance', casillas: 2 } });
    const { b: b2 } = conUnCadaver([corto, RAYO]);
    expect(castBlocker(b2, 'attacker', 'levantar', undefined, AQUI)).toBe(
      '«levantar» llega a 2 casillas, y eso está a 4',
    );
  });

  it('un cadáver con alguien vivo encima no se levanta', () => {
    const { b } = conUnCadaver();
    stackById(b, 'defender-1').hex = { ...AQUI };
    expect(castBlocker(b, 'attacker', 'levantar', undefined, AQUI)).toMatch(
      /^en \(6,4\) hay una unidad viva/,
    );
  });

  it('el cuerpo del héroe no se levanta', () => {
    const rng = createRng(5);
    const b = createBattle(
      bando([{ creature: 'templario-escudo', count: 1 }], {
        heroe: mando({ spells: ['levantar'], mana: 99 }),
      }),
      bando([{ creature: 'orko-dos-armas', count: 1 }], { heroe: mando({ spells: [] }) }),
      rng,
      COMBATE_COMPLETO,
      SIN_MURALLA,
      catalogoDeHechizos([LEVANTAR]),
    );
    turnoDe(b, 'attacker', rng);
    // A mano y sin cerrar la batalla: con el héroe muerto acabaría, y la regla se
    // pregunta igual (lo que no vale no depende de que la batalla siga).
    const cuerpo = stackById(b, 'defender-heroe');
    cuerpo.count = 0;
    cuerpo.hex = { col: 5, row: 4 };
    b.log.push({ kind: 'perished', stack: cuerpo.id });
    expect(castBlocker(b, 'attacker', 'levantar', undefined, { col: 5, row: 4 })).toBe(
      'el cuerpo del héroe no se levanta',
    );
  });
});

describe('levantar', () => {
  it('nace en la casilla del cadáver, del bando de quien lo lanza, sin turno esta ronda; el cadáver se gasta', () => {
    const { b, rng } = conUnCadaver();
    const antes = b.stacks.length;
    const ronda = b.round;
    // `legalActions` ofrece la casilla del cadáver.
    expect(legalActions(b)).toContainEqual({ type: 'cast', spell: 'levantar', at: AQUI });
    const desde = b.log.length;
    applyAction(b, { type: 'cast', spell: 'levantar', at: AQUI }, rng);
    expect(b.stacks).toHaveLength(antes + 1);
    const z = b.stacks.at(-1) as BattleStack;
    // El héroe es el 2 de la izquierda (dos de tropa): el levantado, el 3.
    expect(z).toMatchObject({
      id: 'attacker-3',
      side: 'attacker',
      slot: 3,
      hex: AQUI,
      count: 1,
      initialCount: 1,
      acted: true,
      morale: 0,
      origen: { kind: 'catalogo', unidad: 'zombi', veterania: null, levantadoDe: 'defender-0' },
    });
    expect(z.unit).toEqual(cifrasDeUnidad('zombi', undefined));
    expect(b.log.slice(desde)).toEqual([
      { kind: 'cast', side: 'attacker', spell: 'levantar', at: AQUI },
      {
        kind: 'raised',
        stack: 'attacker-3',
        from: 'defender-0',
        spell: 'levantar',
        side: 'attacker',
        at: AQUI,
      },
    ]);
    expect(cadaverGastado(b, stackById(b, 'defender-0'))).toBe(true);
    expect(cadaverEn(b, AQUI)).toBeNull();
    // Fuera de la cola de esta ronda; dentro de la siguiente.
    expect(b.queue).not.toContain('attacker-3');
    turnoDeId(b, 'attacker-3', rng);
    expect(b.round).toBe(ronda + 1);
  });

  it('el cadáver gastado no vale para otro lanzamiento, y se dice', () => {
    const { b, rng } = conUnCadaver();
    applyAction(b, { type: 'cast', spell: 'levantar', at: AQUI }, rng);
    otraVez(b);
    // El zombi se aparta: en (6,4) solo queda el cadáver gastado.
    stackById(b, 'attacker-3').hex = { col: 5, row: 6 };
    expect(castBlocker(b, 'attacker', 'levantar', undefined, AQUI)).toBe(
      'el cadáver de (6,4) ya se levantó',
    );
  });

  it('del cadáver del zombi, un esqueleto; del esqueleto, nada', () => {
    const { b, rng } = conUnCadaver();
    applyAction(b, { type: 'cast', spell: 'levantar', at: AQUI }, rng);
    otraVez(b);
    applyAction(b, { type: 'cast', spell: 'rayo', target: 'attacker-3' }, rng);
    otraVez(b);
    // En (6,4), el orco (gastado) y el zombi, el último en caer.
    expect(cadaverEn(b, AQUI)?.id).toBe('attacker-3');
    applyAction(b, { type: 'cast', spell: 'levantar', at: AQUI }, rng);
    const esqueleto = b.stacks.at(-1) as BattleStack;
    expect(esqueleto.origen).toMatchObject({
      unidad: 'esqueleto-guerrero',
      levantadoDe: 'attacker-3',
    });
    expect(esqueleto.id).toBe('attacker-4');
    otraVez(b);
    applyAction(b, { type: 'cast', spell: 'rayo', target: esqueleto.id }, rng);
    otraVez(b);
    expect(castBlocker(b, 'attacker', 'levantar', undefined, AQUI)).toBe(
      '«levantar» no levanta nada del cadáver de Esqueleto guerrero',
    );
  });

  it('no cuenta contra el tope de tropa: con el bando lleno, se levanta igual', () => {
    const rng = createRng(3);
    const b = createBattle(
      bando(
        [
          { creature: 'templario-escudo', count: 1 },
          { creature: 'templario-escudo', count: 1 },
        ],
        {
          heroe: mando({ spells: ['levantar', 'rayo'], mana: 99 }),
        },
      ),
      bando([
        { creature: 'orko-dos-armas', count: 1 },
        { creature: 'orko-dos-armas', count: 1 },
      ]),
      rng,
      { ...COMBATE_COMPLETO, tope: 3 },
      SIN_MURALLA,
      catalogoDeHechizos([LEVANTAR, RAYO]),
    );
    turnoDe(b, 'attacker', rng);
    const orco = stackById(b, 'defender-0');
    applyAction(b, { type: 'cast', spell: 'rayo', target: orco.id }, rng);
    otraVez(b);
    const at = { ...orco.hex };
    // Que esté a su alcance: el héroe, a su lado.
    stackById(b, 'attacker-heroe').hex = { col: at.col - 1, row: at.row };
    applyAction(b, { type: 'cast', spell: 'levantar', at }, rng);
    expect(b.stacks.filter((s) => s.side === 'attacker' && s.count > 0)).toHaveLength(4);
  });

  it('como poder de una unidad, lo mismo: lo levanta su bando', () => {
    const { b, rng } = conUnCadaver();
    // A mano: el escudero de (3,4) sabe levantar (los poderes los pone el catálogo).
    const s = stackById(b, 'attacker-0');
    (s as { unit: BattleStack['unit'] }).unit = { ...s.unit, poderes: ['levantar'] };
    turnoDeId(b, 'attacker-0', rng);
    expect(poderBlocker(b, 'levantar', undefined, AQUI)).toBeNull();
    applyAction(b, { type: 'power', poder: 'levantar', at: AQUI }, rng);
    expect(b.stacks.at(-1)?.origen).toMatchObject({ unidad: 'zombi', levantadoDe: 'defender-0' });
    expect(b.log.some((e) => e.kind === 'raised' && e.side === 'attacker')).toBe(true);
  });

  it('un levantado que cae cuenta como una baja más en el resumen, y no lo rompe', () => {
    const { b, rng } = conUnCadaver();
    applyAction(b, { type: 'cast', spell: 'levantar', at: AQUI }, rng);
    otraVez(b);
    applyAction(b, { type: 'cast', spell: 'rayo', target: 'attacker-3' }, rng);
    // Que acabe: los dos que quedan del rival, fuera.
    otraVez(b);
    applyAction(b, { type: 'cast', spell: 'rayo', target: 'defender-1' }, rng);
    const r = resumenDeBatalla(b as BattleState);
    expect(r.lost.attacker).toContainEqual({ creature: 'zombi', count: 1 });
    expect(r.casts.map((c) => c.spell)).toContain('levantar');
  });
});

describe('lo levantado en pantalla (el animador)', () => {
  it('el levantado no se ve hasta contarse su paso; después, se ve y el cadáver deja de pintarse', () => {
    const { b, rng } = conUnCadaver();
    const a = new BattleAnimator();
    a.observe(b);
    a.tick(0);
    applyAction(b, { type: 'cast', spell: 'levantar', at: AQUI }, rng);
    a.observe(b);
    const zombi = stackById(b, 'attacker-3');
    const orco = stackById(b, 'defender-0');
    a.tick(1);
    // Mientras se cuenta el lanzamiento: el zombi aún no, el cadáver aún sí.
    expect(a.figura(zombi)).toMatchObject({ visible: false, caida: null });
    expect(a.figura(orco).caida).not.toBeNull();
    // Contado todo: el zombi en su casilla, el cadáver fuera.
    a.tick(60_000);
    expect(a.figura(zombi)).toMatchObject({ visible: true });
    expect(a.figura(orco)).toMatchObject({ visible: false, caida: null });
    // Una batalla que ya trae lo levantado (el espectador que llega tarde): igual, sin cola.
    const otro = new BattleAnimator();
    otro.observe(b);
    otro.tick(0);
    expect(otro.figura(zombi).visible).toBe(true);
    expect(otro.figura(orco)).toMatchObject({ visible: false, caida: null });
  });
});
