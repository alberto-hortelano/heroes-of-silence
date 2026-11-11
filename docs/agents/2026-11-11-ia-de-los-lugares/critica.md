**REENCUADRADA** — el problema es real y barato, pero no es «el primer desenlace»: es que, entre las opciones con premio que la IA puede elegir a la vez en un lugar, gana la que está escrita antes. Fuera la medida (retirada) y el «para cuando»: ya se cumple.

# Crítica — ia-de-los-lugares (#284)

## El problema real, en una frase

Cuando hay varias opciones con premio elegibles en el mismo lugar, la IA de reglas se queda con la primera en el orden del fichero (`src/core/ai/lugares.ts:109`, `todas.find(...)`), así que es el autor de `historia.json`, y no la regla, quien decide qué toma el rival y, si las opciones se excluyen, qué se le cierra a quien juega.

La solución del issue (elegir por valor o sortear) ataca eso. El nombre («primer desenlace») se queda corto: también vale para dos premios del mismo desenlace (abajo, el marqués).

## La premisa, afirmación por afirmación

- **«`ai/lugares.ts` elige la primera opción con premio no cobrado o con encuentro, `PASOS_HACIA_UN_PREMIO` = 3».** Cierto: `lugares.ts:60` (la constante), `:107-119` (`primera`). `elegibles` (`:63-74`) recorre los puntos, después los nodos a los que se llega y, en cada uno, las opciones en el orden en que están escritas. El núcleo no tiene orden: `motivoDeLaOpcion` filtra cada opción por separado (`:68`). Lo que depende del orden es solo la decisión de la IA.
- **«La rama `claude/affectionate-gould-410d85` (los desenlaces excluyentes)».** Ya está en `main`: `git merge-base --is-ancestor` da que sí. La skill que la trajo dice «La IA del rival elige **la primera opción con premio** en el orden escrito» (`.claude/skills/motor-de-mundos/SKILL.md:237`): o sea, el comportamiento está documentado como algo que el motor tiene que tener en cuenta.
- **«La IA toma siempre el desenlace que el motor escribió primero».** Solo es verdad si los dos desenlaces están en el mismo lugar, como en el ejemplo de la skill (`SKILL.md:197-212`, las dos opciones en el mismo nodo). El único mundo del repo que tiene desenlaces excluyentes es `ejemplo` (`pnpm mundo medir ejemplo`: `causa-escrita / orden-quemada`; `prueba` no tiene ninguno), y allí están en **lugares distintos**: `torre-de-fondovalle` (`historia.json` `/lugares/3/dialogos/ines/nodos/la-orden`, opción 0) y `quinta-de-los-osorio` (`/lugares/5/…/marques/nodos/la-orden`, opciones 0 y 1). En `ejemplo`, el desenlace del rival lo decide el lugar al que llega primero, y todos los lugares valen lo mismo (`VALOR_DE_LUGAR`, `strategy.ts:127-129`). El orden escrito no entra en eso.
- **Donde el orden sí se nota hoy en `ejemplo`:** en el marqués, la opción 0 da 300 de oro y el arnés, y la 1 da 500 y el arnés (pide además `el-fuego-del-robledal`). Si las dos se pueden elegir, la IA se lleva la de 300 porque está escrita antes.
- **«Para cuando la IA visite lugares de verdad (H9)».** Ya los visita: `strategy.ts:127` (`hariaAlgoEn` cuenta para elegir destino) y `turn.ts:230` (`jugadaEnElLugar` cuando llega). El comentario del dueño del 11-11 lo da por cumplido.
- **«Medida: `tools/qa/lugares-ia.ts`».** Se retiró en `54016b35` (`docs/historia.md:5927`), y además mide jugabilidad, que está fuera de alcance. Se quita.
- No hay ningún test que pruebe la regla de `ai/lugares.ts`: en `test/` solo la importa `invariantes-partida.test.ts:163`, que comprueba los imports y no lo que elige.

## ¿Es un problema de reglas o prematuro?

Lo que la IA decide no es criterio de aceptación (CLAUDE.md, «No se prueba la jugabilidad»). Lo que se acepta aquí no es que la IA elija bien, sino una propiedad que se comprueba sin jugar: **cambiar el orden de las opciones no cambia cuál elige la IA, identificada por lo que hace y no por su posición**. Es justo la prueba que pidió el dueño en el issue. No es prematura: la IA ya entra en los lugares, la skill ya pide desenlaces excluyentes y la medida que lo condicionaba ya no existe.

## El día después

