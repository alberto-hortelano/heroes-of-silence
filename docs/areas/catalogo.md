# El catálogo: unidades, equipo y héroes

Se lee antes de tocar: `src/core/unidad/`, `src/core/equipo/`, `src/core/hero/`, `src/core/escala.ts`, `data/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### Cifras = catálogo + veteranía + equipo

`cifrasDeUnidad` (`core/unidad/catalogo.ts`: cuerpo + rango + lo de serie con lo propio encima, un solo `conEquipo`; con el catálogo de la pelea, `CatalogoDeUnidades`, por defecto `CATALOGO_DEL_JUEGO`), `cifrasDelIndividuo` (el retoque de la arena), `conEquipo`; el oro de una unidad, `costeDeUnaUnidad` (de la vestida) y `oroDeUnidad`; el cuerpo sin equipo de un stack, `cuerpoDe(stack, cat?)` (del origen: igual en el juego y la arena; el héroe lo lleva en `OrigenDelStack`, `desnudo`); qué unidad es un stack, `origen.unidad` o `queEs` (`battle/types.ts`): `body` es el arte

### Fuerza, agilidad y peso: lo que se deriva de un cuerpo (25-10-2026)

`cifrasDelCuerpo` (`core/unidad/cuerpo.ts`: defensa = agilidad efectiva + escudo + `defensaPropia`; daño = [F, F × agilidad efectiva] con F = fuerza + la del arma; casillas = agilidad efectiva, tope 7, y `crawling` con 1), `restaDelPeso` (−1 de agilidad por cada fuerza entera, o parte de ella, que pase lo que pesa todo: 31-10-2026, decisión del usuario; antes, por cada 50 %, truncado), `agilidadEfectiva` (como poco `AGILIDAD_MINIMA`, 1; la de una `UnitInfo` ya vestida, `agilidadDe`, y lo que le resta su peso, `restaDelPesoDe`: el contrato y la ficha de la arena), `escalonDeCasillas` (la única traducción de casillas a escalón, que solo piden `cifrasDelCuerpo` y `marchaDe`; con una montura de guerra, las casillas y el peso son de ella: «La montura», abajo) y `cuerpoConSusCifras` (el cuerpo desnudo: la unidad, `cuerpoDeCombate`; el héroe, `cuerpoDelHeroe`; el rango, `cifrasVeteranas`). `UnitInfo` lleva las primitivas (`fuerza`, `agilidad`, `defensaPropia`: la Defensa del héroe, 0 la tropa; `peso`, lo escribe `conEquipo`) y las derivadas (`defense`, `damage`, `speed`), que lee el motor tal cual. El rango sube primitivas **antes** que el equipo (`cifrasVeteranas` lanza con algo puesto). Lo vigila `invariantes-batalla.test.ts`

### Nivel de una unidad (índice de poder, con su equipo)

`nivelDeUnidad`, `indiceDePoder`, `nivelDelIndice` (`core/unidad/nivel.ts`, `data/poder.json`), de la unidad vestida (`poderBruto`, memorizado por `UnitInfo`); lo que mide lo lee de `battle/armas.ts` (`golpeDe`, `golpesDe`, `porcientoDelTipo`, `disparosDe`, `trasLaArmadura`), y `unidad/nivel.ts` no está en un ciclo de importación (lo vigila `invariantes-capas.test.ts`); qué cifras se pueden medir, `medidaBlocker`. Ni el nivel ni el coste se escriben en `data/unidades.json` (lo vigila `invariantes-datos.test.ts`)

### El catálogo de unidades (el juego y la arena)

`data/unidades.json`, que importa solo `core/unidad/catalogo.ts` (lo vigila `invariantes-datos.test.ts`): `UNIDADES`, `unidad`, `unidadDelJuego`, `unidadesDelJuego`, `unidadesDeFaccion`, `unidadesDeMorada`, `hojaDeUnidad` (la hoja con que se pinta, `cuerpo.hoja`); el formato, `validarUnidad` y `validarCatalogo` (`core/unidad/formato.ts`); lo que el juego exige a los dos catálogos juntos (equipo base del héroe, unidades y moradas), `leerCatalogos`, que llaman la carga, «Guardar» y el editor de equipo; la forma de un id, `esIdDeUnidad` (`core/validar.ts`). **Un poder de unidad** (08-11-2026, «Sí, se rechaza», decisión del usuario): `poderDeUnidadBlocker` (`core/unidad/formato.ts`), la única pregunta: que una unidad lo pueda usar (`problemasComoPoder`) y que sea de su facción (`Hechizo.facciones`); la leen la carga y «Guardar» (`hechizosDeUnidadesBlocker`, «la unidad «Monje»: «Zombi pegajoso» no es de su facción (Templarios): es de No muertos») y la ficha de la arena, que ofrece apagado lo que no vale

### Moradas: qué producen y qué cuestan

`Unidad.edificio` (la morada que la produce; sin él no se recluta) y `Building.morada` (su sitio en la base, 1-6: no es un nivel); `nivelDeMorada` (el de lo mejor que produce: de él, su coste), `moradasBlocker` (cada `edificio` es una morada de su facción, cada morada produce algo; al cargar y al guardar) (`town/buildings.ts`); una fila por unidad, `dwellings`; el oro y el crecimiento de una unidad, `oroDelIndice`, `crecimientoDelNivel` (`data/economia.json`)

### Reindexar el rango de héroe

`subidasDeRango` (lanza por debajo del 5)

### Añadir a la mochila

`aLaMochila`

### A quién va una pieza

`destinoDeEquipo`

### Lo que admite una mano y dos (un arma a dos manos va sola; dos de una mano no dejan sitio al escudo; 25-10-2026)

`manosBlocker` (`equipo/manos.ts`, mira solo las armas de cuerpo a cuerpo, `arma` y `segunda`, y el escudo: el arco a la espalda deja llevar escudo; la segunda arma pide una primera y es de una mano; la única lectura de `Pieza.manos`, con `aDosManos` al lado para enseñarla o escribirla); en qué huecos va una pieza, `huecosDeLaPieza` (`types.ts`: la de `arma`, en `arma` y `segunda`; la pieza dice `HuecoDePieza`, nunca `segunda`), con su motivo una vez, `huecoBlocker` (lo leen `manosBlocker`, `equipoBlocker` y `equipoDelPortadorBlocker`, antes que lo de serie), y la ficha de la arena (`opcionesDelHueco`, que pregunta antes `manosBlocker` desde la pieza que se pone: el remedio, de lo que ya lleva); poner en la segunda, `ponerPieza(…, hueco)`, `equip.hueco` (el agente, `slot`) y el botón «A la segunda mano» de la tropa; la leen `equipoBlocker` y `equipoDelPortadorBlocker` (`core/equipo/manos.ts`: las manos y el arma de cuerpo a cuerpo sobre lo que llevaría puesto, `equipoPuestoDe`, lo de serie de su unidad incluido; la preguntan `ponerseBlocker` y `unequipBlocker`), y `ponerPieza` lanza con ella, con lo de serie debajo si se le da (`deSerie`: la acción `equip` de la tropa, que pone antes de tocar la mochila, todo o nada; QA del 26-10-2026, H1), que es la pregunta de la arena (`equiparEnArena`, con el nombre de quien la lleva; lo vigila `invariantes-datos.test.ts`); dicha para la persona, `REGLA_DEL_ESCUDO`

### Los huecos en el contrato (`melee_weapon`, `second_melee_weapon`, `ranged_weapon`, `armor`, `shield`, `mount`; `lance` se fue el 25-10-2026, `mount` llegó el 26-10-2026)

`SLOT_DE_HUECO`, `huecoDelSlot`, `accionDelAgente` (`contract/vocabulario.ts`; un `Slot` lleva marca y solo lo produce ese módulo; lo que escribe el agente, `AccionDelAgente`, con el `slot` opcional de `equip`); por dentro, `HUECOS` en español (`arma`, `segunda`, `distancia`, `armadura`, `escudo`, `montura`; lo vigila `invariantes-batalla.test.ts`) y el núcleo recibe un `Hueco` (`unequip.slot`, `equip.hueco`): el texto lo traducen `accionDelAgente` y la sesión (`esHueco`). Uno que no existe, `huecoDesconocido`; para la persona, por su nombre (`NOMBRE_DE_HUECO`; quitar de uno vacío, `nadaEnElHueco`)

### La montura (26-10-2026, «vamos a separar la montura del personaje»; `docs/agents/2026-10-26-montura/`)

un hueco más, `montura`, con piezas que dicen su `fuerza`, su `agilidad` (2 a 7, `AGILIDAD_DEL_CUERPO_MIN`/`MAX`, ahora en `core/unidad/cuerpo.ts`), su `peso` y si es de guerra (`Pieza.guerra`; sin él, de silla); la regla de la pieza, `problemasDePieza` (`problemasDeMontura`: agilidad y fuerza ≥ 1 en una montura, ni agilidad ni `guerra` fuera de ella); `.guerra` lo leen solo `equipo/pieza.ts`, `equipo/manos.ts` (`esDeGuerra`) y `core/unidad/cuerpo.ts` (`montadoDeGuerra`). Las cifras puestas, `UnitInfo.montura` (`MonturaPuesta`), que escribe solo `conEquipo` (`monturaPuesta`; la suma, `sumaDe`, deja su peso fuera del del jinete). **La única cuenta**, `cifrasDelCuerpo`: montado de guerra, el jinete pelea con su agilidad entera (el peso lo carga la montura), las casillas son las de la montura con lo que pesa lo del jinete y ella frente a su fuerza (`casillasDeLaMontura`, privada) y, con lanza (`fuerzaDeLaLanza`, la de la mejor lanza puesta, que solo vive en `unidad/cuerpo.ts` y `equipo/vestir.ts`), la horquilla de la carga, [F, F × agilidad del jinete] con F = la fuerza de la montura más la de la lanza. Lo que cuenta en el mapa, `marchaDe` (de guerra o de silla, las casillas de la montura; a pie, las de batalla), que lee `slowestSpeed`; lo que le resta el peso a la montura, `restaALaMontura` (la ficha). Lo vigila `invariantes-batalla.test.ts`. La IA no las compra (`valorDePieza` de una montura, 0: backlog)

### Lo de antes

no se lee (14-10-2026: sin compatibilidad hacia atrás): una unidad o pieza de otro formato no vale (`validarUnidad`, `validarPieza`); un `?montaje=` de otra versión se rechaza (`montajeDeLaURL`, `VERSION_DEL_ENLACE`), y `?reglas=`, `?golpe=` y `?contacto=` también (`PARAMETROS_RETIRADOS`, `retiradosDeLaURL`)

### La regla de una pieza

`problemasDePieza` (`pieza.ts`), con los campos que existen (`CAMPOS_DE_PIEZA`: un `pv` o una calidad no valen): el precio, un entero de oro (`Pieza.precio`); de dónde se consigue, `seConsigue` (`armeria`, `botin` o nada: solo en kits; `DONDE_SE_CONSIGUE`, dicho con `DICHO_DE_DONDE`, `SOLO_EN_KITS` y `deDondeSale`); solo las cifras de su hueco (`camposDelHueco`), todo pesa (`Pieza.peso`, obligatorio; una `velocidad` o un `danio` de antes se rechazan diciendo qué escribir), el tope de armadura (`ARMADURA_MAXIMA_DE_PIEZA`) y la rueda completa del arma que golpea en ella (`golpeaEnLaRueda`, `problemasDeNiveles`). El catálogo entero se hace en un sitio, `leerPiezas` (cada pieza, sin repetir, con sus bases y alguna de botín, todos los problemas a la vez), que leen `leerEquipo` (el fichero) y `catalogoDeEquipo` (`equipo/atado.ts`: el `CatalogoDeEquipo` atado; el del juego, `EQUIPO_DEL_JUEGO`); un fallo en `data/equipo.json` tumba la carga nombrando el fichero

### Sumar una base (18-10-2026)

`resolverBases` (`pieza.ts`, privada), la única suma, que llama solo `leerPiezas`; la pieza escrita (`PiezaEscrita` = `Pieza | PiezaConBase`: id, nombre, base, extras con signo y su propio `seConsigue`) va por las fronteras y la resuelta es la que pelea; los extras, una tabla (`FORMA_DE_LOS_EXTRAS`) con la suma y su inversa juntas (`sumarBase`, `diferenciaDe`, en `equipo/pieza.ts`); qué base vale, `baseBlocker` (existe, de su hueco, no da la vuelta), que leen la resolución, `conBase` (cambia de base conservando las cifras finales), `basesPosibles` y `piezaSobre`; la escrita y la base de una pieza, `escritaDe`, `baseDe`, `cadenaDeBases` (`arena/piezas.ts`, como `conBase`, `basesPosibles` y `piezaSobre`). Hueco y manos son los de la base; el precio, el de la base más el oro de los extras. Lo vigila `invariantes-batalla.test.ts` (nadie suma una base ni lee `.extras` fuera de su sitio)

### El equipo de una unidad

`equipoDeUnidadBlocker(cuerpo, equipo, eq)` (`core/unidad/formato.ts`: piezas y manos, un arma de cuerpo a cuerpo, `armaDeCuerpoBlocker`, y que el índice la mida), que leen `validarUnidad`, `opcionesDelHueco` (lo que se rechazaría va desactivado con su motivo), `quitarBlocker` (el arma no lleva ×) y `equipoQueNoVale`; el del héroe, `EQUIPO_BASE` (`data/heroe.json`, comprobado con `equipoBaseBlocker`), y quién lleva una pieza además de las unidades, `laLlevaElHeroe`. En la partida, la tropa lleva lo de serie de su unidad con lo suyo encima, hueco a hueco (`equipoPuesto`, `equipoPuestoDe`): lo de serie no se quita ni va a la mochila

## Reglas del juego

### Facciones

**regla nuestra** (19-10-2026, decisión del usuario): templarios, no muertos, imperio, elfos y orkos (`FACTION_IDS`), las cinco de la arena; cada partida sortea dos distintas (`faccionesDeLaSemilla`). Sus moradas y quién produce cada una son las del cuaderno (`NuevaJugabilidad.md` §Ciudades; lo que faltaba, inventado y dicho en el `_comment` de `data/buildings.json`), varias unidades por morada; los tipos de héroe se extraen del cuaderno (`tools/datos/tipos-de-heroe.ts`). Caballeros y nigromantes se retiraron con `data/creatures.json` (lo vigila `invariantes-datos.test.ts`: ni `knight` ni `necromancer` en `src/`, `data/` ni `tools/`)

### Lo demás de las reglas

- **Economía**: costes de la villa de `buildinginfo.cpp` y renta de `ProfitConditions`,
  copiados de la fuente y **pasados a oro** (21-10-2026, «solo oro»; precio inventado: madera y
  mineral a 250 de oro la unidad, mercurio, azufre, cristal y gemas a 500; el castillo, 15 000). **Lo de las unidades se deriva de su índice** (inventado y provisional,
  19-10-2026, `data/economia.json`): una unidad cuesta índice² / 500 de oro, redondeado a la
  decena (`oroDelIndice`, `costeDeUnaUnidad`), y crece por semana según su nivel, 12 / 8 / 5 / 4 /
  3 / 2 (`crecimientoDelNivel`: una morada que produce varias suelta el de cada una); una morada
  cuesta según el nivel de lo mejor que produce (`nivelDeMorada`, con la tabla de las seis moradas
  del caballero de fheroes2 pasada a oro: 200 / 1 000 / 2 250 / 7 000 / 8 000 / 20 000) y no tiene mejora. No se ajustan cifras a ojo: se inventa solo lo
  declarado como inventado.

- **Un solo nivel, derivado de las cifras con el equipo puesto (regla nuestra, 12-10-2026; con el
  equipo desde el 18-10-2026, «el nivel ve el equipo»)**: el nivel de toda unidad —del catálogo,
  veterana o héroe— es la primera cifra de su **índice de poder** (`indiceDePoder`, 340
  = nivel 3), en enteros, de la unidad **vestida** (`raizEntera` de ofensa × aguante, por lo que
  corre: cada arma por su uso, la rueda, la carga y la armadura contra un golpe de referencia
  inventado, de 9 desde la escala baja; la fórmula, en el `_comment` de `data/poder.json`; umbral del
  nivel 2 en 623 y ×2 cada nivel: era 940, con la fuerza y la agilidad, 25-10-2026, subió a 2 098 con
  la mediana del poder bruto del catálogo para que siga del 2 al 4, y con la escala baja, 26-10-2026,
  baja a 623 con la misma mediana, a ojo; la mide `npx tsx tools/qa/medidas/cifras-del-catalogo.ts --medianas`).
  Nadie lo escribe, ni el coste: el catálogo guarda la morada (`Unidad.edificio`) y el contrato la
  manda como `dwelling`. Las 34 del catálogo van del nivel 1 al 4 (el esqueleto guerrero, 196, en el 1 desde el peso que resta por cada fuerza entera, 31-10-2026;
  ningún test lo fija: lo lista `tools/qa/medidas/cifras-del-catalogo.ts`): el edificio no implica nivel y la escala no se recalibra a ojo
  (decisión del usuario del 19-10-2026: «no te preocupes por el valor de las unidades, lo iremos
  refinando»). Un héroe recién hecho (2/2) es del nivel 3 desnudo (356) y del 4 con la Espada
  (412). **PV y fuerza van ×3** (`ESCALA_DE_CIFRAS`, `core/escala.ts`: catálogo, equipo, héroe,
  hechizos de PV y la cura de los poderes): eran ×10 desde el 12-10-2026, con los PV de
  tropa y héroe, además, ×2 (25-10-2026, decisión del usuario: con el daño de la fuerza por la
  agilidad casi todo caía de un golpe), y con **la escala baja** (26-10-2026, petición del usuario:
  «la idea es bajar los números»; a ojo, `docs/agents/2026-10-26-escala-baja/`, con su tabla en
  `cifras.md`) fuerza, PV, armadura y hechizos bajan ×0,3: la fuerza de la tropa va de 4 a 12, como
  la agilidad, los PV de 30 a 90 y el héroe recién hecho, fuerza 6 y 300 PV. Ataque y la fórmula de
  daño no cambian. La fuerza de la IA es `poderBruto`² /
  `DIVISOR_DEL_PODER` (`unitPower`: ve armadura, armas por uso, rueda y carga, #129, #250; el divisor
  era la mediana medida sobre las 21 criaturas de fheroes2 antes de retirarlas, 143 465, y con la
  fuerza y la agilidad subió con la mediana del poder bruto² del catálogo, 714 961, para no recalibrar
  `MARGEN_CONTRA_NEUTRALES`, y con la escala baja baja con ella, 62 989, a ojo, 26-10-2026; el techo
  de los asaltantes, `fuerzaMax`, bajó de 800 a 600, a 580 con la escala baja y a 310 con el catálogo retocado a mano, 02-11-2026: MARGEN × el héroe de los orkos que espera en su base, 313), el
  maná vale 4 × escala y `valorDePieza` es lo que sube el índice del cuerpo de referencia al
  ponérsela.

- **Experiencia (regla nuestra)**: quien quita PV cobra `PV quitados × índice de poder
  del que los recibe` (`indiceDePoder`, con su equipo: el nivel en centésimas), gane o
  pierda; en enteros, con los umbrales en esa escala en vez de dividir entre 100. La
  experiencia da **rangos**: tabla en `data/experiencia.json` (Fibonacci, base 2 700: era 9 000,
  calibrada para 0,25 rangos 5 por partida con las cinco facciones, 19-10-2026, y baja ×0,3 con los
  PV de la escala baja, 26-10-2026, sin volver a medir; antes, 16 000).
  La tropa va del rango 1 al 5; todo héroe empieza en el 5 y sube sin tope. Cada
  rango suma cifras (`porRango`: ataque +1 y fuerza +2 desde el 25-10-2026, +1 desde el 26-10-2026, sin agilidad; al héroe,
  cuerpo y liderazgo), y su nivel sube solo
  si ellas lo suben. La experiencia vive en el individuo (`Troop.veterania`); el rango se
  deriva. Medido en 1-100 (19-10-2026, `tools/qa/medidas/veterania.ts`): rangos 2/3/4/5 por partida
  7,71 / 3,64 / 1,16 / 0,25, subidas de héroe 4,23, 0 sin terminar (lo de antes y por qué no
  `× nivel`, en `docs/historia.md`).

- **Equipo (inventado; un solo catálogo desde el 18-10-2026)**: seis huecos con el nombre de su
  uso —`arma` (cuerpo a cuerpo), `segunda` (otra de una mano, 25-10-2026: el hueco `lanza` se fue y
  la lanza es un arma más), `distancia` (con lo que se dispara), `armadura`, `escudo` y `montura`
  (26-10-2026: su fuerza, su agilidad y su peso son suyos; la de guerra se monta en batalla —carga el
  peso del jinete y el suyo frente a su fuerza, da sus casillas, el jinete pelea con su agilidad entera
  y con lanza la carga va con su fuerza— y la de silla solo cuenta en el mapa; el caballo de guerra,
  fuerza 16 y agilidad 6, 1 500 de oro, y el de silla, 10 y 7, 500, en la armería; la hiena de guerra,
  10 y 6, solo en el kit de su jinete (fuerzas de la escala baja, 26-10-2026; eran 50, 30 y 30); los cinco jinetes la llevan de serie con su fuerza y su agilidad
  de jinete; cifras a ojo, `docs/agents/2026-10-26-montura/plan.md`) (`HUECOS`)—, por individuo y por héroe, y una sola clase de piezas
  (`data/equipo.json`, que edita la arena): ni calidades, ni accesorio, ni PV. **Fuerza, agilidad y
  peso (25-10-2026, petición del usuario; cifras a ojo, `docs/agents/2026-10-25-fuerza-agilidad-y-disparo/cifras.md`)**:
  toda unidad y todo héroe tienen fuerza y agilidad (`data/unidades.json`: `fuerza`, de 4 a 12 desde la
  escala baja, y `agilidad`, de 2 a 7; la defensa, el daño y las casillas no se escriben), toda pieza
  pesa (`peso`: la daga 0, la espada 1, el mandoble 2, la coraza 12, a ojo, 26-10-2026) y ninguna resta
  movimiento: lo puesto que pasa de la fuerza resta agilidad (`restaDelPeso`), y de la agilidad que
  queda salen las casillas, la defensa (más el escudo y la Defensa del héroe) y el daño, [F, F ×
  agilidad] con F = fuerza + la del arma (lo torpe pega parejo; lo ágil, con mucha variación). Una
  arma suma ataque y fuerza; la armadura, armadura (ya no defensa); el escudo, defensa; `conEquipo`
  es la única suma, y el nivel la ve. **Un arma a dos manos (`manos: 2`) va sola** (ni escudo, 12-10-2026,
  ni segunda arma), y con dos de una mano no queda mano para el escudo (`manosBlocker`, 25-10-2026). Cada pieza cuesta un número de oro y dice de dónde
  sale (`seConsigue`; precios inventados): la armería vende las que no van sobre otra (la maza y el
  pavés también desde el 26-10-2026, y la Alabarda y la Lanza de infantería, a dos manos, nuevas ese
  día); el botín de asaltantes y ciudades neutrales (con su propia corriente de azar) da las que van
  sobre otra; las que no salen de ningún sitio van solo en los kits de las unidades. La lanza de la
  carga se llama «Lanza de jinete» (id `lanza`) y la de infantería, «Lanza» (`lanza_de_infanteria`,
  sin la marca de la carga), y la barda, «Coraza» (id `barda`). Todo héroe nace con la Espada y el gambesón (`equipoBase`, `data/heroe.json`); la
  tropa lleva el equipo de serie de su unidad (`data/unidades.json`) y lo que se le ponga encima,
  hueco a hueco. **Cada arma para lo suyo (13-10-2026; en el juego desde el 18-10-2026)**: cada
  golpe va con el ataque y la fuerza de su arma más lo que no es arma (`usoDelGolpe`,
  `cifrasDelGolpe`): el disparo con la de distancia, el golpe, la carga y el contraataque con
  las de cuerpo a cuerpo (con dos, la mejor de cada cifra), sin la que nadie pelea
  (`armaDeCuerpoBlocker`); un cuerpo sin arma pega con sus cifras (`SIN_ARMA`). **Sin munición (13-10-2026; en el juego desde el 19-10-2026)**: llevar algo en
  `distancia` ya es disparar (`isShooter`), sin cuenta de tiros: un tiro por disparo y dos con
  `double_shot`; el guardabosques lleva su arco. **Salvo la granada** (02-11-2026): se lanza, no
  se dispara, y se gasta (sus `cargas` por batalla); el arcabucero, el artillero y el pistolero
  montado llevan arcabuz, culebrina y pistola, y el granadero, granada (armas de fuego y granadas,
  en las reglas). Toda unidad ocupa una casilla.
