# Hallazgos de `/simplify` sobre la fase 1 (guarnición y defensa)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff de la fase 1.
Deduplicados y decididos por el coordinador. Las líneas son las del worktree al revisar
(04-11-2026); pueden haberse movido.

Regla para quien aplica: **no cambia lo que el juego hace salvo donde se dice** (S7, S8). Si
`pnpm banco` cambia en cualquier otro punto, es un fallo de la refactorización: se busca, no se
re-ancla.

## Se aplican

**S1 · Una regla de guarnición hostil** (los cuatro revisores). El predicado
`g !== undefined && g.dueño !== player && g.tropa.length > 0` está a mano en
`game.ts:2338` (`guarnicionesAjenas`), `game.ts:2643` (`enemyAt`) y `ai/strategy.ts:123`
(`objectValue`), y `queLoCierra` (`game.ts:2468`) lo mira sin dueño. El docstring de
`guarnicionesAjenas` dice que la usa `enemyAt` y no es verdad. → un `guarnicionHostil(state,
sitio | id, player)` en `sitios.ts` (el único que interpreta `guarniciones`) que leen los cuatro.
Las ciudades siguen por su camino de hoy (ver D1).

**S2 · La defensa por elegir vive en la batalla pendiente, no en la crónica** (altitud 2,
simplificación 3, eficiencia 1). `defensaPosible` (`game.ts:3201`) compara el último
`defense_set` con el último `battle_started` y recalcula `sitioDelHeroe`: la legalidad depende del
orden de los hechos y recorre la crónica entera. → `dejarPendiente` guarda `DefensaElegida
{ hero, sitio }` en la `PendingBattle` (p. ej. `defensa?`); `defensaPosible`, `defensaPorElegir`,
`defensaBlocker` y `elegirLaDefensa` la leen de ahí; `defense_set` solo lo cuenta. Fuera
`ultimoIndice` si se queda sin uso. Arreglar el docstring de `DefensaElegida` (habla de «con
cuántos dentro y fuera», el tipo no lo lleva).

**S3 · Los dos cupos, en la puerta** (altitud 1). `repartir` (`sitios.ts:223`) «no juzga los
cupos» y lo comprueban a mano `intercambioBlocker`, `ejercitoDeLaDefensa` (`:481`) y
`defensaDeLaIA` (`:400`). → `repartoBlocker(state, hero, sitio, enElHeroe)` en `sitios.ts` (el
héroe con `capacidadDe`, la guarnición con `cupoDeLaGuarnicion`); `repartir` lanza con él
(fail-loud en la puerta) y los tres lo usan como su «¿vale este reparto?». Es el agujero que hizo
lanzar a `createBattle` días después (desviación 2): el próximo que escriba por `repartir` (fase 3,
la IA que deja tropa) no debe poder reabrirlo.

**S4 · Las reglas de la pantalla de la defensa, al núcleo** (altitud 3, simplificación 4-5,
reutilización 5-6, 9). `Session.defensa` (`session.ts:1738-1780`) escribe `motivoMenos` en el
cliente, copia `cupoDelHeroe` (`tope - 1`) y `heroLeadership` a mano, construye la tropa con
`flatMap`/`reduce` y recalcula `lineas()` una vez por fila; `unoMasEnLaDefensaBlocker` rehace
`todos` y `hay`; la vista (`guarnicion.ts:84`) decide además cuándo ocultar `motivoMas`. →
`defensaPorElegir(state, player, pedida?)` devuelve las filas con `hay`, `pelean`, `motivoMas` y
`motivoMenos` ya escritos por el núcleo, lo ocupado y los cupos (`capacidadDe`); la sesión solo lo
pinta y la vista enseña el motivo que le den. `unoMasEnLaDefensaBlocker` se integra ahí (o es
`ejercitoDeLaDefensa` con uno más de ese tipo). Lo de «entre los dos» (`[...hero.army,
...guarnicionDe(...)]`, cinco veces) sale de un helper de `sitios.ts`, y los ejércitos por tipo de
`ejercitoDe`/`individuosDe` (`hero/troop.ts`).

**S5 · Perder o entregar el sitio, una vez** (altitud 6, reutilización 2-3, simplificación 7).
`applyVictory` ramifica por `sitio.kind` dos veces (`:3725-3733` rama `hero`, `:3745-3752` rama
`guarnicion`) y la rama del héroe lee `state.guarniciones[...]?.dueño` a pelo; `guardadaPor`
(`:2973`) duplica `guarnicionDe` + `dueñoDelSitio`; `lugarDelRival` (`:3007`) hace su propio
`map.objects.find` con su propio error. → un `entregarElSitio(state, sitio, ganador)` (ciudad →
`captureTown`, paso → `captureNode`, pueblo → `quitarLaGuarnicion`) que llaman las dos ramas;
`dueñoDelSitio` donde se pregunta de quién es; `casillaDelSitio(sitioPorId(...))` en
`lugarDelRival`.

**S6 · Un vocabulario para dejar y recoger** (simplificación 2, reutilización 8). Cuatro:
`'dejar' | 'recoger'` (sesión), `'guarnicion-dejar' | 'guarnicion-recoger'` (`main.ts`),
`HaciaDonde` (`sitios.ts`) y la acción. → el tipo de la acción (`'dejar_tropa' |
'recoger_tropa'`) de punta a punta: `intercambioBlocker`, `moverTropa`, la sesión, las filas de la
vista y el `data-*` del botón. Fuera `HaciaDonde` si queda sin uso. «Un grupo → un pedido»
(`pedidoDeUno`, `session.ts:3744`) pasa a `sitios.ts` y lo usa también `planIntercambios`, que
agrupa con `troopSummary` en vez de su `Map` propio.

