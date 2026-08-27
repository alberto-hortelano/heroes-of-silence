# QA · Tanda 2 «El payload no miente por omisión»

Validado contra `requisitos.md` (los criterios literales, ya corregidos por el
crítico), no contra `plan.md` ni contra `implementacion.md`. El diff está en el
árbol, sin commitear, y **lo dejo como lo encontré**: todo lo que rompí para
probarlo se restauró desde una copia hecha antes, y lo comprobé fichero a fichero
con `cmp`.

**Veredicto: APTO.** Los quince criterios se cumplen, `pnpm verify` 402/402,
`pnpm banco` con su ancla `297dbef9…` y 32 177 líneas, `pnpm qa` exit 0, y la
identidad que #85 promete la verifiqué **por las dos puertas publicadas de
verdad** (cliente MCP contra el servidor de la partida), no por
`responderConsulta`. No hay ningún fallo funcional: verifiqué aparte que la
máscara de niebla del terreno es correcta casilla a casilla en estados con niebla
asimétrica.

Lo que sí traigo son **dos hallazgos importantes que no rompen nada hoy y que
esta casa trata como defecto de primera clase**: un guardia que **no puede
morder** y una rama **que no se alcanza jugando** sin que esté dicho. Los dos se
arreglan barato —un test y una frase— y ninguno justifica un NO APTO.

---

## Criterios de aceptación

### #85 — el mapa que se planificaba a ciegas

| Criterio | | Evidencia |
|---|---|---|
| 1 · el agente decide ruta sin llamar a ninguna tool | ✅ | Cliente MCP real contra `ws-server.ts`: en los **3** `adventure_turn` empujados el payload trae `knownMap` con `terrain` de 576 casillas (81 → 105 → 108 conocidas) y la prosa embebida. Terrenos vistos por el agente: `rough, grass, dirt` |
| 2 · lo no explorado sigue siendo `null` | ✅ | Verificación **independiente** (no reusa la expresión de índice de la implementación) sobre semillas 91/7/2026 al **día 6**, con niebla asimétrica: `casillas_con_mascara_mal=0`, `terreno_mal=0` en las tres. El guardia que lo vigila, en cambio, es inerte → **hallazgo 1** |
| 3 · un solo serializador | ✅ | `grep`: `serializeKnownMap` tiene exactamente dos llamantes (`consultas.ts:122` y el `knownMap` del turno). Identidad medida por el cable, ver criterio 7 |
| 4 · `RESPONSE_FORMAT.adventure_turn` nombra el dato | ✅ | Prosa volcada entera y leída: viñeta `"knownMap"` con `"terrain"`, `"roads"`, el índice `y*width+x`, el `null` como ignorancia y el agua. Sonda: reescribir la prosa a mano (una palabra distinta) → `pnpm verify` rojo |
| 5 · el coste se mide | ✅ | **Reproduje las nueve celdas**: día 1 `+3 099 B` (+167 / +135 / +149 %), día 3 `+3 506 B`, día 6 `+3 685 / +3 901 / +3 859 B`, con 81 / 217 / 282-368 casillas conocidas. Idénticas al informe |
| 6 · `pnpm qa` verde y sin bajar cobertura | ✅ | `exit=0`, `19 veredictos, 19 entraron, 0 descartadas`, `1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla`, las seis consultas ejercidas |
| 7 · `MAPA_DESCRIPCION` pasa a ser verdad, campo a campo | ✅ | **Más fuerte que el test**: instrumenté un cliente MCP real y comparé, en cada `adventure_turn` empujado, `payload.knownMap` con el resultado de la tool `map` por `deepStrictEqual`. `IDENTIDAD OK` en los tres turnos, claves `height,objects,roads,terrain,width` |

### #84 — la ausencia que no se explica

