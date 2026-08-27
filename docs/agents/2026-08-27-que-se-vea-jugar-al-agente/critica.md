# Crítica — «que se vea jugar al agente»

**#63 → REENCUADRADA. #30 → VIGENTE, con tres avisos. La tanda se hace, y en este orden.**

**El problema real** · #63: el único texto ajeno que llegará a un DOM es el que pintará un visor de
la partida del servidor, que aún no existe — el fichero que el issue señala no es el expuesto. ·
#30: el proyecto no se puede enseñar; ver jugar al agente es leer `console.log`.

## La premisa, afirmación por afirmación — ejecutada contra el esquema y `buildMap` reales

| Afirmación | Verificación |
|---|---|
| #97·1 «`id` y `name` son `z.string()` sin acotar» | **FALSA hoy**: `bc2ac96` los acotó. El `name` malo pasa; el `id` con comilla **lo rechaza el esquema** (`agent.ts:100-106`, `/^[a-z0-9][a-z0-9_-]*$/`) |
| #97·2-3 «`buildMap` los pasa verbatim y `panels.ts` los interpola sin escapar» | **CIERTAS**: `Town.name` = `"<img src=x onerror=alert(1)>"` y `validateMapPlan` → `[]`; la interpolación está en `panels.ts:127` (`renderSide`), no en `renderTopbar` |
| #63 «`renderTopbar` pinta nombres de héroe y castillo» | **FALSA**: `renderTopbar` (21-53) pinta recursos, día y turno — **cero** interpolaciones ajenas. Están en `renderSide` (115, 127) y `renderTownPanel` (198, 203) |
| #97·4 «el `data-town` es el peor de los dos» | **INVERTIDA**: el `id` ya está cerrado en origen; el `name` sigue abierto |
| «#27 lo hace alcanzable» | **NO todavía**: el cliente no abre ninguna conexión (`grep WebSocket src/client` → solo comentarios) y `session.ts:83` hace `newGame({seed})` procedimental. Hoy el navegador **nunca** pinta texto del agente |
| «el canal ya emite un snapshot completo» | **CIERTA** (`ws-server.ts:100-142`) y JSON-limpio: `roads`/`fog` ya son arrays, `terrain` es `TerrainKind[]`, `log` pasa por `sinSello` |

**Lo que no está en ningún issue y sí está en el cable**: `director.ts:126` hace
`this.note(\`Agente: ${plan.reasoning}\`)` —`z.string().max(2000)`, prosa libre del modelo— y viaja
al espectador en `view.directorLog`. Es el texto ajeno **más probable** que lleve `<` o una comilla,
y `panels.ts` no lo pinta nunca: arreglar `panels.ts` no lo cubre. **Y `hireHero` (`game.ts:718`)
bautiza al héroe `Capitán de ${town.name}`**: el nombre del pueblo se propaga al del héroe, así que
un «saneo en la entrada» nace con una fuga.

**No verifiqué en navegador que `<img onerror>` se ejecute** (la herramienta de Chrome exige una
selección del usuario que un subagente no puede dar). Sí que nada lo para: no hay CSP en
`index.html` ni cabeceras en `vite.config.ts`, e `innerHTML` desactiva `<script>` pero no `onerror`.

## Las cinco preguntas

**1 · ¿#30 es trabajo tirado si #34 entra después? No.** Medido: `session.ts` (565 líneas) es **el
único fichero que #34 reescribe** y el espectador no usa nada de él. `drawAdventure` lee exactamente
once campos —`map.{width,height,terrain,roads,objects}`, `players[].{id,fog}`,
`heroes[].{at,id,owner,name}`— y **el snapshot los trae los once**: faltan dos `new Set(...)`, y ese
adaptador es lo que #34 también querrá. `renderLog(log, viewer)` (`panels.ts:473`) ya toma
argumentos planos, no `Session`: reutilizable tal cual, y es el único pintor de `panels.ts` sin
texto ajeno. Lo único duplicado sería el bucle de dibujo de `main.ts:127-209`, ~80 líneas. El riesgo
no es tirar trabajo: es acabar con **una tercera serialización del mapa**, y `ws-server.ts:101-105`
ya avisa por escrito de las dos que hay.

**2 · ¿#63 está bien planteado?** El problema es real; el issue apunta mal: el fichero es
`renderSide`/`renderTownPanel`, el `id` lo cerró `bc2ac96` y el canal más ancho (`directorLog`) no
está en ninguno de los dos issues. Por eso REENCUADRADA y no VIGENTE.

