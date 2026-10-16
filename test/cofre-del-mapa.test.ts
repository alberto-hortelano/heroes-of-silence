/**
 * El cofre del mapa es una pieza suelta (#147): se pinta con `pintarPieza`, que
 * pasa por la caché de copias reducidas, y el cliente ya no pide el atlas viejo
 * del que salía. Sin su imagen, su marcador.
 *
 * El navegador es de mentira, como en `mapa-pintado.test.ts`: un lienzo es un
 * registro de llamadas y una imagen «llega» en la siguiente vuelta del bucle, o
 * falla si su URL está en `fallan`. El orden de los casos importa: el primero
 * carga sin el cofre y el segundo lo vuelve a pedir.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import cofre from '../assets/mapa/cofre.json' with { type: 'json' };
import { arteCargando, cargarArte } from '../src/client/render/assets.js';
import { casillaAPixel } from '../src/client/render/camara-mapa.js';
import {
  escenarioDe,
  sueloDelMapa,
  usarPintorDelSuelo,
} from '../src/client/render/escenario/superficie.js';
import { COLOR_DEL_COFRE, drawMapa } from '../src/client/render/mapa.js';
import { todosALaVista } from '../src/core/state/asaltantes.js';
import { newGame } from '../src/core/state/setup.js';

/**
 * Lo que se espera a que el hilo principal pinte el suelo: el escalón (#211) lo
 * calcula en JavaScript (~0,3 s por escena en Node), y con todos los ficheros
 * en paralelo el segundo de `vi.waitFor` no llegaba.
 */
const PINTADO = { timeout: 10_000 };

interface Llamada {
  readonly metodo: string;
  readonly args: readonly unknown[];
  readonly fillStyle: unknown;
}

const llamadas: Llamada[] = [];
const pedidas: string[] = [];
const fallan = new Set<string>();

function contexto(): CanvasRenderingContext2D {
  const estado: Record<string | symbol, unknown> = { canvas: { width: 900, height: 600 } };
  return new Proxy(estado, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createImageData')
        return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop: () => undefined });
      if (k === 'createPattern') return () => null;
      if (k === 'measureText') return (texto: string) => ({ width: texto.length * 6 });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return (...args: unknown[]) => {
        llamadas.push({ metodo: String(k), args, fillStyle: t.fillStyle });
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class LienzoFalso {
  width = 1;
  height = 1;
  private readonly ctx = contexto();
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
}

class ImagenFalsa {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = true;
  set src(url: string) {
    pedidas.push(url);
    setTimeout(() => (fallan.has(url) ? this.onerror : this.onload)?.(), 0);
  }
}

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new LienzoFalso() });
  vi.stubGlobal('Image', ImagenFalsa);
  vi.stubGlobal('fetch', async (url: string) => {
    pedidas.push(url);
    return { ok: true, status: 200, blob: async () => ({}) };
  });
  vi.stubGlobal('location', { href: 'http://x/' });
  vi.stubGlobal('createImageBitmap', async () => ({ width: 0, height: 0, close: () => undefined }));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  usarPintorDelSuelo(null);
});

/** La semilla 3 tiene un cofre en (13, 12) (`generate.ts`; (12, 15) hasta el río de una casilla al pie de la meseta, #144 paso 2b; (14, 13) hasta el río de una casilla, #144 paso 2; (34, 18) hasta #144, los ríos; (13, 15) hasta #230, las dos puertas de la mina; (17, 7) hasta #229, las fronteras onduladas; (19, 5) hasta #226, el mapa de 42×42; (18, 9) hasta #222, (21, 17) hasta #215, (23, 19) hasta #210, (18, 10) hasta #143, (29, 15) hasta #208, (22, 21) hasta #195); la cámara lo deja en el centro. */
const state = newGame({ seed: 3 });
const COFRE = state.map.objects.find((o) => o.kind === 'chest' && o.at.x === 13 && o.at.y === 12);
const TILE = 70;
const camara = { tile: TILE, x: 13 - 6, y: 12 - 4 };

/** Pinta el mapa con el cofre en el centro y devuelve el registro. */
function pintar(): Llamada[] {
  if (COFRE === undefined) throw new Error('la semilla 3 ya no tiene el cofre en (13, 12)');
  const esc = escenarioDe(state.map, state.seed);
  sueloDelMapa(esc, TILE, 1);
  llamadas.length = 0;
  drawMapa(contexto(), {
    escena: state,
    heroes: state.heroes,
    objetos: state.map.objects,
    asaltantes: todosALaVista(state.raiders),
    camara,
    ancho: 900,
    alto: 600,
    explorado: null,
    visibles: null,
    ruta: [],
    seleccionado: null,
    hover: null,
    semilla: state.seed,
    tiempo: 0,
  });
  return [...llamadas];
}

/** El centro de la casilla del cofre, en píxeles del lienzo. */
const centro = () => casillaAPixel(camara, { x: 13, y: 12 });

/** El ladrillo del marcador, en la casilla del cofre. */
const marcadores = (registro: readonly Llamada[]) =>
  registro.filter(
    (l) =>
      l.metodo === 'fillRect' &&
      l.fillStyle === COLOR_DEL_COFRE &&
      Math.abs((l.args[0] as number) - (centro().x - TILE * 0.22)) < 1e-6,
  );

/**
 * La pieza: un `drawImage` de cinco argumentos (copia reducida entera) con su
 * ancla en el pie del cofre y 0,6 casillas de ancho, las medidas de su `.json`.
 */
const piezas = (registro: readonly Llamada[]) => {
  const escala = (TILE * 0.6) / cofre.ancho;
  const [ax, ay] = cofre.ancla as [number, number];
  return registro.filter(
    (l) =>
      l.metodo === 'drawImage' &&
      l.args.length === 5 &&
      Math.abs((l.args[1] as number) - (centro().x - ax * escala)) < 1e-6 &&
      Math.abs((l.args[2] as number) - (centro().y + TILE * 0.3 - ay * escala)) < 1e-6 &&
      Math.abs((l.args[3] as number) - TILE * 0.6) < 1e-6,
  );
};

describe('el cofre del mapa (#147)', () => {
  it('sin su imagen se pinta su marcador, y no la pieza', async () => {
    fallan.add('/mapa/cofre.webp');
    cargarArte(() => undefined, { manifiesto: false });
    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    expect(pedidas).toContain('/mapa/cofre.webp');
    const registro = pintar();
    expect(marcadores(registro)).toHaveLength(1);
    expect(piezas(registro)).toHaveLength(0);
  });

  it('con su imagen se pinta la pieza, de la caché de copias, y no el marcador', async () => {
    fallan.clear();
    cargarArte(() => undefined, { manifiesto: false });
    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    const registro = pintar();
    expect(piezas(registro)).toHaveLength(1);
    // De la caché: lo que se copia es un lienzo reducido, no la imagen nativa.
    expect(piezas(registro)[0]?.args[0]).toBeInstanceOf(LienzoFalso);
    expect(marcadores(registro)).toHaveLength(0);
  });

  it('el cliente ya no pide el atlas viejo del mapa', () => {
    expect(pedidas.length).toBeGreaterThan(0);
    expect(pedidas.filter((u) => /map-atlas/.test(u))).toEqual([]);
  });
});
