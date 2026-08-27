# Tanda 2 · El payload deja de mentir por omisión

## De dónde sale

Cita literal del usuario, tras cerrar la tanda 1:

> «Adelante con la tanda 2»

La tanda 2 la propuse yo al planificar el backlog y el usuario la aprobó con esa
frase. Son **#85, #84, #101 y #100**, y el hilo que las une es uno solo: **el
payload que recibe el agente calla algo que le hace falta, y el silencio no se
distingue de un dato ausente**. No es una metáfora, son cuatro formas del mismo
defecto:

| Issue | Qué se calla |
|---|---|
| **#85** | El terreno y los caminos: `knownMap` lleva `{width, height, objects}` y el agente planifica rutas sin saber por dónde se anda |
| **#84** | Por qué no hay `legalActions` cuando la batalla es tuya y el turno no |
| **#101** | **Cuáles** son los jugadores: se manda `players: 2`, un número, y el agente tiene que adivinar que son el 0 y el 1 |
| **#100** | Si `AdventureTurnResponse` y `BattleTurnResponse` son API pública o deuda: hoy el fichero no dice ni una cosa ni la otra |

Los cuatro caen en `src/core/contract/`, que es la frontera con el agente, así
que **`pnpm qa` es obligatorio** en esta tanda y no opcional.

> **Este documento lleva ya las correcciones del crítico** (`critica.md`), que
> falsificó dos premisas mías contra el código: la de #84 («le pasa también a
> `battle_turn`») y la de #101 («la comprobación se muere sola»). Las dos
> venían del texto de sus issues y las dos habían envejecido. Lo corregido va
> marcado **[corregido]**; lo que el crítico añadió, **[del crítico]**.

Y hay una **restricción dura que atraviesa las cuatro**: ninguna cambia una sola
decisión de la partida. `pnpm banco` tiene que salir con su ancla intacta
—`297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767`, 32 177
líneas— **byte a byte**. Si el ancla se mueve, algo se ha colado que no era de
esta tanda.

## Criterios de aceptación

### #85 — el mapa que se planifica a ciegas

1. Un agente que recibe `adventure_turn` puede decidir una ruta **sin llamar a
   ninguna tool**: sabe qué terreno tiene cada casilla que ha explorado y dónde
   hay carretera.
2. Lo que no ha explorado sigue siendo un **hueco explícito** (`null`), no el
   terreno por defecto: esa regla ya está escrita en `serializeKnownMap` y no se
   relaja.
3. La pieza ya existe —`serializeKnownMap(state, playerId)`, #74— y **no se
   escribe una segunda**: si el turno y la tool `map` devuelven lo mismo, lo
   devuelven desde el mismo sitio. Dos serializadores del mapa filtrado es
   exactamente la clase de duplicación que mordió en `MapPlan`.
4. `RESPONSE_FORMAT.adventure_turn` **nombra el dato nuevo**. La regla de la casa
   es explícita y está escrita en `serialize.ts` a cuenta de `level`: «un dato
   nuevo que el contrato no nombra es un dato que el agente no mira».
5. **El coste se mide, no se estima** — y **[del crítico]** ya está medido, con
   semillas 91, 7 y 2026: **+3 099 B el día 1** sobre un turno de 1 853-2 296 B
   (o sea **+135 % a +167 %: el payload del día 1 más que se duplica**),
   **+3 506 B el día 3** y **+3 685 a +3 901 B el día 6**. El ingeniero
   **reproduce** esas cifras con su implementación en `implementacion.md`; si no
   cuadran, es que no está reusando el serializador que ya hay.
