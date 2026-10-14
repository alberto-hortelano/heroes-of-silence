/**
 * Salir del contacto (#259, solo la arena; docs/agents/2026-10-14-salir-del-contacto/):
 * con `?contacto=paga`, salir de una casilla cuesta 1 + los enemigos en contacto
 * (los que podrían golpearla cuerpo a cuerpo, `canReachMelee`), se paga al dejarla,
 * el camino es el más barato y el volador paga solo al despegar.
 *
 * Las cifras se escriben a mano desde la geometría del tablero (offset odd-r: las
 * vecinas de (c, 4) son (c±1, 4), (c−1, 3), (c, 3), (c−1, 5) y (c, 5); las de
 * (c, 3), (c±1, 3), (c, 2), (c+1, 2), (c, 4) y (c+1, 4)) y de las velocidades
 * del catálogo (piquero 4, caballería 6 con carga, vampiro 4 volando): un test
 * que calculara el esperado con la misma búsqueda solo probaría que la búsqueda
 * es la que es.
 */
import { describe, expect, it } from 'vitest';
import { renderContacto } from '../src/client/arena/paneles.js';
import { marcadoDe, NADA } from '../src/client/html.js';
import { accionesDeLaUnidad } from '../src/client/views/panels.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import { batallaDeArena, unaVezEnLaURL } from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  cargaDesde,
  contactoBlocker,
  costeDeSalir,
  crearBatallaConReglas,
  createBattle,
  enemigosEnContacto,
  legalActions,
  movableFrom,
  movimientoBlocker,
  pasosQueQuedan,
  soltarElGolpe,
  stackById,
} from '../src/core/battle/battle.js';
import { caminoDe, hexDistance, hexKey } from '../src/core/battle/board.js';
import {
  type ModoDelContacto,
  modoDelContactoALaURL,
  modoDelContactoDeLaURL,
  pagaElContacto,
} from '../src/core/battle/contacto.js';
import { applyEffect } from '../src/core/battle/effects.js';
import { type MurallaDeBatalla, SIN_MURALLA, validarMuralla } from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import type { ModoDelGolpe } from '../src/core/battle/rueda.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack } from '../src/core/types.js';
import { bando } from './batalla-de-prueba.js';
import { aPelear, forzarTurno, MONTAJE, montajeDePrueba, unidadDeArena } from './helpers.js';

const h = (col: number, row: number): Hex => ({ col, row });

/**
 * Una pelea con `quien` en `en` (el atacante, `attacker-0`, con su turno y sin
 * moral) contra esqueletos en `enemigos` (`defender-0`, `defender-1`…). Lo que
 * no está en el tablero no vale: cada stack va donde dice el test.
 */
function pelea(
  quien: string,
  en: Hex,
  enemigos: readonly Hex[],
  o: {
    readonly contacto?: ModoDelContacto;
    readonly golpe?: ModoDelGolpe;
    readonly muralla?: MurallaDeBatalla;
    readonly contra?: string;
  } = {},
): BattleState {
  const de = (criatura: string, n: number): Stack[] =>
    Array.from({ length: n }, () => ({ creature: criatura, count: 3 }));
  const b = crearBatallaConReglas(
    bando(de(quien, 1)),
    bando(de(o.contra ?? 'skeleton', enemigos.length)),
    createRng(1),
    REGLAS_DEL_JUEGO,
    o.muralla ?? SIN_MURALLA,
    o.golpe ?? 'azar',
    o.contacto ?? 'paga',
  );
  stackById(b, 'attacker-0').hex = en;
  enemigos.forEach((e, i) => {
    stackById(b, `defender-${i}`).hex = e;
  });
  for (const s of b.stacks) s.morale = 0;
  forzarTurno(b, 'attacker-0');
  return b;
}

const yo = (b: BattleState) => stackById(b, 'attacker-0');
/** Lo que cuesta llegar a cada casilla pedida, o `undefined` si no llega. */
const costes = (b: BattleState, ...casillas: Hex[]): (number | undefined)[] => {
  const m = movableFrom(b, yo(b));
  return casillas.map((c) => m.get(hexKey(c))?.steps);
};
const enTexto = (hs: readonly Hex[]): string[] => hs.map((x) => `${x.col},${x.row}`);
type Movimiento = Extract<BattleEvent, { kind: 'move' }>;
const movimientos = (b: BattleState): Movimiento[] =>
  b.log.filter((e): e is Movimiento => e.kind === 'move');

