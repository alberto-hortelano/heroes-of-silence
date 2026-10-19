/**
 * La ampliación 2 de la muralla alta (`docs/agents/2026-10-09-muralla-alta/`,
 * criterios 15-18): el usuario, al probarla, vio a la IA pasar por encima de la
 * muralla y bajar por el otro lado, y pidió probar murallas de más de una
 * casilla de fondo.
 *
 * - C15: dentro y fuera por cercanía andando a cada salida, también en las
 *   formas que no cierran;
 * - C16: murallas gruesas: de muro a muro se anda arriba, se baja solo a dentro
 *   y el defensor sube solo desde dentro;
 * - C17: por la puerta pasa solo el defensor;
 * - C18: la columna que tapa la casilla señalada, translúcida, y la figura
 *   tapada, en silueta (lo puro: qué columnas y qué figuras).
 */
import { describe, expect, it } from 'vitest';
import { renderMuralla } from '../src/client/arena/paneles.js';
import { EscenaBatalla } from '../src/client/escenas/batalla.js';
import { marcadoDe } from '../src/client/html.js';
import {
  alturaDeColumna,
  alzadoDeLaMuralla,
  columnasQueTapan,
  columnasTranslucidas,
  siluetaDeColumna,
  tapadasPorLaMuralla,
} from '../src/client/render/batalla.js';
import { centroHex, hexEnPixel, planoDeHex, tableroPara } from '../src/client/render/proyeccion.js';
import { autoResolve } from '../src/core/ai/tactics.js';
import { FORMAS_DE_EJEMPLO, ladosDeLaForma } from '../src/core/arena-murallas.js';
import {
  type BattleSide,
  createBattle,
  movableHexes,
  movimientoBlocker,
  stackById,
} from '../src/core/battle/battle.js';
import { allHexes, anchoDeFila, hexKey, neighbours } from '../src/core/battle/board.js';
import {
  cierra,
  esMuro,
  ladoDeLaMuralla,
  type MurallaDeBatalla,
  nivelDe,
  SIN_MURALLA,
  validarMuralla,
} from '../src/core/battle/muralla.js';
import type { BattleState } from '../src/core/battle/types.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack } from '../src/core/types.js';
import {
  abrirPuertas,
  forzarTurno,
  peleaDeArena,
  sesionDeArena,
  unidadDeArena,
} from './helpers.js';

const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};
const h = (col: number, row: number): Hex => ({ col, row });
const FILAS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/**
 * Columnas `cols` enteras sin las filas `sin`; si se da `puerta`, esa fila es un
 * pasillo con la puerta entre su primera casilla y la de su este (ampliación 4).
 */
function recta(cols: number[], puerta: number | null, sin: number[] = []): MurallaDeBatalla {
  const muros: Hex[] = [];
  for (const row of FILAS.filter((r) => !sin.includes(r) && r !== puerta)) {
    for (const col of cols) muros.push({ col, row });
  }
  const c = cols[0] as number;
  const puertas = puerta === null ? [] : [{ a: h(c, puerta), b: h(c + 1, puerta) }];
  return validarMuralla({ muros, puertas });
}
/** Los lados de las puertas de `m`, en los dos sentidos, como «a|b». */
const ladosDePuertas = (m: MurallaDeBatalla): Set<string> =>
  new Set(
    m.puertas.flatMap((p) => [`${hexKey(p.a)}|${hexKey(p.b)}`, `${hexKey(p.b)}|${hexKey(p.a)}`]),
  );
/** El arco del semicírculo de ejemplo, columna por fila. */
const ARCO = [8, 7, 7, 6, 6, 6, 7, 7, 8];
function arco(grosor: number, filas: number[], conPuerta: boolean): MurallaDeBatalla {
  const muros: Hex[] = [];
  for (const row of filas) {
    if (conPuerta && row === 4) continue;
    for (let i = 0; i < grosor; i++) muros.push({ col: (ARCO[row] as number) + i, row });
  }
  const puertas = conPuerta ? [{ a: h(6, 4), b: h(7, 4) }] : [];
  return validarMuralla({ muros, puertas });
}
const GRUESA = forma('Muralla gruesa');
const SEMICIRCULO_GRUESO = forma('Semicírculo grueso');
const RECTA_2 = recta([6, 7], null);
const RECTA_3 = recta([5, 6, 7], 4);
/** El semicírculo sin sus puntas: no llega a los bordes y no cierra. */
const ARCO_ABIERTO = arco(1, [1, 2, 3, 4, 5, 6, 7], true);
const ARCO_ABIERTO_2 = arco(2, [1, 2, 3, 4, 5, 6, 7], true);

