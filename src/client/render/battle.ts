/** Dibuja la rejilla de batalla y las unidades. Hexágonos de punta arriba. */
import { BOARD_HEIGHT, BOARD_WIDTH, hexKey } from '@core/battle/board.js';
import { stackHexes } from '@core/battle/battle.js';
import { stackHp } from '@core/battle/damage.js';
import type { BattleStack, BattleState } from '@core/battle/types.js';
import { creature, hexSize, isShooter } from '@core/data.js';
import type { Hex } from '@core/types.js';
import type { Pose } from '../anim.js';
import { creatureFrame } from './assets.js';
import { RESOURCE_COLORS } from './palette.js';

export const HEX_SIZE = 34;
const HEX_W = Math.sqrt(3) * HEX_SIZE;
const HEX_H = 2 * HEX_SIZE;
const ROW_STEP = HEX_H * 0.75;
export const BOARD_PIXEL_WIDTH = HEX_W * (BOARD_WIDTH + 0.5) + 20;
export const BOARD_PIXEL_HEIGHT = ROW_STEP * (BOARD_HEIGHT - 1) + HEX_H + 20;

/** Centro en píxeles de un hex (coordenadas offset odd-r). */
export function hexCenter(h: Hex): { x: number; y: number } {
  const offset = h.row % 2 === 1 ? HEX_W / 2 : 0;
  return {
    x: 10 + HEX_W / 2 + h.col * HEX_W + offset,
    y: 10 + HEX_SIZE + h.row * ROW_STEP,
  };
}

/** Desplazamiento para centrar el tablero en un lienzo más grande. */
export function battleOffset(canvasWidth: number, canvasHeight: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.floor((canvasWidth - BOARD_PIXEL_WIDTH) / 2)),
    y: Math.max(0, Math.floor((canvasHeight - BOARD_PIXEL_HEIGHT) / 2)),
  };
}

/** Hex bajo un punto del canvas, o `null` fuera del tablero. */
export function hexAtPixel(px: number, py: number, offset = { x: 0, y: 0 }): Hex | null {
  let mejor: Hex | null = null;
  let mejorDist = Infinity;
  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const c = hexCenter({ col, row });
      const d = (c.x + offset.x - px) ** 2 + (c.y + offset.y - py) ** 2;
      if (d < mejorDist) {
        mejorDist = d;
        mejor = { col, row };
      }
    }
  }
  return mejorDist <= HEX_SIZE * HEX_SIZE ? mejor : null;
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    const x = cx + HEX_SIZE * Math.cos(angle);
    const y = cy + HEX_SIZE * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export interface BattleView {
  readonly battle: BattleState;
  /** Pose que enseña cada unidad ahora mismo. */
  readonly poses?: ReadonlyMap<string, Pose>;
  /** Hexes a los que puede moverse el stack activo. */
  readonly movable: readonly Hex[];
  readonly hoverHex: Hex | null;
  /** Stack sobre el que está el ratón, para resaltar el objetivo. */
  readonly hoverStack: string | null;
  /** Stacks sobre los que se puede lanzar el hechizo elegido. Vacío si no hay. */
  readonly castTargets: ReadonlySet<string>;
  readonly offset: { x: number; y: number };
}

export function drawBattle(ctx: CanvasRenderingContext2D, view: BattleView): void {
  const { battle } = view;
  ctx.save();
  ctx.translate(view.offset.x, view.offset.y);

  const movibles = new Set(view.movable.map(hexKey));
  const activo = battle.activeId;

  for (let row = 0; row < BOARD_HEIGHT; row++) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const h = { col, row };
      const c = hexCenter(h);
      hexPath(ctx, c.x, c.y);

      const resaltado = view.hoverHex !== null && hexKey(view.hoverHex) === hexKey(h);
      ctx.fillStyle = movibles.has(hexKey(h))
        ? resaltado
          ? '#5c6f47'
          : '#3f4c33'
        : resaltado
          ? '#3a3226'
          : '#2a2419';
      ctx.fill();
      ctx.strokeStyle = '#4a3c2a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  for (const s of battle.stacks) {
    const pose = view.poses?.get(s.id) ?? (s.count > 0 ? 'idle' : undefined);
    // Sin pose no hay nada que pintar: la unidad ya cayó y su muerte terminó.
    if (pose === undefined) continue;
    drawStack(
      ctx,
      s,
      s.id === activo,
      s.id === view.hoverStack,
      pose,
      view.castTargets.has(s.id),
    );
  }

  ctx.restore();
}

