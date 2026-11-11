# Requisitos — contrato-de-batalla

Tarea: `2026-11-11-contrato-de-batalla`. Issues: 334 338. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `150fd189`, tras fusionar #333).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

> «Cuando mergees la PR empieza con los nuevos issues tambien en paralelo»

El coordinador eligió esta tarea (tanda 3). Lo que pide cada issue, tal cual:

### #334 — Agente: un battle_turn que no pasa el zod le quita la batalla entera, y la nota dice «ese turno»

> Cuando la respuesta del agente a un `battle_turn` no pasa el zod, `server/director.ts` (el `.catch` de `ask('battle_turn', …)`, hacia la línea 581) devuelve `null`, sale del bucle y `resolvePendingBattle` resuelve **la batalla entera** con la IA (hacia la línea 646). La nota que le llega al agente es la de `EN_SU_LUGAR.battle_turn` (`server/notas.ts`): «Ese turno lo juega la IA», que no es lo que pasa.
> 
> Visto leyendo el código (no ejecutado) por el crítico de `docs/agents/2026-11-11-accion-del-agente-del-zod/` (#313, #317).
> 
> Qué hacer: o la IA juega solo ese turno y la batalla vuelve al agente, o la nota dice que la batalla la termina la IA. Decidir junto con la regla de forma contra valor que fija #317 para la aventura.
> 
> Sale del cierre de issues del 11-11-2026 (PR alberto-hortelano/heroes-of-silence#333).

### #338 — Contrato: `AccionDeBatallaDelAgente` derivado del zod, como la de aventura

> Tras #313, la jugada de aventura sale del zod (`z.infer`) sin casts. La de batalla sigue con su tipo a mano y el cast de `server/director.ts` (hacia la línea 594): su zod aún lleva `wait`/`defend`, retirados, y su tipo es también la salida de `accionAlAgente`. Qué hacer: retirar `wait`/`defend` del esquema y derivar el tipo. Visto por el arquitecto de `docs/agents/2026-11-11-accion-del-agente-del-zod/`.
> 
> Sale del cierre de issues del 11-11-2026 (PR alberto-hortelano/heroes-of-silence#333).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance y su recomendación: un `battle_turn` sin forma (o con `wait`/`defend`) cuesta **solo ese turno** (lo juega la IA y la batalla vuelve al agente); sin respuesta (plazo agotado, canal caído) la batalla la termina la IA, y las dos notas dicen la verdad. `wait`/`defend` se quedan en el esquema con su mensaje (decisión del 26-10) y fuera del tipo derivado. Los criterios de la crítica sustituyen a los de arriba:


**Criterios (tras la crítica)**
1. (#334) Un `battle_turn` cuya respuesta **no pasa el zod** cuesta **solo ese turno**: la IA juega esa unidad (sin rendirse, como la sustituta de hoy) y el siguiente turno de un bando del agente se le vuelve a pedir. Lo mismo para `wait`/`defend`. Test de circuito en `agent-link.test.ts`: una respuesta sin forma seguida de una buena, y la buena se aplica en la misma batalla.
2. (#334) El **plazo agotado y el canal caído** se deciden aparte y se dice cuál se ha elegido: o siguen terminando la batalla con la IA, o cuestan solo el turno. En los dos casos, la nota que recibe el agente (`notaRespuestaInvalida`, `notaSinRespuesta`) y el log del director dicen exactamente lo que ha pasado. `EN_SU_LUGAR.battle_turn` no puede decir «ese turno» si no es verdad.
3. (#334) La regla «Forma y valor» (`docs/areas/agente.md`) se reescribe para la batalla. Se quita el «no hay "siguiente" que salvar» y se dice qué es forma y qué es valor en `battleActionSchema` (`surrender.gold`, hexes). Si cambia el alcance, también la línea «El agente» de `CLAUDE.md`. Y se corrige el comentario de `esquemas.ts:131-133`.
4. (#338) `AccionDeBatallaDelAgente` sale del zod (`z.infer`, como `AccionDelAgente`), **sin** las retiradas, y desaparece el `as` de `director.ts:593`. `accionDeBatallaDelAgente` y `accionAlAgente` siguen sin `default`. **`wait`/`defend` siguen rechazándose con su mensaje de hoy**: `agent-contract.test.ts:1106-1127` en verde, aunque cambie dónde vive el mensaje. Quitarlas del zod sin ese mensaje no vale.
5. La ida y vuelta de `agent-contract.test.ts:2111-2119` sigue en verde. `pnpm qa` una vez al cerrar.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` (opción A). La pregunta abierta ya la contestaba «Tras la crítica»: sin respuesta (plazo agotado, canal caído), la batalla la sigue terminando la IA, con la nota que lo dice.
