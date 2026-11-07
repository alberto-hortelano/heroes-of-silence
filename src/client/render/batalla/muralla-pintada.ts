/**
 * Cómo se pinta la muralla del tablero de batalla: las columnas (`pintarColumna`), las
 * portadas de sus puertas, abiertas o cerradas (`pintarPortada`), los umbrales en el
 * suelo, las escaleras puestas y lo que se ve a trasluz por lo que lo tapa
 * (`aTrasluz`). Con su arte (`arte-de-la-muralla.ts`) o, sin él, con el marcador de su
 * material (`ACABADO_DEL_MURO`: la piedra en hiladas, la madera en estacas). Era parte
 * de `render/batalla.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import { desplazamientoDeFila, hexKey } from '@core/battle/board.js';
import type { EstadoDePuerta, MaterialDeMuralla, PuertaDeMuralla } from '@core/battle/types.js';
import { hashDeTexto } from '@core/rng.js';
import type { Hex } from '@core/types.js';
import { ESCALERA, PORTADA } from '../../../shared/muralla-de-batalla.js';
import { centroHex, planoDeHex, type Tablero, verticesHex } from '../proyeccion.js';
import {
  type CaraConArte,
  pintarCaraConArte,
  pintarEscaleraConArte,
  pintarPortadaConArte,
  pintarRemateConArte,
  rellenoDeLaTapa,
} from './arte-de-la-muralla.js';
import type { EstiloDeCasilla } from './casillas.js';
import { alturaDeColumna, convexosSeTocan, type Punto, pieDePortada } from './muralla.js';

/** Los colores de una columna o una portada: la cara de la luz (este), la de la sombra y lo alto. */
interface ColoresDelMuro {
  readonly luz: string;
  readonly sombra: string;
  readonly arriba: string;
  readonly junta: string;
  readonly borde: string;
}

/** Cómo se pinta un muro de un material: sus colores y sus juntas (`pintarSillares`). */
interface AcabadoDelMuro {
  readonly colores: ColoresDelMuro;
  /** Hiladas de sillares a tresbolillo, o estacas de una empalizada. */
  readonly juntas: 'hiladas' | 'estacas';
}

/**
 * Cada material, con su acabado (fase 2 del puesto fronterizo, 04-11-2026): la
 * piedra de las ciudades y la arena, en hiladas de sillares, y la madera de la
 * empalizada de los pueblos, en estacas. Se resuelve una vez por batalla
 * (`drawBatalla`) y lo reciben la columna, la portada y sus juntas.
 */
export const ACABADO_DEL_MURO: Readonly<Record<MaterialDeMuralla, AcabadoDelMuro>> = {
  piedra: {
    colores: {
      luz: '#9b958a',
      sombra: '#706b62',
      arriba: '#aaa498',
      junta: '#55514a',
      borde: '#2f2c28',
    },
    juntas: 'hiladas',
  },
  madera: {
    colores: {
      luz: '#8a6236',
      sombra: '#5e4123',
      arriba: '#9c7444',
      junta: '#3e2a15',
      borde: '#24170b',
    },
    juntas: 'estacas',
  },
};

/**
 * El lado de cada puerta en el suelo, entre sus dos casillas: cerrada, un
 * tablón oscuro de madera de vértice a vértice; abierta, el umbral de piedra
 * clara. Las dos casillas se pintan como cualquier suelo (se pisan las dos); esto
 * dice por dónde va la puerta aunque la tape su portada.
 */
