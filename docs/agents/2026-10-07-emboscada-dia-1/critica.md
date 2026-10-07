**REENCUADRADA** — el problema es real y hoy más ancho que en el issue. Que la vista previa avise no basta: el héroe anda más lejos de lo que ve, y la IA de reglas ya juega sin niebla para esto. Quien decide es el usuario: hay cuatro opciones al final.

## El problema real, en una frase
Quien juega (persona o agente) no tiene forma de saber, antes de pisarla, que una región lo embosca. La IA de reglas sí lo sabe, porque mira `state.raiders` sin pasar por la niebla.

## La premisa, afirmación por afirmación
Medido con `newGame({seed})` y las funciones que usa la pantalla (scripts en el scratchpad, `medir130*.mts`). `previewPath` es `caminoHasta` + `emboscadaEnLaRuta(…, visibles())` (`src/client/session.ts:434-446`), así que medir en el núcleo mide lo mismo que pinta la ruta. No he abierto el navegador.
- **«`?seed=1`, 5 momias en (6,16) que no se ven»**: ya no es así, porque el mapa cambió. Hoy en la semilla 1 el héroe está en (2,8). De las 120 casillas a las que llega hoy, 52 acaban en emboscada, y 51 de esas 52 avisan: el grupo de la región 8 está a la vista. Solo una casilla falla. Sí quedan grupos ocultos (región 5 en (6,21) y región 7 en (16,9)) que le sacan el margen. Semilla 2: 44 casillas con emboscada y **ninguna avisa**.
- **«98 de 100 semillas»**: hoy es peor, sobre 100 semillas:
  - En **97**, hay una región que embosca al héroe inicial a la que llega el día 1. En **100**, si se cuentan tres días.
  - En **81**, alguna de las casillas a las que llega el día 1 acaba en emboscada sin rombo.
  - De media (mediana), el 45 % de las casillas a las que llega hoy acaban en emboscada.
- **«La niebla lo oculta»**: es cierto y es deliberado. `emboscadaEnLaRuta` solo avisa de grupos que se están viendo ahora (`src/core/state/asaltantes.ts:261-266`, «una restricción que no se puede quitar»). Al agente le pasa igual: en `knownMap.raiders` solo van los grupos que se ven ahora (`src/core/contract/serialize.ts:259-272`).
- **Por qué pasa: tres causas que se suman.**
  1. **El héroe inicial pesa poco.** Su fuerza es de unos 200 (en la semilla 1, 203). La fuerza de los grupos va de 1,29 a 3,56 veces la suya (mediana 2,17), y **702 de 800 grupos** le sacan el margen de 1,6 (`src/core/ai/fuerza.ts:63-67`). En **80 de 100** semillas no hay ninguna región ajena segura a tres días de casa.
  2. **Hay grupos junto a la base.** El generador pone un grupo en cada región donde no empieza nadie, también en las que tocan la base (`src/core/map/generate.ts:1356-1370`). Fue corrección del usuario: «No, también en casa».
  3. **Anda más de lo que ve.** El héroe ve a 4 casillas (`HERO_SCOUT_RADIUS`, `src/core/state/game.ts:176`) y el castillo a 5. Pero el día 1 tiene 1 100 puntos de movimiento, unas 11 casillas. Puede meterse en una región que nadie ha visto en todo el día.
- **Dato que el issue no dice: la IA de reglas no tiene niebla para esto.** `casillasPeligrosas` recorre todos los grupos, se vean o no (`src/core/state/asaltantes.ts:306-321`). Lo usa `alcanceDelHeroe(…, {evitarEmboscadas})` (`src/core/state/game.ts:1733`, `src/core/ai/turn.ts:134`), y `strategy.ts:199` valora todos los grupos. Por eso la IA cayó de 304 emboscadas a 0 (`docs/historia.md:1942`). La ventaja sobre la persona y sobre el agente no está escrita en ningún sitio.

