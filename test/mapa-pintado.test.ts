/**
 * El mapa de aventura pintado de punta a punta, sin navegador: el suelo que se
 * pinta una vez y suelta lo que ya no hace falta, el orden en que salen las
 * figuras, los volúmenes y lo que dice quién está en cada casilla, y las copias
 * reducidas que se guardan entre zooms.
 *
 * El navegador es de mentira: un lienzo es un registro de llamadas y una imagen
 * «llega» en la siguiente vuelta del bucle con 0 px, así que todo se pinta con
 * su marcador de color, que es justo lo que se reconoce en el registro.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { arteCargando, imagenDeEscena } from '../src/client/render/assets.js';
import {
  COPIAS_NUEVAS_POR_FOTOGRAMA,
  copiaReducida,
  copiaReducidaSiCabe,
  empezarFotogramaDeCopias,
} from '../src/client/render/copias.js';
import { pintarSprite } from '../src/client/render/escenario/pintar.js';
import {
  type PeticionDelSuelo,
  pintarSueloAparte,
  type RespuestaDelSuelo,
} from '../src/client/render/escenario/pintor-del-suelo.js';
import {
  apuntarElSueloEn,
  type Escenario,
  escenarioDe,
  escenarioListo,
  PX_DEL_SUELO,
  sueloDelMapa,
  topeDeAlejar,
  usarPintorDelSuelo,
} from '../src/client/render/escenario/superficie.js';
import { drawMapa, PIES } from '../src/client/render/mapa.js';
import { newGame } from '../src/core/state/setup.js';

interface Llamada {
  readonly metodo: string;
  readonly args: readonly unknown[];
  readonly fillStyle: unknown;
}

const llamadas: Llamada[] = [];
const pedidas: string[] = [];

/** Un contexto 2D que no pinta: apunta cada llamada con el `fillStyle` del momento. */
function contexto(): CanvasRenderingContext2D {
  const estado: Record<string | symbol, unknown> = {};
  let transformacion = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  return new Proxy(estado, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createImageData')
        return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop: () => undefined });
      if (k === 'createPattern') return () => null;
      if (k === 'measureText') return (texto: string) => ({ width: texto.length * 6 });
      if (k === 'getTransform') return () => transformacion;
      if (k === 'setTransform')
        return (...args: unknown[]) => {
          const [m] = args;
          transformacion =
            typeof m === 'object' && m !== null
              ? (m as typeof transformacion)
              : { a: 1, b: 0, c: 0, d: 1, e: args[4] as number, f: args[5] as number };
          llamadas.push({ metodo: 'setTransform', args, fillStyle: t.fillStyle });
        };
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

/** Las URL que fallan: cada una, tantas veces como diga su cuenta. */
const fallos = new Map<string, number>();

/**
 * Una imagen que llega en la siguiente vuelta del bucle, vacía: se pinta su
 * marcador. Si su URL está en `fallos`, falla en vez de llegar.
 */
class ImagenFalsa {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = true;
  set src(url: string) {
    pedidas.push(url);
    const quedan = fallos.get(url) ?? 0;
    if (quedan > 0) fallos.set(url, quedan - 1);
    setTimeout(() => (quedan > 0 ? this.onerror : this.onload)?.(), 0);
  }
}

/**
 * Las imágenes de la escena llegan por `fetch` y `createImageBitmap`: aquí, una
 * respuesta que se apunta y falla si su URL está en `fallos`, y un mapa de bits
 * vacío, que se pinta con su marcador.
 */
async function fetchFalso(url: string) {
  pedidas.push(url);
  const quedan = fallos.get(url) ?? 0;
  if (quedan > 0) fallos.set(url, quedan - 1);
  return { ok: quedan === 0, status: quedan === 0 ? 200 : 404, blob: async () => ({}) };
}

beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => new LienzoFalso() });
  vi.stubGlobal('Image', ImagenFalsa);
  vi.stubGlobal('fetch', fetchFalso);
  vi.stubGlobal('location', { href: 'http://x/' });
  vi.stubGlobal('createImageBitmap', async () => ({ width: 0, height: 0, close: () => undefined }));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // Sin Worker, como en node: el suelo se pinta en el hilo principal.
  usarPintorDelSuelo(null);
});