describe('el coste de salir de una casilla', () => {
  it('es 1 + los enemigos en contacto: 0, 1, 2 y 3 al lado cuestan 1, 2, 3 y 4', () => {
    const vecinos = [h(6, 4), h(4, 3), h(5, 5)];
    for (let n = 0; n <= 3; n++) {
      const b = pelea('pikeman', h(5, 4), [...vecinos.slice(0, n), h(11, 0), h(11, 8)]);
      expect(enemigosEnContacto(b, yo(b), h(5, 4))).toHaveLength(n);
      expect(costeDeSalir(b, yo(b), h(5, 4))).toBe(1 + n);
    }
  });

  it('sin la regla, salir cuesta 1 con los enemigos que sea', () => {
    const b = pelea('pikeman', h(5, 4), [h(6, 4), h(4, 3), h(5, 5)], { contacto: 'libre' });
    expect(enemigosEnContacto(b, yo(b), h(5, 4))).toHaveLength(3);
    expect(costeDeSalir(b, yo(b), h(5, 4))).toBe(1);
  });

  it('se paga al salir y no al entrar: el paso que deja el contacto cuesta 2, los demás 1', () => {
    // Un esqueleto al este. Al oeste: (4,4) cuesta 2 (se sale de (5,4), en
    // contacto), y de ahí 1 por paso, que (4,4) ya no toca al esqueleto. El piquero
    // anda 4: (1,4) se queda a 5.
    const b = pelea('pikeman', h(5, 4), [h(6, 4)]);
    expect(costes(b, h(4, 4), h(3, 4), h(2, 4), h(1, 4))).toEqual([2, 3, 4, undefined]);
    // Sin la regla, las casillas de siempre.
    const libre = pelea('pikeman', h(5, 4), [h(6, 4)], { contacto: 'libre' });
    expect(costes(libre, h(4, 4), h(3, 4), h(2, 4), h(1, 4))).toEqual([1, 2, 3, 4]);
    // Entrar junto a un enemigo no cuesta: desde lejos, (5,5) —que toca al
    // esqueleto— está a 3, lo que mide andar.
    const lejos = pelea('pikeman', h(2, 5), [h(6, 4)]);
    expect(costes(lejos, h(5, 5))).toEqual([3]);
  });

  it('lo que queda es el presupuesto menos lo pagado, y el panel lo dice', () => {
    const b = pelea('pikeman', h(5, 4), [h(6, 4)]);
    applyAction(b, { type: 'move', to: h(4, 4) }, createRng(1));
    expect(b.turno?.gastado).toBe(2);
    expect(pasosQueQuedan(b, yo(b))).toBe(2);
    expect(enTexto(movimientos(b).at(-1)?.path ?? [])).toEqual(['4,4']);
  });
});

