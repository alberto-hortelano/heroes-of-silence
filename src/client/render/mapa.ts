/**
 * El mapa de aventura del cliente nuevo: superficie continua, atlas pintado y
 * niebla de dos tonos.
 *
 * Las ideas son las de `aventura/map-view.ts` de la rama `archivo/gpt-rpg`; lo
 * que se pinta es el `GameMap` del núcleo y no el mundo de GPT, con varios héroes
 * por bando y los rivales. Y, a diferencia de aquel, **no decide nada**: no busca
 * caminos ni calcula lo que se ve —la rama llamaba a `findPath` y a
 * `visibleFrom` desde el lienzo—. La ruta y las casillas visibles llegan hechas
 * de `session.ts`, que es la puerta al núcleo.
 *
 * Solo pinta: ni guarda estado de la partida ni escucha al ratón.
 */
import { type MapObject, pointFromKey, pointKey } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import { CHARACTER_BODY } from '@core/rpg/character.js';
import type { Point } from '@core/types.js';
import { asset } from './assets.js';
import { type CamaraMapa, casillaAPixel, mundoAPixel } from './camara-mapa.js';
import { pintarFigura } from './figura.js';
import { playerColor, RESOURCE_COLORS } from './palette.js';
import { pintarSombra } from './sombra.js';
import { terrainSurface } from './terreno.js';

/**
 * Lo que este lienzo necesita de una partida, y **nada más**.
 *
 * Es el tipo estructural que antes vivía en `render/adventure.ts`, y por el
 * mismo motivo: `GameState` lo satisface tal cual y la vista adaptada del
 * espectador también, sin que ninguno tenga que fabricar una partida falsa.
 * Los `Set` son parte del contrato: `roads` y `fog` se preguntan con `.has()`
 * por clave `"x,y"`, y es `adaptar.ts` quien los rehace al otro lado del cable.
 */
export interface AdventureScene {
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly terrain: readonly TerrainKind[];
    readonly roads: ReadonlySet<string>;
    readonly objects: readonly MapObject[];
  };
  readonly players: readonly { readonly id: number; readonly fog: ReadonlySet<string> }[];
  readonly heroes: readonly {
    readonly id: string;
    readonly owner: number;
    readonly name: string;
    readonly at: Point;
  }[];
}

/** Un paso de la ruta que se enseña: dorado si llega hoy, gris si otro día. */
export interface PasoDeRuta {
  readonly at: Point;
  readonly hoy: boolean;
}

export interface VistaMapa {
  readonly escena: AdventureScene;
  readonly camara: CamaraMapa;
  readonly ancho: number;
  readonly alto: number;
  /** Lo explorado alguna vez. `null` es «todo»: el espectador, o el modo de depuración. */
  readonly explorado: ReadonlySet<string> | null;
  /** Lo que se mira AHORA. `null` es no pintar la segunda sombra. */
  readonly visibles: ReadonlySet<string> | null;
  readonly ruta: readonly PasoDeRuta[];
  readonly seleccionado: string | null;
  readonly hover: Point | null;
  /** Para que la vegetación no sea la misma en todas las partidas. */
  readonly semilla: number;
  /** Reloj de la animación de reposo, en milisegundos. */
  readonly tiempo: number;
  /**
   * Sube cada vez que cambia algo del mapa: un objeto recogido, un héroe que se
   * mueve, un castillo que cambia de manos. Con la misma `escena` y la misma
   * versión, lo que se pinta quieto se reutiliza del fotograma anterior.
   */
  readonly version: number;
}

/** Celdas del atlas de 4×4 de `map-atlas.png`, en orden de lectura. */
const CELDA = {
  castillo: 0,
  mina: 7,
  cofre: 8,
  arboleda: 11,
  pinar: 12,
  montana: 13,
} as const;

/** El color de lo hostil sin dueño: los monstruos que guardan el mapa. */
const COLOR_MONSTRUO = '#b0553f';

// ------------------------------------------------------------------ superficie

