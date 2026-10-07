/**
 * Las fronteras entre suelos: cuánto de cada suelo se ve en cada punto del mapa.
 *
 * Antes cada suelo era una máscara de una casilla por píxel, ampliada y
 * desenfocada. El contorno de un desenfoque de una frontera recta es la misma
 * recta: s13 enseñaba la nieve contra el verde en columnas de 10-20 casillas con
 * un halo borroso de casi una casilla (#169). Ahora la frontera es el umbral de
 * un campo suave más ruido, y el reparto entre dos suelos lo decide la altura de
 * sus texturas (la mezcla por altura de Mishkinis, *Advanced Terrain Texture
 * Splatting*): las piedras de un suelo asoman sobre las matas del otro y el borde
 * tiene dientes que siguen el dibujo.
 *
 * Puro: sin DOM. Quien pinta le da la luminancia de cada textura y pinta los
 * alfas que devuelve. Determinista: el ruido sale de un hash entero de la semilla
 * de la escena, la misma en el cliente, el espectador y el taller.
 */

/**
 * Píxeles por casilla de los alfas. El mismo para el esbozo y el bueno, que así
 * salen con la misma frontera; ampliado con suavizado a la resolución del suelo,
 * el borde queda con el grano de la textura y sin escalones. A 24 los dientes
 * salían iguales a zoom medio y costaba el doble (~0,1 s por superficie en
 * Node, frente a ~0,05).
 */
export const PX_DE_LAS_FRONTERAS = 16;

/** Casillas que mide la textura de un suelo al pintarla: el patrón que la repite. */
export const CASILLAS_POR_TEXTURA = 4;

/**
 * Lo que se deforma el mapa al leer los campos, en casillas: el serpenteo de la
 * frontera, de onda larga. Sin él, el ruido por suelo solo le ponía dientes y
 * una frontera de 15 casillas seguía leyéndose recta al tope de alejar.
 */
const DEFORMACION = 1.6;
/** El tope de la deformación, en casillas: un suelo no se mete más allá en el vecino. */
const TOPE_DE_DEFORMACION = 1.1;
/** Las octavas de la deformación. */
const OCTAVAS_DE_DEFORMACION: readonly (readonly [number, number])[] = [
  [6, 0.65],
  [2.5, 0.35],
];
/** Lo que pesa el ruido de cada suelo en la frontera: lo que la quiebra a escala de casilla. */
const RUIDO = 0.4;
/** Lo que pesa la altura de la textura: los dientes del borde. */
const ALTURA = 0.25;
/**
 * La anchura de la mezcla, en peso: lo que se funden dos suelos donde pesan casi
 * igual. Más pequeña, el borde se recorta; más grande, vuelve el halo.
 */
const MEZCLA = 0.12;
/** Las octavas del ruido: longitud de onda en casillas y amplitud. */
const OCTAVAS: readonly (readonly [number, number])[] = [
  [2, 0.65],
  [0.8, 0.35],
];
/**
 * Casillas alrededor de una frontera donde algo puede cambiar: el campo llega a
 * 1,5 de ella y la deformación a `TOPE_DE_DEFORMACION` más. Fuera, un solo suelo.
 */
const ALCANCE = 3;

/**
 * La luminancia (0-1) de la textura de un suelo, de `lado × lado` muestras, que
 * cubren `CASILLAS_POR_TEXTURA` casillas. Sin textura, el suelo no tiene altura.
 */
export interface AlturaDeSuelo {
  readonly lado: number;
  readonly luz: ArrayLike<number>;
}

export interface Fronteras {
  /** Los suelos, en el orden en que se pintan. */
  readonly suelos: readonly string[];
  /** Ancho y alto de cada alfa, en píxeles (`W·R × H·R`). */
  readonly ancho: number;
  readonly alto: number;
  /**
   * El alfa de cada suelo, ACUMULADO: pintados en orden con `source-over`, el
   * k-ésimo con `α_k / Σ_{j≤k} α_j`, dan exactamente `Σ α·textura`, sin que asome
   * lo de debajo en el fundido (con los alfas sin acumular asomaba el `dirt`).
   */
  readonly alfas: readonly Uint8ClampedArray[];
}

/**
 * Cuánto de cada suelo se ve, a `R` píxeles por casilla.
 *
 * 1. El campo de cada suelo: su indicador por casilla suavizado con [1,2,1]/4 en
 *    las dos direcciones e interpolado bilineal entre centros. Su contorno ½ es
 *    la frontera entre casillas, y su pendiente, de ½ por casilla, deja que el
 *    ruido la mueva sin que un suelo llegue a más de 1,5 casillas de las suyas.
 * 2. El peso: campo + ruido + altura. El ruido es distinto por suelo: el mismo
 *    se cancelaría al comparar dos pesos.
 * 3. La mezcla por altura: cuenta lo que queda a menos de `MEZCLA` del mayor.
 */
