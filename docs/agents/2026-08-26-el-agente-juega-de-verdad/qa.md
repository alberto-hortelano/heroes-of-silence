# QA — el agente juega de verdad

Validación de `8729d39..HEAD` (seis commits) contra `requisitos.md`. Todo lo que
sigue se ha **ejecutado**; donde no, se dice y se llama *no probado*.

**Veredicto: apto con reservas.** Los cinco caminos de respaldo caen de pie, la
espera doble está cerrada, la niebla de `map` no tiene una sola fuga y el cambio
de `core` es inerte. Hay **un bloqueante**: un plan que el servidor **acepta y
acusa** puede matar la partida en el primer turno, y el contrato no dice cómo
evitarlo.

---

## Lo que ejecuté

| Orden | Resultado |
|---|---|
| `pnpm verify` (árbol limpio, sondas retiradas) | **325 tests, 14 ficheros, 5,22 s, verde** |
| `pnpm qa` | **0** · 19 veredictos, 19 entraron · `battle_state, building_list, creature_stats, game_state, map, spell_list` · «1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla» |
| `pnpm partida` **× 10 corridas reales** con un agente de mentira por WebSocket | ver la tabla de caminos |
| `pnpm dev` + `curl` | la página se sirve en 3100 con **cero** servidores de partida levantados |
| Barrido propio de **4 720 planes procedimentales** (lados 8→128, 40 semillas cada uno) | 0 rechazados por las comprobaciones nuevas |
| Sonda de niebla sobre `serializeKnownMap` (576 casillas, casilla a casilla) | 0 fugas, 0 tapadas de más |
| Rotura propia del guardia `qa-town-*` | `pnpm qa` rojo con fichero y línea |

Todo lo que arranqué lo arranqué con `set -m` en su línea, guardando el PID, y
lo maté por su grupo comprobando antes que el PID **era** su grupo; después de
cada muerte comprobé el puerto con `ss -ltnp`. **Ningún `pkill`, `killall` ni
`kill` por nombre.** El dueño del 3100 se identificó antes de matarlo:
`readlink /proc/41889/cwd` → `/home/al/code/heroes`. Los puertos 19880/19881 se
comprobaron libres antes de usarlos.

---

## Criterios de aceptación, uno a uno

| # | Criterio (de `requisitos.md`) | | Evidencia |
|---|---|---|---|
| 1 | Nada anunciado al agente sigue sin existir | ✅ | `hero_banter` retirado de `REQUEST_KINDS` (`agent.ts:138`), de `responseSchemas`, de `RESPONSE_FORMAT` y de `LISTEN_DESCRIPTION`; `map` publicada (`mcp/server.ts:389`). Barrido del árbol entero: **cero restos vivos** de `banter` en `src/` y `tools/`; cero ramas `'log'` en ningún `switch` |
| 2 | #27 cae de pie con o sin agente | ⚠️ | Los **cinco** caminos que pediste caen de pie (tabla abajo) y encontré un sexto que también. Pero hay un séptimo que **no**: hallazgo 1 |
| 3 | Un plan inválido se le devuelve con el motivo | ✅ | Ejecutado en el circuito real: el agente recibe `problems[]` uno a uno y una nota que **no** le promete un turno. Corridas `esquema`, `basura`, `injugable`, `otros` |
| 4 | #33 respeta la niebla y su descripción dice qué acepta | ✅ | 0 fugas sobre 576 casillas; `roads` filtrados por `fog`; `PARAMETRO_JUGADOR` (`mcp/server.ts:323-326`) dice qué acepta y qué pasa si no |
| 5 | Si `hero_banter` se enchufa, la frase se ve | ✅ | Se resolvió por la otra dirección permitida por el criterio 1: retirada, con el motivo escrito |
| 6 | Se puede ver una partida sin leer un `console.log` | ⚠️ | **No cumple, y está declarado**: #30/#34 fuera del alcance recortado por el usuario (`plan.md:3`). Sigue sin haber cliente espectador: `SpectatorSnapshotMsg` tiene **un productor y cero consumidores** en todo el árbol |
| 7 | `SpectatorLogMsg` se emite o se borra | ✅ | Borrado (`protocol.ts:90-103`), con el porqué al lado. `ServerToSpectatorMsg` es hoy un alias de un solo brazo; ningún `switch` se degrada |
| 8 | El espectador no puede jugar | ✅ | `spectatorServer` (`ws-server.ts:255-259`) registra `connection` y `close` y **no registra `message`**: el canal es de una sola dirección por construcción |
| 9 | `pnpm verify` y `pnpm qa` verdes | ✅ | 325 verde; `pnpm qa` código 0, sin el aviso amarillo de «no ha habido ninguna batalla» |
| 10 | Se sigue jugando sin agente y sin servidor | ✅ | El ciclo toca **cero ficheros de `src/client/`** (`git diff --stat 8729d39..HEAD -- src/client/` → vacío). `pnpm dev` sirve `index.html` 200 y `session.ts` 200 sin ningún servidor de partida. Ver *No probado* para el navegador |
| 11 | `pnpm banco` no se mueve | ✅ | Ancla confirmada por el coordinador. Yo lo ataqué por el otro lado: **4 720 planes procedimentales** de lados 8 a 128, **0** rechazados por las dos comprobaciones nuevas |
| 12 | 0 € de fal.ai | ✅ | No se invocó nada de `tools/gen/`; `spend.json` intacto |

