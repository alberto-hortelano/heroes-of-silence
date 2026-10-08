/**
 * Los nodos de paso se ven (#173): el eje de cada paso de montaña, bosque o
 * muro, con camino o sin él, no queda bajo un volumen.
 */
import type { TerrainKind } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import {
  formaDeLosPasos,
  pasosAtravesados,
  pasosTapados,
  type Sprite,
} from '../src/client/render/escenario/colocar.js';
import { ejeDelPaso, esHito, pasosALaVista } from '../src/client/render/escenario/nodos.js';
import { cajaDeSprite, Obstaculos } from '../src/client/render/escenario/pasillo.js';
import { UMBRAL_DE_VOLUMEN } from '../src/client/render/escenario/pintar.js';
import { partidaDe } from './helpers.js';
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
    expect(pasosAtravesados([deNodo('nodo-hito-mojon.webp', 300, 260)], pasos)).toEqual([]);
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
      montana += pasos.filter((p) => p.barrera === 'mountain').length;
      expect(pasosAtravesados(escena.sprites, pasos), `semilla ${s}`).toEqual([]);
      expect(escena.informe.pasosAtravesados, `semilla ${s}`).toBe(0);
      for (const p of pasos.filter((q) => q.barrera === 'mountain')) {
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
