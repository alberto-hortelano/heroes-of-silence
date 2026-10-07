/**
 * Lo que se pinta de una cara de acantilado: solo lo que hay bajo la silueta de
 * su pared (#159).
 *
 * La cara era la banda entera, un rectángulo del filo al pie, y la pared se
 * ponía delante. Donde la pared no entraba (la reserva de un castillo, la senda
 * que baja al lado, el tablero de un puente) o donde su módulo es transparente
 * —el octavo derecho de un bloque de `paredes-*` lo es hasta media altura— la
 * banda asomaba lisa con sus bordes rectos. Ahora la cara sigue, columna a
 * columna, de lo alto de la silueta de las paredes que la tapan a su pie, y
 * donde no hay pared no se pinta: se ve el suelo de abajo, como en un tajo. El
 * borde sale de la silueta del arte (`Modulo.perfil`), irregular por
 * construcción.
 */
import type { Catalogo } from './catalogo.js';
import type { Sprite } from './colocar.js';
import { type Caja, cajaDeSprite } from './pasillo.js';
import { bandaDeCara, type Cara, type CaraDeEscena } from './relieve.js';

/** Cada cuánto, en casillas, se mide el contorno de una cara (`CaraDeEscena.pintada`). */
export const PASO_DE_CARA = 0.05;

/** El perfil de la silueta de un sprite, si su módulo lo trae (`Modulo.perfil`). */
export type PerfilDe = (s: Sprite) => readonly number[] | undefined;

/**
 * El perfil de cada sprite según su módulo del catálogo. Un sprite sin arte (el
 * marcador) o recortado de una hoja no lo tiene: cuenta su caja.
 */
export function perfilesDelCatalogo(catalogo: Catalogo): PerfilDe {
  const porSrc = new Map<string, readonly number[]>();
  for (const ms of Object.values(catalogo.hojas))
    for (const m of ms) if (m.perfil !== undefined) porSrc.set(m.src, m.perfil);
  return (s) => (s.src === null || s.recorte !== undefined ? undefined : porSrc.get(s.src));
}

/**
 * Lo alto de la silueta de `s` en la columna `x`, en casillas, o `undefined`
 * si la columna cae fuera de su caja. Sin perfil, lo alto de la caja.
 */
export function altoDeLaSilueta(
  s: Sprite,
  perfil: readonly number[] | undefined,
  x: number,
  caja: Caja = cajaDeSprite(s),
): number | undefined {
  const [x0, y0, x1, y1] = caja;
  if (x < x0 || x > x1) return undefined;
  if (perfil === undefined || perfil.length === 0) return y0;
  const franja = Math.min(perfil.length - 1, Math.floor(((x - x0) / (x1 - x0)) * perfil.length));
  return y0 + (perfil[franja] as number) * (y1 - y0);
}

/**
 * Si `(x, y)` cae bajo la silueta de `s`: dentro de su caja y por debajo de lo
 * alto de su silueta en esa columna. Lo de debajo de la cresta cuenta como
 * opaco. La misma pregunta para el contorno de la cara y para el contador.
 */
export function bajoLaSilueta(
  s: Sprite,
  perfil: readonly number[] | undefined,
  x: number,
  y: number,
  caja: Caja = cajaDeSprite(s),
): boolean {
  const alto = altoDeLaSilueta(s, perfil, x, caja);
  return alto !== undefined && y >= alto && y <= caja[3];
}

/** Las columnas en las que se mide una cara: de `x0` a `x1 + 1`, cada `PASO_DE_CARA`, ambos incluidos. */
export function columnasDeCara(c: Cara): number[] {
  const n = Math.round((c.x1 + 1 - c.x0) / PASO_DE_CARA);
  return Array.from({ length: n + 1 }, (_, i) => c.x0 + i * PASO_DE_CARA);
}

/** Las paredes (la clase `pared`: frontal, laderas, peñascos) cuya caja toca la banda de `c`, con su caja. */
function paredesDeLaBanda(
  c: Cara,
  sprites: readonly Sprite[],
): { readonly s: Sprite; readonly caja: Caja }[] {
  const [x0, y0, x1, y1] = bandaDeCara(c);
  const fuera: { s: Sprite; caja: Caja }[] = [];
  for (const s of sprites) {
    if (s.clase !== 'pared') continue;
    const caja = cajaDeSprite(s);
    if (caja[2] >= x0 && caja[0] <= x1 && caja[1] <= y1 && caja[3] >= y0) fuera.push({ s, caja });
  }
  return fuera;
}

