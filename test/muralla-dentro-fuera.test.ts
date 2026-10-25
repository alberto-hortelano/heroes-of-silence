/**
 * La ampliación de la muralla alta (`docs/agents/2026-10-09-muralla-alta/`,
 * criterios 10-14): dentro y fuera se derivan de la forma, de lo alto solo se
 * baja hacia dentro y el defensor sube solo desde dentro; las columnas son
 * cuatro veces más altas, el lienzo se alarga para ellas, lo de delante tapa lo
 * de detrás y la puerta es una portada bajo la que se pasa.
 */

import { describe, expect, it } from 'vitest';
import { renderMuralla } from '../src/client/arena/paneles.js';
import { EscenaBatalla } from '../src/client/escenas/batalla.js';
import { marcadoDe } from '../src/client/html.js';
import {
  ALTO_DE_MURALLA,
  alzadoDeLaMuralla,
  cajaDeFigura,
  type PiezaDelTablero,
  piezasEnOrden,
} from '../src/client/render/batalla.js';
import { altoConAlzado, planoDeHex, tableroPara } from '../src/client/render/proyeccion.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { FORMAS_DE_EJEMPLO, ladosDeLaForma } from '../src/core/arena-murallas.js';
import {
  applyAction,
  type BattleSide,
  createBattle,
  distanciaAndando,
  movableFrom,
  movableHexes,
  movimientoBlocker,
  stackById,
} from '../src/core/battle/battle.js';
import { caminoDe, hexKey, neighbours } from '../src/core/battle/board.js';
import {
  cierra,
  esMuro,
  ladoDeLaMuralla,
  type MurallaDeBatalla,
  SIN_MURALLA,
  validarMuralla,
} from '../src/core/battle/muralla.js';
import type { BattleStack, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack, UnitInfo } from '../src/core/types.js';
import {
  abrirPuertas,
  aMano,
  bandoDePersonajes,
  forzarTurno,
  NO_MUERTO,
  PESADA,
  sesionDeArena,
  TIRADOR,
  TROPA,
  unidadDeArena,
} from './helpers.js';

const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};
const LINEA = forma('Línea recta');
const CON_PUERTA = forma('Línea con puerta');
const SEMICIRCULO = forma('Semicírculo');
const EN_L = forma('En L');

const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });

/** Un volador (el vampiro): `flying`, que nadie del catálogo lleva. */
const VAMPIRO = aMano(NO_MUERTO, { name: 'Vampiro', traits: ['undead', 'flying'] });

/** Un bando de uno: tres de una unidad del catálogo, o uno hecho a mano. */
const deUno = (quien: string | UnitInfo): BattleSide =>
  typeof quien === 'string' ? lado([{ creature: quien, count: 3 }]) : bandoDePersonajes([quien]);

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
  for (const s of state.stacks) s.morale = 0;
  forzarTurno(state, turnoDe);
  return state;
}

const claves = (hexes: readonly Hex[]): Set<string> => new Set(hexes.map(hexKey));
const h = (col: number, row: number): Hex => ({ col, row });

