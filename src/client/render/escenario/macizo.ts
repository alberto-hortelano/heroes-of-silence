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
 *
 * Y dos reglas de cómo se viste (defecto C de la auditoría 2, 07-10-2026): un
 * macizo es de un solo material, y ningún pico se amplía más de
 * `AMPLIACION_MAXIMA` al zoom máximo.
 */
import type { Suelo } from '@core/map/terrain.js';
import { PX_AL_ZOOM_MAXIMO } from '../camara-mapa.js';

/** Hasta dónde se mira el borde, en casillas: más hondo, la cumbre ya no sube. */
const HONDURA_MAXIMA = 4;

/** El alto de un pico en la misma falda, en casillas. */
export const ALTO_DE_FALDA = 0.9;

/**
 * Lo que sube de la falda a la cresta lejos de una cumbre, en casillas, con el
 * ruido en el medio. Era 3 (con la cumbre del ruido, ×1,45), y toda la cresta
 * salía de picos de 2-2,5 casillas apretados: la alfombra de pinchos de la
 * auditoría 4 (#204). Ahora la cresta es de picos medianos y lo grande son las
 * cumbres (`cumbres`).
 */
const SUBIDA = 1.0;

/**
 * La hondura a la que la ladera llega a la cresta en una franja ancha: más
 * adentro ya no sube. En una estrecha, la cresta está en su hondura mayor (con
 * 0,5 de mínimo, la de una banda de una casilla) y sube menos.
 */
const HONDURA_DE_CRESTA = 2.5;

/** Lo que sube una franja estrecha, en veces lo que sube una ancha. */
const SUBIDA_DE_LA_ESTRECHA = 0.55;

/** El ruido de la cresta la mueve entre estas veces la subida: un collado y un hombro. */
const COLLADO = 0.7;
const HOMBRO = 1.2;

/**
 * El ruido de valor se queda casi siempre entre 0,3 y 0,7: una cresta pareja.
 * Estirado, la mitad de la cresta es collado u hombro.
 */
const contraste = (r: number): number => Math.min(1, Math.max(0, (r - 0.25) / 0.5));

/** Lado de la retícula del ruido de la cresta, en casillas. */
export const PASO_DEL_RUIDO = 2.6;

/**
 * El alto de una cumbre, en casillas, en la franja más estrecha y en la más
 * ancha: una pieza de 2 × 2 casillas o de 3 × 3 (con la silueta de los módulos,
 * de 0,7 de esbeltez, el ancho sale ~1,4 veces el alto). En HoMM2 una
 * cordillera son pocas piezas grandes con su falda; aquí, las cumbres.
 */
export const ALTO_DE_CUMBRE = { estrecha: 2.5, ancha: 3.0 } as const;

/** La `cumbre` de lo alto de la cresta lejos de una cumbre: a la luz, sin brillo. */
const CRESTA_A_LA_LUZ = 0.6;

/** Casillas de franja por cumbre: una franja de 20 lleva 2; tope `MAS_CUMBRES`. */
const CASILLAS_POR_CUMBRE = 9;
export const MAS_CUMBRES = 4;
/** Una franja más pequeña no lleva cumbre: sus picos se quedan en la falda. */
export const FRANJA_SIN_CUMBRE = 4;

/**
 * Lo más cerca que quedan dos cumbres, en casillas: más cerca, sus faldas se
 * juntan y vuelven a ser una masa pareja.
 */
const ENTRE_CUMBRES = 3.5;

/** Las veces su alto que se prueba una cumbre que no cabe entera, de más a menos. */
const ENCOGIDA = [1, 0.88, 0.78] as const;

/**
 * Lo más baja que va la cumbre de una franja en la que no cupo ninguna: una
 * banda estrecha entre dos sendas. Aún dos casillas de alto en la ancha.
 */
const ULTIMA_ENCOGIDA = 0.68;

/**
 * Hasta dónde baja la falda de una cumbre, en casillas: a esa distancia de su
 * pie ya es cresta. Lo de al lado es mediano, no otra cumbre.
 */
export const FALDA_DE_CUMBRE = 2.4;

/** Una cumbre de un macizo: su pie y su alto, en casillas. */
export interface Cumbre {
  readonly x: number;
  readonly y: number;
  readonly alto: number;
}

export interface Macizo {
  /** La distancia del punto a la casilla más cercana fuera de la franja, en casillas (tope 4). */
  hondura(x: number, y: number): number;
  /** El alto que toca a un pico en `(x, y)`, en casillas, antes del azar de cada uno. */
  alto(x: number, y: number): number;
  /** De 0 en la falda a 1 en la cumbre más alta posible: elige hoja, silueta y luz. */
  cumbre(x: number, y: number): number;
  /** Las pocas cumbres de la franja, de la más honda a la menos (`cumbresDe`). */
  readonly cumbres: readonly Cumbre[];
}

