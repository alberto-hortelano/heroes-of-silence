# Reorganización de la arquitectura

Rama `claude/codebase-architecture-refactor-3c18fa`, sobre `f44bc018` (main del 06-11-2026).

## Petición literal

Del usuario, 06-11-2026:

> «Analiza la base de codigo. Ha habido muchos comabios ultimamente y puede que haya que reorganizar
> la arquitectura. Plantea mejoras, elimina codigo muerto, unifica y aplica las mejoras que
> consideres oportunas, tienes libertad para modificar lo que quieras a nivel de codigo y
> estructura»

## Decisiones del usuario (06-11-2026, durante el plan)

- **Alcance: profunda.** Código muerto, duplicados y ciclos, y además partir los ficheros gigantes en
  carpetas de módulos cohesivos y ordenar las carpetas del cliente; sin cambiar el comportamiento.
- **Sesiones en paralelo:** «El resto de sesiones se pueden eliminar excepto si hay algo de Mobius,
  que es un analisis de un proyecto y no va a modificar el codigo, los demas estan mergeados o
  descartados.»
- **CLAUDE.md: adelgazarlo también.** Dejar en CLAUDE.md los contratos, un índice compacto de puertas
  (qué → dónde) y cada regla en pocas líneas; el detalle con fechas y medidas pasa a `docs/` para
  leerse cuando haga falta. No se pierde nada, se mueve.
- **`core/rpg/` (personajes del RPG descartado el 01-10): retirarlo**, con su fontanería y sus tests.
- **El arte que el cliente no pinta** (edificios y efectos del 02-10, iconos de piedra y madera):
  **retirarlo**; el arte pasa a `assets/art/retirado/`, fuera del build.
- **fal.ai: retirarlo** (`tools/gen` y el camino muerto del taller); el icono del oro se queda como
  imagen.
- **`plan.md` de la raíz: no se toca.**

## Criterios de aceptación

1. **Ningún cambio de reglas ni de partidas**: `pnpm banco` da el ancla `3ea9e845…` tras cada paso, y
   la huella de identidad (`tools/qa/huella.ts`: mapas, partidas, peleas, serialización al agente,
   escena y sesión del cliente) sale idéntica a la de la línea de base salvo los cambios declarados.
   Cambios declarados permitidos: unificar pantallas que hoy divergen por descuido (se adopta la
   versión buena, dicho en su commit), la prosa del agente sin personajes y los fallos encontrados.
2. **Código muerto fuera**: ninguna exportación sin lector en `src/` ni `tools/` (con su guardia);
   lo retirado por decisión del usuario, fuera con sus tests; ningún `data/*.json` sin lector.
3. **Cero ciclos de importación en ejecución** en `src/` y `tools/` (con su guardia), y las capas de
   `core` y del cliente vigiladas.
4. **Ningún fichero de `src/` ni `tools/` de más de ≈2 000 líneas** salvo `colocar.ts`, que conserva
   `componer` entero (el orden de sus tiradas es el contrato).
5. **Duplicados unificados** donde la salida es la misma (las listas, en `plan.md`).
6. **CLAUDE.md ≤ 50 KB** con un test que lo vigila, y nada de lo que decía se pierde: el detalle
   vive en `docs/areas/*.md`, `docs/calidad.md` y `docs/banco.md`, con las rutas nuevas.
7. **README al día.**
8. Cada guardia tocado o nuevo se ve morder; cada orden documentada se ve arrancar.
9. CI (la suite entera, `test:lento`, `vite build`, el banco y `pnpm qa`) en verde en el PR.

## Fuera de alcance

- Cambiar reglas del juego, cifras de `data/` o el equilibrio.
- Partir `componer` por dentro.
- Reorganizar `test/` en carpetas (cambiaría 201 rutas sin ganar nada).
- Fusionar a `main`: cuando el usuario lo diga.

## Contexto

- El plan aprobado, con las fases y su verificación: `plan.md` de esta carpeta (no se commitea). El
  detalle de los tres arquitectos: `plan-nucleo.md`, `plan-cliente.md` y `plan-herramientas.md`.
- Las mudanzas quedan apuntadas en `rutas.tsv` (fichero o símbolo viejo → nuevo), que se commitea.
- Crítico: se salta (la tarea la acaba de describir el usuario en la conversación).
