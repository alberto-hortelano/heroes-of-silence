/**
 * Lo que no se tapa, en un solo índice (#151): el pasillo de la senda y de la
 * rampa de cada bajada, el tablero de cada puente, el eje de cada paso y la
 * reserva de cada objeto. Se mide la distancia de sus trazos al RECTÁNGULO del
 * sprite, el mismo que pinta `pintarSprite`, y no a su pie: una mata de labranza
 * de 1,6 casillas de ancho crece desde su pie hasta tapar la senda. Cada forma
 * dice con qué media anchura mira a quién, y si mira el rectángulo o solo el pie.
 * Lo que no son trazos va como un tope (`Tope`): lo que se pisa junto a un
 * bosque o una montaña, que la copa de la masa no tapa por los lados.
 *
 * Antes eran dos respuestas a «¿está libre?»: este pasillo y una rejilla de
 * cuartos de casilla con discos para las reservas, que solo miraba el pie (los
 * árboles se sondeaban a mano por encima de él para no tapar un objeto).
 *
 * Puro: sin DOM, como el resto del escenógrafo.
 */
import type { Sprite } from './colocar.js';
import type { Senda } from './sendas.js';

/** Un rectángulo en casillas: `[x0, y0, x1, y1]`. */
export type Caja = readonly [number, number, number, number];

/** Lo que hace falta de un sprite para saber dónde cae su imagen. */
export type ConImagen = Pick<Sprite, 'x' | 'y' | 'nw' | 'nh' | 'ax' | 'ay' | 'alto' | 'ancho'>;

/**
 * El rectángulo que ocupa la imagen de `s` con el alto `alto`, en casillas. Es
 * la cuenta con la que `pintarSprite` la pinta, así que lo que se mide aquí es
 * lo que se ve. El marcador (sin imagen: `nw = nh = 1`, ancla abajo en medio)
 * da un cuadrado de `alto × alto` que cubre su triángulo.
 */
export function cajaDeSprite(s: ConImagen, alto = s.alto): Caja {
  const k = alto / s.nh;
  // Estirado en alto (`Sprite.ancho`), el ancho no sigue a su proporción; encogido, encoge igual.
  const kx = s.ancho === undefined ? k : (s.ancho / s.nw) * (alto / s.alto);
  const x0 = s.x - s.ax * kx;
  const y0 = s.y - s.ay * k;
  return [x0, y0, x0 + s.nw * kx, y0 + s.nh * k];
}

/** Pasos de la bisección de `altoLibre`: con 10, el error es una milésima del alto. */
const PASOS_DE_BISECCION = 10;

/**
 * Cuántos tramos seguidos de un trazo van en un trozo. Las sendas suavizadas
 * son miles de tramos de una décima de casilla: casi todos se descartan en
 * bloque por la caja de su trozo antes de mirarlos uno a uno.
 */
const TRAMOS_POR_TROZO = 8;

/**
 * Cómo mide una forma a quien pregunta: a qué distancia de sus trazos no puede
 * llegar, y si lo que no puede llegar es su rectángulo o solo su pie (el
 * rectángulo con alto 0, el punto `x, y`).
 */
export interface Medida {
  readonly radio: number;
  readonly soloElPie: boolean;
}

/**
 * Un obstáculo del escenógrafo: unos trazos —una senda, la rampa de una bajada,
 * el tablero de un puente, el eje de un paso, el sitio de un objeto, que es un
 * trazo de un solo punto— y la regla con la que mide a cada sprite.
 */
export interface Forma<S extends ConImagen = ConImagen> {
  readonly trazos: readonly Senda[];
  /** La mayor media anchura que da `mide`: hasta dónde se le pregunta. */
  readonly alcance: number;
  /**
   * La medida con la que mira a `s` si tuviera el alto `alto`, o null si no lo
   * mira. Pisar tiene que crecer con el alto (un rectángulo que crece, una
   * regla que empieza a mirar al pasar de un umbral): `altoLibre` biseca.
   */
  readonly mide: (s: S, alto: number) => Medida | null;
}

