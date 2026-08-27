/** Dibuja el mapa de aventura. Solo pinta: no toca el estado. */

import { type MapObject, pointKey } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { Point } from '@core/types.js';
import { asset } from './assets.js';
import { playerColor, RESOURCE_COLORS, TERRAIN_COLORS } from './palette.js';

export const TILE = 42;

/**
 * Lo que este lienzo necesita de una partida, y **nada más**.
 *
 * Pedía un `GameState` entero y leía once campos. Eso obligaba a quien no
 * tuviera uno —el espectador, que recibe una vista serializada por el cable— a
 * fabricar un `GameState` FALSO para poder llamar aquí: un objeto con
 * `pendingBattle`, `log`, `seed` y `finished` inventados solo para satisfacer al
 * compilador, que es la clase de mentira que dentro de seis meses alguien lee
 * como si fuera la partida.
 *
 * Con el tipo estructural, `GameState` lo satisface tal cual —`main.ts` no
 * cambia ni un carácter (11)— y la vista adaptada del espectador también, sin
 * que ninguno de los dos tenga que fingir nada.
 *
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

/** Un héroe tal y como lo pinta este lienzo: cuatro campos. */
type HeroeDibujable = AdventureScene['heroes'][number];

export interface AdventureCamera {
  /** Casilla superior izquierda visible. */
  readonly origin: Point;
  readonly cols: number;
  readonly rows: number;
  /** Desplazamiento en píxeles para centrar un mapa más pequeño que el lienzo. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Cámara centrada en un punto, recortada a los bordes del mapa. */
export function cameraFor(
  state: AdventureScene,
  center: Point,
  canvasWidth: number,
  canvasHeight: number,
): AdventureCamera {
  const cols = Math.ceil(canvasWidth / TILE);
  const rows = Math.ceil(canvasHeight / TILE);
  const x = clamp(center.x - Math.floor(cols / 2), 0, Math.max(0, state.map.width - cols));
  const y = clamp(center.y - Math.floor(rows / 2), 0, Math.max(0, state.map.height - rows));

  // Un mapa que cabe entero se centra: si no, queda pegado a la esquina
  // superior izquierda con medio lienzo vacío al lado.
  const anchoMapa = state.map.width * TILE;
  const altoMapa = state.map.height * TILE;
  const offsetX = anchoMapa < canvasWidth ? Math.floor((canvasWidth - anchoMapa) / 2) : 0;
  const offsetY = altoMapa < canvasHeight ? Math.floor((canvasHeight - altoMapa) / 2) : 0;

  return { origin: { x, y }, cols, rows, offsetX, offsetY };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Casilla del mapa bajo un punto del canvas. */
export function tileAtPixel(camera: AdventureCamera, px: number, py: number): Point {
  return {
    x: camera.origin.x + Math.floor((px - camera.offsetX) / TILE),
    y: camera.origin.y + Math.floor((py - camera.offsetY) / TILE),
  };
}

export interface AdventureView {
  readonly state: AdventureScene;
  readonly camera: AdventureCamera;
  readonly viewer: number;
  readonly selectedHero: string | null;
  readonly hoverPath: readonly Point[];
  /** `true` para ver el mapa entero, sin niebla (modo depuración). */
  readonly revealAll: boolean;
}

export function drawAdventure(ctx: CanvasRenderingContext2D, view: AdventureView): void {
  const { state, camera } = view;
  const player = state.players.find((p) => p.id === view.viewer);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(camera.offsetX, camera.offsetY);

  for (let row = 0; row <= camera.rows; row++) {
    for (let col = 0; col <= camera.cols; col++) {
      const p = { x: camera.origin.x + col, y: camera.origin.y + row };
      if (p.x >= state.map.width || p.y >= state.map.height) continue;

      const sx = col * TILE;
      const sy = row * TILE;
      const terreno = state.map.terrain[p.y * state.map.width + p.x] as TerrainKind;
      const textura = asset('terrains', terreno);
      if (textura === null) {
        ctx.fillStyle = TERRAIN_COLORS[terreno];
        ctx.fillRect(sx, sy, TILE, TILE);
      } else {
        ctx.drawImage(textura, sx, sy, TILE, TILE);
      }

      if (state.map.roads.has(pointKey(p))) {
        ctx.fillStyle = 'rgba(200,180,140,0.35)';
        ctx.fillRect(sx + TILE * 0.3, sy + TILE * 0.3, TILE * 0.4, TILE * 0.4);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);

      const explorada = view.revealAll || (player?.fog.has(pointKey(p)) ?? false);
      if (!explorada) {
        ctx.fillStyle = 'rgba(6,5,4,0.88)';
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }

  // Objetos y héroes, solo donde se ve.
  for (const obj of state.map.objects) {
    if (!isVisible(view, obj.at)) continue;
    const pos = toScreen(camera, obj.at);
    if (pos === null) continue;
    drawObject(ctx, obj, pos.x, pos.y);
  }

  for (const hero of state.heroes) {
    if (!isVisible(view, hero.at)) continue;
    const pos = toScreen(camera, hero.at);
    if (pos === null) continue;
    drawHero(ctx, hero, pos.x, pos.y, hero.id === view.selectedHero);
  }

  drawPath(ctx, camera, view.hoverPath);
  ctx.restore();
}

function isVisible(view: AdventureView, p: Point): boolean {
  if (view.revealAll) return true;
  const player = view.state.players.find((x) => x.id === view.viewer);
  return player?.fog.has(pointKey(p)) ?? false;
}

function toScreen(camera: AdventureCamera, p: Point): { x: number; y: number } | null {
  const x = (p.x - camera.origin.x) * TILE;
  const y = (p.y - camera.origin.y) * TILE;
  if (x < -TILE || y < -TILE) return null;
  return { x, y };
}

function drawObject(ctx: CanvasRenderingContext2D, obj: MapObject, x: number, y: number): void {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;

  switch (obj.kind) {
    case 'town': {
      ctx.fillStyle = playerColor(obj.owner);
      ctx.fillRect(x + 5, y + 12, TILE - 10, TILE - 17);
      ctx.fillRect(x + 9, y + 5, 6, 10);
      ctx.fillRect(x + TILE - 15, y + 5, 6, 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeRect(x + 5.5, y + 12.5, TILE - 11, TILE - 18);
      break;
    }
    case 'mine': {
      // La montaña va siempre: el icono encima dice qué se extrae y el color
      // del borde, de quién es.
      ctx.fillStyle = playerColor(obj.owner);
      ctx.beginPath();
      ctx.moveTo(cx, y + 7);
      ctx.lineTo(x + TILE - 7, y + TILE - 7);
      ctx.lineTo(x + 7, y + TILE - 7);
      ctx.closePath();
      ctx.fill();
      const icono = asset('icons', obj.resource);
      if (icono !== null) {
        ctx.drawImage(icono, cx - 9, cy - 2, 18, 18);
      } else {
        ctx.fillStyle = RESOURCE_COLORS[obj.resource];
        ctx.beginPath();
        ctx.arc(cx, cy + 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'resource': {
      if (obj.taken) return;
      const icono = asset('icons', obj.resource);
      if (icono !== null) {
        ctx.drawImage(icono, x + 6, y + 6, TILE - 12, TILE - 12);
        break;
      }
      ctx.fillStyle = RESOURCE_COLORS[obj.resource];
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.stroke();
      break;
    }
    case 'chest': {
      if (obj.taken) return;
      ctx.fillStyle = '#a8762c';
      ctx.fillRect(x + 11, y + 14, TILE - 22, TILE - 26);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(x + 11, y + 18, TILE - 22, 3);
      break;
    }
    case 'monster': {
      if (obj.defeated) return;
      ctx.fillStyle = '#2b2119';
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b4553f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#e8dcc4';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(obj.count), cx, cy);
      break;
    }
  }
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: HeroeDibujable,
  x: number,
  y: number,
  selected: boolean,
): void {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;

  if (selected) {
    ctx.strokeStyle = '#d9a441';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
  }

  ctx.fillStyle = playerColor(hero.owner);
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#1a1510';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hero.name.charAt(0).toUpperCase(), cx, cy + 0.5);
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  camera: AdventureCamera,
  path: readonly Point[],
): void {
  if (path.length === 0) return;
  ctx.save();
  for (const [i, p] of path.entries()) {
    const pos = toScreen(camera, p);
    if (pos === null) continue;
    const ultimo = i === path.length - 1;
    ctx.fillStyle = ultimo ? '#d9a441' : 'rgba(217,164,65,0.55)';
    ctx.beginPath();
    ctx.arc(pos.x + TILE / 2, pos.y + TILE / 2, ultimo ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
