/**
 * El relieve visual: un nivel de altura por casilla y las caras de roca donde el
 * terreno cae. El motor no tiene alturas de juego, pero el mapa guarda el nivel
 * de cada región (`MapRegion.nivel`, #143), que el generador sortea antes que
 * las barreras: el acantilado solo separa dos niveles distintos y dos niveles
 * distintos solo los separa un acantilado, una montaña o el agua. Aquí se
 * aplica, sin inventar nada.
 *
 * La cámara mira desde el sur: una caída hacia abajo en pantalla enseña su cara
 * de roca; una caída hacia arriba queda de espaldas y solo se ve el reborde.
 */
import { nivelesDelRelieve } from '@core/map/regiones.js';
import { isWalkable, type Suelo, type TerrainKind } from '@core/map/terrain.js';
import type { Analisis } from './analizar.js';
import type { Caja } from './pasillo.js';

/**
 * Cuánto mide en pantalla un nivel de altura, en casillas. A 1 la cara colgaba
 * una casilla entera y tapaba medio río de un cañón de dos de ancho.
 */
export const ALTO_DE_NIVEL = 0.6;

/**
 * El material de la cara de roca, por el suelo de arriba: el de la meseta
 * (`sueloDeLaMeseta`, #216), no el más cercano de la casilla de barrera, que
 * suele ser el del lado bajo.
 */
export const CARA_DE_SUELO: Readonly<Record<Suelo, string>> = {
  swamp: 'cara-roca',
  grass: 'cara-roca',
  dirt: 'cara-roca',
  rough: 'cara-roca',
  sand: 'cara-arenisca',
  snow: 'cara-nevada',
  lava: 'cara-basalto',
};

/**
 * El nivel de altura de cada casilla. Las paredes que salen de él las da el
 * relieve por celdas (`celdas.ts`, R4): una por vértice y umbral, de junta a junta.
 */
export interface Relieve {
  readonly nivel: Int8Array;
}

/**
 * El nivel de cada casilla, de los niveles de las regiones del mapa (#143):
 *
 * - **lo que se pisa**, al de su región: una región es una meseta entera, sin
 *   escalones por dentro;
 * - **un nodo**, al de sus regiones; entre dos niveles, el paso sin camino va
 *   al alto, como la barrera que corta —un hueco en el borde de la meseta— y
 *   su rampa baja de él al lado bajo (`tramosDeLasRampas`). Al bajo era un pozo
 *   de una casilla con paredes a los lados y la rampa encajonada entre ellas,
 *   con la tablilla delante (s443 (25,10)). El nodo con camino y la ciudad, al
 *   bajo: su bajada la lleva el camino y la tapa el hito o la pieza de la
 *   ciudad; al alto, las rampas de camino caían sobre lo alto del acantilado y
 *   lo dejaban sin roca (`acantiladosLisos` 2 → 3 en 1-40);
 * - **una casilla de barrera**, al nivel más alto de las dos regiones que
 *   separa ahí: es el borde de la meseta, y la cara cae a su pie del lado bajo.
 *   El acantilado, cubierto de roca (`cimaDeRoca`);
 * - **el agua**, plana: cada franja a ras de la más baja de las regiones que
 *   toca, sin encajar (#210);
 * - y nada de una casilla de ancho por encima de sus dos lados: la barrera o el
 *   nodo que lo estaría baja a lo más alto de ellos (#210).
 *
 * La regla es del núcleo (`nivelesDelRelieve`), porque el generador la mira al
 * quitar las espigas de lo que se pisa (`quitarEspigas`, `vestir.ts`); aquí se
 * le pasa el terreno de la escena (un puente es agua) y qué nodos van al bajo.
 *
 * Antes el nivel se inventaba aquí, del suelo y de una tirada, después de que el
 * generador sorteara las barreras sin verlo, y se remendaba: crestas por encima
 * de las dos orillas, cañones entre dos llanos, mesas de una casilla, escaleras
 * que subían lo que se pisa y charcas hundidas en el llano (crítica de
 * `docs/agents/2026-10-08-desniveles/`). Ya no hace falta ninguno.
 */
export function relieve(a: Analisis): Relieve {
  const { W, H, terreno, red, niveles } = a;
  const nodos = red.nodos
    .filter((n) => isWalkable(terreno[n.at.y * W + n.at.x] as TerrainKind))
    .map((n) => ({
      casilla: n.at.y * W + n.at.x,
      regiones: n.regiones,
      alBajo: n.ciudad || a.conCamino.has(n.id),
    }));
  const nivel = nivelesDelRelieve(W, H, terreno, red.regionDe, niveles, nodos);
  return { nivel };
}

/**
 * Lo que el pie de una ladera se aparta de su filo, en casillas, por caída: en
 * la proyección del mapa una pared que mira al este no se vería, y cae en
 * talud. Es el contrato de junta de las guías del arte (`tools/taller/laderas.ts`,
 * §20, y las juntas E y O de las celdas, `celdas.ts`), que lo leen de aquí. Una
 * caída de más de 3 lleva el de 3.
 */
export const TALUD_DE_LADERA: Readonly<Record<1 | 2 | 3, number>> = { 1: 0.45, 2: 0.65, 3: 0.85 };

/** Las laderas no tienen arte de más de 3 niveles: una caída mayor usa la hoja de 3. */
export const caidaDeLadera = (caida: number): 1 | 2 | 3 => (caida >= 3 ? 3 : caida <= 1 ? 1 : 2);