/**
 * Un obstáculo que no es un trazo sino una regla sobre el ancho de `s`: el mayor
 * alto, hasta `hasta`, con el que `s` no lo pisa (`hasta` si no lo mira). Como
 * una forma, pisar crece con el alto. Lo pregunta primero quien pregunta al
 * índice, así que tiene que descartar barato lo que no mira.
 */
export type Tope<S extends ConImagen = ConImagen> = (s: S, hasta: number) => number;

/**
 * Un solo índice de obstáculos (#151): ¿está libre el sitio de un sprite, y
 * hasta qué alto? Lo preguntan todo lo que se aparta y la puerta de la pared;
 * cada forma dice con qué medida mira a quién.
 *
 * Los tramos van en trozos, y cada trozo en las casillas que toca su caja
 * ampliada en el alcance de su forma, en arrays planos: una casilla sin trozos
 * se descarta con una resta. Todo en distancias al cuadrado y sin arrays por
 * pregunta: `componer` hace decenas de miles.
 */
export class Obstaculos<S extends ConImagen = ConImagen> {
  /** Los tramos: `ax, ay, bx, by` seguidos. Un punto es un tramo de largo cero. */
  private readonly tramos: Float64Array;
  /** La forma de cada tramo. */
  private readonly formaDe: Int32Array;
  /** Cada trozo: su primer tramo y el siguiente al último. */
  private readonly trozos: Int32Array;
  /** La caja de cada trozo ampliada en el alcance de su forma: `x0, y0, x1, y1` seguidos. */
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
  /** Los tramos cerca de la caja entera de la pregunta, que es la que más abarca. */
  private readonly candidatos: number[] = [];

