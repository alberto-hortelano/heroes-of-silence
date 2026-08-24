/**
 * La pantalla de castillo.
 *
 * El castillo no es una lista de edificios: es un cuadro con SOLARES fijos, y
 * cada solar tiene una cadena de mejora que se levanta en el sitio. Un solar
 * dibuja el último eslabón construido, y si le queda alguno por construir se
 * puede pulsar. Así se ve de un vistazo lo que tienes y lo que te falta, que es
 * justo lo que una lista de botones no enseña.
 *
 * Las medidas van en un lienzo virtual de 1024×576 y se escalan al canvas real,
 * igual que el tablero de batalla se centra con `battleOffset`.
 */
import { creature } from '@core/data.js';
import { building, buildingsOfFaction, type Building } from '@core/town/buildings.js';
import { buildBlocker, creatureOfLevel, hasBuilding, recruitCost, type Town } from '@core/town/town.js';
import { RESOURCE_KINDS, type FactionId, type Resources } from '@core/types.js';
import { asset } from './assets.js';
import { costLabel, RESOURCE_COLORS } from './palette.js';

export const TOWN_WIDTH = 1024;
export const TOWN_HEIGHT = 576;

export interface TownPlot {
  readonly id: string;
  /** Los edificios que se levantan aquí, en orden de mejora. */
  readonly chain: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Nivel de morada, si este solar produce criaturas. */
  readonly level?: number;
}

/**
 * Los cinco solares de villa: iguales para las dos facciones.
 *
 * La cadena del gremio se DERIVA del catálogo, igual que las de las moradas:
 * los edificios con `mageGuildLevel`, en orden de nivel. Escrita a mano era una
 * trampa esperando — el día que entrara `mage_guild_3` en los datos, la IA
 * podría construirlo y la persona vería el solar terminado en el II, sin que
 * ningún test se pusiera rojo.
 */
function solaresDeVilla(catalogo: readonly Building[]): readonly TownPlot[] {
  const gremio = catalogo
    .filter((b) => b.mageGuildLevel !== undefined)
    .slice()
    .sort((a, b) => (a.mageGuildLevel ?? 0) - (b.mageGuildLevel ?? 0))
    .map((b) => b.id);

  return [
    { id: 'fort', chain: ['castle'], x: 40, y: 30, w: 190, h: 150 },
    { id: 'hall', chain: ['village_hall', 'town_hall', 'city_hall'], x: 258, y: 30, w: 190, h: 150 },
    { id: 'guild', chain: gremio, x: 476, y: 30, w: 170, h: 150 },
    { id: 'tavern', chain: ['tavern'], x: 674, y: 30, w: 150, h: 150 },
    { id: 'market', chain: ['marketplace'], x: 852, y: 30, w: 132, h: 150 },
  ];
}

/**
 * Once solares para los edificios de la facción.
 *
 * La fila de atrás son los edificios de villa; la de delante, las seis moradas,
 * en orden de nivel y con su franja de reclutamiento justo debajo: la criatura
 * cae siempre bajo la casa que la cría.
 *
 * Las cadenas de las moradas se DERIVAN del catálogo, no se escriben aquí. Por
 * eso el `lvl6` del nigromante sale con un solo eslabón sin que la pantalla
 * sepa nada del dragón óseo: su mejora no existe en `data/buildings.json`, así
 * que no hay nada que encadenar ni nada que ofrecer.
 */
export function townPlots(faction: FactionId): readonly TownPlot[] {
  const propios = buildingsOfFaction(faction);
  const cadena = (nivel: number): string[] => [
    ...propios.filter((b) => b.dwellingLevel === nivel),
    ...propios.filter((b) => b.upgradesLevel === nivel),
  ].map((b) => b.id);

  return [
    ...solaresDeVilla(propios),
    ...[1, 2, 3, 4, 5, 6].map((n, i) => ({
      id: `lvl${n}`,
      chain: cadena(n),
      x: 42 + i * 160,
      y: 200,
      w: 140,
      h: 150,
      level: n,
    })),
  ];
}

