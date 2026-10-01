# QA — el cliente nuevo sobre el núcleo de verdad

Validado contra `requisitos.md` (petición literal, criterios 1-7 y decisiones del
usuario), sobre el diff **sin commitear** del 01-10-2026. No he tocado código.

Herramientas: `pnpm verify`, `pnpm banco`, `pnpm qa`, `pnpm build`,
`pnpm capturas` (a `qa/capturas-guion/`) y **ocho guiones de Playwright propios**
en el scratchpad, que clican con ratón y dedo reales sobre un vite mío (puerto
3177, grupo propio, matado por grupo y comprobado: «3177 libre»). Siguen la
técnica del espejo de `capturas.ts`: una `Session` con la misma semilla a la que
se aplican los mismos gestos. Después de cada paso se compara el día y el oro.
Todas las capturas mías están en `qa/`.

## Comandos (salida real)

```
$ pnpm verify      real 0m9,080s · Checked 110 files … Found 1 info (el de notas.ts, de antes)
                   Test Files 25 passed (25) · Tests 532 passed (532)
$ pnpm banco       sha256: 54a035f0ae024a8e24b64de211a02b1ede41c967aeb2c574de450822dfb2bd43
                   sin terminar 0/200 · ancla: igual
$ pnpm qa          real 0m2,949s · 1 mapa diseñado, 3 turnos de mapa y 29 decisiones de batalla
                   consultas: battle_state, building_list, creature_stats, game_state, map, spell_list
$ pnpm build       ✓ built in 412ms · dist/index.html y dist/espectador/index.html presentes
                   (dist/rpg y dist/characters copiados por publicDir)
$ pnpm capturas qa/capturas-guion   41,2 s · «sin errores en consola»
```

