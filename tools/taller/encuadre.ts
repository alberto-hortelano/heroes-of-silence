/**
 * C1 de la revisión de animaciones (30-10-2026): volver a colocar los fotogramas
 * de un clip sin pedir nada al modelo, para que el tronco pintado siga la
 * trayectoria de la cadera del maniquí, en x y en y.
 *
 * Por qué hace falta: en la hoja A el empaquetado coloca cada figura por SU píxel
 * más bajo y la mediana de su tronco (`apoyoEn`), y el maniquí, que sube y baja la
 * cadera al correr, no cuenta. En los clips reales salían saltos de 4 a 20 px con
 * buena correlación, y el usuario, en el visor, eligió esta recolocación en 6 de 8
 * clips (`docs/agents/2026-10-30-evaluar-animaciones/experimentos.md` §3 y §5).
 *
 * Cómo: entre fotogramas seguidos (y del último al primero en un bucle) se busca
 * cuánto se movió el tronco pintado, por correlación normalizada (NCC) a ±`RADIO`
 * px en una ventana sobre el tronco (la banda de `apoyoEn`); se le resta lo que se
 * movió el tronco del maniquí (la media de caderas y hombros), y lo que sobra se reparte por mínimos cuadrados con
 * la media a 0, así que el clip no se va de su sitio. Un par con NCC por debajo de
 * `NCC_MINIMO` no cuenta (la carga y la muerte cambian demasiado de un fotograma a
 * otro), un fotograma sin pares no se mueve y nada se mueve más de `TOPE`.
 *
 * Puro: no lee ficheros ni el maniquí; recibe las celdas ya colocadas y dónde
 * espera la cadera cada una. Lo llama `empaquetar`.
 */
// El ciclo con `empaquetar` es solo de valores que se leen al llamar: no muerde.
import { ALFA_FIGURA } from './empaquetar.js';

/** Una celda RGBA de `lado`×`lado`. */
export interface CeldaRgba {
  readonly data: Uint8Array;
  readonly lado: number;
}

/** Cuánto se busca el tronco alrededor de su sitio, en px. */
export const RADIO = 16;
/** Por debajo de esta correlación el tronco no se parece lo bastante para medir. */
export const NCC_MINIMO = 0.5;
/** Más que esto no es encuadre, es otra pose: no se mueve más. */
export const TOPE = 24;
/**
 * La banda del tronco, en parte del alto de la figura desde arriba: de los hombros a
 * la cadera. Con la de `apoyoEn` (del 25 al 75 %) entraban los muslos, que en la
 * carrera se mueven de verdad, y la correlación seguía a las piernas: en la carga del
 * elfo arquero d1 se apartaba hasta 11 px de la recolocación que eligió el usuario.
 */
export const BANDA_DEL_TRONCO = [0.15, 0.55] as const;
/** Margen alrededor de la ventana del tronco. */
const MARGEN_DE_LA_VENTANA = 6;

/** Lo medido entre dos fotogramas (numerados desde 0). */
export interface ParDelTronco {
  readonly de: number;
  readonly a: number;
  /** Lo que se movió el tronco pintado. */
  readonly pintado: readonly [number, number];
  /** Lo que se movió la cadera del maniquí. */
  readonly maniqui: readonly [number, number];
  readonly ncc: number;
}

export interface Recolocacion {
  /** Cuánto se mueve cada fotograma, en px enteros. */
  readonly desplazamientos: readonly (readonly [number, number])[];
  readonly pares: readonly ParDelTronco[];
}

/**
 * La ventana del tronco de una celda: la banda del tronco (`BANDA_DEL_TRONCO`) y, en
 * horizontal, del percentil 20 al 80 de lo opaco de esa
 * banda (un brazo o un arma extendidos no la ensanchan), con `MARGEN_DE_LA_VENTANA`.
 * `null` si la celda está vacía.
 */
export function ventanaDelTronco(c: CeldaRgba): readonly [number, number, number, number] | null {
  const { data, lado } = c;
  let y0 = lado;
  let y1 = -1;
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++)
      if ((data[(y * lado + x) * 4 + 3] as number) >= ALFA_FIGURA) {
        if (y < y0) y0 = y;
        y1 = y;
        break;
      }
  if (y1 < 0) return null;
  const h = y1 - y0 + 1;
  const b0 = y0 + Math.floor(h * BANDA_DEL_TRONCO[0]);
  const b1 = y0 + Math.floor(h * BANDA_DEL_TRONCO[1]);
  const xs: number[] = [];
  for (let y = b0; y <= b1; y++)
    for (let x = 0; x < lado; x++)
      if ((data[(y * lado + x) * 4 + 3] as number) >= ALFA_FIGURA) xs.push(x);
  if (xs.length === 0) return null;
  xs.sort((a, b) => a - b);
  const p = (q: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * q))] as number;
  return [
    Math.max(0, p(0.2) - MARGEN_DE_LA_VENTANA),
    Math.max(0, b0 - MARGEN_DE_LA_VENTANA),
    Math.min(lado, p(0.8) + MARGEN_DE_LA_VENTANA + 1),
    Math.min(lado, b1 + MARGEN_DE_LA_VENTANA + 1),
  ];
}

