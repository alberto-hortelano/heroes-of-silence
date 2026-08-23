/**
 * Punto de entrada del cliente.
 *
 * Reparte el trabajo: la sesión decide, los módulos de `render/` pintan y los
 * de `views/` montan los paneles. Aquí solo se conectan ratón, teclado y bucle
 * de dibujo.
 */
import { stackHexes } from '@core/battle/battle.js';
import { BattleAnimator, type Pose } from './anim.js';
import { hexKey } from '@core/battle/board.js';
import type { BattleStack } from '@core/battle/types.js';
import type { Point } from '@core/types.js';
import {
  cameraFor,
  drawAdventure,
  tileAtPixel,
  type AdventureCamera,
} from './render/adventure.js';
import { assetCount, loadAssets, onAssetsChanged } from './render/assets.js';
import { battleOffset, drawBattle, hexAtPixel } from './render/battle.js';
import { Session } from './session.js';
import { renderActions, renderSide, renderTopbar } from './views/panels.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('este navegador no tiene canvas 2D');

const elDay = document.getElementById('day') as HTMLElement;
const elResources = document.getElementById('resources') as HTMLElement;
const elTurn = document.getElementById('turn') as HTMLElement;
const elSide = document.getElementById('side') as HTMLElement;
const elStatus = document.getElementById('status') as HTMLElement;
const elActions = document.getElementById('actions') as HTMLElement;

let session = new Session(Date.now() % 100000);
let camera: AdventureCamera = { origin: { x: 0, y: 0 }, cols: 0, rows: 0, offsetX: 0, offsetY: 0 };
let hoverPath: Point[] = [];
let hoverStack: string | null = null;
let hoverHex: ReturnType<typeof hexAtPixel> = null;
let battleShift = { x: 0, y: 0 };
const animator = new BattleAnimator();
let needsRender = true;

/**
 * Ajusta el búfer del canvas a su tamaño real en pantalla.
 *
 * Se comprueba en cada fotograma, no solo al arrancar: la primera medida se
 * toma antes de que la rejilla CSS haya colocado nada, y el mapa se quedaba
 * dibujado en una franja estrecha a la izquierda.
 */
function syncCanvasSize(): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    needsRender = true;
  }
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function render(): void {
  if (!needsRender) {
    requestAnimationFrame(render);
    return;
  }
  needsRender = false;

  const rect = syncCanvasSize();
  ctx!.clearRect(0, 0, rect.width, rect.height);

  if (session.scene === 'battle' && session.battle !== null) {
    const battle = session.battle;
    battleShift = battleOffset(rect.width, rect.height);

    const muertos = new Set(battle.stacks.filter((s) => s.count <= 0).map((s) => s.id));
    animator.observe(battle.log, muertos);
    const poses = new Map<string, Pose>();
    for (const s of battle.stacks) {
      const pose = animator.poseOf(s.id, { muerto: s.count <= 0, defendiendo: s.defending });
      if (pose !== null) poses.set(s.id, pose);
    }

    drawBattle(ctx!, {
      battle,
      movable: session.battleMovable(),
      hoverHex,
      hoverStack,
      offset: battleShift,
      poses,
    });

    // Mientras haya una pose en marcha hay que seguir repintando.
    if (animator.busy) needsRender = true;
  } else {
    const centro = session.selectedHero?.at ??
      session.myTowns()[0]?.at ?? { x: 0, y: 0 };
    camera = cameraFor(session.state, centro, rect.width, rect.height);
    drawAdventure(ctx!, {
      state: session.state,
      camera,
      viewer: session.viewer,
      selectedHero: session.selectedHeroId,
      hoverPath,
      revealAll: session.revealAll,
    });
  }

  const top = renderTopbar(session);
  elDay.textContent = top.day;
  elResources.innerHTML = top.resources;
  elTurn.textContent = top.turn;
  elSide.innerHTML = renderSide(session);
  elActions.innerHTML = renderActions(session);
  elStatus.textContent = session.status;

  requestAnimationFrame(render);
}

// ---------------------------------------------------------------- ratón

canvas.addEventListener('mousemove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;

  if (session.scene === 'battle') {
    hoverHex = hexAtPixel(px, py, battleShift);
    hoverStack = hoverHex === null ? null : stackAt(hoverHex)?.id ?? null;
    canvas.style.cursor = hoverStack !== null ? 'crosshair' : 'pointer';
  } else {
    const tile = tileAtPixel(camera, px, py);
    hoverPath = session.previewPath(tile).map((p) => p.at);
    canvas.style.cursor = hoverPath.length > 0 ? 'pointer' : 'default';
  }
  needsRender = true;
});

