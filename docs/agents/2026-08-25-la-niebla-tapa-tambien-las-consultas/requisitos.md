# Requisitos — la niebla tapa también las consultas

**Issues**: #74 (la consulta `map` devuelve el mapa entero sin filtrar), #73
(una batalla entre dos terceros enseña el maná y el libro del héroe ajeno) y #72
(un castillo tiene radio de visión 0).

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

Y, al volver, eligiendo entre cuatro órdenes posibles que le propuse:

> «El orden propuesto» — que es: #61 a mano, luego el ciclo de la IA de batalla
> (#52/#50), **luego este racimo**, y economía después.

## De dónde sale el racimo

Los tres los encontró el ciclo de #59 al cerrar la crónica: dos en su propia
pasada de cierre y uno en la pasada adversarial de QA. Comparten una frase:
**#59 cerró la puerta principal y estas son las de al lado.** El agente ya no
lee el diario del rival, pero puede pedir el mapa entero, ver el maná de un
héroe que no es suyo, y —del otro lado— no enterarse de que le acampan al lado
de la capital porque la fuente de visión de un castillo es su propia casilla.

No es una lista de tres cosas parecidas: es **una sola pregunta** —qué ve cada
jugador— mirada desde la fuente (`visibleNow`) y desde las dos salidas
(`consultas.ts`).

## Corregido por la crítica

`critica.md` reencuadra #74 y #73 y declara #72 **prematuro**, y **tumba un
criterio que había escrito yo**. Ninguno de los tres se cae; el racimo se envía
en **dos entregas**:

| Entrega | Qué | Cuándo |
|---|---|---|
| **1** | #74 | ya |
| **2** | #73 y #72 | **cuando #52 haya commiteado**, no antes |

El corte no es por el hash: el ingeniero de #52 tiene abiertos ahora mismo
`src/core/contract/agent.ts` y `src/server/notas.ts`, que es exactamente donde
aterriza el criterio 16 si #73 toca el JSON de batalla. Empezar antes son dos
rebases pagados por nada. (#50 ya aterrizó en `41afb14` **sin mover el ancla**,
tal como pedía su criterio.)

Y la palabra del informe importa: **ni #74 ni #73 son «una fuga cerrada»**. Son
**puertas tapiadas antes de abrirlas** — ninguna la alcanza nadie hoy. Medido:
la ventana en la que existe una batalla ajena no sobrevive a un tick del bucle
de eventos (489 ticks con batalla pendiente en 40 partidas, **489 propias y 0
ajenas**), porque un `query` es E/S y ahí solo corren microtareas.

## Criterios de aceptación

### #74 — la consulta `map` pasa por la niebla

1. `responderConsulta(..., 'map', …)` devuelve **lo que ese jugador ha
   explorado**, no el mapa entero. Hoy devuelve `state.map` tal cual
   (`src/server/consultas.ts:73-81`): ancho, alto, terreno, caminos y objetos.
2. ~~El criterio de qué se ve es el **mismo** que ya usa el resto del contrato.
   Si `serializeAdventureTurn` ya sabe filtrar un mapa por la niebla de un
   jugador, esta consulta lo llama.~~ **RETIRADO: era falso y lo escribí yo.**
   `serializeAdventureTurn` no filtra `state.map`: construye `knownMap` desde
   `player.memory`, y ese `knownMap` lleva `width, height, objects` y **ni
   `terrain` ni `roads`**. No hay filtro que reutilizar. Lo que sí se comparte
   es la regla de los **objetos**; la de **terreno y caminos** —qué se ve en una
   casilla que no has explorado— **se decide aquí por primera vez**, y se
   escribe **una sola vez** para los dos consumidores. Que sea una decisión
   nueva y no una reutilización es justo lo que había que saber antes de
   empezar.
   *Y una tercera copia que no se toca*: `broadcast()` de `ws-server.ts` repite
   esa forma de cinco campos para el espectador y **deliberadamente sin
   filtrar**. Si se extrae un ayudante, que no se lo lleve por delante.
3. La consulta pasa por `jugadorDelAgente`, igual que `game_state` y
   `battle_state`: preguntar por un jugador que no es tuyo se rechaza
   nombrando los tuyos.
4. **Test que falsifique**, no que confirme: un objeto colocado fuera de la
   niebla del jugador 1 no sale en su consulta y **sí** sale en la del 0.
5. **La tool NO se publica.** Eso es #33 y queda fuera. Este ciclo arregla la
   fuga *antes* de que exista la puerta, que es más barato que quitársela a un
   agente que ya la tenía.

### #73 — una batalla ajena se ve, pero sin los secretos de nadie

6. Se decide y se escribe **qué campos de una vista de batalla son públicos y
   cuáles son del bando que los tiene**. Punto de partida, a refinar por el
   arquitecto: público el tablero —posiciones, stacks, ronda, de quién es el
   turno, quién va ganando—; del bando, el **maná del héroe y su libro de
   hechizos**.
7. **No se niega la vista.** Ya se decidió y sigue en pie: a quien mira una
   batalla que no es suya se le enseña con los ojos del atacante **y se le
   dice** (`consultas.ts:47-56`). Lo que cambia es lo que va dentro.
8. El test que falsifica **hoy** es el de **dos** jugadores, no el de tres: el
   monstruo es siempre el **defensor** (`battleOwners`, `game.ts:951-963`) y el
   atacante es siempre un jugador, así que `battleSideForHero` le monta un
   `hero` con `mana` y `spells`. Medido 8/8: al agente que lleva **solo al
   jugador 1** le llega `{"name":"Aldo de Valdeluz",…,"mana":7,
   "spells":["magic_arrow","haste"]}` del **jugador 0**. El escenario ya está
   montado en `test/agent-link.test.ts:509`. El de tres jugadores es
   constructible, pero prueba lo hipotético: entra **solo si sale barato**, y
   después del de dos.
   *La premisa del issue era falsa por el lado bueno*: no es «solo con monstruos
   neutrales, que no tienen secretos». La situación ocurre 111 veces en 200
   partidas (94 del jugador 0), y lo que se escapa es el héroe de una persona.
9. Un bando que **sí** es tuyo sigue viendo su maná y su libro. Un arreglo que
   se los quite a todos no es un arreglo.

### #72 — un castillo ve algo más que su propia casilla

10. `visibleNow` (`src/core/state/game.ts:300-307`) da a cada héroe un cuadrado
    de radio `HERO_SCOUT_RADIUS` y a cada castillo **`pointKey(town.at)` y nada
    más**. El castillo pasa a tener radio propio. **La regla está escrita en dos
    sitios**: `visibleNowAt` (`:334-348`) la repite con coordenadas exactas. Se
    editan **las dos**, o un test que las compare casilla a casilla las caza —y
    ese test hay que escribirlo, porque hoy no existe.
11. La cifra es **5**, y **no depende de la fortificación**: ya está buscada en
    el código fuente del original. `GameStatic::getFogDiscoveryDistance`
    (`game/game_static.cpp`) da `CASTLE: 5` y `HEROES: 4` —nuestro
    `HERO_SCOUT_RADIUS = 4` ya coincide—, `Castle::Scout()` la llama **sin
    ramificar por el fuerte** y el enum no tiene valor `TOWN`.
    **Se copia el número, no la forma**, y se dice en un comentario: allí se
    despeja un disco y nuestro `visibleFrom` es un cuadrado, así que el héroe
    **ya diverge** (81 casillas contra 69). Igualar la forma es otra tarea.
12. Criterio observable, y es el del issue: **un héroe enemigo en una casilla
    adyacente a tu capital produce un `hero_moved` que te llega.** Hoy no llega.
13. Bloquea contra **#52 en concreto**, no contra «el ciclo»: #50 ya aterrizó
    sin mover el ancla. Y el criterio no es que el hash cambie —eso lo cumple
    también una implementación mala—: es que **`diff` de los dos volcados traiga
    SOLO diferencias de `seen` y CERO líneas `fin`**. Ya está medido con radio 5
    en las dos funciones: **1 866 de 28 100 eventos (6,6 %) cambian de sello**,
    cero líneas `fin` —mismo ganador, mismo día y mismos hechos en las 200
    partidas— y el **100 %** de las líneas que difieren difieren solo en `seen`.
    Reproducirlo es el criterio; el ancla nueva se escribe después.
14. `npx tsx tools/qa/barrido-semillas.ts` sigue en **0/40** sin terminar. La
    línea base es cero desde hace dos ciclos: **una sola semilla que no termine
    es una regresión**, no ruido.

### Transversales

15. `pnpm verify` verde, y cada test que cambie de sentido se **reescribe**, no
    se adapta. Ojo con el modo de fallo que ya avisó #71: los tests que afirman
    **ausencias** (`not.toContain(0)`) siguen verdes con el cambio bien hecho y
    con el cambio mal hecho.
16. Si cambia el JSON que ve el agente, **el esquema zod y la prosa de
    `RESPONSE_FORMAT` viajan juntos** y entra `pnpm qa` — que desde #61 convive
    con un `pnpm server` abierto, así que no hay excusa para saltárselo.
17. **`CLAUDE.md` no lo toca nadie del ciclo.** Lo escribe el coordinador con lo
    que salga.

## Fuera de alcance, y por qué

- **#33** (publicar la tool `map` por MCP): es la puerta; este ciclo arregla lo
  que hay detrás. Se cierra después y se cierra solo.
- **#70 y #71** (el modelo del `GameEvent`: `actor` significa dos cosas, y el
  sello guarda un array muerto en 2 de cada 3 eventos). Son de la misma familia
  y **no entran**: tocan la forma del evento, no quién lo ve, y #70 pide
  decidirse «entero y en frío» sobre un modelo recién estrenado. Su plazo
  natural es el día que llegue `artifact_stolen` o `town_razed`.
