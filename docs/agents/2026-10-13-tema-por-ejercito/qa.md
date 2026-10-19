# QA — un tema de UI por ejército

QA, 13-10-2026. Código sin commit del worktree `army-game-theme-ui-28d2ad`, tras «/simplify».
Referencia: la petición literal («crea un tema para el juego para cada ejercito que afecte a los
elementos de UI») y los 13 criterios de `requisitos.md`.

## Veredicto

**Hallazgos.** Los 13 criterios se cumplen, pero queda un hallazgo **importante** (H1): el selector
«Ejército» se queda con el foco del teclado. Mientras lo tiene, Espacio no pasa el turno, y una flecha
o una letra cambia de ejército y tira la partida sin preguntar. Los otros seis (H2-H7) son menores.
Corregido H1, sería apto.

## Cómo se probó

- `pnpm verify`, una vez: salida 0. 125 ficheros de test pasados (1 saltado); **3 081 tests pasados**
  y 14 saltados; 54 s con la máquina cargada.
- `pnpm capturas`, una vez al cerrar: **salida 0**, «sin errores en consola», 65 PNG, 384 s con la máquina cargada (en la carpeta del scratchpad: no se suben al repo). Al acabar no queda ningún proceso escuchando con cwd en este worktree.
- `verify:lento` y `banco` no se repitieron, como pedía el encargo. Los cito de `implementacion.md`:
  `verify:lento` salió 0 (4 932 tests); `banco` dio sha `066767b4…af995`, «ancla: igual», con 0 de
  200 partidas sin terminar. Lo he comprobado así:
  - `tools/qa/banco.ts` no está tocado y su ancla sigue siendo `066767b4…`;
  - en `generate.ts` solo cambia `['knight','necromancer']` por `FACCIONES_DE_SIEMPRE`, que vale lo mismo;
  - `newGame` sin `factions` no pasa la clave.
- Navegador: Playwright con Chromium sin pantalla (nunca el Chrome del usuario), contra un `vite`
  propio en el puerto 3271.
  - Lo arranqué con `set -m` y lo paré por su grupo (PGID 169737).
  - Al pararlo, `ss` dio el 3271 libre y el grupo quedó vacío.
  - `pnpm capturas` arrancó y paró su propio `vite`.
