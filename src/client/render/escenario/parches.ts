/**
 * El suelo sin rejilla (R2): cómo se encaja una textura en el mapa.
 *
 * Una textura que se repite con `createPattern('repeat')` cada 4 casillas
 * enseña al alejar su rejilla: la misma mancha de nieve, la misma mata, en
 * filas y columnas (la autocorrelación del dibujo al periodo de la textura era
 * 0,53-0,69 en las semillas 1, 7 y 13; 2026-10-08). El remedio es el
 * *texture bombing*: encima del patrón van parches redondos de la misma
 * textura, cada uno con otro trozo (`Variante`: un desplazamiento y, a veces,
 * el espejo izquierda-derecha), fundidos por el borde y en un orden barajado.
 * Sin giros ni espejo vertical: la arena tiene ondas horizontales y la luz de
 * las texturas viene de arriba.
 *
 * Puro y determinista: el azar sale de la semilla de la escena y de la clave de
 * la textura, así que cliente, espectador y taller encajan igual, y el Worker y
 * el hilo pintan lo mismo. Lo leen dos: el pintor, que estampa los parches
 * (`pintar.ts`), y las fronteras, que leen la altura de la textura en el mismo
 * encaje que se ve (`fronteras.ts`): un hecho, un sitio.
 */
import { azarDe, barajar } from './esparcir.js';

/** Casillas que mide la textura de un suelo al pintarla. */
export const CASILLAS_POR_TEXTURA = 4;

/** El paso de la rejilla de parches, en casillas: uno por celda, desplazado al azar. */
export const PASO_DEL_PARCHE = 1.5;
/** Lo que se mueve el centro de un parche dentro de su celda, en fracción del paso. */
const DESVIO_DEL_PARCHE = 0.3;
/** Hasta este radio, en casillas, el parche tapa entero. */
const RADIO_PLENO = 0.85;
/** Aquí ya no pinta nada. Con el desvío, ninguna celda vecina más allá de la de al lado llega. */
export const RADIO_DEL_PARCHE = PASO_DEL_PARCHE;
/**
 * Cuántos trozos distintos de cada textura: cada uno es una estampa que el
 * pintor tiene viva mientras pinta esa textura (a 120 px, 360² px, ~0,5 MB).
 */
export const VARIANTES_POR_TEXTURA = 12;

/** Un trozo de la textura: lo que se ve en el centro del parche, y si va espejado. */
export interface Variante {
  /** Fracción (0-1) de la textura en el centro del parche. */
  readonly u: number;
  readonly v: number;
  readonly espejo: boolean;
}

export interface Parche {
  /** Centro, en casillas. */
  readonly x: number;
  readonly y: number;
  readonly variante: number;
  /** Su sitio en el orden en que se pinta. */
  readonly orden: number;
}

/** El encaje de una textura en un mapa de `W × H`. */
export interface Encaje {
  readonly casillasPorTextura: number;
  readonly variantes: readonly Variante[];
  /** Los parches, en el orden en que se pintan. */
  readonly parches: readonly Parche[];
  /** Columnas y filas de la rejilla; `celdas[j·columnas + i]` es el parche de esa celda. */
  readonly columnas: number;
  readonly filas: number;
  readonly celdas: readonly Parche[];
  /**
   * Por celda, los parches de las 3 × 3 de alrededor en el orden en que se
   * pintan: los únicos que llegan a un punto de ella. Hechos de antemano porque
   * las fronteras leen el encaje en cada punto de cada frontera (~0,1 s por
   * superficie si se ordenaban punto a punto).
   */
  readonly alrededor: readonly (readonly Parche[])[];
}