| Criterio | | Evidencia |
|---|---|---|
| 1 · nota en la rama de `consultas.ts` | ✅ | Implementada y probada. Sonda A (quitar la nota) → rojo `.toMatch() expects a string, but got undefined`. Alcanzable **solo en tests** → **hallazgo 2** |
| 2 · escrita para quien la lee | ✅ | «…el turno lo tiene una unidad del bando attacker y tú llevas el defender: la lista es siempre la del stack activo… cuando le toque a una unidad tuya, el servidor te pedirá "battle_turn" con la lista ya hecha» |
| 3 · el caso de los dos bandos se dice, y se dice que hoy no se juega | ✅ | Comentario en `consultas.ts` («`ws-server.ts` fija `agentPlayers: [1]`»). Sin test, declarado por el ingeniero |
| 4 · no se emite una acción legal que hoy no se emita; test de ESTA rama | ✅ | Sonda B (nota siempre) → rojo `no hay nada que explicar cuando el campo está`. Las dos direcciones cubiertas |
| 5 · la descripción de la tool cuadra | ⚠️ | La leí llegar a un cliente MCP real. Cubre la rama nueva, pero promete un pelo más de lo que da la nota ajena → **hallazgo 5** |
| 6 · la nota va en `consultas.ts`, no en `core` | ✅ | `sinAccionesLegales` vive en `consultas.ts`; `serializeBattleTurn` no toca `note` |

### #101 — cuántos, no cuáles

| Criterio | | Evidencia |
|---|---|---|
| 1 · `players: [0, 1]` | ✅ | Payload volcado: `"want": { "width": 24, "height": 24, "players": [0,1], "theme": … }`. `palette.terrains` sale **idéntica** a la lista de antes tras derivarse de `TERRAIN_KINDS` |
| 2 · la prosa deja de apoyarse en la convención | ✅ | «"heroStarts" tiene que traer EXACTAMENTE los jugadores de "want.players"…». Y `not.toMatch(/numerados desde 0/)` |
| 3 · el guardia no se muere ni se mueve | ✅ | `loQuePidioElServidor` intacto, con sus dos comprobaciones |
| 4 · un plan con los jugadores 3 y 4 se rechaza con su motivo | ✅ | Test vivo: `falta la posición de inicio del jugador 0/1` + `el jugador 3/4 no juega esta partida` |
| 5 · el orden de `heroStarts` no decide nada (no-regresión) | ✅ | La viñeta del orden sigue en `RESPONSE_FORMAT.map_generate`, sin tocar |
| 6 · el último párrafo del docstring, invertido | ✅ | «hay que leer lo contrario: **no se muere ninguna**… Lo que murió es la convención, no el guardia» |
| 7 · #101 no reescribe el párrafo del tamaño (#102) | ✅ | El diff de `RESPONSE_FORMAT.map_generate` toca **una** viñeta, la de `heroStarts` |

### #100 — API o deuda, pero dicho

| Criterio | | Evidencia |
|---|---|---|
| 1 · se borran los dos alias | ✅ | `AdventureTurnResponse` / `BattleTurnResponse` fuera; `grep` no los encuentra en el repo |
| 2 · `pnpm verify` verde y `MapGenerateResponse` se queda con su consumidor | ✅ | 402/402; `mapa-del-agente.ts:20` lo importa |
| 3 · el criterio queda escrito en `agent.ts` | ✅ | Escrito, y enunciado para el siguiente tipo. Con una excepción que el propio diff se salta → **hallazgo 3** |

### La restricción que atraviesa las cuatro

| | | Evidencia |
|---|---|---|
| `pnpm banco` byte a byte | ✅ | `sha256: 297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767`, `líneas: 32177`, `sin terminar: 0/200`, corrido **después** de restaurar todas mis sondas |
| `pnpm verify` | ✅ | `Test Files 18 passed (18) · Tests 402 passed (402)` |
| El navegador (el cliente usa el `movableCosts` que cambió) | ✅ | `pnpm dev` + Chrome en `?seed=92`: el mapa pinta, un clic mueve al héroe **1100 → 720** puntos y la niebla se abre, cinco `Fin de turno` llevan la partida a su final normal con la crónica poblada, y la consola no tiene **ni un error** (solo `[assets] 139 imágenes generadas cargadas`) |
| El espectador | ⚠️ no probado, no procede | Ni `html.ts`, ni `espectador/`, ni el canal están en el diff; `vista-espectador.ts` mantiene su propio serializador con `roads: string[]` y su inversa |

