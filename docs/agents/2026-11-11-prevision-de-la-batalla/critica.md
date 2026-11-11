**REENCUADRADA** — los dos problemas son reales y juntarlos es lo correcto (son el mismo texto), pero #253 es mayor de lo que dice (también el golpe propio, no solo el contraataque), su segunda salida («remitir a la rueda») no cierra el hueco, y el criterio de #264 («lo que necesita la previsión más larga») no tiene sujeto: no hay previsión más larga.

## El problema real, en una frase

Al pasar el ratón por un enemigo, la barra de la batalla describe un golpe cuerpo a cuerpo que el juego ya no da (sin rueda) y, cuando el texto es largo, lo recorta: la persona lee cifras que no son las que pueden pasar, y a veces ni enteras.

## La premisa, afirmación por afirmación

- **«Con `?golpe=rueda`…»** — obsoleto: la rueda es obligatoria en todo golpe cuerpo a cuerpo; `cruceBlocker` exige golpe y respuesta para darlo (`src/core/battle/rueda.ts:404-405`). Ya no hay golpe «al azar»: la previsión sin rueda describe algo que nunca ocurre.
- **«El contraataque se prevé como al azar»** — cierto. `previsionDe` pasa `golpe = null` si la acción no lo trae (`src/core/battle/prevision.ts:191`), y el contraataque se cuenta sin la respuesta de quien lo devuelve: `opcionesDeDanio(state, pocos, quienPega)` sin `cruce` (`prevision.ts:457-458`; el propio comentario lo dice, `prevision.ts:416-417`). Ni el ×% de Fuerte (`cruceDelGolpe`, `rueda.ts:379`) ni los dos golpes de Rápido (`golpesDe`, `src/core/battle/armas.ts:134`, con `contraataque = true` también se multiplican).
- **Más de lo que dice el título: el golpe propio también.** El daño, las bajas y lo que le queda se cuentan con `golpesDe(a.unit, null, …)` (`prevision.ts:270`) y sin el factor ni el ataque del tipo: el Fuerte o el Rápido de quien pega tampoco caben en la horquilla de la barra. El cuerpo del issue lo decía («el golpe y el contraataque»); el título y el comentario del 11-11 solo nombran el contraataque.
- **El hueco está escrito en un test.** El barrido de `test/prevision.test.ts:66-79` juega siempre Finta y excluye Fuerte y Rápido de las respuestas «porque su previsión es la de la rueda». Es la prueba de que la barra no los cubre, y es el guardia que hay que ver morder cuando se cubran.
- **«La rueda ya enseña sector a sector lo que daría cada tipo»** — para el golpe propio, sí. **Para el contraataque, no**: al golpear, la rueda da el contraataque del golpe neutro sin la respuesta del rival (`contraataqueCon`, `prevision.ts:589-591` y `:616-618`, que vuelve a `previsionDelContraataque`), y solo lo enseña en la nota de Romper guardia (`src/client/batalla/rueda/rueda.ts:294-304`). «Remitir a la rueda» deja el contraataque sin decir en ningún sitio.
- **#264, «a 1024 px se corta»** — no re-medido (lo dice el comentario del 11-11), pero sigue en pie por construcción: `#status` recorta a dos líneas (`src/client/style.css:473-476`) y la barra reserva justo dos (`style.css:463`). La armadura va la última de los modificadores (`src/core/battle/damage.ts:569-574`), así que es lo primero que cae. Desde el 14-10 la frase ha crecido (el arma del contraataque, `src/client/batalla/prevision.ts:42-46`).
- **«Reservar lo que necesita la previsión más larga»** — no hay previsión más larga: los modificadores no tienen tope (`prevision.ts` del cliente, `:31-35`) y la granada encadena una previsión entera por cada alcanzado, hasta siete casillas (`:146-150`), en la misma barra (`src/client/batalla/escena.ts:695-706`, `:785`). Una barra que reserve N líneas siempre tendrá un N+1.

## El día después

