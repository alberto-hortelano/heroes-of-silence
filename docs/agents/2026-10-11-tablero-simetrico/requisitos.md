# Tablero de batalla simétrico, con una columna más

## Petición literal

> «Tambien haz el tablero de la pelea simetrico con una columna mas»

Respuestas del usuario (11-10-2026), con la vista previa elegida:

- Forma: **filas pares de 12 casillas e impares de 11**, metidas entre ellas:
  simétrica de izquierda a derecha.

  ```
  fila 0  ⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡   (12)
  fila 1   ⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡    (11)
  fila 2  ⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡   (12)
  …
  fila 8  ⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡⬡   (12)
  ```

  9 filas: 5 de 12 y 4 de 11 = **104 casillas**.
- Alcance: **arena y juego**, un solo tablero para todo.

## Criterios de aceptación

1. La rejilla de batalla es la de arriba en todo: batallas del mapa, arena,
   asaltos y la muralla de la arena. Un solo hecho en `core` dice qué casillas
   existen (la casilla que falta al final de cada fila impar no existe: no se
   pisa, no se apunta, no se pinta, no la ofrece `legalActions`).
2. **Simetría**: el tablero es su propio espejo izquierda-derecha. El despliegue
   de los dos bandos (puestos de salida) es espejo exacto el uno del otro, y una
   batalla con los dos bandos iguales no favorece a ninguno por la geometría
   (medirlo: p. ej. espejo de la arena IA contra IA con muchas semillas).
3. Distancias, vecinos, línea de tiro, carga en línea recta, unidades de dos
   casillas, pasos de la IA y la muralla funcionan en la forma nueva (tests de
   las casillas del borde derecho de las filas impares y pares).
4. El cliente pinta la forma nueva (partida, arena, espectador) y el ratón
   acierta en todas las casillas; la escala del tablero (`escalaDelCombate`) sigue
   cabiendo en las pantallas de siempre.
5. El agente recibe el tablero nuevo: el contrato dice el tamaño/forma de la
   rejilla (no un 11 escrito a mano) y lo que el agente manda se valida contra él.
6. Las formas de muralla guardadas (`data/borradores/murallas.json` y los
   ejemplos) y los enlaces `?montaje=` con muralla siguen leyéndose o se
   rechazan diciendo por qué; decidirlo y decirlo.
7. CLAUDE.md, tabla de reglas: «Rejilla de batalla 11 × 9 = 99 hexes, offset
   odd-r» pasa a la nueva, marcada **regla nuestra** (fheroes2 es 11×9).
8. `pnpm banco` cambia a propósito: se re-ancla y se juzga la forma del diff;
   `barrido-semillas.ts` sigue en 0 sin terminar; `enfrentamiento.ts` no
   empeora; `pnpm qa` y `pnpm capturas` en verde.

## Fuera de alcance

- Cambiar el número de filas (siguen 9).
- Arte nuevo del tablero o de las figuras.
- Cambiar las reglas de combate más allá de lo que obligue la geometría.

## Contexto

- Hay **otro ciclo en marcha** que toca la arena: la página de edición
  (`docs/agents/2026-10-11-pagina-de-edicion/`: `src/client/arena/main.ts`,
  `paneles.ts`, `arena.css`, `index.html`, `tools/qa/capturas.ts`). Y el árbol
  tiene sin commit el ciclo de poderes y edición en combate
  (`docs/agents/2026-10-11-poderes-y-edicion-en-combate/`). Son la base; los
  ingenieros de los dos ciclos irán uno tras otro, no a la vez.
- Hoy: «Rejilla de batalla 11 × 9 = 99 hexes, offset odd-r», verificada contra
  fheroes2; la muralla de la arena (`battle/muralla.ts`, puertas entre dos
  casillas de la misma fila) y `escalaDelCombate` (también la de la base) cuelgan
  de ella.
- Máquina compartida: presupuesto de pruebas del CLAUDE.md.

## Preguntas abiertas (con suposición por defecto)

- ¿Dónde salen los bandos? → en las columnas de los extremos, como hoy, en espejo.
- ¿Las coordenadas siguen siendo `{col,row}` en odd-r con la última casilla de
  las filas impares inexistente, o se pasa a otro sistema? → lo decide el
  arquitecto, con el menor cambio que mantenga un solo hecho.

## Decisión del usuario sobre el plan (11-10-2026)

Plan aprobado tal cual, con la línea de tiro **generosa** que propone el
arquitecto: el tiro pasa si pasa con el empujón de hoy o con su espejo; las
casillas fuera del tablero que cruce el rayo se saltan.