`test/invariantes.test.ts` no está modificado (`git status`): no hay excepciones
nuevas. Las búsquedas de `Math.random`, `innerHTML` y `/home/al` en
`src tools/qa test` solo encuentran comentarios, la puerta `pintar` y los tests
de `html.ts`.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1a | Superficie continua sin cuadrícula; atlas para castillos, minas, cofres, monstruos y vegetación | ✅ | `capturas-guion/desktop-01`, `ganar-121-final.png` |
| 1b | Niebla negra en lo desconocido y tenue en lo explorado | ✅ | `ganar-121-final.png` (diagonal explorada), `espectador-5-fin.png` |
| 1c | Zoom (rueda, botones y teclado), arrastre, centrar y minimapa | ✅ | 25 pasos de rueda hacia dentro y 50 hacia fuera: tope respetado (`mapa-zoom-maximo/minimo`). Arrastre más allá del borde: acotado (`mapa-arrastre-mas-alla-del-borde`). Pulsar el minimapa lleva la vista (`mapa-minimapa-esquina`). Ninguno se desincroniza ni da error. |
| 1d | Varios héroes por jugador y héroes rivales | ✅ | Contratado un segundo héroe: dos en el mapa y en el panel; se selecciona desde el panel (`mapa-segundo-heroe-seleccionado.png`). El rival se ve con aro azul (`mapa-ver-todo-rival.png`, `desktop-12`). |
| 1e | Clic fija el destino, se ve la ruta (dorado hoy, gris otro día) y los puntos de movimiento | ✅ escritorio / ❌ **táctil** | Escritorio: `capturas-guion/desktop-02` y la barra «hoy llegas a 7 de 8 pasos». En pantalla táctil la ruta **no se dibuja** (hallazgo 1). |
| 2a | Tablero a 25°, hexes proyectados y unidades por profundidad | ✅ | `desktop-07`, `batalla-semilla-6/28.png` |
| 2b | Casillas alcanzables, atacables y unidad activa marcadas | ✅ | Hexes verdes, rojos bajo los enemigos a tiro y aro amarillo con chapa de nombre (`ganar-121-batalla-d3.png`) |
| 2c | Acciones de `session.ts`: disparo, espera, defensa, hechizo y automático | ✅ | Batalla de la semilla 2 **ganada solo con clics**: 31 jugadas (movimiento, disparo, ataque, espera y defensa), redimensionando a 1000×700 en mitad. El espejo coincide en todas. Pantalla «Victoria / Continuar» (`batalla-terminada-a-clics.png`). Hechizo en `desktop-06`; automático en `ganar-121`. |
| 2d | Atlas → Y Bot teñido → marcador de color sin PNG | ✅ | Nara, Liora y Doran con atlas; esqueletos, zombis, momias y campesinos en Y Bot teñido por bando; marcadores en `capturas-guion/sin-arte-02` |
| 2e | Hasta 27 individuos por bando | ⚠️ | No probado: el mayor grupo que encuentro cerca del inicio en 200 semillas es de 14. Ver hallazgo 2 sobre la densidad. |
| 3 | Construir y reclutar respetando el liderazgo; ocupa/cabe; «Todo» = lo que cabe | ✅ | «Todo (2)» con 12 disponibles. Con el cupo lleno, «Todo» y «+1» dicen «no cabe: el ejército ocupa 20 de 20 de liderazgo y 1 × Campesino pide 2», y al pasar el ratón: «cada uno ocupa 2; el ejército lleva 20 de 20 y caben 0». Una segunda construcción el mismo día da «ya se ha construido hoy en este pueblo». Escape cierra el castillo. (`castillo-cupo-lleno.png`, `castillo-tras-construir.png`) |
| 4a | Héroe con `troopSummary` y liderazgo ocupado/total | ✅ | «Tropa · 7 individuos», «Liderazgo 16 / 20» con barra |
| 4b | Recursos y día | ✅ | Barra superior; el guion y mis espejos la comparan en cada paso |
| 4c | Crónica | ✅ | `desktop-12`, `movil-fin-de-partida-abajo` |
| 4d | Fin de partida con las cuatro respuestas de `desenlace.ts` | ✅ ganada, perdida y «sin bando» / ⚠️ empate | **Partida ganada jugando**: semilla 121, día 3 (receta abajo, `ganar-121-final.png`). Perdida: semilla 2, día 3. El espectador ve la respuesta de quien no tiene bando: «Fin de la partida · Gana el jugador 0». El empate (agotar `maxDays`) solo está en el ancla de paneles; no lo he visto jugando. |
| 5 | Contratos: `session.ts`, `html.ts`, sin `Math.random`, sin rutas absolutas, invariantes sin excepciones nuevas y `?seed=N` | ✅ | verify verde. `?seed=42` fija la semilla; `?seed=` y la URL vacía sortean y la reescriben; `?seed=abc` y `?seed=-1` escriben el motivo y la salida (lanzar es lo diseñado). «Partida nueva» sortea y reescribe la URL (`partida-nueva.png`). |
| 6 | El espectador funciona | ✅ | Partida **entera** de agente (semilla 5, política de `pnpm qa`): 3 turnos de aventura y 42 de batalla hasta `game_over`, con la batalla animada y el mapa final. 0 errores. (`espectador-5-*.png`, `capturas-guion/espectador-*`) |
| 7 | Se juega entero: mover, recoger, construir, reclutar, batallas ganadas y perdidas, pasar días y fin; consola limpia; móvil 390×844 jugable | ✅ con reservas | Todo recorrido. **0 errores y 0 avisos de consola** en todas las pasadas, salvo la excepción a propósito de `?seed=abc`. En el móvil se juega (batalla a toques, castillo y fin), pero sin ruta visible al tocar (hallazgo 1). |
| D1 | Lo que no tiene arte usa la base Y Bot | ✅ | Ninguna figura de perfil antigua; las que no tienen atlas salen en Y Bot teñido |
| D2 | El héroe a pie con aro del color del dueño | ✅ | Aro rojo propio y azul rival; el caballo no aparece |
| D3 | La ruta llega hasta donde dé hoy y se ve entera | ✅ escritorio | Al pulsar se anda hasta la parada de hoy (repetido en el espejo); el resto, en gris |
| D4 | Móvil con scroll horizontal en el tablero | ✅ | Tablero de 860 px en un marco de 364 (`movil-batalla-inicio-tactil.png`); un toque sobre un hex lo anda |

### Pasada adversarial (lo que aguantó)

