# Hallazgos de `/simplify` — el agente defiende y responde

Cuatro revisores (reutilización, simplificación, eficiencia/concurrencia,
altitud) sobre el diff sin commitear. **Deduplicados y decididos**: donde se
contradicen, la decisión está tomada abajo y razonada.

Lo que los cuatro dieron por bueno, para que no se toque: la frontera
`core ⇏ src/server` bien puesta y su guardia cubriendo las tres formas de
colarla; `battleOwners` como generalización correcta (el defensor `null` del
monstruo no es un caso especial); el contrato «si te la quedas, la cierras»
verificado releyendo `state.pendingBattle` en vez de con un booleano; medir el
maná gastado en vez de deducirlo; `game_over` como mensaje del protocolo y no
como un `close` interpretado. Y **ninguna promesa del buzón queda sin resolver
ni se resuelve dos veces** por un camino alcanzable — se buscó expresamente.

---

# Parte 1 · Cuelgues y contrato roto (lo caro)

## A · El `game_over` se tira si en ese instante no hay agente atado

`ws-server.ts:135` manda el aviso; `AgentLink.send` (`agent-link.ts:128-131`)
hace `if (this.socket === null) return;`. **Un puente que conecta o reconecta
después de que la partida acabe no lo recibe nunca**, y su `heroes_listen` se
bloquea para siempre.

Es **el cuelgue que este ciclo vino a cerrar, intacto**, en el único camino donde
el agente no puede diagnosticarlo: reinicio de la sesión, caída del puente en los
últimos turnos.

**Arreglo:** guardar el mensaje en `AgentLink` y reenviarlo desde `attach()`.

## B · El plazo agotado rechaza sin decírselo al agente

`agent-link.ts:162-165` y `failAll` (`:133`) borran el pendiente y rechazan **sin
mandar ningún `result`**. El agente pierde el turno y su siguiente escucha no
trae una línea sobre ese `requestId`.

Rompe de frente la decisión del usuario de **informar siempre**: es el silencio
ambiguo, en el caso donde más importa distinguir «se perdió» de «llegó tarde».

**Arreglo:** mandar el `result` con su nota en el temporizador y en `failAll`.

## C · `corta()` vacía las consultas y deja las peticiones caducas

`buzon.ts:73-83`. Las `request` encoladas son de una ejecución del servidor que
ya no existe. Tras reconectar, `espera()` entrega **primero** la caduca: el
agente gasta una decisión entera en ella, el servidor nuevo la descarta con
«respuesta a una petición que ya no existe», y la petición real espera detrás
hasta agotar los 300 s de `ask` y caer en la heurística.

**Arreglo:** `this.pendientes.length = 0;` dentro de `corta()`. `fin()` no lo
necesita: `espera()` cortocircuita en `terminada`.

## D · Un `heroes_listen` relevado se lleva la cola de veredictos

`mcp/server.ts:188-204`. Al llegar una segunda escucha, la primera despierta con
`corte`, ejecuta `veredictos.recoge()`, se lleva **todos** los veredictos
pendientes y los devuelve marcados `isError: true` con un texto que dice que esa
llamada ya no vale. **La escucha buena recibe `''`.**

**Arreglo:** recoger solo en las ramas `peticion` y `fin`, nunca en `corte`.

## E · `Buzon.consulta` no da plazo a nada

`AgentLink` da plazo a cada petición; el buzón no. Un `query_result` que no
llegue **con el socket vivo** deja la promesa colgada para siempre: la misma
clase de cuelgue que este ciclo cierra, en el único camino que no se revisó.

## F · Si el turno del rival revienta, el tablero queda muerto y mudo

`session.ts:192-209` y `main.ts:302,356`. El `finally` restaura la bandera pero
**nadie escribe `this.status`**, `state.current` se queda en la IA, el botón
sigue deshabilitado y el fallo solo sale como `unhandledrejection` — porque
`void p.finally(cb)` re-lanza. `moveHeroTo` ya trata su error bien; `endTurn` no.

**Arreglo:** `catch` en `endTurn` que escriba el motivo en `status`. Y el
`.finally(() => { needsRender = true; })` de los dos manejadores es redundante
con el `needsRender = true` que ya ejecutan: se va.

## G · Tras una desconexión, se esperan 120 s **antes de cada turno**

`ws-server.ts:101-113` sondea `link.connected` cada 500 ms hasta
`WAIT_FOR_AGENT_MS`. Si el puente muere a mitad, **cada turno restante del agente
se para dos minutos** antes de caer en la heurística: una partida de 200 días se
vuelve horas de nada.

**Arreglo:** esperar solo si no ha conectado nadie **nunca**, o resolver la
espera desde `agentServer.on('connection')` en vez de sondear.

