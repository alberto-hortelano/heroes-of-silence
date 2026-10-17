# QA — La rueda del golpe (arena)

13-10-2026. Lo he validado contra la petición literal y las decisiones de `requisitos.md`, no contra el plan.
El diff no ha cambiado desde el último verde de `implementacion.md`: ningún fichero de `src/`,
`test/`, `data/` ni `tools/` es posterior a las capturas de las 14:49. Por eso cito `pnpm verify`,
`pnpm banco`, `pnpm qa` y `pnpm capturas` en vez de repetirlos.

Lo que he hecho yo:
- **Un script de núcleo** con la tabla de cruces, cifra a cifra.
- **200 batallas al azar con rueda, cada una jugada dos veces**, más 40 `autoResolve` con
  invariantes.
- **El flujo real en `/arena/`** con Playwright sin pantalla (Chromium headless; no he usado el
  Chrome del usuario), sobre un vite propio en el puerto 3197. Lo maté por su grupo y el puerto
  quedó libre.
- **Seis capturas propias**, guardadas como `capturas/qa-*.png`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Interruptor «Golpe: azar / rueda», por defecto azar; `?golpe=rueda`; un valor malo se rechaza diciendo cuáles valen | ✅ | Montaje: «GOLPE · CON LA RUEDA — Cuerpo a cuerpo [Azar] [Rueda]». La barra pasa a `golpe=rueda`. «Copiar enlace» da `…?seed=3&golpe=rueda&montaje=…`, y al abrirlo el montaje sale en rueda. Con `?golpe=ruleta` la barra dice «"ruleta" no es un modo del golpe; valen azar, rueda — se pelea con el golpe al azar» y el montaje queda en azar (`capturas/qa-url-mala.png`). Repetido (`golpe=rueda&golpe=azar`): «"golpe" va 2 veces en la URL…» |
| 2 | La rueda con seis tipos en anillo y Normal en el centro, como en la petición; nombre, efecto en tooltip y horquilla contra ese objetivo | ✅ | Arriba Rápido; luego Defensivo arriba a la derecha, Finta abajo a la derecha, Fuerte abajo, Romper guardia abajo a la izquierda, Ofensivo arriba a la izquierda; Normal en el centro (`rueda-02-golpe.png`). Las horquillas: «Rápido 2 × 13–26», «Normal 33», «Fuerte 28–55». La nota sale al pasar el ratón y con Tab: «Daño ×1,25.», «2 golpes de daño ×0,6 cada uno…» |
| 3 | Elegir con clic, con las teclas 1-7 o con flechas + Intro; Escape cancela antes de elegir | ✅ | En el navegador elegí con los tres métodos: `tecla respuesta=defensivo`, `flechas golpe=fuerte` (el foco cae en el sector pedido) y `clic respuesta=rapido`; los tres dieron su cruce. Escape en la fase del golpe cierra la rueda. Escape en la respuesta no la cierra y la barra dice «El golpe ya viene: elige la respuesta en la rueda.». Las teclas 8 y 0 no hacen nada. Durante el desenlace, «1» y Escape no hacen nada (sigue `data-fase="desenlace"`) |
| 4 | La IA elige a ciegas. IA contra Yo: la persona responde sin ver el golpe. Yo contra Yo: la segunda elección se hace sin ver la primera | ⚠️ / ❌ | **IA**: `elegirEnLaRueda(papel, rng)` no recibe ni la acción ni el estado. **IA contra Yo**: en cada respuesta (seis en total, con el golpe escondido `romperGuardia`, `fuerte`, `rapido`…) hay 0 `[data-elegido]` en la rueda, y el nombre del golpe no aparece en la barra, el panel (sin el parte), el título ni la URL. `RuedaPendiente` no lleva el golpe. **Yo contra Yo con el ratón: ❌** (H1): el sector que pulsó el primero queda resaltado y con su nota abierta bajo el puntero cuando se abre la respuesta (`capturas/qa-yo-contra-yo-respuesta.png`). Con el teclado no pasa |
| 5 | Se ve el resultado (marcadores con el color de cada bando, arco, medidor con golpe y contraataque, rótulo) y después el lienzo anima el golpe con la cifra | ✅ con reserva | Desenlace a 120, 700 y 1300 ms: la rueda gira, caen los marcadores, se enciende el arco, el medidor marca «máximo» arriba y «contraataque mínimo» abajo, y el rótulo dice «¡Máximo!». El rótulo coincide con el punto en los 11 cruces jugados. **Reserva (H2)**: mientras la rueda gira, el tablero ya enseña la vida final de los dos y quién juega después |
| 6 | El daño cumple la tabla de la petición (rápido contra cada tipo) y la inversión del contraataque, con cifras | ✅ | Piqueros 10 contra 10, semilla 7, sin moral ni suerte. Rápido contra **Rápido 162 ×2 (mínimo)**; Defensivo 173 ×2 y Ofensivo 173 ×2 (bajo); **Normal 189 ×2 (medio)**; Finta 200 ×2 y Romper guardia 200 ×2 (alto); **Fuerte 216 ×2 (máximo)**. El contraataque cae en `4 − p`: contra Rápido, 173@4 ×2; contra Fuerte, 270@0. Normal contra todos: 315@2. Fuerte contra Fuerte: 338@0 (×1,25 sobre 270) y contraataque 360@4. Son las mismas cifras que fijan `test/rueda.test.ts` (216, 216 / 270; 315; 338 / 360) |
| 7 | Los efectos de cada tipo, con la caducidad «hasta su próximo turno», con tests | ✅ | Hay tests en `rueda.test.ts`. Además, 200 semillas × 2, con ejércitos al azar de las 16 criaturas (dragón óseo, paladín y cruzado con `double_attack`, vampiros sin contraataque, tiradores): **0 violaciones** en 1 580 cruces (790 por pasada; 720 con contraataque y 860 sin él), 778 efectos con `hastaSuTurno`, 738 esperas y 78 eventos de moral, sumadas las dos pasadas. Ningún stack conserva un efecto con `hastaElTurno < n` tras cerrar su turno `n` (salvo cuando la batalla ya ha terminado). Nunca hay dos efectos del mismo origen a la vez. Los golpes caen en el punto del cruce y el contraataque en `4 − p`. Hubo 20 cruces de 4 golpes (Rápido con `double_attack`). Ningún disparo lleva punto |
| 8 | El parte escribe el cruce | ✅ | Leído en la página: «Guerrero con escudo → Orko con dos armas, Fuerte contra Rápido: máximo; contraataque mínimo» y «Orko con dos armas → Guerrero con escudo, Rápido contra Ofensivo: bajo; contraataque alto». Cuando el objetivo cae, la línea va sin contraataque: «Defensivo contra Fuerte: alto», y después «Aniquilada…» |
| 9 | «Resolver sola» (todo en IA y `autoResolve`) termina y es determinista por semilla | ✅ | `autoResolve` con paladines contra dragones óseos, semillas 1-40: el registro y el resultado salen idénticos dos veces. Las 200 batallas del punto 7, idénticas dos veces. En el navegador, todo en IA (semilla 4): la rueda se abrió en sus 3 cruces y la pelea acabó en 18,7 s con «Gana el bando derecho…», sin errores en consola |
| 10 | El juego no cambia: `banco` con el mismo hash; el agente no conoce `golpe`/`respuesta`; solo la arena enciende la rueda | ✅ (citado) | `pnpm banco`: `066767b4…af995`, «ancla: igual» (`implementacion.md`, tras simplify). `pnpm qa` sale 0. `grep`: fuera de `battle/rueda.ts`, `ai/rueda.ts` y `client/arena/`, nadie compara `'rueda'`. `src/core/contract` y `src/server` no nombran `golpe` ni `respuesta`. Los guardias de `invariantes.test.ts` se vieron morder (según `implementacion.md`). Nota: el estado que viaja al espectador lleva ahora `modoDelGolpe: 'azar'` (`adaptarBatalla` hace `...estado`); es un campo constante, sin efecto |
| 11 | Visualmente atractivo, a escritorio y a móvil | ✅ con reserva | Ver «Mirada de director de arte». Reservas: H2 y H4 |

