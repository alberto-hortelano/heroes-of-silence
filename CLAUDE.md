# Heroes of Silence — guía de desarrollo

Clon de Heroes of Might and Magic 2 en el navegador, pensado como **banco de
pruebas para un juego con IA**: los NPCs los lleva un agente conectado por MCP,
los mapas los diseña ese mismo agente y los assets se generan con fal.ai.

**El porqué de cada regla, las medidas con su fecha y las lecciones de QA están
en `docs/historia.md`.** Antes de deshacer algo que parezca raro, búscalo allí.

## Arrancar

```bash
pnpm install
pnpm dev        # cliente en http://localhost:3100 (juego local contra la IA de reglas)
pnpm mirar      # /espectador/: mira la partida del agente contra el servidor
pnpm arena      # /arena/: monta unidades de las cinco facciones y hazlas luchar
pnpm verify     # typecheck + lint + tests, ~17 s: el bucle rápido
pnpm verify:lento  # lo mismo con todas las semillas y todo el arte rederivado, ~75 s; corre en CI
pnpm test | pnpm typecheck | pnpm lint | pnpm format
pnpm banco      # 200 partidas: tiempo y sha256 del volcado, anclado en el fichero
pnpm marcas     # fallos del mapa marcados en pnpm dev (M o «Marcar»): lista, ver <id>, resolver <id> <ref>, recorte <id>
pnpm qa         # circuito entero del agente (mapa, servidor, puente MCP), ~3 s
pnpm capturas   # juega cliente, espectador y arena en Chromium con clics reales, ~245 s; deja los PNG en .cache/capturas/ o en la carpeta que se le pase
npx tsx tools/qa/barrido-semillas.ts   # cuántas partidas no terminan (hoy 0)
npx tsx tools/qa/enfrentamiento.ts     # IA de batalla de hoy contra su versión anterior
```

- **`?seed=N` fija la partida**; la barra enseña siempre cuál se juega. Lo que no
  es semilla se rechaza diciéndolo (`parseSeed`, en `core`). `?seed=` vacío =
  sin semilla. Si el agente diseña el mapa, la semilla del servidor ya no
  reproduce la partida, y la consola lo dice.