---

# Parte 2 · Una sola redacción de cada cosa

## H · El «no/NO» es *load-bearing* y hay un test que clasifica al revés

`notas.ts:49-61` tiene tres ramas donde caben dos: las dos primeras dicen lo
mismo y solo difieren en una coletilla de maná… **y en que una escribe `NO` y la
otra `no`**. Esa diferencia sostiene un detector de otro fichero:
`agent-link.test.ts` usa `/[^O] ha consumido el turno/`, y **ejecutado sobre un
`cast` con 0 de maná da `true`** — el test cuenta como «gastó el turno»
exactamente el caso que la nota existe para no afirmar.

**Arreglo:** dos ramas, `NO` siempre en mayúsculas, y arreglar el detector del
test. `notas.test.ts:63` usa `/i`, así que sigue verde.

## I · La prosa que lee el agente tiene cinco autores

`agent.ts` · `notas.ts` · `agent-link.ts:176-180` · `buzon.ts:147-165` ·
`mcp/server.ts`. No es tono repetido, son **hechos concretos escritos varias
veces**:

- «juega la IA de reglas en tu lugar» → **cuatro redacciones**.
- «`cast` no consume el turno» → la regla vive en `battle.ts:430` y está
  reescrita en prosa en dos sitios más. Si `cast` cambia, hay que tocar tres
  ficheros y dos no salen en ningún test de reglas.
- «no tienes que deducir de un silencio si coló» → dos.
- «las descartadas NO se reintentan solas» → dos.

`notas.ts` se presenta como «lo que se le cuenta al agente» y contiene el 40 %.

**Arreglo:** `notas.ts` es dueño de cada frase; los demás la llaman. **Alcance
acotado a los hechos duplicados de la lista** — no hace falta mover todo el
`RESPONSE_FORMAT`, que cumple otro papel (anunciar antes, no reportar después).
Exportar además los dos prefijos que el agente reconoce (`FIN DE LA PARTIDA`,
`SE HA PERDIDO LA CONEXIÓN`), hoy reescritos a mano en cuatro sitios: si se
cambia la frase, `pnpm qa` muere por el camino largo señalando el sitio
equivocado.

## J · Tres redacciones de «no es tu turno», y la buena no se ve nunca

El núcleo escribe `todavía no es tu turno: ahora juega <nombre>`
(`game.ts:333`); el cliente escribe otras dos (`session.ts:480` y `:124`). Como
`run()` comprueba antes, **la del núcleo no se muestra jamás**, y es la única que
dice quién está jugando.

**Arreglo:** `turnBlocker(state, quien): string | null` junto a `buildBlocker`,
consumido por `applyAdventureAction` y por la puerta del cliente. El cliente
enseña, no redacta. Es el precedente que este mismo fichero ya sigue dos veces
con `castBlocker`.

## K · El rechazo que ve el agente es el mensaje menos accionable del sistema

`director.ts:239` describe una acción de batalla como `ataque a d0`, pero la de
aventura (`notas.ts:117`) devuelve **`action.type` a secas**: el agente recibe
`move_hero: no hay camino`, sin héroe ni destino, con cuatro `move_hero` en el
mismo turno. El turno ya se fue y no se reintenta solo.

**Arreglo:** un solo `describeAccion` que cubra las dos uniones.

## L · `notaFinDePartida` reimplementa tres consultas del núcleo y duplica el resumen

`notas.ts:102-113` hace a mano lo que ya hacen `playerById`, `townsOf` y
`heroesOf` (`game.ts:137,155-161`) — y `playerById` además **lanza con mensaje**
en vez de degradar a `jugador ${id}`. Y el resultado se solapa con
`ws-server.ts:143-153`, que imprime la misma frase **doce líneas después** de
llamar a `notaFinDePartida`.

## M · Falta el compañero de `battleOwners`, y las dos copias ya discrepan

`director.ts:79-87` y `consultas.ts:31` derivan «¿qué bando es mío?» por su
cuenta. **Hoy no coinciden** cuando un jugador lleva los dos bandos: uno devuelve
los dos, el otro se queda con `attacker` por ser el primero del array. Ese caso
existe: `agentPlayers` acepta varios jugadores.

**Arreglo:** `sidesOwnedBy(state, pending, players): ReadonlySet<Side>` junto a
`battleOwners`, y un `SIDES` junto a `export type Side` — el literal
`['attacker','defender']` está también a mano en `battle.ts:282`.

---

# Parte 3 · Maquinaria que sobra

## N · El tope de 40 veredictos es inalcanzable — y el error es mío

