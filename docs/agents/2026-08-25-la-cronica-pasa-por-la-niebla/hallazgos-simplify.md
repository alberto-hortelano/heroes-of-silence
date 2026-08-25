# Hallazgos de `/simplify` — decididos

Cuatro revisores sobre el diff de los cuatro commits (`d2e4d93..53c1631`, 1292
líneas). **Se contradicen en un punto**, y resolverlo es del coordinador: va
primero.

---

## 0 · El choque: `PendingBattle.at` — SE QUITA, con red

- **Reutilización** dice que es una cuarta copia de un hecho que el estado ya
  tiene, y que `battleOwners` (`game.ts:920`) es el despacho que ya existe.
- **Simplificación** y **altitud** dicen lo contrario: que no es derivable
  porque «el héroe ya no está en `state.heroes`» cuando se emite su muerte.

**Gana reutilización, y los otros dos se equivocan por el mismo motivo.** Su
objeción solo vale si se deriva **después** de mutar, y no hace falta:

- `battle_ended` se emite **antes de cualquier consecuencia** (`game.ts:1005`),
  con los dos bandos vivos.
- En `hero_defeated` del atacante, el **defensor** sigue en el estado.
- En `applyVictory` caso `'hero'`, `derrotado` ya está leído en una local dos
  líneas antes del filtro.

Y el campo entra por un solo sitio: `startBattle` recibe `paso.at`, que **es** la
casilla del defensor por construcción — el paso que el atacante intentó pisar.

**Decisión: se calcula una vez al principio de `settleBattle`** con un
`battleAt(state, pending)` al lado de `battleOwners`, y el campo desaparece de
`PendingBattle` — que es estado serializable y lo que #10 tendrá que guardar.

**La red**: esto es una pasada de limpieza y no puede cambiar comportamiento. Se
comprueba con el volcado byte a byte de las 40 semillas. **Si mueve una sola
partida, se revierte y se apunta a issue.** No se discute: se mide.

---

## 1 · Siete variantes escriben el mismo hecho dos veces — SE QUITA

`turn_start`, `resource_gained`, `mine_captured`, `town_captured`, `hero_hired`,
`player_defeated` llevan `player` **y** `actor` con el mismo valor; `game_over`
lleva `winner` y `actor`. Ocho sitios de emisión escriben **la misma expresión
dos veces en la misma línea**.

Es literalmente el contrato de `CLAUDE.md` —«un hecho, un sitio»— y es la **forma
exacta de #47**: `visibleTo` decide el enrutado por `actor` y `renderLog` pinta
por `winner`, y **nada comprueba que coincidan**. Un emisor futuro que escriba
bien uno y mal el otro compila, pasa `pnpm verify` y desincroniza enrutado y
pintado.

El ingeniero lo dejó a conciencia con un argumento: quitarlo cambia el JSON del
agente y el primer commit prometía no cambiar nada. **El argumento no se
sostiene, y está comprobado ejecutando**:

1. **La promesa ya está rota por esta misma serie**: el commit 1 añadió `actor` y
   `at` a *todos* los eventos entregados y el 3 quitó el 44 % de ellos. Retener
   `player` no conserva un JSON que ya no existe.
2. **Nada fija esos nombres**: no hay esquema zod de salida —`agent.ts` solo tipa
   lo que el agente **responde**— y la prosa no enumera campos. Los únicos tests
   que los leen son los dos que este ciclo acaba de escribir.
3. **Quitarlo mejora el JSON**: hoy `winner` significa dos cosas en el mismo
   array —`PlayerId` en `game_over`, `'attacker'|'defender'` en `battle_ended`—.
   Al agente se le está mandando un campo ambiguo *y* uno redundante.

**Medido, no estimado**: 12 ediciones mecánicas —9 las caza `tsc`, 3 el test
runner, **cero fallos silenciosos**— y después, 224 tests verdes.

**Decisión: se quita, en su propio commit** («El hecho se escribe una vez»),
precisamente porque cambia el contrato: así es un commit legible y reversible en
vez de ir escondido dentro del de la pantalla. Y **una línea en la prosa de
`agent.ts`** diciendo que el protagonista de todo evento es `actor`, que cierra
el único riesgo real: que el agente estuviera leyendo `player`.

## 2 · El `default:` de `renderLog` se traga un `kind` nuevo — SE QUITA

`panels.ts:494`. El núcleo te obliga a decidir la visibilidad de un `kind` nuevo;
la pantalla no te obliga a decidir su frase: se cuela, no se pinta, y nada se
pone rojo.

Y el repositorio **ya tiene la doctrina contraria escrita y aplicada**:
`serialize.ts:110-113` lleva un `biome-ignore` puesto a propósito para no meter
un `default`, con el motivo al lado — *«un `default` para callarlo escondería
justo lo que interesa ver rojo»*.

Es además cómo `built` y `recruited` se pasaron toda la vida misatribuyendo hasta
este ciclo. **Decisión: cuatro `case` explícitos que devuelvan `''`.**

## 3 · La composición «filtrar → cortar → quitar el sello» está suelta — SE ENCAPSULA

