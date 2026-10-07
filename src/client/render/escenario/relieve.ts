/**
 * El relieve visual: un nivel de altura por casilla y las caras de roca donde el
 * terreno cae. El motor no tiene alturas; esto es solo cómo se pinta (las
 * mesetas, los barrancos y los acantilados de la referencia) y se deduce del
 * suelo y de las barreras.
 *
 * La cámara mira desde el sur: una caída hacia abajo en pantalla enseña su cara
 * de roca; una caída hacia arriba queda de espaldas y solo se ve el reborde.
 */
import { isWalkable, type Suelo, type TerrainKind } from '@core/map/terrain.js';
import type { Analisis } from './analizar.js';
import type { Caja } from './pasillo.js';

/**
 * El nivel de una región. No es un nivel por suelo —eso convertía cada frontera
 * en un escalón y el usuario lo descartó (03-10-2026)—: el relieve es variado.
 * La ciénaga va abajo; la nieve, la lava y las regiones rodeadas de montaña,
 * arriba; el resto casi todo al mismo nivel, con alguna meseta suelta. Dos
 * regiones al mismo nivel se separan por un río o un cañón, no por un escalón.
 */
export function nivelDeRegion(suelo: Suelo, montana: number, tirada: number): number {
  if (suelo === 'swamp') return 0;
  if (suelo === 'snow' || suelo === 'lava') return 2;
  if (montana > 0.2) return 2;
  if (suelo === 'rough') return tirada < 0.5 ? 2 : 1;
  return tirada < 0.15 ? 2 : 1;
}

/**
 * Cuánto mide en pantalla un nivel de altura, en casillas. A 1 la cara colgaba
 * una casilla entera y tapaba medio río de un cañón de dos de ancho.
 */
export const ALTO_DE_NIVEL = 0.6;

/** El material de la cara de roca, por el suelo de arriba. */
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

