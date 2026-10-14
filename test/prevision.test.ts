/**
 * La previsión de daño (`previsionDe`) contra el daño de verdad.
 *
 * Por cada escenario —golpe, carga, disparo cerca y lejos, defensa, contraataque,
 * doble golpe, la momia, el dragón, Bendición y Maldición, héroes con ataque y
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
import { CUERPO_COMUN, KIT_DEL_PERFIL } from '../src/core/arena.js';
import { FORMAS_DE_EJEMPLO } from '../src/core/arena-murallas.js';
import {
  applyAction,
  type BattleSide,
  crearBatallaConReglas,
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
import { NOMBRES_DE_REGLA, type ReglasDeBatalla } from '../src/core/battle/reglas.js';
import { delHeroe, efectoDe, spell } from '../src/core/battle/spells.js';
import type {
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleState,
} from '../src/core/battle/types.js';
import { creature, MURALLA } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { EquipoDeArena, Hex, SpeedTier, UnitInfo } from '../src/core/types.js';
import { bando, bandoDe, mando as mandoDePrueba } from './batalla-de-prueba.js';
import { dadoCargado } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

/** Las reglas de una máscara de 6 bits: el bit `i` enciende `NOMBRES_DE_REGLA[i]`. */
function reglasDe(mascara: number): ReglasDeBatalla {
  return Object.fromEntries(
    NOMBRES_DE_REGLA.map((n, i) => [n, (mascara >> i) & 1 ? 'fheroes2' : 'nuestra']),
  ) as unknown as ReglasDeBatalla;
}

const TODAS = 2 ** NOMBRES_DE_REGLA.length - 1;
const MASCARAS = segunPrisa([0, TODAS, ...NOMBRES_DE_REGLA.map((_, i) => 1 << i)], rango(0, TODAS));
const SEMILLAS = segunPrisa(rango(1, 40), rango(1, 300));

