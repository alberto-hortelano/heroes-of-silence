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
import { caraDeLaArena } from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { renderEleccion } from '../src/client/rueda/rueda.js';
import { batallaDeArena, equiparEnArena } from '../src/core/arena.js';
import { ruedaDelGolpe } from '../src/core/battle/armas.js';
import {
  activeStack,
  applyAction,
  previsionDeLaRueda,
  stackById,
} from '../src/core/battle/battle.js';
import { cifrasDeLosNiveles, validarRueda } from '../src/core/battle/cifras-de-la-rueda.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import {
  efectoDeGolpe,
  filasDeLaRueda,
  nivelesEnLaForma,
  RUEDAS,
  ruedaDelArmaEnPalabras,
} from '../src/core/battle/rueda.js';
import type { BattleAction, BattleState } from '../src/core/battle/types.js';
import { unidad } from '../src/core/catalogo.js';
import type { Pieza, PiezaEscrita } from '../src/core/data.js';
import { conEquipo, EQUIPO_DEL_JUEGO, pieza } from '../src/core/hero/equipo.js';
import { createRng } from '../src/core/rng.js';
import type { TipoDeGolpe } from '../src/core/types.js';
import {
  cuerpoDeCombate,
  nivelesDeLaEspada,
  type Unidad,
  unidadDeCombate,
} from '../src/core/unidad.js';
import {
  type Ataque,
  aPelear,
  ataquesDe,
  catalogoCon,
  golpeConLaRueda,
  hastaLaRueda,
  JINETE,
  montajeDePrueba,
  sesionDeArena,
  TROPA,
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
const LANZA = pieza('lanza');
const LANZA_LISA = lisa(LANZA);
const PIEZAS: readonly PiezaEscrita[] = [MAZA_LISA, LANZA_LISA];
const EQ = catalogoCon(...PIEZAS);

/** El guerrero con escudo (espada, brigantina y escudo) con `arma` en la mano. */
function guerreroCon(arma: string): Unidad {
  // Con su propio id: el de enfrente es la tropa tal cual, y en una pelea un id es
  // una unidad (`catalogoDeLaPelea`).
  return equiparEnArena(unidadDeArena(TROPA, { id: `${TROPA}-9` }), arma, EQ);
}

/**
 * Una pelea con la rueda: `izq` en (5,4) y `der` pegado en (6,4). Los
 * dos guerreros son iguales de rápidos: empieza el atacante.
 */
function pelea(izq: Unidad, der: Unidad): BattleState {
  const b = batallaDeArena(
    montajeDePrueba(aPelear([izq]), aPelear([der]), SIN_MURALLA, { equipo: EQ }),
    createRng(1),
  );
  stackById(b, 'attacker-0').hex = { col: 5, row: 4 };
  stackById(b, 'defender-0').hex = { col: 6, row: 4 };
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
    // Lo peor: nada que sumar, Fuerte ×1, Rápido 2 × 0,25, la Finta resta de 8
    // (éxito mínimo) a 4 (máximo) y Romper guardia no quita.
    expect(nivel(0)).toEqual({
      fuerte: { porcentaje: 100 },
      rapido: { porcentaje: 25, golpes: 2 },
      ofensivo: { ataque: 0 },
      defensivo: { defensa: 0 },
      romperGuardia: { ataque: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } },
      finta: { casillas: { 0: 8, 1: 7, 2: 6, 3: 5, 4: 4 } },
    });
    // El 3 (la Espada): Romper guardia quita como antes de los niveles.
    expect(nivel(3)).toEqual({
      fuerte: { porcentaje: 150 },
      rapido: { porcentaje: 63, golpes: 2 },
      ofensivo: { ataque: 3 },
      defensivo: { defensa: 3 },
      romperGuardia: { ataque: { 0: 0, 1: 0, 2: -1, 3: -2, 4: -3 } },
      finta: { casillas: { 0: 5, 1: 4, 2: 3, 3: 2, 4: 1 } },
    });
    // Lo mejor: con más éxito, la Finta resta menos (2 con el mínimo, una menos por
    // punto de éxito, sin bajar de 0) y Romper guardia quita más (6).
    expect(nivel(6)).toEqual({
      fuerte: { porcentaje: 200 },
      rapido: { porcentaje: 100, golpes: 2 },
      ofensivo: { ataque: 6 },
      defensivo: { defensa: 6 },
      romperGuardia: { ataque: { 0: 0, 1: -1, 2: -3, 3: -4, 4: -6 } },
      finta: { casillas: { 0: 2, 1: 1, 2: 0, 3: 0, 4: 0 } },
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
    // La Finta nivel 1: resta 7 con el éxito mínimo y una menos por punto de éxito.
    expect(filas.find((f) => f.tipo === 'finta')).toMatchObject({
      final: 'resta 3 a 7 casillas',
      corto: '3–7',
      porExito: '7, 6, 5, 4, 3',
    });
    expect(ruedaDelArmaEnPalabras(MAZA.rueda)).toBe(
      'Ofensivo 3, Fuerte 5, Finta 1, Defensivo 3, Rápido 1, Romper guardia 5',
    );
    // Con las dos puntas iguales, una sola cifra.
    const peor = filasDeLaRueda({ ...todoA(3), finta: 0, romperGuardia: 0 });
    expect(peor.find((f) => f.tipo === 'finta')?.final).toBe('resta 4 a 8 casillas');
    // La mejor: con el éxito máximo no resta nada, y nunca baja de 0.
    const mejor = filasDeLaRueda({ ...todoA(3), finta: 6 });
    expect(mejor.find((f) => f.tipo === 'finta')?.porExito).toBe('2, 1, 0, 0, 0');
    expect(peor.find((f) => f.tipo === 'romperGuardia')?.final).toBe('no quita ataque');
  });

  it('la Espada es la versátil (todo a 3) y la llevan la unidad y el héroe', () => {
    expect(pieza('espada').rueda).toEqual(todoA(3));
    const conEspada = unidadDeCombate(unidadDeArena(TROPA), EQUIPO_DEL_JUEGO);
    expect(ruedaDelGolpe(conEspada, 'arma').fuerte.porcentaje).toBe(150);
    // Sin arma ni arma por uso, el cuerpo (sin su equipo de serie) no lleva `armas`:
    // todo golpe, con las de arriba.
    expect(conEquipo(cuerpoDeCombate(unidad(TROPA)), { armadura: 'gambeson' })).not.toHaveProperty(
      'armas',
    );
  });

  it('golpear en la rueda sin arma de la arena es un fallo: lanza', () => {
    // El cuerpo desnudo: las del catálogo llevan todas arma de serie.
    const sinArma = { ...cuerpoDeCombate(unidad(TROPA)), name: 'Piquero' };
    expect(() => ruedaDelGolpe(sinArma, 'arma')).toThrow(
      '«Piquero» golpea en la rueda sin arma que la lleve',
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
        (j.finta as Record<string, unknown>).conExitoMinimo = [8, 7, 6, 5, 4, 3, 9];
      }),
    ).toThrow('rueda.json: finta.conExitoMinimo: el nivel 6 (9) es peor que el 5 (3)');
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
    expect(efectoDeGolpe('fuerte', 'golpe', true, c, RUEDAS[7])).toBe('Daño ×1,83.');
    expect(efectoDeGolpe('rapido', 'respuesta', true, c, RUEDAS[7])).toContain(
      'contraatacas con 2 golpes de daño ×0,38 cada uno',
    );
    expect(efectoDeGolpe('romperGuardia', 'golpe', true, c, RUEDAS[7])).toContain(
      '−5 con éxito máximo, −3 alto, −2 medio, −1 bajo, nada mínimo',
    );
    expect(efectoDeGolpe('normal', 'golpe', true, c, RUEDAS[7])).toBe(
      'Sin modificar. Contra cualquiera, el cruce cae en el medio.',
    );
  });
});

