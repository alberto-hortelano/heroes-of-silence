/**
 * La previsión de daño (`previsionDe`) contra el daño de verdad.
 *
 * Por cada escenario —golpe, carga, defensa, contraataque,
 * doble golpe y asustar al golpear (hechos a mano: el catálogo no trae esos
 * rasgos), héroes con ataque y defensa, hechizos— se pide la previsión, se juega
 * la acción y se mira el registro. Un golpe cuerpo a cuerpo, **en todo cruce de
 * las tres ruedas** (#253, 11-11-2026: todo golpe contra toda respuesta, también
 * Fuerte y Rápido, que antes se excluían): cada golpe y cada contraataque caen en
 * su horquilla, cuántos en su tope, las bajas y lo que queda en las suyas; y las
 * puntas de la horquilla pasan de verdad (no es más ancha de lo que pasa). Un
 * hechizo, con su semilla.
 *
 * Con la muralla de la arena (`battle/muralla.ts`) también: el tirador en lo
 * alto se defiende mejor, y la previsión lo cuenta con las mismas opciones que
 * el golpe (`opcionesDeDanio`).
 */

import { describe, expect, it } from 'vitest';
import { FORMAS_DE_EJEMPLO } from '../src/core/arena/murallas.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { applyAction } from '../src/core/battle/battle.js';
import { hexEquals } from '../src/core/battle/board.js';
import { golpesDelTipo } from '../src/core/battle/cifras-de-la-rueda.js';
import { stackById } from '../src/core/battle/consultas.js';
import { type Horquilla, stackHp } from '../src/core/battle/damage.js';
import { LAS_TRES_RUEDAS, type TiposDeLaRueda } from '../src/core/battle/formas-de-la-rueda.js';
import { legalActions } from '../src/core/battle/legalidad.js';
import { type BattleSide, createBattle } from '../src/core/battle/montaje.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { type PrevisionDeGolpe, previsionDe } from '../src/core/battle/prevision.js';
import type {
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleState,
  MurallaDeBatalla,
} from '../src/core/battle/types.js';
import { COMBATE_COMPLETO, combateCon } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { CreatureTrait, Equipo, Hex, UnitInfo } from '../src/core/types.js';
import { unidadDelJuego } from '../src/core/unidad/catalogo.js';
import { cuerpoConSusCifras } from '../src/core/unidad/cuerpo.js';
import { CUERPO_COMUN, KIT_DEL_PERFIL } from '../src/core/unidad/formato.js';
import {
  aMano,
  bando,
  bandoDe,
  conLasCifrasDe,
  conManosDePrueba,
  MANOS_DE_PRUEBA,
  mando as mandoDePrueba,
} from './batalla-de-prueba.js';
import { NO_MUERTO, PESADA, SANADOR, TIRADOR, TROPA, TROPA_BARATA } from './comun.js';
import { rango, segunPrisa } from './lento.js';
import { catalogoCon } from './pelea-de-arena.js';

const SEMILLAS = segunPrisa(rango(1, 40), rango(1, 300));

/**
 * Las tres ruedas con sus reglas (`combateCon`): el barrido del golpe juega todos
 * los cruces de cada una.
 */
const RUEDAS_DEL_BARRIDO = LAS_TRES_RUEDAS.map((forma) => ({
  forma,
  combate: combateCon(null, forma.golpes.length as TiposDeLaRueda),
}));

/** El héroe de estos escenarios: con ataque y defensa, poder 2 y un libro con daño. */
function mandoConCincoHechizos(over: Partial<BattleHero> = {}): BattleHero {
  return mandoDePrueba({
    spellPower: 2,
    spells: ['magic_arrow', 'lightning_bolt', 'haste', 'slow', 'cure'],
    ...over,
  });
}

interface Montado {
  readonly b: BattleState;
  readonly accion: BattleAction;
}

/**
 * Un escenario: dos bandos, dónde está cada uno y qué hace el atacante. El turno
 * se le da a mano a `attacker-0`, que es quien actúa en todos.
 */
