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
import { type Caja, tramoEnCaja } from './pasillo.js';
import { SEMIANCHO_DEL_PASILLO, SEMIANCHO_DEL_PASILLO_DE_MASA, type Senda } from './sendas.js';

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

export interface Cara {
  /** La fila de la casilla alta; la cara cuelga de su borde de abajo. */
  readonly y: number;
  /** De qué columna a qué columna (incluidas) corre la cara. */
  readonly x0: number;
  readonly x1: number;
  /** Cuántos niveles cae. */
  readonly caida: number;
  readonly material: string;
}

/**
 * Una caída al este o al oeste en una columna, de norte a sur (#156): los
 * cantos seguidos con la misma caída y el mismo material, cortados como las
 * caras. La lleva una cadena de laderas.
 */
export interface Ladera {
  /** La columna de las casillas altas: la pared cuelga de su borde este u oeste. */
  readonly x: number;
  /** De qué fila a qué fila (incluidas) corre. */
  readonly y0: number;
  readonly y1: number;
  /** Hacia dónde cae: la cara mira hacia ahí. */
  readonly lado: 'este' | 'oeste';
  readonly caida: number;
  readonly material: string;
}

export interface Relieve {
  readonly nivel: Int8Array;
  /** Caídas hacia el sur: se ve la cara. */
  readonly caras: readonly Cara[];
  /**
   * Las casillas de las caídas al este o al oeste, una a una, como
   * `[x, y, lado]` (`cantosDe`): las de las `laderas` y las de los barrancos
   * que se quitan de ellas. La franja difuminada que pinta el pintor bajo la
   * ladera, y los peñascos donde no quedó ladera.
   */
  readonly cantos: readonly (readonly [number, number, 'este' | 'oeste'])[];
  /**
   * Las caídas al este o al oeste en cadenas de norte a sur: lo que lleva la
   * ladera. Sin las filas de un barranco de una casilla (`sinBarrancos`), que sí
   * están en `cantos`.
   */
  readonly laderas: readonly Ladera[];
  /** Caídas hacia el norte (de espaldas): solo el reborde, como `[x, y]` de la casilla alta. */
  readonly rebordes: readonly (readonly [number, number])[];
}

export function relieve(a: Analisis, semilla = 1): Relieve {
  const { W, H, terreno, suelo, franjaDe, franjas, fuente, region, regiones } = a;
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

  return { nivel, ...caidas(nivel, W, H, suelo) };
}

/**
 * Las caídas de un relieve ya hecho: las caras, los cantos, los rebordes y las
 * laderas. Separado del nivel para que un test lo mida sobre una rejilla a mano.
 */
export function caidas(
  nivel: ArrayLike<number>,
  W: number,
  H: number,
  suelo: readonly Suelo[],
): Omit<Relieve, 'nivel'> {
  const caras: Cara[] = [];
  const rebordes: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    let tramo: { x0: number; caida: number; material: string } | null = null;
    const cerrar = (x: number) => {
      if (tramo !== null)
        caras.push({ y, x0: tramo.x0, x1: x - 1, caida: tramo.caida, material: tramo.material });
      tramo = null;
    };
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const aqui = nivel[i] as number;
      const abajo = y + 1 < H ? (nivel[i + W] as number) : aqui;
      const caida = aqui - abajo;
      if (caida > 0) {
        const material = CARA_DE_SUELO[suelo[i] as Suelo];
        const t = tramo as { x0: number; caida: number; material: string } | null;
        if (t === null || t.caida !== caida || t.material !== material) {
          cerrar(x);
          tramo = { x0: x, caida, material };
        }
      } else cerrar(x);
      if (y > 0 && aqui > (nivel[i - W] as number)) rebordes.push([x, y]);
    }
    cerrar(W);
  }
  const todas = laderasDe(nivel, W, H, suelo);
  // Los cantos, de todas: el del barranco lleva sus peñascos, como antes de
  // las laderas.
  return { caras, cantos: cantosDe(todas), rebordes, laderas: sinBarrancos(todas) };
}

/**
 * Las laderas sin las filas de un barranco de una casilla: una casilla baja
 * entre dos altas, en la misma fila. Ahí la ladera este de la de su oeste y la
 * oeste de la de su este bajan las dos hasta ella, sus pies caen en la misma
 * casilla y se montan: el agua o el suelo del fondo desaparecía bajo una espina
 * de roca doble, y lo bajo se leía como lo alto (QA de #156, H1: 212 casillas
 * en las semillas 1-40, 136 de agua). No va ninguna de las dos, y el canto
 * queda como antes de las laderas, con sus peñascos si caben. La cadena se
 * parte por esa fila.
 */
