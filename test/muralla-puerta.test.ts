/**
 * La puerta de la muralla (ampliaciones 3 y 4 de la muralla alta): va entre dos
 * casillas de suelo vecinas en horizontal, empieza cerrada, cerrada no la cruza
 * nadie que ande y abierta cualquiera, la abre o la cierra quien defiende al
 * principio del turno de una unidad suya sin gastarlo, y la IA la usa.
 */

import { describe, expect, it } from 'vitest';
import {
  alzadoDeLaMuralla,
  claveDePortada,
  portadaBajo,
  siluetaDePortada,
} from '../src/client/render/batalla.js';
import { tableroPara } from '../src/client/render/proyeccion.js';
import { autoResolve, chooseBattleAction } from '../src/core/ai/tactics.js';
import { FORMAS_DE_EJEMPLO } from '../src/core/arena-murallas.js';
import {
  applyAction,
  type BattleSide,
  createBattle,
  distanciaACaminar,
  firmaDelTurno,
  legalActions,
  movableFrom,
  puertaBlocker,
  puertasBlocker,
  stackById,
} from '../src/core/battle/battle.js';
import { hexKey } from '../src/core/battle/board.js';
import {
  cierra,
  claveDeAbiertas,
  ladoDeLaMuralla,
  type MurallaDeBatalla,
  type PuertaDeMuralla,
  SIN_MURALLA,
  validarMuralla,
} from '../src/core/battle/muralla.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import type { Hex, Stack } from '../src/core/types.js';
import { describeAccion } from '../src/server/notas.js';
import {
  abrirPuertas,
  aCiegas,
  forzarTurno,
  peleaDeArena,
  peleaDelMotor,
  unidadDeArena,
} from './helpers.js';

const h = (col: number, row: number): Hex => ({ col, row });
const forma = (nombre: string): MurallaDeBatalla => {
  const f = FORMAS_DE_EJEMPLO.find((x) => x.nombre === nombre);
  if (f === undefined) throw new Error(`no hay forma de ejemplo «${nombre}»`);
  return f.muralla;
};
const CON_PUERTA = forma('Línea con puerta');
const PUERTA: PuertaDeMuralla = { a: h(7, 4), b: h(8, 4) };
const lado = (army: readonly Stack[]): BattleSide => ({ army, hero: null });

/** Uno contra uno (o contra dos), con el turno de `turnoDe`. */
function duelo(
  muralla: MurallaDeBatalla,
  atacante: [string, Hex],
  defensores: [string, Hex][],
  turnoDe: string,
): BattleState {
  const state = createBattle(
    lado([{ creature: atacante[0], count: 3 }]),
    lado(defensores.map(([creature]) => ({ creature, count: 3 }))),
    createRng(3),
    COMBATE_COMPLETO,
    muralla,
  );
  stackById(state, 'attacker-0').hex = atacante[1];
  defensores.forEach(([, en], i) => {
    stackById(state, `defender-${i}`).hex = en;
  });
  forzarTurno(state, turnoDe);
  return state;
}
const abrir = (p: PuertaDeMuralla = PUERTA): BattleAction => ({ type: 'abrir_puerta', puerta: p });
const cerrar = (p: PuertaDeMuralla = PUERTA): BattleAction => ({
  type: 'cerrar_puerta',
  puerta: p,
});
const tipos = (acciones: readonly BattleAction[]): string[] => acciones.map((a) => a.type);

describe('la puerta es una juntura y empieza cerrada (C19, C27, C30, C31)', () => {
  it('cada puerta de la muralla, en su orden, cerrada; sin muralla, ninguna', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 4)]],
      'defender-0',
    );
    expect(state.puertas).toEqual([{ ...PUERTA, abierta: false, cambiadaEn: null }]);
    const libre = duelo(
      SIN_MURALLA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 4)]],
      'defender-0',
    );
    expect(libre.puertas).toEqual([]);
  });

  it('las formas de ejemplo con puerta siguen cerrando, con la puerta entre dos casillas', () => {
    for (const nombre of [
      'Línea con puerta',
      'Semicírculo',
      'Muralla gruesa',
      'Semicírculo grueso',
    ]) {
      const m = forma(nombre);
      expect(m.puertas.length, nombre).toBe(1);
      expect(cierra(m), nombre).toBe(true);
      for (const p of m.puertas) {
        expect(p.b, nombre).toEqual({ col: p.a.col + 1, row: p.a.row });
        expect(ladoDeLaMuralla(m, p.a), nombre).not.toBe('muralla');
        expect(ladoDeLaMuralla(m, p.b), nombre).not.toBe('muralla');
      }
    }
  });

  it('una puerta al oeste del hueco deja rendija por las diagonales: la forma no cierra', () => {
    // En odd-r, a (7,4) se llega desde (6,3) y (6,5): la puerta entre (6,4) y
    // (7,4) no corta nada. Es lo que el editor enseña con «no cierra».
    const mal = validarMuralla({
      muros: CON_PUERTA.muros,
      puertas: [{ a: h(6, 4), b: h(7, 4) }],
    });
    expect(cierra(mal)).toBe(false);
    expect(cierra(CON_PUERTA)).toBe(true);
  });

  it('dentro y fuera se cuentan con las puertas cerradas: abrir no cambia la forma de lado (C22)', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 4)]],
      'defender-0',
    );
    const lados = (): string[] =>
      Array.from({ length: 99 }, (_, i) =>
        ladoDeLaMuralla(state.muralla, h(i % 11, Math.floor(i / 11))),
      );
    const antes = lados();
    applyAction(state, abrir(), createRng(1));
    expect(lados()).toEqual(antes);
    expect(ladoDeLaMuralla(CON_PUERTA, h(7, 4))).toBe('fuera');
    expect(ladoDeLaMuralla(CON_PUERTA, h(8, 4))).toBe('dentro');
  });
});

