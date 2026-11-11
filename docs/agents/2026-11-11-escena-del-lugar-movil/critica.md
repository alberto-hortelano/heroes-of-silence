**REENCUADRADA** — dos de los cuatro puntos (1 y 2) son fallos reales en `main` y bastante más generales de lo que dice el issue; los otros dos (3 y 4) tratan de código que **no está en `main`**: vive en la rama sin fusionar `claude/templarios-faction-game-fa463e` (c09a4c51, 9a533eb5, 243c56f4). Esos dos son PREMATUROS hasta que se fusione la rama, y uno de ellos ya está hecho allí.

## El problema real, en una frase

En el móvil, una conversación abierta desde el panel lateral queda por encima de lo que se ve, y en el tema templario cualquier fila-botón del lateral se vuelve ilegible bajo el ratón. El resto del issue son pendientes del arte de los lugares, que todavía no ha llegado a `main`.

## La premisa, punto por punto

**Base de la tarea.** `requisitos.md` dice «rama igual a `main`, `d791d03c`». Pero los dos commits de los que «viene» el issue no están en esa rama: `git merge-base --is-ancestor 243c56f4 HEAD` y el mismo con `9a533eb5` fallan los dos. Solo los contiene `claude/templarios-faction-game-fa463e`, que tiene worktree propio, está limpio y no se ha subido a `origin`. En `main` no existen `src/client/render/lugar/` (ni `arte.ts` ni `pintar.ts`) ni el mundo `templarios`: `assets/mundos/` tiene solo `ejemplo` y `prueba`. Las capturas citadas están en ese worktree (`.claude/worktrees/templarios-faction-game-fa463e/docs/agents/2026-11-10-arte-de-los-lugares/capturas/`).

1. **«Mirar» a 380 px deja el título fuera: verdadero, y pasa también en `main`.** La captura `qa-real-380-3-ermita-cruz-hablando.png` lo enseña: solo se ven «Tocar la madera» e «Irse», con el lateral debajo. El mecanismo está en `main`:
   - en el móvil, `#stage` se desplaza (`style.css:520`, dentro de `@media (max-width: 760px)`, `style.css:508`) y el lateral queda bajo un lienzo de `62dvh` (`style.css:521`);
   - el diálogo se ancla arriba del lienzo (`.conversacion { position: absolute; top: 1rem }`, `style.css:552-566`);
   - `mostrarConversacion` lo abre con `conversacion.show()` y no lo trae a la vista (`partida/dialogos.ts:30-36`).

   Quien baja para pulsar «Mirar» en el lateral abre el diálogo por encima de lo que ve. El fallo no es de la escena del lugar: es de toda conversación que se abre desde el lateral cuando el escenario está desplazado. La rama, además, reescribe `dialogos.ts` (la charla de la base y de los sitios vivos, +70 líneas) y añade reglas `.conversacion:has(.charla)` en `style.css`. Cuando se fusione, la charla tendrá que comportarse igual.
2. **El botón de «Lo que hay» oscuro bajo el ratón: verdadero (`qa-dia-1920-3b-ermita-cruz-sin-dialogo.png`), está en `main` y afecta a mucho más que el lugar.**
   - `:root[data-tema] #lateral .stack` pone la letra en `--lateral-alt-tinta` (`forma.css:114-120`), que en templarios es `#372b22`, oscuro (`temas.css:190`).
   - `.stack` da el fondo con especificidad (0,1,0) (`style.css:392-400`) y pierde contra `button:hover:not(:disabled)` (`style.css:382`), que pone `--boton-encima`: `--boton` `#2e2922` (`temas.css:152`) mezclado con un 10 % de blanco (`temas.css:47`).
   - Resultado: letra oscura sobre fondo oscuro en **todo** `button.stack` no elegido del lateral templario: héroes (`partida/mapa/panel.ts:193`), ciudades (`:207`), objetos (`:309`), sitios de la base (`partida/base/panel.ts:288`), tropa (`partida/tropa/panel.ts:41`), morada (`partida/morada/panel.ts:51`) y lugar (`partida/lugar/panel.ts:23`).
   - La fila elegida (`.stack.primary`) no lo sufre: `forma.css:123-128` le fija el fondo de pergamino con más especificidad.
   - En los otros cuatro temas `--lateral-alt-tinta` es clara (`temas.css:273, 353, 430, 519`), así que hoy solo falla templarios. Comprobarlo en los cinco sigue siendo el criterio correcto.
