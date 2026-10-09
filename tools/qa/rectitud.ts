/**
 * Rectitud de las fronteras: cuántos bordes rectos largos deja el generador
 * (#169, «evitar bordes rectos, que tenga un poco de giros»).
 *
 * El criterio que se fijó al cerrar #169 (07-10-2026) no es el máximo por mapa:
 * un borde al azar con un escalón cada dos o tres casillas ya da máximos de
 * 7-12 en un mapa de 34×34, y el máximo se quedaba en mediana 6 con todas las
 * variantes medidas. Se cuentan los tramos largos en 1-1000:
 *
 *  - **tramos ≥ 8**: casillas de barrera seguidas en la misma fila o columna
 *    con la casilla de al lado, siempre del mismo lado, pisable. Antes de
 *    #169, 216; después, 110; el techo, 140.
 *  - **caras ≥ 8**: casillas seguidas de cara de roca (frontal) en una fila,
 *    del relieve del escenógrafo; es lo que se ve como «una fila de frontales
 *    iguales». Antes, 138 (con el relieve de #174); después, 94; el techo, 115.
 *  - **mapas con un tramo ≥ 10**. Antes, 14; después, 5; el techo, 8.
 *
 * **Por qué 1-1000 y no 1-300**, que fue el criterio primero (techos 40 y 30):
 * en 300 semillas las cuentas bailan ±10 con cualquier cambio del azar del
 * generador. Elegir el paso de cada pareja de otra forma, sin tocar el engorde,
 * movió los tramos de 1-300 de 38 a 45 y las caras de 25 a 31, y en 1-1000 los
 * tramos de 103 a 110. Los techos van entre lo de antes y lo de ahora, con
 * margen para una tirada de monedas.
 *
 * Sale 1 si alguna cifra pasa de su techo. Uso: `npx tsx tools/qa/rectitud.ts`
 * (~20 s). El guardia de tramos y mapas, con `tramosRectos`, está también en
 * `test/regiones.test.ts`, en la orden lenta.
 */
import { resolve } from 'node:path';
import { analizar } from '../../src/client/render/escenario/analizar.js';
import { caidas } from '../../src/client/render/escenario/celdas.js';
import { relieve } from '../../src/client/render/escenario/relieve.js';
import { AREA_DE_REFERENCIA, AREA_POR_REGION } from '../../src/core/escala.js';
import type { GameMap } from '../../src/core/map/map.js';
import { esBarrera, type TerrainKind } from '../../src/core/map/terrain.js';
import { newGame } from '../../src/core/state/setup.js';

/** Los tramos rectos de barrera de un mapa: cuántos llegan a `minimo` y el más largo. */
export function tramosRectos(map: GameMap, minimo: number): { largos: number; maximo: number } {
  const W = map.width;
  const H = map.height;
  const barrera = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && esBarrera(map.terrain[y * W + x] as TerrainKind);
  const pisable = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && !esBarrera(map.terrain[y * W + x] as TerrainKind);
  let largos = 0;
  let maximo = 0;
  // Un tramo es de un lado: el borde norte de una barrera y el sur de otra que
  // compartan fila son dos tramos, no uno.
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const enFila = dy !== 0;
    for (let a = 0; a < (enFila ? H : W); a++) {
      let tramo = 0;
      for (let k = 0; k <= (enFila ? W : H); k++) {
        const [x, y] = enFila ? [k, a] : [a, k];
        if (k < (enFila ? W : H) && barrera(x, y) && pisable(x + dx, y + dy)) {
          tramo++;
          continue;
        }
        if (tramo >= minimo) largos++;
        maximo = Math.max(maximo, tramo);
        tramo = 0;
      }
    }
  }
  return { largos, maximo };
}

/** Las filas de caras de roca del escenógrafo que llegan a `minimo` casillas seguidas. */
export function carasEnFila(map: GameMap, minimo: number): number {
  const W = map.width;
  const cara = new Uint8Array(W * map.height);
  const a = analizar(map);
  const { nivel } = relieve(a);
  // Por celdas (R4) una cara va de junta a junta: de `x0 = a − 0,5` a `x1 + 1`.
  // Se cuenta por vértice, que es una casilla de largo igual que antes.
  for (const c of caidas(nivel, a.W, a.H, a.suelo).caras) {
    for (let x = c.x0 + 0.5; x <= c.x1 + 0.5; x++) cara[c.y * W + x] = 1;
  }
  let largas = 0;
  for (let y = 0; y < map.height; y++) {
    let fila = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && cara[y * W + x] === 1) {
        fila++;
        continue;
      }
      if (fila >= minimo) largas++;
      fila = 0;
    }
  }
  return largas;
}

/**
 * Un largo de los de #169, medido en mapas de `AREA_DE_REFERENCIA` casillas por
 * región, llevado al mapa de hoy (#226): ×√(AREA_POR_REGION / AREA_DE_REFERENCIA),
 * redondeado. Lo que #169 juzga es la forma del borde, y un mapa ×1,22 de lado
 * con las mismas regiones tiene las mismas fronteras ×1,22 de largas: un tramo
 * de 8 en 34×34 es uno de 10 en 42×42. Los techos (cuántos) no se escalan:
 * son las mismas fronteras. Medido en 1-1000 (09-10-2026, 42×42): en casillas
 * sin escalar, 437 tramos de ≥ 8 y 43 mapas con uno de ≥ 10; a escala, 75 de
 * ≥ 10 y 8 mapas con uno de ≥ 12. Los bisectores de Voronoi son rectos, y un
 * mapa mayor los alarga: el umbral absoluto cruza la raya de muchos que en
 * 34×34 se quedaban en 6-7.
 */
export function largoALaEscala(casillas: number): number {
  return Math.round(casillas * Math.sqrt(AREA_POR_REGION / AREA_DE_REFERENCIA));
}

/** Los techos de #169 y lo que había antes, para que el informe diga las dos cosas. */
export const TECHOS = {
  tramos: { semillas: 1000, minimo: largoALaEscala(8), techo: 140, antes: 216 },
  caras: { semillas: 1000, minimo: largoALaEscala(8), techo: 115, antes: 138 },
  mapas: { semillas: 1000, minimo: largoALaEscala(10), techo: 8, antes: 14 },
} as const;

function medir(): boolean {
  let tramos = 0;
  let caras = 0;
  let mapas = 0;
  for (let s = 1; s <= TECHOS.mapas.semillas; s++) {
    const { map } = newGame({ seed: s });
    if (s <= TECHOS.tramos.semillas) tramos += tramosRectos(map, TECHOS.tramos.minimo).largos;
    if (s <= TECHOS.caras.semillas) caras += carasEnFila(map, TECHOS.caras.minimo);
    if (tramosRectos(map, TECHOS.mapas.minimo).largos > 0) mapas++;
  }
  const filas = [
    ['tramos', tramos, TECHOS.tramos, 'tramos rectos de barrera'],
    ['caras', caras, TECHOS.caras, 'filas de caras de roca'],
    ['mapas', mapas, TECHOS.mapas, 'mapas con algún tramo recto'],
  ] as const;
  let bien = true;
  for (const [, cifra, t, que] of filas) {
    const pasa = cifra <= t.techo;
    bien &&= pasa;
    console.log(
      `${pasa ? 'bien' : 'MAL '}  ${que} ≥ ${t.minimo} en 1-${t.semillas}: ${cifra} (techo ${t.techo}; antes de #169, ${t.antes})`,
    );
  }
  return bien;
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript && !medir()) process.exitCode = 1;