## Hallazgos

### Bloqueantes
Ninguno.

### Importantes

**H1. Yo contra Yo: la respuesta deja ver lo que pulsó el primero (criterio 4).**
- Pasos:
  1. `/arena/?seed=2`. Guerrero con escudo a la izquierda y Orko con dos armas a la derecha,
     los dos bandos en «Yo», «Golpe: Rueda», Luchar.
  2. Anda hasta el contacto y pulsa al enemigo.
  3. Elige «Rápido» con el **ratón**.
- Qué pasa: la rueda se repinta en la fase de respuesta con el puntero encima del mismo sitio.
  El sector «Rápido» sale resaltado por `:hover` y abre su nota (`[data-abre-nota]`). Medido dos
  veces: `bajo el ratón: ["rapido"]` y `["fuerte"]`. En
  `capturas/qa-yo-contra-yo-respuesta.png`, «Fuerte» sale iluminado con el bocadillo «Daño
  ×1,25.» mientras dice «Respuesta del bando derecho».
- Qué esperaba quien juega: que la segunda persona no vea la primera elección. Este cliente
  la enseña sin que nadie lo pretenda.
- Con el teclado no pasa. El modo IA contra Yo no se ve afectado.

**H2. Durante el desenlace, el tablero ya enseña el resultado (criterios 5 y 11).**
- Pasos:
  1. `/arena/?seed=1`. Guerrero con escudo («Yo») contra Orko («IA»), con la rueda.
  2. Pulsa al orco y elige Fuerte.