---

## 1 · Los caminos de `pedirMapaAlAgente`, ejecutados

Enumerados leyendo el código y **ejecutados en el circuito real** (`pnpm partida`
con un agente de mentira atado al WebSocket, no un test unitario). El informe del
ingeniero habla de «los cuatro caminos»; son **siete**, y el séptimo es el
hallazgo del ciclo.

| # | Camino | ¿Arranca la partida? | ¿Recibe el agente el motivo? | ¿Lo dice la consola? |
|---|---|---|---|---|
| 1 | Sin agente atado | ✅ sí | n/a — no hay a quién | ✅ `mapa procedimental … (no hay ningún agente conectado)` |
| 2 | Agente atado y **mudo** | ✅ sí, tras el plazo | ✅ sí (`ask` manda `notaSinRespuesta`) | ✅ pero **300 s tarde y en silencio**: hallazgo 5 |
| 3 | Se **desconecta** con la petición en vuelo | ✅ sí, en el acto | ❌ no — el socket ya no está (inevitable) | ✅ `mapa procedimental … (el agente se ha desconectado)` |
| 4 | Plan que **el esquema** rechaza | ✅ sí | ✅ sí, con las dos rutas zod | ✅ sí |
| 5 | Respuesta que ni tiene forma (`{cualquier:'cosa'}`) | ✅ sí | ✅ `plan: Required` | ✅ sí |
| 6 | Plan que **`validateMapPlan`** rechaza | ✅ sí | ✅ `(3,3) la ocupan dos cosas…` | ✅ sí |
| 7 | Plan con **otros jugadores** (3 y 4) | ✅ sí | ✅ los cuatro problemas, ordenados | ✅ sí |
| **8** | **Plan que lo pasa TODO y no se puede jugar** | ❌ **NO** | ✅ se le dice «tu plan entró» — y es mentira | ✅ revienta con traza |

Salidas literales de las que más importan:

```
# camino 4 (esquema)
[servidor] mapa procedimental de la semilla 20260823 (respuesta inválida a "map_generate":
- plan.towns.0.id: un id de pueblo va en minúsculas y solo lleva letras, dígitos, …)
[sonda] VEREDICTO req-1 ok=false
   nota: Tu respuesta a "map_generate" no encaja con el esquema y no se ha aplicado nada.
         El mapa lo pone el generador procedimental y la partida empieza igual.

# camino 6 (injugable)
[servidor] mapa procedimental de la semilla 20260823 (el plan del agente no es jugable:
           (3,3) la ocupan dos cosas: pueblo "qa-town-0" y cofre)
[sonda] VEREDICTO req-1 ok=false
   problemas: ["(3,3) la ocupan dos cosas: pueblo \"qa-town-0\" y cofre"]
   nota: Tu plan de mapa no se puede jugar (1 problema, debajo). No se te va a volver a
         pedir: el mapa lo pone el generador procedimental y la partida empieza igual.

# camino feliz
[servidor] mapa diseñado por el agente (24×24, 2 pueblos). La semilla 20260823 ya NO
           reproduce esta partida: el mapa lo puso él.
[sonda] VEREDICTO req-1 ok=true
   nota: Tu plan de mapa entró: la partida se juega en 24×24 con 2 pueblos.
```

**La cola de `notaSinRespuesta`/`notaRespuestaInvalida` ya no promete un turno**
para `map_generate`: comprobado por el cable, no por test. Ese era el guardia que
protegía el error y está bien reparado.

