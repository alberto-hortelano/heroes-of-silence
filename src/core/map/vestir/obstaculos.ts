/**
 * Los obstáculos de dentro de las regiones (`ponerObstaculos`): manchas de
 * barrera sobre la frontera ya gruesa, en espejo cuando el reflejo vale, que no
 * tocan la frontera ni parten la región.
 *
 * Era parte de `map/vestir.ts` hasta la fase N de la reorganización
 * (07-11-2026).
 */
import type { Rng } from '../../rng.js';
import { aPunto, espejoDe, parejaDe, RUMBOS } from '../geometria.js';
import { vecindad } from '../regiones.js';
import type { Suelo } from '../terrain.js';
import { ABIERTA, BARRERAS_DEL_MAPA, indiceDe, ponerTipo, sortear, type Tipos } from './base.js';

export interface EntradaDeObstaculos {
  readonly W: number;
  readonly H: number;
  /** La frontera gruesa; aquí se añaden los obstáculos. */
  readonly tipos: Tipos;
  /** La región de cada casilla del mapa grueso, o −1. */
  readonly regionDe: Int32Array;
  readonly regiones: number;
  readonly suelos: readonly Suelo[];
  /** Los nodos de cada región, por índice plano de su casilla. */
  readonly nodosDeRegion: readonly (readonly number[])[];
  /** Las casillas donde no cae un obstáculo: objetos, inicios, asaltantes, pasillos y lo pegado a un nodo. */
  readonly vetadas: Uint8Array;
  /** Los monstruos: se alcanzan pero no se cruzan. */
  readonly monstruos: Uint8Array;
  /**
   * Los pueblos, por índice plano, como en `EntradaDeCaminos.puertas`: el camino
   * entra en ellos y no los atraviesa (#188), así que una mancha no puede dejar
   * nada al otro lado de uno.
   */
  readonly puertas: readonly number[];
  readonly rng: Rng;
}

/** Cuántas manchas se intentan por pareja de regiones antes de darla por imposible. */
const INTENTOS_DE_MANCHA = 60;

/**
 * Los obstáculos de dentro de las regiones: manchas de barrera, en espejo cuando
 * la reflejada vale, hasta una densidad sorteada por pareja de regiones entre
 * los dos topes de `data/barreras.json`. Bloquean el paso (decisión del
 * usuario: «como HoMM2»).
 *
 * Una mancha entra solo si:
 * - todas sus casillas son pisables de esa región y no están vetadas —ni
 *   objeto, ni inicio, ni asaltante, ni pasillo, ni pegadas a un nodo—;
 * - **no toca la frontera**, ni en diagonal: así un obstáculo se reconoce desde
 *   fuera —una barrera cuyas vecinas pisables son todas de una región— y nunca
 *   engorda una frontera hasta cerrar un rincón;
 * - y con ella puesta, **desde los nodos de la región se sigue llegando a todas
 *   sus casillas** sin cruzar un monstruo. Es la comprobación que impide partir
 *   la región o tapar un objeto, y es la que se rompió a mano para ver morder la
 *   auditoría.
 *
 * La última mancha de cada región se recorta a lo que falta para la densidad,
 * aunque quede por debajo de `mancha.min` (lo dice `ReglasDeBarreras`).
 *
 * Devuelve `false` si alguna región no llega al mínimo. Antes de gastar los
 * intentos mira si **cabe**: si una región no tiene casillas elegibles ni para
 * la densidad mínima, ninguna mancha la va a llevar ahí.
 */