export function fronterasDelSuelo(
  e: {
    readonly W: number;
    readonly H: number;
    readonly suelo: readonly string[];
    readonly semilla: number;
  },
  alturas: (suelo: string) => AlturaDeSuelo | undefined,
  R = PX_DE_LAS_FRONTERAS,
): Fronteras {
  const { W, H } = e;
  if (e.suelo.length !== W * H)
    throw new Error(`el suelo tiene ${e.suelo.length} casillas y el mapa ${W}×${H}`);
  const suelos = [...new Set(e.suelo)];
  const ancho = W * R;
  const alto = H * R;
  const n = suelos.length;

  // 1 · Los campos por casilla, suavizados.
  const campos = suelos.map((s) => {
    const ind = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) if (e.suelo[i] === s) ind[i] = 1;
    const h = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = ind[y * W + x] as number;
        const iz = ind[y * W + Math.max(0, x - 1)] as number;
        const de = ind[y * W + Math.min(W - 1, x + 1)] as number;
        h[y * W + x] = (iz + 2 * c + de) / 4;
      }
    const v = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = h[y * W + x] as number;
        const ar = h[Math.max(0, y - 1) * W + x] as number;
        const ab = h[Math.min(H - 1, y + 1) * W + x] as number;
        v[y * W + x] = (ar + 2 * c + ab) / 4;
      }
    return v;
  });
  const alturasNorm = suelos.map((s) => normalizar(alturas(s)));
  const ruidos = suelos.map((_, k) => ruidoDe(mezclar(e.semilla, k + 1), OCTAVAS, W, H));
  const deformaX = ruidoDe(mezclar(e.semilla, 0x7f4a7c15), OCTAVAS_DE_DEFORMACION, W, H);
  const deformaY = ruidoDe(mezclar(e.semilla, 0x2c1b3c6d), OCTAVAS_DE_DEFORMACION, W, H);
  const indice = new Map(suelos.map((s, k) => [s, k]));
  const sueloDe = Int32Array.from(e.suelo, (s) => indice.get(s) as number);
  // Por casilla, si hay otro suelo a `ALCANCE` o menos: lo demás es interior.
  const cerca = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = e.suelo[y * W + x];
      busca: for (let dy = -ALCANCE; dy <= ALCANCE; dy++)
        for (let dx = -ALCANCE; dx <= ALCANCE; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (e.suelo[yy * W + xx] !== s) {
            cerca[y * W + x] = 1;
            break busca;
          }
        }
    }

  const alfas = suelos.map(() => new Uint8ClampedArray(ancho * alto));
  const pesos = new Float32Array(n);
  const presentes: number[] = [];
  for (let py = 0; py < alto; py++) {
    const cy = (py + 0.5) / R;
    for (let px = 0; px < ancho; px++) {
      const cx = (px + 0.5) / R;
      const p = py * ancho + px;
      const casilla = Math.floor(cy) * W + Math.floor(cx);
      if (cerca[casilla] === 0) {
        (alfas[sueloDe[casilla] as number] as Uint8ClampedArray)[p] = 255;
        continue;
      }
      // El punto deformado, y en él, desde el centro de la primera casilla (donde
      // vale el campo de cada una), la interpolación de los campos.
      const fx = cx + desvio(deformaX, cx, cy) - 0.5;
      const fy = cy + desvio(deformaY, cx, cy) - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx)));
      const x1 = Math.min(W - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
      const y1 = Math.min(H - 1, y0 + 1);
      const ty = Math.max(0, Math.min(1, fy - y0));
      presentes.length = 0;
      for (let k = 0; k < n; k++) {
        const c = campos[k] as Float32Array;
        const a = c[y0 * W + x0] as number;
        const b = c[y0 * W + x1] as number;
        const d = c[y1 * W + x0] as number;
        const f = c[y1 * W + x1] as number;
        const v = (a + (b - a) * tx) * (1 - ty) + (d + (f - d) * tx) * ty;
        pesos[k] = v;
        if (v > 0) presentes.push(k);
      }
      // Lo interior: un solo suelo, sin frontera que mover.
      if (presentes.length === 1) {
        (alfas[presentes[0] as number] as Uint8ClampedArray)[p] = 255;
        continue;
      }
      let mayor = -Infinity;
      for (const k of presentes) {
        const w =
          (pesos[k] as number) +
          RUIDO * (fbm(ruidos[k] as Ruido, cx, cy) - 0.5) +
          ALTURA * alturaEn(alturasNorm[k], cx, cy);
        pesos[k] = w;
        if (w > mayor) mayor = w;
      }
      let suma = 0;
      for (const k of presentes) {
        const b = Math.max(0, (pesos[k] as number) - (mayor - MEZCLA));
        pesos[k] = b;
        suma += b;
      }
      // Acumulados: cada alfa sobre lo que ya hay pintado de los anteriores.
      let hasta = 0;
      for (const k of presentes) {
        const b = pesos[k] as number;
        if (b <= 0) continue;
        hasta += b;
        (alfas[k] as Uint8ClampedArray)[p] = Math.round((255 * b) / hasta);
      }
      if (suma <= 0) throw new Error('la mezcla del suelo no dejó ningún suelo en un punto');
    }
  }
  return { suelos, ancho, alto, alfas };
}

