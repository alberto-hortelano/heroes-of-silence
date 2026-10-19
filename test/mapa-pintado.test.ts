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
import { EscenaAventura } from '../src/client/escenas/aventura.js';
import { arteCargando, imagenDeEscena } from '../src/client/render/assets.js';
import { TILE_MAX } from '../src/client/render/camara-mapa.js';
import {
  copiaReducida,
  copiaReducidaSiCabe,
  empezarFotogramaDeCopias,
  PIXELES_NUEVOS_POR_FOTOGRAMA,
} from '../src/client/render/copias.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { pintarSprite } from '../src/client/render/escenario/pintar.js';
import {
  type MensajeDelSuelo,
  pintarSueloAparte,
} from '../src/client/render/escenario/pintor-del-suelo.js';
import {
  type AvisosDelSuelo,
  apuntarElSueloEn,
  BYTES_DEL_SUELO_BUENO,
  type Escenario,
  escenarioDe,
  escenarioListo,
  type NivelesDelSuelo,
  nivelDelSuelo,
  type PintorDelSuelo,
  PX_DEL_ESBOZO,
  PX_DEL_SUELO,
  resolucionDelSuelo,
  sueloDelMapa,
  topeDeAlejar,
  usarPintorDelSuelo,
} from '../src/client/render/escenario/superficie.js';
import { drawMapa, PIES, recortadoArriba } from '../src/client/render/mapa.js';
import { Session } from '../src/client/session.js';
import { Casillas, type CasillasLeidas } from '../src/core/map/casillas.js';
import { LADO_DEL_MAPA } from '../src/core/map/generate.js';
import { objectAt } from '../src/core/map/map.js';
import { isWalkable } from '../src/core/map/terrain.js';
import { todosALaVista } from '../src/core/state/asaltantes.js';
import {
  HERO_SCOUT_RADIUS,
  heroesOf,
  revealEverything,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { primeraSemillaCon } from './helpers.js';

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

/** Un contexto 2D que no pinta: apunta cada llamada con el `fillStyle` del momento. */
function contexto(): CanvasRenderingContext2D {
  const estado: Record<string | symbol, unknown> = { canvas: { width: 900, height: 600 } };
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

/**
 * Una página de mentira que apunta cada estado del suelo por el que pasa, y con
 * él si en ese momento seguía cargado todo lo que solo pinta el suelo.
 */
function paginaQueApunta(esc?: () => Escenario) {
  const estados: string[] = [];
  const conSuArte: Record<string, boolean> = {};
  const dataset = new Proxy({} as Record<string, string>, {
    set(t, k, v: string) {
      t[k as string] = v;
      if (k === 'escenario') {
        estados.push(v);
        const e = esc?.();
        if (e !== undefined)
          conSuArte[v] = e.soloDelSuelo.every((src) => imagenDeEscena(src) !== undefined);
      }
      return true;
    },
  });
  const pagina = { dataset } as unknown as HTMLElement;
  apuntarElSueloEn(pagina);
  return { pagina, estados, conSuArte };
}

describe('el suelo se pinta una vez y suelta lo que solo servía para eso', () => {
  it('pide la escena una vez, enseña el sucedáneo, luego el esbozo, luego el bueno, y suelta lo del suelo', async () => {
    const esc = escenarioDe(newGame({ seed: 1 }).map, 1);
    const { pagina, estados, conSuArte } = paginaQueApunta(() => esc);
    expect(pagina.dataset.escenario).toBe('sin-mapa');

    const mientras = sueloDelMapa(esc, 70, 1);
    expect(pagina.dataset.escenario).toBe('cargando');
    expect(mientras.px).toBe(1);
    expect(pedidas.length).toBe(esc.imagenes.length);
    // Otro fotograma mientras llega: no se pide nada más.
    sueloDelMapa(esc, 70, 1);
    expect(pedidas.length).toBe(esc.imagenes.length);

    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    // Primero el esbozo, en su tarea, y luego el bueno, en la suya; mientras se
    // pintaba el bueno no se había soltado nada, que lo necesitaba.
    expect(estados.slice(-3)).toEqual(['cargando', 'esbozado', 'pintado']);
    expect(conSuArte.esbozado).toBe(true);
    const pintado = sueloDelMapa(esc, 70, 1);
    expect(pintado.px).toBe(PX_DEL_SUELO);
    // A 60 px de dispositivo o menos se copia el esbozo, que no se amplía.
    expect(sueloDelMapa(esc, 50, 1).px).toBe(PX_DEL_ESBOZO);

    // Lo que solo pinta el suelo se ha soltado; lo de los volúmenes sigue.
    expect(esc.soloDelSuelo.length).toBeGreaterThan(0);
    for (const src of esc.soloDelSuelo) expect(imagenDeEscena(src), src).toBeUndefined();
    const deVolumen = esc.imagenes.filter((src) => !esc.soloDelSuelo.includes(src));
    expect(deVolumen.length).toBeGreaterThan(0);
    for (const src of deVolumen) expect(imagenDeEscena(src), src).toBeDefined();

    // Y no se vuelve a pedir ni a pintar mientras no haga falta.
    expect(sueloDelMapa(esc, 70, 1)).toBe(pintado);
    expect(pedidas.length).toBe(esc.imagenes.length);

    // Otra partida vuelve a pedir lo soltado que también pinta ella.
    const otro = escenarioDe(newGame({ seed: 3 }).map, 3);
    const antes = pedidas.length;
    sueloDelMapa(otro, 70, 1);
    expect(pagina.dataset.escenario).toBe('cargando');
    const repedidas = pedidas.slice(antes);
    const soltadasQueUsa = otro.imagenes.filter((src) => esc.soloDelSuelo.includes(src));
    expect(soltadasQueUsa.length).toBeGreaterThan(0);
    for (const src of soltadasQueUsa) expect(repedidas).toContain(`/mapa/${src}`);
    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    expect(sueloDelMapa(otro, 70, 1).px).toBe(PX_DEL_SUELO);
    expect(pagina.dataset.escenario).toBe('pintado');
  });
});

describe('a qué resolución se pinta el suelo (nitidez en el zoom máximo)', () => {
  it('el suelo bueno no se amplía en el zoom máximo de la pantalla del usuario (dpr 1,09)', () => {
    expect(PX_DEL_SUELO).toBeGreaterThanOrEqual(Math.ceil(TILE_MAX * 1.09));
    expect(PX_DEL_ESBOZO).toBeLessThan(PX_DEL_SUELO);
  });

  const superficie = (px: number) => {
    const lienzo = new LienzoFalso();
    lienzo.width = 34 * px;
    lienzo.height = 34 * px;
    return { lienzo: lienzo as unknown as HTMLCanvasElement, px };
  };
  const niveles = (esbozo: boolean, bueno: boolean): NivelesDelSuelo => ({
    esbozo: esbozo ? superficie(PX_DEL_ESBOZO) : null,
    bueno: bueno ? superficie(PX_DEL_SUELO) : null,
    menores: [],
  });

  it('elige la superficie más pequeña que no se amplía, o la mayor que haya', () => {
    const n = niveles(true, true);
    expect(nivelDelSuelo(n, 110)).toBe(n.bueno);
    expect(nivelDelSuelo(n, 120)).toBe(n.bueno);
    expect(nivelDelSuelo(n, 61)).toBe(n.bueno);
    expect(nivelDelSuelo(n, 60)).toBe(n.esbozo);
    expect(nivelDelSuelo(n, 31)).toBe(n.esbozo);
    // Más allá de la mayor, la mayor: ampliada, pero la mejor que hay.
    expect(nivelDelSuelo(n, 200)).toBe(n.bueno);
    // Con solo el esbozo, el esbozo, aunque se amplíe; con solo el bueno, el bueno.
    const soloEsbozo = niveles(true, false);
    expect(nivelDelSuelo(soloEsbozo, 110)).toBe(soloEsbozo.esbozo);
    const soloBueno = niveles(false, true);
    expect(nivelDelSuelo(soloBueno, 70)).toBe(soloBueno.bueno);
    // Sin esbozo, las mitades salen del bueno.
    expect(nivelDelSuelo(soloBueno, 30)?.px).toBe(PX_DEL_SUELO / 4);
    expect(nivelDelSuelo(niveles(false, false), 110)).toBeUndefined();
  });

  it('en una pantalla densa, entre el esbozo y la mitad del bueno se copia esa mitad: nunca a menos de ×0,5', () => {
    // A dpr 2 sin tope: el bueno a 220 y el esbozo a 60. De 61 a 110 px el bueno
    // se reduciría a menos de la mitad.
    const n: NivelesDelSuelo = {
      esbozo: superficie(PX_DEL_ESBOZO),
      bueno: superficie(220),
      menores: [],
    };
    const medio = nivelDelSuelo(n, 70);
    expect(medio?.px).toBe(110);
    expect(medio?.lienzo.width).toBe(34 * 110);
    expect(nivelDelSuelo(n, 110)).toBe(medio);
    expect(n.menores).toHaveLength(1);
    expect(nivelDelSuelo(n, 111)).toBe(n.bueno);
    expect(nivelDelSuelo(n, 60)).toBe(n.esbozo);
    // La mitad del bueno es suya: la del esbozo no sale de ella.
    expect(nivelDelSuelo(n, 20)?.px).toBe(PX_DEL_ESBOZO / 2);
    expect(n.menores.map((m) => [m.de.px, m.mitad.px])).toEqual([
      [220, 110],
      [PX_DEL_ESBOZO, PX_DEL_ESBOZO / 2],
    ]);
    for (let px = 8; px <= 220; px++) {
      const elegido = nivelDelSuelo(n, px);
      expect(elegido?.px, `${px}`).toBeGreaterThanOrEqual(px);
      expect(px / (elegido?.px ?? 1), `${px}`).toBeGreaterThan(0.5);
    }
  });

  it('alejando en una pantalla grande saca la mitad del esbozo, una vez: nunca se reduce a menos de ×0,5', () => {
    const n = niveles(true, true);
    // 7680×4320 al tope: ~24 px de dispositivo por casilla; más lejos aún, ~17.
    const lejos = nivelDelSuelo(n, 17);
    expect(lejos?.px).toBe(PX_DEL_ESBOZO / 2);
    expect(lejos?.lienzo.width).toBe((34 * PX_DEL_ESBOZO) / 2);
    expect(nivelDelSuelo(n, 20)).toBe(lejos);
    expect(n.menores).toHaveLength(1);
    // Más lejos aún, la mitad de la mitad, sacada de la mitad.
    expect(nivelDelSuelo(n, 9)?.px).toBe(PX_DEL_ESBOZO / 4);
    expect(n.menores).toHaveLength(2);
    for (let px = 8; px <= PX_DEL_SUELO; px++) {
      const elegido = nivelDelSuelo(n, px);
      expect(elegido?.px, `${px}`).toBeGreaterThanOrEqual(px);
      expect(px / (elegido?.px ?? 1), `${px}`).toBeGreaterThan(0.5);
    }
  });
});

describe('el suelo bueno a la densidad de la pantalla (#148)', () => {
  it('hasta dpr 1,09 se pinta a PX_DEL_SUELO, como siempre', () => {
    for (let dpr = 0.5; dpr <= 1.09; dpr += 0.01)
      expect(resolucionDelSuelo(dpr, 34, 34), `dpr ${dpr}`).toEqual({
        px: PX_DEL_SUELO,
        pide: PX_DEL_SUELO,
      });
  });

  it('por encima, a la casilla del zoom máximo en píxeles de dispositivo, hasta dpr 1,5', () => {
    expect(resolucionDelSuelo(1.1, 34, 34)).toEqual({ px: 121, pide: 121 });
    expect(resolucionDelSuelo(1.25, 34, 34)).toEqual({ px: 138, pide: 138 });
    expect(resolucionDelSuelo(1.5, 34, 34)).toEqual({ px: 165, pide: 165 });
    // Nunca se amplía mientras quepa: px ≥ TILE_MAX × dpr.
    for (let dpr = 1.1; dpr <= 1.5; dpr += 0.01) {
      const r = resolucionDelSuelo(dpr, 34, 34);
      expect(r.px, `dpr ${dpr}`).toBeGreaterThanOrEqual(TILE_MAX * dpr - 1e-9);
      expect(r.px, `dpr ${dpr}`).toBeLessThan(TILE_MAX * dpr + 1);
    }
  });

  it('el tope de memoria corta por encima de dpr 1,5 y dice cuánto pedía; nunca baja de PX_DEL_SUELO', () => {
    expect(resolucionDelSuelo(2, 34, 34)).toEqual({ px: 165, pide: 220 });
    expect(resolucionDelSuelo(3, 34, 34)).toEqual({ px: 165, pide: 330 });
    for (const dpr of [1.5, 2, 3]) {
      const { px } = resolucionDelSuelo(dpr, 34, 34);
      expect(34 * px * 34 * px * 4).toBeLessThanOrEqual(BYTES_DEL_SUELO_BUENO);
    }
    // Un mapa mayor cabe a menos, pero no a menos que hoy.
    expect(resolucionDelSuelo(1.5, 48, 48)).toEqual({ px: PX_DEL_SUELO, pide: 165 });
    // El del juego desde #226 (42×42): a dpr 1 cabe entero (101,6 MB); a dpr
    // 1,5 el tope lo deja en 133 de los 165 que pide, y se amplía ×1,24.
    expect(resolucionDelSuelo(1, LADO_DEL_MAPA, LADO_DEL_MAPA)).toEqual({
      px: PX_DEL_SUELO,
      pide: PX_DEL_SUELO,
    });
    expect(resolucionDelSuelo(1.5, LADO_DEL_MAPA, LADO_DEL_MAPA)).toEqual({ px: 133, pide: 165 });
  });

  it('una densidad o un mapa que no lo son se rechazan diciéndolo', () => {
    for (const dpr of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => resolucionDelSuelo(dpr, 34, 34), `${dpr}`).toThrow(
        `la densidad de la pantalla tiene que ser un número de más de 0, y es ${dpr}`,
      );
    expect(() => resolucionDelSuelo(1, 0, 34)).toThrow('un mapa de 0×34 casillas');
  });
});

describe('una imagen del suelo que no llega no se da por pintada', () => {
  const AGUA = 'texturas/agua.webp';
  const veces = (src: string) => pedidas.filter((u) => u === `/mapa/${src}`).length;

  it('falla la primera vez y llega la segunda: el suelo espera y se pinta con ella', async () => {
    const esc = escenarioDe(newGame({ seed: 5 }).map, 5);
    const { pagina, estados } = paginaQueApunta();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(esc.soloDelSuelo).toContain(AGUA);
    const antes = veces(AGUA);
    fallos.set(`/mapa/${AGUA}`, 1);
    sueloDelMapa(esc, 70, 1);
    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    // La primera tanda se cerró con el agua fallida: no se pintó, se volvió a pedir.
    expect(veces(AGUA)).toBe(antes + 2);
    expect(estados.slice(-3)).toEqual(['cargando', 'esbozado', 'pintado']);
    expect(sueloDelMapa(esc, 70, 1).px).toBe(PX_DEL_SUELO);
    expect(pagina.dataset.escenario).toBe('pintado');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('si tampoco llega al volver a pedirla, lo dice como error, una vez, y pinta con su color', async () => {
    const { pagina } = paginaQueApunta();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const esc = escenarioDe(newGame({ seed: 6 }).map, 6);
    fallos.set(`/mapa/${AGUA}`, 2);
    sueloDelMapa(esc, 70, 1);
    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    expect(sueloDelMapa(esc, 70, 1).px).toBe(PX_DEL_SUELO);
    expect(pagina.dataset.escenario).toBe('pintado');
    // Una vez, aunque se pinten dos superficies.
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain(AGUA);
    error.mockRestore();
  });
});

describe('con Worker, el suelo se pinta aparte (H2 de la vuelta 1 de QA)', () => {
  /** Un pintor que no contesta hasta que se le dice: así se ve el «mientras tanto». */
  function pintorEnEspera() {
    const encargos: {
      readonly esc: Escenario;
      readonly resoluciones: readonly number[];
      readonly avisos: AvisosDelSuelo;
      terminado: boolean;
      acabar: () => void;
      fallar: (e: Error) => void;
    }[] = [];
    const pintor: PintorDelSuelo = (esc, resoluciones, avisos) => {
      let acabar: () => void = () => undefined;
      let fallar: (e: Error) => void = () => undefined;
      const hecho = new Promise<void>((res, rej) => {
        acabar = res;
        fallar = rej;
      });
      const e = { esc, resoluciones, avisos, terminado: false, acabar, fallar };
      encargos.push(e);
      return {
        hecho,
        terminar: () => {
          e.terminado = true;
          acabar();
        },
      };
    };
    return { pintor, encargos };
  }
  const mapaDeBits = (px: number, close: () => void = () => undefined) =>
    ({ width: 34 * px, height: 34 * px, close }) as unknown as ImageBitmap;

  it('un solo encargo para el esbozo y el bueno; mientras, el sucedáneo, y el hilo principal solo pide los volúmenes', async () => {
    const { pagina } = paginaQueApunta();
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 11 }).map, 11);
      const antes = pedidas.length;
      expect(sueloDelMapa(esc, 70, 1).px).toBe(1);
      expect(pagina.dataset.escenario).toBe('cargando');
      expect(p.encargos).toHaveLength(1);
      expect(p.encargos[0]?.esc).toBe(esc);
      expect(p.encargos[0]?.resoluciones).toEqual([PX_DEL_ESBOZO, PX_DEL_SUELO]);
      // Ni una textura del suelo en el hilo principal: las pide el Worker.
      // (Las de los volúmenes que ya pidieron las partidas de antes no se repiten.)
      const pedidasAqui = pedidas.slice(antes);
      expect(pedidasAqui.length).toBeGreaterThan(0);
      const deVolumenes = new Set(esc.deVolumenes.map((src) => `/mapa/${src}`));
      for (const url of pedidasAqui) expect(deVolumenes.has(url), url).toBe(true);
      for (const src of esc.soloDelSuelo) expect(pedidasAqui).not.toContain(`/mapa/${src}`);
      // Otro fotograma mientras pinta: ni otra petición ni otro encargo.
      sueloDelMapa(esc, 70, 1);
      expect(p.encargos).toHaveLength(1);

      // Llega el esbozo: se ve a cualquier zoom, ampliado si hace falta.
      const e = p.encargos[0]!;
      const esbozo = mapaDeBits(PX_DEL_ESBOZO);
      e.avisos.superficie({ lienzo: esbozo, px: PX_DEL_ESBOZO });
      expect(pagina.dataset.escenario).toBe('esbozado');
      expect(sueloDelMapa(esc, 120, 1)).toEqual({ lienzo: esbozo, px: PX_DEL_ESBOZO });

      const bueno = mapaDeBits(PX_DEL_SUELO);
      e.avisos.superficie({ lienzo: bueno, px: PX_DEL_SUELO });
      e.acabar();
      expect(pagina.dataset.escenario).toBe('pintado');
      expect(sueloDelMapa(esc, 110, 1)).toEqual({ lienzo: bueno, px: PX_DEL_SUELO });
      // Alejado, el esbozo: el hilo principal no reduce nada.
      expect(sueloDelMapa(esc, 50, 1)).toEqual({ lienzo: esbozo, px: PX_DEL_ESBOZO });
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
      expect(p.encargos).toHaveLength(1);
    } finally {
      usarPintorDelSuelo(null);
    }
  });

  it('otro mapa termina el encargo del anterior, cierra lo que pintó y lo que llegue tarde', async () => {
    const { pagina } = paginaQueApunta();
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 17 }).map, 17);
      sueloDelMapa(esc, 70, 1);
      const viejo = p.encargos[0]!;
      const cerrarEsbozo = vi.fn();
      viejo.avisos.superficie({
        lienzo: mapaDeBits(PX_DEL_ESBOZO, cerrarEsbozo),
        px: PX_DEL_ESBOZO,
      });
      const otro = escenarioDe(newGame({ seed: 18 }).map, 18);
      sueloDelMapa(otro, 70, 1);
      // El Worker del mapa viejo se para, y su esbozo se suelta.
      expect(viejo.terminado).toBe(true);
      expect(cerrarEsbozo).toHaveBeenCalledTimes(1);
      // Lo que aún llegue de él se cierra y no se pone.
      const cerrarTarde = vi.fn();
      viejo.avisos.superficie({ lienzo: mapaDeBits(PX_DEL_SUELO, cerrarTarde), px: PX_DEL_SUELO });
      expect(cerrarTarde).toHaveBeenCalledTimes(1);
      expect(sueloDelMapa(otro, 70, 1).px).toBe(1);
      expect(pagina.dataset.escenario).toBe('cargando');
      // El otro sigue a lo suyo (y no quedan tandas abiertas).
      const nuevo = p.encargos[1]!;
      expect(nuevo.terminado).toBe(false);
      nuevo.avisos.superficie({ lienzo: mapaDeBits(PX_DEL_ESBOZO), px: PX_DEL_ESBOZO });
      nuevo.avisos.superficie({ lienzo: mapaDeBits(PX_DEL_SUELO), px: PX_DEL_SUELO });
      nuevo.acabar();
      expect(pagina.dataset.escenario).toBe('pintado');
      expect(sueloDelMapa(otro, 110, 1).px).toBe(PX_DEL_SUELO);
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    } finally {
      usarPintorDelSuelo(null);
    }
  });

  // En un mapa de 34×34 (el del juego antes de #226), donde a dpr 1,5 caben los
  // 165 que pide: en el de 42×42 el tope lo corta a 133 (lo dice el test puro
  // de `resolucionDelSuelo`) y aquí se mira el encargo, no la cuenta.
  const EN_34 = { width: 34, height: 34 } as const;

  it('a dpr 1,5 encarga el bueno a 165 y lo usa en el zoom máximo; a dpr 2, a 165 y lo avisa una vez', async () => {
    const { pagina } = paginaQueApunta();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 21, ...EN_34 }).map, 21);
      sueloDelMapa(esc, 165, 1.5);
      expect(p.encargos[0]?.resoluciones).toEqual([PX_DEL_ESBOZO, 165]);
      expect(aviso).not.toHaveBeenCalled();
      const e = p.encargos[0]!;
      e.avisos.superficie({ lienzo: mapaDeBits(PX_DEL_ESBOZO), px: PX_DEL_ESBOZO });
      const bueno = mapaDeBits(165);
      e.avisos.superficie({ lienzo: bueno, px: 165 });
      e.acabar();
      expect(pagina.dataset.escenario).toBe('pintado');
      expect(sueloDelMapa(esc, 165, 1.5)).toEqual({ lienzo: bueno, px: 165 });

      const otro = escenarioDe(newGame({ seed: 22, ...EN_34 }).map, 22);
      sueloDelMapa(otro, 220, 2);
      sueloDelMapa(otro, 220, 2);
      expect(p.encargos[1]?.resoluciones).toEqual([PX_DEL_ESBOZO, 165]);
      expect(p.encargos).toHaveLength(2);
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(String(aviso.mock.calls[0]?.[0])).toBe(
        'el suelo del mapa se pinta a 165 px por casilla y esta pantalla pide 220 en el zoom máximo: no cabe en el tope de memoria del suelo (126 MB), y ahí se amplía ×1.33',
      );
      p.encargos[1]!.acabar();
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    } finally {
      usarPintorDelSuelo(null);
      aviso.mockRestore();
    }
  });

  it('si la densidad sube a media partida se vuelve a encargar el bueno, se ve el de antes mientras y lo que llegue del viejo se cierra', async () => {
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 23, ...EN_34 }).map, 23);
      sueloDelMapa(esc, 110, 1);
      const viejo = p.encargos[0]!;
      viejo.avisos.superficie({ lienzo: mapaDeBits(PX_DEL_ESBOZO), px: PX_DEL_ESBOZO });
      // El zoom del navegador al 125 % antes de que llegue el bueno.
      sueloDelMapa(esc, 138, 1.25);
      expect(viejo.terminado).toBe(true);
      expect(p.encargos).toHaveLength(2);
      // El esbozo ya estaba: solo se encarga el bueno.
      expect(p.encargos[1]?.resoluciones).toEqual([138]);
      // Lo que aún mande el encargo viejo no se pone: se cierra.
      const cerrarTarde = vi.fn();
      viejo.avisos.superficie({ lienzo: mapaDeBits(PX_DEL_SUELO, cerrarTarde), px: PX_DEL_SUELO });
      expect(cerrarTarde).toHaveBeenCalledTimes(1);
      expect(sueloDelMapa(esc, 138, 1.25).px).toBe(PX_DEL_ESBOZO);
      const cerrar138 = vi.fn();
      p.encargos[1]!.avisos.superficie({ lienzo: mapaDeBits(138, cerrar138), px: 138 });
      p.encargos[1]!.acabar();
      expect(sueloDelMapa(esc, 138, 1.25).px).toBe(138);
      // Si baja, se queda con el que hay: se reduce, no se repinta.
      expect(sueloDelMapa(esc, 110, 1).px).toBe(138);
      expect(p.encargos).toHaveLength(2);
      // Y si vuelve a subir, otro encargo, con el de 138 a la vista mientras.
      sueloDelMapa(esc, 165, 1.5);
      expect(p.encargos[2]?.resoluciones).toEqual([165]);
      expect(sueloDelMapa(esc, 165, 1.5).px).toBe(138);
      p.encargos[2]!.avisos.superficie({ lienzo: mapaDeBits(165), px: 165 });
      expect(cerrar138).toHaveBeenCalledTimes(1);
      expect(sueloDelMapa(esc, 165, 1.5).px).toBe(165);
      p.encargos[2]!.acabar();
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    } finally {
      usarPintorDelSuelo(null);
    }
  });

  it('lo que no le llegó al Worker se dice como error, con su nombre', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 12 }).map, 12);
      sueloDelMapa(esc, 70, 1);
      p.encargos[0]!.avisos.faltan(['texturas/agua.webp: HTTP 404'], 40);
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]?.[0])).toContain('sin 1 de sus 40');
      expect(String(error.mock.calls[0]?.[0])).toContain('texturas/agua.webp');
      p.encargos[0]!.acabar();
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
    } finally {
      usarPintorDelSuelo(null);
      error.mockRestore();
    }
  });

  it('si el Worker falla de entrada, se dice y el suelo entero se pinta en el hilo principal', async () => {
    const { pagina, estados } = paginaQueApunta();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 13 }).map, 13);
      sueloDelMapa(esc, 70, 1);
      p.encargos[0]!.fallar(new Error('sin OffscreenCanvas en el Worker'));
      await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1), PINTADO);
      expect(String(error.mock.calls[0]?.[0])).toContain('sin OffscreenCanvas en el Worker');
      expect(String(error.mock.calls[0]?.[0])).toContain(`a ${PX_DEL_ESBOZO} y ${PX_DEL_SUELO} px`);
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
      expect(estados.slice(-3)).toEqual(['cargando', 'esbozado', 'pintado']);
      expect(sueloDelMapa(esc, 70, 1).px).toBe(PX_DEL_SUELO);
      expect(pagina.dataset.escenario).toBe('pintado');
    } finally {
      usarPintorDelSuelo(null);
      error.mockRestore();
    }
  });

  it('si el Worker falla tras el esbozo, el hilo principal pinta solo el bueno', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = pintorEnEspera();
    usarPintorDelSuelo(p.pintor);
    try {
      const esc = escenarioDe(newGame({ seed: 19 }).map, 19);
      sueloDelMapa(esc, 70, 1);
      const esbozo = mapaDeBits(PX_DEL_ESBOZO);
      p.encargos[0]!.avisos.superficie({ lienzo: esbozo, px: PX_DEL_ESBOZO });
      p.encargos[0]!.fallar(new Error('el Worker se ha quedado sin memoria'));
      await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1), PINTADO);
      expect(String(error.mock.calls[0]?.[0])).toContain(`a ${PX_DEL_SUELO} px`);
      await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
      expect(sueloDelMapa(esc, 110, 1).px).toBe(PX_DEL_SUELO);
      // El esbozo es el del Worker: no se ha vuelto a pintar.
      expect(sueloDelMapa(esc, 50, 1).lienzo).toBe(esbozo);
    } finally {
      usarPintorDelSuelo(null);
      error.mockRestore();
    }
  });

  it('el pintor del Worker carga una vez, dice lo que no llegó y contesta una superficie por resolución, en orden', async () => {
    class LienzoAparte extends LienzoFalso {
      constructor(w: number, h: number) {
        super();
        this.width = w;
        this.height = h;
      }
      transferToImageBitmap() {
        return { width: this.width, height: this.height, close: () => undefined };
      }
    }
    vi.stubGlobal('OffscreenCanvas', LienzoAparte);
    vi.stubGlobal('DOMMatrix', class {});
    try {
      const esc = escenarioDe(newGame({ seed: 14 }).map, 14);
      const AGUA = 'http://x/mapa/texturas/agua.webp';
      fallos.set(AGUA, 5);
      const antes = pedidas.length;
      const mensajes: { m: MensajeDelSuelo; transferir?: Transferable[] }[] = [];
      await pintarSueloAparte({ escena: esc.escena, px: [8, 16], base: 'http://x/mapa/' }, (m, t) =>
        mensajes.push({ m, ...(t === undefined ? {} : { transferir: t }) }),
      );
      const pedidasAqui = pedidas.slice(antes);
      expect(mensajes).toHaveLength(3);
      const [primero, esbozo, bueno] = mensajes.map((x) => x.m);
      // Cada imagen se pide una vez para las dos resoluciones; la que falla, dos.
      expect(primero).toEqual({
        imagenes: new Set(pedidasAqui).size,
        faltan: ['texturas/agua.webp: HTTP 404'],
      });
      expect(pedidasAqui.filter((u) => u === AGUA)).toHaveLength(2);
      expect(pedidasAqui.length).toBe(new Set(pedidasAqui).size + 1);
      for (const [m, px] of [
        [esbozo, 8],
        [bueno, 16],
      ] as const) {
        if (m === undefined || !('px' in m)) throw new Error('falta una superficie');
        expect(m.px).toBe(px);
        expect(m.lienzo.width).toBe(esc.escena.W * px);
      }
      // Cada superficie se transfiere: el Worker no se queda con ella.
      expect(mensajes[1]?.transferir).toEqual([(esbozo as { lienzo: unknown }).lienzo]);
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
    await vi.waitFor(() => expect(escenarioListo(map, 15)).not.toBeNull(), PINTADO);
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
    await vi.waitFor(() => expect(() => escenarioListo(roto, 16)).toThrow(motivo), PINTADO);
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

  it('un fotograma no hace más de PIXELES_NUEVOS_POR_FOTOGRAMA píxeles de copias nuevas: lo demás espera', () => {
    const im = imagen as unknown as HTMLImageElement;
    empezarFotogramaDeCopias();
    // Copias de 100×100: caben justas las que llenan el tope.
    const caben = Math.ceil(PIXELES_NUEVOS_POR_FOTOGRAMA / (100 * 100));
    for (let i = 0; i < caben; i++)
      expect(copiaReducidaSiCabe(im, `modulos/p${i}.webp`, undefined, 100, 100)).not.toBeNull();
    // Una imagen que no tiene copia de ningún tamaño: este fotograma no se pinta.
    expect(copiaReducidaSiCabe(im, 'modulos/otra-p.webp', undefined, 50, 25)).toBeNull();
    // Una que la tiene de otro tamaño: esa, que quien pinta escala.
    const vieja = copiaReducidaSiCabe(im, 'modulos/p0.webp', undefined, 80, 40);
    expect(vieja?.width).toBe(100);
    // Las ya hechas salen siempre.
    expect(copiaReducidaSiCabe(im, 'modulos/p1.webp', undefined, 100, 100)?.width).toBe(100);
    // El fotograma siguiente las hace.
    empezarFotogramaDeCopias();
    expect(copiaReducidaSiCabe(im, 'modulos/otra-p.webp', undefined, 50, 25)?.width).toBe(50);
    expect(copiaReducidaSiCabe(im, 'modulos/p0.webp', undefined, 80, 40)?.width).toBe(80);
  });

  it('cuenta píxeles y no copias: las pequeñas caben a cientos y las grandes llenan antes el fotograma', () => {
    const im = imagen as unknown as HTMLImageElement;
    empezarFotogramaDeCopias();
    for (let i = 0; i < 400; i++)
      expect(copiaReducidaSiCabe(im, `modulos/q${i}.webp`, undefined, 20, 20)).not.toBeNull();
    empezarFotogramaDeCopias();
    // Una sola copia mayor que el tope se hace igual, pero llena el fotograma.
    const lado = Math.ceil(Math.sqrt(PIXELES_NUEVOS_POR_FOTOGRAMA)) + 1;
    expect(copiaReducidaSiCabe(im, 'modulos/enorme.webp', undefined, lado, lado)?.width).toBe(lado);
    expect(copiaReducidaSiCabe(im, 'modulos/tras-la-enorme.webp', undefined, 10, 10)).toBeNull();
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
  function pintarMapa(
    state: ReturnType<typeof newGame>,
    foco: { x: number; y: number },
    explorado: CasillasLeidas | null = null,
  ) {
    const esc = escenarioDe(state.map, state.seed);
    sueloDelMapa(esc, 70, 1);
    llamadas.length = 0;
    drawMapa(contexto(), {
      escena: state,
      heroes: state.heroes,
      objetos: state.map.objects,
      asaltantes: todosALaVista(state.raiders),
      camara: { tile: 70, x: foco.x - 6, y: foco.y - 4 },
      ancho: 900,
      alto: 600,
      explorado,
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
    await vi.waitFor(() => expect(arteCargando()).toBe(false), PINTADO);
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

  describe('lo que asoma por arriba desde una casilla sin explorar se recorta en el borde (#152)', () => {
    const state = newGame({ seed: 1 });
    const { width: W, height: H } = state.map;
    const esc = escenarioDe(state.map, 1);
    const todas = Array.from({ length: W * H }, (_, i) => i);
    const de = (indices: readonly number[]) => Casillas.deIndices(state.map, indices);

    it('apunta su casilla a lo que sube por encima del mapa, y solo a eso', () => {
      const vols = esc.porFila.flat();
      const asoman = vols.filter((v) => v.asomaPorArriba !== null);
      // Los picos de la captura de la issue: la premisa del caso.
      expect(asoman.length).toBeGreaterThan(0);
      for (const v of vols) {
        expect(v.asomaPorArriba !== null).toBe(cajaDeSprite(v.s)[1] < 0);
        // La casilla de su base, la de su fila en `porFila`: lo que nace fuera
        // del mapa (la escena tiene margen) cuenta como de la casilla del borde.
        const x = Math.min(W - 1, Math.max(0, Math.floor(v.s.x)));
        const y = Math.min(H - 1, Math.max(0, Math.floor(v.clave)));
        if (v.asomaPorArriba !== null) expect(v.asomaPorArriba).toBe(y * W + x);
      }
    });

    it('se recorta sin explorar; explorada o sin niebla, no', () => {
      const vol = esc.porFila.flat().find((v) => v.asomaPorArriba !== null)!;
      const sinEsa = de(todas.filter((k) => k !== vol.asomaPorArriba));
      expect(recortadoArriba(vol, sinEsa)).toBe(true);
      expect(recortadoArriba(vol, de(todas))).toBe(false);
      expect(recortadoArriba(vol, null)).toBe(false);
      const bajo = esc.porFila.flat().find((v) => v.asomaPorArriba === null)!;
      expect(recortadoArriba(bajo, de([]))).toBe(false);
    });

    /** El último recorte antes de pintar el marcador `i`: el rectángulo de su `clip`. */
    function recorteDe(registro: readonly Llamada[], i: number): number[] {
      for (let j = i; j > 0; j--)
        if (registro[j]?.metodo === 'clip') {
          expect(registro[j - 1]?.metodo).toBe('rect');
          return registro[j - 1]?.args as number[];
        }
      throw new Error('el marcador se pinta sin recorte');
    }

    it('drawMapa lo pinta con un recorte cuyo borde de arriba es el del mapa; explorado, sin él', () => {
      const vol = esc.porFila.flat().find((v) => v.asomaPorArriba !== null)!;
      const foco = { x: Math.floor(vol.s.x), y: 2 };
      const sinEsa = de(todas.filter((k) => k !== vol.asomaPorArriba));

      const tapado = pintarMapa(state, foco, sinEsa).registro;
      const i = indiceDelVolumen(tapado, vol.s);
      expect(i).toBeGreaterThan(0);
      // En píxeles del mapa (`setTransform` al origen): el rectángulo del mapa entero.
      expect(recorteDe(tapado, i)).toEqual([0, 0, W * 70, H * 70]);

      const visto = pintarMapa(state, foco, de(todas)).registro;
      const j = indiceDelVolumen(visto, vol.s);
      expect(j).toBeGreaterThan(0);
      expect(recorteDe(visto, j)[1]).toBeLessThan(-1000);
    });
  });

  it('el héroe al norte de su castillo se pinta delante de él', () => {
    // La premisa: está justo encima de su castillo, que mide casi dos casillas
    // de alto. Antes nacía ahí en alguna semilla (la 1 hasta #169); desde el
    // 19-10-2026 nace dentro, así que se le pone a mano en la primera semilla
    // cuya casilla de encima de la base se pisa y está libre.
    const norteDeLaBase = (st: ReturnType<typeof newGame>) => {
      const base = st.map.objects.find((o) => o.kind === 'town' && o.owner === 0)!;
      return { castillo: base, at: { x: base.at.x, y: base.at.y - 1 } };
    };
    const { semilla } = primeraSemillaCon('una base con su casilla de encima libre', (s) => {
      const st = newGame({ seed: s });
      const { at } = norteDeLaBase(st);
      const libre =
        at.y >= 0 &&
        isWalkable(st.map.terrain[at.y * st.map.width + at.x]!) &&
        objectAt(st.map, at) === undefined;
      return libre ? true : undefined;
    });
    const state = newGame({ seed: semilla });
    const heroe = state.heroes[0]!;
    const { castillo, at } = norteDeLaBase(state);
    heroe.at = at;
    const { esc, registro } = pintarMapa(state, heroe.at);
    const volumen = esc.separada.volumenes.find((v) => v.s.objeto?.id === castillo.id);
    expect(volumen).toBeDefined();
    // Su figura sube por encima de los pies del héroe: por la base, lo taparía.
    expect(volumen!.s.y - volumen!.s.alto).toBeLessThan(heroe.at.y + PIES.heroe);
    expect(volumen!.clave).toBeGreaterThan(heroe.at.y + PIES.heroe);
    expect(indiceDelHeroe(registro)).toBeGreaterThan(indiceDelVolumen(registro, volumen!.s));
  });
});

describe('un grupo que vuelve a la vista aparece en su casilla (H3 de QA de #130)', () => {
  /** Dónde cae la chapa del grupo —el texto «13»— en un fotograma, en píxeles; `null` si no sale. */
  function chapaDelGrupo(
    state: ReturnType<typeof newGame>,
    grupos: readonly { id: string; at: { x: number; y: number } }[],
    tiempo: number,
  ): { x: number; y: number } | null {
    const camara = { tile: 70, x: state.raiders[0]!.at.x - 6, y: state.raiders[0]!.at.y - 4 };
    llamadas.length = 0;
    drawMapa(contexto(), {
      escena: state,
      heroes: state.heroes,
      objetos: state.map.objects,
      asaltantes: todosALaVista(
        grupos.map((g) => ({ ...g, troops: [{ creature: 'esqueleto-guerrero', count: 13 }] })),
      ),
      camara,
      ancho: 900,
      alto: 600,
      explorado: null,
      visibles: null,
      ruta: [],
      seleccionado: null,
      hover: null,
      semilla: state.seed,
      tiempo,
    });
    const texto = llamadas.find((l) => l.metodo === 'fillText' && l.args[0] === '13');
    return texto === undefined ? null : { x: texto.args[1] as number, y: texto.args[2] as number };
  }

  /** Dónde cae la chapa de un grupo quieto en `at`: la de uno que se pinta por primera vez. */
  const chapaEn = (state: ReturnType<typeof newGame>, at: { x: number; y: number }) =>
    chapaDelGrupo(state, [{ id: `quieto-${at.x},${at.y}`, at }], 0);

  it('el que deja de pintarse se olvida: al volver no anda desde donde se le vio', () => {
    const state = newGame({ seed: 1 });
    sueloDelMapa(escenarioDe(state.map, state.seed), 70, 1);
    const id = state.raiders[0]!.id;
    const ayer = state.raiders[0]!.at;
    const hoy = { x: ayer.x + 2, y: ayer.y + 1 };
    chapaDelGrupo(state, [{ id, at: ayer }], 0);
    // Sale de la vista: este fotograma no lo pinta.
    expect(chapaDelGrupo(state, [], 1000)).toBeNull();
    // Vuelve, en otra casilla: aparece en ella, no a mitad de camino desde ayer.
    expect(chapaDelGrupo(state, [{ id, at: hoy }], 1001)).toEqual(chapaEn(state, hoy));
  });

  it('el que se sigue pintando sí anda: sale de su casilla de ayer', () => {
    const state = newGame({ seed: 1 });
    sueloDelMapa(escenarioDe(state.map, state.seed), 70, 1);
    const id = state.raiders[0]!.id;
    const ayer = state.raiders[0]!.at;
    const hoy = { x: ayer.x + 2, y: ayer.y + 1 };
    chapaDelGrupo(state, [{ id, at: ayer }], 0);
    expect(chapaDelGrupo(state, [{ id, at: hoy }], 1000)).toEqual(chapaEn(state, ayer));
  });
});

describe('el lienzo de quien juega pinta los héroes que se ven AHORA (#64)', () => {
  /** Los aros de héroe de un fotograma a 70 px por casilla: uno por héroe pintado. */
  const aros = (registro: readonly Llamada[]) =>
    registro.filter(
      (l) => l.metodo === 'ellipse' && l.args[2] === 70 * 0.32 && l.args[3] === 70 * 0.13,
    ).length;

  it('el rival en una casilla explorada que nadie mira no se pinta; a la vista, sí', () => {
    const s = new Session(92);
    revealEverything(s.state, 0);
    const mio = heroesOf(s.state, 0)[0]!;
    const suyo = heroesOf(s.state, 1)[0]!;
    const esc = escenarioDe(s.state.map, s.state.seed);
    sueloDelMapa(esc, 70, 1);
    const escena = new EscenaAventura(() => s);
    const [ancho, alto] = [2400, 2400];
    const fotograma = () => {
      llamadas.length = 0;
      escena.dibujar(contexto(), ancho, alto, 0);
      return [...llamadas];
    };
    // Una casilla explorada, sin mirar, en línea con mi héroe y justo fuera de
    // su vista (de r + 1 a r + 4: dentro del encuadre). Era «a seis» escrito,
    // y desde #229 la vista es 5 y el castillo mira 6: la casilla a seis de la
    // semilla 92 queda a la vista de su castillo.
    const mirando = visibleNow(s.state, 0);
    const lejos = [1, 2, 3, 4]
      .flatMap((k) => [-(HERO_SCOUT_RADIUS + k), HERO_SCOUT_RADIUS + k])
      .flatMap((d) => [
        { x: mio.at.x + d, y: mio.at.y },
        { x: mio.at.x, y: mio.at.y + d },
      ])
      .find((p) => s.state.players[0]!.fog.has(p) && !mirando.has(p));
    expect(lejos, 'la semilla no deja una casilla sin mirar junto a la vista').toBeDefined();

    suyo.at = { x: mio.at.x + 1, y: mio.at.y };
    const conElRival = aros(fotograma());
    suyo.at = lejos!;
    const sinElRival = aros(fotograma());
    expect(sinElRival).toBeGreaterThan(0);
    expect(conElRival).toBe(sinElRival + 1);
    // «Ver mapa entero» lo enseña: el aro que falta era el suyo.
    s.revealAll = true;
    expect(aros(fotograma())).toBe(conElRival);
  });
});
