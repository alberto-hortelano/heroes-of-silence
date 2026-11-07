/**
 * La partida: la crónica (un solo escritor, nada tras «fin de la partida», el
 * viaje por JSON); el dueño de un sitio, la ocupación, las guarniciones, las
 * obras del puesto, el héroe que vuelve a casa y la batalla del mapa (una sola
 * llamada a `createBattle`); el recinto de las ciudades, el río del vestido, el
 * Dijkstra del héroe, la niebla y lo que se ve; la infiltración.
 *
 * Los guardias de las fronteras de `CLAUDE.md` vivían en un solo
 * `invariantes.test.ts`; desde la fase T de la reorganización (06-11-2026) van en
 * cinco por frontera —capas, batalla, partida, datos y cliente—, para que tocar un
 * área corra los suyos. Cómo se leen el código y las rutas, y lo que se aprendió
 * escribiéndolos, en `codigo-del-repo.ts`. Cada guardia nace en verde y se ha
 * visto morder.
 */

import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { playAiGame } from '../src/core/ai/turn.js';
import { createRng } from '../src/core/rng.js';
import { newGame } from '../src/core/state/setup.js';
import type { GameState } from '../src/core/state/tipos.js';
import {
  CLIENTE,
  CORE,
  codigoDe,
  esLaSesion,
  HERRAMIENTAS,
  importaDe,
  infractores,
  infractoresDeCodigo,
  leer,
  lineasDeLasDeclaraciones,
  ruta,
  SERVIDOR,
} from './codigo-del-repo.js';
import { RAIZ } from './comun.js';
import { rango, segunPrisa } from './lento.js';