const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });
function duelo(
  muralla: MurallaDeBatalla,
  en: Hex,
  enDefensor: Hex,
  turnoDe: 'attacker-0' | 'defender-0',
): BattleState {
  const state = createBattle(
    lado([{ creature: 'templario-mandoble', count: 3 }]),
    lado([{ creature: 'templario-mandoble', count: 3 }]),
    createRng(3),
    muralla,
  );
  stackById(state, 'attacker-0').hex = en;
  stackById(state, 'defender-0').hex = enDefensor;
  for (const s of state.stacks) s.morale = 0;
  forzarTurno(state, turnoDe);
  return state;
}
const movibles = (state: BattleState, id: string): Set<string> =>
  new Set(movableHexes(state, stackById(state, id)).map(hexKey));

/**
 * Dentro y fuera contados aquí aparte, sin `ladoDeLaMuralla`: los pasos andando
 * a cada salida con muros y puertas cerrados; fuera, lo que queda más cerca de
 * la del atacante (columnas 0-2) que de la del defensor (las tres últimas de
 * cada fila: 9-11 en las pares, 8-10 en las impares).
 */
function fueraAMano(m: MurallaDeBatalla): Set<string> {
  const maciza = new Set(m.muros.map(hexKey));
  const cortes = ladosDePuertas(m);
  const pasos = (salida: (x: Hex) => boolean): Map<string, number> => {
    const d = new Map<string, number>();
    let frente: Hex[] = [];
    for (const x of allHexes()) {
      if (salida(x) && !maciza.has(hexKey(x))) {
        d.set(hexKey(x), 0);
        frente.push(x);
      }
    }
    for (let n = 1; frente.length > 0; n++) {
      const siguiente: Hex[] = [];
      for (const x of frente) {
        for (const y of neighbours(x)) {
          if (maciza.has(hexKey(y)) || d.has(hexKey(y))) continue;
          if (cortes.has(`${hexKey(x)}|${hexKey(y)}`)) continue;
          d.set(hexKey(y), n);
          siguiente.push(y);
        }
      }
      frente = siguiente;
    }
    return d;
  };
  const alAtacante = pasos((x) => x.col < 3);
  const alDefensor = pasos((x) => x.col >= anchoDeFila(x.row) - 3);
  const fuera = new Set<string>();
  for (const [k, n] of alAtacante) if (n < (alDefensor.get(k) ?? Infinity)) fuera.add(k);
  return fuera;
}

