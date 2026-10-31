/**
 * El jurado de la revisión de animaciones (`tools/taller/revision/jurado.ts` y
 * `esquemas.ts`): la unión de los hallazgos de los dos jueces, el cruce de los dos
 * árbitros con la respuesta del visor, las instrucciones que llegan al pintor y el
 * JSON Schema estricto que recibe Codex.
 */

import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  arbitrajeSchema,
  comparacionSchema,
  esquemaParaCodex,
  type Hallazgo,
  type Juicio,
  juicioSchema,
  validarCon,
} from '../tools/taller/revision/esquemas.js';
import {
  casoDeDisputa,
  cruzarArbitrajes,
  instruccionesPorHoja,
  problemasDelArbitraje,
  problemasDelJuicio,
  unirHallazgos,
} from '../tools/taller/revision/jurado.js';
import { deAntesDeLaHoja, juicioVigente } from '../tools/taller/revision/revisar.js';

const hallazgo = (o: Partial<Hallazgo>): Hallazgo => ({
  categoria: 'pose',
  tipo: 'no_copia_al_maniqui',
  fotogramas: [3],
  severidad: 2,
  que_se_ve: 'en el 3 la pierna de delante es la izquierda',
  correccion: 'fotograma 3: adelanta la derecha',
  ...o,
});
const juicio = (hallazgos: Hallazgo[]): Juicio => ({
  clip: 'x',
  veredicto: 'retocar',
  hallazgos,
  resumen: '',
});

describe('la unión de los dos jueces', () => {
  it('cada hallazgo con su fuente; el mismo defecto de los dos, una vez y con las dos', () => {
    const union = unirHallazgos({
      gpt: juicio([
        hallazgo({ fotogramas: [3, 4] }),
        hallazgo({ categoria: 'encuadre', tipo: 'salto_de_posicion', fotogramas: [6] }),
      ]),
      claude: juicio([
        hallazgo({ fotogramas: [4], severidad: 3 }),
        hallazgo({ categoria: 'coherencia', tipo: 'cambia_el_color' }),
      ]),
    });
    expect(union.map((u) => [u.indice, u.fuentes, u.hallazgo.tipo])).toEqual([
      [0, ['gpt', 'claude'], 'no_copia_al_maniqui'],
      [1, ['gpt'], 'salto_de_posicion'],
      [2, ['claude'], 'cambia_el_color'],
    ]);
    // Los fotogramas de los dos y la severidad mayor.
    expect(union[0]?.hallazgo.fotogramas).toEqual([3, 4]);
    expect(union[0]?.hallazgo.severidad).toBe(3);
  });
  it('sin fotogramas en común son dos defectos', () => {
    const union = unirHallazgos({
      gpt: juicio([hallazgo({ fotogramas: [1] })]),
      claude: juicio([hallazgo({ fotogramas: [5] })]),
    });
    expect(union).toHaveLength(2);
  });
});

