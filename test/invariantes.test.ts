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
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playAiGame } from '../src/core/ai/turn.js';
import { stackSpeed } from '../src/core/battle/battle.js';
import { effectiveAttack } from '../src/core/battle/damage.js';
import {
  applyEffect,
  EFFECT_KINDS,
  type EffectKind,
  efectoDeTirada,
  effectiveLuck,
} from '../src/core/battle/effects.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { creature } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import type { GameState } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { CREATURE_TRAITS } from '../src/core/types.js';
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

/**
 * Lo que hay en el repo, indexado o no: `-o --exclude-standard` es la mitad que
 * faltaba.
 *
 * `git ls-files` a secas lista solo lo indexado, y un fichero nuevo sin
 * `git add` —que es como nacen las presas, y como está el árbol justo cuando
 * corre el hook `Stop`— pasaba por debajo. Es la misma llamada que ya hacía
 * `.claude/hooks/verde.sh` dos ficheros más allá.
 */
function ficherosDeMaquina(): string[] {
  return execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: RAIZ })
    .toString('utf8')
    .split('\0')
    .filter(
      (f) =>
        f !== '' &&
        !CLASES_QUE_LEE_UNA_PERSONA.includes(extname(f).toLowerCase()) &&
        esTextoDeMaquina(f),
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
    for (const [i, linea] of sinComentarios(leer(ruta)).split('\n').entries()) {
      if (patron.test(linea)) out.push(`${ruta}:${i + 1} → ${linea.trim()}`);
    }
  }
  return out;
}

/**
 * Las líneas (desde 1) de unas declaraciones de primer nivel de un fichero: de
 * `function`/`class`/`const NOMBRE` a la primera línea que empieza por `}`. Una
 * que no está lanza: renombrarla no puede ensanchar un permiso sin que se vea.
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
    while (fin < lineas.length && !lineas[fin]?.startsWith('}')) fin++;
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
  const cuerpo = /^(\w+)\.body\s*,\s*(\w+)\.origen\.veterania$/.exec(argumento);
  if (cuerpo === null || cuerpo[1] !== cuerpo[2]) return false;
  const antes = codigo.slice(Math.max(0, inicio - 200), inicio);
  const rama =
    /\bswitch\s*\(\s*(\w+)\.origen\.kind\s*\)\s*\{\s*case\s+'catalogo'\s*:\s*(?:\{\s*const\s+\w+\s*=|return)\s+$/.exec(
      antes,
    );
  return rama !== null && rama[1] === cuerpo[1];
}

/** Si el fichero importa `creature` del catálogo (`data.js`) con su nombre. */
function importaCreature(codigo: string): boolean {
  return /import\s*\{[^}]*\bcreature\b[^}]*\}\s*from\s*['"][^'"]*\/data\.js['"]/.test(codigo);
}

/**
 * Dónde aparece `creature` como VALOR y no como llamada: pasada a `map`, a
 * `then`, asignada a otra variable. Lo que no cuenta: la propia importación,
 * la llamada, una propiedad (`s.creature`, `{ creature: … }`, `creature?:`) y
 * el texto de una cadena (`'creature'`).
 */
