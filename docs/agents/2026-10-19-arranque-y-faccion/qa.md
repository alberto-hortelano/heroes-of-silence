# QA: arranque, menú, facción, tema y héroe en la base

Rama `claude/game-tuning-start-a0b1d8`, commits `5f5fb9d7..cd194929`, árbol limpio (solo
`hallazgos-simplify.md` sin seguimiento). Lo probé el 19-10-2026 con Playwright sin pantalla
(Chromium de `node_modules`) contra mi propio vite en `:3187`. Lo arranqué con `set -m` (PID = PGID
919019), lo maté por su grupo y comprobé que el puerto quedó libre. La máquina estaba cargada
(load 13-16). Las capturas están en `qa/`.

Los guiones están fuera del repo, en el scratchpad de la sesión: `qa-arranque.ts`, `qa-menu.ts`,
`qa-scroll.ts`, `qa-swipe.ts`, `qa-fin.ts`, `qa-doble.ts` y `qa-nodo.ts`. Para leer lo que no se ve
en la página (posición de los héroes, facción del rival), uso un espejo `new Session(seed, f)` de la
misma partida. El espejo coincide con la página en oro, día y movimiento tras cada gesto.

## Comprobaciones de base

- **`pnpm verify`** (una vez, sobre `cd194929`): exit 0, `146 passed | 1 skipped`,
  `3414 passed | 14 skipped`, 84,6 s.
- **No repetidas.** Las cito de `implementacion-2.md`, todas sobre el árbol final o sobre `cd194929`:
  - `verify:lento`: 5296 tests en verde.
  - `pnpm banco`: `3406f518…`, 0/200 sin terminar.
  - `barrido-semillas` 1-100: 0 sin terminar.
  - `rectitud`: 120 / 0 / 11.
  - `pnpm qa`: exit 0, 298/299 veredictos entraron.
  - `neutro.ts main`: 0 diferencias.
  - `pnpm capturas` entera en `cd194929`: 683 s, sin errores.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | `/` enseña un menú con tres opciones, sin montar la partida ni el Worker | ✅ | En las 5 pasadas: `#inicio` visible, `#app` oculto, sin `data-escenario`, sin `data-tema` y 0 workers (`page.on('worker')`) hasta pulsar «Empezar». Captura `menu-escritorio.png`. |