- Qué pasa: a los 120 ms, mientras la cabecera dice «La rueda gira…», el tablero ya muestra la
  vida final:
  - el guerrero pasa de ~50 % (amarilla) a ~14 % (roja), con el contraataque ya restado;
  - el orco pasa de ~88 % a ~57 %;
  - el aro de quien juega ya está en el orco.

  Compara `capturas/qa-vida-adelantada.png` (izquierda, antes de elegir; derecha, a los 120 ms)
  con `qa-desenlace-120ms.png`.
- Causa: `pintarVida` (`render/batalla.ts`) lee la vida del estado vivo. Ya era así al azar, pero
  allí el golpe se anima enseguida. Con la rueda, los 1 900 ms de `DURACION.cruce` van delante
  y el tablero cuenta el desenlace antes que la rueda y antes de la animación del golpe.
- Qué esperaba quien juega: que la rueda revelara el resultado y que el lienzo lo contara
  después, como pide el criterio 5. El panel ya lo oculta («Contando la jugada…»); el tablero no.
- En el móvil apenas se nota: la rueda tapa el tablero entero.

### Menores

**H3. La barra dice «Mueve la IA» cuando te toca responder.**
- En IA contra Yo, con la rueda abierta en la fase de respuesta, la barra de arriba dice
  «Mueve la IA» y el panel «Mueve la IA…» (`capturas/qa-ia-contra-yo-respuesta.png`,
  `rueda-04-respuesta.png`).
- La cabecera de la rueda sí lo dice bien («Respuesta del bando derecho»), pero la barra
  contradice la cabecera.

**H4. La nota de Defensivo en la respuesta promete algo que no da en este golpe.**
- La nota dice «+1 defensa para quien lo usa, hasta que termine su próximo turno».
- Quien responde Defensivo **no** se defiende del golpe que recibe: el efecto se cuelga antes
  de su contraataque, y solo si contraataca. Medido con piqueros: Rápido contra Defensivo da
  173 por golpe, lo mismo que Rápido contra Ofensivo.
- Es coherente con «La regla» y con la suposición de los requisitos, pero quien juega lee
  «+1 defensa» y espera recibir menos.
- La nota de la fase de respuesta debería decir cuándo entra (o el usuario debería confirmar
  la regla).

**H5. Los rótulos y la previsión del tablero.** No es un fallo; lo apunto para el usuario.
- El rótulo sale siempre desde quien pega: en la respuesta, «¡Máximo!» es la peor noticia
  para quien responde.
- La previsión al pasar el ratón por un enemigo sigue siendo la del azar. Ya está dicho en
  `implementacion.md`, «Qué NO queda cubierto».

## Mirada de director de arte (capturas propias y las de `pnpm capturas`)

- **Escritorio**: la rueda queda bien.
  - El aro dorado lleva un aro de color que late con el bando que elige, y los sectores
    alternan dos tonos.
  - Los iconos SVG son legibles a primera vista (rayo, escudo, martillo, balanza).
  - El texto cabe: «Romper guardia» va en dos líneas, sin cortar.
  - En el desenlace, el giro con los nombres girando, el sector teñido del color de cada bando,
    el arco rojo por el lado corto y el medidor de cinco muescas con dos agujas se leen de un
    vistazo.
  - El fondo transparente deja ver a las dos figuras a la izquierda. Ese mismo acierto es lo
    que destapa H2.
- **Móvil (390×844)**:
  - la rueda ocupa el ancho;
  - la cabecera dice «Guerrero con escudo / *ataca a* Orko» sin la flecha suelta;
  - el velo tapa el panel;
  - todo cabe a lo alto (`capturas/qa-movil-golpe.png`);
  - las «ⓘ» de los sectores son pequeñas para el dedo, pero el sector entero abre la nota;
  - la línea de teclas (`1–7`, `Esc`) sobra en un móvil, aunque no estorba.

## Workarounds usados

- **Lancé `npx vite --port 3197 --strictPort` en vez de `pnpm arena`.**
  - `pnpm arena` es `vite --open /arena/`, que abriría un navegador en el escritorio del usuario.
  - Es el mismo servidor y la misma página, y empecé siempre en `/arena/` desde el montaje.
  - No afecta a quien juega.
- **Calculé el píxel del enemigo con una `SesionDeArena` espejo**, como hace `pnpm capturas`
  (`pixelDeUnidad`). Solo sirve para saber dónde pulsar; el clic es real.
  - En Yo contra Yo, el tercer clic cayó en la casilla propia («Ya está ahí.») porque las dos
    figuras se solapaban tras un tramo.
  - Es la puntería de siempre del tablero, no algo de la rueda; me paré en dos cruces.
- **Para que la IA atacara en la semilla 3, pulsé «Terminar turno»**: es el flujo real.

Ninguno esconde un obstáculo que vaya a encontrar quien juega.

## No probado

- **Volver al montaje a mitad de un cruce**: no hay camino.
  - «Otra vez» solo sale al acabar.
  - La rueda es modal: con ella abierta, «Editar» y «Editar equipo» no se pueden pulsar
    (Playwright: el clic se agota en 1,5 s, el editor no se abre y la escena sigue en `battle`).
  - Tab se queda dentro de la rueda.
  - Por código, `volverAlMontaje` cierra la rueda, y `retocar` y otra jugada se rechazan con
    «elige antes en la rueda» (tests de la sesión).
