# El mapa (el núcleo)

Se lee antes de tocar: `src/core/map/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### Validar un plan de mapa (agente y procedimental)

`validateMapPlan` → `problemasDeRed`, y antes lo que no lee la red y la estropea (el pueblo del muro mal puesto, `problemasDeLaEntrada`: la causa antes que el síntoma, #340, 11-11-2026); los motivos de la red nombran el pueblo por su nombre y su casilla (`quienEsElNodo`), no por su `village-N`, que el agente no escribe; los jugadores y la base de cada uno, `basesDelPlan` (los dueños de ciudad por id, con su primera ciudad: lo leen la validación, `newGame` y el servidor)

### Qué barrera cruza un nodo

`MapObject.barrera`, que pone `buildMap` con el muro que abre; el procedimental escribe ese muro con `queCruzaElNodo`

### El río del procedimental (antes que las regiones; nadie lo corta)

`trazarRio`, `regionesDelRio`, `nivelesDelRio`, `rioEntero`, `orillaDeLaCiudad` (`core/map/rio.ts`: la ciudad del cruce aún en el río, en la red; el vestido la muda a tierra, `enSuOrilla`); el puente de la ciudad-puente, `rioAnteLaCiudad` (`recinto.ts`), y en la escena, `puenteDeLaCiudad` (`puentes.ts`, `Puente.ciudad`); la única escritura de la rejilla del vestido, `ponerTipo` (`vestir/base.ts`, que lanza si se toca el río; lo vigila `invariantes-partida.test.ts`); medido sobre el mapa, `riosDelMapa` (`tools/qa/medidas/rios.ts`)

### Qué línea deja dos regiones a dos pasos (el acantilado entre dos niveles; el agua a ras de la más baja, que se ve)

`lineasQueSeparan`, `separadasDeCerca`, `aguaALaVista` (`vestir/base.ts`): el paso 7d y todo lo que abre una barrera (`abrirLinea`, `quitarEspigas`, `puertasSinMuesca`, `abrirEsquinasTorcidas`); el agua entre dos niveles, solo el 7d (`aguaEntreNiveles`); en el mapa hecho, `auditarMapaDenso` (`test/regiones.test.ts`)

### Caminos de un plan al mapa

`caminosDelPlan`

### Lo explorado y lo que se mira ahora (la niebla por regiones, 02-11-2026, `docs/agents/2026-11-02-niebla-por-regiones/`)

lo explorado se descubre por **regiones enteras**: qué casillas descubre la región `k`, `zonaDeNiebla` (las suyas, las barreras que tiene más cerca, `regionMasCercana`, y sus pasos: cada nodo que la rodea, el recinto entero de cada ciudad y el puente de una ciudad-puente), qué regiones descubre quien está en un sitio, `regionesQueDescubre` (la suya; sobre un nodo, todas las que une, y en cualquier casilla del recinto de una ciudad o en su puente, las de la ciudad: vuelta 1 de QA, H4), y si una está descubierta, `regionDescubierta` (por una casilla testigo: no se guarda), en `core/map/niebla.ts`; la única escritura de `fog`, `descubrir` (con `revealEverything`; lo vigila `invariantes-partida.test.ts`), que apunta en `memory` los objetos de la zona. Lo que se mira AHORA, `visibleNow`/`visibleNowAt` (atadas casilla a casilla): el cuadrado de `HERO_SCOUT_RADIUS` (5) de cada héroe y de `NODE_SCOUT_RADIUS` (6) de cada castillo y nodo propios (`miradasDe`) **sobre lo explorado**; lo refresca `mirarDesde` (`memory` y `recordarAsaltantes`). Lo llaman `revealAround`, `revealAroundTown` y `revealAroundNode` (al empezar el turno y al tomar el sitio, en `tomarElNodo`). Lo que se apunta es el recuerdo de siempre, `recuerdoDe` (con el dueño y el ocupante de una ciudad o un pueblo). **Un héroe parado en una barrera** (la infiltración, 05-11-2026) descubre la región más cercana (`regionesQueDescubre`, la misma regla que la de cualquier casilla de barrera) y mira su cuadrado como cualquiera. Perder un sitio del muro se sabe siempre (`visibleTo`, por `from`: el dueño de ayer lo miraba desde él) y su recuerdo es ya la bandera nueva (`vioCaerlo`, en `tomarElNodo`; vuelta 1 de QA, H1)

### Por dónde se entra en un pueblo

`puertaDe`, `rodeosParaEntrar` (`map/puertas.ts`: la casilla de debajo; la mina, con dos, se fue el 21-10-2026; la ciudad no: sus puertas son las de su recinto, lo vigila `invariantes-partida.test.ts`); **el pueblo en el muro no tiene** (`puertaDe` da `null` con su `barrera`, fase 3, 05-11-2026): es un nodo y se cruza por su eje, y `sendasPorObjeto` no lo mira

### El recinto de una ciudad, en el núcleo (dónde está su 3 × 3, qué no va dentro y por dónde se entra)

`core/map/recinto.ts`, puro: `LADO_DEL_RECINTO`, `recintoDeLaCiudad` (con la ciudad en el medio, también la ciudad-puente; lanza si no cabe: una ciudad va a una casilla del borde o más; nunca se corre), `SEPARACION_DE_CIUDADES` (5, Chebyshev), las seis puertas con sus accesos, `PUERTAS_DE_LA_CIUDAD` (ni este ni oeste), hasta dónde llega su entrada, `HASTA_LOS_ACCESOS` (el 3 × 3 y el anillo de los accesos), y qué parte de ella es una casilla, `parteDeLaEntrada` (`'recinto'`, `'acceso'` o `null`; la leen `problemasDeRecintos`, `puebloDelMuroBlocker`, `ciudadesDeRegion` y el vestido —`marcarElRecinto`, el 3 × 3 de las ciudades del muro con `recintoDeLaCiudad` y el puente de la ciudad-puente—; el vestido llevaba su 5 × 5 a mano hasta #305, y esas otras tres copias, hasta #335, 11-11-2026), las que puede llevar, `puertasPosibles`, y las que **tiene**, `puertasDeLaCiudad` (donde llega un tramo de `GameMap.caminos` de un acceso a su casilla, `RedDeCaminos.une`; la del río, siempre), el puente de una ciudad-puente, `rioAnteLaCiudad` (la casilla del río a dos de ella, que se pisa: el acceso de su puerta del río, también al este o al oeste); **el paso**, `pasosDelRecinto` → `pasoPermitido` (de un acceso a su puerta y de la puerta a la ciudad; la muralla no se pisa), que lee solo `map/recinto.ts` (`pasosDelMapa`: el Dijkstra, `isEnterable`, `sePasa`; lo vigila `invariantes-partida.test.ts`) y el trazado del generador con las puertas posibles (`EntradaDeCaminos.recintos`); las regiones de una ciudad, las de los accesos de sus puertas posibles, `regionesDeLaCiudad` (la lee `estructura`; un nodo no toca la región por la muralla); el puente no se une al recinto al etiquetar (`componentes`, `componentesDelMapa`); por qué no se pisa, `muroBlocker` (lo dice `porQueNoLlega`); qué tramo de las casillas del agente entra, `tramoDelRecinto` (`tramosDeCasillas`); lo que lo impide dicho para la persona, `problemasDeRecintos` (borde, separación, nada dentro, ni pueblo, ni monstruo, ni cofre en sus accesos, una ciudad sobre el río, un camino que cruza la muralla o que entra por la puerta y no sigue, una región que llega a un acceso sin camino que entre: sin camino no hay puerta, y una región que el recinto parte; lo llaman `validateMapPlan` y el final de `vestirRed`); su primera mitad, la que no lee la red (borde, separación, el río, lo que cae dentro o en los accesos), es `problemasDeLaEntrada`, y `validateMapPlan` la corre **antes de `problemasDeRed`**: un pueblo en la entrada de una ciudad la saca de la red, y la red cantaba el síntoma («la base está dentro de la región», «el pueblo parte su región») en vez de la causa (#340, 11-11-2026). Lo leen la escena, la prosa del agente y los tests; lo declara solo él (lo vigila `invariantes-partida.test.ts`)

### Qué barreras admiten los niveles de dos regiones

`admiteLosNiveles` (`terrain.ts`), que leen `barrerasDeLaPareja`, `candidatasSinMuro` y `problemasDeNiveles`

### Franja de barrera (8-conexa, con las regiones que toca)

`franjasDeBarrera` (`niveles.ts`), que leen `relieve` y `problemasDeNiveles`

### Nivel de cada casilla de la escena

`nivelesDelRelieve` (`core`, de `MapRegion.nivel`; nada lo inventa), que aplican `relieve` y el generador (`quitarEspigas`)

### Qué muro se queda: la muralla, el cierre de un paso (generador, guardia y medida)

`lineaDeLaPuerta`, `muroDeLaLinea`, `murallasDeLaRejilla` / `murallasDelMapa`, `juntoACiudad` (`core/map/murallas.ts`)

## Reglas del juego

### Radio de vista

héroe 4 y castillo 5 en fheroes2 (`getFogDiscoveryDistance`); **regla nuestra** (#229): ×√1,5 al entero más cercano, 5 y 6 (`radioALaEscala`, `core/escala.ts`). El cuadrado, no el disco del original. **Regla nuestra** (02-11-2026, petición del usuario, «la niebla del mapa no visto vaya por regiones… una niebla de eventos en torno a héroes y nodos controlados por el jugador»): el radio ya **no explora**, es lo que se ve pasar (héroes rivales, el estado vivo de los objetos, los grupos y la crónica): 5 del héroe y 6 de cada castillo **y nodo propio**, solo sobre lo explorado (dentro del radio y en negro, no se ve). Lo explorado se descubre por regiones enteras: al pisar una región, la suya; sobre un nodo, una ciudad o el puente de una ciudad-puente, todas las que une; al empezar, las de la base (`core/map/niebla.ts`)

### Ciudad amurallada

**regla nuestra** (21-10-2026, decisiones del usuario; fases 1 y 2 de 3): cada ciudad es un recinto de 3 × 3 con ella en el medio (`core/map/recinto.ts`). Ninguna en el borde, dos a 5 casillas o más (Chebyshev) y dentro nada más que ella: ni nodo, ni objeto, ni grupo de asaltantes. **Y nada en sus accesos** (11-11-2026, #305): en el anillo de fuera del recinto (a `HASTA_LOS_ACCESOS`, 2, o menos) no va ni pueblo, ni monstruo, ni cofre, que es su entrada; el generador ya no sembraba ahí (`marcarElRecinto` y `sinUsar`, en el vestido), y desde #305 la puerta de los planes lo rechaza también al agente con la misma pregunta (`parteDeLaEntrada`). Un nodo en un acceso lo mira la red de las puertas, y los asaltantes tienen su regla. **Se entra por sus puertas**: de un acceso a la puerta y de la puerta a la ciudad; el resto del recinto no se pisa, aunque sea hierba, y la puerta y la ciudad cuestan como un camino aunque debajo haya barrera. **Hay puerta donde llega un camino** (en la cara del norte, la del sur o una diagonal, nunca al este ni al oeste), y la del puente de una ciudad-puente, siempre. La ciudad-puente está en tierra y su casilla del río, delante, es su puente. Cada región que llega a un acceso de una ciudad lleva su camino hasta ella (el generador lo traza; un plan del agente sin él se rechaza). El héroe de salida nace en su base (19-10-2026), en el medio del recinto (la casilla de la ciudad, que se pisa), y sale por sus puertas

### Lo demás de las reglas

### El mapa es una red de nodos

**El mapa es una red de nodos**: regiones cerradas por barrera
(`mountain`, `water`, `forest`, `cliff`, `wall`), pasos de una casilla entre
ellas. Una ciudad en el muro es un nodo (la base, siempre); un nodo se toma pisándolo. Una
ciudad o un pueblo dentro de una región es de quien la tenga (05-11-2026, fila «Ocupación»).

**El procedimental pone en un nodo solo las bases y las ciudades-puente** (fase 2, 05-11-2026,
decisión del usuario: «la mayoría de las ciudades deberían estar en mitad de una región»): el
cruce de tres regiones en tierra ya no lleva ciudad, y `data/poblamiento.json`
(`parejasConCiudad`, 2, inventado) parejas de regiones de fuera llevan una en mitad de la región
(`ciudadesDeRegion`, `generar/poblar.ts`): en su casilla más honda (`honduraDeLaRegion`, sin tirada)
donde quepan su recinto y sus accesos, a 5 o más de toda otra ciudad; las parejas, de las que cada
base ve a los mismos saltos y alcanza por dos caminos (`RedFina.conCiudadPosible`), elegidas con
su propia corriente (`azarDelPoblamiento`). Esa ciudad es **el centro de los caminos de su región**
(`EntradaDeCaminos.centros`): los radios salen de ella por sus puertas. La región con ciudad
lleva también su pueblo. En 1-40: 160 ciudades de región, 80 bases y 23 ciudades-puente;
generar, mediana 50 → 34 ms (26×26: 47 → 51).

**Y algunos pueblos, en un nodo** (fase 3,
05-11-2026, decisión del usuario: «uno de cada cuatro»): una cuota por mapa
(`pueblosEnUnNodo`, `{ uno: 1, de: 4 }`, inventado: con cuatro parejas de fuera, una), entre las
parejas que tienen un paso con camino de la región sobre montaña, bosque o acantilado fuera del
borde y en espejo, barajadas con la corriente del poblamiento (`pueblosEnElMuro`); su pueblo va a
ese paso y las demás lo llevan dentro. Su sitio de dentro se sortea igual y se queda vacío
(`sitiosSinPueblo`): monstruos, cofres, asaltantes y obstáculos no se mueven, solo el pueblo y los
caminos de su región. Es un nodo (`NodoDeRed.clase` `pueblo`), se toma pisándolo y se cruza por su
eje (sin puerta). En 1-100, 92 parejas de 400 (23 %; los 8 mapas sin ninguna no tienen un paso
así); generar, en el ruido (42×42 32-33 → 32-37 ms, 26×26 50-57 → 51-55). Un
pueblo da su oro solo si es del jugador, está unido a su base y no está ocupado (`rentaDelDia`). Nada del territorio se guarda: se deriva.

**Lo que solo cuelga de la base de otro** (11-11-2026, #321): `regionesTrasUnaBase`
(`territorio.ts`), las regiones a las que un jugador no llega sin cruzar el nodo de la base de otro,
solo de la red y de las bases que se le dan. La lee `lugarBlocker` (`docs/areas/mundos.md`, «Dónde
puede ir un lugar»): en 7 de 120 mapas del procedimental la casa de un bando tiene la base como
único nodo.

**Cada nodo guarda la barrera que cruza** (`MapObject.barrera`, #145): la del
muro que el plan le pone debajo y `buildMap` abre; un nodo sin muro debajo se
rechaza. El procedimental escribe ahí la que más se ve alrededor, sin el agua
si sus suelos no la admiten, y en un empate la sorteada para su pareja
(`queCruzaElNodo`, `map/vestir/fronteras.ts`). El escenógrafo la lee y solo deduce el eje
(`pasoDeNodo`); el espectador la recibe con los objetos y `adaptar.ts` lanza sin ella.
Los caminos del procedimental son **radiales** desde el centro de cada región
y entre dos vecinas **solo un nodo lleva camino**, que elige la red
(`crucesConCamino`) y traza `trazarCaminos`; los demás pasos se cruzan sin
él, y los pasos van a Chebyshev ≥ 3 de todo nodo.

**Las ciudades, no**: cada una lleva el camino
de todas las regiones que llegan a un acceso de su recinto, por la puerta de esa cara (la ciudad
amurallada, fase 2: hay puerta donde llega un camino; ~1,6 ramas más por mapa), y sale de ella
igual, como el héroe; la búsqueda no dobla por fuera la esquina de un recinto (la senda pasaba
por su torre).

**A un pueblo se
entra por su puerta** (#188): la casilla de debajo (la mina llevaba además la de la derecha, #230; se fue con las minas, 21-10-2026). La
puerta es un hecho (`puertaDe`, `rodeosParaEntrar`, `map/puertas.ts`) que leen la
búsqueda, `colocarPar` y `sendasPorObjeto`; el juego no las mira. Son hojas del árbol (no se
cruzan salvo que sean la única unión, más caro que pisar un monstruo); entrar
por una puerta no cuesta, a 45° de la más cercana un rodeo, a 90° tres y
más allá cuatro, y sus costados y espalda (`espalda`) cobran dos rectos, así
que el radio que sigue de largo pasa por delante y el objeto cuelga de él con
un ramal de una casilla (los ramales de mina y su medida, `tools/qa/ramales.ts`, se fueron con
las minas). `colocarPar` guarda la
puerta de cada pueblo, y no pone uno delante de la puerta de otro (en la fila que la cruza); si así no sale mapa, `trazarYVestir`
repite sin vetarla a los obstáculos, que es lo que salvaba el 24×24, el lado mínimo hasta el recinto de las ciudades); `ponerObstaculos` no parte una región
por uno. Una ciudad (nodo) llega desde la mejor fila que toca cada región;
la de detrás, por detrás. Los planes del agente no cambian (su `advice` lo
pide). `informe.sendasPorObjeto` = 0.

**Cada nodo entra por un eje** (`ejeDelNodo`,
`map/vestir/fronteras.ts`): dos vecinas opuestas (recta, diagonal con codo o, junto al borde, corta)
protegidas hasta la segunda casilla, y los pasillos hasta lo libre van en cruz; nada se
siembra en `n ± 2d` ni en `n + (±1, ±2)`, bajo las entradas diagonales y su reflejo (`delanteDeNodo`). El ~1 % de pasos cuya red fina no tiene vecinas
opuestas se viste sin eje. El engorde de la frontera va casilla a casilla, y donde dos regiones quedarían
a dos pasos engorda una (`engordarFronteras`, paso 4b), con el lado que engorda dado la vuelta
a trechos de `TRECHO_DEL_LADO` (4) para que el borde no copie el muro fino (#169). El paso de
cada pareja es el más cercano al medio con eje pleno (`conEjePleno`).

**El acantilado es una
línea de una casilla** (#215): el borde de la meseta. La meseta se come la franja hasta la fila
que toca lo bajo (`adelgazarAcantilados`, paso 7a; sin dejar otra región al mismo nivel a dos
pasos ni un eje de la meseta a la meseta junto a un nodo); el que se queda sin caída se abre a
su región o pasa a montaña (7a'), y el vestido con un acantilado sin caída o dos regiones a dos
pasos sin su línea en medio no vale (7c, 7d; y tras los caminos, `acantiladoSinCaida`). La línea
es el acantilado entre dos niveles y el agua del río a ras de la más baja de las dos, que se ve:
entre dos iguales (#144, paso 2) y, entre dos niveles, sin lo alto justo al norte o con otra fila
de agua al sur (paso 2b; `lineasQueSeparan`, `separadasDeCerca`, `aguaALaVista`, que leen el 7d,
`abrirLinea`, `quitarEspigas`, `puertasSinMuesca` y `abrirEsquinasTorcidas`; el agua entre dos
niveles, solo el 7d y quien adelgaza el río). Lo
bajo va **en ocho vecinas** (`acantiladosSinCaida`): las regiones son 8-conexas y la línea en
diagonal va en escalera, con el codo tocando lo bajo por la esquina. En 10 semillas, 447 de
776 casillas sin caída en cruz → 0 de 414 en ocho (88 son codos).

**La puerta de una ciudad no
muerde la línea** (#222, `puertasSinMuesca`, en 7a): en una franja de dos de hondo la ciudad se
quedaba en la fila de arriba y su puerta, entre dos acantilados, era un barranco de una casilla
donde la cara acababa en seco; el costado de la puerta con acantilado encima se abre a lo bajo y
la casilla de la meseta a dos de la ciudad en su fila pasa a acantilado (la línea, en escalera),
salvo si es pasillo o toca un nodo. Costados así en 1-1000 (09-10-2026): 59 → 5.

**Ninguna caída al sur va recta 10 casillas** (#231, `quebrarCaidas`, paso 7a'' tras los
espolones): la línea de 7a copia el borde del lado bajo y la región alta sobre el agua cae en su
propio borde, y las caras rectas largas que dejaban #229 y #230 eran todas eso. Cada fila que cae
al sur `CAIDA_LARGA` (`largoALaEscala(8)` = 10) casillas seguidas o más (`caidasLargas`, sobre
`nivelesDeLoEngordado`) se parte: cada ~`TRECHO_DEL_QUIEBRO` (5) un trozo de 2 a 5 se corre una
fila, el acantilado o la montaña hacia lo bajo (7a adelgaza lo de arriba; las puntas quedan de
codo) o el agua mordiendo lo alto. Solo pasa lo que se pisa a barrera, fuera de `RADIO_DEL_PASO`
de un nodo y de los pasillos, con dos casillas de su región detrás, y en espejo donde se puede
(el engorde no sale en espejo casilla a casilla). Lo que queda —junto a un nodo, o dos trozos que
une el agua de las esquinas al pasar a montaña (s232)— tira el vestido al final (`map/generar/procedimental.ts`).
En 1-3000 (09-10-2026), caras ≥ 10: 14 → 0; tramos ≥ 10 174 → 143, mapas con tramo ≥ 12 14 → 12.
Cuesta 6 mapas de 1-300 (otro vestido), los vestidos tirados no suben (1 846 → 1 833) y generar
sigue en 33 ms de mediana (`test/caidas-largas.test.ts`).
El nivel del engorde
(`nivelesDeLoEngordado`) pisa los nodos como la escena.

**El mapa guarda los
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
p90 ≤ 20 y 0 sin terminar» (`tools/qa/medidas/tamanos.ts`); el lado se deriva, `ladoDelMapa` =
⌊√((regiones − 1) · `AREA_POR_REGION`)⌋ (42; de 3 a 10 regiones, 30 a 63), y su inversa es
`regionesDelMapa`.

**El mapa ×1,5** (#226, 09-10-2026): `AREA_POR_REGION` 300 → 450
(`core/escala.ts`), las mismas regiones, minas, ciudades, pueblos, recursos, cofres,
monstruos y asaltantes en 42×42 en vez de 34×34; obstáculos y cubierta van por densidad.
La marcha sube con la raíz del área (un hecho, un sitio: `marchaALaEscala`). Medido en 1-100:
duración 7 / 14 / 19 → 9 / 15 / 31 días, 0 sin terminar (en 1-1000, 8 / 14 / 45 → 8 / 16 / 34,
j0 571 → 603; con ×1,35 volvía a 7 / 13 / 20); casillas pisables a ≥ 3 del camino
10,5 → 20,0 %, distancia media al camino 1,10 → 1,50; generar un mapa 30 → 95 ms (mediana).
Los largos de rectitud (#169) van a escala (`largoALaEscala`: 8 → 10, 10 → 12).

**Lo demás, también a escala** (#229, 09-10-2026): la vista (`radioALaEscala`: el 4 y el 5 de
fheroes2, al entero más cercano, 5 y 6; con 4 y 5, en 1-400 ninguna semilla tenía a la vez una ruta de
dos colores y una guardia a salvo a la que se llegue hoy, y `pnpm capturas` la vuelve a pedir a salvo)
y la patrulla de los asaltantes (`pasosDeLaPatrulla` → `deHoyALaEscala`: lo acumulado de `pasosPorDia`
×√1,5 menos lo de ayer, días de 2 y de 3, 2,45 de media; `pasosPorDia` es la cifra del mapa de
referencia).

**Las fronteras onduladas** (#229): el reparto de regiones mide cada casilla desde un punto
movido por un ruido fino (`ONDULACION`: rejilla de 2 casillas, amplitud 24/16, en enteros,
antisimétrico en el espejo, con su propia corriente, `huellaDeSemillas`) y `sinPuas` quita los dedos de
una casilla. En 1-1000, tramos ≥ 10 / caras ≥ 10 / mapas con tramo ≥ 12: 75 / 10 / 8 → 64 / 5 / 2 (lo
recto que queda es del engorde, que reparte un muro recto a trechos); más amplitud quebraba más pero
tiraba más vestidos con un llano junto a una meseta y sesgaba los suelos (con 28, la ciénaga del 13 al
11 %). Vestidos por mapa 3,6 → 6,7; generar un 42×42, mediana 23 → 35 ms. Lo que destapó, arreglado en
el generador: la Y junto a un nodo objetivo aún sin trazar se cobra (`yEnLaEsquina`), las barreras
garantizadas se recuentan al final del vestido, la puerta de un objeto puesto sin ella libre se guarda
(`guardarPuerta`) y un puente sin dos orillas enfrentadas no vale. Duración en 1-100, 9 / 15 / 31 →
8 / 15 / 21; en 1-1000, 8 / 16 / 34 → 8 / 15 / 41; 0 sin terminar.

**La ventaja del jugador 0 no
cambia** (603 de 1 000): es sobre todo **abrir el día** (+63 de 1 000, medido cambiando de base y de
facción en 4 000 partidas; la base 0 da +30 y el caballero +16); con el orden en serpiente (quien cierra
un día abre el siguiente, «Orden de turnos» en las reglas) se va a +2, y j0 gana 524 de 1 000 (duración 8 / 14 / 29).

**Sin minas (21-10-2026, «solo oro»)**: cada región
de fuera lleva un pueblo y la de casa, nada más que la base; ni minas (eran 2·regiones + 1 por
bando) ni montones de recursos. Un plan del agente con `mines` o `resources` se rechaza diciéndolo.
El agente sigue recibiendo ancho y alto, con el reparto como consejo. Un plan mide de 8 a 128 por lado
(`LADO_MINIMO_DEL_PLAN`); el generador solo sabe de 26 a 64 (pedido por lado; por regiones, de 30 a 63)
(`LADO_MINIMO_DEL_GENERADOR`, 200 de 200 semillas en cada lado) y fuera lanza antes de intentarlo (#102).
Era 24 hasta el recinto de las ciudades (21-10-2026, decisión del usuario): con dos ciudades a 5 o
más y ninguna en el borde, el 24×24 se quedaba sin mapa en 15 de 200; el 26, en 0.
Ningún pueblo lleva su puerta en el borde (`colocarPar`, #189), salvo el respaldo sin puerta.

**El nivel es de la región** (#143): `MapRegion.nivel` (0 abajo, 1 el llano, 2 la meseta), sin
efecto en las reglas. El procedimental lo sortea por pareja en espejo justo después del suelo
(`data/relieve.json`, inventado: ciénaga 0; nieve, lava y áspero 2 una vez de cada tres; el resto
85/15; las de casa, al 1: **el alto es la excepción**, #210: el 19 % de las regiones y el 22 % de
las casillas de 1-200, mediana 22 % por mapa; eran 36 %, 39 % y 41 %, con s13 al 72 %. Antes de
los ríos (#144) ya eran 14,5 % de las regiones, 16,1 % de lo que se pisa y 86 de 200 mapas sin
meseta; con ellos, 16,3 → 16,0 → 17,2 % y 76 → 81 → 68 mapas en los pasos 1, 2 y 2b: los ríos no
sesgan los niveles, 16-10-2026) y **antes** que las barreras, que salen de las que admiten sus niveles
(`admiteLosNiveles`): el acantilado solo entre dos niveles distintos, dos niveles distintos solo
por acantilado, montaña o agua, y bosque y muro solo a un mismo nivel. Ni el acantilado es
obstáculo (el cargador lo rechaza en `obstaculos`). Junto a un cruce de tres regiones la barrera
de una pareja tocaba la tercera: `desnivelEnLosCruces` (paso 6b del engorde, en espejo) pasa a
una barrera de desnivel la casilla de bosque o muro que toca otro nivel y a montaña o agua el
acantilado que no separa dos.

**Sin espigas** (#210, paso 7b del engorde, `quitarEspigas`): con el
nivel por casilla de la escena (`nivelesDelRelieve`, el nodo con `nivelDelNodo` y los que llevarán
camino de `crucesConCamino`), lo que se pisa por encima de sus dos vecinas de un eje (`espigasDelRelieve`)
se rellena de la barrera baja de al lado, y si es pasillo de un nodo se le abre la orilla a su
región (sin otra región a menos de tres pasos) o la orilla pasa a montaña; luego bolsillos, cruces y
murallas otra vez, hasta `VUELTAS_SIN_ESPIGAS`; si aún queda una, el vestido no vale (7b', s49 con #222). 0 en 1-200 y en 24 y 64 hasta el 21-10-2026 (eran 112
en este-oeste en 10 semillas); sin minas quedan algunas (s17, s157, s174) y no hay guardia que las mire.

**Ninguna senda corta en diagonal una esquina de agua** salvo junto a un puente (el tramo que
llega a él y su río, sus ocho vecinas: ahí va el vado) (#210): la búsqueda cobra dos rectos por ese
paso (con un rodeo el camino se iba al borde) y lo que queda —la entrada en diagonal de un nodo o
una ciudad entre dos barreras— pasa esa esquina a montaña, en espejo (`sinAguaEnLasEsquinas`); si
eso deja el agua de la frontera sin sus casillas, el vestido se repite. Eran 2 803 tramos con una
esquina de agua y 279 con las dos en 1-200, ahora 0 (`esquinasDeAgua`,
`test/sendas-sobre-agua.test.ts`). La senda pintada acaba en cada ciudad o nodo que atraviesa
(`encadenar`): el vaivén la corría al agua en la puerta. `sendaSobreElAgua` (#211) queda en 2 en 1-40,
solo s37: la rampa de caída 2 que baja a una ciudad pasa de ella y su pie cae al agua (#192). Con las
fronteras onduladas (#229), 0 en 1-40 y 2 en 1-80 (s60, s66; en el mapa de antes, 0): un puente sin dos
orillas enfrentadas ya no vale (el vestido se repite), y quedan sendas que bordean agua.

**Ninguna senda pasa por una silla, y la bajada va de frente** (#224; marca en s55 (27,16), «el
camino acaba en un muro de roca»). La regla es `pasoTorcido` (`niveles.ts`), sobre el nivel de la
escena: `silla` (en diagonal, a un nivel, con las dos esquinas más altas: la escena une lo alto
por ese vértice y la senda pasaba bajo la roca), `diagonal` (cambia de nivel en diagonal: sin
rampa recta de dos costados, #225) y `costado` (en cruz, pero a un lado lo de junto a las dos puntas
queda por debajo de la alta: la esquina de la meseta). La búsqueda los cobra con el nivel que pintará
la escena (`EntradaDeCaminos.nivel`, de `nivelesDeLoEngordado`): torcer junto a un nodo, más que
entrar en una ciudad por detrás; una silla entre dos casillas de la región, `SILLA` rectos
(`cobroDelTorcido`). Lo que queda —la región que toca el nodo solo por un vértice— abre esa esquina a
su región y se vuelve a trazar (`abrirEsquinasTorcidas`, `VUELTAS_DE_ESQUINAS`): solo frontera
(nunca un obstáculo), sin tocar otra región ni a dos pasos sin acantilado, sin espiga, sin partir lo
que no es región, sin bajar de la densidad, sin quitarle a un nodo su barrera ni dejar la muesca de #222; el reflejo, si también se puede. Si aún queda una silla, o un paso al que se baja torcido, el
vestido se repite.

**La bajada a una ciudad** en diagonal o por la esquina de la meseta queda,
donde la región solo la toca por un vértice (`soloPorUnVertice`): con tres regiones o más, solo una
le llega en cruz (dos casillas de regiones distintas no se tocan ni por un vértice). Los puentes,
fuera. En 1-200: sillas 117 → 0, bajadas en diagonal a un paso 212 → 0, por la esquina 2 → 0; a una
ciudad por un vértice, en diagonal 905 → 570 y por la esquina 37 → 89 (`test/sendas-por-sillas.test.ts`).
Cuesta mapas: 76 de 200 son otro vestido y el 64×64 tarda ~1 s (272 ms antes; 09-10-2026).

**El agente declara el nivel** (#209): `regions[].nivel`
opcional (0-2, `esNivel`), sin él la región va al 1. Si el plan declara alguno,
`validateMapPlan` corre `problemasDeNiveles`: cada franja de barrera (`franjasDeBarrera`, la
unidad que pinta la escena; un nodo o una ciudad la corta) admite los niveles de las regiones
que toca, o se rechaza diciendo cuál, por dónde pasa y qué regiones; el procedimental pasa
siempre por ahí (`test/desniveles.test.ts`). Por franja y no por pareja: en los cruces de tres
regiones el procedimental deja trocitos de acantilado entre dos iguales (16 casillas en 1-200, 08-10-2026).
Un plan sin ningún nivel (los de antes) no se comprueba y va todo al 1, con sus acantilados de
roca sin cara; la prosa se lo dice al agente.

**La muralla es el cierre de un paso** (#232, sobre #208): el fuerte que tapa un desfiladero,
un tramo corto con su puerta (el nodo de muro, el que se asalta) entre dos apoyos naturales
—montaña, acantilado, agua o el borde del mapa (`APOYOS_DE_MURALLA`; el bosque no)—, uno a
cada lado del paso. La regla, una vez, en `core/map/murallas.ts`: `lineaDeLaPuerta` (la línea
más corta, en anchura, de la puerta a un apoyo a cada lado de su eje) y `muroDeLaLinea` (ella y
el grosor de la franja entre sus puntas). El engorde (paso 7, `murallasSobrantes`) deja de cada
franja la línea de su puerta hasta `RADIO_DE_LA_PUERTA` (2), apoyada en lo natural que ya hay
o en lo que sobra de la propia franja, que pasa a montaña o agua (la frontera de la pareja se
vuelve sierra o río y la muralla, su fuerte); con solo los apoyos que ya había quedaban 41 de
200 mapas con muralla. Sin puerta, sin sus dos apoyos a `LARGO_MAXIMO_DE_MURALLA` (6) o junto a
una ciudad (`juntoACiudad`: ni la lleva ni la sostiene), la franja entera pasa a otra barrera:
la que ya tiene al lado si la admiten sus suelos y niveles, si no la que falta para las
`TIPOS_POR_MAPA`, si no `laMasPesada` (sin tirada). Una muralla, una puerta: la que se pegaría
a otra no se queda. El muro no se sortea en los obstáculos (el cargador lo rechaza: una ruina
no cierra nada), cuenta para las `TIPOS_POR_MAPA` con una casilla (`CASILLAS_DE_UNA_MURALLA`) y
el vestido que lo de después del engorde deja con una muralla sin apoyo se repite
(`murallasDeLaRejilla`, s178), como el que deja un nodo cuya entrada solo sigue en diagonal (s37)
o una mesa del relieve (`mesasDelRelieve`: barrera por encima de todo lo que toca; s33, 3 en
1-200 antes). En 1-200 (10-10-2026): franjas de muro 1 637 → 218, sin puerta 1 422 → 0, con
puerta y sin sus dos apoyos 71 → 0, casillas de muro 8 884 → 1 451, largo medio 3,18 → 3,74
(máximo 6); mapas con muralla 117 (con puerta; 199 con algún muro) → 112
(`tools/qa/medidas/murallas.ts`, `test/murallas-de-paso.test.ts`). Los planes del agente no cambian.

**El río continuo** (#144, 16-10-2026, paso 1 del rediseño de
`docs/agents/2026-10-14-rios-entre-regiones/`; el río que encadenaba fronteras de agua se cortaba
en cada ciudad del cruce y en cada remiendo: «un río es algo continuo», el usuario).

**El río va
primero** (`core/map/rio.ts`): tras las semillas y antes de repartir las regiones, `trazarRio`
traza una línea de agua de una casilla, 4-conexa, por un Dijkstra con estado (casilla, rumbo,
tirada) que no lleva tiradas rectas de más de `tramoMaximo` (4) pasos, va por los valles entre
semillas (más caro cuanto más cerca de una, más un ruido del `rng`), no pasa a dos de una semilla
ni por la caja de una casa ni por el `marco` (4) salvo el canal de su boca, y va en espejo exacto
sin tocarse ni tocar su espejo. Tres formas, una vez por mapa con los pesos de `data/rios.json`
(1:1:1, decisión del usuario; si con la sorteada no sale mapa, las otras): **frontera** (de un
borde a un lago del centro y al borde de enfrente: un río que separa las bases), **esquina** (de
un borde a otro por la esquina sin casa, y su espejo) y **lago** (de un borde a un lago de
dentro, y su espejo; **del lago al borde, al menos `cursoDelLago` = 20 casillas**, decisión del
usuario del 17-10-2026: el lago se sortea entre los sitios a esa distancia en cruz de la boca y el
cauce se mide; si no cabe, otra red, y si con ninguna sale, otra forma. En s83 eran 7 y se leía
como dos lagos; en 1-300 el curso de lago (trazado) iba de 5 a 42, mediana 18, 102 de 178 por debajo de 20, y
va de 20 a 33, mediana 23; las formas salen igual, 104 / 107 / 89 de esquina, frontera y lago, y
en 24×24 la de lago no cabe; el techo del áspero en el reparto de suelos de 1-200, de 17 a 18 por el azar de esos mapas). Las regiones se reparten por lo que ven sin cruzar el río (la recta de la
casilla a la semilla no lo pisa; si no ve ninguna, la más cercana de su orilla), así que el río
separa regiones también donde nace en un lago. En él solo van **puentes** (río recto, una región
distinta a cada lado y dos casillas suyas de frente; si no, la pareja va sin puente) y
**ciudades-puente** (río recto donde toca tres regiones: la frontera de una orilla llega a él; el
vestido la muda a su orilla, `enSuOrilla`, y su casilla del río queda como su puente,
`rioAnteLaCiudad`). Niveles (`nivelesDelRio`, sin tirada): el río va al llano, la ciénaga que lo
toca sube al 1 y de una pareja que lo cruza con las dos orillas a 2 baja la de menor índice
(`regionesDelRio`, `ladosDelRio`). En el engorde el río es agua fija (`conElRio`): no engorda ni
se toca, salvo con lo alto justo al norte (paso 7e: la casilla del sur también es agua, se vea
la cara), y **la rejilla del vestido solo la escribe `ponerTipo`**, que lanza si se toca el río
(lo vigila `invariantes-partida.test.ts`).

**Fuera del río no hay agua de frontera** (vuelta de QA 1, H3,
decisión del usuario: del mismo azul que el río, sus 1 675 casillas en 1-100 se leían como lagos
dispersos): la pareja cuyos suelos solo dan agua lleva acantilado entre dos niveles y montaña a uno
(`susBarreras`), y lo que sobra de una muralla tampoco pasa a agua; solo quedan las charcas (lagos
de obstáculo, dentro de una región). El río cuenta como el agua de las `TIPOS_POR_MAPA`.

**Ninguna
base en el río** (H2): la base ciudad-puente se pintaba en la casilla donde empieza su héroe y
pulsarlo lo metía en su castillo (s7, s30); `base` no elige un nodo del río. Las sendas no cortan en diagonal una esquina del río salvo junto a una
ciudad-puente (un veto en la búsqueda, y si queda, el vestido no vale) y al puente del río se
llega de frente (`antesDelEstribo`). Al final del vestido `rioEntero` lanza si el río no sigue
entero: es un fallo del generador. Lo vigila `test/rio.test.ts` (`alTrazarElRio`). Medido en
1-40 (`tools/qa/medidas/rios.ts`, sobre el mapa hecho; 16-10-2026), antes → después: ríos enteros —
→ 40 de 40; ríos (agua 4-conexa con boca) por mapa 5,9 → 1,7; el más largo, mediana 19 → 40
(frontera 60, esquina 39, lago 26); agua del río lejos de nodos y lagos de una casilla 78 → 100 %;
agua de frontera fuera del río 2 136 → 709 casillas; agua encajada en un río 26 → 0; ríos con
escalón 1 → 0; neutrales por mapa 4,8 → 3,6 (ciudades-puente 1,1); puentes 5,0 → 4,3. Los ramales
de mina que dan la vuelta a su mina en 1-200 suben de 24 a 31: el veto de las esquinas del río
aparta los radios y los vestidos que se tiran por él dan otros mapas (sin ninguno de los dos, 24;
con el veto, 27; con los dos, 31). Sin agua fuera del río (H3; 1-100): agua de frontera fuera del
río 1 675 → 0 casillas, ríos enteros 100 de 100, bases en el río 0, ramales que dan la vuelta en
1-200 31 → 26 (techo 27); la ciénaga (agua 4, bosque 2) pierde su barrera y sus vestidos se tiran
más: es el 10,7 % de las regiones de 1-200 y el 11,2 % de 1-1000 (eran 13,2 y 12,7; el suelo del
guardia de `desniveles`, de 11 a 10). Duración en 1-100 8 / 15 / 24 → 8 / 14 / 24, j0 48 → 45;
el banco, 8 / 15 / 30 → 8 / 14 / 30.

**En la escena** (paso 2; en tierra desde la ciudad
amurallada, fase 2): la ciudad-puente está en el medio de su recinto, en tierra, y la casilla del
río que tiene delante es agua en la escena con un puente de piedra que cruza de frente
(`puenteDeLaCiudad`, `Puente.ciudad`, id `<ciudad>:puente`): de la orilla de enfrente al pie de la
cara del río del recinto (escala ~0,68), pintado antes que esa cara, que entra por el arco de su
puerta del río (`puentesSobreElAnillo` = 0). Quien está en él se pinta en su tablero, como en el de
un nodo, y pulsarlo lleva a esa casilla, que se pisa; la marca y el clic de la ciudad, en su casilla.
Las sendas llegan a sus estribos como a los de un nodo.
De la senda de un puente del río, «bajo el puente» es solo lo que va sobre el tablero, a menos de
media casilla de su línea (`tramosHastaLosEstribos`, H4): a los lados se cambiaba por la recta del
estribo, que pasaba por el agua de al lado (s52, s93, s97, s100) o dejaba una montaña sin pico
(s41); `sendaSobreElAgua` = 0 en 1-100 (16-10-2026; sin minas, s51 da 1, sin guardia desde el 21-10-2026).

**Las charcas** (`Escena.charcas`, el agua que toca una sola región: los lagos de obstáculo) se
pintan turbias (`COLOR_DE_LA_CHARCA`, `multiply`) para no competir con el río: 1 407 de 5 390
casillas de agua en 1-40.