/**
 * La superficie se rehace solo cuando cambia el terreno, y eso se mira por la
 * identidad del array de terreno. Antes la clave era el terreno entero unido
 * con comas —576 casillas, una cadena nueva por fotograma— porque el espectador
 * recibe un mapa nuevo con cada fotograma del cable; ahora es `adaptar.ts` quien
 * conserva el array mientras no cambie, y aquí basta con compararlo.
 */
let superficie: {
  terrain: readonly TerrainKind[];
  semilla: number;
  lienzo: HTMLCanvasElement;
} | null = null;

function superficieDe(escena: AdventureScene, semilla: number): HTMLCanvasElement {
  const { width, height, terrain } = escena.map;
  if (superficie === null || superficie.terrain !== terrain || superficie.semilla !== semilla) {
    superficie = {
      terrain,
      semilla,
      lienzo: terrainSurface(width, height, terrain, semilla % 997),
    };
  }
  return superficie.lienzo;
}

/**
 * El suelo tal y como se ve ahora: la superficie y, encima, la textura en luz
 * suave, recortados al lienzo. Se compone fuera de pantalla y se guarda mientras
 * la cámara no se mueva.
 *
 * La mezcla `soft-light` sobre todo el lienzo era lo más caro de cada fotograma
 * —se medía el hilo principal al 100 % con el mapa quieto— y para un mapa quieto
 * da siempre lo mismo. Se rehace al arrastrar o al cambiar de zoom, que es
 * cuando de verdad cambia.
 */
let fondo: { clave: string; superficie: HTMLCanvasElement; lienzo: HTMLCanvasElement } | null =
  null;
let patron: { imagen: HTMLImageElement; patron: CanvasPattern } | null = null;

function fondoDe(ctx: CanvasRenderingContext2D, v: VistaMapa): HTMLCanvasElement {
  const { width: W, height: H } = v.escena.map;
  const { camara } = v;
  const suelo = asset('rpg', 'suelo');
  const dpr = ctx.getTransform().a;
  const lienzoSuperficie = superficieDe(v.escena, v.semilla);
  const clave = `${camara.tile}|${camara.x}|${camara.y}|${v.ancho}|${v.alto}|${dpr}|${suelo !== null}`;
  if (fondo !== null && fondo.clave === clave && fondo.superficie === lienzoSuperficie) {
    return fondo.lienzo;
  }
  const lienzo = fondo?.lienzo ?? document.createElement('canvas');
  lienzo.width = Math.max(1, Math.ceil(v.ancho * dpr));
  lienzo.height = Math.max(1, Math.ceil(v.alto * dpr));
  const c = lienzo.getContext('2d');
  if (c === null) throw new Error('este navegador no tiene canvas 2D para el suelo del mapa');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.fillStyle = '#080a10';
  c.fillRect(0, 0, v.ancho, v.alto);
  const tile = camara.tile;
  const origen = mundoAPixel(camara, 0, 0);
  c.drawImage(lienzoSuperficie, origen.x, origen.y, W * tile, H * tile);
  if (suelo !== null) {
    if (patron === null || patron.imagen !== suelo) {
      const p = c.createPattern(suelo, 'repeat');
      if (p === null) throw new Error('no se ha podido hacer un patrón con la textura del suelo');
      patron = { imagen: suelo, patron: p };
    }
    // Solo lo que se ve del mapa: fuera del lienzo no hay nada que mezclar.
    const x0 = Math.max(origen.x, 0);
    const y0 = Math.max(origen.y, 0);
    const x1 = Math.min(origen.x + W * tile, v.ancho);
    const y1 = Math.min(origen.y + H * tile, v.alto);
    if (x1 > x0 && y1 > y0) {
      c.save();
      c.beginPath();
      c.rect(x0, y0, x1 - x0, y1 - y0);
      c.clip();
      c.translate(origen.x, origen.y);
      c.scale(tile / 180, tile / 180);
      c.globalCompositeOperation = 'soft-light';
      c.globalAlpha = 0.68;
      c.fillStyle = patron.patron;
      c.fillRect(
        ((x0 - origen.x) * 180) / tile,
        ((y0 - origen.y) * 180) / tile,
        ((x1 - x0) * 180) / tile,
        ((y1 - y0) * 180) / tile,
      );
      c.restore();
    }
  }
  fondo = { clave, superficie: lienzoSuperficie, lienzo };
  return lienzo;
}

