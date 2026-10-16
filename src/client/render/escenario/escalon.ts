/**
 * El escalón entre dos niveles, pintado en el suelo (#211): lo que hace que lo
 * alto se lea alto y que lo bajo no se suba a lo alto.
 *
 * - **El nivel pintado** (`nivelPintado`): el nivel de cada punto del suelo. Es
 *   el de su casilla, salvo junto a una casilla más alta, que se adelanta sobre
 *   la baja entre `ORILLA` casillas con un ruido y las esquinas redondeadas: lo
 *   alto llega hasta el filo y un poco más, nunca lo bajo sube. Con el lado de
 *   casilla tal cual, donde ninguna pared lo tapa (la espalda al norte, una
 *   rampa, una orilla de caída 1) el agua y los suelos salían en rectángulos.
 *   Lo leen el agua, el tono, la sombra y las fronteras de los suelos.
 * - **El agua y el barro no suben** (`aguasDeLaEscena`): lo mojado de cada agua
 *   se cierra donde el nivel pintado queda por encima de ella, y el barro es una
 *   orilla fina al pie. Antes salían de una máscara de
 *   una casilla por píxel ampliada y desenfocada, que entraba un cuarto o media
 *   casilla en la tierra vecina sin mirar su nivel; en una espiga o un istmo de
 *   una casilla las dos orillas se comían la casilla entera, la pared quedaba
 *   flotando en el agua y el camino de s2 (25, 10-12) corría por encima del agua
 *   (auditoría 5, defecto 2).
 * - **Un tono por nivel** (`tonoDeLosNiveles`): lo bajo más oscuro y lo alto más
 *   claro, de borde neto por el nivel pintado, que es donde va la pared.
 *   Antes era una sombra por nivel desenfocada casilla y media, y el escalón no
 *   se leía (defecto 4); y luego, sutil, tampoco (auditoría 6, #217).
 * - **El labio de la espalda** (`labioDeLasEspaldas`, #217): una luz fina en lo
 *   alto a lo largo de cada caída hacia el norte, donde no hay cara a la vista.
 * - **El canto de la espalda** (`cantoDeLasEspaldas`, #219): la línea oscura de
 *   lo bajo justo al norte de ese filo. Sin ella el labio era niebla. Es lo
 *   único que oscurece la espalda, fino y nítido (#223).
 * - **La sombra al pie** (`sombraAlPie`): una franja sobre lo bajo al pie de cada
 *   caída, más larga hacia donde cae la sombra de la luz del contrato visual
 *   (`ARTE.luz`): al este, donde la ladera no tiene cara a la vista. Al norte no
 *   (#223): ahí va el canto.
 *
 * Puro: sin DOM. Todo a `PX_DEL_ESCALON` píxeles por casilla; quien pinta lo
 * amplía con suavizado, como los alfas de las fronteras.
 */
import { ARTE } from '../../../shared/arte.js';
import { fbm, mezclar, ruidoDe } from './fronteras.js';
import { ALTO_DE_NIVEL, caidaDeLadera, TALUD_DE_LADERA } from './relieve.js';
import type { Senda } from './sendas.js';

/**
 * Píxeles por casilla de las máscaras del escalón. A 16, ampliadas con
 * suavizado, el borde de una casilla cerrada sale nítido a cualquier zoom; el
 * desenfoque del agua, que antes se hacía sobre la superficie entera (66 px de
 * radio a 120 px por casilla), cuesta aquí lo mismo a cualquier resolución.
 */
export const PX_DEL_ESCALON = 16;

/** Lo que el escalón lee de la escena. */
export interface Rejilla {
  readonly W: number;
  readonly H: number;
  readonly nivel: readonly number[];
}

/** Un alfa (0-255) a `R` píxeles por casilla. */
export interface Mascara {
  readonly ancho: number;
  readonly alto: number;
  readonly R: number;
  readonly alfa: Uint8ClampedArray;
}

/**
 * Un indicador por casilla ampliado a `R` píxeles por casilla con interpolación
 * bilineal entre centros, los bordes estirados: lo mismo que pintaba el lienzo
 * de una casilla por píxel ampliado con suavizado.
 */
function campoBilineal(W: number, H: number, ind: Float32Array, R: number): Float32Array {
  const ancho = W * R;
  const alto = H * R;
  const fuera = new Float32Array(ancho * alto);
  for (let py = 0; py < alto; py++) {
    const fy = (py + 0.5) / R - 0.5;
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    const y1 = Math.min(H - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let px = 0; px < ancho; px++) {
      const fx = (px + 0.5) / R - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx)));
      const x1 = Math.min(W - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const a = ind[y0 * W + x0] as number;
      const b = ind[y0 * W + x1] as number;
      const c = ind[y1 * W + x0] as number;
      const d = ind[y1 * W + x1] as number;
      fuera[py * ancho + px] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return fuera;
}

/**
 * Los anchos de las tres cajas que, pasadas seguidas, se parecen a un
 * desenfoque gaussiano de `sigma` píxeles (el `blur()` del lienzo). Es la
 * receta habitual: dos anchos impares consecutivos, repartidos para que la
 * varianza de las tres sea `sigma²`.
 */
function cajasDe(sigma: number): readonly number[] {
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let menor = Math.floor(ideal);
  if (menor % 2 === 0) menor--;
  const mayor = menor + 2;
  const m = Math.round(
    (12 * sigma * sigma - n * menor * menor - 4 * n * menor - 3 * n) / (-4 * menor - 4),
  );
  return Array.from({ length: n }, (_, k) => (k < m ? menor : mayor));
}

/** Una pasada de caja de radio `r` a lo largo de cada fila, los bordes estirados. */
function cajaEnFilas(de: Float32Array, a: Float32Array, ancho: number, alto: number, r: number) {
  const n = 2 * r + 1;
  for (let y = 0; y < alto; y++) {
    const base = y * ancho;
    const en = (k: number) => de[base + (k < 0 ? 0 : k >= ancho ? ancho - 1 : k)] as number;
    let suma = 0;
    for (let k = -r; k <= r; k++) suma += en(k);
    for (let k = 0; k < ancho; k++) {
      a[base + k] = suma / n;
      suma += en(k + r + 1) - en(k - r);
    }
  }
}

/**
 * Una pasada de caja de radio `r` a lo largo de cada columna, los bordes
 * estirados. Fila a fila con una suma por columna: recorrer la columna salta
 * `ancho` posiciones de memoria por paso.
 */
function cajaEnColumnas(de: Float32Array, a: Float32Array, ancho: number, alto: number, r: number) {
  const n = 2 * r + 1;
  const fila = (k: number) => (k < 0 ? 0 : k >= alto ? alto - 1 : k) * ancho;
  const suma = new Float32Array(ancho);
  for (let k = -r; k <= r; k++) {
    const f = fila(k);
    for (let x = 0; x < ancho; x++) suma[x] = (suma[x] as number) + (de[f + x] as number);
  }
  for (let y = 0; y < alto; y++) {
    const base = y * ancho;
    const entra = fila(y + r + 1);
    const sale = fila(y - r);
    for (let x = 0; x < ancho; x++) {
      const v = suma[x] as number;
      a[base + x] = v / n;
      suma[x] = v + (de[entra + x] as number) - (de[sale + x] as number);
    }
  }
}

