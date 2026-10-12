# QA — página de edición de la arena

Validado contra la petición literal: «una pagina de edicion, a la que acceda desde arena en la que pueda elegir n personajes y se abran sus paginas de edicion. Que cada pagina de edicion se vea completa, sin scroll interno, y que pueda ver varias a la vez, hasta 4.»

**Método.** Arranqué un vite propio en :3177 (grupo propio, parado después y puerto comprobado libre). Usé Chromium de Playwright sin pantalla y entré por `/arena/` con clics reales, empezando por el montaje. Los scripts están en `qa/`, con rutas relativas a su carpeta:

- `explorar.ts`: maquetación.
- `jugar.ts`: el flujo y los valores malos.
- `bordes.ts`: hoja incompleta, retratos, clics con un campo pendiente.
- `juego.ts`: el cliente del juego y el espectador.

Las capturas están en `qa/*.png`. No pulsé «Guardar», y `data/borradores/` sigue sin existir, como antes de empezar.

**Comprobaciones citadas, no repetidas.** `pnpm verify` y `pnpm capturas` salieron en verde tras el último cambio, según el coordinador y `implementacion.md` («Tras /simplify»). Por mi cuenta corrí `pnpm vitest run test/arena-edicion.test.ts test/html.test.ts`: 58 de 58 en verde.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Acceso junto a Luchar/Guardar; «Volver» deja el montaje como estaba | ✅ | Barra del montaje: `Luchar, Copiar enlace de la pelea, Editar fichas, Guardar`. Barra de la edición: `Guardar, Volver al montaje`, con el rótulo «Edición». En `jugar.ts`, seed 23 y `reglas=bendicion`, con 3 puestos y la muralla de ejemplo, al volver salen iguales los muros (9 = 9), la URL, las reglas marcadas y la barra de arriba. Los bandos traen la cifra editada. |
| 2 | Elegir hojas y catálogo con el mismo filtro; de 1 a 4; la 5.ª no se abre y se dice | ✅ | El filtro es el mismo: «Orkos» elegido en el montaje sigue en la edición. Al abrir la 4.ª, la barra dice «…ficha abierta. Con 4, cierra una para abrir otra.» y la cabecera, en rojo, «Ya hay 4 fichas abiertas: cierra una para abrir otra.». La quinta (`peasant`) queda deshabilitada y lo explica en su `title`; un clic forzado sobre ella deja 4 fichas. Una hoja incompleta (simulada, ver *Workarounds*) sale deshabilitada con el `title` «No se abre: …». |
| 3 | Cada ficha se cierra con su × sin tocar las demás | ✅ | Con `[troll, templario, piquero, zombi]`, cerrar el templario deja `[troll, piquero, zombi]`, y el zombi conserva el ataque 7 que se le había puesto. Al cerrar la segunda de cuatro, los retratos de las demás siguen pintando (408, 397 y 284 px pintados en la muestra) y animando (`bordes.ts`, `b2-…png`). |
| 4 | Cada ficha completa, sin scroll interno, con 1-4 abiertas a 1280×720, 1440×900 y 1920×1080; sin scroll horizontal | ⚠️ Se cumple la letra del criterio, no la de la petición (ver H1) | Sin scroll propio en ninguna ficha: `scrollHeight == clientHeight` en todas las combinaciones (`explorar.ts`), sin descendientes fuera de la caja y sin desplazamiento horizontal ni en la página ni en las regiones. **Pero ninguna ficha se ve entera en ninguna de las tres pantallas**: miden de 735 a 1 309 px de alto y la región de las fichas tiene 372, 549 y 729 px. |
| 5 | Las mismas fichas: campos, validación, retrato animado y girable, «deshacer prueba»; editar aquí = editar en el montaje | ✅ | Valores malos en la hoja: −5, vacío, 2.5, vida 0, daño mínimo 50 > máximo, 9 casillas, 3 hexes y nombre vacío. Ninguno entra, el campo vuelve a su valor y la barra dice «No se cambia: …» con el motivo. Catálogo: el ataque del piquero pasa de 5 a 9, la barra dice «prueba que no se guarda…», «Volver a las del catálogo» lo devuelve a 5 y el botón desaparece. Lo editado en la edición se juega: el templario a 1000000002 sale en el lateral de la pelea («Ataque / Defensa 1000000002 / 8»; `j3-pelea.png`). También al revés: la vida del zombi cambiada en el montaje (31) aparece en su ficha de la edición. Girar una ficha solo pide la `d2` de su hoja (lo comprueba la pasada `edicion` de capturas). |
| 6 | La misma ficha no se abre dos veces | ✅ | Un doble clic sobre «Abrir» del troll abre 1 ficha y el botón pasa a «Abierta», deshabilitado. Lo recordado en `localStorage` con `catalogo:pikeman` dos veces se abre una sola vez y la barra lo dice. |
| 7 | Lo abierto se recuerda al ir y volver y, de comodidad, en `localStorage` | ✅ | Al ir y volver, y tras recargar, salen las mismas fichas en su orden. Con `{basura` guardado, la barra dice «No se leen las fichas que estaban abiertas: se empieza sin ninguna.». Con claves inexistentes, de héroe, repetidas o que no caben, abre las 4 válidas y la barra nombra las demás. Una hoja recordada que luego queda incompleta no se abre, y se dice al arrancar. |
| 8 | A 390 px, sin desplazamiento horizontal y las fichas una debajo de otra | ✅, con un menor (H3) | A 390×844 las 4 fichas van en una columna (left 14, ancho 358 cada una), sin desplazamiento horizontal en la página ni en las regiones (`e4-390.png`). |

