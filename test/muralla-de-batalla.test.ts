/**
 * La muralla del tablero de batalla (`battle/muralla.ts`): el muro es alto —a él
 * sube andando el defensor, el atacante solo con `subir` y el volador se posa—,
 * la puerta (entre dos casillas) cerrada no la cruza nadie y abierta cualquiera,
 * la grande no sube, la carga no sube andando,
 * el despliegue la esquiva y la IA juega con ella sin colgarse. Lo del nivel
 * (tiro, cuerpo a cuerpo, defensa, escaleras) está en `muralla-alta.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { autoResolve, chooseBattleAction } from '../src/core/ai/tactics.js';
import { columna, FORMAS_DE_EJEMPLO } from '../src/core/arena-murallas.js';
import {
  applyAction,
  type BattleSide,
  bandoDeSalida,
  cargaDesde,
  createBattle,
  despliegueBlocker,
  distanciaACaminar,
  distanciaHasta,
  legalActions,
  MAX_ROUNDS,
  movableFrom,
  movableHexes,
  movimientoBlocker,
  stackById,
  stackHexes,
  stackSpeed,
} from '../src/core/battle/battle.js';
import { caminoDe, hexDistance, hexKey, neighbours } from '../src/core/battle/board.js';
import { type MurallaDeBatalla, SIN_MURALLA, validarMuralla } from '../src/core/battle/muralla.js';
import type { BattleState } from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack } from '../src/core/types.js';
import { abrirPuertas, aPelear, forzarTurno, peleaDeArena, unidadDeArena } from './helpers.js';

const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });

const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};

/** La columna 7 entera, y la misma con la puerta en (7,4). */
const LINEA = forma('Línea recta');
const CON_PUERTA = forma('Línea con puerta');

/**
 * Uno contra uno, cada uno donde diga el test y con el turno de quien diga. Los
 * hexes se ponen a mano: el despliegue tiene su propio test.
 */
function duelo(
  muralla: MurallaDeBatalla,
  atacante: string,
  en: Hex,
  defensor: string,
  enDefensor: Hex,
  turnoDe: 'attacker-0' | 'defender-0' = 'attacker-0',
): BattleState {
  const state = createBattle(
    lado([{ creature: atacante, count: 3 }]),
    lado([{ creature: defensor, count: 3 }]),
    createRng(3),
    muralla,
  );
  stackById(state, 'attacker-0').hex = en;
  stackById(state, 'defender-0').hex = enDefensor;
  forzarTurno(state, turnoDe);
  return state;
}

const claves = (hexes: readonly Hex[]): Set<string> => new Set(hexes.map(hexKey));