/** La altura centrada en su media y acotada a ±½, con la escala de su desviación. */
function normalizar(a: AlturaDeSuelo | undefined): AlturaDeSuelo | undefined {
  if (a === undefined) return undefined;
  if (a.luz.length !== a.lado * a.lado)
    throw new Error(`la altura de un suelo tiene ${a.luz.length} muestras y no ${a.lado}²`);
  let media = 0;
  for (let i = 0; i < a.luz.length; i++) media += a.luz[i] as number;
  media /= a.luz.length;
  let varianza = 0;
  for (let i = 0; i < a.luz.length; i++) varianza += ((a.luz[i] as number) - media) ** 2;
  // Una textura lisa no tiene altura: que no divida entre cero.
  const escala = Math.max(Math.sqrt(varianza / a.luz.length), 1e-3) * 4;
  const luz = new Float32Array(a.luz.length);
  for (let i = 0; i < luz.length; i++)
    luz[i] = Math.max(-0.5, Math.min(0.5, ((a.luz[i] as number) - media) / escala));
  return { lado: a.lado, luz };
}

/** La altura en el punto (x, y) en casillas, en el mismo encaje que el patrón del suelo. */
function alturaEn(a: AlturaDeSuelo | undefined, x: number, y: number): number {
  if (a === undefined) return 0;
  const u = Math.floor(((x / CASILLAS_POR_TEXTURA) % 1) * a.lado);
  const v = Math.floor(((y / CASILLAS_POR_TEXTURA) % 1) * a.lado);
  return a.luz[v * a.lado + u] as number;
}

/** Un hash de 32 bits de dos enteros (el de `mulberry32` en `esparcir.ts`, sin estado). */
function mezclar(a: number, b: number): number {
  let t = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** El valor (0-1) del vértice entero (i, j) para una semilla. */
function vertice(semilla: number, i: number, j: number): number {
  return mezclar(mezclar(semilla, i), j) / 4294967296;
}

/**
 * Un ruido de valor con sus vértices ya calculados: dos `mezclar` por vértice y
 * cuatro vértices por octava y por punto eran la mitad del tiempo del pintor
 * (~0,2 s por superficie en Node; más en un Worker recién arrancado).
 */
interface Ruido {
  readonly octavas: readonly {
    readonly onda: number;
    readonly amplitud: number;
    readonly columnas: number;
    readonly vertices: Float32Array;
  }[];
  readonly total: number;
}

/** El ruido de `semilla` con sus `octavas`, para puntos de [0, W] × [0, H] casillas. */
function ruidoDe(
  semilla: number,
  octavas: readonly (readonly [number, number])[],
  W: number,
  H: number,
): Ruido {
  return {
    octavas: octavas.map(([onda, amplitud], o) => {
      const s = semilla + o * 0x632be5ab;
      const columnas = Math.ceil(W / onda) + 2;
      const filas = Math.ceil(H / onda) + 2;
      const vertices = new Float32Array(columnas * filas);
      for (let j = 0; j < filas; j++)
        for (let i = 0; i < columnas; i++) vertices[j * columnas + i] = vertice(s, i, j);
      return { onda, amplitud, columnas, vertices };
    }),
    total: octavas.reduce((t, [, a]) => t + a, 0),
  };
}

/**
 * Suma de octavas de ruido, en 0-1, en el punto (x, y) en casillas: en cada una,
 * la interpolación suave de Perlin entre los cuatro vértices de alrededor.
 */
function fbm(r: Ruido, x: number, y: number): number {
  let suma = 0;
  for (const o of r.octavas) {
    const X = x / o.onda;
    const Y = y / o.onda;
    const i = Math.floor(X);
    const j = Math.floor(Y);
    const u = X - i;
    const v = Y - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const k = j * o.columnas + i;
    const a = o.vertices[k] as number;
    const b = o.vertices[k + 1] as number;
    const c = o.vertices[k + o.columnas] as number;
    const d = o.vertices[k + o.columnas + 1] as number;
    suma += o.amplitud * ((a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv);
  }
  return suma / r.total;
}

/** Lo que se deforma una coordenada en (x, y), en casillas, acotado. */
function desvio(r: Ruido, x: number, y: number): number {
  const d = DEFORMACION * 2 * (fbm(r, x, y) - 0.5);
  return Math.max(-TOPE_DE_DEFORMACION, Math.min(TOPE_DE_DEFORMACION, d));
}
