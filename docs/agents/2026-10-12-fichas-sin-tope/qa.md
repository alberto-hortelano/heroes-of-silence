# QA: fichas de la arena sin tope, rasgos como etiquetas y cabeza compacta

12-10-2026. Chromium sin pantalla (Playwright) contra un vite propio en :3191, arrancado con
`set -m` en su grupo (PGID 100883) y parado por él; `ss` confirmó el puerto libre después. No se
tocaron el vite del usuario en :3100 ni su Chrome. `pnpm verify` y `pnpm capturas` ya estaban en
verde según el coordinador y el informe del ingeniero: los cito y no los repito. No he tocado código.

Scripts (en esta carpeta, rutas relativas a ella; capturas en `qa/`):
- `qa-disposicion.ts`: 6 y 8 fichas a 1920/1440/1280/1024/390, columnas y filas, desbordes,
  scroll interno, letra, la lista, la rueda hasta el fondo, cerrar, plegar y recargar.
- `qa-gestos.ts`: el nombre con «✎» en el montaje, el héroe, la edición y el combate; los rasgos
  en hoja y en catálogo, hasta el montaje y el combate.
- `qa-a-mitad.ts`: clics en otros botones mientras se renombra, y el nombre vacío en combate.
- `qa-montaje.ts`: la ficha del montaje con la muralla plegada y desplegada.

Ninguno de los cuatro sacó errores ni avisos en la consola.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Más de 4 fichas; las que no caben, debajo; la página se desplaza | ✅ | 6 abiertas: 3×2 a 1920, 1440 y 1280; 2×3 a 1024; 1×6 a 390. 8 abiertas: 3×3 a 1920, 1440 y 1280; 1×8 a 390. La cabecera dice «FICHAS ABIERTAS · 8». Con la rueda al fondo, la última ficha queda entera en 108-839 de 900 (`qa/edicion-8-1440-fondo.png`). Al recargar vuelven las 7 abiertas. |
| 2 | Abrir o cerrar no pliega la lista; solo su botón | ✅ | `aria-expanded="true"` tras cada uno de los 8 «Abrir» y tras cerrar una. Con el botón pasa a `false` y así sigue tras recargar (se recuerda). |
| 3 | Rasgos como las habilidades, en hojas y en catálogo | ✅ | Ver el detalle de los rasgos, debajo de la tabla. |
| 4 | Letra más grande; como mucho 3 columnas | ✅ | Rótulos y clips a 14,4 px (0.9rem) y campos a 15 px; antes, 0.75-0.8rem (12-12,8 px). El título va a 19,2 px. Nunca 4 columnas, ni con 8 fichas a 1920. Los `h3` de sección siguen a 12 px (0.75rem). |
| 5 | Cabeza compacta: imagen mayor a la izquierda, clips en columna, cifras a la derecha | ⚠️ cumple solo en fichas anchas | Imagen y clips en columna en todos los anchos. Las cifras van a la derecha en la edición a 1920 (6/6), 1440 (6/6) y 1024 (2 columnas, 6/6), y en el montaje a 1920. Bajan **debajo** de la imagen en la edición a 1280 (ficha de 409 px, por debajo de 26rem) y a 390, y en el montaje a 1440, 1280 y 390. El lienzo mide 200×230 a 1920 y 1280, **150×173 a 1440** y 160×184 a 1024; antes eran 84 px. Es la desviación 2, declarada por el ingeniero. |
| 6 | Sin campo «Nombre»; título = nombre con botón de editar | ✅ | Ningún `data-campo="name"` ni texto «Nombre» en la ficha. «✎ Editar» en hoja, héroe, edición y combate; el catálogo no lo lleva. Ver el detalle del nombre, debajo. |
| 7 | Sin scroll dentro de una ficha ni recortes; a 390, una columna sin scroll horizontal | ✅ en la edición / ❌ en el montaje | **Edición**: 0 fallos en los 9 casos medidos, con 6 y 8 fichas. Se buscó scroll interno, `overflow:hidden` con contenido de más, hijos fuera de la caja y rótulos de 3 líneas. A 390, 1 columna y sin scroll horizontal. **Montaje**: `#ficha` se desplaza por dentro a 1920, 1440 y 1280, y a 1280×720 mide 348×**15** px (hallazgo I1). |
| 8 | Montaje y combate con la misma disposición (combate sin imagen) | ✅ | Montaje: `.cabeza` con imagen, clips y cifras (`qa/montaje-1920.png`). Combate: `.cabeza sin-retrato`, 0 lienzos, cifras en 3 columnas, título con «✎» y rasgos en etiquetas (`qa/combate-editor.png`). A 390, el diálogo no desborda en horizontal (`qa/combate-editor-390.png`). |

