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
import { ALFA_FIGURA, type Cuerpo, cuerpoDe } from './empaquetar.js';

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
  const cuerpo = cuerpoDeLaCelda(c);
  if (cuerpo === null) return null;
  const { lado } = c;
  const [, y0, , y1] = cuerpo.caja;
  const h = y1 - y0 + 1;
  const b0 = y0 + Math.floor(h * BANDA_DEL_TRONCO[0]);
  const b1 = y0 + Math.floor(h * BANDA_DEL_TRONCO[1]);
  const xs: number[] = [];
  for (let y = b0; y <= b1; y++)
    for (let x = 0; x < cuerpo.w; x++)
      if (cuerpo.mascara[(y - cuerpo.y0) * cuerpo.w + x]) xs.push(cuerpo.x0 + x);
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

/**
 * El cuerpo de una celda (la silueta sin lo fino, `cuerpoDe`), o `null` si está
 * vacía: la ventana del tronco y el pie de C1 se miden sobre él, no sobre la pica.
 */
export function cuerpoDeLaCelda(c: CeldaRgba): Cuerpo | null {
  const { data, lado } = c;
  let x0 = lado;
  let y0 = lado;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < lado; y++)
    for (let x = 0; x < lado; x++)
      if ((data[(y * lado + x) * 4 + 3] as number) >= ALFA_FIGURA) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  if (y1 < 0) return null;
  return cuerpoDe((x, y) => data[(y * lado + x) * 4 + 3] as number, [x0, y0, x1, y1]);
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

/** Lo que se pide a la recolocación, además de los pares del tronco. */
export interface OpcionesDeRecolocar {
  /**
   * Por fotograma, cuánto habría que moverlo según una medida ABSOLUTA del tronco (el
   * estimador de pose: caderas y hombros pintados frente a los del maniquí, con la media
   * quitada), o `null` si no se midió. Es lo que el usuario prefirió en los
   * experimentos (6 de 8, la versión de `encuadre.py`).
   */
  readonly absolutos?: readonly (readonly [number, number] | null)[];
  /** Cuánto pesa cada medida absoluta frente a un par de NCC (que pesa su NCC, ≤ 1). */
  readonly pesoAbsoluto?: number;
  /** Por fotograma, lo más que puede bajar (y > 0): el límite de los pies. */
  readonly bajaComoMucho?: readonly number[];
  /** Por fotograma, lo más que puede subir (en px, positivo): el margen de su celda. */
  readonly subeComoMucho?: readonly number[];
}

/** Lo que pesa una medida del estimador por defecto: la señal principal cuando la hay. */
export const PESO_DEL_ESTIMADOR = 1;

/**
 * Los desplazamientos de un eje por mínimos cuadrados: cada par pide `s[a] − s[de] =
 * objetivo` con su peso, cada medida absoluta `s[i] = objetivo` con el suyo; los
 * fotogramas de `fijos` no se mueven de lo dado. Un grupo de fotogramas sin nada que
 * lo ancle (ni absoluto ni fijo) lleva su media a 0. Un fotograma sin nada, 0.
 */