describe('cada golpe de la rueda va con su arma', () => {
  it('con la maza, Fuerte da más y Rápido menos que con la misma maza sin rueda; Normal, igual', () => {
    const con = (arma: string, golpe: TipoDeGolpe) =>
      dar(pelea(guerreroCon(arma), unidadDeArena(TROPA)), golpe, 'normal').golpe;
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
        pelea(guerreroCon(arma), unidadDeArena(TROPA)),
        { type: 'attack', target: 'defender-0' },
        'golpe',
      );
    const maza = prevista('maza');
    const llana = prevista(MAZA_LISA.id);
    expect(maza.rueda.fuerte.porcentaje).toBe(183);
    expect(llana.rueda).toEqual(cifrasDeLosNiveles(nivelesDeLaEspada()));
    expect(maza.porTipo?.fuerte?.danio.max).toBeGreaterThan(llana.porTipo?.fuerte?.danio.max ?? 0);
    expect(maza.porTipo?.rapido?.danio.max).toBeLessThan(llana.porTipo?.rapido?.danio.max ?? 0);
    expect(maza.porTipo?.normal?.danio).toEqual(llana.porTipo?.normal?.danio);
    // Y lo que cae está en lo previsto.
    const b = pelea(guerreroCon('maza'), unidadDeArena(TROPA));
    const previsto = previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe');
    const [golpe] = dar(b, 'fuerte', 'normal').golpe;
    const h = previsto.porTipo?.fuerte?.danio;
    expect(golpe?.damage).toBeGreaterThanOrEqual(h?.min ?? Number.POSITIVE_INFINITY);
    expect(golpe?.damage).toBeLessThanOrEqual(h?.max ?? 0);
  });

  it('la Finta de la daga (nivel 5) resta menos casillas que la de la espada (nivel 3)', () => {
    // El jinete (6 o 7 casillas, lo que le deje el peso): tras golpear le queda por
    // andar, y el turno sigue. Contra uno que aguanta el golpe: con la fuerza y la
    // agilidad (25-10-2026), el guerrero con escudo caía de uno y la pelea acababa.
    const tras = (arma: string): number | undefined => {
      const jinete = equiparEnArena(unidadDeArena(JINETE), arma, EQ);
      const b = pelea(jinete, unidadDeArena(TROPA, { hp: 2000 }));
      // Contra Romper guardia, su opuesto: el éxito máximo.
      dar(b, 'finta', 'romperGuardia');
      expect(b.turno?.stack).toBe('attacker-0');
      return b.turno?.finta;
    };
    // Con el éxito máximo, la espada (nivel 3) resta 1 casilla y la daga (nivel 5),
    // ninguna. Con menos éxito restan más: con el mínimo, 5 y 3.
    expect(DAGA.rueda?.finta).toBe(5);
    expect(tras('espada')).toBe(1);
    expect(tras('daga')).toBe(0);
  });

  it('el contraataque va con el arma del que responde', () => {
    const vuelta = (arma: string) =>
      dar(pelea(unidadDeArena(TROPA), guerreroCon(arma)), 'normal', 'fuerte').vuelta;
    const [conMaza] = vuelta('maza');
    const [conLisa] = vuelta(MAZA_LISA.id);
    expect(conMaza?.stack).toBe('defender-0');
    expect(conMaza?.damage).toBeGreaterThan(conLisa?.damage ?? 0);
  });

  it('con dos armas, cada tipo de la rueda es el de la mejor de las dos (25-10-2026)', () => {
    // La lanza lleva Ofensivo 5, Fuerte 4 y Rápido 1; la espada, todo a 3. Con las
    // dos, el golpe va con Ofensivo 5 y Fuerte 4 de la lanza y Rápido 3 de la espada;
    // con la lanza lisa (todo a 3), todo a 3.
    const rueda = (lanza: string) => {
      const jinete = equiparEnArena(unidadDeArena(JINETE), lanza, EQ, 'segunda');
      expect(jinete.equipo).toMatchObject({ arma: 'espada', segunda: lanza });
      const b = pelea(jinete, unidadDeArena(TROPA));
      return previsionDeLaRueda(b, { type: 'attack', target: 'defender-0' }, 'golpe').rueda;
    };
    const dos = rueda('lanza');
    expect(dos.ofensivo.ataque).toBe(5);
    expect(dos.fuerte.porcentaje).toBe(167);
    expect(dos.rapido.porcentaje).toBe(63);
    const lisas = rueda(LANZA_LISA.id);
    expect(lisas.ofensivo.ataque).toBe(3);
    expect(lisas.fuerte.porcentaje).toBe(150);
    expect(lisas.rapido.porcentaje).toBe(63);
  });

  it('la rueda que se abre en la página enseña las cifras del arma de quien elige', () => {
    // Yo contra Yo, los dos con maza: elija quien elija, su Fuerte es ×1,83.
    const conMaza = {
      unidad: equiparEnArena(unidadDeArena(TROPA), 'maza', EQUIPO_DEL_JUEGO),
      ia: false,
    };
    const s = sesionDeArena([conMaza], [conMaza], 1);
    s.empezar();
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    expect(p.prevision.rueda.fuerte.porcentaje).toBe(183);
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    expect(m).toContain('Daño ×1,83.');
    expect(m).toContain('2 golpes de daño ×0,38 cada uno');
    expect(m).not.toContain('Daño ×1,5.');
  });
});

