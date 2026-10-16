/**
 * El borde de una meseta (#212): lo que dice, alrededor de todo lo alto, que
 * está alto. La cara al sur la lleva la frontal; el este y el oeste, las
 * laderas; el norte, de espaldas a la cámara, una hilera de peñascos por su
 * canto. Y lo de encima del cantil es de la roca de su cara.
 *
 * La pared y lo alto son de la roca de la meseta (`sueloDeLaMeseta`, #216), y
 * la masa de delante no tapa la pared (`paredesTapadasPorLaMasa`): la
 * cordillera queda arriba y su pared corre seguida por delante de su pie.
 */
import { esBarrera, isWalkable, type Suelo, type TerrainKind } from '@core/map/terrain.js';
import type { Franja } from './analizar.js';
import { bajoLaSilueta, type PerfilDe } from './caras.js';
import type { Celda } from './celdas.js';
import type { Sprite } from './colocar.js';
import { type Caja, cajaDeSprite } from './pasillo.js';
import { ordenDeVolumenes } from './pintar.js';
import { CARA_DE_SUELO } from './relieve.js';

/**
 * El suelo de la meseta de cada casilla (#216): el de lo que se pisa, el
 * suyo; el de una barrera o un nodo, el de lo que se pisa más cercano **a su
 * mismo nivel** (BFS 8-vecino por lo de ese nivel; a igual distancia, lo
 * primero en el orden de la rejilla). Los nodos no son fuente, como en
 * `analizar`: su suelo es el más cercano de cualquier nivel, y la lava de un
 * nodo de s9 (2,22) hacía de basalto la cara de su meseta nevada. La barrera alta lleva el nivel de su lado
 * alto (`nivelesDelRelieve`) pero su suelo (`Analisis.suelo`) es el más
 * cercano de cualquier nivel, a menudo el del lado bajo, y la cara que cae de
 * ella tomaba su roca: la meseta de arena de s5 (2-8, 27-31) acababa en una
 * pared de roca gris, la de la ciénaga de abajo. Lo que no llega a nada de su
 * nivel se queda con el suyo.
 */
export function sueloDeLaMeseta(
  W: number,
  H: number,
  region: ArrayLike<number>,
  suelo: readonly Suelo[],
  nivel: ArrayLike<number>,
): Suelo[] {
  const fuera = [...suelo];
  const visto = new Uint8Array(W * H);
  const cola: number[] = [];
  // Lo que se pisa con región (`Analisis.region`): sin las barreras ni los nodos.
  for (let i = 0; i < W * H; i++)
    if ((region[i] as number) >= 0) {
      visto[i] = 1;
      cola.push(i);
    }
  for (let q = 0; q < cola.length; q++) {
    const j = cola[q] as number;
    const x = j % W;
    const y = (j - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (visto[k] === 1 || nivel[k] !== nivel[j]) continue;
        visto[k] = 1;
        fuera[k] = fuera[j] as Suelo;
        cola.push(k);
      }
  }
  return fuera;
}

/**
 * El suelo que se pinta en cada casilla (`Escena.suelo`, #217): el suyo en lo
 * que se pisa y, en lo que no tiene región (`Analisis.region` −1: una barrera o
 * un nodo), el de su meseta (`sueloDeLaMeseta`). Con el más cercano de
 * cualquier nivel (`Analisis.suelo`), 2 833 casillas de barrera de 1-40
 * pintaban a la altura de arriba el suelo del lado bajo: picos nevados sobre la
 * tierra oscura de abajo en s24, y el tono de lo alto aclarando un suelo que no
 * era el de la meseta. El nodo sin camino entre dos niveles va al alto y tomaba
 * el suelo de abajo: la nieve se derramaba sobre la lava de s13 (16-18, 7-9) (#220).
 * Es también el suelo de la cubierta (`cubiertaDeOtroNivel`).
 */
export function sueloQueSePinta(
  region: ArrayLike<number>,
  suelo: readonly Suelo[],
  meseta: readonly Suelo[],
): Suelo[] {
  return suelo.map((s, i) => ((region[i] as number) < 0 ? (meseta[i] as Suelo) : s));
}

