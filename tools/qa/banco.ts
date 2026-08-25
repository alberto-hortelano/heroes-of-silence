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
const fichero = iDump === -1 ? null : args[iDump + 1];
if (iDump !== -1 && fichero === undefined) throw new Error('--dump necesita un fichero');
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
 */
const ANCLA = {
  semillas: SEMILLAS_DEL_BANCO,
  dias: DIAS_POR_DEFECTO,
  sha: 'eb29472446c90b27b5d15c764e6677d702f1d40e2c646191484c92c5f4711a4f',
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
if (fichero !== null && fichero !== undefined) writeFileSync(fichero, volcado);

console.log(`partidas:      ${SEMILLAS} semillas × ${DIAS} días → ${msPartidas.toFixed(0)} ms`);
console.log(`sha256:        ${sha}`);
console.log(`líneas:        ${lineas.length}`);
console.log(`sin terminar:  ${resumenSinTerminar(sinTerminar, SEMILLAS)}`);
if (fichero !== null && fichero !== undefined) console.log(`volcado:       ${fichero}`);

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