/** Un entero de 0 a 96 que depende solo de la casilla y la partida. */
function azarDeCasilla(x: number, y: number, semilla: number): number {
  return (((x * 73856093) ^ (y * 19349663) ^ (semilla * 83492791)) >>> 0) % 97;
}

// ---------------------------------------------------------------------- dibujo

export function drawMapa(ctx: CanvasRenderingContext2D, v: VistaMapa): void {
  const { escena, camara } = v;
  const { width: W, height: H } = escena.map;
  const tile = camara.tile;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1 · El suelo: superficie continua y, si hay arte, la textura en luz suave.
  ctx.drawImage(fondoDe(ctx, v), 0, 0, v.ancho, v.alto);

  // 2 · Caminos: trazos curvos de tierra, solo por lo explorado.
  pintarCaminos(ctx, v);

  // 3 · Todo lo que tiene altura, ordenado por profundidad.
  for (const c of cosasDe(v)) {
    switch (c.tipo) {
      case 'celda':
        pintarCelda(ctx, camara, c.celda, c.en, c.escala);
        break;
      case 'objeto':
        pintarObjeto(ctx, v, c.objeto);
        break;
      case 'heroe':
        pintarHeroe(ctx, v, c.heroe);
        break;
    }
  }

  // 4 · La niebla: negra sobre lo desconocido, tenue sobre lo que no se mira.
  pintarNiebla(ctx, v);

  // 5 · Encima de todo, lo que es de quien juega: la ruta y la casilla señalada.
  pintarRuta(ctx, camara, v.ruta);
  if (v.hover !== null && v.hover.x >= 0 && v.hover.y >= 0 && v.hover.x < W && v.hover.y < H) {
    const c = casillaAPixel(camara, v.hover);
    ctx.strokeStyle = '#f2d585';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - tile / 2 + 3, c.y - tile / 2 + 3, tile - 6, tile - 6);
  }
  ctx.restore();
}

/** Algo con altura que se pinta sobre el suelo, en coordenadas de casilla. */
type Cosa =
  | {
      readonly tipo: 'celda';
      readonly y: number;
      readonly celda: number;
      readonly en: Point;
      readonly escala: number;
    }
  | { readonly tipo: 'objeto'; readonly y: number; readonly objeto: MapObject }
  | {
      readonly tipo: 'heroe';
      readonly y: number;
      readonly heroe: AdventureScene['heroes'][number];
    };

/**
 * La vegetación, los objetos y los héroes, ya ordenados de atrás adelante.
 *
 * La lista solo cambia cuando cambia el mapa —la `version`—, lo explorado o la
 * partida, y se recorría entera en cada fotograma: 576 casillas, un `Set` de
 * claves y una ordenación. Ahora se hace al cambiar y se pinta a cada fotograma,
 * que es lo único que de verdad hace falta repetir: las figuras respiran.
 */
let cosas: {
  escena: AdventureScene;
  version: number;
  explorado: ReadonlySet<string> | null;
  vistos: number;
  semilla: number;
  lista: readonly Cosa[];
} | null = null;

