/**
 * Las capas: `core` es puro (sin `node:`, sin DOM, sin conocer al servidor), sin
 * azar suelto ni coma flotante de la plataforma y sin ciclos de importación en
 * ejecución (ni donde se mide el nivel) ni de tipos entre dos carpetas; las herramientas de desarrollo no llegan
 * al build, el cliente no lee el entorno, ningún fichero que lee una máquina lleva
 * la ruta de esta, y las rutas que se escriben en cadenas (las que `tsc` no ve)
 * existen.
 *
 * Los guardias de las fronteras de `CLAUDE.md` vivían en un solo
 * `invariantes.test.ts`; desde la fase T de la reorganización (06-11-2026) van en
 * cinco por frontera —capas, batalla, partida, datos y cliente—, para que tocar un
 * área corra los suyos. Cómo se leen el código y las rutas, y lo que se aprendió
 * escribiéndolos, en `codigo-del-repo.ts`. Cada guardia nace en verde y se ha
 * visto morder.
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  CLIENTE,
  CORE,
  codigoDe,
  existeLaRuta,
  ficheros,
  HERRAMIENTAS,
  importacionesConLineaDe,
  importacionesDe,
  importaDe,
  infractores,
  infractoresDeCodigo,
  leer,
  lineaDe,
  ruta,
  rutasDelRepo,
  rutasEscritasEn,
  SERVIDOR,
} from './codigo-del-repo.js';
import { RAIZ } from './comun.js';

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

function ficherosDeMaquina(): string[] {
  return rutasDelRepo().filter(
    (f) => !CLASES_QUE_LEE_UNA_PERSONA.includes(extname(f).toLowerCase()) && esTextoDeMaquina(f),
  );
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

/** Una importación de un fichero: a qué fichero y en qué línea empieza. */
type Arista = { readonly ruta: string; readonly linea: number };

/**
 * Los ciclos de `aristas` que cruzan dos carpetas o más (la de cada fichero,
 * `dirname`: la raíz de `core` cuenta como una carpeta, y una subcarpeta, como
 * otra). Uno por componente fuerte (Tarjan) con ficheros de dos carpetas: el
 * más corto que pasa por la primera de sus importaciones que cruza carpeta (por
 * fichero y línea), escrito como los de arriba, `fichero:línea → … → fichero`,
 * cada línea la del `import` que lleva al siguiente.
 */
