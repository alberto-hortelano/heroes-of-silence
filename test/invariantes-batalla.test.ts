/**
 * La batalla: una puerta para montarla (`createBattle`) y el montador de la
 * arena con sus permisos; lo que escribe y lee solo el motor (el golpe plantado,
 * la Finta, el despliegue, la muerte, las armas por uso, la armadura, la
 * montura, las granadas); las cifras de un stack salen de su `unit`; la rueda con
 * su forma y su arma; la forma del tablero; los huecos del contrato.
 *
 * Los guardias de las fronteras de `CLAUDE.md` vivían en un solo
 * `invariantes.test.ts`; desde la fase T de la reorganización (06-11-2026) van en
 * cinco por frontera —capas, batalla, partida, datos y cliente—, para que tocar un
 * área corra los suyos. Cómo se leen el código y las rutas, y lo que se aprendió
 * escribiéndolos, en `codigo-del-repo.ts`. Cada guardia nace en verde y se ha
 * visto morder.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { armaduraEnLaPelea, trasLaArmadura } from '../src/core/battle/armas.js';
import { stackSpeed } from '../src/core/battle/consultas.js';
import { danioPorIndividuo, effectiveAttack, effectiveDefense } from '../src/core/battle/damage.js';
import { applyEffect, disparadoresDe, impedidoPor } from '../src/core/battle/effects.js';
import { formaDeLaBatalla } from '../src/core/battle/formas-de-la-rueda.js';
import type { BattleStack } from '../src/core/battle/types.js';
import { type CifraDeEfecto, EFFECT_KINDS, type StackEffect } from '../src/core/battle/types.js';
import { serializeBattleResponse } from '../src/core/contract/batalla.js';
import { battleActionSchema } from '../src/core/contract/esquemas.js';
import { RESPONSE_FORMAT } from '../src/core/contract/formato.js';
import { CATALOGO_DE_EQUIPO_EN_PROSA } from '../src/core/contract/vistas.js';
import {
  HIT_DE_GOLPE,
  hitsDeLaRueda,
  SLOT_DE_HUECO,
  SLOTS,
  type Slot,
} from '../src/core/contract/vocabulario.js';
import { CAMPOS_DE_PIEZA, EQUIPO } from '../src/core/equipo/pieza.js';
import { createRng } from '../src/core/rng.js';
import { CREATURE_TRAITS, HUECOS } from '../src/core/types.js';
import { UNIDADES, unidadDelJuego } from '../src/core/unidad/catalogo.js';
import { batallaConDos } from './batalla-de-prueba.js';
import {
  CLIENTE,
  CORE,
  codigoDe,
  ficheros,
  infractoresDeCodigo,
  leer,
  lineaDe,
  lineasDeImport,
  lineasDeLasDeclaraciones,
  llamadasA,
  ruta,
  SERVIDOR,
} from './codigo-del-repo.js';
import { RAIZ, TROPA } from './comun.js';

/**
 * Dónde se puede nombrar lo de la arena sin permiso, y todo lo que se mira. El
 * montador es la carpeta `core/arena/` (era `core/arena.ts` hasta la fase N de la
 * reorganización, 07-11-2026).
 */
const RUTAS_DE_LA_ARENA = {
  enTodoElFichero: (r: string): boolean =>
    r.startsWith(ruta('src/core/battle/')) ||
    r.startsWith(ruta('src/core/arena/')) ||
    r.startsWith(ruta('src/client/arena/')),
  todas: (): string[] => [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros(ruta('tools'))],
};

/**
 * Quién usa el montador de la arena (`core/arena/`) fuera de ella, y en qué
 * declaraciones: la sesión de la arena (la clase, no el resto de `session.ts`,
 * que es la partida), las pasadas de la arena de `pnpm capturas`, que juegan su
 * espejo, y la medida de la IA contra la IA en la arena (#259, #260, #262). Lo lee
 * el guardia de la puerta de las batallas.
 */
