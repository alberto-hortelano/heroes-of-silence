# QA: el héroe se elige en la base, con su coste

QA, 22-10-2026, sobre el diff sin commitear del worktree `heroe-en-la-base-651fe0`, ya con la vuelta
de simplify. El navegador es Playwright sin pantalla contra un vite propio en el puerto 3163, lanzado
con `set -m`, matado por su grupo y con el puerto comprobado libre después con `ss`. Los guiones
(`s1`…`s8`, `muerto.ts`, `nucleo.ts`) y las capturas (`shots/`) están en
`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-heroe-en-la-base-651fe0/1f9dff11-a355-4244-8010-e031cceb49a6/scratchpad/qa/`.
Las pantallas que se citan abajo están en `shots/`.

## Veredicto

**Hallazgos (no apto todavía).** El juego cumple la petición en el navegador. Elegir, pagar,
reclutar con lo que queda, el bloqueo mientras el héroe está pendiente, D3, el oro que no alcanza y
las URL funcionan de punta a punta y sin errores en la consola. Lo que impide cerrar es el criterio
7: **`pnpm capturas` sale 1** en su pasada nueva «arranque, con el dedo» (H1, bloqueante, se
reproduce siempre).

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Candidatos en la base, ante el ayuntamiento: una figura por tipo con su hoja, que se elige con clic o con su botón, y una ficha con nombre, tipo, descripción y coste | ✅ | Imperio: 4 figuras y 4 botones (`s1-02-ayuntamiento.png`). Templarios, no muertos, orkos y elfos: 3 (`s4-02-ayto-*.png`). El botón de cada uno cambia la ficha (`s1`: duelista → mago → capitán → ingeniero, con su descripción y «Precio 2500 oro»). Tocar el lienzo en el móvil (390×844) elige los 4 (`s5`: toque en x 0,05 / 0,35 / 0,60 / 0,90 → duelista, mago, capitan_mercenario, ingeniero). |
| 2 | Coste en la ficha antes de elegir | ✅ | «Precio 2500 oro» en todas las fichas (`s1`, `s4`). |
| 3 | Se descuenta; la barra y el lateral enseñan lo que queda; la tropa se recluta con el resto | ✅ | `s2`: 28 000 → «Contratar» → 25 500, con la URL `…&heroe=cantora`. `s2b`: licencio 2 y «Todo (2)» arqueros a 170: 25 500 → 25 160. Después, el castillo cabe: 25 160 → 10 160. (28 000 = 27 500 de salida + 500 de renta del día 1, sin pagar todavía.) |
| 4 | Sin oro, no se elige y se dice por qué (`oroBlocker`) | ✅ | `s6`, en flujo real: s11 elfos, héroe fuera, construyo castillo, pabellón y gremio hasta quedar con 0 de oro el día 3. «Contratar héroe» enseña el botón apagado y debajo «no alcanza el oro: cuesta 2500 oro y tienes 0 oro» (`s6-02-ayto-sin-oro.png`). El clic forzado no cambia nada. Con el héroe de salida pendiente no se puede llegar a quedarse sin oro: no se puede gastar nada antes. |
| 5 | Menú, `?heroe=`, partida rápida y recarga como decidió la crítica | ✅ | «Nuevo juego» elige solo la facción («Empezar») → ayuntamiento con `?seed&faccion` y sin `heroe`. La rápida entra en la base ya pagada (25 500) con `?seed=20703&heroe=guerrero&faccion=elfos` (`s3`). `?seed=11&heroe=duelista` entra pagado y completa la facción. Al recargar a media elección vuelve al ayuntamiento con el oro entero y el de por defecto elegido (`s5`, y también en `capturas`). Recargar después de contratar entra en la base con el mismo oro (`s2`). `?heroe=` de otra facción, repetido o en mayúsculas → «La página no arranca» con la frase y «quita "?heroe=…"» (`s4`). |
| 6 | La IA y el agente pagan por la misma puerta | ✅ | En el núcleo (`nucleo.ts`, s1-3), `newGame` por defecto deja a los dos jugadores sin pendiente y con el oro pagado: 25 500, y 25 000 el j1, que aún no ha cobrado. Con `tipoDelHeroe: null`, solo el j0 queda pendiente (28 000, héroe en `heroeDeSalida`). Por código, `createGame` → `hireHero` para todos salvo `porElegir`, y `planHires` → `contratarBlocker`. El agente: el contrato no cambia; `pnpm qa` lo citan del ingeniero, en verde. |
| 7 | verify, banco, barrido, qa y capturas | ❌ | **`pnpm verify`: verde** (159 ficheros, 3837 tests, exit 0, con carga 26 → 24, 2 min 6 s). El timeout de `escenario.test.ts` no salió. Banco re-anclado (`420d75c9…`), barrido 0/4 y `pnpm qa` exit 0: los cito de `implementacion.md`, no los repetí. **`pnpm capturas` sale 1** (H1). |
| 8 | Servidor en otro puerto y commit | ⚠️ | No es de QA. No hay commit todavía. |
| 9 (D3) | Contratar desde la base enseña los candidatos y el contratado es del tipo elegido | ✅ | `s3`: héroe fuera → «Contratar héroe (2500 oro)» → ayuntamiento «Contratar héroe» con 3 candidatos y sin tropa → «Mago» → «Capitán de Valdeluz se une a ti.», 25 500 → 23 000. En el panel del mapa: «Mago (Druida o Archimago) · Capitán de Valdeluz», y recoge la guarnición. |
| — | Con el héroe pendiente no se recluta, ni se construye, ni se pasa el turno, cada cosa con su motivo, y sin héroes a media partida sí | ✅ | Pendiente (`s1`, `s2`): cada «Construir» de «Ampliar» sale apagado con «antes de nada, elige a tu héroe de salida ante el ayuntamiento de Valdeluz». En la morada, «+1» y «Todo» salen apagados con esa frase. «Fin de turno» y Espacio en el mapa dejan esa frase en la barra y el día no avanza. La base se reabre desde el mapa. El oro no se mueve. |