- **Retocar a mitad de cruce desde la interfaz**: inalcanzable por lo mismo. Queda cubierto por
  los tests.
- **`pnpm verify`, `banco`, `qa` y `capturas`**: no los he repetido, porque nada cambió desde el
  último verde citado en `implementacion.md`.
- **Con suerte y moral activas en las cifras de la tabla**: fijé moral y suerte a 0 para que
  las cifras fueran exactas. Las 200 batallas al azar sí las llevan.

## Veredicto

**Hallazgos, sin nada bloqueante.** La regla, las cifras, la inversión, los efectos, el
determinismo, el aislamiento del juego y los tres modos de elegir están bien. Antes de cerrar
hay que corregir dos importantes:
- **H1**: Yo contra Yo deja ver con el ratón la primera elección.
- **H2**: el tablero adelanta la vida final mientras la rueda gira.

Los menores (H3, H4) pueden ir con ellos o al backlog.

---

# Vuelta 2 (13-10-2026, tras la vuelta 1 de correcciones)

Solo se miran los criterios que tocan H1-H4, más una pasada adversarial sobre lo cambiado: la
foto de `SesionDeArena` por golpe, la rueda quieta y la partida.

**Lo que cito sin repetir**
- `pnpm verify` (salida 0, 3105 passed) y la pasada `CAPTURAS_SOLO=rueda-del-golpe pnpm capturas`
  (salida 0) de `implementacion.md`, «Vuelta 1 de QA».
- El último fichero tocado es `src/client/arena/arena.css` (15:36:03). Las capturas `rueda-*.png`
  son de las 15:37:28 y el `verify` es posterior al arreglo del óvalo. Desde entonces no ha
  cambiado nada en `src/`, `test/`, `data/` ni `tools/`.

**Lo que he corrido yo**
- **Un oráculo de núcleo**, en `tsx`: 120 batallas con todo en IA y la rueda, ejércitos al azar de
  18 criaturas del catálogo y semillas 1-120.
- **Playwright sin pantalla**, contra un vite propio en el puerto 3197.
  - Lo arranqué con `set -m` y lo maté por su grupo.
  - Comprobé el cwd del proceso antes de matarlo y el puerto quedó libre.
- **`CAPTURAS_SOLO=perdida pnpm capturas`** (26,5 s, salida 0), para ver la partida. Su vite
  (34943) quedó libre.
- Las capturas propias van en `capturas/qa2-*.png`.

## Criterios afectados

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 4 | Yo contra Yo: la segunda elección se hace sin ver la primera | ❌ (más estrecho que en la vuelta 1) | Solo con el **ratón** queda arreglado. Fuerte pulsado sin mover el ratón: la respuesta sale con `hover=true encendido=false nota=false quieta=true`, y lo mismo mide la pasada de `capturas`. Pero **cualquier tecla** despierta la rueda, y con el puntero aún encima Fuerte se enciende y abre su nota. Medido: `ArrowRight` → `hover=true encendido=true nota=true quieta=false` (el foco cae en Rápido); `Tab`, igual; `Shift`, igual (el foco sigue en el diálogo). Ver `capturas/qa2-respuesta-tras-ArrowRight.png`. → **H1b** |
| 4 (móvil) | Lo mismo con el dedo, a 390×844 | ✅ (emulado) | Contexto con `isMobile` y `hasTouch`; el golpe se elige con `touchscreen.tap` sobre Fuerte. La respuesta sale con `hover=false`, Fuerte del mismo tono que Defensivo y Ofensivo, y su nota cerrada (`capturas/qa2-tactil-respuesta.png`). Con el dedo puesto en Rápido sin soltar (CDP `touchStart`), Fuerte sigue apagado. Al soltar se elige Rápido y se pasa al desenlace. Reserva: en Chromium emulado el `:hover` no se queda pegado tras el toque, y en un Android de verdad puede comportarse de otra forma |
| 5 / 11 (H2) | Mientras gira la rueda, el tablero enseña la vida y el turno de antes del golpe | ✅ en Yo contra IA, IA contra Yo y Yo contra Yo · ⚠️ con todo en IA (H6) | **Oráculo** independiente (vida completa menos la suma de los `damage` de `attack`/`shoot` anteriores), sobre 536 cruces: **0 fallos**. Entre ellos hay 145 cruces seguidos (a ≤ 4 hechos del anterior), 175 con una baja en el intercambio, 4 con 3 o más golpes (Rápido con `double_attack`), 58 con el dragón óseo (dos casillas), 4 con moral que da otro turno y 264 con contraataque. El oráculo cuadra también con la vida final en las 120 batallas. Ningún objetivo sale muerto en su foto, el aro siempre es de quien pega y `tableroDelCruce` no lanzó nunca. En el navegador (s4, todo en IA) la barra de cada cruce es la de antes: orco 51, 41 y 33 px; guerrero 51, 30 y 5 px. Pero fuera de la rueda el tablero enseña el final de la pelea → **H6**. Y la casilla resaltada del activo es la de después → **H8** |
| (H3) | La barra no dice «Mueve la IA» cuando te toca responder | ✅ | En `rueda-04-respuesta.png` (IA contra Yo), arriba dice «Te toca responder» y el panel «Te toca responder en la rueda.». En mi Yo contra Yo (s1), lo mismo |
| (H4) | Las notas de la respuesta dicen cuándo actúa cada efecto | ✅ con reserva (H7) | Leídas en la página y en el marcado. Defensivo: «No para este golpe: +1 defensa desde tu contraataque hasta que termine tu próximo turno.» Fuerte, Rápido, Ofensivo, Romper guardia y Finta empiezan por «No cambia este golpe: …». En el golpe, Defensivo «cubre el contraataque de ahora», y Romper guardia y Finta «no tocan este golpe ni su contraataque». Lo he comprobado contra `melee`/`intercambio` (`battle.ts`): los golpes del atacante van todos antes del contraataque, así que Defensivo en la respuesta no cubre ni el segundo golpe de Rápido. La nota acierta |
| 10 | La partida no cambia | ✅ | `tableroQueSeVe` devuelve el estado tal cual sin un cruce en curso, y la partida nunca escribe un `cruce`. En la pasada `perdida` de `capturas` (partida, semilla 27) la batalla se pinta, anima y se resuelve: «sin errores en consola», salida 0 (`desktop-13`, mirada: barras y aro como siempre). `anim.ts` no se tocó en la vuelta 1 y `anim.test.ts` va en el `verify` citado |

