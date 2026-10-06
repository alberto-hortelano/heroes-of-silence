**REENCUADRADA** — y con una decisión del usuario delante: los criterios 1 y 2 de `requisitos.md`, tal como están escritos, son incompatibles.

## El problema real

El 36 % del suelo pisable es camino y el 77 % de esas casillas están en algún ciclo. El 90 % de los ciclos los **obliga** la regla «cada región une todos sus nodos por camino propio», no un fallo de `trazarCaminos`.

## La premisa, afirmación por afirmación

Medido con `generateMapPlan(createRng(s))` + `buildMap` + `estructura`, con las aristas que dibuja el pintor (`colocar.ts:516-535`: 8-vecindad y diagonal solo sin esquina ortogonal). μ = aristas − casillas + componentes. Semillas 1-100:

| Medida (media por mapa) | Valor |
|---|---|
| Camino / suelo pisable | **36,1 %** (s1 260/642, s7 237/664: cuadra con el enunciado) |
| Ciclos independientes (μ) | **18,5** (s1 20, s3 26, s7 25) |
| … que pasan entre regiones | **16,7**, y en **cada** semilla es igual al μ del grafo región–nodo |
| … de ellos, anillos entre dos pasos de la misma pareja de regiones | **12,5** (en todos hay una ciudad). Los dos pasos están a Chebyshev 4 de mediana y 2 en el p10; hay 5 por mapa a ≤ 3 |
| … dentro de una región | **1,8**, y solo **0,14** si quitas las sendas a minas y pueblos |
| Casillas del árbol de nodos / total | 74,5 %. El otro 25 % son sendas a 36 destinos por mapa |

- **«`trazarCaminos` traza un árbol por región»**: cierto (`vestir.ts:710-800`). El árbol se mide en tramos, no en casillas. El pintor une dos casillas de camino vecinas aunque el árbol no las una, y el tramo nuevo puede pasar en diagonal junto a la red sin fundirse con ella.
- **Hipótesis 1 (los ciclos se cierran entre regiones por los pasos)**: confirmada, y explica el 90 %. Es aritmética: si cada región conecta sus nodos, μ(unión) = Σμ(regiones) + μ(grafo región–nodo). El Voronoi pone una ciudad en cada vértice (las que tocan 3 regiones) y un paso a mitad de cada arista (`generate.ts`, docstring de `generateMapPlan`). Así una misma frontera tiene 2-3 pasos, y cada lado traza su propio camino entre ellos: dos vías paralelas, una a cada lado de la barrera. En la s7, la frontera 4|5 tiene T(12,17), N(17,17) y T(21,18), y por eso hay dos anillos alrededor del acantilado de `s7-acantilado.jpg`.
- **Hipótesis 2 (las sendas corren paralelas a la red)**: menor en ciclos (1,7 por mapa), pero mayor en casillas (25 %).
- **Hipótesis 3 (demasiados nodos)**: sí, en el sentido de la hipótesis 1. Son 21 nodos para 10 regiones, y el número de anillos lo fija la red, que está fuera de alcance.
- **El «cuadrado» de la captura no es ninguno de los anteriores.** La escala sale de la hondonada de 2×3 casillas (x 18-19, y 17-19) que cita `caminos-despejados/implementacion.md:367`. Con ella, el rombo son las casillas (20,19), (21,20), (20,21) y (19,20), que rodean **un obstáculo de cordillera de una casilla**, el (20,20). Los «dos picos diminutos» de QA son ese obstáculo, encogido por el pasillo. El árbol de la región 5 trae tres lados. El cuarto, (21,20)-(20,21), no es una arista del árbol: lo une el pintor porque las dos esquinas son barrera. Es un ciclo intrarregión, de los 1,8 por mapa, y además del raro, que sale sin sendas (0,14 por mapa).
- `generate.ts:1211` → hoy es `:1216`. `map.ts:184` y `vestir.ts` ~670-800 son correctos.

## El día después

