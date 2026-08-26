# Crítica — el agente juega de verdad

**REENCUADRADA.** El problema es real y bien elegido; el reparto en seis no lo es. **#30 y #34 son el mismo trabajo con dos nombres**, **#32 no tiene sujeto**, **#28 no tiene dónde aterrizar** y **#27 no es «una línea»**. Son cuatro trabajos, y uno no cabe en este ciclo.

**El problema real, en una frase:** la promesa del proyecto —«los NPCs los lleva un agente y los mapas los diseña ese mismo agente»— no se puede **ver** ni **ejercer**: la demo es leer `console.log`, y de las cuatro clases de petición que el contrato anuncia solo se piden dos.

Base medida hoy: `pnpm verify` verde (310 tests, 7,6 s) y `pnpm qa` verde (5,55 s, **3 turnos de mapa y 9 decisiones de batalla** — no los 2 y 14 que dice `CLAUDE.md`).

## La premisa, afirmación por afirmación

| Dice | Verificación | ¿Cierto? |
|---|---|---|
| #33: `map` se sirve y ninguna tool la expone | `consultas.ts:83-91` la sirve; `mcp/server.ts:336-381` publica cinco y ninguna es `map` | sí |
| #33: la niebla ya está puesta «antes de #33» | Medido por el cable, día 1, agente con el jugador 1: `map` → 576 casillas, **495 `null` (85,9 % tapado)**, 0 caminos, 7 objetos; `map{player:0}` → `ok=false` «no es tuyo» | **sí, se sostiene** |
| #27: lo difícil está escrito, «solo falta el `link.ask`» | `mapPlanSchema` (`agent.ts:80`), `serializeMapRequest` (`serialize.ts:359`), `validateMapPlan`/`buildMap` (`generate.ts:77,146`) y **`newGame` ya acepta `plan`** (`setup.ts:17,39-40`); `ask<K>` valida sola (`agent-link.ts:216-253`) | casi |
| ↳ lo que falta y el issue no dice | `Director` construye el mapa **en el constructor** (`director.ts:61`) y `ws-server.ts:34` lo instancia **al importar**, antes de esperar al agente (`:164`); `link.onQuery` (`:40`) apunta a `director.state`. Exige arranque asíncrono | **no es una línea** |
| #28: anunciado, sin serializador ni sitio | `mcp/server.ts:187` lo anuncia; `GameEvent` (`events.ts:70-86`) no tiene variante para una frase | sí, entero |
| #30: un snapshot por turno que no lee nadie | Medido: espectador enganchado 40 s → **17 snapshots, ~20 KB**, uno por turno | sí |
| #32: `SpectatorLogMsg` con cero emisores | `protocol.ts:90-93` | sí, e irrelevante |
| #34: `session.ts` juega en local | `session.ts:83` `newGame`, `:233` `playAiTurn` | sí |

## 1 · #34 no hace innecesario #30: **#30 es #34 sin entrada**

No son escalón y cima. El cuerpo de #34 **no pide que el navegador juegue por WebSocket**: pide «ver una partida del agente con la interfaz del juego», que es un espectador con los renderizadores de verdad. Y el canal de hoy no sirve para eso, por dos motivos medidos:

- **No hay ninguna batalla en el mensaje.** `view` lleva `map, players, heroes, towns, log, directorLog`. `broadcast()` se llama en tres sitios (`ws-server.ts:73,172,203`) y el de en medio es **después de cada turno**, mientras las batallas se resuelven **dentro** de `Director.playTurn`. Un espectador sobre esto enseña días pasando y **no ve una sola batalla** — justo donde el agente decide más (9 de 12 respuestas en `pnpm qa`).
- **El snapshot no es un `GameState`**: héroes sin maná, hechizos, nivel ni ataque/defensa; `fog` como array. Los renderizadores piden `GameState`/`BattleState` (`render/adventure.ts:6`, `render/battle.ts:6`) y leen `Set` de verdad: `map.roads.has()` (`adventure.ts:90`) y `player.fog.has()` (`:99,129`).

**Lo que ahorra el ciclo:** hacer #30 «barato» sobre el mensaje actual es escribir un segundo pintor de mapas que nunca enseñará una batalla — trabajo que #34 tira, no un escalón. El escalón compartido de verdad es engordar el snapshot hasta que sea un `GameState`, y eso es #10.

## 2 · #34 no cabe, y la mitad que no cabe no es la que pide el issue

Hay dos #34 dentro del mismo título: **(a)** el navegador mira la partida del servidor, sin entrada —lo que pide el cuerpo, y absorbe #30 y #32—; y **(b)** `session.ts` deja de aplicar reglas y manda intenciones, que lo anticipa el comentario de `session.ts:6` pero **no lo pide ningún issue**: un comentario no es un requisito. (b) es un ciclo propio y arriesga el criterio 10.

El bloqueo de (a) está escrito en el repo: **`GameState` no sobrevive a `JSON`**. `Player.fog` es `Set` (`game.ts:66`), `Player.memory` es `Map` (`:76`), `map.roads` es `Set` (`map/map.ts:56`), y `test/invariantes.test.ts:623` lo dice con todas las letras — el guardia del viaje de ida y vuelta mira `state.log` **y no `state`** porque `fog` lo pondría rojo. **(a) contiene la parte difícil de #10**, y eso no está en ningún criterio de aceptación.

Y para no confiarse con «la única puerta»: el guardia de `invariantes.test.ts:461-468` vigila **escrituras** (`applyAdventureAction|…|newGame`), no lecturas. `session.state` es un `GameState` público que los renderizadores recorren entero. «Cambia esa capa y solo esa» es cierto para quien escribe y **falso para quien lee**.

## 3 · #28: retirar el anuncio. #32: borrarlo

