/**
 * La armadura de la arena (#262, 14-10-2026): las piezas de calidad `arena` dan
 * puntos de armadura en vez de PV, y cada golpe que llega se queda en
 * `max(0, daño − armadura)`, restado lo último (`trasLaArmadura`, dentro de
 * `herir`). El juego no cambia: sus piezas no la llevan.
 *
 * Escrito desde los criterios del plan, con las cifras a mano en cada caso. Las
 * unidades son el cuerpo común de la arena (3 / 3, 10–10, 80 PV) con lo que se
 * diga; donde el daño no es fijo, el dado va cargado en una punta (`dadoCargado`).
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { renderBattleLog } from '../src/client/views/panels.js';
import { textoDePrevision } from '../src/client/views/prevision.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import {
  batallaDeArena,
  catalogoDeLaArena,
  equiparEnArena,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  piezaNueva,
  revisarBorradorDeEquipo,
  validarPiezaDeArena,
} from '../src/core/arena.js';
import { armaduraDe, trasLaArmadura } from '../src/core/battle/armas.js';
import {
  applyAction,
  crearBatallaConReglas,
  opcionesDeDanio,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import { expectedDamage, herir } from '../src/core/battle/damage.js';
import { MODOS_DEL_JUEGO } from '../src/core/battle/modos.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import { delHeroe, spell } from '../src/core/battle/spells.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { type Pieza, problemasDePieza } from '../src/core/data.js';
import { cifrasDePieza, EQUIPO_DEL_JUEGO, pieza, sumaDeEquipo } from '../src/core/hero/equipo.js';
import { createRng, type Rng } from '../src/core/rng.js';
import type { EquipoDeArena, Hex, UnitInfo } from '../src/core/types.js';
import { CUERPO_COMUN } from '../src/core/unidad.js';
import { bando, bandoDe, mando } from './batalla-de-prueba.js';
import {
  conManosDePrueba,
  DEL_JUEGO,
  dadoCargado,
  delBorrador,
  MONTAJE,
  unidadDeArena,
} from './helpers.js';

/** El cuerpo común de la arena con lo que se cambie. */
function cuerpo(name: string, over: Partial<UnitInfo> = {}): UnitInfo {
  const { attack, defense, damage, hp } = CUERPO_COMUN;
  return { name, faction: null, attack, defense, damage, hp, speed: 'average', ...over };
}

const vestido = (c: UnitInfo, equipo: EquipoDeArena): UnitInfo =>
  EQUIPO_DEL_JUEGO.conEquipo(c, equipo);

/** Pega 50 justos (ataque 3): contra defensa 3, ×1. */
const GOLPEADOR = cuerpo('Golpeador', { damage: [50, 50] });
/** Con brigantina: defensa 3, 7 de armadura, 80 PV (ninguno de la brigantina). */
const TEMPLARIO = vestido(cuerpo('Templario'), { armadura: 'brigantina' });
/** Con barda: defensa 3 + 5, 22 de armadura. */
const JINETE = vestido(cuerpo('Jinete'), { armadura: 'barda' });
/** El de siempre, sin armadura. */
const DESNUDO = cuerpo('Desnudo');

/**
 * `quien` en `en` contra `contra` en `donde` (y los demás defensores detrás), con
 * el turno de `quien`; con la rueda si se pide (con las manos de prueba). Sin
 * moral, que regala turnos.
 */
