/**
 * La granada (02-11-2026, regla nuestra; `docs/agents/2026-11-02-armas-de-fuego-y-granadas/`):
 * se lanza por encima a una casilla a la fuerza del cuerpo de quien la lanza, explota
 * al empezar su siguiente turno en ella (el cuarto 4 de la horquilla) y en sus seis
 * vecinas (el 2), a todo vivo de cualquier bando, con la armadura restada, sin dado,
 * y se gasta. Escrito desde los criterios 1 y 6-8 de los requisitos, con las unidades
 * del imperio del catálogo.
 */
import { describe, expect, it } from 'vitest';
import { loADistanciaTrasElRetoque } from '../src/core/battle/a-distancia.js';
import { applyAction } from '../src/core/battle/battle.js';
import { stackById } from '../src/core/battle/consultas.js';
import { createBattle } from '../src/core/battle/montaje.js';
import type { BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import { avanzarHasta, forzarTurno } from './batalla-de-prueba.js';

/**
 * El granadero (fuerza 3: alcance 3) en (3,4) con un piquero suyo en (4,4), contra dos
 * coraceros (coraza: 7 de armadura) en (5,4) y (6,4), con el turno del granadero.
 * Hasta el catálogo retocado del 02-11-2026 el granadero tenía fuerza 6 y estaba en
 * (1,4), y los coraceros llevaban la brigantina (2).
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
  stackById(b, 'attacker-0').hex = { col: 3, row: 4 };
  stackById(b, 'attacker-1').hex = { col: 4, row: 4 };
  stackById(b, 'defender-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-1').hex = { col: 6, row: 4 };
  forzarTurno(b, 'attacker-0');
  return b;
}

describe('la granada', () => {
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