export function pintarUmbrales(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  puertas: readonly EstadoDePuerta[],
): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of puertas) {
    // El lado este de `a`: sus vértices 1 (arriba a la derecha) y 2 (abajo a la derecha).
    const v = verticesHex(t, p.a);
    const arriba = v[1] as Punto;
    const abajo = v[2] as Punto;
    for (const [color, grueso] of p.abierta
      ? ([
          ['#4a443b', 0.16],
          ['#b9ad96', 0.1],
        ] as const)
      : ([
          [HOJA.oscura, 0.2],
          [HOJA.madera, 0.13],
        ] as const)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, t.paso * grueso);
      ctx.beginPath();
      ctx.moveTo(arriba.x, arriba.y);
      ctx.lineTo(abajo.x, abajo.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * El arte de la muralla de una batalla, resuelto una vez por fotograma
 * (`drawBatalla`): el material, su cara pintada si ha llegado y qué casillas son
 * muro (el remate va solo en las caras que dan fuera de la muralla).
 */
export interface ArteDelMuro {
  readonly material: MaterialDeMuralla;
  readonly cara: CaraConArte | null;
  readonly muros: ReadonlySet<string>;
}

/**
 * Las aristas de una columna con su arte, por los vértices de su hex (punta
 * arriba y en el sentido de las agujas: 0 arriba, 2 abajo a la derecha, 3 abajo,
 * 4 abajo a la izquierda), de izquierda a derecha como se ven, y la casilla
 * vecina al otro lado (columnas y filas en el plano, `planoDeHex`): las dos de
 * delante con su cara, la del suroeste a la luz y la del sureste a la sombra
 * (la luz viene de la izquierda, `ARTE.luz`), y las dos de atrás, con solo su
 * remate. Las del este y el oeste van de canto a esta cámara.
 */
const ARISTAS_DE_LA_COLUMNA = [
  { de: 5, a: 0, dx: -0.5, dy: -1, delante: false, sombra: false },
  { de: 0, a: 1, dx: 0.5, dy: -1, delante: false, sombra: false },
  { de: 4, a: 3, dx: -0.5, dy: 1, delante: true, sombra: false },
  { de: 3, a: 2, dx: 0.5, dy: 1, delante: true, sombra: true },
] as const;

/** ¿Da fuera de la muralla la arista de `h` hacia (`dx`, `dy` filas)? Si al otro lado no hay muro. */
function daFuera(m: ReadonlySet<string>, h: Hex, dx: number, dy: number): boolean {
  const row = h.row + dy;
  const x = planoDeHex(h).x + dx;
  const col = Math.round(x - desplazamientoDeFila(row) * 0.5);
  return !m.has(hexKey({ col, row }));
}

/**
 * Un muro, como columna: el hex subido `alturaDeColumna` es lo alto, donde se
 * pisa —y donde se pinta la marca de la casilla (`estilo`): movible, atacable,
 * la de la activa—, y las dos caras de delante. Las de los lados del hexágono
 * van de canto a esta cámara y no se ven. Lo alto es el `camino` de su casilla
 * en el suelo (`hexesDe`), trasladado. `escalable`, si la activa puede poner su
 * escalera o subir ahí.
 *
 * Con su arte (`arte.cara`), cada cara lleva una rodaja del lienzo de muro
 * pintado, la tapa su adarve y cada arista que da fuera su remate (las de atrás
 * antes de la tapa, las de delante encima); sin él, el marcador: las caras de
 * un color con sus hiladas o sus estacas (`pintarSillares`).
 */
export function pintarColumna(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  h: Hex,
  camino: Path2D,
  estilo: EstiloDeCasilla,
  escalable: boolean,
  acabado: AcabadoDelMuro,
  arte: ArteDelMuro,
): void {
  const alto = alturaDeColumna(t);
  const { colores } = acabado;
  const v = verticesHex(t, h);
  const arriba = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - alto });
  const { cara } = arte;
  const rodaja = (de: number) => hashDeTexto(`${hexKey(h)}|${de}`);
  ctx.save();
  ctx.lineJoin = 'round';
  if (cara !== null) {
    for (const e of ARISTAS_DE_LA_COLUMNA) {
      const a = v[e.de] as { x: number; y: number };
      const b = v[e.a] as { x: number; y: number };
      if (e.delante) {
        pintarCaraConArte(ctx, t, cara, a, b, alto, rodaja(e.de), e.sombra);
        ctx.strokeStyle = 'rgba(20, 16, 12, 0.45)';
        ctx.lineWidth = Math.max(1, t.paso * 0.012);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x, a.y - alto);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x, b.y - alto);
        ctx.stroke();
      } else if (daFuera(arte.muros, h, e.dx, e.dy)) {
        pintarRemateConArte(ctx, t, cara, arriba(a), arriba(b), rodaja(e.de), true, false);
      }
    }
  } else {
    for (const [i, j, color] of [
      [3, 4, colores.sombra],
      [2, 3, colores.luz],
    ] as const) {
      const a = v[i] as { x: number; y: number };
      const b = v[j] as { x: number; y: number };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - alto);
      ctx.lineTo(a.x, a.y - alto);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      pintarSillares(ctx, t, a, b, alto, acabado);
    }
  }
  ctx.translate(0, -alto);
  const tapa = camino;
  ctx.fillStyle = (cara !== null ? rellenoDeLaTapa(ctx, t, arte.material) : null) ?? colores.arriba;
  ctx.fill(tapa);
  ctx.lineWidth = Math.max(2, t.paso * (cara !== null ? 0.03 : 0.045));
  ctx.strokeStyle = colores.borde;
  ctx.stroke(tapa);
  // La marca de la casilla, encima de la piedra: lo que el suelo diría de ella.
  ctx.fillStyle = estilo.relleno;
  ctx.fill(tapa);
  ctx.lineWidth = estilo.ancho;
  ctx.strokeStyle = estilo.trazo;
  ctx.stroke(tapa);
  if (escalable) {
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd24a';
    ctx.stroke(tapa);
    ctx.setLineDash([]);
  }
  // El remate de las caras de delante que dan fuera, encima de lo alto: el
  // lienzo ya está subido, así que la arista de lo alto es la del hex.
  if (cara !== null) {
    for (const e of ARISTAS_DE_LA_COLUMNA) {
      if (!e.delante || !daFuera(arte.muros, h, e.dx, e.dy)) continue;
      const a = v[e.de] as { x: number; y: number };
      const b = v[e.a] as { x: number; y: number };
      pintarRemateConArte(ctx, t, cara, a, b, rodaja(e.de), false, e.sombra);
    }
  }
  ctx.restore();
}

