# QA — ruta-sin-motivo (#336)

Código validado: worktree `agent-ae0ee06700e56564d`, rama `worktree-agent-ae0ee06700e56564d`, commit
`cb183cc4`, limpio (no he tocado nada). Mandan «Tras la crítica» y «Tras el plan» de `requisitos.md`.
Capturas, guiones y salidas: `capturas/qa-*` en esta carpeta.

**No repetido, citado del ingeniero** (`implementacion.md`, mismo commit): `pnpm typecheck`,
`pnpm lint`, los 11 ficheros de test tocados (308 + 86 en verde), `pnpm banco` (ancla igual, sin
re-anclar), `pnpm qa` y `tools/qa/exportaciones.ts`. Ni `pnpm verify` ni `pnpm capturas`.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1a | Al señalar una casilla sin camino, la barra dice por qué, con la frase del núcleo al pulsar | ✅ a 1920 / ⚠️ a 380 | 1920: barrera (s1, (10,2) y (3,7)), muralla (s1, (4,7)), «algo que no ves» (s15, (17,13)), asaltantes a la vista (s32 tras dos «Fin de turno», (0,12)). La barra es la frase de `rutaSeñalada`, y la misma tras pulsar (`qa-navegador.log`). A 380 la barra se corta antes del porqué (hallazgo H1). |
| 1b | Con el dedo, al primer toque, y sin «Toca otra vez» | ✅ (con H1) | 380-dedo en los 5 casos: primer toque cortado «… (toca aquí para leer el resto)», y al tocar la barra sale la frase entera (`qa-s*-380-dedo-*-desplegada.png`). Sin «Toca otra vez» en ninguno; con ruta, sí sale (s1 (6,9)). |
| 1c | Sin motivo en la propia casilla, sin héroe y fuera de turno | ✅ propia / ⚠️ los otros dos | Propia (s1 (5,8)): «Aerin del Roble.». Sin héroe y fuera de turno: el turno del rival dura menos de lo que tarda un gesto, así que no los probé en el navegador. Los cubre `test/session.test.ts` (nuevo) y el código (`calcular`, `marcha.ts:143`). |
| 2a | El motivo pasa por la niebla al señalar, al pulsar y en el rechazo del `move_hero` | ✅ | `qa-niebla.mts`, semillas 1-40, 6 momentos de cada partida IA contra IA (0/10/30/70/130/200 turnos), con la partida tal cual y con dos arreglos al azar (rivales y asaltantes plantados en pasos): **66 910 casillas sin camino, 0 fallos**. Oráculo: la `porQueNoLlega` de antes (la de la rama de coordinación, idéntica al padre `d08d77a2`). Para cada casilla, lo que la vieja nombraba y se mira ahora se nombra igual y en el mismo orden. Lo que no se mira no sale ni por nombre ni por casilla, y la frase dice «algo (más) que no ves». Ninguna entidad hostil oculta de la partida, se nombre o no, aparece. 4759 casos con algo hostil: 3018 todo oculto, 1582 mixtos. Por tipo: héroe 362 vistos / 1201 ocultos, guarnición 324 / 2166, asaltantes 1865 / 7482. |
| 2b | La muralla y sus puertas, solo si está explorada | ✅ | En el mismo barrido: 3192 murallas bajo el negro, ninguna con «muralla» ni con nombre de ciudad, y 3247 explorados con la frase intacta. |
| 2c | El rechazo del agente es la misma frase | ✅ | 7336 `move_hero` sin camino por `applyAdventureAction` (lo que el director pasa por `mensajeDe(err)`, `director.ts:477`): todos lanzan, y lanzan exactamente la frase de `porQueNoLlega`. No repetí `pnpm qa`: el del ingeniero no da ningún `move_hero` sin camino, y este barrido sí lo ejercita. |
| 3a | La barrera se ve en el navegador, con la barra estrecha | ✅ con H1 | 1920: la frase entera en una línea (`qa-s1-1920-raton-barrera.png`). 380: cortada, y entera en el `title` del lienzo o al tocar la barra. |
| 3b | El motivo no se calcula en `rutaQueQueda` ni en `pulsar` | ✅ | `grep porQueNoLlega src/client`: una sola llamada, en la rama `conMotivo` de `calcular`. `pulsar` y `rutaQueQueda` siguen con `previewPath`. |
| 4 | `pnpm qa` y `pnpm banco` | ✅ (citados) | Los dos del ingeniero, sobre `cb183cc4`. |
| 5 | La niebla no es un motivo | ✅ | `caminoHasta` no cambia, y bajo el negro el motivo es el del mapa o «algo que no ves», nunca «la niebla». |
| — | Que señalar no se note lento | ✅ | Barrido con el ratón real a 1920 (55 casillas sin camino y 66 con él) y a 380 (14 y 21), con un `PerformanceObserver('longtask')`: **0 tareas largas** en los cuatro. En node, `rutaSeñalada` en el mapa entero de 40 semillas (70 560 casillas) da de media 0,15 ms y de máximo 3,5 ms; con motivo, 0,22 y 3,5 ms. `porQueNoLlega` en partidas avanzadas: media 0,33 ms y máximo ≤ 10 ms con la máquina cargada. Se pide una vez por casilla (`claveRuta`). |
| — | Consola | ✅ | Ningún error ni `pageerror` en las 18 cargas de página. |

## Hallazgos

