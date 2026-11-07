/**
 * El poblamiento de las regiones de fuera (ciudades y pueblos en su región,
 * fases 2 y 3, 05-11-2026; `data/poblamiento.json`): qué parejas de regiones
 * llevan ciudad en su mitad y dónde (`ciudadesDeRegion`, en su casilla más
 * honda), qué pueblos van en el muro (`pueblosEnElMuro`) y la corriente de azar
 * con que se eligen (`azarDelPoblamiento`), que no mueve nada más del mapa.
 *
 * Era parte de `map/generate.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import { createRng, type Rng } from '../../rng.js';
import type { Point } from '../../types.js';
import { aPunto, chebyshev, espejoDe, parejaDe } from '../geometria.js';
import { BARRERAS_DEL_PUEBLO } from '../map.js';
import { SEPARACION_DE_CIUDADES } from '../recinto.js';
import { vecindad } from '../regiones.js';
import type { Barrera } from '../terrain.js';
import type { Estructura } from '../tipos.js';
import { barajar } from '../vestir/base.js';
import { POBLAMIENTO } from './datos.js';
import { huellaDeSemillas } from './nombres.js';
import { puebloDelMuroBlocker } from './validar.js';

/** Las regiones de fuera del jugador 0, de `regiones`: las pares sin la de casa (las impares son su espejo). */
export function regionesDeFuera(regiones: number): number[] {
  return Array.from({ length: regiones }, (_, k) => k).filter((k) => k % 2 === 0 && k !== 0);
}

/** Cuántas parejas de fuera llevan ciudad en mitad de su región: las de `data/poblamiento.json`, si las hay. */
export function parejasConCiudad(regiones: number): number {
  return Math.min(POBLAMIENTO.parejasConCiudad, regionesDeFuera(regiones).length);
}

/**
 * Los saltos de una base a la región `r`: los de su nodo más cercano, con `d` los
 * saltos de la base a cada nodo (`saltosDesde`); 99 si no llega. Lo leen el
 * equilibrio de las parejas con ciudad y la facción de las ciudades de región.
 */
export function saltosALaRegion(
  red: Estructura,
  d: ReadonlyMap<number, number>,
  r: number,
): number {
  return Math.min(99, ...(red.regiones[r]?.nodos ?? []).map((n) => d.get(n) ?? 99));
}

/** Lo que pide `ciudadesDeRegion`. */
interface EntradaDelPoblamiento {
  readonly W: number;
  readonly H: number;
  /** La región de cada casilla (la de la frontera gruesa), −1 en barrera. */
  readonly regionDe: Int32Array;
  /**
   * Si en la casilla puede ir el recinto de una ciudad (`delRecinto`) o uno de
   * sus accesos: se pisa y no es del recinto ni de los accesos de otra ciudad; y
   * el recinto, que es muralla, además ni se pega a un nodo, ni es pasillo ni lo
   * de delante de una entrada, que taparía. Un acceso se pisa y no lleva nada:
   * puede ir en la entrada de un nodo.
   */
  readonly libre: (i: number, delRecinto: boolean) => boolean;
  /** Las ciudades que ya hay (bases y ciudades-puente): se queda a `SEPARACION_DE_CIUDADES` de ellas. */
  readonly otras: readonly Point[];
  /** Las regiones de fuera del jugador 0 que pueden llevarla (`RedFina.conCiudadPosible`); su espejo, la de su pareja. */
  readonly parejas: readonly number[];
  /** Cuántas parejas la llevan. */
  readonly cuantas: number;
  /** La corriente con que se eligen las parejas (`azarDelPoblamiento`). */
  readonly azar: Rng;
}

/**
 * Las ciudades de mitad de una región (ciudades en su región, fase 2,
 * 05-11-2026): `cuantas` parejas de `parejas`, elegidas con su propia corriente,
 * y en cada región de la pareja una ciudad en su casilla **más honda** —la más
 * lejana a lo que no es la región, el borde del mapa incluido— donde quepan su
 * recinto y sus accesos, el 5 × 5 de alrededor, todo de la región y `libre`, y a
 * `SEPARACION_DE_CIUDADES` o más de toda otra ciudad. Desempata el índice menor:
 * sin tirada, así que dónde va no mueve ningún azar del mapa. Con el 5 × 5 entero
 * en la región, los accesos de todas sus puertas son de ella: toca una sola, y la
 * red la asienta dentro (`estructura`, `sitiosDeRegion`), no es un nodo.
 *
 * La pareja en la que no cabe en alguna de sus dos regiones se salta, y si no
 * salen `cuantas`, devuelve por qué: ese vestido no vale.
 */