### Estados recorridos

- Persona, día 1, pendiente y elegido: imperio, elfos, templarios, no muertos y orkos.
- Partida rápida.
- Enlace con `?heroe=` (bueno, de otra facción, vacío, repetido, en mayúsculas) y sin `?heroe=`.
- Recargar a media elección y después de contratar.
- Menú → «Abandonar la partida» con el héroe pendiente, y otra partida: limpia, 28 000 (`s7`).
- Héroe fuera de la base (D3).
- Oro a 0 (día 3).
- Escritorio 1440×900, móvil 390×844 y teléfono pequeño 375×667.
- Doble clic en «Contratar»: cobra una sola vez (`s2`: 28 000 → 25 500).

## Hallazgos

### H1 · bloqueante: `pnpm capturas` sale 1 en «arranque, con el dedo»

**Error**:

> `arranque, con el dedo: a 375×667 no se llega a #side [data-action="ayuntamiento-elegir"][data-tipo="inquisidor"] deslizando: sigue en 744 de 667`

Se ve en `tools/qa/capturas.ts:1625`, llamado desde `eleccionConElDedo`. Es la pasada nueva de este
cambio, que el ingeniero no había corrido nunca.

**Causa (reproducida con `s8.mjs`)**: `bajarHasta` desliza de y = 560 a 160. En el menú eso cae en
la página. En la partida, a 375×667, y = 560 cae en `#statusbar` (554-667), que no desplaza nada. Lo
que desplaza es `#stage` (`overflow-y: auto`, scrollHeight 996 / clientHeight 476). Deslizar sobre el
lienzo tampoco desplaza (`touch-action: none`, correcto). Deslizar sobre la franja visible del panel
(y ≈ 534) sí baja: «Contratar» pasa de 942 a 422 y `#stage.scrollTop` llega a 520. Así que se puede
jugar, y lo que falla es el guion de la prueba: tiene que deslizar sobre la franja del panel
(entre el bottom del lienzo y el top de `#statusbar`), no en una y fija.

