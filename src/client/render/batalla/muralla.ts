/**
 * La muralla en el tablero de batalla, como geometría: lo que sube en pantalla quien
 * está en lo alto (`alturaDeColumna`, `tableroA`) y lo que pide el encuadre
 * (`alzadoDeLaMuralla`), la silueta de cada columna y cada portada, el orden de lo que se
 * levanta del suelo (`piezasEnOrden`) y lo que tapa a qué (`columnasQueTapan`,
 * `columnasTranslucidas`, `portadaBajo`, `convexosSeTocan`). Cómo se pinta, en
 * `muralla-pintada.ts`. Era parte de `render/batalla.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import { desplazamientoDeFila, hexEquals, hexKey, neighbours } from '@core/battle/board.js';
import { esMuro, hayMuralla, nivelDe } from '@core/battle/muralla.js';
import type {
  BattleStack,
  BattleState,
  MurallaDeBatalla,
  PuertaDeMuralla,
} from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { ALTO_DE_FILA, COMPRESION_SUELO, type Plano } from '../../../shared/arte.js';
import { ALTO_DE_MURALLA, PORTADA } from '../../../shared/muralla-de-batalla.js';
import { centroHex, planoDeHex, type Tablero, verticesHex } from '../proyeccion.js';
import type { EstadoFigura } from './tablero.js';

/** Lo que se pinta en la pasada ordenada por profundidad (`piezasEnOrden`). */
export type PiezaDelTablero =
  | { readonly kind: 'columna'; readonly hex: Hex }
  | { readonly kind: 'escalera'; readonly pie: Hex; readonly muro: Hex }
  | { readonly kind: 'caido'; readonly id: string }
  | { readonly kind: 'figura'; readonly id: string }
  | { readonly kind: 'portada'; readonly puerta: PuertaDeMuralla };

/**
 * Las columnas de la muralla, las portadas de sus puertas, las escaleras, los
 * caídos en lo alto y las figuras en pie, de atrás adelante: lo de delante tapa
 * lo de detrás. Una figura que pasa detrás de una columna queda tapada por ella,
 * y quien está en lo alto se pinta encima de la suya.
 *
 * A la misma fila: la columna, su escalera, el caído, la figura y, la última, la
 * portada: quien está en una de las dos casillas de la puerta pasa por debajo
 * del arco y el dintel se pinta encima de él (el usuario: «tapar con z index al
 * que pase por debajo, por ejemplo por la puerta»). Los caídos del suelo van antes, en la
 * pasada de las casillas; las barras y los nombres, después de todo esto.
 */
export function piezasEnOrden(
  battle: Pick<BattleState, 'muralla' | 'escaleras' | 'stacks'>,
  figura: (s: BattleStack) => Pick<EstadoFigura, 'en' | 'caida' | 'elevacion' | 'visible'>,
): PiezaDelTablero[] {
  const piezas: {
    readonly y: number;
    readonly orden: number;
    readonly p: PiezaDelTablero;
  }[] = [];
  for (const hex of battle.muralla.muros) {
    piezas.push({
      y: planoDeHex(hex).y,
      orden: 0,
      p: { kind: 'columna', hex },
    });
  }
  for (const e of battle.escaleras) {
    // A la fila de la más adelantada de sus dos casillas, y detrás de su columna:
    // con la fila del pie, la que se apoyaba desde detrás de su muro quedaba
    // tapada por la propia columna (QA de la muralla alta, M2).
    piezas.push({
      y: Math.max(planoDeHex(e.pie).y, planoDeHex(e.muro).y),
      orden: 1,
      p: { kind: 'escalera', pie: e.pie, muro: e.muro },
    });
  }
  for (const s of battle.stacks) {
    const f = figura(s);
    // En lo alto de una columna que linda por delante con una puerta, tras su
    // portada: el adarve sigue por lo alto de ella (`portadaDelAdarve`).
    const portada = f.elevacion >= 1 ? portadaDelAdarve(battle.muralla, f.en) : null;
    if (f.caida !== null && f.elevacion > 0) {
      piezas.push(
        portada === null
          ? { y: f.en.y, orden: 2, p: { kind: 'caido', id: s.id } }
          : { y: portada, orden: 5, p: { kind: 'caido', id: s.id } },
      );
    }
    if (f.visible) {
      piezas.push(
        portada === null
          ? { y: f.en.y, orden: 3, p: { kind: 'figura', id: s.id } }
          : { y: portada, orden: 6, p: { kind: 'figura', id: s.id } },
      );
    }
  }
  for (const puerta of battle.muralla.puertas) {
    piezas.push({
      y: planoDeHex(puerta.a).y,
      orden: 4,
      p: { kind: 'portada', puerta },
    });
  }
  piezas.sort((a, b) => a.y - b.y || a.orden - b.orden);
  return piezas.map((x) => x.p);
}