/**
 * El material de la roca de cada casilla (`CARA_DE_SUELO`): el de su suelo
 * (en la escena, el de su meseta, `sueloDeLaMeseta`), salvo en lo alto de un acantilado, que es el de la cara que se ve de su
 * franja. Una franja de acantilado cruza suelos (la hierba de arriba y la arena
 * de abajo) y su cara, el de la casilla alta de cada pared; con la roca de lo
 * alto (#205) por el suelo de cada casilla, la meseta llevaba picos grises
 * detrás de un cantil de arenisca roja (s57 (14-17, 6-8), s9 (15-23, 6-12)).
 *
 * Cada casilla de la franja toma el de la casilla más cercana de su franja que
 * cae a la vista (al sur, al este o al oeste); a igual distancia, la primera en
 * el orden de la rejilla. Una franja que no cae a la vista por ningún lado
 * se queda con su suelo.
 */
export function materialDeLaCima(
  W: number,
  H: number,
  suelo: readonly Suelo[],
  nivel: ArrayLike<number>,
  franjas: readonly Pick<Franja, 'barrera' | 'casillas'>[],
): string[] {
  const fuera = suelo.map((s) => CARA_DE_SUELO[s]);
  const caeALaVista = (i: number): boolean => {
    const x = i % W;
    const y = Math.floor(i / W);
    const n = nivel[i] as number;
    return (
      (y + 1 < H && (nivel[i + W] as number) < n) ||
      (x + 1 < W && (nivel[i + 1] as number) < n) ||
      (x > 0 && (nivel[i - 1] as number) < n)
    );
  };
  for (const f of franjas) {
    if (f.barrera !== 'cliff') continue;
    const suya = new Set(f.casillas);
    const visto = new Map<number, string>();
    const cola: number[] = [];
    for (const i of [...f.casillas].sort((p, q) => p - q))
      if (caeALaVista(i)) {
        visto.set(i, CARA_DE_SUELO[suelo[i] as Suelo]);
        cola.push(i);
      }
    for (let k = 0; k < cola.length; k++) {
      const i = cola[k] as number;
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W])
        if (j >= 0 && j < W * H && suya.has(j) && !visto.has(j)) {
          visto.set(j, visto.get(i) as string);
          cola.push(j);
        }
    }
    for (const [i, m] of visto) fuera[i] = m;
  }
  return fuera;
}

/**
 * Si la casilla alta `(x, y)` de un reborde (más alta que la de su norte) lleva
 * la hilera de peñascos de la espalda de lo que se pisa (#212): se pisa, y no
 * cae bajo la huella de un objeto (`bajoLaHuella`), que la tapa. El acantilado
 * lleva la suya desde la auditoría 2; la montaña y el bosque son masa, y el
 * agua a ras no tiene canto.
 */
export function espaldaConReborde(
  terreno: readonly TerrainKind[],
  W: number,
  x: number,
  y: number,
  bajoLaHuella: ArrayLike<number>,
): boolean {
  const i = y * W + x;
  return isWalkable(terreno[i] as TerrainKind) && bajoLaHuella[i] === 0;
}

/** Lo que mira `espaldasSinReborde` de un sprite. */
interface Pie {
  readonly clase: string;
  readonly x: number;
  readonly y: number;
  readonly alto: number;
}

/**
 * Las espaldas sin pieza (`informe.espaldasSinReborde`, #212): casillas altas
 * de un reborde (`rebordes`, más altas que la de su norte), que se pisan o son
 * de acantilado, sin ninguna roca, pared ni masa con el pie en la mitad norte de
 * la casilla, salvo las vacías por una razón declarada (`vaciaPorque`: bajo la
 * huella de un objeto, o con una senda por el canto que no deja sitio ni al
 * peñasco más bajo; 182 en 1-40). Es el tramo del borde de una meseta que no
 * dice nada: la elevación que acaba de repente. Antes de #212, 795 en 1-40.
 */