## El día después
- **Si solo se cambia la vista previa:** con la regla de visión actual no hay aviso que respete la niebla en 81 de 100 semillas. El grupo no se ve desde ninguna casilla anterior a la emboscada, y parar la marcha al ver el grupo solo salva 246 de 2 228 rutas.
- **Si el aviso funciona:** quien juega descubre que en 80 de 100 partidas no puede salir de casa hasta que reclute y licencie. Es lo que ya hace la IA (`docs/historia.md:1935-1944`), pero nadie se lo dice a la persona. Sería honesto, aunque frustrante. No es cosa de esta tarea, pero el usuario debe saberlo antes de elegir.
- **Lo que no debe hacerse:**
  - Quitar los grupos de las regiones que tocan la base. Contradice la corrección del usuario (generate.ts:1359-1361).
  - Avisar solo en el cliente. El criterio 2 exige que el agente vea lo mismo.
  - Tocar la IA de reglas en esta tarea sin medirlo. Si deja de mirar a través de la niebla, vuelven las emboscadas que historia.md:1942 dio por resueltas.

## Conflictos
- **#121** (una marcha de varios días se da por «descartada»). Toca en la opción C: si la marcha se para al descubrir un grupo, al agente le llega una marcha cortada, y hay que decirle bien por qué.
- **#64 / #86** (el lienzo pinta con `fog`, no con `visibleNow`; el radio del pueblo). Toca en la opción C: si se cambia qué grupo se ve, el cliente, el espectador y `serializeKnownMap` tienen que leer el mismo predicado.
- **#129** (`unitPower` sin ataque ni defensa). Cambia `ventajaClara`, y con ella quién embosca a quién. Es independiente, pero cambia las cifras de arriba. Si va antes, hay que volver a medir.
- **#115** (la IA buena). Ahí cabe decidir si la IA debe tener niebla para los grupos. Aquí no.

## Coste contra valor
Merece la pena. Es lo primero con lo que tropieza quien prueba el mapa, y el agente está igual de ciego que la persona. No hacer nada deja a los dos en desventaja frente a la IA de reglas, y esa desventaja no está escrita en ningún sitio. Las opciones, para el usuario:

| | Opción | Qué hace con la niebla | Coste para el agente | Banco | Ciegas día 1 |
|---|---|---|---|---|---|
| A | Aviso genérico: «región sin dueño y sin ver: puede haber asaltantes» | No la toca: la regla ya es pública | Una frase en la prosa | Igual | 81/100 sin aviso concreto, con un aviso vago en casi cualquier salida |
| B | Avisar de la región que embosca, aunque el grupo no se vea | La rompe para los grupos. Todos saben lo que ya sabe la IA de reglas | Un campo por región en `knownMap` | Igual: la IA ya lo usa | 0/100 |
| **C** | **El grupo se ve en cuanto se ve una casilla de su región, y la marcha se para al descubrir uno que le saca el margen** | Cambia qué se ve, no quién lo ve | Lo hereda por `knownMap`; hace falta prosa y la nota de la marcha cortada (#121) | Cambia solo `seen`, previsiblemente: la IA no entra donde la emboscan | **0/100**, medido con la marcha de ruta paso a paso |
| D | Partida más suave: el héroe inicial sale con más fuerza, o sin emboscadas la primera semana | No la toca | Ninguno | Cambia el juego: hay que re-anclar y mirar el barrido | Ataca la causa 1, no la ceguera |

**Recomendada: C.** Mantiene la niebla y que «no se avisa de lo que no se ve». Lo que cambia es que se ve antes: un grupo que patrulla una región se nota desde su borde. Es la única opción medida con 0 de 100 que no regala información. B es la más barata y deja la información pareja con la IA de reglas, pero gasta la niebla. D se puede sumar a cualquiera de las otras.

## Qué le cambiaría a `requisitos.md`
Sustituir «Criterios de aceptación (provisionales)» por:

> 1. Antes de pisar una región que lo embosca, quien juega (persona o agente) tiene ocasión de saberlo: en la vista previa de la ruta o porque la marcha se para antes. Medida con 100 semillas: el día 1 no queda **ninguna** semilla con una ruta que acabe en emboscada sin aviso (hoy son 81 de 100). La opción la elige el usuario entre A, B, C y D de `critica.md`.
> 2. El cliente, el espectador y el agente leen el mismo predicado de «este grupo se ve». No hay una regla escrita dos veces.
> 3. Que la IA de reglas mire los grupos sin niebla queda escrito en `docs/historia.md` como ventaja declarada (o se abre un issue). En esta tarea no se cambia.
> 4. No se quitan los grupos de las regiones que tocan la base (corrección del usuario).
> 5. Comprobaciones, las mismas. Si cambia `seen`, el diff del banco se juzga por su forma: solo `seen` y ninguna línea `fin`.