describe('abrir y cerrar, al principio del turno de quien defiende (C21)', () => {
  it('se ofrece al defensor sin moverse, no gasta el turno y queda en la crónica', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 2)]],
      'defender-0',
    );
    expect(legalActions(state)).toContainEqual(abrir());
    expect(tipos(legalActions(state))).not.toContain('cerrar_puerta');
    const turno = state.turno;
    applyAction(state, abrir(), createRng(1));
    expect(state.puertas[0]?.abierta).toBe(true);
    expect(state.puertas[0]?.cambiadaEn).toBe(turno?.n);
    // El mismo turno, de la misma unidad, sin nada gastado.
    expect(state.turno).toEqual(turno);
    expect(state.log.at(-1)).toEqual({ kind: 'gate_opened', stack: 'defender-0', puerta: PUERTA });
    // Y ya abierta, esa puerta no se vuelve a cambiar en este turno.
    expect(puertaBlocker(state, 'cerrar_puerta', PUERTA)).toBe(
      'esa puerta ya se ha abierto o cerrado en este turno',
    );
    expect(tipos(legalActions(state))).not.toContain('cerrar_puerta');
    expect(() => applyAction(state, cerrar(), createRng(1))).toThrow(
      'defender-0 no puede cerrar la puerta: esa puerta ya se ha abierto o cerrado en este turno',
    );
    // En el turno siguiente de quien defiende, sí.
    forzarTurno(state, 'defender-0');
    applyAction(state, cerrar(), createRng(1));
    expect(state.puertas[0]?.abierta).toBe(false);
    expect(state.log.at(-1)).toEqual({ kind: 'gate_closed', stack: 'defender-0', puerta: PUERTA });
  });

  it('un recorrido de antes de abrir no vale después: el camino ha cambiado', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['templario-mandoble', h(9, 4)]],
      'defender-0',
    );
    const turno = state.turno;
    if (turno === null) throw new Error('sin turno');
    const viejo = {
      firma: firmaDelTurno(turno),
      puertas: claveDeAbiertas(state.puertas),
      costs: movableFrom(state, stackById(state, 'defender-0')),
    };
    applyAction(state, abrir(), createRng(1));
    expect(() => applyAction(state, { type: 'move', to: h(8, 4) }, createRng(1), viejo)).toThrow(
      'el recorrido que traes es de antes de abrir o cerrar una puerta',
    );
  });

  it('cualquier unidad defensora, esté donde esté, también en lo alto', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['elfo-arquero', h(7, 1)]],
      'defender-0',
    );
    expect(puertaBlocker(state, 'abrir_puerta', PUERTA)).toBeNull();
  });

  it('el atacante no: ni se le ofrece ni se le deja, y se dice por qué', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(5, 4)],
      [['templario-escudo', h(9, 2)]],
      'attacker-0',
    );
    expect(tipos(legalActions(state))).not.toContain('abrir_puerta');
    expect(puertaBlocker(state, 'abrir_puerta', PUERTA)).toBe(
      'las puertas las abre y las cierra quien defiende',
    );
    expect(puertasBlocker(state, 'abrir_puerta')).toBe(
      'las puertas las abre y las cierra quien defiende',
    );
    expect(() => applyAction(state, abrir(), createRng(1))).toThrow(
      'attacker-0 no puede abrir la puerta: las puertas las abre y las cierra quien defiende',
    );
  });

  it('tras moverse ya no: la puerta es del principio del turno', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 2)]],
      'defender-0',
    );
    applyAction(state, { type: 'move', to: h(9, 3) }, createRng(1));
    expect(state.turno?.stack).toBe('defender-0');
    const motivo =
      'ya se ha movido este turno: la puerta se abre o se cierra al principio del turno';
    expect(puertaBlocker(state, 'abrir_puerta', PUERTA)).toBe(motivo);
    expect(puertasBlocker(state, 'abrir_puerta')).toBe(motivo);
    expect(tipos(legalActions(state))).not.toContain('abrir_puerta');
  });

  it('lo que no tiene sentido se dice: ya abierta, ya cerrada, ninguna puerta ahí', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 2)]],
      'defender-0',
    );
    expect(puertaBlocker(state, 'cerrar_puerta', PUERTA)).toBe('la puerta ya está cerrada');
    expect(puertaBlocker(state, 'abrir_puerta', { a: h(2, 2), b: h(3, 2) })).toBe(
      'entre (2,2)-(3,2) no hay puerta',
    );
    abrirPuertas(state);
    expect(puertaBlocker(state, 'abrir_puerta', PUERTA)).toBe('la puerta ya está abierta');
    const libre = duelo(
      SIN_MURALLA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 2)]],
      'defender-0',
    );
    expect(puertasBlocker(libre, 'abrir_puerta')).toBe('no hay puerta');
  });

  it('se cierra con alguien en una de sus casillas (C28)', () => {
    // Toda unidad ocupa una casilla (13-10-2026): nadie se planta en las dos.
    const state = peleaDelMotor(
      [{ unidad: unidadDeArena('troll-maza', { agilidad: 7 }) }],
      [{ unidad: unidadDeArena('imperio-piquero') }],
      createRng(1),
      CON_PUERTA,
    );
    abrirPuertas(state);
    forzarTurno(state, 'defender-0');
    stackById(state, 'attacker-0').hex = h(7, 3);
    stackById(state, 'defender-0').hex = h(8, 4);
    expect(puertaBlocker(state, 'cerrar_puerta', PUERTA)).toBeNull();
  });

  it('el agente lo leería dicho: la nota de la acción nombra sus dos casillas', () => {
    expect(describeAccion(abrir())).toBe('abre la puerta entre (7,4) y (8,4)');
    expect(describeAccion(cerrar())).toBe('cierra la puerta entre (7,4) y (8,4)');
  });

  it('sin muralla no sale ninguna jugada de puerta: la lista de siempre', () => {
    const libre = duelo(
      SIN_MURALLA,
      ['templario-mandoble', h(0, 0)],
      [['templario-escudo', h(9, 2)]],
      'defender-0',
    );
    expect(tipos(legalActions(libre)).filter((t) => t.includes('puerta'))).toEqual([]);
  });
});