**Reproducir**: `pnpm capturas` o `CAPTURAS_SOLO=arranque pnpm capturas`. Sale 1 siempre, porque no
depende de la carga.

### H2 · importante (experiencia): en un teléfono pequeño la elección del héroe empieza con el panel casi oculto

A 375×667, al pulsar «Empezar», el lienzo ocupa de 91 a 494 y el panel solo asoma una franja de unos
45 px (509-554), con el título «Elige a tu héroe» cortado. Debajo está `#statusbar`, de 113 px
(`s8-ayuntamiento-375.png`). La barra dice «pulsa una figura para ver su ficha y contrátalo», pero la
ficha y «Contratar» no se ven, y la única forma de llegar a ellas es deslizar justo sobre esa franja
(H1). La disposición es la misma que la de la morada, que ya existía (`s8 morada`: la misma franja de
509 a 554), pero ahora es **la primera pantalla de la partida** en el móvil. Quien juega espera que
tocar una figura le enseñe su ficha y no pasa nada visible. A 390×844 la franja es más alta
(619-731), pero la ficha también queda debajo (`s5-01-movil-ayto.png`). No pido arreglarlo aquí si se
considera del molde de la morada, pero que quede dicho.

### H3 · menor: textos que no cuentan con el héroe pendiente

Pasos: `?seed=11&faccion=elfos` → «Volver a la base» → Escape al mapa.
- En la base pendiente, el panel dice «Sin héroe dentro, lo que reclutes se queda de guarnición.»,
  pero no se puede reclutar (`s1-04-base-pendiente.png`).
- En el mapa pendiente: «No tienes héroes en el mapa. Contrata uno en tu castillo.», cuando lo que
  hay que hacer es elegir el de salida. El botón de la base sí dice «Elige a tu héroe».
- «Fin de turno» sale encendido. Pulsarlo da el motivo en la barra y en el `title`, así que se
  cumple el criterio, pero parece que se puede.

### H4 · menor: al andar hasta el ayuntamiento con el héroe pendiente se abre «Ampliar», no la elección

Pasos: pendiente → «Volver a la base» → pulsar «Ayuntamiento» (o andar hasta su puerta). Se abre
«Ampliar», con todos los «Construir» apagados por la elección pendiente (`s2-01`). Quien juega acaba
de estar «ante el ayuntamiento» eligiendo y vuelve a él para elegir. Al entrar desde la lista de
castillos del mapa (`open-town`) se abre la base y no el ayuntamiento, a diferencia de `abrirSuBase`
al empezar (`s7`, «reabrir»). Las dos cosas tienen salida: el botón «Elige a tu héroe (2500 oro)» del
panel.

### H5 · menor (visual, ya apuntado por el ingeniero)

- A 1440×900, el ayuntamiento sale cortado por arriba (se ve el balcón y no el tejado) y la mitad de
  abajo del lienzo es empedrado vacío (`s1-02`).
- En el móvil, el aro del primer candidato se corta por la izquierda (`s5-01`).
- El nombre del de salida es el de la facción para cualquier tipo: un chamán goblin se llama
  «Grommash Dientenegro» (`inicio-03b`). Es por diseño (`nombreDeSalida`), pero choca.

### Fuera de alcance (visto de paso, no es de este cambio)

- El contratado con guarnición enseña «Movimiento 1837 / 1592» (puntos por encima del máximo):
  `hireHero` fija los puntos antes de recoger la guarnición, y eso ya era así en HEAD (`s3`).

## Workarounds usados