/** `a` desenfocado con un gaussiano de `sigma` píxeles (tres cajas), los bordes estirados. */
function desenfocar(a: Float32Array, ancho: number, alto: number, sigma: number): Float32Array {
  if (sigma < 0.5) return a;
  let de = a;
  const filas = new Float32Array(a.length);
  for (const w of cajasDe(sigma)) {
    const r = (w - 1) / 2;
    const sale = new Float32Array(a.length);
    cajaEnFilas(de, filas, ancho, alto, r);
    cajaEnColumnas(filas, sale, ancho, alto, r);
    de = sale;
  }
  return de;
}

/** El nivel de cada punto del suelo, a `R` píxeles por casilla (`nivelPintado`). */
export interface NivelPintado {
  readonly ancho: number;
  readonly alto: number;
  readonly R: number;
  readonly nivel: Int8Array;
}

/**
 * Lo más que lo alto se adelanta sobre una casilla más baja, en casillas, y lo
 * menos. Lo tapan la cara al sur (`caida · ALTO_DE_NIVEL`, 0,6 por nivel) y el
 * talud de las laderas (0,45 o más); al norte lo cubre el reborde de peñascos.
 */
export const ORILLA = { menos: 0.06, mas: 0.3 } as const;
/** Lo que se suaviza el borde de lo alto antes del umbral, en casillas: redondea las esquinas. */
const SUAVE_DE_LA_ORILLA = 0.18;
/** Las octavas del ruido de la orilla: longitud de onda en casillas y amplitud. */
const OCTAVAS_DE_LA_ORILLA: readonly (readonly [number, number])[] = [
  [1.7, 0.6],
  [0.6, 0.4],
];

/** El nivel de cada punto, el de su casilla tal cual: sin orilla. */
export function nivelPorCasilla(e: Rejilla, R = PX_DEL_ESCALON): NivelPintado {
  const { W, H, nivel } = e;
  const ancho = W * R;
  const alto = H * R;
  const fuera = new Int8Array(ancho * alto);
  for (let py = 0; py < alto; py++)
    for (let px = 0; px < ancho; px++)
      fuera[py * ancho + px] = nivel[Math.floor(py / R) * W + Math.floor(px / R)] as number;
  return { ancho, alto, R, nivel: fuera };
}

/**
 * El nivel de cada punto: el de su casilla, o el de la vecina más alta que más
 * pesa en él, donde su campo suavizado pasa del umbral que le toca. En un lado recto, el campo de lo
 * alto baja de ½ en el lado a 0 en el centro de la casilla baja, así que un
 * umbral de `½ − d` adelanta lo alto `d` casillas; el ruido reparte `d` entre
 * `ORILLA.menos` y `ORILLA.mas`. Solo sube: ningún punto queda por debajo del
 * nivel de su casilla, y por eso nada de lo bajo entra en una casilla alta.
 */
export function nivelPintado(
  e: Rejilla & { readonly semilla: number },
  R = PX_DEL_ESCALON,
): NivelPintado {
  const { W, H, nivel } = e;
  const { ancho, alto, nivel: fuera } = nivelPorCasilla(e, R);
  const niveles = [...new Set(nivel)].sort((p, q) => p - q);
  if (niveles.length < 2) return { ancho, alto, R, nivel: fuera };
  const ruido = ruidoDe(mezclar(e.semilla, 0x51ed270b), OCTAVAS_DE_LA_ORILLA, W, H);
  const umbral = new Float32Array(ancho * alto);
  for (let py = 0; py < alto; py++)
    for (let px = 0; px < ancho; px++)
      umbral[py * ancho + px] =
        0.5 -
        (ORILLA.menos + (ORILLA.mas - ORILLA.menos) * fbm(ruido, (px + 0.5) / R, (py + 0.5) / R));
  // El campo de cada nivel, el de las casillas que están justo a ese nivel: con
  // el de todo lo que está a ese nivel o más, una casilla alta pegada a una
  // ciudad baja adelantaba sobre el agua el nivel de la ciudad, no el suyo, y
  // junto al istmo de s2 (25, 10) salía una tira oscura de lo bajo.
  const campos = niveles.slice(1).map((k) => {
    const ind = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) if (nivel[i] === k) ind[i] = 1;
    return {
      k,
      campo: desenfocar(campoBilineal(W, H, ind, R), ancho, alto, SUAVE_DE_LA_ORILLA * R),
    };
  });
  // Cada punto toma el nivel más alto que el suyo que más pesa en él, si pasa del umbral.
  for (let p = 0; p < fuera.length; p++) {
    const suyo = fuera[p] as number;
    let mejor = suyo;
    let mas = umbral[p] as number;
    for (const { k, campo } of campos)
      if (k > suyo && (campo[p] as number) > mas) {
        mas = campo[p] as number;
        mejor = k;
      }
    fuera[p] = mejor;
  }
  return { ancho, alto, R, nivel: fuera };
}

/**
 * El nivel más alto de cada píxel y los de su alrededor: el agua de nivel `L`
 * entra en un píxel solo si aquí no pasa de `L`. El píxel de margen es el que
 * lee la ampliación bilineal: sin él, el borde de lo alto salía con medio píxel
 * de agua. Lo leen también el sotobosque y el centro hondo del agua; el
 * pintor lo hace una vez por escena y se lo pasa a los dos.
 */
export function techoDelAgua(np: NivelPintado): Int8Array {
  const { ancho, alto, nivel } = np;
  const filas = new Int8Array(nivel.length);
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const p = y * ancho + x;
      let m = nivel[p] as number;
      if (x > 0) m = Math.max(m, nivel[p - 1] as number);
      if (x + 1 < ancho) m = Math.max(m, nivel[p + 1] as number);
      filas[p] = m;
    }
  const fuera = new Int8Array(nivel.length);
  for (let y = 0; y < alto; y++)
    for (let x = 0; x < ancho; x++) {
      const p = y * ancho + x;
      let m = filas[p] as number;
      if (y > 0) m = Math.max(m, filas[p - ancho] as number);
      if (y + 1 < alto) m = Math.max(m, filas[p + ancho] as number);
      fuera[p] = m;
    }
  return fuera;
}

/**
 * La máscara del agua de las casillas `dentro`, desenfocada `desenfoque`
 * casillas, que no entra donde el nivel pintado (`np`) queda por encima del
 * agua de la que sale: cada nivel de agua se desenfoca aparte y se cierra en lo
 * que queda por encima de él (el agua de frontera va un nivel por debajo de su
 * orilla baja, la de un lago al de su región), y luego se toma la mayor. Con
 * `np` nulo, la de antes de #211: todo el agua junta y sin cerrar (para ver que
 * el guardia muerde).
 */
export function mascaraDelAgua(
  e: Rejilla,
  np: NivelPintado | null,
  dentro: (i: number) => boolean,
  desenfoque: number,
  R = PX_DEL_ESCALON,
): Mascara {
  return mascarasDelAgua(e, np, dentro, [desenfoque], R)[0] as Mascara;
}

