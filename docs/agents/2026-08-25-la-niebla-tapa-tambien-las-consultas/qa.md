# QA — la niebla tapa también las consultas

**Veredicto: APTO.** Los tres issues cumplen sus criterios y los he reproducido
todos por mi cuenta, no leyendo el informe: el `diff` del banco línea a línea con
mi propio analizador, las seis roturas de guardias, el JSON de `battle_state` por
el cable de un servidor de verdad, y el navegador. Nada rojo. Lo que traigo son
**cuatro hallazgos menores, tres de ellos preexistentes**, y una premisa del
encargo que resultó falsa —la del navegador— por el lado bueno.

Árbol limpio antes y después (`git status --porcelain` vacío), `pnpm verify` en
verde al terminar, y **nada mío se ha quedado vivo**: los dos servidores de
desarrollo y el de partida se pararon por su grupo de procesos, enumerado antes
de mandar la señal. Ni un `pkill`.

---

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| **1** | `map` devuelve lo explorado, no el mapa entero | ✅ | Por el cable, contra `pnpm run server` con semilla 110: `map{player:1}` → 4 006 bytes, **81 casillas con terreno y 495 huecos**, **9 objetos de los 32** del mapa. Antes eran los 576 terrenos y los 32 objetos |
| **2** | *(retirado por la crítica)* La regla se escribe una vez para los dos consumidores; `broadcast()` no se lo lleva por delante | ✅ | `knownObjects()` lo llaman `serializeAdventureTurn` y `serializeKnownMap`. Y lo verifico donde importa: con #74+#73 dentro y #72 revertido, el JSON de `adventure_turn` es **idéntico byte a byte** al de `4e2eb73` sobre 40 vistas (5 semillas × 4 días × 2 jugadores, **200 639 bytes**, `diff -q` limpio). `ws-server.ts` solo gana comentario |
| **3** | La consulta pasa por `jugadorDelAgente` | ✅ | Por el cable: `map{player:0}` con el agente llevando el 1 → `ok=false`, *«no puedes consultar por el jugador 0: no es tuyo. Llevas el jugador 1: pregunta por ese.»*, **cero bytes de datos**. `map{}` sin jugador contesta por el suyo, mismos 4 006 bytes |
| **4** | Test que falsifica, no que confirma | ✅ | **Los dos sentidos, y los rompo yo**: con el filtro a no-op → `expected [...] to not include 'town-0'` y `(0,0) sin explorar: expected 'grass' to be null`; con el filtro **vaciando el mapa para todos** —el modo de fallo de #71— → `expected [] to include 'town-0'` y `(15,15) explorada: expected null to be 'rough'`. Los recuentos de las dos clases son > 0 y el test lo exige |
| **5** | La tool `map` NO se publica | ✅ | `mcp/server.ts` publica cinco y ninguna es `map`. **Matiz abajo**: por el protocolo crudo sí se alcanza, y ahí es donde la he probado |
| **6** | Qué es público y qué es del bando, decidido y escrito | ✅ | Público: `round`, `yourSide`, `activeStack`, `board`, `stacks`, `log`, y el héroe con nombre y estadísticas. Del bando: `mana` y `spells`, más `legalActions` |
| **7** | No se niega la vista | ✅ | En la vista ajena por el cable: `stacks=2`, `board` presente, `round=1`, `yourSide=attacker`, `hero.name="Aldo de Valdeluz"`, `hero.attack=2`, y la nota entera |
| **8** | El test que falsifica hoy es el de dos jugadores | ✅ | Rompo `const propia = vista === 'propia' \|\| true` → `expected 20 to be undefined`. Y por el cable, vista ajena: `mana=undefined`, `spells=undefined`, y el JSON completo **no contiene la subcadena `"mana"` ni `"spells"`** |
| **9** | Un bando que SÍ es tuyo sigue viendo su maná, su libro **y sus acciones** | ✅ | Por el cable, misma batalla preguntada por el dueño: `mana=20`, `spells=["magic_arrow"]`, **`legalActions` con 44 entradas**. Y forzando `propia = false` —quitárselo a todos— caen **5 tests** en 2 ficheros, entre ellos `expected 'undefined' to be 'number'` |
| — | **La cuarta fuga** (`legalActions` del stack activo sea de quien sea) | ✅ | Verificada por el cable, no leyendo el código: en la vista ajena `legalActions` **no viene**. Y muerde: dejándola incondicional → `expected [ { type: 'defend' }, …(43) ] to be undefined` |
| **10** | Las dos funciones editadas, y el test casilla a casilla lo caza | ✅ | **Lo veo morder**: con radio 5 solo en `visibleNow` y `visibleNowAt` sin tocar → **129 discrepancias**, la primera `jugador 0 en (5,1)`. Cifra y casilla idénticas a las del informe |
| **11** | La cifra es 5, no depende de la fortificación, y se copia el número y no la forma | ✅ | `TOWN_SCOUT_RADIUS = 5` junto a `HERO_SCOUT_RADIUS`, con el comentario que dice `getFogDiscoveryDistance`, que `Castle::Scout()` no ramifica, que allí es disco y aquí cuadrado (81 contra 69) y que esto alimenta `visibleNow` y **no** `fog` ni `memory` |
| **12** | Un héroe enemigo pegado a la capital produce un `hero_moved` que te llega | ✅ | El test es rojo con el `game.ts` de antes de #72 (`expected false to be true`) y verde después. **Y en el flujo real, sobre mapas generados**: `hero_moved` del rival entregados en `recentEvents` **101 → 181** (20 semillas × 2 jugadores, día 8); `enemyHeroes` el día 3 **6 → 25** y el día 5 **4 → 18** (40 semillas × 2 jugadores) |
| **13** | El `diff` de los dos volcados: solo `seen`, cero `fin` | ✅ | **Reproducido con mi propio analizador**, volcado de antes sacado de `11af6dd` con el `banco.ts` de HEAD: **1 871 de 28 406 (6,6 %)**, **100 % distintas solo en `seen`**, **0 líneas `fin`**, **1 871 ganan observador y 0 lo pierden**. Tipos afectados: `hero_moved` 1 517, `mine_captured` 187, `hero_defeated` 153, `resource_gained` 10, `battle_started` 2, `battle_ended` 2. Ancla nueva `299b1a7c…` **cuadra** |
| **14** | `barrido-semillas` en 0/40 | ✅ | `sin terminar: 0/40 → []`, peor batalla 8 rondas |
| **15** | `pnpm verify` verde y los tests reescritos, no adaptados | ✅ | **282 pasan**, 0 fallan. El modo de fallo de #71 —la ausencia que también se cumple con el mapa vacío— **está cazado**: ver criterio 4 |
| **16** | Si cambia el JSON, zod y `RESPONSE_FORMAT` viajan juntos; entra `pnpm qa` | ✅ | `contract/agent.ts` no se toca y su promesa sigue siendo cierta: `agent.ts:213` dice que *la petición* trae todas las acciones legales, y `director.ts` siempre pasa `'propia'` con el bando del stack activo. Lo que cambia es la descripción de `battle_state`, y cambió. `pnpm qa`: **16 veredictos, 16 entraron, 0 descartadas, exit=0** — también **con un `pnpm run server` abierto** en 9880/9881 |
| **17** | `CLAUDE.md` no lo toca nadie del ciclo | ✅ | Ninguno de los tres commits lo menciona |

