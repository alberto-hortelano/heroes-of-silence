/**
 * El compás de cada figura: un desfase y una velocidad de animación propios, para
 * que un tablero en reposo no respire al unísono (decisión del usuario,
 * 03-10-2026: «que no vayan todos a la vez […] que hace un efecto de
 * coreografía»).
 *
 * Sale **del id de la figura** por un hash, y no de `Math.random`: la misma
 * figura lleva el mismo compás en cada fotograma y en cada pasada de `pnpm
 * capturas`, y el espectador ve lo mismo que vería otra vez. Es solo del cliente:
 * el núcleo no sabe que existe y el banco no puede moverse.
 *
 * Toca solo los clips en bucle —reposo, marcha, carga—. Un clip de un solo uso
 * (golpe, daño, muerte) arranca cuando ocurre y se queda con su reloj: su fase
 * la marca el hecho, y su final lo leen otros (`clipEnCurso`, `fotogramaDeCaida`)
 * con el mismo reloj sin desplazar.
 */
import { type ClipInfo, msDelClip } from './render/character.js';

/**
 * Cuánto se aparta como mucho la velocidad de una figura de la del atlas, por
 * encima o por debajo: ±8 %, la cifra orientativa del usuario. Es poco a
 * propósito: lo bastante para que dos vecinos dejen de coincidir en unos pocos
 * ciclos, y no tanto como para que una se vea acelerada.
 */
export const RUIDO_DE_VELOCIDAD = 0.08;

export interface Compas {
  /** Dónde arranca su ciclo, como fracción de él: de 0 (incluido) a 1 (excluido). */
  readonly desfase: number;
  /** Por cuánto se multiplica su reloj: de `1 − RUIDO` a `1 + RUIDO`. */
  readonly velocidad: number;
}

/**
 * Un entero de 32 bits sin signo que depende de todo el texto: FNV-1a y, encima,
 * el mezclado final de MurmurHash3. Sin ese mezclado, ids que solo se distinguen
 * en el último carácter (`s1`, `s2`…) daban bits altos casi iguales, que son los
 * que se reparten más abajo.
 */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** El compás de la figura `id`. Lanza con un id vacío: todas compartirían el mismo. */
export function compasDe(id: string): Compas {
  if (id === '')
    throw new Error('una figura sin id no tiene compás propio: le tocaría el de todas');
  const h = hash(id);
  // Dos mitades del mismo hash: el desfase de los 16 bits bajos y la velocidad
  // de los altos, así que no van atadas la una a la otra.
  const desfase = (h & 0xffff) / 0x10000;
  const velocidad = 1 + RUIDO_DE_VELOCIDAD * (2 * ((h >>> 16) / 0xffff) - 1);
  return { desfase, velocidad };
}

/**
 * El reloj con el que se lee el fotograma de un clip de la figura `id`: en un
 * clip en bucle, su `tiempo` a su velocidad y desplazado su desfase de ciclo; en
 * uno de un solo uso, el `tiempo` tal cual.
 */
export function relojDeFigura(info: ClipInfo, tiempo: number, id: string): number {
  if (!info.loop) return tiempo;
  const { desfase, velocidad } = compasDe(id);
  return tiempo * velocidad + desfase * msDelClip(info);
}
