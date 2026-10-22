/**
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
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playAiGame } from '../src/core/ai/turn.js';
import { stackSpeed } from '../src/core/battle/battle.js';
import { effectiveAttack, effectiveDefense } from '../src/core/battle/damage.js';
import {
  applyEffect,
  EFFECT_KINDS,
  type EffectKind,
  effectiveLuck,
} from '../src/core/battle/effects.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { battleActionSchema, RESPONSE_FORMAT } from '../src/core/contract/agent.js';
import {
  CATALOGO_DE_EQUIPO_EN_PROSA,
  serializeBattleResponse,
} from '../src/core/contract/serialize.js';
import { HITS, SLOT_DE_HUECO, SLOTS, type Slot } from '../src/core/contract/vocabulario.js';
import { CAMPOS_DE_PIEZA, EQUIPO } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import type { GameState } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { CREATURE_TRAITS, HUECOS } from '../src/core/types.js';
import { batallaConDos, TROPA } from './helpers.js';
import { bloquesCss, COLOR, hojasDelCliente } from './hojas-de-estilo.js';
import { rango, segunPrisa } from './lento.js';

// `new URL(...).pathname` devuelve la ruta PERCENT-ENCODED: en un checkout que
// viva en una ruta con espacios o paréntesis daba `…/ruta%20con%20(…)/repo` y
// los NUEVE invariantes morían con ENOENT al cargar el módulo, antes de que
// ninguno llegara a comprobar nada. `fileURLToPath` decodifica.
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
/**
 * La ruta absoluta de ESTE checkout, sin la barra final.
 *
 * Se deriva en ejecución a propósito, y no se escribe como literal: si
 * estuviera escrita, el guardia que la busca se encontraría a sí mismo y habría
 * que excluir su propio fichero — una excepción que el día de mañana tapa a la
 * siguiente. Derivada, este fichero no la contiene.
 */
const RUTA_DE_ESTA_MAQUINA = RAIZ.replace(/\/$/, '');

/**
 * Las clases que este guardia NO mira, y el motivo de cada una.
 *
 * La lista es NEGRA a propósito, y esto es lo que se aprendió: en blanco
 * —`.json`, `.ts`, `.sh`…— falla **en silencio** ante cualquier clase que nadie
 * previó. Se plantaron ocho ficheros con la ruta dentro (`.json`, `.mjs`,
 * `.cjs`, `.js`, `.tsx`, `.toml`, `.envrc` y un ejecutable sin extensión) y solo
 * cazó uno: se le escapaba el `.js`, que es la clase más ejecutada que hay en un
 * repo de Node. En negro falla al revés: un formato de prosa nuevo da un falso
 * positivo, que se VE y se quita con una línea aquí.
 *
 * Por eso lo que se enumera es lo que **lee una persona**, no lo que ejecuta una
 * máquina: la segunda lista no se puede terminar.
 */
const CLASES_QUE_LEE_UNA_PERSONA = [
  // Prosa. Los documentos de `docs/agents/` CITAN rutas absolutas justo para
  // explicar este fallo, y quien los lee sabe que esa ruta es de otra máquina.
  // Acotar por clase y no por carpeta es lo que mantiene el guardia sin
  // excepciones: una excepción por carpeta taparía al siguiente `.json` que
  // cayera dentro de ella.
  '.md',
  '.txt',
];
// `.css` y `.html` estuvieron aquí, y era falso: sus URL NO las resuelve solo el
// navegador. Vite las resuelve contra el disco al construir, y se comprobó —una
// ruta absoluta de ESTA máquina en el `<script src>` de `index.html` construye
// con rc=0, y la de otra máquina falla con «Failed to resolve»—, así que un
// checkout ajeno se rompe. Con `.css` llegó a copiar el PNG a `dist/`. La regla
// se sostiene: lo que se excluye es lo que lee una PERSONA, y un `.html` lo lee
// una herramienta.

/**
 * Un fichero al que tiene sentido buscarle texto: existe, es un fichero de
 * verdad y no es binario.
 *
 * Lo de «de verdad» no es celo: `git ls-files` lista también enlaces
 * simbólicos, y uno que apunte a un directorio —un `node_modules` enlazado a
 * mano, que la línea `node_modules/` de `.gitignore` no aparta porque para git
 * eso no es un directorio— revienta al abrirlo con EISDIR y se lleva por delante
 * los NUEVE invariantes. Salió corriendo esto mismo en un checkout copiado.
 *
 * Y los binarios se DETECTAN —un byte cero en los primeros 8000 bytes, que es lo
 * que mira git— en vez de enumerarlos, porque la lista de extensiones
 * binarias es justo la que no se puede terminar: hoy `.png` y `.jpg`, mañana un
 * `.woff`. Un binario raro sin ceros al principio se leería como texto: sale un
 * falso positivo, que es el lado bueno por el que fallar.
 */
function esTextoDeMaquina(ruta: string): boolean {
  const completa = join(RAIZ, ruta);
  const info = statSync(completa, { throwIfNoEntry: false });
  if (info === undefined || !info.isFile()) return false;

  const fd = openSync(completa, 'r');
  try {
    const cabeza = Buffer.alloc(8000);
    const leidos = readSync(fd, cabeza, 0, cabeza.length, 0);
    return !cabeza.subarray(0, leidos).includes(0);
  } finally {
    closeSync(fd);
  }
}

let rutasGuardadas: readonly string[] | null = null;

/**
 * Lo que hay en el repo, indexado o no: `-o --exclude-standard` es la mitad que
 * faltaba. Una sola llamada a git por corrida: la leen `ficherosDeMaquina` y los
 * guardias de lo retirado (`lineasCon`).
 *
 * `git ls-files` a secas lista solo lo indexado, y un fichero nuevo sin
 * `git add` —que es como nacen las presas, y como está el árbol justo cuando
 * corre el hook `Stop`— pasaba por debajo. Es la misma llamada que ya hacía
 * `.claude/hooks/verde.sh` dos ficheros más allá.
 */
function rutasDelRepo(): readonly string[] {
  rutasGuardadas ??= execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    cwd: RAIZ,
  })
    .toString('utf8')
    .split('\0')
    // `ls-files -c` sigue listando lo borrado del árbol hasta que se indexa el borrado.
    .filter((f) => f !== '' && existsSync(join(RAIZ, f)));
  return rutasGuardadas;
}

function ficherosDeMaquina(): string[] {
  return rutasDelRepo().filter(
    (f) => !CLASES_QUE_LEE_UNA_PERSONA.includes(extname(f).toLowerCase()) && esTextoDeMaquina(f),
  );
}

/** Lo que se lee como código o datos en los guardias de lo retirado. */
const TEXTO_DE_CODIGO = new Set(['.ts', '.json', '.html', '.css', '.js', '.mjs']);

/**
 * Cada línea de `src/`, `data/` y `tools/` en que casa `viejo`, como
 * `ruta:línea → texto`, comentarios incluidos: lo que leen los guardias de lo
 * que se retiró (los caballeros, los recursos de antes del oro).
 */
function lineasCon(viejo: RegExp): string[] {
  return rutasDelRepo()
    .filter((f) => /^(?:src|data|tools)\//.test(f) && TEXTO_DE_CODIGO.has(extname(f)))
    .flatMap((f) =>
      leer(f)
        .split('\n')
        .flatMap((l, i) => (viejo.test(l) ? [`${f}:${i + 1} → ${l.trim().slice(0, 120)}`] : [])),
    );
}

function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...ficheros(ruta));
    else if (extname(entrada.name) === '.ts') out.push(ruta);
  }
  return out;
}

// Los listados y el contenido se resuelven UNA vez: seis guardias recorrían
// `src/core` entero por su cuenta, y la sexta lectura del mismo fichero costaba
// más que todo lo demás junto.
const CORE = ficheros('src/core');
const CLIENTE = ficheros('src/client');
const SERVIDOR = ficheros('src/server');

const CACHE = new Map<string, string>();
const CACHE_SIN_COMENTARIOS = new Map<string, string>();
/** El código de `ruta` sin comentarios (`sinComentarios`), una vez por fichero, como `leer`. */
function codigoDe(ruta: string): string {
  const guardado = CACHE_SIN_COMENTARIOS.get(ruta);
  if (guardado !== undefined) return guardado;
  const codigo = sinComentarios(leer(ruta));
  CACHE_SIN_COMENTARIOS.set(ruta, codigo);
  return codigo;
}
/**
 * Las hojas del cliente que vigilan los guardias de colores fijos y de la forma
 * de los temas: todas las del disco menos `temas.css`, que solo lleva fichas (y
 * vigila `temas.test.ts`). Del disco y no de una lista: una hoja nueva no se
 * libra sin que nadie lo note.
 */
const HOJAS_CON_REGLAS = hojasDelCliente().filter((r) => r !== 'src/client/temas.css');

