/**
 * Las puertas de lo que se entra por delante (#188): por dónde llega el camino a
 * una mina o a un pueblo. Es un hecho, aquí: lo leen la búsqueda de los caminos
 * (`Busqueda`, `vestir.ts`), quien coloca los objetos (`colocarPar`,
 * `generate.ts`) y quien mide lo pintado (`sendasPorObjeto`, en el escenógrafo).
 *
 * La cámara mira desde el sur y la puerta del sprite está en su pie, así que
 * todo lleva la de **debajo**. **La mina lleva además la de la derecha** (#230):
 * la vagoneta y los raíles de `mapa/atlas/mina.webp` salen al este, y con una
 * sola puerta el ramal de una mina con el radio al lado salía por debajo y daba
 * la vuelta para llegar a él (marca del usuario en s26000 (23,4): «para poder
 * usar el que menos forzado quede»). El pueblo sigue con una.
 *
 * **La ciudad ya no está aquí** (la ciudad amurallada, vuelta 3, fase 2): sus
 * puertas son las de su recinto (`PUERTAS_DE_LA_CIUDAD`, `recinto.ts`), y esas
 * sí las mira el juego: su muralla no se pisa.
 *
 * El juego no mira estas puertas: un héroe entra en una mina por donde llegue.
 * Son del trazado y de la escena.
 */
import type { Point } from '../types.js';

/** Lo que se entra por su puerta. */
export type ConPuerta = 'mine' | 'village';

/** El rumbo de cada puerta, desde el objeto: la primera es la de debajo. */
const RUMBOS: Readonly<Record<ConPuerta, readonly (readonly [number, number])[]>> = {
  village: [[0, 1]],
  mine: [
    [0, 1],
    [1, 0],
  ],
};

/** Las ocho vecinas en el sentido del reloj desde el norte: su posición es el octante. */
const OCTANTES: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function octante(dx: number, dy: number): number {
  const k = OCTANTES.findIndex(([x, y]) => x === dx && y === dy);
  if (k < 0) throw new Error(`(${dx}, ${dy}) no es una vecina: una puerta se mira desde al lado`);
  return k;
}

/**
 * Cuántos rodeos cuesta pasar entre el objeto y su vecina en `(dx, dy)`, según lo
 * que gira desde la puerta más cercana: por la puerta, 0; a 45° (la diagonal de
 * delante), 1; a 90° (de lado), 3; más (por detrás), 4. Con una puerta abajo es
 * la cuenta de #188; con la de la derecha de la mina, el noreste es la diagonal
 * de delante de esa puerta, el norte un costado y solo el noroeste la espalda.
 */
const RODEOS_POR_GIRO = [0, 1, 3, 4, 4] as const;

/** Lo que cuesta, en rodeos, entrar en `kind` desde su vecina en `(dx, dy)` (`RODEOS_POR_GIRO`). */
export function rodeosParaEntrar(kind: ConPuerta, dx: number, dy: number): number {
  const v = octante(dx, dy);
  let mejor = 4;
  for (const [px, py] of RUMBOS[kind]) {
    const d = Math.abs(v - octante(px, py));
    mejor = Math.min(mejor, RODEOS_POR_GIRO[Math.min(d, 8 - d)] as number);
  }
  return mejor;
}

/** Los rumbos de las puertas de `kind`, la de debajo primero. */
export function rumbosDePuerta(kind: ConPuerta): readonly (readonly [number, number])[] {
  return RUMBOS[kind];
}

/**
 * Las puertas de `kind` en `at` que caen dentro de un mapa de `W × H`, en el
 * orden de `rumbosDePuerta`. Si ninguna cae dentro, vacío: se llega por donde
 * se pueda.
 */
export function puertasDe(kind: ConPuerta, at: Point, W: number, H: number): Point[] {
  return RUMBOS[kind]
    .map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
    .filter((p) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < H);
}
