# La partida

Se lee antes de tocar: `src/core/state/`, `src/core/town/`, `src/core/ai/`, `src/client/sesion/` (salvo `batalla/` y la de la arena), `src/client/partida/`, `src/client/render/base/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Arrancar

- **`?seed=N&faccion=<id>&heroe=<tipo>` fija la partida**; la barra enseña siempre cuál se juega y
  la URL lleva las tres tras empezar (`?heroe=` = «ya elegido y pagado»; sin él, el héroe de salida
  se elige en la base y la URL lo lleva en cuanto se elige: una recarga a media elección vuelve a
  preguntar igual, 22-10-2026). Lo que no es semilla o facción se rechaza diciéndolo
  (`parseSeed`, `parseFaccion`, en `core`; repetido, `unaVezEnLaURL`), y un tipo de héroe que no es
  de la facción que se juega, también (`problemaDeTipo`, el mismo de `newGame`). `?seed=` vacío =
  sin semilla. **Sin ninguna de las tres, la página pregunta** (19-10-2026, `inicio/`): «Nuevo
  juego» (elegir facción, con su tema al marcarla), «Cargar partida» (apagado: no
  hay guardado) o «Partida rápida» (semilla al azar, la facción que saque y su héroe por defecto, ya
  en la URL); hasta elegir no hay `Session` ni mapa. La partida abre en la base
  del jugador: sin `?heroe=`, **ante el ayuntamiento, eligiendo y pagando su héroe de salida**
  (22-10-2026, `ayuntamiento/`); con él, con su héroe dentro; «Partida nueva», al acabar, vuelve al menú. Si el agente diseña
  el mapa, la semilla del servidor ya no reproduce la partida, y la consola lo dice.

## Puertas únicas

### Dueño de un sitio del muro (paso, ciudad o pueblo en un nodo)

`tomarElNodo` (`state/marcha.ts`, 05-11-2026: juntó `captureNode` y `captureTown`; el único que escribe el `owner` de un objeto del mapa, lo vigila `invariantes-partida.test.ts`; `Town.owner` se fue). Un sitio de dentro de una región no se toma: es de quien tenga la región

### Ciudades y pueblos en su región, y la ocupación (05-11-2026, tarea 2 del puesto fronterizo, fase 1; `docs/agents/2026-11-05-ciudades-en-su-region/`)

**qué es nodo lo dice lo que toca** (`estructura`, `asentarLosSitios`, `map/regiones.ts`): una ciudad (por los accesos de sus puertas) o un pueblo (por sus ocho vecinas) que toca dos regiones o más es un nodo (`NodoDeRed.clase`: `paso`, `ciudad` o `pueblo`); el que toca una está dentro de ella (`Estructura.sitiosDeRegion`, y su casilla es de su región); un pueblo que parte su región se rechaza (`problemasDeRed`), y una base dentro de una región o una ciudad de región con dueño, también (`problemasDeLasCiudades`, `validateMapPlan`). **Dónde está**, nodo o región, una bifurcación, `dondeEsta` (y las regiones que toca, `regionesDelSitio`), que leen el dueño, la renta, la lectura del motor y `problemasDeLosPueblos`. **De quién es**, una regla, `dueñoDeUnSitio` (en la red; con la foto, `dueñoEnLaFoto`, y la foto sin lo unido a cada base, `dueñosDeLaRed`: la crónica de los sitios y el cable del espectador, una pasada), que leen `dueñoDelSitio` y `dueñoDeLaCiudad` (`state/sitios.ts`: lo que antes era `Town.owner`); si está en el muro, `enUnNodo`. **En el núcleo, el `owner` del objeto de una ciudad o un pueblo solo lo leen la red y `tomarElNodo`** (en uno de dentro de una región vale `null`; lo vigila `invariantes-partida.test.ts` preguntando al compilador el tipo de lo que va antes del punto). **La ocupación**, `ocupanteDe` (un héroe de otro bando en su casilla, `heroeAjenoEn`, el de `enemyAt`, o una guarnición que no es del dueño, también la neutral; sin dueño, nadie; `Ocupante`, en `state/events.ts`) y su frase, `ocupadoBlocker` (los dos reciben el dueño si ya se sabe); el par dueño y ocupante, `comoEstaElSitio` (`SitioVisto`: el recuerdo, la foto de la crónica y el cable del espectador). **La ciudad que manda**, `ciudadQueMandaBlocker` (no es tuya, o su ocupación), que leen `recruit`, `build`, `contratarBlocker` y `buyBlocker` (la armería, desde el `/simplify` del 05-11-2026), la IA (`planBuildings`, `planRecruits`) y la pantalla (`Session.mandaEn`); la renta (`CiudadDeLaRenta.ocupada`, `PuebloDeLaRenta.ocupada`, oro 0), la IA (`valorDeRecuperar`) y la pantalla (`Session.ocupados`; la ficha de la ciudad, cada fila de la regla y no de la cifra cruda —lo que cobra de la renta, construir de `mandaEn`, el crecimiento a 0 con su nota y la guarnición ajena como su ocupante, `Session.ocupanteDeLaCiudad` con `ocupanteDicho`—, y la lista del lateral, la misma lectura, `sinCobrar` en `partida/paneles.ts`; vuelta 1 de QA, H1); lo que pinta el lienzo, cada ciudad y cada pueblo con el dueño sabido en `owner` y los ocupados, `conLosDueñosSabidos` (`render/mapa/sitios-sabidos.ts`: la sesión y el espectador, `sitiosDelCable`, una vez por fotograma del cable); el crecimiento, solo por `crecerLasMoradas`, que salta la ocupada (lo vigila `invariantes-partida.test.ts`). **La crónica de los sitios**, `anotarLosSitios` (al acabar `applyAdventureAction` y `settleBattle`, comparando `fotoDeLosSitios`): `town_owner_changed`, `site_occupied` y `site_freed`. La batalla en un sitio, `sitioQueSeDefiende` (`{ sitio, suyo }`: la muralla del sitio de la casilla del defensor sea de quien sea, P3; la guarnición y lo que se entrega, solo si es suyo, `sitioDelHeroe`). El recuerdo de la niebla lleva el dueño y el ocupante que se vieron (`RememberedObject.sitio`, `recuerdoDe`). **Dónde las pone el generador** (fase 2): en un nodo, solo las bases y las ciudades-puente; las demás, `ciudadesDeRegion` (`poblar.ts`, con `data/poblamiento.json`, que lee `POBLAMIENTO`), y su región traza sus caminos desde ella (`EntradaDeCaminos.centros`); lo vigila `test/ciudades-de-region.test.ts`. **El pueblo en el muro** (fase 3): el objeto `village` lleva `barrera` (la del muro que `buildMap` abre bajo él, como un nodo; `null` dentro de una región), solo sobre montaña, bosque o acantilado (`BARRERAS_DEL_PUEBLO`, `map.ts`), y lo que **cruza su barrera** por su eje, paso o pueblo del muro, se pregunta una vez, `cruzaSuBarrera` (`CruzaSuBarrera`; lo leen la escena —`pasoDeNodo`, `pasosALaVista`, el análisis, `sendasPorObjeto`, el óvalo del mapa— y el minimapa); «¿es un nodo?» es otra pregunta (la ciudad del muro también lo es), y la dice la red (`sitioEnUnNodo`, `NodoDeRed.clase`), que leen `murallasDelMapa` y `alrededorDeMurallas`; lo que no vale (sobre agua o muralla, sobre el muro tocando una región, entre dos sin muro) lo dice `problemasDeLosPueblos` (`validateMapPlan`), y **dónde no va**, ni en el borde del mapa ni a 2 casillas o menos de una ciudad (su recinto y los accesos de sus puertas), una regla, `puebloDelMuroBlocker` (`generar/validar.ts`), la misma para el plan y para el generador (vuelta 1 de QA, H4). El generador lo pone en `POBLAMIENTO.pueblosEnUnNodo` de las parejas, una cuota por mapa (`pueblosEnElMuro`, `generar/poblar.ts`: el paso con camino de su región, en espejo, con la corriente del poblamiento; su sitio de dentro se sortea igual y queda vacío, `sitiosSinPueblo`, para no mover el resto del mapa); se toma, da su oro y pelea tras la madera con las reglas de la fase 1. En la escena es su pieza de pueblo en el paso, sin hito ni puesto, y el eje se abre como el de un paso (`pasosAtravesados` no cuenta su pieza); lo vigila `test/pueblos-en-un-nodo.test.ts`

### A quién se licencia

`elQueSeIria` (`hero/troop.ts`)

### Construir un héroe

`heroeRecienHecho`

### Contratar un héroe, también el de salida (22-10-2026)

`hireHero` (`hire_hero` con `tipo` opcional; la única puerta de un héroe pagado: el de salida de todos se asienta y se cobra por ella en `createGame`, salvo el de quien lo elige en la base, `Player.heroeDeSalida`, `NewGameOptions.tipoDelHeroe` a `null`); la regla, `contratarBlocker` (con el de salida pendiente, solo en su base; la lee también la IA, `planHires`); los candidatos, uno por tipo de la facción, con el nombre y la tropa una vez, `candidatosAHeroe` (`EleccionDeHeroe`; sin el turno); lo que no se hace mientras, `salidaPendienteBlocker` (solo el de salida: sin héroes a media partida se pasa el turno), que en el cliente es parte de la única compuerta de toda acción, `Session.bloqueoDeTurno` (contratar y `clickTile` miran solo el turno); el tipo por defecto de una semilla, `heroePorDefectoDeLaSemilla` (la rápida y `tools/qa/navegador/url-de-partida.ts`); el precio de todo héroe, `ECONOMIA.precioDelHeroe` (`data/economia.json`, inventado; nunca más que `oroDeSalida`). En el cliente, la escena del ayuntamiento (`partida/ayuntamiento/escena.ts`, `sesion/vistas/ayuntamiento.ts`, `partida/ayuntamiento/panel.ts`; la fila ante un edificio, `anteUnEdificio` y `botonesDeLaFila`, la misma de la morada; sin quien anduvo delante; su cámara, `encuadrarElAyuntamiento`: el edificio entero, del alto de su cuadro a los pies de los candidatos), que abren el arranque sin `?heroe=`, «Contratar héroe» y, con el de salida pendiente, abrir la base propia (`openTown`) y llegar a la puerta del ayuntamiento (`EscenaBase.llegar`)

### La guarnición de un sitio y la tropa entre héroe y sitio (04-11-2026, fase 1 del puesto fronterizo)

`core/state/sitios.ts`: qué sitio hay en una casilla (`sitioEn`, `sitioPorId`, `sitioDelHeroe`: el suyo donde está), de quién es (`dueñoDelSitio`), cómo se nombra (`nombreDelSitio`, `delSitio`), su guarnición (`guarnicionDe`, de ciudades, pasos y pueblos, en `GameState.guarniciones` con su dueño, `null` la neutral, desde el 05-11-2026; `Town.garrison` se fue; con su dueño, `laGuarnicion`, la única lectura que mira que tenga tropa; la de una ciudad, `guarnicionDeLaCiudad`; lo que hay entre héroe y sitio, `entreLosDos`), su cupo (`cupoDeLaGuarnicion`) y si es hostil para quien llega (`guarnicionHostil`: la de cualquier sitio con tropa y ajena; la leen `enemyAt`, `casillasHostiles`, `queLoCierra` y la IA); **la única puerta que mueve tropa entre un héroe y su sitio**, `repartir`, que lanza con los dos cupos, `repartoBlocker` (el del héroe y el de la guarnición; la usan `moverTropa`, que leen `dejar_tropa` y `recoger_tropa`, y la defensa), y `sitios.ts` es lo único que escribe `GameState.guarniciones` (`ponerLaGuarnicion`, `quitarLaGuarnicion`; lo vigila `invariantes-partida.test.ts`); la regla de dejar y recoger, `intercambioBlocker` (el pedido, `PedidoDeTropa`: `count` de un tipo o un veterano; el de un grupo, `pedidoDelGrupo`; el tipo de la acción, `Intercambio`, de punta a punta); **repartir y confirmar** (D9, vuelta 1 de QA: con los dos llenos se cambia uno por otro), la acción `repartir_tropa` (`{ hero, enElHeroe }`, las líneas de todo lo que va con él, `LineaDelReparto`: novatos por tipo o un veterano; desde un ejército, `lineasDelEjercito`), juzgada solo en el reparto final por `repartirTropaBlocker` y aplicada por `repartirTropa` (un hecho, `troops_exchanged`, con lo que dejó y lo que se llevó por tipo), y lo que lee su pantalla, `elReparto` (los dos lados como quedarían, con sus cupos, y el motivo del reparto entero; el agente y la IA siguen con dejar y recoger). Perder el sitio, `entregarElSitio` (`state/marcha.ts`: el del muro, por `tomarElNodo`; el de dentro de una región solo pierde la guarnición; para el héroe vencido en su sitio y para la guarnición sola). Recoger lo propio de un sitio que ya no es suyo, sí; dejar o mejorar el puesto, no (la regla de «suyo», una vez, `loSuyoDelSitio`: el sitio o su guarnición; la leen `heroeEnSuSitio` y `sitioDelHeroe`; pregunta 3 de la tarea 2). El sitio de una ciudad, `sitioDeLaCiudad`; el de un objeto que ya se tiene, `sitioDelObjeto` (sin buscarlo por id); su objeto del mapa, `objetoDelSitio` (`tomarElNodo`); la ciudad suya donde está un héroe, `castilloSuyoDelHeroe`. La defensa: la de la IA, `defensaDeLaIA` (a pasos, sin que lo de fuera deje de caber en la guarnición), que aplica `dejarPendiente`, que la guarda en la batalla (`PendingBattle.defensa`) y la cuenta con el hecho `defense_set`; la de la persona, `defensaPorElegir` (de `laDefensa`, `sitios.ts`: cada fila con lo que hay, lo que pelea y el motivo del núcleo para no subir o bajar uno), `defensaBlocker`, `ejercitoDeLaDefensa` (de cada tipo, los que no se irían: `licenciar`) y `elegirLaDefensa` (`state/batallas.ts`: reparte y vuelve a montar la batalla antes de la primera jugada, `batallaSinEmpezar`; montar no tira). En `state/`, `createBattle` lo llama solo `montarLaBatalla` (lo vigila `invariantes-partida.test.ts`). La IA recoge con `planIntercambios` (`ai/strategy.ts`), cuando llega (`playAiTurn`), también el que volvió a casa vencido o rendido (`Hero.vueltoACasa`, efímera: la ponen y la quitan solo `volverABase` y `nextPlayer`, lo vigila `invariantes-partida.test.ts`). La fila de la defensa separa el rechazo del «+» (`motivoMas`) de lo que solo informa (`notaMas`: ya pelean todos). En el cliente, `Session.vistaDeLaGuarnicion`/`moverEnElReparto`/`confirmarElReparto`/`cerrarLaGuarnicion` (lo editado no toca la partida hasta confirmar) y `Session.defensa`/`cambiarLaDefensa`/`confirmarLaDefensa`/`dejarLaDefensaDeLaIA`, pintadas por `partida/guarnicion.ts` en `<dialog id="guarnicion">` y `<dialog id="defensa">`; la crónica nombra la guarnición y el pueblo del muro tomado («Pueblo tomado: El Soto») por su sitio (`renderLog(…, sitioDe)`, `Session.sitioDeLaCronica`; el espectador, con los pasos y los pueblos del cable, `pasoOPuebloSiExiste`; la ciudad, por su casilla)

### Qué se levanta en cada sitio de la base

`sitiosDeLaBase`, `siguienteDe`, `construidoEn` (`town/sitios.ts`)

### De un píxel del cuadro de la base al escenario

`planoDelCuadro` (`shared/base.ts`); en pantalla, `colocarLaPlaca` y `colocarEnElCuadro` (`render/base/recortes.ts`)

### Recortar un edificio de la base de su cuadro

`recortarLaBase`, `derivarRecorte` (`tools/taller/recorte-base.ts`)

### Quién hay en una base y qué dice (narrado o de respaldo)

`vecinosDeLaBase`, `vozDe`; las voces del narrador las escribe solo `ponerVoces` (`gente/voces.ts`)

### El ejército de salida

`startingArmy` (`state/setup.ts`): la primera unidad del pueblo con su tirada y hasta `DE_LA_SEGUNDA` de la segunda, lo que quepa; que la primera quepa siempre y de la segunda al menos uno se comprueba al cargar (`PUEBLO_DE_SALIDA`); las dos facciones de la partida, `faccionesDeLaSemilla(seed, delJugador?)` (con su propia corriente: el mapa de cada semilla no se mueve; con la elegida en el menú, el rival es otra de las cuatro, y la que la semilla habría sacado da la misma partida; `newGame` la recibe en `faccionDelJugador`), y el nombre del héroe de salida, `nombreDeSalida`; la facción de la URL, `parseFaccion`, y si un texto es una, `esFaccion` (`core/types.ts`); el rasgo de cada una, `rasgoDeFaccion` (`data/facciones.json`, extraído del cuaderno por `tools/datos/facciones.ts`)

### La renta del día (solo oro, 21-10-2026)

`rentaDelDia` (`state/renta.ts`: el ayuntamiento de cada ciudad propia unida a la base —la del muro por su nodo, la de dentro por su región— y `ECONOMIA.rentaDelPueblo` por pueblo propio unido, con de dónde sale cada moneda; la ocupada, oro 0 y su frase, `ocupada`; lista toda ciudad y todo pueblo propio, también lo que no cobra, con `unida`/`unido` a `false` y oro 0: el pueblo del muro recién tomado sin unir no salía en ningún sitio, vuelta 1 de QA, H2), que leen solo `startTurn`, el contrato (`you.income`) y `Session.renta` (la barra y el lateral); lo de una región, `rentaDeLaRegion` (la IA: sus pueblos y el ayuntamiento de sus ciudades de dentro). El monedero es `Player.oro`, un número; el motivo de no poder pagar, `oroBlocker` (`town/town.ts`: «no alcanza el oro: cuesta … y tienes …»)

### Camino de un héroe (con lo hostil)

`alcanceDelHeroe`, `caminoHasta`; nadie fuera de `game.ts` llama a `findPath`/`reachableFrom`

### La infiltración (05-11-2026, fase A, `docs/agents/2026-11-05-infiltrados-y-robo/`)

quién se infiltra, `infiltracionBlocker` (`hero/infiltracion.ts`: su tipo y toda su tropa; sin tropa, solo el tipo; «no se infiltra: no lo llevan su tipo (Caballero) ni …»), y `seInfiltra` (el predicado del camino caliente, que no monta la frase); el rasgo `infiltrarse` (`CREATURE_TRAITS`, en `data/unidades.json`) lo lee solo ese módulo, y los tipos, `data/infiltradores.json` (a mano: `tipos-de-heroe.json` es generado), solo `hero/tipos-de-heroe.ts` (`validarInfiltradores`, que rechaza el tipo por defecto; `tipoSeInfiltra`; lo vigila `invariantes-partida.test.ts`); lo que cuesta una barrera, `precioDeLaBarrera` (el día entero: `Hero.marchaDelDia`, la marcha con que empezó el día, que fija con `movePoints` solo `empezarElDia` —al empezarlo, el inicial y el contratado— y no cambia con la tropa; o `null`), que es el `barrera` del Dijkstra del héroe (`reachableFrom`/`findPath(…, barrera)`: con `null` no corre nada nuevo y el banco no cambia); qué casilla se pisa, `isEnterable(map, p, pisaBarreras)` (la única regla: con él, también las cinco barreras fuera de todo recinto; la muralla de una ciudad, no), y cuál es barrera para nombrarla, `barreraEn`; las frases, la de la marcha que no da ni un paso (`moveHero`: «<héroe> hoy no da ni un paso: …», cuánto cuesta el primero y cuánto le queda, y si es barrera «(x,y) es montaña y cuesta el día entero de marcha (N), y le quedan M; se entra mañana»: sin «no quedan puntos», que con casi todo el día se leía al revés, H2 de la vuelta 1 de QA), la de la ruta que hoy se para ante una barrera (`barreraDeMañana`, `state/game.ts`: el primer paso de otro día, si es barrera; la pone `Session.previewPath` en ese paso, `PasoDeRuta.barrera`, y la dice `llegadaDeLaRuta` si se ve) y la de `porQueNoLlega` («… sin cruzar una barrera: solo la cruza un grupo que se infiltra, y no se infiltra: …», cuando infiltrándose llegaría); el nombre de cada barrera para la persona, `NOMBRE_DE_BARRERA` (`map/terrain.ts`); el agente, `heroes[].infiltrates`/`infiltrationBlocker`; el panel, `Session.infiltracion`; el candidato del ayuntamiento, `CandidatoAHeroe.seInfiltra`; la figura parada en una barrera (sin tablero), `pisada(…, nodos)`: la clave de sus pies subida por `subidaEnUnaBarrera` de `loQueTapaEnUnaBarrera` (`render/escenario/figuras.ts`; de una vez, `delanteEnUnaBarrera`), **sin `claveDeFigura`** (sus `cubiertas` la subían por encima de lo horneado de delante: N1 de la vuelta 2 de QA), con lo que la tapa guardado, perezoso, por casilla en `Escenario.enUnaBarrera`: sube por delante de lo que está detrás (`deDetras`: lo del relieve que cuelga de su fila o de más al norte, `filaAlta`; lo demás con el pie en sus pies o más al norte, no en su fila) y de la masa de una barrera de más al sur (lo que no es algo hecho, `esAlgoHecho`, ni la cubierta de lo que se pisa), y nunca hasta pasar lo hecho de más al sur que la tapa (un recinto, un objeto, un puesto); de las piezas de un nodo (hito y obras) cuenta solo la que se pinta con lo que se sabe de él (`seVeConSuNodo`, con los nodos que pasa `mapa.ts`, `nodosQueSeSaben`: N2 de la vuelta 2): H1 de la vuelta 1 de QA, el goblin al norte de Valdeluz (s8) se pintaba encima de sus torres

### Territorio y renta

`territorio(state)`, `dueñoComun`

### Quién lleva cada bando

`Player.controller` (`human`, `agent` o `ai`); la batalla que nace en el turno de la IA la toma el controlador de su dueño (`quienLaToma`, con lo que pasa `ConduccionDelTurno.batallas`: la persona, sus defensas; el agente, `BattleTakeover`), y quién no se rinde lo dice `sinLaIA`

### Las murallas del mapa (04-11-2026, fase 2 del puesto fronterizo)

las formas, `data/sitios.json` (en «murallas», **por nombre** y abiertas: hoy `base-derecha`, de piedra (la muralla por defecto, la «Base derecha» que dibujó el usuario en la arena, pegada a la salida del defensor, 06-11-2026; era `gruesa`, en medio del tablero), y `linea-con-puerta`, de madera, cada una con su `material`; son del mapa, no copias de la arena; **quién usa cuál**, una sola tabla, «usos»: la ciudad, el pueblo y cada obra del paso nombran su forma), que **importa solo `state/sitios.ts`** (lo vigila `invariantes-datos.test.ts`) y lee y juzga una vez al cargar `leerSitios` (lanza nombrando el fichero y la forma o el uso; da `MURALLAS_DEL_MAPA` y `OBRAS_DEL_PUESTO`): que cada forma sea una muralla (`validarMuralla`) y que valga para el mapa, `murallaDelMapaBlocker` (`battle/muralla.ts`: que **cierre**, que se asalte —un muro con pie fuera y, andando como el atacante arriba, `pasoPermitido`, suelo dentro—, que lleve puertas y cada una separe fuera de dentro, y que quepan `maxPorBando` en cada salida, `salidaDe`); cuál lleva cada batalla, `murallaDelSitio(sitio)` (`sitios.ts`: la de la ciudad, la del pueblo, el paso la de su obra, fila «Las obras del puesto»), que pregunta `montarLaBatalla` por **el sitio en juego**, `sitioQueSeDefiende` (`batallas.ts`: la ciudad, la guarnición de un paso o un pueblo, o el sitio suyo del héroe atacado; la misma pregunta que leen la defensa, `dejarPendiente`, y lo que se entrega al perder, `applyVictory`); con muralla, **escalera a todo el bando atacante**, una por stack y su héroe, `alAsalto(bando, muralla)` (`battle/montaje.ts`, `HeroeDelBando.escalera`; quien vuela no la recibe, `quienNoEscala`; lo leen `montarLaBatalla` y `tools/qa/medidas/arena-ia.ts`, sobre los bandos de la arena, `bandosDeArena`). Las jugadas, `TIPOS_DE_ESCALA` y `TIPOS_DE_PUERTA` (con `esTipoDeEscala`, `esTipoDePuerta`; las cuatro, `JugadaDeMuralla`), y quién no las usa nunca, `quienNoEscala` y `quienNoAbre` (`asalto.ts`; la puerta, `puertaBlocker`). En el cliente, una pieza para la partida y la arena, `MurallaDeLaActiva` (`sesion/batalla/muralla.ts`: lo que espera el clic, `porElegir`, es **una clase más de `LoApuntado`**, así que elegir un muro suelta el hechizo o el poder y Escape, toda jugada y cerrar la batalla lo sueltan; `muroPorElegir` y `puertaPorElegir`, derivados; la apunta solo ella —lo vigila `invariantes-batalla.test.ts`—; su motivo, `motivo(tipo)`, y el botón, `elegir(tipo)`; `soltar` desde la escena), pintada por `botonesDeMuralla` (`batalla/poderes.ts`: un `botonDeMuralla` con `data-action="battle-muralla" data-jugada="<tipo>"`, que las dos páginas mandan a `elegir` con `jugadaDelBotonDeMuralla`); el lienzo pinta muros y portadas por su acabado (`ACABADO_DEL_MURO`, `render/batalla/muralla-pintada.ts`: la piedra en hiladas, la madera en estacas)

### Las obras del puesto (04-11-2026, fase 3 del puesto fronterizo)

la obra de un paso, `node.mejora` (`MEJORAS_DEL_PUESTO`, `MejoraDelPuesto`, `esMejoraDelPuesto`, `core/map/map.ts`: `ninguna`, `empalizada`, `muralla`; un primitivo del objeto, así que la niebla la recuerda sola y viaja con él al espectador), que **escribe solo `mejorarElPuesto`** (`state/sitios.ts`; lo vigila `invariantes-partida.test.ts`): tomar el paso no la toca; las obras y su escalera, junto a su tipo (`ObraDelPuesto`, `OBRAS_DE_UN_PUESTO`, `OBRA_SIGUIENTE`, `map.ts`; `events.ts` las importa de ahí); lo que cuesta cada obra y tras qué muralla se pelea, `OBRAS_DEL_PUESTO` (de los «usos» de `data/sitios.json`: el precio y **la forma que nombra**, la misma de quien la comparta, sin copiarla; la carga exige el material que dice el nombre, `MATERIAL_DE_LA_OBRA`: la empalizada, de madera; la muralla, de piedra); lo que es un sitio en un motivo, `QUE_ES_EL_SITIO`; la regla, `mejorarBlocker(state, jugador, héroe, obra, oro)` (héroe suyo en su paso, que quede obra, **que la pedida sea la que toca** —la acción nombra la obra, `mejorar_el_puesto { hero, obra }`, y el botón la lleva en `data-obra`: el segundo clic de un doble clic en «Levantar la empalizada» compraba la muralla, QA de la fase 3, H-F3-1; en la partida, además, su segundo clic no cuenta, como el de ningún botón salvo los que suman de uno en uno (`repartirClic` de `partida/reparto-del-clic.ts`; decisión del usuario, 07-11-2026), porque el repintado llega entre los dos clics de una persona— y el oro, `oroBlocker`; sin tope por día; como `buildBlocker`; si una obra es de un puesto, `esObraDelPuesto`), que leen la acción `mejorar_el_puesto` (que **cobra en `game.ts`**, con el jugador que ya tiene, como toda compra; hecho `outpost_upgraded { hero, site, to, cost }`, como sus hermanos) y el diálogo; lo que pinta el diálogo, `laObraDelPuesto` (de una sola `laMejoraPedida`: el rechazo, `motivo`, y lo que solo informa, `nota` —«el puesto de … ya está amurallado», dicho del puesto para no concordar con el nombre del paso (H-F3-2)—, como `motivoMas`/`notaMas` de la defensa, y el material de cada obra, `materiales`). En el cliente, `Session.mejorarElPuesto(obra)` (la del botón pulsado; la vista lee el privado `obraDelPuesto`, que pone el turno solo en el `motivo`), la sección «El puesto» de `partida/guarnicion.ts`, cómo se dice cada obra, una tabla (`SE_VE_EN_EL_PUESTO`, `DICHO_DE_LA_OBRA`, `client/comun/dichos.ts`: botón, barra y crónica), y el marcador del mapa, `pintarMarcadorDelPuesto` y lo que sube su bandera, `altoDelMarcador` (`render/mapa/marcador-del-puesto.ts`: caseta, torreta de madera, torre, con la sombra común, `pintarSombra`, a la escala de la obra que sustituye); **dónde va y qué se pinta lo dice la escena** (fila «El puesto en la escena»), y `mapa.ts` solo planta la bandera (`Cosa` `puesto`) en la pasada de lo que dice quién está. En el contrato, `UPGRADE_DE_MEJORA` (`vocabulario.ts`: `none`, `palisade`, `wall`; `UPGRADES`, `esUpgrade`, que lee el arnés), el `upgrade` del nodo en `knownMap`

### Desenlace y causa del final (barra, crónica y nota del agente)

`finDePartida`, `desenlaceDe` (`state/desenlace.ts`)

### Ventaja para atacar/emboscar

`ventajaClara` (`hero/fuerza.ts`)

### Lo que se anda hoy (marcha y ruta)

`pasosDeHoy` (`state/marcha.ts`)

### El héroe andando su marcha por el mapa (06-11-2026, «el personaje se teletransporta…»)

el núcleo mueve de golpe; la sesión guarda lo andado (sus `hero_moved`, también cortada, parada o emboscada) en `Session.marchaEnCurso` y **lo que abre la llegada** (batalla, base, lugar, guarnición, la frase de la parada) espera a `acabarLaMarcha` (`alAcabarLaMarcha`), solo con `enseñarLaMarcha` (la página; los tests y el espejo de `pnpm capturas`, en el acto). Por dónde va, `enLaMarcha` (`marcha.ts`, a `msPorCasilla` / `PRISA_EN_EL_MAPA`, piernas incluidas) sobre su traza, **la misma de la línea de la ruta** (`puntosDeLaTraza`, `render/mapa/mapa.ts`, de `trazaPorLosArcos`, `recinto.ts`: al entrar o salir de un recinto, por el arco de su puerta, `pasoPorElArco`, el de la senda; QA del 06-11-2026); lo pinta `VistaMapa.andando` con su clip `walk` y su dirección, la cámara lo sigue y al llegar se centra como antes (`EscenaAventura.andando`). Mientras anda, la línea es lo que le queda desde donde va (`VistaMapa.marchaDeLaRuta`) y al llegar sin llegar al destino queda pintado lo que falta hasta que se pulse otra cosa (`EscenaAventura.destino`); **lo que se pinta es lo de antes de andar** (el movimiento del panel, `Session.movimientoALaVista`; los objetos como se sabían) salvo la niebla, que va con él (`pisarEnLaMarcha`, `nieblaDeLaMarcha`, `sesion/vistas/marcha.ts`: cada región, al pisar la casilla que la descubre); un gesto durante la marcha solo la hace llegar (`hastaQueLlegue`, `main.ts`; `clickTile`). `#app[data-marcha]` mientras anda. Los rivales no andan (backlog)