## Hallazgos

### H1 — importante: ninguna ficha se ve entera ni en 1920×1080

**Qué pasa.** Con las fichas abiertas, la vista es una rejilla de dos regiones con desplazamiento propio. La lista ocupa hasta el 35 % del alto y las fichas van debajo. En la región de las fichas todas las fichas se desplazan juntas, mostrando la misma franja en vertical.

Medido con 4 abiertas (monje, troll, arquero del catálogo y caballero de la muerte):

| Pantalla | Región de las fichas | Alto de las fichas |
|---|---|---|
| 1280×720 | 372 px | 781–1 309 px |
| 1440×900 | 549 px | 751–1 249 px |
| 1920×1080 | 729 px | 735–1 181 px |

Con **una sola** ficha a 1920×1080, el monje mide 1 078 px en una región de 713 px.

A 1280×720 con 4 abiertas, lo primero que se ve son los retratos y los clips, sin un solo campo editable (`e4-1280.png`). A 1920×1080 los rasgos se cortan por abajo (`e4-1920.png`).

**Cómo reproducirlo.**
1. `/arena/?seed=11`, pulsar «Editar fichas».
2. Abrir Monje (Templarios), Troll con maza (Orkos), Arquero (Catálogo) y Caballero de la muerte (No muertos).
3. Mirar a 1920×1080.

**Qué espera quien juega.** La petición dice «que cada página de edición se vea completa». El criterio 4 permite desplazar la página «en una pantalla baja», y 1920×1080 no lo es. La suposición por defecto de `requisitos.md` era «si la ficha no cabe en alto, se compacta […] antes que poner scroll», y no se aplicó.

No es un fallo del guardia: la medida comprueba que no haya scroll *dentro* de la ficha, y no lo hay. Lo que no se cumple es «se vea completa».

Probablemente no se puede caber con las fichas de hoy: el monje, con sus poderes, mide más de 1 000 px aun a 640 de ancho. Así que lo tiene que decidir el usuario:

- aceptar el desplazamiento vertical como está;
- compactar la ficha (retrato más pequeño o al lado de los campos, rasgos en más columnas);
- o dejar que la lista se pliegue para darle el alto a las fichas.

### H2 — menor: dos zonas con scroll propio y una fila de tarjetas cortada

