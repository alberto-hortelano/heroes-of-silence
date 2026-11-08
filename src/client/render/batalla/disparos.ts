/**
 * Lo que se tira a distancia, en el suelo del tablero de batalla: los disparos
 * diferidos apuntados y el que se tantea (`pintarDisparos`: la recta, cada casilla del
 * alcance teñida por la tirada, la diana y a quién da hoy) y las granadas en el aire y
 * la que se tantea (`pintarGranadas`, con el borde de su explosión,
 * `bordeDeLasCasillas`), de los dos bandos y en el espectador. Era parte de
 * `render/batalla.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import {
  type CasillaDelAlcance,
  type ExplosionDeLaGranada,
  explosionDe,
  type LineaDelDisparo,
  lineaDelDisparo,
} from '@core/battle/a-distancia.js';
import { hexEquals, indiceDe } from '@core/battle/board.js';
import { activeStack, isAlive } from '@core/battle/consultas.js';
import type { BattleState, Side } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import type { Plano } from '../../../shared/arte.js';
import { centroHex, type Tablero, verticesHex } from '../proyeccion.js';
import { colorDelBando } from './bandos.js';
import { type CasillaPintada, hexesDe } from './casillas.js';
import type { VistaBatalla } from './tablero.js';

/** Una recta del disparo diferido que se pinta, de qué bando y si se tantea. */
/**
 * El color de cada cuarto de la tirada del disparo diferido (`cuartoDelDisparo`),
 * del 0, la mínima, al 4, la máxima: el calor del cruce de la rueda
 * (`--info-calor-*` de `style.css`), que el lienzo no lee de la hoja.
 */
const CALOR_DEL_DISPARO: readonly string[] = [
  '#86aed0',
  '#9fc49a',
  '#cbb780',
  '#e8975f',
  '#f2593a',
];

interface LineaPintada {
  readonly l: LineaDelDisparo;
  readonly side: Side;
  readonly tanteo: boolean;
}

/**
 * Las rectas de lo apuntado (`BattleStack.apuntado`) en `battle`, recordadas por la
 * batalla y lo largo de su registro: solo cambian con una jugada, y se pintan en
 * cada fotograma.
 */
function lineasApuntadas(
  battle: BattleState,
  apuntados: ReadonlyMap<string, Hex>,
): readonly LineaPintada[] {
  const clave = [...apuntados].map(([id, h]) => `${id}@${h.col},${h.row}`).join('|');
  const r = rectasApuntadas;
  if (r !== null && r.battle === battle && r.largo === battle.log.length && r.clave === clave) {
    return r.lineas;
  }
  const lineas = battle.stacks.flatMap((s): LineaPintada[] => {
    const at = apuntados.get(s.id);
    return !isAlive(s) || at === undefined
      ? []
      : [{ l: lineaDelDisparo(battle, s, at), side: s.side, tanteo: false }];
  });
  rectasApuntadas = { battle, largo: battle.log.length, clave, lineas };
  return lineas;
}

let rectasApuntadas: {
  readonly battle: BattleState;
  readonly largo: number;
  readonly clave: string;
  readonly lineas: readonly LineaPintada[];
} | null = null;

/**
 * Los disparos diferidos en el suelo (25-10-2026): de cada tirador con algo
 * apuntado (`BattleStack.apuntado`), cada casilla en que daría teñida por el daño
 * que haría ahí (01-11-2026, petición del usuario: «un gradiente de color de más a
 * menos daño»), la recta de hoy hasta donde llega
 * (`lineaDelDisparo`, la regla del núcleo), en el color de su bando y a trazos, la
 * casilla apuntada con su diana y, si da a alguien, su casilla en rojo. El que se
 * tantea con el puntero (`VistaBatalla.tanteo`), igual y más tenue. Lo que no
 * llega va en gris: tras el alcanzado, hasta el borde (la recta sigue tras la
 * casilla apuntada, 01-11-2026); tras un muro o una puerta, hasta la casilla.
 */
