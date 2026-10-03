/**
 * Las piezas pintadas del mapa colocadas por su pie.
 *
 * Cada `assets/mapa/<pieza>.json` está **derivado de la imagen** por el taller
 * (`ancho`, `alto` y `ancla`: el centro de su base, en píxeles de la imagen), y
 * se importa tal cual: las cifras no se copian aquí (#120). Sin la imagen no se
 * pinta nada y quien llama pone su marcador.
 */
import ciudad from '../../../assets/mapa/ciudad.json' with { type: 'json' };
import madera from '../../../assets/mapa/madera.json' with { type: 'json' };
import montana1 from '../../../assets/mapa/montana-1.json' with { type: 'json' };
import montana2 from '../../../assets/mapa/montana-2.json' with { type: 'json' };
import montana3 from '../../../assets/mapa/montana-3.json' with { type: 'json' };
import nodoHito from '../../../assets/mapa/nodo-hito.json' with { type: 'json' };
import oro from '../../../assets/mapa/oro.json' with { type: 'json' };
import piedra from '../../../assets/mapa/piedra.json' with { type: 'json' };
import pueblo from '../../../assets/mapa/pueblo.json' with { type: 'json' };
import { asset, type PiezaDelMapa } from './assets.js';
import { densidadDe } from './lienzo.js';

interface Medidas {
  readonly ancho: number;
  readonly alto: number;
  readonly ancla: readonly number[];
}

const MEDIDAS: Readonly<Record<PiezaDelMapa, Medidas>> = {
  'montana-1': montana1,
  'montana-2': montana2,
  'montana-3': montana3,
  'nodo-hito': nodoHito,
  ciudad,
  pueblo,
  oro,
  piedra,
  madera,
};

/**
 * Cada pieza ya reducida al tamaño al que se pinta, una vez por pieza y por
 * ancho en píxeles de dispositivo. Las piezas vienen a 1024 de ancho y se
 * pintan a 60-250: reducirlas en cada `drawImage` de cada fotograma, con el
 * suavizado de calidad alta, era pagar el filtro centenares de veces por
 * fotograma para dar siempre lo mismo. Se vacía al pasar de unas decenas, que es
 * lo que dan los zooms de una partida.
 */
const reducidas = new Map<string, { imagen: HTMLImageElement; lienzo: HTMLCanvasElement }>();
const MAX_REDUCIDAS = 64;

function reducida(
  pieza: PiezaDelMapa,
  img: HTMLImageElement,
  m: Medidas,
  anchoEnDispositivo: number,
): HTMLCanvasElement {
  const clave = `${pieza}|${anchoEnDispositivo}`;
  const hecha = reducidas.get(clave);
  // La imagen se compara por identidad: si el arte se recargara, la reducida
  // sería de la vieja.
  if (hecha !== undefined && hecha.imagen === img) return hecha.lienzo;
  if (reducidas.size >= MAX_REDUCIDAS) reducidas.clear();
  const lienzo = document.createElement('canvas');
  lienzo.width = anchoEnDispositivo;
  lienzo.height = Math.max(1, Math.round((m.alto * anchoEnDispositivo) / m.ancho));
  const c = lienzo.getContext('2d');
  if (c === null)
    throw new Error(`este navegador no tiene canvas 2D para reducir la pieza ${pieza}`);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  reducidas.set(clave, { imagen: img, lienzo });
  return lienzo;
}

/**
 * Lo que ocupa `pieza` pintada a `ancho` (en las unidades que se quiera) con su
 * ancla en el origen: cuánto se extiende a cada lado y hacia arriba y abajo. Lo
 * lee el mapa para no dejar que una montaña tape la casilla de al lado.
 */
export function cajaDePieza(
  pieza: PiezaDelMapa,
  ancho: number,
): { izquierda: number; derecha: number; arriba: number; abajo: number } {
  const m = MEDIDAS[pieza];
  const [ax, ay] = m.ancla;
  if (ax === undefined || ay === undefined) {
    throw new Error(`la pieza ${pieza} no trae un ancla de dos cifras en su .json`);
  }
  const k = ancho / m.ancho;
  return {
    izquierda: ax * k,
    derecha: (m.ancho - ax) * k,
    arriba: ay * k,
    abajo: (m.alto - ay) * k,
  };
}

/**
 * Pinta `pieza` con su ancla en (`x`, `suelo`) y `ancho` píxeles de ancho.
 * Devuelve `false` si la imagen no ha llegado: quien llama pinta su marcador.
 */
export function pintarPieza(
  ctx: CanvasRenderingContext2D,
  pieza: PiezaDelMapa,
  x: number,
  suelo: number,
  ancho: number,
): boolean {
  const img = asset('mapa', pieza);
  if (img === null) return false;
  const m = MEDIDAS[pieza];
  const [ax, ay] = m.ancla;
  if (ax === undefined || ay === undefined) {
    throw new Error(`la pieza ${pieza} no trae un ancla de dos cifras en su .json`);
  }
  const escala = ancho / m.ancho;
  const dpr = densidadDe(ctx);
  const lienzo = reducida(pieza, img, m, Math.max(1, Math.round(ancho * dpr)));
  ctx.drawImage(lienzo, x - ax * escala, suelo - ay * escala, m.ancho * escala, m.alto * escala);
  return true;
}