/** `mascaraDelAgua` con varios desenfoques a la vez: el campo y el cierre se hacen una vez. */
function mascarasDelAgua(
  e: Rejilla,
  np: NivelPintado | null,
  dentro: (i: number) => boolean,
  desenfoques: readonly number[],
  R = PX_DEL_ESCALON,
  techo = np === null ? null : techoDelAgua(np),
): Mascara[] {
  const { W, H, nivel } = e;
  if (np !== null && np.R !== R)
    throw new Error(`el nivel pintado va a ${np.R} px por casilla y la máscara a ${R}`);
  const ancho = W * R;
  const alto = H * R;
  const alfas = desenfoques.map(() => new Uint8ClampedArray(ancho * alto));
  const niveles = new Set<number>();
  for (let i = 0; i < W * H; i++) if (dentro(i)) niveles.add(nivel[i] as number);
  for (const L of np === null ? [0] : [...niveles].sort((p, q) => p - q)) {
    const ind = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) if (dentro(i) && (np === null || nivel[i] === L)) ind[i] = 1;
    const base = campoBilineal(W, H, ind, R);
    desenfoques.forEach((desenfoque, k) => {
      const alfa = alfas[k] as Uint8ClampedArray;
      const campo = desenfocar(base, ancho, alto, desenfoque * R);
      for (let p = 0; p < alfa.length; p++) {
        const v = Math.round(255 * (campo[p] as number));
        if (v > (alfa[p] as number) && (techo === null || (techo[p] as number) <= L)) alfa[p] = v;
      }
    });
  }
  return alfas.map((alfa) => ({ ancho, alto, R, alfa }));
}

/**
 * Los píxeles de agua o de barro dentro de una casilla más alta que toda el agua
 * que llega a ella (`informe.aguaEnLoAlto`, #211): tiene que ser 0. Se cuenta
 * en la máscara del barro que se pinta, la más ancha, con el píxel de margen que lee la
 * ampliación, y «más alta» sin mirar cómo se hizo la máscara: más alta, por su
 * casilla, que el agua más alta a tres casillas, más allá de donde llega ningún
 * desenfoque. Con `sinEscalon`, la máscara de antes.
 */
export function aguaEnLoAlto(
  e: Rejilla & { readonly agua: readonly number[]; readonly semilla: number },
  sinEscalon = false,
): number {
  const { W, H, nivel } = e;
  const agua = new Set(e.agua);
  if (agua.size === 0) return 0;
  const R = PX_DEL_ESCALON;
  // El barro es lo más ancho que se pinta; la de antes, el agua desenfocada 0,55.
  const m = sinEscalon
    ? mascaraDelAgua(e, null, (i) => agua.has(i), 0.55, R)
    : aguasDeLaEscena(e, nivelPintado(e, R)).barro;
  const ALCANCE = 3;
  // Por casilla, el agua más alta a `ALCANCE` o menos (o nada).
  const techo = new Float64Array(W * H).fill(-Infinity);
  for (const i of agua) {
    const x = i % W;
    const y = Math.floor(i / W);
    for (let yy = Math.max(0, y - ALCANCE); yy <= Math.min(H - 1, y + ALCANCE); yy++)
      for (let xx = Math.max(0, x - ALCANCE); xx <= Math.min(W - 1, x + ALCANCE); xx++) {
        const j = yy * W + xx;
        techo[j] = Math.max(techo[j] as number, nivel[i] as number);
      }
  }
  const alta = (i: number) => !agua.has(i) && (nivel[i] as number) > (techo[i] as number);
  let n = 0;
  for (let py = 0; py < m.alto; py++)
    for (let px = 0; px < m.ancho; px++) {
      if ((m.alfa[py * m.ancho + px] as number) === 0) continue;
      // La casilla del píxel y las de los de su alrededor: lo que lee la ampliación.
      busca: for (let y = Math.max(0, py - 1); y <= Math.min(m.alto - 1, py + 1); y++)
        for (let x = Math.max(0, px - 1); x <= Math.min(m.ancho - 1, px + 1); x++)
          if (alta(Math.floor(y / R) * W + Math.floor(x / R))) {
            n++;
            break busca;
          }
    }
  return n;
}

/**
 * Lo que se tiene que ver de agua bajo una senda para que se lea «el camino va
 * por el agua»: un cuarto. Por debajo es la orilla o la espuma.
 */
const AGUA_SOBRE_LA_SENDA = 64;

/** Las máscaras del agua que pinta el paso 4 del pintor. */
export interface AguasDeLaEscena {
  /** La orilla: una franja fina de barro al pie del agua. */
  readonly barro: Mascara;
  readonly agua: Mascara;
  /** La espuma: un anillo justo dentro de la orilla. */
  readonly espuma: Mascara;
  /** El centro, más hondo: lo de las casillas con agua a los cuatro lados. */
  readonly hondo: Mascara;
}

/**
 * La orilla del agua, en casillas (#211): lo que el agua tarda en ser entera
 * desde su borde (`entra`), lo que el barro pasa del borde hacia fuera
 * (`barro`) y lo que se redondean las esquinas de lo mojado (`esquinas`).
 *
 * Antes cada máscara era el agua de sus casillas desenfocada (el barro, 0,55
 * casillas). Cerrada en lo alto, el corte caía donde el agua aún era
 * transparente: quedaba una banda ancha de barro pardo entre la meseta y el
 * agua (s443 (17-18, 19-22)) y un barrizal con islas de agua bajo las cuchillas
 * de s2. Ahora lo mojado es una región nítida y la orilla se mide desde su
 * borde: el barro, una franja fina al pie; lo que el agua deja en una casilla
 * alta lleva el suelo de esa casilla (`nivelPintado` y las fronteras).
 */
export const ORILLA_DEL_AGUA = {
  entra: 0.15,
  barro: 0.08,
  esquinas: 0.15,
  /** El desenfoque del centro hondo. */
  hondo: 0.5,
} as const;

/**
 * Lo que pesa la espuma en su anillo: entera, cada charca de la ciénaga salía
 * con un aro blanco de piscina (s443 (22-23, 23-25)).
 */
const ESPUMA_EN_LA_ORILLA = 0.55;

/** Φ(1,25): el campo desenfocado `σ = entra / 1,25` vale esto a `entra` dentro del borde. */
const ENTERA = 0.89;

/**
 * Lo nítido de cada nivel de `casillas`, la receta de lo mojado (#211) que
 * comparten el agua y el sotobosque: por cada nivel `L`, sus casillas ampliadas
 * con las esquinas redondeadas `esquinas` (en casillas) y cortadas a ½, menos
 * donde el techo (`techoDelAgua`) pasa de `L`; y eso desenfocado `borde`
 * casillas, que en el borde de lo nítido vale ½. Llama a `alPixel(p, v)` con
 * cada píxel `p` de la máscara entera donde el campo `v` pasa de 0 y el techo
 * no pasa de `L`: nada de lo de un nivel entra en lo cerrado. Quien llama toma
 * la mayor de los niveles.
 *
 * Cada nivel se hace en la caja de sus casillas con una de margen: lo que pasa
 * de ella es 0 (el campo bilineal muere a media casilla y los desenfoques no
 * llegan a la otra media), y el desenfoque recorre la fila desde un 0 igual que
 * en el mapa entero, así que sale lo mismo, píxel a píxel.
 */