## Hallazgos de la vuelta 2

### Importantes

**H1b. Yo contra Yo: una tecla despierta la rueda y enseña lo que pulsó el primero con el ratón
(criterio 4, aún ❌).**
- Pasos:
  1. `/arena/?seed=1&golpe=rueda`. Guerrero con escudo a la izquierda y Orko con dos armas a la
     derecha, los dos bandos «Yo», Luchar.
  2. Anda hasta el contacto (tramo y «Terminar turno») y, en el turno del orco, pulsa al guerrero.
  3. Con el ratón, pasa por «Fuerte» y púlsalo **sin moverlo después**.
  4. Responde el otro jugador con el teclado: `→` (o `Tab`, o incluso `Shift`).
- Qué pasa: al pulsar la tecla, la rueda se despierta (`keydown` → `despertarLaRueda`,
  `arena/main.ts` ~2259). El `:hover` vuelve a valer bajo el puntero quieto: Fuerte se enciende
  en el disco y abre su bocadillo («No cambia este golpe: tu contraataque hace daño ×1,25.»),
  al lado de Rápido, que tiene el foco (`capturas/qa2-respuesta-tras-ArrowRight.png`).
- Qué esperaba quien juega: que quien navega con el teclado no vea la elección del otro.
- `implementacion.md` lo apunta más estrecho de lo que es («si la nota de un sector tiene a la
  vez el ratón encima y el foco»). Basta el ratón encima, y vale cualquier tecla.
- El despertar por teclado no aporta nada: el foco del teclado ya enciende por `:focus-visible`,
  que no depende de `data-quieta`.

**H6. Con todo en IA, fuera de la rueda el tablero enseña cómo acaba la pelea entera; con la foto,
las barras suben y bajan en cada cruce.**
- Pasos:
  1. `/arena/?seed=4&golpe=rueda`. Guerrero con escudo a la izquierda y Orko a la derecha, los
     dos en IA, Luchar.
  2. Mira las barras (`capturas/qa2-ia-rueda-tira.png`, cuatro momentos de arriba abajo:
     cruce 1, tras él, cruce 2, tras él).
- Qué pasa:
  - **Guerrero**: su barra está **vacía** desde el primer fotograma, porque muere al final. En
    el cruce 1 sale llena (51 px), luego vuelve a vacía. En el cruce 2 marca 30 px y luego vacía.
    En el cruce 3, 5 px.
  - **Orco**: 33 px (su vida final) → 51 durante el cruce 1 → 33 → 41 durante el cruce 2 → 33.
- Al azar (misma semilla, mismo montaje) también se ve el final desde el principio: guerrero
  vacío y orco a 35 px todo el rato. Es anterior a esta tarea, pero allí al menos no se mueve.
  Con la rueda, el tablero cuenta el desenlace antes que la rueda, que es justo lo que H2 quería
  evitar, y además salta arriba y abajo.
- La causa: la sesión juega la pelea entera de una vez (`avanzarIA`), y fuera del paso `cruce`
  `dibujar` lee el estado vivo, que con todo en IA es el final. `implementacion.md` lo da por
  «como al azar», pero en este modo «después del cruce» es el final de la batalla, no el de ese
  golpe.