| 2 | «Cargar partida» desactivado, dice por qué, y el teclado es coherente | ✅ | El Tab lo alcanza (orden Nuevo → Cargar → Rápida). Intro, Espacio y clic (forzado, ver workarounds) no cambian nada. `aria-describedby` apunta a «Aún no hay partidas guardadas.», que se lee bajo el botón. Captura `menu-foco-en-cargar.png`. |
| 3 | «Nuevo juego» abre la elección: cinco facciones con nombre y rasgo, y confirmar empieza con la elegida | ✅ en escritorio · ❌ en móvil 375 | Escritorio: 5 opciones, cada una con nombre, rasgo y «Empiezas con …». Probé las cinco hasta la base. **En un móvil de 375×812 «Empezar» queda fuera de la pantalla y no se alcanza tocando**: ver H1. |
| 4 | Tema al pasar el ratón o enfocar; en partida, el del jugador; menú en neutro | ✅ (con H2) | Pasar el ratón, marcar, flechas, foco y toque visten su facción en las 5. Escape y «Volver» quitan el tema (`tema: null`). Base y mapa llevan el tema de quien juega (`base-*.png`, `mapa-*.png`). Tras «Partida nueva», `tema: null`. |
| 5 | Rival de otra facción, sorteado desde la semilla con una sola función | ✅ | En el navegador, la facción y su rival: templarios s15424 contra no muertos, no muertos s42123 contra templarios, imperio s65820 contra no muertos, elfos s88686 contra no muertos, orkos s12687 contra imperio. En Node, 1-120 × 5: 0 parejas malas, y `faccionesDeLaSemilla(s, la suya)` equivale a `faccionesDeLaSemilla(s)` en las 120. |
| 6 | Un héroe de su facción, dentro de su base (también el de la IA) | ✅ | Los dos héroes de cada partida en la casilla de su base, con la facción de su dueño: 5 partidas del navegador y 30 × 5 en Node, 0 fallos. En el mapa, el héroe se pinta sobre su castillo (`mapa-no-muertos.png`) y el panel dice «Héroe · rango 5 · nivel 4». |
| 7 | Abre en la base caminable; al salir, el mapa; salir y volver a entrar | ✅ | Las 5 abren en `town` en 0,6-0,9 s, con el héroe de su color (`base-*.png`). Un clic en el suelo lo echa a andar (`data-base` cambia). «Volver al mapa» y Escape llevan a `adventure`. Las 5 salen a 2 casillas: página y espejo coinciden, p. ej. elfos «1601 / 1751» (`fuera-*.png`). Pulsar su castillo vuelve a entrar en las 5 (`vuelta-*.png`). |
| 7b | El suelo ya pintado al salir | ✅ | Con la escena aún en `town`, `data-escenario="pintado"` llega a los 16,3-19,2 s de empezar. Al salir está `pintado` en las 5. |
| 8 | Partida rápida: facción y semilla al azar, sin elegir, abre en la base | ✅ | 3 veces, con doble clic: s35128 imperio, s37445 templarios, s39661 orkos. En las tres coinciden la URL, el tema y `faccionesDeLaSemilla(s)[0]`, y la partida abre en `town`. Captura `rapida-base.png`. |
| 9a | La URL reproduce la partida | ✅ | `?seed=88686&faccion=elfos` en un contexto nuevo: sin menú, tema elfos, oro 9000 como el espejo. `?seed=7` escribe `&faccion=templarios`, la de la semilla, y `Session(7)` es igual a `Session(7,'templarios')`. `?faccion=elfos` sortea la semilla y la escribe. `?seed=7#nota` conserva el fragmento. `?seed=7&faccion=` juega la de la semilla. |
| 9b | Una facción que no existe se rechaza diciéndolo | ✅ | `?faccion=xyz`, `?faccion=Elfos`, `?seed=7&faccion=%20elfos` y `?faccion=elfos&faccion=orkos` pintan `#no-arranca` con el motivo y la salida («quita "?faccion=…"»). `?seed=abc&faccion=xyz` dice los dos. `?seed=&faccion=` y `?otra=1` dan el menú. Capturas `url-*.png`. |
| 9c | «Partida nueva» | ✅ | `?seed=12687&faccion=orkos`, jugada sin moverse con «Fin de turno» y «Resolver sola»: «Partida perdida» el día 6. «Partida nueva» lleva al menú, con `http://localhost:3187/` y `tema: null`. Capturas `fin-de-partida.png` y `partida-nueva-menu.png`. |
| 10 | Arena y espectador en neutro | ✅ | `/arena/` y `/espectador/` cargan sin `data-tema` y sin `#inicio` (`neutro-arena.png`, `neutro-espectador.png`). La arena no da errores. El espectador sin servidor solo da `ws://localhost:9880 ERR_CONNECTION_REFUSED`: es lo esperado, porque no levanté `pnpm partida`. El espectador con servidor lo cubre `capturas`. |
| 11 | verify, banco, barrido y capturas | ✅ | `verify` lo corrí yo. Lo demás, citado arriba. |
| — | Menú a 375 px y con teclado | ❌ (H1) | El menú cabe a 375 (`menu-movil.png`, sin desbordar a lo ancho). La elección no cabe a lo alto (H1). Con teclado (escritorio): Tab, Shift+Tab, Intro en «Nuevo» (foco en la marcada), flechas que marcan y visten (dan la vuelta de orkos a templarios), Escape (menú, foco en «Nuevo», neutro), Intro en la radio, que empieza con la marcada, y Escape en la base, que lleva al mapa. Todo bien. |

## Hallazgos

### H1. Bloqueante (móvil): en un teléfono no se puede pulsar «Empezar»

`style.css` pone `html, body { overflow: hidden }`, y `#inicio` es `min-height: 100dvh` sin scroll
propio. La elección mide 886 px y pasa del alto de la pantalla, así que «Volver» y «Empezar» quedan
fuera y no se puede desplazar hasta ellos: ni con la rueda, ni con End, ni deslizando el dedo.

Medido en Chromium móvil (`isMobile`, `hasTouch`):

