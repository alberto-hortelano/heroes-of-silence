/**
 * Las sendas: los tramos de camino de casilla en casilla, encadenados en líneas
 * y suavizados para que serpenteen como los de la referencia, finos y sin la
 * escalera de la rejilla.
 *
 * Una senda va de una junta a otra (un extremo o un cruce de tres o más): así un
 * cruce sigue siendo un punto común y no se abre al suavizar. El vaivén es un
 * desplazamiento lateral suave; lo colocado al lado se aparta del trazo ya
 * suavizado (`pasillo.ts`), no de la casilla, así que el vaivén no lo tapa.
 */
import { azarDe } from './esparcir.js';

export type Tramo = readonly [number, number, number, number];
export type Senda = readonly (readonly [number, number])[];

/** Cuánto se aparta como mucho la senda de la línea de casillas, en casillas. */
export const VAIVEN = 0.18;

/** Lo ancho de la senda pintada, en casillas: su orla oscura (`pintarSuelo`). */
export const ANCHO_DE_SENDA = 0.2;

/**
 * El arcén de lo bajo, en casillas, contado desde el borde de la senda: ninguna
 * mata, piedra, labranza, orilla ni roca de relleno lo pisa. 0,3 por decisión
 * del usuario (05-10-2026); se ajusta a ojo con `pnpm taller escenario`.
 */
export const MARGEN_DE_SENDA = 0.3;

/**
 * El arcén de las masas (árboles y picos de bosque y cordillera), menor: el
 * camino va DENTRO de los bosques y las cordilleras, y con el margen de lo bajo
 * se vaciaban. 0,2 por decisión del usuario (05-10-2026).
 */
export const MARGEN_DE_MASA = 0.2;

/** Media anchura del pasillo de lo bajo: la de la senda más su arcén. */
export const SEMIANCHO_DEL_PASILLO = ANCHO_DE_SENDA / 2 + MARGEN_DE_SENDA;

/**
 * El ancho de lo que se deja sin agua a lo largo de un vado (`Escena.vados`),
 * en casillas: la senda y su arcén (`SEMIANCHO_DEL_PASILLO` a cada lado). El
 * barro se quita menos (`ANCHO_DEL_VADO_EN_EL_BARRO`) y hace de orilla a la
 * lengua de tierra. Aquí y no en `puentes.ts`, que trae el núcleo: el pintor
 * del suelo se empaqueta sin él para el Worker y el taller.
 */
export const ANCHO_DEL_VADO = 2 * SEMIANCHO_DEL_PASILLO;
export const ANCHO_DEL_VADO_EN_EL_BARRO = 0.45;

/** Media anchura del pasillo de las masas. */
export const SEMIANCHO_DEL_PASILLO_DE_MASA = ANCHO_DE_SENDA / 2 + MARGEN_DE_MASA;

/**
 * El grafo de unos tramos: cada punto distinto con su número, en el orden en que
 * aparece, y sus vecinos, en el orden de los tramos. Lo leen `encadenar` y
 * `tramosHastaLosEstribos` (`puentes.ts`): un grafo, una forma de construirlo.
 */
export interface GrafoDeTramos {
  readonly puntos: readonly (readonly [number, number])[];
  readonly vecinos: readonly (readonly number[])[];
  /** El número del punto `(x, y)`, o `undefined` si no es de ningún tramo. */
  numero(x: number, y: number): number | undefined;
  /** La clave de la arista entre dos puntos, la misma en los dos sentidos. */
  arista(a: number, b: number): number;
}

export function grafoDeTramos(tramos: readonly Tramo[]): GrafoDeTramos {
  const numeros = new Map<string, number>();
  const puntos: (readonly [number, number])[] = [];
  const vecinos: number[][] = [];
  const numero = (x: number, y: number) => numeros.get(`${x},${y}`);
  const alta = (x: number, y: number): number => {
    const n = numero(x, y);
    if (n !== undefined) return n;
    numeros.set(`${x},${y}`, puntos.length);
    puntos.push([x, y]);
    vecinos.push([]);
    return puntos.length - 1;
  };
  for (const [x0, y0, x1, y1] of tramos) {
    const a = alta(x0, y0);
    const b = alta(x1, y1);
    (vecinos[a] as number[]).push(b);
    (vecinos[b] as number[]).push(a);
  }
  // Una clave numérica: con la de texto (`'x,y|x,y'`, ordenada), cortar la
  // senda en los estribos costaba 0,39 ms por mapa (07-10-2026).
  const n = puntos.length;
  return { puntos, vecinos, numero, arista: (a, b) => (a < b ? a * n + b : b * n + a) };
}

