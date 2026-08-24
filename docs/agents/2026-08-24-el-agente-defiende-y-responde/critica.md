# Veredicto: **#29 VIGENTE** · **#31 REENCUADRADA**

Baseline: `pnpm verify` verde, 121 tests. Aviso: casi todas las citas de `requisitos.md` van **desplazadas una línea** (66→65, 104→103, 150-152→149-151, 161→160, 24-30→25-31). Los hechos se sostienen; las líneas no.

## #29 — el agente no puede defender

**El problema real:** el agente decide en la mitad de sus batallas porque la otra mitad la resuelve `core` dentro de una llamada que el director no puede interrumpir.

**La premisa, verificada:**

1. *«`suBando` es `attacker` por construcción»* — **cierto**. `director.ts:122` fija la constante; `playBattle` tiene un solo llamante (`director.ts:103`, dentro de `playAgentTurn`) y toda batalla nace en `game.ts:660` con `attackerHeroId: hero.id` = el héroe que se movió.
2. *«el turno del rival es atómico y resuelve las batallas por dentro»* — **cierto y exacto**: `src/core/ai/turn.ts:57` llama a `resolvePendingBattle` dentro del bucle de movimiento, y `director.ts:65` lo invoca de una pieza. **El arreglo no es más barato de lo que supone el documento** (ver abajo: es más caro).
3. *«es la mitad de las batallas»* — **medido**: 12 semillas × 120 días IA contra IA → 46 batallas las abre el jugador 0 y 45 el jugador 1 (74 héroe-héroe, 16 monstruo, 1 pueblo). El agente es el 1: juega 45 y se le auto-resuelven 46.
4. *Criterio #29.2* — **ya está bien y se cierra leyendo**: `serialize.ts:123` es paramétrica en `side` (`yourSide`, `battle.heroes[side]`) y `chooseBattleAction` (`tactics.ts:148`) es agnóstica de bando.

**Dos cosas que el documento no ve, y agrandan la tarea:**

- **Un segundo `'attacker'` cableado fuera del director**: `ws-server.ts:35`, `serializeBattleTurn(pending.battle, 'attacker')`, es lo que sirve la tool MCP `battle_state`. Un agente defensor que la consulte ve el bando cambiado. No está en ningún issue.
- **El callback de la pregunta abierta 1 tiene que ser async** —la decisión del agente lo es— y eso obliga a `playAiTurn` a serlo: arrastra `src/client/session.ts:189` (dentro de un `endTurn()` **síncrono**), `playAiGame` (`turn.ts:71`), `tools/qa/barrido-semillas.ts:30` y cuatro puntos de `test/game.test.ts` (353, 371, 383, 396).