function sinBarrancos(laderas: readonly Ladera[]): Ladera[] {
  /** Las filas de cada casilla baja a la que cae una ladera, por lado, como `x,y`. */
  const alPie = { este: new Set<string>(), oeste: new Set<string>() };
  for (const l of laderas)
    for (let y = l.y0; y <= l.y1; y++)
      alPie[l.lado].add(`${l.lado === 'este' ? l.x + 1 : l.x - 1},${y}`);
  const fuera: Ladera[] = [];
  for (const l of laderas) {
    const opuesto = alPie[l.lado === 'este' ? 'oeste' : 'este'];
    const bajo = l.lado === 'este' ? l.x + 1 : l.x - 1;
    let y0: number | null = null;
    for (let y = l.y0; y <= l.y1 + 1; y++) {
      const sigue = y <= l.y1 && !opuesto.has(`${bajo},${y}`);
      if (sigue && y0 === null) y0 = y;
      if (!sigue && y0 !== null) {
        fuera.push(y0 === l.y0 && y - 1 === l.y1 ? l : { ...l, y0, y1: y - 1 });
        y0 = null;
      }
    }
  }
  return fuera;
}

/**
 * Las casillas de las laderas, una a una: los cantos. Salen de ellas y no de
 * otro recorrido, que con su propia condición podía dejar de casar con las
 * laderas (`componer` pone peñascos en el canto que no lleva ladera, y volvían
 * bajo las laderas sin que nada avisara). En el orden de la rejilla, fila a
 * fila y el este antes que el oeste: el azar de los peñascos va en ese orden.
 */
function cantosDe(laderas: readonly Ladera[]): [number, number, 'este' | 'oeste'][] {
  return laderas
    .flatMap((l) =>
      Array.from({ length: l.y1 - l.y0 + 1 }, (_, k): [number, number, 'este' | 'oeste'] => [
        l.x,
        l.y0 + k,
        l.lado,
      ]),
    )
    .sort((p, q) => p[1] - q[1] || p[0] - q[0] || (p[2] === q[2] ? 0 : p[2] === 'este' ? -1 : 1));
}

/** Las cadenas de cantos de norte a sur, cortadas donde cambia la caída o el material. */
function laderasDe(
  nivel: ArrayLike<number>,
  W: number,
  H: number,
  suelo: readonly Suelo[],
): Ladera[] {
  const fuera: Ladera[] = [];
  for (const lado of ['este', 'oeste'] as const) {
    const dx = lado === 'este' ? 1 : -1;
    for (let x = 0; x < W; x++) {
      if (x + dx < 0 || x + dx >= W) continue;
      let tramo: { y0: number; caida: number; material: string } | null = null;
      const cerrar = (y: number) => {
        if (tramo !== null) fuera.push({ x, y1: y - 1, lado, ...tramo });
        tramo = null;
      };
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        const caida = (nivel[i] as number) - (nivel[i + dx] as number);
        if (caida <= 0) {
          cerrar(y);
          continue;
        }
        const material = CARA_DE_SUELO[suelo[i] as Suelo];
        const t = tramo as { y0: number; caida: number; material: string } | null;
        if (t === null || t.caida !== caida || t.material !== material) {
          cerrar(y);
          tramo = { y0: y, caida, material };
        }
      }
      cerrar(H);
    }
  }
  return fuera;
}

/**
 * Lo que el pie de una ladera se aparta de su filo, en casillas, por caída: en
 * la proyección del mapa una pared que mira al este no se vería, y cae en
 * talud. Es el contrato de junta de las guías del arte (`tools/taller/laderas.ts`,
 * §20), que lo leen de aquí. Una caída de más de 3 lleva el de 3.
 */
export const TALUD_DE_LADERA: Readonly<Record<1 | 2 | 3, number>> = { 1: 0.45, 2: 0.65, 3: 0.85 };

/** Las laderas no tienen arte de más de 3 niveles: una caída mayor usa la hoja de 3. */
export const caidaDeLadera = (caida: number): 1 | 2 | 3 => (caida >= 3 ? 3 : caida <= 1 ? 1 : 2);

/**
 * Lo que corre hacia la meseta la pared frontal de una esquina de ladera, en
 * casillas, desde el borde de la casilla: lo dibuja así la guía (§20), y la
 * frontal de la cara para ahí.
 */