**Rasgos (criterio 3)**
- **Hoja de no-muerto** (caballero de la muerte, en el montaje):
  - Lleva «no-muerto ×». El desplegable ofrece los otros 11 rasgos, sin `undead`.
  - Al quitarlo, la ficha dice «Ninguno.» y el resumen del bando pierde «no-muerto».
  - Se añadieron los 12 uno a uno: el desplegable desaparece y la ficha no desborda (`qa/montaje-todos-los-rasgos.png`).
  - Con «vuela» y «no-muerto», el bando dice «· vuela, no-muerto».
- **Catálogo** (esqueleto, en la edición): quitar `undead` y poner `flying` da «vuela ×», y la barra dice «Esqueleto: prueba que no se guarda en data/creatures.json.».
- **Combate**: «vuela» se añade por el desplegable y la barra del diálogo dice «Cambiado: vale ya en esta pelea.».
- **Lo que rechaza el validador** (`validarUnidadDeArena`) son repetidos y desconocidos, y la interfaz no deja provocarlos: el desplegable solo ofrece los que faltan.

**El nombre (criterio 6)**
- **Intro** guarda. Con «✎», el campo sale enfocado y con el texto seleccionado.
- **Escape** no cambia el nombre. En combate, el diálogo sigue abierto; fuera del campo, Escape sí lo cierra.
- **Vacío o solo espacios** no entra y se dice: «No se cambia: … el nombre tiene que ser un texto no vacío.», en el montaje, en el héroe y en el diálogo de combate.
- **Tab** guarda.
- **Nombre de 67 caracteres**: el título se parte en dos líneas sin desbordar y el bando lo recorta con «…» (`qa/montaje-nombre-largo.png`).
- **Clic en otro botón a mitad**: probé «Ataque», «Duplicar», «+ der.», «✎» de otra ficha, «×» de la misma, «Volver al montaje», «Volver a la pelea», «Girar» de la misma y de otra, la «×» de un rasgo y el campo Ataque. En todos, el nombre se guarda y **el clic llega a su botón**: el destino sigue conectado y la acción ocurre (el duplicado entra, el rasgo se quita, el foco pasa a Ataque).
- **Doble clic en «✎»**: un solo campo.

## Hallazgos

### Importante

**I1. La ficha del montaje sigue con scroll propio, y a 1280×720 queda en una rendija de 15 px.**
Criterios 7 y 8: «la disposición nueva en todas las fichas».
- **Pasos**:
  1. `/arena/?seed=11` a 1280×720, con el localStorage limpio.
  2. «+ izq.» al Monje y clic en su retrato del bando.
- **Qué pasa**: `#ficha` mide 348×15 px con 1 074 px de contenido. Solo asoma la parte de arriba de «Monje ✎ Editar»; lo demás queda detrás de un scroll de 15 px (`qa/montaje-1280.png`).
- **En otros tamaños**:
  - A 1440×900: 407×195 px. El lienzo de 230 px de alto sale cortado y las cifras van debajo, dentro del scroll (`qa/montaje-1440.png`, y `capturas/montaje-1440.png` del ingeniero).
  - A 1920: la cabeza cabe, pero rasgos, poderes y habilidades quedan en el scroll interno.
  - Con la muralla plegada: 348×550 a 1280 y 407×730 a 1440, aún con scroll (958 de contenido a 1440) (`qa/montaje-muralla-plegada-*.png`).
