/**
 * Cada arma para lo suyo (13-10-2026, solo la arena): una unidad lleva un arma de
 * cuerpo a cuerpo (`arma`), una a distancia (`distancia`) y una de carga
 * (`carga`), y cada golpe va con las cifras de la suya (`usoDelGolpe`,
 * `cifrasDelGolpe`). Se escribe desde los criterios: el disparo con el arco, el
 * golpe y el contraataque con la daga, la carga con la lanza (o, sin ella, con la
 * espada); sin arma de cuerpo a cuerpo, en la arena no se monta y el juego (sin
 * armas por uso) pega con sus cifras; y las reglas que dependen del arma —la rueda,
 * el castigo del tirador de fheroes2— siguen valiendo.
 *
 * Las cifras se esperan escritas, no calculadas con la fórmula: con el dado
 * cargado en cada punta (`dadoCargado`) el golpe da su mínimo y su máximo, y la
 * cuenta está en el comentario de cada caso.
 */

import { describe, expect, it } from 'vitest';
import { textoDePrevision } from '../src/client/views/prevision.js';
import { golpeDe } from '../src/core/battle/armas.js';
import {
  applyAction,
  createBattle,
  legalActions,
  type PrevisionDeGolpe,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import { hexEquals } from '../src/core/battle/board.js';
import { CARGA } from '../src/core/battle/carga.js';
import { cifrasDeLosNiveles } from '../src/core/battle/cifras-de-la-rueda.js';
import {
  armasDe,
  computeDamage,
  expectedDamage,
  horquillaDeDanio,
  usoDelGolpe,
} from '../src/core/battle/damage.js';
import { RUEDAS } from '../src/core/battle/formas-de-la-rueda.js';
import { cruceDelGolpe } from '../src/core/battle/rueda.js';
import type { BattleAction, BattleEvent, BattleState } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { cuerpoConSusCifras } from '../src/core/cuerpo.js';
import { isShooter, type Pieza } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { Equipo, Hex, UnitInfo } from '../src/core/types.js';
import { armaDeCuerpoBlocker, CUERPO_COMUN, nivelesDeLaEspada } from '../src/core/unidad.js';
import { bandoDe } from './batalla-de-prueba.js';
import { catalogoCon, dadoCargado, MANOS_DE_PRUEBA } from './helpers.js';

/** Las cifras de la rueda con la Espada de la arena (`data/equipo.json`): las de un arma versátil. */
const CON_LA_ESPADA = cifrasDeLosNiveles(nivelesDeLaEspada());

/** El cuerpo común de la arena (`CUERPO_COMUN`): ataque 3, fuerza 7, 50 PV, con su agilidad. */
function cuerpo(agilidad = 4, traits: UnitInfo['traits'] = []): UnitInfo {
  const { attack, fuerza, hp } = CUERPO_COMUN;
  return cuerpoConSusCifras({
    name: 'Cuerpo',
    faction: null,
    attack,
    fuerza,
    agilidad,
    defensaPropia: 0,
    hp,
    traits,
  });
}

const vestido = (c: UnitInfo, equipo: Equipo, name: string): UnitInfo => ({
  ...EQUIPO_DEL_JUEGO.conEquipo(c, equipo),
  name,
});

/**
 * Daga (+0 ataque, +2 fuerza) para pegar, arco (+2, +3) para disparar, jubón (1 de
 * armadura): pesa 2, menos que su fuerza 7, y se queda con su agilidad 4.
 */
const ARQUERO = vestido(
  cuerpo(),
  { arma: 'daga', distancia: 'arco', armadura: 'jubon_de_arquero' },
  'Arquero',
);
/**
 * Espada (+3, +3) y lanza de jinete (+3, +4), dos armas: de cada cifra, la mejor
 * (ataque +3, fuerza +4); coraza (`barda`, 7 de armadura) y caballo de guerra
 * (fuerza 16, agilidad 6): el caballo carga los 15 de lo puesto y sus 3 (18 frente a
 * 16, no resta), anda 6 y el jinete pelea con su agilidad entera, 4. La carga con
 * lanza, con la fuerza del caballo: (16 + 4) × [1, 4] = 20–80 (26-10-2026).
 */
const JINETE = vestido(
  cuerpo(4),
  { arma: 'espada', segunda: 'lanza', armadura: 'barda', montura: 'caballo_de_guerra' },
  'Jinete',
);
const JINETE_SIN_LANZA = vestido(
  cuerpo(4),
  { arma: 'espada', armadura: 'barda', montura: 'caballo_de_guerra' },
  'Jinete sin lanza',
);
/**
 * El blanco: defensa 4 (uno más que el ataque de la daga), mucha vida y un golpe de 1, con
 * las manos de prueba (que no suman nada) para devolver el golpe en la rueda.
 */
const MUNECO: UnitInfo = catalogoCon(MANOS_DE_PRUEBA).conEquipo(
  // Fuerza 1 y agilidad 1: un golpe de 1; con 3 de defensa propia, defensa 4.
  cuerpoConSusCifras({
    name: 'Muñeco',
    faction: null,
    attack: 4,
    fuerza: 1,
    agilidad: 1,
    defensaPropia: 3,
    hp: 5000,
  }),
  { arma: MANOS_DE_PRUEBA.id },
);

/** Uno contra uno: `quien` en `en`, el muñeco en `contra`, y el turno de `quien`. */
function frente(quien: UnitInfo, en: Hex, contra: Hex): BattleState {
  const b = createBattle(
    bandoDe([{ id: 'quien', unit: quien }]),
    bandoDe([{ id: 'muneco', unit: MUNECO }]),
    createRng(1),
    COMBATE_COMPLETO,
  );
  stackById(b, 'attacker-0').hex = en;
  stackById(b, 'defender-0').hex = contra;
  b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
  return b;
}

/** Al revés: el muñeco pega a `quien`, que devuelve el golpe. */
function recibe(quien: UnitInfo): BattleState {
  const b = createBattle(
    bandoDe([{ id: 'muneco', unit: MUNECO }]),
    bandoDe([{ id: 'quien', unit: quien }]),
    createRng(1),
    COMBATE_COMPLETO,
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
  return b;
}

/** El golpe a `defender-0` desde `desde` (sin moverse si no se dice). */
function golpe(b: BattleState, desde?: Hex): BattleAction {
  const a = legalActions(b).find(
    (x) =>
      x.type === 'attack' &&
      x.target === 'defender-0' &&
      (desde === undefined
        ? x.from === undefined
        : x.from !== undefined && hexEquals(x.from, desde)),
  );
  if (a === undefined) throw new Error('no se puede golpear como se pide');
  return a;
}

/**
 * El golpe cuerpo a cuerpo pasa por la rueda (siempre, desde el 19-10-2026), y
 * cae en una punta del cruce: Finta contra Finta en el mínimo y contra Romper
 * guardia, su opuesta, en el máximo; ninguna de las dos cambia el daño ni el
 * ataque de este golpe. El contraataque cae en la contraria.
 */
const EN_LA_PUNTA = {
  minimo: { golpe: 'finta', respuesta: 'finta' },
  maximo: { golpe: 'finta', respuesta: 'romperGuardia' },
} as const;

/**
 * El daño del primer golpe propio y el del contraataque, jugada la acción en la
 * punta `punta`: el disparo con el dado cargado; el golpe, con la rueda en ella
 * (`EN_LA_PUNTA`), y su contraataque en la contraria.
 */
function jugar(
  b: () => BattleState,
  accion: (b: BattleState) => BattleAction,
  punta: 'minimo' | 'maximo',
): { readonly golpe: number; readonly devuelto: number | null; readonly carga: number } {
  const estado = b();
  const desde = estado.log.length;
  const a = accion(estado);
  applyAction(
    estado,
    a.type === 'attack' ? { ...a, ...EN_LA_PUNTA[punta] } : a,
    dadoCargado(punta),
  );
  const nuevo: BattleEvent[] = estado.log.slice(desde);
  const mio = nuevo.find((e) => e.kind === 'attack' && !e.retaliation);
  if (mio === undefined || mio.kind !== 'attack') throw new Error('no hubo golpe');
  const devuelto = nuevo.find((e) => e.kind === 'attack' && e.retaliation);
  return {
    golpe: mio.damage,
    devuelto: devuelto?.kind === 'attack' ? devuelto.damage : null,
    carga: mio.charge ?? 0,
  };
}

/** Mínimo y máximo de lo que da `accion`, y lo que prevé la previsión. */
function puntas(
  b: () => BattleState,
  accion: (b: BattleState) => BattleAction,
): { readonly visto: readonly [number, number]; readonly previsto: PrevisionDeGolpe } {
  const estado = b();
  const p = previsionDe(estado, accion(estado));
  if (p === null || (p.kind !== 'golpe' && p.kind !== 'disparo'))
    throw new Error('sin previsión de golpe');
  return {
    visto: [jugar(b, accion, 'minimo').golpe, jugar(b, accion, 'maximo').golpe],
    previsto: p,
  };
}

describe('cada arma para lo suyo: cada golpe con las cifras de su arma (13-10-2026)', () => {
  it('pega y devuelve el golpe con la daga: ataque 3 contra 4 (×0,975), 9–35', () => {
    const b = () => frente(ARQUERO, { col: 5, row: 4 }, { col: 6, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e));
    expect(visto).toEqual([9, 35]);
    expect(previsto.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    // Y al recibir un golpe lo devuelve con la daga, no con el arco.
    const alReves = () => recibe(ARQUERO);
    // El contraataque cae en la punta contraria a la del golpe.
    expect(jugar(alReves, (e) => golpe(e), 'maximo').devuelto).toBe(9);
    expect(jugar(alReves, (e) => golpe(e), 'minimo').devuelto).toBe(35);
    const p = previsionDe(alReves(), golpe(alReves()));
    if (p === null || p.kind !== 'golpe') throw new Error('sin previsión');
    expect([p.contraataque?.danio.min, p.contraataque?.danio.max]).toEqual([9, 35]);
    expect(p.contraataque?.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    // Y la barra lo nombra (H3 del QA): la misma frase de `DICHO_DEL_USO`.
    expect(p.contraataque?.conArma).toBe('con Daga (cuerpo a cuerpo)');
    expect(textoDePrevision(p, (id) => id)).toContain(
      'Contraataque con Daga (cuerpo a cuerpo): 9–35.',
    );
  });

  it('el jinete carga 3 casillas con la lanza y la fuerza del caballo: ataque 6 contra 4 (×1,2) y +15 %, 20–80 → 28–110', () => {
    const b = () => frente(JINETE, { col: 3, row: 4 }, { col: 7, row: 4 });
    const desde = { col: 6, row: 4 };
    expect(jugar(b, (e) => golpe(e, desde), 'minimo').carga).toBe(3);
    const { visto, previsto } = puntas(b, (e) => golpe(e, desde));
    expect(visto).toEqual([28, 110]);
    expect(previsto.modificadores.map((m) => m.causa)).toEqual([
      'con Espada y Lanza de jinete, montado en Caballo de guerra (en la carga)',
      'ataque 6 contra defensa 4',
      'carga de 3 casillas montada',
    ]);
    // Sin carga (pegado), con las mismas dos armas: 6 contra 4 (×1,2), 11–44 → 13–53.
    const pegado = () => frente(JINETE, { col: 6, row: 4 }, { col: 7, row: 4 });
    expect(puntas(pegado, (e) => golpe(e)).visto).toEqual([13, 53]);
    // Y devuelve el golpe con las dos (25-10-2026: la lanza es un arma más).
    const alReves = () => recibe(JINETE);
    expect(jugar(alReves, (e) => golpe(e), 'maximo').devuelto).toBe(13);
    expect(jugar(alReves, (e) => golpe(e), 'minimo').devuelto).toBe(53);
    // Y la barra de quien le pega lo dice (H3 del QA).
    const p = previsionDe(alReves(), golpe(alReves()));
    if (p === null || p.kind !== 'golpe') throw new Error('sin previsión');
    expect(p.contraataque?.conArma).toBe('con Espada y Lanza de jinete (cuerpo a cuerpo)');
  });

  it('montado sin lanza carga con la espada (+15 %), sin la fuerza del caballo: 10–40 ×1,2 ×1,15 → 14–55', () => {
    // 26-10-2026: la carga montada pide la montura de guerra y una lanza puestas.
    const b = () => frente(JINETE_SIN_LANZA, { col: 3, row: 4 }, { col: 7, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e, { col: 6, row: 4 }));
    expect(visto).toEqual([14, 55]);
    // La Espada de la arena lleva rueda (vuelta 2): hay armas por uso y se dice con
    // cuál, aunque no lleve lanza.
    expect(previsto.modificadores[0]?.causa).toBe('con Espada (en la carga)');
  });

  it('sin arma de cuerpo a cuerpo: en la arena no se monta; el juego, sin armas por uso, pega con sus cifras', () => {
    // La arena: el jinete sin arma no se monta (18-10-2026: «sin arma no se combate»).
    expect(armaDeCuerpoBlocker({ distancia: 'arco', armadura: 'barda' })).toMatch(
      /^no lleva arma de cuerpo a cuerpo/,
    );
    // Sin `armas`, `golpeDe` cae en las cifras de arriba sin nombrar arma; pero sin
    // arma con rueda no se golpea (desde el 19-10-2026 toda batalla va con la rueda):
    // es un fallo, y se dice.
    const juego = cuerpo();
    expect(juego.armas).toBeUndefined();
    expect(golpeDe(juego, 'arma')).toEqual({ piezas: [], attack: 3, damage: [7, 28] });
    const b = frente(juego, { col: 6, row: 4 }, { col: 7, row: 4 });
    expect(() =>
      applyAction(b, { ...golpe(b), ...EN_LA_PUNTA.minimo }, dadoCargado('minimo')),
    ).toThrow('«Cuerpo» golpea en la rueda sin arma que la lleve');
  });

  it('con la rueda del golpe, la tirada cae en los cuartos de lo que pegan espada y lanza', () => {
    const b = frente(JINETE, { col: 6, row: 4 }, { col: 7, row: 4 });
    const jinete = stackById(b, 'attacker-0');
    const muneco = stackById(b, 'defender-0');
    // La carga montada, 20–80: el cuarto 1 es 35; 35 ×1,2 ×1,15 = 48,3 → 48.
    const enUnCuarto = {
      chargeHexes: 3,
      cruce: cruceDelGolpe('normal', 1, 1, 'golpe', CON_LA_ESPADA, RUEDAS[7]),
    };
    expect(computeDamage(jinete, muneco, dadoCargado('maximo'), enUnCuarto).damage).toBe(48);
    // Del cuarto 0 al 2: 20–50 → 28–69; sin carga, la de espada y lanza, 11–27 (13–32).
    const horquilla = (chargeHexes: number) =>
      horquillaDeDanio(jinete, muneco, {
        chargeHexes,
        cruce: cruceDelGolpe('normal', 0, 2, 'golpe', CON_LA_ESPADA, RUEDAS[7]),
      }).danio;
    expect(horquilla(3)).toEqual({ min: 28, max: 69 });
    expect(horquilla(0)).toEqual({ min: 13, max: 32 });
  });

  it('la IA mide el golpe con su arma: el del arquero, con la daga, medio 21,9375', () => {
    const b = frente(ARQUERO, { col: 1, row: 4 }, { col: 4, row: 4 });
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    // (9 + 36) / 2 × 0,975: ataque 3 de la daga contra defensa 4.
    expect(expectedDamage(a, d, {})).toBe(21.9375);
  });

  it('`usoDelGolpe`: el disparo es a distancia y lo demás, también la carga, de cuerpo a cuerpo', () => {
    // 25-10-2026: la lanza dejó su hueco; la carga va con las armas de cuerpo a cuerpo.
    expect(usoDelGolpe({ ranged: true })).toBe('distancia');
    expect(usoDelGolpe({})).toBe('arma');
  });

  it('`armasDe`: una fila por golpe, con el arma y sus cifras', () => {
    // Todo el que pega cuerpo a cuerpo carga (#260): la fila de la carga va siempre,
    // con sus armas de cuerpo a cuerpo.
    expect(armasDe(ARQUERO)).toEqual([
      { uso: 'arma', arma: 'Daga', attack: 3, damage: [9, 36], carga: null, montada: false },
      {
        uso: 'distancia',
        arma: 'Arco',
        attack: 5,
        damage: [10, 40],
        carga: null,
        montada: false,
      },
      { uso: 'arma', arma: 'Daga', attack: 3, damage: [9, 36], carga: CARGA, montada: false },
    ]);
    // El jinete élfico: espada y lanza (de cada cifra, la mejor) y arco, con su
    // agilidad entera (4) sobre el caballo de guerra; su carga, con la fuerza del
    // caballo (16 + 4).
    const elfico = vestido(
      cuerpo(4),
      {
        arma: 'espada',
        segunda: 'lanza',
        distancia: 'arco',
        armadura: 'barda',
        montura: 'caballo_de_guerra',
      },
      'Jinete élfico',
    );
    expect(armasDe(elfico).map((a) => [a.uso, a.arma, a.attack, a.damage])).toEqual([
      ['arma', 'Espada y Lanza de jinete', 6, [11, 44]],
      ['distancia', 'Arco', 5, [10, 40]],
      ['arma', 'Espada y Lanza de jinete', 6, [20, 80]],
    ]);
    expect(armasDe(elfico).at(-1)).toMatchObject({ carga: CARGA, montada: true });
    // A pie con la lanza, la carga de siempre; y montado sin lanza, también: la
    // montada pide la montura de guerra y la lanza puestas.
    const sinCarga = vestido(cuerpo(), { arma: 'espada', segunda: 'lanza' }, 'A pie');
    expect(armasDe(sinCarga).at(-1)).toMatchObject({
      uso: 'arma',
      arma: 'Espada y Lanza de jinete',
      carga: CARGA,
      montada: false,
    });
    expect(armasDe(JINETE_SIN_LANZA).at(-1)).toMatchObject({ carga: CARGA, montada: false });
    // Quien no lleva lanza también tiene su fila: carga con la de cuerpo a cuerpo.
    expect(
      armasDe(vestido(cuerpo(), { arma: 'espada' }, 'Espadachín')).map((a) => [a.uso, a.arma]),
    ).toEqual([
      ['arma', 'Espada'],
      ['arma', 'Espada'],
    ]);
    // Sin armas por uso, todo va con las de arriba y el arma es la de su equipo.
    const espadachin = EQUIPO_DEL_JUEGO.conEquipo(cuerpo(), { arma: 'espada' });
    expect(armasDe(espadachin)).toEqual([
      { uso: 'arma', arma: 'Espada', attack: 6, damage: [10, 40], carga: null, montada: false },
      { uso: 'arma', arma: 'Espada', attack: 6, damage: [10, 40], carga: CARGA, montada: false },
    ]);
    expect(armasDe(cuerpo())[0]?.arma).toBeNull();
  });

  it('`armasDe`: un arma a distancia ya es disparar, sin munición (13-10-2026; antes, H1 del QA)', () => {
    // La Jabalina de la reproducción del QA: de la arena, en `distancia`. Antes, sin
    // disparos no se usaba y la fila lo decía; desde que no hay munición, llevarla
    // basta para disparar.
    const jabalina: Pieza = {
      id: 'jabalina',
      nombre: 'Jabalina',
      hueco: 'distancia',
      seConsigue: [],
      ataque: 3,
      fuerza: 6,
      defensa: 0,
      peso: 1,
      precio: 0,
    };
    const piezas = catalogoCon(jabalina);
    const conJabalina = (c: UnitInfo): UnitInfo =>
      piezas.conEquipo(c, { arma: 'daga', distancia: 'jabalina' });
    expect(armasDe(conJabalina(cuerpo()))).toEqual([
      { uso: 'arma', arma: 'Daga', attack: 3, damage: [9, 36], carga: null, montada: false },
      {
        uso: 'distancia',
        arma: 'Jabalina',
        attack: 6,
        damage: [13, 52],
        carga: null,
        montada: false,
      },
      { uso: 'arma', arma: 'Daga', attack: 3, damage: [9, 36], carga: CARGA, montada: false },
    ]);
    expect(isShooter(conJabalina(cuerpo()))).toBe(true);
    // Sin nada en `distancia`, no hay fila de disparo: no tira.
    expect(armasDe(piezas.conEquipo(cuerpo(), { arma: 'daga' })).map((a) => a.uso)).toEqual([
      'arma',
      'arma',
    ]);
  });
});
