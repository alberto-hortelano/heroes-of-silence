# QA · que `state.finished` deje de mentir, y el arnés deje de sondear

Validado sobre el árbol pendiente de `main` (`405559c` + `git diff HEAD` + los dos
ficheros sin indexar). **No se ha tocado una línea de código del repositorio**: las
sondas se corrieron en un `git worktree` aparte con el parche aplicado, y al terminar
`git status` da exactamente las mismas 26 entradas que al empezar.

---

## Criterios

Los criterios son los de `requisitos.md` **después de la corrección tras la crítica**:
#23 solo en sus criterios 4 y 5, #62 entero, #90 como acta y #60 aparcado. Los
criterios 1-3 de #23 (la gracia) **no se evalúan como hechos**; sí se evalúa si lo
que los documentos dicen de ellos es cierto (última fila).

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | El tope de días **baja a `core`** y la regla vive en un sitio | ✅ | `advanceDay` (`game.ts:552-558`) es el único que la aplica; `playAiGame` pierde `maxDias`, `ws-server.jugar()` pierde `día <= MAX_DAYS`, `partidas.ts` lo pide en `newGame`. Sonda: `newGame({seed:1235,maxDays:N})` da `maxDays=1 → day=1`, `maxDays=2 → day=2`, `day_start=[1]`/`[1,2]`, último hecho `game_over`, 0 eliminados |
| 2 | Al agotarse los días **`state.finished` deja de mentir** | ✅ | Servidor real con `HEROES_MAX_DAYS=3`: `fin={"winner":null}`, nota «La partida se ha quedado sin resolver tras 3 días: no gana nadie». Test nuevo `game.test.ts` «cuando se acaban los días la partida TERMINA» |
| 3 | `partidaTerminada` **se muere** con su comentario | ✅ | `grep -rn partidaTerminada src/` → una sola aparición, dentro del docstring de `GameState.finished` que cuenta por qué existió |
| 4 | El `winner: number \| null` de `protocol.ts` sobrevive con su docstring al derecho | ✅ | `protocol.ts:86-95`; el espectador lo lee sin cambiar de comportamiento |
| 5 | `HEROES_MAX_DAYS` y `DIAS_POR_DEFECTO` siguen valiendo | ✅ | `HEROES_MAX_DAYS=3` corta la partida el día 3 (log del servidor); `pnpm banco 20 5` corre con tope 5 |
| 6 | #62 · el arnés espera el anuncio **cuando llega**, con tope y fallo ruidoso | ✅ | `pnpm qa` 3,12 / 3,11 / 3,12 s, exit 0. Fallo ruidoso comprobado por mí: `HEROES_SEED=abc pnpm qa` → «el servidor de la partida ha muerto (código 1)» en **1,08 s**, no en los 15 s del tope |
| 7 | #62 · se mide antes y después, tres pasadas | ✅ | Medido **por mí y sobre el mismo código** (arnés de `HEAD` en el worktree con el `src` nuevo): **antes 5,48 / 5,39 / 5,39 s**, **después 3,12 / 3,11 / 3,12 s**. Rangos sin solaparse |
| 8 | La cobertura de `pnpm qa` **no baja** | ✅ | Las tres líneas de cobertura son **idénticas** en las dos versiones: `19 veredictos, 19 entraron, 0 descartadas`; `battle_state, building_list, creature_stats, game_state, map, spell_list`; `1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla`. Y las tres pasadas de después son byte a byte iguales entre sí (normalizando el puerto efímero) |
| 9 | `pnpm verify` **418 tests** | ✅ | `Test Files 18 passed (18) · Tests 418 passed (418)`, dos veces |
| 10 | `pnpm banco`: el ancla **no se mueve** | ✅ | `297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767`, `32177` líneas, `sin terminar 0/200 → []`, `ancla: igual`, 1627 ms |
| 11 | `barrido-semillas` **0/40** | ✅ | `sin terminar: 0/40 → []`, `batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100` |
| 12 | Ningún guardia **verde por construcción** | ⚠️ | Banco y barrido **sí miden**, reproducido por mí: `pnpm banco 20 5` → **18/20**, `barrido 8 5` → **7/8**. Pero queda una premisa caducada en `test/cronica.test.ts` (hallazgo **I2**) y un cambio sin guardia (**m6**) |
| 13 | Los guardias nuevos muerden con formas que no eligió su autor | ✅ | 4 sondas sobre `Desenlace` (añadir, renombrar, quitar, ensanchar): las tres tablas rojas en las cuatro. 27 formas contra `enteroDelEntorno`. 3 sondas sobre la regla del núcleo. Detalle abajo |
| 14 | El empate **visto por quien mira** no dice «derrota» en ninguna parte | ✅ | Navegador, espectador contra `HEROES_MAX_DAYS=3`: barra «Terminada sin ganador», panel «Fin de la partida» + la nota, crónica cerrando en `<div>Fin de la partida</div>` **sin clase**, `0` líneas `lose`. Consola: 3 mensajes, ningún error |
| 15 | El empate **visto por quien juega** (barra «Partida sin resolver») | ⚠️ | **No probado en el navegador**: el cliente no pide tope (juega a 200 días) y no expone la sesión en `window`, así que no hay forma de llegar sin tocar código. Cubierto por `test/paneles.test.ts` (los cuatro rótulos) y por el análogo del espectador, ese sí visto |
| 16 | El agente por MCP recibe su `game_over` con `winner: null` y **lo entiende** | ✅ | Agente falso sobre el cable real (`ws://localhost:9881`): `GAME_OVER RECIBIDO → winner=null` + `note: La partida se ha quedado sin resolver tras 3 días: no gana nadie…`. El puente solo usa `note` (`mcp/server.ts:125 → buzon.fin(msg.note)`), así que lo que lee el modelo es esa frase |
| 17 | El espectador **conectándose después del final** se entera | ✅ | Recarga con la partida ya acabada: barra «Terminada sin ganador», panel y crónica completos. Y por el cable, con un mirón de usar y tirar: `snapshot 1: day=3 finished={"winner":null,…}` |
| 18 | El renombrado `puertos.ts → entorno.ts` no deja cabos | ⚠️ | `vite.config.ts` importa bien y `npx vite build` compila (42 módulos, 347 ms). Queda **una** cita muerta: `CLAUDE.md:1074` sigue diciendo `src/server/puertos.ts` (hallazgo **m3**; lo escribes tú al cerrar) |
| 19 | Lo que los documentos dicen de #90/#60/la gracia **es cierto** | ✅ | `medida-tamano.md` declara sus límites (no controla esquina, ±3,5 puntos, tiempo de esta máquina) y su cifra sin reconciliar (139 vs 123 dragones). `critica.md` y `requisitos.md` coinciden en qué se hace y qué no. Nada de la gracia está implementado: `checkDefeat` sigue siendo el de siempre |

