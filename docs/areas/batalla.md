# La batalla

Se lee antes de tocar: `src/core/battle/`, `src/core/magia/`, `src/core/combate.ts`, `src/client/batalla/`, `src/client/render/batalla/`, `src/client/sesion/batalla/`, `src/shared/muralla-de-batalla.ts`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### Quitar vida

`herir` (`battle/damage.ts`; `applyDamage` no se exporta)

### Escala del tablero de combate (también la de la base)

`escalaDelCombate` (`render/proyeccion.ts`), que leen `tableroPara` y `pasoDeLaBase` (la base: la de una batalla en un marco 20:11 de su alto, `MARCO_DE_LA_BASE`; el ancho no cuenta, 20-10-2026)

### Con qué arma se da cada golpe

`usoDelGolpe` (`battle/damage.ts`: el disparo, `distancia`; lo demás, también la carga, `arma`) y `golpeDe` (`battle/armas.ts`: las armas y las cifras de cada uso, con su respaldo), de la que leen `cifrasDelGolpe`, la previsión y la ficha (`armasDe`, `dichoDelGolpe`, que nombra las dos: «con Espada y Lanza de jinete»); `UnitInfo.armas` lo escribe solo `conEquipo`, con el nombre de cada arma (`GolpeConArma.piezas`, y montado de guerra con lanza la horquilla de la carga, `GolpeConArma.carga`: la batalla no lleva catálogo; lo vigila `invariantes-batalla.test.ts`). **Dos armas de cuerpo a cuerpo** (25-10-2026): de ataque, fuerza y cada tipo de la rueda, la mejor de las dos (`sumaDe`, `mejorRueda`); el peso, la suma. El uso es `arma` o `distancia` (`UsoDeArma`; ¿es de arma por uso?, `esArmaPorUso`); qué cifras admite cada hueco de pieza y si lleva rueda, `camposDelHueco` (`arma`: ataque, fuerza, peso, rueda y manos; una lanza es un `arma` con `lanza: true`, que leen solo `equipo/manos.ts` y `equipo/pieza.ts`, `esLanza`, lo vigila `invariantes-batalla.test.ts`; `distancia`: ataque, fuerza y peso; `armadura`: armadura y peso; `escudo`: defensa y peso; 25-10-2026; `montura`: fuerza, agilidad y peso, suyas, que no se suman a nada, 26-10-2026); cómo se dice cada uso, `DICHO_DEL_USO`

### Quién dispara

cómo juega a distancia, `tiroADistanciaDe` (`battle/armas.ts` desde el 02-11-2026, leída solo de `UnitInfo.armas.distancia`: `disparo`, `granada` o `null`; la única pregunta, y nadie escribe `isShooter || lanzaGranadas`); `isShooter` y `lanzaGranadas`, comparaciones con ella (no hay munición: llevarla ya es disparar); cuántos tiros da un disparo, `disparosDe` (`battle/armas.ts`: uno, dos con `double_shot`; la única cuenta, lo vigila `invariantes-batalla.test.ts`)

### Armas de fuego y granadas (02-11-2026, **regla nuestra**, `docs/agents/2026-11-02-armas-de-fuego-y-granadas/`)

lo que tira una pieza de `distancia`, `Pieza.tiro` (`fuego` o `granada`; sin él, arco o ballesta), con su `recarga` (fuego) o sus `cargas` (granada) y, el arma de fuego, su propia `agilidad`; su regla, `problemasDelTiro` (`pieza.ts`, dentro de `problemasDePieza`); en la unidad, `GolpeConArma.tiro` (lo escribe solo `conEquipo` con `tiroDelGolpe`, `equipo/vestir.ts`), y `.tiro` lo leen solo `equipo/pieza.ts`, `equipo/vestir.ts` y `battle/armas.ts` (lo vigila `invariantes-batalla.test.ts`); el daño del arma de fuego, [F, F × agilidad del arma] (`LoQuePoneElEquipo.agilidadDelArma`, `cifrasDelCuerpo`: sigue siendo la única cuenta). **Perfora la armadura**, `perforaLaArmadura` (`battle/armas.ts`), la única pregunta, que leen `computeDamage` (`DamageResult.perfora`), la previsión, `expectedDamage` y `fraccionQueLlega` (`trasLaArmadura(…, perfora)`, sin valor por defecto); `herir` recibe el golpe entero (`GolpeQueHiere`, daño y perforación juntos: un hechizo, `perfora: false`), y la salpicadura reparte ese mismo golpe. **La recarga**, `recargaDe` y `BattleStack.recargando` (la pone `dispararLoApuntado`, contando ese turno; la baja `endTurn`), en `disparoBlocker` («está recargando: le faltan k turnos», la frase de `recargaQueFalta`, que dice también el panel). **Es un contador del stack y no un `StackEffect`, a propósito**: lo temporal vive en `effects`, pero un efecto caduca por rondas con un tope de 2 y la recarga cuenta los turnos de la propia unidad y llega a 9 (`RECARGA_MAXIMA`). **La granada**: su alcance, `alcanceDeLaGranada` (la fuerza del cuerpo, al menos 1), y qué casillas alcanza con su cuarto, `casillasDeLaExplosion` (`battle/granada.ts`, el único que importa `data/granada.json`); quién puede lanzar y a dónde, `lanzarBlocker` (la recta no se mira); lo que le queda, `granadasQueQuedan` (las `cargas` de su pieza, `cargasDe`, menos `BattleStack.granadasLanzadas`); la que está en el aire, `BattleStack.granada`; a quién da, `explosionDe(state, at)`, la única regla que leen la explosión (`explotarLaGranada`, al abrir su turno en `alEmpezarSuTurno`, tras el disparo), la previsión (`PrevisionDeGranada`, cada impacto con `aliado`), la IA (`mejorGranada`, `ai/tactics.ts`) y el tablero (`pintarGranadas`, con sus `casillas`); sus opciones, `opcionesDeLaGranada`. Lo que sale al empezar un turno puede matar a quien empieza (su propia granada): un muerto no juega su turno, `advance` pasa al siguiente. `recargando`, `granada` y `granadasLanzadas` los escribe solo `battle.ts` (lo vigila `invariantes-batalla.test.ts`); un retoque de la arena que cambia la clase de tiro de un stack (`mismoTiro`) le quita lo apuntado, la granada en el aire y la recarga (`loADistanciaTrasElRetoque`). En el cliente, la jugada a distancia y lo que se ve con ella las elige el núcleo, `tanteoADistancia` (`disparo` con su recta, `granada` con su explosión, o `no` con el motivo; el botón, `aDistanciaBlocker`), que leen `ArmaDeLaActiva.tanteo` y la escena; el modo del selector llega al panel (`accionesDeLaUnidad`, `modo`); el estado, `estadoADistancia` (`views/campo.ts`: «Recargando: k», «Granadas: k de n»)

### El disparo diferido (25-10-2026, **regla nuestra sin validar por el usuario y sin ningún test**, por su decisión)

quién puede apuntar y a qué casilla, `apuntarBlocker` (con `disparoBlocker`, privada: tirador, sin moverse, sin un enemigo al lado; sin casilla, el botón); lo apuntado, `BattleStack.apuntado` (lo pone solo el `aim`, cierra el turno y viaja al espectador con el stack); la recta, `lineaDeTiro` (`board.ts`: la recta geométrica del centro del tirador al centro exacto de la casilla, 01-11-2026, con toda casilla que atraviesa, también por una esquina, en el orden en que entra, y por un lado entero, la del empujón del bando que tira, el defensor con el espejo; nunca por el marco) y a quién da, `lineaDelDisparo` (`a-distancia.ts`: el primer vivo que no es el tirador, de cualquier bando, también tras la casilla: la recta sigue hasta el borde, 01-11-2026; todas las casillas en que daría, con el cuarto de su tirada, `LineaDelDisparo.alcance`, que el tablero tiñe del frío al rojo del calor de la rueda; desde el suelo sube a lo alto del muro y da al primero que haya arriba en cualquier casilla de muro que cruce, pasando por encima de la esquina de suelo entre dos de muro, y la para bajar del muro o el lado de una puerta cerrada; desde lo alto nada; 06-11-2026, «Los disparos de abajo del muro al muro no dan»: la recta en diagonal rozaba antes la casilla de muro vacía de al lado, y en la muralla gruesa la columna de fuera tapaba la de dentro), la única regla que leen el disparo, la previsión, la IA (`aTiroLimpio`, `ai/tactics.ts`) y el tablero (`pintarDisparos`, `render/batalla/disparos.ts`, para los dos bandos y el espectador); el disparo, `dispararLoApuntado` (privada: al abrir el turno en `advance`; se borra lo apuntado); la tirada, `cuartoDelDisparo` (`damage.ts`: `max(0, CAIDA_DEL_DISPARO − o)`, con 4, los octavos de casilla a que pasa la recta del centro de la casilla del alcanzado, `octavosHastaLaRecta`, `board.ts`, en enteros; `DamageOptions.cuarto`, fija), y las opciones del daño, una vez, `opcionesDelDisparo` (`a-distancia.ts`, con lo alto de un muro: el disparo, su previsión y la IA); la salpicadura no da al tirador (`splashTargets`). La recta de `lineaDeTiro` se recuerda por par de casillas y bando; el tablero recuerda las de lo apuntado por batalla y largo del registro (`lineasApuntadas`) y la escena el tanteo por casilla y jugada (`tanteoEn`). En el cliente, **el selector de arma** (26-10-2026, petición del usuario: «Un arquero no puede cargar, le sale la casilla de cargar pero solo puede disparar. En lugar de apuntar como accion, que haya un selector de arma para usar»), `ArmaDeLaActiva` (`batalla/arma.ts`, una pieza para `Session` y `SesionDeArena`): solo el tirador activo (`isShooter`) lo lleva, «Cuerpo a cuerpo (Daga)» o «A distancia (Arco)» (`botonesDeArma`, `batalla/poderes.ts`; la Q alterna); empieza en «A distancia» si puede apuntar y vuelve a él con otra activa u otro turno. **El modo es del cliente**: decide qué de la lista legal se ofrece (`delModo`: «A distancia», ni `move` ni `attack`; «Cuerpo a cuerpo», ni `aim`), y de esa lista salen lo que marca el tablero y lo que hace el clic (`golpeEnPixel` ya no conoce el `aim`: antes ganaba al golpe y el arquero veía sus casillas de andar y de cargar pero el clic solo apuntaba); en «A distancia», el clic en cualquier casilla apunta, a la de la unidad pulsada si se pulsa una (`casillaDelDisparoEn`), y el tanteo, que juzga el núcleo. `ataqueBlocker` es solo del golpe. El contrato del agente y la IA no cambian