export function espaldasSinReborde(
  sprites: readonly Pie[],
  rebordes: readonly (readonly [number, number])[],
  terreno: readonly TerrainKind[],
  W: number,
  vaciaPorque: (i: number) => boolean,
): (readonly [number, number])[] {
  const conPieza = new Set<number>();
  for (const s of sprites) {
    if (s.clase !== 'roca' && s.clase !== 'pared' && s.clase !== 'masa') continue;
    if (s.alto <= 0 || s.y - Math.floor(s.y) >= 0.5) continue;
    conPieza.add(Math.floor(s.y) * W + Math.floor(s.x));
  }
  return rebordes.filter(([x, y]) => {
    const i = y * W + x;
    const t = terreno[i] as TerrainKind;
    if (t !== 'cliff' && !isWalkable(t)) return false;
    if (vaciaPorque(i)) return false;
    return !conPieza.has(i);
  });
}

/** La roca de cada hoja de picos, como material de cara. */
const ROCA_DE_LOS_PICOS: Readonly<Record<string, string>> = {
  'picos-roca': 'cara-roca',
  'picos-afilados': 'cara-roca',
  'picos-arenisca': 'cara-arenisca',
  'picos-nevados': 'cara-nevada',
  'picos-volcan': 'cara-basalto',
};

/** La hoja de un sprite por su `src` (`modulos/<hoja>/<módulo>.webp`), o undefined. */
export const hojaDelSrc = (src: string | null): string | undefined =>
  src === null ? undefined : /^modulos\/([^/]+)\//.exec(src)?.[1];

/**
 * Los picos de lo alto de un acantilado de otra roca que la de su cara
 * (`informe.cimaDeOtroMaterial`, #212): sprites de clase `roca` de una hoja de
 * picos con el pie en una casilla de acantilado, cuya roca no es la de
 * `materialDeLaCima`: gris sobre arenisca roja. Los peñascos no cuentan: su
 * tono lo puede dar la pared vecina de la que caen (el pie de una frontal, el
 * canto de una ladera), y no se distinguen de los de lo alto.
 */
export function cimaDeOtroMaterial(
  sprites: readonly (Pick<Pie, 'clase' | 'x' | 'y'> & { readonly src: string | null })[],
  terreno: readonly TerrainKind[],
  W: number,
  material: readonly string[],
): number[] {
  const fuera: number[] = [];
  sprites.forEach((s, k) => {
    if (s.clase !== 'roca') return;
    const i = Math.floor(s.y) * W + Math.floor(s.x);
    if (terreno[i] !== 'cliff') return;
    const roca = ROCA_DE_LOS_PICOS[hojaDelSrc(s.src) ?? ''];
    if (roca !== undefined && roca !== material[i]) fuera.push(k);
  });
  return fuera;
}

/** Hasta qué distancia (Chebyshev) busca `caraDeOtroMaterial` lo que se pisa de la meseta. */
const LEJOS_DE_LA_MESETA = 4;

/**
 * Las paredes del desnivel (`Celda`) de otra roca que su meseta (#216): de las
 * casillas altas de su vértice, lo que se pisa (sin los nodos) a su nivel más cerca (por
 * anillos, Chebyshev, y el siguiente, que el camino de `sueloDeLaMeseta` va por
 * la barrera y no en línea recta) da las rocas que valen. La meseta de arena
 * que acababa en una pared gris, la del suelo de abajo, cuenta. Lo que no tiene
 * nada de su nivel a `LEJOS_DE_LA_MESETA` no se mira.
 */
