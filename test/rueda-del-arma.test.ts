/**
 * El arma cambia la rueda del golpe (18-10-2026, solo la arena: «una maza es mejor
 * en ataque fuerte y peor en rápido, una espada es la más versátil»), por niveles
 * absolutos (vuelta 2): cada arma de cuerpo a cuerpo lleva un nivel de 0 a 6 en
 * cada tipo del anillo, y cada golpe va con las cifras de los niveles de SU arma
 * (`cifrasDeLosNiveles`, `ruedaDelGolpe`): la lanza en el primero de una carga, la
 * de cuerpo a cuerpo en lo demás y, en el contraataque, la del que responde.
 *
 * Escritos desde los criterios de `plan-2.md`
 * (`docs/agents/2026-10-18-equipo-por-tipos-y-bases/`). Cada comparación es contra
 * la misma arma con los niveles de la Espada (todo a 3, una copia «lisa»): así lo
 * que cambia es solo la rueda, no el ataque ni el daño.
 */
import { describe, expect, it } from 'vitest';
import ruedaJson from '../data/rueda.json' with { type: 'json' };
import { renderEleccion } from '../src/client/arena/rueda.js';
import { marcadoDe } from '../src/client/html.js';
import {
  batallaDeArena,
  catalogoDeLaArena,
  equiparEnArena,
  nivelesDeLaEspada,
  type UnidadDeArena,
  unidadDeCombate,
} from '../src/core/arena.js';
import {
  activeStack,
  applyAction,
  previsionDeLaRueda,
  stackById,
} from '../src/core/battle/battle.js';
import { cifrasDeLosNiveles, validarRueda } from '../src/core/battle/cifras-de-la-rueda.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../src/core/battle/reglas.js';
import {
  efectoDeGolpe,
  filasDeLaRueda,
  ruedaDelArmaEnPalabras,
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
  todoA,
  unidadDeArena,
} from './helpers.js';

