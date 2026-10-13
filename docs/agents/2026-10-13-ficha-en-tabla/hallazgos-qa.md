# Hallazgos de QA para corregir (coordinador, 13-10-2026)

Fuente: `qa.md` (no apto). Criterio vigente: pocas pruebas de jugabilidad (forma y flujo, no combates).

## Se corrigen

1. **H1: ninguna cifra se corta y ninguna cabecera se parte**, a ningún ancho (390, 1024, 1280, 1440, 1920) ni en ninguna vista (montaje, edición con 1, 2 y 3 fichas, combate). La casilla editable cabe al menos 5 cifras (`ch`, no píxeles sueltos); «Cuerpo», «Final», «Catálogo» en una línea (`white-space: nowrap`); si la ficha es estrecha, la figura va encima de la tabla (`@container`), no al lado apretándola. Los números de las dos columnas, alineados igual (a la derecha) en las tres fichas (H5). **Guardia en el recorrido de Playwright y en `capturas`**: en cada ficha visible, toda casilla con `scrollWidth <= clientWidth` y cada cabecera de una línea; verlo fallar con el CSS de ahora.
2. **H2: el bocadillo nunca tapa lo que se edita.** Sale solo al pasar el ratón o poner el foco en el «ⓘ», junto a él (no fijo al pie ni con el foco de la casilla); la casilla sigue con su `aria-description`. Comprobar a 390 px con «Coste» abajo: al escribir, `elementFromPoint` en la casilla es la casilla.
3. **H3: una sola pastilla de modificador** (una clase, un tamaño y una letra) en la ficha, el editor de equipo y los paneles del juego, legible (no por debajo de ~11 px).
4. **H4: en la ficha del héroe**, «A la tropa: nada: su ataque y su defensa son de su cuerpo» deja de ser un valor y pasa a nota (o la fila se quita si no dice nada).
5. **El editor de equipo con la misma regla** (la petición dice «cualquier aclaración o nota debe ir como tooltip»): sus párrafos de nota («Las del juego…», «Pieza del juego…», «Regla: …») pasan a `nota()`, y los rótulos sin paréntesis («Velocidad», «Daño mínimo»… con lo que aclaraban en la nota). Los mensajes de estado se quedan.

## No se corrige

- El clic en el nombre de una unidad del montaje a 1024 px que intercepta `<main id="montaje">`: no es de este cambio; se anota para issue si se reproduce en HEAD.