`serialize.ts:173-176`. `visibleTo` está exportada y documentada como la única
que decide, pero **la composición** no: vive como tres eslabones encadenados en
el consumidor, y las dos reglas que no son `visibleTo` —el orden filtrar-antes-de-
cortar y el borrado de `seen`— las sostiene un comentario.

El bug del que avisa ese comentario es real y silencioso: cortar antes de filtrar
encoge la ventana de 25 a **18**, medido, y ningún otro test se entera. Hay que
volver a no cometerlo en cada llamante nuevo, y **ya hay un segundo llamante en
el horizonte**: `ws-server.ts:97` es donde #34 va a aterrizar.

**Decisión: `cronicaPara(state, player, n)` en `events.ts`**, al lado de
`visibleTo`.

## 4 · El motivo documentado de «switch y no tabla» es falso — SE REESCRIBE

`events.ts:99-100` dice que es un `switch` para que un `kind` nuevo sin reparto no
compile. **Comprobado: una tabla `Record<E['kind'], Politica>` fuerza exactamente
igual** (`TS2741: Property … is missing`).

El motivo real —el único bueno— es el **estrechamiento por `kind`**, que es lo
que permite leer `e.from` en la cláusula de `town_captured`. Y no está escrito.

En este repositorio el comentario **es** el documento de diseño: uno que enseña
algo falso al siguiente que dude entre tabla y `switch` cuesta más que ninguno.

## 5 · El `cast` que abre el candado no tiene guardia — SE AÑADE

`game.ts:354`. El candado funciona —probadas las tres fugas, las tres rojas— y su
fuerza es que abrirlo exige escribir un `as` visible. Pero en un repositorio cuya
doctrina es que **toda frontera acaba en `invariantes.test.ts`**, esta se quedó
fuera. Y `emit` no está exportada, así que el día que una regla salga de
`game.ts` la presión es **copiar el `as`**, no exportar `emit`.

Un guardia que busque `(x.log as` fuera de `game.ts` lo clava, y no tiene el
problema que el propio ciclo documenta: no busca `.push` —indistinguible del
canal de `battle.ts`— sino el **cast**, que sí es distinguible.

**Decisión: entra, y se rompe a mano antes de darlo por bueno.** «El único sitio»
puede dejar de ser cierto en silencio, que es el modo de fallo de `captureTown`
que costó el 10 % de partidas eternas.

## 6 · `clase()` nace sin cubrir a su propia rama — SE SUBE A MÓDULO

`panels.ts:416` define el helper dentro de `renderLog`, y a la vez:
- `game_over` (`:493`) escribe el ternario `win`/`lose` a mano — es literalmente
  `clase(mio, !mio)`, y es **la última lectura de un campo duplicado** que queda;
- `renderBattleLog`, 40 líneas más arriba, tiene **cuatro copias inline**.

Cinco copias conviviendo con el helper que existe para eso. Se sube al ámbito del
módulo, junto a `nombreFuente` y `ETIQUETA_EFECTO`, que ya viven ahí por lo
mismo.

## 7 · Dos distribuciones donde basta una — SE ARREGLA

`events.ts:88-91`: `Con<Con<Cuerpo, Origen>, Sello>` distribuye dos veces sobre la
unión; `Con<Cuerpo, Origen & Sello>` hace lo mismo con una. Trivial, salvo que
`Con` viene con ocho líneas de docstring explicando por qué es delicado.

## 8 · Una aserción que no puede ponerse roja — SE QUITA

`test/cronica.test.ts:218` afirma que no llega ningún `resource_gained`.
Comprobado: el mapa `PLANO` no tiene recursos ni cofres, y **la renta diaria no
emite evento**, así que el log entero no contiene ninguno. La línea aparenta
cobertura y no la da, y el comentario que la precede describe algo que no
comprueba.

## 9 · Las cuentas de la prosa — SE CORRIGEN

- `events.ts:68` dice «los diecisiete hechos»: son **dieciséis**.
- `CLAUDE.md:14-15` sigue diciendo **208 tests**: son **224**. Lo deja detrás un
  ciclo cuyo último commit se llama, precisamente, «La documentación cuenta lo
  que hay, con los tiempos medidos».
- El «44 %» está copiado en `events.ts:15` y `serialize.ts:164`: se deja en uno y
  el otro apunta.

---

## 10 · Optimizar `emit` — RECTIFICADO: sí se hace

Este punto estaba en «descartado» y lo saco de ahí, porque el cuarto revisor mide
mejor que los dos que lo descartaban.

**Lo que decían los dos primeros**: 2 ms de 190 en una partida de 300 días, y
50 ms de 4481 (1 %) en el barrido. **Lo que mide el cuarto, con dos métodos
independientes que coinciden** —`node --cpu-prof` por self time y `process.hrtime`
dentro de `emit`, tres repeticiones—: **2,76 % del cómputo del barrido**
(`visibleNow` 2,41 % + `emit` 0,35 %).

