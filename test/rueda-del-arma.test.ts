/**
 * El arma cambia la rueda del golpe (18-10-2026, solo la arena: «una maza es mejor
 * en ataque fuerte y peor en rápido, una espada es la más versátil»): cada tipo,
 * su cifra de `data/rueda.json` más lo que suma el arma de ESE golpe
 * (`cifrasDeLaRuedaCon`, `ruedaDelGolpe`): la lanza en el primero de una carga, la
 * de cuerpo a cuerpo en lo demás y, en el contraataque, la del que responde.
 *
 * Escritos desde los criterios del plan (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`).
 * Cada comparación es contra la misma arma sin rueda (una copia «lisa»): así lo que
 * cambia es solo la rueda, no el ataque ni el daño.
 */
import { describe, expect, it } from 'vitest';
import { renderEleccion } from '../src/client/arena/rueda.js';
import { marcadoDe } from '../src/client/html.js';
import {
  batallaDeArena,
  catalogoDeLaArena,
  equiparEnArena,
  type UnidadDeArena,
  unidadDeCombate,
} from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  previsionDeLaRueda,
  stackById,
} from '../src/core/battle/battle.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import {
  cifrasDeLaRuedaCon,
  efectoDeGolpe,
  filasDeLaRueda,
  ruedaDelArmaBlocker,
  ruedaDelGolpe,
} from '../src/core/battle/rueda.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import { creature, type Pieza, type PiezaEscrita } from '../src/core/data.js';
import { conEquipo, pieza } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { TipoDeGolpe } from '../src/core/types.js';
import {
  type Ataque,
  aPelear,
  ataquesDe,
  DEL_JUEGO,
  golpeConLaRueda,
  hastaLaRueda,
  montajeDePrueba,
  sesionDeArena,
  unidadDeArena,
} from './helpers.js';

/** `p` sin rueda, con otro id y otro nombre: la misma arma que no cambia la rueda. */
function lisa(p: Pieza): Pieza {
  const { rueda: _, ...resto } = p;
  return { ...resto, id: `${p.id}-lisa`, nombre: `${p.nombre} lisa` };
}

const MAZA = pieza('maza');
const MAZA_LISA = lisa(MAZA);
const DAGA = pieza('daga');
const LANZA = pieza('lanza_de_jinete');
const LANZA_LISA = lisa(LANZA);
const PIEZAS: readonly PiezaEscrita[] = [MAZA_LISA, LANZA_LISA];
const EQ = catalogoDeLaArena(PIEZAS);

/** El guerrero con escudo (espada, brigantina y escudo) con `arma` en la mano. */
function guerreroCon(arma: string): UnidadDeArena {
  return equiparEnArena(unidadDeArena('templario-escudo'), arma, EQ);
}

/**
 * Una pelea con la rueda, sin moral: `izq` en (5,4) y `der` pegado en (6,4). Los
 * dos guerreros son iguales de rápidos: empieza el atacante.
 */
