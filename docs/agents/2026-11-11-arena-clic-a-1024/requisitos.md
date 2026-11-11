# Requisitos — arena-clic-a-1024

Tarea: `2026-11-11-arena-clic-a-1024`. Issues: 246. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (sobre `main` `d791d03c`, con la tanda 1 fusionada: #327, #332 punto 2, #305, #313+#317, #321; #202 en QA).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos (tanda 2). Lo que pide cada issue, tal cual:

### #246 — Arena: a 1024 px el clic en el nombre de una unidad del montaje cae en la muralla

> En el montaje de la arena a 1024 px de ancho, `elementFromPoint` sobre el nombre de una unidad de un bando da un `BUTTON.hex` del editor de murallas y el clic no llega a abrir su ficha. Pasa también en f25dec5 (anterior a la ficha en tabla). Script de reproducción: `docs/agents/2026-10-13-ficha-en-tabla/clic-1024.ts` (sin commitear; pedirlo o rehacerlo con Playwright).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que sustituye a los criterios de arriba. Sin arquitecto (decisión del coordinador): es la rejilla de una hoja de estilo; el ingeniero decide dónde va el guardia (5) y lo explica en `implementacion.md`.

El problema no es el clic: con la muralla desplegada, la fila de los bandos y la ficha del montaje mide 0 px a 1024×768, 1024×900 y 1280×800, y 70 px a 1440×900 (`#montaje { grid-template-rows: minmax(0, 1fr) auto }`, `arena.css:252`). El síntoma del issue (`elementFromPoint` da la muralla) es consecuencia.

1. Con `localStorage` limpio (muralla desplegada) y con la muralla plegada, a 1024×768, 1280×800, 1440×900 y 1920×1080, en el montaje con dos unidades por bando: los dos bandos y la ficha tienen un alto útil (como poco, el de la cabecera del bando y una fila de unidad enteras dentro de la vista), y `elementFromPoint` en el centro del nombre de cada unidad de cada bando da ese botón (o algo dentro de él).
2. El clic de Playwright en el nombre abre su ficha, y la ficha se lee: título y tabla de cifras visibles sin desplazar la página.
3. La muralla sigue alcanzable y usable desplegada a esos tamaños: la rejilla, las herramientas y las formas, aunque sea desplazándose.
4. A ≤ 760 px (el móvil, `arena.css:305`) no cambia nada.
5. Un guardia de Playwright que haga 1 y 2 a 1024×768 con la muralla desplegada, visto fallar con el CSS de hoy. Puede ir en el recorrido de la arena de `pnpm capturas` o en un guion propio en `tools/qa/navegador/`, a decidir por el arquitecto.
6. `tools/qa/navegador/neutro.ts`, por tocar una hoja de estilo.

Fuera: que la muralla salga plegada por defecto como único arreglo; parches de z-index o `pointer-events`; reescribir el texto de la muralla como único arreglo.
