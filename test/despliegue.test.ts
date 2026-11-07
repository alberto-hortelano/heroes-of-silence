/**
 * La fase de despliegue (02-11-2026, «añade al combate una fase previa de
 * despliegue»; `docs/agents/2026-11-02-fase-de-despliegue/`): dónde sale cada
 * uno (`asentar`, la única regla), el orden de las tandas (el defensor sin ver a
 * nadie, luego el atacante viéndolo), qué casilla vale al colocar y el enganche
 * de la infiltración (`UnitInfo.despliegue`). Sin bandos a mano, la batalla
 * sale como antes del despliegue: lo fija la tabla literal y `pnpm banco`.
 */
import { describe, expect, it } from 'vitest';
import { autoResolve } from '../src/core/ai/tactics.js';
import {
  aplicarDespliegue,
  applyAction,
  type BattleSide,
  createBattle,
  legalActions,
  stackById,
  terminarElDespliegue,
} from '../src/core/battle/battle.js';
import { espejo } from '../src/core/battle/board.js';
import {
  alcanceDelDespliegue,
  asentar,
  batallaALaVista,
  colocarBlocker,
  despliegueDe,
  firmaDelDespliegue,
  zonaDeSalida,
} from '../src/core/battle/despliegue.js';
import { type MurallaDeBatalla, SIN_MURALLA, validarMuralla } from '../src/core/battle/muralla.js';
import type { BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { createRng } from '../src/core/rng.js';
import type { AlcanceDelDespliegue, Hex } from '../src/core/types.js';
import { unidadDelJuego } from '../src/core/unidad/catalogo.js';
import { conCifrasAMano, heroeDeBatalla, ladoDeBatalla } from './batalla-de-prueba.js';
import { TROPA_BARATA } from './comun.js';

/** Un héroe de batalla cualquiera: aquí solo importa dónde pisa. */
const heroe = heroeDeBatalla();

const lado = (n: number, conHeroe: boolean, aMano = false): BattleSide =>
  ladoDeBatalla(
    Array.from({ length: n }, () => ({ creature: TROPA_BARATA })),
    conHeroe ? heroe : null,
    aMano,
  );

/**
 * Una muralla que muerde la salida de los dos lados: muros en las columnas de
 * salida, la del borde casi entera, y una puerta con una casilla en cada zona.
 */
const MURALLA: MurallaDeBatalla = validarMuralla({
  muros: [
    { col: 0, row: 4 },
    { col: 0, row: 3 },
    { col: 0, row: 5 },
    { col: 0, row: 2 },
    { col: 1, row: 4 },
    { col: 11, row: 4 },
    { col: 10, row: 5 },
    { col: 11, row: 2 },
    { col: 11, row: 6 },
    { col: 10, row: 3 },
  ],
  puertas: [
    { a: { col: 1, row: 3 }, b: { col: 2, row: 3 } },
    { a: { col: 9, row: 4 }, b: { col: 10, row: 4 } },
  ],
  material: 'piedra',
});

/**
 * Lo que daba `createBattle` ANTES del despliegue (sacado del código de HEAD,
 * 02-11-2026, con el mismo guion que lo compara con el de ahora): por bando, cada
 * id con su casilla. Clave: muralla (`sin`/`con`) | héroe | tropa | bando.
 */
const ANTES: Readonly<Record<string, string>> = {
  'sin|sin|1|attacker': '0@0,4',
  'sin|sin|1|defender': '0@11,4',
  'sin|sin|2|attacker': '0@0,4 1@0,3',
  'sin|sin|2|defender': '0@11,4 1@10,3',
  'sin|sin|3|attacker': '0@0,4 1@0,3 2@0,5',
  'sin|sin|3|defender': '0@11,4 1@10,3 2@10,5',
  'sin|sin|4|attacker': '0@0,4 1@0,3 2@0,5 3@0,2',
  'sin|sin|4|defender': '0@11,4 1@10,3 2@10,5 3@11,2',
  'sin|sin|5|attacker': '0@0,4 1@0,3 2@0,5 3@0,2 4@0,6',
  'sin|sin|5|defender': '0@11,4 1@10,3 2@10,5 3@11,2 4@11,6',
  'sin|sin|6|attacker': '0@0,4 1@0,3 2@0,5 3@0,2 4@0,6 5@0,1',
  'sin|sin|6|defender': '0@11,4 1@10,3 2@10,5 3@11,2 4@11,6 5@10,1',
  'sin|sin|7|attacker': '0@0,4 1@0,3 2@0,5 3@0,2 4@0,6 5@0,1 6@0,7',
  'sin|sin|7|defender': '0@11,4 1@10,3 2@10,5 3@11,2 4@11,6 5@10,1 6@10,7',
  'sin|heroe|0|attacker': 'heroe@0,4',
  'sin|heroe|0|defender': 'heroe@11,4',
  'sin|heroe|1|attacker': '0@0,3 heroe@0,4',
  'sin|heroe|1|defender': '0@10,3 heroe@11,4',
  'sin|heroe|2|attacker': '0@0,3 1@0,5 heroe@0,4',
  'sin|heroe|2|defender': '0@10,3 1@10,5 heroe@11,4',
  'sin|heroe|3|attacker': '0@0,3 1@0,5 2@0,2 heroe@0,4',
  'sin|heroe|3|defender': '0@10,3 1@10,5 2@11,2 heroe@11,4',
  'sin|heroe|4|attacker': '0@0,3 1@0,5 2@0,2 3@0,6 heroe@0,4',
  'sin|heroe|4|defender': '0@10,3 1@10,5 2@11,2 3@11,6 heroe@11,4',
  'sin|heroe|5|attacker': '0@0,3 1@0,5 2@0,2 3@0,6 4@0,1 heroe@0,4',
  'sin|heroe|5|defender': '0@10,3 1@10,5 2@11,2 3@11,6 4@10,1 heroe@11,4',
  'sin|heroe|6|attacker': '0@0,3 1@0,5 2@0,2 3@0,6 4@0,1 5@0,7 heroe@0,4',
  'sin|heroe|6|defender': '0@10,3 1@10,5 2@11,2 3@11,6 4@10,1 5@10,7 heroe@11,4',
  'con|sin|1|attacker': '0@0,6',
  'con|sin|1|defender': '0@10,1',
  'con|sin|2|attacker': '0@0,6 1@0,1',
  'con|sin|2|defender': '0@10,1 1@10,7',
  'con|sin|3|attacker': '0@0,6 1@0,1 2@0,7',
  'con|sin|3|defender': '0@10,1 1@10,7 2@11,0',
  'con|sin|4|attacker': '0@0,6 1@0,1 2@0,7 3@0,0',
  'con|sin|4|defender': '0@10,1 1@10,7 2@11,0 3@11,8',
  'con|sin|5|attacker': '0@0,6 1@0,1 2@0,7 3@0,0 4@0,8',
  'con|sin|5|defender': '0@10,1 1@10,7 2@11,0 3@11,8 4@10,4',
  'con|sin|6|attacker': '0@0,6 1@0,1 2@0,7 3@0,0 4@0,8 5@1,3',
  'con|sin|6|defender': '0@10,1 1@10,7 2@11,0 3@11,8 4@10,4 5@9,3',
  'con|sin|7|attacker': '0@0,6 1@0,1 2@0,7 3@0,0 4@0,8 5@1,3 6@1,5',
  'con|sin|7|defender': '0@10,1 1@10,7 2@11,0 3@11,8 4@10,4 5@9,3 6@9,5',
  'con|heroe|0|attacker': 'heroe@0,6',
  'con|heroe|0|defender': 'heroe@10,1',
  'con|heroe|1|attacker': '0@0,1 heroe@0,6',
  'con|heroe|1|defender': '0@10,7 heroe@10,1',
  'con|heroe|2|attacker': '0@0,1 1@0,7 heroe@0,6',
  'con|heroe|2|defender': '0@10,7 1@11,0 heroe@10,1',
  'con|heroe|3|attacker': '0@0,1 1@0,7 2@0,0 heroe@0,6',
  'con|heroe|3|defender': '0@10,7 1@11,0 2@11,8 heroe@10,1',
  'con|heroe|4|attacker': '0@0,1 1@0,7 2@0,0 3@0,8 heroe@0,6',
  'con|heroe|4|defender': '0@10,7 1@11,0 2@11,8 3@10,4 heroe@10,1',
  'con|heroe|5|attacker': '0@0,1 1@0,7 2@0,0 3@0,8 4@1,3 heroe@0,6',
  'con|heroe|5|defender': '0@10,7 1@11,0 2@11,8 3@10,4 4@9,3 heroe@10,1',
  'con|heroe|6|attacker': '0@0,1 1@0,7 2@0,0 3@0,8 4@1,3 5@1,5 heroe@0,6',
  'con|heroe|6|defender': '0@10,7 1@11,0 2@11,8 3@10,4 4@9,3 5@9,5 heroe@10,1',
};

const casillas = (b: BattleState, side: string): string =>
  b.stacks
    .filter((s) => s.side === side)
    .map((s) => `${s.id.replace(`${side}-`, '')}@${s.hex.col},${s.hex.row}`)
    .join(' ');

describe('la regla de hoy: sin formación ni bandos a mano, las mismas casillas (C9)', () => {
  it('tropa de 0 a 7, con héroe y sin él, los dos bandos, sin muralla y con ella', () => {
    let vistas = 0;
    for (const [nombre, muralla] of [
      ['sin', SIN_MURALLA],
      ['con', MURALLA],
    ] as const) {
      for (const conHeroe of [false, true]) {
        for (let n = conHeroe ? 0 : 1; n <= (conHeroe ? 6 : 7); n++) {
          const b = createBattle(
            lado(n, conHeroe),
            lado(n, conHeroe),
            createRng(1),
            COMBATE_COMPLETO,
            muralla,
          );
          for (const side of ['attacker', 'defender']) {
            const k = `${nombre}|${conHeroe ? 'heroe' : 'sin'}|${n}|${side}`;
            expect(casillas(b, side), k).toBe(ANTES[k]);
            vistas++;
          }
        }
      }
    }
    expect(vistas).toBe(Object.keys(ANTES).length);
  });

  it('asentar sin pedidas y con el héroe el primero es esa regla', () => {
    const goblin = unidadDelJuego(TROPA_BARATA);
    const hexes = asentar(
      [heroe.cuerpo, goblin, goblin].map((unit) => ({ unit, pedida: null })),
      'defender',
      MURALLA,
    );
    // «con|heroe|2|defender»: 0@10,7 1@11,0 heroe@10,1.
    expect(hexes).toEqual([
      { col: 10, row: 1 },
      { col: 10, row: 7 },
      { col: 11, row: 0 },
    ]);
  });

  it('la casilla pedida se queda si está en su zona y libre; la primera gana', () => {
    const goblin = unidadDelJuego(TROPA_BARATA);
    const hexes = asentar(
      [
        { unit: goblin, pedida: { col: 2, row: 0 } },
        { unit: goblin, pedida: { col: 2, row: 0 } },
        { unit: goblin, pedida: { col: 5, row: 4 } },
        { unit: goblin, pedida: null },
      ],
      'defender',
    );
    // Las pedidas van en el marco del atacante: (2,0) es (9,0) del defensor.
    expect(hexes).toEqual([
      { col: 9, row: 0 },
      { col: 11, row: 4 },
      { col: 10, row: 3 },
      { col: 10, row: 5 },
    ]);
  });
});

describe('toda batalla empieza en el despliegue (C3, C4)', () => {
  it('sin bandos a mano sale ya en la ronda 1, con el turno abierto', () => {
    const b = createBattle(lado(3, true), lado(2, false), createRng(1), COMBATE_COMPLETO);
    expect(b.despliegue).toBeNull();
    expect(b.round).toBe(1);
    expect(b.turno).not.toBeNull();
    expect(despliegueDe(b)).toBeNull();
    expect(firmaDelDespliegue(b)).toBe('');
  });

  it('con el defensor a mano, su tanda abierta: sin turno ni jugadas', () => {
    const b = createBattle(lado(3, true), lado(2, false, true), createRng(1), COMBATE_COMPLETO);
    expect(b.despliegue).toEqual({ tanda: 0, aMano: ['defender'] });
    expect(b.round).toBe(0);
    expect(b.turno).toBeNull();
    expect(b.queue).toEqual([]);
    expect(b.log).toEqual([]);
    expect(legalActions(b)).toEqual([]);
    expect(() => applyAction(b, { type: 'end_turn' }, createRng(1))).toThrow(
      'la batalla está en el despliegue: aún no hay turnos',
    );
    expect(despliegueDe(b)).toEqual({
      tanda: 0,
      side: 'defender',
      momento: 'con_su_bando',
      colocables: ['defender-0', 'defender-1'],
    });
  });

  it('desplegar a mano no tira dados: sale la misma ronda 1 que sin desplegar', () => {
    const solo = createBattle(lado(3, true), lado(3, true), createRng(5), COMBATE_COMPLETO);
    const rng = createRng(5);
    const aMano = createBattle(lado(3, true, true), lado(3, true, true), rng, COMBATE_COMPLETO);
    expect(despliegueDe(aMano)?.side).toBe('defender');
    aplicarDespliegue(aMano, { type: 'desplegado' }, rng);
    expect(despliegueDe(aMano)?.side).toBe('attacker');
    aplicarDespliegue(aMano, { type: 'desplegado' }, rng);
    expect(aMano.despliegue).toBeNull();
    expect(aMano.stacks).toEqual(solo.stacks);
    expect(aMano.queue).toEqual(solo.queue);
    expect(aMano.turno).toEqual(solo.turno);
    expect(aMano.log).toEqual(solo.log);
    expect(() => aplicarDespliegue(aMano, { type: 'desplegado' }, rng)).toThrow(
      'no hay despliegue en curso',
    );
    expect(colocarBlocker(aMano, 'attacker-0', { col: 1, row: 4 })).toBe(
      'no hay despliegue en curso',
    );
  });
});

describe('colocar (C1, C5, C7)', () => {
  /** El defensor a mano, con su héroe, tres goblins y la muralla que muerde. */
  function enLaTanda0(): BattleState {
    return createBattle(
      lado(3, true),
      lado(3, true, true),
      createRng(1),
      COMBATE_COMPLETO,
      MURALLA,
    );
  }
  const goblin = unidadDelJuego(TROPA_BARATA).name;

  it('cada rechazo con su frase', () => {
    const b = enLaTanda0();
    // «con|heroe|3|defender»: 0@10,7 1@11,0 2@11,8 heroe@10,1.
    expect(stackById(b, 'defender-0').hex).toEqual({ col: 10, row: 7 });
    const casos: readonly [string, Hex, string][] = [
      ['attacker-0', { col: 0, row: 1 }, `${goblin} no es del bando que despliega`],
      ['nadie', { col: 9, row: 4 }, 'no hay ningún «nadie» en la batalla'],
      ['defender-0', { col: 12, row: 4 }, '(12,4) no es una casilla del tablero'],
      ['defender-0', { col: 10, row: 7 }, `${goblin} ya sale en (10,7)`],
      ['defender-0', { col: 11, row: 4 }, 'en (11,4) hay muro'],
      [
        'defender-0',
        { col: 8, row: 4 },
        `(8,4) queda fuera de la zona de salida de ${goblin}: las 3 columnas de su borde`,
      ],
      [
        'defender-heroe',
        { col: 7, row: 3 },
        '(7,3) queda fuera de la zona de salida de Prueba: las 3 columnas de su borde',
      ],
    ];
    for (const [id, at, motivo] of casos) {
      expect(colocarBlocker(b, id, at), `${id} a (${at.col},${at.row})`).toBe(motivo);
      expect(() => aplicarDespliegue(b, { type: 'colocar', stack: id, at }, createRng(1))).toThrow(
        `no se puede colocar: ${motivo}`,
      );
    }
    // Y nadie se ha movido.
    expect(casillas(b, 'defender')).toBe(ANTES['con|heroe|3|defender']);
  });

  it('a una casilla libre de su zona, también la de una puerta: la puerta es el lado entre dos', () => {
    const b = enLaTanda0();
    aplicarDespliegue(
      b,
      { type: 'colocar', stack: 'defender-0', at: { col: 10, row: 4 } },
      createRng(1),
    );
    expect(stackById(b, 'defender-0').hex).toEqual({ col: 10, row: 4 });
    // Colocar no deja hecho en el registro, pero sí cambia la firma.
    expect(b.log).toEqual([]);
    expect(firmaDelDespliegue(b)).toContain('defender-0@10,4');
  });

  it('la casilla de otro de su tanda se intercambia, el héroe incluido', () => {
    const b = enLaTanda0();
    aplicarDespliegue(
      b,
      { type: 'colocar', stack: 'defender-heroe', at: { col: 10, row: 7 } },
      createRng(1),
    );
    expect(stackById(b, 'defender-heroe').hex).toEqual({ col: 10, row: 7 });
    expect(stackById(b, 'defender-0').hex).toEqual({ col: 10, row: 1 });
  });

  it('el de otra tanda de su bando ni se coloca ni se pisa', () => {
    const b = enLaTanda0();
    const tarde: AlcanceDelDespliegue = { columnas: 3, momento: 'tras_el_enemigo' };
    const d2 = stackById(b, 'defender-2');
    conCifrasAMano(b, 'defender-2', { ...d2.unit, despliegue: tarde });
    expect(despliegueDe(b)!.colocables).toEqual(['defender-0', 'defender-1', 'defender-heroe']);
    expect(colocarBlocker(b, 'defender-2', { col: 9, row: 4 })).toBe(
      `${goblin} despliega más tarde, cuando el enemigo ya esté en el campo`,
    );
    expect(colocarBlocker(b, 'defender-0', { col: 11, row: 8 })).toBe(
      `en (11,8) está ${goblin}, que despliega más tarde`,
    );
    // Cerrar la tanda: el atacante despliega solo y se abre la del que va tarde.
    aplicarDespliegue(b, { type: 'desplegado' }, createRng(1));
    expect(despliegueDe(b)).toMatchObject({ tanda: 2, colocables: ['defender-2'] });
    expect(colocarBlocker(b, 'defender-0', { col: 9, row: 4 })).toBe(`${goblin} ya desplegó`);
    expect(colocarBlocker(b, 'defender-2', { col: 10, row: 7 })).toBe(
      `en (10,7) está ${goblin}, que ya desplegó`,
    );
    aplicarDespliegue(b, { type: 'desplegado' }, createRng(1));
    expect(b.despliegue).toBeNull();
    expect(b.round).toBe(1);
  });
});

describe('lo que se ve al desplegar (C3)', () => {
  it('el defensor no ve a nadie del atacante; el atacante ve al defensor; null lo ve todo', () => {
    const rng = createRng(1);
    const b = createBattle(lado(3, true, true), lado(3, false, true), rng, COMBATE_COMPLETO);
    const ids = (v: BattleState): string[] => v.stacks.map((s) => s.id);
    expect(ids(batallaALaVista(b, 'defender'))).toEqual(['defender-0', 'defender-1', 'defender-2']);
    expect(batallaALaVista(b, null)).toBe(b);
    // El atacante, mientras el defensor despliega, solo lo suyo.
    expect(ids(batallaALaVista(b, 'attacker'))).toEqual([
      'attacker-0',
      'attacker-1',
      'attacker-2',
      'attacker-heroe',
    ]);
    aplicarDespliegue(b, { type: 'desplegado' }, rng);
    expect(batallaALaVista(b, 'attacker')).toBe(b);
    // Y el defensor, mientras despliega el atacante, sigue sin verlo.
    expect(ids(batallaALaVista(b, 'defender'))).toEqual(['defender-0', 'defender-1', 'defender-2']);
    aplicarDespliegue(b, { type: 'desplegado' }, rng);
    expect(batallaALaVista(b, 'defender')).toBe(b);
  });
});

describe('preparado para la infiltración: zona y momento por unidad (C6)', () => {
  it('una zona de 5 columnas deja colocar donde la de 3 no, y la de «más tarde» despliega tras el enemigo', () => {
    const rng = createRng(1);
    const b = createBattle(lado(3, false, true), lado(3, false, true), rng, COMBATE_COMPLETO);
    const d0 = stackById(b, 'defender-0');
    conCifrasAMano(b, 'defender-0', {
      ...d0.unit,
      despliegue: { columnas: 5, momento: 'con_su_bando' },
    });
    const d2 = stackById(b, 'defender-2');
    conCifrasAMano(b, 'defender-2', {
      ...d2.unit,
      despliegue: { columnas: 3, momento: 'tras_el_enemigo' },
    });
    const goblin = d0.unit.name;
    // (4,4) en el marco del atacante, la quinta columna del defensor.
    const quinta = espejo({ col: 4, row: 4 });
    expect(quinta).toEqual({ col: 7, row: 4 });
    expect(zonaDeSalida(d0.unit, 'defender').some((h) => h.col === 7 && h.row === 4)).toBe(true);
    expect(colocarBlocker(b, 'defender-0', quinta)).toBeNull();
    expect(colocarBlocker(b, 'defender-1', quinta)).toBe(
      `(7,4) queda fuera de la zona de salida de ${goblin}: las 3 columnas de su borde`,
    );
    aplicarDespliegue(b, { type: 'colocar', stack: 'defender-0', at: quinta }, rng);
    // El de «más tarde» no se coloca en la tanda 0, ni lo ve el atacante en la 1.
    expect(despliegueDe(b)!.colocables).toEqual(['defender-0', 'defender-1']);
    aplicarDespliegue(b, { type: 'desplegado' }, rng);
    expect(despliegueDe(b)!.side).toBe('attacker');
    expect(batallaALaVista(b, 'attacker').stacks.map((s) => s.id)).not.toContain('defender-2');
    expect(stackById(batallaALaVista(b, 'attacker'), 'defender-0').hex).toEqual(quinta);
    // En la 2 se coloca, y su bando ve ya al atacante.
    aplicarDespliegue(b, { type: 'desplegado' }, rng);
    expect(despliegueDe(b)).toMatchObject({
      side: 'defender',
      momento: 'tras_el_enemigo',
      colocables: ['defender-2'],
    });
    expect(batallaALaVista(b, 'defender')).toBe(b);
    expect(colocarBlocker(b, 'defender-2', { col: 9, row: 4 })).toBeNull();
    aplicarDespliegue(b, { type: 'desplegado' }, rng);
    expect(b.despliegue).toBeNull();
    expect(b.round).toBe(1);
  });

  it('la casilla de un enemigo que aún no ha desplegado cuenta como libre; al abrir su tanda, él se aparta', () => {
    const rng = createRng(1);
    const b = createBattle(lado(3, false, true), lado(1, false, true), rng, COMBATE_COMPLETO);
    const a0 = stackById(b, 'attacker-0');
    const d0 = stackById(b, 'defender-0');
    // Dos zonas de 6 columnas se tocan en la columna 5 de las filas impares (de 11).
    const seis: AlcanceDelDespliegue = { columnas: 6, momento: 'con_su_bando' };
    conCifrasAMano(b, 'attacker-0', { ...a0.unit, despliegue: seis });
    conCifrasAMano(b, 'defender-0', { ...d0.unit, despliegue: seis });
    a0.hex = { col: 5, row: 3 };
    // El defensor no lo ve: ni rechazo ni «ahí hay alguien».
    expect(colocarBlocker(b, 'defender-0', { col: 5, row: 3 })).toBeNull();
    aplicarDespliegue(b, { type: 'colocar', stack: 'defender-0', at: { col: 5, row: 3 } }, rng);
    aplicarDespliegue(b, { type: 'desplegado' }, rng);
    // El atacante, al abrir su tanda, al primer hueco libre de su zona: (0,4).
    expect(d0.hex).toEqual({ col: 5, row: 3 });
    expect(a0.hex).toEqual({ col: 0, row: 4 });
    // Ahora ya lo ve: ese sitio está ocupado.
    expect(colocarBlocker(b, 'attacker-0', { col: 5, row: 3 })).toBe(
      `en (5,3) está ${d0.unit.name}`,
    );
  });

  it('las columnas van de 1 a 6', () => {
    const goblin = unidadDelJuego(TROPA_BARATA);
    expect(alcanceDelDespliegue(goblin)).toEqual({ columnas: 3, momento: 'con_su_bando' });
    for (const columnas of [0, 7, 2.5]) {
      expect(() =>
        alcanceDelDespliegue({ ...goblin, despliegue: { columnas, momento: 'con_su_bando' } }),
      ).toThrow(
        `${goblin.name} despliega en ${columnas} columnas: se despliega en una a 6 columnas desde su borde`,
      );
    }
    expect(
      zonaDeSalida({ ...goblin, despliegue: { columnas: 1, momento: 'con_su_bando' } }, 'attacker'),
    ).toHaveLength(9);
  });
});

describe('quien la juega sin mirar acepta lo desplegado', () => {
  it('autoResolve sobre una batalla en el despliegue la juega entera desde las casillas de partida', () => {
    const rng = createRng(3);
    // Sin héroe: el de prueba va sin arma, y sin arma no se pelea.
    const b = createBattle(lado(3, false, true), lado(3, false, true), rng, COMBATE_COMPLETO);
    aplicarDespliegue(b, { type: 'colocar', stack: 'defender-0', at: { col: 9, row: 4 } }, rng);
    const antes = b.stacks.map((s) => s.hex);
    const copia = structuredClone(b);
    terminarElDespliegue(copia, createRng(3));
    expect(copia.despliegue).toBeNull();
    expect(copia.round).toBe(1);
    expect(copia.stacks.map((s) => s.hex)).toEqual(antes);
    const fin = autoResolve(b, rng);
    expect(b.despliegue).toBeNull();
    expect(b.finished).not.toBeNull();
    expect(fin.rounds).toBeGreaterThan(0);
  });
});