function porNivelesBajoElTecho(
  e: Rejilla,
  casillas: readonly number[],
  np: NivelPintado,
  techo: Int8Array,
  esquinas: number,
  borde: number,
  alPixel: (p: number, v: number) => void,
): void {
  const { W, H, nivel } = e;
  const { R, ancho } = np;
  const niveles = [...new Set(casillas.map((i) => nivel[i] as number))].sort((p, q) => p - q);
  for (const L of niveles) {
    const deL = casillas.filter((i) => nivel[i] === L);
    let [cx0, cy0, cx1, cy1] = [W, H, -1, -1];
    for (const i of deL) {
      const x = i % W;
      const y = (i - x) / W;
      cx0 = Math.min(cx0, x);
      cy0 = Math.min(cy0, y);
      cx1 = Math.max(cx1, x);
      cy1 = Math.max(cy1, y);
    }
    cx0 = Math.max(0, cx0 - 1);
    cy0 = Math.max(0, cy0 - 1);
    cx1 = Math.min(W - 1, cx1 + 1);
    cy1 = Math.min(H - 1, cy1 + 1);
    const w = cx1 - cx0 + 1;
    const h = cy1 - cy0 + 1;
    const ind = new Float32Array(w * h);
    for (const i of deL) {
      const x = i % W;
      ind[((i - x) / W - cy0) * w + x - cx0] = 1;
    }
    const an = w * R;
    const al = h * R;
    /** El píxel de la máscara entera del píxel `q` de la caja. */
    const delMapa = (q: number) => {
      const qx = q % an;
      return ((q - qx) / an + cy0 * R) * ancho + qx + cx0 * R;
    };
    const redondo = desenfocar(campoBilineal(w, h, ind, R), an, al, esquinas * R);
    const nitido = new Float32Array(an * al);
    for (let q = 0; q < nitido.length; q++)
      if ((redondo[q] as number) > 0.5 && (techo[delMapa(q)] as number) <= L) nitido[q] = 1;
    const campo = desenfocar(nitido, an, al, borde * R);
    for (let q = 0; q < campo.length; q++) {
      const v = campo[q] as number;
      if (v <= 0) continue;
      const p = delMapa(q);
      if ((techo[p] as number) <= L) alPixel(p, v);
    }
  }
}

/**
 * Las máscaras del agua del pintor (paso 4), cada nivel de agua aparte y
 * tomando la mayor (`porNivelesBajoElTecho`). Lo mojado de un nivel: sus
 * casillas con las esquinas redondeadas, menos donde el nivel pintado (o el
 * píxel de al lado, que lee la ampliación) queda por encima. Su campo
 * desenfocado vale ½ en el borde: el agua sube de nada en el borde a entera
 * `entra` dentro; el barro es entero en el borde y se funde `barro` hacia
 * fuera; la espuma es un anillo justo dentro. Nada de eso pasa a lo cerrado.
 */
export function aguasDeLaEscena(
  e: Rejilla & { readonly agua: readonly number[] },
  np: NivelPintado,
  techo = techoDelAgua(np),
): AguasDeLaEscena {
  const { W } = e;
  const { R, ancho, alto } = np;
  const agua = new Set(e.agua);
  const honda = (i: number) => agua.has(i) && [1, -1, W, -W].every((d) => agua.has(i + d));
  const barro = new Uint8ClampedArray(ancho * alto);
  const aguaSola = new Uint8ClampedArray(ancho * alto);
  const espuma = new Uint8ClampedArray(ancho * alto);
  const O = ORILLA_DEL_AGUA;
  const sigma = O.entra / 1.25;
  // Donde el campo vale lo que vale `barro` fuera del borde: Φ(−barro/σ),
  // aproximada por la recta de la gaussiana en su centro (pendiente 0,4/σ).
  const fuera = Math.max(0, 0.5 - (0.4 * O.barro) / sigma);
  const sube = (v: number, desde: number, hasta: number) =>
    Math.max(0, Math.min(1, (v - desde) / (hasta - desde)));
  porNivelesBajoElTecho(e, e.agua, np, techo, O.esquinas, sigma, (p, v) => {
    const a = Math.round(255 * sube(v, 0.5, ENTERA));
    const b = Math.round(255 * sube(v, fuera, 0.5));
    const f = Math.round(
      255 * ESPUMA_EN_LA_ORILLA * Math.min(sube(v, 0.5, 0.62), 1 - sube(v, 0.75, ENTERA)),
    );
    if (a > (aguaSola[p] as number)) aguaSola[p] = a;
    if (b > (barro[p] as number)) barro[p] = b;
    if (f > (espuma[p] as number)) espuma[p] = f;
  });
  const [hondo] = mascarasDelAgua(e, np, honda, [O.hondo], R, techo) as [Mascara];
  const m = (alfa: Uint8ClampedArray): Mascara => ({ ancho, alto, R, alfa });
  return { barro: m(barro), agua: m(aguaSola), espuma: m(espuma), hondo };
}

/**
 * El sotobosque (14-10-2026): la huella del bosque en el suelo. Bajo el bosque
 * se pintaba la misma hierba que fuera (`sueloQueSePinta`), y al alejar, donde
 * el presupuesto de píxeles aclara los volúmenes, el tono del suelo es lo único
 * que dice dónde no se pasa. `esquinas` redondea lo de cada casilla, como lo
 * mojado del agua; `borde`, lo que se funde el borde, en casillas; `alfa`, lo
 * que pesa dentro.
 */
export const SOTOBOSQUE = { esquinas: 0.15, borde: 0.06, alfa: 0.5 } as const;

/**
 * La máscara del sotobosque, a los píxeles por casilla de `np`: las casillas de
 * `bosque` con la receta de lo mojado del agua (`porNivelesBajoElTecho`), cada
 * nivel de bosque aparte y cerrada donde el nivel pintado queda por encima de
 * él: lo alto que se adelanta sobre el bosque lleva su suelo. El nodo de un
 * paso no es del bosque, así que su hueco queda abierto.
 */
export function sotobosqueDe(
  e: Rejilla & { readonly bosque: readonly number[] },
  np: NivelPintado,
  techo = techoDelAgua(np),
): Mascara {
  const { R, ancho, alto } = np;
  const alfa = new Uint8ClampedArray(ancho * alto);
  porNivelesBajoElTecho(e, e.bosque, np, techo, SOTOBOSQUE.esquinas, SOTOBOSQUE.borde, (p, v) => {
    const a = Math.round(255 * SOTOBOSQUE.alfa * v);
    if (a > (alfa[p] as number)) alfa[p] = a;
  });
  return { ancho, alto, R, alfa };
}

/**
 * Los trozos de senda que se pintan bajo el agua (`informe.sendaSobreElAgua`,
 * #211): muestras cada décima de casilla por el eje de cada senda donde la
 * máscara del agua que se pinta pasa de `AGUA_SOBRE_LA_SENDA`. Cada racha
 * seguida de muestras cuenta una vez. Las sendas acaban en los estribos de los
 * puentes, así que lo que cuenta es una senda que cruza agua sin puente: un
 * fallo del trazado (un codo que corta en diagonal la esquina de dos casillas
 * de agua, la orilla de una charca a su nivel) que se arregla en el generador
 * (#210), no secando el agua. Es una medida, todavía no un guardia.
 */
export function sendaSobreElAgua(
  e: Rejilla & {
    readonly agua: readonly number[];
    readonly sendas: readonly Senda[];
    readonly semilla: number;
  },
): number {
  if (e.agua.length === 0) return 0;
  const R = PX_DEL_ESCALON;
  const m = aguasDeLaEscena(e, nivelPintado(e, R)).agua;
  let rachas = 0;
  for (const s of e.sendas) {
    let dentro = false;
    for (const [x, y] of muestras(s, 0.1)) {
      const px = Math.max(0, Math.min(m.ancho - 1, Math.floor(x * R)));
      const py = Math.max(0, Math.min(m.alto - 1, Math.floor(y * R)));
      const mojada = (m.alfa[py * m.ancho + px] as number) > AGUA_SOBRE_LA_SENDA;
      if (mojada && !dentro) rachas++;
      dentro = mojada;
    }
  }
  return rachas;
}

