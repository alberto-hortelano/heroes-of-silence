/**
 * Por dónde anda una figura y hacia dónde mira.
 *
 * El usuario vio a una unidad «pasar entre dos enemigos». No era el camino:
 * medido en 300 peleas de arena, 500 de 4 598 movimientos se pintaban en recta
 * por encima de una casilla ocupada, y en ninguno el camino del motor pisaba
 * a nadie. Lo que fallaba era la animación, que solo sabía el destino. Ahora el
 * hecho `move` lleva el camino de la misma búsqueda que valida el movimiento, y
 * el animador anda por él casilla a casilla mirando a la siguiente.
 */
import { describe, expect, it } from 'vitest';
import { BattleAnimator, DURACION, porElCamino } from '../src/client/anim.js';
import { type Direccion, direccionHacia } from '../src/client/direccion.js';
import { espejadoPara } from '../src/client/render/figura.js';
import { planoDeHex } from '../src/client/render/proyeccion.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  activeStack,
  applyAction,
  createBattle,
  isAlive,
  stackHexes,
} from '../src/core/battle/battle.js';
import { areAdjacent, hexEquals, hexKey } from '../src/core/battle/board.js';
import type { BattleState } from '../src/core/battle/types.js';
import { hasTrait } from '../src/core/data.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import { ejercito } from './helpers.js';

function pelea(semilla: number): BattleState {
  return createBattle(
    {
      army: troopsAsStacks(
        ejercito(
          { creature: 'pikeman', count: 2 },
          { creature: 'archer', count: 1 },
          { creature: 'cavalry', count: 1 },
          { creature: 'swordsman', count: 2 },
        ),
      ),
      hero: null,
    },
    {
      army: troopsAsStacks(
        ejercito(
          { creature: 'skeleton', count: 2 },
          { creature: 'vampire', count: 1 },
          { creature: 'bone_dragon', count: 1 },
          { creature: 'mummy', count: 2 },
        ),
      ),
      hero: null,
    },
    createRng(semilla),
  );
}

describe('el camino de un movimiento', () => {
  it('el hecho `move` lleva el camino que se anda: contiguo, libre y hasta `to`', () => {
    let movimientos = 0;
    let rodeos = 0;
    for (let semilla = 1; semilla <= 40; semilla++) {
      const b = pelea(semilla);
      const rng = createRng(semilla);
      for (let jugadas = 0; b.finished === null && jugadas < 3000; jugadas++) {
        const yo = activeStack(b);
        if (yo === null) break;
        const desde = yo.hex;
        // Lo ocupado por los demás ANTES de moverse: es lo que el camino esquiva.
        const ocupadas = new Set(
          b.stacks
            .filter((x) => isAlive(x) && x.id !== yo.id)
            .flatMap((x) => stackHexes(x).map(hexKey)),
        );
        const antes = b.log.length;
        applyAction(b, chooseBattleAction(b), rng);
        for (const e of b.log.slice(antes)) {
          if (e.kind !== 'move' || e.stack !== yo.id) continue;
          movimientos++;
          const ultimo = e.path[e.path.length - 1];
          expect(ultimo !== undefined && hexEquals(ultimo, e.to)).toBe(true);
          if (hasTrait(yo.unit, 'flying')) {
            // Un volador va por el aire: su camino es el destino.
            expect(e.path).toEqual([e.to]);
            continue;
          }
          let previo = desde;
          for (const h of e.path) {
            expect(
              areAdjacent(previo, h),
              `${yo.id}: (${previo.col},${previo.row})→(${h.col},${h.row})`,
            ).toBe(true);
            expect(ocupadas.has(hexKey(h)), `${yo.id} pisa (${h.col},${h.row})`).toBe(false);
            previo = h;
          }
          if (e.path.length > 1) rodeos++;
        }
      }
    }
    // Que se haya ejercido de verdad, con caminos de más de una casilla.
    expect(movimientos).toBeGreaterThan(200);
    expect(rodeos).toBeGreaterThan(100);
  });
});

