# Hallazgos de QA v3: se arreglan los cuatro (18-10-2026)

Después de la vuelta 3, el coordinador rehízo con `pnpm taller corregir` los marcos del mapa de no-muertos, orkos, imperio y elfos (V3-1): ahora los adornos van dentro de su esquina. `temas-con-piezas.ts` y `pnpm verify` salen en verde. El usuario pidió: «arregla los cuatro y luego haz el commit».

## V3-2. La moldura del mapa no tiene tope

`--a-la-lamina` depende del alto de la ventana y no lleva `min()`. Lo que tapa cada lado sale así:

| Ventana | Costados | Pie |
|---|---|---|
| 1080×1920 (vertical) | 40-44 px | 51-62 px |
| 2560×1440 | 24-27 px | 32-40 px |

Hay que ponerle tope, con una escala que dependa del ancho y del alto (por ejemplo, el menor de los dos):
- en ninguna ventana tapa más de ~24 px por costado y ~32 por el pie;
- a 1440 y a 1920 queda como está ahora: 7/11-16 y 13/18-24 (mídelo).

Lo mismo vale para el remate y la cartela si dependen de la misma escala: nunca más de 64 px. QA lo dio por bueno, pero compruébalo también en vertical y a 2560.

## V3-3. `temas-con-piezas.ts` no falla si el marco o el remate tapan de más

Que salga con 1 cuando el marco pase de su tope por costado o por pie, o cuando remate y cartela pasen de 64. Mídelo también en 1080×1920 y en 2560×1440. Rómpelo a mano y míralo en rojo.

## V3-4. En elfos, las barras de arriba y de abajo son verde azulado oscuro

En la lámina son de plata clara: la de arriba con la luna y la de abajo con el aviso. El canal de los márgenes sigue caqui.

- Mide en la lámina, con `tools/taller/temas/paleta.ts` (rectángulos nuevos), el fondo y la tinta de la barra de arriba y de la de abajo. Aplícalo a elfos: el contraste de la tinta debe dar ≥ 4,5, y lo vigila `paleta-de-las-laminas.test.ts`.
- Si al medir sale que la ficha es compartida con algo que no debe aclararse, separa la ficha solo donde haga falta.
- Mira de paso el canal: si lo que se ve caqui es la mezcla de `--fondo-escenario` con la textura neutra, déjalo. Si sale más lejos de la plata que antes, apúntalo.

## V3-5. En la base, los rótulos largos se parten en dos líneas y la de arriba toca la moldura

Pasa con «LIBRO DE ALDO DE VALDELUZ» y con «TROPA DE…».

- Que el rótulo de sección quepa en una línea, recortado con «…» si no cabe y con el texto entero en el `title` o en el `aria-label`, si es lo que ya usa el repo para eso. La otra opción es que la barra crezca con el texto sin que la moldura lo toque.
- Elige la que se parezca más a la lámina y apúntalo. En todos los temas y a 390.

## Reglas

- **Sin `data-tema`, nada cambia:** `tools/qa/neutro.ts` = 0.
- **El lienzo no se mueve.**
- **Las piezas no se regeneran.**
- **Los guardias se rompen a mano y se ven en rojo.**
- **Pruebas:**
  - `pnpm verify` una vez por tanda;
  - al final, `pnpm verify:lento` una vez y `npx tsx tools/qa/temas-con-piezas.ts` una vez;
  - `pnpm capturas` una vez al cerrar, que tiene que salir 0, porque después viene el commit.
- **Navegador:** Playwright sin pantalla.
- **Procesos:** PID y grupo. El 3197 es del usuario, no lo toques. El 3100, el 3150 y el 3636 son de otras sesiones.
- **Commit:** no hagas ninguno; lo hace el coordinador.