- **`vite build` copia `assets/` sin lo que solo lee el taller**: de cada
  `unidades/<id>/dN/`, solo `atlas.webp` (`seCopiaAlBuild`, `tools/build/publico.ts`, #137).
- **CI** (`.github/workflows/ci.yml`): `pnpm verify`, `pnpm test:lento`, `pnpm banco`,
  `vite build` y `pnpm qa`. No gasta un céntimo: nada de `tools/gen/`.
- Un hook `Stop` (`.claude/hooks/verde.sh`) impide cerrar una tarea con
  `pnpm verify` en rojo.

### Jugar con el agente

```bash
pnpm partida   # terminal 1: el servidor. NO `pnpm server` (es un subcomando de pnpm y sale 0 sin hacer nada)
# terminal 2: Claude Code desde la RAÍZ del repo (el MCP "heroes" está en .mcp.json)
#   «juega la partida: llama a heroes_listen, decide y responde con heroes_respond, y repite»
pnpm mirar     # terminal 3, opcional: verlo
```

Los puertos salen de `HEROES_AGENT_PORT` / `HEROES_SPECTATOR_PORT`
(`src/server/entorno.ts`); `0` deja elegir al sistema. Las variables de entorno
pasan todas por el mismo parser y fallan diciéndolo.

## Mapa del repositorio

```
src/core/          TypeScript puro: las reglas. Sin DOM y sin node:*
  arena.ts         unidades de la arena: formato, validación y batalla
  battle/          rejilla 11×9, iniciativa, daño, hechizos, efectos
  map/             mapa, pathfinding (frontera.ts), niebla, generación (generate.ts,
                   vestir.ts) y red de nodos (regiones.ts)
  town/ hero/      castillos, edificios, reclutamiento; héroes, tropa, experiencia, equipo
  state/           GameState, turnos, batallas del mapa, asaltantes
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod y serialización para el agente
src/server/        bridge WebSocket + puente MCP (partida.ts, director, entorno.ts)
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  html.ts          LA PUERTA del marcado
  session.ts       LA PUERTA al núcleo
  escenas/ render/ views/   ratón y cámara; lo que se pinta; paneles
  espectador/      mira la partida del servidor, no juega (adaptar.ts, paneles.ts)
  arena/           monta unidades con cifras inventadas y las hace luchar
src/shared/        contrato visual (cámara a 25°, luz) de cliente y taller
tools/gen/         generación de assets con fal.ai
tools/qa/          verificación de extremo a extremo y medidas
tools/datos/       extrae JSON de NuevaJugabilidad.md con expresiones regulares
tools/arena/ tools/taller/ tools/art/   arena, taller de arte, rig del Y Bot
data/              criaturas, edificios, hechizos, experiencia, equipo… en JSON editable
assets/            arte (generated/, unidades/, mapa/, _poses/ del Y Bot)
docs/agents/<tarea>/   lo que se pasan los roles del ciclo
```

## Contratos que no se rompen

- **La lógica vive en `core` y el cliente solo pinta.** Quien aplica reglas pasa
  por `session.ts`. El espectador no aplica ninguna: entra por
  `espectador/adaptar.ts`, la inversa exacta de la serialización del servidor.
- **`core` es puro**: nada de `node:*` ni DOM, ni `core` importando `src/server`.
- **Toda tirada pasa por `createRng(seed)`.** Ni un `Math.random`.
- **Sin coma flotante dependiente de la plataforma en `core`**: `Math` solo
  seguido de `min`, `max`, `floor`, `ceil`, `abs`, `round` o `imul`. Nada de
  `**`, `Math.pow` ni trigonometría. Es lo que hace el banco reproducible fuera
  de esta máquina.
- **Todo el marcado del cliente sale por `html.ts`** y `pintar` es el único
  `innerHTML`. La plantilla escapa según dónde cae el hueco, reconoce lo ya
  escapado por un símbolo privado y lanza con lo que no entiende;
  `href`/`src`/`style` se validan (`srcDeImagen`, `fondoDeColor`…), no se escapan.
- **Fail-loud.** Una acción ilegal lanza con un mensaje para la persona. La
  excepción son las acciones del agente: se descartan una a una con su motivo.
  El motivo de un rechazo lo escribe un `*Blocker` del núcleo y lo leen
  `legalActions`, la acción y la pantalla.
- **El juego se juega sin agente y sin arte**: sin agente juega `core/ai`; sin
  imágenes, cada renderizador pinta su marcador.
- **Un hecho, un sitio.** Si son dos caras, se escriben juntas en una función.
  Lo que el agente no puede comprobar se deriva, no se escribe a mano.
- **El Dijkstra desempata por orden de descubrimiento**, y `Frontera` es de una
  sola búsqueda (lanza si se reutiliza). Cambiarlo cambia las partidas; lo caza
  `pnpm banco`, no los tests.
- **La crónica**: `state.log` es `readonly` y `emit` (no exportada, en
  `game.ts`) hace el único `push`. Cada hecho lleva protagonista, sitio y sello
  `seen`. `game_over` es el último hecho por regla del núcleo. De una batalla
  sobrevive solo el resumen dentro de `battle_ended` (`resumenDeBatalla`:
  rondas, hechizos, bajas por bando, dueños; #93), no su registro.
- **Herramientas de desarrollo solo en `pnpm dev`**: `src/client/desarrollo/` entra por un
  `import()` detrás de `HERRAMIENTAS_DE_DESARROLLO` (`define`, `false` en build); desde fuera,
  solo `import type`. Lo vigilan `invariantes.test.ts` y el plugin `sinDesarrollo`, que rompe
  `vite build` si se cuela. Las marcas van a `docs/revision/marcas/` (ignorado).
- **Un guardia hay que verlo morder**: cada invariante nuevo se rompe a mano y se
  mira rojo antes de darlo por bueno. Una orden documentada hay que verla
  arrancar (y morir).

### Puertas únicas

| Qué | Dónde |
|---|---|
| Dueño de castillo y de nodo | `captureTown`, `captureNode` |
| Quitar vida | `herir` (`battle/damage.ts`; `applyDamage` no se exporta) |
| Cifras = catálogo + veteranía + equipo | `cifrasDeCatalogo`, `cifrasDelIndividuo`, `conEquipo` |
| A quién se licencia | `elQueSeIria` (`hero/troop.ts`) |
| Construir un héroe | `heroeRecienHecho` |
| Reindexar el nivel de héroe | `subidasDeHeroe` (lanza por debajo del 5) |
| Añadir a la mochila | `aLaMochila` |
| A quién va una pieza | `destinoDeEquipo` |
| Formatear un precio | `describirCoste` |
| Camino de un héroe (con lo hostil) | `alcanceDelHeroe`, `caminoHasta`; nadie fuera de `game.ts` llama a `findPath`/`reachableFrom` |
| Territorio y renta | `territorio(state)`, `dueñoComun` |
| Validar un plan de mapa (agente y procedimental) | `validateMapPlan` → `problemasDeRed` |
| Qué barrera cruza un nodo | `MapObject.barrera`, que pone `buildMap` con el muro que abre; el procedimental escribe ese muro con `queCruzaElNodo` |
| Caminos de un plan al mapa | `caminosDelPlan` |
| Carga | `cargaDesde` (cuándo), `cargaEfectiva` (tope), `casillasDeCarga` (qué se enseña) |
| Turno de batalla | `BattleState.turno` (`n`, ordinal); `mismoTurno`; viaja como `turnId` |
| Tope de jugadas | `MAX_JUGADAS` |
| Desenlace y causa del final (barra, crónica y nota del agente) | `finDePartida`, `desenlaceDe` (`state/desenlace.ts`) |
| Ventaja para atacar/emboscar | `ventajaClara` (`ai/fuerza.ts`) |
| Lo que se anda hoy (marcha y ruta) | `pasosDeHoy` (`state/game.ts`) |
| Qué héroe se ve y qué se sabe de un objeto (agente, lienzo, minimapa, barra) | `heroesALaVista` (lo mirado ahora), `objetosConocidos` (vivo si se mira, si no el recuerdo de `memory`); el cliente, por `Session` |
| Qué grupo de asaltantes se ve | `asaltantesALaVista` (lista con la marca `AsaltantesALaVista`; sin niebla, `todosALaVista`); para un grupo suelto, `grupoALaVistaDesde` |
| Por qué una marcha no llegó (veredicto del agente) | `paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`) |
| Material de una cara (pared, ladera, pedregal) | `materialDeCara` (`render/escenario/colocar.ts`) |
| Roca de lo alto de un acantilado (picos, peñascos, reborde) | `materialDeLaCima` (`render/escenario/bordes.ts`) |
| Qué barreras admiten los niveles de dos regiones | `admiteLosNiveles` (`terrain.ts`), que leen `barrerasDeLaPareja`, `candidatasSinMuro` y `problemasDeNiveles` |
| Franja de barrera (8-conexa, con las regiones que toca) | `franjasDeBarrera` (`regiones.ts`), que leen `relieve` y `problemasDeNiveles` |
| Nivel de cada casilla de la escena | `relieve` (de `MapRegion.nivel`; nada lo inventa) |
| Muralla de una franja de muro (línea, torres, guardia) | `trazaDeMuralla`, `torresDe`, `murallaSinLeer` (`muralla.ts`); torres apiladas, `seApilan`; lo de alrededor, `alrededorDeMurallas`; en la escena, `meterEnLaMuralla` |

`test/invariantes.test.ts` vigila las fronteras de esta sección. Todos nacen en
verde.

## Reglas del juego

Verificadas contra fheroes2 salvo donde dice «regla nuestra».

| Dato | Valor |
|---|---|
| Rejilla de batalla | 11 × 9 = 99 hexes, offset odd-r |
| Tropa | individuos, uno por hex, acotados por el liderazgo (`data/liderazgo.json`, provisional) |
| Recursos | madera, mercurio, mineral, azufre, cristal, gemas, oro |
| Movimiento diario | lo marca la criatura más lenta; se fija al empezar el día |
| Puntos de hechizo | 10 × Conocimiento |
| Moral y suerte | −3 a +3 |
| Moral por mezcla de facciones | se cuenta al empezar la batalla y no se recalcula al morir un stack (como fheroes2, #49) |
| Moral con no-muertos | −1 a todo el ejército que lleve alguno, y anula el +1 de una sola facción (como fheroes2, #199); el no-muerto sigue a 0. **Sin copiar**: allí un ejército de una sola criatura repetida no cobra el +1 (`AllTroopsAreTheSame`) |
| Prisa/Lentitud | duran el poder mágico del lanzador, en rondas |
| No-muertos | inmunes a la mala suerte; moral 0 |
| Iniciativa | cada bando por velocidad y puesto; un empate entre bandos lo gana el contrario del último que tuvo turno (el paralizado por la moral no cuenta), el atacante el primero (como fheroes2, `GetCurrentUnit`, #199). **Divergencia pendiente**: la velocidad es la de empezar la ronda; allí una Prisa a media ronda adelanta |
| Dos efectos del mismo origen | refresca la duración (la mayor), no se acumula |
| Turno de una unidad | **regla nuestra**: se mueve en tramos hasta gastar su velocidad; atacar lo cierra; tras moverse no dispara, ni defiende, ni espera |
| Esperar | **regla nuestra** (fheroes2 no tiene espera: su `SKIP` cierra el turno): vuelve al final de la ronda, y los que esperan salen por orden de llegada, no por velocidad (#81) |
| Carga (`charge`) | **regla nuestra**: +10 %/casilla, tope 5, en línea recta de ≥ 3 sin unidades en medio y con el objetivo en la recta |
| `fear` del dragón óseo | **divergencia deliberada**: ataque −2 durante 2 rondas (no aura de moral) |
| Victoria | **regla nuestra**: perder la base elimina en el acto |

- Lo temporal vive en `BattleStack.effects` y se suma al leer, nunca al stack.
- **Economía**: costes de `buildinginfo.cpp` y renta de `ProfitConditions`,
  copiados de la fuente. No se ajustan cifras a ojo: se inventa solo lo
  declarado como inventado.
- **Experiencia (regla nuestra)**: quien quita PV cobra `PV quitados × nivel del
  que los recibe`, gane o pierda. Tabla en `data/experiencia.json` (Fibonacci,
  base 20). La tropa va del 1 al 5; todo héroe empieza en el 5 y sube sin tope.
  La experiencia vive en el individuo (`Troop.veterania`); el nivel se deriva.
  Las habilidades por nivel están en datos e inertes.
- **La tropa se hace héroe** (solo con agente): un veterano de nivel 5 en su base
  dispara `hero_from_troop` al empezar el turno del agente
  (`ascensoBlocker`, `ascenderVeterano`).
- **Equipo (inventado)**: arma, armadura y accesorio por individuo y por héroe;
  botín de asaltantes y ciudades neutrales con su propia corriente de azar;
  la armería vende la calidad `armeria`, que es el equipo base del héroe.
- **El mapa es una red de nodos**: regiones cerradas por barrera
  (`mountain`, `water`, `forest`, `cliff`, `wall`), pasos de una casilla entre
  ellas. Una ciudad es un nodo; un nodo se toma pisándolo. Una mina produce solo
  si su región está unida a la base. Nada del territorio se guarda: se deriva.
  **Cada nodo guarda la barrera que cruza** (`MapObject.barrera`, #145): la del
  muro que el plan le pone debajo y `buildMap` abre; un nodo sin muro debajo se
  rechaza. El procedimental escribe ahí la que más se ve alrededor, sin el agua
  si sus suelos no la admiten, y en un empate la sorteada para su pareja
  (`queCruzaElNodo`, `vestir.ts`). El escenógrafo la lee y solo deduce el eje
  (`pasoDeNodo`); el espectador la recibe con los objetos y `adaptar.ts` lanza sin ella.
  Los caminos del procedimental son **radiales** desde el centro de cada región
  y entre dos vecinas **solo un nodo lleva camino**, que elige la red
  (`crucesConCamino`) y traza `trazarCaminos`; los demás pasos se cruzan sin
  él, y los pasos van a Chebyshev ≥ 3 de todo nodo. **A una ciudad, una mina o un pueblo se
  entra por su puerta** (#188): la casilla de debajo. Son hojas del árbol (no se
  cruzan salvo que sean la única unión, más caro que pisar un monstruo); entrar
  por la puerta no cuesta, por la diagonal de delante un rodeo, de lado tres y
  por detrás cuatro, y sus costados y espalda (`espalda`) cobran dos rectos, así
  que el radio que sigue de largo pasa por delante y el objeto cuelga de él con
  un ramal de una casilla. `colocarPar` guarda la puerta de minas y pueblos (y no
  pone uno en la fila de delante de otro; si así no sale mapa, `trazarYVestir`
  repite sin vetarla a los obstáculos, que es lo que salva el 24×24); `ponerObstaculos` no parte una región
  por uno. Una ciudad (nodo) llega desde la mejor fila que toca cada región;
  la de detrás, por detrás. Los planes del agente no cambian (su `advice` lo
  pide). `informe.sendasPorObjeto` = 0. **Cada nodo entra por un eje** (`ejeDelNodo`,
  `vestir.ts`): dos vecinas opuestas (recta, diagonal con codo o, junto al borde, corta)
  protegidas hasta la segunda casilla, y los pasillos hasta lo libre van en cruz; nada se
  siembra en `n ± 2d` ni en `n + (±1, ±2)`, bajo las entradas diagonales y su reflejo (`delanteDeNodo`). El ~1 % de pasos cuya red fina no tiene vecinas
  opuestas se viste sin eje. El engorde de la frontera va casilla a casilla, y donde dos regiones quedarían
  a dos pasos engorda una (`engordarFronteras`, paso 4b), con el lado que engorda dado la vuelta
  a trechos de `TRECHO_DEL_LADO` (4) para que el borde no copie el muro fino (#169). El paso de
  cada pareja es el más cercano al medio con eje pleno (`conEjePleno`). **El mapa guarda los
  tramos** (`GameMap.caminos`, una `RedDeCaminos`) y las casillas que abaratan
  el paso salen de ellos; el procedimental guarda los que traza, con las
  horquillas en L hechas al colgar cada casilla (`ArbolDeCaminos`, nunca de un
  nodo) y la cuarta diagonal de una casilla cobrada (`cerrariaUnAspa`: el aspa
  solo queda en una ciudad donde se juntan cuatro regiones), y el plan del agente escribe casillas, cuyos tramos deriva
  `tramosDeCasillas`. `MapPlan` lleva `roads` o `tramos`, nunca los dos (lo
  dice el tipo), y `planDelAgente` es la única conversión del uno al otro. El
  agente lee casillas; el espectador recibe tramos planos (índices).
  **Las regiones definen el mapa** (#195): el dato es `REGIONES_POR_BANDO` (5: la de casa y
  4 de fuera, en parejas en espejo), elegido con la regla «menor número con mediana ≥ 8 días,
  p90 ≤ 20 y 0 sin terminar» (`tools/qa/tamanos.ts`); el lado se deriva, `ladoDelMapa` =
  ⌊√((regiones − 1) · 300)⌋ (34; de 3 a 15 regiones, 24 a 64), y su inversa es
  `regionesDelMapa`. **Minas por región (regla nuestra)**: la de casa, oro, madera y mineral;
  cada una de fuera, una rara y una básica por turno (`minasDeLasRegiones`): 2·regiones + 1
  por bando, 11 con 5 (con tres por región de fuera no cabían: objetos sin puerta 243 → 314
  de 1 000 y guardias del generador rotos).
  El agente sigue recibiendo ancho y alto, con el reparto como consejo. Un plan mide de 8 a 128 por lado
  (`LADO_MINIMO_DEL_PLAN`); el generador solo sabe de 24 a 64
  (`LADO_MINIMO_DEL_GENERADOR`, 200 de 200 semillas en cada lado) y fuera lanza antes de intentarlo (#102).
  Ninguna mina ni pueblo lleva la puerta en el borde (`colocarPar`, #189), salvo el respaldo sin puerta.
  **El nivel es de la región** (#143): `MapRegion.nivel` (0 abajo, 1 el llano, 2 la meseta), sin
  efecto en las reglas. El procedimental lo sortea por pareja en espejo justo después del suelo
  (`data/relieve.json`, inventado: ciénaga 0, nieve y lava 2, áspero 1:1, el resto 85/15; las de
  casa, al 1) y **antes** que las barreras, que salen de las que admiten sus niveles
  (`admiteLosNiveles`): el acantilado solo entre dos niveles distintos, dos niveles distintos solo
  por acantilado, montaña o agua, y bosque y muro solo a un mismo nivel. Ni el acantilado es
  obstáculo (el cargador lo rechaza en `obstaculos`). Junto a un cruce de tres regiones la barrera
  de una pareja tocaba la tercera: `desnivelEnLosCruces` (paso 6b del engorde, en espejo) pasa a
  una barrera de desnivel la casilla de bosque o muro que toca otro nivel y a montaña o agua el
  acantilado que no separa dos. **El agente declara el nivel** (#209): `regions[].nivel`
  opcional (0-2, `esNivel`), sin él la región va al 1. Si el plan declara alguno,
  `validateMapPlan` corre `problemasDeNiveles`: cada franja de barrera (`franjasDeBarrera`, la
  unidad que pinta la escena; un nodo o una ciudad la corta) admite los niveles de las regiones
  que toca, o se rechaza diciendo cuál, por dónde pasa y qué regiones; el procedimental pasa
  siempre por ahí (`test/desniveles.test.ts`). Por franja y no por pareja: en los cruces de tres
  regiones el procedimental deja trocitos de acantilado entre dos iguales (16 casillas en 1-200, 08-10-2026).
  Un plan sin ningún nivel (los de antes) no se comprueba y va todo al 1, con sus acantilados de
  roca sin cara; la prosa se lo dice al agente.
  **La muralla, solo en zonas pequeñas** (#208): una muralla (muro y sus puertas, 8-conexo) no pasa
  de `LARGO_MAXIMO_DE_MURALLA` (6) de largo ni toca dos ciudades (`murallasLargas`, paso 7 de
  `engordarFronteras`); la que sí, con puertas se parte (muro a `RADIO_DE_LA_PUERTA` de cada una)
  y si no, o si aún no vale, toma entera la barrera de sus suelos que más pesa sin el muro ni,
  salvo que todos la admitan, el agua, entre las que admiten sus niveles (`laMasPesada`, sin
  tirada). Un hueco de una casilla entre dos trozos partidos se cierra y la muralla se juzga
  entera: con sus puntas a dos en columna, sus torres obligadas se apilaban (s3, #143). La ruina de muro pegada a otro
  muro va de otra barrera. El muro cuenta para las `TIPOS_POR_MAPA` con
  `CASILLAS_DE_UNA_MURALLA` (5). En 1-200: largo máximo 34 → 6, ciudad a ciudad 119 → 0
  (`test/murallas-cortas.test.ts`).
- **Asaltantes**: grupos neutrales que patrullan regiones sin dueño y emboscan
  al pisar si les sacan `ventajaClara`. Son actores (`GameState.raiders`), no
  objetos del mapa. Un grupo se ve en cuanto se ve una casilla de su región
  (`asaltantesALaVista`, la única regla, que leen ruta, lienzo, barra, `knownMap`
  y el sello de la crónica), y la marcha se para donde ve uno que la emboscaría
  más adelante con la fuerza de ahora y que no es el que la ruta avisaba al salir
  (`vigiaDeLaMarcha`, `march_halted`). **La IA de reglas juega con niebla** (#164):
  teme los grupos que ha visto (`Player.asaltantesVistos`, que escribe `explorar`
  con `recordarAsaltantes`: se olvida uno al mirar su región sin él) y solo persigue
  los que ve ahora (`casillasPeligrosas`, `strategy.ts`). Sin el recuerdo, 32 de 300
  partidas sin terminar.
- **Base**: nace con guarnición (`data/ciudades.json`). Con el héroe del dueño
  dentro, la defiende solo él con su tropa.
- **Magia**: el gremio enseña por derivación (`townSpells`), `syncSpellbooks`
  aprende al final de cada acción, `cast` no consume el turno, `castBlocker`
  escribe el motivo.

Las cifras viven en `data/*.json` y se editan sin recompilar. Lo provisional o
inventado lo dice en su `_comment`.

## El agente

Patrón listen/respond: `heroes_listen` bloquea hasta que hay decisión, la
petición trae el formato de respuesta embebido, el agente responde una vez con
`heroes_respond`, y el veredicto de lo anterior llega pegado a la siguiente
petición — **siempre, también cuando acertó**. Un rechazo dice qué se jugó en su
lugar y qué costó.
Un `move_hero` a varios días anda lo que da el día (`pasosDeHoy`, la misma
cuenta que pinta la ruta) y, si no llega, `moveHero` escribe `march_cut` con los
pasos que faltaban; el director solo lo formatea. Solo se descarta si no da ni un
paso. Los textos libres del agente (`lineaLegible`) no admiten invisibles salvo
los que unen un emoji, ni dependen de la tabla Unicode del Node para lo sin asignar.
Una marcha que no llega entra como parcial y dice por qué: le faltaron puntos
(`march_cut`), vio un grupo que la emboscaría (`march_halted`) o la emboscaron
antes del destino (`battle_started` con `faltan`).

- Peticiones: `adventure_turn`, `battle_turn`, `map_generate`,
  `hero_from_troop`. Un test compara los `case` de `decidir` con `REQUEST_KINDS`
  en las dos direcciones; lo que se juega en su lugar es `EN_SU_LUGAR`
  (`Record<RequestKind, string>`).
- Consultas: `game_state`, `battle_state`, `map`, `creature_stats`,
  `spell_list`, `building_list`. Solo por los jugadores del agente, y **todo
  pasa por la niebla**: crónica, mapa (`serializeKnownMap`, la misma llamada para
  el turno y la tool) y batallas ajenas.
- El agente **defiende** sus batallas (`BattleTakeover`: si te la quedas, la
  cierras) y **diseña el mapa**: un plan declarativo, con el nivel de cada región
  si quiere (#209), que valida `validateMapPlan`. Si falla por cualquier motivo, se juega el procedimental y
  se le dice por qué; no hay reintento.
- La partida termina con un `game_over` explícito. `state.finished` es
  `{ winner: PlayerId | null } | null`; el tope de días es `GameState.maxDays`.
- Del contrato se exportan esquemas, no alias de tipo.

## El cliente

- **Figuras**: 8 direcciones y 6 acciones (`idle`, `ready`, `attack`, `hit`,
  `die`, `win`). Arte propio (`dN/atlas.webp`) o el Y Bot de su juego de armas
  teñido del color del bando; lo sin dueño, en gris. **Nunca se espeja.** Tablas:
  `JUEGO_DEL_CUERPO`, `JUEGO_DEL_YBOT`, `DIRECCION_DE_HOJA`. Anclas del Y Bot en
  `_poses/atlas-8d.json` (`pnpm taller derivar-poses`).
- Ritmo: `marcha.ts` (`PRISA_DE_LA_MARCHA`), compás propio por figura con hash
  del id (`compas.ts`), sombra por silueta, carga hoja a hoja con cachés LRU.
- **Niebla de quien juega** (#64): los héroes se pintan si se miran AHORA, los
  objetos como se SABEN (castillos y nodos con su último dueño visto), los grupos
  por su región; terreno y volúmenes, por `fog`. La crónica pasa por `cronicaPara`.
  El lienzo recibe héroes y objetos en `VistaMapa` (`AdventureScene` no trae héroes).
- **Mapa de aventura**: lo pinta el escenógrafo (`render/escenario/`, `componer`
  con la semilla de la partida, la misma en cliente, espectador y taller), en una
  tarea aparte del primer fotograma (`escenarioListo`). **El suelo** (texturas,
  relieve, caras de roca, agua, sendas, cubierta baja) lo pinta **un Worker**
  (`escenario/pintor-del-suelo.ts`, `OffscreenCanvas`, las imágenes como
  `ImageBitmap` que pide él) una vez por partida y **para el zoom máximo**: un
  encargo que pinta en serie el esbozo a `PX_DEL_ESBOZO` (60, ~2 s) y el bueno a
  `PX_DEL_SUELO` (120 = ⌈110 × 1,09⌉, ~5,5 s más; 83 MB los dos), cada uno en un
  Worker que se termina al contestar (uno vivo para los dos no suelta las máscaras).
  **Con dpr > 1,09 el bueno va a ⌈`TILE_MAX` × dpr⌉** (`resolucionDelSuelo`, #148) hasta
  `BYTES_DEL_SUELO_BUENO` (126 MB: 165 px en un 34×34, dpr 1,5); más allá, 165 y un aviso en
  consola. Medido sin GPU y con la máquina cargada (2026-10-08), 120/138/165 px: el bueno en
  6-7/8-10/11-12,5 s y el navegador sube 0,4-0,6/0,6-0,7/0,9-1,05 GB mientras pinta (a 220, 20 s y
  1,6 GB; y a dpr 2 una ventana de 1440×900 se pinta a densidad 1,34, que pide 147). Si el dpr sube a
  media partida se encarga otro bueno; si baja, se reduce el que hay.
  **Las fronteras entre suelos** (`fronteras.ts`, `fronterasDelSuelo`): el alfa de cada suelo a `PX_DE_LAS_FRONTERAS` (16) por casilla, el mismo en el esbozo y en el bueno: el campo del suelo leído en un punto deformado (±1,1 casillas, el serpenteo), más un ruido por suelo y la luminancia de su textura (mezcla por altura), con el ruido de la semilla de la escena; los alfas van acumulados y el arcén toma el pigmento con las mismas fronteras. Cada punto se reparte solo entre los suelos de **su nivel pintado** (#211): el serpenteo no sube lo bajo a lo alto ni baja lo alto.
  **El escalón** (`escalon.ts`, #211; auditoría 5, defectos 2 y 4): todo en máscaras puras a `PX_DEL_ESCALON` (16) por casilla, calculadas una vez por escena (`delEscalon`, las comparten el esbozo y el bueno) y ampliadas con suavizado. **El nivel pintado** (`nivelPintado`): el de su casilla, o el de la vecina más alta que más pesa, que se adelanta sobre la baja entre `ORILLA.menos` y `ORILLA.mas` (0,06-0,3) con ruido y las esquinas redondeadas; nunca baja. Lo leen las fronteras, el tono, el agua y la sombra: con el lado de casilla tal cual, donde no hay pared encima, el agua y los suelos salían en rectángulos. **El agua y el barro no suben** (`aguasDeLaEscena`): lo mojado de cada nivel de agua es nítido (sus casillas, las esquinas redondeadas `ORILLA_DEL_AGUA.esquinas`) y se cierra donde el nivel pintado (y el píxel de al lado, el que lee la ampliación) queda por encima; desde su borde el agua entra entera en `entra` (0,15), el barro es una orilla de `barro` (0,08) hacia fuera y la espuma un anillo dentro (`ESPUMA_EN_LA_ORILLA`). Con el agua desenfocada y cortada, quedaba una banda ancha de barro entre la meseta y el agua. `informe.aguaEnLoAlto` (lo mide la página del taller) = 0 en 1-40 (eran 1,53 M píxeles a 16 px; el istmo de s2 (25, 10-12) era agua). Las sendas no secan el agua: una senda sobre agua sin puente es del trazado (#210); `informe.sendaSobreElAgua` es medida, 8 en 1-40 (2026-10-08). **Un tono por nivel** (`tonoDeNivel`): negro 0,22/0,17/0,06 en −1/0/1, luz `screen` 0,08/0,11 en 2/3+. **La sombra del desnivel** (`sombraAlPie`), la única (sustituye a los cantos al este y al oeste y a la franja de la espalda de #212): por cada lado de casilla de una caída que mira hacia donde la echa la luz del contrato (`ARTE.luz`: al este y al norte), entera hasta el pie (el talud; en la espalda, `ORILLA.mas`) y fundida el contacto más `caída · ALTO_DE_NIVEL · longitudPorAltura` hacia esa luz, a 0,42 del color de sombra; ni sobre lo alto, ni por donde baja una rampa. Al sur y al oeste, nada: miran a la luz. El pintor del suelo no sube (taller a 96 px, 08-10-2026: 4,6 → 4,1 s de media en s1, 2, 5, 9 y 443; el desenfoque de lienzo a resolución plena era más caro). **Sin rejilla** (`parches.ts`, R2): cada textura del suelo, el agua y el barro va con su patrón y encima, con `source-atop`, un parche redondo por celda de una rejilla de `PASO_DEL_PARCHE` (1,5 casillas) movida al azar, de radio `RADIO_DEL_PARCHE` (1,5; entero hasta 0,85) y fundido por el borde, en orden barajado; cada uno es uno de `VARIANTES_POR_TEXTURA` (12) trozos de la textura (desplazamiento y espejo izquierda-derecha; ni giros ni espejo vertical: la luz viene de arriba y la arena tiene ondas), una estampa que se hace al pedirla y se suelta con su textura (`estamparParches`). El encaje (`encajeDe`) sale de la semilla de la escena y la clave de la textura, y las fronteras leen la altura en él (`enElEncaje`): la autocorrelación al periodo de 4 casillas bajó de 0,53-0,68 a ~0 (texturas solas, semillas 1, 7 y 13, 2026-10-08; la vigila `test/parches.test.ts`). Mientras, se ve el sucedáneo de pigmentos y luego el esbozo
  (`#app[data-escenario]`: `cargando`, `esbozado`, `pintado`). Cada fotograma
  copia, bilineal, la superficie más pequeña que no se amplía (`nivelDelSuelo`;
  por debajo de ×0,5 saca mitades del esbozo o del bueno, ~30 ms la de 165) a un fondo que mide lo mismo que
  el lienzo (`ctx.canvas`) y se copia píxel a píxel. Sin Worker —o si falla, que
  se dice, y solo lo que faltaba— lo pinta este hilo con la misma secuencia
  (`enEsteHilo`, `pintarSueloA`). Otro mapa termina el pintor del anterior y
  cierra lo pintado. **Los volúmenes**
  (árboles, picos, muros, paredes, lo que pase de `UMBRAL_DE_VOLUMEN` = 0,6
  casillas, y ciudad, pueblo, nodo y mina horneados) se pintan a cada fotograma,
  en píxeles de dispositivo, desde copias reducidas al tamaño exacto que se
  copian 1:1, de una caché LRU de 80 MB (`render/copias.ts`, la de las piezas
  también; copias por niveles reescaladas costaban 15-20 fps en 2560×1440), como mucho
  `PIXELES_NUEVOS_POR_FOTOGRAMA` (1,5 M) píxeles de copias nuevas por fotograma
  (13 módulos de picos y paredes no llegan a 120 px por casilla: pedidos en
  `docs/art/peticiones.md` §12), fundidos por profundidad con
  las figuras (`fundirPorProfundidad`): **una figura puede quedar detrás de un
  árbol**, pero no de lo horneado de su casilla (`claveDeFigura`) ni de una pieza del relieve
  que cuelga de su fila o de más al norte: el mapa no levanta lo alto, y la cara de una caída de 3
  cuelga 1,8 casillas sobre lo de debajo con el pie más abajo que los de la figura. Cada pieza
  (frontal, ladera, diagonal, bajada y peñascos de la cara) lleva `Sprite.filaAlta`, y la figura
  sube a la clave de las que tapan algo de su silueta (`delanteDeLasParedes`, `figuras.ts`, #185;
  `informe.pisablesTapadas` = 0, eran 2 281 en 1-40). El suelo de debajo sigue bajo la cara. Se recortan al
  mapa por los lados y por abajo; por arriba, solo lo que sube desde una casilla sin explorar
  (`recortadoArriba`, #152), porque encima del mapa no hay niebla que lo tape. Lo que dice quién está en una
  casilla —inicial del héroe, chapa, estandarte, bandera, icono de la mina— va en
  una pasada encima de todo y bajo la niebla; la inicial que taparía a otra figura se
  va a un lado de la cabeza (`asientoDeLaInicial`). **Excepción**: un grupo de
  asaltantes que se ve por su región con la casilla sin explorar se pinta, figura
  y chapa, encima de la niebla (`cosasDe` → `sobreLaNiebla`). Monstruos, recursos y cofres los
  pinta el juego (`seHornea`, en `escenario/horneado.ts`). **Las cordilleras** (`macizo.ts`): cada franja de
  montaña crece de la falda a la cresta por la hondura continua del punto (distancia euclídea al
  borde; la cresta en la hondura mayor de la franja, tope 2,5) en dos escalas (#204): la cresta, de
  picos medianos con collados y hombros del ruido, y **pocas cumbres** (`Macizo.cumbres`: una cada
  9 casillas, de 1 a `MAS_CUMBRES` = 4, ninguna bajo `FRANJA_SIN_CUMBRE` = 4 casillas, a 3,5 unas de
  otras, de `ALTO_DE_CUMBRE` 2,5-3 casillas según el ancho), que se ponen antes que los dardos, de
  `picos-roca` en la roca (nunca aguja), donde caben sin encogerse más de 0,78 (`cabe`; si en la
  franja no cabe ninguna, a 0,68) y con su cuerpo libre de dardos (`LIBRE_DE_CUMBRE`). De ahí
  salen el alto, el radio entre picos (`radioDePico`, 0,62 × alto: menos piezas que se solapan), la
  hoja (agujas arriba), la silueta (`siluetaDe`, que no repite el módulo de un vecino a menos de
  `VECINO_IGUAL`) y la luz (`luzDeCumbre`, falda en sombra, cresta a la luz, cumbre clara). En 1-40
  (08-10-2026): cordilleras con más de 4 picos dominantes, 39 de 201 → 4 (bandas entre dos sendas
  donde no cabe una cumbre); picos con su mismo módulo al lado, 43 % → 3 %; picos por casilla de
  montaña, 2,31 → 1,54. El bosque sigue con
  la hondura entera de `analizar`. **La cubierta de lo que se pisa** (#184): en la lava, la arena,
  la ciénaga y lo áspero (`CUBIERTA[s].comoLaBarrera`: su cubierta es de la roca o la madera de la
  barrera vecina) va rala (`CLARO_COMO_LA_BARRERA`), sin manchas ni árboles, y cada pieza se encoge
  hasta no ser más esbelta que `ESBELTEZ_DE_LO_PISABLE` (`tumbado`, en `poner`); lo alto del
  acantilado y el pie de la muralla siguen con la hoja entera. `informe.cubiertaComoLaBarrera` = 0
  (piezas más altas que su esbeltez y regiones de ≥ 9 casillas con huella > `HUELLA_DE_LO_PISABLE`). Tope de alejar:
  `topeDeAlejar`, ≤ 2 000 volúmenes a la vista y nunca bajo 40 px por casilla;
  si ni a 110 px caben (7680×4320) lo avisa en consola. **Y un presupuesto de
  píxeles según el zoom** (`presupuestoDelMapa`): al tope de alejar, el mapa no
  pinta más de `PIXELES_DEL_MAPA` (1,5 M) píxeles de dispositivo por fotograma y
  en una pantalla mayor baja la densidad (`preparar(presupuesto)`, que lo pide
  con la caja de ahora); acercando, cabe (tile/tope)² veces más, y cuando cubre
  el lienzo entero —hasta `PIXELES_AL_ACERCAR` (3 M, 2560×1440)— se pinta a
  densidad plena, con un paso de rueda de holgura para salir
  (`presupuestoConHolgura`). Es plena o nada; en 4K se queda el presupuesto
  (densidad 0,46, decisión del usuario).
  El taller (`pnpm taller escenario N`) pinta con la misma `separar`.
  **El pasillo de la senda** (`pasillo.ts`): la tabla `APARTE` (`colocar.ts`) dice por clase qué media anchura respeta —cubierta, roca y orilla 0,16 (media `ANCHO_DE_SENDA`) + `MARGEN_DE_SENDA` (0,3); masas 0,16 + `MARGEN_DE_MASA` (0,2); muro, pared y objeto, ninguna—, su mínimo al encoger y sus hojas. Se mide el rectángulo del sprite (`cajaDeSprite`) contra el trazo suavizado. **Lo que no se tapa es un solo índice** (`Obstaculos`, #151) de formas, cada una con su regla (`Forma.mide`: media anchura, y rectángulo o solo el pie): la senda y la rampa de cada bajada (`formaDeLaSenda`, la de `APARTE`), el tablero de cada puente (`formasDeLosTableros`, solo lo que va delante), el eje de cada paso (`formaDeLosPasos`, solo volúmenes) y la reserva de cada objeto (`reservaDe`, un trazo de un punto de `RADIO_DE_OBJETO`: el pie de lo que se aparta y, si es un volumen que se pinta después del objeto, su rectángulo; un árbol o un pico al sur ya no tapa la mina). La pared y la muralla miran la reserva por sus puntos (`en`); el pedregal, su propio pasillo. El dardo y `poner` hacen la misma pregunta (`entra`); `poner` encoge (`altoLibre`), prueba el módulo más estrecho y, si no, quita. Bajo la senda va un arcén del color del suelo, a 16 px por casilla, y `informe.spritesSobreSenda` = 0. **La huella** (`huella.ts`, #191): la senda es tierra de `ANCHO_DE_SENDA` (0,32), la textura `suelos/dirt.webp` entonada hasta la de las rampas de las bajadas y a 0,82 de alfa (toma el color del suelo de debajo), con dos orlas tenues y el borde roto por dos ruidos de la semilla (`IRREGULARIDAD_DE_SENDA`); se pinta como una cinta de ancho variable (`trazarCinta`, ~0,1 s a 120 px). En un tramo recto de `L` casillas el vaivén se multiplica por `min(1, 2,5/L)`, nunca bajo `VAIVEN_EN_LO_RECTO` (0,3): en lo recto de 1-40 bajó de 0,105 a 0,030 casillas.
  **Las murallas** (`muralla.ts`, #183, #197, #207): cada franja de muro lleva la línea de su frontera, no su esqueleto (`trazaDeMuralla`): tiradas rectas de mínimo coste (una esquina vale `ESQUINA` = 3 casillas, por el medio de la franja y, donde cambia de nivel, por lo alto: `AL_PIE_DE_LA_CARA`) que unen, como un árbol, sus puertas (de través a su paso) y sus **apoyos**: el grupo de casillas que toca una misma cosa de fuera —otra barrera o su nodo, el borde, la huella de una ciudad o un pueblo, a la que se llega por debajo— y dos lados pisables (`Alrededor`, `alrededorDeMurallas`, que deriva el lado de cada casilla del terreno). Las puertas de una franja son las de sus 8 vecinas por coordenadas, no por índice (con el índice, la puerta de la columna 0 era de la franja del borde contrario: la fuga de s443). Un paso en diagonal nunca pasa entre dos casillas pisables, que son del mismo lado (s730). Donde la línea deja que un lado llegue a otro (`fugasDe`), se añade el sitio que más fugas cierra (el apoyo que toca a los dos, uno que la fuga roza, o lo más estrecho entre ellos) y, si por lo alto no cierra, se traza en llano; lo que cuelga sin llegar a nada se poda (`sinEspolones`). Una franja que no separa dos lados (la ruina) va de lo que toca a su punta más lejana. Lo que no pisa la línea es escombro: ni espolones ni un segundo muro. El tramo recto se apoya por el medio del paso; el diagonal, por su punta baja en la casilla de abajo. Torre obligada en cada junta, también a 45° (`esquinasDe`: sin ella la junta se ve abierta) y en cada punta de norte a sur (sin ella el tramo es un raíl), `torresObligadas`; en las demás puntas y en lo recto a `ENTRE_TORRES` (3); nunca junto a una puerta ni bajo una ciudad. **Nunca dos torres apiladas** (`seApilan`): a una casilla o menos, ni en la misma columna a dos o menos, que la cámara pone una encima de otra. La punta de otro eje o la casilla sola que se apilaría con una obligada, de su línea o de otra franja, se queda sin torre; la línea no dobla a menos de eso de su esquina anterior ni de una obligada ya trazada (de norte a sur, tres), salvo junto a una puerta o bajo una ciudad, y si así no llega o no cierra, dobla (`seguidas`). Si quedan pegadas, prueba a empezar el árbol por otro terminal. Un tocón de norte a sur de dos casillas o menos hasta la siguiente torre se quita (`sinTocones`); la ruina que es solo eso queda en una torre, donde cabe. La línea no dobla donde la torre no cabe de ninguna manera (`esquinaCabe`) y paga por doblar donde no cabe entera. Ningún tramo se salta por una reserva (`meterEnLaMuralla`): el que llega a una puerta, o cae en la reserva de otro objeto, se pinta en su sitio y se ordena justo antes que él (`ordenadoEn`), que queda encima. La puerta va centrada en su nodo (su ancla derivada es el pie de una torre). De norte a sur, el tramo es de lado (`muro-ns-1`/`-2`, 1,6 de alto por el medio) y la puerta (`nodo-puerta-hondo`) va a 2,6 de alto por el pie de su arco (`PUERTA_NORTE_SUR`); la ruina sigue con el `profundidad` de su hoja. El resto de la franja es escombro (`rocas-caidas`), nunca la cubierta del suelo vecino. `informe.murallasPartidas` = 0 en 1-40, contado sobre lo PINTADO (`informe.muralla`): fugas (un lado que llega a otro por la franja sin cruzar lo pintado, en una rejilla de 4×4 por casilla, el tramo de media casilla a cada lado y de cabo seco), puertas sin tramo hacia un lado de su paso con muro, y trozos de más de una línea (lo que llega a una ciudad se une por ella). `informe.murallaIncoherente` = 0 en 1-40: espolones (puntas de una franja que separa dos lados sin llegar a nada), juntas de dos ejes sin torre y puntas de norte a sur sin torre (`puntasSinTorre`). `informe.torresApiladas` = 0 en 1-40 (`apiladas`); en 1-1000 quedan 13, en 12 semillas, todas de dos juntas que la franja obliga (un escalón de una fila) (2026-10-08; eran 3 138). En 1-1000, `murallasPartidas` = 0 y `murallaIncoherente` = 0. Ninguna senda entra en una casilla de muro salvo por su puerta (como mucho 0,06 de vaivén). **La torre no tapa la senda** (#193): la que la pisa (`sendaParaLaMuralla`, la senda pintada sin arcén, a `SEMIANCHO_DE_LA_HUELLA`: su borde más abierto) no se pone y va la siguiente candidata (`torresDe(…, cabe)`); la de una casilla sin tramos o de una esquina, que va siempre, se encoge hasta `TORRE_MAS_BAJA` (0,45) y, si ni así cabe, se corre dentro de su casilla (`CORRIMIENTOS_DE_TORRE`, `torreQueCabe`). El lienzo no se aparta: lo alto del último tramo puede quedar delante de la senda que rodea su punta. `informe.murallaSobreSenda` = 0 en 1-40 (`murallaSobreLaSenda`: torres que la tapan y tramos que la cruzan fuera de una puerta).
  **Los hitos** (`nodos.ts`): todo nodo de acantilado, de bosque y de montaña lleva uno (`HITOS`, por su id), sin tope, porque un nodo neutral no lleva bandera (354 en 1-40: 119 de acantilado, a 5 casillas o más unos de otros, 114 de bosque, que acercan cuatro pares a 4,1-4,5, y 121 de montaña: son nodos distintos y cada uno se toma). **El paso de bosque y el de montaña no llevan pieza** (#196, #203): el portillo de abetos verdes desentonaba en la nieve y en los demás bosques, y la mitad de esos pasos separan dos suelos con dos hojas de árboles; la garganta de `nodo-paso-montana` iba de norte a sur y solo 2 de 23 nodos de montaña se cruzan así (el camino entraba bajo la roca por un costado, y en la nieve salía parda). Los abre la propia masa por su eje, su reserva es de `RADIO_DEL_PASO_SIN_PIEZA` (0,5, no la de 0,95 del nodo: abría un claro redondo; `radioDeLaReserva`), y lo leen la trocha y el hito. `informe.pasosAtravesados` = 0 (la pieza del nodo, si no es hito, no pisa su eje; eran 121 en 1-40). Sigue en `BARRERAS_CON_PASO_A_LA_VISTA`. La tablilla apunta por el eje del paso (`tablillaDelEje`: al fondo antes que a la cámara; en el este-oeste, por el sitio), una pieza por rumbo y nunca espejada; el miliario va entonado (`TONO_DE_HITO`).
  **Los pasos se ven** (`pasosALaVista`, `ejeDelPaso` en `nodos.ts`, #173): cada nodo de montaña, bosque o muro, con camino o sin él, abre un pasillo de `SEMIANCHO_DEL_PASO` (0,36, el de las masas) a lo largo de su eje, de la segunda casilla de una entrada a la de la opuesta (el orden de `ejeDelNodo`). De él se apartan solo los volúmenes: la masa se encoge o se quita, y lo bajo se queda a `UMBRAL_DE_VOLUMEN` como mucho, para no abrir una franja pelada. `informe.pasosTapados` = 0. **La trocha** (`trochasDeLosPasos`, #190): cada nodo de bosque, montaña o acantilado (`BARRERAS_CON_TROCHA`) sin camino lleva por su eje una trocha de tierra de `ANCHO_DE_TROCHA` (0,15), translúcida y afinada en las puntas (`Escena.trochas`, `huella.ts`). Es solo escena: no es camino ni abarata el paso (#149). De su arcén (`SEMIANCHO_DE_LA_TROCHA`, 0,175) se aparta todo lo que se aparta del camino, también lo bajo (los abetos de 0,6 de la nieve la enterraban): `formaDeLasTrochas`, `informe.trochasTapadas` = 0.
  **El relieve por celdas** (R4, `celdas.ts`; `docs/agents/2026-10-07-relieve-esquinas/`): el nivel por casilla sale de `relieve()` (el de su región; ver «Los acantilados») y las paredes, de cada vértice: por umbral, un caso de 4 bits (`celdas`; la silla, «el alto une»; el mismo tipo en dos grupos seguidos es una pared). Cada pared va de junta a junta, en el medio de un lado de casilla, y la clase de la junta la fija el lado (`JUNTAS`: en la S el pie cae a plomo, en la E u O con el talud de `TALUD_DE_LADERA`). `caidas` las encadena: las S en `Cara` de media casilla en media casilla (`paredes-*` libres, que no salen de su tramo más de `SALE_DE_SU_TRAMO`), las E y O en laderas, y cada diagonal (`SE`/`SO`, `convexa`/`concava`) lleva su pieza `diagonales-<material>-<se|so>-<caída>` por sus dos filos (`spriteDeDiagonal`; un cuarto de círculo en la guía, `tools/taller/diagonales.ts`). Las de espaldas, el reborde y sus peñascos. La pared que cruza un puente no lleva pieza (`celdasBajoLosPuentes`). **La pared nunca se corta ni se aparta de la senda**: donde un camino baja hacia la cámara o de lado va una **bajada** encima (R5, `bajadasDe`: `arriba` donde la senda pintada cruza el filo; `bajadas-<material>-<caída>/<s|se|so|e|o>`; la rampa sigue a la senda en pantalla, `rampaDe`; el rumbo es el de lo pintado, el del tramo o uno a 45°, `rumboPintado`; y la senda pintada pasa por la rampa, de su filo a su pie, y vuelve a su trazo con un enlace a cada lado, sin mover sus extremos, `sendasPorLasRampas`, #192), con la clave detrás de toda pared que pinta sobre su camino y delante de nada horneado de la casilla a la que baja: la que baja a una ciudad, pueblo, mina o nodo va justo detrás de él (`llegaA`), y lo que se pinta delante del nodo puede tapar su llegada. Caída 3 o más: la pieza de 2 estirada en alto (`Sprite.ancho`); sus dos filos no caen a la vez y van centrados, y el guardia acepta ese desvío y no otro (`filosEnSuSitio`). El arte está entero (todos los materiales, caída 1 y 2, §23); sin él, un marcador (`COLOR_DE_DIAGONAL`, `COLOR_DE_BAJADA`). Las guías de las diagonales llevan el labio roto en trozos (en el suroeste, oscuro: `LABIO_EN_LUZ`) y sin canal en las cóncavas, y su referencia de material es la ladera vecina (`laderas-<material>-<este|oeste>-<caída>`), no la frontal; el suroeste lleva además su hermana del sureste. Las diagonales y bajadas de basalto van con el tono de su ladera (`TONO`, §26). La puerta es `ponerPared` (la reserva de un objeto y los tableros; lo que rechaza queda como razón declarada, `vaciaPorque`). **El nodo entre dos niveles sin camino es una rampa** (#143): su bajada va por su eje (`tramosDeLasRampas`), con la trocha de senda y `deUnNodo` (no hay senda pintada que la siga). Una cordillera sin cumbre (no cupo) con más de `MAS_CUMBRES` picos a 0,8 del mayor sube el más alto que pueda, sin azar (`unoQueDomine`). `informe.celdasMalCubiertas`, `bajadasSinPieza`, `bajadasTapadas`, `bajadasSobreNodo`, `rampasDesviadas` y `nodosSinRampa` = 0. Como la pared no se aparta, es el trazado del núcleo el que se aparta de su pie (#189): `recargosDelTrazado` (`vestir.ts`) cobra 3 rectos de más por un acantilado al N, NO o NE de la casilla, 1 por una montaña o un bosque y 2 por el borde del mapa (una Y junto a una hoja cobra también el mayor de sus esquinas). Y la senda pintada se aparta, dentro de su casilla, de lo que la tapa (#206, `apartarDeLoQueTapa`, `sendas.ts`): por eso las paredes (laderas, diagonales y frontales; las frontales con su propio azar) se ponen **antes** que la senda y su pedregal después; cada punto bajo una (`loQueTapa`, la misma regla que el contador) se corre hasta `APARTE_DE_LO_QUE_TAPA` (0,35) al lado libre, en rampas de una casilla, sin mover sus extremos, ni lo que va junto a la rampa de una bajada, ni pasar a una casilla de barrera o de edificio, ni arrimarse más de lo que estaba a un acantilado, un muro o una cordillera a menos de media casilla (`LEJOS_DE_LA_BARRERA`: la roca de lo alto de #205, la línea de la muralla y las cumbres de #204); dos pasadas, que miran la senda de partida. `informe.sendaBajoElRelieve` (tramos de ≥ `SENDA_CORTADA` con la huella entera bajo la silueta de una frontal, ladera o diagonal) no es 0: techo de media 5 por mapa (4,5 en 1-40; 6,3 sin apartarla, con los niveles del mapa de #143; 9,1 antes; 12,5 antes de #189).
  **Las caras** (`caras.ts`, #159): la cara de un acantilado no es la banda entera: por columna, cada `PASO_DE_CARA` (0,05), se pinta el tramo seguido que tapan sus paredes, de lo alto de su silueta (`Modulo.perfil`, 32 franjas que deriva `pnpm taller catalogo-escena` con `perfilDeModulo`) a lo bajo de su caja, con juntas de hasta 0,15 (`pintadaDeCara`). Donde no hay pared, se ve el suelo de abajo. El pedregal de una cara sin pared ni ladera a 0,3 toma el tono de su suelo (`tonoDelPedregalSuelto`, #170). `informe.carasLisas` = 0.
  **Las laderas** (§20): cada cadena E u O lleva `laderas-<material>-<lado>-<caída>` (nunca espejada; caída > 3 usa la de 3), corrida media fila, con `inicio` al norte y `fin` al sur donde remata —sigue de espaldas o con una caída menor; en el borde del mapa no remata, el desnivel sigue fuera del marco (#212)— y `medio`/`largo` sin repetir el vecino. La `esquina` de §20 ya no entra (dobla la diagonal). Cada módulo trae sus `JuntasDeLadera`, registradas sobre la guía por `pnpm taller derivar-relieve` (también las de las diagonales y las bajadas) y comprobadas al cargar el catálogo (`catalogoValidado`); `colocarLadera` pone el filo en `bordeDeLadera` y el pie en `pieDeLadera`, sin correrse ni encogerse; lo que no entra se prueba con un `medio`. Un barranco de una casilla no lleva laderas (`sinBarrancos`): van los peñascos del canto. `informe.laderasEnfrentadas` = 0.
  **Los acantilados y el relieve** (`relieve`, #143): el nivel es del mapa y la escena lo aplica sin inventar nada. Lo que se pisa va al de su región; un nodo, al de sus regiones y, entre dos niveles, el paso sin camino al alto: es un hueco en el borde de la meseta y su rampa baja de él (al bajo era un pozo con paredes a los lados, s443 (25,10)); el nodo con camino y la ciudad, al bajo (al alto, las rampas de camino dejaban lo alto del acantilado sin roca); cada franja 8-conexa de barrera, al más alto de las regiones que toca: **el acantilado es el borde de la meseta**, a su nivel y cubierto de roca, y la cara cae a su pie del lado bajo; el agua de frontera (toca dos regiones) va encajada un nivel bajo su orilla más baja, y la de dentro de una región, a ras (una charca sin caras). Fuera las crestas por encima de las dos orillas, los cañones entre dos llanos, las mesas, la escalera que subía lo que se pisa y el «+1 a ras» (`acantiladosARas`, #174, se retira con ellos; eran 98 de 258 franjas de acantilado entre dos llanos y 250 mesas en 1-40). `informe.nivelFueraDeSuRegion` y `desnivelesSinBarrera` (dos casillas vecinas que se pisan a distinto nivel sin ser la rampa de un nodo) = 0. **El borde de la meseta, entero** (#212, `bordes.ts`): la espalda (el reborde al norte, que la cámara no ve) de **toda** meseta, no solo del acantilado, lleva una hilera de peñascos de la roca de lo alto y la sombra del desnivel (abajo, #211); donde no cabe ni el peñasco más bajo (una senda por el canto, la reserva de un objeto) queda como razón declarada; `informe.espaldasSinReborde` = 0 (eran 795 en 1-40). Las mesas de arenisca (`esMesa`: más anchas que `ANCHO_DE_MESA` = 1,3 veces su alto) son del acantilado y la cordillera de arena va con agujas (`informe.mesasEnLaCordillera` = 0, eran 1 444). La ladera sigue leyéndose como cresta por su dibujo: el arte está pedido (`docs/art/peticiones.md` §34). **Lo alto lleva roca** (#205) **de su cara** (#212, `materialDeLaCima`: la de la casilla más cercana de su franja que cae a la vista; con la de su suelo, s57 llevaba picos grises sobre un cantil de arenisca; `informe.cimaDeOtroMaterial` = 0, eran 1 431 en 1-40): cada casilla de acantilado, un pico de esa roca de `ALTO_DE_LO_ALTO` (0,4) o más, y dos en el borde de una meseta y tres dentro (`cimaDeRoca`, `picosDeLaCima`), donde quepan sin pisar senda, paso, trocha ni reserva; en lo alto de la arena y la lava (`comoLaBarrera`) la cubierta del relleno se cambia por roca (`rocaEnLoAlto`). Todo eso, con su propia corriente de azar (`azarDeLoAlto`): con la de siempre movía las cordilleras que se visten después. `informe.acantiladosLisos` (casillas de acantilado sin roca ni masa de 0,4, fuera de la huella de un objeto) = 0 salvo 2 en 1-40, entre dos sendas (eran 1 167 de 4 016). **El agua se lee al alejar** (#205): más clara y azul (`FILTRO_DEL_AGUA`, `pintar.ts`), la ciénaga algo más oscura y su niebla a 0,1.
  **Los puentes** (`puentes.ts`): `analizar` decide qué nodos llevan puente (`Analisis.puentes`: los de barrera `water` del mapa; `pasos`, esa barrera y el eje, sobre el terreno del mapa) y su casilla es agua en la escena (`Analisis.terreno`). La pieza `puente-<piedra|troncos>-<eje>[-sube]` sale de las orillas que une (`puenteDe`), de piedra si lleva camino; los quebrados —los planes del agente y el ~1 % del procedimental sin eje— se asientan con `asentar` (escala 0,7-1,15, el medio del tablero como se ve en la casilla del nodo). Se apoya por el centro del tablero con las medidas de su JSON (`pxPorCasilla`, `alturaDelTablero`, `largoDelTablero`, `pnpm taller derivar-puentes`). La senda acaba en sus estribos (`tramosHastaLosEstribos`) y llega por tierra (`Escena.vados`, `informe.sendasDeEstriboEnAgua` = 0). La pared que cruza la línea del puente no lleva pieza (`celdasBajoLosPuentes`). **Qué tapa un tablero** es una regla, la del pintor (`vaDelante`: `esVolumen` y `ordenDeVolumenes` de `separar`), en el pasillo de lo que se aparta y en `ponerPared`; la cara se pinta solo bajo la silueta de su pared (`CaraDeEscena.pintada`, `caras.ts`). `informe.puentesTapados` = 0, contado desde el orden del pintor. La marca del dueño cuelga de `Escenario.asientoDeObjeto`, siempre un punto, y la bandera se planta en el tablero (`Puente.mastil`); quien pisa un puente se pinta en él (`pisada`). Un clic sobre el tablero va al nodo (`puenteBajo`) solo si debajo hay agua o la casilla del nodo: la tierra de una orilla manda.
- **Castillo**: solares fijos con cadenas derivadas del catálogo (`townPlots`);
  las moradas son de cada facción.
- **Arena** (`pnpm arena`): cifras que no pasan por el catálogo, validadas por
  `validarUnidadDeArena`, guardadas en `data/borradores/unidades.json`, que el
  juego no lee. Velocidad en casillas (`escalonDeCasillas`). `SesionDeArena`
  vive en `session.ts`. Una unidad con el arte a medias (el taller generándola)
  se lista como incompleta con su motivo y no se monta —nunca el Y Bot en su
  lugar—; `vite build` lo avisa y no falla (`arteEnOchoDirecciones`, #140).

## Generación de assets

```bash
pnpm gen                              # simula: qué falta y cuánto costaría
pnpm gen -- all --go --budget 4       # genera de verdad (--budget = gasto ACUMULADO)
```

Sin `--go` no se gasta nada; caché por hash del payload; gasto en
`tools/gen/spend.json`. Texturas como material a 90°, liso, sin mencionar agua.
Atlas de poses: ≤ 10 celdas, rejilla cuadrada, segunda referencia = identidad;
`cutout.ts` recorta por relleno desde el borde. Las criaturas y sus poses de
`tools/gen/animate.ts` se retiraron (#139): las figuras son del taller.

## El equipo de agentes

Trabajo sustancial: skill **`/feature`**, ciclo **crítico → arquitecto →
ingeniero → QA** (`.claude/agents/`), comunicándose por `docs/agents/<tarea>/`.
Para un cambio de una línea, hazlo y ya. Los parches de
`docs/agents/*/commits/` no se commitean.

### La máquina es compartida: nada de matar por patrón

**Ningún `pkill`, `killall` ni `kill` por nombre**: hay otras sesiones de otros
proyectos en esta máquina. Lo que se arranca se apunta y se mata por su grupo:

```bash
set -m                       # en SU PROPIA LÍNEA: `set -m && cmd &` desarma la receta
pnpm dev > /tmp/dev.log 2>&1 &
DEV=$!
set +m
[ "$(ps -o pgid= -p "$DEV" | tr -d ' ')" = "$DEV" ] && kill -TERM -"$DEV" || kill -TERM "$DEV"
ss -ltnp 2>/dev/null | grep ':3100' || echo "libre"   # comprobar SIEMPRE que murió
```

`setsid pnpm dev &` no vale (`$!` es el `setsid` muerto). El dueño de un proceso
se identifica por puerto (`ss -ltnp`) y `readlink /proc/<pid>/cwd`, no por `ps`.
Lo lanzado con `run_in_background` se para con su id de tarea. **Un puerto
ocupado por algo ajeno no se libera: se reporta.**

### Control de calidad

| Comprobación | Tarda | Cuándo |
|---|---|---|
| `pnpm verify` | ~17 s | siempre |
| `pnpm verify:lento` | ~75 s | al cerrar un ciclo, si tocas el escenógrafo, la generación del mapa o el arte de `assets/`; corre en CI |
| El navegador / el espectador | minutos | si el cambio se ve, o tocas `html.ts`, `espectador/` o el canal |
| `pnpm qa` | ~3 s | si tocas `src/server/` o el contrato |
| `pnpm capturas` | ~245 s | si el cambio se ve; sale 1 con un error en consola |
| `barrido-semillas.ts` | ~1 s | si tocas la IA o la economía: una sola semilla sin terminar es regresión |
| `pnpm banco` | ~5 s | si tocas el núcleo sin querer cambiar el juego |
| `npx tsx tools/qa/rectitud.ts` | ~20 s | si tocas `generate.ts` o `vestir.ts`: tramos rectos en 1-1000 (≥ 8 ≤ 140, caras ≥ 8 ≤ 115, mapas con tramo ≥ 10 ≤ 8) |
| `enfrentamiento.ts` | ~2 s | si cambias cómo decide la IA de batalla: entra solo con el intervalo entero > 50 % en 5 000 parejas |

- **Bucle rápido y orden lenta** (`test/lento.ts`, #167): un guardia que recorre
  muchas semillas o todo el arte corre en `verify` con una muestra que muerde
  (las semillas donde pasa lo que vigila, una imagen de cada forma de derivar)
  y en `verify:lento` (`HEROES_LENTO=1`) con todo; las medidas sobre muchas
  semillas, con `itLento`. Antes de mover un test, se abarata. Un JSON de arte
  retocado a mano fuera de la muestra lo caza solo la lenta; una imagen
  sustituida sin rederivar, las dos (sha256).
- **`pnpm banco`**: si el hash cambia a propósito, se re-ancla en
  `tools/qa/banco.ts` y se juzga **la forma del diff** (qué semillas cambian y
  cuál es el primer hecho distinto), no el hash.
- Medidas de equilibrio y duración con **100 semillas** mientras sigan los
  cambios grandes. Una cifra medida se escribe con su fecha.
- Nada de puntuación de deuda ni pruebas de mutación.

## Decisiones tomadas

- **MCP antes que API key** (el usuario tiene Claude Max).
- **`FAL_KEY` nunca llega al navegador**: la generación son scripts CLI.
- **Nada del HoMM2 original**: se reimplementan las reglas; el arte se genera.
- **Facciones del juego**: caballeros y nigromantes (la arena tiene cinco).
- **Una cita a la fuente se extrae, no se teclea**: una cita falsa es peor que
  una cifra declaradamente inventada.
