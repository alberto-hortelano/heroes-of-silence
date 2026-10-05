/**
 * Las reglas puras del escenógrafo (`src/client/render/escenario/`): el esqueleto
 * que hace de una franja de muro UNA muralla, el relieve que pone las caras de
 * roca hacia la cámara, el esparcido que llena sin amontonar, y la escena de un
 * mapa real sin nada apoyado sobre un objeto.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { type Catalogo, RUTA_DEL_CATALOGO } from '../src/client/render/escenario/catalogo.js';
import { componentesDePasos, componer } from '../src/client/render/escenario/colocar.js';
import { azarDe, esparcir } from '../src/client/render/escenario/esparcir.js';
import { ejeDe, esqueleto } from '../src/client/render/escenario/esqueleto.js';
import { nivelDeRegion, relieve } from '../src/client/render/escenario/relieve.js';
import { encadenar, suavizar, VAIVEN } from '../src/client/render/escenario/sendas.js';
import { newGame } from '../src/core/state/setup.js';
import { leerCatalogo, textoDelCatalogo } from '../tools/taller/escenario/catalogo-disco.js';

function franja(filas: readonly string[]): [number, number][] {
  const c: [number, number][] = [];
  filas.forEach((f, y) => {
    [...f].forEach((ch, x) => {
      if (ch === '#') c.push([x, y]);
    });
  });
  return c;
}

describe('el esqueleto de una franja', () => {
  it('una franja de 3 de ancho da UNA línea, no tres en paralelo', () => {
    const e = esqueleto(franja(['##########', '##########', '##########']));
    expect(componentesDePasos(e.casillas, e.pasos)).toBe(1);
    // Una línea: ninguna casilla con más de dos pasos.
    const grado = new Map<string, number>();
    for (const p of e.pasos)
      for (const c of [p.a, p.b]) grado.set(`${c}`, (grado.get(`${c}`) ?? 0) + 1);
    expect(Math.max(...grado.values())).toBeLessThanOrEqual(2);
    expect(new Set(e.pasos.map(ejeDe))).toEqual(new Set(['horizontal']));
  });

  it('una franja en L gira una vez y la torre va en el giro', () => {
    const e = esqueleto(
      franja(['##.......', '##.......', '##.......', '##.......', '#########', '#########']),
    );
    expect(componentesDePasos(e.casillas, e.pasos)).toBe(1);
    const ejes = new Set(e.pasos.map(ejeDe));
    expect(ejes.has('horizontal')).toBe(true);
    expect(ejes.has('profundidad')).toBe(true);
    expect(e.juntas.length).toBeGreaterThanOrEqual(3); // dos extremos y el giro
  });

  it('una franja en diagonal va por pasos diagonales', () => {
    const e = esqueleto(franja(['##....', '###...', '.###..', '..###.', '...###', '....##']));
    expect(componentesDePasos(e.casillas, e.pasos)).toBe(1);
    expect(e.pasos.map(ejeDe)).toContain('diagonal-baja');
  });
});

describe('el relieve', () => {
  const a = analizar(newGame({ seed: 9 }).map);
  const r = relieve(a);

  it('una cara cuelga de la casilla alta hacia la de abajo en pantalla', () => {
    expect(r.caras.length).toBeGreaterThan(0);
    for (const c of r.caras)
      for (let x = c.x0; x <= c.x1; x++) {
        const alta = r.nivel[c.y * a.W + x] as number;
        const baja = r.nivel[(c.y + 1) * a.W + x] as number;
        expect(alta - baja).toBe(c.caida);
      }
  });

  it('el agua va encajada por debajo de su orilla: el barranco', () => {
    for (const f of a.franjas.filter((k) => k.barrera === 'water'))
      for (const i of f.casillas)
        expect(r.nivel[i] as number).toBeLessThan(r.nivel[a.fuente[i] as number] as number);
  });

  it('el relieve no es un escalón por suelo: hay fronteras entre regiones al mismo nivel', () => {
    // Dos regiones vecinas a través de una franja, al mismo nivel: se separan por río o cañón.
    let mismoNivel = 0;
    for (const f of a.franjas.filter((k) => k.uso === 'borde')) {
      const niveles = new Set(f.casillas.map((i) => r.nivel[a.fuente[i] as number]));
      if (niveles.size === 1) mismoNivel++;
    }
    expect(mismoNivel).toBeGreaterThan(0);
  });

  it('la ciénaga va abajo y la nieve y la lava arriba', () => {
    for (const reg of a.regiones) {
      if (reg.suelo === 'swamp') expect(nivelDeRegion('swamp', 0, 0.9)).toBe(0);
      if (reg.suelo === 'snow') expect(nivelDeRegion('snow', 0, 0.9)).toBe(2);
    }
    expect(nivelDeRegion('grass', 0, 0.9)).toBe(1);
    expect(nivelDeRegion('grass', 0.5, 0.9)).toBe(2);
  });
});

describe('las sendas', () => {
  const recta = [0, 1, 2, 3, 4].map((x) => [x + 0.5, 0.5, x + 1.5, 0.5] as const);

  it('una fila de tramos es UNA senda, y un cruce en T da tres que se tocan en él', () => {
    expect(encadenar(recta)).toHaveLength(1);
    const t = [...recta, [2.5, 0.5, 2.5, 1.5] as const, [2.5, 1.5, 2.5, 2.5] as const];
    const lineas = encadenar(t);
    expect(lineas).toHaveLength(3);
    for (const l of lineas) expect([l[0], l.at(-1)]).toContainEqual([2.5, 0.5]);
  });

  it('suavizar no mueve los extremos y no se aparta más que el vaivén', () => {
    const [l] = encadenar(recta);
    const s = suavizar(l as [number, number][], azarDe(4));
    expect(s[0]).toEqual([0.5, 0.5]);
    expect(s.at(-1)).toEqual([5.5, 0.5]);
    for (const [, y] of s) expect(Math.abs(y - 0.5)).toBeLessThanOrEqual(VAIVEN + 1e-9);
    // Y serpentea: no es la recta de casillas.
    expect(Math.max(...s.map(([, y]) => Math.abs(y - 0.5)))).toBeGreaterThan(0.05);
  });
});

describe('el esparcido', () => {
  it('ningún punto más cerca de otro que su radio, y nada fuera de donde se pide', () => {
    const azar = azarDe(3);
    const pts = esparcir(
      [0, 0, 10, 10],
      () => 0.4,
      (x) => !(x > 4 && x < 6),
      azar,
    );
    expect(pts.length).toBeGreaterThan(200);
    for (const p of pts) expect(p.x > 4 && p.x < 6).toBe(false);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const p = pts[i] as { x: number; y: number };
        const q = pts[j] as { x: number; y: number };
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(0.4);
      }
  });

  it('es determinista: la misma semilla, los mismos puntos', () => {
    const uno = esparcir(
      [0, 0, 5, 5],
      () => 0.5,
      () => true,
      azarDe(7),
    );
    const otro = esparcir(
      [0, 0, 5, 5],
      () => 0.5,
      () => true,
      azarDe(7),
    );
    expect(uno).toEqual(otro);
  });
});

const RAIZ = resolve(import.meta.dirname, '..');
const catalogo = JSON.parse(readFileSync(join(RAIZ, RUTA_DEL_CATALOGO), 'utf8')) as Catalogo;

describe('la escena de un mapa real', () => {
  for (const semilla of [1, 9]) {
    const map = newGame({ seed: semilla }).map;
    const e = componer(map, semilla, catalogo);

    it(`semilla ${semilla}: con el catálogo del repo no falta ningún módulo`, () => {
      expect(e.informe.modulosQueFaltan).toEqual([]);
    });

    it(`semilla ${semilla}: nada se apoya sobre un objeto ni un camino, y cada muralla es una línea`, () => {
      expect(e.informe.basesSobreReserva).toBe(0);
      expect(e.informe.murallasPartidas).toBe(0);
    });

    it(`semilla ${semilla}: toda casilla de barrera queda bajo su formación o bajo un objeto`, () => {
      expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
    });

    it(`semilla ${semilla}: ninguna masa ni muro se apoya en una casilla que se pisa lejos de su franja`, () => {
      const a = analizar(map);
      for (const s of e.sprites) {
        if (s.clase !== 'masa' && s.clase !== 'muro') continue;
        const x = Math.min(a.W - 1, Math.max(0, Math.floor(s.x)));
        const y = Math.min(a.H - 1, Math.max(0, Math.floor(s.y - 0.3)));
        let cerca = false;
        for (let dy = -1; dy <= 1 && !cerca; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const k = (y + dy) * a.W + x + dx;
            if (a.franjaDe[k] !== undefined && (a.franjaDe[k] as number) !== -1) cerca = true;
          }
        expect(cerca).toBe(true);
      }
    });
  }
});

describe('lo que importaría el juego', () => {
  it('el catálogo del repo es el que sale del disco: `pnpm taller catalogo-escena` está al día', async () => {
    expect(readFileSync(join(RAIZ, RUTA_DEL_CATALOGO), 'utf8')).toBe(
      textoDelCatalogo(await leerCatalogo()),
    );
  });

  it('componer y pintar no arrastran nada de Node: corren en el navegador', () => {
    // Se sigue cada import relativo desde las dos puertas y se mira qué trae de fuera.
    const deFuera = new Map<string, string>();
    const vistos = new Set<string>();
    const pendientes = [
      'src/client/render/escenario/colocar.ts',
      'src/client/render/escenario/pintar.ts',
    ];
    for (let f = pendientes.pop(); f !== undefined; f = pendientes.pop()) {
      if (vistos.has(f)) continue;
      vistos.add(f);
      const texto = readFileSync(join(RAIZ, f), 'utf8');
      for (const m of texto.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*'([^']+)'/gms)) {
        const ruta = m[1] as string;
        // `import type` se borra al compilar: no viaja al navegador.
        if (/^\s*(?:import|export)\s+type\b/.test(m[0])) continue;
        if (ruta.startsWith('.')) {
          pendientes.push(join(dirname(f), ruta.replace(/\.js$/, '.ts')));
        } else if (ruta.startsWith('@core/')) {
          // El núcleo es puro por su propio guardia: se sigue igual, por si acaso.
          pendientes.push(join('src/core', ruta.slice('@core/'.length).replace(/\.js$/, '.ts')));
        } else deFuera.set(ruta, f);
      }
      for (const m of texto.matchAll(/(?:import\s*\(|^\s*import\s*)'([^']+)'/gm))
        deFuera.set(m[1] as string, f);
    }
    expect(vistos.size).toBeGreaterThan(5);
    expect([...deFuera].map(([r, f]) => `${r} (desde ${f})`)).toEqual([]);
  });
});
