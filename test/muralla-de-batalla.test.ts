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
  movableHexes,
  movimientoBlocker,
  stackById,
  stackSpeed,
} from '../src/core/battle/battle.js';
import {
  allHexes,
  FORMA_DEL_TABLERO,
  hexDistance,
  hexKey,
  neighbours,
} from '../src/core/battle/board.js';
import { type MurallaDeBatalla, SIN_MURALLA, validarMuralla } from '../src/core/battle/muralla.js';
import type { BattleState } from '../src/core/battle/types.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack, UnitInfo } from '../src/core/types.js';
import {
  abrirPuertas,
  aMano,
  bandoDePersonajes,
  forzarTurno,
  JINETE,
  NO_MUERTO,
  PESADA,
  peleaDelMotor,
  TIRADOR,
  TROPA,
  TROPA_BARATA,
  unidadDeArena,
} from './helpers.js';

const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });

/** Un volador de 4 casillas (el vampiro): `flying`, que nadie del catálogo lleva. */
const VAMPIRO = aMano(NO_MUERTO, {
  name: 'Vampiro',
  speed: 'average',
  traits: ['undead', 'flying'],
});

const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};

/** La columna 7 entera, y la misma con la puerta en (7,4). */
const LINEA = forma('Línea recta');
const CON_PUERTA = forma('Línea con puerta');

/** Un bando de uno: tres de una unidad del catálogo, o uno hecho a mano. */
const deUno = (quien: string | UnitInfo): BattleSide =>
  typeof quien === 'string' ? lado([{ creature: quien, count: 3 }]) : bandoDePersonajes([quien]);

/**
 * Uno contra uno, cada uno donde diga el test y con el turno de quien diga. Los
 * hexes se ponen a mano: el despliegue tiene su propio test.
 */
function duelo(
  muralla: MurallaDeBatalla,
  atacante: string | UnitInfo,
  en: Hex,
  defensor: string | UnitInfo,
  enDefensor: Hex,
  turnoDe: 'attacker-0' | 'defender-0' = 'attacker-0',
): BattleState {
  const state = createBattle(
    deUno(atacante),
    deUno(defensor),
    createRng(3),
    COMBATE_COMPLETO,
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
    // La columna 11 existe en las filas pares y no en las impares.
    expect(() => validarMuralla({ muros: [{ col: 11, row: 1 }], puertas: [] })).toThrow(
      `cae en (11,1), fuera del tablero (${FORMA_DEL_TABLERO})`,
    );
    expect(validarMuralla({ muros: [{ col: 11, row: 0 }], puertas: [] }).muros).toHaveLength(1);
    // La puerta va entre una casilla y la de su este: (10,1) no tiene este.
    expect(() =>
      validarMuralla({ muros: [], puertas: [{ a: { col: 10, row: 1 }, b: { col: 11, row: 1 } }] }),
    ).toThrow('cae en (11,1), fuera del tablero');
    expect(
      validarMuralla({ muros: [], puertas: [{ a: { col: 10, row: 0 }, b: { col: 11, row: 0 } }] })
        .puertas,
    ).toHaveLength(1);
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
    expect(() => validarMuralla(puerta({ col: 10, row: 3 }, { col: 11, row: 3 }))).toThrow(
      'el lado b de la puerta 1 cae en (11,3), fuera del tablero',
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
        lado([{ creature: TROPA_BARATA, count: 1 }]),
        lado([{ creature: TROPA_BARATA, count: 1 }]),
        createRng(1),
        COMBATE_COMPLETO,
        mala,
      ),
    ).toThrow('fuera del tablero');
  });
});

