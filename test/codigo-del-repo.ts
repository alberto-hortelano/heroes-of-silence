/**
 * Leer el código del repositorio desde un guardia: lo que comparten los
 * `invariantes-*.test.ts` y `arranque.test.ts`.
 *
 * Los guardias leen el código como texto (con o sin comentarios), sus
 * importaciones y las líneas de sus declaraciones; cada fichero, una vez por
 * fichero de test.
 *
 * **Toda ruta escrita en un guardia pasa por `ruta()`**, que lanza si no existe
 * (fase T de la reorganización de la arquitectura, 06-11-2026). Un guardia que
 * filtra «todo menos `src/core/battle/battle.ts`», o que exige que algo NO esté en
 * un fichero, sigue verde si ese fichero se muda: deja de mirar en silencio. Con
 * `ruta()`, la mudanza que se olvide de él sale en rojo diciendo qué ruta falta.
 *
 * ## Lo que se aprendió escribiéndolos
 *
 * La cabecera de `invariantes.test.ts` cuando eran uno solo, tal cual:
 *
 * Las fronteras de `CLAUDE.md`, comprobadas.
 *
 * Un contrato que solo vive en la documentación se rompe sin que nadie se
 * entere; aquí se rompe en rojo. Son quince guardias: ocho leen el código con
 * una expresión regular, uno recorre el catálogo de rasgos, el de efectos
 * temporales llama de verdad a los lectores del motor, otro recorre todo el
 * repo —menos la prosa y los binarios— buscando la ruta de esta máquina, dos
 * juegan partidas enteras —uno le da a la crónica un viaje de ida y vuelta por
 * `JSON`, el otro comprueba que nadie escriba detrás de «fin de la partida»— y
 * el último vigila que el núcleo no ejecute coma flotante que dependa de la
 * plataforma, que es en lo que se apoya el sha256 de `pnpm banco` para valer
 * fuera de esta máquina. Cuestan milisegundos —los dos que juegan, medio
 * segundo cada uno— así que caben en cada `pnpm test` sin frenar a nadie.
 *
 * Los catorce nacen en verde. Un guardia que nace rojo se ignora desde el primer
 * día — y uno que nace verde sin comprobar que MUERDE no guarda nada: el de la
 * frontera con el servidor se probó metiendo un `import` del director en
 * `src/core/ai/turn.ts`, viéndolo rojo y quitándolo. Se volvió a probar con la
 * forma que se le colaba (`import 'ruta';`, sin `from`) al cerrarle ese hueco.
 * El de las rutas absolutas nació con trece presas —`.mcp.json` y los doce
 * `atlas.json`— y se corrió en rojo antes de quitarlas; y se volvió a correr en
 * rojo con un fichero SIN INDEXAR, que es el caso que se le escapaba mientras
 * miró `git ls-files` a secas. Y una tercera vez con los NUEVE ficheros que se
 * le colaban por mirar una lista blanca de extensiones (`.js`, `.mjs`, `.cjs`,
 * `.tsx`, `.toml`, `.envrc`, un ejecutable sin extensión, y un `.json` con las
 * barras escapadas), que es lo que invirtió la lista. Y el del candado de la
 * crónica se rompió copiando el `as GameEvent[]` de `game.ts` a
 * `serialize.ts`, que es justo el sitio al que se copiaría de verdad: cazado
 * con el fichero y la línea, y retirada la sonda antes de darlo por bueno.
 * Ese último **no bastaba**: miraba una sola puerta y QA se coló por la de al
 * lado —castear el ESTADO en vez del log— con `tsc`, Biome y los 235 tests en
 * verde. Ahora mira cuatro y las cuatro se han roto a mano, una a una, y se
 * han visto rojas con su nombre delante.
 *
 * Y el de la coma flotante repitió la lección entera. Nació probado con CINCO
 * sondas —`Math.pow`, `1.4 ** n`, `Math.hypot`, `Math.sqrt` y un `2 ** n` en la
 * línea siguiente a una cadena que lleva dentro las dos marcas de comentario,
 * que es como se comprueba que el quitacomentarios no se come código de verdad
 * en silencio— y las cinco mordieron. Y aun así **tenía un agujero**: QA lo
 * rompió con `const { pow } = Math`, que no escribe `Math.pow` en ninguna parte.
 * Cinco sondas con punto no prueban un guardia que mira puntos. Ahora la regla
 * es que `Math` solo puede aparecer seguido de una de las siete permitidas, y
 * las sondas son OCHO: las cinco de antes más desestructurar, desestructurar
 * renombrando y `Math['pow']`. Es la tercera vez que este fichero aprende lo
 * mismo —el de `node:` con `import 'x';`, el del candado con el cast del
 * estado, este con la desestructuración—: **lo que hay que ensanchar es la
 * batería de sondas, no la confianza**.
 *
 * El catorceavo es el de #63: `pintar` es el único `innerHTML` del repositorio y
 * un `Html` solo se fabrica dentro de `src/client/html.ts`. Nace en verde **en
 * el commit que reescribe `views/panels.ts`** y no en el que escribe la puerta,
 * donde habría nacido rojo con los tres `innerHTML` que `main.ts` tenía
 * entonces. También se rompió a mano, copiando uno de vuelta a `main.ts`.
 *
 * El quinceavo es de la fase 2a: el dueño de un nodo o de un castillo lo
 * escriben `captureNode` y `captureTown` y nadie más, que es lo que permite que
 * el dueño de una región se derive en vez de guardarse. Se rompió a mano
 * metiendo una escritura de `obj.owner` en la IA (`strategy.ts`) y salió rojo
 * con el fichero y la línea.
 *
 * Y esta frase no puede escribir la marca de cierre de un comentario de bloque:
 * al escribirla la primera vez cerró este docstring de verdad y tumbó el `tsc`
 * con seis errores a partir de aquí abajo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { RAIZ } from './comun.js';

const COMPROBADAS = new Set<string>();

/**
 * `r`, relativa a la raíz, tal cual si existe (un fichero o una carpeta); si no,
 * lanza diciéndolo. Es lo que envuelve cada ruta que escribe un guardia: el día
 * que el fichero se mude, el guardia lo dice en vez de quedarse mirando nada.
 */