describe('invariantes del proyecto', () => {
  it('el recinto de una ciudad lo declara solo `core/map/recinto.ts`: su lado, su separación y sus puertas', () => {
    // La ciudad amurallada, vuelta 3 (21-10-2026): el 3 × 3 era de la escena
    // (`rectanguloDelRecinto`), que lo corría contra el borde, y el núcleo ponía
    // nodos, inicios y otras ciudades donde ella levantaba la muralla. Ahora es
    // del núcleo, y la escena, el generador y la puerta de los planes lo leen de
    // allí. Roto a mano: `LADO_DEL_RECINTO` declarado otra vez en la escena sale rojo.
    const PUERTA = ruta('src/core/map/recinto.ts');
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
    expect(infractoresDeCodigo([ruta('src/core/map/puertas.ts')], /\btown\b/)).toEqual([]);
    // Y el paso por el recinto lo lee solo `map.ts` (el Dijkstra y `sePasa`):
    // nadie más decide por su cuenta qué casilla del recinto se pisa.
    // El de la batalla (`battle/`) es otro: el de los muros de la muralla.
    const lee = /\bpasoPermitido\s*\(/;
    expect(
      infractoresDeCodigo(
        [...CORE, ...CLIENTE, ...SERVIDOR].filter(
          (r) =>
            r !== ruta('src/core/map/map.ts') &&
            r !== ruta('src/core/map/recinto.ts') &&
            !r.startsWith(ruta('src/core/battle/')),
        ),
        lee,
      ),
    ).toEqual([]);
  });

  it('la crónica se escribe por un solo sitio: `emit`, en `state/cronica.ts`, y la importan solo los módulos de la partida', () => {
    // `state.log` es de solo lectura, así que escribir en él exige un `as`
    // VISIBLE, y esa es toda la fuerza del candado. Cuando `emit` no estaba
    // exportada, el miedo era que el día que una regla saliera de `game.ts` la
    // salida fácil fuera copiar el cast — y con él se pierden de golpe el
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
    //
    // **Y desde que se repartió `game.ts`** (fase N de la reorganización,
    // 07-11-2026), `emit` vive en `state/cronica.ts` con la foto de los sitios y
    // **se exporta**: la importan los módulos de la partida que cuentan hechos.
    // Exportarla era justo la salida que este guardia temía, así que el candado
    // pasa a tener cuatro mitades:
    //
    //  1. los cuatro `as` de arriba, con `cronica.ts` como única excepción;
    //  2. `emit` se declara solo en `cronica.ts`, y allí el `push` del log va solo
    //     dentro de ella: otra función de `cronica.ts` que lo escribiera se
    //     saltaría el sello sin necesitar ningún `as` nuevo;
    //  3. quien importa `emit` —con nombre, con `* as`, con `import()` o
    //     reexportándola, también desde las herramientas— es exactamente la lista
    //     de abajo: uno de más es una puerta nueva que nadie ha mirado; uno de
    //     menos, una lista vieja que deja de vigilar;
    //  4. y cada uno de la lista la llama: uno que la importara sin usarla tendría
    //     el permiso sin necesitarlo.
    //
    // Los sitios, el clima, la renta y los asaltantes no escriben hechos: los
    // cuenta quien los llama. Roto a mano (07-11-2026), una sonda por mitad y
    // las cinco rojas con su fichero y su línea: `(state.log as
    // GameEvent[]).push(…)` en `turnos.ts` (1); una `function emit` en
    // `sitios.ts` (2); `import { emit }` en `ai/turn.ts` y, por el otro lado,
    // quitar el de `marcha.ts` (3); `lugares.ts` importándola sin llamarla (4).
    const CRONICA = ruta('src/core/state/cronica.ts');
    const LA_IMPORTAN = ['turnos', 'marcha', 'batallas', 'cierre', 'lugares', 'heroes', 'game'].map(
      (m) => ruta(`src/core/state/${m}.ts`),
    );
    const publicado = [...CORE, ...CLIENTE, ...SERVIDOR];
    const lineaDe = (donde: string): number => Number(/^.+?:(\d+) → /.exec(donde)?.[1]);
    const colados: string[] = [];

    // 1 · los `as` que abren el candado.
    const puertas: readonly (readonly [string, RegExp])[] = [
      // el log casteado a algo escribible. `as const` pasa: no abre nada.
      ['el log casteado', /\.log\s+as\s+(?!const\b)/],
      // casteas el ESTADO y lees `.log` de lo que sale. La de QA.
      ['un cast del que se saca `.log`', /\bas\b[^;\n]*\)\s*\.log\b/],
      // la misma, con el tipo escrito ahí mismo: sirve aunque el `.log` se lea
      // tres líneas más abajo, que es lo que la anterior no alcanza.
      ['un cast a un tipo que redeclara `log`', /\bas\b[^;\n]*\blog\s*\??\s*:/],
      // el cheque en blanco. No se puede acotar a lo que abre —abre todo—, así
      // que se prohíbe entero; hoy no hay ni uno en el código publicado.
      ['un `as any`, que abre esa puerta y todas', /\bas\s+any\b/],
    ];
    const fuera = publicado.filter((r) => r !== CRONICA);
    for (const [puerta, patron] of puertas) {
      for (const donde of infractores(fuera, patron)) colados.push(`[1 · ${puerta}] ${donde}`);
    }

    // 2 · `emit`, declarada solo en `cronica.ts`; el `push` del log, solo dentro de ella.
    const declaraEmit = /\b(?:function|const|let|var|class)\s+emit\b/;
    for (const donde of infractoresDeCodigo(fuera, declaraEmit)) {
      colados.push(`[2 · otra \`emit\`] ${donde}`);
    }
    const enEmit = lineasDeLasDeclaraciones(CRONICA, ['emit']);
    const escribeElLog = /\.log\b[^;\n]*\.push\s*\(/;
    const pushes = infractoresDeCodigo([CRONICA], escribeElLog);
    for (const donde of pushes) {
      if (!enEmit.has(lineaDe(donde))) colados.push(`[2 · el log, fuera de \`emit\`] ${donde}`);
    }

    // 3 · quién la importa, resuelto (el alias `@core/` o relativo a su carpeta).
    const aLaCronica = (espec: string, desde: string): boolean => {
      const destino = espec.startsWith('@core/')
        ? join('src/core', espec.slice('@core/'.length))
        : espec.startsWith('.')
          ? join(dirname(desde), espec)
          : null;
      return destino?.replace(/\.js$/, '.ts') === CRONICA;
    };
    const importadores = new Map<string, number>();
    for (const r of [...publicado, ...HERRAMIENTAS]) {
      const texto = leer(r);
      if (!texto.includes('cronica')) continue;
      const sf = ts.createSourceFile(r, texto, ts.ScriptTarget.Latest, true);
      const linea = (n: ts.Node): number =>
        sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      const visitar = (n: ts.Node): void => {
        if (
          ts.isImportDeclaration(n) &&
          ts.isStringLiteral(n.moduleSpecifier) &&
          aLaCronica(n.moduleSpecifier.text, r)
        ) {
          const nb = n.importClause?.namedBindings;
          if (nb !== undefined && ts.isNamespaceImport(nb)) importadores.set(r, linea(n));
          if (nb !== undefined && ts.isNamedImports(nb)) {
            for (const e of nb.elements) {
              if ((e.propertyName ?? e.name).text !== 'emit') continue;
              importadores.set(r, linea(n));
              if (e.propertyName !== undefined) {
                colados.push(`[3 · \`emit\` con otro nombre] ${r}:${linea(n)} → ${e.getText(sf)}`);
              }
            }
          }
        } else if (
          ts.isExportDeclaration(n) &&
          n.moduleSpecifier !== undefined &&
          ts.isStringLiteral(n.moduleSpecifier) &&
          aLaCronica(n.moduleSpecifier.text, r)
        ) {
          const clausula = n.exportClause;
          if (
            clausula === undefined ||
            ts.isNamespaceExport(clausula) ||
            clausula.elements.some((e) => (e.propertyName ?? e.name).text === 'emit')
          )
            importadores.set(r, linea(n));
        } else if (
          ts.isCallExpression(n) &&
          n.expression.kind === ts.SyntaxKind.ImportKeyword &&
          n.arguments[0] !== undefined &&
          ts.isStringLiteralLike(n.arguments[0]) &&
          aLaCronica(n.arguments[0].text, r)
        ) {
          importadores.set(r, linea(n));
        }
        ts.forEachChild(n, visitar);
      };
      visitar(sf);
    }
    for (const [r, l] of importadores) {
      if (!LA_IMPORTAN.includes(r))
        colados.push(`[3 · una puerta nueva] ${r}:${l} importa \`emit\``);
    }
    for (const r of LA_IMPORTAN) {
      if (!importadores.has(r)) colados.push(`[3 · una lista vieja] ${r} ya no importa \`emit\``);
    }

    // 4 · cada uno de la lista la llama.
    for (const r of LA_IMPORTAN) {
      if (!/\bemit\s*\(/.test(codigoDe(r))) colados.push(`[4 · la importa y no la llama] ${r}`);
    }

    expect(colados).toEqual([]);
    // Y que mire algo: el cast de verdad, la declaración y el `push` de verdad
    // (dentro de `emit`), y los siete importadores, que ve el resolutor.
    expect(infractores([CRONICA], puertas[0]![1])).toHaveLength(1);
    expect(infractoresDeCodigo([CRONICA], declaraEmit)).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect([...importadores.keys()].sort()).toEqual([...LA_IMPORTAN].sort());
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

  it('el dueño guardado de un sitio del muro (paso, ciudad o pueblo) lo escribe tomarElNodo, nadie más', () => {
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
    //
    // Desde la tarea 2 (ciudades y pueblos en su región, 05-11-2026) la ciudad
    // tiene una sola cara, su objeto del mapa, como el paso: `Town.owner` se fue y
    // `captureNode` y `captureTown` son una, `tomarElNodo`. Roto a mano
    // (05-11-2026): un `obj.owner = player.id` en `collectAt`, junto a la llamada a
    // `tomarElNodo`, sale rojo con su línea. Vive en `state/marcha.ts` desde que se
    // repartió `game.ts` (fase N de la reorganización, 07-11-2026), sin exportar: sus
    // dos llamadas, la marcha y la entrega de un sitio, son de ese módulo. La
    // función de cada línea se busca también tras un `export`: en `marcha.ts` casi
    // todo se exporta, y una escritura en una función exportada justo debajo de
    // `tomarElNodo` se le atribuía a ella (sonda del 07-11-2026: solo la cazaba la
    // cuenta de abajo; ahora sale con su línea).
    const MARCHA = ruta('src/core/state/marcha.ts');
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\.owner\s*=(?!=)|\[\s*['"`]owner['"`]\s*\]\s*=(?!=)/,
    );
    const codigo = codigoDe(MARCHA).split('\n');
    const funcionDe = (linea: number): string | null => {
      for (let i = linea - 1; i >= 0; i--) {
        const m = /^(?:export )?function (\w+)/.exec(codigo[i] ?? '');
        if (m !== null) return m[1] ?? null;
      }
      return null;
    };
    const ajenas = escrituras.filter((e) => {
      const m = /^(.+):(\d+) → /.exec(e);
      if (m === null || m[1] !== MARCHA) return true;
      const fn = funcionDe(Number(m[2]));
      return fn !== 'tomarElNodo';
    });
    expect(ajenas).toEqual([]);
    // Y que mire algo: la escritura de verdad —la del objeto del sitio— tiene que
    // salir. Sin esto, un patrón que no casara nada pasaría por vacío.
    expect(escrituras).toHaveLength(1);
  });

  it('en el núcleo, el `owner` de una ciudad o un pueblo solo lo leen la red y `tomarElNodo`', () => {
    // El `owner` del objeto de una ciudad o un pueblo es el dueño GUARDADO, y solo
    // es su dueño si el sitio es un nodo (está en el muro); en uno de dentro de una
    // región vale `null` siempre (ciudades y pueblos en su región, 05-11-2026). El
    // cliente y el espectador lo reescriben en su copia con el dueño derivado, pero
    // en el núcleo un `town.owner` nuevo daría `null` sin avisar en cuanto la ciudad
    // fuera de una región. La regla del sitio es `dueñoDeUnSitio` (la red) y
    // `dueñoDelSitio` (`state/sitios.ts`). La red que lo lee, y la única exención,
    // es `map/territorio.ts`, los dueños de la red (era `map/regiones.ts` hasta la
    // fase N de la reorganización, 07-11-2026; roto a mano: `return o.owner`
    // copiado a `regiones.ts` sale rojo).
    //
    // No se puede ver por el texto: `o.owner` es igual en un paso, un héroe o una
    // ciudad. Se pregunta al compilador el tipo de lo que va antes del punto, y
    // cuenta si alguna de sus formas es un objeto `town` o `village` con dueño.
    // Mira el acceso con punto, con corchetes y la desestructuración. ~1 s.
    // Roto a mano (05-11-2026): `return obj.owner;` en el `case 'town'` de
    // `objectValue` (`ai/strategy.ts`) sale rojo con su línea.
    const ficherosDelNucleo = CORE.filter((f) => f.endsWith('.ts')).map((f) => join(RAIZ, f));
    const programa = ts.createProgram(ficherosDelNucleo, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    });
    const tipos = programa.getTypeChecker();
    const esUnSitio = (tipo: ts.Type): boolean =>
      (tipo.isUnion() ? tipo.types : [tipo]).some((forma) => {
        const kind = forma.getProperty('kind');
        if (kind === undefined || forma.getProperty('owner') === undefined) return false;
        const k = tipos.getTypeOfSymbol(kind);
        return (k.isUnion() ? k.types : [k]).some(
          (l) => l.isStringLiteral() && (l.value === 'town' || l.value === 'village'),
        );
      });
    const tomar = lineasDeLasDeclaraciones(ruta('src/core/state/marcha.ts'), ['tomarElNodo']);
    const lecturas: string[] = [];
    for (const fuente of programa.getSourceFiles()) {
      const fichero = fuente.fileName.slice(RAIZ.length).replace(/^\//, '');
      if (!fichero.startsWith(ruta('src/core/')) || fichero === ruta('src/core/map/territorio.ts'))
        continue;
      const visitar = (n: ts.Node): void => {
        let de: ts.Node | null = null;
        if (ts.isPropertyAccessExpression(n) && n.name.text === 'owner') de = n.expression;
        else if (
          ts.isElementAccessExpression(n) &&
          ts.isStringLiteralLike(n.argumentExpression) &&
          n.argumentExpression.text === 'owner'
        )
          de = n.expression;
        else if (
          ts.isBindingElement(n) &&
          ts.isObjectBindingPattern(n.parent) &&
          (n.propertyName ?? n.name).getText() === 'owner'
        )
          de = n.parent;
        if (de !== null && esUnSitio(tipos.getTypeAtLocation(de))) {
          const linea = fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          if (!(fichero === ruta('src/core/state/marcha.ts') && tomar.has(linea)))
            lecturas.push(`${fichero}:${linea} → ${n.getText()}`);
        }
        ts.forEachChild(n, visitar);
      };
      visitar(fuente);
    }
    expect(lecturas).toEqual([]);
    // Y que mire algo: `tomarElNodo` lo lee (y lo escribe). Sin esto, un tipo que
    // el compilador no resolviera pasaría por vacío.
    const enTomar = codigoDe(ruta('src/core/state/marcha.ts'))
      .split('\n')
      .filter((l, i) => tomar.has(i + 1) && /\.owner\b/.test(l));
    expect(enTomar.length).toBeGreaterThan(0);
  });

  it('la rejilla de tipos del vestido la escribe `ponerTipo`, nadie más: así el río no se corta', () => {
    // #144, río continuo: el río del paso 2 lo partían diecisiete escrituras de
    // `tipos` en el vestido (las esquinas de las sendas, el agua derramada, las
    // orillas de las espigas…), y ninguna sabía que una casilla era del río.
    // `ponerTipo` lanza si se le pide cambiar una casilla del río; una
    // escritura por corchetes en otro sitio se lo saltaría en silencio. Vive en
    // `map/vestir/base.ts`, lo que comparten las partes del vestido (era
    // `map/vestir.ts` hasta la fase N de la reorganización, 07-11-2026; roto a
    // mano: `tipos[i] = ABIERTA` en `vestir/relieve.ts` sale rojo con su línea).
    const escrituras = infractoresDeCodigo(
      CORE,
      /\btipos\s*\[[^\]]+\]\s*=(?!=)|\btipos\s*\.\s*(fill|set|copyWithin)\s*\(/,
    );
    const BASE = ruta('src/core/map/vestir/base.ts');
    const codigo = codigoDe(BASE).split('\n');
    const funcionDe = (linea: number): string | null => {
      for (let i = linea - 1; i >= 0; i--) {
        const m = /^export function (\w+)/.exec(codigo[i] ?? '');
        if (m !== null) return m[1] ?? null;
      }
      return null;
    };
    const ajenas = escrituras.filter((e) => {
      const m = /^(.+):(\d+) → /.exec(e);
      return m === null || m[1] !== BASE || funcionDe(Number(m[2])) !== 'ponerTipo';
    });
    expect(ajenas).toEqual([]);
    // Que mire algo: la de `ponerTipo` sale.
    expect(escrituras).toHaveLength(1);
  });

  it('el río de cada rejilla de tipos lo apunta solo `conElRio`', () => {
    // `RIO_DE_LOS_TIPOS` (map/vestir/base.ts) dice qué casillas de una rejilla son del
    // río, y de eso se fía `ponerTipo` para no cortarlo: un `set` con otro río, o un
    // `delete`, y `ponerTipo` deja cortar el de verdad. Se exportó entera durante la
    // fase N de la reorganización (07-11-2026), para que la leyera la búsqueda de los
    // caminos; hoy es privada (fuera de `base.ts` se lee por `rioDeLosTipos`) y esto
    // mira, también ahí dentro, que la escriba solo `conElRio`. Rotos a mano, rojos
    // con su línea: un `RIO_DE_LOS_TIPOS.set(…)` en `vestir/caminos.ts` y un
    // `RIO_DE_LOS_TIPOS.delete(tipos)` en `ponerTipo`.
    const BASE = ruta('src/core/map/vestir/base.ts');
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR, ...HERRAMIENTAS],
      /\bRIO_DE_LOS_TIPOS\s*\.\s*(?:set|delete)\s*\(/,
    );
    const deConElRio = lineasDeLasDeclaraciones(BASE, ['conElRio']);
    const ajenas = escrituras.filter((e) => {
      const m = /^(.+):(\d+) → /.exec(e);
      return m === null || m[1] !== BASE || !deConElRio.has(Number(m[2]));
    });
    expect(ajenas).toEqual([]);
    // Que mire algo: la de `conElRio` sale.
    expect(escrituras).toHaveLength(1);
  });

  it('el camino de un héroe lleva lo hostil: fuera de `state/marcha.ts` nadie llama al Dijkstra del mapa', () => {
    // Lo hostil de la partida —héroe ajeno, castillo ajeno guarnecido— se
    // alcanza y no se cruza en el camino de TODOS (la IA, la persona y el
    // agente), y eso solo lo sabe quien tiene la partida: `alcanceDelHeroe` y
    // `caminoHasta`, en `state/marcha.ts` (en `game.ts` hasta la fase N de la
    // reorganización, 07-11-2026). Un `findPath` o un `reachableFrom` a pelo en
    // la IA o en el cliente volvería a cruzar por encima de una guarnición en
    // un paso estrecho sin que nada se pusiera rojo: el parámetro es opcional
    // porque el mapa, solo, no sabe de héroes. Roto a mano (07-11-2026): un
    // `findPath(` en `ai/strategy.ts` sale rojo con su línea.
    const MARCHA = ruta('src/core/state/marcha.ts');
    const llamadas = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\b(?:findPath|reachableFrom)\s*\(/,
    );
    // `battle/` se salta por nombre y no por despiste: su `findPath` es el del
    // tablero de hexes, otra función con el mismo nombre y sin mapa.
    const ajenas = llamadas.filter(
      (e) =>
        !e.startsWith(`${ruta('src/core/map/map.ts')}:`) &&
        !e.startsWith(`${MARCHA}:`) &&
        !e.startsWith(ruta('src/core/battle/')),
    );
    expect(ajenas).toEqual([]);
    // Y que mire algo: las dos de `marcha.ts` tienen que salir. Los asaltantes
    // trajeron una tercera —el alcance prudente de la IA— y volvió a ser una
    // opción de `alcanceDelHeroe` (`evitarEmboscadas`): el mismo Dijkstra con
    // una marca más no es una segunda puerta.
    expect(llamadas.filter((e) => e.startsWith(`${MARCHA}:`))).toHaveLength(2);
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
        ...CLIENTE.filter((r) => !r.startsWith(ruta('src/client/espectador/'))),
        ...CORE.filter((r) => r.startsWith(ruta('src/core/contract/'))),
        ...SERVIDOR.filter((r) => r !== ruta('src/server/vista-espectador.ts')),
      ],
      /\bstate\.raiders\b/,
    );
    expect(lectores).toEqual([]);
    // Filtrar grupos, en nadie que enseñe algo: ni el cliente —espectador
    // incluido—, ni el contrato, ni el servidor. (`game.ts` filtra para QUITAR
    // un grupo de la partida, que es mutación y no vista.)
    const filtros = infractoresDeCodigo(
      [...CLIENTE, ...CORE.filter((r) => r.startsWith(ruta('src/core/contract/'))), ...SERVIDOR],
      /\b(?:raiders|asaltantesALaVista\([^)]*\))\s*\.\s*filter\s*\(/,
    );
    expect(filtros).toEqual([]);
    // Y que mire algo: la puerta filtra, y el espectador, que no pasa por ella,
    // lee el estado. Sin esto, un patrón que no casara nada pasaría por vacío.
    // Lo que NO ve: un filtro sobre la lista con otro nombre (`vistos.filter`)
    // o un `continue` dentro de un bucle. Lo primero lo para el tipo, que el
    // `.filter` pierde; lo segundo, en el lienzo, recorta a la cámara, no decide
    // si se ve.
    expect(
      infractoresDeCodigo([ruta('src/core/state/asaltantes.ts')], /\braiders\s*\.\s*filter\s*\(/),
    ).not.toEqual([]);
    expect(
      infractoresDeCodigo([ruta('src/server/vista-espectador.ts')], /\bstate\.raiders\b/),
    ).not.toEqual([]);
  });

  it('lo explorado lo escriben solo `descubrir` y `revealEverything`', () => {
    // La niebla por regiones (02-11-2026): una región se descubre ENTERA o no se
    // descubre, y si está descubierta se lee de una casilla suya (`regionDescubierta`).
    // Quien marcara `fog` a trozos —el cuadrado de un héroe, como antes— dejaría
    // regiones a medias que la niebla daría por enteras o por vírgenes, y
    // refrescaría `memory` desde lejos. Escribir es marcar o borrar en un `fog`.
    // Los dos viven en `state/vision.ts` (en `game.ts` hasta la fase N de la
    // reorganización, 07-11-2026). Roto a mano (07-11-2026): un
    // `player.fog.marcarIndices(…)` en `moveHero` (`state/marcha.ts`) sale rojo con
    // su línea.
    const escritura =
      /\bfog\s*\.\s*(?:add|delete|marcarCuadrado|marcarCuadradoDentroDe|marcarIndices)\s*\(/;
    const conPermiso = lineasDeLasDeclaraciones(ruta('src/core/state/vision.ts'), [
      'descubrir',
      'revealEverything',
    ]);
    const fuera = infractoresDeCodigo([...CORE, ...CLIENTE, ...SERVIDOR], escritura).filter((l) => {
      const [fichero, linea] = l.split(' → ')[0]!.split(':');
      return !(fichero === ruta('src/core/state/vision.ts') && conPermiso.has(Number(linea)));
    });
    expect(fuera).toEqual([]);
    // Y que mire algo: los dos escriben.
    expect(
      infractoresDeCodigo([ruta('src/core/state/vision.ts')], escritura).length,
    ).toBeGreaterThanOrEqual(3);
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
      esLaSesion(r) ||
      r.startsWith(ruta('src/client/espectador/')) ||
      r.startsWith(ruta('src/client/render/escenario/')) ||
      r.startsWith(ruta('src/client/desarrollo/'));
    const lectores = infractoresDeCodigo(
      [
        ...CLIENTE.filter((r) => !fuera(r)),
        ...CORE.filter((r) => r.startsWith(ruta('src/core/contract/'))),
      ],
      /\bstate\.heroes\b|\bmap\.objects\b|\bobjectAt\s*\(|\.memory\b/,
    );
    expect(lectores).toEqual([]);
    // Y que mire algo: el espectador, que lo ve todo, lee los objetos vivos (la
    // sesión ya no: con «Ver mapa entero» pasa también por `objetosConocidos`,
    // que le da el dueño derivado de cada sitio, tarea 2).
    expect(
      infractoresDeCodigo([ruta('src/client/espectador/main.ts')], /\bmap\.objects\b/),
    ).not.toEqual([]);
  });

  it('el núcleo no lee la disposición de la base: un sitio no tiene coordenadas en las reglas', () => {
    // `data/bases/<f>.json` es presentación (dónde se pinta cada edificio y por
    // dónde se anda) y la leen el cliente y el taller por `shared/base.ts`. Si el
    // núcleo la leyera, una coordenada de un fondo pintado pasaría a decidir algo
    // del juego. Mira el código con sus cadenas: un `import` es una cadena.
    expect(infractoresDeCodigo(CORE, /data\/bases/)).toEqual([]);
  });

  it('las moradas crecen solo por `crecerLasMoradas`, que salta la ciudad ocupada', () => {
    // P4 de la tarea 2 (05-11-2026): ocupada, «tampoco crecen sus moradas», y la
    // semana se pierde. La regla vive en un sitio, `crecerLasMoradas` (que pregunta
    // `ocupanteDe`); un `applyWeeklyGrowth` suelto en otro sitio haría crecer la
    // ocupada sin que nadie lo notara. Roto a mano (05-11-2026): un
    // `for (const t of state.towns) applyWeeklyGrowth(t)` en `advanceDay`, en lugar
    // de `crecerLasMoradas`, sale rojo con su línea. Los dos viven en
    // `state/turnos.ts` (en `game.ts` hasta la fase N de la reorganización,
    // 07-11-2026), y la sonda, vuelta a poner allí, mordió igual.
    const TURNOS = ruta('src/core/state/turnos.ts');
    const llamadas = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\bapplyWeeklyGrowth\s*\(/,
    );
    const codigo = codigoDe(TURNOS).split('\n');
    const funcionDe = (linea: number): string | null => {
      for (let i = linea - 1; i >= 0; i--) {
        const m = /^(?:export )?function (\w+)/.exec(codigo[i] ?? '');
        if (m !== null) return m[1] ?? null;
      }
      return null;
    };
    const ajenas = llamadas.filter((e) => {
      if (e.startsWith(`${ruta('src/core/town/town.ts')}:`))
        return !/export function applyWeeklyGrowth/.test(e);
      const m = /^(.+):(\d+) → /.exec(e);
      return m === null || m[1] !== TURNOS || funcionDe(Number(m[2])) !== 'crecerLasMoradas';
    });
    expect(ajenas).toEqual([]);
    // Y que mire algo: la llamada de verdad.
    expect(llamadas.filter((e) => e.startsWith(`${TURNOS}:`))).toHaveLength(1);
    expect(codigoDe(TURNOS)).toMatch(
      /function crecerLasMoradas[\s\S]*?ocupanteDe\(state, sitioDeLaCiudad\(town\)\)/,
    );
  });

  it('la batalla contra una ciudad es la de su guarnición: no vuelve el `town` de `BattleFoe`', () => {
    // Tarea 2 (05-11-2026): la guarnición de la ciudad vive en `guarniciones` con su
    // dueño, como la de un paso o un pueblo, y su batalla es `garrison`. Una clase
    // aparte para la ciudad era un segundo camino (el dueño del bando, el botín, lo
    // que sobrevive) que se quedaba atrás. El tipo ya no la deja escribir; esto
    // vigila que no vuelva su campo por otra puerta (un hecho, el cable, la prosa).
    // Roto a mano (05-11-2026): un `return { kind: 'town', townId: … }` en `enemyAt`
    // sale rojo con su línea.
    // El campo como lo escribía `BattleFoe` y como lo leían sus casos (`foe.townId`);
    // `townId` a secas es el nombre de muchos parámetros que no son una batalla.
    const patron =
      /kind:\s*['"]town['"]\s*,\s*townId|\b(?:foe|perdedor|ganador|enemigo)\??\.townId\b/;
    expect(infractoresDeCodigo([...CORE, ...CLIENTE, ...SERVIDOR], patron)).toEqual([]);
    // Y que muerda: la forma de antes la caza.
    expect(patron.test("return { kind: 'town', townId: pueblo.id };")).toBe(true);
    expect(patron.test('townById(state, foe.townId)')).toBe(true);
  });

  it('las guarniciones de ciudades, pasos y pueblos las escribe solo `state/sitios.ts`', () => {
    // `GameState.guarniciones` es tropa: quien la escribiera por su cuenta se
    // saltaría los cupos y el dueño de `intercambioBlocker`, o dejaría una entrada
    // vacía que hace de un pueblo un sitio guardado por nadie. La escriben dejar,
    // recoger, la defensa y el cierre de una batalla, todos por `sitios.ts`. Roto a
    // mano (04-11-2026): un `delete state.guarniciones[nodo.id]` en `captureNode` y
    // un `state.guarniciones[o.id] = { dueño: 0, tropa: [] }` en `director.ts` salen
    // rojos con su línea.
    const PUERTA = ruta('src/core/state/sitios.ts');
    const escrituras = infractoresDeCodigo(
      [...CORE, ...CLIENTE, ...SERVIDOR],
      /\bguarniciones\s*(?:\[[^\]]*\]\s*)?=(?!=)|\bdelete\s+[\w.]*guarniciones\b|\bguarniciones\s*\[[^\]]*\]\s*\.\w+\s*=(?!=)/,
    );
    expect(escrituras.filter((e) => !e.startsWith(`${PUERTA}:`))).toEqual([]);
    expect(escrituras.filter((e) => e.startsWith(`${PUERTA}:`))).not.toEqual([]);
  });

  it('la marca de «volvió a casa» del héroe la ponen y la quitan solo `volverABase` y `nextPlayer`', () => {
    // `Hero.vueltoACasa` es efímera: la pone el héroe vencido o rendido que vuelve a
    // su base y se borra al acabar el turno de su dueño, y la IA recoge por ella
    // (H2 del QA del puesto fronterizo). Escrita en otro sitio duraría de más (la IA
    // recogería cada turno) o de menos (saldría sin la tropa). Roto a mano
    // (04-11-2026): un `hero.vueltoACasa = true` en `hireHero` y un `delete
    // hero.vueltoACasa` en `ai/turn.ts` salen rojos con su línea. Desde que se
    // repartió `game.ts` (fase N de la reorganización, 07-11-2026), cada una en su
    // módulo: `volverABase` en `state/cierre.ts` y `nextPlayer` en `state/turnos.ts`;
    // las dos sondas, vueltas a poner (`hireHero` ya en `state/heroes.ts`), mordieron.
    const PERMITIDOS: Readonly<Record<string, readonly string[]>> = {
      [ruta('src/core/state/cierre.ts')]: ['volverABase'],
      [ruta('src/core/state/turnos.ts')]: ['nextPlayer'],
    };
    const escribe = /\.vueltoACasa\s*=(?!=)|\bdelete\s+[\w.]*\.vueltoACasa\b/;
    const escrituras: string[] = [];
    for (const ruta of [...CORE, ...CLIENTE, ...SERVIDOR]) {
      const conPermiso = lineasDeLasDeclaraciones(ruta, PERMITIDOS[ruta] ?? []);
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (!escribe.test(linea)) continue;
        if (conPermiso.has(i + 1)) continue;
        escrituras.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(escrituras).toEqual([]);
    // Y que mire algo: la que la pone y la que la quita, una en cada módulo.
    expect(infractoresDeCodigo(Object.keys(PERMITIDOS), escribe)).toHaveLength(2);
  });

  it('la obra de un puesto (`node.mejora`) la escribe solo `mejorarElPuesto`', () => {
    // La obra de un paso tomado decide tras qué muralla se pelea en él
    // (`murallaDelSitio`) y la cobra quien la hace (fase 3 del puesto fronterizo).
    // Escrita en otro sitio sería una muralla sin pagar, o una que baja de nivel, y
    // tomar el paso no la toca: es una obra y se queda con él. Roto a mano
    // (04-11-2026): un `nodo.mejora = 'ninguna'` en `captureNode` sale rojo con su
    // línea.
    const PERMITIDO = ruta('src/core/state/sitios.ts');
    const conPermiso = lineasDeLasDeclaraciones(PERMITIDO, ['mejorarElPuesto']);
    const escribe = /\.mejora\s*=(?!=)/;
    const escrituras: string[] = [];
    for (const ruta of [...CORE, ...CLIENTE, ...SERVIDOR]) {
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (!escribe.test(linea)) continue;
        if (ruta === PERMITIDO && conPermiso.has(i + 1)) continue;
        escrituras.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(escrituras).toEqual([]);
    expect(infractoresDeCodigo([PERMITIDO], escribe)).toHaveLength(1);
  });

  it('en `state/` solo `montarLaBatalla` llama a `createBattle`', () => {
    // La batalla del mapa se monta en un sitio: la que nace y la defensa que la
    // persona rehace antes de la primera jugada (`elegirLaDefensa`) tienen que
    // salir de los mismos bandos, o rehacerla daría otra batalla. Roto a mano
    // (04-11-2026): un `createBattle(...)` en `elegirLaDefensa` sale rojo. La otra
    // llamada, `batallaDeLaFormacion` (la fase de despliegue de `main`, fusionada el
    // 05-11-2026), no es una batalla del mapa: es la vista de la formación de un
    // héroe contra nadie, que no nace ni se pelea. Las dos viven en
    // `state/batallas.ts` (en `game.ts` hasta la fase N de la reorganización,
    // 07-11-2026), y la sonda, vuelta a poner en `elegirLaDefensa`, mordió igual.
    const PERMITIDO = ruta('src/core/state/batallas.ts');
    const conPermiso = lineasDeLasDeclaraciones(PERMITIDO, [
      'montarLaBatalla',
      'batallaDeLaFormacion',
    ]);
    const deState = CORE.filter((r) => r.startsWith(ruta('src/core/state/')));
    const llamadas: string[] = [];
    for (const ruta of deState) {
      for (const [i, linea] of codigoDe(ruta).split('\n').entries()) {
        if (!/\bcreateBattle\s*\(/.test(linea)) continue;
        if (ruta === PERMITIDO && conPermiso.has(i + 1)) continue;
        llamadas.push(`${ruta}:${i + 1} → ${linea.trim()}`);
      }
    }
    expect(llamadas).toEqual([]);
    // Una en cada una: la del mapa y la de la formación.
    expect(infractoresDeCodigo([PERMITIDO], /\bcreateBattle\s*\(/)).toHaveLength(2);
  });

  it('la infiltración se lee en un sitio: el rasgo en `hero/infiltracion.ts`, sus tipos en `hero/tipos-de-heroe.ts`', () => {
    // Quién se infiltra es una sola regla (`infiltracionBlocker`): si otro módulo
    // mirara el rasgo `'infiltrarse'` por su cuenta, la búsqueda de caminos, la
    // ficha y el contrato podrían decir cosas distintas del mismo grupo. Y el
    // fichero de los tipos, a mano, se valida en un sitio (`validarInfiltradores`:
    // nunca el tipo por defecto, o el banco cambia). Roto a mano: un
    // `hasTrait(u, 'infiltrarse')` en `ai/strategy.ts` y un `import i from
    // '../../data/infiltradores.json'` en `contract/serialize.ts` salen rojos.
    const RASGO = [ruta('src/core/types.ts'), ruta('src/core/hero/infiltracion.ts')];
    const todos = [...CORE, ...CLIENTE, ...SERVIDOR];
    // Con comillas simples, como se escribe en el código (biome): la prosa del
    // agente lo nombra entre dobles dentro de su plantilla, y eso no es leerlo.
    const lee = /'infiltrarse'/;
    expect(
      infractoresDeCodigo(
        todos.filter((r) => !RASGO.includes(r)),
        lee,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/core/hero/infiltracion.ts')], lee)).not.toEqual([]);

    // Los tipos, en `core/data.ts` hasta la fase N de la reorganización (07-11-2026).
    const PUERTA = ruta('src/core/hero/tipos-de-heroe.ts');
    const importa = importaDe(/[^'"]*data\/infiltradores\.json/);
    expect(
      infractoresDeCodigo(
        todos.filter((r) => r !== PUERTA),
        importa,
      ),
    ).toEqual([]);
    expect(infractoresDeCodigo([PUERTA], importa)).not.toEqual([]);
  });
});
