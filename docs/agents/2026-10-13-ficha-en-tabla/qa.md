# QA — la ficha de la arena en tabla, con las notas como tooltip (13-10-2026)

Sobre el diff sin commitear de `main`. `pnpm verify` una vez (salida 0: 123 ficheros, 3057 tests).
`pnpm banco` y `pnpm capturas` no se repitieron: se citan los del ingeniero (banco con el mismo
sha256 `066767b4…af995`; capturas salida 0, 381 s). Vite propio en el 3241 (PID guardado, matado
por su grupo, comprobado libre); el 3100 de la otra sesión no se tocó. Chromium sin pantalla con
Playwright. `data/borradores/` no existía y sigue sin existir (no se pulsó «Guardar»).
Capturas en `capturas-qa/` (enteras).

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Fuera «En la pelea (con el equipo)», «Cifras del cuerpo…» y los paréntesis de los rótulos | ✅ | En las 3 fichas × montaje / edición / combate / 390: `parrafos: []`, sin `[data-en-la-pelea]`; rótulos de la tabla «Ataque … Coste» sin paréntesis (los únicos paréntesis medidos son de `<option>` y del libro de hechizos, «Prisa (3)»: no son rótulos de cifra) |
| 2 | Toda nota es tooltip, forma única, accesible | ✅ con reservas | 17 notas en la unidad, 11 catálogo, 12-13 héroe; todas con `title` = `aria-label` (`notasSinTitulo: 0`); ningún `<p>` en la ficha. Ratón: `title` («De 0 en adelante.»). Teclado: las de sección con Tab; las de fila, en el bocadillo con el foco en su casilla. Reserva: el bocadillo tapa la casilla que se está editando cuando queda al pie (H2), y el héroe conserva una aclaración como valor (H4) |
| 3 | Tabla de una columna: rótulo, casilla editable, final no editable con todo aplicado; resalta si cambia; nivel arriba | ❌ | La forma está (final en `<output>`, `cambiada` solo si difiere, nivel arriba) y el valor es correcto (abajo), **pero a 1440 px en «Editar fichas» las casillas cortan los números y las cabeceras se parten** (H1): la casilla no deja leer ni escribir el valor del cuerpo |
| 3 | …el valor final correcto al poner y quitar | ✅ | Templario (cuerpo A3 D3 V4 PV80): con espada+brigantina+escudo 5/7/3/150; sin escudo D3 V4; sin armadura PV80; mandoble A8; cuerpo A9 → final 14. Mandoble con escudo puesto: rechazo en la barra «…es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo.» y el final no cambia |
| 4 | Modificadores en forma estándar | ✅ con reservas | Mismo texto, signo, orden y nombre en ficha, `<option>` («Mandoble · +5 Ataque, +30–60 Daño, a dos manos»), editor de equipo y paneles del juego. Reserva: la pastilla no mide igual en cada sitio (H3) |
| 5 | Las tres fichas, una disposición, en montaje, edición y combate | ✅ con reservas | Unidad, catálogo y héroe medidas en montaje, combate y 390; en edición unidad y catálogo (el héroe no se abre en la edición, por diseño: `main.ts` lanza «la ficha del héroe no se abre en la edición»). H1 afecta a las dos de la edición |
| 6 | Verificación | ✅ | `verify 0`; banco y capturas citados; 390 px sin scroll horizontal (`scrollWidth 390 = 390`). El recorrido del ingeniero no cazó H1 porque mide desbordes de cajas, no texto cortado dentro de un `<input>` |

## Hallazgos

### H1 — importante (casi bloqueante): a 1440 px, en «Editar fichas», las casillas cortan los números y las cabeceras se parten

Confirma lo que vio el coordinador y lo mide.

- **Pasos**: `/arena/` a 1440×900 → «Editar fichas» → abrir «Guerrero con escudo» (y un campesino o el arquero del catálogo).
- **Medida** (`clientWidth` de la casilla, `scrollWidth` del valor):
  - unidad (ficha de 463 px): casilla de **34 px**; quitando relleno y las flechas del `number` quedan ~8 px, un dígito. Cortadas **todas** las de 2-3 cifras: Daño mínimo «10» y máximo «10» se leen «1», PV «80» se lee «8», Coste «150» se lee «1» (Orko: «250» se lee «2»). `scrollWidth` 43-51 frente a `clientWidth` 34.
  - catálogo (misma columna): casilla de 44 px; «100» (PV del arquero) cortado.
  - cabeceras de 32 px de alto (dos líneas): «Cuerp/o», «Fina/l», «Catálog/o».
