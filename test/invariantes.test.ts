/**
 * Las fronteras de `CLAUDE.md`, comprobadas.
 *
 * Un contrato que solo vive en la documentación se rompe sin que nadie se
 * entere; aquí se rompe en rojo. Son trece guardias: siete leen el código con
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
 * Los trece nacen en verde. Un guardia que nace rojo se ignora desde el primer
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
  effectiveLuck,
} from '../src/core/battle/effects.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import { CREATURE_TRAITS } from '../src/core/types.js';

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
  attack: (s) => effectiveAttack(s, null),
};

/** Un stack limpio, fuera de tablero: solo se le cuelgan efectos y se lee. */
function stackDePrueba(): BattleStack {
  return {
    id: 'guardia-0',
    side: 'attacker',
    slot: 0,
    creature: 'pikeman',
    initialCount: 10,
    count: 10,
    topHp: 1,
    hex: { col: 0, row: 0 },
    shotsLeft: 0,
    retaliated: false,
    defending: false,
    waited: false,
    acted: false,
    gotMoraleBonus: false,
    morale: 0,
    luck: 0,
    effects: [],
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
    // habría roto en silencio.
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

  it('el cliente no aplica reglas: la única puerta al núcleo es session.ts', () => {
    // El cliente pinta y manda intenciones. Cuando la partida se juegue por
    // WebSocket, lo que cambia es esa capa y solo esa — pero solo si nadie más
    // ha abierto una puerta lateral mientras tanto.
    const puertas =
      /\b(applyAdventureAction|applyAction|resolvePendingBattle|settleBattle|playAiTurn|chooseBattleAction|newGame)\b/;
    const fuera = CLIENTE.filter((r) => r !== 'src/client/session.ts');
    expect(infractores(fuera, puertas)).toEqual([]);
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
    // falta es que muerda, no que cuente.
    //
    // Se rompió a mano quitando el `if (state.finished === null)` de
    // `applyAdventureAction` y se miró rojo, con la semilla y el hecho colado
    // en el mensaje, antes de darlo por bueno.
    const colados: string[] = [];
    for (let semilla = 1; semilla <= 20; semilla++) {
      const state = newGame({ seed: semilla });
      await playAiGame(state, { rng: createRng(semilla) }, 300);
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
    // Mira `state.log` y NO `state` a propósito: `Player.fog` es un `Set` y
    // `Player.memory` un `Map`, así que sobre el estado entero este guardia
    // nacería rojo por algo que no es su asunto — y un guardia que nace rojo se
    // ignora desde el primer día.
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
    const state = newGame({ seed: 9, width: 48, height: 48 });
    await playAiGame(state, { rng: createRng(9) }, 60);
    expect(state.log.length).toBeGreaterThan(500);
    expect(new Set(state.log.map((e) => e.kind)).size).toBeGreaterThanOrEqual(16);
    expect(state.log.filter((e) => e.seen.length > 0).length).toBeGreaterThan(400);
    expect(JSON.parse(JSON.stringify(state.log))).toEqual(state.log);
  });

  it('FAL_KEY no llega al navegador', () => {
    // El arte se genera en scripts de línea de órdenes; el cliente solo carga
    // PNGs. Una clave de pago en el bundle es un incidente, no un despiste.
    expect(infractores(CLIENTE, /FAL_KEY|process\.env/)).toEqual([]);
  });
});
