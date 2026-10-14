/**
 * La vista de regiones del mapa de aventura, **solo en `pnpm dev`**.
 *
 * Con la tecla `R` o el botón «Regiones», encima del mapa pintado va un velo
 * oscuro y, sobre él, la red del mapa: cada región de un color con su borde y su
 * etiqueta (nombre, id y nivel), las casillas de barrera con un tono discreto por
 * tipo, los caminos (los tramos de `GameMap.caminos`), los nodos (objetos `node`
 * y ciudades) con su barrera y su dueño, y una línea fina de cada nodo a cada
 * región que toca. **Sin niebla**: enseña el mapa entero, que es para lo que sirve.
 *
 * No aplica ninguna regla: lee el mapa de la sesión y la red de `estructura`
 * (`red.ts`). El clic sigue moviendo al héroe. Lo que se deriva del mapa se hace
 * una vez por mapa; a cada fotograma solo se copia.
 */
import type { GameMap } from '@core/map/map.js';
import { type Barrera, esBarrera } from '@core/map/terrain.js';
import type { EscenaAventura } from '../escenas/aventura.js';
import { html, pintar } from '../html.js';
import { type CamaraMapa, mundoAPixel } from '../render/camara-mapa.js';
import { playerColor } from '../render/palette.js';
import type { Session } from '../session.js';
import { type RedPintada, redPintada } from './red.js';
import type { Desarrollo } from './tipos.js';

/** El velo sobre todo lo pintado: oscuro, pero que el relieve se siga leyendo. */
const VELO = 0.6;
/** El relleno de cada casilla de región. */
const ALFA_DE_REGION = 0.35;
/**
 * Lo que no es región se oscurece aún más, con un tinte apagado de su barrera:
 * con colores vivos, el bosque se confundía con una región verde y el agua con
 * una azul.
 */
const ALFA_DE_BARRERA = 0.5;

const COLOR_DE_BARRERA: Readonly<Record<Barrera, readonly [number, number, number]>> = {
  mountain: [45, 45, 48],
  water: [15, 30, 70],
  forest: [12, 38, 18],
  cliff: [60, 38, 18],
  wall: [80, 22, 22],
};

const NOMBRE_DE_BARRERA: Readonly<Record<Barrera, string>> = {
  mountain: 'montaña',
  water: 'agua',
  forest: 'bosque',
  cliff: 'acantilado',
  wall: 'muro',
};

/**
 * El color de la región `k`: tonos separados por el ángulo áureo, para que dos
 * índices seguidos —que suelen ser vecinas— no se parezcan.
 */