**La frontera de `core` (#29.4):** `test/invariantes.test.ts` vigila `node:` (98), DOM (104), `Math.random` (113) y la puerta única del cliente (119). **Ninguna prohíbe que `core` importe `src/server`.** Un callback pasa los cuatro guardias — pero un `import` del director también. El criterio es real y hoy no está guardado.

**El día después:** quien juega en el navegador **sigue sin defender** (`session.ts:189` auto-resuelve igual), y nadie podrá **ver** al agente defendiendo: el único mirador es el `console.log` del servidor (#30/#32 sin hacer).

**Conflictos:** ninguna contradicción. #19 (huir/rendirse) es lo que un defensor necesita, va después y no bloquea. #7 no roza esto — pero el hueco que sí existe es el **pueblo defendido**, que ya ocurre hoy sin murallas (`defenderSide`, caso `'town'`, héroe `null`) y que `requisitos.md` manda a #7 sin serlo: 1 de 91 batallas, barato decidirlo y carísimo dejarlo ambiguo. #34/#30/#32 ni bloquean ni subsumen.

**Coste contra valor:** alto valor — es la mitad del material de decisión del agente, que es la tesis del proyecto. Adelante, contando con la ondulación async.

## #31 — `report()` está muerto

**El problema real:** al agente solo se le habla cuando su JSON no valida; cuando sus acciones se descartan **ya aceptadas**, nadie le cuenta lo que le costó.

**La premisa, verificada:**

1. *«`report()` no lo llama nadie»* — **cierto**: cero llamantes en `src/`, `test/`, `tools/`. Único `{type:'result'}` emitido: `agent-link.ts:160`.
2. *«el puente descarta el veredicto si `ok`»* — **cierto** (`mcp/server.ts:100-102`). Y hay más: **`msg.note` no se lee en ninguna de las dos ramas**, así que el campo estrella de `AgentResultMsg` está muerto también con `ok:false`.
3. *La «tercera mitad» que se preguntaba: **esa parte sí funciona***. `mcp/server.ts:181-182` antepone `ultimoVeredicto` a la siguiente petición. Pero es **una ranura única leída solo en `heroes_listen`**: entre dos `listen` caben dos `result` (batalla rechazada + informe de fin de turno) y el segundo pisa al primero.
4. **`report()` no es llamable tal como está**: pide `requestId`, y `ask()` devuelve solo los datos parseados (`agent-link.ts:164`).

**El criterio #31.2 afirma algo falso a menudo.** El sustituto de una acción rechazada es `chooseBattleAction`, que **puede devolver un `cast`** — y `battle.ts:428-431` dice que lanzar **no consume el turno del stack**: hace `castHeroSpell(state, s.side, …)`, o sea gastar el **maná del héroe del agente**. #52 midió 264 `cast` en 1043 decisiones. «Te consumió el turno de esa unidad» mentiría en ~1 de cada 4 rechazos y ocultaría el daño real. Nació con #24, hace horas.

**El criterio #31.6 es, literalmente, #44.** Ejecutado ahora, `npx tsx tools/qa/verify-agent.ts` da **6 turnos de mapa, 0 decisiones de batalla y 0 acciones rechazadas**. No hay nada que «ejercer de verdad» sin reescribir `verify-agent.ts`, que es el cuerpo de #44. O se descuenta, o #31 paga media #44 sin decirlo.

**Coste contra valor, honesto:** **no hay evidencia de que al agente le haga falta** — nada mide una decisión suya mejorando, y el único circuito que lo ejercería produce cero rechazos. Lo que sí hay es un daño medible y silencioso (turno o maná gastados por la heurística). Ese es el argumento, no «un modelo aprende mejor». Y casi todo vive en el camino de batalla: **#31 vale poco antes de #29 y bastante después.** Orden: #29 primero.

## Qué NO hacer aquí

Tocar `serializeBattleTurn` (ya está bien); inventar niveles de verbosidad configurables para el ruido; colar murallas (#7) o huida (#19).

## Parches a `requisitos.md` (para pegar tal cual)

**#29 — dos criterios nuevos:**

> 6. `ws-server.ts:35` sirve `battle_state` con `'attacker'` cableado: un agente defensor que consulte esa tool ve el bando cambiado. Se arregla aquí.
> 7. Si el rival ataca un **pueblo** del agente, se decide explícitamente en el plan: `battle_turn` sin héroe propio, o auto-resolver como hoy. Esto **no** es #7; las murallas siguen fuera.

**#29 — sustituir la pregunta abierta 1:**

> 1. El callback tiene que ser **async**, y eso arrastra a `playAiTurn`: `src/client/session.ts:189` lo llama dentro de un `endTurn()` síncrono, más `turn.ts:71`, `tools/qa/barrido-semillas.ts:30` y `test/game.test.ts` ×4. El plan debe decir qué hace con `session.ts`. Y `test/invariantes.test.ts` **no** guarda hoy «`core` no conoce al servidor»: si importa, es un guardia nuevo.

**#31 — reescribir el 2, ajustar el 6, añadir dos:**

> 2. Tras una acción de batalla rechazada, el agente se entera de **qué jugó la heurística en su lugar**. Un `cast` sustituto **no** consume el turno (`battle.ts:428-431`): gasta el maná del héroe del agente. La nota cuenta lo que pasó, no una fórmula fija.
> 6. ~~`pnpm qa` lo ejerce de verdad~~ → hoy da 0 batallas y 0 rechazos; hacerlo es #44. Basta **un test** que provoque un rechazo y compruebe el `result` emitido.
> 7. `AgentLink.report(requestId, …)` no es llamable: `ask()` no devuelve el id. Abrir esa vía es parte del trabajo.
> 8. El puente entrega el `note` también con `ok:false` (`mcp/server.ts:100-102` solo mira `problems`), y `ultimoVeredicto` deja de ser una ranura que se pisa con dos `result` entre dos `heroes_listen`.