export function ciudadesDeRegion(
  e: EntradaDelPoblamiento,
): { readonly casilla: number; readonly region: number }[] | string {
  const { W, H, regionDe } = e;
  const orden = barajar(e.azar, e.parejas);
  const puestas: { casilla: number; region: number }[] = [];
  /** La casilla más honda de `r` donde cabe una ciudad, o −1. */
  const lomasHondo = (r: number): number => {
    const hondura = honduraDeLaRegion(W, H, regionDe, r);
    const ciudades = [...e.otras, ...puestas.map((c) => aPunto(c.casilla, W))];
    const lejosDeTodas = (p: Point): boolean =>
      ciudades.every((o) => chebyshev(o, p) >= SEPARACION_DE_CIUDADES);
    let mejor = -1;
    for (let i = 0; i < W * H; i++) {
      if (regionDe[i] !== r) continue;
      if (mejor !== -1 && (hondura[i] as number) <= (hondura[mejor] as number)) continue;
      const p = aPunto(i, W);
      if (p.x < 2 || p.y < 2 || p.x > W - 3 || p.y > H - 3) continue;
      let cabe = true;
      for (let dy = -2; dy <= 2 && cabe; dy++)
        for (let dx = -2; dx <= 2 && cabe; dx++) {
          const j = (p.y + dy) * W + p.x + dx;
          cabe = regionDe[j] === r && e.libre(j, Math.max(Math.abs(dx), Math.abs(dy)) <= 1);
        }
      if (cabe && lejosDeTodas(p)) mejor = i;
    }
    return mejor;
  };
  for (const r of orden) {
    if (puestas.length >= 2 * e.cuantas) break;
    const a = lomasHondo(r);
    if (a === -1) continue;
    puestas.push({ casilla: a, region: r });
    const b = lomasHondo(parejaDe(r));
    if (b === -1) {
      puestas.pop();
      continue;
    }
    puestas.push({ casilla: b, region: parejaDe(r) });
  }
  if (puestas.length < 2 * e.cuantas)
    return `solo caben ${puestas.length / 2} de ${e.cuantas} parejas de ciudades en mitad de su región (sin pegarse a un nodo ni a otra ciudad)`;
  return puestas;
}

/**
 * Cuánto hay de cada casilla de la región `r` a lo que no es ella, el borde del
 * mapa incluido, en pasos de rey (Chebyshev, 8-vecindad): 1 en su orilla, 0
 * fuera de ella.
 */
export function honduraDeLaRegion(
  W: number,
  H: number,
  regionDe: Int32Array,
  r: number,
): Int32Array {
  const N = W * H;
  const hondura = new Int32Array(N).fill(-1);
  const cola: number[] = [];
  for (let i = 0; i < N; i++)
    if (regionDe[i] !== r) {
      hondura[i] = 0;
      cola.push(i);
    }
  // Lo que está más allá del borde no es de la región: su orilla, a 1.
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (hondura[i] === -1 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) {
      hondura[i] = 1;
      cola.push(i);
    }
  }
  const { desde, vecinas } = vecindad(W, H);
  for (let q = 0; q < cola.length; q++) {
    const a = cola[q] as number;
    for (let v = desde[a]!; v < desde[a + 1]!; v++) {
      const j = vecinas[v]!;
      if (hondura[j] !== -1) continue;
      hondura[j] = (hondura[a] as number) + 1;
      cola.push(j);
    }
  }
  return hondura;
}