- **Clics durante la animación.** Recién pulsado un movimiento, lo pulsé todo:
  «Resolver sola», «Defender» y un clic en el lienzo. Las tres veces sale
  «Espera a que termine la jugada.» y no se aplica nada. Un segundo «Resolver
  sola» ya no existe.
- **Hechizo.** Elegido, un clic en el cielo da «Elige una unidad… o pulsa Escape»,
  y Escape lo suelta.
- **Redimensionar.** A 1000×700 en mitad de una batalla, a 800×600 en el mapa y
  a 1100×700 en el castillo. Los clics siguen cayendo donde el espejo espera.
- **Cambiar de escena en batalla.** No hay forma desde la interfaz: las
  herramientas del mapa y el minimapa se ocultan, y Espacio y +/− solo actúan en
  el mapa.
- **Un solo Espacio con «Fin de turno» enfocado** pasa un día, no dos: el
  `preventDefault` evita el doble disparo.

## Hallazgos

### Bloqueantes

Ninguno.

### Importantes

**1. En pantalla táctil la ruta no se dibuja nunca.** Rompe el criterio 1 en
móvil: «la ruta se ve».

- Reproducción: un contexto de 390×844 con `hasTouch`, `?seed=2`, y un toque en
  la casilla (6,6).
- La barra dice «Ruta: llegas hoy (2 pasos). · Toca otra vez para ir.», pero en
  el mapa no hay ni puntos ni marca de destino.
- Con ratón, en el mismo tamaño, sí aparecen (`qa/movil-toque-sin-ruta.png`
  frente a `qa/movil-raton-con-ruta.png`).
- Causa observada: los eventos del lienzo tras un toque son
  `pointerdown:touch`, `pointerup:touch` y **`pointerleave:touch`**. El
  `pointerleave` de `main.ts` llama a `aventura.salir()`, que vacía `this.ruta`
  justo después de que `soltar()` la haya calculado.
- El segundo toque sí anda, porque `salir()` no borra `tocada`.
- Lo que espera quien juega: ver el camino antes de confirmarlo con el segundo
  toque, que es para lo que existe ese primer toque.

**2. La batalla se lee mal en cuanto hay más de unos pocos individuos.** Es un
juicio de legibilidad, no estético.

- El tablero ocupa solo la franja inferior del lienzo, menos de la mitad del
  alto. Encima queda un hueco negro: `campo.webp` tiene el cielo transparente,
  el 31,9 % de sus píxeles, igual que el `clearing.png` original.
- Con 9–14 por bando, las chapas («Cam», «Esq», «Mom») y las barras de vida se
  amontonan unas sobre otras (`capturas-guion/desktop-07`,
  `batalla-semilla-28.png`).
- A 1000×700 son ilegibles (`qa/batalla-redimensionada-1000x700.png`).
- Los 27 por bando que permite el núcleo no los he podido ver, y serían peores.
- Lo que espera quien juega: distinguir cada unidad y su vida sin pasar el ratón
  por encima.

### Menores

**3. El aviso de espera no se borra.** «Espera a que termine la jugada.» sigue en
la barra 3 s después de acabar la cola, hasta el siguiente gesto
(`puerta.mts`: «tras la cola … | Espera a que termine la jugada.»).

**4. Una figura enemiga puede tapar un hex al que quieres moverte.** El clic
busca primero la figura, así que en un hex cuyo centro tapa un enemigo, pulsar
ataca o da «No alcanzas a esa unidad este turno» en vez de mover.

- Medido sobre 5 batallas jugadas con la IA en el lienzo de escritorio: **29 de
  1011** destinos alcanzables (2,9 %).
- Ejemplo: semilla 2, ronda 3, hex (5,4) tapado por `defender-13`.
- Se puede mover pulsando la parte baja del hex.

**5. Dos tropas con el mismo atlas solo se distinguen por el aro.** En la
semilla 6, tus arqueros y los arqueros enemigos son la misma Nara, y lo único
que dice el bando es el aro y la barra (`batalla-semilla-6.png`). Lo apunto para
el juicio del usuario.

**6. Las herramientas del mapa tapan el final de la ruta.** «− · Centrar héroe ·
+» se pintan encima del lienzo y pueden ocultar el destino gris de una ruta
(`capturas-guion/desktop-02`: el último punto cae bajo los botones).

