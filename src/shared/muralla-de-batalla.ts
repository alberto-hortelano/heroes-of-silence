/**
 * La muralla del tablero de batalla como arte (06-11-2026, «falta arte para el
 * muro en combate, lo que hay ahora son placeholders, también para la
 * escalera»): las medidas de cada pieza y sus nombres, que leen el lienzo
 * (`render/batalla/arte-de-la-muralla.ts`, `render/batalla.ts`) y el taller (las guías
 * que se le dan a Codex y la derivación, `tools/taller/muralla-de-batalla.ts`).
 * Vive en `shared` por eso: el núcleo no pinta.
 *
 * Todo va en **pasos**, la unidad del tablero (`render/proyeccion.ts`). Un muro
 * es una columna: el hex de su casilla subido `ALTO_DE_MURALLA`, con sus dos
 * caras de delante y su tapa, donde se pisa. El arte no es un sprite por
 * columna —el tablero cambia de elevación de cámara (25° a 35°) y el hexágono
 * se aplasta distinto—, sino **materiales que se llevan a su sitio**:
 *
 * - la **cara** (`cara-<material>`): el alzado de un lienzo de muro, de frente
 *   y sin perspectiva, `RODAJAS_DE_LA_CARA` caras de hex de ancho
 *   (`LADO_DEL_HEX` cada una) y `ALTO_DE_MURALLA` de alto, con su remate encima
 *   (almenas o puntas de estaca, `REMATE_DEL_MURO`). Cada cara de una columna
 *   lleva una rodaja, puesta con una afín sobre su paralelogramo; el remate, solo
 *   en las caras que dan fuera de la muralla;
 * - la **tapa** (`tapa-<material>`): el adarve visto desde arriba, una textura
 *   repetible que se pinta dentro del hexágono de lo alto, en el mismo encaje
 *   para todo el tablero (las tapas vecinas casan);
 * - la **portada** de una puerta (`portada-<material>-<abierta|cerrada>`): la
 *   fachada de frente de `PORTADA`, con el hueco del arco; abierta, el hueco se
 *   recorta al pintar (se ve quien pasa por debajo);
 * - la **escalera** (`escalera`): de madera, de frente y derecha, que se tiende
 *   con una afín del pie a lo alto del muro.
 *
 * Sin la imagen, cada pieza pinta su marcador de siempre (`ACABADO_DEL_MURO`).
 */
import type { MaterialDeMuralla } from '../core/battle/types.js';
/**
 * Lo que mide una columna de la muralla, en pasos: la figura que está arriba se
 * pinta así de alta. Era 0,42 —algo menos de media figura, para que la de detrás
 * asomara la cabeza— y el usuario, al probarlo, la quiso «unas 4 veces más»
 * alta: la muralla tapa de verdad a quien pasa detrás (`piezasEnOrden`) y lo que
 * no cabe encima de la fila de atrás lo pide el lienzo (`alzadoDeLaMuralla`).
 */
export const ALTO_DE_MURALLA = 4 * 0.42;

/** El lado del hexágono del tablero (su radio), en pasos: lo que mide de largo cada cara de una columna. */
export const LADO_DEL_HEX = 1 / Math.sqrt(3);

/**
 * Lo que sube el remate de una cara por encima de lo alto de su columna, en
 * pasos: las almenas de la piedra y las puntas de las estacas de la madera. No
 * se pisa ni tapa a nadie para las reglas: es acabado.
 */
export const REMATE_DEL_MURO = 0.25;

/** Cuántas caras de hex lleva de ancho la imagen de una cara (`cara-<material>`). */
export const RODAJAS_DE_LA_CARA = 5;

/**
 * La portada de una puerta, en pasos: una fachada de cara a la cámara levantada
 * sobre el lado de sus dos casillas, centrada en él, con el arco tan ancho que
 * quien está en cualquiera de las dos pasa entero por debajo (su figura mide
 * unos 0,8 de ancho y su centro cae a 0,5 del lado). Las jambas acaban antes de
 * la figura de la casilla siguiente (a 1,5 del lado, desde 1,1).
 */
export const PORTADA = {
  /** Del lado a la cara de fuera de cada jamba. */
  mitad: 1.03,
  /** Del lado al borde del hueco. */
  hueco: 0.88,
  /** Lo alto del hueco, del suelo a la clave del arco: pasa la figura de una casilla (0,95). */
  arco: 1.2,
  /** Lo que baja el arco de la clave a sus arranques. */
  flecha: 0.22,
  /** El fondo de la fachada visto desde arriba: la tapa. */
  fondo: 0.3,
  /** Lo ancho de cada hoja abierta, abatida contra su jamba, del borde del hueco hacia dentro. */
  hojaAbierta: 0.1,
} as const;

