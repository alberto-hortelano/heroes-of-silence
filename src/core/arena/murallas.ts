/**
 * Las formas de muralla de la arena: una muralla con nombre que se dibuja en la
 * página, se guarda en `data/borradores/murallas.json` y se prueba peleando.
 *
 * El juego no lee el borrador. La regla del muro es de la batalla
 * (`battle/muralla.ts`); aquí solo está el formato del archivo, su validación y
 * los ejemplos que trae la arena de salida.
 */

import { espejo, FORMA_DEL_TABLERO, isInside, ULTIMA_FILA } from '../battle/board.js';
import {
  cierra,
  hayMuralla,
  type MurallaDeBatalla,
  type PuertaDeMuralla,
  reglaDeLaMuralla,
  validarMuralla,
} from '../battle/muralla.js';
import type { Hex } from '../types.js';
import { lista, revisarLista, texto, todasValidas } from '../validar.js';

export interface FormaDeMuralla {
  readonly nombre: string;
  readonly muralla: MurallaDeBatalla;
}

/** Lo más largo que se acepta de un nombre: es una etiqueta de botón, no una nota. */
export const NOMBRE_MAXIMO_DE_FORMA = 40;

/**
 * Los hexes de la columna `col`, de la fila `desde` a la `hasta` (por defecto,
 * entera), los que existen: la 11 solo está en las filas pares.
 */
export function columna(col: number, desde = 0, hasta = ULTIMA_FILA): Hex[] {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => ({
    col,
    row: desde + i,
  })).filter(isInside);
}

/** La columna del arco del semicírculo, fila a fila: la 4 es la del hueco de la puerta. */
const ARCO: readonly number[] = [8, 7, 7, 6, 6, 6, 7, 7, 8];

/** Los muros y las puertas de una forma, sin su nombre ni su material. */
interface Trazado {
  readonly muros: readonly Hex[];
  readonly puertas: readonly PuertaDeMuralla[];
}

/**
 * La base de quien defiende (06-11-2026, la dibujó el usuario en la arena y la
 * guardó como «Base derecha»): pegada al borde de la derecha, la columna 8 de la
 * fila 1 a la 7 con las esquinas de las filas 0 y 8 en la 9, y la puerta en el
 * hueco de la fila 4, entre (8,4) y (9,4). Deja dentro 21 casillas, las de la
 * salida del defensor. Es la de la ciudad del mapa (`data/sitios.json`, «base-derecha»),
 * copiada como las demás: se editan por separado.
 */
const BASE_DERECHA: Trazado = {
  muros: [
    { col: 9, row: 0 },
    { col: 8, row: 1 },
    { col: 8, row: 2 },
    { col: 8, row: 3 },
    { col: 8, row: 5 },
    { col: 8, row: 6 },
    { col: 8, row: 7 },
    { col: 9, row: 8 },
  ],
  puertas: [{ a: { col: 8, row: 4 }, b: { col: 9, row: 4 } }],
};

/**
 * `t` reflejado de izquierda a derecha (`espejo`): la puerta cambia sus dos casillas
 * de papel, porque `b` va siempre al este de `a`.
 */
function enEspejo(t: Trazado): Trazado {
  return {
    muros: t.muros.map(espejo),
    puertas: t.puertas.map((p) => ({ a: espejo(p.b), b: espejo(p.a) })),
  };
}

/**
 * Las que trae la arena de salida. **No se guardan ni se borran**: son de la
 * página, y una con el mismo nombre en el borrador sería otra forma con un
 * nombre que ya dice algo distinto.
 *
 * Cada una cierra o no a propósito, y en odd-r eso engaña —una diagonal de
 * hexes no siempre sella—, así que lo dice su test (`muralla-de-batalla.test.ts`):
 *
 * - **Línea recta**: la columna 7 entera. Cierra: el atacante que camina no
 *   llega a nadie; solo el volador y el tirador.
 * - **Línea con puerta**: la misma con un hueco en (7,4) y la puerta entre
 *   (7,4) y (8,4): cerrada no la cruza nadie; abierta, cualquiera. La puerta va
 *   al este del hueco porque en odd-r a (7,4) se llega por las diagonales desde
 *   (6,3) y (6,5): al oeste dejaría rendija, al este no (ampliación 4).
 * - **Semicírculo**: un arco de las columnas 6 a 8 alrededor del defensor, con
 *   un hueco en (6,4) y la puerta entre (6,4) y (7,4).
 * - **En L**: la columna 7 de la fila 0 a la 5 y la fila 5 de la columna 3 a la
 *   6. Abierta por abajo: el atacante tiene que rodearla.
 * - **Muralla gruesa**: las columnas 6 y 7 enteras, con un pasillo de dos
 *   casillas en la fila 4 y la puerta en medio, entre (6,4) y (7,4). De muro a
 *   muro se anda por arriba (ampliación 2: «prueba con murallas de más de una
 *   casilla de grosor»).
 * - **Semicírculo grueso**: el semicírculo con una casilla más de fondo hacia
 *   dentro en cada fila, y el pasillo y la puerta como en la gruesa.
 * - **Base derecha** (`BASE_DERECHA`): la muralla por defecto, la de la ciudad del
 *   mapa. Cierra la salida del defensor.
 * - **Base izquierda**: su espejo, cerrando la salida del atacante: como dentro es lo
 *   que queda más cerca de la salida de la derecha, el atacante sale de su base por
 *   la escalera y la puerta la abre y la cierra la derecha.
 */
