/**
 * La escena del mapa para los tests del escenógrafo: la de la partida nueva de
 * una semilla, compuesta con el catálogo del repo (`componer`), y lo que se busca
 * en ella. Aparte del núcleo porque trae el cliente. (De `test/helpers.ts`, fase
 * T, 06-11-2026.)
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type Catalogo,
  type CatalogoEnBruto,
  catalogoValidado,
  RUTA_DEL_CATALOGO,
} from '../src/client/render/escenario/catalogo.js';
import { componer, type Escena } from '../src/client/render/escenario/colocar.js';
import type { Puente } from '../src/client/render/escenario/puentes.js';
import type { Senda } from '../src/client/render/escenario/sendas.js';
import type { GameMap } from '../src/core/map/map.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import { primeraSemillaCon } from '../tools/comun/semillas.js';

/**
 * Un puente cuyo tablero, hacia uno de sus extremos (del 60 al 90 % del
 * tablero, de un estribo al otro; `t` es ese punto en la medida de
 * `enElTablero`, de −0,5 a 0,5), se ve sobre el agua de una casilla que no es
 * la de su nodo: el caso de H2 de #157, donde pulsar el tablero decía «No hay
 * camino». Era el de (16,1) en la semilla 15 hasta que #169 cambió los mapas,
 * y en 81-120 hasta que fuera del río dejó de haber agua de frontera (QA del
 * río continuo, H3): los puentes del río van de frente sobre un río de una
 * casilla y su tablero no pasa de las orillas. En 1-300 quedaba el de la
 * ciudad-puente de la 23 (town-3, al 90 %), que el clic llevaba a la ciudad,
 * hasta que el recinto de las ciudades (vuelta 3) acortó ese puente hasta el
 * pie de la cara de su recinto; luego, el de `node-2` de la 216 (al 80 %), y
 * desde que la ciudad-puente está en tierra (fase 2), el de la ciudad-puente
 * `town-3` de la 64 (al 70 %), que lleva a su casilla del río, que se pisa: en
 * 1-500 no hay otro. El héroe nacido en su base no lo mueve: con el recinto, el
 * inicio se ponía tras los caminos y después no se colocaba nada (fusión,
 * 21-10-2026; sin el recinto, la primera era la 566). Sin minas (21-10-2026)
 * la 64 es otro mapa: en 1-2000 solo queda el `node-2` de la 1469 (al 80 %). Con
 * las ciudades en mitad de su región (05-11-2026), ninguna de 1-2000 lo tiene, y
 * la primera de 2751-3500 es la 2792 (2001-2750 no se terminó de mirar). Se
 * busca desde ella: componer cada escena cuesta ~0,3 s.
 */
export function puenteSobreElAgua(): {
  semilla: number;
  caso: { puente: Puente; sobreElAgua: [number, number]; casilla: Point; t: number };
} {
  return primeraSemillaCon(
    'un puente con el tablero sobre el agua de otra casilla',
    (s) => {
      const e = partidaDe(s).escena;
      const agua = new Set(e.agua);
      for (const puente of e.puentes) {
        const [a, b] = [puente.tablero[1], puente.tablero[2]] as [
          [number, number],
          [number, number],
        ];
        const nodo = { x: Math.floor(puente.nodo[0]), y: Math.floor(puente.nodo[1]) };
        for (const f of [0.7, 0.8, 0.9, 0.6]) {
          const sobreElAgua: [number, number] = [
            a[0] + f * (b[0] - a[0]),
            a[1] + f * (b[1] - a[1]),
          ];
          const [x, y] = sobreElAgua.map(Math.floor) as [number, number];
          if ((x !== nodo.x || y !== nodo.y) && agua.has(y * e.W + x))
            return { puente, sobreElAgua, casilla: { x, y }, t: f - 0.5 };
        }
      }
      return undefined;
    },
    2792,
    2800,
  );
}

/** El catálogo de la escena que está en el repo (`assets/mapa/escena.json`), comprobado como lo carga el juego. */
export function catalogoDelDisco(): Catalogo {
  return catalogoValidado(
    JSON.parse(
      readFileSync(join(resolve(import.meta.dirname, '..'), RUTA_DEL_CATALOGO), 'utf8'),
    ) as CatalogoEnBruto,
  );
}

/** Una senda recta de `p` a `q`, partida en tramos de una décima, como las suavizadas. */
export function recta(p: readonly [number, number], q: readonly [number, number]): Senda {
  const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.1);
  return Array.from({ length: n + 1 }, (_, i) => [
    p[0] + ((q[0] - p[0]) * i) / n,
    p[1] + ((q[1] - p[1]) * i) / n,
  ]);
}

const partidas = new Map<number, { readonly map: GameMap; readonly escena: Escena }>();

/**
 * El mapa de la partida nueva de `semilla` y su escena, con el catálogo del
 * repo. Una vez por semilla y fichero de tests: `componer` un mapa entero
 * cuesta, y `newGame` también.
 */
export function partidaDe(semilla: number): { readonly map: GameMap; readonly escena: Escena } {
  let p = partidas.get(semilla);
  if (p === undefined) {
    const map = newGame({ seed: semilla }).map;
    p = { map, escena: componer(map, semilla, catalogoDelDisco()) };
    partidas.set(semilla, p);
  }
  return p;
}

/** La escena de `partidaDe(semilla)`. */
export const escenaDe = (semilla: number): Escena => partidaDe(semilla).escena;
