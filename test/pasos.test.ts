/**
 * Los nodos de paso se ven (#173): el eje de cada paso de montaña, bosque o
 * muro, con camino o sin él, no queda bajo un volumen.
 */

import { MEJORAS_DEL_PUESTO, type MejoraDelPuesto } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import { newGame } from '@core/state/setup.js';
import { describe, expect, it } from 'vitest';
import { catalogoValidado, type Pieza } from '../src/client/render/escenario/catalogo.js';
import {
  componer,
  formaDeLosPasos,
  pasosAtravesados,
  pasosTapados,
  puentesTapados,
  SEMIANCHO_DEL_PASO,
  type Sprite,
  sobreLaSenda,
} from '../src/client/render/escenario/colocar.js';
import {
  cajaDelHeroeEn,
  PIES,
  pieDeFigura,
} from '../src/client/render/escenario/figuras-del-mapa.js';
import { ejeDelPaso, esHito, pasosALaVista } from '../src/client/render/escenario/nodos.js';
import { cajaDeSprite, Obstaculos, pasilloDe } from '../src/client/render/escenario/pasillo.js';
import { seHorneaSuSombra, UMBRAL_DE_VOLUMEN } from '../src/client/render/escenario/pintar.js';
import {
  envolturaDelPuesto,
  esObra,
  MEDIDAS_DEL_PUESTO,
  obraDelPuesto,
  PIEZA_DEL_PUESTO,
  puestosQueTapan,
  puestosSobreElHeroe,
  puestosTapados,
  seVeConSuNodo,
  sitiosDeLosPuestos,
} from '../src/client/render/escenario/puestos.js';
import { catalogoDelDisco, partidaDe } from './escena-de-prueba.js';
import { rango, segunPrisa } from './lento.js';

/** Un terreno de `filas` (`#` montaña, `.` hierba), en orden de filas. */
function terreno(...filas: string[]): { W: number; t: TerrainKind[] } {
  return {
    W: (filas[0] as string).length,
    t: filas.flatMap((f) => [...f].map((c): TerrainKind => (c === '#' ? 'mountain' : 'grass'))),
  };
}

describe('el eje de un paso (`ejeDelPaso`), con el orden de `ejeDelNodo`', () => {
  it('recto y pleno: de la segunda casilla de un lado a la del otro', () => {
    const { W, t } = terreno(
      '.......', //
      '###.###',
      '###.###',
      '###.###',
      '.......',
    );
    expect(ejeDelPaso({ x: 3, y: 2 }, W, t)).toEqual([
      [
        [3.5, 0.5],
        [3.5, 4.5],
      ],
    ]);
  });

  it('diagonal cuando en recto no hay dos lados pisables', () => {
    const { W, t } = terreno(
      '..###', //
      '..###',
      '##.##',
      '###..',
      '###..',
    );
    expect(ejeDelPaso({ x: 2, y: 2 }, W, t)).toEqual([
      [
        [0.5, 0.5],
        [4.5, 4.5],
      ],
    ]);
  });

  it('corto pegado al borde: solo la vecina de cada lado', () => {
    const { W, t } = terreno(
      '#.#', //
      '#.#',
      '#.#',
    );
    expect(ejeDelPaso({ x: 1, y: 1 }, W, t)).toEqual([
      [
        [1.5, 0.5],
        [1.5, 2.5],
      ],
    ]);
  });

  it('sin lados opuestos, un brazo a cada vecina pisable en cruz', () => {
    const { W, t } = terreno(
      '#####', //
      '##.##',
      '##...',
      '#####',
    );
    expect(ejeDelPaso({ x: 2, y: 2 }, W, t)).toEqual([
      [
        [2.5, 2.5],
        [2.5, 1.5],
      ],
      [
        [2.5, 2.5],
        [4.5, 2.5],
      ],
    ]);
  });
});