### Carga: cuándo, quién y cuánto

cuándo, `cargaDesde` (la recta: con el objetivo en ella, libre y que quepa lo que cuesta salir del contacto; lo de muchas preguntas, `medirCargas`, con la carrera que se anda, `CargaMedida.carrera`); cuánto, `CARGA` (`battle/carga.ts`, `data/carga.json`: la misma para todos desde el 26-10-2026); si va montada, `cargaMontada(unit)` (montura de guerra y lanza: `GolpeConArma.carga`; la leen la IA, la ficha y el dicho), y su horquilla la decide una vez el golpe (`deUnGolpe`, `damage.ts`: la de la carga montada o la del arma, que leen la tirada, el daño medio y la previsión); el tope, `cargaEfectiva`; la del índice, `porcientoDeLaCarga`; lo que se enseña, `casillasDeCarga` (con `CasillaDeCarga.porciento`); las frases, `dichoDeLaCarga` (la carga cobrada: parte y previsión) y `dichoDeLasCifras` (la ficha); la recta mínima, `CARGA_MINIMA` (de `carga.ts`). La carga la cobra solo el primer golpe (`intercambio`)

### Turno de batalla

`BattleState.turno` (`n`, ordinal); `mismoTurno`; viaja como `turnId`

### Tope de jugadas

`MAX_JUGADAS`

### Montar una batalla (un solo combate, 19-10-2026)

`createBattle(atacante, defensor, rng, muralla?)`, la única puerta, también la de la arena (`batallaDeArena`) y la del mapa (`montarLaBatalla`, con la muralla de su sitio): sin interruptores ni ramas de fheroes2. Lo vigilan dos guardias de `invariantes-batalla.test.ts`: «una puerta para montar batallas» (el estado entero lo escribe solo `createBattle`, y `core/arena/` lo importan solo la arena, la sesión y `capturas`) y «nadie escribe fheroes2» (ni el literal ni los nombres retirados)

### El despliegue (02-11-2026, «Añade al combate una fase previa de despliegue»; `docs/agents/2026-11-02-fase-de-despliegue/`)

dónde sale cada uno, `asentar` (`battle/despliegue.ts`, la única regla: lo pedido, en su zona y libre; el resto, al primer hueco de su zona del centro hacia fuera; sin nada pedido, las casillas de siempre; lo lee también el reasiento al abrir una tanda, `asientoAlAbrir`); la zona de una unidad, `zonaDeSalida` desde `alcanceDelDespliegue` (la única lectura de `UnitInfo.despliegue`, `{ columnas, momento }`: **el enganche de la infiltración**, que hoy no escribe nadie); el orden, `TANDAS` (defensor, atacante, y luego los dos «tras el enemigo»); la casilla que vale, `colocarBlocker` (muro, ocupada por el rival, fuera de su zona; la de uno de su tanda, se cambian: `suyoEn`); lo que ve cada bando, `batallaALaVista` (lo propio y lo de las tandas cerradas); el estado, `BattleState.despliegue` (`despliegueDe`), que mueven solo `createBattle`, `aplicarDespliegue` y `terminarElDespliegue` (`battle/despliegue.ts`; lo vigila `invariantes-batalla.test.ts`), y lo que no vale con él, `despliegueEnCursoBlocker` (lo primero de `applyAction`); `autoResolve` lo cierra antes de pelear y el director lanza si le llega uno. Quién despliega a mano, `BattleSide.despliegaAMano`: `montarLaBatalla` en el bando de la persona (también la batalla que rehace la defensa elegida) y la arena en sus lados «Yo» (`batallaDeArena(…, aMano)`); sin él, la tanda pasa sola y la batalla sale en la ronda 1 como antes (el banco no cambia). En el cliente, `DespliegueEnPantalla` (`batalla/despliegue.ts`, una pieza para `Session`, `SesionDeArena` y la tropa; `listoTalCual`) y `batalla/colocar.ts` (el tablero, el puntero y el clic al colocar: `tableroAlColocar`, `clicAlColocar`; la instrucción, `COMO_SE_COLOCA`); **la escena y los paneles solo leen `ControlDeBatalla.batallaALaVista`**, y la batalla entera, `batallaEntera`, solo el animador, que coloca a cada uno en su casilla mientras dura el despliegue (lo vigila `invariantes-cliente.test.ts`); `claveDeBatalla` lleva `firmaDelDespliegue`

### La formación del héroe (02-11-2026)

su casilla de salida, en el individuo: `Troop.salida` y `Hero.salida`, en el marco del atacante (el defensor sale en su espejo); viaja con él (licenciar, equipar, la guarnición) y en la batalla en `OrigenDelStack.salida`, de donde la devuelve `settleBattle`; lo que no tiene casilla la recibe de `asentar`. Cambiarla, la acción `formar` (`formarBlocker` = `heroeSuyo` + `puestoBlocker` + `colocarBlocker` sobre la batalla de la formación; `formar` juega `aplicarDespliegue` sobre ella y copia cada casilla a su `salida`: las reglas son las del despliegue); la batalla de la formación, `batallaDeLaFormacion` (un `createBattle` con el defensor vacío: lo que se ve es lo que saldrá), y la traducción portador ↔ stack, `stackDelPortador`/`portadorDelStack` (`state/batallas.ts`, por `origen` y `slot`, nunca por el id). En el cliente, **la escena de la tropa es el tablero de despliegue** (`partida/tropa/escena.ts`, con `Session.formacion`, el mismo `DespliegueEnPantalla`); el semicírculo (`render/tropa/`) se retiró el 02-11-2026. Retocar el despliegue en una batalla no cambia la formación guardada

### La rueda del golpe