  constructor(
    readonly formas: readonly Forma<S>[],
    /** Lo que no son trazos (`Tope`): se preguntan antes que las formas. */
    private readonly topes: readonly Tope<S>[] = [],
  ) {
    const t: number[] = [];
    const de: number[] = [];
    const trozos: number[] = [];
    const cajas: number[] = [];
    for (const [f, { trazos, alcance }] of formas.entries()) {
      if (!(alcance > 0))
        throw new Error(`una forma de obstáculo necesita un alcance positivo, no ${alcance}`);
      for (const l of trazos) {
        // Un punto suelto es un tramo de largo cero: el sitio de un objeto.
        const puntos = l.length === 1 ? [l[0], l[0]] : l;
        for (let i = 0; i + 1 < puntos.length; i += TRAMOS_POR_TROZO) {
          const fin = Math.min(i + TRAMOS_POR_TROZO, puntos.length - 1);
          trozos.push(t.length / 4, t.length / 4 + fin - i);
          const caja = [Infinity, Infinity, -Infinity, -Infinity];
          for (let j = i; j < fin; j++) {
            const [ax, ay] = puntos[j] as readonly [number, number];
            const [bx, by] = puntos[j + 1] as readonly [number, number];
            t.push(ax, ay, bx, by);
            de.push(f);
            caja[0] = Math.min(caja[0] as number, ax, bx);
            caja[1] = Math.min(caja[1] as number, ay, by);
            caja[2] = Math.max(caja[2] as number, ax, bx);
            caja[3] = Math.max(caja[3] as number, ay, by);
          }
          cajas.push(
            (caja[0] as number) - alcance,
            (caja[1] as number) - alcance,
            (caja[2] as number) + alcance,
            (caja[3] as number) + alcance,
          );
        }
      }
    }
    this.tramos = Float64Array.from(t);
    this.formaDe = Int32Array.from(de);
    this.trozos = Int32Array.from(trozos);
    this.cajas = Float64Array.from(cajas);
    const n = trozos.length / 2;
    /** Las casillas que toca la caja ampliada del trozo `k`. */
    const casillasDe = (k: number) => [
      Math.floor(cajas[4 * k] as number),
      Math.floor(cajas[4 * k + 1] as number),
      Math.floor(cajas[4 * k + 2] as number),
      Math.floor(cajas[4 * k + 3] as number),
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

  /**
   * Los tramos a menos del alcance de su forma de la caja, cada uno una vez; con
   * `cual`, solo los de las formas que acepta. Sin `s`, quedan todos en
   * `candidatos`; con `s`, para en el primero que alcanza a `s` con el alto
   * `alto` (cuya caja es la preguntada) y dice si lo hubo.
   */
  private recorrer(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    cual?: (f: Forma<S>) => boolean,
    s?: S,
    alto = 0,
  ): boolean {
    this.candidatos.length = 0;
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
            (cajas[4 * k] as number) > x1 ||
            (cajas[4 * k + 2] as number) < x0 ||
            (cajas[4 * k + 1] as number) > y1 ||
            (cajas[4 * k + 3] as number) < y0
          )
            continue;
          const hasta = this.trozos[2 * k + 1] as number;
          for (let i = this.trozos[2 * k] as number; i < hasta; i++) {
            const f = this.formas[this.formaDe[i] as number] as Forma<S>;
            if (cual !== undefined && !cual(f)) continue;
            if (s !== undefined) {
              if (this.alcanza(i, f, s, alto, x0, y0, x1, y1)) return true;
              continue;
            }
            if (cerca(t, i, f.alcance, x0, y0, x1, y1)) this.candidatos.push(i);
          }
        }
      }
    return false;
  }

  /**
   * Si el tramo `i`, de la forma `f`, alcanza a `s` con el alto `alto`, cuya
   * caja es `[x0, y0, x1, y1]`, con la medida con que lo mira su forma.
   */
  private alcanza(
    i: number,
    f: Forma<S>,
    s: S,
    alto: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean {
    const m = f.mide(s, alto);
    if (m === null) return false;
    if (m.radio > f.alcance)
      throw new Error(`una forma de obstáculo midió con ${m.radio}, más que su alcance`);
    return m.soloElPie
      ? cerca(this.tramos, i, m.radio, s.x, s.y, s.x, s.y)
      : cerca(this.tramos, i, m.radio, x0, y0, x1, y1);
  }

  /** Si algún candidato alcanza a `s` con el alto `alto`. */
  private algunCandidato(s: S, alto: number): boolean {
    const [x0, y0, x1, y1] = cajaDeSprite(s, alto);
    for (const i of this.candidatos)
      if (
        this.alcanza(i, this.formas[this.formaDe[i] as number] as Forma<S>, s, alto, x0, y0, x1, y1)
      )
        return true;
    return false;
  }

  /** Si `s`, con el alto `alto`, pisa algún tope o alguna forma con la medida con que ella lo mira. */
  pisa(s: S, alto = s.alto): boolean {
    for (const t of this.topes) if (t(s, alto) < alto) return true;
    const [x0, y0, x1, y1] = cajaDeSprite(s, alto);
    return this.recorrer(x0, y0, x1, y1, undefined, s, alto);
  }

  /**
   * El mayor alto, hasta el suyo, con el que `s` no pisa ninguna forma. La caja
   * crece con el alto sin moverse del ancla, que está dentro de la imagen, y
   * cada regla mira más al crecer, así que pisar es monótono en el alto y basta
   * una bisección; y toda caja más baja cabe en la entera, así que la bisección
   * solo mira los tramos cerca de la entera.
   *
   * Atajos: libre entero, su alto; pisando ya con el pie (alto 0), 0. Los
   * topes dan su alto sin bisección, y manda el menor.
   */
  altoLibre(s: S): number {
    let tope = s.alto;
    for (const t of this.topes) tope = Math.min(tope, t(s, tope));
    return Math.min(tope, this.altoLibreDeLasFormas(s));
  }

  /** `altoLibre` de las formas solas: la bisección. */
  private altoLibreDeLasFormas(s: S): number {
    const [x0, y0, x1, y1] = cajaDeSprite(s);
    this.recorrer(x0, y0, x1, y1);
    if (this.candidatos.length === 0 || !this.algunCandidato(s, s.alto)) return s.alto;
    if (this.algunCandidato(s, 0)) return 0;
    let libre = 0;
    let pisado = s.alto;
    for (let paso = 0; paso < PASOS_DE_BISECCION; paso++) {
      const medio = (libre + pisado) / 2;
      if (this.algunCandidato(s, medio)) pisado = medio;
      else libre = medio;
    }
    return libre;
  }

  /**
   * La forma de entre las que `cual` acepta cuyo trazo pasa más cerca del punto
   * `(x, y)` sin pasar de su alcance, o undefined. Es la pregunta de la reserva
   * de un objeto para lo que se mira por puntos (la pared, la muralla).
   */
  en(x: number, y: number, cual: (f: Forma<S>) => boolean): Forma<S> | undefined {
    this.recorrer(x, y, x, y, cual);
    let mejor: Forma<S> | undefined;
    let menor = Number.POSITIVE_INFINITY;
    const t = this.tramos;
    for (const i of this.candidatos) {
      const f = this.formas[this.formaDe[i] as number] as Forma<S>;
      const d = puntoATramo2(
        x,
        y,
        t[4 * i] as number,
        t[4 * i + 1] as number,
        t[4 * i + 2] as number,
        t[4 * i + 3] as number,
      );
      if (d < menor) {
        mejor = f;
        menor = d;
      }
    }
    return mejor;
  }
}