### Roturas de guardias, una por una

Las repito todas, no dos. Cada una en un `git worktree` aparte para no contaminar
el árbol del usuario.

| Rotura | Qué se puso rojo | ¿Cuadra con el informe? |
|---|---|---|
| Filtro de `serializeKnownMap` a no-op | los dos primeros de #74 | sí, literal |
| **Filtro vaciando el mapa para todos** (mía) | los dos primeros, por el otro lado | — el modo de fallo de #71 está cubierto |
| `case 'map'` sin `jugadorDelAgente` | `expected '{"width":24,…' to be ''` | sí, literal |
| `propia = vista === 'propia' \|\| true` | `expected 20 to be undefined` | sí, literal |
| `legalActions` incondicional | `expected [ { type: 'defend' }, …(43) ] to be undefined` | sí, literal |
| Radio 5 solo en `visibleNow` | **129 discrepancias**, desde `jugador 0 en (5,1)` | sí, literal — y **además** cae el observable |
| `game.ts` de antes de #72 | el observable: `expected false to be true` | sí, literal |
| **La poda de abajo olvidada** (`q.y >= 0` sin `q.y < height`) | primera pasada **verde**, segunda **seis**: `jugador 1 en (34,12)` … `(39,12)` | sí, literal |

La pasada de las esquinas **gana su sitio**: `PLANO` pone los castillos en `y=6`
de un mapa de 12 de alto, así que el cuadrado de 5 no llega a ningún borde
vertical y la primera pasada es ciega a esa clase entera de fallo. `ESQUINAS`
—`(0,0)` y `(39,11)`— la ve. Que el crítico diera el test por inexistente y
resulte que existía **y ahora se ha visto morder tres veces** es el resultado que
pedía la lección de los tres ciclos.

