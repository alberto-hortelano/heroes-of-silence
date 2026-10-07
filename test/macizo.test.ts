/**
 * El macizo (#171): una franja de montaña crece de la falda a la cumbre, la
 * cresta tiene cumbres y collados, y en la escena los picos de dentro son
 * mayores, más esbeltos y más claros que los de la falda.
 *
 * Lo que se ve lo miran `pnpm taller escenario` y las capturas de
 * `docs/agents/2026-10-07-cumbres/`; aquí, las reglas que lo sostienen.
 */
import { describe, expect, it } from 'vitest';
import { PX_AL_ZOOM_MAXIMO } from '../src/client/render/camara-mapa.js';
import { analizar } from '../src/client/render/escenario/analizar.js';
import {
  ALTO_DE_FALDA,
  AMPLIACION_MAXIMA,
  altoMaximoDe,
  type MaterialDePico,
  macizoDe,
  materialDeLosMacizos,
  radioDePico,
} from '../src/client/render/escenario/macizo.js';
import type { Suelo } from '../src/core/map/terrain.js';
import { escenaDe, partidaDe } from './helpers.js';
import { LENTO, rango, segunPrisa } from './lento.js';

/** Las casillas `[x0, x1) × [y0, y1)` de un mapa de ancho `W`. */
function rectangulo(W: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const fuera: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fuera.push(y * W + x);
  return fuera;
}

const llano = () => 0.5;

describe('el campo del macizo', () => {
  const W = 16;
  const H = 12;
  // Una franja de 8 × 6 en mitad del mapa: hondura 3 en su centro.
  const ancha = macizoDe(rectangulo(W, 4, 3, 12, 9), W, H, llano);

  it('la hondura es del punto: 0 en el filo, crece hacia dentro y es la distancia euclídea', () => {
    expect(ancha.hondura(4.01, 6)).toBeCloseTo(0.01, 5);
    expect(ancha.hondura(4.5, 6)).toBeCloseTo(0.5, 5);
    expect(ancha.hondura(7, 6)).toBeCloseTo(3, 5);
    // En la esquina, la distancia a la esquina de fuera, no la de una rejilla.
    expect(ancha.hondura(4.6, 3.8)).toBeCloseTo(0.6, 5);
    // Fuera de la franja, 0.
    expect(ancha.hondura(2, 6)).toBe(0);
  });

  it('el alto sube de la falda a la cresta sin bajar en el camino', () => {
    expect(ancha.alto(4.001, 6)).toBeCloseTo(ALTO_DE_FALDA, 2);
    let antes = 0;
    for (let x = 4.05; x <= 7; x += 0.1) {
      const a = ancha.alto(x, 6);
      expect(a).toBeGreaterThanOrEqual(antes);
      antes = a;
    }
    expect(ancha.alto(7, 6)).toBeGreaterThan(2 * ALTO_DE_FALDA);
    expect(ancha.cumbre(4.001, 6)).toBeLessThan(0.01);
    expect(ancha.cumbre(7, 6)).toBeGreaterThan(0.3);
  });

  it('el borde del mapa no es borde: la franja sigue más allá', () => {
    const alBorde = macizoDe(rectangulo(W, 0, 0, 4, H), W, H, llano);
    expect(alBorde.hondura(0.05, 6)).toBeCloseTo(3.95, 5);
    expect(alBorde.hondura(3.9, 6)).toBeCloseTo(0.1, 5);
  });

  it('una banda estrecha llega a su cresta, pero sube menos que una ancha', () => {
    const estrecha = macizoDe(rectangulo(W, 4, 0, 6, H), W, H, llano);
    // Su hondura mayor es 1: en el medio de la banda ya es cresta.
    expect(estrecha.cumbre(5, 6)).toBeCloseTo(ancha.cumbre(7, 6), 5);
    expect(estrecha.alto(5, 6)).toBeGreaterThan(ALTO_DE_FALDA + 0.5);
    expect(estrecha.alto(5, 6)).toBeLessThan(ancha.alto(7, 6));
  });

  it('el ruido hace cumbres y collados a lo largo de la cresta', () => {
    const ruido = (x: number) => (x < 8 ? 0 : 1);
    const cresta = macizoDe(rectangulo(W, 0, 3, W, 9), W, H, ruido);
    const collado = cresta.alto(4, 6);
    const cumbre = cresta.alto(12, 6);
    expect(cumbre).toBeGreaterThan(1.8 * collado);
    // En la falda el ruido no cuenta: la falda es pareja.
    expect(cresta.alto(4, 3.001)).toBeCloseTo(cresta.alto(12, 3.001), 2);
  });

  it('el radio entre picos crece con su alto: falda apretada, cumbres espaciadas', () => {
    expect(radioDePico(3)).toBeGreaterThan(radioDePico(1));
    expect(radioDePico(ALTO_DE_FALDA)).toBeLessThan(0.5);
  });
});