/**
 * La fila (en el plano) de la portada que tiene delante, pegada, la columna en
 * cuya tapa está `en`, o `null`. La portada con su arte lleva sus almenas a lo
 * ancho de lo alto, justo donde su adarve sigue al de la columna de detrás: con
 * la «Base derecha» de las ciudades, la columna de detrás de la puerta tenía los
 * pies y el aro de quien estaba en ella tapados por esas almenas, que se leían
 * como las de su propia columna (QA del arte de la muralla, 06-11-2026). Quien
 * está ahí se pinta tras la portada: de pie sobre el adarve. Una columna de
 * delante sí lo tapa (es profundidad), y no lleva almenas en la arista que
 * comparte con la suya (`daFuera`).
 */
function portadaDelAdarve(m: MurallaDeBatalla, en: Plano): number | null {
  if (m.puertas.length === 0) return null;
  const row = Math.round(en.y / ALTO_DE_FILA);
  const h = { col: Math.round(en.x - desplazamientoDeFila(row) * 0.5) + 0, row };
  if (!esMuro(m, h)) return null;
  const y = planoDeHex(h).y;
  const vecinas = neighbours(h);
  let fila: number | null = null;
  for (const p of m.puertas) {
    const py = planoDeHex(p.a).y;
    if (py <= y || !vecinas.some((v) => hexEquals(v, p.a) || hexEquals(v, p.b))) continue;
    fila = fila === null ? py : Math.max(fila, py);
  }
  return fila;
}

/** Un punto del lienzo, en píxeles. */
export interface Punto {
  readonly x: number;
  readonly y: number;
}

/**
 * Lo que tapa en pantalla la columna de `h`: el hex de su pie y el de su tapa, y
 * lo de en medio. Como sube en vertical, es un hexágono convexo: la punta y los
 * dos vértices de arriba de la tapa, y los tres de abajo del pie.
 */
export function siluetaDeColumna(t: Tablero, h: Hex): Punto[] {
  const v = verticesHex(t, h) as Punto[];
  const alto = alturaDeColumna(t);
  const arriba = (p: Punto): Punto => ({ x: p.x, y: p.y - alto });
  return [arriba(v[0]!), arriba(v[1]!), v[2]!, v[3]!, v[4]!, arriba(v[5]!)];
}

/** El pie del lado de la puerta, en el lienzo: el punto del suelo entre sus dos centros. */
export function pieDePortada(t: Tablero, p: PuertaDeMuralla): Punto {
  const a = centroHex(t, p.a);
  const b = centroHex(t, p.b);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Lo que tapa en pantalla la portada de `p`: la fachada del suelo a su tapa. Se
 * cuenta entera, con su arco: por él se ve poco, y una figura de detrás no queda
 * a la vista por el hueco.
 */
export function siluetaDePortada(t: Tablero, p: PuertaDeMuralla): Punto[] {
  const c = pieDePortada(t, p);
  const x0 = c.x - PORTADA.mitad * t.paso;
  const x1 = c.x + PORTADA.mitad * t.paso;
  const arriba = c.y - alturaDeColumna(t) - PORTADA.fondo * t.paso * t.compresion;
  return [
    { x: x0, y: arriba },
    { x: x1, y: arriba },
    { x: x1, y: c.y },
    { x: x0, y: c.y },
  ];
}

/** La clave de una portada en los conjuntos del lienzo (translúcidas, por elegir). */
export function claveDePortada(p: PuertaDeMuralla): string {
  return `puerta ${hexKey(p.a)}|${hexKey(p.b)}`;
}

/**
 * Lo alto de la muralla que tapa lo de detrás: cada columna (por su hex, clave
 * `hexKey`) y cada portada (`claveDePortada`), con su fila y su silueta.
 */
interface PiezaAlta {
  readonly clave: string;
  readonly y: number;
  readonly silueta: Punto[];
}

function piezasAltas(t: Tablero, m: MurallaDeBatalla): PiezaAlta[] {
  return [
    ...m.muros.map((h) => ({
      clave: hexKey(h),
      y: planoDeHex(h).y,
      silueta: siluetaDeColumna(t, h),
    })),
    ...m.puertas.map((p) => ({
      clave: claveDePortada(p),
      y: planoDeHex(p.a).y,
      silueta: siluetaDePortada(t, p),
    })),
  ];
}

/** ¿Cae `p` dentro del polígono convexo `poli` (en cualquier sentido de giro)? */
function dentroDelConvexo(p: Punto, poli: readonly Punto[]): boolean {
  let signo = 0;
  for (let i = 0; i < poli.length; i++) {
    const a = poli[i] as Punto;
    const b = poli[(i + 1) % poli.length] as Punto;
    const cruz = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cruz === 0) continue;
    if (signo === 0) signo = Math.sign(cruz);
    else if (Math.sign(cruz) !== signo) return false;
  }
  return true;
}

/**
 * Las columnas y portadas que se pintan delante de la casilla del suelo
 * `casilla` y le tapan algo: su centro, un punto a 0,6 de cada vértice o
 * cualquiera de `puntos` (el puntero). Delante es más abajo en el plano
 * (`piezasEnOrden`): las de su fila o de detrás no le caen encima. Por su clave:
 * `hexKey` la columna, `claveDePortada` la portada.
 */