/** La luz con el alfa: lo que se correlaciona (el contorno pesa, el interior también). */
function luz(c: CeldaRgba): Float32Array {
  const { data, lado } = c;
  const l = new Float32Array(lado * lado);
  for (let i = 0; i < lado * lado; i++) {
    const a = data[i * 4 + 3] as number;
    l[i] =
      (0.3 * (data[i * 4] as number) +
        0.59 * (data[i * 4 + 1] as number) +
        0.11 * (data[i * 4 + 2] as number)) *
        (a / 255) +
      a * 0.5;
  }
  return l;
}

/**
 * El desplazamiento `(dx, dy)` que lleva la ventana de `a` sobre `b`, y su NCC:
 * `b(x + dx, y + dy) ≈ a(x, y)`.
 */
export function registrar(
  a: CeldaRgba,
  b: CeldaRgba,
  ventana: readonly [number, number, number, number],
  radio = RADIO,
): { dx: number; dy: number; ncc: number } {
  return registrarLuces(luz(a), luz(b), a.lado, ventana, radio);
}

/** `registrar` con la luz de cada celda ya calculada (una vez por fotograma). */
function registrarLuces(
  la: Float32Array,
  lb: Float32Array,
  lado: number,
  ventana: readonly [number, number, number, number],
  radio = RADIO,
): { dx: number; dy: number; ncc: number } {
  const [x0, y0, x1, y1] = ventana;
  const w = x1 - x0;
  const h = y1 - y0;
  const pa = new Float32Array(w * h);
  let media = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = la[(y0 + y) * lado + x0 + x] as number;
      pa[y * w + x] = v;
      media += v;
    }
  media /= w * h;
  let na = 0;
  for (let i = 0; i < pa.length; i++) {
    pa[i] = (pa[i] as number) - media;
    na += (pa[i] as number) ** 2;
  }
  na = Math.sqrt(na) + 1e-6;
  let mejor = { dx: 0, dy: 0, ncc: -2 };
  for (let dy = -radio; dy <= radio; dy++) {
    if (y0 + dy < 0 || y1 + dy > lado) continue;
    for (let dx = -radio; dx <= radio; dx++) {
      if (x0 + dx < 0 || x1 + dx > lado) continue;
      let mb = 0;
      for (let y = 0; y < h; y++) {
        const fila = (y0 + dy + y) * lado + x0 + dx;
        for (let x = 0; x < w; x++) mb += lb[fila + x] as number;
      }
      mb /= w * h;
      let cruz = 0;
      let nb = 0;
      for (let y = 0; y < h; y++) {
        const fila = (y0 + dy + y) * lado + x0 + dx;
        for (let x = 0; x < w; x++) {
          const v = (lb[fila + x] as number) - mb;
          cruz += (pa[y * w + x] as number) * v;
          nb += v * v;
        }
      }
      const ncc = cruz / (na * (Math.sqrt(nb) + 1e-6));
      if (ncc > mejor.ncc) mejor = { dx, dy, ncc };
    }
  }
  return mejor;
}

/** Resuelve `A x = b` (pequeño, simétrico) por eliminación con pivote parcial. */
function resolver(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((f, i) => [...f, b[i] as number]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let f = c + 1; f < n; f++)
      if (Math.abs((M[f] as number[])[c] as number) > Math.abs((M[p] as number[])[c] as number))
        p = f;
    [M[c], M[p]] = [M[p] as number[], M[c] as number[]];
    const piv = (M[c] as number[])[c] as number;
    if (Math.abs(piv) < 1e-12) continue;
    for (let f = 0; f < n; f++) {
      if (f === c) continue;
      const k = ((M[f] as number[])[c] as number) / piv;
      for (let j = c; j <= n; j++)
        (M[f] as number[])[j] =
          ((M[f] as number[])[j] as number) - k * ((M[c] as number[])[j] as number);
    }
  }
  return M.map((f, i) => {
    const piv = f[i] as number;
    return Math.abs(piv) < 1e-12 ? 0 : (f[n] as number) / piv;
  });
}

/**
 * Cuánto hay que mover cada fotograma de un clip para que el tronco pintado siga a
 * la cadera del maniquí. `caderas[i]` es dónde espera el maniquí la cadera en el
 * fotograma `i`, en píxeles de la celda pintada (solo cuentan sus diferencias).
 */