**7. Batalla en el móvil.**
- Arranca desplazada a 0, con el enemigo entero fuera de la vista y nada que
  diga que el tablero sigue a la derecha.
- La barra fija de abajo tapa la fila de hechizos hasta que se desplaza la
  página (`capturas-guion/movil-03`).
- La lista «En el campo» son 23 filas en una columna.

**8. Fichas de coste del castillo.** La última cifra se sale de la chapa: «2000»,
«3000» y «5000» en las moradas 4–6. El código de las chapas no está en el diff,
así que probablemente viene de antes.

**9. Mensaje confuso al pulsar donde ya está el héroe.** Pulsar otra vez la
casilla del propio héroe seleccionado dice «No hay camino hasta ahí.». Viene de
`session.moveHeroTo`, que no ha cambiado.

**10. Dos Espacios seguidos pasan dos días.** El turno del rival se resuelve
antes de la segunda pulsación. Es coherente con «Espacio pasa el turno», pero no
hay confirmación.

## Receta para ganar en el navegador (semilla 121)

1. `?seed=121`.
2. Pulsa «Valdeluz» en el panel y luego «Todo» en el campesino (10 a la
   guarnición). Vuelve al mapa.
3. Pulsa tu castillo, que está en (3,3), y sal.
4. Cada día, pulsa el paso más lejano de hoy hacia (20,20) y pasa el turno.
5. El día 3 llegas a Cripta Gris; «Resolver sola» da «¡Victoria!» y «Partida
   ganada» (`ganar-121-*.png`).

Lo reproducen el espejo (`sim.mts`) y la página.

## Workarounds usados

- **Vite directo en el 3177** en lugar de `pnpm dev` (3100). Es la misma orden
  con otro puerto, para no chocar con nadie. No afecta a quien juega.
- **Coordenadas desde el espejo.** Los clics se calculan con las funciones puras
  del cliente (`camara-mapa`, `proyeccion`, `town`), como en `capturas.ts`.
  Quien juega ve dónde pulsa, así que no afecta.
- **Esperas por la duración de la cola** (`DURACION`) entre jugadas de batalla.
  Mi primera versión esperaba un tiempo fijo, pulsaba con la cola en marcha y el
  espejo se separaba. Era un fallo del guion: la página hacía bien en rechazar
  esos clics.
- **El arrastre con el dedo** se ha hecho con `Input.dispatchTouchEvent` del CDP,
  porque Playwright no tiene gesto de arrastre táctil. El mapa se desplaza sin
  mover al héroe (`movil-arrastre-dedo.png`).

## No probado

- 27 individuos por bando: no los he alcanzado jugando.
- El desenlace «empate» en el navegador: hace falta agotar `maxDays`; solo está
  cubierto por el ancla de paneles.
- Toques reales en un dispositivo: lo táctil es emulación de Chromium.
- El rendimiento con GPU: todo lo de aquí es Chromium sin cabeza.
- La defensa de la persona contra el rival: el núcleo la resuelve en el turno de
  la IA y no se juega por clics.

## Veredicto

**Apto con reservas.**

El cliente nuevo cubre lo que se pidió y se juega entero en escritorio, ganando
y perdiendo, sin un error de consola. Verify, banco, qa y build siguen como
estaban, y el espectador aguanta una partida completa.

Las reservas son dos, y ninguna rompe una regla del juego:

- **El hallazgo 1** incumple de verdad el criterio 1 en pantalla táctil (la ruta
  no se ve). El móvil es parte explícita del criterio 7.
- **El hallazgo 2**: la batalla se lee mal en cuanto hay muchos individuos.

---

## Segunda pasada (01-10-2026)

Re-verificados SOLO los ocho puntos de «Se corrigen» de `hallazgos-qa.md` contra
el diff sin commitear, más una pasada adversarial sobre lo que tocaron los
arreglos. Sin tocar código. Playwright sobre un vite mío (3177, `set -m` en su
línea, matado por grupo y comprobado: «3177 libre», 0 procesos en el grupo).
Guiones nuevos en el scratchpad (`p2-*.mts`); capturas mías en `qa/p2-*.png`.

### Condición (salida real)

