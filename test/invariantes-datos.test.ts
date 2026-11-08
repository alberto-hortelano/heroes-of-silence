/**
 * Los datos: cada `data/*.json` lo importa un solo módulo, que lo juzga al
 * cargar (unidades, equipo, sitios, clima, hechizos, infiltradores…), y todo
 * `data/*.json` lo lee alguien; el nivel y el coste no se escriben; el banco de
 * NPC tiene su puerta; lo retirado (caballeros, nigromantes, minas, el arte de
 * una dirección) no vuelve.
 *
 * Los guardias de las fronteras de `CLAUDE.md` vivían en un solo
 * `invariantes.test.ts`; desde la fase T de la reorganización (06-11-2026) van en
 * cinco por frontera —capas, batalla, partida, datos y cliente—, para que tocar un
 * área corra los suyos. Cómo se leen el código y las rutas, y lo que se aprendió
 * escribiéndolos, en `codigo-del-repo.ts`. Cada guardia nace en verde y se ha
 * visto morder.
 */

import { extname } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENTE,
  CORE,
  codigoDe,
  ficheros,
  HERRAMIENTAS,
  importacionesDe,
  importaDe,
  infractoresDeCodigo,
  leer,
  ruta,
  rutasDelRepo,
  rutasEscritasEn,
  SERVIDOR,
} from './codigo-del-repo.js';

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