- Capturas en `qa/`, todas miradas.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Cinco temas, cada uno con su paleta, su letra y su marco, y se distinguen a simple vista | ✅ | `qa/arena-<tema>-{montaje,edicion,equipo,combate,prevision}.png`. Paletas: azul y oro (templarios), negro y violeta con verde (no muertos), carmesí con primario mármol (imperio), verde y plata (elfos), óxido con primario rojo sangre (orkos). Marcos: `ridge` dorado, `groove` gris, `double` bronce, `solid` plata y `outset` hierro. Las letras son distintas en Linux (P052/Lato, Junicode/Gentium, Libertine, Biolinum, URW Bookman/Liberation Sans Narrow). La pareja más cercana es imperio–orkos (los dos rojizos), pero el botón primario (mármol frente a rojo) y la letra los separan. Ver «Pasada adversarial». |
| 2 | Sin `data-tema` la página se ve como hoy, y el espectador sigue así | ✅ | `/espectador/`: `data-tema` ausente, `--panel` = `#201d17`, letra `Georgia, "Times New Roman", serif` (`qa/espectador-neutro.png`). No he repetido la comparación elemento a elemento con HEAD del ingeniero (0 diferencias en 6 páginas, 34 propiedades); en mi escaneo de contraste el neutro sale igual que antes. |
| 3 | `?seed=7` sale con `templarios` | ✅ | `data-tema="templarios"`, selector en `knight` («Caballero»), «semilla 7» (`qa/partida-caballero.png`). |
| 4 | `?seed=7&faccion=necromancer`: jugador 0 nigromante (ciudad, héroe y tropa) y tema `no-muertos` | ✅ | `data-tema="no-muertos"`. Panel: «HÉROE · RANGO 5 · NIVEL 3 · Nigromante · Malaquías»; tropa: Esqueleto 3 y Zombi 2. En la base, crecimiento de Esqueleto +8 y guarnición de Esqueleto 3, Zombi 2 y Momia 2; el vecino es «Huesos, capataz de los esqueletos» (`qa/partida-nigromante.png`, `-base.png`, `-conversacion.png`). La partida avanza: 6 turnos pasados hasta el día 7, sin errores (`qa/partida-nigromante-dias.png`). La ciudad se sigue llamando «Valdeluz»; está declarado fuera del encargo. |
| 5 | `?faccion=xyz` no arranca y dice por qué; `?faccion=` vacío es no pedir | ✅ | Con `xyz`, la barra dice `?faccion=: el ejército "xyz" no existe; valen knight, necromancer — quita "?faccion=…" de la barra de direcciones para jugar con el caballero`, más el `pageerror` buscado (`qa/partida-faccion-xyz.png`). También fallan diciéndolo: `Necromancer` (mayúscula), `faccion` repetido (aunque sea el mismo valor) y `?seed=abc&faccion=xyz` (este solo dice lo de la semilla, ver H4). Arrancan bien: `?faccion=` vacío (templarios; la URL queda `?seed=7`), `?faccion=%20necromancer%20` (se recorta) y `?faccion=necromancer` sin semilla (sortea la semilla y conserva el ejército). |
| 6 | Selector «Ejército» en la barra: recarga con la misma semilla y la facción, y la URL lo refleja | ✅ con H1 | Al cambiarlo desde el mapa, la URL pasa a `?seed=7&faccion=necromancer`, el tema a `no-muertos` y el panel a Malaquías, con «semilla 7». `history.length` no cambia (`replaceState`). Al volver a «Caballero», `?seed=7`. Desde dentro de la base vuelve al mapa con la partida nueva (`qa/selector-desde-la-base.png`). Tras recargar se conserva. Las opciones son «Caballero» y «Nigromante». |
| 7 | Selector de tema en la arena: se recuerda, `localStorage` puede fallar, y cambia a la vez paneles y lienzo | ✅ | Por defecto, `templarios`. Con el selector cambian los paneles de montaje, edición y equipo y, en el combate, el lienzo (chapas, nombre y letra; `qa/arena-*-combate.png`). Al recargar sigue el último (`orkos`). Con `localStorage` que lanza `SecurityError`, la página carga en templarios, el cambio funciona en el acto y solo deja avisos en consola. Con un tema guardado que no existe (`enanos`), avisa y pone templarios. La partida no lee `arena.tema`: con `orkos` guardado, `?seed=7` sale en templarios. |
| 8 | En el lienzo cambian las chapas del mapa, la barra de vida, el nombre, los galones, las fuentes, los rótulos de la base y el recuadro del minimapa; no cambian bando, vida, aros, terreno ni figuras | ✅ | Recortes comparados:<br>• Chapa «4» del mapa: azul marino con borde oro frente a negro con borde verde.<br>• Recuadro del minimapa: amarillento frente a verdoso.<br>• Chapa del nombre en la batalla: fondo y letra distintos en los cinco temas.<br>• Rótulo de la base sin arte (nigromante): con la tinta del tema.<br>Lo que no cambia: el color de la vida (159,196,154 en los cinco), los aros (oro y azul), el rojo y azul de bando y el terreno. Quedan literales que son de la ruta o de los efectos, no de chapas («!» de la emboscada, las cifras de carga, el daño flotante); su letra sí va con el tema. |
| 9 | En `style.css` y `arena.css` no hay colores fijos fuera de las fichas | ✅ | El guardia de `invariantes.test.ts` está en verde dentro de `verify`. Repasé las dos hojas fuera de `:root` con `awk`/`grep`: ningún hex, `rgb()` ni color con nombre (solo aparece `white-space`). Los del editor de muralla son fichas `--info-*` del neutro. |
| 10 | Cada tema tiene las mismas fichas que el neutro, y el contraste es ≥ 4,5 en los seis | ✅ | `temas.test.ts` en verde. Medido en Chromium con las fichas resueltas, de 4,5 o más en los seis: tinta/panel de 12,21 a 14,2; tinta de botón/botón de 10,0 a 12,3; primario de 6,4 a 10,1; y 31 parejas más (ver abajo). |
| 11 | Solo `temas.ts` escribe `dataset.tema` | ✅ | El guardia de `invariantes.test.ts` está en verde. `grep`: `ponerTema` es el único que escribe. |
| 12 | Sin `?faccion=` la partida es la de siempre (`banco`, mismo hash) | ✅ (citado) | `implementacion.md`: sha `066767b4…af995`, «ancla: igual». No he relanzado el banco (encargo); las comprobaciones del diff están en «Cómo se probó». |
| 13 | `verify`, `verify:lento` y `capturas` en verde | ✅ | `verify`: lo corrí yo, salida 0. `verify:lento`: citado de `implementacion.md`. `capturas`: salida 0 y sin errores en consola (384 s). |