export const FORMAS_DE_EJEMPLO: readonly FormaDeMuralla[] = Object.freeze(
  [
    { nombre: 'Línea recta', muros: columna(7), puertas: [] },
    {
      nombre: 'Línea con puerta',
      muros: columna(7).filter((h) => h.row !== 4),
      puertas: [{ a: { col: 7, row: 4 }, b: { col: 8, row: 4 } }],
    },
    {
      nombre: 'Semicírculo',
      muros: [
        { col: 8, row: 0 },
        { col: 7, row: 1 },
        { col: 7, row: 2 },
        { col: 6, row: 3 },
        { col: 6, row: 5 },
        { col: 7, row: 6 },
        { col: 7, row: 7 },
        { col: 8, row: 8 },
      ],
      puertas: [{ a: { col: 6, row: 4 }, b: { col: 7, row: 4 } }],
    },
    {
      nombre: 'En L',
      muros: [
        ...columna(7, 0, 5),
        { col: 3, row: 5 },
        { col: 4, row: 5 },
        { col: 5, row: 5 },
        { col: 6, row: 5 },
      ],
      puertas: [],
    },
    {
      nombre: 'Muralla gruesa',
      muros: [...columna(6), ...columna(7)].filter((h) => h.row !== 4),
      puertas: [{ a: { col: 6, row: 4 }, b: { col: 7, row: 4 } }],
    },
    {
      nombre: 'Semicírculo grueso',
      muros: ARCO.flatMap((col, row) =>
        row === 4
          ? []
          : [
              { col, row },
              { col: col + 1, row },
            ],
      ),
      puertas: [{ a: { col: 6, row: 4 }, b: { col: 7, row: 4 } }],
    },
    { nombre: 'Base derecha', ...BASE_DERECHA },
    { nombre: 'Base izquierda', ...enEspejo(BASE_DERECHA) },
  ].map(({ nombre, muros, puertas }) =>
    // Las de la arena, de piedra: la madera es la del pueblo (`data/sitios.json`).
    Object.freeze({ nombre, muralla: validarMuralla({ muros, puertas, material: 'piedra' }) }),
  ),
);

/** ¿Es el nombre de una forma de ejemplo? Sin mirar mayúsculas ni espacios de los bordes. */
export function esFormaDeEjemplo(nombre: string): boolean {
  const n = nombre.trim().toLocaleLowerCase('es');
  return FORMAS_DE_EJEMPLO.some((f) => f.nombre.toLocaleLowerCase('es') === n);
}

/** Los campos de una forma: lo demás se rechaza diciéndolo. */
const CAMPOS_DE_FORMA: readonly string[] = ['nombre', 'muralla'];

/** Una forma del archivo, o excepción con lo que no se entiende. */
export function validarFormaDeMuralla(valor: unknown): FormaDeMuralla {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error('una forma de muralla es { nombre, muralla }');
  }
  const o = valor as Record<string, unknown>;
  const ajeno = Object.keys(o).find((k) => !CAMPOS_DE_FORMA.includes(k));
  if (ajeno !== undefined) {
    throw new Error(`la forma no entiende «${ajeno}»; lleva ${CAMPOS_DE_FORMA.join(' y ')}`);
  }
  const nombre = texto(o.nombre, 'el nombre', 'la forma de muralla').trim();
  if (nombre.length > NOMBRE_MAXIMO_DE_FORMA) {
    throw new Error(`el nombre «${nombre}» pasa de ${NOMBRE_MAXIMO_DE_FORMA} letras: acórtalo`);
  }
  if (esFormaDeEjemplo(nombre)) {
    throw new Error(`«${nombre}» es una forma de ejemplo: guárdala con otro nombre`);
  }
  let muralla: MurallaDeBatalla;
  try {
    muralla = validarMuralla(o.muralla);
  } catch (err) {
    throw new Error(`la forma «${nombre}»: ${err instanceof Error ? err.message : String(err)}`);
  }
  return Object.freeze({ nombre, muralla });
}