**H1 (importante, fuera del diff pero en el camino del criterio 1): `ponerEnLaBarra` nunca usa la
segunda línea de la barra.** `noCabe` (`src/client/comun/barra.ts:179`) compara `scrollHeight >
clientHeight`. Con `font: 13px/1.5`, dos líneas de texto miden 39 px y Chromium da `clientHeight
39` y `scrollHeight 40`. Medido en la página, a 380 y a 1024, con «palabra × n»: con 1 línea,
`sh = ch`; con 2, `ch=39 sh=40`; con 3, `ch=39 sh=59`. Así, todo texto de dos líneas «no cabe», y el
corte busca lo que entra en **una** línea con el aviso. A 380, el aviso con ratón (« … (el resto,
con el ratón quieto)», 35 caracteres) ocupa más de media línea. Por eso queda «No hay camino hasta …»,
sin la casilla ni el porqué. Pasa igual con «No hay camino hasta (0,12): lo cierra un grupo de
asaltantes en (2,13).» (72 caracteres, que caben enteros en dos líneas) y con «Tierras desconocidas ·
No …» (`qa-s32-380-raton-visto.png`, `qa-s15-380-raton-oculto.png`). A 1024 también se corta en una
línea: «… sin cruzar una barrera: …».
- Reproducir: `pnpm dev`, `/?seed=1&heroe=<el de por defecto>` a 380 × 800 con ratón, salir de la
  base y pasar el ratón por (3,7), la montaña a la izquierda del castillo. Quien juega esperaba leer
  por qué no llega.
- **Es un fallo de `ponerEnLaBarra`, no de esta tarea, y recomiendo arreglarlo aquí:** es una línea,
  y esta tarea es la que pone frases largas en la barra estrecha. El arreglo: `noCabe` con un píxel
  de holgura para el redondeo, `return el.scrollHeight > el.clientHeight + 1;`. Lo emulé sin tocar
  el código, con `#status { min-height: 40px }`, y la barra pasa a decir:
  - a 380: «No hay camino hasta (3,7) sin cruzar una barrera: solo la cruza un grupo que se … (el resto,
    con el ratón quieto)» (`qa-s1-380-raton-barrera-cerca-holgura.png`);
  - a 1024: «… solo la cruza un grupo que se infiltra … (el resto…)».
  Hay que mirar con él la batalla (4 líneas, `#264`), que seguramente pierde la cuarta por lo mismo,
  y su test de `barra` en el navegador. Si no se arregla aquí, que sea un issue de interfaz.
- Lo que no arregla: a 380 la barra está en su propia fila (`#statusbar { flex-wrap: wrap }`) y crece
  con el texto, así que con la holgura usa dos líneas. No hace falta tocar el CSS.

**H2 (menor): la barrera bajo el negro dice el relieve.** «Tierras desconocidas · No hay camino hasta
(10,8) sin cruzar una barrera: …» (s1, `qa-s1-1920-raton-barrera-negro.png`). Ya lo dice el plan
(§6, «una issue»), pero `implementacion.md` dice que no se ha abierto. Ahora sale al señalar, sin
gastar el clic: hay que abrir el issue.

**H3 (menor, redacción): con lo visto y lo oculto juntos sale «y … y».** «lo cierran un grupo de
asaltantes en (7,16) y un grupo de asaltantes en (14,25) y algo más que no ves». Sería «A, B y algo
más que no ves»: `enumerar([...vistos, 'algo más que no ves'])`. Lo fija tal cual
`test/game.test.ts:1728/1784` (con un solo visto, que se lee bien). La prosa del agente
(`mapa-conocido.ts`) tampoco nombra la variante «y algo más que no ves».

**Aceptado, no es hallazgo:** señalar revela que *algo* cierra un paso, sin qué ni dónde
(`qa-s15-1920-raton-oculto.png`, sobre el negro). Es el encuadre aprobado. Antes, el vacío de la ruta
ya decía que no había camino.

## Workarounds usados

- **Pasar dos días** en s32 con «Fin de turno» de verdad, para tener asaltantes a la vista. Es el
  flujo real.
- **Arrastrar el mapa** hasta la casilla (`Mapa.arrastrar`, un gesto real) cuando caía fuera de
  pantalla. Quien juega hace lo mismo.
- **Rivales y asaltantes plantados en pasos al azar**, solo en el barrido del núcleo, para tener
  mixtos y guarniciones delante. Es estado sintético, pero solo prueba la regla de la frase contra el
  oráculo; no se usó en el navegador.
- **El CSS inyectado** (`min-height: 40px`) es solo el experimento de H1. Las filas de la tabla
  están medidas sin él.

## No probado

- En el navegador, sin héroe, fuera de turno y con la partida terminada: el turno del rival no dura
  lo bastante para señalar, y llegar al final cuesta más que el cambio. Lo cubren el test de sesión y
  el `return` temprano de `señalar` (`desenlace`).
- Un héroe rival o una guarnición nombrados en el navegador. Ninguna semilla de 1-40 los pone delante
  en los primeros días. En el núcleo están 686 veces vistos y 3367 ocultos.
- Que el motivo quede viejo con el ratón quieto si cambia la tropa (la clave no lleva `s.version`; la
  frase de la barrera enumera la tropa). Lo dejo como lo dijo el ingeniero: no probado.

## Veredicto

**Apto con reservas.** La niebla está bien hecha y probada a fondo: 0 fugas en 66 910 casos, al
señalar, al pulsar y en el rechazo del agente. No se nota lento, y a 1920 y con el dedo funciona. La
reserva es H1: a 380 con ratón, la barra no dice el porqué a simple vista por un fallo de una línea en
`ponerEnLaBarra`. Recomiendo arreglarlo en esta tarea, y abrir el issue de H2.
