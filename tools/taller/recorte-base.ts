/**
 * El recorte de la base (vuelta 3): cada edificio sale del cuadro en que está
 * pintado (su maestro o su edición) por la diferencia con la placa del tramo,
 * dentro de la región de su sitio, y se guarda en su sitio exacto del cuadro.
 * Sin ancla, escala ni giro que cuadrar: la placa y el recorte son del mismo
 * cuadro (`poc-inpainting.md`).
 *
 * **El suelo es del juego** (costura de F2): de cada cuadro se queda solo lo que
 * hay por encima de su pie (`lineaDelPie`, medida columna a columna, y un
 * fundido de `FUNDIDO_DEL_PIE` por debajo), y debajo de todo se pinta un solo
 * empedrado repetible, sacado de una placa (`sueloRepetible`). Así el empedrado
 * no tiene junta entre tramos, y cada tramo se alinea por su pie sin arrastrar
 * la plaza que pintó Codex, que cada vez la pinta a otra altura.
 *
 *   pnpm taller recortar-base templarios      → los tramos, el suelo, los recortes y el índice que lee el juego
 *   pnpm taller medir-base templarios [tramo] → propone la región de cada sitio
 *
 * La morfología es pura sobre `(ancho, alto, Uint8Array)` y está en JS, no en
 * sharp: con `raw` de un canal, sharp devolvía más canales de los que entraban y
 * las máscaras salían al 150 % de su región. Se probó tres veces en la prueba de
 * concepto con las mismas cifras: la placa repinta la textura fina (|Δ| medio
 * 13/255 en el empedrado) pero no la mueve ni un píxel, y desenfocada se queda
 * en 2-3, diez veces por debajo del umbral.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { sitioDeEdificio } from '../../src/core/town/sitios.js';
import type { FactionId } from '../../src/core/types.js';
import {
  bajarDe,
  type DerivadaEnElIndice,
  disposicionDe,
  filaDelPanorama,
  INDICE_VACIO,
  type IndiceDeLaBase,
  type RecorteEnElIndice,
  type Region,
  SOLAPE,
  TRAMO,
} from '../../src/shared/base.js';
import {
  abiertaDelJuego,
  abiertaPintada,
  cuadroDe,
  dirDeLaBase,
  edificiosConArte,
  maestroDelTramo,
  moradasDeLaBase,
  placaDelTramo,
  recorteDelJuego,
  sueloDeLaBase,
  tramoDelJuego,
} from './base.js';
import { sha256 } from './poses-8d.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/**
 * Píxeles de `ancho × alto`, fila a fila, con sus canales intercalados: uno en
 * una máscara, tres en un RGB.
 */
export interface Pixeles {
  readonly ancho: number;
  readonly alto: number;
  readonly v: Uint8Array;
}

/** El umbral de la diferencia desenfocada, en 0-255: el grano repintado de la placa queda en 2-3. */
export const UMBRAL = 30;
/**
 * Lo que se mira alrededor de la región para no cortar los desenfoques en su
 * borde: más que lo que derraman todos juntos (σ 4 + 3 + 3 + 10 + 10).
 */
const HOLGURA = 64;

/** Un píxel de un búfer (los índices de aquí nunca se salen). */
const en = (v: ArrayLike<number>, i: number): number => v[i] ?? 0;

/** Desenfoque de un canal: tres pasadas de caja separable (≈ gaussiana de σ), con el borde repetido. */
export function desenfocar(c: Pixeles, sigma: number): Pixeles {
  const { ancho: W, alto: H } = c;
  const r = Math.max(1, Math.round(sigma * 0.87));
  const a = Float32Array.from(c.v);
  const t = new Float32Array(W * H);
  for (let pasada = 0; pasada < 3; pasada++) {
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += en(a, y * W + Math.min(W - 1, Math.max(0, x)));
      for (let x = 0; x < W; x++) {
        t[y * W + x] = s / (2 * r + 1);
        s += en(a, y * W + Math.min(W - 1, x + r + 1)) - en(a, y * W + Math.max(0, x - r));
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += en(t, Math.min(H - 1, Math.max(0, y)) * W + x);
      for (let y = 0; y < H; y++) {
        a[y * W + x] = s / (2 * r + 1);
        s += en(t, Math.min(H - 1, y + r + 1) * W + x) - en(t, Math.max(0, y - r) * W + x);
      }
    }
  }
  return { ancho: W, alto: H, v: Uint8Array.from(a, (x) => Math.round(x)) };
}

function desenfocarUmbral(c: Pixeles, sigma: number, umbral: number): Pixeles {
  const d = desenfocar(c, sigma);
  return { ...d, v: d.v.map((x) => (x > umbral ? 255 : 0)) };
}

/**
 * La máscara de un edificio en `a` (el cuadro con él) frente a `b` (la placa),
 * dos RGB de `ancho × alto`: la diferencia (el canal que más cambia) dentro de la
 * región, desenfoque y umbral, apertura (quita motas), cierre (une los trozos),
 * relleno por columna de la primera fila encendida a la última —una fachada es
 * convexa por columnas; los huecos de dentro son trozos que la placa dejó
 * parecidos, un muro de piedra sobre un muro de piedra— y un fundido de 2 px.
 * Fuera de la región, 0.
 */