/** FNV-1a de 32 bits: una clave de textura a un entero. */
function hashDe(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * El encaje de la textura `clave` (el suelo, o `agua`, `barro`) en la escena de
 * `semilla`. Cada textura tiene el suyo: con el mismo, dos suelos vecinos
 * cambiarían de trozo en el mismo sitio.
 */
export function encajeDe(
  semilla: number,
  clave: string,
  W: number,
  H: number,
  casillasPorTextura: number,
): Encaje {
  const azar = azarDe((Math.imul(semilla | 0, 0x9e3779b1) ^ hashDe(clave)) >>> 0);
  const variantes: Variante[] = [];
  for (let k = 0; k < VARIANTES_POR_TEXTURA; k++)
    variantes.push({ u: azar(), v: azar(), espejo: azar() < 0.5 });
  const columnas = Math.ceil(W / PASO_DEL_PARCHE);
  const filas = Math.ceil(H / PASO_DEL_PARCHE);
  const sitios: { x: number; y: number; variante: number }[] = [];
  for (let j = 0; j < filas; j++)
    for (let i = 0; i < columnas; i++) {
      const dx = (azar() * 2 - 1) * DESVIO_DEL_PARCHE;
      const dy = (azar() * 2 - 1) * DESVIO_DEL_PARCHE;
      sitios.push({
        x: (i + 0.5 + dx) * PASO_DEL_PARCHE,
        y: (j + 0.5 + dy) * PASO_DEL_PARCHE,
        variante: Math.floor(azar() * VARIANTES_POR_TEXTURA),
      });
    }
  // El orden barajado (Fisher-Yates): en orden de filas, cada fila taparía el
  // borde de la anterior siempre por el mismo lado, y eso es otra rejilla.
  const orden = barajar(
    sitios.map((_, k) => k),
    azar,
  );
  const celdas: Parche[] = new Array(sitios.length);
  const parches: Parche[] = orden.map((celda, n) => {
    const p = { ...(sitios[celda] as (typeof sitios)[number]), orden: n };
    celdas[celda] = p;
    return p;
  });
  const alrededor = celdas.map((_, k) => {
    const ci = k % columnas;
    const cj = Math.floor(k / columnas);
    const cerca: Parche[] = [];
    for (let j = Math.max(0, cj - 1); j <= Math.min(filas - 1, cj + 1); j++)
      for (let i = Math.max(0, ci - 1); i <= Math.min(columnas - 1, ci + 1); i++)
        cerca.push(celdas[j * columnas + i] as Parche);
    return cerca.sort((a, b) => a.orden - b.orden);
  });
  return { casillasPorTextura, variantes, parches, columnas, filas, celdas, alrededor };
}

/**
 * Lo que tapa un parche (0-1) a `(dx, dy)` casillas de su centro: entero hasta
 * `RADIO_PLENO` y con un borde suave (*smoothstep*) hasta `RADIO_DEL_PARCHE`.
 */
export function pesoDelParche(dx: number, dy: number): number {
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r <= RADIO_PLENO) return 1;
  if (r >= RADIO_DEL_PARCHE) return 0;
  const t = (RADIO_DEL_PARCHE - r) / (RADIO_DEL_PARCHE - RADIO_PLENO);
  return t * t * (3 - 2 * t);
}

/** La parte fraccionaria, también de un negativo. */
const fraccion = (x: number) => x - Math.floor(x);

/**
 * El valor de la textura en `(x, y)` casillas tal como se pinta: el patrón de
 * fondo y encima, en su orden, los parches que llegan al punto, cada uno fundido
 * con su peso. `muestra(u, v)` lee la textura en la fracción `(u, v)`.
 */
export function enElEncaje(
  e: Encaje,
  x: number,
  y: number,
  muestra: (u: number, v: number) => number,
): number {
  const C = e.casillasPorTextura;
  let valor = muestra(fraccion(x / C), fraccion(y / C));
  if (e.columnas === 0) return valor;
  const ci = Math.min(e.columnas - 1, Math.max(0, Math.floor(x / PASO_DEL_PARCHE)));
  const cj = Math.min(e.filas - 1, Math.max(0, Math.floor(y / PASO_DEL_PARCHE)));
  const cerca = e.alrededor[cj * e.columnas + ci] as readonly Parche[];
  for (const p of cerca) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy >= RADIO_DEL_PARCHE * RADIO_DEL_PARCHE) continue;
    const peso = pesoDelParche(dx, dy);
    if (peso <= 0) continue;
    const va = e.variantes[p.variante] as Variante;
    const m = muestra(fraccion((va.espejo ? -dx : dx) / C + va.u), fraccion(dy / C + va.v));
    valor += (m - valor) * peso;
  }
  return valor;
}
