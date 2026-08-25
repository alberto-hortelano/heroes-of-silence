/**
 * Banco de medida del núcleo: cuánto tarda y **si sale exactamente lo mismo**.
 *
 * No es un test —no falla, mide— y va aparte del barrido de semillas a
 * propósito: el barrido mide la IA (¿siguen terminando las partidas?), esto
 * mide el código (¿tarda menos y da lo mismo?). Lo que sí comparten son las
 * tripas, en `partidas.ts`: jugar la partida de una semilla y montar su batalla
 * espejo. Estaban copiadas verbatim en los dos ficheros.
 *
 * Lo que imprime, en una sola orden:
 *
 *  - el tiempo de las N partidas,
 *  - el **sha256 del volcado** —ganador, día y crónica completa de cada
 *    semilla—, que es el criterio de aceptación de cualquier refactorización
 *    del núcleo: si cambia, alguna partida se juega distinta,
 *  - el número de líneas del volcado y cuántas partidas no terminan,
 *  - y el tiempo de 300 `autoResolve` con semillas fijas, que es lo que mide
 *    el coste de `legalActions` sin el ruido del mapa.
 *
 * El volcado es una línea por hecho y no un JSON por partida a propósito: si
 * el sha cambia, `--dump` a dos ficheros y `diff` señala la semilla y el hecho
 * exactos en vez de decir «la partida 137 difiere».
 *
 * `node:crypto` aquí vale: esto es `tools/`, no `core`.
 *
 * **El sha esperado está anclado aquí abajo y se comprueba solo.** Antes el
 * docstring lo llamaba «el criterio de aceptación de cualquier refactorización
 * del núcleo» y el valor no estaba escrito en ningún sitio: un `grep` por el
 * hash en el repositorio entero daba cero, y CI corría `verify`, `vite build` y
 * `qa` pero no esto. Un criterio de aceptación que exige acordarse de correr la
 * herramienta en el commit ANTERIOR no es un criterio, es una costumbre — y era
 * lo único que cazaba una frontera compartida entre búsquedas.
 *
 * Uso: pnpm banco [semillas=200] [dias=300] [--dump <fichero>]
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  batallaDeSemilla,
  DIAS_POR_DEFECTO,
  partidaDeSemilla,
  resumenSinTerminar,
  SEMILLAS_DEL_BANCO,
} from './partidas.js';

const args = process.argv.slice(2);
const iDump = args.indexOf('--dump');
// La ausencia se escribe de UNA manera, `null`, y no de dos: cuando el tipo
// era `string | null | undefined` había que preguntar por las dos cada vez que
// se usaba, y las dos preguntas querían decir lo mismo.
const fichero: string | null = iDump === -1 ? null : (args[iDump + 1] ?? null);
if (iDump !== -1 && fichero === null) throw new Error('--dump necesita un fichero');
// El `-1` se descarta antes de filtrar: sin eso, `i !== iDump + 1` valía
// `i !== 0` y se comía el primer argumento cuando no había `--dump`.
const sueltos = iDump === -1 ? args : args.filter((_, i) => i !== iDump && i !== iDump + 1);

/**
 * El volcado que TIENE que salir con los valores por defecto.
 *
 * Es el suelo del núcleo: mientras este sha no cambie, las 200 partidas se
 * juegan hexágono a hexágono igual que antes de la refactorización. Cambiarlo
 * no está prohibido —una regla nueva mueve las partidas a propósito—, pero
 * cambiarlo **en silencio** sí: si sale otro, la orden se pone en rojo y hay
 * que anclar el nuevo diciendo cuál era el viejo y por qué se movió.
 *
 * Solo se comprueba con `200 300`, que es lo que corre CI: con otros argumentos
 * esto sigue siendo lo que dice ser, una medida.
 *
 * **Historial de anclas**, que es lo que dice si un cambio se hizo a la vista:
 *
 * - `eb294724…` (28 300 líneas): el suelo con el que se cerró el ciclo de
 *   rendimiento. Lo conservó #50 —elegir la casilla de ataque por daño esperado
 *   no mueve una sola partida mientras no haya caballería en el tablero—.
 * - `a4d71f9b…` (28 406 líneas): #52, la regla de espera. Cambia las partidas a
 *   propósito: la IA juega `wait` 476 veces en estas 200 partidas, donde antes
 *   jugaba 0. Las 106 líneas de más son los hechos que eso añade a la crónica.
 * - `299b1a7c…` (28 406 líneas, **las mismas**): #72, el radio de visión del
 *   castillo. No mueve una sola partida: mueve **quién se entera**. El `diff`
 *   contra `a4d71f9b…` trae 1 871 de 28 406 líneas (6,6 %), el **100 %** de
 *   ellas distintas SOLO en `seen`, **cero** líneas `fin` —mismo ganador, mismo
 *   día y mismos hechos en las 200 partidas— y las 1 871 **ganan** observador,
 *   ninguna lo pierde, que es lo único que puede hacer un radio más grande.
 *   Ese diff era el criterio de aceptación, y no que el sha cambiara: el sha lo
 *   mueve también una implementación mala.
 * - `a8fc2820…` (27 731 líneas): la reserva de héroe de `planRecruits`, primera
 *   de las cuatro palancas del ciclo que cuadra el coste con la renta. Arregla
 *   una avería anterior —quien perdía su héroe no compraba otro nunca—, así que
 *   **195 de las 200 semillas salen idénticas hecho a hecho**; las 5 que cambian
 *   (33, 35, 114, 127, 186) son exactamente las que dejaban a un jugador sin
 *   héroe. Tres se acortan y el máximo baja de **22 días a 15**: las 675 líneas
 *   de menos son los días de empate que ya no se juegan.
 * - `b790afc9…` (30 503 líneas): los recursos de salida, copiados de la fila
 *   NORMAL de `Kingdom::_getKingdomStartingResources`. Aquí no queda una sola
 *   semilla igual, y la forma del diff es la que tiene que ser: el **primer
 *   hecho distinto es `built` en 200 de 200**, porque la economía entra por el
 *   castillo y por ningún otro sitio. `knight_dwelling_4` pasa de 8/200 a
 *   **200/200** y `mage_guild_2` de 0 a 25/200.
 * - `f0eee7c3…` (51 952 líneas): el coste de las 18 filas inventadas de
 *   `data/buildings.json`, copiado de `buildinginfo.cpp`. Misma forma que la
 *   palanca anterior y por el mismo motivo: **`built` es el primer hecho
 *   distinto en 200 de 200**. `knight_dwelling_5` pasa de 15/200 a 129/200 y
 *   aparecen las tres primeras criaturas de nivel ≥5. Este paso solo **alarga**
 *   la partida —mediana 7 → 17 días— porque quien pisa el freno es la materia
 *   prima, que llega con la palanca de las minas: es el estado intermedio que
 *   el plan predijo, no el destino.
 * - `cf7b8d3b…` (26 444 líneas): las minas de los siete recursos, cuarta y
 *   última palanca. Aquí el primer hecho distinto ya **no** es `built` sino
 *   `hero_moved` (173/200), `resource_gained` (21) y `mine_captured` (3), que
 *   es lo que predice añadir objetos al mapa: la ruta del héroe cambia antes
 *   que lo que se construye. **146 de las 200 partidas se acortan** y solo 16
 *   se alargan. Cierre del ciclo, contra el suelo `299b1a7c…` de antes: mediana
 *   7 → **6** días, p90 8 → 7, máximo 22 → 20; 200/200 con ganador y 0 sin
 *   terminar; `dwelling_5` 0 → **52/200** y `dwelling_6` 0 → **10/200**. Las
 *   1 962 líneas de menos son partidas más cortas, no crónica perdida.
 */
