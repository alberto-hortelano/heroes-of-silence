/**
 * El formato de un hechizo (`core/magia/`; docs/agents/2026-11-06-editor-de-magia/):
 * que los ejemplos del plan valgan, que cada regla de la validación muerda con su
 * frase y que la frase generada diga lo que hace. No mide nada de jugabilidad.
 */
import { describe, expect, it } from 'vitest';
import {
  HECHIZOS_DEL_JUEGO,
  hechizo,
  hechizosDelGremio,
  todosLosHechizos,
} from '../src/core/magia/catalogo.js';
import { queHaceElHechizo } from '../src/core/magia/dicho.js';
import type { Hechizo } from '../src/core/magia/formato.js';
import {
  leerHechizos,
  problemasComoPoder,
  problemasDeLaLista,
  problemasDelHechizo,
} from '../src/core/magia/validar.js';

/** Un hechizo mínimo que vale, para romperlo campo a campo. */
const BASE: Hechizo = {
  id: 'prueba',
  nombre: 'Prueba',
  descripcion: 'Un hechizo de prueba.',
  mana: 3,
  gremio: null,
  entrega: { tipo: 'libre' },
  objetivo: 'enemigo',
  efectos: [{ tipo: 'danio', cantidad: 10, armadura: true }],
};

function problemas(cambio: Record<string, unknown>): string[] {
  return problemasDelHechizo({ ...BASE, ...cambio });
}

describe('el catálogo de data/hechizos.json', () => {
  it('lleva los 43 ejemplos del plan y todos valen', () => {
    expect(todosLosHechizos()).toHaveLength(43);
    expect(problemasDeLaLista(todosLosHechizos())).toEqual([]);
  });

  it('el gremio enseña solo los cinco de siempre, en el orden del libro', () => {
    expect(hechizosDelGremio(5).map((h) => h.id)).toEqual([
      'haste',
      'magic_arrow',
      'slow',
      'cure',
      'lightning_bolt',
    ]);
    expect(hechizosDelGremio(1).map((h) => h.id)).toEqual(['haste', 'magic_arrow', 'slow']);
    expect(hechizosDelGremio(0)).toEqual([]);
  });

  it('los tres del usuario están', () => {
    for (const id of ['zombi_pegajoso', 'luz_cegadora', 'berserker']) {
      expect(HECHIZOS_DEL_JUEGO.has(id)).toBe(true);
    }
  });

  it('lanza con todos los problemas a la vez y el fichero', () => {
    const malo = {
      hechizos: [
        { ...BASE, mana: -1 },
        { ...BASE, id: 'otro', nombre: '' },
      ],
    };
    expect(() => leerHechizos(malo, 'x.json')).toThrow(/x\.json:[\s\S]*maná[\s\S]*nombre/);
  });

  it('ni ids ni nombres repetidos', () => {
    expect(problemasDeLaLista([BASE, BASE])).toEqual([
      'el id «prueba» está dos veces',
      'el nombre «Prueba» está dos veces',
    ]);
  });
});