## Pasada adversarial

**Contraste.** Lo medí en Chromium. Para resolver las fichas de cada tema le puse `data-tema` a mano
desde la consola: es una medida, no el flujo del jugador.

- **Parejas de fichas** (WCAG, 4,5 o más exigido). En los seis temas pasan las 31 parejas medidas:
  - tinta tenue sobre panel, panel-alt, fondo, crónica y campo: mínimo **5,74** (no muertos);
  - título, acento, peligro, veteranía, rechazo y aviso;
  - el primario al pasar el ratón: mínimo 5,14 (no muertos);
  - la alerta;
  - la barra de estado (la previsión de daño): de 8,7 a 12,8;
  - la crónica (tenue, `win`, `lose`): mínimo 6,58;
  - el diálogo de conversación: de 13,1 a 15,0;
  - los sellos de la arena y del enlace;
  - la chapa del lienzo: de 13,2 a 16,0;
  - el rótulo de la base: de 14,6 a 17,5;
  - el bocadillo de `.nota`, que usa tinta sobre panel con borde oro.
- **Fin de partida.** La tinta sobre las dos puntas de los degradados de `--fin-gana` y `--fin-pierde`
  da de 7,5 a 11,0 en los seis. Es un cálculo de fichas: la pantalla de fin no la alcancé en el
  navegador.
- **Botones deshabilitados** (opacidad 0,45 sobre el panel): de 3,36 a 3,69 los normales y de 2,35 a
  3,29 los primarios. Ningún tema queda peor que el neutro de forma apreciable (orkos 3,36 frente a
  3,37). WCAG no exige contraste a lo deshabilitado.
- **Escaneo de elementos reales.** Recorrí todo elemento con texto visible, con su fondo efectivo
  compuesto y su opacidad, en los seis temas y en cinco pantallas: arena (montaje con unidades, edición
  con dos fichas abiertas, equipo) y partida (mapa y base). **Ningún elemento queda por debajo del
  umbral salvo los deshabilitados de siempre** («Abierta» en la edición, «Escudo: —» vacío), que ya
  estaban así en el neutro.

**¿Se distinguen?** Sí, a simple vista, en las hojas de contacto de montaje, edición y equipo. Cada
tema tiene un color de fondo dominante distinto y un primario propio: oro, violeta, mármol, plata y
rojo.

**Colores sin tema.** No queda ningún literal en las dos hojas ni color en línea en los `.ts` de
`views/` ni de `arena/`. En el lienzo quedan literales en piezas de información, fuera del criterio
8: el «!» de la emboscada, las cifras de carga, el daño flotante, el borde del punto del héroe en el
minimapa y el aro de la base. Ninguno desentona en las capturas.

**Consola.** No hay errores inesperados. Solo aparecen:
- los `pageerror` buscados (`?faccion=xyz`, repetido, `Necromancer`, `?seed=abc`);
- el WebSocket del espectador sin servidor, que es de antes;
- el aviso de siempre del suelo en el móvil a dpr 2;
- los avisos de `localStorage` cuando lo bloqueo a propósito.

**Móvil, 390 px.** No hay scroll horizontal: `scrollWidth` es 390 en la partida (caballero y
nigromante) y en la arena (elfos). El selector cabe en la barra (`qa/movil-*.png`).

## Hallazgos

### H1 — importante: el selector «Ejército» se queda con el foco; Espacio deja de pasar el turno y una flecha o una letra tira la partida

`pintar` conserva el foco por la identidad del elemento (`data-barra`), y el `keydown` de `main.ts`
ignora las teclas cuando el foco está en un `select`. El resultado: tras usar el selector, el teclado
del juego no responde, y la siguiente flecha o letra cambia de ejército, que empieza otra partida sin
preguntar.