**Y la ventana «todavía no hay partida» sí se ejercita** — el informe la lista
como no cubierta en el circuito real. La cubrí: con el agente atado y el mapa sin
entregar, `game_state` y `map` vuelven los dos con
`ok=false: todavía no hay partida que consultar: estoy esperando tu plan de mapa…`,
y el canal sigue vivo.

---

## 2 · La espera doble — cerrada, y no queda ningún camino que pague dos veces

Cronometrado en el circuito real, `HEROES_WAIT_AGENT_MS=3000`, sin agente:

```
=== ELAPSED hasta 'día 1': 3.425465700 s ===
[servidor] esperando al agente hasta 3 s…
[servidor] no ha venido nadie; juega la IA de reglas.
[servidor] mapa procedimental de la semilla 20260823 (no hay ningún agente conectado)
[servidor] día 1 · jugador 0 · reglas · 0 acciones
```

3,43 s con **un** plazo de 3 s más el arranque de `tsx`. Sin `yaSeEspero` serían
6,4 s. La traza de espera sale **una sola vez**. La afirmación del ingeniero es
cierta y su diagnóstico también: `haVenidoAlgunAgente` (`agent-link.ts:69`) es
«vino y se fue», no «no vino nunca».

**No queda ningún camino que pague dos veces**: `yaSeEspero` se pone a `true`
**antes** del `await` (`ws-server.ts:178`), así que ni siquiera dos llamadas
concurrentes lo pagarían; y las llamadas de cada turno (`ws-server.ts:191`) caen
en `link.connected` o en `haVenidoAlgunAgente`. Lo que sí se suma —y es
inevitable, no un fallo— es espera + plazo de `ask`: un agente que se conecta en
el segundo 119 de los 120 puede tener al servidor 420 s sin empezar.

---

## 3 · La firma `qa-town-*` — rota a mi manera, y muerde

El ingeniero la rompió **quitando la firma** con el plan aceptado. La rompí al
revés, que es el caso que el guardia dice cubrir y el que de verdad da verde por
error: **plan firmado y rechazado por el servidor**, añadiendo un cofre encima
del pueblo en `tools/qa/politica.ts`. `pnpm qa` sale **1**:

```
[servidor] mapa procedimental de la semilla 20260823 (el plan del agente no es jugable:
           (3,3) la ocupan dos cosas: pueblo "qa-town-0" y cofre)
[qa] ha fallado: Error: la partida NO se juega en el mapa del agente: sus pueblos son
     town-1 y ninguno lleva la firma "qa-town-*". O el plan se rechazó y el servidor está
     jugando el procedimental —que es verde sin haber probado nada de #27—, o la política
     dejó de firmarlo. Mira la línea "[servidor] mapa …" de arriba: dice cuál de las dos.
    at exigeElMapaDelAgente (tools/qa/verify-agent.ts:258:9)
 ELIFECYCLE  Command failed with exit code 1
```

**El guardia da rojo con mi rotura, con fichero y línea, y su mensaje señala la
causa correcta de las dos que nombra.** La desviación 4 del informe es cierta y
está bien resuelta: la línea `[servidor] mapa …` a la que remite **se ve** —el
arnés canaliza el stdout del servidor en gris (`verify-agent.ts:78-80`)—, así que
el rojo no manda a buscar algo invisible. La sonda se retiró y `pnpm qa` volvió a
salir 0.

Cosa menor del arnés: el contador `mapas` es **decorativo** — se imprime y nadie
asegura que sea ≥ 1. Hoy no importa porque `exigeElMapaDelAgente` cubre lo mismo
por otra vía; no es un hallazgo, es una nota para quien toque ese fichero.

---

## 4 · El candado de #83 y la niebla — sin puerta de al lado

Ejecutado, no leído.

- **Las tres consultas** (`game_state`, `battle_state`, `map`) rechazan
  `player: 0` con `agentPlayers:[1]`, y las tres por la misma frase. `battle_state`
  **sin batalla en curso** también, que es lo que #83 abría.
- **`map` sigue contestando lo suyo** y `battle_state` sigue diciendo
  honestamente que no hay ninguna batalla.
- **Formas raras de `player`**: `'0'`, `0.5`, `-0` se rechazan; `'1e0'`, `[1]` y
  `{valueOf:()=>1}` se aceptan por el `Number()` de `jugadorDelAgente`. **No es
  una fuga**: la coerción solo puede caer *dentro* del conjunto propio, nunca
  fuera, y el esquema de la tool (`z.number().int()`) ya las corta antes. Lo digo
  para que no lo descubra nadie creyendo que es un agujero.
