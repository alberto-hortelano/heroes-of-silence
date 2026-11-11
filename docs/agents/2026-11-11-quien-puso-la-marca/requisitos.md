# Requisitos — quien-puso-la-marca

Tarea: `2026-11-11-quien-puso-la-marca`. Issues: 283. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (sobre `main` `d791d03c`, con la tanda 1 fusionada: #327, #332 punto 2, #305, #313+#317, #321; #202 en QA).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos (tanda 2). Lo que pide cada issue, tal cual:

### #283 — Mundos: la frase «ya» de una marca no dice quién la puso

> **Qué pasa.** El mundo es de los dos jugadores: `estados` y `marcas` son de la partida. Cuando una opción sale apagada por una marca ya puesta (`{ "no": { "marca": … } }`), el motivo es la frase `ya` de la marca tal cual (`condicionBlocker`, `src/core/mundo/reglas.ts`, rama `'marca' in n`). No dice quién la puso.
> 
> **Por qué importa ahora.** La skill del motor pide desenlaces excluyentes con marcas (rama `claude/affectionate-gould-410d85`, `docs/agents/2026-10-22-trama-de-los-mundos/`). Si el rival elige un desenlace primero, el otro se le cierra a quien juega, y este solo lee la frase escrita, sin saber que fue el rival. Para los premios ya está arreglado: `yaCobrado` dice el héroe y la facción del otro (M2 de la F1a). Para las marcas, no.
> 
> La skill pide hoy que el `ya` describa el mundo y no hable a «tú» (lo vigila un guardia en `test/motor-de-mundos.test.ts`). Es un apaño en el texto, no el arreglo.
> 
> **Propuesta.** Guardar quién puso cada marca (como `Cobro` en `EstadoDelMundo.cobradas`) y anteponer «<héroe> (<facción>) …» cuando no fue quien juega, como con los premios.
> 
> Hoy es raro: el rival casi no visita lugares (H9 de la F1a).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **vigente** y precisó los criterios; sustituyen a los de arriba. Sin arquitecto (decisión del coordinador): es un dato que se escribe en un sitio y se lee en otro, y la crítica ya dice dónde; el ingeniero escribe su diseño en `implementacion.md`.

1. **Quién puso cada marca queda apuntado en el mundo de la partida, sin cambiar la forma de `EstadoDelMundo.marcas`** (`string[]`, que leen `trasLosEfectos`, la validación, `ai/lugares.ts` (#284, en paralelo) y la rama de los templarios). Lo apunta la única escritura, `aplicarEfectos` (`state/lugares.ts`), con el dueño siempre y el héroe cuando lo hay. Una marca de `alPerder` llega sin héroe (`cierre.ts`, el héroe puede haber caído).
2. **El motivo de una opción apagada por `{ "no": { "marca": … } }` puesta por el otro jugador nombra a quien la puso** (su héroe y su facción, como `yaCobrado`) delante de la frase `ya`. Puesta por quien juega, la frase `ya` tal cual. Sin héroe (`alPerder`), lo dice por la facción del otro, sin lanzar y sin «undefined».
3. Lo leen la acción (`opcionBlocker`), la pantalla (`opcionesDe`) y la IA por la misma pregunta (`motivoAlElegir`): ninguna opción encendida que el núcleo rechace.
4. Tests en el núcleo, vistos morder: marca del rival → nombre y facción; marca propia → frase sola; marca de `alPerder` → sin héroe y sin lanzar. Con `prueba` (`lanza-cogida` o `peaje-pagado`) basta. La pantalla no cambia de forma, así que basta con un test de `opcionesDe`; ni navegador ni `pnpm capturas` para esto.
5. **No se toca**: el guardia H6 de `test/motor-de-mundos.test.ts` ni la regla del `ya` en la skill (siguen valiendo); la condición `{no:{estado}}` (mismo hueco, fuera de alcance: va en un issue aparte si se quiere); el contrato del agente (F4: no entra en lugares).
6. Una línea en `docs/areas/mundos.md` (párrafo de «El mundo es de los dos»), con fecha.
