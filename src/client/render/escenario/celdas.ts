/**
 * El relieve por celdas de vértice (R4, *dual grid*, `docs/agents/2026-10-07-relieve-esquinas/plan.md`).
 *
 * Las caídas se salían por arista y por fila: una frontera en diagonal era una
 * escalera de frontal y ladera, y las esquinas se arreglaban caso a caso. Aquí
 * cada vértice de la rejilla mira sus cuatro casillas (NO, NE, SO, SE) y, por
 * cada umbral de nivel, da un caso de 4 bits; los umbrales seguidos con el mismo
 * caso son UNA pared, de caída = cuántos umbrales. La pared de una celda va de
 * junta a junta, y las juntas caen en el medio de los lados de casilla: el tipo
 * de junta lo fija el lado que cruza, no la pieza, así que cualquier pieza casa
 * con su vecina sin saber cuál es.
 *
 * Es puro: sale del nivel por casilla de `relieve()` y no cambia el núcleo.
 */
import type { Suelo } from '@core/map/terrain.js';
import type { RumboDeBajada } from './catalogo.js';
import {
  ALTO_DE_NIVEL,
  CARA_DE_SUELO,
  type Cara,
  caidaDeLadera,
  type Ladera,
  TALUD_DE_LADERA,
} from './relieve.js';

/**
 * El tipo de una pared por su caso de 4 bits (NO = 8, NE = 4, SO = 2, SE = 1;
 * alto = 1). Por dónde mira: `S` cae hacia la cámara; `E` y `O`, de lado; las
 * diagonales `SE` y `SO`, en esquina (convexa, la punta de una meseta) o en
 * rincón (cóncava). Las que miran al norte quedan de espaldas.
 */
export type TipoDeCelda =
  | 'S'
  | 'N'
  | 'E'
  | 'O'
  | 'SE-convexa'
  | 'SO-convexa'
  | 'NE-convexa'
  | 'NO-convexa'
  | 'SE-concava'
  | 'SO-concava'
  | 'NE-concava'
  | 'NO-concava';

/** Los tipos que se ven desde la cámara del sur: el resto es espalda (el reborde). */
export const TIPOS_VISTOS = [
  'S',
  'E',
  'O',
  'SE-convexa',
  'SO-convexa',
  'SE-concava',
  'SO-concava',
] as const satisfies readonly TipoDeCelda[];
export type TipoVisto = (typeof TIPOS_VISTOS)[number];

export const esVisto = (t: TipoDeCelda): t is TipoVisto =>
  (TIPOS_VISTOS as readonly string[]).includes(t);

/**
 * Los tipos de cada caso binario. La silla (dos altas en diagonal) se resuelve
 * «el alto une»: las dos altas se tocan por el vértice y salen dos rincones.
 */
const TIPOS: Readonly<Record<number, readonly TipoDeCelda[]>> = {
  12: ['S'],
  3: ['N'],
  10: ['E'],
  5: ['O'],
  8: ['SE-convexa'],
  4: ['SO-convexa'],
  2: ['NE-convexa'],
  1: ['NO-convexa'],
  14: ['SE-concava'],
  13: ['SO-concava'],
  11: ['NE-concava'],
  7: ['NO-concava'],
  9: ['SO-concava', 'NE-concava'],
  6: ['SE-concava', 'NO-concava'],
};

/** De qué clase es una junta: la de un lado horizontal (`S`) o vertical (`E`, `O`). */
export type ClaseDeJunta = 'S' | 'E' | 'O' | 'N';

/** Una junta de una celda: el punto del filo, relativo al vértice, y su clase. */
export type Junta = readonly [number, number, ClaseDeJunta];

/**
 * Las dos juntas de cada tipo, relativas al vértice (las casillas en ±0,5), en
 * el orden en que las lleva su pieza: la convexa va de la junta E/O a la S, y la
 * cóncava de la S a la E/O (§23). Las de espaldas, por completar el contorno.
 */