export function mascaraDeLaDiferencia(
  ancho: number,
  alto: number,
  a: Uint8Array,
  b: Uint8Array,
  r: Region,
): Pixeles {
  const W = ancho;
  const H = alto;
  const dif = new Uint8Array(W * H);
  for (let y = 0; y < Math.min(H, r.pie); y++)
    for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) {
      const i = y * W + x;
      dif[i] = Math.max(
        Math.abs(en(a, i * 3) - en(b, i * 3)),
        Math.abs(en(a, i * 3 + 1) - en(b, i * 3 + 1)),
        Math.abs(en(a, i * 3 + 2) - en(b, i * 3 + 2)),
      );
    }
  const crudo = desenfocarUmbral({ ancho: W, alto: H, v: dif }, 4, UMBRAL);
  let m = desenfocarUmbral(crudo, 3, 200);
  m = desenfocarUmbral(m, 3, 55);
  const dilatada = desenfocarUmbral(m, 10, 30);
  m = desenfocarUmbral(dilatada, 10, 225);
  // El cierre por desenfoque redondea las esquinas convexas (~20 px de radio):
  // el pie de una pared perdía su esquina y asomaba la placa (lo cazó
  // `base-recorte.test.ts`, 88 % de un rectángulo). Se devuelve lo que la
  // diferencia encendió de verdad cerca del edificio, sin las motas sueltas que
  // quitó la apertura, que no caen dentro de la dilatación.
  for (let i = 0; i < m.v.length; i++) if (en(crudo.v, i) && en(dilatada.v, i)) m.v[i] = 255;
  const v = new Uint8Array(W * H);
  for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) {
    let ini = -1;
    let fin = -1;
    for (let y = 0; y < Math.min(H, r.pie); y++)
      if (en(m.v, y * W + x)) {
        if (ini < 0) ini = y;
        fin = y;
      }
    if (ini >= 0) for (let y = ini; y <= fin; y++) v[y * W + x] = 255;
  }
  // El fundido de 2 px, y fuera de la región nada: el fundido no derrama por
  // fuera de su banda ni por debajo de su pie.
  const fundida = desenfocar({ ancho: W, alto: H, v }, 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (x < r.x0 || x >= r.x1 || y >= r.pie) fundida.v[y * W + x] = 0;
  return fundida;
}

/** La caja, el pie (mediana del borde de abajo por columna) y el centro de lo encendido (> 127). */
export function medir(m: Pixeles): {
  x0: number;
  x1: number;
  arriba: number;
  pie: number;
  centro: number;
} | null {
  const { ancho: W, alto: H } = m;
  let x0 = W;
  let x1 = -1;
  let arriba = H;
  let sx = 0;
  let n = 0;
  const bajos: number[] = [];
  for (let x = 0; x < W; x++) {
    let bajo = -1;
    for (let y = 0; y < H; y++)
      if (en(m.v, y * W + x) > 127) {
        bajo = y;
        arriba = Math.min(arriba, y);
        sx += x;
        n++;
      }
    if (bajo >= 0) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      bajos.push(bajo);
    }
  }
  if (n === 0) return null;
  bajos.sort((p, q) => p - q);
  return {
    x0,
    x1,
    arriba,
    pie: bajos[Math.floor(bajos.length / 2)] ?? -1,
    centro: Math.round(sx / n),
  };
}

/**
 * Lo que baja el fundido del corte por debajo del pie, en píxeles del tramo: el
 * empedrado que pintó Codex entra en el del juego sin raya. Por encima del pie
 * queda entero lo que no es empedrado, la sombra de contacto incluida.
 */
export const FUNDIDO_DEL_PIE = 20;

/** Las filas, en fracción del alto, de las que se saca cómo es el empedrado de un cuadro: lo de abajo del todo. */
const MUESTRA_DEL_EMPEDRADO = [0.88, 0.985] as const;
/** Entre qué filas, en fracción del alto, se busca el pie de todo el cuadro. */
const PIE_ENTRE = [0.49, 0.88] as const;
/** Cuánto se mira por encima y por debajo de una fila para decidir si es el pie. */
const VENTANA_DEL_PIE = 40;
/** El pie de una columna se busca hasta esto por encima y por debajo del de todo el cuadro. */
const PIE_ARRIBA = 60;
const PIE_ABAJO = 40;
/** La media anchura de la banda de columnas que se mira para el pie de cada una. */
const BANDA_DEL_PIE = 8;
/** La media anchura de la mediana que quita los picos sueltos de la línea. */
const MEDIANA_DEL_PIE = 15;
/**
 * La media anchura del máximo que se toma al final: la línea solo puede errar
 * hacia abajo. Un pie medido por encima del de verdad come el zócalo de un
 * edificio (el que se confunde con el empedrado: una puerta de madera, un
 * escalón de piedra, en el maestro T1 de F2), y el suelo pintado encima lo deja
 * flotando; medido por debajo, solo queda una tira del empedrado de Codex que se
 * funde en el del juego.
 */
const MAXIMO_DEL_PIE = 64;
/**
 * Con las puertas medidas, el pie de todo el cuadro se busca a esto de la
 * mediana de sus umbrales (`filaDeLasPuertas`), no en `PIE_ENTRE`: el muro de
 * piedra gris de detrás de la plaza de T5 (F3) se parecía al empedrado y el pie
 * salía en lo alto del muro, 115 px por encima, y el suelo del juego se lo comía.
 */
const PIE_CERCA_DE_LAS_PUERTAS = 40;

/**
 * Lo lejos que está cada píxel del empedrado de un cuadro (RGB), en distancias
 * de su desviación y con tope: lo que se parece al empedrado lo dice el propio
 * cuadro, sus filas de abajo (`MUESTRA_DEL_EMPEDRADO`), en color y tono
 * desenfocados. Lo lee la línea del pie de la plaza.
 */
function lejosDelEmpedrado(W: number, H: number, rgb: Uint8Array): Float32Array {
  const canal = (c: number): Pixeles => {
    const v = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) v[i] = en(rgb, i * 3 + c);
    return desenfocar({ ancho: W, alto: H, v }, 3);
  };
  const [r, g, b] = [canal(0), canal(1), canal(2)];
  // Tono, y dos ejes de color: rojo-verde y azul-verde.
  const rasgo = (i: number): [number, number, number] => {
    const R = en(r.v, i);
    const G = en(g.v, i);
    const B = en(b.v, i);
    return [(R + G + B) / 3, R - G, B - G];
  };
  const y0 = Math.round(H * MUESTRA_DEL_EMPEDRADO[0]);
  const y1 = Math.round(H * MUESTRA_DEL_EMPEDRADO[1]);
  const media = [0, 0, 0];
  const desv = [0, 0, 0];
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < W; x++) {
      const f = rasgo(y * W + x);
      for (let c = 0; c < 3; c++) media[c] = (media[c] as number) + (f[c] as number);
      n++;
    }
  for (let c = 0; c < 3; c++) media[c] = (media[c] as number) / n;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < W; x++) {
      const f = rasgo(y * W + x);
      for (let c = 0; c < 3; c++)
        desv[c] = (desv[c] as number) + ((f[c] as number) - (media[c] as number)) ** 2;
    }
  for (let c = 0; c < 3; c++) desv[c] = Math.max(2, Math.sqrt((desv[c] as number) / n));
  // Con tope: una piedra muy clara del empedrado no pesa más que diez.
  const lejos = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const f = rasgo(i);
    let s = 0;
    for (let c = 0; c < 3; c++)
      s += (((f[c] as number) - (media[c] as number)) / (desv[c] as number)) ** 2;
    lejos[i] = Math.min(6, Math.sqrt(s));
  }
  return lejos;
}