Reproducción (semilla 7):
1. `pnpm dev` y abre `/?seed=7`.
2. Haz clic en el selector «Ejército», pulsa ↓ e Intro. Sale el nigromante: `?seed=7&faccion=necromancer`, con el foco aún en el selector.
3. Pulsa Espacio. **El turno no pasa** (sigue «Tu turno», día 1) y se abre el desplegable. La barra de estado sigue diciendo «Espacio pasa el turno».
4. Pulsa Escape y luego ↑. **La partida se descarta** y vuelve `?seed=7` con el caballero y una partida nueva.

Lo mismo pasa si solo abres el desplegable para mirar y lo cierras con Escape: el foco se queda ahí, y
la siguiente flecha o la letra «c»/«n» descarta la partida en curso, por avanzada que esté.

Quien juega esperaba que, tras elegir el ejército, Espacio pasara el turno, y que una tecla suelta
nunca le tirara la partida.

En la arena no hace daño: Espacio en combate cierra el turno igualmente, y cambiar el tema no descarta
nada.

### H2 — menor: las letras de cada tema mueven las medidas

El requisito dice «solo cambian el aspecto y la letra, no las medidas». El CSS no cambia ninguna
medida, pero las métricas de cada letra sí mueven la maqueta:
- la barra de arriba mide unos 34 px en templarios y unos 40 px en no muertos a 1440 px; en el móvil,
  90,5 frente a 95,5 px;
- en el panel de combate de no muertos el título parte distinto, «Editar» baja a otra línea y el último
  hechizo («Rayo») queda fuera de la vista; en templarios, la ayuda de debajo de los hechizos queda
  cortada (`qa/arena-*-prevision.png`).

Se puede desplazar y no rompe nada, pero el mismo panel enseña menos según el tema.

Reproducción: en la arena monta dos bandos, pulsa Luchar y alterna «Templarios» y «No muertos» en el
selector.

### H3 — menor: la letra de interfaz de orkos se lee pequeña

En orkos, la letra de interfaz es Liberation Sans Narrow (Arial Narrow) a 13 px. Los botones de la
batalla («Terminar turno», «Defender»), los hechizos y la edición se leen apretados y más pequeños que
en los otros cuatro temas (`qa/arena-orkos-combate.png`, `-edicion.png`). El contraste es correcto;
es cuestión de cuerpo de letra.

### H4 — menor: con dos parámetros malos, solo se dice el primero

Con `/?seed=abc&faccion=xyz` la barra solo habla de la semilla. Al arreglarla, sale el error del
ejército. Es coherente con el orden de lectura, pero son dos recargas para descubrir dos errores.

### H5 — menor: el mensaje de error nombra los ids internos

`?faccion=xyz` responde «valen knight, necromancer», mientras el selector dice «Caballero /
Nigromante». En la URL hay que escribir justo esos ids, así que el mensaje es útil; solo los dos
vocabularios no se tocan.

### H6 — menor: tras cambiar de ejército, la barra de estado queda vacía

Al cambiar de ejército (también desde la base) desaparece la ayuda «Haz clic en el mapa para mover a
tu héroe…» y la barra queda en blanco (`qa/selector-desde-la-base.png`). La ayuda solo se escribe una
vez al arrancar, así que «Partida nueva» ya hacía lo mismo: el patrón es de antes, pero el selector lo
hace más visible.

### H7 — menor: el selector es pequeño en el móvil

A 390 px, el selector «Ejército» mide 19 px de alto en templarios (24 en no muertos): queda por debajo
de un objetivo táctil cómodo.

## Workarounds usados

- **`data-tema` puesto a mano desde la consola**, solo para medir contraste en temas que la partida no
  puede tener (imperio, elfos, orkos en la partida) y en el neutro. No es un paso del flujo: en la
  arena los cinco temas se recorrieron con el selector real, y en la partida los dos que existen, con
  `?faccion=` y con el selector.
- **`localStorage` bloqueado o con un tema inventado** con `addInitScript`. Es el escenario adverso que
  pide el criterio 7, no un atajo.