/** Puntos de la polilínea `s` cada `paso` casillas, con sus extremos. */
function* muestras(s: Senda, paso: number): Generator<readonly [number, number]> {
  for (let k = 0; k + 1 < s.length; k++) {
    const [x0, y0] = s[k] as readonly [number, number];
    const [x1, y1] = s[k + 1] as readonly [number, number];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / paso));
    for (let j = 0; j < n; j++) yield [x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n];
  }
  const ultimo = s[s.length - 1];
  if (ultimo !== undefined) yield ultimo;
}

/**
 * El tono de cada nivel: cuánto negro (`sombra`) o cuánta luz (`luz`) lleva lo
 * que se pisa a ese nivel, en alfa 0-1. La sombra se pinta encima; la luz, en
 * `soft-light`, que aclara sin lavar ni quemar: la textura sigue con su
 * contraste, sin la niebla de `screen`. El nivel 1 —el de casa, la mayor parte
 * del mapa— va casi sin tocar; el agua (−1) va debajo de su propia máscara.
 *
 * El escalón entre 1 y 2 es lo que tiene que leerse sin cara (#217): con un 6 %
 * de sombra contra un 8 % de luz, la lava a 2 de s13 y la nieve a 2 de s2 eran
 * iguales que a 1 (auditoría 6, defecto 4). Ahora es unas 2,5 veces más.
 */
export function tonoDeNivel(n: number): { readonly sombra: number; readonly luz: number } {
  if (n < 0) return { sombra: 0.3, luz: 0 };
  if (n === 0) return { sombra: 0.24, luz: 0 };
  if (n === 1) return { sombra: 0.1, luz: 0 };
  return { sombra: 0, luz: n === 2 ? 0.85 : 1 };
}

/**
 * Lo que se suaviza el borde del tono y del labio, en casillas: el nivel
 * pintado va a `PX_DEL_ESCALON` y, con el tono marcado de #217, sus escalones
 * de un píxel se veían como dientes de sierra a lo largo de la orilla, aun
 * ampliados con suavizado.
 */
const SUAVE_DEL_TONO = 0.05;

/** `alfa` (0-255) desenfocado `SUAVE_DEL_TONO` casillas. */
function suavizado(alfa: Float32Array, ancho: number, alto: number, R: number): Mascara {
  const v = desenfocar(alfa, ancho, alto, SUAVE_DEL_TONO * R);
  const fuera = new Uint8ClampedArray(ancho * alto);
  for (let p = 0; p < v.length; p++) fuera[p] = Math.round(v[p] as number);
  return { ancho, alto, R, alfa: fuera };
}

/**
 * El tono de los niveles: dos alfas, el de la sombra y el de la luz, por el
 * nivel pintado de cada punto, con el borde apenas suavizado
 * (`SUAVE_DEL_TONO`). Ampliados con suavizado, el cambio de tono va por la
 * orilla de lo alto, sin escalera.
 */
export function tonoDeLosNiveles(np: NivelPintado): {
  readonly sombra: Mascara;
  readonly luz: Mascara;
} {
  const { ancho, alto, R } = np;
  const sombra = new Float32Array(ancho * alto);
  const luz = new Float32Array(ancho * alto);
  for (let p = 0; p < np.nivel.length; p++) {
    const t = tonoDeNivel(np.nivel[p] as number);
    sombra[p] = 255 * t.sombra;
    luz[p] = 255 * t.luz;
  }
  return { sombra: suavizado(sombra, ancho, alto, R), luz: suavizado(luz, ancho, alto, R) };
}

/**
 * El labio de la espalda (#217): el canto iluminado de lo alto donde cae hacia
 * el norte, la caída que la cámara no ve de frente. `ancho` es lo que entra en
 * lo alto desde el filo, en casillas; `luz`, su alfa en el filo antes de
 * suavizarlo (`SUAVE_DEL_TONO`), que lo deja en ~0,55 de eso. Sin él, de la
 * nieve a la lava de s9 (27-33, 11) solo había un difuminado. Va en
 * `soft-light` y más estrecho desde #219: en `screen`, de 0,16 y sin nada
 * oscuro detrás, se leía como una hebra de niebla (s24 (0-3, 20,6)).
 */
export const LABIO = { ancho: 0.14, luz: 0.9 } as const;

/**
 * El labio de cada espalda, a `R` por casilla: en cada punto de lo alto cuyo
 * norte, a menos de `LABIO.ancho`, baja de nivel (por el nivel pintado, así que
 * sigue la misma orilla con ruido que el tono y el agua), una luz que se funde
 * desde el filo hacia dentro. Se busca solo hacia el norte, columna a columna:
 * al este y al oeste van las laderas y al sur la cara, que ya dicen el borde.
 * Si antes de bajar sube, no es un filo: es el pie de otra cosa.
 */
export function labioDeLasEspaldas(np: NivelPintado): Mascara {
  const { ancho, alto, R, nivel } = np;
  const alfa = new Float32Array(ancho * alto);
  const hasta = Math.ceil(LABIO.ancho * R);
  for (let py = 1; py < alto; py++)
    for (let px = 0; px < ancho; px++) {
      const p = py * ancho + px;
      const n = nivel[p] as number;
      for (let d = 1; d <= hasta && d <= py; d++) {
        const q = nivel[p - d * ancho] as number;
        if (q > n) break;
        if (q < n) {
          // Del centro del píxel al filo, en fracción del ancho del labio.
          const t = Math.min(1, (d - 0.5) / R / LABIO.ancho);
          alfa[p] = 255 * LABIO.luz * (1 - t * t);
          break;
        }
      }
    }
  return suavizado(alfa, ancho, alto, R);
}

/**
 * Las espaldas sin labio (`informe.espaldasSinLabio`, #217): casillas de un
 * reborde (más altas que la de su norte, `Escena.relieve.rebordes`) donde el
 * labio no llega a la mitad de `LABIO.luz` en ningún punto del filo: en la
 * casilla del norte, que es por donde lo alto se adelanta (`ORILLA`, y más en
 * la punta de un entrante estrecho), y hasta el lado, por el medio de su ancho
 * (las esquinas las decide la vecina). Tiene que ser 0. No
 * cuenta la que no tiene filo pintado de `FILO_MINIMO` de ancho: una casilla
 * baja suelta se la comen las orillas de lo alto que la rodean y queda, como
 * mucho, una punta de unos píxeles (3 de 1 095 rebordes en 1-40).
 * Con `labio`, se mide esa máscara (para ver que el guardia muerde).
 */
const FILO_MINIMO = 0.25;

export function espaldasSinLabio(
  e: Rejilla & {
    readonly semilla: number;
    readonly relieve: { readonly rebordes: readonly (readonly [number, number])[] };
  },
  labio?: Mascara,
): readonly (readonly [number, number])[] {
  const np = nivelPintado(e);
  const m = labio ?? labioDeLasEspaldas(np);
  const { R, ancho } = m;
  const umbral = (255 * LABIO.luz) / 2;
  return e.relieve.rebordes.filter(([x, y]) => {
    const px0 = Math.floor((x + 0.15) * R);
    const px1 = Math.ceil((x + 0.85) * R) - 1;
    const alto = e.nivel[y * e.W + x] as number;
    if (!conFilo(np, y, px0, px1, alto)) return false;
    for (let py = (y - 1) * R; py <= Math.min(m.alto - 1, y * R + 1); py++)
      for (let px = px0; px <= px1; px++)
        if ((m.alfa[py * ancho + px] as number) >= umbral) return false;
    return true;
  });
}

