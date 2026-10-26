# QA — fuerza y agilidad, disparo diferido, correr, dos armas y la rueda teñida (26-10-2026)

Rama `claude/objective-almeida-2011b2` en `cb00c30e`, limpia al empezar y al acabar (`git status`
vacío). Un QA anterior se cortó sin `qa.md`; sus capturas `qa-*.png` no se han usado como evidencia:
todo lo de abajo se ha comprobado otra vez en esta pasada (capturas `capturas/qa2-*.png`).

## Veredicto: **HALLAZGOS** (no apto tal cual)

Un fallo bloqueante: en la partida, la tropa del catálogo no puede llevar segunda arma y, al
intentarlo, **la pieza desaparece de la mochila** (H1). Lo demás cumple, con dos hallazgos de texto
(H2, H3) y uno menor (H4).

## Cómo se ha probado

- `pnpm dev` propio en el puerto 3207 (`vite --port 3207 --strictPort`, arrancado con `set -m` en su
  línea, muerto por su grupo y comprobado libre con `ss -ltnp`). Playwright sin pantalla (Chromium de
  `~/.cache/ms-playwright`), con clics de ratón reales. Para saber dónde pulsar en el lienzo, cada
  guion engancha **solo para leer** la sesión que crea la página (envuelve `battleLegalActions` / el
  getter `scene` para guardar `this` en `window`) y calcula el píxel con `tableroPara`/`centroHex`
  de la propia página (ver «Workarounds»).
- Las peleas de la arena se montan con un `?montaje=` versión 16 sacado de `montajeALaURL` del
  núcleo, con `?seed=3`.
- Sondas de reglas en node (`SesionDeArena`/`Session` reales, en el scratchpad, **no son tests del
  repo** y no se han escrito tests del disparo).
- Ningún error ni aviso de consola en ninguna página abierta (arena, partida, espectador), salvo el
  que se buscaba a propósito en la pieza con `velocidad`.

## Comprobaciones automáticas

