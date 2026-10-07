/**
 * El macizo: cómo crece una franja de montaña de la falda a la cumbre (#171).
 *
 * Antes la cordillera crecía con la hondura de `analizar` —un BFS entero en 8
 * vecinos desde el borde—, y las franjas de montaña del procedimental son bandas
 * de 2 a 6 casillas, casi siempre en diagonal: con 8 vecinos, casi toda casilla
 * toca el borde. Medido el 07-10-2026: en la semilla 1, 128 de 150 casillas de
 * montaña tenían hondura 1, y en la 34, las 67. Todos los picos salían del mismo
 * alto y la masa se leía como una alfombra.
 *
 * Aquí la hondura es continua y del PUNTO, no de la casilla: la distancia
 * euclídea a la casilla más cercana que no es de la franja. Una banda de cuatro
 * casillas sube de 0 en la falda a 2 en la cresta, también dentro de una casilla
 * del borde. Y la cresta no es pareja: un ruido suave de la semilla levanta
 * cumbres y deja collados entre ellas.
 *
 * Es puro y determinista, como el resto del escenógrafo.
 */

/** Hasta dónde se mira el borde, en casillas: más hondo, la cumbre ya no sube. */
const HONDURA_MAXIMA = 4;

/** El alto de un pico en la misma falda, en casillas. */
export const ALTO_DE_FALDA = 0.75;

/** Lo que sube de la falda a la cresta, en casillas, con el ruido en 1. */
const SUBIDA = 3;

/**
 * La hondura a la que la ladera llega a la cresta en una franja ancha: más
 * adentro ya no sube. En una estrecha, la cresta está en su hondura mayor (con
 * 0,5 de mínimo, la de una banda de una casilla) y sube menos.
 */
const HONDURA_DE_CRESTA = 2.5;

/** Lo que sube una franja estrecha, en veces lo que sube una ancha. */
const SUBIDA_DE_LA_ESTRECHA = 0.55;

/** El ruido de la cresta va de un collado a una cumbre: estas veces la subida. */
const COLLADO = 0.5;
const CUMBRE = 1.45;

/**
 * El ruido de valor se queda casi siempre entre 0,3 y 0,7: una cresta pareja.
 * Estirado, la mitad de la cresta es collado o cumbre.
 */
const contraste = (r: number): number => Math.min(1, Math.max(0, (r - 0.25) / 0.5));

/** Lado de la retícula del ruido de la cresta, en casillas: una cumbre cada pocas casillas de cresta. */
export const PASO_DEL_RUIDO = 2.6;

export interface Macizo {
  /** La distancia del punto a la casilla más cercana fuera de la franja, en casillas (tope 4). */
  hondura(x: number, y: number): number;
  /** El alto que toca a un pico en `(x, y)`, en casillas, antes del azar de cada uno. */
  alto(x: number, y: number): number;
  /** De 0 en la falda a 1 en la cumbre más alta posible: elige hoja y silueta. */
  cumbre(x: number, y: number): number;
}

/**
 * El macizo de una franja de `casillas` (índices `y * W + x`) en un mapa de
 * `W × H`, con la cresta modulada por `ruido` (de 0 a 1, suave; el de
 * `componer` es `ruidoSuave` con `PASO_DEL_RUIDO`). Como en `analizar`, el borde
 * del mapa no es borde: la franja sigue más allá.
 */
export function macizoDe(
  casillas: readonly number[],
  W: number,
  H: number,
  ruido: (x: number, y: number) => number,
): Macizo {
  const dentro = new Uint8Array(W * H);
  for (const i of casillas) dentro[i] = 1;
  const hondura = (x: number, y: number): number => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let mejor = HONDURA_MAXIMA;
    for (let dy = -HONDURA_MAXIMA; dy <= HONDURA_MAXIMA; dy++)
      for (let dx = -HONDURA_MAXIMA; dx <= HONDURA_MAXIMA; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || dentro[ny * W + nx] === 1) continue;
        // Del punto al cuadrado de esa casilla: 0 si cae dentro.
        const ex = Math.max(nx - x, 0, x - (nx + 1));
        const ey = Math.max(ny - y, 0, y - (ny + 1));
        mejor = Math.min(mejor, Math.hypot(ex, ey));
      }
    return mejor;
  };
  // Dónde está la cresta: la hondura mayor de la franja, medida en el centro de
  // cada casilla. Las bandas del procedimental tienen 2-6 casillas de ancho, y
  // con una cresta fija a 2,5 casillas casi ninguna la alcanzaba (#171).
  let mayor = 0;
  for (const i of casillas)
    mayor = Math.max(mayor, hondura((i % W) + 0.5, Math.floor(i / W) + 0.5));
  const cresta = Math.min(HONDURA_DE_CRESTA, Math.max(0.5, mayor));
  const subida =
    SUBIDA *
    (SUBIDA_DE_LA_ESTRECHA +
      ((1 - SUBIDA_DE_LA_ESTRECHA) * (cresta - 0.5)) / (HONDURA_DE_CRESTA - 0.5));
  /** De 0 en la falda a `CUMBRE` en la cumbre más alta. */
  const relieve = (x: number, y: number): number =>
    Math.min(1, hondura(x, y) / cresta) * (COLLADO + (CUMBRE - COLLADO) * contraste(ruido(x, y)));
  return {
    hondura,
    alto: (x, y) => ALTO_DE_FALDA + subida * relieve(x, y),
    cumbre: (x, y) => relieve(x, y) / CUMBRE,
  };
}

/** El radio entre picos, en casillas, para su alto: la falda apretada, las cumbres espaciadas. */
export const radioDePico = (alto: number): number => 0.3 + 0.2 * alto;