describe('el muro (C3)', () => {
  it('el atacante que camina no sube ni lo cruza, y el núcleo dice por qué', () => {
    // La pesada (mandoble): 4 casillas. Sin muro llegaría a la columna 9.
    const state = duelo(LINEA, PESADA, { col: 5, row: 4 }, TROPA, {
      col: 10,
      row: 0,
    });
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
    // Sin muralla, la misma pesada sí llega: es el muro, no la distancia.
    const libre = duelo(SIN_MURALLA, PESADA, { col: 5, row: 4 }, TROPA, {
      col: 10,
      row: 0,
    });
    expect(claves(movableHexes(libre, stackById(libre, 'attacker-0'))).has('8,4')).toBe(true);
  });

  it('el defensor sube andando, anda por arriba y baja solo hacia dentro', () => {
    const state = duelo(LINEA, TROPA, { col: 0, row: 0 }, PESADA, { col: 8, row: 4 }, 'defender-0');
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
    const state = duelo(LINEA, PESADA, { col: 7, row: 4 }, TROPA, {
      col: 10,
      row: 0,
    });
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
    const state = duelo(LINEA, VAMPIRO, { col: 5, row: 4 }, TROPA, {
      col: 10,
      row: 0,
    });
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    expect(movibles.has('8,4')).toBe(true);
    for (const h of columna(7, 1, 7)) expect(movibles.has(hexKey(h))).toBe(true);
    expect(movimientoBlocker(state, { col: 7, row: 3 })).toBeNull();
    applyAction(state, { type: 'move', to: { col: 7, row: 3 } }, createRng(1));
    expect(stackById(state, 'attacker-0').hex).toEqual({ col: 7, row: 3 });
  });

  it('la carga no cruza el muro', () => {
    const muro = validarMuralla({ muros: [{ col: 6, row: 4 }], puertas: [] });
    const conMuro = duelo(muro, JINETE, { col: 3, row: 4 }, TROPA, { col: 8, row: 4 });
    const sinMuro = duelo(SIN_MURALLA, JINETE, { col: 3, row: 4 }, TROPA, {
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
      PESADA,
      { col: 0, row: 0 },
      PESADA,
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
      PESADA,
      { col: 0, row: 0 },
      PESADA,
      { col: 8, row: 4 },
      'defender-0',
    );
    abrirPuertas(defensa);
    const suyas = claves(movableHexes(defensa, stackById(defensa, 'defender-0')));
    expect(suyas.has('7,4')).toBe(true);
    expect(suyas.has('6,4')).toBe(true);
    const ataque = duelo(CON_PUERTA, PESADA, { col: 5, row: 4 }, TROPA, {
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
    const state = duelo(CON_PUERTA, PESADA, { col: 5, row: 4 }, TROPA, {
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
    const state = duelo(CON_PUERTA, VAMPIRO, { col: 5, row: 4 }, TROPA, { col: 10, row: 0 });
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    expect(movibles.has('8,4')).toBe(true);
    expect(movibles.has('7,4')).toBe(true);
  });

  it('a quien está en la puerta abierta se le golpea desde fuera', () => {
    const state = duelo(CON_PUERTA, PESADA, { col: 5, row: 4 }, TROPA, {
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
    const sin = createBattle(siete(TROPA_BARATA), siete(NO_MUERTO), createRng(1), COMBATE_COMPLETO);
    const vacia = createBattle(
      siete(TROPA_BARATA),
      siete(NO_MUERTO),
      createRng(1),
      COMBATE_COMPLETO,
      SIN_MURALLA,
    );
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
    // El espejo del atacante: la columna del borde derecho, la 11 en las filas
    // pares (de 12) y la 10 en las impares (de 11).
    expect(sin.stacks.filter((s) => s.side === 'defender').map((s) => hexKey(s.hex))).toEqual([
      '11,4',
      '10,3',
      '10,5',
      '11,2',
      '11,6',
      '10,1',
      '10,7',
    ]);
  });

  it('nadie empieza en un muro, tampoco el defensor', () => {
    const m = validarMuralla({ muros: columna(10).filter((h) => h.row !== 4), puertas: [] });
    const b = createBattle(
      siete(TROPA_BARATA),
      siete(TROPA_BARATA),
      createRng(1),
      COMBATE_COMPLETO,
      m,
    );
    const cerradas = claves(m.muros);
    for (const s of b.stacks) expect(cerradas.has(hexKey(s.hex))).toBe(false);
  });

  it('si no caben, lo dice', () => {
    // Toda la salida de la derecha: las tres últimas casillas de cada fila.
    const salidaDerecha = allHexes().filter((h) => bandoDeSalida(h) === 'defender');
    const tapia = validarMuralla({ muros: salidaDerecha, puertas: [] });
    // La misma frase antes de montar la batalla, que es la que lee el editor.
    const peones = Array.from({ length: 7 }, () => unidadDelJuego(TROPA_BARATA));
    expect(despliegueBlocker(peones, 'defender', tapia)).toBe(
      'la muralla deja 0 casillas de salida a la derecha y hacen falta 7',
    );
    expect(despliegueBlocker(peones, 'attacker', tapia)).toBeNull();
    expect(despliegueBlocker(peones, 'defender', SIN_MURALLA)).toBeNull();
    expect(() =>
      createBattle(siete(TROPA_BARATA), siete(TROPA_BARATA), createRng(1), COMBATE_COMPLETO, tapia),
    ).toThrow('la muralla deja 0 casillas de salida a la derecha y hacen falta 7');
  });
});

describe('las frases del despliegue, con su plural (QA, M6)', () => {
  it('«1 casilla» y «hacen falta 2»', () => {
    const peones = (n: number) => Array.from({ length: n }, () => unidadDelJuego(TROPA_BARATA));
    const casiTapia = validarMuralla({
      muros: allHexes().filter(
        (h) => bandoDeSalida(h) === 'defender' && !(h.col === 11 && h.row === 4),
      ),
      puertas: [],
    });
    expect(despliegueBlocker(peones(2), 'defender', casiTapia)).toBe(
      'la muralla deja 1 casilla de salida a la derecha y hacen falta 2',
    );
  });
});

describe('la zona de salida', () => {
  it('tres columnas de cada borde, y nada en medio', () => {
    // Fila par, de 12: la derecha es 9-11.
    expect([0, 2, 3, 8, 9, 11].map((col) => bandoDeSalida({ col, row: 4 }))).toEqual([
      'attacker',
      'attacker',
      null,
      null,
      'defender',
      'defender',
    ]);
    // Fila impar, de 11: la derecha es 8-10.
    expect([0, 2, 3, 7, 8, 10].map((col) => bandoDeSalida({ col, row: 3 }))).toEqual([
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
    const state = duelo(m, PESADA, { col: 1, row: 4 }, PESADA, {
      col: 9,
      row: 4,
    });
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
    const state = duelo(CON_PUERTA, PESADA, { col: 5, row: 4 }, TROPA, {
      col: 9,
      row: 4,
    });
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
    const state = duelo(forma('En L'), PESADA, { col: 5, row: 3 }, TROPA, {
      col: 9,
      row: 2,
    });
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    expect(distanciaACaminar(state, a, d)(a.hex)).toBeGreaterThan(4);
    expect(distanciaACaminar(state, a, d)(a.hex)).toBeLessThan(Number.POSITIVE_INFINITY);
    // Sin muralla, la distancia andando es la de siempre.
    const libre = duelo(SIN_MURALLA, PESADA, { col: 5, row: 3 }, TROPA, {
      col: 9,
      row: 2,
    });
    const al = stackById(libre, 'attacker-0');
    expect(distanciaACaminar(libre, al, stackById(libre, 'defender-0'))(al.hex)).toBe(4);
  });
});

describe('la IA juega con muros sin colgarse (C5)', () => {
  it('sin camino a nadie, el atacante se defiende', () => {
    const state = duelo(LINEA, PESADA, { col: 5, row: 4 }, TROPA, {
      col: 9,
      row: 4,
    });
    expect(chooseBattleAction(state)).toEqual({ type: 'defend' });
  });

  it('el atacante rodea la L en vez de quedarse pegado al muro', () => {
    const state = duelo(forma('En L'), PESADA, { col: 5, row: 3 }, TROPA, {
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
    // El zombi, a 2 casillas, las que tenía con el escudo que restaba (hasta el
    // 25-10-2026): la geometría del caso es de esa marcha.
    const state = duelo(
      validarMuralla({ muros: [...anillo.values()], puertas: [] }),
      TROPA,
      centro,
      { ...unidadDelJuego('zombi'), speed: 'very_slow' },
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
        { creature: PESADA, count: 3 },
        { creature: TROPA, count: 3 },
      ]),
      lado([{ creature: TIRADOR, count: 4 }]),
      createRng(7),
      COMBATE_COMPLETO,
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
    // Ninguno sube (el atacante no lleva escalera ni sabe escalar; el defensor, a
    // su lado), nadie dispara y la línea no tiene hueco.
    const troll = { unidad: unidadDeArena('troll-maza', { agilidad: 4 }) };
    const state = peleaDelMotor([troll], [troll], createRng(7), forma('Línea recta'));
    autoResolve(state, createRng(7));
    expect(state.finished).not.toBeNull();
    expect(state.round).toBe(MAX_ROUNDS);
  });

  it('con puerta o con la L, cada forma de ejemplo termina antes del tope', () => {
    for (const nombre of ['Línea con puerta', 'Semicírculo', 'En L']) {
      const state = createBattle(
        lado([
          { creature: PESADA, count: 3 },
          { creature: JINETE, count: 2 },
          { creature: 'caballero-de-la-muerte', count: 2 },
        ]),
        lado([
          { creature: TROPA, count: 3 },
          { creature: TIRADOR, count: 3 },
        ]),
        createRng(11),
        COMBATE_COMPLETO,
        forma(nombre),
      );
      autoResolve(state, createRng(11));
      expect(state.finished, nombre).not.toBeNull();
      expect(state.round, nombre).toBeLessThan(MAX_ROUNDS);
    }
  });
});