| Qué | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck` | siempre que se valida código | sale 0 |
| `pnpm lint` | ídem | sale 0 («No fixes applied», 10 infos de siempre) |
| `pnpm qa` | el disparo toca el contrato (`aim`) y el director | sale 0: «terminado por fin de partida: 1 mapa diseñado, 4 turnos de mapa, 18 decisiones de batalla y 1 ascenso»; «disparo: «defender-0: apuntar a (0,3), aplicada.»» |
| `pnpm vitest run test/espectador.test.ts` | el espectador no lo pude ver en una batalla en vivo (abajo); este test mira la inversa exacta de la serialización, y `serialize.ts` cambió en el simplify sin que el implementador lo citara después | 22 passed |

No corridos, por la regla del usuario: `pnpm verify`, `verify:lento`, `pnpm capturas`. Lo demás que
cita `implementacion.md` en verde no se ha repetido (el código no cambió desde su última tanda).

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1.1 | Un tirador apunta a una casilla; cierra el turno; la casilla y la recta se ven | ✅ | Arena s3, arquero élfico (0,4): clic en el lancero → registro `aimed (11,4)`, la activa pasa al rival; tablero con recta a trazos, diana en (11,4) y el alcanzado en rojo (`qa2-arena-03-apuntado.png`). «Apuntar» + casilla vacía (6,0): «Apuntarías a (6,0). Hoy no daría a nadie.» (`qa2-arena-02-apuntar-casilla-vacia.png`). La recta del rival también se ve (`qa2-arena-04-disparo-al-aliado.png`, la del goblin arquero en azul). |
| 1.2 | Sale al empezar su siguiente turno, al primero de la recta de cualquier bando, sin pasar de la casilla; un muro lo para | ✅ | Registro de la arena: `aimed` → … → `round_start` → `shoot {at:(11,4), target:"attacker-1", damage:16}` antes de cualquier jugada del arquero: el guerrero propio se metió en (1,4) y se llevó el disparo; parte «Arquero → Guerrero con escudo (disparo a (11,4)): 16 de daño (−7 armadura)». Sonda con muros en (6,3-5): `parada: "muro"`, `shoot target:null`. |
| 1.3 | El daño va por la distancia del alcanzado a la casilla; `double_shot` dos tiros | ✅ | Sonda (lancero colocado a mano en la recta, d = 0…7): 116 / 92 / 68 / 44 / 20 / 20 / 20, exactamente `24 + 24·max(0,4−d)` −4 de armadura con ataque 6 contra defensa 6. Arquero con `double_shot` contra un zombi: dos `shoot` de 113. |
| 1.4 | Se pierde si muere el tirador; tras el disparo el turno sigue | ✅ | Sonda: tirador muerto tras apuntar → 0 `shoot` en 12 turnos. Tras el disparo, la lista legal trae `aim, move, defend, wait, end_turn`. Dos tiradores a la misma casilla: el primero mata al lancero, el segundo «no da a nadie» (`target: null`). |
| 1.5 | Registro, parte y animación lo cuentan | ✅ | Parte de la arena y de la partida: «apunta a (11,4): dispara al empezar su siguiente turno», «dispara a (0,3) y no da a nadie», «→ X (disparo a …): N de daño». |
| 1.6 | La IA apunta; el agente apunta; el espectador | ✅ / ⚠️ | IA: 60 peleas IA contra IA (4 contra 4 con tiradores, s1-60): 1 117 `aim`, **0** con un aliado como primero de la recta al apuntar, 0 a una recta vacía. En la partida (s1, elfos contra seis arqueros) la IA apunta cada turno (`qa2-partida-batalla-rectas.png`). Agente: `pnpm qa` (arriba); un `shoot` viejo no pasa el esquema y se le dice: «action.type: Invalid discriminator value. Expected 'move' \| 'attack' \| 'aim' \| …» + «no se ha aplicado nada. Ese turno lo juega la IA de reglas en tu lugar.». Espectador: la página abre y pinta la partida del servidor sin errores (`qa2-espectador.png`), pero **no vi una batalla con disparos en vivo** (la partida sin agente acabó el día 2); queda `espectador.test.ts` en verde. |
| 1.7 | Sin tests del disparo | ✅ | No se ha escrito ninguno; no es hallazgo. |
| 2 | Correr si el tramo pasa de la mitad; caminar si no | ✅ | Orko de dos armas (4 casillas): tramo de 1 → `move` sin marca, erguido y andando (`qa2-arena-camina-1de4.png`, 4 fotogramas); tramo de 3 → `corre: true`, inclinado y a zancadas (`qa2-arena-corre-3de4.png`). El goblin lancero de la IA, 4 de 4 → `corre: true`. |
| 3.1-3.3 | Fuerza, agilidad, peso; defensa, daño y casillas derivados | ✅ | Ficha de la arena (`qa2-ficha-*.png`), cuerpo → final: troll F 40 → 55, Ag 2, def 2, daño 55–110, 2 casillas, peso 8 de 40; hermano de carga peso 42 de 28: −1 agilidad (7 → 6), daño 40–240; orko con armadura pesada 34 de 22: −1 (4 → 3); goblin lancero 17 de 12 sin resta (se trunca); jinete élfico 45 de 32 sin resta, disparo 42–210. Todo igual que `cifras.md`. Héroe en la partida (rango 5, Espada y gambesón): ataque 4, defensa 6, daño 30–120, 4 casillas. |
| 3.2 | Toda pieza pesa, ninguna resta movimiento; `velocidad` fuera | ✅ | Editor de equipo: ataque, fuerza, peso, precio (y manos y «es una lanza» en un arma); ni «velocidad» ni daño en la vista (`qa2-editor-equipo-lanza.png`, `-barda.png`). `"velocidad": -1` a mano en el arco de `data/equipo.json`: la arena y la partida no arrancan y dicen «data/equipo.json: "arco" dice velocidad: ninguna pieza resta movimiento, lo hace su peso («peso»)» (`qa2-pieza-con-velocidad-*.png`). Fichero restaurado, `git status` limpio. |
| 3.5 | Ficha, editor, paneles, `creature_stats`, índice | ✅ | Ficha («Índice 293 · nivel 2» del troll…), panel de la batalla («Ataque / Defensa 5 / 7 +2 Ataque +3 Defensa», «Velocidad 4 casillas»), tropa de la partida; `creature_stats` lo consulta `pnpm qa`. |
| 3.6 | La lanza es un arma; montado con lanza +10 %, si no +5 % | ✅ | Ficha: hermano de carga y jinete élfico «Espada y Lanza … +10 %/casilla»; goblin lancero «Lanza … +5 %/casilla, a pie». Sonda `cifrasDeCarga`: jinete sin lanza 5, con la lanza en `arma` y espada en `segunda` 10, troll 5. Un enlace con hueco `lanza` se rechaza: «no hay ningún hueco "lanza": son arma, segunda, distancia, armadura, escudo». |
| 4 | Dos armas: en la arena y en la tropa de la partida; dos manos y escudo rechazados con su motivo | ❌ | **Arena**: ✅ el orko de dos armas pelea con «Espada y Maza · Ataque 6 · Daño 43–172» y la rueda con el mejor nivel de las dos; las opciones que no caben salen apagadas, pero varios motivos dicen el remedio al revés (H2). **Partida**: el héroe se pone una segunda Espada sin problema («Aerin del Roble lleva ahora Espada», `qa2-partida-tropa-heroe-tras-segunda.png`); la guardia del bosque la tiene apagada con un motivo correcto (escudo de serie). Pero **el arquero, con su daga de serie, tiene «A la segunda mano» encendido y al pulsarlo falla y pierde la espada** (H1). |
| 5 | La rueda teñida al golpear y al responder; 5 y 3 fusionados; Normal sin tono | ✅ | Golpe (orko, espada + maza): `ofensivo=3 fuerte=5 finta=3 defensivo=3 rapido=3 romperGuardia=5 normal=-` (`qa2-arena-rueda-golpe.png`). Respuesta (le pega el goblin lancero): los de la lanza, `ofensivo=5 fuerte=4 finta=2 defensivo=3 rapido=1 romperGuardia=3` (`qa2-arena-rueda-respuesta.png`). Rueda de 5: `ofensivoFuerte=4 rapido=1 romperGuardia=3 defensivoFinta=2 normal=-`; de 3: `ofensivoFuerte=4 rapidoRomper=2 defensivoFinta=2` (medias truncadas correctas; `qa2-arena-rueda5/3-respuesta.png`). El pie dice qué es el color en cada fase. |
| 6 | `pnpm verify`, CLAUDE.md, banco | ⚠️ | No corrido aquí (`verify` lo corre CI, decisión del usuario). Banco: citado de `implementacion.md` (`0bbccba8…`, igual tras el simplify). |

## Hallazgos

### H1 — bloqueante: la tropa no puede llevar segunda arma y la pieza se pierde

Toda unidad del catálogo lleva su arma de cuerpo a cuerpo **de serie**. En la ficha de la tropa,
«A la segunda mano» sale encendido («Ponérsela de segunda arma») porque la pregunta mira lo puesto
con lo de serie (`equipoDelPortadorBlocker`), pero al aplicarla el núcleo hace
`hero.mochila = sacarDeLaMochila(…)` **antes** de `ponerPieza(equipoDe(hero, quien), …, 'segunda')`,
y `equipoDe` es solo lo propio del individuo (sin la daga de serie): `manosDe` dice «va de segunda
arma con una primera» y lanza. La sesión enseña el error, pero la pieza ya salió de la mochila y no
va a ningún sitio (`src/core/state/game.ts`, `case 'equip'`, líneas 1516-1535). Rompe además
«fail-loud: todo o nada». Lo mismo le pasaría al agente con `equip` + `slot: "second_melee_weapon"`
sobre una tropa.

Reproducir (navegador): `/?seed=1&faccion=elfos&heroe=guerrero` → «Ayuntamiento» → Construir
Armería → «Armería» → Comprar Espada → «Volver al mapa» → «Tropa» → elegir el primer Arquero →
«A la segunda mano» de la Espada. Barra: «no se puede poner Espada: Espada va de segunda arma con
una primera: pon antes una en Arma»; la mochila pasa de 3 a 2 piezas y la segunda arma sigue en «—»
(`qa2-partida-tropa-arquero-antes.png`, `qa2-partida-tropa-0-tras-segunda.png`). En node, con
`new Session(1, 'elfos', 'guerrero')`, mochila `["espada"]` y
`equip {puesto: 0, hueco: 'segunda'}`: lanza y la mochila queda `[]`.

Lo que esperaba quien juega: que el arquero (daga de serie) pegue con daga y espada, como en la arena;
o, si la regla no lo deja, el botón apagado con su motivo, y nunca perder lo comprado.

### H2 — importante: en la ficha de la arena, el motivo de una opción apagada dice el remedio al revés

`opcionesDelHueco` juzga el equipo entero ya puesto con `equipoBlocker`, que mira primero `arma`,
luego `segunda` y luego `escudo`; el motivo sale desde la pieza que ya estaba, no desde la que se
intenta poner. Ejemplos leídos en `#ficha`:

- Orko con armadura pesada (mandoble), «Segunda arma» → «Espada · no: Mandoble es un arma a dos
  manos y va sola: quita antes **Espada**» (la que se quiere poner), y «Mandoble · no: … quita antes
  Mandoble».
- Jinete élfico (espada + lanza), «Escudo» → «Rodela · no: con Rodela no queda mano para una segunda
  arma: quita antes **el escudo**» (el que se quiere poner); `manosBlocker` con el hueco diría «Rodela
  no se puede llevar con dos armas: …; quita antes Lanza».

Reproducir: arena, montar el orko con armadura pesada o el jinete élfico, pulsar su nombre en el
bando y abrir el desplegable «Poner» de «Segunda arma» o «Escudo». La regla rechaza bien; solo
engaña la frase. En la tropa de la partida los motivos salen bien (allí pregunta `manosBlocker`
con su hueco).

### H3 — importante: el tanteo sobre un enemigo no dice que el disparo daría a un aliado

Pasando el ratón por un enemigo con un aliado delante en la recta, la barra dice «Apuntarías a su
casilla: … Daño 16: no caería ninguno y le quedarían 144 PV …»: «su casilla» es la del enemigo, pero
el daño y los PV son los del **guerrero propio** (160 PV), sin nombrarlo ni decir «¡tuyo!». Con
«Apuntar» + casilla sí se dice («Hoy daría a X (¡tuyo!)», `rotuloDelDisparo`); el clic directo en un
enemigo, que es la forma corriente de apuntar, no.