function frente(
  quien: UnitInfo,
  contra: readonly UnitInfo[],
  en: Hex,
  donde: readonly Hex[],
  rueda = false,
): BattleState {
  const b = crearBatallaConReglas(
    bandoDe([{ id: 'quien', unit: quien }]),
    bandoDe(contra.map((unit, i) => ({ id: `contra-${i}`, unit }))),
    createRng(1),
    REGLAS_DEL_JUEGO,
    { modos: { ...MODOS_DEL_JUEGO, golpe: rueda ? 'rueda' : 'azar' } },
  );
  // En la rueda se golpea con un arma de la arena: las manos de prueba, con los
  // niveles de la Espada y sin cifras.
  if (rueda) conManosDePrueba(b);
  stackById(b, 'attacker-0').hex = en;
  donde.forEach((h, i) => {
    stackById(b, `defender-${i}`).hex = h;
  });
  for (const s of b.stacks) s.morale = 0;
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

describe('las piezas de la arena dan armadura, no PV', () => {
  it('las cinco armaduras de la arena: PV / 10 de armadura y ningún PV; la defensa se queda', () => {
    const cifras = (id: string) => {
      const p = pieza(id);
      return [p.pv, p.armadura ?? 0, p.defensa];
    };
    expect(cifras('brigantina')).toEqual([0, 7, 0]);
    expect(cifras('arnes_de_placas')).toEqual([0, 10, 1]);
    expect(cifras('gambeson')).toEqual([0, 4, 1]);
    expect(cifras('jubon_de_arquero')).toEqual([0, 2, 0]);
    expect(cifras('barda')).toEqual([0, 22, 5]);
    // Se suma como las demás cifras, y se dice como una más.
    expect(sumaDeEquipo({ armadura: 'barda' })).toMatchObject({ pv: 0, armadura: 22, defensa: 5 });
    expect(cifrasDePieza(pieza('barda'))).toBe('+5 Defensa, +22 Armadura');
    expect(armaduraDe(JINETE)).toBe(22);
    expect(JINETE.hp).toBe(80);
  });

  it('el juego no la lleva: una pieza que no es de la arena con armadura, o una de la arena con PV, no vale', () => {
    expect(problemasDePieza({ ...pieza('cota_de_malla'), armadura: 1 })).toEqual([
      '"cota_de_malla" es de calidad armeria y lleva armadura: la armadura es solo de la arena; fuera de ella, la pieza suma PV',
    ]);
    expect(problemasDePieza({ ...pieza('brigantina'), pv: 70 })).toEqual([
      '"brigantina" es de la arena y suma 70 PV: en la arena se protege con armadura, que se resta de cada golpe, no con PV',
    ]);
    expect(problemasDePieza({ ...pieza('brigantina'), armadura: -1 })).toEqual([
      '"brigantina": armadura tiene que ser un entero ≥ 0 y es -1',
    ]);
    // Sin armadura, la unidad del juego sale con los campos de siempre (el banco).
    const campesino = cuerpo('Campesino');
    expect(EQUIPO_DEL_JUEGO.conEquipo(campesino, { armadura: 'cuero_curtido' })).not.toHaveProperty(
      'puntosDeArmadura',
    );
  });
});

describe('cada golpe resta la armadura de quien lo recibe, con mínimo 0', () => {
  it('un golpe de 50 sobre la brigantina quita 43, y el parte dice los 7 que paró', () => {
    const b = frente(GOLPEADOR, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    const desde = jugar(b, { type: 'attack', target: 'defender-0' }, createRng(1));
    // 50 × 1 (3 contra 3) = 50; 50 − 7 = 43; quedan 80 − 43 = 37.
    expect(hechos(b, 'attack', desde)[0]).toMatchObject({
      stack: 'attacker-0',
      damage: 43,
      killed: 0,
      parado: 7,
    });
    expect(stackById(b, 'defender-0').topHp).toBe(37);
    // Sin armadura, los 50 enteros y el hecho de siempre, sin el campo.
    const sin = frente(GOLPEADOR, [DESNUDO], PEGADOS[0], PEGADOS[1]);
    const d2 = jugar(sin, { type: 'attack', target: 'defender-0' }, createRng(1));
    expect(hechos(sin, 'attack', d2)[0]).toEqual({
      kind: 'attack',
      stack: 'attacker-0',
      target: 'defender-0',
      damage: 50,
      killed: 0,
      retaliation: false,
    });
    expect(marcadoDe(renderBattleLog(b, null))).toContain(': 43 de daño (−7 armadura), 0 bajas');
  });

  it('un golpe flojo contra la barda se queda en 0: no quita nada, no lanza y se cuenta parado', () => {
    // 20 con ataque 3 contra defensa 8: ×(1 − 5 × 0,025) = ×0,875 → 17,5 → 18; 18 − 22 → 0.
    const flojo = cuerpo('Flojo', { damage: [20, 20] });
    const b = frente(flojo, [JINETE], PEGADOS[0], PEGADOS[1]);
    const desde = jugar(b, { type: 'attack', target: 'defender-0' }, createRng(1));
    expect(hechos(b, 'attack', desde)[0]).toMatchObject({ damage: 0, killed: 0, parado: 18 });
    const jinete = stackById(b, 'defender-0');
    expect([jinete.count, jinete.topHp]).toEqual([1, 80]);
    // Ni experiencia: no quitó nada.
    expect(stackById(b, 'attacker-0').ganado.experiencia).toBe(0);
    expect(marcadoDe(renderBattleLog(b, null))).toContain('0 de daño: la armadura para los 18');
  });

  it('`herir` resta lo último: lo que llega, lo que para y los muertos', () => {
    const b = frente(GOLPEADOR, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    const t = stackById(b, 'defender-0');
    expect(herir(t, 5, null)).toEqual({ muertos: 0, danio: 0, parado: 5 });
    expect(herir(t, 90, null)).toEqual({ muertos: 1, danio: 83, parado: 7 });
    expect(trasLaArmadura(12, { unit: DESNUDO })).toEqual({ danio: 12, parado: 0 });
  });

  it('Rápido resta la armadura en cada uno de sus dos golpes: 50 × 0,63 = 31,5 → 32 → 25 y 25', () => {
    const b = frente(GOLPEADOR, [TEMPLARIO], PEGADOS[0], PEGADOS[1], true);
    const desde = jugar(
      b,
      { type: 'attack', target: 'defender-0', golpe: 'rapido', respuesta: 'normal' },
      createRng(1),
    );
    const mios = hechos(b, 'attack', desde).filter((a) => !a.retaliation);
    expect(mios.map((a) => [a.damage, a.parado])).toEqual([
      [25, 7],
      [25, 7],
    ]);
    expect(stackById(b, 'defender-0').topHp).toBe(80 - 50);
  });

  it('el disparo doble resta en cada tiro: con el arco, 30 × 1,2 = 36 → 29 y 29', () => {
    // Cuerpo + arco: ataque 5, 20–30 al disparar; contra defensa 3, ×1,2. Al máximo.
    const tirador = vestido(cuerpo('Tirador', { traits: ['double_shot'] }), { distancia: 'arco' });
    const b = frente(tirador, [TEMPLARIO], { col: 1, row: 4 }, [{ col: 4, row: 4 }]);
    const desde = jugar(b, { type: 'shoot', target: 'defender-0' }, dadoCargado('maximo'));
    expect(hechos(b, 'shoot', desde).map((s) => [s.damage, s.parado])).toEqual([
      [29, 7],
      [29, 7],
    ]);
    expect(stackById(b, 'defender-0').topHp).toBe(80 - 58);
  });

  it('la salpicadura reparte el disparo y cada salpicado resta su propia armadura', () => {
    // El disparo al templario: 36 → 29. El jinete pegado a él recibe los 36 del
    // disparo (la salpicadura no vuelve a tirar) menos su barda: 14.
    const liche = vestido(cuerpo('Liche', { traits: ['splash_shot'] }), { distancia: 'arco' });
    const b = frente(liche, [TEMPLARIO, JINETE], { col: 1, row: 4 }, [
      { col: 4, row: 4 },
      { col: 5, row: 4 },
    ]);
    const desde = jugar(b, { type: 'shoot', target: 'defender-0' }, dadoCargado('maximo'));
    expect(hechos(b, 'shoot', desde).map((s) => [s.target, s.damage, s.parado, s.splash])).toEqual([
      ['defender-0', 29, 7, undefined],
      ['defender-1', 14, 22, true],
    ]);
  });

  it('un hechizo de daño resta la armadura del objetivo: la Flecha mágica, menos 7', () => {
    const muneco = vestido(cuerpo('Muñeco', { hp: 5000 }), { armadura: 'brigantina' });
    const heroe = mando({ spells: ['magic_arrow'] });
    const flecha = delHeroe(spell('magic_arrow'), heroe).cantidad;
    const b = crearBatallaConReglas(
      bando([{ creature: 'swordsman', count: 5 }], { heroe }),
      bandoDe([{ id: 'muneco', unit: muneco }]),
      createRng(1),
      REGLAS_DEL_JUEGO,
    );
    b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
    // La barra lo dice como el golpe (A1 de QA): el daño que llega y lo que para.
    const prevista = previsionDe(b, { type: 'cast', spell: 'magic_arrow', target: 'defender-0' });
    expect(prevista).toMatchObject({ danio: flecha - 7, parado: 7 });
    if (prevista === null) throw new Error('la Flecha no se prevé');
    expect(textoDePrevision(prevista, () => 'Muñeco')).toContain(
      `${flecha - 7} de daño (−7 armadura),`,
    );
    const desde = jugar(
      b,
      { type: 'cast', spell: 'magic_arrow', target: 'defender-0' },
      createRng(1),
    );
    expect(hechos(b, 'cast', desde)[0]).toMatchObject({ damage: flecha - 7, parado: 7 });
    expect(stackById(b, 'defender-0').topHp).toBe(5000 - (flecha - 7));
  });

  it('el drenaje de vida cura lo que quitó tras la armadura: 43, no 50', () => {
    // El vampiro, con 30 de sus 80: drena 43 → 73, y el contraataque del templario
    // (10 × 1) lo deja en 63. Con los 50 de antes habría llegado a 80 y quedado en 70.
    const vampiro = cuerpo('Vampiro', { damage: [50, 50], traits: ['life_drain'] });
    const b = frente(vampiro, [TEMPLARIO], PEGADOS[0], PEGADOS[1]);
    stackById(b, 'attacker-0').topHp = 30;
    const desde = jugar(b, { type: 'attack', target: 'defender-0' }, createRng(1));
    const [golpe, devuelto] = hechos(b, 'attack', desde);
    expect(golpe).toMatchObject({ damage: 43, parado: 7 });
    expect(devuelto).toMatchObject({ retaliation: true, damage: 10 });
    expect(stackById(b, 'attacker-0').topHp).toBe(63);
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
    expect(daño(GOLPEADOR, DESNUDO)).toBe(50);
    expect(daño(GOLPEADOR, TEMPLARIO)).toBe(43);
    // 20 × 0,875 = 17,5, y la barda para 22: 0, no −4,5.
    expect(daño(cuerpo('Flojo', { damage: [20, 20] }), JINETE)).toBe(0);
  });

  it('el goblin de la IA dispara al monje, no a la barda que le para la flecha (QA, Q1)', () => {
    // El hermano de carga con barda (80 PV, 22 de armadura) parecía el blanco más
    // rentable por amenaza / PV, y el goblin le tiraba en 40 de 40 semillas para 0.
    const elegidos = new Set<string>();
    const sinArmadura = new Set<string>();
    for (let semilla = 1; semilla <= 10; semilla++) {
      for (const [jinete, anota] of [
        [unidadDeArena('templario-hermano-de-carga'), elegidos],
        // El mismo jinete sin la barda: el factor no está y sigue mandando la vida.
        [
          unidadDeArena('templario-hermano-de-carga', {
            equipo: { arma: 'espada', carga: 'lanza_de_jinete' },
          }),
          sinArmadura,
        ],
      ] as const) {
        const b = batallaDeArena(
          {
            izquierda: { unidades: [delBorrador(unidadDeArena('goblin-arquero'))], heroe: null },
            derecha: {
              unidades: [delBorrador(jinete), delBorrador(unidadDeArena('templario-monje'))],
              heroe: null,
            },
            ...MONTAJE,
          },
          createRng(semilla),
        );
        b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
        const accion = chooseBattleAction(b);
        expect(accion.type).toBe('shoot');
        if (accion.type === 'shoot') anota.add(stackById(b, accion.target).body ?? '');
      }
    }
    expect([...elegidos]).toEqual(['templario-monje']);
    expect([...sinArmadura]).toEqual(['templario-hermano-de-carga']);
  });
});

describe('una pieza de la arena con PV no vale: ni se convierte ni se avisa (14-10-2026)', () => {
  /** Una pieza nueva de la arena para el hueco de armadura, como la escribía la arena de antes. */
  const peto = { ...(piezaNueva('armadura', DEL_JUEGO) as Pieza), nombre: 'Peto' };
  const MOTIVO = '«Peto» es de la arena y suma 45 PV: en la arena se protege con armadura';

  it('en el borrador sale como que no vale, con su motivo, y no se convierte', () => {
    const { pv: _, armadura: __, ...sinCifras } = peto;
    const crudo = { ...sinCifras, pv: 45 };
    const r = revisarBorradorDeEquipo({ piezas: [crudo] });
    expect(r.validas).toEqual([]);
    expect(r.invalidas).toHaveLength(1);
    expect(r.invalidas[0]?.crudo).toBe(crudo);
    expect(r.invalidas[0]?.motivo).toContain(MOTIVO);
  });

  it('en un enlace de hoy se rechaza; uno de la versión 8 se rechaza por viejo', () => {
    const conArmadura = validarPiezaDeArena({ ...peto, armadura: 5 });
    const guerrero = equiparEnArena(
      unidadDeArena('templario-escudo'),
      conArmadura.id,
      catalogoDeLaArena([conArmadura]),
    );
    const lado = (unidad: string, ia: boolean) => ({
      ia,
      puestos: [{ unidad, escalera: false }],
      heroe: null,
    });
    const ENLACE: MontajeDelEnlace = {
      unidades: [guerrero, unidadDeArena('goblin-arquero')],
      piezas: [conArmadura],
      izquierda: lado(guerrero.id, false),
      derecha: lado('goblin-arquero', true),
      muralla: null,
    };
    const o = JSON.parse(montajeALaURL(ENLACE));
    expect(o.v).toBe(11);
    const { armadura: _, ...sinArmadura } = o.piezas[0];
    const conPV = { ...o, piezas: [{ ...sinArmadura, pv: 45 }] };
    expect(() => montajeDeLaURL(JSON.stringify(conPV))).toThrow(MOTIVO);
    expect(() => montajeDeLaURL(JSON.stringify({ ...conPV, v: 9 }))).toThrow(
      'este enlace es de una versión anterior de la arena (la 9; la de hoy es la 11): vuelve a copiarlo',
    );
  });

  it('una pieza del juego que suma PV no se duplica en la arena: solo se parte de las suyas (18-10-2026)', () => {
    // Antes la copia pasaba los PV a armadura (`armaduraDePV`, ya borrada); el editor
    // ya no enseña las del juego, y el núcleo lo dice si se le pide.
    expect(() => piezaNueva(pieza('cuero_curtido'), DEL_JUEGO)).toThrow(
      '«Cuero curtido» es una pieza del juego: en la arena solo se parte de una pieza de la arena',
    );
    expect(() => validarPiezaDeArena({ ...pieza('cuero_curtido'), pv: 0 })).toThrow(
      'en la arena solo se cambian las piezas de la arena',
    );
  });

  it('la armadura tiene tope (A4 de QA): lo juzga el catálogo, también la de una pieza con base', () => {
    expect(catalogoDeLaArena([{ ...peto, armadura: 99 }]).pieza(peto.id)).toMatchObject({
      armadura: 99,
    });
    expect(() => catalogoDeLaArena([{ ...peto, armadura: 1000 }])).toThrow(
      '«Peto»: la armadura va de 0 a 99 y es 1000',
    );
    // Sobre la barda (22), +80 pasa del tope: la resuelta no vale.
    const sobre = {
      id: 'barda-2',
      nombre: 'Barda reforzada',
      base: 'barda',
      extras: { armadura: 80 },
    };
    expect(() => catalogoDeLaArena([sobre])).toThrow(
      '«Barda reforzada» (sobre «Barda»): la armadura va de 0 a 99 y es 102',
    );
  });
});
