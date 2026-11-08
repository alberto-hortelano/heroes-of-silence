# QA de la reorganización de la arquitectura

Rama `claude/codebase-architecture-refactor-3c18fa`, HEAD `22080bd8`, base `f44bc018`. QA del 08-11-2026,
contra la petición literal del usuario (06-11-2026): «Analiza la base de codigo […] Plantea mejoras,
elimina codigo muerto, unifica y aplica las mejoras que consideres oportunas […]», con sus decisiones de
`requisitos.md`. No se ha cambiado código ni se ha commiteado nada; `git status`, limpio al acabar.

CI del PR #309 sobre `22080bd8`: `verify`, `lento` y `qa`, en verde (`gh pr view 309`). Por eso no se ha
repetido ningún fichero de test salvo `test/documentacion.test.ts` (1 s), que mira justo el punto 5.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Lo muerto se fue | ✅ cumple, con una reserva previa | `npx tsx tools/qa/exportaciones.ts` → «ninguna exportación sin lector (7.6 s)». Grafo de importaciones propio (TypeScript, `src/`, `tools/`, `test/`): los 34 ficheros sin importador son todos entradas (las tres `entrada.ts`, `ws-server.ts`, `mcp/server.ts` de `.mcp.json`, las CLI de `package.json` y las órdenes `npx tsx …` citadas en `docs/`). `tools/mudanza/` borrado, `core/rpg/` y `tools/gen/` fuera, el build ya no lleva `edificios/`, `efectos/` ni `iconos/` (4 476 ficheros frente a 4 656). La reserva es H1: ~300 MB del build son entradas del taller, ya antes de la reorganización. |
| 2 | Unificado | ✅ cumple, con restos menores | Script propio que compara cuerpos de función normalizados entre ficheros distintos: 0 grupos de ≥ 120 caracteres; con ≥ 50, 4 pares (H3). Las 26 copias de `err instanceof Error ? …` del servidor y `tools/` van por `mensajeDe`; quedan las 10 declaradas de `src/core`. |
| 3 | La arquitectura es más clara | ✅ cumple | Ciclos de importación en ejecución (solo aristas de valor) en `src/` y `tools/`: **0** (Tarjan sobre el grafo). Capas: nada de `src/client` ni `src/core` importa `src/server` ni `tools/`; `core` sin `node:*`, sin DOM y sin `Math.random`; el espectador solo lee de `core/state` `todosALaVista`, `climaDe…` y `pasoOPuebloSiExiste`, igual que en `f44bc018`. Ficheros mayores: `colocar.ts` 3 774 (la excepción declarada), luego `sesion/partida.ts` 1 693 y `state/sitios.ts` 1 543. Antes había ocho por encima de 3 000, `tools/qa/capturas.ts` con 8 321. El mapa del repositorio de `CLAUDE.md` casa con el árbol (H5, H7). |
| 4 | El juego no cambia | ✅ cumple | `pnpm banco`: sha `3ea9e845a18e648e29f59db619bcacecbc100b0ba2438dd5b04e35364e90a0fd`, «ancla: igual». `huella.ts --comparar huella-c4c.json`: las 7 secciones «igual» (48 s). Contra `huella-antes.json`: igual salvo `agente` (84 claves), el cambio declarado de la fase 1, la prosa sin personajes; `flujos` no está en esa referencia. Flujo real en `pnpm dev` (puerto 3197, Playwright sin pantalla): menú, «Nuevo juego», elfos (`data-tema=elfos`), «El mundo», «Jugar sin historia», ayuntamiento, elegir Mago, «Contratar», base con el héroe dentro y 25 500 de oro. **0 errores de consola.** La batalla del mapa con clics reales, `CAPTURAS_SOLO=escritorio pnpm capturas`: exit 0 en 190 s, «sin errores en consola», con la batalla, la rendición, la defensa, el despliegue y el fin de partida. Arena: montar 2 contra 2, desplegar («Listo»), tres ruedas de respuesta abiertas y elegidas con teclas, 0 errores; editar la ficha sin guardar (Ataque 12 → final 15). Espectador contra `pnpm partida` en 9896/9897: mapa, jugadores, crónica y fin, 0 errores. |
| 5 | `CLAUDE.md` y los docs | ✅ cumple | 39 487 bytes. `test/documentacion.test.ts`: 5/5 en verde. De las 2 870 citas entre comillas invertidas del `CLAUDE.md` anterior (`39e05f94^`), todas salvo 4 están hoy en `CLAUDE.md`, `docs/areas/`, `calidad.md`, `banco.md`, `historia.md` o `docs/art/`; las 4 que faltan son rutas renombradas. Las preguntas típicas llegan, ver abajo. |
| 6 | Las órdenes documentadas arrancan | ✅ cumple | Exit 0: `pnpm qa` (2,4 s), `pnpm taller estado`, `pnpm taller ayuda`, `pnpm mundo validar prueba`, `pnpm mundo leer prueba`, `pnpm npcs estado`, `pnpm marcas lista`, `barrido-semillas.ts` (0/4 sin terminar), `navegador/neutro.ts` (0 diferencias), `medidas/enfrentamiento.ts 200`, `medidas/arena-ia.ts`, `medidas/rectitud.ts --bloque 1 100`, `qa/ancla-paneles.ts` y `npx vite build`. `pnpm taller catalogo-escena`, `derivar-muralla-batalla`, `derivar-recinto`, `derivar-muros` y `piezas-de-tema` reescriben lo derivado **byte a byte igual** (`git status` limpio). Salen 1, de antes: `pnpm mundo medir ejemplo` (H4) y `tools/art/poses/cli.ts` sin argumentos (H8). |
| 7 | Pasada adversarial | ✅ cumple, con hallazgos menores | Build de producción servido estático (`python3 -m http.server`, 3198): `/`, `/arena/`, `/espectador/` y `/?seed=5&faccion=orkos&heroe=orko`, sin ningún 404 y sin errores, salvo el WebSocket rechazado del espectador sin servidor, que es lo esperado. Puente MCP: un cliente MCP propio lanza el `command`/`args` de `.mcp.json` y lista y llama a `heroes_listen`/`heroes_respond` contra el servidor. `"derivadoPor"`/`"renderer"` de `assets/` y `data/`: toda ruta existe. Rutas `tools/…`/`src/…` en `package.json`, `ci.yml`, `.mcp.json`, `biome.jsonc` y `.claude/`: todas existen. `ssrLoadModule` de los cuatro plugins de `tools/vite/`: sus ficheros existen. `RAIZ`, uno en `tools/comun/raiz.ts` (`../..`), el de `test/comun.ts` y el de `revision/datos.py` (`../../..`): bien. Lo que no está bien son los comentarios del código (H2). |