```
$ pnpm verify     real 0m9,140s · Test Files 26 passed (26) · Tests 553 passed (553)
$ pnpm banco      sha256: 54a035f0ae024a8e24b64de211a02b1ede41c967aeb2c574de450822dfb2bd43
                  sin terminar: 0/200 · ancla: igual
$ pnpm qa         real 0m2,952s · 1 mapa diseñado, 3 turnos de mapa y 29 decisiones de batalla
                  consultas: battle_state, building_list, creature_stats, game_state, map, spell_list
$ pnpm capturas   real 0m49,309s · exit 0 · «sin errores en consola» (25 capturas en capturas/)
```

Tras `pnpm capturas` el único puerto escuchando de node es el 3636, de
`/home/al/code/ai-tutorials/tutor-mcp` (arrancado a las 05:45, ajeno): no se tocó.

### Los ocho puntos

| # | Punto | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Táctil: la ruta se ve tras el primer toque y el segundo la anda | ✅ | `capturas`: «primer toque → Ruta: llegas hoy (3 pasos). · Toca otra vez para ir.; el paso (3,2) cambia 14065» y «el segundo toque anda hasta (2,1)». Adversarial (`p2-tactil*.mts`, semilla 2, día 1, 390×844 `hasTouch`): A=(2,1) y luego B=(3,6) cambia la ruta a B sin andar (`p2-t-1-A` / `p2-t-2-B`); con la ruta puesta, «Fin de turno» la olvida y un solo toque el día 2 vuelve a ENSEÑAR, no anda; primer toque al propio héroe «Aldo de Valdeluz.», segundo «…ya está en esa casilla: pulsa otra para moverlo.». |
| 2 | Batalla con muchas unidades: cielo en vez de hueco negro, tablero más alto, fuera chapas, barras sin taparse | ✅ | `capturas/desktop-08`, `qa/p2-d-1280x720-batalla`, `qa/p2-apaisado-batalla`: cielo de atardecer, sin chapas «Cam/Esq», nombre solo en la activa/señalada, barras por encima de todas las figuras. En móvil (`tactil-04`) la barra de delante cae sobre el torso de la de detrás: declarado por el ingeniero, no tapa barra con barra. |
| 3 | «Espera a que termine la jugada.» se retira al acabar | ✅ | `capturas`: «durante la jugada, «» al acabar» (escritorio y móvil). `puerta.mts` de la primera pasada, re-ejecutado: «tras la cola … \|» —antes decía «Espera a que termine la jugada.»—. Resolver sola, Defender y clic siguen rechazados durante la cola. |
| 4 | Clic cerca del centro de un hex alcanzable tapado mueve, no ataca | ✅ | Test del caso (semilla 2, ronda 3, hex (5,4) / `defender-13`). Barrido mío en node con `EscenaBatalla.objetivoEn` (`p2-clic.mts`), 5 semillas, 406 enemigos atacables por tamaño: **0 enemigos sin superficie clicable** en 1086×778, 860×380, 926×600 y 860×600; la fracción mínima de su figura que sigue atacando es 0,69 (móvil) y 0,97 (escritorio). La regla nueva no le roba el enemigo al dedo. |
| 5 | Móvil: la barra no tapa hechizos; pista del enemigo | ✅ | `capturas`: «pista del borde «Enemigo (14) ▸»», «pulsar la pista desplaza el marco de 0 a 496» y el guion comprueba que el escenario acaba donde empieza la barra. Medido (`p2-movil.mts`): 360×640 stage 118–582 / barra 582–640; 390×844 stage 85–786 / barra 786–844 — sin solape en ninguno; `docScroll` 0 (el documento no se desplaza, solo `#stage`). |
| 6 | Fichas de coste caben en su chapa | ✅ | Recorte de `capturas/desktop-04`: «20 20 5000», «20 ❄20 5000», «10 10 2000» dentro de su chapa; `movil-02` igual. |
| 7 | Pulsar el propio héroe dice algo verdadero | ✅ | `capturas`: «Aldo de Valdeluz ya está en esa casilla: pulsa otra para moverlo.»; igual con el dedo (punto 1). |
| 8 | Dos Espacios seguidos = un día; «Fin de turno» ignorado fuera de turno/animación | ✅ | `p2-espacio.mts` / `p2-e.mts`, 1440×900: dos Espacios a 30 ms: día 1→2; tres a 250 ms: 2→3; Espacio mantenido (11 `keydown`, `repeat`): 3→4; tres clics al botón a 100 ms: un día, en las semillas 2, 7 y 121. La puerta se reabre: Espacio a 650 ms de volver el turno pasa (2→3 en las tres semillas; el rival tarda 33-47 ms). Botón con foco + Espacio: un día por gesto, sin doble disparo. Con la partida perdida (semilla 2, día 6) el Espacio no hace nada ni da error. |