/**
 * La mejor fila de `perfil` entre `desde` y `hasta` para ser el pie: mucho de
 * encima lejos del empedrado y poco de debajo (`VENTANA_DEL_PIE` a cada lado), y
 * lo que le saca a lo de debajo (`fuerza`, en distancias): con poca, encima y
 * debajo son lo mismo y no hay pie que medir.
 */
function corteDelPie(
  perfil: Float64Array,
  desde: number,
  hasta: number,
): { readonly fila: number; readonly fuerza: number } {
  const V = VENTANA_DEL_PIE;
  const acum = new Float64Array(perfil.length + 1);
  for (let y = 0; y < perfil.length; y++) acum[y + 1] = (acum[y] as number) + (perfil[y] as number);
  let mejor = -Infinity;
  let fila = desde;
  let fuerza = 0;
  for (let y = Math.max(V, desde); y <= Math.min(perfil.length - V, hasta); y++) {
    const encima = ((acum[y] as number) - (acum[y - V] as number)) / V;
    const debajo = ((acum[y + V] as number) - (acum[y] as number)) / V;
    const e = encima - 1.6 * debajo;
    if (e > mejor) {
      mejor = e;
      fila = y;
      fuerza = encima - debajo;
    }
  }
  return { fila, fuerza };
}

/** La media de `lejos` en cada fila del cuadro entero: el perfil con que se corta todo el cuadro. */
function porFilas(lejos: Float32Array, W: number, H: number): Float64Array {
  const filas = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = 0; x < W; x++) s += lejos[y * W + x] as number;
    filas[y] = s / W;
  }
  return filas;
}

/**
 * La línea del pie de un cuadro, columna a columna: la primera fila que ya es
 * empedrado (`lejosDelEmpedrado`). El pie de todo el cuadro es la fila donde lo
 * de encima deja de parecerse y lo de debajo se parece, y el de cada columna se
 * busca cerca de él (lejos, el muro de piedra de encima también se parece).
 * Codex pinta el empedrado a la altura que quiere en cada cuadro (en F2, 705 en
 * T1 y 650 en T2), así que se mide.
 */
export function lineaDelPie(
  ancho: number,
  alto: number,
  rgb: Uint8Array,
  puertas?: number,
): Int16Array {
  const W = ancho;
  const H = alto;
  const lejos = lejosDelEmpedrado(W, H, rgb);
  const corte = (perfil: Float64Array, desde: number, hasta: number): number =>
    corteDelPie(perfil, desde, hasta).fila;
  const filas = porFilas(lejos, W, H);
  const todo =
    puertas === undefined
      ? corte(filas, Math.round(H * PIE_ENTRE[0]), Math.round(H * PIE_ENTRE[1]))
      : corte(
          filas,
          Math.round(puertas - PIE_CERCA_DE_LAS_PUERTAS),
          Math.round(puertas + PIE_CERCA_DE_LAS_PUERTAS),
        );
  // Cada columna, por su banda: la suma acumulada de cada fila, de izquierda a derecha.
  const acumFila = new Float64Array(H * (W + 1));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      acumFila[y * (W + 1) + x + 1] =
        (acumFila[y * (W + 1) + x] as number) + (lejos[y * W + x] as number);
  const crudo = new Int16Array(W);
  const perfil = new Float64Array(H);
  for (let x = 0; x < W; x++) {
    const a = Math.max(0, x - BANDA_DEL_PIE);
    const z = Math.min(W, x + BANDA_DEL_PIE + 1);
    for (let y = 0; y < H; y++)
      perfil[y] =
        ((acumFila[y * (W + 1) + z] as number) - (acumFila[y * (W + 1) + a] as number)) / (z - a);
    crudo[x] = corte(perfil, todo - PIE_ARRIBA, todo + PIE_ABAJO);
  }
  const ventana = (v: Int16Array, r: number, f: (xs: number[]) => number): Int16Array =>
    Int16Array.from(v, (_, x) => {
      const xs: number[] = [];
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) xs.push(v[k] as number);
      return f(xs);
    });
  const mediana = ventana(crudo, MEDIANA_DEL_PIE, (xs) => {
    xs.sort((p, q) => p - q);
    return xs[Math.floor(xs.length / 2)] as number;
  });
  return ventana(mediana, MAXIMO_DEL_PIE, (xs) => Math.max(...xs));
}

/** El alfa de lo que hay por encima de `pie`: entero hasta él y fundido `FUNDIDO_DEL_PIE` por debajo. */
export function mascaraDelPie(ancho: number, alto: number, pie: ArrayLike<number>): Pixeles {
  const v = new Uint8Array(ancho * alto);
  for (let x = 0; x < ancho; x++) {
    const p = pie[x] ?? alto;
    for (let y = 0; y < alto; y++) {
      const a = y <= p ? 1 : Math.max(0, 1 - (y - p) / FUNDIDO_DEL_PIE);
      v[y * ancho + x] = Math.round(255 * a);
    }
  }
  return { ancho, alto, v };
}

/**
 * La costura de menor diferencia entre dos tiras de `n` filas por `m` columnas,
 * una posición por fila (de 1 a `m − 1`), que se mueve a lo sumo una de fila a
 * fila. `coste(fila, k)` es lo que se nota pasar de una tira a la otra en `k`.
 * Con `cerrada`, la primera y la última fila caen en la misma posición: la
 * costura da la vuelta, y lo que ya se repite en el otro eje sigue casando.
 */