`battle/rueda.ts`: `puntoDelCruce`, `tiradaDelPunto`, `cruceBlocker`, `efectosDeLaRueda` (la lista de lo que deja un golpe, sacada de `efectoDelTipo`; su origen, el tipo jugado; cuándo vence, `CuandoVence`, dicho con `duracion`), `contraataqueDelCruce` (el punto va en el `attack` devuelto); cuántos golpes, `golpesDe` (`battle/armas.ts`, la única cuenta de `melee` y la previsión); al daño, en números (`DamageOptions.cruce`: `damage.ts` no importa `rueda.ts`), solo por `cruceDelGolpe` desde `opcionesDeDanio`; la previsión, `previsionDeLaRueda` (con `niveles`, el arma de quien pega en las dos fases: el tinte del diálogo); al responder, el golpe que viene, `previsionDelGolpeQueViene` (por respuesta, lo menos y lo más que quita el atacante según lo que elija, topado en la vida, y qué golpe tumba; solo para quien lo pinta: el agente no lo recibe, 01-11-2026); la carga que cobra quien pega, `cargaDeLaRueda` (`carga.ts`), y la del registro, `cargaDelCruce`. **El paso del cruce es del núcleo**: plantar a quien pega, `plantarse` (junto a `soltarElGolpe`, `battle.ts`), y `pasoDelCruce` (`ai/rueda.ts`: la jugada lista o lo que falta, ya plantado), con `completarCruce(…, LaIAElige)` y el único sorteo, `elegirEnLaRueda`; lo conducen solo `CruceDeLaRueda` (las dos sesiones del cliente) y el director (`conLaRueda`, `server/director.ts`), lo vigila `invariantes-batalla.test.ts`. El golpe plantado que espera la rueda, `BattleState.golpeEnCurso` (sin carga, ya anduvo; **con carga, no ha corrido** y guarda la carga por correr, `GolpeEnCurso.carga`, una `CargaMedida` con la carrera hasta su llegada: la carga se elige antes de correr, 31-10-2026, y el registro de una carga es `cruce`, `move` con `charge`, `attack`; plantado, `casillasDeCarga` da la carga plantada; lo pone el `attack` sin elecciones y lo quitan el golpe y `soltarElGolpe`; lo que no vale con él, `golpeEnCursoBlocker`); el tramo de andar tras la Finta, `TurnoDeUnidad.finta` (lo pone solo `melee`, lo vigila `invariantes-batalla.test.ts`). **La rueda con el arma, por niveles** (18-10-2026; absolutos desde la vuelta 2): la tabla de lo que da cada nivel (0 a 6, `NIVEL_MAXIMO`) de cada tipo del anillo (`TIPOS_DEL_ANILLO`; Normal no tiene nivel), `TABLA`, privada de `battle/cifras-de-la-rueda.ts` (sin dependencias del núcleo, para que `problemasDePieza` juzgue la rueda de una pieza con `problemasDeNiveles`), y su única lectura, `cifrasDeLosNiveles` (Romper guardia y la Finta, por éxito y en enteros; memorizada por objeto de niveles), que llaman solo `ruedaDelGolpe` (`battle/armas.ts`) y `filasDeLaRueda` (lo vigila `invariantes-batalla.test.ts`); los niveles del arma, `Pieza.rueda` (`NivelesDeLaRueda`, los seis, también los 0), que `conEquipo` copia a `GolpeConArma.rueda`; las cifras de un golpe, `ruedaDelGolpe(unit, uso)`, que lanza sin arma, y sus niveles, `nivelesDelGolpe`; el nivel de cada tipo de una forma, `nivelesEnLaForma` (`formas-de-la-rueda.ts`: solo para enseñar); Fuerte y Rápido con el arma de cada golpe (`conElGolpe`), lo demás con la del primero del intercambio (`ruedaDelIntercambio`); cuántos golpes da Rápido, `GOLPES_DEL_RAPIDO`; un arma nueva, con la de la Espada (`nivelesDeLaEspada`, `core/unidad/formato.ts`, leída de `data/equipo.json`); los pesos de la IA, aparte (`PESOS_DE_LA_RUEDA`). **Sin arma no se combate**: una unidad sin un arma de cuerpo a cuerpo que golpee en la rueda no vale (`armaDeCuerpoBlocker` con `golpeaEnLaRueda`, en `equipoDeUnidadBlocker`), el héroe nace con la Espada (`EQUIPO_BASE`, `ESPADA`) y el arma no se quita (`unequipBlocker`). Las fases del turno (`libre`, `movido`, `plantado`, `trasLaFinta`), `faseDelTurno`, y lo que no vale en cada una, `faseBlocker` (lo leen `applyAction`, la lista legal y el principio de cada `*Blocker`); la firma del turno (con la Finta y el golpe plantado), `firmaDelTurno`, que leen `Movibles` y la clave de la sesión

### La complejidad del combate (22-10-2026)

`ReglasDelCombate` (`core/combate.ts`: `tope` de tropa por bando, héroe incluido, y `rueda`, 3, 5 o 7 cada uno; `COMBATE_COMPLETO`, 7 / 7; los topes, `LIDERAZGO.topesPorBando` de `data/liderazgo.json`, y `maxPorBando`, el mayor, derivado: el techo de los datos y del generador), `parseTope`/`parseRueda` (un parser, `deLaLista`, y una frase por campo con `combateBlocker`; `?tropa=`, `?rueda=`, `HEROES_TROPA`, `HEROES_RUEDA`, `--tropa`/`--rueda` del barrido), `combateCon` (lo pedido y la de siempre en lo demás); en la URL de la partida, `combateDeLaURL`/`combateALaURL` (`client/partida/combate-en-la-url.ts`, con `?solo-heroe=1`; el menú arranca con ella, `combateParaElMenu`); lo guarda `GameState.combate` (`newGame({ combate })`) y lo pide `createBattle(…, combate, muralla?)`, obligatorio, que pone `BattleState.rueda`; el cupo del héroe, `cupoDelHeroe(tope)` y `capacidadDe(hero, tope)`; lo neutral al tope, `loNeutralAlTope` (una copia; al nacer en `createGame` y al brotar en `dondeBrotan`: el mapa no depende del tope); el tope de un bando de la arena, `topeDelBandoBlocker` (`MontajeDeArena.combate`, obligatorio). **Las formas de la rueda** (`battle/formas-de-la-rueda.ts`): la de una batalla o una partida, solo `formaDeLaBatalla` (nadie más indexa `RUEDAS`); la de 7 fija, `RUEDA_DE_REFERENCIA` (el índice de poder y la ficha de un arma, `ruedaDeLaPieza`: la única del cliente); cada forma con anillo, centro, cruce `distancia` o `ciclo` (dicho una vez por forma, `dichoDelCruce`: «el de enfrente» solo con un anillo par; los puntos que da, derivados de `puntoDelCruce`, `puntosDeLaForma`, que leen las notas por éxito, la horquilla de cada sector y las muescas del medidor; en un ciclo, a quién gana y con quién pierde cada tipo, `cicloDe`, dicho `dichoDelCiclo`), el golpe que no deja nada, `golpeNeutro` (Normal, o `null` en la de 3: nadie escribe `'normal'` para jugar), `golpes` (lo único que se itera para jugar; `TODOS_LOS_GOLPES` solo valida) y lo que `renombra`; `PARTES`; los nombres, `NOMBRE_DE_GOLPE` (los diez) y `nombreEnLaRueda`; si un tipo es de la rueda, `tipoDeGolpeBlocker(x, forma)`; el efecto de un tipo, `efectoDelTipo` (un fusionado, cada parte a la mitad, `aMedias`) y cuántos golpes, `golpesDelTipo`. Lo vigila `invariantes-batalla.test.ts`. «Solo la rueda del héroe», `Session.soloRuedaDelHeroe` (`?solo-heroe=1`), con `LaIAElige` por stack

### Forma del tablero de batalla (qué casillas existen, su espejo, la frase del contrato)

`board.ts`: `isInside`, `allHexes` (la lista congelada; su posición es `indiceDe`), `filasDelTablero`, `espejo`, `desplazamientoDeFila`, `EXTENSION_HORIZONTAL`, `ULTIMA_FILA`, `codigoDeLado`, `FORMA_DEL_TABLERO`, `tableroDelContrato`; fuera de `board.ts` nadie importa `anchoDeFila`, `ANCHO_DE_FILA_*` ni `BOARD_HEIGHT` (lo vigila `invariantes-batalla.test.ts`, por importación)

### Muros, puertas, niveles y tiro tapado de la batalla

`battle/muralla.ts` (`pasoPermitido`, `bonoEnLoAlto`, `validarMuralla`, con su material obligatorio, `MurallaDeBatalla.material`: `piedra` o `madera`, `MATERIALES_DE_MURALLA`, `esMaterialDeMuralla`; lo que ya devolvió lo devuelve tal cual, así que `createBattle` la pide siempre y las batallas de un sitio comparten su objeto y sus cachés; lo que tapa un disparo, `lineaDelDisparo`, en `battle.ts`); «esta batalla no tiene muralla», `SIN_MURALLA`, y el editor de la arena parte de `murallaVacia('piedra')`; la regla dicha, una vez, `reglaDeLaMuralla` (con las palabras de quien la lee: la arena, `REGLA_DE_LA_MURALLA`; el agente, `PROSA_DE_LA_MURALLA`); la salida de cada bando, `battle/salida.ts` (solo de `board.ts`): la zona de unas columnas sin muros, `zonaEnSuMarco`, que lee el despliegue (`zonaDeSalida`), y si caben tantos en las de todos, `salidaDe`, que lee la regla del mapa, con la misma frase (`noCabenEnLaSalida`; fusión del 05-11-2026: el despliegue la había vuelto a escribir); al montarla, `createBattle(…, muralla)`: la arena, la que se dibuje (de piedra); la batalla del mapa, la de su sitio (abajo)

### El arte de la muralla en el tablero de batalla (06-11-2026, «falta arte para el muro en combate… también para la escalera»)

medidas y nombres, `shared/muralla-de-batalla.ts` (`ALTO_DE_MURALLA` y `PORTADA` viven ahí; las piezas, `PIEZAS_DE_LA_MURALLA` y `PIEZA_DE_LA_ESCALERA`); el arte son **materiales que se llevan a su sitio**, no un sprite por columna (la cámara va de 25° a 35°): la cara (`cara-<material>`, un alzado de `RODAJAS_DE_LA_CARA` caras de hex con su remate encima: cada cara de una columna lleva una rodaja con una afín, la del sureste a la sombra; el remate, solo en las aristas que dan fuera, `daFuera`), la tapa (`tapa-<material>`, textura en un encaje común, `rellenoDeLaTapa`), la portada abierta (su paso recortado, `pasoDelArco`) y cerrada, y la escalera, tendida del pie a lo alto; lo pinta `render/batalla/arte-de-la-muralla.ts` (pide su arte con la primera batalla que lleva muralla, `pedirElArteDe` → `pedirArteDeLaMuralla`), que llaman `pintarColumna`, `pintarPortada` y `pintarEscalera` (`batalla/muralla-pintada.ts`: la partida, la arena y el espectador); sin la imagen, el marcador de siempre (`ACABADO_DEL_MURO`). Lo tapado de una portada o una escalera se ve a trasluz sobre la pieza que la tapa (`aTrasluz`, con el arco de la puerta en contorno; sustituye a las hojas en naranja), y quien está en lo alto de la columna de detrás de una puerta se pinta tras su portada, cuyas almenas le tapaban los pies (`portadaDelAdarve`). Las cajas, del índice derivado `assets/batalla/muralla/indice.json` (`medirLaMuralla`, `pnpm taller derivar-muralla-batalla`; lo juzga al cargar `leerIndiceDeLaMuralla` y lo vuelve a medir `test/muralla-de-batalla-arte.test.ts`); las guías y los encargos, `tools/taller/muralla-de-batalla.ts` (`pnpm taller encolar --muralla-batalla`; la cerrada es la edición de su abierta), en `assets/batalla/muralla/_guias/`, fuera del build