- **Si se respeta la regla por región** (lo que los requisitos dan por supuesto): se puede quitar la parte intrarregión, que son 1,8 de 18,5 ciclos por mapa, el rombo de la s7 entre ellos. La fracción de camino casi no se mueve. El usuario volverá a ver «cuadrados» alrededor de cada frontera con una ciudad, que son los 12,5 anillos por mapa.
- **Si se relaja** (una sola red para todo el mapa): un árbol global entre nodos con sendas daría ~26 % de camino en vez de 36 %, y entre nodos solos un 15,6 %. Es una estimación por arriba, con un Prim de un solo suelo. Pero cierra puertas:
  - En una región dejaría de haber camino propio entre sus pasos. Ir por camino de un paso a otro obligaría a cruzar otra región, y a veces una **ciudad**, que puede ser enemiga.
  - Menos camino es más coste de movimiento: amenaza el p90 ≤ 20 de la regla del lado.
  - Rompe la auditoría `test/helpers.ts:348` y `:464-497` («por `roads` de la región se va de cualquiera de sus nodos a los demás»). Y, literalmente, también el criterio 2 de los requisitos.
- No contradice «árbol mínimo + minas» (`historia.md:1466`). Esa decisión pedía un árbol, y un árbol por región es el detalle que lo convirtió en anillos. Sí contradice quitar las sendas: deben quedarse.

## Conflictos

- **#133 (Densidad de caminos: 36 %)** es **el mismo problema** medido por la otra cara. Ya concluía que bajar exige una decisión del usuario (`historia.md:1477-1480`). Hacer #149 sin cerrar #133 es pagar dos veces. #149 absorbe a #133, y el techo de `test/regiones.test.ts:419` (< 38 %) pasa a ser el criterio de #149.
- **#150 (rampas de acantilado)**: tiene una dependencia oculta. Las rampas salen de dónde cruza un camino una cara, y quitar anillos cambia ese conjunto. Hay que hacer #149 **antes**.
- **#143, #144 y #145**: sin conflicto. Ninguna toca `roads`. #144 (ríos) cambia el generador y también re-ancla el banco, así que conviene no hacerlas a la vez, pero en cualquier orden.
- **#111 (28 minas fijas)**: es la palanca del 25 % de sendas, y queda fuera de alcance, como dicen los requisitos.

## Coste contra valor

- Lo que cabe dentro del alcance actual (los ciclos intrarregión) es barato y arregla **exactamente el rombo que vio el usuario**. Pero no cumple su frase («demasiados caminos»).
- Lo que sí la cumple (relajar la conexión por región) cambia la partida y su duración, rompe un invariante escrito y es una decisión del usuario, no del arquitecto. El requisito la deja en manos del arquitecto («¿Árbol por región o global? Lo decide el arquitecto»), y es el punto equivocado.
- No hacer nada: el mapa se juega igual. El coste es solo visual, y pesa porque el pasillo (`5cdd636`) despeja ahora los caminos dentro de bosques y cordilleras.

## Qué le cambiaría a `requisitos.md`

Sustituir la «Pregunta abierta 2» y el criterio 2 por:

> **Decisión previa del usuario (bloquea el plan).** Medido en 100 semillas: hay 18,5 ciclos de camino por mapa, y 16,7 los obliga la regla de que cada región una todos sus nodos por camino propio. 12,5 de ellos son dos vías paralelas a ambos lados de una frontera que tiene una ciudad y un paso. El rombo de `s7-acantilado.jpg` es otra cosa: un ciclo dentro de la región 5, alrededor de un obstáculo de una casilla en (20,20). Opciones:
> **A)** Se mantiene «cada región unida por camino propio». Solo se quitan los ciclos dentro de una región, 1,8 por mapa. El rombo desaparece, pero el camino sigue en ~36 %.
> **B)** Una sola red para el mapa. Baja a ~26 %, aunque entre algunos pasos de una región solo se irá por camino cruzando otra región o una ciudad. Cambia la auditoría de `test/helpers.ts` y puede alargar las partidas.
>
> **Criterio 1, medida:** μ del grafo de casillas de camino, con las aristas que dibuja `colocar.ts`, separado en intrarregión y entre regiones. Más la fracción de suelo pisable que es camino. Antes y después, en las semillas 1-100.
> **Criterio 2 (con A):** igual que hoy. **(con B):** todo nodo, mina y pueblo, unido a la red **del mapa**, y la auditoría se reescribe en ese sentido.
> **#133 se cierra con esta tarea.** El techo de `regiones.test.ts:419` se re-mide.