---

## Hallazgos

### 1 · IMPORTANTE — el guardia de la niebla de #85 no puede morder: el generador pone SIEMPRE los inicios en la diagonal

El ingeniero encontró que una sonda suya salía verde porque todas las fixturas de
camino estaban en la diagonal, y lo cerró: movió las tres fuera y escribió el test
de `pointFromKey`. **Lo confirmé —la sonda ahora saca 4 rojos— y el mismo agujero
sigue abierto una función más allá**, en el sitio que sostiene el criterio 2 de
#85.

El test que dice comprobar «el `null` es **EXACTAMENTE** la niebla, casilla a
casilla» calcula el índice con **la misma expresión que la implementación**:

```ts
// implementación, serialize.ts
terrain.map((t, i) => player.fog.has(pointKey({ x: i % width, y: Math.floor(i / width) })) ? t : null)
// test, agent-contract.test.ts
const explorada = jugador.fog.has(pointKey({ x: i % width, y: Math.floor(i / width) }));
expect(terrain[i] === null).toBe(!explorada);
```

Es un espejo: solo puede fallar si la máscara de la implementación y la del test
difieren, y difieren únicamente cuando la niebla **no es simétrica**. Y no lo es
nunca en las fixturas, por un motivo que no sabía nadie:

```
seed=92   p=0 conocidas=81 asimetrias=0 heroe=(4,4)   pueblo=(3,3)
seed=403  p=0 conocidas=81 asimetrias=0 heroe=(4,4)   pueblo=(3,3)
seed=407  p=1 conocidas=81 asimetrias=0 heroe=(19,19) pueblo=(20,20)
seed=410  p=1 conocidas=81 asimetrias=0 heroe=(19,19) pueblo=(20,20)
…las siete semillas que probé, los dos jugadores: idéntico
```

**El generador procedimental coloca a los dos jugadores en la diagonal, en todas
las semillas**, sobre un mapa **cuadrado**: el héroe 0 en (4,4) con su castillo en
(3,3), el 1 en (19,19) con el suyo en (20,20). Un cuadrado de radio 4 centrado en
la diagonal es simétrico bajo transponer, así que la máscara de niebla del día 1
es **idéntica a su transpuesta**. Y sigue siéndolo el día 3, porque la IA se mueve
en diagonal:

```
seed=91  dia=1 conocidas=81  casillas_mal_al_transponer=0
seed=91  dia=3 conocidas=217 casillas_mal_al_transponer=0
seed=91  dia=6 conocidas=282 casillas_mal_al_transponer=130
seed=7   dia=6 conocidas=368 casillas_mal_al_transponer=154
seed=2026 dia=6 conocidas=350 casillas_mal_al_transponer=182
```

(Que las nueve medidas del coste den `81` y `217` **conocidas para las tres
semillas** es el mismo síntoma visto por otro lado.)

**Reproducción**, desde el árbol limpio:

1. En `src/core/contract/serialize.ts`, dentro de `serializeKnownMap`, cambiar
   `{ x: i % width, y: Math.floor(i / width) }` por
   `{ x: Math.floor(i / width), y: i % width }` — el terreno que recibe el agente
   queda **transpuesto**.
2. `pnpm verify` → **402 passed (402). Verde.**

Es decir: **no hay un solo test en el repositorio que vea el mapa del agente del
revés**, y con esa transposición un agente al día 6 recibiría entre 130 y 182 de
576 casillas etiquetadas al revés —el 23-32 % del mapa— justo para lo que #85
existe, elegir el `to` de un `move_hero`. `pnpm banco` tampoco lo ve: no
serializa.

**No es un bug**: comprobé aparte, con una formulación independiente que recorre
`(x,y)` y construye la clave a mano, que la implementación es correcta en estados
con niebla asimétrica (`casillas_con_mascara_mal=0` y `terreno_mal=0` en las tres
semillas al día 6). Lo que falta es el guardia.

