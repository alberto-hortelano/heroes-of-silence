**VIGENTE**: el problema es real y la propuesta lo ataca. Hay que precisar tres cosas en los criterios, ninguna cambia el encuadre.

# Crítica: quien-puso-la-marca (#283)

## El problema real, en una frase

Cuando el rival cierra un desenlace poniendo una marca, quien juega ve la opción apagada con una frase neutra del mundo y no sabe que se la ha cerrado el otro. Con los premios eso ya se dice («Grishnak (Orkos) ya se llevó…»). La propuesta (apuntar quién puso cada marca y nombrarlo si no fue quien juega) ataca justo eso.

## La premisa, afirmación por afirmación

| Afirmación del issue | Verificación |
|---|---|
| El motivo de `{no:{marca}}` es la frase `ya` tal cual, en `condicionBlocker`, rama `'marca' in n` | Cierto: `src/core/mundo/reglas.ts:125`. No hay nada de quién |
| `estados` y `marcas` son de la partida y no apuntan quién | Cierto: `marcas: string[]` en `src/core/mundo/formato.ts:375-376`. Solo escribe ahí `aplicarEfectos`, en `src/core/state/lugares.ts:79-82` |
| `yaCobrado` dice el héroe y la facción del otro | Cierto: `reglas.ts:147-178`, con `esMio`/`otro` en `reglas.ts:181-188` y `Cobro {jugador, heroe}` en `formato.ts:360-363` |
| La skill pide que el `ya` describa el mundo y lo vigila un guardia | Cierto: `.claude/skills/motor-de-mundos/SKILL.md:233` y `test/motor-de-mundos.test.ts:235` (H6) |
| La rama `claude/affectionate-gould-410d85` (desenlaces excluyentes) | **Ya está en `main`** (`git merge-base --is-ancestor` da verdadero). La premisa no depende de una rama pendiente |
| «Hoy es raro: el rival casi no visita lugares» | **Ya no es cierto.** La IA va a los lugares en los que haría algo (`hariaAlgoEn`, `src/core/ai/strategy.ts:127`), como dice el comentario del 11-11 en el issue. Eso refuerza la tarea |
| Los mundos usan `{no:{marca}}` | Sí: 32 en `assets/mundos/ejemplo/historia.json` y 4 en `prueba` |
| «Como `Cobro`»: siempre hay un héroe que la puso | **Falso en un caso.** `alPerder` pone marcas (en `prueba`, `derrota-en-el-pozo`) con `hero = null`, por el dueño, porque el héroe quizá ya no está en el mapa (`src/core/state/cierre.ts:537-545`). En la rama de los templarios, el narrador también las pone sin héroe (ver «Conflictos») |

## El día después

- **Para quien juega**: si el rival elige primero un desenlace, la opción apagada dice que fue él. Es lo que el mundo compartido ya promete con los premios (`docs/areas/mundos.md:83`: «la frase dice quién»).
- **Lo que cierra**: si el autor se guarda cambiando la forma de `marcas` (pasar de `string[]` a un registro), habría que reescribir a todos sus lectores (`reglas.ts:105`, `formato.ts:448-457` con `trasLosEfectos`, `validar.ts:872`, `ai/lugares.ts:91-97`) y chocaría con #284 y con la rama de los templarios. **No debería hacerse así**: el autor puede ir al lado, sin tocar lo que ya se lee.
- **Lo que nadie borrará**: el guardia H6 y la regla de la skill siguen valiendo con el arreglo, porque la frase neutra sirve igual con nombre delante y sin él. **No se borran ni se relajan en esta tarea.**
- **Fuera del alcance, a sabiendas**: con `{no:{estado}}` pasa lo mismo (`reglas.ts:123`, «"X" ya está …»; el rival también cambia estados, `lugares.ts:65-78`). Los desenlaces excluyentes de la skill son marcas, así que el estado se queda fuera. Si se quiere, va en otro issue.
- No contradice ninguna decisión de `CLAUDE.md`. El agente no entra en lugares (F4), así que el contrato no se toca. Sin mundo no hay marcas, así que `pnpm banco` no cambia.

## Conflictos