/**
 * El canto de la espalda (#219): la franja oscura de lo bajo justo al norte del
 * filo, donde lo alto tapa a la cámara el pie de su caída y echa su sombra (la
 * luz viene del sur). `ancho` es lo que entra en lo bajo desde el filo, en
 * casillas; `oscuro`, su alfa en el filo, entero en la fracción `entero` del
 * ancho y fundido después. Con el labio solo, una luz sin nada
 * oscuro detrás, la espalda se leía como una hebra de niebla (auditoría 7,
 * defecto 1); con el filo claro sobre una línea oscura, como un canto.
 *
 * Fina y entera desde #223: dos píxeles del escalón (0,125 casillas) a
 * `oscuro`, y nada después. De 0,28 con un fundido largo, y sumada a la sombra
 * al pie que la espalda echaba ~0,57 casillas al norte, se leía como «una
 * sombra difuminada, no se entiende» (marca del usuario en s55 (4,16)).
 */
export const CANTO = { ancho: 0.14, entero: 0.85, oscuro: 0.75 } as const;

/**
 * El canto de cada espalda, a `R` por casilla: en cada punto de lo bajo cuyo
 * sur, a menos de `CANTO.ancho`, sube de nivel (por el nivel pintado: el mismo
 * filo con ruido que el labio, el tono y el agua), una sombra que se funde
 * desde el filo hacia el norte. Si antes de subir baja, no es un filo. Por
 * donde baja una rampa (`sinSombra`, como la sombra al pie), nada: ahí se baja.
 */
export function cantoDeLasEspaldas(
  e: Rejilla,
  np: NivelPintado,
  sinSombra: (alto: number, bajo: number) => boolean = () => false,
): Mascara {
  const { ancho, alto, R, nivel } = np;
  const alfa = new Float32Array(ancho * alto);
  const hasta = Math.ceil(CANTO.ancho * R);
  for (let py = 0; py < alto - 1; py++)
    for (let px = 0; px < ancho; px++) {
      const p = py * ancho + px;
      const n = nivel[p] as number;
      for (let d = 1; d <= hasta && py + d < alto; d++) {
        const q = nivel[p + d * ancho] as number;
        if (q < n) break;
        if (q > n) {
          // La casilla alta es la del punto alto o, si ese punto es la orilla
          // que lo alto adelanta sobre la baja, la de su sur.
          const cx = Math.floor(px / R);
          const bajo = Math.floor(py / R) * e.W + cx;
          let altoEn = Math.floor((py + d) / R) * e.W + cx;
          if ((e.nivel[altoEn] as number) < q && altoEn + e.W < e.W * e.H) altoEn += e.W;
          if (sinSombra(altoEn, bajo)) break;
          // Entera la primera parte (`CANTO.entero`) y luego se funde: con una
          // caída desde el filo mismo, la línea oscura salía como un difuminado.
          const t = Math.min(1, (d - 0.5) / R / CANTO.ancho);
          const f = Math.max(0, (t - CANTO.entero) / (1 - CANTO.entero));
          alfa[p] = 255 * CANTO.oscuro * (1 - f) * (1 - f);
          break;
        }
      }
    }
  return suavizado(alfa, ancho, alto, R);
}

/**
 * Lo que puede oscurecer lo bajo al norte de una espalda (#223): `ancho`, en
 * casillas desde el filo pintado, de los puntos con un oscuro de `umbral` o más
 * (el canto y la sombra al pie juntos). Lo que pase de ahí ya no se lee como el
 * canto de una meseta sino como una sombra difuminada (la marca de s55 (4,16)).
 */
export const OSCURO_DE_LA_ESPALDA = { ancho: 0.25, umbral: 0.1 } as const;

/**
 * Lo que oscurece lo bajo al norte de cada espalda (#223): por cada casilla de
 * un reborde con filo pintado (las de `espaldasSinCanto`), la tirada más larga,
 * columna a columna por el medio de su ancho, de puntos de lo bajo seguidos
 * desde el filo hacia el norte con un oscuro de `OSCURO_DE_LA_ESPALDA.umbral` o
 * más, el canto y la sombra al pie compuestos como se pintan. No mira las
 * columnas a las que llega la sombra de una ladera de la casilla del norte
 * (`franjaDeSombra`): esa es de la ladera. Y en la casilla de su norte, la
 * tirada acaba donde llega la sombra de una ladera de esa casilla. Con `mascaras`, se miden esas (para
 * ver que el guardia muerde).
 */
export function oscuroAlNorteDeLasEspaldas(
  e: Rejilla &
    ConRampas & {
      readonly semilla: number;
      readonly relieve: { readonly rebordes: readonly (readonly [number, number])[] };
    },
  mascaras?: { readonly sombra: Mascara; readonly canto: Mascara },
): readonly { readonly x: number; readonly y: number; readonly ancho: number }[] {
  const np = nivelPintado(e);
  const sinSombra = sinSombraEnLasRampas(e);
  const sombra = mascaras?.sombra ?? sombraAlPie(e, np, sinSombra);
  const canto = mascaras?.canto ?? cantoDeLasEspaldas(e, np, sinSombra);
  const { R, ancho } = np;
  // Hasta dónde se busca lo alto: más allá, el oscuro ya pasa de la cuenta.
  const cerca = Math.ceil(2 * OSCURO_DE_LA_ESPALDA.ancho * R);
  const fuera: { x: number; y: number; ancho: number }[] = [];
  for (const [x, y] of e.relieve.rebordes) {
    if (sinSombra(y * e.W + x, (y - 1) * e.W + x)) continue;
    const px0 = Math.floor((x + 0.15) * R);
    const px1 = Math.ceil((x + 0.85) * R) - 1;
    const alto = e.nivel[y * e.W + x] as number;
    if (!conFilo(np, y, px0, px1, alto)) continue;
    // Las columnas que alcanza la sombra de una ladera vecina de una casilla:
    // `[desde, hasta]` en x, fuera de lo que esa sombra toca.
    const libreDeLaderas = (fy: number): readonly [number, number] => {
      let desdeX = 0;
      let hastaX = Number.POSITIVE_INFINITY;
      if (fy < 0) return [desdeX, hastaX];
      const norte = fy * e.W + x;
      for (const l of LADOS) {
        if (l.dy !== 0) continue;
        const vx = x - l.dx;
        if (vx < 0 || vx >= e.W) continue;
        const vecina = fy * e.W + vx;
        if (sinSombra(vecina, norte)) continue;
        const f = franjaDeSombra(e, vecina, norte, l);
        if (f === null) continue;
        if (l.dx === 1) desdeX = Math.max(desdeX, x + f.hasta);
        else hastaX = Math.min(hastaX, x + 1 - f.hasta);
      }
      return [desdeX, hastaX];
    };
    // La casilla del norte: sus columnas en la sombra de una ladera no se miran.
    const [desdeX, hastaX] = libreDeLaderas(y - 1);
    // Y la de su norte, adonde también llega la tirada: ahí, la sombra de su
    // ladera la corta. Sin ella, un hoyo de una casilla al norte de la espalda
    // (el nodo de acantilado de s36 (10,32) con los ríos, #144: lo alto se lo
    // come casi entero) unía el canto con la sombra que la ladera de (9,31)
    // echa sobre (10,31), y la tirada salía de 0,56.
    const [desdeX2, hastaX2] = libreDeLaderas(y - 2);
    let mayor = 0;
    for (let px = px0; px <= px1; px++) {
      const cx = (px + 0.5) / R;
      if (cx < desdeX || cx > hastaX) continue;
      const cortaEnLaOtra = cx < desdeX2 || cx > hastaX2;
      let py = y * R - 1;
      const tope = Math.max(0, (y - 2) * R);
      // Lo alto que se adelanta sobre la casilla del norte, hasta el filo.
      while (py >= tope && (np.nivel[py * ancho + px] as number) >= alto) py--;
      let ultimo = -1;
      for (; py >= tope; py--) {
        if (cortaEnLaOtra && py < (y - 1) * R) break;
        const p = py * ancho + px;
        if ((np.nivel[p] as number) >= alto) break;
        const oscuro =
          1 - (1 - (sombra.alfa[p] as number) / 255) * (1 - (canto.alfa[p] as number) / 255);
        if (oscuro < OSCURO_DE_LA_ESPALDA.umbral) break;
        ultimo = py;
      }
      if (ultimo >= 0) mayor = Math.max(mayor, aLoAlto(np, px, ultimo, cerca));
    }
    fuera.push({ x, y, ancho: mayor });
  }
  return fuera;
}

