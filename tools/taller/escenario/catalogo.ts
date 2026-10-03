/**
 * El catálogo de la escena: las medidas y el ancla de cada módulo y de cada
 * pieza suelta que el escenógrafo puede colocar. Es lo único que `componer`
 * necesita saber del arte, y lo recibe como dato: así la composición no lee de
 * disco y corre igual en Node que en el navegador.
 *
 * En disco vive en `assets/mapa/escena.json` (`RUTA_DEL_CATALOGO`), y lo rehace
 * `pnpm taller catalogo-escena` desde los JSON de cada hoja y cada pieza. Un test
 * comprueba que el que está en el repo es el que sale del disco.
 *
 * Toda `src` es relativa a `assets/mapa/`.
 */

export interface Pieza {
  readonly src: string;
  /** Tamaño nativo de la imagen, en píxeles. */
  readonly nw: number;
  readonly nh: number;
  /** El ancla: el centro de la base, en píxeles de la imagen. */
  readonly ax: number;
  readonly ay: number;
}

export interface Modulo extends Pieza {
  /** El nombre del módulo dentro de su hoja (`1`, `torre-redonda`…). */
  readonly nombre: string;
}

export interface Catalogo {
  /** Los módulos de cada hoja, de menor a mayor alto de ancla. */
  readonly hojas: Readonly<Record<string, readonly Modulo[]>>;
  /** Las piezas sueltas por id (`nodo-puente-ancho`, `atlas/mina`…). */
  readonly piezas: Readonly<Record<string, Pieza>>;
}

export const RUTA_DEL_CATALOGO = 'assets/mapa/escena.json';

/** Un catálogo vacío: todo sale con su marcador de color. */
export const CATALOGO_VACIO: Catalogo = { hojas: {}, piezas: {} };
