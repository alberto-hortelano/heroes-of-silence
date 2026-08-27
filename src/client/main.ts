/**
 * Punto de entrada del cliente.
 *
 * Reparte el trabajo: la sesión decide, los módulos de `render/` pintan y los
 * de `views/` montan los paneles. Aquí solo se conectan ratón, teclado y bucle
 * de dibujo.
 */
import { stackHexes } from '@core/battle/battle.js';
import { hexKey } from '@core/battle/board.js';
import type { BattleStack } from '@core/battle/types.js';
import { parseSeed } from '@core/rng.js';
import type { Point } from '@core/types.js';
import { BattleAnimator, type Pose } from './anim.js';
import { pintar } from './html.js';
import { type AdventureCamera, cameraFor, drawAdventure, tileAtPixel } from './render/adventure.js';
import { assetCount, loadAssets, onAssetsChanged } from './render/assets.js';
import { battleOffset, drawBattle, hexAtPixel } from './render/battle.js';
import {
  describeHit,
  drawTown,
  hitAtPixel,
  nextOf,
  plotById,
  type TownHit,
  type TownTransform,
  townLayout,
} from './render/town.js';
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
const elSeed = document.getElementById('seed') as HTMLElement;

/**
 * La semilla que pide la URL, o `null` si no pide ninguna. Lanza si pide una
 * que no lo es: la regla entera —incluido que `?seed=` vacío es no pedir— la
 * escribe el núcleo (`parseSeed`), aquí solo se lee la barra de direcciones.
 */
function semillaDeLaUrl(): number | null {
  return parseSeed(new URLSearchParams(location.search).get('seed'));
}

/** Una partida que nadie ha pedido: la de hoy a esta hora. */
function semillaSorteada(): number {
  return Date.now() % 100000;
}

/**
 * Abre la partida y deja dicho, en la URL y en la barra, con qué semilla juega.
 *
 * Entre copiar un número a mano y copiar la barra de direcciones está la
 * diferencia entre que un fallo encontrado jugando se pueda volver a producir o
 * no. La semilla se escribe **una vez, aquí**: no cambia en toda la partida, así
 * que sacarla del bucle de dibujo le quitó sesenta escrituras por segundo.
 */
function abrePartida(seed: number): Session {
  // Se cambia SOLO `seed` sobre la URL de ahora: escribir `?seed=N` a pelo
  // sustituía la query entera y el fragmento, así que `?debug=1&seed=777#castillo`
  // se quedaba en `?seed=777`. Hoy no lo nota nadie porque no hay un segundo
  // parámetro; el día que lo haya, desaparecería al abrir partida.
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  const abierta = new Session(seed);
  elSeed.textContent = `semilla ${abierta.state.seed}`;
  return abierta;
}

let session: Session;
try {
  session = abrePartida(semillaDeLaUrl() ?? semillaSorteada());
} catch (err) {
  // Sin sesión no arranca el bucle de dibujo y la página se queda EN BLANCO: el
  // motivo existiría solo en la consola, que es tanto como no escribirlo para la
  // persona. Nadie repinta `#status` sin sesión, así que lo que se escriba aquí
  // se queda. Y se relanza igual: un fallo no se tapa con una barra bonita.
  const motivo = err instanceof Error ? err.message : String(err);
  // Con el motivo va la SALIDA: `#actions` está vacío —no hay sesión que ofrecer
  // acciones—, así que quien escriba `?seed=abc` se queda ante una pantalla
  // negra sin nada que pulsar, y la única forma de salir es la barra de
  // direcciones. Solo se dice cuando la URL pide semilla: si lo que ha fallado
  // es otra cosa, el consejo sería mentira.
  const pideSemilla = new URLSearchParams(location.search).get('seed') !== null;
  elStatus.textContent = pideSemilla
    ? `${motivo} — quita "?seed=…" de la barra de direcciones para jugar una partida al azar`
    : motivo;
  throw err;
}

let camera: AdventureCamera = { origin: { x: 0, y: 0 }, cols: 0, rows: 0, offsetX: 0, offsetY: 0 };
let hoverPath: Point[] = [];
/**
 * Lo que determina la ruta previsualizada: la casilla señalada, quién la anda y
 * cuánto le queda. Un `mousemove` dispara muchísimo más rápido de lo que cambia
 * la casilla —una casilla son decenas de píxeles—, así que sin esta clave la
 * inmensa mayoría de los Dijkstras (0,78 ms cada uno) recalculaban el MISMO
 * camino. Va la clave entera y no solo la casilla porque la ruta también cambia
 * al elegir otro héroe desde el panel o al gastarle el movimiento.
 */