describe('el suelo se pinta una vez y suelta lo que solo servía para eso', () => {
  it('pide la escena una vez, enseña el sucedáneo mientras llega, pinta y suelta lo del suelo', async () => {
    const pagina = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    apuntarElSueloEn(pagina);
    expect(pagina.dataset.escenario).toBe('sin-mapa');

    const esc = escenarioDe(newGame({ seed: 1 }).map, 1);
    const mientras = sueloDelMapa(esc, 70);
    expect(pagina.dataset.escenario).toBe('cargando');
    expect(mientras.px).toBe(1);
    expect(pedidas.length).toBe(esc.imagenes.length);
    // Otro fotograma mientras llega: no se pide nada más.
    sueloDelMapa(esc, 70);
    expect(pedidas.length).toBe(esc.imagenes.length);

    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    const pintado = sueloDelMapa(esc, 70);
    expect(pagina.dataset.escenario).toBe('pintado');
    expect(pintado.px).toBe(PX_DEL_SUELO);

    // Lo que solo pinta el suelo se ha soltado; lo de los volúmenes sigue.
    expect(esc.soloDelSuelo.length).toBeGreaterThan(0);
    for (const src of esc.soloDelSuelo) expect(imagenDeEscena(src), src).toBeUndefined();
    const deVolumen = esc.imagenes.filter((src) => !esc.soloDelSuelo.includes(src));
    expect(deVolumen.length).toBeGreaterThan(0);
    for (const src of deVolumen) expect(imagenDeEscena(src), src).toBeDefined();

    // Y no se vuelve a pedir ni a pintar mientras no haga falta.
    expect(sueloDelMapa(esc, 70)).toBe(pintado);
    expect(pedidas.length).toBe(esc.imagenes.length);

    // Otra partida vuelve a pedir lo soltado que también pinta ella.
    const otro = escenarioDe(newGame({ seed: 3 }).map, 3);
    const antes = pedidas.length;
    sueloDelMapa(otro, 70);
    expect(pagina.dataset.escenario).toBe('cargando');
    const repedidas = pedidas.slice(antes);
    const soltadasQueUsa = otro.imagenes.filter((src) => esc.soloDelSuelo.includes(src));
    expect(soltadasQueUsa.length).toBeGreaterThan(0);
    for (const src of soltadasQueUsa) expect(repedidas).toContain(`/mapa/${src}`);
    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    expect(sueloDelMapa(otro, 70).px).toBe(PX_DEL_SUELO);
    expect(pagina.dataset.escenario).toBe('pintado');
  });
});