### Previsión de daño (barra de la partida y de la arena)

`previsionDe` → `horquillaDeDanio`, `trasElGolpe`; opciones del golpe, `opcionesDeDanio`

**El golpe cuerpo a cuerpo, cruce a cruce de la rueda** (#253 y #264, 11-11-2026,
`docs/agents/2026-11-11-prevision-de-la-batalla/`): todo golpe va con la rueda y en un punto del
cruce no hay dado, así que la barra ya no prevé con la horquilla del dado (que Fuerte o Rápido, de
quien pega o de quien responde, rebasaban). `previsionDe` de un `attack` sin elegir es la
envolvente de **todos los cruces** de la rueda de la batalla, golpe contra respuesta
(`previsionDelIntercambio`); con lo elegido, solo de esos (los dos: un cruce, exacto). Cada cruce,
`intercambioEnElCruce`, como lo juega `melee`: el punto, Defensivo a quien pega, sus golpes en ese
punto cada uno solo si el atacado sigue en pie (la carga, el primero), y, si lo devuelve, el atacado
con lo que le queda y lo que el golpe le deja (`atacadoAlDevolver`, la copia común con la previsión
de la rueda: el miedo y Romper guardia) y la respuesta en el punto contrario. `PrevisionDeGolpe.golpes`
y `PrevisionDeContraataque.golpes` son horquillas (Rápido); `danio`, cada golpe que llega, el primero
y los que siguen (`siguientes` se fue); la «Cuenta» va sin la rueda. La barra lo dice «según la
rueda» (`textoDePrevision`). Los disparadores de un hechizo entre golpe y contraataque (`saltar`) no
entran en ninguna previsión (backlog). `previsionDeLaRueda` no cambia (la lee el agente). Lo vigila
el barrido de `test/prevision.test.ts`: todo cruce de las tres ruedas, sin excluir Fuerte ni Rápido,
y las puntas pasan de verdad.

### Un hechizo: su formato, si vale y su catálogo (06-11-2026, el editor de magia; `docs/agents/2026-11-06-editor-de-magia/`)

el tipo es el JSON (`Hechizo`, `core/magia/formato.ts`: entrega, objetivo, área, afecta, duración, `seAcabaSiMuere`, sus facciones y efectos de un vocabulario cerrado, cada palabra con su frase en `VOCABULARIO_DE_LA_MAGIA`); todo lo que no vale a la vez, `problemasDelHechizo` y `leerHechizos` (`magia/validar.ts`), y como poder de una unidad, `problemasComoPoder` (y de su facción, `poderDeUnidadBlocker`, `unidad/formato.ts`). **Las facciones** (08-11-2026, petición del usuario: «que cada hechizo pueda pertenecer a una o varias facciones»; `docs/agents/2026-11-08-facciones-de-los-hechizos/`): `Hechizo.facciones`, obligatorio, una o varias de `FACTION_IDS` sin repetir; `problemasDelHechizo` rechaza que falte o no sea una lista, que esté vacía, una que no existe (nombrando las que valen) y una repetida. Sin compatibilidad hacia atrás: un hechizo sin facciones no carga; `data/hechizos.json` lo importa solo `magia/catalogo.ts` (`HECHIZOS_DEL_JUEGO`, `hechizo`, `hechizosDelGremio`, `ordenDelLibro`, `nombreDeHechizo`; lo vigila `invariantes-datos.test.ts`); lo que hace en una frase, `queHaceElHechizo` (`magia/dicho.ts`); lo que el editor le hace, `magia/editar.ts`

### Lanzar un hechizo (del héroe y poder de una unidad)

la batalla lleva su libro resuelto al montarse (`BattleState.libro`, `createBattle(…, hechizos)`; uno, `hechizoDeLaBatalla`); quien lanza, `Lanzador` (el cuerpo del héroe con su poder, o la unidad con poder 0); qué se apunta, `queSeApunta`; si vale, `castBlocker` y `poderBlocker` (con `apuntadoBlocker`: entrega, bando, distancia); a quién alcanza, `afectadosDe`; **la única aplicación**, `lanzarHechizo` (`battle.ts`: lo diferido, `hechizoEnElAire`, cae en `caerElHechizo`; a una unidad, el hecho de siempre; a varios, un `spell_hit` por alcanzado); lo que cuelga, `efectoColgado`, `cuantoDura`, `resolverEfecto`/`resolverDisparador` (`battle/spells.ts`); los disparadores, `saltar`; la muerte, solo `anotarLaMuerte` (quita lo de «se acaba si muere» y salta `alMorir`; lo vigila `invariantes-batalla.test.ts`); la previsión, `previsionDeLanzar` (`impactos`), que lee también la IA (`rindeDe`). Un poder es un hechizo de `Unidad.hechizos` (`data/poderes.json` se fue); `UnitInfo.poderes` lo pone solo `unidadDeCombate`. En el cliente, `PoderesDeLaActiva` y `LibroDeBatalla` (lo que va a una casilla, `loApuntadoEnCasilla`; sobre sí, se lanza al elegirlo)

### Levantar un cadáver (08-11-2026, «Haz un hechizo de levantar zombi»; `docs/agents/2026-11-08-levantar-zombi/`)

el objetivo `cadaver` (`OBJETIVOS`, `magia/formato.ts`; se apunta con `at`, como una casilla, pero es su propio caso: `queSeApunta` da `'cadaver'` y cada lector despacha con un `switch`, desde /simplify, 09-11-2026) y el efecto `levantar` (`{ vivos, de? }`, solo con `cadaver`, nunca en un disparador; con `libre`, `contacto` o `alcance`, sin diferido, área ni `afecta`, y como único efecto: `problemasDelCadaver`, `magia/validar.ts`, con un retorno temprano antes de las reglas de los vivos). Que las unidades que nombra existan y que lo nombrado en `de` sea no-muerto, con el catálogo de unidades delante: `levantadosBlocker` (`unidad/formato.ts`, desde `leerCatalogos`: la carga y «Guardar»). Qué sale de cada cadáver, **una regla**: `queLevanta` (`battle/spells.ts`: del héroe, nada; lo nombrado en `de`; de un vivo de cualquier bando, `vivos`; de otro no-muerto, nada). Qué cadáver: `cadaverEn` (`battle/consultas.ts`, el último en caer de la casilla por el orden de su `perished`, S3: recorre el registro hacia atrás); gastado, `cadaverGastado`, **derivado** del levantado (`OrigenDelStack.levantadoDe`), sin marcar el cadáver (A1 del plan). Los rechazos, en `apuntadoBlocker` → `cadaverBlocker` (`battle/lanzar.ts`): alguien vivo encima, ningún cadáver, «ya se levantó», el cuerpo del héroe, de ese no sale nada, la distancia; sin apuntar, «no hay ningún cadáver que levantar» o, si los hay pero ninguno a su alcance, «ningún cadáver que se pueda levantar está a su alcance (4 casillas)» (H2 de QA, 09-11-2026: el botón decía que no había ninguno; la mitad sin distancia, `cadaverEnLaCasillaBlocker`); la ayuda del panel con un hechizo elegido dice qué se pulsa por `queSeApunta` (`SpellOption.apunta`, `batalla/panel.ts`; H4: decía siempre «la unidad objetivo»); `jugadasDeLanzar` ofrece una casilla por cadáver que vale. **El único `stacks.push` fuera de `createBattle`**: `levantar` (`battle.ts`, privada, desde `lanzarHechizo`; lo vigila `invariantes-batalla.test.ts`): un stack nuevo de 1 (`stackNuevo`, `battle/stack-nuevo.ts`: la misma forma que al montar), novato, id `<bando>-<slot>` con el `slot` siguiente al mayor de su bando (pierde los empates), `acted` (sin turno en la ronda en que nace, S2; entra en la siguiente), la moral de quien lo lanza (un no-muerto, 0), **sin contar contra el tope** (el tope se mira al montar), y el hecho `raised` tras el `cast`/`power`. Sus cifras se resuelven al montar, por la misma puerta que las de cualquier stack (`resolveUnit`): `BattleState.levantables` (sin bando, lo que nombran los `levantar` del libro: `levantablesDe`, `montaje.ts`), que la arena rehace tras un retoque. La IA no lo lanza ni lo prevé (`rindeDeLaJugada`, `ai/tactics.ts`: backlog). Lo leen el parte («se levanta…»), el animador (el paso `raised`: el levantado no se ve hasta contarse y el cadáver gastado deja de pintarse), el resumen (`SIGUEN_AL_HECHIZO`; un levantado que cae es una baja más, `initialCount - count` sigue exacto) y el espectador (`levantadoDe` viaja; `mismaBatalla` acepta stacks nuevos al final). Al acabar, lo levantado vuelve con su bando: `docs/areas/partida.md` («Lo que sobra tras la batalla»)