**S7 · Una regla de a quién se escoge** (reutilización 7). `ejercitoDeLaDefensa`
(`sitios.ts:452-458`) ordena por experiencia con su propio desempate; `elQueSeIria` desempata
además por las piezas puestas, así que la defensa y `recoger_tropa` pueden escoger a individuos
distintos con la misma experiencia. → los que pelean de cada tipo salen de
`licenciar(deEseTipo, creature, hay - count).queda` (`hero/troop.ts:404`). **Cambia** a quién se
escoge en un empate: si mueve el banco, se re-ancla diciendo qué semillas y cuál es el primer hecho
distinto.

**S8 · La IA recoge cuando llega, no «salvo el día 1»** (altitud 4). `planIntercambios`
(`strategy.ts:488`) recoge siempre que el héroe esté parado en un sitio suyo, salvo en su base el
día 1: el día 2, un héroe que se queda en casa la vacía igual, y la excepción existe solo para que
no cambie el banco. → atar la recogida a lo que la provocaba antes de esta tarea: el héroe que
**acaba hoy su marcha** en el sitio y el que **se contrata** en él (el nacido en su base no la
recoge: decisión del 22-10-2026). Con la defensa elegida, la guarnición pelea aunque no la lleve,
así que el que se queda en casa no la necesita. Si el banco cambia, se re-ancla con la forma del
diff explicada. Si resulta que no hay manera limpia de saber «llegó hoy» sin estado nuevo, se
para y se escribe en `implementacion.md` en vez de inventarlo.

**S9 · El pedido de tropa, discriminado en el núcleo** (altitud 7). `PedidoDeTropa` lleva
`veterano` opcional con `creature` y `count` que obligan a dos rechazos que solo existen por la
forma (`sitios.ts:287-292`). → en el núcleo, `{ creature, count } | { veterano }` (tipo y cantidad
del veterano, de su hoja); el contrato del agente sigue como está (`veteran` opcional, como
`equip`) y `accionDelAgente` traduce. Los dos rechazos se van; si el agente manda `veteran` con un
`creature` que no es el suyo, el motivo se escribe al traducir.

**S10 · Lo que sobra en la sesión** (simplificación 6, reutilización 5, 10). Fuera
`FilaDeLaGuarnicion.veterano` (es `grupo.veterania?.id`) y su spread; fuera
`VistaDeLaGuarnicion.sitio` si nadie lo lee; las dos columnas de liderazgo salen de
`Session.liderazgo`, extendida para aceptar un sitio (hoy la guarnición de la ciudad usa
`GARRISON_LEADERSHIP` y la vista nueva `cupoDeLaGuarnicion`: una fuente); `troopUnit(...).name` →
`unidadDelJuego(...).name`.

**S11 · La vista y su CSS** (simplificación 8-9, reutilización 10). `views/guarnicion.ts` escribe
`aria-disabled="true" class="apagada"` y el motivo a mano siete veces y el botón «Defender» dos
veces enteras. → el helper de lo apagado que ya hay (`motivoApagado`, `views/cifras.ts:29`, o el
patrón de `views/lugar.ts`), un solo «Defender». `style.css:252-271` repite el bloque de
`.salir-al-menu` y lo apagado de `.opciones-del-lugar`: se añade `.guarnicion` a esas listas de
selectores. `main.ts`: los dos bloques gemelos de abrir/cerrar diálogo, un `mostrarModal(el,
contenido | null)`; la guarda repetida de `playBattleAction`/`autoResolveBattle`
(`session.ts:2946`, `:2985`), un privado con la frase una vez.

**S12 · El contrato, una forma** (simplificación 10). `leave_troops` y `take_troops` son el mismo
`z.object` salvo el literal (`agent.ts:153`, `:160`) y dos tipos en `vocabulario.ts:96-97`. → una
forma compartida y un solo miembro de la unión con `type: 'leave_troops' | 'take_troops'`.

**S13 · `dueñoDelSitio` y la región** (reutilización 4). `sitios.ts:158` escribe a mano
`estructura(map).regionDe[y * width + x] ?? -1`; es `regionDeCasilla` (`state/asaltantes.ts:134`).
Se usa **si no crea un ciclo de importación**; si lo crea, se deja y se dice.

## Se descartan a conciencia

- **Unificar también las ciudades en `guarnicionHostil` y en el valor de la IA** (altitud 5): la IA
  ataca una ciudad con `miPoder < guarnicion * 1.1` y un paso con `ventajaClara`, y valora 0 el
  pueblo ajeno guarnecido. Unificarlo cambia cómo decide la IA, que no es esta refactorización.
  Lo toca la fase 2 (muralla en ciudad y pueblo); queda anotado allí.
- **Un campo común `sitio.objeto`** para quitar dos de los tres `switch` de `idDelSitio`,
  `casillaDelSitio` y `nombreDelSitio` (simplificación 7): valor menor y toca el tipo que la fase 2
  va a ampliar.
- **`intercambioBlockerEn` con el sitio ya resuelto** (eficiencia 4): ~14 barridos de
  `map.objects` por repintado del diálogo, que solo se repinta al cambiar la partida. Despreciable.
- **`guarnicionesAjenas` recorriendo `state.guarniciones`** en vez de `map.objects` (eficiencia 2):
  menos del 1 % frente al Dijkstra de la misma llamada, y pediría guardar `at` en la guarnición.
- **`recogerLoQueQuepa` en cada pasada** (eficiencia 5) y **el coste de `defensaDeLaIA`**: menos
  del 1 % de la pasada; n ≤ 14.
- **`esSuBase`** (dos revisores, dudoso): con S8 probablemente desaparece; si no, se queda.
- **El getter `guarnicionAbierta`**: patrón aceptable.