- **La base se abrió desde la lista «Castillos»** (`open-town`) y no pisando el castillo. Es un botón
  real de la interfaz.

## No probado

- **La pantalla de fin de partida en el navegador.** Llegar a ella cuesta una partida entera; su
  contraste está calculado sobre las fichas (de 7,5 a 11,0).
- **Cambiar de ejército en mitad de una batalla de la partida.** No llegué a una batalla en el mapa.
  Desde el mapa y desde la base, sí.
- **Las letras en Windows y macOS** (Palatino, Garamond, Baskerville, Optima, Rockwell…): esta máquina
  solo tiene sus respaldos de Linux.
- **Firefox.** No está instalado para Playwright, y `rgb(from …)` necesita la versión 128 o posterior.
- **`pnpm qa`.** No se tocan `src/server/` ni el contrato.

## Vuelta 2

QA, 13-10-2026, sobre el código sin commit tras «Vuelta de QA 1» de `implementacion.md`. Solo se
reverifica lo afectado (H1, H2, H3, H4, H5 y H7; H6 queda fuera a propósito) y se hace una pasada
adversarial sobre lo cambiado, sobre todo `src/client/foco-de-la-barra.ts`.

### Veredicto

**Apto.** Los seis hallazgos que se decidió arreglar están arreglados y vistos en el navegador. La barra
del montaje de la arena a 390 px en templarios (129 frente a 144 px) es aceptable. La pasada adversarial
deja tres hallazgos nuevos, todos **menores**, que no bloquean (N1-N3), y una nota de algo anterior (N4).

### Cómo se probó

- `pnpm verify`, una vez: **salida 0**. 126 ficheros pasados (1 saltado), **3 087 tests pasados** y 14
  saltados; 52 s.
- `pnpm capturas`, una vez al cerrar: **salida 0**, «sin errores en consola», 65 PNG, 425 s (en el
  scratchpad, `v2/capturas/`). Miradas `desktop-01`, `desktop-12-fin-de-partida`, `movil-01` y
  `tactil-03`.
- Navegador: Playwright con Chromium sin pantalla, contra un `vite` propio en el 3271.
  - Arrancado con `set -m` en su línea (PID = PGID 222026) y parado por su grupo.
  - Después, `ss` dio el 3271 libre y el grupo vacío.
  - Tras `capturas`, ningún proceso escucha con cwd en este worktree.
- Scripts y recortes en el scratchpad de la sesión, carpeta `v2/` (`h1.mjs`, `tab.mjs`, `base.mjs`,
  `arena.mjs`, `medir.mjs`, `urls.mjs`, `atajos.mjs`, `reabrir.mjs` y `comparar.cjs`).

### Hallazgos de la vuelta 1

| | Estado | Evidencia |
|---|---|---|
| H1 — el «Ejército» se queda con el foco | ✅ arreglado | Ver «H1 en detalle». Mis pasos originales en `/?seed=7`: con clic, ↓ e Intro sale `?seed=7&faccion=necromancer` y el foco queda en el **canvas**. Espacio saca la pregunta de fin de turno. Escape y ↑ dejan la URL igual, con Malaquías. Tras abrir y cerrar con Escape, ninguna de ↑, ↓, «c», «n», Inicio, Fin ni RePág cambia el ejército (7 de 7), y el foco pasa al lienzo. Abrir, Escape, Espacio e Intro pasa al **día 2**. Consola sin errores. |
| H2 — las letras mueven las medidas | ✅ arreglado (con la salvedad de templarios a 390, aceptable) | Ver la tabla de medidas. |
| H3 — la letra de orkos se lee pequeña | ✅ arreglado | `--letra-ui` de orkos es `'Franklin Gothic Medium', …, Roboto, 'Nimbus Sans', sans-serif` (Roboto en Linux), a 13 px. Puse el lateral de la pelea a 1440 en templarios, orkos e imperio, lado a lado (`v2/cap/pelea-lateral.png`): «Terminar turno», «Defender», «Esperar» y los siete hechizos tienen en orkos el mismo cuerpo que en los otros dos. La edición de orkos (`v2/cap/orkos-edicion-rec.png`) se lee sin apretura. |
| H4 — con dos parámetros malos solo se dice uno | ✅ arreglado | `/?seed=abc&faccion=xyz` dice los dos, cada uno con su salida, y el `pageerror` lleva el mismo texto. A 390 px, `#status` mide 117 px con un `scrollHeight` de 117, así que no se recorta nada (`v2/cap/dos-fallos-390-p.png`). Con un solo fallo (`?seed=abc`, `?faccion=xyz`, `?seed=7&faccion=Necromancer`, `faccion` repetido, `?seed=-3&faccion=`) se dice solo el suyo. `?faccion=` y `?faccion=necromancer` arrancan, en templarios y no muertos. |
| H5 — el mensaje habla en ids | ✅ arreglado | `?faccion=: el ejército "xyz" no existe; valen knight (Caballero) y necromancer (Nigromante) — quita "?faccion=…" …`. Los nombres son los del selector: los dos leen `nombreDelEjercito`. |
| H7 — el selector mide 19 px en el móvil | ✅ arreglado | A 390 px, dpr 2 y táctil, el selector mide **44 px** de alto en la partida, en los seis temas, y también el «Tema» de la arena. `scrollWidth` es 390 en todas las medidas (`v2/capturas/movil-01-mapa.png`). |