/** Una caída al sur: la cara cuelga del borde de abajo de la fila `y`, de `x0` a `x1 + 1`. */
export interface Cara {
  /** La fila de la casilla alta; la cara cuelga de su borde de abajo. */
  readonly y: number;
  /**
   * De dónde a dónde corre: la cara va de `x0` a `x1 + 1`. Por celdas, de junta
   * a junta, en medias casillas (`caidas`, en `celdas.ts`).
   */
  readonly x0: number;
  readonly x1: number;
  /** Cuántos niveles cae. */
  readonly caida: number;
  readonly material: string;
}

/**
 * Una caída al este o al oeste en una columna, de norte a sur (#156): la lleva
 * una cadena de laderas. Por celdas va de junta a junta, corrida media fila
 * (`y0` y `y1` en medias casillas, `caidas`).
 */
export interface Ladera {
  /** La columna de las casillas altas: la pared cuelga de su borde este u oeste. */
  readonly x: number;
  /** De qué fila a qué fila (incluidas) corre: la cadena va de `y0` a `y1 + 1`. */
  readonly y0: number;
  readonly y1: number;
  /** Hacia dónde cae: la cara mira hacia ahí. */
  readonly lado: 'este' | 'oeste';
  readonly caida: number;
  readonly material: string;
}

/** Una cara como la lleva la escena: con lo que se pinta de ella. */
export interface CaraDeEscena extends Cara {
  /**
   * Lo que se pinta de la cara (#159), columna a columna cada `PASO_DE_CARA`
   * de `x0` a `x1 + 1` (`columnasDeCara`): de dónde a dónde en y, o `null` si
   * no se pinta. Va de lo alto de la silueta de las paredes que la tapan a su
   * pie (`pintadaDeCara`): donde no hay pared, se ve el suelo de abajo.
   */
  readonly pintada: readonly (readonly [number, number] | null)[];
}

/** El filo de una ladera, en x: el borde este u oeste de su columna alta. */
export const bordeDeLadera = (l: Ladera): number => (l.lado === 'este' ? l.x + 1 : l.x);

/**
 * El pie de la ladera `l` bajo su fila `fila`, en casillas: a lo que se aparta
 * su talud del filo y `caida` niveles bajo el borde de abajo de la fila. Ahí
 * acaba la junta sur del módulo que cubre esa fila; lo leen quien la coloca
 * (`colocarLadera`) y quien mide que está en su sitio.
 */
export function pieDeLadera(l: Ladera, fila: number): readonly [number, number] {
  const talud = TALUD_DE_LADERA[caidaDeLadera(l.caida)];
  return [
    bordeDeLadera(l) + (l.lado === 'este' ? talud : -talud),
    fila + 1 + l.caida * ALTO_DE_NIVEL,
  ];
}

/** La banda que pinta una cara, en casillas: de su filo, `y + 1`, a su pie, `caida` niveles más abajo. */
export function bandaDeCara(c: Cara): Caja {
  return [c.x0, c.y + 1, c.x1 + 1, c.y + 1 + c.caida * ALTO_DE_NIVEL];
}

/** Si el nodo `n` de la red une regiones a distinto nivel: es una rampa. */
export const nodoEntreNiveles = (
  a: Pick<Analisis, 'niveles'>,
  regiones: readonly number[],
): boolean => new Set(regiones.map((r) => a.niveles[r])).size > 1;

/**
 * Casillas que se pisan (sin nodos) a otro nivel que el de su región
 * (`nivelFueraDeSuRegion`, #143): la escalera de antes subía 50 en 1-40. Lo
 * cuenta el informe y tiene que ser 0.
 */
export function nivelFueraDeSuRegion(a: Analisis, nivel: ArrayLike<number>): number {
  let fuera = 0;
  for (let i = 0; i < a.W * a.H; i++) {
    const r = a.red.regionDe[i] as number;
    if (r >= 0 && isWalkable(a.terreno[i] as TerrainKind) && nivel[i] !== a.niveles[r]) fuera++;
  }
  return fuera;
}

/**
 * Parejas de casillas vecinas (norte-sur, este-oeste) que se pisan a distinto
 * nivel sin una barrera en medio y sin ser un nodo entre dos niveles, que es la
 * rampa (`desnivelesSinBarrera`, #143): un escalón en el llano que no explica
 * nada. Eran 40 en 1-40, más 205 junto a un nodo. Lo cuenta el informe y tiene
 * que ser 0.
 */
export function desnivelesSinBarrera(a: Analisis, nivel: ArrayLike<number>): number {
  const { W, H, terreno, red } = a;
  const rampa = new Uint8Array(W * H);
  for (const n of red.nodos) if (nodoEntreNiveles(a, n.regiones)) rampa[n.at.y * W + n.at.x] = 1;
  let fuera = 0;
  for (let i = 0; i < W * H; i++) {
    if (!isWalkable(terreno[i] as TerrainKind)) continue;
    for (const j of [i % W < W - 1 ? i + 1 : -1, i + W < W * H ? i + W : -1]) {
      if (j < 0 || !isWalkable(terreno[j] as TerrainKind) || nivel[i] === nivel[j]) continue;
      if (rampa[i] === 0 && rampa[j] === 0) fuera++;
    }
  }
  return fuera;
}
