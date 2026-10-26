/**
 * La armadura (#262, 14-10-2026): las piezas dan puntos de armadura y ninguna da
 * PV (una sola clase de piezas desde el 18-10-2026), y cada golpe que llega se
 * queda en `max(0, daño − armadura)`, restado lo último (`trasLaArmadura`, dentro
 * de `herir`).
 *
 * Escrito desde los criterios del plan, con las cifras a mano en cada caso. Las
 * unidades son el cuerpo común de la arena (ataque 3, fuerza 7, 50 PV) con lo que se
 * diga; donde el daño no es fijo, el dado va cargado en una punta (`dadoCargado`).
 */

import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { textoDePrevision } from '../src/client/views/prevision.js';
import {
  equiparEnArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezaNueva,
  piezasDelMontaje,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import { armaduraDe, trasLaArmadura } from '../src/core/battle/armas.js';
import {
  applyAction,
  createBattle,
  opcionesDeDanio,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import { expectedDamage, herir } from '../src/core/battle/damage.js';
import { delHeroe, spell } from '../src/core/battle/spells.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { cuerpoConSusCifras } from '../src/core/cuerpo.js';
import { type Pieza, problemasDePieza, validarPieza } from '../src/core/data.js';
import { cifrasDePieza, EQUIPO_DEL_JUEGO, pieza, sumaDeEquipo } from '../src/core/hero/equipo.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { Equipo, Hex, UnitInfo } from '../src/core/types.js';
import { CUERPO_COMUN } from '../src/core/unidad.js';
import { bando, bandoDe, mando } from './batalla-de-prueba.js';
import { catalogoCon, conManosDePrueba, NORMAL, unidadDeArena } from './helpers.js';

/** El cuerpo común de la arena (fuerza 7, agilidad 4) con lo que se cambie. */
function cuerpo(name: string, over: Partial<UnitInfo> = {}): UnitInfo {
  const { attack, fuerza, hp } = CUERPO_COMUN;
  return {
    ...cuerpoConSusCifras({
      name,
      faction: null,
      attack,
      fuerza,
      agilidad: 4,
      defensaPropia: 0,
      hp,
    }),
    ...over,
  };
}

const vestido = (c: UnitInfo, equipo: Equipo): UnitInfo => EQUIPO_DEL_JUEGO.conEquipo(c, equipo);

/** Pega 30 justos (ataque 4): contra defensa 4, ×1. */
const GOLPEADOR = cuerpo('Golpeador', { attack: 4, damage: [30, 30] });
/** Con brigantina (pesa 5, no le resta): defensa 4, 2 de armadura, 50 PV (ninguno de la brigantina). */
const TEMPLARIO = vestido(cuerpo('Templario'), { armadura: 'brigantina' });
/** Con la coraza (`barda`): pesa 12 con fuerza 7, −1 de agilidad: defensa 3, 7 de armadura. */
const JINETE = vestido(cuerpo('Jinete'), { armadura: 'barda' });
/** El de siempre, sin armadura. */
const DESNUDO = cuerpo('Desnudo');

/**
 * `quien` en `en` contra `contra` en `donde` (y los demás defensores detrás), con
 * el turno de `quien`.
 */
function frente(
  quien: UnitInfo,
  contra: readonly UnitInfo[],
  en: Hex,
  donde: readonly Hex[],
): BattleState {
  const b = createBattle(
    bandoDe([{ id: 'quien', unit: quien }]),
    bandoDe(contra.map((unit, i) => ({ id: `contra-${i}`, unit }))),
    createRng(1),
    COMBATE_COMPLETO,
  );
  // En la rueda se golpea con un arma: las manos de prueba, con los niveles de la
  // Espada y sin cifras.
  conManosDePrueba(b);
  stackById(b, 'attacker-0').hex = en;
  donde.forEach((h, i) => {
    stackById(b, `defender-${i}`).hex = h;
  });
  b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
  return b;
}

const PEGADOS = [{ col: 5, row: 4 }, [{ col: 6, row: 4 }]] as const;

type Hecho<K extends BattleEvent['kind']> = Extract<BattleEvent, { kind: K }>;
function hechos<K extends BattleEvent['kind']>(b: BattleState, kind: K, desde = 0): Hecho<K>[] {
  return b.log.slice(desde).filter((e): e is Hecho<K> => e.kind === kind);
}

/** Juega `accion` y devuelve lo que se escribió. */
function jugar(b: BattleState, accion: Parameters<typeof applyAction>[1], rng: Rng): number {
  const desde = b.log.length;
  applyAction(b, accion, rng);
  return desde;
}

describe('las piezas dan armadura, no PV', () => {
  it('las cinco armaduras: PV / 10 de antes en armadura y ningún PV, y ya no dan defensa (pesan)', () => {
    const cifras = (id: string) => {
      const p = pieza(id);
      return ['pv' in p, p.armadura ?? 0, p.defensa];
    };
    expect(cifras('brigantina')).toEqual([false, 2, 0]);
    expect(cifras('arnes_de_placas')).toEqual([false, 3, 0]);
    expect(cifras('gambeson')).toEqual([false, 1, 0]);
    expect(cifras('jubon_de_arquero')).toEqual([false, 1, 0]);
    expect(cifras('barda')).toEqual([false, 7, 0]);
    // Se suma como las demás cifras, y se dice como una más.
    expect(sumaDeEquipo({ armadura: 'barda' })).toEqual({
      ataque: 0,
      fuerza: 0,
      defensa: 0,
      armadura: 7,
      peso: 12,
      montura: null,
      fuerzaDeLaLanza: null,
    });
    expect(cifrasDePieza(pieza('barda'))).toBe('+7 Armadura, Peso 12');
    expect(armaduraDe(JINETE)).toBe(7);
    expect(JINETE.hp).toBe(50);
  });

  it('una pieza con PV no vale; una armadura en negativo, tampoco; sin armadura, la unidad no gana el campo', () => {
    expect(problemasDePieza({ ...pieza('brigantina'), pv: 70 })).toEqual([
      '"brigantina" suma PV: ninguna pieza da PV, se protege con armadura, que se resta de cada golpe',
    ]);
    expect(problemasDePieza({ ...pieza('brigantina'), armadura: -1 })).toEqual([
      '"brigantina": armadura tiene que ser un entero ≥ 0 y es -1',
    ]);
    const campesino = cuerpo('Campesino');
    expect(EQUIPO_DEL_JUEGO.conEquipo(campesino, { arma: 'maza' })).not.toHaveProperty(
      'puntosDeArmadura',
    );
  });
});

describe('cada golpe resta la armadura de quien lo recibe, con mínimo 0', () => {
  it('un golpe de 30 sobre la brigantina quita 28, y el parte dice los 2 que paró', () => {
    const b = frente(GOLPEADOR, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    const desde = jugar(b, { type: 'attack', target: 'defender-0', ...NORMAL }, createRng(1));
    // 30 × 1 (4 contra 4) = 30; 30 − 2 = 28; quedan 50 − 28 = 22.
    expect(hechos(b, 'attack', desde)[0]).toMatchObject({
      stack: 'attacker-0',
      damage: 28,
      killed: 0,
      parado: 2,
    });
    expect(stackById(b, 'defender-0').topHp).toBe(22);
    // Sin armadura, los 30 enteros y el hecho de siempre, sin el campo.
    const sin = frente(GOLPEADOR, [DESNUDO], PEGADOS[0], PEGADOS[1]);
    const d2 = jugar(sin, { type: 'attack', target: 'defender-0', ...NORMAL }, createRng(1));
    expect(hechos(sin, 'attack', d2)[0]).toEqual({
      kind: 'attack',
      stack: 'attacker-0',
      target: 'defender-0',
      damage: 30,
      killed: 0,
      retaliation: false,
      // Normal contra Normal: en el medio de la rueda.
      punto: 2,
    });
    expect(marcadoDe(renderBattleLog(b, null))).toContain(': 28 de daño (−2 armadura), 0 bajas');
  });

  it('un golpe flojo contra la coraza se queda en 0: no quita nada, no lanza y se cuenta parado', () => {
    // 5 con ataque 3 contra defensa 3 (la coraza le quita 1 de agilidad): ×1; 5 − 7 → 0.
    const flojo = cuerpo('Flojo', { damage: [5, 5] });
    const b = frente(flojo, [JINETE], PEGADOS[0], PEGADOS[1]);
    const desde = jugar(b, { type: 'attack', target: 'defender-0', ...NORMAL }, createRng(1));
    expect(hechos(b, 'attack', desde)[0]).toMatchObject({ damage: 0, killed: 0, parado: 5 });
    const jinete = stackById(b, 'defender-0');
    expect([jinete.count, jinete.topHp]).toEqual([1, 50]);
    // Ni experiencia: no quitó nada.
    expect(stackById(b, 'attacker-0').ganado.experiencia).toBe(0);
    expect(marcadoDe(renderBattleLog(b, null))).toContain('0 de daño: la armadura para los 5');
  });

  it('`herir` resta lo último: lo que llega, lo que para y los muertos', () => {
    const b = frente(GOLPEADOR, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    const t = stackById(b, 'defender-0');
    expect(herir(t, 2, null)).toEqual({ muertos: 0, danio: 0, parado: 2 });
    expect(herir(t, 60, null)).toEqual({ muertos: 1, danio: 58, parado: 2 });
    expect(trasLaArmadura(12, { unit: DESNUDO })).toEqual({ danio: 12, parado: 0 });
  });

  it('Rápido resta la armadura en cada uno de sus dos golpes: 30 × 0,63 = 18,9 → 19 → 17 y 17', () => {
    const b = frente(GOLPEADOR, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    const desde = jugar(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'rapido', respuesta: 'normal' },
      createRng(1),
    );
    const mios = hechos(b, 'attack', desde).filter((a) => !a.retaliation);
    expect(mios.map((a) => [a.damage, a.parado])).toEqual([
      [17, 2],
      [17, 2],
    ]);
    expect(stackById(b, 'defender-0').topHp).toBe(50 - 34);
  });

  it('un hechizo de daño resta la armadura del objetivo: la Flecha mágica, menos 2', () => {
    const muneco = vestido(cuerpo('Muñeco', { hp: 5000 }), { armadura: 'brigantina' });
    const heroe = mando({ spells: ['magic_arrow'] });
    const flecha = delHeroe(spell('magic_arrow'), heroe).cantidad;
    const b = createBattle(
      bando([{ creature: 'templario-mandoble', count: 5 }], { heroe }),
      bandoDe([{ id: 'muneco', unit: muneco }]),
      createRng(1),
      COMBATE_COMPLETO,
    );
    b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
    // La barra lo dice como el golpe (A1 de QA): el daño que llega y lo que para.
    const prevista = previsionDe(b, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' });
    expect(prevista).toMatchObject({ danio: flecha - 2, parado: 2 });
    if (prevista === null) throw new Error('la Flecha no se prevé');
    expect(textoDePrevision(prevista, () => 'Muñeco')).toContain(
      `${flecha - 2} de daño (−2 armadura),`,
    );
    const desde = jugar(
      b,
      { type: 'cast', spell: 'magic_arrow', target: 'defender-0' },
      createRng(1),
    );
    expect(hechos(b, 'cast', desde)[0]).toMatchObject({ damage: flecha - 2, parado: 2 });
    expect(stackById(b, 'defender-0').topHp).toBe(5000 - (flecha - 2));
  });

  it('el drenaje de vida cura lo que quitó tras la armadura: 28, no 30', () => {
    // El vampiro (ataque 4), con 10 de sus 50: drena 28 → 38, y el contraataque del
    // templario (Normal, el medio de 7–28: 17, ataque 3 contra defensa 4, ×0,975 →
    // 17) lo deja en 21. Con los 30 de antes habría llegado a 40 y quedado en 23.
    const vampiro = cuerpo('Vampiro', { attack: 4, damage: [30, 30], traits: ['life_drain'] });
    const b = frente(vampiro, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    stackById(b, 'attacker-0').topHp = 10;
    const desde = jugar(b, { type: 'attack', target: 'defender-0', ...NORMAL }, createRng(1));
    const [golpe, devuelto] = hechos(b, 'attack', desde);
    expect(golpe).toMatchObject({ damage: 28, parado: 2 });
    expect(devuelto).toMatchObject({ retaliation: true, damage: 17 });
    expect(stackById(b, 'attacker-0').topHp).toBe(21);
  });
});

describe('la IA cuenta con la armadura (`expectedDamage`)', () => {
  it('baja exactamente lo que para, y nunca de 0', () => {
    const daño = (quien: UnitInfo, contra: UnitInfo): number => {
      const b = frente(quien, [contra], PEGADOS[0], PEGADOS[1]);
      const a = stackById(b, 'attacker-0');
      const d = stackById(b, 'defender-0');
      return expectedDamage(a, d, opcionesDeDanio(b, a, d));
    };
    expect(daño(GOLPEADOR, DESNUDO)).toBe(30);
    expect(daño(GOLPEADOR, TEMPLARIO)).toBe(28);
    // 5 × 1, y la coraza para 7: 0, no −2.
    expect(daño(cuerpo('Flojo', { damage: [5, 5] }), JINETE)).toBe(0);
  });
});

describe('una pieza con PV no vale: ni se convierte ni se avisa (14-10-2026)', () => {
  /** Una pieza nueva para el hueco de armadura, como la escribía la arena de antes. */
  const peto = { ...(piezaNueva('armadura', EQUIPO_DEL_JUEGO) as Pieza), nombre: 'Peto' };
  const MOTIVO = '«Peto» suma PV: ninguna pieza da PV';

  it('pieza a pieza no vale, con su motivo, y no se convierte', () => {
    const { armadura: _, ...sinCifras } = peto;
    expect(() => validarPieza({ ...sinCifras, pv: 45 })).toThrow(MOTIVO);
  });

  it('en un enlace de hoy se rechaza; uno de una versión de antes, por viejo', () => {
    const conArmadura = validarPieza({ ...peto, armadura: 5 });
    const guerrero = equiparEnArena(
      unidadDeArena('templario-escudo'),
      conArmadura.id,
      catalogoCon(conArmadura),
    );
    const lado = (unidad: string, ia: boolean) => ({
      ia,
      puestos: [{ unidad, escalera: false }],
      heroe: null,
    });
    const arquero = unidadDeArena('goblin-arquero');
    const ENLACE: MontajeDelEnlace = {
      unidades: [guerrero, arquero],
      piezas: piezasDelMontaje([guerrero, arquero], false, [
        ...catalogoCon(conArmadura).escritas.values(),
      ]),
      izquierda: lado(guerrero.id, false),
      derecha: lado('goblin-arquero', true),
      muralla: null,
      combate: COMBATE_COMPLETO,
    };
    const o = JSON.parse(montajeALaURL(ENLACE));
    expect(o.v).toBe(VERSION_DEL_ENLACE);
    const conPV = {
      ...o,
      piezas: o.piezas.map((p: { id: string; armadura?: number }) => {
        if (p.id !== conArmadura.id) return p;
        const { armadura: _, ...sinArmadura } = p;
        return { ...sinArmadura, pv: 45 };
      }),
    };
    expect(() => montajeDeLaURL(JSON.stringify(conPV))).toThrow(MOTIVO);
    expect(() => montajeDeLaURL(JSON.stringify({ ...conPV, v: 9 }))).toThrow(
      `este enlace es de una versión anterior de la arena (la 9; la de hoy es la ${VERSION_DEL_ENLACE}): vuelve a copiarlo`,
    );
  });

  it('la armadura tiene tope (A4 de QA): lo juzga el catálogo, también la de una pieza con base', () => {
    expect(catalogoCon({ ...peto, armadura: 99 }).pieza(peto.id)).toMatchObject({
      armadura: 99,
    });
    expect(() => validarPieza({ ...peto, armadura: 1000 })).toThrow(
      '«Peto»: la armadura va de 0 a 99 y es 1000',
    );
    // Sobre la coraza (7), +95 pasa del tope: la resuelta no vale.
    const sobre = {
      id: 'barda-2',
      nombre: 'Coraza reforzada',
      base: 'barda',
      seConsigue: [],
      extras: { armadura: 95 },
    };
    expect(() => catalogoCon(sobre)).toThrow(
      '«Coraza reforzada» (sobre «Coraza»): la armadura va de 0 a 99 y es 102',
    );
  });
});
