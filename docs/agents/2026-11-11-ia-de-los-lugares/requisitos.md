# Requisitos — ia-de-los-lugares

Tarea: `2026-11-11-ia-de-los-lugares`. Issues: 284. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (sobre `main` `d791d03c`, con la tanda 1 fusionada: #327, #332 punto 2, #305, #313+#317, #321; #202 en QA).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos (tanda 2). Lo que pide cada issue, tal cual:

### #284 — IA de los lugares: elige siempre el primer desenlace escrito

> **Qué pasa.** `ai/lugares.ts` elige la primera opción que da un premio no cobrado o abre un encuentro (`primera`, con `PASOS_HACIA_UN_PREMIO` = 3). Con los desenlaces excluyentes que pide la skill del motor (rama `claude/affectionate-gould-410d85`), la IA toma siempre el que el motor escribió primero en el diálogo, y nunca el otro.
> 
> **Por qué importa.** El orden en que el motor escribe las opciones decide el bando de la IA. Una trama con dos salidas se juega siempre igual desde el lado del rival y, como el mundo es de los dos, se le cierra siempre la misma a quien juega.
> 
> **Ideas** (para cuando la IA visite lugares de verdad, H9 de la F1a):
> - Elegir entre las opciones con premio por su valor (`VALOR_DE_LUGAR`, el oro, la pieza, la tropa, con `ventajaClara` para las batallas).
> - O sortear con su corriente de azar, con la facción como peso.
> 
> Medida: `tools/qa/lugares-ia.ts` sobre el `ejemplo` regenerado en la fase B.

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que sustituye a los criterios de arriba, y la pone **después de #283** (misma sección de la skill y de `mundos.md`).

1. Entre las opciones con premio que la IA de reglas puede elegir a la vez en un lugar (`elegibles` de `src/core/ai/lugares.ts`), la que elige no depende del orden en que están escritas: con los mismos puntos y opciones en otro orden (dos desenlaces excluyentes en el mismo nodo, como el ejemplo de la skill; y dos premios del mismo desenlace, como el marqués de `ejemplo`), `jugadaEnElLugar` elige la misma opción, comparada por lo que hace y no por su índice. Un test lo comprueba y se le ve morder contra el `find` de hoy.
2. Si hay empate, la regla lo dice y el test lo cubre. Un empate que se resuelva por la posición no cumple el criterio 1.
3. `hariaAlgoEn` no gasta tiradas: puntuar destinos no cambia las tiradas de la partida.
4. Se reescriben, sin dejar restos, `SKILL.md` («La IA del rival elige la primera opción con premio en el orden escrito»), la frase de la regla de la IA en `docs/areas/mundos.md` y la cabecera de `ai/lugares.ts`.
5. Sin mundo, `pnpm banco` no cambia.

Fuera: la medida `tools/qa/lugares-ia.ts` (retirada en `54016b35`) y cualquier medida de qué desenlace toma la IA. Orden: después de #283 (toca `EstadoDelMundo.marcas` y la misma sección de la skill).

## Antes del ingeniero (11-11-2026)

#283 ya está fusionado en la rama de coordinación (`EstadoDelMundo.quienPuso`, al lado de `marcas`, que no cambia de forma; `marcaPuesta` en `mundo/reglas.ts`). Sin arquitecto (decisión del coordinador): es una función de elección, su test y tres sitios de documentación; el ingeniero escribe en `implementacion.md` la regla de elección y la del empate, con su porqué.