function costura(
  n: number,
  m: number,
  coste: (f: number, k: number) => number,
  cerrada: boolean,
): Int16Array {
  let mejor: { total: number; camino: Int16Array } | null = null;
  for (const inicio of cerrada ? Array.from({ length: m - 1 }, (_, k) => k + 1) : [-1]) {
    const total = new Float64Array(n * m).fill(Infinity);
    const de = new Int16Array(n * m);
    for (let k = 1; k < m; k++) if (inicio < 0 || k === inicio) total[k] = coste(0, k);
    for (let f = 1; f < n; f++)
      for (let k = 1; k < m; k++)
        for (const d of [-1, 0, 1]) {
          const j = k + d;
          if (j < 1 || j >= m) continue;
          const t = (total[(f - 1) * m + j] as number) + coste(f, k);
          if (t < (total[f * m + k] as number)) {
            total[f * m + k] = t;
            de[f * m + k] = j;
          }
        }
    let fin = -1;
    for (let k = 1; k < m; k++) {
      if (cerrada && k !== inicio) continue;
      if (fin < 0 || (total[(n - 1) * m + k] as number) < (total[(n - 1) * m + fin] as number))
        fin = k;
    }
    if (fin < 0) continue;
    const t = total[(n - 1) * m + fin] as number;
    if (mejor !== null && t >= mejor.total) continue;
    const camino = new Int16Array(n);
    let k = fin;
    for (let f = n - 1; f >= 0; f--) {
      camino[f] = k;
      k = de[f * m + k] as number;
    }
    mejor = { total: t, camino };
  }
  if (mejor === null)
    throw new Error('no hay costura posible: el solape es de menos de dos píxeles');
  return mejor.camino;
}

/**
 * Un trozo de empedrado hecho repetible en los dos ejes sin junta ni fantasma:
 * mide `solape` menos por cada lado, y lo que entra por el principio de cada
 * fila (columna) es la continuación de lo que sale por el final, cosida a lo
 * de dentro por la costura de menor diferencia (el «image quilting» de Efros y
 * Freeman). Mezclar las dos tiras a lo largo del solape dejaba los adoquines
 * dobles. La luz se aplana antes (`sinLuz`): un degradado de un lado a otro se
 * vería como un escalón al repetirse.
 */
export function sueloRepetible(trozo: Pixeles, solapeX: number, solapeY: number): Pixeles {
  const plano = sinLuz(trozo);
  const W = plano.ancho - solapeX;
  const H = plano.alto - solapeY;
  if (W < solapeX || H < solapeY) {
    throw new Error(
      `el trozo de empedrado (${trozo.ancho}×${trozo.alto}) no da para un suelo con solapes de ${solapeX}×${solapeY}`,
    );
  }
  const px = (img: Pixeles, x: number, y: number, c: number): number =>
    en(img.v, (y * img.ancho + x) * 3 + c);
  const dif = (img: Pixeles, x0: number, y0: number, x1: number, y1: number): number =>
    Math.abs(px(img, x0, y0, 0) - px(img, x1, y1, 0)) +
    Math.abs(px(img, x0, y0, 1) - px(img, x1, y1, 1)) +
    Math.abs(px(img, x0, y0, 2) - px(img, x1, y1, 2));
  // En x: la columna k < costura de cada fila es la `W + k`, la que sigue a la última.
  const enX = costura(plano.alto, solapeX, (y, k) => dif(plano, W + k, y, k, y), false);
  const ancho: Pixeles = { ancho: W, alto: plano.alto, v: new Uint8Array(W * plano.alto * 3) };
  for (let y = 0; y < plano.alto; y++)
    for (let x = 0; x < W; x++) {
      const desde = x < (enX[y] as number) ? W + x : x;
      for (let c = 0; c < 3; c++) ancho.v[(y * W + x) * 3 + c] = px(plano, desde, y, c);
    }
  // En y, igual, con la costura cerrada: cada columna toma la fila de origen de
  // su vecina en la vuelta, y lo que se repite en x sigue casando.
  const enY = costura(W, solapeY, (x, k) => dif(ancho, x, H + k, x, k), true);
  const v = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const desde = y < (enY[x] as number) ? H + y : y;
      for (let c = 0; c < 3; c++) v[(y * W + x) * 3 + c] = px(ancho, x, desde, c);
    }
  return { ancho: W, alto: H, v };
}

/** Lo que mide la luz que se quita del empedrado: lo que cambia de un adoquín a otro se queda. */
const LUZ_DEL_EMPEDRADO = 40;

/** El trozo con su luz aplanada: a cada canal se le quita su desenfoque ancho y se le suma su media. */
function sinLuz(t: Pixeles): Pixeles {
  const v = new Uint8Array(t.v.length);
  for (let c = 0; c < 3; c++) {
    const canal = new Uint8Array(t.ancho * t.alto);
    let suma = 0;
    for (let i = 0; i < canal.length; i++) {
      canal[i] = en(t.v, i * 3 + c);
      suma += canal[i] as number;
    }
    const media = suma / canal.length;
    const luz = desenfocar({ ancho: t.ancho, alto: t.alto, v: canal }, LUZ_DEL_EMPEDRADO);
    for (let i = 0; i < canal.length; i++)
      v[i * 3 + c] = Math.max(
        0,
        Math.min(255, Math.round((canal[i] as number) - en(luz.v, i) + media)),
      );
  }
  return { ancho: t.ancho, alto: t.alto, v };
}

/** Un cuadro decodificado: su RGB de `TRAMO` y la clave de su versión en disco. */
interface Decodificado {
  readonly v: Uint8Array;
  readonly clave: string;
}

/**
 * Un cuadro como RGB de `TRAMO`, como se usa en el recorte: una vez por fichero y
 * versión. Un maestro lo leen todos los recortes de su tramo y su pie; una placa,
 * su tramo, su suelo y cada recorte. La clave lleva la fecha y el tamaño del
 * fichero, para que un cuadro pedido otra vez en el mismo proceso (el trabajador)
 * no se recorte con los píxeles del anterior.
 */
