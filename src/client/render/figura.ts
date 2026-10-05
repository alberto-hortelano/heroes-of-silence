/**
 * Una figura a 25° —héroe, monstruo o unidad—, la pinten el mapa, la batalla, el
 * castillo o la arena.
 *
 * Lo que decide qué arte lleva cada cuerpo es `personajes.ts`; aquí se elige la
 * hoja de la dirección en la que mira, se corta el fotograma, se tiñe el Y Bot
 * del color que diga quien llama, se proyecta su sombra y, si la imagen no ha
 * llegado, se pinta el marcador de color. Así el juego se juega sin arte, que es
 * un contrato de este repositorio.
 *
 * **No se espeja nunca**: cada dirección tiene su hoja, y con la luz fija a la
 * izquierda el espejo la traería de la derecha.
 */
import { colorDeSombra, FIGURA, PROYECCION_DE_SOMBRA } from '../../shared/arte.js';
import { relojDeFigura } from '../compas.js';
import type { Direccion } from '../direccion.js';
import { cargarHojaDeFigura, hayFiguraCargada, imagenDeFigura } from './assets.js';
import {
  type CharacterAtlas,
  type CharacterClip,
  type CharacterFrame,
  celdaDe,
  clipFrame,
  fotogramaDeCaida,
} from './character.js';
import { CacheDeLienzos } from './copias.js';
import { densidadDe } from './lienzo.js';
import { type ArteDeFigura, arteDe, hojaDe, hojasPorCercania } from './personajes.js';
import { pintarSombra } from './sombra.js';

/** Hasta cuándo hay alguna figura en marcha, en el reloj de `performance.now()`. */
let enMarchaHasta = 0;

/**
 * Una figura se está moviendo y lo seguirá haciendo hasta `hasta`: el lienzo
 * tiene que seguir pidiendo fotogramas hasta entonces, **también sin arte**,
 * que es cuando nada respira y no se repinta si nada cambia. Lo llama quien
 * desliza una figura —la patrulla de los asaltantes—, en el mismo contador que
 * mira el bucle de dibujo, en vez de abrir un segundo mecanismo al lado.
 */
export function animarHasta(hasta: number): void {
  enMarchaHasta = Math.max(enMarchaHasta, hasta);
}

/**
 * ¿Hay alguna figura que respire o que ande? Con el arte cargado, el reposo se
 * anima y el lienzo tiene que repintarse a cada fotograma; sin él, los
 * marcadores están quietos y se pinta solo cuando algo cambia o algo anda
 * (`animarHasta`).
 */
export function hayFigurasAnimadas(): boolean {
  return performance.now() < enMarchaHasta || hayFiguraCargada();
}

/**
 * Las hojas ya pedidas, hayan llegado o no: una que falla no se vuelve a pedir
 * en cada fotograma. Se pide **la hoja que se pinta** —la dirección en la que
 * mira, y en el Y Bot la mitad `a` o `b` según el clip—, no la figura entera:
 * el castillo y el mapa pintan a cada cuerpo de una sola vista y cargaban sus
 * dieciséis. Es la única puerta de carga de figuras, así que la partida, el
 * espectador, la arena, el mapa y el castillo cargan lo que pintan sin cablear
 * nada.
 */
const pedidas = new Set<string>();

function pedir(url: string): void {
  if (pedidas.has(url)) return;
  pedidas.add(url);
  cargarHojaDeFigura(url);
}

/**
 * Pide de antemano la hoja del disparo de `body`, la de la dirección en la que
 * mira, si su arte lo pinta. El disparo es la única acción que va en su propia
 * hoja (la C) y llega de golpe: sin pedirla antes, el primer disparo salía
 * quieto (el reposo de `hojaQueSePinta`) mientras la hoja llegaba. La batalla
 * la pide al pintar a cada tirador; `pedir` no la vuelve a cargar.
 */
export function precargarDisparo(body: string, mira: Direccion): void {
  const arte = arteDe(body);
  if (arte.dispara) pedir(hojaDe(arte, mira).clips.shoot.imagen);
}