function resolverEje(
  n: number,
  pares: readonly { de: number; a: number; objetivo: number; peso: number }[],
  absolutos: readonly { i: number; objetivo: number; peso: number }[],
  fijos: ReadonlyMap<number, number>,
): number[] {
  const grupo = Array.from({ length: n }, (_, i) => i);
  const raiz = (i: number): number => {
    let r = i;
    while (grupo[r] !== r) r = grupo[r] as number;
    return r;
  };
  for (const p of pares) grupo[raiz(p.de)] = raiz(p.a);
  const usados = new Set<number>([
    ...pares.flatMap((p) => [p.de, p.a]),
    ...absolutos.map((a) => a.i),
  ]);
  const libres = [...usados].filter((i) => !fijos.has(i)).sort((a, b) => a - b);
  const pos = new Map(libres.map((f, k) => [f, k]));
  const m = libres.length;
  const s = Array.from({ length: n }, (_, i) => fijos.get(i) ?? 0);
  if (m === 0) return s;
  const A = Array.from({ length: m }, () => Array<number>(m).fill(0));
  const b = Array<number>(m).fill(0);
  const sumar = (i: number, j: number, v: number) => {
    (A[i] as number[])[j] = ((A[i] as number[])[j] as number) + v;
  };
  for (const p of pares) {
    const i = pos.get(p.de);
    const j = pos.get(p.a);
    const w = p.peso;
    // w · (s[a] − s[de] − objetivo)²
    if (j !== undefined) {
      sumar(j, j, w);
      b[j] = (b[j] as number) + w * (p.objetivo + (i === undefined ? (fijos.get(p.de) ?? 0) : 0));
    }
    if (i !== undefined) {
      sumar(i, i, w);
      b[i] = (b[i] as number) - w * (p.objetivo - (j === undefined ? (fijos.get(p.a) ?? 0) : 0));
    }
    if (i !== undefined && j !== undefined) {
      sumar(i, j, -w);
      sumar(j, i, -w);
    }
  }
  for (const a of absolutos) {
    const i = pos.get(a.i);
    if (i === undefined) continue;
    sumar(i, i, a.peso);
    b[i] = (b[i] as number) + a.peso * a.objetivo;
  }
  // Los grupos sin ancla, con su media a 0.
  const anclados = new Set([...absolutos.map((a) => raiz(a.i)), ...[...fijos.keys()].map(raiz)]);
  const porGrupo = new Map<number, number[]>();
  for (const f of libres) {
    const r = raiz(f);
    if (anclados.has(r)) continue;
    porGrupo.set(r, [...(porGrupo.get(r) ?? []), pos.get(f) as number]);
  }
  for (const miembros of porGrupo.values())
    for (const i of miembros) for (const j of miembros) sumar(i, j, 10);
  const x = resolver(A, b);
  for (const [f, k] of pos) s[f] = x[k] as number;
  return s;
}

/**
 * Cuánto hay que mover cada fotograma de un clip para que el tronco pintado siga al
 * del maniquí. `caderas[i]` es dónde espera el maniquí el tronco en el fotograma `i`,
 * en píxeles de la celda pintada (solo cuentan sus diferencias). Con `opciones`, las
 * medidas absolutas del estimador y el límite de los pies (`recolocarConLosPies`).
 */
export function desplazamientosDelTronco(
  celdas: readonly CeldaRgba[],
  caderas: readonly (readonly [number, number])[],
  bucle: boolean,
  opciones: OpcionesDeRecolocar = {},
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
  const peso = opciones.pesoAbsoluto ?? PESO_DEL_ESTIMADOR;
  const ejes = ([0, 1] as const).map((eje) => {
    // Cada fotograma se mueve al revés de lo que se aparta: s[a] − s[de] = −sobra.
    const deLosPares = validos.map((p) => ({
      de: p.de,
      a: p.a,
      objetivo: -((p.pintado[eje] as number) - (p.maniqui[eje] as number)),
      peso: p.ncc,
    }));
    const absolutos = (opciones.absolutos ?? []).flatMap((v, i) =>
      v === null ? [] : [{ i, objetivo: v[eje] as number, peso }],
    );
    let fijos = new Map<number, number>();
    let s = resolverEje(n, deLosPares, absolutos, fijos);
    // Los pies (solo en y): lo que bajaría más de su límite se fija en él, y el resto
    // se vuelve a repartir; hasta que nada pase (C1 con los pies, QA del 30-10-2026).
    // Y el margen de la celda: lo que subiría más de lo que cabe, igual.
    const baja = eje === 1 ? opciones.bajaComoMucho : undefined;
    const sube = eje === 1 ? opciones.subeComoMucho : undefined;
    for (let vuelta = 0; (baja !== undefined || sube !== undefined) && vuelta < n; vuelta++) {
      const pasan = s.flatMap((v, i): (readonly [number, number])[] => {
        if (fijos.has(i)) return [];
        const max = baja?.[i] ?? Number.POSITIVE_INFINITY;
        const min = -(sube?.[i] ?? Number.POSITIVE_INFINITY);
        return v > max + 0.5 ? [[i, max]] : v < min - 0.5 ? [[i, min]] : [];
      });
      if (pasan.length === 0) break;
      fijos = new Map([...fijos, ...pasan]);
      s = resolverEje(n, deLosPares, absolutos, fijos);
    }
    return s.map((v) => Math.max(-TOPE, Math.min(TOPE, Math.round(v))));
  });
  return {
    desplazamientos: Array.from(
      { length: n },
      (_, i) => [ejes[0]?.[i] ?? 0, ejes[1]?.[i] ?? 0] as const,
    ),
    pares,
  };
}

