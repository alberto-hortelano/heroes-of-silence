# Hallazgos de QA, vuelta 1: temas como las láminas

El informe completo está en `qa.md`. Los criterios de hoy (1-8) se cumplen; lo que sigue es lo que hay que corregir.

## Se arreglan

**H1 (importante). El fondo de `#stage` está pintado de `--marco`, el material plano.**
- Ese color llena los canales de las figuras y el hueco que rodea el mapa. En la lámina, esa zona es oscura.
- Luz mediana del margen a 1920, lámina frente a captura:

  | Tema | Lámina | Captura |
  |---|---|---|
  | imperio | 51 | 127 |
  | elfos | 117 | 180 |
  | templarios | 49 | 94 |
  | orkos | 30 | 62 |

- Decisión:
  - Una ficha nueva para el fondo del escenario y los canales, por ejemplo `--fondo-escenario`, **medida en la lámina** por `tools/taller/temas/paleta.ts` en las zonas de margen, entre las figuras y en el hueco entre marco y figura. No se escribe a ojo.
  - Va en el común si coincide; si no, en cada tema.
  - El test de la paleta la vigila como las demás.
  - Hay que volver a medir la luz mediana del margen a 1920 en los cinco temas y quedar a ±15 de la lámina.
  - El neutro no cambia (`neutro.ts` = 0).
  - Mira de paso el H2: con el canal oscuro, el estandarte de respaldo de templarios debería despegarse del fondo. Mide su contraste con el canal y apúntalo; no hace falta que llegue a 4,5, porque es decoración.

**H3. El aviso de la barra de abajo va pegado arriba de su cartela en los cinco temas.**
- `-webkit-box-pack: center` no lo centra.
- Decisión: centrarlo en vertical dentro de la cartela, sin perder el recorte a dos líneas y sin cambiar el alto de la barra.

**H4. La «×» de quitar equipo se ve de unos 4 px en imperio y unos 6 en templarios, frente a unos 8 en el neutro.**
- Decisión: que mida en todos los temas al menos lo que en el neutro. La causa probable es la letra del tema en el botón: la «×» puede ir con la letra de interfaz, o con un tamaño propio.

**H6. Glifos y una línea partida.**
- El ✠ y el ❦ salen de DejaVu Sans, porque Cinzel y Almendra no los tienen. En otra máquina pueden salir distintos o como cuadros.
- Decisión:
  - Dar a los emblemas una cadena de respaldo explícita que funcione en Linux, Windows y macOS (por ejemplo `'Segoe UI Symbol', 'Noto Sans Symbols', 'DejaVu Sans', 'Apple Symbols', sans-serif`), o algo mejor si se ve.
  - En no-muertos, «HÉROE · RANGO 5 · NIVEL 3 · NIGROMANTE» se parte en dos líneas a 1440: que quepa en una, ajustando el espaciado o el tamaño del rótulo en ese tema, sin tocar los demás.

## No se arreglan hoy

- **H2.** El estandarte de respaldo ocupa poco del canal. Las figuras de mañana lo sustituyen; solo se mira lo que pide H1.
- **H5.** El tamaño de la ranura del remate (112×36 frente a 70×90–180×60 en las láminas) es decisión del usuario y se ve mejor con las piezas reales. Queda para mañana.

## Reglas para el ingeniero

- Sin `data-tema`, nada cambia.
- Los guardias se rompen a mano y se ven en rojo.
- `pnpm verify`, una vez.
- No hace falta `verify:lento` salvo que toques `assets/`.
- No corras `pnpm capturas`: lo corre QA.
- Playwright sin pantalla. Rehaz las capturas lado a lado a 1920 de los cinco temas y míralas.
- Procesos: PID y grupo; los puertos 3100, 3150 y 3636 son de otros.
- No lances ningún encargo a Codex.
- Sin commit.
