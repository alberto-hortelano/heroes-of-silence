/**
 * El cliente: sus capas (las dependencias solo bajan, también las de tipos; ninguna
 * página carga ni nombra otra y el espectador no carga la sesión); la única puerta al
 * núcleo es la sesión y la del marcado, `html.ts`; las escenas de pie solo importan
 * tipos del núcleo y toman la escala del combate; lo que pinta la batalla es lo
 * ocultado; los temas (quién escribe `data-tema`, la forma en `forma.css`, sin colores
 * fijos ni letras a mano); las voces y el clima del narrador, con su único escritor.
 *
 * Los guardias de las fronteras de `CLAUDE.md` vivían en un solo
 * `invariantes.test.ts`; desde la fase T de la reorganización (06-11-2026) van en
 * cinco por frontera —capas, batalla, partida, datos y cliente—, para que tocar un
 * área corra los suyos. Cómo se leen el código y las rutas, y lo que se aprendió
 * escribiéndolos, en `codigo-del-repo.ts`. Cada guardia nace en verde y se ha
 * visto morder.
 */

import { describe, expect, it } from 'vitest';
import {
  aDemandaDe,
  CLIENTE,
  CORE,
  codigoDe,
  esLaSesion,
  ficheros,
  importacionesConLineaDe,
  importacionesDe,
  importaDe,
  infractoresDeCodigo,
  leer,
  lineasDeLasDeclaraciones,
  ruta,
  SERVIDOR,
  tiposPorImportDe,
} from './codigo-del-repo.js';
import { bloquesCss, COLOR, hojasDelCliente } from './hojas-de-estilo.js';

/**
 * Las hojas del cliente que vigilan los guardias de colores fijos y de la forma
 * de los temas: todas las del disco menos `temas.css`, que solo lleva fichas (y
 * vigila `temas.test.ts`). Del disco y no de una lista: una hoja nueva no se
 * libra sin que nadie lo note.
 */
const HOJAS_CON_REGLAS = hojasDelCliente().filter((r) => r !== ruta('src/client/temas.css'));