---

## Hallazgos

### 1 · Menor · Preexistente — `battle_state` se salta el candado del jugador cuando no hay batalla

`consultas.ts` comprueba `pending === null` **antes** de llamar a
`jugadorDelAgente`, así que con la partida sin batalla en curso:

```
MAP-PLAYER-0    ok=false  "no puedes consultar por el jugador 0: no es tuyo…"
GAME-PLAYER-0   ok=false  "no puedes consultar por el jugador 0: no es tuyo…"
BATTLE-PLAYER-0 ok=true   ← el agente lleva SOLO el jugador 1
```

**Reproducción desde el arranque**: `pnpm run server`; conectar al canal del
agente (`ws://localhost:9881`), mandar `hello` y luego
`{type:'query', what:'battle_state', args:{player:0}}` mientras no haya batalla
pendiente. Vuelve `ok:true` con `{battle:null, note:'ahora mismo no hay ninguna
batalla'}`.

**No es una fuga**: la respuesta es la misma para cualquier jugador y no dice
nada del rival. Lo que rompe es la promesa del contrato —*«`game_state` y
`battle_state` llevan un parámetro `player` … y rechaza diciéndolo»`*— y el
motivo por el que esa promesa existe: un argumento inválido que se **acepta** le
enseña al agente que ese argumento vale, y no se corrige. Es **de `4e2eb73`, no
de este ciclo** (comprobado con `git show 4e2eb73:src/server/consultas.ts`), pero
cae de lleno en «la niebla tapa también las consultas» y el arreglo es mover una
línea.

### 2 · Menor — en tu propia batalla, `legalActions` desaparece sin decir por qué

Cuando la batalla **sí** es tuya pero el stack activo es del otro bando,
`legalActions` no se emite y **no hay nota que lo explique**. Medido por el
cable:

```
ANTES  activo=attacker → MI-TURNO  legalActions=44  mana=20  note=undefined
DESPUÉS activo=defender → SU-TURNO  legalActions=undefined  mana=20  note=undefined
        claves = ["kind","round","yourSide","activeStack","board","stacks","hero","log"]
