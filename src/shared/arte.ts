/**
 * El contrato visual que comparten el mapa, la batalla y —en la fase 6— el
 * taller de imágenes: la cámara a 25° y una sola luz.
 *
 * Rescatado de `src/shared/rpg-art.ts` de la rama `archivo/gpt-rpg`, y
 * recortado a lo que se pinta hoy. Los prompts de generación se quedaron allí
 * porque no tenían llamante (vuelven con el taller), y `characterMotion`
 * obligaba a traerse `creation-poses.json` para nada.
 *
 * Vive en `shared` y no en `core` porque no es una regla del juego: el motor no
 * sabe a qué ángulo se mira el tablero, y no tiene por qué.
 */
import { BOARD_HEIGHT } from '../core/battle/board.js';
export const ARTE = {
  /** Proyección ortográfica, 25° hacia abajo: las figuras de Y Bot se renderizaron así. */
  camara: { elevacionGrados: 25 },
  luz: {
    // Coordenadas de pantalla: x a la derecha, y hacia abajo.
    // Luz desde la izquierda y del lado de la cámara (decisión del usuario,
    // 02-10-2026): la sombra cae a la derecha y hacia el fondo, unos 31° en
    // pantalla. Con la sombra hacia la cámara la cara visible quedaba en penumbra.
    direccionSombra: { x: 1, y: -0.6 },
    longitudPorAltura: 0.42,
    opacidad: 0.18,
    /**
     * La de la sombra por silueta (`PROYECCION_DE_SOMBRA`): es uniforme, no un
     * fundido con el centro en `opacidad`, así que necesita más para leerse igual.
     */
    opacidadSilueta: 0.38,
    /**
     * El color de toda sombra, en componentes RGB: la silueta, el óvalo de quien
     * no tiene arte y el visor del taller. Uno solo, o la sombra de un Y Bot y la
     * de un marcador saldrían de dos tintas distintas.
     */
    colorSombra: [23, 31, 28],
  },
} as const;