export function ruta(r: string): string {
  if (COMPROBADAS.has(r)) return r;
  if (!existsSync(join(RAIZ, r))) {
    throw new Error(
      `la ruta «${r}» no existe: si se movió o se borró, el guardia que la escribe tiene que mirar donde está ahora`,
    );
  }
  COMPROBADAS.add(r);
  return r;
}

let rutasGuardadas: readonly string[] | null = null;

/**
 * Lo que hay en el repo, indexado o no: `-o --exclude-standard` es la mitad que
 * faltaba. Una sola llamada a git por corrida: la leen `ficherosDeMaquina` y los
 * guardias de lo retirado (`lineasCon`).
 *
 * `git ls-files` a secas lista solo lo indexado, y un fichero nuevo sin
 * `git add` —que es como nacen las presas, y como está el árbol mientras se
 * trabaja— pasaba por debajo.
 */
export function rutasDelRepo(): readonly string[] {
  rutasGuardadas ??= execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    cwd: RAIZ,
  })
    .toString('utf8')
    .split('\0')
    // `ls-files -c` sigue listando lo borrado del árbol hasta que se indexa el borrado.
    .filter((f) => f !== '' && existsSync(join(RAIZ, f)));
  return rutasGuardadas;
}

/** Los `.ts` de la carpeta `dir` (relativa a la raíz), con sus subcarpetas. */
export function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, ruta(dir)), { withFileTypes: true })) {
    const r = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...ficheros(r));
    else if (extname(entrada.name) === '.ts') out.push(r);
  }
  return out;
}

// Los listados y el contenido se resuelven UNA vez: seis guardias recorrían
// `src/core` entero por su cuenta, y la sexta lectura del mismo fichero costaba
// más que todo lo demás junto.
export const CORE = ficheros('src/core');
export const CLIENTE = ficheros('src/client');
export const SERVIDOR = ficheros('src/server');
export const HERRAMIENTAS = ficheros('tools');

const CACHE = new Map<string, string>();
const CACHE_SIN_COMENTARIOS = new Map<string, string>();
/** El código de `r` sin comentarios (`sinComentarios`), una vez por fichero, como `leer`. */
export function codigoDe(r: string): string {
  const guardado = CACHE_SIN_COMENTARIOS.get(r);
  if (guardado !== undefined) return guardado;
  const codigo = sinComentarios(leer(r));
  CACHE_SIN_COMENTARIOS.set(r, codigo);
  return codigo;
}

/** El texto de `r` (relativa a la raíz), una vez por fichero. */
export function leer(r: string): string {
  const guardado = CACHE.get(r);
  if (guardado !== undefined) return guardado;
  const texto = readFileSync(join(RAIZ, ruta(r)), 'utf8');
  CACHE.set(r, texto);
  return texto;
}