describe('validarMuralla', () => {
  it('acepta una muralla bien formada y devuelve una copia congelada', () => {
    const crudo = {
      muros: [{ col: 7, row: 1 }],
      puertas: [{ a: { col: 7, row: 2 }, b: { col: 8, row: 2 } }],
    };
    const m = validarMuralla(crudo);
    expect(m).toEqual(crudo);
    expect(m).not.toBe(crudo);
    expect(Object.isFrozen(m.muros)).toBe(true);
    expect(Object.isFrozen(m.puertas[0])).toBe(true);
  });

  it('lanza con una frase por cada cosa que no entiende', () => {
    expect(() => validarMuralla(null)).toThrow('la muralla tiene que ser un objeto');
    expect(() => validarMuralla({ muros: [] })).toThrow('la muralla necesita «puertas»');
    expect(() => validarMuralla({ muros: [], puertas: [], torres: [] })).toThrow(
      'la muralla no entiende «torres»',
    );
    expect(() => validarMuralla({ muros: [{ col: 11, row: 0 }], puertas: [] })).toThrow(
      'cae en (11,0), fuera del tablero de 11×9',
    );
    expect(() => validarMuralla({ muros: [{ col: -1, row: 0 }], puertas: [] })).toThrow(
      'fuera del tablero',
    );
    expect(() => validarMuralla({ muros: [{ col: 1.5, row: 0 }], puertas: [] })).toThrow(
      'el muro 1 necesita col y row enteros',
    );
    expect(() => validarMuralla({ muros: [{ col: '1', row: 0 }], puertas: [] })).toThrow('enteros');
    expect(() => validarMuralla({ muros: [3], puertas: [] })).toThrow('no es un hex');
    expect(() =>
      validarMuralla({
        muros: [
          { col: 2, row: 2 },
          { col: 2, row: 2 },
        ],
        puertas: [],
      }),
    ).toThrow('la muralla repite muro en (2,2)');
    // La puerta va entre dos casillas de suelo vecinas en horizontal (ampliación 4, C31).
    const puerta = (a: Hex, b: Hex): unknown => ({
      muros: [{ col: 2, row: 2 }],
      puertas: [{ a, b }],
    });
    expect(() => validarMuralla(puerta({ col: 2, row: 2 }, { col: 3, row: 2 }))).toThrow(
      'la puerta (2,2)-(3,2) cae en el muro de (2,2): va entre dos casillas de suelo',
    );
    expect(() => validarMuralla(puerta({ col: 1, row: 2 }, { col: 2, row: 2 }))).toThrow(
      'cae en el muro de (2,2)',
    );
    expect(() => validarMuralla(puerta({ col: 4, row: 2 }, { col: 4, row: 3 }))).toThrow(
      'la puerta 1 va de (4,2) a (4,3); sus dos casillas tienen que ser vecinas en horizontal, b justo al este de a',
    );
    expect(() => validarMuralla(puerta({ col: 5, row: 2 }, { col: 4, row: 2 }))).toThrow(
      'b justo al este de a',
    );
    expect(() => validarMuralla(puerta({ col: 10, row: 2 }, { col: 11, row: 2 }))).toThrow(
      'el lado b de la puerta 1 cae en (11,2), fuera del tablero',
    );
    expect(() =>
      validarMuralla({
        muros: [],
        puertas: [
          { a: { col: 4, row: 2 }, b: { col: 5, row: 2 } },
          { a: { col: 4, row: 2 }, b: { col: 5, row: 2 } },
        ],
      }),
    ).toThrow('la muralla repite la puerta (4,2)-(5,2)');
    expect(() => validarMuralla({ muros: [], puertas: [{ a: { col: 1, row: 1 } }] })).toThrow(
      'el lado b de la puerta 1 no es un hex',
    );
    expect(() =>
      validarMuralla({
        muros: [],
        puertas: [{ a: { col: 1, row: 1 }, b: { col: 2, row: 1 }, c: 1 }],
      }),
    ).toThrow('la puerta 1 no entiende «c»');
    // El formato de antes —la puerta como casilla— se dice como tal (C31).
    expect(() => validarMuralla({ muros: [], puertas: [{ col: 7, row: 4 }] })).toThrow(
      'la puerta 1 es una casilla, como antes; ahora una puerta va entre dos casillas vecinas en horizontal',
    );
  });

  it('createBattle la valida en la puerta, aunque llegue tipada', () => {
    const mala = { muros: [{ col: 20, row: 0 }], puertas: [] } as MurallaDeBatalla;
    expect(() =>
      createBattle(
        lado([{ creature: 'peasant', count: 1 }]),
        lado([{ creature: 'peasant', count: 1 }]),
        createRng(1),
        mala,
      ),
    ).toThrow('fuera del tablero');
  });
});