La causa está en el desglose: `visibleNow(state, p.id).has(clave)` **materializa
un `Set` de 81 claves para preguntar por una sola casilla y lo tira**. De los
9 654 ns que cuesta, **7 930 son los `pointKey` y los `Set.add`**; los dos
`filter` de `heroesOf`/`townsOf` son 119 ns.

**El arreglo son cuatro líneas** —un predicado de distancia Chebyshev sobre
héroes y pueblos del jugador— y baja a **0,24 %**. Está **verificado equivalente**
por el revisor: las 40 semillas con las dos versiones, `JSON.stringify(state.log)`
idéntico 40/40, 5811 eventos. Se vuelve a verificar al aplicarlo.

Y una vía que **no** vale, para que nadie la intente: cachear por turno.
`hero_moved` se emite **por paso** —3235 de los 5811 eventos del barrido, el
56 %— y `hero.at` cambia entre pasos, así que una caché por turno sellaría
observadores equivocados.

## 11 · `cronicaPara` recorre hacia atrás — y se dice que no es por rendimiento

El hallazgo 3 ya pedía encapsular la composición. Se implementa recorriendo el
log **desde el final** hasta juntar N, en vez de `filter().slice(-25)`: conserva
la semántica que defiende el comentario y quita la única lectura O(n) del
contrato.

Lo que hay que **no** vender: con logs reales el ahorro es **~8 µs por llamada**,
y `serializeAdventureTurn` se llama un puñado de veces por partida. Sobre una
partida de agente de 300 días son **~23 ms en total**, frente a segundos de
latencia del agente por turno. **Se hace por limpieza.** (A 6000 eventos sí se
comería el 73,8 % de la serialización, pero el log máximo real medido en 40
semillas son **359**.)

## 12 · `seen` también sale por la puerta del espectador — SE QUITA

`ws-server.ts:97` manda los eventos crudos, así que `seen` viaja entero al
espectador — el mismo campo que `serialize.ts:176` borra a propósito llamándolo
contabilidad interna, *«decir quién MÁS estaba mirando sería una fuga nueva
colada por la puerta del arreglo»*. Por esta otra puerta sale. Una línea, y el
mensaje encoge un 9 %.

---

## Lo que se descarta, a conciencia
- **Las seis ramas inalcanzables de `jugador`/`deJugador`/`alJugador`.** El
  hallazgo es correcto —la rama `viewer` no se alcanza en los 13 puntos de
  llamada— pero el arreglo propuesto —que solo `day_start` lleve `actor: null` y
  las otras quince `PlayerId`— rompe la uniformidad de `Origen`, que es
  justamente lo que permite a `emit` y a `visibleTo` tratar todos los eventos
  igual. Y el test de tiempo de ejecución que lo comprueba no sobra: `tsc` obliga
  a **escribir** `actor`, no a que diga algo. Va a issue.
- **Los cinco arms de `renderLog` con el mismo esqueleto.** Es cierto que caben
  ~30 líneas donde hay ~65, pero el molde propuesto —que cada `case` devuelva
  `{texto, bueno, malo}`— es la tercera forma de pintar una línea en el mismo
  fichero. Se apunta y se decide entero, no a medias.
- **Partir `game.ts`** (1102 líneas, y este ciclo le suma 27 netas *después* de
  sacarle 18 de tipos). El hallazgo es real y el diagnóstico también —la frontera
  se trazó por el ciclo de imports, no por responsabilidad—, pero mover
  `visibleNow` a un `vision.ts` es un ciclo, no una limpieza. **Va a issue.**
- **`actor` significa dos cosas** —el que hace en quince variantes, el dueño del
  muerto en `hero_defeated`—. Es un hallazgo bueno y la propuesta (`afecta:
  readonly PlayerId[]`) es plausible, pero cambia el modelo del evento recién
  estrenado. **Va a issue**, con la nota de que hoy `hero_defeated` no registra al
  matador en ninguna parte.
- **La partida repetida entre `cronica.test.ts` y `invariantes.test.ts`.** Dos
  revisores la midieron: **~165 ms de cada `pnpm verify`**, que el hook `Stop`
  dispara en cada tarea. Son el mismo juego —la de 20 días es un prefijo de la de
  300—, pero prueban cosas distintas en ficheros distintos, y un fixture
  compartido ataría dos suites que no tienen por qué moverse juntas.
- **Saltarse al actor al sellar.** El dato es bueno y llamativo: `seen` contiene
  **solo al actor en el 63,1 %** de los eventos, y `visibleTo` cortocircuita por
  `e.actor === p` antes de leerlo — o sea que en dos de cada tres eventos se
  guarda para siempre un array que nadie lee. Pero con el hallazgo 10 aplicado el
  ahorro adicional es **0,12 %**, y **cambia lo que el campo significa**: pasaría
  de «quién estaba mirando» a «los demás que estaban mirando». Un campo recién
  estrenado no se resignifica por 0,12 %. **Va a issue.**
- **`renderLog` es 5,2× más lento** (1,60 → 8,34 µs por pintado). Medido: el
  **0,04 %** del presupuesto de fotograma a 60 fps, y el `innerHTML =` que va
  detrás —reparseo completo del DOM por fotograma, preexistente— cuesta órdenes
  de magnitud más.