function cosasDe(v: VistaMapa): readonly Cosa[] {
  const { escena, explorado, semilla, version } = v;
  const vistos = explorado?.size ?? -1;
  if (
    cosas !== null &&
    cosas.escena === escena &&
    cosas.version === version &&
    cosas.explorado === explorado &&
    cosas.vistos === vistos &&
    cosas.semilla === semilla
  ) {
    return cosas.lista;
  }
  const { width: W, height: H } = escena.map;
  const explorada = (k: string): boolean => explorado === null || explorado.has(k);
  const lista: Cosa[] = [];
  const ocupadas = new Set<string>();
  const cercaDeCastillo = new Set<string>();
  for (const o of escena.map.objects) {
    ocupadas.add(pointKey(o.at));
    if (o.kind === 'town') {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          cercaDeCastillo.add(pointKey({ x: o.at.x + dx, y: o.at.y + dy }));
    }
  }
  for (const h of escena.heroes) ocupadas.add(pointKey(h.at));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = pointKey({ x, y });
      if (!explorada(k) || ocupadas.has(k) || cercaDeCastillo.has(k) || escena.map.roads.has(k))
        continue;
      const deco = vegetacion(
        escena.map.terrain[y * W + x] as TerrainKind,
        azarDeCasilla(x, y, semilla),
      );
      if (deco === null) continue;
      const en = { x: x + deco.dx, y: y + deco.dy };
      lista.push({ tipo: 'celda', y: en.y, celda: deco.celda, en, escala: deco.escala });
    }
  }
  for (const o of escena.map.objects) {
    if (!explorada(pointKey(o.at)) || !presente(o)) continue;
    lista.push({ tipo: 'objeto', y: o.at.y, objeto: o });
  }
  for (const h of escena.heroes) {
    if (!explorada(pointKey(h.at))) continue;
    lista.push({ tipo: 'heroe', y: h.at.y + 0.01, heroe: h });
  }
  lista.sort((a, b) => a.y - b.y);
  cosas = { escena, version, explorado, vistos, semilla, lista };
  return lista;
}

function presente(o: MapObject): boolean {
  if (o.kind === 'monster') return !o.defeated;
  if (o.kind === 'resource' || o.kind === 'chest') return !o.taken;
  return true;
}

function vegetacion(
  t: TerrainKind,
  azar: number,
): { celda: number; escala: number; dx: number; dy: number } | null {
  const dx = ((azar % 5) - 2) * 0.08;
  const dy = ((azar % 7) - 3) * 0.05;
  switch (t) {
    case 'grass':
      return azar < 10
        ? {
            celda: azar % 3 === 0 ? CELDA.pinar : CELDA.arboleda,
            escala: 1.1 + (azar % 4) * 0.1,
            dx,
            dy,
          }
        : null;
    case 'dirt':
    case 'swamp':
      return azar < 6 ? { celda: CELDA.arboleda, escala: 1.05 + (azar % 3) * 0.1, dx, dy } : null;
    case 'snow':
      return azar < 10 ? { celda: CELDA.pinar, escala: 1.1 + (azar % 4) * 0.1, dx, dy } : null;
    case 'rough':
      return azar < 7 ? { celda: CELDA.montana, escala: 1.05 + (azar % 3) * 0.12, dx, dy } : null;
    case 'sand':
    case 'lava':
    case 'water':
      return null;
  }
}

/** Una celda del atlas, apoyada en la casilla `p` (que puede tener decimales). */
function pintarCelda(
  ctx: CanvasRenderingContext2D,
  camara: CamaraMapa,
  celda: number,
  p: Point,
  escala: number,
): boolean {
  const atlas = asset('rpg', 'mapa');
  if (atlas === null) return false;
  const c = mundoAPixel(camara, p.x + 0.5, p.y + 0.5);
  const lado = camara.tile * escala;
  const w = atlas.naturalWidth / 4;
  const h = atlas.naturalHeight / 4;
  ctx.drawImage(
    atlas,
    (celda % 4) * w,
    Math.floor(celda / 4) * h,
    w,
    h,
    c.x - lado / 2,
    c.y - lado + camara.tile * 0.35,
    lado,
    lado,
  );
  return true;
}

