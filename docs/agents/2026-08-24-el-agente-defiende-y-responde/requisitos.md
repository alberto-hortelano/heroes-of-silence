# El agente defiende, y se entera de cómo le fue — requisitos

## Petición

> «Perfecto, por donde seguimos?»

El usuario eligió, entre cuatro racimos ofrecidos, **«El agente defiende y
recibe respuesta (#29 #31)»**.

Es el racimo que toca el bucle del agente, que es donde este proyecto se juega
su tesis: `CLAUDE.md` dice que el juego es el andamio y lo interesante es lo que
se enchufa dentro. Hoy el agente juega **la mitad de sus batallas** y recibe
realimentación **solo cuando se equivoca**.

## Estado verificado (ejecutado y leído, no supuesto)

### #29 — el agente nunca defiende

`director.ts:122` lo dice literalmente: `const suBando = 'attacker' as const`,
con el comentario «el agente es siempre el atacante aquí: la batalla nace de su
movimiento». Y es cierto **por construcción**, no por descuido:

- `playBattle()` solo se llama desde `playAgentTurn()` (`director.ts:104`), justo
  después de que una acción de aventura **del agente** deje una batalla
  pendiente. Por ese camino el agente siempre ataca.
- Cuando el rival ataca al agente, el turno del rival lo juega
  `playAiTurn(this.state, this.ctx)` de una sola pieza (`director.ts:66`), y esa
  función **resuelve las batallas por dentro**: `src/core/ai/turn.ts:57` llama a
  `resolvePendingBattle`. El director no llega a enterarse de que hubo batalla.

Ahí está el nudo real, y no es una constante: para que el agente defienda, el
director tiene que poder **intervenir a mitad del turno del rival**, y hoy ese
turno es una llamada atómica a `core`.

### #31 — la realimentación está muerta por los dos extremos

- `AgentLink.report()` (`agent-link.ts:168`) **no lo llama nadie**. Verificado
  con grep sobre `src/`, `test/` y `tools/`: cero llamantes.
- El único `{type:'result'}` que sale es el de fallo de validación dentro de
  `ask()` (`agent-link.ts:161`).
- **Y hay una segunda mitad muerta que el issue no menciona**: el puente MCP sí
  recibe el `result` (`mcp/server.ts:97`), pero **cuando `ok` es verdadero lo
  descarta** — `ultimoVeredicto = msg.ok ? null : …`. Es decir: aunque `report()`
  se llamara mañana con un `ok: true` y una nota, **el agente no vería nada**.
  Arreglar solo el servidor no entrega este issue.

El protocolo, en cambio, está listo: `AgentResultMsg` ya lleva `ok`, `problems`
y `note` (`protocol.ts:24-30`).

### Un hecho que conecta los dos, y que salió de la QA del ciclo anterior

Cuando el agente manda una acción de batalla ilegal, el director la descarta y
**juega en su lugar la de la IA de reglas** (`director.ts:150-152`), que **sí
consume el turno del stack**. O sea: al agente le cuesta un turno de unidad
equivocarse, y hoy **nadie se lo cuenta**. Es exactamente el vacío de #31 medido
sobre un caso concreto.

## Criterios de aceptación

### #29 — el agente defiende
1. Cuando el rival ataca a un héroe del agente, la batalla se le ofrece al
   agente **acción a acción**, con `battle_turn` y su bando correcto
   (`defender`), igual que hoy se le ofrece cuando ataca.
2. `serializeBattleTurn` ya recibe el bando: comprobar que lo que ve el agente
   como «mío» y «enemigo» está bien orientado cuando defiende.
3. Si el agente no está conectado, falla o tarda, **la partida no se detiene**:
   toma el relevo la IA de reglas, igual que hoy.
4. El turno del rival **sigue siendo jugable sin agente**: `playAiTurn` no puede
   quedar roto ni obligado a conocer al director. `core` sigue puro.
5. Test: una batalla en la que el agente es defensor y responde, y otra en la que
   se calla y la termina la heurística.

### #31 — el agente sabe cómo le fue
1. Tras aplicar un turno de aventura, el agente recibe un `result` con **`ok`
   verdadero** y una nota que diga **cuántas de sus acciones se aplicaron** y
   cuáles se descartaron y por qué.
2. Tras una acción de batalla rechazada, el agente se entera **de que se
   descartó y de que la jugó la heurística en su lugar, consumiéndole el turno
   de esa unidad**.
3. **El puente MCP entrega el veredicto también cuando fue bien**
   (`mcp/server.ts:97-102` hoy lo tira). Sin esto el issue no está hecho.
4. La nota está escrita **para quien la lee, que es un modelo**: concreta y
   accionable, no `ok: true` a secas.
5. No se convierte en ruido: el agente no debería recibir un muro de texto por
   un turno que salió perfecto.
6. `pnpm qa` lo ejerce de verdad, no solo los tests.

## Fuera de alcance

- **#34** (que el navegador juegue contra el servidor), **#30** y **#32** (el
  cliente espectador). Este racimo no toca el canal de espectadores.