Reproducir: arena s3, arquero élfico + guerrero con escudo (Yo) contra goblin lancero + goblin
arquero; primer turno del arquero «Terminar turno»; mover al guerrero a (1,4) y terminar; en el
turno del arquero, pasar el ratón por el lancero (7,4) (`qa2-arena-tanteo-tuyo.png`).

### H4 — menor: rechazos con el id interno en la barra

Con «Apuntar» y clic en su propia casilla, la barra dice «Attacker-0 no puede apuntar a su propia
casilla.»: quien juega no conoce «attacker-0» (es `apuntarBlocker`, `${s.id} …`). Mismo origen en los
demás motivos de `apuntarBlocker`. Reproducir: arena, tirador activo, «Apuntar», clic en él
(`qa2-arena-apuntar-propia.png`).

## Workarounds usados

- **Leer la sesión desde la página** (envolver `battleLegalActions` o el getter `scene` de la clase ya
  cargada para guardar `this`): solo lectura, para saber dónde están las unidades y cuándo se puede
  pulsar. No cambia nada de lo que pasa; quien juega lo ve en el lienzo.
- **El viaje por el mapa de la partida** hasta la guardia de (1,12) con `session.moveHeroTo` (lo que
  hace un clic en esa casilla) en vez de calcular el píxel del mapa: lo probado es la batalla, que se
  jugó con clics. No afecta a quien juega.
- **Posiciones sintéticas en las sondas de node** (el lancero a d casillas de la diana, el tirador
  muerto a mano): solo para medir la regla del núcleo; lo visible se probó sin ellas en el navegador.

## No probado

- El espectador viendo una batalla con disparos en vivo: la partida del servidor sin agente
  (`HEROES_WAIT_AGENT_MS=0`, puertos 3211/3212, muerto por su grupo) acabó el día 2 sin batalla a la
  vista; queda `espectador.test.ts` en verde y la página sin errores.
- El disparo que sale cuando el tirador pierde el turno por la moral baja (no se dio en las partidas
  jugadas).
- La muralla de la arena en pantalla (solo la sonda: el muro para la recta).
- Correr/caminar en la partida y el espectador en pantalla (mismo animador que la arena, visto allí).
- `pnpm verify`, `verify:lento`, `pnpm capturas`, `pnpm banco` (regla del usuario; el banco citado).

---

# Vuelta 2 (26-10-2026): re-verificación de H1-H4

Rama en `4c75aaa1`. `pnpm dev` propio en el puerto **3241** (`vite --port 3241 --strictPort`, `set -m`
en su línea; muerto por su grupo 23705, `ss -ltnp` dice libre y el grupo queda vacío). Playwright sin
pantalla, con clics reales y los mismos guiones de reproducción de la vuelta 1 (capturas
`capturas/qa3-*.png`). Consola sin errores ni avisos en todas las páginas abiertas.

## Veredicto: **HALLAZGOS**