**Qué esperaba quien lo lee:** que un test titulado «el `null` es EXACTAMENTE la
niebla, casilla a casilla» pudiera ponerse rojo. La lección que este mismo ciclo
escribió —«lo estrecho era la batería, no la idea»— se aplicó a `pointFromKey` y
no a la función de al lado. Lo barato: afirmar la máscara sobre un estado con
niebla **asimétrica** (día ≥ 6, o un mapa **no cuadrado**), y sin reusar la
expresión de índice del código.

### 2 · IMPORTANTE — la rama de #84 no se alcanza jugando, y eso no está dicho

El requisito da por hecho que la ausencia se alcanza **consultando**: «En la
consulta `battle_state` de tu propia batalla, cuando el stack activo es del otro
bando…», y el comentario del código refuerza esa lectura al decir solo que «en la
petición empujada no pasa nunca». **Medido: tampoco pasa consultando, con el
servidor publicado.**

`director.playBattle()` aplica las acciones del rival **de forma síncrona**, sin
un solo `await` dentro del `while`:

```ts
if (!bandos.has(s.side)) {
  applyAction(battle, chooseBattleAction(battle), this.ctx.rng);
  this.frame();
  continue;
}
const respuesta = await this.link.ask('battle_turn', …)
```

El único punto en que el bucle de eventos queda libre —y por tanto el único en
que una consulta por WebSocket se puede atender— es ese `await`, y en ese momento
el stack activo **es el del agente**. Lo mismo en `playAgentTurn`: no hay `await`
entre el `applyAdventureAction` que abre la batalla y el `await this.playBattle()`.

**Reproducción** (arnés instrumentado, copia de `tools/qa/verify-agent.ts` fuera
del repo, cliente MCP real contra el servidor real):

- consultar `battle_state` en cada `battle_turn`: **15 de 15** con `legalActions`
  presente (`38, 32, 16, 40, 16, 32, 12, 11, 14, 14, 10, 13, 10, 13, 10`) y
  **sin nota**;
- consultar en bucle **justo después** de `heroes_respond`, mientras el servidor
  juega los stacks del rival: ~325 sondeos, `AUSENCIAS de legalActions alcanzadas
  jugando: 0`.

**Qué esperaba quien lo lee:** el propio criterio 3 de #84 obliga a decir del caso
de los dos bandos que «hoy no se juega». La rama principal está en la misma
situación y no lo dice — y además la descripción de la tool ya le anuncia al
agente un caso que el servidor publicado no produce, que es la forma exacta de lo
que le pasó a `hero_banter`. **El arreglo es una frase**, no código: que el
comentario diga que hoy tampoco la alcanza una consulta, y por qué (`playBattle`
no cede el bucle de eventos entre acciones del rival). La nota, cuando la rama se
alcance, está bien escrita.

### 3 · MENOR — `PeticionDeMapa` es justo el tipo que el criterio de #100 dice que se borra

El mismo diff escribe en `agent.ts` el criterio «**un tipo que ningún `import`
nombra se borra**» … y crea en `mapa-del-agente.ts` un
`export type PeticionDeMapa = MapRequestOptions;` que **ningún fichero importa**
(`grep`: solo se usa dentro de su propio módulo, dos veces, donde cabría escribir
`MapRequestOptions`). Y de rebote, el docstring de `MapRequestOptions.players`
quedó citándose a sí mismo: «El llamante tiene la lista en la mano
(`PeticionDeMapa.players`) y la tiraba con un `.length`» — desde que los dos
nombres son el mismo tipo, esa frase dice que `MapRequestOptions.players` es
`MapRequestOptions.players`.

Reproducción: `grep -rn "PeticionDeMapa" src/ test/ tools/`.

### 4 · MENOR — la lista de campos de `knownMap` sigue escrita a mano en las dos puertas

`COMO_SE_LEE_EL_MAPA` unificó las viñetas, pero la línea que las **introduce**
—la que enumera los campos— sigue duplicada, justo encima del bloque compartido:

- `agent.ts`: «Trae width, height, terrain[], roads[] y objects[]:»
- `mcp/server.ts`: «Devuelve width, height, terrain[], roads[] y objects[]:»