function pintarObjeto(ctx: CanvasRenderingContext2D, v: VistaMapa, o: MapObject): void {
  const { camara } = v;
  const tile = camara.tile;
  const c = casillaAPixel(camara, o.at);
  switch (o.kind) {
    case 'town': {
      base(ctx, c, tile * 0.62, playerColor(o.owner));
      if (!pintarCelda(ctx, camara, CELDA.castillo, o.at, 1.7)) {
        ctx.fillStyle = playerColor(o.owner);
        ctx.fillRect(c.x - tile * 0.38, c.y - tile * 0.35, tile * 0.76, tile * 0.6);
      }
      bandera(ctx, c.x - tile * 0.55, c.y - tile * 1.05, tile, playerColor(o.owner));
      return;
    }
    case 'mine': {
      base(ctx, c, tile * 0.45, playerColor(o.owner));
      if (!pintarCelda(ctx, camara, CELDA.mina, o.at, 1.2)) {
        ctx.fillStyle = '#6b6152';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - tile * 0.4);
        ctx.lineTo(c.x + tile * 0.4, c.y + tile * 0.3);
        ctx.lineTo(c.x - tile * 0.4, c.y + tile * 0.3);
        ctx.fill();
      }
      icono(ctx, o.resource, c.x + tile * 0.32, c.y + tile * 0.12, tile * 0.36);
      if (o.owner !== null)
        bandera(ctx, c.x - tile * 0.42, c.y - tile * 0.72, tile * 0.75, playerColor(o.owner));
      return;
    }
    case 'chest': {
      if (!pintarCelda(ctx, camara, CELDA.cofre, o.at, 0.75)) {
        ctx.fillStyle = '#a8762c';
        ctx.fillRect(c.x - tile * 0.22, c.y - tile * 0.12, tile * 0.44, tile * 0.3);
      }
      return;
    }
    case 'resource': {
      pintarSombra(ctx, c.x, c.y + tile * 0.22, tile * 0.5);
      icono(ctx, o.resource, c.x, c.y, tile * 0.56);
      return;
    }
    case 'monster': {
      const suelo = c.y + tile * 0.32;
      pintarSombra(ctx, c.x, suelo, tile * 0.9);
      pintarFigura(ctx, {
        body: o.creature,
        clip: 'idle',
        tiempo: v.tiempo + (o.at.x * 211 + o.at.y * 97),
        x: c.x,
        suelo,
        alto: tile * 0.85,
        mirandoIzquierda: true,
        color: COLOR_MONSTRUO,
        rotulo: String(o.count),
      });
      chapa(ctx, String(o.count), c.x + tile * 0.3, c.y + tile * 0.32, tile);
      return;
    }
  }
}