/**
 * Las hiladas de una cara de piedra de `a` a `b` (sus pies) y `alto` de alto: una
 * cada `HILADA` pasos, con las juntas verticales a tresbolillo, y el borde. En
 * madera, estacas: las juntas solo en vertical, una cada `ESTACA` pasos.
 */
function pintarSillares(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  alto: number,
  { colores, juntas }: AcabadoDelMuro,
): void {
  ctx.strokeStyle = colores.junta;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.beginPath();
  if (juntas === 'estacas') {
    const estacas = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / (t.paso * ESTACA)));
    for (let i = 1; i < estacas; i++) {
      const u = i / estacas;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - alto);
    }
  } else {
    const hiladas = Math.max(2, Math.round(alto / (t.paso * HILADA)));
    for (let i = 1; i < hiladas; i++) {
      const f = i / hiladas;
      ctx.moveTo(a.x, a.y - alto * f);
      ctx.lineTo(b.x, b.y - alto * f);
    }
    for (let i = 0; i < hiladas; i++) {
      const g = i % 2 === 0 ? 0.5 : 0.25;
      for (const u of g === 0.5 ? [0.5] : [0.25, 0.75]) {
        const x = a.x + (b.x - a.x) * u;
        const y = a.y + (b.y - a.y) * u;
        ctx.moveTo(x, y - (alto * i) / hiladas);
        ctx.lineTo(x, y - (alto * (i + 1)) / hiladas);
      }
    }
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y - alto);
  ctx.lineTo(a.x, a.y - alto);
  ctx.closePath();
  ctx.strokeStyle = colores.borde;
  ctx.lineWidth = Math.max(1.5, t.paso * 0.03);
  ctx.stroke();
}

