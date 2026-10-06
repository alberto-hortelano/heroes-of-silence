# QA: #123, #126 y #128 (agente y barra)

Worktree `/home/al/code/heroes-pequenos`, rama `agente-pequenos`, diff sin commitear (tras la vuelta de /simplify). 06-10-2026.
El navegador se probó con Chromium de Playwright sin pantalla contra un `vite` propio en el **3217**. Lo arranqué con `set -m` en su propia línea; PID 284397, que era su propio grupo. El socket lo tenía el pid 284415, con cwd `/home/al/code/heroes-pequenos`. Al acabar lo maté por su grupo y `ss` dijo «3217 libre». No toqué ni el 3100 ni el 3636.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Cada issue, con un test que lo demuestra y visto en rojo | ✅ | Hay tests de #126 (`game.test.ts`), #123 (`game.test.ts`, `notas.test.ts`, `escenas.test.ts`) y #128 (`agent-contract.test.ts`). `implementacion.md` dice qué se rompió y qué rojo salió en cada uno. No repetí las roturas. Leí los tests: comprueban el objetivo, no el mecanismo. |
| 2 / 8 | #126: un id de héroe no se repite nunca; diff del banco solo en `hero` | ✅ | El id pasa a `hero-<j>-c<n>` con `GameState.siguienteHeroe`, que solo crece. Comprobé el espacio de ids: inicial `hero-<j>`, contratado `hero-<j>-c<n>` y ascendido `hero-veterano-<n>`. No hay colisión posible entre formatos, y ningún código analiza el formato del id. El test monta la colisión con 3 jugadores y dos batallas reales. **Banco**: ancla igual, `020ccc584552…7e36`. Con `--dump`, las 200 partidas tienen **0** `hero_hired` (la IA solo contrata con 0 héroes y la base en pie), así que el diff es vacío por construcción, no por casualidad. En vivo (semillas 3, 7 y 11), al contratar por la interfaz salió `hero-0-c1`. |
| 3 / 9 | #128: rechaza la lista con motivo legible; siguen pasando «Peña», 🐉, ❤️, 👨‍👩‍👧 y banderas | ✅ (con reservas menores, ver H1 y H2) | Pasada adversarial propia de 48 casos sobre `responseSchemas.hero_from_troop` (las tres ejecuciones están abajo). **Se rechazan con su motivo:** U+2028, U+2029 (también solos), U+202E, U+202A, U+2069, U+200E, U+200F, U+061C, U+0085 (NEL), U+000B, U+2800, U+3164, U+FFA0, U+115F, U+1160, U+200B solo, U+FEFF solo, U+180E, U+2061, U+2062, U+1D173, U+034F, U+17B4, U+16FE4, U+3000, U+0600, U+06DD, U+1BCA0, U+20E3 suelto y «ㅤㅤ». **Pasan:** «Peña» (NFC y NFD), 🐉, ❤️, 👨‍👩‍👧, 🇪🇸, 🏴󠁧󠁢󠁳󠁣󠁴󠁿 (Escocia, con etiquetas U+E00xx), 🏳️‍🌈, 🏴‍☠️ y 1️⃣. **Pasan y quizá no deberían:** ver H1 y H2. Las respuestas del agente pasan todas por `responseSchemas[kind].safeParse` (`agent-link.ts:257`). |
| 4 | `pnpm verify` y `pnpm qa` en verde | ✅ | `pnpm verify`: exit 0, 54 ficheros, **1812 tests** en verde. `HEROES_AGENT_PORT=0 HEROES_SPECTATOR_PORT=0 pnpm qa`: exit 0, «terminado por fin de partida: 1 mapa diseñado, 5 turnos de mapa, 28 decisiones de batalla y 1 ascenso de tropa a héroe». |
| 5 | #123: la nota lee la causa de la misma derivación que el cliente, sin una segunda búsqueda en `src/server/` | ✅ | `notas.ts` llama a `finDePartida` (`core/state/desenlace.ts`), igual que `Session.causaDelFinal`. En `src/server/` no hay ningún `player_defeated`. **Los tres desenlaces**, con un final real (`acabarPorLaBase`) en las semillas 7, 3 y 22: *perdida*: «Gana el jugador 0 (knight) — has perdido: has perdido tu base. Tú llevabas al jugador 1…»; *ganada*: «— has ganado: ha caído la última base rival.»; *ajena*: «— el último eliminado se quedó sin base.». *Sin resolver*: «La partida se ha quedado sin resolver tras 300 días: no gana nadie.» En `pnpm qa`, el agente recibe «has perdido: has perdido tu base». En el espectador, `capturas-qa/espectador-04-fin-de-partida.png` enseña la nota *ajena*. |
| 6 | #123: ninguna frase de ruta cuenta pasos sin explorar; cuenta lo que pinta `pasosAPintar`, sin una lectura nueva de la niebla | ✅ | `llegadaDeLaRuta(ruta, s.explorado)` llama a `pasosAPintar`, y el trazo (`render/mapa.ts:386`) usa la misma `explorado`. **En vivo, en 5 semillas:** semilla 3, casilla (2,0): 8 pasos, 4 en la niebla, y la barra dice «hoy andas 4 de los 4 pasos que se ven; sigue por tierras desconocidas». Semilla 7, (13,9): 18 pasos, 13 en la niebla, «5 de los 5». Semilla 11, (16,0): 14 pasos, 8 en la niebla, «6 de los 6». Semillas 9 y 1, lo mismo. En ninguna aparecen «llegas hoy» ni el total. Con «Ver mapa entero», en la misma casilla vuelven las frases de siempre: s3 «llegas hoy (8 pasos)», s7 «hoy llegas a 10 de 18», s11 «hoy llegas a 8 de 14». En la captura `capturas-qa-barra/niebla-7.png` el trazo dorado tiene 5 puntos, los mismos que dice la barra. |
| 7 | #123: la barra queda limpia, o al día, al volver el turno, sin mover el puntero | ✅ | Probado en vivo en los cinco caminos (de `pasarTurno` el implementador solo había probado el Espacio). **Pasar turno con el botón:** semillas 10 y 1, cinco días seguidos, siempre «» al volver el turno. **Cambiar de héroe:** contraté un segundo héroe por la interfaz, señalé una ruta con niebla y pulsé el botón del otro héroe, en las semillas 3, 7 y 11: «» (y el panel pasa de «Aldo de Valdeluz» a «Capitán de Valdeluz»). **Acabar una batalla con «Continuar»:** batalla manual (Espacio hasta el final) en las semillas 5 y 9: «» tras Continuar, de vuelta en el mapa. Con «Resolver sola» (semillas 3, 5 y 9) también queda «». **Reiniciar:** partida perdida de verdad (semilla 10, día 3; semilla 1, día 5). La barra dice «Derrota: has perdido tu base.» y, tras «Partida nueva», «». **Lo que escribe la sesión se queda:** el «Derrota…» del final sobrevive a `olvidarRuta`. Consola sin errores en todas las pasadas. |
| — | Frase de la barra elegida por el usuario | ✅ | El literal coincide: «hoy andas N de los M pasos que se ven; sigue por tierras desconocidas». Ver H3 sobre cómo se lee junto al resto de la barra. |
| — | `pnpm banco` con ancla `020ccc58…` | ✅ | `sha256: 020ccc584552b1bae38d02cbc57879a488d5c39c08b20b51ab28eafc1ab27e36`, 67071 líneas, 0/200 sin terminar, «ancla: igual». Exit 0. |
| — | `pnpm capturas` | ✅ | Exit 0, «sin errores en consola», 45 capturas en `docs/agents/2026-10-06-agente-pequenos/capturas-qa/`, 188,2 s. Su pasada del fin dice «fin: día 9, la barra dice «Partida perdida»… perdida por lost_base». Después, `git status` no tiene cambios ajenos al diff (el borrador de la arena se retiró). |