canvas.addEventListener('mouseleave', () => {
  hoverPath = [];
  hoverHex = null;
  hoverStack = null;
  needsRender = true;
});

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;

  if (session.scene === 'battle') {
    handleBattleClick(px, py);
  } else {
    session.clickTile(tileAtPixel(camera, px, py));
    hoverPath = [];
  }
  needsRender = true;
});

function stackAt(hex: { col: number; row: number }): BattleStack | undefined {
  const battle = session.battle;
  if (battle === null) return undefined;
  return battle.stacks.find(
    (s) => s.count > 0 && stackHexes(s).some((h) => hexKey(h) === hexKey(hex)),
  );
}

function handleBattleClick(px: number, py: number): void {
  const battle = session.battle;
  if (battle === null || battle.finished !== null) return;

  const hex = hexAtPixel(px, py, battleShift);
  if (hex === null) return;

  const objetivo = stackAt(hex);
  const acciones = session.battleLegalActions();

  // Clic sobre un enemigo: disparar si se puede, si no cargar contra él.
  if (objetivo !== undefined && objetivo.side === 'defender') {
    const disparo = acciones.find((a) => a.type === 'shoot' && a.target === objetivo.id);
    if (disparo !== undefined) {
      session.playBattleAction(disparo);
      return;
    }
    const cuerpoACuerpo =
      acciones.find((a) => a.type === 'attack' && a.target === objetivo.id && a.from === undefined) ??
      acciones.find((a) => a.type === 'attack' && a.target === objetivo.id);
    if (cuerpoACuerpo !== undefined) {
      session.playBattleAction(cuerpoACuerpo);
      return;
    }
    session.status = 'No alcanzas a esa unidad este turno.';
    return;
  }

  const movimiento = acciones.find(
    (a) => a.type === 'move' && hexKey(a.to) === hexKey(hex),
  );
  if (movimiento !== undefined) {
    session.playBattleAction(movimiento);
    return;
  }
  session.status = 'No puedes llegar a ese hexágono.';
}

// ---------------------------------------------------------------- paneles

document.addEventListener('click', (ev) => {
  const target = (ev.target as HTMLElement).closest('[data-action]');
  if (target === null) return;
  const action = target.getAttribute('data-action');

  switch (action) {
    case 'end-turn':
      session.endTurn();
      break;
    case 'toggle-fog':
      session.revealAll = !session.revealAll;
      break;
    case 'select-hero':
      session.selectedHeroId = target.getAttribute('data-hero');
      break;
    case 'open-town':
      session.openTown(target.getAttribute('data-town') as string);
      break;
    case 'close-town':
      session.closeTown();
      break;
    case 'build':
      session.build(target.getAttribute('data-building') as string);
      break;
    case 'recruit': {
      const id = target.getAttribute('data-creature') as string;
      const raw = target.getAttribute('data-count') as string;
      const town = session.activeTown;
      const disponibles = town?.available[id] ?? 0;
      session.recruit(id, raw === 'all' ? disponibles : Number(raw));
      break;
    }
    case 'hire-hero':
      session.hireHero();
      break;
    case 'battle-defend':
      session.playBattleAction({ type: 'defend' });
      break;
    case 'battle-wait':
      session.playBattleAction({ type: 'wait' });
      break;
    case 'auto-battle':
      session.autoResolveBattle();
      break;
    case 'finish-battle':
      session.finishBattle();
      break;
    case 'restart':
      session = new Session(Date.now() % 100000);
      break;
    default:
      return;
  }
  needsRender = true;
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && session.scene === 'town') session.closeTown();
  if (ev.key === ' ' && session.scene === 'adventure') {
    ev.preventDefault();
    session.endTurn();
  }
  needsRender = true;
});

onAssetsChanged(() => {
  needsRender = true;
});

// El arte entra cuando entra: el juego ya es jugable con los marcadores.
void loadAssets().then((hay) => {
  if (hay) console.log(`[assets] ${assetCount()} imágenes generadas cargadas`);
  else console.log('[assets] sin arte generado todavía; se juega con marcadores');
  needsRender = true;
});

window.addEventListener('resize', () => {
  needsRender = true;
});
new ResizeObserver(() => {
  needsRender = true;
}).observe(canvas);
syncCanvasSize();
session.status = 'Haz clic en el mapa para mover a tu héroe. Espacio pasa el turno.';
requestAnimationFrame(render);