### El clima (tiempo y noche por región, 22-10-2026; presentación)

`core/state/clima.ts`, el único que importa `data/clima.json` (inventado, `validarClima`; lo vigila `invariantes-datos.test.ts`): de la semilla, `tiempoDeLaSemilla` y `nocheDeLaSemilla` (puras, en cadena y con su propia corriente: ni una tirada de la partida; la noche con el peso de la facción del dueño de la región ahora, `dueñosDeLasRegiones`); **la noche va con el dueño de AHORA**: tomar una región cambia su cadena y, a veces, su noche en el acto (10,9 % de las tomas en 1-40, 44 % si la toma un no muerto; se acepta, «cae la noche cuando llegan los no muertos», y fijarla al empezar el día pediría guardar estado solo para eso: QA del 22-10-2026, H3); lo de hoy de una región, `climaDeHoy` (privada), que leen `climaDeLaPartida` (todas, memorizado por día, lo pedido y los dueños) y, de lo de toda la partida, `climaEn` (una casilla) y `esDeNocheEn`, lo que leería `core`; de una casilla, `regionDelSitio` (`regionMasCercana`, `map/regiones.ts`, la misma de la niebla: las barreras, los nodos y las ciudades, con la región más cercana, `laMasCercana`) y `climaDelSitio`; de una batalla, `regionDeLaBatalla` (la casilla de `lugarDelRival`) y `climaDeLaBatalla`, y lo que viaja al espectador es la región, que lee con `climaDeLaRegion`; lo que pide el narrador, `pedirClima`, el único que escribe `GameState.climaPedido` (lo vigila `invariantes-cliente.test.ts`), con `climaBlocker`, y su única lectura, `pedidoVigente`; `?clima=`, `parseClima`, `validarForzado`, `forzarClima` y `climaSinRegiones`. Lo pinta `render/clima/`, un solo pintor para el mapa y toda escena (`pintarSueloDelClima` y `pintarAireDelClima` sobre un `CampoDelClima`: `campoDeEscena` o, por región y con su frente, `campoDelMapa`; el frente, `regionEnElFrente`; las recetas, una fila por tiempo en `EFECTOS`), que no lee la sesión (lo vigila `invariantes-cliente.test.ts`)