La lista es una región con scroll propio. A 1280×720 mide 207 px y su contenido llega hasta 620 px con el filtro «Catálogo». Una fila de tarjetas queda cortada por la mitad (`e4-1280-abajo.png`).

No es una ficha, así que el criterio 4 no la cubre. Pero en pantalla se ven dos barras de desplazamiento, y la rueda hace cosas distintas según dónde esté el ratón.

### H3 — menor: a 390 px se desplazan las regiones, no la página

A 390×844 la página no se desplaza. Lo hacen dos regiones anidadas:

- la lista: 242 px de alto para 2 165 px de contenido; con el filtro «Catálogo» se ve una tarjeta;
- las fichas: 437 px para 4 394 px.

El criterio 8 dice «ahí sí se desplaza la página». Se puede usar, pero es incómodo (`e4-390.png`, `b3-movil-abajo.png`).

### H4 — menor (accesibilidad): cerrar una ficha con el teclado deja el foco en `body`

**Cómo reproducirlo.** Con tres fichas abiertas, llegar con Tab al × del piquero y pulsar Intro.

**Qué pasa.** La ficha se cierra y `document.activeElement` queda en `BODY`. Quien va con teclado tiene que volver a empezar desde arriba. Lo esperable es que el foco pase al × de la ficha siguiente, o a su «Abrir» en la lista.

### H5 — menor: el «Nombre» no se lee entero en columnas estrechas

Con 4 fichas a 1280 y a 1440, el campo «Nombre» de «Caballero de la muerte» es más corto que el texto (`scrollWidth > clientWidth` en el `input`). Es el comportamiento normal de un campo, pero el nombre solo se lee entero en el título de la ficha.

### Fuera de alcance

- `1e9` entra como ataque (1000000000) y la pelea lo juega. Es la validación de siempre (`validarUnidadDeArena`), y el criterio 5 pide la misma.
- A 390 px no se ve «ARENA» en la barra. Pasa igual en el montaje (`m-montaje-390.png`: `.marca` mide 0×0), así que no es de esta tarea.

### Lo que salió bien en la pasada adversarial

- **Campo sin confirmar y un clic encima.** Escribí en un campo sin salir de él y pulsé otro botón: «Volver al montaje», el × de otra ficha, «Abrir» en la lista o un clip de la misma ficha. En los cuatro casos el valor entra (33, 34 y 35 se quedan) y el clic hace lo suyo. El riesgo que `implementacion.md` daba por no cubierto no apareció.
- **Escapado.** El nombre `<b>x</b>"'` se guarda y el título lo enseña como texto, no como marcado.
- **Tabulador.** Recorre los campos, los rasgos y el `select` de una ficha y pasa al × de la siguiente. Tras cambiar un valor, Tab y Shift+Tab llevan el foco donde toca.
- **Consola.** Sin errores en la arena. Los únicos avisos son el de la hoja incompleta simulada (el esperado) y uno de `getImageData`, que provoca mi medida.

## Cliente del juego y espectador (el `pintar` que conserva el foco)

- **Juego** (`/?seed=7`). Tab recorre el lienzo y los botones. Tras pulsar «Siguiente héroe» con el ratón, el foco vuelve a `BODY`: no se conserva, como antes, así que el Espacio sigue cerrando el turno o el día. Espacio + Intro pasan al «Día 2 · Semana 1». Sin errores en consola (`g1-juego.png`).
- **Espectador** (`/espectador/`, sin servidor). Dice «No hay nadie en ws://localhost:9880…» y reintenta. Los únicos errores son `ERR_CONNECTION_REFUSED` del WebSocket, esperables sin `pnpm partida`. Con servidor no lo probé yo: cito la pasada «espectador» de `pnpm capturas`, en verde (46 turnos de batalla y un final vistos).

## Workarounds usados