describe('dentro y fuera por cercanía andando (C15)', () => {
  it('en una forma que no cierra, lo de delante de la curva es fuera y lo de detrás dentro', () => {
    expect(cierra(ARCO_ABIERTO)).toBe(false);
    for (const k of [h(5, 4), h(5, 2), h(4, 0), h(2, 8)]) {
      expect(ladoDeLaMuralla(ARCO_ABIERTO, k), hexKey(k)).toBe('fuera');
    }
    for (const k of [h(7, 4), h(8, 0), h(7, 3), h(9, 8)]) {
      expect(ladoDeLaMuralla(ARCO_ABIERTO, k), hexKey(k)).toBe('dentro');
    }
  });

  it('el empate es dentro: a la misma distancia de las dos salidas', () => {
    // Un muro en una esquina que no estorba. El eje del tablero cae en 5,5: en
    // una fila impar, (5, impar) queda a 3 de cada salida, un empate; en una
    // par no hay empate, (5, par) está a 3 de la izquierda y a 4 de la derecha.
    const esquina = validarMuralla({ muros: [h(0, 0)], puertas: [] });
    expect(ladoDeLaMuralla(esquina, h(5, 3))).toBe('dentro');
    expect(ladoDeLaMuralla(esquina, h(4, 3))).toBe('fuera');
    expect(ladoDeLaMuralla(esquina, h(6, 3))).toBe('dentro');
    expect(ladoDeLaMuralla(esquina, h(5, 4))).toBe('fuera');
    expect(ladoDeLaMuralla(esquina, h(6, 4))).toBe('dentro');
  });

  it('en todas las formas, lo que dice el núcleo es lo contado a mano', () => {
    const formas = [
      ...FORMAS_DE_EJEMPLO.map((f) => f.muralla),
      RECTA_2,
      RECTA_3,
      ARCO_ABIERTO,
      ARCO_ABIERTO_2,
      recta([6, 7], null, [8]),
    ];
    for (const m of formas) {
      const fuera = fueraAMano(m);
      for (const k of allHexes()) {
        const esperado = esMuro(m, k) ? 'muralla' : fuera.has(hexKey(k)) ? 'fuera' : 'dentro';
        expect(ladoDeLaMuralla(m, k), hexKey(k)).toBe(esperado);
      }
    }
  });

  it('con una forma que cierra, dentro sigue siendo lo unido a la salida del defensor', () => {
    for (const m of [GRUESA, SEMICIRCULO_GRUESO, RECTA_3, forma('Línea con puerta')]) {
      expect(cierra(m)).toBe(true);
      const maciza = new Set(m.muros.map(hexKey));
      const cortes = ladosDePuertas(m);
      const unido = new Set<string>();
      const pila: Hex[] = [];
      for (const x of allHexes()) {
        if (x.col >= anchoDeFila(x.row) - 3 && !maciza.has(hexKey(x))) pila.push(x);
      }
      for (let x = pila.pop(); x !== undefined; x = pila.pop()) {
        if (unido.has(hexKey(x))) continue;
        unido.add(hexKey(x));
        for (const y of neighbours(x)) {
          if (!maciza.has(hexKey(y)) && !cortes.has(`${hexKey(x)}|${hexKey(y)}`)) pila.push(y);
        }
      }
      for (const x of allHexes()) {
        if (maciza.has(hexKey(x))) continue;
        expect(ladoDeLaMuralla(m, x), hexKey(x)).toBe(unido.has(hexKey(x)) ? 'dentro' : 'fuera');
      }
    }
  });

  it('la ayuda y la rejilla del editor lo dicen así también si no cierra', () => {
    expect(ladosDeLaForma(ARCO_ABIERTO)).toContain('no cierra');
    expect(ladosDeLaForma(ARCO_ABIERTO)).toContain('Lo rayado es fuera');
    expect(ladosDeLaForma(GRUESA)).toContain('Esta forma cierra');
    const rejilla = marcadoDe(
      renderMuralla({
        muralla: ARCO_ABIERTO,
        herramienta: 'muro',
        nombre: '',
        ejemplos: FORMAS_DE_EJEMPLO,
        guardadas: [],
        sinGuardado: null,
        despliegue: null,
        plegado: false,
      }),
    );
    expect(rejilla.match(/class="hex[^"]*\bfuera\b/g)?.length).toBe(fueraAMano(ARCO_ABIERTO).size);
    expect(rejilla).toContain('title="(5,4) vacío, fuera"');
  });
});

