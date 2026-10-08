/**
 * El suelo sin rejilla (R2, `parches.ts`): el encaje de cada textura es
 * determinista, cubre el mapa, no deja ver el periodo de la textura y es el que
 * estampa el pintor.
 *
 * La repetición se mide como en `docs/agents/2026-10-08-suelo-r2/medir.ts`, que
 * la mide en el navegador sobre el suelo pintado: la autocorrelación de la
 * luminancia pasada por un filtro de altos, al periodo de la textura (4
 * casillas) menos la media a 3 y a 5. Aquí sobre el encaje mismo
 * (`enElEncaje`), con la luminancia de cada textura de verdad: con el patrón
 * solo da 0,9 o más; con los parches, cerca de 0.
 */
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nivelPintado } from '../src/client/render/escenario/escalon.js';
import {
  fronterasDelSuelo,
  PX_DE_LAS_FRONTERAS,
} from '../src/client/render/escenario/fronteras.js';
import {
  CASILLAS_POR_TEXTURA,
  type Encaje,
  encajeDe,
  enElEncaje,
  PASO_DEL_PARCHE,
  pesoDelParche,
  RADIO_DEL_PARCHE,
} from '../src/client/render/escenario/parches.js';
import { pintarSuelo, separar } from '../src/client/render/escenario/pintar.js';
import { escenaDe } from './helpers.js';

const RAIZ = resolve(import.meta.dirname, '..');
const SUELOS = ['grass', 'dirt', 'snow', 'sand', 'swamp', 'lava'] as const;

/** Muestras por casilla a las que se mide: las de `medir.ts`. */
const R = 10;
const LADO = 34;

/** La luminancia (0-1) de una textura, a `R × CASILLAS_POR_TEXTURA` muestras por lado. */
async function luminanciaDe(suelo: string): Promise<Float32Array> {
  const n = R * CASILLAS_POR_TEXTURA;
  const { data } = await sharp(join(RAIZ, `assets/mapa/suelos/${suelo}.webp`))
    .resize(n, n, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const L = new Float32Array(n * n);
  for (let i = 0; i < L.length; i++)
    L[i] =
      (0.2126 * (data[i * 3] as number) +
        0.7152 * (data[i * 3 + 1] as number) +
        0.0722 * (data[i * 3 + 2] as number)) /
      255;
  return L;
}

/** El mapa entero de un solo suelo, muestreado en el encaje. */
function campo(e: Encaje, luz: Float32Array): Float32Array {
  const n = R * CASILLAS_POR_TEXTURA;
  const N = LADO * R;
  const f = new Float32Array(N * N);
  const muestra = (u: number, v: number) =>
    luz[Math.min(n - 1, Math.floor(v * n)) * n + Math.min(n - 1, Math.floor(u * n))] as number;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) f[y * N + x] = enElEncaje(e, (x + 0.5) / R, (y + 0.5) / R, muestra);
  return f;
}

/** La repetición de `medir.ts`: r(4 casillas) − media(r(3), r(5)), tras quitar la media de dos casillas. */
function repeticion(f: Float32Array): number {
  const N = LADO * R;
  const media = (a: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0;
        let k = 0;
        for (let d = -R; d <= R; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          s += a[yy * N + xx] as number;
          k++;
        }
        out[y * N + x] = s / k;
      }
    return out;
  };
  const baja = media(media(f, true), false);
  const h = f.map((v, i) => v - (baja[i] as number));
  const r = (d: number) => {
    let total = 0;
    for (const [dx, dy] of [
      [d, 0],
      [0, d],
    ] as const) {
      let ab = 0;
      let aa = 0;
      let bb = 0;
      for (let y = 0; y + dy < N; y++)
        for (let x = 0; x + dx < N; x++) {
          const a = h[y * N + x] as number;
          const b = h[(y + dy) * N + x + dx] as number;
          ab += a * b;
          aa += a * a;
          bb += b * b;
        }
      total += ab / Math.sqrt(aa * bb);
    }
    return total / 2;
  };
  return r(4 * R) - (r(3 * R) + r(5 * R)) / 2;
}

/** El encaje sin parches: el patrón que se repite, lo de antes de R2. */
const soloPatron = (e: Encaje): Encaje => ({
  ...e,
  parches: [],
  celdas: [],
  columnas: 0,
  filas: 0,
});