- **Hoja incompleta simulada.** Para tenerla, reescribí la respuesta de `/__arena/hojas` con `page.route`: `espectro` con `incompleta` y `direcciones: null`. Hoy no hay ninguna hoja a medias en el taller. Es la forma exacta que manda el servidor (`hojasDeArena`), así que quien juegue verá lo mismo cuando el taller deje una a medias. No afecta al usuario.
  - Mi primer intento dejó las `direcciones` puestas, y la arena se negó a arrancar diciéndolo («dice que está incompleta y trae sus direcciones»). Es correcto: el servidor nunca manda esa forma.
- **Datos guardados a propósito.** Escribí `localStorage` con basura y con claves raras para probar el criterio 7. Es lo que encontraría alguien con datos viejos.

## No probado

- **El espectador con una partida de verdad.** Lo cubre la pasada de `pnpm capturas` (en verde); no la repetí.
- **La conservación del foco del teclado en los paneles laterales del juego dentro de una batalla.** El caso de «Esperar» + Espacio con el teclado: con el foco visible en el botón, Espacio vuelve a pulsar ese botón, que es lo que pide el manejador (`enUnBoton`), no el fin de turno. Es coherente con el código; no lo jugué.
- **`pnpm verify` completo, `pnpm capturas` y `pnpm qa`.** Los dos primeros, citados en verde sobre el mismo árbol. `pnpm qa`: no se tocan el servidor ni el contrato.

## Veredicto

**Apto con reservas.** Se cumplen los ocho criterios tal como los escribió el coordinador, y lo editado llega al montaje y a la pelea.

La reserva es H1: la petición pedía «que cada página de edición se vea completa», y hoy ninguna ficha cabe en pantalla en ninguna de las tres resoluciones, ni siquiera abierta sola a 1920×1080. Se ve desplazando una región. Hay que preguntarle al usuario si eso le vale o si quiere fichas compactas o una lista plegable. H2 a H5 son menores.

## Vuelta 2 (12-10-2026)

Re-verifica H1-H5 y los criterios 4 y 8 tras la «Vuelta QA 1» de `implementacion.md`, con la decisión del usuario «Compactar la ficha».

**Método.** Arranqué un vite propio en :3181 (grupo propio, parado por su grupo; puerto comprobado libre después). Usé Chromium de Playwright sin pantalla con clics reales, empezando en `/arena/?seed=11`. Scripts nuevos en `qa2/` (rutas relativas a esta carpeta):

- `qa2/vuelta2.ts`: medidas a 1-4 abiertas, barrido de la 4.ª, nombre largo, 390 px, pasada adversarial y foco.
- `qa2/extra.ts`: nombre del hermano de carga, foco con otro filtro, retratos, campo pendiente + Plegar, diálogo de combate.
- `qa2/anim.ts`: retrato del catálogo en el montaje y en la edición.

Capturas en `qa2/*.png`. No pulsé «Guardar».

**Comprobaciones.**
- `pnpm verify`, una vez sobre este árbol: 120 ficheros, 2 962 tests en verde.
- Repetí `vuelta1/medir.ts`, `vuelta1/jugar.ts` y `vuelta1/bordes.ts`: salen 0, con las mismas cifras que dejó el ingeniero.
- `qa/explorar.ts`, `qa/jugar.ts` y `qa/bordes.ts` no los repetí: esperan la lista siempre desplegada, y sus copias en `vuelta1/` los sustituyen.
- `pnpm capturas` (pasadas `edicion`, `arena` y `poderes`) no lo repetí: lo cito en verde de `implementacion.md`, sobre el mismo árbol.

