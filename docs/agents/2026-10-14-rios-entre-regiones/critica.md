**REENCUADRADA** — el problema es real, pero no está en el ancho: está en el largo. Y no puede entrar en la rama hasta que cierre `pisable-junto-al-bosque`.

## El problema real

El agua que separa dos regiones nunca se lee como río. Cada frontera de agua es la frontera corta de **una sola pareja** de regiones (~9 casillas de largo), partida en dos por su puente, y donde coinciden tres fronteras de agua se forma un charco. Por eso «río» y «lago» salen iguales. Hacer el agua «estrecha (1-2 casillas)» ataca el eje que ya está casi en su mínimo.

## La premisa, medida (1-40, `buildMap(generateMapPlan)`, scripts en el scratchpad; 14-10-2026)

- **«Ahora solo hay lagos»: cierto.** En 40 mapas, de 230 sistemas de agua de frontera (agua más sus puentes, 8-conexo), el largo tiene mediana 8 y máximo 44. Solo 25 son alargados (largo²/casillas ≥ 6) y solo 39 llegan a 15 de largo. `franjasDeBarrera` (`regiones.ts:503`) corta cada uno por su nodo: 268 franjas de frontera, mediana de 12 casillas y 5 de largo. Además hay 56 charcas de cruce (3+ regiones), de mediana 33 casillas y área/largo 3,1. Aparte están los lagos de verdad, los obstáculos de `data/barreras.json` («obstaculos»: grass, dirt, swamp): 286 manchas de mediana 4 casillas, ~7 por mapa, 1 261 casillas frente a 6 461 de frontera.
- **«Una mancha ancha»: falso.** El ancho local de una frontera de agua (distancia a una orilla + a la otra − 1) es 2 en el 54 % de sus casillas, 3 en el 30 % y ≥ 4 en el 8 %. Es el mismo grosor que el bosque y la montaña, porque todas pasan por el mismo engorde. Se decide en `engordarFronteras`: el muro fino más el ruido de cara o cruz por casilla (`vestir.ts:437`, `if (ruido(i)) engorda[i] = tipo`) y la reparación de los tres pasos (4b, `vestir.ts:438-470`). El tipo es uno por pareja (`tipoDePareja`, `vestir.ts:380-391`) y las parejas salen puras: el 93 % de la frontera de una pareja con puente es agua.
- **El largo lo limita el tamaño de la región.** Una pareja comparte unas 20 casillas de frontera (mediana), así que una pareja sola no da un río. Para que haya largo, varias parejas seguidas tienen que ser agua. Eso se decide en el reparto de tipos (`vestir.ts:380-391`, con `TIPOS_POR_MAPA` y los pesos por suelo), no en el engorde. El agua solo entra donde un lado es hierba, tierra, arena o ciénaga (`data/barreras.json`).
- **«1 casilla» rompe un contrato.** Dos regiones quedan a tres pasos como poco, salvo a través de un acantilado (`vestir.ts:802-824`, paso 7d, y `RADIO_DEL_PASO`). Con 2 casillas se cumple. Con 1 habría que extender a ese paso la excepción del acantilado (#215), y esa excepción la aprobó el usuario.
- **`rios-lineas` (70df803d) es otra cosa.** Era solo de la escena (`rios.ts`): misma franja, una cinta de agua con curso por dentro y el nivel del agua bajando por el curso, con cascadas de marcador. Se aparcó por esto (comentario en #144): «la diferencia es pequeña y en conjunto se veía mejor antes (s8: escalones en el relieve del agua y cascadas con marcador)». Además es **anterior a #210** (17:58 frente a 21:10 del 08-10). #210 dejó el agua plana, a ras de la región más baja, y eso contradice de frente su nivel por curso y sus cascadas. No se puede rebasar tal cual. Esta petición pide cambiar **qué separa las regiones**: es el generador, la mitad de #144 sin «bajan de nivel».
- La muralla vuelve agua lo que sobra (#232): el 18 % de la frontera de las parejas con nodo de muro es agua. Es cierto, y no afecta aquí.

## El día después

- **Para quien juega:** fronteras de agua largas y continuas, cruzadas por puentes. En las reglas nada cambia: la barrera no tiene efecto propio y la red de nodos se decide antes que los tipos. Cambia el azar: el banco y las medidas de duración y j0 se mueven sin que cambie el juego.
- **Qué se vuelve más difícil:**
  - **Rectitud.** El ruido del engorde es lo que rompe lo recto (#169). Quitárselo al agua acerca su orilla al muro fino.
  - **Caídas largas (#231).** #231 encontró que las caras rectas largas eran «la región alta sobre el agua» cayendo en su propio borde. Un río largo entre dos niveles da más `caidasLargas`, y con ellas más quiebros o más vestidos tirados.
  - **Variedad.** Encadenar agua compite con `TIPOS_POR_MAPA` (4) y con `casillasMinimasPorTipo`.
  Los techos de `rectitud.ts` (176 / 3 / 15 en 1-3000) son el guardia que manda.
- **Qué hay que borrar:** nada si `rios-lineas` se queda sin fusionar. Al cerrar, #144 se cierra apuntando aquí, con la parte de bajar de nivel y las cascadas descartada por #210.
- **`CLAUDE.md`:** no contradice nada si el ancho mínimo sigue en 2. Sí lo contradice si se pide 1.

## Conflictos

- **Con `2026-10-14-pisable-junto-al-bosque`, en la misma rama: dependencia oculta.** Esa tarea fija la semilla 1 en (1,23) y (2,23) (criterios 6 y 8: marcas y un test). También mide `sueloDesnudo` antes y después en s1, 3 y 7 y los informes en 1-40. El mapa de s1 tiene fronteras de agua (puentes en (1,17), (26,15), (15,26) y (41,24)). Cualquier cambio al engorde o al reparto del agua mueve el azar que viene después (obstáculos, caminos), y con él esas casillas y esas medidas. **Orden:** el cambio del generador no entra en la rama hasta que esa tarea cierre (marcas resueltas, test en verde, medidas tomadas). Se puede criticar y planificar en paralelo. Si hay que implementar en paralelo, que sea en otro worktree.
- **#144: solapamiento.** Esta tarea es su mitad del generador. No se abre otra.
- **#210 (agua plana) y `sinAguaEnLasEsquinas`** (`vestir.ts:2779`): no hay contradicción si el río sigue plano y sin escalones. Lo que no debe hacerse es volver a dar nivel al agua por tramos ni poner cascadas: es exactamente lo que el usuario rechazó. Un río largo trae más esquinas de agua junto a las sendas, así que más montaña de remiendo: hay que medirlo.
- **Puentes con dos orillas** (`generate.ts:2208-2219`): a 2 de ancho es más fácil que hoy. Sin conflicto.
- **Escena:** a 2 casillas el escenógrafo pinta el río con lo que ya hay (`aguasDeLaEscena`). No hay por qué tocar `render/escenario/`, que es lo que toca la otra tarea.

## Coste contra valor

Es barato si se limita a dos palancas del generador: que el agua se encadene a lo largo de varias parejas sin abrir el tercer brazo en los cruces, y que su engorde se quede en 2. Lo caro son las medidas: el banco re-anclado, la rectitud en 1-3000, 200/200 semillas por lado y capturas antes y después. Si no se hace nunca, el agua sigue siendo charcas con puente, lo mismo que los obstáculos. El usuario lo pidió explícitamente, así que no hacerlo no es una opción. **No** es el sitio de la cinta con curso de `rios-lineas`: ya se probó y gustó menos.

## Qué le cambiaría a `requisitos.md`

Sustituir «Lo que se entiende» y el criterio 1 por:

> **Lo que se entiende (medido por la crítica, 1-40):** el agua de frontera ya es estrecha (ancho 2 en el 54 % de sus casillas, 3 en el 30 %). Lo que la hace lago es que es **corta**: cada frontera de agua es la de una sola pareja de regiones (~20 casillas, ~9 de largo), partida por su puente, y donde coinciden tres sale una charca (56 en 1-40). Hoy, de 230 sistemas de agua de frontera (agua + puentes), la mediana mide 8 de largo y solo 25 son alargados (largo²/casillas ≥ 6). Un río pide **varias fronteras seguidas de agua** a lo largo de una línea, sin el tercer brazo en los cruces, y no un ancho menor.
>
> 1. En 1-40, los sistemas de agua de frontera alargados (largo²/casillas ≥ 6) pasan de 25 a una cifra que fija el plan, con al menos un río de largo ≥ 20 en la mayoría de los mapas que tienen agua. Las charcas de cruce (agua que toca 3+ regiones) bajan de 56. El ancho local se mantiene en 2-3 y **nunca baja de 2**: la excepción de los tres pasos (`vestir.ts`, paso 7d) sigue siendo solo del acantilado. Los lagos de obstáculo siguen como están.
> 2. (añadir) `npx tsx tools/qa/rectitud.ts` dentro de sus techos y `TIPOS_POR_MAPA` con sus casillas. El agua sigue plana (#210): sin nivel por tramos ni cascadas, que es lo que se rechazó en `rios-lineas`.
> 5. (nuevo) **Orden:** el cambio del generador entra en la rama cuando `2026-10-14-pisable-junto-al-bosque` esté cerrada, porque mueve la semilla 1 de sus marcas y de su test. Al cerrar, #144 se cierra apuntando aquí y `rios-lineas` se queda sin fusionar.

Y en «Preguntas abiertas», la respuesta a «¿el río tiene curso?» es: no, ni nivel por tramos ni cascadas.
