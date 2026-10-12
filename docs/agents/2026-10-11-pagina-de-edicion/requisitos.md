# Página de edición de la arena (varias fichas a la vez)

## Petición literal

> «Crea una pagina de edicion, a la que acceda desde arena en la que pueda elegir n personajes y se abran sus paginas de edicion. Que cada pagina de edicion se vea completa, sin scroll interno, y que pueda ver varias a la vez, hasta 4.»

Respuestas del usuario (11-10-2026):

- Personajes elegibles: **las hojas de las cinco facciones (borrador) y las
  criaturas del catálogo del juego (como prueba)**, como en la lista de la arena.
  Los héroes no (son del montaje de cada bando).
- Los cambios vuelven **al volver, sin guardar**: la página de edición es una
  vista de la propia arena (misma página); al volver al montaje ya lleva las
  cifras cambiadas, y «Guardar» las escribe en el borrador como hoy.

## Criterios de aceptación

1. Desde el montaje de la arena hay un acceso visible (botón en la barra de
   arriba, junto a «Luchar» / «Guardar») a la vista de edición, y desde ella un
   «Volver» al montaje, que queda como estaba (bandos, muralla, reglas, semilla).
2. En la vista de edición se eligen personajes (hojas y criaturas del catálogo,
   con el mismo filtro por facción que la lista de la arena) y se abre su ficha de
   edición. Se pueden tener abiertas **de 1 a 4** a la vez; con 4 abiertas, abrir
   otra no deja tener 5 (se dice, o se cierra una por decisión del usuario: lo que
   decida el arquitecto, diciéndolo en pantalla).
3. Cada ficha abierta se cierra sola (×) sin tocar las demás.
4. **Cada ficha se ve completa, sin scroll interno**: ninguna ficha tiene barra de
   desplazamiento propia ni contenido recortado, con 1, 2, 3 y 4 abiertas, en
   1280×720, 1440×900 y 1920×1080. Si la página entera necesita desplazarse en
   vertical en una pantalla baja, eso vale; lo que no vale es el scroll dentro de
   una ficha. Sin desplazamiento horizontal de la página.
5. Las fichas son **las mismas** que la del montaje (mismos campos, misma
   validación, mismo retrato con su animación y su giro, mismo «deshacer prueba»
   del catálogo): un solo renderizador, no una copia. Editar una cifra aquí es
   lo mismo que hacerlo en el montaje: cambia el tipo en el borrador o en la
   prueba del catálogo, y lo que no valida no entra y se dice.
6. La misma ficha no se abre dos veces.
7. Lo abierto se recuerda al ir y volver dentro de la sesión de la página (y, si
   es barato, en la URL o en `localStorage` como comodidad, con try/catch).
8. A anchura de móvil (390 px) la vista se usa sin desplazamiento horizontal
   (las fichas una debajo de otra; ahí sí se desplaza la página).

## Fuera de alcance

- Editar héroes en esta vista.
- Cambiar los campos de la ficha o sus reglas de validación.
- Editar en plena batalla (ya existe el «Editar» del panel de combate).
- Comparar fichas campo a campo o editar varias a la vez con un solo valor.

## Contexto

- Árbol de trabajo con cambios sin commit del ciclo anterior
  (`docs/agents/2026-10-11-poderes-y-edicion-en-combate/`: poderes del monje,
  edición en combate, Yo/IA por bando). Son la base, no se deshacen.
- La ficha de hoy: `renderFicha`, `renderFichaDeCatalogo` (con `ComoDeLaFicha`,
  `retrato`, `pieDeLaFicha`) en `src/client/arena/paneles.ts`; el estado en
  `src/client/arena/main.ts` (`elegida`, `borrador`, `pruebas`). Las miniaturas y
  el retrato animado ya se pintan por `data-figura`; hoy hay un solo retrato
  animado (la ficha elegida): con varias, cada una anima el suyo.
- `#montaje` es una rejilla con `overflow-y: auto` por sección: la vista nueva no
  debe heredar ese scroll interno.
- Máquina compartida: presupuesto de pruebas del CLAUDE.md.

## Preguntas abiertas (con suposición por defecto)

- ¿Con 4 abiertas y se pide otra? → no se abre y se dice «cierra una para abrir
  otra».
- ¿Cómo se colocan? → en columnas, una por ficha, del ancho que quepa; si la
  ficha no cabe en alto, se compacta (dos columnas de campos dentro de la ficha)
  antes que poner scroll.
