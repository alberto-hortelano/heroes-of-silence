# Crítica — higiene: linter, CI y QA de verdad

| Issue | Veredicto |
|---|---|
| **#43** linter, formateador y CI | **VIGENTE**, con el presupuesto corregido |
| **#44** el QA del agente verifica poco | **REENCUADRADA** — la premisa del minuto es falsa |
| **#53** semilla fijable y visible | **VIGENTE**, sin cambios |
| **#45** ruta absoluta en `atlas.json` | **REENCUADRADA** — el fichero que duele es otro |
| **#58** `Player.name` sin lector | **VIGENTE**, borrar |

Todo lo de abajo está ejecutado o abierto, no recordado. Lo medido, hoy, sobre `87b68a2`.

## #43 — VIGENTE

**El problema real:** nada comprueba el repo cuando sale de esta máquina, y `tsc` no mira lo que no es un tipo.

**Premisa verificada.** `.github/` no existe. `package.json:17` → `verify` = `typecheck && test`. `pnpm build` (`tsc -b --noEmit && vite build`) sale **verde en 4,0 s**: el criterio 1 no es un salto de fe. 201 líneas `.ts` pasan de 100 caracteres y 24 de 120, exacto.

**Una cifra del enunciado hay que corregirla, porque es el presupuesto del criterio 5:** `pnpm verify` **no son 3 s, son 6,1 s** (typecheck 1,9 + test 4,1, en caliente). `CLAUDE.md:308` dice 3 s y está obsoleto. El margen hasta el tope de 10 s es de **menos de 4 s**, no de 7.

**El día después.** Para quien juega, nada; es deuda declarada y está bien que lo sea. Lo que se cierra: con `pnpm lint` dentro de `verify`, el hook `Stop` depende de una herramienta más.