/** Los picos de las montañas de una semilla, en la falda y en la cresta de su macizo. */
function picosDelMacizo(semilla: number) {
  const { map } = partidaDe(semilla);
  const escena = escenaDe(semilla);
  const a = analizar(map);
  const franjas = a.franjas.filter((f) => f.barrera === 'mountain');
  const macizos = franjas.map((f) => ({
    dentro: new Set(f.casillas),
    // El ruido no cambia la hondura: llega con el llano.
    macizo: macizoDe(f.casillas, a.W, a.H, llano),
  }));
  const picos = escena.sprites.filter(
    (s) => s.clase === 'masa' && s.src?.startsWith('modulos/picos-') === true,
  );
  const falda: (typeof picos)[number][] = [];
  const cresta: (typeof picos)[number][] = [];
  for (const s of picos) {
    const i = Math.floor(Math.min(s.y, a.H - 0.01)) * a.W + Math.floor(Math.min(s.x, a.W - 0.01));
    const suyo = macizos.find((m) => m.dentro.has(i));
    if (suyo === undefined) continue;
    const d = suyo.macizo.hondura(s.x, s.y);
    if (d < 0.25) falda.push(s);
    else if (d >= 0.75) cresta.push(s);
  }
  return { falda, cresta };
}

/** Si la semilla tiene una cordillera que mirar: ≥ 10 picos de falda y 5 de cresta. */
const conCordillera = (semilla: number): boolean => {
  const { falda, cresta } = picosDelMacizo(semilla);
  return falda.length > 10 && cresta.length > 5;
};

/** Las `n` primeras semillas desde la 1 que cumplen `pred`. */
function lasPrimeras(n: number, pred: (semilla: number) => boolean): number[] {
  const halladas: number[] = [];
  for (let s = 1; halladas.length < n; s++) {
    if (s > 80) throw new Error(`no hay ${n} semillas de la 1 a la 80 que valgan`);
    if (pred(s)) halladas.push(s);
  }
  return halladas;
}