const DECODIFICADOS = new Map<string, Promise<Decodificado>>();
async function rgb(ruta: string): Promise<Decodificado> {
  const e = await stat(join(RAIZ, ruta));
  const clave = `${ruta}:${e.mtimeMs}:${e.size}`;
  let hay = DECODIFICADOS.get(clave);
  if (hay === undefined) {
    hay = sharp(join(RAIZ, ruta))
      .removeAlpha()
      .resize(TRAMO.ancho, TRAMO.alto, { fit: 'fill' })
      .raw()
      .toBuffer()
      .then((b) => ({ v: new Uint8Array(b.buffer, b.byteOffset, b.length), clave }));
    DECODIFICADOS.set(clave, hay);
  }
  return hay;
}

/** El pie de un cuadro ya decodificado, una vez por versión: lo leen su tramo y cada recorte que sale de él. */
const PIES = new Map<string, Int16Array>();
function pieDe(cuadro: Decodificado, puertas: number): Int16Array {
  const clave = `${cuadro.clave}:${puertas}`;
  const hay = PIES.get(clave);
  if (hay !== undefined) return hay;
  const pie = lineaDelPie(TRAMO.ancho, TRAMO.alto, cuadro.v, puertas);
  PIES.set(clave, pie);
  return pie;
}

/** La fila de los umbrales de un tramo (su mediana, la que cae en la raya): cerca de ella va su pie. */
function filaDeLasPuertas(f: FactionId, n: number): number {
  return filaDelPanorama(0) - bajarDe(disposicionDe(f), n);
}

/**
 * El RGBA de la caja `c` de un RGB y un alfa de `anchoFuente` columnas: lo que se
 * escribe de un tramo y de un recorte.
 */
function rgbaDe(
  rgb: Uint8Array,
  alfa: Uint8Array,
  anchoFuente: number,
  c: { readonly x0: number; readonly y0: number; readonly ancho: number; readonly alto: number },
): Buffer {
  const out = Buffer.alloc(c.ancho * c.alto * 4);
  for (let y = 0; y < c.alto; y++)
    for (let x = 0; x < c.ancho; x++) {
      const i = (c.y0 + y) * anchoFuente + c.x0 + x;
      const o = (y * c.ancho + x) * 4;
      out[o] = en(rgb, i * 3);
      out[o + 1] = en(rgb, i * 3 + 1);
      out[o + 2] = en(rgb, i * 3 + 2);
      out[o + 3] = en(alfa, i);
    }
  return out;
}

/** De un RGB de `TRAMO`, la ventana de `x0..x1 × 0..y1`. */
function ventana(v: Uint8Array, x0: number, x1: number, y1: number): Uint8Array {
  const w = x1 - x0;
  const out = new Uint8Array(w * y1 * 3);
  for (let y = 0; y < y1; y++)
    out.set(v.subarray((y * TRAMO.ancho + x0) * 3, (y * TRAMO.ancho + x1) * 3), y * w * 3);
  return out;
}

/** Un recorte derivado: los píxeles RGBA de su caja y dónde está en su tramo. */
export interface RecorteDerivado {
  readonly tramo: number;
  readonly en: readonly [number, number];
  readonly ancho: number;
  readonly alto: number;
  readonly rgba: Buffer;
  /** Si lo encendido toca el borde de la región: el edificio puede haberse salido de ella. */
  readonly toca: readonly string[];
}

/**
 * El recorte de un edificio: la máscara de su cuadro frente a la placa, en la
 * región de su sitio (`data/bases/<f>.json`), cortada por el pie de su cuadro
 * (lo de debajo es empedrado, y el del juego va debajo de todo) y recortada a
 * lo que tiene alfa. La diferencia se hace en una ventana de la región con
 * `HOLGURA` alrededor, no en el tramo entero: es la misma imagen y tarda una
 * fracción. `fuente` es el cuadro del que sale: el suyo (`cuadroDe`) o el de su
 * versión abierta (`abiertaPintada`), que se recorta igual.
 */
export async function derivarRecorte(
  f: FactionId,
  id: string,
  fuente = `${cuadroDe(f, id)}.webp`,
): Promise<RecorteDerivado> {
  const { tramo, region } = disposicionDe(f).sitios[sitioDeEdificio(f, id).id];
  const placa = `${placaDelTramo(f, tramo)}.webp`;
  for (const r of [fuente, placa])
    if (!existsSync(join(RAIZ, r))) throw new Error(`no se puede recortar "${id}": falta ${r}`);
  const vx0 = Math.max(0, region.x0 - HOLGURA);
  const vx1 = Math.min(TRAMO.ancho, region.x1 + HOLGURA);
  const vy1 = Math.min(TRAMO.alto, region.pie + HOLGURA);
  const cuadro = await rgb(fuente);
  const a = ventana(cuadro.v, vx0, vx1, vy1);
  const b = ventana((await rgb(placa)).v, vx0, vx1, vy1);
  const w = vx1 - vx0;
  const local = { x0: region.x0 - vx0, x1: region.x1 - vx0, pie: region.pie };
  const m = mascaraDeLaDiferencia(w, vy1, a, b, local);
  const pie = mascaraDelPie(w, vy1, pieDe(cuadro, filaDeLasPuertas(f, tramo)).subarray(vx0, vx1));
  for (let i = 0; i < m.v.length; i++) m.v[i] = Math.round((en(m.v, i) * en(pie.v, i)) / 255);
  const caja = medirCaja(m);
  if (caja === null) throw new Error(`"${id}": su cuadro y la placa no difieren en su región`);
  const toca: string[] = [];
  const encendidas = (x: number): number => {
    let n = 0;
    for (let y = 0; y < vy1; y++) if (en(m.v, y * w + x) > 127) n++;
    return n;
  };
  // Una columna del borde con lo encendido de un tercio de su alto es un
  // edificio cortado por su región, no el fundido de una esquina.
  const umbralDeBorde = Math.max(8, Math.round((caja.y1 - caja.y0) / 3));
  if (local.x0 > 0 && encendidas(local.x0) >= umbralDeBorde) toca.push(`x0 (${region.x0})`);
  if (local.x1 < w && encendidas(local.x1 - 1) >= umbralDeBorde) toca.push(`x1 (${region.x1})`);
  const ancho = caja.x1 - caja.x0;
  const alto = caja.y1 - caja.y0;
  const rgba = rgbaDe(a, m.v, w, { x0: caja.x0, y0: caja.y0, ancho, alto });
  return { tramo, en: [vx0 + caja.x0, caja.y0], ancho, alto, rgba, toca };
}