6. `pnpm qa` sigue verde y su cobertura no baja. **[corregido]** Vale como
   **no-regresión y no como demostración del beneficio**: cubre 3 turnos de
   aventura (#60). No se escriba como si lo demostrara.
7. **[del crítico]** `MAPA_DESCRIPCION` (`src/server/mcp/server.ts:375`) le dice
   hoy al agente que el mapa de la tool «es lo mismo que viaja en `knownMap`
   dentro de adventure_turn». **Hoy es falso.** Al cerrar #85 esa frase queda
   verdadera sin tocarla — y se **comprueba que lo es, campo a campo**, en vez de
   darlo por supuesto. Una tool publicada que promete una identidad inexistente
   es de la especie de la cita falsa de la tabla de experiencia: nada se pone
   rojo.

### #84 — la ausencia que no se explica

1. **[corregido]** En la **consulta `battle_state`** de tu propia batalla,
   cuando el stack activo es del otro bando, la respuesta lleva una nota que dice
   por qué no hay `legalActions` — y no la lleva cuando sí las hay. La ausencia
   silenciosa existe en **una sola rama**, `src/server/consultas.ts:83`, la única
   de las tres sin nota. **En la petición empujada no ocurre nunca**:
   `director.ts:277` llama con `s.side`, que es el bando del stack activo, así
   que la condición de `serialize.ts:345` no falla jamás. **Esto no toca el
   payload de `battle_turn`**, al revés de lo que decía el issue.
2. La nota está escrita para quien la lee: dice de quién es el turno y qué puede
   hacer el agente al respecto (esperar a que le toque), no «campo omitido».
3. **[corregido]** El caso de **llevar los dos bandos**: «hoy `side` se fuerza a
   `'attacker'`» solo es cierto **llevando los dos** — `consultas.ts:80` es
   `suyos.has('attacker') ? 'attacker' : 'defender'`, así que quien solo defiende
   ve su bando. Y ese caso **el servidor publicado no lo produce**
   (`ws-server.ts:292` fija `agentPlayers: [1]`): es alcanzable en tests, no
   jugando. Se **dice**, y se dice también que hoy no se juega; no se arregla.
   Callarlo sigue sin valer.
4. **[corregido]** No se emite una sola acción legal que hoy no se emita, y la
   comprobación es de máquina. Pero el guardia de #73 cubre **solo la batalla
   ajena** (`agent-link.test.ts:584`), así que el test que falta no es
   re-verificar #73: es **el de esta rama** — propia, stack activo del otro
   bando, `legalActions` ausente **y** nota presente.
5. La descripción de la tool `battle_state` cuadra con lo que la tool hace: hoy
   documenta la ausencia solo para la batalla ajena.
6. **[del crítico]** La nota va en `consultas.ts`, **junto a las otras dos, y no
   en `serializeBattleTurn`**: las otras dos las pone el servidor por encima del
   objeto serializado (`consultas.ts:71` y `:85`), y un `note` nacido en `core`
   chocaría con esos dos *spreads* — dos redacciones del mismo campo, una pisando
   a la otra según la rama.

### #101 — cuántos, no cuáles

1. `serializeMapRequest` manda **los ids**: `players: [0, 1]`, no `players: 2`.
2. `RESPONSE_FORMAT.map_generate` deja de apoyarse en la convención en prosa
   («numerados desde 0») para decir qué jugadores colocar: el dato se lee del
   payload.
3. **[corregido, invertido]** La comprobación de jugadores de
   `loQuePidioElServidor` (`src/server/mapa-del-agente.ts`) **no se muere ni se
   mueve**. La promesa central del issue —«`jugadoresCambiados` se muere sola»— es
   falsa y yo la heredé: nombrar los ids quita la **ambigüedad**, no la
   **desobediencia**. Un agente puede leer `players: [0, 1]` y devolver
   `heroStarts` con los jugadores 3 y 4, y eso sigue dejando la partida sin un
   solo turno en silencio. **Lo que muere es la convención en prosa**, no el
   guardia.
4. Un plan que trae los jugadores 3 y 4 se sigue rechazando **con su motivo**, y
   hay test. Que el contrato deje de ser ambiguo no es excusa para quitar el
   guardia: se comprueba que sigue mordiendo, no se supone.
5. **[corregido]** El orden de `heroStarts` ya no decide nada —`setup.ts:71`
   ordena y `RESPONSE_FORMAT` ya lo dice—, así que esa mitad del issue está
   **hecha**: es no-regresión, no trabajo.
6. **[del crítico, obligatorio]** El último párrafo del docstring de
   `loQuePidioElServidor` (`mapa-del-agente.ts:105-106`) dice hoy «el día que el
   payload lleve los ids, media comprobación se muere sola». Si se cambia el
   payload y se deja esa frase, queda escrita **la instrucción para que el
   siguiente lector borre un guardia vivo**. Se le da la vuelta.
7. **[del crítico]** #102 toca el mismo bloque de prosa (el párrafo del tamaño):
   **#101 no lo reescribe**.

### #100 — API o deuda, pero dicho

1. **[del crítico — decisión tomada: SE BORRAN]**, con las dos pruebas que el
   issue no tenía: `package.json:5` es `"private": true`, así que el cliente de
   fuera de este repo que justificaría «API pública» **no existe**; y
   `agent-link.ts:231` ya tipa `ask()` con
   `z.infer<(typeof responseSchemas)[K]>` **en el sitio** — el único consumidor
   real del contrato ya demuestra la forma que el issue proponía para el día que
   alguien necesite el tipo.
2. `pnpm verify` verde y `MapGenerateResponse` se queda, **con su consumidor**
   (`mapa-del-agente.ts:53`) — se queda por eso y no por ser más importante.
3. El criterio queda escrito **en `agent.ts`, no en el commit**, y enunciado para
   el **siguiente** tipo: *se exportan los **esquemas**, que es lo que valida y de
   lo que todo se deriva; un alias de `z.infer` se escribe donde se usa, y un tipo
   que ningún `import` nombra se borra.*

## Fuera de alcance

Se dice para que nadie lo amplíe:

- **#34** (que el navegador juegue contra el servidor) — es la atadura de #64 y
  una decisión que el usuario no ha tomado.
- **#103, #104, #105** — los tres del espectador, abiertos ayer en la tanda 1.
- **#33** está **cerrado**: la tool `map` ya está publicada. Esta tanda no la
  toca salvo por lo que #85 comparta con ella.
- Nada de arte, nada de `tools/gen/`: **cero euros de fal.ai**.
- No se toca la IA de reglas ni la economía: si el ancla de `pnpm banco` se
  mueve, es un error de esta tanda.

## Preguntas abiertas, con su suposición por defecto

Van aquí para que las recoja el crítico, en vez de que las decida el ingeniero a
mitad de camino:

> **Las cuatro están resueltas por `critica.md`.** Se dejan escritas con su
> respuesta porque la pregunta 1 se contestó **midiendo** y la medida es el
> resultado más útil del ciclo hasta aquí.

1. **RESUELTA: #85 es VIGENTE y se hace, sin deltas.** El argumento de que el
   terreno es estático y basta con cachearlo **es falso como argumento**: el
   terreno no cambia, pero **lo que el agente conoce crece cada día** — 14 % del
   mapa el día 1, 38 % el día 3, 49-64 % el día 6. Cachear la llamada del día 1
   es planificar el día 6 con el 14 % del mapa; repedirla cada turno cuesta **los
   mismos bytes más una vuelta de canal**. Y un esquema de **deltas queda
   prohibido en esta tanda**: ahorraría ~85 % a cambio de que el servidor recuerde
   qué mandó por un canal que este repo admite que pierde mensajes, y un mensaje
   perdido corrompería el mapa del agente el resto de la partida **en silencio**
   — justo el defecto que esta tanda existe para cerrar. Texto original:  El
   issue se escribió cuando la tool `map` no existía; **#33 la publicó**. Hoy el
   agente ya puede pedir el mapa filtrado cuando quiera. Entonces #85 es «además,
   empújaselo en cada turno», que cuesta ~4 KB por turno para un dato que **no
   cambia** —el terreno es estático— y que el agente ya puede tener cacheado
   desde el primer día.
   *Por defecto se hace igual*, porque «puede pedirlo» y «lo tiene delante» no son
   lo mismo para un agente que decide en un turno; pero si el crítico lo declara
   redundante, o lo reencuadra a «mandarlo solo lo que cambió» o «mandar el
   terreno una vez y luego los deltas», eso manda sobre este documento.
2. **RESUELTA: se borran** (ver #100, criterio 1). Texto original:
   **#100 no tiene defecto y no lo voy a inventar.** Las dos lecturas del issue
   son buenas y la decisión es de criterio, no de código. Que el crítico elija
   una y la razone; lo que **no** es aceptable es dejarlo como está.
3. **RESUELTA: se dice y no se arregla**, y se dice además que **hoy no se
   juega** (`ws-server.ts:292`). Texto original: **#84, punto 3 — los dos
   bandos.** Por defecto se **dice** y no se arregla:
   emitir las acciones legales del defensor cuando el agente lleva los dos bandos
   es tocar una vista que tiene un solo punto de vista por decisión escrita, y eso
   es más grande que una nota. Si el arquitecto ve que sale barato, adelante.
4. **RESUELTA: el tamaño se queda donde está**, y la de jugadores **también** —
   ver el criterio 3 invertido. Bajar a `validateMapPlan` no sale gratis: solo
   recibe el plan, así que saber **cuáles** exige pasárselos, o sea el mismo dato
   viajando igual con `core` enterándose de quién pidió el mapa. Texto original:
   **#101 y el tamaño.** `loQuePidioElServidor` comprueba **dos** cosas y solo
   una se muere. Si al arquitecto le sale que el tamaño también puede bajar a
   `validateMapPlan` sin que `core` tenga que saber quién pidió el mapa, que lo
   diga; por defecto se queda donde está, con su docstring corregido.

## Verificación

- **`pnpm verify`** — 392 tests hoy; los nuevos se suman.
- **`pnpm banco`** — ancla intacta, byte a byte. Es el guardia de que nada de
  esto cambió la partida.
- **`pnpm qa`** — obligatorio: las cuatro tocan `src/core/contract/` o
  `src/server/`.
- **La medida de #85** — bytes por turno antes y después, en `implementacion.md`.
- **El espectador en el navegador** si algo toca el canal o `html.ts`. No debería.
