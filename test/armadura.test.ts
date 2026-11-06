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
import {
  equiparEnArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezaNueva,
  piezasDelMontaje,
  VERSION_DEL_ENLACE,
} from '../src/core/arena.js';
import {
  applyAction,
  createBattle,
  opcionesDeDanio,
  stackById,
} from '../src/core/battle/battle.js';
import { expectedDamage } from '../src/core/battle/damage.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { cuerpoConSusCifras } from '../src/core/cuerpo.js';
import { type Pieza, problemasDePieza, validarPieza } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { Equipo, Hex, UnitInfo } from '../src/core/types.js';
import { CUERPO_COMUN } from '../src/core/unidad.js';
import { bandoDe, conManosDePrueba, NORMAL } from './batalla-de-prueba.js';
import { catalogoCon, unidadDeArena } from './pelea-de-arena.js';

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

/** Con la coraza (`barda`): pesa 12 con fuerza 7, −1 de agilidad: defensa 3, 7 de armadura. */
const JINETE_CON_BARDA = vestido(cuerpo('Jinete'), { armadura: 'barda' });

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
  it('un golpe flojo contra la coraza se queda en 0: no quita nada, no lanza y se cuenta parado', () => {
    // 5 con ataque 3 contra defensa 3 (la coraza le quita 1 de agilidad): ×1; 5 − 7 → 0.
    const flojo = cuerpo('Flojo', { damage: [5, 5] });
    const b = frente(flojo, [JINETE_CON_BARDA], PEGADOS[0], PEGADOS[1]);
    const desde = jugar(b, { type: 'attack', target: 'defender-0', ...NORMAL }, createRng(1));
    expect(hechos(b, 'attack', desde)[0]).toMatchObject({ damage: 0, killed: 0, parado: 5 });
    const jinete = stackById(b, 'defender-0');
    expect([jinete.count, jinete.topHp]).toEqual([1, 50]);
    // Ni experiencia: no quitó nada.
    expect(stackById(b, 'attacker-0').ganado.experiencia).toBe(0);
    expect(marcadoDe(renderBattleLog(b, null))).toContain('0 de daño: la armadura para los 5');
  });
});

describe('la IA cuenta con la armadura (`expectedDamage`)', () => {
  it('baja exactamente lo que para, y nunca de 0', () => {
    // Una armadura de la prueba que no pesa ni da defensa: lo único que cambia
    // entre el desnudo y el que la lleva son sus puntos.
    const PETO: Pieza = {
      id: 'peto_de_prueba',
      nombre: 'Peto de prueba',
      hueco: 'armadura',
      seConsigue: [],
      ataque: 0,
      defensa: 0,
      armadura: 4,
      peso: 0,
      precio: 0,
    };
    const conPeto = catalogoCon(PETO).conEquipo(cuerpo('Con peto'), { armadura: PETO.id });
    const desnudo = cuerpo('Desnudo');
    expect(conPeto.defense).toBe(desnudo.defense);
    // Sin las manos de prueba de `frente`, que visten con el catálogo del juego (sin
    // el peto): el daño medio no pide arma, sale de las cifras de cada uno.
    const daño = (quien: UnitInfo, contra: UnitInfo): number => {
      const b = createBattle(
        bandoDe([{ id: 'quien', unit: quien }]),
        bandoDe([{ id: 'contra', unit: contra }]),
        createRng(1),
        COMBATE_COMPLETO,
      );
      const a = stackById(b, 'attacker-0');
      const d = stackById(b, 'defender-0');
      return expectedDamage(a, d, opcionesDeDanio(b, a, d));
    };
    const armadura = PETO.armadura ?? 0;
    const fuerte = cuerpo('Fuerte', { damage: [20, 30] });
    const bruto = daño(fuerte, desnudo);
    expect(bruto).toBeGreaterThan(armadura);
    expect(daño(fuerte, conPeto)).toBeCloseTo(bruto - armadura, 9);
    // Un golpe que la armadura para entero se queda en 0, no en negativo.
    const flojo = cuerpo('Flojo', { damage: [1, 1] });
    expect(daño(flojo, desnudo)).toBeLessThan(armadura);
    expect(daño(flojo, conPeto)).toBe(0);
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
      hechizos: [],
      piezas: piezasDelMontaje(
        [guerrero, arquero],
        [],
        [...catalogoCon(conArmadura).escritas.values()],
      ),
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
});