### Las preguntas de una sesión nueva, solo con `CLAUDE.md` y lo que enlaza

| Pregunta | Camino | ¿Llega? |
|---|---|---|
| ¿Dónde se decide quién dispara? | «La batalla», fila «Quién dispara y cuántos tiros»: `tiroADistanciaDe`, `disparosDe` (`battle/armas.ts`) | ✅ `src/core/battle/armas.ts:37` y `:153` |
| ¿Cómo pruebo el arte de una unidad? | «Control de calidad», fila `verify:lento` («el arte de una unidad, una vez»), que manda a `docs/calidad.md` | ✅ `docs/calidad.md:105`, con `taller-8d.test.ts -t <id>`, `clips-por-unidad.test.ts` y `arte-hojas.test.ts -t <id>` (dos saltos) |
| ¿Qué orden mide la rectitud? | «Control de calidad»: `tools/qa/medidas/rectitud.ts` | ✅ existe y arranca |
| ¿Dónde vive la regla de la guarnición? | «La partida»: `guarnicionDe`, `repartir`, `intercambioBlocker` (`state/sitios.ts`); el detalle, en «Áreas» → `docs/areas/partida.md` | ✅ `sitios.ts:657`, `:800`, `:976`; `partida.md:45` |
| ¿Dónde se valida un mundo? | «Los mundos y la gente»: `problemasDelMundo` (`mundo/validar.ts`) | ✅ |
| ¿Qué leo antes de tocar `src/core/map/`? | Tabla «Áreas» → `docs/areas/mapa.md` | ✅ |

## Hallazgos

Ordenados de más a menos grave. Ninguno es bloqueante y ninguno cambia el juego.

### H1. Importante, de antes de la reorganización: ~300 MB del build son entradas del taller que el cliente no pide

`vite build` copia `assets/unidades/_poses/unidades/` (45 maniquíes por unidad con su `*.profundidad.png`,
`giro.png` y `poses.json`: **294 MB**) y `_poses/gente/` (6,3 MB) a `dist`. El build entero pesa 765 MB.
El cliente solo pide `/unidades/_poses/<juego>-8d/dN-{a,b,c}.png` de las 13 claves de `atlas-8d.json`
(`src/client/render/figuras/personajes.ts:302-304`). Nadie en `src/` nombra `_poses/unidades` ni
`_poses/gente`. La regla `SOLO_DEL_TALLER` (`tools/vite/publico.ts:45`) no los filtra, y contradice
`CLAUDE.md:58` («`vite build` copia `assets/` sin lo que solo lee el taller»). Era igual en `f44bc018`
(`tools/build/publico.ts:43`, el mismo regex; `dist-antes.txt` daba también 616 MB de `unidades`), así que
no es una regresión. Pero es lo que pedía el criterio 2 de `requisitos.md` («arte que el cliente no pinta
[…] fuera del build»), y es la mayor bolsa de lo muerto que queda.