describe('cada regla del hechizo muerde', () => {
  it('el mínimo vale', () => {
    expect(problemasDelHechizo(BASE)).toEqual([]);
  });

  const casos: [string, Record<string, unknown>, RegExp][] = [
    ['un campo que no existe', { poder: 3 }, /«poder» no es un campo/],
    ['un id con mayúsculas', { id: 'Prueba' }, /el id "Prueba" no vale/],
    ['sin descripción', { descripcion: ' ' }, /la descripción tiene que ser un texto/],
    ['maná negativo', { mana: -1 }, /el maná tiene que ser un entero de 0 a 99/],
    ['gremio 6', { gremio: 6 }, /el gremio tiene que ser un entero de 1 a 5/],
    ['entrega desconocida', { entrega: { tipo: 'teleporte' } }, /entrega\.tipo/],
    ['alcance sin casillas', { entrega: { tipo: 'alcance' } }, /falta «casillas»/],
    [
      'sobre sí con objetivo',
      { entrega: { tipo: 'sobreSi' } },
      /con la entrega «sobreSi» no se elige nada/,
    ],
    ['sin objetivo', { objetivo: undefined }, /falta «objetivo»/],
    [
      'proyectil a una unidad',
      { entrega: { tipo: 'proyectil' }, afecta: 'todos' },
      /un proyectil se apunta a una casilla/,
    ],
    [
      'diferido a una unidad',
      { entrega: { tipo: 'libre', diferido: true } },
      /lo diferido sale sobre una casilla/,
    ],
    ['recta sin proyectil', { area: 'recta', afecta: 'todos' }, /«recta» solo vale con/],
    ['área sin afecta', { area: 1 }, /falta «afecta»/],
    ['afecta sin área', { afecta: 'todos' }, /sobra «afecta»/],
    ['área de 5', { area: 5, afecta: 'todos' }, /area tiene que ser un entero de 0 a 4/],
    ['sin efectos', { efectos: [] }, /no tiene ningún efecto/],
    [
      'algo que dura sin duración',
      { efectos: [{ tipo: 'cifra', cifra: 'ataque', valor: 1 }] },
      /deja algo que dura y no dice cuánto/,
    ],
    ['duración en lo instantáneo', { duracion: 'pelea' }, /no lleva «duracion»/],
    [
      'la misma cifra dos veces',
      {
        duracion: 'pelea',
        efectos: [
          { tipo: 'cifra', cifra: 'ataque', valor: 1 },
          { tipo: 'cifra', cifra: 'ataque', valor: 2 },
        ],
      },
      /la cifra «ataque» va dos veces/,
    ],
    [
      'una cifra a 0',
      { duracion: 'pelea', efectos: [{ tipo: 'cifra', cifra: 'fuerza', valor: 0 }] },
      /no puede ser 0/,
    ],
    [
      'impide nada',
      { duracion: 'pelea', efectos: [{ tipo: 'impide', que: [] }] },
      /no impide nada/,
    ],
    [
      'daño sin decir la armadura',
      { efectos: [{ tipo: 'danio', cantidad: 3 }] },
      /armadura tiene que ser true/,
    ],
    [
      'portador fuera de un disparador',
      {
        duracion: { hasta: 'empezar', turnoDe: 'portador' },
        efectos: [{ tipo: 'impide', que: ['moverse'] }],
      },
      /«portador» solo vale dentro de un disparador/,
    ],
    [
      'un disparador dentro de otro',
      {
        duracion: 'pelea',
        efectos: [
          {
            tipo: 'disparador',
            cuando: 'alGolpear',
            a: 'portador',
            efectos: [{ tipo: 'disparador', cuando: 'alGolpear', a: 'portador', efectos: [] }],
          },
        ],
      },
      /un disparador no lleva otro dentro/,
    ],
    [
      '«otro» al empezar su turno',
      {
        duracion: 'pelea',
        efectos: [
          {
            tipo: 'disparador',
            cuando: 'empezarSuTurno',
            a: 'otro',
            efectos: [{ tipo: 'cura', cantidad: 3 }],
          },
        ],
      },
      /«otro» solo vale con alSerGolpeado o alGolpear/,
    ],
    [
      'al morir sobre el portador',
      {
        duracion: 'pelea',
        efectos: [
          {
            tipo: 'disparador',
            cuando: 'alMorir',
            a: 'portador',
            efectos: [{ tipo: 'cura', cantidad: 3 }],
          },
        ],
      },
      /alMorir solo vale con «alrededor»/,
    ],
    [
      'alrededor sin radio',
      {
        duracion: 'pelea',
        efectos: [
          {
            tipo: 'disparador',
            cuando: 'alMorir',
            a: 'alrededor',
            afecta: 'enemigos',
            efectos: [{ tipo: 'danio', cantidad: 3, armadura: true }],
          },
        ],
      },
      /con «alrededor» falta «radio»/,
    ],
    [
      'un disparador que deja algo sin duración',
      {
        duracion: 'pelea',
        efectos: [
          {
            tipo: 'disparador',
            cuando: 'alSerGolpeado',
            a: 'otro',
            efectos: [{ tipo: 'impide', que: ['golpear'] }],
          },
        ],
      },
      /deja algo que dura y no dice cuánto/,
    ],
    [
      'yAlLanzarse al golpear',
      {
        duracion: 'pelea',
        efectos: [
          {
            tipo: 'disparador',
            cuando: 'alGolpear',
            a: 'portador',
            yAlLanzarse: true,
            efectos: [{ tipo: 'cura', cantidad: 3 }],
          },
        ],
      },
      /«yAlLanzarse» solo vale con/,
    ],
    ['seAcabaSiMuere sin duración', { seAcabaSiMuere: 'lanzador' }, /solo con algo que dura/],
    [
      'cantidad 0 con 0',
      { efectos: [{ tipo: 'danio', cantidad: { base: 0, porPoder: 0 }, armadura: true }] },
      /no puede ser 0 con 0/,
    ],
  ];
  for (const [que, cambio, frase] of casos) {
    it(`no vale: ${que}`, () => {
      const p = problemas(cambio);
      expect(p.join('\n')).toMatch(frase);
      // Cada frase lleva el nombre del hechizo delante.
      expect(p.every((x) => x.startsWith('«Prueba»: '))).toBe(true);
    });
  }

  it('dice todos los problemas a la vez', () => {
    expect(problemas({ mana: -1, gremio: 9, efectos: [] }).length).toBe(3);
  });
});

describe('como poder de una unidad', () => {
  it('Curar vale; uno que crece con el poder, no', () => {
    expect(problemasComoPoder(hechizo('curar'))).toEqual([]);
    expect(problemasComoPoder(hechizo('cure'))).toEqual([
      '«Curación» como poder: efectos[0]: una unidad no tiene poder mágico: «porPoder» no sumaría nada',
    ]);
    expect(problemasComoPoder(hechizo('haste')).join()).toMatch(/rondas: poder/);
  });
});

describe('la frase de lo que hace', () => {
  it('los tres del usuario', () => {
    expect(queHaceElHechizo(hechizo('zombi_pegajoso'))).toBe(
      'A un aliado pegado a quien lo lanza: cuando le golpean cuerpo a cuerpo (no un contraataque), a quien le golpeó: no puede golpear ni disparar hasta que empiece el próximo turno de quien lo lleva, o hasta que caiga quien lo lleva, toda la pelea',
    );
    expect(queHaceElHechizo(hechizo('luz_cegadora'))).toMatch(
      /^A un aliado del tablero: al empezar cada turno de quien lo lleva \(y al lanzarse\), a los enemigos a 1 casilla: ataque -3/,
    );
    expect(queHaceElHechizo(hechizo('berserker'), 2)).toBe(
      'A un aliado del tablero: fuerza +3; al empezar cada turno de quien lo lleva, a quien lo lleva: 6 de daño sin armadura, durante 2 rondas',
    );
  });

  it('con y sin el poder', () => {
    expect(queHaceElHechizo(hechizo('magic_arrow'))).toBe(
      'A un enemigo del tablero: 30 + 30 por poder de daño',
    );
    expect(queHaceElHechizo(hechizo('magic_arrow'), 2)).toBe(
      'A un enemigo del tablero: 90 de daño',
    );
    expect(queHaceElHechizo(hechizo('meteoro'))).toMatch(
      /y a todos a 1 casilla de allí; cae al empezar el siguiente turno/,
    );
  });
});