describe('lo que tapa un paso: el contador y la puerta', () => {
  // Un paso de (2, 5) a (8, 5) por el centro de las casillas.
  const pasos = [
    {
      id: 'n',
      barrera: 'mountain' as const,
      eje: [
        [
          [2.5, 5.5],
          [8.5, 5.5],
        ] as const,
      ],
    },
  ];
  const pasillo = new Obstaculos([formaDeLosPasos(pasos)]);
  const sprite = (y: number, clase: Sprite['clase'], alto = 1.2): Sprite => ({
    src: 'x.webp',
    nw: 100,
    nh: 100,
    ax: 50,
    ay: 100,
    x: 5.5,
    y,
    alto,
    clase,
    color: '#000',
    capa: 0,
    sombra: false,
  });

  it('un pico al sur del paso, que crece hasta taparlo, se cuenta', () => {
    const pico = sprite(6.5, 'masa');
    expect(cajaDeSprite(pico)[1]).toBeLessThan(5.5);
    expect(pasosTapados([pico], pasos)).toEqual(pasos);
    expect(pasillo.pisa(pico)).toBe(true);
  });

  it('uno al norte, que crece hacia arriba, no', () => {
    const pico = sprite(5.1, 'masa');
    expect(pasosTapados([pico], pasos)).toEqual([]);
    expect(pasillo.pisa(pico)).toBe(false);
  });

  it('lo bajo no tapa: una mata encima del eje no cuenta y se queda', () => {
    const mata = sprite(5.6, 'cubierta', 0.4);
    expect(pasosTapados([mata], pasos)).toEqual([]);
    expect(pasillo.pisa(mata)).toBe(false);
    expect(pasillo.altoLibre(mata)).toBe(0.4);
  });

  it('ni lo que no se aparta: el muro y la pared son la barrera que el paso cruza', () => {
    expect(pasosTapados([sprite(6.5, 'muro'), sprite(6.5, 'pared')], pasos)).toEqual([]);
  });

  it('la puerta encoge la masa hasta salir del eje y deja lo demás como suelo', () => {
    const pico = sprite(6.5, 'masa');
    const alto = pasillo.altoLibre(pico);
    expect(alto).toBeLessThan(pico.alto);
    expect(pasosTapados([{ ...pico, alto }], pasos)).toEqual([]);
    // Pegado al eje: sin él, no le quedaría ni el umbral.
    const arbol = sprite(6, 'cubierta');
    // Hasta el umbral, con la precisión de la bisección: por encima sería volumen.
    const libre = pasillo.altoLibre(arbol);
    expect(libre).toBeLessThanOrEqual(UMBRAL_DE_VOLUMEN);
    expect(libre).toBeCloseTo(UMBRAL_DE_VOLUMEN, 2);
    expect(pasosTapados([{ ...arbol, alto: libre }], pasos)).toEqual([]);
  });
});

