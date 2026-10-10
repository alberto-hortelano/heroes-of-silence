# Heroes of Silence — historia de las decisiones

> Lo que era `CLAUDE.md` hasta el 04-10-2026, entero: el porqué de cada regla,
> las medidas con su fecha y las lecciones de QA. La guía corta vive en
> `CLAUDE.md`; aquí se viene a buscar el motivo antes de deshacer algo.
> **Las cifras con fecha son de su fecha**, no de hoy.

Clon de Heroes of Might and Magic 2 en el navegador, pensado como **banco de
pruebas para un juego con IA**: los NPCs los lleva un agente conectado por MCP,
los mapas los diseña ese mismo agente y los assets se generan con fal.ai.

El juego es el andamio; lo interesante es lo que se puede enchufar dentro.

## Arrancar

```bash
pnpm install
pnpm dev        # cliente en http://localhost:3100 (juego local contra la IA de reglas)
pnpm mirar      # MIRAR la partida del agente: /espectador/ contra el servidor
pnpm arena      # la ARENA: /arena/, montar unidades de las cinco facciones y hacerlas luchar
pnpm verify     # typecheck + lint + 1160 tests, 13,7 s: el bucle rápido
pnpm test       # 1160 tests: reglas, batalla, partida completa y contrato del agente
pnpm typecheck
pnpm lint       # Biome: formato y lint en una sola pasada, 40 ms
pnpm format     # lo mismo, arreglando lo que sepa arreglar
pnpm banco      # 200 partidas: tiempo y sha256 del volcado, 5,2 s

npx tsx tools/qa/enfrentamiento.ts   # la IA de hoy contra ella sin su última regla, 2000 batallas, 1,9 s
pnpm capturas   # juega el cliente, el espectador y la arena en Chromium (Playwright) con clics reales, ~245 s; PNG en .cache/capturas/ o en la carpeta que se le pase
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

Todo eso sigue siendo cierto **en el navegador**, que juega en local y no le pide
el mapa a nadie. Donde deja de serlo es en el **servidor**: desde #27, si el
agente diseña el mapa, la semilla ya no reproduce esa partida —el mapa lo puso
él, no ella— y la consola lo avisa al arrancar. Con el respaldo procedimental la
semilla vuelve a mandar.

Y hay CI: `.github/workflows/ci.yml` corre `pnpm verify`, `pnpm banco` y
`vite build` en un job, y `pnpm qa` en otro, en cada push y cada PR contra
`main`. Invoca `verify`
y no sus tres órdenes sueltas a propósito: el bucle rápido se define una vez, en
`package.json`. **No gasta un céntimo**: no declara ninguna credencial y no
invoca nada de `tools/gen/`.

Para que juegue un **agente** hacen falta dos terminales, y una tercera si
quieres **verlo**:

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

# terminal 3 — OPCIONAL: la partida, vista.
pnpm mirar
```

**La tercera terminal es nueva y es la que cierra la frase con la que abre este
documento.** Hasta #30, ver jugar al agente consistía en leer los `console.log`
del servidor: el proyecto era un banco de pruebas para un juego con IA cuya demo
no se podía enseñar. `pnpm mirar` abre `/espectador/`, que se cuelga del canal de
espectadores —que ya emitía y no leía nadie— y pinta el mapa, las banderas, la
crónica y **las batallas acción a acción**. Es de **solo lectura**: no manda un
solo intent, y por eso no pasa por `session.ts`.

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
pnpm qa   # pide el mapa al agente, arranca servidor + puente MCP y juega, 3,2 s
```

No solo comprueba que no reviente. Lee el bloque `CÓMO FUE LO ANTERIOR` de cada
escucha y **cuenta** cuántas respuestas entraron y cuántas se descartaron, con
el motivo; exige con `game_state` que lo pedido se **aplique** de verdad (el
edificio concreto que se pidió, o el héroe en otra casilla); y ejercita las
seis consultas por su contenido —`battle_state` en plena batalla, `map` con su
niebla, `creature_stats`, `game_state`, `spell_list` y `building_list`—. Antes
daba verde con cuatro de cuatro acciones descartadas.

Y desde #27 **el mapa que se juega lo diseña el agente**: sus pueblos se llaman
`qa-town-*`, y el arnés sale 1 si el primer `game_state` no los ve. Sin esa
firma, un plan rechazado dejaría al servidor jugando el procedimental y el
arnés daría verde sin haber ejercitado nada de lo que #27 añadió.

## Mapa del repositorio

```
src/core/          TypeScript puro: las reglas. Sin DOM y sin node:*
  arena.ts         las unidades de la arena: su formato, su validación y su batalla
  battle/          rejilla 11×9, iniciativa, daño, hechizos
  map/             mapa de aventura, pathfinding, niebla, generación y la red de
                   nodos (`regiones.ts`: regiones, dueños y conexión con la base)
  town/            castillos, edificios, reclutamiento
  hero/            héroes, ejército de 5 stacks, movimiento
  state/           GameState, turnos, batallas del mapa
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod y serialización para el agente
src/server/        bridge WebSocket + puente MCP
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  html.ts          LA PUERTA: todo el marcado sale de aquí, ya escapado
  escenas/         ratón y cámara de cada pantalla: aventura, castillo y batalla
  render/          lo que pinta cada pantalla: mapa, batalla a 25°, castillo, figuras
src/shared/        el contrato visual (cámara a 25°, luz) que comparten cliente y taller
  views/           los paneles de HTML del lateral
  espectador/      la otra página: mira la partida del servidor, no juega
  arena/           la tercera: monta unidades con cifras inventadas y las hace luchar
tools/gen/         generación de assets con fal.ai
tools/qa/          verificación de extremo a extremo
tools/arena/       el disco de la arena: la lista de hojas y el borrador de cifras
data/              criaturas, edificios y hechizos en JSON editable
  borradores/      lo que guarda la arena (`unidades.json`); el juego no lo lee
assets/generated/  arte generado (lo sirve Vite como estático)
```

## Contratos que no se rompen

- **La lógica vive en `core` y el cliente solo pinta.** El cliente no aplica
  reglas: llama a `session.ts`, que es la única puerta al núcleo. La frase que
  seguía a esta —«cuando el cliente pase a hablar por WebSocket, cambia esa capa
  y nada más»— **la desmintió el espectador**: ya hay una página del cliente que
  habla por WebSocket y **no pasa por `session.ts`**, porque no juega. Tiene su
  propia entrada, `espectador/adaptar.ts`, que es la inversa exacta de la
  serialización del servidor en todo lo que se pinta: lo que el cable no manda
  —lo ganado en la batalla en curso y la hoja de servicios de un veterano— vuelve
  vacío, y lo dice. La regla que sí aguanta es la de arriba: quien
  aplique reglas pasa por `session.ts`; quien solo mira, no aplica ninguna.
- **Todo el marcado del cliente sale por `html.ts`, y `pintar` es el único
  `innerHTML` del repositorio.** Una plantilla `html` escapa cada hueco **según
  dónde cae** —texto y atributo no son la misma operación— y lo que no entiende
  **lanza** en vez de adivinar. Lo ya escapado se reconoce por un símbolo privado
  del módulo, no por un tipo que se borra al compilar, así que lo anidado no se
  escapa dos veces. Olvidarse no compila: `pintar` solo acepta `Html`.
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
  repetir una búsqueda, sino en la **siguiente**—.

  **Y esa última frase promete más de lo que el código cumple, así que aquí va lo
  que de verdad lo guarda: `pnpm banco`.** QA lo demostró rompiéndolo por donde el
  propio `frontera.ts` dice que no se puede: izar la instancia a nivel de módulo
  con un `reiniciar()` que repone `agotada` y `ultimoPop` **y no limpia
  `ordenes`**. Reproducido al aceptarlo: **los 310 tests de entonces pasan**, los once de
  `frontera.test.ts` incluidos, los tres `throw` se callan, y el volcado se va a
  32 159 líneas con otro sha — que es quien lo caza. El agujero es **anterior** a
  todo esto y sigue abierto; lo que cambia es que ya no se cree tapado.

  Los **tres** `throw` de la clase guardan lo que sí guardan, y hicieron falta
  los tres. El primero comparaba costes, y QA encontró que no veía la reutilización cuando la búsqueda
  anterior se agotaba en el origen —`0 < 0` es falso—, que es lo que da un
  `map_generate` con un pueblo rodeado de agua. El segundo no mira costes: mira si
  la frontera ya se agotó. Y el tercero entró con el índice plano, por un motivo
  distinto de los otros dos: `ordenes` pasó de `Map` a `Int32Array`, y **un typed
  array tira en silencio una escritura fuera de rango** donde un `Map` no podía.
  Vigila el rango, y se le vio morder: quitando la comprobación de columna del
  bucle de vecinas sale «la frontera va de 0 a 15 y le entra -1: un índice fuera
  de rango se perdería en silencio». **Es un guardia de rango y no de índice**, y
  la diferencia importa: con `x = −1` en la fila `y`, `y*W − 1` cae dentro del
  array —es la última casilla de la fila anterior—, así que un desbordamiento
  lateral pasa por delante de él sin despeinarlo. QA lo demostró construyendo el
  mapa donde todos los desbordamientos caen dentro del rango.

## Reglas del juego (verificadas contra fheroes2)

| Dato | Valor |
|---|---|
| Rejilla de batalla | 11 × 9 = 99 hexes, offset odd-r |
| Tropa | individuos, uno por hex, acotados por el liderazgo del héroe (`data/liderazgo.json`, provisional) |
| Recursos | madera, mercurio, mineral, azufre, cristal, gemas, oro |
| Movimiento diario | lo marca la criatura MÁS LENTA (1000–1500) |
| Puntos de hechizo | 10 × Conocimiento |
| Moral y suerte | −3 a +3 |
| Duración de Prisa/Lentitud | poder mágico del lanzador, en rondas |
| Inmunidad de los no-muertos | a la mala suerte: Maldición y `curse_on_hit` |
| Dos efectos del mismo origen | el segundo REFRESCA la duración, no se acumula |
| Turno de una unidad | se mueve en **tramos** hasta gastar su velocidad; atacar lo cierra (regla nuestra) |
| Carga (`charge`) | +10 %/casilla, tope 5, solo en **línea recta** de ≥ 3 desde el inicio del tramo y con **el enemigo en la recta** (regla nuestra) |

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

- morada 5: **52 de 200** partidas al cerrar aquel ciclo (`2db037e`), desde 0. La
  partida **no se alargaba** —mediana 7→6 días, p90 8→7—, que era la condición.
- pero el **dragón óseo seguía en 0 de 200** en 24×24: **las dos mitades entraron
  y lo que faltaba no era economía** (#90). La premisa que aprobó no tocar la
  duración venía de una contrafáctica de material **infinito** y era optimista por
  un factor 19.

**Y las dos cifras de arriba llevan fecha porque ya no son las de hoy**, que es lo
que este documento pide de una cita y no se estaba pidiendo a sí mismo. Censado el
volcado del banco el 27-08-2026: morada 5 en **15 de 200**, morada 6 en **2**,
mediana **7 días**, ganadores **42/158**. No se movió la economía: la movieron
**#87 y #88** —la experiencia y el gremio— al dar la vuelta al ganador, y con él
se fue el desarrollo. Nadie volvió a medir, y una cifra de hace tres ciclos escrita
en presente es exactamente la trampa contra la que avisa la sección de la tabla de
experiencia.
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
fórmula pasó a ser la del original —`GetHitPoints() × muertas` sobre el bando que
pierde, **+500 por héroe rival derrotado**, +500 por asedio— y esos +500 no eran
decoración: sin ellos seguían siendo 0 de 68, con ellos 40 de 68.

**Esa fórmula ya no es la vigente**: la sustituyó la experiencia por daño de «La
tropa crece», más abajo, que es **regla nuestra y no del original**. Lo de aquí es
historia, y se queda por la lección.

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
quien la lea después. Aquella tabla se extrajo del fichero **con una expresión
regular, sin transcribir a mano** —que es la parte que falla—, y el test no anclaba
lo que hubiera: comprobaba **26 filas contra la regla que el propio original publica
dos líneas más abajo**, que las diferencias crecen ×1,2 redondeado a centenas. Esa
propiedad es lo único que no depende de que nadie teclee bien, y una tabla
alucinada no la tiene. La tabla y su test se retiraron con «La tropa crece»; la
lección se quedó, y el catálogo de habilidades de ese ciclo se sacó del cuaderno
igual: con una expresión regular.

**Y arreglar los dos volcó el ganador**, que estaba previsto y aprobado antes de
implementar: con control de esquina el caballero pasa de **78,5 % a 16,25 %**.
`#87` no movió el equilibrio **ni un punto en ninguna esquina** —el vuelco es
entero del gremio— y no se compensa aquí: la reparación con fuente es
**Nigromancia**, que es lo que en el original pone el otro platillo. Lo mismo que
se decidió cuando el desequilibrio iba en la dirección contraria.

## La tropa crece: la experiencia es regla nuestra

**La experiencia de hoy no viene de HoMM2 y no se cita como suya.** La pidió el
usuario en `NuevaJugabilidad.md` («Experiencia») y sustituye entera a la de
fheroes2 —bajas en PV del perdedor, +500 por héroe y por asedio, la tabla de 40
filas—:

- **Se gana por daño**: quien quita PV a un enemigo cobra `PV quitados × nivel
  del que los recibe`, **gane o pierda**. Lo quitado y no lo tirado: un golpe de 7
  sobre un piquero con 5 PV cobra 5 × 3. La salpicadura sobre los tuyos no
  cuenta. Un hechizo lo cobra el cuerpo del héroe que lo lanza.
- **El nivel de quien recibe**: una criatura, su nivel de catálogo + veteranía − 1;
  un personaje, su `level` + veteranía − 1; un héroe, su nivel, que es 5 o más.
  **Vive en las cifras** (`UnitInfo.nivel`): lo ponen los tres constructores y
  `cifrasVeteranas` le suma la veteranía como suma ataque y defensa. Antes eran
  cuatro campos `nivel` repartidos por el stack, el héroe, el personaje y la
  entrada del motor, que cada camino rellenaba a mano.
- **Una tabla, en datos** (`data/experiencia.json`): subir del nivel n al n+1
  cuesta `base × incrementos[n−1]`, con incrementos de Fibonacci —`data.ts`
  lanza si no lo son— y base 20: **20, 60, 120, 220** para los niveles 2-5. Más
  allá de la lista sigue la recurrencia, solo con sumas de enteros: la tabla se
  corta donde deja de caber en un entero seguro, así que el banco sigue valiendo
  fuera de esta máquina.
- **Una sola escala de niveles: la tropa va del 1 al 5 y todo héroe EMPIEZA en el
  5** —el inicial, el contratado y el veterano que se haga héroe (ciclo B)— con
  los 220 de experiencia del 5, y sube sin tope por la misma tabla (6, 7, 8…).
  Decisiones del usuario, en dos tiempos: primero «el tope de 5 es solo de la
  tropa», y al medir que con la escala aparte el héroe llegaba al 5 tras una sola
  guardia, «si la tropa pasa a héroe con nivel 5, la base de héroe debería ser
  5». Cada nivel de tropa suma +1/+1 de ataque y defensa, provisional; lo que da
  el nivel de un héroe vive donde ya vivía, en `data/heroe.json` y
  `data/liderazgo.json`, **reindexado**: un héroe de nivel 5 tiene lo que antes
  uno de nivel 1. La reindexación vive en **una** función, `subidasDeHeroe`
  (`hero/experiencia.ts`), que leen el cuerpo y el liderazgo y que **lanza** con
  un héroe por debajo del 5 —un `level − 1` olvidado le regalaría cuatro niveles
  en silencio—. Y el 5 inicial **se deriva** del tope de la tropa en vez de
  escribirse al lado: son la misma frontera vista desde los dos lados.
- **El héroe no guarda su nivel: lo deriva de su experiencia** (`nivelDeHeroe`),
  igual que la tropa lo deriva de su hoja. `Hero.level` era el mismo hecho
  escrito dos veces, con un bucle que los resincronizaba y una pareja de
  constantes —nivel y experiencia iniciales— que cuadrar en cada sitio que crea
  un héroe. Ahora nace con 220 y el 5 sale de ahí.
- **Cada nivel de tropa trae una habilidad en datos, inerte**: no tiene efecto
  hasta que exista el motor de habilidades. Los nombres se comprueban al cargar
  contra `data/habilidades.json`, que **se saca de `NuevaJugabilidad.md` con una
  expresión regular** (`tools/datos/habilidades.ts`) y no se teclea: el cuaderno
  no se commitea y el JSON sí, que es lo que CI puede leer.

**La experiencia vive en el individuo** (`Troop.veterania`), y eso es lo que la
hace sobrevivir sin que nadie se acuerde: es el mismo objeto el que va del héroe a
la guarnición, al recoger tropa o al rendirse, y si muere se pierde con él. Lleva
un `id` de un contador del estado, que es lo que necesitará la tropa que se hace
héroe (el ciclo B). El nivel **no se guarda**: se deriva de la experiencia. El
motor sigue sabiendo jugar stacks de N, pero **lanza** si uno con hoja de servicios
trae `count ≠ 1`: la experiencia es de un individuo y no se reparte. Esa es la
única comprobación, a la entrada de `createBattle`: un bando con dueño se monta
siempre con `troopsAsStacks`, que da stacks de 1.

Tres puertas únicas que conviene no saltarse:

- **`herir` (`battle/damage.ts`) es la única forma de quitar vida**, y
  `applyDamage` **no se exporta**: un quinto sitio que hiriera por su cuenta haría
  daño gratis sin que nada se pusiera rojo. Lo vigilaba un guardia de texto; ahora
  lo impide el módulo, y eso lo comprueba `tsc`.
- **`cifrasDeCatalogo` es la única regla de «cifras = catálogo + veteranía»**
  (`cifrasVeteranas` es la suma por nivel que hay debajo), y tiene tres lectores:
  `troopUnit`, `resolveUnit` y la inversa del cable del espectador, con un test
  que pone en contacto a las dos primeras. En el nivel 1 devuelve la **misma
  referencia** del catálogo, así que un novato sigue siendo idéntico; las cifras
  de un veterano se recuerdan **por su hoja**, que es inmutable, y `armyPower`
  dejó de fabricar una copia por veterano en cada pregunta. El precio de rendirse
  viaja en el origen del stack (`origen.oro`) porque la referencia ya no lo
  garantiza. El guardia del catálogo mira las dos llamadas, `creature(` y
  `cifrasDeCatalogo(`, y la excepción del cable es para la segunda.
- **`elQueSeIria` (`hero/troop.ts`) dice a quién se licencia**: de cada tipo, el
  de menos experiencia y, a igualdad, el último en llegar. La aplican la acción
  (`sinIndividuos`), la IA que planea licenciar y el botón del panel, que va solo
  en la fila de quien se iría. Estaba escrita tres veces. El contrato del agente
  no cambió («licencia dos piqueros»), el veterano no se va mientras quede un
  novato de su tipo, y la IA ordena por veteranía antes que por oro.

Medido con el código final (`tools/qa/veterania.ts`, 1 000 partidas, 02-10-2026,
**con la escala única**): **individuos que llegan a cada nivel por partida 9,35 /
3,88 / 1,69 / 0,51** (2, 3, 4 y 5), 207 de 1 000 partidas con algún 5, y **solo 59
veteranos de nivel 5 pisan vivos su base en 1 000 partidas** (en 43 de ellas) —el
dato que pide el ciclo B, y sigue siendo poco: 0,06 por partida—. Los héroes suben
4,31 niveles por partida y llegan al 15; al final, de los vivos, 301 siguen en el
5, 541 en el 6 y 371 en el 7. Duración mediana **9** días, p90 17, máximo 54, 0
sin terminar; **el caballero (j0) gana 484 de 1 000**.

Con la escala aparte —el héroe empezando en el 1, que fue lo primero que se
midió— eran 5,51 / 1,94 / 0,82 / 0,23, 116 partidas con algún 5, **21** veteranos
de 5 en su base, 9,62 subidas de héroe hasta el 14, mediana **6** días y j0 **360
de 1 000**. Lo que movió el equilibrio era la experiencia del héroe y no la de la
tropa —el prototipo del arquitecto, con +0/+0 por nivel de tropa, daba 78 de 200
frente a 77—, y por eso la escala única lo devuelve casi al centro sin haberlo
buscado: subir del 5 al 6 cuesta 160 donde subir del 1 al 2 costaba 20. La tropa
sube más porque las partidas duran más, no porque cueste menos. No se ha
compensado nada.

Y una trampa de medida que conviene no repetir: el prototipo contaba **12,3 / 4,3
/ 2,0 / 0,6** individuos por nivel, y no porque la regla fuera otra —con la sonda
de contar igual que él, el código final da 12,32 / 4,34 / 1,99 / 0,59—, sino
porque contaba también **a los que suben y mueren en la misma batalla y a los
neutrales**, que no se llevan nada. Lo que llega es lo que sobrevive con dueño.

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