### Lo que dura un hechizo sobre un stack

`StackEffect` es una unión por `kind` (`effects.ts`: las cifras, con `effectTotal`; `impide`, leído solo por `impedidoPor` desde los `*Blocker`; `escudo`, gastado solo en `herir`; `disparador`, con `disparadoresDe`); la armadura con lo de un hechizo, `armaduraEnLaPelea`; la fuerza y la agilidad en el daño, `danioConLosEfectos` (`unidad/cuerpo.ts`, desde `deUnGolpe`); su texto, `dichoDelEfecto` y `dichoCortoDelEfecto`

### Salir del contacto

`battle/contacto.ts`: lo que cuesta salir con N al lado, `salirCuesta`, y la frase de quien no sale (`fraseDelContacto`, que nombra la Finta si fue ella); en `battle.ts`, cuántos hay en contacto, `enContactoEn` (la única cuenta, por `canReachMelee`, a distancia 1), lo que cuesta salir de cada casilla en un recorrido (`costesDelPaso`: el volador, solo al despegar), por qué no sale (`contactoBlocker`, que leen `movimientoBlocker` y el panel) y el recorrido (`recorrer`, que leen `movableFrom` y `porElLado`; sin enemigo cerca, la búsqueda de siempre); la búsqueda con costes, `alcanceConCostes` (`board.ts`, igual que `reachable` con coste 1, con `CosteDeSalir`), y la carrera de la carga por la recta, `carreraConCostes` (desde `medirCargas`)

### Armadura (#262)

la resta, `trasLaArmadura` (`battle/armas.ts`; la llama `herir`, así que todo lo que quita vida la paga; la leen también la previsión, el índice y `expectedDamage`); la lectura, `armaduraDe` (`UnitInfo.puntosDeArmadura` lo escribe solo `conEquipo` y lo leen él y `battle/armas.ts`; lo vigila `invariantes-batalla.test.ts`); qué pieza la lleva, la de su hueco (`camposDelHueco`), y ninguna da PV (`problemasDePieza`); lo que paró, `parado` de punta a punta (`Herida`, `TrasLaArmadura`, el evento y el lienzo)

### Dónde responde cada sector de la rueda y dónde va lo suyo

