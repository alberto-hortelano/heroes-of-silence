# El escenario del mapa

Se lee antes de tocar: `src/client/render/escenario/`, `src/client/render/mapa/`, `tools/taller/escenario/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### Qué es un árbol (la regla «árbol = no se pasa»)

`esArbol`: las hojas de `ARBOLES` y los módulos de `ARBOLES_DE_LA_CUBIERTA` (`escenario/colocar/tablas.ts`)

### Lo que la copa de la masa no tapa de lo que se pisa

`topeDeLoPisable` (`altoPorLosLados`, `altoSobreLosPasillos` con `pasillosEstrechos`); el contador, `sobreLoPisable`

### Los módulos de la cubierta que no van en lo que se pisa (los peñascos grises de la nieve)

`FUERA_DE_LO_QUE_SE_PISA`, que lee `modulosDe(hoja, true)`; los pide la `mata` de lo que se pisa (`sePisa`)

### Qué lleva la labranza (campos, atrezo, casas)

`labranzaDe` (`render/escenario/labranza.ts`); las hojas que pone su regla y no el sorteo, `HOJAS_DE_SU_REGLA` (`tablas.ts`); si una pieza va al suelo o es volumen, `Sprite.plano` (lo lee `esVolumen`)

### La ciudad del mapa: su recinto (octógono, puertas, anillo y casas)

`render/escenario/recinto/`, puro: el 3 × 3 es el del núcleo (`recintoDeLaCiudad`); el octógono, `contornoDelRecinto`; lo que roza, fuera, `sendasSinRoces`; qué caras llevan puerta, las del núcleo, `puertasDelNucleo` (→ `puertasDeLaCiudad`: la escena no las deduce); el paso por el arco, `tendidosDeLasPuertas` (la puerta del núcleo de cada cruce, con su salida, `salidaDe`) → `sendasPorLosTendidos` (`celdas.ts`, la misma mecánica que las rampas, `tendidoDeBajada`); anillo y casas, `recintoDe` (llena: libres solo donde pisa el héroe, `LIBRE_BAJO_EL_HEROE`/`tapaElPieDelHeroe`, y la calle corta de cada puerta, `callesDeLasPuertas`, `FONDO_DE_LA_CALLE`, `MEDIA_CALLE`; ninguna casa tapa el vano de un arco, `vanoDelArco`/`tapaElArco`, por la silueta de su imagen, `Modulo.silueta`), y el papel de cada pieza, `Sprite.recinto`; sus módulos y sprites, `modulosDelRecinto` y `spriteDelRecinto` (`sendas-y-murallas.ts`); la huella, `casillasDeLaHuella`; lo de dentro, `celdasBajoLosRecintos` y `pintarPlazas` (`sendas-y-murallas.ts`), la plaza con sus lados, `ladosDeLaPlaza` y `enLaPlaza`; el óvalo del dueño, `Escenario.claveDeLaMarca`; el fuego, `luzDelRecinto`; los guardias, `huecosDelAnillo`, `anilloSobreLaSenda`, `sendasFueraDeLaPuerta`, `puertasSinSuCamino`, `casasRepetidasJuntas`, `arcosTapados` y `puentesSobreElAnillo`. Lo que pisa un puente en el suelo, `ejesDeLosPuentes`; el de la ciudad-puente, acortado al pie de la cara del río, `puenteDeLaCiudad` (`puentes.ts`)

### Material de una cara (pared, ladera, pedregal)

`materialDeCara` (`escenario/colocar/tablas.ts`)

### Roca de lo alto de un acantilado (picos, peñascos, reborde)

`materialDeLaCima` (`render/escenario/bordes.ts`)

### Suelo de la meseta de una barrera (roca de pared, cima y macizo, y el suelo que se pinta)

`sueloDeLaMeseta` (`render/escenario/bordes.ts`); en la escena, `sueloQueSePinta`

### Muralla de una franja de muro (línea, torres, guardia)

`trazaDeMuralla`, `torresDe`, `murallaSinLeer` (`muralla-sin-leer.ts`); torres apiladas, `seApilan`; lo de alrededor, `alrededorDeMurallas`; en la escena, `meterEnLaMuralla`

### Un muro de norte a sur (la muralla del mapa y las caras del este y del oeste del recinto)

`tiradaNorteSur` (`render/escenario/tirada.ts`): un solo módulo `muro-ns-*` al mismo alto, la pieza de delante donde iba siempre y cada una a un paso de la de delante, que tapa su testero (el corte de su punta); el arte es recto y sin testeros, pedido con su guía (`muro-ns`, 21-10-2026: el de antes se torcía ~0,4 casillas en tres pasos, s105), y el ancla (la junta de delante, en el eje del muro) y el paso son de la imagen, registrados sobre la guía y afinados por las almenas (`Pieza.tirada`; lo deriva `pnpm taller derivar-muros`, `tools/taller/muros.ts`, que lanza con una pieza que se tuerce más de `TORCIDO_MAXIMO`, y lo vuelve a derivar `arte-hojas.test.ts`); en el mapa, los pasos de norte a sur seguidos de una columna sin puerta en la junta (`tiradaDelMapa`); en el recinto, delante o detrás de la torre de cada punta según la geometría (`ordenDelAnillo`). El guardia, `testerosAMediaTirada` (`informe.testerosAMediaTirada`, `testerosDeLaEscena`)

### El orden de pintado del anillo de una ciudad (torre y cada pieza de sus dos caras)

`ordenDelAnillo` (`escenario/recinto/orden.ts`, 21-10-2026, marca s16 (11, 6): la torre del vértice de arriba de la puerta del noreste tapaba el pilar del torreón): cada pieza es un sólido de su guía (la torre, un cilindro en su vértice; el tramo, un muro de `GRUESO_DEL_MURO`; la puerta, con su torreón de `LARGO_DEL_TORREON` × `GRUESO_DEL_TORREON`; la de norte a sur, su adarve, `solidoDe`) y, donde se solapan en pantalla, se pinta después la que tapa más (`loQueSeTapan`, punto a punto por lo que cada una tiene más cerca de la cámara); lo que no cumple baja la clave de la que va antes, nunca sube la de la que va después (21-10-2026: la torre de abajo del este o el oeste subida a la clave del tramo en diagonal se pintaba encima de 119 pinos y picos de 1-40 que tiene delante), y la casa que se pintaba antes que una pieza bajada por delante del medio baja con ella (`techoDeLaCasa`; `casasEnSuOrden` lanza si eso la pasa detrás de la fila de detrás). El guardia, `anilloMalOrdenado` (`informe.anilloMalOrdenado`, con la clave de cada sprite)

### El puesto en la escena (05-11-2026, fase 4 del puesto fronterizo; `/simplify` el mismo día)

**cada obra es una pieza más de la escena, con su condición** (`Sprite.deNodo`, `DeNodo`: el nodo y cuándo se pinta, `CuandoSePinta`), y el hito del nodo también (`cuando: 'neutral'`); **la única regla de lo que se pinta en un nodo**, `seVeConSuNodo` (`escenario/colocar/sprite.ts`: el hito, sin dueño sabido; la obra, con dueño y su mejora), que leen `volumenesALaVista` (`volumenes.ts`, con el dueño y la mejora que se saben) y el taller (`pintarEscena`, todo neutral); si un sprite es una obra, `esObra` (`Obra`). **Dónde va lo decide `componer`** (paso 2a), para todo nodo, con `sitiosDeLosPuestos`: el pie más cercano al centro del nodo (en un puente, a su tablero; de `CORRIMIENTOS`, a pasos de 0,1 hasta `LEJOS_DEL_NODO`, 3, y más caro por delante del pie del héroe, `COBRO_POR_DELANTE`; solo si ahí no hay sitio, hasta `LEJOS_SIN_SITIO`, 3,5: s1 del 64×64) cuya envoltura (`envolturaDelPuesto`: la mayor obra por cada lado, `envolturaDeLasObras` de `alrededorDeLaObra`) cumple `dondeNoVaUnPuesto` (`sendas-y-murallas.ts`: no pisa, en un solo índice, la huella de la senda, de una rampa ni de un tablero, ni el eje de un paso, `SEMIANCHO_DEL_PASO`; apoya en tierra que no es agua, muro ni recinto; no toca un objeto ni su reserva, ni **un recinto hasta el pie de sus torres** (`hastaElPieDeSusTorres`: su envoltura acaba en el muro sur), ni el puente de otro nodo ni una pieza de bajada en ningún orden (su clave sube después), ni, si se pinta después, una pared, su puente ni **la muralla por venir, medida en su línea**, `murallaPorVenir`: sus tramos, `tramoDelPaso`, y sus torres, `torresDe` y `torreDeLaCasilla`, las mismas que pone `vestirMuralla`), y no toca al héroe parado en el nodo (`cajaDelHeroeEn`, de `pieDeFigura`, `figuras-del-mapa.ts`). Su clave es la de su pie, como todo volumen. Su reserva entra en `reservas` como la de un objeto o un recinto (`reservaDelPuesto`: dos trazos por su planta; lo que se aparta no apoya el pie en ella y lo de delante no la cubre), así que la ven `Obstaculos`, `reservaEn` y `meterEnLaMuralla` (una regla para objeto, recinto y puesto), y `basesSobreReserva`. La escala de cada obra es la de su arte registrada sobre su guía (`Pieza.puesto.pxPorCasilla`, de `pnpm taller derivar-puestos`, `puestoDerivado`, que `catalogoValidado` exige a toda `puesto-*` y a ninguna otra); sin pieza, la de su guía, `MEDIDAS_DEL_PUESTO` (`obraDelPuesto`). Sin imagen (no ha llegado, o no hay), el mapa pinta en el sitio de la obra su marcador a su escala, en cada fotograma, y la bandera va en lo alto de lo que se ve (`cajaDeLaObra`: sin el margen del recorte, `MARGEN_DEL_RECORTE`, `shared/arte.ts`, el que usa el trabajador). Las obras de un nodo, `Escenario.puestoDeNodo` (de los volúmenes; sin sitio, ninguna). Los guardias: las obras pasan por los de siempre (`spritesSobreSenda`, `pasosTapados`, `pasosAtravesados` —también en la puerta de muralla—, `puentesTapados`), más `informe.puestosSinSitio` (nodos sin sitio y obras que tocan al héroe de su nodo, `puestosSobreElHeroe`) e `informe.puestosTapados` (lo que el pintor pone después, en el orden de `separar`, y la toca, `puestosTapados`, con `HOLGURA_DEL_PUESTO`) e `informe.puestosQueTapan` (lo horneado de otro objeto que se pinta antes y la obra toca, `puestosQueTapan`: la torre de un recinto), todos a 0 en 1-40 y en 1-6 del 64×64 (`test/pasos.test.ts`). **La sombra de lo que se elige por su nodo no se hornea** (`seHorneaSuSombra`, `pintar.ts`: horneada, cada nodo llevaba las tres de sus obras, también el neutral, QA de la fase 4): la pinta el mapa bajo todo volumen solo de lo que se ve (`pintarSombraAlPie`; sin imagen, la del marcador), y el taller la del hito. Las piezas, `PIEZA_DEL_PUESTO` (`assets/mapa/puesto-caseta`, `-torreta`, `-torre`), pedidas con su guía (`PUESTOS`, `guiaDelPuesto`, `DIBUJO_DE_LA_OBRA`, `escribirGuiasDePuestos`, `tools/taller/mapa.ts`; `pnpm taller encolar --puestos`); toda guía de geometría la escribe `escribirGuia` y se encaja con `encajar` (`tools/taller/guias.ts`)

## El cliente

- **Niebla de quien juega** (#64): los héroes se pintan si se miran AHORA, los
  objetos como se SABEN (castillos y nodos con su último dueño visto), los grupos
  si se mira su casilla; terreno y volúmenes, por `fog`, que desde el 02-11-2026 va
  por regiones enteras (el negro sigue el borde de las regiones, no un cuadrado),
  y la sombra tenue de lo que no se mira es el radio de 5 de los héroes y de 6 de
  castillos y nodos propios, sobre lo explorado. Nada se pinta sobre el negro. La
  crónica pasa por `cronicaPara`.
  El lienzo recibe héroes y objetos en `VistaMapa` (`AdventureScene` no trae héroes).

### Mapa de aventura

**Mapa de aventura**: lo pinta el escenógrafo (`render/escenario/`, `componer`
con la semilla de la partida, la misma en cliente, espectador y taller), en una
tarea aparte del primer fotograma (`escenarioListo`).

**El suelo** (texturas,
relieve, caras de roca, agua, sendas, cubierta baja) lo pinta **un Worker**
(`escenario/pintor-del-suelo.ts`, `OffscreenCanvas`, las imágenes como
`ImageBitmap` que pide él) una vez por partida y **para el zoom máximo**: un
encargo que pinta en serie el esbozo a `PX_DEL_ESBOZO` (60, ~2 s) y el bueno a
`PX_DEL_SUELO` (120 = ⌈110 × 1,09⌉, ~5,5 s más en 34×34; en 42×42, 127 MB los dos), cada uno en un
Worker que se termina al contestar (uno vivo para los dos no suelta las máscaras).

**Con dpr > 1,09 el bueno va a ⌈`TILE_MAX` × dpr⌉** (`resolucionDelSuelo`, #148) hasta
`BYTES_DEL_SUELO_BUENO` (126 MB: 165 px en un 34×34, dpr 1,5; en el 42×42 de #226, 133 px, y
a dpr 1,5 se amplía ×1,24 con su aviso); más allá, lo que quepa y un aviso en
consola. `pintarEscena` del taller a 96 px (s1, 2, 5, 9): ~3,4 s en 34×34 → ~5,6 s en 42×42; en
`pnpm capturas`, el suelo pintado en 9-12 s con la máquina cargada (09-10-2026). Medido sin GPU y con la máquina cargada (2026-10-08), 120/138/165 px: el bueno en
6-7/8-10/11-12,5 s y el navegador sube 0,4-0,6/0,6-0,7/0,9-1,05 GB mientras pinta (a 220, 20 s y
1,6 GB; y a dpr 2 una ventana de 1440×900 se pinta a densidad 1,34, que pide 147). Si el dpr sube a
media partida se encarga otro bueno; si baja, se reduce el que hay.

**Las fronteras entre suelos** (`fronteras.ts`, `fronterasDelSuelo`): el alfa de cada suelo a `PX_DE_LAS_FRONTERAS` (16) por casilla, el mismo en el esbozo y en el bueno: el campo del suelo leído en un punto deformado (±1,1 casillas, el serpenteo), más un ruido por suelo y la luminancia de su textura (mezcla por altura), con el ruido de la semilla de la escena; los alfas van acumulados y el arcén toma el pigmento con las mismas fronteras. Cada punto se reparte solo entre los suelos de **su nivel pintado** (#211): el serpenteo no sube lo bajo a lo alto ni baja lo alto.

**El escalón** (`escalon.ts`, #211; auditoría 5, defectos 2 y 4): todo en máscaras puras a `PX_DEL_ESCALON` (16) por casilla, calculadas una vez por escena (`delEscalon`, las comparten el esbozo y el bueno) y ampliadas con suavizado.

**El nivel pintado** (`nivelPintado`): el de su casilla, o el de la vecina más alta que más pesa, que se adelanta sobre la baja entre `ORILLA.menos` y `ORILLA.mas` (0,06-0,3) con ruido y las esquinas redondeadas; nunca baja. Lo leen las fronteras, el tono, el agua y la sombra: con el lado de casilla tal cual, donde no hay pared encima, el agua y los suelos salían en rectángulos.

**El agua y el barro no suben** (`aguasDeLaEscena`): lo mojado de cada nivel de agua es nítido (sus casillas, las esquinas redondeadas `ORILLA_DEL_AGUA.esquinas`) y se cierra donde el nivel pintado (y el píxel de al lado, el que lee la ampliación) queda por encima; desde su borde el agua entra entera en `entra` (0,15), el barro es una orilla de `barro` (0,08) hacia fuera y la espuma un anillo dentro (`ESPUMA_EN_LA_ORILLA`). Con el agua desenfocada y cortada, quedaba una banda ancha de barro entre la meseta y el agua. `informe.aguaEnLoAlto` (lo mide la página del taller) = 0 en 1-40 (eran 1,53 M píxeles a 16 px; el istmo de s2 (25, 10-12) era agua). Las sendas no secan el agua: una senda sobre agua sin puente es del trazado (#210); `informe.sendaSobreElAgua` es medida, 8 en 1-40 (2026-10-08).

**Un tono por nivel** (`tonoDeNivel`, #217): negro 0,3/0,24/0,1 en −1/0/1, luz `soft-light` de blanco cálido 0,85/1 en 2/3+ (`screen` lavaba lo alto como niebla y `color-dodge` quemaba la nieve antes de que la lava se notara), el borde suavizado `SUAVE_DEL_TONO` (0,05) porque, marcado, el escalón de un píxel del nivel pintado se veía en dientes. Mismo suelo a 1 y a 2, ΔL de la mediana por casilla a 96 px (08-10-2026): lava de s13 14,7 → 31,0, nieve de s2 4,6 → 14,9 (2,1 y 3,2 veces).

**El labio y el canto de la espalda** (`labioDeLasEspaldas`, #217; `cantoDeLasEspaldas`, #219): en lo alto, a lo largo de cada caída hacia el norte y por el nivel pintado, una luz `soft-light` de `LABIO.ancho` (0,14) y `LABIO.luz` (0,9); y en lo bajo, justo al norte del filo, el canto: **una línea fina y nítida** (#223), negro a `CANTO.oscuro` (0,75) en `CANTO.ancho` (0,14: dos píxeles del escalón, 0,125 casillas) y nada después, encima del agua, ni por donde baja una rampa; es lo único que oscurece la espalda. De 0,28 con fundido, sumado a la sombra al pie que la espalda echaba ~0,57 casillas al norte y que en los entrantes de una casilla se juntaban en una mancha, se leía «una sombra difuminada, no se entiende» (marca en s55 (4,16)). Lo vigila `oscuroAlNorteDeLasEspaldas`: lo bajo con un oscuro ≥ `OSCURO_DE_LA_ESPALDA.umbral` (0,1) seguido desde el filo, columna a columna, no queda a más de `OSCURO_DE_LA_ESPALDA.ancho` (0,25: la línea más el píxel que derrama el suavizado y el escalón de un píxel de un filo en diagonal) del filo más cercano, sin las columnas de la sombra de una ladera vecina; en 1-40, de mediana 0,31, p90 0,42 y máximo 0,56 casillas (889 de 1 096 espaldas por encima de 0,25) a mediana 0,19 y máximo 0,23 (0 por encima; 09-10-2026). Se buscan solo al norte, columna a columna (al sur va la cara y al este y oeste las laderas). Con el labio solo, en `screen` y de 0,16, la espalda se leía como una hebra de niebla (auditoría 7, defecto 1: s24 (0-9, 20-21), s13 (14-24, 4-7)); el filo claro sobre una línea oscura se lee como un canto, y lo bajo, en sombra. `informe.espaldasSinLabio` y `espaldasSinCanto` = 0 en 1-40 (1 092 rebordes con filo pintado; 3 casillas bajas sueltas se las comen las orillas de lo alto). El canto cuesta ~13 ms por mapa, una vez; el pintor no sube (taller a 120 px, 4 rondas de s13, 2 y 9 alternadas, 09-10-2026: mediana 4 079 → 4 201 ms, mínimo 3 955 → 4 014, en el ruido de la máquina cargada). El suelo que se pinta en una barrera o un nodo (lo que no tiene región) es el de su meseta (`sueloQueSePinta`, #217, #220): con el más cercano de cualquier nivel, 2 833 de 18 777 casillas de barrera de 1-40 pintaban arriba el suelo de abajo (picos nevados sobre áspero oscuro en s24 (22-29, 9-16)), y el nodo sin camino que va al alto derramaba la nieve de abajo sobre la lava de s13 (18, 7).

**La cubierta es la de ese suelo** (#220): lo alto del acantilado, el pie de la muralla y los nodos la eligen por él, no por `Analisis.suelo`; `informe.cubiertaDeOtroNivel` (piezas de cubierta cuya hoja no es de la mezcla ni de los árboles del suelo pintado bajo su pie) = 0 en 1-40, 57 y 80 (eran 494 en 1-40, s57 18 y s80 53, 09-10-2026: nieve y abetos nevados en lo alto de la lava de s13, hierba en lo alto de la nieve de s80). Las máscaras del escalón se tiñen a 16 px y se amplían al copiarlas (`encima`), sin un lienzo del tamaño del mapa por máscara: el pintor no sube (taller a 120 px, 4 rondas de s13, 2 y 9 alternadas: mediana 4 473 → 4 521 ms, en el ruido).

**La sombra del desnivel** (`sombraAlPie`), la única (sustituye a los cantos al este y al oeste y a la franja de la espalda de #212): por cada lado de casilla de una caída que mira hacia donde la echa la luz del contrato (`ARTE.luz`: al este; al norte, la espalda, no desde #223: lleva el canto), entera hasta el pie (el talud) y fundida el contacto más `caída · ALTO_DE_NIVEL · longitudPorAltura` hacia esa luz, a 0,42 del color de sombra; ni sobre lo alto, ni por donde baja una rampa. En un barranco de una casilla (lo alto también al otro lado de la fila, sin laderas: `sinBarrancos`) solo el contacto, que si no llenaba el hueco (#223, `franjaDeSombra`). Al sur y al oeste, nada: miran a la luz. El pintor del suelo no sube (taller a 96 px, 08-10-2026: 4,6 → 4,1 s de media en s1, 2, 5, 9 y 443; el desenfoque de lienzo a resolución plena era más caro).

**Sin rejilla** (`parches.ts`, R2): cada textura del suelo, el agua y el barro va con su patrón y encima, con `source-atop`, un parche redondo por celda de una rejilla de `PASO_DEL_PARCHE` (1,5 casillas) movida al azar, de radio `RADIO_DEL_PARCHE` (1,5; entero hasta 0,85) y fundido por el borde, en orden barajado; cada uno es uno de `VARIANTES_POR_TEXTURA` (12) trozos de la textura (desplazamiento y espejo izquierda-derecha; ni giros ni espejo vertical: la luz viene de arriba y la arena tiene ondas), una estampa que se hace al pedirla y se suelta con su textura (`estamparParches`). El encaje (`encajeDe`) sale de la semilla de la escena y la clave de la textura, y las fronteras leen la altura en él (`enElEncaje`): la autocorrelación al periodo de 4 casillas bajó de 0,53-0,68 a ~0 (texturas solas, semillas 1, 7 y 13, 2026-10-08; la vigila `test/parches.test.ts`). Mientras, se ve el sucedáneo de pigmentos y luego el esbozo
(`#app[data-escenario]`: `cargando`, `esbozado`, `pintado`). Cada fotograma
copia, bilineal, la superficie más pequeña que no se amplía (`nivelDelSuelo`;
por debajo de ×0,5 saca mitades del esbozo o del bueno, ~30 ms la de 165) a un fondo que mide lo mismo que
el lienzo (`ctx.canvas`) y se copia píxel a píxel. Sin Worker —o si falla, que
se dice, y solo lo que faltaba— lo pinta este hilo con la misma secuencia
(`enEsteHilo`, `pintarSueloA`). Otro mapa termina el pintor del anterior y
cierra lo pintado.