describe('quien no puede pagar salir de su casilla', () => {
  // Cuatro esqueletos alrededor: salir le cuesta 5 y el piquero anda 4.
  const rodeado = (): BattleState =>
    pelea('pikeman', h(5, 4), [h(6, 4), h(4, 3), h(5, 5), h(4, 4)]);

  it('no tiene casillas a las que ir, y dice por qué', () => {
    const b = rodeado();
    expect(movableFrom(b, yo(b)).size).toBe(0);
    const motivo = 'rodeado: con 4 enemigos al lado, salir de su casilla le cuesta 5 y le quedan 4';
    expect(contactoBlocker(b, yo(b))).toBe(motivo);
    // A cualquier casilla libre a la que se le pida ir.
    expect(movimientoBlocker(b, h(5, 3))).toBe(motivo);
    expect(movimientoBlocker(b, h(0, 0))).toBe(motivo);
    // La ocupada sigue diciendo quién está.
    expect(movimientoBlocker(b, h(6, 4))).toBe('ahí está Esqueleto');
    expect(() => applyAction(b, { type: 'move', to: h(5, 3) }, createRng(1))).toThrow(motivo);
  });

  it('puede golpear a quien tiene al lado, defender o esperar', () => {
    const b = rodeado();
    const acciones = legalActions(b);
    expect(acciones.some((a) => a.type === 'move')).toBe(false);
    expect(acciones.filter((a) => a.type === 'attack' && a.from === undefined)).toHaveLength(4);
    expect(acciones.some((a) => a.type === 'attack' && a.from !== undefined)).toBe(false);
    expect(acciones.map((a) => a.type)).toEqual(
      expect.arrayContaining(['defend', 'wait', 'end_turn']),
    );
  });

  it('con 3 al lado sí sale: le cuesta 4 y anda 4, y se queda en la primera casilla', () => {
    const b = pelea('pikeman', h(5, 4), [h(6, 4), h(4, 3), h(5, 5)]);
    expect(contactoBlocker(b, yo(b))).toBeNull();
    // (5,3) toca a (4,3), pero da igual: se llega pagando 4, y no queda más.
    expect(costes(b, h(5, 3), h(4, 4), h(4, 5))).toEqual([4, 4, 4]);
    expect([...movableFrom(b, yo(b)).values()].every((p) => p.steps === 4)).toBe(true);
  });

  it('sin la regla, rodeado anda como siempre', () => {
    const b = pelea('pikeman', h(5, 4), [h(6, 4), h(4, 3), h(5, 5), h(4, 4)], {
      contacto: 'libre',
    });
    expect(contactoBlocker(b, yo(b))).toBeNull();
    expect(costes(b, h(5, 3), h(4, 5))).toEqual([1, 1]);
  });
});

describe('un tramo que empieza en contacto', () => {
  it('quien acaba un tramo junto a un enemigo paga por salir en el siguiente', () => {
    // De (2,4) a (5,4), pegado al esqueleto de (6,4): 3 casillas sin contacto, 3
    // pagadas; le queda 1 y salir le cuesta 2.
    const b = pelea('pikeman', h(2, 4), [h(6, 4)]);
    applyAction(b, { type: 'move', to: h(5, 4) }, createRng(1));
    expect(b.turno?.gastado).toBe(3);
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(movableFrom(b, yo(b)).size).toBe(0);
    expect(contactoBlocker(b, yo(b))).toBe(
      'rodeado: con 1 enemigo al lado, salir de su casilla le cuesta 2 y le queda 1',
    );
    // Golpear al que tiene al lado sí puede.
    expect(legalActions(b)).toContainEqual({ type: 'attack', target: 'defender-0' });
    // Sin la regla, con 1 casilla, anda una.
    const libre = pelea('pikeman', h(2, 4), [h(6, 4)], { contacto: 'libre' });
    applyAction(libre, { type: 'move', to: h(5, 4) }, createRng(1));
    expect(costes(libre, h(4, 4))).toEqual([1]);
  });
});

describe('el camino es el más barato, no el más corto', () => {
  it('rodea el contacto si así le cuesta menos, y lo que se pinta es ese camino', () => {
    // La caballería (6) de (2,4) a (6,4). Recto son 4 casillas, pero (3,4) y (4,4)
    // tocan al esqueleto de (3,5): 1 + 2 + 2 + 1 = 6. Por la fila 3, cinco
    // casillas sin contacto: 5.
    const b = pelea('cavalry', h(2, 4), [h(3, 5)]);
    const paso = movableFrom(b, yo(b)).get(hexKey(h(6, 4)));
    expect(paso?.steps).toBe(5);
    expect(enTexto(caminoDe(paso!))).toEqual(['2,3', '3,3', '4,3', '5,3', '6,4']);
    applyAction(b, { type: 'move', to: h(6, 4) }, createRng(1));
    expect(enTexto(movimientos(b).at(-1)?.path ?? [])).toEqual(['2,3', '3,3', '4,3', '5,3', '6,4']);
    expect(b.turno?.gastado).toBe(5);
    // Sin la regla, el recto de 4.
    const libre = pelea('cavalry', h(2, 4), [h(3, 5)], { contacto: 'libre' });
    const recto = movableFrom(libre, yo(libre)).get(hexKey(h(6, 4)));
    expect(recto?.steps).toBe(4);
    expect(enTexto(caminoDe(recto!))).toEqual(['3,4', '4,4', '5,4', '6,4']);
  });
});

