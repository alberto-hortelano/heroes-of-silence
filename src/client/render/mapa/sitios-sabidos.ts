/**
 * Lo que se sabe de cada ciudad y cada pueblo del mapa, para pintarlo: su dueño
 * derivado y quién lo ocupa. Aparte de `mapa.ts` porque lo leen la sesión de quien
 * juega y el espectador, y no tienen por qué cargar el lienzo para eso.
 */

import type { MapObject } from '@core/map/tipos.js';
import type { PlayerId, Point } from '@core/types.js';

/** Un sitio ocupado en el mapa: dónde, y de quién es el ocupante (`null`, una guarnición neutral). */
export interface SitioOcupado {
  readonly at: Point;
  readonly por: PlayerId | null;
}

/**
 * Un objeto del mapa con lo que se sabe de su sitio, si es una ciudad o un pueblo:
 * su dueño (derivado: el de dentro de una región no está en su objeto) y quién lo
 * ocupa. Es la forma del recuerdo de la niebla (`RememberedObject`) y la del cable
 * del espectador.
 */
export interface ObjetoSabido {
  readonly object: MapObject;
  readonly sitio?: {
    readonly dueño: PlayerId | null;
    readonly ocupante: { readonly dueño: PlayerId | null } | null;
  };
}

/**
 * Los objetos como los pinta el lienzo y los sitios ocupados: **cada ciudad y cada
 * pueblo lleva en `owner` el dueño que se sabe**, así el lienzo y el minimapa, que
 * pintan la bandera del `owner`, no tienen que conocer la regla del sitio. Son
 * copias: lo de fuera no se toca. Lo leen la sesión de quien juega
 * (`Session.objetosConocidos`, `ocupados`) y el espectador (`sitiosDelCable`).
 */
export function conLosDueñosSabidos(sabidos: Iterable<ObjetoSabido>): {
  readonly objetos: readonly MapObject[];
  readonly ocupados: readonly SitioOcupado[];
} {
  const objetos: MapObject[] = [];
  const ocupados: SitioOcupado[] = [];
  for (const { object: o, sitio } of sabidos) {
    if (sitio === undefined || (o.kind !== 'town' && o.kind !== 'village')) {
      objetos.push(o);
      continue;
    }
    objetos.push({ ...o, owner: sitio.dueño });
    if (sitio.ocupante !== null) ocupados.push({ at: o.at, por: sitio.ocupante.dueño });
  }
  return { objetos, ocupados };
}
