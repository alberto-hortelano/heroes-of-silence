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
  `seen`. `game_over` es el último hecho por regla del núcleo.
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
| Caminos de un plan al mapa | `caminosDelPlan` |
| Carga | `cargaDesde` (cuándo), `cargaEfectiva` (tope), `casillasDeCarga` (qué se enseña) |
| Turno de batalla | `BattleState.turno` (`n`, ordinal); `mismoTurno`; viaja como `turnId` |
| Tope de jugadas | `MAX_JUGADAS` |
| Desenlace y causa del final (barra, crónica y nota del agente) | `finDePartida`, `desenlaceDe` (`state/desenlace.ts`) |
| Ventaja para atacar/emboscar | `ventajaClara` (`ai/fuerza.ts`) |
| Lo que se anda hoy (marcha y ruta) | `pasosDeHoy` (`state/game.ts`) |
| Qué grupo de asaltantes se ve | `asaltantesALaVista` (lista con la marca `AsaltantesALaVista`; sin niebla, `todosALaVista`); para un grupo suelto, `grupoALaVistaDesde` |
| Por qué una marcha no llegó (veredicto del agente) | `paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`) |
| Material de una cara (pared, ladera, pedregal) | `materialDeCara` (`render/escenario/colocar.ts`) |

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
| Prisa/Lentitud | duran el poder mágico del lanzador, en rondas |
| No-muertos | inmunes a la mala suerte; moral 0 |
| Dos efectos del mismo origen | refresca la duración (la mayor), no se acumula |
| Turno de una unidad | **regla nuestra**: se mueve en tramos hasta gastar su velocidad; atacar lo cierra; tras moverse no dispara, ni defiende, ni espera |
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
  Los caminos del procedimental son **radiales** desde el centro de cada región
  y entre dos vecinas **solo un nodo lleva camino**, que elige la red
  (`crucesConCamino`) y traza `trazarCaminos`; los demás pasos se cruzan sin
  él, y los pasos van a Chebyshev ≥ 3 de todo nodo. **Cada nodo entra por un eje** (`ejeDelNodo`,
  `vestir.ts`): dos vecinas opuestas (recta, diagonal con codo o, junto al borde, corta)
  protegidas hasta la segunda casilla, y los pasillos hasta lo libre van en cruz; nada se
  siembra en `n ± 2d` (`delanteDeNodo`). El ~1 % de pasos cuya red fina no tiene vecinas
  opuestas se viste sin eje. **El mapa guarda los
  tramos** (`GameMap.caminos`, una `RedDeCaminos`) y las casillas que abaratan
  el paso salen de ellos; el procedimental guarda los que traza, con las
  horquillas en L hechas al colgar cada casilla (`ArbolDeCaminos`, nunca de un
  nodo), y el plan del agente escribe casillas, cuyos tramos deriva
  `tramosDeCasillas`. `MapPlan` lleva `roads` o `tramos`, nunca los dos (lo
  dice el tipo), y `planDelAgente` es la única conversión del uno al otro. El
  agente lee casillas; el espectador recibe tramos planos (índices).
  Lado del mapa: `LADO_DEL_MAPA` (34), elegido con la regla «menor lado con
  mediana ≥ 8 días, p90 ≤ 20 y 0 sin terminar».