export const JUNTAS: Readonly<Record<TipoDeCelda, readonly [Junta, Junta]>> = {
  S: [
    [-0.5, 0, 'S'],
    [0.5, 0, 'S'],
  ],
  N: [
    [-0.5, 0, 'N'],
    [0.5, 0, 'N'],
  ],
  E: [
    [0, -0.5, 'E'],
    [0, 0.5, 'E'],
  ],
  O: [
    [0, -0.5, 'O'],
    [0, 0.5, 'O'],
  ],
  'SE-convexa': [
    [0, -0.5, 'E'],
    [-0.5, 0, 'S'],
  ],
  'SE-concava': [
    [0.5, 0, 'S'],
    [0, 0.5, 'E'],
  ],
  'SO-convexa': [
    [0, -0.5, 'O'],
    [0.5, 0, 'S'],
  ],
  'SO-concava': [
    [-0.5, 0, 'S'],
    [0, 0.5, 'O'],
  ],
  'NE-convexa': [
    [-0.5, 0, 'N'],
    [0, 0.5, 'E'],
  ],
  'NO-convexa': [
    [0.5, 0, 'N'],
    [0, 0.5, 'O'],
  ],
  'NE-concava': [
    [0, -0.5, 'E'],
    [0.5, 0, 'N'],
  ],
  'NO-concava': [
    [0, -0.5, 'O'],
    [-0.5, 0, 'N'],
  ],
};

/**
 * Lo que el pie de una junta se aparta de su filo en el suelo, en x, por caída:
 * una junta S cae a plomo (el alto lo pone la proyección); una E u O, en talud,
 * como las laderas (`TALUD_DE_LADERA`). Es el contrato de las guías del arte
 * (`tools/taller/diagonales.ts`), que lo leen de aquí.
 */
export function taludDeJunta(clase: ClaseDeJunta, caida: number): number {
  const d = TALUD_DE_LADERA[caidaDeLadera(caida)];
  return clase === 'E' ? d : clase === 'O' ? -d : 0;
}

/** Una pared de una celda: un grupo de umbrales seguidos con el mismo caso. */
export interface Celda {
  /** El vértice: la esquina de arriba a la izquierda de la casilla (vx, vy). */
  readonly vx: number;
  readonly vy: number;
  readonly tipo: TipoDeCelda;
  /** Cuántos niveles cae: cuántos umbrales seguidos dan este caso. */
  readonly caida: number;
  /** El primer umbral: el nivel de lo alto de su lado bajo más uno. */
  readonly desde: number;
  /** El material de la cara: el del suelo de la casilla alta (`CARA_DE_SUELO`). */
  readonly material: string;
}

/** Las cuatro casillas de un vértice, en el orden de los bits: NO, NE, SO, SE. */
const CUATRO = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0],
] as const;

/**
 * Las paredes de las celdas de un relieve: una por grupo de umbrales con el
 * mismo caso, en el orden de la rejilla (fila a fila de vértices, de oeste a
 * este, y en cada vértice de abajo arriba). Solo los vértices interiores: en el
 * borde del mapa no hay casilla de fuera que mirar.
 */
export function celdas(
  nivel: ArrayLike<number>,
  W: number,
  H: number,
  suelo: readonly Suelo[],
): Celda[] {
  const fuera: Celda[] = [];
  const N = (x: number, y: number) => nivel[y * W + x] as number;
  for (let vy = 1; vy < H; vy++)
    for (let vx = 1; vx < W; vx++) {
      const cuatro = CUATRO.map(([dx, dy]) => N(vx + dx, vy + dy));
      const lo = Math.min(...cuatro);
      const hi = Math.max(...cuatro);
      if (lo === hi) continue;
      let grupo: { desde: number; hasta: number; bits: number } | null = null;
      const cerrar = () => {
        if (grupo === null) return;
        const { desde, hasta, bits } = grupo;
        // El material: el de la primera casilla alta en el orden de los bits.
        const alta = CUATRO.findIndex((_, k) => (bits & (8 >> k)) !== 0);
        const [dx, dy] = CUATRO[alta] as readonly [number, number];
        const material = CARA_DE_SUELO[suelo[(vy + dy) * W + vx + dx] as Suelo];
        for (const tipo of TIPOS[bits] ?? []) {
          // El mismo tipo en dos grupos seguidos (una silla bajo un rincón: el
          // caso 14 y luego el 6 dan los dos el rincón SE) es UNA pared con la
          // caída de los dos: tienen las mismas juntas, y dos piezas se montaban.
          let k = fuera.length - 1;
          while (k >= 0) {
            const c = fuera[k] as Celda;
            if (c.vx !== vx || c.vy !== vy) k = -1;
            else if (c.tipo === tipo && c.desde + c.caida === desde) break;
            else k--;
          }
          const previa = fuera[k];
          if (k < 0 || previa === undefined)
            fuera.push({ vx, vy, tipo, caida: hasta - desde + 1, desde, material });
          else fuera[k] = { ...previa, caida: hasta - previa.desde + 1 };
        }
      };
      for (let t = lo + 1; t <= hi; t++) {
        const bits = cuatro.reduce((b, n, k) => b | (n >= t ? 8 >> k : 0), 0);
        if (grupo !== null && grupo.bits === bits) grupo.hasta = t;
        else {
          cerrar();
          grupo = { desde: t, hasta: t, bits };
        }
      }
      cerrar();
    }
  return fuera;
}