### Qué héroe se ve y qué se sabe de un objeto (agente, lienzo, minimapa, barra)

`heroesALaVista` (lo mirado ahora), `objetosConocidos` (vivo si se mira, si no el recuerdo de `memory`); el cliente, por `Session`

### Qué grupo de asaltantes se ve

`asaltantesALaVista` (lista con la marca `AsaltantesALaVista`; sin niebla, `todosALaVista`): si se mira su casilla (02-11-2026); para un grupo suelto (la crónica, la marcha, la IA), `visibleNowAt`

## Reglas del juego

### Tropa

individuos, uno por hex, acotados por el liderazgo (`data/liderazgo.json`, provisional) y por el tope de tropa de la partida, héroe incluido: 3, 5 o 7 (**regla nuestra**, 22-10-2026, decisión del usuario; por defecto 7). Con un tope menor, guarniciones, monstruos y asaltantes nacen recortados a él y el ejército de salida, a lo que quepa; el encuentro de un lugar de un mundo se recorta al pelearlo y al medirlo la IA (`gruposAlTope`), y la tropa que da un lugar cabe en el cupo de la partida

### Recursos

**regla nuestra** (21-10-2026, decisión del usuario, «solo oro»): solo oro. Sin minas ni montones de recursos en el mapa; el oro sale de las ciudades (su ayuntamiento), de los pueblos (250 al día cada uno, `rentaDelPueblo`, inventado) y de los cofres, y solo cobra lo unido a la base (`rentaDelDia`). Se empieza con 27 500 (`oroDeSalida`: el monedero de antes pasado a oro), y el primer gasto es el héroe de salida (`precioDelHeroe`, 2 500, el de todo héroe; 22-10-2026)