describe('el volador', () => {
  it('paga el contacto de la casilla de la que despega, y no lo que sobrevuela', () => {
    // El vampiro (4) en (5,4) con un esqueleto al este (6,4) y otros dos lejos,
    // junto a los que aterriza o pasa: cada casilla le cuesta su distancia + 1.
    const b = pelea('vampire', h(5, 4), [h(6, 4), h(2, 2), h(8, 6)]);
    const m = movableFrom(b, yo(b));
    expect(costes(b, h(4, 4), h(3, 3), h(2, 3), h(7, 6), h(1, 4))).toEqual([2, 3, 4, 4, undefined]);
    for (const p of m.values()) expect(p.steps).toBe(hexDistance(h(5, 4), p.at) + 1);
    // Lo que alcanza son las libres a 3 o menos: el presupuesto menos el despegue.
    expect([...m.values()].every((p) => hexDistance(h(5, 4), p.at) <= 3)).toBe(true);
    expect(m.has(hexKey(h(3, 2)))).toBe(true);
  });

  it('sin enemigos al lado no paga nada de más, aunque aterrice junto a uno', () => {
    const b = pelea('vampire', h(5, 4), [h(8, 4)]);
    expect(costes(b, h(7, 4), h(7, 3), h(1, 4))).toEqual([2, 3, 4]);
  });

  it('rodeado por cuatro, no despega', () => {
    const b = pelea('vampire', h(5, 4), [h(6, 4), h(4, 3), h(5, 5), h(4, 4)]);
    expect(movableFrom(b, yo(b)).size).toBe(0);
    expect(contactoBlocker(b, yo(b))).toBe(
      'rodeado: con 4 enemigos al lado, salir de su casilla le cuesta 5 y le quedan 4',
    );
  });
});

describe('lo que dice quien no llega', () => {
  it('si saliendo gratis llegaría, dice que lo que cuesta es el contacto', () => {
    // A (1,4) son 4 casillas: libre llega, pagando el contacto (5) no.
    const b = pelea('pikeman', h(5, 4), [h(6, 4)]);
    expect(movimientoBlocker(b, h(1, 4))).toBe(
      'no llega: le quedan 4 casillas y salir de una casilla con enemigos al lado cuesta 1 más por cada uno',
    );
    // Lo que no alcanzaría ni libre, como siempre.
    expect(movimientoBlocker(b, h(0, 4))).toBe('no llega: le quedan 4 casillas');
  });
});

describe('qué es «en contacto»: quien te puede golpear cuerpo a cuerpo', () => {
  it('el enemigo en lo alto del muro de al lado no cuenta; el del suelo, sí', () => {
    // El muro en (6,4): el esqueleto de arriba no alcanza al piquero del suelo.
    const muralla = validarMuralla({ muros: [h(6, 4)], puertas: [] });
    const b = pelea('pikeman', h(5, 4), [h(6, 4), h(4, 3)], { muralla });
    expect(enemigosEnContacto(b, yo(b), h(5, 4)).map((e) => e.id)).toEqual(['defender-1']);
    expect(costeDeSalir(b, yo(b), h(5, 4))).toBe(2);
  });

  it('el del otro lado de una puerta cerrada sí cuenta: hoy se golpea a través de ella', () => {
    // La columna 7 con la puerta entre (7,4) y (8,4), cerrada. El piquero en el
    // hueco y el esqueleto al otro lado se golpean, así que se tocan.
    const muros = [0, 1, 2, 3, 5, 6, 7, 8].map((row) => h(7, row));
    const muralla = validarMuralla({ muros, puertas: [{ a: h(7, 4), b: h(8, 4) }] });
    const b = pelea('pikeman', h(7, 4), [h(8, 4)], { muralla });
    expect(b.puertas[0]?.abierta).toBe(false);
    expect(costeDeSalir(b, yo(b), h(7, 4))).toBe(2);
    expect(costes(b, h(6, 4), h(5, 4))).toEqual([2, 3]);
  });

  it('rodeado al pie del muro, poner la escalera no paga el contacto: es el turno entero', () => {
    const muralla = validarMuralla({ muros: [h(6, 4)], puertas: [] });
    const b = pelea('pikeman', h(5, 4), [h(4, 3), h(5, 5), h(4, 4), h(5, 3)], { muralla });
    yo(b).escalera = true;
    expect(movableFrom(b, yo(b)).size).toBe(0);
    expect(legalActions(b)).toContainEqual({ type: 'poner_escalera', muro: h(6, 4) });
    applyAction(b, { type: 'poner_escalera', muro: h(6, 4) }, createRng(1));
    expect(b.escaleras).toEqual([{ pie: h(5, 4), muro: h(6, 4) }]);
  });
});