describe('el paso de montaña lo abre la cordillera, sin pieza (#203)', () => {
  const eje = [
    [
      [2.5, 5.5],
      [8.5, 5.5],
    ] as const,
  ];
  const deNodo = (src: string, nw: number, nh: number): Sprite => ({
    src,
    nw,
    nh,
    ax: nw / 2,
    ay: nh,
    x: 5.5,
    y: 5.85,
    alto: (1.7 * nh) / nw,
    clase: 'objeto',
    color: '#000',
    capa: 0,
    sombra: true,
    objeto: { id: 'n', kind: 'node' },
  });

  it('la pieza de dos picos atraviesa un eje este-oeste; el hito no cuenta', () => {
    const pasos = [{ id: 'n', barrera: 'mountain' as const, eje }];
    // `nodo-paso-montana` medía 1,7 casillas de ancho: el camino le entraba por un costado.
    expect(pasosAtravesados([deNodo('nodo-paso-montana.webp', 300, 260)], pasos)).toEqual(pasos);
    // El hito lleva su condición (`Sprite.deNodo`), como lo pone `componer`.
    const hito: Sprite = {
      ...deNodo('nodo-hito-mojon.webp', 300, 260),
      deNodo: { id: 'n', cuando: 'neutral' },
    };
    expect(pasosAtravesados([hito], pasos)).toEqual([]);
    // La pieza de otro nodo no es la suya.
    const ajena = {
      ...deNodo('nodo-paso-montana.webp', 300, 260),
      objeto: { id: 'm', kind: 'node' as const },
    };
    expect(pasosAtravesados([ajena], pasos)).toEqual([]);
    // La puerta de muralla se cruza por ella.
    const muro = [{ id: 'n', barrera: 'wall' as const, eje }];
    expect(pasosAtravesados([deNodo('nodo-puerta-ancho.webp', 300, 260)], muro)).toEqual([]);
  });

  it(`semillas ${segunPrisa('1, 9 y 443', '1-40 y 443')}: ningún nodo de montaña lleva pieza`, () => {
    let montana = 0;
    for (const s of segunPrisa([1, 9, 443], [...rango(1, 40), 443])) {
      const { map, escena } = partidaDe(s);
      const pasos = pasosALaVista(map, new Set(escena.puentes.map((p) => p.id)));
      // Los pasos de montaña: los nodos, sin el pueblo del muro (fase 3), que
      // lleva su pieza de pueblo.
      const nodos = new Set(map.objects.filter((o) => o.kind === 'node').map((o) => o.id));
      const deMontana = pasos.filter((p) => p.barrera === 'mountain' && nodos.has(p.id));
      montana += deMontana.length;
      expect(pasosAtravesados(escena.sprites, pasos), `semilla ${s}`).toEqual([]);
      expect(escena.informe.pasosAtravesados, `semilla ${s}`).toBe(0);
      for (const p of deMontana) {
        const pieza = escena.sprites.find((x) => x.objeto?.id === p.id);
        expect(esHito(pieza?.src?.replace(/\.webp$/, '') ?? null), `s${s} ${p.id}`).toBe(true);
      }
    }
    // Que mire algo: 121 nodos de montaña en 1-40 (08-10-2026).
    expect(montana).toBeGreaterThanOrEqual(segunPrisa(4, 100));
  });
});

describe('ningún paso queda tapado en las partidas', () => {
  it(`semillas ${segunPrisa('1, 8 y 13', '1-40')}: recontado desde los sprites`, () => {
    let vistos = 0;
    for (const s of segunPrisa([1, 8, 13], rango(1, 40))) {
      const { map, escena } = partidaDe(s);
      const pasos = pasosALaVista(map, new Set(escena.puentes.map((p) => p.id)));
      vistos += pasos.length;
      expect(pasosTapados(escena.sprites, pasos), `semilla ${s}`).toEqual([]);
      expect(escena.informe.pasosTapados, `semilla ${s}`).toBe(0);
    }
    // Que el guardia mire algo: 19 pasos de montaña, bosque o muro en 1, 8 y 13;
    // 242 en 1-40 (07-10-2026). El suelo, con holgura: el generador cambia (R3).
    expect(vistos).toBeGreaterThanOrEqual(segunPrisa(15, 200));
  });
});