/** Lo que mide una hilada de sillares, en pasos. */
const HILADA = 0.28;

/** Lo que mide de ancho una estaca de la empalizada, en pasos. */
const ESTACA = 0.14;

/**
 * El hueco del arco de la portada de `p`, en el lienzo: de una jamba a la otra
 * por la clave y, `cerrado`, también por el suelo.
 */
function huecoDePortada(t: Tablero, p: PuertaDeMuralla, cerrado = true): Path2D {
  const c = pieDePortada(t, p);
  const izq = c.x - PORTADA.hueco * t.paso;
  const der = c.x + PORTADA.hueco * t.paso;
  const clave = c.y - PORTADA.arco * t.paso;
  const arranque = clave + PORTADA.flecha * t.paso;
  const hueco = new Path2D();
  hueco.moveTo(izq, c.y);
  hueco.lineTo(izq, arranque);
  hueco.ellipse(c.x, arranque, der - c.x, arranque - clave, 0, Math.PI, 0);
  hueco.lineTo(der, c.y);
  if (cerrado) hueco.closePath();
  return hueco;
}

/**
 * La portada de `p` a trasluz por lo que la tapa (`aTrasluz`): la misma, tenue, y
 * el contorno claro de su arco encima, que es lo que dice «aquí hay una puerta»
 * cuando la piedra de detrás se confunde con la de delante: cerrada, con la
 * madera de sus hojas dentro; abierta, vacío.
 */
export function pintarPortadaATrasluz(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  p: PuertaDeMuralla,
  pintar: () => void,
): void {
  pintar();
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1.5, t.paso * 0.022);
  ctx.strokeStyle = CONTORNO_A_TRASLUZ;
  ctx.stroke(huecoDePortada(t, p, false));
  ctx.restore();
}

/** El trazo claro de lo que se ve a trasluz: el arco de una puerta tapada. */
const CONTORNO_A_TRASLUZ = '#f0dcb4';

/**
 * La portada de una puerta: una fachada de piedra de cara a la cámara, tan alta
 * como la muralla, levantada sobre el lado de sus dos casillas (`PORTADA`), con
 * un arco ancho abajo por el que pasa quien está en cualquiera de las dos.
 * **Cerrada**, en medio del arco, sobre el lado, las dos hojas juntas: un
 * tablero de madera con herrajes, de canto a esta cámara, que se lee como
 * «aquí no se pasa». **Abierta**, el medio queda libre y las hojas, abatidas,
 * asoman contra las jambas. Se pinta después de quien está en su fila
 * (`piezasEnOrden`): jambas y dintel le pasan por delante. Por arriba no se
 * anda. `elegible`, si el botón de la puerta espera que se elija esta: se marca
 * el arco.
 *
 * Con su arte (`pintarPortadaConArte`), la fachada pintada de su `material`,
 * abierta (con el paso recortado: se ve a quien pasa) o cerrada (las hojas
 * tapan el arco); sin él, el marcador de abajo.
 */
