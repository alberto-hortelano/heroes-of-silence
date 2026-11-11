# Requisitos — accion-del-agente-del-zod

Tarea: `2026-11-11-accion-del-agente-del-zod`. Issues: 313 317. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `d791d03c`).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos. Lo que pide cada issue, tal cual:

### #313 — Contrato: AccionDelAgente derivado del zod, sin el cast del director

> `AccionDelAgente` y `LineaDelAgente` (`contract/vocabulario.ts`) copian a mano la salida de `adventureActionSchema` (`contract/esquemas.ts`) y nada los ata: `server/director.ts` hace `accion as AccionDelAgente`. Qué hacer: `z.infer<typeof adventureActionSchema>` y fuera el cast; hoy `esquemas.ts` importa `vocabulario.ts`, así que el tipo tiene que cambiar de lado. De paso, que el `default` de `accionDelAgente` sea exhaustivo.
> 
> De «el contrato del agente, al día» (`docs/agents/2026-11-10-contrato-del-agente-al-dia/`, commit `dd5fb7cb`, rama `claude/siguiente-paso-0e4543`).

### #317 — Contrato: un count inválido en una jugada se lleva el turno entero

> En `distribute_troops` un `count` 0, negativo o no entero descarta ya solo esa jugada (lo juzga `accionDelAgente`). Las demás jugadas siguen con el patrón general: `leave_troops` con `count: 0` hace que el zod rechace la respuesta entera y la IA juegue el turno. Qué hacer: decidir qué errores de valor (no de forma) pasan el zod y se juzgan jugada a jugada, y aplicarlo a todas a la vez.
> 
> De «el contrato del agente, al día» (`docs/agents/2026-11-10-contrato-del-agente-al-dia/`, commit `dd5fb7cb`, rama `claude/siguiente-paso-0e4543`).

## Criterios de aceptación

1. (#313) `AccionDelAgente` y `LineaDelAgente` se derivan del zod (`z.infer` de `adventureActionSchema` o equivalente); `server/director.ts` no hace `as AccionDelAgente`. Sin dependencia circular entre `esquemas.ts` y `vocabulario.ts`.
2. (#313) El `default` de `accionDelAgente` es exhaustivo (`never`): una acción nueva en el esquema sin su caso no compila.
3. (#317) Una regla única y escrita (en `docs/areas/agente.md`, con fecha) de qué errores de valor pasan el zod y se juzgan jugada a jugada; aplicada a todas las jugadas a la vez: un `count` 0, negativo o no entero en `leave_troops` (y en las demás que lleven count o valores así) descarta solo esa jugada con su motivo, no la respuesta entera.
4. Test por cada jugada afectada y `pnpm qa` en verde (toca el contrato).

## Fuera de alcance

Elegir la defensa y los sobrantes (#311), los motivos en español (#318), el barrido de vistas (#316).

## Contexto

Área: `docs/areas/agente.md`. La tarea anterior del contrato: `docs/agents/2026-11-10-contrato-del-agente-al-dia/`. Presupuesto de pruebas: solo los tests de lo que se toca; `pnpm qa` una vez al cerrar.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance. Los criterios de arriba quedan **sustituidos** por estos. Decisión del coordinador sobre la pregunta que deja el 3: la regla se aplica a las jugadas de **aventura**; para la batalla, la regla escrita dice que queda fuera y por qué. El hallazgo aparte del `battle_turn` va a un issue nuevo.

1. (#313) `AccionDelAgente` y `LineaDelAgente` salen del zod (`z.infer`); fuera los tres casts: `director.ts:450`, `director.ts:467` y `test/partida-de-prueba.ts:30`. Un `import type` entre `esquemas.ts` y `vocabulario.ts` no cuenta como ciclo si el arquitecto lo justifica; uno de ejecución, sí. El cast de batalla (`director.ts:594`, `AccionDeBatallaDelAgente`) queda fuera: su zod lleva `wait`/`defend` retirados y su tipo es también la salida de `accionAlAgente`.
2. (#313) `accionDelAgente` sin `default` (o con `never`): las jugadas que hoy pasan tal cual van con su caso.
3. (#317) Una regla escrita, con fecha, en `docs/areas/agente.md`: qué es forma (se lleva la respuesta) y qué es valor (se juzga jugada a jugada). Se aplica a todas las jugadas de **aventura** con `count` (`recruit`, `dismiss`, `leave_troops`, `take_troops`, `distribute_troops`). La regla dice expresamente si abarca la batalla (`surrender.gold`, hexes).
3b. El núcleo rechaza con su motivo todo `count` que no sea un entero seguro ≥ 1 en cada jugada que deje de filtrar el zod: hoy `recruitBlocker` (`town/town.ts:222`) acepta 1,5. Y `lineaBlocker` usa la misma comprobación que el núcleo (`Number.isSafeInteger`), lo que cierra la mitad de #318 del `1e21`.
4. Los tests que fijan el rechazo del zod (`guarniciones.test.ts:778`, `agent-contract.test.ts:1658`) se invierten, y hay un test por jugada afectada que muestra que la siguiente jugada de la respuesta se aplica. `pnpm qa` en verde.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` tal cual (opción A: `z.infer` con `import type`, `count` como `z.number()` en el zod y el entero seguro ≥ 1 en el núcleo). Pasar `AccionDeBatallaDelAgente` al zod va al backlog.