**Y la petición de mapa dice CUÁLES son los jugadores, no cuántos** (#101).
Mandaba `players: 2`, un número, y el agente tenía que sacar de una convención en
prosa —«numerados desde 0»— que eran el 0 y el 1. Ahora van los ids. Lo que **no**
cambia, contra lo que prometía el issue y contra lo que yo copié al encargarlo:
**el guardia que compara los jugadores del plan contra los pedidos no se muere**.
Nombrar los ids quita la **ambigüedad**, no la **desobediencia** — un agente
puede leer `players: [0, 1]` y devolver los jugadores 3 y 4 igual, y eso sigue
dejando la partida sin un solo turno en silencio. Lo que murió es la convención.

**Del contrato se exportan los esquemas, no los alias** (#100). `z.infer` se
escribe donde se usa —`agent-link.ts` ya tipa `ask()` así— y un tipo que ningún
`import` nombra se borra: este paquete es `"private": true`, así que el cliente de
fuera del repo que justificaría «es API pública» no existe. `MapGenerateResponse`
se queda porque tiene un consumidor, no porque sea más importante.

Tipos de petición: `adventure_turn`, `battle_turn`, `map_generate` y, desde «la
tropa se hace héroe», `hero_from_troop`. Y hay
**seis** tools de consulta (`game_state`, `battle_state`, `map`,
`creature_stats`, `spell_list`, `building_list`) para mirar cosas sin volcarse
la partida entera en el contexto.

Los cuatro tipos están vivos y se ejercen. **`hero_banter` fue un cuarto que no
existía**: se le anunciaba a un agente que no podía descubrir la mentira —el
kind no estaba en `REQUEST_KINDS`, así que nadie se lo iba a pedir nunca y el
anuncio no tenía forma de ponerse rojo—. Se retiró entero, y de paso se llevó un
fallo latente: el `else` de `enSuLugar` le habría contestado «ese turno lo juega
la IA de reglas» **sobre una frase de héroe**. Lo que quedó vigilándolo no es un
test de que ya no esté —ese no puede ponerse rojo tampoco—, sino uno que compara
los `case` de `decidir` contra `REQUEST_KINDS` **en las dos direcciones**. Y mordió
el día que entró `hero_from_troop`, antes de que tuviera su rama. Ese `else` ya no
existe: lo que se juega en su lugar es una tabla `Record<RequestKind, string>`
(`EN_SU_LUGAR`, en `notas.ts`), y un kind sin su frase no compila.

**Y el agente solo pregunta por los suyos.** `game_state`, `battle_state` y `map`
llevan un parámetro `player`, y hasta hace poco se lo creían: `game_state{player:0}`
devolvía la crónica del rival, sus recursos, sus héroes y sus castillos. Con la
crónica ya filtrada por la niebla, eso dejaba cerrada la puerta principal y
abierta la de al lado — y hacía **falsa** la frase con la que se cerró aquel
trabajo. Ahora `responderConsulta` recibe qué jugadores lleva el agente y
**rechaza diciéndolo**, nombrando los suyos: *«no puedes consultar por el jugador
0: no es tuyo. Llevas el jugador 1: pregunta por ese»*. La descripción de la tool
dice qué acepta, porque un agente que recibe un rechazo sin haber sido avisado no
se corrige: reintenta. Hay un **segundo** motivo por el que una consulta se
rechaza diciéndolo, y es nuevo: durante la ventana de arranque —desde que se abre
el canal hasta que hay mapa— todavía no existe partida por la que preguntar, y se
contesta que se está esperando su plan en vez de reventar.

**Y la niebla tapa también las consultas.** Cerrar la crónica dejó la puerta
principal cerrada y **tres de al lado abiertas**, y ninguna la alcanzaba nadie
todavía: se taparon **antes** de abrir la puerta, que es más barato que
quitárselo a un agente que ya lo tenía. **La puerta ya está abierta**: la tool
`map` se publicó en #33, y llegó a un sitio que llevaba tapado desde antes de que
hubiera quien mirara. La apuesta salió bien y conviene recordar por qué se hizo,
porque la alternativa —publicar y tapar después— es la que parece más barata.

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

**Y esa última ausencia se explica, que es lo que faltaba** (#84). De las tres
ramas de `battle_state`, la de tu propia batalla era la única que quitaba el
campo **callando**. Ahora lleva su nota, y la decisión de si ponerla se le
pregunta **al objeto ya serializado** (`'legalActions' in vista`) en vez de
reescribir la condición del serializador: sería la tercera declaración de la
misma regla, con las dos libres de divergir. La nota vive en el servidor y no en
`core` porque las otras dos las pone el servidor por encima del objeto, y un
`note` nacido en `core` chocaría con esos dos *spreads*.

Y lo incómodo, que se publica igual porque lo midió QA: **esa rama no se alcanza
jugando**. No es solo que la petición empujada no falle nunca la condición
—`director.ts` llama con el bando del stack que decide—: es que `playBattle`
aplica las acciones del rival de forma síncrona, así que entre dos
`heroes_respond` no hay ventana en la que consultar y ver a otro activo. Medido:
15 de 15 consultas con la lista y ~325 sondeos sin una sola ausencia. Se escribe
igual porque el día que la ventana exista la ausencia volvería a ser muda; lo que
no se hace es contarlo como cubierto.

**Y desde #85 ese mapa filtrado es también el `knownMap` de cada turno.** Iba
`{width, height, objects}` —ni terreno ni caminos—, así que el agente elegía el
destino de cada `move_hero` sin saber por dónde se anda, **mientras la
descripción de la tool `map` le prometía por escrito que traía «lo mismo»**. Las
dos cosas no podían ser verdad, y la falsa estaba publicada. El arreglo es una
línea: el turno llama a `serializeKnownMap`, y **que sea la misma llamada es toda
la garantía** de que las dos puertas devuelven lo mismo — no un test.

La hipótesis de que #85 había caducado al publicarse la tool `map` (#33) se cayó
al medirla, y conviene guardar el porqué: el terreno **no cambia**, pero **lo que
el agente conoce crece** —14 % del mapa el día 1, 38 % el día 3, 49-64 % el día
6—, así que cachear la llamada del día 1 es planificar el día 6 con el mapa del
día 1. Cuesta **+3 099 B el día 1**, que más que duplica un turno de 1 853-2 296 B,
y +3 685 a +3 901 B el día 6. Un esquema de **deltas** se descartó a propósito:
obligaría al servidor a recordar qué mandó por un canal que puede perder
mensajes, y un mensaje perdido corrompería el mapa del agente en silencio.

**Lo que se ve en una casilla no explorada es un hueco explícito**, `null`, y no
el terreno por defecto: al día 6 el 45,3 % de las casillas serían dato fabricado
sin decirlo, y un agente no puede distinguir llanura de ignorancia. El índice
`y*width+x` se conserva, así que quien lea esto no aprende una convención nueva.
Y una cifra que contradice lo que cualquiera esperaría: **filtrar apenas encoge
el payload** —14,8 % de mediana—, porque `null` ocupa cuatro caracteres y
`"grass"` siete. Quien publique la tool no debe contar con ese ahorro.

### Lo que el agente lee sale de donde se calcula

Tres cosas que no estaban en ningún issue y que salieron al darle al agente el
mapa. Las tres son la misma: **un dato que el agente no puede comprobar tiene que
derivarse, no escribirse.**

- **La prosa derivaba las cifras y copiaba la fórmula.** Los costes de terreno
  salían de `TERRAIN_COST` —bien—, y al lado se reescribía a mano que el camino
  sustituye al terreno y que la diagonal multiplica y redondea. Eso es
  exactamente lo que el docstring de `costeDeEntrada` dice que no puede pasar
  —«el día que cambie el factor diagonal habría que acordarse de los dos»—, y
  aquí el segundo sitio es el peor: **el agente no puede verificar lo que se le
  anuncia**, así que un número que deje de cuadrar no lo descubre nadie. La
  fórmula bajó a vivir con sus tres constantes en `terrain.ts` y la prosa lleva
  **las dos columnas ya resueltas** (`grass 100 (140 en diagonal)`): el agente no
  multiplica ni redondea. Con un guardia que prohíbe que la fórmula vuelva a
  viajar, y que mordió a la primera sobre el texto de quien lo escribió — decía
  «no tienes que multiplicar ni redondear nada», y la expresión no distingue la
  fórmula de su negación.
- **`roads` viajaba como claves `"x,y"`** en un payload donde todo lo demás son
  puntos. Lo decisivo no fue la estética: **`mapPlanSchema.roads` es
  `z.array(pointSchema)`**, o sea que el agente **escribe** los caminos como
  `{x,y}` y los **leía** como cadenas, en el mismo contrato y en direcciones
  opuestas. Se normalizó, y con eso se **borran** seis líneas de prosa en vez de
  añadirlas. El precio son ~800 B por cada 100 casillas con camino, y **cero en
  toda partida de hoy**: `generateMapPlan` no pone caminos, así que sólo los hay
  en los mapas que diseña el agente. El espectador **no se toca**: tiene su propio
  serializador y su inversa exacta, otra frontera y otro estándar, a propósito.
- **La descripción del mapa estaba escrita dos veces**, y había divergido en el
  mismo commit que la creó. Ahora es una constante pegada al serializador que
  interpolan las dos puertas, y su guardia tiene **dos mitades por una razón
  física**: `mcp/server.ts` se autoarranca al importarlo, así que el bloque del
  turno lo vigila `pnpm verify` y el de la tool publicada, `pnpm qa`. Rotas por
  separado, cada una muerde lo suyo.

**Y la lección más cara del ciclo es la de siempre con una vuelta más:** dos
guardias nuevos, escritos precisamente para cerrar esta clase de agujero, **no
podían morder**. Uno tapaba un `undefined` con un `!` y su aserción pasaba **por
vacío**. El otro decía comprobar que el `null` es exactamente la niebla, casilla
a casilla, y **recalculaba el índice con la misma expresión que la
implementación**: un espejo. Transponer el índice en `serializeKnownMap` dejaba
los 402 tests de entonces en verde.

Lo que lo tapaba no era la semilla, y por eso hay que escribirlo: **el generador
pone los dos inicios en la diagonal de un mapa cuadrado** —(4,4) y (19,19)—, así
que la niebla de una partida joven es **simétrica bajo transponer** y leer la
clave del revés no cambia ni una casilla. La misma fixtura había dejado pasar
antes una sonda sobre `pointFromKey`, una función más allá. Hicieron falta las
dos mitades: el barrido recorre ahora **(x, y) y calcula el índice**, y el
fixture **fuerza una casilla explorada cuya transpuesta no lo está**. Hoy la
sonda sale «(1,0): expected true to be false».

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

**Y desde «el camino cuesta» ese radio también explora**: se escribe en `fog` y
en `memory` (`revealAroundTown`) al crear la partida, al empezar el turno del
dueño y al capturar. Antes solo alimentaba `visibleNow`, y con los asaltantes eso
dejó de ser un dato de más para el agente y pasó a ser una **emboscada a ciegas**:
el agente veía el grupo de la región de casa sobre una casilla `terrain: null` y
la persona, que pinta con `fog`, no lo veía — en 96 de 200 semillas el día 1. **El
volcado no se movió**: el sello `seen` ya salía de `visibleNowAt` y ninguna IA lee
`fog`, así que lo único que cambia es lo que se pinta y lo que lee el agente.

### Tres arreglos pequeños: la causa del final, el id del contratado y lo que no se lee (#123, #126, #128)

06-10-2026, en paralelo a #150 y en su propio worktree.

- **La nota de fin no decía por qué.** El agente recibía quién ganó y su
  recuento, pero no si había perdido la base: la causa estaba sellada en
  `player_defeated.reason` y solo la buscaba `Session.causaDelFinal`, en el
  cliente, donde el servidor no puede importarla. Bajó al núcleo junto con el
  desenlace: `finDePartida(state, quienes)` (`core/state/desenlace.ts`) da
  `{ desenlace, ganador, causa }`, y el tipo garantiza la causa cuando hay
  ganador, así que la nota indexa su tabla sin ternario y sin `!`. «Ganada,
  perdida o ajena» se calculaba en tres sitios (la nota, la causa y
  `desenlaceDe` del cliente) y ahora en uno; el cliente solo traduce su
  `viewer` a un conjunto (`quienesDe`, con `NADIE` vacío). Hubo un guardia que
  prohibía comparar con `'player_defeated'` fuera de esa función, y se quitó en
  la vuelta de /simplify: una línea legítima que solo **cuenta** hechos —un
  recuento de eliminados, una crónica que diga la causa— salta igual que una
  búsqueda copiada, y no hay patrón que distinga las dos; queda la fila de
  «Puertas únicas». Los tests de la nota escribían `state.finished = { winner }`
  a mano, un final sin hecho en la crónica: ahora acaban la partida de verdad
  (`acabarPorLaBase`, en `helpers.ts`).
  El espectador también la recibe: el servidor le manda
  `notaFinDePartida(state, SIN_BANDO)` (`partida.ts`), así que enseña la causa
  («el último eliminado se quedó sin base»). **Diferencia deliberada**: el
  lateral del cliente, para quien no lleva bando, sigue diciendo solo «La
  partida ha terminado». Cambiarlo quedaba fuera de estos tres issues. La nota
  no repite el verbo: decía «has perdido: has perdido tu base» y dice «has
  perdido: tu base cayó».
- **La barra contaba pasos en la niebla.** «Hoy llegas a 7 de 20 pasos» con la
  mitad de la ruta sin explorar delataba el rodeo que el trazo ya callaba. Ahora
  cuenta sobre `pasosAPintar`, la misma llamada que el trazo, y si parte no se
  ve dice «hoy andas N de los M pasos que se ven; sigue por tierras
  desconocidas» (frase del usuario). Si lo que se señala está en la niebla, la
  barra ya empieza por «Tierras desconocidas» y la frase acaba en «que se ven»,
  para no decirlo dos veces. Y la frase del día cerrado seguía en la
  barra al volver el turno: la borra `olvidarRuta()` de la escena, que es quien
  la escribió, y solo si sigue siendo la suya. Así vale también al cambiar de
  héroe, al cerrar una batalla y al reiniciar, y no pisa lo que la sesión
  escribió después (un rechazo, el final). La primera versión la vaciaba en
  `Session.endTurn`, que solo cubría pasar el turno.
- **El id del contratado podía repetirse.** `hero-<jugador>-<héroes en
  juego>-<día>` daba el mismo id dos veces si entre dos contrataciones del mismo
  día salía un héroe de `state.heroes`, lo que solo pasa con tres jugadores
  (con dos, perder la base acaba la partida). Ahora es `hero-<jugador>-c<n>`
  con el contador `GameState.siguienteHeroe`. El banco no se movió: sus 200
  partidas no contratan a nadie (0 `hero_hired`). Sí se movió el ancla de los
  paneles, solo en ese id.
- **`lineaLegible` dejaba pasar lo que no se lee**: U+2028/2029 parten la línea
  sin ser `\p{Cc}`, el RLO (U+202E) da la vuelta al veredicto, y el braille
  vacío, los rellenos coreanos o un acento suelto se pintan en blanco. Lo
  ignorable (`\p{Default_Ignorable_Code_Point}`) va solo en la regla de «algo
  que se lea», nunca en la de «una línea»: incluye el U+FE0F de ❤️ y el ZWJ de
  👨‍👩‍👧, que dentro de un texto son legítimos.

### Los restos del agente: la marcha de varios días, los invisibles y «Continuar» (#121, #122, #158)

07-10-2026.

- **Una marcha de varios días contaba como descartada (#121).** `moveHero`
  andaba casilla a casilla y lanzaba al quedarse sin puntos, con la marcha ya
  hecha: el héroe se había movido, pero el director lo contaba como rechazo, el
  agente leía «descartada», repetía el mismo `move_hero` creyendo que no se
  había movido, y el `syncSpellbooks` del final de la acción no corría. Ahora
  anda lo que paga el día (`pasosDeHoy`, el mismo cálculo que pinta la ruta del
  cliente), lanza solo si no da ni un paso y, si el camino seguía, escribe en la
  crónica un `march_cut` con los pasos que faltaban del camino de salida. La
  primera versión lo deducía desde el director: comparaba dónde quedó el héroe
  con el destino, repetía los motivos de parada del núcleo (batalla, final) y
  lanzaba otro `caminoHasta` desde donde se quedó, que no es el camino que se
  calculó al salir. En /simplify se decidió que lo diga quien sabe por qué paró.
  La IA recorta antes con `stepTowards` y nunca lo escribe: el banco no se movió.
- **El emoji que CI rechazaba (#158 b).** La regla de «caracteres que existen»
  prohibía lo sin asignar (`\p{Cn}`), que sigue la tabla Unicode del motor: el
  Node 24.11 de CI (Unicode 16) rechazaba U+1FAEA, un emoji de Unicode 17 que el
  Node 26 local aceptaba, y un solo nombre rechazado tira el plan de mapa entero.
  Se quitó `Cn` y se prohíben en su lugar los invisibles salvo los que forman un
  emoji. Se probó a mano con las dos tablas; que CI corra las dos es #163.
- **«Continuar» pedía dos clics (#158 d).** El botón sale en cuanto la batalla
  termina, con la última muerte aún contándose, y la puerta de los gestos lo
  rechazaba con el aviso de espera: había que pulsar otra vez. Ahora se atiende
  antes de esa puerta (`repartirClic`) y espera a que se vacíe la cola
  (`EscenaBatalla.alAcabar`).
- **El puntero tapaba el desenlace (#158 c).** Con la partida terminada, pasar
  el puntero por el mapa describía la casilla en la barra encima de «Derrota…».
- **`map_generate` prometía un reintento que no existe (#122)**: «para que lo
  corrijas». Si el plan no vale se juega el procedimental y no se vuelve a pedir.

### El puente sabe qué partida tiene al otro lado (#118, 08-10-2026)

El puente MCP vive más que la partida, y guardaba sin dueño dos cosas: los
veredictos sin recoger y el `game_over`. Relanzado `pnpm partida`, la primera
escucha de la nueva traía los veredictos de la vieja —los `requestId` no ayudan:
las dos cuentan desde `req-1`— y, si la vieja había terminado, el puente no
volvía a conectar nunca: le repetía su final a la partida siguiente.

Ahora `AgentLink` (uno por partida) se presenta al atar un agente con
`{ type: 'partida', id }`, antes que nada más; el puente no da el canal por
abierto hasta leerlo, y si es otra partida `Buzon.empiezaPartida` borra el final,
lo pendiente y lo recogido, y la cola de veredictos se vacía. La misma partida
tras un corte pasajero no borra nada: el veredicto sigue llegando pegado a su
siguiente petición. Tras un final, con el canal muerto, la escucha mira si hay
otra partida en el puerto; si no contesta nadie, sigue contando el final. Lo
vigila `test/puente-mcp.test.ts` con el puente como proceso y dos `AgentLink`
por el mismo puerto.

## El mapa lo diseña el agente, y el plan se valida entero

En `map_generate` el agente **no dibuja**: devuelve un plan declarativo y
`buildMap` lo construye. La frase de arriba del repositorio —«los mapas los
diseña ese mismo agente»— fue aspiracional hasta #27: `map_generate` tenía
esquema, validación, serializador, prosa de respuesta y **ningún llamante**.
Otra capa escrita, probada, documentada y muerta, como la experiencia y el
gremio; y se destapa igual, dándole un usuario.

**Lo primero que aparece al darle uno es que las dos mitades no encajaban.**
`MapPlan` (el tipo, en `core`) y `mapPlanSchema` (el esquema, en el contrato) son
la misma cosa declarada dos veces, y con `exactOptionalPropertyTypes` un
`owner?: PlayerId` **prohíbe** el `undefined` que produce un `.optional()` de
zod. O sea que el plan del agente, parseado por el esquema del propio contrato,
no era asignable al tipo que lo tenía que recibir. Nadie lo notaba porque los dos
nunca se habían encontrado. Cuando una cosa se declara dos veces, lo que las
mantiene en sintonía no es la disciplina: es que alguien las ponga en contacto.

**El plan se validaba en tres cuartas partes, y la que faltaba mataba la
partida.** La paleta que se le manda al agente tiene cuatro listas: el terreno,
los recursos y la facción viajaban por `z.enum`, y la criatura por `z.string()`.
La criatura es el **único texto del plan que el motor ejecuta en vez de leer**:
`buildMap` la copia verbatim y el primer turno de la IA llama a `creature(id)`.
Con `"dragon"` en vez de `"bone_dragon"` —o `"Skeleton"` con mayúscula— el agente
recibía **«Tu plan de mapa entró»** y el proceso moría en el día 1.

Lo grave no era que reventara: era **dónde**. Este repositorio falla ruidosamente
a propósito, pero un fallo ruidoso **después del acuse** llega cuando ya no se
puede corregir, y para el agente es indistinguible de un servidor roto. Un plan
malo tiene que morir en la puerta. Y el defecto es de esta especie exacta: #97
vino a cerrarla —texto del agente usado verbatim— y acotó `id` y `name`, que son
los que **no** revientan.

**La comprobación vive en `validateMapPlan` y no en el esquema, y eso es lo que
manda.** El `z.enum` gana en que el rechazo viaja con la prosa; `validateMapPlan`
gana en que es la **puerta única por la que pasan los dos productores de planes**,
el agente y el procedimental. Un enum habría dejado al generador de casa sin
vigilar justo en el campo que mata el proceso. La regla se anuncia además en
`RESPONSE_FORMAT`, pero eso es el anuncio y no la comprobación: no está en dos
sitios. Y la lista de criaturas se **deriva del catálogo**, porque copiada aquí
sería la cuarta enumeración de lo mismo y se quedaría atrás en silencio.

Buscando más de la misma especie salieron tres puertas de al lado, las tres
abiertas y ninguna ruidosa: los **inicios no ocupaban casilla** (dos héroes
juntos, o uno encima del castillo rival), **`owner` aceptaba cualquier entero**
(un castillo de un jugador que no juega, un tercer bando fantasma) y el servidor
pedía 24×24 y **aceptaba un 128×128** contra su propio docstring.

**Y diseñar el mapa no puede ser repartirse el turno.** `setup.ts` derivaba
`state.players` del **orden** de `heroStarts`, así que con los inicios del revés
el agente abría la partida el día 1 — y la comprobación que había miraba el
conjunto, no el orden. Se ordena en el motor y no se le exige al agente: **una
regla que el motor puede cumplir solo no se delega en quien tiene interés en
incumplirla**. Del orden salían tres cosas y no una —`players`, `heroes` y el
nombre de cada héroe—, así que arreglar solo `players` cerraba el síntoma y
dejaba los héroes mal.

**El respaldo son ocho caminos y los ocho terminan igual.** Sin agente atado,
agente mudo, desconexión en vuelo, respuesta sin forma, esquema rechazado,
`validateMapPlan` rechaza, criatura inexistente, jugadores que no son los de la
partida: en todos arranca la partida con el mapa procedimental, el motivo le
llega al agente y la consola lo dice. **No hay reintento**, igual que con una
acción de aventura ilegal. Lo que sí cambia y hay que saberlo: cuando el mapa lo
pone el agente, **la semilla del servidor ya no reproduce esa partida**, y por eso
lo dice en su consola.

## La tropa se hace héroe (ciclo B)

«Si llegan a nivel máximo se convierten en héroes al llegar a la base. El héroe lo
crea la IA en base al personaje» (`NuevaJugabilidad.md`), y **solo con narrador**:
sin agente la tropa se queda en el 5 y no pasa nada más, así que el banco y el
barrido no se mueven —el ancla `0c8fc759…` siguió igual—.

- **Cuándo**: al empezar el turno del agente y antes de su `adventure_turn`
  (`Director.ascensos`), no al llegar. El núcleo es síncrono y no puede preguntar a
  mitad de un `moveHero`, y como el héroe nace sin movimiento nadie distingue «al
  llegar» de «al empezar el día allí». Cuenta quien esté en la guarnición de la
  base y en la tropa de un héroe propio que esté en ella (`veteranosEnSuBase`); un
  personaje no, porque ya tiene nombre.
- **Una vez por estancia** (`porPreguntar`): a quien ya se preguntó se le recuerda
  mientras siga en la base al empezar cada turno, haya salido bien o mal; si falta
  un turno, se le olvida, y al volver se le pregunta otra vez. Es estado del
  servidor y no del núcleo, por jugador. Con el tope de héroes lleno no se
  pregunta ni se recuerda: la tropa espera su sitio.
- **La regla vive en `game.ts`**: `ascensoBlocker` es la única que decide y su
  frase es la que vuelve al narrador. Las dos buscan al veterano una sola vez
  (`ascensoPosible`), el tope de héroes se escribe en `hayHuecoDeHeroe` —lo leen
  también `hireHero` y el director— y «el héroe del dueño en su pueblo» en
  `heroeEnElPueblo`, que es la misma regla que decide a dónde va un recluta.
  `ascenderVeterano` crea el héroe —id
  `hero-<veterano>`, experiencia del individuo, cifras del contratado
  (`heroeRecienHecho`, la única construcción de héroe: el inicial también pasa
  por ella), sin movimiento, en `casillaDeVuelta`—, saca al
  individuo de donde estaba y emite `hero_promoted`. Que un individuo no dé dos
  héroes no necesita registro: al ascender sale de la tropa.
- **Quien queda en la casilla del castillo recoge la guarnición** (`takeGarrison`,
  la puerta del contratado y del que vuelve vencido): el nacido si nace en ella,
  y si no el héroe del dueño que la ocupaba, con el nacido al lado y sin tropa.
  La primera versión no la recogía nadie —«un héroe sin tropa en su base no corre
  peligro»— y era falso: con el héroe del dueño dentro la ciudad la defiende solo
  él, así que la guarnición dejaba de pelear y la base caía esa noche ante **dos
  campesinos** (semillas 11 y 23 de QA, que sin ascenso aguantan). Decisión del
  usuario: «Recoge la guarnición». El turno del agente lleva además
  `veteransWaiting` cuando un veterano espera por el tope de héroes, que antes
  solo iba a la consola del director.
- **Los tipos de héroe están en datos y son inertes**: los cuatro de Templarios y
  de No muertos, sacados del cuaderno con una expresión regular
  (`tools/datos/tipos-de-heroe.ts` → `data/tipos-de-heroe.json`). `Hero.tipo` se
  guarda, se ve —cabecera del panel, espectador, `heroes[].type` del agente— y no
  da nada hasta el motor de habilidades. El inicial y el contratado llevan el
  primero de su facción.
- **`pnpm qa` lo cruza siempre**: arranca `tools/qa/partida-con-veterano.ts`, que
  es la partida de siempre con un veterano de nivel 5 puesto en la base del agente.
  Para eso el cuerpo de `ws-server.ts` salió a `src/server/partida.ts` como una
  función con un `preparar`, que **solo abre un `import` desde `tools/`**: ninguna
  variable de entorno ni ningún mensaje del cable. El arnés exige el veredicto
  bueno y el héroe en el `adventure_turn` siguiente con su tipo y su historia,
  cruzado una vez con `game_state`; con un tipo
  inventado en la política sale 1. `pnpm capturas` arranca lo mismo y exige ver
  al nacido en el panel del espectador, y sale 1 si tras el ascenso el héroe de
  la casilla de la base se queda sin tropa con guarnición al lado. Medido de
  paso: `pnpm capturas` tarda **~87 s** y no ~40, también en `e9e5d6c` sin este
  ciclo.

## El equipo: botín, armería y héroes que nacen equipados

«Las tropas también ganan experiencia y equipo […] En las ciudades puedes construir
armería y comprar equipo mejorado para la tropa, los héroes ya lo llevan»
(`NuevaJugabilidad.md`). **Todo inventado y provisional**: HoMM2 no tiene equipo de
tropa, y `data/equipo.json` lo dice en su `_comment`.

- **Tres huecos —arma, armadura, accesorio— por individuo y por héroe.** El del
  individuo vive en su hoja (`Veterania.equipo`): un novato es fungible hasta que
  lleva algo, y **equiparlo le abre la hoja** (experiencia 0, id del contador de
  siempre). Así la pieza viaja con él por el mismo camino que la experiencia y
  muere con él. El héroe lleva `Hero.equipo` y una **mochila** sin tope.
- **Las cifras se suman en una puerta**: `sumaDeEquipo` suma las piezas y
  `conEquipo` la aplica; la leen también la ficha del héroe, que enseña «2 (+3)»
  —enseñaba 2 / 2 a un héroe que peleaba con +3/+3—. `conEquipo` lo llaman
  `cifrasDelIndividuo` (catálogo o personaje + veteranía + equipo, la usan
  `troopUnit`, `resolveUnit` y el espectador) y `heroUnit`. Sin piezas devuelve la
  misma referencia del catálogo. Suma ataque, defensa, PV y velocidad (escalones,
  sin pasar de `ultra_fast`).
- **La calidad es una propiedad de la pieza** (decisión del usuario): `comun` y
  `especial` caen como botín; `armeria` —exactamente una por hueco, lo comprueba
  el cargador— la vende la armería y **es el equipo base de todo héroe**, que sale
  de `heroeRecienHecho` (`EQUIPO_BASE`, derivado de la calidad) para el inicial,
  el contratado y el veterano que asciende, cuyas piezas propias pasan a su
  mochila. El héroe solo mejora con lo especial.
- **Botín**: vencer a un grupo de asaltantes (atacando o repeliendo su emboscada)
  o tomar una ciudad **neutral** guarnecida deja una pieza en la mochila del
  vencedor (`repartirBotin`, hecho `loot_found`). **Se decide en un solo punto**,
  `botinDe` al cerrar la batalla: el héroe que gana a un bando neutral que no es un
  monstruo cobra, leído antes de capturar nada. Tira de **su propia corriente**
  —semilla de la partida y `siguienteBotin`— y no de `ctx.rng`: medido, con solo
  el botín el volcado del banco **añade 1 045 líneas `loot_found` y no cambia
  ninguna**.
- **Armería** (`armory`, rasgo `sellsEquipment`, coste inventado): con un héroe
  propio dentro se compra (`buy_item`, hecho `item_bought`). `equip` y `unequip`
  se hacen en cualquier sitio fuera de batalla, y no son hechos: son estado. El
  hueco de `unequip` viaja como **texto** y lo valida `unequipBlocker`: con un
  `z.enum`, un `"casco"` tumbaba el turno entero del agente en vez de descartar
  esa acción.
  Licenciar devuelve a la mochila lo que llevaban, y a igual experiencia se va
  antes el que lleva menos (`elQueSeIria`).
- **Cuatro puertas únicas** que conviene no saltarse: `destinoDeEquipo` lee
  `veteran`/`creature` y dice a quién va la pieza (la usan las dos acciones, sus
  *blockers*, la IA y el panel); `aLaMochila` es la única escritura que añade a
  una mochila —el botín la saltaba mientras su docstring decía lo contrario; hoy
  lo vigila un test de `equipo.test.ts`—; `seVende` dice qué vende la armería; y `describirCoste` (en
  `types.ts`, con `NOMBRE_DE_RECURSO`) es el único formateador de precios del
  núcleo, del agente y del cliente.
- **La IA** (`siguienteDeEquipo`, una acción cada vez): pone lo de la mochila al
  primero al que mejora —el héroe, luego la tropa de más nivel—, y **compra solo
  para quien sobrevive**: si quien recibiría la pieza al repartir es el héroe o un
  veterano de nivel 2 o más y le quedan 2 500 de oro; a un novato, solo con
  `ORO_DE_SOBRA_PARA_NOVATOS` (10 000) tras pagar; y como mucho
  `COMPRAS_POR_HEROE_Y_DIA` (3). Antes compraba 18 piezas al día para una tropa que
  caía al día siguiente: 1 187 compras del banco en 14 semillas, 268 en una. La armería va **la última** de la lista de
  construcción, y es una cifra medida (1 000 semillas, dos tandas): delante de
  `city_hall` o tras las moradas se construía en 82-88 % de las partidas y la
  **morada 5 caía a la mitad** (228 → 105-117 de 1 000); la última, en ~11 %, con
  la morada 5 donde estaba (218 / 246).

Medido con `tools/qa/equipo.ts` y **100 semillas** (decisión del usuario: se
repite a menudo), 02-10-2026:

| | días (mediana / p90 / máx) | sin terminar | gana j0 | emboscadas | botín (especial) | compradas: media · mediana / p90 / máx · partidas con alguna | puestas en tropa al acabar | armería | morada 5 |
|---|---|---|---|---|---|---|---|---|---|
| antes (`2b44289`) | 9 / 18 / 35 | 0 | 46 | 0 | — | — | — | — | 26 |
| equipo base + botín, sin IA de equipo | 9 / 17 / 25 | 0 | 44 | 0 | 5,03 (1,95) | 0 | 0 | 0 | 25 |
| IA que compra sin freno | 8 / 15 / 30 | 0 | 43 | 0 | 5,01 (1,95) | 2,46 · 0 / 0 / 111 · 4 | 3,08 | 8 | 25 |
| ídem, semillas 101-200 | 8 / 19 / 42 | 0 | 50 | 0 | 5,34 (2,03) | 9,41 · 0 / 11 / 268 · 10 | 3,83 | 15 | 18 |
| **final** (compra solo para quien sobrevive) | **8 / 15 / 30** | **0** | **43** | **0** | 5,01 (1,95) | **0,69 · 0 / 0 / 24 · 4** | 2,35 | 8 | 25 |
| final, semillas 101-200 | 8 / 19 / 43 | 0 | 49 | 0 | 5,34 (2,03) | **1,52 · 0 / 3 / 66 · 10** | 2,54 | 15 | 18 |

**La media de compras miente si se publica sola**: con la IA sin freno, 2,46 por
partida eran 4 partidas de 100 comprando y 96 sin comprar nada; la de 268 era una
sola semilla atascada en comprar, atacar, perder y volver. Lo que queda en la cola
(66 en la 185) es una partida de 43 días con oro de sobra: el tope de 3 al día es
el que la frena.

Barrido 0/40 y 0/100. El banco se re-ancló dos veces en el ciclo, ninguna
commiteada sola: `7c24a8b4…` con la forma comprobada por pasos, y `bd4d4a13…` al
frenar las compras, con **186 de 200 semillas idénticas** y en las 14 restantes el
primer hecho distinto **un `item_bought` que ya no ocurre** (ver
`tools/qa/banco.ts`). Lo que no está: las armas mágicas y las misiones
secundarias, la moral de las piezas, y que `unitPower` mire ataque y defensa —la
IA y la emboscada solo ven las piezas de PV—. Y dos cosas que se dejan como están
hasta que el usuario decida: **la armería se levanta en 8 de 100 partidas** (puesta
antes en la lista sale en el 82-88 %, pero la morada 5 cae a la mitad), y **las
piezas de velocidad suben también el movimiento en el mapa**, porque cuentan para
la criatura más lenta (1100 → 1210 con botas en los cinco de la tropa inicial).

## Ver jugar al agente, y el marcado que eso abrió

La primera línea de este documento dice que el proyecto es un banco de pruebas
para un juego con IA. Hasta #30, **la demo no se podía enseñar**: ver jugar al
agente era leer los `console.log` del servidor. El canal de espectadores llevaba
desde su primer día emitiendo un snapshot completo en cada turno y **no lo leía
nadie**, que es el mismo patrón de `map_generate` y del gremio de magia — otra
capa escrita, probada y sin usuario.

**Y no se enseña el mapa entre turnos: se enseñan las batallas.** El aviso llegó
del crítico antes de que nadie escribiera código: con un fotograma por turno, en
la cobertura de `pnpm qa` serían **3 diapositivas y cero batallas**, con 15 de las
18 decisiones del agente resueltas fuera de cámara. La frecuencia se eligió con el
número delante —un fotograma son **19,5 KB y 0,044 ms**, y `broadcast()` ya sale
antes si no mira nadie—, así que va **por acción aplicada**. Medido después: **61
fotogramas por partida, 43 con batalla**, contra 7 y ninguno.

Lo que **no** se ve, dicho aquí y no descubierto luego: las batallas que no se
queda nadie (`resolvePendingBattle`, `autoResolve`) se resuelven dentro de `core`
y no dan ni un fotograma. Enseñarlas exigiría que `core` conociera a un
observador, y eso es otra decisión (#103).

**El espectador no pasa por `session.ts` y es lo correcto**, aunque desmienta una
frase que este documento llevaba tiempo prometiendo. No juega: no manda un solo
intent. Tiene su propia entrada, `espectador/adaptar.ts`, que es **la inversa
exacta** de la serialización del servidor y el único sitio que rehace los dos
`Set`. Y el `view` del snapshot dejó de ser `unknown`: se declara una vez, junto a
su único constructor, porque un lector que parsea `unknown` reimplementa el
esquema del emisor por su cuenta — dos declaraciones de lo mismo que nadie
compara, que es justo lo que acababa de morder en `MapPlan`.

### La puerta del marcado

Abrir el visor obligaba a cerrar #63 antes, porque el espectador pinta **nombres
que escribe el agente**. El arreglo no fue un `escape()`: **un `escape()` que hay
que acordarse de llamar no es un guardia**, porque la primera vez que alguien
añada un campo se le olvidará. Es una plantilla etiquetada, `html.ts`, y sus
piezas son las que son por un motivo:

- **Se escapa según DÓNDE cae el hueco**, deducido de la porción estática anterior
  y cacheado por sitio de llamada. Texto y atributo son **dos funciones de
  verdad**: en un atributo hay que escapar además `"` y `'`.
- **Lo ya escapado se reconoce por un símbolo privado del módulo**, no por un tipo
  que se borra al compilar. Sin eso, lo anidado se escapa **dos veces** — que era
  la trampa que avisó la crítica.
- **Lo que el analizador no entiende lanza**, nombrando el fragmento: atributo sin
  comillas, `on*`, `<script>`.
- Y `href`/`src`/`style` **no se escapan: se validan en su propio idioma**
  (`srcDeImagen`, `fondoDeColor`, `urlDeImagenSegura`), porque escapar comillas no
  para un `javascript:`. Esa la encontró el ingeniero: el plan los declaraba
  prohibidos y `renderTopbar` ya interpolaba en dos de ellos.

**El criterio de aceptación fue de máquina y no «se ve igual»**: un ancla generada
del código de ANTES —las cuatro escenas, con nombres ajenos dentro— que se
reproduce **byte a byte** después de reescribir las 15 funciones y sus 168 huecos.

Y la puerta destapó dos bugs que un `escape()` jamás habría encontrado, los dos
por cambiar cadenas por objetos: `crecimiento || '<div>Sin moradas</div>'` era
correcto con cadenas y **falso con marcado** —un fragmento vacío es un objeto,
`||` lo da por bueno siempre, y «Sin moradas» no se habría pintado nunca sin que
`tsc` dijera nada—; y `ETIQUETA_EFECTO` estaba tipada `Record<string, string>`, o
sea `string | undefined` con `noUncheckedIndexedAccess`, que habría pintado la
palabra «undefined» en el parte de guerra.

### Las dos lecciones que costaron una vuelta de QA

**Una defensa que convierte un caso soportado en uno imposible es peor que no
poner ninguna.** El espectador escribía `bandera(dueños[s.side] ?? -1)`, y
`playerColor(null)` **ya devolvía el gris de neutral en su primera línea**. Ese
`?? -1` cogía un valor que la función sabe manejar y lo convertía en uno que no:
`-1 % 4` en JavaScript es `-1`, así que `PLAYER_COLORS[-1]` era `undefined`,
**tapado por un `as string`**. Igual que el tercer `throw` de `frontera.ts`, un
índice fuera de rango que se perdía en silencio; hoy `playerColor` lanza diciendo
el número.

**Y meter una función que lanza en un bucle que no las esperaba cambia su
física.** El ciclo metió tres —`pintar`, `srcDeImagen`, `fondoDeColor`— dentro de
dos bucles de `requestAnimationFrame` donde antes solo había asignaciones a
`innerHTML`, que no lanzan. Y como `dibujar()` se re-armaba **en su última
línea**, la excepción mataba el bucle entero: lienzo congelado, panel vacío, y la
barra diciendo tan tranquila «Mirando la partida». Ahora el bucle se re-arma en un
`finally`, el fallo **se dice** y al recuperarse se desdice. La causa de que
llegara al navegador un fallo que tres líneas de test cazan es que el panel vivía
en un módulo que toca `document` al importarse: **por eso salió a
`espectador/paneles.ts`, que es puro.**

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

## El turno en tramos y la carga en línea recta

Lo pidió el usuario jugando (02-10-2026): «si quiero reposicionarme y atacar desde
otro ángulo no puedo». **Las dos reglas son nuestras, no de HoMM2**, y se citan así.

- **`move` ya no cierra el turno**: gasta casillas de la velocidad y la unidad
  sigue activa para moverse otra vez, golpear o terminar (`end_turn`, acción nueva
  del motor, del agente y del cliente: botón y Espacio). Se cierra solo cuando ya
  no le queda ni casilla ni enemigo al lado. **Atacar lo cierra.** Tras moverse
  **no se dispara, ni se defiende, ni se espera** (decisión del usuario): ni se
  ofrece en `legalActions` ni se acepta.
- **Lo gastado vive en `BattleState.turno`** (`{ n, stack, gastado }`), un objeto
  que solo crea `advance`, uno nuevo en cada activación y con su **ordinal** `n`.
  Sustituye a `activeId` y no hay nada que resetear: la moral extra y `wait`
  estrenan turno con 0. La velocidad se lee al preguntar (`pasosQueQuedan`), así
  que una Lentitud a mitad de turno recorta lo que queda. Qué se puede hacer
  tras un tramo lo dice **solo** `legalActions`: el cierre automático
  (`quedaAlgoQueHacer`) y la cola de la IA la leen en vez de reescribirla.
- **La carga es por tramo, en recta y CONTRA alguien** (`cargaDesde`, la única
  regla de CUÁNDO, que recibe el objetivo; el tope lo pone `cargaEfectiva`, en
  `damage.ts`, y la prosa del agente interpola las tres constantes): un `attack`
  con `from` carga si `from` está en una de las **6 rectas** del hexágono desde
  donde está la unidad ahora, sin unidades en medio, a 3 casillas o más, **y la
  casilla que sigue a `from` en esa recta es del objetivo** (`siguienteEnRecta`;
  de un enemigo de dos casillas basta una). «El enemigo tiene que estar en la
  línea recta, no se puede cargar contra un enemigo que esté al lado»: llegar a
  la recta y girar no carga, y pegar al que ya tienes al lado tampoco. El usuario
  dijo «8 direcciones», pensando en casillas cuadradas; en hexágonos las rectas
  sin giro son 6, y se le comunica. Lo que se **enseña** sale de
  `casillasDeCarga`, que llama a la misma función que cobra y devuelve **contra
  quién y desde dónde**: en el cliente, el enemigo cargable en naranja y la
  casilla de su recta con su «»N», que pasa a «+N %» al señalar a ese enemigo; al
  agente, `chargeFrom` con su `target`. **Una casilla vacía de la recta no
  promete nada**: el clic ahí solo mueve. Las rectas las da `rectaLibre`
  (`board.ts`), que comparte con `siguienteEnRecta` la decisión de qué es una
  recta.
- **El ángulo se elige al pasar el ratón** (`escenas/angulo.ts`, puro): sobre un
  enemigo se resaltan todas las casillas desde las que se le golpea y la más
  cercana al puntero se marca fuerte; la barra dice «Golpearías desde (c,r)». La
  distancia se mide **en el plano y no en píxeles**: con el tablero aplastado a
  25°, en píxeles la casilla del oeste no ganaba nunca dentro del hexágono del
  enemigo. `accionContra` ya no elige sola el `from`, y `pnpm capturas` usa la
  misma función para su espejo.

Se hizo en tres pasos, verificados por separado: los tramos solos dejaron el
banco **byte a byte** igual (`bd4d4a13…`); la carga en recta tocó 15 semillas,
todas con una carga con `from` (cargas cobradas en 200 partidas: 109 → 33); y la
IA que **pega tras un tramo si ahora alcanza** gana **51,08 % ± 0,25** en 5 000
parejas. La otra candidata —colocar a la caballería en un tramo para cargar en
el siguiente— dio **49,39 % ± 0,18**, entera por debajo, y no entró. Anclado una
vez, `656e567e…`; 100 semillas en 28×28: 8 / 15 / 30 días y j0 43 antes, 8 / 16 /
25 y j0 43 después.

**La primera redacción de la carga no miraba al enemigo, y lo encontró QA
jugando** (H1): la persona veía casillas naranjas «desde aquí golpearías
cargando 5» sin nadie delante, y el clic ahí solo movía y gastaba la carga. La
regla del objetivo la puso el usuario después de verlo. Re-anclado una vez,
`290812e6…`, y **con la línea del objetivo quitada sale `656e567e…` exacto**, que
es lo que prueba que no cambió nada más: 194 semillas idénticas, las 6 que
cambian entre las 19 con un golpe de caballería con `from`. Y la cifra incómoda:
**en el banco las cargas cobradas pasan de 28 de 218 golpes a 0 de 203** —la IA
elige primero a quién y después desde dónde, y en esos golpes el elegido nunca
estaba en la recta; en 10 de los 203 había una carga contra OTRO enemigo—. Lo que
se hizo después está en «La IA busca la carga», aquí abajo. 100 semillas en 28×28:
8 / 16 / 25 y j0 43, igual antes y después.

Del mismo pase de QA: **el motivo de no poder actuar contra un enemigo lo escribe
el núcleo** (`ataqueBlocker`, sobre `disparoBlocker`, que es también la única
redacción de cuándo se dispara para la lista y para el rechazo), y el cliente ya
no le dice «no alcanzas a esa unidad» a un arquero que se acaba de mover; «le
queda 1 casilla» va en singular (`quedanCasillas`); y Espacio con el foco en un
botón pulsa el botón.

Y una trampa que mordió dos veces en el mismo ciclo, en el arnés de `pnpm qa` y
en el de capturas: **«la misma unidad sigue activa» no es «el turno sigue
abierto»**. La moral extra le abre a la misma unidad un turno NUEVO, con 0
gastado, y los dos guardias daban verde con él. Cada sitio lo deducía a su
manera —el director por identidad del objeto, capturas por lo gastado que
crece, `verify-agent` por la nota, la caché de la sesión por la unidad—, y por
eso hoy hay **un ordinal**: `turno.n`, que pone `advance`, se compara con
`mismoTurno` y viaja al agente como `turnId`. Visto morder: con `advance`
reutilizando el ordinal para la misma unidad cae el test de la moral extra, y
con `verify-agent` emparejando por unidad en vez de por `turnId` la sonda que
invierte la medida del director **vuelve a salir verde** con una moral extra
(«defender-heroe, le quedan 4»), que es exactamente el fallo de entonces.

Los topes de jugadas de los cuatro bucles que juegan una batalla acción a acción
—`autoResolve`, el director, la sesión y `enfrentamiento.ts`— son uno,
`MAX_JUGADAS`, derivado de `MAX_ROUNDS`.

### La IA busca la carga

Decisión del usuario sobre ese 0 de 203: «Sí, en este ciclo», con la vara de
siempre —una candidata entra solo si `enfrentamiento.ts` da, en 5 000 parejas, el
intervalo **entero** por encima del 50 % contra la IA de `c72bcd9`—. Se midieron
dos, por separado:

| Candidata | 5 000 parejas | 2-0 · 1-1 · 0-2 | ¿Entra? |
|---|---|---|---|
| **Paso de lado**: si al objetivo no se le carga desde aquí, un tramo que lo deja en recta y la carga en el tramo siguiente del mismo turno | **50,08 % ± 0,07** (10 000: 50,09 ± 0,05) | 10 · 4 988 · 2 | **sí** |
| Contar la carga al elegir **a quién** pegar | 50,05 % ± 0,08 | 10 · 4 985 · 5 | no: toca el 50 |

Entró la primera (`pasoParaCargar`, en `ai/tactics.ts`) y **por poco**: lo que
decide son 12 parejas de 5 000, porque en las batallas de este banco una unidad
con `charge` tiene una carga a mano muy pocas veces. La recta la decide
`cargaDesde` sobre la unidad **puesta** en la casilla candidata —la misma regla
que cobra—, y la función solo enumera casillas. Tres condiciones, cada una vista
morder con su test: que desde aquí no haya ya carga contra el objetivo (si la
hay, la cobra `mejorCarga`), que **el paso y la recta quepan en lo que queda**
—el golpe es de este turno; la candidata del ciclo anterior, que se colocaba un
turno para cargar al siguiente, dio 49,39 %— y que la casilla **no toque a otro
enemigo**, porque desde ahí el tramo siguiente le pegaría a ese. Sin el rasgo no
recorre nada.

La segunda **no entró y se queda fuera** aunque, puesta encima de la primera,
gane: con las dos, 50,23 % ± 0,11 contra `c72bcd9` y 50,15 ± 0,10 contra el paso
de lado solo. La vara era contra `c72bcd9`, y cambiarla después de medir sería
mover la portería; queda para que lo decida el usuario.

`enfrentamiento.ts --carga` mide la regla contra la IA de hoy con el rasgo quitado
un instante cuando elige un `move` de una unidad con `charge`, y **eso es** la IA
de `c72bcd9`: contra una copia congelada de aquel `tactics.ts` sale 0 · 5 000 · 0.
Con el paso de lado dentro, la cifra por defecto (el segundo tramo) pasa de 51,08 a
51,39 %, porque el rival que cierra tras moverse tampoco puede dar el tramo de
después del paso.

Re-anclado una vez, `da7609d5…`. Forma del diff contra `290812e6…`: **194
semillas idénticas**, las 6 que cambian están entre las 17 con algún paso de lado
y ninguna diverge antes del primero; el primer hecho distinto es una consecuencia
de batalla. **Cargas cobradas en el banco: 0 de 203 → 64 de 222** (58 de 3, 6 de
4). Una semilla con otro ganador (j0 95 → 96), duración 9 / 17 / 37 igual,
`autoResolve` sin coste medible. 100 semillas en 28×28: `8 / 16 / 25`, 0/100, j0
43, **igual** que antes; barrido 0/40 y 0/100, igual.

Del mismo pase, dos menores de QA en el cliente, sin mover el ancla: la línea de
ayuda de la carga solo sale si la unidad activa tiene `charge` (N2), y al pasar el
ratón por un enemigo al que no se puede ni disparar ni golpear, la barra ya dice
el motivo del núcleo —el mismo `attackRejection` que escribe el clic— y lo quita
al salir (N3).

## La partida sabe acabarse, y el mapa no da para más

Dos cosas de esta tanda, y la segunda es una medida y no un cambio.

**El tope de días estaba declarado tres veces y ninguna en `core`** —`ws-server.ts`,
`tools/qa/partidas.ts` y un `playAiGame(state, ctx, maxDias = 200)` cuyo valor por
defecto llevaba tiempo **muerto**, porque los diez llamantes pasaban número—. Y al
saltar, **`state.finished` se quedaba en `null`**: el núcleo sostenía que la partida
no había terminado. Eso se tapaba con un `partidaTerminada` suelto en el servidor y
con un `winner: number | null` en el protocolo, los dos con su comentario
explicando el parche.

Ahora el tope es `GameState.maxDays`, la regla vive en `advanceDay` —que **mira
antes de incrementar**, así que el último día jugado es `maxDays` y `game_over`
sigue siendo el último hecho— y `finished` es `{ winner: PlayerId | null } | null`,
con lo que `!== null` significa por fin «terminó». Los tres bucles pasan a
`while (state.finished === null)` y **ninguno puede olvidarse de la condición**: la
alternativa —una función que cada bucle llame al salir— dejaba el *cuándo*
declarado tres veces otra vez, que es el bug de hoy subido un piso. `HEROES_MAX_DAYS`
y las 300 del banco siguen valiendo: son configuración, no la regla. **El ancla del
banco no se movió**, porque ninguna de las 200 partidas roza el tope.

**Y `null` no es lo mismo que `-1`, que es lo que costó dos vueltas.** Con
`finished.winner` triestado, `winner === viewer` **compila y miente**: `tsc` no
caza al lector que se olvida de la tercera respuesta, así que los tres del cliente
hubo que mirarlos a mano. La clasificación vive hoy en `src/client/desenlace.ts`, y
tiene **cuatro** respuestas y no tres — la cuarta se escapó en la primera vuelta y
la encontró QA: quien mira sin llevar bando (`NADIE`, el espectador) no pierde el
empate **ni pierde la partida que gana otro**, y estaba viendo «Fin de la partida»
en rojo de derrota en la misma pantalla que decía «has ganado». La respuesta a «no
tienes bando» no era «perdida»: **faltaba una respuesta**. Por eso `NADIE` vive
ahora en `desenlace.ts`, que es el único sitio del repositorio donde «no es tu
bando» y «no tienes bando» dan resultados distintos; en el resto de la crónica el
centinela contesta bien por accidente, porque allí la pregunta ya es de dos.

**Las tablas son el guardia, y un `switch` no lo era.** Los tres rótulos son
`Record<Desenlace, string>` porque un `switch` de sentencia —el que asigna y hace
`break`— deja pasar un desenlace nuevo **sin poner nada rojo**: comprobado
plantando un cuarto miembro en la unión, salía **un** error (el `switch` que sí
retorna) y no tres. Y el mismo cambio destapó dos aserciones convertidas en
tautologías —`expect(state.finished).not.toBeNull()` es hoy verde por
construcción— y una premisa caducada: `day_start` había dejado de ser el único
hecho sin protagonista, y el guardia seguía verde porque su semilla acaba por
conquista. Se reparó **afirmando la regla y no eximiendo el caso**: el `actor` de
`game_over` tiene que **ser** el ganador, `null` incluido. Bajar el listón para que
cupiera el caso nuevo habría sido desafilarlo.

**Y una validación que vivía en la puerta y no en la casa.** `enteroDelEntorno`
rechazaba `HEROES_MAX_DAYS=0` con una frase buena mientras `newGame({maxDays: 0})`
lo aceptaba y jugaba un día en silencio: la misma regla con dos severidades según
por dónde entres. Hoy lanza `createGame`. Y el parser mira `isSafeInteger` y no
`isInteger`, porque `1e21` es entero y produce **justo la partida eterna que la
validación existe para evitar** — `day >= 1e21` no se cumple nunca. De paso se
descubrió que la variable de al lado, `HEROES_WAIT_AGENT_MS`, **no validaba nada**:
un `NaN` hace que `setTimeout` dispare a 1 ms, el servidor concluye «no ha venido
nadie» y **juega la partida entera sin el agente**. Node avisa con un
`TimeoutNaNWarning` que se pierde entre las trazas, así que el fallo llegaba
disfrazado de partida sin agente. Las cuatro variables pasan hoy por el mismo
parser, en `src/server/entorno.ts` —que se llamaba `puertos.ts` y ya no contiene
solo puertos—, y viven **donde hay test**: `ws-server.ts` arranca el servidor al
importarlo, así que lo que se quedara allí no lo podía probar nadie.

**`pnpm qa` bajó de 5,4 s a 3,1 s**, y solo 0,2 de esos 2,3 son de #62. El resto
era que el puente MCP se lanzaba con `npx tsx` en vez de `tsx`: ese proceso de más
hace que las dos carreras de 2 s encadenadas del cierre del SDK se agoten enteras,
porque el nieto retiene las tuberías. La cobertura no se movió — una mejora de
tiempo que recorta cobertura es una regresión disfrazada—. Y murió un comentario
que la medida desmintió: el puente **no** muere por el EOF de su stdin, como decía;
muere por el `SIGTERM` de dos segundos después.

**Y de 3,3 s a 1,3 s (08-10-2026, #113).** Esos dos segundos eran la primera carrera
del cierre del SDK, que se agotaba siempre: el `StdioServerTransport` no escucha el
`end` de stdin y el WebSocket con la partida mantenía vivo el puente. Ahora el
puente escucha ese EOF, cierra su WebSocket y sale solo (~15 ms medidos desde
`close()`). La partida no se toca: sigue viva tras un `game_over` a propósito. Lo
vigila `test/puente-mcp.test.ts`, que cierra el stdin y no manda señales.

### No faltan días: falta un mapa que escale

**Lo que #23 pedía —los 7 días de gracia— no se hizo, y el motivo es que la premisa
era falsa.** `Kingdom::isLoss()` de fheroes2 es `castles.empty() && heroes.empty()`
y elimina **en el acto**: `checkDefeat` ya lo reproducía exactamente. Los 7 días
existen (`GetGameOverLostDays()`) pero son de **otro** estado —sin castillos y
**con** héroes—, donde aquí el jugador es inmortal, así que **copiar el original
acorta partidas, no las alarga**. Además de ese estado no se puede volver
(`hireHero` exige pueblo propio) y, prototipada, la gracia no movía **un solo
ganador** de 200 a cambio de dos anclas rotas y un 76 % más de crónica.
Implementarla habría sido vender como fidelidad lo contrario de lo que hace la
fuente.

**Y el mapa se midió en vez de elegirse**, tres veces. La primera fue con el
generador de esquinas, antes de la red de nodos, y dejó el 24×24; la segunda es
del ciclo de los asaltantes («más distancia entre bases… que lo decida la
medida») y dejó el 28×28; la tercera, **la que manda hoy**, es de los mapas densos
y dejó **el 34×34** (`LADO_DEL_MAPA`, en `map/generate.ts`; el servidor lo lee de
ahí en vez de copiarlo) — está al final de esta sección. Las dos tablas de aquí
abajo son historia, con su fecha. Se mide con `tools/qa/tamanos.ts`, 1 000
semillas por lado, con asaltantes y —en una copia de `main` sin ellos— sin:

**La cuarta (#226, 09-10-2026) no es medida sino decisión del usuario**: «mismos
elementos en un mapa con más espacio para que los espacios entre caminos sean más
grandes». `AREA_POR_REGION` 300 → 450 (ahora en `core/escala.ts`), 34×34 → 42×42 con
5 regiones por bando, y la marcha ×√1,5 (`marchaALaEscala`; la tabla de fheroes2 queda
como cita). En `tamanos.ts 5 1000`: 8 / 14 / 45 → 8 / 16 / 34 días, 0 sin terminar en
los dos, j0 571 → 603, emboscadas 0 en los dos. Sin escalar la marcha, el banco iba
de 8 / 13 / 19 a 10 / 17 / 30; con ella, 8 / 14 / 31. `pasosPorDia` de los asaltantes
sigue en 2 (2 × 1,22 redondea a 2, y la IA no sufre emboscadas en ninguno de los dos
mapas). El radio de exploración (4 y 5, de fheroes2) no se escaló.

| lado | con asaltantes: mediana / p90 / máx | sin terminar | gana j0 | asaltos a la base por día | al llegar: individuos · fuerza | emboscadas por partida | sin asaltantes: mediana / p90 / máx |
|---|---|---|---|---|---|---|---|
| 24 | 7 / 13 / 60 | 0 | 389 | 0,148 | 5 · 430 | 1,16 | 4 / 9 / 22 |
| 26 | 8 / 15 / 102 | 0 (**1** en las semillas 1 001–2 000) | 419 | 0,126 | 5 · 460 | 1,10 | 5 / 11 / 34 |
| **28** | **8 / 16 / 49** | **0** (y 0 en 1 001–2 000: 9 / 17 / 56) | 389 | 0,113 | 5 · 460 | 1,28 | 5 / 12 / 74 |
| 30 | 10 / 19 / 66 | 0 | 398 | 0,099 | 4 · 500 | 1,24 | 6 / 13 / 91 |
| 32 | 10 / 20 / 51 | 0 | 420 | 0,090 | 5 · 523 | 1,10 | 6 / 15 / 66 |
| 36 | 11 / 21 / 87 | 0 | 438 | 0,082 | 4 · 535 | 1,16 | 7 / 18 / 300 (1 sin terminar) |

**La regla la fijó el usuario antes de medir**: el menor lado con mediana ≥ 8, p90
≤ 20 y 0 sin terminar en 1 000 semillas. El 26 la cumple en las primeras mil y **la
rompe en las siguientes** (la 1 048 se queda en tablas: dos héroes con la tropa
llena de campesinos que no pueden cambiar por nada mejor, y grupos de vampiros
entre medias), así que la mediana justo en el umbral era suerte; el 28 la cumple en
las dos tandas. El prototipo decía 32 y se equivocaba por la misma razón por la
que se vuelve a medir: medía otra implementación. **Lo que compran los asaltantes
lo compra sobre todo el tamaño**: en el 28 la mediana pasa de 5 a 8 días con
ellos, y de 4 a 5 sin ellos al ampliar de 24 a 28.

**«Llegas con poca gente» no sale como se pidió, y el usuario lo aceptó así**: los
individuos con los que un héroe llega a la base rival no bajan (5 → 5 de mediana,
del 24 de hoy al 28 de ahora) y su fuerza **sube** (355 → 460), porque la IA ya no
va directa: rodea las regiones peligrosas y llega más tarde y más fuerte. Lo que sí
baja son **los asaltos a la base por día, 0,221 → 0,113**. El banco juega el 28 y
tarda ~3,4 s, desde ~2,15.

**Y la tabla se volvió a medir cuando la IA dejó de «ir igual»** (el repliegue y
licenciar, más abajo), porque la regla del lado se aplica a la IA que juega y esa
había cambiado. Mismas columnas, 1 000 semillas, dos tandas en 26 y 28:

| lado | mediana / p90 / máx | sin terminar | gana j0 | asaltos a la base por día | al llegar: individuos · fuerza | emboscadas por partida |
|---|---|---|---|---|---|---|
| 24 | 6 / 11 / 60 | 0 | 498 | 0,159 | 4 · 510 | 0 |
| 26 | 7 / 14 / 40 · 7 / 14 / 300 | 0 · **1** | 522 · 556 | 0,130 | 4 · 510 | 0 |
| **28** | **8 / 15 / 35 · 8 / 15 / 117** | **0 · 0** | 505 · 553 | 0,120 | 4 · 526 | 0 |

**El 28 se queda**, y por la misma regla: el 26 no llega a la mediana de 8 en
ninguna de las dos tandas y deja una sin terminar; el 28 la cumple en las dos.

**Y con los mapas densos (03-10-2026) se midió por tercera vez**, porque el mapa
dejó de ser el mismo: fronteras de 2-3 casillas, obstáculos que bloquean, caminos
y **más área por región** (`AREA_POR_REGION` 144 → 300, la palanca que eligió el
usuario: «los mapas actuales son muy pequeños, no hay problema por agrandarlos»).
Con 144, en 30 semillas de 36×36 salían 29 sin mapa: las regiones se quedaban en
25-35 casillas pisables y no cabían los obstáculos. Mismas columnas, 1 000
semillas, dos tandas en 32, 34 y 36:

| lado | mediana / p90 / máx | sin terminar | gana j0 | asaltos a la base por día | al llegar: individuos · fuerza | emboscadas por partida |
|---|---|---|---|---|---|---|
| 30 | 6 / 11 / 20 | 0 | 483 | 0,152 | 4 · 544 | 0 |
| 32 | 7 / 13 / 24 · 7 / 13 / 27 | 0 · 0 | 472 · 468 | 0,134 | 4 · 585 | 0 |
| **34** | **8 / 15 / 45 · 8 / 15 / 30** | **0 · 0** | 456 · 489 | 0,119 | 4 · 541 | 0 |
| 36 | 9 / 16 / 44 · 9 / 16 / 60 | 0 · 0 | 461 · 482 | 0,112 | 4 · 580 | 0 |
| 38 | 9 / 18 / 49 | 0 | 543 | 0,102 | 4 · 581 | 0 |

**El 34 es el lado de hoy**: el 32 se queda en mediana 7 en las dos tandas, y el
34 cumple la regla en las dos. Con mapas más grandes la regla sigue marcando el
**mínimo**, no el lado: subir es posible el día que se quiera, y la tabla dice
cuánto se alarga la partida.

La vuelta de simplify del mismo día cambió cómo se viste el mapa y con él el de
cada semilla, así que el 34 se volvió a medir: **8 / 15 / 22**, 0/100 y j0 58 en
las 100 primeras (9 / 16 / 28, 0/100, j0 48 en las 101-200) y **8 / 15 / 31,
0/1 000, j0 482** en mil. El 32, en las 100 primeras, sigue en mediana 7
(7 / 14 / 21). El lado se queda.

Y otra vez con la vuelta 1 de QA del mismo día (caminos en árbol, frontera
forzada frente a los pasillos largos y la regla de la IA encerrada, abajo), con
100 semillas como pide la regla para iterar: el 34 da **8 / 16 / 25** y j0 53 en
las 100 primeras y **9 / 15 / 21**, j0 47, en las 101-200, 0/100 en las dos; el
32, 8 / 13 / 20 y **7** / 13 / 17. La regla no cambia de lado: el 34 se queda.

## El mapa es una red de nodos (fase 2a)

Desde la fase 2a de NuevaJugabilidad («la red») el mapa no es un campo abierto con
dos castillos en las esquinas: son **regiones cerradas por cordillera o río**, y los
únicos pasos entre ellas son los **nodos**. Una ciudad **es** un nodo —la base
también—, y se toma venciendo su guarnición o entrando si está vacía
(`captureTown`, la de siempre); un nodo que no es ciudad se toma **pisándolo**, de
camino o parando (`captureNode`, su único escritor, y el hecho nuevo
`node_captured`, que sustituye a `mine_captured`).

**Nada del territorio se guarda.** `src/core/map/regiones.ts` deriva la forma de
la red del terreno y de los objetos —una región es la componente 8-conexa de lo
pisable **sin los nodos** que contiene la casilla que la declara—, y la memoiza por
mapa porque ni el terreno ni los nodos cambian en una partida. **Lo que cambia se
lee en una sola foto, `territorio(state)`**: el dueño de cada nodo, el de cada
región —el común de **todos** sus nodos, y esa regla se escribe en un solo sitio,
`dueñoComun`, que la IA también pregunta en vez de copiarla— y lo que cada jugador
tiene unido a su base, que es una búsqueda desde la base por regiones y nodos
propios. La renta sale de ahí y de nada más: una ciudad cobra si está unida, y una
mina produce para el dueño de su región **solo si está unida** —el usuario corrigió
el plan: una región cerrada pero desconectada no da nada—. La mina y el pueblo ya
no tienen dueño propio.

**La estructura se comprueba, no se supone**, y en la puerta de los dos
productores (`validateMapPlan` → `problemasDeRed`): una componente con dos semillas
son dos regiones que se tocan sin nodo, y el rechazo dice **por dónde** —busca en
primero el paso en diagonal entre dos esquinas de muro —un muro en escalera o en
diagonal pura se cruza por la esquina, y ahí nombra las dos casillas de ese paso—,
y si no lo hay, en el camino más corto entre las dos semillas la primera casilla con
muro a los dos lados, que es la forma del hueco recto—; una zona pisable sin región, un nodo de grado
1, dos nodos vecinos o una región sin nodos también se rechazan con su sitio.
`buildMap` **ya no sanea en silencio** el terreno bajo un objeto: la única casilla
que un muro cede es la de un nodo o una ciudad, y es una regla declarada.

**El generador es Voronoi con semillas en espejo**: las fronteras de las celdas se
trazan como un muro fino de una casilla, cada pareja de regiones vecinas tiene un
paso en mitad de su frontera, y **cada cruce de grado ≥ 3 que no es base es una
ciudad neutral**. Hubo un límite —las dos más cercanas a cada base— puesto con la
regla de derrota vieja; medido otra vez con «perder la base elimina» no cambiaba
nada (1 000 semillas: mediana 4, p90 7, máximo 20 con él y sin él) y se quitó. El
espejo de los muros no existe (reflejar un muro de una casilla abre huecos), así
que el equilibrio se pide por **perfil**: las dos bases ven sus dos ciudades más
cercanas a los mismos saltos. **El generador no lleva una segunda implementación de
la red**: cada intento se construye como mapa provisional y lo leen `estructura` y
`problemasDeRed`, las mismas que leen y validan el plan del agente. Los dos caminos
disjuntos de cada base a sus ciudades cercanas no se comprueban al generar —un
bucle lo hacía y en 1 050 planes no rechazó ninguno—: los vigila, y muerde, el test
que audita 200 semillas en `LADO_DEL_MAPA` y 20 en 48×48 **desde fuera**.

**Y desde los mapas densos (03-10-2026) esa red fina se valida y después se
viste** (`map/vestir.ts`), que es lo que hace segura la mitad que daba miedo:
vestir solo convierte casillas pisables en barrera, y añadir muro nunca abre un
paso. El grafo de regiones y nodos es el que validó el perfil.

- **Cinco barreras distintas en el motor** (`BARRERAS`, en `terrain.ts`):
  `mountain`, `water`, `forest`, `cliff` y `wall`. Hoy las cinco bloquean igual;
  son distintas porque la **infiltración** podrá cruzar unas y otras no (decisión
  del usuario). `isWalkable` se deriva de la lista, y el esquema, la paleta, la
  validación y las dos prosas del agente la interpolan. Y el tipo lo dice: lo
  que se pisa es `Suelo` (`Exclude<TerrainKind, Barrera>`), así que
  `TERRAIN_COST`, `costeDeEntrada` y las tablas de `data/barreras.json` no
  llevan entradas muertas para lo que no se pisa.
- **La barrera de cada frontera sale de los suelos de los dos lados**
  (`data/barreras.json`, inventado y provisional): cada suelo da sus candidatas
  con peso y la frontera sortea con la suma. Y **al menos cuatro tipos por mapa**,
  construidos y no filtrados: primero se reparten cuatro barreras distintas a
  cuatro fronteras que las admitan (un emparejamiento) y el resto se sortea. Si
  los suelos del mapa no admiten cuatro, ese vestido no vale y lo dice. **Y
  cuatro que se vean**: solo cuenta como candidata una frontera con muro fino
  que **sobreviva** —una pareja cuyo muro eran solo casillas de nodo recibía su
  barrera y `buildMap` la abría entera (QA, semillas 864 y 986: tres tipos)—, y
  cada barrera garantizada lleva al menos `casillasMinimasPorTipo` (15) casillas
  de frontera en el mapa ya grueso, o el vestido no vale. En 1 000 semillas: 4
  tipos con 15 o más en 458 mapas y 5 en 542; antes, uno de los cuatro quedaba
  por debajo de 15 en el 9 %.
- **El grosor es de 2-3 casillas**: por pareja de regiones un lado engorda
  siempre y el otro donde lo diga un ruido en bloques de 4×4, así que dos
  casillas pisables de regiones distintas quedan a tres pasos. Quién engorda lo
  decide la pareja que **se asoma** a cada casilla de muro y no la que le da el
  tipo: con solo esa, junto a un cruce de tres regiones los dos lados se
  quedaban flacos (semilla 36 en 34×34, la cazó la auditoría). El nodo es un
  estrechamiento de una casilla, con un pasillo protegido hacia cada región que
  toca: es la excepción, aprobada por el usuario, y llega hasta
  `RADIO_DEL_PASO` (3). Un pasillo largo —una región que bordea el mapa en una
  tira de dos, donde toda casilla junto al nodo está pegada al muro— dejaba una
  frontera de una casilla a cuatro del nodo (QA, semilla 987): fuera de ese
  radio, lo que el pasillo no deja engordar lo engorda **el otro lado**, a la
  fuerza.
- **Cada región, de un solo suelo** (`regions[].terrain`, también para el
  agente): `buildMap` lo pinta por relleno y no cambia por dónde se anda.
- **Obstáculos que bloquean** (decisión del usuario: «como HoMM2»), en manchas
  de 1-6 casillas hasta una densidad sorteada entre 10 y 18 % por región. Una
  mancha entra solo si no cae sobre nada, no toca la frontera —así un obstáculo
  se reconoce desde fuera— y con ella puesta, desde los nodos de la región se
  sigue llegando a todo sin cruzar un monstruo. Esa comprobación se rompió a mano
  y la auditoría se puso roja en 27 sitios.
- **Caminos: radiales desde el centro de cada región, y un solo cruce con
  camino por pareja de vecinas** (#149, 06-10-2026; absorbe #133). Historia,
  porque cada paso lo pidió una captura:
  - La primera versión unía todo con todo: **el 41 % del suelo pisable** con
    camino (mediana de 200), con vías dobles.
  - Luego, «árbol mínimo + minas» (decisión del usuario en la vuelta 1 de QA):
    un Prim por región entre sus nodos, midiendo desde la red, y una senda a
    cada mina y pueblo. **El 36 %** (28,5-44,3 en 1 000) y los bloques de 2×2
    bajaron de 6 a 0,8 por mapa. Pero el árbol era **por región**, y μ(unión) =
    Σμ(regiones) + μ(grafo región–nodo): una frontera con dos o tres pasos tenía
    un camino de paso a paso a cada lado de la barrera, dos vías paralelas que
    se cerraban en anillo. **18,5 ciclos por mapa, 16,7 entre regiones**. El
    usuario lo vio en `caminos-despejados/capturas-qa/s7-acantilado.jpg`: «se ve
    un cuadrado formado por caminos que no aportan nada».
  - Se le dieron tres salidas y eligió «dentro de una región una estructura de
    caminos radial». El prototipo enseñó que radial solo no basta: los radios de
    los dos lados hacia dos pasos cercanos son dos «V» que se cierran (37 % y
    los mismos anillos). Eligió la variante B: **entre dos regiones vecinas,
    solo un nodo lleva camino**; los demás pasos se cruzan igual, sin camino.
  - Cómo queda (`trazarCaminos`, `vestir.ts`): cada región tiene un **centro**,
    la casilla libre que menos suma hasta lo que lleva —sus cruces, minas y
    pueblos— (la semilla
    del Voronoi tenía un monstruo encima en 26 de 100 mapas). Los radios salen
    de ahí, del objetivo más cercano al más lejano, con lo ya trazado a mitad de
    precio para que compartan tronco y un paso de más por arrimarse a la red
    viniendo de fuera. Nació porque el pintor cosía dos casillas de camino
    vecinas en rombo; desde #153 el pintor encadena tramos y eso ya no pasa,
    pero el paso de más se queda (#155, 07-10-2026, semillas 1-10): sin él, dos
    radios corren pegados y se leen como una calzada ancha, con un 42 % más de
    trazos que se rozan sin tramo entre ellos (33,5 → 47,5 por mapa), el doble
    de paralelos a una casilla (0,6 → 1,5) y de bloques 2×2 (0,5 → 1,3), y más
    horquillas (26,1 → 28,5). Quitarlo ahorraba unas 8 líneas. Un nodo es final de tramo; una mina o un pueblo no (hacerlos final
    subía el camino al 34 % y los ciclos dentro de una región de 1,2 a 6,4).
  - **Un cruce por pareja** (`crucesConCamino`): a un nodo le llega el camino
    de una región si tiene al lado una casilla de camino de ella, que es lo que
    se dibuja. Una ciudad toca tres regiones y con camino desde las tres es el
    cruce de las tres parejas, así que **se prefiere ciudad a paso** (tres
    radios por tres parejas; la más barata sin más daba 32,8 % y μ 9,9) y se
    reparte con vuelta atrás para que ninguna pareja tenga dos. El prototipo
    daba camino a toda ciudad desde todas sus regiones y dejaba dos cruces en
    3,7 parejas por mapa. La base está siempre en la red de su casa; toda
    ciudad, en la de alguna de sus regiones.
  - **Vuelta de /simplify** (mismo día, A1 + A2 aprobados por el usuario: «sí,
    separar y repartir en la red»). La primera versión repartía los cruces
    *después* de trazar, con el coste desde los centros, y cuando dos nodos
    estaban a dos casillas la única entrada a uno quedaba pegada al otro
    (semilla 8): el contacto se daba por hecho, se volvía a repartir y se
    trazaba otra vez, con un coste «ajeno» para no pisar junto a un nodo con
    camino de otra región. Ahora:
    - **los pasos se separan de los demás nodos como las ciudades**
      (Chebyshev ≥ 3, `intentarRed`): ninguna casilla es vecina de dos nodos.
      Es regla del generador y no de `problemasDeRed`, porque los caminos del
      agente los escribe él. Cambia la red: en las semillas 1-10, **14,5 → 11,9
      pasos por mapa**, las parejas de vecinas 17,4 → 17,8 (ninguna perdida) y
      las redes descartadas 4 → 5;
    - **el cruce lo elige la red** (`RedFina.conCamino`), por la suma de
      distancias de Chebyshev a las semillas de las dos regiones; un reparto
      imposible tira la red antes de vestirla (0 veces en 1-10);
    - **`trazarCaminos` solo traza radios** a los objetivos que recibe y
      comprueba lo dibujado: un nodo al que le llegan dos tramos de una región
      (deja de ser hoja) o uno de una región que no lo lleva es un vestido que
      no vale (fase `caminos`). Pasa cuando el único pasillo hacia un objetivo
      va pegado a otro nodo a tres casillas (semilla 43: (14,16) y (17,16)), y
      eso no lo evita ningún coste. En las 203 semillas del test denso fallan
      16 vestidos; con un coste por pisar junto a un nodo ajeno al radio, 14:
      no compensaba y se quitó;
    - **una sola regla de aristas** (`aristasDeCamino`, `map.ts`) para el
      pintor, el generador y la auditoría (desde #153 solo queda para el plan
      del agente, como `tramosDeCasillas`);
    - **el Dijkstra, más barato sin cambiar nada**: para al sacar el objetivo,
      reutiliza `coste` y `previo`, `pegada` crece con la red, máscaras en vez
      de `Set` y el centro solo sobre las casillas de la región. Con la versión
      ingenua el banco da el mismo hash; 200 planes pasan de 1,07-1,25 s a
      0,86-1,03 s y el banco de 5,6-5,7 s a 5,0-5,1 s.

    Medido en las semillas 1-10 (antes → después de la vuelta): camino 30,2 →
    30,3 % (mediana 31,2 → 30,8); μ 7,0 → 7,1, dentro de una región 1,6 → 1,2;
    anillos de ≤ 12 casillas 0 → 0; nodos sin camino 9,2 → 6,7 por mapa (hay
    menos pasos). Barrido (40, el de serie): 7 / 18 / 21 → 7 / 15 / 27 días,
    0 sin terminar; la mediana de 40 ya era 7 antes de la vuelta (la de 100
    era 9). Banco: 9 / 17 / 34 → 8 / 15 / 39.
  - **Tests que fijaban semillas**, de paso: los asaltantes buscan ellos sus
    brotes, la crónica busca su partida larga, la escena 7 de los paneles se
    parte en ganada y perdida buscando la semilla de cada una, y el aviso de
    7680×4320 se mira en 48×48 (el mapa de 34 anda en el tope de 2 000
    volúmenes y lo cruzaba cada vez que cambiaba el pasillo de la senda).
  - **Medido en las semillas 1-100**, con las aristas del pintor (antes →
    después): camino **36,1 → 30,5 %** del suelo pisable; μ **18,5 → 7,4**
    ciclos por mapa (dentro de una región 1,8 → 1,15; entre regiones 16,7 →
    6,3); anillos de ≤ 12 casillas entre dos nodos de la misma pareja **689 →
    0**; nodos sin camino 0 → 8,0 de 21 por mapa. Duración del barrido (100):
    8 / 16 / 25 → **9 / 17 / 32** días, dentro de la regla del lado (mediana ≥
    8, p90 ≤ 20, 0 sin terminar). Los ciclos que quedan pasan por los centros
    de varias regiones, y esos acortan de verdad.
  - Lo que queda dentro de una región (1,15 por mapa) es el pintor cosiendo
    casillas vecinas que el trazado no une; el arreglo de raíz es que `roads`
    lleve tramos y no casillas. Se hizo en #153 (abajo) sin tocar el plan del
    agente.
  - El test denso pone techos medidos con holgura: mediana del camino < 33 %,
    de los ciclos ≤ 10 y de los de dentro ≤ 3 (desde #153, ninguno: máximo 0). **El 10-15 % que se pidió como
    orientación sigue sin caber**: ~8 sitios que unir por región de ~68
    casillas son ya el 8,4 % del suelo.
- **Los caminos como tramos** (#153, 06-10-2026; alternativa B de la crítica,
  elegida por el usuario). `GameMap.roads` (casillas) pasa a
  `GameMap.caminos`, una `RedDeCaminos` con los **tramos** como hecho y las
  casillas derivadas; constructor privado y campo privado, para que no se
  pueda fabricar con las dos caras desiguales. `trazarCaminos` devuelve los
  tramos que traza (un árbol por región) y desaparece la fase de fallo
  `caminos`, que solo existía porque el pintor unía por adyacencia lo que el
  trazado no unía. **El contrato del agente no cambia**: escribe y lee
  casillas (lo que le importa es el coste, que va por casilla). Lee **el
  mismo conjunto, en otro orden**: `serializeKnownMap.roads` sale ahora en el
  de los tramos canónicos y no en el del trazado, así que el JSON de s1, s2,
  s3, s7 y s10 no es byte a byte el de antes; ni `COMO_SE_LEE_EL_MAPA` ni los
  tests prometen un orden (H3 de la QA). Y
  `caminosDelPlan` deriva sus tramos con la regla de siempre
  (`tramosDeCasillas`). El espectador recibe los tramos por el cable.
  - **Horquillas en L** (punto de control del plan). El arquitecto propuso
    pintar los tramos tal cual (horquillas en Y); el usuario vio las capturas
    (`caminos-como-tramos/capturas/`) y no las quiso: le pesaron un cruce en X
    de la semilla 1 y seis ramales de un punto en la 7. `enderezarHorquillas`
    (`vestir.ts`; hoy `ArbolDeCaminos`, ver la vuelta de /simplify) cambia cada diagonal con una esquina de camino de su región
    por un tramo recto colgado de esa esquina, del lado que conserva el árbol.
    **Un nodo no sirve de esquina**: la primera versión colgaba también de los
    nodos y el test denso se puso rojo en 60, 64, 177 y 986 («le llegan 2
    tramos»): eran justo los mapas que la fase `caminos` tiraba. Ahí la
    diagonal se queda, 1 por mapa en esos 4 de 203 y 0 en los demás.
  - Medido en las semillas 1-10: 177-223 casillas y 181-228 tramos por mapa;
    ciclos dentro de una región **1,2 → 0** (los 12 tramos espurios que unía
    el pintor, 0-4 por mapa, ya no están); horquillas en Y 0, cruces en X 0, y
    ningún punto con más de 4 ramales que no tuviera antes. En el test denso
    (203 mapas), 0 ciclos dentro de una región en todos. Las casillas no se
    mueven, así que el coste tampoco: el banco cambia **solo** en las 7
    semillas donde la fase `caminos` volvía a vestir (43, 60, 64, 70, 87, 167,
    177), con otro mapa desde el primer `raider_spawned`.
  - **Un plan del procedimental copiado al agente pierde los caminos**: zod
    quita `tramos`, que el esquema no tiene. `pnpm qa` lo cazó (la política de
    QA reenvía el plan de la semilla 3 y dejó de haber batallas en seis
    turnos); la política le pasa ahora las casillas de los tramos como
    `roads`.
  - **Vuelta de /simplify** (06-10-2026):
    - **Las horquillas, donde nacen.** `enderezarHorquillas` era una segunda
      pasada con un BFS por diagonal; ahora `trazarCaminos` cuelga el radio
      desde la red hacia fuera en un `ArbolDeCaminos` (padre por casilla), y
      cada casilla que entra en diagonal junto a una esquina de la red se
      cuelga de la esquina sin buscar (todo lo que es red está del lado de
      su padre); la que entra en la esquina de una diagonal vieja la parte en
      dos rectos, subiendo por los padres para saber de qué lado queda. Las
      casillas no cambian: banco idéntico, y en 1-10 solo 3 mapas (2, 4 y 6)
      cuelgan una casilla de otra vecina recta (un tramo cada uno); 1, 3 y 7
      salen píxel a píxel iguales.
    - **La Y junto a un nodo no se puede quitar sin mover casillas.** Se probó
      en la búsqueda: prohibir el paso en diagonal junto a un nodo de la red
      deja un objetivo sin camino (semilla 60, «no llega a (12,15)»), y
      cobrarlo como `pegada` no cambia nada (banco idéntico y las mismas 4 Y:
      60, 64, 177 y 986). En las cuatro la otra esquina es muro, agua, risco o
      bosque: el radio no tiene otro sitio por donde pasar. Se queda el cobro,
      y el guardia admite solo esa Y **obligada** (esquina en nodo y la otra
      esquina barrera) en vez de cualquier esquina que sea nodo.
    - **Un solo paso del plan procedimental al del agente**: `planDelAgente`
      (`generate.ts`). Lo usa la política de `pnpm qa`, así que el mapa que
      juega `pnpm qa` lleva las casillas del agente y sus tramos salen de la
      **regla de adyacencia** (`tramosDeCasillas`), no del trazado: es el
      contrato del agente, y está bien que sea lo que se prueba ahí.
    - **`MapPlan` es una unión**: `PlanConCasillas` (el del agente) o
      `PlanConTramos` (el procedimental); se fue el `throw` de los dos a la
      vez. **`RedDeCaminos` conoce el mapa**: lanza con lo que cae fuera
      (`validateMapPlan` lo dice antes, y mira lo demás en el mapa sin
      caminos para dar todas las clases de problema de una vez), la casilla
      suelta va en `sueltas` y no como tramo `[p, p]`, y precalcula una
      marca por índice para `stepCost` y el Dijkstra.
    - **El cable del espectador, plano**: los tramos como índices
      `[i, k, i, k, …]` y las sueltas aparte. Medido en la vista de la
      semilla 1: los caminos 6 886 → 1 683 B y la vista entera 27 559 →
      22 369 B (s1-10: 27,0-28,4 KB → 22,0-23,1 KB), y va un mensaje por
      acción. El pintor lee `map.caminos.tramos`
      directamente (se fue `Analisis.caminos`).
- **Un camino del plan sobre una barrera se rechaza** diciendo la casilla, en
  `validateMapPlan` (la puerta de los dos productores): `map.ts` no lo abría,
  pero el cliente lo pintaba encima y una carretera sobre un acantilado dice que
  por ahí se pasa (QA H4).
- **Un vestido que falla no tira la red**: se vuelve a vestir la misma red fina
  hasta 10 veces, y solo después se traza otra (hasta 20). Antes de gastar los
  intentos de manchas se cuenta si caben, y el error final dice **en qué fase**
  se agotaron —«no sabe repartir regiones equilibradas» mentía cuando lo que no
  cabía eran los obstáculos—. Medido en 200 semillas por lado de 24 a 48: ninguna
  necesita más de 14 redes, y de las redes equilibradas el 86-96 % se viste en
  diez intentos.
- **La auditoría** (`auditarMapaDenso`, en `test/helpers.ts`) lo mide desde
  fuera, sin preguntar al generador: grosor, suelo uniforme, densidad, alcance y
  caminos, más cuatro barreras por mapa con su mínimo de casillas y las cinco en
  el total. Los caminos, desde #149: cada mina, pueblo y ciudad en la red de su
  región, la base en la de su casa, cada nodo con camino **hoja** de la red de
  cada región que lo lleva, el camino de cada región de una pieza, **exactamente
  un cruce con camino por pareja de vecinas** y la red del mapa de una pieza (antes pedía ir
  por camino de cada nodo a todos los de su región, que es justo lo que
  trazaba los anillos). Mira las 200 primeras semillas **y las 864, 986 y 987**, las tres que
  QA encontró barriendo mil y que el test no veía; se le vio morder con las tres
  antes de arreglarlas. La auditoría independiente de QA, sobre las semillas
  1-1 000 en 34×34 y 1-100 en 48×48, sale sin un fallo.

**Cada barrera está a ΔE76 ≥ 20 de cada suelo y de las otras cuatro**, y lo vigila
`test/pigmentos.test.ts`: el acantilado era un pardo a 11 de la tierra de casa y
el muro un gris a 15 del `rough`, y se leían como suelo (QA H1 y H2). Hoy el
acantilado es ocre anaranjado con estrías, filo claro y la sombra del desnivel
sobre el suelo de abajo; el muro, pizarra oscura con sillares y coronación; la
montaña, gris lavanda frío; el bosque, verde hondo (`tramarBarreras`, en
`render/terreno.ts`). El mínimo es 22,1 (muro y agua): en la vuelta 2 de QA el
muro subió de `[34,32,54]` a `[40,36,64]` porque en el minimapa quedaba a 16,9 del
fondo de lo inexplorado, y desde entonces el test mide también cada barrera contra
ese fondo (`FONDO_INEXPLORADO`, en `render/minimapa.ts`; el más cerca, el muro, a
21,5). Y el ocre del acantilado **no se funde** con la casilla de al lado: dejaba
un halo naranja sobre la nieve o el agua vecinas (N5).

**Ninguna decoración de un suelo que se pisa parece una barrera, y la de una
barrera no se sale de ella** (vuelta 2 de QA, N1). En `rough` se pintaba el pico
de montaña del atlas, y en la semilla 1 se veía una cordillera en mitad de una
región; hoy lleva un menhir bajo, y pocos. Y la montaña pintada —más de dos
casillas de ancho— y la copa del bosque tapaban el suelo de al lado: `decoracionDe`
(`render/mapa.ts`) mide lo que tapa cada una con las medidas de su pieza
(`cajaDePieza`) y, si pisa una casilla que se anda, la encoge a la celda del atlas
hasta 0,85, que cabe siempre en la suya. En mitad de una cordillera la pieza sigue
saliendo una de cada tres casillas; en una de 2-3 de grosor casi nunca. Lo vigilan
tres tests de `escenas.test.ts`, vistos morder.

El cliente lo pinta con pigmentos por barrera, una franja oscura de borde, las
montañas de `assets/mapa/` solapadas, árboles y ruinas del atlas, y las texturas de
`assets/generated/terrain/` como trama: **temporal**. Lo que falta pedir está en
`docs/art/peticiones.md`, §8. El generador tarda ~1,7 veces más que antes de los
mapas densos (200 planes de 34×34: 530 ms, desde 313), y ~2,2 veces tras la vuelta
1 de QA (670-710 ms en caliente: una búsqueda por tramo de camino y más vestidos
que no llegan al mínimo de casillas). Por debajo de `LADO_DEL_MAPA` el mínimo se
nota: en 24×24, 2 de 200 semillas ya no dan mapa; de 28 a 48, 0. Y el cliente reduce cada
pieza una vez por tamaño, no pinta lo que cae fuera de la cámara y solo rehace la
superficie del mapa cuando entra arte nuevo (`versionDelArte`); la arena no
descarga las piezas del mapa.

**Todo ese pintado se retiró el 04-10-2026**, al enganchar la escena del
escenógrafo (`render/escenario/`, docs/agents/2026-10-04-escena-del-mapa/):
`terrainSurface` y sus dos tramas, `decoracionDe` y su contención en la barrera,
las montañas, el hito y la ciudad y el pueblo sueltos de `assets/mapa/`, los
caminos trazados por el lienzo y la textura `soft-light` de `rpg/suelo.webp`. Los
pigmentos se quedan —el minimapa y el suelo de un píxel por casilla que se ve
mientras llega el arte— y con ellos su test de ΔE. Los tres tests de
`decoracionDe` se borraron con ella: guardaban una regla que ya no pinta nadie.

**La vuelta de `/simplify` de la escena (04-10-2026)** dejó un canal de carga y una versión del arte (`versionDelArte`): el suelo espera a que no quede ninguna tanda en camino y, al pintarse, suelta las imágenes que solo pinta él. Hay una caché de copias reducidas de 40 MB (`render/copias.ts`) con la clave numérica, para que volver a un zoom anterior salga de ella. Los volúmenes se pintan en píxeles de dispositivo. Lo que dice quién está en una casilla va en una pasada encima de todo.

Dos cosas salieron de verlas, no de razonarlas:

- **El héroe que nace al norte de su castillo** (semilla 1) quedaba tapado entero por él, que mide casi dos casillas de alto. Por eso la figura que pisa una casilla cubierta por algo horneado sube a la clave de lo horneado (`claveDeFigura`).
- **Un grupo de asaltantes llegó detrás de los triángulos de montaña** de `pnpm capturas` sin arte y dejó de verse del todo. Por eso la chapa y el estandarte van encima.

La propuesta de bajar la clave de lo horneado al borde de arriba de su figura se probó y se descartó. Pone encima de una ciudad las rocas que tiene detrás (taller: 0,3-0,7 % de píxeles), y en la semilla 1 pinta la mina sobre la iglesia del pueblo. La regla tiene dos clases: la figura de esa franja va delante, y el volumen, detrás. Una sola clave en lo horneado no puede dar las dos cosas.

**La vuelta 1 de QA de la escena (04-10-2026)** cerró cuatro hallazgos, todos medidos en el Chromium sin GPU de `pnpm capturas`:

- **El tope cuenta también los píxeles** (H1, decisión del usuario). En 3840×2160 el tope sube a 75-94 px y lo caro era el relleno: 7 fps, frente a 15-35 de `b3ff334`. Ahora el mapa no pinta más de `PIXELES_DEL_MAPA` = 1 500 000 píxeles de dispositivo por fotograma —lo que ya pintaba el lienzo de una ventana de 1920×1080—, y en una pantalla mayor baja la densidad. El coste no crece en línea: con 2 073 600, 32 fps arrastrando en 2560×1440; con 1 500 000, 43; con 1 000 000, 60. De paso, la niebla se amplía con muestreo bilineal y no de alta calidad: la máscara es de un píxel por casilla y la alta calidad costaba 10 fps en 2560×1440. Lo que se paga: en esas pantallas el mapa se ve más blando, y con el mapa entero a la vista (sin niebla) en 2560×1440 baja de 60/58 a 54-56/45, porque ampliar el lienzo también cuesta.
- **El suelo se pinta en un Worker** (H2). Era una tarea de 1,7-2,2 s en cada partida. Hicieron falta otras tres cosas para que ninguna tarea del hilo principal pasara de ~100 ms al cargar: las imágenes de la escena llegan como `ImageBitmap` (un `<img>` se decodificaba en el primer fotograma que lo pintaba; `img.decode()` no lo evita, porque el lienzo no usa lo que decodifica), `componer` va en una tarea aparte del primer fotograma (`escenarioListo`) y un fotograma no hace más de 200 copias reducidas nuevas. **Igual al píxel no sale, y es por las imágenes y no por el Worker**: el Worker y el hilo principal dan el mismo suelo con las mismas `ImageBitmap` (0 píxeles distintos en las semillas 1, 3 y 9), pero un `<img>` el navegador lo decodifica a la escala a la que se pinta y un `ImageBitmap` no, y en un Worker no hay `<img>`. Con `imageSmoothingQuality = 'medium'` la diferencia con el suelo de antes queda en un 4-6 % de píxeles a más de 16 niveles.
- **El tope dice cuándo no se puede cumplir** (H4): en 7680×4320 ni a 110 px caben los volúmenes, y `topeDeAlejar` lo avisa en consola una vez.
- **Lo que tiene altura se recorta al mapa por los lados y por abajo** (H3). Por arriba no: lo que se levanta en la fila 0 sube sobre el borde, como en el taller.

**La nitidez en el zoom máximo (05-10-2026, docs/agents/2026-10-05-nitidez-del-mapa/).** El usuario vio borroso el suelo —una roca de `cubierta-rough/2.webp`— al lado de volúmenes nítidos. Era el render, no el arte: el suelo se pintaba a 72 px por casilla y la cámara llega a 110 px CSS, 120 de dispositivo en su pantalla (dpr 1,09), así que se ampliaba ×1,5-1,7; el arte del suelo da 128 px por casilla o más. Y el presupuesto de píxeles, fijo, bajaba también en el zoom máximo la densidad a 0,997 en su pantalla y a 0,72 en 2560×1440. Lo que cambió, todo medido en el Chromium sin GPU de `pnpm capturas`, antes (`ba057bd`) y después alternados en la misma sesión:

- **El suelo a 120 px, con un esbozo a 60 que llega antes.** En serie, no a la vez (el pico de memoria es de ~14 máscaras de 67 MB); antes del suelo a 120 se pintaba a 72, con una mitad a 36 que se reducía una vez porque reducir la de 72 a cada arrastre costaba 12,7 ms: el esbozo a ~1,9-2,0 s y el bueno a ~7,0-7,5 s de abrir la página (antes, el de 72 a ~2,5 s). 83 MB de superficies frente a 30; el PSS de todo el navegador mientras pinta, 1,27-1,49 GB frente a 1,07-1,23. Cada fotograma copia la superficie más pequeña que no se amplía (`nivelDelSuelo`).
- **El presupuesto según el zoom** (`presupuestoDelMapa`): (tile/tope)² veces `PIXELES_DEL_MAPA`, y densidad plena cuando eso cubre el lienzo y este no pasa de 3 M. Plena o nada: en 4K una intermedia iba peor que la de hoy, y 4K se queda a 0,46 (decisión del usuario).
- **Dos copias que costaban sin que se viera.** El fondo del suelo medía `ceil` y el lienzo `floor`: ese píxel de diferencia hacía de la copia de cada fotograma un reescalado de alta calidad, 23 ms en 2560×1440 y 12 en 1920×1080. Ahora el fondo mide lo mismo y se copia píxel a píxel, y el fondo se compone en bilineal (de 120 a 110 la alta calidad no aporta y hacía mipmaps de 4 080×4 080: 95 ms la primera vez). Y la copia de otro tamaño que se pinta mientras se hace la suya va en bilineal: en alta calidad, los ~1 000 volúmenes que cambian de tamaño en cada paso de rueda hacían tareas de 100-127 ms a densidad plena en 2560.
- **Las copias**: caché de 80 MB (con 40, 2560 en el zoom máximo la vaciaba y rehacía sin parar: 15-21 fps arrastrando; con 80, 43-60) y un tope de píxeles nuevos por fotograma, `PIXELES_NUEVOS_POR_FOTOGRAMA` = 1,5 M. Antes el tope era de 200 copias (`COPIAS_NUEVAS_POR_FOTOGRAMA`), puesto porque el primer fotograma con volúmenes las hacía todas —500-900 en 1920×1080— en una tarea de 80-137 ms; a densidad plena cada copia es mayor y esas 200 dejaban tareas de 142-158 ms a cada paso de rueda en 2560. 1,5 M es lo que sumaban las 200 al cargar en 1920×1080 (0,9-1,6 M; al acercar, 1,6-3,2 M).

fps quieto/arrastrando, semillas 1 y 7, antes → después: en el zoom máximo, 1920×1080 60/60 → 60/60; la pantalla del usuario 61/44-47 → 60/60; 2560×1440 55-57/42-45 → 60/58-60; 3840×2160 36-37/34-35 → 33-37/34-37. Al tope de alejar: 60/60 → 60/60; 46-55/47-52 → 60/60; 48-51/48-49 → 59-60/60; 37-38/34-37 → 35-37/34-37. Tareas de más de 100 ms: ninguna al hacer zoom (antes tampoco); al cargar, una de 101-115 ms en el primer medio segundo en tres de ocho cargas, la del arranque de la página, anterior al suelo (antes, una de 145 ms en una carga de 4K). Los 13 módulos de picos y paredes cuyo arte no llega a 120 px por casilla se pidieron en `docs/art/peticiones.md` §12.

**El suelo a la densidad de la pantalla (08-10-2026, #148, docs/agents/2026-10-08-suelo-dpr/).** Con dpr ≥ 1,25 la casilla del zoom máximo pasa de 120 px de dispositivo y el suelo de 120 se ampliaba (×1,15 a 1,25, ×1,38 a 1,5, ×1,83 a 2) al lado de volúmenes nítidos. Ahora el bueno se pinta a ⌈110 × dpr⌉ (`resolucionDelSuelo`), nunca por debajo de 120 —hasta dpr 1,09 nada cambia— y hasta un tope de 126 MB, 165 px en un 34×34 (dpr 1,5); más allá se queda en 165 y lo dice la consola. Medido en el Chromium sin GPU, semillas 1 y 7, con la máquina cargada (load 8-13, otras sesiones): a 120/138/165/220 px el Worker tarda 6-7/8-10/11-12,5/20-21 s y el PSS del navegador sube 0,4-0,6/0,6-0,7/0,9-1,05/1,5-1,6 GB mientras pinta, unas siete veces la superficie; soltar a 0×0 cada máscara de mapa entero en cuanto se copia no lo bajaba de forma que se distinguiera del ruido, y se quitó. El tope sale de ahí y del arte: las texturas son de 128 px por casilla y lo plano de 141 como poco, así que por encima de ~165 casi solo ganan los bordes; y a dpr 2 una ventana de 1440×900 pasa de `PIXELES_AL_ACERCAR` y se pinta a densidad 1,34 (147 px). Entre el esbozo y la mitad del bueno (de 61 a 82 px a dpr 1,5) se copia la mitad del bueno, que se saca una vez en el hilo principal (21/31/55 ms la de 138/165/220). Si el dpr sube a media partida (zoom del navegador, otra pantalla) se encarga otro bueno y se ve el anterior mientras; si baja, se reduce el que hay. En las capturas a dpr 1,5 el gradiente medio sube un 3-6 % (semillas 1 y 7); se nota en la cubierta baja, las vallas y las flores.

**La vuelta de /simplify de la nitidez (05-10-2026).** Se aplicó casi todo lo que pedía la revisión: un solo encargo del suelo con dos avisos (`AvisosDelSuelo`) y el mismo camino con y sin Worker (`enUnWorker`, `enEsteHilo`); la tarea aparte que relanza su fallo en el siguiente fotograma en un solo sitio (`aparte`, que comparten `escenarioListo` y el suelo); `esbozo` y `bueno` en dos campos, y mitades del esbozo cuando hay que reducirlo a menos de ×0,5 (hace falta en 7680×4320; en 4K al tope la casilla queda a 33-45 px de dispositivo); lo del mapa anterior se cierra y su Worker se termina; el fondo mide `ctx.canvas`; el presupuesto se pide con la caja de ahora (`preparar(presupuesto)`) y tiene un paso de rueda de holgura para salir de la densidad plena, salvo en el tope (la pantalla del usuario pasa el presupuesto solo un 19 %, y con holgura en el tope se quedaba a plena). Dos cosas se midieron y no entraron:

- **Copias de los volúmenes por niveles** (×1/√2, la regla del suelo). Gastan seis veces menos memoria —una partida entera pide 21-26 MB, frente a 140-300 MB de copias exactas— pero pintar cada volumen reescalado, aunque sea bilineal y a ×0,71-1, bajó 2560×1440 en el zoom máximo de 60/60 a 41-47/36-43 fps; copiar el mismo nivel 1:1 (mal de tamaño, para aislarlo) volvía a 60. El coste es el reescalado, no la caché: las copias siguen al tamaño exacto y en 80 MB (con 60 se rehacían 19-99 al acercar en 2560; con 40, sin parar). La calidad de la copia provisional de otro tamaño la pone ahora `mapa.ts`, no `pintarSprite`.
- **Un solo Worker para las dos resoluciones.** Carga las texturas una vez (~0,1 s), pero no suelta las máscaras de la primera antes de pintar la segunda, ni dejando una vuelta del bucle entre las dos: el pico de PSS del navegador subió 130-380 MB. Ahora es un encargo con un Worker por resolución, en serie, terminado al contestar.

**Los caminos, despejados (05-10-2026, docs/agents/2026-10-05-caminos-despejados/).** El usuario veía las sendas tapadas a menudo, y no solo por lo alto: labranza, matas y piedras se pintaban encima. Había tres causas. La reserva del camino eran discos de 0,38 en el centro de cada casilla, con un hueco de media casilla en cada unión y más en diagonal. La senda suavizada ondula hasta 0,18. Y solo se miraba el pie de cada sprite, cuando una mata de labranza mide hasta 1,6 casillas de ancho y crece hacia arriba. Ahora hay un **pasillo** (`pasillo.ts`) sobre el trazo que se pinta y se mide con el rectángulo con el que se pinta cada sprite (`cajaDeSprite`, que usa también `pintarSprite`). Su media anchura es 0,1 de senda más `MARGEN_DE_SENDA` = 0,3 para lo bajo y `MARGEN_DE_MASA` = 0,2 para árboles y picos. Lo que lo pisa sale más bajo (`altoLibre`, por bisección) y se quita solo por debajo del 40 % de su alto, o de 0,3 casillas en una masa. Todo pasa por una puerta, `poner`. La regla «pico al sur de un paso al 55 %» se borró, porque el pasillo de las masas la cubre. Bajo la senda se pinta un arcén del pigmento del suelo de cada casilla (alfa 0,4, borde con desenfoque de 0,15·T). Decisiones del usuario: 0,3 y no el ~0,4 que pidió, porque con 0,4 el suelo desnudo subía del 13 al 33 % en la semilla 1; un margen propio para las masas, porque el camino va **dentro** de bosques y cordilleras (218 de 260 casillas de camino tocan una barrera en la semilla 1); y encoger antes que quitar.
- **Medido** (taller, 48 px, semillas 1/3/7). El suelo desnudo fuera del pasillo, contado como cubierto el pasillo en los dos lados, pasa de 9,6/16,0/11,2 % a 14,6/21,2/16,0 % (15,0/21,1/16,0 % antes de la vuelta de /simplify). Lo que aparece es suelo que tapaba el voladizo de los picos. `spritesSobreSenda` baja de 2 542/2 233/2 192 a 0 (0 en las semillas 1-60). `casillasDeBarreraSinFormacion` sigue en 0 en las semillas 1-60. `componer` pasa de 52-57 a 59-68 ms de mediana (semillas 1/3/7/9). Al principio fueron 200 ms; descartar cada tramo por su caja lo bajó a 72-81, y la vuelta de /simplify a lo de hoy: un solo índice con el radio mayor, los tramos en trozos de 8 con su caja, distancias al cuadrado sin cierres por pregunta, la bisección solo sobre los tramos que pisan la caja entera y los dardos preguntando primero lo barato. Con el pasillo anulado `componer` tardaba lo mismo: lo que queda es el esparcido, no el pasillo. Los fps, con la sesión de medida de la nitidez, en la pantalla del usuario y en 4K, en el zoom máximo y al tope, quedan iguales: 60/60 y 37-38. Hay unos 25 % menos de sprites y de volúmenes, así que el tope de alejar llega más lejos. El aviso de 7680×4320 dice ahora «hasta 2 028» en lugar de 2 464.
- **Tres cosas que costó ver.**
  - Con el dardo de las matas filtrado solo por el pie, unas 500 matas por mapa caían pegadas al sur de la senda. `poner` las quitaba por no caber ni encogidas y ese hueco no lo llenaba nadie. Primero el dardo exigió que cupiera una caja de 0,2 × 0,15 escrita a mano; en la vuelta de /simplify el dardo y `poner` hacen la misma pregunta (`entra`), con el sprite más estrecho de la clase al alto mínimo, sacado de la tabla `APARTE`.
  - Una casilla de cordillera suelta con caminos por tres lados queda mordida en las esquinas por los tramos en diagonal, y quedaba sin formación en 5 de cada 30 semillas. El relleno prueba ahora una rejilla de 4 × 4 de la casilla con el módulo más estrecho.
  - Con el pasillo continuo, la pared de acantilado se quitaba a lo largo de todo camino que corriera al pie o por lo alto, y quedaba a la vista el rectángulo liso de la textura de la cara. Ahora hay rampa solo donde el pasillo de las masas pasa a la vez por el pie y por el filo.
- **La vuelta de /simplify.** Una tabla por clase (`APARTE`): margen, mínimo al encoger y hojas, de las que salen el sprite del dardo y el módulo de reserva. La orilla pasó a apartarse con el margen de lo bajo (antes su dardo miraba solo el pie contra el pasillo de las masas y `poner` la dejaba entera): 436/143/164 orillas en las semillas 1/3/7 pasan a 423/104/130. El muro se filtra solo por las reservas y no cambia ni una pieza. El arcén se pintaba con tres lienzos del mapa entero a la resolución del suelo —66 MB cada uno a 120 px por casilla— y ahora con uno de 16 px por casilla que se amplía: el suelo pintado del juego tarda unos 0,3 s menos (7,4-7,7 → 7,1-7,3 s) y en las capturas no se distingue. El pico de PSS del navegador, medido como en la nitidez, baila ±200 MB entre vueltas y no dice nada. El arcén con la textura `dirt` se probó antes y en la nieve llevaba un halo pardo: por eso es el pigmento.
- **Las costuras rectangulares (vuelta 1 de QA).** Al despejar el camino quedaron a la vista rectángulos de bordes rectos junto a la senda: una hondonada de nieve de 2×3 casillas dibujada como un recuadro, el agua del puente del noroeste de la semilla 7 cortada en recto, un rectángulo oscuro al sur del castillo de la semilla 1. Se creyó que eran las máscaras del suelo, del nivel o del agua; medidas una a una, cada máscara sale suave (salto máximo entre píxeles vecinos de 2-5 sobre 255). Eran los **cantos** de las caídas al este y al oeste: una franja oscura de 0,35 casillas por canto, pintada nítida sobre el suelo, con una raya en el borde de la casilla y un corte seco arriba y abajo. Las rocas al pie de cada canto los tapaban, y el pasillo las quitó. Ahora se pintan todos en un lienzo de 16 px por casilla que se difumina entero (0,15 casillas) y se amplía. Medido con un detector de costuras (bordes de casilla donde el suelo, sin caras ni sprites, salta en recto más de 4 niveles), semillas 1/3/7/495 a 110 px: 271/290/264/333 → 45/36/14/30, y el peor salto, de 50-67 a 6 (el resto es la textura). El suelo pintado del juego tarda lo mismo (+2 %, dentro del ruido).
- **Lo que se destapó y no se arregló aquí.** La cara de roca lisa donde no hay pared encima (la rampa y las reservas de los objetos) sigue siendo un rectángulo: es una cara de roca, va a la issue A5. Y la cara de roca se pinta encima de la senda donde un camino baja por ella.

**Las rampas de acantilado (#150, 06-10-2026, docs/agents/2026-10-06-rampas-de-acantilado/).** Donde un camino bajaba por una cara de roca, la cara se pintaba encima de la senda (capa 7, después de las sendas) y la tapaba siempre. La pared se quitaba si el pasillo de las masas pasaba a la vez por el pie y por el filo con la misma x, y eso fallaba por los dos lados: en una diagonal la pared se quedaba encima de la senda (32 de 101 cruces en las semillas 1-10, invisibles porque `APARTE.pared` es `null`), y donde sí se quitaba quedaba el rectángulo liso de la cara. Ahora es **un hecho, un sitio**: `rampas` (`relieve.ts`) recorta cada senda contra la banda de cada cara, encadena los trozos de una misma senda que pasan de una cara a la de al lado, y es rampa la cadena que toca el filo. Su tajo es lo que ocupa la senda en x más `HOLGURA_DE_RAMPA` por lado. `pintarSuelo` deja el tajo fuera de la cara (un trapecio, más estrecho en el filo); `componer` **parte la pared** a los dos lados del paso de la senda (trozos de su misma imagen con `recorte`) y pone una en cada borde del tajo. El informe cuenta `paredesSobreRampa`, que tiene que ser 0.
- **El punto de control del usuario: sin pelar las escaleras.** El plan abría el tajo 0,55 por lado y lo estiraba hasta el extremo de la cara si quedaba menos de media casilla, y apartaba las paredes enteras. En los acantilados en escalera, de caras de una casilla, se iba el peldaño entero y el risco quedaba pelado (`capturas/s5-x15-y4-*`, `s6-x31-y10-*`). Un módulo de pared mide tanto de ancho como de alto (el más estrecho de roca, 1,04 de ancho por 1 de alto): apartándolo entero, en un peldaño de una casilla con la senda en medio no cabe ninguno. Por eso la holgura es la del arcén (`SEMIANCHO_DEL_PASILLO`, 0,4), el tajo no se estira al extremo y la pared se recorta en vez de quitarse. Con 0,4 de tajo y 0,3 de paso, la pared monta 0,1 sobre el borde del tajo y no deja tira lisa.
- **Medido** (semillas 1-10): 110 rampas, de 6 a 16 por mapa, 43 en diagonal; tajo medio de 0,72 casillas en caras de 1,70 de media; paredes 1 421 → 1 481, de las que 269 son trozos recortados; `paredesSobreRampa` = 0 y `spritesSobreSenda` = 0. De 96 bordes de tajo dentro de una cara, 63 quedan con pared. Casi todos los demás están junto a un objeto, cuya reserva quita la pared igual que antes (la cara lisa junto a las reservas, A5); unos pocos, en diagonales donde el trozo de canto pisaría la senda. El pintor del taller tarda lo mismo (4,4-4,8 s a 110 px). La pared se decide después de tirar el azar, así que cambian la cubierta y las nubes de cada mapa; el banco no se mueve.
- **La vuelta de /simplify.** La geometría del tajo se decidía en tres ficheros con cuatro constantes atadas solo por comentarios (0,4, 0,3, un `solape = 0.1` tecleado y `ABRE_DEL_TAJO` = 0,12); ahora `rampas` da por rampa su tajo, su **paso** (la caja de sus trazos más el pasillo de las masas) y qué bordes caen dentro, la escena lleva las rampas en su cara, `SOLAPE` = 0,4 − 0,3 se deriva y `ABRE_DEL_TAJO` es él (la cara llega en el filo justo hasta la pared). La pasada de canto, que releía las cajas puestas para adivinar huecos, se fue: cada módulo se parte por los pasos que le caen a su altura (`segmentosLibres`) y se pone uno en cada borde de dentro, apoyado en el pie de su cara. Los trozos entran por `meter`, la cara se recorta con `clip('evenodd')` en el suelo (sin lienzo propio) y el trozo se pinta desde la copia reducida de su módulo entero. Lecciones:
  - **El filtro escondía un redondeo.** La pared se partía y luego se tiraba en silencio el trozo que aún pisara la senda (`pisaRampa`), el mismo predicado que medía el guardia: 0 por construcción. Sin el filtro, cortar justo en el borde del paso da 1-5 paredes que lo pisan por redondeo por semilla; el paso lleva una millonésima de más (visto morder quitándola).
  - **La escalera aprobada salía de módulos anclados dentro del paso.** Un bucle que recorre cada tramo libre empezando en su borde con el tajo (lo que pedía el hallazgo) dejaba los peldaños sin pared: los trozos apilados que se ven en `s5-x15-y4` son las partes de módulos con el ancla en el paso, cortadas por su lado. Por eso el recorrido sigue como estaba y lo que cambia es el corte.
  - **La reserva de un objeto se mira donde se apoya el módulo**, no en el trozo: mirada en el trozo, se iban paredes de la escalera junto a un recurso. Y `meter` cuenta `basesSobreReserva` en ese mismo sitio; las paredes antes se saltaban `meter` y el guardia no las veía.
  - **Medir en el navegador con Vite en el mismo proceso:** la `root: 'src/client'` de `vite.config.ts` es relativa al directorio de trabajo, no al fichero; los dos servidores (antes y después) servían el mismo árbol hasta pasarla explícita.
  - Medido (semillas 1-10): paredes 1 481 → 1 470 (trozos 269 → 224), bordes de tajo con pared 63/96 → 63/96, `paredesSobreRampa` y `spritesSobreSenda` 0; `componer` igual o 2-5 ms más rápido; el fotograma, igual dentro del ruido (los trozos, 0,01-0,09 ms por fotograma en las dos versiones).
- **Lo que queda.** La senda que corre al pie de una cara (sin bajar) sigue bajo la cara y sus paredes, y las paredes asoman 0,35-0,55 sobre el filo y tapan una senda que corre por arriba. Son las dos del backlog del plan.
- **La vuelta de QA: «sin cortes rectos» (decisión del usuario, 06-10-2026).** QA dio no apto: el corte de la pared por el paso dejaba trozos de canto recto que se leían como ranuras, sobre todo en las caras altas (caída 3, módulos de 2,2 casillas, bajo el castillo de s9), cortaba también las paredes de la cara de al lado (H2), y en una escalera en diagonal la senda salía de la banda de su cara y se metía bajo la pared de la vecina sin que el guardia lo viera (H1: 47 paredes en 10 semillas, `paredesSobreRampa` = 0). Ahora la pared **no se corta nunca**: la puerta `ponerPared` la aparta de la senda de `junto` (la que baja y toda la que pasa a 1,5 casillas, de cualquier cara) corriéndola, encogiéndola o quitándola, y los bordes del tajo se rematan con peñascos. Lecciones:
  - **Apartar sin correr pelaba los acantilados.** Un módulo mide tanto de ancho como de alto; en caras de una casilla junto a la senda, encoger o quitar dejaba losas lisas enteras (cara lisa 201 → 215-219 casillas en una iteración). Probar a correrla hasta una casilla antes de encogerla lo arregló, siempre que su sitio original no esté en la reserva de un objeto: correrla desde ahí ponía 400 paredes de más encima de ciudades.
  - **La senda que ya tapa la cara no cuenta**, salvo junto a un tajo: apartar la pared de una senda que cruza la banda de una cara sin tajo no destapa nada y dejaba lisa la cara entera (s9, bajo el castillo). Junto a un tajo cuenta toda, que es lo que mira la medida de H1.
  - **Las rampas que solo rozan una esquina** (45 de 110, con menos de 0,25 casillas de senda en la cara) ya no abren tajo: eran las que cortaban paredes altas por nada.
  - Medido (semillas 1-10): 65 rampas (de 110); 0 paredes con `recorte` (224 antes); paredes sobre la senda junto a una rampa, con la medida de QA, 47 → 0 (28 con `ENTORNO_DE_RAMPA` = 0); cara lisa total 201 (HEAD) / 176 (QA) → 170 casillas, junto a una rampa 40,7 / 25,8 → 25,8; 1 470 módulos de pared (1 421 en HEAD) y 596 peñascos; el fotograma al tope de alejar, +0,075 ms de mediana por semilla contra HEAD (+0,26 en la versión de QA).
  - Queda: la cara lisa junto a la reserva de un objeto (s5 junto a la ciudad, s9 bajo el castillo, s27 entre dos rampas) se ve como una losa, ahora con pedregal al pie; y la senda que roza una esquina sigue bajo la cara en ese roce. Las esquinas del arte lateral (#156) rematarán el tajo.

**Las paredes laterales (#156, 06-10-2026, docs/agents/2026-10-06-paredes-laterales/).** El usuario veía todas las paredes de roca con la misma orientación: solo las caídas al sur llevaban pared; al este y al oeste, una franja oscura y peñascos, y un risco que baja de norte a sur se leía como una escalera de frontales. Ahora `relieve` da también las **laterales** (cadenas N-S de cantos con la misma caída y material) y `componer` pone en cada casilla un tramo de la hoja de su lado (`laterales-<material>-<este|oeste>`, nunca espejado), y la **esquina** donde la lateral acaba en una cara al sur de la misma caída y material (`esquinas`, un solo sitio para las dos pasadas). Lecciones:
  - **La escala sale de la imagen.** El arte varía un 25 % de una hoja a otra; con una escala fija los tramos dejaban hueco o se solapaban. El catálogo lleva `filo` (el píxel de arriba del lado alto, `derivarFilo`), y `colocarLateral` pone el filo en el borde de la casilla alta (`CORONA` = 0,2 dentro) y el ancla en el pie (`PIE_LATERAL` = 0,12 por debajo, por encima del ancla de la frontal para que la esquina se pinte encima). Es el primer metadato derivado de la imagen dentro del catálogo (#120).
  - **Una senda que baja por un canto no se encadena con las caras.** Encadenada, la que bajaba por la lateral y seguía al pie de una cara le abría un tajo y la dejaba sin pared (s6, x13-15 y11). Lo que baja por una lateral solo entra en `junto`; no abre tajo.
  - **En una escalera, la frontal no sigue sobre el peldaño de al lado si ese peldaño empieza en una esquina** (s3, x32-33 y14-15): ya tiene frontal y lateral.
  - **La arenisca lateral lleva el tono de su frontal** (`CHILLONA`): junto a ella, en una esquina, se leía rosada. Las demás laterales ya salen del tono de su frontal entonada.
  - Medido (semillas 1-40): 6 798 cantos, 4 665 laterales, 3 426 paredes laterales puestas (50 %) de las que 846 son esquinas; las frontales bajan de 5 301 a 4 343, casi todo porque la esquina trae su frontal. Las que no se ponen: la reserva de un objeto (en 10 semillas, 551, 245 de ellas junto a una ciudad, #159) y la senda que baja o la de junto (362). Los cuatro guardias a 0. `componer`, mediana 66 → 73 ms. Fotograma en 2560×1440 sin tope de fps, semillas 1 y 7 dos veces: al tope de alejar 98-107 → 99-102 fps (3,55-3,85 → 3,60-3,82 ms de JavaScript), en el zoom máximo 76-85 → 74-84. El tope de alejar de s7 sube de 54 a 56 px en 2560×1440 (88 volúmenes más); el de s1 no cambia.
  - Queda: la corona de cada tramo se lee como una muesca en el filo de las cadenas largas de roca y nieve; la caída 3 lleva el arte de 2 estirado; y la senda que baja por un canto quita la lateral de su casilla y puede quitar la del norte, cuyo pie llega a ella (no se encoge: #151). Pedido en `docs/art/peticiones.md` §19.
  - **Vuelta 2 (07-10-2026): las laderas (§20).** Al ver las capturas, el usuario: «la pared lateral no esta bien conseguida y su repeticion se nota mucho, hace fata arte nuevo, evitar bordes rectos, que tenga un poco de giros». Con el arte nuevo (`laderas-<material>-<lado>-<caída>`, ocho módulos por hoja) cambian tres cosas:
    - **La colocación sale de dos puntos registrados sobre la guía**, no de un filo buscado en la imagen: con un filo ondulado, el píxel más alto no dice dónde está la junta. `registrarLadera` (en `tools/taller/derivar.ts`) busca por FFT el desplazamiento que más solapa la silueta de la guía con lo opaco del módulo, y lleva a cada módulo su `filo` (junta norte) y su `pie` (junta sur). El pintor añade peñascos alrededor de la guía, así que la guía cabe entera en una meseta de desplazamientos de hasta 40 px: se toma su centro. La maqueta que vio el usuario tomaba el que diera el ruido de la FFT (187 de los 192 módulos a ≤ 16 px de ella, el peor a 34). Registrar cuesta ~0,35 s por módulo, así que se apunta en el índice de cada hoja (`pnpm taller derivar-laderas`, también al terminar de generar una hoja) y un test vuelve a registrar dos.
    - **La cadena lleva remates**: `inicio` al norte, `fin` (con su cono) al sur si no hay esquina, y en medio `medio-*`/`largo-*` al azar sin repetir el vecino. En un escalón de caída rematan las dos puntas de la mayor y la menor sigue (`rematesDeLateral`). Lo que no entra se prueba casilla a casilla con los medios, más estrechos; la esquina, antes con el `fin`.
    - **Lo que baja por una ladera aparta solo media casilla** (`ENTORNO_DE_LADERA` = 0,5, frente a 1,5 de una cara): la ladera es estrecha y no abre tajo.
    - Medido (semillas 1-40): casillas de canto con ladera 3 426 → 3 731 de 6 798 (50 → 55 %); con `ENTORNO_DE_RAMPA` habrían sido 3 563. Esquinas 846 → 792. Columnas de cara sin pared delante: 622 en HEAD, 621 en la vuelta 1, 625 ahora: las frontales que «faltaban» eran las que trae la esquina, no quitadas. Guardias a 0. Tono: la arenisca del oeste lleva `CHILLONA` (luz 86 contra 69 de su frontal entonada) y el basalto `contrast(0.8) brightness(0.8)`, que apaga su labio casi blanco sin oscurecer la sombra. Fotograma en 2560×1440, s1 y s7, dos pasadas, vuelta 1 → vuelta 2: tope de alejar 111-113 → 108-111 fps, zoom máximo 88-98 → 89-97; `topeDeAlejar` igual.
    - **El registro, frente a la maqueta de la §20** (`registro()` en `docs/art/revision-laterales-2/maqueta.py`, rama de arte): la maqueta correlaciona en circular sobre la guía entera; `registrarLadera`, en lineal sobre la caja de la pieza, que da lo mismo salvo cuando la silueta se da la vuelta por el borde.
  - **/simplify (07-10-2026).** Sin cambiar ni un sprite salvo el tono del basalto (la huella de `componer` en las semillas 1-40, sprite a sprite, es la de la vuelta 2 en las 25 semillas sin basalto, y en las 15 con basalto solo cambia el `tono` de sus laderas; `docs/agents/2026-10-06-paredes-laterales/huella.ts`):
    - **Un solo detector de canto.** Los `cantos` salen de las `laderas` (`cantosDe`), en el orden de la rejilla de antes, porque el azar de los peñascos va en ese orden. Con dos recorridos con su propia condición, si uno cambiaba, los peñascos volvían bajo las laderas sin que nada avisara.
    - **El módulo sabe lo que es.** `pnpm taller derivar-laderas` apunta en el índice de la hoja las `JuntasDeLadera` de cada módulo: `filo`, `pie`, `largo` y `papel` (`inicio`, `medio`, `largo`, `fin`, `esquina`). La elección de la cadena lee el papel y el largo de ahí, no del nombre. El catálogo se comprueba al cargarlo (`catalogoValidado`, en el cliente y en `leerCatalogo`): una ladera sin juntas lanza al cargar y no al componer el primer mapa que la use.
    - **Un guardia que ve huecos y solapes** (`laderasMalCubiertas`): cada casilla de ladera lleva un módulo de ladera, los peñascos del canto o nada donde no cabía un `medio`, reconstruido desde la geometría de cada sprite. Sustituye a la rama de laderas de `paredesFueraDelPie`, que solo pillaba lo que ya pillaba otro test. Con los medios pintados una casilla más al sur da 1 116 en las semillas 1-40; con uno de cada tres sin poner, 91.
    - **La frontal para por topes** (`topesDeCara`: `esquina`, `esquina-vecina`, `sigue`, `suelto`; `tramoDeFrontal`), con las esquinas por índice de cara. El test mide lo que cada frontal entra en la frontal de la esquina puesta, desde el filo de la esquina; la caja del sprite de la esquina no sirve porque lleva el derrubio, que entra de 0,89 a 1,3 casillas en la cara.
    - **`rampas`** descarta cada tramo de senda por su caja antes de recortarlo, en las caras, las laderas y `junto`: en las semillas 1-40, de 1,9 a 1,45 ms por mapa (sin laderas, de 1,0 a 0,75). Un índice de tramos por columna salía más caro (1,8 ms): montar el índice costaba más que lo que ahorraba. Lo que queda de más con las laderas es sobre todo `junto`, que con ellas es más largo.
    - **Las `laterales-*` de la vuelta 1** salen del catálogo (`leerCatalogo` las salta) y su encargo y su guía, de `paredes-puentes.ts`; las hojas siguen en disco.
    - **El basalto, más oscuro y algo más cálido** (el usuario, al aprobar la vuelta 2): `contrast(0.9) brightness(0.72) sepia(0.3) saturate(1.3) hue-rotate(-10deg)`, luz 60 → 53 y R−B 7 → 15 (la frontal da 71 y 20; la ceniza, 42 y 18). Uno más fuerte (contraste 0,8, luz 53, R−B 18) fundía la ladera con la ceniza.

**Los puentes (#157, 07-10-2026, docs/agents/2026-10-07-puentes/).** El nodo de agua llevaba un puente de dos orientaciones sacadas de la barrera (`barreraDeNodo`), sobre un tapón de tierra que cortaba el río. Ahora la casilla del nodo es agua en la escena, la pieza `puente-<piedra|troncos>-<eje>[-sube]` sale de las orillas que une (`puentes.ts`) y la senda acaba en sus estribos. Lo que costó encontrar:
  - **La pared de detrás no tapa el puente; la de delante sí.** Apartando del tablero toda pared, también la que el puente tapa a ella, la cara de una isleta o de la orilla de al lado se quedaba sin pared y se leía como un rectángulo de roca lisa (s10 x21 y28). La regla es la del pintor: tapa lo que es volumen y se pinta después (`vaDelante`, con `esVolumen` y `ordenDeVolumenes` de `separar`). Antes de #157, la pared de la cara de detrás tapaba 4 de los 26 puentes de las semillas 1-10.
  - **(Sustituido por `CaraDeEscena.pintada` en #159.)** **La cara que cede su pared a un puente se abre entera** (`CaraConRampas.abierta`) si tapa menos de la mitad: s9 x21 y8 era un rectángulo liso junto al estribo. La cobertura se mira a un cuarto y a media altura de la banda, porque a media altura no se veía la pared de una escalera, que se apoya más abajo y deja lisa la parte de arriba (s5 x4 y10).
  - **Los cruces quebrados** (orillas que no se miran, 35 de 101 en las semillas 1-40) dejaban 15 estribos en el río con el punto medio de las orillas; `asentar` los corre y escala (0,85-1,15) hasta dejar 0. Es provisional: sobra cuando el generador ponga los nodos de agua entre orillas enfrentadas (#161).
  - **El guardia de los puentes mide desde lo pintado** (/simplify): primero contaba con la misma pregunta que la puerta, y una regla de profundidad mal escrita se habría equivocado en los dos a la vez. Ahora `puentesTapados` ordena como `separar` y mira la línea del tablero punto a punto. Cuenta lo que se aparta del camino y la pared, no los muros: en la semilla 40 una torre de ruina tapa la punta sur del puente de `node-7`, y ya estaba antes de #157.

**Las caras lisas (#159 y #170, 07-10-2026, docs/agents/2026-10-07-caras-lisas/).** La cara de un acantilado se pintaba entera, la banda del filo al pie, y la pared iba delante. Donde la pared no entraba (la reserva de un castillo, el pasillo de la senda que baja al lado, el tablero de un puente) o donde su módulo es transparente —el octavo derecho de un bloque de `paredes-*` lo es hasta el 30-58 % del alto, `rocas-caidas` hasta el 61 %— asomaba un rectángulo de roca lisa de bordes rectos: la marca del usuario bajo el castillo de s2 (23, 9). Ahora **la cara se pinta solo bajo la silueta de su pared** (`caras.ts`): cada módulo de pared, ladera y pedregal lleva en el catálogo el perfil de lo alto de su silueta (`Modulo.perfil`, 32 franjas, `perfilDeModulo` al rehacer el catálogo), y `pintadaDeCara` da por columna, cada 0,05, de lo alto de la silueta a lo bajo de la pared (`CaraDeEscena.pintada`); donde no hay pared se ve el suelo de abajo, como en un tajo. El borde es el del arte, irregular sin ruido. Sustituye a `abierta`, `huecos` y `CUBIERTA_PARA_QUEDARSE`, que solo miraban las caras que cedían a un puente y con cajas. El informe cuenta `carasLisas` (lo pintado que no tapa ninguna silueta, en trozos de 0,3 × 0,3): con la banda entera da 895 en las semillas 1-40 (sobre 3343dcf); con `pintada`, 0. Lo que costó encontrar:
  - **El perfil va por la columna que empieza más abajo de su franja**: con la más alta, la cara asomaba por encima de la cresta en los dientes del módulo.
  - **Una pared colgada sobre otra** (la de una escalera que se apoya por encima del pie y, debajo, la cresta de la de la fila de abajo) dejaba entre las dos una tira lisa de 0,44 en s37 y7 x19: pintar de lo alto de la primera a lo bajo de la última la pintaba. Por columna se pinta solo el tramo tapado seguido más largo, con juntas de hasta 0,15 (`JUNTA_ENTRE_PAREDES`), que son el fondo entre módulos.
  - **El contorno y el tajo de una rampa van en dos recortes**: en el mismo `evenodd`, lo del trapecio que cae fuera del contorno contaba como dentro y se pintaba.
  - **Delante de un castillo al borde de un acantilado la cara se abre** (decisión del usuario, 07-10-2026): sin desnivel visible, antes que una pared entera tapando el pie del castillo.
  - **#170, el pedregal suelto**: los peñascos que quedan donde no entró una pared y las rocas del pie llevaban el tono de su cara (`brightness(0.5)` del basalto), y sin la cara detrás se leían como manchas negras en el llano (s9, junto al castillo del sureste). Con todo puesto, `tonoDelPedregalSuelto` les deja el de la cara si tienen una pared o una ladera a 0,3 y si no les da el de su suelo, como a las rocas esparcidas. Peñascos sueltos con el tono de otro suelo en 1-40: 101 (43 oscuros) → 0. Las rocas de los cantos este/oeste sin ladera no se tocan: el pintor oscurece el canto.

Las reglas que cambiaron por el camino y conviene no deshacer sin medir:

- **Perder la base elimina en el acto**, aunque queden héroes o ciudades. Es la
  regla de victoria de NuevaJugabilidad («se gana tomando las bases rivales»), que
  el usuario adelantó de la fase 3 al ver la 2a. Sustituye a la que había
  improvisado el ingeniero —sin héroes, sin base y sin oro para contratar—, que
  cerraba 162 de las 200 partidas del banco sin que nadie la hubiera pedido. Y por
  eso `captureTown` **no** comprueba la derrota: tomar la base con su héroe dentro
  es capturar **y después** derrotar al héroe, y lo comprueba quien llama al acabar.
- **`game_over` es el último hecho por regla del núcleo**: `emit` lanza si la
  partida ya terminó y el hecho no es `game_over`. Los `return` de los bucles se
  quedan —son los que hacen que no se llegue ahí—, y el invariante de la crónica
  sigue mirando veinte partidas; lo que cambia es que un bucle nuevo que se olvide
  revienta donde escribe, no en la semilla que lo pise.
- **El castillo y la mina ya no bloquean el paso.** El castillo es un nodo, y si
  bloqueara cortaría la red justo donde la red pasa. Pisarlo de camino hace lo
  mismo que pisarlo de destino, **incluido recoger la guarnición**. Y tomar de
  camino la base del rival **corta la marcha**.
- **Los puntos de movimiento del día se fijan al empezar el día.** Unirse a tropa a
  mitad de turno —recogiendo la guarnición o reclutando— no recorta los que quedan;
  la criatura más lenta cuenta desde mañana. Antes se recortaban, y eso obligaba a
  distinguir pasar por casa de llegar a ella. **Regla de juego por verificar contra
  fheroes2**: no se cita como suya sin haberla comprobado.
- **Lo hostil se alcanza pero no se cruza, en el camino de todos.** Un héroe ajeno
  y un castillo ajeno guarnecido son final de trayecto, como un monstruo en pie:
  el Dijkstra del mapa los recibe (`casillasHostiles`) y la IA, la persona y el
  agente piden el camino por `alcanceDelHeroe` y `caminoHasta`. Con los pasos
  estrechos, cruzarlos era meterse en una batalla no elegida —la semilla 54 no
  terminaba—. Antes solo se defendía la IA, retrocediendo la cadena de
  predecesores de cada candidato: 147 de los 209 ms de `chooseHeroDestination`.
  Un invariante impide llamar a `findPath` o `reachableFrom` fuera de `game.ts`.
- **La base del rival vale el triple** que otra ciudad para la IA, y es una cifra
  **medida**: sin el ×3 las 1 000 semillas terminan igual, pero la cola se dispara
  —mediana 4 → 7 días, p90 7 → 16, p99 13 → 42, máximo 20 → 80—. El arreglo de
  fondo es valorar por lo que cambia la conexión a la base (#115).
- **La base nace con guarnición** (`data/ciudades.json`, `guarnicionBase`),
  inventada y provisional: tres de nivel 1, dos de nivel 2 y dos de nivel 3 de la
  facción del dueño, que son **7 individuos y 20 de liderazgo** —el cupo de un
  bando y el tope de una guarnición, los dos comprobados al cargar
  (`problemasDeGuarnicion`)—. La base es la **primera ciudad de su dueño** en el
  plan, y esa regla vive en un sitio (`primeraCiudadDe`) que leen `createGame` y
  `buildMap`. **No deshizo la carrera, y se sabe por qué**: dentro de esos dos
  topes una guarnición no es más fuerte que el ejército de un héroe —que lleva lo
  mismo y además pelea él—, la IA solo asalta lo que vence (197 de 198 asaltos
  ganados) y el héroe dueño se la lleva al pasar por casa o al volver vencido. Se
  midieron siete composiciones: solo las que pasan del tope de guarnición alargan
  la partida (con el tope a 30, mediana 7 y p90 10), y subir ese tope es relajar
  dos guardias de `tropa.test.ts`, decisión del usuario. **Y la base llena no
  admite reclutas sin el héroe dentro**: en el banco, los 600 reclutamientos del
  día 1 pasaron a 0.
- **Con el héroe del dueño dentro, la ciudad la defiende solo él con su tropa**, y es la batalla final: si cae, la ciudad cae con su guarnición sin que esta pelee —y con la base, la facción—. Regla decidida por el usuario («Solo el heroe con su tropa, es la batalla final (si pierde)»), no un olvido: la fija un test de `game.test.ts` y la cuenta `enemyAt`.

Medido al anclar (`02bf2610…`): 0 de 200 sin terminar en el banco y 0 de 1 000 en
el barrido; en las 1 000, mediana **4** días, p90 9, p99 13, máximo 22, y el
jugador 0 gana 293. En el banco, 61 de 200 (mediana 5, p90 9, máximo 14), y con
control de esquina el caballero el **26,25 %** —desde 60,75 sin guarnición—. La 2b —«el territorio a la vista»— trae los tres recursos, el
territorio en el turno del agente y en el cliente, y la IA que corta y defiende.

## Los asaltantes de caminos

Grupos neutrales de 1 a 7 individuos que **patrullan una región sin dueño** y
**emboscan** al héroe que la pisa si le sacan el margen (`ventajaClara`, el mismo
1,6 con el que la IA ataca a un monstruo: **una regla, tres lectores**, en
`ai/fuerza.ts`). Lo decide `state/asaltantes.ts`, que no escribe la crónica; lo
aplica `game.ts`, que es el único que llama a `emit`.

- **Un asaltante es un actor y no un objeto del mapa** (`GameState.raiders`). La
  niebla **copia** los objetos a `player.memory` y `knownObjects` decide qué es
  presente por la casilla RECORDADA: un objeto que se mueve se enseñaría donde ya
  no está o filtraría dónde está. Un actor se ve ahora o no se ve, como un héroe
  enemigo, y no deja recuerdo. Al agente le llega en `knownMap.raiders` —la misma
  llamada para el turno y la tool `map`—, con su fuerza, y cada héroe suyo lleva
  la suya (`strength`): sin las dos cifras no puede saber si lo emboscarán.
- **La emboscada es una batalla al revés**, y por eso `PendingBattle.attacker`
  dejó de ser un héroe: `{kind: 'raider'}` ataca y el héroe defiende. «El
  atacante es siempre un jugador» estaba escrito en dos comentarios del servidor y
  era la premisa de `battleOwners`; contarlo al revés —el héroe «ataca» con una
  marca de emboscada— le habría dicho `yourSide: attacker` al agente emboscado.
- **No cruza nodos ni se pega a uno**: patrulla las casillas de su región que no
  tocan un nodo, así que nunca tapa un paso. Embosca **al pisar**, no por la
  noche: un héroe parado no se ataca. Se dispersa en cuanto su región tiene dueño
  —lo llaman `captureNode` y `captureTown`, los únicos sitios donde una región
  puede ganarlo— y brota los lunes donde no hay nadie, **también junto a casa**
  (corrección del usuario al plan: «No, también en casa»).
- **El techo de fuerza está en datos y lo vigila un test**: un grupo más fuerte
  de lo que un héroe llega a llevar es un **muro eterno** —en el prototipo, 7
  vampiros contra héroes de nivel 2 —el 6 en la escala única de hoy— dejaban 110–134 partidas de 1 000 sin
  terminar—. `data/asaltantes.json` lleva `liderazgoMax` y `fuerzaMax`, y el
  cargador comprueba cada composición. El test **no** lo mide contra un héroe
  ideal, que es lo que hacía al principio (526 a fuerza bruta): lo mide contra lo
  que alcanza de verdad un héroe recién hecho —nivel 5, el 1 de antes de la
  escala única— que **espera en su base** con el cupo
  lleno de lo más barato mientras la IA construye, licencia y recluta. Aquel 526
  era cierto solo si el héroe podía cambiar su tropa, y hasta licenciar no podía.
  El plan del agente pasa por la misma comprobación (`problemasDeAsaltante`).
- **La causa de las 270 emboscadas perdidas no era la IA: el héroe no podía
  crecer.** Su cupo de 6 se llenaba de lo barato, no había forma de cambiarlo, y
  su fuerza se paraba en 200-300 con millones de oro en la bolsa. El «si el
  alcance prudente no da destino, ve igual» tapaba ese muro mandándolo a perder:
  quitándolo sin más, 27 de 60 partidas se atascaban. Lo arregló **licenciar**
  (la acción `dismiss`, abajo): ahora la IA **se repliega** —vuelve a su base, o
  se queda— y allí cambia tropa hasta que los grupos dejan de sacarle el margen.
  En el banco: **304 emboscadas en 200 partidas → 0**, 0/40 y 0/1 000 sin
  terminar, y el máximo de días baja de 49 a 35. Lo que tiene de malo, dicho: la
  IA **no limpia** grupos —ni una batalla contra uno en 1 000 partidas—, los rodea
  y las regiones se vacían cerrándolas; la IA buena es #115.
- **Y si los dos se quedan encerrados, el que juega vuelve a casa igual**
  (`ai/turn.ts`, vuelta 1 de QA de los mapas densos). Si el alcance prudente de
  un héroe es **su propia casilla** —en mitad de una región que lo embosca, sin
  un nodo al lado— y los héroes del rival están igual, vuelve a su base por el
  alcance de siempre. Era un empate eterno: un grupo no ataca a un héroe parado,
  y con un héroe por bando y los dos encerrados nadie cambia nada (semilla 10 del
  banco: 298 días sin moverse nadie). La condición del rival no sobra: sin ella,
  en la semilla 11 el héroe salía a la emboscada un día antes de que el rival
  ganara, y con los mapas de antes cambiaban 21 de 200 partidas; con ella,
  ninguna. El precio, a la vista: **1 emboscada** en las 200 del banco, la de esa
  vuelta a casa.
  **Dos casos quedan abiertos, no vistos en 2 000 partidas** (vuelta 2 de QA):
  un rival **sin héroes** —`todosEncerrados` exige que haya alguno, así que el
  encerrado se queda quieto— y un héroe encerrado en una ciudad propia **que no
  es su base**. Se dejan hasta que una semilla los dé.
- **El alcance prudente no pisa la región que embosca, tampoco la suya.** Es una
  opción del mismo Dijkstra (`alcanceDelHeroe(…, { evitarEmboscadas })`, una sola
  puerta), con esas casillas como **muro** y no como final de trayecto —la
  primera casilla ya es la emboscada— y el origen respetado, que es lo que deja
  salir por el nodo de al lado a un héroe que se ha quedado mermado dentro de una.
  Dejándole andar por la suya eran 23 de las 33 emboscadas que quedaban.
- **Un grupo se ve al ver su región, y la marcha se para al descubrirlo** (#130,
  07-10-2026, opción C elegida por el usuario). Con «se ve su casilla», el héroe
  —ve a 4 casillas y anda unas 11 el día 1— se metía en regiones que nadie había
  mirado: medido en 100 semillas, en **81** había alguna casilla alcanzable el
  día 1 que acababa en emboscada sin rombo ni barra (2 228 de 12 420 rutas).
  Ahora `asaltantesALaVista` (en `asaltantes.ts`, la única regla) ve el grupo
  en cuanto se ve una casilla de su región —también sobre la niebla negra: el
  terreno no se regala—, y `moveHero` se para con `march_halted` si, andando,
  aparece un grupo que lo emboscaría más adelante y que la ruta no avisaba.
  Medido igual: **0 de 100**, 0 rutas; 429 marchas paradas. Lo leen la ruta, el
  lienzo, la barra, el agente (`knownMap.raiders`) y el sello de la crónica
  (`raider_spawned`/`raider_dispersed`). En el banco cambian **solo** 427 sellos
  `seen` de esos dos hechos, todos ganando al jugador que mira la región, y
  ningún `march_halted`: la IA no pisa esas regiones. Re-anclado en
  `6157d75a…` tras fusionar los restos (#121), que no mueven el hash. Al agente
  el veredicto se lo cuenta como marcha parcial (`paradaDeLaMarcha`, en
  `notas.ts`, formatea `march_cut`, `march_halted` y la emboscada que salta
  antes del destino, que antes salía «aplicado entero»: M-4 de #121).
  Detalles que los comentarios ya no cuentan:
  - La regla de qué grupo se ve estaba escrita **tres veces** —la ruta,
    `serializeKnownMap` y el lienzo— y las tres decían «su casilla»; cambiar una
    sola habría dejado a la persona y al agente viendo grupos distintos. De ahí
    el guardia de `invariantes.test.ts` y, desde /simplify, la marca de tipo
    `AsaltantesALaVista`: lo que pinta el lienzo (`VistaMapa.asaltantes`) y lo
    que avisa en la ruta solo lo fabrican `asaltantesALaVista` o, sin niebla,
    `todosALaVista`. El grep no veía `escena: state`, que era la regresión más
    probable; el tipo sí (visto morder: `state.raiders`, un `.filter` encima y
    olvidar el campo, los tres no compilan).
  - La ruta que avisa sigue sin avisar de lo que no se ve: lo que cambió es qué
    es verse (su región, no su casilla), no esa restricción.
  - Sin la frase de la barra, el héroe parado se quedaba a medio camino con
    puntos de sobra y parecía un fallo de la marcha.
  - Los dos tests de la rendición de `agent-link.test.ts` (semilla 106) veían en
    realidad la emboscada de unas momias que no se veían al salir; desde #130 la
    marcha se para antes y la batalla no llega, así que quitan los grupos
    (`sinAsaltantes`) y la batalla es la del monstruo, que es lo que dicen.
  - /simplify: el sello de `raider_spawned`/`raider_dispersed` construía
    `visibleNow` y sus regiones para una casilla (2,1 % del banco); ahora
    `grupoALaVistaDesde` mira la casilla y, si no, recorre los cuadrados de
    visión (`miradasDe`) sobre `regionDe`. La vara de cada hecho está en
    `SE_VE_POR` (`events.ts`). La parada calcula una vez el primer grupo que la
    emboscaría sin niebla y en cada paso solo pregunta si ya se ve; si un nodo
    tomado de camino lo dispersa, se mira el siguiente. La emboscada que corta la
    marcha lleva `faltan` en su `battle_started`: el núcleo dice que no llegó y
    la nota del agente ya no lo deduce comparando casillas (el banco no tiene
    ninguna emboscada de grupo, así que el hash no se mueve).
  - **QA (H1, H2): la fuerza cambia a mitad de marcha.** «Calcular una vez el
    primero que embosca» fallaba si el héroe recogía la guarnición de su base
    por el camino: en `?seed=198`, día 3, la ruta avisaba de raider-1, el héroe
    recogía la guarnición en el primer paso, raider-1 dejaba de sacarle el
    margen y lo emboscaba raider-3, a la vista desde cuatro pasos antes, sin que
    la marcha se parase (1 de 7 260 marchas al azar). Y al revés, se paraba por
    un grupo que ya no lo emboscaría (4 de 470 paradas). Ahora
    `vigiaDeLaMarcha` recalcula quién embosca cuando el paso deja un hecho más
    que el `hero_moved` —guarnición, nodo que dispersa—, y la regla es «se para
    al ver uno que la emboscaría con la fuerza de ahora y **no es el que la ruta
    avisaba al salir**», no «que no se veía al salir»: raider-3 pudo verse desde
    el principio sin que la ruta lo nombrara, porque la ruta nombra uno. La
    medida de `medir.ts` que daba 0 no lo veía: contaba como avisada cualquier
    emboscada con aviso, de cualquier grupo, y solo miraba el día 1 y destinos
    de hoy. Endurecida (avisada = la ruta nombraba a ese grupo; días 1-7;
    destinos lejanos), con la regla vieja da **16** sin aviso en 300 semillas
    (198 y 16) y con la nueva, **0**.
  - **QA (H3): un grupo que reaparece andaba desde un recuerdo.** El lienzo
    recuerda la última casilla donde pintó cada grupo para deslizarlo; con la
    regla nueva entran y salen de la vista con su región, y uno que volvía tras
    días sin pintarse cruzaba la pantalla desde allí. `pnpm capturas` lo pilló
    en la semilla 50 (la foto de «antes» de la patrulla, a mitad del paseo). Se
    olvida lo que un fotograma no pinta (`olvidarLosQueNoSePintan`).
  - **QA (H4): `march_halted` lleva el grupo y su tropa**, así que se sella por
    la casilla del héroe **y** el grupo (`SE_VE_POR`): el rival que mira al héroe
    sin ver la región no lo recibe. Latente: hoy el rival es siempre la IA.
  **La ventaja que queda, declarada**: la IA de reglas mira `state.raiders` sin
  niebla (`casillasPeligrosas`, `strategy.ts`), así que evita regiones que la
  persona y el agente todavía no ven. Es de #115 decidir si debe tener niebla.
- **Licenciar** (`dismiss`): en un castillo propio, un héroe licencia individuos
  de su tropa —se van, no vuelven a la guarnición—, desde el final, con su
  `dismissBlocker` y su frase. Va en el contrato con su prosa, en el castillo del
  cliente (un «−1» por criatura) y en la IA (`planCambio`: licencia lo más barato
  que pegue menos, solo si lo que entra pesa más que lo que sale). `pnpm qa` lo
  exige cruzando el circuito.
- **La patrulla no es un hecho.** Era `raider_moved`, el 20 % del volcado, y no lo
  leía nadie: dónde está un grupo es estado, y el lienzo anima con él. Lo que sí
  se cuenta es que un grupo está en el mapa (`raider_spawned`) **con una sola
  regla**, nazca con el mapa o un lunes: el sello decide quién se entera, y el
  panel de la persona —que no pasa por la niebla— no pinta ese hecho de mapa,
  porque el grupo ya se ve en el lienzo.
- **El espectador comprime los finales cuando va atrasado**: con las emboscadas
  del agente llegó a enseñar el fin de la partida 22,6 s después del `game_over`,
  10 de ellos finales retenidos 2,5 s enteros. El telón los retiene ahora al
  mismo ritmo al que cuenta lo atrasado (`retencionDelFinal`) y el plazo de
  `pnpm capturas` vuelve a ser un número fijo, medido: 16,1-16,2 s → 21 s.

## El núcleo por dentro: 2,25× sin cambiar una sola partida

Cinco optimizaciones, cinco commits, y **el ancla del banco intacta en los cinco**:
`297dbef9…`, 32 177 líneas, byte a byte igual antes y después. Las 200 partidas
bajan de **3 910 a 1 741 ms** y `autoResolve` de 156 a 60 ms.

| Issue | Qué recorría de más |
|---|---|
| #65 | `moveHero` relanzaba `findPath` desde el mismo origen que la IA acababa de recorrer |
| #78 | `moveTo` recalculaba `movableCosts` para cobrar la carga: el tercer BFS del mismo turno |
| #76 | el BFS del tablero tenía el `Hex` en la mano y se reconstruía dos veces |
| #77 | `findPath` y `reachableFrom` eran el mismo Dijkstra copiado |
| #75 | ese Dijkstra hablaba en cadenas `"x,y"`; ahora en índices |

**Dos de las cifras por commit las corrigió QA hacia abajo, y la lección es del
instrumento:** `autoResolve` es **bimodal** —57 a 89 ms para código idéntico en
seis pasadas—, así que el «−50 %» de #76 era la punta buena y la mediana real es
≈ −39 %; y #77 no es «indistinguible de cero» sino **+0,8 % más lento**, con los
rangos sin solaparse. Ninguna de las dos mueve una partida, y el racimo entero
sigue en 2,25×. Tres pasadas no bastan cuando la medida es bimodal: hay que mirar
si lo es antes de creerse la mediana. Desde #99, `pnpm banco` mide `autoResolve`
en cinco tandas e imprime mínimo, mediana y máximo con las cinco cifras.

**El orden no era cosmético.** #77 tuvo que ir **antes** que #75, al revés de lo
que decía su propio issue: `Frontera` recibía claves de texto, y el índice plano
las quiere numéricas. Con **dos** Dijkstra mirando, la salida barata habría sido
una segunda clase de frontera con sus propias copias de `agotada` y `ultimoPop`
— o sea **relajar los dos `throw` del desempate sin escribir en ninguna parte que
se estaban relajando**. Unificando primero hay un solo llamante y el problema no
existe. El precio, ~40 líneas escritas dos veces, es barato al lado de eso.

Y #77 es un **merge semántico y no una extracción**, que es la parte que un lector
futuro va a dar por obvia: `findPath` adopta la regla de `reachableFrom` y empieza
a empujar las casillas bloqueadas que antes saltaba, así que **los `orden` ya no
coinciden**. Sale igual porque una bloqueada no se expande y porque `orden` se
asigna en orden de `push`, de modo que insertar entradas nuevas conserva el orden
**relativo** de las comunes — que es lo único que mira el comparador. Además del
ancla, se comprobó con **43 160 pares (origen, destino)** sobre 40 mapas contra el
`findPath` de antes: **0 discrepancias**, con 28 314 destinos bloqueados.

**Lo que más valió del ciclo fue romper el plan, no seguirlo.** Tres afirmaciones
del plan resultaron falsas al ir a comprobarlas a mano, y las tres se corrigieron
en el código y no en el informe. La mejor: se creía que la posición de la parada
en el Dijkstra era necesaria para la **corrección**; se probaron las otras dos y
el barrido de 43 160 pares salió en cero con las tres. Se queda donde está por lo
que **sí** cuesta —un destino bloqueado recorrería el mapa entero—, y el
comentario dice eso ahora en vez de lo que se creía.

## La base caminable (antes, la pantalla de castillo)

Hasta el 09-10-2026 el castillo era un **cuadro de doce cajas fijas**
(`render/town.ts`, `townPlots`): cada edificio era un PNG suelto con su isla de
hierba escalado a su caja, cada solar vacío una parcela punteada y debajo una
franja de reclutamiento. Se veía a la vez lo que tenías y lo que te faltaba,
pero no era un lugar: el usuario pidió «una escena con sentido con todo
integrado», por la que te mueves y hablas con gente, «así la puede usar el motor
de narrativa para la historia» (`docs/agents/2026-10-09-base-caminable/`).

**La primera vuelta** (09-10-2026, sin commitear) fue una plaza cenital: un
fondo con calles, solares de tierra y los edificios plantados encima, un suelo
con huecos y un grafo de visibilidad para rodearlos. Funcionaba, pero el usuario
la vio como un tablero con figuras diminutas y pidió rehacerla «como las de
combate pero sin casillas»: delante un espacio a escala de personaje, «mas
estrecho que el de combate, como a la mitad»; detrás los edificios en
semicírculo, «se ve la puerta y lo que entre de alto»; scroll horizontal y
movimiento libre.

**Ahora la base es un escenario lateral** (`escenas/castillo.ts`, `render/base/`).
Todo va en **pasos de combate**: el paso sale de la misma cuenta que el tablero
(`escalaDelCombate`, que leen `tableroPara` y `pasoDeLaBase`), así que un adulto
mide lo mismo en la base que en una batalla en el mismo lienzo. Solo se comparte
el paso: el suelo se aplasta a 25°, como el arte, y no a los 35° a los que el
combate levanta la cámara cuando sobra alto —con 35° la raya de atrás de la
franja quedaba medio paso por encima del empedrado pintado—. En el móvil la base
va en el marco de 380 px del combate y su paso es el de una batalla de 860 px
(`ANCHO_DEL_COMBATE_EN_MOVIL`); en un escritorio de lienzo menor que 860 la
figura sale hasta un 20 % mayor (aceptado por el usuario). La franja que se pisa
mide 3,5 pasos de fondo (la mitad de los 6,93 del combate) y 24 de ancho; se anda
en recta y un clic fuera se recorta (`alaFranja`); la cámara sigue en horizontal
como `followCamera` de la rama del rpg (`seguir`, `camaraQuieta`). Detrás, las
fachadas: el JSON (`data/bases/<f>.json`) solo dice la `x` de cada sitio y
`arcoDeLaPlaza` deriva su profundidad (media elipse: 2,2 pasos detrás de la
franja en el centro; los extremos se adelantan hasta 1,8 pasos dentro de ella) y
su giro, que es el de la tangente (52° en los sitios de los extremos). Lo que se
pisa empieza 0,3 pasos por delante del pie de las fachadas (`bordeDeAtras`), y es
convexo, así que andar en recta no se sale. **Toda figura va delante de toda
fachada** (se pintan primero todas las fachadas), y entre fachadas la más honda
primero. El ayuntamiento va en el centro, sobre la
costura de las dos mitades del panorama, porque existe desde el día 1. **Un sitio
sin construir enseña el relleno del panorama** (muro, setos, árboles): no se nota
que falte nada. La escala de cada fachada sale de su puerta, que mide 1,3 pasos
(`colocarFachada`, la única cuenta que leen el pintor, el golpe y `vista-base`);
Codex no pinta la puerta a los 300 px que se le piden, así que se mide a mano en
`fachadas` del JSON. Quien camina va un `PRISA_EN_LA_BASE` (1,6) más deprisa que
en una batalla, para llegar al ayuntamiento en menos de 1,5 s.

**Ajustes tras ver la vuelta 2** (09-10-2026, aprobados por el usuario). Con
el marco del escritorio entero (1080×773, 8,7 pasos de alto) una fachada de ~6
pasos cabía con cielo encima y, el día 1, con dos edificios, se veía sobre todo
el relleno del panorama: un muro bajo con campo detrás, «un descampado». Y con
el pie de 1,1 a 2,2 pasos detrás y giros de ±37° las fachadas se leían en una
calle recta. Tres cambios: (1) **el marco de la base es apaisado** en el
escritorio (20:11, 6,7 pasos de alto: se ven la puerta y lo que entre, y las
del centro se cortan por arriba) y **el panorama cierra la plaza**: un anillo
alto de traseras de casas, sin campo, horizonte ni cerca; (2) **el arco se curva
de verdad**: los extremos (1,05 y 22,95, en espejo) se adelantan dentro de la
franja y giran 52°; las fachadas de los extremos (moradas 5 y 6 y sus mejoras)
se volvieron a pedir a ese giro, las demás se desvían ≤ 6° del suyo y se
quedaron; (3) **la gente de la base va sin armas**: todos los reposos del Y Bot
eran guardias con el arma en la mano, así que hay un juego nuevo, `civil`
(reposo y marcha de ambiente de Mixamo, sin atrezo), y encargados y vecinos se
pintan con él (`CUERPO_DE_VECINO`). Codex no deja el pie del anillo de casas en
la fila que se le da: queda ~170 px (1,3 pasos) más al fondo en el centro, con
un trozo de empedrado entre la franja y las casas.

**La gente y el narrador.** Un encargado por sitio construido y los vecinos de
la facción (`data/vecinos.json`), con el cuerpo de una criatura del catálogo
(el Y Bot teñido, en el color neutro; quien camina, en el del jugador). Lo que
dice cada uno es `vozDe` (`core/town/voces.ts`): la línea que escribió el
narrador o, sin ella, una frase de respaldo elegida con su propio `createRng`
(la partida no se entera: el banco no se movió). La petición `town_voices` le
pide al agente las voces de sus bases caducadas —semana nueva o un **sitio**
levantado por primera vez— en una sola petición antes del turno. Con «cualquier
edificio nuevo» salían 6 para 6 turnos en `pnpm qa`; por sitios, 3 para 6
(09-10-2026). `ponerVoces` es el único que escribe `Town.voces` y juzga cada voz
y cada línea sola. El navegador nunca tiene agente, así que allí siempre habla
el respaldo; lo narrado se lee en el espectador («Voces de la base»).

**El arte** (caballero) es del taller (`tools/taller/base.ts`), por Codex: el
panorama en dos mitades de 1536×1024 a 128 px por paso (con una sola imagen
saldrían 64 px por paso, ampliados ×1,4-1,7 en un escritorio), cada una con su
guía hecha desde la disposición —el suelo en sus filas exactas a 25° y un
«RELLENO» en cada sitio—, y la derecha con la izquierda como imagen contigua; y
veinte fachadas altas, sin peana ni atrezo, giradas como su sitio, con una guía
que pone la puerta de 300 px junto a la silueta de un adulto, cada mejora con su
edificio de antes (`antes`) y su giro. Se revisa con `pnpm taller vista-base
knight` (la disposición, la compuesta y la tira de fachadas con la puerta medida
frente al adulto). El nigromante va con marcadores (cielo, muro bajo de relleno,
suelo entonado y bloques con su nombre) hasta su ciclo. El arte viejo de fal.ai
(`assets/generated/buildings` y `towns`) se retiró con sus prompts.


**La vuelta 3: un solo cuadro** (09-10-2026). Con los ajustes, el usuario: «No
quedan integradas, se nota que es un extra». Su idea: pedir una imagen con todos
los edificios, con la misma perspectiva, y recortarlos con un inpainting. Tres
pruebas de concepto (`docs/agents/2026-10-09-base-caminable/poc-inpainting.md`)
la confirmaron: la placa (el maestro editado sin edificios, petición nueva; reabrir
el hilo falló dos de dos) no mueve ni un píxel y su grano repintado (13/255) queda,
desenfocado, diez veces por debajo del umbral; el recorte integra. Lo que no salió
fue la geometría: Codex pinta la curva casi recta y con seis edificios por cuadro
los pequeños se encogen (puertas de 0,85 adultos); con la silueta de un adulto
como vara de medir y tres por cuadro, las puertas quedan de 1,05-1,93 adultos. Por
eso: cinco tramos de tres a 128 px por paso, 50 pasos de escenario, y **manda el
cuadro** (la disposición se mide sobre él; `arcoDeLaPlaza`, las fachadas sueltas
y su puerta medida se retiraron). El cierre por desenfoque de la prueba
redondeaba las esquinas (~20 px de radio: 88 % de un rectángulo); se le devuelve
lo que la diferencia encendió cerca del edificio (`mascaraDeLaDiferencia`).

**La costura de la vuelta 3** (09-10-2026). Cosidos a tope, dos tramos no casan:
con la placa de al lado como `contigua`, T2 salió con el muro 120 px más alto y
otro adoquín; con el final de T1 pintado en su lienzo, Codex lo conservó píxel a
píxel pero subió la plaza 55 px justo después (escalón al pie del muro y raya en
el empedrado). Decisión del usuario: **suelo propio y pilar en la junta**. El
empedrado es uno para toda la plaza (`suelo.webp`, del medio de una placa: hacia
los lados Codex abre las juntas en abanico y el trozo entero dejaba una uve en
cada vuelta), y de cada tramo se pinta lo de encima de su pie, alineado por él:
pedidos por separado, T1 pintó la plaza a 790 y T2 a 687, y da igual. La junta es
un árbol alto con su pilar en cada borde que da a otro tramo; el solape baja de
256 a 64 px, dentro del árbol. La línea del pie solo puede errar hacia abajo
(máximo de 64 px tras la mediana): medida por encima, el zócalo de piedra o una
puerta de madera parecidos al empedrado quedaban debajo del suelo nuevo y el
edificio flotaba.

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

**08-10-2026 (#139)**: `tools/gen/animate.ts`, la tanda `creatures` de
`pnpm gen` y lo que escribían (`assets/generated/creatures/` y `anim/`, 6,8 MB)
se retiraron: desde que toda figura es su arte de 8 direcciones o el Y Bot
nadie los cargaba (`GRUPOS_QUE_SE_PINTAN` ya filtraba las criaturas del
manifiesto, y la red del juego, el espectador y la arena no los pedía).

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

**`set -m` va en su propia línea, y esto es la parte que muerde.** Escribir
`set -m && pnpm dev > log 2>&1 &` **desarma la receta entera en silencio**: en
bash el `&` se aplica a la lista `&&` completa, así que lo que se manda al fondo
es `set -m && pnpm dev` **como un solo trabajo en una subshell**. `$!` apunta a
esa subshell, y `set -m` corre **dentro** de ella, de modo que al bifurcar el
`pnpm` real el control de trabajos lo mete en un grupo nuevo suyo.

Y lo peor no es que falle: **es que el guardia da verde**. La subshell es su
propio líder de grupo, así que
`[ "$(ps -o pgid= -p "$DEV")" = "$DEV" ]` **pasa**, el `kill -TERM -$DEV` se
ejecuta, mata la subshell y **el vite sobrevive con el puerto ocupado**.
Reproducido las dos formas seguidas con `pnpm dev` de verdad:

```
FORMA BUENA (`set -m` en su línea):   $!=205934  pgid=205934
  205934  pnpm dev              pgid=205934   ← $! ES el pnpm
  205989  vite.js               pgid=205934   ==> muere entero, 3100 libre

FORMA MALA  (`set -m && …  &`):       $!=209781  pgid=209781  ← el guardia dice SÍ
  209783  pnpm dev              pgid=209783   ← ¡otro grupo!
  209795  vite.js               pgid=209783   ==> SOBREVIVE, 3100 ocupado
```

La comprobación responde a «¿es este PID su propio líder de grupo?», que **no es
la misma pregunta** que «¿está en este grupo lo que lancé?». Por eso hace falta
lo siguiente, que es la lección de este documento aplicada a sí mismo — una orden
documentada hay que verla arrancar, y también **verla morir**:

```bash
# Después de matar, SIEMPRE se comprueba. Sin esto no sabes si mataste algo.
ss -ltnp 2>/dev/null | grep ':3100' || echo "libre"
```

**Y `ps` no te dice de quién es un `vite`.** Aparece como `sh -c vite`, sin ruta
ninguna: mientras se escribía esto había un vite de `/home/al/code/ai-tutorials`
corriendo en esta máquina, de otra sesión, indistinguible del propio en un `ps |
grep vite`. El dueño se identifica por el **puerto** (`ss -ltnp` da el PID que
tiene el socket) y por **`readlink /proc/<pid>/cwd`**. Esa es la comprobación que
protege al de al lado, y va antes de cualquier `kill`.

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
| `pnpm verify` | 13,7 s | siempre |
| `test/invariantes.test.ts` | 505 ms | va dentro de `pnpm test` |
| El navegador | minutos | si el cambio se ve |
| El espectador en el navegador | minutos | si tocas `html.ts`, `espectador/` o el canal |
| `pnpm qa` | 3,2 s | si tocas `src/server/` o el contrato |
| `pnpm capturas` | ~245 s | si el cambio se ve: juega el cliente, el espectador y la arena en Chromium y sale 1 con un error en consola |
| `npx tsx tools/qa/barrido-semillas.ts` | 1,1 s | si tocas la IA o la economía |
| `pnpm banco` | 5,2 s | si tocas el núcleo sin querer cambiar el juego |
| `tools/qa/enfrentamiento.ts` | 1,9 s | si cambias **cómo decide** la IA de batalla |
| CI (`.github/workflows/ci.yml`) | ~1 min | en cada push y cada PR |

**`pnpm capturas` espera al suelo pintado (06-10-2026, #154).** Capturaba el
mapa del espectador a los 800 ms y el del cliente a los 450 ms, con el
sucedáneo de pigmentos todavía a la vista: sin texturas ni caminos. Ahora cada
página del cliente, y el espectador antes de su primera captura del mapa,
esperan a `#app[data-escenario="pintado"]` (`esperarElSuelo`), con un tope que
falla diciendo en qué estado se quedó: 60 s en el cliente y 25 s en el
espectador, por debajo de los 30 de `HEROES_WAIT_AGENT_MS`. Son ~7-8 s por
página: la corrida pasó de 194 a 244 s, medido una vez cada una. Por defecto
deja los PNG en `.cache/capturas/` (ignorada por git y de cada checkout), no en
la carpeta del ciclo del cliente nuevo; un ciclo que quiera guardarlas le pasa
la suya.

Los tiempos están **medidos**, tres pasadas cada uno, no estimados: los que
había antes decían 3 s y «~1 min» y llevaban ciclos siendo falsos. Que `pnpm qa`
tarde 5 s y no un minuto no es una mejora: es que la partida se acaba el día 4
porque el agente defiende y pierde, así que la cobertura real son **1 mapa
diseñado, 6 turnos de mapa, 80 decisiones de batalla y 1 ascenso de tropa a
héroe** —con el plan de la semilla 3; de la 1 a la 20 cruzan todo el arnés la 3,
4, 7, 8, 10, 13, 14, 16 y 20, y la 5 dejó de hacerlo con los caminos en árbol de
la vuelta 1 de QA— — eran 3 y 15 hasta que la base dejó de quedarse indefensa tras un
ascenso, y 2 y 13 antes de que la IA aprendiera a esperar y de que el agente
diseñara el mapa.

`pnpm qa` **no entra en `pnpm verify`**: 11,9 + 3,0 = 14,9 s en cada final de
tarea, para un guardia que solo dice algo cuando se toca `src/server/` o el
contrato. Ese 3,0 eran 5,4 hasta que se le quitó el envoltorio `npx` al puente. El motivo de antes era otro y ya no existe:
abría los puertos **fijos** 9880/9881 y salía 1 con `EADDRINUSE` si había un
`pnpm partida` levantado —la forma documentada de jugar con el agente—, así que el
hook `Stop` se ponía rojo por tener el juego abierto. Eso está arreglado: los dos
puertos salen de `HEROES_AGENT_PORT` y `HEROES_SPECTATOR_PORT` (`src/server/entorno.ts`),
con los literales de siempre por defecto y **`0` para que los elija el sistema**,
que es lo que pide el arnés. Comprobado con la partida abierta en 9881/9880:
`pnpm qa` salía 0 en 5,43 s con su servidor en un puerto efímero, y la partida
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
plataforma**, que **`game_over` sea el último hecho de la crónica**, que
**`pintar` sea el único `innerHTML` del repositorio**, que **el dueño de un nodo
o de un castillo lo escriban `captureNode` y `captureTown` y nadie más** —que es
lo que deja derivar el dueño de una región— y —el decimosexto— que **fuera de
`game.ts` nadie llame al Dijkstra del mapa**, para que el camino de un héroe
lleve siempre lo hostil de la partida. Todos
nacen en verde: un guardia que nace rojo se ignora desde el primer día.

El de la puerta del marcado tiene **tres mitades y dos formas distintas**, y eso
es deliberado. La que de verdad guarda es **blanca**: el token `HTML` solo puede
aparecer seguido de uno de los tres tipos del DOM que el cliente nombra, así que
caen `innerHTML`, `outerHTML`, `insertAdjacentHTML` **y las que todavía no
existen** — se plantó `setHTMLUnsafe` y salió roja sin estar escrita en ninguna
lista, y también un `replaceChildrenFromHTML` inventado. La segunda es **negra**
y no hay forma de evitarlo, porque la lista blanca alternativa sería «las APIs
del DOM permitidas», o sea el DOM entero, o sea abierta — y una lista abierta
como blanca nace roja: ahí van `createContextualFragment`, `DOMParser` y
`document.write`, y su docstring dice que **caduca**. La tercera es blanca otra
vez y **por sitios y no por nombres**, que es el reencuadre que costó dos vueltas
de QA: los sumideros que meten atributo o script sin parsear HTML —`setAttribute`,
`a.href=`, `style.cssText=`, `iframe.srcdoc=`, `eval`, `new Function`— no se
pueden enumerar por nombre, pero **los ficheros que pueden llamarlos sí**, y son
dos: `html.ts` y `render/assets.ts`.

Y una lección del ciclo que es la de siempre vuelta del revés: la primera versión
de esa tercera mitad cazaba **nueve de quince** sondas, porque su autor escribió
`setAttributeNS?` — que hace opcional la **S** y no el `NS`—. No se descubrió
razonando el patrón: se descubrió **pasándole las quince, una a una**.

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
el guardia. (La tabla se fue después con «La tropa crece»: los umbrales de hoy son
Fibonacci y solo suman enteros. El guardia sigue igual.) Va con **lista blanca** de lo permitido y no con lista negra —al revés
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

**Un fichero de tests síncronos no pasa de 60 s sin ceder (#194, 08-10-2026).**
`pnpm verify:lento` salía 1 con todo en verde —«Timeout calling
"onTaskUpdate"»— cuando `regiones.test.ts` pasaba de ~60 s con la máquina
cargada. El worker de vitest espera la respuesta de su RPC de progreso con un
temporizador de 60 s, y entre test y test el runner solo encadena microtareas:
con tests síncronos el bucle no gira hasta que acaba el fichero, y entonces el
temporizador salta antes de leer la respuesta. Lo cuenta el fichero, no el test:
14 tests de 5 s, aislados, ya dan el 1. Dos arreglos: `test/ceder.ts`
(`setupFiles`) da una vuelta al bucle tras cada test, visto morder con esos
mismos 14; y las tres medidas de 1-1000 de `regiones.test.ts` (aspas, tramos
rectos, barrera de cada nodo) comparten los mapas (`delGenerador`) en vez de
generar mil cada una: el fichero solo, de 28,9 a 9,7 s.

## La arena: unidades con cifras inventadas, a pelear

`pnpm arena` abre `/arena/` (petición del usuario, 02-10-2026): se montan dos bandos
con las unidades de `assets/unidades/` —la tropa y los héroes de las cinco
facciones, **todas**: la que no tiene arte propio sale con el Y Bot—, se cambian
sus cifras en la ficha,
se elige **Yo o IA por unidad** y se pelea con el tablero y los controles de la
partida. «Guardar» escribe `data/borradores/unidades.json`. **El juego no cambia
y no lee ese archivo**: `pnpm banco` sale con el ancla igual.

- **Las cifras no pasan por el catálogo.** Las hojas no tienen fila en
  `data/creatures.json` —el catálogo solo sabe de caballeros y nigromantes—, así
  que una unidad de arena entra en `createBattle` por la vía de los personajes
  (`members`): el motor toma `profile.unit` y no vuelve a llamar a `creature()`.
  El formato (`UnidadDeArena`, en `src/core/arena.ts`) toma las cifras de
  `Creature` por `Pick`, así que se llaman igual que en el catálogo —y un cambio
  de forma allí no compila aquí—, pero **pasar una unidad al juego no es
  copiarla**: faltan la `faction` del juego (y, si es nueva, su guarnición
  neutral), `growth`, `upgradesTo` y su fila en `data/experiencia.json`. El
  `_comment` del archivo lo dice así; decía «copiándola» y QA lo desmintió en una
  copia del repo.
- **Una regla de validación**, `validarUnidadDeArena`: la usan el servidor de
  desarrollo antes de escribir (400 con la frase si no cuadra; un campo que no es
  de la arena también se rechaza, no se tira), la página al cargar y al editar
  cada campo, y la batalla. La escritura es atómica (temporal + `rename`). Las
  cifras por defecto, por perfil de pose, son **inventadas** y lo dicen; los no
  muertos salen con `undead`.
- **«Guardar» no pierde nada que no se haya tocado.** El archivo se lee unidad a
  unidad (`revisarBorradorDeArena`): las que no validan se dicen con su motivo y
  el servidor las vuelve a escribir tal cual; las válidas sin hoja se cargan y se
  guardan aunque no se puedan montar; y un archivo que no es JSON no se pisa, se
  rechaza. Antes una sola unidad editada a mano dejaba la página vacía y el
  siguiente «Guardar» borraba el resto.
- **La velocidad son casillas** (decisión del usuario, 02-10-2026: «la velocidad
  debería ser el número de casillas que mueve»). El borrador guarda `casillas`,
  de 2 a 7, y el motor sigue jugando su escalón: la única traducción es
  `escalonDeCasillas`, la inversa de `SPEED_TO_HEXES`. Un borrador viejo con
  `speed` se lee convertido. Las de salida van **por unidad y no por perfil**
  (`tools/arena/velocidades.ts`, con el motivo de cada una). Con una por perfil
  casi todas empataban, y el empate de iniciativa lo gana el atacante: jugaba un
  ejército entero y luego el otro.
- **Las habilidades se asignan y no hacen nada**: nombres de
  `data/habilidades.json`, guardados y marcados «sin efecto todavía». En la pelea
  solo cuentan los rasgos del motor.
- **`session.ts` sigue siendo la única puerta**: `SesionDeArena` vive ahí, y
  `EscenaBatalla` ya no pide una `Session` sino un `ControlDeBatalla`, que
  implementan las dos; la magia es una parte opcional (`hechizos`), que la arena
  deja en `null` en vez de fingirla. Las dos sesiones comparten la caché de lo
  legal, el motivo de un ataque imposible y **un solo bucle de la IA**
  (`jugarIAMientras`), que lanza al tope de jugadas en las dos. El panel de la
  arena usa las piezas del de la partida (`accionesDeLaUnidad`, `listaDelCampo`).
  Qué unidades mueve la IA se fija al montar; el «bando de la persona» se deriva
  de la unidad activa, porque la persona puede llevar unidades de los dos lados.
- **Montar no es empezar** (`SesionDeArena.empezar`): la página deja que el
  animador mire el tablero de salida y solo entonces juega la IA. Cuando la IA
  jugaba ya en el constructor, el animador daba todo por contado y con todas las
  unidades en IA solo se veía el final. Mientras el tablero cuenta, el panel y la
  barra no adelantan ni vidas, ni parte, ni resultado; y un final por tope de
  rondas se dice «por tiempo», con la regla del motor.
- **El arte en el tablero**: `render/personajes.ts` registra a demanda cada
  unidad (`registrarUnidad`) en la misma tabla de cuerpos del juego —registrar
  un cuerpo del juego lanza—, con sus ocho `dN/atlas.json` si los tiene todos
  y, si no, con el Y Bot de su juego de armas (`juegoDelYBot`, en
  `tools/taller/unidades.ts`). **El juego va por el arma que lleva cada unidad y
  no por su perfil de poses** (decisión del usuario): es una tabla,
  `JUEGO_DEL_YBOT`, con una fila por unidad revisada contra su `aspecto` —pica,
  alabarda, lanza o jabalina, `lanza`; bastón, `baston`; arma a dos manos,
  `dos-manos`; maza, `maza`; mayal, `mayal`; a caballo, `montado-lanza`; arco,
  `arco`; ballesta, arcabuz o culebrina, `ballesta`; el resto, `espada-escudo`—.
  Con el perfil, el piquero salía
  con mandoble y el goblin lancero con espada. Un test exige una fila por unidad
  y `juegoDelYBot` lanza sin ella; `EN_OCHO_DIRECCIONES` ya no repite el juego,
  lo lee de la tabla. La lista que sirve el servidor
  (`HojaDeArena`) lleva `juego` y `direcciones` —ocho o `null`— y no el
  `atlas.json` de una dirección, que se borró. **Se escala con la altura de un
  adulto (160) y no con la de cada hoja**, como hace el taller: escalar por la
  de cada hoja igualaría al goblin con el ent y al jinete con un soldado a pie.
  La ficha enseña las seis acciones y un «Girar» que pasa la figura por sus
  ocho direcciones.
- **Sin `pnpm dev` no hay guardado**, y la página lo dice. `vite build` saca
  `dist/arena/index.html`, la lista de hojas y un `__arena/unidades` con
  `guardado: false`, así que la arena construida monta y pelea y sabe que no
  guarda por un campo explícito. La URL lleva siempre la semilla de la pelea, y
  cerrar con cifras sin guardar avisa.

**La figura anda por el camino real y mira a donde va**, en la partida, la
arena y el espectador:
- El hecho `move` lleva `path`, sacado de la misma búsqueda que valida el
  movimiento (`Paso.previo` y `caminoDe`, en `board.ts`). Con solo `to`, el
  animador iba en recta y en 1 de cada 9 movimientos se veía cruzar por encima
  de una unidad que el camino rodea: eso era lo que el usuario vio «pasar entre
  dos enemigos». El camino nunca pisó a nadie: lo midió una sonda en 4 598
  movimientos. El banco no se mueve, porque su volcado es la crónica de la
  partida y no el registro de cada batalla.
- La mirada se decide en **ocho sectores** (`src/client/direccion.ts`): hacia la
  casilla siguiente al andar y hacia el objetivo al golpear, y se queda donde
  miró la última vez. La guarda el animador, nunca el núcleo.
- **Qué hoja pinta cada dirección es otra tabla, `DIRECCION_DE_HOJA`**
  (`render/personajes.ts`), una tupla en el orden de las hojas de la que salen
  `INDICE_DE_HOJA` y el «Girar» de la arena: el sur es «frente» (d0), el este
  «derecha» (d2), el norte «espalda» (d4), con los nombres de
  `NOMBRES_DE_DIRECCION` (`src/shared/arte.ts`), y `tsc` exige que las dos
  listas midan lo mismo. Su `length` es el número de direcciones para el
  taller y el cliente; `core` escribe el 8 a mano con un comentario y un test
  de la arena que los pone en contacto. **No se espeja nunca**: con la luz fija a la
  izquierda, el espejo la traería de la derecha. El arte de perfil y su
  traducción (`espejadoPara`, `lado`) se retiraron el 03-10-2026, como estaba
  escrito que pasaría: cambió la traducción y la regla no.

**Toda figura tiene 8 direcciones y las 6 acciones** (decisión del usuario,
03-10-2026: «la imagen por defecto debería ser el Y Bot, el arte antiguo se
elimina»), en la batalla de la partida, el espectador, la arena, el mapa y la
casilla de reclutar del castillo:
- **Las suyas o las del Y Bot.** Una unidad con `dN/atlas.webp` lleva su arte,
  sin teñir. Cualquier otra —toda criatura del catálogo, el héroe, y las
  unidades de la arena sin `dN`— lleva el render del Y Bot de su juego de armas
  (`_poses/<juego>-8d/dN-a.png` y `dN-b.png`), **teñido del color de su bando**.
  **Lo que no tiene dueño —monstruo o asaltante— va en el gris de lo neutral**
  (`COLOR_SIN_DUEÑO`, el mismo de la bandera de un castillo neutral), en el mapa
  y en la batalla (`bandosSinDueño`, sobre `battleOwners`; en la arena no hay
  dueños y los dos bandos llevan su color). Con un rojo ladrillo propio, el
  monstruo quedaba a unos 10° del rojo del jugador 0 y en el mapa el héroe y lo
  que le guarda el paso eran el mismo muñeco (decisión del usuario). Al
  asaltante lo separa del monstruo su suelo morado y su estandarte, no el tinte.
  El juego de cada cuerpo del catálogo es una tabla, `JUEGO_DEL_CUERPO`
  (decisión del usuario): piquero con lanza, caballería montada, mago con
  bastón, arquero y montaraz con arco, el resto con espada y escudo. Un test
  exige una fila por criatura.
- **El arco en la izquierda y la ballesta en la derecha** (#136): son juegos del
  Y Bot como los demás (`arco-8d`, `ballesta-8d`). El disparo son poses de brazo
  escritas sobre el rig (`tools/art/ybot-a-distancia.ts`), y su curva va por el
  **progreso** del clip y no por el índice del fotograma: con `frame % 6`, a 12
  fotogramas las siete columnas mezclaban dos disparos. La curva guarda solo
  sus seis ordenadas (`CURVAS_DEL_DISPARO`) y **la suelta se deriva de ella**:
  es el último nudo en lo más alto, donde empieza a aflojar, así que la flecha
  en la cuerda y la curva no pueden separarse.
- **La suelta es un dato de cada hoja, como el cadáver**: `pnpm taller
  derivar-poses` escribe en el clip `attack` de `atlas-8d.json` un `suelta`, la
  primera columna con la cuerda ya suelta (`columnaDeSuelta`: la misma
  `indicesDeClip` que reparte el render y la misma curva). Hoy es la **4** en
  arco y ballesta. El cliente la lee con `msDeSuelta(body)` (`marcha.ts`,
  hermana de `msPorCasilla`): el proyectil sale cuando la figura pinta esa
  columna (400 ms), vuela 340 y el paso acaba 280 después del impacto, 1 020 ms.
  **Quien no tiene `suelta` en su hoja dispara como siempre** —620 ms, el
  proyectil desde el 0—: el liche con su bastón, una unidad con arte propio o
  el marcador sin arte. Cada paso del animador lleva su reloj ya resuelto
  (`dura`, `impacto`, `suelta`), y el de cualquier clip sale de un solo
  `msDelClip` (`frames` a `fps`). **Un ataque con `suelta` no se recorta por
  fotogramas repetidos** (`derivarAtlas`): de frente el disparo apenas mueve la
  silueta (0,03-0,3 % del alfa entre columnas, bajo el `REPETIDO` de 0,4 %), y
  recortado el arco en d0 y la ballesta en d0 y d4 se quedaban en un fotograma,
  sin animar y con la suelta fuera del clip. Los demás clips se recortan igual.
- **Las anclas del Y Bot se derivan y se comprometen**: `pnpm taller
  derivar-poses` mide los PNG con `derivarAtlas` y escribe
  `_poses/atlas-8d.json` con el sha256 de cada uno; un test re-deriva una
  dirección y compara. **La muerte del Y Bot no se eleva** —la de las hojas
  pintadas sube 64 px en su celda, la del render crudo no—, y sin
  `elevacionDeLaMuerte: 0` el cadáver se hundiría en el suelo.
- **Se carga a demanda y hoja a hoja**: se pide la hoja que se pinta —la
  dirección en la que mira, y en el Y Bot la mitad `a` (reposo, marcha, carga)
  o `b` (ataque, daño, muerte) según el clip—, por URL, así que los cuerpos del
  mismo juego comparten imágenes. Mientras no llega, se pinta **la dirección más
  cercana ya cargada** con ese clip, y si ninguna lo tiene, su reposo: girar no
  parpadea al marcador. Sin ninguna hoja de la figura, el marcador de color.
  Las hojas de figura **no suben `versionDelArte`**: la superficie del mapa no
  se rehace cada vez que llega una. No hay atlas antiguo al que caer: el de una
  dirección, Liora, el maniquí `liora-poses-v3`, Doran, Nara y la guardia se
  **borraron** del repo, y un guardia de `invariantes.test.ts` impide que una
  ruta a ellos vuelva.
- **El tinte va por celda, no por hoja, y se guarda**: cada celda teñida —por
  imagen, celda, tamaño y color— va a una caché LRU de 20 MB, y la silueta de la
  sombra a otra de 4 MB. Teñir en cada fotograma costaba 24 ms por fotograma con
  14 figuras sin GPU; con las cachés, ~6-7 ms (`figura.ts`). Teñir la hoja
  entera por color, como al principio, eran ~200 MB más por color. Las
  miniaturas de la arena solo se repintan si cambia lo que enseñan
  (`claveDelDibujo`).
- **Daño, muerte y cadáver**: la víctima de un golpe con daño pasa a `hurt` en
  el impacto y lo termina aunque el paso acabe antes: el animador guarda solo
  el instante del impacto, como el de la caída, y **cuándo acaba lo dice el
  reloj del clip en el atlas** (`clipEnCurso`, que lee `clipQueSePinta`). La
  que cae lo hace con `death` y **se queda en su casilla con el fotograma
  `cadaver` hasta el final de la batalla**, debajo de los vivos y sin aro ni
  barra. La carga se anda con `charge`.
- **Lo que se funde es el aro, una sola regla**: el animador da `alfaDelAro`
  (aro, barra, nombre, corona) y la figura con arte no se funde nunca; sin arte,
  el marcador va con el aro (`Figura.alfaSinArte`) y el cadáver no se pinta.
- **El reposo va a 8 fps y la marcha no patina** (decisión del usuario,
  03-10-2026). El reposo iba a 3 y se leía congelado. Un tramo duraba 520 ms
  fuera de una casilla o de seis; ahora dura **sus casillas al paso de quien
  anda** (`marcha.ts`): el ciclo del clip (del atlas) dividido por la zancada
  que mide el Y Bot —112 px de celda por ciclo andando y 186 cargando, sobre
  160 de adulto— a la altura a la que se pinta. Son **~1,3 s por casilla
  andando y ~0,8 s cargando** para una figura de un hex, y menos para una
  grande. `test/marcha.test.ts` vuelve a medir la zancada en los PNG. Lo mismo
  vale para la patrulla de los asaltantes en el mapa; el héroe del mapa salta
  de casilla y no se anima. **El precio, medido**: `pnpm capturas` pasó de ~125
  a ~250 s, y el espectador enseña el fin de la partida **~80 s** después del
  `game_over` (eran ~21 s), con el plazo del arnés a 104 s. El ritmo máximo del
  telón (×12) no se tocó: cuánto se acelera un tramo largo para alcanzar la
  partida es una decisión de cómo se ve, pendiente del usuario.
- **Al verlo, la marcha va algo más deprisa que sus pies** (usuario,
  03-10-2026: «el desplazamiento un poco más rápido»). Una sola cifra,
  `PRISA_DE_LA_MARCHA` (1,45, en `marcha.ts`), divide la duración de cada
  casilla: **~0,9 s andando y ~0,55 s cargando**, y los pies patinan un poco, que
  se aceptó. Los `fps` no cambian. Con ella el espectador enseña el fin de la
  partida **60,6-63,0 s** después del `game_over` (plazo del arnés, 82 s) y `pnpm
  capturas` tarda **~205 s**.
- **Sin coreografía: cada figura lleva su compás** (`compas.ts`). Un desfase de
  ciclo y una velocidad de ±8 % (`RUIDO_DE_VELOCIDAD`) que salen **de un hash del
  id de la figura** —FNV-1a con el mezclado de MurmurHash3; sin él, `s1` y `s2`
  coincidían en el fotograma del reposo el 79 % del tiempo—, nunca de
  `Math.random`: la misma figura respira igual en cada fotograma y en cada pasada
  de `capturas`. Por eso `Figura.id` es **obligatorio**: el stack en la batalla y
  la arena, el objeto o el héroe en el mapa, `recluta-<criatura>` en el castillo y
  `miniatura-<i>-<hoja>` en las fichas de la arena. Sustituye a los desfases a
  mano por casilla que llevaba el mapa (`x * 211 + y * 97`…). Solo toca los clips
  **en bucle** (reposo, marcha, carga) y se aplica en un sitio, `colocarFigura`;
  el golpe, el daño y la muerte arrancan con su hecho y conservan su reloj,
  porque `clipEnCurso` y `fotogramaDeCaida` lo leen sin desplazar. Es solo del
  cliente: el banco no se mueve.
- **La sombra es la silueta** del fotograma aplastada por la luz del contrato
  (`PROYECCION_DE_SOMBRA`), del color `ARTE.luz.colorSombra`, en todas partes, compuesta a un cuarto de resolución
  para que el suavizado le difumine el borde. Un `ctx.filter = 'blur()'` por
  figura y fotograma era lo que no se podía pagar: sin GPU (el Chromium de
  `pnpm capturas`) el fotograma de batalla pasaba de 300 ms. Sin arte, el óvalo
  de `sombra.ts`.
- **La memoria es el precio, y se mide** en imágenes pedidas y lo que pesan
  decodificadas (ancho × alto × 4): el mapa de la semilla 1, con el castillo
  abierto, pasó de 32 hojas y 396 MB a **2 y 25 MB** al cargar hoja a hoja; la
  arena montada con un templario y tres no muertos, de 92 y 1 023 MB a **57 y
  330 MB**, y tras 15 s de pelea **61 y 416 MB**. La batalla no precarga las
  direcciones: medido, con o sin precarga se pintó con respaldo en 18 y 12 de
  ~7 160 figuras, y la memoria salía igual. Si aprieta, la salida es bajar la
  resolución al cargar (`createImageBitmap` con `resizeWidth`).

`pnpm capturas` la juega con clics de verdad —monta, cambia un ataque, mueve un
tramo, golpea, deja acabar a la IA, guarda, reabre y comprueba que lo guardado
se carga, y pelea con todo en IA exigiendo que la pelea **se cuente** y no salga
el resultado de golpe— contra un espejo `SesionDeArena`, y **deja el borrador
como estaba**: lo aparta antes y lo devuelve al salir, falle lo que falle.

## La arena como banco de combate (09-10-2026)

El usuario: «Me gustaria poder probar combates entre ejercitos para ir definiendo
cosas poco a poco antes de meternos en las batallas del juego. Quiero centrarme en
afinar y definir el sistema». Peleas jugadas una a una, sin simulación en lote
(decisión suya). El ciclo está en `docs/agents/2026-10-09-arena-banco-de-combate/`
y la exploración que lo motivó (726 batallas medidas en 1-100, siete jugadas con
clics), en `docs/agents/2026-10-09-combate-exploracion/`.

- **Seis interruptores, solo en la arena** (`battle/reglas.ts`): tirador, fórmula
  de ataque y defensa, moral baja, defender, Bendición/Maldición y el A/D del
  héroe sumado a la tropa. Cada uno compara la regla nuestra con la de fheroes2
  (citas extraídas de `9754feff`, no tecleadas). El juego entra por
  `createBattle` con `REGLAS_DEL_JUEGO`; un test exige crónicas idénticas entre la
  arena en «nuestra» y el juego, y `pnpm banco` no se movió en ninguna fase.
  **Adoptar una regla es otra tarea**, una a una y por decisión del usuario.
- Decisiones del usuario: el perdón de la IA en la moral baja de fheroes2 no se
  copia; la Maldición de la momia sigue al interruptor de Bendición; la figura del
  héroe se elige entre las hojas; la magia de la arena lleva el libro completo
  aunque el Rayo de Poder 1 mate a un héroe en la ronda 1 («la magia está
  provisional»). En fheroes2 defender no da bono: su versión es «sin +20 % y sin
  moral tras defender». Los no-muertos siguen inmunes a la Maldición en los dos
  modos (comprobado en la fuente).
- **La previsión sale de la cuenta que aplica el daño** (`previsionDe` →
  `horquillaDeDanio`, `trasElGolpe`), y lo que hace legal un golpe es un solo
  `golpeBlocker`: con la comprobación copiada en la previsión, la barra podía
  prometer un golpe que luego se rechazaba. Comparada con el log en las 64
  combinaciones de reglas × 300 semillas (en `verify:lento`).
- **El guardia de las reglas vigila módulos y escrituras, no solo nombres**: en
  la vuelta 2 de QA pasaban un envoltorio con otro nombre en `core/arena.ts` y
  `{ ...createBattle(), reglas }`. Su primera versión por módulos no mordía con
  `../core/arena.js`; se vio rojo antes de darlo por bueno.
- **El enlace de la pelea** (`?montaje=`) reproduce el montaje entero; un enlace
  roto no monta a medias. Abierto, se queda en el montaje: una pelea que empieza
  sola no deja mirar el tablero de salida.

## Marcar fallos del mapa (solo en `pnpm dev`)

Con `M` o el botón «Marcar», un clic en el mapa recorta la pantalla, dice qué
hay ahí (`queHayEn`) y guarda una nota en `docs/revision/marcas/` por el
servidor de Vite; `pnpm marcas` las lista, las resuelve y las recorta con el
taller. Nada de eso llega a `vite build`: `src/client/desarrollo/` entra por un
`import()` detrás de `HERRAMIENTAS_DE_DESARROLLO`.

- **El guardia de las importaciones se vio morder** con tres sondas en
  `main.ts`, una a una: un `import { montar } from './desarrollo/marcas.js'`, el
  `import()` sacado de su `if` y un `import './desarrollo/marcas.js';` de efecto
  lateral. `sinDesarrollo` se vio romper el build con el `define` a `true`.
- **Los atajos no miran dentro de un campo ni de un cuadro**: un Espacio en la
  nota de una marca —o sobre su botón «Guardar»— pasaba el turno, y una `M`
  encendía y apagaba el modo mientras se escribía.
- **El cuadro de la nota se abre al lado contrario del punto**: centrado, como
  lo pone el navegador, tapaba justo el aspa de lo que se estaba marcando.
- **La casilla de una marca es la del puntero** (`casillaBajo`): en el tablero
  de un puente, la de su nodo, no el agua de debajo.

## Cada nodo entra por un eje (#161, #166 H10, 07-10-2026)

Marca del usuario en s2: un puente N-S en (7,11) que desembocaba en un islote de
una casilla, unido a tierra solo en diagonal, y el camino perdiéndose al pie de
dos paredes. La tarea pedía mover los nodos de agua a donde hubiera orillas
enfrentadas; la crítica lo reencuadró, medido:

- **No era del agua ni de dónde cae el nodo.** En la red fina, 563 de 568 pasos
  (1-40) ya tenían dos vecinas opuestas de regiones distintas. Las perdía el
  vestido: `engordarFronteras` protegía, por región, la primera vecina recta
  sin mirar la de enfrente (norte para una y este para la otra salía en
  esquina) y seguía hasta lo libre en 8 vecinas (la entrada quedaba unida a su
  región por una esquina). Le pasaba a un tercio de los nodos de toda barrera:
  165 de 488 quebrados y 307 con una entrada sin vecina en cruz, en 1-40.
- **El arreglo, en el vestido y para todo nodo** (`ejeDelNodo`, `vestir.ts`):
  se elige un eje —recto, diagonal con un codo que une sus casillas en cruz o,
  junto al borde, corto—, se protegen sus dos lados hasta la segunda casilla y
  todos los caminos hasta lo libre van en cruz. Sin `if (agua)` y sin mover
  nodos: mover el nodo es tocar la red para algo que no es de la red. Y nada
  se siembra en `n ± 2d` (`delanteDeNodo`, `generate.ts`), aparte de
  `juntoANodo` porque esa marca también acota la patrulla de los asaltantes.
- **Cifras** (antes → después): quebrados 165/488 → 4/473 en 1-40 y 817/2469 →
  27/2435 en 1-200; entradas sin cruz 307 → 0 y 1544 → 0; objetos delante 33 →
  0 y 159 → 0. Puentes en 1-40: 101 con 35 quebrados → 89 con 1. Los 27
  quebrados de 1-200 son exactamente los pasos cuya red fina no tiene vecinas
  opuestas (casi todos junto al borde del mapa); arreglarlos es mover el nodo,
  y queda en backlog.
- **La red no cambia salvo que se tire**: con la misma primera red
  equilibrada salen los mismos nodos; 56 de 200 semillas cambian de red, todas
  porque una de las dos versiones agotó los vestidos de la primera (script en
  `docs/agents/2026-10-07-orillas-del-puente/redes/`). Vestidos por mapa 3,55
  → 4,89 (máximo 21 → 32), 0 mapas sin salir de 28 a 48 de lado.
- **El agua no baja de forma sistemática**: en 1-200 los nodos de agua pasaron
  de 520 a 466, y en 201-400 de 497 a 500. Ruido de qué barrera se sortea.
- **`asentar` se queda**: los planes del agente ponen el nodo donde quieren y
  `problemasDeRed` no mira las orillas. Ya no es «provisional hasta #161».
- Banco `6157d75a…` → `82123423…`, forma en `tools/qa/banco.ts`. **La
  duración no cambia**: en las 200 del banco la mediana pasa de 8 a 9, pero con
  1 000 semillas por tanda (`tamanos.ts`) baja de 9 a 8 en 1-1000 y se queda en
  9 en 1001-2000, con el p90 en 16 en las dos. Las 200 del banco eran ruido.
- **`pnpm capturas` buscaba con semillas fijas** y cuatro pasadas cayeron (la
  50 perdió su ruta de dos días y la 810 su guardia): ahora escritorio, móvil,
  táctil y sin arte buscan su semilla en el espejo, como ya hacían emboscada,
  veteranos y la batalla perdida.

## Bordes de barrera sin tramos rectos (#169, 07-10-2026)

- **El problema**: filas de 10-16 frontales iguales y fronteras rectas (s24,
  s2, s13). Medido en 300 semillas, de los 633 tramos rectos de ≥ 6 casillas,
  468 (74 %) salían **del engorde** y no del Voronoi: el lado gordo de cada
  pareja engordaba entero —la dilatación del muro fino, que alarga cada tramo
  y funde los escalones— y el flaco iba en bloques de 4×4. Cifras y scripts en
  `docs/agents/2026-10-07-regiones-con-ruido/`.
- **Lo que se hizo** (`vestir.ts`, `generate.ts`): el ruido del engorde va
  **casilla a casilla**; donde dos pisables de regiones distintas quedarían a
  dos pasos, la **reparación** (paso 4b) engorda una, la del lado gordo de la
  pareja **dado la vuelta a trechos de 4** (`TRECHO_DEL_LADO`). Con el lado
  gordo fijo, en un muro recto cada casilla abierta de un lado obliga a
  engordar las cinco de enfrente y el lado gordo salía entero otra vez (10 de
  10 tiradas en el test de la reparación; a trechos, 2 de 20 lados). El paso
  de cada pareja se elige **con eje pleno** (`conEjePleno`) en **las mismas
  parejas que antes**: buscar un paso lejos del nodo vecino daba ~1,4 pasos
  más por mapa, y la densidad de pasos no era de esta tarea. Las redes suben
  de 20 a 30.
- **Descartado, medido**: el Voronoi con dominio deformado (con 40 semillas
  parecía −35 %, con 1 000 se quedó en 6-16 %; con amplitud ≥ 5 funde regiones)
  y el crecimiento competitivo a lo fheroes2 (sin cambio). **No hay giros a
  gran escala**: la frontera sigue el bisector; lo que cambia es el borde.
- **El criterio se redefinió** dos veces. «El tramo más largo ≤ 4-5» no lo da
  ningún ruido (un borde al azar ya tiene máximos de 7-12 en 34×34). Se
  cuentan tramos largos en muchas semillas, y **en 1-1000, no en 1-300**: en
  300 las cuentas bailan ±10 con cualquier cambio del azar (elegir el paso de
  otra forma movió los tramos ≥ 8 de 1-300 de 38 a 45). En 1-1000
  (`tools/qa/rectitud.ts`, y tramos y mapas también en un test lento): tramos
  ≥ 8, 216 → 110 (techo 140); caras ≥ 8, 138 → 94 (techo 115, con el relieve
  de #174); mapas con un tramo ≥ 10, 14 → 5 (techo 8).
- **Nodos**: 12 309 → 12 342 en 1-1000; nodos sin eje, 119 → 17.
- **Lo que no cambia**: el equilibrio (j0 518 y 484 de 1 000 en 1-1000 y
  1001-2000, z ≈ 0,04 juntas), la regla del lado (9 / 16 / 45, 0 sin terminar
  en 1-1000), 0 mapas sin salir en 34 y 48, 1 de 2 000 en 24×24 (eran 9).
- **Dos partidas colgadas con variantes intermedias**, que destapan la IA y
  van a una issue aparte: s775 (dos héroes que se persiguen por turnos, cada
  uno a donde estaba el otro; `chooseHeroDestination` sin nada que rompa el
  ciclo) y s1393 (un héroe sin tropa encerrado en una región que lo embosca y
  un rival libre que no entra; la salida de `todosEncerrados` pide que lo
  estén todos). Con el código final, ninguna en 1-2000.
- Banco `82123423…` → `105a3604…`, forma en `tools/qa/banco.ts`.
- **Tests atados a semillas**: buscan su caso (`primeraSemillaCon`,
  `puenteSobreElAgua` en `test/helpers.ts`) en vez de llevar la semilla
  escrita. Los paneles se re-anclaron (es un volcado). `pnpm qa` pasó de la
  semilla 3 a la 9 en `politica.ts`: con la 3 ya no había batalla en seis
  turnos.

## El procedimental pasa por la puerta del agente (#178, #179, 07-10-2026)

- **#178, un asaltante en una región con dueño** (24×24, semillas 469 y 3481
  de 1-4000). La red fina deja a veces una región de fuera cuyo único nodo es
  una base: es del dueño de la base desde el primer día, y el generador sembraba
  el grupo igual. Nadie lo cazaba porque el bucle del generador solo pasaba
  `problemasDeRed` y la raquítica, no `validateMapPlan`. Ahora el vestido lee
  `territorio` del mapa grueso con las bases ya con dueño y salta la pareja si
  una de las dos tiene dueño; y `generateMapPlan` pasa su plan por
  `validateMapPlan` antes de entregarlo (`validadoPorLaPuerta`, ~1 ms frente a
  11-16 de generar) y **lanza** si lo rechaza: es un fallo del generador, y un
  reintento callado cambiaría esa partida sin que nadie lo viera.
- **#179, la Y junto a un nodo que no era obligada** (34×34, semillas 4310 y
  4525 de 1-5000; la s810 de antes de #169 ya no sale). No era un nodo sin
  trazar: en las dos el nodo ya estaba en la red, colgado de la casilla de
  abajo, y el radio siguiente salía de esa casilla en diagonal junto a él. El
  cobro de un paso recto no bastaba porque la L por la otra esquina **también
  paga**: su segundo paso se arrima a la red (toca el nodo) y cuesta un recto
  más, tres en total, contra ~2,4 de la diagonal cobrada. Cobra ahora dos
  rectos. En 1-1000 de 34×34 no cambia ni un plan (huella sha256 de cada uno),
  tampoco las cuatro Y obligadas de 2026-10-06 (60, 64, 177, 986); banco igual.
- Barrido con el arreglo: 34×34 1-5000, 24×24 1-4000 y 48×48 1-300, 0 planes
  inválidos y 0 Y. Sigue 1 de 4000 en 24×24 que no sale en 30 redes (3071),
  que es lo de antes.

## Sendas en aspa y puentes sobre un charco (auditoría 3 §7 y §4, 08-10-2026)

- **El aspa no era un cruce de diagonales.** La s2 en (1,31) y (32,2) se leía
  como dos sendas rectas que se cruzan, pero no hay dos tramos que se corten sin
  casilla común (un 2×2 con sus dos diagonales: 0 en 1-1000, y ya lo vigilaba
  `horquillasNuevas`). Es el **centro de la región con sus cuatro diagonales**:
  tres minas y el paso al nodo caían cada uno en una diagonal del centro, y cada
  radio salía de él en diagonal. Ninguna esquina era red, así que la regla de la
  L (`ArbolDeCaminos`) no tenía de dónde colgarlos. En 1-1000, 37 aspas en 31
  mapas, más 28 en ciudades.
- **El arreglo, en la búsqueda**: el paso que daría a una casilla su cuarta
  diagonal cobra dos rectos más (`cerrariaUnAspa`), como la Y junto a un nodo
  (#179). El radio entra por la casilla de al lado, que parte una de las
  diagonales en L, y el centro reparte en T. Después: 0 aspas fuera de un nodo
  en 1-1000; los cruces rectos (+, ~1 por mapa) no cambian, y la rectitud de las
  fronteras tampoco (109 / 12 / 4). Banco: cambian 3 de 200 partidas (13, 78,
  128), las tres en un `hero_moved` junto al aspa vieja y con el mismo ganador
  y día de fin.
- **Las 28 de las ciudades se quedan**: una ciudad neutral en la esquina de
  cuatro regiones, con sus cuatro lados rectos de barrera, recibe un radio en
  diagonal de cada una. Son cuatro regiones, no un árbol que se cruza, y la
  ciudad tapa el cruce.
- **El puente sobre un charco (s28 node-6, (9,16)) no se toca.** El nodo cruza
  de lava a lava, que en el procedimental solo admite risco o montaña, pero
  está en la esquina del lago de la frontera hierba–lava: tiene agua al norte
  (una casilla suelta, 4-aislada, el final de ese muro fino) y al oeste, y risco
  al sur. `barreraDeNodo` empata agua 2 – risco 2 y gana el agua por el orden en
  que mira las vecinas, así que el escenógrafo pone puente y vuelve agua la
  casilla del nodo. En 1-1000: 25 de 2 457 puentes salen de un empate, y 6
  están en un nodo cuya frontera no puede ser de agua. Arreglarlo es elegir la
  barrera del nodo con lo que sabe el generador (la de la pareja), que el mapa
  no guarda, o desempatar en `nodos.ts`; con ~1 % de los puentes y del lado del
  escenógrafo, se deja escrito. (Arreglado después: la barrera del nodo es un
  dato del mapa, #145.) La s24 node-8 (8,26) es un puente diagonal
  (sus únicas vecinas pisables opuestas son NE, nieve, y SO, hierba): el caso
  de las diagonales que ya contaba la auditoría 2 (8 de 23), no uno nuevo; no
  se ha medido aparte.

## La barrera que cruza un nodo es un dato (#145, #187, 08-10-2026)

`buildMap` abría la casilla del nodo como `dirt` y no guardaba qué barrera
cruzaba; el escenógrafo la deducía de las ocho vecinas (`barreraDeNodo`), y en
un empate ganaba la primera que encontraba. Ahora cada nodo la lleva
(`MapObject.barrera`): la del muro que el plan le pone debajo, que `buildMap`
lee antes de abrir la casilla. El escenógrafo solo deduce el eje.

- **Un nodo sin muro debajo se rechaza** (`validateMapPlan`). La prosa del
  agente ya decía que el nodo va en un muro; no se comprobaba, y el escenógrafo
  se inventaba lo que cruzaba. No hay campo nuevo en el contrato: el agente
  declara la barrera con el muro que traza.
- **La de la pareja a secas no vale.** El generador sabe la barrera de cada
  pareja de regiones (`tipoDePareja`), pero junto a un cruce la frontera de al
  lado es de otra pareja y llega hasta el nodo. Guardando la de la pareja,
  206 de 12 364 nodos de 1-1000 cambiaban, con 41 puentes nuevos entre muros y
  42 quitados de en medio de un río. Y la del muro fino bajo el nodo, tampoco
  (180 distintos): su tipo sale de «la menor celda de sus vecinas».
- **La regla (`queCruzaElNodo`, `vestir.ts`)**: la que más se repite alrededor,
  sin contar el agua si sus suelos no la admiten (`data/barreras.json`: es el
  lago de otra frontera), en un empate la sorteada para su pareja, luego la que
  más admiten sus suelos y luego el orden de `BARRERAS`. Solo el agua lleva el
  filtro de los suelos porque el puente es la única pieza que rehace el terreno;
  filtrar todas por los suelos sacaba puentes con una sola casilla de agua
  alrededor (s405 node-4).
- **Medido en 1-1000**: 85 nodos cambian de barrera, 81 de ellos empates y los
  otros 4 los de lago ajeno (s203 node-8, s455 node-6, s646 node-2 y node-8).
  Puentes 2 457 → 2 456: pierden el suyo 18 (los 6 de #187 y 12 empates) y lo
  ganan 17 (empates, como s652 node-4, un río de este a oeste que llevaba paso
  de montaña). El mapa no cambia (sha256 del terreno, tramos y objetos sin la
  barrera, igual) y el banco tampoco.

## La fuerza del héroe, medida (#182, 08-10-2026)

- **La sospecha**: con lado 44, la s191 no terminaba, y en ella un héroe sin
  tropa (fuerza 1360) ganaba a uno con seis individuos (2410). Se leyó como
  «`fuerzaDe` infravalora el cuerpo de un héroe muy subido».
- **Medido, no lo hace.** `tools/qa/calibrar-fuerza.ts` saca fotos de héroes y
  grupos de partidas reales (lados 34, 44, 56), las hace pelear con
  `autoResolve` cambiando quién ataca y ajusta una logística sobre
  ln(F_A/F_B) para cada peso del cuerpo. Héroe contra héroe, el mínimo de la
  log-pérdida está en 0,6 (0,3194 frente a 0,3267 con 1; acierto 86,0 % y
  86,1 %). Héroe contra grupo, en 0,75 (0,4685 frente a 0,4693), y bajarlo hace
  que el grupo embosque y pierda más (28,7 % con 0,5 frente a 22,9 % con 1). El
  héroe de nivel ≥ 10 sin tropa gana el 61 % y se le da por favorito en el 75 %:
  ligeramente **sobre**valorado, no infravalorado. Se queda el peso 1
  (`PESO_DEL_CUERPO`), que no cambia ni una partida (banco igual).
- **Un peso de 0,5 se probó entero** y no se quedó: 0 sin terminar en 25 000
  partidas de lados 24-56 (frente a 1), cuantiles parecidos, pero mueve del 70 al 83 %
  de las partidas, rompe 19 tests (con el héroe a la mitad, los grupos emboscan
  al de salida y ninguna de 200 semillas abre el día 1 una batalla contra un
  monstruo) y empeora `ventajaClara` contra grupos. Una partida de 25 000 no
  distingue un arreglo de barajar.
- **Lo que de verdad no termina** (s285 con lado 44 tras #166; la s191 ya
  acaba): desgaste por tempo, no estimación. Los dos héroes, de nivel 15-17 y
  con 300 000 de oro cada jugador, se vencen casi a diario; el que pierde **se
  rinde** (300 de oro), vuelve a la base, recoge la guarnición y recluta seis
  en el acto, y al día siguiente gana al vencedor, que llega con cuatro o cinco.
  `fuerzaDe` acierta esas batallas. Va para otra issue.
- La sobrevaloración del héroe contra grupo tiene la otra cara: con el margen
  de 1,6, un grupo que embosca pierde el 23 % de las veces (`sesgo` 0,72 de la
  logística: a igual fuerza, el héroe gana ~67 %). Es del margen o de
  `poderDe`, no del peso del cuerpo.

## Un solo índice de obstáculos (#151, 08-10-2026)

«¿Está libre?» tenía dos respuestas: el pasillo de la senda (geometría exacta
con el rectángulo del sprite) y una rejilla de cuartos de casilla con discos
para la reserva de cada objeto, que solo miraba el pie. Para que un árbol no
tapara un objeto se sondeaba a mano la reserva 0,45 y 0,8 por encima del pie
del arbolillo; las masas y las rocas no miraban nada, y la muralla buscaba el
objeto con un cuarto de casilla de holgura «porque la reserva va por una
rejilla». Ahora todo es `Obstaculos` (`pasillo.ts`): formas con su regla, y la
reserva de un objeto es un trazo de un solo punto que mide el pie de todo y el
rectángulo de lo alto que se pinta después de él.

Medido en las semillas 1-40, antes y después:

- Volúmenes de lo que se aparta pintados delante de un objeto y con el
  rectángulo dentro de su reserva: 6 656 → 0 (masa 5 934, cubierta 481, roca
  241). Los que cubren el punto de apoyo del objeto: 786 → 0.
- Masas: 30 257 → 29 298 (−3 %), alto medio 1,02 → 0,97. Cubierta, roca y
  orilla, ±0,3 %. Suelo desnudo del taller, s3 30,1 → 31,5 %, s2 17,8 → 19,0 %.
- Todos los contadores del informe, 0 antes y después.
- `componer`, tiempo de CPU (la máquina estaba a carga 10-25): mediana
  131-138 ms antes, 127-140 después, alternando cinco veces. Igual.
- Cambiar cualquier decisión de colocación cambia el consumo del azar que
  sigue: las escenas se rebarajan enteras (otra disposición, las mismas
  cifras). Lo que se buscaba se ve en los recortes de
  `docs/agents/2026-10-08-indice-obstaculos/capturas/`.
- La regla de los tableros ahora mira el alto que se pregunta (`esVolumen`
  con ese alto): lo que encoge por debajo del umbral va al suelo, bajo el
  puente, y se queda ahí en vez de seguir encogiendo o quitarse (en 40
  semillas, 44 matas y rocas que se quitaban entran y 16 crecen, hasta
  +114 %). `puentesTapados` sigue a 0.

## El lienzo de quien juega mira lo que se ve ahora (#64, 08-10-2026)

#35 dejó la niebla en dos capas —`fog`, «lo exploré alguna vez», y
`visibleNow`, «lo estoy mirando»— y el agente la usaba; el cliente no. El
lienzo, el minimapa y la barra pintaban `state.heroes` y `map.objects`
recortados por `fog`: el héroe rival andaba a la vista por cualquier casilla
pisada alguna vez, y la bandera de un nodo lejano cambiaba al color del rival
en cuanto lo tomaba. La crónica del cliente iba entera a propósito, para no
contradecir a ese lienzo.

Qué va con qué:

- **Héroes: lo que se mira ahora** (`heroesALaVista`, `state/game.ts`). Uno
  se ve o no se ve; no deja recuerdo. La lee el `enemyHeroes` del agente.
- **Objetos: lo que se sabe** (`objetosConocidos`): vivo donde se mira ahora y,
  en lo demás explorado, el recuerdo de `memory` con su día. Castillos y nodos
  enseñan su último dueño visto; un cofre que se llevó el rival lejos sigue
  ahí hasta volver a mirar. La lee `knownObjects` del agente con su `lastSeen`.
- **Grupos de asaltantes**: su región (`asaltantesALaVista`, #130), como antes.
- **Terreno, caminos y volúmenes del escenógrafo**: `fog`. No cambian; el
  recuerdo de un hecho estático es el hecho.
- **Crónica**: `cronicaPara`, la misma regla que la del agente.
- Con «Ver mapa entero», todo vivo y la crónica entera. El espectador lo ve
  todo: no pasa por nada de esto.

`AdventureScene` ya no trae héroes: el lienzo los recibe en `VistaMapa.heroes`,
y pintar los de la partida sin filtrar no compila. Los objetos siguen en
`escena.map.objects` para la escena —dónde está cada cosa— y su estado llega en
`VistaMapa.objetos`. Lo vigila además `invariantes.test.ts`. Probado en Chromium
con la semilla 16 (`docs/agents/2026-10-08-lienzo-niebla/`): el día 4 el rival
se va a (5,9), explorada y sin mirar; `main` lo pintaba allí con el nodo del
puente ya azul, y ahora no se pinta ni lo nombra la barra.

## Los caminos entran por la puerta (#188, 08-10-2026)

El usuario: «el camino que pasa por una mina pasa por en medio de la mina o de
una ciudad; deberían pasar por delante con un pequeño desvío para entrar
siempre por la puerta, como en el HoMM». Era del trazado del núcleo, no de la
escena: `Busqueda` solo hacía hojas a los nodos, y el comentario lo decía («una
mina o un pueblo sí se cruzan: hacerlos final de tramo obliga a rodearlos con
un radio paralelo»). Ese aviso era de cuando el pintor unía casillas por
adyacencia; con tramos (#153) ya no hay radios paralelos que se cosan solos.

- **La regla**: ciudad, mina y pueblo son hojas y se entran por la casilla de
  debajo (la cámara mira desde el sur y la puerta del sprite está en su pie).
  Es un coste, no una prohibición: puerta 0, diagonal de delante un rodeo
  (`N × diagonal`, más que cualquier camino sin monstruos), lado 3, detrás 4;
  pisar un monstruo 2 (se llega a la puerta por encima del guardia antes que
  por el costado); cruzar el objeto 10, solo si es la única unión. Sus
  costados y su espalda cobran dos rectos y la Y con una puerta en la esquina
  cuatro. El aspa pasa de dos rectos a seis: con dos salían 5 en 1-1000 entre
  minas y pueblos.
- **Una ciudad no se rodea**: es el nodo, el paso entre regiones. Cada región
  llega por la mejor fila que toca; la que solo la toca por detrás, por
  detrás. Una ciudad de eje este-oeste entra por delante desde la región que
  toca esa fila, y de lado desde la otra.
- **La colocación guarda la puerta** de minas y pueblos (había minas en la
  última fila) y no pone uno en la fila de delante de otro (una mina bajo otra
  le tapaba la puerta, s3). Guardar también las vecinas de la puerta dejaba un
  24×24 sin mapa en 56 de 100: solo se guarda la puerta. En un mapa apretado,
  si no queda sitio con puerta, se coloca sin ella (en 34×34, ninguno en
  1-300). Y aun guardando solo la puerta, en 24×24 se quedaban sin mapa
  s150 y s171 de 1-200 (#102 pide el 100 %): la casilla de cada puerta le
  quitaba a una región apretada la densidad de obstáculos que le faltaba. Si la
  primera tanda de redes y vestidos no saca mapa, `trazarYVestir` hace otra sin
  vetar la puerta a los obstáculos. Solo cambian las semillas que no salían:
  el banco de 34×34 se queda en `dc204d41…`, y 24×24 sale en 1 000 de 1 000.
- **Los obstáculos no parten una región por una mina** (segundo BFS de
  `alcanzaTodo`): desde los nodos, cada mitad se alcanzaba desde el suyo y el
  radio tenía que cruzarla (s17).
- Medido en 1-40 (`docs/agents/2026-10-08-caminos-puerta/`): minas que no
  llegan por un solo tramo desde su puerta 924/1120 → 0, pueblos 251/320 → 0,
  minas cruzadas 609 → 0; llegadas a una ciudad por una fila peor que la mejor
  de su región 28 → 1 (de lado en vez de la diagonal de delante, por la L de
  `ArbolDeCaminos`), por detrás pudiendo por delante 3 → 0. El camino sube de la
  mediana 0,293 a 0,362 de lo pisable (1-200): es el ramal de cada puerta y el
  rodeo por delante. El techo del test pasa de 0,33 a 0,40.
- **Y obligadas con una puerta en la esquina**: ~1 por mapa (791 en 1-200), el
  radio que llega por el costado de una mina con la otra vecina de su puerta
  tapada (barrera o monstruo) y baja en diagonal a la puerta. Se ven como una
  curva por delante del objeto; `horquillasNuevas` las admite como admitía las
  de nodo. Guardar las vecinas de la puerta las bajaba a 229, pero rompía los
  24×24.
- **Salió un fallo viejo de `muralla.ts`**: lo lejano de la línea se cosía a
  la casilla más cercana de ella, y si era la puerta (que no es de la franja)
  el camino no llegaba y la casilla se quedaba sin tramo (s11 (8,11)).
- Los planes del agente no cambian: escribe casillas y se unen por adyacencia;
  se le pide en el `advice` de `map_generate`.

## La senda no se mete bajo el relieve ni corre por el borde (#189, 08-10-2026)

La auditoría de caminos (defectos 1 y 7) vio la senda desaparecer bajo una
cara, una ladera o una diagonal y salir más allá (7,7 % de la senda), y
caminos pegados al borde del mapa, medio bajo las nubes. Medido de nuevo sobre
`main` tras #188 y con la huella de #191 (0,32), estaban peor: 23,3 casillas de
senda por mapa bajo un píxel opaco del relieve (1-40, centro de la senda) y 8,4
tramos por mapa a lo largo del borde (1-100).

- **La pared no se toca**: nunca se corta ni se aparta de la senda (R4/R5). Lo
  que cambia es el trazado del núcleo, que no sabe qué quedará alto —el nivel
  de cada región lo sortea la escena— pero sí lo seguro. `recargosDelTrazado`
  (`vestir.ts`) cobra tres rectos de más por una casilla con un **acantilado**
  al N, NO o NE (tapaba en el 55 % de esas casillas), uno con una **montaña o
  un bosque** (15 %: solo tapan al lado bajo, #180), y dos por el **borde**. Al
  norte y no alrededor: cobrar las ocho vecinas medía peor. La Y junto a una
  hoja cobra además el recargo mayor de sus esquinas, o salía más barata que su
  L por el borde (s1 (32,5)).
- **El coste satura**: con 12 rectos por acantilado y 4 por lo alto, 16 casillas
  tapadas; con 3 y 1, 17. Lo que queda va por pasillos de una casilla al pie de
  un desnivel, junto a un nodo de acantilado o en la orilla de un barranco
  (las diagonales de una caída al sur también suben sobre la casilla de
  arriba). Para bajarlo más habría que tocar dónde deja pasillos el generador.
- **El borde venía de las puertas**: de 10,7 casillas de camino por mapa en el
  borde, 5,4 eran la puerta de una mina o un pueblo en la penúltima fila (a la
  puerta de la última solo se llega por la misma fila) o en la primera o
  última columna. `colocarPar` ya no las pone ahí (salvo cuando no queda sitio
  con puerta, el respaldo de #188: 51 objetos en 1-1000). Con eso y el coste,
  8,4 → 2,0 tramos por mapa; lo que queda son pasillos de una casilla entre el
  borde y una barrera.
- **El guardia**: `informe.sendaBajoElRelieve`, los tramos de ≥ 0,5 casillas
  en los que la huella entera (centro y los dos bordes, a la media anchura de
  `ANCHO_DE_SENDA`) cae bajo la silueta de una frontal, una ladera o una
  diagonal; la bajada no cuenta. No es 0: 12,5 → 9,1 por mapa en 1-40, con un
  techo de media de 10,5 (`test/senda-bajo-el-relieve.test.ts`). Con el alfa
  de cada píxel bajo el centro de la senda, 23,3 → 16,5 casillas por mapa.
- Cambia la colocación y con ella todo el mapa (el vestido reintenta y
  cualquier tirada de más lo cambia entero): 0 semillas idénticas en el banco,
  menos nodos de agua (533 → 464 en 1-200 por la colocación sola) y seis
  tests anclados a una semilla movidos a otra.

## La senda se aparta de lo que la tapa (#206, 08-10-2026)

Seguía #189: 9,0 tramos por mapa con la senda entera bajo una pieza del
relieve (1-40). Clasificados los 359:

- **Qué tapa**: la esquina y el talud, no la cara. Diagonal sola 137, ladera
  sola 103, diagonal con frontal 50, diagonal con ladera 45, las tres 16,
  frontal sola 8. El talud de una ladera cae 0,45 / 0,65 / 0,85 casillas por
  caída 1 / 2 / 3 sobre la columna de al lado, que es por donde va un camino
  de norte a sur pegado a ella.
- **Dónde**: 230 al pie (la senda no cambia de nivel) y 129 cruzando un
  desnivel sin bajada (bajando al norte, de espaldas, sin pieza; o junto a un
  puente). 55 a una casilla de un nodo —la muesca de un nodo de acantilado,
  que se cruza en diagonal entre dos crestas— y 111 a la puerta de un objeto.
- **El trazado no llega**: el núcleo no sabe qué región quedará alta. Con los
  recargos disparados (acantilado 10 al norte y 8 a los lados, lo alto 5, el
  agua al norte 4) la media solo baja a 7,7; con la senda ya apartada, ninguna
  combinación pasa de 0,3 tramos, ruido, y cambiaba el juego. No se tocó.
- **La senda pintada se aparta** (`apartarDeLoQueTapa`): un prototipo sobre la
  escena acabada daba 9,0 → 5,9 con 0,35 casillas de tope (con 0,45 y 0,6, 6,4
  y 6,6: al apartarse de una pared se metía bajo la de enfrente; ni con 0,7 de
  tope se salvaba, punto a punto, más del 62 % de lo tapado). Para que todo lo
  demás se aparte de la senda ya apartada, las paredes se ponen antes que ella
  —nunca se apartaban de nada salvo la reserva y los tableros— y las frontales
  con su propio azar. Medido en `componer`: con los extremos fijos 0,4 y la
  rampa de 0,6, 6,9; los extremos a 0,2 y sueltos en 0,3, 6,3 (casi todo lo
  tapado va a la puerta de algo); dos pasadas, 5,8; la rampa de una casilla,
  5,4.
- **Sin arrimarse a lo alto** (tras rebasar sobre #203, #204, #205 y #207):
  la senda corrida hacia el canto de un acantilado dejaba sin roca 17 casillas
  de lo alto (`acantiladosLisos`, #205), la corrida hacia un lienzo de muralla
  lo pisaba (s439, `murallaSobreSenda`) y en una cordillera estrecha no cabía
  la cumbre (#204, s11: 7 dominantes). La senda ya no se arrima a un
  acantilado, un muro ni una cordillera a menos de media casilla de su canto
  más de lo que estaba, y las dos pasadas y lo que se lleva la rampa miran la
  senda de partida: **6,55** (9,05 sin apartarla). Además, una tirada de la
  separación entre frontales se había quedado en la corriente común y movía
  todo lo de después, cordilleras incluidas: va con la de las frontales.
- **Lo que queda** (216 en 1-40 antes de no arrimarse; 262 después): 81
  cruzan un desnivel sin bajada, 38 junto a un nodo y 58 a la puerta de un
  objeto (contados con 216). Bajarlo más pide arte (una bajada al
  norte) o que el generador no deje la muesca del nodo en diagonal.
- **Con los niveles del mapa** (#143, que ya bajó el contador a 6,3 por mapa
  en 1-40 y deja alguna semilla a 0): la senda apartada lo baja a **4,5**
  (1,8 tramos menos por mapa). El techo del guardia, de 10,5 a 5; la muestra
  del bucle rápido, las semillas que más cambian (1, 3, 12 y 28: 7,75 sin
  apartar, 4,0 con ello).

## Las regiones definen el mapa (#195, 08-10-2026)

Decisión del usuario, que sustituye a #177 y #111: «las minas deberían ir por
regiones y estas definir el tamaño del mapa». Antes `LADO_DEL_MAPA` (34) era el
dato, las parejas de regiones de fuera salían del área (`round(W·H / 300)`) y
las minas eran 14 por bando, dos de cada recurso, en cualquier tamaño (#111).

- **El dato es `REGIONES_POR_BANDO`** (la de casa y las de fuera, que van en
  parejas en espejo). El lado se deriva: `ladoDelMapa(r)` = ⌊√((r − 1) · 300)⌋,
  con la raíz por bucle entero (`core` no usa `Math.sqrt`), y su inversa es la
  cuenta de siempre, `regionesDelMapa`. Vuelven a coincidir en todo el rango, de
  3 regiones (24×24, `LADO_MINIMO_DEL_GENERADOR`) a 15 (64×64, el máximo): el
  rango del generador en regiones es exactamente el de #102 en lado. El suelo y
  no el techo porque da 34 para 5: **con el reparto de minas de antes, el banco
  sale `c53c353b…` exacto**, así que el lado derivado no cambia ni una partida.
- **Lo que escondía la regla del lado**: 32×32 tenía 3 parejas de fuera
  (round(1024/300)) y 34×34, 4. La «mediana 7 en 32» y el «32 ya cumple» de #177
  comparaban mapas con distinto número de regiones; medido por regiones, la
  palanca es una sola.
- **Minas por región (regla nuestra, inventada)**: la de casa, oro, madera y
  mineral; cada una de fuera, una rara y una básica, por turno
  (`minasDeLasRegiones`). Por bando, `2 · regiones + 1`: 11 con 5 (eran 14). Se
  colocan en el orden de antes (casa, y por rondas una por región de fuera).
  **Tres por región de fuera no cabían**: con tres (15 por bando) las semillas
  con algún objeto puesto sin su puerta (`libresConPuerta`, el respaldo de #188)
  subían de 243 a 314 de 1 000, y en la orden lenta se rompían la auditoría
  densa (puertas mal entradas y horquillas en Y en s42, s57, s73), las aspas
  (s214, s239, s463, alguna obligada entre dos minas y un monstruo) y el eje de
  un nodo (s38). Con dos, 195 de 1 000 y todo verde.
- **El número por defecto, con la regla de siempre** (menor número con mediana
  ≥ 8 días, p90 ≤ 20 y 0 sin terminar en 1 000 semillas; `tools/qa/tamanos.ts`,
  que ahora mide por regiones). Medido el 08-10-2026 sobre main 60c784f + este
  cambio, mediana / p90 / máximo:

  | regiones por bando (lado) | 1-1000 | 1001-2000 |
  |---|---|---|
  | 3 (24×24) | 5 / 9 / 14 | — |
  | 4 (30×30) | 7 / 13 / 25 | 7 / 13 / 48 |
  | **5 (34×34)** | **8 / 16 / 57** | **8 / 16 / 41** |
  | 6 (38×38) | 10 / 20 / 62 | — |

  0 sin terminar en todas. **5 por bando**, el mismo mapa de 34 que antes. La
  base, con las 14 minas: 34×34 8 / 16 / 47 y 30×30 7 / 12 / 26.
- **El agente sigue con ancho y alto**: diseña a mano y su plan se valida por la
  red (`validateMapPlan`), no por cuántas regiones o minas trae. Lo mínimo que
  no rompe el contrato: `want` igual, el servidor le pide el lado derivado, y un
  consejo más en `advice` con el reparto del procedimental para ese lado
  (`serializeMapRequest`, sacado de las mismas funciones).
- **El arnés de `pnpm qa`** buscaba una semilla con «un equip y un turno
  después»; en la 4 el novato equipado caía en la batalla del día 4 y `pnpm qa`
  no veía a nadie equipado. Ahora exige lo mismo que el arnés en vivo: un
  individuo con una pieza puesta en un turno (`faltaParaElArnes`).
- Banco: `c53c353b…` → `fdf6959c…`, 0 semillas idénticas, primer hecho
  distinto un `raider_spawned` del día 1, 96 con otro ganador, 0 sin terminar,
  8 / 17 / 47 → 9 / 15 / 57. Rectitud 120/15/8 → 121/13/8 (techo 140/115/8).
  Cinco tests anclados a una semilla, movidos a otra, y el ancla de los paneles
  regenerada.

## La muralla es la frontera, no la forma de la franja (#197, 08-10-2026)

El usuario marcó dos sitios en s1 (13-16, 2-6): «muralla con hueco» y «muralla
sin sentido». En general, «la muralla no encaja bien ni forma secciones
coherentes». La crítica está en `docs/agents/2026-10-08-muralla-coherente/`.

- **La causa era la escena, no el generador.** La franja de muro tiene dos casillas
  de ancho y va a escalones y con bultos a propósito (#169: el lado que engorda
  se da la vuelta cada `TRECHO_DEL_LADO`). La línea de #183 era su esqueleto
  (Zhang-Suen) y copiaba esa forma:
  - lo que quedaba a más de 1,42 se cosía como un espolón, y en s1 salía al
    oeste y moría en la nieve;
  - había una esquina en cada escalón;
  - la torre iba solo en giros de 90° o más, y la junta de 45° entre la tira
    N-S y el diagonal (apoyado por su punta baja) se veía abierta en s1 (15,5).

  El espolón existía para cumplir el guardia `sinMuralla` («toda casilla de
  muro a 1,42 de un tramo»).
- **La línea va ahora de terminal a terminal** (`trazaDeMuralla`):
  - Los terminales son las puertas y los **apoyos**: grupos de casillas de la
    franja que tocan una misma cosa de fuera (barrera, borde, huella de ciudad)
    y dos lados pisables.
  - Se unen con tiradas de mínimo coste en un árbol de Prim, de cada terminal a
    lo ya trazado. Una esquina cuesta 3 casillas, el borde de la franja un poco,
    el pie de una cara 1,5, y llegar a lo trazado una esquina, salvo bajo una
    ciudad.
  - Lo que la línea no pisa es escombro.
- **El guardia pasa de cobertura a cierre** (`fugasDe`): en una rejilla de 4×4
  por casilla, ¿llega un lado a otro por la franja sin cruzar lo pintado?
  - Los tramos tapan media casilla y acaban en seco. Con cabos redondos, un tramo
    de menos no dejaba fuga.
  - Las puntas que se apoyan se alargan hasta lo que tocan.
  - Con 0,25 de ancho contaba como fuga una tira de un cuarto de casilla entre
    un lienzo y el bosque (s42).

  `sinMuralla` desaparece: en 1-40 quedan **281 casillas** de franja (de
  2 729) a más de 1,42 de la línea, que ahora son escombro. Lo que se pide es
  que cierre (`fugas`, en `murallasPartidas`) y, aparte, que se lea como una
  muralla: `espolones` y `esquinasAbiertas` (`informe.murallaIncoherente`).
- **Lo que hizo falta para cerrar, cada cosa con su semilla:**
  - **s86**: una orilla que toca tres lados. Se añade el apoyo que toca a los dos
    lados que se juntan, por sus casillas más a medio camino.
  - **s270**: una franja que acaba contra un acantilado que toca un solo lado.
    Se añade un apoyo que la fuga roza.
  - **s58**: un dedo de una región metido en la franja. Se añade lo más estrecho
    entre los dos lados. De los candidatos va el que más fugas cierra.
  - **s103**: por lo alto quedaba un dedo al otro lado. Si cerrar por lo alto no
    cierra, se traza en llano.
  - **s2 (22-24, 27-28)**: dos apoyos pegados bajo una ciudad hacían un
    triángulo de tramos con cuatro torres.
  - **s9 (8-12, 1-6)**: la franja tiene un lado alto y otro bajo, y el relieve
    la parte por el medio. La línea iba al pie de la cara y la cara la tapaba;
    ahora va por lo alto.
  - Se probaron, y no hicieron falta al final, que el nodo de otra barrera fuera
    un apoyo y un coste por alejarse de la media.
- **Torres**: obligadas en cada esquina (45° incluido) y en cada punta, nunca
  bajo una ciudad. La de una esquina que no cabe se encoge o se corre como la de
  una casilla sola. Donde no cabe de ninguna manera, la línea no dobla.
- **Medido en 1-40 (antes en main 4a1cd8d, con los guardias nuevos aplicados a
  lo que se pintaba):**
  - espolones: 20 en 14 semillas → 0;
  - juntas de dos ejes sin torre: 272 en 37 semillas → 0;
  - fugas: 0 → 0;
  - tramos: 1 114 → 840;
  - cambios de eje en la línea: 466 → 106, de uno cada 2,4 tramos a uno cada 7,9.

  `murallasPartidas`, `murallaIncoherente` y `murallaSobreSenda` dan 0 en
  1-200. En 201-500 queda una fuga, en s443.
- El generador no se tocó y `pnpm banco` sale igual.
- El `esqueleto()` de Zhang-Suen se borró con sus tres tests: ya no lo usa
  nadie. `esqueleto.ts` guarda `Paso`, `ejeDe` y `componentesDePasos`.

## Las cuatro fugas que quedaban y las torres apiladas (#207, 08-10-2026)

Dos restos de #197 y los defectos 4 y 6 de la auditoría 4
(`docs/agents/2026-10-08-auditoria-4/defectos.md`). Las notas y las capturas están
en `docs/agents/2026-10-08-muralla-fugas/`.

- **Cuatro fugas en 1-1000, tres causas:**
  - **s443 y s517: la vecina por índice.** Las puertas de cada franja se buscaban
    con `(y + dy) * W + x + dx`. Así, la vecina de la izquierda de la puerta
    (0,17) de s443 era la última casilla de la fila de arriba, en el borde
    contrario. Esa franja tomaba la puerta por suya, su línea arrancaba de ella,
    no llegaba a nada y se quedaba en una torre suelta. La auditoría lo había
    achacado al apoyo del borde, pero no era eso.
  - **s699: el nodo de otra barrera.** Una franja de 2×2 contra el borde acaba en
    el nodo de un acantilado, que une sus dos lados. Hacerlo apoyo es lo que #197
    había probado y quitado porque no mordía en 1-200.
  - **s730: el paso en diagonal.** Al dar un paso en diagonal, el lienzo tapaba la
    esquina por la que un trozo de un lado se unía al resto, y ese trozo quedaba
    al otro lado de la muralla. Ahora un paso en diagonal nunca pasa entre dos
    casillas pisables, que siempre son del mismo lado.
- **Torres apiladas.** No había guardia. Con `seApilan` (a una casilla, o en la
  misma columna a dos, que la cámara de 25° pone una encima de otra) había 3 138
  en 1-1000. También había 809 puntas de norte a sur sin torre, los «raíles».
  Las causas eran:
  - la punta y la esquina obligadas de una ruina de dos o tres casillas;
  - las líneas que doblan dos veces seguidas;
  - las torres de dos franjas vecinas.

  Lo que se cambió:
  - Las torres obligadas son las juntas y las puntas de norte a sur; las demás
    ceden.
  - La línea no dobla cerca de otra obligada, salvo que sin eso no llegue o no
    cierre.
  - Prim prueba a empezar por otro terminal.
  - El tocón de norte a sur se quita.

  Quedan 13 apiladas en 1-1000, todas en escalones de una fila que la franja
  obliga. Los raíles bajan a 0.
- El banco sale igual. `murallaSobreSenda` sigue en 5 en 1-1000, en las mismas
  semillas que en main (49, 150, 540, 568 y 948). A medio trabajo salió una nueva en s995, y se
  arregló eligiendo para la torre sola de una ruina la casilla donde cabe.

## La IA de reglas juega con niebla (#164, 08-10-2026)

Lo vio el crítico de #130: `casillasPeligrosas` y `chooseHeroDestination`
leían `state.raiders` entero, así que la IA esquivaba grupos que no veía y no
caía nunca en una emboscada (de 304 a 0), mientras la persona y el agente
juegan con la regla de `asaltantesALaVista`. Era una «ventaja declarada» en
`CLAUDE.md`.

**Primer intento, solo lo que ve AHORA** (`grupoALaVistaDesde` con
`miradasDe`): se rompe. La marcha que descubre un grupo se para
(`vigiaDeLaMarcha`), el héroe se aparta, deja de ver la región y al día
siguiente la vuelve a meter en su ruta. 300 semillas: **32 sin terminar**,
14 865 marchas paradas, p90 de 15 a 300 días.

**Con recuerdo**: `Player.asaltantesVistos` (id → casilla, tropa y día) lo
escribe `explorar` —el mismo sitio que `memory`— con `recordarAsaltantes`: los
grupos de las regiones que se miran se apuntan, y los que se recordaban en
ellas y ya no están se olvidan. Basta la región porque un grupo no sale nunca
de la suya. Lo que pasa donde no se mira no se sabe: un grupo disperso lejos
se sigue temiendo hasta volver a mirar. La IA teme lo que recuerda
(`casillasPeligrosas(state, hero, recuerdo)`) y solo persigue lo que ve ahora.
No viaja al agente ni al cliente: ellos siguen con lo que se ve ahora.

Medido con la IA en los dos bandos, 300 días de tope:

| | antes | solo lo de ahora | con recuerdo |
|---|---|---|---|
| sin terminar (1-300) | 0 | 32 | **0** |
| duración mediana / p90 / máx (1-300) | 8 / 15 / 57 | 10 / 300 / 300 | 9 / 16 / 57 |
| victorias nigromante / caballero (1-300) | 159 / 141 | 137 / 131 | 155 / 145 |
| emboscadas a la IA (1-300) | 0 | 1 | 1 (la gana el héroe) |
| marchas paradas (1-300) | 0 | 14 865 | 181 |
| sin terminar / duración (1-100) | 0 · 9 / 16 / 32 | — | 0 · 9 / 18 / 30 |
| victorias nigromante / caballero (1-100) | 56 / 44 | — | 55 / 45 |

Con más regiones (300 semillas cada uno, antes → después): 7 por bando (lado
42) y 8 (lado 45), 0 sin terminar en los dos; 8: 12 / 23 / 54 → 12 / 23 / 53.
El banco cambia en 119 de 200 semillas (la forma, en `tools/qa/banco.ts`).

La emboscada sigue siendo rara porque la vigía para la marcha en cuanto ve un
grupo, y casi siempre lo ve desde el nodo de antes. La IA no ataca nunca a un
grupo en estas partidas, ni antes ni después (0 en 300): se mide aquí para que
no se lea como efecto de la niebla.

## El desgaste de lado 44 ya no se da; el encierro en una ciudad, sí (#186, 08-10-2026)

#186 vio, midiendo #182 con lado 44, la semilla 285 llegar al día 300: dos
héroes que se vencían a diario, el que perdía se rendía, reclutaba en su base
y ganaba al día siguiente al vencedor mermado. Con el mapa de hoy (#195: el
lado sale de las regiones) **no se reproduce**: la 285 acaba el día 15 con lado
44 y el 26 con 8 regiones por bando (lado 45). Medido con #164 ya puesto, 300
semillas por tamaño, IA contra IA:

| mapa | sin terminar | duración mediana / p90 / máx |
|---|---|---|
| 5 regiones (lado 34) | 0 | 9 / 16 / 57 |
| 7 (lado 42) | 0 | 11 / 22 / 49 |
| 8 (lado 45) | 0 | 12 / 23 / 53 |
| 9 (lado 48) | 0 | 13 / 27 / 160 |
| 10 (lado 50) | 0 | 14 / 30 / 66 |
| lado 44 con 5 regiones (`width`) | 1 → **0** | 12 / 25 / 300 → **12 / 25 / 116** |

El desgaste sigue existiendo en forma leve: la semilla 72 con 9 regiones dura
160 días (igual sin #164) con 97 héroes vencidos y 100 vueltas a casa, pero
acaba. No se toca el precio de rendirse ni la prudencia ante un héroe más
fuerte: ninguna partida de las 1 800 se queda sin terminar por eso.

Lo que sí se quedaba a 300 días con lado 44 era otra cosa: la **semilla 222**
(lado 44, 5 regiones; también antes de #164). Los dos héroes en una ciudad
que no es su base, con todas las regiones de alrededor patrulladas por grupos
que les sacan el margen (438-720 contra 300) y la fuerza parada en el
liderazgo: el alcance prudente era la ciudad y sus nodos, sin objetivo ni
camino a casa, y el encierro de #181 solo saltaba con el alcance reducido a su
casilla. Ahora salta con cualquier alcance cuando no hay destino y lleva
`TURNOS_DE_ENCIERRO` turnos en la misma casilla fuera de su base: vuelve a casa
por el alcance de siempre. La 222 acaba el día 30; el banco sale igual.

## Una elevación no acaba de repente (#210, 08-10-2026)

Queja del usuario tras la auditoría 5: «la falta de coherencia con los
desniveles… una elevacion no puede acabar de repente, sin continuidad». Medido
en las 10 semillas de la auditoría (1, 2, 5, 9, 13, 24, 34, 57, 80, 443):
**112 casillas** de tierra o acantilado más altas que sus dos vecinas este y
oeste (119 en norte-sur), **351 lados de caída 3** y s13 con el 72 % a nivel 2.
En 1-200: 1 694 / 1 959 espigas y 3 364 lados de caída 3.

- **El nivel por casilla pasa al núcleo** (`nivelesDelRelieve`): el generador
  tiene que ver lo que pintará la escena para quitar las espigas, y un hecho
  va en un sitio. Tres cambios de regla:
  - **Por casilla y no por franja**: la barrera va al nivel alto de las dos
    regiones que separa ahí. Una franja de acantilado entre un 1 y un 0 que
    tocaba un 2 en otra punta subía entera a 2 (s1 (14-18, 1-9), una cresta).
  - **El agua, plana y sin encajar**, a ras de la región más baja que toca su
    franja. Encajada un nivel bajo la orilla baja dejaba por encima del agua
    toda lengua de esa orilla y toda ciudad del cruce (las 14 ciudades
    espiga de las 10 semillas), y entre dos mesetas daba caída 3. Se probó el
    agua por casilla: 96 de 1 678 franjas con escalones dentro del agua (173
    lados), una cascada sin arte; plana por franja, 0. La caída máxima es 2.
  - **Nada de una casilla de ancho por encima de sus dos lados**: la barrera o
    el nodo que lo estaría baja a lo más alto de ellos (el espolón de una
    montaña o un acantilado en lo bajo; el paso sin camino con agua a los
    lados, 6 en 1-200 con los pesos de antes). Lo que se pisa no se toca (va
    al de su región).
- **El generador quita las espigas de lo que se pisa** (paso 7b del engorde,
  `quitarEspigas`): la lengua se rellena de la barrera baja de al lado; el
  pasillo de un nodo, que no se toca, se ensancha abriendo la orilla a su
  región (sin otra a menos de tres pasos) o la orilla pasa a montaña. Luego
  bolsillos, cruces y murallas otra vez. Sin esta pasada, 117 de 200 mapas
  llevaban espigas. Los fallos de vestido no cambian (1 712 contra 1 607 en
  1-200); generar 200 mapas tarda un 28 % más (2,5 → 3,2 s, máquina cargada).
- **Menos mesetas** (`data/relieve.json`): nieve, lava y áspero a 2 una vez de
  cada tres. Regiones a 2: 35,6 → 19,0 %; casillas: 39,3 → 21,6 %; por mapa,
  mediana 41 → 22 %, p90 66 → 47 %, máximo 87 → 67 %, mapas con más de la mitad
  arriba 66 → 11. El precio: 64 de 200 mapas sin ninguna meseta (eran 17) y 22
  del todo llanos (eran 3).
- **Resultado en 1-200**: 0 espigas en los dos ejes y 0 caídas de 3 (lados de
  caída 1/2/3: 32 891/14 042/3 364 antes; ahora 19 431/2 931/0). En 24 y
  64 de lado, 0 espigas en 1-40. La senda bajo el relieve baja de 4,5 a 1,2
  tramos por mapa en 1-40.
- **Lo que no se arregla aquí**: la ladera que se lee como cuchilla, el agua y
  el barro que entran en lo alto y el tono por nivel (#211, #212); la meseta
  de 2 × 2 en el agua sigue siendo posible (no es de una casilla de ancho).

### La pared bajo la cordillera (#216, 08-10-2026)

Auditoría 6, defectos 2 y 3. Decisión del usuario: «la pared corre entera: la
montaña queda arriba, en la meseta, y la pared del desnivel corre seguida por
delante de su pie: se lee que la cordillera está en lo alto».

- **Los picos tapaban su propia pared.** Las celdas ponían pieza en todo el
  borde (`celdasMalCubiertas` = 0), pero la cordillera plantaba picos que se
  pintaban después: los espolones del lado bajo (#210 los baja de nivel) y los
  de las filas de más al sur, junto a una ladera. 653 de 1 939 paredes en 1-40
  tenían algo de su silueta tapado; bajo una montaña, 424 de 757 y un 24 % de
  la silueta de media. Ahora las paredes son obstáculo de la masa que se
  pintaría delante (`formasDeLasParedes`) y el informe las cuenta
  (`paredesTapadas` = 0). El precio: las casillas de montaña sin un pico de 0,6
  pasan del 26,9 al 28,0 %; una franja de montaña de una fila entre dos paredes
  (s5 (9-11, 21)) queda con picos bajos.
- **La cara era del suelo de abajo.** La casilla de barrera lleva el nivel del
  lado alto y el suelo más cercano de cualquier nivel; la cara tomaba su roca
  (`CARA_DE_SUELO`). Con `sueloDeLaMeseta` (lo que se pisa más cercano a su
  nivel, sin nodos: un nodo de lava hacía de basalto la cara de una meseta
  nevada en s9 (4,24)) la toman la pared, lo alto del acantilado y cada macizo.
  806 de 2 506 paredes en 1-40 eran de otra roca que su meseta; ahora 0
  (`caraDeOtroMaterial`).
- **Lo que no se arregla aquí**: el suelo pintado bajo la barrera sigue siendo
  el más cercano (2 767 casillas de barrera en 1-40 pintan el suelo de abajo a
  la altura de arriba); un borde en escalera que mira al norte o al oeste (s24
  (7-8, 16-17)) sigue viéndose a trozos, porque la espalda no lleva pared; la
  ladera que se lee como cuchilla (s2 (16-17, 22-26)) es del tono por nivel
  (#217).

## El orden de los turnos, en serpiente (09-10-2026)

Decisión del usuario, sobre la propuesta medida en #229: el jugador 0 ganaba
603 de 1 000 partidas de la IA contra sí misma, y la causa principal era que
**abría todos los días**, como en fheroes2, donde el orden es fijo: llegaba
antes a lo que se disputa y atacaba antes. Ahora el orden va en serpiente
(regla nuestra): quien cierra un día abre el siguiente, día 1 j0, j1; día 2 j1,
j0; día 3 j0, j1… Lo sabe una sola función, `ordenDelDia` (`state/game.ts`), y
la leen el paso de turno (`nextPlayer`), el primer turno de la partida y el
`adventure_turn` del agente (`you.turnOrder`, con su línea de prosa).

**Cómo se separan los efectos.** Cuatro tandas de partidas con el plan
generado con las facciones pedidas y, si toca, los dueños de las bases
cambiados (`generateMapPlan` y `newGame({ plan })`; las tiradas no son las de
`tamanos.ts`): j0 caballero o nigromante, en la base 0 o en la 1. Con un modelo
aditivo, abrir el día es la media menos 500, la base 0 la mitad de la
diferencia entre las dos filas de base y el caballero la de las dos de
facción. Por 1 000 partidas:

| j0 juega con | fijo (1-1000) | fijo (1-500) | serpiente (1-500) |
|---|---|---|---|
| caballero, base 0 | 619 | 650 | 568 |
| nigromante, base 0 | 555 | 560 | 478 |
| caballero, base 1 | 550 | 546 | 516 |
| nigromante, base 1 | 535 | 524 | 446 |
| **abrir el día** | **+65** (±8) | +70 (±11) | **+2** (±11) |
| la base 0 | +22 | +35 | +21 |
| el caballero | +20 | +28 | +40 |

En `tamanos.ts` (1-1000): j0 **603 → 534**, 0 sin terminar, duración 8 / 16 /
34 → **8 / 14 / 26**; en 1-100, 9 / 15 / 31 → 8 / 14 / 22 (j0 64 → 55). El
barrido de 40 semillas, 0 sin terminar. Lo que queda de ventaja es la base 0
(los muros sin espejo y los desempates por índice, sin separar) y el caballero
(#89), que en serpiente pesa más: no es de esta regla.

**Qué supone.** El que cierra un día juega dos turnos seguidos con el cambio
de día en medio (la patrulla de los asaltantes, la hornada del lunes); entre
los suyos, el rival juega dos o ninguno. La renta y los puntos de movimiento
van con el turno, así que nada se cobra dos veces ni se pierde. El agente, que
es el jugador 1, cierra el día 1 y abre el 2: recibe dos `adventure_turn`
seguidos, cada uno con su veredicto, y la prosa se lo dice. En el cliente, la
persona que cierra un día vuelve a tener el turno sin que el rival mueva; la
pausa de «Fin de turno» (`PAUSA_TRAS_EL_RIVAL`) ya cubre ese instante, y la
barra lee `state.current`, como el espectador.

## La muralla de la arena, junta con el banco de combate (10-10-2026)

Tres ramas hechas el 09-10 sobre el mismo `eab467d` se integraron en una
historia lineal sobre main (rama `integracion`): el banco de combate (`combate`),
las murallas de la arena con la muralla alta (`asalto`,
`docs/agents/2026-10-09-murallas-en-la-arena/` y `…/muralla-alta/`) y la base
caminable (`bases`). Las dos primeras tocaban lo mismo —la arena, el motor de
batalla y el daño— y se juntaron enteras, no una encima de la otra:

- **Una sola puerta para montar**: `crearBatallaConReglas(…, reglas, muralla)`;
  `createBattle` es el juego (`REGLAS_DEL_JUEGO`) y acepta la muralla solo para
  los tests. El montaje de la arena (`MontajeDeArena`) lleva la muralla, y cada
  fuente (hoja del borrador o criatura del catálogo) su escalera; una criatura
  del catálogo que la lleva entra como personaje, con las cifras del catálogo
  tal cual, porque la escalera viaja en `BattleMember`.
- **Lo alto, en las opciones del daño**: `bonoEnLoAlto` lo pone
  `opcionesDeDanio`, que era ya la única forma de montarlas. Antes cada golpe se
  lo pasaba a mano y la previsión de la otra rama no lo habría visto; así lo
  cuentan igual el golpe, el disparo, la IA, la ficha («+3 de defensa en lo
  alto») y la previsión, que lo dice como causa («…, en lo alto de la
  muralla»). Lo vigilan dos escenarios nuevos de `test/prevision.test.ts`
  contra el daño real en las combinaciones de reglas.
- **El golpe y el disparo leen el nivel y el tiro tapado** en sus `*Blocker`
  (`golpeBlocker`, `devolveraElGolpe`, `disparoContraBlocker`), que la otra rama
  había sacado de `applyAction` para la previsión: un disparo tapado por el muro
  no se prevé, se dice por qué con la frase del núcleo.
- **La regla del tirador de fheroes2** dejaba escrito «fuera de una muralla, que
  aquí no hay»: allí tirar a través de la muralla pega la mitad; aquí, en el
  suelo, no se tira a través, y desde lo alto o hacia lo alto no se cruza. No
  hay caso que cubrir.
- **El enlace de la pelea**, versión 2: muralla y escalera por puesto, con las
  mismas comprobaciones que la página (que quepa en las columnas de salida, que
  nadie lleve una escalera que no usaría). Un enlace de la versión 1 se sigue
  leyendo, sin muralla.

La base caminable solo rozaba la batalla en la escala (`escalaDelCombate`, que
ahora lleva el alzado de la muralla y la base pide sin él) y en la caja de la
figura (`cajaDeFiguraEn`, con la elevación de lo alto). Lo que pedía adaptar de
main fue el orden en serpiente en un test de las voces (el segundo turno del
agente es el cuarto) y re-anclar `test/fixtures/paneles.txt` con la lista
«Edificios». `pnpm banco`: el hash no cambia (ninguna batalla del mapa lleva
muralla ni otras reglas).

## Decisiones tomadas

- **MCP antes que API key.** El usuario tiene Claude Max: el agente entra por
  MCP, no por una clave de API.
- **`FAL_KEY` nunca llega al navegador.** Las llamadas salen de scripts CLI en
  el build; el cliente solo carga PNGs.
- **Nada del HoMM2 original.** Los `.AGG` son de Ubisoft. Se reimplementan las
  reglas —que no son protegibles— y el arte se genera.
- **Dos facciones**: caballeros y nigromantes, seis criaturas cada una con sus
  mejoras.

- **Fronteras de suelo con ruido (R1, 07-10-2026).** La máscara de 1 px por casilla desenfocada dejaba las fronteras de región como rectas difuminadas. `fronterasDelSuelo` lee el campo del suelo en un punto deformado y mezcla por altura con la textura (técnica de Mishkinis; la comparación con VCMI, AoE2 y otros está en `docs/agents/2026-10-07-arquitectura-mapa/comparacion.md`). Medido alternando con la máquina cargada: esbozo +0,15 s, bueno −0,3 s. Se probó primero solo con ruido y altura, y una frontera de 15 casillas seguía leyéndose recta al tope de alejar: hizo falta deformar.
