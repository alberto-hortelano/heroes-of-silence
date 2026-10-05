/**
 * El pasillo de la senda: la franja alrededor del trazo suavizado donde no se
 * apoya nada que la tape. Se mide la distancia del trazo al RECTÁNGULO del
 * sprite, el mismo que pinta `pintarSprite`, y no a su pie: una mata de labranza
 * de 1,6 casillas de ancho crece desde su pie hasta tapar la senda.
 *
 * Un solo índice para todas las anchuras: se construye con la mayor y cada
 * pregunta lleva la suya.
 *
 * Puro: sin DOM, como el resto del escenógrafo.
 */
import type { Sprite } from './colocar.js';
import type { Senda } from './sendas.js';

/** Un rectángulo en casillas: `[x0, y0, x1, y1]`. */
export type Caja = readonly [number, number, number, number];

/** Lo que hace falta de un sprite para saber dónde cae su imagen. */
type ConImagen = Pick<Sprite, 'x' | 'y' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto'>;

/**
 * El rectángulo que ocupa la imagen de `s` con el alto `alto`, en casillas. Es
 * la cuenta con la que `pintarSprite` la pinta, así que lo que se mide aquí es
 * lo que se ve. El marcador (sin imagen: `nw = nh = 1`, ancla abajo en medio)
 * da un cuadrado de `alto × alto` que cubre su triángulo.
 */
export function cajaDeSprite(s: ConImagen, alto = s.alto): Caja {
  const k = alto / s.nh;
  const x0 = s.x - s.ax * k;
  const y0 = s.y - s.ay * k;
  return [x0, y0, x0 + s.nw * k, y0 + s.nh * k];
}

/** Pasos de la bisección de `altoLibre`: con 10, el error es una milésima del alto. */
const PASOS_DE_BISECCION = 10;

/**
 * Cuántos tramos seguidos de una senda van en un trozo. Las sendas suavizadas
 * son miles de tramos de una décima de casilla: casi todos se descartan en
 * bloque por la caja de su trozo antes de mirarlos uno a uno.
 */
const TRAMOS_POR_TROZO = 8;

/**
 * El pasillo de unas sendas, hasta una media anchura `radioMaximo` en casillas.
 *
 * Los tramos van en trozos, y cada trozo en las casillas que toca su caja
 * ampliada en `radioMaximo`, en arrays planos: una casilla sin trozos se
 * descarta con una resta. Todo en distancias al cuadrado y sin cierres ni
 * arrays por pregunta: `componer` hace decenas de miles.
 */
export class Pasillo {
  /** Los tramos: `ax, ay, bx, by` seguidos. */
  private readonly tramos: Float64Array;
  /** Cada trozo: su primer tramo y el siguiente al último. */
  private readonly trozos: Int32Array;
  /** La caja de cada trozo: `x0, y0, x1, y1` seguidos. */
  private readonly cajas: Float64Array;
  /** La rejilla que cubren los trozos: origen y tamaño, en casillas. */
  private readonly x0: number;
  private readonly y0: number;
  private readonly columnas: number;
  private readonly filas: number;
  /** Los trozos de la casilla `c` son `indices[inicio[c] .. inicio[c + 1]]`. */
  private readonly inicio: Int32Array;
  private readonly indices: Int32Array;
  /** Para no mirar dos veces un trozo que cae en varias casillas de la misma pregunta. */
  private readonly visto: Uint32Array;
  private vuelta = 0;
  /** Los tramos cerca de la caja entera de `altoLibre`, que es la que más abarca. */
  private readonly candidatos: number[] = [];