**#28.** No hay sitio donde enseñar la frase y no hay uno barato. El único registro que la pantalla pinta es `state.log`, una unión tipada de **hechos** (`events.ts:70-86`), de solo lectura, sellada por `emit`, filtrada por `cronicaPara` y sometida al guardia del `JSON`. Meter ahí texto libre del agente no es «una frase»: es una variante del ledger de hechos que no es un hecho. Y ocupa el **canal único** (`Buzon.recogida` obliga a contestar antes de volver a escuchar), o sea que el sabor se cuela por delante de una decisión de turno. Retirarlo son cinco borrados y deja el contrato honesto **hoy**; se reabre cuando exista pantalla donde leerla.

**#32.** `SpectatorLogMsg` es `readonly lines: string[]`. El snapshot ya lleva `view.log` con **40 eventos estructurados** (medido) y `view.directorLog`: el tipo declarado es estrictamente más pobre que lo que ya viaja. **No tiene sujeto** — emitirlo sería fabricarle uno.

## El día después

- **La semilla deja de fijar la partida.** Con #27, `newGame` no llama a `generateMapPlan`, así que ni el mapa ni el ejército inicial salen de la semilla (la corriente del `rng` se desplaza, `setup.ts:73`). `CLAUDE.md` promete reproducir un fallo copiando la barra de direcciones: hay que **decirlo**, no romperlo en silencio. `pnpm banco` no se entera.
- **Se cierra una puerta:** fijar el snapshot como «lo ve TODO» descarta un espectador con niebla. Decisión legítima; que se escriba en vez de heredarse. Y el aviso de `ws-server.ts:88-92` de no unificarlo con la consulta `map` sigue siendo verdad aunque el snapshot engorde: no se toca.

## Conflictos, con su orden

1. **#27 × #63 — dependencia oculta, y de seguridad.** `buildMap` usa ids y nombres del plan **verbatim** (`generate.ts:167,214`) y `mapPlanSchema` los declara `z.string()` sin límite (`agent.ts:88-90`). La pantalla los mete sin escapar en `innerHTML`: `data-town="${t.id}"` (`panels.ts:127`) y `<span>${t.name}</span>` (`:128`), vía `main.ts:204`. Hoy es inalcanzable porque el navegador juega en local; **#27 más cualquier visor lo hace alcanzable**. #63 está archivado como «no urgente, no hay bug hoy» y este racimo es justo lo que lo cambia: **#63 va antes que el visor.**
2. **#33 × #85 — solapamiento declarado por el propio #85**: «son las dos formas de darle el mapa —bajo demanda o en cada turno— y conviene decidirlas juntas». #33 es la barata (#85 cuesta +4 KB por turno) y no la cierra; decidir #85 sin mirar #33 paga dos veces.
3. **#83 vive en el fichero de #33 y sigue vivo.** Reproducido ahora por el cable, agente con el jugador 1: `battle_state{player:0}` → **`ok=true`**, mientras `game_state{player:0}` y `map{player:0}` lo rechazan. Publicar `map` bajo la promesa «el agente solo pregunta por los suyos» con la puerta de al lado incumpliéndola reabre la frase con la que se cerró #73. Es mover una línea.
4. **#64 × #34** — #64 apuesta a que #34 lo resuelve solo. Solo con el #34 caro (b): con (a) el navegador ve la partida entera a propósito y **#64 sigue igual**. Que no se archive esperando.
5. **#33 × `pnpm qa`** — el arnés cuenta las cinco consultas por su nombre; una tool que no entre ahí nace sin vigilancia. Sin conflicto: #16, #17, #18 y #12 son pantalla del jugador local.

## Coste contra valor

**#33**: horas, sobre una consulta ya escrita, tapada y medida — el mayor valor por euro del racimo. **#32 y #28**: minutos, y son borrados. **#27**: días, no horas; el arranque asíncrono es lo que el issue no cuenta, y aun así vale la pena porque es una de las tres promesas. **#30+#34(a)**: ciclo entero, con el códec de #10 dentro; **no cabe aquí**. **#34(b)**: no hacerlo. «No hacer nada» es la respuesta correcta solo para (b): para el resto, un contrato que anuncia lo que no pasa lo paga un agente que no puede leer el código para descubrir la mentira.

## Qué le cambiaría a `requisitos.md` (para pegarse tal cual)

> **Tanda 1 — el contrato deja de mentir.** #33 (publicar la tool `map`, con `PARAMETRO_JUGADOR` en su descripción y su línea en el arnés), #83 (mover una línea en `consultas.ts`: el candado antes de la guarda de `pending`), #32 (**borrar** `SpectatorLogMsg`) y #28 (**retirar** `hero_banter` del anuncio, reabriéndolo cuando exista pantalla). Criterio: nada anunciado al agente —petición o consulta— sigue sin existir.
>
> **Tanda 2 — el agente diseña el mapa.** #27, con lo que el issue no dice: el mapa se pide **después** de que el agente conecte, así que `Director` necesita arranque asíncrono y `link.onQuery` no puede apuntar a un `state` que aún no existe. Y se dice, en la barra y en el log, **que la semilla ya no fija la partida** cuando el mapa lo diseña el agente.
>
> **Tanda 3 — fuera de este racimo: #30 y #34 se funden** en «el navegador mira la partida del servidor», un solo issue y un ciclo propio, cuyo primer entregable es el (de)serializador de `GameState` que #10 pide. Antes de escribir una línea de él, **#63**: es el momento en que los nombres que escribe el agente llegan a un `innerHTML`.
>
> Se cae la pregunta abierta de si #34 hace innecesario #30 —son el mismo trabajo— y la suposición de que #28 se implementa: no hay sitio donde enseñar la frase.