- **Asaltantes**: grupos neutrales que patrullan regiones sin dueño y emboscan
  al pisar si les sacan `ventajaClara`. Son actores (`GameState.raiders`), no
  objetos del mapa. Un grupo se ve en cuanto se ve una casilla de su región
  (`asaltantesALaVista`, la única regla, que leen ruta, lienzo, barra, `knownMap`
  y el sello de la crónica), y la marcha se para donde ve uno que la emboscaría
  más adelante con la fuerza de ahora y que no es el que la ruta avisaba al salir
  (`vigiaDeLaMarcha`, `march_halted`). **Ventaja declarada de la IA de reglas**:
  mira `state.raiders` sin niebla (`casillasPeligrosas`, `strategy.ts`); si debe
  tener niebla es de #115 (#164).
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
  cierras) y **diseña el mapa**: un plan declarativo que valida
  `validateMapPlan`. Si falla por cualquier motivo, se juega el procedimental y
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
- **Mapa de aventura**: lo pinta el escenógrafo (`render/escenario/`, `componer`
  con la semilla de la partida, la misma en cliente, espectador y taller), en una
  tarea aparte del primer fotograma (`escenarioListo`). **El suelo** (texturas,
  relieve, caras de roca, agua, sendas, cubierta baja) lo pinta **un Worker**
  (`escenario/pintor-del-suelo.ts`, `OffscreenCanvas`, las imágenes como
  `ImageBitmap` que pide él) una vez por partida y **para el zoom máximo**: un
  encargo que pinta en serie el esbozo a `PX_DEL_ESBOZO` (60, ~2 s) y el bueno a
  `PX_DEL_SUELO` (120 = ⌈110 × 1,09⌉, ~5,5 s más; 83 MB los dos), cada uno en un
  Worker que se termina al contestar (uno vivo para los dos no suelta las máscaras).
  **Las fronteras entre suelos** (`fronteras.ts`, `fronterasDelSuelo`): el alfa de cada suelo a `PX_DE_LAS_FRONTERAS` (16) por casilla, el mismo en el esbozo y en el bueno: el campo del suelo leído en un punto deformado (±1,1 casillas, el serpenteo), más un ruido por suelo y la luminancia de su textura (mezcla por altura), con el ruido de la semilla de la escena; los alfas van acumulados y el arcén toma el pigmento con las mismas fronteras. Mientras, se ve el sucedáneo de pigmentos y luego el esbozo
  (`#app[data-escenario]`: `cargando`, `esbozado`, `pintado`). Cada fotograma
  copia, bilineal, la superficie más pequeña que no se amplía (`nivelDelSuelo`;
  por debajo de ×0,5 saca mitades del esbozo) a un fondo que mide lo mismo que
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
  árbol**, pero no de lo horneado de su casilla (`claveDeFigura`). Se recortan al
  mapa por los lados y por abajo; por arriba, solo lo que sube desde una casilla sin explorar
  (`recortadoArriba`, #152), porque encima del mapa no hay niebla que lo tape. Lo que dice quién está en una
  casilla —inicial del héroe, chapa, estandarte, bandera, icono de la mina— va en
  una pasada encima de todo y bajo la niebla. **Excepción**: un grupo de
  asaltantes que se ve por su región con la casilla sin explorar se pinta, figura
  y chapa, encima de la niebla (`cosasDe` → `sobreLaNiebla`). Monstruos, recursos y cofres los
  pinta el juego (`seHornea`, en `escenario/horneado.ts`). **Las cordilleras** (`macizo.ts`): cada franja de
  montaña crece de la falda a la cresta por la hondura continua del punto (distancia euclídea al
  borde; la cresta en la hondura mayor de la franja, tope 2,5), con un ruido suave que hace
  cumbres y collados; de ahí salen el alto, el radio entre picos (`radioDePico`), la hoja (agujas
  arriba), la silueta (`siluetaDe`) y la luz (`luzDeCumbre`, falda en sombra). El bosque sigue con
  la hondura entera de `analizar`. Tope de alejar:
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
  **El pasillo de la senda** (`pasillo.ts`): la tabla `APARTE` (`colocar.ts`) dice por clase qué media anchura respeta —cubierta, roca y orilla 0,1 + `MARGEN_DE_SENDA` (0,3); masas 0,1 + `MARGEN_DE_MASA` (0,2); muro, pared y objeto, ninguna—, su mínimo al encoger y sus hojas. Se mide el rectángulo del sprite (`cajaDeSprite`) contra el trazo suavizado, con un solo índice. El dardo y `poner` hacen la misma pregunta (`entra`); `poner` encoge (`altoLibre`), prueba el módulo más estrecho y, si no, quita. Bajo la senda va un arcén del color del suelo, a 16 px por casilla, y `informe.spritesSobreSenda` = 0.
  **Las rampas** (`rampas`, en `relieve.ts`: `porCara`, cada rampa con su tajo y qué bordes caen dentro, y `junto`; `Escena.relieve.caras` las lleva en su cara): donde una senda baja por una cara al menos `RAMPA_MINIMA` (0,25), un tajo de su ancho más el arcén (`HOLGURA_DE_RAMPA`) que `pintarSuelo` deja fuera de la cara con un recorte `evenodd`; lo que solo roza una esquina no abre tajo. **La pared nunca se corta** (ningún sprite de pared con `recorte`, decisión del usuario): `ponerPared` la aparta del pasillo de `junto` —la senda que baja y toda la que pasa a `ENTORNO_DE_RAMPA` (1,5) de lo que baja, de esa cara o de otra, menos la que ya tapa una cara sin tajo lejos de todo tajo— a 0,3 (`SEMIANCHO_DE_PARED`, `SOLAPE` = 0,1 sobre el tajo): la corre hasta una casilla (`DESVIOS`), la encoge hasta el alto de su cara y luego hasta la mitad, prueba el módulo más estrecho y, si nada cabe, la quita y deja un pedregal de `rocas-caidas`. Cada borde de dentro de un tajo lleva el módulo más estrecho pegado a la senda y un remate de peñascos por el canto; peñascos y pedregal son clase `pared` y pasan por la misma puerta. `informe.paredesSobreRampa` = 0.
  **Las caras** (`caras.ts`, #159): la cara de un acantilado no es la banda entera: por columna, cada `PASO_DE_CARA` (0,05), se pinta el tramo seguido que tapan sus paredes, de lo alto de su silueta (`Modulo.perfil`, 32 franjas que deriva `pnpm taller catalogo-escena` con `perfilDeModulo`) a lo bajo de su caja, con juntas de hasta 0,15 (`pintadaDeCara`). Donde no hay pared, se ve el suelo de abajo. El pedregal de una cara sin pared ni ladera a 0,3 toma el tono de su suelo (`tonoDelPedregalSuelto`, #170). `informe.carasLisas` = 0.
  **Las laderas** (`laderas` y `cantosDe`, en `relieve.ts`; `esquinas` por índice de cara): cada caída al este o al oeste lleva una cadena de `laderas-<material>-<lado>-<caída>` (nunca espejada; caída > 3 usa la de 3), con `inicio` al norte, `medio`/`largo` sin repetir el vecino y `esquina` al sur si acaba en una cara de su caída y material o, si no, `fin`; en un escalón rematan las puntas de la mayor. Cada módulo trae sus `JuntasDeLadera` (`filo`, `pie`, `largo`, `papel`), registradas sobre la guía por `pnpm taller derivar-laderas` y comprobadas al cargar el catálogo (`catalogoValidado`); `colocarLadera` pone el filo en `bordeDeLadera` y el pie en `pieDeLadera`. Pasan por `ponerPared` con su propio módulo, sin correrse ni encogerse; lo que no entra se prueba con un `medio`. La frontal para según `topesDeCara` (`tramoDeFrontal`). Lo que baja por una ladera entra en `juntoDeLadera` (`ENTORNO_DE_LADERA`, 0,5) sin abrir tajo, y de él solo se apartan las laderas (`ponerLadera`); la frontal se aparta solo de `junto`. Un barranco de una casilla (casilla baja entre dos altas en la misma fila) no lleva laderas (`sinBarrancos`), y donde no queda ladera van los peñascos del canto. `informe.laderasMalCubiertas` = 0 (cada casilla de ladera lleva una ladera, los peñascos del canto o nada donde no cabía) y `informe.laderasEnfrentadas` = 0.
  **Los puentes** (`puentes.ts`): `analizar` decide qué nodos llevan puente (`Analisis.puentes`; `pasos`, lo que cruza cada nodo, sobre el terreno del mapa) y su casilla es agua en la escena (`Analisis.terreno`). La pieza `puente-<piedra|troncos>-<eje>[-sube]` sale de las orillas que une (`puenteDe`), de piedra si lleva camino; los quebrados —los planes del agente y el ~1 % del procedimental sin eje— se asientan con `asentar` (escala 0,7-1,15, el medio del tablero como se ve en la casilla del nodo). Se apoya por el centro del tablero con las medidas de su JSON (`pxPorCasilla`, `alturaDelTablero`, `largoDelTablero`, `pnpm taller derivar-puentes`). La senda acaba en sus estribos (`tramosHastaLosEstribos`) y llega por tierra (`Escena.vados`, `informe.sendasDeEstriboEnAgua` = 0). La línea del puente abre tajo en la cara como un corte de `rampas` (bucle aparte: ni `junto` ni entorno). **Qué tapa un tablero** es una regla, la del pintor (`vaDelante`: `esVolumen` y `ordenDeVolumenes` de `separar`), en el pasillo de lo que se aparta, en `ponerPared` y en `laderasMalCubiertas`; la cara se pinta solo bajo la silueta de su pared (`CaraDeEscena.pintada`, `caras.ts`). `informe.puentesTapados` = 0, contado desde el orden del pintor. La marca del dueño cuelga de `Escenario.asientoDeObjeto`, siempre un punto, y la bandera se planta en el tablero (`Puente.mastil`); quien pisa un puente se pinta en él (`pisada`). Un clic sobre el tablero va al nodo (`puenteBajo`) solo si debajo hay agua o la casilla del nodo: la tierra de una orilla manda.
- **Castillo**: solares fijos con cadenas derivadas del catálogo (`townPlots`);
  las moradas son de cada facción.
- **Arena** (`pnpm arena`): cifras que no pasan por el catálogo, validadas por
  `validarUnidadDeArena`, guardadas en `data/borradores/unidades.json`, que el
  juego no lee. Velocidad en casillas (`escalonDeCasillas`). `SesionDeArena`
  vive en `session.ts`.

## Generación de assets

```bash
pnpm gen                              # simula: qué falta y cuánto costaría
pnpm gen -- all --go --budget 4       # genera de verdad (--budget = gasto ACUMULADO)
npx tsx tools/gen/animate.ts --all --go
```

Sin `--go` no se gasta nada; caché por hash del payload; gasto en
`tools/gen/spend.json`. Texturas como material a 90°, liso, sin mencionar agua.
Atlas de poses: ≤ 10 celdas, rejilla cuadrada, segunda referencia = identidad;
`echoScore` rechaza lo no repintado; `cutout.ts` recorta por relleno desde el
borde.

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