export const FRONTAL_DE_ESQUINA = 0.85;

/** El filo de una ladera, en x: el borde este u oeste de su columna alta. */
export const bordeDeLadera = (l: Ladera): number => (l.lado === 'este' ? l.x + 1 : l.x);

/**
 * El pie de la ladera `l` bajo su fila `fila`, en casillas: a lo que se aparta
 * su talud del filo y `caida` niveles bajo el borde de abajo de la fila. Ahí
 * acaba la junta sur del módulo que cubre esa fila; lo leen la banda de la
 * ladera, quien la coloca (`colocarLadera`) y quien mide que está en su sitio.
 */
export function pieDeLadera(l: Ladera, fila: number): readonly [number, number] {
  const talud = TALUD_DE_LADERA[caidaDeLadera(l.caida)];
  return [
    bordeDeLadera(l) + (l.lado === 'este' ? talud : -talud),
    fila + 1 + l.caida * ALTO_DE_NIVEL,
  ];
}

/**
 * La banda que ocupa una ladera, en casillas: del filo a lo que se aparta su
 * talud, y de su primera fila al pie de la última.
 */
export function bandaDeLadera(l: Ladera): Caja {
  const borde = bordeDeLadera(l);
  const [x, pie] = pieDeLadera(l, l.y1);
  return [Math.min(borde, x), l.y0, Math.max(borde, x), pie];
}

/** Las laderas que empalman en esquina con una cara, por su extremo (#156). */
export interface EsquinasDeCara {
  /** La que cae al oeste desde su primera columna. */
  readonly oeste: Ladera | undefined;
  /** La que cae al este desde su última columna. */
  readonly este: Ladera | undefined;
}

/**
 * Las esquinas del relieve, por índice de cara: una ladera cuya última casilla
 * es el extremo de una cara al sur con la misma caída y el mismo material. Ahí
 * va la pieza de esquina, la frontal que gira y sube hacia el fondo, y la cara
 * deja de poner pared frontal donde la pone la esquina. Con otra caída no hay
 * esquina: la de una caída no empalma con una cara de otra.
 *
 * Una cara de una sola casilla con ladera a los dos lados lleva una sola, la
 * del este: dos esquinas en la misma casilla se pisan la frontal.
 *
 * Es el único sitio donde se decide: lo leen la pasada de las laderas y la de
 * las caras.
 */
export function esquinas(caras: readonly Cara[], laderas: readonly Ladera[]): EsquinasDeCara[] {
  const clave = (x: number, y: number, lado: string, caida: number, material: string) =>
    `${x},${y},${lado},${caida},${material}`;
  const extremos = new Map<string, number>();
  for (const [k, c] of caras.entries()) {
    extremos.set(clave(c.x0, c.y, 'oeste', c.caida, c.material), k);
    extremos.set(clave(c.x1, c.y, 'este', c.caida, c.material), k);
  }
  const fuera: { oeste: Ladera | undefined; este: Ladera | undefined }[] = caras.map(() => ({
    oeste: undefined,
    este: undefined,
  }));
  for (const l of laderas) {
    const k = extremos.get(clave(l.x, l.y1, l.lado, l.caida, l.material));
    const e = k === undefined ? undefined : fuera[k];
    if (e !== undefined) e[l.lado] = l;
  }
  for (const [k, e] of fuera.entries()) {
    const c = caras[k] as Cara;
    if (c.x0 === c.x1 && e.este !== undefined) e.oeste = undefined;
  }
  return fuera;
}

/** La banda que pinta una cara, en casillas: de su filo, `y + 1`, a su pie, `caida` niveles más abajo. */
export function bandaDeCara(c: Cara): Caja {
  return [c.x0, c.y + 1, c.x1 + 1, c.y + 1 + c.caida * ALTO_DE_NIVEL];
}

/** Dónde se apoya la pared de una cara: su pie, que en una escalera se inclina hacia la de al lado. */
export interface PieDeCara {
  /** El pie recto, el borde de abajo de su banda. */
  readonly pie: number;
  /** La cara de la fila de al lado que sigue justo donde esta acaba, si la hay. */
  readonly izquierda: Cara | undefined;
  readonly derecha: Cara | undefined;
  /** El pie a la altura de `x`. */
  readonly en: (x: number) => number;
}

