/**
 * Cada arma para lo suyo (13-10-2026, solo la arena): una unidad lleva un arma de
 * cuerpo a cuerpo (`arma`), una a distancia (`distancia`) y una de carga
 * (`carga`), y cada golpe va con las cifras de la suya (`usoDelGolpe`,
 * `cifrasDelGolpe`). Se escribe desde los criterios: el disparo con el arco, el
 * golpe y el contraataque con la daga, la carga con la lanza (o, sin ella, con la
 * espada), sin arma con el cuerpo; y las reglas que dependen del arma —la rueda,
 * el castigo del tirador de fheroes2— siguen valiendo.
 *
 * Las cifras se esperan escritas, no calculadas con la fórmula: con el dado
 * cargado en cada punta (`dadoCargado`) el golpe da su mínimo y su máximo, y la
 * cuenta está en el comentario de cada caso.
 */
import { describe, expect, it } from 'vitest';
import { textoDePrevision } from '../src/client/views/prevision.js';
import { CUERPO_COMUN, catalogoDeLaArena } from '../src/core/arena.js';
import {
  applyAction,
  crearBatallaConReglas,
  legalActions,
  type PrevisionDeGolpe,
  previsionDe,
  stackById,
} from '../src/core/battle/battle.js';
import { hexEquals } from '../src/core/battle/board.js';
import { CARGA } from '../src/core/battle/carga.js';
import {
  armasDe,
  computeDamage,
  expectedDamage,
  horquillaDeDanio,
  usoDelGolpe,
} from '../src/core/battle/damage.js';
import { REGLAS_DEL_JUEGO, type ReglasDeBatalla } from '../src/core/battle/reglas.js';
import { cruceDelGolpe } from '../src/core/battle/rueda.js';
import type { BattleAction, BattleEvent, BattleState } from '../src/core/battle/types.js';
import { cuentaTiros, isShooter, type Pieza } from '../src/core/data.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { EquipoDeArena, Hex, SpeedTier, UnitInfo } from '../src/core/types.js';
import { bandoDe, con } from './batalla-de-prueba.js';
import { dadoCargado } from './helpers.js';

/** El cuerpo común de la arena (`CUERPO_COMUN`): 3 / 3, daño 10–10, 80 PV. */
function cuerpo(speed: SpeedTier = 'average', traits: UnitInfo['traits'] = []): UnitInfo {
  const { attack, defense, damage, hp } = CUERPO_COMUN;
  return { name: 'Cuerpo', faction: null, attack, defense, damage, hp, speed, traits };
}

const vestido = (c: UnitInfo, equipo: EquipoDeArena, name: string): UnitInfo => ({
  ...EQUIPO_DEL_JUEGO.conEquipo(c, equipo),
  name,
});

/** Daga (+1, 0–10) para pegar, arco (+2, 10–20, 12 tiros) para disparar, jubón (+20 PV). */
const ARQUERO = vestido(
  cuerpo(),
  { arma: 'daga', distancia: 'arco', armadura: 'jubon_de_arquero' },
  'Arquero',
);
/** Espada (+2, 10–30), lanza (+7, 40–80) y barda (+5 de defensa, +220 PV), con Carga. */
const JINETE = vestido(
  cuerpo('very_fast', ['charge']),
  { arma: 'espada', carga: 'lanza_de_jinete', armadura: 'barda' },
  'Jinete',
);
const JINETE_SIN_LANZA = vestido(
  cuerpo('very_fast', ['charge']),
  { arma: 'espada', armadura: 'barda' },
  'Jinete sin lanza',
);
const JINETE_SIN_ESPADA = vestido(
  cuerpo('very_fast', ['charge']),
  { carga: 'lanza_de_jinete', armadura: 'barda' },
  'Jinete sin espada',
);
/** El blanco: defensa 4 (el ataque de la daga), mucha vida y un golpe de 1. */
const MUNECO: UnitInfo = {
  name: 'Muñeco',
  faction: null,
  attack: 4,
  defense: 4,
  damage: [1, 1],
  hp: 5000,
  speed: 'very_slow',
};

