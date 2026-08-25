# Crítica — la niebla tapa también las consultas

**#74 REENCUADRADA · #73 REENCUADRADA · #72 PREMATURA.** El racimo **se sostiene: ninguno se cae**,
pero se envía en **dos entregas**: #74 y #73 ahora, #72 detrás de #52. Las tres premisas que me
pediste tumbar **aguantan** — y la de #73 aguanta **por un motivo distinto del que dice el issue, y peor**.

## El problema real, en una frase

Tres salidas del núcleo se escribieron antes de que existiera «lo que este jugador ve» y ninguna se
revisó cuando #59 lo estrenó: dos entregan de más (#74, #73) y la fuente entrega de menos (#72).

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| `consultas.ts:73-81` devuelve el mapa entero | **Cierta, en esas líneas.** `width, height, terrain, roads, objects` de `state.map`, sin mirar a `player` |
| «`serializeAdventureTurn` ya sabe filtrar un mapa» (crit. 2) | **FALSA.** `knownMap` lleva `width, height, objects` y **ni `terrain` ni `roads`**; sus objetos salen de `player.memory`, no de un mapa recortado. No hay filtro que llamar |
| #73: «solo pasa con monstruos neutrales, que no tienen héroe con secretos» | **FALSA, y el issue se queda corto.** `battleOwners` (`game.ts:951-963`) pone al monstruo de **defensor**; el atacante es siempre un jugador, y `battleSideForHero` (`:876-895`) le monta un `hero` con `mana` y `spells`. Medido 8/8: al agente que lleva **solo al 1** le llega `{"name":"Aldo de Valdeluz",…,"mana":7,"spells":["magic_arrow","haste"]}` **del jugador 0** |
| `visibleNow` (`:300-307`) da a un castillo solo `pointKey(town.at)` | **Cierta, en esas líneas.** Y la regla está **escrita dos veces**: `visibleNowAt` (`:334-348`) la repite con coordenadas exactas. Son **dos ediciones** |
| Un héroe enemigo pegado a tu capital no te da un `hero_moved` | **Cierta, medida.** 60 escenarios (rival moviéndose junto a mi capital, mi héroe fuera de radio 4): **0/60 llegan**. Con radio de pueblo 5: **60/60** |

**La cifra de fheroes2, en su código fuente.** `GameStatic::getFogDiscoveryDistance`
(`game/game_static.cpp`): `CASTLE: 5`, `HEROES: 4`. `Castle::Scout()` (`castle/castle.cpp`) la llama
**sin ramificar por el fuerte**, y el enum no tiene valor `TOWN`. Respuesta a la pregunta abierta:
**el radio NO depende de la fortificación; pueblo y castillo son 5**, y nuestro `HERO_SCOUT_RADIUS = 4`
ya coincide con el suyo. *Aviso de forma:* allí se despeja un disco chapucero (`dx²+dy² < (d+1)²−d`,
`maps.cpp`) y nuestro `visibleFrom` (`map.ts:257-266`) es un cuadrado, así que el héroe **ya diverge**
(81 casillas contra 69). **Cópiese el número, no la forma**, y dígase.

## #74 y #73 son la misma cosa: fugas escritas y no publicadas

#74 lo dice de sí mismo. #73 lo es también, y no por su motivo: la ventana en la que existe una
batalla ajena **no sobrevive a un tick del bucle de eventos**. `playAiTurn` (`turn.ts:95-99`) solo
hace `await takeover(...)`, y `Director.playBattle` (`director.ts:186-190`) **vuelve antes de
cualquier `await`** cuando `bandos.size === 0`; `resolvePendingBattle` corre pegado. Medido: 489
ticks con batalla pendiente en 40 partidas dirigidas, **489 propias y 0 ajenas** — un `query` es E/S
y no entra en una ventana de solo microtareas. Que la situación sí *ocurra* está medido aparte:
**111 batallas contra monstruo en 200 partidas, 94 del jugador 0** (~0,5 ajenas por partida).

Se arreglan **ahora y baratos** —cerrar antes de abrir la puerta—, pero que el informe **no diga «fuga cerrada»**: diga «puerta tapiada antes de #33».

## El día después

- **#74**: al día ~6 el jugador ha explorado el **54,7 %** de las casillas y recuerda el **73,1 %** de
  los objetos; `map` son 7 388 bytes contra 2 284 de `knownMap`. Lo que se **abre** es decidir cómo se
  ve una casilla no explorada en `terrain` y `roads`: **no hay precedente**, es decisión nueva.