- **Consulta desconocida**: `known_map`, `spectator` → `consulta desconocida`. No
  hay cuarta rama.
- **Las tres de catálogo** (`creature_stats`, `spell_list`, `building_list`) no
  llegan al servidor: se contestan en el puente desde `data/*.json`
  (`mcp/server.ts:399,414,418`). No hay jugador que filtrar y no pueden filtrar.
- **La ventana de arranque** no abre nada: con `director === null` se lanza antes
  de tocar el estado.

Lo que **sigue** abierto y no es de este ciclo, pero contesta a «busca la puerta
de al lado»: `battle_state` con la vista `'ajena'` (`consultas.ts:70-73`) enseña
el tablero entero —composición y estadísticas de los stacks de los dos bandos, y
nombre y atributos del héroe ajeno— **sin consultar la niebla**. Quita el maná,
el libro y `legalActions` (`serialize.ts:340,345`), que es lo que se decidió.
Verificado que hoy es **inalcanzable** con la configuración del servidor:
`pendingBattle` solo sobrevive a un `await` mientras el director le pregunta al
agente por **su** batalla, así que `suyos.size === 0` exigiría un agente con dos
jugadores o más, y `ws-server.ts:293` pasa `agentPlayers: [1]`. Latente, no
activo. No lo cuento como hallazgo de este ciclo.

---

## 5 · Los `null` de la tool `map` — la descripción no miente

Cuatro promesas de `MAPA_DESCRIPCION`, cuatro comprobadas contra lo que la
función **devuelve**, casilla a casilla sobre una partida real (24×24 = 576):

| Promesa | Comprobación | |
|---|---|---|
| «`terrain` es un array plano de width×height, indexado `y*width+x`» | `terrain.length === 576`; la casilla del héroe en `y*width+x` no es `null` | ✅ |
| «una casilla que no has explorado viaja como `null`» | 495 de 576 son `null`; **0 casillas con terreno fuera de `player.fog`** y **0 dentro tapadas de más** | ✅ |
| «`objects` es lo que has OBSERVADO, con `lastSeen`» | los 8 objetos traen `lastSeen` numérico; `knownObjects` (`serialize.ts:75-79`) manda el **recuerdo** con su fecha y solo el objeto vivo si se está mirando ahora | ✅ |
| «`roads` son solo los tramos que conoces» | `roads` filtrados por `fog` (`serialize.ts:151`); todos los devueltos están en `fog` | ✅ |

La descripción es **más honesta que la media de este repo**: dice las tres cosas
que el JSON no deja deducir. No encontré ninguna afirmación suya que el código no
cumpla.

---

## 6 · El cambio en `core` — es inerte, y con más margen del que dice el banco

`pnpm banco` prueba la inercia sobre **200 semillas a un solo tamaño**. Lo ataqué
por donde el banco no llega: **4 720 planes procedimentales**, lados de 8 a 128,
40 semillas cada uno.

```
planes generados: 4720
con algún problema: 280
rechazados POR LAS COMPROBACIONES NUEVAS: 0
```

Los 280 con problema lo tienen por causas **anteriores** al ciclo (minas fuera
del mapa en lados < 10, que es un defecto viejo del generador y no asunto de
esta validación). **Ni un solo plan cae por «ids de pueblo repetidos» ni por «un
jugador con dos inicios»**, y ningún plan generado tiene esas dos propiedades.

Los dos `| undefined` de `MapPlan` son tipos: cero código en tiempo de ejecución.
La desviación 1 del informe está bien razonada y bien acotada; el flag
`exactOptionalPropertyTypes` está en `tsconfig.json:15` y la alternativa
—un conversor a mano— habría sido peor.

¿Hay algún plan que antes pasara y ahora se rechace **sin estar roto**? No
encontré ninguno. Los dos rechazos nuevos son de planes que `setup.ts` no puede
construir: el id de pueblo repetido da dos `Town` indistinguibles y el jugador
con dos inicios da dos `hero-<player>` (`setup.ts:62`). Lo único que la
comprobación **cierra de futuro** es el arranque con dos héroes, que hoy no se
puede modelar de todos modos por cómo se deriva el id. Observación, no hallazgo.

---

## 7 · Lo borrado — cero restos vivos, y una tercera víctima que se dejó viva