/** La línea de suelo cae justo en la base de las moradas: parecen apoyadas. */
const GROUND_Y = 344;
const STRIP_Y = 372;
const STRIP_H = TOWN_HEIGHT - STRIP_Y;
/**
 * Dónde cae la línea del horizonte del fondo, en tanto por uno de su alto.
 *
 * El fondo se genera en 16:9 y se recorta para que su horizonte quede POR
 * ENCIMA de la base de la fila de atrás: así los edificios de villa se apoyan
 * en el suelo y las moradas, más abajo, quedan en primer término. Con el
 * horizonte por debajo, el ayuntamiento flotaba en mitad del cielo.
 */
const BACKDROP_HORIZON = 0.54;
const HORIZON_Y = 150;
const CELL_H = 150;

/** Escala y centrado del cuadro dentro del canvas real. */
export interface TownTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export function townLayout(canvasWidth: number, canvasHeight: number): TownTransform {
  const scale = Math.min(canvasWidth / TOWN_WIDTH, canvasHeight / TOWN_HEIGHT);
  return {
    scale,
    x: (canvasWidth - TOWN_WIDTH * scale) / 2,
    y: (canvasHeight - TOWN_HEIGHT * scale) / 2,
  };
}

/** Lo que hay bajo el ratón: un solar donde construir o un botón de recluta. */
export type TownHit =
  | { readonly kind: 'plot'; readonly plot: string }
  | { readonly kind: 'recruit'; readonly creature: string; readonly all: boolean };

export function hitAtPixel(
  town: Town,
  px: number,
  py: number,
  t: TownTransform,
): TownHit | null {
  const vx = (px - t.x) / t.scale;
  const vy = (py - t.y) / t.scale;

  for (const plot of townPlots(town.faction)) {
    if (vx >= plot.x && vx <= plot.x + plot.w && vy >= plot.y && vy <= plot.y + plot.h) {
      return { kind: 'plot', plot: plot.id };
    }
  }

  for (const { plot, creature: id } of recruitCells(town)) {
    if (vx < plot.x || vx > plot.x + plot.w) continue;
    if (vy < STRIP_Y || vy > STRIP_Y + CELL_H) continue;
    // Los dos botones ocupan la banda de abajo de la casilla, a mitades.
    const enBotones = vy >= STRIP_Y + CELL_H - 30;
    if (!enBotones) return { kind: 'recruit', creature: id, all: false };
    return { kind: 'recruit', creature: id, all: vx > plot.x + plot.w / 2 };
  }
  return null;
}

/** Una casilla de recluta por morada construida, bajo su propio solar. */
function recruitCells(town: Town): { plot: TownPlot; creature: string }[] {
  return townPlots(town.faction)
    .filter((p) => p.level !== undefined && p.chain.some((id) => hasBuilding(town, id)))
    .map((p) => ({ plot: p, creature: creatureOfLevel(town, p.level as number) }));
}

/** El eslabón construido más avanzado del solar, o `null` si está vacío. */
export function builtOf(town: Town, plot: TownPlot): string | null {
  let found: string | null = null;
  for (const id of plot.chain) if (hasBuilding(town, id)) found = id;
  return found;
}

/** El siguiente eslabón por construir, o `null` si el solar está completo. */
export function nextOf(town: Town, plot: TownPlot): string | null {
  return plot.chain.find((id) => !hasBuilding(town, id)) ?? null;
}

export function plotById(faction: FactionId, id: string): TownPlot {
  const found = townPlots(faction).find((p) => p.id === id);
  if (found === undefined) throw new Error(`solar desconocido: "${id}"`);
  return found;
}

export interface TownView {
  readonly town: Town;
  readonly purse: Resources;
  readonly transform: TownTransform;
  readonly hover: TownHit | null;
  /** Falso mientras juega el rival: se pinta todo, pero no se invita a pulsar. */
  readonly interactive: boolean;
}

export function drawTown(ctx: CanvasRenderingContext2D, view: TownView): void {
  const { town, transform } = view;
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);

  drawBackdrop(ctx, town);

  for (const plot of townPlots(town.faction)) drawPlot(ctx, view, plot);
  drawRecruitStrip(ctx, view);

  ctx.restore();
}

// ------------------------------------------------------------------- fondo