/**
 * Lo que pinta el juego de un tramo: su placa por encima del pie, de la fila 0 a
 * lo último con alfa, y desde el segundo con su solape fundido (`fundirElSolape`).
 */
export interface TramoDerivado {
  readonly ancho: number;
  readonly alto: number;
  readonly rgba: Buffer;
  /** La línea del pie, columna a columna. */
  readonly pie: Int16Array;
}

/**
 * Un tramo desde el segundo va encima del anterior con sus `SOLAPE` columnas de
 * la izquierda fundidas de transparente a opaco: caen dentro de la junta, hoja
 * sobre hoja del árbol que cada tramo lleva en ese borde, así que no se ve.
 * Hecho aquí y no en el cliente, que lo hacía con un lienzo por tramo al cargar.
 * Al centro de cada píxel, como el degradado del lienzo que sustituye.
 */
function fundirElSolape(rgba: Buffer, ancho: number, alto: number): void {
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < Math.min(SOLAPE, ancho); x++) {
      const o = (y * ancho + x) * 4 + 3;
      rgba[o] = Math.round(((rgba[o] as number) * (x + 0.5)) / SOLAPE);
    }
}

/** El pie de la placa de un tramo, la misma línea con que se corta (la leen el tramo, su suelo y `vista-base`). */
export async function pieDelTramo(f: FactionId, n: number): Promise<Int16Array> {
  return pieDe(await rgb(`${placaDelTramo(f, n)}.webp`), filaDeLasPuertas(f, n));
}

export async function derivarTramo(f: FactionId, n: number): Promise<TramoDerivado> {
  const placa = `${placaDelTramo(f, n)}.webp`;
  if (!existsSync(join(RAIZ, placa)))
    throw new Error(`no hay tramo ${n} que pintar: falta ${placa}`);
  const { v } = await rgb(placa);
  const pie = await pieDelTramo(f, n);
  const alto = Math.min(TRAMO.alto, Math.max(...pie) + FUNDIDO_DEL_PIE + 1);
  const m = mascaraDelPie(TRAMO.ancho, alto, pie);
  const rgba = rgbaDe(v, m.v, TRAMO.ancho, { x0: 0, y0: 0, ancho: TRAMO.ancho, alto });
  if (n > 1) fundirElSolape(rgba, TRAMO.ancho, alto);
  return { ancho: TRAMO.ancho, alto, rgba, pie };
}

/** Lo que se cose en cada eje para hacerlo repetible, en píxeles. */
const SOLAPES_DEL_SUELO = { x: 128, y: 64 } as const;
/** Lo que se deja por debajo del pie más bajo antes de tomar el empedrado (la sombra y el fundido quedan fuera). */
const DEBAJO_DEL_PIE = 24;
/** Las filas de abajo del todo que no se toman: Codex a veces oscurece el borde. */
const SIN_EL_BORDE = 12;
/**
 * Las columnas del medio de la placa de las que se saca el suelo. Codex pinta el
 * empedrado con fuga: las juntas se abren en abanico hacia los lados, y el
 * trozo entero repetido dejaba una uve en cada vuelta (T2 de la vuelta 3b). En
 * el medio van casi a plomo, como con la cámara ortográfica del juego. Con el
 * solape de `SOLAPES_DEL_SUELO.x`, el suelo se repite cada 6 pasos: con 512, cada
 * 4, y en un lienzo de 12 pasos se veía el mismo corro de adoquines tres veces.
 */
const COLUMNAS_DEL_SUELO = 896;
/** Lo menos que tiene que medir de alto el empedrado del que se saca el suelo. */
const ALTO_MINIMO_DEL_EMPEDRADO = 3 * SOLAPES_DEL_SUELO.y;

/** Las filas de empedrado limpio de una placa: de debajo de su pie más bajo al borde de abajo. */
async function empedradoDe(f: FactionId, n: number): Promise<{ y0: number; y1: number }> {
  const pie = await pieDelTramo(f, n);
  return {
    y0: Math.max(...pie) + FUNDIDO_DEL_PIE + DEBAJO_DEL_PIE,
    y1: TRAMO.alto - SIN_EL_BORDE,
  };
}

/**
 * De qué tramo se saca el empedrado de toda la plaza: del que más empedrado
 * limpio tiene (en el empate, el primero). Cuanto más alto el trozo, menos se
 * nota que se repite: el T1 de la vuelta 3b dejó 142 filas y el T2, 250.
 */
export async function tramoDelSuelo(f: FactionId): Promise<number | null> {
  let mejor: { n: number; alto: number } | null = null;
  for (const [i, hay] of placasDeLaBase(f).entries()) {
    if (!hay) continue;
    const { y0, y1 } = await empedradoDe(f, i + 1);
    if (mejor === null || y1 - y0 > mejor.alto) mejor = { n: i + 1, alto: y1 - y0 };
  }
  return mejor?.n ?? null;
}

/**
 * El empedrado de toda la plaza: el de una placa (`tramoDelSuelo`), de debajo
 * de su pie al borde de abajo y en sus `COLUMNAS_DEL_SUELO` del medio, hecho
 * repetible (`sueloRepetible`). Está a la
 * escala del cuadro (128 px por paso) y con su misma cámara, así que en el
 * juego se repite tal cual, escalado como las placas.
 */
