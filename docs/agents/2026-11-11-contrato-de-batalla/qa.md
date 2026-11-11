# QA — contrato-de-batalla (#334, #338)

Código validado: worktree `agent-a9de33d9495859944`, rama `worktree-agent-a9de33d9495859944`, commit `dba3e225`.
Criterios: los de «Tras la crítica», con lo que fija «Tras el plan»: sin respuesta, la batalla la termina la IA.

## Método

- No repito lo que el ingeniero dejó en verde sobre este mismo commit (`implementacion.md`, «Verificación ejecutada»): `typecheck`, `lint`, los 6 ficheros de test (230 tests), `exportaciones`, `pnpm qa` (exit 0, 62 decisiones de batalla, 2 batallas del agente) y `pnpm banco` (ancla igual).
- Lo nuevo es una batería propia por el **circuito real**: un `WebSocketServer` de verdad, un agente de mentira por el socket, y `AgentLink` → zod → `Director` → núcleo → `result`. Está en `qa/circuito.qa.test.ts`, con su config `qa/vitest.qa.config.ts`, y corre contra el código del ingeniero.
  - Orden: `pnpm vitest run --config docs/agents/2026-11-11-contrato-de-batalla/qa/vitest.qa.config.ts`, desde este worktree.
  - Resultado: **30 passed (30)**, 7,5 s. Lo corrí dos veces, la segunda solo para leer los resúmenes.
- Un espía sobre `chooseBattleAction` (`vi.mock`) registra cada jugada de la IA, la sustituta incluida. Así se comprueba en cada batalla que la IA no se rinde.
- Cada test comprueba, por cada `battle_turn` pedido, que llega **exactamente un** `result` con su `requestId`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Un `battle_turn` sin forma cuesta solo esa jugada. La IA la juega sin rendirse, la batalla vuelve al agente, y su jugada buena siguiente entra. Lo mismo con `wait`/`defend`. | ✅ cumple | **Primer turno** (semilla 611), 20 clases de respuesta sin forma (lista abajo). Cada una da un único veredicto `ok:false`, con «tu respuesta no encaja con el esquema» y «juega la IA de reglas en tu lugar». Ninguna dice «la termina la IA» ni «ese turno lo juega». Después se piden 26 turnos más y alguno entra con `ok:true`. `pendingBattle` acaba en null y el director no escribe «no respondió». **A mitad**: un `defend` en el 4.º turno (613), y malas alternadas con buenas (614). **Todas sin forma** (611, 615, 616): 12-13 turnos pedidos, todos con su veredicto. **Defendiendo**: un héroe atacado (semilla de `semillaEnQueElRivalAtaca(203)`, `yourSide: defender`) con `wait` y luego `target: 7`, y después las buenas entran. Un castillo sin héroe (202), todas sin forma: 47 turnos, uno por veredicto. Las sustitutas que salen son `cast`, `move` y `attack`; ninguna `surrender` en las 30 batallas. |
| 1b | La batalla que acaba la sustituta lo dice. | ✅ cumple | En 611, 615 y 616, con todas sin forma, la última jugada la remata la IA. Solo esa nota dice «Con eso ha TERMINADO la batalla… no habrá más peticiones para ella», y es la última. Cuando la sustituta es un `cast`, la nota dice «Eso NO ha consumido el turno… se te volverá a pedir», y se vuelve a pedir. |
| 2 | Sin respuesta (plazo agotado o canal caído), la batalla la termina la IA. La nota y el log lo dicen, y `EN_SU_LUGAR.battle_turn` no dice «ese turno». | ✅ cumple | **Plazo agotado a mitad** (617, el 3.º turno callado, plazo de 600 ms). No hay más `battle_turn` después del callado. Su nota: «No llegó tu respuesta a "battle_turn": no respondiste a tiempo (1 s). La batalla la termina la IA de reglas en tu lugar, sin rendirse: no se te pedirá nada más de ella. No la contestes ahora…». El log: «El agente no respondió en la batalla (el agente no respondió a "battle_turn" a tiempo); la termina la IA.». La **respuesta tardía** (a los 900 ms) no da un segundo veredicto. **Canal caído a mitad** (619, el socket se cierra en el 3.º): el log dice «El agente no respondió en la batalla (el agente se ha desconectado); la termina la IA.», no se piden más turnos y `pendingBattle` queda en null. |
| 3 | La regla «Forma y valor» se reescribe para la batalla, sin el «no hay "siguiente" que salvar». Se dice qué es forma y qué es valor. Se ponen al día `CLAUDE.md` y el comentario de `esquemas.ts`. | ✅ cumple | Leído en el diff. `agente.md` añade el párrafo «En la batalla» y quita el viejo. Forma: `type`, campos, casillas enteras, `surrender.gold`, retiradas. Valor: `hit` y los `*Blocker`. Lo que dice cuadra con lo observado: `gold: -5` y `gold: 1.5` dan «action.gold: …» y cuestan la jugada. `CLAUDE.md`, «El agente», cambia la línea. El comentario de las retiradas en `esquemas.ts` ya no miente. |
| 3b | La prosa de `formato.ts` cuadra con lo que pasa. | ✅ cumple | «Si tu acción NO es legal o no encaja con el esquema, se descarta y juega la IA… la batalla sigue siendo tuya»: es lo que pasa en el criterio 1. «Si no respondes a tiempo, la batalla entera la termina la IA… sin rendirse»: es lo que pasa en el 2. |
| 4 | `AccionDeBatallaDelAgente` sale de `z.infer`, sin las retiradas, sin el `as` y sin `default`. `wait`/`defend` se rechazan con su mensaje. | ✅ cumple | El diff: `type AccionDeBatallaDelAgente = z.infer<typeof battleActionSchema>`, el `as` de `director.ts` ya no está, y los dos `switch` no tienen `default`. El ingeniero vio morder los dos guardias (TS2366). Por el cable, el `wait` da `action.type: ya no hay "wait": esperar se retiró de la batalla; …manda { "type": "end_turn" }`, y el `defend` su equivalente. |
| 5 | Siguen en verde la ida y vuelta de `agent-contract.test.ts` y `pnpm qa`. | ✅ cumple (citado) | Lo corrió el ingeniero sobre `dba3e225`. No lo repito: el código no ha cambiado desde entonces. |