**3 · ¿El criterio 2 es alcanzable? Sí, y hay que presupuestarlo.** 15 funciones, 60 literales de
marcado, **169 interpolaciones**. Un `escape()` suelto no cumple el criterio, y una plantilla
etiquetada que devuelva `string` a secas **escapa dos veces** lo de la llamada anidada: el resultado
tiene que ir marcado. No es imposible como el criterio 8 de #71 —es mecánico— pero toca todas las
líneas que producen marcado, y por eso hay que reescribir el **criterio 5**.

**4 · ¿El criterio 12 es ejecutable? Como guardia automático, no.** `vitest.config.ts:12` declara
`environment: 'node'` y no hay `jsdom`, `happy-dom` ni `playwright` en `devDependencies`. «No
ejecuta nada» solo lo ve una persona; la mitad automatizable es de cadena. Pártelo en dos, o el
criterio 4 («el guardia se ve rojo») no se puede cumplir sobre él.

**5 · ¿#42? Hiciste bien dejándolo fuera.** El snapshot **no lleva batalla** —no hay campo y
`broadcast()` corre una vez por turno (`ws-server.ts:200`)—, así que el espectador nunca abre esa
pantalla. Y es canvas, no DOM: cero solape con #63.

## El día después · Conflictos

- Termina #63 y **no cambia nada para quien juega**: deuda preventiva declarada, no un bug cerrado.
  Termina #30 y se ve el mapa, las banderas, el día y la crónica — **una imagen por turno**. No se
  ve una decisión de batalla, y en la cobertura de `pnpm qa` son **14 de 16**. El criterio 8 no las
  promete, así que los requisitos son coherentes; el **título** de la tanda no.
- **#34**: sin conflicto ni trabajo tirado. **#64**: fuera, y bien — el espectador lo ve todo.
- **Aliado, no conflicto**: el invariante «el cliente no aplica reglas» (`invariantes.test.ts:461`)
  corre sobre `ficheros('src/client')`: dentro, el **criterio 7 sale gratis y con guardia**; fuera, no.
- **Trampa de la clase `pnpm server`**: `vite.config.ts` no declara `build.rollupOptions.input`, así
  que `pnpm dev` sirve una segunda página pero `vite build` **la omite en silencio** con CI en verde.
- **Trampa del puerto**: 9880 por defecto, pero `HEROES_SPECTATOR_PORT` lo mueve y **acepta `0`**
  (`puertos.ts:47`). Un `ws://localhost:9880` a mano contradice la decisión de #61.

**Coste contra valor** · #30 es la mejor relación del backlog: el emisor está hecho y probado, el
adaptador son ~15 líneas, falta una página. #63 es caro para lo que arregla **hoy** —169
interpolaciones para cerrar una puerta que nadie cruza— y barato para cuando haya dos pintores. No
hacerlo nunca es opción viva mientras el navegador juegue en local, y deja de serlo en cuanto #30
entra. El orden es correcto; el valor de #63 solo se cobra si la puerta la usa **el espectador**.

## Qué le cambiarías a `requisitos.md`, para pegar tal cual

1. **Criterio 1**, sustituir la lista: «los conocidos son el `name` de un pueblo —el `id` ya lo acota
   `mapPlanSchema` desde `bc2ac96`—, el del héroe (que `hireHero` deriva del pueblo) y
   **`view.directorLog`, que lleva el `reasoning` del agente sin acotar**.»
2. **Criterio 2**, añadir: «la puerta es **una sola para los dos pintores**: la usa `panels.ts` y la
   usa el espectador. Dos puertas es no tener ninguna.»
3. **Criterio 3**, corregir: el `id` ya no es el peor de los dos —lo cierra el esquema—; su prueba
   queda como defensa en profundidad, no como el agujero abierto.
4. **Criterio 5**, reescribir: «la pantalla pinta **el mismo píxel** con nombres normales. No cambia
   el diseño de los paneles, pero sí toca las 169 interpolaciones: está presupuestado.»
5. **Criterio 12**, partir en dos: 12a de máquina, «lo pintado lleva `&lt;img` y no `<img`»; 12b de
   persona, «visto en el navegador con la partida del servidor delante».
6. **Criterio 16 nuevo**: «la página entra en `vite build` y se comprueba que está en `dist/`.»
7. **Criterio 17 nuevo**: «el puerto no va escrito a mano: `HEROES_SPECTATOR_PORT` lo mueve y acepta
   `0`. Si no se puede resolver, se dice — no se supone 9880.»
8. **A «fuera de alcance»**: «**las batallas no se ven.** El snapshot no lleva `battle` y se emite
   una vez por turno: se enseña el mapa entre turnos, no las decisiones de batalla, que son la
   mayoría de las que toma el agente. Eso es otro issue.»