function creatureComoValor(codigo: string): number[] {
  const sinImports = codigo.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]/g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  const out: number[] = [];
  for (const m of sinImports.matchAll(/(?<![\w.$'"`-])creature\b(?![\w$'"`-])/g)) {
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
  tirada: efectoDeTirada,
};

/** Un stack limpio, fuera de tablero: solo se le cuelgan efectos y se lee. */
function stackDePrueba(): BattleStack {
  return {
    id: 'guardia-0',
    side: 'attacker',
    slot: 0,
    body: 'pikeman',
    unit: creature('pikeman'),
    origen: { kind: 'catalogo', oro: 200, veterania: null },
    initialCount: 10,
    count: 10,
    topHp: 1,
    hex: { col: 0, row: 0 },
    shotsLeft: 0,
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

  it('solo la arena cambia las reglas de la batalla', () => {
    // Los interruptores de `battle/reglas.ts` comparan la regla nuestra con la de
    // fheroes2 en la arena, y el juego, el servidor, el agente y los bancos no
    // pueden encender ninguno: entran por `createBattle`, que pone
    // `REGLAS_DEL_JUEGO`. Las puertas a otras reglas son TODAS las que dejan
    // elegirlas: montar la batalla con ellas (`crearBatallaConReglas`, y por
    // encima `batallaDeArena` y `new SesionDeArena`), leerlas de la URL
    // (`reglasDeLaURL`), cambiar una (`conRegla`) y escribir a mano la versión
    // `'fheroes2'` en un literal. Con solo las dos primeras, una llamada a
    // `batallaDeArena` con reglas en `director.ts` quedaba en verde (H3 de QA
    // del banco), y `capturas.ts` encendía el tirador con un literal que nadie
    // veía.
    //
    // Se nombran sin permiso en el motor, la arena del núcleo y la página de la
    // arena; con permiso por declaración, en la sesión de la arena (la clase,
    // no el resto de `session.ts`, que es la partida) y en las pasadas de la
    // arena de `pnpm capturas`, que juegan su espejo. En esos dos, el `import`
    // de una puerta no cuenta, salvo con otro nombre (`as`): con un alias, la
    // llamada ya no se ve. En los demás, importarla ya es rojo. Roto a mano:
    // `batallaDeArena` importado con alias y llamado en `server/director.ts`,
    // `crearBatallaConReglas` en `state/game.ts`, un `'fheroes2'` en `Session`
    // (fuera de `SesionDeArena`) y otro en la pasada del juego de `capturas.ts`
    // salen rojos con su línea.
    const puertas =
      /\b(?:crearBatallaConReglas|batallaDeArena|reglasDeLaURL|conRegla)\b|\bnew\s+SesionDeArena\b|['"`]fheroes2['"`]/;
    const conAlias =
      /\b(?:crearBatallaConReglas|batallaDeArena|reglasDeLaURL|conRegla|SesionDeArena)\s+as\b/;
    const enTodoElFichero = (r: string): boolean =>
      r.startsWith('src/core/battle/') ||
      r === 'src/core/arena.ts' ||
      r.startsWith('src/client/arena/');
    const porDeclaracion: Readonly<Record<string, readonly string[]>> = {
      'src/client/session.ts': ['SesionDeArena'],
      'tools/qa/capturas.ts': [
        'espejoDeLaArena',
        'todoIA',
        'REGLAS_DEL_BANCO',
        'espejoDelBanco',
        'deHoja',
        'jugarArena',
        'espejoDeLosPoderes',
        'poderesEnLaArena',
      ],
    };
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros('tools')];
    const colados: string[] = [];
    for (const ruta of todos.filter((r) => !enTodoElFichero(r))) {
      const conPermiso = lineasDeLasDeclaraciones(ruta, porDeclaracion[ruta] ?? []);
      const imports = ruta in porDeclaracion ? lineasDeImport(ruta) : new Set<number>();
      for (const [i, linea] of sinComentarios(leer(ruta)).split('\n').entries()) {
        if (conPermiso.has(i + 1)) continue;
        if (imports.has(i + 1) && !conAlias.test(linea)) continue;
        if (puertas.test(linea)) colados.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(colados).toEqual([]);

    // Los nombres no bastan (vuelta 2 de QA del banco): una función nueva en
    // `core/arena.ts` que llamase a `batallaDeArena` con otro nombre pasaba, y
    // también `{ ...createBattle(), reglas: otras }` en `state/game.ts`. Por
    // eso se vigilan además los MÓDULOS y la ESCRITURA:
    //  1. Solo la arena (página, disco y taller), la sesión y `pnpm capturas`
    //     importan de `core/arena.ts`; y en la sesión y en `capturas.ts`, lo
    //     importado de allí solo se usa dentro de sus declaraciones con permiso.
    //  2. Fuera del motor, la arena del núcleo y su página, nadie escribe
    //     `reglas:` ni `.reglas =`, salvo en esas mismas declaraciones.
    // Roto a mano: un envoltorio de `batallaDeArena` en `core/arena.ts` importado
    // en `server/director.ts`, un valor de la arena usado en `Session` fuera de
    // `SesionDeArena`, y el spread con `reglas:` en `state/game.ts` salen rojos
    // con su línea.
    const deLaArena =
      /\bfrom\s+['"](?:@core\/|(?:\.\.?\/)+(?:(?:src\/)?core\/)?)arena(?:\.js)?['"]/;
    // `core/arena-murallas.ts` es el formato de las formas de muralla de la misma
    // arena: lee sus validadores (`lista`, `texto`…) y no monta ninguna batalla.
    const puedeImportarla = (r: string): boolean =>
      enTodoElFichero(r) ||
      r === 'src/core/arena-murallas.ts' ||
      r.startsWith('tools/arena/') ||
      r.startsWith('tools/taller/') ||
      r in porDeclaracion;
    // Una clave `reglas:` o `{ …, reglas }`, o una asignación; no la prosa de
    // un mensaje («no lleva las reglas: …»).
    const escribeReglas = /(?:^\s*|[{,]\s*)reglas\s*(?::|[,}])|\.reglas\s*=(?!=)/;
    const fuera: string[] = [];
    for (const ruta of todos.filter((r) => !enTodoElFichero(r))) {
      const texto = leer(ruta);
      const codigo = sinComentarios(texto).split('\n');
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
            fuera.push(`${ruta}:${i + 1} importa de core/arena.ts`);
          continue;
        }
        if (conPermiso.has(i + 1)) continue;
        if (usaLaArena && ruta in porDeclaracion && usaLaArena.test(linea))
          fuera.push(`${ruta}:${i + 1} usa la arena fuera de su permiso → ${linea.trim()}`);
        if (escribeReglas.test(linea))
          fuera.push(`${ruta}:${i + 1} escribe reglas → ${linea.trim()}`);
      }
    }
    expect([...new Set(fuera)]).toEqual([]);
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
    // leer. `effectiveDefense` (`damage.ts`) NO llama a `effectTotal`: el día
    // que #26 traiga un hechizo de defensa, el efecto quedaría colgado del
    // stack y no lo leería nadie — misma promesa sin respaldo que un rasgo
    // muerto.
    //
    // Las dos mitades del guardia:
    //  1. la tabla cubre `EFFECT_KINDS` EXACTAMENTE, así que añadir `'defense'`
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
    // Y la llamada que se mira son DOS nombres: `creature` y `cifrasDeCatalogo`,
    // que es `creature` más la veteranía. Sin el segundo, la regla de las cifras
    // en una sola función habría abierto la puerta de al lado: un
    // `cifrasDeCatalogo(s.body, …)` en el motor lee el catálogo con el cuerpo
    // igual que `creature(s.body)`. La excepción del cable es solo para él.
    const INVERSA_DEL_CABLE = 'src/client/espectador/adaptar.ts';
    const fugas: string[] = [];
    for (const ruta of [...CORE, ...CLIENTE, ...SERVIDOR]) {
      const codigo = sinComentarios(leer(ruta));
      for (const nombre of ['creature', 'cifrasDeCatalogo'] as const) {
        for (const { inicio, argumento } of llamadasA(nombre, codigo)) {
          if (!/\.\s*body\b|\[\s*(['"`])body\1\s*\]/.test(argumento)) continue;
          if (
            nombre === 'cifrasDeCatalogo' &&
            ruta === INVERSA_DEL_CABLE &&
            esRellenoDelCable(codigo, inicio, argumento)
          ) {
            continue;
          }
          fugas.push(
            `${ruta}:${lineaDe(codigo, inicio)} → ${nombre}(${argumento.replace(/\s+/g, ' ')})`,
          );
        }
      }
      if (ruta === 'src/core/data.ts' || !importaCreature(codigo)) continue;
      for (const inicio of creatureComoValor(codigo)) {
        fugas.push(`${ruta}:${lineaDe(codigo, inicio)} → \`creature\` pasada como valor`);
      }
    }
    expect(fugas).toEqual([]);
  });

  it('un stack lo sustituye a media pelea solo la arena, y los poderes solo los pone ella', () => {
    // La arena retoca un tipo a media pelea (`retocarEnBatalla`) sustituyendo sus
    // stacks enteros en `state.stacks`: `BattleStack.unit` sigue siendo de solo
    // lectura, y nadie más cambia un stack por otro (el motor los muta por campo,
    // y quien busca uno lo busca por id). De qué tipo sale cada stack
    // (`tiposDeArena`) lo escribe solo ella al montar. Y los poderes
    // (`UnitInfo.poderes`) solo los escribe ella (`unidadDeCombate`): el catálogo
    // no los tiene, y por eso la jugada `poder` no sale en el juego ni llega al
    // agente, que no la conoce (`battleActionSchema`). Roto a mano: un
    // `state.stacks[0] = s` en `battle.ts`, un `tiposDeArena: {}` en `state/game.ts`
    // y un `{ ...c, poderes }` en `data.ts` salen rojos con su línea.
    const PUERTA = 'src/core/arena.ts';
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== PUERTA);
    const sustituyeUnStack = /\bstacks\[[^\]]+\]\s*=(?!=)/;
    expect(infractoresDeCodigo(fuera, sustituyeUnStack)).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], sustituyeUnStack)).not.toEqual([]);
    // Las fichas de la arena (`fichasDeArena`), con las que el retoque dice qué
    // cambió, también: las pone ella al montar y al retocar.
    const escribeTipos =
      /\b(?:tiposDeArena|fichasDeArena)\s*[:=](?!\s*readonly)|\.fichasDeArena\b(?:\s+as\b[^;]*)?\)?\[[^\]]+\]\s*=(?!=)/;
    const sinElTipo = fuera.filter((r) => r !== 'src/core/battle/types.ts');
    expect(infractoresDeCodigo(sinElTipo, escribeTipos)).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribeTipos)).not.toEqual([]);
    const escribePoderes = /\bpoderes\s*:(?!\s*readonly)|\{\s*poderes\s*\}|\.poderes\s*=(?!=)/;
    const ni = [...CORE, ...SERVIDOR].filter(
      (r) => r !== PUERTA && r !== 'src/core/battle/poderes.ts',
    );
    expect(infractoresDeCodigo(ni, escribePoderes)).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribePoderes)).not.toEqual([]);
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
    let state: GameState | undefined;
    for (let semilla = 19; semilla < 59 && state === undefined; semilla++) {
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
    expect(
      state,
      'ninguna de cuarenta semillas en 48×48 da una partida larga y variada',
    ).toBeDefined();
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
    const codigo = sinComentarios(leer('src/core/state/game.ts')).split('\n');
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
      const codigo = sinComentarios(leer(ruta));
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
      const codigo = sinComentarios(leer(ruta));
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

  it('la escena de la base no cambia el estado: `render/base/` solo importa tipos del núcleo', () => {
    // La base caminable es estado del cliente; las reglas van por los botones a
    // la sesión. Un `import` de valor de `@core` en `render/base/` sería una
    // puerta lateral al núcleo que el guardia de `session.ts` no ve, porque
    // solo mira las funciones que mutan.
    const base = CLIENTE.filter((r) => r.startsWith('src/client/render/base/'));
    expect(base.length).toBeGreaterThan(0);
    const colados: string[] = [];
    for (const ruta of base) {
      const codigo = sinComentarios(leer(ruta));
      for (const m of codigo.matchAll(/\bimport(?!\s+type\b)\s*([^;]*?)['"]@core\/[^'"]+['"]/gs)) {
        colados.push(`${ruta} → ${m[0].replace(/\s+/g, ' ')}`);
      }
      for (const m of codigo.matchAll(/\bimport\s*\(\s*['"]@core\//g)) {
        colados.push(`${ruta} → ${m[0]}`);
      }
    }
    expect(colados).toEqual([]);
  });

  it('la base no copia la escala del combate: la toma de `escalaDelCombate`', () => {
    // Un adulto mide lo mismo en la base que en una batalla porque el paso sale
    // de una sola cuenta (`pasoDeLaBase` → `escalaDelCombate`). Las constantes
    // del tablero son privadas de `proyeccion.ts`; si la escena de la base las
    // nombrara o fijara su propio alto de figura, la escala sería una copia que
    // un día deja de casar (vuelta 2 del ciclo de la base).
    const base = CLIENTE.filter(
      (r) => r.startsWith('src/client/render/base/') || r === 'src/client/escenas/castillo.ts',
    );
    expect(base.length).toBeGreaterThan(5);
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