describe('invariantes del proyecto', () => {
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

  it('el catálogo de equipo lo carga solo `equipo/pieza.ts`, y la arena lee cada pieza con el suyo', () => {
    // Una sola clase de piezas (F2 de 2026-10-18): el borrador de equipo de la
    // arena y `data/equipo.json` dejan de ser dos cosas; la arena edita el catálogo
    // en memoria y «Guardar» lo escribe en disco. Dos partes:
    //  (a) `data/equipo.json` lo importa solo `core/equipo/pieza.ts` (`leerEquipo`, que lo
    //      valida entero al cargar): quien lo importara por su cuenta se saltaría
    //      la validación. La arena lo escribe por su ruta, no importándolo. Y fuera
    //      de la arena nadie nombra los borradores que quedan (`data/borradores`,
    //      las murallas) ni `tools/arena/`.
    //  (b) la arena no importa las lecturas sueltas de las piezas (abajo): leen el
    //      catálogo tal como se cargó, y la arena pelea con el que edita.
    // Rotos a mano: un `import e from '../../data/equipo.json'` en `arena.ts` y un
    // `'data/borradores'` en `state/game.ts` salen rojos con su línea.
    // Hasta la fase N de la reorganización (07-11-2026) era `core/data.ts`, que
    // leía todas las tablas.
    const PUERTA = ruta('src/core/equipo/pieza.ts');
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
      r.startsWith(ruta('src/core/arena/')) || r.startsWith(ruta('src/client/arena/'));
    const veElBorrador = /data\/borradores|tools\/arena\//;
    const fuera = todos.filter((r) => !ARENA(r));
    expect(infractoresDeCodigo(fuera, veElBorrador)).toEqual([]);
    // Y que mire algo: el editor de la muralla, que escribe el borrador (era `arena/main.ts`
    // hasta R8 de la reorganización, 07-11-2026).
    expect(
      infractoresDeCodigo([ruta('src/client/arena/editor-de-muralla.ts')], veElBorrador),
    ).not.toEqual([]);

    // (b) La arena lee las piezas solo con su catálogo atado (`equipoCon`, que da
    // `catalogoDeLaArena`): no importa las lecturas sueltas de `core/equipo/`, que
    // leen siempre las del juego, ni `heroUnit`, que viste al héroe con ellas.
    // Por IMPORTACIÓN: sin la suelta a mano, no hay llamada que se olvide de su
    // catálogo. Roto a mano: `pieza` importada en `paneles.ts` sale rojo. Las sueltas
    // eran de `hero/equipo.ts` hasta la fase N de la reorganización (07-11-2026), hoy
    // repartido en `core/equipo/`: se mira cualquier fichero de la carpeta.
    const SUELTAS = new Set([
      'pieza',
      'piezaSiExiste',
      'piezasPuestas',
      'conEquipo',
      'manosBlocker',
      'equipoBlocker',
      'ponerPieza',
      'heroUnit',
    ]);
    const deEquipoOHeroe =
      /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]*\/equipo\/[^/'"]+\.js|[^'"]*\/hero\/hero\.js|\.\/hero\.js)['"]/g;
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
    // cifras (`core/unidad/nivel.ts`), **con el equipo puesto** desde el 18-10-2026 («el
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
    const catalogo = JSON.parse(leer(ruta('data/unidades.json'))) as {
      unidades: { id: string; [campo: string]: unknown }[];
    };
    expect(
      catalogo.unidades.filter((u) => 'level' in u || 'nivel' in u || 'cost' in u).map((u) => u.id),
    ).toEqual([]);
    const tipos = codigoDe(ruta('src/core/types.ts'));
    const unitInfo = /export interface UnitInfo \{[\s\S]*?\n\}/.exec(tipos)?.[0];
    if (unitInfo === undefined) throw new Error('no encuentro `interface UnitInfo` en types.ts');
    expect(unitInfo).not.toMatch(/\b(?:nivel|level)\??\s*:/);
    expect(infractoresDeCodigo([...CORE, ...CLIENTE, ...SERVIDOR], /\bsinEquipo\b/)).toEqual([]);
    // Y el índice y el nivel los calcula `unidad/nivel.ts` (`core/nivel.ts` hasta la
    // fase N de la reorganización, 07-11-2026), y nadie más.
    const calcula = /\bfunction\s+(?:indiceDePoder|nivelDeUnidad|nivelDelIndice|poderBruto)\b/;
    const otros = [...CORE, ...CLIENTE, ...SERVIDOR].filter(
      (r) => r !== ruta('src/core/unidad/nivel.ts'),
    );
    expect(infractoresDeCodigo(otros, calcula)).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/unidad/nivel.ts')], calcula)).not.toEqual([]);
    // Con sus pesos (`PODER.pesosDeLaRueda`), no los de la IA: retocar cómo elige
    // la IA no mueve índices (simplify de F1). Roto a mano: un
    // `PESOS_DE_LA_RUEDA.golpe` en `ofensaDelAtaque` sale rojo.
    expect(
      infractoresDeCodigo([ruta('src/core/unidad/nivel.ts')], /\bPESOS_DE_LA_RUEDA\b/),
    ).toEqual([]);
  });

  it('el catálogo de unidades lo importa solo `core/unidad/catalogo.ts`, que lo valida al cargar', () => {
    // F1 de 2026-10-18: `data/unidades.json` es la lista entera de las cinco
    // facciones. Quien lo importara por su cuenta se saltaría la validación de
    // `catalogo.ts` (una unidad rota tumba la carga diciendo cuál) o lo leería
    // con otras piezas. La arena lo lee y escribe en disco, por su ruta
    // (`RUTA_DEL_CATALOGO_DE_UNIDADES`), no importándolo: así lo abre aunque esté
    // roto. Roto a mano: un `import u from '../../data/unidades.json'` en
    // `arena.ts` sale rojo. Era `core/catalogo.ts` hasta la fase N de la
    // reorganización (07-11-2026).
    const PUERTA = ruta('src/core/unidad/catalogo.ts');
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

  it('el banco de figuras de NPC lo lee y lo escribe solo `tools/npcs/banco.ts`', () => {
    // El banco de NPC (22-10-2026): el núcleo es puro y recibe el banco como
    // parámetro, la página lo pide a `/__npcs` y las herramientas lo leen y lo
    // escriben por `banco.ts` (validado entero antes de escribir, de golpe). Quien
    // lo importara metería el banco en el grafo de la página (y una figura nueva la
    // recargaría a media partida); quien lo abriera por su ruta se saltaría la
    // escritura atómica. La ruta se escribe una vez, `RUTA_DEL_BANCO` en
    // `core/gente/banco.ts` (que la nombra en sus problemas y no la lee), y en las
    // herramientas solo la usa la puerta. Rotos a mano: un `import b from
    // '../../data/npcs.json'` en `session.ts`, un `readFileSync('data/npcs.json')` y
    // un `jsonDe(RAIZ, RUTA_DEL_BANCO)` en `cli.ts`, salen rojos.
    const PUERTA = ruta('tools/npcs/banco.ts');
    // Era `core/npcs.ts` hasta la fase N de la reorganización (07-11-2026).
    const NOMBRE = ruta('src/core/gente/banco.ts');
    const HERRAMIENTAS = ficheros(ruta('tools'));
    expect(
      infractoresDeCodigo(
        [...CORE, ...CLIENTE, ...SERVIDOR, ...HERRAMIENTAS],
        importaDe(/[^'"]*npcs\.json/),
      ),
    ).toEqual([]);
    // La ruta como literal entero (lo que se abre); dentro de una frase no es leerlo.
    const rutaEscrita = /['"`](?:\.\.\/)*(?:\.\/)?data\/npcs\.json['"`]/;
    expect(
      infractoresDeCodigo(
        [...CORE, ...SERVIDOR, ...CLIENTE, ...HERRAMIENTAS].filter((r) => r !== NOMBRE),
        rutaEscrita,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([NOMBRE], rutaEscrita)).not.toEqual([]);
    const usaLaRuta = /\bRUTA_DEL_BANCO\b/;
    // El plugin de vite del banco (`/__npcs`) la nombra para vigilarla, no la abre: la
    // importa y la vuelve absoluta para saber si lo que cambió es el banco
    // (`olvidaCon`), y nada más. Vivía en `vite.config.ts`, que este guardia no miraba,
    // hasta H2 de la reorganización (08-11-2026).
    const VIGIA = ruta('tools/vite/npcs.ts');
    expect(
      infractoresDeCodigo(
        [...SERVIDOR, ...CLIENTE, ...HERRAMIENTAS].filter((r) => r !== PUERTA && r !== VIGIA),
        usaLaRuta,
      ),
    ).toEqual([]);
    expect(
      infractoresDeCodigo([VIGIA], usaLaRuta)
        .map((x) => x.split(' → ')[1])
        .sort(),
    ).toEqual([
      'const fichero = resolve(raiz, RUTA_DEL_BANCO);',
      "import { CARPETA_DE_LAS_FIGURAS, RUTA_DEL_BANCO } from '../../src/core/gente/banco.js';",
    ]);
    expect(infractoresDeCodigo([PUERTA], usaLaRuta)).not.toEqual([]);
  });

  it('una figura de gente no llega a una batalla: la batalla, el animador, la rueda y la arena no la pintan', () => {
    // La gente del banco de NPC solo pinta estar de pie y andar (`ArteDeFigura.clips`):
    // `arteDe`, lo que leen la batalla y el animador, lanza con ella (lo prueba
    // `npcs.test.ts`), y la pinta solo quien la pinta de pie (`arteParaPintar`,
    // `colocarFigura`). Aquí, que ninguna pantalla de pelea la nombre siquiera. Roto
    // a mano: un `cuerpoDeGente` en `render/batalla/figura.ts` sale rojo. Desde la fase
    // C de la reorganización (07-11-2026) la pelea son carpetas enteras: `batalla/` (el
    // animador, la escena, la rueda, el despliegue, los poderes…) y `render/batalla/`
    // (el tablero, que hasta C3b era `render/batalla.ts` y se nombraba aparte); antes,
    // `anim.ts` y `rueda/`, y la escena y lo demás no se miraban.
    const PELEA = CLIENTE.filter(
      (r) =>
        r.startsWith(ruta('src/client/render/batalla/')) ||
        r.startsWith(ruta('src/client/batalla/')) ||
        r.startsWith(ruta('src/client/arena/')) ||
        r.startsWith(ruta('src/client/espectador/')),
    );
    expect(PELEA.length).toBeGreaterThan(5);
    expect(
      infractoresDeCodigo(
        PELEA,
        /\b(?:arteParaPintar|registrarGente|cuerpoDeGente|cuerpoDeLaPersona|ArteQueSePinta|AtlasQueSePinta)\b/,
      ),
    ).toEqual([]);
  });

  it('un mundo leído lo produce solo su lectura', () => {
    // Simplify de la F1a del mapa vivo (H2, 22-10-2026): `newGame` juega un
    // `MundoLeido` sin juzgarlo otra vez, y eso vale porque el tipo lleva una
    // marca que solo pone `leerMundo`, después de `problemasDelMundo`. Un
    // `as MundoLeido` en otro sitio colaría un mundo sin juzgar en una partida.
    // Roto a mano: un `as MundoLeido` en `client/mundo/cargar.ts` sale rojo.
    const LECTURA = ruta('src/core/mundo/validar.ts');
    const produceUno = /\bas\s+MundoLeido\b|<MundoLeido>/;
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros(ruta('tools'))];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== LECTURA),
        produceUno,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([LECTURA], produceUno)).not.toEqual([]);
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

  it('`data/sitios.json` lo importa solo `core/state/sitios.ts`, que lo juzga al cargar', () => {
    // Las murallas del mapa se leen en un sitio y se juzgan al cargar
    // (`leerSitios`, `murallaDelMapaBlocker`): quien importara el fichero
    // por su cuenta montaría una batalla con una forma sin juzgar, que podría no
    // cerrar o no asaltarse y acabar por `MAX_ROUNDS`. Roto a mano (04-11-2026): un
    // `import s from '../../../data/sitios.json'` en `state/game.ts` sale rojo.
    const PUERTA = ruta('src/core/state/sitios.ts');
    const importa = importaDe(/[^'"]*data\/sitios\.json/);
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        importa,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], importa)).not.toEqual([]);
  });

  it('`data/clima.json` lo importa solo `core/state/clima.ts`, que lo valida al cargar', () => {
    // Las cifras del clima (pesos, rachas, topes del narrador) se leen validadas
    // en un sitio (`validarClima`). Roto a mano: un `import c from
    // '../../data/clima.json'` en `render/clima/recetas.ts` sale rojo.
    const PUERTA = ruta('src/core/state/clima.ts');
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

  it('`data/hechizos.json` lo importa solo `core/magia/catalogo.ts`, que lo juzga al cargar', () => {
    // Los hechizos (el editor de magia, 06-11-2026) se leen y juzgan una vez
    // (`leerHechizos`): quien importara el fichero por su cuenta lanzaría un hechizo
    // sin juzgar. La arena escribe el fichero desde `tools/arena/` (no lo importa).
    // Roto a mano: un `import h from '../../../data/hechizos.json'` en
    // `battle/spells.ts` sale rojo.
    const PUERTA = ruta('src/core/magia/catalogo.ts');
    const importa = importaDe(/[^'"]*data\/hechizos\.json/);
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        importa,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], importa)).not.toEqual([]);
  });

  it('todo `data/*.json` lo lee alguien: un módulo lo importa o el código escribe su ruta', () => {
    // Un fichero de datos sin lector es una cifra que se edita y no cambia nada
    // (fase T de la reorganización, 06-11-2026: `data/spells.json` llevaba sin
    // lector desde 5d6f264b y se retiró en la fase 1). Lo lee alguien de `src/`,
    // `tools/` o `vite.config.ts` si lo importa (`importacionesDe`, como
    // `core/catalogo.ts` a `data/unidades.json`) o si escribe su ruta entera en
    // una cadena del código (`rutasEscritasEn`, como `RUTA_DEL_BANCO`, que abre
    // `tools/npcs/banco.ts`). Mencionarlo en un comentario o en una frase no es
    // leerlo. Mira lo que hay en el disco, indexado o no (`rutasDelRepo`): un
    // fichero nuevo sin `git add` es como nace la presa.
    //
    // Lo que no se lee a propósito, con su motivo (hoy, nada): un fichero que
    // documenta una entrada y no lo carga el código se añade aquí diciéndolo.
    const SIN_LECTOR_A_PROPOSITO: Readonly<Record<string, string>> = {};
    const datos = rutasDelRepo().filter((f) => /^data\/.*\.json$/.test(f));
    const leidos = new Set<string>();
    for (const f of [ruta('vite.config.ts'), ...ficheros(ruta('src')), ...HERRAMIENTAS]) {
      for (const m of importacionesDe(f)) leidos.add(m);
      for (const { ruta: r } of rutasEscritasEn(f)) leidos.add(r);
    }
    expect(datos.filter((f) => !leidos.has(f) && SIN_LECTOR_A_PROPOSITO[f] === undefined)).toEqual(
      [],
    );
    // Y que mire algo, y que lo excusado exista y siga sin lector.
    expect(datos.length).toBeGreaterThan(20);
    for (const f of Object.keys(SIN_LECTOR_A_PROPOSITO)) {
      expect(datos, f).toContain(f);
      expect(leidos.has(f), f).toBe(false);
    }
  });
});