```

**Reproducción**: agente que lleva el jugador 0; forzar la batalla del rival
contra un monstruo; consultar `battle_state{player:0}` antes y después de que el
stack atacante actúe.

**La decisión es correcta** —esas acciones son del otro—, pero la descripción de
la tool solo documenta la ausencia para la batalla **ajena** (*«sin
"legalActions": ahí no juegas tú. La nota de la respuesta lo dice»*), y aquí no
hay nota. Quien juega —el agente— puede deducirlo comparando `activeStack` con
`yourSide`, así que es incomodidad y no bloqueo. La casa dice que un rechazo se
explica; esto es una ausencia silenciosa. Lo mismo pasa con un agente que
llevara **los dos** bandos: `side` se fuerza a `'attacker'` y en el turno del
defensor tampoco le llegan sus propias acciones legales.

### 3 · Menor · Preexistente y de documentación — `pnpm server` no arranca nada

Con **pnpm 10.28.1**, `pnpm server` es un **comando propio de pnpm** («Manage a
store server»), no el script del `package.json`. Sale **0, en silencio, sin
imprimir una línea**:

```
$ timeout 6 pnpm server ; echo exit=$?
exit=0
$ pnpm server --help
Usage: pnpm server <command>   Manage a store server
```

Lo que funciona es `pnpm run server` (o `npx tsx src/server/ws-server.ts`), y con
eso levanta bien:

```
[servidor] canal del agente en ws://localhost:9881
[servidor] canal de espectadores en ws://localhost:9880
```

`CLAUDE.md` documenta `pnpm server` **dos veces** como la forma de jugar con el
agente. Quien siga la receta se queda mirando un terminal vacío y creyendo que
arrancó. No es de este ciclo, pero toca justo el criterio 16 —«`pnpm qa` convive
con un `pnpm server` abierto»—: con la orden documentada no hay servidor con el
que convivir. **Con `pnpm run server` la convivencia sí la he comprobado**:
`pnpm qa` exit=0 con los dos puertos ocupados.

### 4 · Menor · Documentación — cifras de `CLAUDE.md` que ya no cuadran

- Dice **251 tests** en dos sitios (`pnpm verify` y `pnpm test`). Son **282**.
- Dice `pnpm verify` en **6,7 s**. Medido tres pasadas: 7,11 / 7,13 / 7,17 →
  **mediana 7,13 s**. (`pnpm qa`: 5,44 / 5,41 / 5,41 → **5,41 s**, que sí cuadra
  con los 5,4 s documentados.)

### Observaciones que no son hallazgos

- **`roads` no lo ejercita el flujo real.** El generador no dibuja caminos:
  medido `roads=0/0` en cinco semillas × dos jugadores al día 6-7. La mitad de
  «caminos» de `serializeKnownMap` solo la prueba el test, que los pone a mano
  —y el propio test lo dice—. Es honesto, pero conviene saberlo: el día que haya
  caminos, esa rama estrena en producción.
- **`serializeKnownMap` devuelve `unknown`.** La decisión de §3.A
  —`(TerrainKind | null)[]`— vive en la prosa del docstring y **no en el sistema
  de tipos**. Consistente con los otros serializadores, pero un guardia menos
  para quien escriba #33.
- **Residual aceptado: el `log` público filtra qué hechizos ya se lanzaron.** Las
  entradas `{kind:'cast', side, spell, …}` llevan el id del hechizo, y el `log`
  es público también en la vista ajena. Es la decisión escrita —*«un hechizo ya
  lanzado lo has visto ocurrir»*— y me parece defendible; lo apunto para que sea
  una decisión y no un descuido: el libro del rival no se entrega, pero el
  subconjunto de lo ya usado sí se puede reconstruir mirando varias rondas.
- **El barrido casilla a casilla mira una casilla fuera del mapa, no cinco.** Un
  fallo que añadiera claves en `x = -2` con la poda de `x = -1` intacta no lo
  cazaría. Es rebuscado —cualquier poda olvidada añade primero `-1`, y eso sí lo
  ve—, pero es el borde de lo que el guardia promete.

---

## Dos cosas que el informe dice bien y conviene afinar

**El pueblo no mete objetos nuevos en `knownMap`, pero sí les refresca la fecha.**
El informe dice «un objeto pegado a tu capital te da eventos y sale en
`enemyHeroes`, pero **nunca** en `knownMap.objects`». Es exacto para los objetos
**nuevos** —medido: **0** entran—, pero incompleto: los que ya estaban en
`memory` y ahora caen dentro del radio del pueblo pasan a entregarse **vivos y
con `lastSeen` de hoy** en vez de con el recuerdo viejo. Medido en las seis
diferencias de la muestra: **6 de 6 son solo `lastSeen`** (`mine-0` de
`lastSeen:1` a `lastSeen:2`, etc.). Es una mejora, no una incoherencia — pero si
la mina de al lado de tu capital cambia de dueño, ahora te enteras por
`knownMap` y antes no.

**El alcance real de #72 sobre lo que ve el agente**: de 40 vistas de
`adventure_turn` (5 semillas × 4 días × 2 jugadores), **39 cambian**. Por campo:
`knownMap` 33, `recentEvents` 10, `enemyHeroes` 4. Y la incoherencia que la
crítica sospechaba y retiró la confirmo yo también: **0 de 1 425** eventos
entregados con sitio caen sobre una casilla que el jugador nunca exploró.

---

## La premisa del navegador era falsa, y por el lado bueno

El encargo decía: *«el radio del castillo cambia lo que se ve en el mapa de
aventura desde el primer día»*. **No cambia nada.** El lienzo del cliente pinta
con `player.fog` (`render/adventure.ts:99,129`) y **`visibleNow` no tiene ni un
lector en `src/client/`** — sus únicos lectores son `serialize.ts` y el sello de
`emit`. #72 no toca `fog`.

Lo comprobé en vez de razonarlo: dos servidores de desarrollo a la vez, HEAD en
`3100` y `11af6dd` en `3101`, misma semilla 110, misma pantalla del día 1. **La
niebla es la misma.**

Y la pasada de jugador sobre HEAD, `?seed=110`, buscando que no se hubiera roto
nada:

- El mapa carga; barra con `semilla 110`; **139 imágenes** cargadas.
- El héroe se mueve (1100 → 620 de movimiento), la niebla se abre y aparece una
  mina que no se veía.
- Ataco al monstruo de 11 zombis: el tablero de batalla se pinta bien.
- **Lanzo Flecha mágica: maná 20 → 17, el zombi 11 → 10, el parte dice «Hechizo
  Flecha mágica: 20 de daño» y el campesino SIGUE ACTIVO** — `cast` no consume el
  turno. Reproduce exactamente lo que reportó el ingeniero.
- Resuelvo la batalla: 60 de experiencia, el maná vuelve (5/20), crónica «Batalla
  resuelta».
- `Fin de turno` → día 2, y la crónica del cliente pinta lo del rival («El
  jugador 1 construye: Morada de nivel 2», «recluta 6 × Zombi»): **el cliente NO
  se filtra, que es #64 y es deliberado**.
- Pantalla de castillo: once solares, costes, cadenas y la casilla de
  reclutamiento del campesino.
- **Consola limpia**: 12 mensajes, todos `[vite] connecting/connected` y
  `[assets] 139 imágenes generadas cargadas`. **Ni un error ni un aviso.**

---

## Workarounds usados

| Workaround | Por qué | Veredicto |
|---|---|---|
| Dos `git worktree` en el scratchpad (`11af6dd` y `HEAD`) con `node_modules` enlazado, y ficheros de test desechables dentro | Sacar el volcado de antes **con el `banco.ts` de HEAD**, y romper guardias sin tocar el árbol del usuario | **No afecta a quien juega.** El árbol del repo nunca se modificó; los dos worktrees están borrados y `git worktree list` solo lista el principal |
| Un `.qa-agente-crudo.mjs` copiado a la raíz del repo durante **una sola orden** y borrado en la misma línea | `node` no resuelve `ws` desde el scratchpad | **No afecta a quien juega**, pero lo declaro porque el guardia de rutas absolutas mira también lo no indexado: el fichero ya no existe y `git status` está vacío |
| `pnpm run server` en vez de `pnpm server` | La orden documentada no arranca nada | **Esto NO es un workaround: es el hallazgo 3.** Lo que le pasa a quien juega es exactamente lo que me pasó a mí |

Nada más se forzó: el mapa filtrado, la batalla ajena y el radio del castillo se
observaron todos por su camino real —el WebSocket del servidor, el navegador, o
el serializador con partidas generadas—, no con estado sintético.

---

## No probado

- **El escenario de tres jugadores para #73.** Estaba fuera por el criterio 8, y
  lo sigue estando: el de dos falsifica hoy.
- **La tool `map` por MCP.** Es #33 y está fuera. Con el matiz del criterio 5: la
  consulta **sí** es alcanzable hoy por el protocolo crudo
  (`protocol.ts:73` acepta `what:'map'` y `ws-server.ts:40` la enruta), así que
  «hoy no la alcanza nadie» vale para un agente que entre por el puente MCP y no
  para cualquiera que hable el WebSocket. Eso hace el arreglo **más** necesario,
  no menos — y es por ahí por donde la he probado.
- **El filtrado de `roads` en una partida de verdad**, porque el generador no
  dibuja caminos.
- **Cuánto del libro del rival se reconstruye del `log` en una batalla ajena
  larga.** Razonado, no medido: la ventana en la que existe una batalla ajena no
  sobrevive a un tick del bucle de eventos, así que hoy es teórico.
- **Que el volcado del banco sea reproducible en otra máquina.** Mido en esta.

---

## Veredicto

**APTO.**

Los diecisiete criterios se cumplen y los tres duros los he reproducido con mi
propio instrumento: el `diff` del banco (1 871 / 28 406, 100 % `seen`, 0 `fin`,
0 pérdidas de observador) sale clavado, las ocho roturas de guardias muerden con
la cifra y la casilla que decía el informe, y el maná ajeno no aparece en el
JSON que sale por un WebSocket de verdad mientras el propio sigue llegando entero
con sus 44 acciones legales.

Los cuatro hallazgos son menores y **tres son preexistentes**: el candado que
`battle_state` se salta cuando no hay batalla, `pnpm server` que no arranca nada
con pnpm 10, y las cifras viejas de `CLAUDE.md`. El único de este ciclo —la
ausencia silenciosa de `legalActions` en tu propia batalla cuando le toca al
otro— es una línea de nota, no un cambio de diseño.