/** Los filos de las dos juntas de una celda, en casillas del mapa, en el orden de `JUNTAS`. */
export function filosDe(
  c: Pick<Celda, 'vx' | 'vy' | 'tipo'>,
): readonly [readonly [number, number], readonly [number, number]] {
  const [a, b] = JUNTAS[c.tipo];
  return [
    [c.vx + a[0], c.vy + a[1]],
    [c.vx + b[0], c.vy + b[1]],
  ];
}

/** El pie bajo el filo `[x, y]` de una junta de clase `clase`, en casillas del mapa. */
export function pieDeJunta(
  [x, y]: readonly [number, number],
  clase: ClaseDeJunta,
  caida: number,
): readonly [number, number] {
  return [x + taludDeJunta(clase, caida), y + caida * ALTO_DE_NIVEL];
}

/** La clave de un punto de junta: en medias casillas, que es donde caen. */
const claveDeJunta = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;

/** Las paredes por junta: las dos celdas que la comparten en cada umbral (el contorno se cierra). */
export function porJunta(cs: readonly Celda[]): ReadonlyMap<string, readonly Celda[]> {
  const m = new Map<string, Celda[]>();
  for (const c of cs)
    for (const [x, y] of filosDe(c)) {
      const k = claveDeJunta(x, y);
      const ya = m.get(k);
      if (ya === undefined) m.set(k, [c]);
      else ya.push(c);
    }
  return m;
}

/** Si dos paredes comparten algún umbral: son la misma caída vista desde dos celdas. */
const solapan = (p: Celda, q: Celda) =>
  p.desde <= q.desde + q.caida - 1 && q.desde <= p.desde + p.caida - 1;

/**
 * La vecina de `c` por su junta `[x, y]`: la otra pared que pasa por ella con
 * algún umbral en común. `undefined` en el borde del mapa.
 */
export function vecinaEn(
  c: Celda,
  [x, y]: readonly [number, number],
  juntas: ReadonlyMap<string, readonly Celda[]>,
): Celda | undefined {
  return juntas.get(claveDeJunta(x, y))?.find((o) => o !== c && solapan(o, c));
}

/** Una cadena de laderas por celdas, con sus remates (`piezasDeLadera`). */
export interface LaderaDeCeldas extends Ladera {
  /** Si remata al norte con un `inicio` y al sur con un `fin`: donde sigue de espaldas o con una caída menor. */
  readonly inicio: boolean;
  readonly fin: boolean;
}

/** Lo que el relieve por celdas da para colocar. */
export interface Caidas {
  /** Todas las paredes, vistas y de espaldas. */
  readonly celdas: readonly Celda[];
  /** Las que se ven y llevan pieza (o la dejan por un barranco): sin las de `fuera`. */
  readonly vistas: readonly Celda[];
  /**
   * Las caídas al sur en tramos de junta a junta, como `Cara`: van de media
   * casilla en media casilla (`x0 = a − 0,5`, `x1 = b − 0,5` para las celdas de
   * `a` a `b`), y su banda es la de siempre (`bandaDeCara`).
   */
  readonly caras: readonly Cara[];
  /** Las caídas al este y al oeste en cadenas de norte a sur, corridas media fila. */
  readonly laderas: readonly LaderaDeCeldas[];
  /** Las diagonales que se ven: una pieza por celda. */
  readonly diagonales: readonly Celda[];
  /**
   * Las paredes E u O de un barranco de una casilla: una casilla baja entre dos
   * altas en la misma fila. Ahí las dos laderas se montarían (QA de #156, H1);
   * no lleva ninguna, y van los peñascos del canto (`sinBarrancos`).
   */
  readonly barrancos: readonly Celda[];
}