- Reproducir: `npx vite build --outDir /tmp/d --emptyOutDir && du -sh /tmp/d/unidades/_poses/unidades /tmp/d/unidades/_poses/gente`.
- Lo que esperaba quien despliega: que `dist` lleve solo lo que la página pide.

### H2. Menor, de la reorganización: comentarios del código que citan ficheros que ya no existen

`test/documentacion.test.ts` vigila las rutas de los docs, pero no las de los comentarios del código, y las
mudanzas no los reescribieron:

- **74 líneas en 52 ficheros** citan `invariantes.test.ts`, repartido en cinco en `33735466`. Son 67 en
  `src/`, la mayoría «lo vigila `test/invariantes.test.ts`». Los más cargados: `src/core/types.ts` (7),
  `src/core/equipo/pieza.ts` (5), `src/core/state/sitios.ts` (4) y `src/core/battle/types.ts` (4).
  Quien quiera ver el guardia no sabe en cuál de los cinco está. Las de `test/codigo-del-repo.ts:17` y
  `test/hojas-de-estilo.ts:3` son históricas y valen.
- `src/core/arena.ts`, que hoy es la carpeta `src/core/arena/`: `src/shared/arte.ts:194` y
  `tools/taller/unidades.ts:48`.
- `src/client/render/personajes.ts`, que hoy es `render/figuras/personajes.ts`: en
  `tools/vite/publico.ts:24` y en la cadena que `tools/taller/poses-8d.ts:385` escribe en el `_comment` de
  `assets/unidades/_poses/atlas-8d.json` («Lo lee el cliente (render/personajes.ts)»).
- `src/core/ai/fuerza.ts`, que hoy es `src/core/hero/fuerza.ts`: `tools/qa/medidas/calibrar-fuerza.ts:21`
  y `tools/qa/medidas/cifras-del-catalogo.ts:10`.
- `src/core/npcs.ts`, que hoy es `src/core/gente/banco.ts`: `tools/npcs/banco.ts:4`.
- `core/data.ts`, repartido en N: `tools/arena/borrador.ts:4`.

Reproducir: `grep -rnE "invariantes\.test\.ts" src tools --include=*.ts | grep -vE "invariantes-(capas|batalla|partida|datos|cliente)"`.

### H3. Menor: duplicados idénticos que quedan, todos de antes

- **Una regla del núcleo escrita dos veces**: `minimoDe` (las casillas mínimas de un tipo de barrera, y
  la muralla con `CASILLAS_DE_UNA_MURALLA`), en `src/core/map/generar/vestir-la-red.ts:1180` y en
  `src/core/map/vestir/fronteras.ts:899`, con el mismo cuerpo. Ya estaba repetida en
  `generate.ts:3093` y `vestir.ts:1078`. Va contra «un hecho, un sitio».
- La mediana «alta» (`o[⌊n/2⌋]`) está en `tools/taller/derivar.ts:197` y en `tools/taller/empaquetar.ts:600`,
  idénticas entre sí. Para una lista no vacía dan lo mismo que la `mediana` de `tools/comun/estadistica.ts:21`,
  que creó H1b y que ellas no usan. `tools/qa/medidas/rios.ts:302` tiene otra variante, que devuelve 0
  con la lista vacía.
- `enLienzo`, idéntico en `src/client/arena/puntero.ts:9` y en `src/client/partida/puntero.ts:11`.
  `marcadoDe`, idéntico en `src/client/arena/cambios.ts:349` y en `src/client/arena/magia.ts:533`.

### H4. Menor, de antes: el mundo `ejemplo`, que se commitea, no vale

`pnpm mundo validar ejemplo` y `pnpm mundo medir ejemplo` salen 1: «el grupo de asaltantes de (38,10)
suma 356.47… de fuerza y un grupo de asaltantes lleva como mucho 310». Lo mismo dice del grupo de
(3,31). El techo bajó a 310 el 03-11 (`a07d8945`), después de generar `ejemplo` (`3a883ff8`, 23-10), así
que `?mundo=ejemplo` no se juega. La reorganización no lo tocó. Lo que se esperaba: que el mundo de
muestra se juegue, o que se regenere.

### H5. Menor, de la doc: diez rutas de «Puertas únicas» no siguen su convención

