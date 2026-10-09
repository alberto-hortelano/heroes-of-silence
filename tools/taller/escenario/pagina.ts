/**
 * La entrada de la página del taller (`pintor.ts` la empaqueta dentro del HTML):
 * carga las imágenes, pinta con `pintarEscena`, mide el suelo desnudo y deja el
 * informe en `window.__informe`. Es lo mismo que haría el juego, más la medida.
 */
import type { Escena } from '../../../src/client/render/escenario/colocar.js';
import {
  aguaEnLoAlto,
  espaldasSinCanto,
  espaldasSinLabio,
  sendaSobreElAgua,
} from '../../../src/client/render/escenario/escalon.js';
import {
  imagenesDeEscena,
  MARGEN,
  pintarEscena,
  sueloDesnudo,
  tamanoDeEscena,
} from '../../../src/client/render/escenario/pintar.js';

interface Ventana {
  __escena: Escena;
  __base: string;
  __tile: number;
  __informe?: Record<string, unknown>;
}

const w = window as unknown as Ventana;
const E = w.__escena;
const parametros = new URLSearchParams(location.search);
const T = Number(parametros.get('t')) || w.__tile;
// `?nubes=0`: sin las nubes del borde, para recortar lo de debajo (las capturas de antes y después).
const nubes = parametros.get('nubes') !== '0';
const M = MARGEN * T;

const imagenes = new Map<string, HTMLImageElement>();
const carga = imagenesDeEscena(E).map(
  (src) =>
    new Promise<void>((listo) => {
      const im = new Image();
      im.onload = im.onerror = () => listo();
      im.src = w.__base + src;
      imagenes.set(src, im);
    }),
);

void Promise.all(carga).then(() => {
  const lienzo = document.getElementById('lienzo') as HTMLCanvasElement;
  const { ancho, alto } = tamanoDeEscena(E, T, M);
  lienzo.width = ancho;
  lienzo.height = alto;
  const c = lienzo.getContext('2d') as CanvasRenderingContext2D;
  const imagen = (src: string) => {
    const im = imagenes.get(src);
    return im !== undefined && im.naturalWidth > 0 ? im : undefined;
  };
  const t0 = performance.now();
  pintarEscena(c, E, { tile: T, margen: M, imagen, nubes });
  const msPintar = Math.round(performance.now() - t0);
  let desnudo: number | null = null;
  try {
    desnudo = sueloDesnudo(E, { tile: T, imagen });
  } catch {
    // Abierta desde file:// el canvas queda contaminado y no se puede medir: se pinta igual.
  }
  const faltan = [...imagenes.entries()].filter(([, im]) => im.naturalWidth === 0);
  w.__informe = {
    desnudo,
    msPintar,
    imagenesQueFaltan: faltan.length,
    // Lo del escalón (#211) se mide aquí y no en `componer`: son máscaras a 16 px
    // por casilla, que el juego pinta en el Worker y no tiene por qué medir.
    aguaEnLoAlto: aguaEnLoAlto(E),
    espaldasSinLabio: espaldasSinLabio(E).length,
    espaldasSinCanto: espaldasSinCanto(E).length,
    sendaSobreElAgua: sendaSobreElAgua(E),
    ...E.informe,
  };
  const info = document.getElementById('info') as HTMLElement;
  info.textContent =
    (desnudo === null
      ? 'sin medir (ábrela con pnpm taller escenario)'
      : `suelo desnudo ${(desnudo * 100).toFixed(1)} %`) +
    ` · sprites ${E.sprites.length}` +
    (faltan.length > 0 ? ` · faltan ${faltan.length} imágenes` : '');
});