export function desplazamientosDelTronco(
  celdas: readonly CeldaRgba[],
  caderas: readonly (readonly [number, number])[],
  bucle: boolean,
): Recolocacion {
  const n = celdas.length;
  if (caderas.length !== n)
    throw new Error(`el clip tiene ${n} fotogramas y el maniquí da la cadera de ${caderas.length}`);
  const orden = [...Array(n).keys(), ...(bucle && n > 2 ? [0] : [])];
  const pares: ParDelTronco[] = [];
  // La luz y la ventana de cada fotograma, una vez: cada uno entra en dos pares.
  const luces = celdas.map(luz);
  const ventanas = celdas.map(ventanaDelTronco);
  for (let k = 0; k + 1 < orden.length; k++) {
    const i = orden[k] as number;
    const j = orden[k + 1] as number;
    const ventana = ventanas[i];
    if (ventana === null || ventana === undefined || ventanas[j] === null) continue;
    const { dx, dy, ncc } = registrarLuces(
      luces[i] as Float32Array,
      luces[j] as Float32Array,
      (celdas[i] as CeldaRgba).lado,
      ventana,
    );
    const ci = caderas[i] as readonly [number, number];
    const cj = caderas[j] as readonly [number, number];
    pares.push({ de: i, a: j, pintado: [dx, dy], maniqui: [cj[0] - ci[0], cj[1] - ci[1]], ncc });
  }
  const validos = pares.filter((p) => p.ncc >= NCC_MINIMO);
  // Los fotogramas unidos por pares válidos, en componentes: cada una lleva su
  // media a 0, y el que no tiene pares se queda donde está.
  const grupo = Array.from({ length: n }, (_, i) => i);
  const raiz = (i: number): number => {
    let r = i;
    while (grupo[r] !== r) r = grupo[r] as number;
    return r;
  };
  for (const p of validos) grupo[raiz(p.de)] = raiz(p.a);
  const desplazamientos: [number, number][] = Array.from({ length: n }, () => [0, 0]);
  const componentes = new Map<number, number[]>();
  for (const p of validos)
    for (const i of [p.de, p.a]) {
      const r = raiz(i);
      const m = componentes.get(r) ?? [];
      if (!m.includes(i)) m.push(i);
      componentes.set(r, m);
    }
  for (const miembros of componentes.values()) {
    const m = miembros.length;
    const pos = new Map(miembros.map((f, k) => [f, k]));
    for (const eje of [0, 1] as const) {
      // Mínimos cuadrados con peso NCC: o[a] − o[de] = sobra; y Σ o = 0, con peso fuerte.
      const A = Array.from({ length: m }, () => Array<number>(m).fill(0));
      const b = Array<number>(m).fill(0);
      for (const p of validos) {
        const i = pos.get(p.de);
        const j = pos.get(p.a);
        if (i === undefined || j === undefined || i === j) continue;
        const w = p.ncc;
        const sobra = (p.pintado[eje] as number) - (p.maniqui[eje] as number);
        (A[i] as number[])[i] = ((A[i] as number[])[i] as number) + w;
        (A[j] as number[])[j] = ((A[j] as number[])[j] as number) + w;
        (A[i] as number[])[j] = ((A[i] as number[])[j] as number) - w;
        (A[j] as number[])[i] = ((A[j] as number[])[i] as number) - w;
        b[i] = (b[i] as number) - w * sobra;
        b[j] = (b[j] as number) + w * sobra;
      }
      for (let i = 0; i < m; i++)
        for (let j = 0; j < m; j++) (A[i] as number[])[j] = ((A[i] as number[])[j] as number) + 10;
      const o = resolver(A, b);
      const media = o.reduce((s, v) => s + v, 0) / m;
      for (const [f, k] of pos) {
        // Cada fotograma se mueve al revés de lo que se aparta.
        const v = -((o[k] as number) - media);
        (desplazamientos[f] as [number, number])[eje] = Math.max(
          -TOPE,
          Math.min(TOPE, Math.round(v)),
        );
      }
    }
  }
  return { desplazamientos, pares };
}

/** La fila del píxel opaco más bajo de una celda, o `null` si está vacía. */
export function fondoDe(c: CeldaRgba): number | null {
  for (let y = c.lado - 1; y >= 0; y--)
    for (let x = 0; x < c.lado; x++)
      if ((c.data[(y * c.lado + x) * 4 + 3] as number) >= ALFA_FIGURA) return y;
  return null;
}

/**
 * C1 con los pies en su sitio (QA del 30-10-2026, H3): el tronco manda en x y en y,
 * pero en cada fotograma el píxel opaco más bajo no baja de la línea del suelo de
 * su celda (`suelo`), ni sube más de lo que el pie del maniquí se separa del suelo
 * en ese fotograma (`alzas[i]`). Con la media de los desplazamientos a 0, C1
 * anclaba la media al suelo y hundía hasta 15 px los fotogramas con el pie apoyado.
 * Nunca deja un fotograma peor que antes de C1: si ya estaba fuera, solo lo acerca.
 */
export function recolocarConLosPies(
  celdas: readonly CeldaRgba[],
  troncos: readonly (readonly [number, number])[],
  bucle: boolean,
  suelo: number,
  alzas: readonly number[],
): Recolocacion {
  const r = desplazamientosDelTronco(celdas, troncos, bucle);
  return {
    ...r,
    desplazamientos: r.desplazamientos.map(([dx, dy], i) => {
      const fondo = fondoDe(celdas[i] as CeldaRgba);
      if (fondo === null) return [dx, dy] as const;
      const abajo = Math.max(0, suelo - fondo);
      const arriba = Math.min(0, suelo - (alzas[i] ?? 0) - fondo);
      return [dx, Math.min(abajo, Math.max(arriba, dy))] as const;
    }),
  };
}