`CLAUDE.md:193` dice que las rutas son relativas a `src/core/` o a `src/client/`. Diez no lo son: son
relativas a una subcarpeta. Son `colocar/{pisable,sprite,tablas}.ts` y `recinto/{anillo,octogono,orden}.ts`
(de `src/client/render/escenario/`), `generar/{construir,poblar,validar}.ts` y `vestir/base.ts` (de
`src/core/map/`). Se encuentran con un `find` y el guardia las acepta, pero quien siga la regla escrita
no las encuentra a la primera.

### H6. Menor, de antes: en el montaje de la arena, la ficha abierta en la columna del bando es una ventana de unos 70 px con scroll propio

Se ve en `cap/f1-ficha-editada.png` de esta pasada y es igual en `.cache/reorganizacion/antes-1/arena-01-montaje.png`.
Se lee la fila de Ataque y media de Fuerza, y el resto pide desplazar dentro de una caja diminuta. No es
de la reorganización: es experiencia.

### H7. Trivial

- `assets/rpg/campo.webp` y `ARTE_RPG`/`asset('rpg', 'campo')` (`src/client/render/assets.ts:84-197`):
  el fondo de batalla sigue bajo el nombre `rpg` después de retirar el RPG. Es arte vivo y solo cuenta el
  nombre.
- `tools/build/` está vacío en este worktree desde las 11:47 del 08-11, cuando H2b se llevó `publico.ts` a
  `tools/vite/`. No está en git y no llega al PR.

### H8. Trivial, de antes: `npx tsx tools/art/poses/cli.ts` sin argumentos lanza «perfil desconocido «undefined»»

La frase era la misma en `f44bc018:tools/art/poses.ts:2166`. Falla diciéndolo, pero «undefined» no le
dice a la persona que falta el argumento.

## Workarounds usados

- Lancé el espectador contra `pnpm partida` en mis puertos (9896/9897) con un cliente MCP mínimo propio
  (`StdioClientTransport` con el `command`/`args` de `.mcp.json`) en lugar de una sesión de Claude Code.
  La primera vez mandé `response` como objeto y no como texto; el esquema lo rechazó y la partida la
  acabó el servidor. No afecta a quien juega: es mi agente de prueba, y lo que se probaba eran la ruta de
  `.mcp.json` y el pintado del espectador.
- La batalla del mapa se jugó con la pasada `escritorio` de `pnpm capturas`, con clics reales y su
  semilla, y no con mi propio script desde `/`. Mi script llegó hasta el héroe contratado en la base. No
  enmascara nada de quien juega: es el mismo flujo, solo que con la semilla de la pasada.
- La ficha de la arena se abrió con «Editar» del bando y no con «Editar fichas». Son los dos caminos de
  la página.

## No probado

- `pnpm verify`, `verify:lento` y `pnpm capturas` enteros: los corren CI y la fase Z, y CI está en verde
  sobre `22080bd8`.
- `tools/fuentes/bajar.ts`: descarga de Google Fonts y no pedí permiso.
- `tools/datos/{facciones,habilidades,tipos-de-heroe}.ts`: necesitan `NuevaJugabilidad.md`, que no se
  commitea.
- El motor de mundos («Generar el mundo»), `pnpm npcs trabajar` y las órdenes del taller que llaman a
  Codex: son de pago o lanzan Codex, y no se lanzan.
- `navegador/clima.ts` y `navegador/temas-con-piezas.ts`: tienen fallos conocidos y tardan mucho.
- `medidas/enfrentamiento.ts --contra f44bc018`: lanza al cargar la táctica vieja (`src/core/data.js` no
  existe). Su cabecera ya dice que `--contra` no llega a antes de N11; es una limitación declarada.
- No miré si la huella de `agente` contra `huella-antes.json` cambia solo en las dos frases de los
  personajes: hacía falta correr el commit de la guardada. Me fío de `implementacion-fase1.md`.

## Veredicto

**Apto con reservas.** Lo pedido está: lo muerto fuera (0 exportaciones sin lector, lo retirado fuera del
código y del build), lo repetido unificado salvo cuatro pares menores, 0 ciclos, ningún fichero por encima
de 2 000 líneas salvo `colocar.ts`, `CLAUDE.md` en 39 KB sin pérdidas medibles y el juego igual (banco,
huella y los tres flujos en el navegador sin un error). Las reservas no bloquean:

- los comentarios con rutas viejas (H2), que deja la propia reorganización;
- `minimoDe` repetido en el núcleo (H3);
- los ~300 MB de entradas del taller en `dist` (H1), de antes, pero es lo muerto más grande que queda.
