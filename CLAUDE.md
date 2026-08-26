# Heroes of Silence — guía de desarrollo

Clon de Heroes of Might and Magic 2 en el navegador, pensado como **banco de
pruebas para un juego con IA**: los NPCs los lleva un agente conectado por MCP,
los mapas los diseña ese mismo agente y los assets se generan con fal.ai.

El juego es el andamio; lo interesante es lo que se puede enchufar dentro.

## Arrancar

```bash
pnpm install
pnpm dev        # cliente en http://localhost:3100 (juego local contra la IA de reglas)
pnpm verify     # typecheck + lint + 299 tests, 7,2 s: el bucle rápido
pnpm test       # 299 tests: reglas, batalla, partida completa y contrato del agente
pnpm typecheck
pnpm lint       # Biome: formato y lint en una sola pasada, 40 ms
pnpm format     # lo mismo, arreglando lo que sepa arreglar
pnpm banco      # 200 partidas: tiempo y sha256 del volcado, 4,1 s

npx tsx tools/qa/enfrentamiento.ts   # dos tácticas frente a frente, 5000 batallas, 11,8 s
```

La partida se abre con una semilla al azar; **`?seed=N` en la URL fija la
partida** y la barra de arriba enseña siempre cuál se está jugando. Reiniciar
sortea una nueva y reescribe la URL, así que un fallo encontrado jugando se
vuelve a producir copiando la barra de direcciones. Lo que no es una semilla se
rechaza **diciéndolo** —`?seed=abc` escribe el motivo en la barra de estado, y
cómo salir: quitar el parámetro— y la regla vive en `core` (`parseSeed`), que es
de donde la leen también `HEROES_SEED` y el servidor: `createRng` hace
`seed >>> 0`, así que un `-1` no revienta, abre otra partida en silencio. **No
pedir semilla no es un error**: `?seed=` vacío y `HEROES_SEED=` vacía valen lo
mismo que no escribirlas —se sortea en el navegador, se usa la de por defecto en
el servidor—, que era donde los dos llamantes discrepaban.

Y hay CI: `.github/workflows/ci.yml` corre `pnpm verify`, `pnpm banco` y
`vite build` en un job, y `pnpm qa` en otro, en cada push y cada PR contra
`main`. Invoca `verify`
y no sus tres órdenes sueltas a propósito: el bucle rápido se define una vez, en
`package.json`. **No gasta un céntimo**: no declara ninguna credencial y no
invoca nada de `tools/gen/`.

Para que juegue un **agente** hacen falta dos terminales:

```bash
# terminal 1 — el servidor de la partida.  NO se llama `pnpm server`: ver abajo
pnpm partida

# terminal 2 — Claude Code EN ESTA CARPETA; el MCP "heroes" ya está en .mcp.json.
#   La ruta de .mcp.json es relativa (antes era absoluta y solo valía en una
#   máquina), y un servidor MCP se lanza desde el directorio en el que se
#   arrancó Claude Code: si lo arrancas desde un subdirectorio, `/mcp` no lista
#   "heroes". Arráncalo desde la raíz del repo.
#   pídele: "juega la partida: llama a heroes_listen, decide y responde con
#            heroes_respond, y repite"
```

**El script se llama `partida` y no `server`, y el motivo es una trampa de las
que vuelven.** `server` es un **subcomando propio de pnpm** («Manage a store
server»), así que `pnpm server` **nunca llega al script**: sale **0 en silencio**,
sin arrancar nada y sin decir que no ha arrancado nada. Estuvo así documentado
dos veces aquí y una en el `README`, y —peor— el servidor le decía **al agente**
«¿está arrancado con "pnpm server"?» cuando no podía conectar. Lo encontró QA
intentando seguir la propia documentación. Con el nombre cambiado, `pnpm run
server` falla ruidosamente («script not found»), que es lo que este repo pide de
un fallo. La lección general: **una orden documentada hay que verla arrancar**,
igual que un guardia hay que verlo morder.

Verificación del circuito entero sin tocar nada a mano:

```bash
pnpm qa   # arranca servidor + puente MCP y juega la partida, 5,4 s
```

No solo comprueba que no reviente. Lee el bloque `CÓMO FUE LO ANTERIOR` de cada
escucha y **cuenta** cuántas respuestas entraron y cuántas se descartaron, con
el motivo; exige con `game_state` que lo pedido se **aplique** de verdad (el
edificio concreto que se pidió, o el héroe en otra casilla); y ejercita las
cinco consultas por su contenido —`battle_state` en plena batalla,
`creature_stats`, `game_state`, `spell_list` y `building_list`—. Antes daba
verde con cuatro de cuatro acciones descartadas.

## Mapa del repositorio

```
src/core/          TypeScript puro: las reglas. Sin DOM y sin node:*
  battle/          rejilla 11×9, iniciativa, daño, hechizos
  map/             mapa de aventura, pathfinding, niebla, generación
  town/            castillos, edificios, reclutamiento
  hero/            héroes, ejército de 5 stacks, movimiento
  state/           GameState, turnos, batallas del mapa
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod y serialización para el agente
src/server/        bridge WebSocket + puente MCP
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  render/          una escena por pantalla: aventura, castillo y batalla
  views/           los paneles de HTML del lateral
tools/gen/         generación de assets con fal.ai
tools/qa/          verificación de extremo a extremo
data/              criaturas, edificios y hechizos en JSON editable
assets/generated/  arte generado (lo sirve Vite como estático)
```

## Contratos que no se rompen

- **La lógica vive en `core` y el cliente solo pinta.** El cliente no aplica
  reglas: llama a `session.ts`, que es la única puerta al núcleo. Cuando el
  cliente pase a hablar por WebSocket, cambia esa capa y nada más.
- **`core` es puro.** Nada de `node:*` ni de DOM: por eso los mismos tests
  valen para el navegador y para el servidor.
- **Toda tirada pasa por `createRng(seed)`.** Sin eso no hay partidas
  reproducibles y un test de batalla sería una lotería.
- **Fail-loud.** Una acción ilegal lanza con un mensaje escrito para la persona
  (`no se puede reclutar: solo hay 3 disponibles`), no se corrige en silencio.
  La excepción, documentada en el contrato, son las acciones del agente: se
  descartan una a una y se le devuelve el motivo.
- **El juego se juega sin agente y sin arte.** Sin agente juega `core/ai`; sin
  PNGs, cada renderizador pinta su marcador de color. Las dos cosas tienen
  test.
