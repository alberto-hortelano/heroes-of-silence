# Requisitos — escena-del-lugar-movil

Tarea: `2026-11-11-escena-del-lugar-movil`. Issues: 332. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `d791d03c`).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos. Lo que pide cada issue, tal cual:

### #332 — Escena del lugar: «Mirar» a 380 px, el botón oscuro del panel y los rótulos que se tocan

> - A 380 px, tocar «Mirar» en el panel deja el título y el texto del diálogo fuera de la pantalla (el lienzo queda a −40 px): solo se ven las opciones.
> - El botón del panel «Lo que hay» bajo el ratón queda oscuro con letra oscura (1920 px, tema templario).
> - El rótulo de dos cosas vecinas puede tocarse a 380 px (pasó a 2,4 pasos); el rótulo de la cosa repite el del mojón (`src/client/partida/lugar/escena.ts`).
> - La primera apertura de un lugar antes de que carguen sus imágenes se ve con marcador.
> 
> Capturas: `docs/agents/2026-11-10-arte-de-los-lugares/capturas/qa-real-380-3-ermita-cruz-hablando`, `qa-dia-1920-3b` (no commiteadas).
> 
> Viene del cierre de «La base con vida» y «Arte de los lugares» (10/11-11-2026, commits 9a533eb5 y 243c56f4; detalle en `docs/agents/2026-11-10-base-con-vida/` y `docs/agents/2026-11-10-arte-de-los-lugares/`).

## Criterios de aceptación

1. A 380 px, tocar «Mirar» en el panel deja el título y el texto del diálogo a la vista (el lienzo no queda en −40 px).
2. El botón del panel «Lo que hay» bajo el ratón se lee (contraste) con el tema templario y con los demás temas; 1920 px.
3. Los rótulos de dos cosas vecinas no se tocan a 380 px, y el de la cosa no repite el del mojón.
4. La primera apertura de un lugar antes de que carguen sus imágenes no enseña el marcador (o espera a las imágenes, o las precarga).
5. Cada punto se ve en capturas con Playwright sin pantalla (380 px y 1920 px), dejadas en `docs/agents/2026-11-11-escena-del-lugar-movil/capturas/`.

## Fuera de alcance

#328 (la pieza horneada en el escenario), #329.

## Contexto

Área: `docs/areas/interfaz.md`, `docs/areas/mundos.md`. `src/client/partida/lugar/escena.ts`. Si se toca una hoja de estilo: `tools/qa/navegador/neutro.ts`. `pnpm capturas` no (lo pasa el coordinador al final de la tanda).

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`): #332 viene de commits (9a533eb5, 243c56f4) que solo están en la rama `claude/templarios-faction-game-fa463e`, sin fusionar en `main`, y esa rama reescribe `dialogos.ts` y las reglas de `.conversacion`. Decisión del coordinador: **en esta tarea solo el punto 2** (no choca con esa rama); el 1, el 3 y el 4 se quedan en #332 hasta que la rama entre en `main`. Los criterios de arriba quedan **sustituidos** por este:

1. Toda fila-botón del panel lateral (`button.stack`: héroes, ciudades, objetos, sitios de la base, tropa, morada, «Lo que hay» del lugar) se lee bajo el ratón en los cinco temas, y también la elegida, con un contraste razonable entre letra y fondo. Capturas a 1920 px con templarios (donde falla hoy) y al menos otro tema, antes y después, en `capturas/` de esta carpeta. `tools/qa/navegador/neutro.ts` pasa (se toca una hoja).

Sin crítico de diseño aparte: es una regla de estilo. Ingeniero directo; el coordinador mira las capturas.