/** `p` con los niveles de la Espada, con otro id y otro nombre: la misma arma, versátil. */
function lisa(p: Pieza): Pieza {
  return { ...p, rueda: nivelesDeLaEspada(), id: `${p.id}-lisa`, nombre: `${p.nombre} lisa` };
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

describe('las cifras de la rueda por niveles', () => {
  it('cada nivel da su cifra de data/rueda.json, y por éxito Romper guardia y la Finta en enteros', () => {
    const nivel = (n: number) =>
      cifrasDeLosNiveles({
        ofensivo: n,
        fuerte: n,
        finta: n,
        defensivo: n,
        rapido: n,
        romperGuardia: n,
      });
    // Lo peor: nada que sumar, Fuerte ×1, Rápido 2 × 0,25, la Finta resta 10 y
    // Romper guardia no quita.
    expect(nivel(0)).toEqual({
      fuerte: { porcentaje: 100 },
      rapido: { porcentaje: 25, golpes: 2 },
      ofensivo: { ataque: 0 },
      defensivo: { defensa: 0 },
      romperGuardia: { ataque: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } },
      finta: { casillas: { 0: 10, 1: 10, 2: 10, 3: 10, 4: 10 } },
    });
    // El 3 (la Espada): Romper guardia quita como antes de los niveles.
    expect(nivel(3)).toEqual({
      fuerte: { porcentaje: 150 },
      rapido: { porcentaje: 63, golpes: 2 },
      ofensivo: { ataque: 3 },
      defensivo: { defensa: 3 },
      romperGuardia: { ataque: { 0: 0, 1: 0, 2: -1, 3: -2, 4: -3 } },
      finta: { casillas: { 0: 10, 1: 8, 2: 7, 3: 6, 4: 5 } },
    });
    // Lo mejor: con más éxito, la Finta resta menos (0 con el máximo) y Romper
    // guardia quita más (6).
    expect(nivel(6)).toEqual({
      fuerte: { porcentaje: 200 },
      rapido: { porcentaje: 100, golpes: 2 },
      ofensivo: { ataque: 6 },
      defensivo: { defensa: 6 },
      romperGuardia: { ataque: { 0: 0, 1: -1, 2: -3, 3: -4, 4: -6 } },
      finta: { casillas: { 0: 10, 1: 7, 2: 5, 3: 2, 4: 0 } },
    });
    // Un nivel fuera de la tabla es un fallo: lanza.
    expect(() => cifrasDeLosNiveles({ ...todoA(3), fuerte: 7 })).toThrow(
      'el nivel de Fuerte es 7: va de 0 a 6',
    );
  });

  it('la tabla de la ficha: seis filas sin Normal, con el nivel y lo que da', () => {
    expect(MAZA.rueda).toEqual({
      ofensivo: 3,
      fuerte: 5,
      finta: 1,
      defensivo: 3,
      rapido: 1,
      romperGuardia: 5,
    });
    if (MAZA.rueda === undefined) throw new Error('la maza no lleva rueda');
    const filas = filasDeLaRueda(MAZA.rueda);
    expect(filas.map((f) => f.tipo)).toEqual([
      'ofensivo',
      'fuerte',
      'finta',
      'defensivo',
      'rapido',
      'romperGuardia',
    ]);
    expect(filas.find((f) => f.tipo === 'fuerte')).toEqual({
      tipo: 'fuerte',
      nivel: 5,
      final: 'Daño ×1,83',
      corto: '×1,83',
      porExito: null,
    });
    expect(filas.find((f) => f.tipo === 'rapido')).toMatchObject({
      final: '2 golpes ×0,38',
      corto: '2 ×0,38',
    });
    expect(filas.find((f) => f.tipo === 'ofensivo')?.final).toBe('+3 ataque');
    // Romper guardia nivel 5: quita 0, −1, −2, −3, −5 del mínimo al máximo.
    expect(filas.find((f) => f.tipo === 'romperGuardia')).toMatchObject({
      final: 'quita 0 a 5 de ataque',
      corto: '0–5',
      porExito: '0, −1, −2, −3, −5',
    });
    // La Finta nivel 1: resta 8 con el éxito máximo y 10 con el mínimo.
    expect(filas.find((f) => f.tipo === 'finta')).toMatchObject({
      final: 'resta 8 a 10 casillas',
      corto: '8–10',
      porExito: '10, 9, 9, 8, 8',
    });
    expect(ruedaDelArmaEnPalabras(MAZA.rueda)).toBe(
      'Ofensivo 3, Fuerte 5, Finta 1, Defensivo 3, Rápido 1, Romper guardia 5',
    );
    // Con las dos puntas iguales, una sola cifra.
    const peor = filasDeLaRueda({ ...todoA(3), finta: 0, romperGuardia: 0 });
    expect(peor.find((f) => f.tipo === 'finta')?.final).toBe('resta 10 casillas');
    expect(peor.find((f) => f.tipo === 'romperGuardia')?.final).toBe('no quita ataque');
  });

  it('la Espada es la versátil (todo a 3) y la llevan la unidad y el héroe', () => {
    expect(pieza('espada').rueda).toEqual(todoA(3));
    const conEspada = unidadDeCombate(unidadDeArena('templario-escudo'), DEL_JUEGO);
    expect(ruedaDelGolpe(conEspada, 'cuerpo').fuerte.porcentaje).toBe(150);
    // El juego no tiene armas por uso ni rueda: su cuerpo no lleva `armas`.
    expect(conEquipo(creature('pikeman'), { arma: 'espada_de_armeria' })).not.toHaveProperty(
      'armas',
    );
  });

  it('golpear en la rueda sin arma de la arena es un fallo: lanza', () => {
    const sinArma = { ...creature('pikeman'), name: 'Piquero' };
    expect(() => ruedaDelGolpe(sinArma, 'cuerpo')).toThrow(
      '«Piquero» golpea en la rueda sin arma de la arena',
    );
  });

  it('validarRueda muerde: siete niveles, que no empeoran, una Finta que no pasa del mínimo y sin Normal', () => {
    const con = (cambio: (j: Record<string, Record<string, unknown>>) => void) => {
      const j = structuredClone(ruedaJson) as unknown as Record<string, Record<string, unknown>>;
      cambio(j);
      return () => validarRueda(j, 'rueda.json');
    };
    expect(con(() => {})).not.toThrow();
    expect(
      con((j) => {
        (j.fuerte as Record<string, unknown>).porcentaje = [100, 117, 133, 150, 167, 183];
      }),
    ).toThrow('rueda.json: fuerte.porcentaje: tiene que ser una lista de 7 enteros');
    expect(
      con((j) => {
        (j.ofensivo as Record<string, unknown>).ataque = [0, 1, 2, 1, 4, 5, 6];
      }),
    ).toThrow('rueda.json: ofensivo.ataque: el nivel 3 (1) es peor que el 2 (2)');
    expect(
      con((j) => {
        (j.finta as Record<string, unknown>).conExitoMaximo = [12, 8, 7, 5, 3, 2, 0];
      }),
    ).toThrow('rueda.json: finta.conExitoMaximo: el nivel 0 va hasta 10, y es 12');
    expect(
      con((j) => {
        (j.romperGuardia as Record<string, unknown>).conExitoMaximo = [0, -1, -2, -3, -4, -5, 1];
      }),
    ).toThrow('el nivel 6 va hasta 0, y es 1');
    expect(
      con((j) => {
        j.normal = { porcentaje: 100 };
      }),
    ).toThrow('rueda.json: «normal» no es un campo');
  });

  it('las notas de la rueda dicen las cifras del arma de quien elige; Normal, sin modificar', () => {
    if (MAZA.rueda === undefined) throw new Error('la maza no lleva rueda');
    const c = cifrasDeLosNiveles(MAZA.rueda);
    expect(efectoDeGolpe('fuerte', 'golpe', true, false, c)).toBe('Daño ×1,83.');
    expect(efectoDeGolpe('rapido', 'respuesta', true, false, c)).toContain(
      'contraatacas con 2 golpes de daño ×0,38 cada uno',
    );
    expect(efectoDeGolpe('romperGuardia', 'golpe', true, false, c)).toContain(
      '−5 con éxito máximo, −3 alto, −2 medio, −1 bajo, nada mínimo',
    );
    expect(efectoDeGolpe('normal', 'golpe', true, false, c)).toBe(
      'Sin modificar. Contra cualquiera, el cruce cae en el medio.',
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
    expect(maza.rueda.fuerte.porcentaje).toBe(183);
    expect(llana.rueda).toEqual(cifrasDeLosNiveles(nivelesDeLaEspada()));
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

  it('la Finta de la daga (nivel 5) resta menos casillas que la de la espada (nivel 3)', () => {
    // El jinete (7 casillas): tras golpear le queda por andar, y el turno sigue.
    const tras = (arma: string): number | undefined => {
      const jinete = equiparEnArena(unidadDeArena('templario-hermano-de-carga'), arma, EQ);
      const b = pelea(jinete, unidadDeArena('templario-escudo'));
      // Contra Romper guardia, su opuesto: el éxito máximo.
      dar(b, 'finta', 'romperGuardia');
      expect(b.turno?.stack).toBe('attacker-0');
      return b.turno?.finta;
    };
    // Con el éxito máximo, la espada (nivel 3) resta 5 casillas y la daga (nivel
    // 5), 2. Con menos éxito restan más: contra Normal (el medio), 7 y 6, y al
    // jinete de 7 casillas no le quedaría nada que andar con la espada.
    expect(DAGA.rueda?.finta).toBe(5);
    expect(tras('espada')).toBe(5);
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
    // La lanza: Rápido nivel 1 → 38 % en el primero; el segundo, sin carga y con
    // la espada (nivel 3), a 63 % los dos.
    expect(con.previsto.rueda.rapido.porcentaje).toBe(38);
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
    // Yo contra Yo, los dos con maza: elija quien elija, su Fuerte es ×1,83.
    const conMaza = {
      unidad: equiparEnArena(unidadDeArena('templario-escudo'), 'maza', DEL_JUEGO),
      ia: false,
    };
    const s = sesionDeArena([conMaza], [conMaza], 1, { golpe: 'rueda' });
    s.empezar();
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    expect(p.prevision.rueda.fuerte.porcentaje).toBe(183);
    const m = marcadoDe(renderEleccion(s, p));
    expect(m).toContain('Daño ×1,83.');
    expect(m).toContain('2 golpes de daño ×0,38 cada uno');
    expect(m).not.toContain('Daño ×1,5.');
  });
});