El guardia de las dos mitades comprueba `includes(COMO_SE_LEE_EL_MAPA)` y no mira
esa línea, así que un campo nuevo en `serializeKnownMap` deja **las dos**
desactualizadas sin que el guardia diga nada. Lo salva a medias el test de
`agent-link` que ancla las cinco claves (`height, objects, roads, terrain, width`):
añadir un campo se pone rojo ahí, y quien lo arregle tiene que acordarse de los
dos textos. Se apunta porque el docstring del bloque promete lo contrario: «quien
edite la función de arriba tropieza con esto».

### 5 · MENOR — la descripción de `battle_state` promete un pelo más de lo que da la nota ajena

La descripción nueva termina en «En los dos casos la nota de la respuesta dice
**cuál de las dos ausencias** es». La nota de la batalla **propia** nombra el
campo («esta batalla no viene con "legalActions" porque…»); la de la batalla
**ajena** no lo nombra en ningún sitio: dice «…sin su maná ni su libro de
hechizos, y no juegas tú». Un agente que pierde el campo y va a la nota a ver cuál
de las dos ausencias le tocó encuentra la respuesta implícita, no la que se le
anuncia.

Reproducción: `sed -n '66,72p' src/server/consultas.ts` (la nota) contra la
descripción de la tool, que se lee con un cliente MCP en `listTools`.

### 6 · MENOR — `game_state` es una tercera puerta del mismo `knownMap`, y no lo describe

`responderConsulta('game_state')` devuelve `serializeAdventureTurn`, o sea el
**mismo** `knownMap` con terreno y caminos; su descripción publicada es «Estado de
la partida desde tu punto de vista, sin esperar turno», sin una palabra de cómo se
lee. La prosa solo viaja con el `adventure_turn` empujado y con la tool `map`. Es
la forma que ya tenía esa tool —tampoco describe `recentEvents`, `towns[].teaches`
ni el resto—, así que va como observación y no como regresión; pero el bloque
compartido habla de «las **dos** puertas» y son tres emisores.

### 7 · MENOR — `validateMapPlan`, la «puerta única», no mira `roads`; lo que impide que `pointFromKey` lance es zod

`pointFromKey` cambió el comportamiento de `movableCosts`: una clave malformada
que antes se **saltaba** (`continue`) ahora **lanza**, dentro del Dijkstra que
corre en cada turno. **Lo perseguí hasta el final y hoy no es alcanzable jugando**,
pero no por donde el repositorio dice que se vigila:

```
road={"x":3.5,"y":7}    → zod rechaza
road={"x":-0,"y":7}     → ZOD ACEPTA · validateMapPlan: ACEPTA · roads=["0,7"] · reachableFrom OK
road={"x":1e21,"y":7}   → ZOD ACEPTA · validateMapPlan: ACEPTA · roads=[]      · reachableFrom OK
road={"x":-1,"y":7}     → ZOD ACEPTA · validateMapPlan: ACEPTA · roads=[]      · reachableFrom OK
road={"x":NaN,"y":7}    → zod rechaza
```

Quien tapa el agujero es `pointSchema` (`z.number().int()`) en el camino del
agente, más el `if (inBounds)` de `buildMap`; **`validateMapPlan` no mira `roads`
en absoluto**, y es a quien `CLAUDE.md` señala como «la puerta única por la que
pasan los dos productores de planes», precisamente porque un enum «habría dejado
al generador de casa sin vigilar». Hoy el generador de casa no dibuja caminos, así
que no muerde nadie. La comprobación de límites que sí sigue saltándose **está
donde debe** (después de `pointFromKey`, dentro del bucle), aunque `buildMap` ya
la haya hecho antes.

De paso, y de la misma especie que esta tanda: un camino fuera del mapa que el
agente pide se **tira en silencio** en `buildMap`, sin un problema en la lista.

### 8 · MENOR — la prosa dejó de nombrar el campo `movePoints`