/**
 * El pie de `c` entre todas las `caras`. Una frontera en diagonal da caras en
 * escalera, una por fila: si la cara de la fila de al lado sigue justo donde
 * esta acaba, el pie se inclina hacia ella en la última casilla y la escalera se
 * lee como ladera. Lo leen quien pone la pared y quien mide que no se salga de
 * él (`paredesFueraDelPie`): una pared corrida que conservaba el pie de su sitio
 * acababa de pie en el río, una casilla bajo su acantilado (#150, N1).
 */
export function pieDeCara(c: Cara, caras: readonly Cara[]): PieDeCara {
  const pieDe = (o: Cara) => o.y + 1 + o.caida * ALTO_DE_NIVEL;
  const pie = pieDe(c);
  const sigue = (x: number) =>
    caras.find(
      (o) => Math.abs(o.y - c.y) === 1 && o.x0 <= x && x <= o.x1 && o.material === c.material,
    );
  const derecha = sigue(c.x1 + 1);
  const izquierda = sigue(c.x0 - 1);
  return {
    pie,
    izquierda,
    derecha,
    // Hacia el pie de la de al lado, no una fila por casilla: con otra caída
    // (una escalera de 2 que sigue por una de 1) bajaba 0,4 de más por casilla,
    // y la frontal que seguía por la escalera acababa en el pie de la cara de
    // debajo, montada sobre su esquina (s7 x5 y18, al quitar los barrancos).
    en: (x) => {
      if (derecha !== undefined && x > c.x1) return pie + (pieDe(derecha) - pie) * (x - c.x1);
      if (izquierda !== undefined && x < c.x0 + 1)
        return pie + (pieDe(izquierda) - pie) * (c.x0 + 1 - x);
      return pie;
    },
  };
}

/**
 * Cómo acaba la pared frontal de una cara por un extremo:
 *
 * - `esquina`: en la suya, que trae su propia frontal;
 * - `esquina-vecina`: la cara de la fila de al lado sigue donde esta acaba
 *   (`pieDeCara`), pero empieza en su esquina, que ya sube hasta aquí: seguir
 *   la ponía encima (una escalera de esquinas);
 * - `sigue`: la cara de al lado sigue, y la frontal sigue por ella;
 * - `suelto`: no sigue nada.
 */
export type Tope = 'esquina' | 'esquina-vecina' | 'sigue' | 'suelto';

/**
 * Los dos topes de la cara `k` (`Tope`), con las esquinas que de verdad entraron
 * (`puestas`, por índice de cara: una esquina que no cabe no para nada).
 */
export function topesDeCara(
  k: number,
  caras: readonly Cara[],
  puestas: readonly { readonly oeste: boolean; readonly este: boolean }[],
): { readonly oeste: Tope; readonly este: Tope } {
  const { izquierda, derecha } = pieDeCara(caras[k] as Cara, caras);
  const tope = (propia: boolean, vecina: Cara | undefined, suExtremo: 'oeste' | 'este'): Tope =>
    propia
      ? 'esquina'
      : vecina === undefined
        ? 'suelto'
        : puestas[caras.indexOf(vecina)]?.[suExtremo] === true
          ? 'esquina-vecina'
          : 'sigue';
  const p = puestas[k];
  return {
    oeste: tope(p?.oeste === true, izquierda, 'este'),
    este: tope(p?.este === true, derecha, 'oeste'),
  };
}

/**
 * Por dónde baja una senda por una cara: el tajo que no pinta la cara
 * (`pintarSuelo`) y cuyos bordes remata la pared (`componer`). Se deriva aquí
 * una sola vez.
 */
export interface Rampa {
  /** El tajo, en x: lo que no se pinta de la cara, y se ve el suelo con su senda. */
  readonly a: number;
  readonly b: number;
  /**
   * Si el borde izquierdo y el derecho del tajo caen dentro de la cara. Uno que
   * es el extremo de la cara se corta recto y pasado; uno de dentro, inclinado.
   */
  readonly dentro: readonly [boolean, boolean];
  /** Los trozos de senda que caen en la banda de la cara dentro del tajo. */
  readonly trazos: readonly Senda[];
}

/** Una cara con las rampas que la cruzan. */
export interface CaraConRampas extends Cara {
  readonly rampas: readonly Rampa[];
}

/** Una cara como la lleva la escena: con sus rampas y lo que se pinta de ella. */
export interface CaraDeEscena extends CaraConRampas {
  /**
   * Lo que se pinta de la cara (#159), columna a columna cada `PASO_DE_CARA`
   * de `x0` a `x1 + 1` (`columnasDeCara`): de dónde a dónde en y, o `null` si
   * no se pinta. Va de lo alto de la silueta de las paredes que la tapan a su
   * pie (`pintadaDeCara`): donde no hay pared, se ve el suelo de abajo.
   */
  readonly pintada: readonly (readonly [number, number] | null)[];
}