describe('el cruce de los árbitros', () => {
  const union = unirHallazgos({
    gpt: juicio([
      hallazgo({ fotogramas: [1] }),
      hallazgo({ fotogramas: [2], tipo: 'lado_cambiado' }),
      hallazgo({ fotogramas: [5], tipo: 'cambia_el_arma' }),
    ]),
  });
  const arbitraje = (decisiones: ('real' | 'falso' | 'dudoso')[], omitidos: Hallazgo[] = []) => ({
    clip: 'x',
    decisiones: decisiones.map((decision, indice) => ({ indice, decision, motivo: '' })),
    omitidos,
  });
  const caso = (i: number) => casoDeDisputa(0, 'walk', i);

  it('real si los dos dicen real, falso si los dos falso, disputa si no; la disputa es defecto probable', () => {
    const r = cruzarArbitrajes(
      union,
      { gpt: arbitraje(['real', 'falso', 'real']), claude: arbitraje(['real', 'falso', 'dudoso']) },
      {},
      caso,
    );
    expect(r.map((h) => [h.estado, h.defecto])).toEqual([
      ['real', true],
      ['falso', false],
      ['disputa', true],
    ]);
  });
  it('la respuesta del visor resuelve la disputa: «no» es falso; lo demás, real', () => {
    const arb = {
      gpt: arbitraje(['real', 'real', 'real']),
      claude: arbitraje(['falso', 'falso', 'real']),
    };
    const r = cruzarArbitrajes(
      union,
      arb,
      { [caso(0)]: { valor: 'no' }, [caso(1)]: { valor: 'sí, pero apenas' } },
      caso,
    );
    expect(r.map((h) => [h.estado, h.defecto, h.persona])).toEqual([
      ['falso', false, 'no'],
      ['real', true, 'sí, pero apenas'],
      ['real', true, undefined],
    ]);
  });
  it('lo que un árbitro añade (omitidos) entra en disputa', () => {
    const r = cruzarArbitrajes(
      union,
      {
        gpt: arbitraje(['real', 'real', 'real'], [hallazgo({ fotogramas: [7] })]),
        claude: arbitraje(['real', 'real', 'real']),
      },
      {},
      caso,
    );
    expect(r).toHaveLength(4);
    expect(r[3]).toMatchObject({
      indice: 3,
      estado: 'disputa',
      defecto: true,
      arbitros: { gpt: 'real' },
    });
  });
});

describe('las instrucciones para el pintor', () => {
  it('de los defectos de severidad 2 o más, por hoja y sin el encuadre', () => {
    const cruzados = cruzarArbitrajes(
      unirHallazgos({
        gpt: juicio([
          hallazgo({ fotogramas: [4], correccion: 'fotograma 4: la derecha delante' }),
          hallazgo({ fotogramas: [2], severidad: 1, tipo: 'lado_cambiado' }),
          hallazgo({
            fotogramas: [6],
            categoria: 'encuadre',
            tipo: 'salto_de_posicion',
            severidad: 3,
          }),
          hallazgo({ fotogramas: [7], tipo: 'cambia_el_arma' }),
        ]),
      }),
      {
        gpt: {
          clip: 'x',
          decisiones: [0, 1, 2, 3].map((indice) => ({
            indice,
            decision: indice === 3 ? 'falso' : 'real',
            motivo: '',
          })),
          omitidos: [],
        },
        claude: {
          clip: 'x',
          decisiones: [0, 1, 2, 3].map((indice) => ({
            indice,
            decision: indice === 3 ? 'falso' : 'real',
            motivo: '',
          })),
          omitidos: [],
        },
      },
      {},
      (i) => casoDeDisputa(0, 'walk', i),
    );
    expect(
      instruccionesPorHoja([{ clip: 'walk', hoja: 'a', fila: 1, hallazgos: cruzados }]),
    ).toEqual({
      a: '- Fila 2 (walk), columna(s) 4: fotograma 4: la derecha delante',
    });
  });
});