function nudosEntreCarpetas(aristas: ReadonlyMap<string, readonly Arista[]>): string[] {
  let siguiente = 0;
  const indice = new Map<string, number>();
  const bajo = new Map<string, number>();
  const pila: string[] = [];
  const enLaPila = new Set<string>();
  const componentes: string[][] = [];
  const fuerte = (v: string): void => {
    indice.set(v, siguiente);
    bajo.set(v, siguiente);
    siguiente++;
    pila.push(v);
    enLaPila.add(v);
    for (const { ruta: w } of aristas.get(v) ?? []) {
      if (!aristas.has(w)) continue;
      if (!indice.has(w)) {
        fuerte(w);
        bajo.set(v, Math.min(bajo.get(v) as number, bajo.get(w) as number));
      } else if (enLaPila.has(w)) {
        bajo.set(v, Math.min(bajo.get(v) as number, indice.get(w) as number));
      }
    }
    if (bajo.get(v) !== indice.get(v)) return;
    const componente: string[] = [];
    let w: string;
    do {
      w = pila.pop() as string;
      enLaPila.delete(w);
      componente.push(w);
    } while (w !== v);
    componentes.push(componente);
  };
  for (const v of aristas.keys()) if (!indice.has(v)) fuerte(v);
  const nudos: string[] = [];
  for (const componente of componentes) {
    const dentro = new Set(componente);
    if (new Set(componente.map((r) => dirname(r))).size < 2) continue;
    const cruces = [...componente]
      .sort()
      .flatMap((de) =>
        (aristas.get(de) ?? [])
          .filter((a) => dentro.has(a.ruta) && dirname(a.ruta) !== dirname(de))
          .map((a) => ({ de, ...a })),
      );
    const cruce = cruces[0];
    if (cruce === undefined) continue;
    // Del destino del cruce a su origen, sin salir de la componente.
    const previo = new Map<string, Arista & { readonly de: string }>();
    const cola = [cruce.ruta];
    const visto = new Set(cola);
    while (cola.length > 0 && !visto.has(cruce.de)) {
      const x = cola.shift() as string;
      for (const a of aristas.get(x) ?? []) {
        if (!dentro.has(a.ruta) || visto.has(a.ruta)) continue;
        visto.add(a.ruta);
        previo.set(a.ruta, { de: x, ...a });
        cola.push(a.ruta);
      }
    }
    const pasos: string[] = [];
    for (let x = cruce.de; x !== cruce.ruta; ) {
      const p = previo.get(x) as Arista & { readonly de: string };
      pasos.unshift(`${p.de}:${p.linea}`);
      x = p.de;
    }
    nudos.push([`${cruce.de}:${cruce.linea}`, ...pasos, cruce.de].join(' → '));
  }
  return nudos;
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
    // son Fibonacci, en `hero/rango.ts`, y solo suman y multiplican
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

  it('`nivel.ts` no está en un ciclo de importación: lo que mide lo lee de módulos que no lo importan', () => {
    // El nivel mide con las lecturas del combate (con qué arma pega, cuánto le
    // para la armadura) y el combate lee el nivel para la experiencia (`herir`).
    // Con esas lecturas en `damage.ts` y `rueda.ts`, `nivel.ts` → `damage.ts` →
    // `nivel.ts` funcionaba solo porque lo que corre al cargar usa declaraciones
    // de función: una constante leída al cargarse daba un `ReferenceError` (TDZ).
    // Ahora viven en `battle/armas.ts`, que no importa nada que importe el nivel
    // (simplify de F1, 18-10-2026). Solo cuenta lo que corre: `import type` no.
    // Roto a mano: `golpeDe` importado de `./battle/damage.js` en `nivel.ts` sale
    // rojo con el ciclo entero; y en su sitio de hoy, `unidad/nivel.ts` (`core/nivel.ts`
    // hasta la fase N de la reorganización, 07-11-2026), de `../battle/damage.js`.
    const INICIO = ruta('src/core/unidad/nivel.ts');
    // El resolutor de los guardias, el de `arranque.test.ts` (fase T, 06-11-2026).
    const importa = importacionesDe;
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
    expect(importa(INICIO)).toContain(ruta('src/core/battle/armas.ts'));
  });

  it('`core` no tiene ciclos de importación en ejecución, ni de tipos que crucen dos carpetas', () => {
    // Un ciclo de lo que corre al cargar (`import` de valor, `export … from`,
    // `import 'x'`) funciona solo mientras lo que se ejecuta al cargarse no lea
    // del otro lado: una constante leída al cargarse da un `ReferenceError` (TDZ)
    // según quién se cargue antes, y `tsc` no lo ve. `import type` no cuenta (se
    // borra al compilar) ni `import()` (va a demanda); `import { type X }` sí,
    // porque con `verbatimModuleSyntax` queda como `import {}` y carga el módulo.
    // Había dos (fase N de la reorganización, 07-11-2026): `map/rio.ts` ↔
    // `map/vestir.ts` (por `parejaDe`, hoy en `map/geometria.ts`) y
    // `mundo/reglas.ts` ↔ `state/game.ts` (por `playerById` y `turnBlocker`, hoy
    // en `state/consultas.ts`). Rotos a mano: `import { parejaDe } from
    // './vestir.js'` en `rio.ts` y `import { mundoDe } from '../mundo/reglas.js'`
    // en `state/consultas.ts` salen rojos con el ciclo entero, cada paso con la
    // línea de su `import`.
    const aristas = new Map<string, { ruta: string; linea: number }[]>(
      CORE.map((r) => [
        r,
        importacionesConLineaDe(r).filter(
          (x) => x.ruta.startsWith('src/core/') && x.ruta.endsWith('.ts'),
        ),
      ]),
    );
    // Un ciclo por fichero que vuelve a sí mismo, girado para empezar por el
    // menor: cada ciclo sale una vez, con todos sus pasos (`fichero:línea` del
    // `import` que lleva al siguiente).
    const ciclos = new Set<string>();
    for (const inicio of CORE) {
      const visto = new Set<string>();
      type Paso = { readonly ruta: string; readonly linea: number };
      const buscar = (desde: string, camino: readonly Paso[]): readonly Paso[] | null => {
        for (const { ruta: siguiente, linea } of aristas.get(desde) ?? []) {
          const conLinea = [...camino.slice(0, -1), { ruta: desde, linea }];
          if (siguiente === inicio) return conLinea;
          if (visto.has(siguiente)) continue;
          visto.add(siguiente);
          const hallado = buscar(siguiente, [...conLinea, { ruta: siguiente, linea: 0 }]);
          if (hallado !== null) return hallado;
        }
        return null;
      };
      const hallado = buscar(inicio, [{ ruta: inicio, linea: 0 }]);
      if (hallado === null) continue;
      const rutas = hallado.map((p) => p.ruta);
      const menor = rutas.indexOf([...rutas].sort()[0] as string);
      const girado = [...hallado.slice(menor), ...hallado.slice(0, menor)];
      ciclos.add(
        [...girado.map((p) => `${p.ruta}:${p.linea}`), (girado[0] as Paso).ruta].join(' → '),
      );
    }
    expect([...ciclos]).toEqual([]);
    // Y que mire algo: las dos importaciones que quedan de aquellos ciclos, en un
    // solo sentido, las ve el resolutor (la del vestido, desde que se repartió por
    // `map/vestir/`, la hace el engorde, `fronteras.ts`).
    const importa = (de: string): string[] => (aristas.get(de) ?? []).map((x) => x.ruta);
    expect(importa(ruta('src/core/map/vestir/fronteras.ts'))).toContain(
      ruta('src/core/map/rio.ts'),
    );
    expect(importa(ruta('src/core/state/game.ts'))).toContain(ruta('src/core/mundo/reglas.ts'));

    // **Ni de tipos que crucen dos carpetas** (paso N8 de la misma fase). Un
    // `import type` no carga nada, pero un ciclo que pasa por él ata dos dominios:
    // no se lee ni se mueve el uno sin el otro, y en cuanto una de sus importaciones
    // pasa a ser de valor (un tipo que gana una constante al lado), es un ciclo en
    // ejecución. Dentro de una carpeta los tipos sí pueden citarse; la raíz de
    // `core` es una carpeta más. Había cuatro, cada uno con su corte: `battle/` y
    // `unidad/` (la forma de la batalla nombraba la rueda, que importa el daño, que
    // lee el nivel, que lee las armas, que nombran la forma de la batalla: hoy esa
    // forma vive en `battle/types.ts` y solo nombra las hojas de la rueda);
    // `equipo/`, `unidad/` y `hero/` (por el tipo `Hero`, hoy en `types.ts`);
    // `state/` y `mundo/` (por el clima de una batalla, hoy junto a `lugarDelRival`
    // en `state/game.ts`); y dentro de `map/`, el del recinto (`map/tipos.ts`,
    // `map/red-de-caminos.ts`). Rotos a mano: un `import type { BattleStack }` de
    // `battle/types.ts` en `hero/rango.ts` y un `import type { Hero }` de
    // `hero/hero.ts` en `equipo/portador.ts` (el nudo de antes) salen rojos con su
    // ciclo, y un `import type` de `battle/effects.ts` en `battle/types.ts` (dentro
    // de `battle/`) no sale.
    const conTipos = new Map<string, Arista[]>(
      CORE.map((r) => [
        r,
        importacionesConLineaDe(r, true).filter(
          (x) => x.ruta.startsWith('src/core/') && x.ruta.endsWith('.ts'),
        ),
      ]),
    );
    expect(nudosEntreCarpetas(conTipos)).toEqual([]);
    // Y que vea los tipos: `battle/types.ts` nombra `magia/formato.ts` solo con
    // `import type`, que el grafo de arriba no tiene.
    const nombra = (de: string): string[] => (conTipos.get(de) ?? []).map((x) => x.ruta);
    expect(nombra(ruta('src/core/battle/types.ts'))).toContain(ruta('src/core/magia/formato.ts'));
    expect(importa(ruta('src/core/battle/types.ts'))).not.toContain(
      ruta('src/core/magia/formato.ts'),
    );
  });

  it('las capas de `core`: la IA y el contrato solo los importan ellos mismos, y el mapa no conoce la partida', () => {
    // La IA de reglas lee y propone: si una regla de la partida la importara, un
    // cambio de cómo decide la IA cambiaría el juego. Y el mapa (su forma, su red,
    // el generador) va debajo de la partida, del mundo y del contrato: el mapa de
    // una semilla no puede depender de cómo se juega. Mira toda importación, también
    // las de solo tipos (una capa no nombra a la de arriba ni para un tipo); `import()`
    // no se mira. Hasta la fase N de la reorganización (07-11-2026) los dos se
    // saltaban: la partida importaba la IA para `resolvePendingBattle` (hoy en
    // `ai/turn.ts`) y la fuerza (`hero/fuerza.ts`), y el generador importaba los
    // asaltantes y los sitios de la partida (lo que usaba, hoy en `types.ts`,
    // `hero/grupos.ts` y `map/regiones.ts`). Rotos a mano: `import { autoResolve }
    // from '../ai/tactics.js'` en `state/game.ts` e `import type { GameState } from
    // '../state/tipos.js'` en `map/generate.ts` salen rojos con su línea.
    //
    // Y el contrato del agente (`contract/`) es una traducción para el agente: si
    // una regla lo importara, cambiar lo que se le dice cambiaría el juego. La línea
    // legible, que juzgan también las voces, el banco de NPC y un mundo, salió a
    // `core/linea.ts` (fase N, 07-11-2026). Roto a mano: `import { SLOTS } from
    // '../contract/vocabulario.js'` en `gente/banco.ts` sale rojo con su línea.
    //
    // Y dentro del mapa, una sola dirección (paso N9 de la misma fase): la forma y la
    // red del mapa (`map/`) no saben cómo se viste ni cómo se genera, y el vestido
    // (`map/vestir/`) no sabe del generador (`map/generar/`), que usa los dos. Eran
    // `vestir.ts` y `generate.ts`, y el vestido leía la tabla de sus barreras de
    // `generar/datos.ts` (hoy en `vestir/base.ts`): sin ciclo, pero las carpetas iban y
    // volvían, y eso el guardia de ciclos no lo ve. Rotos a mano: un `import type` de
    // `generar/plan.js` en `vestir/caminos.ts` y uno de `vestir/base.js` en
    // `map/regiones.ts` salen rojos con su línea.
    const AI = `${ruta('src/core/ai')}/`;
    const CONTRATO = `${ruta('src/core/contract')}/`;
    const MAPA = `${ruta('src/core/map')}/`;
    const VESTIDO = `${ruta('src/core/map/vestir')}/`;
    const GENERADOR = `${ruta('src/core/map/generar')}/`;
    const SOBRE_EL_MAPA = [
      ruta('src/core/state'),
      ruta('src/core/mundo'),
      ruta('src/core/ai'),
      ruta('src/core/contract'),
    ].map((c) => `${c}/`);
    const capas: readonly (readonly [string, (de: string, a: string) => boolean])[] = [
      ['fuera de `ai/`, nadie importa `ai/`', (de, a) => !de.startsWith(AI) && a.startsWith(AI)],
      [
        'fuera de `contract/`, nadie importa `contract/`',
        (de, a) => !de.startsWith(CONTRATO) && a.startsWith(CONTRATO),
      ],
      [
        '`map/` no importa `state/`, `mundo/`, `ai/` ni `contract/`',
        (de, a) => de.startsWith(MAPA) && SOBRE_EL_MAPA.some((c) => a.startsWith(c)),
      ],
      [
        'dentro del mapa, `map/` ← `map/vestir/` ← `map/generar/`',
        (de, a) =>
          (de.startsWith(MAPA) &&
            !de.startsWith(VESTIDO) &&
            !de.startsWith(GENERADOR) &&
            (a.startsWith(VESTIDO) || a.startsWith(GENERADOR))) ||
          (de.startsWith(VESTIDO) && a.startsWith(GENERADOR)),
      ],
    ];
    const colados: string[] = [];
    let miradas = 0;
    for (const de of CORE) {
      for (const { ruta: a, linea } of importacionesConLineaDe(de, true)) {
        miradas++;
        for (const [capa, rompe] of capas) {
          if (rompe(de, a)) colados.push(`[${capa}] ${de}:${linea} → ${a}`);
        }
      }
    }
    expect(colados).toEqual([]);
    // Y que mire algo, también las de solo tipos: `ai/turn.ts` importa la forma de la
    // partida con `import type`.
    expect(miradas).toBeGreaterThan(500);
    expect(importacionesConLineaDe(ruta('src/core/ai/turn.ts'), true).map((x) => x.ruta)).toContain(
      ruta('src/core/state/tipos.ts'),
    );
    // Y las de una subcarpeta a otra: el generador viste con el vestido.
    expect(
      importacionesConLineaDe(ruta('src/core/map/generar/vestir-la-red.ts'), true).map(
        (x) => x.ruta,
      ),
    ).toContain(ruta('src/core/map/vestir/base.ts'));
  });

  it('`core` no reexporta: cada importador pide el nombre al módulo que lo declara', () => {
    // Una fachada es un segundo sitio donde está un nombre: quien lee el importador
    // cree que vive allí, y un guardia que mira quién importa algo de un módulo no
    // ve a quien lo trae por la fachada. Hasta el paso N13 de la reorganización
    // (07-11-2026) reexportaban `battle/rueda.ts` (las formas, las cifras y los tipos
    // de la rueda), `cifras-de-la-rueda.ts` (`NOMBRE_DE_GOLPE`), `spells.ts`
    // (`Hechizo`) y `battle.ts` (`MAX_ROUNDS`), y 63 importaciones pasaban por ellas.
    // Con el parser de TypeScript: `export … from` (también `export *`, `export type`
    // y el que va en varias líneas); `export { x }` o `export default x` de un nombre
    // importado; y `export const X = x` o `export type X = x` de un importado que se
    // llamaba `X` en su módulo, que es como volvería una fachada sin `export {`. Con
    // otro nombre es un nombre nuevo (`APOYOS_DE_MURALLA = BARRERAS_DE_DESNIVEL`), y
    // un `export { x }` de lo propio, también vale. Que mire algo lo dice la sonda de
    // abajo, con cada forma escrita: vista morder también en `battle.ts` y `spells.ts`
    // (`export { hexKey } from './board.js'`, en una y en tres líneas, `export *`, un
    // `export { MAX_ROUNDS }` y un `export type { Hechizo }` de vuelta).
    const reexportacionesDe = (sf: ts.SourceFile): string[] => {
      // Lo importado: su nombre en el fichero y el que tiene en su módulo.
      const importados = new Map<string, string>();
      for (const s of sf.statements) {
        if (!ts.isImportDeclaration(s) || s.importClause === undefined) continue;
        const { name, namedBindings } = s.importClause;
        if (name !== undefined) importados.set(name.text, 'default');
        if (namedBindings === undefined) continue;
        if (ts.isNamespaceImport(namedBindings)) importados.set(namedBindings.name.text, '*');
        else
          for (const e of namedBindings.elements)
            importados.set(e.name.text, (e.propertyName ?? e.name).text);
      }
      /** Si `n` es un nombre importado (y, con `comoSeLlamaba`, si se llamaba así). */
      const importado = (n: ts.Node | undefined, comoSeLlamaba?: string): boolean =>
        n !== undefined &&
        ts.isIdentifier(n) &&
        importados.has(n.text) &&
        (comoSeLlamaba === undefined || importados.get(n.text) === comoSeLlamaba);
      const exportado = (s: ts.Statement): boolean =>
        ts.canHaveModifiers(s) &&
        (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const out: string[] = [];
      for (const s of sf.statements) {
        let reexporta = false;
        if (ts.isExportDeclaration(s)) {
          reexporta =
            s.moduleSpecifier !== undefined ||
            (s.exportClause !== undefined &&
              ts.isNamedExports(s.exportClause) &&
              s.exportClause.elements.some((e) => importados.has((e.propertyName ?? e.name).text)));
        } else if (ts.isExportAssignment(s)) {
          reexporta = importado(s.expression);
        } else if (ts.isVariableStatement(s) && exportado(s)) {
          reexporta = s.declarationList.declarations.some(
            (d) => ts.isIdentifier(d.name) && importado(d.initializer, d.name.text),
          );
        } else if (ts.isTypeAliasDeclaration(s) && exportado(s)) {
          reexporta =
            ts.isTypeReferenceNode(s.type) &&
            s.type.typeArguments === undefined &&
            importado(s.type.typeName, s.name.text);
        }
        if (!reexporta) continue;
        const linea = sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1;
        out.push(`${sf.fileName}:${linea} → ${s.getText(sf).replace(/\s+/g, ' ')}`);
      }
      return out;
    };
    const reexportan = CORE.flatMap((r) =>
      reexportacionesDe(ts.createSourceFile(r, leer(r), ts.ScriptTarget.Latest, true)),
    );
    expect(reexportan).toEqual([]);
    // Y que mire algo: todo `core`, y cada forma, sobre una sonda escrita aquí (lo que
    // vale, al final, no sale).
    expect(CORE.length).toBeGreaterThan(100);
    const sonda = [
      "import { a, b as c, d } from './x.js';",
      "import type { T as U } from './x.js';",
      "import e from './e.js';",
      'export { a };',
      "export { hexKey } from './board.js';",
      "export {\n  hexKey,\n} from './board.js';",
      "export * from './board.js';",
      "export type { V } from './x.js';",
      'export default e;',
      'export const b = c;',
      'export type T = U;',
      'const propio = 1;',
      'export { propio };',
      'export const OTRO = d;',
    ].join('\n');
    expect(
      reexportacionesDe(ts.createSourceFile('sonda.ts', sonda, ts.ScriptTarget.Latest, true)).map(
        (x) => x.split(' → ')[0],
      ),
    ).toEqual([4, 5, 6, 9, 10, 11, 12, 13].map((n) => `sonda.ts:${n}`));
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

  it('las herramientas de desarrollo solo entran por `import()` tras `HERRAMIENTAS_DE_DESARROLLO`', () => {
    // `src/client/desarrollo/` no llega a `vite build`: solo `import type` o un
    // `import()` dentro de `if (HERRAMIENTAS_DE_DESARROLLO)`. `sinDesarrollo` lo
    // caza al construir; esto, en cada `pnpm test`, con fichero y línea.
    const fuera = CLIENTE.filter((r) => !r.startsWith(ruta('src/client/desarrollo/')));
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
    for (const fichero of CORE.filter((r) => r.startsWith(ruta('src/core/contract/')))) {
      const codigo = codigoDe(fichero);
      for (const m of codigo.matchAll(
        /export function (serialize\w*)\(([^{]*?)\)\s*(:\s*[^{]+)?\{/g,
      )) {
        serializadores++;
        if (/^:\s*unknown\s*$/.test(m[3] ?? ''))
          tapados.push(`${fichero}:${lineaDe(codigo, m.index)} → ${m[1]}`);
      }
    }
    expect(tapados).toEqual([]);
    // Y que mire algo: sin esto, un patrón que no casara nada pasaría por vacío.
    expect(serializadores).toBeGreaterThanOrEqual(5);
    // El síntoma, en el servidor: un `as object` es un tipo del contrato tirado.
    expect(infractoresDeCodigo(SERVIDOR, /\bas object\b/)).toEqual([]);
  });

  it('el cliente no lee el entorno', () => {
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

  it('las rutas escritas en cadenas existen: las órdenes de `package.json` y `.mcp.json`, `vite.config.ts`, `src/` y `tools/`', () => {
    // Lo que `tsc` no ve (fase T de la reorganización, 06-11-2026): un fichero que
    // se lanza por su ruta (`tsx src/server/ws-server.ts`, el `spawn` del
    // servidor de `pnpm qa`, el trabajador que lanza `pnpm npcs`), el que carga
    // vite a demanda (`ssrLoadModule`, `import()`), el `"derivadoPor"` que el
    // taller escribe en el arte. Si la mudanza que lo mueve se olvida de la
    // cadena, la orden no arranca y nada se pone rojo hasta que alguien la lanza.
    //
    // En `src/` y `tools/` no se mira solo el argumento del `spawn`, sino toda
    // cadena que es una ruta del repo (`rutasEscritasEn`): lo que se lanza suele
    // ir en una constante (`VISION`, `JUEZ`) o en un parámetro (`entrada:` de
    // `arrancarServidor`), lejos de la llamada.
    //
    // Lo que no existe a propósito, con su motivo; una ruta nueva que no existe
    // no se añade aquí sin decir por qué.
    const NO_EXISTEN: Readonly<Record<string, string>> = {
      'tools/art/poses.ts → src/angles.mjs': 'relativa a sprite-forge (`FORGE`), otro repositorio',
      'tools/art/poses.ts → src/page.mjs': 'relativa a sprite-forge (`FORGE`), otro repositorio',
      'tools/art/poses.ts → src/render.mjs': 'relativa a sprite-forge (`FORGE`), otro repositorio',
      'tools/taller/mapa.ts → assets/mapa/cofre':
        'la salida de un encargo va sin extensión: el taller escribe `cofre.webp` y su procedencia',
      'tools/marcas/almacen.ts → docs/revision/marcas':
        'la bandeja de las marcas: ignorada por git, la crea la primera marca',
      'src/core/arena/murallas.ts → data/borradores/murallas.json':
        'el borrador de murallas de quien usa la arena: ignorado por git, lo crea «Guardar»',
    };
    const faltan: string[] = [];
    const vistas = new Set<string>();
    const mirar = (donde: string, r: string): void => {
      const clave = `${donde.split(':')[0]} → ${r}`;
      if (NO_EXISTEN[clave] !== undefined) {
        vistas.add(clave);
        return;
      }
      if (!existeLaRuta(r)) faltan.push(`${donde} → ${r}`);
    };
    // Las órdenes: cada palabra que es una ruta del repo.
    const enUnaOrden = (orden: string): string[] =>
      orden.split(/\s+/).filter((p) => /^(?:\.\/)?(?:src|tools|test|data|assets|docs)\//.test(p));
    const paquete = JSON.parse(leer(ruta('package.json'))) as { scripts: Record<string, string> };
    for (const [nombre, orden] of Object.entries(paquete.scripts))
      for (const r of enUnaOrden(orden)) mirar(`package.json:scripts.${nombre}`, r);
    const mcp = JSON.parse(leer(ruta('.mcp.json'))) as {
      mcpServers: Record<string, { command: string; args?: string[] }>;
    };
    for (const [nombre, s] of Object.entries(mcp.mcpServers))
      for (const r of enUnaOrden([s.command, ...(s.args ?? [])].join(' ')))
        mirar(`.mcp.json:mcpServers.${nombre}`, r);
    // El código: `vite.config.ts`, `src/` y `tools/`.
    let escritas = 0;
    for (const f of [ruta('vite.config.ts'), ...ficheros(ruta('src')), ...HERRAMIENTAS]) {
      for (const { ruta: r, linea } of rutasEscritasEn(f)) {
        escritas++;
        mirar(`${f}:${linea}`, r);
      }
    }
    expect(faltan).toEqual([]);
    // Y que mire algo, y que lo que se excusa siga escrito: una excusa sin su
    // cadena es una regla vieja que nadie quita.
    expect(escritas).toBeGreaterThan(100);
    expect(Object.keys(NO_EXISTEN).filter((k) => !vistas.has(k))).toEqual([]);
  });
});