function pelea(izq: UnidadDeArena, der: UnidadDeArena): BattleState {
  const b = batallaDeArena(
    montajeDePrueba(aPelear([izq]), aPelear([der]), SIN_MURALLA, REGLAS_DEL_JUEGO, {
      piezas: PIEZAS,
      modos: { golpe: 'rueda' },
    }),
    createRng(1),
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
  for (const s of b.stacks) s.morale = 0;
  expect(activeStack(b)?.id).toBe('attacker-0');
  return b;
}

/** Da un golpe de una vez con `golpe` y `respuesta`, y devuelve lo que hizo: los golpes de quien pega y los del contraataque. */
function dar(
  b: BattleState,
  golpe: TipoDeGolpe,
  respuesta: TipoDeGolpe,
  extra: Partial<BattleAction> = {},
): { readonly golpe: Ataque[]; readonly vuelta: Ataque[] } {
  applyAction(b, golpeConLaRueda(golpe, respuesta, extra), createRng(7));
  const todos = ataquesDe(b);
  return { golpe: todos.filter((e) => !e.retaliation), vuelta: todos.filter((e) => e.retaliation) };
}

describe('las cifras de la rueda con un arma', () => {
  it('sin arma o sin nada que sumar, las de siempre y la misma referencia', () => {
    const sin = cifrasDeLaRuedaCon(undefined);
    expect(cifrasDeLaRuedaCon({})).toBe(sin);
    expect(cifrasDeLaRuedaCon({ fuerte: 0 })).toBe(sin);
    expect(sin.fuerte.porcentaje).toBe(125);
    expect(sin.normal.porcentaje).toBe(100);
    // La espada es la versátil: no lleva nada, y el que la lleva pega con la de siempre.
    expect(pieza('espada').rueda).toBeUndefined();
    const conEspada = unidadDeCombate(unidadDeArena('templario-escudo'), DEL_JUEGO);
    expect(ruedaDelGolpe(conEspada, 'cuerpo')).toBe(sin);
    // El juego no tiene armas por uso ni rueda: su cuerpo no lleva `armas`.
    expect(conEquipo(creature('pikeman'), { arma: 'espada_de_armeria' })).not.toHaveProperty(
      'armas',
    );
  });

  it('la maza: Fuerte +20 y Rápido −20 en puntos de %, y Romper guardia quita uno más en cada éxito', () => {
    const c = cifrasDeLaRuedaCon(MAZA.rueda);
    expect(MAZA.rueda).toEqual({ fuerte: 20, rapido: -20, romperGuardia: 1 });
    expect([c.fuerte.porcentaje, c.rapido.porcentaje, c.normal.porcentaje]).toEqual([145, 40, 100]);
    expect(c.romperGuardia.ataque).toEqual({ 0: -1, 1: -1, 2: -2, 3: -3, 4: -4 });
    // Lo que el arma no toca, igual.
    expect(c.finta).toEqual(cifrasDeLaRuedaCon(undefined).finta);
    // Romper guardia a −5 no pasa de 0 (no da ataque), la Finta no baja de 0.
    expect(cifrasDeLaRuedaCon({ romperGuardia: -5 }).romperGuardia.ataque).toEqual({
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    });
    expect(cifrasDeLaRuedaCon({ finta: -9 }).finta.casillas).toEqual({
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    });
    // La tabla de la ficha sale de la misma cuenta.
    const filas = filasDeLaRueda(MAZA.rueda);
    expect(filas.map((f) => f.tipo)).toEqual([
      'ofensivo',
      'fuerte',
      'finta',
      'defensivo',
      'rapido',
      'romperGuardia',
      'normal',
    ]);
    expect(filas.find((f) => f.tipo === 'fuerte')).toEqual({
      tipo: 'fuerte',
      suma: 20,
      final: 'Daño ×1,45',
      porExito: null,
    });
    expect(filas.find((f) => f.tipo === 'rapido')?.final).toBe('2 golpes ×0,4');
    expect(filas.find((f) => f.tipo === 'romperGuardia')).toMatchObject({
      final: '−1 a −4 ataque',
      porExito: '−1, −1, −2, −3, −4',
    });
    expect(filas.find((f) => f.tipo === 'finta')).toMatchObject({
      final: '5 a 1 casillas',
      porExito: '5, 4, 3, 2, 1',
    });
  });

  it('una rueda que deja un golpe sin daño, o que resta ataque o defensa, no vale', () => {
    expect(ruedaDelArmaBlocker(MAZA.rueda)).toBeNull();
    expect(ruedaDelArmaBlocker({ fuerte: -125 })).toBe(
      'con ella, Fuerte haría el 0 % del daño: tiene que quedar por encima de 0 (sin arma, 125 %)',
    );
    expect(ruedaDelArmaBlocker({ rapido: -70 })).toMatch(/Rápido haría el -10 % del daño/);
    expect(ruedaDelArmaBlocker({ ofensivo: -2 })).toBe(
      'con ella, Ofensivo restaría ataque (-1): como mucho se queda en 0',
    );
    expect(ruedaDelArmaBlocker({ defensivo: -2 })).toMatch(/Defensivo restaría defensa/);
    // Y la arena no deja ponerla: lo juzga su catálogo.
    expect(() => catalogoDeLaArena([{ ...MAZA, rueda: { fuerte: -200 } }])).toThrow(
      '«Maza»: con ella, Fuerte haría el -75 % del daño',
    );
  });

  it('las notas de la rueda dicen las cifras del arma de quien elige', () => {
    const c = cifrasDeLaRuedaCon(MAZA.rueda);
    expect(efectoDeGolpe('fuerte', 'golpe', true, false, c)).toBe('Daño ×1,45.');
    expect(efectoDeGolpe('rapido', 'respuesta', true, false, c)).toContain(
      'contraatacas con 2 golpes de daño ×0,4 cada uno',
    );
    expect(efectoDeGolpe('romperGuardia', 'golpe', true, false, c)).toContain(
      '−4 con éxito máximo, −3 alto, −2 medio, −1 bajo o mínimo',
    );
    const bendita = cifrasDeLaRuedaCon({ normal: 10 });
    expect(efectoDeGolpe('normal', 'golpe', true, false, bendita)).toBe(
      'Daño ×1,1. Contra cualquiera, el cruce cae en el medio.',
    );
  });
});

describe('cada golpe de la rueda va con su arma', () => {
  it('con la maza, Fuerte da más y Rápido menos que con la misma maza sin rueda; Normal, igual', () => {
    const con = (arma: string, golpe: TipoDeGolpe) =>
      dar(pelea(guerreroCon(arma), unidadDeArena('templario-escudo')), golpe, 'normal').golpe;
    const [fuerte] = con('maza', 'fuerte');
    const [fuerteLisa] = con(MAZA_LISA.id, 'fuerte');
    expect(fuerte?.damage).toBeGreaterThan(fuerteLisa?.damage ?? 0);
    const rapido = con('maza', 'rapido');
    const rapidoLisa = con(MAZA_LISA.id, 'rapido');
    expect(rapido).toHaveLength(2);
    expect(rapido[0]?.damage).toBeLessThan(rapidoLisa[0]?.damage ?? 0);
    expect(con('maza', 'normal')[0]?.damage).toBe(con(MAZA_LISA.id, 'normal')[0]?.damage);
  });

  it('la previsión de la rueda lo enseña antes de elegir, con las cifras del arma', () => {
    const prevista = (arma: string) =>
      previsionDeLaRueda(
        pelea(guerreroCon(arma), unidadDeArena('templario-escudo')),
        { type: 'attack', target: 'defender-0' },
        'golpe',
      );
    const maza = prevista('maza');
    const llana = prevista(MAZA_LISA.id);
    expect(maza.rueda.fuerte.porcentaje).toBe(145);
    expect(llana.rueda).toBe(cifrasDeLaRuedaCon(undefined));
    expect(maza.porTipo?.fuerte.danio.max).toBeGreaterThan(llana.porTipo?.fuerte.danio.max ?? 0);
    expect(maza.porTipo?.rapido.danio.max).toBeLessThan(llana.porTipo?.rapido.danio.max ?? 0);
    expect(maza.porTipo?.normal.danio).toEqual(llana.porTipo?.normal.danio);
    // Y lo que cae está en lo previsto.
    const b = pelea(guerreroCon('maza'), unidadDeArena('templario-escudo'));
    const previsto = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    const [golpe] = dar(b, 'fuerte', 'normal').golpe;
    const h = previsto.porTipo?.fuerte.danio;
    expect(golpe?.damage).toBeGreaterThanOrEqual(h?.min ?? Number.POSITIVE_INFINITY);
    expect(golpe?.damage).toBeLessThanOrEqual(h?.max ?? 0);
  });

  it('la Finta de la daga resta una casilla menos', () => {
    // El jinete (7 casillas): tras golpear le queda por andar, y el turno sigue.
    const tras = (arma: string): number | undefined => {
      const jinete = equiparEnArena(unidadDeArena('templario-hermano-de-carga'), arma, EQ);
      const b = pelea(jinete, unidadDeArena('templario-escudo'));
      dar(b, 'finta', 'normal');
      expect(b.turno?.stack).toBe('attacker-0');
      return b.turno?.finta;
    };
    // Finta contra Normal: el medio, 3 casillas; con la daga (Finta −1), 2.
    expect(DAGA.rueda?.finta).toBe(-1);
    expect(tras('espada')).toBe(3);
    expect(tras('daga')).toBe(2);
  });

  it('el contraataque va con el arma del que responde', () => {
    const vuelta = (arma: string) =>
      dar(pelea(unidadDeArena('templario-escudo'), guerreroCon(arma)), 'normal', 'fuerte').vuelta;
    const [conMaza] = vuelta('maza');
    const [conLisa] = vuelta(MAZA_LISA.id);
    expect(conMaza?.stack).toBe('defender-0');
    expect(conMaza?.damage).toBeGreaterThan(conLisa?.damage ?? 0);
  });

  it('en una carga, el primer golpe va con la lanza y el segundo de Rápido con la espada', () => {
    /** El jinete en (1,4), el guerrero en (6,4): desde (5,4) carga 4 casillas. */
    const carga = (lanza: string) => {
      const jinete = equiparEnArena(unidadDeArena('templario-hermano-de-carga'), lanza, EQ);
      const b = pelea(jinete, unidadDeArena('templario-escudo'));
      stackById(b, 'attacker-0').hex = { col: 1, row: 4 };
      const accion = { type: 'attack', target: 'defender-0', from: { col: 5, row: 4 } } as const;
      const previsto = previsionDeLaRueda(b, accion, 'golpe');
      return { previsto, golpes: dar(b, 'rapido', 'normal', { from: accion.from }).golpe };
    };
    const con = carga('lanza_de_jinete');
    const sin = carga(LANZA_LISA.id);
    expect(con.previsto.carga).not.toBeNull();
    // La lanza: Rápido −20 → 40 % en el primero; el segundo, sin carga y con la
    // espada, a 60 % los dos.
    expect(con.previsto.rueda.rapido.porcentaje).toBe(40);
    expect(con.previsto.porTipo?.rapido.danio.max).toBeLessThan(
      sin.previsto.porTipo?.rapido.danio.max ?? 0,
    );
    expect(con.previsto.porTipo?.rapido.siguientes).toEqual(
      sin.previsto.porTipo?.rapido.siguientes,
    );
    expect(con.golpes).toHaveLength(2);
    expect(con.golpes[0]?.damage).toBeLessThan(sin.golpes[0]?.damage ?? 0);
    expect(con.golpes[1]?.damage).toBe(sin.golpes[1]?.damage);
  });

  it('la rueda que se abre en la página enseña las cifras del arma de quien elige', () => {
    // Yo contra Yo, los dos con maza: elija quien elija, su Fuerte es ×1,45.
    const conMaza = {
      unidad: equiparEnArena(unidadDeArena('templario-escudo'), 'maza', DEL_JUEGO),
      ia: false,
    };
    const s = sesionDeArena([conMaza], [conMaza], 1, { golpe: 'rueda' });
    s.empezar();
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    expect(p.prevision.rueda.fuerte.porcentaje).toBe(145);
    const m = marcadoDe(renderEleccion(s, p));
    expect(m).toContain('Daño ×1,45.');
    expect(m).toContain('2 golpes de daño ×0,4 cada uno');
    expect(m).not.toContain('Daño ×1,25.');
  });
});