- **`muerto.ts` (Node, sintético)**: quito el héroe de salida de `state.heroes` para simular su
  muerte y contrato después: «Capitán de Valdeluz» de tipo mago, 25 500 → 23 000, sin lanzar. No
  pude matarlo jugando en un tiempo razonable. El camino del clic en `main.ts` ya no busca
  `hero-${viewer}` (lee `heroeDeSalidaPendiente` antes y después), así que no veo riesgo para quien
  juega. Lo dejo como **no probado en el navegador**.
- **El turno del rival, forzado con `state.current = 1` en Node**: la ficha del ayuntamiento dice
  «todavía no es tu turno: ahora juega el jugador 1 (no-muertos)». En el navegador el turno de la
  IA se resuelve antes de poder pulsar, también con la CPU frenada ×30 (`s6`). No es un obstáculo
  para quien juega, porque no llega a verlo.
- `s2` abre la morada con `scrollIntoViewIfNeeded` y `tap()` en el móvil (390×844), que desplazan
  la página por programa. Es justo lo que H1 y H2 dicen que el dedo no hace igual: por eso el
  hallazgo sale de `s8`, con toques de CDP.

## Comprobaciones caras

- `pnpm verify`: una vez, exit 0, con carga 26.
- `pnpm capturas` (PNG en
  `/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-heroe-en-la-base-651fe0/1f9dff11-a355-4244-8010-e031cceb49a6/scratchpad/capturas/`,
  `capturas-resto/` y `capturas-3/`):
  1. La ejecución entera salió 1 a los 43 s en «arranque, con el dedo» (H1). Sus capturas
     `inicio-01` a `inicio-07` están en `capturas/`.
  2. Como así no se ejercía nada más, corrí las demás pasadas con `CAPTURAS_SOLO`. «escritorio»
     salió 1 con carga 23: `moverDosTramosYAtacar`, «tras el tramo» no aparece la fila «Le queda»
     en 2 s.
  3. Repetí una vez, con carga 7-9: todas las demás pasadas (emboscada … rueda-contrincantes) salen
     0 en 13 min 26 s, y «escritorio» sola sale 0 en 3 min 14 s. El fallo de «escritorio» era de la
     carga, no de este cambio.

  **Conclusión: todo pasa salvo «arranque», que falla siempre.**
- `banco`, `barrido` y `qa`: sin repetir, citados de `implementacion.md`.

## Vuelta 2 (22-10-2026)

Re-verificación de H1-H5 sobre el diff sin commitear, tras la «Vuelta de QA 1» de `implementacion.md`.
El navegador es Playwright sin pantalla contra un vite propio en el puerto 3186
(`npx vite --port 3186 --strictPort`), lanzado con `set -m` y matado por su grupo (PGID = PID
comprobado). Después, `ss` da «3186 libre». Los guiones y las capturas están en
`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-heroe-en-la-base-651fe0/1f9dff11-a355-4244-8010-e031cceb49a6/scratchpad/qa2/`
(`h34.mjs`, `h4b.mjs`, `h5.mjs`, `h2.mjs`, `fantasma.mjs`, `adv.mjs`, `ajena.ts`, y `shots/`). Sin
errores en la consola en ninguna de las pasadas.

### Veredicto de la vuelta

**No apto.** H1, H3, H4 y H5 están arreglados. El arreglo de H2 abre un fallo nuevo (**H6**): en un
teléfono de 375×667, tocar una figura en el lienzo puede **contratarla en el acto** y cobrar
2 500 sin que se toque «Contratar». Se reproduce siempre con la CPU frenada y se vio una vez sin
frenar.

### Criterios afectados