describe('murallas gruesas (C16)', () => {
  it('el defensor anda de muro a muro y baja solo hacia dentro', () => {
    const state = duelo(GRUESA, h(1, 8), h(7, 2), 'defender-0');
    const va = movibles(state, 'defender-0');
    expect(va.has('6,2')).toBe(true);
    expect(va.has('6,1')).toBe(true);
    expect(va.has('8,2')).toBe(true);
    for (const k of ['5,2', '5,1', '5,3']) expect(va.has(k), k).toBe(false);
    expect(movimientoBlocker(state, h(5, 2))).toBe('desde la muralla solo se baja hacia dentro');
  });

  it('el atacante que subió por la cara de fuera cruza por arriba y baja dentro, no fuera', () => {
    for (const m of [GRUESA, RECTA_2]) {
      const state = duelo(m, h(6, 2), h(10, 8), 'attacker-0');
      const va = movibles(state, 'attacker-0');
      expect(va.has('7,2')).toBe(true);
      expect(va.has('8,2')).toBe(true);
      expect(va.has('5,2')).toBe(false);
      expect(movimientoBlocker(state, h(5, 2))).toBe('desde la muralla solo se baja hacia dentro');
    }
  });

  it('el defensor de fuera no sube: las escaleras están dentro', () => {
    const state = duelo(RECTA_2, h(0, 8), h(5, 2), 'defender-0');
    expect(movibles(state, 'defender-0').has('6,2')).toBe(false);
    expect(movimientoBlocker(state, h(6, 2))).toBe(
      'desde fuera no se sube a la muralla: sus escaleras están dentro',
    );
  });

  it('de tres de fondo: se anda por los tres y se baja solo a la columna 8', () => {
    const state = duelo(RECTA_3, h(1, 8), h(7, 1), 'defender-0');
    const va = movibles(state, 'defender-0');
    for (const k of ['6,1', '5,1', '8,1']) expect(va.has(k), k).toBe(true);
    for (const k of ['4,1', '4,0', '4,2']) expect(va.has(k), k).toBe(false);
  });

  it('el semicírculo grueso: de lo alto, al arco y no afuera', () => {
    const state = duelo(SEMICIRCULO_GRUESO, h(1, 8), h(6, 3), 'defender-0');
    const va = movibles(state, 'defender-0');
    expect(va.has('7,3')).toBe(true);
    expect(va.has('8,3')).toBe(true);
    expect(va.has('5,3')).toBe(false);
    expect(va.has('5,2')).toBe(false);
  });

  it('el pasillo de dos de fondo con la puerta en medio: cerrada no la cruza nadie, abierta los dos (C20, C27)', () => {
    const def = duelo(GRUESA, h(0, 8), h(8, 4), 'defender-0');
    // Hasta su lado del pasillo, sí; al otro, no.
    expect(movibles(def, 'defender-0').has('7,4')).toBe(true);
    expect(movibles(def, 'defender-0').has('6,4')).toBe(false);
    expect(movimientoBlocker(def, h(6, 4))).toBe('la puerta está cerrada: no pasa nadie');
    abrirPuertas(def);
    expect(movibles(def, 'defender-0').has('5,4')).toBe(true);
    const at = duelo(GRUESA, h(5, 4), h(10, 8), 'attacker-0');
    expect(movibles(at, 'attacker-0').has('6,4')).toBe(true);
    expect(movibles(at, 'attacker-0').has('7,4')).toBe(false);
    expect(movimientoBlocker(at, h(7, 4))).toBe('la puerta está cerrada: no pasa nadie');
    abrirPuertas(at);
    expect(movibles(at, 'attacker-0').has('8,4')).toBe(true);
  });

  it('IA contra IA: nadie baja fuera, ningún defensor sube desde fuera, nadie cruza una puerta cerrada, y acaba (C16, C20)', () => {
    const formas: [string, MurallaDeBatalla][] = [
      ['Muralla gruesa', GRUESA],
      ['Semicírculo grueso', SEMICIRCULO_GRUESO],
      ['recta de tres con puerta', RECTA_3],
      ['recta de dos con hueco', recta([6, 7], null, [8])],
      ['arco abierto', ARCO_ABIERTO],
      ['arco abierto de dos', ARCO_ABIERTO_2],
    ];
    let subidas = 0;
    let bajadas = 0;
    for (const [nombre, m] of formas) {
      const fuera = fueraAMano(m);
      const cortes = ladosDePuertas(m);
      for (const semilla of [1, 2, 3]) {
        const state = peleaDeArena(
          [
            { unidad: unidadDeArena('zombi', { traits: ['escalar'] }) },
            { unidad: unidadDeArena('imperio-piquero'), escalera: true },
            { unidad: unidadDeArena('goblin-lancero'), escalera: true },
          ],
          [
            { unidad: unidadDeArena('elfo-arquero') },
            { unidad: unidadDeArena('imperio-ballestero') },
            { unidad: unidadDeArena('orko-hacha-escudo') },
          ],
          createRng(semilla),
          m,
        );
        const donde = new Map(state.stacks.map((s) => [s.id, s.hex]));
        const abiertas = new Set<string>();
        autoResolve(state, createRng(semilla));
        const caso = `${nombre}, semilla ${semilla}`;
        expect(state.finished, caso).not.toBeNull();
        for (const e of state.log) {
          if (e.kind === 'climbed') {
            subidas++;
            donde.set(e.stack, e.to);
          }
          const lado = (p: { a: Hex; b: Hex }): string[] => [
            `${hexKey(p.a)}|${hexKey(p.b)}`,
            `${hexKey(p.b)}|${hexKey(p.a)}`,
          ];
          if (e.kind === 'gate_opened') for (const k of lado(e.puerta)) abiertas.add(k);
          if (e.kind === 'gate_closed') for (const k of lado(e.puerta)) abiertas.delete(k);
          if (e.kind !== 'move') continue;
          const st = stackById(state, e.stack);
          let antes = donde.get(e.stack) as Hex;
          donde.set(e.stack, e.to);
          for (const paso of e.path) {
            const cruce = `${hexKey(antes)}|${hexKey(paso)}`;
            if (cortes.has(cruce)) {
              expect(abiertas.has(cruce), `${caso}: ${e.stack} cruza cerrada ${cruce}`).toBe(true);
            }
            if (esMuro(m, antes) && !esMuro(m, paso)) {
              bajadas++;
              expect(fuera.has(hexKey(paso)), `${caso}: ${e.stack} baja a ${hexKey(paso)}`).toBe(
                false,
              );
            }
            if (st.side === 'defender' && !esMuro(m, antes) && esMuro(m, paso)) {
              expect(fuera.has(hexKey(antes)), `${caso}: ${e.stack} sube desde fuera`).toBe(false);
            }
            antes = paso;
          }
        }
      }
    }
    expect(subidas).toBeGreaterThan(0);
    expect(bajadas).toBeGreaterThan(0);
    // Cuántas veces se cruza una puerta (abierta) depende de la IA de la puerta,
    // que tiene su propio test (`muralla-puerta.test.ts`); aquí, que nunca cerrada.
  });
});