/**
 * Cualquier forma de traerse `destino`, incluida la que no tiene `from`.
 *
 * Las formas son `from 'x'`, `import('x')`, `require('x')` y `import 'x';` a
 * secas, y de la última —la de efecto lateral, que es justo la que se usa cuando
 * lo único que se quiere es enchufar el módulo— eran ciegos los dos guardias de
 * importación: `import '../../server/director.js'` los dejaba a los ocho en
 * verde. Un guardia con un hueco conocido invita a usar el hueco.
 */
export function importaDe(destino: RegExp): RegExp {
  return new RegExp(`(?:from|import\\(|require\\(|import)\\s*['"](?:${destino.source})`);
}

/** Lo que se carga al evaluar un módulo: `import`/`export … from` de valor, o `import 'x';`. */
const DE_VALOR = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

/**
 * Los ficheros del repo que `r` (relativa a la raíz) carga **al evaluarse**, en su
 * orden: sus `import` y `export … from` de valor y sus `import 'x';` a secas,
 * resueltos y relativos a la raíz. Sin los `import type` ni los `export type` (se
 * borran al compilar), sin los `import()` (van a demanda), sin los paquetes y sin
 * lo comentado (mira el código, `codigoDe`). Resuelve los relativos y el alias
 * `@core/…`; un `.js` que es un `.ts` en el disco, el `.ts`. Lo que no es código
 * (un `.json`, un `.css`) va tal cual: quien recorre el grafo se queda con los `.ts`.
 *
 * Es el único resolutor de los guardias: el de «la página no carga el núcleo»
 * (`arranque.test.ts`) y el de los ciclos (`nivel.ts`). Hasta la fase T cada uno
 * llevaba el suyo, y el de los ciclos solo veía los relativos.
 */
export function importacionesDe(r: string): string[] {
  const out: string[] = [];
  for (const m of codigoDe(r).matchAll(DE_VALOR)) {
    const destino = m[1] as string;
    let absoluto: string;
    if (destino.startsWith('.')) absoluto = resolve(RAIZ, dirname(r), destino);
    else if (destino.startsWith('@core/')) absoluto = join(RAIZ, 'src/core', destino.slice(6));
    else continue;
    const ts = absoluto.replace(/\.js$/, '.ts');
    out.push(relative(RAIZ, existsSync(ts) ? ts : absoluto));
  }
  return out;
}

/** Ficheros que incumplen, con la línea que lo hace: el mensaje del fallo. */
export function infractores(rutas: string[], patron: RegExp): string[] {
  const out: string[] = [];
  for (const r of rutas) {
    for (const [i, linea] of leer(r).split('\n').entries()) {
      if (patron.test(linea)) out.push(`${r}:${i + 1} → ${linea.trim()}`);
    }
  }
  return out;
}

/**
 * El mismo fichero con los COMENTARIOS en blanco y las líneas donde estaban.
 *
 * Hace falta para un solo guardia —el de la coma flotante— y sin él ese guardia
 * **nace rojo**, que es lo que este fichero tiene prohibido. En este repositorio
 * el comentario es el documento de diseño y usa negrita de Markdown, así que
 * `**` sale cinco veces en `generate.ts` y `serialize.ts` sin ser una potencia;
 * y `hero.ts` explica en su docstring que la curva vieja usaba `Math.pow`, que
 * es justo la palabra que se persigue. Un guardia que caza su propia
 * explicación se ignora desde el primer día.
 *
 * Las cadenas NO se ponen en blanco, y es deliberado: solo se siguen para no
 * confundir un `//` de dentro de una con el principio de un comentario —eso sí
 * taparía código de verdad, en silencio—. Un `**` escrito dentro de una cadena
 * da falso positivo, que es el lado bueno por el que fallar y se quita con una
 * línea. Hoy no hay ninguno.
 *
 * Se conservan los saltos de línea uno a uno para que el número de línea del
 * mensaje siga señalando el sitio real del fichero.
 */
export function sinComentarios(texto: string): string {
  let estado: 'codigo' | 'linea' | 'bloque' | 'cadena' = 'codigo';
  let comilla = '';
  let out = '';

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] as string;
    const siguiente = texto[i + 1] ?? '';

    if (estado === 'linea') {
      if (c === '\n') estado = 'codigo';
      out += c === '\n' ? c : ' ';
      continue;
    }
    if (estado === 'bloque') {
      if (c === '*' && siguiente === '/') {
        estado = 'codigo';
        out += '  ';
        i++;
        continue;
      }
      out += c === '\n' ? c : ' ';
      continue;
    }
    if (estado === 'cadena') {
      // La barra invertida se come el carácter de detrás: sin esto, un
      // `'\''` cerraría la cadena donde no toca y el resto de la línea se
      // leería como código.
      if (c === '\\') {
        out += texto.slice(i, i + 2);
        i++;
        continue;
      }
      if (c === comilla) estado = 'codigo';
      out += c;
      continue;
    }

    if (c === '/' && siguiente === '/') {
      estado = 'linea';
      out += '  ';
      i++;
      continue;
    }
    if (c === '/' && siguiente === '*') {
      estado = 'bloque';
      out += '  ';
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      estado = 'cadena';
      comilla = c;
    }
    out += c;
  }
  return out;
}