/**
 * Lo que una pared deja sin tapar entre ella y la siguiente de la misma columna
 * y aun así se pinta de cara, en casillas: la cara es el fondo de las juntas
 * entre módulos, y sin ella asomaba el suelo de abajo por una rendija.
 */
const JUNTA_ENTRE_PAREDES = 0.15;

/**
 * El contorno de lo que se pinta de `c`: en cada columna de `columnasDeCara`,
 * lo que tapan seguidas las paredes que tocan su banda, de lo alto de su
 * silueta a lo bajo de su caja, recortado al filo y al pie. Si en una columna
 * hay dos tramos tapados con más de `JUNTA_ENTRE_PAREDES` entre ellos, el más
 * largo: pintado de punta a punta, el hueco entre los dos era una tira lisa (la
 * pared de una escalera que no baja al pie de su cara y la cresta de la de
 * abajo, s37 y7 x19). `null` donde no la tapa ninguna. Lo calcula `componer`
 * con todo puesto.
 */
export function pintadaDeCara(
  c: Cara,
  sprites: readonly Sprite[],
  perfilDe: PerfilDe,
): CaraDeEscena['pintada'] {
  const [, filo, , pie] = bandaDeCara(c);
  const paredes = paredesDeLaBanda(c, sprites);
  return columnasDeCara(c).map((x) => {
    const tapan: [number, number][] = [];
    for (const { s, caja } of paredes) {
      const alto = altoDeLaSilueta(s, perfilDe(s), x, caja);
      if (alto === undefined) continue;
      const desde = Math.max(filo, alto);
      const hasta = Math.min(pie, caja[3]);
      if (hasta > desde) tapan.push([desde, hasta]);
    }
    tapan.sort((p, q) => p[0] - q[0]);
    let mejor: [number, number] | null = null;
    let tramo: [number, number] | null = null;
    for (const [desde, hasta] of tapan) {
      if (tramo !== null && desde <= tramo[1] + JUNTA_ENTRE_PAREDES)
        tramo[1] = Math.max(tramo[1], hasta);
      else tramo = [desde, hasta];
      if (mejor === null || tramo[1] - tramo[0] > mejor[1] - mejor[0]) mejor = [tramo[0], tramo[1]];
    }
    return mejor;
  });
}

/** Cuánto de ancho y de alto, en casillas, tiene que medir un trozo de cara lisa para contar. */
export const CARA_LISA_MINIMA = 0.3;

/** Cada cuánto se mide en alto lo liso de una columna, en casillas. */
const PASO_EN_ALTO = 0.1;

/** Un trozo de cara que se pinta y no tapa ninguna pared (`carasLisas`). */
export interface CaraLisa {
  /** La cara, por su índice en `caras`. */
  readonly cara: number;
  /** De qué x a qué x va el trozo. */
  readonly a: number;
  readonly b: number;
}

/**
 * Los trozos lisos de las caras: lo que se pinta de cada una (`pintada`) y no queda bajo la silueta de ninguna pared. Una columna es
 * lisa si, medida cada `PASO_EN_ALTO`, al menos `CARA_LISA_MINIMA` de su alto no
 * lo tapa nada; cuenta el trozo de columnas lisas seguidas que mide al menos
 * `CARA_LISA_MINIMA` de ancho. Lee lo que el pintor pinta, no la regla que lo
 * decide: con `pintada` igual a la banda entera, lo de antes de #159, da 793 en
 * las semillas 1-40.
 */
export function carasLisas(
  caras: readonly CaraDeEscena[],
  sprites: readonly Sprite[],
  perfilDe: PerfilDe,
): CaraLisa[] {
  const fuera: CaraLisa[] = [];
  for (const [k, c] of caras.entries()) {
    const paredes = paredesDeLaBanda(c, sprites);
    const xs = columnasDeCara(c);
    let desde: number | undefined;
    const cerrar = (x: number) => {
      if (desde !== undefined && x - desde >= CARA_LISA_MINIMA - 1e-9)
        fuera.push({ cara: k, a: desde, b: x });
      desde = undefined;
    };
    for (const [i, x] of xs.entries()) {
      const tramo = c.pintada[i];
      let lisa = 0;
      if (tramo != null)
        for (let y = tramo[0] + PASO_EN_ALTO / 2; y < tramo[1]; y += PASO_EN_ALTO)
          if (!paredes.some(({ s, caja }) => bajoLaSilueta(s, perfilDe(s), x, y, caja)))
            lisa += PASO_EN_ALTO;
      if (lisa >= CARA_LISA_MINIMA - 1e-9) desde ??= x;
      else cerrar(x);
    }
    cerrar(xs.at(-1) ?? c.x1 + 1);
  }
  return fuera;
}
