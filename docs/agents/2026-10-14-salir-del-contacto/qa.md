# QA — Salir del contacto (#259)

Fecha: 14-10-2026. Rama `claude/combat-decision-system-88e11e`, commit `9b179e7d` (las cinco tareas de la arena juntas y simplificadas). Validado contra la petición literal:

> Que al moverse, el coste de salir de una casilla sea el numero de enemigos en contacto con esta.

También contra las decisiones del usuario (1 + N, solo la arena con interruptor, no sale si no le llega, el volador paga al despegar, «en contacto» = `canReachMelee`) y las del /simplify: al soltar con Escape un golpe plantado, lo gastado vuelve al camino barato.

## Cómo se probó

- `pnpm verify`, una vez: `Test Files 129 passed | 1 skipped (130)`, `Tests 3251 passed | 14 skipped (3265)`, salida 0.
- `pnpm banco`, una vez (5 s): `sha256: 066767b4179e0f617e21107148184ce052fff9ae7f16bbb4881b12a3218af995`, «ancla: igual», 0/200 sin terminar.
- `pnpm vitest run test/salir-del-contacto.test.ts test/carga.test.ts test/board.test.ts`: 93 de 93.
- No corrí `verify:lento` ni `capturas` (ya en verde en este commit, `implementacion-simplify.md`).
- **El navegador**:
  - Un Vite propio en `127.0.0.1:3467`, con `--config` de una configuración sombra en el scratchpad (la del worktree con un `cacheDir` propio).
  - Arrancado con `set -m` y parado por su grupo (PGID 359558, con su `cwd` comprobado). Al final, `3467 libre` y el 3187 del usuario sigue escuchando.
  - Playwright sin pantalla (Chromium headless), con clics reales en la lista, en «Luchar», en los botones y en el lienzo.
- **Cómo sé qué casilla pulsar**: un espejo en Node, con la misma `SesionDeArena` y la misma `EscenaBatalla` que la página. Me da el píxel que hace cada jugada, y el mismo clic se aplica en los dos. La página y el espejo no se separaron en ninguna pasada: el mismo ganador y la misma ronda en las tres peleas enteras.
- **Oráculo propio** (scratchpad, no está en el repo). Es un Dijkstra independiente: salir de una casilla cuesta 1 + los enemigos vivos a distancia 1; el volador paga la distancia más N de la casilla de despegue. No usa `alcanceConCostes` ni `costesDelPaso`. Lo comparé con el motor en peleas de la arena IA contra IA, con el contacto encendido:
  - 1-200 semillas;
  - de 1 a 3 unidades contra 2 a 4, sorteadas entre las hojas de tropa;
  - una semilla de cada cuatro con un volador;
  - la mitad con rueda.
  - **Visto morder**: con `contacto: 'libre'` en 40 semillas, el oráculo marca 189 decisiones distintas.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Interruptor en la arena, apagado por defecto, en el enlace como los demás | ✅ | `/arena/?seed=5`: la fila `data-modo-del-montaje="contacto"` está en `libre`, con «CONTACTO · LIBRE». «Paga» deja la barra en `?seed=5&contacto=paga`, y «Libre» la devuelve a `?seed=5` y deja de enseñar el enlace copiado. «Copiar enlace» con Paga lleva `contacto=paga`; con Libre, no lleva el parámetro. Al abrir el enlace, el interruptor sale en Paga y la barra dice «Montada la pelea del enlace (semilla 5)». A 375 px, la fila mide 343 px y la página no se desplaza a lo ancho. Capturas: `capturas/interruptor-paga.png`, `capturas/interruptor-movil.png`. |
