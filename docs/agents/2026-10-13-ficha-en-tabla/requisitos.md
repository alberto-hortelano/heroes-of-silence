# La ficha de la arena en tabla, con las notas como tooltip

## Petición literal (13-10-2026)

> En las fichas de edicion de personajes quita la parte superior donde se muetra lo que tendria en la pelea, y la aclaracion de "Cifras del cuerpo, sin el equipo: de ellas sale el nivel"  y las aclaraciones al lado de cada caracteristica. Cualquier aclaracion o nota debe ir como tooltip. Como la que hay al principio de Equipo, de Poderes, habilidades... Las caracteristicas en una sola columna con su valor y despues otra casilla no editable con el valor final, aplicados todos los modificadores. Estandariza la forma de mostrar los modificadores del equipo, que no sea un texto libre

## Contexto

- La ficha está en `src/client/arena/paneles.ts` (`renderFicha`, ~l. 846; también `renderFichaDeCatalogo` y `renderFichaDeHeroe`, que comparten disposición según CLAUDE.md: «una sola disposición en el montaje, la edición y el combate»). Hoy, encima de las cifras: `filaDelNivel` («Índice N · nivel n»), la fila «En la pelea (con el equipo)» (`data-en-la-pelea`) y `<p class="cost">Cifras del cuerpo, sin el equipo: de ellas sale el nivel.</p>`. Los rótulos llevan aclaraciones dentro: «Velocidad (casillas, 2 a 7)», «Disparos (0 = cuerpo a cuerpo)», «Hexes (1 o 2)», «Coste (oro)».
- Notas en párrafo bajo los títulos de sección: Equipo («Suma a las cifras del cuerpo y no cambia el nivel: …REGLA_DEL_ESCUDO»), Poderes («Se usan en su turno…»), Habilidades («Se guardan con la unidad…»), el pie (`pieDeLaFicha`), y en los poderes `queHaceElPoder` al lado de cada etiqueta.
- Lo que suma una pieza hoy es texto libre de `cifrasDePieza` (`hero/equipo.ts`): «+2 ataque, −1 velocidad, a dos manos», usado en la ficha (etiqueta y `<option>`), el editor de equipo (tarjeta, «Suma», aviso del enlace) y otros sitios.
- El usuario pidió en esta sesión **menos pruebas de jugabilidad**: probar reglas y la forma de lo pintado, nada de comparar combates.

## Criterios de aceptación

1. **Fuera de la ficha**: la fila «En la pelea (con el equipo)», la frase «Cifras del cuerpo, sin el equipo: de ellas sale el nivel» y las aclaraciones dentro de los rótulos (rótulos cortos: «Velocidad», «Disparos», «Hexes», «Coste»…). Lo que decían pasa a tooltip.
2. **Toda aclaración o nota de la ficha es un tooltip**, con una forma única (p. ej. un «ⓘ» junto al rótulo o al título de sección con su `title`, accesible por teclado/`aria`): las de Equipo, Poderes, Habilidades, Rasgos, el pie de la ficha, el rango de cada cifra (mínimo/máximo) y lo que hace cada poder. Ningún `<p class="cost">` de nota queda en la ficha (los mensajes de estado —«Ninguno.», un rechazo— no son notas y se quedan).
3. **Las cifras en una tabla de una columna**: una fila por característica con su rótulo, la casilla editable (el valor del cuerpo) y, a la derecha, una casilla **no editable** con el **valor final** aplicados todos los modificadores (lo que pelea: `unidadDeCombate`/`conEquipo`, el mismo cálculo de siempre; en el héroe, con lo que le suma). Daño mínimo y máximo, dos filas. Si el final es igual al del cuerpo se ve igual (sin resaltar); si cambia, se distingue (p. ej. en otro tono). El nivel («Índice N · nivel n») sigue arriba como lectura, sin nota al lado.
4. **Los modificadores del equipo, en una forma estándar, no texto libre**: el núcleo da una lista estructurada de lo que suma una pieza (p. ej. `modificadoresDePieza(p): { cifra, valor }[]` más las marcas como «a dos manos»), y todo sitio que hoy enseña `cifrasDePieza` la pinta igual: misma abreviatura de cada cifra que la tabla, signo siempre, mismo orden. En un `<option>` (que no admite marcado), la misma forma en texto plano. `cifrasDePieza` desaparece o pasa a ser la versión en texto de esa lista (un solo sitio que formatea).
5. **Las tres fichas** (unidad, criatura del catálogo y héroe) siguen con una sola disposición: los criterios 1-3 valen para las tres en el montaje, la edición y el combate.
6. **Verificación**: `pnpm verify`; tests de la forma (sin notas en párrafo, columna final no editable y con el valor de `unidadDeCombate`, la forma estándar de los modificadores); recorrido en Playwright sin pantalla de la ficha en el montaje, la edición, el combate y a 390 px sin scroll horizontal; `pnpm capturas` al cerrar. Actualizar CLAUDE.md (el párrafo de «La ficha» de la arena) y `docs/historia.md`.

## Fuera de alcance

- Cambiar reglas, cifras o qué se puede editar.
- Rediseñar el editor de equipo más allá de usar la forma estándar de los modificadores.

## Preguntas abiertas (con suposición por defecto)

- **Abreviaturas**: Atq, Def, Daño, PV, Vel, Disp… las que ya use la tarjeta del catálogo (`resumenDeUnidad`) si las hay; si no, las elige el ingeniero y las usa en todas partes.
- **Liderazgo y coste** no tienen modificadores: su casilla final repite el valor.
