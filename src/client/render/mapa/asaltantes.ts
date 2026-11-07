/**
 * Los grupos sin dueño en el mapa: el asaltante que patrulla, deslizándose de la casilla
 * de ayer a la de hoy (`posicionDeAsaltante`), sobre su suelo morado y con su
 * estandarte, y lo que de él tapa un volumen, en silueta
 * (`pintarLoTapadoDeLosAsaltantes`); y la figura de un grupo neutral, la misma para el
 * monstruo que guarda (`figuraDeGrupoNeutral`). Era parte de `render/mapa/mapa.ts`
 * hasta la fase C de la reorganización (07-11-2026).
 */
import { individuosDe } from '@core/hero/troop.js';
import type { TerrainKind } from '@core/map/terrain.js';
import type { Point, VistaAsaltante } from '@core/types.js';
import { hojaDeUnidad } from '@core/unidad/catalogo.js';
import { type Direccion, direccionEnPantalla } from '../figuras/direccion.js';
import {
  animarHasta,
  type Figura,
  type FiguraColocada,
  pintarFiguraConSombra,
} from '../figuras/figura.js';
import { msPorCasilla } from '../figuras/marcha.js';
import { COLOR_SIN_DUEÑO } from '../palette.js';
import { mundoAPixel } from './camara.js';
import {
  type ColoresDeLoTapado,
  type GuardarLoTapado,
  type Matriz,
  type PintarEnLaMascara,
  pintarLoTapadoDeLaFigura,
} from './figura-tapada.js';
import type { AdventureScene, VistaMapa } from './mapa.js';

/**
 * El suelo y el estandarte de los asaltantes: la figura es del gris de lo que no
 * tiene dueño, igual que la de un monstruo, y lo que separa lo que embosca de lo
 * que guarda es esta mancha morada y el estandarte, no el tinte.
 */
const COLOR_ASALTANTE = '#8c3b8f';

/**
 * Lo que mide la figura de un grupo en el mapa, en casillas: con eso se dibuja y
 * con eso anda (`msPorCasilla`), así que su patrulla dura lo que tardan sus pies
 * en cruzar las casillas y no un plazo fijo —eran 900 ms fuera la patrulla de
 * una casilla o de tres—.
 */
export const ALTO_DEL_GRUPO = 0.85;

/**
 * La patrulla que se está viendo: de dónde a dónde va cada grupo y desde
 * cuándo. El núcleo mueve al grupo de golpe al empezar el día; quien desliza
 * la figura es el lienzo, recordando la última casilla en la que la pintó
 * mientras la siga pintando (`olvidarLosQueNoSePintan`).
 *
 * Por partida, con el array de terreno como llave: es lo único que no cambia en
 * toda una partida ni entre fotogramas del espectador (`adaptar.ts` lo conserva),
 * así que al empezar otra los `raider-0` de antes no se deslizan desde donde
 * estaban en la partida vieja.
 */
interface Marcha {
  desde: Point;
  hasta: Point;
  inicio: number;
  /** Lo que dura, en ms: las casillas de la recta al paso de su figura. */
  dura: number;
}

const marchas = new WeakMap<readonly TerrainKind[], Map<string, Marcha>>();

/** Dónde se pinta un grupo AHORA, si está andando, hacia dónde mira y cuándo llega. */
export interface PosicionDeAsaltante {
  readonly x: number;
  readonly y: number;
  readonly andando: boolean;
  readonly mira: Direccion;
  readonly hasta: number;
}

/** Dónde pintar un grupo AHORA, y si está andando. */
export function posicionDeAsaltante(
  escena: AdventureScene,
  r: VistaAsaltante,
  tiempo: number,
): PosicionDeAsaltante {
  let deLaPartida = marchas.get(escena.map.terrain);
  if (deLaPartida === undefined) {
    deLaPartida = new Map();
    marchas.set(escena.map.terrain, deLaPartida);
  }
  let m = deLaPartida.get(r.id);
  if (m === undefined) {
    m = { desde: r.at, hasta: r.at, inicio: Number.NEGATIVE_INFINITY, dura: 0 };
    deLaPartida.set(r.id, m);
  } else if (m.hasta.x !== r.at.x || m.hasta.y !== r.at.y) {
    // Se ha movido desde la última vez que se pintó: arranca desde donde se le
    // veía, aunque fuera a mitad de un deslizamiento anterior.
    const ahora = posicionEn(m, tiempo);
    m.desde = { x: ahora.x, y: ahora.y };
    m.hasta = r.at;
    m.inicio = tiempo;
    const largo = Math.hypot(m.hasta.x - m.desde.x, m.hasta.y - m.desde.y);
    m.dura = largo * msPorCasilla(figuraDelGrupo(r), 'walk', ALTO_DEL_GRUPO);
  }
  return { ...posicionEn(m, tiempo), hasta: m.inicio + m.dura };
}