const ANCLA = {
  semillas: SEMILLAS_DEL_BANCO,
  dias: DIAS_POR_DEFECTO,
  sha: 'cf7b8d3b5129aa99b0fec66c956a508d26c1055396f2b6aa8721c94589b233f6',
} as const;

const SEMILLAS = Number(sueltos[0] ?? ANCLA.semillas);
const DIAS = Number(sueltos[1] ?? ANCLA.dias);

const lineas: string[] = [];
const sinTerminar: number[] = [];

const t0 = performance.now();
for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const state = await partidaDeSemilla(semilla, DIAS);

  const ganador = state.finished === null ? 'ninguno' : String(state.finished.winner);
  if (state.finished === null) sinTerminar.push(semilla);
  lineas.push(`${semilla} fin ganador=${ganador} dia=${state.day} hechos=${state.log.length}`);
  for (const [i, e] of state.log.entries()) lineas.push(`${semilla} ${i} ${JSON.stringify(e)}`);
}
const msPartidas = performance.now() - t0;

const volcado = `${lineas.join('\n')}\n`;
const sha = createHash('sha256').update(volcado).digest('hex');
if (fichero !== null) writeFileSync(fichero, volcado);

console.log(`partidas:      ${SEMILLAS} semillas × ${DIAS} días → ${msPartidas.toFixed(0)} ms`);
console.log(`sha256:        ${sha}`);
console.log(`líneas:        ${lineas.length}`);
console.log(`sin terminar:  ${resumenSinTerminar(sinTerminar, SEMILLAS)}`);
if (fichero !== null) console.log(`volcado:       ${fichero}`);

if (SEMILLAS === ANCLA.semillas && DIAS === ANCLA.dias) {
  if (sha === ANCLA.sha) {
    console.log('ancla:         igual — las 200 partidas se juegan hexágono a hexágono igual');
  } else {
    // Se sigue midiendo hasta el final a propósito: el tiempo de `autoResolve`
    // interesa igual, y con `exitCode` el rojo llega de todas formas.
    process.exitCode = 1;
    console.error('');
    console.error(`ANCLA ROTA: se esperaba ${ANCLA.sha}`);
    console.error(`            y ha salido ${sha}`);
    console.error('            Alguna partida se juega distinta. Para ver cuál y dónde:');
    console.error('              git stash && pnpm banco --dump antes.jsonl && git stash pop');
    console.error('              pnpm banco --dump ahora.jsonl && diff antes.jsonl ahora.jsonl');
    console.error('            El volcado es una línea por hecho: el diff señala la semilla');
    console.error('            y el hecho exactos. Si el cambio es deliberado, se ancla el');
    console.error('            nuevo valor arriba y se dice cuál era el viejo y por qué.');
  }
}

/**
 * Segunda medida, la de #48: 300 batallas de la IA contra sí misma.
 *
 * Va aparte porque `legalActions` no se nota en el reloj del barrido —el mapa
 * se lo come— y es justo lo que abarata izar el BFS fuera del bucle de
 * enemigos. Semillas fijas, así que la cifra es comparable entre pasadas.
 */
const BATALLAS = 300;
const t1 = performance.now();
let rondas = 0;
for (let i = 1; i <= BATALLAS; i++) rondas += batallaDeSemilla(i).rounds;
console.log(
  `autoResolve:   ${BATALLAS} batallas (${rondas} rondas) → ${(performance.now() - t1).toFixed(0)} ms`,
);
