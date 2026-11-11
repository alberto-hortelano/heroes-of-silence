**REENCUADRADA** — el problema es real, y mayor de lo que dice el issue: no es un clic que «cae» en la muralla, es que con la muralla desplegada (lo de salida) la fila de los bandos y la ficha mide 0 px a 1024 y también a 1280×800.

# Crítica — arena-clic-a-1024 (#246)

## El problema real, en una frase

En el montaje de la arena, la franja de la muralla (fila `auto`) se come toda la altura y la fila de los bandos y la ficha (`minmax(0, 1fr)`) se queda en cero, así que en un portátil normal no se ven ni se pueden pulsar los bandos ni la ficha.

El issue lo describe como un problema de «a quién le llega el clic» (`elementFromPoint` → `BUTTON.hex`). Eso es el síntoma. Si se arregla como un problema de clic (z-index, `pointer-events`), el clic llegaría a un botón de 0 px de alto que no se ve.

## La premisa, afirmación por afirmación

Reproducido hoy (11-11-2026, HEAD `180ee9d5`) con Playwright sin pantalla, contra un vite propio en el 3197 con `localStorage` limpio. Guiones en el scratchpad del crítico (`clic-1024.mjs`, `con-unidades.mjs`).

| Afirmación | Verificación |
|---|---|
| «A 1024 px el clic en el nombre de una unidad de un bando no abre su ficha» | **Cierta.** 1024×768 con dos unidades por bando: `#bando-izquierda` y `#ficha` miden `alto 0`, y `#muralla` `123+579`. El clic de Playwright en `button.nombre[data-arena=editar]` «Guardia del temple» espera a que sea visible y no llega (timeout) |
| «`elementFromPoint` da un `BUTTON.hex`» | **Depende del ancho.** A 900×700 da `BUTTON.hex`. A 1024×768/900/600 da `MAIN#montaje` o `DIV.fila` de la rejilla. Lo que se repite en todos los casos es que el bando no tiene alto |
| Solo a 1024 | **Falsa: es más ancho.** 1280×800: bandos y ficha a 0 px. 1440×900: 70 px (el clic entra, pero la ficha abierta se lee en una ranura de 70 px). 1920×1080: 284 px |
| Comentario del 11-11: «No se ha vuelto a reproducir» | Se reproduce a la primera con el navegador limpio. Lo más probable es que quien lo probó tuviera la muralla plegada: el plegado se recuerda en `localStorage` (`arena.muralla.plegada`, `src/client/arena/vista.ts:162`; se lee en `src/client/arena/main.ts:176`). Plegada, 1024×768 da bandos de 552 px y el clic abre la ficha |
| «La disposición que lo causaba (`#muralla` bajo los bandos) sigue igual» | **Cierta.** `src/client/arena/arena.css:51-58` (cuatro columnas) y `:252-254` (`#montaje { grid-template-rows: minmax(0, 1fr) auto }`, `#muralla { grid-row: 2; overflow: visible }`). La altura de la fila `auto` la marca la columna de mandos: el párrafo largo de la muralla y las formas de ejemplo (se ve en la captura de 1440×900) |
| El guion `docs/agents/2026-10-13-ficha-en-tabla/clic-1024.ts` | No existe. En esa carpeta solo están `qa.md:68` y `hallazgos-qa.md:15`, que anotan el síntoma a 1024×900 |

Por qué no lo ha cazado nadie: `pnpm capturas` pasa la arena a 1440×900 (`tools/qa/capturas/partida.ts:625`), el único tamaño de los probados donde los bandos tienen alto suficiente para que entre el clic.

## El día después

- **Para quien juega:** a 1024 y 1280×800 la arena hoy no sirve sin plegar antes la muralla, y nada dice que haya que plegarla. Tras el arreglo, al abrir la arena se ven los bandos y la ficha.
- **Qué se vuelve más difícil:** nada que importe. El arreglo pertenece a `arena.css` y quizá al marcado de la muralla. No toca el núcleo ni el contrato.
- **Qué no debería hacerse:**
  - Que la muralla salga plegada por defecto sin más. Esconde el síntoma y lo deja igual para quien la despliegue a 1024.
  - Parchear el impacto del clic (z-index, `pointer-events`). Deja los bandos a 0 px.
  - Adelgazar el párrafo de la muralla como único arreglo. La fila seguiría a merced del texto.
- **Con `CLAUDE.md`:** sin contradicción. Es interfaz y no jugabilidad. Toca una hoja de estilo, así que `tools/qa/navegador/neutro.ts` aplica.

## Conflictos

- **Tareas en paralelo:**
  - #253+#264 (previsión) y #257 (panel) son de la batalla: el tablero y la barra de estado. No tocan `#montaje` ni `arena.css` según sus `requisitos.md`, y #264 es otro «a 1024 px».
  - #283, #284 (mundos) y #202 (crónica) no tienen nada en común con esto.
  - **Ningún choque.** Si #264 retoca `style.css` por la barra de estado, que el ingeniero de esta tarea no toque la barra.
- **Cola:**
  - #293 (la arena no elige material) y #280 («solo la rueda del héroe» en la arena) tocarían la franja de la muralla o la barra de la arena.
  - Ninguna está en curso. Hacer esta antes las abarata: ponen controles en una franja que ya no se come la página.
- **Trabajo reciente:** nada en `git log -20` toca `src/client/arena/`.

## Coste contra valor

- **Coste:** bajo. Es una disposición CSS de una página, más un guardia de Playwright.
- **Valor:** alto para lo que cuesta. La arena es el banco de combate y el editor del catálogo, y hoy no se puede usar en un portátil de 1280×800 sin descubrir antes el «Plegar».
- **No hacerlo nunca:** cada sesión que pruebe la arena a menos de 1440 lo vuelve a anotar como «no probado», como ya hizo el QA del 13-10.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación (reencuadrados por la crítica)
>
> El problema no es el clic: con la muralla desplegada, la fila de los bandos y la ficha del montaje mide 0 px a 1024×768, 1024×900 y 1280×800, y 70 px a 1440×900 (`#montaje { grid-template-rows: minmax(0, 1fr) auto }`, `arena.css:252`). El síntoma del issue (`elementFromPoint` da la muralla) es consecuencia.
>
> 1. Con `localStorage` limpio (muralla desplegada) y con la muralla plegada, a 1024×768, 1280×800, 1440×900 y 1920×1080, en el montaje con dos unidades por bando: los dos bandos y la ficha tienen un alto útil (como poco, el de la cabecera del bando y una fila de unidad enteras dentro de la vista), y `elementFromPoint` en el centro del nombre de cada unidad de cada bando da ese botón (o algo dentro de él).
> 2. El clic de Playwright en el nombre abre su ficha, y la ficha se lee: título y tabla de cifras visibles sin desplazar la página.
> 3. La muralla sigue alcanzable y usable desplegada a esos tamaños: la rejilla, las herramientas y las formas, aunque sea desplazándose.
> 4. A ≤ 760 px (el móvil, `arena.css:305`) no cambia nada.
> 5. Un guardia de Playwright que haga 1 y 2 a 1024×768 con la muralla desplegada, visto fallar con el CSS de hoy. Puede ir en el recorrido de la arena de `pnpm capturas` o en un guion propio en `tools/qa/navegador/`, a decidir por el arquitecto.
> 6. `tools/qa/navegador/neutro.ts`, por tocar una hoja de estilo.
>
> Fuera: que la muralla salga plegada por defecto como único arreglo; parches de z-index o `pointer-events`; reescribir el texto de la muralla como único arreglo.