export function pintarPortada(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  p: PuertaDeMuralla,
  abierta: boolean,
  elegible: boolean,
  acabado: AcabadoDelMuro,
  material: MaterialDeMuralla,
): void {
  const alto = alturaDeColumna(t);
  const { colores } = acabado;
  const c = pieDePortada(t, p);
  const x0 = c.x - PORTADA.mitad * t.paso;
  const x1 = c.x + PORTADA.mitad * t.paso;
  const izq = c.x - PORTADA.hueco * t.paso;
  const clave = c.y - PORTADA.arco * t.paso;
  const hueco = huecoDePortada(t, p);
  const arriba = c.y - alto;
  const fondo = PORTADA.fondo * t.paso * t.compresion;
  if (pintarPortadaConArte(ctx, t, material, c, abierta)) {
    if (elegible) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffd24a';
      ctx.stroke(hueco);
      ctx.strokeRect(x0, arriba - fondo, x1 - x0, alto + fondo);
      ctx.restore();
    }
    return;
  }
  ctx.save();
  ctx.lineJoin = 'round';
  // La fachada, menos el hueco: piedra con hiladas, como las columnas.
  const fachada = new Path2D();
  fachada.rect(x0, arriba, x1 - x0, alto);
  fachada.addPath(hueco);
  ctx.save();
  ctx.clip(fachada, 'evenodd');
  ctx.fillStyle = colores.luz;
  ctx.fillRect(x0, arriba, x1 - x0, alto);
  // La jamba de la izquierda, en sombra: da volumen sin pintar caras de lado.
  ctx.fillStyle = colores.sombra;
  ctx.fillRect(x0, arriba, izq - x0, alto);
  pintarSillares(ctx, t, { x: x0, y: c.y }, { x: x1, y: c.y }, alto, acabado);
  ctx.restore();
  if (abierta) pintarHojasAbiertas(ctx, t, p);
  else pintarHojasCerradas(ctx, t, c.x, clave, c.y);
  // La rosca del arco, en madera oscura como la puerta: se lee como un paso.
  ctx.lineWidth = Math.max(2.5, t.paso * 0.05);
  ctx.strokeStyle = HOJA.oscura;
  ctx.stroke(hueco);
  // La tapa: el fondo de la fachada visto desde arriba. Ahí no se pisa.
  ctx.beginPath();
  ctx.rect(x0, arriba - fondo, x1 - x0, fondo);
  ctx.fillStyle = colores.arriba;
  ctx.fill();
  ctx.lineWidth = Math.max(2, t.paso * 0.045);
  ctx.strokeStyle = colores.borde;
  ctx.stroke();
  ctx.strokeRect(x0, arriba, x1 - x0, alto);
  if (elegible) {
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd24a';
    ctx.stroke(hueco);
    ctx.strokeRect(x0, arriba - fondo, x1 - x0, alto + fondo);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * Las dos hojas abiertas de la puerta `p`, abatidas contra las jambas, en el
 * lienzo: lo que pinta `pintarHojasAbiertas` en el marcador sin arte.
 */
function formaDeLasHojasAbiertas(t: Tablero, p: PuertaDeMuralla): Path2D {
  const c = pieDePortada(t, p);
  const clave = c.y - PORTADA.arco * t.paso;
  const forma = new Path2D();
  const arranque = clave + PORTADA.flecha * t.paso;
  const grueso = t.paso * 0.1;
  const izq = c.x - PORTADA.hueco * t.paso;
  const der = c.x + PORTADA.hueco * t.paso;
  for (const [x0, x1] of [
    [izq, izq + grueso],
    [der - grueso, der],
  ] as const) {
    forma.moveTo(x0, c.y);
    forma.lineTo(x0, arranque);
    forma.lineTo(x1, arranque + grueso * 0.6);
    forma.lineTo(x1, c.y);
    forma.closePath();
  }
  return forma;
}

/** Una portada o una escalera ya pintada: lo que tapa y cómo se vuelve a pintar a trasluz. */
export interface ATrasluz {
  readonly silueta: readonly Punto[];
  readonly pintar: () => void;
}

/** Lo que se deja ver una portada o una escalera tapada, a través de lo que la tapa. */
const ALFA_A_TRASLUZ = 0.42;

/**
 * Las portadas y las escaleras de `yaPintadas` que tapa la pieza de la muralla
 * recién pintada (su `silueta`, una columna o una portada), otra vez encima de
 * ella, tenues y solo donde la tapa: se ven a trasluz, como la silueta de una
 * figura tapada. Así se lee la puerta entera, abierta o cerrada, detrás de la
 * columna que tiene delante (con la «Base derecha» de las ciudades, toda), y la
 * escalera que se apoya detrás de una columna de la fila de delante. Va con la
 * pieza que tapa, antes que quien está en lo alto de ella: le pasa por debajo.
 * Sustituye a las hojas tapadas (el tablón o las hojas en contorno naranja, ampliación
 * 3, criterio 25), que con el arte se leían como un rectángulo suelto sobre las
 * almenas (QA del arte de la muralla, 06-11-2026).
 */
export function aTrasluz(
  ctx: CanvasRenderingContext2D,
  silueta: readonly Punto[],
  yaPintadas: readonly ATrasluz[],
): void {
  const tapadas = yaPintadas.filter((p) => convexosSeTocan(p.silueta, silueta));
  if (tapadas.length === 0) return;
  const [primero, ...resto] = silueta;
  const recorte = new Path2D();
  recorte.moveTo((primero as Punto).x, (primero as Punto).y);
  for (const q of resto) recorte.lineTo(q.x, q.y);
  recorte.closePath();
  ctx.save();
  ctx.clip(recorte);
  ctx.globalAlpha = ALFA_A_TRASLUZ;
  for (const p of tapadas) p.pintar();
  ctx.restore();
}

/** La madera de las hojas de la puerta y sus herrajes. */
const HOJA = {
  madera: '#7a4a22',
  /** La madera oscura: la rosca del arco y el tablón del umbral de la puerta cerrada. */
  oscura: '#2a160a',
  tabla: '#4a2a12',
  hierro: '#26231f',
  canto: '#5a3418',
} as const;

/** Lo ancho del tablero de las hojas cerradas, en pasos: más que su grueso, para que se lea. */
const ANCHO_DE_LAS_HOJAS = 0.26;

/**
 * Las dos hojas cerradas, en medio del arco y sobre el lado de la puerta: un
 * tablero de madera del suelo a la clave, con su junta, sus tablas y dos bandas
 * de hierro con clavos.
 */
function pintarHojasCerradas(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  medio: number,
  clave: number,
  suelo: number,
): void {
  const ancho = ANCHO_DE_LAS_HOJAS * t.paso;
  const x0 = medio - ancho / 2;
  const arriba = clave + t.paso * 0.04;
  ctx.save();
  ctx.fillStyle = HOJA.madera;
  ctx.fillRect(x0, arriba, ancho, suelo - arriba);
  ctx.strokeStyle = HOJA.tabla;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.beginPath();
  for (const f of [0.25, 0.75]) {
    ctx.moveTo(x0 + ancho * f, arriba);
    ctx.lineTo(x0 + ancho * f, suelo);
  }
  ctx.stroke();
  ctx.strokeStyle = HOJA.hierro;
  ctx.lineWidth = Math.max(2, t.paso * 0.04);
  ctx.beginPath();
  ctx.moveTo(medio, arriba);
  ctx.lineTo(medio, suelo);
  for (const f of [0.25, 0.7]) {
    const y = arriba + (suelo - arriba) * f;
    ctx.moveTo(x0 - t.paso * 0.03, y);
    ctx.lineTo(x0 + ancho + t.paso * 0.03, y);
  }
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, t.paso * 0.025);
  ctx.strokeRect(x0, arriba, ancho, suelo - arriba);
  ctx.restore();
}