/** El héroe de estos escenarios: con ataque y defensa, poder 2 y un libro con daño. */
function mando(over: Partial<BattleHero> = {}): BattleHero {
  return mandoDePrueba({
    ataque: 3,
    defensa: 2,
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
const disparo = (): BattleAction => ({ type: 'shoot', target: 'defender-0' });
const lanza =
  (hechizo: string, objetivo = 'defender-0') =>
  (): BattleAction => ({ type: 'cast', spell: hechizo, target: objetivo });

/** Cuelga Bendición del primero y Maldición del segundo, con las reglas de la batalla. */
function bendecirYMaldecir(b: BattleState): void {
  const h = mando();
  const a = stackById(b, 'attacker-0');
  const d = stackById(b, 'defender-0');
  const efecto = (id: string) => efectoDe(spell(id), delHeroe(spell(id), h), b.reglas)!;
  applyEffect(a, efecto('bless'));
  applyEffect(d, efecto('curse'));
}

/**
 * Una unidad de la arena con armas por uso (13-10-2026): el cuerpo común con su
 * equipo, de uno. Cada golpe va con las cifras de su arma (`cifrasDelGolpe`).
 */
function deLaArena(
  nombre: string,
  equipo: EquipoDeArena,
  speed: SpeedTier = 'average',
  traits: UnitInfo['traits'] = [],
): BattleSide {
  const { attack, defense, damage, hp } = CUERPO_COMUN;
  const cuerpo: UnitInfo = {
    name: nombre,
    faction: null,
    attack,
    defense,
    damage,
    hp,
    speed,
    traits,
  };
  return bandoDe([{ id: nombre, unit: EQUIPO_DEL_JUEGO.conEquipo(cuerpo, equipo) }]);
}
const ARQUERO_DE_LA_ARENA = KIT_DEL_PERFIL.arco.equipo;
const JINETE_DE_LA_ARENA = KIT_DEL_PERFIL['montado-lanza'].equipo;

/** La línea recta de la arena (la columna 7 entera) y una casilla de lo alto. */
const LINEA_RECTA = FORMAS_DE_EJEMPLO[0]!.muralla;
const LO_ALTO: Hex = { col: 7, row: 4 };

const ESCENARIOS: readonly Escenario[] = [
  {
    nombre: 'golpe con contraataque',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }]),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'daño [1, 1]: exacta',
    izquierda: () => bando([{ creature: 'peasant', count: 12 }]),
    derecha: () => bando([{ creature: 'skeleton', count: 6 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'carga de la caballería',
    izquierda: () => bando([{ creature: 'cavalry', count: 3 }]),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 1, row: 4 },
    contra: { col: 7, row: 4 },
    accion: golpe({ col: 6, row: 4 }),
  },
  {
    nombre: 'disparo cerca',
    izquierda: () => bando([{ creature: 'archer', count: 8 }]),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 1, row: 4 },
    contra: { col: 4, row: 4 },
    accion: disparo,
  },
  {
    nombre: 'disparo lejos, doble y con suerte',
    izquierda: () => bando([{ creature: 'ranger', count: 8 }], { suerte: 2 }),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 1, row: 4 },
    contra: { col: 9, row: 4 },
    accion: disparo,
  },
  {
    nombre: 'arquero pegado: golpe cuerpo a cuerpo y su contraataque',
    izquierda: () => bando([{ creature: 'archer', count: 8 }]),
    derecha: () => bando([{ creature: 'archer', count: 20 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'contra quien defiende, con mala suerte en el contraataque',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }], { suerte: 1 }),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }], { suerte: -2 }),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    antes: (b) => {
      stackById(b, 'defender-0').defending = true;
    },
    accion: golpe(),
  },
  {
    nombre: 'doble golpe del paladín',
    izquierda: () => bando([{ creature: 'paladin', count: 2 }]),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'la momia maldice antes del contraataque',
    izquierda: () => bando([{ creature: 'mummy', count: 4 }]),
    derecha: () => bando([{ creature: 'swordsman', count: 20 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'el dragón asusta antes del contraataque',
    izquierda: () => bando([{ creature: 'bone_dragon', count: 1 }]),
    derecha: () => bando([{ creature: 'pikeman', count: 40 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'Bendición del que pega y Maldición del que contraataca',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }]),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    antes: bendecirYMaldecir,
    accion: golpe(),
  },
  {
    nombre: 'tropa con héroes a los dos lados',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }], { heroe: mando({ ataque: 4 }) }),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }], { heroe: mando({ defensa: 3 }) }),
    en: { col: 5, row: 4 },
    contra: { col: 6, row: 4 },
    accion: golpe(),
  },
  {
    nombre: 'disparo al tirador en lo alto de la muralla',
    izquierda: () => bando([{ creature: 'archer', count: 8 }]),
    derecha: () => bando([{ creature: 'archer', count: 20 }]),
    en: { col: 1, row: 4 },
    contra: LO_ALTO,
    accion: disparo,
    muralla: LINEA_RECTA,
  },
  {
    nombre: 'golpe en lo alto de la muralla y el contraataque del tirador',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }]),
    derecha: () => bando([{ creature: 'archer', count: 20 }]),
    en: { col: 7, row: 3 },
    contra: LO_ALTO,
    accion: golpe(),
    muralla: LINEA_RECTA,
  },
  {
    nombre: 'arquero de la arena: dispara con el arco',
    izquierda: () => deLaArena('arquero', ARQUERO_DE_LA_ARENA),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 1, row: 4 },
    contra: { col: 4, row: 4 },
    accion: disparo,
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
    izquierda: () => deLaArena('jinete', JINETE_DE_LA_ARENA, 'very_fast', ['charge']),
    derecha: () => bando([{ creature: 'pikeman', count: 30 }]),
    en: { col: 3, row: 4 },
    contra: { col: 7, row: 4 },
    accion: golpe({ col: 6, row: 4 }),
  },
  {
    nombre: 'Flecha mágica',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }], { heroe: mando() }),
    derecha: () => bando([{ creature: 'pikeman', count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('magic_arrow'),
    sinDado: true,
  },
  {
    nombre: 'Rayo',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }], { heroe: mando() }),
    derecha: () => bando([{ creature: 'pikeman', count: 3 }]),
    en: { col: 5, row: 4 },
    contra: { col: 8, row: 4 },
    accion: lanza('lightning_bolt'),
    sinDado: true,
  },
  {
    nombre: 'Maldición',
    izquierda: () => bando([{ creature: 'swordsman', count: 5 }], { heroe: mando() }),
    derecha: () => bando([{ creature: 'pikeman', count: 3 }]),
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

function montar(e: Escenario, reglas: ReglasDeBatalla, rng: Rng): Montado {
  const b = crearBatallaConReglas(
    e.izquierda(),
    e.derecha(),
    rng,
    reglas,
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
    if (e.kind === 'attack' || (e.kind === 'shoot' && e.splash !== true)) {
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

describe('la previsión de daño cae en el daño real', () => {
  for (const e of ESCENARIOS) {
    it(e.nombre, () => {
      let vistos = 0;
      const semillas = e.sinDado === true ? SEMILLAS.slice(0, 1) : SEMILLAS;
      for (const mascara of MASCARAS) {
        const reglas = reglasDe(mascara);
        const que = `${e.nombre}, reglas ${mascara}`;
        let previsto: Prevision | null = null;
        for (const semilla of semillas) {
          const rng = createRng(semilla);
          const { b, accion } = montar(e, reglas, rng);
          const p = previsionDe(b, accion);
          if (p === null) throw new Error(`${que}: sin previsión`);
          previsto = p;
          const desde = b.log.length;
          applyAction(b, accion, rng);
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
        // cada punta, el primer golpe (sin suerte) cae justo en ella.
        if (previsto !== null && previsto.kind !== 'hechizo') {
          const p = previsto as PrevisionDeGolpe;
          const enLaPunta = (punta: 'minimo' | 'maximo'): number => {
            const { b, accion } = montar(e, reglas, createRng(SEMILLAS[0]!));
            const desde = b.log.length;
            applyAction(b, accion, dadoCargado(punta));
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
      expect(vistos).toBe(MASCARAS.length * semillas.length);
    });
  }

  it('con daño [1, 1] la previsión es un número, y dice el contraataque', () => {
    const e = ESCENARIOS.find((x) => x.nombre.startsWith('daño [1, 1]'))!;
    const { b, accion } = montar(e, reglasDe(0), createRng(1));
    const p = previsionDe(b, accion) as PrevisionDeGolpe;
    expect(p.danio.min).toBe(p.danio.max);
    expect(p.contraataque).not.toBeNull();
    expect(p.modificadores.map((m) => m.causa)).toEqual(['ataque 1 contra defensa 3']);
  });

  it('dice qué cambia el daño: carga, distancia, defensa y las reglas en curso', () => {
    const causas = (nombre: string, mascara: number): string[] => {
      const e = ESCENARIOS.find((x) => x.nombre === nombre)!;
      const { b, accion } = montar(e, reglasDe(mascara), createRng(1));
      const p = previsionDe(b, accion) as PrevisionDeGolpe;
      return [...p.modificadores.map((m) => m.causa), ...p.reglas];
    };
    expect(causas('carga de la caballería', 0)).toContain('carga de 5 casillas');
    expect(causas('disparo lejos, doble y con suerte', 0)).toContain(
      'disparo a 8 casillas, más de 5',
    );
    expect(causas('disparo lejos, doble y con suerte', 1)).toEqual([
      'ataque 5 contra defensa 9',
      'tirador',
    ]);
    expect(causas('contra quien defiende, con mala suerte en el contraataque', 0)[0]).toBe(
      'ataque 7 contra defensa 10,8 (defiende)',
    );
    expect(causas('arquero pegado: golpe cuerpo a cuerpo y su contraataque', 1)).toContain(
      'tirador con flechas cuerpo a cuerpo (fheroes2)',
    );
    expect(causas('Bendición del que pega y Maldición del que contraataca', 16)).toContain(
      'Bendición: daño máximo (fheroes2)',
    );
    // La muralla, con las dos reglas del tirador: en lo alto suma su defensa, y
    // con la de fheroes2 el arquero que devuelve el golpe pega la mitad.
    const arquero = creature('archer');
    expect(causas('disparo al tirador en lo alto de la muralla', 0)[0]).toBe(
      `ataque ${arquero.attack} contra defensa ${arquero.defense + MURALLA.defensaEnLoAlto}, en lo alto de la muralla`,
    );
    const enLoAlto = (m: number) =>
      (previsionDe(
        ...((): [BattleState, BattleAction] => {
          const e = ESCENARIOS.find((x) => x.nombre.startsWith('golpe en lo alto'))!;
          const { b, accion } = montar(e, reglasDe(m), createRng(1));
          return [b, accion];
        })(),
      ) as PrevisionDeGolpe)!.contraataque!.modificadores.map((x) => x.causa);
    expect(enLoAlto(1)).toContain('tirador con flechas cuerpo a cuerpo (fheroes2)');
    expect(enLoAlto(0)).not.toContain('tirador con flechas cuerpo a cuerpo (fheroes2)');
  });

  it('con armas por uso (la arena), lo primero que dice es con qué arma pega cada golpe', () => {
    const golpeDe = (nombre: string): PrevisionDeGolpe => {
      const e = ESCENARIOS.find((x) => x.nombre.startsWith(nombre))!;
      const { b, accion } = montar(e, reglasDe(0), createRng(1));
      return previsionDe(b, accion) as PrevisionDeGolpe;
    };
    expect(golpeDe('arquero de la arena: dispara').modificadores[0]?.causa).toBe(
      'con Arco (a distancia)',
    );
    const pegado = golpeDe('arquero de la arena pegado');
    expect(pegado.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    expect(pegado.contraataque?.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    const carga = golpeDe('jinete de la arena');
    expect(carga.modificadores.map((m) => m.causa)).toEqual([
      'con Lanza de jinete (en la carga)',
      'ataque 10 contra defensa 9',
      'carga de 3 casillas',
    ]);
    // La tropa del catálogo no tiene armas por uso: ni una palabra de ellas.
    expect(carga.contraataque?.modificadores[0]?.causa).toMatch(/^ataque /);
  });

  it('la muralla tapa el disparo en el suelo, y la previsión lo dice con el motivo del núcleo', () => {
    const e = ESCENARIOS.find((x) => x.nombre.startsWith('disparo al tirador en lo alto'))!;
    for (const mascara of MASCARAS) {
      const { b } = montar(e, reglasDe(mascara), createRng(1));
      stackById(b, 'defender-0').hex = { col: 9, row: 4 };
      expect(() => previsionDe(b, { type: 'shoot', target: 'defender-0' })).toThrow(
        'attacker-0 no puede disparar a defender-0: el muro está en medio',
      );
    }
  });

  it('una acción que no se puede jugar no se prevé: se dice por qué', () => {
    const e = ESCENARIOS[0]!;
    const { b } = montar(e, reglasDe(0), createRng(1));
    expect(() => previsionDe(b, { type: 'shoot', target: 'defender-0' })).toThrow(
      'attacker-0 no es tirador',
    );
    expect(() => previsionDe(b, { type: 'cast', spell: 'bless', target: 'attacker-0' })).toThrow(
      'no se puede lanzar: este bando no tiene héroe',
    );
    expect(previsionDe(b, { type: 'defend' })).toBeNull();
  });
});

describe('con la rueda del golpe, cada sector prevé el daño que cae (la arena)', () => {
  // Las parejas: dos piqueros, el paladín (doble golpe) contra esqueletos con suerte
  // en contra, y el dragón óseo (deja miedo al golpear) contra espadachines.
  const PAREJAS: readonly (readonly [string, number, string, number, number])[] = [
    ['pikeman', 10, 'pikeman', 10, 0],
    ['paladin', 3, 'skeleton', 40, 2],
    ['bone_dragon', 1, 'swordsman', 6, -1],
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
    for (const [atacante, n, defensor, m, suerte] of PAREJAS) {
      for (const golpe of TIPOS) {
        for (const respuesta of TIPOS) {
          for (const semilla of SEMILLAS.slice(0, 5)) {
            const que = `${atacante} ${golpe} contra ${defensor} ${respuesta}, semilla ${semilla}`;
            const rng = createRng(semilla);
            const b = crearBatallaConReglas(
              bando([{ creature: atacante, count: n }], { suerte }),
              bando([{ creature: defensor, count: m }]),
              rng,
              reglasDe(0),
              SIN_MURALLA,
              'rueda',
            );
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