---

## Los guardias, vistos morder por mí

### Las tablas `Record<Desenlace, string>` — cuatro sondas, tres tablas rojas en todas

| Sonda | Qué salió |
|---|---|
| **añadir** un cuarto miembro `'abandonada'` | `session.ts(69,7)`, `session.ts(75,7)`, `panels.ts(52,7)`: `TS2741: Property 'abandonada' is missing` |
| **renombrar** `'sin resolver'` → `'sinResolver'` | los tres sitios: `TS2353: Object literal may only specify known properties` |
| **quitar** `'sin resolver'` del tipo | los tres, más `desenlace.ts(30,24): TS2322` en la propia función |
| **ensanchar** `Desenlace` a `string` | `session.ts(276,7)`, `session.ts(543,29)`, `panels.ts(96,61)`: `Type 'string \| undefined' is not assignable to type 'string'` — cae por `noUncheckedIndexedAccess`, que es la otra mitad del guardia |

Las cuatro muerden. **Lo que no cubren** está en el hallazgo **m8**.

### `enteroDelEntorno` — 27 formas que no están en su batería

Se aceptan (y son correctas, misma familia que el `0x1f` que el test ya declara):
`" 12 "`, `"\t12\n"`, `"+12"`, `"1e3"`, `"1E3"`, `"0b101"`, `"0o17"`.
Se rechazan diciéndolo: `"1_000"`, `"12abc"`, `"Infinity"`, `"-Infinity"`, `"1e400"`,
`"12,5"`, `"١٢"`, `"true"`, `"null"`, `"undefined"`, `"[]"`, `"[12]"`, `"{}"`, `"0xZZ"`.
Dos rendijas, las dos menores: **m7** (`1e21` cuela como tope de días) y la pérdida
silenciosa de precisión por encima de 2⁵³ (`9007199254740993 → …992`).