| 2 | Lo resaltado, el camino, lo que hace el núcleo y «le quedan N» salen de la misma cuenta | ✅ | **Oráculo**, semillas 1-200: 3 262 decisiones, 0 diferencias entre `movableFrom` y el oráculo, en casillas y en coste. 1 442 movimientos con el camino del evento `move`: casillas contiguas y libres, y la suma de lo que cuesta salir de cada una es la del oráculo; 0 mal. **Navegador**: el espectro (4 casillas), con 2 zombis al lado, anda a una casilla vecina; el espejo gasta 3 (1 + 2) y el panel dice «Le queda 1 casilla» (`capturas/andar-con-2-al-lado.png`, `capturas/andar-tras-salir.png`). Con un enemigo cerca, el troll pasa de 19 casillas verdes a 16 (`capturas/contacto-alcance-con-uno-al-lado.png`). |
| 3 | Quien no paga salir no tiene casillas; puede atacar, defender o esperar; la pantalla dice por qué | ✅ | Navegador, `?seed=3&contacto=paga`: el troll (3 casillas) contra 2 zombis y 2 esqueletos, defendiendo. En la ronda 6 tiene 3 enemigos al lado: 0 casillas verdes y el panel dice «Rodeado: con 3 enemigos al lado, salir de su casilla le cuesta 4 y le quedan 3 casillas.». Un clic en (0,6), libre, pone esa misma frase en la barra y no mueve. La lista legal es `defend, wait, attack, end_turn`, con «Defender» y «Esperar» habilitados. Al pasar por un zombi, la barra dice «Golpearías desde (0,4)…», y el clic golpea (evento `attack` de `attacker-0`). Capturas: `capturas/contacto-rodeado.png`, `capturas/contacto-rodeado-clic.png`. En el núcleo, semillas 1-150 con muralla y rueda: 51 veces rodeado y nunca con casillas. |
| 4 | La IA juega con la regla sin más | ✅ | Oráculo con 1-200 semillas: 0 que no terminan y 0 que lanzan. Con muralla y rueda, 1-300: 0 y 0. En la página, tres peleas enteras todo en IA, con muralla, contacto y rueda: terminan sin errores de consola (`capturas/ia-muralla-contacto-s11.png`). |
| 5a | Con la carga: la recta paga sus costes; la carga cuenta casillas | ✅ | Tests de `salir-del-contacto.test.ts` («la carga»: recta pagable, Lentitud y Prisa). En el navegador, el guerrero con `?golpe=rueda&contacto=paga` carga 3 casillas; plantado, lleva `golpeEnCurso {carga: 3, barato: 3, carrera: 3}`. |
| 5b | Con la rueda: andar, elegir, golpear; Escape deja a la unidad donde llegó | ✅ | Navegador, `?seed=5&golpe=rueda&contacto=paga`: el guerrero anda a (4,4) y se abre la rueda. Con Escape se cierra, se queda en (4,4) con el turno, el panel dice «Le quedan 0 casillas» y la barra, «Golpe cancelado.». El segundo golpe contra el mismo zombi ya no carga («Rápido 2 × 4–16»). Capturas: `capturas/ruedapie-rueda.png`, `capturas/ruedapie-tras-escape.png`. **Devolver lo gastado al camino barato** (decisión del /simplify), en el núcleo: 117 golpes plantados con carga y soltados, en semillas 1-300 con muralla. Lo gastado queda en lo del camino barato en los 117. En ninguno costaba la recta más que el camino barato; ese caso lo cubre el test «con la rueda, soltar el golpe devuelve lo gastado al camino barato». En el navegador no lo pude montar (ver «No probado»). |
| 5c | Con la muralla, las puertas y las escaleras | ✅ | Tests: el de lo alto del muro no cuenta, el de detrás de una puerta cerrada sí, y «Poner escalera» rodeado no paga el contacto. Núcleo, semillas 1-300 con muralla y rueda: 13 132 decisiones, 184 escaleras. Pagar nunca alcanza una casilla que no alcance gratis, ni la alcanza más barata (0 casos), y 0 que lanzan. En la página, todo en IA con muralla, rueda y contacto: termina. |
| 5d | Prisa y Lentitud | ✅ | Los tests de la carga con Lentitud (5) y Prisa (7), en verde. No lo probé en el navegador. |
| 6 | Tests con cifras exactas | ✅ | 28 tests en `test/salir-del-contacto.test.ts` y +5 en `board.test.ts`: 0 a 3 enemigos, rodeado, camino que rodea, volador y tramo en contacto. Todos en verde. |
| 7 | El juego no cambia: mismo hash y un guardia | ✅ | `pnpm banco` con el hash `066767b4…af995`. El guardia es «solo la arena enciende un modo de la arena» (`invariantes.test.ts`), en verde. Lo vio morder el ingeniero (`implementacion-simplify.md`, A); yo no toco código. |
| — | El volador paga solo al despegar | ✅ | Navegador, `?seed=2&contacto=paga`: un espectro con «vuela» (4 casillas) y 2 enemigos al lado. Vuela por encima de ellos a (2,4), a distancia 2, y gasta 4 (2 + 2). Sus casillas llegan a distancia 2 como mucho, 4 − 2. Capturas: `capturas/volador-con-2-al-lado.png`, `capturas/volador-tras-volar.png`. El oráculo, con un volador en una semilla de cada cuatro, da 0 diferencias. |
| — | Sin errores de consola | ✅ | Todas las pasadas del navegador acaban con la consola sin errores ni avisos. |

## Pasada adversarial

