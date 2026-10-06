/**
 * El relieve visual: un nivel de altura por casilla y las caras de roca donde el
 * terreno cae. El motor no tiene alturas; esto es solo cómo se pinta (las
 * mesetas, los barrancos y los acantilados de la referencia) y se deduce del
 * suelo y de las barreras.
 *
 * La cámara mira desde el sur: una caída hacia abajo en pantalla enseña su cara
 * de roca; una caída hacia arriba queda de espaldas y solo se ve el reborde.
 */
import type { Suelo } from '@core/map/terrain.js';
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

export interface Relieve {
  readonly nivel: Int8Array;
  /** Caídas hacia el sur: se ve la cara. */
  readonly caras: readonly Cara[];
  /** Caídas al este o al oeste, como `[x, y, lado]`: un canto y rocas. */
  readonly cantos: readonly (readonly [number, number, 'este' | 'oeste'])[];
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
    // Entre dos lados a distinta altura, el acantilado es el escalón (va arriba);
    // entre dos al mismo nivel, es un cañón cortado hacia abajo.
    else if (t === 'cliff') nivel[i] = hi > lo ? hi : Math.max(-1, lo - 1);
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
        const arriba = nivel[i - W] as number;
        const aqui = nivel[i] as number;
        const abajo = nivel[i + W] as number;
        if (aqui < arriba && abajo < aqui) {
          nivel[i] = arriba;
          cambio = true;
        }
      }
  }

  const caras: Cara[] = [];
  const cantos: [number, number, 'este' | 'oeste'][] = [];
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
      if (x + 1 < W && aqui > (nivel[i + 1] as number)) cantos.push([x, y, 'este']);
      if (x > 0 && aqui > (nivel[i - 1] as number)) cantos.push([x, y, 'oeste']);
    }
    cerrar(W);
  }
  return { nivel, caras, cantos, rebordes };
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
  const pie = c.y + 1 + c.caida * ALTO_DE_NIVEL;
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
    en: (x) => {
      if (derecha !== undefined && x > c.x1) return pie + (derecha.y - c.y) * (x - c.x1);
      if (izquierda !== undefined && x < c.x0 + 1)
        return pie + (izquierda.y - c.y) * (c.x0 + 1 - x);
      return pie;
    },
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

/** Una cara con las rampas que la cruzan: lo que lleva la escena. */
export interface CaraConRampas extends Cara {
  readonly rampas: readonly Rampa[];
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

/** Lo que se tolera al comparar puntos recortados, en casillas. */
const EPS = 1e-6;

/** Los trozos de `s` que caen en la caja: uno nuevo cada vez que sale y vuelve a entrar. */
function trozosEnCaja(s: Senda, [x0, y0, x1, y1]: Caja): [number, number][][] {
  const fuera: [number, number][][] = [];
  let actual: [number, number][] | undefined;
  const t: [number, number] = [0, 0];
  for (let i = 0; i + 1 < s.length; i++) {
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
   * toda la que pasa a menos de `ENTORNO_DE_RAMPA` de lo que baja. Ninguna pared, de
   * esa cara o de otra, la pisa (`SEMIANCHO_DE_PARED`): se encoge o se quita.
   */
  readonly junto: readonly Senda[];
}

/**
 * Las rampas de cada cara por las que pasan unas sendas, y la senda junto a
 * ellas.
 *
 * Cada senda se recorta contra la banda de cada cara (`bandaDeCara`). Los trozos
 * de una misma senda que se tocan —pasa de una cara a la de al lado sin salir
 * de las bandas, como en un acantilado en escalera— forman una cadena, y la
 * cadena baja si alguno toca el filo: la senda viene de arriba. La que solo
 * corre por el pie no baja y no abre nada.
 *
 * El tajo de cada trozo es lo que ocupa en x más `HOLGURA_DE_RAMPA` por lado,
 * dentro de la cara. Solo llega a un extremo si la senda sale por él o pasa
 * más cerca que la holgura: el resto de la cara conserva su pared, y un peldaño
 * de una casilla no se queda pelado. Lo que corre menos de `RAMPA_MINIMA` por
 * su cara no abre tajo.
 */
export function rampas(caras: readonly Cara[], sendas: readonly Senda[]): Bajadas {
  const bandas = caras.map(bandaDeCara);
  const porCara: Senda[][] = caras.map(() => []);
  /** Alrededor de cada cadena que baja, hasta `ENTORNO_DE_RAMPA`. */
  const entornos: Caja[] = [];
  for (const s of sendas) {
    // Casi todas las sendas quedan lejos de casi todas las caras.
    const [sx0, sy0, sx1, sy1] = cajaDe(s);
    const trozos = bandas.flatMap((banda, cara) => {
      const [x0, y0, x1, y1] = banda;
      if (sx0 > x1 || sx1 < x0 || sy0 > y1 || sy1 < y0) return [];
      return trozosEnCaja(s, banda).map((puntos) => ({ cara, puntos }));
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
    for (const cadena of bajan) {
      const [x0, y0, x1, y1] = cajaDe(
        trozos.flatMap(({ puntos }, i) => (buscar(i) === cadena ? puntos : [])),
      );
      const e = ENTORNO_DE_RAMPA;
      entornos.push([x0 - e, y0 - e, x1 + e, y1 + e]);
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
  const junto = sendas.flatMap((s) => {
    const [sx0, sy0, sx1, sy1] = cajaDe(s);
    return entornos.flatMap((caja) => {
      const [x0, y0, x1, y1] = caja;
      if (sx0 > x1 || sx1 < x0 || sy0 > y1 || sy1 < y0) return [];
      return trozosEnCaja(s, caja).flatMap((t) => sinLoTapado(t, tapada));
    });
  });
  return { junto, porCara: tajos };
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