/**
 * Las paredes de un barranco de una casilla (`Caidas.barrancos`): la E de un
 * vértice y la O del de su este con algún umbral en común.
 */
export function sinBarrancos(cs: readonly Celda[]): {
  readonly quedan: Celda[];
  readonly barrancos: Celda[];
} {
  const oestes = new Map<string, Celda[]>();
  for (const c of cs)
    if (c.tipo === 'O') {
      const k = `${c.vx},${c.vy}`;
      oestes.set(k, [...(oestes.get(k) ?? []), c]);
    }
  const barrancos = new Set<Celda>();
  for (const c of cs) {
    if (c.tipo !== 'E') continue;
    const enfrente = (oestes.get(`${c.vx + 1},${c.vy}`) ?? []).filter((o) => solapan(o, c));
    if (enfrente.length === 0) continue;
    barrancos.add(c);
    for (const o of enfrente) barrancos.add(o);
  }
  return { quedan: cs.filter((c) => !barrancos.has(c)), barrancos: [...barrancos] };
}

/**
 * Las caídas de un relieve por celdas, sin las paredes de `fuera` (las que
 * cruza un puente: las tapa su estribo). Las caras y las laderas, en tramos de
 * celdas seguidas con la misma caída, el mismo primer umbral y el mismo material.
 */
export function caidas(
  nivel: ArrayLike<number>,
  W: number,
  H: number,
  suelo: readonly Suelo[],
  fuera: ReadonlySet<string> = new Set(),
): Caidas {
  const todas = celdas(nivel, W, H, suelo);
  const juntas = porJunta(todas);
  const vistas = todas.filter((c) => esVisto(c.tipo) && !fuera.has(claveDeCelda(c)));
  const { quedan, barrancos } = sinBarrancos(vistas);
  const grupo = (c: Celda) => `${c.desde},${c.caida},${c.material}`;
  // Las caras: celdas S seguidas por la fila de vértices.
  const caras: Cara[] = [];
  const s = quedan
    .filter((c) => c.tipo === 'S')
    .sort((p, q) => p.vy - q.vy || p.desde - q.desde || p.vx - q.vx);
  for (let i = 0; i < s.length; ) {
    const a = s[i] as Celda;
    let j = i;
    while (
      j + 1 < s.length &&
      (s[j + 1] as Celda).vy === a.vy &&
      (s[j + 1] as Celda).vx === (s[j] as Celda).vx + 1 &&
      grupo(s[j + 1] as Celda) === grupo(a)
    )
      j++;
    const b = s[j] as Celda;
    caras.push({
      y: a.vy - 1,
      x0: a.vx - 0.5,
      x1: b.vx - 0.5,
      caida: a.caida,
      material: a.material,
    });
    i = j + 1;
  }
  // Las laderas: celdas E u O seguidas por la columna de vértices.
  const laderas: LaderaDeCeldas[] = [];
  for (const lado of ['este', 'oeste'] as const) {
    const tipo = lado === 'este' ? 'E' : 'O';
    const l = quedan
      .filter((c) => c.tipo === tipo)
      .sort((p, q) => p.vx - q.vx || p.desde - q.desde || p.vy - q.vy);
    for (let i = 0; i < l.length; ) {
      const a = l[i] as Celda;
      let j = i;
      while (
        j + 1 < l.length &&
        (l[j + 1] as Celda).vx === a.vx &&
        (l[j + 1] as Celda).vy === (l[j] as Celda).vy + 1 &&
        grupo(l[j + 1] as Celda) === grupo(a)
      )
        j++;
      const b = l[j] as Celda;
      // Remata donde la cadena sigue de espaldas, en el borde o con una caída
      // menor: en un escalón de caída remata la mayor y la menor sigue tapada.
      const sigue = (c: Celda, punto: readonly [number, number]) => {
        const v = vecinaEn(c, punto, juntas);
        return v !== undefined && esVisto(v.tipo) && v.caida >= c.caida;
      };
      laderas.push({
        x: lado === 'este' ? a.vx - 1 : a.vx,
        y0: a.vy - 0.5,
        y1: b.vy - 0.5,
        lado,
        caida: a.caida,
        material: a.material,
        inicio: !sigue(a, [a.vx, a.vy - 0.5]),
        fin: !sigue(b, [b.vx, b.vy + 0.5]),
      });
      i = j + 1;
    }
  }
  const diagonales = quedan.filter((c) => c.tipo !== 'S' && c.tipo !== 'E' && c.tipo !== 'O');
  return { celdas: todas, vistas, caras, laderas, diagonales, barrancos };
}