Las ejecuciones propias de #128, en tres tandas:
```
PASA    Ana​Bo (ZWSP dentro) · Ana+U+E0041 U+E0042 (etiquetas ocultas) · Ana­Bo
PASA    U+0378 (sin asignar) · U+E000 y U+F0000 (uso privado) · U+FFFF, U+FDD0 (no-caracteres)
PASA    U+D800 suelto · Ana+U+D800 · U+FFFC · U+FFFD · a + 39×U+0301 (zalgo) · U+1F3FB solo
RECHAZA U+2028 solo   «…es una sola línea, sin saltos, caracteres de control ni marcas de dirección | …no puede ir en blanco…»
RECHAZA U+034F (CGJ)  «…no puede ir en blanco… | …no puede empezar por un acento o una marca suelta»
```

## Hallazgos

Ninguno bloqueante. Ninguno importante.

**H1 (menor): `lineaLegible` deja pasar puntos de código que no se leen.** Un nombre con uso privado (U+E000, U+F0000), un punto sin asignar (U+0378), un no-carácter (U+FFFF, U+FDD0) o un sustituto suelto (U+D800, que JSON admite como `"\uD800"`) entra como nombre de héroe o de pueblo. Según la fuente, se pinta como un cuadradito, como «�» o vacío. El criterio 9 pide «en general… lo que se pinta en blanco». En Chromium esto se pinta casi siempre como cuadradito y no en blanco, así que es un borde del criterio, no un incumplimiento. *Reproducción:* `responseSchemas.hero_from_troop.safeParse({ name: '', story: 'x', heroType: 'lich' })` → `success: true`. *Qué esperaría quien juega:* que el nombre del héroe que crea el agente se lea. *Arreglo posible:* añadir `\p{Co}\p{Cn}\p{Cs}` a la regla 1, o al menos a la 2.

**H2 (menor): lo invisible *dentro* de un nombre pasa.** «Ana​Bo» se ve como «AnaBo», así que dos héroes o pueblos pueden tener nombres que se ven iguales y son distintos. Las etiquetas U+E0020–E007F detrás de un texto visible ocultan texto ASCII («Ana» + U+E0041 U+E0042 pasa). Es lo que se conoce como *ASCII smuggling*: lo lee otro modelo y no la persona. Queda fuera de la lista del issue, y prohibirlo en general rompería la bandera de Escocia, que lleva etiquetas. Lo anoto como decisión pendiente, no como fallo.