export interface Figura {
  /**
   * Quién es: el id del stack, del objeto del mapa, del héroe… De él sale su
   * compás (`compas.ts`), el desfase y la velocidad que la separan de las demás.
   * Es obligatorio para que nadie pinte una figura que baile al paso de todas.
   */
  readonly id: string;
  readonly body: string;
  /**
   * El clip. `death` se queda en el fotograma `cadaver` cuando su reloj lo
   * alcanza: el cadáver es la muerte con un `tiempo` largo.
   */
  readonly clip: CharacterClip;
  /** Milisegundos desde que empezó el clip. */
  readonly tiempo: number;
  /** Dónde pisa, en pantalla. */
  readonly x: number;
  readonly suelo: number;
  /** Lo que mide un adulto en pantalla, de la coronilla a los pies. */
  readonly alto: number;
  /** Hacia dónde mira (`direccion.ts`): elige la hoja, no espeja. */
  readonly mira: Direccion;
  /** El color del bando: tiñe el Y Bot y pinta el marcador. */
  readonly color: string;
  /**
   * Cuánto se ve el MARCADOR si la imagen no ha llegado, de 0 a 1. La figura con
   * arte no se funde nunca —el que cae se queda en el suelo como cadáver—; el
   * marcador sí, porque sin arte no hay cadáver que dejar: se funde con el aro
   * del que cae, y el cadáver sin arte no se pinta (0). Quien llama lo decide
   * con la opacidad de su aro; aquí no se recalcula nada.
   */
  readonly alfaSinArte?: number;
  /** El destello de un golpe recibido, de 0 (nada) a 1 (de lleno). */
  readonly destello?: number;
  /** Rótulo del marcador sin arte: la inicial o la abreviatura. */
  readonly rotulo: string;
}

/**
 * Las celdas ya teñidas, por imagen, celda, tamaño y color. Teñir es componer
 * tres veces sobre un lienzo de paso, y se hacía en cada fotograma por figura:
 * con 14 figuras y sin GPU eran 18 ms por fotograma, 1,1 ms con la caché (el
 * banco de la vuelta de simplify). Un tablero lleno de dos bandos en reposo son
 * 2 colores × 7 fotogramas × los cuerpos que haya; el tope (20 MB, ~130 celdas
 * de 200 px) cabe eso con holgura y no deja crecer la caché al hacer zoom, que
 * cambia el tamaño de todas.
 */
const teñidas = new CacheDeLienzos<string, HTMLCanvasElement>(20_000_000);

/**
 * Las siluetas de la sombra, por imagen, celda y tamaño: no dependen del color.
 * Son a un cuarto de resolución (ver `pintarSombraDeFigura`), así que pesan un
 * dieciseisavo que una celda teñida.
 */
const siluetas = new CacheDeLienzos<string, HTMLCanvasElement>(4_000_000);

function lienzoNuevo(lado: number): CanvasRenderingContext2D {
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para pintar figuras');
  return c;
}

/** La celda copiada a un lienzo de paso de `w` píxeles de lado. */
function copiarCelda(c: CanvasRenderingContext2D, celda: CharacterFrame, w: number): void {
  c.drawImage(celda.image, celda.x, celda.y, celda.size, celda.size, 0, 0, w, w);
}

/** Lo que se pinta de una figura y dónde, o `null` si no ha llegado ninguna de sus hojas. */
interface Colocada {
  readonly arte: ArteDeFigura;
  readonly celda: CharacterFrame;
  /** La URL de la imagen de la celda: la clave de las cachés. */
  readonly imagen: string;
  /** El lado de la celda en pantalla, y dónde cae su esquina respecto a los pies. */
  readonly lado: number;
  readonly dx: number;
  readonly dy: number;
}

/** Una figura resuelta una vez, para pintar su sombra y ella sin resolverla dos veces. */
export interface FiguraColocada {
  readonly f: Figura;
  readonly p: Colocada | null;
}

/**
 * La hoja que se pinta: la de la dirección en la que mira si ya ha llegado; si
 * no, la de la dirección más cercana que ya esté, para que la figura no parpadee
 * al marcador cada vez que gira hacia una hoja nueva. Si ninguna dirección
 * tiene aún la hoja de este clip, el reposo de la más cercana que lo tenga: el
 * primer golpe de una figura pide la hoja `b`, y mientras llega es mejor verla
 * quieta que verla desaparecer. Sin ninguna, `null`: el marcador.
 */