**Lo que encontré, y cambia el coste/valor.** `tsconfig.json` ya es máximamente estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`): un linter aporta poco en corrección. Pero **le faltan dos banderas** y encendiéndolas hoy salen **seis muertos** que `pnpm verify` no ve — `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`: `src/client/render/battle.ts:9` (`asset`), `src/client/session.ts:23` (`currentPlayer`), `src/core/battle/battle.ts:38` (`otherSide`), `src/core/contract/serialize.ts:13` (`Hero`), `test/game.test.ts:10` (`creature`), `tools/gen/cli.ts:20` (`BUILDING_SIZE`). Dos líneas, cero dependencias, cero milisegundos, y es justo el patrón «declarado y muerto» que este repo lleva tres ciclos barriendo. **No sustituye al linter** —no habría cazado #58, que es un campo escrito y no leído— pero es la parte barata del valor y no debe quedar enterrada bajo la elección de herramienta. **Coste contra valor:** alto y barato; sin esto, el próximo push roto se descubre jugando.

## #44 — REENCUADRADA

**El problema real:** el arnés declara verde un circuito del que no ha mirado la mitad; no que le falte tiempo.

### La premisa falsa: `pnpm qa` no tarda un minuto

**Tarda 5,44 s.** Medido tres veces seguidas: 5,46 · 5,44 · 5,44, salida 0. El motivo está en el propio código: desde que el agente defiende, **pierde y la partida termina el día 3** (`verify-agent.ts:129-132` ya lo anticipa). `TURNOS = 6` **no se alcanza nunca**: la pasada real son **2 turnos de aventura y 13 decisiones de batalla**, y sale por `PREFIJO_FIN`. `CLAUDE.md:311` («~1 min») y el criterio 12 («sigue tardando alrededor de un minuto») están los dos obsoletos. Esto es peor de lo que dice el issue, no mejor: el arnés no solo no mira los veredictos, es que solo ejercita **dos días de mapa**.

### Dictamen sobre la pregunta 2: `pnpm qa` **NO** entra en `pnpm verify`

El argumento del coordinador («3 s → 60 s») queda anulado por lo anterior. El correcto es otro, y es más fuerte:

- **Los puertos.** `AGENT_PORT = 9881` y `SPECTATOR_PORT = 9880` (`src/server/protocol.ts:8,10`) son fijos y se abren siempre. **Lo ejecuté:** con los dos ocupados, `pnpm qa` sale **1** con `EADDRINUSE: address already in use :::9881`. Y ocuparlos es exactamente lo que hace `pnpm server`, que es **la forma documentada de jugar con el agente** (`CLAUDE.md`, «Arrancar», dos terminales). Meter `qa` en `verify` pone el hook `Stop` en rojo por tener el juego abierto. Un guardia que se pone rojo por algo que no es el código se desactiva: es la misma frase que justifica el hook, aplicada en su contra.
- **El propio criterio 5.** 6,1 + 5,4 = **11,5 s**, que rompe el tope de 10 s que el documento se pone dos criterios más arriba.

El sitio de `pnpm qa` es CI. La pregunta 5 (job aparte por los puertos) es correcta, pero por un motivo que no aplica: cada job de GitHub Actions corre en su propia máquina y no comparte puertos con nadie.

### Criterio 10, contra #27 / #28 / #33

**No es alcanzable, y el recorte del documento es correcto.** Los únicos emisores son `director.ts:109` (`adventure_turn`) y `director.ts:205` (`battle_turn`). `map_generate` tiene serializador (`serialize.ts:211`) y **ningún llamante**; `hero_banter` no tiene ni serializador. Son #27 y #28, abiertos. `battle_state`, `spell_list` y `building_list` sí existen (`mcp/server.ts:294,304,321`) y hay batalla en cada pasada: el criterio 10, tal como está acotado, se cumple hoy.

**Criterio 11, con advertencia:** el `default: return {}` (`verify-agent.ts:232`) guarda una rama **inalcanzable**, porque nadie emite un tercer kind. Hacerlo fallar cuesta una línea y está bien, pero **no se puede ver morder por el circuito**, solo con un kind inventado a mano. El criterio 21 exige verlos morder: que nadie lo dé por visto con una pasada verde.

### Criterios 7 y 8: alcanzables, y ya medidos

Instrumenté una copia del arnés fuera del repo y volqué las escuchas: **el bloque llega desde la segunda**, con la forma `✓ req-1: Turno del día 1 aplicado entero: 3 acciones.` Las marcas las escribe `src/server/mcp/veredictos.ts:42` — el enunciado las sitúa en `notas.ts:285-297`, donde está la cabecera `CÓMO FUE LO ANTERIOR:` (`notas.ts:286`) pero no los signos. En la pasada de hoy: **14 veredictos, 14 `✓`, 0 `⚠`**.

Consecuencia honesta: el contador del criterio 7 dirá «0 descartadas» en cada pasada. Su valor es **detectar una regresión**, no descubrir nada hoy; y el criterio 8 nace verde, como debe. El coste que nadie ha nombrado: el arnés pasa a **raspar prosa** que `notas.ts` es libre de reescribir, y una reescritura del texto pondrá el QA en rojo sin que se rompa nada.

No es nuevo: la QA del ciclo anterior ya retiró este criterio delegándolo aquí (`docs/agents/2026-08-24-el-agente-defiende-y-responde/qa.md`, fila «31.6 del texto viejo»).

**Coste contra valor:** el trabajo vale. Sin él, la única prueba del circuito completo seguirá diciendo verde sin mirar.

## #53 — VIGENTE, sin cambios

**El problema real:** ningún hallazgo encontrado jugando se puede volver a producir.

**Premisa verificada.** `src/client/main.ts:45` y `:354` → `new Session(Date.now() % 100000)`. `#status` se reescribe cada fotograma desde `session.status` (`main.ts:156`): el sitio que propone el issue es el equivocado, y la barra superior (`index.html:11-15`) es estable. El aviso del enunciado es correcto.

**El criterio 16 es sólido por construcción:** `Session` (`session.ts:79-81`) pasa la semilla a `newGame`, que hace `createRng(seed)` para el plan de mapa, los héroes y el ejército inicial (`setup.ts:36-90`), y el invariante de `Math.random` ya está guardado. Reproducible de verdad, no de palabra.

**Coste contra valor:** el más barato del racimo y desbloquea la QA jugada de todos los ciclos siguientes. Nada que cambiar.

## #45 — REENCUADRADA: el fichero que duele es `.mcp.json`

**El problema real:** hay rutas de esta máquina en ficheros versionados; una es inerte y la otra rompe el agente.

**Premisa verificada.** Los doce `atlas.json` llevan `meta.image` absoluto a `tools/gen/.cache/` (comprobado uno a uno). Su **único** lector es un `existsSync` para construir `index.json` (`animate.ts:294`): ni `frames` ni `meta` los abre nadie, en ejecución ni en tests. Los doce crudos existen aquí y suman **16,4 MiB (17,2 MB)**, contra `.git` en 13 MB. Y **la ruta relativa no arregla lo que el issue describe**: la caché está en `.gitignore:15`, así que en otra máquina el fichero no está diga lo que diga, y los PNG por pose ya pasaron por `trim()` y `resize(256,256)` (`animate.ts:261-265`). Todo confirmado.

**Lo que el issue y el enunciado no vieron.** Barrí los ficheros versionados buscando `/home/`, y sale uno más: `.mcp.json:6` → `"args": ["tsx", "/home/al/code/heroes/src/server/mcp/server.ts"]`. **Está versionado y sí se lee**: es lo que enchufa el MCP `heroes`, la premisa entera del proyecto. En otra máquina el agente no arranca — que es exactamente el daño que #45 le atribuye a `atlas.json`, donde es inofensivo. El criterio 17 **muerde aquí también**, y eso es una ampliación de alcance real que no está en el documento. Es también la mejor noticia del racimo: el guardia nace con una presa de verdad.