| Pantalla | Arriba de «Empezar» | Alto | ¿Se ve? |
|---|---|---|---|
| 375×812 | 841 | 812 | no |
| 375×667 | 841 | 667 | no |
| 390×844 | 804 | 844 | sí, por 6 px, pero el borde de abajo del cuadro sale cortado; en un Safari real, con la barra de direcciones, tampoco se vería |
| 1366×768 y 1280×720 | | | caben |

- **Reproducir:** pantalla de 375×812 táctil, abrir `/`, tocar «Nuevo juego» y tocar una facción.
  No hay botón para empezar. Tres deslizamientos de 500 px (eventos táctiles reales por CDP) dejan
  «Empezar» igual, a 841 px. Captura `eleccion-movil-375-sin-empezar.png`. En
  `eleccion-movil-orkos.png`, la de página entera, el cuadro acaba cortado bajo los orkos.
- **Lo que esperaba quien juega:** poder bajar hasta «Empezar» (o verlo siempre). Solo llega con el
  teclado: el foco desplaza el `body` por programa, cosa que en un teléfono no ocurre. Salida
  provisional: «Partida rápida».
- Mi pasada de móvil de `qa-menu.ts` llegó a la base solo porque el `tap()` de Playwright hace
  `scrollIntoView` (ver workarounds). La pasada «arranque» de `capturas` va a 1440×900 y no lo ve.

### H2. Menor: la elección abre con el tema de la facción que queda bajo el ratón, no con el de la marcada

- **Reproducir** (1440×900 o 1280×720): abrir `/` y hacer clic en «Nuevo juego» sin mover el ratón
  después. El puntero queda sobre «No muertos», el navegador avisa de `pointerover` y la pantalla
  se viste de no muertos con «Templarios» marcado. Intro juega templarios. Captura
  `eleccion-tras-clic-raton-quieto.png`.
- Cumple la letra de C4, porque el ratón «pasa» por No muertos. Pero lo primero que ve todo el que
  juega con ratón es un tema que no es el de lo marcado. Al mover el ratón fuera de la lista se
  corrige. `hallazgos-simplify.md` §10 pedía «ratón quieto sobre una opción no cambia el tema».

### H3. Menor: rótulos cortados en el panel de la base

A 1440×900, con un nombre largo, las cabeceras «LIBRO DE ALDO DE VA…» y «TROPA DE ALDO DE VA…» del
panel de la base salen cortadas (`base-templarios.png`). Seguramente ya pasaba antes; ahora es lo
primero que se ve.

### Observaciones (no son fallos de esta tarea)

- Los rasgos van sin tildes y con faltas («Rapidos», «formacion», «caidos», «resucitarles y
  resuzitar»). Salen literales del cuaderno, como manda la regla de «se extrae, no se teclea»: se
  arreglan en `NuevaJugabilidad.md` y se vuelve a extraer.
- El menú se reemplaza en el historial (`replaceState`): «Atrás» desde la partida sale del juego
  (`about:blank`), no vuelve al menú. A media partida, la única vuelta al menú es editar la URL. No
  se pedía.
- Con el menú abierto, `#app` lleva `data-escena="adventure"`: es el atributo estático de
  `index.html`, igual que en main. No tiene efecto, porque `#app` está oculto.
- Doble clic en «Empezar» y en «Partida rápida», e Intro dos veces: una sola partida, la URL no se
  pierde.
- Consola: 0 errores en todas las pasadas de partida, menú, URLs, rápida, fin y arena.

## Workarounds usados

- **Clic forzado en «Cargar partida»** (`click({ force: true })`): Playwright no pulsa lo que lleva
  `aria-disabled`, pero una persona sí. Lo forcé para probar el gesto real. No afecta al usuario.
- **El `tap()` de Playwright en «Empezar» a 375 px** desplaza la página por programa hasta el botón.
  Escondía H1, así que **se reporta como fallo**, no como paso.
- **Espejo `Session` en Node** para posiciones, facción del rival y la casilla de salida: solo lee.
  La página se juega con clics reales en píxeles (`casillaAPixel` sobre `EscenaAventura` del espejo,
  como `capturas`). No afecta al usuario.
- **Deslizamiento por CDP** (`Input.dispatchTouchEvent`): es el gesto real que Playwright no trae.

## No probado