### Criterios afectados

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| H1 / 4 | Ficha entera a 1920×1080 y 1440×900 con 1-4 abiertas; sin scroll interno; 1280 puede desplazar | ✅ | **Fichas de alto distinto** (monje con dos poderes, arquero del catálogo con prueba y su «Volver a las del catálogo», caballero, troll), con 1, 2, 3 y 4 abiertas: enteras a 1920 y a 1440, sin desplazamiento en ninguna región, sin hijos fuera de la caja, sin textos recortados y sin scroll horizontal. A 1440 con 4 abiertas el monje mide 719 px y acaba en 833, con la vista hasta 847 (`v2-4-1440.png`). A 1920 el más alto mide 585 (`v2-4-1920.png`). **Barrido**: con monje, arquero y caballero abiertos, abrí como 4.ª cada uno de los 69 personajes que se pueden abrir (hojas y catálogo) a 1440×900. Todas caben; la 4.ª más alta es el hermano de carga, con 644 px hasta 757. **A 1280×720**, con 3 y 4 abiertas, las hojas no caben y se desplaza `#edicion` entera (monje 732 px hasta 846; `v2-4-1280.png`). Lo permite la decisión. Ninguna ficha tiene scroll propio en ningún caso. |
| H2 | Sin la fila de tarjetas cortada ni dos regiones con scroll | ✅ | La lista se pliega sola al abrir (`aria-expanded` pasa de true a false). Lo único que se desplaza es `#edicion`, y solo cuando no cabe. Con la lista desplegada y 4 abiertas a 1440 se desplaza la vista entera, no la lista (`v2-4-desplegada-1440.png`). |
| H3 / 8 | A 390 px se desplaza la página, no dos regiones; sin desplazamiento horizontal | ✅ | A 390×844 las 4 fichas van en una columna de 362 px, sin desplazamiento horizontal. Solo se desplaza `#edicion`, que ocupa toda la pantalla bajo la barra de arriba: la rueda la lleva de 0 a 1500 y `scrollY` sigue en 0, que funciona como la página (`v2-390.png`). Con la lista desplegada en «Catálogo» las tarjetas van enteras, una debajo de otra (`v2-390-lista.png`). |
| H4 | Cerrar con Intro deja el foco en la ficha de al lado o en su «Abrir» | ✅ | Con `[monje, arquero, caballero, esqueleto]` abiertas: **(1)** llegué con Tab al × del arquero y pulsé Intro, y el foco pasó al × del caballero; **(2)** cerré la última, el esqueleto, y el foco volvió al × del caballero, la anterior; **(3)** con Espacio pasa lo mismo; **(4)** al cerrar la única que quedaba, el foco fue a «Abrir» del caballero en la lista. Con el filtro en otra facción («Orkos») cuyo «Abrir» no está en la lista, el foco va al botón del filtro «Orkos», y Tab sigue a «Catálogo». Al cerrar con el ratón el foco queda en `BODY`, como dice la desviación declarada. |
| H5 | El nombre a todo el ancho de la ficha, para que se lea entero | ✅ con un menor (V2-1) | «Caballero de la muerte», «Troll con maza» y «Orko con dos armas» se leen enteros a 1920, 1440 y 1280 con 4 abiertas (`scrollWidth == clientWidth`). El campo va a todo el ancho. Fallan los nombres de más de unos 35 caracteres, ver V2-1. |

### Pasada adversarial nueva

- **Plegar y desplegar con fichas abiertas.**
  - Cuatro alternancias seguidas dejan el estado coherente y las 4 fichas en su sitio.
  - Con un ataque escrito sin confirmar (41), pulsé «Plegar»: el valor entra y al volver al montaje la ficha del monje dice 41.
  - Los retratos de las hojas siguen animando tras plegar y desplegar: de 4 a 6 imágenes distintas en 3 s.
  - El del catálogo (piquero) no anima, pero tampoco en el montaje (`qa2/anim.ts`: 1 imagen distinta en los dos sitios). Es así de antes, no de esta tarea.
- **Filtros con la lista plegada.** Plegada, la lista es solo su cabecera: 0 filtros y 0 «Abrir». Al desplegar, sigue elegido el filtro de antes («No muertos»).
- **Cerrar con la lista desplegada** la deja desplegada.
- **Abrir tras desplegar.**
  - Abrí el esqueleto: la lista vuelve a plegarse, la barra dice «…ficha abierta. Con 4, cierra una para abrir otra.» y las 4 caben enteras a 1440 y a 1920.
  - Con 4 abiertas y la lista desplegada, no queda ningún «Abrir» habilitado y la cabecera dice «Ya hay 4 fichas abiertas: cierra una para abrir otra.».