describe('dentro y fuera, derivados de la forma (C10)', () => {
  it('la línea recta y la de la puerta cierran: dentro la derecha, fuera la izquierda', () => {
    for (const m of [LINEA, CON_PUERTA]) {
      expect(cierra(m)).toBe(true);
      expect(ladoDeLaMuralla(m, h(9, 4))).toBe('dentro');
      expect(ladoDeLaMuralla(m, h(8, 0))).toBe('dentro');
      expect(ladoDeLaMuralla(m, h(2, 4))).toBe('fuera');
      expect(ladoDeLaMuralla(m, h(6, 8))).toBe('fuera');
      expect(ladoDeLaMuralla(m, h(7, 3))).toBe('muralla');
    }
    // Las dos casillas de la puerta son suelo, cada una de su lado: el hueco
    // (7,4) da a la izquierda y (8,4), a la derecha (ampliación 4, C30).
    expect(ladoDeLaMuralla(CON_PUERTA, h(7, 4))).toBe('fuera');
    expect(ladoDeLaMuralla(CON_PUERTA, h(8, 4))).toBe('dentro');
  });

  it('el semicírculo cierra su arco: dentro lo de dentro del arco, fuera el resto', () => {
    expect(cierra(SEMICIRCULO)).toBe(true);
    for (const k of [h(7, 3), h(7, 4), h(7, 5), h(8, 1), h(8, 7)]) {
      expect(ladoDeLaMuralla(SEMICIRCULO, k), hexKey(k)).toBe('dentro');
    }
    for (const k of [h(7, 0), h(5, 4), h(6, 2), h(6, 6), h(7, 8)]) {
      expect(ladoDeLaMuralla(SEMICIRCULO, k), hexKey(k)).toBe('fuera');
    }
  });

  it('una forma que no separa las dos salidas no cierra, y tiene delante y detrás (C15)', () => {
    expect(cierra(EN_L)).toBe(false);
    // Delante del palo de la L, fuera; bajo su pie, más cerca del defensor, dentro.
    expect(ladoDeLaMuralla(EN_L, h(2, 4))).toBe('fuera');
    expect(ladoDeLaMuralla(EN_L, h(6, 3))).toBe('fuera');
    expect(ladoDeLaMuralla(EN_L, h(6, 7))).toBe('dentro');
    expect(ladoDeLaMuralla(EN_L, h(8, 3))).toBe('dentro');
    // Un anillo en medio tampoco cierra: se rodea. Su hueco, adonde no se llega
    // desde ninguna salida, es dentro.
    const anillo = validarMuralla({ muros: neighbours(h(5, 4)), puertas: [] });
    expect(cierra(anillo)).toBe(false);
    expect(ladoDeLaMuralla(anillo, h(5, 4))).toBe('dentro');
    expect(ladoDeLaMuralla(anillo, h(3, 4))).toBe('fuera');
    expect(cierra(SIN_MURALLA)).toBe(false);
  });

  it('la ayuda del editor dice si la forma cierra y raya lo de fuera', () => {
    expect(ladosDeLaForma(LINEA)).toContain('cierra');
    expect(ladosDeLaForma(LINEA)).not.toContain('no cierra');
    expect(ladosDeLaForma(EN_L)).toContain('no cierra');
    // Ya no dice que todo sea dentro: lo rayado es fuera también en la L (C15).
    expect(ladosDeLaForma(EN_L)).not.toContain('todo es dentro');
    expect(ladosDeLaForma(EN_L)).toContain('Lo rayado es fuera');
    const editor = (m: MurallaDeBatalla): string =>
      marcadoDe(
        renderMuralla({
          muralla: m,
          herramienta: 'muro',
          nombre: '',
          ejemplos: FORMAS_DE_EJEMPLO,
          guardadas: [],
          sinGuardado: null,
          despliegue: null,
          plegado: false,
        }),
      );
    const linea = editor(LINEA);
    expect(linea).toContain(ladosDeLaForma(LINEA));
    // Las siete columnas de la izquierda, fuera: 63 casillas rayadas.
    expect(linea.match(/class="hex fuera/g)?.length).toBe(63);
    expect(linea).toContain('title="(2,4) vacío, fuera"');
    // En la L, delante del palo (7 × 5), a la izquierda del pie (3) y bajo él
    // (6, 5 y 6: con filas de 12 y 11 el eje está en 5,5, y la columna 5 de
    // una fila par queda más cerca de la izquierda).
    expect(editor(EN_L).match(/class="hex fuera/g)?.length).toBe(55);
  });
});

describe('de lo alto solo se baja hacia dentro (C11)', () => {
  it('el atacante que subió no vuelve fuera, y moverlo ahí lanza diciéndolo', () => {
    const state = duelo(LINEA, PESADA, h(7, 4), TROPA, h(10, 0));
    const a = stackById(state, 'attacker-0');
    const movibles = claves(movableHexes(state, a));
    expect(movibles.has('8,4')).toBe(true);
    for (const k of ['6,4', '6,3', '5,4']) expect(movibles.has(k), k).toBe(false);
    expect(() => applyAction(state, { type: 'move', to: h(6, 4) }, createRng(1))).toThrow(
      'desde la muralla solo se baja hacia dentro',
    );
  });

  it('en el semicírculo, el de lo alto baja al arco y no afuera', () => {
    const state = duelo(SEMICIRCULO, PESADA, h(7, 2), TROPA, h(10, 8));
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    expect(movibles.has('8,2')).toBe(true);
    expect(movibles.has('6,2')).toBe(false);
    expect(movimientoBlocker(state, h(6, 2))).toBe('desde la muralla solo se baja hacia dentro');
  });

  it('el defensor sube solo desde dentro: fuera de la línea no tiene escaleras', () => {
    const state = duelo(LINEA, TROPA, h(0, 0), PESADA, h(6, 4), 'defender-0');
    expect(movableFrom(state, stackById(state, 'defender-0')).has('7,4')).toBe(false);
    expect(movimientoBlocker(state, h(7, 4))).toBe(
      'desde fuera no se sube a la muralla: sus escaleras están dentro',
    );
  });

  it('el defensor que salió por la puerta vuelve a lo alto por dentro, no por el arco', () => {
    const state = duelo(CON_PUERTA, TROPA, h(0, 0), PESADA, h(6, 4), 'defender-0');
    abrirPuertas(state);
    const d = stackById(state, 'defender-0');
    // (6,4) → puerta (7,4) → (7,3) eran dos pasos; ahora entra y sube de dentro.
    const paso = movableFrom(state, d).get('7,3');
    if (paso === undefined) throw new Error('el espadachín debería llegar a (7,3) por dentro');
    const camino = caminoDe(paso);
    const antes = camino.at(-2) as Hex;
    expect(ladoDeLaMuralla(CON_PUERTA, antes)).toBe('dentro');
    expect(camino.length).toBeGreaterThan(2);
  });

  it('de lo alto no se baja a la puerta: a ella se llega por el suelo', () => {
    const state = duelo(CON_PUERTA, TROPA, h(0, 0), PESADA, h(7, 3), 'defender-0');
    abrirPuertas(state);
    const paso = movableFrom(state, stackById(state, 'defender-0')).get('7,4');
    if (paso === undefined) throw new Error('el espadachín debería llegar a su puerta');
    // Llega por dentro: el paso de antes de la puerta es suelo de dentro.
    const antes = caminoDe(paso).at(-2) as Hex;
    expect(ladoDeLaMuralla(CON_PUERTA, antes)).toBe('dentro');
  });

  it('el volador, sin cambio: se posa arriba y baja donde quiera', () => {
    const state = duelo(LINEA, VAMPIRO, h(7, 4), TROPA, h(10, 0));
    expect(claves(movableHexes(state, stackById(state, 'attacker-0'))).has('5,4')).toBe(true);
  });

  it('en una forma que no cierra también se baja solo hacia dentro (C15)', () => {
    const state = duelo(EN_L, PESADA, h(7, 3), TROPA, h(10, 8));
    const movibles = claves(movableHexes(state, stackById(state, 'attacker-0')));
    expect(movibles.has('8,3')).toBe(true);
    expect(movibles.has('6,3')).toBe(false);
    expect(movimientoBlocker(state, h(6, 3))).toBe('desde la muralla solo se baja hacia dentro');
  });

  it('la IA: nadie de lo alto baja fuera ni el defensor sube desde fuera, y acaba', () => {
    // Los que escalan y los de escalera suben; los defensores pelean arriba y
    // dentro. Se mira cada paso de cada `move` del registro. Con la puerta, los
    // defensores salen a por ellos y nadie tiene por qué subir: las subidas se
    // cuentan entre las tres formas.
    let subidas = 0;
    for (const nombre of ['Línea recta', 'Línea con puerta', 'Semicírculo']) {
      const m = forma(nombre);
      const trepa = unidadDeArena('zombi', { id: 'zombi-9', traits: ['escalar'] });
      const s = sesionDeArena(
        [
          { unidad: trepa, ia: true, escalera: false },
          { unidad: unidadDeArena('zombi'), ia: true, escalera: true },
        ],
        [
          { unidad: unidadDeArena('zombi'), ia: true, escalera: false },
          { unidad: unidadDeArena('zombi'), ia: true, escalera: false },
        ],
        11,
        { muralla: m },
      );
      // Dónde está cada uno: el `move` del registro trae el camino sin el origen.
      const donde = new Map(s.battle.stacks.map((st) => [st.id, st.hex]));
      s.empezar();
      const state = s.battle;
      expect(state.finished, nombre).not.toBeNull();
      for (const e of state.log) {
        if (e.kind === 'climbed') {
          subidas++;
          donde.set(e.stack, e.to);
        }
        if (e.kind !== 'move') continue;
        const st = stackById(state, e.stack);
        let antes = donde.get(e.stack) as Hex;
        donde.set(e.stack, e.to);
        for (const paso of e.path) {
          if (esMuro(m, antes) && !esMuro(m, paso)) {
            expect(ladoDeLaMuralla(m, paso), `${nombre} ${e.stack} baja a ${hexKey(paso)}`).toBe(
              'dentro',
            );
          }
          if (st.side === 'defender' && !esMuro(m, antes) && esMuro(m, paso)) {
            expect(ladoDeLaMuralla(m, antes), `${nombre} ${e.stack} sube desde fuera`).toBe(
              'dentro',
            );
          }
          antes = paso;
        }
      }
    }
    expect(subidas).toBeGreaterThan(0);
  });

  it('el tirador defensor lejos de la muralla va hacia ella en vez de defenderse', () => {
    const state = duelo(LINEA, PESADA, h(1, 4), TIRADOR, h(10, 4), 'defender-0');
    const d = stackById(state, 'defender-0');
    const accion = chooseBattleAction(state);
    if (accion.type !== 'move') throw new Error(`esperaba un move y es ${accion.type}`);
    const alMuro = distanciaAndando(state, d, LINEA.muros);
    expect(alMuro(accion.to)).toBeLessThan(alMuro(d.hex));
  });
});

describe('columnas altas y lienzo que crece (C12)', () => {
  it('la columna mide cuatro veces lo de antes', () => {
    expect(ALTO_DE_MURALLA).toBeCloseTo(4 * 0.42, 10);
  });

  it('sin muralla el tablero es el de siempre; con ella, el lienzo crece y el tablero baja', () => {
    expect(alzadoDeLaMuralla(SIN_MURALLA)).toBe(0);
    for (const [ancho, alto] of [
      [1280, 720],
      [1600, 520],
      [860, 380],
      [1086, 778],
    ] as const) {
      expect(tableroPara(ancho, alto, 0)).toEqual(tableroPara(ancho, alto));
      expect(altoConAlzado(ancho, alto, 0)).toBe(alto);
      const alzado = alzadoDeLaMuralla(LINEA);
      const hoy = tableroPara(ancho, alto);
      const alto2 = altoConAlzado(ancho, alto, alzado);
      expect(alto2).toBeGreaterThan(alto);
      const t = tableroPara(ancho, alto2, alzado);
      // El mismo paso y la misma cámara: el tablero no encoge, baja.
      expect(t.paso).toBeCloseTo(hoy.paso, 9);
      expect(t.compresion).toBeCloseTo(hoy.compresion, 9);
      expect(t.origenY - hoy.origenY).toBeCloseTo(alzado * hoy.paso, 6);
    }
  });

  it('quien está en lo alto de la columna más atrasada no se sale del lienzo', () => {
    // La figura de pie en lo alto de cada columna de la fila de atrás y de la siguiente.
    const m = validarMuralla({ muros: [h(7, 0), h(8, 1)], puertas: [] });
    for (const [ancho, alto] of [
      [1280, 600],
      [1600, 520],
      [860, 380],
    ] as const) {
      const t = tableroPara(
        ancho,
        altoConAlzado(ancho, alto, alzadoDeLaMuralla(m)),
        alzadoDeLaMuralla(m),
      );
      for (const muro of m.muros) {
        const caja = cajaDeFigura(t, planoDeHex(muro), 1);
        expect(caja.suelo - caja.alto, `${ancho}×${alto} ${hexKey(muro)}`).toBeGreaterThan(0);
      }
      // Sin el alzado, la cabeza de (7,0) se salía por arriba: es lo que pide.
      const sin = tableroPara(ancho, alto);
      const caja = cajaDeFigura(sin, planoDeHex(h(7, 0)), 1);
      expect(caja.suelo - caja.alto).toBeLessThan(0);
    }
  });

  it('la escena pide el alto con la muralla de su batalla, y sin ella el del marco', () => {
    const con = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      4,
      { muralla: LINEA },
    );
    const sin = sesionDeArena(
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      [{ unidad: unidadDeArena('zombi'), ia: true, escalera: false }],
      4,
    );
    expect(new EscenaBatalla(() => sin).altoDelLienzo(1000, 600)).toBe(600);
    expect(new EscenaBatalla(() => con).altoDelLienzo(1000, 600)).toBeCloseTo(
      altoConAlzado(1000, 600, alzadoDeLaMuralla(LINEA)),
      9,
    );
  });
});

describe('lo de delante tapa lo de detrás; la portada, a quien pasa (C13)', () => {
  /** El orden de pintado de `state` con cada figura quieta en su casilla. */
  const orden = (state: BattleState): PiezaDelTablero[] =>
    piezasEnOrden(state, (s: BattleStack) => ({
      en: planoDeHex(s.hex),
      caida: null,
      elevacion: esMuro(state.muralla, s.hex) ? 1 : 0,
      visible: true,
    }));
  const indice = (piezas: readonly PiezaDelTablero[], que: string): number =>
    piezas.findIndex((p) =>
      p.kind === 'figura' || p.kind === 'caido'
        ? `${p.kind}:${p.id}` === que
        : p.kind === 'escalera'
          ? false
          : p.kind === 'portada'
            ? `portada:${hexKey(p.puerta.a)}` === que
            : `${p.kind}:${hexKey(p.hex)}` === que,
    );

  it('la figura detrás de una columna se pinta antes que ella, y la de delante después', () => {
    const m = validarMuralla({ muros: [h(5, 5)], puertas: [] });
    const state = duelo(m, PESADA, h(5, 3), TROPA, h(5, 6));
    const p = orden(state);
    expect(indice(p, 'figura:attacker-0')).toBeLessThan(indice(p, 'columna:5,5'));
    expect(indice(p, 'figura:defender-0')).toBeGreaterThan(indice(p, 'columna:5,5'));
  });

  it('quien está en lo alto, después de su columna y antes de la de delante', () => {
    const state = duelo(LINEA, PESADA, h(1, 4), TIRADOR, h(7, 3));
    const p = orden(state);
    expect(indice(p, 'figura:defender-0')).toBeGreaterThan(indice(p, 'columna:7,3'));
    expect(indice(p, 'figura:defender-0')).toBeLessThan(indice(p, 'columna:7,4'));
  });

  it('quien está en una casilla de la puerta pasa bajo la portada: el dintel va encima de él', () => {
    const state = duelo(CON_PUERTA, PESADA, h(7, 4), TROPA, h(8, 4));
    const p = orden(state);
    expect(indice(p, 'portada:7,4')).toBeGreaterThan(-1);
    expect(indice(p, 'figura:defender-0')).toBeLessThan(indice(p, 'portada:7,4'));
    expect(indice(p, 'figura:attacker-0')).toBeLessThan(indice(p, 'portada:7,4'));
    // La de la fila de delante, después de la portada.
    stackById(state, 'defender-0').hex = h(8, 5);
    const q = orden(state);
    expect(indice(q, 'figura:defender-0')).toBeGreaterThan(indice(q, 'portada:7,4'));
  });

  it('sin muralla, ni columnas ni portadas: solo las figuras, de atrás adelante', () => {
    const state = duelo(SIN_MURALLA, PESADA, h(1, 6), TROPA, h(9, 2));
    expect(orden(state)).toEqual([
      { kind: 'figura', id: 'defender-0' },
      { kind: 'figura', id: 'attacker-0' },
    ]);
  });
});
