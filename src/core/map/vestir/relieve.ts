/**
 * El relieve de lo engordado (#210): el nivel de cada casilla de una frontera a
 * medio vestir, como lo verá la escena (`nivelesDeLoEngordado`); las espigas,
 * que se quitan (`quitarEspigas`), y las mesas, que hacen que un vestido no
 * valga (`mesasDelRelieve`). Lo leen el engorde (`fronteras.ts`), las líneas
 * (`lineas.ts`) y el generador.
 *
 * Era parte de `map/vestir.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import { aPunto } from '../map.js';
import { espigasDelRelieve, type NodoDelRelieve, nivelesDelRelieve } from '../niveles.js';
import { vecindad } from '../regiones.js';
import type { Barrera, Nivel, TerrainKind } from '../terrain.js';
import {
  ABIERTA,
  barreraDe,
  esDelRio,
  indiceDe,
  ponerTipo,
  separadasDeCerca,
  type Tipos,
} from './base.js';

/**
 * Las mesas del relieve: un trozo de barrera (8-conexo, a un nivel) por encima
 * de todo lo que toca —ni una casilla que se pisa a su nivel o más, ni barrera
 * más alta—. La escena le pinta paredes a los cuatro lados y su roca no sale de
 * ninguna meseta (#216): s33 (9-12, 8-9) con #232, una montaña a 2 en un llano
 * a 1, unida a la meseta de lava solo por una casilla de montaña a 1. La regla
 * del relieve (`nivelesDelRelieve`) las quita casi siempre; las que quedan
 * —3 en 1-200 antes de #232— hacen que el vestido no valga. Devuelve una
 * casilla de cada una.
 */
export function mesasDelRelieve(
  W: number,
  H: number,
  nivel: ArrayLike<number>,
  sePisa: (i: number) => boolean,
): number[] {
  const N = W * H;
  const vista = new Uint8Array(N);
  const { desde, vecinas } = vecindad(W, H);
  const fuera: number[] = [];
  for (let i = 0; i < N; i++) {
    if (vista[i] === 1 || sePisa(i)) continue;
    const L = nivel[i] as number;
    vista[i] = 1;
    const trozo = [i];
    let apoyada = false;
    for (let q = 0; q < trozo.length; q++) {
      const c = trozo[q] as number;
      for (let v = desde[c]!; v < desde[c + 1]!; v++) {
        const j = vecinas[v]!;
        const n = nivel[j] as number;
        if (sePisa(j) ? n >= L : n > L) apoyada = true;
        else if (!sePisa(j) && n === L && vista[j] === 0) {
          vista[j] = 1;
          trozo.push(j);
        }
      }
    }
    if (!apoyada && L > 0) fuera.push(i);
  }
  return fuera;
}

/**
 * El terreno y las regiones de lo engordado como los verá la escena, y el nivel
 * de cada casilla con la misma regla (`nivelesDelRelieve`, `nivelDelNodo`). El
 * nodo de agua que no es ciudad es un puente, agua en la escena; el de lo demás
 * se pisa y va al bajo si es ciudad o lleva camino (`alBajo`) y si no al alto.
 */
export function nivelesDeLoEngordado(
  W: number,
  H: number,
  tipos: Tipos,
  etiqueta: Int32Array,
  esNodo: Uint8Array,
  niveles: readonly Nivel[],
  nodos: readonly number[],
  barreraDeNodo: readonly Barrera[],
  alBajo: ReadonlySet<number>,
  ciudades: ReadonlySet<number>,
): Int8Array {
  const N = W * H;
  const terreno: TerrainKind[] = new Array(N);
  const regionDe = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const b = barreraDe(tipos, i);
    terreno[i] = b ?? 'grass';
    if (b === null && esNodo[i] === 0) regionDe[i] = etiqueta[i] as number;
  }
  const { desde, vecinas } = vecindad(W, H);
  const delRelieve: NodoDelRelieve[] = [];
  for (const [k, n] of nodos.entries()) {
    if (barreraDeNodo[k] === 'water' && !ciudades.has(n)) {
      terreno[n] = 'water';
      continue;
    }
    // Lo demás se pisa, como en la escena: `buildMap` abre la casilla. Con la
    // barrera de debajo, el acantilado seguía por el nodo y una casilla junto
    // a una ciudad tomaba la región de enfrente por la más cercana (s74 en
    // 64×64, (33,37): a 1 aquí y a 2 en la escena, #215).
    terreno[n] = 'grass';
    const regiones = new Set<number>();
    for (let v = desde[n]!; v < desde[n + 1]!; v++) {
      const r = regionDe[vecinas[v]!] as number;
      if (r >= 0) regiones.add(r);
    }
    delRelieve.push({ casilla: n, regiones: [...regiones], alBajo: alBajo.has(n) });
  }
  return nivelesDelRelieve(W, H, terreno, regionDe, niveles, delRelieve);
}

