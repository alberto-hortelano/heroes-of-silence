# La arquitectura del mapa frente a la de otros juegos por piezas

Investigación del 07-10-2026, sin tocar el repo. Se leyó el código de
`src/core/map/` y `src/client/render/escenario/`, la historia
(`docs/historia.md`), `docs/art/peticiones.md` §11-§20 y las issues #144, #156,
#159, #160, #166 y #169. Fuera se leyó el código fuente de **fheroes2**
(`src/fheroes2/maps/ground.cpp`, `map_format_helper.cpp`,
`map_random_generator.cpp`, `map_random_generator_helper.cpp`) y de **VCMI**
(`config/terrainViewPatterns.json`, `lib/mapping/CDrawRoadsOperation.cpp`),
además de su documentación y la de los otros proyectos. Lo que no se pudo
confirmar en una fuente primaria lo marca **[sin confirmar]**.

## Resumen en una frase

El **generador** y la **red de nodos** son razonables, y en validación vamos por
delante. **El escenógrafo, en cambio, reinventa a mano lo que el autotiling
resuelve por regla**: las transiciones del suelo, la forma de los acantilados y
dónde un camino atraviesa un desnivel. Casi todos los guardias del `informe` y
casi todas las issues abiertas del mapa (#159, #160 y #169) salen de colocar
sprites libres a lo largo de bordes que siguen la rejilla, y de arreglar después
los choques que eso provoca.

---

## 1. Generador

| | |
|---|---|
| **Nosotros** | Voronoi euclídeo con semillas en espejo (`intentarRed`, `src/core/map/generate.ts:907`), muro de una casilla donde cambia la etiqueta, nodos en la frontera, `problemasDeRed` y equilibrio por **perfil** de saltos. Después, `vestirRed` engorda las fronteras: un lado siempre y el otro según un ruido en **bloques de 4×4** (`engordarFronteras`, `vestir.ts:186`). Pone obstáculos con «paseos de casillas rectas» (`ponerObstaculos`) y traza los caminos radiales (`trazarCaminos`). Todo es determinista y lo vigila `pnpm banco`. |
| **VCMI (HoMM3)** | Una **plantilla** que es un grafo de zonas y conexiones. Coloca las zonas con Fruchterman-Reingold y recocido simulado, y les da forma irregular con **vértices de un teselado de Penrose**: «Using iterative subdivision, a set of Penrose tiling vertices is created at random orientation». Las zonas contiguas se unen «with a guard and a road». Después viene la fractalización de los caminos libres, y los obstáculos rellenan lo bloqueado eligiendo primero los más grandes: «Largest obstacles which cover the most tiles are picked first». Los obstáculos se agrupan por **biomas**. Fuentes: [RMG Description](https://vcmi.eu/developers/RMG_Description/) y [Biome Format](https://vcmi.eu/modders/Entities_Format/Biome_Format/). |
| **fheroes2 (HoMM2, RMG nuevo)** | Disposición en espejo. Las regiones **crecen paso a paso compitiendo por el espacio** («Step 3. Grow all regions one step at the time so they would compete for space»). Luego vienen las transiciones del suelo, los castillos, los conectores «based on frequency settings and border length», las minas y los caminos («Connect regions only after placing mines and castles to avoid roads under these objects»), los tesoros que esquivan los caminos y, al final, la decoración. Los obstáculos de frontera salen de **conjuntos prefabricados** («Large mountain cross», «Horizontal tree line», «Y tree group»). Fuente: [`map_random_generator.cpp`](https://github.com/ihhub/fheroes2/blob/master/src/fheroes2/maps/map_random_generator.cpp) y `map_random_generator_helper.cpp`. |
| **Veredicto** | **Es razonable**, y en la validación **vamos mejor**: ni VCMI ni fheroes2 tienen nada como `problemasDeRed` más el perfil, ni el plan del agente pasa en ellos por la misma puerta. **Pero hay un punto de rueda reinventada que causa #169.** Un Voronoi euclídeo da celdas **convexas de lados rectos**, y el ruido de 4×4 en bloques alineados con los ejes deja escalones rectos. VCMI y fheroes2 sacan formas orgánicas por construcción (el uno con Penrose más fractalización, el otro con crecimiento competitivo). La técnica estándar más barata para lo nuestro es el **Voronoi con ruido**: sumar a la distancia un ruido de valor suave, o deformar el dominio antes de etiquetar. También valen los [noisy edges de Red Blob Games](https://www.redblobgames.com/maps/noisy-edges/): «I use 'noisy edges' to hide the polygon structure». |

## 2. Suelo y transiciones

| | |
|---|---|
| **Nosotros** | Una máscara por suelo, hecha a **un píxel por casilla**, ampliada y desenfocada con `blur(T·0,45)`, y luego rellenada con un `createPattern('repeat')` de la textura a 4 casillas por repetición (`pintarSuelo` → `mascara`/`rellenar`, `pintar.ts:381-401, 499-505`). |
| **HoMM3 / VCMI** | Cada casilla lleva un tipo y un **índice de vista**. Una tabla de **patrones de 3×3** elige el índice («N: Native type, D: Dirt border, S: Sand border, T: Sand OR dirt border»), con varias imágenes por patrón (`"normal" : "73,74"`) para que no se repitan. **El truco clave es que toda transición es contra tierra o arena, nunca entre dos suelos cualesquiera.** Por eso basta con un juego de transiciones por suelo. Fuente: [`config/terrainViewPatterns.json`](https://github.com/vcmi/vcmi/blob/develop/config/terrainViewPatterns.json). |
| **fheroes2 (HoMM2)** | El mismo esquema: cada suelo tiene 16 o 38 imágenes de transición (contra tierra y contra playa), que se eligen por los bits de dirección de las ocho vecinas (`setTerrainBoundaries`), con 3 variantes al azar y volteo horizontal y vertical. Fuente: [`ground.cpp`](https://github.com/ihhub/fheroes2/blob/master/src/fheroes2/maps/ground.cpp) y `map_format_helper.cpp`. |
| **Age of Empires II (blendomatic)** | **Máscaras alfa** por dirección, 31 en total: «The id's 0..15 describe only 4 directions, but have 16 tiles» para no repetir. A cada suelo se le da una prioridad, y el de prioridad mayor se pinta enmascarado sobre el de menor. Además hay **modos de mezcla** por clase de suelo: áspero, suave o afilado. Fuente: [openage, `doc/media/blendomatic.md`](https://github.com/SFTtech/openage/blob/master/doc/media/blendomatic.md). |
| **Wesnoth** | Reglas `[terrain_graphics]` por patrón con `rotations=` y `probability`. Las *flags* hacen que «only one transition will be drawn per edge». Fuentes: [TerrainGraphicsWML](https://wiki.wesnoth.org/TerrainGraphicsWML) y [TerrainMacros](https://wiki.wesnoth.org/TerrainMacros). |
| **Autotiling genérico** | Conjuntos de esquina de 16 piezas, de borde de 16, mixtos de 256 o el **blob de 47**. Fuentes: [Tiled, Terrain](https://docs.mapeditor.org/en/stable/manual/terrain/), [Godot TileSet, `TERRAIN_MODE_MATCH_CORNERS_AND_SIDES`](https://docs.godotengine.org/en/4.3/classes/class_tileset.html) y el [blob de cr31, espejo de boristhebrave](https://boristhebrave.com/permanent/24/06/cr31/stagecast/wang/blob.html). El **dual grid** (Oskar Stålberg) baja a 5 piezas por pareja de suelos, porque pinta en la rejilla desplazada media casilla con *marching squares* ([TileWorldCreator, Dual Grid](https://giantgrey.gitbook.io/tileworldcreator-v4-documentation/dual-and-standard-grid)). |
| **Mezcla por altura** | Cada textura trae su propio mapa de altura, y en la frontera gana el pico más alto: la arena rellena las grietas entre piedras. Fuente: Mishkinis, [Advanced Terrain Texture Splatting](https://www.gamedeveloper.com/programming/advanced-terrain-texture-splatting) (2013). |
| **Veredicto** | **La idea es razonable**, porque es *splatting* con máscaras: lo mismo que AoE2, y lo correcto para un arte de texturas sueltas generadas por IA, sin un tileset de transiciones. **La ejecución reinventa mal la máscara.** Un mapa de 1 px por casilla desenfocado es un cuadrado borroso por casilla, así que la frontera sigue la escalera de la rejilla y una frontera recta de regiones sale como **una línea recta difuminada** (la mitad de #169: «nieve contra pradera», x 21-22 en s13). AoE2 lleva **16 máscaras por dirección**, y la técnica estándar es **umbralizar la máscara desenfocada con un ruido fBm** (bordes orgánicos) más **mezcla por altura** con la luminancia de cada textura (bordes con detalle, no un fundido). La repetición del `createPattern` de 4 casillas es otra rueda: la evitan el *texture bombing* o el muestreo estocástico (desplazamiento o rotación al azar por parche, fundidos), o un juego de **teselas de Wang** de la textura (Cohen et al., *Wang Tiles for Image and Texture Generation*, SIGGRAPH 2003). |

## 3. Relieve y acantilados

| | |
|---|---|
| **Nosotros** | Un **nivel por casilla** (por región, con una tirada; `nivelDeRegion`, `relieve.ts:22`). Las caídas salen por **aristas de casilla** (`caidas`, `relieve.ts:175`). Las del sur son `Cara`, **un rectángulo por tramo de fila**, rellenado con textura (`pintarCara`, `pintar.ts:402`) y cubierto con sprites «frontales». Las del este y el oeste son `Ladera`, cadenas de módulos `inicio/medio/largo/esquina/fin` con juntas registradas. Las del norte, solo un reborde. Encima hay rampas (un tajo `evenodd` en la cara), `ponerPared`, que corre, encoge, prueba el módulo más estrecho o pone un pedregal, `sinBarrancos`, `topesDeCara`, `esquinas`… Son ~850 líneas de `relieve.ts` más una buena parte de las ~2 370 de `colocar.ts`. |
| **HoMM2/HoMM3** | **No tienen relieve.** Las montañas y los acantilados son **objetos-obstáculo** multicasilla que se ponen sobre suelo plano (en fheroes2, `mountainTypeFromGroundType` y los conjuntos «Vertical mountain chain»…). Aquí no hay rueda que copiar: **nuestro relieve va más allá de la referencia**. |
| **OpenTTD / RCT** | Alturas **en las esquinas** de cada casilla, no en la casilla. En OpenTTD salen 19 pendientes: cuatro bits de esquina, `SLOPE_STEEP` y medias casillas, y las caras verticales se derivan de la diferencia entre esquinas ([`slope_type.h`](https://docs.openttd.org/source/d7/d6d/slope__type_8h_source)). RCT2 tiene «edge styles» por material ([foro de OpenRCT2](https://forums.openrct2.org/topic/2839-only-4-different-edge-surface-designs-available/)). |
| **Factorio** | Los acantilados son **entidades sobre una rejilla de 4×4 casillas**, independiente de las casillas. Al principio se probó «If an edge crossed a certain elevation and was steep enough, then we'd say that edge crossed a cliff»: es *marching squares* sobre un campo de elevación. Se ajustó con un ruido de «cliffiness» y una regla que «removes edges marked as cliff-crossing until no cell has more than 2 'cliff-crossing' edges», lo que **deja huecos naturales y prohíbe configuraciones imposibles**. Fuente: [Friday Facts #219](https://direct.factorio.com/blog/post/fff-219). |
| **Autotiling de paredes y acantilados** | Con un *terrain set* de esquinas y lados (Tiled, Godot) o con el dual grid, una pared con esquinas exteriores, esquinas interiores y diagonales se dibuja con 5 a 16 piezas por material, elegidas por regla. RPG Maker separa «techo» (blob) y «cara de pared» (autotile de solo lados) **[sin confirmar en fuente primaria]**. |
| **Veredicto** | **Aquí está la rueda más grande.** Detectamos las caídas **por arista y por fila** y tenemos piezas solo para **sur** (frontal) y **este u oeste** (ladera). Una frontera **diagonal** se convierte en una escalera de frontal, ladera, frontal…, que es justo la «ladera en diagonal sobre una fila de frontales» de #160. Las esquinas y los empalmes entre caídas distintas se resuelven caso a caso (`esquinas`, `topesDeCara`, `tramoDeFrontal`, `SOLAPE_DE_ESQUINA`…). La técnica estándar es **marching squares o dual grid sobre las alturas en las esquinas**: cada esquina toma el nivel de sus 4 casillas (máximo o mínimo), y el caso de 4 bits elige la pieza (recta S, recta E u O, esquina exterior SE/SW, esquina interior, diagonal SE/SW). Eso nos falta, y es lo que la cámara a 25° obliga a pedir sin espejar. Factorio enseña además a **separar la rejilla del acantilado de la rejilla de juego** y a imponer «≤ 2 aristas por celda» como regla generativa en vez de un guardia a posteriori. |

## 4. Caminos y ríos

| | |
|---|---|
| **Nosotros** | El núcleo guarda **tramos** (`GameMap.caminos`, `RedDeCaminos`). El escenógrafo los encadena de junta en junta, mete un vaivén lateral y redondea con **Chaikin** (`suavizar`, `sendas.ts:131`), y los pinta como trazo. Alrededor, un **pasillo** que aparta sprites midiendo la distancia del trazo al rectángulo del sprite, con índice propio en trozos (`pasillo.ts`). Los ríos no existen como línea: el agua es una franja de barrera (#144 abierta). |
| **HoMM3 / VCMI** | Los caminos y los ríos son **capas sobre la casilla**, con piezas elegidas por patrón de conexión en 3×3: «Road straight with angle», «Turn», «Dead end horizontal»…, con volteo ([`CDrawRoadsOperation.cpp`](https://github.com/vcmi/vcmi/blob/develop/lib/mapping/CDrawRoadsOperation.cpp)). Los ríos usan la misma clase (`CDrawLinesOperation`). |
| **fheroes2** | Caminos y arroyos como objetos con **bits de dirección** de sus 4 vecinas (`getStreamDirecton`, `map_format_helper.cpp`). No se pone nada bajo un camino ni bajo un arroyo: «There cannot be extra objects under the roads and streams». |
| **Wesnoth** | Los caminos son un suelo base (`Re`, `Rr`…) con transiciones como cualquier otro **[sin confirmar el detalle de las imágenes]**. |
| **Veredicto** | **Es razonable, y para nuestra cámara vamos mejor.** Las piezas de conexión de HoMM dan la escalera de la rejilla, que el usuario rechazó («sin la escalera de la rejilla»). La polilínea suavizada con Chaikin es la técnica estándar fuera de los juegos por casillas. El **pasillo** es lo mismo que la regla de fheroes2 («nada bajo un camino»), solo que medido en geometría y no en casillas, que es lo que obliga a tener `spritesSobreSenda`. El índice espacial de `pasillo.ts` es una rueda pequeña: un R-tree estático (p. ej. `flatbush`) haría lo mismo, aunque no compensa cambiarlo. **Los ríos (#144)** deberían ir por la misma tubería que las sendas: una polilínea del generador, suavizada, pintada con su ancho y su orilla. Es lo que hacen VCMI (una sola clase para caminos y ríos) y fheroes2 (arroyos como línea de conexiones). |

## 5. Puentes y nodos

| | |
|---|---|
| **Nosotros** | Un nodo es una casilla de paso entre regiones. `nodos.ts` deduce la barrera y el eje. `puentes.ts` (~640 líneas) decide el puente por las orillas, elige la pieza `puente-<clase>-<eje>`, asienta los quebrados, mide los estribos y acaba la senda en ellos. Hay guardias propios: `puentesTapados` y `sendasDeEstriboEnAgua`. |
| **VCMI** | Las zonas contiguas se unen con **guardia y camino** sobre el borde; las no contiguas, por agua o por portales. No hay pieza de paso que case con la orilla ([RMG Description](https://vcmi.eu/developers/RMG_Description/)). En HoMM3 los ríos son una capa transitable y no hacen falta puentes **[sin confirmar que no exista un objeto puente]**. |
| **Wesnoth** | Los puentes son *overlays* de suelo con orientación por hexágono (códigos tipo `^Bw|`, `^Bw/`, `^Bw\`) **[sin confirmar en la wiki durante esta búsqueda]**. |
| **Veredicto** | **Es razonable.** Que un nodo sea un objeto en una casilla es lo mismo que la guardia de conexión de VCMI, y nuestra red está mejor validada. El coste de `puentes.ts` no viene del concepto (Wesnoth también elige el puente por eje), sino de que la orilla, la senda y la cara son geometría libre que hay que casar a mano. Mejorará sola si el agua pasa a ser una línea (#144) y el relieve se hace por esquinas (§3). |

## 6. Decoración y volúmenes

| | |
|---|---|
| **Nosotros** | **Disco de Poisson** por lanzamiento de dardos, con radio variable y rejilla de cubos (`esparcir.ts`). Hay una tabla de exclusión por clase (`APARTE`, `colocar.ts:344`), murallas por esqueleto **Zhang-Suen** (`esqueleto.ts`), macizos con hondura euclídea y ruido de cumbres (`macizo.ts`), y volúmenes ordenados por profundidad con las figuras (`fundirPorProfundidad`). |
| **Estándar** | Poisson disk ([Bridson 2007](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf), en O(N)). Conjuntos de obstáculos que «look similar and just fit each other visually» (biomas de VCMI), conjuntos prefabricados (fheroes2) y orden del pintor por capa y base (Wesnoth `layer`/`base`). **WFC** ([mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)) se usa en Bad North o Caves of Qud para generar teselas bajo restricciones. |
| **Veredicto** | **Usamos las técnicas estándar**: Poisson, Zhang-Suen, Chaikin, orden del pintor. El dardo en vez de Bridson no importa a 34×34. Los **conjuntos prefabricados** de fheroes2 y los biomas de VCMI son una idea que nos falta: grupos compuestos a mano o por IA («cruz de montañas», «hilera de árboles») darían más composición que el esparcido uniforme, pero es un añadido, no una rueda. **WFC no compensa**: con módulos sueltos solapados y sin bordes que casen no hay adyacencias que propagar, y nuestro único problema de cadena (la ladera `inicio/medio/largo/fin`) es unidimensional y ya está resuelto. |

## 7. Validación

| | |
|---|---|
| **Nosotros** | Por el lado del juego, `validateMapPlan` → `problemasDeRed` y el perfil. Por la escena, un `informe` con contadores que deben dar 0: `murallasPartidas`, `basesSobreReserva`, `casillasDeBarreraSinFormacion`, `spritesSobreSenda`, `paredesSobreRampa`, `paredesFueraDelPie`, `laderasMalCubiertas`, `laderasEnfrentadas`, `puentesTapados`, `sendasDeEstriboEnAgua` y `modulosQueFaltan` (`colocar.ts:148`). Además, `pnpm banco`, barridos de semillas y marcas de fallos. |
| **VCMI** | Patrones de **validez** del suelo («N!: Native type always»): una configuración que no tiene pieza se **corrige cambiando el suelo**, no se cuenta ([`terrainViewPatterns.json`](https://github.com/vcmi/vcmi/blob/develop/config/terrainViewPatterns.json), sección `terrainType`). |
| **Wesnoth / Factorio** | Lo ilegal se impide por regla: un *flag* que deja una sola transición por arista, o «≤ 2 aristas de acantilado por celda». |
| **Veredicto** | **En el juego vamos mejor.** Ningún motor de los consultados prueba la red ni el equilibrio como nosotros. **En la escena, los guardias son buena práctica pero también el síntoma**: casi todos cuentan choques entre sprites libres y bordes de casilla, una clase de error que en un autotiling **no se puede representar**, porque la regla elige la pieza y no hay solape que medir. La lección de VCMI y Factorio es **sanear la entrada** (el campo de alturas o la máscara) para que no exista el caso sin pieza, en vez de colocar, mirar y apartar. |

---

## Dónde de verdad reinventamos la rueda

| # | Qué hacemos a mano | Técnica estándar | Coste | Qué cambia | Qué resuelve |
|---|---|---|---|---|---|
| **R1** | Máscara de suelo de 1 px por casilla con desenfoque gaussiano (`pintar.ts:381`) | **Máscara con umbral de ruido** (máscara desenfocada + fBm − 0,5, y luego `smoothstep`) y **mezcla por altura** con la luminancia de la textura (Mishkinis; idea de AoE2: prioridad entre suelos) | **Pequeño** | Solo código del cliente (`pintar.ts`, o el Worker). Ni arte ni banco: la escena no entra en el banco. Hay que volver a medir el tiempo del suelo y el test de ΔE de los pigmentos. | **Transiciones de suelo rectas** (la mitad de #169), y bordes con grano en vez de un fundido |
| **R2** | `createPattern('repeat')` de 4 casillas | ***Texture bombing* o muestreo estocástico** (parches con desplazamiento o rotación al azar, fundidos), o teselas de Wang de la textura | **Pequeño-mediano** | Código del cliente. El arte sirve tal cual; mejor si cada suelo trae 2-3 variantes. | **Repetición** del suelo a zoom bajo |
| **R3** | Voronoi euclídeo + ruido en bloques de 4×4 (`generate.ts:907`, `vestir.ts:186`) | **Voronoi con ruido o dominio deformado** (Red Blob *noisy edges*), o crecimiento competitivo como fheroes2 | **Mediano** | El **banco cambia**: hay que re-anclar y juzgar la forma del diff. También volver a medir el lado del mapa (`LADO_DEL_MAPA`), la duración y `barrido-semillas`. Ni arte ni cliente. | **Bordes rectos de barrera** (la otra mitad de #169: 10-16 frontales en fila). Ataca la causa, no el síntoma. |
| **R4** | Caídas por arista y por fila; `Cara` como rectángulo; esquinas, empalmes y escaleras de frontal y ladera caso a caso (`relieve.ts`, `colocar.ts`) | **Marching squares o dual grid sobre alturas en las esquinas**, con piezas por caso: recta S, recta E y O, esquina exterior SE/SW, esquina interior y diagonal SE/SW. Opcionalmente, con la línea de la caída en una rejilla más fina que la de juego (Factorio). | **Grande** | **Arte**: por material (roca, arenisca, nieve, basalto), las piezas **diagonales SE/SW** y las **esquinas interiores** que hoy no existen. Unas 4-6 hojas nuevas por material, sin espejar (§16-§20 de `peticiones.md` ya tienen S, E/O y esquina exterior). **Código**: `relieve.ts` da casos por esquina en vez de `caras`/`laderas`, y se simplifican `esquinas`, `topesDeCara`, `tramoDeFrontal`, `sinBarrancos` y `laderasEnfrentadas`. Banco no. | **Laderas** en diagonal sobre frontales (#160), esquinas entre caídas distintas, `laderasEnfrentadas`, y buena parte de los **bordes rectos** (una diagonal deja de ser una escalera) |
| **R5** | La rampa como **agujero** en la cara: tajo `evenodd` + `ponerPared` que corre, encoge, estrecha o quita, y un pedregal de relleno | La bajada como **pieza propia del juego de piezas**: un módulo «cara con paso» por material y caída, igual que una pieza de transición, que se elige por regla donde la senda cruza la caída | **Mediano** | **Arte**: unos 12 módulos (4 materiales × caída 1-3), con la senda dentro. **Código**: `rampas` decide dónde, no cuánto se aparta, y caen `paredesSobreRampa` y la mitad de `ponerPared`. **Ojo**: #168 quitó la pieza de escaleras porque «subía siempre hacia el mismo lado»; una pieza por orientación de cara (solo S; en E/O, ladera con paso) evita eso, pero hay que verlo con el usuario. | **Caras lisas** (#159), que salen justo donde la pared se quita junto a una senda o a una reserva |

Además, **sin coste de arte**, pero tampoco una rueda: la **R6**, los ríos como
líneas (#144), por la tubería de `sendas.ts` y `pasillo.ts`. Lo hacen VCMI y
fheroes2, y simplificaría `puentes.ts`.

## Lo que hacemos distinto a propósito y no conviene cambiar

- **Arte por IA en módulos sueltos, sin tileset.** Un tileset de transiciones
  (los 38 por suelo de HoMM2, o el blob de 47) exige bordes que casen al píxel,
  y eso es justo lo que un modelo de imagen hace peor. El *splatting* con
  máscaras (AoE2) y los módulos solapados con ancla (`catalogo.ts`) son la forma
  correcta de usar arte suelto. **R4 y R5 no contradicen esto**: piden más
  *tipos* de módulo (diagonal, esquina interior, paso), no bordes que casen,
  porque los módulos siguen solapándose sobre la cara texturizada.
- **Cámara a 25°, sin espejar.** Por eso nos hacen falta piezas S, E y O
  distintas, y las diagonales SE/SW serán otras dos. Los motores cenitales
  (Tiled, Godot) giran o voltean y nosotros no podemos. fheroes2 voltea las
  transiciones (`setTerrain(..., true, false)`), y para nuestras caras eso no
  vale. Hay que asumir el coste de arte.
- **La red de nodos.** Es la mecánica del juego, no una forma de dibujar. VCMI
  tiene algo parecido (zonas y conexiones con guardia), pero nuestra validación
  (`problemasDeRed`, el perfil, el plan del agente por la misma puerta) va por
  delante. No hay nada que copiar.
- **Caminos como polilínea suavizada.** Va mejor que las piezas de conexión de
  HoMM para este estilo pintado.
- **Suelo pintado una vez en un Worker y volúmenes por fotograma.** Es una
  decisión de rendimiento medida (historia, 04-10 y 05-10). Los motores por
  casillas pintan cada casilla en cada fotograma porque sus piezas son pequeñas;
  con texturas grandes y máscaras, lo nuestro es lo sensato.
- **El relieve en sí.** HoMM2 y HoMM3 no lo tienen. Si se quiere mantener, lo
  que hay que cambiar es *cómo* se derivan las caídas (R4), no la idea.

## Recomendación, por orden

1. **R1, la máscara con ruido y la mezcla por altura en el suelo.** Es pequeña,
   solo de cliente, no toca el banco ni pide arte, y quita las fronteras de suelo
   rectas de #169 en todas las semillas. Se mide con `pnpm capturas` y
   `pnpm taller escenario N`.
2. **R3, el Voronoi con ruido en el generador.** Ataca la causa de los tramos
   rectos de 10-16 casillas (#169). Es mediano, sobre todo por re-anclar el banco
   y volver a medir la duración y el lado. Conviene hacerlo **antes** de R4,
   porque cambia qué formas de borde le llegan al relieve.
3. **R4, el relieve por esquinas (marching squares) con piezas diagonales y de
   esquina interior.** Es el cambio grande y el que más código del escenógrafo
   retira. Primero el arte (una petición nueva en `peticiones.md`, por material),
   después el cambio de `relieve.ts`. Resuelve #160 y deja la mayoría de los
   guardias de laderas sin caso.
4. **R5, la bajada como pieza** («cara con paso» por material y caída), en vez
   de cortar la cara y apartar paredes. Cierra #159. Hay que decidirlo con el
   usuario por el antecedente de #168.
5. **R2 y R6**, cuando haya hueco: el suelo sin repetición (pequeño) y los ríos
   como línea (#144), que comparten tubería con las sendas.

## Fuentes

- VCMI: [RMG Description](https://vcmi.eu/developers/RMG_Description/), [Biome Format](https://vcmi.eu/modders/Entities_Format/Biome_Format/), [`config/terrainViewPatterns.json`](https://github.com/vcmi/vcmi/blob/develop/config/terrainViewPatterns.json), [`lib/mapping/CDrawRoadsOperation.cpp`](https://github.com/vcmi/vcmi/blob/develop/lib/mapping/CDrawRoadsOperation.cpp)
- fheroes2: [`src/fheroes2/maps/`](https://github.com/ihhub/fheroes2/tree/master/src/fheroes2/maps) (`ground.cpp`, `map_format_helper.cpp`, `map_random_generator.cpp`, `map_random_generator_helper.cpp`)
- Wesnoth: [TerrainGraphicsWML](https://wiki.wesnoth.org/TerrainGraphicsWML), [TerrainMacros](https://wiki.wesnoth.org/TerrainMacros)
- AoE2: [openage, blendomatic](https://github.com/SFTtech/openage/blob/master/doc/media/blendomatic.md)
- Factorio: [Friday Facts #219, Cliffs](https://direct.factorio.com/blog/post/fff-219)
- OpenTTD: [`slope_type.h`](https://docs.openttd.org/source/d7/d6d/slope__type_8h_source)
- Autotiling: [Tiled, Terrain](https://docs.mapeditor.org/en/stable/manual/terrain/), [Godot TileSet](https://docs.godotengine.org/en/4.3/classes/class_tileset.html), [Blob (cr31, espejo de boristhebrave)](https://boristhebrave.com/permanent/24/06/cr31/stagecast/wang/blob.html), [Dual grid (TileWorldCreator)](https://giantgrey.gitbook.io/tileworldcreator-v4-documentation/dual-and-standard-grid)
- Suelo: [Mishkinis, Advanced Terrain Texture Splatting](https://www.gamedeveloper.com/programming/advanced-terrain-texture-splatting); Cohen et al., *Wang Tiles for Image and Texture Generation* (SIGGRAPH 2003, citado de memoria, sin abrir)
- Formas: [Red Blob Games, Noisy edges](https://www.redblobgames.com/maps/noisy-edges/)
- Colocación: [Bridson 2007, Poisson disk](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf), [WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse)