| Hallazgo / criterio | | Evidencia |
|---|---|---|
| H1 · `pnpm capturas` entero sale 0 | ✅ | `pnpm capturas …/scratchpad/capturas-cierre/`: **exit 0**, «sin errores en consola», 884,7 s, 130 PNG. Carga de 2,07 al empezar y de 3,79 al acabar. Ninguna pasada falló por carga y no hubo que repetir ninguna. La línea de «arranque, con el dedo»: «a 375×667 se baja hasta «Empezar», tocar una figura trae su «Contratar», se sube y se baja por el panel y abre la base con un inquisidor». Ojo: corrió a la vez que mis pruebas del navegador. |
| H2 · tocar un candidato en el móvil enseña su ficha | ✅ con H6 | `h2.mjs`, 375×667, imperio s5, tres veces: al tocar en el lienzo cada uno de los 4 candidatos, `#stage` baja 514-540, «Contratar a …» queda en 411-463 (visible, por encima de `#statusbar`) y la ficha es la del tocado (`h2-imperio-375-toque1.png`). También en `inicio-08-ayuntamiento-movil-toque.png` de capturas. **Pero ver H6.** |
| H3 · textos y fin de turno con el pendiente | ✅ | Base: «Antes de reclutar o construir, elige a tu héroe de salida ante el ayuntamiento.» (`h3-base-pendiente.png`). Mapa: «Aún no tienes héroe: elige el de salida ante el ayuntamiento de tu base (púlsala en el mapa o en «Castillos»). Hasta entonces no se pasa el turno.» «Fin de turno» sale `disabled` con el `title` «antes de nada, elige a tu héroe de salida ante el ayuntamiento de Valdeluz» (`h3-mapa-pendiente.png`). Espacio deja esa frase en la barra y el día no avanza. Ya elegido el héroe, «Fin de turno» vuelve encendido y sin `title`. Restos menores en H7. |
| H4 · al ayuntamiento, andando y desde la lista o el mapa | ✅ | Pendiente, s11 elfos: andar hasta la puerta del ayuntamiento → escena `ayuntamiento` (`h4-andando-ayto.png`). «Ayuntamiento» en la lista de edificios → `ayuntamiento`. «Valdeluz» en «Castillos» del mapa → `ayuntamiento`. Clic en la base en el lienzo del mapa → `ayuntamiento`. Ya contratado: «Ayuntamiento» de la lista abre «Ampliar» y «Castillos» abre la base (`town`), como antes. |
| H5 · encuadre a 1440×900, 1920×1080 y 375×667 | ✅ | `h5-<facción>-<ancho>.png`, las 5 facciones × 3 tamaños: el ayuntamiento sale entero con el tejado (imperio, templarios, elfos, no muertos y orkos), los candidatos delante y todos los aros dentro, también el del primero en el móvil. Los orkos dejan mucho cielo y empalizada encima de su `village_hall`, como ya dijo el ingeniero: se lee bien. A 1920 las figuras quedan pequeñas frente al edificio, pero legibles. |
| 2 · el coste se lee en la ficha antes de elegir | ❌ (375×667) | H6: el toque contrata sin enseñar la ficha antes. |

### Pasada adversarial

- **Salir del ayuntamiento con el pendiente**: Escape y «Volver a la base» llevan a la base, y
  Escape otra vez al mapa. No encierra a nadie. `cerrarElAyuntamiento` dos veces lanza con su
  frase (Node).
- **Base ajena o neutral con el pendiente** (`ajena.ts`, Node, s11): `openTown` de `town-1` (del
  rival) y de `town-2..4` (neutrales) abre la base (`town`), no el ayuntamiento. Solo la propia
  desvía a la elección.
- **Marcha cambiada a medio camino**, pendiente: hacia el ayuntamiento y, a los 250 ms, a la morada
  → `morada`. Hacia la morada y luego al ayuntamiento → `ayuntamiento`. Hacia el ayuntamiento y
  luego al suelo → `town`. `Marcha.sitio` va con cada marcha.
- **Doble clic sobre el ayuntamiento** con el pendiente: abre la elección una sola vez y el oro no se
  mueve (28 000).
- **Morada con el pendiente**: «+1» y «Todo (0)» salen apagados (`h4-morada-pendiente.png`).
- **Cinco facciones**: encuadre bien en las tres medidas (arriba). H6 se reproduce en templarios,
  orkos e imperio a 375×667.