**Los volúmenes**
(árboles, picos, muros, paredes, lo que pase de `UMBRAL_DE_VOLUMEN` = 0,6
casillas, las piezas de cada ciudad y pueblo y nodo horneados) se pintan a cada fotograma,
en píxeles de dispositivo, desde copias reducidas al tamaño exacto que se
copian 1:1, de una caché LRU de 80 MB (`render/copias.ts`, la de las piezas
también; copias por niveles reescaladas costaban 15-20 fps en 2560×1440), como mucho
`PIXELES_NUEVOS_POR_FOTOGRAMA` (1,5 M) píxeles de copias nuevas por fotograma
(13 módulos de picos y paredes no llegan a 120 px por casilla: pedidos en
`docs/art/peticiones.md` §12), fundidos por profundidad con
las figuras (`fundirPorProfundidad`): **una figura puede quedar detrás de un
árbol** (de un grupo de asaltantes, que no lleva reserva como el monstruo, lo tapado se pinta
encima en silueta morada con contorno, solo donde lo tapa un volumen y sin cubrir lo que va
delante, `pintarLoTapadoDeLosAsaltantes`, `render/mapa/figura-tapada.ts`: tras un pico quedaban su
estandarte y su chapa solos y se leía «sin arte», y al trasluz, en la nieve y de noche, una
mancha, 06-11-2026), pero no de lo horneado de su casilla (`claveDeFigura`) ni de una pieza del relieve
que cuelga de su fila o de más al norte: el mapa no levanta lo alto, y la cara de una caída de 3
cuelga 1,8 casillas sobre lo de debajo con el pie más abajo que los de la figura. Cada pieza
(frontal, ladera, diagonal, bajada y peñascos de la cara) lleva `Sprite.filaAlta`, y la figura
sube a la clave de las que tapan algo de su silueta (`delanteDeLasParedes`, `figuras.ts`, #185;
`informe.pisablesTapadas` = 0, eran 2 281 en 1-40). El suelo de debajo sigue bajo la cara. Se recortan al
mapa por los lados y por abajo; por arriba, solo lo que sube desde una casilla sin explorar
(`recortadoArriba`, #152), porque encima del mapa no hay niebla que lo tape. Lo que dice quién está en una
casilla —inicial del héroe, chapa, estandarte, bandera— va en
una pasada encima de todo y bajo la niebla; la inicial que taparía a otra figura se
va a un lado de la cabeza (`asientoDeLaInicial`). Sin excepción desde el 02-11-2026:
un grupo solo se ve sobre lo explorado (la pasada de los grupos encima de la
niebla, `sobreLaNiebla`, se fue con la regla de la región de #130). Monstruos y cofres los
pinta el juego (`seHornea`, en `escenario/horneado.ts`).

**Las cordilleras** (`macizo.ts`): cada franja de
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
montaña, 2,31 → 1,54.

**En masas y claros** (#218): un ruido de grupos (`PASO_DE_LOS_GRUPOS`, 4,6
casillas) y la hondura dan la `masa` de cada punto: en la masa los picos van apretados
(`ESPACIO.masa` 0,85 × `radioDePico`), en un collado ralos, y en un **claro de falda**
(`UMBRAL_DEL_CLARO`, 0,3; nunca en la cresta) no caen dardos: cada casilla lleva su pico bajo
(`BAJO_DEL_CLARO`) y dos peñascos de la roca de su meseta, y si nada entra, los dardos del claro
(ninguna casilla sin formación). Las cordilleras van con su propia corriente de azar
(`azarDeLasCordilleras`). En 1-40 (09-10-2026): picos por casilla de cordillera 1,50 → 1,30, suelo
visible en las anchas 27,5 → 35,9 %, y en las casillas que hoy son claro el alto sumado de sus
picos era el de la masa (1,51 frente a 1,45) y ahora es la mitad (0,76 frente a 1,64); lo vigila
`test/macizo.test.ts`. La cresta, de ×1,39 a ×1,92 su falda en 1-12 (la 7 y la 8 vuelven al
guardia). El bosque sigue con
la hondura entera de `analizar`.

**La cubierta de lo que se pisa** (#184): en la lava, la arena,
la ciénaga y lo áspero (`CUBIERTA[s].comoLaBarrera`: su cubierta es de la roca o la madera de la
barrera vecina) va rala (`CLARO_COMO_LA_BARRERA`), sin manchas ni árboles, y cada pieza se encoge
hasta no ser más esbelta que `ESBELTEZ_DE_LO_PISABLE` (`tumbado`, en `poner`); lo alto del
acantilado y el pie de la muralla siguen con la hoja entera. `informe.cubiertaComoLaBarrera` = 0
(piezas más altas que su esbeltez y regiones de ≥ 9 casillas con huella > `HUELLA_DE_LO_PISABLE`).

**La labranza va en campos** (20-10-2026, `docs/agents/2026-10-20-labranza-en-campos/`): la
cubierta del suelo `dirt` no se sortea punto a punto (era confeti: parcelas, cercas, almiares y
carretas al azar y un 25 % de pradera). La pone una regla pura, `labranzaDe` (`labranza.ts`), con
su propia corriente: campos de 3 a 7 casillas (Voronoi de paso 2, partidos por caminos y bosques)
de un solo cultivo —trigo, coles o surcos (`PARCELAS`, módulos 1-8 de `cubierta-dirt`)—, ~46 % en
barbecho, una parcela por casilla (planas, `Sprite.plano`) y otra en la junta de dos del mismo
campo (el arte es en rombo: sin ella, un damero); la parcela que no entra entera saca su casilla
del campo y se reparte otra vez (`escalaQueEntra`). Atrezo (`ATREZO`: cerca, almiar junto al
trigo, carreta junto a un camino o un pueblo) y **casas** (hoja `casas`, 13 recortadas de los
pueblos por semillas a mano, `pnpm taller derivar-casas`; con volumen), pocos, a Chebyshev ≥ 3 de
todo objeto del mapa, las casas a ≥ 2 de todo camino (el héroe que se para en la casilla de una
casa se pinta encima; decisión del usuario) y a ≥ 4 entre ellas, y nada bajo la copa de un bosque
(`entraLaPieza`). Tono `saturate(0.65) brightness(0.88)`. Lo demás de la escena no se mueve: los
puntos de tierra del esparcido gastan las mismas tiradas que una mata (`gastarLasTiradasDeMata`; #269 para quitarlo de raíz).

**La ciudad es un recinto amurallado** (20-21/10-2026, `docs/agents/2026-10-20-ciudad-amurallada/`;
la hoja `ciudades`, una maqueta de otra escala, se borró): cada ciudad se compone en la escena con
una regla pura, `recintoDe` (`recinto.ts`), con su propia corriente. Un octógono regular inscrito
en su 3 × 3 (`contornoDelRecinto`, cara de 1,226), con una torre de la hoja `muro` en cada vértice
y en cada cara su tramo liso (`tramo-n-s` al norte y al sur, la tirada de dos `muro-ns` al este y
al oeste, los `tramo-*` en diagonal) o su puerta (`puerta-n-s`, `-e-o`, `-ne-so`, `-no-se`: arco
de medio punto con el rastrillo alzado), a `ESCALA_DEL_RECINTO` (0,8) de la muralla del mapa. La
hoja `recinto` (puertas y tramos, Codex por la suscripción con su guía, `pnpm taller encolar
--recinto` y `derivar-recinto`) va de vértice a vértice por sus juntas (`Modulo.junta`), a la
escala propia de cada módulo (`ESCALA_DEL_MODULO`, alrededor del medio de su cara).

**Manda el
muro del tramo en diagonal** (vuelta 4, 21-10-2026, decisión del usuario): todas las caras con
~72 px del pie a la coronación a 200 px por casilla (`ALTO_DEL_MURO_DEL_RECINTO`; el `muro-ns`,
×`ESCALA_DEL_MURO_NORTE_SUR`, con sus almenas, más pequeñas), y la puerta baja, con el torreón a
~1,3 veces el muro (`ALTO_DE_LA_PUERTA_DEL_RECINTO`) y un arco por el que cabe el puente de una
ciudad-puente (`LUZ_DEL_ARCO`). Las puertas son las del núcleo (`puertasDelNucleo`, vuelta 3, fase 3): hay
puerta donde un camino llega de un acceso a su casilla, y la del río de una ciudad-puente;
`puerta-e-o` solo en la cara del puente de una ciudad-puente con el puente al este o al oeste. Hasta
la fase 3 la escena las deducía de las sendas pintadas, y en 19 de 208 ciudades de 1-40 pintaba otras
que las del juego (la que llega de lado a una puerta diagonal, en la cara del este o del oeste). Dos
sendas por una cara, una puerta, y se abren en Y fuera. La senda pasa por el arco de la puerta de su
cruce y sale recta por su normal (`SALIDA_DE_LA_PUERTA`, de 0,6 a 1 según la cara) antes de volver a
su trazo (`tendidosDeLasPuertas`); si delante no se pisa, una salida más corta, y si ninguna, la de
pasar el arco (`SALIDA_SIN_SITIO`, s26 (40,17): la del noroeste con el puente al norte iba por el
agua). La que roza el recinto sin ir a la ciudad se corre fuera de torres y muro (`sendasSinRoces`;
sin él, `recintoSobreSenda` 3 en s38 y s39). Dentro, casas de la hoja `casas` a la escala del pueblo
(`PX_POR_CASILLA_DEL_PUEBLO`, de `ANCHO_DEL_PUEBLO`), apiñadas en filas repartidas de muro a muro,
pegadas a él, sin la misma al lado, por todo el recinto y sin plaza mayor (decisión del usuario
tras la fase 3: con ella y una calle de cada puerta hasta ella se veía vacía). Libre, solo lo justo:
la calle corta de cada puerta (`callesDeLasPuertas`, `FONDO_DE_LA_CALLE`, 0,35, lo que entra la
senda; `MEDIA_CALLE`, 0,15) y donde pisa quien está en la ciudad (`tapaElPieDelHeroe`, la elipse de
`LIBRE_BAJO_EL_HEROE`, 0,2 a cada lado y 0,1 de hondo: sus pies sobre la piedra y no sobre un
tejado).

**Ninguna casa tapa el vano de un arco** (`tapaElArco`, H1 del QA de la ciudad llena,
21-10-2026): la que se pinta después de una puerta no mete nada de su silueta (`Modulo.silueta`,
de dónde a dónde va lo opaco por franja de columnas, `siluetaDeModulo`; solo la hoja `casas`,
`conSilueta`) en su vano, la boca de la guía en doce columnas (`vanoDelArco`: inclinada en las
diagonales, de canto al este y al oeste). Era una calle de 0,6 por detrás, a lo largo de la normal
de la cara, y en una diagonal el tejado sube por la vertical de la pantalla: la casa `1` quedaba a
0,63 bajo el arco del noroeste y lo tapaba en 25 de 553 ciudades (s16 (10, 7)); con la regla de
antes, una casa mete su silueta en un vano 355 veces en 1-40 (casa y arco). Casas por ciudad en 1-40, fase 2
13 / 15 / 18, con la plaza mayor 11 / 13 / 15, llena 13 / 15 / 16, sin tapar arcos 12 / 15 / 16,
media 14,60 → 14,44 (mín. / mediana / máx.; con la caja en vez de la silueta, o con la calle de 0,6
y la regla, la mediana era 14); con las puertas bajas y de arco ancho de la vuelta 4 (21-10-2026),
13 / 15 / 16, media 14,55, en 208 ciudades de 2 y 3 puertas (80 y 128). Debajo, la plaza (`pintarPlazas`), que por
delante no pasa de `PLAZA_AL_SUR` (0,05) del pie de las caras sureste, sur y suroeste (H9: con el
rectángulo asomaba de 0,15 a 0,25 bajo el muro sur), y ni paredes del relieve, ni bajadas, ni masa
(`celdasBajoLosRecintos`). La reserva es el rectángulo y la ocupa `envolturaDelRecinto`; el óvalo
del dueño es suelo de la plaza (`claveDeLaMarca`: lo tapa lo que se levanta delante; encima de todo
teñía la fachada de una casa, H8), la bandera va encima de todo, quien está en una casilla del
recinto, delante, y el fuego, en su medio
(`luzDelRecinto`; el clic y la marca siguen en la casilla del núcleo). `recintoSobreSenda`,
`sendaFueraDeLaPuerta`, `puertaSinCamino`, `anilloAbierto`, `puenteSobreElAnillo`,
`casasRepetidasJuntas`, `arcosTapados` y `testerosAMediaTirada` = 0 en 1-40 (21-10-2026, con minas; sin ellas, s11 da 4 `recintoSobreSenda`, y
no hay guardia que los mire; `anilloMalOrdenado`, 0 en los 256 juegos de puertas del octógono con cada torre).

**El 3 × 3 es del núcleo** (vuelta 3, fase 1, `core/map/recinto.ts`): ninguno en el borde,
ninguno a menos de 5 de otro y nada dentro, así que ya no hay recintos que se toquen (eran s2, s3,
s13, s16, s21, s36 en 1-40 y s50, s62, s105 fuera) ni nodos entre las casas (s98, s105). El héroe
de salida nace en la casilla de su ciudad, en el medio, con los pies sobre la piedra
(`LIBRE_BAJO_EL_HEROE`), y sale por una puerta (en la fase 1 nacía delante de una puerta: antes,
en una vecina de la ciudad, de pie sobre las casas, en 80 de 80). La senda que pasa junto a un
recinto sin entrar, también sin cruzar el octógono, se corre a `FUERA_DEL_ROCE` con los puntos de
en medio (`sinRoces`; la que bajaba por la columna de al lado pisaba la torre de la esquina, s3,
s36). Medido en 1-40 (21-10-2026): 205 ciudades (48 ciudades-puente), de 11 a 19 casas (mediana
16), con 1/2/3/4 puertas 12/104/86/3; generar, mediana 40 → 46 ms. Fuera de 1-40 queda `recintoSobreSenda`
en s54 (4), s77 (1), s82 (3) y s90 (10) de 41-110 y en s27 (5) y s30 (1) del 26×26 1-30 (medido el
21-10-2026; s53 y s91, que eran los de antes, ya salen a 0).

**Y se entra por sus puertas** (fase 2, 21-10-2026): el núcleo
dice qué puertas hay (donde llega un camino) y el héroe solo pisa del recinto la puerta y la
ciudad.
Medido en 1-40: 208 ciudades (46 ciudades-puente), todos los guardias de la escena a 0 (también
en la lista de `caras-cortadas`); generar, mediana 45 → ~58 ms y total +16 %, 0 sin mapa, y el
26×26 en 200 de 200. Sin la hoja `recinto`, marcadores y `modulosQueFaltan` lo dice.

**Árbol = no se pasa** (14-10-2026, marcas de s1 (2,23) y (1,23)): lo que se pisa, de cualquier
suelo, no lleva árboles (`APARTE.cubierta` no admite `ARBOLES`; la mancha es de matas), y en las 8
vecinas de un bosque va en mancha de matas, tupida y baja (`orillaDelBosque`; el `lindeDeBosque` que
sembraba pinos y frondosos a √5 de todo bosque se fue). `informe.arbolesSobreLoPisable` = 0 (51 358 en 1-40 antes).
Un árbol es la hoja o el módulo (`esArbol`): la cubierta tampoco lleva sus módulos que son árboles
(`ARBOLES_DE_LA_CUBIERTA`, mirados uno a uno: los abetos en miniatura de la nieve, 1-4, y el árbol
seco de la arena, 5; `modulosDe` los quita de su hoja en todo sitio, y el test guarda la huella de
cada hoja de cubierta para que un arte nuevo se vuelva a mirar). Eran 9 451 sobre la nieve que se pisa
y 358 sobre la arena en 1-40, y 394 en lo que no se pisa (vuelta de QA 1, 14-10-2026).

**La nieve que se pisa, sin sus peñascos grises** (vuelta de QA 2, H9, 16-10-2026): sin los abetos,
los módulos 5-8 de `cubierta-snow` (roca gris con nieve) eran 13 230 de sus 37 187 piezas en 1-40 y
el 40,5 % de lo que cubría la nieve que se pisa de s1, 3 y 7, y al tope de alejar el Valle Hondo de
s3 se leía como la sierra de su sur. En lo que se pisa no van (`FUERA_DE_LO_QUE_SE_PISA`): mandan
los montones blancos y las matas nevadas; lo alto del acantilado y el pie de la muralla los siguen
llevando. Lo gris de esa cubierta, 40,5 → 0,2 % (lo que asoma de lo alto); su suelo desnudo, 35,1 →
34,1 % (alfa de las cajas a 16 px). La lava y la arena se miraron al tope: su cubierta es la roca de
su barrera, pero rala y tumbada (#184), y se distinguen por el alto y la densidad.

**Toda casilla de bosque lleva su árbol** (`informe.bosqueSinArbol` = 0, sin contar las que tapa en su
mitad la imagen de un objeto o por su centro una pared): las 93 sin ninguno de 1-40 estaban todas junto
a una ciudad, la mitad al sur, donde su reserva no deja ni un pie, y se leían como un parche de tierra
junto al camino (s1 (14,24) y (28,35)). Ahí el árbol va como la pared de #221: si no tapa el objeto (su
caja no toca la de ninguno) ni su camino (`arbolEnLaReserva`, con el índice sin las reservas), en el
sitio del relleno donde sale más alto; en 1-40, 59 → 0.
Bajo el bosque, **el sotobosque** (`sotobosqueDe`, `escalon.ts`; `Escena.bosque`): una máscara del
escalón con la receta de lo mojado del agua (`porNivelesBajoElTecho`), cerrada donde lo alto se
adelanta, en `multiply` de `#5b6b3c` a 0,5. Toda máscara del escalón se copia solo por sus trozos
con alfa (`trozosConAlfa`, contados una vez por máscara): el pintor, con el sotobosque, 6 311 → 5 752
ms de mediana a 120 px (s13, 2 y 9 alternadas; 14-10-2026). Suelo desnudo de s1/3/7:
20,6/21,0/25,6 → 23,3/23,7/27,7 % (con la orilla del bosque en claro, 30,7/25,7/29,4: el usuario
eligió la mancha de matas); sin los abetos de la nieve, 23,2/22,5/27,3 %, y el de la nieve que se
pisa de s1, 3 y 7, 36,9 → 34,2 % (los peñascos y montones que salen en su lugar son más anchos); sin
sus peñascos y con los pasillos de dos de hondo, 23,2/22,1/27,0 % (16-10-2026). Tope de alejar:
`topeDeAlejar`, ≤ 2 000 volúmenes a la vista y nunca bajo 40 px por casilla;
si ni a 110 px caben (7680×4320) lo avisa en consola.

**Y un presupuesto de
píxeles según el zoom** (`presupuestoDelMapa`): al tope de alejar, el mapa no
pinta más de `PIXELES_DEL_MAPA` (1,5 M) píxeles de dispositivo por fotograma y
en una pantalla mayor baja la densidad (`preparar(presupuesto)`, que lo pide
con la caja de ahora); acercando, cabe (tile/tope)² veces más, y cuando cubre
el lienzo entero —hasta `PIXELES_AL_ACERCAR` (3 M, 2560×1440)— se pinta a
densidad plena, con un paso de rueda de holgura para salir
(`presupuestoConHolgura`). Es plena o nada; en 4K se queda el presupuesto
(densidad 0,46, decisión del usuario).
El taller (`pnpm taller escenario N`) pinta con la misma `separar`.

**El pasillo de la senda** (`pasillo.ts`): la tabla `APARTE` (`colocar.ts`) dice por clase qué media anchura respeta —cubierta, roca y orilla 0,16 (media `ANCHO_DE_SENDA`) + `MARGEN_DE_SENDA` (0,3); masas 0,16 + `MARGEN_DE_MASA` (0,2); muro, pared y objeto, ninguna—, su mínimo al encoger y sus hojas. Se mide el rectángulo del sprite (`cajaDeSprite`) contra el trazo suavizado.

**Lo que no se tapa es un solo índice** (`Obstaculos`, #151) de formas, cada una con su regla (`Forma.mide`: media anchura, y rectángulo o solo el pie): la senda y la rampa de cada bajada (`formaDeLaSenda`, la de `APARTE`), el tablero de cada puente (`formasDeLosTableros`, solo lo que va delante), el eje de cada paso (`formaDeLosPasos`, solo volúmenes), la reserva de cada objeto (`reservaDe`, un trazo de un punto de `RADIO_DE_OBJETO`: el pie de lo que se aparta y, si es un volumen que se pinta después del objeto, su rectángulo; un árbol o un pico al sur ya no tapa la mina) y, como tope (`Tope`, una regla sobre el ancho y no un trazo), **lo que se pisa** (`topeDeLoPisable`, 14-10-2026): la copa de la masa no entra por los lados más de `MARGEN_SOBRE_LO_PISABLE` (0,2) en una casilla que se pisa de la fila de su pie, en cuenta cerrada (`altoPorLosLados`, la regla de la puerta y del contador `sobreLoPisable`; lo que sube al norte es perspectiva, #185), salvo sobre **un pasillo estrecho** (vuelta de QA 1, decisión del usuario, 14-10-2026): la copa no tapa más de `TAPADO_DEL_PASILLO` (0,4, por su caja, desde abajo) de una casilla que se pisa sin nada que se pise al norte, o ni al este ni al oeste (`pasillosEstrechos`, `altoSobreLosPasillos`): el pasillo de este a oeste de una casilla y el rincón, que la copa de la fila de su sur borraba (s1 (29-31, 17), un paso). `informe.pasillosTapados` = 0 (2 398 masas en 1-40 antes; casillas así tapadas en un 80 % o más por las cajas, 203 de bosque y 79 de montaña → 0; las 65 que quedan son de cumbres).

**Y la de abajo de un pasillo de dos de hondo** (vuelta de QA 2, H10, decisión del usuario, 16-10-2026): lo que se pisa al norte, pero no al norte de esa ni al sur de ella; de tres de hondo o más sigue siendo lo ancho. Tapadas en un 80 % o más por cajas de masa sin cumbre, en 1-40: 139 de bosque y 57 de montaña → 0 (con las cumbres, 55 de montaña); el árbol más alto de la casilla de bosque de debajo, 1,11 → 1,02 de mediana, y el pico de montaña, 0,67 → 0,63; `cumbresSobreLoPisable` 467 → 485. El borde casi no baja: el árbol más alto de cada casilla de bosque bajo un pasillo, 1,09 → 1,00 de mediana, y el pico de montaña, 0,57 → 0,53 (solo se encogen los pies del 0,4 de arriba de la fila). Las cumbres (`Sprite.cumbre`: las de #204 y el pico que sube `unoQueDomine`) no miran ni lo uno ni lo otro (`informe.cumbresSobreLoPisable`, medida: 467 en 1-40, 288 de ellas sobre un pasillo, como s3 (4-5, 18)), el dardo de la masa no baja del mapa y `informe.masaSobreLoPisable` = 0 (unas 9 100 en 1-40 antes; el p10 del alto de la masa de bosque al borde, 0,51 → 0,45). La pared y la muralla miran la reserva por sus puntos (`en`); el pedregal, su propio pasillo. El dardo y `poner` hacen la misma pregunta (`entra`); `poner` encoge (`altoLibre`), prueba el módulo más estrecho y, si no, quita. Bajo la senda va un arcén del color del suelo, a 16 px por casilla, y `informe.spritesSobreSenda` = 0.

**La huella** (`huella.ts`, #191): la senda es tierra de `ANCHO_DE_SENDA` (0,32), la textura `suelos/dirt.webp` entonada hasta la de las rampas de las bajadas y a 0,82 de alfa (toma el color del suelo de debajo), con dos orlas tenues y el borde roto por dos ruidos de la semilla (`IRREGULARIDAD_DE_SENDA`); se pinta como una cinta de ancho variable (`trazarCinta`, ~0,1 s a 120 px). En un tramo recto de `L` casillas el vaivén se multiplica por `min(1, 2,5/L)`, nunca bajo `VAIVEN_EN_LO_RECTO` (0,3): en lo recto de 1-40 bajó de 0,105 a 0,030 casillas.

**Las murallas** (`muralla.ts`, #183, #197, #207): cada franja de muro lleva la línea de su frontera, no su esqueleto (`trazaDeMuralla`): tiradas rectas de mínimo coste (una esquina vale `ESQUINA` = 3 casillas, por el medio de la franja y, donde cambia de nivel, por lo alto: `AL_PIE_DE_LA_CARA`) que unen, como un árbol, sus puertas (de través a su paso) y sus **apoyos**: el grupo de casillas que toca una misma cosa de fuera —otra barrera o su nodo, el borde, la huella de una ciudad o un pueblo, a la que se llega por debajo— y dos lados pisables (`Alrededor`, `alrededorDeMurallas`, que deriva el lado de cada casilla del terreno). Las puertas de una franja son las de sus 8 vecinas por coordenadas, no por índice (con el índice, la puerta de la columna 0 era de la franja del borde contrario: la fuga de s443). Un paso en diagonal nunca pasa entre dos casillas pisables, que son del mismo lado (s730). Donde la línea deja que un lado llegue a otro (`fugasDe`), se añade el sitio que más fugas cierra (el apoyo que toca a los dos, uno que la fuga roza, o lo más estrecho entre ellos) y, si por lo alto no cierra, se traza en llano; lo que cuelga sin llegar a nada se poda (`sinEspolones`). Una franja sin puerta que no separa dos lados, o sin nada a lo que llegar, no lleva línea: es escombro (#232; el generador ya no las hace, y la de un plan del agente se lee como ruina). Lo que no pisa la línea es escombro: ni espolones ni un segundo muro. El tramo recto se apoya por el medio del paso; el diagonal, por su punta baja en la casilla de abajo. Torre obligada en cada junta, también a 45° (`esquinasDe`: sin ella la junta se ve abierta) y en cada punta de norte a sur (sin ella el tramo es un raíl), `torresObligadas`; en las demás puntas y en lo recto a `ENTRE_TORRES` (3); nunca junto a una puerta ni bajo una ciudad, salvo **la punta que toca su apoyo** (#232): montaña, acantilado, agua o el borde (`puntasContraSuApoyo`), que lleva su torre corrida `ARRIMO` (0,25) hacia él, también junto a la puerta, para que el lienzo no acabe a media casilla de la montaña (s36 (21,20)).

**Nunca dos torres apiladas** (`seApilan`): a una casilla o menos, ni en la misma columna a dos o menos, que la cámara pone una encima de otra. La punta de otro eje o la casilla sola que se apilaría con una obligada, de su línea o de otra franja, se queda sin torre; la línea no dobla a menos de eso de su esquina anterior ni de una obligada ya trazada (de norte a sur, tres), salvo junto a una puerta o bajo una ciudad, y si así no llega o no cierra, dobla (`seguidas`). Si quedan pegadas, prueba a empezar el árbol por otro terminal. Un tocón de norte a sur de dos casillas o menos hasta la siguiente torre se quita (`sinTocones`), salvo si es toda la línea. La línea no dobla donde la torre no cabe de ninguna manera (`esquinaCabe`) y paga por doblar donde no cabe entera. Ningún tramo se salta por una reserva (`meterEnLaMuralla`): el que llega a una puerta, o cae en la reserva de otro objeto, se pinta en su sitio y se ordena justo antes que él (`ordenadoEn`), que queda encima. La puerta va centrada en su nodo (su ancla derivada es el pie de una torre). De norte a sur, el tramo es de lado (`muro-ns-1`/`-2`, 1,6 de alto por el medio), y los pasos seguidos de una columna van en una tirada (`tiradaNorteSur`, 21-10-2026: «los muros perpendiculares están mal, están como partidos por el medio»; una pieza por paso enseñaba su testero en cada junta sin torre ni puerta, 5 tiradas en 41-120 y ninguna en 1-40; la tirada de tres pasos se inclina lo que el arte, ~0,4 casillas de punta a punta), y la puerta (`nodo-puerta-hondo`) va a 2,6 de alto por el pie de su arco (`PUERTA_NORTE_SUR`); la ruina sigue con el `profundidad` de su hoja. El resto de la franja es escombro (`rocas-caidas`), nunca la cubierta del suelo vecino. `informe.murallasPartidas` = 0 en 1-40, contado sobre lo PINTADO (`informe.muralla`): fugas (un lado que llega a otro por la franja sin cruzar lo pintado, en una rejilla de 4×4 por casilla, el tramo de media casilla a cada lado y de cabo seco), puertas sin tramo hacia un lado de su paso con muro, y trozos de más de una línea (lo que llega a una ciudad se une por ella). `informe.murallaIncoherente` = 0 en 1-40: espolones (puntas de una franja que separa dos lados sin llegar a nada), juntas de dos ejes sin torre y puntas de norte a sur sin torre (`puntasSinTorre`). `informe.torresApiladas` = 0 en 1-40 (`apiladas`); en 1-1000 quedan 13, en 12 semillas, todas de dos juntas que la franja obliga (un escalón de una fila) (2026-10-08; eran 3 138). En 1-1000, `murallasPartidas` = 0 y `murallaIncoherente` = 0. Ninguna senda entra en una casilla de muro salvo por su puerta (como mucho 0,06 de vaivén).

**La torre no tapa la senda** (#193): la que la pisa (`sendaParaLaMuralla`, la senda pintada sin arcén, a `SEMIANCHO_DE_LA_HUELLA`: su borde más abierto) no se pone y va la siguiente candidata (`torresDe(…, cabe)`); la de una casilla sin tramos o de una esquina, que va siempre, se encoge hasta `TORRE_MAS_BAJA` (0,45) y, si ni así cabe, se corre dentro de su casilla (`CORRIMIENTOS_DE_TORRE`, `torreQueCabe`). El lienzo no se aparta: lo alto del último tramo puede quedar delante de la senda que rodea su punta. `informe.murallaSobreSenda` = 0 en 1-40 (`murallaSobreLaSenda`: torres que la tapan y tramos que la cruzan fuera de una puerta).

**Los hitos** (`nodos.ts`): todo nodo de acantilado, de bosque y de montaña lleva uno (`HITOS`, por su id), sin tope, porque un nodo neutral no lleva bandera (354 en 1-40: 119 de acantilado, a 5 casillas o más unos de otros, 114 de bosque, que acercan cuatro pares a 4,1-4,5, y 121 de montaña: son nodos distintos y cada uno se toma).

**El paso de bosque y el de montaña no llevan pieza** (#196, #203): el portillo de abetos verdes desentonaba en la nieve y en los demás bosques, y la mitad de esos pasos separan dos suelos con dos hojas de árboles; la garganta de `nodo-paso-montana` iba de norte a sur y solo 2 de 23 nodos de montaña se cruzan así (el camino entraba bajo la roca por un costado, y en la nieve salía parda). Los abre la propia masa por su eje, su reserva es de `RADIO_DEL_PASO_SIN_PIEZA` (0,5, no la de 0,95 del nodo: abría un claro redondo; `radioDeLaReserva`), y lo leen el hueco y el hito. `informe.pasosAtravesados` = 0 (la pieza del nodo, si no es hito, no pisa su eje; eran 121 en 1-40). Sigue en `BARRERAS_CON_PASO_A_LA_VISTA`. La tablilla apunta por el eje del paso (`tablillaDelEje`: al fondo antes que a la cámara; en el este-oeste, por el sitio), una pieza por rumbo y nunca espejada; el miliario va entonado (`TONO_DE_HITO`). Tomado el nodo, su hito no se pinta y en su lugar va la obra de su puesto, en el sitio que reservó `componer` (fila «El puesto en la escena»; 05-11-2026).

**Los pasos se ven** (`pasosALaVista`, `ejeDelPaso` en `nodos.ts`, #173): cada nodo de montaña, bosque o muro, con camino o sin él, abre un pasillo de `SEMIANCHO_DEL_PASO` (0,36, el de las masas) a lo largo de su eje, de la segunda casilla de una entrada a la de la opuesta (el orden de `ejeDelNodo`). De él se apartan solo los volúmenes: la masa se encoge o se quita, y lo bajo se queda a `UMBRAL_DE_VOLUMEN` como mucho, para no abrir una franja pelada. `informe.pasosTapados` = 0.

**Sin trocha** (#227): el paso sin camino no lleva huella. La trocha de #190 (una línea recta de tierra por el eje de cada nodo de bosque, montaña o acantilado sin camino) no se entendía («¿qué es esa franja?», s55 (3,17)); el paso lo dicen el hito y el hueco del eje, y lo bajo (los abetos de 0,6 de la nieve) vuelve a quedarse en él, como en el pasillo de los pasos.

**El relieve por celdas** (R4, `celdas.ts`; `docs/agents/2026-10-07-relieve-esquinas/`): el nivel por casilla sale de `relieve()` (el de su región; ver «Los acantilados») y las paredes, de cada vértice: por umbral, un caso de 4 bits (`celdas`; la silla, «el alto une»; el mismo tipo en dos grupos seguidos es una pared). Cada pared va de junta a junta, en el medio de un lado de casilla, y la clase de la junta la fija el lado (`JUNTAS`: en la S el pie cae a plomo, en la E u O con el talud de `TALUD_DE_LADERA`). `caidas` las encadena: las S en `Cara` de media casilla en media casilla (`paredes-*` libres, que no salen de su tramo más de `SALE_DE_SU_TRAMO`), las E y O en laderas, y cada diagonal (`SE`/`SO`, `convexa`/`concava`) lleva su pieza `diagonales-<material>-<se|so>-<caída>` por sus dos filos (`spriteDeDiagonal`; un cuarto de círculo en la guía, `tools/taller/diagonales.ts`). Las de espaldas, el reborde y sus peñascos. La pared que cruza un puente no lleva pieza (`celdasBajoLosPuentes`).

**La pared nunca se corta ni se aparta de la senda**: donde un camino baja hacia la cámara o de lado va una **bajada** encima (R5, `bajadasDe`: `arriba` donde la senda pintada cruza el filo; `bajadas-<material>-<caída>/<s|se|so|e|o>`; la rampa sigue a la senda en pantalla, `rampaDe`; el rumbo es el de lo pintado, el del tramo o uno a 45°, `rumboPintado`; y la senda pintada pasa por la rampa, de su filo a su pie, y vuelve a su trazo con un enlace a cada lado, sin mover sus extremos, `sendasPorLasRampas`, #192), con la clave detrás de toda pared que pinta sobre su camino y delante de nada horneado de la casilla a la que baja: la que baja a una ciudad, pueblo, mina o nodo va justo detrás de él (`llegaA`), y lo que se pinta delante del nodo puede tapar su llegada.

**La rampa abre la pared con sus costados** (#225, §35, `rampas.ts` del taller): donde el camino del núcleo baja de frente (al sur) por un borde recto —la pared S de los vértices `x − 1` a `x + 2` de su filo, cinco casillas, una sola caída— y hay su arte (`rampa-<material>-<caída>`: piloto de roca y arenisca de caída 1), no va la bajada: va el cuerpo (la cuesta) en el hueco y un costado de casilla y media a cada lado, el muro que se hace cuesta (*wall-to-slope* de StarCraft y Warcraft III): su cara frontal, la de la frontal vecina, tiene el alto entero por fuera y baja en diagonal hasta nada en el borde de la cuesta, al pie, con la meseta bajando por encima; sin caras laterales que flanqueen el camino (`rampasDeFrente`, `TRAMO_DE_PIEZA_DE_RAMPA`, `spriteDeRampa`). El extremo de fuera de cada costado sigue `SOLAPE` (0,15) fundido a transparente, y encima va la frontal más estrecha de su material, que tapa la arista (detrás de un objeto si lo taparía); el tono, el de su frontal medido (`TONO`, `rampa-*`). Se decide por el tramo, antes de toda pared; esas cuatro paredes salen de la cara (`caidas(…, fuera)`: ni frontal ni cara pintada), la bajada baja por el medio del hueco y no lleva pieza (`enSuRampa`, `deUnaRampa`), y el costado va detrás de la frontal de al lado. Las tres piezas son una imagen cortada por su guía (registrada con su escala). `informe.rampasSinSusPiezas` = 0. Con arte salen 1 en 1-200 (s62 (4, 7)) y 19 en 1-1000, todas de caída 1, en el mapa de 42×42 (eran 5 y 27 en 34×34; 09-10-2026); con las fronteras onduladas (#229), 2 en 1-200 (s106 (34, 19), el caso del test, y s139).

**Y la de muesca** (§36): donde la casilla de debajo está entre dos altas con lo bajo delante (`HHH/HlH/lll`, la muesca de una de hondo de un nodo con camino o de una ciudad que entra por detrás; 160 de las 992 bajadas `s` de caída 1 de 1-1000 en 42×42, el patrón más frecuente de los rincones), una pieza entera (`rampa-muesca-<material>-<caída>/s-muesca`, `PIEZAS_DE_LA_FORMA`, `Rampa.forma`) sustituye sus cuatro diagonales (`PAREDES_DE_MUESCA`) y casa por sus dos juntas S, las de las esquinas de delante (`TRAMO_DE_PIEZA_DE_RAMPA.muesca`, `FILA_DEL_FILO`): la cuesta entre dos laderas en triángulo, enteras delante y a nada arriba. Las diagonales que sustituye gastan su tirada (las demás sacan el mismo módulo con su arte y sin él). Con arte (roca y arenisca, caída 1), en 42×42: 27 muescas y 1 recta en 1-200, 89 y 19 en 1-1000 (rampas de 1 a 28 y de 19 a 108; 09-10-2026); con las fronteras onduladas (#229), 11 muescas y 2 rectas en 1-200 (la muesca del test, s126 (31, 33)): el borde recto de cinco casillas y el rincón `HHH/HlH/lll` salen menos. `rampasSinSusPiezas` mira las dos formas: una pieza de cada una de su forma en su tramo, y ninguna frontal, ladera, diagonal ni bajada sobre el hueco. Sin arte o en otro rincón (un lado que sigue al sur, la muesca honda, el rincón de un lado: #228; s55 (30, 15)), la bajada de siempre. Caída 3 o más: la pieza de 2 estirada en alto (`Sprite.ancho`); sus dos filos no caen a la vez y van centrados, y el guardia acepta ese desvío y no otro (`filosEnSuSitio`). El arte está entero (todos los materiales, caída 1 y 2, §23); sin él, un marcador (`COLOR_DE_DIAGONAL`, `COLOR_DE_BAJADA`). Las guías de las diagonales llevan el labio roto en trozos (en el suroeste, oscuro: `LABIO_EN_LUZ`) y sin canal en las cóncavas, y su referencia de material es la ladera vecina (`laderas-<material>-<este|oeste>-<caída>`), no la frontal; el suroeste lleva además su hermana del sureste. Las diagonales y bajadas de basalto van con el tono de su ladera (`TONO`, §26), y la frontal (`paredes-basalto`) con el suyo (#220): sin él daba luz 71 y R−B 20 entre laderas de 54 y diagonales de 48-52 y la línea de una meseta de lava se leía a trozos; con `brightness(0.72) saturate(1.15)`, 51/50 y 16 (luz Rec. 709 media de las piezas puestas en s9/s13, 09-10-2026). La puerta es `ponerPared` (los tableros y la reserva de un objeto; lo que rechaza queda como razón declarada, `vaciaPorque`).

**La pared pasa por detrás de un objeto** (#221): en su reserva, la frontal y la ladera van si no lo tapan a él ni a su camino (la rampa de una bajada, `rampasPrevias`, o más senda escondida), encogidas si hace falta, y la diagonal, que no se encoge, se ordena justo antes que él (`ordenadoEn`); el pedregal no entra. Saltarse la reserva partía el borde de la meseta en bloques sueltos junto a las ciudades y minas de su pie.

**Ordenar no mueve** (#222): `ordenadoEn` pone `Sprite.clave`, la clave del pintor (`claveDe`, que leen `ordenDeVolumenes`, `separar`, `vaDelante` y cada pregunta de quién va antes), y el pie y el ancla se quedan donde los leen `celdasMalCubiertas` y las juntas. Con ella, la frontal y la ladera que ni encogidas dejan de tapar un objeto de su pie (`alPie`; lo de lo alto lo tapa la cara) pasan también por detrás, y la diagonal pasa por detrás del objeto cuyo camino solo taparía donde el objeto o una bajada pintan encima (`tapaElCamino(…, true)`, a dos centésimas: la bajada que llega va a una, encima); esas se juzgan otra vez con la senda pintada y las bajadas (`detrasDeUnObjeto`, una a una) y se quitan si esconden `ESCONDIDO_DETRAS` (0,3). La pared que taparía el tablero de un puente va por detrás del puente, y la que un puente solo toca en la punta de su filo (la junta por la que pasa todo puente de norte a sur o de este a oeste) lleva pieza (`celdasBajoLosPuentes(…, true)`, `juntoAlPuente`, con su propio azar). `informe.carasCortadas` (tiradas de frontal de ≤ `CABO_SUELTO` (2,5) con una punta en el llano a ≤ 2 de un objeto) 72 → 18 en 1-200, 13 → 4 en 1-40 (#221, 34×34); en 42×42, 23 → 4 en 1-200 y 2 → 0 en 1-40 (#222, 09-10-2026): quedan esquinas cuya diagonal taparía el camino que sale de su pie (s105, s174) o el de una bajada de muesca sin arte (s143, basalto). Con las fronteras onduladas (#229) y #222 juntos, 1 en 1-40 (s32) y 5 en 1-200 (s32, s64, s68, s141, s190); sin #222, esos mapas daban 5 y 20. `sendaBajoElRelieve` 227 → 231 en 1-200 (otro vestido de las sendas apartadas), 50 en 1-40. La casilla de barrera que tapa una pared por el centro tiene formación (`casillasDeBarreraSinFormacion`, 3 → 0 en 1-200). La senda tapada por una pared que tapa encima un objeto no cuenta como bajo el relieve (`loQueTapa`).

**El nodo entre dos niveles sin camino es una rampa** (#143): su bajada va por su eje (`tramosDeLasRampas`), sin senda que seguir (`deUnNodo`): la tierra la lleva la pieza. Una cordillera sin cumbre (no cupo) con más de `MAS_CUMBRES` picos a 0,8 del mayor sube el más alto que pueda, sin azar (`unoQueDomine`). `informe.celdasMalCubiertas`, `bajadasSinPieza`, `bajadasTapadas`, `bajadasSobreNodo`, `rampasDesviadas` y `nodosSinRampa` = 0. Como la pared no se aparta, es el trazado del núcleo el que se aparta de su pie (#189): `recargosDelTrazado` (`caminos.ts`) cobra 3 rectos de más por un acantilado al N, NO o NE de la casilla, 1 por una montaña o un bosque y 2 por el borde del mapa (una Y junto a una hoja cobra también el mayor de sus esquinas). Y la senda pintada se aparta, dentro de su casilla, de lo que la tapa (#206, `apartarDeLoQueTapa`, `sendas.ts`): por eso las paredes (laderas, diagonales y frontales; las frontales con su propio azar) se ponen **antes** que la senda y su pedregal después; cada punto bajo una (`loQueTapa`, la misma regla que el contador) se corre hasta `APARTE_DE_LO_QUE_TAPA` (0,35) al lado libre, en rampas de una casilla, sin mover sus extremos, ni lo que va junto a la rampa de una bajada, ni pasar a una casilla de barrera o de edificio, ni arrimarse más de lo que estaba a un acantilado, un muro o una cordillera a menos de media casilla (`LEJOS_DE_LA_BARRERA`: la roca de lo alto de #205, la línea de la muralla y las cumbres de #204); dos pasadas, que miran la senda de partida. `informe.sendaBajoElRelieve` (tramos de ≥ `SENDA_CORTADA` con la huella entera bajo la silueta de una frontal, ladera o diagonal) no es 0: techo de media 5 por mapa (1,2 en 1-40 con menos mesetas, #210; 4,5 antes; 6,3 sin apartarla, con los niveles del mapa de #143; 9,1 antes; 12,5 antes de #189).

**Las caras** (`caras.ts`, #159): la cara de un acantilado no es la banda entera: por columna, cada `PASO_DE_CARA` (0,05), se pinta el tramo seguido que tapan sus paredes, de lo alto de su silueta (`Modulo.perfil`, 32 franjas que deriva `pnpm taller catalogo-escena` con `perfilDeModulo`) a lo bajo de su caja, con juntas de hasta 0,15 (`pintadaDeCara`). Donde no hay pared, se ve el suelo de abajo. El pedregal de una cara sin pared ni ladera a 0,3 toma el tono de su suelo (`tonoDelPedregalSuelto`, #170). `informe.carasLisas` = 0.

**Las laderas** (§20): cada cadena E u O lleva `laderas-<material>-<lado>-<caída>` (nunca espejada; caída > 3 usa la de 3), corrida media fila, con `inicio` al norte y `fin` al sur donde remata —sigue de espaldas o con una caída menor; en el borde del mapa no remata, el desnivel sigue fuera del marco (#212)— y `medio`/`largo` sin repetir el vecino. La `esquina` de §20 ya no entra (dobla la diagonal). Cada módulo trae sus `JuntasDeLadera`, registradas sobre la guía por `pnpm taller derivar-relieve` (también las de las diagonales y las bajadas) y comprobadas al cargar el catálogo (`catalogoValidado`); `colocarLadera` pone el filo en `bordeDeLadera` y el pie en `pieDeLadera`, sin correrse ni encogerse; lo que no entra se prueba con un `medio`. Un barranco de una casilla no lleva laderas (`sinBarrancos`): van los peñascos del canto. `informe.laderasEnfrentadas` = 0.

**Los acantilados y el relieve** (`relieve`, #143): el nivel es del mapa y la escena lo aplica sin inventar nada. Lo que se pisa va al de su región; un nodo, al de sus regiones y, entre dos niveles, el paso sin camino al alto: es un hueco en el borde de la meseta y su rampa baja de él (al bajo era un pozo con paredes a los lados, s443 (25,10)); el nodo con camino y la ciudad, al bajo (al alto, las rampas de camino dejaban lo alto del acantilado sin roca); cada casilla de barrera, al más alto de **las dos regiones que separa ahí** (las más cercanas por dentro de su franja 8-conexa; `nivelesDelRelieve`, en `core`, la misma regla que mira el generador): **el acantilado es el borde de la meseta**, a su nivel y cubierto de roca, y la cara cae a su pie del lado bajo (por franja, el trozo entre un 1 y un 0 de una franja que tocaba un 2 lejos subía a 2, una cresta: s1 (14-18, 1-9)); **el agua, plana y sin encajar** (#210): cada franja a ras de la más baja de las regiones que toca, la de dentro de una región a ras de ella (encajada un nivel bajo su orilla más baja dejaba toda lengua de la orilla baja y toda ciudad del cruce por encima del agua, y entre dos mesetas cañones de caída 3: 351 lados en 10 semillas; ahora la caída máxima es 2 y entre dos regiones al mismo nivel el río va en el llano). Ninguna barrera ni nodo de una casilla de ancho queda por encima de sus dos vecinas de un eje: baja a lo más alto de ellas (el espolón de una montaña o un acantilado en lo bajo; el paso sin camino con agua a los lados, que entonces baja y su rampa sube de él). Fuera las crestas por encima de las dos orillas, los cañones entre dos llanos, las mesas, la escalera que subía lo que se pisa y el «+1 a ras» (`acantiladosARas`, #174, se retira con ellos; eran 98 de 258 franjas de acantilado entre dos llanos y 250 mesas en 1-40). `informe.nivelFueraDeSuRegion` y `desnivelesSinBarrera` (dos casillas vecinas que se pisan a distinto nivel sin ser la rampa de un nodo) = 0.

**El borde de la meseta, entero** (#212, `bordes.ts`): la espalda (el reborde al norte, que la cámara no ve) de **toda** meseta, no solo del acantilado, lleva una hilera de peñascos de la roca de lo alto y la sombra del desnivel (abajo, #211); **el canto** (#219, `cantoDeLaEspalda`, `CANTO_DE_LA_ESPALDA`): cuatro por casilla, seguidos a lo largo del filo, el pie a 0,04-0,1 del lado y de 0,42-0,58 de alto, con su propia corriente de azar (también el módulo: con la de siempre movía toda la cubierta); en el acantilado, encima de su hilera de siempre. En 1-40, de 2,45 a 4,17 peñascos por casilla de reborde que se pisa o de acantilado (09-10-2026); donde no cabe ni el peñasco más bajo (una senda por el canto, la reserva de un objeto) queda como razón declarada; `informe.espaldasSinReborde` = 0 (eran 795 en 1-40). Las mesas de arenisca (`esMesa`: más anchas que `ANCHO_DE_MESA` = 1,3 veces su alto) son del acantilado y la cordillera de arena va con agujas (`informe.mesasEnLaCordillera` = 0, eran 1 444). La ladera sigue leyéndose como cresta por su dibujo: el arte está pedido (`docs/art/peticiones.md` §34).

**Lo alto lleva roca** (#205) **de su cara** (#212, `materialDeLaCima`: la de la casilla más cercana de su franja que cae a la vista; con la de su suelo, s57 llevaba picos grises sobre un cantil de arenisca; `informe.cimaDeOtroMaterial` = 0, eran 1 431 en 1-40): cada casilla de acantilado, un pico de esa roca de `ALTO_DE_LO_ALTO` (0,4) o más, y dos en el borde de una meseta y tres dentro (`cimaDeRoca`, `picosDeLaCima`), donde quepan sin pisar senda, paso ni reserva; en lo alto de la arena y la lava (`comoLaBarrera`) la cubierta del relleno se cambia por roca (`rocaEnLoAlto`). Todo eso, con su propia corriente de azar (`azarDeLoAlto`): con la de siempre movía las cordilleras que se visten después. `informe.acantiladosLisos` (casillas de acantilado sin roca ni masa de 0,4, fuera de la huella de un objeto) = 0 salvo 2 en 1-40, entre dos sendas (eran 1 167 de 4 016).

**La pared, de la roca de su meseta y entera por delante de la cordillera** (#216, `bordes.ts`): la casilla de barrera alta lleva el nivel de su lado alto pero su suelo (`Analisis.suelo`) es el más cercano de cualquier nivel, a menudo el de abajo; la roca de la pared, de lo alto (`materialDeLaCima`) y de cada macizo (`materialDeLosMacizos`) sale de `sueloDeLaMeseta`: lo que se pisa más cercano **a su nivel**, sin los nodos (la meseta de arena de s5 (2-8, 27-31) acababa en una pared gris; `informe.caraDeOtroMaterial` = 0, eran 806 de 2 506 paredes en 1-40). El suelo pintado bajo la barrera sigue siendo el más cercano. Y ninguna masa (pico o árbol) que se pinte después de una pared del desnivel cubre su silueta (`formasDeLasParedes`, en `obstaculos`: columnas por el perfil, `MARGEN_DE_LA_PARED` 0,05): se encoge o no va; lo de detrás no se mira, lo tapa la pared. `informe.paredesTapadas` (`paredesTapadasPorLaMasa`, frontales, laderas y diagonales sin pedregal ni bajadas) = 0 en 1-40 (eran 653 de 1 939; bajo una montaña, 424 de 757, un 24 % de su silueta). Las casillas de montaña sin un pico de 0,6 pasan del 26,9 al 28,0 % (08-10-2026).

**El agua se lee al alejar** (#205): más clara y azul (`FILTRO_DEL_AGUA`, `pintar.ts`), la ciénaga algo más oscura y su niebla a 0,1.

**Los puentes** (`puentes.ts`): `analizar` decide qué nodos llevan puente (`Analisis.puentes`: los de barrera `water` del mapa; `pasos`, esa barrera y el eje, sobre el terreno del mapa) y su casilla es agua en la escena (`Analisis.terreno`). La pieza `puente-<piedra|troncos>-<eje>[-sube]` sale de las orillas que une (`puenteDe`), de piedra si lleva camino; los quebrados —los planes del agente y el ~1 % del procedimental sin eje— se asientan con `asentar` (escala 0,7-1,15, el medio del tablero como se ve en la casilla del nodo). Se apoya por el centro del tablero con las medidas de su JSON (`pxPorCasilla`, `alturaDelTablero`, `largoDelTablero`, `pnpm taller derivar-puentes`). La senda acaba en sus estribos (`tramosHastaLosEstribos`) y llega por tierra (`Escena.vados`, `informe.sendasDeEstriboEnAgua` = 0). La pared que cruza la línea del puente por dentro de su filo no lleva pieza (`celdasBajoLosPuentes`); la que solo toca, por detrás del puente (#222).

**Qué tapa un tablero** es una regla, la del pintor (`vaDelante`: `esVolumen` y `ordenDeVolumenes` de `separar`), en el pasillo de lo que se aparta y en `ponerPared`; la cara se pinta solo bajo la silueta de su pared (`CaraDeEscena.pintada`, `caras.ts`). `informe.puentesTapados` = 0, contado desde el orden del pintor. La marca del dueño cuelga de `Escenario.asientoDeObjeto`, siempre un punto, y el puesto de un nodo tomado, con su bandera, en el extremo de atrás del tablero (`Puente.puesto`); quien pisa un puente se pinta en él (`pisada`). Un clic sobre el tablero va al nodo (`puenteBajo`) solo si debajo hay agua o la casilla del nodo: la tierra de una orilla manda.