describe('la rueda teñida por el nivel del arma de quien pega (25-10-2026)', () => {
  // Requisito 5: «los tuyos cuando atacas y los de tu enemigo cuando defiendes». La
  // maza (Fuerte 5, Rápido 1) contra la espada (todo a 3): los niveles de las dos
  // fases son los de quien pega, nunca los de quien responde.
  const golpe = { type: 'attack', target: 'defender-0' } as const;
  const niveles = (b: BattleState) => ({
    golpe: previsionDeLaRueda(b, golpe, 'golpe').niveles,
    respuesta: previsionDeLaRueda(b, golpe, 'respuesta').niveles,
  });

  it('pega la maza: al golpear y al responder, los niveles de la maza; Normal, sin nivel', () => {
    const { golpe: alGolpear, respuesta } = niveles(
      pelea(guerreroCon('maza'), unidadDeArena(TROPA)),
    );
    const deLaMaza = { ...MAZA.rueda };
    expect(alGolpear).toEqual(deLaMaza);
    expect(respuesta).toEqual(deLaMaza);
    expect('normal' in alGolpear).toBe(false);
  });

  it('pega la espada contra la maza: los dos, los de la espada', () => {
    const { golpe: alGolpear, respuesta } = niveles(
      pelea(unidadDeArena(TROPA), guerreroCon('maza')),
    );
    expect(alGolpear).toEqual(nivelesDeLaEspada());
    expect(respuesta).toEqual(nivelesDeLaEspada());
  });

  it('en las ruedas de 5 y de 3, un fusionado lleva la media truncada de sus partes', () => {
    const maza = MAZA.rueda;
    if (maza === undefined) throw new Error('la maza no lleva rueda');
    // Ofensivo 3 y Fuerte 5 → 4; Defensivo 3 y Finta 1 → 2; Rápido 1 y Romper 5 → 3.
    expect(nivelesEnLaForma(maza, RUEDAS[5])).toEqual({
      ofensivoFuerte: 4,
      rapido: 1,
      romperGuardia: 5,
      defensivoFinta: 2,
    });
    expect(nivelesEnLaForma(maza, RUEDAS[3])).toEqual({
      ofensivoFuerte: 4,
      rapidoRomper: 3,
      defensivoFinta: 2,
    });
  });

  it('el diálogo pinta cada sector con su nivel y el centro sin él', () => {
    const conMaza = {
      unidad: equiparEnArena(unidadDeArena(TROPA), 'maza', EQUIPO_DEL_JUEGO),
      ia: false,
    };
    // El de enfrente con otro id: en una pelea, un id es una unidad (`catalogoDeLaPelea`).
    const conEspada = { unidad: unidadDeArena(TROPA, { id: `${TROPA}-9` }), ia: false };
    const s = sesionDeArena([conMaza], [conEspada], 1);
    s.empezar();
    hastaLaRueda(s, true, 'golpe');
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    for (const [tipo, nivel] of Object.entries(p.prevision.niveles)) {
      expect(m).toMatch(
        new RegExp(`class="sector" data-sector="${tipo}" data-veta="\\w+" data-nivel="${nivel}"`),
      );
    }
    expect(m).toMatch(/class="sector centro" data-sector="normal" r=/);
  });
});