export function pintarDisparos(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  const lineas: LineaPintada[] = [...lineasApuntadas(battle, v.apuntados)];
  const activa = activeStack(battle);
  if (v.tanteo !== null && activa !== null) {
    lineas.push({ l: v.tanteo, side: activa.side, tanteo: true });
  }
  if (lineas.length === 0) return;
  const casillas = hexesDe(tablero);
  const grueso = gruesoDelTiro(tablero);
  ctx.save();
  for (const { l, side, tanteo } of lineas) {
    const color = colorDelBando(v, side);
    ctx.globalAlpha = tanteo ? 0.55 : 0.9;
    // Todas las casillas en que daría, del frío de la tirada mínima al rojo de la
    // máxima (`LineaDelDisparo.alcance`): al salir el disparo ya se habrán movido.
    teñirElAlcance(ctx, casillas, l.alcance, tanteo);
    const desde = centroHex(tablero, l.desde);
    const hasta = centroHex(tablero, l.at);
    // Todo va por la recta exacta de los dos centros (la del núcleo): una casilla se
    // marca en ella por el pie de su centro, no por su centro, que puede quedar a un lado.
    const ux = hasta.x - desde.x;
    const uy = hasta.y - desde.y;
    const sobreLaRecta = (h: Hex): { x: number; y: number } => {
      const c = centroHex(tablero, h);
      const t = ((c.x - desde.x) * ux + (c.y - desde.y) * uy) / (ux * ux + uy * uy);
      return { x: desde.x + t * ux, y: desde.y + t * uy };
    };
    const ultima = l.casillas.at(-1);
    const corte = ultima === undefined ? desde : sobreLaRecta(ultima);
    // Hasta dónde seguiría sin nadie: el borde, o la casilla si algo para la recta antes.
    const final = l.alcance.at(-1)?.hex;
    const pasaLaCasilla = l.alcance.some((c) => hexEquals(c.hex, l.at));
    const fin = final !== undefined && pasaLaCasilla ? sobreLaRecta(final) : hasta;
    ctx.lineCap = 'round';
    // Hasta donde llega, del color del bando sobre un filo oscuro (sobre el suelo
    // claro, sola, se perdía); de ahí a donde acabaría, en gris.
    ctx.beginPath();
    ctx.moveTo(desde.x, desde.y);
    ctx.lineTo(corte.x, corte.y);
    ctx.lineWidth = grueso + 2;
    ctx.strokeStyle = '#0000008c';
    ctx.stroke();
    ctx.setLineDash([grueso * 3, grueso * 2]);
    ctx.lineWidth = grueso;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (ultima === undefined || l.alcanzado !== null || l.parada !== null) {
      ctx.strokeStyle = '#d8d0c088';
      ctx.lineWidth = grueso * 0.7;
      ctx.beginPath();
      ctx.moveTo(corte.x, corte.y);
      ctx.lineTo(fin.x, fin.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // La diana en la casilla apuntada.
    pintarDiana(ctx, tablero, hasta, color, grueso);
    // A quién da hoy, en rojo.
    if (l.alcanzado !== null) marcarAlcanzado(ctx, casillas, l.alcanzado.hex, grueso);
  }
  ctx.restore();
}

/** El grueso de las líneas de un disparo o una granada en el suelo. */
function gruesoDelTiro(tablero: Tablero): number {
  return Math.max(2.5, tablero.paso * 0.045);
}

/**
 * Tiñe cada casilla del alcance de un disparo o una granada por la tirada que daría
 * ahí, del frío del cuarto 0 al rojo del 4 (`CALOR_DEL_DISPARO`); más tenue si se tantea.
 */
function teñirElAlcance(
  ctx: CanvasRenderingContext2D,
  casillas: readonly CasillaPintada[],
  alcance: readonly CasillaDelAlcance[],
  tanteo: boolean,
): void {
  for (const { hex, cuarto } of alcance) {
    ctx.fillStyle = `${CALOR_DEL_DISPARO[cuarto] as string}${tanteo ? '55' : '80'}`;
    ctx.fill((casillas[indiceDe(hex)] as CasillaPintada).camino);
  }
}

/**
 * La diana de la casilla a la que se apunta o se lanza, centrada en `c`. Con
 * `contorno`, el color va sobre un trazo claro y este sobre un filo oscuro: la de la
 * granada cae en el centro de su explosión, teñido del rojo del cuarto 4, y la del
 * bando rojo se perdía en él (H2 del QA de las granadas, 02-11-2026). La del disparo
 * no lo lleva: su casilla no siempre va teñida y se leía bien.
 */
function pintarDiana(
  ctx: CanvasRenderingContext2D,
  tablero: Tablero,
  c: { readonly x: number; readonly y: number },
  color: string,
  grueso: number,
  contorno = false,
): void {
  const r = tablero.paso * 0.28;
  const diana = new Path2D();
  diana.ellipse(c.x, c.y, r, r * tablero.compresion, 0, 0, Math.PI * 2);
  diana.moveTo(c.x - r * 1.3, c.y);
  diana.lineTo(c.x + r * 1.3, c.y);
  diana.moveTo(c.x, c.y - r * 1.3 * tablero.compresion);
  diana.lineTo(c.x, c.y + r * 1.3 * tablero.compresion);
  if (contorno) {
    ctx.lineCap = 'round';
    ctx.lineWidth = grueso + 4;
    ctx.strokeStyle = FILO_OSCURO;
    ctx.stroke(diana);
    ctx.lineWidth = grueso + 2;
    ctx.strokeStyle = TRAZO_CLARO;
    ctx.stroke(diana);
  }
  ctx.lineWidth = grueso;
  ctx.strokeStyle = color;
  ctx.stroke(diana);
}

/** Bajo el color de la diana y del borde de una granada: el filo y el trazo claro. */
const FILO_OSCURO = '#000000b3';

const TRAZO_CLARO = '#f3ead6';

/**
 * El borde de fuera de un grupo de casillas (la explosión de una granada): los lados
 * de cada una que no comparte con otra del grupo, como pares de vértices. Dos
 * vecinas comparten sus dos vértices, calculados desde centros distintos: se casan
 * por su posición redondeada a la centésima de píxel.
 */
export function bordeDeLasCasillas(
  tablero: Tablero,
  hexes: readonly Hex[],
): readonly (readonly [Plano, Plano])[] {
  const clave = (p: Plano): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const lados = new Map<string, { lado: readonly [Plano, Plano]; veces: number }>();
  for (const h of hexes) {
    const v = verticesHex(tablero, h);
    for (const [i, a] of v.entries()) {
      const b = v[(i + 1) % v.length] as Plano;
      const k = [clave(a), clave(b)].sort().join('|');
      const hecho = lados.get(k);
      if (hecho === undefined) lados.set(k, { lado: [a, b], veces: 1 });
      else hecho.veces++;
    }
  }
  return [...lados.values()].flatMap(({ lado, veces }) => (veces === 1 ? [lado] : []));
}

/** La casilla de a quién daría hoy, en rojo. */
function marcarAlcanzado(
  ctx: CanvasRenderingContext2D,
  casillas: readonly CasillaPintada[],
  hex: Hex,
  grueso: number,
): void {
  ctx.lineWidth = grueso * 1.3;
  ctx.strokeStyle = '#ff5a3c';
  ctx.stroke((casillas[indiceDe(hex)] as CasillaPintada).camino);
}

/**
 * Las granadas en el suelo (02-11-2026): de cada una en el aire (`BattleStack.granada`,
 * al ritmo de la cola) y de la que se tantea, cada casilla que alcanza su explosión
 * (`explosionDe`, la regla del núcleo) teñida por la tirada que daría ahí, como el
 * disparo, con su borde de fuera continuo del color de su bando, y la diana con su
 * contorno en la casilla; en la que se tantea, en rojo quien está hoy en ellas. Para
 * los dos bandos y el espectador.
 */
export function pintarGranadas(ctx: CanvasRenderingContext2D, v: VistaBatalla): void {
  const { battle, tablero } = v;
  const pendientes: { e: ExplosionDeLaGranada; side: Side; tanteo: boolean }[] = [];
  for (const s of battle.stacks) {
    const at = v.granadas.get(s.id);
    if (at !== undefined && isAlive(s)) {
      pendientes.push({ e: explosionDe(battle, at), side: s.side, tanteo: false });
    }
  }
  const activa = activeStack(battle);
  if (v.granadaTanteada !== null && activa !== null) {
    pendientes.push({ e: v.granadaTanteada, side: activa.side, tanteo: true });
  }
  if (pendientes.length === 0) return;
  const casillas = hexesDe(tablero);
  const grueso = gruesoDelTiro(tablero);
  ctx.save();
  // Primero el teñido de todas y después los bordes y las dianas: pintando cada una
  // entera, el teñido de la segunda tapaba la diana y el borde de la primera cuando
  // se solapaban (H5 del QA de las granadas, 02-11-2026).
  for (const { e, tanteo } of pendientes) {
    ctx.globalAlpha = tanteo ? 0.55 : 0.9;
    teñirElAlcance(ctx, casillas, e.casillas, tanteo);
  }
  for (const { e, side, tanteo } of pendientes) {
    const color = colorDelBando(v, side);
    ctx.globalAlpha = tanteo ? 0.55 : 0.9;
    // El borde de la explosión, entero y continuo, del color de su bando sobre un
    // filo oscuro: a trazos, casilla a casilla, se confundía con la recta teñida de
    // un disparo que pasaba al lado (H2 del QA de las granadas, 02-11-2026).
    const borde = new Path2D();
    for (const [a, b] of bordeDeLasCasillas(
      tablero,
      e.casillas.map((c) => c.hex),
    )) {
      borde.moveTo(a.x, a.y);
      borde.lineTo(b.x, b.y);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = grueso + 2;
    ctx.strokeStyle = FILO_OSCURO;
    ctx.stroke(borde);
    ctx.lineWidth = grueso;
    ctx.strokeStyle = color;
    ctx.stroke(borde);
    pintarDiana(ctx, tablero, centroHex(tablero, e.at), color, grueso, true);
    // A quién da hoy (solo en la que se tantea: las del aire, al explotar).
    if (tanteo)
      for (const { stack } of e.alcanzados) marcarAlcanzado(ctx, casillas, stack.hex, grueso);
  }
  ctx.restore();
}
