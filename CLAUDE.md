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
pnpm arena      # /arena/: edita el catálogo del juego (unidades y equipo) y monta peleas
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
  unidad.ts        el formato de una unidad (cuerpo + equipo) y su validación
  catalogo.ts      el catálogo del juego: lo único que lee data/unidades.json
  arena.ts         el montador de la arena: fichas, piezas, montaje, enlace y retoque
  battle/          rejilla de 12 y 11 (board.ts), iniciativa, daño, armas, rueda,
                   contacto, carga, hechizos, poderes, efectos
  map/             mapa, pathfinding (frontera.ts), niebla, generación (generate.ts,
                   vestir.ts) y red de nodos (regiones.ts)
  town/ hero/      castillos, edificios, reclutamiento; héroes, tropa, experiencia, equipo
  state/           GameState, turnos, batallas del mapa, asaltantes
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod, serialización y vocabulario (huecos, golpes) del agente
src/server/        bridge WebSocket + puente MCP (partida.ts, director, entorno.ts)
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  html.ts          LA PUERTA del marcado
  session.ts       LA PUERTA al núcleo
  escenas/ render/ views/   ratón y cámara; lo que se pinta; paneles
  rueda/           la rueda del golpe (diálogo, disco, figuras) de partida, arena y espectador
  espectador/      mira la partida del servidor, no juega (adaptar.ts, paneles.ts)
  arena/           edita el catálogo del juego y monta peleas con sus reglas
src/shared/        contrato visual (cámara a 25°, luz) de cliente y taller
tools/gen/         generación de assets con fal.ai
tools/qa/          verificación de extremo a extremo y medidas
tools/datos/       extrae JSON de NuevaJugabilidad.md con expresiones regulares
tools/arena/ tools/taller/ tools/art/   arena, taller de arte, rig del Y Bot
data/              unidades, equipo, edificios, economía, hechizos, experiencia… en JSON editable
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
  `pintar` conserva el foco de dentro por su identidad (`data-*` e `id` suyos y de sus
  antepasados; un botón pulsado con el ratón, no): nadie repinta con su propio parche.
- **Fail-loud.** Una acción ilegal lanza con un mensaje para la persona. La
  excepción son las acciones del agente: se descartan una a una con su motivo.
  El motivo de un rechazo lo escribe un `*Blocker` del núcleo y lo leen
  `legalActions`, la acción y la pantalla.
