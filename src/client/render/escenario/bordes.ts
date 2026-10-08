/**
 * El borde de una meseta (#212): lo que dice, alrededor de todo lo alto, que
 * está alto. La cara al sur la lleva la frontal; el este y el oeste, las
 * laderas; el norte, de espaldas a la cámara, una hilera de peñascos por su
 * canto. Y lo de encima del cantil es de la roca de su cara.
 */
import { isWalkable, type Suelo, type TerrainKind } from '@core/map/terrain.js';
import type { Franja } from './analizar.js';
import { CARA_DE_SUELO } from './relieve.js';

/**
 * El material de la roca de cada casilla (`CARA_DE_SUELO`): el de su suelo,
 * salvo en lo alto de un acantilado, que es el de la cara que se ve de su
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
const hojaDelSrc = (src: string | null): string | undefined =>
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