function leer(ruta: string): string {
  const guardado = CACHE.get(ruta);
  if (guardado !== undefined) return guardado;
  const texto = readFileSync(join(RAIZ, ruta), 'utf8');
  CACHE.set(ruta, texto);
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
function importaDe(destino: RegExp): RegExp {
  return new RegExp(`(?:from|import\\(|require\\(|import)\\s*['"](?:${destino.source})`);
}

/** Ficheros que incumplen, con la línea que lo hace: el mensaje del fallo. */
function infractores(rutas: string[], patron: RegExp): string[] {
  const out: string[] = [];
  for (const ruta of rutas) {
    for (const [i, linea] of leer(ruta).split('\n').entries()) {
      if (patron.test(linea)) out.push(`${ruta}:${i + 1} → ${linea.trim()}`);
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
function sinComentarios(texto: string): string {
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
function infractoresDeCodigo(rutas: string[], patron: RegExp): string[] {
  const out: string[] = [];
  for (const ruta of rutas) {
    for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
      if (patron.test(linea)) out.push(`${ruta}:${i + 1} → ${linea.trim()}`);
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
function lineasDeLasDeclaraciones(ruta: string, nombres: readonly string[]): Set<number> {
  const lineas = leer(ruta).split('\n');
  const out = new Set<number>();
  for (const nombre of nombres) {
    const inicio = lineas.findIndex((l) =>
      new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|class|const)\\s+${nombre}\\b`).test(l),
    );
    if (inicio < 0) throw new Error(`${ruta} no declara «${nombre}» en su primer nivel`);
    let fin = inicio;
    const deUnaLinea = /\bconst\b[^{[(]*;\s*$/.test(lineas[inicio] ?? '');
    while (!deUnaLinea && fin < lineas.length && !lineas[fin]?.startsWith('}')) fin++;
    for (let n = inicio; n <= fin; n++) out.add(n + 1);
  }
  return out;
}

/** Las líneas (desde 1) de las sentencias `import` de un fichero, de `import` a su `from '…'`. */
function lineasDeImport(ruta: string): Set<number> {
  const lineas = leer(ruta).split('\n');
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

/** Dónde se puede nombrar lo de la arena sin permiso, y todo lo que se mira. */
const RUTAS_DE_LA_ARENA = {
  enTodoElFichero: (r: string): boolean =>
    r.startsWith('src/core/battle/') ||
    r === 'src/core/arena.ts' ||
    r.startsWith('src/client/arena/'),
  todas: (): string[] => [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros('tools')],
};

/**
 * Quién usa el montador de la arena (`core/arena.ts`) fuera de ella, y en qué
 * declaraciones: la sesión de la arena (la clase, no el resto de `session.ts`,
 * que es la partida), las pasadas de la arena de `pnpm capturas`, que juegan su
 * espejo, y la medida de la IA contra la IA en la arena (#259, #260, #262). Lo lee
 * el guardia de la puerta de las batallas.
 */
const PERMISOS_DE_LA_ARENA: Readonly<Record<string, readonly string[]>> = {
  'src/client/session.ts': ['SesionDeArena'],
  'tools/qa/capturas.ts': [
    'espejoDeLaArena',
    'todoIA',
    'espejoDelBanco',
    'jugarArena',
    'espejoDeLosPoderes',
    'poderesEnLaArena',
    'ataqueEnLaPelea',
    'espejoDeLaRueda',
    'jugarLaRueda',
    'todoEnIAConLaRueda',
    'espejoDeLasArmas',
    // Yo contra Yo con la rueda, de uno o de tres por bando (los contrincantes, #261).
    'espejoYoContraYo',
    'hastaLaRuedaYoContraYo',
    // El enlace de la versión anterior se escribe con la de hoy menos uno
    // (`VERSION_DEL_ENLACE`): no monta nada.
    'enlaceDeLaPelea',
  ],
  // La IA contra la IA en la arena (#259, #260, #262): sus tandas y la pelea.
  'tools/qa/arena-ia.ts': ['TANDAS', 'medir'],
};

/** El número de línea, contando desde 1, del carácter `indice` de `texto`. */
function lineaDe(texto: string, indice: number): number {
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
function llamadasA(nombre: string, codigo: string): { inicio: number; argumento: string }[] {
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

/**
 * La única forma permitida de leer el catálogo con el cuerpo, y solo en la
 * inversa del cable: la rama `catalogo` de un `switch` sobre el origen del MISMO
 * stack, devolviendo la llamada sin nada en medio y con la veteranía de ese
 * mismo origen —
 * `switch (X.origen.kind) { case 'catalogo': return cifrasDeCatalogo(X.body, X.origen.veterania);`—,
 * o guardándola en una constante de esa misma rama (`case 'catalogo': { const
 * u = cifrasDeCatalogo(…)`), que es como la inversa rehace además el precio.
 * Se mira LA LLAMADA, no la línea en que cae.
 *
 * Antes la forma permitida era `return creature(X.body)`, y la veteranía se
 * sumaba fuera del `switch`: era la tercera copia de «cifras = catálogo +
 * veteranía». Ahora la regla vive en una función de `core` y la excepción es
 * para esa función, no una segunda: `creature(X.body)` ya no pasa en ningún
 * fichero.
 *
 * Antes la forma era `X.unit ?? creature(X.body)`: «el catálogo donde `unit`
 * no viajó». Eso preguntaba por la ausencia de un campo, y un personaje que
 * llegara sin cifras iba a buscar al catálogo las de un cuerpo que no está en
 * él. Ahora decide el discriminante, y el guardia exige el discriminante.
 */
function esRellenoDelCable(codigo: string, inicio: number, argumento: string): boolean {
  const cuerpo = /^(\w+)\.origen\.unidad\s*,\s*(\w+)\.origen\.veterania$/.exec(argumento);
  if (cuerpo === null || cuerpo[1] !== cuerpo[2]) return false;
  const antes = codigo.slice(Math.max(0, inicio - 200), inicio);
  const rama =
    /\bswitch\s*\(\s*(\w+)\.origen\.kind\s*\)\s*\{\s*case\s+'catalogo'\s*:\s*(?:\{\s*const\s+\w+\s*=|return)\s+$/.exec(
      antes,
    );
  return rama !== null && rama[1] === cuerpo[1];
}

/**
 * El precio que rehace la inversa del cable: `oroDeUnidad(X.origen.unidad)` dentro
 * de la rama `'catalogo'` de un `switch (X.origen.kind)` sobre el MISMO stack, sin
 * otra rama en medio. El precio de rendición no viaja (`stackAlCable`) y es del
 * catálogo, como las cifras.
 */
function esPrecioDelCable(codigo: string, inicio: number, argumento: string): boolean {
  const x = /^(\w+)\.origen\.unidad$/.exec(argumento)?.[1];
  if (x === undefined) return false;
  const antes = codigo.slice(Math.max(0, inicio - 600), inicio);
  const rama = [...antes.matchAll(/\bcase\s+'(\w+)'\s*:/g)].pop();
  if (rama === undefined || rama[1] !== 'catalogo') return false;
  const sw = /\bswitch\s*\(\s*(\w+)\.origen\.kind\s*\)\s*\{\s*$/.exec(antes.slice(0, rama.index));
  return sw !== null && sw[1] === x;
}

/**
 * Si el fichero importa del catálogo (`data.js` o `catalogo.js`), con su nombre y también como
 * tipo, alguno de `nombres`: la misma pregunta para el guardia de `creature` como
 * valor y para el de la arena sin el catálogo del juego.
 */
function importaCreature(codigo: string, nombres: readonly string[]): boolean {
  const alguno = nombres.join('|');
  return new RegExp(
    `import\\s*(?:type\\s*)?\\{[^}]*\\b(?:${alguno})\\b[^}]*\\}\\s*from\\s*['"][^'"]*\\/(?:data|catalogo)\\.js['"]`,
  ).test(codigo);
}

/**
 * Dónde aparece `creature` como VALOR y no como llamada: pasada a `map`, a
 * `then`, asignada a otra variable. Lo que no cuenta: la propia importación,
 * la llamada, una propiedad (`s.creature`, `{ creature: … }`, `creature?:`) y
 * el texto de una cadena (`'creature'`).
 */
function creatureComoValor(codigo: string, nombre: string): number[] {
  const sinImports = codigo.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  const out: number[] = [];
  for (const m of sinImports.matchAll(
    new RegExp(`(?<![\\w.$'"\`-])${nombre}\\b(?![\\w$'"\`-])`, 'g'),
  )) {
    const detras = sinImports.slice(m.index + m[0].length);
    if (/^\s*\(/.test(detras)) continue; // la llamada: la mira `llamadasA`
    if (/^\s*\??:/.test(detras)) continue; // clave de objeto o anotación de tipo
    out.push(m.index);
  }
  return out;
}

/**
 * Lo que el núcleo PUEDE llamar de `Math`, copiado de `CLAUDE.md`.
 *
 * La lista es BLANCA, al revés que la del guardia de las rutas absolutas, y el
 * motivo es que aquí lo cerrado es lo permitido: `CLAUDE.md` publica esas siete
 * y promete que no hay más. Una lista NEGRA —`pow`, `sin`, `cos`…— es la que
 * fallaría en silencio, porque la escribe quien se acuerda de las que conoce:
 * `fround`, `sinh`, `log1p`, `expm1` o la que traiga la próxima norma se
 * colarían sin que nadie se enterara, y son exactamente las que la norma NO
 * obliga a calcular igual en dos máquinas.
 *
 * En blanco falla al revés y se ve: una función nueva, determinista y entera
 * —`trunc`, `sign`— da rojo hasta que alguien la escriba aquí, que es una línea
 * y una decisión tomada a la vista en vez de por omisión.
 */
const MATH_PERMITIDO = ['min', 'max', 'floor', 'ceil', 'abs', 'round', 'imul'] as const;

/**
 * Cada tipo de efecto temporal con el lector del motor que suma su total.
 *
 * La tabla no es documentación: el test la recorre LLAMANDO a cada lector, así
 * que uno escrito y muerto no puede satisfacerla. Va tipada por `string` a
 * propósito y no por `EffectKind`: con `Record<EffectKind, …>` un tipo nuevo
 * rompería el `tsc` y el aserto de cobertura no llegaría a correr nunca.
 */
const LECTORES_DE_EFECTO: Readonly<Record<string, (s: BattleStack) => number>> = {
  speed: stackSpeed,
  luck: effectiveLuck,
  attack: (s) => effectiveAttack(s),
  // La rueda del golpe (Defensivo y Romper guardia).
  defense: (s) => effectiveDefense(s),
};

/** Un stack limpio, fuera de tablero: solo se le cuelgan efectos y se lee. */
function stackDePrueba(): BattleStack {
  return {
    id: 'guardia-0',
    side: 'attacker',
    slot: 0,
    body: 'templario-escudo',
    unit: unidadDelJuego(TROPA),
    origen: { kind: 'catalogo', unidad: TROPA, oro: 200, veterania: null },
    initialCount: 10,
    count: 10,
    topHp: 1,
    hex: { col: 0, row: 0 },
    escalera: false,
    retaliated: false,
    defending: false,
    waited: false,
    acted: false,
    gotMoraleBonus: false,
    morale: 0,
    luck: 0,
    effects: [],
    ganado: { experiencia: 0, bajas: 0, heroes: [] },
  };
}

describe('invariantes del proyecto', () => {
  it('`core` es puro: no importa nada de node', () => {
    // Sin esto los mismos tests no valdrían para el navegador y para el
    // servidor, que es justo lo que hace barato el núcleo.
    expect(infractores(CORE, importaDe(/node:/))).toEqual([]);
  });

  it('`core` es puro: no toca el DOM', () => {
    expect(
      infractores(
        CORE,
        /\b(document|window|navigator|localStorage)\s*\.|\b(HTMLElement|HTMLImageElement|CanvasRenderingContext2D)\b/,
      ),
    ).toEqual([]);
  });

  it('`core` no conoce al servidor: la dependencia va en un solo sentido', () => {
    // La salida fácil a «el agente tiene que defender» era un `import` del
    // director dentro de `core`, y los otros guardias la habrían dejado pasar:
    // el servidor no es `node:` ni es DOM. El núcleo se entera de que hay
    // alguien conduciendo por un TIPO de callback (`BattleTakeover`), no por
    // una importación — así los mismos tests siguen valiendo en el navegador,
    // donde `src/server` ni existe.
    expect(
      infractores(CORE, importaDe(/@server\/|[^'"]*\.\.?\/server\/|[^'"]*\/src\/server\//)),
    ).toEqual([]);
  });

  it('toda tirada pasa por createRng: no hay Math.random suelto', () => {
    // Sin semilla no hay partida reproducible y un test de batalla sería una
    // lotería que un día falla sin que nadie sepa por qué.
    expect(infractores([...CORE, ...CLIENTE, ...SERVIDOR], /Math\.random\s*\(/)).toEqual([]);
  });

  it('`core` no ejecuta coma flotante que dependa de la plataforma', () => {
    // `CLAUDE.md` promete que `pnpm banco` vale FUERA de esta máquina, y toda
    // la promesa se apoya en esta frase suya: «el núcleo no ejecuta ni una
    // operación de coma flotante que dependa de la plataforma — solo
    // min/max/floor/ceil/abs/round/imul, nada de Math.pow, ni **, ni
    // trigonometría». La norma fija el resultado de `+`, `-`, `*` y `/` al bit,
    // pero NO el de `pow`, `sqrt` compuesto, `sin`, `exp` ni sus parientes: dos
    // motores pueden devolver el último bit distinto y ahí el sha256 de 200
    // partidas deja de significar nada, sin que nada se ponga rojo.
    //
    // La promesa se sostenía por ACCIDENTE. `experienceForLevel` era
    // `Math.round(1000 * 1.4 ** (n-2))` desde el primer día y nadie la
    // llamaba: era código muerto, así que ninguna partida ejecutaba el
    // `Math.pow` que hay debajo del `**`. El ciclo que abre el surtidor de
    // experiencia la pone en el camino de cada batalla, y ahí la promesa se
    // habría roto en silencio. (Esa función ya no existe: los umbrales de hoy
    // son Fibonacci, en `hero/experiencia.ts`, y solo suman y multiplican
    // enteros. El guardia sigue valiendo para ellos y para el siguiente.)
    //
    // Dos mitades, y la primera es la que decide la forma:
    //  1. **el identificador `Math` solo puede aparecer como `Math.<permitido>`**
    //     — el porqué de la lista blanca está en su docstring: lo cerrado y
    //     publicado es lo permitido, no lo prohibido;
    //  2. el operador `**`, que es `Math.pow` escrito de otra manera y no lo
    //     caza la primera.
    //
    // La primera mitad miraba `Math\.<algo>` y **tenía un agujero que encontró
    // QA**: `const { pow } = Math;` no escribe `Math.pow` en ninguna parte y
    // pasaba limpio, igual que `const M = Math` o `Math['pow']`. La batería de
    // sondas original tampoco lo cubría —tres sondas, las tres con punto—, así
    // que lo estrecho era la prueba y no la idea. La regla correcta es la
    // conclusión de la lista blanca llevada hasta el final: la ÚNICA forma
    // permitida de nombrar `Math` en el núcleo es seguida de una de las siete.
    // Cualquier otra mención —desestructurar, aliasar, indexar con corchetes—
    // es un infractor, porque de ahí en adelante ya no se puede saber qué se
    // llama.
    //
    // Mira el CÓDIGO y no el fichero: los comentarios de este repositorio
    // llevan negrita de Markdown y explican con sus nombres las funciones que
    // se prohíben, así que sin `sinComentarios` este guardia nacería rojo con
    // seis presas y todas falsas.
    //
    // Se rompió a mano, se miró rojo y se arregló, que es la regla de la casa.
    // Ocho sondas en `src/core/hero/hero.ts`, y las cuatro últimas son las que
    // el guardia no veía en su primera versión: `Math.pow`, `1.4 ** n`,
    // `Math.hypot`, `Math.sqrt`, un `2 ** n` detrás de una cadena que lleva
    // dentro las dos marcas de comentario, `const { pow } = Math`,
    // `const { pow: elevar } = Math` y `Math['pow']`. Las ocho salieron con su
    // fichero y su línea, y el `Math.pow` que el docstring de al lado cita por
    // su nombre NO salió.
    const permitidos = MATH_PERMITIDO.join('|');
    const puertas: readonly (readonly [string, RegExp])[] = [
      [
        'una mención de `Math` que no es `Math.<permitido>`',
        new RegExp(`\\bMath\\b(?!\\s*\\.\\s*(?:${permitidos})\\b)`),
      ],
      ['el operador `**`, que es `Math.pow` con otra cara', /\*\*/],
    ];
    const colados = puertas.flatMap(([puerta, patron]) =>
      infractoresDeCodigo(CORE, patron).map((donde) => `[${puerta}] ${donde}`),
    );
    expect(colados).toEqual([]);
  });

  it('una puerta para montar batallas: `createBattle` (19-10-2026)', () => {
    // Un solo combate para el juego y la arena: la rueda, salir del contacto, la
    // carga a pie y la armadura siempre, sin interruptores. Toda batalla nace en
    // `createBattle`, la única que escribe un `BattleState` entero: el campo
    // `golpeEnCurso:` como clave de un objeto solo está ahí (y en la interfaz).
    // Quien montara otra batalla a mano —con otras reglas, o con un campo de más—
    // tendría que escribirlo. Roto a mano (19-10-2026): un `{ golpeEnCurso: null }`
    // en `state/game.ts` sale rojo con su línea.
    const PERMITIDOS: Readonly<Record<string, readonly string[]>> = {
      'src/core/battle/battle.ts': ['createBattle'],
    };
    const escribeElEstado = /(?:^\s*|[{,]\s*)golpeEnCurso\s*:/;
    const fuera: string[] = [];
    for (const ruta of RUTAS_DE_LA_ARENA.todas()) {
      if (ruta === 'src/core/battle/types.ts') continue;
      const conPermiso = lineasDeLasDeclaraciones(ruta, PERMITIDOS[ruta] ?? []);
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (conPermiso.has(i + 1)) continue;
        if (escribeElEstado.test(linea)) fuera.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(fuera).toEqual([]);

    // Y el montador de la arena (`core/arena.ts`: el montaje, la ficha, el retoque
    // y el enlace) es de la arena: solo la arena (página, disco y taller), la
    // sesión y `pnpm capturas` lo importan; y en la sesión y en `capturas.ts`, lo
    // importado de allí solo se usa dentro de sus declaraciones con permiso
    // (`PERMISOS_DE_LA_ARENA`). Sin excepciones en el núcleo (simplify de F1,
    // 18-10-2026): el formato de la unidad y del catálogo vive en `core/unidad.ts`.
    // Roto a mano (19-10-2026): un `import type` de `./arena.js` en
    // `core/catalogo.ts` y un `batallaDeArena` usado en `session.ts` fuera de
    // `SesionDeArena` salen rojos con su línea.
    const { enTodoElFichero } = RUTAS_DE_LA_ARENA;
    const porDeclaracion = PERMISOS_DE_LA_ARENA;
    const deLaArena =
      /\bfrom\s+['"](?:@core\/|(?:\.\.?\/)+(?:(?:src\/)?core\/)?)arena(?:\.js)?['"]/;
    const puedeImportarla = (r: string): boolean =>
      enTodoElFichero(r) ||
      r.startsWith('tools/arena/') ||
      r.startsWith('tools/taller/') ||
      r in porDeclaracion;
    const colados: string[] = [];
    for (const ruta of RUTAS_DE_LA_ARENA.todas().filter((r) => !enTodoElFichero(r))) {
      const texto = leer(ruta);
      const codigo = codigoDe(ruta).split('\n');
      const conPermiso = lineasDeLasDeclaraciones(ruta, porDeclaracion[ruta] ?? []);
      const imports = lineasDeImport(ruta);
      // Los VALORES que trae de `core/arena.ts`, sacados de su `import` entero;
      // un tipo no monta ninguna batalla.
      const traidos: string[] = [];
      for (const bloque of texto.matchAll(
        /^import\s+(type\s+)?\{([^}]*)\}\s*from\s+(['"][^'"]+['"])/gm,
      )) {
        if (!deLaArena.test(`from ${bloque[3]}`)) continue;
        if (bloque[1]) continue;
        for (const nombre of (bloque[2] ?? '').split(',')) {
          if (/^\s*type\s/.test(nombre)) continue;
          const local = nombre
            .split(/\s+as\s+/)
            .pop()
            ?.trim();
          if (local) traidos.push(local);
        }
      }
      const usaLaArena = traidos.length ? new RegExp(`\\b(?:${traidos.join('|')})\\b`) : null;
      for (const [i, linea] of codigo.entries()) {
        if (imports.has(i + 1)) {
          if (deLaArena.test(linea) && !puedeImportarla(ruta))
            colados.push(`${ruta}:${i + 1} importa de core/arena.ts`);
          continue;
        }
        if (conPermiso.has(i + 1)) continue;
        if (usaLaArena && ruta in porDeclaracion && usaLaArena.test(linea))
          colados.push(`${ruta}:${i + 1} usa la arena fuera de su permiso → ${linea.trim()}`);
      }
    }
    expect([...new Set(colados)]).toEqual([]);
  });

  it('nadie escribe fheroes2: sin interruptores de reglas ni de modos (19-10-2026)', () => {
    // Las reglas de fheroes2 de la arena (`battle/reglas.ts`) y sus modos
    // (`battle/modos.ts`: la rueda, el contacto y la carga a pie con interruptor)
    // se retiraron con la decisión 7 del usuario: la arena pelea como el juego.
    // Lo retirado no vuelve por la puerta de atrás: ni la versión `'fheroes2'`
    // escrita en un literal, ni los nombres de lo que la elegía, en el código de
    // `src/` y `tools/` (los comentarios citan la fuente de fheroes2 y no cuentan).
    // Roto a mano (19-10-2026): un `tirador: 'fheroes2'` en `capturas.ts` y un
    // `typeof MODOS_DEL_JUEGO` en `state/game.ts` salen rojos con su línea.
    const retirado =
      /['"`]fheroes2['"`]|\b(?:crearBatallaConReglas|REGLAS_DEL_JUEGO|ReglasDeBatalla|reglasDeLaURL|conRegla|MODOS_DEL_JUEGO|MODOS_DE_LA_ARENA|ModosDeArena|modoDeLaURL|conModo|pagaElContacto)\b|\bconRueda\(|\bbattle\/(?:reglas|modos)(?:\.js)?['"]/;
    const fuera: string[] = [];
    for (const ruta of RUTAS_DE_LA_ARENA.todas()) {
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (retirado.test(linea)) fuera.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(fuera).toEqual([]);
    expect(existsSync(join(RAIZ, 'src/core/battle/reglas.ts'))).toBe(false);
    expect(existsSync(join(RAIZ, 'src/core/battle/modos.ts'))).toBe(false);
  });

  it('el cliente no aplica reglas: la única puerta al núcleo es session.ts', () => {
    // El cliente pinta y manda intenciones. Cuando la partida se juegue por
    // WebSocket, lo que cambia es esa capa y solo esa — pero solo si nadie más
    // ha abierto una puerta lateral mientras tanto.
    //
    // Mira el CÓDIGO y no el fichero (#114): leyendo comentarios mordió la
    // explicación de `desenlace.ts`, que nombraba `playAiTurn` y `newGame` para
    // decir por qué el módulo existe, y se arregló buscando sinónimos. Un
    // `import` no vive en un comentario, y `sinComentarios` deja las cadenas,
    // así que un acceso por nombre (`s['newGame']`) sigue cayendo. Roto a mano:
    // una llamada a `newGame` en `desenlace.ts` sale roja; un comentario que la
    // nombra, no.
    const puertas =
      /\b(applyAdventureAction|applyAction|resolvePendingBattle|settleBattle|playAiTurn|chooseBattleAction|newGame|retocarEnBatalla)\b/;
    const fuera = CLIENTE.filter((r) => r !== 'src/client/session.ts');
    expect(infractoresDeCodigo(fuera, puertas)).toEqual([]);
  });

  it('el cruce lo conducen `CruceDeLaRueda` (cliente) y el director (servidor), con el paso del núcleo', () => {
    // La partida y la arena eligen en la rueda por la misma pieza: la IA sortea a
    // ciegas por los bandos que lleva y lo de la persona espera su elección. Hasta
    // F5 la partida llamaba a `completarCruce` sin decirle quién era la persona, y
    // la IA elegía por ella su golpe y su respuesta (el parche de F4). Quien la
    // llamara fuera de esa clase podría volver a elegir por la persona. Desde el
    // simplify de F3-F6 (19-10-2026) el paso del cruce es del núcleo
    // (`pasoDelCruce`, `plantarse`, `ai/rueda.ts` y `battle.ts`) y lo conducen dos:
    // `CruceDeLaRueda` en el cliente y el director del agente en el servidor.
    // Roto a mano (19-10-2026): un `completarCruce(battle, action, this.ctx.rng)` en
    // `Session.playBattleAction` y un `plantarse(battle, a, rng)` en
    // `server/partida.ts` salen rojos con su línea.
    const llama = /\b(?:completarCruce|pasoDelCruce|plantarse|soltarElGolpe)\s*\(/;
    const conPermiso = lineasDeLasDeclaraciones('src/client/session.ts', ['CruceDeLaRueda']);
    const fuera: string[] = [];
    for (const ruta of [...CLIENTE, ...SERVIDOR]) {
      if (ruta === 'src/server/director.ts') continue;
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (ruta === 'src/client/session.ts' && conPermiso.has(i + 1)) continue;
        if (llama.test(linea)) fuera.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(fuera).toEqual([]);
  });

  it('el marcado sale por una sola puerta: solo `html.ts` convierte texto en DOM', () => {
    // El cerrojo de verdad de #63 es de TIPOS: `pintar` solo acepta `Html` y las
    // funciones de `views/panels.ts` lo devuelven, así que una nueva que
    // devuelva `string` no compila. Este guardia cierra las dos puertas que el
    // compilador no puede: escribir en el DOM sin pasar por `pintar`, y fabricar
    // un `Html` desde fuera con un cast.
    //
    // Fabricarlo exige `as unknown as` porque `Html` lleva una propiedad de
    // símbolo privado del módulo — comprobado a mano con tres sondas: una cadena
    // no compila (TS2345), `'…' as Html` pide pasar por `unknown` primero
    // (TS2352), y un objeto con OTRO símbolo sale con «Property '[MARCA]' is
    // missing». O sea que el único camino queda a la vista, y es este el que lo
    // acota a un fichero.
    //
    // **Es medio BLANCO y medio NEGRO, y las dos mitades están así a propósito.**
    // Este repositorio tiene los dos precedentes y los tiene enfrentados: el de
    // las rutas absolutas es negro porque lo cerrado y enumerable es lo que se
    // EXCLUYE —la prosa—, y el de la coma flotante es blanco porque lo cerrado y
    // publicado es lo PERMITIDO —las siete de `Math`—. Aquí no vale ninguno de
    // los dos enteros:
    //
    //  1. **Blanca**, y es la mitad que de verdad guarda: el token `HTML` solo
    //     puede aparecer seguido de uno de los tipos del DOM que el cliente
    //     declara. Con eso caen `innerHTML`, `outerHTML`, `insertAdjacentHTML`
    //     **y las que todavía no existen** —`setHTMLUnsafe`, `parseHTMLUnsafe`,
    //     `getHTML`— sin que nadie tenga que acordarse de añadirlas. Se puede
    //     cerrar porque lo permitido sí es enumerable: el cliente usa TRES tipos
    //     `HTML*` y ninguno más.
    //  2. **Negra**, y no hay forma de evitarlo: los parseadores que NO llevan
    //     `HTML` en el nombre. `createContextualFragment`, `DOMParser`,
    //     `document.write`. Una lista blanca de «APIs del DOM permitidas» sería
    //     el DOM entero —`createElement`, `appendChild`, `getBoundingClientRect`,
    //     el canvas…—, o sea abierta, y una lista abierta como blanca es un
    //     guardia que nace rojo. Así que esta mitad **caduca**: el día que la
    //     plataforma añada otra forma de convertir una cadena en DOM sin la
    //     palabra `HTML` dentro, hay que escribirla aquí. Queda dicho para que
    //     nadie la herede creyendo que se cubre sola.
    //
    // **Y una TERCERA mitad, que es blanca por SITIOS y no por nombres.** La
    // primera redacción decía que `setAttribute` no lo miraba nadie y que «hoy
    // el cliente no llama a `setAttribute` ni una vez», lo cual era cierto y
    // engañoso a la vez: la especie no es `setAttribute`, es «meter un atributo
    // sin parsear marcado», y de esa **sí** hay una llamada viva
    // (`render/assets.ts` hace `img.src = url`). QA plantó quince sumideros de
    // esa familia y los catorce invariantes salieron verdes, `iframe.srcdoc`
    // incluido — que además **parsea HTML entero sin llevar `HTML` en el
    // nombre**, o sea que se le escapaba a las dos mitades anteriores.
    //
    // Los nombres de esa familia no se pueden enumerar. Lo que sí se puede son
    // los **sitios**: los dos ficheros que tienen algo que hacer ahí. `html.ts`
    // es la puerta; `render/assets.ts` carga el arte, y desde este ciclo su
    // `img.src` pasa por `urlDeImagenSegura`, la misma regla que la puerta aplica
    // en la plantilla. Cualquier otro fichero que toque estas APIs es un
    // infractor, se llame como se llame.
    //
    // Mira el CÓDIGO y no el fichero, como el de la coma flotante: los
    // docstrings de `html.ts`, de `main.ts` y de `contract/agent.ts` nombran
    // `innerHTML` para explicarse, y un guardia que caza su propia explicación
    // se ignora desde el primer día.
    //
    // Y mira también `core` y el servidor, aunque hoy no tengan DOM: el guardia
    // de «`core` no toca el DOM» busca `document.`/`window.` y `HTMLElement`, y
    // un `nodo.innerHTML = x` no escribe ninguna de las tres.
    //
    // Roto a mano por SIETE puertas, copiadas a `main.ts` una a una, vistas
    // rojas con su fichero y su línea y retiradas: `innerHTML`, `outerHTML`,
    // `insertAdjacentHTML`, `document.write`, `as unknown as Html`,
    // `createContextualFragment` y `DOMParser`. Las dos últimas las encontró la
    // compuerta **pasando** por encima de la primera redacción, que era una
    // lista negra corta.
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== 'src/client/html.ts');
    /**
     * Los únicos tipos del DOM que el cliente nombra. Cerrado y comprobado.
     * `DialogElement` entró con la conversación de la base caminable: es el
     * `<dialog>` que se abre y se cierra, y se rellena por `pintar` como todo.
     */
    const TIPOS_DOM = ['Element', 'CanvasElement', 'ImageElement', 'DialogElement'];
    const puertas: readonly (readonly [string, RegExp])[] = [
      [
        'un nombre con `HTML` dentro que no es un tipo del DOM',
        new RegExp(`HTML(?!(?:${TIPOS_DOM.join('|')})\\b)`),
      ],
      [
        'un parseador de marcado sin `HTML` en el nombre',
        /\b(?:createContextualFragment|DOMParser|parseFromString)\b|\bdocument\s*\.\s*write(?:ln)?\s*\(/,
      ],
      ['un `Html` fabricado a mano', /\bas\s+unknown\s+as\s+Html\b/],
    ];

    /**
     * Los dos sitios que pueden meter un atributo interpretado en el DOM sin
     * pasar por una plantilla. Cerrado y comprobado: cualquier otro es rojo.
     */
    const SITIOS_CON_PERMISO = ['src/client/html.ts', 'src/client/render/assets.ts'];
    const porSitio: readonly (readonly [string, RegExp])[] = [
      // `setAttribute` acepta CUALQUIER nombre de atributo, incluido `onerror`,
      // así que no se puede acotar por el nombre: se acota por quién la llama.
      // Ojo con el `?`: `setAttributeNS?` hace opcional la **S**, no el `NS`, y
      // así escrito dejaba pasar `setAttribute(` entero — cazaba nueve de las
      // quince sondas y no once. Un guardia hay que verlo morder POR CADA
      // PUERTA, no en conjunto.
      ['`setAttribute`, que acepta cualquier atributo', /\.setAttribute(?:NS)?\s*\(/],
      // La asignación de propiedad equivalente. `srcdoc` es un documento HTML
      // entero; `cssText`, hojas de estilo; `on*`, código.
      [
        'una propiedad interpretada asignada a mano',
        /\.(?:src|href|srcdoc)\s*=(?!=)|\.style\s*\.\s*cssText\s*=(?!=)|\.on[a-z]+\s*=(?!=)/,
      ],
      // Y el texto que se ejecuta directamente. Estos no los quiere NADIE, ni
      // siquiera los dos con permiso; se dejan aquí porque son la misma especie.
      ['texto ejecutado como código', /\beval\s*\(|\bnew\s+Function\s*\(/],
      // Un `<script>` fabricado a mano: su `textContent` no parsea marcado, pero
      // al colgarlo del documento el navegador ejecuta lo que lleve dentro. Se
      // caza por el `createElement`, que es la parte acotable: vigilar
      // `textContent` sería un falso positivo por cada rótulo del cliente.
      ['un `<script>` fabricado a mano', /createElement\s*\(\s*['"`]script/i],
      // Y el rodeo por asignación en bloque, que es como se esquiva cualquier
      // regla escrita sobre `algo.propiedad =`. Hoy no hay ni un `Object.assign`
      // en el código publicado.
      ['un `Object.assign` sobre un nodo', /\bObject\s*\.\s*assign\s*\(/],
      // Navegar a una URL de texto: `javascript:` también ejecuta ahí.
      [
        'navegar a una URL construida',
        /\bwindow\s*\.\s*open\s*\(|\blocation\s*\.\s*(?:assign|replace)\s*\(/,
      ],
    ];
    const porSitioColados = porSitio.flatMap(([puerta, patron]) =>
      infractoresDeCodigo(
        fuera.filter((r) => !SITIOS_CON_PERMISO.includes(r)),
        patron,
      ).map((donde) => `[${puerta}] ${donde}`),
    );
    const colados = puertas.flatMap(([puerta, patron]) =>
      infractoresDeCodigo(fuera, patron).map((donde) => `[${puerta}] ${donde}`),
    );
    expect([...colados, ...porSitioColados]).toEqual([]);
  });

  it('ningún rasgo de criatura está declarado y muerto', () => {
    // Un rasgo escrito en el tipo y en `data/creatures.json` que el motor no
    // lee es una promesa sin respaldo: el jugador paga por una caballería que
    // no carga y el agente decide con una ficha que miente. Este guardia nace
    // en verde justo después de implementar los cuatro que faltaban.
    const motor = CORE.filter((r) => r !== 'src/core/types.ts')
      .map(leer)
      .join('\n');

    const muertos = CREATURE_TRAITS.filter((rasgo) => !motor.includes(`'${rasgo}'`));
    expect(muertos, `rasgos declarados que el motor no lee: ${muertos.join(', ')}`).toEqual([]);
  });

  it('ningún tipo de efecto temporal está declarado y sin lector', () => {
    // Un efecto se cuelga del stack y solo existe si alguien suma su total al
    // leer: uno que nadie suma sería una promesa sin respaldo, como un rasgo
    // muerto. Así entró `'defense'` con la rueda del golpe (13-10-2026): rojo
    // hasta declarar que lo lee `effectiveDefense`.
    //
    // Las dos mitades del guardia:
    //  1. la tabla cubre `EFFECT_KINDS` EXACTAMENTE, así que un tipo nuevo
    //     pone esto rojo hasta que alguien declare quién lo lee;
    //  2. cada lector se LLAMA de verdad y su salida tiene que moverse al
    //     colgar un efecto de ese tipo.
    // La segunda es la que no tenía el ancla textual anterior: bastaba escribir
    // dentro de `effects.ts` un `effectiveDefense()` que no llamara nadie para
    // ponerla verde, y un lector válido escrito como bucle sobre `EFFECT_KINDS`
    // la ponía roja.
    expect(Object.keys(LECTORES_DE_EFECTO).sort()).toEqual([...EFFECT_KINDS].sort());

    for (const [kind, lector] of Object.entries(LECTORES_DE_EFECTO)) {
      const s = stackDePrueba();
      const antes = lector(s);
      applyEffect(s, { kind: kind as EffectKind, amount: 2, source: 'guardia', roundsLeft: 2 });
      expect(lector(s), `${kind}: su lector no suma el efecto`).not.toBe(antes);
    }
  });

  it('las cifras de un stack de batalla salen de `unit`, no del catálogo', () => {
    // Desde que un personaje puede pisar el tablero, `BattleStack.unit` es la
    // ÚNICA fuente de sus cifras: `createBattle` la resuelve una vez, del
    // catálogo o del perfil del personaje. Volver al catálogo con el cuerpo
    // —`creature(s.body)`— lee las cifras del catálogo para una criatura y
    // LANZA para un personaje, cuyo cuerpo es el centinela `"character"`: una
    // lectura así pasaría todos los tests de estrategia y rompería la primera
    // batalla de un personaje.
    //
    // Hay tres candados y este es el segundo y el tercero. El primero es `tsc`:
    // el campo se llamaba `creature` y ya no existe, así que
    // `creature(s.creature)` no compila. Lo que sí compila, este guardia lo mira
    // en todo `src`, en dos mitades:
    //
    // 1. **Cada llamada a `creature(`, con su argumento ENTERO.** No una
    //    expresión regular de una línea: la primera versión era
    //    `creature\([^)]*\.body` y QA le coló cuatro formas, dos de ellas de las
    //    que produce el repositorio solo — `creature(stackById(st, id).body)`,
    //    donde el `)` de la llamada interior paraba el `[^)]*`, y la llamada
    //    partida en varias líneas que escribe Biome en cuanto pasa de 100
    //    columnas—. Ahora se busca el paréntesis de cierre emparejado y se mira
    //    el argumento con sus saltos de línea, por `.body`, `?.body` o
    //    `['body']`.
    // 2. **`creature` como valor**, fuera de `data.ts` que la declara:
    //    `[s.body].map(creature)`, `.then(creature)`, `const f = creature`. No
    //    hay ni un uso legítimo, y cada uno es una llamada que la mitad 1 no ve.
    //    Solo en los ficheros que la importan de `data`, porque en
    //    `render/assets.ts` `creature` es el nombre de un parámetro de texto.
    //
    // Lo que NO ve, dicho aquí para que nadie lo dé por cubierto: el alias por
    // variable intermedia (`const id = s.body; creature(id)`), la importación
    // con otro nombre (`import { creature as c }`) y la de espacio de nombres
    // (`D.creature` sí la ve la mitad 1; `const { creature: c } = D`, no). Eso no
    // lo cierra ningún análisis de texto honesto: lo cierra la unión
    // discriminada de `Stack` de la fase 3, que hace que el tipo del cuerpo de
    // un personaje no sea un id del catálogo.
    //
    // Tampoco ve —lo encontró la segunda pasada de QA, con 22 formas—: la mitad 2
    // depende de cómo se escriba el import (`from './data'` sin `.js`,
    // `map(D.creature)`, un `import()` dinámico); los accesos calculados
    // (`Reflect.get(s, 'body')`, `s['bo' + 'dy']`); y `sinComentarios` no
    // entiende las expresiones regulares literales, así que una que acabe en
    // `\//` deja en blanco el resto de su línea, y lo que haya allí no se mira.
    //
    // Visto morder, sonda a sonda en `ai/tactics.ts` y `battle/battle.ts`: `creature(s.body)`, las
    // cuatro de QA y las tres que ya mordían (`s.body!`, `s.body as string`,
    // `String(s.body)`).
    //
    // **Una sola excepción, y es de FORMA y POR LLAMADA, no de fichero ni de
    // línea.** El cable del espectador no manda `unit` cuando es la del catálogo
    // (+72 % de fotograma para repetir una tabla que las dos puntas tienen), así
    // que su inversa, `espectador/adaptar.ts`, la rehace. Se le permite
    // exactamente `cifrasDeCatalogo(X.body, X.origen.veterania)` como lo
    // primero de la rama `'catalogo'` —devuelta o en una constante— de un
    // `switch (X.origen.kind)` con la misma `X`, y nada más
    // (`esRellenoDelCable`). Una versión anterior eximía la LÍNEA en que aparecía
    // la forma, y una lectura directa escrita a su lado se colaba con ella.
    //
    // Y la llamada que se mira son las lecturas del catálogo por id: desde F3
    // (19-10-2026, el catálogo de unidades sustituye a `data/creatures.json`),
    // `unidad`, `unidadDelJuego`, `unidadDelJuegoSiExiste` y `cifrasDeUnidad`, que
    // es `unidadDelJuego` más la veteranía (eran `creature` y `cifrasDeCatalogo`),
    // y `oroDeUnidad` y `hojaDeUnidad`. Desde el simplify de F3-F6 (19-10-2026) el
    // stack dice qué unidad es en su origen (`origen.unidad`) y `body` es solo el
    // arte: se miran las dos formas. La excepción del cable es solo para
    // `cifrasDeUnidad(X.origen.unidad, X.origen.veterania)` y, en la misma rama,
    // `oroDeUnidad(X.origen.unidad)` para rehacer el precio, que no viaja
    // (`esPrecioDelCable`). Roto a mano: un `unidadDelJuego(s.origen.unidad).attack`
    // en `ai/tactics.ts`, un `cifrasDeUnidad(s.body, null)` en `battle.ts` y un
    // `oroDeUnidad(s.origen.unidad)` fuera de su rama en la inversa salen rojos.
    const INVERSA_DEL_CABLE = 'src/client/espectador/adaptar.ts';
    const LECTURAS = [
      'unidad',
      'unidadDelJuego',
      'unidadDelJuegoSiExiste',
      'cifrasDeUnidad',
      'oroDeUnidad',
      'hojaDeUnidad',
    ];
    const fugas: string[] = [];
    for (const ruta of [...CORE, ...CLIENTE, ...SERVIDOR]) {
      const codigo = codigoDe(ruta);
      for (const nombre of LECTURAS) {
        for (const { inicio, argumento } of llamadasA(nombre, codigo)) {
          if (!/\.\s*body\b|\[\s*(['"`])body\1\s*\]|\.origen\.unidad\b/.test(argumento)) continue;
          if (ruta === INVERSA_DEL_CABLE) {
            if (nombre === 'cifrasDeUnidad' && esRellenoDelCable(codigo, inicio, argumento))
              continue;
            if (nombre === 'oroDeUnidad' && esPrecioDelCable(codigo, inicio, argumento)) continue;
          }
          fugas.push(
            `${ruta}:${lineaDe(codigo, inicio)} → ${nombre}(${argumento.replace(/\s+/g, ' ')})`,
          );
        }
      }
      // Como valor, sin `unidad`: es una palabra de la prosa y de las variables, y
      // un `const unidad = …` no es una lectura del catálogo.
      const COMO_VALOR = LECTURAS.filter((n) => n !== 'unidad');
      if (!importaCreature(codigo, COMO_VALOR)) continue;
      for (const nombre of COMO_VALOR) {
        for (const inicio of creatureComoValor(codigo, nombre)) {
          fugas.push(`${ruta}:${lineaDe(codigo, inicio)} → \`${nombre}\` pasada como valor`);
        }
      }
    }
    expect(fugas).toEqual([]);
  });

  it('no quedan caballeros ni nigromantes: ni `knight` ni `necromancer` en src/, data/ ni tools/', () => {
    // F3 (19-10-2026): las cinco facciones de la arena sustituyen a caballeros y
    // nigromantes, sin compatibilidad hacia atrás. Lo que quedara con su nombre
    // —un id de facción, una morada `knight_dwelling_N`, una tabla del taller, una
    // carpeta de arte— es una de dos: código muerto o un sitio que aún los lee.
    // Mira el texto entero, comentarios incluidos (la historia se cuenta con «los
    // caballeros», no con el id que ya no existe), y las rutas, también las del
    // arte de las bases. Roto a mano: un `'knight'` en `town/sitios.ts`, un
    // comentario con `necromancer` en `server/partida.ts` y un
    // `assets/bases/templarios/knight_dwelling_9.webp` sin indexar salen rojos.
    const viejo = /knight|necromancer/i;
    const conElNombre = rutasDelRepo().filter(
      (f) => /^(?:src|data|tools|assets\/bases)\//.test(f) && viejo.test(f),
    );
    expect([...conElNombre, ...lineasCon(viejo)]).toEqual([]);
  });

  it('no queda más recurso que el oro: ni minas ni montones en src/, data/ ni tools/', () => {
    // «Solo oro» (21-10-2026): sin minas ni más recurso que el oro, y sin
    // compatibilidad hacia atrás. Lo que quedara con el nombre de un recurso
    // de antes —un `'wood'` en un coste, un `kind: 'mine'` en un `switch`, la
    // tabla de las minas por región, el evento de los montones— es código muerto
    // o un sitio que aún los lee. Mira el texto entero, comentarios incluidos
    // (la historia se cuenta en español, «la madera», no con el id). Lo que no
    // mira: el `'resource'` de `performance.getEntriesByType`, que es del
    // navegador; solo un `kind` que lo sea. Roto a mano (21-10-2026): un
    // `'wood'` en `town/town.ts` y un `kind: 'mine'` en `map/map.ts` salen rojos.
    const viejo =
      /\b(?:wood|mercury|ore|sulfur|crystal|gems)\b|['"]mine['"]|\bkind\s*(?::|===?|!==?)\s*['"]resource['"]|MINE_YIELD|minasDeLasRegiones|RESOURCE_KINDS|resource_gained/;
    expect(lineasCon(viejo)).toEqual([]);
  });

  it('el agente elige en la rueda: manda `hit` y `response` y la petición de respuesta no lleva el golpe del otro', () => {
    // Invertido en F6 (19-10-2026): hasta F5 el esquema quitaba `golpe` y
    // `respuesta` y la IA elegía por el agente. Ahora:
    //  (1) el `attack` del agente lleva su `hit` y llega al director, y la jugada
    //      `power` también; los dos formatos de batalla nombran lo que se elige;
    //  (2) quien pide la respuesta no puede contar el golpe del atacante: la
    //      serialización recibe solo los dos ids, y su salida no lleva ni `hit` ni
    //      `golpe`, aunque la IA ya haya elegido el suyo.
    // La marca de `Hit` y su guardia («nadie escribe `as Hit` fuera») se fueron en
    // el simplify de F3-F6: `Hit` es la unión de los siete literales de
    // `HIT_DE_GOLPE` (`contract/vocabulario.ts`), y uno escrito a mano que no esté
    // en ella no compila.
    // Rotos a mano (19-10-2026): `hit` fuera de `battleActionSchema` → rojo (1); un
    // tercer parámetro `golpe` en `serializeBattleResponse` que se copia a la
    // salida → rojo (2).
    const accion = battleActionSchema.parse({
      type: 'attack',
      target: 'defender-0',
      hit: 'strong',
      golpe: 'fuerte',
      respuesta: 'finta',
    });
    expect(accion).toEqual({ type: 'attack', target: 'defender-0', hit: 'strong' });
    expect(battleActionSchema.parse({ type: 'power', power: 'curar', target: 'a-1' })).toEqual({
      type: 'power',
      power: 'curar',
      target: 'a-1',
    });
    expect(RESPONSE_FORMAT.battle_turn).toMatch(/"hit"/);
    expect(RESPONSE_FORMAT.battle_turn).toMatch(/"power"/);
    expect(RESPONSE_FORMAT.battle_response).toMatch(/"response"/);
    for (const h of HITS) {
      expect(RESPONSE_FORMAT.battle_turn).toContain(`"${h}"`);
      expect(RESPONSE_FORMAT.battle_response).toContain(`"${h}"`);
    }

    // (2): el golpe de la IA ya elegido y plantado ante el objetivo, como lo deja
    // el director antes de preguntar.
    const b = batallaConDos(createRng(3));
    const [atacante, objetivo] = b.stacks as [BattleStack, BattleStack];
    const ataque = { atacante: atacante.id, objetivo: objetivo.id };
    expect(serializeBattleResponse.length).toBe(2);
    const payload = JSON.stringify(serializeBattleResponse(b, ataque));
    expect(payload).not.toMatch(/"(?:hit|golpe)"\s*:/);
    expect(JSON.parse(payload).responses.map((r: { response: string }) => r.response)).toEqual([
      ...HITS,
    ]);
  });

  it('el golpe plantado de la rueda lo escribe el motor y lo suelta solo la sesión', () => {
    // `BattleState.golpeEnCurso` dice quién está plantado ante quién y con qué carga
    // (primero se anda, luego la rueda; 13-10-2026). Lo pone y lo quita el motor
    // (`applyAction`, `soltarElGolpe`): otro que lo escribiera se saltaría la carga
    // medida antes de andar o dejaría un turno colgado. Y Escape lo suelta por la
    // sesión de la arena, nadie más. Roto a mano: un `this.battle.golpeEnCurso = null` en
    // `session.ts` y un `soltarElGolpe(` en `arena/main.ts` salen rojos con su línea.
    const PUERTA = 'src/core/battle/battle.ts';
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const escribe = /\.golpeEnCurso\s*=(?!=)|\bgolpeEnCurso\s*:(?!\s*GolpeEnCurso\b)/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribe)).not.toEqual([]);
    const suelta = /\bsoltarElGolpe\b/;
    const quienes = infractoresDeCodigo(todos, suelta).map((e) => e.split(':')[0]);
    expect([...new Set(quienes)].sort()).toEqual(['src/client/session.ts', PUERTA]);
  });

  it('el tramo de la Finta lo abre solo el golpe (`melee`, en battle.ts)', () => {
    // `TurnoDeUnidad.finta` (la rueda, #263, 14-10-2026) convierte el resto del turno
    // en un tramo solo de andar, con lo que le quede menos lo que resta su éxito.
    // Lo escribe solo el golpe con Finta: otro que lo pusiera dejaría a una unidad
    // sin poder golpear, o le quitaría casillas sin haber fintado. Roto a mano: un
    // `turno.finta = 2` en `session.ts` sale rojo con su línea.
    const PUERTA = 'src/core/battle/battle.ts';
    const escribe = /\.finta\s*(?:\?\?|\|\||&&)?=(?!=)/;
    expect(
      infractoresDeCodigo(
        [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== PUERTA),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribe)).toHaveLength(1);
  });

  it('un stack lo sustituye a media pelea solo la arena, y los poderes solo los pone ella', () => {
    // La arena retoca un tipo a media pelea (`retocarEnBatalla`) sustituyendo sus
    // stacks enteros en `state.stacks`: `BattleStack.unit` sigue siendo de solo
    // lectura, y nadie más cambia un stack por otro (el motor los muta por campo,
    // y quien busca uno lo busca por id). Y los poderes
    // (`UnitInfo.poderes`) solo los escribe el formato de la unidad
    // (`core/unidad.ts`, de sus habilidades): desde F3 (19-10-2026) también en el
    // juego, cuyo catálogo es el de la arena (el monje trae Curar y Bendecir).
    // Ni el catálogo en partida (`catalogo.ts`) ni la ficha del agente los
    // escriben aparte. Roto a mano: un `state.stacks[0] = s` en `battle.ts`, un
    // `fichasDeArena: {}` en `state/game.ts`, un `{ ...c, poderes }` en `data.ts` y
    // un `poderes: c.poderes` en `contract/serialize.ts` salen rojos con su línea.
    const PUERTA = 'src/core/arena.ts';
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== PUERTA);
    const sustituyeUnStack = /\bstacks\[[^\]]+\]\s*=(?!=)/;
    expect(infractoresDeCodigo(fuera, sustituyeUnStack)).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], sustituyeUnStack)).not.toEqual([]);
    // Las fichas de la arena (`fichasDeArena`), con las que el retoque dice qué
    // cambió, también: las pone ella al montar y al retocar.
    const escribeTipos =
      /\bfichasDeArena\s*[:=](?!\s*readonly)|\.fichasDeArena\b(?:\s+as\b[^;]*)?\)?\[[^\]]+\]\s*=(?!=)/;
    const sinElTipo = fuera.filter((r) => r !== 'src/core/battle/types.ts');
    expect(infractoresDeCodigo(sinElTipo, escribeTipos)).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribeTipos)).not.toEqual([]);
    // Los poderes los pone `unidadDeCombate`, que vive con el formato de la unidad
    // (`core/unidad.ts`, simplify de F1).
    const PONE_PODERES = 'src/core/unidad.ts';
    const escribePoderes = /\bpoderes\s*:(?!\s*readonly)|\{\s*poderes\s*\}|\.poderes\s*=(?!=)/;
    const ni = [...CORE, ...SERVIDOR].filter(
      (r) => r !== PONE_PODERES && r !== 'src/core/battle/poderes.ts',
    );
    expect(infractoresDeCodigo(ni, escribePoderes)).toEqual([]);
    expect(infractoresDeCodigo([PONE_PODERES], escribePoderes)).not.toEqual([]);
  });

  it('la batalla no lleva catálogo de equipo: cada golpe lleva el nombre de su arma', () => {
    // Simplify de F2 (18-10-2026): la batalla no guarda un catálogo de piezas
    // (`BattleState.piezasDeArena` y `piezasDeLaPelea` se fueron); el nombre del
    // arma de cada golpe va en `GolpeConArma.arma` (lo escribe `conEquipo`), y quien
    // cambia una pieza a media pelea le da su catálogo a `retocarEnBatalla`. Dos
    // partes: nadie nombra `piezasDeArena`, y el motor (`core/battle/`) no lee un
    // catálogo. Rotos a mano: un `piezasDeArena?: readonly PiezaEscrita[]` en
    // `battle/types.ts` y un `import { EQUIPO_DEL_JUEGO } from '../hero/equipo.js'`
    // en `battle.ts` salen rojos con su línea.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(infractoresDeCodigo(todos, /\bpiezasDeArena\b|\bpiezasDeLaPelea\b/)).toEqual([]);
    const MOTOR = CORE.filter((r) => r.startsWith('src/core/battle/'));
    const leeUnCatalogo =
      /\b(?:EQUIPO_DEL_JUEGO|catalogoDeEquipo|equipoCon|PIEZAS_DEL_CATALOGO|CatalogoDeEquipo|EquipoAtado)\b/;
    expect(infractoresDeCodigo(MOTOR, leeUnCatalogo)).toEqual([]);
    expect(infractoresDeCodigo(['src/core/arena.ts'], leeUnCatalogo)).not.toEqual([]);
  });

  it('el catálogo de equipo lo carga solo `data.ts`, y la arena lee cada pieza con el suyo', () => {
    // Una sola clase de piezas (F2 de 2026-10-18): el borrador de equipo de la
    // arena y `data/equipo.json` dejan de ser dos cosas; la arena edita el catálogo
    // en memoria y «Guardar» lo escribe en disco. Dos partes:
    //  (a) `data/equipo.json` lo importa solo `core/data.ts` (`leerEquipo`, que lo
    //      valida entero al cargar): quien lo importara por su cuenta se saltaría
    //      la validación. La arena lo escribe por su ruta, no importándolo. Y fuera
    //      de la arena nadie nombra los borradores que quedan (`data/borradores`,
    //      las murallas) ni `tools/arena/`.
    //  (b) la arena no importa las lecturas sueltas de las piezas (abajo): leen el
    //      catálogo tal como se cargó, y la arena pelea con el que edita.
    // Rotos a mano: un `import e from '../../data/equipo.json'` en `arena.ts` y un
    // `'data/borradores'` en `state/game.ts` salen rojos con su línea.
    const PUERTA = 'src/core/data.ts';
    const importa = importaDe(/[^'"]*data\/equipo\.json/);
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        importa,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], importa)).not.toEqual([]);
    const ARENA = (r: string): boolean =>
      r === 'src/core/arena.ts' ||
      r === 'src/core/arena-murallas.ts' ||
      r.startsWith('src/client/arena/');
    const veElBorrador = /data\/borradores|tools\/arena\//;
    const fuera = todos.filter((r) => !ARENA(r));
    expect(infractoresDeCodigo(fuera, veElBorrador)).toEqual([]);
    expect(infractoresDeCodigo(['src/client/arena/main.ts'], veElBorrador)).not.toEqual([]);

    // (b) La arena lee las piezas solo con su catálogo atado (`equipoCon`, que da
    // `catalogoDeLaArena`): no importa las lecturas sueltas de `equipo.ts`, que
    // leen siempre las del juego, ni `heroUnit`, que viste al héroe con ellas.
    // Por IMPORTACIÓN: sin la suelta a mano, no hay llamada que se olvide de su
    // catálogo. Roto a mano: `pieza` importada en `paneles.ts` sale rojo.
    const SUELTAS = new Set([
      'pieza',
      'piezaSiExiste',
      'piezasPuestas',
      'sumaDeEquipo',
      'conEquipo',
      'manosBlocker',
      'equipoBlocker',
      'ponerPieza',
      'heroUnit',
    ]);
    const deEquipoOHeroe =
      /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]*\/hero\/(?:equipo|hero)\.js|\.\/(?:equipo|hero)\.js)['"]/g;
    const sueltas: string[] = [];
    for (const ruta of [...CORE, ...CLIENTE].filter(ARENA)) {
      for (const [, nombres] of codigoDe(ruta).matchAll(deEquipoOHeroe)) {
        for (const n of (nombres as string).split(',')) {
          const nombre = n
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0] as string;
          if (SUELTAS.has(nombre)) sueltas.push(`${ruta} → ${nombre}`);
        }
      }
    }
    expect(sueltas).toEqual([]);
  });

  it('el nivel de una unidad se deriva de sus cifras con su equipo: nadie lo escribe, ni su coste, ni el cuerpo sin equipo', () => {
    // Un solo nivel (12-10-2026): la primera cifra del índice de poder de sus
    // cifras (`core/nivel.ts`), **con el equipo puesto** desde el 18-10-2026 («el
    // nivel ve el equipo»). Había un `UnitInfo.nivel` que escribían cinco
    // constructores y un `level` en el catálogo que era la morada con otro
    // nombre: el mismo hecho, a mano, en seis sitios. Y desde F3 (19-10-2026) lo
    // que cuesta y crece una unidad sale de ese índice (`data/economia.json`):
    // un `cost` escrito en `data/unidades.json` sería otra vez el mismo hecho en
    // dos sitios. Tampoco queda `UnitInfo.sinEquipo`: lo que suma el equipo se
    // deriva de lo que lleva, y el cuerpo desnudo, de su origen. Rotos a mano: un
    // `"level": 1` y un `"cost": {…}` en una unidad de `data/unidades.json`, un
    // `readonly nivel: number;` en `UnitInfo`, un `{ ...u, sinEquipo: u }` en
    // `arena.ts` y una `function nivelDeUnidad` en `strategy.ts` salen rojos.
    const catalogo = JSON.parse(leer('data/unidades.json')) as {
      unidades: { id: string; [campo: string]: unknown }[];
    };
    expect(
      catalogo.unidades.filter((u) => 'level' in u || 'nivel' in u || 'cost' in u).map((u) => u.id),
    ).toEqual([]);
    const tipos = codigoDe('src/core/types.ts');
    const unitInfo = /export interface UnitInfo \{[\s\S]*?\n\}/.exec(tipos)?.[0];
    if (unitInfo === undefined) throw new Error('no encuentro `interface UnitInfo` en types.ts');
    expect(unitInfo).not.toMatch(/\b(?:nivel|level)\??\s*:/);
    expect(infractoresDeCodigo([...CORE, ...CLIENTE, ...SERVIDOR], /\bsinEquipo\b/)).toEqual([]);
    // Y el índice y el nivel los calcula `nivel.ts`, y nadie más.
    const calcula = /\bfunction\s+(?:indiceDePoder|nivelDeUnidad|nivelDelIndice|poderBruto)\b/;
    const otros = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== 'src/core/nivel.ts');
    expect(infractoresDeCodigo(otros, calcula)).toEqual([]);
    expect(infractoresDeCodigo(['src/core/nivel.ts'], calcula)).not.toEqual([]);
    // Con sus pesos (`PODER.pesosDeLaRueda`), no los de la IA: retocar cómo elige
    // la IA no mueve índices (simplify de F1). Roto a mano: un
    // `PESOS_DE_LA_RUEDA.golpe` en `ofensaDelAtaque` sale rojo.
    expect(infractoresDeCodigo(['src/core/nivel.ts'], /\bPESOS_DE_LA_RUEDA\b/)).toEqual([]);
  });

  it('`nivel.ts` no está en un ciclo de importación: lo que mide lo lee de módulos que no lo importan', () => {
    // El nivel mide con las lecturas del combate (con qué arma pega, cuánto le
    // para la armadura) y el combate lee el nivel para la experiencia (`herir`).
    // Con esas lecturas en `damage.ts` y `rueda.ts`, `nivel.ts` → `damage.ts` →
    // `nivel.ts` funcionaba solo porque lo que corre al cargar usa declaraciones
    // de función: una constante leída al cargarse daba un `ReferenceError` (TDZ).
    // Ahora viven en `battle/armas.ts`, que no importa nada que importe el nivel
    // (simplify de F1, 18-10-2026). Solo cuenta lo que corre: `import type` no.
    // Roto a mano: `golpeDe` importado de `./battle/damage.js` en `nivel.ts` sale
    // rojo con el ciclo entero.
    const INICIO = 'src/core/nivel.ts';
    const deUnModulo =
      /^(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?['"](\.\.?\/[^'"]+)['"]/gm;
    const importa = (ruta: string): string[] =>
      [...codigoDe(ruta).matchAll(deUnModulo)].map((m) =>
        join(dirname(ruta), (m[1] as string).replace(/\.js$/, '.ts')),
      );
    const visto = new Set<string>();
    const ciclo = (ruta: string, camino: readonly string[]): string[] | null => {
      for (const siguiente of importa(ruta)) {
        if (siguiente === INICIO) return [...camino, siguiente];
        if (visto.has(siguiente) || !siguiente.endsWith('.ts')) continue;
        visto.add(siguiente);
        const hallado = ciclo(siguiente, [...camino, siguiente]);
        if (hallado !== null) return hallado;
      }
      return null;
    };
    expect(ciclo(INICIO, [INICIO])).toBeNull();
    // Y el guardia ve los imports que corren: `nivel.ts` importa `battle/armas.ts`.
    expect(importa(INICIO)).toContain('src/core/battle/armas.ts');
  });

  it('los tiros de un disparo los cuenta solo `disparosDe`', () => {
    // Dos con el disparo doble, uno sin él: lo leen el disparo (`shoot`), su
    // previsión y la medida del nivel. Eran tres copias de `double_shot ? 2 : 1`
    // (simplify de F1, 18-10-2026). Roto a mano: la de `shoot` devuelta a
    // `battle.ts` sale roja.
    const PUERTA = 'src/core/battle/armas.ts';
    const cuenta = /hasTrait\([^)]*['"]double_shot['"]\s*\)/;
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        cuenta,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], cuenta)).not.toEqual([]);
  });

  it('el recinto de una ciudad lo declara solo `core/map/recinto.ts`: su lado, su separación y sus puertas', () => {
    // La ciudad amurallada, vuelta 3 (21-10-2026): el 3 × 3 era de la escena
    // (`rectanguloDelRecinto`), que lo corría contra el borde, y el núcleo ponía
    // nodos, inicios y otras ciudades donde ella levantaba la muralla. Ahora es
    // del núcleo, y la escena, el generador y la puerta de los planes lo leen de
    // allí. Roto a mano: `LADO_DEL_RECINTO` declarado otra vez en la escena sale rojo.
    const PUERTA = 'src/core/map/recinto.ts';
    const declara =
      /\b(?:const|let|var)\s+(?:LADO_DEL_RECINTO|SEPARACION_DE_CIUDADES|PUERTAS_DE_LA_CIUDAD)\b/;
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        declara,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], declara)).toHaveLength(3);
  });

  it('por dónde se entra en una ciudad lo dice su recinto, no las puertas de minas y pueblos', () => {
    // La ciudad amurallada, fase 2 (21-10-2026): la ciudad se entraba por la
    // casilla de debajo (`puertas.ts`, #188) y solo para el trazado; ahora tiene
    // las puertas de su recinto (`PUERTAS_DE_LA_CIUDAD`), que mira el juego. Si
    // `puertas.ts` volviera a nombrar la ciudad, habría dos reglas para la
    // misma puerta. Roto a mano: `town: [[0, 1]]` en `RUMBOS` sale rojo.
    expect(infractoresDeCodigo(['src/core/map/puertas.ts'], /\btown\b/)).toEqual([]);
    // Y el paso por el recinto lo lee solo `map.ts` (el Dijkstra, `stepCost`,
    // `sePasa`): nadie más decide por su cuenta qué casilla del recinto se pisa.
    // El de la batalla (`battle/`) es otro: el de los muros de la muralla.
    const lee = /\bpasoPermitido\s*\(/;
    expect(
      infractoresDeCodigo(
        [...CORE, ...CLIENTE, ...SERVIDOR].filter(
          (r) =>
            r !== 'src/core/map/map.ts' &&
            r !== 'src/core/map/recinto.ts' &&
            !r.startsWith('src/core/battle/'),
        ),
        lee,
      ),
    ).toEqual([]);
  });

  it('el catálogo de unidades lo importa solo `core/catalogo.ts`, que lo valida al cargar', () => {
    // F1 de 2026-10-18: `data/unidades.json` es la lista entera de las cinco
    // facciones. Quien lo importara por su cuenta se saltaría la validación de
    // `catalogo.ts` (una unidad rota tumba la carga diciendo cuál) o lo leería
    // con otras piezas. La arena lo lee y escribe en disco, por su ruta
    // (`RUTA_DEL_CATALOGO_DE_UNIDADES`), no importándolo: así lo abre aunque esté
    // roto. Roto a mano: un `import u from '../../data/unidades.json'` en
    // `arena.ts` sale rojo.
    const PUERTA = 'src/core/catalogo.ts';
    const importa = importaDe(/[^'"]*data\/unidades\.json/);
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        importa,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], importa)).not.toEqual([]);
  });

  it('los huecos del contrato se traducen en un sitio y la regla de las manos vive en otro', () => {
    // El escudo (12-10-2026): los huecos van en inglés en el contrato del agente
    // (cinco desde el 18-10-2026, simétricos por uso desde el simplify de F2) y en
    // español por dentro, con la traducción en `contract/vocabulario.ts`. **Por tipo**:
    // un hueco del contrato es un `Slot`, con una marca que solo pone ese módulo, así
    // que fuera de él nadie escribe un `as Slot` (y el compilador no deja escribir
    // uno a mano, abajo); y «un arma a dos manos no admite escudo» es una regla,
    // `manosBlocker`, que leen el juego, el agente y la arena. Rotos a mano: un
    // `slot: 'shield' as Slot` en `serialize.ts`, un `p.manos === 2` en `arena.ts` y
    // una `function manosBlocker` en `game.ts` salen rojos.
    const TRADUCCION = 'src/core/contract/vocabulario.ts';
    const produceUnSlot = /\bas\s+Slot\b|<Slot>/;
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== TRADUCCION),
        produceUnSlot,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([TRADUCCION], produceUnSlot)).not.toEqual([]);
    // @ts-expect-error: un `Slot` no se escribe a mano: lo da `SLOT_DE_HUECO`.
    const aMano: Slot = 'melee_weapon';
    expect(SLOTS).toContain(aMano);
    const MANOS = ['src/core/hero/equipo.ts', 'src/core/data.ts'];
    const leeManos = /\.manos\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !MANOS.includes(r)),
        leeManos,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/hero/equipo.ts'], leeManos)).not.toEqual([]);
    const define = /\bfunction\s+manosBlocker\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== MANOS[0]),
        define,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([MANOS[0] as string], define)).not.toEqual([]);
  });

  it('cada arma para lo suyo: las armas por uso se escriben y se leen en dos sitios, y el agente ve los cinco huecos', () => {
    // 13-10-2026: un arma a distancia y una de carga además de la de cuerpo a
    // cuerpo, y cada golpe va con las cifras de la suya (`UnitInfo.armas`); desde
    // el 18-10-2026, en el juego también (una sola clase de piezas). Dos partes:
    //  (a) `armas` lo escribe solo `conEquipo` (`hero/equipo.ts`) y lo leen solo
    //      él, `battle/armas.ts` (`golpeDe`) y `battle/damage.ts` (`armasDe`): un golpe que leyera
    //      `unit.armas` por su cuenta elegiría el arma con otra regla.
    //  (b) el agente los ve todos: cinco `SLOTS`, uno por hueco, y su prosa dice
    //      para qué es el de disparar y el de la lanza.
    // Rotos a mano: un `{ ...u, armas: {...} }` en `arena.ts`, un
    // `s.unit.armas?.distancia` en `paneles.ts` y un `SLOT_DE_HUECO` sin `carga`
    // salen rojos.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const ESCRITOR = 'src/core/hero/equipo.ts';
    const LECTORES = [ESCRITOR, 'src/core/battle/armas.ts', 'src/core/battle/damage.ts'];
    const escribe = /\barmas\s*:/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== ESCRITOR),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ESCRITOR], escribe)).not.toEqual([]);
    const lee = /\.armas\b(?!-)|(?<!\$)\{\s*armas\s*[},]/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LECTORES.includes(r)),
        lee,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/battle/armas.ts'], lee)).not.toEqual([]);

    expect(SLOTS).toHaveLength(HUECOS.length);
    expect(Object.keys(SLOT_DE_HUECO)).toEqual([...HUECOS]);
    expect(new Set(SLOTS).size).toBe(HUECOS.length);
    expect(RESPONSE_FORMAT.adventure_turn).toContain(`"${SLOT_DE_HUECO.distancia}" la que dispara`);
    expect(RESPONSE_FORMAT.adventure_turn).toContain(
      `"${SLOT_DE_HUECO.lanza}" la lanza con que se carga`,
    );
    expect(CATALOGO_DE_EQUIPO_EN_PROSA).toMatch(/^ *daga \(melee_weapon\)/m);
  });

  it('ningún fichero que una máquina lee lleva dentro la ruta de esta máquina', () => {
    // Una ruta absoluta en un fichero que se consume es un fichero que solo
    // vale aquí. Y no es teórico: `.mcp.json` es lo que enchufa el MCP
    // `heroes`, así que con la ruta de esta máquina dentro, en otra el agente
    // no arranca — que es la premisa entera del proyecto.
    //
    // El LÍMITE, declarado para que nadie lo herede creyendo que ve más: este
    // guardia solo ve SU ruta, la del checkout donde corre, porque es la única
    // que puede derivar. La de otra máquina —un `/home/otro/...` copiado en un
    // comentario— no la ve nadie. Basta para lo que pasa de verdad, que es
    // volcar a fichero un `join()` hecho aquí dentro.
    //
    // La ruta se escapa antes de buscarla porque va a una expresión regular y un
    // checkout puede vivir en `/ruta con (paréntesis)/repo`: sin escapar, esos
    // paréntesis serían un grupo y el guardia buscaría otra cosa **sin
    // decirlo**, que es peor que no buscar.
    const escapa = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Y en sus DOS formas, porque JSON admite `\/` por `/` y `JSON.parse`
    // devuelve exactamente la misma ruta: un `{"out": "\/home\/…"}` es tan
    // inservible en otra máquina como el literal, y se colaba entero.
    const enJson = RUTA_DE_ESTA_MAQUINA.replaceAll('/', '\\/');
    const patron = new RegExp(`${escapa(RUTA_DE_ESTA_MAQUINA)}|${escapa(enJson)}`);
    expect(infractores(ficherosDeMaquina(), patron)).toEqual([]);
  });

  it('la crónica se escribe por un solo sitio: los `as` que abren el candado', () => {
    // `state.log` es de solo lectura, así que escribir en él exige un `as`
    // VISIBLE, y esa es toda la fuerza del candado. Pero `emit` no está
    // exportada: el día que una regla salga de `game.ts`, la salida fácil no es
    // exportarla, es copiar el cast — y con él se pierden de golpe el
    // protagonista, el sitio y el sello, que es el bug que este ciclo cerró.
    //
    // Busca el CAST y no el `.push`, que es lo que el propio `GameState`
    // documenta que no se puede buscar: un `log.push` es indistinguible del
    // canal de `battle.ts`, que es otro tipo y otro registro. Un `as` no.
    //
    // Y busca CUATRO, no uno. Nació mirando solo la primera puerta —el cast
    // sobre el log— y QA se coló por la segunda con
    //
    //     (state as unknown as { log: unknown[] }).log.push({ kind: 'sonda' });
    //
    // en `serializeAdventureTurn`: `tsc` rc=0, Biome limpio y los 235 tests
    // verdes. No hace falta castear el log si casteas lo que lo lleva dentro.
    // Es la misma lección que costó tres ciclos con el guardia de `node:`, que
    // nació ciego a `import 'node:fs';` sin `from`: un guardia hay que verlo
    // morder por TODAS sus puertas, no por la que se le ocurrió a quien lo
    // escribió. Las cuatro se han roto a mano, una a una, y vistas rojas.
    //
    // El LÍMITE, declarado para que nadie lo herede creyendo que ve más. Dos
    // cosas. La primera: mira el código que se publica —`core`, cliente y
    // servidor— y no los tests, que no llevan reglas dentro. La segunda:
    // `infractores` va LÍNEA a línea, así que un cast repartido en varias
    // —`const escritura = state as unknown as {` y el `log:` en la siguiente—
    // se le escapa a las puertas 2 y 3; lo que lo tapa es la 4, porque para
    // partir así un cast hace falta escribirlo largo, y el atajo corto de
    // verdad es `as any`.
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== 'src/core/state/game.ts');
    const puertas: readonly (readonly [string, RegExp])[] = [
      // 1 · el log casteado a algo escribible. `as const` pasa: no abre nada.
      ['el log casteado', /\.log\s+as\s+(?!const\b)/],
      // 2 · casteas el ESTADO y lees `.log` de lo que sale. La de QA.
      ['un cast del que se saca `.log`', /\bas\b[^;\n]*\)\s*\.log\b/],
      // 3 · la misma, con el tipo escrito ahí mismo: sirve aunque el `.log` se
      //     lea tres líneas más abajo, que es lo que la 2 no alcanza.
      ['un cast a un tipo que redeclara `log`', /\bas\b[^;\n]*\blog\s*\??\s*:/],
      // 4 · el cheque en blanco. No se puede acotar a lo que abre —abre todo—,
      //     así que se prohíbe entero; hoy no hay ni uno en el código publicado.
      ['un `as any`, que abre esa puerta y todas', /\bas\s+any\b/],
    ];
    const colados = puertas.flatMap(([puerta, patron]) =>
      infractores(fuera, patron).map((donde) => `[${puerta}] ${donde}`),
    );
    expect(colados).toEqual([]);
  });

  it('nadie escribe en la crónica después de «fin de la partida»', async () => {
    // La regla está escrita en `settleBattle` desde que la crónica existe
    // —«"game_over" tiene que ser el último evento del registro, no quedar
    // sepultado bajo el de la batalla»— y **no la vigilaba nadie**. El ciclo del
    // gremio la rompió a la primera: `applyAdventureAction` llamaba a
    // `syncSpellbooks` sin preguntar si la acción acababa de terminar la
    // partida, así que en **34 de 200 semillas** la crónica terminaba con «Fin
    // de la partida» y debajo «El jugador 1 aprende: Prisa, Lentitud». No es
    // contabilidad interna: eso se pinta en el panel y lo lee una persona.
    //
    // Veinte semillas y no doscientas porque cuestan 0,4 s y ya cazan cuatro de
    // aquellas treinta y cuatro (3, 11, 16 y 17): para un guardia lo que hace
    // falta es que muerda, no que cuente. Y en `pnpm verify`, tres (#167): las
    // veinte siguen en `pnpm verify:lento`. De las veinte, el 07-10-2026 solo
    // la 7 cazaba el `if` quitado (ahora lanza `emit`, con la frase del hecho
    // colado), así que la 7 va entre las tres.
    //
    // Se rompió a mano quitando el `if (state.finished === null)` de
    // `applyAdventureAction` y se miró rojo, con la semilla y el hecho colado
    // en el mensaje, antes de darlo por bueno.
    const colados: string[] = [];
    for (const semilla of segunPrisa([1, 2, 7], rango(1, 20))) {
      const state = newGame({ seed: semilla });
      await playAiGame(state, { rng: createRng(semilla) });
      const fin = state.log.findIndex((e) => e.kind === 'game_over');
      if (fin === -1) continue;
      for (const e of state.log.slice(fin + 1)) {
        colados.push(`semilla ${semilla}: "${e.kind}" después de game_over`);
      }
    }
    expect(colados).toEqual([]);
  });

  it('la crónica sobrevive a un JSON de ida y vuelta', async () => {
    // El sello de cada evento —quién lo estaba mirando— es una colección por
    // evento, y #10 (guardar y cargar) ya avisa de lo que pasa con esas:
    // `JSON.stringify` no salva un `Set` ni un `Map`. Los deja en `{}`, sin
    // decir nada. El día que exista el guardado, una crónica que no aguante el
    // viaje vuelve del disco convertida en un montón de eventos anónimos otra
    // vez, que es exactamente el bug que este ciclo cerró.
    //
    // Mira `state.log` y NO `state` a propósito: `Player.memory` es un `Map`
    // y `GameMap.caminos` una clase, así que sobre el estado entero este
    // guardia nacería rojo por algo que no es su asunto — y un guardia que nace
    // rojo se ignora desde el primer día. `Player.fog` ya no es de esos: desde
    // #146 son `Casillas`, que salen por JSON como sus índices (lo ata
    // `casillas.test.ts`).
    //
    // Se rompió a mano cambiando `seen` a un `Set<PlayerId>` y se miró rojo
    // antes de darlo por bueno, que es la regla de la casa: un guardia que
    // nunca se ha visto morder no guarda nada.
    //
    // La semilla 9 se juega en 48×48 y no en el mapa de siempre. Con la
    // economía cuadrada la partida de 24×24 acaba el día 6 y deja 134 hechos,
    // donde antes daba 261: el umbral de 200 se caía por incidental. **No se
    // baja**: se juega un mapa donde la partida da de sí. En 48×48 la misma
    // semilla llega al día 23 y deja **618 hechos de los dieciséis tipos, 548
    // con el sello puesto** — más largo, más variado y con más sellos que el
    // mapa pequeño en cualquier momento de su historia.
    //
    // Y por lo mismo el tope pasa de 40 días a 60. Con el gremio del nigromante
    // en su sitio, esta partida ya no cabe en 40: al día 41 seguía viva y le
    // faltaban `game_over`, `player_defeated` y `town_captured`, o sea **14
    // tipos donde el guardia pide 15**. Bajar el umbral es exactamente lo que
    // el párrafo de arriba prohíbe; con 60 días la partida se acaba sola el
    // día 44 y deja **1 140 hechos de diecisiete tipos, 1 007 con sello**, así
    // que el umbral sube a 16 en vez de bajar. Los días de más no cuestan nada:
    // la partida termina antes de gastarlos.
    //
    // Los tres umbrales van con holgura sobre lo medido, porque este guardia va
    // del viaje de ida y vuelta y no de la IA: un cambio de heurística que
    // mueva las cifras un 20 % no tiene por qué ponerlo rojo.
    //
    // El tercero es el que faltaba y el que de verdad muerde: si ningún evento
    // llevara sello, `seen` sería siempre una lista vacía y el `toEqual` de
    // abajo pasaría sin probar nada. La cuenta de tipos hace lo mismo para la
    // variedad — un log largo de `hero_moved` no probaría casi nada.
    //
    // **Y la semilla pasó de 9 a 4** con «perder la base elimina» (fase 2a):
    // la 9 se acaba ahora el día 9 con 292 hechos de catorce tipos. No se bajó
    // ningún umbral: se barrieron cuarenta semillas en el mismo mapa y la 4
    // llega al día 23 con **672 hechos de diecisiete tipos, 602 con sello**.
    //
    // **Y de 4 a 19** cuando la base nació guarnecida: la 4 se quedó en 242
    // hechos con sello y catorce tipos. Mismo remedio, sin tocar umbrales: de
    // cuarenta semillas en 48×48, la 19 llega al día 24 con **810 hechos de
    // diecisiete tipos, 736 con sello**.
    //
    // **Y desde los caminos radiales (#149) la semilla la busca el test**: la
    // 19 se quedó en 355 hechos, y fijarla a mano por cuarta vez era esperar a
    // la quinta. Los umbrales son los mismos; se juega desde la 19 hasta la
    // primera partida que los cumple (~100 ms cada una).
    //
    // **Y desde la 1 hasta la 120** sin minas (21-10-2026, «solo oro»): las
    // partidas son más cortas y de la 19 a la 58 ninguna llega; en 1-200 cumplen
    // 12, la primera la 2 (615 hechos de diecinueve tipos, 571 con sello, día
    // 13). Los umbrales, los mismos.
    let state: GameState | undefined;
    for (let semilla = 1; semilla <= 120 && state === undefined; semilla++) {
      const jugada = newGame({ seed: semilla, width: 48, height: 48, maxDays: 60 });
      await playAiGame(jugada, { rng: createRng(semilla) });
      const { log } = jugada;
      if (
        log.length > 500 &&
        new Set(log.map((e) => e.kind)).size >= 16 &&
        log.filter((e) => e.seen.length > 0).length > 400
      )
        state = jugada;
    }
    expect(state, 'ninguna de 1-120 en 48×48 da una partida larga y variada').toBeDefined();
    expect(JSON.parse(JSON.stringify(state!.log))).toEqual(state!.log);
  });

  it('el dueño de un nodo o de un castillo lo escriben captureNode y captureTown, nadie más', () => {
    // «Un hecho, un sitio», con el mapa de nodos: el dueño de una REGIÓN no se
    // guarda porque se deriva de sus nodos (`regionOwner`), y eso solo es verdad
    // mientras los nodos tengan un único escritor. Una segunda escritura —un
    // atajo en la IA, un «arreglo» en el cliente— dejaría el territorio
    // calculado sobre un dueño que nadie anunció en la crónica, que es la forma
    // exacta de #47 (la IA viendo el castillo enemigo donde tenía el suyo).
    //
    // Mira el código sin comentarios y todo `src`, no solo `core`: el cliente y
    // el servidor tampoco escriben dueños. La asignación y la escritura por
    // corchetes (`o['owner'] =`), que es por donde se escaparía un atajo.
    // `Object.assign` no lo ve: si algún día hace falta, se dirá aquí.
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\.owner\s*=(?!=)|\[\s*['"`]owner['"`]\s*\]\s*=(?!=)/,
    );
    const codigo = codigoDe('src/core/state/game.ts').split('\n');
    const funcionDe = (linea: number): string | null => {
      for (let i = linea - 1; i >= 0; i--) {
        const m = /^function (\w+)/.exec(codigo[i] ?? '');
        if (m !== null) return m[1] ?? null;
      }
      return null;
    };
    const ajenas = escrituras.filter((e) => {
      const m = /^src\/core\/state\/game\.ts:(\d+) /.exec(e);
      if (m === null) return true;
      const fn = funcionDe(Number(m[1]));
      return fn !== 'captureNode' && fn !== 'captureTown';
    });
    expect(ajenas).toEqual([]);
    // Y que mire algo: las tres escrituras de verdad —el nodo, el libro de
    // cuentas del castillo y su bandera— tienen que salir. Sin esto, un patrón
    // que no casara nada pasaría por vacío.
    expect(escrituras).toHaveLength(3);
  });

  it('la rejilla de tipos del vestido la escribe `ponerTipo`, nadie más: así el río no se corta', () => {
    // #144, río continuo: el río del paso 2 lo partían diecisiete escrituras de
    // `tipos` en el vestido (las esquinas de las sendas, el agua derramada, las
    // orillas de las espigas…), y ninguna sabía que una casilla era del río.
    // `ponerTipo` lanza si se le pide cambiar una casilla del río; una
    // escritura por corchetes en otro sitio se lo saltaría en silencio.
    const escrituras = infractoresDeCodigo(
      CORE,
      /\btipos\s*\[[^\]]+\]\s*=(?!=)|\btipos\s*\.\s*(fill|set|copyWithin)\s*\(/,
    );
    const codigo = codigoDe('src/core/map/vestir.ts').split('\n');
    const funcionDe = (linea: number): string | null => {
      for (let i = linea - 1; i >= 0; i--) {
        const m = /^export function (\w+)/.exec(codigo[i] ?? '');
        if (m !== null) return m[1] ?? null;
      }
      return null;
    };
    const ajenas = escrituras.filter((e) => {
      const m = /^src\/core\/map\/vestir\.ts:(\d+) /.exec(e);
      return m === null || funcionDe(Number(m[1])) !== 'ponerTipo';
    });
    expect(ajenas).toEqual([]);
    // Que mire algo: la de `ponerTipo` sale.
    expect(escrituras).toHaveLength(1);
  });

  it('el camino de un héroe lleva lo hostil: fuera de game.ts nadie llama al Dijkstra del mapa', () => {
    // Lo hostil de la partida —héroe ajeno, castillo ajeno guarnecido— se
    // alcanza y no se cruza en el camino de TODOS (la IA, la persona y el
    // agente), y eso solo lo sabe quien tiene la partida: `alcanceDelHeroe` y
    // `caminoHasta`, en `game.ts`. Un `findPath` o un `reachableFrom` a pelo en
    // la IA o en el cliente volvería a cruzar por encima de una guarnición en
    // un paso estrecho sin que nada se pusiera rojo: el parámetro es opcional
    // porque el mapa, solo, no sabe de héroes.
    const llamadas = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\b(?:findPath|reachableFrom)\s*\(/,
    );
    // `battle/` se salta por nombre y no por despiste: su `findPath` es el del
    // tablero de hexes, otra función con el mismo nombre y sin mapa.
    const ajenas = llamadas.filter(
      (e) => !/^src\/core\/(?:map\/map\.ts|state\/game\.ts|battle\/)/.test(e),
    );
    expect(ajenas).toEqual([]);
    // Y que mire algo: las dos de `game.ts` tienen que salir. Los asaltantes
    // trajeron una tercera —el alcance prudente de la IA— y volvió a ser una
    // opción de `alcanceDelHeroe` (`evitarEmboscadas`): el mismo Dijkstra con
    // una marca más no es una segunda puerta.
    expect(llamadas.filter((e) => e.startsWith('src/core/state/game.ts:'))).toHaveLength(2);
  });

  it('la forma del tablero de batalla la dice `board.ts`: nadie más importa el ancho de una fila ni compara una columna con un número', () => {
    // Tablero simétrico (11-10-2026): filas de 12 y 11. Antes el tablero era un
    // rectángulo de `BOARD_WIDTH`, y cada recorrido se escribía con dos bucles
    // `col < BOARD_WIDTH`; con las filas de distinto ancho, uno de esos que se
    // quedara pintaba o recorría la casilla que no existe. Se recorre con
    // `allHexes()` o `filasDelTablero()` y se pregunta con `isInside`/`espejo`;
    // el pie, con `ULTIMA_FILA`, y el ancho que pide el lienzo, con
    // `EXTENSION_HORIZONTAL`. Por IMPORTACIÓN y no por el nombre en el texto
    // (/simplify, 12-10-2026): con una lista de lectores permitidos, cualquiera
    // de ellos podía volver a escribir el doble bucle.
    const MEDIDAS_DE_FILA = new Set([
      'anchoDeFila',
      'ANCHO_DE_FILA_PAR',
      'ANCHO_DE_FILA_IMPAR',
      'BOARD_HEIGHT',
      'BOARD_WIDTH',
    ]);
    const deBoard =
      /import\s*(?:type\s*)?(\{[^}]*\}|\*\s*as\s+\w+)\s*from\s*['"]([^'"]*\/board\.js)['"]/g;
    const importadores: string[] = [];
    const conMedidas: string[] = [];
    for (const ruta of [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros('src/shared')]) {
      if (ruta === 'src/core/battle/board.ts') continue;
      for (const [, nombres, desde] of leer(ruta).matchAll(deBoard)) {
        // Solo el `board.ts` de la batalla: `./board.js` lo es desde `battle/`.
        const esElDeLaBatalla =
          (desde as string).endsWith('battle/board.js') ||
          (desde === './board.js' && ruta.startsWith('src/core/battle/'));
        if (!esElDeLaBatalla) continue;
        importadores.push(ruta);
        const importados = (nombres as string).startsWith('*')
          ? ['* (todo el módulo)']
          : (nombres as string)
              .slice(1, -1)
              .split(',')
              .map(
                (n) =>
                  n
                    .trim()
                    .replace(/^type\s+/, '')
                    .split(/\s+as\s+/)[0] as string,
              )
              .filter((n) => n !== '');
        for (const n of importados) {
          if (MEDIDAS_DE_FILA.has(n) || n.startsWith('*')) conMedidas.push(`${ruta} → ${n}`);
        }
      }
    }
    expect(conMedidas).toEqual([]);
    // Y que mire algo: la proyección, el editor y el despliegue importan de `board.ts`.
    for (const r of [
      'src/client/render/proyeccion.ts',
      'src/client/arena/paneles.ts',
      'src/core/battle/battle.ts',
    ]) {
      expect(importadores, r).toContain(r);
    }
    // Una columna comparada con un número de 8 para arriba es el borde derecho
    // escrito a mano: el de las pares no es el de las impares.
    const bordes = infractoresDeCodigo(
      [
        ...CORE.filter(
          (r) => /^src\/core\/(?:battle|ai|contract)\//.test(r) || r === 'src/core/arena.ts',
        ),
        ...CLIENTE,
        ...SERVIDOR,
      ],
      /\.col\s*(?:[<>]=?|[!=]==)\s*(?:[89]|1\d)\b/,
    );
    expect(bordes).toEqual([]);
  });

  it('qué grupo de asaltantes se ve lo decide `asaltantesALaVista`, nadie más', () => {
    // #130 (historia en `docs/historia.md`): la regla la escribe una función y
    // la leen todos. El cliente (fuera del espectador, que lo ve todo) y el
    // contrato no leen `state.raiders`, y fuera de `asaltantes.ts` nadie filtra
    // grupos para enseñarlos. Es la red secundaria: la primera es el tipo
    // `AsaltantesALaVista`. La IA de reglas sí lee `state.raiders` sin niebla:
    // es su ventaja declarada (#115), y por eso `ai/` no entra aquí.
    const lectores = infractoresDeCodigo(
      [
        ...CLIENTE.filter((r) => !r.startsWith('src/client/espectador/')),
        ...CORE.filter((r) => r.startsWith('src/core/contract/')),
        ...SERVIDOR.filter((r) => r !== 'src/server/vista-espectador.ts'),
      ],
      /\bstate\.raiders\b/,
    );
    expect(lectores).toEqual([]);
    // Filtrar grupos, en nadie que enseñe algo: ni el cliente —espectador
    // incluido—, ni el contrato, ni el servidor. (`game.ts` filtra para QUITAR
    // un grupo de la partida, que es mutación y no vista.)
    const filtros = infractoresDeCodigo(
      [...CLIENTE, ...CORE.filter((r) => r.startsWith('src/core/contract/')), ...SERVIDOR],
      /\b(?:raiders|asaltantesALaVista\([^)]*\))\s*\.\s*filter\s*\(/,
    );
    expect(filtros).toEqual([]);
    // Y que mire algo: la puerta filtra, y el espectador, que no pasa por ella,
    // lee el estado. Sin esto, un patrón que no casara nada pasaría por vacío.
    // Lo que NO ve: un filtro sobre la lista con otro nombre (`vistos.filter`)
    // o un `continue` dentro de un bucle. Lo primero lo para el tipo, que el
    // `.filter` pierde; lo segundo, en el lienzo, decide dónde se pinta un
    // grupo —entre los volúmenes o sobre la niebla—, no si se ve.
    expect(
      infractoresDeCodigo(['src/core/state/asaltantes.ts'], /\braiders\s*\.\s*filter\s*\(/),
    ).not.toEqual([]);
    expect(
      infractoresDeCodigo(['src/server/vista-espectador.ts'], /\bstate\.raiders\b/),
    ).not.toEqual([]);
  });

  it('qué héroe se ve y qué se sabe de un objeto lo deciden `heroesALaVista` y `objetosConocidos`', () => {
    // #64: el lienzo, el minimapa y la barra pintaban `state.heroes` y
    // `map.objects` recortados por `fog`, y enseñaban al rival y la bandera de
    // hoy en cualquier casilla pisada alguna vez. Ahora los leen de la sesión,
    // que pregunta al núcleo, y el contrato del agente pasa por las mismas dos.
    // La red primaria es el tipo: `AdventureScene` ya no trae héroes. Esta es la
    // secundaria, para el estado vivo leído por otro lado. Fuera quedan la
    // sesión (que es la puerta), el espectador (lo ve todo), el escenógrafo (lee
    // DÓNDE está cada objeto, que no cambia, nunca su estado) y lo de desarrollo.
    const fuera = (r: string) =>
      r === 'src/client/session.ts' ||
      r.startsWith('src/client/espectador/') ||
      r.startsWith('src/client/render/escenario/') ||
      r.startsWith('src/client/desarrollo/');
    const lectores = infractoresDeCodigo(
      [
        ...CLIENTE.filter((r) => !fuera(r)),
        ...CORE.filter((r) => r.startsWith('src/core/contract/')),
      ],
      /\bstate\.heroes\b|\bmap\.objects\b|\bobjectAt\s*\(|\.memory\b/,
    );
    expect(lectores).toEqual([]);
    // Y que mire algo: la sesión lee el estado vivo con «Ver mapa entero».
    expect(infractoresDeCodigo(['src/client/session.ts'], /\bmap\.objects\b/)).not.toEqual([]);
  });

  it('el arte de una dirección no vuelve: ninguna figura lee `characters/`, `rpg/scenes` ni un `atlas.webp` raíz', () => {
    // Desde el 03-10-2026 toda figura es de 8 direcciones —las suyas o las del
    // Y Bot— y el arte de una dirección se borró del repo (decisión del
    // usuario). Una ruta nueva a él cargaría un 404 y caería al marcador en
    // silencio. El `atlas.webp` de una dirección vive en `unidades/<id>/`; el de
    // 8, en `unidades/<id>/dN/`, así que lo que se prohíbe es el que no pasa por
    // una carpeta `dN` (ni por un `${...}` que la construya). Mira código y
    // cadenas, no comentarios, que sí pueden contar la historia.
    const patron = /characters\/|rpg\/scenes|unidades\/[^/'"`]+\/atlas\.(webp|json)/;
    expect(infractoresDeCodigo([...CLIENTE, ...SERVIDOR, ...CORE], patron)).toEqual([]);
  });

  it('las herramientas de desarrollo solo entran por `import()` tras `HERRAMIENTAS_DE_DESARROLLO`', () => {
    // `src/client/desarrollo/` no llega a `vite build`: solo `import type` o un
    // `import()` dentro de `if (HERRAMIENTAS_DE_DESARROLLO)`. `sinDesarrollo` lo
    // caza al construir; esto, en cada `pnpm test`, con fichero y línea.
    const fuera = CLIENTE.filter((r) => !r.startsWith('src/client/desarrollo/'));
    const colados: string[] = [];
    for (const ruta of fuera) {
      const codigo = codigoDe(ruta);
      // Estático: `import … from`, `export … from` o `import '…'` a secas. Solo
      // vale `import type`, que no deja rastro en el bundle.
      for (const m of codigo.matchAll(
        /\b(?:import|export)\s+(type\s+)?(?:[^;'"]*?\bfrom\s*)?['"][^'"]*\/desarrollo\/[^'"]*['"]/g,
      ))
        if (m[1] === undefined) colados.push(`${ruta}:${lineaDe(codigo, m.index)} → ${m[0]}`);
      // Dinámico: dentro de un `if (HERRAMIENTAS_DE_DESARROLLO) {` justo delante.
      for (const m of codigo.matchAll(/\b(?:import|require)\s*\(\s*['"][^'"]*\/desarrollo\//g)) {
        const antes = codigo.slice(Math.max(0, m.index - 80), m.index);
        if (!/if\s*\(\s*HERRAMIENTAS_DE_DESARROLLO\s*\)\s*\{\s*(?:void\s+)?$/.test(antes))
          colados.push(`${ruta}:${lineaDe(codigo, m.index)} → ${m[0]} sin la guarda`);
      }
    }
    expect(colados).toEqual([]);
  });

  it('los serializadores del contrato no tapan su tipo con `: unknown` (#109)', () => {
    // El criterio lo escribió `serializeKnownMap`: el tipo lo infiere el
    // compilador y quien lo necesite lo escribe donde lo usa. Los otros cuatro
    // se quedaron con `: unknown` y la factura la pagaba `consultas.ts` con dos
    // `as object`, que convertían el nombre de un campo del contrato en una
    // cadena que nadie comprobaba. Con el tipo inferido, el servidor lee el
    // campo y un renombrado en `core` no compila.
    const tapados: string[] = [];
    let serializadores = 0;
    for (const ruta of CORE.filter((r) => r.startsWith('src/core/contract/'))) {
      const codigo = codigoDe(ruta);
      for (const m of codigo.matchAll(
        /export function (serialize\w*)\(([^{]*?)\)\s*(:\s*[^{]+)?\{/g,
      )) {
        serializadores++;
        if (/^:\s*unknown\s*$/.test(m[3] ?? ''))
          tapados.push(`${ruta}:${lineaDe(codigo, m.index)} → ${m[1]}`);
      }
    }
    expect(tapados).toEqual([]);
    // Y que mire algo: sin esto, un patrón que no casara nada pasaría por vacío.
    expect(serializadores).toBeGreaterThanOrEqual(5);
    // El síntoma, en el servidor: un `as object` es un tipo del contrato tirado.
    expect(infractoresDeCodigo(SERVIDOR, /\bas object\b/)).toEqual([]);
  });

  it('el núcleo no lee la disposición de la base: un sitio no tiene coordenadas en las reglas', () => {
    // `data/bases/<f>.json` es presentación (dónde se pinta cada edificio y por
    // dónde se anda) y la leen el cliente y el taller por `shared/base.ts`. Si el
    // núcleo la leyera, una coordenada de un fondo pintado pasaría a decidir algo
    // del juego. Mira el código con sus cadenas: un `import` es una cadena.
    expect(infractoresDeCodigo(CORE, /data\/bases/)).toEqual([]);
  });

  it('las escenas de la base, de la tropa y de la morada no cambian el estado: solo importan tipos del núcleo', () => {
    // La base caminable es estado del cliente; las reglas van por los botones a
    // la sesión. Un `import` de valor de `@core` en `render/base/` sería una
    // puerta lateral al núcleo que el guardia de `session.ts` no ve, porque
    // solo mira las funciones que mutan. La escena de la tropa (19-10-2026), lo
    // mismo: lo que lee del núcleo se lo da la sesión ya compuesto
    // (`vistaDeLaTropa`). Roto a mano: un `import { heroUnit } from
    // '@core/hero/hero.js'` en `render/tropa/pintar.ts` sale rojo con su línea.
    // La de la morada (20-10-2026) y lo que comparten las dos (`de-pie.ts`), igual:
    // lo que lee del núcleo es `vistaDeLaMorada`. Roto a mano: un `import {
    // recruitCost } from '@core/town/town.js'` en `render/morada/fila.ts`, rojo.
    const base = CLIENTE.filter(
      (r) =>
        r.startsWith('src/client/render/base/') ||
        r.startsWith('src/client/render/tropa/') ||
        r.startsWith('src/client/render/morada/') ||
        r === 'src/client/render/de-pie.ts' ||
        r === 'src/client/escenas/de-pie.ts' ||
        r === 'src/client/escenas/tropa.ts' ||
        r === 'src/client/escenas/morada.ts',
    );
    expect(base.filter((r) => r.includes('tropa')).length).toBeGreaterThanOrEqual(3);
    expect(base.filter((r) => r.includes('morada') || r.includes('de-pie')).length).toBe(4);
    const colados: string[] = [];
    for (const ruta of base) {
      const codigo = codigoDe(ruta);
      for (const m of codigo.matchAll(/\bimport(?!\s+type\b)\s*([^;]*?)['"]@core\/[^'"]+['"]/gs)) {
        colados.push(`${ruta} → ${m[0].replace(/\s+/g, ' ')}`);
      }
      for (const m of codigo.matchAll(/\bimport\s*\(\s*['"]@core\//g)) {
        colados.push(`${ruta} → ${m[0]}`);
      }
    }
    expect(colados).toEqual([]);
  });

  it('la base, la tropa y la morada no copian la escala del combate: la toman de `escalaDelCombate`', () => {
    // Un adulto mide lo mismo en la base que en una batalla porque el paso sale
    // de una sola cuenta (`pasoDeLaBase` → `escalaDelCombate`). Las constantes
    // del tablero son privadas de `proyeccion.ts`; si la escena de la base las
    // nombrara o fijara su propio alto de figura, la escala sería una copia que
    // un día deja de casar (vuelta 2 del ciclo de la base).
    // La escena de la tropa (19-10-2026) no va a la escala del combate: su
    // cámara encuadra al grupo (`encuadrarLaTropa`). Pero la figura en pasos es
    // la de `cajaDeFiguraEn`, y tampoco puede fijar su propio alto de figura.
    const base = CLIENTE.filter(
      (r) =>
        r.startsWith('src/client/render/base/') ||
        r === 'src/client/escenas/castillo.ts' ||
        r.startsWith('src/client/render/tropa/') ||
        r.startsWith('src/client/render/morada/') ||
        r === 'src/client/render/de-pie.ts' ||
        r === 'src/client/escenas/de-pie.ts' ||
        r === 'src/client/escenas/tropa.ts' ||
        r === 'src/client/escenas/morada.ts',
    );
    expect(base.length).toBeGreaterThan(13);
    expect(
      infractoresDeCodigo(base, /\bANCHO_TABLERO\b|\bALTO_FIJO\b|\bALTO_DE_FIGURA\s*=/),
    ).toEqual([]);
  });

  it('lo que dicen los vecinos lo escribe `ponerVoces` y nadie más', () => {
    // `Town.voces` es presentación del narrador; si otro lo escribiera —la IA,
    // el cliente, el director a mano— se saltaría el juicio línea a línea y la
    // firma que dice cuándo caduca. La asignación y los corchetes.
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\.voces\s*=(?!=)|\[\s*['"`]voces['"`]\s*\]\s*=(?!=)/,
    );
    const ajenas = escrituras.filter((e) => !e.startsWith('src/core/town/voces.ts:'));
    expect(ajenas).toEqual([]);
    // Y que mire algo: la escritura de verdad tiene que salir.
    expect(escrituras).toHaveLength(1);
  });

  it('el clima que pide el narrador lo escribe `pedirClima` y nadie más', () => {
    // `GameState.climaPedido` es presentación, como las voces: quien lo
    // escribiera por su cuenta se saltaría el juicio pedido a pedido, el tope de
    // días y el de cada turno. Roto a mano: un `state.climaPedido = {}` en
    // `director.ts` sale rojo con su línea.
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\.climaPedido\s*=(?!=)|\[\s*['"`]climaPedido['"`]\s*\]\s*=(?!=)|\.climaPedido\s*\[[^\]]*\]\s*=(?!=)/,
    );
    const ajenas = escrituras.filter((e) => !e.startsWith('src/core/state/clima.ts:'));
    expect(ajenas).toEqual([]);
    expect(escrituras).toHaveLength(1);
  });

  it('`data/clima.json` lo importa solo `core/state/clima.ts`, que lo valida al cargar', () => {
    // Las cifras del clima (pesos, rachas, topes del narrador) se leen validadas
    // en un sitio (`validarClima`). Roto a mano: un `import c from
    // '../../data/clima.json'` en `render/clima/recetas.ts` sale rojo.
    const PUERTA = 'src/core/state/clima.ts';
    const importa = importaDe(/[^'"]*data\/clima\.json/);
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        importa,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], importa)).not.toEqual([]);
  });

  it('la pieza que pinta el clima no lee la sesión: le dan el clima del sitio', () => {
    // `render/clima/` la llaman el mapa, la batalla y cualquier escena lateral
    // (la base, la morada y las del «mapa vivo»): si leyera la sesión de la
    // partida, la arena y el espectador, que no la tienen, no podrían usarla.
    // Roto a mano: un `import type { Session } from '../../session.js'` en
    // `render/clima/clima.ts` sale rojo.
    const pieza = CLIENTE.filter((r) => r.startsWith('src/client/render/clima/'));
    expect(pieza.length).toBeGreaterThanOrEqual(4);
    expect(infractoresDeCodigo(pieza, importaDe(/[^'"]*session(?:\.js)?/))).toEqual([]);
  });

  it('el tema de la interfaz lo pone `ponerTema`: nadie más escribe `data-tema`', () => {
    // Un `data-tema` escrito por otro sitio no borraría lo que el lienzo leyó del
    // tema anterior (`temaDelLienzo`, en caché): CSS de un tema y chapas de otro.
    // Por `dataset`, por `setAttribute` (que ya vigila la puerta del marcado) y
    // borrándolo. Roto a mano: un `document.documentElement.dataset.tema = 'elfos'`
    // en `arena/main.ts` sale rojo con su línea.
    const escribeElTema =
      /dataset\s*(?:\.\s*tema|\[\s*['"`]tema['"`]\s*\])\s*=(?!=)|delete\s+[\w.]*dataset\s*\.\s*tema\b|['"`]data-tema['"`]/;
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== 'src/client/temas.ts');
    expect(infractoresDeCodigo(fuera, escribeElTema)).toEqual([]);
    expect(infractoresDeCodigo(['src/client/temas.ts'], escribeElTema)).not.toEqual([]);
  });

  it('la forma de los temas vive en forma.css y toda regla suya empieza por `:root[data-tema]`', () => {
    // Sin tema (el espectador) no se aplica ninguna: así el neutro no cambia, y
    // la regla gana en especificidad a la de `style.css` que corrige. Y es el
    // único sitio: una regla con tema en `style.css` o en `arena.css` sería una
    // segunda forma de lo mismo. `piezas-de-tema.css` (generada) lleva bloques de
    // tema, pero solo de fichas: lo vigila `piezas-de-tema.test.ts`. Roto a mano:
    // `#side h3 { letter-spacing: 3px }` sin el prefijo en `forma.css` sale rojo
    // con su línea, y `:root[data-tema] #day { padding: 0 }` en `style.css`, también.
    const sinTema: string[] = [];
    const deForma = bloquesCss(leer('src/client/forma.css'));
    for (const { selector, linea } of deForma) {
      if (selector.startsWith('@')) continue;
      for (const parte of selector.split(','))
        if (!parte.trim().startsWith(':root[data-tema]'))
          sinTema.push(`forma.css:${linea} ${parte.trim()}`);
    }
    expect(sinTema).toEqual([]);
    expect(deForma.filter((b) => !b.selector.startsWith('@')).length).toBeGreaterThan(10);
    const fuera: string[] = [];
    const conTema = ['/forma.css', '/piezas-de-tema.css'];
    for (const ruta of HOJAS_CON_REGLAS.filter((r) => !conTema.some((c) => r.endsWith(c)))) {
      for (const { selector, linea } of bloquesCss(leer(ruta)))
        if (/\[data-tema/.test(selector)) fuera.push(`${ruta}:${linea} ${selector}`);
    }
    expect(fuera).toEqual([]);
  });

  it('las hojas de estilo no llevan colores fijos: todos salen de las fichas del tema', () => {
    // Un color escrito en una regla no cambia con el tema: con el de los no
    // muertos se veía el latón de siempre en un rincón. Las fichas viven en el
    // `:root` neutro de `style.css` (también las fijas, `--info-*`, que valen
    // igual en todos) y en los bloques de `temas.css` (que vigila
    // `temas.test.ts`); fuera de ahí, ninguno. Roto a mano: `color: #f2deac` de
    // vuelta en `#day` sale rojo con su línea.
    const colados: string[] = [];
    for (const ruta of HOJAS_CON_REGLAS) {
      for (const { selector, declaraciones } of bloquesCss(leer(ruta))) {
        if (selector === ':root') continue;
        for (const { propiedad, valor, linea } of declaraciones) {
          // Las variables, fuera: `var(--gold)` no es un color escrito.
          const decl = `${propiedad}: ${valor}`.replace(/var\(--[a-z0-9-]+\)/gi, '');
          if (COLOR.test(decl)) colados.push(`${ruta}:${linea} [${selector}] ${decl}`);
        }
      }
    }
    expect(HOJAS_CON_REGLAS.length).toBeGreaterThan(4);
    expect(colados).toEqual([]);
  });

  it('el lienzo escribe sus letras con las del tema: ninguna familia a mano en `ctx.font`', () => {
    // Una letra escrita en el lienzo no cambia con el tema: la corona del
    // comandante y el rótulo de la figura sin arte se quedaron en `system-ui`
    // cuando todo lo de alrededor ya iba con la del ejército. La familia sale de
    // `temaDelLienzo()` (`letraUi`, `letraTitulo`), y el tamaño y el grosor, de
    // quien pinta. Roto a mano: la corona con su `system-ui, "DejaVu Sans"` de
    // antes sale rojo con su línea.
    const familiaEscrita =
      /\.font\s*=.*(?:system-ui|sans-serif|\bserif\b|monospace|cursive|fantasy|Georgia|DejaVu|Times|Arial|Helvetica|Verdana)/;
    // Las herramientas de desarrollo (`src/client/desarrollo/`, solo en `pnpm dev`)
    // no se visten: pintan sobre el mapa lo que se mide, en la letra del sistema.
    const lienzoDelJuego = CLIENTE.filter((r) => !r.startsWith('src/client/desarrollo/'));
    expect(infractoresDeCodigo(lienzoDelJuego, familiaEscrita)).toEqual([]);
    // Y el guardia mira algo: el lienzo sí pone letras.
    expect(
      infractoresDeCodigo(CLIENTE, /\.font\s*=.*temaDelLienzo\(\)|\.font\s*=.*\btema\.letra/),
    ).not.toEqual([]);
  });

  it('FAL_KEY no llega al navegador', () => {
    // El arte se genera en scripts de línea de órdenes; el cliente solo carga
    // PNGs. Una clave de pago en el bundle es un incidente, no un despiste.
    //
    // Mira el CÓDIGO y no el fichero, y esto lo cambió el ciclo del espectador:
    // miraba el fichero entero y se puso rojo con un COMENTARIO que explicaba
    // por qué el puerto entra por `define` y no por el entorno. Es la tercera
    // vez que este fichero aprende lo mismo —el de la coma flotante ya nacía
    // rojo con seis presas y todas falsas—: **un guardia que caza su propia
    // explicación se ignora desde el primer día**, y una mención en un
    // comentario no filtra ninguna clave. Las cadenas NO se blanquean, así que
    // un acceso indirecto escrito como texto sigue cayendo.
    expect(infractoresDeCodigo(CLIENTE, /FAL_KEY|process\.env/)).toEqual([]);
  });
});

// ------------------------------------------------------------------ armadura (#262)

describe('la armadura (#262)', () => {
  it('`puntosDeArmadura` lo escribe solo `conEquipo` y lo leen solo él y `battle/armas.ts`; ninguna pieza da PV y el agente la ve', () => {
    // 14-10-2026: las piezas dan puntos de armadura, que se restan
    // del daño de cada golpe. La suma es de `vestir` (`hero/equipo.ts`) y la resta
    // de `trasLaArmadura` (`battle/armas.ts`), por donde pasa todo lo que quita
    // vida (`herir`): una pantalla o una IA que leyera `unit.puntosDeArmadura` por
    // su cuenta restaría con otra regla, y un `{ ...u, puntosDeArmadura: 3 }` fuera
    // de la suma daría armadura que ninguna pieza pone. Desde el 18-10-2026 (una
    // sola clase de piezas) ninguna da PV, `pv` no es un campo de `Pieza` (lo dice
    // el tipo y el cargador) y el agente ve la armadura (`stacks[].armor`, por
    // `armaduraDe`, y en la prosa del catálogo). Rotos a mano: un
    // `{ ...u, puntosDeArmadura: 3 }` en `arena.ts`, un `s.unit.puntosDeArmadura`
    // en `paneles.ts`, un `hp: unit.hp + pv` en la suma y un `'pv'` en
    // `CAMPOS_DE_PIEZA` salen rojos.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const ESCRITOR = 'src/core/hero/equipo.ts';
    const LECTORES = [ESCRITOR, 'src/core/battle/armas.ts', 'src/core/types.ts'];
    const menciona = /\bpuntosDeArmadura\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LECTORES.includes(r)),
        menciona,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/battle/armas.ts'], menciona)).not.toEqual([]);
    const escribe = /\bpuntosDeArmadura\s*:|\{\s*puntosDeArmadura\s*\}|\.puntosDeArmadura\s*=(?!=)/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== ESCRITOR),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ESCRITOR], escribe)).not.toEqual([]);
    // Ninguna pieza da PV: la suma de las piezas no toca la vida, y `pv` no es un
    // campo de una pieza (un `pv` en el fichero tumba la carga).
    const sumaLaVida = /\bhp:\s*unit\.hp\s*\+/;
    expect(infractoresDeCodigo([ESCRITOR], sumaLaVida)).toEqual([]);
    expect(CAMPOS_DE_PIEZA).not.toContain('pv');
    expect(EQUIPO.some((p) => 'pv' in p)).toBe(false);
    // El agente la ve: en la prosa del catálogo, como cifra de cada pieza que la da.
    for (const p of EQUIPO.filter((x) => (x.armadura ?? 0) > 0)) {
      expect(CATALOGO_DE_EQUIPO_EN_PROSA, p.id).toContain(`+${p.armadura} Armadura`);
    }
  });
});

describe('las bases y la rueda del arma (18-10-2026)', () => {
  it('una base se suma en un sitio y la rueda de un golpe va con su arma', () => {
    // Tres partes:
    //  (a) `resolverBases` (la única suma de una base) es privada de `data.ts` y la
    //      llama solo el cargador del catálogo (`leerPiezas`), por el que pasan el
    //      fichero, el catálogo que edita la arena y las piezas de una pelea
    //      (`catalogoDeEquipo`): un segundo montador de catálogo sumaría la base con
    //      otra regla, o no la sumaría.
    //  (b) Los extras de una pieza con base (`.extras`) los leen solo `data.ts`,
    //      `arena.ts` y la página de la arena (su ficha los escribe): nadie más
    //      suma un extra por su cuenta.
    //  (c) La tabla de los niveles (vuelta 2): `TABLA` (privada de
    //      `cifras-de-la-rueda.ts`) sale solo en su declaración, en
    //      `cifrasDeLosNiveles` (la única lectura) y en `GOLPES_DEL_RAPIDO` (que
    //      no depende del nivel), y `cifrasDeLosNiveles` la llaman solo
    //      `ruedaDelGolpe` (el golpe, con el arma de ese golpe) y `filasDeLaRueda`
    //      (la ficha de una pieza). Un tipo que leyera la tabla por su cuenta se
    //      olvidaría del arma del golpe. Por declaración, no contando líneas: que
    //      el formateador parta una no lo pone rojo.
    // Rotos a mano: un `p.extras.ataque` en `damage.ts`, una lectura de `TABLA`
    // en `delNivel` y un `cifrasDeLosNiveles(` en `porcientoDelTipo` salen rojos.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    /** Las líneas de `rutas` con `patron` fuera de las declaraciones con permiso. */
    const fueraDe = (
      patron: RegExp,
      permisos: Readonly<Record<string, readonly string[]>>,
      rutas: readonly string[] = todos,
    ): string[] => {
      const fuera: string[] = [];
      for (const ruta of rutas) {
        const conPermiso = lineasDeLasDeclaraciones(ruta, permisos[ruta] ?? []);
        for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
          if (!conPermiso.has(i + 1) && patron.test(linea)) fuera.push(`${ruta}:${i + 1}`);
        }
      }
      return fuera;
    };
    const llamada = /\bresolverBases\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== 'src/core/data.ts'),
        llamada,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/data.ts'], /\bresolverBases\s*\(/)).not.toEqual([]);
    // Y en `data.ts`, la llama solo `leerPiezas`: el catálogo (fichero, arena y
    // pelea) pasa por él.
    expect(
      fueraDe(/\bresolverBases\s*\(/, { 'src/core/data.ts': ['resolverBases', 'leerPiezas'] }, [
        'src/core/data.ts',
      ]),
    ).toEqual([]);

    const extras = /\.extras\b/;
    const leenExtras = (r: string): boolean =>
      r === 'src/core/data.ts' || r === 'src/core/arena.ts' || r.startsWith('src/client/arena/');
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !leenExtras(r)),
        extras,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/data.ts'], extras)).not.toEqual([]);

    const tabla = /\bTABLA\b/;
    expect(
      fueraDe(tabla, {
        'src/core/battle/cifras-de-la-rueda.ts': [
          'TABLA',
          'cifrasDeLosNiveles',
          'GOLPES_DEL_RAPIDO',
        ],
      }),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/battle/cifras-de-la-rueda.ts'], tabla)).not.toEqual([]);
    const traduce = /\bcifrasDeLosNiveles\s*\(/;
    expect(
      fueraDe(traduce, {
        'src/core/battle/cifras-de-la-rueda.ts': ['cifrasDeLosNiveles'],
        'src/core/battle/armas.ts': ['ruedaDelGolpe'],
        'src/core/battle/rueda.ts': ['filasDeLaRueda'],
      }),
    ).toEqual([]);
    expect(infractoresDeCodigo(['src/core/battle/armas.ts'], traduce)).not.toEqual([]);
    expect(infractoresDeCodigo(['src/core/battle/rueda.ts'], traduce)).not.toEqual([]);
  });
});
