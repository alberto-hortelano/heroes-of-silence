/**
 * La previsión de daño (`previsionDe`) contra el daño de verdad.
 *
 * Por cada escenario —golpe, carga, defensa, contraataque,
 * doble golpe, maldecir y asustar al golpear (hechos a mano: el catálogo no trae esos
 * rasgos), Bendición y Maldición, héroes con ataque y
 * defensa, hechizos— se pide la previsión, se juega la acción y se mira el
 * registro: cada golpe cae en la horquilla de la rama de suerte que le tocó y
 * las bajas en las suyas, semilla a semilla; y con el dado cargado en cada punta
 * (`dadoCargado`) el primer golpe da justo el mínimo y el máximo que la previsión
 * dice (la horquilla no es más ancha de lo que pasa).
 *
 * En `pnpm verify`, las reglas del juego, todas en fheroes2 y cada interruptor
 * solo; en `pnpm verify:lento`, las 64 combinaciones con 300 semillas.
 *
 * Con la muralla de la arena (`battle/muralla.ts`) también: el tirador en lo
 * alto se defiende mejor, y la previsión lo cuenta con las mismas opciones que
 * el golpe (`opcionesDeDanio`).
 */

import { describe, expect, it } from 'vitest';
import { FORMAS_DE_EJEMPLO } from '../src/core/arena-murallas.js';
import { armaduraDe, golpeDe } from '../src/core/battle/armas.js';
import {
  applyAction,
  type BattleSide,
  createBattle,
  legalActions,
  type Prevision,
  type PrevisionDeGolpe,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import { hexEquals } from '../src/core/battle/board.js';
import type { Horquilla, RamaDeSuerte } from '../src/core/battle/damage.js';
import { applyEffect } from '../src/core/battle/effects.js';
import { type MurallaDeBatalla, SIN_MURALLA } from '../src/core/battle/muralla.js';
import { delHeroe, efectoDe, spell } from '../src/core/battle/spells.js';
import type {
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleState,
} from '../src/core/battle/types.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { cuerpoConSusCifras } from '../src/core/cuerpo.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { CreatureTrait, Equipo, Hex, UnitInfo } from '../src/core/types.js';
import { CUERPO_COMUN, KIT_DEL_PERFIL } from '../src/core/unidad.js';
import { bando, bandoDe, mando as mandoDePrueba } from './batalla-de-prueba.js';
import {
  aMano,
  catalogoCon,
  conLasCifrasDe,
  conManosDePrueba,
  dadoCargado,
  JINETE,
  MANOS_DE_PRUEBA,
  NO_MUERTO,
  PESADA,
  SANADOR,
  TIRADOR,
  TROPA,
  TROPA_BARATA,
} from './helpers.js';
import { rango, segunPrisa } from './lento.js';

const SEMILLAS = segunPrisa(rango(1, 40), rango(1, 300));

/**
 * Las respuestas con que se juega el golpe del barrido, una por semilla: las que
 * no cambian el contraataque (la respuesta no da bonificadores; Fuerte y Rápido,
 * sí, y su previsión es la de la rueda, abajo). El golpe va siempre con Finta,
 * que no toca este golpe ni el contraataque: lo que deja es andar después. Así el
 * cruce cae en cualquier punto de la horquilla, que es lo que prevé la previsión
 * sin elegir.
 */
const RESPUESTAS = ['finta', 'romperGuardia', 'defensivo', 'normal', 'ofensivo'] as const;

/** El golpe con Finta y la respuesta de la semilla; lo que no es un golpe, tal cual. */
function conLaRueda(accion: BattleAction, semilla: number): BattleAction {
  if (accion.type !== 'attack') return accion;
  const respuesta = RESPUESTAS[semilla % RESPUESTAS.length] as (typeof RESPUESTAS)[number];
  return { ...accion, golpe: 'finta', respuesta };
}

/**
 * El golpe en una punta del cruce: Finta contra Finta en el mínimo, contra Romper
 * guardia (su opuesta) en el máximo.
 */
const EN_LA_PUNTA = {
  minimo: { golpe: 'finta', respuesta: 'finta' },
  maximo: { golpe: 'finta', respuesta: 'romperGuardia' },
} as const;

/** El héroe de estos escenarios: con ataque y defensa, poder 2 y un libro con daño. */
function mando(over: Partial<BattleHero> = {}): BattleHero {
  return mandoDePrueba({
    spellPower: 2,
    spells: ['magic_arrow', 'lightning_bolt', 'bless', 'curse', 'haste', 'cure'],
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
   * Un hechizo que no tira dado ni toca la suerte: da lo mismo en todas las
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

/** Cuelga Bendición del primero y Maldición del segundo, con las reglas de la batalla. */
function bendecirYMaldecir(b: BattleState): void {
  const h = mando();
  const a = stackById(b, 'attacker-0');
  const d = stackById(b, 'defender-0');
  const efecto = (id: string) => efectoDe(spell(id), delHeroe(spell(id), h))!;
  applyEffect(a, efecto('bless'));
  applyEffect(d, efecto('curse'));
}

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
 * ninguna unidad del catálogo lleva (doble golpe, doble disparo, maldecir al
 * golpear, miedo) o un daño exacto. Entra como personaje (`bandoDe`).
 */
function aManoSolo(nombre: string, unit: UnitInfo, suerte = 0): BattleSide {
  return { ...bandoDe([{ id: nombre, unit }]), luckBonus: suerte };
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
    derecha: () => bando([{ creature: NO_MUERTO, count: 6 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'carga de la caballería',
    izquierda: () => bando([{ creature: JINETE, count: 3 }]),
    derecha: () => bando([{ creature: TROPA, count: 30 }]),
    en: { col: 1, row: 4 },
    contra: { col: 7, row: 4 },
    accion: golpe({ col: 6, row: 4 }),
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
    nombre: 'con mala suerte en el contraataque',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { suerte: 1 }),
    derecha: () => bando([{ creature: TROPA, count: 30 }], { suerte: -2 }),
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
    nombre: 'quien maldice al golpear lo hace antes del contraataque',
    izquierda: () => aManoSolo('maldice', con(NO_MUERTO, 'curse_on_hit')),
    derecha: () => bando([{ creature: PESADA, count: 20 }]),
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
    nombre: 'Bendición del que pega y Maldición del que contraataca',
    izquierda: () => bando([{ creature: PESADA, count: 5 }]),
    derecha: () => bando([{ creature: TROPA, count: 30 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    antes: bendecirYMaldecir,
    accion: golpe(),
  },
  {
    nombre: 'tropa con héroes a los dos lados',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    derecha: () => bando([{ creature: TROPA, count: 30 }], { heroe: mando() }),
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
    nombre: 'armadura: la daga contra la barda del jinete, que para casi todo el mínimo',
    izquierda: () => deLaArena('arquero', ARQUERO_DE_LA_ARENA),
    derecha: () => deLaArena('jinete', JINETE_DE_LA_ARENA),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'armadura: Flecha mágica sobre el templario',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    derecha: () => deLaArena('templario', KIT_DEL_PERFIL['espada-escudo'].equipo),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('magic_arrow'),
    sinDado: true,
  },
  {
    nombre: 'Flecha mágica',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    // Sin armadura (el monje): la del templario la compara con esta.
    derecha: () => bando([{ creature: SANADOR, count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('magic_arrow'),
    sinDado: true,
  },
  {
    nombre: 'Rayo',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    derecha: () => bando([{ creature: TROPA, count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('lightning_bolt'),
    sinDado: true,
  },
  {
    nombre: 'Maldición',
    izquierda: () => bando([{ creature: PESADA, count: 5 }], { heroe: mando() }),
    derecha: () => bando([{ creature: TROPA, count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('curse'),
    sinDado: true,
  },
];

/**
 * La acción de cada escenario, buscada una vez en la lista legal: no depende de
 * las reglas ni de la semilla, y buscarla en cada una era la mitad del tiempo.
 */
const ACCIONES = new Map<Escenario, BattleAction>();

function montar(e: Escenario, rng: Rng): Montado {
  const b = createBattle(
    e.izquierda(),
    e.derecha(),
    rng,
    COMBATE_COMPLETO,
    e.muralla ?? SIN_MURALLA,
  );
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

/** La horquilla de la rama que cayó: la suerte buena, la mala o ninguna. */
function rama(
  p: { danio: Horquilla; buena: RamaDeSuerte | null; mala: RamaDeSuerte | null },
  suerte: boolean | undefined,
  que: string,
): Horquilla {
  if (suerte === undefined) return p.danio;
  const r = suerte ? p.buena : p.mala;
  if (r === null)
    throw new Error(
      `${que}: hubo suerte ${suerte ? 'buena' : 'mala'} y la previsión no la esperaba`,
    );
  return r;
}

/** Los golpes del registro nuevo, con la suerte que llevó cada uno. */
function golpesDe(
  log: readonly BattleEvent[],
): { retaliation: boolean; damage: number; killed: number; suerte: boolean | undefined }[] {
  const out: {
    retaliation: boolean;
    damage: number;
    killed: number;
    suerte: boolean | undefined;
  }[] = [];
  const suerte = new Map<string, boolean>();
  for (const e of log) {
    if (e.kind === 'luck') suerte.set(e.stack, e.good);
    if (e.kind === 'attack') {
      out.push({
        retaliation: e.kind === 'attack' && e.retaliation,
        damage: e.damage,
        killed: e.killed,
        suerte: suerte.get(e.stack),
      });
      suerte.delete(e.stack);
    }
  }
  return out;
}

/** Las cifras de quien actúa (`attacker-0`) y de quien recibe (`defender-0`) en `b`. */
function losDos(b: BattleState): { yo: UnitInfo; el: UnitInfo } {
  return { yo: stackById(b, 'attacker-0').unit, el: stackById(b, 'defender-0').unit };
}

/** Lo mismo, en el escenario `nombre` montado con las reglas del juego. */
function losDosDe(nombre: string): { yo: UnitInfo; el: UnitInfo } {
  const e = ESCENARIOS.find((x) => x.nombre.startsWith(nombre))!;
  return losDos(montar(e, createRng(1)).b);
}

describe('la previsión de daño cae en el daño real', () => {
  for (const e of ESCENARIOS) {
    it(e.nombre, () => {
      let vistos = 0;
      const semillas = e.sinDado === true ? SEMILLAS.slice(0, 1) : SEMILLAS;
      {
        const que = e.nombre;
        let previsto: Prevision | null = null;
        for (const semilla of semillas) {
          const rng = createRng(semilla);
          const { b, accion } = montar(e, rng);
          const p = previsionDe(b, accion);
          if (p === null) throw new Error(`${que}: sin previsión`);
          previsto = p;
          const desde = b.log.length;
          applyAction(b, conLaRueda(accion, semilla), rng);
          const nuevo = b.log.slice(desde);
          if (p.kind === 'hechizo') {
            const c = nuevo.find((x) => x.kind === 'cast');
            if (c?.kind !== 'cast') throw new Error(`${que}: no se lanzó`);
            if (p.danio !== null) {
              expect(c.damage, que).toBe(p.danio);
              expect(c.killed, que).toBe(p.bajas);
            }
            if (p.efecto !== null) {
              const ef = nuevo.find((x) => x.kind === 'effect');
              expect(ef, que).toMatchObject({
                effect: p.efecto.kind,
                amount: p.efecto.amount,
                rounds: p.efecto.roundsLeft,
              });
            }
            vistos++;
            continue;
          }
          if (p.kind === 'poder') throw new Error(`${que}: este barrido no monta poderes`);
          const golpes = golpesDe(nuevo);
          const mios = golpes.filter((g) => !g.retaliation);
          expect(mios.length, que).toBeGreaterThan(0);
          expect(mios.length, que).toBeLessThanOrEqual(p.golpes);
          for (const g of mios) dentro(g.damage, rama(p, g.suerte, que), que);
          if (mios.every((g) => g.suerte === undefined)) {
            const muertos = mios.reduce((n, g) => n + g.killed, 0);
            dentro(muertos, p.bajas, `${que}, bajas`);
          }
          const devuelto = golpes.find((g) => g.retaliation);
          if (devuelto !== undefined) {
            if (p.contraataque === null) throw new Error(`${que}: contraatacó sin preverlo`);
            dentro(
              devuelto.damage,
              rama(p.contraataque, devuelto.suerte, que),
              `${que}, contraataque`,
            );
          } else if (p.contraataque?.seguro === true) {
            throw new Error(`${que}: el contraataque era seguro y no llegó`);
          }
          vistos++;
        }
        // La horquilla no es más ancha de lo que pasa: con el dado cargado en
        // cada punta (el golpe, en esa punta de la rueda), el primer golpe (sin
        // suerte) cae justo en ella.
        if (previsto !== null && previsto.kind !== 'hechizo') {
          const p = previsto as PrevisionDeGolpe;
          const enLaPunta = (punta: 'minimo' | 'maximo'): number => {
            const { b, accion } = montar(e, createRng(SEMILLAS[0]!));
            const desde = b.log.length;
            const a = accion.type === 'attack' ? { ...accion, ...EN_LA_PUNTA[punta] } : accion;
            applyAction(b, a, dadoCargado(punta));
            const primero = golpesDe(b.log.slice(desde)).find((g) => !g.retaliation);
            if (primero === undefined) throw new Error(`${que}: con el dado cargado no golpeó`);
            return primero.damage;
          };
          expect(
            [enLaPunta('minimo'), enLaPunta('maximo')],
            `${que}: lo visto frente a lo previsto`,
          ).toEqual([p.danio.min, p.danio.max]);
        }
      }
      expect(vistos).toBe(semillas.length);
    });
  }

  it('con un daño fijo la previsión es un número, y dice el contraataque', () => {
    const e = ESCENARIOS.find((x) => x.nombre.startsWith('daño fijo'))!;
    const { b, accion } = montar(e, createRng(1));
    const p = previsionDe(b, accion) as PrevisionDeGolpe;
    expect(p.danio.min).toBe(p.danio.max);
    expect(p.contraataque).not.toBeNull();
    // Con qué pega, lo primero; la armadura de quien recibe, lo último.
    const { yo, el } = losDos(b);
    expect(p.modificadores.map((m) => m.causa)).toEqual([
      'con Manos de prueba (cuerpo a cuerpo)',
      `ataque ${yo.attack} contra defensa ${el.defense}`,
      `−${armaduraDe(el)} armadura`,
    ]);
  });

  it('dice qué cambia el daño: la carga', () => {
    const causas = (nombre: string): string[] => {
      const e = ESCENARIOS.find((x) => x.nombre === nombre)!;
      const { b, accion } = montar(e, createRng(1));
      const p = previsionDe(b, accion) as PrevisionDeGolpe;
      return p.modificadores.map((m) => m.causa);
    };
    expect(causas('carga de la caballería')).toContain('carga de 5 casillas montada');
    // Defenderse (+20 %, «(defiende)») se retiró el 26-10-2026.
  });

  it('los rasgos hechos a mano se juegan: el doble golpe da dos', () => {
    for (const nombre of ['doble golpe']) {
      const e = ESCENARIOS.find((x) => x.nombre === nombre)!;
      const { b, accion } = montar(e, createRng(1));
      expect((previsionDe(b, accion) as PrevisionDeGolpe).golpes, nombre).toBe(2);
    }
  });

  it('con armas por uso (la arena), lo primero que dice es con qué arma pega cada golpe', () => {
    const previsto = (nombre: string): PrevisionDeGolpe => {
      const e = ESCENARIOS.find((x) => x.nombre.startsWith(nombre))!;
      const { b, accion } = montar(e, createRng(1));
      return previsionDe(b, accion) as PrevisionDeGolpe;
    };
    const pegado = previsto('arquero de la arena pegado');
    expect(pegado.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    expect(pegado.contraataque?.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    const carga = previsto('jinete de la arena');
    const { yo, el } = losDosDe('jinete de la arena');
    // Con espada y lanza (25-10-2026), las dos nombradas; la carga, con las dos y,
    // montado de guerra, con la fuerza del caballo (26-10-2026).
    const armas = golpeDe(yo, 'arma');
    expect(armas.piezas.map((p) => p.nombre)).toEqual(['Espada', 'Lanza']);
    expect(carga.modificadores.map((m) => m.causa)).toEqual([
      'con Espada y Lanza, montado en Caballo de guerra (en la carga)',
      `ataque ${armas.attack} contra defensa ${el.defense}`,
      'carga de 3 casillas montada',
      `−${armaduraDe(el)} armadura`,
    ]);
    // La tropa del catálogo también pega con su arma (desde F3 lleva equipo): su
    // contraataque lo dice.
    expect(carga.contraataque?.modificadores[0]?.causa).toBe(
      `con ${golpeDe(el, 'arma').piezas[0]?.nombre} (cuerpo a cuerpo)`,
    );
  });

  it('con armadura (la arena), la cuenta lo dice lo último: «−7 armadura»', () => {
    const prevista = (nombre: string): Prevision => {
      const e = ESCENARIOS.find((x) => x.nombre.startsWith(nombre))!;
      const { b, accion } = montar(e, createRng(1));
      return previsionDe(b, accion)!;
    };
    // La daga (4 contra 4: ×1) da 24–96: la barda (22) se queda casi todo el mínimo,
    // y el contraataque del jinete (espada) contra el jubón (2) también llega.
    const daga = prevista('armadura: la daga') as PrevisionDeGolpe;
    expect(daga.danio).toEqual({ min: 2, max: 74 });
    expect(daga.modificadores.at(-1)?.causa).toBe('−22 armadura');
    expect(daga.contraataque?.modificadores.at(-1)?.causa).toBe('−2 armadura');
    // El hechizo, con la misma resta: lo que llega, sin la cuenta.
    const flecha = prevista('armadura: Flecha mágica');
    if (flecha.kind !== 'hechizo') throw new Error('sin previsión de hechizo');
    const sinArmadura = prevista('Flecha mágica');
    if (sinArmadura.kind !== 'hechizo') throw new Error('sin previsión de hechizo');
    expect(flecha.danio).toBe((sinArmadura.danio ?? 0) - 7);
  });

  it('una acción que no se puede jugar no se prevé: se dice por qué', () => {
    const e = ESCENARIOS[0]!;
    const { b } = montar(e, createRng(1));
    expect(() => previsionDe(b, { type: 'cast', spell: 'bless', target: 'attacker-0' })).toThrow(
      'no se puede lanzar: este bando no tiene héroe',
    );
    expect(previsionDe(b, { type: 'end_turn' })).toBeNull();
  });
});

describe('con la rueda del golpe, cada sector prevé el daño que cae', () => {
  // Las parejas: dos de a pie, uno de doble golpe con suerte contra no-muertos,
  // y uno que deja miedo al golpear, con suerte en contra, contra pesadas. Los
  // dos rasgos, a mano: el catálogo no los trae.
  const PAREJAS: readonly (readonly [string, () => BattleSide, () => BattleSide])[] = [
    [
      'de a pie contra de a pie',
      () => bando([{ creature: TROPA, count: 10 }]),
      () => bando([{ creature: TROPA, count: 10 }]),
    ],
    [
      'doble golpe contra no-muertos',
      () => aManoSolo('doble golpe', con(PESADA, 'double_attack'), 2),
      () => bando([{ creature: NO_MUERTO, count: 40 }]),
    ],
    [
      'miedo contra pesadas',
      () => aManoSolo('asusta', con(NO_MUERTO, 'fear'), -1),
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
            expect(mios.length, que).toBeLessThanOrEqual(p.golpes);
            for (const g of mios) dentro(g.damage, rama(p, g.suerte, que), que);
            // Sin suerte, el primero cae justo en la punta que dice el cruce.
            const cruce = b.log.find((e) => e.kind === 'cruce');
            const primero = mios[0];
            if (cruce?.kind === 'cruce' && primero !== undefined && primero.suerte === undefined) {
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