Antes decía `"heroes[].movePoints"`; al compartirse con la tool `map` —que no trae
héroes— pasó a «Compáralo con los puntos de movimiento del héroe». El campo existe
y se llama `movePoints` (`claves del héroe en el payload: id, name, at, level,
movePoints, maxMovePoints, …`), así que el agente lo encuentra; se apunta porque el
criterio 4 de #85 es exactamente «nombrar el dato», y es el único de los tres
campos nuevos que perdió su nombre por el camino.

---

## Lo que sí comprobé y salió bien, por si alguien lo duda después

- **Los costes que se le anuncian al agente son los que se le cobran al héroe.**
  Medido moviendo un héroe una casilla en la partida de verdad:
  `recto: terreno=dirt pagado=100 anunciado=100 OK` y
  `diagonal: terreno=dirt pagado=140 anunciado=140 OK`. Y en el navegador,
  1100 → 720 en tres pasos.
- **La prosa se lee bien por las dos puertas.** La volqué entera desde
  `RESPONSE_FORMAT.adventure_turn` y desde `listTools` de un cliente MCP real. La
  sangría de dos espacios funciona en las dos: en el turno queda anidada bajo la
  viñeta `- "knownMap"`, y en la tool queda como lista bajo la línea que acaba en
  dos puntos. Lo único feo es que la fila de costes es **una sola línea de 223
  caracteres**; se lee, pero es la única del bloque que se sale.
- **Las dos mitades del guardia de la prosa muerden cada una lo suyo**, rotas por
  separado:
  - reescribir a mano la prosa de `RESPONSE_FORMAT` → `pnpm verify` **rojo** (1
    test) y `pnpm qa` **exit 0**;
  - reescribir a mano `MAPA_DESCRIPCION` → `pnpm verify` **verde (402)** y
    `pnpm qa` **exit 1**: `la descripción de la tool "map" ya no lleva
    COMO_SE_LEE_EL_MAPA: el mismo objeto ha vuelto a tener dos prosas`.