- **#73**: nada cambia para quien juega; cambia el día que haya tres jugadores.
- **#72**: el único que se nota. Los eventos ajenos entregados suben de **703 a 929** en 60 partidas
  (**+32 %**). Comprobé la incoherencia que sospechaba —avisos sobre casillas nunca exploradas— y es
  **0 % antes y después**: la retiro, no era objeción.

## El coste de #72, medido

Parché `visibleNow` **y** `visibleNowAt` con radio 5 en una copia, y `banco 200 300` contra el volcado anterior:

- **1 866 de 28 100 eventos (6,6 %) cambian de sello `seen`.**
- **Cero líneas `fin`**: mismo ganador, mismo día y mismos hechos en las 200 partidas.
- **El 100 % de las líneas que difieren difieren SOLO en `seen`.** Sha nuevo `4133e12a…`
  (informativo: es el de radio 5 y cuadrado). `barrido-semillas`: **0/40**, sin mover.

Así que **el criterio 13 no sobra** —el hash sí se mueve—, pero se puede pedir algo más fuerte que
«se ancla el nuevo»: **el `diff` de los dos volcados debe traer solo diferencias de `seen` y cero
líneas `fin`**. Eso caza una implementación mala que el hash solo dejaría pasar.

## Conflictos

1. **#52 sigue en vuelo y sí moverá el ancla** (su `plan.md` reserva la columna «Banco, 5 000
   batallas»). **#50 ya aterrizó (`41afb14`) y NO la movió** (`charge` no pisa el tablero). La
   dependencia del criterio 13 es real pero **más estrecha: bloquea contra #52, no contra «el ciclo»**.
2. **Colisión de ficheros, no solo de ancla.** Ese ingeniero tiene ahora modificados
   `src/core/ai/tactics.ts`, `test/battle.test.ts`, **`src/core/contract/agent.ts`** y
   **`src/server/notas.ts`**. Los dos últimos son exactamente donde aterriza el criterio 16 si #73
   toca el JSON de batalla. **#73 no empieza hasta que #52 haya commiteado**, o se pagan dos rebases.
3. **`ws-server.ts` `broadcast()` tiene una tercera copia** de esa forma de cinco campos, para el
   espectador y **deliberadamente sin filtrar**: si se extrae un ayudante, que no se lo lleve.
4. **#64** pinta desde `fog` y #72 no toca `fog`: no se rozan.

## Qué le cambiaría a `requisitos.md`

- **Criterio 2**: «No existe hoy un filtro de mapa que reutilizar: `serializeAdventureTurn` no filtra
  `state.map`, construye `knownMap` desde `player.memory` y **no lleva `terrain` ni `roads`**. La
  regla de los objetos sí se comparte; la de terreno y caminos —qué se ve en una casilla no
  explorada— **se decide aquí por primera vez** y se escribe una sola vez para los dos.»
- **Criterio 8**: «El test que falsifica hoy es el de **dos** jugadores: rival contra monstruo, agente
  que lleva solo al 1, y el `hero` que vuelve es el del jugador 0 con su `mana` y sus `spells`. Ese
  escenario ya está montado en `test/agent-link.test.ts:509`. El de tres jugadores es constructible
  (`newGame({plan})`, `validateMapPlan` pide ≥2 inicios) pero prueba lo hipotético: entra solo si sale
  barato, y después del de dos.»
- **Criterio 10**: «La regla del pueblo está **en dos sitios**, `visibleNow` (`:300-307`) y
  `visibleNowAt` (`:334-348`). Las dos, o el test que las compara casilla a casilla se pone rojo.»
- **Criterio 11**: «La cifra es **5** y **no depende de la fortificación**:
  `getFogDiscoveryDistance` → `CASTLE: 5`, `HEROES: 4`; `Castle::Scout()` no ramifica por el fuerte y
  no hay valor `TOWN`. Se copia el número, **no la forma**: allí es un disco y aquí un cuadrado.»
- **Criterio 13**: «Bloquea contra **#52** en concreto, y no solo por el ancla: ese ciclo tiene
  abiertos `contract/agent.ts` y `server/notas.ts`. El criterio no es que el hash cambie, es que
  `diff antes.jsonl ahora.jsonl` traiga **solo** `seen` y **cero** líneas `fin`.»
- **Fuera de alcance, línea nueva**: «Que el pueblo despeje también `fog` **no entra**. En fheroes2 el
  radio del castillo es un `Maps::ClearFog`, o sea nuestra capa `fog` (`revealAround`,
  `game.ts:265-266`, hoy solo de héroes) — pero eso cambia además `knownMap` y es otra decisión. Aquí
  se toca `visibleNow`/`visibleNowAt` y ya; la medida de coste solo cubre eso.»
