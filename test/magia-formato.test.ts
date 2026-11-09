/**
 * El formato de un hechizo (`core/magia/`; docs/agents/2026-11-06-editor-de-magia/):
 * que los ejemplos del plan valgan, que cada regla de la validación muerda con su
 * frase y que la frase generada diga lo que hace. No mide nada de jugabilidad.
 */
import { describe, expect, it } from 'vitest';
import {
  catalogoDeHechizos,
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
import { FACTION_IDS } from '../src/core/types.js';

/** Un hechizo mínimo que vale, para romperlo campo a campo. */
const BASE: Hechizo = {
  id: 'prueba',
  nombre: 'Prueba',
  descripcion: 'Un hechizo de prueba.',
  mana: 3,
  gremio: null,
  facciones: ['templarios'],
  entrega: { tipo: 'libre' },
  objetivo: 'enemigo',
  efectos: [{ tipo: 'danio', cantidad: 10, armadura: true }],
};

function problemas(cambio: Record<string, unknown>): string[] {
  return problemasDelHechizo({ ...BASE, ...cambio });
}

describe('el catálogo de data/hechizos.json', () => {
  it('lleva los 43 ejemplos del plan, Levantar zombi, y todos valen', () => {
    expect(todosLosHechizos()).toHaveLength(44);
    expect(problemasDeLaLista(todosLosHechizos())).toEqual([]);
  });

  it('el gremio enseña los cinco de siempre y, a los no muertos, Levantar zombi en el 2', () => {
    expect(hechizosDelGremio(5, FACTION_IDS).map((h) => h.id)).toEqual([
      'haste',
      'magic_arrow',
      'slow',
      'levantar_zombi',
      'cure',
      'lightning_bolt',
    ]);
    // «Nivel 2» (decisión del usuario, 08-11-2026), y solo a los no muertos.
    expect(hechizosDelGremio(2, ['no-muertos']).map((h) => h.id)).toContain('levantar_zombi');
    expect(hechizosDelGremio(1, ['no-muertos']).map((h) => h.id)).not.toContain('levantar_zombi');
    expect(hechizosDelGremio(5, ['templarios']).map((h) => h.id)).not.toContain('levantar_zombi');
    expect(hechizosDelGremio(1, FACTION_IDS).map((h) => h.id)).toEqual([
      'haste',
      'magic_arrow',
      'slow',
    ]);
    expect(hechizosDelGremio(0, FACTION_IDS)).toEqual([]);
    // Los cinco son de las cinco facciones (08-11-2026): el gremio de cada una enseña
    // lo mismo, salvo Levantar zombi, que es solo de los no muertos.
    const sinLevantar = hechizosDelGremio(5, FACTION_IDS).filter((h) => h.id !== 'levantar_zombi');
    for (const f of FACTION_IDS) {
      if (f === 'no-muertos') continue;
      expect(hechizosDelGremio(5, [f]), f).toEqual(sinLevantar);
    }
  });

  it('el gremio de una facción enseña solo los suyos; con todas, los de todas', () => {
    const deElfos: Hechizo = {
      ...BASE,
      id: 'elfico',
      nombre: 'Élfico',
      gremio: 1,
      facciones: ['elfos'],
    };
    const deTodas: Hechizo = {
      ...BASE,
      id: 'comun',
      nombre: 'Común',
      gremio: 1,
      facciones: [...FACTION_IDS],
    };
    const cat = catalogoDeHechizos([deElfos, deTodas]);
    expect(hechizosDelGremio(5, ['orkos'], cat).map((h) => h.id)).toEqual(['comun']);
    expect(hechizosDelGremio(5, ['elfos'], cat).map((h) => h.id)).toEqual(['comun', 'elfico']);
    expect(hechizosDelGremio(5, FACTION_IDS, cat).map((h) => h.id)).toEqual(['comun', 'elfico']);
  });

  it('las facciones de hoy, a ojo: Curar de los templarios, los dos de zombis de los no muertos, los demás de las cinco', () => {
    expect(hechizo('curar').facciones).toEqual(['templarios']);
    expect(hechizo('zombi_pegajoso').facciones).toEqual(['no-muertos']);
    expect(hechizo('levantar_zombi').facciones).toEqual(['no-muertos']);
    for (const h of todosLosHechizos()) {
      if (['curar', 'zombi_pegajoso', 'levantar_zombi'].includes(h.id)) continue;
      expect(h.facciones, h.id).toEqual(FACTION_IDS);
    }
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
    ['facciones que no es una lista', { facciones: 'elfos' }, /facciones tiene que ser una lista/],
    ['facciones sin valor', { facciones: undefined }, /facciones tiene que ser una lista/],
    [
      'facciones vacía',
      { facciones: [] },
      /facciones está vacía: un hechizo es de una facción o de varias/,
    ],
    [
      'una facción que no existe',
      { facciones: ['elfos', 'enanos'] },
      /facciones: "enanos" no existe; valen templarios, no-muertos, imperio, elfos, orkos/,
    ],
    ['una facción repetida', { facciones: ['elfos', 'elfos'] }, /facciones: «elfos» va dos veces/],
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

  it('sin facciones no vale: no hay hechizos de antes', () => {
    const { facciones: _fuera, ...sin } = BASE;
    expect(problemasDelHechizo(sin)).toEqual(['«Prueba»: falta «facciones»']);
  });

  it('de varias facciones vale', () => {
    expect(problemas({ facciones: ['elfos', 'orkos'] })).toEqual([]);
    expect(problemas({ facciones: [...FACTION_IDS] })).toEqual([]);
  });

  it('dice todos los problemas a la vez', () => {
    expect(problemas({ mana: -1, gremio: 9, efectos: [] }).length).toBe(3);
  });
});

describe('a un cadáver y levantar (08-11-2026, «Levantar zombi»)', () => {
  const LEVANTAR = { tipo: 'levantar', vivos: 'zombi', de: { zombi: 'esqueleto-guerrero' } };
  const AL_CADAVER = {
    entrega: { tipo: 'alcance', casillas: 4 },
    objetivo: 'cadaver',
    efectos: [LEVANTAR],
  };

  it('vale con libre, en contacto y a x casillas, y la frase dice qué sale de cada uno', () => {
    expect(problemas(AL_CADAVER)).toEqual([]);
    expect(problemas({ ...AL_CADAVER, entrega: { tipo: 'libre' } })).toEqual([]);
    expect(problemas({ ...AL_CADAVER, entrega: { tipo: 'contacto' } })).toEqual([]);
    expect(problemas({ ...AL_CADAVER, efectos: [{ tipo: 'levantar', vivos: 'zombi' }] })).toEqual(
      [],
    );
    expect(queHaceElHechizo({ ...BASE, ...AL_CADAVER } as Hechizo)).toBe(
      'A un cadáver a 4 casillas o menos: levanta zombi del cadáver de un vivo; del de zombi, esqueleto guerrero; de otro no-muerto o del héroe, nada',
    );
  });

  it('el proyectil no llega a un cadáver; sobre sí y el tablero no eligen nada', () => {
    expect(problemas({ ...AL_CADAVER, entrega: { tipo: 'proyectil' } })).toEqual([
      '«Prueba»: a un cadáver se llega con la entrega «libre», «contacto», «alcance», no con «proyectil»',
    ]);
    expect(problemas({ ...AL_CADAVER, entrega: { tipo: 'tablero' } })).toContain(
      '«Prueba»: con la entrega «tablero» no se elige nada: sobra «objetivo»',
    );
  });

  it('ni diferido, ni área, ni «afecta», ni otro efecto con levantar', () => {
    expect(problemas({ ...AL_CADAVER, entrega: { tipo: 'libre', diferido: true } })).toEqual([
      '«Prueba»: a un cadáver no se lanza diferido: al caer, el cadáver podría ya no estar',
    ]);
    expect(problemas({ ...AL_CADAVER, area: 1 })).toEqual([
      '«Prueba»: a un cadáver no hay área: se levanta uno',
    ]);
    expect(problemas({ ...AL_CADAVER, afecta: 'todos' })).toEqual([
      '«Prueba»: a un cadáver sobra «afecta»: no alcanza a nadie vivo',
    ]);
    expect(
      problemas({ ...AL_CADAVER, efectos: [LEVANTAR, { tipo: 'cura', cantidad: 3 }] }),
    ).toEqual(['«Prueba»: a un cadáver se lanza un solo efecto, «levantar»']);
    expect(problemas({ ...AL_CADAVER, efectos: [{ tipo: 'cura', cantidad: 3 }] })).toEqual([
      '«Prueba»: a un cadáver se lanza un solo efecto, «levantar»',
    ]);
  });

  it('levantar solo va con un cadáver, y nunca dentro de un disparador', () => {
    expect(problemas({ efectos: [LEVANTAR] })).toEqual([
      '«Prueba»: «levantar» solo va con el objetivo «cadaver»: se levanta de un cadáver',
    ]);
    const dentro = {
      tipo: 'disparador',
      cuando: 'alMorir',
      a: 'alrededor',
      radio: 1,
      afecta: 'todos',
      efectos: [LEVANTAR],
    };
    expect(problemas({ efectos: [dentro] })).toContain(
      '«Prueba»: efectos[0] (disparador).efectos[0] (levantar): un disparador no levanta',
    );
  });

  it('los ids de levantar tienen la forma de una unidad', () => {
    expect(
      problemas({ ...AL_CADAVER, efectos: [{ tipo: 'levantar', vivos: 'Zombi', de: {} }] }),
    ).toEqual([
      '«Prueba»: efectos[0] (levantar).vivos tiene que ser el id de una unidad (minúsculas, cifras y guiones)',
      '«Prueba»: efectos[0] (levantar).de no nombra a nadie: sin nada, se quita',
    ]);
    expect(
      problemas({
        ...AL_CADAVER,
        efectos: [{ tipo: 'levantar', vivos: 'zombi', de: { zombi: 3 } }],
      }),
    ).toEqual([
      '«Prueba»: efectos[0] (levantar).de.zombi tiene que ser el id de una unidad (minúsculas, cifras y guiones)',
    ]);
    expect(
      problemas({ ...AL_CADAVER, efectos: [{ tipo: 'levantar', vivos: 'zombi', resucita: true }] }),
    ).toHaveLength(1);
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