describe('la carga', () => {
  // La caballería (6, carga) en (0,4) contra el esqueleto de (5,4): la recta a
  // (4,4) son 4 casillas.
  it('cuenta casillas, y la recta se paga con su contacto', () => {
    // Un esqueleto en (2,5) toca (2,4) y (3,4): la recta cuesta 1 + 1 + 2 + 2 = 6,
    // y cabe en 6. La carga sigue siendo de 4 casillas.
    const b = pelea('cavalry', h(0, 4), [h(5, 4), h(2, 5)]);
    expect(cargaDesde(b, yo(b), h(4, 4), stackById(b, 'defender-0'))).toBe(4);
    // Andar a (4,4) es más barato por la fila 3 (5), pero la carga va por la
    // recta: se anda la recta y se paga la recta.
    expect(costes(b, h(4, 4))).toEqual([5]);
    applyAction(b, { type: 'attack', target: 'defender-0', from: h(4, 4) }, createRng(1));
    const mov = movimientos(b).at(-1);
    expect(mov?.charge).toBe(true);
    expect(enTexto(mov?.path ?? [])).toEqual(['1,4', '2,4', '3,4', '4,4']);
  });

  it('si la recta no cabe en lo que le queda, la casilla sigue a mano por otro camino, sin carga', () => {
    // Con Lentitud anda 5: la recta (6) no cabe; la fila 3 (5) sí.
    const b = pelea('cavalry', h(0, 4), [h(5, 4), h(2, 5)]);
    applyEffect(yo(b), { kind: 'speed', amount: -1, source: 'slow', roundsLeft: 2 });
    expect(pasosQueQuedan(b, yo(b))).toBe(5);
    expect(cargaDesde(b, yo(b), h(4, 4), stackById(b, 'defender-0'))).toBe(0);
    expect(costes(b, h(4, 4))).toEqual([5]);
    applyAction(b, { type: 'attack', target: 'defender-0', from: h(4, 4) }, createRng(1));
    const mov = movimientos(b).at(-1);
    expect(mov?.charge).toBeUndefined();
    expect(enTexto(mov?.path ?? [])).toEqual(['1,4', '1,3', '2,3', '3,3', '4,4']);
    // Con Prisa (7), la recta cabe y vuelve la carga.
    const prisa = pelea('cavalry', h(0, 4), [h(5, 4), h(2, 5)]);
    applyEffect(yo(prisa), { kind: 'speed', amount: 1, source: 'haste', roundsLeft: 2 });
    expect(cargaDesde(prisa, yo(prisa), h(4, 4), stackById(prisa, 'defender-0'))).toBe(4);
  });

  it('sin la regla, la misma recta carga sin pagar el contacto', () => {
    const b = pelea('cavalry', h(0, 4), [h(5, 4), h(2, 5)], { contacto: 'libre' });
    applyEffect(yo(b), { kind: 'speed', amount: -1, source: 'slow', roundsLeft: 2 });
    expect(cargaDesde(b, yo(b), h(4, 4), stackById(b, 'defender-0'))).toBe(4);
  });
});

describe('con la rueda del golpe', () => {
  it('andar paga el contacto, y Escape deja a la unidad donde llegó con lo que le quede', () => {
    // El piquero (4) de (2,4) a golpear al esqueleto de (6,4) desde (5,4), con otro
    // en (3,5): recto costaría 5; por la fila 3, 4.
    const b = pelea('pikeman', h(2, 4), [h(6, 4), h(3, 5)], { golpe: 'rueda' });
    applyAction(b, { type: 'attack', target: 'defender-0', from: h(5, 4) }, createRng(1));
    expect(b.golpeEnCurso?.stack).toBe('attacker-0');
    expect(b.turno?.gastado).toBe(4);
    expect(enTexto(movimientos(b).at(-1)?.path ?? [])).toEqual(['2,3', '3,3', '4,3', '5,4']);
    soltarElGolpe(b, createRng(1));
    // Le queda 0: no anda, pero tiene a quien golpear, y el turno sigue.
    expect(yo(b).hex).toEqual(h(5, 4));
    expect(activeStack(b)?.id).toBe('attacker-0');
    expect(movableFrom(b, yo(b)).size).toBe(0);
  });
});