describe('el JSON Schema que recibe Codex', () => {
  /** Que todo objeto sea estricto: sin propiedades de más y con todas en `required`. */
  function estricto(s: unknown, ruta = '$'): string[] {
    if (s === null || typeof s !== 'object') return [];
    const o = s as Record<string, unknown>;
    const fallos: string[] = [];
    if (o.type === 'object') {
      const props = Object.keys((o.properties as object | undefined) ?? {});
      if (o.additionalProperties !== false) fallos.push(`${ruta}: additionalProperties`);
      const req = (o.required as string[] | undefined) ?? [];
      for (const p of props) if (!req.includes(p)) fallos.push(`${ruta}.${p}: no está en required`);
    }
    for (const [k, v] of Object.entries(o)) fallos.push(...estricto(v, `${ruta}.${k}`));
    return fallos;
  }
  for (const [nombre, esquema] of [
    ['juicio', juicioSchema],
    ['arbitraje', arbitrajeSchema],
    ['comparación', comparacionSchema],
  ] as const)
    it(`el del ${nombre} es estricto`, () => {
      const s = esquemaParaCodex(esquema);
      expect(s.type).toBe('object');
      expect(s.$schema).toBeUndefined();
      expect(estricto(s)).toEqual([]);
    });
  it('un juicio con un campo de más o un tipo inventado no pasa, y dice cuál', () => {
    expect(() =>
      validarCon(juicioSchema, JSON.stringify({ ...juicio([]), extra: 1 }), 'j.json'),
    ).toThrow(/j.json no cumple su esquema/);
    expect(() =>
      validarCon(
        juicioSchema,
        JSON.stringify(juicio([{ ...hallazgo({}), tipo: 'otro' as never }])),
        'j.json',
      ),
    ).toThrow(/hallazgos\.0\.tipo/);
  });
});

// QA del 30-10-2026, H7: lo que el esquema no puede saber.
describe('un juicio o un arbitraje que no es de su clip', () => {
  it('otro clip o fotogramas fuera de 1..n se dicen', () => {
    const j = { ...juicio([hallazgo({ fotogramas: [0, 3, 42] })]), clip: 'elfo-arquero-d0-walk' };
    expect(problemasDelJuicio(j, 'templario-escudo-d4-idle', 7)).toEqual([
      'es del clip «elfo-arquero-d0-walk» y no de «templario-escudo-d4-idle»',
      'el hallazgo 0 nombra fotogramas fuera de 1-7: 0, 42',
    ]);
    expect(problemasDelJuicio({ ...juicio([hallazgo({})]), clip: 'x' }, 'x', 7)).toEqual([]);
  });
  it('un índice repetido o que no existe se dice', () => {
    const a = {
      clip: 'x',
      decisiones: [
        { indice: 0, decision: 'real' as const, motivo: '' },
        { indice: 0, decision: 'falso' as const, motivo: '' },
        { indice: 99, decision: 'real' as const, motivo: '' },
      ],
      omitidos: [hallazgo({ fotogramas: [8] })],
    };
    expect(problemasDelArbitraje(a, 'x', 2, 7)).toEqual([
      'decide el hallazgo [0] dos veces',
      'decide el hallazgo [99], que no existe (hay 2)',
      'el omitido 0 nombra fotogramas fuera de 1-7: 8',
    ]);
  });
});

// QA del 30-10-2026, H2: un juicio guardado vale solo para lo que juzgó.
describe('la huella de un juicio', () => {
  it('con otra huella no vale; uno de antes de las huellas vale si es más nuevo que su hoja', () => {
    const dir = mkdtempSync(join(tmpdir(), 'taller-huella-'));
    try {
      const salida = join(dir, 'juicio.gpt.json');
      const hoja = join(dir, 'hoja-a.webp');
      writeFileSync(hoja, 'hoja');
      writeFileSync(salida, '{}');
      writeFileSync(`${salida}.huella`, 'vieja');
      expect(juicioVigente(salida, 'nueva', [hoja])).toBe(false);
      expect(juicioVigente(salida, 'vieja', [hoja])).toBe(true);
      // Sin `.huella`: vale si es más nuevo que la hoja, y entonces se le apunta.
      rmSync(`${salida}.huella`);
      utimesSync(hoja, new Date(1000), new Date(1000));
      expect(juicioVigente(salida, 'hoy', [hoja])).toBe(true);
      expect(juicioVigente(salida, 'otra', [hoja])).toBe(false);
      rmSync(`${salida}.huella`);
      utimesSync(hoja, new Date(), new Date(Date.now() + 60_000));
      expect(juicioVigente(salida, 'hoy', [hoja])).toBe(false);
      // Los de Claude, sin huella: por la fecha de la hoja.
      expect(deAntesDeLaHoja(salida, hoja)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