Y sobre el servidor de verdad, los cuatro rechazos con `exit=1`:

```
Error: HEROES_MAX_DAYS="abc" no es un tope de días: tiene que ser un entero ≥ 1, como 200
Error: HEROES_MAX_DAYS="0"   no es un tope de días: …
Error: HEROES_WAIT_AGENT_MS="abc" no es un plazo de espera: … y 0 es no esperar a nadie
[servidor] la partida ha reventado: Error: HEROES_AGENT_PORT="ochomil" no es un puerto: …
```

### La regla nueva del núcleo — tres sondas

| Sonda | Qué salió |
|---|---|
| quitar el `if (state.finished !== null) return;` de `nextPlayer` | **1 rojo**: `expected { kind: 'turn_start', actor: 0 } to match { kind: 'game_over', actor: null }` |
| `state.day > state.maxDays` en vez de `>=` | **1 rojo**: el mismo test |
| volver a `finishGame(state, vivos[0]?.id ?? state.current)` | **418 verdes**: nadie lo vigila (hallazgo **m6**) |

---

## Hallazgos

### Bloqueantes

Ninguno.

### Importantes

**I1 · El espectador sigue viendo el fin de partida en el rojo de derrota cuando
gana alguien, en la misma pantalla que dice «has ganado».**

La corrección del ciclo arregló la mitad del bug y el test nuevo congela la otra
mitad como correcta. Comprobado en el navegador, sin tocar nada:

```
turn (barra):  "Gana el jugador 1"
nota (panel):  "…Gana el jugador 1 (necromancer) — has ganado…"
crónica:       <div class="lose">Fin de la partida</div>     ← rgb(180, 85, 63)
```

El razonamiento que el propio informe usa para arreglar el empate —«esta línea la
pinta también el espectador, **que no tiene bando**»— vale igual aquí: si por no
tener bando un empate no es su derrota, la victoria del jugador 1 tampoco lo es.
Hoy `desenlaceDe(0, NADIE)` devuelve `'perdida'`, y `test/cronica.test.ts` lo fija
con el comentario «para él toda partida con ganador es ajena».

*Reproducción desde el arranque:* `pnpm dev` en una terminal;
`HEROES_WAIT_AGENT_MS=12000 pnpm partida` en otra; abrir
`http://localhost:3100/espectador/` antes de que se agote la espera; esperar a que
la IA de reglas resuelva la partida (día 10 con la semilla por defecto) y mirar la
última línea de la crónica.
*Lo que esperaba quien mira:* la misma línea neutra que ya sale en el empate, o —si
se prefiere— la de victoria del que ganó. Lo que no cabe es «derrota» para quien no
juega.
*No es una regresión de este ciclo* (antes salía igual, por `clase(mio, !mio)`),
pero es la línea que este ciclo reescribió y el argumento que este ciclo escribió.

**I2 · `test/cronica.test.ts` afirma una regla que este ciclo acaba de romper, y
sigue verde por la semilla.**

El bucle de «cada hecho lleva quién y dónde» dice:

```ts
if (e.kind !== 'day_start') {
  expect(e.actor, `un ${e.kind} sin protagonista`).not.toBeNull();
}
```

con el comentario «`day_start` es además **el único** sin protagonista» — y
`events.ts:118-122` lo repite como diseño. Desde este ciclo hay un segundo:
`game_over` con `actor: null`. Medido sobre el mismo montaje del test:

```
maxDays=200 (lo que corre hoy): hechos sin protagonista = 0
maxDays=5   (mismo mapa y misma semilla): 1 → game_over
```

O sea que el guardia no se ha vuelto tautológico —puede fallar—, pero **su premisa
escrita ya no es cierta** y lo único que lo tapa es que la semilla 9 en 48×48 acaba
por conquista. Es la forma que este repositorio persigue: una afirmación de diseño
que dejó de ser verdad sin que nada se pusiera rojo. La decisión de si `game_over`
sin actor es legítimo ya está tomada y bien argumentada en `finishGame`; lo que
falta es escribirla donde se afirma lo contrario (dos sitios: el test y `events.ts`).

### Menores