interface Escenario {
  readonly nombre: string;
  /** Funciones y no bandos: el motor gasta el maná del héroe que recibe, y cada batalla estrena el suyo. */
  readonly izquierda: () => BattleSide;
  readonly derecha: () => BattleSide;
  readonly en: Hex;
  readonly contra: Hex;
  readonly antes?: (b: BattleState) => void;
  readonly accion: (b: BattleState) => BattleAction;
  /** La muralla del tablero, si la hay (la de la arena). */
  readonly muralla?: MurallaDeBatalla;
  /**
   * Un hechizo que no tira dado: da lo mismo en todas las
   * semillas, así que se mira en una sola por combinación de reglas.
   */
  readonly sinDado?: true;
}

const golpe =
  (from?: Hex) =>
  (b: BattleState): BattleAction => {
    const a = legalActions(b).find(
      (x) =>
        x.type === 'attack' &&
        x.target === 'defender-0' &&
        (from === undefined
          ? x.from === undefined
          : x.from !== undefined && hexEquals(x.from, from)),
    );
    if (a === undefined) throw new Error('el escenario no deja golpear como se pide');
    return a;
  };
const lanza =
  (hechizo: string, objetivo = 'defender-0') =>
  (): BattleAction => ({ type: 'cast', spell: hechizo, target: objetivo });

/**
 * Una unidad de la arena con armas por uso (13-10-2026): el cuerpo común con su
 * equipo, de uno. Cada golpe va con las cifras de su arma (`cifrasDelGolpe`).
 */
function deLaArena(
  nombre: string,
  equipo: Equipo,
  agilidad = 4,
  traits: UnitInfo['traits'] = [],
): BattleSide {
  const { attack, fuerza, hp } = CUERPO_COMUN;
  const cuerpo: UnitInfo = cuerpoConSusCifras({
    name: nombre,
    faction: null,
    attack,
    fuerza,
    agilidad,
    defensaPropia: 0,
    hp,
    traits,
  });
  return bandoDe([{ id: nombre, unit: EQUIPO_DEL_JUEGO.conEquipo(cuerpo, equipo) }]);
}
const ARQUERO_DE_LA_ARENA = KIT_DEL_PERFIL.arco.equipo;

/**
 * Un bando de un individuo hecho a mano (`aMano`): para los rasgos del motor que
 * ninguna unidad del catálogo lleva (doble golpe, doble disparo, miedo) o un daño
 * exacto. Entra con sus cifras tal cual (`bandoDe`).
 */
function aManoSolo(nombre: string, unit: UnitInfo): BattleSide {
  return bandoDe([{ id: nombre, unit }]);
}

/**
 * `unit` con las manos de prueba por toda arma: pega con las cifras de arriba
 * (las manos no suman nada) y golpea en la rueda con los niveles de la Espada.
 */
function conManos(unit: UnitInfo): UnitInfo {
  const { armas: _armas, equipo: _equipo, puntosDeArmadura: _armadura, ...cuerpo } = unit;
  // Vestir deriva otra vez el daño de la fuerza: las cifras de arriba, las que traía.
  return conLasCifrasDe(
    catalogoCon(MANOS_DE_PRUEBA).conEquipo(cuerpo, { arma: MANOS_DE_PRUEBA.id }),
    unit,
  );
}

/** Los rasgos de `base` más `rasgo`. */
const con = (base: string, rasgo: CreatureTrait): UnitInfo =>
  aMano(base, { traits: [...(unidadDelJuego(base).traits ?? []), rasgo] });
const JINETE_DE_LA_ARENA = KIT_DEL_PERFIL['montado-lanza'].equipo;

/** La línea recta de la arena (la columna 7 entera) y una casilla de lo alto. */
const LINEA_RECTA = FORMAS_DE_EJEMPLO[0]!.muralla;
const LO_ALTO: Hex = { col: 7, row: 4 };