function hojaQueSePinta(
  arte: ArteDeFigura,
  f: Figura,
): { atlas: CharacterAtlas; clip: CharacterClip; url: string; imagen: HTMLImageElement } | null {
  const hojas = hojasPorCercania(arte, f.mira);
  pedir((hojas[0] as CharacterAtlas).clips[f.clip].imagen);
  for (const clip of [f.clip, 'idle'] as const) {
    for (const atlas of hojas) {
      const url = atlas.clips[clip].imagen;
      const imagen = imagenDeFigura(url);
      if (imagen !== null) return { atlas, clip, url, imagen };
    }
  }
  return null;
}

/** Resuelve la figura: qué fotograma de qué hoja y cómo cae en pantalla. */
export function colocarFigura(f: Figura): FiguraColocada {
  const arte = arteDe(f.body);
  const hoja = hojaQueSePinta(arte, f);
  if (hoja === null) return { f, p: null };
  const { atlas, clip, url, imagen } = hoja;
  const frame =
    clip === 'death'
      ? fotogramaDeCaida(atlas, f.tiempo)
      : clipFrame(atlas, clip, relojDeFigura(atlas.clips[clip], f.tiempo, f.id));
  const celda = celdaDe(imagen, atlas, clip, frame);
  // La celda se escala para que un ADULTO mida `alto`, y no la figura de esta
  // hoja: el Y Bot y las `dN` comparten píxeles por metro (`FIGURA_8D`), así que
  // cada figura conserva su tamaño. Escalar por la altura de cada hoja igualaría
  // al goblin con el ent y al jinete con un soldado a pie.
  const lado = (f.alto * atlas.cell) / FIGURA.alturaAdulto;
  const escala = lado / atlas.cell;
  return {
    f,
    p: {
      arte,
      celda,
      imagen: url,
      lado,
      dx: -celda.anchor[0] * escala,
      dy: -celda.anchor[1] * escala,
    },
  };
}

/**
 * Lo que distingue un dibujo de otro de la misma figura en el mismo sitio: la
 * celda que se pinta —imagen y fotograma—, o el marcador, con el color y el
 * tamaño. Quien repinta un lienzo solo para una figura (las miniaturas de la
 * arena) se lo salta si no ha cambiado.
 */
export function claveDelDibujo({ f, p }: FiguraColocada): string {
  const donde = `${f.x}|${f.suelo}|${f.alto}|${f.color}|${f.destello ?? 0}`;
  return p === null
    ? `marcador|${donde}|${f.alfaSinArte ?? 1}`
    : `${p.imagen}|${p.celda.x}|${p.celda.y}|${donde}`;
}

/** La clave de una celda en las cachés: la imagen, dónde está la celda y a qué tamaño. */
function claveDeCelda(p: Colocada, w: number): string {
  return `${p.imagen}|${p.celda.x}|${p.celda.y}|${w}`;
}

/**
 * La sombra de la figura, que se pinta ANTES que ella y que su aro: la SILUETA
 * del fotograma aplastada por la luz del contrato (`PROYECCION_DE_SOMBRA`), o el
 * óvalo de `sombra.ts` si la imagen no ha llegado. Es la misma luz para todas:
 * la proyección no depende de hacia dónde mire nadie.
 */