/** El color de la sombra (`ARTE.luz.colorSombra`) como CSS, con su opacidad. */
export function colorDeSombra(alfa = 1): string {
  const [r, g, b] = ARTE.luz.colorSombra;
  return alfa === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * Cómo es una hoja de figura del taller (`tools/taller`): la rejilla, la cámara
 * con la que sprite-forge renderiza el maniquí de referencia y dónde caen los
 * pies. Lo leen el renderizador de poses, el que empaqueta lo que devuelve Codex
 * y el que deriva el JSON de cada hoja: una sola declaración para los tres.
 */
export const FIGURA = {
  celda: 256,
  columnas: 7,
  camara: {
    elevacionGrados: ARTE.camara.elevacionGrados,
    /** Alto del encuadre ortográfico en metros: un humanoide de 1,8 m con margen. */
    ortho: 2.8,
    /** De las 8 direcciones de sprite-forge, la que mira a la derecha y al frente. */
    direccion: 2,
  },
  /** Altura de un adulto dentro de su celda, en píxeles (la dirección artística pide ~160). */
  alturaAdulto: 160,
  /** La línea de los pies dentro de la celda. */
  base: 228,
} as const;

/** Cuánto se aplasta el suelo visto a 25°: `sin 25°`. */
export const COMPRESION_SUELO = Math.sin((ARTE.camara.elevacionGrados * Math.PI) / 180);

/**
 * La escala del tablero de combate, que comparte la base caminable: la leen
 * `render/proyeccion.ts` (el combate) y `shared/base.ts` (la franja de la base y
 * las guías del taller). Aquí y no en `proyeccion.ts` porque el taller no importa
 * del cliente; si las dos cuentas copiaran el número, un día dejarían de casar.
 */
/** Lo que separa dos filas de hexes de la rejilla, en pasos sin aplastar. */
export const ALTO_DE_FILA = Math.sqrt(3) / 2;
/** Lo que queda el suelo bajo la última fila hasta el borde del lienzo, en pasos de pantalla. */
export const MARGEN_ABAJO = 0.35;
/** El fondo de la rejilla de combate, en pasos: las ocho separaciones entre sus nueve filas. */
export const FONDO_DEL_COMBATE = (BOARD_HEIGHT - 1) * ALTO_DE_FILA;

/** Un punto del plano del suelo (el tablero de combate o el escenario de la base), en pasos. */
export interface Plano {
  readonly x: number;
  readonly y: number;
}

/**
 * Las ocho miradas de una figura, en el sentido contrario a las agujas desde el
 * este: las de la regla (`client/direccion.ts`) y las que escribe
 * `data/bases/<f>.json` para cada vecino.
 */
export const MIRADAS = ['E', 'NE', 'N', 'NO', 'O', 'SO', 'S', 'SE'] as const;
export type Mirada = (typeof MIRADAS)[number];

/**
 * La sombra de una figura de `altura` píxeles. No admite hacia dónde mira la
 * figura a propósito: la luz es una para todas, y si dependiera de la mirada
 * vendría de dos sitios.
 */
export function sombraDeFigura(altura: number): { x: number; y: number; opacidad: number } {
  const { luz } = ARTE;
  const largo = altura * luz.longitudPorAltura;
  const modulo = Math.hypot(luz.direccionSombra.x, luz.direccionSombra.y);
  return {
    x: (largo * luz.direccionSombra.x) / modulo,
    y: (largo * luz.direccionSombra.y) / modulo,
    opacidad: luz.opacidad,
  };
}

/**
 * El sol en el mundo del render 3D (three.js: x a la derecha, y arriba, z hacia
 * la cámara), como el vector UNITARIO hacia el que viaja la luz. No se escribe a
 * mano: sale de `ARTE.luz`, que es lo que ya pinta el juego, deshaciendo la
 * cámara a 25°. Una figura vertical de alto H mide `H·cos 25°` en pantalla y su
 * sombra tiene que medir `longitudPorAltura` veces eso; un paso `gz` hacia la
 * cámara sobre el suelo baja `gz·sen 25°` en pantalla.
 *
 * Con la sombra hacia la derecha y hacia el fondo, el sol queda a la izquierda y
 * del lado de la cámara: la cara que se ve es la iluminada.
 */
export function luzEnElMundo(): { x: number; y: number; z: number } {
  const { luz } = ARTE;
  const rad = (ARTE.camara.elevacionGrados * Math.PI) / 180;
  const modulo = Math.hypot(luz.direccionSombra.x, luz.direccionSombra.y);
  const largo = luz.longitudPorAltura * Math.cos(rad);
  const gx = (largo * luz.direccionSombra.x) / modulo;
  const gz = (largo * luz.direccionSombra.y) / modulo / Math.sin(rad);
  const n = Math.hypot(gx, 1, gz);
  return { x: gx / n, y: -1 / n, z: gz / n };
}

/**
 * La sombra de una figura como su SILUETA aplastada sobre el suelo: la afín de
 * pantalla (`ctx.transform(a, b, c, d, 0, 0)`, con el origen en los pies) que
 * lleva un punto `h` píxeles por encima de los pies a `h` veces la sombra por
 * píxel de alto. Lo que está a ras de suelo no se mueve. No depende del alto de
 * la figura ni de su orientación: la luz es una para todo.
 *
 * Supone que cada píxel del sprite está en vertical sobre la línea de los pies;
 * en un cuerpo tendido no lo está, y su sombra sale más larga de lo que es.
 */
export const PROYECCION_DE_SOMBRA: {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly opacidad: number;
} = (() => {
  const s = sombraDeFigura(1);
  return { a: 1, b: 0, c: -s.x, d: -s.y, opacidad: ARTE.luz.opacidadSilueta };
})();

/**
 * La hoja de una unidad en 8 direcciones: la celda es mayor porque el cadáver
 * cae tendido, y el encuadre crece con ella para que el adulto mida lo mismo
 * que en `FIGURA`.
 */
export const FIGURA_8D = {
  celda: 384,
  ortho: (FIGURA.camara.ortho * 384) / FIGURA.celda,
  /** La altura en metros a la que apunta la cámara: baja la figura en la celda. */
  objetivo: 0.95,
} as const;

/**
 * Los nombres de las 8 direcciones de una figura, en el orden de sprite-forge:
 * gira al maniquí `rotation.y = 2π·d/8` y la 0 mira a la cámara. Cada nombre
 * dice hacia dónde mira la figura en pantalla. Lo leen el taller —que encarga
 * cada dirección por su nombre— y el cliente, que elige la hoja de la dirección
 * en la que mira la figura (`DIRECCION_DE_HOJA`, en `render/personajes.ts`).
 *
 * Su `length` es el número de direcciones de una figura para el taller y el
 * cliente; `core` no puede importar de aquí y escribe el 8 al lado de un
 * comentario que lo ata a esta lista (`src/core/arena.ts`).
 */
export const NOMBRES_DE_DIRECCION = [
  'frente',
  'frente-derecha',
  'derecha',
  'espalda-derecha',
  'espalda',
  'espalda-izquierda',
  'izquierda',
  'frente-izquierda',
] as const;

/**
 * Cómo se reparten las acciones de una figura en las hojas que se pintan por
 * dirección, en el orden de sus filas. Es el ÚNICO sitio que lo dice: de aquí
 * leen el maniquí (`tools/art/poses.ts`, `montura.ts`), el taller (encargos,
 * empaquetado, derivado) y el cliente, que resuelve cada fila a su imagen.
 *
 *  - **A**: reposo, marcha y carga: la locomoción.
 *  - **B**: ataque, daño y muerte, juntos para que la muerte se pinte en la
 *    misma imagen que el daño del que arranca. El ataque es SIEMPRE cuerpo a
 *    cuerpo, también en quien dispara (decisión del usuario, 04-10-2026: «el
 *    granadero tendrá lanzar la granada y sable, los arqueros disparo y daga»).
 *  - **C**: el disparo, una sola fila y solo en quien dispara. Va aparte para
 *    no repintar las hojas A y B que ya estaban pintadas.
 */
export const HOJAS_DE_FIGURA = {
  a: ['idle', 'walk', 'charge'],
  b: ['attack', 'hurt', 'death'],
  c: ['shoot'],
} as const;
export type HojaDeFigura = keyof typeof HOJAS_DE_FIGURA;

/**
 * Las seis acciones de TODA figura, en el orden de las filas de su atlas (§9 de
 * `docs/art/peticiones.md`): las hojas A y B. La leen el cliente, que comprueba
 * cada atlas contra ella, y el taller, que deriva cada fila con su nombre.
 */
export const CLIPS_DE_FIGURA = [...HOJAS_DE_FIGURA.a, ...HOJAS_DE_FIGURA.b] as const;

/** Las acciones que solo tiene quien las hace: el disparo (hoja C). Sin ellas la figura vale. */
export const CLIPS_OPCIONALES = HOJAS_DE_FIGURA.c;

/** Las filas de un atlas completo, en orden: las seis de toda figura y, si dispara, `shoot`. */
export const FILAS_DEL_ATLAS = [...CLIPS_DE_FIGURA, ...CLIPS_OPCIONALES] as const;
export type ClipDeFigura = (typeof FILAS_DEL_ATLAS)[number];

const TODAS_LAS_HOJAS = Object.keys(HOJAS_DE_FIGURA) as HojaDeFigura[];
const OPCIONAL = new Set<string>(CLIPS_OPCIONALES);

/** Si la hoja `h` solo la tiene quien hace lo suyo: todos sus clips son opcionales. */
export const esHojaOpcional = (h: HojaDeFigura): boolean =>
  HOJAS_DE_FIGURA[h].every((clip) => OPCIONAL.has(clip));

/**
 * Las hojas que tiene una figura, en orden: todas las de clips obligatorios y,
 * si `dispara`, también las que solo llevan clips opcionales. Es la única
 * respuesta a «¿qué hojas se pintan, se juntan o se miden?» del maniquí, el
 * taller y sus tests: nadie escribe la letra de la hoja del disparo a mano.
 */
export function hojasDeFigura(dispara: boolean): HojaDeFigura[] {
  return TODAS_LAS_HOJAS.filter((h) => dispara || !esHojaOpcional(h));
}

/** La fila del atlas (`FILAS_DEL_ATLAS`) en la que empieza la hoja `hoja`. */
export function primeraFilaDe(hoja: HojaDeFigura): number {
  return FILAS_DEL_ATLAS.indexOf(HOJAS_DE_FIGURA[hoja][0]);
}

/**
 * La hoja en la que se pinta la fila `fila` de un atlas (`FILAS_DEL_ATLAS`) y
 * su fila dentro de esa hoja. Lanza fuera del atlas: una fila 7 no es de nadie.
 */
export function hojaDeLaFila(fila: number): { readonly hoja: HojaDeFigura; readonly fila: number } {
  const clip = Number.isInteger(fila) ? FILAS_DEL_ATLAS[fila] : undefined;
  const hoja = TODAS_LAS_HOJAS.find((h) =>
    (HOJAS_DE_FIGURA[h] as readonly string[]).includes(clip as string),
  );
  if (clip === undefined || hoja === undefined) {
    throw new Error(
      `la fila ${fila} no está en el atlas: tiene ${FILAS_DEL_ATLAS.length} (${FILAS_DEL_ATLAS.join(', ')})`,
    );
  }
  return { hoja, fila: fila - primeraFilaDe(hoja) };
}

/**
 * El juego de armas del Y Bot de quien no declara ninguno (decisión del usuario,
 * 03-10-2026): lo leen el cliente, para el cuerpo que no está en su tabla, y el
 * taller, para la unidad cuyo perfil no tiene poses en 8 direcciones.
 */
export const JUEGO_POR_DEFECTO = 'espada-escudo';