- **Una página que no arranca dice por qué** (H5, 19-10-2026): cada página entra por su
  `entrada.ts`, que carga `main.ts` con un `import()` y, si el núcleo lanza al cargarse (una unidad
  rota en `data/unidades.json`), pinta el motivo entero (`arranque.ts`, que no importa el núcleo).
  `vite.config.ts` carga el lado de disco de la arena a demanda, así que `pnpm dev` arranca igual.
  Lo vigila `test/arranque.test.ts`.
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
| Cifras = catálogo + veteranía + equipo | `cifrasDeUnidad` (`core/catalogo.ts`: cuerpo + rango + lo de serie con lo propio encima, un solo `conEquipo`; con el catálogo de la pelea, `CatalogoDeUnidades`, por defecto `CATALOGO_DEL_JUEGO`), `cifrasDelIndividuo` (el personaje), `conEquipo`; el oro de una unidad, `costeDeUnaUnidad` (de la vestida) y `oroDeUnidad`; el cuerpo sin equipo de un stack, `cuerpoDe(stack, cat?)` (del origen: igual en el juego y la arena; el héroe lo lleva en `OrigenDelStack`, `desnudo`); qué unidad es un stack, `origen.unidad` o `queEs` (`battle/types.ts`): `body` es el arte |
| A quién se licencia | `elQueSeIria` (`hero/troop.ts`) |
| Construir un héroe | `heroeRecienHecho` |
| Qué se levanta en cada sitio de la base | `sitiosDeLaBase`, `siguienteDe`, `construidoEn` (`town/sitios.ts`) |
| De un píxel del cuadro de la base al escenario | `planoDelCuadro` (`shared/base.ts`); en pantalla, `colocarLaPlaca` y `colocarEnElCuadro` (`render/base/recortes.ts`) |
| Recortar un edificio de la base de su cuadro | `recortarLaBase`, `derivarRecorte` (`tools/taller/recorte-base.ts`) |
| Escala del tablero de combate (también la de la base) | `escalaDelCombate` (`render/proyeccion.ts`), que leen `tableroPara` y `pasoDeLaBase` |
| Quién hay en una base y qué dice (narrado o de respaldo) | `vecinosDeLaBase`, `vozDe`; las voces del narrador las escribe solo `ponerVoces` (`town/voces.ts`) |
| Nivel de una unidad (índice de poder, con su equipo) | `nivelDeUnidad`, `indiceDePoder`, `nivelDelIndice` (`core/nivel.ts`, `data/poder.json`), de la unidad vestida (`poderBruto`, memorizado por `UnitInfo`); lo que mide lo lee de `battle/armas.ts` (`golpeDe`, `golpesDe`, `porcientoDelTipo`, `disparosDe`, `trasLaArmadura`), y `nivel.ts` no está en un ciclo de importación (lo vigila `invariantes.test.ts`); qué cifras se pueden medir, `medidaBlocker`. Ni el nivel ni el coste se escriben en `data/unidades.json` (lo vigila `invariantes.test.ts`) |
| El catálogo de unidades (el juego y la arena) | `data/unidades.json`, que importa solo `core/catalogo.ts` (lo vigila `invariantes.test.ts`): `UNIDADES`, `unidad`, `unidadDelJuego`, `unidadesDelJuego`, `unidadesDeFaccion`, `unidadesDeMorada`, `hojaDeUnidad` (la hoja con que se pinta, `cuerpo.hoja`); el formato, `validarUnidad` y `validarCatalogo` (`core/unidad.ts`); lo que el juego exige a los dos catálogos juntos (equipo base del héroe, unidades y moradas), `leerCatalogos`, que llaman la carga, «Guardar» y el editor de equipo; la forma de un id, `esIdDeUnidad` (`core/validar.ts`) |
| Moradas: qué producen y qué cuestan | `Unidad.edificio` (la morada que la produce; sin él no se recluta) y `Building.morada` (su sitio en la base, 1-6: no es un nivel); `nivelDeMorada` (el de lo mejor que produce: de él, su coste), `moradasBlocker` (cada `edificio` es una morada de su facción, cada morada produce algo; al cargar y al guardar) (`town/buildings.ts`); una fila por unidad, `dwellings`; el oro y el crecimiento de una unidad, `oroDelIndice`, `crecimientoDelNivel` (`data/economia.json`) |
| El ejército de salida | `startingArmy` (`state/setup.ts`): la primera unidad del pueblo con su tirada y hasta `DE_LA_SEGUNDA` de la segunda, lo que quepa; que la primera quepa siempre y de la segunda al menos uno se comprueba al cargar (`PUEBLO_DE_SALIDA`); las dos facciones de la partida, `faccionesDeLaSemilla` (con su propia corriente: el mapa de cada semilla no se mueve) |
| Reindexar el rango de héroe | `subidasDeRango` (lanza por debajo del 5) |
| Añadir a la mochila | `aLaMochila` |
| A quién va una pieza | `destinoDeEquipo` |
| Lo que admite una mano y dos (un arma a dos manos no admite escudo) | `manosBlocker` (`hero/equipo.ts`, mira solo el arma de cuerpo a cuerpo y el escudo: el arco a la espalda deja llevar escudo; la única lectura de `Pieza.manos`, con `aDosManos` al lado para enseñarla o escribirla); la leen `equipoBlocker` y `equipoDelPortadorBlocker` (`core/catalogo.ts`: las manos y el arma de cuerpo a cuerpo sobre lo que llevaría puesto, `equipoPuestoDe`, lo de serie de su unidad incluido; la preguntan `ponerseBlocker` y `unequipBlocker`), y `ponerPieza` lanza con ella, que es la pregunta de la arena (`equiparEnArena`, con el nombre de quien la lleva; lo vigila `invariantes.test.ts`); dicha para la persona, `REGLA_DEL_ESCUDO` |
| Los huecos en el contrato (`melee_weapon`, `ranged_weapon`, `lance`, `armor`, `shield`) | `SLOT_DE_HUECO`, `huecoDelSlot`, `accionDelAgente` (`contract/vocabulario.ts`; un `Slot` lleva marca y solo lo produce ese módulo; lo que escribe el agente, `AccionDelAgente`); por dentro, `HUECOS` en español (`arma`, `distancia`, `lanza`, `armadura`, `escudo`; lo vigila `invariantes.test.ts`) y el núcleo recibe un `Hueco` (`unequip.slot`): el texto lo traducen `accionDelAgente` y la sesión (`esHueco`). Uno que no existe, `huecoDesconocido`; para la persona, por su nombre (`NOMBRE_DE_HUECO`; quitar de uno vacío, `nadaEnElHueco`) |
| Con qué arma se da cada golpe | `usoDelGolpe` (`battle/damage.ts`: el disparo, `distancia`; el golpe que cobra carga, `lanza`; lo demás, `arma`) y `golpeDe` (`battle/armas.ts`: el arma y las cifras de cada uso, con su respaldo), de la que leen `cifrasDelGolpe`, la previsión y la ficha (`armasDe`, `dichoDelGolpe`); `UnitInfo.armas` lo escribe solo `conEquipo`, con el nombre de cada arma (`GolpeConArma.arma`: la batalla no lleva catálogo; lo vigila `invariantes.test.ts`). El uso es el hueco (`UsoDeArma`; ¿es de arma por uso?, `esArmaPorUso`); qué cifras admite cada hueco y si lleva rueda, `camposDelHueco` (`arma` y `lanza`: ataque, daño, rueda y, solo `arma`, manos; `distancia`: ataque y daño; `armadura`: defensa, armadura y velocidad; `escudo`: defensa y velocidad); cómo se dice cada uso, `DICHO_DEL_USO` |
| Quién dispara | `isShooter` (`data.ts`: algo en `distancia`; no hay munición: llevarla ya es disparar); cuántos tiros da un disparo, `disparosDe` (`battle/armas.ts`: uno, dos con `double_shot`; la única cuenta, lo vigila `invariantes.test.ts`) |
| Lo de antes | no se lee (14-10-2026: sin compatibilidad hacia atrás): una unidad o pieza de otro formato no vale (`validarUnidad`, `validarPieza`); un `?montaje=` de otra versión se rechaza (`montajeDeLaURL`, `VERSION_DEL_ENLACE`), y `?reglas=`, `?golpe=` y `?contacto=` también (`PARAMETROS_RETIRADOS`, `retiradosDeLaURL`) |
| La regla de una pieza | `problemasDePieza`, `piezaBlocker` (`data.ts`), con los campos que existen (`CAMPOS_DE_PIEZA`: un `pv` o una calidad no valen): el precio, un entero de oro (`Pieza.precio`); de dónde se consigue, `seConsigue` (`armeria`, `botin` o nada: solo en kits; `DONDE_SE_CONSIGUE`, dicho con `DICHO_DE_DONDE`, `SOLO_EN_KITS` y `deDondeSale`); solo las cifras de su hueco (`camposDelHueco`), el tope de armadura (`ARMADURA_MAXIMA_DE_PIEZA`) y la rueda completa del arma que golpea en ella (`golpeaEnLaRueda`, `problemasDeNiveles`). El catálogo entero se hace en un sitio, `leerPiezas` (cada pieza, sin repetir, con sus bases y alguna de botín, todos los problemas a la vez), que leen `leerEquipo` (el fichero) y `catalogoDeEquipo` (`hero/equipo.ts`: el `CatalogoDeEquipo` atado; el del juego, `EQUIPO_DEL_JUEGO`); un fallo en `data/equipo.json` tumba la carga nombrando el fichero |
| El editor de piezas (arena) | `conPiezas` (la única superposición de piezas sobre un catálogo: cambiar una, abrir un enlace), `cambioDePiezas` (el catálogo nuevo, hecho una vez, o el motivo: nadie de los catálogos deja de valer, dos piezas no se llaman igual, el equipo base del héroe; un retoque a media pelea, `retocarEnBatalla` con `kind: 'piezas'`, pregunta `equipoQueNoVale`), `enElHueco` (lo que exige el hueco, y lo que exigía el escudo se va con él), `piezaNueva` (en blanco o copia; ni id ni nombre de otra) y `piezaSobre` (sobre otra, extras a 0), `idsLlevados`/`piezasDelMontaje` (`core/arena.ts`). Las lecturas de una pieza atadas a un catálogo, `equipoCon` (`hero/equipo.ts`): la arena no importa las sueltas (`pieza`, `piezasPuestas`, `sumaDeEquipo`, `conEquipo`, `manosBlocker`, `equipoBlocker`, `ponerPieza`, `heroUnit`), que leen las del juego; al héroe lo viste con `cuerpoDelHeroe`. La batalla no lleva catálogo de piezas: quien cambia una a media pelea le da el suyo; el equipo puesto de cada stack, en `UnitInfo.equipo` (lo escribe `conEquipo` y viaja al espectador). Lo vigila `invariantes.test.ts`, por importación |
| Sumar una base (18-10-2026) | `resolverBases` (`data.ts`, privada), la única suma, que llama solo `leerPiezas`; la pieza escrita (`PiezaEscrita` = `Pieza \| PiezaConBase`: id, nombre, base, extras con signo y su propio `seConsigue`) va por las fronteras y la resuelta es la que pelea; los extras, una tabla (`FORMA_DE_LOS_EXTRAS`) con la suma y su inversa juntas (`sumarBase`, `diferenciaDe`, en `data.ts`); qué base vale, `baseBlocker` (existe, de su hueco, no da la vuelta), que leen la resolución, `conBase` (cambia de base conservando las cifras finales), `basesPosibles` y `piezaSobre`; la escrita y la base de una pieza, `escritaDe`, `baseDe`, `cadenaDeBases` (`core/arena.ts`, como `conBase`, `basesPosibles` y `piezaSobre`). Hueco y manos son los de la base; el precio, el de la base más el oro de los extras. Lo vigila `invariantes.test.ts` (nadie suma una base ni lee `.extras` fuera de su sitio) |
| El equipo de una unidad | `equipoDeUnidadBlocker(cuerpo, equipo, eq)` (`core/unidad.ts`: piezas y manos, un arma de cuerpo a cuerpo, `armaDeCuerpoBlocker`, y que el índice la mida), que leen `validarUnidad`, `opcionesDelHueco` (lo que se rechazaría va desactivado con su motivo), `quitarBlocker` (el arma no lleva ×) y `equipoQueNoVale`; el del héroe, `EQUIPO_BASE` (`data/heroe.json`, comprobado con `equipoBaseBlocker`), y quién lleva una pieza además de las unidades, `laLlevaElHeroe`. En la partida, la tropa lleva lo de serie de su unidad con lo suyo encima, hueco a hueco (`equipoPuesto`, `equipoPuestoDe`): lo de serie no se quita ni va a la mochila |
| Unidad nueva de la arena | `unidadNueva` (`core/arena.ts`); cuerpo + equipo con que pelea, `unidadDeCombate` (`core/unidad.ts`) |
| Qué es un árbol (la regla «árbol = no se pasa») | `esArbol`: las hojas de `ARBOLES` y los módulos de `ARBOLES_DE_LA_CUBIERTA` (`render/escenario/colocar.ts`) |
| Lo que la copa de la masa no tapa de lo que se pisa | `topeDeLoPisable` (`altoPorLosLados`, `altoSobreLosPasillos` con `pasillosEstrechos`); el contador, `sobreLoPisable` |
| Los módulos de la cubierta que no van en lo que se pisa (los peñascos grises de la nieve) | `FUERA_DE_LO_QUE_SE_PISA`, que lee `modulosDe(hoja, true)`; los pide la `mata` de lo que se pisa (`sePisa`) |
| Formatear un precio | `describirCoste`; un entero con miles («176 000»), `conMiles` |
| Camino de un héroe (con lo hostil) | `alcanceDelHeroe`, `caminoHasta`; nadie fuera de `game.ts` llama a `findPath`/`reachableFrom` |
| Territorio y renta | `territorio(state)`, `dueñoComun` |
| Validar un plan de mapa (agente y procedimental) | `validateMapPlan` → `problemasDeRed` |
| Qué barrera cruza un nodo | `MapObject.barrera`, que pone `buildMap` con el muro que abre; el procedimental escribe ese muro con `queCruzaElNodo` |
| El río del procedimental (antes que las regiones; nadie lo corta) | `trazarRio`, `regionesDelRio`, `nivelesDelRio`, `rioEntero`, `rioBajoLaCiudad`, `orillaDeLaCiudad` (`core/map/rio.ts`); la ciudad-puente en la escena, `puenteDeLaCiudad`, `ciudadEnLaOrilla` (`puentes.ts`) y `sitioDe` (`colocar.ts`); la única escritura de la rejilla del vestido, `ponerTipo` (`vestir.ts`, que lanza si se toca el río; lo vigila `invariantes.test.ts`); medido sobre el mapa, `riosDelMapa` (`tools/qa/rios.ts`) |
| Qué línea deja dos regiones a dos pasos (el acantilado entre dos niveles; el agua a ras de la más baja, que se ve) | `lineasQueSeparan`, `separadasDeCerca`, `aguaALaVista` (`vestir.ts`): el paso 7d y todo lo que abre una barrera (`abrirLinea`, `quitarEspigas`, `puertasSinMuesca`, `abrirEsquinasTorcidas`); el agua entre dos niveles, solo el 7d (`aguaEntreNiveles`); en el mapa hecho, `auditarMapaDenso` (`test/helpers.ts`) |
| Caminos de un plan al mapa | `caminosDelPlan` |
| Carga: cuándo, quién y cuánto | cuándo, `cargaDesde` (la recta: con el objetivo en ella, libre y que quepa lo que cuesta salir del contacto; lo de muchas preguntas, `medirCargas`, con la carrera que se anda, `CargaMedida.carrera`); quién y cuánto, `cifrasDeCarga(unit)` (`battle/carga.ts`, cifras en `data/carga.json`: con el rasgo `charge`, la del jinete; sin él, a pie; nunca `null`); el tope, `cargaEfectiva`; la del índice, `porcientoDeLaCarga`; lo que se enseña, `casillasDeCarga` (con `CasillaDeCarga.porciento`); las frases, `dichoDeLaCarga` (la carga cobrada: parte y previsión) y `dichoDeLasCifras` (la ficha); la recta mínima, `CARGA_MINIMA` (de `carga.ts`). La carga la cobra solo el primer golpe (`intercambio`) |
| Turno de batalla | `BattleState.turno` (`n`, ordinal); `mismoTurno`; viaja como `turnId` |
| Tope de jugadas | `MAX_JUGADAS` |
| Montar una batalla (un solo combate, 19-10-2026) | `createBattle(atacante, defensor, rng, muralla?)`, la única puerta, también la de la arena (`batallaDeArena`): sin interruptores ni ramas de fheroes2. Lo vigilan dos guardias de `invariantes.test.ts`: «una puerta para montar batallas» (el estado entero lo escribe solo `createBattle`, y `core/arena.ts` lo importan solo la arena, la sesión y `capturas`) y «nadie escribe fheroes2» (ni el literal ni los nombres retirados) |
| La rueda del golpe | `battle/rueda.ts`: `puntoDelCruce`, `tiradaDelPunto`, `cruceBlocker`, `efectoDeLaRueda` (cuándo vence, `CuandoVence`, dicho con `duracion`), `contraataqueDelCruce` (el punto va en el `attack` devuelto); cuántos golpes, `golpesDe` (`battle/armas.ts`, la única cuenta de `melee` y la previsión); al daño, en números (`DamageOptions.cruce`: `damage.ts` no importa `rueda.ts`), solo por `cruceDelGolpe` desde `opcionesDeDanio`; la previsión, `previsionDeLaRueda`. **El paso del cruce es del núcleo**: plantar a quien pega, `plantarse` (junto a `soltarElGolpe`, `battle.ts`), y `pasoDelCruce` (`ai/rueda.ts`: la jugada lista o lo que falta, ya plantado), con `completarCruce(…, LaIAElige)` y el único sorteo, `elegirEnLaRueda`; lo conducen solo `CruceDeLaRueda` (las dos sesiones del cliente) y el director (`conLaRueda`, `server/director.ts`), lo vigila `invariantes.test.ts`. El golpe plantado que espera la rueda, `BattleState.golpeEnCurso` (con la carrera y el coste barato: soltarlo devuelve lo gastado al barato; lo pone el `attack` sin elecciones y lo quitan el golpe y `soltarElGolpe`; lo que no vale con él, `golpeEnCursoBlocker`); el tramo de andar tras la Finta, `TurnoDeUnidad.finta` (lo pone solo `melee`, lo vigila `invariantes.test.ts`). **La rueda con el arma, por niveles** (18-10-2026; absolutos desde la vuelta 2): la tabla de lo que da cada nivel (0 a 6, `NIVEL_MAXIMO`) de cada tipo del anillo (`TIPOS_DEL_ANILLO`; Normal no tiene nivel), `TABLA`, privada de `battle/cifras-de-la-rueda.ts` (sin dependencias del núcleo, para que `problemasDePieza` juzgue la rueda de una pieza con `problemasDeNiveles`), y su única lectura, `cifrasDeLosNiveles` (Romper guardia y la Finta, por éxito y en enteros; memorizada por objeto de niveles), que llaman solo `ruedaDelGolpe` (`battle/armas.ts`) y `filasDeLaRueda` (lo vigila `invariantes.test.ts`); los niveles del arma, `Pieza.rueda` (`NivelesDeLaRueda`, los seis, también los 0), que `conEquipo` copia a `GolpeConArma.rueda`; las cifras de un golpe, `ruedaDelGolpe(unit, uso)`, que lanza sin arma; Fuerte y Rápido con el arma de cada golpe (`conElGolpe`), lo demás con la del primero del intercambio (`ruedaDelIntercambio`); cuántos golpes da Rápido, `GOLPES_DEL_RAPIDO`; un arma nueva, con la de la Espada (`nivelesDeLaEspada`, `core/unidad.ts`, leída de `data/equipo.json`); los pesos de la IA, aparte (`PESOS_DE_LA_RUEDA`). **Sin arma no se combate**: una unidad sin un arma de cuerpo a cuerpo que golpee en la rueda no vale (`armaDeCuerpoBlocker` con `golpeaEnLaRueda`, en `equipoDeUnidadBlocker`), el héroe nace con la Espada (`EQUIPO_BASE`, `ESPADA`) y el arma no se quita (`unequipBlocker`). Las fases del turno (`libre`, `movido`, `plantado`, `trasLaFinta`), `faseDelTurno`, y lo que no vale en cada una, `faseBlocker` (lo leen `applyAction`, la lista legal y el principio de cada `*Blocker`); la firma del turno (con la Finta), `firmaDelTurno`, que leen `Movibles` y la clave de la sesión |
| Los golpes y los poderes en el contrato (19-10-2026) | `HIT_DE_GOLPE` (`offensive`, `strong`, `feint`, `defensive`, `quick`, `guard_break`, `normal`), `HITS`, `golpeDelHit` (lanza diciendo cuáles valen), `accionDeBatallaDelAgente` (lo que manda el agente: `attack.hit` → el golpe, `power` → el poder), `accionAlAgente` (la lista legal al revés) y `hechoAlAgente` (el `cruce` del registro con `hit` y `response`), en `contract/vocabulario.ts` con los huecos; la petición de respuesta, `serializeBattleResponse` (recibe solo los dos ids: no puede contar el golpe del otro; lo vigila `invariantes.test.ts`, «el agente elige en la rueda») |
| Quién lleva cada bando | `Player.controller` (`human`, `agent` o `ai`); la batalla que nace en el turno de la IA la toma el controlador de su dueño (`quienLaToma`, con lo que pasa `ConduccionDelTurno.batallas`: la persona, sus defensas; el agente, `BattleTakeover`), y quién no se rinde lo dice `sinLaIA` |
| Por qué acabó una batalla (arena) | `causaDelFinal` (`battle.ts`, con `bandoVencido`) → `finalDeArena` |
| Enlace de una pelea de la arena | `montajeALaURL` / `montajeDeLaURL` (`?montaje=`, con `?seed=`); un parámetro repetido, `unaVezEnLaURL`; uno retirado, `retiradosDeLaURL` |
| Forma del tablero de batalla (qué casillas existen, su espejo, la frase del contrato) | `board.ts`: `isInside`, `allHexes` (la lista congelada; su posición es `indiceDe`), `filasDelTablero`, `espejo`, `desplazamientoDeFila`, `EXTENSION_HORIZONTAL`, `ULTIMA_FILA`, `codigoDeLado`, `FORMA_DEL_TABLERO`, `tableroDelContrato`; fuera de `board.ts` nadie importa `anchoDeFila`, `ANCHO_DE_FILA_*` ni `BOARD_HEIGHT` (lo vigila `invariantes.test.ts`, por importación) |
| Muros, puertas, niveles y tiro tapado de la batalla | `battle/muralla.ts` (`pasoPermitido`, `hayLinea`, `bonoEnLoAlto`, `validarMuralla`); al montarla, `createBattle(…, muralla)` (solo la arena: las batallas del mapa, `SIN_MURALLA`) |
| Previsión de daño (barra de la partida y de la arena) | `previsionDe` → `horquillaDeDanio`, `trasElGolpe`; opciones del golpe, `opcionesDeDanio` |
| Desenlace y causa del final (barra, crónica y nota del agente) | `finDePartida`, `desenlaceDe` (`state/desenlace.ts`) |
| Ventaja para atacar/emboscar | `ventajaClara` (`ai/fuerza.ts`) |
| Lo que se anda hoy (marcha y ruta) | `pasosDeHoy` (`state/game.ts`) |
| Qué héroe se ve y qué se sabe de un objeto (agente, lienzo, minimapa, barra) | `heroesALaVista` (lo mirado ahora), `objetosConocidos` (vivo si se mira, si no el recuerdo de `memory`); el cliente, por `Session` |
| Qué grupo de asaltantes se ve | `asaltantesALaVista` (lista con la marca `AsaltantesALaVista`; sin niebla, `todosALaVista`); para un grupo suelto, `grupoALaVistaDesde` |
| Por dónde se entra en una ciudad, una mina o un pueblo | `puertasDe`, `rodeosParaEntrar` (`map/puertas.ts`, #230) |
| Por qué una marcha no llegó (veredicto del agente) | `paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`) |
| Material de una cara (pared, ladera, pedregal) | `materialDeCara` (`render/escenario/colocar.ts`) |
| Roca de lo alto de un acantilado (picos, peñascos, reborde) | `materialDeLaCima` (`render/escenario/bordes.ts`) |
| Suelo de la meseta de una barrera (roca de pared, cima y macizo, y el suelo que se pinta) | `sueloDeLaMeseta` (`render/escenario/bordes.ts`); en la escena, `sueloQueSePinta` |
| Qué barreras admiten los niveles de dos regiones | `admiteLosNiveles` (`terrain.ts`), que leen `barrerasDeLaPareja`, `candidatasSinMuro` y `problemasDeNiveles` |
| Franja de barrera (8-conexa, con las regiones que toca) | `franjasDeBarrera` (`regiones.ts`), que leen `relieve` y `problemasDeNiveles` |
| Nivel de cada casilla de la escena | `nivelesDelRelieve` (`core`, de `MapRegion.nivel`; nada lo inventa), que aplican `relieve` y el generador (`quitarEspigas`) |
| Qué muro se queda: la muralla, el cierre de un paso (generador, guardia y medida) | `lineaDeLaPuerta`, `muroDeLaLinea`, `murallasDeLaRejilla` / `murallasDelMapa`, `juntoACiudad` (`core/map/murallas.ts`) |
| Muralla de una franja de muro (línea, torres, guardia) | `trazaDeMuralla`, `torresDe`, `murallaSinLeer` (`muralla.ts`); torres apiladas, `seApilan`; lo de alrededor, `alrededorDeMurallas`; en la escena, `meterEnLaMuralla` |
| Lanzar sobre un objetivo (hechizo del héroe y poder de una unidad) | `Lanzador` (`delHeroe`, el del poder), `efectoDe`, `curaDe` (`battle/spells.ts`); en la batalla, `lanzarSobre`; el objetivo, `objetivoBlocker` |
| Poderes activos de unidad (el juego desde el 19-10-2026) | `poderBlocker` (`battle.ts`), cifras en `data/poderes.json` (inventadas); la lista, `PODERES`, y lo que hace cada uno, `queHaceElPoder` (`battle/poderes.ts`: el botón, la ficha y la prosa del agente); `UnitInfo.poderes` lo pone solo `unidadDeCombate` (`core/unidad.ts`, de sus habilidades; lo vigila `invariantes.test.ts`); en el cliente, `PoderesDeLaActiva` (las dos sesiones, con `LoApuntado`: lo apuntado es uno, hechizo o poder) y `botonesDePoder`/`botonDeElegir` (`views/poderes.ts`); el agente, la jugada `power` |
| Cambiar cifras a media pelea (arena) | `retocarEnBatalla(state, r, catalogo)` (`core/arena.ts`, con el catálogo de la pelea, `catalogoDeLaPelea`; lo gastado se conserva con `gastadoDeMas`); el tipo de un stack, `tipoDelStack`; el parte, el evento `retoque` |
| Salir del contacto | `battle/contacto.ts`: lo que cuesta salir con N al lado, `salirCuesta`, y la frase de quien no sale (`fraseDelContacto`, que nombra la Finta si fue ella); en `battle.ts`, cuántos hay en contacto, `enContactoEn` (la única cuenta, por `canReachMelee`, a distancia 1), lo que cuesta salir de cada casilla en un recorrido (`costesDelPaso`: el volador, solo al despegar), por qué no sale (`contactoBlocker`, que leen `movimientoBlocker` y el panel) y el recorrido (`recorrer`, que leen `movableFrom` y `porElLado`; sin enemigo cerca, la búsqueda de siempre); la búsqueda con costes, `alcanceConCostes` (`board.ts`, igual que `reachable` con coste 1, con `CosteDeSalir`), y la carrera de la carga por la recta, `carreraConCostes` (desde `medirCargas`) |
| Armadura (#262) | la resta, `trasLaArmadura` (`battle/armas.ts`; la llama `herir`, así que todo lo que quita vida la paga; la leen también la previsión, el índice y `expectedDamage`); la lectura, `armaduraDe` (`UnitInfo.puntosDeArmadura` lo escribe solo `conEquipo` y lo leen él y `battle/armas.ts`; lo vigila `invariantes.test.ts`); qué pieza la lleva, la de su hueco (`camposDelHueco`), y ninguna da PV (`problemasDePieza`); lo que paró, `parado` de punta a punta (`Herida`, `TrasLaArmadura`, el evento y el lienzo) |
| Dónde responde cada sector de la rueda y dónde va lo suyo | `formas` (un `<clipPath>` por tipo con la forma de `sector`, la que pinta el disco) y `ajustarLaRueda`, que recorta a ella cada botón, del tamaño del plato (#258); el rótulo y el «ⓘ», por el ángulo del sector, `sitioEnLaRueda`, y hacia dónde abre su nota, `haciaDe` (`client/rueda/rueda.ts`): nada se coloca por tipo |
| Los dos que se cruzan en la rueda | `contrincante` (`rueda/rueda.ts`), con su figura (`figuraDelContrincante`, `FigurasDeLaRueda`, `rueda/figuras.ts`, que anima `DialogoDeLaRueda`) y quién mira, de la sesión (`SesionConRueda.quienMira`: con uno, «Tu golpe», «Tu respuesta», «(tú)» y «(rival)»; el espectador, nadie); lo que cada página pone alrededor, `CaraDeLosContrincantes` (la arena, `caraDeLaArena`: el botón de su ficha de solo lectura, `abrirEditor(…, true)` en `arena/main.ts`, y su vista previa, `vistaPrevia` y `filasDelStack`, las mismas filas del panel de la activa, con `efectoEnCurso` de `views/panels.ts`); en el tablero, `EscenaBatalla.enLaRueda` → `VistaBatalla.enLaRueda` (#261; el espectador, de `BattleAnimator.losDelCruce`) |

`test/invariantes.test.ts` vigila las fronteras de esta sección. Todos nacen en
verde.

## Reglas del juego

Verificadas contra fheroes2 salvo donde dice «regla nuestra».

| Dato | Valor |
|---|---|
| Rejilla de batalla | **regla nuestra** (fheroes2: 11 × 9 = 99): 9 filas, las pares de 12 y las impares de 11 = 104 hexes, offset odd-r, simétrica de izquierda a derecha (`FORMA_DEL_TABLERO`, `espejo`; el índice es compacto, la posición en `allHexes`). El defensor sale en el espejo del atacante y el tiro pasa si pasa con el empujón (`+3, −1, −2`) o con su espejo (`lineaLibre`): generoso, en todo empate de borde un rayo va por cada casilla; una casilla fuera del tablero tapa su rayo (nunca se tira por el marco a través de un muro) |
| Tropa | individuos, uno por hex, acotados por el liderazgo (`data/liderazgo.json`, provisional) |
| Recursos | madera, mercurio, mineral, azufre, cristal, gemas, oro |
| Movimiento diario | lo marca la unidad más lenta; se fija al empezar el día. **Regla nuestra** (#226): la tabla de fheroes2 (1000-1500) ×√(`AREA_POR_REGION` / `AREA_DE_REFERENCIA`) = ×√1,5 → 1224-1837 (`marchaALaEscala`, `core/escala.ts`) |
| Radio de vista | héroe 4 y castillo 5 en fheroes2 (`getFogDiscoveryDistance`); **regla nuestra** (#229): ×√1,5 al entero más cercano, 5 y 6 (`radioALaEscala`, `core/escala.ts`). El cuadrado, no el disco del original |
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
| Carga a pie | **regla nuestra** (#260, 14-10-2026; en toda batalla desde el 19-10-2026): todo el que pega cuerpo a cuerpo sin `charge` (también el tirador y el héroe) carga con la misma recta, +5 %/casilla, tope 5 (inventado, `data/carga.json`); el jinete sigue a +10 %. La IA no busca la recta a pie: en 100 peleas de la IA contra la IA (`tools/qa/arena-ia.ts`, «mezcla», 19-10-2026), 30 cargas a pie y 74 de jinete |
| `fear` (rasgo del motor; hoy no lo lleva ninguna unidad del catálogo) | **divergencia deliberada**: ataque −2 durante 2 rondas (no aura de moral) |
| Victoria | **regla nuestra**: perder la base elimina en el acto |
| Rueda del golpe | **regla nuestra** (13-10-2026; en toda batalla y sin interruptor desde el 19-10-2026): al golpear cuerpo a cuerpo, quien pega y quien recibe eligen a ciegas un tipo en un anillo (desde arriba y en el sentido del reloj ofensivo, fuerte, finta, defensivo, rápido, r.guardia: opuestos ofensivo y defensivo, fuerte y rápido, finta y r.guardia; Normal en el centro; #263, 14-10-2026): la persona en el diálogo de la rueda, el agente por su contrato (`hit`, `battle_response`) y la IA de reglas a ciegas. El cruce fija la tirada (`min + ⌊(max − min) · p / 4⌋`, por la distancia en el anillo: 0, 1, 3, 4; con Normal, 2) y la respuesta es el contraataque, en `4 − p`. Fuerte (daño ×) y Rápido (2 golpes de daño ×), también en el contraataque; Normal, siempre ×1; lo demás actúa solo al golpear (**la respuesta no da bonificadores**, `cruceDelGolpe(…, papel)`): Ofensivo suma ataque en ese golpe; Defensivo suma defensa desde ya hasta que **empiece** su próximo turno (también el extra de la moral alta y el que la moral baja le quita); Romper guardia quita ataque al atacado según el éxito del golpe (`p`), ya en su contraataque y hasta que **termine** su próximo turno; Finta deja andar tras golpear lo que le quede menos lo que reste su éxito (`TurnoDeUnidad.finta`, en `pasosQueQuedan`; solo andar o terminar, `faseBlocker`; andar cierra el turno, y con 0 se cierra solo; ese tramo paga el contacto como cualquier otro, y su nota lo dice). Rápido: cada golpe resta la armadura, y su nota dice que contra armadura pierde; con carga, **solo el primer golpe la cobra** (también el del doble golpe; 14-10-2026). Caducidad en `StackEffect.hasta` (`empezar`/`terminar`, tope de 2 rondas); el mismo origen refresca. **Las cifras son las del nivel del arma** (18-10-2026; niveles absolutos en la vuelta 2, «para que sea más fácil ver la diferencia entre armas»): toda arma de cuerpo a cuerpo (`arma`, `lanza`) lleva un nivel de 0 (lo peor) a 6 (lo mejor) en cada tipo del anillo (`Pieza.rueda`), el mismo en toda arma; del 0 al 6, Ofensivo +0 a +6 ataque, Fuerte ×1 a ×2, Defensivo +0 a +6 defensa, Rápido 2 × 0,25 a 2 × 1, Romper guardia quita con el éxito máximo de 0 a 6 (con éxito `p`, `⌊q · p / 4⌋`: con menos éxito, menos) y la Finta resta con el éxito mínimo de 8 a 2 casillas, y cada punto de éxito una menos, sin bajar de 0 (con éxito `p`, `max(0, m − p)`; 18-10-2026: con la anterior, de 10 a 5 con la Espada, una unidad de 2 a 5 casillas no andaba nunca). Cada golpe con su arma (la lanza en el primero de una carga), el contraataque con la del que responde, y lo que no es daño con la del primer golpe. La Espada, todo a 3 (la versátil; con ella, Ofensivo +3, Fuerte ×1,5, Rápido 2 × 0,63, Romper guardia 0 a −3 y la Finta de 5 a 1); la Maza, Fuerte y Romper guardia 5, Rápido y Finta 1. Sin arma no se golpea: toda unidad del catálogo lleva una, el héroe nace con la Espada y el arma de cuerpo a cuerpo no se quita (`unequipBlocker`, 19-10-2026). Cifras inventadas en `data/rueda.json` y `data/equipo.json`; el disparo, con su tirada |
| Armadura | **regla nuestra** (#262, 14-10-2026; en el juego desde el 19-10-2026): las piezas de armadura dan puntos de armadura y ninguna pieza da PV (la brigantina 7, el arnés 10, el gambesón 4, el jubón 2 y la barda 22, inventados en `data/equipo.json`); cada golpe, disparo, hechizo o poder que llega se queda en `max(0, daño − armadura)`, restado lo último (tras ataque y defensa, multiplicadores, cruce, carga, suerte y redondeo), uno a uno (cada golpe de Rápido o del doble golpe, cada tiro, cada salpicado con la suya). El drenaje, la experiencia y el parte leen lo que llegó. Un golpe en 0 se pinta «parado». Con la barda, en 100 peleas de la IA contra la IA (`tools/qa/arena-ia.ts`, 19-10-2026): 2 de 100 de 3 contra 3 sin terminar (s13, s43; 0 sin ella) y un jinete contra tres flojos gana 92 de 100 (0 sin ella, 76 con los 220 PV de antes). En el juego no hay barda que lo provoque: 0 sin terminar en el barrido y el banco |
| Orden de turnos | **regla nuestra** (fheroes2 lo tiene fijo): en serpiente, quien cierra un día abre el siguiente (día 1 j0, j1; día 2 j1, j0…; `ordenDelDia`, que leen el paso de turno y el `you.turnOrder` del agente). Con el fijo, j0 ganaba 603 de 1 000 y abrir el día valía +65; en serpiente, 534 y +2 (09-10-2026); con las fronteras onduladas de #229, 524 de 1 000 y duración 8 / 14 / 29 |
| Salir del contacto | **regla nuestra** (#259, 14-10-2026; en toda batalla desde el 19-10-2026): salir de una casilla cuesta 1 + los enemigos que podrían golpear cuerpo a cuerpo a quien está en ella (`canReachMelee`: el de lo alto del muro de al lado no cuenta; el del otro lado de una puerta cerrada, sí). Se paga al dejarla; el camino es el más barato; la velocidad es un presupuesto (`pasosQueQuedan`, `turno.gastado`). Si no le llega para salir de su casilla, no se mueve (golpea, defiende o espera). El volador paga al despegar y no lo que sobrevuela. La carga cuenta casillas y se paga por la recta, que es lo que anda; si no cabe, no carga. Subir y poner escalera no lo pagan |
| Facciones | **regla nuestra** (19-10-2026, decisión del usuario): templarios, no muertos, imperio, elfos y orkos (`FACTION_IDS`), las cinco de la arena; cada partida sortea dos distintas (`faccionesDeLaSemilla`). Sus moradas y quién produce cada una son las del cuaderno (`NuevaJugabilidad.md` §Ciudades; lo que faltaba, inventado y dicho en el `_comment` de `data/buildings.json`), varias unidades por morada; los tipos de héroe se extraen del cuaderno (`tools/datos/tipos-de-heroe.ts`). Caballeros y nigromantes se retiraron con `data/creatures.json` (lo vigila `invariantes.test.ts`: ni `knight` ni `necromancer` en `src/`, `data/` ni `tools/`) |

- Lo temporal vive en `BattleStack.effects` y se suma al leer, nunca al stack.
- **Economía**: costes de la villa de `buildinginfo.cpp` y renta de `ProfitConditions`,
  copiados de la fuente. **Lo de las unidades se deriva de su índice** (inventado y provisional,
  19-10-2026, `data/economia.json`): una unidad cuesta índice² / 500 de oro, redondeado a la
  decena (`oroDelIndice`, `costeDeUnaUnidad`), y crece por semana según su nivel, 12 / 8 / 5 / 4 /
  3 / 2 (`crecimientoDelNivel`: una morada que produce varias suelta el de cada una); una morada
  cuesta según el nivel de lo mejor que produce (`nivelDeMorada`, con la tabla de las seis moradas
  del caballero de fheroes2) y no tiene mejora. No se ajustan cifras a ojo: se inventa solo lo
  declarado como inventado.
- **Un solo nivel, derivado de las cifras con el equipo puesto (regla nuestra, 12-10-2026; con el
  equipo desde el 18-10-2026, «el nivel ve el equipo»)**: el nivel de toda unidad —del catálogo,
  veterana, héroe o personaje— es la primera cifra de su **índice de poder** (`indiceDePoder`, 340
  = nivel 3), en enteros, de la unidad **vestida** (`raizEntera` de ofensa × aguante, por lo que
  corre: cada arma por su uso, la rueda, la carga y la armadura contra un golpe de referencia
  inventado; la fórmula, en el `_comment` de `data/poder.json`; umbral del nivel 2 en 940 y ×2 cada
  nivel).
  Nadie lo escribe, ni el coste: el catálogo guarda la morada (`Unidad.edificio`) y el contrato la
  manda como `dwelling`. Las 34 del catálogo van del nivel 2 al 4 (220-499; `TABLA_DEL_CATALOGO`,
  `test/nivel.test.ts`, 18-10-2026): el edificio no implica nivel y la escala no se recalibra
  (decisión del usuario del 19-10-2026: «no te preocupes por el valor de las unidades, lo iremos
  refinando»). Un héroe recién hecho (2/2) es del nivel 3 desnudo (363) y del 4 con la Espada
  (419). **PV y daño van ×10** (`ESCALA_DE_CIFRAS`, `core/escala.ts`: catálogo, equipo, héroe,
  hechizos de PV, la cura de los poderes y el personaje); ataque, defensa y la fórmula de daño no
  cambian. La fuerza de la IA es `poderBruto`² / `DIVISOR_DEL_PODER` (`unitPower`: ve armadura,
  armas por uso, rueda y carga, #129, #250; el divisor es la mediana medida sobre las 21 criaturas
  de fheroes2 antes de retirarlas, para no recalibrar `fuerzaMax` ni `MARGEN_CONTRA_NEUTRALES`), el
  maná vale 4 × escala y `valorDePieza` es lo que sube el índice del cuerpo de referencia al
  ponérsela.
- **Experiencia (regla nuestra)**: quien quita PV cobra `PV quitados × índice de poder
  del que los recibe` (`indiceDePoder`, con su equipo: el nivel en centésimas), gane o
  pierda; en enteros, con los umbrales en esa escala en vez de dividir entre 100. La
  experiencia da **rangos**: tabla en `data/experiencia.json` (Fibonacci, base 9 000, calibrada
  para 0,25 rangos 5 por partida con las cinco facciones, 19-10-2026; era 16 000).
  La tropa va del rango 1 al 5; todo héroe empieza en el 5 y sube sin tope. Cada
  rango suma cifras (`porRango`; al héroe, cuerpo y liderazgo), y su nivel sube solo
  si ellas lo suben. La experiencia vive en el individuo (`Troop.veterania`); el rango se
  deriva. Medido en 1-100 (19-10-2026, `tools/qa/veterania.ts`): rangos 2/3/4/5 por partida
  7,71 / 3,64 / 1,16 / 0,25, subidas de héroe 4,23, 0 sin terminar (lo de antes y por qué no
  `× nivel`, en `docs/historia.md`).
- **La tropa se hace héroe** (solo con agente): un veterano de rango 5 en su base
  dispara `hero_from_troop` al empezar el turno del agente
  (`ascensoBlocker`, `ascenderVeterano`).
- **Las voces de la base** (solo con agente): `town_voices` pide, antes del turno y en una
  sola petición, las líneas de la gente de las bases caducadas (semana nueva o un sitio
  levantado por primera vez, `firmaDeVoces`). Cada voz y cada línea se juzga sola
  (`ponerVoces`); sin agente, respaldo determinista de `data/vecinos.json` con su propio
  `createRng`. Es presentación: `Town.voces` no escribe en la crónica y el banco no lo ve.
- **Equipo (inventado; un solo catálogo desde el 18-10-2026)**: cinco huecos con el nombre de su
  uso —`arma` (cuerpo a cuerpo), `distancia` (con lo que se dispara), `lanza` (la carga), `armadura`
  y `escudo` (`HUECOS`)—, por individuo y por héroe, y una sola clase de piezas
  (`data/equipo.json`, que edita la arena): ni calidades, ni accesorio, ni PV. Una pieza suma
  ataque, defensa, daño (`danio`) y armadura, y su velocidad puede restar (la de un escudo,
  siempre); `conEquipo` es la única suma, y el nivel la ve. **Un arma a dos manos (`manos: 2`) no
  admite escudo** (`manosBlocker`, 12-10-2026). Cada pieza cuesta un número de oro y dice de dónde
  sale (`seConsigue`; precios inventados): la armería vende las que no van sobre otra salvo la maza
  y el pavés; el botín de asaltantes y ciudades neutrales (con su propia corriente de azar) da las
  que van sobre otra, la maza y el pavés; las que no salen de ningún sitio van solo en los kits de
  las unidades. Todo héroe nace con la Espada y el gambesón (`equipoBase`, `data/heroe.json`); la
  tropa lleva el equipo de serie de su unidad (`data/unidades.json`) y lo que se le ponga encima,
  hueco a hueco. **Cada arma para lo suyo (13-10-2026; en el juego desde el 18-10-2026)**: cada
  golpe va con el ataque y el daño de su arma más lo que no es arma (`usoDelGolpe`,
  `cifrasDelGolpe`): el disparo con la de distancia, la carga con la lanza (sin ella, con la de
  cuerpo a cuerpo), el golpe y el contraataque con la de cuerpo a cuerpo, sin la que nadie pelea
  (`armaDeCuerpoBlocker`); un personaje sin arma (el perfil de `core/rpg/`) pega con sus cifras
  (`SIN_ARMA`). **Sin munición (13-10-2026; en el juego desde el 19-10-2026)**: llevar algo en
  `distancia` ya es disparar (`isShooter`), sin cuenta de tiros: un tiro por disparo y dos con
  `double_shot`; el guardabosques lleva su arco. Toda unidad ocupa una casilla.
- **Un solo combate (19-10-2026, decisiones del usuario)**: toda batalla —del mapa o de la arena,
  de la persona, del agente o de la IA— pelea con la rueda, salir del contacto, la carga a pie, la
  armadura, las armas por uso, sin munición y con los poderes de unidad, sin interruptores; las
  del mapa, sin muralla (la de la arena, para después). Medido en 1-100 (partidas de la IA,
  19-10-2026): 5,2 batallas por partida, rondas por batalla 3,58 de media (mediana 3, p90 5,
  máximo 12), 0 en `MAX_ROUNDS`; j0 gana 50, duración 4 / 7 / 15, 0 sin terminar; por facción
  (ganadas / jugadas), imperio 26/35, elfos 23/41, no muertos 22/55, orkos 20/38 y templarios 9/31,
  sin equilibrar (decisión del usuario). Con caballeros y nigromantes (18-10-2026): 3,17 rondas, j0
  49, duración 8 / 14 / 24. El banco (200 semillas, `1c496b88…`): 4 / 8 / 21 días.
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
  entra por su puerta** (#188): la casilla de debajo; **la mina tiene dos**, debajo y a
  la derecha, por donde salen sus raíles (#230), y su ramal sale por la más barata. Las
  puertas son un hecho (`puertasDe`, `rodeosParaEntrar`, `map/puertas.ts`) que leen la
  búsqueda, `colocarPar` y `sendasPorObjeto`; el juego no las mira. Son hojas del árbol (no se
  cruzan salvo que sean la única unión, más caro que pisar un monstruo); entrar
  por una puerta no cuesta, a 45° de la más cercana un rodeo, a 90° tres y
  más allá cuatro (con las dos de la mina, el noreste es diagonal de delante, el norte un
  costado y solo el noroeste espalda), y sus costados y espalda (`espalda`) cobran dos rectos, así
  que el radio que sigue de largo pasa por delante y el objeto cuelga de él con
  un ramal de una casilla. En 1-200, los ramales de mina miden 2,54 → 2,08 pasos, el 46 % sale
  por la derecha y los que doblan la esquina de su mina (pisan ≥ 3 de sus vecinas) pasan de 99 a
  20 (`tools/qa/ramales.ts`, `test/ramales-de-minas.test.ts`; 09-10-2026). `colocarPar` guarda las
  puertas de minas y pueblos (la mina, las dos; si no hay sitio, una; 4 399 de 4 400 con las dos en
  1-200), y no pone uno delante de la puerta de otro (en la fila que la cruza); si así no sale mapa, `trazarYVestir`
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
  cada pareja es el más cercano al medio con eje pleno (`conEjePleno`). **El acantilado es una
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
  776 casillas sin caída en cruz → 0 de 414 en ocho (88 son codos). **La puerta de una ciudad no
  muerde la línea** (#222, `puertasSinMuesca`, en 7a): en una franja de dos de hondo la ciudad se
  quedaba en la fila de arriba y su puerta, entre dos acantilados, era un barranco de una casilla
  donde la cara acababa en seco; el costado de la puerta con acantilado encima se abre a lo bajo y
  la casilla de la meseta a dos de la ciudad en su fila pasa a acantilado (la línea, en escalera),
  salvo si es pasillo o toca un nodo. Costados así en 1-1000: 59 → 5 (`test/puertas-sin-muesca.test.ts`).
  **Ninguna caída al sur va recta 10 casillas** (#231, `quebrarCaidas`, paso 7a'' tras los
  espolones): la línea de 7a copia el borde del lado bajo y la región alta sobre el agua cae en su
  propio borde, y las caras rectas largas que dejaban #229 y #230 eran todas eso. Cada fila que cae
  al sur `CAIDA_LARGA` (`largoALaEscala(8)` = 10) casillas seguidas o más (`caidasLargas`, sobre
  `nivelesDeLoEngordado`) se parte: cada ~`TRECHO_DEL_QUIEBRO` (5) un trozo de 2 a 5 se corre una
  fila, el acantilado o la montaña hacia lo bajo (7a adelgaza lo de arriba; las puntas quedan de
  codo) o el agua mordiendo lo alto. Solo pasa lo que se pisa a barrera, fuera de `RADIO_DEL_PASO`
  de un nodo y de los pasillos, con dos casillas de su región detrás, y en espejo donde se puede
  (el engorde no sale en espejo casilla a casilla). Lo que queda —junto a un nodo, o dos trozos que
  une el agua de las esquinas al pasar a montaña (s232)— tira el vestido al final (`generate.ts`).
  En 1-3000 (09-10-2026), caras ≥ 10: 14 → 0; tramos ≥ 10 174 → 143, mapas con tramo ≥ 12 14 → 12.
  Cuesta 6 mapas de 1-300 (otro vestido), los vestidos tirados no suben (1 846 → 1 833) y generar
  sigue en 33 ms de mediana (`test/caidas-largas.test.ts`).
  El nivel del engorde
  (`nivelesDeLoEngordado`) pisa los nodos como la escena. **El mapa guarda los
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
  ⌊√((regiones − 1) · `AREA_POR_REGION`)⌋ (42; de 3 a 10 regiones, 30 a 63), y su inversa es
  `regionesDelMapa`. **El mapa ×1,5** (#226, 09-10-2026): `AREA_POR_REGION` 300 → 450
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
  referencia). **Las fronteras onduladas** (#229): el reparto de regiones mide cada casilla desde un punto
  movido por un ruido fino (`ONDULACION`: rejilla de 2 casillas, amplitud 24/16, en enteros,
  antisimétrico en el espejo, con su propia corriente, `huellaDeSemillas`) y `sinPuas` quita los dedos de
  una casilla. En 1-1000, tramos ≥ 10 / caras ≥ 10 / mapas con tramo ≥ 12: 75 / 10 / 8 → 64 / 5 / 2 (lo
  recto que queda es del engorde, que reparte un muro recto a trechos); más amplitud quebraba más pero
  tiraba más vestidos con un llano junto a una meseta y sesgaba los suelos (con 28, la ciénaga del 13 al
  11 %). Vestidos por mapa 3,6 → 6,7; generar un 42×42, mediana 23 → 35 ms. Lo que destapó, arreglado en
  el generador: la Y junto a un nodo objetivo aún sin trazar se cobra (`yEnLaEsquina`), las barreras
  garantizadas se recuentan al final del vestido, la puerta de un objeto puesto sin ella libre se guarda
  (`guardarPuerta`) y un puente sin dos orillas enfrentadas no vale. Duración en 1-100, 9 / 15 / 31 →
  8 / 15 / 21; en 1-1000, 8 / 16 / 34 → 8 / 15 / 41; 0 sin terminar. **La ventaja del jugador 0 no
  cambia** (603 de 1 000): es sobre todo **abrir el día** (+63 de 1 000, medido cambiando de base y de
  facción en 4 000 partidas; la base 0 da +30 y el caballero +16); con el orden en serpiente (quien cierra
  un día abre el siguiente, «Orden de turnos» en las reglas) se va a +2, y j0 gana 524 de 1 000 (duración 8 / 14 / 29). **Minas por región (regla nuestra)**: la de casa, oro, madera y mineral;
  cada una de fuera, una rara y una básica por turno (`minasDeLasRegiones`): 2·regiones + 1
  por bando, 11 con 5 (con tres por región de fuera no cabían: objetos sin puerta 243 → 314
  de 1 000 y guardias del generador rotos).
  El agente sigue recibiendo ancho y alto, con el reparto como consejo. Un plan mide de 8 a 128 por lado
  (`LADO_MINIMO_DEL_PLAN`); el generador solo sabe de 24 a 64 (pedido por lado; por regiones, de 30 a 63)
  (`LADO_MINIMO_DEL_GENERADOR`, 200 de 200 semillas en cada lado) y fuera lanza antes de intentarlo (#102).
  Ninguna mina ni pueblo lleva una puerta en el borde (`colocarPar`, #189; la de la derecha de la mina tampoco, #230), salvo el respaldo sin puerta.
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
  acantilado que no separa dos. **Sin espigas** (#210, paso 7b del engorde, `quitarEspigas`): con el
  nivel por casilla de la escena (`nivelesDelRelieve`, el nodo con `nivelDelNodo` y los que llevarán
  camino de `crucesConCamino`), lo que se pisa por encima de sus dos vecinas de un eje (`espigasDelRelieve`)
  se rellena de la barrera baja de al lado, y si es pasillo de un nodo se le abre la orilla a su
  región (sin otra región a menos de tres pasos) o la orilla pasa a montaña; luego bolsillos, cruces y
  murallas otra vez, hasta `VUELTAS_SIN_ESPIGAS`; si aún queda una, el vestido no vale (7b', s49 con #222). 0 en 1-200 y en 24 y 64 (eran 112 en este-oeste en 10
  semillas, `test/espigas.test.ts`). **Ninguna senda corta en diagonal una esquina de agua** salvo junto a un puente (el tramo que
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
  camino acaba en un muro de roca»). La regla es `pasoTorcido` (`regiones.ts`), sobre el nivel de la
  escena: `silla` (en diagonal, a un nivel, con las dos esquinas más altas: la escena une lo alto
  por ese vértice y la senda pasaba bajo la roca), `diagonal` (cambia de nivel en diagonal: sin
  rampa recta de dos costados, #225) y `costado` (en cruz, pero a un lado lo de junto a las dos puntas
  queda por debajo de la alta: la esquina de la meseta). La búsqueda los cobra con el nivel que pintará
  la escena (`EntradaDeCaminos.nivel`, de `nivelesDeLoEngordado`): torcer junto a un nodo, más que
  entrar en una ciudad por detrás; una silla entre dos casillas de la región, `SILLA` rectos
  (`cobroDelTorcido`). Lo que queda —la región que toca el nodo solo por un vértice— abre esa esquina a
  su región y se vuelve a trazar (`abrirEsquinasTorcidas`, `VUELTAS_DE_ESQUINAS`): solo frontera
  (nunca un obstáculo), sin tocar otra región ni a dos pasos sin acantilado, sin espiga, sin partir lo
  que no es región, sin bajar de la densidad, sin quitarle a un nodo su barrera ni dejar la muesca de
  #222; el reflejo, si también se puede. Si aún queda una silla, o un paso al que se baja torcido, el
  vestido se repite. **La bajada a una ciudad** en diagonal o por la esquina de la meseta queda,
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
  (`tools/qa/murallas.ts`, `test/murallas-de-paso.test.ts`). Los planes del agente no cambian.
  **El río continuo** (#144, 16-10-2026, paso 1 del rediseño de
  `docs/agents/2026-10-14-rios-entre-regiones/`; el río que encadenaba fronteras de agua se cortaba
  en cada ciudad del cruce y en cada remiendo: «un río es algo continuo», el usuario). **El río va
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
  **ciudades-puente** (río recto donde toca tres regiones: la frontera de una orilla llega a él;
  `rioBajoLaCiudad`). Niveles (`nivelesDelRio`, sin tirada): el río va al llano, la ciénaga que lo
  toca sube al 1 y de una pareja que lo cruza con las dos orillas a 2 baja la de menor índice
  (`regionesDelRio`, `ladosDelRio`). En el engorde el río es agua fija (`conElRio`): no engorda ni
  se toca, salvo con lo alto justo al norte (paso 7e: la casilla del sur también es agua, se vea
  la cara), y **la rejilla del vestido solo la escribe `ponerTipo`**, que lanza si se toca el río
  (lo vigila `invariantes.test.ts`). **Fuera del río no hay agua de frontera** (vuelta de QA 1, H3,
  decisión del usuario: del mismo azul que el río, sus 1 675 casillas en 1-100 se leían como lagos
  dispersos): la pareja cuyos suelos solo dan agua lleva acantilado entre dos niveles y montaña a uno
  (`susBarreras`), y lo que sobra de una muralla tampoco pasa a agua; solo quedan las charcas (lagos
  de obstáculo, dentro de una región). El río cuenta como el agua de las `TIPOS_POR_MAPA`. **Ninguna
  base en el río** (H2): la base ciudad-puente se pintaba en la casilla donde empieza su héroe y
  pulsarlo lo metía en su castillo (s7, s30); `base` no elige un nodo del río. Las sendas no cortan en diagonal una esquina del río salvo junto a una
  ciudad-puente (un veto en la búsqueda, y si queda, el vestido no vale) y al puente del río se
  llega de frente (`antesDelEstribo`). Al final del vestido `rioEntero` lanza si el río no sigue
  entero: es un fallo del generador. Lo vigila `test/rio.test.ts` (`alTrazarElRio`). Medido en
  1-40 (`tools/qa/rios.ts`, sobre el mapa hecho; 16-10-2026), antes → después: ríos enteros —
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
  el banco, 8 / 15 / 30 → 8 / 14 / 30. **En la escena** (paso 2): la
  ciudad-puente se pinta en su orilla (`orillaDeLaCiudad`, el lado de las dos regiones de la T: el
  final de su frontera) y su casilla es agua con un puente de piedra que cruza de frente hasta la de
  enfrente (`puenteDeLaCiudad`, `Puente.orilla`); su reserva, su huella, su resplandor y lo que no se
  tapa van en la orilla (`sitioDe`), su marca cuelga de ella, y pulsarla (aunque se pise: a esa
  casilla se va por su lado) o el tablero lleva a la ciudad (`ciudadEnLaOrilla`, `puenteBajo`); quien
  está dentro se pinta en la orilla, como en una ciudad (`pisada`, H5). Las sendas de las dos regiones de la T llegan al
  estribo de la orilla, sin repartirse ni saltar lo que «queda bajo el puente», cortadas en él y en su
  sitio de la lista (las sendas se suavizan con un solo azar en orden); `test/ciudad-puente.test.ts`.
  De la senda de un puente del río, «bajo el puente» es solo lo que va sobre el tablero, a menos de
  media casilla de su línea (`tramosHastaLosEstribos`, H4): a los lados se cambiaba por la recta del
  estribo, que pasaba por el agua de al lado (s52, s93, s97, s100) o dejaba una montaña sin pico
  (s41); `sendaSobreElAgua` = 0 en 1-100.
  **Las charcas** (`Escena.charcas`, el agua que toca una sola región: los lagos de obstáculo) se
  pintan turbias (`COLOR_DE_LA_CHARCA`, `multiply`) para no competir con el río: 1 407 de 5 390
  casillas de agua en 1-40.
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
- **Base**: nace con guarnición de su facción (`data/ciudades.json`, `guarnicionDeBase`; la de una
  ciudad neutral, `guarnicionNeutral`). Con el héroe del dueño dentro, la defiende solo él con su
  tropa. Las bases de templarios heredan el arte de los caballeros; las otras cuatro, marcadores.
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

- Peticiones: `adventure_turn`, `battle_turn`, `battle_response`, `map_generate`,
  `hero_from_troop`, `town_voices`. Un test compara los `case` de `decidir` con `REQUEST_KINDS`
  en las dos direcciones; lo que se juega en su lugar es `EN_SU_LUGAR`
  (`Record<RequestKind, string>`).
- **La rueda y los poderes** (19-10-2026): el `attack` de `battle_turn` lleva `hit` (uno de los
  siete, en inglés: `HIT_DE_GOLPE`; sin él lo elige la IA a ciegas, y uno ilegal descarta esa
  jugada con su motivo), y el turno trae `hits`, lo que hace cada tipo con el arma de la activa;
  la jugada `power` usa Curar o Bendecir (el stack trae `powers`). Cuando golpean cuerpo a cuerpo
  a una unidad suya, quien pega anda y se planta, y se pide `battle_response`
  (`serializeBattleResponse`: quién a quién y lo que daría cada respuesta, sin el golpe del otro).
  Una respuesta que no vale o no llega la elige la IA **solo para ese golpe**: la batalla sigue
  siendo del agente (`EN_SU_LUGAR.battle_response`). El veredicto cuenta el cruce: qué eligió,
  qué eligió el otro y en qué punto cayó. Medido en `pnpm qa` (19-10-2026): 22,7 peticiones por
  batalla (18,4 turnos y 4,3 respuestas; 19,3 cuando la rueda la elegía la IA por él).
- Consultas: `game_state`, `battle_state`, `map`, `creature_stats` (con `dwelling`, el edificio
  que la produce, `equipment` por slot, `armor`, `level` y `powerIndex` derivados:
  `fichaDeCriatura`, campo a campo), `spell_list`, `building_list`. El equipo va por los cinco
  slots (`melee_weapon`, `ranged_weapon`, `lance`, `armor`, `shield`) y cada stack lleva su
  `armor`. La tropa veterana y el héroe llevan `rank` y `level`; el stack, `veteranRank`; el
  `equipment` de un veterano es solo lo suyo (lo de serie, en `creature_stats`).
  Solo por los jugadores del agente, y **todo
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
  `JUEGO_SIN_HOJA` (héroe, personaje y vecino), `JUEGO_DEL_YBOT`, `DIRECCION_DE_HOJA`. Una tropa
  del catálogo se pinta con la hoja de su unidad (`hojaDeUnidad`; el `body` de su stack es esa
  hoja), que registra `registrarLasHojas` al arrancar (`cargarArte`) en la partida, el espectador y
  la arena. Anclas del Y Bot en `_poses/atlas-8d.json` (`pnpm taller derivar-poses`).
- Ritmo: `marcha.ts` (`PRISA_DE_LA_MARCHA`), compás propio por figura con hash
  del id (`compas.ts`), sombra por silueta, carga hoja a hoja con cachés LRU.
- **La batalla se cuenta en cola** (`anim.ts`): el estado ya trae el final de lo que se cuenta,
  así que la barra de vida (`EstadoFigura.pv`) baja en el impacto de cada golpe, disparo o
  hechizo, con `trasElGolpe` y lo que dice el registro (la cura de un poder también); lo que el
  registro no dice (el drenaje, la cura del héroe) llega con el último impacto de la unidad. El aro
  y la casilla resaltada van con quien actúa en lo que se cuenta (`BattleAnimator.activo`,
  `EstadoFigura.casilla`, ninguna mientras anda). Partida, arena y espectador (H6, 13-10-2026).
  La carrera de una carga la marca el núcleo en su `move` (`charge: true`, 13-10-2026): el
  animador no la deduce del golpe de al lado, que con la rueda llega después.
- **La rueda, en las tres pantallas** (19-10-2026): un `<dialog id="rueda">` modal y sin fondo (en
  un móvil, con velo) que pinta y conduce `DialogoDeLaRueda` (`client/rueda/`: `rueda.ts`,
  `disco.ts`, `figuras.ts`, `dialogo.ts` y `rueda.css`, que enlazan las tres páginas). El golpe
  cuerpo a cuerpo de quien juega **primero anda** (se planta ante su objetivo con la carga de la
  carrera, `BattleState.golpeEnCurso`) y al acabar la marcha abre la rueda con los siete tipos, su
  daño (`previsionDeLaRueda`) y su efecto en nota; clic, teclas 1-7 o flechas + Intro; Escape
  cancela solo antes de elegir y deja a quien pega donde llegó, con su turno y sin la carga
  (`soltarElGolpe`). Cuando golpean a quien juega, elige su respuesta sin ver el golpe
  (`RuedaPendiente` no lo lleva). El golpe de una vez (`from` y las dos elecciones: `autoResolve`,
  IA contra IA) escribe lo mismo: `move`, `cruce`, `attack`. El desenlace —giro, marcadores del
  color de cada bando, arco, medidor de cinco muescas, rótulo— lo cuenta el animador con el hecho
  `cruce` (`DURACION.cruce`, `data-tramo`), con el tablero de antes del golpe detrás. Cada fase nace
  quieta (`data-quieta`: el `:hover` no enciende el sector hasta que se mueve el puntero), y la nota
  de cada tipo dice cuándo actúa en esa fase (`efectoDeGolpe(tipo, papel, contraataca)`). La
  cabecera lleva las figuras de los dos y dice quién es quien mira. El espectador la usa solo para
  contar (`SOLO_MIRA`: una sesión que no elige), y el cable le lleva lo puesto de héroes y
  personajes (`UnitInfo.equipo`), así que `adaptar.ts` sigue siendo la inversa exacta.
- **La batalla de la persona**: los poderes de su tropa, con los botones de la arena
  (`views/poderes.ts`, `PoderesDeLaActiva`: un aliado posible se usa ya; varios, espera el clic;
  Escape suelta lo apuntado). **Juega sus defensas** (#116, 19-10-2026): la batalla que nace en el
  turno del rival contra ella pasa a la pantalla («¡Te atacan! Defiéndete.») y el turno del rival
  espera a que la cierre («Continuar» o «Resolver sola»); la que no es suya la cierra la IA.
  Mientras la rueda espera, los botones de la batalla salen apagados con su motivo
  (`apagadosPor`), y un clic mientras se cuenta una jugada dice «Espera a que termine la jugada.»
  (`alPulsarMientrasCuenta`); en la partida y en la arena (vuelta 1 de QA, 19-10-2026).
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
  **El escalón** (`escalon.ts`, #211; auditoría 5, defectos 2 y 4): todo en máscaras puras a `PX_DEL_ESCALON` (16) por casilla, calculadas una vez por escena (`delEscalon`, las comparten el esbozo y el bueno) y ampliadas con suavizado. **El nivel pintado** (`nivelPintado`): el de su casilla, o el de la vecina más alta que más pesa, que se adelanta sobre la baja entre `ORILLA.menos` y `ORILLA.mas` (0,06-0,3) con ruido y las esquinas redondeadas; nunca baja. Lo leen las fronteras, el tono, el agua y la sombra: con el lado de casilla tal cual, donde no hay pared encima, el agua y los suelos salían en rectángulos. **El agua y el barro no suben** (`aguasDeLaEscena`): lo mojado de cada nivel de agua es nítido (sus casillas, las esquinas redondeadas `ORILLA_DEL_AGUA.esquinas`) y se cierra donde el nivel pintado (y el píxel de al lado, el que lee la ampliación) queda por encima; desde su borde el agua entra entera en `entra` (0,15), el barro es una orilla de `barro` (0,08) hacia fuera y la espuma un anillo dentro (`ESPUMA_EN_LA_ORILLA`). Con el agua desenfocada y cortada, quedaba una banda ancha de barro entre la meseta y el agua. `informe.aguaEnLoAlto` (lo mide la página del taller) = 0 en 1-40 (eran 1,53 M píxeles a 16 px; el istmo de s2 (25, 10-12) era agua). Las sendas no secan el agua: una senda sobre agua sin puente es del trazado (#210); `informe.sendaSobreElAgua` es medida, 8 en 1-40 (2026-10-08). **Un tono por nivel** (`tonoDeNivel`, #217): negro 0,3/0,24/0,1 en −1/0/1, luz `soft-light` de blanco cálido 0,85/1 en 2/3+ (`screen` lavaba lo alto como niebla y `color-dodge` quemaba la nieve antes de que la lava se notara), el borde suavizado `SUAVE_DEL_TONO` (0,05) porque, marcado, el escalón de un píxel del nivel pintado se veía en dientes. Mismo suelo a 1 y a 2, ΔL de la mediana por casilla a 96 px (08-10-2026): lava de s13 14,7 → 31,0, nieve de s2 4,6 → 14,9 (2,1 y 3,2 veces). **El labio y el canto de la espalda** (`labioDeLasEspaldas`, #217; `cantoDeLasEspaldas`, #219): en lo alto, a lo largo de cada caída hacia el norte y por el nivel pintado, una luz `soft-light` de `LABIO.ancho` (0,14) y `LABIO.luz` (0,9); y en lo bajo, justo al norte del filo, el canto: **una línea fina y nítida** (#223), negro a `CANTO.oscuro` (0,75) en `CANTO.ancho` (0,14: dos píxeles del escalón, 0,125 casillas) y nada después, encima del agua, ni por donde baja una rampa; es lo único que oscurece la espalda. De 0,28 con fundido, sumado a la sombra al pie que la espalda echaba ~0,57 casillas al norte y que en los entrantes de una casilla se juntaban en una mancha, se leía «una sombra difuminada, no se entiende» (marca en s55 (4,16)). Lo vigila `oscuroAlNorteDeLasEspaldas`: lo bajo con un oscuro ≥ `OSCURO_DE_LA_ESPALDA.umbral` (0,1) seguido desde el filo, columna a columna, no queda a más de `OSCURO_DE_LA_ESPALDA.ancho` (0,25: la línea más el píxel que derrama el suavizado y el escalón de un píxel de un filo en diagonal) del filo más cercano, sin las columnas de la sombra de una ladera vecina; en 1-40, de mediana 0,31, p90 0,42 y máximo 0,56 casillas (889 de 1 096 espaldas por encima de 0,25) a mediana 0,19 y máximo 0,23 (0 por encima; 09-10-2026). Se buscan solo al norte, columna a columna (al sur va la cara y al este y oeste las laderas). Con el labio solo, en `screen` y de 0,16, la espalda se leía como una hebra de niebla (auditoría 7, defecto 1: s24 (0-9, 20-21), s13 (14-24, 4-7)); el filo claro sobre una línea oscura se lee como un canto, y lo bajo, en sombra. `informe.espaldasSinLabio` y `espaldasSinCanto` = 0 en 1-40 (1 092 rebordes con filo pintado; 3 casillas bajas sueltas se las comen las orillas de lo alto). El canto cuesta ~13 ms por mapa, una vez; el pintor no sube (taller a 120 px, 4 rondas de s13, 2 y 9 alternadas, 09-10-2026: mediana 4 079 → 4 201 ms, mínimo 3 955 → 4 014, en el ruido de la máquina cargada). El suelo que se pinta en una barrera o un nodo (lo que no tiene región) es el de su meseta (`sueloQueSePinta`, #217, #220): con el más cercano de cualquier nivel, 2 833 de 18 777 casillas de barrera de 1-40 pintaban arriba el suelo de abajo (picos nevados sobre áspero oscuro en s24 (22-29, 9-16)), y el nodo sin camino que va al alto derramaba la nieve de abajo sobre la lava de s13 (18, 7). **La cubierta es la de ese suelo** (#220): lo alto del acantilado, el pie de la muralla y los nodos la eligen por él, no por `Analisis.suelo`; `informe.cubiertaDeOtroNivel` (piezas de cubierta cuya hoja no es de la mezcla ni de los árboles del suelo pintado bajo su pie) = 0 en 1-40, 57 y 80 (eran 494 en 1-40, s57 18 y s80 53, 09-10-2026: nieve y abetos nevados en lo alto de la lava de s13, hierba en lo alto de la nieve de s80). Las máscaras del escalón se tiñen a 16 px y se amplían al copiarlas (`encima`), sin un lienzo del tamaño del mapa por máscara: el pintor no sube (taller a 120 px, 4 rondas de s13, 2 y 9 alternadas: mediana 4 473 → 4 521 ms, en el ruido). **La sombra del desnivel** (`sombraAlPie`), la única (sustituye a los cantos al este y al oeste y a la franja de la espalda de #212): por cada lado de casilla de una caída que mira hacia donde la echa la luz del contrato (`ARTE.luz`: al este; al norte, la espalda, no desde #223: lleva el canto), entera hasta el pie (el talud) y fundida el contacto más `caída · ALTO_DE_NIVEL · longitudPorAltura` hacia esa luz, a 0,42 del color de sombra; ni sobre lo alto, ni por donde baja una rampa. En un barranco de una casilla (lo alto también al otro lado de la fila, sin laderas: `sinBarrancos`) solo el contacto, que si no llenaba el hueco (#223, `franjaDeSombra`). Al sur y al oeste, nada: miran a la luz. El pintor del suelo no sube (taller a 96 px, 08-10-2026: 4,6 → 4,1 s de media en s1, 2, 5, 9 y 443; el desenfoque de lienzo a resolución plena era más caro). **Sin rejilla** (`parches.ts`, R2): cada textura del suelo, el agua y el barro va con su patrón y encima, con `source-atop`, un parche redondo por celda de una rejilla de `PASO_DEL_PARCHE` (1,5 casillas) movida al azar, de radio `RADIO_DEL_PARCHE` (1,5; entero hasta 0,85) y fundido por el borde, en orden barajado; cada uno es uno de `VARIANTES_POR_TEXTURA` (12) trozos de la textura (desplazamiento y espejo izquierda-derecha; ni giros ni espejo vertical: la luz viene de arriba y la arena tiene ondas), una estampa que se hace al pedirla y se suelta con su textura (`estamparParches`). El encaje (`encajeDe`) sale de la semilla de la escena y la clave de la textura, y las fronteras leen la altura en él (`enElEncaje`): la autocorrelación al periodo de 4 casillas bajó de 0,53-0,68 a ~0 (texturas solas, semillas 1, 7 y 13, 2026-10-08; la vigila `test/parches.test.ts`). Mientras, se ve el sucedáneo de pigmentos y luego el esbozo
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
  montaña, 2,31 → 1,54. **En masas y claros** (#218): un ruido de grupos (`PASO_DE_LOS_GRUPOS`, 4,6
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
  la hondura entera de `analizar`. **La cubierta de lo que se pisa** (#184): en la lava, la arena,
  la ciénaga y lo áspero (`CUBIERTA[s].comoLaBarrera`: su cubierta es de la roca o la madera de la
  barrera vecina) va rala (`CLARO_COMO_LA_BARRERA`), sin manchas ni árboles, y cada pieza se encoge
  hasta no ser más esbelta que `ESBELTEZ_DE_LO_PISABLE` (`tumbado`, en `poner`); lo alto del
  acantilado y el pie de la muralla siguen con la hoja entera. `informe.cubiertaComoLaBarrera` = 0
  (piezas más altas que su esbeltez y regiones de ≥ 9 casillas con huella > `HUELLA_DE_LO_PISABLE`).
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
  **El pasillo de la senda** (`pasillo.ts`): la tabla `APARTE` (`colocar.ts`) dice por clase qué media anchura respeta —cubierta, roca y orilla 0,16 (media `ANCHO_DE_SENDA`) + `MARGEN_DE_SENDA` (0,3); masas 0,16 + `MARGEN_DE_MASA` (0,2); muro, pared y objeto, ninguna—, su mínimo al encoger y sus hojas. Se mide el rectángulo del sprite (`cajaDeSprite`) contra el trazo suavizado. **Lo que no se tapa es un solo índice** (`Obstaculos`, #151) de formas, cada una con su regla (`Forma.mide`: media anchura, y rectángulo o solo el pie): la senda y la rampa de cada bajada (`formaDeLaSenda`, la de `APARTE`), el tablero de cada puente (`formasDeLosTableros`, solo lo que va delante), el eje de cada paso (`formaDeLosPasos`, solo volúmenes), la reserva de cada objeto (`reservaDe`, un trazo de un punto de `RADIO_DE_OBJETO`: el pie de lo que se aparta y, si es un volumen que se pinta después del objeto, su rectángulo; un árbol o un pico al sur ya no tapa la mina) y, como tope (`Tope`, una regla sobre el ancho y no un trazo), **lo que se pisa** (`topeDeLoPisable`, 14-10-2026): la copa de la masa no entra por los lados más de `MARGEN_SOBRE_LO_PISABLE` (0,2) en una casilla que se pisa de la fila de su pie, en cuenta cerrada (`altoPorLosLados`, la regla de la puerta y del contador `sobreLoPisable`; lo que sube al norte es perspectiva, #185), salvo sobre **un pasillo estrecho** (vuelta de QA 1, decisión del usuario, 14-10-2026): la copa no tapa más de `TAPADO_DEL_PASILLO` (0,4, por su caja, desde abajo) de una casilla que se pisa sin nada que se pise al norte, o ni al este ni al oeste (`pasillosEstrechos`, `altoSobreLosPasillos`): el pasillo de este a oeste de una casilla y el rincón, que la copa de la fila de su sur borraba (s1 (29-31, 17), un paso). `informe.pasillosTapados` = 0 (2 398 masas en 1-40 antes; casillas así tapadas en un 80 % o más por las cajas, 203 de bosque y 79 de montaña → 0; las 65 que quedan son de cumbres). **Y la de abajo de un pasillo de dos de hondo** (vuelta de QA 2, H10, decisión del usuario, 16-10-2026): lo que se pisa al norte, pero no al norte de esa ni al sur de ella; de tres de hondo o más sigue siendo lo ancho. Tapadas en un 80 % o más por cajas de masa sin cumbre, en 1-40: 139 de bosque y 57 de montaña → 0 (con las cumbres, 55 de montaña); el árbol más alto de la casilla de bosque de debajo, 1,11 → 1,02 de mediana, y el pico de montaña, 0,67 → 0,63; `cumbresSobreLoPisable` 467 → 485. El borde casi no baja: el árbol más alto de cada casilla de bosque bajo un pasillo, 1,09 → 1,00 de mediana, y el pico de montaña, 0,57 → 0,53 (solo se encogen los pies del 0,4 de arriba de la fila). Las cumbres (`Sprite.cumbre`: las de #204 y el pico que sube `unoQueDomine`) no miran ni lo uno ni lo otro (`informe.cumbresSobreLoPisable`, medida: 467 en 1-40, 288 de ellas sobre un pasillo, como s3 (4-5, 18)), el dardo de la masa no baja del mapa y `informe.masaSobreLoPisable` = 0 (unas 9 100 en 1-40 antes; el p10 del alto de la masa de bosque al borde, 0,51 → 0,45). La pared y la muralla miran la reserva por sus puntos (`en`); el pedregal, su propio pasillo. El dardo y `poner` hacen la misma pregunta (`entra`); `poner` encoge (`altoLibre`), prueba el módulo más estrecho y, si no, quita. Bajo la senda va un arcén del color del suelo, a 16 px por casilla, y `informe.spritesSobreSenda` = 0. **La huella** (`huella.ts`, #191): la senda es tierra de `ANCHO_DE_SENDA` (0,32), la textura `suelos/dirt.webp` entonada hasta la de las rampas de las bajadas y a 0,82 de alfa (toma el color del suelo de debajo), con dos orlas tenues y el borde roto por dos ruidos de la semilla (`IRREGULARIDAD_DE_SENDA`); se pinta como una cinta de ancho variable (`trazarCinta`, ~0,1 s a 120 px). En un tramo recto de `L` casillas el vaivén se multiplica por `min(1, 2,5/L)`, nunca bajo `VAIVEN_EN_LO_RECTO` (0,3): en lo recto de 1-40 bajó de 0,105 a 0,030 casillas.
  **Las murallas** (`muralla.ts`, #183, #197, #207): cada franja de muro lleva la línea de su frontera, no su esqueleto (`trazaDeMuralla`): tiradas rectas de mínimo coste (una esquina vale `ESQUINA` = 3 casillas, por el medio de la franja y, donde cambia de nivel, por lo alto: `AL_PIE_DE_LA_CARA`) que unen, como un árbol, sus puertas (de través a su paso) y sus **apoyos**: el grupo de casillas que toca una misma cosa de fuera —otra barrera o su nodo, el borde, la huella de una ciudad o un pueblo, a la que se llega por debajo— y dos lados pisables (`Alrededor`, `alrededorDeMurallas`, que deriva el lado de cada casilla del terreno). Las puertas de una franja son las de sus 8 vecinas por coordenadas, no por índice (con el índice, la puerta de la columna 0 era de la franja del borde contrario: la fuga de s443). Un paso en diagonal nunca pasa entre dos casillas pisables, que son del mismo lado (s730). Donde la línea deja que un lado llegue a otro (`fugasDe`), se añade el sitio que más fugas cierra (el apoyo que toca a los dos, uno que la fuga roza, o lo más estrecho entre ellos) y, si por lo alto no cierra, se traza en llano; lo que cuelga sin llegar a nada se poda (`sinEspolones`). Una franja sin puerta que no separa dos lados, o sin nada a lo que llegar, no lleva línea: es escombro (#232; el generador ya no las hace, y la de un plan del agente se lee como ruina). Lo que no pisa la línea es escombro: ni espolones ni un segundo muro. El tramo recto se apoya por el medio del paso; el diagonal, por su punta baja en la casilla de abajo. Torre obligada en cada junta, también a 45° (`esquinasDe`: sin ella la junta se ve abierta) y en cada punta de norte a sur (sin ella el tramo es un raíl), `torresObligadas`; en las demás puntas y en lo recto a `ENTRE_TORRES` (3); nunca junto a una puerta ni bajo una ciudad, salvo **la punta que toca su apoyo** (#232): montaña, acantilado, agua o el borde (`puntasContraSuApoyo`), que lleva su torre corrida `ARRIMO` (0,25) hacia él, también junto a la puerta, para que el lienzo no acabe a media casilla de la montaña (s36 (21,20)). **Nunca dos torres apiladas** (`seApilan`): a una casilla o menos, ni en la misma columna a dos o menos, que la cámara pone una encima de otra. La punta de otro eje o la casilla sola que se apilaría con una obligada, de su línea o de otra franja, se queda sin torre; la línea no dobla a menos de eso de su esquina anterior ni de una obligada ya trazada (de norte a sur, tres), salvo junto a una puerta o bajo una ciudad, y si así no llega o no cierra, dobla (`seguidas`). Si quedan pegadas, prueba a empezar el árbol por otro terminal. Un tocón de norte a sur de dos casillas o menos hasta la siguiente torre se quita (`sinTocones`), salvo si es toda la línea. La línea no dobla donde la torre no cabe de ninguna manera (`esquinaCabe`) y paga por doblar donde no cabe entera. Ningún tramo se salta por una reserva (`meterEnLaMuralla`): el que llega a una puerta, o cae en la reserva de otro objeto, se pinta en su sitio y se ordena justo antes que él (`ordenadoEn`), que queda encima. La puerta va centrada en su nodo (su ancla derivada es el pie de una torre). De norte a sur, el tramo es de lado (`muro-ns-1`/`-2`, 1,6 de alto por el medio) y la puerta (`nodo-puerta-hondo`) va a 2,6 de alto por el pie de su arco (`PUERTA_NORTE_SUR`); la ruina sigue con el `profundidad` de su hoja. El resto de la franja es escombro (`rocas-caidas`), nunca la cubierta del suelo vecino. `informe.murallasPartidas` = 0 en 1-40, contado sobre lo PINTADO (`informe.muralla`): fugas (un lado que llega a otro por la franja sin cruzar lo pintado, en una rejilla de 4×4 por casilla, el tramo de media casilla a cada lado y de cabo seco), puertas sin tramo hacia un lado de su paso con muro, y trozos de más de una línea (lo que llega a una ciudad se une por ella). `informe.murallaIncoherente` = 0 en 1-40: espolones (puntas de una franja que separa dos lados sin llegar a nada), juntas de dos ejes sin torre y puntas de norte a sur sin torre (`puntasSinTorre`). `informe.torresApiladas` = 0 en 1-40 (`apiladas`); en 1-1000 quedan 13, en 12 semillas, todas de dos juntas que la franja obliga (un escalón de una fila) (2026-10-08; eran 3 138). En 1-1000, `murallasPartidas` = 0 y `murallaIncoherente` = 0. Ninguna senda entra en una casilla de muro salvo por su puerta (como mucho 0,06 de vaivén). **La torre no tapa la senda** (#193): la que la pisa (`sendaParaLaMuralla`, la senda pintada sin arcén, a `SEMIANCHO_DE_LA_HUELLA`: su borde más abierto) no se pone y va la siguiente candidata (`torresDe(…, cabe)`); la de una casilla sin tramos o de una esquina, que va siempre, se encoge hasta `TORRE_MAS_BAJA` (0,45) y, si ni así cabe, se corre dentro de su casilla (`CORRIMIENTOS_DE_TORRE`, `torreQueCabe`). El lienzo no se aparta: lo alto del último tramo puede quedar delante de la senda que rodea su punta. `informe.murallaSobreSenda` = 0 en 1-40 (`murallaSobreLaSenda`: torres que la tapan y tramos que la cruzan fuera de una puerta).
  **Los hitos** (`nodos.ts`): todo nodo de acantilado, de bosque y de montaña lleva uno (`HITOS`, por su id), sin tope, porque un nodo neutral no lleva bandera (354 en 1-40: 119 de acantilado, a 5 casillas o más unos de otros, 114 de bosque, que acercan cuatro pares a 4,1-4,5, y 121 de montaña: son nodos distintos y cada uno se toma). **El paso de bosque y el de montaña no llevan pieza** (#196, #203): el portillo de abetos verdes desentonaba en la nieve y en los demás bosques, y la mitad de esos pasos separan dos suelos con dos hojas de árboles; la garganta de `nodo-paso-montana` iba de norte a sur y solo 2 de 23 nodos de montaña se cruzan así (el camino entraba bajo la roca por un costado, y en la nieve salía parda). Los abre la propia masa por su eje, su reserva es de `RADIO_DEL_PASO_SIN_PIEZA` (0,5, no la de 0,95 del nodo: abría un claro redondo; `radioDeLaReserva`), y lo leen el hueco y el hito. `informe.pasosAtravesados` = 0 (la pieza del nodo, si no es hito, no pisa su eje; eran 121 en 1-40). Sigue en `BARRERAS_CON_PASO_A_LA_VISTA`. La tablilla apunta por el eje del paso (`tablillaDelEje`: al fondo antes que a la cámara; en el este-oeste, por el sitio), una pieza por rumbo y nunca espejada; el miliario va entonado (`TONO_DE_HITO`).
  **Los pasos se ven** (`pasosALaVista`, `ejeDelPaso` en `nodos.ts`, #173): cada nodo de montaña, bosque o muro, con camino o sin él, abre un pasillo de `SEMIANCHO_DEL_PASO` (0,36, el de las masas) a lo largo de su eje, de la segunda casilla de una entrada a la de la opuesta (el orden de `ejeDelNodo`). De él se apartan solo los volúmenes: la masa se encoge o se quita, y lo bajo se queda a `UMBRAL_DE_VOLUMEN` como mucho, para no abrir una franja pelada. `informe.pasosTapados` = 0. **Sin trocha** (#227): el paso sin camino no lleva huella. La trocha de #190 (una línea recta de tierra por el eje de cada nodo de bosque, montaña o acantilado sin camino) no se entendía («¿qué es esa franja?», s55 (3,17)); el paso lo dicen el hito y el hueco del eje, y lo bajo (los abetos de 0,6 de la nieve) vuelve a quedarse en él, como en el pasillo de los pasos.
  **El relieve por celdas** (R4, `celdas.ts`; `docs/agents/2026-10-07-relieve-esquinas/`): el nivel por casilla sale de `relieve()` (el de su región; ver «Los acantilados») y las paredes, de cada vértice: por umbral, un caso de 4 bits (`celdas`; la silla, «el alto une»; el mismo tipo en dos grupos seguidos es una pared). Cada pared va de junta a junta, en el medio de un lado de casilla, y la clase de la junta la fija el lado (`JUNTAS`: en la S el pie cae a plomo, en la E u O con el talud de `TALUD_DE_LADERA`). `caidas` las encadena: las S en `Cara` de media casilla en media casilla (`paredes-*` libres, que no salen de su tramo más de `SALE_DE_SU_TRAMO`), las E y O en laderas, y cada diagonal (`SE`/`SO`, `convexa`/`concava`) lleva su pieza `diagonales-<material>-<se|so>-<caída>` por sus dos filos (`spriteDeDiagonal`; un cuarto de círculo en la guía, `tools/taller/diagonales.ts`). Las de espaldas, el reborde y sus peñascos. La pared que cruza un puente no lleva pieza (`celdasBajoLosPuentes`). **La pared nunca se corta ni se aparta de la senda**: donde un camino baja hacia la cámara o de lado va una **bajada** encima (R5, `bajadasDe`: `arriba` donde la senda pintada cruza el filo; `bajadas-<material>-<caída>/<s|se|so|e|o>`; la rampa sigue a la senda en pantalla, `rampaDe`; el rumbo es el de lo pintado, el del tramo o uno a 45°, `rumboPintado`; y la senda pintada pasa por la rampa, de su filo a su pie, y vuelve a su trazo con un enlace a cada lado, sin mover sus extremos, `sendasPorLasRampas`, #192), con la clave detrás de toda pared que pinta sobre su camino y delante de nada horneado de la casilla a la que baja: la que baja a una ciudad, pueblo, mina o nodo va justo detrás de él (`llegaA`), y lo que se pinta delante del nodo puede tapar su llegada. **La rampa abre la pared con sus costados** (#225, §35, `rampas.ts` del taller): donde el camino del núcleo baja de frente (al sur) por un borde recto —la pared S de los vértices `x − 1` a `x + 2` de su filo, cinco casillas, una sola caída— y hay su arte (`rampa-<material>-<caída>`: piloto de roca y arenisca de caída 1), no va la bajada: va el cuerpo (la cuesta) en el hueco y un costado de casilla y media a cada lado, el muro que se hace cuesta (*wall-to-slope* de StarCraft y Warcraft III): su cara frontal, la de la frontal vecina, tiene el alto entero por fuera y baja en diagonal hasta nada en el borde de la cuesta, al pie, con la meseta bajando por encima; sin caras laterales que flanqueen el camino (`rampasDeFrente`, `TRAMO_DE_PIEZA_DE_RAMPA`, `spriteDeRampa`). El extremo de fuera de cada costado sigue `SOLAPE` (0,15) fundido a transparente, y encima va la frontal más estrecha de su material, que tapa la arista (detrás de un objeto si lo taparía); el tono, el de su frontal medido (`TONO`, `rampa-*`). Se decide por el tramo, antes de toda pared; esas cuatro paredes salen de la cara (`caidas(…, fuera)`: ni frontal ni cara pintada), la bajada baja por el medio del hueco y no lleva pieza (`enSuRampa`, `deUnaRampa`), y el costado va detrás de la frontal de al lado. Las tres piezas son una imagen cortada por su guía (registrada con su escala). `informe.rampasSinSusPiezas` = 0. Con arte salen 1 en 1-200 (s62 (4, 7)) y 19 en 1-1000, todas de caída 1, en el mapa de 42×42 (eran 5 y 27 en 34×34; 09-10-2026); con las fronteras onduladas (#229), 2 en 1-200 (s106 (34, 19), el caso del test, y s139). **Y la de muesca** (§36): donde la casilla de debajo está entre dos altas con lo bajo delante (`HHH/HlH/lll`, la muesca de una de hondo de un nodo con camino o de una ciudad que entra por detrás; 160 de las 992 bajadas `s` de caída 1 de 1-1000 en 42×42, el patrón más frecuente de los rincones), una pieza entera (`rampa-muesca-<material>-<caída>/s-muesca`, `PIEZAS_DE_LA_FORMA`, `Rampa.forma`) sustituye sus cuatro diagonales (`PAREDES_DE_MUESCA`) y casa por sus dos juntas S, las de las esquinas de delante (`TRAMO_DE_PIEZA_DE_RAMPA.muesca`, `FILA_DEL_FILO`): la cuesta entre dos laderas en triángulo, enteras delante y a nada arriba. Las diagonales que sustituye gastan su tirada (las demás sacan el mismo módulo con su arte y sin él). Con arte (roca y arenisca, caída 1), en 42×42: 27 muescas y 1 recta en 1-200, 89 y 19 en 1-1000 (rampas de 1 a 28 y de 19 a 108; 09-10-2026); con las fronteras onduladas (#229), 11 muescas y 2 rectas en 1-200 (la muesca del test, s126 (31, 33)): el borde recto de cinco casillas y el rincón `HHH/HlH/lll` salen menos. `rampasSinSusPiezas` mira las dos formas: una pieza de cada una de su forma en su tramo, y ninguna frontal, ladera, diagonal ni bajada sobre el hueco. Sin arte o en otro rincón (un lado que sigue al sur, la muesca honda, el rincón de un lado: #228; s55 (30, 15)), la bajada de siempre. Caída 3 o más: la pieza de 2 estirada en alto (`Sprite.ancho`); sus dos filos no caen a la vez y van centrados, y el guardia acepta ese desvío y no otro (`filosEnSuSitio`). El arte está entero (todos los materiales, caída 1 y 2, §23); sin él, un marcador (`COLOR_DE_DIAGONAL`, `COLOR_DE_BAJADA`). Las guías de las diagonales llevan el labio roto en trozos (en el suroeste, oscuro: `LABIO_EN_LUZ`) y sin canal en las cóncavas, y su referencia de material es la ladera vecina (`laderas-<material>-<este|oeste>-<caída>`), no la frontal; el suroeste lleva además su hermana del sureste. Las diagonales y bajadas de basalto van con el tono de su ladera (`TONO`, §26), y la frontal (`paredes-basalto`) con el suyo (#220): sin él daba luz 71 y R−B 20 entre laderas de 54 y diagonales de 48-52 y la línea de una meseta de lava se leía a trozos; con `brightness(0.72) saturate(1.15)`, 51/50 y 16 (luz Rec. 709 media de las piezas puestas en s9/s13, 09-10-2026). La puerta es `ponerPared` (los tableros y la reserva de un objeto; lo que rechaza queda como razón declarada, `vaciaPorque`). **La pared pasa por detrás de un objeto** (#221): en su reserva, la frontal y la ladera van si no lo tapan a él ni a su camino (la rampa de una bajada, `rampasPrevias`, o más senda escondida), encogidas si hace falta, y la diagonal, que no se encoge, se ordena justo antes que él (`ordenadoEn`); el pedregal no entra. Saltarse la reserva partía el borde de la meseta en bloques sueltos junto a las ciudades y minas de su pie. **Ordenar no mueve** (#222): `ordenadoEn` pone `Sprite.clave`, la clave del pintor (`claveDe`, que leen `ordenDeVolumenes`, `separar`, `vaDelante` y cada pregunta de quién va antes), y el pie y el ancla se quedan donde los leen `celdasMalCubiertas` y las juntas. Con ella, la frontal y la ladera que ni encogidas dejan de tapar un objeto de su pie (`alPie`; lo de lo alto lo tapa la cara) pasan también por detrás, y la diagonal pasa por detrás del objeto cuyo camino solo taparía donde el objeto o una bajada pintan encima (`tapaElCamino(…, true)`, a dos centésimas: la bajada que llega va a una, encima); esas se juzgan otra vez con la senda pintada y las bajadas (`detrasDeUnObjeto`, una a una) y se quitan si esconden `ESCONDIDO_DETRAS` (0,3). La pared que taparía el tablero de un puente va por detrás del puente, y la que un puente solo toca en la punta de su filo (la junta por la que pasa todo puente de norte a sur o de este a oeste) lleva pieza (`celdasBajoLosPuentes(…, true)`, `juntoAlPuente`, con su propio azar). `informe.carasCortadas` (tiradas de frontal de ≤ `CABO_SUELTO` (2,5) con una punta en el llano a ≤ 2 de un objeto) 72 → 18 en 1-200, 13 → 4 en 1-40 (#221, 34×34); en 42×42, 23 → 4 en 1-200 y 2 → 0 en 1-40 (#222, 09-10-2026): quedan esquinas cuya diagonal taparía el camino que sale de su pie (s105, s174) o el de una bajada de muesca sin arte (s143, basalto). Con las fronteras onduladas (#229) y #222 juntos, 1 en 1-40 (s32) y 5 en 1-200 (s32, s64, s68, s141, s190); sin #222, esos mapas daban 5 y 20. `sendaBajoElRelieve` 227 → 231 en 1-200 (otro vestido de las sendas apartadas), 50 en 1-40. La casilla de barrera que tapa una pared por el centro tiene formación (`casillasDeBarreraSinFormacion`, 3 → 0 en 1-200). La senda tapada por una pared que tapa encima un objeto no cuenta como bajo el relieve (`loQueTapa`). **El nodo entre dos niveles sin camino es una rampa** (#143): su bajada va por su eje (`tramosDeLasRampas`), sin senda que seguir (`deUnNodo`): la tierra la lleva la pieza. Una cordillera sin cumbre (no cupo) con más de `MAS_CUMBRES` picos a 0,8 del mayor sube el más alto que pueda, sin azar (`unoQueDomine`). `informe.celdasMalCubiertas`, `bajadasSinPieza`, `bajadasTapadas`, `bajadasSobreNodo`, `rampasDesviadas` y `nodosSinRampa` = 0. Como la pared no se aparta, es el trazado del núcleo el que se aparta de su pie (#189): `recargosDelTrazado` (`vestir.ts`) cobra 3 rectos de más por un acantilado al N, NO o NE de la casilla, 1 por una montaña o un bosque y 2 por el borde del mapa (una Y junto a una hoja cobra también el mayor de sus esquinas). Y la senda pintada se aparta, dentro de su casilla, de lo que la tapa (#206, `apartarDeLoQueTapa`, `sendas.ts`): por eso las paredes (laderas, diagonales y frontales; las frontales con su propio azar) se ponen **antes** que la senda y su pedregal después; cada punto bajo una (`loQueTapa`, la misma regla que el contador) se corre hasta `APARTE_DE_LO_QUE_TAPA` (0,35) al lado libre, en rampas de una casilla, sin mover sus extremos, ni lo que va junto a la rampa de una bajada, ni pasar a una casilla de barrera o de edificio, ni arrimarse más de lo que estaba a un acantilado, un muro o una cordillera a menos de media casilla (`LEJOS_DE_LA_BARRERA`: la roca de lo alto de #205, la línea de la muralla y las cumbres de #204); dos pasadas, que miran la senda de partida. `informe.sendaBajoElRelieve` (tramos de ≥ `SENDA_CORTADA` con la huella entera bajo la silueta de una frontal, ladera o diagonal) no es 0: techo de media 5 por mapa (1,2 en 1-40 con menos mesetas, #210; 4,5 antes; 6,3 sin apartarla, con los niveles del mapa de #143; 9,1 antes; 12,5 antes de #189).
  **Las caras** (`caras.ts`, #159): la cara de un acantilado no es la banda entera: por columna, cada `PASO_DE_CARA` (0,05), se pinta el tramo seguido que tapan sus paredes, de lo alto de su silueta (`Modulo.perfil`, 32 franjas que deriva `pnpm taller catalogo-escena` con `perfilDeModulo`) a lo bajo de su caja, con juntas de hasta 0,15 (`pintadaDeCara`). Donde no hay pared, se ve el suelo de abajo. El pedregal de una cara sin pared ni ladera a 0,3 toma el tono de su suelo (`tonoDelPedregalSuelto`, #170). `informe.carasLisas` = 0.
  **Las laderas** (§20): cada cadena E u O lleva `laderas-<material>-<lado>-<caída>` (nunca espejada; caída > 3 usa la de 3), corrida media fila, con `inicio` al norte y `fin` al sur donde remata —sigue de espaldas o con una caída menor; en el borde del mapa no remata, el desnivel sigue fuera del marco (#212)— y `medio`/`largo` sin repetir el vecino. La `esquina` de §20 ya no entra (dobla la diagonal). Cada módulo trae sus `JuntasDeLadera`, registradas sobre la guía por `pnpm taller derivar-relieve` (también las de las diagonales y las bajadas) y comprobadas al cargar el catálogo (`catalogoValidado`); `colocarLadera` pone el filo en `bordeDeLadera` y el pie en `pieDeLadera`, sin correrse ni encogerse; lo que no entra se prueba con un `medio`. Un barranco de una casilla no lleva laderas (`sinBarrancos`): van los peñascos del canto. `informe.laderasEnfrentadas` = 0.
  **Los acantilados y el relieve** (`relieve`, #143): el nivel es del mapa y la escena lo aplica sin inventar nada. Lo que se pisa va al de su región; un nodo, al de sus regiones y, entre dos niveles, el paso sin camino al alto: es un hueco en el borde de la meseta y su rampa baja de él (al bajo era un pozo con paredes a los lados, s443 (25,10)); el nodo con camino y la ciudad, al bajo (al alto, las rampas de camino dejaban lo alto del acantilado sin roca); cada casilla de barrera, al más alto de **las dos regiones que separa ahí** (las más cercanas por dentro de su franja 8-conexa; `nivelesDelRelieve`, en `core`, la misma regla que mira el generador): **el acantilado es el borde de la meseta**, a su nivel y cubierto de roca, y la cara cae a su pie del lado bajo (por franja, el trozo entre un 1 y un 0 de una franja que tocaba un 2 lejos subía a 2, una cresta: s1 (14-18, 1-9)); **el agua, plana y sin encajar** (#210): cada franja a ras de la más baja de las regiones que toca, la de dentro de una región a ras de ella (encajada un nivel bajo su orilla más baja dejaba toda lengua de la orilla baja y toda ciudad del cruce por encima del agua, y entre dos mesetas cañones de caída 3: 351 lados en 10 semillas; ahora la caída máxima es 2 y entre dos regiones al mismo nivel el río va en el llano). Ninguna barrera ni nodo de una casilla de ancho queda por encima de sus dos vecinas de un eje: baja a lo más alto de ellas (el espolón de una montaña o un acantilado en lo bajo; el paso sin camino con agua a los lados, que entonces baja y su rampa sube de él). Fuera las crestas por encima de las dos orillas, los cañones entre dos llanos, las mesas, la escalera que subía lo que se pisa y el «+1 a ras» (`acantiladosARas`, #174, se retira con ellos; eran 98 de 258 franjas de acantilado entre dos llanos y 250 mesas en 1-40). `informe.nivelFueraDeSuRegion` y `desnivelesSinBarrera` (dos casillas vecinas que se pisan a distinto nivel sin ser la rampa de un nodo) = 0. **El borde de la meseta, entero** (#212, `bordes.ts`): la espalda (el reborde al norte, que la cámara no ve) de **toda** meseta, no solo del acantilado, lleva una hilera de peñascos de la roca de lo alto y la sombra del desnivel (abajo, #211); **el canto** (#219, `cantoDeLaEspalda`, `CANTO_DE_LA_ESPALDA`): cuatro por casilla, seguidos a lo largo del filo, el pie a 0,04-0,1 del lado y de 0,42-0,58 de alto, con su propia corriente de azar (también el módulo: con la de siempre movía toda la cubierta); en el acantilado, encima de su hilera de siempre. En 1-40, de 2,45 a 4,17 peñascos por casilla de reborde que se pisa o de acantilado (09-10-2026); donde no cabe ni el peñasco más bajo (una senda por el canto, la reserva de un objeto) queda como razón declarada; `informe.espaldasSinReborde` = 0 (eran 795 en 1-40). Las mesas de arenisca (`esMesa`: más anchas que `ANCHO_DE_MESA` = 1,3 veces su alto) son del acantilado y la cordillera de arena va con agujas (`informe.mesasEnLaCordillera` = 0, eran 1 444). La ladera sigue leyéndose como cresta por su dibujo: el arte está pedido (`docs/art/peticiones.md` §34). **Lo alto lleva roca** (#205) **de su cara** (#212, `materialDeLaCima`: la de la casilla más cercana de su franja que cae a la vista; con la de su suelo, s57 llevaba picos grises sobre un cantil de arenisca; `informe.cimaDeOtroMaterial` = 0, eran 1 431 en 1-40): cada casilla de acantilado, un pico de esa roca de `ALTO_DE_LO_ALTO` (0,4) o más, y dos en el borde de una meseta y tres dentro (`cimaDeRoca`, `picosDeLaCima`), donde quepan sin pisar senda, paso ni reserva; en lo alto de la arena y la lava (`comoLaBarrera`) la cubierta del relleno se cambia por roca (`rocaEnLoAlto`). Todo eso, con su propia corriente de azar (`azarDeLoAlto`): con la de siempre movía las cordilleras que se visten después. `informe.acantiladosLisos` (casillas de acantilado sin roca ni masa de 0,4, fuera de la huella de un objeto) = 0 salvo 2 en 1-40, entre dos sendas (eran 1 167 de 4 016). **La pared, de la roca de su meseta y entera por delante de la cordillera** (#216, `bordes.ts`): la casilla de barrera alta lleva el nivel de su lado alto pero su suelo (`Analisis.suelo`) es el más cercano de cualquier nivel, a menudo el de abajo; la roca de la pared, de lo alto (`materialDeLaCima`) y de cada macizo (`materialDeLosMacizos`) sale de `sueloDeLaMeseta`: lo que se pisa más cercano **a su nivel**, sin los nodos (la meseta de arena de s5 (2-8, 27-31) acababa en una pared gris; `informe.caraDeOtroMaterial` = 0, eran 806 de 2 506 paredes en 1-40). El suelo pintado bajo la barrera sigue siendo el más cercano. Y ninguna masa (pico o árbol) que se pinte después de una pared del desnivel cubre su silueta (`formasDeLasParedes`, en `obstaculos`: columnas por el perfil, `MARGEN_DE_LA_PARED` 0,05): se encoge o no va; lo de detrás no se mira, lo tapa la pared. `informe.paredesTapadas` (`paredesTapadasPorLaMasa`, frontales, laderas y diagonales sin pedregal ni bajadas) = 0 en 1-40 (eran 653 de 1 939; bajo una montaña, 424 de 757, un 24 % de su silueta). Las casillas de montaña sin un pico de 0,6 pasan del 26,9 al 28,0 % (08-10-2026). **El agua se lee al alejar** (#205): más clara y azul (`FILTRO_DEL_AGUA`, `pintar.ts`), la ciénaga algo más oscura y su niebla a 0,1.
  **Los puentes** (`puentes.ts`): `analizar` decide qué nodos llevan puente (`Analisis.puentes`: los de barrera `water` del mapa; `pasos`, esa barrera y el eje, sobre el terreno del mapa) y su casilla es agua en la escena (`Analisis.terreno`). La pieza `puente-<piedra|troncos>-<eje>[-sube]` sale de las orillas que une (`puenteDe`), de piedra si lleva camino; los quebrados —los planes del agente y el ~1 % del procedimental sin eje— se asientan con `asentar` (escala 0,7-1,15, el medio del tablero como se ve en la casilla del nodo). Se apoya por el centro del tablero con las medidas de su JSON (`pxPorCasilla`, `alturaDelTablero`, `largoDelTablero`, `pnpm taller derivar-puentes`). La senda acaba en sus estribos (`tramosHastaLosEstribos`) y llega por tierra (`Escena.vados`, `informe.sendasDeEstriboEnAgua` = 0). La pared que cruza la línea del puente por dentro de su filo no lleva pieza (`celdasBajoLosPuentes`); la que solo toca, por detrás del puente (#222). **Qué tapa un tablero** es una regla, la del pintor (`vaDelante`: `esVolumen` y `ordenDeVolumenes` de `separar`), en el pasillo de lo que se aparta y en `ponerPared`; la cara se pinta solo bajo la silueta de su pared (`CaraDeEscena.pintada`, `caras.ts`). `informe.puentesTapados` = 0, contado desde el orden del pintor. La marca del dueño cuelga de `Escenario.asientoDeObjeto`, siempre un punto, y la bandera se planta en el tablero (`Puente.mastil`); quien pisa un puente se pinta en él (`pisada`). Un clic sobre el tablero va al nodo (`puenteBajo`) solo si debajo hay agua o la casilla del nodo: la tierra de una orilla manda.
- **La base es un escenario lateral** (`escenas/castillo.ts`, `render/base/`), como el de
  combate sin casillas: delante una franja de 3,5 pasos de fondo (la mitad de la rejilla) por
  la que se anda en recta con el ratón, resbalando por el borde de atrás (`alaFranja` en cada
  fotograma), y la cámara sigue en horizontal con tope (`camaraQuieta`, `seguir`). **Detrás, la
  plaza es un solo cuadro** (vuelta 3): `tramos` (5) cuadros de 1536×1024 a 128 px por paso,
  pedidos cada uno por separado y cosidos por una **junta**: en cada borde que da a otro tramo, la
  guía pide un árbol alto con su pilar (`JUNTA`, `tools/taller/base.ts`), y el tramo siguiente se
  monta `SOLAPE` (64 px) sobre él, fundido hoja con hoja (con la placa de al lado como `contigua`,
  o su final pintado en el lienzo, Codex pintaba la plaza a otra altura: costura de F2). **El suelo
  es del juego**: un solo empedrado repetible (`suelo.webp`, de las columnas del medio de una placa,
  cosido por la costura de menor diferencia, `sueloRepetible`) va debajo de todo, y de cada tramo
  se pinta solo lo de encima de su pie (`lineaDelPie`, columna a columna, que solo yerra hacia
  abajo; `tramo-<n>.webp`, derivado), bajado lo suyo (`bajar`, uno por tramo: la mediana de sus
  puertas en la raya). Cada tramo se pide con todos sus edificios a la vez (el *maestro*) y otra
  vez sin ellos (la *placa*, `fuentes/placa-t<n>.webp`); cada edificio sale del maestro (o de su
  edición, las mejoras) por la diferencia con la placa en la región de su sitio, cortado por el pie
  de su cuadro, y se pinta en su sitio exacto, sin escala ni ancla (`recortarLaBase`; el índice
  `indice.json` es derivado y trae hecho lo que se deriva del cuadro: el solape fundido de cada tramo y el color del cielo; el cliente no crea lienzos al cargar). **Manda el cuadro**: el umbral de la
  puerta y la región de cada sitio se miden sobre el maestro y se escriben en
  `data/bases/<f>.json` en píxeles de su tramo; `planoDelCuadro` es la única cuenta de píxel a
  escenario. El
  borde de atrás de lo que se pisa une los umbrales (`bordeDeAtras`) y no es convexo.
  `leerDisposicion` lanza con regiones que salen de su tramo o se pisan, puertas fuera de su
  región o a más de 1,5 pasos de la raya, y lo que no se pisa. El paso es el del combate en ese
  lienzo (`pasoDeLaBase` → `escalaDelCombate`) y el suelo va a 25°: un adulto mide lo mismo en la
  base que en una batalla. Toda figura va delante de todo edificio. Un sitio sin construir enseña
  la placa. Camina el héroe si está dentro y, si no, el alcaide; un clic lleva a la puerta y, al
  llegar, el ayuntamiento o el castillo abren «Ampliar», una morada su reclutamiento y una
  persona la conversación (`<dialog id="conversacion">`). La gente se pinta con el Y Bot sin
  armas (`CUERPO_DE_VECINO`). Qué se levanta en cada sitio es del núcleo (`sitiosDeLaBase`);
  dónde, del JSON, que **el núcleo no lee**. Contratar no pide taberna. Taller: `encolar --base
  templarios`, `recortar-base`, `medir-base`, `vista-base`; las fuentes (maestros,
  ediciones, guías con la silueta del adulto como vara de medir, hojas de identidad) en
  `assets/bases/<f>/fuentes/`, fuera del build. Sin placa, un tramo pinta su marcador. **Los
  templarios heredan el arte de los caballeros** (19-10-2026): sus moradas van en los sitios que
  ese arte pinta (Pueblo 1, Forja 3, Establos 5 y Monasterio 6; el 2 y el 4, sin edificio) y su
  índice está rederivado; no muertos, imperio, elfos y orkos van con marcadores enteros (índice
  vacío). Una morada ofrece cada unidad que produce.
- **Arena** (`pnpm arena`): **edita el catálogo del juego** (19-10-2026, decisión del usuario) y
  monta peleas con sus reglas. Las unidades son las de `data/unidades.json` y las piezas, las de
  `data/equipo.json`: «Guardar» escribe los dos en una operación (`escribirCatalogo`,
  `tools/arena/borrador.ts`), validados con la regla de la carga del juego (`leerCatalogos`,
  `moradasBlocker`), conservando su `_comment` y sin recargar la página (`handleHotUpdate` por
  contenido, `vite.config.ts`); si algo no vale no escribe ninguno, y uno ilegible no se pisa.
  Guardar cambia lo que se recluta y se compra en `pnpm dev`. La arena construida (sin servidor) lee
  el catálogo del núcleo y no guarda. **Solo las cinco facciones**, toda
  unidad de una casilla y sin munición. **Sin compatibilidad hacia atrás** (14-10-2026: «estamos en
  pleno desarrollo»): el catálogo y el enlace se leen solo en el formato de hoy; una unidad del
  catálogo que no vale (editada a mano) no deja arrancar la página, que dice por qué (`arranque.ts`).
  Es también el banco
  de combate: un héroe por lado con libro (`heroeDeArena`, con el equipo base), y **pelea como el
  juego** (19-10-2026): sin interruptores; un `?reglas=`, `?golpe=` o `?contacto=` se rechaza
  diciéndolo («la arena pelea con las reglas del juego: quita «?reglas=» de la dirección»,
  `retiradosDeLaURL`) y el enlace que lo trae no se monta. Lo suyo: la muralla, retocar cifras a
  media pelea y que quién mueve es del **bando entero** (Yo / IA en su cabecera; con un solo bando
  de la persona, la rueda dice «Tu golpe»). Monta sus unidades como stacks del catálogo de la pelea
  (`catalogoDelMontaje`; dos unidades distintas con el mismo id lanzan). «Copiar enlace de la
  pelea» escribe el montaje entero (`?montaje=`, versión 13, `VERSION_DEL_ENLACE`, leída estricta:
  unidades con cuerpo y equipo, puestos `{ unidad }` y todas las piezas que lleva lo montado con sus
  bases en cadena, `piezasDelMontaje`); al abrirlo, sus piezas entran en el catálogo de la página
  como cambios sin guardar, con la regla de editarlas a mano (`conPiezas`, `cambioDePiezas`), y la
  barra dice cuántas cambia. **Un enlace de otra versión se rechaza** («este enlace es de una
  versión anterior: vuelve a copiarlo»), sin convertir nada; cambiar el formato o las reglas es
  subir la versión. Abrirlo lo monta sin luchar. **Cuerpo y equipo** (12-10-2026, ciclo 2 del
  nivel único): una unidad es un cuerpo (`cuerpo: { hoja }`, el arte con que se pinta) más su
  equipo (cinco huecos, `data/equipo.json`), y pelea con las dos cosas (`unidadDeCombate` →
  `conEquipo`); de las dos sale el nivel, y del nivel su coste (la ficha lo lee: «Coste»). Las hojas de un personaje (`Hoja.personaje`) comparten cuerpo y velocidad
  (`VELOCIDAD_DEL_CUERPO`, `tools/arena/velocidades.ts`). «Nueva unidad» (`unidadNueva`) crea desde
  una hoja entera una unidad `<hoja>-<n>`, con el cuerpo común y la Espada (`ESPADA`) por todo
  equipo, con el `n` libre también entre las que no valen (`IdsOcupados`); nace en el nivel que dé
  su índice y la barra lo lee de él (`avisoDeNuevaUnidad`); su arte es el de su cuerpo
  (`cuerpo.hoja`, nunca el Y Bot en lugar del arte); sin `edificio`, la partida no la recluta. Un
  catálogo con solo unidades que no valen se dice leído (`avisoDelCatalogoLeido`). **La muralla de
  la arena** (`battle/muralla.ts`, formas en `data/borradores/murallas.json`, `arena-murallas.ts`):
  muros altos donde suben los de dentro y los atacantes con escalera o el rasgo `escalar`, puertas
  entre dos casillas que abre y cierra quien defiende, sin tiro a través en el suelo; un tirador en
  lo alto suma `defensaEnLoAlto` (`data/muralla.json`, inventado), que pone `opcionesDeDanio` y por
  eso lo cuentan igual el golpe, la IA, la ficha y la previsión. Las batallas del mapa van sin
  muralla (`SIN_MURALLA`). **Poderes** (11-10-2026; también en el juego): una unidad con Curar o
  Bendecir los usa en su turno (jugada `power`, cierra el turno, no tras moverse). En la batalla,
  «Editar» del panel abre la ficha del tipo o del héroe y el cambio vale en la pelea y en el
  catálogo. Velocidad en casillas (`escalonDeCasillas`). **El nivel no se escribe** (12-10-2026): la
  ficha enseña «Índice N · nivel n» (`lecturaDelNivel`), que se recalcula al tocar cualquier cifra o
  pieza; una unidad con `level` no vale. `SesionDeArena` vive en `session.ts`. **La vista de
  edición** («Editar fichas», `arena/edicion.ts`): las
  fichas que se quieran, sin tope (12-10-2026), las mismas del montaje (`fichaDe`), recordadas en
  `localStorage`, en tres columnas como mucho y las demás debajo; la vista se desplaza entera, como
  una página, sin regiones ni fichas con scroll propio. Un gesto de ficha escribe en la ficha que lo
  contiene (`fichaDelElemento`, por `data-clave-de-ficha`), qué se abre lo dice `abrirFichaBlocker`,
  un cambio repinta solo su ficha, nunca en `elegida`, y cada retrato anima y gira el suyo
  (`animDeFicha`). La lista solo se pliega con su botón (`listaPlegadaTras`). **La ficha**, una sola
  disposición en el montaje, la edición y el combate: el título es el nombre con «✎ Editar»
  (`renombrar`; Intro guarda, Escape no; sin campo «Nombre» entre las cifras), arriba la figura con
  sus clips en columna y las cifras a la derecha (en una columna estrecha, debajo: `@container`;
  en combate, sin figura), y los rasgos del motor como las habilidades: etiquetas con × y el resto
  en un desplegable. **Las cifras, en una tabla de una columna** (13-10-2026, `tablaDeCifras`): el
  nivel arriba («Índice N · nivel n») y una fila por cifra con rótulo corto, la casilla que se
  escribe (el cuerpo; en el héroe, sus cuatro, y las de su cuerpo sin casilla) y el **final**, un
  `<output>` que no se escribe, con todo lo que suma (`unidadDeCombate`; en el héroe, su cuerpo con
  rango y equipo base), en otro tono si cambia. Sin «En la pelea» ni párrafos de nota: **toda
  aclaración es un tooltip** (`nota`, `views/panels.ts`: un «ⓘ» con `aria-label` y sin `title`,
  que se enseña en un bocadillo junto a él al pasar el ratón, al tocarlo o con el foco del teclado en
  él —nunca con el foco de una casilla: tapaba lo que se escribía—, anclado con `position-area`), en
  la fila, en la cabecera de la columna, en el título de cada sección, en el de la ficha (lo que
  decía su pie) y en cada poder; también en el editor de equipo. La casilla cabe cinco cifras (en
  `ch`), las cabeceras van en una línea y, si a su lado no cabe la tabla entera, va debajo de la
  figura (`flex-wrap`); lo vigila `cifrasCortadas` (`tools/qa/cifras-de-la-ficha.ts`) en
  `pnpm capturas`. La pastilla de modificador tiene letra y tamaño propios (12 px) en todas partes. **Lo que suma una pieza tiene una forma**: `modificadoresDePieza` (`hero/equipo.ts`, una
  lista en el orden de `CIFRAS_DE_PIEZA`, con `NOMBRE_DE_CIFRA`, los rótulos de la tabla) y
  `textoDeModificador` (signo siempre, el único que formatea); en pantalla, `modificadoresEnPantalla`
  (una pastilla por cifra, en la ficha, el editor de equipo y los paneles del juego), y donde no cabe
  marcado (un `<option>`, el agente), `cifrasDePieza`, el mismo texto con comas. Una unidad con el arte a medias (el taller generándola)
  se lista como incompleta con su motivo y no se monta —nunca el Y Bot en su
  lugar—; `vite build` lo avisa y no falla (`arteEnOchoDirecciones`, #140). **El editor de
  equipo** («Editar equipo», escena `equipo`, también desde el panel de la pelea; 18-10-2026): el
  catálogo entero, en cuatro secciones por tipo —Cuerpo a cuerpo (`arma` y `lanza`), A distancia,
  Armadura y Escudo—, con el sello «armería», «botín» o «solo en kits», y la ficha de la elegida con
  solo los campos de su tipo (`camposDelHueco`), un precio en oro y dos casillas «Se consigue».
  Una pieza puede ir **sobre otra** de su hueco (desplegable «Base», con la cadena dicha: Espada →
  Espada de herrería → Espada bendita); cada cifra se escribe como extra y su final va al lado, y el
  vínculo es vivo (cambiar la base cambia lo que cuelga de ella y a quien lo lleva). Las de cuerpo a
  cuerpo llevan «Rueda del golpe» (niveles absolutos, vuelta 2 del 18-10-2026): una barra por tipo del
  anillo (sin Normal, siempre ×1) de 0 a 6, llena desde la izquierda hasta el nivel, con «−» (baja un
  nivel, peor) y «+» (sube, mejor; también en la Finta, donde mejor es restar menos), que no pasan de
  0 ni de 6, y lo que da ese nivel al lado («Daño ×1,5», «resta 1 a 5 casillas»); sin base, la
  casilla es el nivel, y con base, lo que lo sube o lo baja (la barra, el final; uno fuera de 0 a 6 no
  vale, con su motivo). Un arma nueva nace con todo a 3, como la Espada. Al lado, la rueda del combate
  teñida por nivel (el mismo tono para el mismo nivel en toda arma, del rojo del 0 al verde del 6),
  solo para leer (`ruedaDeLaPieza`, en `rueda/disco.ts`, la geometría que comparte con
  `rueda/rueda.ts`). «+ Nueva pieza», «Duplicar», «Nueva sobre esta» y «Borrar» (no se borra la base
  de otra, ni la que alguien lleva, ni la última de botín); quien lleva una pieza suma lo que da y su
  nivel lo ve. A media pelea, el cambio vale ya para todos los que la llevan, de los dos bandos y el
  héroe, con lo gastado restado, y queda en el parte; la IA espera.

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
| `npx tsx tools/qa/rectitud.ts` | ~50 s | si tocas `generate.ts` o `vestir.ts`: tramos rectos en **1-3000**, tres procesos por bloques de 1000, con los largos a escala (`largoALaEscala`, en `core/escala.ts`; en 42×42: ≥ 10 ≤ 176, caras ≥ 10 ≤ 3, mapas con tramo ≥ 12 ≤ 15; desde #231 lo medido, 143 / 0 / 12, más 10 / 3 / 3, y con #232, 164 / 0 / 14: los mapas que se visten otra vez, al ritmo de los que no cambian; con los ríos (#144), 95 / 0 / 4, con el río de una casilla, 90 / 0 / 5, y también entre dos niveles, 102 / 0 / 5; con el río continuo, 102 / 0 / 5, y sin agua de frontera fuera de él, 118 / 0 / 10, y con el río de lago de 20, 121 / 0 / 12; con #230 eran 174 / 14 / 14 y una perturbación neutra del azar movía hasta 21 tramos: si un cambio del azar lo pasa, se vuelve a medir con su fila en `TECHOS`). El guardia, en `test/rectitud.test.ts` (orden lenta) |
| `enfrentamiento.ts` | ~2 s | si cambias cómo decide la IA de batalla: entra solo con el intervalo entero > 50 % en 5 000 parejas |
| `npx tsx tools/qa/arena-ia.ts` | ~2 s | si tocas el movimiento de la batalla, salir del contacto, la carga, la rueda o la armadura: 100 peleas por variante con unidades del catálogo, IA contra IA (peleas sin terminar, rondas, tiempo, cargas, cruces y golpes parados) |

- **Presupuesto de pruebas** (la máquina es compartida: varias sesiones prueban a la vez y
  con carga 30+ vitest falla por timeouts y hay que repetir). Mientras se itera, solo el test de lo
  que se toca (`pnpm vitest run test/x.test.ts`); `pnpm verify`, una vez por tanda de cambios;
  `verify:lento`, `capturas` y `banco`, **una vez al cerrar** (y no se repiten si nada cambió
  desde el último verde: se citan). Las medidas, en 1-40 o 1-100 semillas; 1-1000 solo si la
  tarea lo pide (rectitud, raros de verdad). Las pruebas al azar del QA, en cientos, no en miles.
  Un `verify:lento` que sale 1 solo por «Timeout calling onTaskUpdate» con todo en verde se dice
  y se repite una vez, no en bucle.
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
- **Facciones del juego**: las cinco de la arena —templarios, no muertos, imperio, elfos y orkos— (19-10-2026); caballeros y nigromantes se retiraron.
- **Una cita a la fuente se extrae, no se teclea**: una cita falsa es peor que
  una cifra declaradamente inventada.