Las 20 clases de respuesta sin forma que probé en el primer turno:

- `wait` y `defend`;
- un `type` que no existe (`fly`) y uno en mayúsculas (`END_TURN`);
- un `move` sin `to`;
- un `attack` con `target` numérico;
- sin `action`, con `action: null` y con `action` de array;
- `data` null, texto (`"end_turn"`) y número (42);
- `actions` de aventura;
- `surrender.gold` negativo y decimal;
- una casilla decimal y una con `{x,y}`;
- `reasoning` de 2001 caracteres;
- un `cast` sin `spell` y un `power` numérico.

El problema que vuelve en cada caso es la ruta y el mensaje del zod. Por ejemplo, `action.to.col: Expected integer, received float` y `reasoning: String must contain at most 2000 character(s)`.

## Hallazgos

Ninguno bloqueante ni importante. Tres menores:

1. **Menor, viene de antes (26-10).** Un `type` desconocido da el error de discriminador del zod, que nombra a las retiradas como válidas: `Expected 'move' | 'attack' | 'aim' | 'throw' | 'wait' | 'defend' | …`. El agente lo recibe en `problems` y en la nota. Un agente que siga esa lista manda un `wait`, que vuelve a costarle la jugada. Ahora cuesta una jugada y no la batalla, pero el mensaje sigue empujando hacia el error.
   - Reproducir: responde a un `battle_turn` con `{ "action": { "type": "fly" } }`, semilla 611.
   - Lo esperado: que la lista de tipos válidos no incluya `wait`/`defend`.
2. **Menor.** El puente MCP, cuando no consigue mandar la respuesta, dice «Esa decisión la juega la IA de reglas en tu lugar» (`src/server/mcp/server.ts:299-303`). En un `battle_turn` eso se queda corto: el servidor acaba por plazo o por desconexión y la batalla entera la termina la IA. La nota que llega luego (`notaSinRespuesta`) sí lo dice. El criterio 2 no nombra este texto. Lo apunto para que no se quede como la última frase que miente.
3. **Menor, cosmético.** Con un plazo de 600 ms la nota dice «no respondiste a tiempo (1 s)», porque redondea a segundos. Con el plazo real de 300 s no se nota.

## Workarounds usados

- **El agente de mentira por el socket**, en vez de Claude por MCP. Ejerce el mismo `AgentLink`, el mismo zod y el mismo `Director`. Lo que no pasa por aquí es la capa de `heroes_respond`. Esa capa hace `JSON.parse` antes de mandar y, si el JSON está roto, no suelta la petición (lo leí en `server.ts:285-292`). El JSON roto nunca llega al servidor y el agente puede reintentar, así que no afecta a lo que se valida.
- **Los montajes copiados de `agent-link.test.ts`**: el monstruo puesto, el rival plantado, el castillo guarnecido y `raiders = []`. Son los mismos escenarios que usa el repo. Sirven para que haya batalla en el primer turno, no para que pase la prueba.

## No probado

- **JSON roto por el WebSocket crudo.** `attach` lo registra como «mensaje ilegible» y lo ignora (`agent-link.ts`), así que acaba en plazo agotado, que sí está probado. Por MCP no llega al servidor (ver arriba). No lo ejercí.
- **El relevo de agente a mitad de batalla** («otro agente ha tomado el relevo»). Pasa por el mismo `failAll` que el canal caído, que sí está probado.
- **Una batalla con muralla** (`place_ladder`, `climb`, `open_gate`, `close_gate` sin forma). El camino es el mismo, pero no monté un asedio.
- **El navegador**: nada de esto se ve.

## Veredicto

**Apto.** Lo que pidieron #334 y #338 se cumple por el circuito real, atacando y defendiendo. Lo probé con 20 clases de respuesta sin forma, en el primer turno, a mitad de batalla y en todos los turnos, incluido el que la acaba: hay un veredicto por petición, la batalla vuelve al agente y la IA no se rinde. Sin respuesta, la nota y el log dicen que la batalla la termina la IA. Quedan tres hallazgos menores, ninguno de ellos una regresión.