/** Lo que se abre el tajo a cada lado de lo que la senda ocupa en la cara: la senda más su arcén, ni más. */
export const HOLGURA_DE_RAMPA = SEMIANCHO_DEL_PASILLO;

/**
 * Lo que la pared puede montar sobre el borde del tajo: se aparta de la senda
 * con el pasillo de las masas (`SEMIANCHO_DE_PARED`), más estrecho que el tajo.
 * Sin él se vería una tira de cara lisa entre la pared y el tajo.
 */
export const SOLAPE = HOLGURA_DE_RAMPA - SEMIANCHO_DEL_PASILLO_DE_MASA;

/** Lo que la pared y su remate se apartan de la senda que baja (`Bajadas.junto`). */
export const SEMIANCHO_DE_PARED = SEMIANCHO_DEL_PASILLO_DE_MASA;

/**
 * Dos tajos de una cara más juntos que esto se funden: la cara que quedaría
 * entre ellos es una tira lisa en la que no cabe pared.
 */
const RESTO_MINIMO = 0.5;

/**
 * Lo que tiene que correr una senda por una cara, en casillas, para abrirle un
 * tajo. Una que solo roza la esquina (de 45 de 110 rampas, medidas en las
 * semillas 1-10, con 0,00-0,25) abría una ranura de cara a cara que se leía
 * como un hueco recortado; esa no abre nada, y la pared se le aparta como a
 * cualquier otra que baja.
 */
export const RAMPA_MINIMA = 0.25;

/**
 * Hasta dónde, alrededor de lo que baja por las caras, la pared se aparta de la
 * senda, en casillas. La senda de una escalera en diagonal sale de la banda de
 * su cara y pasa junto a la de al lado, por encima de su filo o por su pie; y
 * la pared de esa otra cara, que asoma 0,35-0,55 sobre el filo, la tapaba.
 */
export const ENTORNO_DE_RAMPA = 1.5;

/**
 * El entorno de lo que baja por una ladera, en casillas: menos que el de una
 * cara. La ladera es estrecha (su talud, de 0,45 a 0,85) y no abre tajo; con
 * `ENTORNO_DE_RAMPA` cada senda que bajaba por un canto quitaba también las
 * laderas y las frontales de casilla y media alrededor. Medido en las semillas
 * 1-40 (07-10-2026): con 1,5, 3 563 casillas de canto con ladera; con 0,5,
 * 3 731, y los cuatro guardias a 0 con los dos.
 */
export const ENTORNO_DE_LADERA = 0.5;

/** Lo que se tolera al comparar puntos recortados, en casillas. */
const EPS = 1e-6;

/** La caja de cada tramo de una senda, `[x0, y0, x1, y1]` seguidas: lo que mira `trozosEnCaja` antes de recortar. */
function cajasDeTramos(s: Senda): Float64Array {
  const c = new Float64Array(Math.max(0, s.length - 1) * 4);
  for (let i = 0; i + 1 < s.length; i++) {
    const [ax, ay] = s[i] as readonly [number, number];
    const [bx, by] = s[i + 1] as readonly [number, number];
    c[i * 4] = Math.min(ax, bx);
    c[i * 4 + 1] = Math.min(ay, by);
    c[i * 4 + 2] = Math.max(ax, bx);
    c[i * 4 + 3] = Math.max(ay, by);
  }
  return c;
}

/**
 * Los trozos de `s` que caen en la caja: uno nuevo cada vez que sale y vuelve a
 * entrar. Con las cajas de sus tramos (`cajasDeTramos`) se salta sin recortar
 * el que no toca la caja ni por su caja.
 */