  constructor(
    sendas: readonly Senda[],
    private readonly radioMaximo: number,
  ) {
    if (!(radioMaximo > 0))
      throw new Error(`el pasillo necesita una media anchura positiva, no ${radioMaximo}`);
    const t: number[] = [];
    const trozos: number[] = [];
    const cajas: number[] = [];
    for (const l of sendas)
      for (let i = 0; i + 1 < l.length; i += TRAMOS_POR_TROZO) {
        const fin = Math.min(i + TRAMOS_POR_TROZO, l.length - 1);
        trozos.push(t.length / 4, t.length / 4 + fin - i);
        const caja = [Infinity, Infinity, -Infinity, -Infinity];
        for (let j = i; j < fin; j++) {
          const [ax, ay] = l[j] as readonly [number, number];
          const [bx, by] = l[j + 1] as readonly [number, number];
          t.push(ax, ay, bx, by);
          caja[0] = Math.min(caja[0] as number, ax, bx);
          caja[1] = Math.min(caja[1] as number, ay, by);
          caja[2] = Math.max(caja[2] as number, ax, bx);
          caja[3] = Math.max(caja[3] as number, ay, by);
        }
        cajas.push(...caja);
      }
    this.tramos = Float64Array.from(t);
    this.trozos = Int32Array.from(trozos);
    this.cajas = Float64Array.from(cajas);
    const n = trozos.length / 2;
    const r = radioMaximo;
    /** Las casillas que toca la caja del trozo `k` ampliada en el radio máximo. */
    const casillasDe = (k: number) => [
      Math.floor((cajas[4 * k] as number) - r),
      Math.floor((cajas[4 * k + 1] as number) - r),
      Math.floor((cajas[4 * k + 2] as number) + r),
      Math.floor((cajas[4 * k + 3] as number) + r),
    ];
    let [mx0, my0, mx1, my1] = [0, 0, -1, -1];
    for (let k = 0; k < n; k++) {
      const [cx0, cy0, cx1, cy1] = casillasDe(k) as [number, number, number, number];
      if (k === 0 || cx0 < mx0) mx0 = cx0;
      if (k === 0 || cy0 < my0) my0 = cy0;
      if (k === 0 || cx1 > mx1) mx1 = cx1;
      if (k === 0 || cy1 > my1) my1 = cy1;
    }
    this.x0 = mx0;
    this.y0 = my0;
    this.columnas = mx1 - mx0 + 1;
    this.filas = my1 - my0 + 1;
    // Dos pasadas: contar los trozos de cada casilla y luego repartirlos.
    const cuenta = new Int32Array(this.columnas * this.filas + 1);
    const repartir = (alPaso: (casilla: number, trozo: number) => void) => {
      for (let k = 0; k < n; k++) {
        const [cx0, cy0, cx1, cy1] = casillasDe(k) as [number, number, number, number];
        for (let y = cy0; y <= cy1; y++)
          for (let x = cx0; x <= cx1; x++) alPaso((y - this.y0) * this.columnas + x - this.x0, k);
      }
    };
    repartir((c) => {
      cuenta[c + 1] = (cuenta[c + 1] as number) + 1;
    });
    for (let c = 0; c < this.columnas * this.filas; c++)
      cuenta[c + 1] = (cuenta[c + 1] as number) + (cuenta[c] as number);
    this.inicio = cuenta.slice();
    this.indices = new Int32Array(cuenta[this.columnas * this.filas] as number);
    repartir((c, k) => {
      this.indices[cuenta[c] as number] = k;
      cuenta[c] = (cuenta[c] as number) + 1;
    });
    this.visto = new Uint32Array(n);
  }

  private comprobarRadio(r: number): void {
    if (!(r > 0 && r <= this.radioMaximo))
      throw new Error(
        `el pasillo se hizo para medias anchuras hasta ${this.radioMaximo}; ${r} no se puede preguntar`,
      );
  }