- **Que el pueblo despeje también `fog`.** En fheroes2 el radio del castillo es
  un `Maps::ClearFog`, o sea nuestra capa `fog` (`revealAround`, hoy solo de
  héroes) y no `visibleNow`. Pero eso cambia además `knownMap`, y es otra
  decisión con otro coste: **la medida de arriba solo cubre `visibleNow` y
  `visibleNowAt`**. Aquí se tocan esas dos y ya.
- **#10** (guardar y cargar), aunque #71 lo mencione.
- **Arte**: no se gasta un céntimo en fal.ai.

## Preguntas abiertas, con su suposición por defecto

Para que las recoja el crítico en vez de que las decida el ingeniero a mitad:

- **¿Qué devuelve un mapa filtrado en las casillas que no has explorado?**
  Sigue abierta, y ahora se sabe que **no hay precedente**: es decisión nueva
  (ver criterio 2). *Por defecto*: se ve lo explorado alguna vez —la capa
  `fog`—, no lo que se ve ahora, porque es lo que pinta el cliente y porque un
  mapa que se olvida entre turnos no es un mapa; la distinción ya costó un
  issue (#64). Lo que hay que elegir es **qué se pone en una casilla no
  explorada**: un hueco explícito, o el terreno por defecto. El arquitecto lo
  decide y lo escribe. Referencia de tamaño, al día ~6: el jugador ha explorado
  el **54,7 %** de las casillas y recuerda el **73,1 %** de los objetos; `map`
  son 7 388 bytes contra 2 284 de `knownMap`.
- ~~**¿El radio de visión de un castillo depende de la fortificación?**~~
  **RESUELTA por la crítica: no depende, y son 5.** Ver criterio 11.
- **¿El filtrado de la batalla se hace en `serializeBattleTurn` o en
  `consultas.ts`?** *Por defecto*: en el serializador, que es de `core` y ya
  recibe el punto de vista. Un filtro en el servidor sería la segunda copia de
  la regla, y la primera ya se pagó cara en #59.
- **¿Cuenta como fuga el `note` que dice de quién son los ojos?** *Por defecto*:
  no. Decir «esta batalla no es tuya» es lo contrario de una fuga.