/**
 * Olvida dónde se pintó cada grupo que este fotograma no pinta —salió de la
 * vista de quien juega o de la cámara—: el que vuelve aparece en su casilla, sin
 * deslizarse desde la última en la que se le vio, que puede ser de hace días.
 * Los grupos entran y salen de la vista (con su región desde #130; con el radio
 * de quien mira desde el 02-11-2026), y uno que reaparecía cruzaba media
 * pantalla andando desde un recuerdo (H3 de QA: el
 * grupo de la semilla 50 de `pnpm capturas` estaba a mitad de ese paseo cuando
 * se tomó la foto de «antes» de su patrulla).
 */
export function olvidarLosQueNoSePintan(
  escena: AdventureScene,
  pintados: ReadonlySet<string>,
): void {
  const deLaPartida = marchas.get(escena.map.terrain);
  if (deLaPartida === undefined) return;
  for (const id of deLaPartida.keys()) if (!pintados.has(id)) deLaPartida.delete(id);
}

function posicionEn(
  m: Marcha,
  tiempo: number,
): { x: number; y: number; andando: boolean; mira: Direccion } {
  const t = m.dura <= 0 ? 1 : Math.min(1, Math.max(0, (tiempo - m.inicio) / m.dura));
  return {
    x: m.desde.x + (m.hasta.x - m.desde.x) * t,
    y: m.desde.y + (m.hasta.y - m.desde.y) * t,
    andando: t < 1 && (m.desde.x !== m.hasta.x || m.desde.y !== m.hasta.y),
    // El mapa se ve de frente, sin aplastar: el vector en casillas ya es el de
    // pantalla. Quieto mira al suroeste, como el monstruo que guarda.
    mira: direccionEnPantalla(m.hasta.x - m.desde.x, m.hasta.y - m.desde.y, 'SO'),
  };
}

/**
 * Un grupo de asaltantes: la figura de su primera criatura en su color, sobre su
 * suelo morado, deslizándose de la casilla de ayer a la de hoy con el clip de
 * andar. La chapa y el estandarte van en `pintarIdentificador`.
 */
export function pintarAsaltante(
  ctx: CanvasRenderingContext2D,
  v: VistaMapa,
  r: VistaAsaltante,
  p: PosicionDeAsaltante,
): void {
  const tile = v.camara.tile;
  if (p.andando) animarHasta(p.hasta);
  const c = mundoAPixel(v.camara, p.x + 0.5, p.y + 0.5);
  const suelo = c.y + tile * 0.32;
  // El suelo RELLENO y no solo el aro discontinuo: con arte, un grupo de
  // piqueros es la misma figura gris que un monstruo de piqueros, y el aro solo
  // se perdía a zoom medio (H5). La mancha morada se lee de lejos.
  ctx.save();
  ctx.lineWidth = Math.max(2, tile * 0.04);
  ctx.fillStyle = `${COLOR_ASALTANTE}59`;
  ctx.strokeStyle = COLOR_ASALTANTE;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.ellipse(c.x, suelo, tile * 0.34, tile * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  pintarFiguraConSombra(ctx, figuraDelAsaltante(v, r, p));
}

/** La figura de un grupo de asaltantes donde se pinta ahora: la de `pintarAsaltante`. */
export function figuraDelAsaltante(
  v: VistaMapa,
  r: VistaAsaltante,
  p: PosicionDeAsaltante,
): Figura {
  return figuraDeGrupoNeutral(v.camara.tile, mundoAPixel(v.camara, p.x + 0.5, p.y + 0.5), {
    id: r.id,
    body: figuraDelGrupo(r),
    cuantos: individuosDe(r.troops),
    tiempo: v.tiempo,
    andando: p.andando,
    mira: p.mira,
  });
}

/**
 * El estandarte del asaltante: un mástil con un gallardete de cola partida y
 * dos espadas cruzadas. Es la marca que lo separa del monstruo **por la forma**
 * y no solo por el color —con arte la figura es la misma (H5)—, y es otra forma
 * que la bandera triangular de los dueños, para que no se lea como de nadie.
 */
export function estandarteDeAsaltante(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: number,
): void {
  const alto = tile * 0.62;
  const ancho = tile * 0.3;
  const paño = tile * 0.22;
  ctx.save();
  ctx.strokeStyle = '#2b2119';
  ctx.lineWidth = Math.max(1.5, tile * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + alto);
  ctx.stroke();
  ctx.fillStyle = COLOR_ASALTANTE;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ancho, y);
  ctx.lineTo(x + ancho * 0.7, y + paño / 2);
  ctx.lineTo(x + ancho, y + paño);
  ctx.lineTo(x, y + paño);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Las espadas: dos trazos blancos en aspa sobre el paño.
  const cx = x + ancho * 0.36;
  const cy = y + paño / 2;
  const r = paño * 0.32;
  ctx.strokeStyle = '#f4ecf6';
  ctx.lineWidth = Math.max(1.2, tile * 0.022);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx + r, cy - r);
  ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
  ctx.restore();
}