/**
 * El pasillo de unas sendas con una media anchura fija para todo lo que
 * pregunte, por su rectángulo: el de los guardias del informe y los tests, que
 * miden desde lo puesto y no preguntan a la regla de la puerta.
 */
export function pasilloDe<S extends ConImagen = ConImagen>(
  sendas: readonly Senda[],
  radio: number,
): Obstaculos<S> {
  const medida: Medida = { radio, soloElPie: false };
  return new Obstaculos<S>([{ trazos: sendas, alcance: radio, mide: () => medida }]);
}

/** Si el tramo `i` de `t` queda a menos de `r` de la caja. */
function cerca(
  t: Float64Array,
  i: number,
  r: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const ax = t[4 * i] as number;
  const ay = t[4 * i + 1] as number;
  const bx = t[4 * i + 2] as number;
  const by = t[4 * i + 3] as number;
  return (
    Math.min(ax, bx) - r <= x1 &&
    Math.max(ax, bx) + r >= x0 &&
    Math.min(ay, by) - r <= y1 &&
    Math.max(ay, by) + r >= y0 &&
    distancia2(ax, ay, bx, by, x0, y0, x1, y1) < r * r
  );
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

/** Lo que se tolera en `t` al decidir si un tramo corta una caja o solo la toca. */
const EPS = 1e-6;

/**
 * Si el tramo `a → b` corta la caja `[x0, y0, x1, y1]` (Liang-Barsky): si
 * comparte con ella un trozo de largo positivo. Lo que tiene dentro va de `t0`
 * a `t1` sobre el tramo, y se deja en `t` si se pasa.
 *
 * Tocar la caja en un solo punto no es cortarla. Ese punto es un extremo del
 * tramo o una esquina de la caja, así que `distancia2` lo mide igual (da 0); y
 * para `rampas` un trozo de largo nulo no es senda. Sin tupla que devolver: va
 * en el camino caliente del índice.
 */
export function tramoEnCaja(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t?: [number, number],
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0) {
    if (ax < x0 || ax > x1) return false;
  } else {
    let ra = (x0 - ax) / dx;
    let rb = (x1 - ax) / dx;
    if (dx < 0) [ra, rb] = [rb, ra];
    if (ra > t0) t0 = ra;
    if (rb < t1) t1 = rb;
    if (t1 - t0 < EPS) return false;
  }
  if (dy === 0) {
    if (ay < y0 || ay > y1) return false;
  } else {
    let ra = (y0 - ay) / dy;
    let rb = (y1 - ay) / dy;
    if (dy < 0) [ra, rb] = [rb, ra];
    if (ra > t0) t0 = ra;
    if (rb < t1) t1 = rb;
    if (t1 - t0 < EPS) return false;
  }
  if (t !== undefined) {
    t[0] = t0;
    t[1] = t1;
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
  if (tramoEnCaja(ax, ay, bx, by, x0, y0, x1, y1)) return 0;
  return Math.min(
    puntoACaja2(ax, ay, x0, y0, x1, y1),
    puntoACaja2(bx, by, x0, y0, x1, y1),
    puntoATramo2(x0, y0, ax, ay, bx, by),
    puntoATramo2(x1, y0, ax, ay, bx, by),
    puntoATramo2(x0, y1, ax, ay, bx, by),
    puntoATramo2(x1, y1, ax, ay, bx, by),
  );
}