export function pintarSombraDeFigura(ctx: CanvasRenderingContext2D, c: FiguraColocada): void {
  const { f, p } = c;
  if (p === null) {
    const alfa = f.alfaSinArte ?? 1;
    if (alfa <= 0) return;
    ctx.save();
    ctx.globalAlpha = alfa;
    pintarSombra(ctx, f.x, f.suelo, f.alto);
    ctx.restore();
    return;
  }
  // La silueta se compone a un CUARTO de la resolución y se estira al pintarla:
  // el suavizado bilineal le difumina el borde como lo haría un desenfoque. Un
  // `ctx.filter = 'blur(…)'` por figura y por fotograma era lo que costaba: sin
  // GPU (Chromium sin cabeza, el de `pnpm capturas`) un fotograma de batalla
  // pasaba de 300 ms y la barra no llegaba a decir «Espera a que termine».
  const w = Math.max(1, Math.ceil((p.lado * Math.max(1, densidadDe(ctx))) / 4));
  const clave = claveDeCelda(p, w);
  let silueta = siluetas.get(clave);
  if (silueta === undefined) {
    const s = lienzoNuevo(w);
    copiarCelda(s, p.celda, w);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = colorDeSombra();
    s.fillRect(0, 0, w, w);
    silueta = s.canvas;
    siluetas.set(clave, silueta);
  }
  const t = PROYECCION_DE_SOMBRA;
  ctx.save();
  ctx.translate(f.x, f.suelo);
  ctx.transform(t.a, t.b, t.c, t.d, 0, 0);
  ctx.globalAlpha = t.opacidad;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(silueta, 0, 0, w, w, p.dx, p.dy, p.lado, p.lado);
  ctx.restore();
}

/**
 * La celda del Y Bot teñida del color del bando, de la caché o compuesta ahora.
 *
 * El modo `color` se queda con la luminancia del Y Bot y el tono del bando: el
 * cian toma el color sin perder el sombreado. `multiply` lo dejaba pardo, porque
 * cian por rojo es casi negro. Y `destination-in` devuelve la silueta, que el
 * relleno había tapado entera. Sobre UNA celda, no sobre la hoja: teñir la hoja
 * entera por color eran ~200 MB más por color.
 */
function celdaTeñida(p: Colocada, color: string, w: number): HTMLCanvasElement {
  const clave = `${claveDeCelda(p, w)}|${color}`;
  const guardada = teñidas.get(clave);
  if (guardada !== undefined) return guardada;
  const c = lienzoNuevo(w);
  copiarCelda(c, p.celda, w);
  c.globalCompositeOperation = 'color';
  c.fillStyle = color;
  c.fillRect(0, 0, w, w);
  c.globalCompositeOperation = 'destination-in';
  copiarCelda(c, p.celda, w);
  teñidas.set(clave, c.canvas);
  return c.canvas;
}

/**
 * Pinta la figura, con su arte o con el marcador si la imagen no ha llegado.
 *
 * El destello del golpe es la misma figura pintada otra vez encima en modo
 * `lighter`: suma luz solo donde hay figura, así que sirve igual para el Y Bot
 * teñido, para una unidad con arte propio y para el marcador.
 */
export function pintarFigura(ctx: CanvasRenderingContext2D, c: FiguraColocada): void {
  const { f, p } = c;
  const destello = f.destello ?? 0;
  const alfa = p === null ? (f.alfaSinArte ?? 1) : 1;
  if (alfa <= 0) return;
  let pintar: () => void;
  if (p === null) {
    pintar = () => pintarMarcador(ctx, f);
  } else {
    let fuente: CanvasImageSource = p.celda.image;
    let origen = { x: p.celda.x, y: p.celda.y, lado: p.celda.size };
    if (!p.arte.propio) {
      const w = Math.max(1, Math.ceil(p.lado * Math.max(1, densidadDe(ctx))));
      fuente = celdaTeñida(p, f.color, w);
      origen = { x: 0, y: 0, lado: w };
    }
    const { lado, dx, dy } = p;
    pintar = () =>
      ctx.drawImage(
        fuente,
        origen.x,
        origen.y,
        origen.lado,
        origen.lado,
        f.x + dx,
        f.suelo + dy,
        lado,
        lado,
      );
  }
  ctx.save();
  ctx.globalAlpha = alfa;
  pintar();
  if (destello > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alfa * destello;
    pintar();
  }
  ctx.restore();
}

/**
 * La sombra y la figura, resuelta una sola vez: lo que pintan el mapa, el
 * castillo, la arena y el cadáver, que no meten nada entre las dos. La batalla,
 * que pone el aro en medio, llama a las dos por separado con la misma
 * `colocarFigura`.
 */
export function pintarFiguraConSombra(ctx: CanvasRenderingContext2D, f: Figura): void {
  const c = colocarFigura(f);
  pintarSombraDeFigura(ctx, c);
  pintarFigura(ctx, c);
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