- **Contacto + carga + rueda + Escape**: en el navegador, guerrero (a pie) y hermano de carga. Plantarse, Escape y volver a golpear funciona: sin carga, desde donde llegó, con el turno abierto. Rápido cargando cobra la carga solo en el primer golpe (ver el QA de #260).
- **Contacto + muralla**: lo de 5c. Las peleas con muralla de 3 contra 3 duran entre 54 y 85 rondas **con el contacto libre y con el contacto pagando por igual**. Medido en el núcleo con las semillas 11-16, mismas rondas en los dos modos: no viene de esta tarea. Lo dejo apuntado para quien mire la IA del asalto: el arquero tira desde detrás del muro y los atacantes no ponen escalera.
- **`?montaje=` viejo con `?contacto=` mal escrito**:

  | URL | Barra | ¿Monta? |
  |---|---|---|
  | `contacto=pagaa` | ««pagaa» no es un modo del contacto; valen libre, paga — se pelea con contacto libre.» | — |
  | `contacto=PAGA` | Se rechaza igual. | — |
  | `contacto=%20paga%20` | Se acepta (se recorta). | — |
  | `contacto=` vacío | Libre. | — |
  | `contacto=paga&contacto=libre` | ««contacto» va 2 veces en la URL…» | — |
  | Enlace v8 + `contacto=paga` | Lo monta. | sí, con el interruptor en Paga |
  | Enlace v8 + `contacto=pagaa` | La frase del modo y «El enlace de la pelea no se monta: la semilla o las reglas del enlace no valen.» | no: monta vacío |
  | Enlace v8 + `golpe=rueda&contacto=pagar` | Igual. | no |
  | Enlace v9 + `contacto` repetido | Igual. | no |

  Falla en voz alta, pero la frase culpa a lo que no es: ver H1. Captura: `capturas/enlace-v8-contacto-errata.png`.

## Hallazgos

### H1 — menor: el enlace que no se monta por el contacto culpa «a la semilla o las reglas»

1. Abre `/arena/?seed=5&contacto=pagaa&montaje=<cualquier montaje válido, v8 o v9>`.
2. La barra dice:
   > «pagaa» no es un modo del contacto; valen libre, paga — se pelea con contacto libre. El enlace de la pelea no se monta: la semilla o las reglas del enlace no valen.

Pasa lo mismo con `golpe=` mal escrito y con un modo repetido. El motivo lo escribe `montarDelEnlace` (`src/client/arena/main.ts`, `if (avisoDeSemilla !== '') throw new Error('la semilla o las reglas del enlace no valen')`), que no cuenta los modos.

Además, la primera frase dice «se pelea con contacto libre», pero no se pelea nada: el montaje queda vacío.

**Lo que esperaba quien juega**: «…la semilla, las reglas o los modos del enlace no valen», o que nombre el parámetro. No es silencioso, así que no bloquea.

### H2 — menor (texto): rodeado, la ayuda sigue diciendo «Haz clic en un hexágono verde para moverte»

No hay ninguno verde. La frase «Rodeado: …» ya lo explica justo encima, así que confunde poco. Captura: `capturas/contacto-rodeado-clic.png`.

## Workarounds usados

- **El enlace de la pelea (`?montaje=`) generado con `montajeALaURL`** en vez de montar a clics: es una función de la página («Copiar enlace»), y así cada pelea lleva las cifras de la hoja y no las del borrador. El borrador lo estaba reescribiendo otra sesión: `data/borradores/unidades.json` cambió a las 14:38. La pelea literal a clics, desde la lista, la hice en el QA de #260 con el mismo resultado de interfaz.
  - **Veredicto**: no afecta a quien juega.
- **Vida subida en el enlace** (troll y espectro a 4 000 PV) para que el rodeo llegue antes de morir. El campo se edita en la ficha.
  - **Veredicto**: no afecta.
- **El espejo en Node** para traducir casillas a píxeles. No falsea nada: el clic es real y la página aplica su propia jugada.
  - **Veredicto**: no afecta.

## No probado

- **La recta más cara que el camino barato, en el navegador**: plantarse pagando la recta y que Escape devuelva lo gastado al camino barato. Con la IA moviendo no pude montar esa geometría (0 casos en 117 cargas plantadas al azar). Lo cubre el test con cifras (gasta 6, tras Escape 5, le queda 1), en verde.
- **Prisa y Lentitud en el navegador**: solo los tests.
- **Unidades de dos casillas**: la arena ya no las hace.
- **El guardia de `invariantes.test.ts` visto morder por mí**: no toco código. Lo vio el ingeniero.

## Veredicto

**Apto.** La regla hace lo que pidió el usuario: el interruptor, la frase del rodeado, el volador, la carga, la rueda con Escape y la muralla, y el juego no cambia. Los dos hallazgos son menores (H1, el texto del enlace que no se monta; H2, la ayuda del rodeado) y no bloquean.
