# Afinar con las piezas puestas (18-10-2026)

Las 53 piezas se generaron con Codex el 17-10, todas a la primera, y están en `assets/temas/<tema>/`. Al ponerlas en la página, el coordinador comparó a 1920 cada tema con su lámina, una al lado de la otra. Hay cuatro puntos que afinar, y el usuario dijo «afínalos».

## 1. En elfos, las barras de sección tapan su título

En elfos, «HECHIZOS», «EQUIPO» y el resto de títulos de sección no se leen: queda una barra verde azulada vacía. En los otros cuatro temas sí se leen.

- **Qué hacer:** busca la causa (tinta del mismo color que la pieza, la pieza pintada encima del texto, padding…) y arréglala.
- **Guardia:** que el título de sección se lea sobre la pieza **real** en los cinco temas. Mide en el navegador el contraste de la tinta sobre los píxeles de la pieza bajo el texto; tiene que dar ≥ 4,5, o ≥ 3 si el texto es grande y en versalitas. Deja la medida reproducible en un script de `tools/qa/` o en `pnpm capturas`.

## 2. El marco del mapa sale como una línea fina

En las láminas es una moldura gruesa, de unos 25-40 px a 1920: tracería gótica, hierro con calaveras, oro con columnas, plata con hiedra, hierro remachado con colmillos. Al marco del minimapa y al del panel les pasa lo mismo.

- **Qué hacer:** que el marco se vea con el grosor de la lámina (mide en cada lámina el ancho de la moldura y escala a la pantalla).
- **Lo que no se mueve:**
  - el lienzo mide lo mismo que hoy a 390, 1440, 1819, 1820 y 1920, en el neutro y con tema;
  - el neutro no cambia (`tools/qa/neutro.ts` = 0).
- **Dónde puede ir el grosor:** hacia fuera (`border-image-outset`, sobre el relleno de `#stage` y el hueco con el panel) y, si no cabe, **hacia dentro sobre el borde del mapa**, como en las láminas, donde el marco monta encima del terreno.
  - Si va hacia dentro: es una capa encima del lienzo con `pointer-events: none` (los clics llegan al mapa). Tapa como mucho ~24 px por lado a 1920, y menos a 1440. Apunta cuánto tapa en cada ancho.
- **El 9-slice:** comprueba que los cortes de la pieza generada coinciden con lo que se pidió (Codex puede no respetar las bandas). Si no coinciden, corrige los cortes de esa pieza en `DEFINICIONES`/`POR_TEMA` con la medida real. No se vuelve a generar nada sin preguntar al coordinador.

## 3. El remate y la cartela quedan pequeños

El hueco del remate es de 112×36 px. En las láminas, el escudo de templarios, la calavera de no-muertos, el águila del imperio, el cristal de elfos y el cráneo con cuernos de orkos son mucho mayores.

- **Qué hacer:** agrandarlos hasta la proporción de la lámina (mídela).
- **Lo que no se mueve:**
  - el remate y la cartela siguen con `pointer-events: none` y sin mover el lienzo;
  - en el centro pueden tapar más del borde de arriba del mapa: el usuario aceptó que taparan, y esto lo afina. Como mucho ~64 px a 1920, y apunta cuánto tapan en cada ancho;
  - en el móvil siguen ocultos.

## 4. El fondo del margen en imperio se ha vuelto pardo

Con la textura, el fondo del margen del imperio pasa a pardo; en la lámina es casi negro. Probablemente sea la `textura-marco` en `soft-light` sobre `#stage`.

- **Qué hacer:** que la luz mediana del margen a 1920 vuelva a quedar como en la vuelta 2 de QA, a ±15 de la lámina salvo imperio, que quedó a −19 por decisión del coordinador (opción c). Mídela en los cinco temas.
- **El tono:** mira si al mezclar la textura conviene hornear el `soft-light` en el taller (estaba descartado «hasta tener texturas reales»: ya las hay).

## Reglas

- Las piezas ya generadas no se vuelven a generar sin preguntar.
- Los contratos de `CLAUDE.md` se respetan: `forma.css` es la dueña de las reglas, `piezas-de-tema.css` es generada y solo lleva fichas, y ningún 404.
- Los guardias se rompen a mano y se ven en rojo.
- Pruebas: `pnpm verify` una vez por tanda y `pnpm verify:lento` una vez al final (se toca `assets/` o su lectura). `pnpm capturas` lo corre QA.
- Navegador: Playwright sin pantalla. Capturas lado a lado con la lámina a 1440 y 1920 de los cinco temas, más el móvil a 390, en `capturas/afinado-*.png`, y míralas.
- Procesos: PID y grupo, nada de pkill. El puerto 3197 lo levantó el coordinador para el usuario: no lo toques. El 3100, el 3150 y el 3636 son de otras sesiones.
- Sin commit.
