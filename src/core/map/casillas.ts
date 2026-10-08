/**
 * Un conjunto de casillas de un mapa: un byte por casilla, en el índice
 * `y·W + x` que ya usan el terreno, `regionDe` y el Dijkstra (#146).
 *
 * Es la representación de la niebla —`Player.fog`, lo explorado alguna vez— y
 * de lo que se mira ahora (`visibleNow`). Antes las dos eran un `Set<string>` de
 * claves `"x,y"`, y cada pregunta construía o hasheaba una cadena: el lienzo la
 * hace por figura, por volumen horneado y por casilla de la máscara en cada
 * fotograma, y `explorar` —el héroe que mira alrededor— era el 10 % del banco
 * levantando 81 claves por paso para meterlas en un `Set` y volver a sacarlas.
 *
 * **Un byte y no un bit** a propósito: 34×34 son 1 156 bytes por jugador, y con
 * un byte `has` es una lectura sin máscaras ni desplazamientos. El mapa más
 * grande que admite un plan (128×128) son 16 KB.
 *
 * Lo de fuera del mapa **no está** (`has` da `false`, la misma poda que
 * `visibleNowAt`); escribirlo es un error y lanza diciéndolo. La cuenta (`size`)
 * va al día en cada escritura: el lienzo la usa para saber si la niebla creció
 * sin recorrerla.
 */
import type { Point } from '../types.js';

type Medidas = { readonly width: number; readonly height: number };

/** El cuadrado de Chebyshev de `radio` alrededor de `centro`, recortado al mapa. */
function limitesDelCuadrado(map: Medidas, centro: Point, radio: number) {
  return {
    x0: Math.max(0, centro.x - radio),
    x1: Math.min(map.width - 1, centro.x + radio),
    y0: Math.max(0, centro.y - radio),
    y1: Math.min(map.height - 1, centro.y + radio),
  };
}

/**
 * Las casillas de ese cuadrado, fila a fila: lo que mira un héroe o un castillo
 * para quien lo recorre (`recordarAsaltantes`) sin levantar un mapa entero de
 * marcas por cada paso. Es el mismo recorte que `marcarCuadrado`.
 */
export function casillasDelCuadrado(map: Medidas, centro: Point, radio: number): Point[] {
  const { x0, x1, y0, y1 } = limitesDelCuadrado(map, centro, radio);
  const out: Point[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

/** Lo que se puede preguntar a un conjunto de casillas sin cambiarlo. */
export interface CasillasLeidas extends Iterable<Point> {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  has(p: Point): boolean;
  hasIndex(i: number): boolean;
  indices(): number[];
}

export class Casillas implements CasillasLeidas {
  private readonly marcas: Uint8Array;
  private cuenta = 0;

  private constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`un mapa de ${width}×${height} no tiene casillas que marcar`);
    }
    this.marcas = new Uint8Array(width * height);
  }

  /** Ninguna casilla marcada, del tamaño del mapa. */
  static vacias(map: { readonly width: number; readonly height: number }): Casillas {
    return new Casillas(map.width, map.height);
  }

  /**
   * Las casillas de unos índices `y·W + x`: la inversa de `indices()`, que es
   * como viaja la niebla al espectador. Lanza con un índice que no es del mapa
   * en vez de dejarlo caer: un índice malo es un cable roto, no una casilla.
   */
  static deIndices(
    map: { readonly width: number; readonly height: number },
    indices: Iterable<number>,
  ): Casillas {
    const out = new Casillas(map.width, map.height);
    for (const i of indices) {
      if (!Number.isInteger(i) || i < 0 || i >= out.marcas.length) {
        throw new Error(`la casilla ${i} no es de un mapa de ${map.width}×${map.height}`);
      }
      out.marcar(i);
    }
    return out;
  }

  get size(): number {
    return this.cuenta;
  }

  has(p: Point): boolean {
    if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.height) return false;
    return this.marcas[p.y * this.width + p.x] === 1;
  }

  /** `has` por índice `y·W + x`, para quien ya lo tiene (el lienzo, la serialización). */
  hasIndex(i: number): boolean {
    return this.marcas[i] === 1;
  }

  add(p: Point): void {
    if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.height) {
      throw new Error(`(${p.x},${p.y}) está fuera del mapa de ${this.width}×${this.height}`);
    }
    this.marcar(p.y * this.width + p.x);
  }

  delete(p: Point): void {
    if (!this.has(p)) return;
    this.marcas[p.y * this.width + p.x] = 0;
    this.cuenta--;
  }

  /**
   * Marca el cuadrado de radio `radio` alrededor de `centro`, recortado al mapa:
   * lo que mira un héroe o un castillo. Era `visibleFrom`, que levantaba la
   * clave de cada casilla para meterla en un `Set`.
   */
  marcarCuadrado(centro: Point, radio: number): void {
    const { x0, x1, y0, y1 } = limitesDelCuadrado(this, centro, radio);
    for (let y = y0; y <= y1; y++) {
      for (let i = y * this.width + x0, fin = y * this.width + x1; i <= fin; i++) this.marcar(i);
    }
  }

  /** Los índices marcados, de menor a mayor: fila a fila, como se lee el mapa. */
  indices(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.marcas.length; i++) if (this.marcas[i] === 1) out.push(i);
    return out;
  }

  *[Symbol.iterator](): Iterator<Point> {
    for (let i = 0; i < this.marcas.length; i++) {
      if (this.marcas[i] === 1) yield { x: i % this.width, y: Math.floor(i / this.width) };
    }
  }

  /**
   * Sale por `JSON.stringify` como sus índices, que es lo que `deIndices` lee.
   * Un `Set` salía como `{}` sin decir nada (lo cuenta el guardia de la crónica
   * en `invariantes.test.ts`).
   */
  toJSON(): number[] {
    return this.indices();
  }

  private marcar(i: number): void {
    if (this.marcas[i] === 1) return;
    this.marcas[i] = 1;
    this.cuenta++;
  }
}