describe('una imagen del suelo que no llega no se da por pintada', () => {
  const AGUA = 'texturas/agua.webp';
  const veces = (src: string) => pedidas.filter((u) => u === `/mapa/${src}`).length;

  it('falla la primera vez y llega la segunda: el suelo espera y se pinta con ella', async () => {
    const pagina = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    apuntarElSueloEn(pagina);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const esc = escenarioDe(newGame({ seed: 5 }).map, 5);
    expect(esc.soloDelSuelo).toContain(AGUA);
    const antes = veces(AGUA);
    fallos.set(`/mapa/${AGUA}`, 1);
    sueloDelMapa(esc, 70);
    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    // La tanda se cerró con el agua fallida: no se pinta, se vuelve a pedir.
    expect(sueloDelMapa(esc, 70).px).toBe(1);
    expect(pagina.dataset.escenario).toBe('cargando');
    expect(veces(AGUA)).toBe(antes + 2);
    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    expect(sueloDelMapa(esc, 70).px).toBe(PX_DEL_SUELO);
    expect(pagina.dataset.escenario).toBe('pintado');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('si tampoco llega al volver a pedirla, lo dice como error y pinta con su color', async () => {
    const pagina = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    apuntarElSueloEn(pagina);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const esc = escenarioDe(newGame({ seed: 6 }).map, 6);
    fallos.set(`/mapa/${AGUA}`, 2);
    sueloDelMapa(esc, 70);
    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    sueloDelMapa(esc, 70);
    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    expect(sueloDelMapa(esc, 70).px).toBe(PX_DEL_SUELO);
    expect(pagina.dataset.escenario).toBe('pintado');
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain(AGUA);
    error.mockRestore();
  });
});

describe('con Worker, el suelo se pinta aparte (H2 de la vuelta 1 de QA)', () => {
  /** Un pintor que no contesta hasta que se le dice: así se ve el «mientras tanto». */
  function pintorEnEspera() {
    const peticiones: PeticionDelSuelo[] = [];
    let contestar: (r: RespuestaDelSuelo) => void = () => undefined;
    let fallar: (e: Error) => void = () => undefined;
    const pintor = (p: PeticionDelSuelo) => {
      peticiones.push(p);
      return new Promise<RespuestaDelSuelo>((res, rej) => {
        contestar = res;
        fallar = rej;
      });
    };
    return {
      pintor,
      peticiones,
      contestar: (r: RespuestaDelSuelo) => contestar(r),
      fallar: (e: Error) => fallar(e),
    };
  }
  const mapaDeBits = (w: number) =>
    ({ width: w, height: w, close: () => undefined }) as unknown as ImageBitmap;

  it('mientras pinta se ve el sucedáneo y el hilo principal solo pide los volúmenes', async () => {
    const pagina = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    apuntarElSueloEn(pagina);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 11 }).map, 11);
      const antes = pedidas.length;
      expect(sueloDelMapa(esc, 70).px).toBe(1);
      expect(pagina.dataset.escenario).toBe('cargando');
      expect(p.peticiones).toHaveLength(1);
      expect(p.peticiones[0]?.escena).toBe(esc.escena);
      expect(p.peticiones[0]?.px).toBe(PX_DEL_SUELO);
      // Ni una textura del suelo en el hilo principal: las pide el Worker.
      // (Las de los volúmenes que ya pidieron las partidas de antes no se repiten.)
      const pedidasAqui = pedidas.slice(antes);
      expect(pedidasAqui.length).toBeGreaterThan(0);
      const deVolumenes = new Set(esc.deVolumenes.map((src) => `/mapa/${src}`));
      for (const url of pedidasAqui) expect(deVolumenes.has(url), url).toBe(true);
      for (const src of esc.soloDelSuelo) expect(pedidasAqui).not.toContain(`/mapa/${src}`);
      // Otro fotograma mientras pinta: ni otra petición ni otro encargo.
      sueloDelMapa(esc, 70);
      expect(p.peticiones).toHaveLength(1);

      const entero = mapaDeBits(34 * PX_DEL_SUELO);
      const mitad = mapaDeBits(17 * PX_DEL_SUELO);
      p.contestar({ entero, mitad, imagenes: 40, faltan: [] });
      await vi.waitFor(() => expect(pagina.dataset.escenario).toBe('pintado'));
      expect(sueloDelMapa(esc, 70)).toEqual({ lienzo: entero, px: PX_DEL_SUELO });
      // La mitad es la del Worker: el hilo principal no reduce nada.
      expect(sueloDelMapa(esc, 40)).toEqual({ lienzo: mitad, px: PX_DEL_SUELO / 2 });
      expect(p.peticiones).toHaveLength(1);
    } finally {
      usarPintorDelSuelo(null);
    }
  });

  it('lo que no le llegó al Worker se dice como error, una vez, con su nombre', async () => {
    const pagina = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    apuntarElSueloEn(pagina);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 12 }).map, 12);
      sueloDelMapa(esc, 70);
      p.contestar({
        entero: mapaDeBits(1),
        mitad: mapaDeBits(1),
        imagenes: 40,
        faltan: ['texturas/agua.webp: HTTP 404'],
      });
      await vi.waitFor(() => expect(pagina.dataset.escenario).toBe('pintado'));
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]?.[0])).toContain('sin 1 de sus 40');
      expect(String(error.mock.calls[0]?.[0])).toContain('texturas/agua.webp');
    } finally {
      usarPintorDelSuelo(null);
      error.mockRestore();
    }
  });

  it('si el Worker falla, se dice y el suelo se pinta en el hilo principal', async () => {
    const pagina = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    apuntarElSueloEn(pagina);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 13 }).map, 13);
      sueloDelMapa(esc, 70);
      p.fallar(new Error('sin OffscreenCanvas en el Worker'));
      await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
      expect(String(error.mock.calls[0]?.[0])).toContain('sin OffscreenCanvas en el Worker');
      await vi.waitFor(() => expect(arteCargando()).toBe(false));
      expect(sueloDelMapa(esc, 70).px).toBe(PX_DEL_SUELO);
      expect(pagina.dataset.escenario).toBe('pintado');
    } finally {
      usarPintorDelSuelo(null);
      error.mockRestore();
    }
  });

  it('el pintor del Worker pide cada imagen del suelo, reintenta una vez y dice lo que no llegó', async () => {
    class LienzoAparte extends LienzoFalso {
      constructor(w: number, h: number) {
        super();
        this.width = w;
        this.height = h;
      }
      transferToImageBitmap() {
        return mapaDeBits(this.width);
      }
    }
    vi.stubGlobal('OffscreenCanvas', LienzoAparte);
    vi.stubGlobal('DOMMatrix', class {});
    try {
      const esc = escenarioDe(newGame({ seed: 14 }).map, 14);
      const AGUA = 'http://x/mapa/texturas/agua.webp';
      fallos.set(AGUA, 5);
      const antes = pedidas.length;
      const r = await pintarSueloAparte({ escena: esc.escena, px: 8, base: 'http://x/mapa/' });
      if ('error' in r) throw new Error(r.error);
      const pedidasAqui = pedidas.slice(antes);
      expect(r.imagenes).toBe(new Set(pedidasAqui).size);
      expect(pedidasAqui.filter((u) => u === AGUA)).toHaveLength(2);
      expect(r.faltan).toEqual(['texturas/agua.webp: HTTP 404']);
      expect(r.entero.width).toBe(esc.escena.W * 8);
      expect(r.mitad.width).toBe(Math.ceil((esc.escena.W * 8) / 2));
      fallos.delete(AGUA);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal('document', { createElement: () => new LienzoFalso() });
      vi.stubGlobal('Image', ImagenFalsa);
      vi.stubGlobal('fetch', fetchFalso);
      vi.stubGlobal('location', { href: 'http://x/' });
      vi.stubGlobal('createImageBitmap', async () => ({
        width: 0,
        height: 0,
        close: () => undefined,
      }));
    }
  });
});