export function caraDeOtroMaterial<C extends Pick<Celda, 'vx' | 'vy' | 'desde' | 'material'>>(
  cs: readonly C[],
  W: number,
  H: number,
  terreno: readonly TerrainKind[],
  region: ArrayLike<number>,
  nivel: ArrayLike<number>,
): C[] {
  const valen = (x: number, y: number): Set<string> => {
    const n = nivel[y * W + x] as number;
    const fuera = new Set<string>();
    let primero = -1;
    for (let d = 0; d <= LEJOS_DE_LA_MESETA && (primero < 0 || d <= primero + 1); d++)
      for (let dy = -d; dy <= d; dy++)
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const t = terreno[ny * W + nx] as TerrainKind;
          if (esBarrera(t) || (region[ny * W + nx] as number) < 0 || nivel[ny * W + nx] !== n)
            continue;
          fuera.add(CARA_DE_SUELO[t as Suelo]);
          if (primero < 0) primero = d;
        }
    return fuera;
  };
  return cs.filter((c) => {
    const validas = new Set<string>();
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const) {
      const x = c.vx + dx;
      const y = c.vy + dy;
      if ((nivel[y * W + x] as number) < c.desde) continue;
      for (const m of valen(x, y)) validas.add(m);
    }
    return validas.size > 0 && !validas.has(c.material);
  });
}

/** Cada cuánto, en casillas, se mira si una masa tapa una pared (`paredesTapadasPorLaMasa`). */
export const PASO_DE_LA_PARED_TAPADA = 0.1;

/**
 * Una pared del desnivel (frontal, ladera o diagonal): una pieza con su fila
 * alta, sin el pedregal ni la bajada, que se ponen después de la masa y tienen
 * sus guardias (`bajadasTapadas`).
 */
export const esPiezaDelRelieve = (s: Pick<Sprite, 'clase' | 'src' | 'filaAlta'>): boolean =>
  s.clase === 'pared' &&
  s.filaAlta !== undefined &&
  s.src?.includes('/rocas-caidas/') !== true &&
  s.src?.includes('/bajadas-') !== true;

/**
 * Las piezas del relieve que tapa una masa —un pico de la cordillera, un árbol—
 * que se pinta después de ellas (`ordenDeVolumenes`), con qué parte de su
 * silueta queda tapada (#216): la pared del desnivel asomaba a trozos entre los
 * picos que la cordillera plantaba delante de ella (s5 (2-8, 27-31), s24 (7-8,
 * 16-17)), y no se sabía qué lado era el alto. Se mira la silueta de la pared
 * (`bajoLaSilueta`, con su perfil) cada `PASO_DE_LA_PARED_TAPADA` contra la
 * caja de las masas: la que mide quien las aparta (`formasDeLasParedes`).
 */
export function paredesTapadasPorLaMasa(
  sprites: readonly Sprite[],
  perfilDe: PerfilDe,
): { readonly pared: number; readonly tapada: number }[] {
  // Las masas por casilla de su caja: un punto mira solo las de la suya.
  const porCasilla = new Map<number, { readonly k: number; readonly caja: Caja }[]>();
  sprites.forEach((s, k) => {
    if (s.clase !== 'masa') return;
    const caja = cajaDeSprite(s);
    for (let y = Math.floor(caja[1]); y <= Math.floor(caja[3]); y++)
      for (let x = Math.floor(caja[0]); x <= Math.floor(caja[2]); x++) {
        const c = y * 4096 + x;
        const lista = porCasilla.get(c);
        if (lista === undefined) porCasilla.set(c, [{ k, caja }]);
        else lista.push({ k, caja });
      }
  });
  const fuera: { pared: number; tapada: number }[] = [];
  sprites.forEach((p, k) => {
    if (!esPiezaDelRelieve(p)) return;
    const caja = cajaDeSprite(p);
    const perfil = perfilDe(p);
    let muestras = 0;
    let tapadas = 0;
    const P = PASO_DE_LA_PARED_TAPADA;
    for (let x = caja[0] + P / 2; x < caja[2]; x += P)
      for (let y = caja[1] + P / 2; y < caja[3]; y += P) {
        if (!bajoLaSilueta(p, perfil, x, y, caja)) continue;
        muestras++;
        const delante = (porCasilla.get(Math.floor(y) * 4096 + Math.floor(x)) ?? []).some(
          ({ k: q, caja: [x0, y0, x1, y1] }) =>
            x > x0 && x < x1 && y > y0 && y < y1 && ordenDeVolumenes(sprites[q] as Sprite, p) > 0,
        );
        if (delante) tapadas++;
      }
    if (tapadas > 0) fuera.push({ pared: k, tapada: tapadas / muestras });
  });
  return fuera;
}
