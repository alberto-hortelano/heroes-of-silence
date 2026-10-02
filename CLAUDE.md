# Heroes of Silence — guía de desarrollo

Clon de Heroes of Might and Magic 2 en el navegador, pensado como **banco de
pruebas para un juego con IA**: los NPCs los lleva un agente conectado por MCP,
los mapas los diseña ese mismo agente y los assets se generan con fal.ai.

El juego es el andamio; lo interesante es lo que se puede enchufar dentro.

## Arrancar

```bash
pnpm install
pnpm dev        # cliente en http://localhost:3100 (juego local contra la IA de reglas)
pnpm mirar      # MIRAR la partida del agente: /espectador/ contra el servidor
pnpm verify     # typecheck + lint + 978 tests, 12,6 s: el bucle rápido
pnpm test       # 978 tests: reglas, batalla, partida completa y contrato del agente
pnpm typecheck
pnpm lint       # Biome: formato y lint en una sola pasada, 40 ms
pnpm format     # lo mismo, arreglando lo que sepa arreglar
pnpm banco      # 200 partidas: tiempo y sha256 del volcado, 4,1 s

npx tsx tools/qa/enfrentamiento.ts   # dos tácticas frente a frente, 5000 batallas, 11,8 s
pnpm capturas   # juega el cliente en Chromium (Playwright) con clics reales y saca capturas, ~87 s
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
pnpm qa   # pide el mapa al agente, arranca servidor + puente MCP y juega, 3,0 s
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
tools/gen/         generación de assets con fal.ai
tools/qa/          verificación de extremo a extremo
data/              criaturas, edificios y hechizos en JSON editable
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

**Y el mapa se midió en vez de elegirse**, dos veces. La primera fue con el
generador de esquinas, antes de la red de nodos, y dejó el 24×24; la segunda, la
que manda hoy, es del ciclo de los asaltantes («más distancia entre bases… que lo
decida la medida») y dejó **el 28×28** (`LADO_DEL_MAPA`, en `map/generate.ts`; el
servidor lo lee de ahí en vez de copiarlo). Se mide con `tools/qa/tamanos.ts`, 1 000
semillas por lado, con asaltantes y —en una copia de `main` sin ellos— sin:

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
levantan como cordillera de una casilla, cada pareja de regiones vecinas tiene un
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
que audita 200 semillas en 24×24 y 20 en 48×48 **desde fuera**.

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
- **El alcance prudente no pisa la región que embosca, tampoco la suya.** Es una
  opción del mismo Dijkstra (`alcanceDelHeroe(…, { evitarEmboscadas })`, una sola
  puerta), con esas casillas como **muro** y no como final de trayecto —la
  primera casilla ya es la emboscada— y el origen respetado, que es lo que deja
  salir por el nodo de al lado a un héroe que se ha quedado mermado dentro de una.
  Dejándole andar por la suya eran 23 de las 33 emboscadas que quedaban.
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
si lo es antes de creerse la mediana.

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
| `pnpm verify` | 11,9 s | siempre |
| `test/invariantes.test.ts` | 505 ms | va dentro de `pnpm test` |
| El navegador | minutos | si el cambio se ve |
| El espectador en el navegador | minutos | si tocas `html.ts`, `espectador/` o el canal |
| `pnpm qa` | 3,0 s | si tocas `src/server/` o el contrato |
| `pnpm capturas` | ~87 s | si el cambio se ve: juega el cliente y el espectador en Chromium y sale 1 con un error en consola |
| `npx tsx tools/qa/barrido-semillas.ts` | 1,1 s | si tocas la IA o la economía |
| `pnpm banco` | 4,1 s | si tocas el núcleo sin querer cambiar el juego |
| `tools/qa/enfrentamiento.ts` | 11,8 s | si cambias **cómo decide** la IA de batalla |
| CI (`.github/workflows/ci.yml`) | ~1 min | en cada push y cada PR |

Los tiempos están **medidos**, tres pasadas cada uno, no estimados: los que
había antes decían 3 s y «~1 min» y llevaban ciclos siendo falsos. Que `pnpm qa`
tarde 5 s y no un minuto no es una mejora: es que la partida se acaba el día 4
porque el agente defiende y pierde, así que la cobertura real son **1 mapa
diseñado, 6 turnos de mapa, 17 decisiones de batalla y 1 ascenso de tropa a
héroe** — eran 3 y 15 hasta que la base dejó de quedarse indefensa tras un
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

## Decisiones tomadas

- **MCP antes que API key.** El usuario tiene Claude Max: el agente entra por
  MCP, no por una clave de API.
- **`FAL_KEY` nunca llega al navegador.** Las llamadas salen de scripts CLI en
  el build; el cliente solo carga PNGs.
- **Nada del HoMM2 original.** Los `.AGG` son de Ubisoft. Se reimplementan las
  reglas —que no son protegibles— y el arte se genera.
- **Dos facciones**: caballeros y nigromantes, seis criaturas cada una con sus
  mejoras.
