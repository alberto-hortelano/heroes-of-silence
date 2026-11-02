/**
 * La granada (02-11-2026, regla nuestra; `docs/agents/2026-11-02-armas-de-fuego-y-granadas/`):
 * se lanza por encima a una casilla a la fuerza del cuerpo de quien la lanza, explota
 * al empezar su siguiente turno en ella (el cuarto 4 de la horquilla) y en sus seis
 * vecinas (el 2), a todo vivo de cualquier bando, con la armadura restada, sin dado,
 * y se gasta. Escrito desde los criterios 1 y 6-8 de los requisitos, con las unidades
 * del imperio del catálogo.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import {
  applyAction,
  createBattle,
  granadasQueQuedan,
  lanzarBlocker,
  legalActions,
  loADistanciaTrasElRetoque,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import { herir } from '../src/core/battle/damage.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng, type Rng } from '../src/core/rng.js';
import { avanzarHasta, forzarTurno } from './helpers.js';

/**
 * El granadero (fuerza 6: alcance 6) en (1,4) con un piquero suyo en (4,4), contra dos
 * coraceros (brigantina: 2 de armadura) en (5,4) y (6,4), con el turno del granadero.
 */
function conGranadero(): BattleState {
  const b = createBattle(
    {
      army: [
        { creature: 'imperio-granadero', count: 1 },
        { creature: 'imperio-piquero', count: 1 },
      ],
      hero: null,
    },
    {
      army: [
        { creature: 'imperio-coracero', count: 1 },
        { creature: 'imperio-coracero', count: 1 },
      ],
      hero: null,
    },
    createRng(1),
    COMBATE_COMPLETO,
  );
  stackById(b, 'attacker-0').hex = { col: 1, row: 4 };
  stackById(b, 'attacker-1').hex = { col: 4, row: 4 };
  stackById(b, 'defender-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-1').hex = { col: 6, row: 4 };
  forzarTurno(b, 'attacker-0');
  return b;
}

/** Un `Rng` que cuenta lo que se le pide: la granada no tiene que pedirle nada. */
function contado(semilla: number): { rng: Rng; veces: () => number } {
  const r = createRng(semilla);
  let n = 0;
  const cuenta = <T>(x: T): T => {
    n++;
    return x;
  };
  return {
    rng: {
      next: () => cuenta(r.next()),
      int: (a, b) => cuenta(r.int(a, b)),
      chance: (p) => cuenta(r.chance(p)),
      pick: (xs) => cuenta(r.pick(xs)),
    },
    veces: () => n,
  };
}

function hastaSuTurno(b: BattleState, rng: Rng): void {
  expect(avanzarHasta(b, rng, 'attacker-0', () => ({ type: 'end_turn' }))).toBe(true);
}

type Explosion = Extract<BattleEvent, { kind: 'blast' }>;
function explosiones(b: BattleState): Explosion[] {
  return b.log.filter((e): e is Explosion => e.kind === 'blast');
}