**m1 · El docstring de `playAiGame` se contradice a sí mismo tres líneas más
abajo.** Primera línea: «Juega la partida entera con la IA en todos los bandos.
**Devuelve los días.**» Ya no: devuelve `GameOutcome`, y el mismo comentario lo dice
después («Devolver el desenlace y no el día es lo que hace que la postcondición…»).
`src/core/ai/turn.ts:125`.

**m2 · Un comentario apunta a un guardia que no puede alcanzar la rama.** El
`if (state.finished !== null) return;` de `nextPlayer` dice que su omisión es «justo
lo que vigila `invariantes.test.ts`». Quitándolo, `invariantes.test.ts` sigue
**verde**: sus 20 semillas juegan a 200 días y acaban por conquista, así que nunca
pisan la salida por tope. El único que muerde es el test nuevo de `game.test.ts`
(1 rojo, mostrado arriba). El guardia existe; el que se cita, no.

**m3 · `CLAUDE.md:1074` sigue citando `src/server/puertos.ts`**, que ya no existe.
Es el único cabo del renombrado (lo he barrido entero: el resto son este ciclo y un
`critica.md` histórico, que es correcto que cite el nombre de entonces). Lo escribes
tú al cerrar; queda apuntado para que no se caiga.

**m4 · `core` no valida `maxDays`, y la regla acaba viviendo en dos sitios con
distinta severidad.** `enteroDelEntorno` rechaza el `0` con un mensaje excelente
—«una partida de cero días no es una partida»— pero `newGame({ maxDays: 0 })` y
`{ maxDays: -5 }` se aceptan y **juegan un día**, terminando «sin resolver» en
silencio. Medido:

```
maxDays=  0 → day=1 fin={"winner":null} day_start=[1] ultimo=game_over
maxDays= -5 → day=1 fin={"winner":null} day_start=[1] ultimo=game_over
```

Con el contrato fail-loud del repositorio, ése es el sitio donde debería lanzar, y
entonces el `min: 1` del entorno sería un lujo y no la única defensa. (`NaN` no
cuelga con las semillas de hoy porque ganan por conquista antes; con una que no
ganara, `day >= NaN` no se cumple nunca.)

**m5 · Al espectador se le habla en segunda persona de un bando que no lleva.** La
nota de fin se construye una vez con `director.agentPlayers` y se reenvía tal cual
por el canal de espectadores: «…no gana nadie. **Tú llevabas al jugador 1
(necromancer)** y acabas con 1 castillo y 1 héroe». Para el agente es correcto; para
quien solo mira, no. Preexistente, pero la frase del empate es nueva y es la que se
ha visto en pantalla.

**m6 · El `?? null` de `nextPlayer` entra sin guardia.** Cambiar «corona al jugador
de turno» por «no gana nadie» es correcto y está bien argumentado, y la rama
(`vivos.length === 0`) es hoy inalcanzable —200 de 200 partidas tienen exactamente
un `player_defeated`—, lo que el comentario declara. Reponiendo el `?? state.current`
salen 418 verdes: queda escrito que es un cambio declarado y no vigilado.

**m7 · `HEROES_MAX_DAYS` no tiene tope por arriba.** `1e21` pasa
(`Number.isInteger(1e21)` es `true`) y produce exactamente la partida que no termina
nunca que la validación existe para evitar. Lo pide quien lo escribe, así que es
menor; un `max` cerraría la simetría con el puerto.

**m8 · De los cuatro lectores de `Desenlace`, solo tres son exhaustivos.** El cuarto,
`renderLog` en `panels.ts:643`, compara con literales (`fin === 'ganada'`,
`fin === 'perdida'`), así que un quinto desenlace se pintaría **sin clase** y `tsc`
no diría nada — se ve en la sonda de «añadir un cuarto miembro», que da 3 errores y
no 4. Renombrar sí lo caza (`TS2367`). No lo prometía el informe, pero el docstring
de `desenlace.ts` sí dice «la leen los cuatro sitios que la enseñan», y uno de los
cuatro no está atado.

**m9 · El encargo describe mal lo que hay que revisar.** Pide comprobar «cuatro
tablas `Record<Exclude<...>, string>`»; en el código son **tres** (`AL_ACABARSE_EL_MAPA`,
`AL_CERRARSE_LA_BATALLA`, `ROTULO_DE_FIN`) y ninguna usa `Exclude`. Lo apunto porque
en este repositorio una cita que no cuadra se dice, no se corrige por dentro.