3. **Rótulos de cosas vecinas que se tocan, y el de la cosa que repite el del mojón: no tiene sujeto en `main` y en la rama está medio hecho.**
   - En `main` no hay cosa pintada: solo el mojón, con su rótulo dentro de `pintarMojon` (`partida/lugar/escena.ts:390-435`).
   - En la rama, la repetición ya se resolvió: `pintarElRotulo` (`render/lugar/pintar.ts:72`) lo usan la cosa y el mojón (`escena.ts:516` de 243c56f4; `implementacion.md`, «c. Un solo rótulo»).
   - El choque a 2,4 pasos salió «en el mundo de mentira» (una condición cambiada a mano). Con el mundo de verdad, la cosa más cercana a la cruz está a 4 pasos (`implementacion.md` de la rama, «Qué NO queda comprobado»). Hoy ningún mundo escrito lo provoca.
4. **Marcador en la primera apertura antes de que carguen las imágenes: sin sujeto en `main`.** Es el arte de los lugares (`render/lugar/arte.ts`, solo en la rama). El mismo ingeniero lo dejó en «no lo vi fallar», porque el mapa lo precarga.

## El día después

- Con 1 y 2 hechos en `main`: en el móvil se lee lo que se mira o se dice, y el lateral templario se puede usar con el ratón en todas las pantallas, no solo en los lugares. Es lo único del issue que cambia algo para quien juega hoy.
- Si se hacen 3 y 4 en `main`, habría que traer o reescribir `render/lugar/` y el mundo `templarios`. Eso es fusionar la rama de tapadillo y garantiza un conflicto grande en `partida/lugar/escena.ts` (+121 líneas en la rama), `dialogos.ts`, `sesion/partida.ts` (+478)…
- El criterio 5 pide capturas de la ermita con arte. En `main` no se puede: las de 1 y 2 salen con `?mundo=prueba` (mojones) y con cualquier panel templario.

## Conflictos

- **Dependencia oculta: la rama `templarios-faction-game` sin fusionar.** Todo lo que toque `dialogos.ts` o las reglas de `.conversacion` en `style.css` choca con ella. `forma.css` y `temas.css` no los toca la rama (`git diff --stat HEAD 243c56f4` no los lista), así que el punto 2 no choca.
- **Con la tanda en paralelo.**
  - #321 (lugar inalcanzable) viene del mismo cierre, y la rama cambia `core/mundo/validar.ts` (+226 líneas): su crítico debería saberlo. No choca con esta tarea.
  - #313+#317 (contrato), #305 (plan del agente), #327 (taller) y #202 (crónica del espectador): sin ficheros en común con 1 y 2.
- **Cola.** #320 pide pasar `pnpm capturas` y `neutro.ts` tras la rama: si aquí se toca una hoja, esta tarea corre `neutro.ts` y lo cita. #328, #329 y #331 son de la misma rama y ya están fuera.

## Coste contra valor

1 y 2 son baratos (CSS y, como mucho, traer a la vista el diálogo al abrirlo) y arreglan cosas que hoy se ven en cada partida templaria y en cada móvil. 3 y 4 en `main` cuestan una fusión y no arreglan nada que pase con un mundo de verdad. Si no se hicieran nunca, el 3 seguiría sin caso y el 4 sería un parpadeo «no visto fallar».

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Alcance (tras la crítica).** Sobre `main` (d791d03c), que **no** contiene la rama `claude/templarios-faction-game-fa463e` (9a533eb5, 243c56f4: `render/lugar/`, el mundo `templarios`, la charla). Se hacen los puntos 1 y 2; los puntos 3 y 4 se quedan en #332, que sigue abierto, como pendientes de esa rama (el «rótulo que repite» ya está hecho allí: `pintarElRotulo`).
>
> 1. A 380 px, la conversación que se abre desde el panel lateral («Mirar» o «Hablar» en un lugar, con el escenario desplazado) queda entera a la vista: quién, el texto y las opciones. Captura con `?mundo=prueba` a 380 px, antes y después.
> 2. Toda fila-botón del panel lateral (`button.stack`: héroes, ciudades, objetos, sitios de la base, tropa, morada, «Lo que hay» del lugar) se lee bajo el ratón en los cinco temas, y también la elegida. Capturas a 1920 px con templarios (donde falla hoy) y al menos otro tema. `tools/qa/navegador/neutro.ts` si se toca una hoja.
> 3. Fuera de alcance: los rótulos de cosas vecinas y la precarga del arte del lugar (puntos 3 y 4 de #332), que no existen en `main`.