/** Encadena los tramos en líneas que van de junta a junta. */
export function encadenar(tramos: readonly Tramo[]): [number, number][][] {
  const { puntos, vecinos, arista } = grafoDeTramos(tramos);
  const usado = new Set<number>();
  const grado = (p: number) => (vecinos[p] as readonly number[]).length;
  const lineas: [number, number][][] = [];
  const recorrer = (inicio: number, siguiente: number) => {
    const linea = [inicio];
    let ahora = siguiente;
    usado.add(arista(inicio, ahora));
    for (;;) {
      linea.push(ahora);
      if (grado(ahora) !== 2) break;
      const proximo = (vecinos[ahora] as readonly number[]).find(
        (v) => !usado.has(arista(ahora, v)),
      );
      if (proximo === undefined) break;
      usado.add(arista(ahora, proximo));
      ahora = proximo;
    }
    lineas.push(linea.map((k) => [...(puntos[k] as readonly [number, number])]));
  };
  // Primero desde las juntas; lo que quede son anillos, que se abren por cualquier punto.
  const orden = puntos
    .map((p, k) => ({ p, k }))
    .sort(({ p }, { p: q }) => p[1] - q[1] || p[0] - q[0])
    .map(({ k }) => k);
  for (const p of orden)
    if (grado(p) !== 2)
      for (const v of vecinos[p] as readonly number[]) if (!usado.has(arista(p, v))) recorrer(p, v);
  for (const p of orden)
    for (const v of vecinos[p] as readonly number[]) if (!usado.has(arista(p, v))) recorrer(p, v);
  return lineas;
}

/**
 * Suaviza una línea: mete un punto en mitad de cada tramo, aparta los de dentro
 * hacia un lado con un vaivén que cambia despacio, y redondea con Chaikin. Los
 * dos extremos no se mueven.
 */
export function suavizar(linea: readonly (readonly [number, number])[], azar: () => number): Senda {
  if (linea.length < 2) return linea;
  const densa: [number, number][] = [];
  for (let i = 0; i < linea.length - 1; i++) {
    const [x0, y0] = linea[i] as readonly [number, number];
    const [x1, y1] = linea[i + 1] as readonly [number, number];
    densa.push([x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2]);
  }
  densa.push([...(linea.at(-1) as readonly [number, number])]);
  // El vaivén: una onda de fase y periodo al azar, para que no serpenteen todas igual.
  const fase = azar() * Math.PI * 2;
  const periodo = 3 + azar() * 3;
  const n = densa.length;
  const movida = densa.map(([x, y], i): [number, number] => {
    if (i === 0 || i === n - 1) return [x, y];
    const [px, py] = densa[i - 1] as [number, number];
    const [qx, qy] = densa[i + 1] as [number, number];
    const dx = qx - px;
    const dy = qy - py;
    const l = Math.hypot(dx, dy) || 1;
    // Se apaga cerca de los extremos: la senda llega recta a la puerta.
    const borde = Math.min(1, i / 2, (n - 1 - i) / 2);
    const d = Math.sin(fase + (i / periodo) * Math.PI) * VAIVEN * borde;
    return [x - (dy / l) * d, y + (dx / l) * d];
  });
  let curva: [number, number][] = movida;
  for (let k = 0; k < 3; k++) {
    const nueva: [number, number][] = [curva[0] as [number, number]];
    for (let i = 0; i < curva.length - 1; i++) {
      const [x0, y0] = curva[i] as [number, number];
      const [x1, y1] = curva[i + 1] as [number, number];
      nueva.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      nueva.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    nueva.push(curva.at(-1) as [number, number]);
    curva = nueva;
  }
  return curva;
}

export function sendas(tramos: readonly Tramo[], semilla: number): Senda[] {
  const azar = azarDe(semilla * 7919 + 17);
  return encadenar(tramos).map((l) => suavizar(l, azar));
}