- **`hero_banter`**: cero apariciones en `src/` y `tools/`. Las cinco listas de
  kinds escritas a mano del repo (`LISTEN_DESCRIPTION`, `politica.ts`,
  `verify-agent.ts`, `notas.ts:enSuLugar`, `CLAUDE.md`) están **todas** en tres
  kinds menos `CLAUDE.md`. Ninguna se quedó incompleta.
  Y la retirada arregló de paso un fallo latente: con `hero_banter` vivo, el
  `else` de `enSuLugar` (`notas.ts:353`) le habría dicho «Ese turno lo juega la IA
  de reglas» sobre **una frase de héroe**.
- **`SpectatorLogMsg`**: cero ramas `'log'` en ningún `switch` del árbol. El único
  `'log'` que aparece es `class="log"` en `panels.ts:451,588`, un `<div>`.
  `ServerToSpectatorMsg` con un brazo no degrada ningún estrechamiento porque su
  único uso es una anotación sobre un literal (`ws-server.ts:94`).
- Lo que sí queda vivo y es **la misma especie que se acaba de matar**: hallazgo 9.

---

## 8 · `CLAUDE.md` — no son cuatro

**Son 14 puntos en 11 zonas, y una de las cuatro del ingeniero no está
desfasada.** No he tocado el fichero. Lista verificada contra el código:

| Línea | Qué dice | Qué pasa |
|---|---|---|
| **L14** | `pnpm verify … 310 tests, 7,2 s` | **dos** errores: 325 tests, y 8,1 s medidos (8,12 / 8,11 / 8,18) |
| **L15** | `pnpm test  # 310 tests` | 325 |
| **L72** | `pnpm qa … arranca servidor + puente MCP y juega la partida` | el tiempo (5,4 s) sigue bien; falta que **también diseña el mapa y exige que la partida se juegue en él** |
| **L79-80** | «ejercita las **cinco consultas** … `battle_state`, `creature_stats`, `game_state`, `spell_list` y `building_list`» | **falsa**: son seis, falta `map`. Es una **segunda** enumeración falsa, distinta de la de L358, y al ingeniero se le escapa |
| **L143** | «Reproducido al aceptarlo: **los 310 tests pasan**» | en presente, con una cifra que hoy es 325 |
| **L357-358** | «Tipos de petición: … y `hero_banter`» | **falsa** — la #1 del ingeniero, correcta |
| **L358-360** | «tools de consulta (`game_state`, `battle_state`, `creature_stats`, `spell_list`, `building_list`)» | **falsa** — la #2 del ingeniero, correcta |
| **L362** | «`game_state` y `battle_state` llevan un parámetro `player`» | incompleta por dos motivos: `map` también lo lleva (son tres), y hay un **segundo** motivo de rechazo sin escribir, `SIN_PARTIDA_TODAVIA` |
| **L373-376** | «tres [puertas] de al lado abiertas, y **ninguna la alcanzaba nadie todavía**: se taparon **antes** de abrir la puerta» | el «todavía» caducó: la puerta se abrió en `0d907e8`. La justificación histórica sigue en pie; el documento no registra que se abriera |
| **L414-416** | «`validateMapPlan` lo rechaza si algún castillo queda inalcanzable o si dos objetos comparten casilla» | incompleta en tres capas: las **dos** comprobaciones nuevas, los topes del esquema (#97), y sobre todo **quién llama** — que el servidor pide el mapa al arrancar y cae al procedimental sin reintento |
| **L749** | tabla: `pnpm verify · 7,2 s` | 8,1 s |
| **L760-762** | «la partida se acaba el **día 3** … **2 turnos de mapa y 14 decisiones de batalla**» | **día 4**, **3** turnos, **15** decisiones, y falta «1 mapa diseñado» |
| **L764-765** | «7,2 + 5,4 = 12,6 s» | 8,1 + 5,4 = **13,5 s** |
| **L24-34** | la sección `?seed=N` | **NO está desfasada.** El cliente no tiene ni un WebSocket y sigue reproduciendo por semilla; lo que falta es un aviso **nuevo** sobre el servidor con agente. Es una **omisión**, no una mentira — y es la #3 del ingeniero |

Verificado que **no** están desfasadas, para que nadie las toque de más: **L5**
(«los mapas los diseña ese mismo agente») pasó de aspiracional a cierta; **L752**
y **L773** (5,4 s de `pnpm qa`) siguen al centésimo; la lista de
`test/invariantes.test.ts`; el ancla del banco; el barrido de semillas (0/40).
Y sobre `SpectatorLogMsg` **no hay ni una frase que corregir**: el ingeniero
acertó al no listarlo.

---

## Hallazgos

### 🔴 Bloqueante

**H1 · Un plan que el servidor ACEPTA y ACUSA mata la partida en el primer
turno: `monsters[].creature` es texto libre.**

`mapPlanSchema` valida por enum el terreno, los recursos y la facción, y deja
`creature: z.string()` (`src/core/contract/agent.ts:125`). `buildMap` lo mete
verbatim en el `MapObject` (`generate.ts:220-229`) y `validateMapPlan` no lo
mira. El agente recibe **«Tu plan de mapa entró»** y el servidor revienta en el
primer turno de la IA:

```
[servidor] mapa diseñado por el agente (24×24, 2 pueblos). La semilla 20260823 ya NO
           reproduce esta partida: el mapa lo puso él.
[sonda] VEREDICTO req-1 ok=true
   nota: Tu plan de mapa entró: la partida se juega en 24×24 con 2 pueblos.
[servidor] la partida ha reventado: Error: criatura desconocida: "no-existe"
    at creature (src/core/data.ts:31:34)
    at armyPower (src/core/ai/strategy.ts:28:18)
    at objectValue (src/core/ai/strategy.ts:65:20)
    at chooseHeroDestination (src/core/ai/strategy.ts:104:19)
    at playAiTurn (src/core/ai/turn.ts:88:23)
    at Director.playTurn (src/server/director.ts:100:13)
```

**Reproducción desde el arranque**: `pnpm partida`; atar un agente; contestar a
`map_generate` con cualquier plan válido en el que un `monsters[i].creature` no
esté en `data/creatures.json` (`"dragon"`, `"Skeleton"` con mayúscula, `"goblin"`).
La partida no llega al día 2.

**Por qué es probable y no rebuscado**: el payload le manda al agente una
`palette` con `creaturesForGuards` (`serialize.ts:372`) — ocho ids —, pero
`RESPONSE_FORMAT.map_generate` enumera las «Reglas que se validan antes de
aceptarlo» y **la criatura no está entre ellas**. Un modelo que lee ese contrato
no tiene motivo para creer que la lista sea cerrada, ni que distinga mayúsculas.
De las cuatro listas de la paleta, tres se validan y la cuarta es justo la que
mata el proceso.

**Qué esperaba quien juega**: lo mismo que en los otros siete caminos — que el
plan se rechace con su motivo («la criatura "dragon" no existe: usa una de …») y
que la partida empiece con el procedimental. Es exactamente lo que promete el
criterio 2 de `requisitos.md`, y es la misma clase de defecto que #97 vino a
cerrar: texto del agente usado verbatim. #97 acotó `id` y `name`, que son los que
**no** revientan; dejó suelto el que sí.

Es además una regresión de alcance, no un defecto viejo: antes de `aa19d83`
`mapPlanSchema` **no tenía llamante**, así que ningún plan del agente llegaba a
`buildMap` en producción. Este ciclo lo hizo alcanzable — el mismo razonamiento
que el propio informe usa para #63, un párrafo más abajo.

### 🟠 Importante

**H2 · El orden de `heroStarts` decide quién juega primero, y ni se comprueba ni
se dice.**

`setup.ts:88` deriva `state.players` de `plan.heroStarts` **en su orden**, así que
el agente elige el orden de turno diseñando el mapa. `jugadoresCambiados`
(`mapa-del-agente.ts:118-131`) comprueba el **conjunto**, no el orden.
Reproducción: contestar con `heroStarts` en orden `[player 1, player 0]`:

```
[servidor] mapa diseñado por el agente (24×24, 2 pueblos)…
[servidor] día 1 · jugador 1 · agente · 1 acciones      ← el agente abre la partida
…
  jugador 1 (necromancer): …      ← y `state.players` sale del revés en todas partes
  jugador 0 (knight): …
```

`RESPONSE_FORMAT` dice «numerados desde 0», que se lee como una regla de
numeración y no de orden, y nada la valida. Con el equilibrio de facciones ya
declarado como frágil en `CLAUDE.md` (#89), regalar la iniciativa al que diseña
el mapa no es cosmético. Se arregla en la misma función que ya comprueba el
conjunto, o se dice en la prosa que el orden lo fija el servidor.

**H3 · `CLAUDE.md` — el informe dice cuatro frases desfasadas; son 14 puntos en
11 zonas, y una de las cuatro no lo está.**

Detalle en la sección 8. Lo que más importa de las que se escapan: **L79-80** es
una **segunda** enumeración de «las cinco consultas», idéntica en falsedad a la
de L358 y en otro sitio del documento; y **L414-416** es el párrafo natural para
decir que `map_generate` ya tiene llamante, que es *el* titular del ciclo, y no
lo dice. En un repositorio donde `CLAUDE.md` se carga en el contexto de cada
agente, una cifra falsa ahí se propaga a todos los ciclos siguientes — es la
misma lección que el propio documento escribe sobre la tabla de experiencia.

### 🟡 Menores

**H4 · El servidor pide 24×24 y acepta 128×128 sin decir nada.** Ejecutado: un
plan de 128×128 entra, la partida se juega y la consola dice `(128×128, 2
pueblos)`. `jugadoresCambiados` comprueba los jugadores y nadie comprueba el
tamaño, mientras el docstring de `ANCHO_DEL_MAPA` (`ws-server.ts:33-40`) afirma
que «si dejan de coincidir, la partida sin agente y la partida con agente dejan
de jugarse en mapas comparables». O se comprueba, o el docstring deja de
prometerlo. De paso, 128×128 son 16 384 casillas de `knownMap` en cada
`adventure_turn`.

**H5 · Con el agente atado y mudo, la consola calla hasta 300 s.** Medido: 25 s
observados sin una sola línea entre `[agente] conectado` y el desbloqueo. El
plan lo aceptó como riesgo 5 —«Señal: ninguna línea `día 1` a los cinco
minutos»—, pero esa señal es una **ausencia**, y quien mira la consola acaba de
leer «esperando al agente hasta 120 s», que ya no describe lo que está pasando.
Una línea (`[servidor] esperando el plan de mapa del agente…`) lo cierra. Es
nuevo de este ciclo: antes del arranque asíncrono no había esta ventana.

**H6 · La invitación a conectar Claude Code se imprime ANTES del puerto.**
Ejecutado, en las diez corridas:

```
[servidor] esperando al agente hasta 3 s…
           conéctalo abriendo Claude Code en otra terminal de este proyecto…
[servidor] canal del agente en ws://localhost:19881     ← el dónde, después del cómo
```

`esperarAgente()` escribe síncrono y las dos líneas de `listening` llegan en el
tick siguiente. Con `HEROES_AGENT_PORT=0` se invita a conectar a un puerto que
todavía no se ha anunciado.

**H7 · `validateMapPlan` no mete `heroStarts` en `ocupar`.** Ejecutado: dos
héroes que arrancan en la misma casilla se aceptan, y un héroe que arranca
**encima del castillo rival** también. Ninguno revienta, los dos dan partidas
degeneradas (el agente pierde el día 3 en las dos corridas). El bucle de `ocupar`
(`generate.ts:110-114`) cubre pueblos, minas, recursos, monstruos y cofres; los
inicios no. Es la puerta de al lado del sitio donde este ciclo acaba de añadir
dos comprobaciones de unicidad.

**H8 · `towns[].owner` acepta cualquier entero.** Un tercer castillo con
`owner: 7` en una partida de dos jugadores entra: `validateMapPlan` solo exige
que cada jugador con inicio tenga pueblo, no que cada pueblo tenga jugador.
Ejecutado: no revienta, se comporta como un castillo capturable. El agente puede
así meter castillos que no salen de la comprobación de jugadores.

**H9 · Se mató uno de los tres muertos.** `AdventureTurnResponse`
(`agent.ts:148`) y `BattleTurnResponse` (`agent.ts:149`) son exports con **cero
consumidores** en `src`, `test` y `tools` — literalmente lo que era
`BanterResponse`, que este ciclo borró por ese motivo. El tercer hermano,
`MapGenerateResponse`, ganó su primer consumidor en `aa19d83`. Si el criterio es
«un tipo declarado sin uso es deuda», se aplicó a uno de tres.

**H10 · El test de `hero_banter` que «se queda con otro sentido» es
tautológico.** `test/qa-politica.test.ts:29-30` comprueba que `decidir` lanza con
`'hero_banter'` y con `'lo_que_sea'`. `decidir(kind: string)` no tiene ninguna
relación de tipos con `REQUEST_KINDS`, así que las dos filas ejercitan **la misma
rama `default`** y una es redundante por construcción. **Nada en el repo afirma
que `hero_banter` esté retirado**: si mañana volviera a `REQUEST_KINDS`, este
test seguiría verde y `pnpm qa` moriría en la primera escucha de ese kind. El
guardia que faltaría es el que compare los `case` de `decidir` contra
`REQUEST_KINDS` en las dos direcciones.

---

## Workarounds usados

| Workaround | ¿Afecta a quien juega? |
|---|---|
| Un **agente de mentira** propio (`.qa-sonda/agente-falso.ts`, ya borrado) atado por WebSocket en vez del puente MCP | **No.** Habla el mismo protocolo que `agent-link.ts` espera y por el mismo socket; es el sustituto de un modelo, no un atajo alrededor de nada. El circuito completo con puente MCP lo cubre `pnpm qa`, que también corrí |
| Puertos **19880/19881** en vez de los 9880/9881 por defecto | **No.** Se comprobaron libres antes; los puertos salen del entorno por diseño (#61) |
| `HEROES_WAIT_AGENT_MS` y `HEROES_MAX_DAYS` bajados | **No.** Son las mismas palancas que usa el arnés; lo que se mide es la forma del comportamiento, no el número |
| **`tools/qa/politica.ts` modificado** para ver morder el guardia | **No.** Restaurado desde una copia (`cp`, no `git checkout`); `git status --porcelain` vacío y `pnpm qa` verde después |
| El camino «agente mudo» observado 25 s en vez de los 300 s del plazo | **Sí, parcialmente**: confirmo que el servidor se queda bloqueado y mudo, no que se desbloquee sola a los 300 s. Eso lo cubre el test unitario con plazo corto |

Ninguna de las diez corridas necesitó estado sintético ni saltarse una pantalla:
todas arrancan donde arranca quien juega, con `pnpm partida`.

---

## No probado

1. **El navegador.** No pude conducir Chrome: la herramienta exige preguntar al
   usuario cuál de los navegadores conectados usar antes de cualquier acción, y
   desde este rol no hay a quién preguntar. **Sustituido por**: `pnpm dev` real
   (PID guardado, muerto por su grupo, `3100 libre` comprobado, dueño confirmado
   por `readlink /proc/41889/cwd`), `index.html` 200 y `session.ts` 200 sin
   ningún servidor de partida levantado; **cero ficheros de `src/client/` en el
   diff**; y el barrido de 4 720 planes, que es la única superficie de `core` que
   el cliente comparte con este cambio. La afirmación del informe sobre la
   consola limpia y el turno jugado a mano **no la he reproducido**.
2. **El plazo de 300 s de `ask` agotándose de verdad** en el circuito real. Visto
   que bloquea; no visto que suelte. Cubierto por test con plazo corto.
3. **El acuse del mapa aceptado leído por el arnés**: entra en el recuento de
   veredictos, nadie mira su texto de punta a punta. Lo leí yo por el cable en la
   corrida `bueno`, así que queda cubierto por otra vía.
4. **`pnpm banco`** no lo volví a correr: lo corrió el coordinador con el ancla
   intacta. Mi barrido de 4 720 planes ataca la misma pregunta con más margen.
5. **Un agente de verdad (un modelo) diseñando el mapa.** Todo lo que probé son
   planes que yo escribí. H1 es precisamente la predicción de qué hará uno real.

---

## Veredicto

**Apto con reservas.**

Lo que está bien está **muy** bien: los siete caminos de respaldo que sí caen de
pie caen de pie de verdad y en el circuito real, con el motivo llegando al agente
y a la consola; la espera doble está cerrada y cronometrada; la niebla de `map`
no tiene una sola fuga sobre 576 casillas y su descripción no miente en ninguna
de sus cuatro promesas; el cambio de `core` es inerte con 4 720 planes de margen;
la firma `qa-town-*` muerde también con una rotura que no es la de su autor; y no
queda un solo resto vivo de las dos amputaciones.

Las reservas son dos, y solo una es de peso:

- **H1 debe cerrarse antes de dar el hito por hecho.** Es el titular del ciclo
  —«los mapas los diseña ese mismo agente»— fallando por donde el ciclo anterior
  a este ya había aprendido: texto del agente usado verbatim. Un `z.enum` sobre
  los ids de `data/creatures.json`, o una comprobación en `validateMapPlan` con
  su frase, y el camino 8 se convierte en el camino 6.
- **H2 y H3** son baratas y conviene meterlas en la misma vuelta.

El resto son menores y ninguno impide usar lo entregado. Y una cosa que el
informe hace bien y merece decirse: **cada afirmación suya que fui a comprobar
resultó cierta**. Lo que falla no es lo que dice; es lo que no llegó a preguntarse.

El árbol queda limpio: `git status --porcelain` vacío, `pnpm verify` 325 verde y
`pnpm qa` 0 tras retirar todas las sondas.