- Qué esperaba quien mira: que la barra baje golpe a golpe, como la cuentan la rueda y la
  animación.

### Menores

**H7. La nota de la respuesta sin contraataque se contradice.**
- Contra un vampiro (`no_retaliation`) la nota de Rápido dice: «No cambia este golpe:
  contraatacas con 2 golpes de daño ×0,6 cada uno. Esta vez no devuelve el golpe: solo cuenta para
  el cruce.» Promete un contraataque y en la misma frase lo retira. Las otras seis siguen el
  mismo patrón.
- Además, «No cambia este golpe» puede leerse como «tu elección no cambia el golpe que recibes»,
  cuando el cruce sí lo cambia. El pie de la rueda lo explica bien («si lo aciertas recibes el
  mínimo»), pero las dos frases tiran en sentidos distintos.
- Sugerencia: «Su efecto no toca este golpe…».

**H8. Mientras gira la rueda, la casilla resaltada del activo es la de después.**
- `tableroDelCruce` devuelve el turno de antes, pero las casillas del estado vivo. `drawBatalla`
  resalta la casilla del activo con `stackHexes` del estado (`render/batalla.ts:182-190`), no con
  la figura del animador.
- En `rueda-03-desenlace-golpe.png` hay dos marcas: el aro bajo los pies del guerrero y una
  casilla amarilla vacía, donde acabará tras andar.
- En `rueda-05-desenlace-respuesta.png` y `qa2-ia-rueda-036.png`, la casilla amarilla está junto
  al guerrero mientras el orco que pega sigue lejos, bajo la rueda.
- Con todo en IA, esa casilla es la del final de la pelea (H6).
- No engaña mucho (suele ser la casilla de al lado del objetivo), pero «las casillas no hacen
  falta» no es del todo cierto.

## Workarounds de la vuelta 2

- **Un arnés en el scratchpad**: copia de `tools/qa/capturas.ts` hasta su `main`, con los imports a
  rutas absolutas, más mis pruebas. Reutiliza `pixelDeUnidad`, el espejo y `vidaPintada`, que
  sirven para apuntar y medir; los clics y las teclas son reales. No toca el repo.
- **`npx vite --port 3197`** en vez de `pnpm arena`: así no abre un navegador en el escritorio.
- **El toque sostenido sale de CDP** (`Input.dispatchTouchEvent`): Playwright no tiene un
  «dedo puesto sin soltar». Solo sirve para mirar el estado intermedio; el resultado al soltar es
  el flujo real.
- **Las barras se miden leyendo los píxeles del lienzo**, por sus colores (`pintarVida`). Las
  capturas lo confirman a ojo.

Ninguno esconde un obstáculo que vaya a encontrar quien juega.

## No probado

- **El `:hover` pegado de un Android o iOS de verdad**: solo lo he probado en Chromium emulado.
- **`retocar` entre dos cruces de una pelea toda en IA**: la pelea ya está terminada en el
  estado, así que no hay camino.
- **Las 7 notas con el ratón una a una en la página**: las leí del marcado que pinta
  `renderEleccion`, con contraataque y sin él.
- **`pnpm verify`, `pnpm banco` y `pnpm qa`**: no los he repetido.
  - `verify` va citado.
  - `banco` y `qa` no hacen falta: la vuelta 1 no toca el núcleo que juega ni `src/server/`.

## Veredicto (vuelta 2)

**No apto.**
- H2, H3 y H4 están corregidos.
- La foto por golpe es exacta en 536 cruces adversariales.
- La partida sigue igual.
- **Lo que lo impide**: el criterio 4 sigue fallando en un camino natural (H1b): quien pega usa
  el ratón y quien responde, el teclado. Es un arreglo pequeño: que la tecla no despierte el
  `:hover`.
- **H6 también conviene cerrarlo**, o al menos decidirlo con el usuario: con todo en IA, el
  tablero cuenta quién muere antes que la rueda.
- H7 y H8 son menores.

# Vuelta 3 (13-10-2026, tras la vuelta 2 de correcciones)

Solo H1b, H6 (ahora en el animador compartido), H7 y H8, más una pasada adversarial sobre el
animador nuevo (`src/client/anim.ts`).

**Lo que cito sin repetir**
- `pnpm capturas` completo (salida 0, 489,8 s) y `pnpm banco` (mismo hash) de `implementacion.md`,
  «Vuelta 2 de QA». El último fichero de código tocado es de las 16:21:09 (`anim.ts` y
  `capturas.ts`, las dos restauraciones tras ver morder las comprobaciones). La pasada terminó a las
  16:30 (`rueda-08-todo-ia.png`, 16:29:58), así que corrió sobre el código de ahora. Incluye la
  partida (`perdida`, s27), el espectador y las comprobaciones nuevas de `rueda-del-golpe`.

**Lo que he corrido yo**
- `pnpm verify`: salida 0, `124 passed | 1 skipped`, `3110 passed | 14 skipped`, 51 s de pared
  con la máquina compartida.