- **La sonda de `pointFromKey` que salió verde al ingeniero ahora sale roja**:
  intercambiar x por y saca **4 tests** (`pointFromKey es la inversa EXACTA…`, el
  del terreno de #85 y los dos de la consulta `map`).
- **Las sondas de #84 muerden**: quitar la nota → rojo; emitirla siempre → rojo
  con un texto que se contradice solo.
- **El ancla de `pnpm banco` sobrevivió a todas mis sondas**: la corrí al final,
  con el árbol ya restaurado, y salió `297dbef9…` / 32 177 líneas.

## Workarounds usados

| Workaround | Veredicto |
|---|---|
| Copié `tools/qa/verify-agent.ts` fuera del repo y le añadí mis comprobaciones, en vez de tocar el fichero | No afecta a nadie: el arnés del repo quedó intacto y lo que ejercité es el **mismo** servidor y el **mismo** puente MCP |
| Para ver `MAPA_DESCRIPCION` hay que arrancar el puente MCP como cliente, porque `mcp/server.ts` se autoarranca al importarlo | **No es un obstáculo del agente**: el agente la recibe por `listTools` sin hacer nada. Es un obstáculo del **verificador**, y por eso la mitad del guardia vive en `pnpm qa`, que es la decisión correcta |
| Para probar `roads` hay que plantar un camino a mano | **Sí toca a quien lo usa** → ver «no probado»: `roads` viaja vacío en toda partida de hoy |
| Rompí siete veces el código para ver morder los guardias | Restaurado desde copia previa y verificado con `cmp` fichero a fichero; `pnpm verify` 402/402 y `pnpm banco` con el ancla, después |

## No probado

- **El beneficio de #85.** Nadie ha medido que un agente con terreno decida mejor,
  y yo tampoco: haría falta un agente de verdad, no la política tonta de
  `pnpm qa`. Declarado por el ingeniero y confirmado.
- **La mitad de `roads` de #85, de punta a punta.** En el flujo real `roads` sale
  **`[]` en los tres turnos**, porque `generateMapPlan` no dibuja caminos y el plan
  de la política de `pnpm qa` tampoco. Los `+3 099 / +3 506 / +3 901 B` medidos son
  terreno puro. El día que un agente dibuje caminos, ese campo se estrena en
  producción sin haber pasado por el flujo real ni una vez.
- **La nota de los dos bandos.** `ws-server.ts` fija `agentPlayers: [1]`; sin test
  y sin camino de juego.
- **La rama de `sinAccionesLegales` con `activeStack === null`.** Defensiva: para
  alcanzarla haría falta un `pendingBattle` vivo sin unidad activa, y el bucle de
  `playBattle` resuelve y liquida antes de ceder el control.
- **El espectador en el navegador.** No procede: el diff no toca `html.ts`, ni
  `espectador/`, ni el canal, ni `vista-espectador.ts`.

---

## Veredicto

**APTO.** Los cuatro issues están cerrados contra sus criterios literales, la
promesa central de la tanda se cumple —el payload ya no calla el terreno, ni el
motivo de una ausencia, ni cuáles son los jugadores— y la identidad que #85
prometía la verifiqué por las puertas publicadas de verdad y no por un atajo.
Nada bloquea.

Antes de cerrar, dos cosas que cuestan poco y que esta casa no suele dejar
pasar: **el hallazgo 1**, porque hay un guardia que no puede ponerse rojo y su
título dice que sí (y la fixtura que lo tapa —los inicios siempre en la diagonal
de un mapa cuadrado— tapará a la siguiente igual), y **el hallazgo 2**, porque
una rama que no se alcanza jugando hay que decirlo donde se dijo del caso de al
lado. Ninguno de los dos es código.

---

## Resolución (coordinación, tras el informe)

Los **dos hallazgos importantes se arreglaron antes de commitear**, y el primero
se arregló porque QA acertó en algo más grande que el hallazgo: el guardia no
podía morder **y la fixtura que lo tapaba es estructural**, no de esa semilla.

**1 · El barrido de la niebla era un espejo.** El test sacaba la casilla del
índice con `{x: i % width, y: Math.floor(i / width)}`, que es **la misma
expresión que la implementación**, y encima la niebla de una partida joven es
simétrica bajo transponer porque el generador pone los dos inicios en la
diagonal de un mapa cuadrado —(4,4) y (19,19)—. Hacían falta las dos mitades y
se pusieron las dos: el barrido recorre ahora **(x, y) y calcula el índice**, y
el fixture **fuerza una casilla explorada cuya transpuesta no lo está**,
comprobándolo en vez de suponerlo. Visto morder: transponer el índice en
`serializeKnownMap` sale ahora **`(1,0): expected true to be false`**, donde
antes dejaba los 402 en verde.

**2 · La rama de #84 no se alcanza jugando, y ahora lo dice.** El comentario
decía solo que la petición empujada no falla nunca la condición, lo que invitaba
a creer que la consulta sí llegaba. Ahora dice también que `playBattle` aplica
las acciones del rival de forma síncrona, así que **no hay ventana entre dos
`heroes_respond`**, con la medida de QA —15 de 15 y ~325 sondeos, cero
ausencias— y con el motivo por el que se escribe igual: el día que la ventana
exista, la ausencia volvería a ser muda. Lo que no se hace es contarlo como
cubierto.

**Los cinco menores, también dentro:** `PeticionDeMapa` era un alias exportado
que nadie importaba —justo lo que el criterio de #100 escrito en este mismo diff
manda borrar—, así que la firma usa `MapRequestOptions` directamente; la lista de
campos de `knownMap` se fue **dentro** del bloque compartido, que era donde
tenía que estar; la nota de la batalla ajena nombra ya `legalActions`, que es lo
que su descripción prometía; y la prosa recupera el nombre `"movePoints"`, para
que el agente pueda buscarlo en el payload.

Lo declarado **no probado** se queda como está y se publica: el beneficio de #85
—que un agente con terreno decida mejor— sigue sin medirse, la mitad de `roads`
no viaja en ninguna partida de hoy, y la nota de los dos bandos no la ejerce
nadie. Es información, no deuda tapada.

`pnpm verify` 402/402 · `pnpm banco` `297dbef9…` / 32 177 líneas · `pnpm qa`
exit 0, los tres corridos después de restaurar cada sonda.