const PERMISOS_DE_LA_ARENA: Readonly<Record<string, readonly string[]>> = {
  [ruta('src/client/session.ts')]: ['SesionDeArena'],
  [ruta('tools/qa/capturas.ts')]: [
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
  // La IA contra la IA en la arena (#259, #260, #262): sus tandas y la pelea, también
  // la de las murallas del mapa, con los bandos de la arena (fase 2 del puesto fronterizo).
  // Las montan `tandas-de-la-arena.ts`, que comparten `arena-ia.ts` y la huella.
  [ruta('tools/qa/tandas-de-la-arena.ts')]: ['TANDAS', 'peleaSinJugar'],
};

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
 * Si el fichero importa del catálogo (`catalogo.js`), con su nombre y también como
 * tipo, alguno de `nombres`: la misma pregunta para el guardia de `creature` como
 * valor y para el de la arena sin el catálogo del juego.
 */
function importaCreature(codigo: string, nombres: readonly string[]): boolean {
  const alguno = nombres.join('|');
  return new RegExp(
    `import\\s*(?:type\\s*)?\\{[^}]*\\b(?:${alguno})\\b[^}]*\\}\\s*from\\s*['"][^'"]*\\/catalogo\\.js['"]`,
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
 * Cada tipo de efecto temporal con el lector del motor que suma su total.
 *
 * La tabla no es documentación: el test la recorre LLAMANDO a cada lector, así
 * que uno escrito y muerto no puede satisfacerla. Va tipada por `string` a
 * propósito y no por `EffectKind`: con `Record<EffectKind, …>` un tipo nuevo
 * rompería el `tsc` y el aserto de cobertura no llegaría a correr nunca.
 */
const LECTORES_DE_EFECTO: Readonly<
  Record<string, { readonly efecto: StackEffect; readonly lector: (s: BattleStack) => number }>
> = {
  speed: { efecto: cifra('speed'), lector: stackSpeed },
  attack: { efecto: cifra('attack'), lector: (s) => effectiveAttack(s) },
  // La rueda del golpe (Defensivo y Romper guardia).
  defense: { efecto: cifra('defense'), lector: (s) => effectiveDefense(s) },
  // Las del editor de magia (06-11-2026).
  armadura: { efecto: cifra('armadura'), lector: armaduraEnLaPelea },
  fuerza: { efecto: cifra('fuerza'), lector: (s) => danioPorIndividuo(s)[0] },
  agilidad: { efecto: cifra('agilidad'), lector: (s) => effectiveDefense(s) },
  impide: {
    efecto: { kind: 'impide', que: ['moverse'], source: 'guardia', roundsLeft: 2 },
    lector: (s) => (impedidoPor(s, 'moverse') === null ? 0 : 1),
  },
  escudo: {
    efecto: { kind: 'escudo', queda: 5, source: 'guardia', roundsLeft: 2 },
    lector: (s) => trasLaArmadura(10, s, true).danio,
  },
  disparador: {
    efecto: {
      kind: 'disparador',
      source: 'guardia',
      roundsLeft: 2,
      cargas: null,
      disparador: {
        cuando: 'alGolpear',
        yAlLanzarse: false,
        a: 'portador',
        radio: 0,
        afecta: 'todos',
        duracion: null,
        seAcabaSiMuere: null,
        efectos: [{ tipo: 'cura', cantidad: 1 }],
        poder: 0,
        lanzador: 'guardia-0',
        dicho: 'cura',
      },
    },
    lector: (s) => disparadoresDe(s, 'alGolpear').length,
  },
};

/** Un efecto de cifra de prueba. */
function cifra(kind: CifraDeEfecto): StackEffect {
  return { kind, amount: 2, source: 'guardia', roundsLeft: 2 };
}

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
    acted: false,
    morale: 0,
    effects: [],
    ganado: { experiencia: 0, bajas: 0, heroes: [] },
    apuntado: null,
    recargando: 0,
    granada: null,
    granadasLanzadas: 0,
    hechizoEnElAire: null,
  };
}

describe('invariantes del proyecto', () => {
  it('una puerta para montar batallas: `createBattle` (19-10-2026)', () => {
    // Un solo combate para el juego y la arena: la rueda, salir del contacto, la
    // carga a pie y la armadura siempre, sin interruptores. Toda batalla nace en
    // `createBattle`, la única que escribe un `BattleState` entero: el campo
    // `golpeEnCurso:` como clave de un objeto solo está ahí (y en la interfaz).
    // Quien montara otra batalla a mano —con otras reglas, o con un campo de más—
    // tendría que escribirlo. Roto a mano (19-10-2026): un `{ golpeEnCurso: null }`
    // en `state/game.ts` sale rojo con su línea. `createBattle` vive en
    // `battle/montaje.ts` desde la fase N de la reorganización (07-11-2026; antes, en
    // `battle.ts`): la sonda, en `state/batallas.ts`, y la misma clave en otra
    // función de `montaje.ts` salen rojas.
    const PERMITIDOS: Readonly<Record<string, readonly string[]>> = {
      [ruta('src/core/battle/montaje.ts')]: ['createBattle'],
    };
    const escribeElEstado = /(?:^\s*|[{,]\s*)golpeEnCurso\s*:/;
    const fuera: string[] = [];
    for (const fichero of RUTAS_DE_LA_ARENA.todas()) {
      if (fichero === ruta('src/core/battle/types.ts')) continue;
      const conPermiso = lineasDeLasDeclaraciones(fichero, PERMITIDOS[fichero] ?? []);
      for (const [i, linea] of codigoDe(fichero).split('\n').entries()) {
        if (conPermiso.has(i + 1)) continue;
        if (escribeElEstado.test(linea)) fuera.push(`${fichero}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(fuera).toEqual([]);

    // Y el montador de la arena (`core/arena/`: el montaje, la ficha, el retoque
    // y el enlace; un solo `core/arena.ts` hasta la fase N) es de la arena: solo la arena (página, disco y taller), la
    // sesión y `pnpm capturas` lo importan; y en la sesión y en `capturas.ts`, lo
    // importado de allí solo se usa dentro de sus declaraciones con permiso
    // (`PERMISOS_DE_LA_ARENA`). Sin excepciones en el núcleo (simplify de F1,
    // 18-10-2026): el formato de la unidad y del catálogo vive en `core/unidad.ts`.
    // Roto a mano (19-10-2026): un `import type` de `./arena.js` en
    // `core/catalogo.ts` y un `batallaDeArena` usado en `session.ts` fuera de
    // `SesionDeArena` salen rojos con su línea; con la carpeta (07-11-2026), un
    // `import { batallaDeArena } from './arena/montaje.js'` en `core/catalogo.ts`
    // también, y el `../arena/borrador.js` de `capturas.ts` no.
    const { enTodoElFichero } = RUTAS_DE_LA_ARENA;
    const porDeclaracion = PERMISOS_DE_LA_ARENA;
    // Si el especificador de `fichero` cae en `core/arena/`: resuelto (el alias
    // `@core/` o relativo a su carpeta), no con una expresión regular, que con la
    // carpeta casaría también `../arena/borrador.js` de `tools/qa/capturas.ts`.
    const ARENA = `${ruta('src/core/arena')}/`;
    const deLaArena = (espec: string, fichero: string): boolean => {
      const destino = espec.startsWith('@core/')
        ? join('src/core', espec.slice('@core/'.length))
        : espec.startsWith('.')
          ? join(dirname(fichero), espec)
          : null;
      return destino?.startsWith(ARENA) ?? false;
    };
    const puedeImportarla = (r: string): boolean =>
      enTodoElFichero(r) ||
      r.startsWith(ruta('tools/arena/')) ||
      r.startsWith(ruta('tools/taller/')) ||
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
        /^import\s+(type\s+)?\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/gm,
      )) {
        if (!deLaArena(bloque[3] as string, ruta)) continue;
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
          const espec = /\bfrom\s+['"]([^'"]+)['"]/.exec(linea)?.[1];
          if (espec !== undefined && deLaArena(espec, ruta) && !puedeImportarla(ruta))
            colados.push(`${ruta}:${i + 1} importa de core/arena/`);
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
    const conPermiso = lineasDeLasDeclaraciones(ruta('src/client/session.ts'), ['CruceDeLaRueda']);
    const fuera: string[] = [];
    for (const fichero of [...CLIENTE, ...SERVIDOR]) {
      if (fichero === ruta('src/server/director.ts')) continue;
      for (const [i, linea] of codigoDe(fichero).split('\n').entries()) {
        if (fichero === ruta('src/client/session.ts') && conPermiso.has(i + 1)) continue;
        if (llama.test(linea)) fuera.push(`${fichero}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(fuera).toEqual([]);
  });

  it('ningún rasgo de criatura está declarado y muerto', () => {
    // Un rasgo escrito en el tipo y en `data/unidades.json` que el motor no
    // lee es una promesa sin respaldo: el jugador paga por una caballería que
    // no carga y el agente decide con una ficha que miente. Este guardia nace
    // en verde justo después de implementar los cuatro que faltaban.
    const motor = CORE.filter((r) => r !== ruta('src/core/types.ts'))
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

    for (const [kind, { efecto, lector }] of Object.entries(LECTORES_DE_EFECTO)) {
      const s = stackDePrueba();
      const antes = lector(s);
      applyEffect(s, efecto);
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
    const INVERSA_DEL_CABLE = ruta('src/client/espectador/adaptar.ts');
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

  it('la forma de una batalla se lee en un sitio, y el cliente no fija ninguna salvo la ficha de un arma', () => {
    // Complejidad del combate (22-10-2026): cada batalla pelea con su rueda (7, 5 o
    // 3: `BattleState.rueda`). **Una lectura**: `formaDeLaBatalla`
    // (`formas-de-la-rueda.ts`); en el /simplify se buscaba a mano
    // (`RUEDAS[x.rueda]`) en ~17 sitios. Nadie fuera de ese módulo indexa `RUEDAS`,
    // ni con una variable ni con un número: la de 7 fija es `RUEDA_DE_REFERENCIA`.
    // Y en el cliente, un `TODOS_LOS_GOLPES` pintaría tipos de otra rueda y una
    // rueda fija, la de 7 en una pelea de 3: la única es la de la ficha de un arma
    // (`ruedaDeLaPieza`, en `disco.ts`), donde el arma tiene un nivel por tipo del
    // anillo. Rotos a mano (22-10-2026): un `RUEDAS[battle.rueda]` en
    // `director.ts`, un `RUEDA_DE_REFERENCIA` en `rueda/rueda.ts` y otro en
    // `anguloDe` de `disco.ts` salen rojos con su línea.
    const FORMAS = ruta('src/core/battle/formas-de-la-rueda.ts');
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros(ruta('tools'))];
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== FORMAS),
        /\bRUEDAS\s*\[/,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo(CLIENTE, /\bTODOS_LOS_GOLPES\b/)).toEqual([]);
    const FICHA = ruta('src/client/rueda/disco.ts');
    const fija = /\bRUEDA_DE_REFERENCIA\b/;
    expect(
      infractoresDeCodigo(
        CLIENTE.filter((r) => r !== FICHA),
        fija,
      ),
    ).toEqual([]);
    // En `disco.ts`, solo su importación y la ficha de un arma.
    const enLaFicha = lineasDeLasDeclaraciones(FICHA, ['ruedaDeLaPieza']);
    const fuera = codigoDe(FICHA)
      .split('\n')
      .flatMap((linea, i) =>
        fija.test(linea) && !enLaFicha.has(i + 1) && !/^\s*RUEDA_DE_REFERENCIA,\s*$/.test(linea)
          ? [`${FICHA}:${i + 1} → ${linea.trim()}`]
          : [],
      );
    expect(fuera).toEqual([]);
    expect(enLaFicha.size).toBeGreaterThan(0);
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
    // Los de las tres ruedas, en la prosa del turno (la de la respuesta remite a "wheel").
    for (const h of Object.values(HIT_DE_GOLPE)) {
      expect(RESPONSE_FORMAT.battle_turn).toContain(`"${h}"`);
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
      ...hitsDeLaRueda(formaDeLaBatalla(b)),
    ]);
  });

  it('el golpe plantado de la rueda lo escribe el motor y lo suelta solo la sesión', () => {
    // `BattleState.golpeEnCurso` dice quién está plantado ante quién y con qué carga
    // (primero se anda, luego la rueda; 13-10-2026). Lo pone y lo quita el motor
    // (`applyAction`, `soltarElGolpe`): otro que lo escribiera se saltaría la carga
    // medida antes de andar o dejaría un turno colgado. Y Escape lo suelta por la
    // sesión de la arena, nadie más. Roto a mano: un `this.battle.golpeEnCurso = null` en
    // `session.ts` y un `soltarElGolpe(` en `arena/main.ts` salen rojos con su línea.
    //
    // Fuera del motor lo escribe solo `createBattle`, que monta la batalla con el golpe
    // sin plantar: vive en `montaje.ts` desde la fase N de la reorganización
    // (07-11-2026; antes, en `battle.ts`, como el motor), y cualquier otra línea de
    // `montaje.ts` es ajena. Roto a mano (07-11-2026): un `{ golpeEnCurso: null }` en
    // `state/batallas.ts` y un `state.golpeEnCurso = null` en `libroConElCatalogo`
    // (`montaje.ts`) salen rojos con su línea.
    const PUERTA = ruta('src/core/battle/battle.ts');
    const MONTAJE = ruta('src/core/battle/montaje.ts');
    const alMontar = lineasDeLasDeclaraciones(MONTAJE, ['createBattle']);
    const enCreateBattle = (e: string): boolean => {
      const m = /^(.+):(\d+) → /.exec(e);
      return m !== null && m[1] === MONTAJE && alMontar.has(Number(m[2]));
    };
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const escribe = /\.golpeEnCurso\s*=(?!=)|\bgolpeEnCurso\s*:(?!\s*GolpeEnCurso\b)/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        escribe,
      ).filter((e) => !enCreateBattle(e)),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribe)).not.toEqual([]);
    // Y que mire algo en el montaje: la de `createBattle`, una.
    expect(infractoresDeCodigo([MONTAJE], escribe).filter(enCreateBattle)).toHaveLength(1);
    const suelta = /\bsoltarElGolpe\b/;
    const quienes = infractoresDeCodigo(todos, suelta).map((e) => e.split(':')[0]);
    expect([...new Set(quienes)].sort()).toEqual([ruta('src/client/session.ts'), PUERTA]);
  });

  it('el tramo de la Finta lo abre solo el golpe (`melee`, en battle.ts)', () => {
    // `TurnoDeUnidad.finta` (la rueda, #263, 14-10-2026) convierte el resto del turno
    // en un tramo solo de andar, con lo que le quede menos lo que resta su éxito.
    // Lo escribe solo el golpe con Finta: otro que lo pusiera dejaría a una unidad
    // sin poder golpear, o le quitaría casillas sin haber fintado. Roto a mano: un
    // `turno.finta = 2` en `session.ts` sale rojo con su línea.
    const PUERTA = ruta('src/core/battle/battle.ts');
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
    // (`core/unidad/formato.ts`, de sus habilidades): desde F3 (19-10-2026) también en el
    // juego, cuyo catálogo es el de la arena (el monje trae Curar).
    // Ni el catálogo en partida (`unidad/catalogo.ts`) ni la ficha del agente los
    // escriben aparte. Roto a mano: un `state.stacks[0] = s` en `battle.ts`, un
    // `fichasDeArena: {}` en `state/game.ts`, un `{ ...c, poderes }` en `data.ts` y
    // un `poderes: c.poderes` en `contract/serialize.ts` salen rojos con su línea.
    // El retoque (`arena/retoque.ts`) y el montaje (`arena/montaje.ts`), que eran
    // `core/arena.ts` hasta la fase N de la reorganización (07-11-2026).
    const PUERTA = ruta('src/core/arena/retoque.ts');
    const MONTAJE = ruta('src/core/arena/montaje.ts');
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter((r) => r !== PUERTA);
    const sustituyeUnStack = /\bstacks\[[^\]]+\]\s*=(?!=)/;
    expect(infractoresDeCodigo(fuera, sustituyeUnStack)).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], sustituyeUnStack)).not.toEqual([]);
    // Las fichas de la arena (`fichasDeArena`), con las que el retoque dice qué
    // cambió, también: las pone ella al montar y al retocar.
    const escribeTipos =
      /\bfichasDeArena\s*[:=](?!\s*readonly)|\.fichasDeArena\b(?:\s+as\b[^;]*)?\)?\[[^\]]+\]\s*=(?!=)/;
    const sinElTipo = fuera.filter((r) => r !== ruta('src/core/battle/types.ts') && r !== MONTAJE);
    expect(infractoresDeCodigo(sinElTipo, escribeTipos)).toEqual([]);
    expect(infractoresDeCodigo([MONTAJE], escribeTipos)).not.toEqual([]);
    expect(infractoresDeCodigo([PUERTA], escribeTipos)).not.toEqual([]);
    // Los poderes los pone `unidadDeCombate`, que vive con el formato de la unidad
    // (`core/unidad/formato.ts`, simplify de F1; `core/unidad.ts` hasta la fase N de
    // la reorganización, 07-11-2026).
    const PONE_PODERES = ruta('src/core/unidad/formato.ts');
    const escribePoderes = /\bpoderes\s*:(?!\s*readonly)|\{\s*poderes\s*\}|\.poderes\s*=(?!=)/;
    const ni = [...CORE, ...SERVIDOR].filter((r) => r !== PONE_PODERES);
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
    // en `battle.ts` salen rojos con su línea; desde la fase N de la reorganización
    // (07-11-2026), de `'../equipo/atado.js'`.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    expect(infractoresDeCodigo(todos, /\bpiezasDeArena\b|\bpiezasDeLaPelea\b/)).toEqual([]);
    const MOTOR = CORE.filter((r) => r.startsWith(ruta('src/core/battle/')));
    const leeUnCatalogo =
      /\b(?:EQUIPO_DEL_JUEGO|catalogoDeEquipo|equipoCon|PIEZAS_DEL_CATALOGO|CatalogoDeEquipo|EquipoAtado)\b/;
    expect(infractoresDeCodigo(MOTOR, leeUnCatalogo)).toEqual([]);
    const LA_ARENA = CORE.filter((r) => r.startsWith(ruta('src/core/arena/')));
    expect(infractoresDeCodigo(LA_ARENA, leeUnCatalogo)).not.toEqual([]);
  });

  it('los tiros de un disparo los cuenta solo `disparosDe`', () => {
    // Dos con el disparo doble, uno sin él: lo leen el disparo (`shoot`), su
    // previsión y la medida del nivel. Eran tres copias de `double_shot ? 2 : 1`
    // (simplify de F1, 18-10-2026). Roto a mano: la de `shoot` devuelta a
    // `battle.ts` sale roja.
    const PUERTA = ruta('src/core/battle/armas.ts');
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

  it('la defensa, el daño y las casillas de un cuerpo las saca de su fuerza, su agilidad y su peso solo `core/unidad/cuerpo.ts`', () => {
    // 25-10-2026, «aparecen las características fuerza y agilidad»: lo que resta el
    // peso (`restaDelPeso`) y las cifras derivadas (`cifrasDelCuerpo`) se declaran en
    // un sitio, y el escalón de velocidad de unas casillas (`escalonDeCasillas`) solo
    // lo pide él: si otro lo pidiera, unas casillas escritas a mano se saltarían el
    // peso. Roto a mano: un `escalonDeCasillas(` en `unidad.ts` sale rojo; desde la
    // fase N de la reorganización (07-11-2026), en `unidad/formato.ts`, junto a
    // `unidad/cuerpo.ts` (era `core/cuerpo.ts`).
    const CUERPO = ruta('src/core/unidad/cuerpo.ts');
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const declara = /\bfunction\s+(restaDelPeso|cifrasDelCuerpo|escalonDeCasillas)\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== CUERPO),
        declara,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([CUERPO], declara)).toHaveLength(3);
    const escalon = /\bescalonDeCasillas\(/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== CUERPO),
        escalon,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([CUERPO], escalon)).not.toEqual([]);
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
    // una `function manosBlocker` en `game.ts` salen rojos. La regla vive en
    // `equipo/manos.ts` (era `hero/equipo.ts` hasta la fase N de la reorganización,
    // 07-11-2026).
    const TRADUCCION = ruta('src/core/contract/vocabulario.ts');
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
    const MANOS = [ruta('src/core/equipo/manos.ts'), ruta('src/core/equipo/pieza.ts')];
    const leeManos = /\.manos\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !MANOS.includes(r)),
        leeManos,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/equipo/manos.ts')], leeManos)).not.toEqual([]);
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
    //  (a) `armas` lo escribe solo `conEquipo` (`equipo/vestir.ts`) y lo leen solo
    //      él, `battle/armas.ts` (`golpeDe`) y `battle/damage.ts` (`armasDe`): un golpe que leyera
    //      `unit.armas` por su cuenta elegiría el arma con otra regla.
    //  (b) el agente los ve todos: cinco `SLOTS`, uno por hueco, y su prosa dice
    //      para qué es el de disparar y el de la segunda arma (25-10-2026: la
    //      lanza dejó su hueco; es un arma más).
    // Rotos a mano: un `{ ...u, armas: {...} }` en `arena.ts`, un
    // `s.unit.armas?.distancia` en `paneles.ts` y un `SLOT_DE_HUECO` sin `carga`
    // salen rojos.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const ESCRITOR = ruta('src/core/equipo/vestir.ts');
    const LECTORES = [
      ESCRITOR,
      ruta('src/core/battle/armas.ts'),
      ruta('src/core/battle/damage.ts'),
    ];
    // Lo que escribe `armas` es la clave de un objeto (`{ …, armas: … }`, o `armas:` al
    // principio de su línea), no la palabra: desde el reparto de `hero/equipo.ts` (fase
    // N de la reorganización, 07-11-2026) la frase «con dos armas: no queda mano…» de
    // `equipo/manos.ts` ya no está en el fichero que escribe, y la palabra seguida de
    // dos puntos la cazaba. `conEquipo` las pone en la unidad con su clave abreviada
    // (`{ ...vestida, armas }`).
    const escribe = /(?:^\s*|[{,]\s*)armas\s*:/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== ESCRITOR),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ESCRITOR], /[{,]\s*armas\s*[:},]/)).not.toEqual([]);
    const lee = /\.armas\b(?!-)|(?<!\$)\{\s*armas\s*[},]/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LECTORES.includes(r)),
        lee,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/battle/armas.ts')], lee)).not.toEqual([]);

    expect(SLOTS).toHaveLength(HUECOS.length);
    expect(Object.keys(SLOT_DE_HUECO)).toEqual([...HUECOS]);
    expect(new Set(SLOTS).size).toBe(HUECOS.length);
    expect(RESPONSE_FORMAT.adventure_turn).toContain(`"${SLOT_DE_HUECO.distancia}" la que dispara`);
    expect(SLOTS).toContain('second_melee_weapon');
    expect(SLOTS).not.toContain('lance');
    expect(RESPONSE_FORMAT.adventure_turn).toContain(
      `"${SLOT_DE_HUECO.segunda}" una segunda (otra arma de`,
    );
    expect(CATALOGO_DE_EQUIPO_EN_PROSA).toMatch(/^ *daga \(melee_weapon\)/m);
  });

  it('si una pieza es una lanza lo leen solo `equipo/manos.ts` y `equipo/pieza.ts`, como sus manos', () => {
    // 25-10-2026, «la lanza de carga fuera, será una lanza y una regla especial de
    // la lanza cuando se carga montado»: `Pieza.lanza` lo valida y lo escribe
    // `equipo/pieza.ts` (`data.ts` hasta la fase N, 07-11-2026), y lo lee
    // `equipo/manos.ts` (`esLanza`), con la que `equipo/vestir.ts` lleva la fuerza de
    // la mejor lanza a la cuenta del cuerpo (`fuerzaDeLaLanza`, de donde sale
    // `GolpeConArma.carga` con una montura de guerra, 26-10-2026); quien lo enseña,
    // `esLanza` también. Los dos eran `hero/equipo.ts` hasta la fase N de la
    // reorganización (07-11-2026). Una carga que mirara la pieza por su cuenta tendría su
    // propia regla. El `lanza` de la cola de la animación es quien lanza un hechizo:
    // fuera. Roto a mano: un `p.lanza` en `carga.ts` sale rojo.
    const LEEN = [ruta('src/core/equipo/manos.ts'), ruta('src/core/equipo/pieza.ts')];
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR].filter(
      (r) => r !== ruta('src/client/anim.ts'),
    );
    const lee = /\.lanza\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LEEN.includes(r)),
        lee,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/equipo/manos.ts')], lee)).not.toEqual([]);
  });

  it('las armas de fuego y las granadas: lo que tira lo leen tres módulos y la recarga y las granadas de un stack las escribe la batalla', () => {
    // 02-11-2026, «armas de fuego y granadas». Dos partes, cada una rota a mano y
    // vista en rojo:
    //  (a) lo que tira una pieza o un golpe (`.tiro`: `Pieza.tiro` y
    //      `GolpeConArma.tiro`) lo leen solo `equipo/pieza.ts` (la regla de la pieza y
    //      `lanzaGranadas`), `equipo/vestir.ts` (`tiroDelGolpe`, que lo lleva a la
    //      unidad) y `battle/armas.ts` (`perforaLaArmadura`, `recargaDe`,
    //      `cargasDe`). Una pantalla o una IA que mirara la pieza tendría su propia
    //      regla de quién perfora o cuánto recarga. Roto: un `p.tiro` en
    //      `damage.ts`, rojo.
    //  (b) la recarga que le falta a un stack (`recargando`), su granada en el aire
    //      (`granada`) y las que ha lanzado (`granadasLanzadas`) los escribe solo
    //      `battle.ts`: el disparo, el lanzamiento, la explosión y el cierre del
    //      turno. Quien los escribiera por su cuenta daría disparos o granadas sin
    //      regla. Roto: un `s.recargando = 0` en `tactics.ts`, rojo.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const LEEN = [
      ruta('src/core/equipo/pieza.ts'),
      ruta('src/core/equipo/vestir.ts'),
      ruta('src/core/battle/armas.ts'),
    ];
    const lee = /\.tiro\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LEEN.includes(r)),
        lee,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/battle/armas.ts')], lee)).not.toEqual([]);

    const ESCRIBE = ruta('src/core/battle/battle.ts');
    const escribe = /\.(recargando|granada|granadasLanzadas)\s*(\+|-)?=(?!=)/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== ESCRIBE),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ESCRIBE], escribe)).not.toEqual([]);
  });

  it('la montura: la pone solo `conEquipo`, la carga montada la cuenta solo `cifrasDelCuerpo` y «charge» ya no es un rasgo', () => {
    // 26-10-2026, «vamos a separar la montura del personaje». Cuatro partes, cada
    // una rota a mano y vista en rojo:
    //  (a) `UnitInfo.montura` (las cifras de la montura puesta, `MonturaPuesta`) la
    //      escribe solo `conEquipo` (`equipo/vestir.ts`, `monturaPuesta`): quien
    //      escribiera `{ ...u, montura: { fuerza: 80, … } }` daría casillas y carga
    //      sin pieza. Roto: un `montura: { id: 'x', … }` en `arena.ts`, rojo.
    //  (b) la horquilla de la carga montada la calcula solo `cifrasDelCuerpo`
    //      (`cuerpo.ts`), con la fuerza de la mejor lanza que le da `conEquipo`: el
    //      nombre `fuerzaDeLaLanza` solo vive en esos dos. Una pantalla o una IA
    //      que sumara la fuerza de la montura por su cuenta tendría otra regla (y la
    //      señal temprana del plan: el daño normal con la fuerza del caballo).
    //      Roto: un `fuerzaDeLaLanza` en `damage.ts`, rojo.
    //  (c) si una montura es de guerra (`.guerra`) lo leen solo `equipo/pieza.ts` (la
    //      pieza), `equipo/manos.ts` (`esDeGuerra`) y `equipo/vestir.ts` (que lo lleva a
    //      la unidad, `monturaPuesta`, y lo compara, `mismaMontura`; los dos eran
    //      `hero/equipo.ts` hasta la fase N de la reorganización, 07-11-2026) y
    //      `cuerpo.ts` (`montadoDeGuerra`, la regla). La agilidad de una pieza no
    //      se puede vigilar por su nombre: `.agilidad` es también la del cuerpo.
    //      Roto: un `p.guerra` en `paneles.ts`, rojo.
    //  (d) «charge» no es un rasgo: ni en `CREATURE_TRAITS` ni en ninguna unidad
    //      del catálogo; montar es llevar una montura de guerra. El «charge» de los
    //      clips de la animación (correr) es otra cosa y no se mira.
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    const ESCRITOR = ruta('src/core/equipo/vestir.ts');
    const escribe =
      /\bmontura\s*:\s*(\{\s*(id|nombre|fuerza|agilidad|peso|guerra)\b|monturaPuesta\s*\()/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== ESCRITOR),
        escribe,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ESCRITOR], escribe)).not.toEqual([]);

    const CUENTA = [ruta('src/core/unidad/cuerpo.ts'), ESCRITOR];
    const lanza = /\bfuerzaDeLaLanza\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !CUENTA.includes(r)),
        lanza,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/unidad/cuerpo.ts')], lanza)).not.toEqual([]);

    const LEEN = [
      ruta('src/core/equipo/pieza.ts'),
      ruta('src/core/equipo/manos.ts'),
      ESCRITOR,
      ruta('src/core/unidad/cuerpo.ts'),
    ];
    const guerra = /\.guerra\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LEEN.includes(r)),
        guerra,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/unidad/cuerpo.ts')], guerra)).not.toEqual([]);

    expect(CREATURE_TRAITS as readonly string[]).not.toContain('charge');
    expect(UNIDADES.filter((u) => (u.traits as readonly string[]).includes('charge'))).toEqual([]);
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
    for (const fichero of [...CORE, ...CLIENTE, ...SERVIDOR, ...ficheros(ruta('src/shared'))]) {
      if (fichero === ruta('src/core/battle/board.ts')) continue;
      for (const [, nombres, desde] of leer(fichero).matchAll(deBoard)) {
        // Solo el `board.ts` de la batalla: `./board.js` lo es desde `battle/`.
        const esElDeLaBatalla =
          (desde as string).endsWith('battle/board.js') ||
          (desde === './board.js' && fichero.startsWith(ruta('src/core/battle/')));
        if (!esElDeLaBatalla) continue;
        importadores.push(fichero);
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
          if (MEDIDAS_DE_FILA.has(n) || n.startsWith('*')) conMedidas.push(`${fichero} → ${n}`);
        }
      }
    }
    expect(conMedidas).toEqual([]);
    // Y que mire algo: la proyección, el editor y el despliegue importan de `board.ts`.
    for (const r of [
      ruta('src/client/render/proyeccion.ts'),
      ruta('src/client/arena/paneles.ts'),
      ruta('src/core/battle/battle.ts'),
    ]) {
      expect(importadores, r).toContain(r);
    }
    // Una columna comparada con un número de 8 para arriba es el borde derecho
    // escrito a mano: el de las pares no es el de las impares.
    const bordes = infractoresDeCodigo(
      [
        ...CORE.filter(
          (r) =>
            /^src\/core\/(?:battle|ai|contract)\//.test(r) || r.startsWith(ruta('src/core/arena/')),
        ),
        ...CLIENTE,
        ...SERVIDOR,
      ],
      /\.col\s*(?:[<>]=?|[!=]==)\s*(?:[89]|1\d)\b/,
    );
    expect(bordes).toEqual([]);
  });

  it('el muro y la puerta que esperan el clic los apunta solo `MurallaDeLaActiva`', () => {
    // La partida y la arena juegan la muralla con una pieza (fase 2 del puesto
    // fronterizo): si una sesión o la escena guardaran su propio «muro por elegir»,
    // el botón marcado y el clic del tablero dejarían de hablar de lo mismo, que es
    // como vivía en la arena (un campo de `SesionDeArena` que la escena escribía a
    // pelo). Desde el simplify de la fase 2 es una clase más de lo que espera el clic
    // (`LoApuntado`) y `muroPorElegir`/`puertaPorElegir` son getters que el compilador
    // no deja escribir; lo que el tipo no impide es apuntarla desde otro sitio. Desde
    // fuera solo se suelta (`soltar`). Roto a mano (04-11-2026): un
    // `this.apuntados.apuntar({ kind: 'muralla', id: 'subir' })` en `Session` sale rojo
    // con su línea.
    const PERMITIDO = ruta('src/client/session.ts');
    const conPermiso = lineasDeLasDeclaraciones(PERMITIDO, ['MurallaDeLaActiva']);
    const apunta = /\{\s*kind:\s*'muralla'/;
    const escrituras: string[] = [];
    for (const ruta of [...CLIENTE, ...CORE]) {
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (!apunta.test(linea)) continue;
        if (ruta === PERMITIDO && conPermiso.has(i + 1)) continue;
        escrituras.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(escrituras).toEqual([]);
    expect(infractoresDeCodigo([PERMITIDO], apunta)).toHaveLength(1);
  });

  it('la fase de despliegue la mueve solo `despliegue.ts` (02-11-2026)', () => {
    // `BattleState.despliegue` dice qué tanda está abierta y quién despliega a
    // mano: quien lo escribiera por su cuenta se saltaría las tandas que pasan
    // solas, el reasiento al abrir cada una y el `beginRound` del final
    // (`seguirElDespliegue`). Se cambia con `aplicarDespliegue` y
    // `terminarElDespliegue`. Roto a mano (02-11-2026): un `battle.despliegue =
    // null` en `server/director.ts` sale rojo con su línea. La fase vivía en
    // `battle.ts` hasta la fase N de la reorganización (07-11-2026), que la llevó a
    // `despliegue.ts`; la misma sonda, y un `state.despliegue = null` en el motor
    // (`endTurn`), salen rojos.
    const PUERTA = ruta('src/core/battle/despliegue.ts');
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\.despliegue\s*=(?!=)|\[\s*['"`]despliegue['"`]\s*\]\s*=(?!=)/,
    );
    const ajenas = escrituras.filter((e) => !e.startsWith(`${PUERTA}:`));
    expect(ajenas).toEqual([]);
    // Y que mire algo: las de `despliegue.ts` tienen que salir.
    expect(escrituras.length).toBeGreaterThan(0);
  });

  it('la muerte de un stack (`perished`) la escribe solo `anotarLaMuerte`', () => {
    // Al morir se van los efectos de «se acaba si muere» y saltan sus disparadores
    // `alMorir` (el editor de magia, 06-11-2026): un `perished` empujado a mano se
    // los saltaría. Roto a mano: un `state.log.push({ kind: 'perished', … })` en
    // `herirYContar` sale rojo.
    const PUERTA = ruta('src/core/battle/battle.ts');
    const escribe = /kind: 'perished'/;
    const todos = [...CORE].filter((r) => r !== PUERTA && !r.endsWith('/types.ts'));
    expect(infractoresDeCodigo(todos, escribe)).toEqual([]);
    const enLaPuerta = infractoresDeCodigo([PUERTA], escribe);
    expect(enLaPuerta).toHaveLength(1);
    const permitidas = lineasDeLasDeclaraciones(PUERTA, ['anotarLaMuerte']);
    const linea = Number(enLaPuerta[0]?.split(':')[1]?.split(' ')[0]);
    expect(permitidas.has(linea), enLaPuerta.join('\n')).toBe(true);
  });
});

// ------------------------------------------------------------------ armadura (#262)

describe('la armadura (#262)', () => {
  it('`puntosDeArmadura` lo escribe solo `conEquipo` y lo leen solo él y `battle/armas.ts`; ninguna pieza da PV y el agente la ve', () => {
    // 14-10-2026: las piezas dan puntos de armadura, que se restan
    // del daño de cada golpe. La suma es de `vestir` (`equipo/vestir.ts`) y la resta
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
    const ESCRITOR = ruta('src/core/equipo/vestir.ts');
    const LECTORES = [ESCRITOR, ruta('src/core/battle/armas.ts'), ruta('src/core/types.ts')];
    const menciona = /\bpuntosDeArmadura\b/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !LECTORES.includes(r)),
        menciona,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/battle/armas.ts')], menciona)).not.toEqual([]);
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
    //  (a) `resolverBases` (la única suma de una base) es privada de `equipo/pieza.ts` y la
    //      llama solo el cargador del catálogo (`leerPiezas`), por el que pasan el
    //      fichero, el catálogo que edita la arena y las piezas de una pelea
    //      (`catalogoDeEquipo`): un segundo montador de catálogo sumaría la base con
    //      otra regla, o no la sumaría.
    //  (b) Los extras de una pieza con base (`.extras`) los leen solo `equipo/pieza.ts`,
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
        todos.filter((r) => r !== ruta('src/core/equipo/pieza.ts')),
        llamada,
      ),
    ).toEqual([]);
    expect(
      infractoresDeCodigo([ruta('src/core/equipo/pieza.ts')], /\bresolverBases\s*\(/),
    ).not.toEqual([]);
    // Y en `equipo/pieza.ts` (`data.ts` hasta la fase N, 07-11-2026), la llama solo
    // `leerPiezas`: el catálogo (fichero, arena y pelea) pasa por él.
    expect(
      fueraDe(
        /\bresolverBases\s*\(/,
        { [ruta('src/core/equipo/pieza.ts')]: ['resolverBases', 'leerPiezas'] },
        [ruta('src/core/equipo/pieza.ts')],
      ),
    ).toEqual([]);

    const extras = /\.extras\b/;
    const leenExtras = (r: string): boolean =>
      r === ruta('src/core/equipo/pieza.ts') ||
      r.startsWith(ruta('src/core/arena/')) ||
      r.startsWith(ruta('src/client/arena/'));
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !leenExtras(r)),
        extras,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/equipo/pieza.ts')], extras)).not.toEqual([]);

    const tabla = /\bTABLA\b/;
    expect(
      fueraDe(tabla, {
        [ruta('src/core/battle/cifras-de-la-rueda.ts')]: [
          'TABLA',
          'cifrasDeLosNiveles',
          'GOLPES_DEL_RAPIDO',
        ],
      }),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/battle/cifras-de-la-rueda.ts')], tabla)).not.toEqual(
      [],
    );
    const traduce = /\bcifrasDeLosNiveles\s*\(/;
    expect(
      fueraDe(traduce, {
        [ruta('src/core/battle/cifras-de-la-rueda.ts')]: ['cifrasDeLosNiveles'],
        [ruta('src/core/battle/armas.ts')]: ['ruedaDelGolpe'],
        [ruta('src/core/battle/rueda.ts')]: ['filasDeLaRueda'],
      }),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/battle/armas.ts')], traduce)).not.toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/battle/rueda.ts')], traduce)).not.toEqual([]);
  });
});