/** La figura de un grupo de asaltantes: la hoja de la unidad de su primer individuo. */
function figuraDelGrupo(r: VistaAsaltante): string {
  const id = r.troops[0]?.creature;
  if (id === undefined) throw new Error(`el grupo de asaltantes ${r.id} no tiene tropa`);
  return hojaDeUnidad(id);
}

/**
 * Un grupo sin dueño —monstruo que guarda o asaltante que patrulla—: la figura
 * de su criatura teñida del gris de lo que no tiene dueño, con su sombra. Los dos
 * se pintan igual a propósito: lo que los distingue es el suelo morado y el
 * estandarte del asaltante, no la figura. Y el gris es lo que los separa del
 * héroe, que lleva el color de su dueño.
 */
export function figuraDeGrupoNeutral(
  tile: number,
  c: { readonly x: number; readonly y: number },
  g: {
    readonly id: string;
    readonly body: string;
    readonly cuantos: number;
    readonly tiempo: number;
    readonly andando: boolean;
    readonly mira: Direccion;
  },
): Figura {
  return {
    id: g.id,
    body: g.body,
    clip: g.andando ? 'walk' : 'idle',
    tiempo: g.tiempo,
    x: c.x,
    suelo: c.y + tile * 0.32,
    alto: tile * ALTO_DEL_GRUPO,
    mira: g.mira,
    color: COLOR_SIN_DUEÑO,
    rotulo: String(g.cuantos),
  };
}

/**
 * Lo tapado de un grupo de asaltantes: la silueta morada con un contorno claro y
 * otro oscuro por fuera, que se lee sobre la roca, la nieve, la lava y de noche.
 */
const TAPADO_DEL_ASALTANTE: ColoresDeLoTapado = {
  contorno: '#e7a6ea',
  borde: 'rgba(24, 10, 26, 0.9)',
  relleno: 'rgba(140, 59, 143, 0.55)',
};

/**
 * Un grupo de asaltantes con algún volumen pintado después de él sobre su celda:
 * cómo se pintó y cómo se vuelve a pintar, en la máscara de lo tapado, lo que lo
 * puede tapar y las figuras que van delante.
 */
export interface AsaltanteTapado {
  readonly figura: FiguraColocada;
  readonly enPantalla: Matriz;
  readonly guardar: GuardarLoTapado | null;
  readonly pintarLoQueTapa: PintarEnLaMascara;
  readonly pintarLoDeDelante: PintarEnLaMascara | null;
}

/**
 * Lo tapado de cada grupo de asaltantes, en silueta y solo donde lo tapa un
 * volumen pintado después de él (`pintarLoTapadoDeLaFigura`): el grupo sin nada
 * delante se queda como se pintó, y lo que va delante del grupo (un héroe) no
 * queda debajo de la silueta. Un grupo anda por donde quiere y no lleva la
 * reserva de un monstruo, así que un pico de la fila de delante lo tapaba entero
 * y quedaban el estandarte y la chapa solos, sin figura: «me asaltaron unos
 * bandidos y no tenían arte» (06-11-2026; en s9 el grupo raider-0 (16,24), detrás
 * de una cordillera). Repintado encima a 0,7 con su arte, sobre la nieve y de
 * noche era una mancha rojiza (QA del mismo día).
 */
export function pintarLoTapadoDeLosAsaltantes(
  ctx: CanvasRenderingContext2D,
  tapados: readonly AsaltanteTapado[],
): void {
  for (const t of tapados)
    pintarLoTapadoDeLaFigura(
      ctx,
      t.figura,
      t.enPantalla,
      TAPADO_DEL_ASALTANTE,
      t.pintarLoQueTapa,
      t.pintarLoDeDelante,
      t.guardar,
    );
}