/**
 * Las dos hojas abiertas: abatidas contra las jambas, una tira de madera oscura
 * a cada lado del hueco, del suelo al arranque del arco (`formaDeLasHojasAbiertas`). El
 * medio, libre.
 */
function pintarHojasAbiertas(ctx: CanvasRenderingContext2D, t: Tablero, p: PuertaDeMuralla): void {
  const forma = formaDeLasHojasAbiertas(t, p);
  ctx.save();
  ctx.fillStyle = HOJA.canto;
  ctx.fill(forma);
  ctx.strokeStyle = HOJA.hierro;
  ctx.lineWidth = Math.max(1, t.paso * 0.02);
  ctx.stroke(forma);
  ctx.restore();
}

/** De dónde a dónde va la escalera de `pie` a `muro` en el lienzo: del suelo a pasado lo alto. */
function tramoDeLaEscalera(t: Tablero, pie: Hex, muro: Hex): { abajo: Punto; arriba: Punto } {
  const p = centroHex(t, pie);
  const m = centroHex(t, muro);
  return {
    abajo: { x: p.x + (m.x - p.x) * 0.48, y: p.y + (m.y - p.y) * 0.48 },
    arriba: {
      x: m.x + (p.x - m.x) * 0.3,
      y: m.y + (p.y - m.y) * 0.3 - alturaDeColumna(t) * 1.15,
    },
  };
}

