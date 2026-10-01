/**
 * Una figura a 25° —héroe, monstruo o unidad—, la pinten el mapa o la batalla.
 *
 * Lo que decide qué hoja lleva cada cuerpo es `personajes.ts`; aquí solo se
 * corta el fotograma, se tiñe el maniquí del color que diga quien llama y, si la
 * hoja no ha llegado, se pinta el marcador de color. Así el juego se juega sin
 * arte, que es un contrato de este repositorio.
 */
import { asset } from './assets.js';
import { type CharacterClip, drawCharacter, sampleCharacter } from './character.js';
import { arteDe, HOJAS_DE_FIGURA, hojaPara } from './personajes.js';

/**
 * El maniquí teñido, uno por color. Teñir en cada fotograma serían 54
 * composiciones de una hoja de 1792×768 por fotograma; así es una por color y
 * por sesión.
 */
const teñidos = new Map<string, HTMLCanvasElement>();

function hojaTeñida(imagen: HTMLImageElement, color: string): HTMLCanvasElement {
  const clave = `${imagen.src}|${color}`;
  const guardada = teñidos.get(clave);
  if (guardada !== undefined) return guardada;
  const lienzo = document.createElement('canvas');
  lienzo.width = imagen.naturalWidth;
  lienzo.height = imagen.naturalHeight;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para teñir figuras');
  c.drawImage(imagen, 0, 0);
  // El modo `color` se queda con la luminancia del maniquí y el tono del bando:
  // el cian toma el color sin perder el sombreado. `multiply` lo dejaba pardo,
  // porque cian por rojo es casi negro. Y `destination-in` devuelve la silueta,
  // que el relleno había tapado entera.
  c.globalCompositeOperation = 'color';
  c.fillStyle = color;
  c.fillRect(0, 0, lienzo.width, lienzo.height);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(imagen, 0, 0);
  teñidos.set(clave, lienzo);
  return lienzo;
}

/**
 * ¿Hay alguna figura que respire? Con el arte cargado, el reposo se anima y el
 * lienzo tiene que repintarse a cada fotograma; sin él, los marcadores están
 * quietos y se pinta solo cuando algo cambia.
 */
export function hayFigurasAnimadas(): boolean {
  return HOJAS_DE_FIGURA.some((h) => asset('rpg', h) !== null);
}

interface Figura {
  readonly body: string;
  readonly clip: CharacterClip;
  /** Milisegundos desde que empezó el clip. */
  readonly tiempo: number;
  /** Dónde pisa, en pantalla. */
  readonly x: number;
  readonly suelo: number;
  /** Lo que mide la figura en pantalla, de la coronilla a los pies. */
  readonly alto: number;
  readonly mirandoIzquierda: boolean;
  /** El color del bando: tiñe el maniquí y pinta el marcador. */
  readonly color: string;
  /** Opacidad, para fundir a quien cae. */
  readonly alfa?: number;
  /** El destello de un golpe recibido, de 0 (nada) a 1 (de lleno). */
  readonly destello?: number;
  /** Rótulo del marcador sin arte: la inicial o la abreviatura. */
  readonly rotulo: string;
}

/**
 * Pinta la figura, con su arte o con el marcador si la hoja no ha llegado.
 *
 * El destello del golpe es la misma figura pintada otra vez encima en modo
 * `lighter`: suma luz solo donde hay figura, así que sirve igual para el
 * maniquí teñido, para un personaje con arte propio y para el marcador. Antes
 * era un teñido en blanco, que con arte propio no hacía nada —el teñido es
 * solo para el maniquí— y que costaba una copia entera de la hoja en blanco.
 */
export function pintarFigura(ctx: CanvasRenderingContext2D, f: Figura): void {
  const arte = arteDe(f.body);
  const hoja = hojaPara(arte, f.clip);
  const imagen = asset('rpg', hoja.imagen);
  const alfa = f.alfa ?? 1;
  const destello = f.destello ?? 0;
  ctx.save();
  ctx.globalAlpha = alfa;
  let pintar: () => void;
  if (imagen === null) {
    pintar = () => pintarMarcador(ctx, f);
  } else {
    const fuente = arte.propio ? imagen : hojaTeñida(imagen, f.color);
    const fotograma = sampleCharacter(fuente, hoja.atlas, f.clip, f.tiempo);
    // La celda se escala para que la FIGURA mida `alto`: cada hoja encuadra a su
    // personaje con un margen distinto, y escalar la celda a secas mezclaba alturas.
    const lado = (f.alto * hoja.atlas.cell) / hoja.altura;
    pintar = () => drawCharacter(ctx, fotograma, f.x, f.suelo, lado, f.mirandoIzquierda);
  }
  pintar();
  if (destello > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alfa * destello;
    pintar();
  }
  ctx.restore();
}

/** El último respaldo: un óvalo del color del bando con su rótulo. */
function pintarMarcador(ctx: CanvasRenderingContext2D, f: Figura): void {
  const alto = f.alto * 0.95;
  const ancho = f.alto * 0.38;
  ctx.fillStyle = f.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(f.x, f.suelo - alto / 2, ancho, alto / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#14110d';
  ctx.font = `bold ${Math.max(9, Math.round(ancho * 0.42))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(f.rotulo, f.x, f.suelo - alto / 2, ancho * 2);
}