## Hallazgos de la vuelta 2

### H6 · bloqueante: en el móvil, tocar una figura del ayuntamiento puede contratarla sin pulsar «Contratar»

**Qué pasa**: al tocar un candidato en el lienzo, `pointerup` lo elige y pone `fichaALaVista`. En el
siguiente fotograma, `llevarLaFichaALaVista` desplaza `#stage` (514-558 px). El `click` que el
navegador sintetiza del mismo toque llega **después** del `touchend`. Si entre los dos se pinta un
fotograma, el `click` cae donde está ahora el panel. A 375×667, «Contratar a …» queda justo bajo el
dedo, en y = 411-463, que es la fila de los pies de los candidatos (≈ 0,83 del alto del lienzo,
y ≈ 426). Resultado: se contrata al tocado, se cobran 2 500, la URL se queda con `&heroe=<tipo>` y se
sale a la base («Konstanz von Adler se une a ti.»), sin haber visto la ficha ni pulsado el botón.

**Evidencia** (`fantasma.mjs`, con escuchas de `pointerdown`/`pointerup`/`touchend`/`click` en
captura):
- Sin frenar, durante `pnpm capturas` (carga ~8): el primer toque de `h2.mjs` sobre el duelista lo
  contrató («Konstanz von Adler se une a ti.»). Con la máquina más libre, 0 de 6 toques.
- Con la CPU frenada (`Emulation.setCPUThrottlingRate`), imperio s5, toque en x = 145 (el mago):
  ×1 da 0 de 3; ×4 da 2 de 3; ×6 da 2 de 3; ×8 da 2 de 3. El registro de uno:
  `pointerup canvas 5493 · touchend canvas 5497 · click hire-hero 5538 (stage.scrollTop 558)`. El
  oro pasa de 28 000 a 25 500 y la URL a `?seed=5&faccion=imperio&heroe=mago`. Con
  `page.touchscreen.tap` pasa igual.
- Templarios y orkos a 375×667, ×6, toque al centro: contratados el monje y el goblin (28 000 →
  25 500).
- En otros tamaños el `click` fantasma cae en el panel, pero en algo inofensivo: 390×844 en un `<p>`,
  414×736 en un `DIV`, 375×812 en un `<p>`, y 360×640 en el lienzo. No contrata, pero el mecanismo
  es el mismo.
- `pnpm capturas` no lo caza: su toque en «arranque, con el dedo» ganó la carrera esta vez.

**Reproducir**: `?seed=5&faccion=imperio` a 375×667 táctil, con la CPU ×6 (o un teléfono modesto),
y tocar la figura del mago en el lienzo. Quien juega esperaba ver la ficha del mago con su precio y
decidir. En cambio, ya tiene al mago y 2 500 menos. Afecta igual a «Contratar héroe» a media partida
(D3: la misma escena y la misma marca). Eso no lo probé en el navegador, sale de leer el código:
`fichaALaVista` no mira si el héroe está pendiente.

**Dónde mirar** (no lo arreglo): `main.ts`, el `pointerup` del lienzo pone `fichaALaVista`, y
`dibujarFotograma` → `llevarLaFichaALaVista` desplaza antes de que llegue el `click` del mismo
toque. Hay que desplazar después de ese `click`, o que un `hire-hero` cuyo `pointerdown` no empezó
en el botón no cuente.

### H7 · menor: quedan textos que no cuentan con el pendiente

- En el mapa, la barra sigue diciendo «Haz clic en el mapa para mover a tu héroe; arrastra para
  mirar. Espacio pasa el turno.» (`h3-mapa-pendiente.png`), con el panel diciendo justo lo contrario.
- En la base, el panel sigue con «Construir hoy: disponible» y «Pulsa el ayuntamiento para ampliar
  la base, una morada para reclutar…» (`h3-base-pendiente.png`), cuando no se puede construir ni
  reclutar. La frase nueva de H3 va más abajo.

### Visto de paso (ya en `implementacion.md`)