- **#7** el asedio: si el rival ataca un **castillo** del agente, eso es otro
  issue; aquí se cubre la batalla de héroe contra héroe.
- **#27** `map_generate` y **#28** `hero_banter`.
- **#47** las partidas que no terminan.
- **Arte: presupuesto de fal.ai = 0 €.**

## Preguntas abiertas, con su suposición por defecto

1. **¿Cómo interviene el director en el turno del rival?** Es la decisión de
   diseño del racimo y la deja el arquitecto. Por defecto: `core` expone una
   forma de jugar el turno de la IA **paso a paso** (o de avisar cuando nace una
   batalla) sin que `core` sepa que existe un director — un callback es
   aceptable, no lo es un `import` del servidor.
2. **¿Cuándo se manda el `report`?** Por defecto, **una vez por turno de
   aventura** más una por acción de batalla rechazada. Mandar uno por acción
   aplicada sería ruido.
3. **¿El agente defiende también las batallas que empiezan sin él delante**
   —dos rivales entre sí— ? No: solo las suyas.
4. **¿Y si el agente lleva a los dos jugadores?** Hoy `agentPlayers` es un
   conjunto. Por defecto, cada bando se le pregunta por separado con su propio
   `battle_turn`.

---

# Correcciones tras la crítica

Veredicto: **#29 VIGENTE · #31 REENCUADRADA**. Esta sección **manda** sobre lo
escrito arriba donde se contradigan.

## Lo que el crítico verificó y yo no vi

- **El nudo de #29 es real y más caro.** Medido: 12 semillas × 120 días dan **46
  batallas abiertas por el jugador 0 y 45 por el jugador 1** — el «es la mitad»
  del issue es literal, no retórico.
- **Hay un segundo `'attacker'` cableado fuera del director**: `ws-server.ts:35`
  sirve la tool MCP `battle_state` con el bando fijo. Un agente **defensor** que
  la consulte vería el bando cambiado. **No está en ningún issue y entra aquí.**
- **#31 tiene cuatro mitades muertas, no dos**:
  1. `report()` no lo llama nadie.
  2. El puente tira el veredicto cuando `ok` es verdadero (`mcp/server.ts:100`).
  3. **`msg.note` no se lee en NINGUNA de las dos ramas** — el campo estrella de
     `AgentResultMsg` está muerto también cuando falla.
  4. `report(requestId, …)` **no es llamable**: `ask()` devuelve solo los datos
     parseados y el director nunca ve el `requestId`.
  Y `ultimoVeredicto` (`mcp/server.ts:181`) es una **ranura única**: si llegan
  dos `result` entre dos `heroes_listen`, el primero se pierde.