---

## Workarounds usados, y por qué no afectan a quien juega

**W1 · La pestaña de Chrome oculta congela la página, y me costó dos falsos
positivos.** Con la pestaña en segundo plano, `requestAnimationFrame` no corre: el
espectador se quedaba en «Día —» con la barra diciendo «Mirando la partida», y el
cliente de juego no repintaba tras ocho `Espacio` que **sí** se habían aplicado. Dos
`Page.captureScreenshot` y un `Runtime.evaluate` llegaron a agotar su plazo. Se
resuelve activando la pestaña (un screenshot la trae al frente) y entonces todo
pinta al instante y correctamente. **No afecta a quien juega**: su pestaña está a la
vista, y el bucle de `dibujar` ya se re-arma en un `finally` desde el ciclo del
espectador. Lo dejo escrito porque el síntoma —panel vacío, barra tranquila— es
exactamente el que ese ciclo describe como fallo real, y quien lo lea después puede
confundirlos.

**W2 · Las sondas destructivas se corrieron en un `git worktree` aparte** (HEAD +
`git diff HEAD` aplicado + `desenlace.ts` copiado + `node_modules` enlazado), no en
el árbol del usuario. `npx tsc --noEmit` salía 0 allí antes de empezar, así que las
sondas miden lo que dicen medir. Worktree retirado al terminar; `git status` del
repo, idéntico al inicial (26 entradas).

**W3 · El agente del cable se sustituyó por un cliente WebSocket de usar y tirar**
que contesta `{basura:true}` a cada petición — el camino «respuesta sin forma», uno
de los ocho respaldos documentados, que hace que el servidor descarte y siga sin
esperar los 300 s del plazo. Verifica **el cable y el `game_over`**, no el puente
MCP; el puente lo cubre `pnpm qa`, que corre con `HEROES_MAX_DAYS=12` y no llega al
tope. Lo que **no** queda ejercido por ningún guardia automático sigue siendo el fin
por días con el puente MCP de verdad al otro lado, tal como el propio informe declara
en su §7.

**W4 · `npx vite build` dejó un `dist/`** (ignorado por git) que he retirado al
terminar.

---

## No probado

- **«Partida sin resolver» en la barra del cliente de juego.** El navegador no pide
  tope —juega a 200 días— y `main.ts` no expone la sesión en `window`, así que
  llegar exigiría tocar código: por la regla del workaround, eso es un hallazgo o es
  «no probado», y aquí es no probado, porque **quien juega tampoco puede llegar**.
  Lo cubre `test/paneles.test.ts` con los cuatro rótulos, y el análogo del espectador
  («Terminada sin ganador») sí se ha visto en pantalla.
- **La rama `'sin resolver'` de `afterBattle`**: escrita y declarada inalcanzable
  (los días se agotan en `end_turn`, no cerrando una batalla). Escrita, no cubierta.
- **Los tiempos de CI**: los míos son de esta máquina.
- **`pnpm qa` con el tope de días alcanzado**: su partida acaba el día 4 por
  conquista. Ejercido a mano (W3), sin guardia automático.

---

## Veredicto

**APTO CON RESERVAS.**

Lo pedido está hecho y verificado de punta a punta: el tope vive en `advanceDay` y
en ningún otro sitio, `state.finished !== null` significa por fin «terminó»,
`partidaTerminada` está muerto, los cuatro valores de entorno se rechazan diciéndolo
y con test, y `pnpm qa` baja de 5,39 s a 3,12 s **sin perder una sola línea de
cobertura** — comparado por mí contra el arnés de `HEAD` sobre el mismo código. Los
cinco números que pediste salen todos: 418 tests, `297dbef9…` con 32 177 líneas y
`ancla: igual`, 0/200, 0/40 y `pnpm qa` exit 0. **El ancla no se movió**: el juego que
se juega es el mismo.

Las reservas son dos, y las dos caen dentro de lo que este ciclo tocó: el espectador
sigue viendo el fin de partida en rojo de derrota cuando gana alguien (**I1**), con
el test nuevo fijándolo como correcto; y la afirmación «solo `day_start` va sin
protagonista» dejó de ser cierta en dos sitios que la escriben (**I2**), sin que nada
se pusiera rojo. Ninguna de las dos impide entregar; las dos son de la especie que
este repositorio no deja pasar callando.