- **Qué esperaba quien juega**: ver en el montaje la ficha nueva, la misma de la edición, sin tener que desplazar una caja diminuta.
- **Es anterior al ciclo**: el ingeniero lo declara en «Qué NO queda cubierto». La rendija la causa la fila de la muralla. Pero la cabeza nueva, de 230 px de alto, lo deja peor a 1440: el retrato ya no cabe. No lo he comprobado contra el árbol de antes.

### Menor

**M1. Las cifras no van a la derecha en anchos comunes** (criterio 5). En la edición a 1280, con 3 columnas, y en el montaje por debajo de 1920, las cifras bajan bajo la imagen.
- El pliegue es razonable: a la derecha, «Velocidad (casillas, 2 a 7)» se partía en 3 líneas.
- Pero la petición dice «las características a la derecha», y a 1280 la parte de arriba no queda compacta: la ficha mide ~600 px más.
- Hay una rareza: a 1440 la imagen es más pequeña (150 px) que a 1280 (200 px).
- Lo decide el usuario. Hay que decirle desde qué ancho se cumple: en la edición, desde ~1300 px de ventana con 3 columnas, o con 2 columnas a 1024; en el montaje, solo a 1920.

**M2. Quitar un rasgo con el teclado deja el foco en `<body>`.**
- **Pasos**:
  1. En la ficha del montaje, Tab hasta la «×» de una etiqueta de rasgo.
  2. Pulsar Intro.
- **Qué pasa**: el rasgo se quita y `document.activeElement` pasa a `<body>`.
- **Qué esperaba**: el foco en la etiqueta vecina o en el desplegable «Añadir».
- No he comprobado si las habilidades hacen lo mismo. Si lo hacen, el patrón es anterior.

**M3. Al «Abrir» una ficha con la lista desplegada no se ve dónde ha ido.**
- **Pasos**: a 1440×900, en la edición, con la lista desplegada, pulsar «Abrir».
- **Qué pasa**: la lista ocupa toda la pantalla. La primera ficha nueva cae en y=853 de 900, tapada por la barra de estado. Desde la cuarta, cae varias pantallas más abajo.
- **Lo único que responde**: «Abierta» en el botón y «X: ficha abierta.» en la barra.
- Es la consecuencia directa de «que no se pliegue» con «que se añadan debajo». Una mejora posible: desplazar hasta la ficha nueva sin plegar la lista. Es una decisión de experiencia, no un incumplimiento.

## Workarounds usados

- Limpiar el `localStorage` al empezar cada script. Es para partir del mismo estado; quien juega por primera vez lo tiene vacío. No afecta.
- En `qa-a-mitad.ts`, un listener de `click` en captura para ver a qué elemento llega cada clic. Solo observa, no cambia nada. No afecta.
- En la edición plegué la lista con su botón para tener las fichas a mano, como haría quien juega. No afecta.

## No probado

- **El efecto en las reglas de un rasgo añadido**: por ejemplo, que «vuela» deje volar en la pelea. Sí comprobé que llega al resumen del bando y a la ficha del diálogo de combate, y en combate la barra lo da por aplicado. El camino borrador → pelea no cambia en este ciclo.
- `verify:lento`, `banco` y `pnpm qa`: no se tocan núcleo, escenógrafo ni servidor.
- `pnpm verify` y `pnpm capturas`: los dejó en verde el ingeniero sobre este árbol y no los repito, por el presupuesto de pruebas.
- Pantallas táctiles, el zoom del navegador y dpr > 1.

## Veredicto

**Apto con reservas.** Los criterios 1, 2, 3, 4, 6 y 8 se cumplen. El 7 se cumple en la vista de
edición, que es la que pidió el usuario, pero no en el montaje (I1, probablemente anterior al
ciclo y agravado por la cabeza nueva). El 5 se cumple solo en fichas de más de 26rem (M1). Antes
de cerrar, el usuario debería decidir sobre I1 y M1.