#### H1 en detalle

**Partida, ratón.** Abrir con clic y cerrar con otro clic sobre el selector, sin elegir: el foco se
queda en el selector. La siguiente ↓ no cambia nada y lleva el foco al lienzo.

**Partida, teclado.** El orden de tabulación es: selector → canvas → «−» → «Centrar héroe»…
- Tab hasta el selector y Espacio lo abre. Dentro, ↓ e Intro eligen, y el foco va al canvas.
- Intro, F4 y Alt+↓ también lo abren.
- Con el selector cerrado y el foco dentro (llegado con el tabulador):
  - ↓ no cambia el ejército y lleva el foco al lienzo;
  - «c» y «h» llegan al juego.
- Tab y Mayús+Tab navegan con normalidad. Al volver con Mayús+Tab, Espacio lo vuelve a abrir.

**La base** (abierta con «Valdeluz» en la lista de castillos):
- Abrir y cerrar con Escape deja el foco en el selector. El siguiente Escape es del juego y sale de la
  base, que es lo esperable.
- Abrir, Escape y ↓ no cambian nada.
- Con ↓ e Intro sale el nigromante en el mapa, con el foco en el canvas. Después, Espacio e Intro pasan
  al día 2.

**Arena, montaje** (`/arena/?seed=3`):
- Clic, ↓ e Intro cambian el tema, y el foco queda en `BODY`, porque el lienzo está oculto.
- Abrir, Escape y ↓ no cambian el tema. Abrir, Escape y «o» tampoco.

**Arena, pelea:**
- Clic, ↑ e Intro cambian el tema, y el foco va al canvas.
- Abrir y Escape dejan el foco en el select; la siguiente ↓ no cambia el tema y el foco pasa al canvas.
- Abrir, Escape y Espacio cierran el turno.
- Tab hasta el selector y Espacio lo abren, sin cerrar el turno.
- En la pelea no hay ningún otro `<select>` visible fuera del `<dialog>` del editor. La regla nueva de
  `arena/main.ts` (un `SELECT` con el foco se queda sus teclas) solo toca al «Tema».

#### Medidas de H2

Alto en px. En la partida, los temas que el juego no alcanza (imperio, elfos y orkos) se midieron con
`data-tema` puesto a mano. En la arena, todos se pusieron con el selector real, y el neutro quitando
`data-tema`.