export function relieve(a: Analisis, semilla = 1): Relieve {
  const { W, H, terreno, franjaDe, franjas, fuente, region, regiones } = a;
  // Cuánta montaña rodea cada región: casillas de montaña cuyo suelo más cercano es suyo.
  const montana = new Float64Array(regiones.length);
  for (let i = 0; i < W * H; i++) {
    if (terreno[i] !== 'mountain') continue;
    const r = region[fuente[i] as number] as number;
    if (r >= 0) montana[r] = (montana[r] as number) + 1;
  }
  let s = (semilla * 2654435761) >>> 0;
  const tirada = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
  const nivelR = regiones.map((r) =>
    nivelDeRegion(r.suelo, (montana[r.id] as number) / Math.max(1, r.casillas), tirada()),
  );
  const nivel = new Int8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = region[fuente[i] as number] as number;
    nivel[i] = r >= 0 ? (nivelR[r] as number) : 1;
  }
  const base = Int8Array.from(nivel);
  // Lo más bajo y lo más alto que tiene alrededor cada franja: un río o un cañón
  // va entero a UN nivel, uno por debajo de su orilla más baja. Tomándolo casilla
  // a casilla de la orilla más cercana, medio río quedaba un nivel más alto que
  // el otro medio y el cañón salía en tres escalones.
  const bajo = franjas.map(() => 9);
  const alto = franjas.map(() => -9);
  for (let i = 0; i < W * H; i++) {
    const f = franjaDe[i] as number;
    if (f === -1) continue;
    bajo[f] = Math.min(bajo[f] as number, base[i] as number);
    alto[f] = Math.max(alto[f] as number, base[i] as number);
  }
  // Un acantilado mira también lo que pisa a su lado: una región que lo toca sin
  // ser la más cercana de ninguna de sus casillas se quedaba fuera de la cuenta,
  // y la cresta salía a ras con ella (s57 (2, 16)). Solo el acantilado: el agua
  // sigue encajada bajo su orilla de siempre.
  for (let i = 0; i < W * H; i++) {
    const f = franjaDe[i] as number;
    if (f === -1 || terreno[i] !== 'cliff') continue;
    for (const j of vecinosDe(i, W, H)) {
      if (!isWalkable(terreno[j] as TerrainKind)) continue;
      bajo[f] = Math.min(bajo[f] as number, base[j] as number);
      alto[f] = Math.max(alto[f] as number, base[j] as number);
    }
  }
  for (let i = 0; i < W * H; i++) {
    const f = franjaDe[i] as number;
    if (f === -1) continue;
    const franja = franjas[f];
    if (franja === undefined) continue;
    const t = terreno[i];
    const lo = bajo[f] as number;
    const hi = alto[f] as number;
    // El agua va encajada: un nivel por debajo de su orilla más baja. El barranco.
    if (t === 'water') nivel[i] = Math.max(-1, lo - 1);
    // Una mancha de acantilado dentro de una región es una mesa: un nivel más.
    else if (t === 'cliff' && franja.uso === 'obstaculo') nivel[i] = (base[i] as number) + 1;
    // Una montaña o un bosque entre dos niveles toma el de su lado alto (#180,
    // decisión del usuario, 07-10-2026). Con el nivel de la región más cercana
    // de cada casilla, el escalón caía por dentro de la franja, sobre el muro
    // fino de Voronoi, que es recto; así cae en su borde con el lado bajo, que
    // es el contorno de la región, con sus giros.
    else if (t === 'mountain' || t === 'forest') nivel[i] = hi;
    // Entre dos lados a distinta altura, el acantilado es una cresta de roca un
    // nivel por encima del alto; entre dos al mismo nivel, un cañón cortado hacia
    // abajo. Nunca a ras de lo que se pisa al lado: tomaba el nivel del lado alto
    // y desde allí la barrera se leía como un llano por el que se pasa (auditoría
    // 2 de 07-10, B: 35 de 66 bordes en s1, 72 de 319 en s57). Bajar con el lado
    // bajo no lo arreglaba —quedaba a ras de ese— y la zanja daba caras de 4.
    else if (t === 'cliff') nivel[i] = hi > lo ? hi + 1 : Math.max(-1, lo - 1);
  }

  // Una escalera de caídas seguidas (2 → 1 → 0 bajando por la pantalla) daba
  // una pared por peldaño, en terrazas paralelas. Se funde en una sola caída
  // más alta: el peldaño intermedio sube al nivel de arriba. El agua no sube,
  // que va siempre encajada.
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (let y = 1; y < H - 1; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (terreno[i] === 'water') continue;
        // Ni el suelo sube a ras de un acantilado de encima, ni un acantilado a
        // ras del suelo de encima: la barrera dejaría de verse (`acantiladosARas`).
        if ((terreno[i] === 'cliff') !== (terreno[i - W] === 'cliff')) continue;
        const arriba = nivel[i - W] as number;
        const aqui = nivel[i] as number;
        const abajo = nivel[i + W] as number;
        if (aqui < arriba && abajo < aqui) {
          nivel[i] = arriba;
          cambio = true;
        }
      }
  }

  // La cresta de una franja larga sube con su lado más alto, y donde la franja
  // pasa junto al agua encajada la caída llegaba a 4: la ladera, que tiene arte
  // hasta 3 y se estira, metía el pie en la casilla de enfrente y se montaba con
  // la del otro lado del río (`laderasEnfrentadas`, s10 (15, 18) y s35 (15, 26)).
  // Ahí baja a 3 sobre lo más bajo de al lado, si con eso no queda a ras.
  for (let i = 0; i < W * H; i++) {
    if (terreno[i] !== 'cliff') continue;
    const vecinos = vecinosDe(i, W, H);
    const tope = Math.min(...vecinos.map((j) => nivel[j] as number)) + 3;
    if (
      (nivel[i] as number) > tope &&
      !vecinos.some((j) => isWalkable(terreno[j] as TerrainKind) && nivel[j] === tope)
    )
      nivel[i] = tope;
  }

  // Lo poco que aún quedara a ras —una mesa que toca una región más alta que la
  // suya, una casilla junto al agua— sube un nivel por encima de lo que pisa al
  // lado: 4 casillas en las semillas 1, 2, 5, 9, 13, 24, 34 y 57.
  for (const i of acantiladosARas(terreno, nivel, W, H)) {
    let alrededor = nivel[i] as number;
    for (const j of vecinosDe(i, W, H))
      if (isWalkable(terreno[j] as TerrainKind))
        alrededor = Math.max(alrededor, nivel[j] as number);
    nivel[i] = alrededor + 1;
  }

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

/**
 * Las casillas de acantilado a ras de una casilla que se pisa a su lado (norte,
 * sur, este u oeste): ahí la barrera no tiene cara, ni ladera, ni reborde, y se
 * lee como un llano por el que se pasa (auditoría 2 de 07-10, defecto B). Lo
 * cuenta el informe (`acantiladosARas`) y tiene que ser 0.
 */
export function acantiladosARas(
  terreno: readonly TerrainKind[],
  nivel: ArrayLike<number>,
  W: number,
  H: number,
): number[] {
  const fuera: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (terreno[i] !== 'cliff') continue;
    if (
      vecinosDe(i, W, H).some((j) => isWalkable(terreno[j] as TerrainKind) && nivel[j] === nivel[i])
    )
      fuera.push(i);
  }
  return fuera;
}

/** Las casillas de al lado de `i` (norte, sur, oeste y este) que caen en el mapa. */
function vecinosDe(i: number, W: number, H: number): number[] {
  const x = i % W;
  const y = Math.floor(i / W);
  const v: number[] = [];
  if (y > 0) v.push(i - W);
  if (y < H - 1) v.push(i + W);
  if (x > 0) v.push(i - 1);
  if (x < W - 1) v.push(i + 1);
  return v;
}