const ESCENARIOS: readonly Escenario[] = [
  {
    nombre: 'golpe con contraataque',
    izquierda: () => bando([{ creature: PESADA, count: 5 }]),
    derecha: () => bando([{ creature: TROPA, count: 30 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'daño fijo: exacta',
    izquierda: () => aManoSolo('exacta', conManos(aMano(TROPA_BARATA, { damage: [10, 10] }))),
    // Contra quien lleva armadura (la brigantina, 2), para que la previsión la diga:
    // el esqueleto guerrero, que era el blanco, va sin ella desde el 02-11-2026.
    derecha: () => bando([{ creature: TROPA, count: 6 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'arquero pegado: golpe cuerpo a cuerpo y su contraataque',
    izquierda: () => bando([{ creature: TIRADOR, count: 8 }]),
    derecha: () => bando([{ creature: TIRADOR, count: 20 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'doble golpe',
    izquierda: () => aManoSolo('doble golpe', con(PESADA, 'double_attack')),
    derecha: () => bando([{ creature: TROPA, count: 30 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'quien asusta lo hace antes del contraataque',
    izquierda: () => aManoSolo('asusta', con(NO_MUERTO, 'fear')),
    derecha: () => bando([{ creature: TROPA, count: 40 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'tropa con héroes a los dos lados',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mandoConCincoHechizos() }),
    derecha: () => bando([{ creature: TROPA, count: 30 }], { heroe: mandoConCincoHechizos() }),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'golpe en lo alto de la muralla y el contraataque del tirador',
    izquierda: () => bando([{ creature: PESADA, count: 5 }]),
    derecha: () => bando([{ creature: TIRADOR, count: 20 }]),
    en: { col: 7, row: 3 },
    contra: LO_ALTO,
    accion: golpe(),
    muralla: LINEA_RECTA,
  },
  {
    nombre: 'arquero de la arena pegado: golpe con la daga y contraataque con la daga',
    izquierda: () => deLaArena('arquero', ARQUERO_DE_LA_ARENA),
    derecha: () => deLaArena('otro', ARQUERO_DE_LA_ARENA),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'jinete de la arena: carga con la lanza y le devuelven el golpe',
    izquierda: () => deLaArena('jinete', JINETE_DE_LA_ARENA),
    derecha: () => bando([{ creature: TROPA, count: 30 }]),
    en: { col: 3, row: 4 },
    contra: { col: 7, row: 4 },
    accion: golpe({ col: 6, row: 4 }),
  },
  // La armadura de la arena (#262): se resta lo último de cada golpe, y la
  // previsión con la misma resta (`trasLaArmadura`).
  {
    nombre: 'armadura: la daga contra la coraza del jinete, que para el mínimo entero',
    izquierda: () => deLaArena('arquero', ARQUERO_DE_LA_ARENA),
    derecha: () => deLaArena('jinete', JINETE_DE_LA_ARENA),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'armadura: Flecha mágica sobre el templario',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mandoConCincoHechizos() }),
    derecha: () => deLaArena('templario', KIT_DEL_PERFIL['espada-escudo'].equipo),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('magic_arrow'),
    sinDado: true,
  },
  {
    nombre: 'Flecha mágica',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mandoConCincoHechizos() }),
    // Sin armadura (el monje): la del templario la compara con esta.
    derecha: () => bando([{ creature: SANADOR, count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('magic_arrow'),
    sinDado: true,
  },
  {
    nombre: 'Rayo',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mandoConCincoHechizos() }),
    derecha: () => bando([{ creature: TROPA, count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('lightning_bolt'),
    sinDado: true,
  },
  {
    nombre: 'Lentitud',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mandoConCincoHechizos() }),
    derecha: () => bando([{ creature: TROPA, count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('slow'),
    sinDado: true,
  },
];

/**
 * La acción de cada escenario, buscada una vez en la lista legal: no depende de
 * las reglas ni de la semilla, y buscarla en cada una era la mitad del tiempo.
 */
const ACCIONES = new Map<Escenario, BattleAction>();

function montar(e: Escenario, rng: Rng, combate = COMBATE_COMPLETO): Montado {
  const b = createBattle(e.izquierda(), e.derecha(), rng, combate, e.muralla ?? SIN_MURALLA);
  stackById(b, 'attacker-0').hex = e.en;
  stackById(b, 'defender-0').hex = e.contra;
  e.antes?.(b);
  b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
  let accion = ACCIONES.get(e);
  if (accion === undefined) {
    accion = e.accion(b);
    ACCIONES.set(e, accion);
  }
  return { b, accion };
}

function dentro(d: number, h: Horquilla, que: string): void {
  expect(d, `${que}: ${d} fuera de [${h.min}, ${h.max}]`).toBeGreaterThanOrEqual(h.min);
  expect(d, `${que}: ${d} fuera de [${h.min}, ${h.max}]`).toBeLessThanOrEqual(h.max);
}

/** Los golpes del registro nuevo. */
function golpesDe(
  log: readonly BattleEvent[],
): { retaliation: boolean; damage: number; killed: number }[] {
  const out: { retaliation: boolean; damage: number; killed: number }[] = [];
  for (const e of log) {
    if (e.kind === 'attack') {
      out.push({ retaliation: e.retaliation, damage: e.damage, killed: e.killed });
    }
  }
  return out;
}

/** Las cifras de quien actúa (`attacker-0`) y de quien recibe (`defender-0`) en `b`. */
function losDos(b: BattleState): { yo: UnitInfo; el: UnitInfo } {
  return { yo: stackById(b, 'attacker-0').unit, el: stackById(b, 'defender-0').unit };
}

/** Lo menos y lo más de lo visto, para compararlo con la horquilla que se previó. */
function puntas(vistos: readonly number[]): [number, number] {
  return [Math.min(...vistos), Math.max(...vistos)];
}

/**
 * Un golpe cuerpo a cuerpo en todo cruce de las tres ruedas: la previsión sin
 * elegir (la de la barra) contra lo que pasa con cada golpe y cada respuesta, y la
 * de cada cruce elegido, que es un número (en un punto no hay dado).
 */
function barridoDeLosCruces(e: Escenario): number {
  let vistos = 0;
  for (const { forma, combate } of RUEDAS_DEL_BARRIDO) {
    const enLaRueda = `${e.nombre}, rueda de ${forma.golpes.length}`;
    const { b: antes, accion } = montar(e, createRng(SEMILLAS[0]!), combate);
    if (accion.type !== 'attack') throw new Error(`${enLaRueda}: no es un golpe`);
    const p = previsionDe(antes, accion);
    if (p?.kind !== 'golpe') throw new Error(`${enLaRueda}: sin previsión del golpe`);
    const golpesVistos: number[] = [];
    const devueltosVistos: number[] = [];
    for (const golpe of forma.golpes) {
      for (const respuesta of forma.golpes) {
        const que = `${enLaRueda}: ${golpe} contra ${respuesta}`;
        const rng = createRng(SEMILLAS[vistos % SEMILLAS.length]!);
        const { b } = montar(e, rng, combate);
        const elegido = { ...accion, golpe, respuesta };
        const exacta = previsionDe(b, elegido);
        if (exacta?.kind !== 'golpe') throw new Error(`${que}: sin previsión del cruce`);
        const desde = b.log.length;
        applyAction(b, elegido, rng);
        const golpes = golpesDe(b.log.slice(desde));
        const mios = golpes.filter((g) => !g.retaliation);
        const devueltos = golpes.filter((g) => g.retaliation);
        expect(mios.length, que).toBeGreaterThan(0);
        expect(mios.length, `${que}, cuántos golpes`).toBeLessThanOrEqual(p.golpes.max);
        for (const g of mios) dentro(g.damage, p.danio, que);
        golpesVistos.push(...mios.map((g) => g.damage));
        const muertos = mios.reduce((n, g) => n + g.killed, 0);
        dentro(muertos, p.bajas, `${que}, bajas`);
        dentro(stackHp(stackById(b, 'defender-0')), p.leQuedan, `${que}, le quedan`);
        if (devueltos.length > 0) {
          if (p.contraataque === null) throw new Error(`${que}: contraatacó sin preverlo`);
          expect(devueltos.length, `${que}, cuántos devuelve`).toBeLessThanOrEqual(
            p.contraataque.golpes.max,
          );
          for (const g of devueltos) dentro(g.damage, p.contraataque.danio, `${que}, contraataque`);
          devueltosVistos.push(...devueltos.map((g) => g.damage));
        } else if (p.contraataque?.seguro === true) {
          throw new Error(`${que}: el contraataque era seguro y no llegó`);
        }
        // Con los dos elegidos, la previsión es el cruce: lo que cae, sin dado (con
        // carga y más de un golpe, el primero la cobra y los demás no).
        expect([exacta.danio.min, exacta.danio.max], `${que}, elegido`).toEqual(
          puntas(mios.map((g) => g.damage)),
        );
        expect(exacta.contraataque?.danio ?? null, `${que}, contraataque elegido`).toEqual(
          devueltos[0] === undefined
            ? null
            : { min: devueltos[0].damage, max: devueltos[0].damage },
        );
        vistos++;
      }
    }
    // La horquilla no es más ancha de lo que pasa: sus puntas las da algún cruce.
    expect(puntas(golpesVistos), `${enLaRueda}: lo visto frente a lo previsto`).toEqual([
      p.danio.min,
      p.danio.max,
    ]);
    if (p.contraataque === null) expect(devueltosVistos, enLaRueda).toEqual([]);
    else {
      expect(puntas(devueltosVistos), `${enLaRueda}: el contraataque visto`).toEqual([
        p.contraataque.danio.min,
        p.contraataque.danio.max,
      ]);
    }
  }
  return vistos;
}

/** Un hechizo: con la semilla, lo que hace y lo que deja, como dice la previsión. */
function barridoDelHechizo(e: Escenario): number {
  let vistos = 0;
  const semillas = e.sinDado === true ? SEMILLAS.slice(0, 1) : SEMILLAS;
  for (const semilla of semillas) {
    const que = e.nombre;
    const rng = createRng(semilla);
    const { b, accion } = montar(e, rng);
    const p = previsionDe(b, accion);
    if (p?.kind !== 'hechizo') throw new Error(`${que}: este barrido solo lanza hechizos`);
    const desde = b.log.length;
    applyAction(b, accion, rng);
    const nuevo = b.log.slice(desde);
    const c = nuevo.find((x) => x.kind === 'cast');
    if (c?.kind !== 'cast') throw new Error(`${que}: no se lanzó`);
    const [imp] = p.impactos;
    if (imp !== undefined && imp.danio !== null) {
      expect(c.damage, que).toBe(imp.danio);
      expect(c.killed, que).toBe(imp.bajas);
    }
    const [efecto] = imp?.efectos ?? [];
    if (efecto !== undefined && 'amount' in efecto) {
      const ef = nuevo.find((x) => x.kind === 'effect');
      expect(ef, que).toMatchObject({
        effect: efecto.kind,
        amount: efecto.amount,
        rounds: efecto.roundsLeft,
      });
    }
    vistos++;
  }
  return vistos;
}

describe('la previsión de daño cae en el daño real', () => {
  for (const e of ESCENARIOS) {
    it(e.nombre, () => {
      const { accion } = montar(e, createRng(SEMILLAS[0]!));
      const vistos = accion.type === 'attack' ? barridoDeLosCruces(e) : barridoDelHechizo(e);
      expect(vistos).toBeGreaterThan(0);
    });
  }

  // Con un daño fijo era un número; con la rueda, Fuerte y Rápido lo mueven (#253):
  // queda la «Cuenta», que va sin la rueda.
  it('con un daño fijo la Cuenta dice el arma, ataque contra defensa y la armadura, y hay contraataque', () => {
    const e = ESCENARIOS.find((x) => x.nombre.startsWith('daño fijo'))!;
    const { b, accion } = montar(e, createRng(1));
    const p = previsionDe(b, accion) as PrevisionDeGolpe;
    expect(p.contraataque).not.toBeNull();
    // Con qué pega, lo primero; la armadura de quien recibe, lo último.
    const { yo, el } = losDos(b);
    expect(p.modificadores.map((m) => m.causa)).toEqual([
      'con Manos de prueba (cuerpo a cuerpo)',
      `ataque ${yo.attack} contra defensa ${el.defense}`,
      `−${armaduraDe(el)} armadura`,
    ]);
  });

  it('los rasgos hechos a mano se juegan: el doble golpe da dos, y con Rápido el doble', () => {
    for (const nombre of ['doble golpe']) {
      const e = ESCENARIOS.find((x) => x.nombre === nombre)!;
      const { b, accion } = montar(e, createRng(1));
      expect((previsionDe(b, accion) as PrevisionDeGolpe).golpes, nombre).toEqual({
        min: 2,
        max: 2 * golpesDelTipo('rapido'),
      });
    }
  });

  it('una acción que no se puede jugar no se prevé: se dice por qué', () => {
    const e = ESCENARIOS[0]!;
    const { b } = montar(e, createRng(1));
    expect(() => previsionDe(b, { type: 'cast', spell: 'haste', target: 'attacker-0' })).toThrow(
      'no se puede lanzar: este bando no tiene héroe',
    );
    expect(previsionDe(b, { type: 'end_turn' })).toBeNull();
  });
});

describe('con la rueda del golpe, cada sector prevé el daño que cae', () => {
  // Las parejas: dos de a pie, uno de doble golpe contra no-muertos y uno que
  // deja miedo al golpear contra pesadas. Los dos rasgos, a mano: el catálogo no
  // los trae.
  const PAREJAS: readonly (readonly [string, () => BattleSide, () => BattleSide])[] = [
    [
      'de a pie contra de a pie',
      () => bando([{ creature: TROPA, count: 10 }]),
      () => bando([{ creature: TROPA, count: 10 }]),
    ],
    [
      'doble golpe contra no-muertos',
      () => aManoSolo('doble golpe', con(PESADA, 'double_attack')),
      () => bando([{ creature: NO_MUERTO, count: 40 }]),
    ],
    [
      'miedo contra pesadas',
      () => aManoSolo('asusta', con(NO_MUERTO, 'fear')),
      () => bando([{ creature: PESADA, count: 6 }]),
    ],
  ];
  const TIPOS = [
    'rapido',
    'defensivo',
    'finta',
    'fuerte',
    'romperGuardia',
    'ofensivo',
    'normal',
  ] as const;

  it('el golpe de cada tipo, contra cada respuesta, cae en la horquilla de su sector; el mínimo y el máximo, justos', () => {
    let vistos = 0;
    for (const [pareja, atacante, defensor] of PAREJAS) {
      for (const golpe of TIPOS) {
        for (const respuesta of TIPOS) {
          for (const semilla of SEMILLAS.slice(0, 5)) {
            const que = `${pareja}: ${golpe} contra ${respuesta}, semilla ${semilla}`;
            const rng = createRng(semilla);
            const b = conManosDePrueba(createBattle(atacante(), defensor(), rng, COMBATE_COMPLETO));
            stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
            stackById(b, 'defender-0').hex = { col: 6, row: 4 };
            b.turno = { n: 1, stack: 'attacker-0', gastado: 0 };
            const p = previsionDe(b, { type: 'attack', target: 'defender-0', golpe });
            if (p === null || p.kind !== 'golpe') throw new Error(`${que}: sin previsión`);
            const desde = b.log.length;
            applyAction(b, { type: 'attack', target: 'defender-0', golpe, respuesta }, rng);
            const mios = golpesDe(b.log.slice(desde)).filter((g) => !g.retaliation);
            expect(mios.length, que).toBeGreaterThan(0);
            expect(mios.length, que).toBeLessThanOrEqual(p.golpes.max);
            for (const g of mios) dentro(g.damage, p.danio, que);
            // El primero cae justo en la punta que dice el cruce.
            const cruce = b.log.find((e) => e.kind === 'cruce');
            const primero = mios[0];
            if (cruce?.kind === 'cruce' && primero !== undefined) {
              if (cruce.punto === 0 && golpe !== 'normal')
                expect(primero.damage, que).toBe(p.danio.min);
              if (cruce.punto === 4) expect(primero.damage, que).toBe(p.danio.max);
              if (golpe === 'normal') expect(primero.damage, que).toBe(p.danio.min);
            }
            vistos++;
          }
        }
      }
    }
    expect(vistos).toBe(PAREJAS.length * TIPOS.length * TIPOS.length * 5);
  });
});