- **Mi criterio #31.2 afirmaba un hecho falso.** La acción heurística sustituta
  **no siempre consume el turno del stack**: puede ser un `cast`, que no lo
  consume pero **gasta el maná del héroe del agente** (264 casts en 1043
  decisiones medidas en #52). Ese **daño silencioso** es el argumento real de
  #31, y es mejor que el que yo escribí.
- **Mi criterio #31.6 es literalmente el issue #44** («`pnpm qa` verifica poco»).
  Se retira de aquí: `verify-agent.ts` da 6 turnos de mapa, **0 decisiones de
  batalla y 0 acciones rechazadas**, así que hoy no puede ejercer nada de esto.
  Se anota como limitación conocida de la verificación, no como criterio.

## Decisiones del usuario

### 1 · Se acepta el contagio de `async`

`playAiTurn` pasa a ser asíncrona y con ella todo lo que la llama: `endTurn()`
del cliente deja de ser síncrono, y entran `await` en `barrido-semillas.ts` y en
los cuatro puntos de `game.test.ts`.

**Se descartó** el mecanismo de pasos en `core` que yo recomendaba. Queda
escrito para quien lo lea dentro de seis meses: la alternativa era exponer el
turno de la IA como una secuencia conducible, con `playAiTurn` de envoltorio.

**Consecuencia que el arquitecto tiene que cubrir, y que no estaba en la
pregunta:** un `endTurn()` asíncrono abre una **reentrada** que hoy no existe
—pulsar «fin de turno» dos veces mientras se espera, o pulsarlo mientras corre
el turno del rival—. Hay que cerrarla explícitamente, no confiar en que el
usuario no lo haga.

### 2 · #31 entra, con los criterios corregidos

Va **detrás de #29**, que es cuando empieza a valer: su daño vive en el camino
de batalla. Criterios que sustituyen a los de arriba:

1. Tras un turno de aventura, el agente recibe un `result` con **`ok: true`** y
   una nota que dice **cuántas acciones se aplicaron** y cuáles se descartaron
   con su motivo.
2. **Tras una acción de batalla rechazada, el agente se entera de qué se jugó en
   su lugar y de qué le costó** — el turno de esa unidad, o el maná de su héroe
   si la sustituta fue un `cast`. **No se afirma cuál de los dos: se dice el que
   haya sido.**
3. El puente MCP entrega el veredicto **también cuando fue bien**, y **lee
   `note` en las dos ramas**.
4. `ultimoVeredicto` deja de perder mensajes cuando llegan dos seguidos.
5. `report()` pasa a ser llamable: el director necesita el `requestId`.
6. La nota está escrita para quien la lee, que es un modelo: concreta y
   accionable. Y no se convierte en un muro de texto cuando el turno salió bien.

### 3 · Entra el guardia de la frontera

`test/invariantes.test.ts` gana un test que impida que `src/core` importe
`src/server`. Hoy **ninguno de los cuatro guardias lo prohíbe**, y este ciclo es
justo el que va a tentar la frontera: la salida fácil al problema de #29 es un
`import` en la dirección prohibida. Nace verde y hay que **comprobar que
muerde**.

---

# Visto bueno al plan

El usuario aprobó `plan.md` con tres decisiones, una de ellas **en contra de lo
que el plan proponía**.

### 1 · El pueblo atacado entra

El agente defiende también cuando le atacan un castillo. **Sin murallas ni nada
de asedio: eso sigue siendo #7.** Sale gratis porque el bando se deriva del dueño
y `serializeBattleTurn` no necesita héroe; excluirlo costaría escribir una línea
para prohibirlo. Corrige lo que decía «Fuera de alcance» arriba.

### 2 · El agujero del turno ajeno se cierra aquí

Hacer asíncrono `endTurn()` convierte en alcanzable algo que hoy no lo es:
`build`, `recruit` y `hireHero` no comprueban de quién es el turno y
`applyAdventureAction` tampoco lo valida.

Se cierra **por los dos lados**: la comprobación en `applyAdventureAction`,
fail-loud con su motivo, **y** la bandera de reentrada en el cliente. El
argumento: lo cierra quien lo abre, y dejar el núcleo confiando en que el cliente
se porte bien es lo contrario de cómo está escrito el resto del proyecto.

### 3 · Informe siempre, también cuando la acción de batalla coló

**Se descarta la propuesta del plan** de que el silencio signifique que coló. El
motivo del usuario, que queda escrito porque es el que manda: **un silencio es
ambiguo en un canal que puede perder mensajes**. El agente no debería tener que
distinguir «fue bien» de «no llegó».

**Consecuencias que el ingeniero tiene que cubrir, y que no estaban en la
pregunta:**

- El criterio de **no convertirse en un muro de texto sigue en pie**, y ahora hay
  que cumplirlo por otra vía: el acuse de una acción que salió bien es **una
  línea corta**, no un informe.
- **El tope de la cola de veredictos se queda estrecho.** El plan fijó 8 contando
  con que las acciones aceptadas no generaran nada; con acuse por acción, una
  batalla larga lo supera. Hay que redimensionarlo con un número justificado, no
  con el que había.