| Medida | neutro | templarios | no muertos | imperio | elfos | orkos |
|---|---|---|---|---|---|---|
| Barra de la partida, 1440 | 38,6 | 38,6 | 38,6 | 38,6 | 38,6 | 38,6 |
| Barra de la partida, 390 | 114,4 | 114,4 | 114,4 | 114,4 | 114,4 | 114,4 |
| Barra de la arena (montaje), 1440 | 51,4 | 51,4 | 51,4 | 51,4 | 51,4 | 51,4 |
| Barra de la arena (montaje), 390 | 144,2 | **129** | 143,9 | 143,9 | 143,9 | 143,9 |
| Barra de la arena (pelea), 1440 | 38,6 | 38,6 | 38,6 | 38,6 | 38,6 | 38,6 |
| Barra de la arena (pelea), 390 | 86,4 | 86,4 | 86,4 | 86,4 | 86,4 | 86,4 |
| Panel de la pelea (`#lateral`, caja de 784), 1440 | 1 373 | 1 376 | 1 384 | 1 384 | 1 376 | 1 372 |
| Panel de la pelea (`#stage`, caja de 704), 390 | 1 737 | 1 740 | 1 748 | 1 748 | 1 740 | 1 760 |
| «Rayo» (último hechizo) a la vista sin desplazar, 1440 | sí | sí | sí | sí | sí | sí |
| Todos los hechizos se alcanzan desplazando, 1440 y 390 | sí | sí | sí | sí | sí | sí |

Coinciden con las del ingeniero. Los siete hechizos están a la vista a 1440 en los tres temas que
recorté.

**La barra del montaje a 390 px en templarios es aceptable.**
- La diferencia es una línea menos en «Copiar enlace de la pelea»: Lato es más estrecha, así que los
  cinco botones miden 60 px en lugar de 75 (`v2/cap/montaje-390-hoja.png`).
- Nada se corta ni se solapa; los rótulos se leen enteros, y debajo se ve algo más de la página.
- Quien juega solo lo nota como un salto de 15 px de la barra al cambiar de tema en el móvil. Es un gesto
  raro, y no mueve nada que se esté tocando.
- Igualarlo costaría rehacer la maqueta de esos botones, y eso está fuera del encargo.

### El neutro no ha cambiado

He repetido la comparación del estilo calculado de cada elemento sin `data-tema`, con las hojas de ahora
y con las de HEAD (`git show HEAD:…`, sacadas otra vez), con 34 propiedades más `::before`, `::after` y
`::marker`:

| Página | Elementos | Diferencias |
|---|---|---|
| partida, mapa | 132 | 0 |
| partida, base | 91 | 0 |
| arena, montaje | 703 | 0 |
| arena, edición | 1 104 | 0 |
| arena, equipo | 1 393 | 0 |
| espectador | 15 | 0 |

**El método muerde.** Con dos reglas añadidas a la copia de HEAD (`#status { color: #123456 }` y
`body { line-height: 1.15 }`), sale de 64 a 2 283 diferencias por página. Después se restauró la copia.

Las dos reglas nuevas de la vuelta que no van con `:root[data-tema]` no tocan el neutro jugable:
- `#status[data-sin-arrancar]` solo se aplica en una página que no arrancó;
- el `min-height` del móvil solo toca a `.selector-de-la-barra select`, que el espectador no tiene.

### La barra de estado sin recorte

- Solo se suelta con `data-sin-arrancar`, cuando la partida no arranca.
- Con la partida en marcha sigue recortada a dos líneas: 20 px a 1440 y 39 px a 390 con la ayuda.
- Sin partida, a 390 px crece hacia arriba, de 697 a 844, y tapa la parte de abajo del minimapa vacío.
  No desplaza nada ni crea scroll: `scrollHeight` de la página = 844 = alto de la ventana.
- No hay lienzo vivo que se mueva, así que es aceptable.

### Hallazgos nuevos (pasada adversarial)

**N1 — menor (teclado). Quien abre el selector con el teclado y lo cierra con Escape no puede volver a
abrirlo con Espacio: Espacio pasa el turno.**

Reproducción (`/?seed=7`, 1440):
1. Llega con Tab al «Ejército» y pulsa Espacio: se abre.
2. Pulsa Escape: se cierra y el foco sigue en el selector.
3. Pulsa Espacio otra vez para reabrirlo. **El foco salta al lienzo** y sale «Aún puede andar hoy: Aldo
   de Valdeluz. ¿Terminar el turno?».
4. Pulsa Intro: pasa al **día 2**.

Esto sigue la regla decidida («al cerrarse sin cambiarlo, el foco vuelve al lienzo»), y con héroes por
mover hay pregunta de confirmación. Pero si ya no le queda a nadie movimiento, Espacio pasa el turno sin
preguntar.

Quien navega con el teclado esperaba que Espacio reabriera el desplegable que tiene el foco con su anillo
visible. Para reabrirlo, tiene que salir y volver con Tab/Mayús+Tab.

