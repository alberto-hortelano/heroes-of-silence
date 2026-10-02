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
     * La de la sombra por silueta (`proyeccionDeSombra`): es uniforme, no un
     * fundido con el centro en `opacidad`, así que necesita más para leerse igual.
     */
    opacidadSilueta: 0.38,
  },
} as const;

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
 * La sombra de una figura de `altura` píxeles. No admite la orientación del
 * sprite a propósito: si la tuviera, la sombra de un defensor espejado se
 * invertiría y la luz vendría de dos sitios.
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
export function proyeccionDeSombra(): {
  a: number;
  b: number;
  c: number;
  d: number;
  opacidad: number;
} {
  const s = sombraDeFigura(1);
  return { a: 1, b: 0, c: -s.x, d: -s.y, opacidad: ARTE.luz.opacidadSilueta };
}

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