**H3 (menor, de experiencia): la barra dice dos veces «tierras desconocidas».** Cuando el destino está en la niebla, que es el caso de las cinco semillas que probé, se lee «Tierras desconocidas · hoy andas 4 de los 4 pasos que se ven; sigue por tierras desconocidas.» (semilla 3, casilla (2,0)). Además, «hoy andas 4» se lee como «hoy solo andas 4», cuando en la semilla 3 el héroe anda 8 hoy, los 4 últimos en la niebla. Es la frase que eligió el usuario y es coherente con no delatar la niebla, pero conviene enseñársela con este ejemplo. *Reproducción:* `?seed=3`, poner el puntero en (2,0) sin pulsar.

**H4 (menor, de texto): la nota repite «has perdido».** «— has perdido: has perdido tu base.» (`POR_QUE_ACABO.lost_base.perdida`). Se lee mejor, por ejemplo, «has perdido: cayó tu base».

**H5 (menor, de documentación): `historia.md` dice algo que no es verdad del espectador.** La «Diferencia deliberada» dice que «el lateral y el espectador siguen diciendo solo "La partida ha terminado"». Pero el espectador recibe `notaFinDePartida(state, SIN_BANDO)` (`partida.ts:134`) y enseña la causa: `capturas-qa/espectador-04-fin-de-partida.png` dice «Gana el jugador 0 (knight) — el último eliminado se quedó sin base.». Lo único que no la dice es el lateral del cliente cuando quien mira no tiene bando. `implementacion.md` (A2) repite la misma afirmación.

**Observaciones que ya estaban antes y no son de este diff** (ninguno de los ficheros implicados cambia en esa parte):
- Con la partida terminada, al pasar el puntero por el mapa la barra cambia «Derrota: has perdido tu base.» por la descripción de la casilla («Aldo de Valdeluz.», semilla 10, día 3). El lateral sigue explicando el final (`capturas-qa-barra/final-puntero-10.png`).
- Si se pulsa «Continuar» mientras suena la última animación de la batalla, sale «Espera a que termine la jugada.» y el clic no hace nada (semillas 5 y 9, batalla manual). Hay que volver a pulsar.

## Workarounds usados

- **Contraté el segundo héroe abriendo el castillo desde el botón del lateral.** Al pulsar la base en el mapa, el héroe seleccionado anda hasta ella, que es el comportamiento normal del juego. No afecta al usuario: es otra de las formas de abrir el castillo.
- **Para encontrar casillas usé el espejo `Session` con la misma semilla.** Es el método de `pnpm capturas`. Sirve para saber dónde está una ruta con niebla, no cambia lo que ve la página, y lo que comparo es el `#status` de la página.
- **En la batalla manual, pulsé Espacio hasta el final.** Así es como juega una persona con prisa. No hay estado sintético.
- **La partida perdida se jugó de verdad,** pasando turno con el botón hasta que la IA tomó la base. Antes, el espejo sirvió para elegir las semillas más cortas: la 10 acaba en el día 3 y la 1 en el día 5.

Los guiones están en `qa-barra.ts` y `qa-final-rapido.ts`, en la carpeta del ciclo, y las capturas en `capturas-qa-barra/`. Están fuera de lint y de tsc, que solo miran `src`, `test` y `tools`.

## No probado

- **La rama `nothing_left` con un final real**: hoy solo se alcanza en estados de prueba (`Player.base === null`). Solo se cubre por tabla.
- **«La causa del perdedor cuando hay varios eliminados»** (3 jugadores, el agente cae antes que otro). No se puede distinguir hoy: la única causa alcanzable es `lost_base`, así que las dos causas son la misma.
- **Un nombre con Unicode raro enviado por MCP de verdad.** El esquema es el mismo que valida `agent-link.ts:257`, y `pnpm qa` ejercita esa puerta con nombres buenos. No mandé uno malo por el WebSocket.
- **La barra en pantalla táctil** (el «Toca otra vez para ir» seguido de pasar turno). Por código, `fraseDeLaRuta` se actualiza con el sufijo y lo borra igual. No lo ejercí.
- **Cómo pinta Chromium** U+E000, U+0378 y U+D800 en el panel del héroe. H1 se basa en cómo se comportan las fuentes en general, no en una captura.

## Veredicto

**Apto con reservas.** Los tres issues están cumplidos tal como se pidieron. #126 no repite ids. #123 da la causa en los tres desenlaces, y la barra ni cuenta pasos de la niebla ni se queda con la frase vieja en ninguno de los cinco caminos (pasar turno, cambiar de héroe, acabar batalla, reiniciar y partida terminada). #128 rechaza la lista y sus parientes con su motivo, y sigue dejando pasar «Peña», los emojis compuestos y las banderas. Las reservas son menores: H1 y H2, bordes de Unicode fuera de la lista; H3 y H4, cómo suena el texto; y H5, una frase falsa en `historia.md` sobre el espectador.