**Conflicto con #37.** «Nueve criaturas mejoradas sin atlas de animación» está abierto: versionar los crudos hoy compromete otros ~12 MB cuando #37 aterrice, ~29 MB de atlas contra 13 MB de historia. La suposición por defecto (no versionar) es la correcta, y ahora por un motivo que no depende del gusto.

**Coste contra valor:** quitar el metadato muerto son minutos. Lo de `.mcp.json` es lo que de verdad paga el guardia.

## #58 — VIGENTE: borrar

**El problema real:** un campo que se escribe dos veces y no lo lee nadie.

**Premisa verificada.** Se escribe en `setup.ts:90` (`Jugador ${id+1}`) y se copia en `game.ts:204`. Único consumidor vivo: `ws-server.ts:67`, dentro del `SpectatorSnapshotMsg` de un canal **sin cliente** (#30 y #32, abiertos). **No** viaja al agente: `serialize.ts` serializa nombres de héroe (`:64`), de pueblo (`:80`) y de edificio (`:91`), nunca de jugador. Ningún test lee su valor; `game.test.ts:302` solo lo menciona en un comentario. `describePlayer` (`game.ts:396`) lo sustituyó por diseño y explica por qué.

**El día después.** Nada para quien juega. Se cierra la puerta a que #30/#32 pinten un nombre de jugador, pero hoy ese nombre es «Jugador 1» derivado del id: nada que perder. Darle uso es diseño de #18, así que la suposición por defecto (borrar) es correcta. **Ojo con confundirlo con #43:** ningún linter caza un campo escrito y nunca leído, `noUnusedLocals` no lo ve — #58 no lo resuelve #43.

## Qué le cambiaría a `requisitos.md`

1. **§El repo**: «`pnpm verify` = `typecheck && test`, 199 tests, **~6 s medidos** (typecheck 1,9 + test 4,1). `CLAUDE.md:308` dice 3 s y está obsoleto: el criterio 6 incluye corregirlo.»
2. **§#44**: sustituir «`pnpm qa` tarda ~1 min» por «**tarda 5,4 s**, medido tres veces. La partida termina el día 3 porque el agente defiende y pierde, así que `TURNOS = 6` no se alcanza: la cobertura real son **2 turnos de aventura y 13 decisiones de batalla**. `CLAUDE.md:311` está obsoleto y el criterio 6 lo corrige.»
3. **Criterio 12**: «Sigue saliendo 0 en el camino feliz y **sigue tardando menos de 15 s**.» El «alrededor de un minuto» haría que QA reportase una regresión falsa.
4. **Pregunta 2 — resuelta**: «`pnpm qa` **no** entra en `pnpm verify`. No por el tiempo, sino porque abre los puertos fijos 9880/9881 y sale 1 con `EADDRINUSE` si `pnpm server` está levantado, que es la forma documentada de jugar con el agente: el hook `Stop` se pondría rojo por tener el juego abierto. Su sitio es CI. Además 6,1 + 5,4 = 11,5 s rompe el tope de 10 s del criterio 5.»
5. **Criterio 11, coletilla**: «Esa rama es **inalcanzable** hoy —nadie emite un tercer kind—, así que no se puede ver morder por el circuito, solo con un kind inventado. No vale darla por vista con una pasada verde.»
6. **Criterio 7, coletilla**: «El arnés pasará a leer prosa que `notas.ts` puede reescribir. Asúmase el acoplamiento o átese a algo más estable, pero dígase cuál de las dos.»
7. **Criterio 17, alcance**: «El guardia tiene **dos presas hoy**: los doce `atlas.json` y **`.mcp.json:6`**, que además sí se lee — es lo que enchufa el MCP `heroes`, y en otra máquina el agente no arranca. Arreglar `.mcp.json` entra en el alcance.»
8. **Criterio 3, añadido**: «Enciéndanse además `noUnusedLocals` y `noUnusedParameters` en `tsconfig.json`: hoy sacan **seis** declaraciones muertas que `pnpm verify` no ve, cuestan dos líneas y cero dependencias, y es independiente de qué linter se elija.»
9. **Pregunta 3 — argumento añadido**: «#37 (nueve criaturas mejoradas sin atlas) está abierto: versionar los crudos hoy compromete otros ~12 MB después. No versionar.»
10. **Pregunta 5**: «Los jobs de GitHub Actions corren en máquinas distintas y no comparten puertos: el job aparte es buena higiene, pero no hace falta por los puertos.»