describe('el puesto de un nodo (puesto fronterizo, fase 4)', () => {
  // Un nodo en (5, 5), con su paso de este a oeste y la senda por él.
  const eje = [
    [
      [3.5, 5.5],
      [7.5, 5.5],
    ] as const,
  ];
  const heroe = cajaDelHeroeEn(pieDeFigura({ x: 5, y: 5 }, PIES.heroe));
  const envoltura = { oeste: 0.35, este: 0.35, arriba: 1.5, abajo: 0 };
  /** Una obra del puesto de `id` con el pie en `(x, y)`: 0,7 × 1,5 casillas. */
  const obra = (x: number, y: number, cuando: MejoraDelPuesto = 'ninguna', id = 'n'): Sprite => ({
    src: 'puesto-caseta.webp',
    nw: 70,
    nh: 150,
    ax: 35,
    ay: 150,
    x,
    y,
    alto: 1.5,
    clase: 'objeto',
    color: '#000',
    capa: 0,
    sombra: true,
    deNodo: { id, cuando },
  });
  const pino = (x: number, y: number, alto = 1.2): Sprite => ({
    src: 'modulos/pinos/1.webp',
    nw: 60,
    nh: 120,
    ax: 30,
    ay: 120,
    x,
    y,
    alto,
    clase: 'masa',
    color: '#000',
    capa: 0,
    sombra: true,
  });

  it('el hito se ve en el neutral y cada obra solo con dueño y su mejora (`seVeConSuNodo`)', () => {
    const hito = { id: 'n', cuando: 'neutral' } as const;
    const caseta = { id: 'n', cuando: 'ninguna' } as const;
    expect(seVeConSuNodo(hito, undefined)).toBe(true);
    expect(seVeConSuNodo(hito, { owner: null, mejora: 'ninguna' })).toBe(true);
    expect(seVeConSuNodo(hito, { owner: 0, mejora: 'ninguna' })).toBe(false);
    expect(seVeConSuNodo(caseta, undefined)).toBe(false);
    expect(seVeConSuNodo(caseta, { owner: null, mejora: 'ninguna' })).toBe(false);
    expect(seVeConSuNodo(caseta, { owner: 1, mejora: 'ninguna' })).toBe(true);
    expect(seVeConSuNodo(caseta, { owner: 1, mejora: 'muralla' })).toBe(false);
  });

  it('los guardias de siempre ven las obras: sobre la senda, sobre el eje de un paso o el suyo', () => {
    const pasos = [{ id: 'n', barrera: 'mountain' as const, eje }];
    const muro = [{ id: 'n', barrera: 'wall' as const, eje }];
    // Con el pie en el eje, la pisa; al norte, por encima de la senda, no.
    expect(sobreLaSenda([obra(6.4, 5.6)], eje)).toHaveLength(1);
    expect(sobreLaSenda([obra(6.4, 4.95)], eje)).toEqual([]);
    expect(pasosTapados([obra(6.4, 5.6)], pasos)).toEqual(pasos);
    expect(pasosTapados([obra(6.4, 4.95)], pasos)).toEqual([]);
    // La obra es una pieza de su nodo: atraviesa su eje, también el de una puerta de muralla.
    expect(pasosAtravesados([obra(6.4, 5.6)], pasos)).toEqual(pasos);
    expect(pasosAtravesados([obra(6.4, 5.6)], muro)).toEqual(muro);
    expect(pasosAtravesados([obra(6.4, 5.6, 'ninguna', 'm')], muro)).toEqual([]);
  });

  it('`puentesTapados` cuenta la obra que se pinta sobre el tablero de un puente', () => {
    const tablero = [
      [4.5, 5.6],
      [4.5, 5.2],
      [6.5, 5.2],
      [6.5, 5.6],
    ] as const;
    const puente: Sprite = { ...pino(5.5, 5.5), clase: 'objeto', puente: 'p', src: 'p.webp' };
    const encima = obra(5.5, 5.9);
    expect(puentesTapados([puente, encima], [{ id: 'p', tablero }])).toEqual([encima]);
    expect(puentesTapados([puente, obra(5.5, 4.4)], [{ id: 'p', tablero }])).toEqual([]);
  });

  it('`puestosSobreElHeroe` cuenta la obra que toca al héroe parado en su nodo; no la de detrás', () => {
    const heroes = new Map([['n', heroe]]);
    expect(puestosSobreElHeroe([obra(5.5, 5.95)], heroes)).toEqual(['n']);
    expect(puestosSobreElHeroe([obra(5.5, heroe[1] - 0.01)], heroes)).toEqual([]);
    // La del puesto de otro nodo no es la suya.
    expect(puestosSobreElHeroe([obra(5.5, 5.95, 'ninguna', 'm')], heroes)).toEqual([]);
  });

  it('`puestosTapados` cuenta lo que se pinta después y la toca; no lo de detrás ni su hito', () => {
    expect(puestosTapados([obra(5.5, 5), pino(5.7, 5.4)])).toEqual(['n']);
    expect(puestosTapados([obra(5.5, 5), pino(5.7, 4.6)])).toEqual([]);
    expect(puestosTapados([obra(5.5, 5), pino(6.5, 5.4)])).toEqual([]);
    const hito: Sprite = {
      ...pino(5.5, 5.4),
      clase: 'objeto',
      deNodo: { id: 'n', cuando: 'neutral' },
    };
    expect(puestosTapados([obra(5.5, 5), hito, obra(5.5, 5, 'muralla')])).toEqual([]);
  });

  it('`puestosQueTapan` cuenta la obra que toca lo horneado de otro objeto pintado antes; no lo de después ni lo de su nodo', () => {
    /** La torre del sur de un recinto: horneada, de la ciudad `t`. */
    const torre = (x: number, y: number): Sprite => ({
      ...pino(x, y, 1.1),
      clase: 'objeto',
      objeto: { id: 't', kind: 'town' },
      recinto: 'torre',
    });
    // La torre al norte, con su pie bajo lo alto de la obra: la obra la tapa.
    expect(puestosQueTapan([torre(5.6, 3.8), obra(5.5, 5)])).toEqual(['n']);
    // Más al norte, sin tocarla; o al lado.
    expect(puestosQueTapan([torre(5.6, 3.4), obra(5.5, 5)])).toEqual([]);
    expect(puestosQueTapan([torre(6.5, 3.8), obra(5.5, 5)])).toEqual([]);
    // Lo que se pinta después la tapa a ella: eso es `puestosTapados`.
    expect(puestosQueTapan([obra(5.5, 5), torre(5.6, 5.4)])).toEqual([]);
    // Un volumen sin objeto (la masa) tampoco, ni la pieza de su nodo.
    expect(puestosQueTapan([pino(5.6, 3.8), obra(5.5, 5)])).toEqual([]);
    const suya: Sprite = { ...torre(5.6, 3.8), objeto: { id: 'n', kind: 'node' } };
    expect(puestosQueTapan([suya, obra(5.5, 5)])).toEqual([]);
  });

  it('la sombra de lo que se elige por su nodo no se hornea en el suelo (`seHorneaSuSombra`)', () => {
    const hito: Sprite = {
      ...pino(5.5, 5.4),
      clase: 'objeto',
      deNodo: { id: 'n', cuando: 'neutral' },
    };
    expect(seHorneaSuSombra(pino(5.5, 5))).toBe(true);
    expect(seHorneaSuSombra({ ...pino(5.5, 5), sombra: false })).toBe(false);
    expect(seHorneaSuSombra(hito)).toBe(false);
    for (const m of MEJORAS_DEL_PUESTO) expect(seHorneaSuSombra(obra(5.5, 5, m))).toBe(false);
  });

  it('cada obra va a la escala registrada sobre su guía; sin pieza, a la de su guía; sin su casilla, el catálogo lanza', () => {
    const cat = catalogoDelDisco();
    for (const m of MEJORAS_DEL_PUESTO) {
      const p = cat.piezas[PIEZA_DEL_PUESTO[m]];
      if (p?.puesto === undefined) throw new Error(`falta ${PIEZA_DEL_PUESTO[m]} en el catálogo`);
      expect(obraDelPuesto('n', m, p, [5, 5]).alto).toBeCloseTo(p.nh / p.puesto.pxPorCasilla, 9);
      const [x0, y0, x1, y1] = cajaDeSprite(obraDelPuesto('n', m, null, [5, 5]));
      const g = MEDIDAS_DEL_PUESTO[m];
      expect([x1 - x0, y1 - y0, y1]).toEqual([
        expect.closeTo(g.ancho, 9),
        expect.closeTo(g.fondo + g.alto, 9),
        5,
      ]);
    }
    const { puesto: _, ...sinCasilla } = cat.piezas['puesto-torre'] as Pieza;
    expect(() => catalogoValidado({ hojas: {}, piezas: { 'puesto-torre': sinCasilla } })).toThrow(
      /derivar-puestos/,
    );
    expect(() =>
      catalogoValidado({
        hojas: {},
        piezas: { cofre: { ...sinCasilla, puesto: { pxPorCasilla: 600 } } },
      }),
    ).toThrow(/no lo es/);
  });

  it('el sitio que elige no pisa el eje ni toca al héroe, y es el más cercano que cabe', () => {
    const pasillo = pasilloDe(eje, SEMIANCHO_DEL_PASO);
    const { sitios, sinSitio } = sitiosDeLosPuestos(
      [{ id: 'n', centro: [5.5, 5.5], heroe }],
      { pisa: (e) => pasillo.pisa(e), apoya: () => true, choca: () => false },
      envoltura,
    );
    expect(sinSitio).toEqual([]);
    const [s] = sitios;
    const ocupa = envolturaDelPuesto('n', s!.pie, envoltura);
    expect(pasillo.pisa(ocupa)).toBe(false);
    // Detrás del héroe: su base, a ras de lo alto de su cabeza.
    expect(s!.pie[1]).toBeLessThanOrEqual(heroe[1] + 1e-9);
    expect(Math.hypot(s!.pie[0] - 5.5, s!.pie[1] - 5.5)).toBeLessThan(0.8);
  });

  it(`semillas ${segunPrisa('1, 8 y 13', '1-40')}: todo nodo tiene sus tres obras, ninguna sobre el paso, el héroe ni tapada`, () => {
    let puestos = 0;
    for (const s of segunPrisa([1, 8, 13], rango(1, 40))) {
      const { map, escena } = partidaDe(s);
      const nodos = map.objects.filter((o) => o.kind === 'node').map((o) => o.id);
      const obras = escena.sprites.filter(esObra);
      for (const m of MEJORAS_DEL_PUESTO)
        expect(
          obras
            .filter((o) => o.deNodo.cuando === m)
            .map((o) => o.deNodo.id)
            .sort(),
          `semilla ${s}, ${m}`,
        ).toEqual([...nodos].sort());
      puestos += obras.length / MEJORAS_DEL_PUESTO.length;
      expect(escena.informe.puestosSinSitio, `semilla ${s}`).toBe(0);
      expect(escena.informe.puestosTapados, `semilla ${s}`).toBe(0);
      expect(escena.informe.puestosQueTapan, `semilla ${s}`).toBe(0);
      // Ni la sombra de una obra ni la del hito en el suelo horneado: las pinta el
      // mapa con su pieza, cuando se ve (QA de la fase 4, H-F4-1).
      const deNodo = escena.sprites.filter((x) => x.deNodo !== undefined);
      expect(deNodo.filter((x) => x.sombra).length, `semilla ${s}`).toBeGreaterThan(0);
      expect(
        deNodo.filter((x) => seHorneaSuSombra(x)),
        `semilla ${s}`,
      ).toEqual([]);
      // Y lo mismo recontado aquí, con el pasillo de los pasos de siempre.
      const pasos = pasosALaVista(map, new Set(escena.puentes.map((p) => p.id)));
      const ejes = new Obstaculos([formaDeLosPasos(pasos)]);
      for (const o of obras)
        expect(ejes.pisa({ ...o, clase: 'masa' }), `s${s} ${o.deNodo.id}`).toBe(false);
    }
    // Que mire algo: 541 nodos en 1-40 (05-11-2026).
    expect(puestos).toBeGreaterThanOrEqual(segunPrisa(30, 500));
  });

  it(`64×64, semillas ${segunPrisa('1 y 3', '1-6')}: todo nodo con sitio y nada lo tapa (QA de la fase 4, H-F4-3)`, () => {
    // s1 node-17 (19,31) no tenía sitio a 3 casillas (lo tiene a 3,01), y en s3
    // node-33 (35,59) la pieza de una bajada que subió de clave tapaba las tres obras.
    for (const s of segunPrisa([1, 3], rango(1, 6))) {
      const map = newGame({ seed: s, width: 64, height: 64 }).map;
      const { informe } = componer(map, s, catalogoDelDisco());
      expect(
        [informe.puestosSinSitio, informe.puestosTapados, informe.puestosQueTapan],
        `semilla ${s}`,
      ).toEqual([0, 0, 0]);
    }
  });
});