function trozosEnCaja(
  s: Senda,
  [x0, y0, x1, y1]: Caja,
  cajas?: Float64Array,
): [number, number][][] {
  const fuera: [number, number][][] = [];
  let actual: [number, number][] | undefined;
  const t: [number, number] = [0, 0];
  for (let i = 0; i + 1 < s.length; i++) {
    if (
      cajas !== undefined &&
      ((cajas[i * 4] as number) > x1 ||
        (cajas[i * 4 + 1] as number) > y1 ||
        (cajas[i * 4 + 2] as number) < x0 ||
        (cajas[i * 4 + 3] as number) < y0)
    ) {
      actual = undefined;
      continue;
    }
    const [ax, ay] = s[i] as readonly [number, number];
    const [bx, by] = s[i + 1] as readonly [number, number];
    if (!tramoEnCaja(ax, ay, bx, by, x0, y0, x1, y1, t)) {
      actual = undefined;
      continue;
    }
    const p: [number, number] = [ax + t[0] * (bx - ax), ay + t[0] * (by - ay)];
    const q: [number, number] = [ax + t[1] * (bx - ax), ay + t[1] * (by - ay)];
    const ultimo = actual?.at(-1);
    // Un tramo que no empieza donde acabó el anterior (sale y vuelve a entrar
    // por una esquina) abre otro trozo.
    if (ultimo === undefined || Math.abs(ultimo[0] - p[0]) + Math.abs(ultimo[1] - p[1]) > EPS) {
      actual = [p];
      fuera.push(actual);
    }
    actual?.push(q);
  }
  return fuera;
}

