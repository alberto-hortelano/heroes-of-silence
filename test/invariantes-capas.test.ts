/**
 * Las capas: `core` es puro (sin `node:`, sin DOM, sin conocer al servidor), sin
 * azar suelto ni coma flotante de la plataforma y sin ciclos donde se mide el
 * nivel; las herramientas de desarrollo no llegan al build, el cliente no lee el
 * entorno, ningún fichero que lee una máquina lleva la ruta de esta, y las rutas
 * que se escriben en cadenas (las que `tsc` no ve) existen.
 *
 * Los guardias de las fronteras de `CLAUDE.md` vivían en un solo
 * `invariantes.test.ts`; desde la fase T de la reorganización (06-11-2026) van en
 * cinco por frontera —capas, batalla, partida, datos y cliente—, para que tocar un
 * área corra los suyos. Cómo se leen el código y las rutas, y lo que se aprendió
 * escribiéndolos, en `codigo-del-repo.ts`. Cada guardia nace en verde y se ha
 * visto morder.
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENTE,
  CORE,
  codigoDe,
  existeLaRuta,
  ficheros,
  HERRAMIENTAS,
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
    const INICIO = ruta('src/core/nivel.ts');
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
      'src/core/arena-murallas.ts → data/borradores/murallas.json':
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