/** Cómo se nombra una pared: su vértice, su tipo y su primer umbral. */
export const claveDeCelda = (c: Pick<Celda, 'vx' | 'vy' | 'tipo' | 'desde'>): string =>
  `${c.vx},${c.vy},${c.tipo},${c.desde}`;

/**
 * Las casillas de las caídas al este y al oeste, como `[x, y, lado]` de la
 * casilla alta: la franja difuminada que pinta el pintor al pie (`cantos`). En
 * el orden de la rejilla, fila a fila y el este antes que el oeste.
 */
export function cantosDe(
  nivel: ArrayLike<number>,
  W: number,
  H: number,
): [number, number, 'este' | 'oeste'][] {
  const fuera: [number, number, 'este' | 'oeste'][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = nivel[y * W + x] as number;
      if (x + 1 < W && n > (nivel[y * W + x + 1] as number)) fuera.push([x, y, 'este']);
      if (x > 0 && n > (nivel[y * W + x - 1] as number)) fuera.push([x, y, 'oeste']);
    }
  return fuera;
}

/** Las casillas más altas que la de su norte: la caída de espaldas, de la que solo se ve el reborde. */
export function rebordesDe(nivel: ArrayLike<number>, W: number, H: number): [number, number][] {
  const fuera: [number, number][] = [];
  for (let y = 1; y < H; y++)
    for (let x = 0; x < W; x++)
      if ((nivel[y * W + x] as number) > (nivel[(y - 1) * W + x] as number)) fuera.push([x, y]);
  return fuera;
}

/**
 * Cuánto vale la línea del filo de una pared en `(x, y)`: cero sobre el filo,
 * de un signo de un lado y del otro del otro. Las rectas, la del lado de casilla
 * que siguen; las diagonales, su cuarto de círculo de media casilla de radio,
 * centrado en la casilla de la esquina que comparten sus juntas (el de la guía,
 * `tools/taller/diagonales.ts`).
 */
export function filoSignado(
  c: Pick<Celda, 'vx' | 'vy' | 'tipo'>,
): (x: number, y: number) => number {
  if (c.tipo === 'S' || c.tipo === 'N') return (_x, y) => y - c.vy;
  if (c.tipo === 'E' || c.tipo === 'O') return (x) => x - c.vx;
  const [a, b] = JUNTAS[c.tipo];
  const cx = c.vx + a[0] + b[0];
  const cy = c.vy + a[1] + b[1];
  return (x, y) => Math.hypot(x - cx, y - cy) - 0.5;
}

/** Una bajada (R5): un tramo de camino que cruza una caída hacia la cámara o de lado. */
export interface Bajada {
  readonly rumbo: RumboDeBajada;
  readonly caida: number;
  /** El material de la cara: el del suelo de la casilla alta. */
  readonly material: string;
  /** Donde la senda dibujada cruza el filo, en casillas. */
  readonly arriba: readonly [number, number];
  /** La casilla alta y la baja del tramo del núcleo. */
  readonly alto: readonly [number, number];
  readonly bajo: readonly [number, number];
}

/** El rumbo de bajada de un paso de casilla a casilla, o null si baja al norte (de espaldas). */
export function rumboDe(dx: number, dy: number): RumboDeBajada | null {
  if (dy < 0) return null;
  if (dy > 0) return dx > 0 ? 'se' : dx < 0 ? 'so' : 's';
  return dx > 0 ? 'e' : dx < 0 ? 'o' : null;
}

/**
 * El primer punto donde la polilínea `l` cruza el filo `f` dentro de la caja
 * `[x0, y0, x1, y1]`, el más cercano a `cerca`; o null si no lo cruza ahí.
 */