Tras elegir con un botón del panel, la barra sigue con la frase del último toque en el lienzo.

## Workarounds de la vuelta 2

- **CPU frenada** (`Emulation.setCPUThrottlingRate` ×4-×8) para que H6 salga siempre. No falsea
  nada: emula un teléfono lento o una máquina cargada, y H6 salió también sin frenar.
- **`#stage.scrollTop = 0` por programa** entre toques, en `h2.mjs`, para volver a ver el lienzo.
  Quien juega lo hace deslizando sobre el panel, que capturas ya prueba (H1).
- **`ajena.ts` en Node** para abrir bases ajenas y neutrales con el pendiente. En el mapa del día 1
  no se ven. Para hacerlo copié un fichero temporal al worktree y lo borré después: no queda nada.

## No probado en la vuelta 2

- H6 en D3 (contratar a media partida), en el navegador (ver arriba).
- Un teléfono físico: H6 es de carrera entre fotograma y `click`; en un aparato real la ventana
  depende del aparato.
- `verify`, `banco`, `barrido` y `qa` no se repitieron. Lo cambiado es `src/client/` y
  `tools/qa/capturas.ts`, sin núcleo ni contrato. Cito de `implementacion.md` el `pnpm verify` en
  verde (3838 tests) de esta vuelta, y el banco (`420d75c9…`), el barrido 0/4 y `pnpm qa` exit 0 de
  la anterior.

## Veredicto final

**No apto**, por H6: un toque en una figura compra el héroe sin pasar por su ficha ni por
«Contratar» en el teléfono que prueba capturas (375×667), y eso incumple el criterio 2 en ese estado.
Lo demás cumple: H1-H5 arreglados, `pnpm capturas` entero sale 0 y la consola está limpia. Con H6
arreglado (y H7 si se quiere), sería apto.

## Vuelta 3 (coordinador, 22-10-2026): H6 y H7

Arreglados por el coordinador sin abrir otra vuelta del ciclo (dos fallos acotados):

- **H6**: el desplazamiento que trae la ficha a la vista tras tocar una figura del ayuntamiento
  espera al `click` de ese mismo toque (`fichaTrasElClic`, `main.ts`; si el `click` no llega, a los
  400 ms). Reproducido con el mismo `fantasma.mjs` de la vuelta 2, 375×667, CPU ×6: imperio (mago) 0
  de 3, templarios 0 de 1, orkos 0 de 1 contratados sin querer (antes 2 de 3, 2 de 2): el `click`
  cae en el lienzo con `stage.scrollTop` 0 y, después, la ficha con «Contratar» queda a la vista
  (H2 sigue). Carga 2,8.
- **H7**: con el héroe de salida pendiente, salir de la base al mapa deja en la barra el motivo de la
  compuerta (`bloqueoDeTurno()`) y no «Haz clic en el mapa para mover a tu héroe…», que espera a la
  primera salida tras elegir; en la base, «Construir hoy: tras elegir a tu héroe» y «Pulsa el
  ayuntamiento para elegir a tu héroe; hasta entonces no se amplía ni se recluta.».
- **Verificación**: `pnpm verify` exit 0 (159 ficheros, 3 838 tests, carga 2,3);
  `CAPTURAS_SOLO=arranque pnpm capturas` exit 0 (35,8 s, «sin errores en consola»). El `pnpm capturas`
  entero de la vuelta 2 salió 0; esta vuelta solo toca el toque del ayuntamiento y dos textos con el
  héroe pendiente, que recorre la pasada «arranque». Banco, barrido y `pnpm qa`, los de
  `implementacion.md` (sin cambios en el núcleo desde entonces).

**Veredicto final: Apto.** Backlog: el nombre de salida por tipo (no por facción) y «Movimiento
1837 / 1592» del contratado que recoge guarnición (ya pasaba antes); la barra que sigue con la frase
del toque al elegir después con un botón del panel (también en la morada).