function drawStack(
  ctx: CanvasRenderingContext2D,
  s: BattleStack,
  activo: boolean,
  resaltado: boolean,
  pose: Pose,
  objetivoDeHechizo: boolean,
): void {
  const info = creature(s.creature);
  const celdas = stackHexes(s);
  const centros = celdas.map(hexCenter);
  const cx = centros.reduce((t, c) => t + c.x, 0) / centros.length;
  const cy = centros.reduce((t, c) => t + c.y, 0) / centros.length;
  const grande = hexSize(info) > 1;
  const radio = grande ? HEX_SIZE * 1.05 : HEX_SIZE * 0.72;

  // Peana: dice el bando por el color y la salud por el arco relleno, así el
  // contador no tiene que taparle los pies al sprite.
  const info2 = creature(s.creature);
  const salud = Math.max(0, Math.min(1, stackHp(s) / Math.max(1, info2.hp * s.count)));
  const baseY = cy + HEX_SIZE * 0.5;
  const radioPeana = radio * 0.78;

  ctx.beginPath();
  ctx.ellipse(cx, baseY, radioPeana, HEX_SIZE * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,8,6,0.7)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, baseY, radioPeana * salud, HEX_SIZE * 0.2 * salud, 0, 0, Math.PI * 2);
  ctx.fillStyle = s.side === 'attacker' ? 'rgba(170,96,72,0.9)' : 'rgba(78,102,150,0.9)';
  ctx.fill();

  ctx.lineWidth = activo ? 3 : 1.5;
  ctx.strokeStyle = activo ? '#d9a441' : resaltado ? '#e8dcc4' : 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, radioPeana, HEX_SIZE * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();

  const sprite = creatureFrame(s.creature, pose);
  if (sprite !== null) {
    const alto = HEX_SIZE * (grande ? 2.9 : 2.15);
    const ancho = alto;
    ctx.save();
    // El arte se pinta mirando a la derecha; el defensor lo reutiliza espejado.
    if (s.side === 'defender') {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -ancho / 2, cy + HEX_SIZE * 0.55 - alto, ancho, alto);
    } else {
      ctx.drawImage(sprite, cx - ancho / 2, cy + HEX_SIZE * 0.55 - alto, ancho, alto);
    }
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, radio, HEX_SIZE * 0.66, 0, 0, Math.PI * 2);
    ctx.fillStyle = s.side === 'attacker' ? '#7a4a3a' : '#3a4a6a';
    ctx.fill();
    ctx.stroke();
  }

  if (s.defending) {
    ctx.strokeStyle = '#7fa87f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, radio + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Objetivo válido del hechizo elegido. El anillo va por FUERA del de defensa
  // para que una unidad defendiéndose enseñe los dos, y reusa un color de la
  // paleta para no inventar arte nuevo.
  if (objetivoDeHechizo) {
    ctx.strokeStyle = RESOURCE_COLORS.crystal;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy - 4, radio + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Con arte, el nombre sobra: el sprite ya dice qué es.
  if (sprite === null) {
    ctx.fillStyle = '#e8dcc4';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.name.slice(0, 3), cx, cy - 8);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Efectivos: bajo la peana, fuera de la silueta. Una unidad que se está
  // desplomando ya no tiene efectivos que contar.
  if (s.count <= 0) return;
  const cuenta = String(s.count);
  const ancho = Math.max(22, cuenta.length * 9 + 10);
  ctx.fillStyle = 'rgba(10,8,6,0.9)';
  ctx.fillRect(cx - ancho / 2, baseY + 6, ancho, 14);
  ctx.strokeStyle = 'rgba(217,164,65,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - ancho / 2 + 0.5, baseY + 6.5, ancho - 1, 13);
  ctx.fillStyle = '#d9a441';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(cuenta, cx, baseY + 13);

  if (isShooter(info) && s.shotsLeft > 0) {
    ctx.fillStyle = '#7fa87f';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(`↑${s.shotsLeft}`, cx, cy - HEX_SIZE * 0.8);
  }
}