describe('la figura anda por el camino', () => {
  it('a mitad de un rodeo está en la casilla del medio, no en la recta', () => {
    const p = (col: number, row: number) => planoDeHex({ col, row });
    // Un rodeo en ángulo: de (2,4) a (4,4) pasando por (2,3) y (3,3).
    const camino = [p(2, 4), p(2, 3), p(3, 3), p(4, 4)];
    expect(porElCamino(camino, 0)).toEqual(camino[0]);
    expect(porElCamino(camino, 1 / 3)).toEqual(camino[1]);
    expect(porElCamino(camino, 2 / 3).x).toBeCloseTo((camino[2] as { x: number }).x);
    expect(porElCamino(camino, 1)).toEqual(camino[3]);
    // La recta de (2,4) a (4,4) pasaría a mitad por y = y de la fila 4; el camino no.
    expect(porElCamino(camino, 0.5).y).toBeLessThan(p(2, 4).y);
  });

  it('el animador sigue el `path` del hecho, casilla a casilla', () => {
    const b = pelea(1);
    const a = new BattleAnimator();
    a.observe(b);
    a.tick(0);
    const s = b.stacks[0] as BattleState['stacks'][number];
    const desde = s.hex;
    const arriba = { col: desde.col, row: desde.row - 1 };
    const destino = { col: desde.col + 1, row: desde.row };
    // Un camino de dos casillas que no es la recta: sube y luego baja.
    b.log.push({ kind: 'move', stack: s.id, to: destino, path: [arriba, destino] });
    s.hex = destino;
    a.observe(b);
    a.tick(1);
    a.tick(1 + DURACION.move / 2);
    const en = a.figura(s).en;
    expect(en.x).toBeCloseTo(planoDeHex(arriba).x);
    expect(en.y).toBeCloseTo(planoDeHex(arriba).y);
  });
});

describe('hacia dónde mira', () => {
  const p = (col: number, row: number) => planoDeHex({ col, row });

  it('la regla: ocho sectores por el vector en pantalla; sin vector, la de antes', () => {
    const c = p(5, 4);
    expect(direccionHacia(c, p(6, 4), 'O')).toBe('E');
    expect(direccionHacia(c, p(4, 4), 'E')).toBe('O');
    // Las vecinas de la fila de arriba (fila par → las de arriba son (4,3) y (5,3)).
    expect(direccionHacia(c, p(5, 3), 'O')).toBe('NE');
    expect(direccionHacia(c, p(4, 3), 'E')).toBe('NO');
    expect(direccionHacia(c, p(5, 5), 'O')).toBe('SE');
    expect(direccionHacia(c, p(4, 5), 'E')).toBe('SO');
    // Vertical puro: dos filas arriba o abajo, la misma columna en pantalla.
    expect(direccionHacia(c, p(5, 2), 'E')).toBe('N');
    expect(direccionHacia(c, p(5, 6), 'O')).toBe('S');
    // El mismo punto: no hay a dónde mirar.
    expect(direccionHacia(c, c, 'SO')).toBe('SO');
  });

  it('el arte de hoy: el este tal cual, el oeste espejado y el norte y el sur con su lado', () => {
    const casos: [Direccion, Direccion, boolean][] = [
      ['E', 'E', false],
      ['NE', 'O', false],
      ['SE', 'O', false],
      ['O', 'E', true],
      ['NO', 'E', true],
      ['SO', 'E', true],
      ['N', 'O', true],
      ['N', 'E', false],
      ['S', 'O', true],
      ['S', 'SE', false],
    ];
    for (const [mira, lado, espejado] of casos) {
      expect(espejadoPara(mira, lado), `${mira} con lado ${lado}`).toBe(espejado);
    }
  });

  it('al andar mira a la siguiente casilla, al golpear al objetivo, y después se queda así', () => {
    const b = pelea(1);
    const a = new BattleAnimator();
    a.observe(b);
    a.tick(0);
    const [yo, el] = [
      b.stacks.find((x) => x.side === 'attacker'),
      b.stacks.find((x) => x.side === 'defender'),
    ] as [BattleState['stacks'][number], BattleState['stacks'][number]];
    // De salida: el atacante al este, el defensor al oeste.
    expect(a.figura(yo).mira).toBe('E');
    expect(a.figura(el).mira).toBe('O');

    // Anda hacia atrás (al oeste): mira al oeste mientras anda y al acabar.
    const atras = { col: yo.hex.col - 1, row: yo.hex.row };
    b.log.push({ kind: 'move', stack: yo.id, to: atras, path: [atras] });
    yo.hex = atras;
    a.observe(b);
    a.tick(1);
    a.tick(1 + DURACION.move / 2);
    expect(a.figura(yo).mira).toBe('O');
    a.tick(2 + DURACION.move);
    expect(a.figura(yo).mira).toBe('O');
    expect(espejadoPara(a.figura(yo).mira, a.figura(yo).lado)).toBe(true);

    // Golpea al defensor, que está al este: se gira hacia él y se queda.
    b.log.push({
      kind: 'attack',
      stack: yo.id,
      target: el.id,
      damage: 1,
      killed: 0,
      retaliation: false,
    });
    a.observe(b);
    a.tick(3 + DURACION.move);
    a.tick(3 + DURACION.move + DURACION.attack / 2);
    expect(['E', 'NE', 'SE']).toContain(a.figura(yo).mira);
    a.tick(4 + DURACION.move + DURACION.attack);
    expect(a.busy).toBe(false);
    expect(['E', 'NE', 'SE']).toContain(a.figura(yo).mira);
    expect(espejadoPara(a.figura(yo).mira, a.figura(yo).lado)).toBe(false);
  });
});
