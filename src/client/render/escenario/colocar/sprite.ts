/**
 * Una pieza de la escena (`Sprite`): una imagen apoyada por su ancla en `(x, y)`,
 * en casillas, con lo que dice qué es, cómo se mide y en qué orden se pinta.
 *
 * Va aparte de la escena entera (`escena.ts`) y por debajo de todo el
 * escenógrafo: la leen el índice de obstáculos (`pasillo.ts`), los guardias de lo
 * pintado y el pintor. Con la escena en el mismo fichero, el tipo de una pieza
 * tiraba de los del relieve, las sendas y los recintos, que tiran del índice de
 * obstáculos, que tira de él: un ciclo entre carpetas. Hasta la fase C de la
 * reorganización (07-11-2026) vivía en `colocar.ts`.
 */
import type { MapObject } from '@core/map/tipos.js';
import type { DeNodo } from '../puestos.js';
import type { PapelEnElRecinto } from '../recinto.js';

/** Qué puede ser un sprite: de aquí salen `Sprite['clase']` y lo que valida una marca de fallo. */
export const CLASES_DE_SPRITE = [
  'masa',
  'muro',
  'pared',
  'cubierta',
  'roca',
  'orilla',
  'objeto',
  'nube',
] as const;

/** Un sprite de la escena: una imagen apoyada por su ancla en `(x, y)`, en casillas. */
export interface Sprite {
  /** Ruta relativa a `assets/mapa/`, o null si el arte aún no existe (se pinta un marcador). */
  readonly src: string | null;
  /** Tamaño nativo y ancla de la imagen, en sus píxeles. */
  readonly nw: number;
  readonly nh: number;
  readonly ax: number;
  readonly ay: number;
  readonly x: number;
  readonly y: number;
  /** Alto en pantalla, en casillas. */
  readonly alto: number;
  /**
   * Ancho en pantalla, en casillas, si no es el de su proporción: una pieza del
   * relieve de caída 2 estirada en alto hasta una caída 3 (decisión del usuario,
   * 07-10-2026). Sin él, `alto × nw / nh`.
   */
  readonly ancho?: number;
  /** Qué es: para medir y para el marcador. */
  readonly clase: (typeof CLASES_DE_SPRITE)[number];
  readonly color: string;
  /** Se pinta en su orden por la y (0) o encima de todo (1, las nubes). */
  readonly capa: 0 | 1;
  /** Sombra difusa al pie. */
  readonly sombra: boolean;
  /** Un filtro de canvas para entonar el módulo con el resto (`brightness(0.8)`). */
  readonly tono?: string;
  /**
   * El objeto del mapa que pinta, si pinta uno. Lo que cambia en la partida (un
   * monstruo vencido, un cofre recogido) no se hornea en la escena:
   * quien la pinte lo deja fuera con `pintarEscena({ objeto })` y lo pinta él.
   */
  readonly objeto?: { readonly id: string; readonly kind: MapObject['kind'] };
  /**
   * Si es la pieza de un puente, el id de su `Puente`. El de un nodo lleva
   * además su `objeto`; el de una ciudad-puente, no: el objeto es la ciudad,
   * que se pinta en su orilla.
   */
  readonly puente?: string;
  /** Si la imagen es una hoja, el trozo que se pinta: `[sx, sy, sw, sh]`. */
  readonly recorte?: readonly [number, number, number, number];
  /**
   * En una pieza del relieve (frontal, ladera, diagonal o bajada), la fila de
   * la casilla alta de la que cuelga. Lo que se pisa en esa fila o más al sur
   * está delante de ella aunque su pie quede más abajo (#185,
   * `delanteDeLasParedes`): el mapa no levanta lo alto.
   */
  readonly filaAlta?: number;
  /**
   * La clave del pintor, si no es su `y` (`claveDe`): lo que se pinta en su
   * sitio pero detrás de otra cosa (`ordenadoEn`), la pared que pasa por
   * detrás de una ciudad de su pie. Su sitio (`y`, `ay`) no se toca: los
   * guardias que leen dónde está una pieza por su pie (`celdasMalCubiertas`,
   * `juntasColocadas`) siguen leyéndolo (#222). Antes se movían el pie y el
   * ancla, y por eso solo la diagonal, que se lee por sus filos, podía.
   */
  readonly clave?: number;
  /**
   * Una cumbre de #204 o el pico que sube `unoQueDomine`: la pieza grande de su
   * cordillera, que no se encoge por lo que se pisa de al lado
   * (`topeDeLoPisable`). Lo que tape por los lados es una medida
   * (`informe.cumbresSobreLoPisable`).
   */
  readonly cumbre?: true;
  /**
   * El árbol de una casilla de bosque que va en la reserva de un objeto sin
   * tapar su imagen ni su camino (`arbolEnLaReserva`): el único volumen con el
   * pie ahí, como la pared de #221. Lo que vigila la reserva (#151) lo mide
   * contra la caja del objeto y no contra su disco.
   */
  readonly enLaReserva?: true;
  /**
   * Una pieza de un nodo que se pinta según lo que se sabe de él (puesto
   * fronterizo, fase 4; `seVeConSuNodo`): su hito (`HITOS`, `TABLILLAS`), con
   * `cuando: 'neutral'`, mientras no tiene dueño, y cada obra de su puesto
   * (`obraDelPuesto`), con su mejora, cuando la tiene. La escena se compone una
   * vez y el dueño la cambia en la partida: el mapa elige en cada fotograma.
   */
  readonly deNodo?: DeNodo;
  /**
   * Si va al suelo (`true`) o a los volúmenes (`false`) sea cual sea su alto
   * (`esVolumen`). Las parcelas de la labranza (`labranza.ts`) miden ~0,8 de
   * alto y son suelo: tapaban a las figuras que las pisaban. Las casas sueltas
   * tapan aunque midan menos que el umbral, como un árbol (decisión del
   * usuario, 20-10-2026): una figura puede quedar detrás de una casa.
   */
  readonly plano?: boolean;
  /**
   * Qué es en el recinto de una ciudad, si es suyo (`recinto.ts`): lo pone la
   * regla y lo leen los guardias, en vez de deducirlo de su hoja o su sombra.
   */
  readonly recinto?: PapelEnElRecinto;
}