- **Un hecho, un sitio; y si de verdad son dos caras, se escriben juntas.** El
  dueño de un castillo vive en `Town.owner` —el libro de cuentas: quién cobra,
  quién construye, quién pierde— y en el objeto del mapa —la bandera: lo que se
  ve, lo que pinta el cliente y lo que recuerda la niebla—. `captureTown`
  escribe las dos y es el único sitio que lo hace. Cuando escribía solo una, la
  IA veía el castillo enemigo donde tenía el suyo y se pasaba la partida
  entrando en su propia casa: **ese era el ~10 % de partidas que no terminaban**
  (#47), no el umbral de ataque que decía el issue.
- **El Dijkstra desempata por orden de descubrimiento, y eso es una regla, no un
  detalle.** Entre dos casillas que cuestan lo mismo gana **la que se descubrió
  antes**, y en una re-inserción por mejora de coste el nodo **conserva su orden
  original**. Antes lo hacía por accidente —el barrido lineal usaba `<` estricto
  sobre un `Set`—; ahora lo hace `src/core/map/frontera.ts` a propósito, porque un
  montículo ordinario rompe el empate por la forma del árbol y **cambia las
  partidas**. Por eso `Frontera` es **de una sola búsqueda** y lanza si la
  reutilizas: compartirla entre búsquedas pasaba los 247 tests y cambiaba el
  volcado en silencio, y ningún test podía cazarlo —la contaminación no se ve al
  repetir una búsqueda, sino en la **siguiente**—. El guardia no es un test: son
  **dos** `throw` dentro de la clase, y hicieron falta los dos. El primero
  comparaba costes, y QA encontró que no veía la reutilización cuando la búsqueda
  anterior se agotaba en el origen —`0 < 0` es falso—, que es lo que da un
  `map_generate` con un pueblo rodeado de agua. El segundo no mira costes: mira si
  la frontera ya se agotó.

## Reglas del juego (verificadas contra fheroes2)

| Dato | Valor |
|---|---|
| Rejilla de batalla | 11 × 9 = 99 hexes, offset odd-r |
| Slots de ejército | 5 |
| Recursos | madera, mercurio, mineral, azufre, cristal, gemas, oro |
| Movimiento diario | lo marca la criatura MÁS LENTA (1000–1500) |
| Puntos de hechizo | 10 × Conocimiento |
| Moral y suerte | −3 a +3 |
| Duración de Prisa/Lentitud | poder mágico del lanzador, en rondas |
| Inmunidad de los no-muertos | a la mala suerte: Maldición y `curse_on_hit` |
| Dos efectos del mismo origen | el segundo REFRESCA la duración, no se acumula |

Las cifras de criaturas, edificios y hechizos están en `data/*.json` y se
editan sin recompilar.

**Una divergencia deliberada, para que no parezca un olvido:** en fheroes2 el
`fear` del dragón óseo es un **aura de moral −1**. Aquí es **ataque −2 durante
2 rondas** sobre el stack al que muerde (`src/core/battle/battle.ts`, tabla
`ON_HIT_EFFECTS`). El motivo es que `createBattle` fuerza `morale: 0` a los
no-muertos y **una de las dos facciones lo es entera**: el aura no asustaría a
nadie en un espejo nigromante y el rasgo quedaría medio muerto, que es justo el
bug que se cerró al implementarlo. El ataque sí lo siente un esqueleto, porque
pasa por `effectiveAttack`.

Lo temporal —prisa, lentitud, maldición, miedo— vive en `BattleStack.effects`
(`src/core/battle/effects.ts`) y **nunca se suma al stack**: el total se calcula
al leer, así que caducar es filtrar una lista y no puede descuadrar nada. Y el
mismo origen **refresca en vez de apilarse**, quedándose con la duración mayor:
sin esa regla, dos mordiscos del dragón óseo dejaban −4 de ataque sostenido y
una Lentitud por ronda iba a −2, −4, −6.

## La economía: la renta se copió y el coste se inventó

La renta estaba verificada —`MINE_YIELD` **es** `ProfitConditions::FromMine`— y el
coste de los edificios no: eran **18 filas inventadas**. Con la renta bien y el
coste a ojo, la cadena de moradas costaba 30 de madera y 25 de mineral donde el
mapa repartía 18 y 18 en lo que dura la partida, mientras el oro sobraba por un
factor de 20. Resultado medido: **la morada 5 se construía en 0 de 200 partidas**.

Se corrigió copiando la fuente, no ajustando a ojo hasta que saliera bonito: las
**18 filas de `buildinginfo.cpp` son exactas, 18 de 18 verificadas**, y con ellas
la fila de recursos de salida —`DEFAULT_STARTING_RESOURCES` daba **el oro de
NORMAL y el material de HARD**, media fila de cada, sin declararlo—. Y no había
**una sola mina de gemas, mercurio ni azufre** en ningún mapa, con seis edificios
pidiéndolos: hoy hay 28 minas en juego y los siete recursos tienen la suya.

Lo que se consiguió y lo que no, porque las dos mitades importan:

- morada 5: **52 de 200** partidas, desde 0. La partida **no se alarga** —mediana
  7→6 días, p90 8→7—, que era la condición.
- pero el **dragón óseo sigue en 0 de 200** en 24×24. En 48×48 salen las siete
  criaturas de nivel ≥5 y el dragón en 12 de 20: **las dos mitades entraron y lo
  que falta son días** (#90). La premisa que aprobó no tocar la duración venía de
  una contrafáctica de material **infinito** y era optimista por un factor 19.
- y el reajuste **desequilibró las facciones**: con control de esquina
  —intercambiando facciones sobre los mismos mapas— el caballero pasa de ganar
  **53,25 %** a **78,5 %**. La palanca es el **oro** (la cadena del nigromante
  suma 9 900 frente a 7 200, con 7 500 de bolsa), no el azufre que decía la
  primera redacción de la nota. La asimetría **es del original**; lo que falta es
  lo que allí la compensa y aquí no existe, **Nigromancia** (#89). Bajarle el oro
  al nigromante sería volver a inventar cifras, que es de lo que se venía.

## El héroe cobra lo que mata, y el gremio se construye

Dos surtidores cerrados con toda la tubería ya montada detrás. Los dos se
descubrieron **midiendo**, no leyendo: el crítico de otro ciclo instrumentó 40
semillas para comprobar una premisa y volvió con dos capas del juego que eran
ficción.

**La experiencia no llegaba a ninguna parte.** `experienceFor` sumaba
`hp * level * 2` por **stack** y no miraba `count` —cien campesinos y uno daban
los mismos 2 puntos, y `createBattle` sí guarda el recuento—, y la cobraba solo el
atacante que gana, así que **quien defendía y repelía no ganaba nada**: la mitad
de las batallas del agente desde que defiende. Medido: **65 héroes, 0 llegaban a
nivel 2**, con la exp pico en una mediana de 68 sobre los 1000 que cuesta. La
fórmula es ahora la del original —`GetHitPoints() × muertas` sobre el bando que
pierde, **+500 por héroe rival derrotado**, +500 por asedio— y esos +500 no son
decoración: sin ellos siguen siendo 0 de 68, con ellos son 40 de 68.

**Y el gremio de magia se construía en 1 partida de 40.** El ciclo entero de «la
magia, de punta a punta» —el de aquí abajo— estaba escrito, probado, documentado
y **no lo ejercía nadie**: en 40 partidas `syncSpellbooks` no enseñaba un solo
hechizo, y el único que sabía cualquier héroe era el de nacimiento. La causa era
que `chooseBuilding` puntuaba el gremio con un **40** contra el `100 + nivel` de
las moradas. No se subió ese número: fheroes2 **no puntúa, ordena por raza**, así
que la cascada de seis constantes pasó a ser una lista ordenada por facción y el
número mágico desapareció en vez de crecer. La lista reproduce el orden de hoy
**byte a byte** —comprobado dejando el gremio en su puesto de siempre: volcado
idéntico— y mueve una sola entrada.

Lo que se consiguió: hechizos enseñados de **15 en 3 partidas a 965 en 177**. Y la
cifra incómoda, que se publica igual: **2618 de los 2644 `cast` siguen siendo
`magic_arrow`**, el de nacimiento. Lo que el gremio cambia sobre todo es que el
héroe **contratado**, que nace con el libro vacío, aprenda algo. Que la IA de
batalla casi nunca compre `haste` ni `slow` es otra puerta y tiene su issue.

Y una letra pequeña que conviene saber antes de abrir el juego a mirarlo: **a
quien cruza la puerta de la magia es al nigromante**. Al caballero —la facción con
la que juega el jugador 0— el gremio se le construye en **4 partidas de 200**, y
enseña 18 hechizos frente a los 841 del rival. No es un fallo del reparto: es la
asimetría de coste del original, que aquí no tiene a Nigromancia en el otro
platillo (#89).

**La lección más cara del ciclo no fue ninguno de los dos bugs: fue una cita.**
La tabla de experiencia que sustituyó a la curva decía venir de
`Heroes::GetExperienceFromLevel` y **coincidía en 8 de 39 filas** — la fuente
tiene 40—. Se había escrito de memoria y se había dado por verificada porque tres
filas cuadraban con las tres que cita el plan: 1000, 2000, 4500, que son las tres
que cualquiera recuerda de HoMM2. Era **inerte** —los umbrales que se alcanzan
están entre los que coinciden, y con la tabla buena puesta el volcado sale
idéntico al carácter— y eso es justo lo que la hacía peligrosa: nada se ponía
rojo. Peor, el test que decía comprobarla **anclaba los valores inventados**, así
que el guardia protegía el error, y la cita ya se había propagado al docstring, al
nombre del test y a este documento.

**Una cita falsa a la fuente es peor que una cifra declaradamente inventada**: la
inventada avisa de que hay que verificarla; la citada hace bajar la guardia de
quien la lea después. Ahora la tabla se extrae del fichero **con una expresión
regular, sin transcribir a mano** —que es la parte que falla—, y el test no ancla
lo que haya: comprueba **26 filas contra la regla que el propio original publica
dos líneas más abajo**, que las diferencias crecen ×1,2 redondeado a centenas. Esa
propiedad es lo único que no depende de que nadie teclee bien, y una tabla
alucinada no la tiene. Comprobado aparte al aceptarla: 19 de 19 filas seguidas la
cumplen, y la extrapolación del original **multiplica, no suma**.

**Y arreglar los dos volcó el ganador**, que estaba previsto y aprobado antes de
implementar: con control de esquina el caballero pasa de **78,5 % a 16,25 %**.
`#87` no movió el equilibrio **ni un punto en ninguna esquina** —el vuelco es
entero del gremio— y no se compensa aquí: la reparación con fuente es
**Nigromancia**, que es lo que en el original pone el otro platillo. Lo mismo que
se decidió cuando el desequilibrio iba en la dirección contraria.

## El agente como modelo

Es el patrón de `narrative-mcp` en ne-fan:

1. El agente llama a **`heroes_listen`**, que se queda bloqueado hasta que la
   partida necesita una decisión.
2. Recibe el estado **con el formato de respuesta embebido**: no tiene que
   recordar el esquema entre turnos.
3. Decide y llama a **`heroes_respond`** una sola vez.
4. **Recibe el veredicto de lo anterior** pegado a la siguiente petición, y
   vuelve a `heroes_listen`.

**Se le informa SIEMPRE, también cuando acertó.** No porque sea amable, sino
porque un silencio es ambiguo en un canal que puede perder mensajes: el agente
no debería tener que distinguir «fue bien» de «no llegó». Un acuse de algo que
coló es una línea; un rechazo dice **qué se jugó en su lugar y qué le costó** —el
turno de esa unidad, o el maná de su héroe si la sustituta fue un `cast`—, y el
maná **se mide** restando antes y después, no se supone por el tipo de acción.

**El agente defiende.** Hasta hace poco solo jugaba las batallas que empezaba él:
el turno del rival era una llamada atómica a `playAiTurn`, que resolvía las
batallas por dentro, así que **la mitad de sus batallas las jugaba entera la IA de
reglas**. Ahora `playAiTurn` acepta un `BattleTakeover` opcional —el tipo vive en
`core`, la implementación en el director— con el contrato **«si te la quedas, la
cierras»**: al volver se mira `state.pendingBattle`, sin un booleano que pueda
mentir. Y el bando **se deriva del dueño** (`battleOwners`) en vez de suponerse
atacante, lo que además hace que defender un castillo salga gratis.

**Y la crónica pasa por la niebla.** El agente ya no lee el diario del rival:
`recentEvents` iba sin filtrar y **2767 de 6287 eventos entregados eran suyos —el
44 %, 9,6 de cada 25 por lectura—**, así que después de filtrar el mapa seguía
enterándose de cada movimiento del enemigo. El arreglo no fue filtrar: fue que
**el `GameEvent` dejara de ser anónimo**. Era la única vía — 683 de esos 6287
(10,9 %) **no se podían atribuir a nadie**, porque `state.heroes` se filtra
**antes** de escribir `hero_defeated` y el dueño del muerto ya no existe.

Ahora cada hecho lleva quién lo protagoniza y dónde ocurre, y `emit` lo **sella
al ocurrir** con quién lo estaba mirando. Sellar y no recalcular al leer también
está medido: la ventana de 25 abarca 2,34 días, y en ese lapso **el 14,8 % de los
eventos del rival cambian de veredicto** según cuándo se evalúen. El candado de
que nadie vuelva a escribir el log a pelo no es una expresión regular: `log` es
`readonly` y `emit` hace el único `push`, así que cualquier otro **no compila**.

Dos trampas que costaron sus tests: **se filtra ANTES de cortar** —al revés la
ventana encoge de 25 a 18 en silencio— y el sello se calcula **después** de la
mutación, así que en dos casos el observador ya no se ve a sí mismo (tu castillo
recién perdido, tu héroe recién muerto): a esos los salvan las cláusulas de
«siempre», no el sello.

**El cliente NO se filtra**, y es deliberado: su lienzo pinta con `fog` —«lo
exploré alguna vez»— y no con `visibleNow`, así que filtrar solo su crónica le
dejaría viendo al rival en el mapa sin una línea que lo contara (#64).

**Y la partida se acaba diciéndolo.** `heroes_listen` esperaba en una promesa que
nadie resolvía nunca: cualquier agente se quedaba colgado para siempre al
terminar la partida, sin saber que había terminado ni quién ganó. Ahora el
servidor manda un `game_over` explícito —no un `close` interpretado—, el puente
lo recuerda para quien conecte después, y un corte de conexión dice que **no
consta** si la partida terminó en vez de inventárselo.

Tipos de petición: `adventure_turn`, `battle_turn`, `map_generate` y
`hero_banter`. Y hay tools de consulta (`game_state`, `battle_state`,
`creature_stats`, `spell_list`, `building_list`) para mirar cosas sin volcarse
la partida entera en el contexto.

**Y el agente solo pregunta por los suyos.** `game_state` y `battle_state` llevan
un parámetro `player`, y hasta hace poco se lo creían: `game_state{player:0}`
devolvía la crónica del rival, sus recursos, sus héroes y sus castillos. Con la
crónica ya filtrada por la niebla, eso dejaba cerrada la puerta principal y
abierta la de al lado — y hacía **falsa** la frase con la que se cerró aquel
trabajo. Ahora `responderConsulta` recibe qué jugadores lleva el agente y
**rechaza diciéndolo**, nombrando los suyos: *«no puedes consultar por el jugador
0: no es tuyo. Llevas el jugador 1: pregunta por ese»*. La descripción de la tool
dice qué acepta, porque un agente que recibe un rechazo sin haber sido avisado no
se corrige: reintenta.

**Y la niebla tapa también las consultas.** Cerrar la crónica dejó la puerta
principal cerrada y **tres de al lado abiertas**, y ninguna la alcanzaba nadie
todavía: se taparon **antes** de abrir la puerta, que es más barato que
quitárselo a un agente que ya lo tenía.

- La consulta `map` devolvía el mapa **entero** y ni miraba por quién. Ahora pasa
  por `jugadorDelAgente` y por `serializeKnownMap`, que filtra por `player.fog`.
- Una batalla entre dos terceros enseñaba el **maná y el libro** del héroe ajeno.
  El monstruo es siempre el **defensor**, así que el atacante es siempre una
  persona: no era «solo con neutrales, que no tienen secretos». La vista **no se
  niega** —eso ya se decidió—: se enseña el tablero y se dice de quién son los
  ojos, sin lo que es del bando.
- Y la que **no estaba en ningún issue**: `legalActions` es la del stack activo
  *sea de quien sea*, y sus entradas `cast` enumeran el libro de ese héroe
  filtrado por su maná. Viaja solo si la vista es propia **y** el stack activo es
  tuyo.

**Lo que se ve en una casilla no explorada es un hueco explícito**, `null`, y no
el terreno por defecto: al día 6 el 45,3 % de las casillas serían dato fabricado
sin decirlo, y un agente no puede distinguir llanura de ignorancia. El índice
`y*width+x` se conserva, así que quien lea esto no aprende una convención nueva.
Y una cifra que contradice lo que cualquiera esperaría: **filtrar apenas encoge
el payload** —14,8 % de mediana—, porque `null` ocupa cuatro caracteres y
`"grass"` siete. Quien publique la tool no debe contar con ese ahorro.

**Un castillo ve 5 casillas, no una.** `visibleNow` le daba **su propia casilla y
nada más**, así que un héroe enemigo podía acampar pegado a tu capital sin que te
llegara un solo `hero_moved` — medido, 0 de 60. Antes de que la crónica pasara
por la niebla no se notaba porque te enterabas igual, por la fuga. La cifra es de
fheroes2 (`getFogDiscoveryDistance`: `CASTLE: 5`, `HEROES: 4`) y **no depende de
la fortificación**; se copia **el número y no la forma**, porque allí es un disco
y aquí un cuadrado. La regla vive en **dos** funciones —`visibleNow` y
`visibleNowAt`— y las dos se editan: hay un test que las compara casilla a
casilla, y tocar solo una saca **129 discrepancias**.

Cambia la niebla de todas las partidas, así que el volcado se movió a propósito
—1 871 de 28 406 líneas—, y el criterio de aceptación no fue el hash sino la
**forma del diff**: el 100 % de las diferencias solo en `seen`, **cero** líneas
`fin`, y todas **ganando** observador sin que ninguna lo pierda. Un hash nuevo lo
habría dado por bueno también si la visión hubiera cambiado *decisiones*.

En `map_generate` el agente **no dibuja**: devuelve un plan declarativo y
`buildMap` lo construye. `validateMapPlan` lo rechaza si algún castillo queda
inalcanzable o si dos objetos comparten casilla.

## La IA de batalla cede la iniciativa

La cascada de `chooseBattleAction` (`src/core/ai/tactics.ts`) terminaba en dos
ramas que **no se alcanzaban nunca**: `wait` y `defend`, 0 de 10 440 decisiones
en 802 batallas. El motor sí cedía la iniciativa —`wait` empuja el stack al final
de `state.queue` y `advance` saca por `shift`, así que un campeón que espera pasa
de primero a sexto de la ronda—, pero nadie llamaba a esa puerta.

**La regla que se juega es «no metas el morro donde te van a pegar primero»**:
se espera si un enemigo que aún no ha actuado esta ronda alcanza mi hex actual
**o la casilla a la que iba a avanzar**. Se eligió midiendo tres candidatas, no
razonando: «alcanza mi hex» apenas se dispara (1,2 %) y su ventaja no se
distingue de cero; «hay cualquier enemigo pendiente» es la tautología por el otro
lado (24 %) y juega **peor**. La elegida sale 476 veces en 200 partidas (4,4 %) y
gana **51,13 % ± 0,20**, intervalo entero por encima del 50.

Y **al revés de lo que decía la intuición del encargo**: esperar beneficia al
**rápido**, no al lento ni al tirador. Solo gana algo quien tenga enemigos
pendientes detrás; el más lento no tiene a quién cederle nada, y un tirador con
línea libre dispara antes de llegar a esa rama.

**La casilla de ataque se elige por daño esperado** y no por ser la primera de la
lista. Hoy no cambia ni una decisión —ninguna criatura con `charge` pisa el
tablero, porque la partida se acaba el día 7 y nadie construye la morada 5—, así
que entró **byte a byte idéntica**: es una corrección latente, no una mejora.

Tres cosas que costaron su vuelta de QA y conviene no repetir:

- **Un cálculo caro se paga donde significa algo.** El daño solo depende del hex
  por `chargeHexes`, así que para un stack sin `charge` todas las casillas empatan
  y **no hay nada que calcular**. Pedirlo igualmente costaba un +18 % en
  `autoResolve` pagado **entero** por unidades que no podían cobrarlo: 0 de 1258
  llamadas tenían el rasgo. El arreglo no fue un umbral, fue que el mapa lo
  devuelva quien ya lo tenía —`legalActionsAndCosts`— y que la fórmula se gatee
  por el rasgo que la hace significar algo.
- **La nota que se le manda al agente lleva su condición.** Decía «se te volverá a
  pedir acción para ella al final de la ronda», y eso **falla 1 de cada 5 veces**:
  de 476 esperas, 67 mueren antes y 34 se quedan sin turno porque la batalla
  termina. Un acuse que promete lo que no puede cumplir es peor que el silencio,
  que es justo lo que este contrato existe para evitar.
- **Un instrumento de medida nuevo se desconfía antes que su resultado.** La
  prueba de no-sesgo del banco de enfrentamiento ponía la misma función en los dos
  asientos, así que las dos batallas de cada pareja eran **la misma partida**:
  reparto 0 · 10 000 · 0, varianza cero, y un intervalo de confianza impreso al
  lado de una identidad algebraica. Ahora comprueba el reparto, que es lo que sí
  dice algo, y el intervalo es **pareado** (±0,20 donde el binomial decía ±0,41).

## La pantalla de castillo

El castillo no es una lista de edificios: es un cuadro con **solares fijos**
(`src/client/render/town.ts`). Cada solar tiene una cadena de mejora que se
levanta en el sitio, y son once para los diecinueve edificios:

| Solar | Cadena |
|---|---|
| `hall` | `village_hall` → `town_hall` → `city_hall` |
| `fort` | `castle` |
| `guild` | `mage_guild_1` → `mage_guild_2` |
| `tavern` · `market` | un solo edificio cada uno |
| `lvl1` … `lvl6` | `<facción>_dwelling_N` → `<facción>_upgrade_N` |

**Las moradas son propias de cada facción**, con sus requisitos y sus costes: el
caballero construye con madera y cristal, el nigromante con mineral y gemas. El
id del edificio *es* el nombre de su PNG (`knight_dwelling_3`), así que la
pantalla lo resuelve con un solo `asset('buildings', id)`.

Y la cadena de la fila de abajo **no siempre tiene dos eslabones**: el
nigromante no tiene `necromancer_upgrade_6` porque el dragón óseo no tiene
criatura mejorada, así que su `lvl6` se ve terminado con la morada. La pantalla
no sabe nada de eso: las cadenas se **derivan del catálogo** (`townPlots`), y lo
que no está en `data/buildings.json` no se puede ofrecer ni cobrar.

Un solar dibuja el último eslabón construido; si le queda alguno, se pulsa y se
levanta. Vacío se pinta como parcela punteada con el nombre de lo que iría ahí,
así que se ve a la vez lo que tienes y lo que te falta. Debajo de cada morada,
su casilla de reclutamiento.

El motivo de un rechazo sale de `buildBlocker`, que ya devuelve la frase escrita
para la persona: la pantalla no reimplementa ni una regla.

## La magia, de punta a punta

Los hechizos existían en el motor mucho antes de que pudiera lanzarlos nadie: se
podía castigar el maná, validar el bando y filtrar por inmunidad, pero **ningún
héroe aprendía un segundo hechizo en toda la partida**. La cadena que faltaba,
en orden:

1. **El gremio enseña por derivación, no por sorteo.** `townSpells(town)` es
   `allSpells()` filtrado por `mageGuildLevel(town)`. No hay libro guardado en el
   `Town` porque no hay nada que sortear: con tres hechizos de nivel 1 y dos de
   nivel 2, el nivel del gremio determina la lista entera. El día que haya
   contenido para sortear, se rellena **dentro de esa función** y ningún llamante
   se entera.
2. **Aprender es sincronía, no acción.** `syncSpellbooks` corre al final de cada
   acción de aventura y empuja al libro del héroe lo que enseñe el pueblo bajo
   sus pies. Un solo punto cubre los tres caminos —moverse allí, contratar allí,
   construir el gremio con el héroe dentro— en vez de tres parches. No lanza,
   porque no hay nada ilegal que rechazar.
3. **`cast` no consume el turno del stack.** Es la pieza que ordena todo lo
   demás: en el cliente, tras lanzar el mismo stack sigue activo; y en la IA,
   lanzar **no compite con atacar**, así que la heurística evalúa el hechizo
   aparte y antes. Modelar una disyuntiva que no existe habría hecho que la IA
   dejara de pegar para lanzar.
4. **El maná vuelve de la batalla.** Sin eso, lanzar salía gratis y la única
   función del gremio —recargarlo— era ficción.

**El motivo de un rechazo lo escribe `castBlocker`**, igual que `buildBlocker` lo
escribe en el castillo, y con el objetivo opcional: sin él contesta «¿puede
lanzarlo sobre alguien?», con él añade vivo/muerto, aliado/enemigo e inmunidad.
Lo consultan los tres: `legalActions` para ofrecer el par, `castHeroSpell` para
rechazar y la pantalla para explicar. Una regla nueva entra por un sitio y llega
a los tres a la vez — antes de unificarlo, `legalActions` reimplementaba sus
cuatro condiciones justo debajo y el cliente redactaba la mitad que faltaba.

**La IA valora en PV equivalentes** y descuenta lo que el objetivo ya tiene
encima: como el mismo origen refresca en vez de apilarse, relanzar una Lentitud
que aún dura dos rondas vale **una ronda**, no tres. Sin esa resta compraba lo
mismo cada ronda y llegaba al mapa sin maná.

**Sabiduría se lee, pero todavía no muerde**: `maxSpellLevel()` recorta el
aprendizaje y el héroe inicial nace con `wisdom: 1`, así que su techo es nivel 3
— y el gremio llega a 2. Es correcto e inerte hasta que exista `mage_guild_3`
(#3), que a su vez espera a que las habilidades se puedan ganar (#6, #15).

## Generación de assets

```bash
pnpm gen                              # simula: qué falta y cuánto costaría
pnpm gen -- terrains --go             # genera de verdad
pnpm gen -- buildings --go --budget 4 # edificios del castillo y sus fondos
pnpm gen -- all --go --budget 4       # todo lo anterior de una vez

npx tsx tools/gen/animate.ts peasant --go   # atlas de poses de una criatura
npx tsx tools/gen/animate.ts --all --go     # las doce criaturas base
```

Sin `--go` no se gasta un céntimo. La caché va por hash del payload, así que
repetir una tanda sale gratis, y el gasto acumulado queda en
`tools/gen/spend.json`. Ojo con `--budget`: es el tope del gasto **acumulado**
del proyecto, no el de la tanda.

Lecciones heredadas de los laboratorios de ne-fan, aplicadas en `prompts.ts`:

- Una textura se describe como **material visto a 90 grados**, nunca como
  lugar: pedir "suelo" mete perspectiva.
- Un tile con un motivo único **canta** al repetirse: se pide liso y uniforme.
- **No se menciona el agua** en un terreno sin agua: alucina ríos.
- El sprite de criatura va de **perfil mirando a la derecha** y en pose neutral
  (nunca en T): el defensor reutiliza el mismo arte espejado.

### Animaciones: un atlas, una llamada

Pedir seis imágenes sueltas da seis personajes distintos. Por eso las poses se
piden **todas en la misma imagen**: se compone una rejilla con el sprite
repetido, se manda junto al sprite como referencia de identidad, y el modelo
repinta cada celda con una pose distinta. Dentro de un atlas la consistencia es
casi perfecta.

Las reglas no son adornos:

- **Diez celdas como máximo.** Con más, el modelo colapsa y pinta la misma pose
  en todas.
- **Rejilla cuadrada-ish.** Un 4×1 hizo que el modelo re-maquetara la hoja.
- **La segunda referencia es identidad, no pose**, y hay que decirlo con esas
  palabras.
- **`echoScore` rechaza** un atlas que vuelve sin repintar, y no lo cachea:
  guardarlo dejaría a esa criatura congelada para siempre.
- El fondo vuelve gris plano, no transparente. `cutout.ts` lo quita por
  **relleno desde los bordes**, no por umbral de color: por umbral desaparecen
  las partes claras del personaje.

Las poses (`idle`, `ready`, `attack`, `hit`, `die`, `win`) las reparte
`src/client/anim.ts` leyendo el registro de la batalla. El motor no sabe que
existen: sin atlas, cada criatura usa su sprite quieto y se juega igual.

Lo que **ya no se escribe** es el `atlas.json` con la hoja de coordenadas del
corte. No lo leía nadie —el cliente carga `anim/index.json` y los PNG por
pose—, su `meta.image` era la ruta absoluta de la máquina que lo generó, y no
servía ni para re-recortar: el atlas crudo vive en la caché, que está en
`.gitignore`. El índice se deriva ahora de los PNG que sí existen. Si algún día
hace falta otro recorte, se regenera con prompts mejores —y eso cuesta dinero—
en vez de re-recortar lo de antes; los doce ficheros quedan en el historial de
git.

## El equipo de agentes

Para un trabajo sustancial hay un ciclo de cuatro roles en `.claude/agents/`,
que se lanza con la skill **`/feature`**:

**crítico** → **arquitecto** → **ingeniero** → **QA**

Arrancan con contexto limpio y no se ven entre sí: todo lo que necesitan viaja
por ficheros en `docs/agents/<tarea>/`. El crítico va primero porque el fallo
más caro del ciclo no es un plan malo, sino un plan **bueno** sobre una tarea
que no había que hacer — y el backlog de este repo son decenas de issues
escritos de una sentada.

Para un cambio de una línea el ciclo es sobrecoste: hazlo y ya.

### La máquina es compartida: nada de matar por patrón

**No existe ningún `pkill`, `killall` ni `kill` por nombre de proceso.** En esta
máquina hay otras sesiones de agentes trabajando en otros proyectos, y `pkill -f
vite` no distingue de quién es el vite: se llevó por delante el servidor de
desarrollo de `ne-fan`, que no tenía nada que ver con este repo ni con quien lo
mató. Un `pkill` acierta con el suyo y no se entera de los demás — por eso no
vale «he mirado antes»: lo que hay que cambiar es el gesto, no el cuidado.

Lo que se arranca se apunta, y se mata **por su grupo y solo por el suyo**:

```bash
set -m                       # cada trabajo en SU grupo; sin esto hereda el de la shell
pnpm dev > /tmp/dev.log 2>&1 &
DEV=$!
set +m
# ...lo que hubiera que mirar...
# El guion delante mata al grupo: cae tu pnpm y el vite que cuelga de él.
# Pero antes se comprueba que ese PID ES su grupo, porque si no lo es, ese
# mismo guion se lleva por delante tu propia sesión.
[ "$(ps -o pgid= -p "$DEV" | tr -d ' ')" = "$DEV" ] && kill -TERM -"$DEV" || kill -TERM "$DEV"
```

`set -m` no es adorno: dentro de un `bash -c` —que es como corre un script y como
corren tus órdenes— el control de trabajos viene apagado y el hijo hereda el
grupo de la shell. Comprobado: `PID=…691` con `PGID=…690`, el de la shell. Y
`setsid pnpm dev &` **no** vale, aunque lo parezca: `setsid` bifurca, así que `$!`
es el PID del `setsid` que ya murió y el `kill` no encuentra el grupo. También
comprobado, a base de escribirlo mal primero.

Si lo lanzaste con `run_in_background`, lo paras con su identificador de tarea.

**Y un puerto ocupado por algo que no arrancaste tú no se libera: se dice.**
Se reporta como «no probado, el puerto estaba ocupado», nunca se resuelve
matando. Aquí ya no debería pasar —los dos puertos del servidor salen del
entorno y el arnés se coge los que le dé el sistema (#61)—, pero la regla es del
gesto, no de este repo.

### Control de calidad, deliberadamente ligero

Nada de puntuación de deuda ni pruebas de mutación: frenan más de lo que
aportan en un prototipo. Lo que hay:

| Comprobación | Cuánto tarda | Cuándo |
|---|---|---|
| `pnpm verify` | 7,2 s | siempre |
| `test/invariantes.test.ts` | 40 ms | va dentro de `pnpm test` |
| El navegador | minutos | si el cambio se ve |
| `pnpm qa` | 5,4 s | si tocas `src/server/` o el contrato |
| `npx tsx tools/qa/barrido-semillas.ts` | 1,1 s | si tocas la IA o la economía |
| `pnpm banco` | 4,1 s | si tocas el núcleo sin querer cambiar el juego |
| `tools/qa/enfrentamiento.ts` | 11,8 s | si cambias **cómo decide** la IA de batalla |
| CI (`.github/workflows/ci.yml`) | ~1 min | en cada push y cada PR |

Los tiempos están **medidos**, tres pasadas cada uno, no estimados: los que
había antes decían 3 s y «~1 min» y llevaban ciclos siendo falsos. Que `pnpm qa`
tarde 5 s y no un minuto no es una mejora: es que la partida se acaba el día 3
porque el agente defiende y pierde, así que la cobertura real son **2 turnos de
mapa y 14 decisiones de batalla** — eran 13 hasta que la IA aprendió a esperar.

`pnpm qa` **no entra en `pnpm verify`**, y ahora sí es por lo que tarda: 7,2 +
5,4 = 12,6 s en cada final de tarea, para un guardia que solo dice algo cuando se
toca `src/server/` o el contrato. El motivo de antes era otro y ya no existe:
abría los puertos **fijos** 9880/9881 y salía 1 con `EADDRINUSE` si había un
`pnpm partida` levantado —la forma documentada de jugar con el agente—, así que el
hook `Stop` se ponía rojo por tener el juego abierto. Eso está arreglado: los dos
puertos salen de `HEROES_AGENT_PORT` y `HEROES_SPECTATOR_PORT` (`src/server/puertos.ts`),
con los literales de siempre por defecto y **`0` para que los elija el sistema**,
que es lo que pide el arnés. Comprobado con la partida abierta en 9881/9880:
`pnpm qa` sale 0 en 5,43 s con su servidor en un puerto efímero, y la partida
sigue en pie. Quien pide `0` tiene que enterarse de cuál le tocó, así que
`ws-server.ts` imprime el puerto **real** desde `listening` y de ahí lo lee el
arnés: anunciar el que se pidió sería anunciar un cero.

`test/invariantes.test.ts` convierte en tests las fronteras de este documento:
`core` sin `node:*` ni DOM, ni un `Math.random` suelto, `session.ts` como única
puerta del cliente al núcleo, `FAL_KEY` fuera del navegador, que **ningún
rasgo de `CREATURE_TRAITS` esté declarado y muerto** —cuatro lo estuvieron—,
que **cada `EffectKind` tenga un lector vivo**, que **`core` no importe
`src/server`**, que **ningún fichero que una máquina ejecuta o lee lleve dentro
la ruta absoluta de esta máquina**, que **la crónica sobreviva a un `JSON` de
ida y vuelta**, que **el `as` que abre el candado de `state.log` viva en un
solo sitio**, que **`core` no ejecute coma flotante que dependa de la
plataforma** y que **`game_over` sea el último hecho de la crónica**. Todos nacen en verde: un guardia que nace rojo se ignora desde
el primer día.

El del candado busca el **cast** y no el `.push`, que es lo que el propio
`GameState` documenta que no se puede buscar: un `log.push` es indistinguible
del canal de `battle.ts`, que es otro tipo y otro registro. `state.log` es de
solo lectura, así que escribir en él exige un `as` visible, y `emit` —el único
que lo hace— no está exportada: el día que una regla salga de `game.ts`, la
salida fácil no es exportarla, es copiar el cast, y con él se pierden de golpe
el protagonista, el sitio y el sello. Se rompió a mano copiando ese `as` a
`serialize.ts`, se miró rojo con el fichero y la línea, y se retiró la sonda.

El del `JSON` juega 40 días con la semilla 9 **en 48×48** —618 hechos de los
dieciséis tipos, 548 con sello— y compara `state.log` con su ida y vuelta. Juega
ahí y no en el mapa de siempre por una razón que conviene no deshacer: con la
economía cuadrada, la partida de 24×24 se acaba el día 6 y deja 134 hechos de
**quince** tipos, sin `spells_learned`, que es justo uno de los que este guardia
quiere ver pasar por el JSON. **No se bajó el umbral: se cambió de mapa**, que es
la diferencia entre reparar un guardia y desafilarlo. De paso le entró el diente
que le faltaba —que un buen número de eventos lleven el sello puesto—: sin él, un
`seen` siempre vacío pasaba el viaje de ida y vuelta sin probar nada. Existe porque
el sello de cada evento (`seen`: quién lo estaba mirando) es una colección por
evento, y #10 ya avisa de que `JSON.stringify` deja un `Set` en `{}` sin decir
nada: el día que exista guardar y cargar, la crónica volvería del disco
convertida en un montón de eventos anónimos otra vez. Mira `state.log` y **no `state`**, porque
`Player.fog` es un `Set` y nacería rojo por algo que no es su asunto. Se rompió
a mano pasando `seen` a `Set<PlayerId>` y se miró rojo antes de darlo por bueno.

El de las rutas absolutas deriva la ruta del checkout **en ejecución**, no
escrita como literal: así no se encuentra a sí mismo y no hay que excluir su
propio fichero. Y mira `git ls-files -c -o --exclude-standard` —lo **no
indexado** también, que es como nacen las presas y como está el árbol cuando
corre el hook `Stop`—, el repo **entero** menos una **lista negra**: la prosa
(`.md`, `.txt`), la cara del cliente (`.css`, `.html`, donde una ruta es una URL
del navegador) y los binarios, que se detectan por un byte cero en su primer
kilobyte en vez de enumerarlos. La forma de la lista **es** el guardia: en
blanco —acotado a `.json`, `.ts`, `.sh`…— falla **en silencio** ante la clase
que nadie previó, y se le colaban `.js`, `.mjs`, `.cjs`, `.tsx`, `.toml`,
`.envrc` y los ejecutables sin extensión; de ocho ficheros plantados cazó uno.
En negro falla al revés: un formato de prosa nuevo da un falso positivo, que se
ve y se quita con una línea. Acotar por clase y no por carpeta es además lo que
lo deja **sin excepciones**: la prosa cita rutas absolutas para explicar el
fallo —este documento incluido—, y una excepción por carpeta acabaría tapando al
siguiente `.json` que caiga dentro. Busca la ruta en sus **dos** formas, la
literal y la escapada de JSON (`\/home\/…`), porque `JSON.parse` devuelve la
misma ruta con las dos. Nació con **trece presas** —`.mcp.json`, que sí se lee y
es lo que enchufa el MCP, y doce `atlas.json` que no leía nadie—, y se volvió a
correr en rojo con un fichero nuevo **sin indexar** y con los nueve de la lista
blanca. Lo que no ve, dicho en su propio docstring: la ruta de OTRA máquina, que
es la única que no puede derivar.

Por eso mismo los parches de `docs/agents/*/commits/` **no se commitean**: un
parche que quita una ruta absoluta la lleva dentro, y excluirlo sería justo la
excepción que mañana tapa a la siguiente presa.

El de los efectos no busca texto, **llama**: recorre una tabla que asocia cada
tipo con su lector y comprueba que el total cambia al colgar el efecto. Un
lector escrito y muerto no puede satisfacerlo, que es justo el agujero por el
que se colaría el primer hechizo de defensa.

Y una lección que costó tres ciclos: **un guardia hay que verlo morder**. El de
`node:` nació ciego a `import 'node:fs';` sin `from` y a `await import('node:fs')`,
y estuvo así desde el día en que se escribió — tres ciclos apoyados en un
invariante con dos agujeros. No se coló nada por ellos, pero nadie lo sabía. Por
eso cada guardia nuevo se rompe a mano, se mira rojo y se arregla antes de darlo
por bueno.

**`pnpm banco` es el otro par de ojos, y mide lo contrario que el barrido.** El
barrido pregunta si la IA juega peor; el banco, si el código hace **exactamente lo
mismo**: juega 200 partidas y saca el tiempo y el **sha256 del volcado**. Ese hash
está **anclado en el propio fichero** y la orden sale 1 si no cuadra, porque un
criterio de aceptación que exige acordarse de correr la herramienta en el commit
anterior no es un criterio: es una costumbre. Y lo corre CI. Es reproducible fuera
de esta máquina porque el núcleo no ejecuta ni una operación de coma flotante que
dependa de la plataforma — solo `min/max/floor/ceil/abs/round/imul`, nada de
`Math.pow`, ni `**`, ni trigonometría.

Y esa frase **ahora la vigila un test**, que es lo que llevaba sin hacer desde que
se escribió. Se sostenía por accidente: la única aparición del operador `**` en
todo `core` estaba en `experienceForLevel` —la curva de experiencia—, y solo
seguía siendo cierta porque **nadie llamaba a esa función**. El ciclo de #87 iba a
llamarla, y con eso la promesa se rompía en silencio y en la función más fácil de
no mirar. Se cambió la curva por la tabla de 40 filas del original y se escribió
el guardia. Va con **lista blanca** de lo permitido y no con lista negra —al revés
que el de rutas absolutas, y por el mismo razonamiento: aquí lo cerrado y
publicado es *lo que vale*, así que una lista negra sería la que fallara en
silencio ante el siguiente `Math.fround`—. Y borra los comentarios antes de
mirar, porque `**` es también la negrita de Markdown que este repositorio usa
dentro del código y porque el docstring de al lado cita `Math.pow` para
explicarse. Roto a mano con cinco sondas, y con tres más al aceptarlo: `Math.pow`,
el operador `**` y un `Math.sqrt` en otro fichero, los tres vistos rojos con su
fichero y su línea.Y su forma final no es «prohibido `Math.pow`»
sino la lista blanca llevada al final: **`Math` solo puede aparecer seguido de una
de las siete permitidas**. La diferencia la encontró QA rompiéndolo con
`const { pow } = Math`, que la primera redacción no veía — y mis tres sondas
tampoco, porque las tres escribían `Math.` con el punto delante: **lo estrecho era
la batería, no la idea**. Un guardia probado solo con las formas que su autor
imaginó prueba su implementación, no su criterio. Ocho sondas ahora, y muerde
además `const M = Math` y `Math['pow']`.

El barrido de semillas no es un test: es una **medida**. Juega 40 partidas de la
IA contra sí misma y cuenta cuántas no terminan en 300 días. Hoy son **0**;
fueron 4, luego 2, y la causa no era la que decía el issue —ver más abajo—.
Sirve para lo que un test no puede: distinguir «no empeora» de «tuve suerte con
la semilla». Y ahora que la línea base es cero, **una sola semilla que no
termine es una regresión**, no ruido.

Y un hook `Stop` (`.claude/hooks/verde.sh`) impide dar una tarea por terminada
con `pnpm verify` en rojo. No estorba: no se lanza siquiera si no ha cambiado
nada en el repo desde la última vez que salió verde. La huella cubre el repo
**entero** a propósito, y no una lista de rutas: esa lista era la tercera
redacción de «qué cubre `pnpm verify`», y a las tres les faltaba
`vite.config.ts`. Excluir `assets` y `docs` abría la misma puerta por el otro
lado —el guardia de rutas absolutas sí mira los ficheros de máquina que vivan
ahí, así que un `.json` bajo `docs/` ponía la verificación en rojo con el hook
dormido—, y cuesta 17 ms recorrerlo entero. Con `-z` y `xargs -0`, porque un
nombre con un espacio se partía en dos y su contenido dejaba de contar **en
silencio**.

## Decisiones tomadas

- **MCP antes que API key.** El usuario tiene Claude Max: el agente entra por
  MCP, no por una clave de API.
- **`FAL_KEY` nunca llega al navegador.** Las llamadas salen de scripts CLI en
  el build; el cliente solo carga PNGs.
- **Nada del HoMM2 original.** Los `.AGG` son de Ubisoft. Se reimplementan las
  reglas —que no son protegibles— y el arte se genera.
- **Dos facciones**: caballeros y nigromantes, seis criaturas cada una con sus
  mejoras.