describe('la escena se compone en una tarea aparte del primer fotograma', () => {
  it('la primera vez no está y se compone sola; después es la de `escenarioDe`', async () => {
    const map = newGame({ seed: 15 }).map;
    expect(escenarioListo(map, 15)).toBeNull();
    // Pedirla otra vez mientras tanto no encarga otra.
    expect(escenarioListo(map, 15)).toBeNull();
    await vi.waitFor(() => expect(escenarioListo(map, 15)).not.toBeNull());
    expect(escenarioListo(map, 15)).toBe(escenarioDe(map, 15));
  });

  it('si componer falla, el fallo sale en el siguiente fotograma y no se queda en negro', async () => {
    const roto = { ...newGame({ seed: 16 }).map, objects: [], terrain: [] };
    // El mismo fallo que da componerla de golpe.
    let motivo = '';
    try {
      escenarioDe({ ...roto }, 16);
    } catch (err) {
      motivo = (err as Error).message;
    }
    expect(motivo).not.toBe('');
    expect(escenarioListo(roto, 16)).toBeNull();
    await vi.waitFor(() => expect(() => escenarioListo(roto, 16)).toThrow(motivo));
  });
});

describe('el tope de alejar se cuenta una vez por escena y lienzo', () => {
  it('la misma cuenta sale de la memoria, y otro lienzo la rehace', () => {
    const esc = escenarioDe(newGame({ seed: 1 }).map, 1);
    const a = topeDeAlejar(esc, 1920, 1080);
    expect(topeDeAlejar(esc, 1920, 1080)).toBe(a);
    expect(topeDeAlejar(esc, 400, 300)).toBeLessThanOrEqual(a);
  });
});

