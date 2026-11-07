/**
 * La red de caminos de un mapa (`RedDeCaminos`): los tramos que se pintan y, de
 * ellos, las casillas que abaratan el paso, en un solo campo del mapa
 * (`GameMap.caminos`). Los tramos de un camino escrito como casillas
 * (`tramosDeCasillas`) y el movimiento que los lee siguen en `map.ts`.
 *
 * Era parte de `map.ts` hasta la fase N de la reorganización (07-11-2026): la nombra
 * la forma del mapa (`tipos.ts`), y `map.ts` importa el recinto de las ciudades, que
 * nombra esa forma.
 */
import type { Point } from '../types.js';
import { pointKey } from './geometria.js';

/** Un tramo de camino: dos casillas 8-vecinas distintas. */
export type TramoDeCamino = readonly [Point, Point];

/**
 * La red de caminos de un mapa: los **tramos** son el hecho y las casillas se
 * derivan de ellos. Un camino de una sola casilla no tiene trazo: va en
 * `sueltas`, que abarata el paso pero no se pinta.
 *
 * Antes el mapa guardaba casillas y el pintor deducía los tramos por adyacencia
 * (8-vecindad, la diagonal solo si ninguna esquina es camino). Así dos radios
 * vecinos se unían solos y cerraban ~1,2 bucles por mapa que nadie había
 * trazado, y el generador tenía que comprobar lo dibujado y vestir otra vez el
 * mapa cuando un radio rozaba un nodo ajeno (#153). Con los tramos guardados lo
 * que se pinta es lo que se trazó.
 *
 * Constructor privado y campo privado: el campo hace la clase nominal, así que
 * no se puede fabricar una red con las dos caras desiguales a base de un objeto
 * literal. Se entra por `desdeTramos` o por `vacia`, que conocen el mapa: lo
 * que caiga fuera lanza aquí, y no hay que filtrarlo en cada lector.
 */
export class RedDeCaminos {
  private readonly claves: ReadonlySet<string>;
  /** Una marca por índice plano: `stepCost` y el Dijkstra no abren cadenas. */
  private readonly marca: Uint8Array;
  /** Las casillas con camino por índice plano, en el orden de `casillas`. */
  readonly indices: readonly number[];
  /** Los tramos por sus dos índices planos, el menor delante (`i·N + j`): `une` no recorre la lista. */
  private readonly unidas: ReadonlySet<number>;

  private constructor(
    readonly tramos: readonly TramoDeCamino[],
    readonly sueltas: readonly Point[],
    private readonly width: number,
    private readonly height: number,
  ) {
    const claves = new Set<string>();
    const indices: number[] = [];
    const marca = new Uint8Array(width * height);
    for (const p of [...tramos.flat(), ...sueltas]) {
      const i = p.y * width + p.x;
      if (marca[i] === 1) continue;
      marca[i] = 1;
      indices.push(i);
      claves.add(pointKey(p));
    }
    this.claves = claves;
    this.marca = marca;
    this.indices = indices;
    const N = width * height;
    this.unidas = new Set(
      tramos.map(([p, q]) => {
        const a = p.y * width + p.x;
        const b = q.y * width + q.x;
        return Math.min(a, b) * N + Math.max(a, b);
      }),
    );
  }

  /**
   * ¿Va un tramo de `p` a `q` (en cualquier sentido)? Es la pregunta de las
   * puertas de una ciudad (`puertasDeLaCiudad`): hay puerta donde llega un
   * camino. Fuera del mapa no hay tramo.
   */
  une(p: Point, q: Point): boolean {
    const fuera = (r: Point) => r.x < 0 || r.x >= this.width || r.y < 0 || r.y >= this.height;
    if (fuera(p) || fuera(q)) return false;
    const a = p.y * this.width + p.x;
    const b = q.y * this.width + q.x;
    return this.unidas.has(Math.min(a, b) * this.width * this.height + Math.max(a, b));
  }

  /** Las casillas con camino, por clave "x,y": las de algún tramo y las sueltas. */
  get casillas(): ReadonlySet<string> {
    return this.claves;
  }

  /** ¿Hay camino en esta casilla? Fuera del mapa no lo hay. */
  tiene(p: Point): boolean {
    if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.height) return false;
    return this.marca[p.y * this.width + p.x] === 1;
  }

  static vacia(width: number, height: number): RedDeCaminos {
    return new RedDeCaminos([], [], width, height);
  }

  /**
   * **Lanza** si una casilla cae fuera del mapa, si un tramo no une dos
   * casillas 8-vecinas distintas, si un tramo se repite o si una suelta está
   * repetida o también en un tramo: todos son fallos de programa, porque los
   * tramos los escribe el generador o los deriva `tramosDeCasillas`, nunca el
   * agente, y lo que el agente escribe fuera del mapa lo rechaza antes
   * `validateMapPlan`.
   *
   * Canoniza: dentro de cada tramo va primero la casilla de fila menor (y de
   * columna menor si comparten fila), y los tramos van ordenados igual. Así el
   * orden en que el pintor encadena las sendas no depende del orden del trazado.
   */
  static desdeTramos(
    tramos: readonly TramoDeCamino[],
    width: number,
    height: number,
    sueltas: readonly Point[] = [],
  ): RedDeCaminos {
    for (const p of [...tramos.flat(), ...sueltas]) dentroDelMapa(p, width, height);
    const canonicos = tramos.map(([p, q]): TramoDeCamino => {
      const lejos = Math.abs(p.x - q.x) > 1 || Math.abs(p.y - q.y) > 1;
      if (lejos || comparaEnLectura(p, q) === 0) {
        throw new Error(
          `el tramo de camino de (${p.x},${p.y}) a (${q.x},${q.y}) no une dos casillas vecinas distintas`,
        );
      }
      return comparaEnLectura(q, p) < 0 ? [q, p] : [p, q];
    });
    canonicos.sort(([a, b], [c, d]) => comparaEnLectura(a, c) || comparaEnLectura(b, d));
    for (let k = 1; k < canonicos.length; k++) {
      const [a, b] = canonicos[k - 1] as TramoDeCamino;
      const [c, d] = canonicos[k] as TramoDeCamino;
      if (comparaEnLectura(a, c) === 0 && comparaEnLectura(b, d) === 0) {
        throw new Error(`el tramo de camino de (${a.x},${a.y}) a (${b.x},${b.y}) está repetido`);
      }
    }
    const conTramo = new Set(canonicos.flat().map(pointKey));
    for (const p of sueltas) {
      if (conTramo.has(pointKey(p))) {
        throw new Error(`el camino suelto de (${p.x},${p.y}) está repetido o ya va en un tramo`);
      }
      conTramo.add(pointKey(p));
    }
    return new RedDeCaminos(canonicos, sueltas, width, height);
  }
}

/**
 * Lanza si una casilla de camino cae fuera del mapa: la red conoce el mapa. Y
 * si no es de enteros: con `NaN` todas las comparaciones de abajo dan falso y
 * la casilla se colaba (lo que llegaba de un cable con un índice de menos).
 */
export function dentroDelMapa(p: Point, width: number, height: number): void {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
    throw new Error(`el camino de (${p.x},${p.y}) no cae en una casilla: van de enteros`);
  }
  if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
    throw new Error(`el camino de (${p.x},${p.y}) cae fuera del mapa de ${width}×${height}`);
  }
}

/** Orden de lectura: por fila y, dentro de la fila, por columna. Es el del índice plano. */
function comparaEnLectura(p: Point, q: Point): number {
  return p.y - q.y || p.x - q.x;
}