describe('el encaje de una textura', () => {
  it('es el mismo con la misma semilla y la misma textura, y otro si cambia cualquiera', () => {
    const a = encajeDe(5, 'snow', LADO, LADO, CASILLAS_POR_TEXTURA);
    expect(encajeDe(5, 'snow', LADO, LADO, CASILLAS_POR_TEXTURA)).toEqual(a);
    expect(encajeDe(6, 'snow', LADO, LADO, CASILLAS_POR_TEXTURA).parches).not.toEqual(a.parches);
    expect(encajeDe(5, 'grass', LADO, LADO, CASILLAS_POR_TEXTURA).parches).not.toEqual(a.parches);
  });

  it('un parche por celda, cada uno en su celda, y todos en el orden de pintar', () => {
    const e = encajeDe(1, 'dirt', LADO, LADO, CASILLAS_POR_TEXTURA);
    expect(e.parches).toHaveLength(e.columnas * e.filas);
    expect(e.parches.map((p) => p.orden)).toEqual(e.parches.map((_, k) => k));
    e.celdas.forEach((p, k) => {
      expect(Math.floor(p.x / PASO_DEL_PARCHE)).toBe(k % e.columnas);
      expect(Math.floor(p.y / PASO_DEL_PARCHE)).toBe(Math.floor(k / e.columnas));
    });
    // Barajado: en orden de filas, cada fila taparía la anterior por el mismo lado.
    const celdaDe = new Map(e.celdas.map((p, k) => [p, k]));
    expect(e.parches.map((p) => celdaDe.get(p))).not.toEqual(e.celdas.map((_, k) => k));
  });

  it('el peso es entero en el centro, suave en el borde y nada fuera', () => {
    expect(pesoDelParche(0, 0)).toBe(1);
    expect(pesoDelParche(RADIO_DEL_PARCHE, 0)).toBe(0);
    expect(pesoDelParche(0, RADIO_DEL_PARCHE * 2)).toBe(0);
    let antes = 1;
    for (let r = 0; r <= RADIO_DEL_PARCHE; r += 0.05) {
      const p = pesoDelParche(r * 0.6, r * 0.8);
      expect(p).toBeLessThanOrEqual(antes);
      antes = p;
    }
  });

  it('el patrón de fondo apenas asoma: casi todo punto lo tapan los parches', () => {
    const e = encajeDe(3, 'grass', LADO, LADO, CASILLAS_POR_TEXTURA);
    // Con el fondo a 1 y los parches a 0, lo que queda es lo que asoma del fondo.
    let asoma = 0;
    let n = 0;
    for (let y = 0.05; y < LADO; y += 0.1)
      for (let x = 0.05; x < LADO; x += 0.1) {
        const fondo = enElEncaje(e, x, y, (u, v) =>
          u === (x / CASILLAS_POR_TEXTURA) % 1 && v === (y / CASILLAS_POR_TEXTURA) % 1 ? 1 : 0,
        );
        if (fondo > 0.5) asoma++;
        n++;
      }
    expect(asoma / n).toBeLessThan(0.02);
  });

  it('ningún parche llega más allá de la celda de al lado: basta mirar las 3×3', () => {
    const e = encajeDe(9, 'sand', LADO, LADO, CASILLAS_POR_TEXTURA);
    for (const p of e.parches) {
      const i = Math.floor(p.x / PASO_DEL_PARCHE);
      const j = Math.floor(p.y / PASO_DEL_PARCHE);
      // Lo más lejos que llega, hacia cada lado, cae en la celda de al lado o en la suya.
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = p.x + dx * (RADIO_DEL_PARCHE - 1e-6);
        const y = p.y + dy * (RADIO_DEL_PARCHE - 1e-6);
        expect(Math.abs(Math.floor(x / PASO_DEL_PARCHE) - i)).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.floor(y / PASO_DEL_PARCHE) - j)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('la repetición del suelo, con las texturas de verdad', () => {
  const luces = new Map<string, Float32Array>();
  beforeAll(async () => {
    for (const s of SUELOS) luces.set(s, await luminanciaDe(s));
  });

  it.each(SUELOS)('%s: el patrón solo se repite (≥ 0,9) y con los parches no (< 0,1)', (s) => {
    const luz = luces.get(s) as Float32Array;
    const e = encajeDe(1, s, LADO, LADO, CASILLAS_POR_TEXTURA);
    expect(repeticion(campo(soloPatron(e), luz))).toBeGreaterThanOrEqual(0.9);
    expect(repeticion(campo(e, luz))).toBeLessThan(0.1);
  });
});

describe('el pintor estampa el encaje', () => {
  /** Lo que se pinta en cada lienzo: la llamada y la composición del momento. */
  interface Llamada {
    readonly metodo: string;
    readonly args: readonly unknown[];
    readonly composicion: unknown;
  }
  const porLienzo = new Map<object, Llamada[]>();
  const DOMMatrixDeVerdad = (globalThis as { DOMMatrix?: unknown }).DOMMatrix;
  beforeAll(() => {
    // Node no tiene `DOMMatrix`: uno que solo se encadena.
    class Matriz {
      translate() {
        return this;
      }
      scale() {
        return this;
      }
    }
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = Matriz;
  });
  afterAll(() => {
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixDeVerdad;
  });

  const lienzo = (ancho: number, alto: number) => {
    const llamadas: Llamada[] = [];
    const estado: Record<string | symbol, unknown> = { globalCompositeOperation: 'source-over' };
    const c = new Proxy(estado, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'createImageData' || k === 'getImageData')
          return (...a: number[]) => {
            const w = a.length === 2 ? (a[0] as number) : (a[2] as number);
            const h = a.length === 2 ? (a[1] as number) : (a[3] as number);
            return { data: new Uint8ClampedArray(w * h * 4) };
          };
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return () => ({ addColorStop: () => undefined });
        if (k === 'createPattern') return () => ({ setTransform: () => undefined });
        return (...args: unknown[]) => {
          llamadas.push({ metodo: String(k), args, composicion: t.globalCompositeOperation });
        };
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    });
    const l = { width: ancho, height: alto, getContext: () => c };
    porLienzo.set(l, llamadas);
    return l as unknown as HTMLCanvasElement;
  };

  it('cada capa de suelo lleva, con source-atop, los parches de su encaje que llegan a donde se ve, en su orden y a píxel entero', () => {
    const e = escenaDe(3);
    const T = 8;
    const imagenes = new Map<string, { width: number; height: number; src: string }>();
    const imagen = (src: string) => {
      if (!src.startsWith('suelos/')) return undefined;
      let im = imagenes.get(src);
      if (im === undefined) {
        im = { width: 512, height: 512, src };
        imagenes.set(src, im);
      }
      return im as unknown as HTMLCanvasElement;
    };
    const principal = lienzo(e.W * T, e.H * T);
    pintarSuelo(principal.getContext('2d') as CanvasRenderingContext2D, e, separar(e), {
      tile: T,
      imagen,
      lienzo,
    });
    const D = Math.ceil(2 * RADIO_DEL_PARCHE * T);
    // Las fronteras que pintó: sin luz que leer en las imágenes de mentira, la altura es plana.
    const lado = CASILLAS_POR_TEXTURA * PX_DE_LAS_FRONTERAS;
    // Y con el nivel de cada punto, como las lee el pintor (#211).
    const np = nivelPintado(e);
    const fr = fronterasDelSuelo(
      e,
      () => ({ lado, luz: new Float32Array(lado * lado) }),
      PX_DE_LAS_FRONTERAS,
      (p) => np.nivel[p] as number,
    );
    const suelos = [...new Set(e.suelo)];
    expect(suelos.length).toBeGreaterThan(1);
    let capas = 0;
    for (const [, llamadas] of porLienzo) {
      // La capa de un suelo: la que se rellena con el patrón de su textura.
      const fondo = llamadas.find((l) => l.metodo === 'fillRect' && l.composicion === 'source-in');
      if (fondo === undefined) continue;
      const estampadas = llamadas.filter(
        (l) => l.metodo === 'drawImage' && l.composicion === 'source-atop',
      );
      if (estampadas.length === 0) continue;
      capas++;
      // ¿De qué suelo? Aquel cuyo encaje da exactamente estas posiciones: sus
      // parches en su orden, los que llegan a una casilla donde se ve algo de él.
      const posiciones = estampadas.map((l) => `${l.args[1]},${l.args[2]}`).join(' ');
      const deSuelo = suelos.find((s) => {
        const k = fr.suelos.indexOf(s);
        const alfa = fr.alfas[k] as Uint8ClampedArray;
        const seVe = new Set<number>();
        alfa.forEach((a, p) => {
          if (a !== 0)
            seVe.add(
              Math.floor(Math.floor(p / fr.ancho) / PX_DE_LAS_FRONTERAS) * e.W +
                Math.floor((p % fr.ancho) / PX_DE_LAS_FRONTERAS),
            );
        });
        const r = RADIO_DEL_PARCHE + 1 / PX_DE_LAS_FRONTERAS;
        const llega = (p: { x: number; y: number }) => {
          for (
            let y = Math.max(0, Math.floor(p.y - r));
            y <= Math.min(e.H - 1, Math.floor(p.y + r));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(p.x - r));
              x <= Math.min(e.W - 1, Math.floor(p.x + r));
              x++
            )
              if (seVe.has(y * e.W + x)) return true;
          return false;
        };
        const enc = encajeDe(e.semilla, s, e.W, e.H, CASILLAS_POR_TEXTURA);
        // Los que caen en una casilla del suelo, casi siempre; si no, el encaje no se pinta.
        expect(enc.parches.some(llega)).toBe(true);
        return (
          enc.parches
            .filter(llega)
            .map((p) => `${Math.round(p.x * T - D / 2)},${Math.round(p.y * T - D / 2)}`)
            .join(' ') === posiciones
        );
      });
      expect(deSuelo, 'una capa con parches que no son los de ningún suelo').toBeDefined();
    }
    expect(capas).toBe(suelos.length);
  });
});