let rutaPintada: string | null = null;
let hoverStack: string | null = null;
let hoverHex: ReturnType<typeof hexAtPixel> = null;
let battleShift = { x: 0, y: 0 };
let townShift: TownTransform = { scale: 1, x: 0, y: 0 };
let hoverTown: TownHit | null = null;
const animator = new BattleAnimator();
let needsRender = true;

/** Compartido: no hay nada que anillar cuando no hay hechizo elegido. */
const SIN_OBJETIVOS: ReadonlySet<string> = new Set();

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

/**
 * El bucle de dibujo, con red — el mismo arreglo que el del espectador y por el
 * mismo motivo.
 *
 * Desde que el marcado sale por `pintar`, dentro de este bucle hay funciones que
 * **lanzan** donde antes solo había asignaciones a `innerHTML`, que no pueden
 * lanzar. Con el `requestAnimationFrame` en la última línea, una sola excepción
 * mataba el bucle entero y el tablero se quedaba congelado sin decir nada. Aquí
 * duele menos que en el espectador —quien juega nota que no responde— pero el
 * fallo es el mismo y la red también: se re-arma en un `finally` y el motivo se
 * escribe en la barra de estado, que es donde esta pantalla cuenta las cosas.
 */
function render(): void {
  try {
    dibujarFotograma();
  } catch (err) {
    // No se traga nada: se dice. Y `needsRender` ya está en `false`, así que no
    // se repite el intento sesenta veces por segundo.
    const motivo = err instanceof Error ? err.message : String(err);
    console.error('[cliente] fallo al pintar', err);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${motivo}`;
  } finally {
    requestAnimationFrame(render);
  }
}

function dibujarFotograma(): void {
  if (!needsRender) return;
  needsRender = false;

  const rect = syncCanvasSize();
  ctx!.clearRect(0, 0, rect.width, rect.height);

  if (session.scene === 'town' && session.activeTown !== null) {
    townShift = townLayout(rect.width, rect.height);
    drawTown(ctx!, {
      town: session.activeTown,
      purse: session.resources,
      transform: townShift,
      hover: hoverTown,
      interactive: session.isPlayersTurn,
    });
  } else if (session.scene === 'battle' && session.battle !== null) {
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
      // Sin hechizo elegido no hay nada que anillar: se reparte el conjunto
      // vacío en vez de montar uno nuevo en cada fotograma, que a 60 fps
      // mientras dura una animación son sesenta por segundo para nada.
      castTargets: session.selectedSpell === null ? SIN_OBJETIVOS : new Set(session.castTargets()),
      offset: battleShift,
      poses,
    });

    // Mientras haya una pose en marcha hay que seguir repintando.
    if (animator.busy) needsRender = true;
  } else {
    const centro = session.selectedHero?.at ?? session.myTowns()[0]?.at ?? { x: 0, y: 0 };
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

  // Lo que es marcado se pinta con `pintar`, que es el único `innerHTML` del
  // repo; lo que es texto sigue yendo por `textContent`, que no necesita
  // escapar nada porque no interpreta nada.
  const top = renderTopbar(session);
  elDay.textContent = top.day;
  pintar(elResources, top.resources);
  elTurn.textContent = top.turn;
  pintar(elSide, renderSide(session));
  pintar(elActions, renderActions(session));
  elStatus.textContent = session.status;
}

// ---------------------------------------------------------------- ratón

canvas.addEventListener('mousemove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;

  if (session.scene === 'town' && session.activeTown !== null) {
    hoverTown = hitAtPixel(session.activeTown, px, py, townShift);
    canvas.style.cursor = hoverTown === null ? 'default' : 'pointer';
    session.status = describeHit(session.activeTown, session.resources, hoverTown);
  } else if (session.scene === 'battle') {
    hoverHex = hexAtPixel(px, py, battleShift);
    hoverStack = hoverHex === null ? null : (stackAt(hoverHex)?.id ?? null);
    canvas.style.cursor = hoverStack !== null ? 'crosshair' : 'pointer';
  } else {
    const tile = tileAtPixel(camera, px, py);
    const heroe = session.selectedHero;
    const clave = `${tile.x},${tile.y}|${heroe?.id ?? ''}|${heroe?.movePoints ?? 0}|${session.isPlayersTurn}`;
    if (clave === rutaPintada) return;
    rutaPintada = clave;
    hoverPath = session.previewPath(tile).map((p) => p.at);
    canvas.style.cursor = hoverPath.length > 0 ? 'pointer' : 'default';
  }
  needsRender = true;
});

canvas.addEventListener('mouseleave', () => {
  hoverPath = [];
  rutaPintada = null;
  hoverHex = null;
  hoverStack = null;
  hoverTown = null;
  needsRender = true;
});

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;

  if (session.scene === 'town') {
    handleTownClick(px, py);
  } else if (session.scene === 'battle') {
    handleBattleClick(px, py);
  } else {
    session.clickTile(tileAtPixel(camera, px, py));
    hoverPath = [];
    rutaPintada = null;
  }
  needsRender = true;
});

/**
 * Clic dentro del castillo: un solar levanta su siguiente eslabón y un botón de
 * la franja recluta. Las reglas siguen viviendo en el núcleo — aquí solo se
 * traduce el píxel a la acción.
 */
function handleTownClick(px: number, py: number): void {
  const town = session.activeTown;
  if (town === null) return;
  const hit = hitAtPixel(town, px, py, townShift);
  if (hit === null) return;

  if (hit.kind === 'recruit') {
    const disponibles = town.available[hit.creature] ?? 0;
    session.recruit(hit.creature, hit.all ? disponibles : 1);
    return;
  }

  const next = nextOf(town, plotById(town.faction, hit.plot));
  if (next === null) {
    session.status = 'En ese solar ya está todo construido.';
    return;
  }
  session.build(next);
}

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

  // Con un hechizo elegido, el clic apunta: va ANTES que atacar y moverse, y la
  // acción que se emite sale de la lista de legales — nunca se construye aquí.
  const hechizo = session.selectedSpell;
  if (hechizo !== null) {
    if (objetivo === undefined) {
      session.status = 'Elige una unidad sobre la que lanzarlo, o pulsa Escape para cancelar.';
      return;
    }
    const conjuro = acciones.find(
      (a) => a.type === 'cast' && a.spell === hechizo && a.target === objetivo.id,
    );
    if (conjuro !== undefined) {
      session.playBattleAction(conjuro);
      return;
    }
    // La selección se mantiene: quien apuntó mal vuelve a apuntar sin repetir
    // el viaje al botón.
    session.status = session.castRejection(objetivo.id);
    return;
  }

  // Clic sobre un enemigo: disparar si se puede, si no cargar contra él.
  if (objetivo !== undefined && objetivo.side === 'defender') {
    const disparo = acciones.find((a) => a.type === 'shoot' && a.target === objetivo.id);
    if (disparo !== undefined) {
      session.playBattleAction(disparo);
      return;
    }
    const cuerpoACuerpo =
      acciones.find(
        (a) => a.type === 'attack' && a.target === objetivo.id && a.from === undefined,
      ) ?? acciones.find((a) => a.type === 'attack' && a.target === objetivo.id);
    if (cuerpoACuerpo !== undefined) {
      session.playBattleAction(cuerpoACuerpo);
      return;
    }
    session.status = 'No alcanzas a esa unidad este turno.';
    return;
  }

  const movimiento = acciones.find((a) => a.type === 'move' && hexKey(a.to) === hexKey(hex));
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
      // Sin `.finally`: el manejador ya marca el repintado al salir, y
      // `endTurn` no rechaza —se traga su fallo y lo escribe en `status`—.
      // El `void p.finally(cb)` que había aquí RE-LANZABA, así que un turno de
      // rival roto salía por la consola como `unhandledrejection` y en el
      // tablero no salía por ningún sitio.
      void session.endTurn();
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
      hoverTown = null;
      break;
    case 'hire-hero':
      session.hireHero();
      break;
    case 'battle-defend':
      session.playBattleAction({ type: 'defend' });
      break;
    case 'battle-wait':
      session.playBattleAction({ type: 'wait' });
      break;
    case 'battle-spell':
      session.selectSpell(target.getAttribute('data-spell') as string);
      break;
    case 'auto-battle':
      session.autoResolveBattle();
      break;
    case 'finish-battle':
      session.finishBattle();
      break;
    case 'restart':
      // Reiniciar es partida NUEVA: se sortea aunque la URL traiga una semilla,
      // y la URL se reescribe con la que salga.
      session = abrePartida(semillaSorteada());
      rutaPintada = null;
      break;
    default:
      return;
  }
  needsRender = true;
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && session.scene === 'town') {
    session.closeTown();
    hoverTown = null;
  }
  if (ev.key === 'Escape' && session.scene === 'battle') {
    session.clearSpell();
  }
  if (ev.key === ' ' && session.scene === 'adventure') {
    ev.preventDefault();
    void session.endTurn();
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