describe('el interruptor', () => {
  it('el juego anda libre: `createBattle` no lo enciende', () => {
    const b = createBattle(
      bando([{ creature: 'pikeman', count: 3 }]),
      bando([{ creature: 'skeleton', count: 3 }]),
      createRng(1),
    );
    expect(b.modoDelContacto).toBe('libre');
    expect(pagaElContacto(b)).toBe(false);
  });

  it('va en la URL aparte: `?contacto=paga`, y lo que no es un modo se dice', () => {
    expect(modoDelContactoDeLaURL(null)).toBe('libre');
    expect(modoDelContactoDeLaURL('')).toBe('libre');
    expect(modoDelContactoDeLaURL('paga')).toBe('paga');
    expect(modoDelContactoDeLaURL('libre')).toBe('libre');
    expect(() => modoDelContactoDeLaURL('cobra')).toThrow(
      '«cobra» no es un modo del contacto; valen libre, paga',
    );
    expect(modoDelContactoALaURL('libre')).toBe('');
    expect(modoDelContactoALaURL('paga')).toBe('paga');
    // Repetido se rechaza, como el golpe.
    expect(() => unaVezEnLaURL(['paga', 'libre'], 'contacto')).toThrow();
  });

  it('el montaje de la arena lo lleva a la batalla; sin él, libre', () => {
    const lado = aPelear([unidadDeArena('imperio-piquero')]);
    const sin = batallaDeArena(montajeDePrueba(lado, lado), createRng(1));
    expect(sin.modoDelContacto).toBe('libre');
    const con = batallaDeArena(
      { ...montajeDePrueba(lado, lado), ...MONTAJE, contacto: 'paga' },
      createRng(1),
    );
    expect(con.modoDelContacto).toBe('paga');
  });

  it('el montaje enseña el interruptor con su modo', () => {
    const libre = marcadoDe(renderContacto('libre'));
    expect(libre).toContain('data-contacto-del-montaje="libre"');
    expect(libre).toContain('data-arena="contacto" data-modo="paga"');
    expect(marcadoDe(renderContacto('paga'))).toContain('Contacto · salir cuesta');
  });

  it('el panel dice por qué no anda, y sin motivo no cambia', () => {
    const b = pelea('pikeman', h(5, 4), [h(6, 4), h(4, 3), h(5, 5), h(4, 4)]);
    const base = {
      activa: yo(b),
      legales: legalActions(b),
      pasos: 4,
      rendicion: NADA,
      hechizos: NADA,
      poderes: NADA,
      muralla: NADA,
    };
    const con = marcadoDe(accionesDeLaUnidad({ ...base, sinSalida: 'Rodeado: no sale.' }));
    expect(con).toContain('<p class="cost" data-sin-salida>Rodeado: no sale.</p>');
    expect(marcadoDe(accionesDeLaUnidad({ ...base, sinSalida: null }))).toBe(
      marcadoDe(accionesDeLaUnidad(base)),
    );
  });
});

describe('la IA de la arena juega con la regla', () => {
  it('`autoResolve` termina, y la misma semilla da la misma pelea', () => {
    const izquierda = aPelear([
      unidadDeArena('imperio-piquero'),
      unidadDeArena('imperio-piquero'),
      unidadDeArena('imperio-piquero'),
    ]);
    const derecha = aPelear([
      unidadDeArena('imperio-piquero'),
      unidadDeArena('imperio-piquero'),
      unidadDeArena('imperio-piquero'),
    ]);
    const jugar = (): BattleState => {
      const rng = createRng(7);
      const b = batallaDeArena({ ...montajeDePrueba(izquierda, derecha), contacto: 'paga' }, rng);
      autoResolve(b, rng);
      return b;
    };
    const a = jugar();
    expect(a.finished).not.toBeNull();
    expect(jugar().log).toEqual(a.log);
  });
});