/** Lo que pide `pueblosEnElMuro`. */
interface EntradaDeLosPueblosDelMuro {
  readonly W: number;
  readonly H: number;
  readonly N: number;
  /** Las regiones de fuera del jugador 0 (las pares sin la de casa); su espejo, la de su pareja. */
  readonly fuera: readonly number[];
  /** Los nodos de la red, por índice plano. */
  readonly nodos: readonly number[];
  /** Los nodos que llevan camino desde cada región (`RedFina.conCamino`). */
  readonly conCamino: readonly (readonly number[])[];
  /** La barrera que cruza cada nodo (`engordarFronteras`). */
  readonly barreraDeNodo: readonly (Barrera | null)[];
  /** Los nodos que son ciudades (bases y ciudades-puente), por índice de nodo. */
  readonly ciudades: ReadonlySet<number>;
  /** Dónde está cada ciudad, también las de mitad de una región: `puebloDelMuroBlocker`. */
  readonly casillasDeCiudades: readonly { readonly at: Point }[];
  /** La corriente del poblamiento, tras las ciudades de región. */
  readonly azar: Rng;
}

/**
 * Qué regiones de fuera llevan su pueblo **en el muro** (pueblos en un nodo,
 * fase 3, 05-11-2026; decisión del usuario: «uno de cada cuatro», en
 * `POBLAMIENTO.pueblosEnUnNodo`), y en qué nodos. **Una cuota y no una tirada por
 * pareja**: `uno` de cada `de` parejas de fuera, redondeado (con cuatro, una), de
 * las que pueden: con una tirada por pareja salían el 15 % en 1-100, porque casi
 * la mitad de las que salían no tenían dónde. Las parejas se miran en el orden
 * que baraja su corriente, y cada una que puede lo lleva hasta llenar la cuota.
 * Puede la que tiene un paso con camino de la región (`conCamino`) sobre
 * montaña, bosque o acantilado (`BARRERAS_DEL_PUEBLO`), fuera del borde del mapa
 * (la pieza del pueblo se saldría del marco), cuyo espejo es un paso con camino
 * de la región pareja, de la misma barrera; de varios, uno a suertes, y su
 * espejo para la pareja. Un nodo no lleva dos pueblos, ni uno de una ciudad. La
 * corriente no es el `rng` del mapa: lo demás no se mueve.
 *
 * Devuelve, por región de las dos de la pareja, los índices de nodo de sus pueblos.
 */
export function pueblosEnElMuro(e: EntradaDeLosPueblosDelMuro): Map<number, number[]> {
  const { uno, de } = POBLAMIENTO.pueblosEnUnNodo;
  const cuota = Math.round((e.fuera.length * uno) / de);
  const orden = barajar(e.azar, e.fuera);
  const tomados = new Set<number>();
  const porRegion = new Map<number, number[]>();
  for (const r of orden) {
    if (porRegion.size >= cuota) break;
    const candidatos = (e.conCamino[r] ?? []).flatMap((k) => {
      const b = e.barreraDeNodo[k];
      if (e.ciudades.has(k) || tomados.has(k) || b == null || !BARRERAS_DEL_PUEBLO.includes(b))
        return [];
      const n = e.nodos[k] as number;
      const noVa = (i: number): boolean =>
        puebloDelMuroBlocker(aPunto(i, e.W), e.W, e.H, e.casillasDeCiudades) !== null;
      if (noVa(n)) return [];
      const m = e.nodos.indexOf(espejoDe(n, e.N));
      if (m === -1 || m === k || e.ciudades.has(m) || tomados.has(m)) return [];
      if (noVa(e.nodos[m] as number)) return [];
      if (e.barreraDeNodo[m] !== b || !(e.conCamino[parejaDe(r)] ?? []).includes(m)) return [];
      return [[k, m] as const];
    });
    if (candidatos.length === 0) continue;
    const [k, m] = e.azar.pick(candidatos);
    tomados.add(k);
    tomados.add(m);
    porRegion.set(r, [k, m]);
  }
  return porRegion;
}

/**
 * La corriente con que se eligen las parejas que llevan ciudad en su región,
 * sacada de las semillas de región: no gasta tiradas del `rng` del mapa, así que
 * poner o quitar parejas (`data/poblamiento.json`) no mueve nada más.
 */
export function azarDelPoblamiento(semillas: readonly Point[]): Rng {
  return createRng((huellaDeSemillas(semillas) ^ 0x5bd1e995) >>> 0);
}