/** La fila del píxel más bajo del cuerpo de una celda (sin lo fino), o `null` si está vacía. */
export function fondoDe(c: CeldaRgba): number | null {
  // La fila más baja del cuerpo: la punta de una pica no es el pie.
  return cuerpoDeLaCelda(c)?.caja[3] ?? null;
}

/** Lo que se tolera que un pie pintado baje del punto más bajo del maniquí, en px de la celda. */
export const HUNDIMIENTO_TOLERADO = 6;

/**
 * C1 con los pies en su sitio: el tronco manda en x y en y, pero en cada fotograma el
 * cuerpo pintado no baja más de `HUNDIMIENTO_TOLERADO` del punto más bajo del maniquí
 * en ese fotograma (`pies[i]`, en la celda pintada). Con la cámara a 25° el pie que
 * avanza hacia la cámara cae más abajo en la pantalla, así que el suelo es el del
 * maniquí, fotograma a fotograma, no una línea fija (con la línea fija, QA del
 * 30-10-2026, el cuerpo no podía bajar cuando el maniquí bajaba y el piquero saltaba
 * 7-21 px). Subir no se limita: es el tronco el que manda. Lo que pasaría del límite se
 * fija en él y el resto se reparte otra vez (`desplazamientosDelTronco`). Nunca deja un
 * fotograma más hundido que antes de C1.
 */
export function recolocarConLosPies(
  celdas: readonly CeldaRgba[],
  troncos: readonly (readonly [number, number])[],
  bucle: boolean,
  pies: readonly number[],
  opciones: Omit<OpcionesDeRecolocar, 'bajaComoMucho' | 'subeComoMucho'> & {
    /** Por fotograma, cuánto cabe subir en su celda antes de cortarse (el margen). */
    readonly subeComoMucho?: readonly number[];
  } = {},
): Recolocacion {
  // Hasta `VUELTAS_DE_C1` vueltas: al mover, pares que no se parecían (la muerte, el
  // ataque) pasan a parecerse y dicen lo que quedaba por mover.
  let movidas = [...celdas];
  const total: [number, number][] = celdas.map(() => [0, 0]);
  let ultima: Recolocacion = { desplazamientos: total, pares: [] };
  for (let vuelta = 0; vuelta < VUELTAS_DE_C1; vuelta++) {
    const bajaComoMucho = movidas.map((c, i) => {
      const fondo = fondoDe(c);
      return fondo === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, (pies[i] ?? fondo) + HUNDIMIENTO_TOLERADO - fondo);
    });
    const absolutos = opciones.absolutos?.map((a, i) =>
      a === null
        ? null
        : ([
            a[0] - (total[i] as [number, number])[0],
            a[1] - (total[i] as [number, number])[1],
          ] as const),
    );
    const subeComoMucho = opciones.subeComoMucho?.map(
      (v, i) => v + (total[i] as [number, number])[1],
    );
    ultima = desplazamientosDelTronco(movidas, troncos, bucle, {
      ...opciones,
      ...(absolutos === undefined ? {} : { absolutos }),
      ...(subeComoMucho === undefined ? {} : { subeComoMucho }),
      bajaComoMucho,
    });
    if (ultima.desplazamientos.every(([dx, dy]) => dx === 0 && dy === 0)) break;
    movidas = movidas.map((c, i) => {
      const [dx, dy] = ultima.desplazamientos[i] as readonly [number, number];
      (total[i] as [number, number])[0] += dx;
      (total[i] as [number, number])[1] += dy;
      return moverCelda(c, dx, dy);
    });
  }
  return {
    desplazamientos: total.map(
      ([dx, dy]) =>
        [Math.max(-TOPE, Math.min(TOPE, dx)), Math.max(-TOPE, Math.min(TOPE, dy))] as const,
    ),
    pares: ultima.pares,
  };
}

/** Cuántas veces se mide y se recoloca un clip, como mucho. */
export const VUELTAS_DE_C1 = 3;

/** Una celda movida (dx, dy) dentro de su lado (lo que sale, se pierde). */
export function moverCelda(c: CeldaRgba, dx: number, dy: number): CeldaRgba {
  const { lado } = c;
  if (dx === 0 && dy === 0) return c;
  const data = new Uint8Array(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= lado) continue;
    const x0 = Math.max(0, dx);
    const x1 = Math.min(lado, lado + dx);
    if (x1 <= x0) continue;
    data.set(
      c.data.subarray((sy * lado + x0 - dx) * 4, (sy * lado + x1 - dx) * 4),
      (y * lado + x0) * 4,
    );
  }
  return { data, lado };
}

