# Hallazgos de QA a corregir (vuelta 2)

Detalle en `qa.md` (sección «Vuelta 2») y en `capturas/qa2-*.png`. El usuario eligió el
**arreglo de fondo** para H6 (13-10-2026).

1. **H1b · El teclado despierta la rueda quieta** (criterio 4 ❌).
   - Hoy el `keydown` llama a `despertarLaRueda` (`arena/main.ts`, hacia la línea 2259). Con →,
     Tab o Shift, el sector que pulsó el primero se enciende bajo el ratón quieto.
   - El teclado no debe despertarla: el foco ya enciende su sector por `:focus-visible`.
   - Sigue siendo correcto que la despierte un movimiento real del puntero o un toque.
   - Hay que comprobarlo en la pasada de capturas (Yo contra Yo: elige con el ratón, luego pulsa →
     y Shift, y que no se encienda el sector que quedó bajo el puntero).
2. **H6 · El tablero enseña la vida de después antes de tiempo.** Es el arreglo de fondo, en la
   partida y en la arena.
   - **Qué se pide**: el `BattleAnimator` (`src/client/anim.ts`) retiene la vida que se pinta de
     cada unidad (`count`/`topHp` o la fracción que lea `pintarVida`) hasta el impacto de cada
     golpe, disparo o hechizo que la cambia, a partir de lo que ya trae el registro (`damage`,
     `killed`, la cura de los poderes…). Así la barra baja golpe a golpe en el momento del
     impacto, también con todo en IA y en la partida.
   - **Lo mismo para quién está activo** mientras quedan pasos en la cola, si cabe sin
     complicarlo; si no, se dice.
   - **Se quita** la «foto» de `SesionDeArena` (`tableroDelCruce` y lo que la sostiene) en cuanto
     la retención del animador cubra el paso `cruce`. Un hecho, un sitio.
   - **El espectador** usa el mismo animador: que siga funcionando.
   - **Comprobación en `pnpm capturas`**: la barra de vida no cambia durante la rueda ni antes del
     impacto, y al final cuadra con el estado. En la partida, la pasada de batalla sigue verde.
3. **H7 · Notas de la respuesta.**
   - Sin contraataque, la nota no puede decir «contraatacas con 2 golpes» y a la vez «esta vez no
     devuelve el golpe». Con el motivo, se escribe solo lo que vale.
   - «No cambia este golpe» se lee como que la elección no influye. Hay que decir que el efecto no
     actúa sobre el golpe que llega, aunque el cruce sí decide cuánto duele.
4. **H8 · La casilla resaltada del activo durante la rueda** es la de después de andar. Con el
   arreglo de H6 (el estado que se pinta mientras hay pasos en cola), el resaltado sigue a la
   figura. Si no sale solo, se arregla aparte.