/**
 * El macizo de una franja de `casillas` (índices `y * W + x`) en un mapa de
 * `W × H`, con la cresta modulada por `ruido` (de 0 a 1, suave; el de
 * `componer` es `ruidoSuave` con `PASO_DEL_RUIDO`). Como en `analizar`, el borde
 * del mapa no es borde: la franja sigue más allá. `cabe` dice si una cumbre de
 * ese alto entra en un sitio sin encogerse (la senda, un paso, un objeto): la
 * que no cabe se busca en otro sitio, y si no hay otro, no se pone.
 *
 * Crece en dos escalas (#204): la cresta, de picos medianos que suben poco de
 * la falda, y unas pocas cumbres de 2-3 casillas que dominan la franja, con su
 * falda alrededor. Antes una sola escala, la del ruido, daba picos grandes en
 * toda la cresta, y una franja ancha era un campo de pinchos iguales.
 */
export function macizoDe(
  casillas: readonly number[],
  W: number,
  H: number,
  ruido: (x: number, y: number) => number,
  cabe: (x: number, y: number, alto: number) => boolean = () => true,
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
  const centros = casillas.map((i) => {
    const x = (i % W) + 0.5;
    const y = Math.floor(i / W) + 0.5;
    return { x, y, h: hondura(x, y) };
  });
  const mayor = centros.reduce((m, c) => Math.max(m, c.h), 0);
  const cresta = Math.min(HONDURA_DE_CRESTA, Math.max(0.5, mayor));
  /** De 0 en la franja más estrecha a 1 en la que llega a `HONDURA_DE_CRESTA`. */
  const anchura = (cresta - 0.5) / (HONDURA_DE_CRESTA - 0.5);
  const subida = SUBIDA * (SUBIDA_DE_LA_ESTRECHA + (1 - SUBIDA_DE_LA_ESTRECHA) * anchura);
  const altoDeCumbre =
    ALTO_DE_CUMBRE.estrecha + (ALTO_DE_CUMBRE.ancha - ALTO_DE_CUMBRE.estrecha) * anchura;
  const cumbres = cumbresDe(centros, casillas.length, ruido, altoDeCumbre, cabe);
  /** El alto de la cresta sin cumbres: de la falda a lo que da el ruido. */
  const deLaCresta = (x: number, y: number): number =>
    ALTO_DE_FALDA +
    subida *
      Math.min(1, hondura(x, y) / cresta) *
      (COLLADO + (HOMBRO - COLLADO) * contraste(ruido(x, y)));
  const alto = (x: number, y: number): number => {
    let h = deLaCresta(x, y);
    // La falda de cada cumbre: de su alto en el pie a la cresta a
    // `FALDA_DE_CUMBRE`, en curva (lo de al lado ya es la mitad).
    for (const c of cumbres) {
      const t = Math.max(0, 1 - Math.hypot(x - c.x, y - c.y) / FALDA_DE_CUMBRE);
      h = Math.max(h, ALTO_DE_FALDA + (c.alto - ALTO_DE_FALDA) * t * t);
    }
    return h;
  };
  return {
    hondura,
    alto,
    // Lo que sube hacia la cresta, a `CRESTA_A_LA_LUZ` en lo alto, y la cumbre
    // a 1: con solo el alto, la cresta sin cumbre quedaba en la sombra de la
    // falda y la cordillera entera se oscurecía.
    cumbre: (x, y) =>
      Math.max(
        CRESTA_A_LA_LUZ * Math.min(1, hondura(x, y) / cresta),
        Math.min(1, (alto(x, y) - ALTO_DE_FALDA) / (ALTO_DE_CUMBRE.ancha - ALTO_DE_FALDA)),
      ),
    cumbres,
  };
}

/**
 * Las cumbres de una franja: una cada `CASILLAS_POR_CUMBRE` casillas, de 1 a
 * `MAS_CUMBRES`, ninguna en una franja de menos de `FRANJA_SIN_CUMBRE`. Van en
 * los centros de casilla más hondos (el ruido desempata, para que no salgan
 * siempre en el mismo sitio de la cresta), a `ENTRE_CUMBRES` como poco unas de
 * otras. Una cresta corta puede quedarse con menos.
 */