function pintarHeroe(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  h: AdventureScene['heroes'][number],
): void {
  const tile = v.camara.tile;
  const c = casillaAPixel(v.camara, h.at);
  const suelo = c.y + tile * 0.3;
  const color = playerColor(h.owner);
  // El aro del dueño, y el del seleccionado por fuera, en dorado y discontinuo.
  ctx.save();
  ctx.lineWidth = Math.max(2, tile * 0.045);
  ctx.strokeStyle = color;
  ctx.fillStyle = `${color}33`;
  ctx.beginPath();
  ctx.ellipse(c.x, suelo, tile * 0.32, tile * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (h.id === v.seleccionado) {
    ctx.strokeStyle = '#f5d973';
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(c.x, suelo, tile * 0.42, tile * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  pintarSombra(ctx, c.x, suelo, tile * 0.95);
  pintarFigura(ctx, {
    // El héroe a pie, con la figura de Liora (decisión del usuario): todos los
    // héroes llevan la misma y los distingue el aro del dueño.
    body: CHARACTER_BODY,
    clip: 'idle',
    tiempo: v.tiempo + h.at.x * 131,
    x: c.x,
    suelo,
    alto: tile * 0.92,
    mirandoIzquierda: false,
    color,
    rotulo: h.name.charAt(0).toUpperCase(),
  });
}

/** Un óvalo del color del dueño bajo lo que se posee: se lee de lejos. */
function base(
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = `${color}40`;
  ctx.strokeStyle = `${color}cc`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + r * 0.45, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** El estandarte del dueño: un mástil con su color. */
function bandera(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
  color: string,
): void {
  const alto = tile * 0.5;
  ctx.save();
  ctx.strokeStyle = '#2b2119';
  ctx.lineWidth = Math.max(1.5, tile * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + alto);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tile * 0.28, y + tile * 0.08);
  ctx.lineTo(x, y + tile * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function icono(
  ctx: CanvasRenderingContext2D,
  recurso: keyof typeof RESOURCE_COLORS,
  x: number,
  y: number,
  lado: number,
): void {
  const img = asset('icons', recurso);
  if (img !== null) {
    ctx.drawImage(img, x - lado / 2, y - lado / 2, lado, lado);
    return;
  }
  ctx.fillStyle = RESOURCE_COLORS[recurso];
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(x, y, lado * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Una cifra en una chapa oscura: los efectivos de un monstruo. */
function chapa(
  ctx: CanvasRenderingContext2D,
  texto: string,
  x: number,
  y: number,
  tile: number,
): void {
  const alto = Math.max(14, tile * 0.24);
  ctx.save();
  ctx.font = `bold ${Math.round(alto * 0.72)}px system-ui, sans-serif`;
  const ancho = ctx.measureText(texto).width + alto * 0.6;
  ctx.fillStyle = 'rgba(25,21,9,0.92)';
  ctx.strokeStyle = '#cbb780';
  ctx.lineWidth = 1;
  ctx.fillRect(x - ancho / 2, y - alto / 2, ancho, alto);
  ctx.strokeRect(x - ancho / 2 + 0.5, y - alto / 2 + 0.5, ancho - 1, alto - 1);
  ctx.fillStyle = '#fbe8b5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 0.5);
  ctx.restore();
}

/**
 * Los caminos explorados, trazados una vez en coordenadas de casilla. Se
 * pintan escalando por el zoom, así que el trazo no se rehace al moverse la
 * cámara: solo cuando cambian los caminos o lo explorado.
 */
let caminos: {
  roads: ReadonlySet<string>;
  explorado: ReadonlySet<string> | null;
  vistos: number;
  semilla: number;
  trazo: Path2D;
} | null = null;

function trazoDeCaminos(v: VistaMapa): Path2D {
  const { roads } = v.escena.map;
  const vistos = v.explorado?.size ?? -1;
  if (
    caminos !== null &&
    caminos.roads === roads &&
    caminos.explorado === v.explorado &&
    caminos.vistos === vistos &&
    caminos.semilla === v.semilla
  ) {
    return caminos.trazo;
  }
  const trazo = new Path2D();
  for (const clave of roads) {
    if (v.explorado !== null && !v.explorado.has(clave)) continue;
    const { x, y } = pointFromKey(clave);
    // En casillas: el centro de la casilla es (x + ½, y + ½).
    const a = { x: x + 0.5, y: y + 0.5 };
    for (const d of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
    ]) {
      const q = { x: x + d.x, y: y + d.y };
      if (!roads.has(pointKey(q))) continue;
      const b = { x: q.x + 0.5, y: q.y + 0.5 };
      const curva = (((x * 17 + y * 8 + v.semilla) % 5) - 2) * 0.05;
      trazo.moveTo(a.x, a.y);
      trazo.quadraticCurveTo(
        (a.x + b.x) / 2 - d.y * curva,
        (a.y + b.y) / 2 + d.x * curva,
        b.x,
        b.y,
      );
    }
  }
  caminos = { roads, explorado: v.explorado, vistos, semilla: v.semilla, trazo };
  return trazo;
}

function pintarCaminos(ctx: CanvasRenderingContext2D, v: VistaMapa): void {
  if (v.escena.map.roads.size === 0) return;
  const trazo = trazoDeCaminos(v);
  const o = mundoAPixel(v.camara, 0, 0);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(v.camara.tile, v.camara.tile);
  ctx.lineCap = 'round';
  // Los anchos, en casillas: con el lienzo escalado por el zoom, 0,3 es el 30 %
  // de una casilla a cualquier zoom, que es lo que era `tile * 0.3`.
  for (const [ancho, color] of [
    [0.3, '#372e2444'],
    [0.23, '#85705088'],
    [0.13, '#a18b6566'],
  ] as const) {
    ctx.lineWidth = ancho;
    ctx.strokeStyle = color;
    ctx.stroke(trazo);
  }
  ctx.restore();
}

/**
 * La niebla como máscara de un píxel por casilla, escalada con suavizado: los
 * bordes salen difuminados sin calcular ninguna curva, y lo desconocido queda
 * negro de verdad aunque haya algo debajo.
 *
 * La máscara se rehace solo cuando crece lo explorado o cambia lo que se ve
 * ahora (`visibles` es otro objeto cuando la sesión lo recalcula); el resto de
 * fotogramas es un solo `drawImage`. Antes eran 576 `fillRect` a cada uno.
 */
let niebla: {
  lienzo: HTMLCanvasElement;
  explorado: ReadonlySet<string> | null;
  vistos: number;
  visibles: ReadonlySet<string> | null;
  ancho: number;
  alto: number;
} | null = null;

function mascaraDeNiebla(v: VistaMapa): HTMLCanvasElement {
  const { width: W, height: H } = v.escena.map;
  const vistos = v.explorado?.size ?? -1;
  if (
    niebla !== null &&
    niebla.explorado === v.explorado &&
    niebla.vistos === vistos &&
    niebla.visibles === v.visibles &&
    niebla.ancho === W &&
    niebla.alto === H
  ) {
    return niebla.lienzo;
  }
  const mascara = niebla?.lienzo ?? document.createElement('canvas');
  // Un marco de una casilla de niebla alrededor del mapa: sin él, el suavizado
  // del borde de la imagen dejaba asomar una línea de terreno por fuera.
  mascara.width = W + 2;
  mascara.height = H + 2;
  const m = mascara.getContext('2d');
  if (m === null) throw new Error('este navegador no tiene canvas 2D para la niebla');
  m.clearRect(0, 0, W + 2, H + 2);
  m.fillStyle = '#080a10';
  if (v.explorado !== null) {
    m.fillRect(0, 0, W + 2, 1);
    m.fillRect(0, H + 1, W + 2, 1);
    m.fillRect(0, 0, 1, H + 2);
    m.fillRect(W + 1, 0, 1, H + 2);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = pointKey({ x, y });
      if (v.explorado !== null && !v.explorado.has(k)) m.fillStyle = '#080a10';
      else if (v.visibles !== null && !v.visibles.has(k)) m.fillStyle = 'rgba(8,13,22,0.42)';
      else continue;
      m.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  niebla = {
    lienzo: mascara,
    explorado: v.explorado,
    vistos,
    visibles: v.visibles,
    ancho: W,
    alto: H,
  };
  return mascara;
}

function pintarNiebla(ctx: CanvasRenderingContext2D, v: VistaMapa): void {
  if (v.explorado === null && v.visibles === null) return;
  const { width: W, height: H } = v.escena.map;
  const o = mundoAPixel(v.camara, -1, -1);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mascaraDeNiebla(v), o.x, o.y, (W + 2) * v.camara.tile, (H + 2) * v.camara.tile);
  ctx.restore();
}

function pintarRuta(
  ctx: CanvasRenderingContext2D,
  camara: CamaraMapa,
  ruta: readonly PasoDeRuta[],
): void {
  if (ruta.length === 0) return;
  ctx.save();
  for (const [i, paso] of ruta.entries()) {
    const c = casillaAPixel(camara, paso.at);
    const ultimo = i === ruta.length - 1;
    // El último de hoy es donde se parará el héroe: se marca aparte.
    const paradaDeHoy = paso.hoy && (ruta[i + 1]?.hoy ?? false) === false;
    ctx.fillStyle = paso.hoy ? '#f6db78' : '#9aa1a8';
    ctx.strokeStyle = '#1b1608';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, ultimo || paradaDeHoy ? 6.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (paradaDeHoy && !ultimo) {
      ctx.strokeStyle = '#f6db78';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