---

# Resolución

Aplicados **los ocho** hallazgos por el coordinador, sin devolvérselos al
ingeniero. Verificación final: `pnpm verify` **421 tests** (8,66/8,65/8,72 s) ·
`pnpm banco` **`297dbef9…`, 32 177 líneas, 0/200, «ancla: igual»** · `banco 20 5`
**18/20** · barrido **0/40** · `pnpm qa` exit 0, 3,14/3,12/3,12 s con la
cobertura intacta · `vite build` compila.

## I1 · La otra mitad del bug

Tenías razón y el argumento era el mío: si por no llevar bando un empate no es tu
derrota, **la victoria de otro tampoco lo es**. La respuesta a «no tienes bando»
no era «perdida» — es que faltaba una respuesta. `Desenlace` tiene ahora **cuatro
miembros** y `NADIE` se ha mudado a `desenlace.ts`, que es el único sitio del
repositorio donde «no es tu bando» y «no tienes bando» dan resultados distintos.
En el resto de la crónica el centinela contesta bien por accidente, porque allí la
pregunta ya es de dos y `clase(mio, false)` no pinta nada.

El test que congelaba la mitad mala ahora recorre **los tres actores** (`null`, 0
y 1) vistos sin bando y exige que ninguno lleve clase. Roto a mano quitando la
línea de `ajena`: *«game_over con actor 0 visto sin bando: expected
'<div class="log"><div class="lose">Fi…' to contain '<div>Fin de la partida</div>'»*.

## I2 · La premisa caducada, reparada sin bajar el listón

La salida fácil era meter `game_over` en el conjunto de exentos, y eso **habría
desafilado el guardia**: un `game_over` anónimo de una partida con ganador habría
pasado. Se afirma la regla en vez de la excepción — el `actor` de `game_over`
**tiene que ser** `state.finished.winner`, `null` incluido—, con lo que el guardia
queda más fuerte que antes. Roto a mano emitiendo `actor: null` siempre: *«el
game_over no lleva al ganador: expected null to be +0»*. La frase de `events.ts`
dice ya que son dos y por qué el segundo no se puso rojo solo.

## Los seis menores

- **m1, m2** · corregidos los dos textos. El de `nextPlayer` decía que lo vigilaba
  `invariantes.test.ts` y **no puede alcanzar la rama**: ahora nombra al que sí, y
  dice por qué citar al guardia equivocado es peor que no citar ninguno.
- **m3** · `CLAUDE.md` ya no cita `puertos.ts`.
- **m4** · `createGame` **lanza**: «una partida de 0 días no es una partida». La
  regla estaba en el borde del entorno y no en el juego, o sea la misma regla con
  dos severidades según por qué puerta entrases. Test con cuatro sondas (`0`,
  `-5`, `1.5`, `NaN`) más el suelo válido; roto a mano, «maxDays=0: expected
  [Function] to throw an error».
- **m5** · el espectador ya no recibe la segunda persona de otro: la nota se pide
  con el conjunto vacío, que `notaFinDePartida` ya sabía tratar. No hacía falta
  una segunda redacción, hacía falta decirle **quién pregunta**.
- **m7** · `enteroDelEntorno` mira `isSafeInteger` y no `isInteger`, con lo que
  caen tus dos sondas y **las cuatro variables** quedan cubiertas de una vez. No es
  un tope de gusto: es donde el `Number` deja de saber contar. Roto a mano: las dos
  rojas por su nombre.
- **m8** · el docstring ya no promete cuatro lectores exhaustivos. `renderLog`
  compara literales a propósito: «ganada verde, perdida roja, **lo demás neutro**»
  es la respuesta correcta para un desenlace nuevo, no un descuido.

## m6 y m9, que no se tocan

**m6** se queda **declarado y no vigilado**, que es lo que ya decía su comentario:
la rama de `vivos.length === 0` es inalcanzable con las 200 partidas de hoy y un
test que la forzara probaría la fixtura, no la regla. **m9** es mío: conté cuatro
tablas y eran tres, y ninguna usaba `Exclude`. Lo dejas escrito y así se queda.
