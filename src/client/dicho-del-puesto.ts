/**
 * Cómo se dice la obra de un puesto en la pantalla (puesto fronterizo, fase 3,
 * 04-11-2026): lo que se ve en el mapa con cada una, y de cada obra su nombre, su
 * botón, la barra al hacerla y su línea de la crónica. Tablas exhaustivas: una obra
 * nueva sin su frase no compila, y no hay un ternario sobre `'empalizada'` en cada
 * fichero que la nombra (simplify de la fase 3, S29).
 *
 * El material de su muralla no se escribe aquí: lo da el núcleo
 * (`LaObraDelPuesto.materiales`, de `data/sitios.json`).
 */
import type { MejoraDelPuesto, ObraDelPuesto } from '@core/map/map.js';

/** Lo que se ve en el mapa en un puesto con cada obra (la petición del usuario). */
export const SE_VE_EN_EL_PUESTO: Readonly<Record<MejoraDelPuesto, string>> = {
  ninguna: 'una caseta',
  empalizada: 'una torreta de madera',
  muralla: 'una torre',
};

/** Cómo se dice una obra. */
export interface DichoDeLaObra {
  /** Su nombre en una frase: «la empalizada». */
  readonly nombre: string;
  /** El botón que la hace, sin el precio. */
  readonly boton: string;
  /** La barra al hacerla, con el sitio tras «de» (`delSitio`). */
  readonly hecho: (delSitio: string) => string;
  /**
   * La crónica: la obra hecha en `elPuesto` («el puente de (3,4)»), en segunda
   * persona si es de quien lee y, si no, en tercera, sin sujeto.
   */
  readonly cronica: (mio: boolean, elPuesto: string) => string;
}

export const DICHO_DE_LA_OBRA: Readonly<Record<ObraDelPuesto, DichoDeLaObra>> = {
  empalizada: {
    nombre: 'la empalizada',
    boton: 'Levantar la empalizada',
    hecho: (del) => `Levantada la empalizada ${del}.`,
    cronica: (mio, el) => `${mio ? 'Levantas' : 'levanta'} la empalizada en ${el}`,
  },
  muralla: {
    nombre: 'la muralla',
    boton: 'Amurallar',
    hecho: (del) => `Amurallado el puesto ${del}.`,
    cronica: (mio, el) => `${mio ? 'Amurallas' : 'amuralla'} ${el}`,
  },
};
