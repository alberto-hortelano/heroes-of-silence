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
 *    el coste de `legalActions` sin el ruido del mapa, en varias tandas con su
 *    mínimo, mediana y máximo (#99).
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
 * Uso: pnpm banco [semillas=20] [dias=300] [--dump <fichero>]
 */
import { writeFileSync } from 'node:fs';
import { duracion, mediana } from '../../comun/estadistica.js';
import { sha256 } from '../../comun/hash.js';
import {
  batallaDeSemilla,
  DIAS_POR_DEFECTO,
  partidaDeSemilla,
  resumenSinTerminar,
  SEMILLAS_DEL_BANCO,
  volcadoDeLaPartida,
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
 * Es el suelo del núcleo: mientras este sha no cambie, las 20 partidas se
 * juegan hexágono a hexágono igual que antes de la refactorización. Cambiarlo
 * no está prohibido —una regla nueva mueve las partidas a propósito—, pero
 * cambiarlo **en silencio** sí: si sale otro, la orden se pone en rojo y hay
 * que anclar el nuevo diciendo cuál era el viejo y por qué se movió.
 *
 * Solo se comprueba con `20 300`, que es lo que corre CI: con otros argumentos
 * esto sigue siendo lo que dice ser, una medida.
 *
 * El historial de anclas —cuál fue cada una, qué la movió y la forma de su diff, que es lo
 * que dice si un cambio se hizo a la vista— está en `docs/banco.md`: un ancla nueva se
 * cuenta allí, al final.
 */
const ANCLA = {
  semillas: SEMILLAS_DEL_BANCO,
  dias: DIAS_POR_DEFECTO,
  sha: '3ea9e845a18e648e29f59db619bcacecbc100b0ba2438dd5b04e35364e90a0fd',
} as const;

const SEMILLAS = Number(sueltos[0] ?? ANCLA.semillas);
const DIAS = Number(sueltos[1] ?? ANCLA.dias);

const lineas: string[] = [];
const sinTerminar: number[] = [];
const dias: number[] = [];

const t0 = performance.now();
for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const { state, fin } = await partidaDeSemilla(semilla, DIAS);

  // «Sin terminar» es `winner === null` y no `finished === null`: una partida
  // agotada vuelve **terminada** y sin ganador. Con el criterio de antes esta
  // cuenta daría 0 siempre y por construcción — un informe que imprime su línea
  // sin medir nada.
  if (fin.winner === null) sinTerminar.push(semilla);
  dias.push(state.day);
  // El volcado lo escribe `partidas.ts`: es el mismo que hashea la huella (`huella.ts`).
  lineas.push(...volcadoDeLaPartida(semilla, state, fin));
}
const msPartidas = performance.now() - t0;

const volcado = `${lineas.join('\n')}\n`;
const sha = sha256(volcado);
if (fichero !== null) writeFileSync(fichero, volcado);

console.log(`partidas:      ${SEMILLAS} semillas × ${DIAS} días → ${msPartidas.toFixed(0)} ms`);
console.log(`sha256:        ${sha}`);
console.log(`líneas:        ${lineas.length}`);
console.log(`sin terminar:  ${resumenSinTerminar(sinTerminar, SEMILLAS)}`);
console.log(`duración:      ${duracion(dias)} días (mediana / p90 / máximo)`);
if (fichero !== null) console.log(`volcado:       ${fichero}`);

if (SEMILLAS === ANCLA.semillas && DIAS === ANCLA.dias) {
  if (sha === ANCLA.sha) {
    console.log(
      `ancla:         igual — las ${ANCLA.semillas} partidas se juegan hexágono a hexágono igual`,
    );
  } else {
    // Se sigue midiendo hasta el final a propósito: el tiempo de `autoResolve`
    // interesa igual, y con `exitCode` el rojo llega de todas formas.
    process.exitCode = 1;
    console.error('');
    console.error(`ANCLA ROTA: se esperaba ${ANCLA.sha}`);
    console.error(`            y ha salido ${sha}`);
    console.error('            Alguna partida se juega distinta. Para ver cuál y dónde, el');
    console.error('            volcado del commit que daba el ancla (HEAD, o el de antes si ya');
    console.error('            está commiteado) en un worktree aparte, que no toca tu árbol');
    console.error('            (git stash no: la pila es de todos los worktrees de la máquina):');
    console.error('              D=$(mktemp -d) && git worktree add --detach "$D" HEAD');
    console.error('              ln -s "$PWD/node_modules" "$D/"');
    console.error('              (cd "$D" && pnpm banco --dump "$OLDPWD/antes.jsonl")');
    console.error('              git worktree remove --force "$D"');
    console.error('              pnpm banco --dump ahora.jsonl && diff antes.jsonl ahora.jsonl');
    console.error('            El volcado es una línea por hecho: el diff señala la semilla');
    console.error('            y el hecho exactos. Si el cambio es deliberado, se ancla el');
    console.error('            nuevo valor arriba y se cuenta en docs/banco.md cuál era el');
    console.error('            viejo y por qué.');
  }
}

/**
 * Segunda medida, la de #48: 300 batallas de la IA contra sí misma.
 *
 * Va aparte porque `legalActions` no se nota en el reloj del barrido —el mapa
 * se lo come— y es justo lo que abarata izar el BFS fuera del bucle de
 * enemigos. Semillas fijas, así que la cifra es comparable entre pasadas.
 *
 * **Se mide en `TANDAS` tandas y se imprime mínimo, mediana y máximo** (#99):
 * sobre código idéntico, seis pasadas de una sola tanda dieron de 57 a 89 ms,
 * dos modos y no ruido alrededor de una media, y con la punta buena se publicó
 * un «−50 %» que en mediana era −39 %. Un número solo aparenta una precisión
 * que no tiene; la dispersión dice cuánto se puede creer. Cinco tandas cuestan
 * ~0,8 s más, un 10 % del banco (7,8 → 8,7 s, 08-10-2026), porque van con el
 * núcleo caliente de las 200 partidas. Las rondas tienen que salir iguales en
 * todas: si no, la medida no es de lo mismo y se dice.
 */
const BATALLAS = 300;
const TANDAS = 5;
const tiempos: number[] = [];
let rondas = -1;
for (let tanda = 0; tanda < TANDAS; tanda++) {
  const t1 = performance.now();
  let estas = 0;
  for (let i = 1; i <= BATALLAS; i++) estas += batallaDeSemilla(i).rounds;
  tiempos.push(performance.now() - t1);
  if (rondas !== -1 && estas !== rondas) {
    throw new Error(
      `autoResolve no es determinista: la tanda ${tanda + 1} jugó ${estas} rondas y la anterior ${rondas}, con las mismas semillas`,
    );
  }
  rondas = estas;
}
const ms = (x: number): string => x.toFixed(0);
console.log(
  `autoResolve:   ${BATALLAS} batallas (${rondas} rondas) → ${ms(Math.min(...tiempos))} / ${ms(mediana(tiempos))} / ${ms(Math.max(...tiempos))} ms (mínimo / mediana / máximo de ${TANDAS} tandas: ${tiempos.map(ms).join(', ')})`,
);
