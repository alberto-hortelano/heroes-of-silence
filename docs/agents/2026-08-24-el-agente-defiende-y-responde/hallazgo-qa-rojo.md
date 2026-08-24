# `pnpm qa` en rojo: el agente se queda colgado cuando la partida termina

Escrito por el coordinador tras reproducir y **bajar un nivel más** que el
informe del ingeniero. Lo que él midió es correcto; la causa está más abajo y no
es del arnés.

## Qué pasa

Reproducido dos veces con `pnpm qa`:

```
[qa] turno 3/6 — respondido "battle_turn"     ← ×11-12, el agente DEFENDIENDO
[servidor] día 4 · jugador 0 · reglas · 0 acciones
──────── fin de la partida ────────
Gana el jugador 0.
  jugador 1 (necromancer): 0 castillos, 0 héroes
[qa] ha fallado: McpError: Request timed out
```

El agente defiende (eso es #29 funcionando por MCP real), **pierde**, la partida
termina el día 4 y el arnés se queda esperando un cuarto turno que no llegará.

## La causa, que no es el arnés

`heroes_listen` (`src/server/mcp/server.ts:183-186`) espera en una promesa que
**nadie resuelve nunca**:

```ts
const msg = bandeja.shift() ?? (await new Promise((resolve) => { esperando = resolve; }));
```

Y `ws.on('close')` (`src/server/mcp/server.ts:60-62`) solo hace `socket = null`:
no toca `esperando`. Así que cuando el servidor de la partida cierra —o
simplemente deja de pedir decisiones porque la partida acabó— **el agente se
queda bloqueado para siempre**.

**Esto le pasa a cualquier agente, no solo al arnés.** Un Claude jugando por MCP
se quedaría colgado en `heroes_listen` al acabar la partida, sin saber que
terminó ni quién ganó. Es el mismo vacío que arregla #31 —al agente no se le
cuenta lo que necesita— llevado al final de la partida.

**Intenté parchear el arnés y no vale**: preguntar `game_state` al agotar la
espera tampoco responde, porque la consulta viaja por el mismo socket muerto.
El parche está revertido; el arreglo va en el puente.

## Es preexistente, y lo destapamos nosotros

No es una regresión: la promesa sin salida lleva ahí desde siempre. Nunca se
notó porque el arnés agotaba sus 6 turnos **antes** de que la partida terminara.
Ahora el agente defiende, pierde antes, y la partida acaba en el día 4.

Aplica el criterio que el usuario ya fijó para el agujero del turno ajeno: **lo
cierra quien lo abre**.

## Qué hay que hacer

1. **En el puente** (`src/server/mcp/server.ts`): al cerrarse el socket, quien
   esté esperando en `heroes_listen` recibe una respuesta que dice que la partida
   terminó o que se perdió la conexión. **No un error mudo**: la frase la lee un
   modelo y tiene que poder decidir qué hacer — y si se sabe quién ganó, decirlo.
   Lo mismo para una consulta en vuelo (`consultas`), que hoy queda igual de
   huérfana.
2. **En el arnés** (`tools/qa/verify-agent.ts`): reconocer esa respuesta como
   **final limpio** y salir con 0, informando de cuántos turnos y cuántas
   decisiones de batalla hubo. Hoy la trataría como «petición ilegible».
3. **Test** en `test/agent-link.test.ts` o donde encaje: con una petición en
   vuelo, se cierra el socket y quien esperaba recibe la frase en vez de
   quedarse colgado.

## Lo que NO hay que hacer

- **No bajar `TURNOS`** ni tocar el número para que el arnés termine antes de que
  la partida acabe: eso es esconder el fallo, y el fallo es del producto.
- **No tocar el balance** para que el agente no pierda el día 4. Que el agente de
  guion pierda contra la IA de reglas es información, no un bug.
- Lo demás de #44 (que `pnpm qa` verifica poco) **sigue fuera de este ciclo**.