/**
 * La regla de la muralla dicha para quien la dibuja, con los bandos de la arena
 * (la izquierda ataca). La leen la ayuda del editor y el `_comment` del
 * borrador. La regla de la batalla es la de `battle/muralla.ts`, dicha allí una vez
 * (`reglaDeLaMuralla`, la misma que lee el agente); aquí solo lo del editor: dónde
 * va la puerta y qué es dentro y fuera.
 */
export const REGLA_DE_LA_MURALLA = [
  reglaDeLaMuralla({
    atacante: 'la izquierda (ataca)',
    defensor: 'la derecha (defiende)',
    ponerEscalera: 'ponerla',
    subir: 'subir',
    abrir: 'la abre',
    cerrar: 'la cierra',
  }),
  'Dentro es el suelo que queda más cerca andando de la salida de la derecha que de la de la izquierda, sin cruzar muro ni puerta (un empate, o un hueco al que no se llega, es dentro); fuera, el resto. Vale igual si la forma no cierra: lo de delante de la curva es fuera.',
  'La puerta no es una casilla: va entre dos vecinas de la misma fila (se pone pulsando la de la izquierda), las dos se pisan y la puerta solo corta el paso de una a otra. Dentro y fuera se cuentan con las puertas cerradas; en odd-r una puerta puede dejar rendija por las diagonales, y entonces la forma no cierra.',
].join(' ');

/**
 * Lo que la forma `m` hace con dentro y fuera (`cierra`, `ladoDeLaMuralla`), dicho para
 * quien la dibuja: la rejilla del editor sombrea lo de fuera.
 */
export function ladosDeLaForma(m: MurallaDeBatalla): string {
  if (!hayMuralla(m)) return 'Sin muralla no hay dentro ni fuera.';
  const lados =
    'Lo rayado es fuera, lo que queda más cerca andando de la salida de la izquierda: de lo alto solo se baja a lo que no está rayado, y la derecha solo sube desde ahí.';
  return cierra(m)
    ? `Esta forma cierra. ${lados}`
    : `Esta forma no cierra: la izquierda puede rodearla andando${m.puertas.length > 0 ? ', aun con las puertas cerradas' : ''}. ${lados}`;
}

/** Dónde viven las formas de muralla, relativo a la raíz del repo. */
export const RUTA_DE_MURALLAS = 'data/borradores/murallas.json';

export const COMENTARIO_DEL_BORRADOR_DE_MURALLAS = `BORRADOR de la arena (/arena/, pnpm arena): formas de muralla para probar en la batalla. Lo escribe la página al guardar o borrar una forma y lo valida validarFormaDeMuralla (src/core/arena-murallas.ts); una forma que no valida se conserva tal cual. El juego NO lo lee. Cada muro es un hex {col, row} en la rejilla de batalla (${FORMA_DEL_TABLERO}); cada puerta, {a, b}: dos hexes vecinos de la misma fila, b justo al este de a. ${REGLA_DE_LA_MURALLA}`;

/** Una forma del archivo que no pasa la regla: se cuenta por qué y se guarda tal cual. */
export interface FormaSinValidar {
  readonly nombre: string | null;
  readonly motivo: string;
  readonly crudo: unknown;
}

function listaDelBorrador(valor: unknown): readonly unknown[] {
  if (typeof valor !== 'object' || valor === null || !('formas' in valor)) {
    throw new Error('el borrador de murallas tiene que ser { formas: [...] }');
  }
  return lista((valor as { formas: unknown }).formas, 'formas', 'el borrador de murallas');
}

/**
 * El archivo forma a forma: las que valen y las que no, cada una con su motivo,
 * con la regla de las listas de la arena (`revisarLista`): una forma editada a
 * mano que no vale no tira las demás. Lanza solo si el archivo no tiene la
 * forma `{ formas: [...] }`.
 */
export function revisarBorradorDeMurallas(valor: unknown): {
  readonly validas: readonly FormaDeMuralla[];
  readonly invalidas: readonly FormaSinValidar[];
} {
  const { validas, invalidas } = revisarLista(listaDelBorrador(valor), validarFormaDeMuralla, {
    campo: 'nombre',
    clave: (f) => f.nombre,
    quien: (nombre) => `la forma «${nombre}»`,
    donde: 'el borrador',
  });
  return {
    validas,
    invalidas: invalidas.map(({ clave, motivo, crudo }) => ({
      nombre: clave,
      motivo,
      crudo,
    })),
  };
}

/** El archivo entero, todo válido y sin dos formas con el mismo nombre. */
export function validarBorradorDeMurallas(valor: unknown): readonly FormaDeMuralla[] {
  return todasValidas(revisarBorradorDeMurallas(valor));
}