- **Para quien juega:** con `ejemplo` tal como está, los desenlaces no cambian (están en lugares distintos). Cambia lo que elige el rival cuando tiene varios premios a la vez, como el marqués. Con un mundo nuevo que ponga los dos desenlaces en el mismo lugar, el orden en que el motor los escriba deja de decidir cuál toma el rival.
- **Qué se cierra:** el motor ya no puede orientar al rival hacia un desenlace poniéndolo antes, que es justo lo que la skill le enseña hoy. Hay que reescribir `SKILL.md:237`.
- **Qué hay que borrar o reescribir y nadie se acordará:** `SKILL.md:237`; la frase «la primera opción que da algo aún no cobrado…» de `docs/areas/mundos.md:83`; la cabecera de `lugares.ts:1-15` y el comentario de `primera` (`:103-106`).
- **Lo que no debería hacerse:**
  - `hariaAlgoEn` no puede tirar dados. `objectValue` la llama para cada lugar al puntuar destinos (`strategy.ts:127`), y si gastara tiradas de la partida, solo mirar el mapa cambiaría las tiradas que vienen después.
  - El caso del empate tiene que quedar escrito en los criterios. Si se sortea por posición, o si ante dos premios iguales se desempata por posición, el resultado sigue dependiendo del orden y el test del dueño no lo detecta.
  - No hay que tocar `PASOS_HACIA_UN_PREMIO` ni la búsqueda de caminos sin premio (`:111-118`), que no tienen nada que ver con esto.
- No contradice ninguna decisión de CLAUDE.md. Sin mundo no hay lugares, así que `pnpm banco` no cambia (`lugares.ts:17-18`).

## Conflictos

- **#283 (quien-puso-la-marca), dependencia oculta y choque de texto.**
  - Si #283 guarda quién pone cada marca (la idea del issue: «como `Cobro`»), lo más probable es que cambie `EstadoDelMundo.marcas` o `trasLosEfectos`, y `trasElegir` (`lugares.ts:90-101`) usa los dos.
  - Las dos tareas reescriben la misma sección de la skill («El mundo es de los dos», `SKILL.md:229-237`) y seguramente el mismo párrafo de `docs/areas/mundos.md:83`, que es una sola línea, así que el conflicto en git es seguro.
  - **Orden:** primero #283 y después #284, con un rebase. Si van en paralelo, el coordinador fusiona esas dos líneas a mano.
- **#302 (regenerar `ejemplo`):** no depende de esta tarea ni esta de ella.
- **#253+#264, #257, #246, #202:** no tocan nada en común (batalla, arena, crónica del espectador).
- **`git log -20`:** #321 cambió `lugarBlocker` (`mundo/validar.ts`), no la IA. No choca.

## Coste contra valor

El coste es poco: una función, un test y tres sitios de la documentación. El valor también es poco: solo cambia algo cuando hay dos premios elegibles en el mismo lugar y el rival llega antes. Si no se hiciera nunca, la skill seguiría tapándolo con la línea 237 y los autores colocarían los desenlaces sabiéndolo. Aun así sale a cuenta: arregla un defecto de la regla de la IA sin medir nada, y el dueño ya ha dicho cómo comprobarlo.

## Qué le cambiaría a `requisitos.md`

Sustituir la sección «Criterios de aceptación» por esta:

> ## Criterios de aceptación
>
> 1. Entre las opciones con premio que la IA de reglas puede elegir a la vez en un lugar (`elegibles` de `src/core/ai/lugares.ts`), la que elige no depende del orden en que están escritas: con los mismos puntos y opciones en otro orden (dos desenlaces excluyentes en el mismo nodo, como el ejemplo de la skill; y dos premios del mismo desenlace, como el marqués de `ejemplo`), `jugadaEnElLugar` elige la misma opción, comparada por lo que hace y no por su índice. Un test lo comprueba y se le ve morder contra el `find` de hoy.
> 2. Si hay empate, la regla lo dice y el test lo cubre. Un empate que se resuelva por la posición no cumple el criterio 1.
> 3. `hariaAlgoEn` no gasta tiradas: puntuar destinos no cambia las tiradas de la partida.
> 4. Se reescriben, sin dejar restos, `SKILL.md` («La IA del rival elige la primera opción con premio en el orden escrito»), la frase de la regla de la IA en `docs/areas/mundos.md` y la cabecera de `ai/lugares.ts`.
> 5. Sin mundo, `pnpm banco` no cambia.
>
> Fuera: la medida `tools/qa/lugares-ia.ts` (retirada en `54016b35`) y cualquier medida de qué desenlace toma la IA. Orden: después de #283 (toca `EstadoDelMundo.marcas` y la misma sección de la skill).