- **Ir y volver y recargar con 4 abiertas.** Al ir al montaje y volver, y tras recargar, se entra con la lista plegada y las 4 abiertas. Sin ninguna abierta no hay botón de plegar.
- **La ficha del montaje no se ha compactado.** Fuera de `.ficha-abierta`: retrato de 200 px, una columna de campos y rótulos de 12 px, igual antes y después de pasar por la edición (`m1-montaje-ficha.png`).
- **La ficha del diálogo de combate no se ha compactado.** «Editar» del monje en plena pelea abre el diálogo sin `.ficha-abierta`, con el rótulo encima de cada campo en dos columnas, como antes (`x-dialogo-combate.png`).
- **Consola.** Sin errores. Hay avisos de `getImageData`, que provoca mi medida, y el de la hoja incompleta que simula `bordes.ts`.

### Hallazgos de la vuelta 2

**V2-1 — menor: un nombre largo sigue sin leerse entero en el campo con 3-4 fichas a 1440 o a 1280.**

**Cómo reproducirlo.**
1. `/arena/?seed=11`, «Editar fichas».
2. Abrir Hermano de carga, Monje, Orko con dos armas y Piquero (catálogo).
3. Mirar a 1440×900.

**Qué pasa.** El campo «Nombre» del hermano de carga mide 279 px y su texto, «Hermano de carga (montado; antes Caballero montado)», 347 px. A 1280 el campo mide 239 px. A 1920 cabe (399 px). Con un nombre escrito a mano de 47 caracteres pasa lo mismo a 1440, a 1280 y a 390.

El título de la ficha sí lo enseña entero, partido en dos líneas (`x-hermano-1440.png`), así que el nombre se puede leer. La regla de H5 se cumple a la letra: el campo va a todo el ancho. Lo que no hace es el salto de línea, porque un `input` no lo admite.

El guardia de `capturas` no lo ve: solo mira las fichas que abre su pasada. Mejorarlo sería un `textarea` de una o dos filas, o aceptarlo así, con el título como lectura.

### Fuera de esta tarea

- **Barra de estado vacía tras un cambio que entra.** Pasa con «Plegar», Intro o Tab: la barra se queda en blanco. Ya pasaba en la vuelta 1, por ejemplo con `1e9`.
- **El piquero y el arquero del catálogo no animan su retrato**, en el montaje igual que en la edición.
- **La batalla**: otro ciclo está tocando el tablero y la proyección, y no la juzgué. El diálogo de combate abrió sin errores en consola.

### Workarounds usados

- **`qa2/extra.ts` enfoca el × con `focus()`** en lugar de llegar con Tab en algunos casos. Chromium lo trata como `:focus-visible`, igual que el teclado, y el caso del medio lo hice con Tab real.
- **`bordes.ts` simula una hoja incompleta**, como en la vuelta 1, con la forma exacta que manda el servidor.

Ninguno de los dos afecta a quien juega.

### No probado

- **`pnpm capturas`**: citado en verde, no repetido (245 s y la máquina compartida).
- **`pnpm qa`**: la vuelta no toca el servidor ni el contrato.
- **Holgura del monje a 1440 con 4 abiertas**: queda en 14 px, como dijo el ingeniero. Si se le añaden poderes o habilidades dejaría de caber, y la pasada de `capturas` lo diría. Hoy, ningún personaje de los 69 lo rompe.

### Veredicto de la vuelta 2

**Apto.** H1 a H4 quedan corregidos y verificados en el flujo real. H5 se cumple tal como se pidió, con un menor (V2-1): un nombre de más de unos 35 caracteres no se lee entero en su campo con 3 o 4 fichas, aunque sí en el título. Los criterios 4 y 8 se cumplen. Las fichas del montaje y del diálogo de combate no han cambiado.
