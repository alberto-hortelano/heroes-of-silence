/**
 * Las fronteras de `CLAUDE.md`, comprobadas.
 *
 * Un contrato que solo vive en la documentación se rompe sin que nadie se
 * entere; aquí se rompe en rojo. Son nueve guardias: seis leen el código con
 * una expresión regular, uno recorre el catálogo de rasgos, el de efectos
 * temporales llama de verdad a los lectores del motor y el noveno recorre todo
 * el repo —menos la prosa y los binarios— buscando la ruta de esta máquina.
 * Cuestan milisegundos, así que caben en cada `pnpm test` sin frenar a nadie.
 *
 * Los nueve nacen en verde. Un guardia que nace rojo se ignora desde el primer
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
 * barras escapadas), que es lo que invirtió la lista.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stackSpeed } from '../src/core/battle/battle.js';
import { effectiveAttack } from '../src/core/battle/damage.js';
import {
  applyEffect,
  EFFECT_KINDS,
  type EffectKind,
  effectiveLuck,
} from '../src/core/battle/effects.js';
import type { BattleStack } from '../src/core/battle/types.js';
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

  it('FAL_KEY no llega al navegador', () => {
    // El arte se genera en scripts de línea de órdenes; el cliente solo carga
    // PNGs. Una clave de pago en el bundle es un incidente, no un despiste.
    expect(infractores(CLIENTE, /FAL_KEY|process\.env/)).toEqual([]);
  });
});
