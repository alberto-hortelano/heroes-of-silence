/**
 * Lo que la niebla descubre de una vez: **una región entera** (regla nuestra,
 * 02-11-2026, petición del usuario: «Haz que la niebla del mapa no visto vaya por
 * regiones. Al entrar en una región se muestra entera»).
 *
 * Hasta entonces lo explorado eran los cuadrados de radio 5 de cada héroe y 6 de
 * cada castillo, y el mapa se descubría a manchas cuadradas que no seguían ni
 * una cordillera ni un río. Ahora el negro sigue el borde de las regiones: se
 * descubre la región que se pisa y, sobre un paso —un nodo, una ciudad o el
 * puente de una ciudad-puente—, todas las que ese paso une. Lo que se mira AHORA
 * (el radio de los héroes, castillos y nodos propios) lo decide `game.ts`
 * (`visibleNow`), y solo sobre lo que esto ya descubrió.
 *
 * Puro y derivado del mapa, como `estructura`: el terreno y los nodos no cambian
 * en una partida, así que todo se calcula una vez por mapa y se memoriza.
 */

import type { Point } from '../types.js';
import { inBounds } from './map.js';
import { recintoDeLaCiudad, rioAnteLaCiudad } from './recinto.js';
import { estructura, type MapaDeRed, regionMasCercana } from './regiones.js';
import type { MapObject } from './tipos.js';

/** Lo que se deriva una vez por mapa. */
interface NieblaDelMapa {
  /** Las casillas de la zona de cada región, por índice `y*width+x`, ascendentes. */
  readonly zonas: readonly (readonly number[])[];
  /**
   * Una casilla de cada región que no cae en la zona de ninguna otra: si está en
   * `fog`, la región está descubierta. Se deriva y no se guarda en el jugador
   * (un hecho, un sitio): la región se descubre entera o no se descubre.
   */
  readonly testigos: Int32Array;
  /**
   * En cada casilla de un paso, el índice de su nodo en `estructura`; −1 en las
   * demás. Un paso es la casilla de un nodo y, de una ciudad, su recinto entero y
   * el puente de una ciudad-puente: quien está en una puerta está en la ciudad, y
   * descubre todas las regiones que une (H4 de la vuelta 1 de QA, 02-11-2026: en
   * una puerta se descubría solo la región más cercana).
   */
  readonly nodoEn: Int32Array;
}

const nieblas = new WeakMap<MapaDeRed, NieblaDelMapa>();

function nieblaDe(map: MapaDeRed): NieblaDelMapa {
  const guardada = nieblas.get(map);
  if (guardada !== undefined) return guardada;
  const W = map.width;
  const n = W * map.height;
  const red = estructura(map);
  const cercana = regionMasCercana(map);

  const nodoEn = new Int32Array(n).fill(-1);
  // Lo que una región ve además de sus casillas: sus pasos. Un nodo es de todas
  // las regiones que une, y `laMasCercana` lo daba a una sola; sin esto, el nodo
  // de enfrente quedaba en negro desde la región que se acaba de explorar.
  const pasosDe: number[][] = red.nodos.map(() => []);
  const deUnPaso = new Uint8Array(n);
  for (const [k, nodo] of red.nodos.entries()) {
    const casillas = pasosDe[k] as number[];
    if (nodo.clase === 'ciudad') {
      // La ciudad, con todo su recinto: la muralla, las puertas y la plaza.
      const r = recintoDeLaCiudad(nodo.at, W, map.height);
      for (let y = r.j0; y <= r.j1; y++)
        for (let x = r.i0; x <= r.i1; x++) casillas.push(y * W + x);
      const puente = rioAnteLaCiudad(map, nodo.at);
      if (puente !== null) casillas.push(puente.acceso.y * W + puente.acceso.x);
    } else {
      casillas.push(nodo.at.y * W + nodo.at.x);
    }
    for (const i of casillas) {
      deUnPaso[i] = 1;
      nodoEn[i] = k;
    }
  }

  const propias: number[][] = map.regions.map(() => []);
  for (let i = 0; i < n; i++) {
    const k = cercana[i] as number;
    if (k >= 0) propias[k]?.push(i);
  }
  const zonas = red.regiones.map((region, k) => {
    const marca = new Uint8Array(n);
    for (const i of propias[k] as number[]) marca[i] = 1;
    for (const nodo of region.nodos) for (const i of pasosDe[nodo] as number[]) marca[i] = 1;
    const zona: number[] = [];
    for (let i = 0; i < n; i++) if (marca[i] === 1) zona.push(i);
    return zona;
  });

  const testigos = new Int32Array(red.regiones.length).fill(-1);
  for (let i = 0; i < n; i++) {
    const k = red.regionDe[i] as number;
    if (k >= 0 && testigos[k] === -1 && deUnPaso[i] === 0) testigos[k] = i;
  }
  for (const [k, t] of testigos.entries()) {
    if (t === -1) {
      throw new Error(
        `la región "${map.regions[k]?.id}" no tiene ninguna casilla fuera de un recinto o un puente: la niebla no sabría si está descubierta`,
      );
    }
  }

  const hecha: NieblaDelMapa = { zonas, testigos, nodoEn };
  nieblas.set(map, hecha);
  return hecha;
}