- **Ancho por ancho**: a 1280 y 1920 no pasa (casilla de 66 px, cabeceras en una línea). Solo en la franja en la que la ficha mide ~440-470 px y la figura sigue al lado de la tabla. **1440 es el ancho más común de portátil**, así que es justo el caso normal. En el montaje y en el combate, a todos los anchos probados, la casilla mide 66 px y no corta.
- **Qué espera quien edita**: leer el valor que va a cambiar. Hoy ve «8» en PV y un final de «80»: parece que el equipo suma 72.
- Capturas: `06-edicion-dos-fichas.png` (1440), comparar con `16-edicion-3-fichas-1920.png` (bien).

### H2 — importante: el bocadillo de la nota tapa la casilla que se está editando cuando está al pie de la ventana

- El bocadillo de una fila sale con `tr:focus-within`, **con cualquier foco, también con el ratón o el dedo**, no solo con teclado, y va fijo al pie de la ventana (2-3 líneas de alto).
- **Pasos**: 390×844, montaje, abrir «Guerrero con escudo», bajar hasta que la fila «Coste» quede abajo del todo y tocar su casilla.
- **Medida**: casilla en y = 765-791; bocadillo en 745-783; `elementFromPoint` en el centro de la casilla devuelve el `SPAN` de la nota. Liderazgo y Coste quedan ocultos y se escribe a ciegas (`18-390-coste-al-pie.png`).
- A 1440 no tapa la casilla con el foco en los casos probados, pero aparece una banda de ancho completo sobre la lista y la muralla cada vez que se hace clic en una casilla (`02-…`, `17-…`). No tapa la barra de estado: el rechazo «No se cambia: … el daño mínimo (99) no puede pasar del máximo (10).» se lee debajo (`17-rechazo-y-bocadillo.png`).
- **Qué espera quien edita**: que el tooltip no tape lo que escribe, y que no salga al hacer clic con el ratón (con el ratón ya tiene el `title`).

### H3 — menor: las pastillas tienen la misma forma pero no el mismo tamaño ni la misma letra

Heredan la letra de donde caen (`font-size: 0.9em`):

| Sitio | letra | tamaño | alto |
|---|---|---|---|
| ficha (montaje y combate) | Georgia | 12,96 px | 18 px |
| editor de equipo (tarjetas) | system-ui | 10,8 px | 15 px |
| paneles del juego (equipo del héroe) | Georgia | 9,66 px | 13 px |

El texto, el signo, el orden y el borde son los mismos. En el panel del juego, a 9,7 px, cuesta leerlas (`15-juego-paneles.png`). Si «iguales» quiere decir también iguales a la vista, falta fijarles el tamaño.

### H4 — menor: queda una aclaración en la ficha del héroe

En «En la pelea» del héroe, la fila «A la tropa» tiene como valor «nada: su ataque y su defensa son de su cuerpo». Es una explicación escrita como valor, no un tooltip (`09-combate-heroe-izquierda.png`). Fuera de la ficha, el diálogo del combate abre con «Lo que cambies aquí vale ya, para todas las de su tipo en el campo.» (es del diálogo, no de la ficha; lo dejo anotado).

### H5 — menor: en la edición, la alineación de la casilla cambia según el ancho

En la columna estrecha, el número de la casilla de la unidad va a la izquierda y el del catálogo, centrado; a 1920, los dos centrados (`06-…` frente a `16-…`). Es poca cosa, y desaparece si se arregla H1.

### Anotado, fuera de alcance

- El editor de equipo conserva sus párrafos: la introducción («Las del juego (data/equipo.json) se cambian solo para la arena…»), el aviso «Pieza del juego…» y «Regla: un arma a dos manos no admite escudo…». También sus rótulos con aclaración: «Velocidad (escalones)», «Daño mínimo que suma» (`08-editor-de-equipo.png`). Ya usa las pastillas.
- A 1024×900, en el montaje, `<main id="montaje">` intercepta el clic en el nombre de la unidad del bando (Playwright no pudo abrir la ficha). No es de este cambio y no lo investigué: queda como no probado.

## Workarounds usados

- Ninguno para observar la funcionalidad. Las medidas se hicieron con `page.evaluate` (solo lectura). Para estimar la caja del bocadillo, que es un `::after`, se midió un clon invisible que se quitó enseguida. No altera lo que ve quien juega.

## No probado

- Lectores de pantalla reales (`aria-description` de ARIA 1.3).
- El tooltip nativo del `title` en pantalla: Chromium sin pantalla no lo pinta. Se comprobó el atributo.
- El héroe en la vista de edición: no se abre ahí, por diseño.
- 1024 px (ver arriba), `pnpm capturas` y `pnpm banco`: citados, no repetidos.

## Veredicto

**No apto.** La forma pedida está bien hecha y el valor final es correcto en todos los casos que probé. Pero con H1, en la vista de edición a 1440 px (justo donde se editan las fichas) no se ve el número que se edita: PV «8», Coste «1», Daño «1». H2 tapa la casilla que se edita en el móvil. Arreglando las dos, sería apto con reservas menores (H3-H5).
