/**
 * Qué se hornea en la escena del mapa. Va aparte de `superficie.ts` porque lo
 * leen también el pintor del suelo, que corre en un Worker y no puede traerse
 * la carga de imágenes ni el catálogo del cliente.
 */
import type { MapObject } from '@core/map/map.js';
import type { Sprite } from './colocar.js';

/**
 * Lo que se hornea en la escena: lo que no cambia en la partida salvo de dueño.
 * Ciudad, pueblo, nodo y mina los pinta el escenógrafo; el juego pinta encima
 * su bandera. Monstruos, recursos y cofres desaparecen al vencerlos o
 * recogerlos, así que los pinta el juego. Una sola regla con cuatro lectores: la
 * pintura, las imágenes que se cargan, el pintor del suelo y `pintarObjeto`.
 */
export function seHornea(kind: MapObject['kind']): boolean {
  return kind === 'town' || kind === 'village' || kind === 'node' || kind === 'mine';
}

/** `seHornea` como el filtro `objeto` de `OpcionesDePintura`. */
export const horneado = (o: NonNullable<Sprite['objeto']>): boolean => seHornea(o.kind);