/**
 * Las espigas de lo engordado (#210): casillas de una de ancho por encima de lo
 * que tienen a los dos lados en un eje (`espigasDelRelieve`). Las deja el ruido
 * de la frontera —una casilla sin engordar entre dos engordadas, el diente de
 * un peine—, el pasillo de un nodo que cruza el agua y el espolón de un
 * acantilado o una montaña que se mete en lo bajo. La auditoría 5 contó 112 en
 * 10 semillas, y la escena las pintaba como obeliscos y cuchillas.
 *
 * - **Lo que se pisa**, se rellena con la barrera baja de al lado (el agua); si
 *   es pasillo, que no se toca, se abre la barrera de al lado a su región, si es
 *   de su celda, no es muro fino y no deja otra región a menos de tres pasos.
 * - **Una barrera** alta entre dos casillas que se pisan, las rellena con su
 *   barrera: el espolón se hace lomo; entre dos barreras bajas, toma la suya.
 *
 * Solo convierte lo pisable en barrera, salvo el pasillo, que se ensancha.
 * Devuelve si cambió algo; quien llama vuelve a mirar los bolsillos.
 */
export function quitarEspigas(
  W: number,
  H: number,
  tipos: Tipos,
  etiqueta: Int32Array,
  muro: Uint8Array,
  esNodo: Uint8Array,
  pasillo: Uint8Array,
  niveles: readonly Nivel[],
  nodos: readonly number[],
  barreraDeNodo: readonly Barrera[],
  alBajo: ReadonlySet<number>,
  ciudades: ReadonlySet<number>,
): boolean {
  const N = W * H;
  const nivel = nivelesDeLoEngordado(
    W,
    H,
    tipos,
    etiqueta,
    esNodo,
    niveles,
    nodos,
    barreraDeNodo,
    alBajo,
    ciudades,
  );
  const espigas = espigasDelRelieve(W, H, nivel);
  const abierta = (j: number): boolean => tipos[j] === ABIERTA && esNodo[j] === 0;
  /**
   * Si `p` se puede abrir a la región `r` sin dejar otra a menos de tres pasos,
   * salvo con su línea en medio (`separadasDeCerca`).
   */
  const abrible = (p: number, r: number): boolean => {
    if (abierta(p) || esNodo[p] === 1 || muro[p] === 1 || etiqueta[p] !== r) return false;
    const { x, y } = aPunto(p, W);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const q = (y + dy) * W + x + dx;
        if (!abierta(q) || etiqueta[q] === r) continue;
        const rq = etiqueta[q] as number;
        const nivelR = niveles[r] as number;
        const nivelQ = niveles[rq] as number;
        if (
          !separadasDeCerca(
            W,
            H,
            tipos,
            nivel,
            p,
            q,
            nivelR,
            nivelQ,
            (m) => m !== p && esNodo[m] === 0,
          )
        )
          return false;
      }
    return true;
  };
  const MONTAÑA = indiceDe('mountain');
  const MURO = indiceDe('wall');
  let cambio = false;
  for (const c of espigas) {
    if (!abierta(c)) continue;
    const n = nivel[c] as number;
    const x = c % W;
    const ejes: (readonly [number, number])[] = [];
    if (x > 0 && x < W - 1 && (nivel[c - 1] as number) < n && (nivel[c + 1] as number) < n)
      ejes.push([c - 1, c + 1]);
    if (c >= W && c < N - W && (nivel[c - W] as number) < n && (nivel[c + W] as number) < n)
      ejes.push([c - W, c + W]);
    for (const lados of ejes) {
      if (pasillo[c] === 0) {
        const baja = lados.find((p) => tipos[p] !== ABIERTA && tipos[p] !== MURO);
        if (baja === undefined) continue;
        ponerTipo(tipos, c, tipos[baja] as number);
        cambio = true;
        break;
      }
      for (const p of lados) {
        // Ni el río (`ponerTipo`): la espiga se queda, y si nada más la quita,
        // el vestido no vale (paso 7b').
        if (abierta(p) || esNodo[p] === 1 || esDelRio(tipos, p)) continue;
        // El pasillo no se toca: se abre la orilla a su región o, si no se
        // puede, la orilla deja de ser agua y sube con él, de montaña, que
        // admite cualquier pareja de niveles.
        ponerTipo(tipos, p, abrible(p, etiqueta[c] as number) ? ABIERTA : MONTAÑA);
        cambio = true;
      }
    }
  }
  return cambio;
}