describe('una sola caché de copias reducidas, de ida y vuelta', () => {
  const imagen = { naturalWidth: 400, naturalHeight: 200, width: 400, height: 200 };
  const copia = (ancho: number, tono?: string) =>
    copiaReducida(imagen as unknown as HTMLImageElement, 'modulos/x.webp', tono, ancho, ancho / 2);

  it('volver a un zoom de antes devuelve la misma copia, sin rehacerla', () => {
    const a = copia(100);
    const b = copia(140);
    expect(b).not.toBe(a);
    expect(copia(100)).toBe(a);
    expect(copia(140)).toBe(b);
  });

  it('el tono es parte de la clave: la misma imagen con otro tono es otra copia', () => {
    expect(copia(100, 'brightness(0.8)')).not.toBe(copia(100));
  });

  it('un fotograma no hace más de COPIAS_NUEVAS_POR_FOTOGRAMA copias nuevas: lo demás espera', () => {
    const im = imagen as unknown as HTMLImageElement;
    empezarFotogramaDeCopias();
    for (let i = 0; i < COPIAS_NUEVAS_POR_FOTOGRAMA; i++)
      expect(copiaReducidaSiCabe(im, `modulos/n${i}.webp`, undefined, 50, 25)).not.toBeNull();
    // Una imagen que no tiene copia de ningún tamaño: este fotograma no se pinta.
    expect(copiaReducidaSiCabe(im, 'modulos/otra.webp', undefined, 50, 25)).toBeNull();
    // Una que la tiene de otro tamaño: esa, que quien pinta escala.
    const vieja = copiaReducidaSiCabe(im, 'modulos/n0.webp', undefined, 80, 40);
    expect(vieja?.width).toBe(50);
    // Las ya hechas salen siempre.
    expect(copiaReducidaSiCabe(im, 'modulos/n1.webp', undefined, 50, 25)?.width).toBe(50);
    // El fotograma siguiente las hace.
    empezarFotogramaDeCopias();
    expect(copiaReducidaSiCabe(im, 'modulos/otra.webp', undefined, 50, 25)?.width).toBe(50);
    expect(copiaReducidaSiCabe(im, 'modulos/n0.webp', undefined, 80, 40)?.width).toBe(80);
  });

  it('pintarSprite no pinta lo aplazado y escala una copia de otro tamaño', () => {
    llamadas.length = 0;
    const s = { x: 2, y: 3, src: 'modulos/x.webp', alto: 1, nw: 100, nh: 100, ax: 50, ay: 100 };
    const imagenLista = { width: 100, height: 100 } as unknown as ImageBitmap;
    const otra = { width: 33, height: 33 } as unknown as ImageBitmap;
    const sprite = s as unknown as Parameters<typeof pintarSprite>[1];
    pintarSprite(contexto(), sprite, { tile: 40, imagen: () => imagenLista, reducida: () => null });
    expect(llamadas.filter((l) => l.metodo === 'drawImage' || l.metodo === 'fill')).toEqual([]);
    pintarSprite(contexto(), sprite, { tile: 40, imagen: () => imagenLista, reducida: () => otra });
    expect(llamadas.find((l) => l.metodo === 'drawImage')?.args).toEqual([otra, 60, 80, 40, 40]);
  });
});