H1-H4 están arreglados. La pasada adversarial encuentra uno nuevo de la misma familia que H1 (H5):
quitar el arma propia de una tropa que la lleva sobre un arma **a dos manos de serie** deja puestas a
la vez la de dos manos y la segunda arma, que la regla prohíbe.

## Comprobaciones automáticas

| Qué | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck` | código cambiado | sale 0 |
| `pnpm lint` | ídem | sale 0, «No fixes applied», 10 infos de siempre |
| `equipo.test.ts`, `arena-equipo.test.ts`, `pnpm qa`, `pnpm banco` | — | no repetidos: el ingeniero los dejó en verde sobre este mismo código (`implementacion.md`, «Verificación ejecutada») |

## Criterios afectados

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| H1 / 4 | La tropa lleva segunda arma; la acción es todo o nada; botón y acción dicen lo mismo | ✅ | Navegador, `/?seed=1&faccion=elfos&heroe=guerrero` → Armería → 2 Espadas → Tropa → primer Arquero → «A la segunda mano»: botón encendido («Ponérsela de segunda arma»), barra «Arquero lleva ahora Espada.», Segunda arma: Espada ×, ataque 5 → 6, daño 18–90 → 24–120, mochila 2 → 1 (`qa3-h1-arquero-antes.png`, `qa3-h1-arquero-con-segunda.png`). Sonda en node (`Session` real + `applyAdventureAction`): 26 acciones de equipar y quitar en héroe, arquero, piquero, guerrero con escudo, hermano de carga, orko de dos armas y monje; **toda acción rechazada deja héroe, mochila, tropa y contador de hojas idénticos**, y el blocker de la acción coincide con el del botón (`ponerseBlocker`) en todas las que se pueden pulsar. |
| H1 / agente | `equip` con `slot: "second_melee_weapon"` | ✅ | Por el camino del director (`adventureActionSchema` → `accionDelAgente` → `applyAdventureAction`): arquero por `creature`, aplicada (tropa `{segunda: "espada"}`, mochila −1); piquero (mandoble), rechazada con «Mandoble es un arma a dos manos y no deja mano para una segunda arma» y la mochila igual; héroe, aplicada, y `unequip` con `second_melee_weapon` la devuelve a la mochila; `slot: "third_hand"` se descarta con «no hay ningún hueco "third_hand": son melee_weapon, second_melee_weapon, ranged_weapon, armor, shield». |
| H2 / 4 | El motivo de la opción apagada de la ficha de la arena da el remedio bien | ✅ | Navegador, orko con armadura pesada: «Espada · no: Mandoble es un arma a dos manos y no deja mano para una segunda arma»; jinete élfico: «Rodela · no: Rodela no se puede llevar con dos armas: no queda mano para el escudo; quita antes Lanza» (`qa3-h2-ficha-*.png`). **Todas las combinaciones** (node, `opcionesDelHueco` sobre las 34 unidades × 5 huecos): 793 opciones, 263 apagadas, 15 frases distintas; en **0** el remedio nombra la pieza que se pone o algo que no lleva en otro hueco, y en 0 quitar lo que dice deja la pieza sin entrar por las manos. |
| H3 / 1.1 | El tanteo sobre un enemigo nombra a quién daría hoy, «¡tuyo!» si es propio | ✅ | Arena s3, guerrero propio en (1,4) delante del lancero: «… Hoy daría a Guerrero con escudo (¡tuyo!). Daño 16: no caería ninguno y le quedarían 144 PV. …» (`qa3-h3-arena-tanteo-tuyo.png`). Sin nadie delante, el caso corriente no se estropea: «Hoy daría a Goblin lancero. Daño 116: caería 1 …» y «Hoy daría a Goblin arquero. Daño 142 …» (`qa3-h3-arena-tanteo-enemigo.png`). |
| H4 / 1.1 | Los rechazos de apuntar dicen el nombre | ✅ | «Apuntar» y clic en su casilla: «Arquero no puede apuntar a su propia casilla.» (`qa3-h4-arena-apuntar-propia.png`). |

## El índice del arquero con la Espada de segunda (lo que dejó abierto el ingeniero)

**No miente; no es hallazgo.** La ficha de la tropa enseña el índice del **individuo vestido**:
`src/client/tropa/vista.ts`, `fichaDe`, `indiceDePoder(troopUnit(t, …))`, y `troopUnit` es
`cifrasDeUnidad` con lo de serie y lo suyo (el daño que sube en la misma ficha sale de ahí). Sigue en
284 porque la ofensa del índice es **el mejor de sus ataques** (`ofensaDe`, `core/nivel.ts`:
`max(cuerpo a cuerpo, disparo × 3/2)`, y así lo dice el `_comment` de `data/poder.json`), y en el
arquero manda el arco. Comprobado: el mismo arquero sin el arco pasa de **243 a 274** al ponerle la
Espada de segunda, así que el índice sí ve la segunda; con el arco, 284 → 284. El héroe con Espada +
Espada tampoco cambia (415 → 415): de dos armas cuenta la mejor de cada cifra, y son iguales.

## Hallazgos

### H5 — importante: quitar el arma propia deja un arma a dos manos de serie con la segunda arma

`unequipBlocker` (`src/core/state/game.ts`, ~1866-1883) pregunta `equipoDelPortadorBlocker(nombre,
equipoPuestoDe(hero, quien, resto), null)`: con `puesta = null` no mira las manos
(`manosBlocker` solo corre con una pieza puesta), solo que quede un arma. Si la tropa lleva un arma
propia de una mano **sobre un arma a dos manos de serie** y además una segunda arma propia, quitar
el arma propia vuelve a poner la de dos manos de serie **con la segunda**: el equipo queda en un
estado que la regla prohíbe («un arma a dos manos va sola», `manosBlocker`) y que
`equipoBlocker` del propio núcleo rechaza («Mandoble es un arma a dos manos y va sola: quita antes
Espada»). La unidad pelea así: ataque 7, daño 46–138, índice 309 (nivel 3).

Reproducir (navegador, `qa3-h5-alabardero-mandoble-y-segunda.png`):
`/?seed=1&faccion=imperio&heroe=duelista` → «Ayuntamiento» → Construir Armería → «Armería» →
Comprar Espada dos veces → «Volver al mapa» → «Tropa» → primer Alabardero (Mandoble de serie) →
«Poner» Espada (Arma: Espada) → «A la segunda mano» Espada → × de Arma (sale **encendido**): barra
«Espada vuelve a la mochila de Konstanz von Adler.» y la ficha dice «Arma: Mandoble de serie … a dos
manos · Segunda arma: Espada ×». Lo mismo con el monje templario (bastón de serie + espada + daga).

Lo que esperaba quien juega: el × del arma apagado con su motivo («quita antes la segunda arma»), o
que al quitarla la segunda vuelva también a la mochila; nunca un mandoble con otra arma en la otra
mano.

Origen: la **segunda arma** es de esta tarea; la misma grieta con un **escudo** propio (alabardero con
Espada y Rodela propias, quitar la Espada → Mandoble + Rodela) ya estaba en `main` (`b2cfe502`, mismo
`unequipBlocker`). Comprobado en node: los dos casos se aplican sin lanzar y `equipoBlocker` los
rechaza después. El arreglo es el mismo para los dos.

## Workarounds usados

- Leer la sesión desde la página (envolver `battleLegalActions`) para saber dónde pulsar en el
  tablero de la arena, como en la vuelta 1: solo lectura.
- Sondas en node (`Session` real, mochila y tropa puestas a mano para probar cada unidad del
  catálogo sin reclutarla): solo para recorrer combinaciones de la regla; H1 y H5 se reprodujeron en
  el navegador con clics y sin nada puesto a mano.

## No probado

- `pnpm qa` no repetido (citado del ingeniero, mismo código); el `slot` del agente se probó por el
  camino del director en node, no con un agente real.
- El espectador y el disparo que sale con la moral baja: siguen como en la vuelta 1 (fuera de H1-H4).

## H5, arreglado por el coordinador (26-10-2026)

`equipoDelPortadorBlocker` (`core/catalogo.ts`), al quitar, juzga las manos de lo que queda puesto
(`equipoBlocker`, lo de serie incluido): el alabardero con Espada suya sobre el mandoble de serie y otra
de segunda ya no puede quitarse la del arma («… no puede quitársela así: Mandoble es un arma a dos manos
y va sola: quita antes Espada»); quitada la segunda, sí. Test nuevo en `test/equipo.test.ts` (rojo sin el
arreglo, verde con él). Corridos: `pnpm typecheck`, `pnpm lint`, y `equipo`, `arena-equipo`,
`tropa-en-escena` e `invariantes` (los que leen ponerse y quitar), 163 en verde; `pnpm banco` igual
(0/20 sin terminar). La arena ya juzgaba el equipo entero (`equipoDeUnidadBlocker`). No se re-verificó en
el navegador: el botón × pregunta al núcleo por la misma acción.