describe('la columna translúcida y la figura en silueta (C18)', () => {
  const LINEA = forma('Línea recta');
  const t = tableroPara(1280, 720, alzadoDeLaMuralla(LINEA));

  it('la silueta de una columna va de su pie a lo alto de su tapa', () => {
    const silueta = siluetaDeColumna(t, h(7, 3));
    const c = centroHex(t, h(7, 3));
    const ys = silueta.map((p) => p.y);
    expect(Math.min(...ys)).toBeLessThan(c.y - alturaDeColumna(t));
    expect(Math.max(...ys)).toBeGreaterThan(c.y);
  });

  it('tapan a una casilla las columnas de delante que la pisan, nunca las de detrás', () => {
    const fila = (k: string): number => Number(k.split(',')[1]);
    const tapan = columnasQueTapan(t, LINEA, h(8, 2));
    expect(tapan).toContain('7,3');
    for (const c of tapan) expect(fila(c)).toBeGreaterThan(2);
    // La fila de delante no tiene nada delante.
    expect(columnasQueTapan(t, LINEA, h(8, 8))).toEqual([]);
    // Ni con el puntero sobre la columna de detrás: esa se pinta antes que la casilla.
    const detras = centroHex(t, h(7, 3));
    const conPuntero = columnasQueTapan(t, LINEA, h(8, 4), [{ x: detras.x, y: detras.y - 10 }]);
    expect(conPuntero).not.toContain('7,3');
    for (const c of conPuntero) expect(fila(c)).toBeGreaterThan(4);
  });

  it('se vuelve translúcida la que tapa la casilla señalada o la elegida, no la que se señala', () => {
    expect([...columnasTranslucidas(t, LINEA, h(8, 2), null, null)]).toContain('7,3');
    expect([...columnasTranslucidas(t, LINEA, null, h(8, 2), null)]).toContain('7,3');
    // Con el puntero en la tapa, lo señalado es el muro: nada translúcido.
    expect(columnasTranslucidas(t, LINEA, h(7, 3), null, null).size).toBe(0);
    expect(columnasTranslucidas(t, SIN_MURALLA, h(8, 2), null, null).size).toBe(0);
  });

  it('la figura detrás de una columna está tapada por ella; la de delante, no', () => {
    const m = forma('Semicírculo');
    const state = createBattle(
      lado([{ creature: 'templario-mandoble', count: 3 }]),
      lado([
        { creature: 'templario-mandoble', count: 3 },
        { creature: 'templario-escudo', count: 3 },
      ]),
      createRng(3),
      m,
    );
    stackById(state, 'attacker-0').hex = h(0, 8);
    stackById(state, 'defender-0').hex = h(7, 5);
    stackById(state, 'defender-1').hex = h(7, 2);
    const figura = (s: BattleState['stacks'][number]) => ({
      en: planoDeHex(s.hex),
      caida: null,
      elevacion: nivelDe(m, s.hex),
      visible: true,
    });
    const tm = tableroPara(1280, 720, alzadoDeLaMuralla(m));
    const tapadas = tapadasPorLaMuralla(tm, state, figura);
    expect(tapadas.get('defender-0')?.map((x) => x.clave)).toContain('7,7');
    // En lo alto de (7,2) no la tapa la suya, que va antes.
    expect(tapadas.get('defender-1')?.map((x) => x.clave) ?? []).not.toContain('7,2');
    expect(tapadas.has('attacker-0')).toBe(false);
    expect(tapadasPorLaMuralla(tm, { ...state, muralla: SIN_MURALLA }, figura).size).toBe(0);
  });

  it('con el puntero en la cara de una columna, la translúcida es esa y el clic va a la casilla de detrás', () => {
    const s = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      [{ unidad: unidadDeArena('imperio-rodelero'), ia: false, escalera: false }],
      4,
      { muralla: LINEA },
    );
    s.empezar();
    const yo = s.turnoPropio?.stack;
    if (yo === undefined) throw new Error('esperaba el turno de la derecha');
    yo.hex = h(9, 4);
    stackById(s.battle, 'attacker-0').hex = h(0, 8);
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(1280, 720);
    const va = new Set(s.battleMovable().map(hexKey));
    const alto = { ...t, origenY: t.origenY - alturaDeColumna(t) };
    // Un punto de la cara de (7,3) —ni en su tapa ni en su propio pie— sobre
    // una casilla del suelo a la que se puede ir.
    const silueta = siluetaDeColumna(t, h(7, 3));
    const xs = silueta.map((p) => p.x);
    const ys = silueta.map((p) => p.y);
    let elegido: { x: number; y: number; casilla: Hex } | null = null;
    for (let y = Math.min(...ys); y < Math.max(...ys) && elegido === null; y += 2) {
      for (let x = Math.min(...xs); x < Math.max(...xs) && elegido === null; x += 2) {
        const enTapa = hexEnPixel(alto, x, y);
        if (enTapa !== null && esMuro(LINEA, enTapa)) continue;
        const casilla = hexEnPixel(t, x, y);
        if (casilla === null || esMuro(LINEA, casilla) || !va.has(hexKey(casilla))) continue;
        if (!columnasQueTapan(t, LINEA, casilla, [{ x, y }]).includes('7,3')) {
          continue;
        }
        elegido = { x, y, casilla };
      }
    }
    if (elegido === null)
      throw new Error('ningún punto de la cara de (7,3) sobre una casilla a mano');
    expect([...columnasTranslucidas(t, LINEA, elegido.casilla, null, elegido)]).toContain('7,3');
    escena.mover(elegido.x, elegido.y);
    escena.pulsar(elegido.x, elegido.y);
    expect(yo.hex).toEqual(elegido.casilla);
  });
});