/**
 * La escalera, en pasos: de un larguero a otro (`ancho`) y lo que se le pide de
 * largo a su imagen frente a ese ancho (`largo`, la guía). Al tenderla del pie a
 * lo alto se estira a lo que mida el tramo; el ancho se queda.
 */
export const ESCALERA = { ancho: 0.34, largo: 2.2 } as const;

/** La carpeta del arte de la muralla de batalla, dentro de `assets/`. */
export const CARPETA_DE_LA_MURALLA = 'batalla/muralla';

/** Las piezas de un material: su cara, su tapa y la portada abierta y cerrada. */
export interface PiezasDeUnMaterial {
  readonly cara: string;
  readonly tapa: string;
  readonly abierta: string;
  readonly cerrada: string;
}

/** El nombre de cada pieza (sin extensión), por material. */
export const PIEZAS_DE_LA_MURALLA: Readonly<Record<MaterialDeMuralla, PiezasDeUnMaterial>> = {
  piedra: {
    cara: 'cara-piedra',
    tapa: 'tapa-piedra',
    abierta: 'portada-piedra-abierta',
    cerrada: 'portada-piedra-cerrada',
  },
  madera: {
    cara: 'cara-madera',
    tapa: 'tapa-madera',
    abierta: 'portada-madera-abierta',
    cerrada: 'portada-madera-cerrada',
  },
};

/** La escalera, la misma para los dos materiales: se trae, no es de la muralla. */
export const PIEZA_DE_LA_ESCALERA = 'escalera';

/** Todas las piezas, en un orden fijo: lo que se carga y lo que se deriva. */
export const TODAS_LAS_PIEZAS_DE_LA_MURALLA: readonly string[] = [
  ...Object.values(PIEZAS_DE_LA_MURALLA).flatMap((p) => [p.cara, p.tapa, p.abierta, p.cerrada]),
  PIEZA_DE_LA_ESCALERA,
];

/**
 * Lo que se sabe de cada pieza pintada, derivado de su imagen por el taller
 * (`assets/batalla/muralla/indice.json`, `escribirIndiceDeLaMuralla`): su caja
 * de lo opaco y, en una cara, la fila donde acaba el remate y empieza el lienzo
 * entero (`cuerpo`). Una pieza sin imagen no está: se pinta su marcador.
 */
export interface MedidaDePieza {
  /** El tamaño de la imagen, en píxeles. */
  readonly ancho: number;
  readonly alto: number;
  /** Lo opaco de la imagen: `[x0, y0, x1, y1]`, en píxeles, con `x1` e `y1` excluidos. */
  readonly caja: readonly [number, number, number, number];
  /** En una cara: la primera fila del lienzo de muro (lo de encima es el remate). */
  readonly cuerpo?: number;
}

export type IndiceDeLaMuralla = Readonly<Record<string, MedidaDePieza>>;

/**
 * El índice tal como llega del disco, juzgado: cada clave es una pieza que
 * existe y cada medida trae su tamaño, su caja de cuatro enteros dentro de él y,
 * en una cara, su cuerpo dentro de la caja. Lanza diciendo cuál y por qué: un
 * índice tocado a mano no se pinta a medias.
 */
export function leerIndiceDeLaMuralla(json: unknown): IndiceDeLaMuralla {
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    throw new Error('el índice de la muralla de batalla no es un objeto');
  const caras = new Set(Object.values(PIEZAS_DE_LA_MURALLA).map((p) => p.cara));
  const entero = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
  const indice: Record<string, MedidaDePieza> = {};
  for (const [pieza, m] of Object.entries(json as Record<string, unknown>)) {
    const mal = (por: string): never => {
      throw new Error(`el índice de la muralla de batalla: «${pieza}» ${por}`);
    };
    if (!TODAS_LAS_PIEZAS_DE_LA_MURALLA.includes(pieza)) mal('no es ninguna pieza');
    const { ancho, alto, caja, cuerpo } = (m ?? {}) as Record<string, unknown>;
    if (!entero(ancho) || !entero(alto)) return mal('no trae su ancho y su alto');
    if (!Array.isArray(caja) || caja.length !== 4 || !caja.every(entero))
      return mal('no trae una caja de cuatro enteros');
    const [x0, y0, x1, y1] = caja as [number, number, number, number];
    if (!(x0 < x1 && y0 < y1 && x1 <= ancho && y1 <= alto))
      mal(`tiene una caja que no cabe: ${caja.join(', ')}`);
    if (caras.has(pieza) !== (cuerpo !== undefined))
      mal('lleva cuerpo y no es una cara, o al revés');
    if (cuerpo !== undefined && !(entero(cuerpo) && cuerpo >= y0 && cuerpo < y1))
      mal('tiene el cuerpo fuera de su caja');
    indice[pieza] = {
      ancho,
      alto,
      caja: [x0, y0, x1, y1],
      ...(cuerpo === undefined ? {} : { cuerpo: cuerpo as number }),
    };
  }
  return indice;
}