describe('qué tapa a qué en el mapa', () => {
  /** Pinta el mapa de `state` con la cámara en `foco` y devuelve el registro. */
  function pintarMapa(state: ReturnType<typeof newGame>, foco: { x: number; y: number }) {
    const esc = escenarioDe(state.map, state.seed);
    sueloDelMapa(esc, 70);
    llamadas.length = 0;
    drawMapa(contexto(), {
      escena: state,
      camara: { tile: 70, x: foco.x - 6, y: foco.y - 4 },
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
    return { esc, registro: [...llamadas] };
  }

  /** Dónde se pinta el marcador de un volumen: su triángulo empieza en (x·T − w, y·T). */
  function indiceDelVolumen(
    registro: readonly Llamada[],
    s: Escenario['separada']['volumenes'][number]['s'],
  ) {
    const T = 70;
    const w = s.alto * T * 0.45;
    return registro.findIndex(
      (l) =>
        l.metodo === 'moveTo' &&
        Math.abs((l.args[0] as number) - (s.x * T - w)) < 1e-6 &&
        Math.abs((l.args[1] as number) - s.y * T) < 1e-6,
    );
  }

  /** El aro del héroe que está en el centro de la cámara (`pintarMapa`). */
  const indiceDelHeroe = (registro: readonly Llamada[]) =>
    registro.findIndex(
      (l) => l.metodo === 'ellipse' && l.args[0] === 6.5 * 70 && l.args[2] === 70 * 0.32,
    );
  /** Su inicial: el texto claro del disco. */
  const indiceDeLaInicial = (registro: readonly Llamada[], letra: string) =>
    registro.findIndex(
      (l) => l.metodo === 'fillText' && l.args[0] === letra && l.fillStyle === '#fbf6ea',
    );

  it('un pino delante tapa al héroe, y su inicial se ve encima del pino', async () => {
    const state = newGame({ seed: 1 });
    const esc = escenarioDe(state.map, 1);
    await vi.waitFor(() => expect(arteCargando()).toBe(false));
    // Un pino con la base en la casilla de un héroe, por delante de sus pies.
    const pino = esc.separada.volumenes.find(
      (v) =>
        v.s.clase === 'masa' &&
        v.s.y - Math.floor(v.s.y) > PIES.heroe &&
        state.map.terrain[Math.floor(v.s.y) * state.map.width + Math.floor(v.s.x)] !== undefined,
    );
    expect(pino).toBeDefined();
    const heroe = state.heroes[0]!;
    heroe.at = { x: Math.floor(pino!.s.x), y: Math.floor(pino!.s.y) };
    const { registro } = pintarMapa(state, heroe.at);
    const cuerpo = indiceDelHeroe(registro);
    const arbol = indiceDelVolumen(registro, pino!.s);
    const letra = indiceDeLaInicial(registro, heroe.name.charAt(0).toUpperCase());
    expect(cuerpo).toBeGreaterThanOrEqual(0);
    expect(arbol).toBeGreaterThan(cuerpo);
    expect(letra).toBeGreaterThan(arbol);
  });

  it('lo que tiene altura se recorta al mapa por los lados y por abajo, no por arriba (H3)', () => {
    const state = newGame({ seed: 1 });
    // La cámara mira la esquina de arriba a la izquierda, con margen negro alrededor.
    const { registro } = pintarMapa(state, { x: 3, y: 2 });
    const clip = registro.findIndex((l) => l.metodo === 'clip');
    expect(clip).toBeGreaterThan(0);
    const rect = registro[clip - 1];
    expect(rect?.metodo).toBe('rect');
    const [x, y, w, h] = (rect?.args ?? []) as number[];
    // `pintarMapa` pone la cámara en (foco − 6, foco − 4): el mapa empieza en (210, 140).
    expect(x).toBe(210);
    expect(w).toBe(state.map.width * 70);
    expect((y as number) + (h as number)).toBe(140 + state.map.height * 70);
    expect(y).toBeLessThan(-1000);
    // Los volúmenes se pintan dentro del recorte.
    expect(registro.findIndex((l) => l.metodo === 'moveTo')).toBeGreaterThan(clip);
  });

  it('semilla 1: el héroe que nace al norte de su castillo se pinta delante de él', () => {
    const state = newGame({ seed: 1 });
    const heroe = state.heroes[0]!;
    const castillo = state.map.objects.find(
      (o) => o.kind === 'town' && o.at.x === heroe.at.x && o.at.y === heroe.at.y + 1,
    );
    // La premisa: nace justo encima de su castillo, que mide casi dos casillas de alto.
    expect(castillo).toBeDefined();
    const { esc, registro } = pintarMapa(state, heroe.at);
    const volumen = esc.separada.volumenes.find((v) => v.s.objeto?.id === castillo!.id);
    expect(volumen).toBeDefined();
    // Su figura sube por encima de los pies del héroe: por la base, lo taparía.
    expect(volumen!.s.y - volumen!.s.alto).toBeLessThan(heroe.at.y + PIES.heroe);
    expect(volumen!.clave).toBeGreaterThan(heroe.at.y + PIES.heroe);
    expect(indiceDelHeroe(registro)).toBeGreaterThan(indiceDelVolumen(registro, volumen!.s));
  });
});