### Movimiento diario

lo marca el más lento del grupo, **el héroe incluido** (26-10-2026, decisión del usuario: un héroe a pie frena; a caballo, no), cada uno por las casillas de su montura, de guerra o de silla, o las suyas a pie (`marchaDe`, `slowestSpeed`): un caballo de silla solo sube la marcha si lo llevan todos; se fija al empezar el día. **Regla nuestra** (#226): la tabla de fheroes2 (1000-1500) ×√(`AREA_POR_REGION` / `AREA_DE_REFERENCIA`) = ×√1,5 → 1224-1837 (`marchaALaEscala`, `core/escala.ts`); el escalón de una casilla (`crawling`, la agilidad que deja el peso), como el de dos (**regla nuestra**, 25-10-2026)

### Victoria

**regla nuestra**: perder la base elimina en el acto

### Infiltración

**regla nuestra** (05-11-2026, petición del usuario: «Rasgo de unidad, si todos lo tienen incluido el heroe pueden atravesar barreras con movimiento 1, pueden tardar varios dias»; fase A de los infiltrados, la del robo vendrá después): un héroe se infiltra si su tipo lo hace (`data/infiltradores.json`: inquisidor, vampiro, capitán mercenario, mago de los elfos y goblin; inventado, ninguno el de por defecto) y toda su tropa lleva el rasgo `infiltrarse` (penitente, espectro, rodelero, explorador y asesino elfos, goblin lancero y arquero). Ese grupo pisa las cinco barreras, y **cada casilla de barrera cuesta el día entero** (decisión del usuario, «Un día entero»): entra con el día recién empezado y lo gasta todo; si ya anduvo, espera en el borde. N casillas, N días. **Parado en una barrera es intocable** (decisión del usuario): no lo emboscan los asaltantes (no es de ninguna región) ni lo alcanza quien no se infiltra; otro infiltrado sí, y es una batalla. La muralla del recinto de una ciudad no es una barrera y no se abre. Una barrera no es de nadie: ni territorio ni renta. Riesgo aceptado (I10): el Dijkstra suma días como coste, así que una ruta por barrera puede perder el resto del día en el borde y tardar uno más que un rodeo. La IA no la aprovecha (backlog)

### Guarnición y defensa

**regla nuestra** (04-11-2026, fase 1 del puesto fronterizo, decisiones del usuario; `docs/agents/2026-11-04-puesto-fronterizo/`): toda ciudad, todo paso (nodo que no es ciudad) y todo pueblo es un **sitio** que guarda tropa: todas en `GameState.guarniciones`, con su dueño (quien la dejó, el de la base, o `null` la neutral; la de la ciudad estaba en `Town.garrison` hasta el 05-11-2026). **La guarnición no se recoge sola** (fuera la recogida al pasar por casa, `takeGarrison` y `garrison_taken`): el héroe PARADO en un sitio suyo deja y recoge tropa (`dejar_tropa`, `recoger_tropa`; de su tipo, los que se irían, `elQueSeIria`, o el veterano que se nombre), o la reparte de una vez (`repartir_tropa`, la pantalla de la persona: solo cuenta el reparto final, así que con los dos llenos se cambia uno por otro; D9, 04-11-2026), con el cupo de la guarnición de siempre (`GARRISON_LEADERSHIP` y el tope de la partida) en los tres. El pueblo y la ciudad de dentro de una región son de quien tenga la región; la tropa de otro dentro los **ocupa** (fila «Ocupación»; hasta el 05-11-2026 el pueblo era de quien lo guardaba). **Defensa**: con el héroe en su sitio con guarnición, pelea él (siempre) con lo que se elija de su tropa y la guarnición, hasta lo que le cabe y sin dejar fuera más de lo que cabe en la guarnición; lo propone la IA (`defensaDeLaIA`) y la persona lo puede rehacer antes de la primera jugada; lo que no pelea, si pierde, se pierde con el sitio (la ciudad o el paso pasan al que gana). Sin héroe, la guarnición entera. Una ciudad, un paso o un pueblo con guarnición ajena se alcanza pero no se cruza: pisarlo es pelear contra ella (`BattleFoe` `garrison`, con `site`; la ciudad era `town` hasta el 05-11-2026); vencida, el sitio del muro es del que gana y el de dentro de una región se queda sin ella, y quien gana se queda en su casilla de antes. Un paso tomado pierde la guarnición que tuviera. La IA recoge lo que le quepa **al llegar** a un sitio suyo: el contratado en su ciudad, el que acaba hoy una marcha en él y el que volvió vencido o rendido a su base desde su último turno, también en el del rival (volver es llegar: `Hero.vueltoACasa`; `playAiTurn`, 04-11-2026, S8 de `/simplify` y H2 del QA); el que se queda en casa no la vacía, así que el de salida deja la de su base el día 1. No deja tropa (backlog). La batalla en un sitio se pelea tras su muralla (fila «Murallas del mapa»)

### Ocupación

**regla nuestra** (05-11-2026, tarea 2 del puesto fronterizo, decisiones del usuario P1-P4; `docs/agents/2026-11-05-ciudades-en-su-region/`): las bases y las ciudades-puente van **en el muro** (nodos: se toman como un paso); las demás ciudades, **dentro de su región** (el generador lo hace desde la fase 2), y un pueblo puede ir en el muro, sobre montaña, bosque o acantilado (fase 3: el generador, uno de cada cuatro pares; se toma como un paso). Un sitio dentro de una región es **de quien tenga la región**; si dentro hay tropa de otro —un héroe rival en su casilla o una guarnición que no es del dueño, también la neutral de una ciudad neutral (P1: la tropa no cambia de bando)— está **ocupado**: no da oro y, una ciudad, ni recluta, ni construye, ni crecen sus moradas (la semana se pierde), ni se contrata en ella, ni vende su armería (P4; la armería, desde el `/simplify` del 05-11-2026: «oro y la ciudad entera»). Quien ocupa no se queda el sitio, ni recluta, ni construye, ni deja tropa. Se recupera pisándolo: batalla contra el ocupante, **tras la muralla del sitio** (P3); si el ocupante pierde o se va, vuelve a dar. La IA recupera lo suyo con ventaja clara (`valorDeRecuperar`) y no ocupa a propósito (backlog)

### Murallas del mapa

**regla nuestra** (04-11-2026, fase 2 del puesto fronterizo, decisiones del usuario D3, D7 y D8): toda batalla contra una **ciudad** (también la base y la neutral) se pelea tras una **muralla de piedra** y contra un **pueblo** tras una **empalizada de madera** (la ciudad o el pueblo que se ataca, su guarnición o el héroe que está dentro, **sea de quien sea**: también el que lo ocupa, P3 de la tarea 2); en un **paso**, la de su obra (fila «Obras del puesto»). Las formas, `data/sitios.json` (copiadas de la arena: la de la ciudad, la «Base derecha» que dibujó el usuario (06-11-2026; antes, la «Muralla gruesa»), que cierra la salida del defensor; la del pueblo, la «Línea con puerta»; se editan sin tocar la arena, que trae de ejemplo la «Base derecha» y su espejo, la «Base izquierda»), **cierran** el tablero y llevan **puertas**, que empiezan cerradas y abre y cierra quien defiende, y se asaltan con **escaleras**: **todo el bando atacante lleva una**, cada stack y su héroe, sin comprarla, y se gasta al ponerla (la puesta la usa cualquiera; quien vuela se posa sin ella). Lo demás es la regla de la muralla de la arena (subir y bajar, el bono de lo alto, el tiro tapado), el mismo bono para los dos materiales: solo cambian la forma y cómo se pinta. La IA de batalla ya la jugaba (`asaltoALaMuralla`, `puertaDelDefensor`, `tiradorAlMuro`); la del mapa **no la pesa** (`ventajaClara` no la ve: backlog). Medido el 04-11-2026 (`tools/qa/medidas/arena-ia.ts`, «murallas del mapa», 100 por forma, un héroe por lado sin libro, 6 contra 5): 0 sin terminar, rondas 8 / 14 (piedra) y 8 / 13 (madera), gana el atacante 19 y 15; en el banco, rondas por batalla 3 / 7 / 11 → 5 / 9 / 19

### Obras del puesto

**regla nuestra** (04-11-2026, fase 3 del puesto fronterizo; la petición: «el puesto podrás mejorarlo con empalizadas y murallas»): un paso tomado es un puesto, que nace sin obra (en el mapa, una caseta) y se mejora de una en una y sin bajar: **empalizada** (1 500 de oro, inventado; una torreta de madera) y **muralla** (4 000; una torre), con el héroe del dueño en el paso, pagado en oro y en el acto, sin tope por día. La batalla en el paso se pelea tras la muralla de su obra: la empalizada, la de madera de los pueblos; la muralla, la de piedra de las ciudades (las mismas formas de `data/sitios.json`, con sus escaleras); sin obra, sin muralla. **La obra se queda con el paso cuando cambia de dueño** (es una obra; pendiente de confirmar con el usuario). La IA de reglas no mejora (backlog), así que el banco no cambia

### Orden de turnos

**regla nuestra** (fheroes2 lo tiene fijo): en serpiente, quien cierra un día abre el siguiente (día 1 j0, j1; día 2 j1, j0…; `ordenDelDia`, que leen el paso de turno y el `you.turnOrder` del agente). Con el fijo, j0 ganaba 603 de 1 000 y abrir el día valía +65; en serpiente, 534 y +2 (09-10-2026); con las fronteras onduladas de #229, 524 de 1 000 y duración 8 / 14 / 29

### Lo demás de las reglas

- **La tropa se hace héroe** (solo con agente): un veterano de rango 5 en su base
  dispara `hero_from_troop` al empezar el turno del agente
  (`ascensoBlocker`, `ascenderVeterano`).

- **Las voces de la base** (solo con agente): `town_voices` pide, antes del turno y en una
  sola petición, las líneas de la gente de las bases caducadas (semana nueva o un sitio
  levantado por primera vez, `firmaDeVoces`). Cada voz y cada línea se juzga sola
  (`ponerVoces`); sin agente, respaldo determinista de `data/vecinos.json` con su propio
  `createRng`. Es presentación: `Town.voces` no escribe en la crónica y el banco no lo ve.

- **Asaltantes**: grupos neutrales que patrullan regiones sin dueño y emboscan
  al pisar si les sacan `ventajaClara`. Son actores (`GameState.raiders`), no
  objetos del mapa. Un grupo se ve si se mira su casilla (`asaltantesALaVista`, la
  única regla, que leen ruta, lienzo, barra y `knownMap`, y `visibleNowAt` para uno
  suelto: el sello de la crónica, la marcha y la IA; 02-11-2026, decisión del
  usuario: antes bastaba una casilla de su región, #130, y se veía sobre el negro;
  ahora uno fuera del radio puede emboscar sin haberse visto), y la marcha se para donde ve uno que la emboscaría
  más adelante con la fuerza de ahora y que no es el que la ruta avisaba al salir
  (`vigiaDeLaMarcha`, `march_halted`). **La IA de reglas juega con niebla** (#164):
  teme los grupos que ha visto (`Player.asaltantesVistos`, que escribe `mirarDesde`
  con `recordarAsaltantes`: se olvida uno al mirar la casilla donde se vio y no
  verlo; teme su región entera) y solo persigue
  los que ve ahora (`casillasPeligrosas`, `strategy.ts`). Sin el recuerdo, 32 de 300
  partidas sin terminar.

- **Base**: nace con guarnición de su facción (`data/ciudades.json`, `guarnicionDeBase`; la de una
  ciudad neutral, `guarnicionNeutral`), en `BuiltMap.guarniciones` y de ahí en `GameState.guarniciones`; va en el muro (`problemasDeLasCiudades`). Con el héroe del dueño dentro, defiende él con lo que se elija
  de su tropa y de la guarnición (ver «Guarnición y defensa» en las reglas; hasta el 04-11-2026, «solo
  él con su tropa»). Las bases de templarios heredan el arte de los caballeros; las otras cuatro, el suyo (20-10-2026).
  **El héroe de salida nace dentro de su base** (19-10-2026, «empieza en la base»): en la casilla
  del castillo (`newGame`, con `basesDelPlan`), sin recoger la guarnición, **y se paga** (22-10-2026,
  «con coste que se descuenta de lo que queda para reclutar más tropa»: `precioDelHeroe`, 2 500, el de
  contratar, por `hireHero`; la persona sin `?heroe=` lo elige ante el ayuntamiento, uno por tipo de
  su facción, y hasta entonces no recluta, ni construye, ni pasa el turno; la IA y el agente, el de
  por defecto, sin cambio de contrato; banco `420d75c9…`, 4 / 8 / 12); los jugadores son los
  dueños de ciudad y el plan no lleva inicios (`MapPlan.heroStarts` se retiró: el esquema del agente
  lo rechaza diciéndolo). Dentro, lo que se recluta va a su tropa y no se contrata hasta que sale.
  Medido (19-10-2026): en 1-100, duración 4 / 7 / 15 → 4 / 6 / 15, j0 50 → 45, 0 sin terminar; el
  banco (`3daacbe6…`), 4 / 8 / 21 → 4 / 6 / 23. La IA recluta y cambia tropa el día 1 en vez de
  salir: `dismissed` 387 → 1 159. Con la IA reclutando del más fuerte al más flojo (`planRecruits`,
  por `unitPower`: la morada no es un nivel, y por ella del revés licenciaba en la misma jugada lo que
  acababa de reclutar, 180 veces en el banco), `3406f518…`: 1-100, 4 / 6 / 19, j0 46, 0 sin terminar;
  el banco, 4 / 6 / 22, `dismissed` 977. Las batallas contra monstruos y asaltantes del banco pasan
  de 23 y 6 a 0 porque el héroe sale de casa más fuerte (fuerza mediana el día 3, 460 → 960): ninguna
  región lo embosca, siempre llega a una ciudad que tomar y una ciudad (40 000) gana a un neutral
  (2 000); en 1-100 la IA iba a por un monstruo solo cuando no llegaba a ninguna ciudad ajena (32 de
  32 veces), y eso pasaba en el 11,5 % de los turnos de héroe y ahora en el 0,3 % (`docs/historia.md`).

- **Magia**: el gremio enseña por derivación (`townSpells`, los de `gremio` de su nivel o menos),
  `syncSpellbooks` aprende al final de cada acción, `cast` no consume el turno, `castBlocker`
  escribe el motivo. El formato de un hechizo, en la fila «Magia» de las reglas.

## El cliente

- **El puesto** (04-11-2026, fase 3): en un paso, el diálogo de la guarnición lleva debajo «El puesto»:
  su obra (una caseta, una torreta de madera, una torre), tras qué muralla se pelea en él y el botón
  de la siguiente con su precio («Levantar la empalizada · 1500 oro», «Amurallar · 4000 oro»),
  apagado con el motivo del núcleo (sin oro, en rojo; ya amurallado, «Mejorar» y una nota); mejorar
  deja el diálogo abierto. En el mapa (fase 4, 05-11-2026), el paso tomado enseña su obra con el arte
  de Codex (`assets/mapa/puesto-caseta`, `-torreta`, `-torre`, a la escala registrada sobre su guía;
  sin la imagen, el marcador dibujado de la fase 3 a la escala de la obra,
  `render/mapa/marcador-del-puesto.ts`), como una pieza más de la escena (`Sprite.deNodo`) en el sitio que
  le reservó (junto al eje del paso, detrás o a un lado del héroe parado en el nodo, sin pisar la
  senda; en un puente, en la orilla; en la puerta de una muralla, fuera de la muralla que se
  levantará) y en su profundidad; la bandera del dueño, en lo alto y encima de todo. El neutral, su
  hito de siempre, que el tomado no pinta (`seVeConSuNodo`).

- **La guarnición y la defensa** (04-11-2026): parar en un paso o un pueblo suyo, o pulsarlo con el
  héroe dentro, abre `<dialog id="guarnicion">` (modal: su ejército y la guarnición como quedarían,
  «Dejar ›» y «‹ Recoger» pasan uno al otro lado **sin tocar la partida**, y «Confirmar» manda el
  reparto entero, que el núcleo juzga solo al final: con los dos llenos se cambia uno por otro, y lo
  que no cabe a un lado se puede mover mientras el final quepa, con el motivo bajo «Confirmar»;
  «Cancelar» o Escape lo descartan; vuelta 1 de QA, D9); pasar de largo no la abre; en la base,
  el botón «Dejar y recoger tropa», y en el panel del héroe, «Guarnición». Atacado en su sitio con
  guarnición, antes de la primera jugada sale `<dialog id="defensa">` con la propuesta de la IA
  marcada y «−»/«+» por tipo, y dice que los elegidos se quedan con el héroe después de la batalla;
  lo que solo informa («pelean los 5 × … que hay») va en el tono
  apagado (`notaDelApagado`) y no en el del rechazo (`motivoDelRechazo`); «Defender» la rehace en el núcleo,
  «Como propone la IA» o Escape la dejan, y la batalla empieza al cerrarla (hasta entonces no se
  juega nada). Con cualquiera de las dos abierta, toda tecla es suya: Escape la cierra a ella y no
  también la base de detrás (H3 del QA). `pnpm capturas` cierra
  las dos solo (la de la defensa, con la propuesta de la IA) y fotografía cada una la primera vez.

- **La pantalla de inicio** (`partida/inicio/inicio.ts` conduce, `partida/inicio/pantallas.ts` pinta por `comun/html.ts`,
  en `<section id="inicio">` con `#app` oculto): pregunta solo si la URL no pide nada
  (`hayQuePreguntar`) y deja lo elegido en la URL, que lee `main.ts` como un enlace o una recarga. La
  elección enseña de cada facción su nombre, su rasgo del cuaderno (`rasgoDeFaccion`) y el héroe con
  que se empieza (`nombreDeSalida`); marcarla (el clic, el dedo o las flechas) la viste
  (`ponerTema`); pasar el puntero o el foco, no (20-10-2026, «que no cambie de tema en hover sino en
  click»; la lista mide lo mismo con cualquier tema), y Escape vuelve al menú, en el neutro
  (`quitarTema`). «Empezar» abre la partida (22-10-2026: el héroe ya no se elige en el menú sino
  en la base, ante el ayuntamiento, como la tropa ante su morada: una figura por tipo, la ficha con
  el retrato de su hoja, `identidad.webp`, su descripción del cuaderno y su precio, y «Contratar»;
  «Volver a la base» o Escape salen, con todo lo demás apagado y su motivo). Mientras se está en la
  base de arranque, el suelo del mapa ya se pinta (`calentarElMapa`, `main.ts`). Lo juega la pasada
  «arranque» de `pnpm capturas`.

### La base es un escenario lateral

**La base es un escenario lateral** (`partida/base/escena.ts`, `render/base/`), como el de
combate sin casillas: delante una franja de 3,5 pasos de fondo (la mitad de la rejilla) por
la que se anda en recta con el ratón, resbalando por el borde de atrás (`alaFranja` en cada
fotograma), y la cámara sigue en horizontal con tope (`camaraQuieta`, `seguir`).

**Detrás, la
plaza es un solo cuadro** (vuelta 3): `tramos` (5) cuadros de 1536×1024 a 128 px por paso,
pedidos cada uno por separado y cosidos por una **junta**: en cada borde que da a otro tramo, la
guía pide un árbol alto con su pilar (`JUNTA`, `tools/taller/base.ts`), y el tramo siguiente se
monta `SOLAPE` (64 px) sobre él, fundido hoja con hoja (con la placa de al lado como `contigua`,
o su final pintado en el lienzo, Codex pintaba la plaza a otra altura: costura de F2).

**El suelo
es del juego**: un solo empedrado repetible (`suelo.webp`, de las columnas del medio de una placa,
cosido por la costura de menor diferencia, `sueloRepetible`) va debajo de todo, y de cada tramo
se pinta solo lo de encima de su pie (`lineaDelPie`, columna a columna, que solo yerra hacia
abajo; `tramo-<n>.webp`, derivado), bajado lo suyo (`bajar`, uno por tramo: la mediana de sus
puertas en la raya). Cada tramo se pide con todos sus edificios a la vez (el *maestro*) y otra
vez sin ellos (la *placa*, `fuentes/placa-t<n>.webp`); cada edificio sale del maestro (o de su
edición, las mejoras) por la diferencia con la placa en la región de su sitio, cortado por el pie
de su cuadro, y se pinta en su sitio exacto, sin escala ni ancla (`recortarLaBase`; el índice
`indice.json` es derivado y trae hecho lo que se deriva del cuadro: el solape fundido de cada tramo y el color del cielo; el cliente no crea lienzos al cargar).

**Manda el cuadro**: el umbral de la
puerta y la región de cada sitio se miden sobre el maestro y se escriben en
`data/bases/<f>.json` en píxeles de su tramo; `planoDelCuadro` es la única cuenta de píxel a
escenario. El
borde de atrás de lo que se pisa une los umbrales (`bordeDeAtras`) y no es convexo.
`leerDisposicion` lanza con regiones que salen de su tramo o se pisan, puertas fuera de su
región o a más de 1,5 pasos de la raya, y lo que no se pisa.

**El lienzo va a todo el alto, como
el mapa** (20-10-2026, decisión del usuario: «al hacer la pantalla más estrecha se encoge la parte
donde se ve la base»; iba en un marco 20:11 que encogía con el ancho): el paso es el de una
batalla en un marco 20:11 de ese alto (`pasoDeLaBase(alto)` → `escalaDelCombate`, el encuadre
aprobado el 09-10: 85,7 a 594 de alto, 111,5 a 773; en el móvil, al alto del mapa, 513 en 390×844, con el
ancho de 860 de la batalla del móvil) y lo que
cambia con el ancho es cuánta plaza se ve. El suelo va a 25°. Toda figura va delante de todo
edificio. Un sitio sin construir enseña la placa. Camina el héroe si está dentro y, si no, el
alcaide; un clic lleva a la puerta y, al llegar, el ayuntamiento o el castillo abren «Ampliar»,
una morada su escena y una persona la conversación (`<dialog id="conversacion">`).

**La morada
es la base misma** (`Scene = 'morada'`, `partida/morada/escena.ts`, vuelta 2 del 20-10-2026: «queda una
sala en el vacío»): la cámara de la base se acerca hasta que las figuras miden lo de su hoja
(`pasoDeLaHoja`; nunca se aleja, así que a densidad 1,5 casi no se mueve) y se centra en el
edificio con su tope (`encuadrarLaMorada`), el edificio se cambia por su **versión abierta**
(casa de muñecas, sin la pared de delante: `abierta-<id>.webp`, `abiertaDe`; la única
sustitución, `conLaAbierta`; sin ella, su exterior) y delante, en el empedrado
(`filaDeLosReclutas`), una figura por unidad que produce, que se elige con el clic o su botón
del lateral (la ficha y «+1»/«Todo» con el motivo del núcleo escrito, `partida/morada/panel.ts`); quien
anduvo, quieto en la puerta, y la gente, fuera (`componerBase(…, { gente: false })`). Escape o
«Volver a la base» vuelven con la cámara de antes. La gente se pinta con su figura del banco
de NPC (`figurasDeLaGente`) y, sin ninguna de su facción, con el Y Bot sin armas
(`CUERPO_DE_VECINO`). Qué se levanta en cada sitio es del núcleo (`sitiosDeLaBase`);
dónde, del JSON, que **el núcleo no lee**. Contratar no pide taberna. Taller: `encolar --base
templarios` (también `--solo=retoque-<id>`: un primer eslabón pintado otra vez sobre la placa,
que manda en su cuadro si está en disco, `cuadroDe`; y `--solo=abierta-<id>`: la versión abierta
de una morada, su cuadro editado), `recortar-base`, `medir-base`, `vista-base`; las fuentes
(maestros, ediciones, retoques, versiones abiertas, guías con la silueta del adulto como vara de
medir, hojas de identidad y las salas de la vuelta 1 de la morada, `interior-<id>.webp`, que la
versión abierta lleva de referencia) en
`assets/bases/<f>/fuentes/`, fuera del build. Sin placa, un tramo pinta su marcador.

**Los
templarios heredan el arte de los caballeros** (19-10-2026): sus moradas van en los sitios que
ese arte pinta (Pueblo 1, Forja 3, Establos 5 y Monasterio 6; el 2 y el 4, sin edificio) y su
índice está rederivado.

**No muertos, imperio, elfos y orkos, con su arte** (20-10-2026): sin
crudos de la vuelta 1 no hay hoja de identidad, así que cada edificio va descrito en el prompt,
con la villa, la heráldica, el suelo, la junta y la paleta de su facción (`ARTE_DE_LA_BASE`,
`tools/taller/base.ts`). Un sitio sin edificio no se pide (`sitiosPintados`): es plaza, con una
región estrecha en su tramo. Cada tramo necesita alguna puerta, así que la morada 2 de no muertos
y elfos va en el tramo 1. La guía dibuja el recuadro de cada edificio (`huecosPedidos`, como mucho
`ANCHO_MAXIMO_DEL_EDIFICIO`, 520 px), porque con uno o dos por tramo Codex llenaba el tramo. Aun
así pinta la puerta de 190-275 px, y no de los 154-166 que se piden: lo que sale grande se
**encoge sobre la placa**, con la puerta y el pie quietos (`pnpm taller encoger-base <f>`,
`tools/taller/encoger-base.ts`, con los factores en `ARTE_DE_LA_BASE[f].encoger`). Lo que pintó
Codex queda en `fuentes/pintado-t<n>.webp`, y el maestro sale de ahí y de la placa, con su
procedencia. Una morada ofrece cada unidad que produce.