describe('el muro (C3)', () => {
  it('el atacante que camina no sube ni lo cruza, y el núcleo dice por qué', () => {
    // Espadachín: 4 casillas. Sin muro llegaría a la columna 9.
    const state = duelo(LINEA, 'swordsman', { col: 5, row: 4 }, 'pikeman', { col: 10, row: 0 });
    const a = stackById(state, 'attacker-0');
    const movibles = movableHexes(state, a);
    expect(movibles.length).toBeGreaterThan(0);
    expect(movibles.filter((h) => h.col >= 7)).toEqual([]);
    expect(movimientoBlocker(state, { col: 7, row: 4 })).toBe(
      'para subir a la muralla hace falta una escalera o saber escalar',
    );
    expect(movimientoBlocker(state, { col: 8, row: 4 })).toBe(
      'no llega: le quedan 4 casillas y la muralla o las unidades cortan el camino',
    );
    expect(movimientoBlocker(state, { col: 6, row: 4 })).toBeNull();
    // Y la acción lo rechaza con la misma frase, sin tocar nada.
    expect(() =>
      applyAction(state, { type: 'move', to: { col: 7, row: 4 } }, createRng(1)),
    ).toThrow(
      'attacker-0 no puede moverse a (7,4): para subir a la muralla hace falta una escalera o saber escalar',
    );
    expect(a.hex).toEqual({ col: 5, row: 4 });
    // Sin muralla, el mismo espadachín sí llega: es el muro, no la distancia.
    const libre = duelo(SIN_MURALLA, 'swordsman', { col: 5, row: 4 }, 'pikeman', {
      col: 10,
      row: 0,
    });
    expect(claves(movableHexes(libre, stackById(libre, 'attacker-0'))).has('8,4')).toBe(true);
  });

  it('el defensor sube andando, anda por arriba y baja solo hacia dentro', () => {
    const state = duelo(
      LINEA,
      'pikeman',
      { col: 0, row: 0 },
      'swordsman',
      { col: 8, row: 4 },
      'defender-0',
    );
    const movibles = claves(movableHexes(state, stackById(state, 'defender-0')));
    // Sube (7,x) y anda por arriba; al otro lado, fuera, no baja.
    for (const h of ['7,4', '7,3', '7,5', '8,3']) expect(movibles.has(h)).toBe(true);
    for (const h of ['6,4', '5,4']) expect(movibles.has(h)).toBe(false);
    expect(movimientoBlocker(state, { col: 7, row: 4 })).toBeNull();
    expect(movimientoBlocker(state, { col: 6, row: 4 })).toBe(
      'desde la muralla solo se baja hacia dentro',
    );
  });

  it('el atacante que ya está arriba anda por los muros y baja solo hacia dentro', () => {
    const state = duelo(LINEA, 'swordsman', { col: 7, row: 4 }, 'pikeman', { col: 10, row: 0 });
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    for (const h of ['7,3', '7,2', '7,5', '8,4']) expect(movibles.has(h)).toBe(true);
    // Por donde subió no vuelve: fuera es fuera, también para quien escaló.
    expect(movibles.has('6,4')).toBe(false);
    expect(movimientoBlocker(state, { col: 6, row: 4 })).toBe(
      'desde la muralla solo se baja hacia dentro',
    );
  });

  it('el volador se posa en el muro, de cualquier bando', () => {
    // Vampiro: vuela, 4 casillas.
    const state = duelo(LINEA, 'vampire', { col: 5, row: 4 }, 'pikeman', { col: 10, row: 0 });
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    expect(movibles.has('8,4')).toBe(true);
    for (const h of columna(7, 1, 7)) expect(movibles.has(hexKey(h))).toBe(true);
    expect(movimientoBlocker(state, { col: 7, row: 3 })).toBeNull();
    applyAction(state, { type: 'move', to: { col: 7, row: 3 } }, createRng(1));
    expect(stackById(state, 'attacker-0').hex).toEqual({ col: 7, row: 3 });
  });

  it('la unidad grande no mete la cola en el muro', () => {
    // Dragón óseo, dos hexes: el del atacante lleva la cola a la izquierda.
    const state = duelo(LINEA, 'bone_dragon', { col: 5, row: 4 }, 'pikeman', { col: 10, row: 0 });
    const s = stackById(state, 'attacker-0');
    const movibles = movableHexes(state, s);
    const muro = claves(LINEA.muros);
    for (const cabeza of movibles) {
      for (const h of stackHexes({ ...s, hex: cabeza })) expect(muro.has(hexKey(h))).toBe(false);
    }
    // Con la cabeza en la columna 8 la cola caería en el muro: no se ofrece.
    expect(claves(movibles).has('8,4')).toBe(false);
    expect(claves(movibles).has('9,4')).toBe(true);
    expect(movimientoBlocker(state, { col: 8, row: 4 })).toBe('la cola caería en el muro');
    // Ni con la cabeza: dos casillas no suben.
    expect(movimientoBlocker(state, { col: 7, row: 4 })).toBe(
      'una unidad de dos casillas no sube a la muralla',
    );
  });

  it('la grande del defensor tampoco sube', () => {
    const state = duelo(
      LINEA,
      'pikeman',
      { col: 0, row: 0 },
      'bone_dragon',
      { col: 9, row: 4 },
      'defender-0',
    );
    const s = stackById(state, 'defender-0');
    const muro = claves(LINEA.muros);
    for (const cabeza of movableHexes(state, s)) {
      for (const h of stackHexes({ ...s, hex: cabeza })) expect(muro.has(hexKey(h))).toBe(false);
    }
  });

  it('la cola de la grande que camina no lo atraviesa a mitad del recorrido', () => {
    // El caso del fuzz de QA (M1, `fuzz.ts 1 300`, batalla 14): troll defensor
    // de dos hexes en (9,3) —la cola a la derecha, en (10,3)— y muros en (8,3) y
    // (9,4). El recorrido se buscaba por la cabeza y salía por 9,2 → 8,2 → 7,3,
    // con la cola resbalando sobre el muro de (8,3).
    const muro = validarMuralla({
      muros: [
        { col: 8, row: 3 },
        { col: 9, row: 4 },
      ],
      puertas: [],
    });
    const troll = unidadDeArena('troll-maza', { hexes: 2, casillas: 7 });
    const lejos = unidadDeArena('troll-maza', { casillas: 7 });
    for (const [izq, der, quien, en] of [
      [[lejos], [troll], 'defender-0', { col: 9, row: 3 }],
      [[troll], [lejos], 'attacker-0', { col: 6, row: 3 }],
    ] as const) {
      const state = peleaDeArena(aPelear(izq), aPelear(der), createRng(1), muro);
      const s = stackById(state, quien);
      s.hex = en;
      stackById(state, quien === 'attacker-0' ? 'defender-0' : 'attacker-0').hex = {
        col: quien === 'attacker-0' ? 10 : 0,
        row: 8,
      };
      forzarTurno(state, quien);
      const destinos = [...movableFrom(state, s).values()];
      expect(destinos.length).toBeGreaterThan(0);
      for (const paso of destinos) {
        for (const cabeza of caminoDe(paso)) {
          const cuerpo = stackHexes({ ...s, hex: cabeza }).map(hexKey);
          expect(
            cuerpo,
            `${quien} hacia ${hexKey(paso.at)} pasa por ${hexKey(cabeza)}`,
          ).not.toContain('8,3');
        }
      }
      // Y la distancia andando de la IA ve el mismo tablero: la cabeza no
      // puede ponerse donde la cola caería en el muro.
      const cola = quien === 'attacker-0' ? { col: 9, row: 3 } : { col: 7, row: 3 };
      expect(distanciaHasta(state, s, [en])(cola)).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('la carga de la grande no cruza el muro con la cola', () => {
    // La recta (3,2) → (4,5) pasa la cabeza por (3,3) y (4,4); el atacante lleva
    // la cola a la izquierda, así que con la cabeza en (4,4) la cola pisa (3,4),
    // que no está en la recta. Con el muro ahí, la cola lo cruzaría.
    const jinete = unidadDeArena('troll-maza', { hexes: 2, casillas: 7, traits: ['charge'] });
    const blanco = unidadDeArena('troll-maza', { casillas: 7 });
    const carga = (m: MurallaDeBatalla): number => {
      const state = peleaDeArena(aPelear([jinete]), aPelear([blanco]), createRng(1), m);
      const s = stackById(state, 'attacker-0');
      s.hex = { col: 3, row: 2 };
      const d = stackById(state, 'defender-0');
      d.hex = { col: 5, row: 6 };
      forzarTurno(state, 'attacker-0');
      return cargaDesde(state, s, { col: 4, row: 5 }, d);
    };
    expect(carga(SIN_MURALLA)).toBe(3);
    expect(carga(validarMuralla({ muros: [{ col: 3, row: 4 }], puertas: [] }))).toBe(0);
  });

  it('la carga no cruza el muro', () => {
    const muro = validarMuralla({ muros: [{ col: 6, row: 4 }], puertas: [] });
    const conMuro = duelo(muro, 'cavalry', { col: 3, row: 4 }, 'pikeman', { col: 8, row: 4 });
    const sinMuro = duelo(SIN_MURALLA, 'cavalry', { col: 3, row: 4 }, 'pikeman', {
      col: 8,
      row: 4,
    });
    const desde = { col: 7, row: 4 };
    const carga = (st: BattleState): number =>
      cargaDesde(st, stackById(st, 'attacker-0'), desde, stackById(st, 'defender-0'));
    expect(carga(sinMuro)).toBe(4);
    expect(carga(conMuro)).toBe(0);
  });
});

describe('la puerta (C4, C20 de la ampliación 3)', () => {
  it('cerrada no la cruza nadie, tampoco quien defiende', () => {
    const state = duelo(
      CON_PUERTA,
      'swordsman',
      { col: 0, row: 0 },
      'swordsman',
      { col: 8, row: 4 },
      'defender-0',
    );
    const movibles = claves(movableHexes(state, stackById(state, 'defender-0')));
    expect(movibles.has('7,4')).toBe(false);
    expect(movibles.has('6,4')).toBe(false);
    // Al muro de al lado sí sube andando: las escaleras de dentro.
    expect(movibles.has('7,3')).toBe(true);
    expect(movimientoBlocker(state, { col: 7, row: 4 })).toBe(
      'la puerta está cerrada: no pasa nadie',
    );
    expect(movimientoBlocker(state, { col: 6, row: 4 })).toBe(
      'la puerta está cerrada: no pasa nadie',
    );
  });

  it('abierta la cruzan y la pisan los dos bandos', () => {
    const defensa = duelo(
      CON_PUERTA,
      'swordsman',
      { col: 0, row: 0 },
      'swordsman',
      { col: 8, row: 4 },
      'defender-0',
    );
    abrirPuertas(defensa);
    const suyas = claves(movableHexes(defensa, stackById(defensa, 'defender-0')));
    expect(suyas.has('7,4')).toBe(true);
    expect(suyas.has('6,4')).toBe(true);
    const ataque = duelo(CON_PUERTA, 'swordsman', { col: 5, row: 4 }, 'pikeman', {
      col: 10,
      row: 0,
    });
    abrirPuertas(ataque);
    const movibles = claves(movableHexes(ataque, stackById(ataque, 'attacker-0')));
    expect(movibles.has('7,4')).toBe(true);
    expect(movibles.has('8,4')).toBe(true);
    applyAction(ataque, { type: 'move', to: { col: 7, row: 4 } }, createRng(1));
    expect(stackById(ataque, 'attacker-0').hex).toEqual({ col: 7, row: 4 });
  });

  it('las dos casillas de la puerta se pisan: lo cerrado es el paso entre ellas (C27)', () => {
    const state = duelo(CON_PUERTA, 'swordsman', { col: 5, row: 4 }, 'pikeman', {
      col: 10,
      row: 0,
    });
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    // El hueco (7,4) es suelo, a su lado oeste de la puerta: se pisa.
    expect(movibles.has('7,4')).toBe(true);
    expect([...movibles].filter((k) => Number(k.split(',')[0]) >= 8)).toEqual([]);
    expect(movimientoBlocker(state, { col: 8, row: 4 })).toBe(
      'la puerta está cerrada: no pasa nadie',
    );
    applyAction(state, { type: 'move', to: { col: 7, row: 4 } }, createRng(1));
    expect(stackById(state, 'attacker-0').hex).toEqual({ col: 7, row: 4 });
  });

  it('el volador la sobrevuela, abierta o cerrada, y se posa a cualquier lado (C23)', () => {
    const state = duelo(CON_PUERTA, 'vampire', { col: 5, row: 4 }, 'pikeman', { col: 10, row: 0 });
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    expect(movibles.has('8,4')).toBe(true);
    expect(movibles.has('7,4')).toBe(true);
  });

  it('a la grande no la parte una puerta cerrada; abierta, puede plantarse en ella (C28)', () => {
    // El atacante lleva la cola a la izquierda: con la cabeza en (8,4), en (7,4).
    const andando = peleaDeArena(
      aPelear([unidadDeArena('troll-maza', { hexes: 2, casillas: 7 })]),
      aPelear([unidadDeArena('troll-maza', { casillas: 7 })]),
      createRng(1),
      CON_PUERTA,
    );
    stackById(andando, 'attacker-0').hex = { col: 5, row: 4 };
    stackById(andando, 'defender-0').hex = { col: 10, row: 0 };
    forzarTurno(andando, 'attacker-0');
    expect(movimientoBlocker(andando, { col: 8, row: 4 })).toBe(
      'no cabe: una puerta cerrada quedaría entre la cabeza y la cola',
    );
    // Abierta, la grande pasa por ella: cabeza al este, cola al oeste.
    abrirPuertas(andando);
    expect(movimientoBlocker(andando, { col: 8, row: 4 })).toBeNull();
    // Dragón óseo: vuela y ocupa dos hexes.
    const volando = duelo(CON_PUERTA, 'bone_dragon', { col: 5, row: 4 }, 'pikeman', {
      col: 10,
      row: 0,
    });
    expect(movimientoBlocker(volando, { col: 8, row: 4 })).toBe(
      'no cabe: una puerta cerrada quedaría entre la cabeza y la cola',
    );
    expect(claves(movableHexes(volando, stackById(volando, 'attacker-0'))).has('9,4')).toBe(true);
  });

  it('a quien está en la puerta abierta se le golpea desde fuera', () => {
    const state = duelo(CON_PUERTA, 'swordsman', { col: 5, row: 4 }, 'pikeman', {
      col: 7,
      row: 4,
    });
    abrirPuertas(state);
    const golpes = legalActions(state).filter(
      (a) => a.type === 'attack' && a.target === 'defender-0',
    );
    expect(golpes.length).toBeGreaterThan(0);
  });
});

describe('el despliegue esquiva la muralla', () => {
  const siete = (creature: string): BattleSide =>
    lado(Array.from({ length: 7 }, () => ({ creature, count: 1 })));

  it('sin muralla, el de siempre: pasarla vacía no cambia ni un hex', () => {
    const sin = createBattle(siete('peasant'), siete('bone_dragon'), createRng(1));
    const vacia = createBattle(siete('peasant'), siete('bone_dragon'), createRng(1), SIN_MURALLA);
    expect(vacia.stacks.map((s) => s.hex)).toEqual(sin.stacks.map((s) => s.hex));
    // La instantánea, para que un cambio del orden se vea aquí y no solo en el banco.
    expect(sin.stacks.filter((s) => s.side === 'attacker').map((s) => hexKey(s.hex))).toEqual([
      '0,4',
      '0,3',
      '0,5',
      '0,2',
      '0,6',
      '0,1',
      '0,7',
    ]);
    expect(sin.stacks.filter((s) => s.side === 'defender').map((s) => hexKey(s.hex))).toEqual([
      '9,4',
      '9,3',
      '9,5',
      '9,2',
      '9,6',
      '9,1',
      '9,7',
    ]);
  });

  it('nadie empieza en un muro, tampoco el defensor, y la grande no empieza partida por una puerta', () => {
    const m = validarMuralla({ muros: columna(10).filter((h) => h.row !== 4), puertas: [] });
    const b = createBattle(siete('peasant'), siete('peasant'), createRng(1), m);
    const cerradas = claves(m.muros);
    for (const s of b.stacks)
      for (const h of stackHexes(s)) expect(cerradas.has(hexKey(h))).toBe(false);
    // Con una puerta (cerrada) entre (9,4) y (10,4), la grande salta esa fila.
    const conPuerta = createBattle(
      siete('peasant'),
      lado([{ creature: 'bone_dragon', count: 1 }]),
      createRng(1),
      validarMuralla({ muros: [], puertas: [{ a: { col: 9, row: 4 }, b: { col: 10, row: 4 } }] }),
    );
    expect(stackHexes(stackById(conPuerta, 'defender-0')).map(hexKey)).toEqual(['9,3', '10,3']);
    // La grande salta la fila cuya cola caería en el muro.
    const g = createBattle(
      siete('peasant'),
      lado([{ creature: 'bone_dragon', count: 1 }]),
      createRng(1),
      validarMuralla({ muros: [{ col: 10, row: 4 }], puertas: [] }),
    );
    expect(stackHexes(stackById(g, 'defender-0')).map(hexKey)).toEqual(['9,3', '10,3']);
  });

  it('si no caben, lo dice', () => {
    const tapia = validarMuralla({
      muros: [...columna(8), ...columna(9), ...columna(10)],
      puertas: [],
    });
    // La misma frase antes de montar la batalla, que es la que lee el editor.
    const peones = Array.from({ length: 7 }, () => creature('peasant'));
    expect(despliegueBlocker(peones, 'defender', tapia)).toBe(
      'la muralla deja 0 casillas de salida a la derecha y hacen falta 7',
    );
    expect(despliegueBlocker(peones, 'attacker', tapia)).toBeNull();
    expect(despliegueBlocker(peones, 'defender', SIN_MURALLA)).toBeNull();
    expect(() => createBattle(siete('peasant'), siete('peasant'), createRng(1), tapia)).toThrow(
      'la muralla deja 0 casillas de salida a la derecha y hacen falta 7',
    );
    expect(() =>
      createBattle(
        siete('bone_dragon'),
        siete('peasant'),
        createRng(1),
        validarMuralla({ muros: columna(0), puertas: [] }),
      ),
    ).toThrow(
      'la muralla deja 0 filas de salida para unidades grandes a la izquierda y hacen falta 7',
    );
  });
});

describe('las frases del despliegue, con su plural (QA, M6)', () => {
  it('«1 fila», «1 casilla» y «hace falta 1»', () => {
    const dragones = (n: number) => Array.from({ length: n }, () => creature('bone_dragon'));
    const peones = (n: number) => Array.from({ length: n }, () => creature('peasant'));
    const columnaCeroMenosLaFila4 = validarMuralla({
      muros: columna(0).filter((h) => h.row !== 4),
      puertas: [],
    });
    expect(despliegueBlocker(dragones(2), 'attacker', columnaCeroMenosLaFila4)).toBe(
      'la muralla deja 1 fila de salida para unidades grandes a la izquierda y hacen falta 2',
    );
    expect(
      despliegueBlocker(
        dragones(1),
        'attacker',
        validarMuralla({ muros: columna(0), puertas: [] }),
      ),
    ).toBe('la muralla deja 0 filas de salida para unidades grandes a la izquierda y hace falta 1');
    const casiTapia = validarMuralla({
      muros: [...columna(8), ...columna(9), ...columna(10).filter((h) => h.row !== 4)],
      puertas: [],
    });
    expect(despliegueBlocker(peones(2), 'defender', casiTapia)).toBe(
      'la muralla deja 1 casilla de salida a la derecha y hacen falta 2',
    );
  });
});

describe('la zona de salida', () => {
  it('tres columnas de cada borde, y nada en medio', () => {
    expect([0, 2, 3, 7, 8, 10].map((col) => bandoDeSalida({ col, row: 4 }))).toEqual([
      'attacker',
      'attacker',
      null,
      null,
      'defender',
      'defender',
    ]);
  });
});

describe('las formas de ejemplo cierran lo que dicen', () => {
  const quien = (
    m: MurallaDeBatalla,
    side: 'attacker-0' | 'defender-0',
    abierta = false,
  ): number => {
    const state = duelo(m, 'swordsman', { col: 1, row: 4 }, 'swordsman', { col: 9, row: 4 });
    if (abierta) abrirPuertas(state);
    const yo = stackById(state, side);
    const otro = stackById(state, side === 'attacker-0' ? 'defender-0' : 'attacker-0');
    return distanciaACaminar(state, yo, otro)(yo.hex);
  };

  it('la línea recta no la cruza nadie andando: de lo alto solo se baja hacia dentro', () => {
    expect(quien(forma('Línea recta'), 'attacker-0')).toBe(Number.POSITIVE_INFINITY);
    expect(quien(forma('Línea recta'), 'defender-0')).toBe(Number.POSITIVE_INFINITY);
  });

  it('la L no cierra: el defensor la rodea por su pie, que de lo alto no se baja delante', () => {
    // Por arriba eran 8: (9,4) → (8,4) → (7,4) arriba → (6,4) … Pero (6,4) es de
    // fuera (ampliación 2, C15): rodeando el pie, (8,5) → (7,6) … hasta (2,4), 10.
    expect(quien(forma('En L'), 'defender-0')).toBe(10);
  });

  it('por la puerta de la línea y del semicírculo: cerrada no pasa nadie, abierta los dos', () => {
    for (const nombre of ['Línea con puerta', 'Semicírculo']) {
      expect(quien(forma(nombre), 'attacker-0')).toBe(Number.POSITIVE_INFINITY);
      expect(quien(forma(nombre), 'defender-0')).toBe(Number.POSITIVE_INFINITY);
      expect(quien(forma(nombre), 'attacker-0', true)).toBeLessThan(Number.POSITIVE_INFINITY);
      expect(quien(forma(nombre), 'defender-0', true)).toBeLessThan(Number.POSITIVE_INFINITY);
    }
  });

  it('el recorrido se guarda por muralla, puertas abiertas, bando y destino (C24)', () => {
    const state = duelo(CON_PUERTA, 'swordsman', { col: 5, row: 4 }, 'pikeman', { col: 9, row: 4 });
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    expect(distanciaHasta(state, a, [d.hex])).toBe(distanciaHasta(state, a, [d.hex]));
    // Cerrada no llega nadie; abierta, los dos, y la caché no devuelve el de antes.
    const cerrada = distanciaHasta(state, a, [{ col: 9, row: 4 }]);
    expect(cerrada({ col: 5, row: 4 })).toBe(Number.POSITIVE_INFINITY);
    expect(distanciaHasta(state, d, [{ col: 5, row: 4 }])({ col: 9, row: 4 })).toBe(
      Number.POSITIVE_INFINITY,
    );
    abrirPuertas(state);
    expect(distanciaHasta(state, a, [{ col: 9, row: 4 }])({ col: 5, row: 4 })).toBe(4);
    expect(distanciaHasta(state, d, [{ col: 5, row: 4 }])({ col: 9, row: 4 })).toBe(4);
    // Y cerrada otra vez, el de cerrada.
    (state.puertas[0] as { abierta: boolean }).abierta = false;
    expect(distanciaHasta(state, a, [{ col: 9, row: 4 }])).toBe(cerrada);
  });

  it('la L está abierta: se llega rodeando, más lejos que en recta', () => {
    const state = duelo(forma('En L'), 'swordsman', { col: 5, row: 3 }, 'pikeman', {
      col: 9,
      row: 2,
    });
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    expect(distanciaACaminar(state, a, d)(a.hex)).toBeGreaterThan(4);
    expect(distanciaACaminar(state, a, d)(a.hex)).toBeLessThan(Number.POSITIVE_INFINITY);
    // Sin muralla, la distancia andando es la de siempre.
    const libre = duelo(SIN_MURALLA, 'swordsman', { col: 5, row: 3 }, 'pikeman', {
      col: 9,
      row: 2,
    });
    const al = stackById(libre, 'attacker-0');
    expect(distanciaACaminar(libre, al, stackById(libre, 'defender-0'))(al.hex)).toBe(4);
  });
});

describe('la IA juega con muros sin colgarse (C5)', () => {
  it('sin camino a nadie, el atacante se defiende', () => {
    const state = duelo(LINEA, 'swordsman', { col: 5, row: 4 }, 'pikeman', { col: 9, row: 4 });
    expect(chooseBattleAction(state)).toEqual({ type: 'defend' });
  });

  it('el atacante rodea la L en vez de quedarse pegado al muro', () => {
    const state = duelo(forma('En L'), 'swordsman', { col: 5, row: 3 }, 'pikeman', {
      col: 9,
      row: 2,
    });
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    // Que el defensor ya haya actuado: si no, la IA cede la iniciativa (`wait`)
    // antes de meterse en su alcance, y eso es otra regla.
    d.acted = true;
    const accion = chooseBattleAction(state);
    if (accion.type !== 'move') throw new Error(`esperaba un move y es ${accion.type}`);
    const distancia = distanciaACaminar(state, a, d);
    expect(distancia(accion.to)).toBeLessThan(distancia(a.hex));
    // En recta habría ido a pegarse al muro, a la columna 6.
    expect(accion.to.col).toBeLessThan(6);
  });

  it('no cede la iniciativa por un alcance que andando no hay (convieneEsperar)', () => {
    // El zombi defensor sube al anillo hacia el piquero encerrado en su hueco,
    // que no ha actuado: en recta el piquero llega a donde va; andando no sube
    // al muro, y no hay por qué esperarle. Era la L, por encima de su palo; con
    // la ampliación 2 de su palo no se baja delante y el zombi la rodea por el
    // suelo, donde el piquero sí le llega. El hueco del anillo es dentro (C15).
    const centro = { col: 5, row: 4 };
    const hueco = new Set([centro, ...neighbours(centro)].map(hexKey));
    const anillo = new Map(
      neighbours(centro)
        .flatMap((n) => neighbours(n))
        .filter((x) => !hueco.has(hexKey(x)))
        .map((x) => [hexKey(x), x]),
    );
    const state = duelo(
      validarMuralla({ muros: [...anillo.values()], puertas: [] }),
      'pikeman',
      centro,
      'zombie',
      { col: 9, row: 4 },
      'defender-0',
    );
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    const accion = chooseBattleAction(state);
    if (accion.type !== 'move') throw new Error(`esperaba un move y es ${accion.type}`);
    expect(accion.to.col).toBe(7);
    expect(hexDistance(a.hex, accion.to)).toBeLessThanOrEqual(stackSpeed(a) + 1);
    expect(distanciaHasta(state, a, [accion.to])(a.hex)).toBe(Number.POSITIVE_INFINITY);
    expect(d.waited).toBe(false);
  });

  it('cuerpo a cuerpo contra tiradores tras la línea: suben, tiran desde arriba y acaba', () => {
    const state = createBattle(
      lado([
        { creature: 'swordsman', count: 3 },
        { creature: 'pikeman', count: 3 },
      ]),
      lado([{ creature: 'archer', count: 4 }]),
      createRng(7),
      forma('Línea recta'),
    );
    autoResolve(state, createRng(7));
    expect(state.finished).not.toBeNull();
    // Los tiros salen de lo alto de la línea: el arquero subió antes de tirar.
    const disparos = state.log.filter((e) => e.kind === 'shoot');
    expect(disparos.length).toBeGreaterThan(0);
    const subio = state.log.findIndex(
      (e) => e.kind === 'move' && e.stack === 'defender-0' && e.to.col === 7,
    );
    expect(subio).toBeGreaterThanOrEqual(0);
    expect(subio).toBeLessThan(state.log.indexOf(disparos[0]!));
  });

  it('nadie llega a nadie: se acaba por rondas, sin colgarse', () => {
    // Dos de dos casillas: ninguna sube, y la línea no tiene hueco.
    const troll = unidadDeArena('troll-maza', { hexes: 2, casillas: 4 });
    const state = peleaDeArena(
      aPelear([troll]),
      aPelear([troll]),
      createRng(7),
      forma('Línea recta'),
    );
    autoResolve(state, createRng(7));
    expect(state.finished).not.toBeNull();
    expect(state.round).toBe(MAX_ROUNDS);
  });

  it('con puerta o con la L, cada forma de ejemplo termina antes del tope', () => {
    for (const nombre of ['Línea con puerta', 'Semicírculo', 'En L']) {
      const state = createBattle(
        lado([
          { creature: 'swordsman', count: 3 },
          { creature: 'cavalry', count: 2 },
          { creature: 'vampire', count: 2 },
        ]),
        lado([
          { creature: 'pikeman', count: 3 },
          { creature: 'archer', count: 3 },
        ]),
        createRng(11),
        forma(nombre),
      );
      autoResolve(state, createRng(11));
      expect(state.finished, nombre).not.toBeNull();
      expect(state.round, nombre).toBeLessThan(MAX_ROUNDS);
    }
  });
});