`formas` (un `<clipPath>` por tipo con la forma de `sector`, la que pinta el disco) y `ajustarLaRueda`, que recorta a ella cada botón, del tamaño del plato (#258); el rótulo y el «ⓘ», por el ángulo del sector, `sitioEnLaRueda`, y hacia dónde abre su nota, `haciaDe` (`client/batalla/rueda/rueda.ts`): nada se coloca por tipo

### Los dos que se cruzan en la rueda

`contrincante` (`batalla/rueda/rueda.ts`), con su figura (`figuraDelContrincante`, `FigurasDeLaRueda`, `batalla/rueda/figuras.ts`, que anima `DialogoDeLaRueda`) y quién mira, de la sesión (`SesionConRueda.quienMira`: con uno, «Tu golpe», «Tu respuesta», «(tú)» y «(rival)»; el espectador, nadie); lo que cada página pone alrededor, `CaraDeLosContrincantes` (la arena, `caraDeLaArena`: el botón de su ficha de solo lectura, `abrirEditor(…, true)` en `arena/main.ts`, y su vista previa, `vistaPrevia` y `filasDelStack`, las mismas filas del panel de la activa, con `efectoEnCurso` de `views/notas.ts`); en el tablero, `EscenaBatalla.enLaRueda` → `VistaBatalla.enLaRueda` (#261; el espectador, de `BattleAnimator.losDelCruce`)

## Reglas del juego

### Rejilla de batalla

**regla nuestra** (fheroes2: 11 × 9 = 99): 9 filas, las pares de 12 y las impares de 11 = 104 hexes, offset odd-r, simétrica de izquierda a derecha (`FORMA_DEL_TABLERO`, `espejo`; el índice es compacto, la posición en `allHexes`). El defensor sale en el espejo del atacante, y su disparo va por la recta espejada: la del atacante lleva el empujón (`+3, −1, −2`) y la del defensor su espejo (`lineaDeTiro`), y si en un empate de borde una sale del tablero va la otra (nunca se tira por el marco). Hasta el disparo diferido (25-10-2026) el tiro era generoso, pasaba con cualquiera de las dos (`lineaLibre`, que se fue con él)

### Puntos de hechizo

10 × Conocimiento

### Moral

−3 a +3. **La moral no tiene efecto en la batalla** (regla nuestra, 26-10-2026, decisión del usuario: «La moral solo debe servir para la huida, nunca dar un turno extra»; con el +1 de una sola facción, un escudero de 6 casillas andaba 6 + 6 en la ronda 1 y cruzaba el tablero): ni da turno extra ni lo quita, y no hay hecho `morale` en el registro. Se sigue calculando (mezcla de facciones, no-muertos, `moraleBonus` del héroe y los edificios) y se ve en la ficha, a la espera de la huida, que aún no existe y se diseñará con el usuario.

### Suerte

**no hay** (02-11-2026, decisión del usuario: «Elimina la suerte completamente del juego»): ni tirada de golpe afortunado o desafortunado, ni suerte en el stack ni en el héroe (la habilidad `luck`). Se fueron con ella Bendición y Maldición (el gremio de nivel 2 se quedó sin hechizos), el poder Bendecir, el rasgo `curse_on_hit` y la inmunidad de los no-muertos, que era solo a la mala suerte (los hechos `luck` e `immune`)

### Moral por mezcla de facciones

se cuenta al empezar la batalla y no se recalcula al morir un stack (como fheroes2, #49)

### Moral con no-muertos

−1 a todo el ejército que lleve alguno, y anula el +1 de una sola facción (como fheroes2, #199); el no-muerto sigue a 0. **Sin copiar**: allí un ejército de una sola criatura repetida no cobra el +1 (`AllTroopsAreTheSame`)

### Prisa/Lentitud

duran el poder mágico del lanzador, en rondas

### No-muertos

moral 0

### Iniciativa

cada bando por velocidad y puesto; un empate entre bandos lo gana el contrario del último que tuvo turno, el atacante el primero (como fheroes2, `GetCurrentUnit`, #199). **Divergencia pendiente**: la velocidad es la de empezar la ronda; allí una Prisa a media ronda adelanta

### Dos efectos del mismo origen

refresca la duración (la mayor), no se acumula

### Turno de una unidad

**regla nuestra**: se mueve en tramos hasta gastar su velocidad; atacar o apuntar lo cierra, y «Terminar turno» (`end_turn`), también sin moverse; tras moverse no apunta. Sin defenderse ni esperar (26-10-2026, decisión del usuario: «Quita las acciones de defender y de esperar»); el agente que manda `wait` o `defend` lee que se retiraron y que mande `end_turn`

### Despliegue

**regla nuestra** (02-11-2026, petición del usuario: «En un combate el despliegue lo hace primero el atacado, sin los enemigos, y luego el atacante con los enemigos visibles»): toda batalla empieza en despliegue; despliega primero el defensor sin ver al enemigo y después el atacante viéndolo, y luego, en el mismo orden, lo que despliega «tras el enemigo» (hoy nadie). Cada unidad, el héroe incluido, en las 3 columnas de su borde (`COLUMNAS_DE_SALIDA`) salvo lo que diga su `despliegue` (la infiltración, por hacer), sin muro debajo; se parte de la formación guardada del héroe, o de la regla de siempre (el héroe en el centro de la columna del borde y la tropa, por su puesto, del centro hacia fuera). La persona lo cierra con «Listo»; la IA, el agente y lo que no es de nadie despliegan solos. El desempate de iniciativa sigue por puesto en la tropa, no por casilla

### Disparo diferido

**regla nuestra** (25-10-2026, petición del usuario, **sin validar y sin ningún test** hasta que la juegue: «podría no ser jugable o tener que cambiarlo mucho»): un tirador sin moverse y sin un enemigo al lado **apunta** a una casilla del tablero (`aim`, cualquiera menos la suya) y eso cierra su turno. **Al empezar su siguiente turno**, antes de que elija nada, sale el disparo desde donde esté por la recta que une el centro de su casilla con el centro exacto de la apuntada (`lineaDeTiro`), y da al **primero** que encuentre en una casilla que la recta atraviese, aunque solo le roce una esquina, **sea del bando que sea**, también tras la casilla: la recta sigue hasta el borde del tablero (01-11-2026, decisión del usuario: «no debe acabar en la casilla apuntada, en las siguientes también da»); sin nadie, no da a nadie. Desde el suelo sube a lo alto del muro y da al primero que haya arriba; lo para bajar del muro (lo de detrás no se alcanza) o una puerta cerrada; desde lo alto de la muralla, nada (06-11-2026). La tirada va por la horquilla del arma de distancia: en el cuarto `max(0, 4 − o)`, con `o` los octavos de casilla a que pasa la recta del centro de la casilla del alcanzado (01-11-2026, decisión del usuario: «que sea por la distancia de la línea de tiro al centro de la primera casilla donde hay alguien»; los octavos, inventados: por el centro, la máxima; a media casilla o más, la mínima; antes, por la distancia a la casilla apuntada), y luego ataque contra defensa y armadura como siempre; `double_shot`, dos tiros, cada uno al primero de la recta; la salpicadura no toca al tirador. Si el tirador muere o la batalla acaba antes, se pierde. Tras el disparo el turno sigue: apunta otra vez o actúa como siempre. Fuera el −50 % a más de 5 casillas. La casilla y la recta se ven para los dos bandos, con cada casilla de la recta teñida por la tirada que daría en ella

### Armas de fuego

**regla nuestra** (02-11-2026, petición del usuario: «Como podrian funcionar las armas de fuego? Y las granadas? Me gustaria evitar meter un factor aleatorio»): pistola, arcabuz y culebrina disparan como el disparo diferido, sin dado, con dos diferencias. **Perforan la armadura** («Nada, fija»): su disparo llega entero. **Recargan**: tras salir el disparo, la unidad pasa los turnos de `recarga` de su pieza sin poder apuntar, contando el del disparo (decisión del usuario: con 1, apunta un turno sí y otro no). Su horquilla es la de su propia agilidad, [F, F × agilidad del arma] (decisión del usuario: «agilidad del arma»): la pistola, de agilidad 1, pega siempre lo mismo. Las cifras, a ojo y ya en la escala de los humanos a fuerza 3, en `data/equipo.json`

### Granadas

**regla nuestra** (02-11-2026, misma petición): una pieza de `distancia` con `tiro: granada`; quien la lleva no es tirador: **lanza** (`throw`) a una casilla a su alcance —la fuerza de su cuerpo, al menos 1 (decisión del usuario: «Fuerza»), ni la suya—, sin moverse y sin un enemigo al lado, y eso cierra su turno. Va **por encima**: no la para nadie, ni un muro ni una puerta. **Explota al empezar su siguiente turno**, antes de que elija, en la casilla (la tirada en el cuarto 4 de la horquilla de su golpe a distancia) y en sus seis vecinas (el cuarto 2), a todo vivo de cualquier bando, quien la lanzó incluido; la armadura se resta como siempre; sin dado (`data/granada.json`, inventado). Si quien la lanzó muere o la batalla acaba antes, no explota. **Se gastan**: cada portador empieza cada batalla con las `cargas` de su pieza y lanzar gasta una (vuelve la munición, solo para ellas); fuera de batalla ni se gastan ni se compran. La diana y su anillo se ven para los dos bandos

### Carga montada

**regla nuestra** (26-10-2026, decisión del usuario: «la lanza lo único que hará es usar la fuerza de la montura en la carga»): con una montura de guerra y una lanza puestas, el primer golpe de la carga tira [F, F × agilidad del jinete] con F = la fuerza de la montura más la de la lanza (con dos lanzas, la que más fuerza pone), y cobra lo de todos, +5 %/casilla hasta 5; el +10 % del jinete y el rasgo `charge` se fueron (una unidad que lo escriba se rechaza diciéndolo: montar es llevar una montura de guerra). Montado sin lanza, o a pie, carga como todos con la horquilla de su arma

### Carga

**regla nuestra** (#260, 14-10-2026; en toda batalla desde el 19-10-2026): todo el que pega cuerpo a cuerpo (también el tirador y el héroe) carga con la recta, +5 %/casilla, tope 5 (inventado, `data/carga.json`), la misma para todos desde el 26-10-2026. La IA solo se coloca para cargar si carga montada (`cargaMontada`, `pasoParaCargar`); no busca la recta a pie (antes del 26-10-2026: en 100 peleas de la IA contra la IA (`tools/qa/medidas/arena-ia.ts`, «mezcla», 19-10-2026), 30 cargas a pie y 74 de jinete)

### `fear` (rasgo del motor; hoy no lo lleva ninguna unidad del catálogo)

**divergencia deliberada**: ataque −2 durante 2 rondas (no aura de moral)

### Magia (hechizos)

**regla nuestra** (06-11-2026, el editor de magia: «Crear un editor de magia en la arena para que pueda crear hechizos»): un hechizo es datos (`data/hechizos.json`) con su descripción libre y su coste a mano (maná y nivel de gremio). **Entrega**: libre (a cualquiera, como antes), sobre sí, en contacto, a x casillas (por encima), proyectil (la recta del disparo diferido: el primero vivo, o toda la recta) o el tablero entero, y diferido (cae al empezar el siguiente turno de quien lo lanzó). El héroe lanza desde la casilla de su cuerpo, una vez por ronda, sin gastar el turno; una unidad lo usa como poder con su turno, sin maná y con poder mágico 0. **Efectos**: daño con o sin armadura, cura (sin resucitar), disipar, cifras (ataque, defensa, armadura, fuerza, agilidad, casillas), impedir (golpear, disparar, contraatacar, moverse, lanzar), escudo (tras la armadura) y disparadores (al empezar o terminar su turno, al ser golpeado cuerpo a cuerpo sin ser contraataque, al golpear, al caer), sin anidar. **Duración**: rondas, el poder, hasta que empiece o termine el próximo turno de alguien (tope 2 rondas), toda la pelea, y que se acabe si cae quien lo lanzó o lo lleva. Lo colgado lleva sus números: editar un hechizo a media pelea no lo cambia. Los cinco del gremio dan lo mismo que antes (el banco no cambia); los 38 de ejemplo, ninguno en el gremio. La IA solo valora daño, cura y casillas: lo demás no lo lanza (backlog). **Cada hechizo es de una facción o de varias** (08-11-2026; «Sí, por facción» y «Sí, se rechaza», decisiones del usuario): el gremio de una ciudad enseña solo los de la facción de la ciudad (`hechizosDelGremio(nivel, facciones)`, que lee `townSpells` con la de la ciudad) y una unidad solo usa como poder los de la suya (`poderDeUnidadBlocker`: la carga del catálogo y «Guardar» lo rechazan, la ficha de la arena lo ofrece apagado). Las facciones de hoy, a ojo: «curar», de los templarios (el poder del monje); «zombi_pegajoso», de los no muertos (decisión del usuario); los demás, de las cinco, así que el gremio de cada facción enseña lo mismo que antes y el banco no cambia. **Levantar zombi** (08-11-2026, `levantar_zombi`): de los no muertos, gremio 2 («Nivel 2», decisión del usuario), maná 6 y alcance 4 a ojo; del cadáver de un vivo de cualquier bando sale un zombi del bando de quien lo lanza, del de un zombi un esqueleto guerrero (S1), del de otro no-muerto o del héroe nada; el cadáver se gasta; el levantado no tiene turno en la ronda en que nace y no cuenta contra el tope; al volver, si no cabe, se deja lo que sobra. Con él el banco solo cambió en los `spells_learned` de los no muertos

### Rueda del golpe

**regla nuestra** (13-10-2026; en toda batalla y sin interruptor desde el 19-10-2026): al golpear cuerpo a cuerpo, quien pega y quien recibe eligen a ciegas un tipo en un anillo (desde arriba y en el sentido del reloj ofensivo, fuerte, finta, defensivo, rápido, r.guardia: opuestos ofensivo y defensivo, fuerte y rápido, finta y r.guardia; Normal en el centro; #263, 14-10-2026): la persona en el diálogo de la rueda, el agente por su contrato (`hit`, `battle_response`) y la IA de reglas a ciegas. El cruce fija la tirada (`min + ⌊(max − min) · p / 4⌋`, por la distancia en el anillo: 0, 1, 3, 4; con Normal, 2) y la respuesta es el contraataque, en `4 − p`. Fuerte (daño ×) y Rápido (2 golpes de daño ×), también en el contraataque; Normal, siempre ×1; lo demás actúa solo al golpear (**la respuesta no da bonificadores**, `cruceDelGolpe(…, papel)`): Ofensivo suma ataque en ese golpe; Defensivo suma defensa desde ya hasta que **empiece** su próximo turno; Romper guardia quita ataque al atacado según el éxito del golpe (`p`), ya en su contraataque y hasta que **termine** su próximo turno; Finta deja andar tras golpear lo que le quede menos lo que reste su éxito (`TurnoDeUnidad.finta`, en `pasosQueQuedan`; solo andar o terminar, `faseBlocker`; andar cierra el turno, y con 0 se cierra solo; ese tramo paga el contacto como cualquier otro, y su nota lo dice). Rápido: cada golpe resta la armadura, y su nota dice que contra armadura pierde; con carga, **solo el primer golpe la cobra** (también el del doble golpe; 14-10-2026). Caducidad en `StackEffect.hasta` (`empezar`/`terminar`, tope de 2 rondas); el mismo origen refresca. **Las cifras son las del nivel del arma** (18-10-2026; niveles absolutos en la vuelta 2, «para que sea más fácil ver la diferencia entre armas»): toda arma de cuerpo a cuerpo (`arma`, también la lanza) lleva un nivel de 0 (lo peor) a 6 (lo mejor) en cada tipo del anillo (`Pieza.rueda`), el mismo en toda arma; del 0 al 6, Ofensivo +0 a +6 ataque, Fuerte ×1 a ×2, Defensivo +0 a +6 defensa, Rápido 2 × 0,25 a 2 × 1, Romper guardia quita con el éxito máximo de 0 a 6 (con éxito `p`, `⌊q · p / 4⌋`: con menos éxito, menos) y la Finta resta con el éxito mínimo de 8 a 2 casillas, y cada punto de éxito una menos, sin bajar de 0 (con éxito `p`, `max(0, m − p)`; 18-10-2026: con la anterior, de 10 a 5 con la Espada, una unidad de 2 a 5 casillas no andaba nunca). Cada golpe con sus armas (con dos, de cada tipo el mejor nivel de las dos, 25-10-2026), el contraataque con las del que responde, y lo que no es daño con las del primer golpe. La Espada, todo a 3 (la versátil; con ella, Ofensivo +3, Fuerte ×1,5, Rápido 2 × 0,63, Romper guardia 0 a −3 y la Finta de 5 a 1); la Maza, Fuerte y Romper guardia 5, Defensivo 2 (26-10-2026), Rápido y Finta 1; la Daga, Ofensivo 1 (26-10-2026); la Alabarda, todo a 4. Sin arma no se golpea: toda unidad del catálogo lleva una, el héroe nace con la Espada y el arma de cuerpo a cuerpo no se quita (`unequipBlocker`, 19-10-2026). Cifras inventadas en `data/rueda.json` y `data/equipo.json`; el disparo, con su tirada. **Ruedas de 5 y de 3** (22-10-2026, decisiones del usuario; la de 7 es lo de arriba): la de 5, Ofensivo-fuerte, Rápido, Romper guardia y Defensivo-finta con Normal en el centro; la de 3, Ofensivo (ofensivo + fuerte), Rápido (rápido + romper guardia) y Defensivo (defensivo + finta), sin centro. Las dos en ciclo: cada sector gana al siguiente en el sentido del reloj (5: Def-finta > Of-fuerte > Rápido > R. guardia > Def-finta; 3: Defensivo > Ofensivo > Rápido > Defensivo); si gana el golpe, 4; si gana la respuesta, 0; el mismo, enfrente o Normal, 2. Un fusionado da cada parte **a la mitad** de lo que la separa de lo neutro, truncada hacia lo neutro (con la Espada: Of-fuerte +1 y ×1,25; Def-finta +1 defensa y anda la mitad de lo que dejaría la Finta; Rápido-romper 2 × 0,56 y quita 0, 0, 0, −1, −1). El índice de poder se mide con la de 7

### Armadura

**regla nuestra** (#262, 14-10-2026; en el juego desde el 19-10-2026): las piezas de armadura dan puntos de armadura y ninguna pieza da PV (la brigantina 2, el arnés 3, el gambesón 1, el jubón 1 y la coraza, id `barda`, 7: a ojo, ×0,3 con la escala baja del 26-10-2026, eran 7 / 10 / 4 / 2 / 22; inventados en `data/equipo.json`); cada golpe, disparo, hechizo o poder que llega se queda en `max(0, daño − armadura)`, restado lo último (tras ataque y defensa, multiplicadores, cruce, carga y redondeo), uno a uno (cada golpe de Rápido o del doble golpe, cada tiro, cada salpicado con la suya). El drenaje, la experiencia y el parte leen lo que llegó. Un golpe en 0 se pinta «parado». Con la barda de 22, en 100 peleas de la IA contra la IA (`tools/qa/medidas/arena-ia.ts`, 19-10-2026): 2 de 100 de 3 contra 3 sin terminar (s13, s43; 0 sin ella) y un jinete contra tres flojos gana 92 de 100 (0 sin ella, 76 con los 220 PV de antes). En el juego no hay barda que lo provoque: 0 sin terminar en el barrido y el banco

### Salir del contacto

**regla nuestra** (#259, 14-10-2026; en toda batalla desde el 19-10-2026): salir de una casilla cuesta 1 + los enemigos que podrían golpear cuerpo a cuerpo a quien está en ella (`canReachMelee`: el de lo alto del muro de al lado no cuenta; el del otro lado de una puerta cerrada, sí). Se paga al dejarla; el camino es el más barato; la velocidad es un presupuesto (`pasosQueQuedan`, `turno.gastado`). Si no le llega para salir de su casilla, no se mueve (golpea o termina el turno). El volador paga al despegar y no lo que sobrevuela. La carga cuenta casillas y se paga por la recta, que es lo que anda; si no cabe, no carga. Subir y poner escalera no lo pagan

### Lo demás de las reglas

- Lo temporal vive en `BattleStack.effects` y se suma al leer, nunca al stack. **Salvo la recarga de
  un arma de fuego** (`BattleStack.recargando`, 02-11-2026): un efecto caduca por rondas con un tope
  de 2, y la recarga cuenta los turnos de la propia unidad y llega a 9.

- **Un solo combate (19-10-2026, decisiones del usuario)**: toda batalla —del mapa o de la arena,
  de la persona, del agente o de la IA— pelea con la rueda, salir del contacto, la carga a pie, la
  armadura, las armas por uso, sin munición y con los poderes de unidad, sin interruptores; las
  del mapa, sin muralla hasta el 04-11-2026 (desde entonces, la de su sitio: «Murallas del mapa»). Medido en 1-100 (partidas de la IA,
  19-10-2026): 5,2 batallas por partida, rondas por batalla 3,58 de media (mediana 3, p90 5,
  máximo 12), 0 en `MAX_ROUNDS`; j0 gana 50, duración 4 / 7 / 15, 0 sin terminar; por facción
  (ganadas / jugadas), imperio 26/35, elfos 23/41, no muertos 22/55, orkos 20/38 y templarios 9/31,
  sin equilibrar (decisión del usuario). Con caballeros y nigromantes (18-10-2026): 3,17 rondas, j0
  49, duración 8 / 14 / 24. El banco (200 semillas, `1c496b88…`): 4 / 8 / 21 días; con el recinto de
  las ciudades en el núcleo (`0e2d0632…`, 21-10-2026), 4 / 8 / 20, j0 99 → 107, 0 sin terminar; con
  sus puertas (`5d95869b…`, 21-10-2026), 4 / 9 / 37 (dos semillas en que los héroes se cambian una
  ciudad del centro cada día), j0 107 → 96, 0 sin terminar. Con 20 semillas (21-10-2026), fusionado
  con el héroe que nace en su base (`6a66ad51…`): el mismo mapa, y el primer hecho distinto es la
  primera jugada del j0 (cambia o recluta tropa en vez de salir); duración 4 / 12 / 14 → 4 / 6 / 6,
  j0 10 de 20, 0 sin terminar. Solo oro (`b9dbd8a1…`, 21-10-2026): otro mapa desde el día 1 (sin
  minas ni montones, el azar llega distinto a los objetos), 4 / 7 / 7, 0 sin terminar; en 1-100,
  4 / 6 / 17 y j0 46 (antes, medido igual, 3 / 6 / 15 y j0 62). Con el héroe de salida pagado
  (`420d75c9…`, 22-10-2026), 4 / 8 / 12; fusionado el mismo día con la complejidad del combate (a
  7 / 7), el clima y la F1a del mapa vivo, el mismo sha: ninguno mueve una partida sin mundo ni agente.

## El cliente

- **La batalla se cuenta en cola** (`batalla/anim.ts`): el estado ya trae el final de lo que se cuenta,
  así que la barra de vida (`EstadoFigura.pv`) baja en el impacto de cada golpe, disparo o
  hechizo, con `trasElGolpe` y lo que dice el registro (la cura de un poder también); lo que el
  registro no dice (el drenaje, la cura del héroe) llega con el último impacto de la unidad. El aro
  y la casilla resaltada van con quien actúa en lo que se cuenta (`BattleAnimator.activo`,
  `EstadoFigura.casilla`, ninguna mientras anda). Partida, arena y espectador (H6, 13-10-2026).
  La carrera de una carga la marca el núcleo en su `move` (`charge: true`, 13-10-2026): el
  animador no la deduce del golpe de al lado, que con la rueda llega después. **Correr o caminar**
  (25-10-2026, «corriendo si es más de la mitad del movimiento máximo»): sin carga, un tramo de más de
  la mitad de `stackSpeed` lleva `corre: true` en su `move` (`seCorre`, `battle.ts`, con las casillas
  que pisa, también las del volador); el animador lo anda con el clip y el ritmo de la carga si lleva
  `charge` o `corre` (`vaCorriendo`, `batalla/anim.ts`, la única lectura de las dos marcas) y, si no,
  caminando. Solo se ve: ninguna regla lo lee, y el banco no se mueve.

- **La rueda, en las tres pantallas** (19-10-2026): un `<dialog id="rueda">` modal y sin fondo (en
  un móvil, con velo) que pinta y conduce `DialogoDeLaRueda` (`client/batalla/rueda/`: `rueda.ts`,
  `disco.ts`, `figuras.ts`, `dialogo.ts` y `rueda.css`, que enlazan las tres páginas). El golpe
  cuerpo a cuerpo de quien juega **sin carga primero anda** (se planta ante su objetivo,
  `BattleState.golpeEnCurso`) y al acabar la marcha abre la rueda; **con carga, primero la rueda**
  (31-10-2026, petición del usuario: «en la carga es anticlimático, debería ser primero la rueda y
  luego el movimiento y el ataque de la carga»): se planta en su salida, sin andar ni gastar, el
  tablero marca su llegada con su «»N», y tras elegir se cuentan el desenlace, la carrera y el
  golpe. La rueda lleva los siete tipos, su daño (`previsionDeLaRueda`, con la carga, también la
  que aún no se corrió) y su efecto en nota; clic, teclas 1-7 o flechas + Intro; Escape cancela
  solo antes de elegir («Golpe cancelado.»): sin carga deja a quien pega donde llegó, con su
  turno; con carga, en su salida con el turno entero, y puede volver a cargar (`soltarElGolpe`).
  Cuando golpean a quien juega, elige su respuesta sin ver el golpe; cada sector dice grande lo que le haría el atacante y debajo su contraataque, con «†» donde puede tumbarle (01-11-2026). Los modificadores en curso de cada stack (lo de `BattleStack.effects` y la carga de quien pega), en pastillas de una sola forma, `modificadoresEnCurso` (`views/notas.ts`): bajo cada contrincante de la rueda y en cada fila de «En el campo»; el desenlace los pinta como estaban antes del cruce (`fotoDeEfectos`, `batalla/anim.ts`) (`RuedaPendiente` no lo
  lleva), y si le cargan, antes de que corra quien carga. El golpe de una vez (`from` y las dos
  elecciones: `autoResolve`, IA contra IA) escribe lo mismo: `move`, `cruce`, `attack`, y con
  carga `cruce`, `move` (`charge`), `attack`. El golpe plantado va en la clave de las cachés de
  las sesiones (`claveDeBatalla`): plantarse sin andar no deja línea ni gasta. El desenlace —giro, marcadores del
  color de cada bando, arco, medidor con una muesca por punto que da el cruce (`puntosDeLaForma`), rótulo— lo cuenta el animador con el hecho
  `cruce` (`DURACION.cruce`, `data-tramo`), con el tablero de antes del golpe detrás. Cada fase nace
  quieta (`data-quieta`: el `:hover` no enciende el sector hasta que se mueve el puntero), y la nota
  de cada tipo dice cuándo actúa en esa fase (`efectoDeGolpe(tipo, papel, contraataca)`). **Cada
  sector va teñido por el nivel del arma de quien pega** (25-10-2026: «los tuyos cuando atacas y los
  de tu enemigo cuando defiendes»): `previsionDeLaRueda().niveles` (`nivelesEnLaForma` sobre
  `nivelesDelGolpe` de quien pega, con el uso de su primer golpe; un fusionado de las ruedas de 5 y 3,
  la media truncada de sus partes; Normal, sin nivel), que `disco` pone en `data-nivel`; la escala de
  rojo a verde es la de la ficha del arma, una sola en `rueda.css`, y el pie lo dice (`data-tinte`).
  El desenlace va sin tinte. La cabecera lleva las figuras de los dos y dice quién es quien mira. El espectador la usa solo para
  contar (`SOLO_MIRA`: una sesión que no elige), y el cable le lleva lo puesto de los
  héroes (`UnitInfo.equipo`), así que `adaptar.ts` sigue siendo la inversa exacta.

- **La batalla de la persona**: los poderes de su tropa, con los botones de la arena
  (`batalla/poderes.ts`, `PoderesDeLaActiva`: un aliado posible se usa ya; varios, espera el clic;
  Escape suelta lo apuntado). **La muralla** de la ciudad o del pueblo (04-11-2026), con los botones
  de la arena (`botonesDeMuralla`, `MurallaDeLaActiva`): atacando, «Poner escalera» y «Subir» (un muro
  al pie, ya; varios, el clic en lo alto de una columna elige, y Escape o cualquier jugada lo
  sueltan: es lo apuntado, como un hechizo, y mientras espera el tablero no marca andar ni golpear
  y un clic en otro sitio no juega nada y lo dice, `EscenaBatalla.esperaElClic`, QF2-1); defendiendo, «Abrir puerta» y
  «Cerrar puerta»; apagados con el motivo del núcleo (tras andar: «ya se ha movido este turno…»). **El selector de arma** (26-10-2026; sustituye al botón «Apuntar»):
  el tirador activo lleva en su panel, junto a los poderes, «Cuerpo a cuerpo (Daga)» y «A distancia
  (Arco)» (`botonesDeArma`, `ArmaDeLaActiva`; con dos armas de cuerpo a cuerpo no se elige entre
  ellas: el golpe ya usa lo mejor de cada una), y la Q los alterna; quien no dispara no lo ve.
  Empieza su turno en «A distancia» si puede apuntar. **En «A distancia»** no se marca andar ni
  cargar y el clic en cualquier casilla apunta (**el disparo diferido**, 25-10-2026, sin tests); al
  pasar el ratón se ve la recta y la barra dice a quién daría hoy y cuánto (la previsión del
  núcleo, «¡tuyo!» si es propio). **En «Cuerpo a cuerpo»** el tablero marca andar, cargar y a quién
  golpear, y el clic en un enemigo anda, carga y golpea con la rueda, como cualquier unidad. El
  tablero pinta de todo stack con algo apuntado (los dos bandos, también en el espectador) la recta
  a trazos del color de su bando hasta donde llega, en gris lo que queda hasta la casilla, la
  diana en la casilla y, en rojo, a quién da hoy (`pintarDisparos`). El animador vuelve al
  tirador hacia la casilla al apuntar (`apunta`) y el proyectil del `shoot` sin nadie cae en ella. **Juega sus defensas** (#116, 19-10-2026): la batalla que nace en el
  turno del rival contra ella pasa a la pantalla («¡Te atacan! Defiéndete.») y el turno del rival
  espera a que la cierre («Continuar» o «Resolver sola»); la que no es suya la cierra la IA.
  **Antes, el aviso** (06-11-2026, «centrar el lugar del ataque en el mapa y mostrar un popup»): el
  mapa mira a la casilla del ataque (`focoDe`, con un aro rojo que late, `VistaMapa.ataque`) y
  `<dialog id="aviso">` (`partida/aviso.ts`) dice quién ataca, a quién y dónde (`elAtaque`, `game.ts`:
  el sitio de `sitioQueSeDefiende` y, en campo abierto, el nombre de su región, `Ataque.region`, nunca
  la casilla; la frase, `Session.avisoDelAtaque`), con «Defender» (abre la
  batalla y, si toca, la defensa) y «Resolver sola»; Escape no lo cierra. Al volver al mapa de toda
  batalla suya, jugada o resuelta sola, la barra dice cómo acabó (`fraseTrasLaBatalla`: «Batalla
  perdida: …; X cae y vuelve a Valdeluz sin tropa.»). Cada batalla del turno
  del rival, el suyo; y la emboscada de un grupo en el turno propio, igual (`moveHeroTo`).
  Mientras la rueda espera, los botones de la batalla salen apagados con su motivo
  (`fieldsetApagado`), y un clic mientras se cuenta una jugada dice «Espera a que termine la jugada.»
  (`alPulsarMientrasCuenta`); en la partida y en la arena (vuelta 1 de QA, 19-10-2026).

- **El lateral mientras se cuenta** (#257, 11-11-2026, `docs/agents/2026-11-11-panel-durante-la-jugada/`):
  el estado ya trae el final de lo que el tablero cuenta —en la partida, la tanda entera de la IA
  hasta el turno de la persona—, y el lateral cantaba «Victoria» o «Derrota» antes del último golpe,
  quitaba de «En el campo» a quien aún no se había visto caer y traía el parte, la ronda y la recarga
  de después. **Se congela** (`panelDeBatalla`, `batalla/panel.ts`, la regla de la partida y la
  arena): mientras `EscenaBatalla.ocupada`, el panel es lo último que pintó quieto esa batalla
  (guardado por su registro, `battle.log`), entero y dentro de un `fieldset` apagado con «Espera a que
  termine la jugada.»; si no pintó nada quieto (la arena con todo en IA, que se juega entera antes del
  primer fotograma), calla: «Ronda …» y «Contando la jugada…». La línea de estado, igual:
  `barraDeLaBatalla` calla «La batalla ha terminado.» hasta que se cuenta el último golpe, y deja pasar
  el aviso de espera. **Por qué congelar**: callar como la arena hacía que el lateral se encogiera y
  volviera a crecer en cada jugada propia y en cada tanda de la IA, y quitaba los botones apagados en
  su sitio de #165; retener por el animador (vidas, recarga, granadas, ronda y parte paso a paso)
  obligaba a pasar cada cifra nueva del lateral por él y mezclaba su foto con lo que la sesión ofrece
  ahora (acciones legales, maná). **Lo que se acepta**: durante una tanda larga de la IA el lateral se
  queda en lo de antes y no avanza golpe a golpe. **El aviso «Enemigo (N)» del móvil**
  (`EscenaBatalla.enemigosFuera`) cuenta los que se ven en pie (`BattleAnimator.cuantosSeVen`: bajan en
  el impacto que los tumba, con su barra) y no se vacía con el final hasta que el tablero lo cuenta.
  «Continuar» sigue saliendo en cuanto el estado termina (#158 d) y el espectador sigue con su
  `sinElFinal`: fuera de #257. Lo vigilan `escenas.test.ts` y `invariantes-cliente.test.ts` (ninguna
  página ramifica por `contandoAun` en su panel).