**Yo le pedí al ingeniero que lo redimensionara** al decidirse «informe siempre».
El revisor lo desmonta: el servidor solo manda `result` en respuesta a un
`response`, y `heroes_respond` exige un `enCurso` que solo pone `heroes_listen`
— **una respuesta por escucha**, así que como mucho caben **dos** entre dos
lecturas. La cola nunca llega a 40, nunca poda, `descartados` nunca pasa de 0 y
su coletilla no se imprime jamás.

**Arreglo:** tope como una línea sin contabilidad, y fuera `descartados`, la
coletilla, el getter `pendientes` y el test que fija ese estado imposible.

## O · Otras cuatro de una o dos líneas

| Dónde | Qué |
|---|---|
| `director.ts:124,129,161` | `intentadas` es exactamente `aplicadas + problems.length`. Dos contadores que subir en el orden correcto en un bucle con `continue`; el día que entre un `break`, mienten |
| `buzon.ts:78-82` | Rama muerta en `corta()`: `terminada !== null` implica `esperando === null`, así que el ternario y su comentario **no pueden ejecutarse** |
| `director.ts:72-76` | `takeover` envuelve a `playBattle` ignorando `ctx` y repitiendo su comprobación de nulo. Que `playBattle()` no reciba parámetro y calcule dentro |
| `mcp/server.ts:33` | `enCurso` es un global fuera de `Buzon`, y cada uso combina los dos (`enCurso !== null && !buzon.haTerminado`). Meterlo dentro y las tres condiciones colapsan |

## P · `quien?` deja la autorización en opt-in

Los dos revisores que lo miran coinciden en que **opcional en las dos capas no
compra nada**; discrepan en el remedio. **Decisión: obligatorio.** Es lo que
encaja con «cerrar por los dos lados», que es lo que el usuario aprobó, y con un
repo fail-loud: una comprobación que se apaga sola al olvidar un argumento es la
única que no avisa de que falta. Los llamantes ya lo pasan todos.

## Q · Tests

- `agent-link.test.ts:559-579` copia el fixture **y las aserciones** de
  `notas.test.ts:76-91`. Lo único suyo es que el mensaje viaja por el cable: que
  compruebe eso y nada más, sin construir un `GameState`.
- `agent-link.test.ts:344-357` es copia literal del montaje de `:218-231`. Falta
  el hermano mudo de `montar` (`:37`), que es quien registra en `abiertos` para
  que `afterEach` cierre los puertos.
- `session.test.ts:13` está subsumido por `:27`, que además ejerce la reentrada.
- El helper nuevo `respira` no se aplicó a las dos esperas a mano que ya existían.

## R · El arnés de QA

`terminar()` nunca llama a `client.close()`, así que el hijo `npx tsx
mcp/server.ts` queda suelto hasta que su stdin da EOF. Y `pararServidor` puede
señalar un pid ya recogido: una guarda `vivo` cuesta dos líneas.

**Sobre el incidente de los procesos:** el revisor buscó expresamente y **no
consiguió construir un camino en este fichero que mate un proceso ajeno**. El
matar-grupo está bien acotado por `detached`. El incidente vino de un barrido
manual, no del script.

---

# Lo que NO se toca

- **El contagio de `async` no se rehace.** Un revisor propone un generador
  síncrono en `core` que lo habría evitado entero, y tiene razón en el análisis:
  con él caerían la bandera, la guarda duplicada y la tercera redacción. **Pero
  el usuario eligió el contagio con esa alternativa delante**, y el resultado
  está verde. Queda escrito aquí para quien lo lea en seis meses.
- **La bandera de reentrada se queda.** Dos revisores midieron que la ventana
  **no es alcanzable hoy** desde el navegador —sin `takeover`, `playAiTurn` no
  ejecuta ningún `await` y todo se resuelve en microtareas—, pero los dos
  recomiendan conservarla: el día que el cliente hable por WebSocket, es lo único
  que sostiene los tres cierres. **Es prevención, no arreglo, y así hay que
  contarlo.**
- **Los seis `'attacker'` cableados del cliente**: preexistentes y fuera de este
  racimo. Van al backlog, con el matiz de que el nudo está desatado para el
  agente y sigue atado para la persona.
- **El pathfinding**: `reachableCosts` + `findPath` son **el 77 % del barrido**,
  y aproximadamente la mitad es recorrer dos veces el mismo grafo desde el mismo
  origen. Preexistente y grande: va a issue con la medida.
- **`legalActions` rehaciendo la BFS por enemigo**: medido **220 µs → 54 µs,
  ×4,0**, con las mismas 50 acciones. Es **#48**, que ya está abierto: se le
  añade la medida y no se toca aquí.