- **#284 (IA de los lugares, `ai/lugares.ts`)**: es un solapamiento de fichero, no de lógica. `trasElegir` (`src/core/ai/lugares.ts:90-99`) copia el mundo con `...a.mundo` y reescribe `marcas: [...tras.marcas]`. Si #283 deja `marcas` como está y pone el autor en un campo aparte, no chocan, y el orden da igual. Si cambia la forma de `marcas`, chocan, y la de la IA se tendría que rehacer.
- **Rama sin fusionar `claude/templarios-faction-game-fa463e`** (3 commits sobre `d4aa79b5`): **sí choca, pero solo al fusionar, no en el diseño.**
  - Lleva la escritura de la marca a `aplicarEfectos` en otras líneas (rama `'marca' in e`, con `mundoVivo` y `...deQuien`; en esa rama, `src/core/state/lugares.ts:108-120`). Mueve la copia del mundo de `game.ts:195` a `copiaDelMundo` (`formato.ts`), que nombra campo por campo, y crea mundos vacíos (`HISTORIA_VACIA`, `mundoVivo`).
  - El narrador pone marcas por `aplicarEfectos(state, dueño, null, …, por)`, sin héroe (en esa rama, `lugares.ts:320-321`). Y lee `mundo.marcas` como lista (en esa rama, `src/core/mundo/vivo.ts:668` y `896-898`, `marcasDelNarrador`).
  - Con el autor en un campo aparte que admite «sin héroe», quien fusione después solo tiene que añadir ese campo en `copiaDelMundo` y en el mundo vivo vacío. Cambiar la forma de `marcas` rompería `marcasDelNarrador`.
  - Las marcas del narrador nunca llevan `ya`: no puede poner una de la historia (en esa rama, `vivo.ts:663-665`), así que no entran en esta frase.
- **#202 (crónica, en QA)**: no hay conflicto. El hecho `world_mark` ya lleva `actor` (`lugares.ts:82`) y esta tarea no tiene por qué tocarlo.
- **#253+#264, #257 y #246 (batalla y arena)**: no tocan `mundo/` ni `state/lugares.ts`. Sin conflicto.

## Coste contra valor

El coste es pequeño: un dato que se escribe en un solo sitio (`aplicarEfectos`) y se lee en un solo sitio (la rama `'marca' in n`), más sus tests. El valor es modesto pero real ahora que la IA visita lugares. Si no se hiciera nunca, quien juega pierde un desenlace sin saber por qué, que es justo lo que M2 arregló para los premios. Merece la pena, y barato.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación
>
> 1. **Quién puso cada marca queda apuntado en el mundo de la partida, sin cambiar la forma de `EstadoDelMundo.marcas`** (`string[]`, que leen `trasLosEfectos`, la validación, `ai/lugares.ts` (#284, en paralelo) y la rama de los templarios). Lo apunta la única escritura, `aplicarEfectos` (`state/lugares.ts`), con el dueño siempre y el héroe cuando lo hay. Una marca de `alPerder` llega sin héroe (`cierre.ts`, el héroe puede haber caído).
> 2. **El motivo de una opción apagada por `{ "no": { "marca": … } }` puesta por el otro jugador nombra a quien la puso** (su héroe y su facción, como `yaCobrado`) delante de la frase `ya`. Puesta por quien juega, la frase `ya` tal cual. Sin héroe (`alPerder`), lo dice por la facción del otro, sin lanzar y sin «undefined».
> 3. Lo leen la acción (`opcionBlocker`), la pantalla (`opcionesDe`) y la IA por la misma pregunta (`motivoAlElegir`): ninguna opción encendida que el núcleo rechace.
> 4. Tests en el núcleo, vistos morder: marca del rival → nombre y facción; marca propia → frase sola; marca de `alPerder` → sin héroe y sin lanzar. Con `prueba` (`lanza-cogida` o `peaje-pagado`) basta. La pantalla no cambia de forma, así que basta con un test de `opcionesDe`; ni navegador ni `pnpm capturas` para esto.
> 5. **No se toca**: el guardia H6 de `test/motor-de-mundos.test.ts` ni la regla del `ya` en la skill (siguen valiendo); la condición `{no:{estado}}` (mismo hueco, fuera de alcance: va en un issue aparte si se quiere); el contrato del agente (F4: no entra en lugares).
> 6. Una línea en `docs/areas/mundos.md` (párrafo de «El mundo es de los dos»), con fecha.