/** Quien mide el tronco pintado de cada celda (el estimador de pose), o `null` si no lo ve. */
export type EstimarTroncos = (
  celdas: readonly CeldaRgba[],
) => Promise<readonly (readonly [number, number] | null)[]>;

/**
 * De lo que ve el estimador a cuánto mover cada fotograma: el tronco pintado frente al
 * del maniquí (`troncos`), con la media quitada (la posición del clip no cambia), y al
 * revés (se mueve para cancelar lo que se aparta). `null` donde no vio nada.
 */
export function absolutosDe(
  estimados: readonly (readonly [number, number] | null)[],
  troncos: readonly (readonly [number, number])[],
): (readonly [number, number] | null)[] {
  const d = estimados.map((e, i) => {
    const t = troncos[i];
    return e === null || t === undefined ? null : ([e[0] - t[0], e[1] - t[1]] as const);
  });
  const vistos = d.filter((v): v is readonly [number, number] => v !== null);
  if (vistos.length === 0) return d;
  const media = [0, 1].map(
    (q) => vistos.reduce((s2, v) => s2 + (v[q] as number), 0) / vistos.length,
  );
  return d.map((v) =>
    v === null ? null : ([-(v[0] - (media[0] as number)), -(v[1] - (media[1] as number))] as const),
  );
}

/** El mayor salto de un clip: cuánto, y entre qué fotogramas (desde 1). */
export interface Salto {
  readonly px: number;
  readonly de: number;
  readonly a: number;
}

/**
 * El mayor salto del tronco de un clip (lo que se mueve el tronco pintado de un
 * fotograma al siguiente más de lo que se mueve el del maniquí), o `null` si ningún par
 * se parece lo bastante para medirlo. Es la cifra que coincidió con lo que vio el
 * usuario en el piquero (30-10-2026); la enseñan `revisar` y el visor (`salto.ts`).
 */
export function saltoDelClip(
  celdas: readonly CeldaRgba[],
  troncos: readonly (readonly [number, number])[],
  bucle: boolean,
): Salto | null {
  const { pares } = desplazamientosDelTronco(celdas, troncos, bucle);
  let mayor: Salto | null = null;
  for (const p of pares) {
    if (p.ncc < NCC_MINIMO) continue;
    const px = Math.round(Math.hypot(p.pintado[0] - p.maniqui[0], p.pintado[1] - p.maniqui[1]));
    if (mayor === null || px > mayor.px) mayor = { px, de: p.de + 1, a: p.a + 1 };
  }
  return mayor;
}

/**
 * C1 con la línea fija del suelo (la regla anterior, QA del 30-10-2026, H3): el pie
 * no baja de `suelo` ni sube más que el del maniquí (`alzas`). Se queda como una de
 * las recolocaciones entre las que elige `mejorRecolocacion`.
 */
export function recolocarConElSuelo(
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

/**
 * De varias recolocaciones de un clip, la que deja el tronco pintado más pegado al del
 * maniquí (el menor `saltoDelClip` de las celdas movidas); a igualdad, la primera. Así
 * ninguna sale peor que la que había: si la regla nueva pierde en un clip (la muerte,
 * con pocos pares que se parezcan), gana la de antes o ninguna.
 */
export function mejorRecolocacion(
  celdas: readonly CeldaRgba[],
  troncos: readonly (readonly [number, number])[],
  bucle: boolean,
  candidatas: readonly (readonly (readonly [number, number])[])[],
): {
  readonly desplazamientos: readonly (readonly [number, number])[];
  readonly salto: number;
  readonly cual: number;
} {
  let mejor = {
    desplazamientos: candidatas[0] ?? celdas.map(() => [0, 0] as const),
    salto: Number.POSITIVE_INFINITY,
    cual: 0,
  };
  for (const [cual, ds] of candidatas.entries()) {
    const movidas = celdas.map((c, i) => moverCelda(c, ds[i]?.[0] ?? 0, ds[i]?.[1] ?? 0));
    const salto = saltoDelClip(movidas, troncos, bucle)?.px ?? 0;
    if (salto < mejor.salto) mejor = { desplazamientos: ds, salto, cual };
  }
  return mejor;
}