/**
 * La distancia, en casillas, del punto `(px, py)` del nivel pintado al filo más
 * cercano (un punto más alto que él), buscando hasta `cerca` píxeles (si no lo
 * hay, eso). En línea recta y no por la columna: en un filo en diagonal la
 * tirada de una columna es más larga que la línea de lado a lado. Y a cualquier
 * filo, no solo al de la espalda que se mira: en un hoyo de una casilla entre
 * dos niveles (s6 (28, 8)) el canto de otro filo cae en la misma columna.
 */
function aLoAlto(np: NivelPintado, px: number, py: number, cerca: number): number {
  const { R, ancho } = np;
  const n = np.nivel[py * ancho + px] as number;
  let d2 = (cerca + 1) * (cerca + 1);
  for (let dy = -cerca; dy <= cerca; dy++) {
    const qy = py + dy;
    if (qy < 0 || qy >= np.alto) continue;
    for (let dx = -cerca; dx <= cerca; dx++) {
      const qx = px + dx;
      if (qx < 0 || qx >= ancho) continue;
      if ((np.nivel[qy * ancho + qx] as number) > n) d2 = Math.min(d2, dx * dx + dy * dy);
    }
  }
  return Math.sqrt(d2) / R;
}

/** Las rampas de la escena: sus dos casillas, como `[x, y]`. */
interface ConRampas {
  readonly W: number;
  readonly relieve: {
    readonly bajadas: readonly {
      readonly alto: readonly [number, number];
      readonly bajo: readonly [number, number];
    }[];
  };
}

/** Los lados por donde baja una rampa (`Escena.relieve.bajadas`), como `(alta, baja)`: ahí no va la sombra al pie ni el canto. */
export function sinSombraEnLasRampas(e: ConRampas): (alto: number, bajo: number) => boolean {
  const rampas = new Set<string>();
  for (const b of e.relieve.bajadas) {
    const [ax, ay] = b.alto;
    const [bx, by] = b.bajo;
    const alto = ay * e.W + ax;
    rampas.add(`${alto},${by * e.W + bx}`);
    // Una diagonal baja por los dos lados de la esquina.
    if (bx !== ax && by !== ay) {
      rampas.add(`${alto},${ay * e.W + bx}`);
      rampas.add(`${alto},${by * e.W + ax}`);
    }
  }
  return (alto, bajo) => rampas.has(`${alto},${bajo}`);
}

/**
 * Las espaldas sin canto (`informe.espaldasSinCanto`, #219): casillas de un
 * reborde con filo pintado (el de `espaldasSinLabio`) donde el canto no llega a
 * la mitad de `CANTO.oscuro` en ningún punto de lo bajo de su casilla del
 * norte, por el medio de su ancho. Por donde baja una rampa no cuenta: ahí no
 * va. Tiene que ser 0. Con `canto`, se mide esa máscara (para ver que el
 * guardia muerde).
 */
export function espaldasSinCanto(
  e: Rejilla &
    ConRampas & {
      readonly semilla: number;
      readonly relieve: { readonly rebordes: readonly (readonly [number, number])[] };
    },
  canto?: Mascara,
): readonly (readonly [number, number])[] {
  const np = nivelPintado(e);
  const sinSombra = sinSombraEnLasRampas(e);
  const m = canto ?? cantoDeLasEspaldas(e, np, sinSombra);
  const { R, ancho } = m;
  const umbral = (255 * CANTO.oscuro) / 2;
  return e.relieve.rebordes.filter(([x, y]) => {
    if (sinSombra(y * e.W + x, (y - 1) * e.W + x)) return false;
    const px0 = Math.floor((x + 0.15) * R);
    const px1 = Math.ceil((x + 0.85) * R) - 1;
    const alto = e.nivel[y * e.W + x] as number;
    if (!conFilo(np, y, px0, px1, alto)) return false;
    for (let py = (y - 1) * R; py < y * R; py++)
      for (let px = px0; px <= px1; px++)
        if (
          (np.nivel[py * ancho + px] as number) < alto &&
          (m.alfa[py * ancho + px] as number) >= umbral
        )
          return false;
    return true;
  });
}

/**
 * Si la casilla del norte de un reborde de la fila `y` tiene lo bajo pintado
 * (por debajo de `alto`) en alguna fila, de `FILO_MINIMO` casillas de ancho o
 * más seguidas entre las columnas `px0` y `px1`: el filo que miran los guardias
 * del labio y del canto.
 */
function conFilo(np: NivelPintado, y: number, px0: number, px1: number, alto: number): boolean {
  const { R, ancho } = np;
  for (let py = (y - 1) * R; py < y * R; py++) {
    let seguidos = 0;
    for (let px = px0; px <= px1; px++) {
      seguidos = (np.nivel[py * ancho + px] as number) < alto ? seguidos + 1 : 0;
      if (seguidos >= FILO_MINIMO * R) return true;
    }
  }
  return false;
}

/** Lo que oscurece la sombra al pie donde es más honda. */
const SOMBRA_AL_PIE = 0.42;
/** Lo que la sombra pasa del pie además de lo que la echa la luz: el contacto de la pared con el suelo. */
const CONTACTO = 0.14;

/** Hacia dónde cae la sombra en el mapa, unitaria (`ARTE.luz.direccionSombra`). */
const HACIA_LA_SOMBRA = (() => {
  const { x, y } = ARTE.luz.direccionSombra;
  const m = Math.hypot(x, y);
  return { x: x / m, y: y / m };
})();

/**
 * Lo que mide la sombra de una caída de `caida` niveles en pantalla, en
 * casillas: su alto (`ALTO_DE_NIVEL` por nivel) por `longitudPorAltura`, la de
 * las figuras.
 */
const largoDeLaSombra = (caida: number) => caida * ALTO_DE_NIVEL * ARTE.luz.longitudPorAltura;

/**
 * Los cuatro lados de una casilla, con su normal hacia fuera. Los cuatro,
 * aunque con la luz de hoy solo el norte y el este llevan sombra: si cambia la
 * luz del contrato, cambian solos.
 */