- La rueda del golpe con tema en una batalla de la partida, abierta. Es lo mismo que declara el
  ingeniero.
- El espectador conectado a una partida del servidor: está en `capturas` (citado).
  `temas-con-piezas.ts` (~5 min) no lo corrió nadie.
- Safari o iOS reales, y el móvil en apaisado. Por la cuenta de H1, en apaisado tampoco cabe.
- La partida rápida móvil hasta el mapa por toque: sí probé, con toques, el «Volver al mapa» de la
  base de los orkos en móvil (`base-movil-orkos.png`, `mapa-movil-orkos.png`).

## Veredicto

**No apto**, por H1. En escritorio todo lo pedido se cumple y lo vi jugando: el menú, «Cargar»
apagado, las cinco facciones con su tema y un rival distinto, el héroe dentro de la base, la base
caminable, la salida con el suelo ya pintado, salir y volver a entrar, la partida rápida, la URL que
reproduce y rechaza, «Partida nueva», y la arena y el espectador en neutro. Pero en un teléfono la
elección de facción no deja empezar: se queda sin salida. Parece que basta con dar scroll propio a
`#inicio` (`height: 100dvh; overflow-y: auto`). Tras arreglarlo, hay que volver a mirar la elección
a 375×812 y a 375×667 tocando, no con `tap()` sobre el botón. H2 y H3 pueden ir después.

---

# Vuelta 2: H1, H2 y H3 sobre `36c2a75a`

Lo probé el 19-10-2026 con Playwright sin pantalla contra mi vite en `:3188`. Lo arranqué con
`set -m` (PID = PGID 943985, cwd del worktree), lo maté por su grupo y `ss` dio el puerto libre. No
toqué el vite de `:3201`. La máquina estaba cargada (load 13-17). Los guiones están en el
scratchpad de la sesión: `v2-movil.ts`, `v2-escritorio.ts` y `v2-extra.ts`. Las capturas, en `qa/v2-*.png`.

**No repetidas** (citadas de `implementacion-3.md`, mismo árbol que `36c2a75a`): `pnpm verify` exit 0
(3414 passed), y la pasada «arranque» de `capturas`, en verde. Vi morder a los tres guardias con el
código de antes. `verify:lento`, `banco` y `barrido` siguen siendo los de `implementacion-2.md`: el
núcleo no cambió.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| H1 | A 375×812 se baja hasta «Empezar» con el dedo y se empieza | ✅ | Todo con toques de CDP (`Input.dispatchTouchEvent`), nunca `tap()` sobre el botón. Al abrir, «Empezar» queda en 841-875 de 812 y el título se ve (43). Un deslizamiento, que empieza sobre «No muertos», lo deja en 735-769 (`scrollTop` 106) con el tema y la marcada sin cambiar (templarios). Toqué «Elfos» y la página pasó a tema elfos, marcada elfos. Toqué «Empezar»: `town`, tema elfos, `?seed=44250&faccion=elfos`. El `body` no se mueve (0). `v2-eleccion-abajo-375x812.png`, `v2-base-375x812.png`. |
| H1 | Lo mismo a 375×667 | ✅ | Antes 841-875 de 667. Un deslizamiento lo deja en 590-624 (`scrollTop` 251). «Orkos» tocado → tema orkos. «Empezar» → `town`, orkos, `?seed=52692&faccion=orkos`. `v2-eleccion-abajo-375x667.png`. Deslizar otra vez con la lista ya abajo del todo no esconde «Empezar». |
| H2 | Clic en «Nuevo juego» con el ratón quieto → el tema de la marcada | ✅ | A 1440×900, 1280×720 y 1366×768: el tema es templarios, la marcada es templarios y debajo del puntero queda no muertos (`elementFromPoint`), así que la prueba muerde. Moviendo 1 px pasa a no muertos (la vista previa se despierta). `v2-clic-quieto-1440x900.png`. |
| H2 | Al volver del menú, ratón quieto → el tema de la marcada | ✅ | Marqué imperio con dos flechas y salí con «Volver», por clic: el menú queda en `tema: null`. Al pulsar «Nuevo juego» con clic y dejar el ratón quieto: tema imperio, marcada imperio, debajo no muertos (`v2-vuelta-del-menu-quieto.png`). Si se vuelve con Escape y luego Intro, con el ratón quieto encima, el tema también es el de la marcada en los tres tamaños. |
| H3 | Rótulos del panel de la base en las cinco facciones | ✅ | Probé cinco facciones × semillas 15424, 7 y 99, a 1440×900 y a 1280×720 (30 bases). Todos los `#side h3` miden 282/282: «Edificios», «Crecimiento semanal» (también con la Cinzel de los templarios), «Guarnición», «Libro del héroe» y «Tropa del héroe». Ningún elemento de `#side` recortado con `overflow: hidden` o `ellipsis`. La línea «<héroe> está dentro.» sale en las 30. A 375×812 (templarios, orkos, imperio), 339/339. `v2-base-<facción>.png`. |