function drawBackdrop(ctx: CanvasRenderingContext2D, town: Town): void {
  const fondo = asset('towns', town.faction);
  if (fondo !== null) {
    const alto = (TOWN_WIDTH / fondo.width) * fondo.height;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, TOWN_WIDTH, STRIP_Y);
    ctx.clip();
    ctx.drawImage(fondo, 0, HORIZON_Y - BACKDROP_HORIZON * alto, TOWN_WIDTH, alto);
    ctx.restore();
  } else {
    // Sin arte, un cielo y un suelo: el juego se juega igual.
    const cielo = ctx.createLinearGradient(0, 0, 0, STRIP_Y);
    const nigromante = town.faction === 'necromancer';
    cielo.addColorStop(0, nigromante ? '#2a2233' : '#3b4a63');
    cielo.addColorStop(1, nigromante ? '#4a3d46' : '#8a8570');
    ctx.fillStyle = cielo;
    ctx.fillRect(0, 0, TOWN_WIDTH, STRIP_Y);
    ctx.fillStyle = nigromante ? '#2e2a2a' : '#4a4432';
    ctx.fillRect(0, GROUND_Y, TOWN_WIDTH, STRIP_Y - GROUND_Y);
  }

  ctx.fillStyle = 'rgba(20,17,13,0.92)';
  ctx.fillRect(0, STRIP_Y, TOWN_WIDTH, STRIP_H);
  ctx.strokeStyle = '#4a3c2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, STRIP_Y);
  ctx.lineTo(TOWN_WIDTH, STRIP_Y);
  ctx.stroke();
}

// ------------------------------------------------------------------ solares

function drawPlot(ctx: CanvasRenderingContext2D, view: TownView, plot: TownPlot): void {
  const { town, purse } = view;
  const built = builtOf(town, plot);
  const next = nextOf(town, plot);
  const señalado =
    view.hover !== null && view.hover.kind === 'plot' && view.hover.plot === plot.id;
  const blocker = next === null ? 'ya está todo construido' : buildBlocker(town, next, purse);
  const construible = view.interactive && next !== null && blocker === null;

  // El id del edificio ES el nombre de su PNG: los de villa van sin prefijo
  // ('castle'), y las moradas ya lo llevan dentro ('knight_dwelling_3').
  const sprite = built === null ? null : asset('buildings', built);

  if (built !== null) {
    if (sprite !== null) {
      dibujarAjustado(ctx, sprite, plot);
    } else {
      siluetaConstruida(ctx, plot, building(built).name);
    }
  } else {
    solarVacio(ctx, plot, next === null ? '—' : building(next).name);
  }

  // Aro dorado solo si de verdad se puede levantar algo: un solar atenuado
  // dice "aquí no" sin tener que leer el motivo.
  if (señalado) {
    ctx.strokeStyle = construible ? '#d9a441' : '#8a7c63';
    ctx.lineWidth = 3;
    ctx.strokeRect(plot.x - 2, plot.y - 2, plot.w + 4, plot.h + 4);
  }

  if (next !== null) etiquetaCoste(ctx, plot, next, construible, señalado);
  if (plot.level !== undefined) etiquetaMorada(ctx, town, plot, built !== null);
}

function dibujarAjustado(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  plot: TownPlot,
): void {
  // El arte se pega al suelo del solar y se centra: los edificios de una fila
  // apoyan en la misma línea aunque tengan alturas distintas.
  const escala = Math.min(plot.w / img.width, plot.h / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, plot.x + (plot.w - w) / 2, plot.y + plot.h - h, w, h);
}

function siluetaConstruida(ctx: CanvasRenderingContext2D, plot: TownPlot, nombre: string): void {
  const base = plot.y + plot.h;
  const alto = plot.h * 0.72;
  ctx.fillStyle = '#5b4f3c';
  ctx.fillRect(plot.x + 12, base - alto, plot.w - 24, alto);
  ctx.fillStyle = '#6d6047';
  ctx.beginPath();
  ctx.moveTo(plot.x + 4, base - alto);
  ctx.lineTo(plot.x + plot.w / 2, base - alto - 26);
  ctx.lineTo(plot.x + plot.w - 4, base - alto);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(plot.x + 12, base - alto, plot.w - 24, alto);
  texto(ctx, nombre, plot.x + plot.w / 2, base - alto / 2, '#e8dcc4', 'bold 13px system-ui, sans-serif', plot.w - 20);
}