function cumbresDe(
  centros: readonly { x: number; y: number; h: number }[],
  casillas: number,
  ruido: (x: number, y: number) => number,
  alto: number,
  cabe: (x: number, y: number, alto: number) => boolean,
): Cumbre[] {
  if (casillas < FRANJA_SIN_CUMBRE) return [];
  const cuantas = Math.min(MAS_CUMBRES, Math.max(1, Math.round(casillas / CASILLAS_POR_CUMBRE)));
  const candidatas = centros
    .map((c) => ({ ...c, nota: c.h + 0.6 * ruido(c.x, c.y) }))
    // Desempate por el sitio: el orden de `casillas` no se garantiza.
    .sort((p, q) => q.nota - p.nota || p.y - q.y || p.x - q.x);
  const fuera: Cumbre[] = [];
  for (const encogidas of [ENCOGIDA, [ULTIMA_ENCOGIDA]] as const) {
    for (const c of candidatas) {
      if (fuera.length >= cuantas) break;
      if (fuera.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < ENTRE_CUMBRES)) continue;
      // El pie un poco al sur del centro: la imagen crece hacia arriba y así la
      // cumbre cae sobre su casilla. Donde no cabe entera (la senda o un paso
      // cerca), algo más baja; más baja que `ENCOGIDA` ya no domina y se busca
      // otro sitio, y solo si no hay ninguno, `ULTIMA_ENCOGIDA`.
      const cabida = encogidas.find((k) => cabe(c.x, c.y + 0.3, alto * k));
      if (cabida === undefined) continue;
      fuera.push({ x: c.x, y: c.y + 0.3, alto: alto * cabida });
    }
    if (fuera.length > 0) break;
  }
  return fuera;
}

/** El radio entre picos, en casillas, para su alto: la falda apretada, las cumbres espaciadas. */
export const radioDePico = (alto: number): number => Math.max(0.45, 0.62 * alto);

/**
 * Lo más que se amplía un pico al zoom máximo (`PX_AL_ZOOM_MAXIMO`). La aguja de
 * lava de s9 (`picos-volcan/2`, 149 px de alto) iba a 3 casillas: ×2,4, una
 * mancha desenfocada entre picos nítidos.
 */
export const AMPLIACION_MAXIMA = 1.3;

/** El alto, en casillas, al que un módulo de `nh` píxeles llega sin pasar de `AMPLIACION_MAXIMA`. */
export const altoMaximoDe = (m: { readonly nh: number }): number =>
  (m.nh * AMPLIACION_MAXIMA) / PX_AL_ZOOM_MAXIMO;

/**
 * El material de un pico. La roca lleva dos hojas, `picos-roca` en la falda y
 * `picos-afilados` en la cumbre, pero es la misma piedra gris.
 */
export type MaterialDePico = 'nieve' | 'lava' | 'arena' | 'roca';

export const materialDePico = (s: Suelo): MaterialDePico =>
  s === 'snow' ? 'nieve' : s === 'lava' ? 'lava' : s === 'sand' ? 'arena' : 'roca';

/**
 * En un empate, el de antes. El volcán el último: sus módulos son los de menos
 * resolución (130-290 px de alto), y un empate entre lava y nieve no debe
 * darle a la lava el macizo entero.
 */
const PREFERENCIA: readonly MaterialDePico[] = ['nieve', 'arena', 'roca', 'lava'];

/**
 * El material de cada macizo: el de más casillas entre las suyas (su `suelo`,
 * el del llano más cercano). Un macizo son las casillas de montaña unidas en 8
 * vecinas, aunque `analizar` las parta en varias franjas: las franjas de un
 * mismo macizo se ven como una sola montaña, y una aguja de lava entre picos
 * nevados es lo que se veía en s9 (9,8, 21,5) aunque cada franja fuera de un
 * material. Devuelve el de cada casilla de `montana`.
 */
export function materialDeLosMacizos(
  montana: readonly number[],
  W: number,
  H: number,
  suelo: readonly Suelo[],
): Map<number, MaterialDePico> {
  const es = new Set(montana);
  const fuera = new Map<number, MaterialDePico>();
  for (const semilla of montana) {
    if (fuera.has(semilla)) continue;
    const macizo: number[] = [];
    const visto = new Set([semilla]);
    const pila = [semilla];
    while (pila.length > 0) {
      const i = pila.pop() as number;
      macizo.push(i);
      const x = i % W;
      const y = Math.floor(i / W);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const j = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !es.has(j) || visto.has(j)) continue;
          visto.add(j);
          pila.push(j);
        }
    }
    const cuenta = new Map<MaterialDePico, number>();
    for (const i of macizo) {
      const s = suelo[i];
      if (s === undefined) throw new Error(`la casilla ${i} del macizo no tiene suelo`);
      const m = materialDePico(s);
      cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
    }
    let elegido = PREFERENCIA[0] as MaterialDePico;
    for (const m of PREFERENCIA) if ((cuenta.get(m) ?? 0) > (cuenta.get(elegido) ?? 0)) elegido = m;
    for (const i of macizo) fuera.set(i, elegido);
  }
  return fuera;
}