describe('la escena: los picos de una cordillera crecen hacia dentro', () => {
  // Las semillas con una cordillera que mirar, **buscadas**: las de 1-10 en la
  // lenta y las dos primeras en `pnpm verify`. Eran listas escritas a mano, y
  // cada cambio del mapa (#161, #169) dejaba alguna sin cordillera.
  const semillas = LENTO ? rango(1, 10).filter(conCordillera) : lasPrimeras(2, conCordillera);
  for (const semilla of semillas)
    it(`semilla ${semilla}: más altos, más esbeltos y más claros en la cresta que en la falda`, () => {
      const { falda, cresta } = picosDelMacizo(semilla);
      const media = (l: readonly number[]) => l.reduce((x, y) => x + y, 0) / l.length;
      // El alto: lo que hace que se lea como macizo y no como alfombra.
      expect(media(cresta.map((s) => s.alto))).toBeGreaterThan(
        1.5 * media(falda.map((s) => s.alto)),
      );
      // La silueta: los esbeltos arriba.
      const esbeltez = (s: (typeof falda)[number]) => s.nh / s.nw;
      expect(media(cresta.map(esbeltez))).toBeGreaterThan(media(falda.map(esbeltez)));
      // La luz: la falda en sombra, y en la cresta, como mucho un tercio de lo
      // que se oscurece la falda. Era «menos del 20 %» a secas, y en una
      // versión de los bordes de #169 la semilla 1 dio un 21 % en la cresta
      // frente a un 96 % en la falda. Con la final (07-10-2026), en 1-30 la
      // cresta da 0-19 % (la s1, 19 %) y la falda 75-95 %: el techo cae en un
      // 25-32 %, y el collado del ruido que oscurece algún pico de cresta no lo
      // pone en rojo por una tirada.
      const oscura = (s: (typeof falda)[number]) => s.tono?.includes('brightness(0.78)') === true;
      const enSombra = (l: readonly (typeof falda)[number][]) => l.filter(oscura).length / l.length;
      expect(enSombra(falda)).toBeGreaterThan(0.5);
      expect(enSombra(cresta)).toBeLessThan(enSombra(falda) / 3);
    });

  it('no hay más picos que antes por casilla de montaña: el tope de volúmenes no se gasta aquí', () => {
    // Antes del macizo (07-10-2026): 2,38 en la semilla 1, 2,83 en la 57 y 2,58 en la 34.
    for (const semilla of segunPrisa([1, 57, 34], rango(1, 10))) {
      const { map } = partidaDe(semilla);
      const a = analizar(map);
      const casillas = a.franjas
        .filter((f) => f.barrera === 'mountain')
        .reduce((n, f) => n + f.casillas.length, 0);
      if (casillas === 0) continue;
      const picos = escenaDe(semilla).sprites.filter(
        (s) => s.clase === 'masa' && s.src?.startsWith('modulos/picos-') === true,
      ).length;
      expect(picos / casillas, `semilla ${semilla}`).toBeLessThan(2.9);
    }
  });
});

describe('el material de un macizo: uno solo, el que domina (defecto C de la auditoría 2)', () => {
  const W = 8;
  const H = 4;
  /** Un mapa de `W × H` con el suelo de cada casilla de la cadena (fila a fila, `.` es hierba). */
  const suelos = (filas: string): Suelo[] =>
    [...filas.replace(/\s/g, '')].map(
      (c) => ({ n: 'snow', l: 'lava', a: 'sand', r: 'rough', '.': 'grass' })[c] as Suelo,
    );
  const montana = (filas: string): number[] =>
    [...filas.replace(/\s/g, '')].flatMap((c, i) => (c === '.' ? [] : [i]));

  it('las franjas unidas en diagonal son un macizo, y lo viste el material de más casillas', () => {
    const f = `
      nnl.....
      ...l.aa.
      ...l..a.
      ........`;
    const m = materialDeLosMacizos(montana(f), W, H, suelos(f));
    // 3 de lava y 2 de nieve, unidas por la diagonal (2,0)-(3,1): todo lava.
    for (const i of [0, 1, 2, 11, 19]) expect(m.get(i)).toBe('lava');
    // La otra, aparte: arena.
    for (const i of [13, 14, 22]) expect(m.get(i)).toBe('arena');
  });

  it('la hierba, la tierra y el pedregal son la misma roca', () => {
    const f = `
      rr......
      ........
      ........
      ........`;
    const s = suelos(f);
    s[1] = 'dirt';
    const m = materialDeLosMacizos(montana(f), W, H, s);
    expect([m.get(0), m.get(1)]).toEqual(['roca', 'roca']);
  });

  it('en un empate, la lava pierde: sus módulos son los de menos resolución', () => {
    const f = `
      nnll....
      ........
      ........
      ........`;
    const m = materialDeLosMacizos(montana(f), W, H, suelos(f));
    expect(new Set([0, 1, 2, 3].map((i) => m.get(i)))).toEqual(new Set<MaterialDePico>(['nieve']));
  });

  it('una casilla del macizo sin suelo lanza diciéndolo', () => {
    expect(() => materialDeLosMacizos([0, 40], W, H, suelos('nn......'.repeat(4)))).toThrow(
      'la casilla 40 del macizo no tiene suelo',
    );
  });
});

