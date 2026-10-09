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
 * **Desde #230, 1-3000** (09-10-2026): en 1-1000 el ruido de una tirada nueva
 * del azar ya era del tamaño del margen (ver `TECHOS`).
 *
 * Sale 1 si alguna cifra pasa de su techo. Uso: `npx tsx tools/qa/rectitud.ts`
 * (tres procesos, uno por bloque de 1000; ~50 s con la máquina libre). El
 * guardia de tramos y mapas, con `tramosRectos`, está también en
 * `test/rectitud.test.ts`, en la orden lenta.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizar } from '../../src/client/render/escenario/analizar.js';
import { caidas } from '../../src/client/render/escenario/celdas.js';
import { relieve } from '../../src/client/render/escenario/relieve.js';
import { largoALaEscala } from '../../src/core/escala.js';
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
 * Los largos van a la escala del mapa (`largoALaEscala`, en `core/escala.ts`
 * desde #231, que lo lee el generador). Lo que #169 juzga es la forma del
 * borde, y un mapa ×1,22 de lado con las mismas regiones tiene las mismas
 * fronteras ×1,22 de largas. Los techos (cuántos) no se escalan: son las mismas
 * fronteras. Medido en 1-1000 (09-10-2026, 42×42): en casillas sin escalar, 437
 * tramos de ≥ 8 y 43 mapas con uno de ≥ 10; a escala, 75 de ≥ 10 y 8 mapas con
 * uno de ≥ 12. Los bisectores de Voronoi son rectos, y un mapa mayor los alarga:
 * el umbral absoluto cruza la raya de muchos que en 34×34 se quedaban en 6-7.
 * Con la ondulación del reparto (#229, `ONDULACION` en `map/generate.ts`), 64
 * tramos de ≥ 10, 5 filas de caras y 2 mapas.
 */
export { largoALaEscala };

/**
 * Los techos de #169, sobre **1-3000** (#230, 09-10-2026). Con #229 eran de
 * 1-1000 (70 / 8 / 6, entre lo de antes de la ondulación, 75 / 10 / 8, y lo de
 * después, 64 / 5 / 2), y el ruido se los comía: cualquier cambio que mueva el
 * sorteo de los objetos cambia qué intento de vestido sale bueno, y en los
 * mapas que cambian el vestido es otro entero (39-55 % de las barreras
 * distintas). Medido por bloques de 1000 (tramos / caras / mapas):
 *
 * | | 1-1000 | 1001-2000 | 2001-3000 | 1-3000 |
 * |---|---|---|---|---|
 * | main (orden en serpiente, `cbd08d2`) | 64 / 5 / 2 | 60 / 1 / 4 | 71 / 1 / 5 | 195 / 7 / 11 |
 * | las dos puertas de la mina (#230) | 72 / 9 / 6 | 43 / 4 / 4 | 59 / 1 / 4 | 174 / 14 / 14 |
 * | main con el sorteo de minas y pueblos sobre la lista al revés | 53 / 5 / 3 | 67 / 4 / 5 | 71 / 4 / 6 | 191 / 13 / 14 |
 * | las caídas largas partidas (#231) | 48 / 0 / 5 | 44 / 0 / 4 | 51 / 0 / 3 | 143 / 0 / 12 |
 *
 * La tercera fila es una perturbación neutra (las mismas reglas, otra tirada):
 * ±10 tramos por bloque, y las caras de 7 a 13 sin tocar nada que las haga.
 * Hasta #231 los techos eran el máximo de las tres más un margen pequeño
 * declarado: +10 tramos (~5 %), +3 caras y +3 mapas (205 / 17 / 17).
 *
 * **Desde #231** las caras ≥ 10 son 0 por construcción: el engorde parte las
 * caídas al sur de `CAIDA_LARGA` (`quebrarCaidas`) y el vestido que aún deja
 * una no vale (`generate.ts`); la cara pintada es una casilla más corta que la
 * caída. Los techos son lo medido más el mismo margen: 153 / 3 / 15. El de
 * tramos es justo: la perturbación neutra de arriba movía el total hasta 21, y
 * un cambio que mueva el azar del vestido puede pasarlo sin hacer nada peor;
 * entonces se vuelve a medir aquí, con su fila, y no se sube a ciegas. El de
 * caras deja la misma holgura por si la escena pinta una fila que el núcleo no
 * ve; el guardia de 0 es `test/caidas-largas.test.ts`.
 */
export const TECHOS = {
  semillas: 3000,
  bloque: 1000,
  tramos: { minimo: largoALaEscala(8), techo: 153 },
  caras: { minimo: largoALaEscala(8), techo: 3 },
  mapas: { minimo: largoALaEscala(10), techo: 15 },
} as const;

export interface Rectitud {
  readonly tramos: number;
  readonly caras: number;
  readonly mapas: number;
}

/** Las tres cuentas en las semillas de `desde` a `hasta`, las dos incluidas. */
export function rectitudDe(desde: number, hasta: number, conCaras = true): Rectitud {
  let tramos = 0;
  let caras = 0;
  let mapas = 0;
  for (let s = desde; s <= hasta; s++) {
    const { map } = newGame({ seed: s });
    tramos += tramosRectos(map, TECHOS.tramos.minimo).largos;
    if (conCaras) caras += carasEnFila(map, TECHOS.caras.minimo);
    if (tramosRectos(map, TECHOS.mapas.minimo).largos > 0) mapas++;
  }
  return { tramos, caras, mapas };
}

/**
 * Un bloque en otro proceso: este mismo fichero con `--bloque`, por la CLI de
 * `tsx`, que escribe su JSON. Por la CLI y no con el `execArgv` de quien llama:
 * desde vitest no hay cargador de `tsx` que heredar.
 */
function enOtroProceso(desde: number, hasta: number): Promise<Rectitud> {
  const tsx = createRequire(import.meta.url).resolve('tsx/cli');
  const este = fileURLToPath(import.meta.url);
  return new Promise((ok, mal) => {
    const hijo = spawn(process.execPath, [tsx, este, '--bloque', String(desde), String(hasta)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let salida = '';
    hijo.stdout.on('data', (d) => {
      salida += String(d);
    });
    hijo.on('error', mal);
    hijo.on('close', (codigo) => {
      if (codigo !== 0) mal(new Error(`el bloque ${desde}-${hasta} salió con ${codigo}`));
      else ok(JSON.parse(salida) as Rectitud);
    });
  });
}

/**
 * Las tres cuentas de 1-`TECHOS.semillas`, un proceso por bloque de
 * `TECHOS.bloque` en paralelo, y la de cada bloque. Lo leen este script y
 * `test/rectitud.test.ts`.
 */
export async function rectitudPorBloques(): Promise<{
  readonly total: Rectitud;
  readonly bloques: readonly {
    readonly desde: number;
    readonly hasta: number;
    readonly m: Rectitud;
  }[];
}> {
  const rangos: [number, number][] = [];
  for (let d = 1; d <= TECHOS.semillas; d += TECHOS.bloque)
    rangos.push([d, Math.min(TECHOS.semillas, d + TECHOS.bloque - 1)]);
  const medidas = await Promise.all(rangos.map(([d, h]) => enOtroProceso(d, h)));
  const suma = (c: keyof Rectitud) => medidas.reduce((t, m) => t + m[c], 0);
  return {
    total: { tramos: suma('tramos'), caras: suma('caras'), mapas: suma('mapas') },
    bloques: rangos.map(([desde, hasta], k) => ({ desde, hasta, m: medidas[k] as Rectitud })),
  };
}

async function medir(): Promise<boolean> {
  const { total: t, bloques } = await rectitudPorBloques();
  for (const { desde, hasta, m } of bloques)
    console.log(
      `      ${desde}-${hasta}: tramos ${m.tramos} · caras ${m.caras} · mapas ${m.mapas}`,
    );
  const total = (c: keyof Rectitud) => t[c];
  const filas = [
    ['tramos', 'tramos rectos de barrera'],
    ['caras', 'filas de caras de roca'],
    ['mapas', 'mapas con algún tramo recto'],
  ] as const;
  let bien = true;
  for (const [c, que] of filas) {
    const cifra = total(c);
    const pasa = cifra <= TECHOS[c].techo;
    bien &&= pasa;
    console.log(
      `${pasa ? 'bien' : 'MAL '}  ${que} ≥ ${TECHOS[c].minimo} en 1-${TECHOS.semillas}: ${cifra} (techo ${TECHOS[c].techo})`,
    );
  }
  return bien;
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
const iBloque = process.argv.indexOf('--bloque');
if (esScript && iBloque !== -1) {
  const [d, h] = [Number(process.argv[iBloque + 1]), Number(process.argv[iBloque + 2])];
  if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d)
    throw new Error(
      `--bloque pide dos semillas, desde y hasta: ${process.argv.slice(iBloque + 1, iBloque + 3).join(' ')}`,
    );
  process.stdout.write(JSON.stringify(rectitudDe(d, h)));
} else if (esScript && !(await medir())) process.exitCode = 1;
