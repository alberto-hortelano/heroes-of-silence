/**
 * El minimapa del lateral: lo explorado en su color, los castillos y los héroes
 * de su dueño, y el rectángulo de lo que enseña el lienzo grande.
 *
 * Pulsarlo mueve la vista; eso lo decide `escenas/aventura.ts` con
 * `casillaDelMinimapa`, que es la inversa de lo que se pinta aquí.
 */
import { pointKey } from '@core/map/map.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { Point } from '@core/types.js';
import type { CamaraMapa } from './camara-mapa.js';
import type { AdventureScene } from './mapa.js';
import { playerColor } from './palette.js';
import { pigments } from './terreno.js';

/** Los pigmentos de la superficie del mapa grande: el minimapa es el mismo suelo, pequeño. */
const COLOR = Object.fromEntries(
  Object.entries(pigments).map(([t, [r, g, b]]) => [t, `rgb(${r},${g},${b})`]),
) as Readonly<Record<TerrainKind, string>>;

interface VistaMinimapa {
  readonly escena: AdventureScene;
  readonly explorado: ReadonlySet<string> | null;
  /** La de la sesión: si no se mueve, el terreno y los castillos son los de antes. */
  readonly version: number;
  readonly camara: CamaraMapa;
  readonly anchoLienzo: number;
  readonly altoLienzo: number;
}

/**
 * El terreno explorado, los castillos y las minas, pintados una vez fuera de
 * pantalla. Eran 576 `fillRect` por fotograma para un dibujo que solo cambia al
 * explorar o al cambiar una bandera; encima, a cada fotograma, solo van los
 * héroes y el rectángulo de la cámara.
 */
let base: {
  lienzo: HTMLCanvasElement;
  escena: AdventureScene;
  version: number;
  explorado: ReadonlySet<string> | null;
  vistos: number;
  ancho: number;
  alto: number;
} | null = null;

function baseDe(ancho: number, alto: number, v: VistaMinimapa): HTMLCanvasElement {
  const vistos = v.explorado?.size ?? -1;
  if (
    base !== null &&
    base.escena === v.escena &&
    base.version === v.version &&
    base.explorado === v.explorado &&
    base.vistos === vistos &&
    base.ancho === ancho &&
    base.alto === alto
  ) {
    return base.lienzo;
  }
  const lienzo = base?.lienzo ?? document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  if (ctx === null) throw new Error('este navegador no tiene canvas 2D para el minimapa');
  const { width: W, height: H, terrain, objects } = v.escena.map;
  const sx = ancho / W;
  const sy = alto / H;
  const explorada = (k: string): boolean => v.explorado === null || v.explorado.has(k);
  ctx.fillStyle = '#080a10';
  ctx.fillRect(0, 0, ancho, alto);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!explorada(pointKey({ x, y }))) continue;
      ctx.fillStyle = COLOR[terrain[y * W + x] as TerrainKind];
      ctx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
    }
  }
  for (const o of objects) {
    if (!explorada(pointKey(o.at))) continue;
    if (o.kind === 'town' || o.kind === 'mine') {
      ctx.fillStyle = o.owner === null ? '#d9c995' : playerColor(o.owner);
      const r = o.kind === 'town' ? 1.4 : 0.8;
      ctx.fillRect((o.at.x + 0.5 - r / 2) * sx, (o.at.y + 0.5 - r / 2) * sy, sx * r, sy * r);
    }
  }
  base = {
    lienzo,
    escena: v.escena,
    version: v.version,
    explorado: v.explorado,
    vistos,
    ancho,
    alto,
  };
  return lienzo;
}

export function drawMinimapa(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  v: VistaMinimapa,
): void {
  const { width: W, height: H } = v.escena.map;
  const sx = ancho / W;
  const sy = alto / H;
  ctx.drawImage(baseDe(ancho, alto, v), 0, 0);
  for (const h of v.escena.heroes) {
    if (v.explorado !== null && !v.explorado.has(pointKey(h.at))) continue;
    ctx.fillStyle = playerColor(h.owner);
    ctx.strokeStyle = '#fbe6a5';
    ctx.beginPath();
    ctx.arc((h.at.x + 0.5) * sx, (h.at.y + 0.5) * sy, Math.max(2.5, sx * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = '#fbe6a5aa';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    v.camara.x * sx,
    v.camara.y * sy,
    (v.anchoLienzo / v.camara.tile) * sx,
    (v.altoLienzo / v.camara.tile) * sy,
  );
}

/** La casilla del mapa bajo un punto del minimapa, en píxeles de pantalla. */
export function casillaDelMinimapa(
  escena: AdventureScene,
  px: number,
  py: number,
  ancho: number,
  alto: number,
): Point {
  return {
    x: Math.floor((px / ancho) * escena.map.width),
    y: Math.floor((py / alto) * escena.map.height),
  };
}