- **Un oráculo del animador** (`tsx`, en el scratchpad). Lleva el `BattleAnimator` real fotograma
  a fotograma y lo compara con una cuenta independiente sacada del registro: la vida de salida, más
  `trasElGolpe` por cada `attack`/`shoot`/`cast` y `+cura` por cada `power`.
  - Modo arena: 150 peleas con todo en IA, de rueda o al azar.
    - Ejércitos al azar de 18 criaturas: liche y gran liche, señor vampiro, dragón óseo y momias,
      entre otras.
    - El monje templario con «Curar (X)» y héroes con todo el libro.
  - Modo partida: 60 batallas de `createBattle` con las reglas del juego, mirando tras cada jugada
    (686 jugadas).
  - Comprobaciones:
    - la vida al empezar es la de salida;
    - la serie de valores distintos de cada barra es exactamente la del registro, en su orden;
    - ninguna barra cambia mientras gira una rueda;
    - en cada cruce, el aro es de quien pega y su casilla es la de antes de andar;
    - con la cola vacía, la vida es la del estado, el aro es el del turno y la casilla, la del
      estado;
    - en modo partida, nada cambia nada más leer una jugada, antes de su impacto.
  - Visto morder con el animador parcheado en memoria:
    - `pv` del estado → 46 fallos;
    - `activo` del estado → 13;
    - `casilla` del estado → 13.
- **Playwright sin pantalla**, con una copia del arnés de `capturas.ts` en el scratchpad:
  - su propio vite (`--port <libre> --strictPort`, sin `--open`, grupo propio y matado por grupo);
  - puertos 40163 y 39495, comprobados libres después, y ningún node de este worktree escuchando.

## Criterios afectados

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| H1b | Yo contra Yo: una tecla no despierta la rueda ni enseña lo que pulsó el primero | ✅ | En la pasada citada, →, Tab y Shift con el ratón quieto sobre Fuerte: nada (`rueda-07-yo-contra-yo-teclado.png`). Lo amplié a `Escape`, `Enter`, `Espacio`, `a`, `PageDown`, `Control`, `Alt`, `Tab` ×2, `Shift+Tab`, `←` y **la rueda del ratón**. En todos los casos la rueda sigue `quieta=true`, abierta y en la fase `respuesta`, y Fuerte no se enciende: ni el sector, ni la nota, ni el botón. El foco enciende lo suyo (Rápido, la nota de Normal tras `←`). Captura: `capturas/qa3-teclas-rueda-del-raton.png`. Moverse de verdad sí la despierta (pasada citada) |
| H6 | La barra baja golpe a golpe en su impacto, con todo en IA y en la partida; al final cuadra con el estado | ✅ | **Oráculo**: 210 batallas y 1 294 cambios de barra vistos, **0 fallos**. Por la cuenta del registro: 49 peleas con salpicadura del liche (cada salpicado es su propio `shoot`), 164 con hechizo de daño, 15 con drenaje, 4 con cura de poder y 441 caídas (`perished`). Con fotogramas tardíos (16, 250, 700 y 3 000 ms), la serie vista es parte de la del registro y acaba igual: 0 fallos. **Navegador**, arena con todo en IA (s1 de mi montaje: Maga, Liche, Monje y Espadachín contra Señor vampiro, Piquero y Arquero): medí cada barra en su casilla en cada `requestAnimationFrame` durante 17 s. El orden de los cambios es el del registro: el vampiro cae con la Flecha mágica; el Arquero, 51→17 px en el impacto del disparo, y 0 al final; el Liche, 51→49 en el tiro del Arquero; y luego el Piquero. Ninguno sale con su final desde el principio. Al acabar, cada barra mide lo del estado (±0,4 px) y no hay errores en consola. La **partida** y el **espectador**, en la pasada citada (`perdida` y `espectador`, verdes con el animador cambiado) |
| H6 (foto) | La foto de `SesionDeArena` ya no existe | ✅ | `tableroDelCruce`, `antesDelCruce`, `FotoDelTablero` y `fotoDelTablero` no están en `src/`. `dibujar` pinta `s.battle` |
| H7 | Notas de la respuesta: sin contraataque no prometen uno; «No cambia este golpe» ya no confunde | ✅ | Leídas del marcado de `renderEleccion`. **Sin contraataque** (contra un vampiro), las 7 etiquetas dicen solo «Esta vez no devuelves el golpe, así que su efecto no actúa: tu respuesta solo cuenta para el cruce, que decide cuánto te duele el golpe». Normal añade «y con Normal cae en el medio». Ninguna dice «contraatacas». **Con contraataque**, todas empiezan por «Su efecto no toca el golpe que recibes (ese lo decide el cruce): …» |
| H8 | La casilla resaltada del activo sigue a la figura durante la rueda | ✅ | El oráculo comprueba la casilla en 210 cruces: es la de antes de andar, con 0 fallos, y muerde con 13. En `rueda-03-desenlace-golpe.png`, el aro y la casilla amarilla están los dos bajo el Guerrero que pega. En `rueda-05-…`, la casilla junto al Guerrero ya no se ve |