/** Uno contra uno: `quien` en `en`, el muñeco en `contra`, y el turno de `quien`. */
function frente(
  quien: UnitInfo,
  en: Hex,
  contra: Hex,
  reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO,
): BattleState {
  const b = crearBatallaConReglas(
    bandoDe([{ id: 'quien', unit: quien }]),
    bandoDe([{ id: 'muneco', unit: MUNECO }]),
    createRng(1),
    reglas,
  );
  stackById(b, 'attacker-0').hex = en;
  stackById(b, 'defender-0').hex = contra;
  b.turno = { n: 1000, stack: 'attacker-0', gastado: 0 };
  return b;
}

/** Al revés: el muñeco pega a `quien`, que devuelve el golpe. */
function recibe(quien: UnitInfo): BattleState {
  const b = crearBatallaConReglas(
    bandoDe([{ id: 'muneco', unit: MUNECO }]),
    bandoDe([{ id: 'quien', unit: quien }]),
    createRng(1),
    REGLAS_DEL_JUEGO,
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

const DISPARO: BattleAction = { type: 'shoot', target: 'defender-0' };

/** El daño del primer golpe propio y el del contraataque, jugada la acción con el dado cargado. */
function jugar(
  b: () => BattleState,
  accion: (b: BattleState) => BattleAction,
  punta: 'minimo' | 'maximo',
): { readonly golpe: number; readonly devuelto: number | null; readonly carga: number } {
  const estado = b();
  const desde = estado.log.length;
  applyAction(estado, accion(estado), dadoCargado(punta));
  const nuevo: BattleEvent[] = estado.log.slice(desde);
  const mio = nuevo.find(
    (e) => (e.kind === 'attack' && !e.retaliation) || (e.kind === 'shoot' && e.splash !== true),
  );
  if (mio === undefined || (mio.kind !== 'attack' && mio.kind !== 'shoot')) {
    throw new Error('no hubo golpe');
  }
  const devuelto = nuevo.find((e) => e.kind === 'attack' && e.retaliation);
  return {
    golpe: mio.damage,
    devuelto: devuelto?.kind === 'attack' ? devuelto.damage : null,
    carga: mio.kind === 'attack' ? (mio.charge ?? 0) : 0,
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
  it('el arquero dispara con el arco: ataque 5 contra 4 (×1,1), 20–30 → 22–33', () => {
    const b = () => frente(ARQUERO, { col: 1, row: 4 }, { col: 4, row: 4 });
    const { visto, previsto } = puntas(b, () => DISPARO);
    expect(visto).toEqual([22, 33]);
    expect([previsto.danio.min, previsto.danio.max]).toEqual([22, 33]);
    expect(previsto.modificadores[0]?.causa).toBe('con Arco (a distancia)');
    // Sin munición (13-10-2026): el arco no da tiros que gastar; dispara siempre.
    const e = b();
    applyAction(e, DISPARO, dadoCargado('minimo'));
    expect(stackById(e, 'attacker-0').shotsLeft).toBe(0);
    expect(cuentaTiros(stackById(e, 'attacker-0').unit)).toBe(false);
  });

  it('pega y devuelve el golpe con la daga: ataque 4 contra 4 (×1), 10–20', () => {
    const b = () => frente(ARQUERO, { col: 5, row: 4 }, { col: 6, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e));
    expect(visto).toEqual([10, 20]);
    expect(previsto.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    // Y al recibir un golpe lo devuelve con la daga, no con el arco.
    const alReves = () => recibe(ARQUERO);
    expect(jugar(alReves, (e) => golpe(e), 'minimo').devuelto).toBe(10);
    expect(jugar(alReves, (e) => golpe(e), 'maximo').devuelto).toBe(20);
    const p = previsionDe(alReves(), golpe(alReves()));
    if (p === null || p.kind !== 'golpe') throw new Error('sin previsión');
    expect([p.contraataque?.danio.min, p.contraataque?.danio.max]).toEqual([10, 20]);
    expect(p.contraataque?.modificadores[0]?.causa).toBe('con Daga (cuerpo a cuerpo)');
    // Y la barra lo nombra (H3 del QA): la misma frase de `DICHO_DEL_USO`.
    expect(p.contraataque?.conArma).toBe('con Daga (cuerpo a cuerpo)');
    expect(textoDePrevision(p, (id) => id)).toContain(
      'Contraataque con Daga (cuerpo a cuerpo): 10–20.',
    );
  });

  it('el jinete carga 3 casillas con la lanza: ataque 10 contra 4 (×1,6) y +30 %, 50–90 → 104–187', () => {
    const b = () => frente(JINETE, { col: 3, row: 4 }, { col: 7, row: 4 });
    const desde = { col: 6, row: 4 };
    expect(jugar(b, (e) => golpe(e, desde), 'minimo').carga).toBe(3);
    const { visto, previsto } = puntas(b, (e) => golpe(e, desde));
    expect(visto).toEqual([104, 187]);
    expect(previsto.modificadores.map((m) => m.causa)).toEqual([
      'con Lanza de jinete (en la carga)',
      'ataque 10 contra defensa 4',
      'carga de 3 casillas',
    ]);
    // Sin carga (pegado), con la espada: 5 contra 4 (×1,1), 20–40 → 22–44.
    const pegado = () => frente(JINETE, { col: 6, row: 4 }, { col: 7, row: 4 });
    expect(puntas(pegado, (e) => golpe(e)).visto).toEqual([22, 44]);
    // Y devuelve el golpe con la espada, no con la lanza: 5 contra 4 → 22–44.
    const alReves = () => recibe(JINETE);
    expect(jugar(alReves, (e) => golpe(e), 'minimo').devuelto).toBe(22);
    expect(jugar(alReves, (e) => golpe(e), 'maximo').devuelto).toBe(44);
    // Y la barra de quien le pega lo dice: devuelve con la espada (H3 del QA).
    const p = previsionDe(alReves(), golpe(alReves()));
    if (p === null || p.kind !== 'golpe') throw new Error('sin previsión');
    expect(p.contraataque?.conArma).toBe('con Espada (cuerpo a cuerpo)');
  });

  it('sin lanza carga con la espada (+30 %): 20–40 ×1,1 ×1,3 → 29–57', () => {
    const b = () => frente(JINETE_SIN_LANZA, { col: 3, row: 4 }, { col: 7, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e, { col: 6, row: 4 }));
    expect(visto).toEqual([29, 57]);
    // Sin arma de carga ni a distancia no hay armas por uso: no se dice con cuál.
    expect(previsto.modificadores[0]?.causa).toBe('ataque 5 contra defensa 4');
  });

  it('sin arma de cuerpo a cuerpo pega con el cuerpo: 3 contra 4 (×0,975), 10–10 → 10', () => {
    const b = () => frente(JINETE_SIN_ESPADA, { col: 6, row: 4 }, { col: 7, row: 4 });
    const { visto, previsto } = puntas(b, (e) => golpe(e));
    expect(visto).toEqual([10, 10]);
    expect(previsto.modificadores[0]?.causa).toBe('sin arma, con el cuerpo (cuerpo a cuerpo)');
  });

  it('con la rueda del golpe, la tirada cae en los cuartos de la lanza', () => {
    const b = frente(JINETE, { col: 6, row: 4 }, { col: 7, row: 4 });
    const jinete = stackById(b, 'attacker-0');
    const muneco = stackById(b, 'defender-0');
    // Lanza 50–90: el cuarto 1 es 60; 60 ×1,6 ×1,3 = 124,8 → 125.
    const enUnCuarto = {
      reglas: REGLAS_DEL_JUEGO,
      chargeHexes: 3,
      cruce: cruceDelGolpe('normal', 1, 1),
    };
    expect(computeDamage(jinete, muneco, dadoCargado('maximo'), enUnCuarto).damage).toBe(125);
    // Del cuarto 0 al 2: 50–70 → 104–146; sin carga, los de la espada (20–40 → 22–33).
    const horquilla = (chargeHexes: number) =>
      horquillaDeDanio(
        jinete,
        muneco,
        {
          reglas: REGLAS_DEL_JUEGO,
          chargeHexes,
          cruce: cruceDelGolpe('normal', 0, 2),
        },
        EQUIPO_DEL_JUEGO,
      ).danio;
    expect(horquilla(3)).toEqual({ min: 104, max: 146 });
    expect(horquilla(0)).toEqual({ min: 22, max: 33 });
  });

  it('con el castigo del tirador de fheroes2, la daga pega la mitad: 10–20 → 5–10', () => {
    const reglas = con('tirador');
    const b = () => frente(ARQUERO, { col: 5, row: 4 }, { col: 6, row: 4 }, reglas);
    const { visto, previsto } = puntas(b, (e) => golpe(e));
    expect(visto).toEqual([5, 10]);
    expect(previsto.modificadores.map((m) => m.causa)).toContain(
      'tirador con flechas cuerpo a cuerpo (fheroes2)',
    );
  });

  it('la IA mide cada golpe con su arma: el disparo medio 27,5 y el golpe medio 15', () => {
    const b = frente(ARQUERO, { col: 1, row: 4 }, { col: 4, row: 4 });
    const a = stackById(b, 'attacker-0');
    const d = stackById(b, 'defender-0');
    expect(
      expectedDamage(a, d, { reglas: REGLAS_DEL_JUEGO, ranged: true, distance: 3 }),
    ).toBeCloseTo(27.5);
    expect(expectedDamage(a, d, { reglas: REGLAS_DEL_JUEGO })).toBe(15);
  });

  it('`usoDelGolpe`: el disparo es a distancia, el golpe que cobra carga es de carga y lo demás, cuerpo a cuerpo', () => {
    expect(usoDelGolpe(JINETE, { ranged: true })).toBe('distancia');
    expect(usoDelGolpe(JINETE, { chargeHexes: 3 })).toBe('carga');
    expect(usoDelGolpe(JINETE, { chargeHexes: 0 })).toBe('cuerpo');
    expect(usoDelGolpe(JINETE, {})).toBe('cuerpo');
    // Sin el rasgo Carga no hay carga que cobrar: va con la de cuerpo a cuerpo.
    expect(usoDelGolpe(ARQUERO, { chargeHexes: 4 })).toBe('cuerpo');
  });

  it('`armasDe`: una fila por golpe, con el arma, sus cifras y si se usa', () => {
    const piezas = EQUIPO_DEL_JUEGO;
    expect(armasDe(ARQUERO, piezas, false)).toEqual([
      { uso: 'cuerpo', arma: 'Daga', attack: 4, damage: [10, 20], sinUso: null, carga: null },
      { uso: 'distancia', arma: 'Arco', attack: 5, damage: [20, 30], sinUso: null, carga: null },
    ]);
    // El jinete élfico: lanza, espada y arco, tres filas.
    const elfico = vestido(
      cuerpo('very_fast', ['charge']),
      { arma: 'espada', distancia: 'arco', carga: 'lanza_de_jinete', armadura: 'barda' },
      'Jinete élfico',
    );
    expect(armasDe(elfico, piezas, false).map((a) => [a.uso, a.arma, a.attack, a.damage])).toEqual([
      ['cuerpo', 'Espada', 5, [20, 40]],
      ['distancia', 'Arco', 5, [20, 30]],
      ['carga', 'Lanza de jinete', 10, [50, 90]],
    ]);
    // Sin el rasgo Carga, la lanza se lleva pero no se usa (y se dice).
    const sinCarga = vestido(cuerpo(), { arma: 'espada', carga: 'lanza_de_jinete' }, 'A pie');
    expect(armasDe(sinCarga, piezas, false).at(-1)).toMatchObject({
      uso: 'carga',
      sinUso: 'no carga: no se usa',
      carga: null,
    });
    // En la arena carga a pie (#260): la lanza se usa, con las cifras de a pie, y
    // el jinete sigue con las suyas.
    expect(armasDe(sinCarga, piezas, true).at(-1)).toMatchObject({
      uso: 'carga',
      arma: 'Lanza de jinete',
      sinUso: null,
      carga: CARGA.aPie,
    });
    expect(armasDe(elfico, piezas, true).at(-1)).toMatchObject({ carga: CARGA.jinete });
    // Y quien no lleva lanza también tiene su fila: carga con la de cuerpo a cuerpo.
    expect(
      armasDe(vestido(cuerpo(), { arma: 'espada' }, 'Espadachín'), piezas, true).map((a) => [
        a.uso,
        a.arma,
      ]),
    ).toEqual([
      ['cuerpo', 'Espada'],
      ['carga', 'Espada'],
    ]);
    // Sin armas por uso, todo va con las de arriba y el arma es la de su equipo.
    const espadachin = EQUIPO_DEL_JUEGO.conEquipo(cuerpo(), { arma: 'espada' });
    expect(armasDe(espadachin, piezas, false)).toEqual([
      { uso: 'cuerpo', arma: 'Espada', attack: 5, damage: [20, 40], sinUso: null, carga: null },
    ]);
    expect(armasDe(cuerpo(), piezas, false)[0]?.arma).toBeNull();
  });

  it('`armasDe`: un arma a distancia ya es disparar, sin munición (13-10-2026; antes, H1 del QA)', () => {
    // La Jabalina de la reproducción del QA: de la arena, en `distancia`. Antes, sin
    // disparos no se usaba y la fila lo decía; desde que no hay munición, llevarla
    // basta para disparar.
    const jabalina: Pieza = {
      id: 'jabalina',
      nombre: 'Jabalina',
      hueco: 'distancia',
      calidad: 'arena',
      ataque: 3,
      defensa: 0,
      pv: 0,
      velocidad: 0,
      danio: [20, 40],
      precio: { gold: 0 },
    };
    const piezas = catalogoDeLaArena([jabalina]);
    const conJabalina = (c: UnitInfo): UnitInfo =>
      piezas.conEquipo(c, { arma: 'daga', distancia: 'jabalina' });
    expect(armasDe(conJabalina(cuerpo()), piezas, false)).toEqual([
      { uso: 'cuerpo', arma: 'Daga', attack: 4, damage: [10, 20], sinUso: null, carga: null },
      {
        uso: 'distancia',
        arma: 'Jabalina',
        attack: 6,
        damage: [30, 50],
        sinUso: null,
        carga: null,
      },
    ]);
    expect(isShooter(conJabalina(cuerpo()))).toBe(true);
    // Sin nada en `distancia`, no hay fila de disparo: no tira.
    expect(
      armasDe(piezas.conEquipo(cuerpo(), { arma: 'daga' }), piezas, false).map((a) => a.uso),
    ).toEqual(['cuerpo']);
  });

  it('la munición y el arma a distancia no se juntan: quien tiene `shots` no lleva nada en `distancia`', () => {
    // La munición es de la criatura del catálogo y el arma a distancia no la cuenta
    // (`cuentaTiros`): juntas, tiraría sin fin con unos tiros que bajan sin servir
    // de nada. Lo dice `vestir`, la única suma de las piezas.
    const piezas = catalogoDeLaArena([]);
    const conTiros: UnitInfo = { ...cuerpo(), name: 'Arquero', shots: 12 };
    expect(() => piezas.conEquipo(conTiros, { distancia: 'arco' })).toThrow(
      'Arquero tira con su munición (12 tiros) y no puede llevar nada en Arma a distancia',
    );
    // Con un arma de cuerpo a cuerpo, sí: los tiros siguen siendo suyos.
    expect(cuentaTiros(piezas.conEquipo(conTiros, { arma: 'daga' }))).toBe(true);
  });
});