describe('la granada', () => {
  it('lanzar: a su alcance, con cargas, sin moverse y sin un enemigo al lado; la recta no importa', () => {
    const b = conGranadero();
    // A (5,4), con su piquero en medio: va por encima.
    expect(lanzarBlocker(b, { col: 5, row: 4 })).toBeNull();
    expect(lanzarBlocker(b, { col: 8, row: 4 })).toBe(
      'Granadero lanza hasta 6 casillas (su fuerza), y (8,4) está a 7',
    );
    expect(lanzarBlocker(b, { col: 1, row: 4 })).toBe(
      'Granadero no puede lanzar a su propia casilla',
    );
    // La lista ofrece la casilla de cada enemigo a su alcance.
    expect(legalActions(b).filter((a) => a.type === 'throw')).toEqual([
      { type: 'throw', at: { col: 5, row: 4 } },
      { type: 'throw', at: { col: 6, row: 4 } },
    ]);
    // Tras moverse, no.
    forzarTurno(b, 'attacker-0', 1);
    expect(lanzarBlocker(b)).toBe('Granadero ya se ha movido este turno: no puede lanzar');
    // Con un enemigo al lado, tampoco.
    forzarTurno(b, 'attacker-0');
    stackById(b, 'attacker-0').hex = { col: 4, row: 3 };
    expect(lanzarBlocker(b)).toBe('Granadero tiene un enemigo encima');
  });

  it('explota al empezar su siguiente turno: el cuarto 4 en la casilla y el 2 en las vecinas, a los dos bandos, con la armadura y sin dado', () => {
    const { rng, veces } = contado(5);
    const b = conGranadero();
    const at = { col: 5, row: 4 };
    const p = previsionDe(b, { type: 'throw', at });
    if (p === null || p.kind !== 'granada') throw new Error('sin previsión de la granada');
    const antes = veces();
    applyAction(b, { type: 'throw', at }, rng);
    expect(b.log.some((e) => e.kind === 'thrown')).toBe(true);
    expect(stackById(b, 'attacker-0').granada).toEqual(at);
    hastaSuTurno(b, rng);
    expect(veces()).toBe(antes);
    expect(stackById(b, 'attacker-0').granada).toBeNull();
    const dados = explosiones(b).map((e) => [e.target, e.cuarto, e.damage, e.parado ?? 0]);
    // Nadie se ha movido: lo que dio es lo que preveía, a cada uno.
    const previsto = p.impactos.map((i) => [i.objetivo, i.danio.min]);
    expect(dados.map(([t, , d]) => [t, d])).toEqual(previsto);
    // En el orden de las vecinas: este, ..., oeste.
    expect(dados.map(([t, c]) => [t, c])).toEqual([
      ['defender-0', 4],
      ['defender-1', 2],
      ['attacker-1', 2],
    ]);
    // Los coraceros restan su brigantina; el piquero, su arnés (3).
    expect(dados.map(([t, , , parado]) => [t, parado])).toEqual([
      ['defender-0', 2],
      ['defender-1', 2],
      ['attacker-1', 3],
    ]);
    // El centro pega más que el anillo, a dos coraceros iguales.
    const [centro, anillo] = p.impactos;
    expect(centro?.danio.min).toBeGreaterThan(anillo?.danio.min ?? Number.POSITIVE_INFINITY);
  });

  it('se gasta: con 0 cargas ni se ofrece ni se lanza; y si quien la lanzó cae antes, no explota', () => {
    const rng = createRng(9);
    const b = conGranadero();
    const s = stackById(b, 'attacker-0');
    expect(granadasQueQuedan(s)).toBe(2);
    // Dos, a una casilla vacía a su alcance (sin nadie no daña a nadie).
    for (let i = 0; i < 2; i++) {
      applyAction(b, { type: 'throw', at: { col: 1, row: 1 } }, rng);
      hastaSuTurno(b, rng);
    }
    expect(granadasQueQuedan(s)).toBe(0);
    expect(explosiones(b).map((e) => e.target)).toEqual([null, null]);
    expect(lanzarBlocker(b)).toBe('Granadero se ha quedado sin granadas: lanzó las que llevaba');
    expect(legalActions(b).some((a) => a.type === 'throw')).toBe(false);

    const c = conGranadero();
    applyAction(c, { type: 'throw', at: { col: 5, row: 4 } }, rng);
    const lanzador = stackById(c, 'attacker-0');
    herir(lanzador, { damage: 10_000, perfora: false }, null);
    expect(
      avanzarHasta(
        c,
        rng,
        (x) => x.round >= 3,
        () => ({ type: 'end_turn' }),
      ),
    ).toBe(true);
    expect(explosiones(c)).toEqual([]);
  });

  it('quien se mata con su propia granada no se queda con el turno: pasa al siguiente', () => {
    // Hallazgo F1 de /simplify (02-11-2026): el granadero en (1,4) lanzaba a (2,4), su
    // granada le daba en el anillo y moría al empezar su turno, pero la batalla seguía
    // con él de activo y `legalActions` le ofrecía andar.
    const rng = createRng(3);
    const b = conGranadero();
    const lanzador = stackById(b, 'attacker-0');
    applyAction(b, { type: 'throw', at: { col: 2, row: 4 } }, rng);
    // Con un punto de vida: el anillo lo tumba sin depender de las cifras del catálogo.
    lanzador.topHp = 1;
    expect(
      avanzarHasta(
        b,
        rng,
        (x) => x.log.some((e) => e.kind === 'blast'),
        () => ({ type: 'end_turn' }),
      ),
    ).toBe(true);
    expect(b.log).toContainEqual({ kind: 'perished', stack: 'attacker-0' });
    expect(b.finished).toBeNull();
    expect(b.turno?.stack).not.toBe('attacker-0');
    expect(b.turno === null ? null : stackById(b, b.turno.stack).count).toBeGreaterThan(0);
  });

  it('el parte dice en palabras que quien la lanzó se alcanza con ella, no «Granadero → Granadero»', () => {
    // H3 del QA de las granadas (02-11-2026): la lanza a (2,4), a su lado, y le da en
    // el anillo.
    const rng = createRng(3);
    const b = conGranadero();
    applyAction(b, { type: 'throw', at: { col: 2, row: 4 } }, rng);
    expect(
      avanzarHasta(
        b,
        rng,
        (x) => x.log.some((e) => e.kind === 'blast'),
        () => ({ type: 'end_turn' }),
      ),
    ).toBe(true);
    expect(explosiones(b).map((e) => [e.stack, e.target])).toContainEqual([
      'attacker-0',
      'attacker-0',
    ]);
    for (const mio of [null, 'attacker', 'defender'] as const) {
      const parte = marcadoDe(renderBattleLog(b, mio));
      expect(parte).toMatch(/Granadero se alcanza con su propia granada en \(2,4\): \d+ de daño/);
      expect(parte).not.toContain('Granadero\u00a0→ Granadero');
    }
  });

  it('un retoque de la arena que le cambia la clase de tiro le quita la granada del aire', () => {
    // Hallazgo E4 de /simplify (02-11-2026): explotaba con las cifras del arma nueva.
    const b = conGranadero();
    applyAction(b, { type: 'throw', at: { col: 5, row: 4 } }, createRng(1));
    const granadero = stackById(b, 'attacker-0');
    const piquero = stackById(b, 'attacker-1');
    expect(loADistanciaTrasElRetoque(granadero, granadero.unit)).toEqual({
      apuntado: null,
      granada: { col: 5, row: 4 },
      recargando: 0,
    });
    expect(loADistanciaTrasElRetoque(granadero, piquero.unit)).toEqual({
      apuntado: null,
      granada: null,
      recargando: 0,
    });
  });
});