## Hallazgos de la vuelta 3

### Menores

**H9. En el golpe sin contraataque, Defensivo sigue prometiendo que «cubre el contraataque de
ahora».** Es la misma clase que H7, en la otra cara.
- Pasos:
  1. Abre `/arena/?seed=1&golpe=rueda`.
  2. Pon un Vampiro (Yo) a la izquierda y un Piquero (IA) a la derecha, y pulsa Luchar.
  3. Vuela hasta el piquero y atácalo.
  4. En la rueda del golpe, lee la nota de Defensivo.
- Qué dice: «+1 defensa desde ya: cubre el contraataque de ahora y dura hasta que termine tu
  próximo turno.» Finta y Romper guardia dicen «(no toca este golpe ni su contraataque)».
- El vampiro no recibe contraataque (`no_retaliation`), y pasa lo mismo con un objetivo que ya
  devolvió el golpe esta ronda.
- La causa: `previsionDeLaRueda` solo calcula `sinContraataque` en la fase `respuesta`, y
  `efectoDeGolpe` no mira el contraataque en la fase `golpe`.
- Qué esperaba quien juega: que no se prometa un contraataque que no va a llegar.
- No engaña sobre el daño. La guía del pie tampoco dice que no habrá respuesta.

### Reservas que ya declara `implementacion.md` (no las cuento como hallazgos)

- **`↑N` (tiros que quedan) y el panel de la derecha leen el estado**
  (`render/batalla.ts:1710-1715`). Con todo en IA, el `↑` del liche enseña desde el primer
  fotograma los tiros que le quedarán al final. Mientras se cuenta, el panel dice «Contando la
  jugada…» (visto), así que no adelanta vidas.
- **El drenaje y la cura del hechizo del héroe** se ven con el último impacto de esa unidad. El
  oráculo excluye esas unidades de la serie exacta, pero en ellas la vida final también cuadra con
  el estado.
- **Mientras anda, no se resalta ninguna casilla.** Es razonable.

## Workarounds de la vuelta 3

- **El oráculo parchea `figura`/`activo` en memoria** solo para verlo morder. Las cifras de arriba
  son sin parche.
- **El arnés de Playwright es una copia de `capturas.ts`** con imports absolutos, como en la
  vuelta 2. Los clics y las teclas son reales.
  - La pelea pesada se abre con `?montaje=` (`montajeALaURL`), que es la puerta de quien pega un
    enlace.
  - El H1b se monta con clics en el montaje.
- **Las barras se leen por sus colores en el lienzo**, como `vidaPintada`.
  - Una figura que pasa por encima de una barra mete ruido de unos fotogramas (p. ej. defender-1:
    43 px en un fotograma suelto).
  - Una figura que se va de su casilla mide 0 aunque viva. Así es como se lee el Monje 51→0 cuando
    echa a andar.
  - Por eso la serie se juzga por el orden de los saltos con el registro, no por un valor suelto.

Ninguno esconde un obstáculo de quien juega.

## No probado

- **La cura del hechizo del héroe por la IA**: en 210 batallas la IA no lanzó Curar ni una vez. El
  camino es el mismo que el del drenaje, que sí está probado.
- **Batallas con muralla (`climbed`)** en el oráculo. No hay `data/borradores/murallas.json` en el
  worktree. El animador trata `climbed` como un tramo con su `casilla`, y lo cubre `verify`
  (`muralla-alta`).
- **La partida y el espectador en el navegador, por mi cuenta**: los cito de la pasada completa de
  `capturas`. El modo partida del oráculo cubre la lógica jugada a jugada.
- **Un Android o iOS de verdad**, como en la vuelta 2.

## Veredicto (vuelta 3)

**Apto.**
- H1b, H6, H7 y H8 están corregidos:
  - H6 y H8, de fondo y sin un fallo en 210 batallas adversariales (salpicadura, hechizos de daño,
    curas de poder, drenaje, caídas y fotogramas tardíos);
  - H1b, con doce teclas más y la rueda del ratón;
  - H7, con las notas que dicen solo lo que vale.
- `verify` sale en verde y la pasada completa de `capturas` es posterior al último cambio.
- Queda **H9** (menor, la nota de Defensivo en el golpe sin contraataque). No bloquea: se puede
  arreglar aparte, en `efectoDeGolpe`, con el mismo `contraataca` en la fase `golpe`.

## Después de la vuelta 3 (coordinador, 13-10-2026)

H9 se corrige:
- `previsionDeLaRueda` da `sinContraataque` también en la fase de golpe.
- `efectoDeGolpe('…', 'golpe', false)` ya no promete cubrir el contraataque ni dice «no toca su
  contraataque».
- Está cubierto con un test en `test/rueda.test.ts`.

`pnpm verify`: 3111 pasados y 14 saltados.