/**
 * Lo que tapa en pantalla la escalera de `pie` a `muro`: la tira de su tramo, del
 * ancho de sus largueros por fuera con algo de holgura. La lee el trasluz
 * (`aTrasluz`): la columna de delante que la tapa la deja ver.
 */
export function siluetaDeEscalera(t: Tablero, pie: Hex, muro: Hex): Punto[] {
  const { abajo, arriba } = tramoDeLaEscalera(t, pie, muro);
  const largo = Math.max(1, Math.hypot(arriba.x - abajo.x, arriba.y - abajo.y));
  const media = (ESCALERA.ancho / 2 + 0.06) * t.paso;
  const nx = (-(arriba.y - abajo.y) / largo) * media;
  const ny = ((arriba.x - abajo.x) / largo) * media;
  return [
    { x: abajo.x + nx, y: abajo.y + ny },
    { x: arriba.x + nx, y: arriba.y + ny },
    { x: arriba.x - nx, y: arriba.y - ny },
    { x: abajo.x - nx, y: abajo.y - ny },
  ];
}

/**
 * La escalera puesta: con su arte, la pintada (`pintarEscaleraConArte`); sin él, dos largueros de madera del pie (en el suelo,
 * junto a la base de la columna) hasta pasado el borde de lo alto, y sus
 * peldaños. Se queda puesta toda la batalla. Sale ancha y gruesa a propósito:
 * de 0,09 pasos y apoyada a un tercio del pie, la tapaba la figura que esperaba
 * en él y no se leía (QA, M2).
 */
export function pintarEscalera(
  ctx: CanvasRenderingContext2D,
  t: Tablero,
  pie: Hex,
  muro: Hex,
): void {
  const { abajo, arriba } = tramoDeLaEscalera(t, pie, muro);
  // Con su arte, la escalera pintada tendida del pie a lo alto; sin él, el marcador.
  if (pintarEscaleraConArte(ctx, t, abajo, arriba)) return;
  const dx = arriba.x - abajo.x;
  const dy = arriba.y - abajo.y;
  const largo = Math.max(1, Math.hypot(dx, dy));
  const ancho = t.paso * 0.15;
  const nx = (-dy / largo) * ancho;
  const ny = (dx / largo) * ancho;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [color, grueso] of [
    ['#2a160a', Math.max(4, t.paso * 0.075)],
    ['#d39a52', Math.max(2, t.paso * 0.042)],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = grueso;
    ctx.beginPath();
    for (const lado of [-1, 1]) {
      ctx.moveTo(abajo.x + nx * lado, abajo.y + ny * lado);
      ctx.lineTo(arriba.x + nx * lado, arriba.y + ny * lado);
    }
    for (let i = 1; i <= 4; i++) {
      const f = i / 5;
      const x = abajo.x + dx * f;
      const y = abajo.y + dy * f;
      ctx.moveTo(x - nx, y - ny);
      ctx.lineTo(x + nx, y + ny);
    }
    ctx.stroke();
  }
  ctx.restore();
}