describe('la IA con la puerta (C24)', () => {
  it('quien defiende la abre para salir si ningún atacante llega a ella, y sale', () => {
    // El campesino atacante, lento y lejos: no pisa la puerta en su turno.
    const state = duelo(
      CON_PUERTA,
      ['goblin-lancero', h(0, 8)],
      [['templario-mandoble', h(9, 4)]],
      'defender-0',
    );
    expect(chooseBattleAction(state)).toEqual(abrir());
    applyAction(state, abrir(), createRng(1));
    const sale = chooseBattleAction(state);
    expect(sale.type).toBe('move');
    applyAction(state, sale, createRng(1));
    const paso = state.log.at(-1);
    if (paso?.kind !== 'move') throw new Error('esperaba un paso en la crónica');
    // Hacia el campesino, cruzando la puerta: de (8,4) a (7,4).
    const camino = [h(9, 4), ...paso.path].map(hexKey);
    expect(camino.join(' ')).toContain('8,4 7,4');
  });

  it('no la abre si un atacante llega a ella, ni para salir', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(5, 4)],
      [['templario-mandoble', h(9, 4)]],
      'defender-0',
    );
    expect(tipos(legalActions(state))).toContain('abrir_puerta');
    expect(chooseBattleAction(state).type).not.toBe('abrir_puerta');
  });

  it('el tirador no sale: su sitio es la muralla', () => {
    const state = duelo(
      CON_PUERTA,
      ['goblin-lancero', h(0, 8)],
      [['elfo-arquero', h(9, 4)]],
      'defender-0',
    );
    expect(chooseBattleAction(state).type).not.toBe('abrir_puerta');
  });

  it('la cierra en cuanto un atacante puede llegar a ella, si nadie la ocupa', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(5, 4)],
      [['elfo-arquero', h(9, 1)]],
      'defender-0',
    );
    abrirPuertas(state);
    expect(chooseBattleAction(state)).toEqual(cerrar());
  });

  it('el atacante cruza la puerta abierta: la distancia lee la puerta, sin caché vieja', () => {
    const state = duelo(
      CON_PUERTA,
      ['templario-mandoble', h(5, 4)],
      [['templario-escudo', h(9, 4)]],
      'attacker-0',
    );
    const a = stackById(state, 'attacker-0');
    const d = stackById(state, 'defender-0');
    expect(distanciaACaminar(state, a, d)(a.hex)).toBe(Number.POSITIVE_INFINITY);
    abrirPuertas(state);
    expect(distanciaACaminar(state, a, d)(a.hex)).toBe(4);
    const accion = chooseBattleAction(state);
    // Cuatro casillas: llega pegado al piquero y le golpea, cruzando la puerta.
    expect(accion.type).toBe('attack');
  });

  it('IA contra IA con la muralla gruesa y la línea con puerta: nadie cruza cerrada, las puertas cambian solo al principio del turno de quien defiende, y acaba', () => {
    let cambios = 0;
    let cruces = 0;
    for (const nombre of ['Línea con puerta', 'Muralla gruesa', 'Semicírculo']) {
      const m = forma(nombre);
      for (const semilla of [1, 2, 3, 4]) {
        const state = peleaDeArena(
          [
            { unidad: unidadDeArena('zombi') },
            { unidad: unidadDeArena('imperio-piquero'), escalera: true },
            { unidad: unidadDeArena('goblin-lancero') },
          ],
          [
            { unidad: unidadDeArena('orko-hacha-escudo') },
            { unidad: unidadDeArena('imperio-rodelero') },
            { unidad: unidadDeArena('elfo-arquero') },
          ],
          createRng(semilla),
          m,
        );
        const donde = new Map(state.stacks.map((s) => [s.id, s.hex]));
        // Se juega jugada a jugada para mirar el estado antes de cada una.
        const rng = createRng(semilla);
        for (let n = 0; state.finished === null && n < 5000; n++) {
          const accion = chooseBattleAction(state);
          const s = state.turno === null ? null : stackById(state, state.turno.stack);
          if (accion.type === 'abrir_puerta' || accion.type === 'cerrar_puerta') {
            cambios++;
            expect(s?.side, `${nombre} ${semilla}`).toBe('defender');
            expect(state.turno?.gastado, `${nombre} ${semilla}`).toBe(0);
          }
          const abiertas = state.puertas.filter((p) => p.abierta);
          aCiegas(state, accion, rng);
          if (accion.type === 'move' || accion.type === 'attack') {
            const ultimo = [...state.log].reverse().find((e) => e.kind === 'move');
            if (ultimo?.kind === 'move' && s !== null && ultimo.stack === s.id) {
              let antes = donde.get(s.id) as Hex;
              for (const paso of ultimo.path) {
                const puerta = m.puertas.find(
                  (p) =>
                    (hexKey(p.a) === hexKey(antes) && hexKey(p.b) === hexKey(paso)) ||
                    (hexKey(p.b) === hexKey(antes) && hexKey(p.a) === hexKey(paso)),
                );
                if (puerta !== undefined) {
                  cruces++;
                  expect(
                    abiertas.some((p) => hexKey(p.a) === hexKey(puerta.a)),
                    `${nombre} ${semilla}: ${s.id} cruza cerrada ${hexKey(antes)}→${hexKey(paso)}`,
                  ).toBe(true);
                }
                antes = paso;
              }
            }
          }
          for (const st of state.stacks) donde.set(st.id, st.hex);
        }
        expect(state.finished, `${nombre} ${semilla}`).not.toBeNull();
      }
    }
    expect(cambios).toBeGreaterThan(0);
    expect(cruces).toBeGreaterThan(0);
  });

  it('autoResolve con puertas acaba igual', () => {
    const state = peleaDeArena(
      [{ unidad: unidadDeArena('zombi') }],
      [{ unidad: unidadDeArena('orko-hacha-escudo') }],
      createRng(5),
      CON_PUERTA,
    );
    expect(autoResolve(state, createRng(5)).state.finished).not.toBeNull();
  });
});

describe('la portada en el lienzo (C25, C33)', () => {
  const t = tableroPara(1280, 720, alzadoDeLaMuralla(CON_PUERTA));

  it('se levanta sobre el lado de sus dos casillas y el clic en ella elige esa puerta', () => {
    const silueta = siluetaDePortada(t, PUERTA);
    const xs = silueta.map((p) => p.x);
    const ys = silueta.map((p) => p.y);
    const medio = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
    expect(portadaBajo(t, CON_PUERTA, medio)).toEqual(PUERTA);
    expect(portadaBajo(t, CON_PUERTA, { x: 0, y: 0 })).toBeNull();
    expect(claveDePortada(PUERTA)).toBe('puerta 7,4|8,4');
  });
});