## Pasada adversarial

- **Móvil en apaisado, 812×375 y 667×375**: el menú cabe (título en 77, «Partida rápida» acaba en
  298). La elección mide 734 y 752, y un deslizamiento lleva «Empezar» a 314-348 y a 335-369. Toqué
  imperio y no muertos, y se empezó con cada una en su base (`v2-eleccion-abajo-812x375.png`). ✅
- **390×844**: «Empezar» se ve sin bajar (804-838) y se desplaza 37 px. Empieza con imperio. ✅
- **Escritorio, elección centrada**: a 1440×900 los márgenes miden 99/99 y a 1366×768, 33/33. A
  1280×720 sobran 14 px y el cuadro va de 16 a 718. ✅
- **Escritorio bajo, 1024×600, con la rueda**: «Empezar» pasa de 691 a 557 (`v2-rueda-1024x600.png`). ✅
- **Teclado con el ratón encima de otra facción**: la flecha manda. Tema y marcada coinciden y se
  empieza con la marcada (orkos, tras clic y salir de la lista). ✅
- **Volver al menú → neutro**: con el dedo en los cinco tamaños de móvil, y con clic o Escape en
  escritorio, el tema queda en `null`. ✅
- **Abierta con el teclado, sin señales previas del ratón**: el primer movimiento de un solo paso
  sobre «Elfos» no viste (templarios). El segundo sí (elfos). Es lo que dice `implementacion-3.md`:
  el primer punto solo se apunta. Un ratón real manda decenas de eventos, así que no se nota. No
  es fallo.
- **El dedo no hace vista previa**: los deslizamientos que empiezan sobre una facción no cambian
  el tema ni la marcada (los cinco tamaños). Tocar una facción la viste y la marca. ✅
- Consola: 0 errores en todas las pasadas. El log de vite, sin errores.

## Observaciones (no son fallos de esta tarea)

- Al volver a abrir la elección en un móvil con una facción de abajo marcada (orkos a 375×667,
  imperio a 812×375), la lista abre ya bajada (`scrollTop` 251 y 224), porque el foco va a la
  marcada y el navegador la trae a la vista. El título queda fuera, pero se sube deslizando. Es lo
  esperable.
- En apaisado (812×375), la base abre con el panel lateral cortado por abajo, bajo «Edificios»
  (`v2-base-812x375.png`). Es la disposición de la partida en un móvil apaisado, no la elección,
  y ya estaba antes de esta tarea.

## Workarounds

- **Toques por CDP** y `page.mouse` en píxeles: son los gestos reales. No usé ningún `tap()` ni
  `click()` de localizador, que desplazan por programa.
- **`window.__name` en `addInitScript`**: es un ajuste de `tsx` para que se ejecuten mis
  `page.evaluate`. No toca la página. No afecta al usuario.

## No probado

- Safari o iOS reales, la barra de direcciones que se esconde, la inercia de un dedo de verdad.
- La `pnpm capturas` entera sobre `36c2a75a` (ni la corrió el ingeniero ni yo). Las demás pasadas
  no tocan nada de esto.

## Veredicto (vuelta 2)

**Apto.** H1 está arreglado: en un teléfono, de pie y en apaisado, se baja deslizando hasta
«Empezar» y se empieza con la facción tocada. H2 está arreglado: con el ratón quieto, al abrir y al
volver del menú, el tema es el de la marcada. H3 está arreglado: ningún rótulo de la base se corta
en las cinco facciones. La pasada adversarial no encontró nada nuevo.