describe('las cumbres, nítidas y de un material (defecto C de la auditoría 2)', () => {
  it('el tope de alto de un módulo es su alto en píxeles por 1,3 sobre el zoom máximo', () => {
    // `picos-volcan/2`, la aguja de s9: 149 px dan 1,61 casillas, no 3.
    expect(altoMaximoDe({ nh: 149 })).toBeCloseTo((149 * 1.3) / 120, 9);
    expect(PX_AL_ZOOM_MAXIMO).toBe(120);
  });

  const familia = (src: string): MaterialDePico => {
    const hoja = src.split('/')[1];
    const m = (
      {
        'picos-nevados': 'nieve',
        'picos-volcan': 'lava',
        'picos-arenisca': 'arena',
        'picos-roca': 'roca',
        'picos-afilados': 'roca',
      } as Record<string, MaterialDePico>
    )[hoja ?? ''];
    if (m === undefined) throw new Error(`hoja de pico desconocida: ${src}`);
    return m;
  };

  // s9 llevaba la aguja de lava a ×2,4 y s57 la gris entre arenisca; la 1 es la
  // cordillera que salió bien y no debe empeorar.
  for (const semilla of segunPrisa([1, 9, 57], [...rango(1, 10), 13, 24, 34, 57])) {
    it(`semilla ${semilla}: ningún pico pasa de ×1,3 al zoom máximo`, () => {
      const picos = escenaDe(semilla).sprites.filter(
        (s) => s.src?.startsWith('modulos/picos-') === true,
      );
      expect(picos.length).toBeGreaterThan(0);
      const borrosos = picos
        .filter((s) => (s.alto * PX_AL_ZOOM_MAXIMO) / s.nh > AMPLIACION_MAXIMA + 1e-9)
        .map(
          (s) =>
            `${s.src} en (${s.x.toFixed(1)}, ${s.y.toFixed(1)}) a ×${((s.alto * PX_AL_ZOOM_MAXIMO) / s.nh).toFixed(2)}`,
        );
      expect(borrosos).toEqual([]);
    });

    it(`semilla ${semilla}: cada macizo, de un solo material`, () => {
      const { map } = partidaDe(semilla);
      const a = analizar(map);
      const montana = a.franjas.filter((f) => f.barrera === 'mountain').flatMap((f) => f.casillas);
      // El macizo de cada casilla, por la casilla de montaña con que empieza su
      // componente: el mismo recorrido que la regla, pero aquí solo se agrupa.
      const material = materialDeLosMacizos(montana, a.W, a.H, a.suelo);
      const raiz = new Map<number, number>();
      const es = new Set(montana);
      for (const i of montana) {
        if (raiz.has(i)) continue;
        const pila = [i];
        raiz.set(i, i);
        while (pila.length > 0) {
          const j = pila.pop() as number;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const x = (j % a.W) + dx;
              const y = Math.floor(j / a.W) + dy;
              const k = y * a.W + x;
              if (x < 0 || y < 0 || x >= a.W || y >= a.H || !es.has(k) || raiz.has(k)) continue;
              raiz.set(k, i);
              pila.push(k);
            }
        }
      }
      const vistos = new Map<number, Set<MaterialDePico>>();
      for (const s of escenaDe(semilla).sprites) {
        if (s.clase !== 'masa' || s.src?.startsWith('modulos/picos-') !== true) continue;
        const i =
          Math.floor(Math.min(s.y, a.H - 0.01)) * a.W + Math.floor(Math.min(s.x, a.W - 0.01));
        const r = raiz.get(i);
        if (r === undefined) continue;
        const v = vistos.get(r) ?? new Set();
        v.add(familia(s.src));
        vistos.set(r, v);
      }
      expect(vistos.size).toBeGreaterThan(0);
      const mezclados = [...vistos]
        .filter(([, v]) => v.size > 1)
        .map(([r, v]) => `macizo de (${r % a.W}, ${Math.floor(r / a.W)}): ${[...v].join(', ')}`);
      expect(mezclados).toEqual([]);
      // Y el material que lleva es el que domina, no uno cualquiera de los suyos.
      for (const [r, v] of vistos) expect([...v][0]).toBe(material.get(r));
    });
  }
});