export function columnasQueTapan(
  t: Tablero,
  m: MurallaDeBatalla,
  casilla: Hex,
  puntos: readonly Punto[] = [],
): string[] {
  const y = planoDeHex(casilla).y;
  const c = centroHex(t, casilla);
  const muestras = [
    c,
    ...verticesHex(t, casilla).map((v) => ({
      x: c.x + (v.x - c.x) * 0.6,
      y: c.y + (v.y - c.y) * 0.6,
    })),
    ...puntos,
  ];
  return piezasAltas(t, m)
    .filter((p) => p.y > y && muestras.some((q) => dentroDelConvexo(q, p.silueta)))
    .map((p) => p.clave);
}

/**
 * La puerta cuya portada —entera, del pie a lo alto— cae bajo `p`, o `null`. Si
 * caen dos, la de delante, que es la que se ve. Es el clic que elige puerta
 * (`puertaPorElegir`), como lo alto de una columna elige el muro de la escala.
 */
export function portadaBajo(t: Tablero, m: MurallaDeBatalla, p: Punto): PuertaDeMuralla | null {
  let mejor: PuertaDeMuralla | null = null;
  for (const q of m.puertas) {
    if (!dentroDelConvexo(p, siluetaDePortada(t, q))) continue;
    if (mejor === null || planoDeHex(q.a).y > planoDeHex(mejor.a).y) mejor = q;
  }
  return mejor;
}

/**
 * Las columnas y portadas que se pintan translúcidas (ampliación 2, (a)): las
 * que tapan la casilla del suelo bajo el puntero (`hoverHex`, con el propio
 * puntero) y la casilla elegida del ángulo de un golpe. La casilla bajo el
 * puntero ya es la del suelo cuando el puntero pisa la cara de una columna
 * (`hexBajo` mira solo su tapa), así que lo que se ve a través es lo que pulsa
 * el clic. Un muro bajo el puntero —su tapa— no vuelve a nadie translúcido: es
 * lo que se señala.
 */
export function columnasTranslucidas(
  t: Tablero,
  m: MurallaDeBatalla,
  hoverHex: Hex | null,
  elegida: Hex | null,
  puntero: Punto | null,
): ReadonlySet<string> {
  const fuera = new Set<string>();
  if (!hayMuralla(m)) return fuera;
  const mirar = (h: Hex | null, puntos: readonly Punto[]): void => {
    if (h === null || nivelDe(m, h) === 1) return;
    for (const c of columnasQueTapan(t, m, h, puntos)) fuera.add(c);
  };
  mirar(hoverHex, puntero === null ? [] : [puntero]);
  mirar(elegida, []);
  return fuera;
}

/**
 * ¿Se solapan dos polígonos convexos? Separación por ejes: si en la normal de
 * algún lado sus sombras no se pisan, no se tocan. Tocarse en un borde no cuenta.
 */
export function convexosSeTocan(a: readonly Punto[], b: readonly Punto[]): boolean {
  for (const poli of [a, b]) {
    for (let i = 0; i < poli.length; i++) {
      const p = poli[i] as Punto;
      const q = poli[(i + 1) % poli.length] as Punto;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const sombra = (ps: readonly Punto[]): [number, number] => {
        let min = Infinity;
        let max = -Infinity;
        for (const r of ps) {
          const d = r.x * nx + r.y * ny;
          min = Math.min(min, d);
          max = Math.max(max, d);
        }
        return [min, max];
      };
      const [amin, amax] = sombra(a);
      const [bmin, bmax] = sombra(b);
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
}

/**
 * Los pasos que el tablero pide de más encima de su fila de atrás para que lo
 * alto de la muralla —la columna, la portada y la figura de encima— no se salga
 * del lienzo (`tableroPara`, `altoConAlzado`). Cada pieza pide lo que su
 * columna sube por encima de la fila de atrás, con la cámara más baja, que es
 * donde las filas están más juntas. Sin muralla, 0: el encuadre de siempre.
 */
export function alzadoDeLaMuralla(m: MurallaDeBatalla): number {
  let alzado = 0;
  const alto = ALTO_DE_MURALLA + PORTADA.fondo * COMPRESION_SUELO;
  for (const h of m.muros) {
    alzado = Math.max(alzado, ALTO_DE_MURALLA - planoDeHex(h).y * COMPRESION_SUELO);
  }
  for (const p of m.puertas) {
    alzado = Math.max(alzado, alto - planoDeHex(p.a).y * COMPRESION_SUELO);
  }
  return alzado;
}

/** Lo que sube en pantalla quien está en lo alto (elevación 1), en píxeles. */
export function alturaDeColumna(t: Tablero): number {
  return t.paso * ALTO_DE_MURALLA;
}

/**
 * El tablero de lo que está a `elevacion` (0 en el suelo, 1 en lo alto de un
 * muro, y lo de en medio al subir): el mismo, subido `alturaDeColumna`. LA
 * forma de subir en pantalla: la leen la figura (`cajaDeFigura`), los efectos y
 * el clic sobre las columnas (`batalla/escena.ts`).
 */
export function tableroA(t: Tablero, elevacion: number): Tablero {
  return elevacion === 0 ? t : { ...t, origenY: t.origenY - elevacion * alturaDeColumna(t) };
}