function cruce(
  l: readonly (readonly [number, number])[],
  f: (x: number, y: number) => number,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  cerca: readonly [number, number],
): readonly [number, number] | null {
  let mejor: readonly [number, number] | null = null;
  let d = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < l.length; i++) {
    const [ax, ay] = l[i] as readonly [number, number];
    const [bx, by] = l[i + 1] as readonly [number, number];
    if (
      Math.max(ax, bx) < x0 ||
      Math.min(ax, bx) > x1 ||
      Math.max(ay, by) < y0 ||
      Math.min(ay, by) > y1
    )
      continue;
    const fa = f(ax, ay);
    const fb = f(bx, by);
    if (fa === fb || fa * fb > 0) continue;
    const t = fa / (fa - fb);
    const p: readonly [number, number] = [ax + (bx - ax) * t, ay + (by - ay) * t];
    if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
    const dp = Math.hypot(p[0] - cerca[0], p[1] - cerca[1]);
    if (dp < d) {
      d = dp;
      mejor = p;
    }
  }
  return mejor;
}

/**
 * Las bajadas de un relieve: cada tramo de camino del núcleo entre dos casillas
 * a distinto nivel que baja hacia el sur, el sureste, el suroeste, el este o el
 * oeste. Las que bajan al norte van de espaldas y no llevan pieza. `fuera` deja
 * fuera un tramo (el que llega a un puente: el puente es su paso).
 *
 * `arriba` es donde la senda dibujada (`sendas`) cruza el filo: en un tramo
 * recto, el lado de casilla que comparten las dos; en uno en diagonal, la pared
 * de su vértice que cruza primero la recta de centro a centro. Si la senda no
 * lo cruza a media casilla de ahí, la recta.
 */
export function bajadasDe(
  nivel: ArrayLike<number>,
  W: number,
  suelo: readonly Suelo[],
  cs: readonly Celda[],
  tramos: readonly (readonly [
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
  ])[],
  sendas: readonly (readonly (readonly [number, number])[])[],
  fuera: (p: { x: number; y: number }, q: { x: number; y: number }) => boolean = () => false,
): Bajada[] {
  const enVertice = new Map<string, Celda[]>();
  for (const c of cs) {
    const k = `${c.vx},${c.vy}`;
    enVertice.set(k, [...(enVertice.get(k) ?? []), c]);
  }
  const N = (x: number, y: number) => nivel[y * W + x] as number;
  const out: Bajada[] = [];
  for (const [p, q] of tramos) {
    const dn = N(p.x, p.y) - N(q.x, q.y);
    if (dn === 0 || fuera(p, q)) continue;
    const [alto, bajo] = dn > 0 ? [p, q] : [q, p];
    const dx = bajo.x - alto.x;
    const dy = bajo.y - alto.y;
    const rumbo = rumboDe(dx, dy);
    if (rumbo === null) continue;
    const A: readonly [number, number] = [alto.x + 0.5, alto.y + 0.5];
    const B: readonly [number, number] = [bajo.x + 0.5, bajo.y + 0.5];
    let f: (x: number, y: number) => number;
    let caja: readonly [number, number, number, number];
    if (dx !== 0 && dy !== 0) {
      // En diagonal cruza por un vértice: la pared de su vértice que corta
      // primero la recta, entre las que caen entre los dos niveles.
      const vx = Math.max(alto.x, bajo.x);
      const vy = Math.max(alto.y, bajo.y);
      const lo = Math.min(N(p.x, p.y), N(q.x, q.y));
      const hi = Math.max(N(p.x, p.y), N(q.x, q.y));
      const paredes = (enVertice.get(`${vx},${vy}`) ?? []).filter(
        (c) => c.desde > lo && c.desde <= hi,
      );
      let primera: { f: (x: number, y: number) => number; t: number } | null = null;
      for (const c of paredes) {
        const g = filoSignado(c);
        const p0 = cruce([A, B], g, [vx - 0.5, vy - 0.5, vx + 0.5, vy + 0.5], A);
        if (p0 === null) continue;
        const t = Math.hypot(p0[0] - A[0], p0[1] - A[1]);
        if (primera === null || t < primera.t) primera = { f: g, t };
      }
      f = primera?.f ?? ((x, y) => x - vx + (y - vy));
      caja = [vx - 0.5, vy - 0.5, vx + 0.5, vy + 0.5];
    } else if (dy !== 0) {
      const y = Math.max(alto.y, bajo.y);
      f = (_x, yy) => yy - y;
      caja = [alto.x, y - 0.5, alto.x + 1, y + 0.5];
    } else {
      const x = Math.max(alto.x, bajo.x);
      f = (xx) => xx - x;
      caja = [x - 0.5, alto.y, x + 0.5, alto.y + 1];
    }
    const recta = cruce([A, B], f, [caja[0] - 1, caja[1] - 1, caja[2] + 1, caja[3] + 1], A) ?? [
      (A[0] + B[0]) / 2,
      (A[1] + B[1]) / 2,
    ];
    let arriba: readonly [number, number] = recta;
    let d = 0.5;
    for (const l of sendas) {
      const c = cruce(l, f, caja, recta);
      if (c === null) continue;
      const dc = Math.hypot(c[0] - recta[0], c[1] - recta[1]);
      if (dc < d) {
        d = dc;
        arriba = c;
      }
    }
    out.push({
      rumbo,
      caida: Math.abs(dn),
      material: CARA_DE_SUELO[suelo[alto.y * W + alto.x] as Suelo],
      arriba,
      alto: [alto.x, alto.y],
      bajo: [bajo.x, bajo.y],
    });
  }
  return out;
}