const LADOS = [
  { dx: 0, dy: 1, normal: { x: 0, y: 1 } },
  { dx: 0, dy: -1, normal: { x: 0, y: -1 } },
  { dx: 1, dy: 0, normal: { x: 1, y: 0 } },
  { dx: -1, dy: 0, normal: { x: -1, y: 0 } },
] as const;

type Lado = (typeof LADOS)[number];

/**
 * La franja de la sombra al pie del lado `l` de la casilla `i` hacia su vecina
 * `j`, como distancias desde ese lado hacia lo bajo: entera hasta `desde` y
 * fundida hasta `hasta`. `null` si ese lado no echa sombra: no cae, o mira a la
 * luz. La leen la sombra y el guardia de la espalda (`oscuroAlNorteDeLasEspaldas`).
 */
function franjaDeSombra(
  e: Rejilla,
  i: number,
  j: number,
  l: Lado,
): { readonly desde: number; readonly hasta: number } | null {
  // La espalda: lo que la oscurece es el canto, una línea pegada al filo
  // pintado (#223). La franja que se fundía ~0,57 casillas al norte, contada
  // desde el lado de casilla y no desde el filo, se leía como una sombra
  // difuminada sin forma (la marca de s55 (4,16)).
  if (l.dy === -1) return null;
  const caida = (e.nivel[i] as number) - (e.nivel[j] as number);
  if (caida <= 0) return null;
  const haciaLaSombra = l.normal.x * HACIA_LA_SOMBRA.x + l.normal.y * HACIA_LA_SOMBRA.y;
  if (haciaLaSombra <= 0) return null;
  // Un barranco de una casilla (lo alto también al otro lado, en la misma
  // fila): no lleva laderas (`sinBarrancos`), así que no hay talud que tape la
  // franja, y entre las dos orillas que lo alto adelanta la sombra llenaba el
  // hueco entero. Solo el contacto.
  if (l.dx !== 0) {
    const otra = j + l.dx;
    const enLaFila = Math.floor(otra / e.W) === Math.floor(j / e.W);
    if (enLaFila && (e.nivel[otra] as number) > (e.nivel[j] as number))
      return { desde: 0, hasta: CONTACTO };
  }
  const largo = CONTACTO + largoDeLaSombra(caida) * haciaLaSombra;
  // El pie, como distancia desde el lado de casilla hacia lo bajo.
  const pie = l.dy === 1 ? caida * ALTO_DE_NIVEL : TALUD_DE_LADERA[caidaDeLadera(caida)];
  return { desde: pie, hasta: pie + largo };
}

/**
 * La sombra al pie de las caídas, sobre lo bajo, a `R` por casilla. La luz del
 * contrato visual viene de la izquierda y de la cámara: la sombra cae al este y
 * al norte (`ARTE.luz.direccionSombra`). Por cada lado de casilla entre una alta
 * y una baja que mira hacia ahí —la ladera al este; la espalda al norte no, que
 * lleva el canto (#223)—, una franja entera desde el lado hasta el pie de lo
 * que se pinta allí (el talud de la ladera; en un barranco, solo el contacto,
 * `franjaDeSombra`), que pasa del pie
 * el contacto más lo que la sombra de la caída avanza hacia ese lado, y se
 * funde hacia fuera y en sus puntas. Donde dos se solapan manda la mayor. No
 * cae en lo alto (por el nivel pintado), ni por donde baja una rampa
 * (`sinSombra`): ahí se baja.
 *
 * Al sur y al oeste, nada: esas caras miran a la luz. Con un contacto allí, la
 * franja quedaba a un talud del lado, donde el arte de las laderas de caída 3
 * no llega, y se leía como una raya oscura suelta en el agua (s2 (24, 10-11)).
 */
export function sombraAlPie(
  e: Rejilla,
  np: NivelPintado,
  sinSombra: (alto: number, bajo: number) => boolean = () => false,
): Mascara {
  const { W, H, nivel } = e;
  const { R } = np;
  const ancho = W * R;
  const alto = H * R;
  const v = new Float32Array(ancho * alto);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const l of LADOS) {
        const bx = x + l.dx;
        const by = y + l.dy;
        if (bx < 0 || by < 0 || bx >= W || by >= H) continue;
        const j = by * W + bx;
        if (sinSombra(i, j)) continue;
        const franja = franjaDeSombra(e, i, j, l);
        if (franja === null) continue;
        const { desde, hasta } = franja;
        const tope = nivel[j] as number;
        // La franja en coordenadas del lado: `u` a lo largo, `w` hacia lo bajo.
        // El lado y la caja que puede tocar la franja, en píxeles.
        const ux = l.dx === 0 ? 1 : 0;
        const uy = l.dx === 0 ? 0 : 1;
        const borde = l.dx === 1 ? x + 1 : l.dx === -1 ? x : l.dy === 1 ? y + 1 : y;
        const a0 = l.dx === 0 ? x : y;
        const FUNDIDO = 0.25;
        const caja = cajaDeFranja(l.dx, l.dy, borde, a0, hasta, FUNDIDO);
        const px0 = Math.max(0, Math.floor(caja[0] * R));
        const px1 = Math.min(ancho - 1, Math.ceil(caja[2] * R));
        const py0 = Math.max(0, Math.floor(caja[1] * R));
        const py1 = Math.min(alto - 1, Math.ceil(caja[3] * R));
        for (let py = py0; py <= py1; py++)
          for (let px = px0; px <= px1; px++) {
            const cx = (px + 0.5) / R;
            const cy = (py + 0.5) / R;
            // Sobre lo bajo: no en lo alto, tampoco donde se adelanta (`nivelPintado`).
            if ((np.nivel[py * ancho + px] as number) > tope) continue;
            const w = l.dx === 0 ? (cy - borde) * l.dy : (cx - borde) * l.dx;
            const u = cx * ux + cy * uy - a0;
            if (w < 0 || w > hasta) continue;
            // Entera hasta el pie, y se funde hacia fuera hasta `hasta`.
            const t = w <= desde ? 1 : 1 - (w - desde) / (hasta - desde);
            // Las puntas, fundidas medio `FUNDIDO` dentro y fuera del lado.
            const punta = Math.min(1, Math.max(0, (Math.min(u, 1 - u) + FUNDIDO / 2) / FUNDIDO));
            const s = SOMBRA_AL_PIE * t * t * punta;
            const p = py * ancho + px;
            if (s > (v[p] as number)) v[p] = s;
          }
      }
    }
  const alfa = new Uint8ClampedArray(ancho * alto);
  for (let p = 0; p < v.length; p++) alfa[p] = Math.round(255 * (v[p] as number));
  return { ancho, alto, R, alfa };
}

/** La caja `[x0, y0, x1, y1]` en casillas de la franja de un lado, `lejos` hacia lo bajo y `fundido` de holgura en las puntas. */
function cajaDeFranja(
  dx: number,
  dy: number,
  borde: number,
  a0: number,
  lejos: number,
  fundido: number,
): readonly [number, number, number, number] {
  if (dx === 0) {
    const [y0, y1] = dy === 1 ? [borde, borde + lejos] : [borde - lejos, borde];
    return [a0 - fundido, y0, a0 + 1 + fundido, y1];
  }
  const [x0, x1] = dx === 1 ? [borde, borde + lejos] : [borde - lejos, borde];
  return [x0, a0 - fundido, x1, a0 + 1 + fundido];
}