describe('invariantes del proyecto', () => {
  it('el cliente no aplica reglas: la única puerta al núcleo es la sesión (`sesion/`)', () => {
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
    // nombra, no. La puerta era `session.ts` hasta la fase C de la reorganización
    // (07-11-2026); ahora es la carpeta `sesion/` sin sus vistas (`esLaSesion`).
    const puertas =
      /\b(applyAdventureAction|applyAction|resolvePendingBattle|settleBattle|playAiTurn|chooseBattleAction|newGame|retocarEnBatalla)\b/;
    const fuera = CLIENTE.filter((r) => !esLaSesion(r));
    expect(infractoresDeCodigo(fuera, puertas)).toEqual([]);
  });

  it('las capas del cliente: comun ← render ← sesion ← views ← batalla ← las páginas, también para un tipo; ninguna página carga ni nombra otra y el espectador no carga la sesión', () => {
    // Las dependencias del cliente solo bajan (fase C de la reorganización,
    // 07-11-2026): `comun/` (lo que comparten las tres páginas) ← `render/` (pinta en el
    // lienzo) ← `sesion/` (la puerta al núcleo) ← `views/` (el marcado común) ←
    // `batalla/` (la pelea en pantalla) ← las páginas: la partida (`partida/`, con
    // `main.ts` y `entrada.ts` de la raíz), la arena, el espectador y las herramientas
    // de `pnpm dev` (`desarrollo/`). Ninguna página carga ni nombra otra, y el
    // espectador no carga nada de `sesion/`, ni de lejos: no aplica reglas, y la sesión
    // le traería el motor de la partida entero. Hasta C3 subían ocho: `views/panels.ts`,
    // que era lo común y la partida a la vez, importaba los paneles de cinco pantallas
    // de la partida (tres lo importaban a él), los botones de la pelea y
    // `COMO_SE_COLOCA` de `batalla/colocar.ts`, que importaba también la sesión. Y el
    // espectador cargaba `sesion/dichos.ts` por la crónica.
    //
    // Mira lo que se carga: los `import` y `export … from` de valor y los `import 'x'`
    // (`importacionesConLineaDe`) y los `import()` (`aDemandaDe`). Y, desde C3b, lo que
    // solo se nombra: los `import type` y `export type … from` (`importacionesConLineaDe`
    // con los tipos), y los tipos de otro módulo sin importarlo, `typeof import('…')` o
    // `import('…').X` (`tiposPorImportDe`); un `import { type X }` ya contaba, porque se
    // queda en el JavaScript como `import {}` y carga el módulo. Un tipo de la capa de
    // arriba también ata: quien lo nombra no compila sin ella. Hasta C3b nombraba uno,
    // `render/batalla.ts` (`EstadoFigura` y `Efecto`, que vivían en `batalla/anim.ts` y
    // hoy en `render/batalla/tablero.ts`).
    //
    // La única excepción, escrita: `desarrollo/` puede nombrar **tipos** de `partida/`
    // (hoy `marcas.ts` y `regiones.ts`, la `EscenaAventura` que marcan y miran): las
    // herramientas de desarrollo son de la página de la partida y solo se cargan en
    // ella, por sus `import()` (el de `main.ts` y el del menú de inicio). Un valor de la
    // partida, o un tipo de otra página, no. Lo que entra en `desarrollo/` desde fuera no se mira: lo gobierna «las
    // herramientas de desarrollo solo entran por `import()` tras
    // `HERRAMIENTAS_DE_DESARROLLO`» (invariantes-capas), que deja los `import type`. Una
    // carpeta del cliente sin capa rompe el guardia, que pide ponerla aquí.
    const CLIENTE_ = `${ruta('src/client')}/`;
    const DESARROLLO = `${ruta('src/client/desarrollo')}/`;
    const CAPAS = ['comun', 'render', 'sesion', 'views', 'batalla'] as const;
    const PAGINAS: readonly string[] = ['partida', 'arena', 'espectador', 'desarrollo'];
    /** Su capa (0, la de abajo; las páginas, encima de todas) y su página, si es de una. */
    const capaDe = (r: string): { readonly nivel: number; readonly pagina: string | null } => {
      const resto = r.slice(CLIENTE_.length);
      // `main.ts` y `entrada.ts`, en la raíz: la partida, que es la página de la raíz.
      const carpeta = resto.includes('/') ? (resto.split('/')[0] as string) : 'partida';
      const nivel = (CAPAS as readonly string[]).indexOf(carpeta);
      if (nivel >= 0) return { nivel, pagina: null };
      if (PAGINAS.includes(carpeta)) return { nivel: CAPAS.length, pagina: carpeta };
      throw new Error(
        `${r}: la carpeta «${carpeta}» del cliente no tiene capa: dile a este guardia en cuál va`,
      );
    };
    const suben: string[] = [];
    const entrePaginas: string[] = [];
    const miradas = new Map<string, number>();
    let deSoloTipos = 0;
    for (const de of CLIENTE) {
      const desde = capaDe(de);
      // Las de valor, por su línea: las demás de `importacionesConLineaDe` con los tipos
      // son de solo tipos.
      const deValor = new Set(importacionesConLineaDe(de).map((i) => `${i.linea} ${i.ruta}`));
      const todas = [
        ...importacionesConLineaDe(de, true).map((i) => ({
          ...i,
          soloTipos: !deValor.has(`${i.linea} ${i.ruta}`),
        })),
        ...aDemandaDe(de).map((i) => ({ ...i, soloTipos: false })),
        ...tiposPorImportDe(de).map((i) => ({ ...i, soloTipos: true })),
      ];
      for (const { ruta: a, linea, soloTipos } of todas) {
        if (!a.startsWith(CLIENTE_) || !a.endsWith('.ts')) continue;
        if (a.startsWith(DESARROLLO) && !de.startsWith(DESARROLLO)) continue;
        const hacia = capaDe(a);
        const donde = hacia.pagina ?? (CAPAS[hacia.nivel] as string);
        miradas.set(donde, (miradas.get(donde) ?? 0) + 1);
        if (soloTipos) deSoloTipos++;
        const dicho = `${de}:${linea} → ${a}${soloTipos ? ' (solo tipos)' : ''}`;
        if (hacia.nivel > desde.nivel) suben.push(dicho);
        else if (desde.pagina !== null && hacia.pagina !== null && hacia.pagina !== desde.pagina) {
          // La excepción de arriba: tipos de la partida en sus herramientas.
          const herramientaDeLaPartida =
            soloTipos && desde.pagina === 'desarrollo' && hacia.pagina === 'partida';
          if (!herramientaDeLaPartida) entrePaginas.push(dicho);
        }
      }
    }
    expect(suben).toEqual([]);
    expect(entrePaginas).toEqual([]);
    // El espectador, ni de lejos: lo que carga su página desde su entrada, al
    // evaluarse (`importacionesDe`) y a demanda (su `main.ts` va por un `import()`).
    const ENTRADA = ruta('src/client/espectador/entrada.ts');
    const deDonde = new Map<string, string | null>([[ENTRADA, null]]);
    const pendientes = [ENTRADA];
    while (pendientes.length > 0) {
      const actual = pendientes.shift() as string;
      for (const m of [...importacionesDe(actual), ...aDemandaDe(actual).map((x) => x.ruta)]) {
        if (!m.endsWith('.ts') || deDonde.has(m)) continue;
        deDonde.set(m, actual);
        pendientes.push(m);
      }
    }
    const cadena = (m: string): string => {
      const pasos: string[] = [];
      for (let x: string | null | undefined = m; x != null; x = deDonde.get(x)) pasos.unshift(x);
      return pasos.join(' → ');
    };
    const SESION = `${ruta('src/client/sesion')}/`;
    expect([...deDonde.keys()].filter((m) => m.startsWith(SESION)).map(cadena)).toEqual([]);
    // Y que mire algo: cada capa y cada página recibe importaciones, también a demanda
    // (la entrada de la partida carga su `main.ts` con un `import()`), se miran las de
    // solo tipos (cien o más: 135 al escribirlo) y el espectador llega a lo común de la
    // pelea: la crónica, el parte y el animador.
    for (const donde of [...CAPAS, ...PAGINAS])
      expect(miradas.get(donde) ?? 0, donde).toBeGreaterThan(0);
    expect(deSoloTipos).toBeGreaterThanOrEqual(100);
    expect(aDemandaDe(ruta('src/client/entrada.ts')).map((x) => x.ruta)).toContain(
      ruta('src/client/main.ts'),
    );
    for (const r of [
      ruta('src/client/views/cronica.ts'),
      ruta('src/client/batalla/parte.ts'),
      ruta('src/client/batalla/anim.ts'),
    ])
      expect(deDonde.has(r), r).toBe(true);
  });

  it('el cliente no conoce al servidor: nada de `src/client` ni de `src/shared` importa `src/server`, ni un tipo', () => {
    // La otra cara de «`core` no conoce al servidor» (invariantes-capas). El
    // espectador pinta lo que le manda el servidor, y hasta la fase S de la
    // reorganización (07-11-2026) tomaba de `src/server/` lo que viaja por el cable:
    // la vista (`vista-espectador.ts`) y el mensaje (`protocol.ts`), en seis ficheros.
    // Eran solo tipos, pero la página no compilaba sin el servidor, y lo siguiente que
    // se importara de allí podía ser un valor, con `ws` y `node:` detrás. El cable vive
    // desde entonces en `src/shared/cable-del-espectador.ts`, que leen los dos lados; y
    // `shared` tampoco importa el servidor, porque lo lee el cliente: por ahí volvería.
    //
    // Mira lo que se carga (`importacionesConLineaDe`, `aDemandaDe`) y lo que solo se
    // nombra: `import type`, `export type … from` y los tipos de otro módulo sin
    // importarlo, `typeof import('…')` o `import('…').X` (`tiposPorImportDe`), con la
    // ruta resuelta y no escrita (un relativo a cualquier profundidad).
    const SERVIDOR_ = `${ruta('src/server')}/`;
    const COMPARTIDO = ficheros(ruta('src/shared'));
    const alServidor = [...CLIENTE, ...COMPARTIDO].flatMap((de) =>
      [...importacionesConLineaDe(de, true), ...aDemandaDe(de), ...tiposPorImportDe(de)]
        .filter((i) => i.ruta.startsWith(SERVIDOR_))
        .map((i) => `${de}:${i.linea} → ${i.ruta}`),
    );
    expect(alServidor).toEqual([]);
    // Y que mire algo: el espectador nombra el cable en `shared`, y el servidor que lo
    // escribe, también; `shared` está en lo mirado.
    const cable = ruta('src/shared/cable-del-espectador.ts');
    const nombra = (de: string): string[] => importacionesConLineaDe(de, true).map((i) => i.ruta);
    expect(nombra(ruta('src/client/espectador/adaptar.ts'))).toContain(cable);
    expect(nombra(ruta('src/server/vista-espectador.ts'))).toContain(cable);
    expect(COMPARTIDO).toContain(cable);
  });

  it('el marcado sale por una sola puerta: solo `html.ts` convierte texto en DOM', () => {
    // El cerrojo de verdad de #63 es de TIPOS: `pintar` solo acepta `Html` y las
    // funciones de `views/` y de cada página lo devuelven, así que una nueva que
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
    // docstrings de `html.ts`, de `main.ts` y de `contract/formato.ts` nombran
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
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter(
      (r) => r !== ruta('src/client/comun/html.ts'),
    );
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
    const SITIOS_CON_PERMISO = [
      ruta('src/client/comun/html.ts'),
      ruta('src/client/render/assets.ts'),
    ];
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
    // Desde el 02-11-2026 la tropa es el tablero de despliegue: su escena pinta la
    // batalla de la formación que le da la sesión (`vistaDeLaTropa`) y coloca por
    // ella (`Session.formacion`); el semicírculo de `render/tropa/` se fue. Roto a
    // mano: un `import { hexEquals } from '@core/battle/board.js'` en
    // `escenas/tropa.ts`, rojo.
    // Hasta la fase C de la reorganización (07-11-2026), las escenas eran
    // `escenas/{de-pie,tropa,morada}.ts`, lo que pinta las de pie, `render/de-pie.ts`, y
    // la fila de la morada, `render/morada/fila.ts`; ahora la fila entra con `render/base/`.
    const base = CLIENTE.filter(
      (r) =>
        r.startsWith(ruta('src/client/render/base/')) ||
        r === ruta('src/client/render/figuras/de-pie.ts') ||
        r === ruta('src/client/partida/de-pie.ts') ||
        r === ruta('src/client/partida/tropa/escena.ts') ||
        r === ruta('src/client/partida/morada/escena.ts'),
    );
    expect(base.filter((r) => r.includes('tropa'))).toEqual([
      ruta('src/client/partida/tropa/escena.ts'),
    ]);
    expect(base.filter((r) => r.includes('morada') || r.includes('de-pie')).length).toBe(3);
    expect(base).toContain(ruta('src/client/render/base/fila.ts'));
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
    // La escena de la tropa (02-11-2026, el tablero de despliegue) va a la escala
    // del combate porque es el tablero de la batalla (`tableroPara`), y tampoco
    // puede fijar su propio alto de figura. La cámara de la base y la zancada de quien
    // camina por ella viven desde R5 de la reorganización (07-11-2026) en
    // `partida/caminante.ts`, que comparten la base y los lugares.
    const base = CLIENTE.filter(
      (r) =>
        r.startsWith(ruta('src/client/render/base/')) ||
        r === ruta('src/client/partida/base/escena.ts') ||
        r === ruta('src/client/partida/caminante.ts') ||
        r === ruta('src/client/render/figuras/de-pie.ts') ||
        r === ruta('src/client/partida/de-pie.ts') ||
        r === ruta('src/client/partida/tropa/escena.ts') ||
        r === ruta('src/client/partida/morada/escena.ts'),
    );
    expect(base.length).toBeGreaterThan(11);
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
    // `town/voces.ts` hasta la fase N de la reorganización (07-11-2026).
    const ajenas = escrituras.filter((e) => !e.startsWith(`${ruta('src/core/gente/voces.ts')}:`));
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
    const ajenas = escrituras.filter((e) => !e.startsWith(`${ruta('src/core/state/clima.ts')}:`));
    expect(ajenas).toEqual([]);
    expect(escrituras).toHaveLength(1);
  });

  it('la escena y los paneles leen la batalla ya ocultada; la entera, solo el animador (02-11-2026)', () => {
    // En el despliegue, el defensor no ve al atacante: lo que pintan, señalan y
    // pulsan la escena y los paneles sale de `batallaALaVista`, la única puerta
    // (`ControlDeBatalla` ya no lleva `battle`). La batalla entera la lee solo
    // `EscenaBatalla.batallaQueSeCuenta`, para el animador. Roto a mano
    // (02-11-2026): un `this.sesion().batallaEntera` en `unidadEn` sale rojo con su
    // línea, y `renderBattlePanel` leyendo `session.battle`, también.
    const ESCENA = ruta('src/client/batalla/escena.ts');
    const lecturas = infractoresDeCodigo(
      CLIENTE.filter((r) => !esLaSesion(r)),
      /\.batallaEntera\b/,
    );
    const permitidas = lineasDeLasDeclaraciones(ESCENA, ['EscenaBatalla']);
    expect(lecturas.map((l) => l.split(' → ')[0])).toEqual([
      expect.stringMatching(new RegExp(`^${ESCENA}:\\d+$`)),
    ]);
    const linea = Number(lecturas[0]!.split(' → ')[0]!.split(':')[1]);
    expect(permitidas.has(linea)).toBe(true);
    const quien = codigoDe(ESCENA).split('\n');
    const metodo = quien
      .slice(0, linea)
      .reverse()
      .find((l) => /^ {2}(private )?\w+\(/.test(l));
    expect(metodo).toMatch(/batallaQueSeCuenta\(/);
    // Los paneles de la partida y de la arena no leen la batalla de la sesión. Eran
    // `views/panels.ts` y `arena/paneles.ts` hasta la fase C de la reorganización
    // (07-11-2026); desde entonces se miran todos: lo común (`views/`), el panel, el
    // parte y los botones de la batalla (`batalla/`), los de la partida (`paneles.ts`,
    // `ejercito.ts` y el `panel.ts` de cada pantalla) y los de la arena.
    const BATALLA = [
      ruta('src/client/batalla/panel.ts'),
      ruta('src/client/batalla/parte.ts'),
      ruta('src/client/batalla/poderes.ts'),
      ruta('src/client/partida/paneles.ts'),
      ruta('src/client/partida/ejercito.ts'),
    ];
    const PARTIDA = `${ruta('src/client/partida')}/`;
    const paneles = CLIENTE.filter(
      (r) =>
        r.startsWith(ruta('src/client/views/')) ||
        r.startsWith(ruta('src/client/arena/paneles/')) ||
        BATALLA.includes(r) ||
        (r.startsWith(PARTIDA) && r.endsWith('/panel.ts')),
    );
    expect(infractoresDeCodigo(paneles, /\b(session|s)\.battle\b/)).toEqual([]);
    // Y que mire algo: los seis de lo común, los cinco de arriba, el de cada pantalla de
    // la partida y los seis de la arena.
    expect(paneles.length).toBeGreaterThanOrEqual(23);
    expect(paneles).toContain(ruta('src/client/partida/mapa/panel.ts'));
    expect(paneles).toContain(ruta('src/client/arena/paneles/batalla.ts'));
  });

  it('la pieza que pinta el clima no lee la sesión: le dan el clima del sitio', () => {
    // `render/clima/` la llaman el mapa, la batalla y cualquier escena lateral
    // (la base, la morada y las del «mapa vivo»): si leyera la sesión de la
    // partida, la arena y el espectador, que no la tienen, no podrían usarla.
    // Roto a mano: un `import type { Session } from '../../session.js'` en
    // `render/clima/clima.ts` sale rojo. Desde la fase C de la reorganización
    // (07-11-2026) la sesión es la carpeta `sesion/`: el patrón casa las dos.
    const pieza = CLIENTE.filter((r) => r.startsWith(ruta('src/client/render/clima/')));
    expect(pieza.length).toBeGreaterThanOrEqual(4);
    expect(infractoresDeCodigo(pieza, importaDe(/[^'"]*sess?i[oó]n/))).toEqual([]);
  });

  it('el tema de la interfaz lo pone `ponerTema`: nadie más escribe `data-tema`', () => {
    // Un `data-tema` escrito por otro sitio no borraría lo que el lienzo leyó del
    // tema anterior (`temaDelLienzo`, en caché): CSS de un tema y chapas de otro.
    // Por `dataset`, por `setAttribute` (que ya vigila la puerta del marcado) y
    // borrándolo. Roto a mano: un `document.documentElement.dataset.tema = 'elfos'`
    // en `arena/main.ts` sale rojo con su línea.
    const escribeElTema =
      /dataset\s*(?:\.\s*tema|\[\s*['"`]tema['"`]\s*\])\s*=(?!=)|delete\s+[\w.]*dataset\s*\.\s*tema\b|['"`]data-tema['"`]/;
    const fuera = [...CORE, ...CLIENTE, ...SERVIDOR].filter(
      (r) => r !== ruta('src/client/comun/temas.ts'),
    );
    expect(infractoresDeCodigo(fuera, escribeElTema)).toEqual([]);
    expect(infractoresDeCodigo([ruta('src/client/comun/temas.ts')], escribeElTema)).not.toEqual([]);
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
    const deForma = bloquesCss(leer(ruta('src/client/forma.css')));
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
    const lienzoDelJuego = CLIENTE.filter((r) => !r.startsWith(ruta('src/client/desarrollo/')));
    expect(infractoresDeCodigo(lienzoDelJuego, familiaEscrita)).toEqual([]);
    // Y el guardia mira algo: el lienzo sí pone letras.
    expect(
      infractoresDeCodigo(CLIENTE, /\.font\s*=.*temaDelLienzo\(\)|\.font\s*=.*\btema\.letra/),
    ).not.toEqual([]);
  });
});