function solarVacio(ctx: CanvasRenderingContext2D, plot: TownPlot, nombre: string): void {
  const base = plot.y + plot.h;
  const alto = plot.h * 0.55;
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = 'rgba(232,220,196,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(plot.x + 12, base - alto, plot.w - 24, alto);
  ctx.restore();
  ctx.fillStyle = 'rgba(10,8,6,0.28)';
  ctx.fillRect(plot.x + 12, base - alto, plot.w - 24, alto);
  texto(ctx, nombre, plot.x + plot.w / 2, base - alto / 2, 'rgba(232,220,196,0.65)', '12px system-ui, sans-serif', plot.w - 20);
}

/** Chapa con el coste del siguiente eslabón, sobre el solar. */
function etiquetaCoste(
  ctx: CanvasRenderingContext2D,
  plot: TownPlot,
  buildingId: string,
  construible: boolean,
  señalado: boolean,
): void {
  const coste = building(buildingId).cost;
  const partes = RESOURCE_KINDS.filter((k) => (coste[k] ?? 0) > 0);
  const y = plot.y + 4;

  if (partes.length === 0) {
    chapa(ctx, plot.x + (plot.w - 60) / 2, y, 60, 18, construible);
    texto(ctx, 'gratis', plot.x + plot.w / 2, y + 9, '#d9a441', 'bold 11px system-ui, sans-serif', 56);
    return;
  }

  // El gremio de nivel 2 cuesta SIETE recursos y no cabe en una fila de 170 px:
  // se reparte en tantas filas como haga falta en vez de desbordar el solar.
  const CHIP = 34;
  const porFila = Math.max(1, Math.min(partes.length, Math.floor((plot.w - 10) / CHIP)));
  const filas = Math.ceil(partes.length / porFila);
  const ancho = porFila * CHIP + 10;
  const alto = filas * 18 + 4;
  const x = plot.x + (plot.w - ancho) / 2;
  chapa(ctx, x, y, ancho, alto, construible);

  partes.forEach((k, i) => {
    const cursor = x + 5 + (i % porFila) * CHIP;
    const cy = y + 2 + Math.floor(i / porFila) * 18 + 9;
    const icono = asset('icons', k);
    if (icono !== null) {
      ctx.drawImage(icono, cursor, cy - 6, 12, 12);
    } else {
      ctx.fillStyle = RESOURCE_COLORS[k];
      ctx.fillRect(cursor + 1, cy - 5, 9, 9);
    }
    ctx.fillStyle = construible ? '#e8dcc4' : '#9a8d76';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(coste[k]), cursor + 14, cy);
  });

  if (señalado && !construible) {
    ctx.fillStyle = 'rgba(180,85,63,0.22)';
    ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
  }
}