export async function derivarSuelo(f: FactionId, n: number): Promise<Pixeles> {
  const placa = `${placaDelTramo(f, n)}.webp`;
  if (!existsSync(join(RAIZ, placa))) throw new Error(`no hay suelo que sacar: falta ${placa}`);
  const { v } = await rgb(placa);
  const { y0, y1 } = await empedradoDe(f, n);
  if (y1 - y0 < ALTO_MINIMO_DEL_EMPEDRADO) {
    throw new Error(
      `el empedrado de ${placa} va de la fila ${y0} a la ${y1}: no da para un suelo repetible (hacen falta ${ALTO_MINIMO_DEL_EMPEDRADO} filas)`,
    );
  }
  const x0 = Math.round((TRAMO.ancho - COLUMNAS_DEL_SUELO) / 2);
  const trozo = new Uint8Array(COLUMNAS_DEL_SUELO * (y1 - y0) * 3);
  for (let y = y0; y < y1; y++)
    trozo.set(
      v.subarray((y * TRAMO.ancho + x0) * 3, (y * TRAMO.ancho + x0 + COLUMNAS_DEL_SUELO) * 3),
      (y - y0) * COLUMNAS_DEL_SUELO * 3,
    );
  return sueloRepetible(
    { ancho: COLUMNAS_DEL_SUELO, alto: y1 - y0, v: trozo },
    SOLAPES_DEL_SUELO.x,
    SOLAPES_DEL_SUELO.y,
  );
}

/** La caja de lo que tiene algo de alfa (> 0), de `x0` a `x1` sin incluir. */
function medirCaja(m: Pixeles): { x0: number; x1: number; y0: number; y1: number } | null {
  let x0 = m.ancho;
  let x1 = -1;
  let y0 = m.alto;
  let y1 = -1;
  for (let y = 0; y < m.alto; y++)
    for (let x = 0; x < m.ancho; x++)
      if (en(m.v, y * m.ancho + x) > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, x1: x1 + 1, y0, y1: y1 + 1 };
}

/** Los tramos que tienen placa. */
export function placasDeLaBase(f: FactionId): boolean[] {
  const d = disposicionDe(f);
  return Array.from({ length: d.tramos }, (_, i) =>
    existsSync(join(RAIZ, `${placaDelTramo(f, i + 1)}.webp`)),
  );
}

/** Escribe una imagen derivada en WebP y devuelve su entrada del índice. */
async function escribirDerivada(
  ruta: string,
  rgba: Buffer,
  ancho: number,
  alto: number,
  canales: 3 | 4,
): Promise<DerivadaEnElIndice> {
  const webp = await sharp(rgba, { raw: { width: ancho, height: alto, channels: canales } })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer();
  await writeFile(join(RAIZ, ruta), webp);
  return {
    imagen: ruta.slice(ruta.lastIndexOf('/') + 1),
    ancho,
    alto,
    sha256: sha256(webp),
    origen: sha256(rgba),
  };
}

/** Cuántas imágenes se derivan a la vez: decodificar y comprimir van en los hilos de sharp. */
const A_LA_VEZ = 4;