  /**
   * Los tramos a menos de `r` de la caja preguntada, cada uno una vez. Si
   * `guardar`, quedan todos en `candidatos`; si no, para en el primero y dice si
   * lo hubo.
   */
  private recorrer(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r: number,
    guardar: boolean,
  ): boolean {
    if (guardar) this.candidatos.length = 0;
    const cx0 = Math.max(Math.floor(x0) - this.x0, 0);
    const cy0 = Math.max(Math.floor(y0) - this.y0, 0);
    const cx1 = Math.min(Math.floor(x1) - this.x0, this.columnas - 1);
    const cy1 = Math.min(Math.floor(y1) - this.y0, this.filas - 1);
    if (cx0 > cx1 || cy0 > cy1) return false;
    const vuelta = ++this.vuelta;
    const t = this.tramos;
    const cajas = this.cajas;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cy * this.columnas + cx;
        const fin = this.inicio[c + 1] as number;
        for (let j = this.inicio[c] as number; j < fin; j++) {
          const k = this.indices[j] as number;
          if (this.visto[k] === vuelta) continue;
          this.visto[k] = vuelta;
          if (
            (cajas[4 * k] as number) - r > x1 ||
            (cajas[4 * k + 2] as number) + r < x0 ||
            (cajas[4 * k + 1] as number) - r > y1 ||
            (cajas[4 * k + 3] as number) + r < y0
          )
            continue;
          const hasta = this.trozos[2 * k + 1] as number;
          for (let i = this.trozos[2 * k] as number; i < hasta; i++) {
            const ax = t[4 * i] as number;
            const ay = t[4 * i + 1] as number;
            const bx = t[4 * i + 2] as number;
            const by = t[4 * i + 3] as number;
            if (
              Math.min(ax, bx) - r > x1 ||
              Math.max(ax, bx) + r < x0 ||
              Math.min(ay, by) - r > y1 ||
              Math.max(ay, by) + r < y0
            )
              continue;
            if (distancia2(ax, ay, bx, by, x0, y0, x1, y1) >= r * r) continue;
            if (!guardar) return true;
            this.candidatos.push(i);
          }
        }
      }
    return false;
  }

  /** Si algún candidato queda a menos de `r` de la caja. */
  private algunCandidato(x0: number, y0: number, x1: number, y1: number, r: number): boolean {
    const t = this.tramos;
    for (const k of this.candidatos) {
      const ax = t[4 * k] as number;
      const ay = t[4 * k + 1] as number;
      const bx = t[4 * k + 2] as number;
      const by = t[4 * k + 3] as number;
      if (
        Math.min(ax, bx) - r > x1 ||
        Math.max(ax, bx) + r < x0 ||
        Math.min(ay, by) - r > y1 ||
        Math.max(ay, by) + r < y0
      )
        continue;
      if (distancia2(ax, ay, bx, by, x0, y0, x1, y1) < r * r) return true;
    }
    return false;
  }

  /** Si la caja pisa el pasillo de media anchura `r`: si algún tramo le queda a menos de `r`. */
  pisa([x0, y0, x1, y1]: Caja, r: number): boolean {
    this.comprobarRadio(r);
    return this.recorrer(x0, y0, x1, y1, r, false);
  }

  /** Si el punto cae dentro del pasillo de media anchura `r`. */
  contiene(x: number, y: number, r: number): boolean {
    this.comprobarRadio(r);
    return this.recorrer(x, y, x, y, r, false);
  }

  /**
   * El mayor alto con el que `s` no pisa el pasillo de media anchura `r`, hasta
   * el suyo. La caja crece con el alto sin moverse del ancla, que está dentro
   * de la imagen, así que pisar es monótono en el alto y basta una bisección;
   * y toda caja más baja cabe en la entera, así que la bisección solo mira los
   * tramos que pisan la entera.
   *
   * Atajo: si el pie cae dentro, devuelve 0 sin bisección; es lo que daría.
   */
  altoLibre(s: ConImagen, r: number): number {
    this.comprobarRadio(r);
    const k = s.alto / s.nh;
    const ix = s.x - s.ax * k;
    const iy = s.y - s.ay * k;
    this.recorrer(ix, iy, ix + s.nw * k, iy + s.nh * k, r, true);
    if (this.candidatos.length === 0) return s.alto;
    if (this.algunCandidato(s.x, s.y, s.x, s.y, r)) return 0;
    let libre = 0;
    let pisado = s.alto;
    for (let paso = 0; paso < PASOS_DE_BISECCION; paso++) {
      const medio = (libre + pisado) / 2;
      const m = medio / s.nh;
      const x0 = s.x - s.ax * m;
      const y0 = s.y - s.ay * m;
      if (this.algunCandidato(x0, y0, x0 + s.nw * m, y0 + s.nh * m, r)) pisado = medio;
      else libre = medio;
    }
    return libre;
  }
}

/** Distancia al cuadrado de un punto a una caja (0 dentro). */
function puntoACaja2(x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  return dx * dx + dy * dy;
}

/** Distancia al cuadrado de un punto al tramo `a → b`. */
function puntoATramo2(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  const ex = x - (ax + t * dx);
  const ey = y - (ay + t * dy);
  return ex * ex + ey * ey;
}

/** Si el tramo `a → b` corta la caja (Liang-Barsky, con sus cuatro bordes a mano). */
function corta(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  // Cada borde es `p·t ≤ q`: izquierdo, derecho, de arriba y de abajo.
  if (dx === 0) {
    if (ax < x0 || ax > x1) return false;
  } else {
    let ra = (x0 - ax) / dx;
    let rb = (x1 - ax) / dx;
    if (dx < 0) [ra, rb] = [rb, ra];
    if (ra > t0) t0 = ra;
    if (rb < t1) t1 = rb;
    if (t0 > t1) return false;
  }
  if (dy === 0) {
    if (ay < y0 || ay > y1) return false;
  } else {
    let ra = (y0 - ay) / dy;
    let rb = (y1 - ay) / dy;
    if (dy < 0) [ra, rb] = [rb, ra];
    if (ra > t0) t0 = ra;
    if (rb < t1) t1 = rb;
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Distancia al cuadrado entre el tramo `a → b` y la caja. Si no se cortan, la
 * mínima entre dos convexos cae en un vértice de uno de los dos: un extremo del
 * tramo contra la caja, o una esquina de la caja contra el tramo.
 */
function distancia2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  if (corta(ax, ay, bx, by, x0, y0, x1, y1)) return 0;
  return Math.min(
    puntoACaja2(ax, ay, x0, y0, x1, y1),
    puntoACaja2(bx, by, x0, y0, x1, y1),
    puntoATramo2(x0, y0, ax, ay, bx, by),
    puntoATramo2(x1, y0, ax, ay, bx, by),
    puntoATramo2(x0, y1, ax, ay, bx, by),
    puntoATramo2(x1, y1, ax, ay, bx, by),
  );
}
