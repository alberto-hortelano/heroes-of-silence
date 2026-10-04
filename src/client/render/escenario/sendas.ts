/**
 * Las sendas: los tramos de camino de casilla en casilla, encadenados en líneas
 * y suavizados para que serpenteen como los de la referencia, finos y sin la
 * escalera de la rejilla.
 *
 * Una senda va de una junta a otra (un extremo o un cruce de tres o más): así un
 * cruce sigue siendo un punto común y no se abre al suavizar. El vaivén es un
 * desplazamiento lateral suave, menor que la reserva del camino, para que la
 * senda no se meta bajo lo que se colocó al lado.
 */
import { azarDe } from './esparcir.js';

export type Tramo = readonly [number, number, number, number];
export type Senda = readonly (readonly [number, number])[];

/** Cuánto se aparta como mucho la senda de la línea de casillas, en casillas. */
export const VAIVEN = 0.18;

const clave = (x: number, y: number) => `${x},${y}`;

/** Encadena los tramos en líneas que van de junta a junta. */
export function encadenar(tramos: readonly Tramo[]): [number, number][][] {
  const vecinos = new Map<string, [number, number][]>();
  const punto = new Map<string, [number, number]>();
  for (const [x0, y0, x1, y1] of tramos) {
    for (const [a, b] of [
      [
        [x0, y0],
        [x1, y1],
      ],
      [
        [x1, y1],
        [x0, y0],
      ],
    ] as [[number, number], [number, number]][]) {
      punto.set(clave(...a), a);
      vecinos.set(clave(...a), [...(vecinos.get(clave(...a)) ?? []), b]);
    }
  }
  const usado = new Set<string>();
  const arista = (p: [number, number], q: [number, number]) =>
    [clave(...p), clave(...q)].sort().join('|');
  const grado = (p: [number, number]) => vecinos.get(clave(...p))?.length ?? 0;
  const lineas: [number, number][][] = [];
  const recorrer = (inicio: [number, number], siguiente: [number, number]) => {
    const linea: [number, number][] = [inicio];
    let ahora = siguiente;
    usado.add(arista(inicio, ahora));
    for (;;) {
      linea.push(ahora);
      if (grado(ahora) !== 2) break;
      const proximo = (vecinos.get(clave(...ahora)) ?? []).find(
        (v) => !usado.has(arista(ahora, v)),
      );
      if (proximo === undefined) break;
      usado.add(arista(ahora, proximo));
      ahora = proximo;
    }
    lineas.push(linea);
  };
  // Primero desde las juntas; lo que quede son anillos, que se abren por cualquier punto.
  const puntos = [...punto.values()].sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  for (const p of puntos)
    if (grado(p) !== 2)
      for (const v of vecinos.get(clave(...p)) ?? []) if (!usado.has(arista(p, v))) recorrer(p, v);
  for (const p of puntos)
    for (const v of vecinos.get(clave(...p)) ?? []) if (!usado.has(arista(p, v))) recorrer(p, v);
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