- Para quien juega: la barra deja de prometer una horquilla que el cruce puede rebasar (por arriba con Fuerte o Rápido, del atacante o de quien responde). Es lo que pide el issue y vale.
- Lo que no cambia: la IA no lee la previsión del golpe (`previsionDe` solo para hechizos y poderes, `src/core/ai/tactics.ts:401` y `:436`), así que `pnpm banco` no debería moverse; si se mueve, algo tocó lo que no debía.
- Puerta que puede cerrar: `previsionDeLaRueda` la lee el agente (`src/core/contract/batalla.ts:335`) y la leerá la IA de #282. Si la previsión de la barra se saca cambiando la forma de lo que devuelve, cambia el contrato (`pnpm qa`). **No debería** tocarse para esto.
- Una horquilla «de todos los cruces» será ancha (de Finta en el mínimo a Fuerte en el máximo) y quizá más larga de decir, que es lo que #264 mide: el orden importa (abajo).
- Lo que no debería hacerse: crecer la barra al texto (deshace B1: el lienzo encogía bajo el cursor, `style.css:458-462`) ni recortar «Cuenta: …» sin decir dónde se lee entero.

## Conflictos

- **#253 y #264, juntos y en este orden**: #253 decide qué dice `deGolpe` (`src/client/batalla/prevision.ts:48-70`); #264 mide si cabe. Hacerlas por separado es medir dos veces.
- **#257** (panel mientras se anima): toca el animador y «En el campo», no `#status` ni la previsión. Sin solapamiento de reglas; como mucho, `escena.ts` en los dos (merge, no conflicto).
- **#246** (arena a 1024): el mismo ancho, otro sitio. `#statusbar` es el pie de página a todo el ancho (`src/client/arena/index.html:62-64`), fuera del montaje. Sin conflicto.
- **#283, #284, #202**: nada en común.
- **#282** (IA de la rueda que no sortee): leerá `previsionDeLaRueda`. Dependencia suave: razón de más para no cambiar su forma aquí.

## Coste contra valor

Barato y vale: la cuenta del cruce ya existe por tipo (`previsionDeLaRueda`, `previsionDelGolpeQueViene`); falta decir lo que ya se sabe, más un ajuste de la barra. No hacerlo nunca: la persona sigue leyendo cifras falsas en cada golpe, ahora que toda batalla es de rueda. Lo único caro es la pasada de `pnpm capturas` que pide #264 (~245 s por vuelta, para siempre): ya hay una pasada de la arena que pasa el ratón con una carga del hermano de carga a 1440 px (`tools/qa/capturas/pasadas/arena.ts:533-680`); `capturas` solo falla por errores de consola, así que una pasada nueva a 1024 que no **compruebe** que `#status` no desborda no vigila nada.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación
>
> 1. **La barra no promete lo que la rueda puede rebasar.** Al pasar el ratón por un enemigo cuerpo a cuerpo, el daño del golpe y el del contraataque que dice la barra cubren todo lo que puede pasar en la rueda de la batalla (3, 5 o 7): cualquier golpe de quien pega contra cualquier respuesta, con Fuerte, Rápido y su número de golpes, en los dos lados. Vale decir la horquilla de todos los cruces o decir menos y remitir a donde se lee entero; **no vale** remitir a la rueda para el contraataque, que la rueda al golpear no lo dice.
> 2. El barrido de `test/prevision.test.ts` deja de excluir Fuerte y Rápido (`:66-79`): el daño real de todo golpe y todo contraataque cae dentro de lo que dice la barra. Se ve morder volviendo a la previsión de antes.
> 3. Sin cambios en lo que devuelve `previsionDeLaRueda` al agente; `pnpm banco` igual (la IA no lee la previsión del golpe).
> 4. **La barra a 1024 px.** A 1024, 1100 y 1440 px de ancho, la previsión de un golpe con carga contra una unidad con armadura se lee entera en la partida y en la arena, y el lienzo no cambia de alto al pasar el ratón de una casilla a otra (B1, `style.css:458-462`). Lo que no quepa (una granada con varios alcanzados, una lista de modificadores larga) se recorta diciendo dónde se lee entero, no a mitad de cifra.
> 5. Lo comprueba una aserción (que `#status` no desborde: `scrollHeight` ≤ `clientHeight`) en la pasada de la arena que ya pasa el ratón con la carga (`tools/qa/capturas/pasadas/arena.ts`), a 1024 px; una pasada que solo haga la captura no vale.