export function ponerObstaculos(e: EntradaDeObstaculos): boolean {
  const { W, H, tipos, regionDe, rng, vetadas, monstruos } = e;
  const N = W * H;
  const puertas = new Uint8Array(N);
  for (const p of e.puertas) puertas[p] = 1;
  const { densidadPorCiento, mancha } = BARRERAS_DEL_MAPA;
  const { desde, vecinas } = vecindad(W, H);
  const tocaFrontera = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    for (let k = desde[i]!; k < desde[i + 1]!; k++) {
      if (tipos[vecinas[k]!] !== ABIERTA) tocaFrontera[i] = 1;
    }
  }

  const casillas: number[][] = Array.from({ length: e.regiones }, () => []);
  for (let i = 0; i < N; i++) {
    const r = regionDe[i] as number;
    if (r >= 0 && tipos[i] === ABIERTA) casillas[r]!.push(i);
  }
  const total = casillas.map((c) => c.length);
  const puestos = new Array<number>(e.regiones).fill(0);
  // `puestos * 100 >= pct * total`: enteros, sin coma flotante en `core`.
  const llega = (r: number, pct: number): boolean => puestos[r]! * 100 >= pct * total[r]!;
  const cabe = (r: number, n: number): boolean =>
    (puestos[r]! + n) * 100 <= densidadPorCiento.max * total[r]!;
  const valeEn = (r: number, i: number): boolean =>
    regionDe[i] === r && tipos[i] === ABIERTA && vetadas[i] === 0 && tocaFrontera[i] === 0;

  // Lo que puede llevar obstáculo, contado una vez: si no llega ni al mínimo,
  // los intentos de abajo se gastarían para nada.
  for (let r = 0; r < e.regiones; r++) {
    const elegibles = casillas[r]!.filter((i) => valeEn(r, i)).length;
    if (elegibles * 100 < densidadPorCiento.min * total[r]!) return false;
  }

  // El BFS de alcance, con un sello por búsqueda en vez de una rejilla nueva, y
  // la mancha candidata marcada en `enMancha` mientras se mira.
  const sello = new Int32Array(N);
  let ronda = 0;
  const enMancha = new Uint8Array(N);
  const alcanzaTodo = (r: number, celdas: readonly number[]): boolean => {
    for (const c of celdas) enMancha[c] = 1;
    ronda++;
    const cola: number[] = [];
    const expandir = (a: number): void => {
      for (let k = desde[a]!; k < desde[a + 1]!; k++) {
        const j = vecinas[k]!;
        if (sello[j] === ronda || regionDe[j] !== r || tipos[j] !== ABIERTA || enMancha[j] === 1)
          continue;
        sello[j] = ronda;
        cola.push(j);
      }
    };
    const quedan = total[r]! - puestos[r]! - celdas.length;
    // Desde los nodos, sin cruzar un monstruo ni un pueblo.
    for (const n of e.nodosDeRegion[r] ?? []) expandir(n);
    for (let q = 0; q < cola.length; q++) {
      const a = cola[q]!;
      if (monstruos[a] === 0 && puertas[a] === 0) expandir(a);
    }
    let vale = cola.length === quedan;
    // Y de una pieza sin cruzar un pueblo, aunque sí un monstruo: desde los
    // nodos, cada mitad de una región partida por un objeto con puerta se
    // alcanzaba desde el suyo, y su camino tenía que cruzarlo (s17, (4,28)).
    const primera = casillas[r]!.find(
      (i) => tipos[i] === ABIERTA && enMancha[i] === 0 && puertas[i] === 0,
    );
    if (vale && primera !== undefined) {
      ronda++;
      cola.length = 0;
      sello[primera] = ronda;
      cola.push(primera);
      for (let q = 0; q < cola.length; q++) if (puertas[cola[q]!] === 0) expandir(cola[q]!);
      vale = cola.length === quedan;
    }
    for (const c of celdas) enMancha[c] = 0;
    return vale;
  };

  /** Un paseo de casillas rectas (`RUMBOS`) desde un punto al azar de la región. */
  const trazar = (r: number, tamaño: number): number[] | null => {
    const libres = casillas[r]!.filter((i) => valeEn(r, i));
    if (libres.length === 0) return null;
    const hecha = [rng.pick(libres)];
    for (let guarda = 0; hecha.length < tamaño && guarda < tamaño * 6; guarda++) {
      const { x, y } = aPunto(rng.pick(hecha), W);
      const [dx, dy] = rng.pick(RUMBOS);
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (hecha.includes(j) || !valeEn(r, j)) continue;
      hecha.push(j);
    }
    return hecha.length >= Math.min(tamaño, mancha.min) ? hecha : null;
  };

  const poner = (r: number, celdas: readonly number[], tipo: number): void => {
    for (const c of celdas) ponerTipo(tipos, c, tipo);
    puestos[r]! += celdas.length;
  };

  for (let r = 0; r < e.regiones; r += 2) {
    const par = parejaDe(r);
    const pct = rng.int(densidadPorCiento.min, densidadPorCiento.max);
    // La que va más atrás pone la mancha; la otra la intenta en espejo.
    const laDeAtras = (): number => {
      if (llega(r, pct)) return par;
      if (llega(par, pct)) return r;
      return puestos[r]! * total[par]! <= puestos[par]! * total[r]! ? r : par;
    };
    for (
      let intento = 0;
      intento < INTENTOS_DE_MANCHA && !(llega(r, pct) && llega(par, pct));
      intento++
    ) {
      const atras = laDeAtras();
      const otra = parejaDe(atras);
      // Lo que falta para el objetivo, en casillas y en enteros: la última
      // mancha sale de ese tamaño aunque quede por debajo de `mancha.min`.
      const falta = Math.floor((pct * total[atras]! + 99) / 100) - puestos[atras]!;
      const tamaño = Math.min(rng.int(mancha.min, mancha.max), Math.max(1, falta));
      const celdas = trazar(atras, tamaño);
      if (celdas === null || !cabe(atras, celdas.length) || !alcanzaTodo(atras, celdas)) continue;
      const reflejo = celdas.map((c) => espejoDe(c, N));
      const deSuSuelo = BARRERAS_DEL_MAPA.obstaculos[e.suelos[atras]!];
      const tipo = indiceDe(sortear(rng, deSuSuelo));
      poner(atras, celdas, tipo);
      if (llega(otra, pct)) continue;
      if (
        reflejo.every((c) => valeEn(otra, c)) &&
        cabe(otra, reflejo.length) &&
        alcanzaTodo(otra, reflejo)
      ) {
        poner(otra, reflejo, tipo);
      }
    }
    if (!llega(r, densidadPorCiento.min) || !llega(par, densidadPorCiento.min)) return false;
  }
  return true;
}