/**
 * Dónde cae el pie de la pared bajo el `arriba` de una bajada: `caida` niveles
 * por debajo y, en E y O, apartado el talud de la ladera; en SE y SO, la mitad.
 * Es el contrato de la guía (`tools/taller/bajadas.ts`).
 */
export function abajoDe(b: Pick<Bajada, 'rumbo' | 'caida' | 'arriba'>): readonly [number, number] {
  return [b.arriba[0] + taludDeBajada(b.rumbo, b.caida), b.arriba[1] + b.caida * ALTO_DE_NIVEL];
}

/** Lo que el pie se aparta en x del `arriba` de una bajada (`abajoDe`): el talud de su lado, o la mitad en diagonal. */
export function taludDeBajada(rumbo: RumboDeBajada, caida: number): number {
  const d = TALUD_DE_LADERA[caidaDeLadera(caida)];
  return { s: 0, se: d / 2, so: -d / 2, e: d, o: -d }[rumbo];
}

const S2 = Math.SQRT1_2;

/** Hacia dónde va la senda en pantalla al bajar, en cada rumbo. */
export const DIRECCION_DE_BAJADA: Readonly<Record<RumboDeBajada, readonly [number, number]>> = {
  s: [0, 1],
  se: [S2, S2],
  so: [-S2, S2],
  e: [1, 0],
  o: [-1, 0],
};

/**
 * Lo que mide la rampa de una bajada en pantalla, del filo a su pie, en
 * casillas. **Sigue a la senda pintada**, que en el juego no sube ni baja: lo
 * alto y lo bajo se pintan cada uno en su casilla, y la cara cuelga por delante.
 * La primera guía bajaba por la línea de máxima pendiente de la pared (del filo
 * a su pie): de cara a la cámara casaba, pero de lado y en diagonal la rampa
 * acababa hasta 0,6 casillas por debajo de la senda, que seguía por otro sitio
 * (s40, 07-10-2026). De cara, la caída y media casilla más; en diagonal, lo que
 * tarda la senda en salir de la cara; de lado, lo que tarda en cruzar el talud
 * con holgura. Es el contrato de la guía (`tools/taller/bajadas.ts`).
 */
export function largoDeBajada(rumbo: RumboDeBajada, caida: number): number {
  const H = caida * ALTO_DE_NIVEL;
  return rumbo === 's' ? H + 0.5 : rumbo === 'e' || rumbo === 'o' ? 0.6 + H * 0.6 : H + 0.45;
}

/** El camino de la rampa de una bajada en pantalla: de `arriba` a su pie, por donde va la senda. */
export function rampaDe(
  b: Pick<Bajada, 'rumbo' | 'caida' | 'arriba'>,
): readonly [readonly [number, number], readonly [number, number]] {
  const [dx, dy] = DIRECCION_DE_BAJADA[b.rumbo];
  const L = largoDeBajada(b.rumbo, b.caida);
  return [b.arriba, [b.arriba[0] + dx * L, b.arriba[1] + dy * L]];
}