export function colorDeRegion(k: number): readonly [number, number, number] {
  const h = (k * 137.508) % 360;
  // HSL → RGB con s = 0,75 y l = 0,55.
  const s = 0.75;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const css = ([r, g, b]: readonly [number, number, number], a = 1): string =>
  `rgba(${r}, ${g}, ${b}, ${a})`;

/** Lo pintado una vez por mapa: un píxel por casilla, que se amplía sin suavizar. */
interface Capa {
  readonly map: GameMap;
  readonly red: RedPintada;
  readonly casillas: OffscreenCanvas;
}

function hacerCapa(map: GameMap): Capa {
  const red = redPintada(map);
  const casillas = new OffscreenCanvas(map.width, map.height);
  const c = casillas.getContext('2d');
  if (c === null) throw new Error('este navegador no da un contexto 2D para la vista de regiones');
  const img = c.createImageData(map.width, map.height);
  for (let i = 0; i < map.width * map.height; i++) {
    const r = red.regionDe[i] as number;
    const t = map.terrain[i];
    let rgb: readonly [number, number, number] | null = null;
    let a = 0;
    if (r >= 0) {
      rgb = colorDeRegion(r);
      a = ALFA_DE_REGION;
    } else if (t !== undefined && esBarrera(t)) {
      rgb = COLOR_DE_BARRERA[t];
      a = ALFA_DE_BARRERA;
    }
    if (rgb === null) continue;
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  c.putImageData(img, 0, 0);
  return { map, red, casillas };
}

/** Una serie de segmentos `x0, y0, x1, y1` del mundo, como un solo trazo en píxeles. */
function trazar(ctx: CanvasRenderingContext2D, cam: CamaraMapa, seg: Float32Array): void {
  ctx.beginPath();
  for (let k = 0; k < seg.length; k += 4) {
    const a = mundoAPixel(cam, seg[k] as number, seg[k + 1] as number);
    const b = mundoAPixel(cam, seg[k + 2] as number, seg[k + 3] as number);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
}

/** Un texto con contorno oscuro, legible sobre cualquier color. */
function rotulo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.strokeText(texto, x, y);
  ctx.fillText(texto, x, y);
}

function dibujarCapa(ctx: CanvasRenderingContext2D, capa: Capa, cam: CamaraMapa): void {
  const { red } = capa;
  const lienzo = ctx.canvas;
  ctx.save();
  // El velo, en píxeles del lienzo: cubre todo lo pintado, figuras incluidas.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(0, 0, 0, ${VELO})`;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.restore();

  // Las casillas: la imagen de un píxel por casilla, a la escala de la cámara.
  const o = mundoAPixel(cam, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(capa.casillas, o.x, o.y, red.ancho * cam.tile, red.alto * cam.tile);

  // Los bordes: oscuro debajo y claro encima, para que se lean en todo color.
  trazar(ctx, cam, red.bordes);
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.stroke();

  // Las aristas de la red: de cada nodo a la etiqueta de cada región que toca.
  ctx.beginPath();
  for (const n of red.nodos) {
    const a = mundoAPixel(cam, n.centro.x, n.centro.y);
    for (const r of n.regiones) {
      const reg = red.regiones[r];
      if (reg === undefined) continue;
      const b = mundoAPixel(cam, reg.etiqueta.x, reg.etiqueta.y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.stroke();
  ctx.setLineDash([]);

  // Los caminos, por el centro de las casillas.
  trazar(ctx, cam, red.caminos);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, cam.tile * 0.12);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, cam.tile * 0.06);
  ctx.strokeStyle = '#f2e3b3';
  ctx.stroke();

  // Los nodos: rombo el nodo, cuadrado la ciudad; relleno del color de su dueño.
  const radio = Math.max(7, cam.tile * 0.28);
  const letra = Math.round(Math.max(10, Math.min(14, cam.tile * 0.2)));
  ctx.font = `bold ${letra}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const n of red.nodos) {
    const p = mundoAPixel(cam, n.centro.x, n.centro.y);
    const o = n.objeto;
    const dueño = o.kind === 'town' || o.kind === 'node' ? o.owner : null;
    ctx.beginPath();
    if (n.ciudad) ctx.rect(p.x - radio, p.y - radio, 2 * radio, 2 * radio);
    else {
      ctx.moveTo(p.x, p.y - radio);
      ctx.lineTo(p.x + radio, p.y);
      ctx.lineTo(p.x, p.y + radio);
      ctx.lineTo(p.x - radio, p.y);
      ctx.closePath();
    }
    ctx.fillStyle = playerColor(dueño);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    const barrera = o.kind === 'node' ? NOMBRE_DE_BARRERA[o.barrera] : 'ciudad';
    const quien = dueño === null ? '' : ` · j${dueño}`;
    ctx.fillStyle = '#fff';
    rotulo(ctx, `${barrera}${quien}`, p.x, p.y + radio + 2);
  }

  // Las etiquetas de las regiones, encima de todo.
  const grande = Math.round(Math.max(12, Math.min(18, cam.tile * 0.3)));
  ctx.textBaseline = 'middle';
  for (const reg of red.regiones) {
    const p = mundoAPixel(cam, reg.etiqueta.x, reg.etiqueta.y);
    ctx.font = `bold ${grande}px system-ui, sans-serif`;
    ctx.fillStyle = css(colorDeRegion(reg.indice));
    rotulo(ctx, reg.nombre, p.x, p.y - grande * 0.6);
    ctx.font = `${letra}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    rotulo(ctx, `${reg.id} · nivel ${reg.nivel} · ${reg.casillas} cas.`, p.x, p.y + grande * 0.6);
  }
  ctx.restore();
}

export interface DependenciasDeRegiones {
  readonly sesion: () => Session;
  readonly aventura: EscenaAventura;
  readonly herramientas: HTMLElement;
  readonly pedirFotograma: () => void;
}

export function montar(d: DependenciasDeRegiones): Desarrollo {
  let activo = false;
  let capa: Capa | null = null;

  const caja = document.createElement('span');
  pintar(
    caja,
    html`<button type="button" aria-pressed="false" title="Ver las regiones, los nodos y los caminos del mapa, sin niebla (R)">Regiones</button>`,
  );
  d.herramientas.append(caja);
  const boton = caja.querySelector('button');
  if (boton === null) throw new Error('la vista de regiones no ha podido montar su botón');

  /** «Ver mapa entero» como estaba antes de encender la vista, para devolverlo al apagarla. */
  let todoALaVistaAntes = false;

  const poner = (si: boolean): void => {
    activo = si;
    // Sin niebla también debajo: con ella, una región sin explorar era un negro teñido.
    const s = d.sesion();
    if (si) {
      todoALaVistaAntes = s.revealAll;
      s.revealAll = true;
    } else s.revealAll = todoALaVistaAntes;
    boton.ariaPressed = String(si);
    boton.style.outline = si ? '2px solid #e0a83a' : '';
    s.status = si
      ? 'Vista de regiones (sin niebla): R o el botón «Regiones» para salir.'
      : 'Vista de regiones apagada.';
    d.pedirFotograma();
  };

  boton.addEventListener('click', () => {
    if (d.sesion().scene === 'adventure') poner(!activo);
  });

  return {
    // El clic sigue siendo del juego: la vista solo pinta.
    activo: false,
    dibujar(ctx) {
      if (!activo) return;
      const map = d.sesion().state.map;
      // Otra partida (Reiniciar), otro mapa: se rehace la capa.
      if (capa === null || capa.map !== map) capa = hacerCapa(map);
      dibujarCapa(ctx, capa, d.aventura.camaraActual);
    },
    tecla(ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
      if ((ev.key === 'r' || ev.key === 'R') && d.sesion().scene === 'adventure') {
        if (!ev.repeat) poner(!activo);
        return true;
      }
      return false;
    },
    clic() {},
  };
}