/** `f` sobre cada elemento, como mucho `A_LA_VEZ` a la vez; el resultado en el orden de `xs`. */
async function deCuatroEnCuatro<T, R>(
  xs: readonly T[],
  f: (x: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(xs.length);
  let siguiente = 0;
  const obrero = async (): Promise<void> => {
    while (siguiente < xs.length) {
      const i = siguiente++;
      out[i] = await f(xs[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, xs.length) }, obrero));
  return out;
}

/** Las filas de arriba de cada tramo de las que se saca el cielo. */
const FILAS_DEL_CIELO = 4;

/**
 * Suma al cielo las `FILAS_DEL_CIELO` de arriba de un tramo. Un solo cielo para
 * todos: con el de cada uno, por encima de lo pintado se veía la raya donde se
 * cosen.
 */
function sumarElCielo(cielo: { suma: number[]; n: number }, t: TramoDerivado): void {
  for (let i = 0; i < t.ancho * Math.min(FILAS_DEL_CIELO, t.alto); i++) {
    for (let c = 0; c < 3; c++)
      cielo.suma[c] = (cielo.suma[c] as number) + (t.rgba[i * 4 + c] as number);
    cielo.n++;
  }
}

/**
 * Deriva lo que pinta el juego de cada tramo con placa, el suelo, el recorte de
 * cada edificio cuyo cuadro y placa ya están y la versión abierta de cada morada
 * que Codex ya pintó (como un recorte más, de `abiertaPintada`), y escribe el índice
 * (`assets/bases/<f>/indice.json`); borra lo que ya no se puede derivar. Es
 * idempotente: con las mismas fuentes, los mismos ficheros. Devuelve lo que
 * tiene que saber quien lo llama: qué se recortó y qué toca su región.
 */
export async function recortarLaBase(
  f: FactionId,
): Promise<{ indice: IndiceDeLaBase; avisos: string[] }> {
  const dir = join(RAIZ, dirDeLaBase(f));
  await mkdir(dir, { recursive: true });
  const avisos: string[] = [];
  const cielo = { suma: [0, 0, 0], n: 0 };
  const tramos = await deCuatroEnCuatro(placasDeLaBase(f), async (hay, i) => {
    const ruta = `${tramoDelJuego(f, i + 1)}.webp`;
    if (!hay) {
      if (existsSync(join(RAIZ, ruta))) await rm(join(RAIZ, ruta));
      return null;
    }
    const t = await derivarTramo(f, i + 1);
    sumarElCielo(cielo, t);
    return escribirDerivada(ruta, t.rgba, t.ancho, t.alto, 4);
  });
  let suelo: IndiceDeLaBase['suelo'] = null;
  const rutaDelSuelo = `${sueloDeLaBase(f)}.webp`;
  const delSuelo = await tramoDelSuelo(f);
  if (delSuelo !== null) {
    const s = await derivarSuelo(f, delSuelo);
    suelo = {
      ...(await escribirDerivada(rutaDelSuelo, Buffer.from(s.v), s.ancho, s.alto, 3)),
      tramo: delSuelo,
    };
  } else if (existsSync(join(RAIZ, rutaDelSuelo))) await rm(join(RAIZ, rutaDelSuelo));
  const ids = edificiosConArte(f);
  const recortes = await deCuatroEnCuatro(ids, async (id) => {
    const ruta = recorteDelJuego(f, id);
    let r: RecorteDerivado;
    try {
      r = await derivarRecorte(f, id);
    } catch (err) {
      // Lo que no se puede derivar todavía (falta su cuadro o su placa) no se
      // pinta: un recorte viejo de otro cuadro no casaría con la placa nueva.
      if (existsSync(join(RAIZ, ruta))) await rm(join(RAIZ, ruta));
      if (!(err instanceof Error && /falta /.test(err.message))) throw err;
      return null;
    }
    const entrada: RecorteEnElIndice = {
      ...(await escribirDerivada(ruta, r.rgba, r.ancho, r.alto, 4)),
      tramo: r.tramo,
      en: r.en,
    };
    return { entrada, toca: r.toca };
  });
  // En el orden de `edificiosConArte`, no en el que acabaron: el índice sale igual cada vez.
  const edificios: Record<string, RecorteEnElIndice> = {};
  for (const [i, id] of ids.entries()) {
    const r = recortes[i];
    if (r === null || r === undefined) continue;
    edificios[id] = r.entrada;
    if (r.toca.length > 0)
      avisos.push(`${id}: lo recortado toca el borde de su región en ${r.toca.join(' y ')}`);
  }
  // Las versiones abiertas, en el orden de las moradas: un recorte más, de su
  // fuente. Sin ella (o sin placa), nada, y lo viejo se borra.
  const moradas = moradasDeLaBase(f);
  const derivadas = await deCuatroEnCuatro(moradas, async (id) => {
    const ruta = abiertaDelJuego(f, id);
    const fuente = `${abiertaPintada(f, id)}.webp`;
    if (!existsSync(join(RAIZ, fuente))) {
      if (existsSync(join(RAIZ, ruta))) await rm(join(RAIZ, ruta));
      return null;
    }
    const r = await derivarRecorte(f, id, fuente).catch(async (err: unknown) => {
      if (existsSync(join(RAIZ, ruta))) await rm(join(RAIZ, ruta));
      if (!(err instanceof Error && /falta /.test(err.message))) throw err;
      return null;
    });
    if (r === null) return null;
    const entrada: RecorteEnElIndice = {
      ...(await escribirDerivada(ruta, r.rgba, r.ancho, r.alto, 4)),
      tramo: r.tramo,
      en: r.en,
    };
    return { entrada, toca: r.toca };
  });
  const abiertas: Record<string, RecorteEnElIndice> = {};
  for (const [i, id] of moradas.entries()) {
    const r = derivadas[i];
    if (r === null || r === undefined) continue;
    abiertas[id] = r.entrada;
    if (r.toca.length > 0)
      avisos.push(
        `${id} abierta: lo recortado toca el borde de su región en ${r.toca.join(' y ')}`,
      );
  }
  const indice: IndiceDeLaBase = {
    tramos,
    suelo,
    cielo:
      cielo.n === 0
        ? null
        : [
            Math.round((cielo.suma[0] as number) / cielo.n),
            Math.round((cielo.suma[1] as number) / cielo.n),
            Math.round((cielo.suma[2] as number) / cielo.n),
          ],
    edificios,
    abiertas,
    derivadoPor: 'tools/taller/recorte-base.ts',
  };
  await writeFile(join(dir, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);
  return { indice, avisos };
}

/** El índice escrito de una facción, o el vacío si no hay. */
export async function indiceEscrito(f: FactionId): Promise<IndiceDeLaBase> {
  const ruta = join(RAIZ, dirDeLaBase(f), 'indice.json');
  if (!existsSync(ruta)) return { ...INDICE_VACIO, tramos: placasDeLaBase(f).map(() => null) };
  return JSON.parse(await readFile(ruta, 'utf8')) as IndiceDeLaBase;
}

/**
 * Propone las regiones de un tramo: la diferencia entre su maestro y su placa en
 * todo lo que se ve de él, partida en tiradas de columnas encendidas. Lo que se
 * escribe en `data/bases/<f>.json` lo decide quien mira (la puerta se mide a
 * mano, a ×2): dos edificios que se tocan salen en una tirada.
 */
export async function medirLaBase(f: FactionId, tramo: number): Promise<string[]> {
  const maestro = `${maestroDelTramo(f, tramo)}.webp`;
  const placa = `${placaDelTramo(f, tramo)}.webp`;
  for (const r of [maestro, placa])
    if (!existsSync(join(RAIZ, r)))
      throw new Error(`no se puede medir el tramo ${tramo}: falta ${r}`);
  const { v: a } = await rgb(maestro);
  const { v: b } = await rgb(placa);
  const pie = Math.round(TRAMO.alto * 0.95);
  const m = mascaraDeLaDiferencia(TRAMO.ancho, TRAMO.alto, a, b, { x0: 0, x1: TRAMO.ancho, pie });
  const tiradas: { x0: number; x1: number }[] = [];
  let ini = -1;
  for (let x = 0; x <= TRAMO.ancho; x++) {
    let algo = false;
    if (x < TRAMO.ancho)
      for (let y = 0; y < TRAMO.alto && !algo; y++) algo = en(m.v, y * TRAMO.ancho + x) > 127;
    if (algo && ini < 0) ini = x;
    if (!algo && ini >= 0) {
      if (x - ini >= 24) tiradas.push({ x0: ini, x1: x });
      ini = -1;
    }
  }
  return tiradas.map((t) => {
    const sub = new Uint8Array(TRAMO.ancho * TRAMO.alto);
    for (let y = 0; y < TRAMO.alto; y++)
      for (let x = t.x0; x < t.x1; x++) sub[y * TRAMO.ancho + x] = en(m.v, y * TRAMO.ancho + x);
    const md = medir({ ancho: TRAMO.ancho, alto: TRAMO.alto, v: sub });
    return md === null
      ? `columnas ${t.x0}-${t.x1}: nada`
      : `columnas ${t.x0}-${t.x1}: de la fila ${md.arriba} al pie ${md.pie} (mediana del borde de abajo), centro ${md.centro}`;
  });
}