function chapa(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  construible: boolean,
): void {
  ctx.fillStyle = construible ? 'rgba(61,50,32,0.92)' : 'rgba(20,17,13,0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = construible ? '#d9a441' : 'rgba(120,108,88,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Bajo una morada, qué criatura cría. Sirve construida y sin construir. */
function etiquetaMorada(
  ctx: CanvasRenderingContext2D,
  town: Town,
  plot: TownPlot,
  construida: boolean,
): void {
  const info = creature(creatureOfLevel(town, plot.level as number));
  const y = plot.y + plot.h - 16;
  ctx.fillStyle = 'rgba(10,8,6,0.75)';
  ctx.fillRect(plot.x + 6, y, plot.w - 12, 16);
  texto(
    ctx,
    `${info.name} · +${info.growth}/sem`,
    plot.x + plot.w / 2,
    y + 8,
    construida ? '#d9a441' : 'rgba(217,164,65,0.55)',
    '10px system-ui, sans-serif',
    plot.w - 14,
  );
}

// ------------------------------------------------------------- reclutamiento

function drawRecruitStrip(ctx: CanvasRenderingContext2D, view: TownView): void {
  const celdas = recruitCells(view.town);
  if (celdas.length === 0) {
    texto(ctx, 'Sin moradas construidas: pulsa un solar de la fila de abajo para levantar una.',
      TOWN_WIDTH / 2, STRIP_Y + STRIP_H / 2, '#a8977a', '14px system-ui, sans-serif', TOWN_WIDTH - 40);
    return;
  }
  for (const { plot, creature: id } of celdas) drawRecruitCell(ctx, view, plot, id);
}

function drawRecruitCell(
  ctx: CanvasRenderingContext2D,
  view: TownView,
  plot: TownPlot,
  creatureId: string,
): void {
  const info = creature(creatureId);
  const disponibles = view.town.available[creatureId] ?? 0;
  const x = plot.x;
  const y = STRIP_Y + 10;
  const w = plot.w;
  const h = CELL_H - 20;

  ctx.fillStyle = 'rgba(47,38,27,0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a3c2a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const sprite = asset('creatures', creatureId);
  if (sprite !== null) {
    const alto = h - 52;
    ctx.drawImage(sprite, x + (w - alto) / 2, y + 4, alto, alto);
  } else {
    ctx.fillStyle = '#6b5a44';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + (h - 48) / 2 + 4, w * 0.22, (h - 52) * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  texto(ctx, info.name, x + w / 2, y + h - 46, '#e8dcc4', 'bold 12px system-ui, sans-serif', w - 8);
  const oro = recruitCost(creatureId, 1).gold;
  texto(
    ctx,
    `${disponibles} disp. · ${oro} oro`,
    x + w / 2,
    y + h - 32,
    disponibles > 0 ? '#a8977a' : '#7a6a54',
    '10px system-ui, sans-serif',
    w - 8,
  );

  const hover = view.hover;
  const activo = view.interactive && disponibles > 0;
  for (const [i, etiqueta] of ['+1', 'Todo'].entries()) {
    const bx = x + 4 + i * ((w - 8) / 2);
    const bw = (w - 8) / 2 - 2;
    const by = y + h - 24;
    const señalado =
      hover !== null &&
      hover.kind === 'recruit' &&
      hover.creature === creatureId &&
      hover.all === (i === 1);
    ctx.fillStyle = activo && señalado ? '#3d3220' : 'rgba(36,29,21,0.9)';
    ctx.fillRect(bx, by, bw, 20);
    ctx.strokeStyle = activo ? (señalado ? '#d9a441' : '#4a3c2a') : 'rgba(74,60,42,0.5)';
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 19);
    texto(ctx, etiqueta, bx + bw / 2, by + 10, activo ? '#d9a441' : '#6b6152', 'bold 11px system-ui, sans-serif', bw);
  }
}

// -------------------------------------------------------------------- común

function texto(
  ctx: CanvasRenderingContext2D,
  s: string,
  cx: number,
  cy: number,
  color: string,
  font: string,
  maxWidth: number,
): void {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, cx, cy, maxWidth);
}

/**
 * Qué dice la barra de estado sobre lo que hay bajo el ratón.
 *
 * El motivo del rechazo sale de `buildBlocker`, que ya devuelve una frase
 * escrita para la persona: aquí no se reescribe ninguna regla.
 */
export function describeHit(town: Town, purse: Resources, hit: TownHit | null): string {
  if (hit === null) return '';

  if (hit.kind === 'recruit') {
    const info = creature(hit.creature);
    const disponibles = town.available[hit.creature] ?? 0;
    if (disponibles === 0) return `${info.name}: no queda ninguno esta semana.`;
    const cuantos = hit.all ? disponibles : 1;
    return `Reclutar ${cuantos} × ${info.name} — ${costLabel(recruitCost(hit.creature, cuantos))}`;
  }

  const plot = plotById(town.faction, hit.plot);
  const next = nextOf(town, plot);
  if (next === null) {
    const built = builtOf(town, plot);
    return built === null ? '' : `${building(built).name}: ya está al máximo.`;
  }
  const blocker = buildBlocker(town, next, purse);
  const b = building(next);
  return blocker === null
    ? `Construir ${b.name} — ${costLabel(b.cost)}`
    : `${b.name}: ${blocker}`;
}