/** Como `infractores`, pero mirando solo el CÓDIGO: los comentarios no cuentan. */
export function infractoresDeCodigo(rutas: string[], patron: RegExp): string[] {
  const out: string[] = [];
  for (const r of rutas) {
    for (const [i, linea] of codigoDe(r).split('\n').entries()) {
      if (patron.test(linea)) out.push(`${r}:${i + 1} → ${linea.trim()}`);
    }
  }
  return out;
}

/**
 * Las líneas (desde 1) de unas declaraciones de primer nivel de un fichero: de
 * `function`/`class`/`const NOMBRE` a la primera línea que empieza por `}`, o
 * solo la suya si es un `const` de una línea (`const X = y;`: si no, el permiso
 * llegaba hasta el final de la función de debajo). Una que no está lanza:
 * renombrarla no puede ensanchar un permiso sin que se vea.
 */
export function lineasDeLasDeclaraciones(r: string, nombres: readonly string[]): Set<number> {
  const lineas = leer(r).split('\n');
  const out = new Set<number>();
  for (const nombre of nombres) {
    const inicio = lineas.findIndex((l) =>
      new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|class|const)\\s+${nombre}\\b`).test(l),
    );
    if (inicio < 0) throw new Error(`${r} no declara «${nombre}» en su primer nivel`);
    let fin = inicio;
    const deUnaLinea = /\bconst\b[^{[(]*;\s*$/.test(lineas[inicio] ?? '');
    while (!deUnaLinea && fin < lineas.length && !lineas[fin]?.startsWith('}')) fin++;
    for (let n = inicio; n <= fin; n++) out.add(n + 1);
  }
  return out;
}

/** Las líneas (desde 1) de las sentencias `import` de un fichero, de `import` a su `from '…'`. */
export function lineasDeImport(r: string): Set<number> {
  const lineas = leer(r).split('\n');
  const out = new Set<number>();
  for (let i = 0; i < lineas.length; i++) {
    if (!lineas[i]?.startsWith('import ')) continue;
    let fin = i;
    while (
      fin < lineas.length &&
      !/\bfrom\s+['"][^'"]+['"];?\s*$|^import\s+['"]/.test(lineas[fin] ?? '')
    )
      fin++;
    for (let n = i; n <= fin; n++) out.add(n + 1);
    i = fin;
  }
  return out;
}

/** El número de línea, contando desde 1, del carácter `indice` de `texto`. */
export function lineaDe(texto: string, indice: number): number {
  let n = 1;
  for (let i = 0; i < indice; i++) if (texto[i] === '\n') n++;
  return n;
}

/**
 * Cada llamada a `nombre(` del código con su argumento ENTERO: se empareja el
 * paréntesis de cierre en vez de pararse en el primer `)`, y el argumento
 * conserva los saltos de línea.
 *
 * Las cadenas se saltan para que un `)` escrito dentro de una no cierre la
 * llamada. Un `${…}` dentro de una plantilla no se analiza: su contenido cuenta
 * como parte de la cadena. Hoy ningún argumento de `creature(` lleva plantilla.
 */
export function llamadasA(nombre: string, codigo: string): { inicio: number; argumento: string }[] {
  const out: { inicio: number; argumento: string }[] = [];
  for (const m of codigo.matchAll(new RegExp(`\\b${nombre}\\s*\\(`, 'g'))) {
    const abre = m.index + m[0].length;
    let nivel = 1;
    let comilla = '';
    let i = abre;
    for (; i < codigo.length && nivel > 0; i++) {
      const c = codigo[i] as string;
      if (comilla !== '') {
        if (c === '\\') i++;
        else if (c === comilla) comilla = '';
        continue;
      }
      if (c === "'" || c === '"' || c === '`') comilla = c;
      else if (c === '(') nivel++;
      else if (c === ')') nivel--;
    }
    if (nivel > 0) throw new Error(`llamada a ${nombre}( sin cerrar en el carácter ${m.index}`);
    out.push({ inicio: m.index, argumento: codigo.slice(abre, i - 1).trim() });
  }
  return out;
}