**N2 — menor. Con el foco en el selector cerrado, F5, Alt+←/→, Alt+D, F11 y F12 no hacen nada la
primera vez.**

`deQuienEsLaTecla` solo deja pasar el tabulador, los modificadores solos y Ctrl/Cmd.
- Lo demás va al juego con `preventDefault`, así que las teclas del navegador sin Ctrl se cancelan.
- Medido escuchando `keydown` en `window`, con el foco puesto en el selector: `F5:cancelada`,
  `Alt+ArrowLeft:cancelada`, `Alt+ArrowRight:cancelada`, `Alt+d:cancelada`, `F11:cancelada` y
  `F12:cancelada`. En cambio, `Ctrl+r` y `Ctrl+l` quedan libres.
- El foco pasa al lienzo, así que la segunda pulsación sí funciona.
- Pasa tras llegar con Tab o tras abrirlo y cerrarlo sin elegir, por ejemplo al recargar con F5 justo
  después de mirar el desplegable.
- **No probado** el efecto real: Playwright sin pantalla no lanza los atajos del navegador, ni siquiera
  con el foco en el lienzo. La evidencia es `defaultPrevented`.

Quien juega esperaba que F5 recargara y que Alt+← volviera atrás.

**N3 — menor (accesibilidad). Tras elegir con el teclado, el foco queda en el lienzo sin anillo
visible.**
- `alLienzo` pasa `focusVisible: false`. Tras Tab, Espacio, ↓ e Intro, el foco está en el canvas con
  `:focus-visible` falso. Lo mismo tras ↓ con el selector cerrado.
- Quien navega con el teclado ve desaparecer el foco. El siguiente Tab va a «−», el botón que sigue al
  lienzo, que es un orden lógico.
- Con el ratón, no llevar anillo es lo correcto.

**N4 — nota, anterior a la tarea. `?seed=` repetido se acepta en silencio.**
- `?seed=1&seed=2&faccion=xyz` solo habla del ejército. `semillaDeLaUrl` lee `get('seed')`, el primero,
  igual que en HEAD, mientras que `faccion` repetido sí se rechaza con `unaVezEnLaURL`.
- No es de esta vuelta. Se dice por la asimetría.

### Workarounds usados

- `data-tema` puesto a mano solo para medir en la partida los temas que el juego no alcanza (imperio,
  elfos, orkos) y el neutro. No es un paso del flujo.
- `page.focus()` sobre el selector en N2, para mandar los atajos con el foco ahí. Es el estado al que se
  llega con Tab.
- La base se abrió con su botón de la lista de castillos, que es un control real.

### No probado

- El efecto real de F5 y Alt+← en N2 (ver arriba).
- Firefox y Safari, sin `:open`: Firefox no está instalado para Playwright.
- Lectores de pantalla y teclado en pantalla del móvil con el selector.
- Cambiar de ejército en mitad de una batalla de la partida.

**Ya probado:** la pantalla de fin de partida, que en la vuelta 1 quedó sin probar, la recorre
`pnpm capturas` (`desktop-12-fin-de-partida.png`, «Partida perdida» en templarios). Se lee bien.

## Tras la vuelta 2 (coordinador)

- **N2, arreglado.** `foco-de-la-barra.ts` solo cancela (`preventDefault`) las teclas que cambiarían el selector cerrado (`laUsariaElSelector`: flechas, Inicio, Fin, RePág, AvPág, Intro y una letra, sin Alt, Ctrl ni Cmd). F5, F11, Escape y Alt+← vuelven a ser del navegador a la primera.
  - Test en `test/foco-de-la-barra.test.ts`; con la regla cambiada a `return true`, sale en rojo.
  - `pnpm verify` sale 0: 3 088 tests pasados.
  - No se volvió a probar en el navegador.
- **No arreglados** (menores, a la cola):
  - N1: tras cerrar con Escape, Espacio pasa al juego en lugar de reabrir el selector;
  - N3: sin anillo de foco en el lienzo tras elegir con el teclado;
  - N4: `?seed=` repetido se acepta en silencio, como antes de la tarea;
  - H6: la barra de estado queda vacía tras cambiar de ejército, como ya pasaba con «Partida nueva».