/** La caja de unos puntos. */
function cajaDe(ps: readonly (readonly [number, number])[]): Caja {
  const xs = ps.map(([x]) => x);
  const ys = ps.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Lo que mide una senda, en casillas. */
function largo(s: Senda): number {
  let l = 0;
  for (let i = 0; i + 1 < s.length; i++) {
    const [ax, ay] = s[i] as readonly [number, number];
    const [bx, by] = s[i + 1] as readonly [number, number];
    l += Math.hypot(bx - ax, by - ay);
  }
  return l;
}

/** Lo que baja por las caras: las rampas que abren tajo y la senda que la pared no pisa. */
export interface Bajadas {
  /** Las rampas de cada cara, por su índice en `caras`. */
  readonly porCara: readonly (readonly Rampa[])[];
  /**
   * La senda que baja por alguna cara —abra tajo o solo roce una esquina— y
   * toda la que pasa a menos de `ENTORNO_DE_RAMPA` de lo que baja. Ninguna
   * pared, de esa cara o de otra, la pisa (`SEMIANCHO_DE_PARED`): se encoge o
   * se quita.
   */
  readonly junto: readonly Senda[];
  /**
   * La senda que baja por una ladera y la que pasa a menos de
   * `ENTORNO_DE_LADERA` de ella. Solo la apartan las laderas, que tampoco
   * pisan `junto`. La frontal de una cara no: al pie de una cara ajena, la
   * senda que acaba de bajar por un canto le quitaba la pared y la dejaba lisa,
   * con sus bordes rectos (QA de #156, H2: s19 x27 y5).
   */
  readonly juntoDeLadera: readonly Senda[];
}

/**
 * Las rampas de cada cara por las que pasan unas sendas, y la senda junto a
 * ellas.
 *
 * Cada senda se recorta contra la banda de cada cara (`bandaDeCara`). Los trozos
 * de una misma senda que se tocan —pasa de una cara a la de al lado sin salir
 * de las bandas, como en un acantilado en escalera— forman una cadena, y la
 * cadena baja si alguno toca el filo: la senda viene de arriba. La que solo
 * corre por el pie no baja y no abre nada. Lo que baja por una ladera
 * (`bandaDeLadera`, con su filo al lado alto) no abre tajo: cuenta para
 * `juntoDeLadera`.
 *
 * El tajo de cada trozo es lo que ocupa en x más `HOLGURA_DE_RAMPA` por lado,
 * dentro de la cara. Solo llega a un extremo si la senda sale por él o pasa
 * más cerca que la holgura: el resto de la cara conserva su pared, y un peldaño
 * de una casilla no se queda pelado. Lo que corre menos de `RAMPA_MINIMA` por
 * su cara no abre tajo.
 *
 * `cortes` abren tajo como una senda y no son senda: la línea de cada puente,
 * de estribo a estribo (#157). Van en un bucle aparte, después de las sendas,
 * y no entran en `junto` ni hacen entorno: la pared se aparta de un tablero
 * solo si lo tapa (`altoLibreAnteLosPuentes`, en `colocar.ts`), y
 * apartada también de la línea en el suelo, la cara de detrás del puente se
 * quedaba sin pared y se leía como un rectángulo de roca lisa.
 */
export function rampas(
  caras: readonly Cara[],
  laderas: readonly Ladera[],
  sendas: readonly Senda[],
  cortes: readonly Senda[] = [],
): Bajadas {
  const bandas = caras.map(bandaDeCara);
  const porCara: Senda[][] = caras.map(() => []);
  /** Alrededor de cada cadena que baja por las caras, hasta `ENTORNO_DE_RAMPA`. */
  const entornos: Caja[] = [];
  /** Alrededor de cada trozo que baja por una ladera, hasta `ENTORNO_DE_LADERA`. */
  const entornosDeLadera: Caja[] = [];
  // Casi todas las sendas quedan lejos de casi todas las caras y laderas, y
  // cruzan una por unos pocos de sus tramos: se descartan por su caja antes de
  // recortarlos. Con las laderas, recortar cada senda entera por cada una que
  // tocaba su caja costaba 0,8 ms por mapa (07-10-2026).
  const cajas = sendas.map(cajaDe);
  const tramos = sendas.map(cajasDeTramos);
  /**
   * Los trozos de la línea `s` por las bandas de las caras y las cadenas que
   * bajan; cada trozo de una cadena que baja va a la rampa de su cara.
   */
  const bajarPorLasCaras = (s: Senda, caja: Caja, deTramos: Float64Array) => {
    const [sx0, sy0, sx1, sy1] = caja;
    const trozos = bandas.flatMap((banda, cara) => {
      const [x0, y0, x1, y1] = banda;
      if (sx0 > x1 || sx1 < x0 || sy0 > y1 || sy1 < y0) return [];
      return trozosEnCaja(s, banda, deTramos).map((puntos) => ({ cara, puntos }));
    });
    // Las cadenas: trozos de esta senda con un extremo común.
    const raiz = trozos.map((_, i) => i);
    const buscar = (i: number): number => {
      let r = i;
      while (raiz[r] !== r) r = raiz[r] as number;
      raiz[i] = r;
      return r;
    };
    const toca = (p: readonly [number, number], q: readonly [number, number]) =>
      Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
    const extremos = trozos.map(({ puntos }) => [puntos[0], puntos.at(-1)] as [number, number][]);
    for (let i = 0; i < trozos.length; i++)
      for (let j = i + 1; j < trozos.length; j++)
        if ((extremos[i] as [number, number][]).some((p) => extremos[j]?.some((q) => toca(p, q))))
          raiz[buscar(i)] = buscar(j);
    const bajan = new Set(
      trozos.flatMap(({ cara, puntos }, i) =>
        puntos.some(([, y]) => y <= (bandas[cara] as Caja)[1] + EPS) ? [buscar(i)] : [],
      ),
    );
    trozos.forEach(({ cara, puntos }, i) => {
      if (bajan.has(buscar(i))) porCara[cara]?.push(puntos);
    });
    return { trozos, bajan, buscar };
  };
  for (const [k, s] of sendas.entries()) {
    const { trozos, bajan, buscar } = bajarPorLasCaras(
      s,
      cajas[k] as Caja,
      tramos[k] as Float64Array,
    );
    for (const cadena of bajan) {
      const [x0, y0, x1, y1] = cajaDe(
        trozos.flatMap(({ puntos }, i) => (buscar(i) === cadena ? puntos : [])),
      );
      const e = ENTORNO_DE_RAMPA;
      entornos.push([x0 - e, y0 - e, x1 + e, y1 + e]);
    }
  }
  // Los cortes, después y aparte: abren su tajo y nada más.
  for (const c of cortes) bajarPorLasCaras(c, cajaDe(c), cajasDeTramos(c));
  // Lo que baja por una ladera (#156) no abre tajo —no hay cara pintada que
  // recortar— pero aparta las laderas: su entorno entra en `juntoDeLadera`. Cada
  // trozo por su cuenta, sin encadenarlo con las caras: una senda que baja por
  // un canto y sigue al pie de una cara no baja por esa cara, y encadenada le
  // abría un tajo.
  //
  for (const l of laderas) {
    const banda = bandaDeLadera(l);
    const [x0, y0, x1, y1] = banda;
    // El filo es el lado alto, a lo largo de sus casillas: más abajo la banda
    // es el pie que cuelga, y lo que pasa por ahí no viene de la meseta.
    const enElFilo = ([x, y]: readonly [number, number]) =>
      y <= l.y1 + 1 + EPS && (l.lado === 'este' ? x <= x0 + EPS : x >= x1 - EPS);
    for (const [k, s] of sendas.entries()) {
      const [sx0, sy0, sx1, sy1] = cajas[k] as Caja;
      if (sx0 > x1 || sx1 < x0 || sy0 > y1 || sy1 < y0) continue;
      for (const trozo of trozosEnCaja(s, banda, tramos[k])) {
        if (!trozo.some(enElFilo)) continue;
        const [tx0, ty0, tx1, ty1] = cajaDe(trozo);
        entornosDeLadera.push([
          tx0 - ENTORNO_DE_LADERA,
          ty0 - ENTORNO_DE_LADERA,
          tx1 + ENTORNO_DE_LADERA,
          ty1 + ENTORNO_DE_LADERA,
        ]);
      }
    }
  }
  const tajos = porCara.map((trazos, k) => tajosDe(caras[k] as Cara, trazos));
  // Toda senda que pasa por el entorno de lo que baja, no solo la que baja: en
  // un cruce junto a la rampa (una mina al pie, s8) la senda sigue por otra.
  // Menos la que tapa una cara sin tajo (la cruza por su banda) lejos de todo
  // tajo: ahí la pared no esconde nada que no esconda ya la cara, y quitarla
  // por eso dejaba acantilados enteros lisos (s9, bajo el castillo). Junto a un
  // tajo cuenta toda: es la que mira quien sigue la rampa.
  const e = ENTORNO_DE_RAMPA;
  const cercaDeUnTajo = tajos.flat().map((r): Caja => {
    const [x0, y0, x1, y1] = cajaDe(r.trazos.flat());
    return [x0 - e, y0 - e, x1 + e, y1 + e];
  });
  const tapada = (x: number, y: number) =>
    bandas.some(
      ([x0, y0, x1, y1], k) => tajos[k]?.length === 0 && x > x0 && x < x1 && y > y0 && y < y1,
    ) && !cercaDeUnTajo.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
  const juntoA = (alrededor: readonly Caja[]) =>
    sendas.flatMap((s, k) => {
      const [sx0, sy0, sx1, sy1] = cajas[k] as Caja;
      return alrededor.flatMap((caja) => {
        const [x0, y0, x1, y1] = caja;
        if (sx0 > x1 || sx1 < x0 || sy0 > y1 || sy1 < y0) return [];
        return trozosEnCaja(s, caja, tramos[k]).flatMap((t) => sinLoTapado(t, tapada));
      });
    });
  return { junto: juntoA(entornos), juntoDeLadera: juntoA(entornosDeLadera), porCara: tajos };
}

/**
 * Los trozos de `t` que no tapa nada: se parte por cada tramo cuyo punto medio
 * cae tapado. Los tramos de una senda suavizada miden una décima o menos.
 */
function sinLoTapado(t: Senda, tapada: (x: number, y: number) => boolean): Senda[] {
  const fuera: Senda[] = [];
  let actual: (readonly [number, number])[] = [];
  for (let i = 0; i + 1 < t.length; i++) {
    const p = t[i] as readonly [number, number];
    const q = t[i + 1] as readonly [number, number];
    if (tapada((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) {
      if (actual.length > 1) fuera.push(actual);
      actual = [];
      continue;
    }
    if (actual.length === 0) actual.push(p);
    actual.push(q);
  }
  if (actual.length > 1) fuera.push(actual);
  return fuera;
}

/**
 * Los tajos de una cara por los trozos de senda que bajan por ella: lo que ocupa
 * cada uno en x más `HOLGURA_DE_RAMPA` por lado, fundidos a menos de
 * `RESTO_MINIMO`, y solo los que corren `RAMPA_MINIMA` o más.
 */
function tajosDe(c: Cara, trazos: readonly Senda[]): Rampa[] {
  const juntos: { a: number; b: number; trazos: Senda[] }[] = [];
  for (const [t, [x0, , x1]] of trazos
    .map((t) => [t, cajaDe(t)] as const)
    .sort((p, q) => p[1][0] - q[1][0])) {
    const a = Math.max(c.x0, x0 - HOLGURA_DE_RAMPA);
    const b = Math.min(c.x1 + 1, x1 + HOLGURA_DE_RAMPA);
    const u = juntos.at(-1);
    if (u !== undefined && a < u.b + RESTO_MINIMO) {
      u.b = Math.max(u.b, b);
      u.trazos.push(t);
    } else juntos.push({ a, b, trazos: [t] });
  }
  return juntos
    .filter(({ trazos }) => trazos.reduce((l, t) => l + largo(t), 0) >= RAMPA_MINIMA)
    .map(({ a, b, trazos }): Rampa => ({ a, b, dentro: [a > c.x0, b < c.x1 + 1], trazos }));
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
