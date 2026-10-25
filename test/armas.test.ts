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

/** El cuerpo común de la arena (`CUERPO_COMUN`): ataque 3, fuerza 20, 160 PV, con su agilidad. */
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
 * Daga (+1 ataque, +4 fuerza) para pegar, arco (+2, +10) para disparar, jubón (2 de
 * armadura): pesa 7, menos que su fuerza 20, y se queda con su agilidad 4.
 */
const ARQUERO = vestido(
  cuerpo(),
  { arma: 'daga', distancia: 'arco', armadura: 'jubon_de_arquero' },
  'Arquero',
);
/**
 * Espada (+2, +10) y lanza (+3, +12), dos armas: de cada cifra, la mejor (ataque +3,
 * fuerza +12); y barda (22 de armadura), con Carga: pesa 42 con fuerza 20, −2 de
 * agilidad (de 6 a 4).
 */
const JINETE = vestido(
  cuerpo(6, ['charge']),
  { arma: 'espada', segunda: 'lanza', armadura: 'barda' },
  'Jinete',
);
const JINETE_SIN_LANZA = vestido(
  cuerpo(6, ['charge']),
  { arma: 'espada', armadura: 'barda' },
  'Jinete sin lanza',
);
/**
 * El blanco: defensa 4 (el ataque de la daga), mucha vida y un golpe de 1, con
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
  it('pega y devuelve el golpe con la daga: ataque 4 contra 4 (×1), 24–96', () => {
    const b = () => frente(ARQUERO, { col: 5, row: 4 }, { col: 6, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e));
    expect(visto).toEqual([24, 96]);
    expect(previsto.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    // Y al recibir un golpe lo devuelve con la daga, no con el arco.
    const alReves = () => recibe(ARQUERO);
    // El contraataque cae en la punta contraria a la del golpe.
    expect(jugar(alReves, (e) => golpe(e), 'maximo').devuelto).toBe(24);
    expect(jugar(alReves, (e) => golpe(e), 'minimo').devuelto).toBe(96);
    const p = previsionDe(alReves(), golpe(alReves()));
    if (p === null || p.kind !== 'golpe') throw new Error('sin previsión');
    expect([p.contraataque?.danio.min, p.contraataque?.danio.max]).toEqual([24, 96]);
    expect(p.contraataque?.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    // Y la barra lo nombra (H3 del QA): la misma frase de `DICHO_DEL_USO`.
    expect(p.contraataque?.conArma).toBe('con Daga (cuerpo a cuerpo)');
    expect(textoDePrevision(p, (id) => id)).toContain(
      'Contraataque con Daga (cuerpo a cuerpo): 24–96.',
    );
  });

  it('el jinete carga 3 casillas con la lanza: ataque 6 contra 4 (×1,2) y +30 %, 32–128 → 50–200', () => {
    const b = () => frente(JINETE, { col: 3, row: 4 }, { col: 7, row: 4 });
    const desde = { col: 6, row: 4 };
    expect(jugar(b, (e) => golpe(e, desde), 'minimo').carga).toBe(3);
    const { visto, previsto } = puntas(b, (e) => golpe(e, desde));
    expect(visto).toEqual([50, 200]);
    expect(previsto.modificadores.map((m) => m.causa)).toEqual([
      'con Espada y Lanza (en la carga)',
      'ataque 6 contra defensa 4',
      'carga de 3 casillas',
    ]);
    // Sin carga (pegado), con las mismas dos armas: 6 contra 4 (×1,2), 32–128 → 38–154.
    const pegado = () => frente(JINETE, { col: 6, row: 4 }, { col: 7, row: 4 });
    expect(puntas(pegado, (e) => golpe(e)).visto).toEqual([38, 154]);
    // Y devuelve el golpe con las dos (25-10-2026: la lanza es un arma más).
    const alReves = () => recibe(JINETE);
    expect(jugar(alReves, (e) => golpe(e), 'maximo').devuelto).toBe(38);
    expect(jugar(alReves, (e) => golpe(e), 'minimo').devuelto).toBe(154);
    // Y la barra de quien le pega lo dice (H3 del QA).
    const p = previsionDe(alReves(), golpe(alReves()));
    if (p === null || p.kind !== 'golpe') throw new Error('sin previsión');
    expect(p.contraataque?.conArma).toBe('con Espada y Lanza (cuerpo a cuerpo)');
  });

  it('montado sin lanza carga a pie con la espada (+15 %): pesa 34, −1 de agilidad (5), 30–150 ×1,1 ×1,15 → 38–190', () => {
    // 25-10-2026: la carga del jinete pide el rasgo y una lanza puesta.
    const b = () => frente(JINETE_SIN_LANZA, { col: 3, row: 4 }, { col: 7, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e, { col: 6, row: 4 }));
    expect(visto).toEqual([38, 190]);
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
    expect(golpeDe(juego, 'arma')).toEqual({ piezas: [], attack: 3, damage: [20, 80] });
    const b = frente(juego, { col: 6, row: 4 }, { col: 7, row: 4 });
    expect(() =>
      applyAction(b, { ...golpe(b), ...EN_LA_PUNTA.minimo }, dadoCargado('minimo')),
    ).toThrow('«Cuerpo» golpea en la rueda sin arma que la lleve');
  });

  it('con la rueda del golpe, la tirada cae en los cuartos de lo que pegan espada y lanza', () => {
    const b = frente(JINETE, { col: 6, row: 4 }, { col: 7, row: 4 });
    const jinete = stackById(b, 'attacker-0');
    const muneco = stackById(b, 'defender-0');
    // Espada y lanza, 32–128: el cuarto 1 es 56; 56 ×1,2 ×1,3 = 87,36 → 87.
    const enUnCuarto = {
      chargeHexes: 3,
      cruce: cruceDelGolpe('normal', 1, 1, 'golpe', CON_LA_ESPADA, RUEDAS[7]),
    };
    expect(computeDamage(jinete, muneco, dadoCargado('maximo'), enUnCuarto).damage).toBe(87);
    // Del cuarto 0 al 2: 32–80 → 50–125; sin carga, sin el +30 % (38–96).
    const horquilla = (chargeHexes: number) =>
      horquillaDeDanio(jinete, muneco, {
        chargeHexes,
        cruce: cruceDelGolpe('normal', 0, 2, 'golpe', CON_LA_ESPADA, RUEDAS[7]),
      }).danio;
    expect(horquilla(3)).toEqual({ min: 50, max: 125 });
    expect(horquilla(0)).toEqual({ min: 38, max: 96 });
  });

  it('la IA mide el golpe con su arma: el del arquero, con la daga, medio 60', () => {
    const b = frente(ARQUERO, { col: 1, row: 4 }, { col: 4, row: 4 });
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    expect(expectedDamage(a, d, {})).toBe(60);
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
      { uso: 'arma', arma: 'Daga', attack: 4, damage: [24, 96], carga: null },
      { uso: 'distancia', arma: 'Arco', attack: 5, damage: [30, 120], carga: null },
      { uso: 'arma', arma: 'Daga', attack: 4, damage: [24, 96], carga: CARGA.aPie },
    ]);
    // El jinete élfico: espada y lanza (de cada cifra, la mejor) y arco; agilidad 4.
    const elfico = vestido(
      cuerpo(6, ['charge']),
      { arma: 'espada', segunda: 'lanza', distancia: 'arco', armadura: 'barda' },
      'Jinete élfico',
    );
    expect(armasDe(elfico).map((a) => [a.uso, a.arma, a.attack, a.damage])).toEqual([
      ['arma', 'Espada y Lanza', 6, [32, 128]],
      ['distancia', 'Arco', 5, [30, 120]],
      ['arma', 'Espada y Lanza', 6, [32, 128]],
    ]);
    expect(armasDe(elfico).at(-1)).toMatchObject({ carga: CARGA.jinete });
    // A pie con la lanza, carga a pie; y montado sin lanza, también: la del jinete
    // pide el rasgo y la lanza puesta.
    const sinCarga = vestido(cuerpo(), { arma: 'espada', segunda: 'lanza' }, 'A pie');
    expect(armasDe(sinCarga).at(-1)).toMatchObject({
      uso: 'arma',
      arma: 'Espada y Lanza',
      carga: CARGA.aPie,
    });
    expect(armasDe(JINETE_SIN_LANZA).at(-1)).toMatchObject({ carga: CARGA.aPie });
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
      { uso: 'arma', arma: 'Espada', attack: 5, damage: [30, 120], carga: null },
      { uso: 'arma', arma: 'Espada', attack: 5, damage: [30, 120], carga: CARGA.aPie },
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
      fuerza: 20,
      defensa: 0,
      peso: 2,
      precio: 0,
    };
    const piezas = catalogoCon(jabalina);
    const conJabalina = (c: UnitInfo): UnitInfo =>
      piezas.conEquipo(c, { arma: 'daga', distancia: 'jabalina' });
    expect(armasDe(conJabalina(cuerpo()))).toEqual([
      { uso: 'arma', arma: 'Daga', attack: 4, damage: [24, 96], carga: null },
      { uso: 'distancia', arma: 'Jabalina', attack: 6, damage: [40, 160], carga: null },
      { uso: 'arma', arma: 'Daga', attack: 4, damage: [24, 96], carga: CARGA.aPie },
    ]);
    expect(isShooter(conJabalina(cuerpo()))).toBe(true);
    // Sin nada en `distancia`, no hay fila de disparo: no tira.
    expect(armasDe(piezas.conEquipo(cuerpo(), { arma: 'daga' })).map((a) => a.uso)).toEqual([
      'arma',
      'arma',
    ]);
  });
});