### Pasada adversarial sobre lo tocado

- **Cámara variable 25–35° y proyección**: ida y vuelta `centroHex → hexEnPixel`
  y puntos al 80 % hacia cada vértice en **2 499 tamaños** de lienzo (280–2600 ×
  200–1700): **0 fallos de 230 769** hexes; la compresión nunca sale de
  [sin 25°, sin 35°]. En el navegador, a 1280×720, 1920×1080 y 1024×768 un clic
  en el centro del último movimiento legal mueve a esa unidad
  (`p2-d-*-batalla`). La cámara variable no rompe clics ni proyección.
- **Puerta de fin de turno**: ver punto 8. Durante los 600 ms el botón no se ve
  apagado y no dice nada: decisión declarada del ingeniero, no lo cuento como
  fallo.
- **Barra inferior en móvil**: también el espectador (comparte hoja) a 390×844:
  la barra queda abajo y el escenario arriba (`p2-espectador-movil`, sin
  servidor: el error de WebSocket de consola es el esperado sin `pnpm partida`).
- **Apaisado 844×390** (entra en el diseño de escritorio): mapa y batalla
  usables, hex 40×24 px a 31,5° (`p2-m-844x390-mapa`, `p2-apaisado-batalla`).
- **Botón «Enemigo ▸»**: aparece al empezar, pulsarlo lleva al enemigo y
  desaparece. Una vez allí nada señala el camino de vuelta a la unidad propia
  activa (`tactil-04`), que ya declaró el ingeniero.

### Hallazgos nuevos

1. **Importante (no es regresión; preexistente, lo destapa la pasada
   adversarial).** En tableta vertical (768×1024, `hasTouch`) el ancho supera el
   corte de 760 px, entra el diseño de escritorio y el lienzo de batalla mide
   408×882: el tablero se encoge al ancho y cada hex queda en **34×22 px**, con
   dos tercios de cielo encima (`qa/p2-m-768x1024-batalla.png`). En el móvil
   (860 px de tablero con scroll) son 64×31. Reproducir: `?seed=2` a 768×1024
   táctil, tocar dos veces el monstruo de (5,2). Esperaba quien juega: hexes que
   se puedan tocar, como en el teléfono.
2. **Menor.** Con la pista pulsada y el marco en el enemigo, no hay pista de
   vuelta a la unidad propia activa (declarado en implementación).

### Workarounds

- Para entrar en batalla en 844×390 arrastré el mapa con ratón (Playwright no
  arrastra con el dedo): no afecta a quien juega, que puede arrastrar con el dedo
  (probado en la primera pasada con CDP).
- Las comprobaciones de clicabilidad del punto 4 y de proyección se hacen en node
  con las mismas clases del cliente (`EscenaBatalla`, `tableroPara`), no en el
  navegador; el navegador solo confirma un clic por tamaño.

### No probado

- El caso (5,4) de la ronda 3 clicado en el navegador real: cubierto por el test
  y por el barrido en node con la misma `EscenaBatalla`.
- La pista «◂ Enemigo» por la izquierda (la persona defendiendo): la defensa no
  se juega por clics.
- El espectador en móvil con una partida en marcha.
- Toques en un dispositivo real.

### Veredicto de la segunda pasada

**Apto.** Los ocho puntos se cumplen con evidencia en el navegador y su test o
su paso en `pnpm capturas`; verify, banco (`54a035f0…`, igual), qa y capturas en
verde. El hallazgo de la tableta vertical es anterior a estos arreglos y no
incumple ningún punto de «Se corrigen»: va como issue, no bloquea.