/**
 * Las casillas que descubre la región `k` (índices `y*width+x`, ascendentes): las
 * suyas y las de las barreras que tiene más cerca (`regionMasCercana`, la misma
 * cuenta del clima: su cordillera y su orilla del río), y **sus pasos** —cada
 * nodo que la rodea, el recinto entero de cada ciudad y el puente de una
 * ciudad-puente—, que son de todas las regiones que unen y se ven desde
 * cualquiera de ellas. Lanza con una región que el mapa no tiene.
 */
export function zonaDeNiebla(map: MapaDeRed, k: number): readonly number[] {
  const zona = nieblaDe(map).zonas[k];
  if (zona === undefined) {
    throw new Error(`este mapa no tiene región ${k}: tiene ${map.regions.length}`);
  }
  return zona;
}

/**
 * Las regiones que descubre quien está en `p`: sobre un nodo, todas las que une;
 * en cualquier casilla del recinto de una ciudad o en el puente de una
 * ciudad-puente, las de su ciudad (es su paso); en una casilla de región, la suya;
 * en cualquier otra (una barrera), la más cercana. En un mapa sin regiones,
 * ninguna. Lanza fuera del mapa.
 */
export function regionesQueDescubre(map: MapaDeRed, p: Point): readonly number[] {
  if (!inBounds(map, p)) {
    throw new Error(`(${p.x},${p.y}) está fuera del mapa de ${map.width}×${map.height}`);
  }
  if (map.regions.length === 0) return [];
  const i = p.y * map.width + p.x;
  const niebla = nieblaDe(map);
  const red = estructura(map);
  const nodo = niebla.nodoEn[i] as number;
  if (nodo >= 0) return (red.nodos[nodo] as { regiones: readonly number[] }).regiones;
  const propia = red.regionDe[i] as number;
  if (propia >= 0) return [propia];
  const cercana = regionMasCercana(map)[i] as number;
  return cercana >= 0 ? [cercana] : [];
}

/** Si la región `k` ya está descubierta en `explorado` (la casilla testigo de su zona). */
export function regionDescubierta(
  map: MapaDeRed,
  explorado: { has(p: Point): boolean },
  k: number,
): boolean {
  const t = nieblaDe(map).testigos[k];
  if (t === undefined) {
    throw new Error(`este mapa no tiene región ${k}: tiene ${map.regions.length}`);
  }
  return explorado.has({ x: t % map.width, y: Math.floor(t / map.width) });
}

/** Los objetos que caen en la zona de la región `k`: lo que se apunta al descubrirla. */
export function objetosDeLaZona(map: MapaDeRed, k: number): MapObject[] {
  const zona = new Set(zonaDeNiebla(map, k));
  return map.objects.filter((o) => zona.has(o.at.y * map.width + o.at.x));
}
