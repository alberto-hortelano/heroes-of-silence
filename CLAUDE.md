# Heroes of Silence — guía de desarrollo

Clon de Heroes of Might and Magic 2 en el navegador, pensado como **banco de
pruebas para un juego con IA**: los NPCs los lleva un agente conectado por MCP,
los mapas los diseña ese mismo agente y el arte lo pinta el taller (`pnpm taller`) con Codex.

**El porqué de cada regla, las medidas con su fecha y las lecciones de QA están
en `docs/historia.md`.** Antes de deshacer algo que parezca raro, búscalo allí.

**No se prueba la jugabilidad** (23-10-2026, decisión del usuario: «El sistema está en pleno
desarrollo, no tiene sentido probar la jugabilidad. No hay magia, personajes y equipos están hechos
a ojo»). El equilibrio, la duración de las partidas, si da tiempo a jugar una trama o un lugar, qué
decide la IA y si una facción gana más **no son hallazgos ni criterios de aceptación**: con el
sistema sin terminar no significarían nada. Se prueba que las reglas hagan lo que dicen (validación,
rechazos, sumas, fronteras) y que lo que se ve funcione; una medida de jugabilidad, solo si la tarea
es medir.

## Arrancar

```bash
pnpm install
pnpm dev        # cliente en http://localhost:3100 (juego local contra la IA de reglas): `/` abre el menú de inicio
pnpm mirar      # /espectador/: mira la partida del agente contra el servidor
pnpm arena      # /arena/: edita el catálogo del juego (unidades y equipo) y monta peleas
pnpm verify     # typecheck + lint + todos los tests: lo corre CI, no las sesiones (ver «Control de calidad»)
pnpm verify:lento  # lo mismo con todas las semillas y todo el arte rederivado, ~75 s; corre en CI
pnpm test | pnpm typecheck | pnpm lint | pnpm format
pnpm banco      # 20 partidas: tiempo y sha256 del volcado, anclado en el fichero
pnpm marcas     # fallos del mapa marcados en pnpm dev (M o «Marcar»): lista, ver <id>, resolver <id> <ref>, recorte <id>
pnpm mundo nuevo|leer|validar <id>   # los mundos (assets/mundos/<id>/): plan congelado, lectura para el motor, la validación de la página y la biblia
pnpm mundo medir <id>…               # cuánta trama lleva: lugares y regiones, marcas que cruzan, lugares encadenados, desenlaces, niveles por persona
pnpm npcs estado|pedir <f.json>|encolar [id…]|rehacer <id>|trabajar   # el banco de figuras de NPC (data/npcs.json, assets/npcs/): pedir, repescar, rehacer y pintar con Codex
pnpm qa         # circuito entero del agente (mapa, servidor, puente MCP), ~3 s
pnpm capturas   # juega cliente, espectador y arena en Chromium con clics reales, ~245 s; deja los PNG en .cache/capturas/ o en la carpeta que se le pase
npx tsx tools/qa/medidas/barrido-semillas.ts   # cuántas de 4 partidas no terminan (hoy 0)
npx tsx tools/qa/medidas/enfrentamiento.ts     # IA de batalla de hoy contra su versión anterior
npx tsx tools/qa/navegador/neutro.ts [ref]       # el estilo sin tema, igual que en las hojas de un ref (HEAD), ~10 s
npx tsx tools/qa/navegador/clima.ts [carpeta]    # el clima en los tres escenarios, la niebla de guerra, el rayo y los fps (.cache/clima/)
npx tsx tools/fuentes/bajar.ts         # las letras de los temas que falten (google/fonts, sha256) y rehace src/client/fuentes.css
```

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
- **`?clima=` fuerza el clima para mirarlo** (22-10-2026) en la partida, la arena y el espectador:
  un tiempo (`despejado`, `niebla`, `lluvia`, `tormenta`), `noche` o `dia`, y lo mismo para una
  región (`region-0:tormenta`), separados por comas (`parseClima`; uno que no existe se rechaza
  diciendo qué vale, y una región que el mapa no tiene, cuáles hay: `validarForzado`, al fijarlo; en
  la arena, una región, «la arena no tiene regiones»; las tres páginas lo leen con
  `comun/clima-de-la-url.ts`). Fuerza lo que se pinta, no la noche que leen las reglas, y
  `hayQuePreguntar` no lo mira: con el menú, lo que no se entiende se dice al cargar (`pedirPartida`)
  y una región que el mapa no tiene, al abrir la partida, pidiendo quitar solo `?clima=`. `pnpm capturas` abre toda partida y todo espectador con
  `clima=despejado,dia`, decidido una vez para su navegador (`conElClimaDespejado`): `despejado`
  solo fija el tiempo, y la noche de la semilla seguía en sus regiones.
- **`?mundo=<id>` juega un mundo** (F1a del mapa vivo, 22-10-2026, `core/mundo/`): su plan
  congelado, su semilla, su facción, su héroe y sus lugares. Lo carga y lo valida `entrada.ts` antes
  que `main.ts` (`partida/mundo.ts`); uno roto lo pinta `comun/arranque.ts` con todos sus problemas, y con
  `?seed=`, `?faccion=` o `?heroe=` al lado se rechaza diciéndolo; la complejidad del combate
  (`?tropa=`, `?rueda=`, `?solo-heroe=`) y `?clima=` sí van con él (son de quien juega, no del mundo:
  `partidaDelMundo(…, combate)`). Su héroe es el de su `mundo.json`, ya pagado (el menú ya no lo
  elige: el mundo nuevo lleva el de por defecto de la facción), y no se elige ante el ayuntamiento.
  En `pnpm dev`, «Empezar» (tras la facción y la complejidad) lleva a «El mundo»
  (`desarrollo/mundo.ts`): tamaño (con cuántos lugares, `TAMAÑOS_DE_UN_MUNDO`) y rivales (fijos
  en 1); «Jugar sin historia» abre la base ante el ayuntamiento, como sin mundo; «Generar el mundo»
  congela el plan y lanza Claude Code sin pantalla con la skill `motor-de-mundos` (`POST /__mundos`,
  `tools/mundo/motor.ts`, la orden de `HEROES_MOTOR`, `claude` por defecto; **Opus con esfuerzo
  `high`**, fijos en `argumentosDelMotor` (con `xhigh` tardaba 19 y 24 min con 6 lugares y 28 con 7; decisión del usuario, 23-10-2026), y un tope de 60 min, el doble de eso; su stream entero queda en `.cache/mundos/<id>/motor.jsonl`), que
  escribe **primero la biblia** (`biblia.md`, la trama en prosa: qué pasó, quién es quién, la trama
  que cruza tres lugares o más y dos desenlaces que se excluyen) **y después la historia**
  (`historia.json`), y relee una contra otra (la trama de los mundos, 22-10-2026); con una espera que
  enseña el progreso («escribe la biblia», «escribe la historia», el tiempo en minutos; «tarda de 15 a 30 minutos»); si falla,
  «Jugar el procedimental». Los generados (`gen-*`) no van a git ni ningún mundo al build; `prueba`
  (a mano, para los tests) y `ejemplo` se commitean, los dos con una biblia escrita a mano hasta que
  `ejemplo` se regenere con el motor nuevo (tras fusionar el banco de NPC).
- **`vite build` copia `assets/` sin lo que solo lee el taller**: de cada
  `unidades/<id>/dN/`, solo `atlas.webp`; ninguna carpeta `fuentes/` ni `_guias/`, a cualquier altura;
  y nada de `art/` (láminas y referencias de estilo) (`seCopiaAlBuild`, `tools/vite/publico.ts`,
  #137). Por eso las letras de los temas viven en `assets/letras/`.
- **CI** (`.github/workflows/ci.yml`): `pnpm verify`, `pnpm test:lento`, `pnpm banco`,
  `vite build` y `pnpm qa`. No gasta un céntimo: no llama a ningún servicio de pago.
- **Ninguna sesión corre la suite entera** (25-10-2026, decisión del usuario: «Elimina el verify
  completo. Los tests se hacen por partes y justificando cada parte»). El hook `Stop` que lanzaba
  `pnpm verify` al acabar cada turno se retiró: con varias sesiones a la vez se juntaban varios de
  16 procesos y, a las 22:00 de ese día, la memoria se agotó y earlyoom mató la app de Claude y
  Chrome. La suite entera la corre CI.

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
  unidad/formato.ts  el formato de una unidad (cuerpo + equipo) y su validación
  unidad/catalogo.ts el catálogo del juego: lo único que lee data/unidades.json
  arena.ts         el montador de la arena: fichas, piezas, montaje, enlace y retoque
  battle/          rejilla de 12 y 11 (board.ts), iniciativa, daño, armas, rueda,
                   contacto, carga, hechizos, poderes, efectos
  map/             mapa, pathfinding (frontera.ts), niebla, generación (generate.ts,
                   vestir.ts) y red de nodos (regiones.ts)
  town/ hero/      castillos, edificios, reclutamiento; héroes, tropa, experiencia, equipo
  state/           GameState, turnos, batallas del mapa, asaltantes
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod, serialización y vocabulario (huecos, golpes) del agente
  mundo/           los mundos: formato y vocabulario cerrado, validación, reglas de los lugares,
                   lectura para el motor
src/server/        bridge WebSocket + puente MCP (partida.ts, director, entorno.ts)
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  comun/html.ts          LA PUERTA del marcado
  sesion/partida.ts       LA PUERTA al núcleo
  escenas/ render/ views/   ratón y cámara; lo que se pinta; paneles
  rueda/           la rueda del golpe (diálogo, disco, figuras) de partida, arena y espectador
  espectador/      mira la partida del servidor, no juega (adaptar.ts, paneles.ts)
  arena/           edita el catálogo del juego y monta peleas con sus reglas
src/shared/        contrato visual (cámara a 25°, luz) de cliente y taller
tools/mundo/       pnpm mundo y el motor de narrativa que genera un mundo desde el menú de pnpm dev
tools/npcs/        pnpm npcs: el banco de figuras de NPC en disco (banco.ts) y la semilla
tools/qa/          verificación de extremo a extremo y medidas
tools/datos/       extrae JSON de NuevaJugabilidad.md con expresiones regulares
tools/arena/ tools/taller/ tools/art/   arena, taller de arte, rig del Y Bot
data/              unidades, equipo, edificios, economía, hechizos, experiencia… en JSON editable
assets/            arte (generated/, unidades/, npcs/ del banco de NPC, mapa/, _poses/ del Y Bot), letras/ y temas/ de los
                   temas de la interfaz; art/ (láminas y referencias de estilo) no va al build
docs/agents/<tarea>/   lo que se pasan los roles del ciclo
```

## Contratos que no se rompen

- **La lógica vive en `core` y el cliente solo pinta.** Quien aplica reglas pasa
  por `sesion/partida.ts`. El espectador no aplica ninguna: entra por
  `espectador/adaptar.ts`, la inversa exacta de la serialización del servidor.
- **`core` es puro**: nada de `node:*` ni DOM, ni `core` importando `src/server`.
- **Toda tirada pasa por `createRng(seed)`.** Ni un `Math.random`.
- **Sin coma flotante dependiente de la plataforma en `core`**: `Math` solo
  seguido de `min`, `max`, `floor`, `ceil`, `abs`, `round` o `imul`. Nada de
  `**`, `Math.pow` ni trigonometría. Es lo que hace el banco reproducible fuera
  de esta máquina.
- **Todo el marcado del cliente sale por `comun/html.ts`** y `pintar` es el único
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
  `entrada.ts`, que carga `main.ts` con un `import()` (la partida, antes, su pantalla de inicio,
  `partida/inicio/inicio.ts`, también con un `import()` y solo si la URL no pide partida: `hayQuePreguntar`,
  de `comun/semilla.ts`, que no importa nada) y, si el núcleo lanza al cargarse (una unidad
  rota en `data/unidades.json`), pinta el motivo entero (`comun/arranque.ts`, que no importa el núcleo).
  `tools/vite/arena.ts` carga el lado de disco de la arena a demanda, así que `pnpm dev` arranca igual.
  Lo vigila `test/arranque.test.ts`.
- **El juego se juega sin agente y sin arte**: sin agente juega `core/ai`; sin
  imágenes, cada renderizador pinta su marcador.
- **Un hecho, un sitio.** Si son dos caras, se escriben juntas en una función.
  Lo que el agente no puede comprobar se deriva, no se escribe a mano.
- **El Dijkstra desempata por orden de descubrimiento**, y `Frontera` es de una
  sola búsqueda (lanza si se reutiliza). Cambiarlo cambia las partidas; lo caza
  `pnpm banco`, no los tests.
- **La crónica**: `state.log` es `readonly` y `emit` (en `state/cronica.ts`,
  exportada solo a los módulos de la partida que nombra el guardia) hace el único
  `push`. Cada hecho lleva protagonista, sitio y sello `seen`. `game_over` es el
  último hecho por regla del núcleo. De una batalla sobrevive solo el resumen
  dentro de `battle_ended` (`resumenDeBatalla`: rondas, hechizos, bajas por bando,
  dueños; #93), no su registro.
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
| Dueño de un sitio del muro (paso, ciudad o pueblo en un nodo) | `tomarElNodo` (`state/game.ts`, 05-11-2026: juntó `captureNode` y `captureTown`; el único que escribe el `owner` de un objeto del mapa, lo vigila `invariantes.test.ts`; `Town.owner` se fue). Un sitio de dentro de una región no se toma: es de quien tenga la región |
| Ciudades y pueblos en su región, y la ocupación (05-11-2026, tarea 2 del puesto fronterizo, fase 1; `docs/agents/2026-11-05-ciudades-en-su-region/`) | **qué es nodo lo dice lo que toca** (`estructura`, `asentarLosSitios`, `map/regiones.ts`): una ciudad (por los accesos de sus puertas) o un pueblo (por sus ocho vecinas) que toca dos regiones o más es un nodo (`NodoDeRed.clase`: `paso`, `ciudad` o `pueblo`); el que toca una está dentro de ella (`Estructura.sitiosDeRegion`, y su casilla es de su región); un pueblo que parte su región se rechaza (`problemasDeRed`), y una base dentro de una región o una ciudad de región con dueño, también (`problemasDeLasCiudades`, `validateMapPlan`). **Dónde está**, nodo o región, una bifurcación, `dondeEsta` (y las regiones que toca, `regionesDelSitio`), que leen el dueño, la renta, la lectura del motor y `problemasDeLosPueblos`. **De quién es**, una regla, `dueñoDeUnSitio` (en la red; con la foto, `dueñoEnLaFoto`, y la foto sin lo unido a cada base, `dueñosDeLaRed`: la crónica de los sitios y el cable del espectador, una pasada), que leen `dueñoDelSitio` y `dueñoDeLaCiudad` (`state/sitios.ts`: lo que antes era `Town.owner`); si está en el muro, `enUnNodo`. **En el núcleo, el `owner` del objeto de una ciudad o un pueblo solo lo leen la red y `tomarElNodo`** (en uno de dentro de una región vale `null`; lo vigila `invariantes.test.ts` preguntando al compilador el tipo de lo que va antes del punto). **La ocupación**, `ocupanteDe` (un héroe de otro bando en su casilla, `heroeAjenoEn`, el de `enemyAt`, o una guarnición que no es del dueño, también la neutral; sin dueño, nadie; `Ocupante`, en `state/events.ts`) y su frase, `ocupadoBlocker` (los dos reciben el dueño si ya se sabe); el par dueño y ocupante, `comoEstaElSitio` (`SitioVisto`: el recuerdo, la foto de la crónica y el cable del espectador). **La ciudad que manda**, `ciudadQueMandaBlocker` (no es tuya, o su ocupación), que leen `recruit`, `build`, `contratarBlocker` y `buyBlocker` (la armería, desde el `/simplify` del 05-11-2026), la IA (`planBuildings`, `planRecruits`) y la pantalla (`Session.mandaEn`); la renta (`CiudadDeLaRenta.ocupada`, `PuebloDeLaRenta.ocupada`, oro 0), la IA (`valorDeRecuperar`) y la pantalla (`Session.ocupados`; la ficha de la ciudad, cada fila de la regla y no de la cifra cruda —lo que cobra de la renta, construir de `mandaEn`, el crecimiento a 0 con su nota y la guarnición ajena como su ocupante, `Session.ocupanteDeLaCiudad` con `ocupanteDicho`—, y la lista del lateral, la misma lectura, `sinCobrar` en `views/panels.ts`; vuelta 1 de QA, H1); lo que pinta el lienzo, cada ciudad y cada pueblo con el dueño sabido en `owner` y los ocupados, `conLosDueñosSabidos` (`render/mapa/sitios-sabidos.ts`: la sesión y el espectador, `sitiosDelCable`, una vez por fotograma del cable); el crecimiento, solo por `crecerLasMoradas`, que salta la ocupada (lo vigila `invariantes.test.ts`). **La crónica de los sitios**, `anotarLosSitios` (al acabar `applyAdventureAction` y `settleBattle`, comparando `fotoDeLosSitios`): `town_owner_changed`, `site_occupied` y `site_freed`. La batalla en un sitio, `sitioQueSeDefiende` (`{ sitio, suyo }`: la muralla del sitio de la casilla del defensor sea de quien sea, P3; la guarnición y lo que se entrega, solo si es suyo, `sitioDelHeroe`). El recuerdo de la niebla lleva el dueño y el ocupante que se vieron (`RememberedObject.sitio`, `recuerdoDe`). **Dónde las pone el generador** (fase 2): en un nodo, solo las bases y las ciudades-puente; las demás, `ciudadesDeRegion` (`generate.ts`, con `data/poblamiento.json`, que lee `POBLAMIENTO`), y su región traza sus caminos desde ella (`EntradaDeCaminos.centros`); lo vigila `test/ciudades-de-region.test.ts`. **El pueblo en el muro** (fase 3): el objeto `village` lleva `barrera` (la del muro que `buildMap` abre bajo él, como un nodo; `null` dentro de una región), solo sobre montaña, bosque o acantilado (`BARRERAS_DEL_PUEBLO`, `map.ts`), y lo que **cruza su barrera** por su eje, paso o pueblo del muro, se pregunta una vez, `cruzaSuBarrera` (`CruzaSuBarrera`; lo leen la escena —`pasoDeNodo`, `pasosALaVista`, el análisis, `sendasPorObjeto`, el óvalo del mapa— y el minimapa); «¿es un nodo?» es otra pregunta (la ciudad del muro también lo es), y la dice la red (`sitioEnUnNodo`, `NodoDeRed.clase`), que leen `murallasDelMapa` y `alrededorDeMurallas`; lo que no vale (sobre agua o muralla, sobre el muro tocando una región, entre dos sin muro) lo dice `problemasDeLosPueblos` (`validateMapPlan`), y **dónde no va**, ni en el borde del mapa ni a 2 casillas o menos de una ciudad (su recinto y los accesos de sus puertas), una regla, `puebloDelMuroBlocker` (`generate.ts`), la misma para el plan y para el generador (vuelta 1 de QA, H4). El generador lo pone en `POBLAMIENTO.pueblosEnUnNodo` de las parejas, una cuota por mapa (`pueblosEnElMuro`, `generate.ts`: el paso con camino de su región, en espejo, con la corriente del poblamiento; su sitio de dentro se sortea igual y queda vacío, `sitiosSinPueblo`, para no mover el resto del mapa); se toma, da su oro y pelea tras la madera con las reglas de la fase 1. En la escena es su pieza de pueblo en el paso, sin hito ni puesto, y el eje se abre como el de un paso (`pasosAtravesados` no cuenta su pieza); lo vigila `test/pueblos-en-un-nodo.test.ts` |
| Quitar vida | `herir` (`battle/damage.ts`; `applyDamage` no se exporta) |
| Cifras = catálogo + veteranía + equipo | `cifrasDeUnidad` (`core/unidad/catalogo.ts`: cuerpo + rango + lo de serie con lo propio encima, un solo `conEquipo`; con el catálogo de la pelea, `CatalogoDeUnidades`, por defecto `CATALOGO_DEL_JUEGO`), `cifrasDelIndividuo` (el retoque de la arena), `conEquipo`; el oro de una unidad, `costeDeUnaUnidad` (de la vestida) y `oroDeUnidad`; el cuerpo sin equipo de un stack, `cuerpoDe(stack, cat?)` (del origen: igual en el juego y la arena; el héroe lo lleva en `OrigenDelStack`, `desnudo`); qué unidad es un stack, `origen.unidad` o `queEs` (`battle/types.ts`): `body` es el arte |
| Fuerza, agilidad y peso: lo que se deriva de un cuerpo (25-10-2026) | `cifrasDelCuerpo` (`core/unidad/cuerpo.ts`: defensa = agilidad efectiva + escudo + `defensaPropia`; daño = [F, F × agilidad efectiva] con F = fuerza + la del arma; casillas = agilidad efectiva, tope 7, y `crawling` con 1), `restaDelPeso` (−1 de agilidad por cada fuerza entera, o parte de ella, que pase lo que pesa todo: 31-10-2026, decisión del usuario; antes, por cada 50 %, truncado), `agilidadEfectiva` (como poco `AGILIDAD_MINIMA`, 1; la de una `UnitInfo` ya vestida, `agilidadDe`, y lo que le resta su peso, `restaDelPesoDe`: el contrato y la ficha de la arena), `escalonDeCasillas` (la única traducción de casillas a escalón, que solo piden `cifrasDelCuerpo` y `marchaDe`; con una montura de guerra, las casillas y el peso son de ella: «La montura», abajo) y `cuerpoConSusCifras` (el cuerpo desnudo: la unidad, `cuerpoDeCombate`; el héroe, `cuerpoDelHeroe`; el rango, `cifrasVeteranas`). `UnitInfo` lleva las primitivas (`fuerza`, `agilidad`, `defensaPropia`: la Defensa del héroe, 0 la tropa; `peso`, lo escribe `conEquipo`) y las derivadas (`defense`, `damage`, `speed`), que lee el motor tal cual. El rango sube primitivas **antes** que el equipo (`cifrasVeteranas` lanza con algo puesto). Lo vigila `invariantes.test.ts` |
| A quién se licencia | `elQueSeIria` (`hero/troop.ts`) |
| Construir un héroe | `heroeRecienHecho` |
| Contratar un héroe, también el de salida (22-10-2026) | `hireHero` (`hire_hero` con `tipo` opcional; la única puerta de un héroe pagado: el de salida de todos se asienta y se cobra por ella en `createGame`, salvo el de quien lo elige en la base, `Player.heroeDeSalida`, `NewGameOptions.tipoDelHeroe` a `null`); la regla, `contratarBlocker` (con el de salida pendiente, solo en su base; la lee también la IA, `planHires`); los candidatos, uno por tipo de la facción, con el nombre y la tropa una vez, `candidatosAHeroe` (`EleccionDeHeroe`; sin el turno); lo que no se hace mientras, `salidaPendienteBlocker` (solo el de salida: sin héroes a media partida se pasa el turno), que en el cliente es parte de la única compuerta de toda acción, `Session.bloqueoDeTurno` (contratar y `clickTile` miran solo el turno); el tipo por defecto de una semilla, `heroePorDefectoDeLaSemilla` (la rápida y `tools/qa/navegador/url-de-partida.ts`); el precio de todo héroe, `ECONOMIA.precioDelHeroe` (`data/economia.json`, inventado; nunca más que `oroDeSalida`). En el cliente, la escena del ayuntamiento (`partida/ayuntamiento/escena.ts`, `sesion/vistas/ayuntamiento.ts`, `partida/ayuntamiento/panel.ts`; la fila ante un edificio, `anteUnEdificio` y `botonesDeLaFila`, la misma de la morada; sin quien anduvo delante; su cámara, `encuadrarElAyuntamiento`: el edificio entero, del alto de su cuadro a los pies de los candidatos), que abren el arranque sin `?heroe=`, «Contratar héroe» y, con el de salida pendiente, abrir la base propia (`openTown`) y llegar a la puerta del ayuntamiento (`EscenaBase.llegar`) |
| La guarnición de un sitio y la tropa entre héroe y sitio (04-11-2026, fase 1 del puesto fronterizo) | `core/state/sitios.ts`: qué sitio hay en una casilla (`sitioEn`, `sitioPorId`, `sitioDelHeroe`: el suyo donde está), de quién es (`dueñoDelSitio`), cómo se nombra (`nombreDelSitio`, `delSitio`), su guarnición (`guarnicionDe`, de ciudades, pasos y pueblos, en `GameState.guarniciones` con su dueño, `null` la neutral, desde el 05-11-2026; `Town.garrison` se fue; con su dueño, `laGuarnicion`, la única lectura que mira que tenga tropa; la de una ciudad, `guarnicionDeLaCiudad`; lo que hay entre héroe y sitio, `entreLosDos`), su cupo (`cupoDeLaGuarnicion`) y si es hostil para quien llega (`guarnicionHostil`: la de cualquier sitio con tropa y ajena; la leen `enemyAt`, `casillasHostiles`, `queLoCierra` y la IA); **la única puerta que mueve tropa entre un héroe y su sitio**, `repartir`, que lanza con los dos cupos, `repartoBlocker` (el del héroe y el de la guarnición; la usan `moverTropa`, que leen `dejar_tropa` y `recoger_tropa`, y la defensa), y `sitios.ts` es lo único que escribe `GameState.guarniciones` (`ponerLaGuarnicion`, `quitarLaGuarnicion`; lo vigila `invariantes.test.ts`); la regla de dejar y recoger, `intercambioBlocker` (el pedido, `PedidoDeTropa`: `count` de un tipo o un veterano; el de un grupo, `pedidoDelGrupo`; el tipo de la acción, `Intercambio`, de punta a punta); **repartir y confirmar** (D9, vuelta 1 de QA: con los dos llenos se cambia uno por otro), la acción `repartir_tropa` (`{ hero, enElHeroe }`, las líneas de todo lo que va con él, `LineaDelReparto`: novatos por tipo o un veterano; desde un ejército, `lineasDelEjercito`), juzgada solo en el reparto final por `repartirTropaBlocker` y aplicada por `repartirTropa` (un hecho, `troops_exchanged`, con lo que dejó y lo que se llevó por tipo), y lo que lee su pantalla, `elReparto` (los dos lados como quedarían, con sus cupos, y el motivo del reparto entero; el agente y la IA siguen con dejar y recoger). Perder el sitio, `entregarElSitio` (`state/game.ts`: el del muro, por `tomarElNodo`; el de dentro de una región solo pierde la guarnición; para el héroe vencido en su sitio y para la guarnición sola). Recoger lo propio de un sitio que ya no es suyo, sí; dejar o mejorar el puesto, no (la regla de «suyo», una vez, `loSuyoDelSitio`: el sitio o su guarnición; la leen `heroeEnSuSitio` y `sitioDelHeroe`; pregunta 3 de la tarea 2). El sitio de una ciudad, `sitioDeLaCiudad`; el de un objeto que ya se tiene, `sitioDelObjeto` (sin buscarlo por id); su objeto del mapa, `objetoDelSitio` (`tomarElNodo`); la ciudad suya donde está un héroe, `castilloSuyoDelHeroe`. La defensa: la de la IA, `defensaDeLaIA` (a pasos, sin que lo de fuera deje de caber en la guarnición), que aplica `dejarPendiente`, que la guarda en la batalla (`PendingBattle.defensa`) y la cuenta con el hecho `defense_set`; la de la persona, `defensaPorElegir` (de `laDefensa`, `sitios.ts`: cada fila con lo que hay, lo que pelea y el motivo del núcleo para no subir o bajar uno), `defensaBlocker`, `ejercitoDeLaDefensa` (de cada tipo, los que no se irían: `licenciar`) y `elegirLaDefensa` (`state/game.ts`: reparte y vuelve a montar la batalla antes de la primera jugada, `batallaSinEmpezar`; montar no tira). En `state/`, `createBattle` lo llama solo `montarLaBatalla` (lo vigila `invariantes.test.ts`). La IA recoge con `planIntercambios` (`ai/strategy.ts`), cuando llega (`playAiTurn`), también el que volvió a casa vencido o rendido (`Hero.vueltoACasa`, efímera: la ponen y la quitan solo `volverABase` y `nextPlayer`, lo vigila `invariantes.test.ts`). La fila de la defensa separa el rechazo del «+» (`motivoMas`) de lo que solo informa (`notaMas`: ya pelean todos). En el cliente, `Session.vistaDeLaGuarnicion`/`moverEnElReparto`/`confirmarElReparto`/`cerrarLaGuarnicion` (lo editado no toca la partida hasta confirmar) y `Session.defensa`/`cambiarLaDefensa`/`confirmarLaDefensa`/`dejarLaDefensaDeLaIA`, pintadas por `partida/guarnicion.ts` en `<dialog id="guarnicion">` y `<dialog id="defensa">`; la crónica nombra la guarnición y el pueblo del muro tomado («Pueblo tomado: El Soto») por su sitio (`renderLog(…, sitioDe)`, `Session.sitioDeLaCronica`; el espectador, con los pasos y los pueblos del cable, `pasoOPuebloSiExiste`; la ciudad, por su casilla) |
| Con qué hoja se pinta un héroe (vuelta 2 del arranque, 19-10-2026) | `figuraDelHeroe` (`core/data.ts`): la de su tipo en `data/figuras-de-heroe.json`, comprobada al cargar contra los tipos (`validarFigurasDeHeroe`) y contra el disco en `test/figuras-de-heroe.test.ts` (ocho direcciones, identidad, y ninguna hoja `heroe-*` sin tipo). Derivada, no guardada en el `Hero`: la leen el mapa (`HeroeEnElMapa` lleva `faction` y `tipo`), la base caminable, el retrato del menú, la batalla (`HeroeDelBando.figura`, sin opcional: la arena pone la suya o la genérica) y el espectador, con la facción y el tipo que trae el cable. Lo que el héroe ES para la crónica y el agente es `HERO_BODY` (`battle/types.ts`, `queEs`), no su figura |
| Qué se levanta en cada sitio de la base | `sitiosDeLaBase`, `siguienteDe`, `construidoEn` (`town/sitios.ts`) |
| De un píxel del cuadro de la base al escenario | `planoDelCuadro` (`shared/base.ts`); en pantalla, `colocarLaPlaca` y `colocarEnElCuadro` (`render/base/recortes.ts`) |
| Recortar un edificio de la base de su cuadro | `recortarLaBase`, `derivarRecorte` (`tools/taller/recorte-base.ts`) |
| Escala del tablero de combate (también la de la base) | `escalaDelCombate` (`render/proyeccion.ts`), que leen `tableroPara` y `pasoDeLaBase` (la base: la de una batalla en un marco 20:11 de su alto, `MARCO_DE_LA_BASE`; el ancho no cuenta, 20-10-2026) |
| Quién hay en una base y qué dice (narrado o de respaldo) | `vecinosDeLaBase`, `vozDe`; las voces del narrador las escribe solo `ponerVoces` (`gente/voces.ts`) |
| Nivel de una unidad (índice de poder, con su equipo) | `nivelDeUnidad`, `indiceDePoder`, `nivelDelIndice` (`core/unidad/nivel.ts`, `data/poder.json`), de la unidad vestida (`poderBruto`, memorizado por `UnitInfo`); lo que mide lo lee de `battle/armas.ts` (`golpeDe`, `golpesDe`, `porcientoDelTipo`, `disparosDe`, `trasLaArmadura`), y `unidad/nivel.ts` no está en un ciclo de importación (lo vigila `invariantes.test.ts`); qué cifras se pueden medir, `medidaBlocker`. Ni el nivel ni el coste se escriben en `data/unidades.json` (lo vigila `invariantes.test.ts`) |
| El catálogo de unidades (el juego y la arena) | `data/unidades.json`, que importa solo `core/unidad/catalogo.ts` (lo vigila `invariantes.test.ts`): `UNIDADES`, `unidad`, `unidadDelJuego`, `unidadesDelJuego`, `unidadesDeFaccion`, `unidadesDeMorada`, `hojaDeUnidad` (la hoja con que se pinta, `cuerpo.hoja`); el formato, `validarUnidad` y `validarCatalogo` (`core/unidad/formato.ts`); lo que el juego exige a los dos catálogos juntos (equipo base del héroe, unidades y moradas), `leerCatalogos`, que llaman la carga, «Guardar» y el editor de equipo; la forma de un id, `esIdDeUnidad` (`core/validar.ts`) |
| Moradas: qué producen y qué cuestan | `Unidad.edificio` (la morada que la produce; sin él no se recluta) y `Building.morada` (su sitio en la base, 1-6: no es un nivel); `nivelDeMorada` (el de lo mejor que produce: de él, su coste), `moradasBlocker` (cada `edificio` es una morada de su facción, cada morada produce algo; al cargar y al guardar) (`town/buildings.ts`); una fila por unidad, `dwellings`; el oro y el crecimiento de una unidad, `oroDelIndice`, `crecimientoDelNivel` (`data/economia.json`) |
| El ejército de salida | `startingArmy` (`state/setup.ts`): la primera unidad del pueblo con su tirada y hasta `DE_LA_SEGUNDA` de la segunda, lo que quepa; que la primera quepa siempre y de la segunda al menos uno se comprueba al cargar (`PUEBLO_DE_SALIDA`); las dos facciones de la partida, `faccionesDeLaSemilla(seed, delJugador?)` (con su propia corriente: el mapa de cada semilla no se mueve; con la elegida en el menú, el rival es otra de las cuatro, y la que la semilla habría sacado da la misma partida; `newGame` la recibe en `faccionDelJugador`), y el nombre del héroe de salida, `nombreDeSalida`; la facción de la URL, `parseFaccion`, y si un texto es una, `esFaccion` (`core/types.ts`); el rasgo de cada una, `rasgoDeFaccion` (`data/facciones.json`, extraído del cuaderno por `tools/datos/facciones.ts`) |
| Reindexar el rango de héroe | `subidasDeRango` (lanza por debajo del 5) |
| Añadir a la mochila | `aLaMochila` |
| A quién va una pieza | `destinoDeEquipo` |
| Lo que admite una mano y dos (un arma a dos manos va sola; dos de una mano no dejan sitio al escudo; 25-10-2026) | `manosBlocker` (`hero/equipo.ts`, mira solo las armas de cuerpo a cuerpo, `arma` y `segunda`, y el escudo: el arco a la espalda deja llevar escudo; la segunda arma pide una primera y es de una mano; la única lectura de `Pieza.manos`, con `aDosManos` al lado para enseñarla o escribirla); en qué huecos va una pieza, `huecosDeLaPieza` (`types.ts`: la de `arma`, en `arma` y `segunda`; la pieza dice `HuecoDePieza`, nunca `segunda`), con su motivo una vez, `huecoBlocker` (lo leen `manosBlocker`, `equipoBlocker` y `equipoDelPortadorBlocker`, antes que lo de serie), y la ficha de la arena (`opcionesDelHueco`, que pregunta antes `manosBlocker` desde la pieza que se pone: el remedio, de lo que ya lleva); poner en la segunda, `ponerPieza(…, hueco)`, `equip.hueco` (el agente, `slot`) y el botón «A la segunda mano» de la tropa; la leen `equipoBlocker` y `equipoDelPortadorBlocker` (`core/unidad/catalogo.ts`: las manos y el arma de cuerpo a cuerpo sobre lo que llevaría puesto, `equipoPuestoDe`, lo de serie de su unidad incluido; la preguntan `ponerseBlocker` y `unequipBlocker`), y `ponerPieza` lanza con ella, con lo de serie debajo si se le da (`deSerie`: la acción `equip` de la tropa, que pone antes de tocar la mochila, todo o nada; QA del 26-10-2026, H1), que es la pregunta de la arena (`equiparEnArena`, con el nombre de quien la lleva; lo vigila `invariantes.test.ts`); dicha para la persona, `REGLA_DEL_ESCUDO` |
| Los huecos en el contrato (`melee_weapon`, `second_melee_weapon`, `ranged_weapon`, `armor`, `shield`, `mount`; `lance` se fue el 25-10-2026, `mount` llegó el 26-10-2026) | `SLOT_DE_HUECO`, `huecoDelSlot`, `accionDelAgente` (`contract/vocabulario.ts`; un `Slot` lleva marca y solo lo produce ese módulo; lo que escribe el agente, `AccionDelAgente`, con el `slot` opcional de `equip`); por dentro, `HUECOS` en español (`arma`, `segunda`, `distancia`, `armadura`, `escudo`, `montura`; lo vigila `invariantes.test.ts`) y el núcleo recibe un `Hueco` (`unequip.slot`, `equip.hueco`): el texto lo traducen `accionDelAgente` y la sesión (`esHueco`). Uno que no existe, `huecoDesconocido`; para la persona, por su nombre (`NOMBRE_DE_HUECO`; quitar de uno vacío, `nadaEnElHueco`) |
| Con qué arma se da cada golpe | `usoDelGolpe` (`battle/damage.ts`: el disparo, `distancia`; lo demás, también la carga, `arma`) y `golpeDe` (`battle/armas.ts`: las armas y las cifras de cada uso, con su respaldo), de la que leen `cifrasDelGolpe`, la previsión y la ficha (`armasDe`, `dichoDelGolpe`, que nombra las dos: «con Espada y Lanza de jinete»); `UnitInfo.armas` lo escribe solo `conEquipo`, con el nombre de cada arma (`GolpeConArma.piezas`, y montado de guerra con lanza la horquilla de la carga, `GolpeConArma.carga`: la batalla no lleva catálogo; lo vigila `invariantes.test.ts`). **Dos armas de cuerpo a cuerpo** (25-10-2026): de ataque, fuerza y cada tipo de la rueda, la mejor de las dos (`sumaDe`, `mejorRueda`); el peso, la suma. El uso es `arma` o `distancia` (`UsoDeArma`; ¿es de arma por uso?, `esArmaPorUso`); qué cifras admite cada hueco de pieza y si lleva rueda, `camposDelHueco` (`arma`: ataque, fuerza, peso, rueda y manos; una lanza es un `arma` con `lanza: true`, que leen solo `hero/equipo.ts` y `data.ts`, `esLanza`, lo vigila `invariantes.test.ts`; `distancia`: ataque, fuerza y peso; `armadura`: armadura y peso; `escudo`: defensa y peso; 25-10-2026; `montura`: fuerza, agilidad y peso, suyas, que no se suman a nada, 26-10-2026); cómo se dice cada uso, `DICHO_DEL_USO` |
| La montura (26-10-2026, «vamos a separar la montura del personaje»; `docs/agents/2026-10-26-montura/`) | un hueco más, `montura`, con piezas que dicen su `fuerza`, su `agilidad` (2 a 7, `AGILIDAD_DEL_CUERPO_MIN`/`MAX`, ahora en `core/unidad/cuerpo.ts`), su `peso` y si es de guerra (`Pieza.guerra`; sin él, de silla); la regla de la pieza, `problemasDePieza` (`problemasDeMontura`: agilidad y fuerza ≥ 1 en una montura, ni agilidad ni `guerra` fuera de ella); `.guerra` lo leen solo `data.ts`, `hero/equipo.ts` (`esDeGuerra`) y `core/unidad/cuerpo.ts` (`montadoDeGuerra`). Las cifras puestas, `UnitInfo.montura` (`MonturaPuesta`), que escribe solo `conEquipo` (`monturaPuesta`; la suma, `sumaDe`, deja su peso fuera del del jinete). **La única cuenta**, `cifrasDelCuerpo`: montado de guerra, el jinete pelea con su agilidad entera (el peso lo carga la montura), las casillas son las de la montura con lo que pesa lo del jinete y ella frente a su fuerza (`casillasDeLaMontura`, privada) y, con lanza (`fuerzaDeLaLanza`, la de la mejor lanza puesta, que solo vive en `unidad/cuerpo.ts` y `hero/equipo.ts`), la horquilla de la carga, [F, F × agilidad del jinete] con F = la fuerza de la montura más la de la lanza. Lo que cuenta en el mapa, `marchaDe` (de guerra o de silla, las casillas de la montura; a pie, las de batalla), que lee `slowestSpeed`; lo que le resta el peso a la montura, `restaALaMontura` (la ficha). Lo vigila `invariantes.test.ts`. La IA no las compra (`valorDePieza` de una montura, 0: backlog) |
| Quién dispara | cómo juega a distancia, `tiroADistanciaDe` (`battle/armas.ts` desde el 02-11-2026, leída solo de `UnitInfo.armas.distancia`: `disparo`, `granada` o `null`; la única pregunta, y nadie escribe `isShooter || lanzaGranadas`); `isShooter` y `lanzaGranadas`, comparaciones con ella (no hay munición: llevarla ya es disparar); cuántos tiros da un disparo, `disparosDe` (`battle/armas.ts`: uno, dos con `double_shot`; la única cuenta, lo vigila `invariantes.test.ts`) |
| Armas de fuego y granadas (02-11-2026, **regla nuestra**, `docs/agents/2026-11-02-armas-de-fuego-y-granadas/`) | lo que tira una pieza de `distancia`, `Pieza.tiro` (`fuego` o `granada`; sin él, arco o ballesta), con su `recarga` (fuego) o sus `cargas` (granada) y, el arma de fuego, su propia `agilidad`; su regla, `problemasDelTiro` (`data.ts`, dentro de `problemasDePieza`); en la unidad, `GolpeConArma.tiro` (lo escribe solo `conEquipo` con `tiroDelGolpe`, `hero/equipo.ts`), y `.tiro` lo leen solo `data.ts`, `hero/equipo.ts` y `battle/armas.ts` (lo vigila `invariantes.test.ts`); el daño del arma de fuego, [F, F × agilidad del arma] (`LoQuePoneElEquipo.agilidadDelArma`, `cifrasDelCuerpo`: sigue siendo la única cuenta). **Perfora la armadura**, `perforaLaArmadura` (`battle/armas.ts`), la única pregunta, que leen `computeDamage` (`DamageResult.perfora`), la previsión, `expectedDamage` y `fraccionQueLlega` (`trasLaArmadura(…, perfora)`, sin valor por defecto); `herir` recibe el golpe entero (`GolpeQueHiere`, daño y perforación juntos: un hechizo, `perfora: false`), y la salpicadura reparte ese mismo golpe. **La recarga**, `recargaDe` y `BattleStack.recargando` (la pone `dispararLoApuntado`, contando ese turno; la baja `endTurn`), en `disparoBlocker` («está recargando: le faltan k turnos», la frase de `recargaQueFalta`, que dice también el panel). **Es un contador del stack y no un `StackEffect`, a propósito**: lo temporal vive en `effects`, pero un efecto caduca por rondas con un tope de 2 y la recarga cuenta los turnos de la propia unidad y llega a 9 (`RECARGA_MAXIMA`). **La granada**: su alcance, `alcanceDeLaGranada` (la fuerza del cuerpo, al menos 1), y qué casillas alcanza con su cuarto, `casillasDeLaExplosion` (`battle/granada.ts`, el único que importa `data/granada.json`); quién puede lanzar y a dónde, `lanzarBlocker` (la recta no se mira); lo que le queda, `granadasQueQuedan` (las `cargas` de su pieza, `cargasDe`, menos `BattleStack.granadasLanzadas`); la que está en el aire, `BattleStack.granada`; a quién da, `explosionDe(state, at)`, la única regla que leen la explosión (`explotarLaGranada`, al abrir su turno en `alEmpezarSuTurno`, tras el disparo), la previsión (`PrevisionDeGranada`, cada impacto con `aliado`), la IA (`mejorGranada`, `ai/tactics.ts`) y el tablero (`pintarGranadas`, con sus `casillas`); sus opciones, `opcionesDeLaGranada`. Lo que sale al empezar un turno puede matar a quien empieza (su propia granada): un muerto no juega su turno, `advance` pasa al siguiente. `recargando`, `granada` y `granadasLanzadas` los escribe solo `battle.ts` (lo vigila `invariantes.test.ts`); un retoque de la arena que cambia la clase de tiro de un stack (`mismoTiro`) le quita lo apuntado, la granada en el aire y la recarga (`loADistanciaTrasElRetoque`). En el cliente, la jugada a distancia y lo que se ve con ella las elige el núcleo, `tanteoADistancia` (`disparo` con su recta, `granada` con su explosión, o `no` con el motivo; el botón, `aDistanciaBlocker`), que leen `ArmaDeLaActiva.tanteo` y la escena; el modo del selector llega al panel (`accionesDeLaUnidad`, `modo`); el estado, `estadoADistancia` (`views/panels.ts`: «Recargando: k», «Granadas: k de n») |
| El disparo diferido (25-10-2026, **regla nuestra sin validar por el usuario y sin ningún test**, por su decisión) | quién puede apuntar y a qué casilla, `apuntarBlocker` (con `disparoBlocker`, privada: tirador, sin moverse, sin un enemigo al lado; sin casilla, el botón); lo apuntado, `BattleStack.apuntado` (lo pone solo el `aim`, cierra el turno y viaja al espectador con el stack); la recta, `lineaDeTiro` (`board.ts`: la recta geométrica del centro del tirador al centro exacto de la casilla, 01-11-2026, con toda casilla que atraviesa, también por una esquina, en el orden en que entra, y por un lado entero, la del empujón del bando que tira, el defensor con el espejo; nunca por el marco) y a quién da, `lineaDelDisparo` (`battle.ts`: el primer vivo que no es el tirador, de cualquier bando, también tras la casilla: la recta sigue hasta el borde, 01-11-2026; todas las casillas en que daría, con el cuarto de su tirada, `LineaDelDisparo.alcance`, que el tablero tiñe del frío al rojo del calor de la rueda; desde el suelo sube a lo alto del muro y da al primero que haya arriba en cualquier casilla de muro que cruce, pasando por encima de la esquina de suelo entre dos de muro, y la para bajar del muro o el lado de una puerta cerrada; desde lo alto nada; 06-11-2026, «Los disparos de abajo del muro al muro no dan»: la recta en diagonal rozaba antes la casilla de muro vacía de al lado, y en la muralla gruesa la columna de fuera tapaba la de dentro), la única regla que leen el disparo, la previsión, la IA (`aTiroLimpio`, `ai/tactics.ts`) y el tablero (`pintarDisparos`, `render/batalla.ts`, para los dos bandos y el espectador); el disparo, `dispararLoApuntado` (privada: al abrir el turno en `advance`; se borra lo apuntado); la tirada, `cuartoDelDisparo` (`damage.ts`: `max(0, CAIDA_DEL_DISPARO − o)`, con 4, los octavos de casilla a que pasa la recta del centro de la casilla del alcanzado, `octavosHastaLaRecta`, `board.ts`, en enteros; `DamageOptions.cuarto`, fija), y las opciones del daño, una vez, `opcionesDelDisparo` (`battle.ts`, con lo alto de un muro: el disparo, su previsión y la IA); la salpicadura no da al tirador (`splashTargets`). La recta de `lineaDeTiro` se recuerda por par de casillas y bando; el tablero recuerda las de lo apuntado por batalla y largo del registro (`lineasApuntadas`) y la escena el tanteo por casilla y jugada (`tanteoEn`). En el cliente, **el selector de arma** (26-10-2026, petición del usuario: «Un arquero no puede cargar, le sale la casilla de cargar pero solo puede disparar. En lugar de apuntar como accion, que haya un selector de arma para usar»), `ArmaDeLaActiva` (`sesion/partida.ts`, una pieza para `Session` y `SesionDeArena`): solo el tirador activo (`isShooter`) lo lleva, «Cuerpo a cuerpo (Daga)» o «A distancia (Arco)» (`botonesDeArma`, `batalla/poderes.ts`; la Q alterna); empieza en «A distancia» si puede apuntar y vuelve a él con otra activa u otro turno. **El modo es del cliente**: decide qué de la lista legal se ofrece (`delModo`: «A distancia», ni `move` ni `attack`; «Cuerpo a cuerpo», ni `aim`), y de esa lista salen lo que marca el tablero y lo que hace el clic (`golpeEnPixel` ya no conoce el `aim`: antes ganaba al golpe y el arquero veía sus casillas de andar y de cargar pero el clic solo apuntaba); en «A distancia», el clic en cualquier casilla apunta, a la de la unidad pulsada si se pulsa una (`casillaDelDisparoEn`), y el tanteo, que juzga el núcleo. `ataqueBlocker` es solo del golpe. El contrato del agente y la IA no cambian |
| Lo de antes | no se lee (14-10-2026: sin compatibilidad hacia atrás): una unidad o pieza de otro formato no vale (`validarUnidad`, `validarPieza`); un `?montaje=` de otra versión se rechaza (`montajeDeLaURL`, `VERSION_DEL_ENLACE`), y `?reglas=`, `?golpe=` y `?contacto=` también (`PARAMETROS_RETIRADOS`, `retiradosDeLaURL`) |
| La regla de una pieza | `problemasDePieza` (`data.ts`), con los campos que existen (`CAMPOS_DE_PIEZA`: un `pv` o una calidad no valen): el precio, un entero de oro (`Pieza.precio`); de dónde se consigue, `seConsigue` (`armeria`, `botin` o nada: solo en kits; `DONDE_SE_CONSIGUE`, dicho con `DICHO_DE_DONDE`, `SOLO_EN_KITS` y `deDondeSale`); solo las cifras de su hueco (`camposDelHueco`), todo pesa (`Pieza.peso`, obligatorio; una `velocidad` o un `danio` de antes se rechazan diciendo qué escribir), el tope de armadura (`ARMADURA_MAXIMA_DE_PIEZA`) y la rueda completa del arma que golpea en ella (`golpeaEnLaRueda`, `problemasDeNiveles`). El catálogo entero se hace en un sitio, `leerPiezas` (cada pieza, sin repetir, con sus bases y alguna de botín, todos los problemas a la vez), que leen `leerEquipo` (el fichero) y `catalogoDeEquipo` (`hero/equipo.ts`: el `CatalogoDeEquipo` atado; el del juego, `EQUIPO_DEL_JUEGO`); un fallo en `data/equipo.json` tumba la carga nombrando el fichero |
| El editor de piezas (arena) | `conPiezas` (la única superposición de piezas sobre un catálogo: cambiar una, abrir un enlace), `cambioDePiezas` (el catálogo nuevo, hecho una vez, o el motivo: nadie de los catálogos deja de valer, dos piezas no se llaman igual, el equipo base del héroe; un retoque a media pelea, `retocarEnBatalla` con `kind: 'piezas'`, pregunta `equipoQueNoVale`), `enElHueco` (lo que exige el hueco; lo que no suma, a 0; el peso se queda), `piezaNueva` (en blanco o copia; ni id ni nombre de otra) y `piezaSobre` (sobre otra, extras a 0), `idsLlevados`/`piezasDelMontaje` (`core/arena.ts`). Las lecturas de una pieza atadas a un catálogo, `equipoCon` (`hero/equipo.ts`): la arena no importa las sueltas (`pieza`, `piezasPuestas`, `conEquipo`, `manosBlocker`, `equipoBlocker`, `ponerPieza`, `heroUnit`), que leen las del juego; al héroe lo viste con `cuerpoDelHeroe`. La batalla no lleva catálogo de piezas: quien cambia una a media pelea le da el suyo; el equipo puesto de cada stack, en `UnitInfo.equipo` (lo escribe `conEquipo` y viaja al espectador). Lo vigila `invariantes.test.ts`, por importación |
| Sumar una base (18-10-2026) | `resolverBases` (`data.ts`, privada), la única suma, que llama solo `leerPiezas`; la pieza escrita (`PiezaEscrita` = `Pieza \| PiezaConBase`: id, nombre, base, extras con signo y su propio `seConsigue`) va por las fronteras y la resuelta es la que pelea; los extras, una tabla (`FORMA_DE_LOS_EXTRAS`) con la suma y su inversa juntas (`sumarBase`, `diferenciaDe`, en `data.ts`); qué base vale, `baseBlocker` (existe, de su hueco, no da la vuelta), que leen la resolución, `conBase` (cambia de base conservando las cifras finales), `basesPosibles` y `piezaSobre`; la escrita y la base de una pieza, `escritaDe`, `baseDe`, `cadenaDeBases` (`core/arena.ts`, como `conBase`, `basesPosibles` y `piezaSobre`). Hueco y manos son los de la base; el precio, el de la base más el oro de los extras. Lo vigila `invariantes.test.ts` (nadie suma una base ni lee `.extras` fuera de su sitio) |
| El equipo de una unidad | `equipoDeUnidadBlocker(cuerpo, equipo, eq)` (`core/unidad/formato.ts`: piezas y manos, un arma de cuerpo a cuerpo, `armaDeCuerpoBlocker`, y que el índice la mida), que leen `validarUnidad`, `opcionesDelHueco` (lo que se rechazaría va desactivado con su motivo), `quitarBlocker` (el arma no lleva ×) y `equipoQueNoVale`; el del héroe, `EQUIPO_BASE` (`data/heroe.json`, comprobado con `equipoBaseBlocker`), y quién lleva una pieza además de las unidades, `laLlevaElHeroe`. En la partida, la tropa lleva lo de serie de su unidad con lo suyo encima, hueco a hueco (`equipoPuesto`, `equipoPuestoDe`): lo de serie no se quita ni va a la mochila |
| Unidad nueva de la arena | `unidadNueva` (`core/arena.ts`); cuerpo + equipo con que pelea, `unidadDeCombate` (`core/unidad/formato.ts`) |
| Qué es un árbol (la regla «árbol = no se pasa») | `esArbol`: las hojas de `ARBOLES` y los módulos de `ARBOLES_DE_LA_CUBIERTA` (`render/escenario/colocar.ts`) |
| Lo que la copa de la masa no tapa de lo que se pisa | `topeDeLoPisable` (`altoPorLosLados`, `altoSobreLosPasillos` con `pasillosEstrechos`); el contador, `sobreLoPisable` |
| Los módulos de la cubierta que no van en lo que se pisa (los peñascos grises de la nieve) | `FUERA_DE_LO_QUE_SE_PISA`, que lee `modulosDe(hoja, true)`; los pide la `mata` de lo que se pisa (`sePisa`) |
| Formatear un precio | `describirCoste(oro)` («15 000 oro», o «gratis»); un entero con miles («176 000»), `conMiles` |
| La renta del día (solo oro, 21-10-2026) | `rentaDelDia` (`state/renta.ts`: el ayuntamiento de cada ciudad propia unida a la base —la del muro por su nodo, la de dentro por su región— y `ECONOMIA.rentaDelPueblo` por pueblo propio unido, con de dónde sale cada moneda; la ocupada, oro 0 y su frase, `ocupada`; lista toda ciudad y todo pueblo propio, también lo que no cobra, con `unida`/`unido` a `false` y oro 0: el pueblo del muro recién tomado sin unir no salía en ningún sitio, vuelta 1 de QA, H2), que leen solo `startTurn`, el contrato (`you.income`) y `Session.renta` (la barra y el lateral); lo de una región, `rentaDeLaRegion` (la IA: sus pueblos y el ayuntamiento de sus ciudades de dentro). El monedero es `Player.oro`, un número; el motivo de no poder pagar, `oroBlocker` (`town/town.ts`: «no alcanza el oro: cuesta … y tienes …») |
| Camino de un héroe (con lo hostil) | `alcanceDelHeroe`, `caminoHasta`; nadie fuera de `game.ts` llama a `findPath`/`reachableFrom` |
| La infiltración (05-11-2026, fase A, `docs/agents/2026-11-05-infiltrados-y-robo/`) | quién se infiltra, `infiltracionBlocker` (`hero/infiltracion.ts`: su tipo y toda su tropa; sin tropa, solo el tipo; «no se infiltra: no lo llevan su tipo (Caballero) ni …»), y `seInfiltra` (el predicado del camino caliente, que no monta la frase); el rasgo `infiltrarse` (`CREATURE_TRAITS`, en `data/unidades.json`) lo lee solo ese módulo, y los tipos, `data/infiltradores.json` (a mano: `tipos-de-heroe.json` es generado), solo `core/data.ts` (`validarInfiltradores`, que rechaza el tipo por defecto; `tipoSeInfiltra`; lo vigila `invariantes.test.ts`); lo que cuesta una barrera, `precioDeLaBarrera` (el día entero: `Hero.marchaDelDia`, la marcha con que empezó el día, que fija con `movePoints` solo `empezarElDia` —al empezarlo, el inicial y el contratado— y no cambia con la tropa; o `null`), que es el `barrera` del Dijkstra del héroe (`reachableFrom`/`findPath(…, barrera)`: con `null` no corre nada nuevo y el banco no cambia); qué casilla se pisa, `isEnterable(map, p, pisaBarreras)` (la única regla: con él, también las cinco barreras fuera de todo recinto; la muralla de una ciudad, no), y cuál es barrera para nombrarla, `barreraEn`; las frases, la de la marcha que no da ni un paso (`moveHero`: «<héroe> hoy no da ni un paso: …», cuánto cuesta el primero y cuánto le queda, y si es barrera «(x,y) es montaña y cuesta el día entero de marcha (N), y le quedan M; se entra mañana»: sin «no quedan puntos», que con casi todo el día se leía al revés, H2 de la vuelta 1 de QA), la de la ruta que hoy se para ante una barrera (`barreraDeMañana`, `state/game.ts`: el primer paso de otro día, si es barrera; la pone `Session.previewPath` en ese paso, `PasoDeRuta.barrera`, y la dice `llegadaDeLaRuta` si se ve) y la de `porQueNoLlega` («… sin cruzar una barrera: solo la cruza un grupo que se infiltra, y no se infiltra: …», cuando infiltrándose llegaría); el nombre de cada barrera para la persona, `NOMBRE_DE_BARRERA` (`map/terrain.ts`); el agente, `heroes[].infiltrates`/`infiltrationBlocker`; el panel, `Session.infiltracion`; el candidato del ayuntamiento, `CandidatoAHeroe.seInfiltra`; la figura parada en una barrera (sin tablero), `pisada(…, nodos)`: la clave de sus pies subida por `subidaEnUnaBarrera` de `loQueTapaEnUnaBarrera` (`render/escenario/figuras.ts`; de una vez, `delanteEnUnaBarrera`), **sin `claveDeFigura`** (sus `cubiertas` la subían por encima de lo horneado de delante: N1 de la vuelta 2 de QA), con lo que la tapa guardado, perezoso, por casilla en `Escenario.enUnaBarrera`: sube por delante de lo que está detrás (`deDetras`: lo del relieve que cuelga de su fila o de más al norte, `filaAlta`; lo demás con el pie en sus pies o más al norte, no en su fila) y de la masa de una barrera de más al sur (lo que no es algo hecho, `esAlgoHecho`, ni la cubierta de lo que se pisa), y nunca hasta pasar lo hecho de más al sur que la tapa (un recinto, un objeto, un puesto); de las piezas de un nodo (hito y obras) cuenta solo la que se pinta con lo que se sabe de él (`seVeConSuNodo`, con los nodos que pasa `mapa.ts`, `nodosQueSeSaben`: N2 de la vuelta 2): H1 de la vuelta 1 de QA, el goblin al norte de Valdeluz (s8) se pintaba encima de sus torres |
| Territorio y renta | `territorio(state)`, `dueñoComun` |
| Validar un plan de mapa (agente y procedimental) | `validateMapPlan` → `problemasDeRed`; los jugadores y la base de cada uno, `basesDelPlan` (los dueños de ciudad por id, con su primera ciudad: lo leen la validación, `newGame` y el servidor) |
| Qué barrera cruza un nodo | `MapObject.barrera`, que pone `buildMap` con el muro que abre; el procedimental escribe ese muro con `queCruzaElNodo` |
| El río del procedimental (antes que las regiones; nadie lo corta) | `trazarRio`, `regionesDelRio`, `nivelesDelRio`, `rioEntero`, `orillaDeLaCiudad` (`core/map/rio.ts`: la ciudad del cruce aún en el río, en la red; el vestido la muda a tierra, `enSuOrilla`); el puente de la ciudad-puente, `rioAnteLaCiudad` (`recinto.ts`), y en la escena, `puenteDeLaCiudad` (`puentes.ts`, `Puente.ciudad`); la única escritura de la rejilla del vestido, `ponerTipo` (`vestir.ts`, que lanza si se toca el río; lo vigila `invariantes.test.ts`); medido sobre el mapa, `riosDelMapa` (`tools/qa/medidas/rios.ts`) |
| Qué línea deja dos regiones a dos pasos (el acantilado entre dos niveles; el agua a ras de la más baja, que se ve) | `lineasQueSeparan`, `separadasDeCerca`, `aguaALaVista` (`vestir.ts`): el paso 7d y todo lo que abre una barrera (`abrirLinea`, `quitarEspigas`, `puertasSinMuesca`, `abrirEsquinasTorcidas`); el agua entre dos niveles, solo el 7d (`aguaEntreNiveles`); en el mapa hecho, `auditarMapaDenso` (`test/helpers.ts`) |
| Caminos de un plan al mapa | `caminosDelPlan` |
| Carga: cuándo, quién y cuánto | cuándo, `cargaDesde` (la recta: con el objetivo en ella, libre y que quepa lo que cuesta salir del contacto; lo de muchas preguntas, `medirCargas`, con la carrera que se anda, `CargaMedida.carrera`); cuánto, `CARGA` (`battle/carga.ts`, `data/carga.json`: la misma para todos desde el 26-10-2026); si va montada, `cargaMontada(unit)` (montura de guerra y lanza: `GolpeConArma.carga`; la leen la IA, la ficha y el dicho), y su horquilla la decide una vez el golpe (`deUnGolpe`, `damage.ts`: la de la carga montada o la del arma, que leen la tirada, el daño medio y la previsión); el tope, `cargaEfectiva`; la del índice, `porcientoDeLaCarga`; lo que se enseña, `casillasDeCarga` (con `CasillaDeCarga.porciento`); las frases, `dichoDeLaCarga` (la carga cobrada: parte y previsión) y `dichoDeLasCifras` (la ficha); la recta mínima, `CARGA_MINIMA` (de `carga.ts`). La carga la cobra solo el primer golpe (`intercambio`) |
| Turno de batalla | `BattleState.turno` (`n`, ordinal); `mismoTurno`; viaja como `turnId` |
| Tope de jugadas | `MAX_JUGADAS` |
| Montar una batalla (un solo combate, 19-10-2026) | `createBattle(atacante, defensor, rng, muralla?)`, la única puerta, también la de la arena (`batallaDeArena`) y la del mapa (`montarLaBatalla`, con la muralla de su sitio): sin interruptores ni ramas de fheroes2. Lo vigilan dos guardias de `invariantes.test.ts`: «una puerta para montar batallas» (el estado entero lo escribe solo `createBattle`, y `core/arena.ts` lo importan solo la arena, la sesión y `capturas`) y «nadie escribe fheroes2» (ni el literal ni los nombres retirados) |
| El despliegue (02-11-2026, «Añade al combate una fase previa de despliegue»; `docs/agents/2026-11-02-fase-de-despliegue/`) | dónde sale cada uno, `asentar` (`battle/despliegue.ts`, la única regla: lo pedido, en su zona y libre; el resto, al primer hueco de su zona del centro hacia fuera; sin nada pedido, las casillas de siempre; lo lee también el reasiento al abrir una tanda, `asientoAlAbrir`); la zona de una unidad, `zonaDeSalida` desde `alcanceDelDespliegue` (la única lectura de `UnitInfo.despliegue`, `{ columnas, momento }`: **el enganche de la infiltración**, que hoy no escribe nadie); el orden, `TANDAS` (defensor, atacante, y luego los dos «tras el enemigo»); la casilla que vale, `colocarBlocker` (muro, ocupada por el rival, fuera de su zona; la de uno de su tanda, se cambian: `suyoEn`); lo que ve cada bando, `batallaALaVista` (lo propio y lo de las tandas cerradas); el estado, `BattleState.despliegue` (`despliegueDe`), que mueven solo `createBattle`, `aplicarDespliegue` y `terminarElDespliegue` (`battle.ts`; lo vigila `invariantes.test.ts`), y lo que no vale con él, `despliegueEnCursoBlocker` (lo primero de `applyAction`); `autoResolve` lo cierra antes de pelear y el director lanza si le llega uno. Quién despliega a mano, `BattleSide.despliegaAMano`: `montarLaBatalla` en el bando de la persona (también la batalla que rehace la defensa elegida) y la arena en sus lados «Yo» (`batallaDeArena(…, aMano)`); sin él, la tanda pasa sola y la batalla sale en la ronda 1 como antes (el banco no cambia). En el cliente, `DespliegueEnPantalla` (`sesion/partida.ts`, una pieza para `Session`, `SesionDeArena` y la tropa; `listoTalCual`) y `batalla/colocar.ts` (el tablero, el puntero y el clic al colocar: `tableroAlColocar`, `clicAlColocar`; la instrucción, `COMO_SE_COLOCA`); **la escena y los paneles solo leen `ControlDeBatalla.batallaALaVista`**, y la batalla entera, `batallaEntera`, solo el animador, que coloca a cada uno en su casilla mientras dura el despliegue (lo vigila `invariantes.test.ts`); `claveDeBatalla` lleva `firmaDelDespliegue` |
| La formación del héroe (02-11-2026) | su casilla de salida, en el individuo: `Troop.salida` y `Hero.salida`, en el marco del atacante (el defensor sale en su espejo); viaja con él (licenciar, equipar, la guarnición) y en la batalla en `OrigenDelStack.salida`, de donde la devuelve `settleBattle`; lo que no tiene casilla la recibe de `asentar`. Cambiarla, la acción `formar` (`formarBlocker` = `heroeSuyo` + `puestoBlocker` + `colocarBlocker` sobre la batalla de la formación; `formar` juega `aplicarDespliegue` sobre ella y copia cada casilla a su `salida`: las reglas son las del despliegue); la batalla de la formación, `batallaDeLaFormacion` (un `createBattle` con el defensor vacío: lo que se ve es lo que saldrá), y la traducción portador ↔ stack, `stackDelPortador`/`portadorDelStack` (`state/game.ts`, por `origen` y `slot`, nunca por el id). En el cliente, **la escena de la tropa es el tablero de despliegue** (`partida/tropa/escena.ts`, con `Session.formacion`, el mismo `DespliegueEnPantalla`); el semicírculo (`render/tropa/`) se retiró el 02-11-2026. Retocar el despliegue en una batalla no cambia la formación guardada |
| La rueda del golpe | `battle/rueda.ts`: `puntoDelCruce`, `tiradaDelPunto`, `cruceBlocker`, `efectosDeLaRueda` (la lista de lo que deja un golpe, sacada de `efectoDelTipo`; su origen, el tipo jugado; cuándo vence, `CuandoVence`, dicho con `duracion`), `contraataqueDelCruce` (el punto va en el `attack` devuelto); cuántos golpes, `golpesDe` (`battle/armas.ts`, la única cuenta de `melee` y la previsión); al daño, en números (`DamageOptions.cruce`: `damage.ts` no importa `rueda.ts`), solo por `cruceDelGolpe` desde `opcionesDeDanio`; la previsión, `previsionDeLaRueda` (con `niveles`, el arma de quien pega en las dos fases: el tinte del diálogo); al responder, el golpe que viene, `previsionDelGolpeQueViene` (por respuesta, lo menos y lo más que quita el atacante según lo que elija, topado en la vida, y qué golpe tumba; solo para quien lo pinta: el agente no lo recibe, 01-11-2026); la carga que cobra quien pega, `cargaDeLaRueda` (`carga.ts`), y la del registro, `cargaDelCruce`. **El paso del cruce es del núcleo**: plantar a quien pega, `plantarse` (junto a `soltarElGolpe`, `battle.ts`), y `pasoDelCruce` (`ai/rueda.ts`: la jugada lista o lo que falta, ya plantado), con `completarCruce(…, LaIAElige)` y el único sorteo, `elegirEnLaRueda`; lo conducen solo `CruceDeLaRueda` (las dos sesiones del cliente) y el director (`conLaRueda`, `server/director.ts`), lo vigila `invariantes.test.ts`. El golpe plantado que espera la rueda, `BattleState.golpeEnCurso` (sin carga, ya anduvo; **con carga, no ha corrido** y guarda la carga por correr, `GolpeEnCurso.carga`, una `CargaMedida` con la carrera hasta su llegada: la carga se elige antes de correr, 31-10-2026, y el registro de una carga es `cruce`, `move` con `charge`, `attack`; plantado, `casillasDeCarga` da la carga plantada; lo pone el `attack` sin elecciones y lo quitan el golpe y `soltarElGolpe`; lo que no vale con él, `golpeEnCursoBlocker`); el tramo de andar tras la Finta, `TurnoDeUnidad.finta` (lo pone solo `melee`, lo vigila `invariantes.test.ts`). **La rueda con el arma, por niveles** (18-10-2026; absolutos desde la vuelta 2): la tabla de lo que da cada nivel (0 a 6, `NIVEL_MAXIMO`) de cada tipo del anillo (`TIPOS_DEL_ANILLO`; Normal no tiene nivel), `TABLA`, privada de `battle/cifras-de-la-rueda.ts` (sin dependencias del núcleo, para que `problemasDePieza` juzgue la rueda de una pieza con `problemasDeNiveles`), y su única lectura, `cifrasDeLosNiveles` (Romper guardia y la Finta, por éxito y en enteros; memorizada por objeto de niveles), que llaman solo `ruedaDelGolpe` (`battle/armas.ts`) y `filasDeLaRueda` (lo vigila `invariantes.test.ts`); los niveles del arma, `Pieza.rueda` (`NivelesDeLaRueda`, los seis, también los 0), que `conEquipo` copia a `GolpeConArma.rueda`; las cifras de un golpe, `ruedaDelGolpe(unit, uso)`, que lanza sin arma, y sus niveles, `nivelesDelGolpe`; el nivel de cada tipo de una forma, `nivelesEnLaForma` (`formas-de-la-rueda.ts`: solo para enseñar); Fuerte y Rápido con el arma de cada golpe (`conElGolpe`), lo demás con la del primero del intercambio (`ruedaDelIntercambio`); cuántos golpes da Rápido, `GOLPES_DEL_RAPIDO`; un arma nueva, con la de la Espada (`nivelesDeLaEspada`, `core/unidad/formato.ts`, leída de `data/equipo.json`); los pesos de la IA, aparte (`PESOS_DE_LA_RUEDA`). **Sin arma no se combate**: una unidad sin un arma de cuerpo a cuerpo que golpee en la rueda no vale (`armaDeCuerpoBlocker` con `golpeaEnLaRueda`, en `equipoDeUnidadBlocker`), el héroe nace con la Espada (`EQUIPO_BASE`, `ESPADA`) y el arma no se quita (`unequipBlocker`). Las fases del turno (`libre`, `movido`, `plantado`, `trasLaFinta`), `faseDelTurno`, y lo que no vale en cada una, `faseBlocker` (lo leen `applyAction`, la lista legal y el principio de cada `*Blocker`); la firma del turno (con la Finta y el golpe plantado), `firmaDelTurno`, que leen `Movibles` y la clave de la sesión |
| Los golpes y los poderes en el contrato (19-10-2026) | `HIT_DE_GOLPE` (`offensive`, `strong`, `feint`, `defensive`, `quick`, `guard_break`, `normal` y los fusionados `offensive_strong`, `defensive_feint`, `quick_guard_break`), `hitsDeLaRueda(forma)`, `golpeDelHit(hit, forma)` (lanza diciendo cuáles valen en la rueda de la batalla), la rueda dicha, `ruedaAlAgente` (`wheel`: `types`, `ring`, `center`, `crossing`), `accionDeBatallaDelAgente` (lo que manda el agente: `attack.hit` → el golpe, `power` → el poder), `accionAlAgente` (la lista legal al revés) y `hechoAlAgente` (el `cruce` del registro con `hit` y `response`), en `contract/vocabulario.ts` con los huecos; la petición de respuesta, `serializeBattleResponse` (recibe solo los dos ids: no puede contar el golpe del otro; lo vigila `invariantes.test.ts`, «el agente elige en la rueda») |
| La complejidad del combate (22-10-2026) | `ReglasDelCombate` (`core/combate.ts`: `tope` de tropa por bando, héroe incluido, y `rueda`, 3, 5 o 7 cada uno; `COMBATE_COMPLETO`, 7 / 7; los topes, `LIDERAZGO.topesPorBando` de `data/liderazgo.json`, y `maxPorBando`, el mayor, derivado: el techo de los datos y del generador), `parseTope`/`parseRueda` (un parser, `deLaLista`, y una frase por campo con `combateBlocker`; `?tropa=`, `?rueda=`, `HEROES_TROPA`, `HEROES_RUEDA`, `--tropa`/`--rueda` del barrido), `combateCon` (lo pedido y la de siempre en lo demás); en la URL de la partida, `combateDeLaURL`/`combateALaURL` (`client/partida/combate-en-la-url.ts`, con `?solo-heroe=1`; el menú arranca con ella, `combateParaElMenu`); lo guarda `GameState.combate` (`newGame({ combate })`) y lo pide `createBattle(…, combate, muralla?)`, obligatorio, que pone `BattleState.rueda`; el cupo del héroe, `cupoDelHeroe(tope)` y `capacidadDe(hero, tope)`; lo neutral al tope, `loNeutralAlTope` (una copia; al nacer en `createGame` y al brotar en `dondeBrotan`: el mapa no depende del tope); el tope de un bando de la arena, `topeDelBandoBlocker` (`MontajeDeArena.combate`, obligatorio). **Las formas de la rueda** (`battle/formas-de-la-rueda.ts`): la de una batalla o una partida, solo `formaDeLaBatalla` (nadie más indexa `RUEDAS`); la de 7 fija, `RUEDA_DE_REFERENCIA` (el índice de poder y la ficha de un arma, `ruedaDeLaPieza`: la única del cliente); cada forma con anillo, centro, cruce `distancia` o `ciclo` (dicho una vez por forma, `dichoDelCruce`: «el de enfrente» solo con un anillo par; los puntos que da, derivados de `puntoDelCruce`, `puntosDeLaForma`, que leen las notas por éxito, la horquilla de cada sector y las muescas del medidor; en un ciclo, a quién gana y con quién pierde cada tipo, `cicloDe`, dicho `dichoDelCiclo`), el golpe que no deja nada, `golpeNeutro` (Normal, o `null` en la de 3: nadie escribe `'normal'` para jugar), `golpes` (lo único que se itera para jugar; `TODOS_LOS_GOLPES` solo valida) y lo que `renombra`; `PARTES`; los nombres, `NOMBRE_DE_GOLPE` (los diez) y `nombreEnLaRueda`; si un tipo es de la rueda, `tipoDeGolpeBlocker(x, forma)`; el efecto de un tipo, `efectoDelTipo` (un fusionado, cada parte a la mitad, `aMedias`) y cuántos golpes, `golpesDelTipo`. Lo vigila `invariantes.test.ts`. «Solo la rueda del héroe», `Session.soloRuedaDelHeroe` (`?solo-heroe=1`), con `LaIAElige` por stack |
| Quién lleva cada bando | `Player.controller` (`human`, `agent` o `ai`); la batalla que nace en el turno de la IA la toma el controlador de su dueño (`quienLaToma`, con lo que pasa `ConduccionDelTurno.batallas`: la persona, sus defensas; el agente, `BattleTakeover`), y quién no se rinde lo dice `sinLaIA` |
| Por qué acabó una batalla (arena) | `causaDelFinal` (`battle.ts`, con `bandoVencido`) → `finalDeArena` |
| Enlace de una pelea de la arena | `montajeALaURL` / `montajeDeLaURL` (`?montaje=`, con `?seed=`); un parámetro repetido, `unaVezEnLaURL` (`core/validar.ts`: la lee también la partida, `?seed=` y `?faccion=`); uno retirado, `retiradosDeLaURL` |
| Tema de la interfaz (uno por facción, 19-10-2026, traído de `claude/army-game-theme-ui-28d2ad`) | el tema es la facción tal cual (`FactionId`, `FACTION_IDS`, `esFaccion`, sin alias); las fichas, en el `:root` neutro de `style.css` (las que se leen sin tema) y en `temas.css`: un bloque común (`:root[data-tema]`, lo que los cinco derivan igual, también las de la rueda del golpe, `--rueda-*`) y uno por tema con lo medido en su lámina (`MUESTRAS`, `medirPaleta`, `tools/taller/temas/paleta.ts`); `style.css` las importa con `fuentes.css` (generada de `FUENTES`, `tools/fuentes/bajar.ts`), `forma.css` (la única hoja con reglas de tema, todas bajo `:root[data-tema]`) y `piezas-de-tema.css`. Que «común ∪ tema» defina toda ficha que leen las hojas con tema y el neutro las que se leen sin él (salvo las fijas `--info-*`, solo en el neutro: lo que es información, como el calor de la rueda y el nivel de un arma), lo vigila `temas.test.ts`; quién manda, `ponerTema` y `quitarTema` (los únicos que escriben `data-tema`, `src/client/comun/temas.ts`); el lienzo las lee con `temaDelLienzo` y no escribe ninguna familia de letra a mano; ninguna hoja lleva un color fijo fuera del `:root` (los tres, en `invariantes.test.ts`). La partida pone el de su jugador (`main.ts`); la arena y el espectador van en neutro (el selector «Tema» de la arena y los encargos de piezas del taller se quedaron en la rama: backlog) |
| Piezas en imagen de los temas (marcos en 9 trozos, barra de sección, cartela, remate, sello, texturas) | la lista cerrada y su corte, `PIEZAS`/`DEFINICIONES`, y lo que enseña cada lámina y dónde, `POR_TEMA` (`tools/taller/temas/piezas.ts`); su sitio, su respaldo y todas sus reglas, en `forma.css`; `src/client/piezas-de-tema.css`, **generada** y solo de fichas (`cssDePiezas`, `escribirPiezasDeTema`: las medidas de la tabla y, por pieza en disco, `--pieza-<x>` con su `url()` y la marca vacía `--con-pieza-<x>`; de un marco, su corte medido, `corteDeMarco`; nadie la edita a mano: lo vigila `piezas-de-tema.test.ts`) |
| Forma del tablero de batalla (qué casillas existen, su espejo, la frase del contrato) | `board.ts`: `isInside`, `allHexes` (la lista congelada; su posición es `indiceDe`), `filasDelTablero`, `espejo`, `desplazamientoDeFila`, `EXTENSION_HORIZONTAL`, `ULTIMA_FILA`, `codigoDeLado`, `FORMA_DEL_TABLERO`, `tableroDelContrato`; fuera de `board.ts` nadie importa `anchoDeFila`, `ANCHO_DE_FILA_*` ni `BOARD_HEIGHT` (lo vigila `invariantes.test.ts`, por importación) |
| Muros, puertas, niveles y tiro tapado de la batalla | `battle/muralla.ts` (`pasoPermitido`, `bonoEnLoAlto`, `validarMuralla`, con su material obligatorio, `MurallaDeBatalla.material`: `piedra` o `madera`, `MATERIALES_DE_MURALLA`, `esMaterialDeMuralla`; lo que ya devolvió lo devuelve tal cual, así que `createBattle` la pide siempre y las batallas de un sitio comparten su objeto y sus cachés; lo que tapa un disparo, `lineaDelDisparo`, en `battle.ts`); «esta batalla no tiene muralla», `SIN_MURALLA`, y el editor de la arena parte de `murallaVacia('piedra')`; la regla dicha, una vez, `reglaDeLaMuralla` (con las palabras de quien la lee: la arena, `REGLA_DE_LA_MURALLA`; el agente, `PROSA_DE_LA_MURALLA`); la salida de cada bando, `battle/salida.ts` (solo de `board.ts`): la zona de unas columnas sin muros, `zonaEnSuMarco`, que lee el despliegue (`zonaDeSalida`), y si caben tantos en las de todos, `salidaDe`, que lee la regla del mapa, con la misma frase (`noCabenEnLaSalida`; fusión del 05-11-2026: el despliegue la había vuelto a escribir); al montarla, `createBattle(…, muralla)`: la arena, la que se dibuje (de piedra); la batalla del mapa, la de su sitio (abajo) |
| El arte de la muralla en el tablero de batalla (06-11-2026, «falta arte para el muro en combate… también para la escalera») | medidas y nombres, `shared/muralla-de-batalla.ts` (`ALTO_DE_MURALLA` y `PORTADA` viven ahí; las piezas, `PIEZAS_DE_LA_MURALLA` y `PIEZA_DE_LA_ESCALERA`); el arte son **materiales que se llevan a su sitio**, no un sprite por columna (la cámara va de 25° a 35°): la cara (`cara-<material>`, un alzado de `RODAJAS_DE_LA_CARA` caras de hex con su remate encima: cada cara de una columna lleva una rodaja con una afín, la del sureste a la sombra; el remate, solo en las aristas que dan fuera, `daFuera`), la tapa (`tapa-<material>`, textura en un encaje común, `rellenoDeLaTapa`), la portada abierta (su paso recortado, `pasoDelArco`) y cerrada, y la escalera, tendida del pie a lo alto; lo pinta `render/batalla/arte-de-la-muralla.ts` (pide su arte con la primera batalla que lleva muralla, `pedirElArteDe` → `pedirArteDeLaMuralla`), que llaman `pintarColumna`, `pintarPortada` y `pintarEscalera` (`render/batalla.ts`: la partida, la arena y el espectador); sin la imagen, el marcador de siempre (`ACABADO_DEL_MURO`). Lo tapado de una portada o una escalera se ve a trasluz sobre la pieza que la tapa (`aTrasluz`, con el arco de la puerta en contorno; sustituye a las hojas en naranja), y quien está en lo alto de la columna de detrás de una puerta se pinta tras su portada, cuyas almenas le tapaban los pies (`portadaDelAdarve`). Las cajas, del índice derivado `assets/batalla/muralla/indice.json` (`medirLaMuralla`, `pnpm taller derivar-muralla-batalla`; lo juzga al cargar `leerIndiceDeLaMuralla` y lo vuelve a medir `test/muralla-de-batalla-arte.test.ts`); las guías y los encargos, `tools/taller/muralla-de-batalla.ts` (`pnpm taller encolar --muralla-batalla`; la cerrada es la edición de su abierta), en `assets/batalla/muralla/_guias/`, fuera del build |
| Las murallas del mapa (04-11-2026, fase 2 del puesto fronterizo) | las formas, `data/sitios.json` (en «murallas», **por nombre** y abiertas: hoy `base-derecha`, de piedra (la muralla por defecto, la «Base derecha» que dibujó el usuario en la arena, pegada a la salida del defensor, 06-11-2026; era `gruesa`, en medio del tablero), y `linea-con-puerta`, de madera, cada una con su `material`; son del mapa, no copias de la arena; **quién usa cuál**, una sola tabla, «usos»: la ciudad, el pueblo y cada obra del paso nombran su forma), que **importa solo `state/sitios.ts`** (lo vigila `invariantes.test.ts`) y lee y juzga una vez al cargar `leerSitios` (lanza nombrando el fichero y la forma o el uso; da `MURALLAS_DEL_MAPA` y `OBRAS_DEL_PUESTO`): que cada forma sea una muralla (`validarMuralla`) y que valga para el mapa, `murallaDelMapaBlocker` (`battle/muralla.ts`: que **cierre**, que se asalte —un muro con pie fuera y, andando como el atacante arriba, `pasoPermitido`, suelo dentro—, que lleve puertas y cada una separe fuera de dentro, y que quepan `maxPorBando` en cada salida, `salidaDe`); cuál lleva cada batalla, `murallaDelSitio(sitio)` (`sitios.ts`: la de la ciudad, la del pueblo, el paso la de su obra, fila «Las obras del puesto»), que pregunta `montarLaBatalla` por **el sitio en juego**, `sitioQueSeDefiende` (`game.ts`: la ciudad, la guarnición de un paso o un pueblo, o el sitio suyo del héroe atacado; la misma pregunta que leen la defensa, `dejarPendiente`, y lo que se entrega al perder, `applyVictory`); con muralla, **escalera a todo el bando atacante**, una por stack y su héroe, `alAsalto(bando, muralla)` (`battle.ts`, `HeroeDelBando.escalera`; quien vuela no la recibe, `quienNoEscala`; lo leen `montarLaBatalla` y `tools/qa/medidas/arena-ia.ts`, sobre los bandos de la arena, `bandosDeArena`). Las jugadas, `TIPOS_DE_ESCALA` y `TIPOS_DE_PUERTA` (con `esTipoDeEscala`, `esTipoDePuerta`; las cuatro, `JugadaDeMuralla`), y quién no las usa nunca, `quienNoEscala` y `quienNoAbre` (`battle.ts`; la puerta, `puertaBlocker`). En el cliente, una pieza para la partida y la arena, `MurallaDeLaActiva` (`sesion/partida.ts`: lo que espera el clic, `porElegir`, es **una clase más de `LoApuntado`**, así que elegir un muro suelta el hechizo o el poder y Escape, toda jugada y cerrar la batalla lo sueltan; `muroPorElegir` y `puertaPorElegir`, derivados; la apunta solo ella —lo vigila `invariantes.test.ts`—; su motivo, `motivo(tipo)`, y el botón, `elegir(tipo)`; `soltar` desde la escena), pintada por `botonesDeMuralla` (`batalla/poderes.ts`: un `botonDeMuralla` con `data-action="battle-muralla" data-jugada="<tipo>"`, que las dos páginas mandan a `elegir` con `jugadaDelBotonDeMuralla`); el lienzo pinta muros y portadas por su acabado (`ACABADO_DEL_MURO`, `render/batalla.ts`: la piedra en hiladas, la madera en estacas) |
| Las obras del puesto (04-11-2026, fase 3 del puesto fronterizo) | la obra de un paso, `node.mejora` (`MEJORAS_DEL_PUESTO`, `MejoraDelPuesto`, `esMejoraDelPuesto`, `core/map/map.ts`: `ninguna`, `empalizada`, `muralla`; un primitivo del objeto, así que la niebla la recuerda sola y viaja con él al espectador), que **escribe solo `mejorarElPuesto`** (`state/sitios.ts`; lo vigila `invariantes.test.ts`): tomar el paso no la toca; las obras y su escalera, junto a su tipo (`ObraDelPuesto`, `OBRAS_DE_UN_PUESTO`, `OBRA_SIGUIENTE`, `map.ts`; `events.ts` las importa de ahí); lo que cuesta cada obra y tras qué muralla se pelea, `OBRAS_DEL_PUESTO` (de los «usos» de `data/sitios.json`: el precio y **la forma que nombra**, la misma de quien la comparta, sin copiarla; la carga exige el material que dice el nombre, `MATERIAL_DE_LA_OBRA`: la empalizada, de madera; la muralla, de piedra); lo que es un sitio en un motivo, `QUE_ES_EL_SITIO`; la regla, `mejorarBlocker(state, jugador, héroe, obra, oro)` (héroe suyo en su paso, que quede obra, **que la pedida sea la que toca** —la acción nombra la obra, `mejorar_el_puesto { hero, obra }`, y el botón la lleva en `data-obra`: el segundo clic de un doble clic en «Levantar la empalizada» compraba la muralla, QA de la fase 3, H-F3-1; en la partida, además, su segundo clic no cuenta, como el de ningún botón salvo los que suman de uno en uno (`repartirClic` de `partida/reparto-del-clic.ts`; decisión del usuario, 07-11-2026), porque el repintado llega entre los dos clics de una persona— y el oro, `oroBlocker`; sin tope por día; como `buildBlocker`; si una obra es de un puesto, `esObraDelPuesto`), que leen la acción `mejorar_el_puesto` (que **cobra en `game.ts`**, con el jugador que ya tiene, como toda compra; hecho `outpost_upgraded { hero, site, to, cost }`, como sus hermanos) y el diálogo; lo que pinta el diálogo, `laObraDelPuesto` (de una sola `laMejoraPedida`: el rechazo, `motivo`, y lo que solo informa, `nota` —«el puesto de … ya está amurallado», dicho del puesto para no concordar con el nombre del paso (H-F3-2)—, como `motivoMas`/`notaMas` de la defensa, y el material de cada obra, `materiales`). En el cliente, `Session.mejorarElPuesto(obra)` (la del botón pulsado; la vista lee el privado `obraDelPuesto`, que pone el turno solo en el `motivo`), la sección «El puesto» de `partida/guarnicion.ts`, cómo se dice cada obra, una tabla (`SE_VE_EN_EL_PUESTO`, `DICHO_DE_LA_OBRA`, `client/comun/dichos.ts`: botón, barra y crónica), y el marcador del mapa, `pintarMarcadorDelPuesto` y lo que sube su bandera, `altoDelMarcador` (`render/mapa/marcador-del-puesto.ts`: caseta, torreta de madera, torre, con la sombra común, `pintarSombra`, a la escala de la obra que sustituye); **dónde va y qué se pinta lo dice la escena** (fila «El puesto en la escena»), y `mapa.ts` solo planta la bandera (`Cosa` `puesto`) en la pasada de lo que dice quién está. En el contrato, `UPGRADE_DE_MEJORA` (`vocabulario.ts`: `none`, `palisade`, `wall`; `UPGRADES`, `esUpgrade`, que lee el arnés), el `upgrade` del nodo en `knownMap` |
| Previsión de daño (barra de la partida y de la arena) | `previsionDe` → `horquillaDeDanio`, `trasElGolpe`; opciones del golpe, `opcionesDeDanio` |
| Desenlace y causa del final (barra, crónica y nota del agente) | `finDePartida`, `desenlaceDe` (`state/desenlace.ts`) |
| Ventaja para atacar/emboscar | `ventajaClara` (`hero/fuerza.ts`) |
| Lo que se anda hoy (marcha y ruta) | `pasosDeHoy` (`state/game.ts`) |
| El héroe andando su marcha por el mapa (06-11-2026, «el personaje se teletransporta…») | el núcleo mueve de golpe; la sesión guarda lo andado (sus `hero_moved`, también cortada, parada o emboscada) en `Session.marchaEnCurso` y **lo que abre la llegada** (batalla, base, lugar, guarnición, la frase de la parada) espera a `acabarLaMarcha` (`alAcabarLaMarcha`), solo con `enseñarLaMarcha` (la página; los tests y el espejo de `pnpm capturas`, en el acto). Por dónde va, `enLaMarcha` (`marcha.ts`, a `msPorCasilla` / `PRISA_EN_EL_MAPA`, piernas incluidas) sobre su traza, **la misma de la línea de la ruta** (`puntosDeLaTraza`, `render/mapa/mapa.ts`, de `trazaPorLosArcos`, `recinto.ts`: al entrar o salir de un recinto, por el arco de su puerta, `pasoPorElArco`, el de la senda; QA del 06-11-2026); lo pinta `VistaMapa.andando` con su clip `walk` y su dirección, la cámara lo sigue y al llegar se centra como antes (`EscenaAventura.andando`). Mientras anda, la línea es lo que le queda desde donde va (`VistaMapa.marchaDeLaRuta`) y al llegar sin llegar al destino queda pintado lo que falta hasta que se pulse otra cosa (`EscenaAventura.destino`); **lo que se pinta es lo de antes de andar** (el movimiento del panel, `Session.movimientoALaVista`; los objetos como se sabían) salvo la niebla, que va con él (`pisarEnLaMarcha`, `nieblaDeLaMarcha`, `sesion/vistas/marcha.ts`: cada región, al pisar la casilla que la descubre); un gesto durante la marcha solo la hace llegar (`hastaQueLlegue`, `main.ts`; `clickTile`). `#app[data-marcha]` mientras anda. Los rivales no andan (backlog) |
| El clima (tiempo y noche por región, 22-10-2026; presentación) | `core/state/clima.ts`, el único que importa `data/clima.json` (inventado, `validarClima`; lo vigila `invariantes.test.ts`): de la semilla, `tiempoDeLaSemilla` y `nocheDeLaSemilla` (puras, en cadena y con su propia corriente: ni una tirada de la partida; la noche con el peso de la facción del dueño de la región ahora, `dueñosDeLasRegiones`); **la noche va con el dueño de AHORA**: tomar una región cambia su cadena y, a veces, su noche en el acto (10,9 % de las tomas en 1-40, 44 % si la toma un no muerto; se acepta, «cae la noche cuando llegan los no muertos», y fijarla al empezar el día pediría guardar estado solo para eso: QA del 22-10-2026, H3); lo de hoy de una región, `climaDeHoy` (privada), que leen `climaDeLaPartida` (todas, memorizado por día, lo pedido y los dueños) y, de lo de toda la partida, `climaEn` (una casilla) y `esDeNocheEn`, lo que leería `core`; de una casilla, `regionDelSitio` (`regionMasCercana`, `map/regiones.ts`, la misma de la niebla: las barreras, los nodos y las ciudades, con la región más cercana, `laMasCercana`) y `climaDelSitio`; de una batalla, `regionDeLaBatalla` (la casilla de `lugarDelRival`) y `climaDeLaBatalla`, y lo que viaja al espectador es la región, que lee con `climaDeLaRegion`; lo que pide el narrador, `pedirClima`, el único que escribe `GameState.climaPedido` (lo vigila `invariantes.test.ts`), con `climaBlocker`, y su única lectura, `pedidoVigente`; `?clima=`, `parseClima`, `validarForzado`, `forzarClima` y `climaSinRegiones`. Lo pinta `render/clima/`, un solo pintor para el mapa y toda escena (`pintarSueloDelClima` y `pintarAireDelClima` sobre un `CampoDelClima`: `campoDeEscena` o, por región y con su frente, `campoDelMapa`; el frente, `regionEnElFrente`; las recetas, una fila por tiempo en `EFECTOS`), que no lee la sesión (lo vigila `invariantes.test.ts`) |
| Qué héroe se ve y qué se sabe de un objeto (agente, lienzo, minimapa, barra) | `heroesALaVista` (lo mirado ahora), `objetosConocidos` (vivo si se mira, si no el recuerdo de `memory`); el cliente, por `Session` |
| Qué grupo de asaltantes se ve | `asaltantesALaVista` (lista con la marca `AsaltantesALaVista`; sin niebla, `todosALaVista`): si se mira su casilla (02-11-2026); para un grupo suelto (la crónica, la marcha, la IA), `visibleNowAt` |
| Lo explorado y lo que se mira ahora (la niebla por regiones, 02-11-2026, `docs/agents/2026-11-02-niebla-por-regiones/`) | lo explorado se descubre por **regiones enteras**: qué casillas descubre la región `k`, `zonaDeNiebla` (las suyas, las barreras que tiene más cerca, `regionMasCercana`, y sus pasos: cada nodo que la rodea, el recinto entero de cada ciudad y el puente de una ciudad-puente), qué regiones descubre quien está en un sitio, `regionesQueDescubre` (la suya; sobre un nodo, todas las que une, y en cualquier casilla del recinto de una ciudad o en su puente, las de la ciudad: vuelta 1 de QA, H4), y si una está descubierta, `regionDescubierta` (por una casilla testigo: no se guarda), en `core/map/niebla.ts`; la única escritura de `fog`, `descubrir` (con `revealEverything`; lo vigila `invariantes.test.ts`), que apunta en `memory` los objetos de la zona. Lo que se mira AHORA, `visibleNow`/`visibleNowAt` (atadas casilla a casilla): el cuadrado de `HERO_SCOUT_RADIUS` (5) de cada héroe y de `NODE_SCOUT_RADIUS` (6) de cada castillo y nodo propios (`miradasDe`) **sobre lo explorado**; lo refresca `mirarDesde` (`memory` y `recordarAsaltantes`). Lo llaman `revealAround`, `revealAroundTown` y `revealAroundNode` (al empezar el turno y al tomar el sitio, en `tomarElNodo`). Lo que se apunta es el recuerdo de siempre, `recuerdoDe` (con el dueño y el ocupante de una ciudad o un pueblo). **Un héroe parado en una barrera** (la infiltración, 05-11-2026) descubre la región más cercana (`regionesQueDescubre`, la misma regla que la de cualquier casilla de barrera) y mira su cuadrado como cualquiera. Perder un sitio del muro se sabe siempre (`visibleTo`, por `from`: el dueño de ayer lo miraba desde él) y su recuerdo es ya la bandera nueva (`vioCaerlo`, en `tomarElNodo`; vuelta 1 de QA, H1) |
| Por dónde se entra en un pueblo | `puertaDe`, `rodeosParaEntrar` (`map/puertas.ts`: la casilla de debajo; la mina, con dos, se fue el 21-10-2026; la ciudad no: sus puertas son las de su recinto, lo vigila `invariantes.test.ts`); **el pueblo en el muro no tiene** (`puertaDe` da `null` con su `barrera`, fase 3, 05-11-2026): es un nodo y se cruza por su eje, y `sendasPorObjeto` no lo mira |
| Por qué una marcha no llegó (veredicto del agente) | `paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`) |
| Qué lleva la labranza (campos, atrezo, casas) | `labranzaDe` (`render/escenario/labranza.ts`); las hojas que pone su regla y no el sorteo, `HOJAS_DE_SU_REGLA` (`colocar.ts`); si una pieza va al suelo o es volumen, `Sprite.plano` (lo lee `esVolumen`) |
| El recinto de una ciudad, en el núcleo (dónde está su 3 × 3, qué no va dentro y por dónde se entra) | `core/map/recinto.ts`, puro: `LADO_DEL_RECINTO`, `recintoDeLaCiudad` (con la ciudad en el medio, también la ciudad-puente; lanza si no cabe: una ciudad va a una casilla del borde o más; nunca se corre), `SEPARACION_DE_CIUDADES` (5, Chebyshev), las seis puertas con sus accesos, `PUERTAS_DE_LA_CIUDAD` (ni este ni oeste), las que puede llevar, `puertasPosibles`, y las que **tiene**, `puertasDeLaCiudad` (donde llega un tramo de `GameMap.caminos` de un acceso a su casilla, `RedDeCaminos.une`; la del río, siempre), el puente de una ciudad-puente, `rioAnteLaCiudad` (la casilla del río a dos de ella, que se pisa: el acceso de su puerta del río, también al este o al oeste); **el paso**, `pasosDelRecinto` → `pasoPermitido` (de un acceso a su puerta y de la puerta a la ciudad; la muralla no se pisa), que lee solo `map.ts` (`pasosDelMapa`: el Dijkstra, `isEnterable`, `sePasa`; lo vigila `invariantes.test.ts`) y el trazado del generador con las puertas posibles (`EntradaDeCaminos.recintos`); las regiones de una ciudad, las de los accesos de sus puertas posibles, `regionesDeLaCiudad` (la lee `estructura`; un nodo no toca la región por la muralla); el puente no se une al recinto al etiquetar (`componentes`, `componentesDelMapa`); por qué no se pisa, `muroBlocker` (lo dice `porQueNoLlega`); qué tramo de las casillas del agente entra, `tramoDelRecinto` (`tramosDeCasillas`); lo que lo impide dicho para la persona, `problemasDeRecintos` (borde, separación, nada dentro, una ciudad sobre el río, un camino que cruza la muralla o que entra por la puerta y no sigue, una región que llega a un acceso sin camino que entre: sin camino no hay puerta, y una región que el recinto parte; lo llaman `validateMapPlan` y el final de `vestirRed`). Lo leen la escena, la prosa del agente y los tests; lo declara solo él (lo vigila `invariantes.test.ts`) |
| La ciudad del mapa: su recinto (octógono, puertas, anillo y casas) | `render/escenario/recinto.ts`, puro: el 3 × 3 es el del núcleo (`recintoDeLaCiudad`); el octógono, `contornoDelRecinto`; lo que roza, fuera, `sendasSinRoces`; qué caras llevan puerta, las del núcleo, `puertasDelNucleo` (→ `puertasDeLaCiudad`: la escena no las deduce); el paso por el arco, `tendidosDeLasPuertas` (la puerta del núcleo de cada cruce, con su salida, `salidaDe`) → `sendasPorLosTendidos` (`celdas.ts`, la misma mecánica que las rampas, `tendidoDeBajada`); anillo y casas, `recintoDe` (llena: libres solo donde pisa el héroe, `LIBRE_BAJO_EL_HEROE`/`tapaElPieDelHeroe`, y la calle corta de cada puerta, `callesDeLasPuertas`, `FONDO_DE_LA_CALLE`, `MEDIA_CALLE`; ninguna casa tapa el vano de un arco, `vanoDelArco`/`tapaElArco`, por la silueta de su imagen, `Modulo.silueta`), y el papel de cada pieza, `Sprite.recinto`; sus módulos y sprites, `modulosDelRecinto` y `spriteDelRecinto` (`colocar.ts`); la huella, `casillasDeLaHuella`; lo de dentro, `celdasBajoLosRecintos` y `pintarPlazas` (`huella.ts`), la plaza con sus lados, `ladosDeLaPlaza` y `enLaPlaza`; el óvalo del dueño, `Escenario.claveDeLaMarca`; el fuego, `luzDelRecinto`; los guardias, `huecosDelAnillo`, `anilloSobreLaSenda`, `sendasFueraDeLaPuerta`, `puertasSinSuCamino`, `casasRepetidasJuntas`, `arcosTapados` y `puentesSobreElAnillo`. Lo que pisa un puente en el suelo, `ejesDeLosPuentes`; el de la ciudad-puente, acortado al pie de la cara del río, `puenteDeLaCiudad` (`puentes.ts`) |
| Material de una cara (pared, ladera, pedregal) | `materialDeCara` (`render/escenario/colocar.ts`) |
| Roca de lo alto de un acantilado (picos, peñascos, reborde) | `materialDeLaCima` (`render/escenario/bordes.ts`) |
| Suelo de la meseta de una barrera (roca de pared, cima y macizo, y el suelo que se pinta) | `sueloDeLaMeseta` (`render/escenario/bordes.ts`); en la escena, `sueloQueSePinta` |
| Qué barreras admiten los niveles de dos regiones | `admiteLosNiveles` (`terrain.ts`), que leen `barrerasDeLaPareja`, `candidatasSinMuro` y `problemasDeNiveles` |
| Franja de barrera (8-conexa, con las regiones que toca) | `franjasDeBarrera` (`regiones.ts`), que leen `relieve` y `problemasDeNiveles` |
| Nivel de cada casilla de la escena | `nivelesDelRelieve` (`core`, de `MapRegion.nivel`; nada lo inventa), que aplican `relieve` y el generador (`quitarEspigas`) |
| Qué muro se queda: la muralla, el cierre de un paso (generador, guardia y medida) | `lineaDeLaPuerta`, `muroDeLaLinea`, `murallasDeLaRejilla` / `murallasDelMapa`, `juntoACiudad` (`core/map/murallas.ts`) |
| Muralla de una franja de muro (línea, torres, guardia) | `trazaDeMuralla`, `torresDe`, `murallaSinLeer` (`muralla.ts`); torres apiladas, `seApilan`; lo de alrededor, `alrededorDeMurallas`; en la escena, `meterEnLaMuralla` |
| Un muro de norte a sur (la muralla del mapa y las caras del este y del oeste del recinto) | `tiradaNorteSur` (`render/escenario/tirada.ts`): un solo módulo `muro-ns-*` al mismo alto, la pieza de delante donde iba siempre y cada una a un paso de la de delante, que tapa su testero (el corte de su punta); el arte es recto y sin testeros, pedido con su guía (`muro-ns`, 21-10-2026: el de antes se torcía ~0,4 casillas en tres pasos, s105), y el ancla (la junta de delante, en el eje del muro) y el paso son de la imagen, registrados sobre la guía y afinados por las almenas (`Pieza.tirada`; lo deriva `pnpm taller derivar-muros`, `tools/taller/muros.ts`, que lanza con una pieza que se tuerce más de `TORCIDO_MAXIMO`, y lo vuelve a derivar `arte-hojas.test.ts`); en el mapa, los pasos de norte a sur seguidos de una columna sin puerta en la junta (`tiradaDelMapa`); en el recinto, delante o detrás de la torre de cada punta según la geometría (`ordenDelAnillo`). El guardia, `testerosAMediaTirada` (`informe.testerosAMediaTirada`, `testerosDeLaEscena`) |
| El orden de pintado del anillo de una ciudad (torre y cada pieza de sus dos caras) | `ordenDelAnillo` (`render/escenario/recinto.ts`, 21-10-2026, marca s16 (11, 6): la torre del vértice de arriba de la puerta del noreste tapaba el pilar del torreón): cada pieza es un sólido de su guía (la torre, un cilindro en su vértice; el tramo, un muro de `GRUESO_DEL_MURO`; la puerta, con su torreón de `LARGO_DEL_TORREON` × `GRUESO_DEL_TORREON`; la de norte a sur, su adarve, `solidoDe`) y, donde se solapan en pantalla, se pinta después la que tapa más (`loQueSeTapan`, punto a punto por lo que cada una tiene más cerca de la cámara); lo que no cumple baja la clave de la que va antes, nunca sube la de la que va después (21-10-2026: la torre de abajo del este o el oeste subida a la clave del tramo en diagonal se pintaba encima de 119 pinos y picos de 1-40 que tiene delante), y la casa que se pintaba antes que una pieza bajada por delante del medio baja con ella (`techoDeLaCasa`; `casasEnSuOrden` lanza si eso la pasa detrás de la fila de detrás). El guardia, `anilloMalOrdenado` (`informe.anilloMalOrdenado`, con la clave de cada sprite) |
| Un hechizo: su formato, si vale y su catálogo (06-11-2026, el editor de magia; `docs/agents/2026-11-06-editor-de-magia/`) | el tipo es el JSON (`Hechizo`, `core/magia/formato.ts`: entrega, objetivo, área, afecta, duración, `seAcabaSiMuere` y efectos de un vocabulario cerrado, cada palabra con su frase en `VOCABULARIO_DE_LA_MAGIA`); todo lo que no vale a la vez, `problemasDelHechizo` y `leerHechizos` (`magia/validar.ts`), y como poder de una unidad, `problemasComoPoder`; `data/hechizos.json` lo importa solo `magia/catalogo.ts` (`HECHIZOS_DEL_JUEGO`, `hechizo`, `hechizosDelGremio`, `ordenDelLibro`, `nombreDeHechizo`; lo vigila `invariantes.test.ts`); lo que hace en una frase, `queHaceElHechizo` (`magia/dicho.ts`); lo que el editor le hace, `magia/editar.ts` |
| Lanzar un hechizo (del héroe y poder de una unidad) | la batalla lleva su libro resuelto al montarse (`BattleState.libro`, `createBattle(…, hechizos)`; uno, `hechizoDeLaBatalla`); quien lanza, `Lanzador` (el cuerpo del héroe con su poder, o la unidad con poder 0); qué se apunta, `queSeApunta`; si vale, `castBlocker` y `poderBlocker` (con `apuntadoBlocker`: entrega, bando, distancia); a quién alcanza, `afectadosDe`; **la única aplicación**, `lanzarHechizo` (`battle.ts`: lo diferido, `hechizoEnElAire`, cae en `caerElHechizo`; a una unidad, el hecho de siempre; a varios, un `spell_hit` por alcanzado); lo que cuelga, `efectoColgado`, `cuantoDura`, `resolverEfecto`/`resolverDisparador` (`battle/spells.ts`); los disparadores, `saltar`; la muerte, solo `anotarLaMuerte` (quita lo de «se acaba si muere» y salta `alMorir`; lo vigila `invariantes.test.ts`); la previsión, `previsionDeLanzar` (`impactos`), que lee también la IA (`rindeDe`). Un poder es un hechizo de `Unidad.hechizos` (`data/poderes.json` se fue); `UnitInfo.poderes` lo pone solo `unidadDeCombate`. En el cliente, `PoderesDeLaActiva` y `LibroDeBatalla` (lo que va a una casilla, `loApuntadoEnCasilla`; sobre sí, se lanza al elegirlo) |
| Lo que dura un hechizo sobre un stack | `StackEffect` es una unión por `kind` (`effects.ts`: las cifras, con `effectTotal`; `impide`, leído solo por `impedidoPor` desde los `*Blocker`; `escudo`, gastado solo en `herir`; `disparador`, con `disparadoresDe`); la armadura con lo de un hechizo, `armaduraEnLaPelea`; la fuerza y la agilidad en el daño, `danioConLosEfectos` (`unidad/cuerpo.ts`, desde `deUnGolpe`); su texto, `dichoDelEfecto` y `dichoCortoDelEfecto` |
| El editor de magia (arena) | `client/arena/magia.ts` (`montarEditorDeMagia`, la vista `?vista=magia`); la arena pelea con los de la página (`MontajeDeArena.hechizos`), los cambia a media pelea con el retoque `hechizos` y los lleva en el enlace (`hechizosDelMontaje`, versión 21); «Guardar» escribe `data/hechizos.json` (`escribirCatalogo`, en `FICHEROS_DEL_CATALOGO`) |
| Cambiar cifras a media pelea (arena) | `retocarEnBatalla(state, r, catalogo)` (`core/arena.ts`, con el catálogo de la pelea, `catalogoDeLaPelea`; lo gastado se conserva con `gastadoDeMas`); el tipo de un stack, `tipoDelStack`; el parte, el evento `retoque` |
| Salir del contacto | `battle/contacto.ts`: lo que cuesta salir con N al lado, `salirCuesta`, y la frase de quien no sale (`fraseDelContacto`, que nombra la Finta si fue ella); en `battle.ts`, cuántos hay en contacto, `enContactoEn` (la única cuenta, por `canReachMelee`, a distancia 1), lo que cuesta salir de cada casilla en un recorrido (`costesDelPaso`: el volador, solo al despegar), por qué no sale (`contactoBlocker`, que leen `movimientoBlocker` y el panel) y el recorrido (`recorrer`, que leen `movableFrom` y `porElLado`; sin enemigo cerca, la búsqueda de siempre); la búsqueda con costes, `alcanceConCostes` (`board.ts`, igual que `reachable` con coste 1, con `CosteDeSalir`), y la carrera de la carga por la recta, `carreraConCostes` (desde `medirCargas`) |
| Armadura (#262) | la resta, `trasLaArmadura` (`battle/armas.ts`; la llama `herir`, así que todo lo que quita vida la paga; la leen también la previsión, el índice y `expectedDamage`); la lectura, `armaduraDe` (`UnitInfo.puntosDeArmadura` lo escribe solo `conEquipo` y lo leen él y `battle/armas.ts`; lo vigila `invariantes.test.ts`); qué pieza la lleva, la de su hueco (`camposDelHueco`), y ninguna da PV (`problemasDePieza`); lo que paró, `parado` de punta a punta (`Herida`, `TrasLaArmadura`, el evento y el lienzo) |
| Dónde responde cada sector de la rueda y dónde va lo suyo | `formas` (un `<clipPath>` por tipo con la forma de `sector`, la que pinta el disco) y `ajustarLaRueda`, que recorta a ella cada botón, del tamaño del plato (#258); el rótulo y el «ⓘ», por el ángulo del sector, `sitioEnLaRueda`, y hacia dónde abre su nota, `haciaDe` (`client/batalla/rueda/rueda.ts`): nada se coloca por tipo |
| Los dos que se cruzan en la rueda | `contrincante` (`batalla/rueda/rueda.ts`), con su figura (`figuraDelContrincante`, `FigurasDeLaRueda`, `batalla/rueda/figuras.ts`, que anima `DialogoDeLaRueda`) y quién mira, de la sesión (`SesionConRueda.quienMira`: con uno, «Tu golpe», «Tu respuesta», «(tú)» y «(rival)»; el espectador, nadie); lo que cada página pone alrededor, `CaraDeLosContrincantes` (la arena, `caraDeLaArena`: el botón de su ficha de solo lectura, `abrirEditor(…, true)` en `arena/main.ts`, y su vista previa, `vistaPrevia` y `filasDelStack`, las mismas filas del panel de la activa, con `efectoEnCurso` de `views/panels.ts`); en el tablero, `EscenaBatalla.enLaRueda` → `VistaBatalla.enLaRueda` (#261; el espectador, de `BattleAnimator.losDelCruce`) |

| El puesto en la escena (05-11-2026, fase 4 del puesto fronterizo; `/simplify` el mismo día) | **cada obra es una pieza más de la escena, con su condición** (`Sprite.deNodo`, `DeNodo`: el nodo y cuándo se pinta, `CuandoSePinta`), y el hito del nodo también (`cuando: 'neutral'`); **la única regla de lo que se pinta en un nodo**, `seVeConSuNodo` (`render/escenario/puestos.ts`: el hito, sin dueño sabido; la obra, con dueño y su mejora), que leen `volumenesALaVista` (`mapa.ts`, con el dueño y la mejora que se saben) y el taller (`pintarEscena`, todo neutral); si un sprite es una obra, `esObra` (`Obra`). **Dónde va lo decide `componer`** (paso 2a), para todo nodo, con `sitiosDeLosPuestos`: el pie más cercano al centro del nodo (en un puente, a su tablero; de `CORRIMIENTOS`, a pasos de 0,1 hasta `LEJOS_DEL_NODO`, 3, y más caro por delante del pie del héroe, `COBRO_POR_DELANTE`; solo si ahí no hay sitio, hasta `LEJOS_SIN_SITIO`, 3,5: s1 del 64×64) cuya envoltura (`envolturaDelPuesto`: la mayor obra por cada lado, `envolturaDeLasObras` de `alrededorDeLaObra`) cumple `dondeNoVaUnPuesto` (`colocar.ts`: no pisa, en un solo índice, la huella de la senda, de una rampa ni de un tablero, ni el eje de un paso, `SEMIANCHO_DEL_PASO`; apoya en tierra que no es agua, muro ni recinto; no toca un objeto ni su reserva, ni **un recinto hasta el pie de sus torres** (`hastaElPieDeSusTorres`: su envoltura acaba en el muro sur), ni el puente de otro nodo ni una pieza de bajada en ningún orden (su clave sube después), ni, si se pinta después, una pared, su puente ni **la muralla por venir, medida en su línea**, `murallaPorVenir`: sus tramos, `tramoDelPaso`, y sus torres, `torresDe` y `torreDeLaCasilla`, las mismas que pone `vestirMuralla`), y no toca al héroe parado en el nodo (`cajaDelHeroeEn`, de `pieDeFigura`, `figuras-del-mapa.ts`). Su clave es la de su pie, como todo volumen. Su reserva entra en `reservas` como la de un objeto o un recinto (`reservaDelPuesto`: dos trazos por su planta; lo que se aparta no apoya el pie en ella y lo de delante no la cubre), así que la ven `Obstaculos`, `reservaEn` y `meterEnLaMuralla` (una regla para objeto, recinto y puesto), y `basesSobreReserva`. La escala de cada obra es la de su arte registrada sobre su guía (`Pieza.puesto.pxPorCasilla`, de `pnpm taller derivar-puestos`, `puestoDerivado`, que `catalogoValidado` exige a toda `puesto-*` y a ninguna otra); sin pieza, la de su guía, `MEDIDAS_DEL_PUESTO` (`obraDelPuesto`). Sin imagen (no ha llegado, o no hay), el mapa pinta en el sitio de la obra su marcador a su escala, en cada fotograma, y la bandera va en lo alto de lo que se ve (`cajaDeLaObra`: sin el margen del recorte, `MARGEN_DEL_RECORTE`, `shared/arte.ts`, el que usa el trabajador). Las obras de un nodo, `Escenario.puestoDeNodo` (de los volúmenes; sin sitio, ninguna). Los guardias: las obras pasan por los de siempre (`spritesSobreSenda`, `pasosTapados`, `pasosAtravesados` —también en la puerta de muralla—, `puentesTapados`), más `informe.puestosSinSitio` (nodos sin sitio y obras que tocan al héroe de su nodo, `puestosSobreElHeroe`) e `informe.puestosTapados` (lo que el pintor pone después, en el orden de `separar`, y la toca, `puestosTapados`, con `HOLGURA_DEL_PUESTO`) e `informe.puestosQueTapan` (lo horneado de otro objeto que se pinta antes y la obra toca, `puestosQueTapan`: la torre de un recinto), todos a 0 en 1-40 y en 1-6 del 64×64 (`test/pasos.test.ts`). **La sombra de lo que se elige por su nodo no se hornea** (`seHorneaSuSombra`, `pintar.ts`: horneada, cada nodo llevaba las tres de sus obras, también el neutral, QA de la fase 4): la pinta el mapa bajo todo volumen solo de lo que se ve (`pintarSombraAlPie`; sin imagen, la del marcador), y el taller la del hito. Las piezas, `PIEZA_DEL_PUESTO` (`assets/mapa/puesto-caseta`, `-torreta`, `-torre`), pedidas con su guía (`PUESTOS`, `guiaDelPuesto`, `DIBUJO_DE_LA_OBRA`, `escribirGuiasDePuestos`, `tools/taller/mapa.ts`; `pnpm taller encolar --puestos`); toda guía de geometría la escribe `escribirGuia` y se encaja con `encajar` (`tools/taller/guias.ts`) |
| Un mundo: si vale y dónde no (F1a del mapa vivo, 22-10-2026) | `problemasDelMundo` (todos de una vez, con fichero y ruta, para el motor) y `leerMundo` (lanza con ellos), `core/mundo/validar.ts`: la misma para `pnpm mundo validar`, el servidor que lo genera y la página, con las piezas de `core/validar.ts` que devuelven el motivo (`enteroBlocker`, `problemasDeObjeto`, `listaBlocker`, `deLaListaBlocker`; las que lanzan las envuelven). `leerMundo` da un `MundoLeido` **con marca**, que solo pone él (lo vigila `invariantes.test.ts`), y `newGame({ mundo })` lo juega sin juzgarlo otra vez. El `mundo.json` no repite lo que sabe el plan: la facción de quien juega es la de la base del jugador 0 (`MundoLeido.faccion`). **La biblia** (`biblia.md`, la trama en prosa que el motor escribe antes que la historia) se juzga solo en disco: `problemaDeLaBiblia` (que esté y lleve al menos `PALABRAS_MINIMAS_DE_LA_BIBLIA`, 400; `tools/mundo/disco.ts`), en `validarEnDisco`, que leen `pnpm mundo validar` y el servidor que genera; la página no la pide (`cargar.ts`): el juego no la lee y ningún mundo va al build. Un fichero del mundo que está pero no se lee (un directorio con su nombre) se dice con su nombre y su ruta del repositorio (`NoSeLee`). La espera del menú solo da por buena la respuesta a una llamada del motor a `pnpm mundo validar <id>`, por su `tool_use_id` (`llamadasAlValidador`, `respuestaDelValidador`): la skill lleva la frase «vale». El id de un mundo, `idDeMundoBlocker` y `parseMundo`; los tamaños del menú, `TAMAÑOS_DE_UN_MUNDO`, con cuántos lugares lleva cada uno (`lugaresDelPlan`, que la lectura da al motor como `lugares`); un fichero que no es JSON, `noEsJson` (la página y la CLI); un pedido que no vale, `pedidoBlocker` (`core/mundo/partida.ts`: un tamaño que no es del menú y el héroe de otra facción se rechazan antes de lanzar el motor, en `leerPedido` y `mundoNuevo`; `leerPedido` rechaza también las claves que no lleva, y un id que ya existe es un 409, `Conflicto`, antes de lanzar nada); una generación fallida en la que el motor no escribió nada (ni biblia ni historia) borra su carpeta, `borrarSiElMotorNoEscribio`, y la que deja la biblia sola la conserva para mirarla (son minutos de Opus); una cancelada la borra entera, `borrarMundoGenerado`, solo si es un `gen-*` (`esGenerado`, `tools/mundo/disco.ts`: un id puesto a mano no se borra nunca); cancelar mientras se pinta el mapa no lo para, pero no deja lanzar otra hasta que acabe (`Generacion.viva`); el progreso, sin rutas absolutas, `sinRutas`. Las palabras del vocabulario, cerradas y con su frase para el motor, `VOCABULARIO` (`core/mundo/formato.ts`; la lectura las saca de ahí, no de la skill) |
| El banco de figuras de NPC (22-10-2026, `docs/agents/2026-10-22-banco-de-npcs/`, la rebanada de personajes de la F2 del mapa vivo) | `data/npcs.json` (metadatos: id, descripción, etiquetas, talla, acciones y quién la pidió; su ruta, `RUTA_DEL_BANCO`, y la del arte, `CARPETA_DE_LAS_FIGURAS`, en `core/gente/banco.ts`), que lee y escribe **solo** `tools/npcs/banco.ts` (`leerBancoDeDisco`, escritura atómica con `tools/comun/json.ts`, la de la arena, `aceptarPeticiones`; lo vigila `invariantes.test.ts`), y `assets/npcs/<id>/` (el arte, fuera de `assets/unidades/`: no es tropa, la arena no la lista). La forma, `leerBanco` (todos los problemas a la vez), `problemasDeFigura`/`problemasDePeticion` y el vocabulario cerrado de etiquetas con su frase para el motor, `ETIQUETAS` (cada palabra, `etiquetaBlocker`, que lee también `data/vecinos.json`) y `ACCIONES_DE_NPC`, y el id de una figura, `idDeNpcBlocker`, en `core/gente/banco.ts` (el núcleo no lee el fichero: recibe el `Banco`). **Pintada o pendiente no se escribe**: se deriva de sus ocho `dN/atlas.json` en disco (`estadoDeFigura`, con `arteEnOchoDirecciones`, `tools/taller/arte-en-disco.ts`, el de la arena). La página lo pide a `/__npcs` (`tools/vite/npcs.ts`, `loQueSeSirve`, una `listaDelDisco` como la de hojas de la arena; emitido en el build) y lo carga `render/figuras/gente.ts` a la vez que el mundo y antes de la partida (`entrada.ts`): un banco roto lo dice `comun/arranque.ts` |
| Qué figura lleva la gente (la de la base y la de los lugares) | la base: `figurasDeLaGente` (`core/gente/figuras.ts`: toda la gente de la facción, `personasDeLaFaccion`, en orden fijo; de las pintadas de su facción, misma especie > mismo sexo > sin usar en la base > mismo oficio > hash de semilla, facción, persona y figura; sin ninguna, `null` = el Y Bot civil, `CUERPO_DE_VECINO`; con mundo, `Historia.base` manda en la base de quien juega); un lugar: `PersonaDelLugar.figura` (el `cuerpo` del catálogo se retiró), y mientras la suya se pinta, la más parecida, `figuraQueSePinta` (`core/gente/banco.ts`, `laMasParecida`; los dos reciben el `BancoPintado`). Los ids de la gente, `ID_DEL_ALCAIDE`, `idDeEncargado`, `idDeVecino` (`gente/voces.ts`). En el cliente, cuerpos `npc:<id>` (`cuerpoDeGente`, `cuerpoDeLaPersona`, `render/figuras/cuerpo-de-gente.ts`) en la misma tabla que todo cuerpo (`CUERPOS`, `registrarGente`), cuyo arte dice qué clips pinta (`ArteDeFigura.clips`: la gente, los de `reposo-y-marcha`, `idle`, `walk`, `charge`, sin cadáver; un solo validador, `comoDireccion8d(…, clips)`): `arteDe` **lanza** con el que no tiene los de pelea, y lo de pie lo pide `arteParaPintar(cuerpo, clip)` (`colocarFigura`, `msPorCasilla`), que lanza con un clip que su arte no pinta. La batalla, el animador, la rueda, la arena y el espectador no la nombran (lo vigila `invariantes.test.ts`) |
| Pedir figuras (el motor y la semilla) | `Historia.figuras` (peticiones, como mucho `FIGURAS_NUEVAS_POR_MUNDO` = 4, cada una usada y con un id libre; la regla, `problemasDePeticiones`, `core/gente/banco.ts`, la misma en `problemasDelMundo(…, banco)` y al aceptarlas, `aceptarPeticiones`); al validar la historia del motor, `aceptarElMundo` las pasa al banco y reescribe la historia sin ellas, y `lanzarElTaller` (`tools/mundo/motor.ts`) lanza `pnpm npcs trabajar` en su propio grupo, uno a la vez, con su registro en `.cache/taller/npcs-<fecha>.log`. A mano, `pnpm npcs pedir <fichero>` (la semilla, `tools/npcs/semilla.json`). Lo que se encarga sale del disco, `encargosQueSiguen` (`tools/taller/npcs.ts`: identidad → giro → hojas A, y B con `todas`, sobre el maniquí civil con profundidad, `_poses/gente/civil-8d/`, `pnpm taller maniqui --civil`), y **se encadena solo** (decisión del usuario): cada encargo lleva `despues: encadenar-npc` y el trabajador encola lo que sigue (`encolarLoQueSigue`, sin repetir lo que ya está en la cola). Qué hojas lleva cada figura, una tabla (`shared/arte.ts`): `hojasDeFigura(dispara)` la tropa y `hojasDeLasAcciones(acciones)` la gente, con sus clips, `clipsDeLasHojas`; qué se junta y cómo se deriva una carpeta `…/<id>/dN/`, `derivacionDeLaCarpeta` (`tools/taller/juntar.ts`, unidad o figura del banco), que leen `juntarDireccion` y `pnpm taller derivar`, y `derivarAtlas(…, { hojas })` la deriva con justo sus filas. `pnpm npcs encolar` repesca lo pedido sin cola y `rehacer` borra una figura mala y la vuelve a encolar. **Una figura no se queda a medias para siempre** (vuelta 1 de QA, 22-10-2026): un encargo de NPC que falla se reintenta solo hasta `REINTENTOS_DE_NPC` (2) veces, con la cuenta en su ficha (`Ficha.fallos`, `Cola.reintentar`; `reintentarSiQueda`, que llama el trabajador al fallar), y `pnpm npcs trabajar` al arrancar rescata lo que falte de toda figura sin nada vivo en la cola (`rescatar`, `tools/taller/npcs.ts`); qué hace el taller con una sin pintar, de la cola en disco, `fotoDelTaller` y `fraseDelTaller` (`tools/npcs/en-el-taller.ts`, con los ids de sus encargos, `prefijoDeLaFigura`, `esEncargoDeNpc`): «el taller la está pintando» solo con algo suyo pendiente o en curso con su trabajador vivo; si no, «el taller se paró porque falló …» o «…porque murió el trabajador que llevaba …», con la orden que lo arregla (lo dicen `pnpm npcs estado`, `/__npcs` y el aviso de `vite build`). **Un encargo en curso sabe quién lo lleva** (vuelta 2 de QA): `tomar` y `retomar` apuntan el pid (`Ficha.pid`), y uno cuyo pid ya no vive es huérfano (`trabajadorDe`, `Cola.trabajadorAhora`): lo devuelven a la cola con sus fallos `rescatar`, `encolarLoQueSigue` y `rehacer` (`Cola.devolverHuerfanos`); sin pid (un trabajador de antes) se da por vivo y la frase nombra `pnpm taller devolver`. Toda ficha se mueve apartándola antes con un `rename` (`mover`: al que llega tarde, `NoEstaEn`) y se encola con `link`, que no pisa (`YaEnLaCola`): dos `pnpm npcs trabajar` a la vez no chocan, y el trabajador que no puede reintentar lo dice y sigue. Lo visible mínimo de una hoja va con el cuadrado de la talla de su figura (`visibleMinimo`, `validarElEncargo`, `tools/taller/validar.ts`: con el 2 % fijo, una figura de 0,7 caía al azar y una de 0,5 nunca pasaba), y `pnpm taller reprocesar` toma lo fallido sin pasar por `pendiente/` y con su cuenta de fallos (`Cola.retomar`). Un mundo sin el banco (`/__npcs` no responde) no se juega y lo dice así (`GenteCargada.sinBanco`, `mundoSinBanco`, `partida/mundo.ts`) |
| La inicial de un lugar o de una cosa (el rombo del mapa, el mojón) | `inicialDelNombre` (`core/mundo/formato.ts`): la de su primera palabra que no es un artículo |
| Dónde puede ir un lugar | `lugarBlocker` (`core/mundo/validar.ts`): dentro y fuera del borde, que se pisa, en una región, fuera de todo recinto y a `SEPARACION_DE_UN_LUGAR` (3) de todo objeto y de otro lugar; lo leen la validación y la lectura para el motor (`lecturaParaElMotor`, sus casillas de muestra) |
| Si una opción de un lugar se puede elegir | `opcionBlocker` y `motivoDeLaOpcion` (`core/mundo/reglas.ts`): las condiciones escritas (`condicionBlocker`) y las de sus efectos (pagar, entregar, que quepa la tropa); la referencia la resuelve solo `resolverOpcion` (que leen `opcionBlocker` y `opcionDe`): y si se puede, **una sola pregunta** (`motivoAlElegir`, privada; desde fuera, `opcionBlocker` y `motivoDeLaOpcion`, que lee `opcionesDe`): el punto que está, **el nodo al que se llega ahora** (`nodosAlcanzables`: desde el inicio y desde donde quedó la conversación de ese punto, `EstadoDelMundo.conversaciones`, por las opciones sin «hace» cuyo `si` se cumple; un premio detrás de una condición no se cobra nombrando su nodo), sus condiciones, **lo ya cobrado** (`yaCobrado`: `EstadoDelMundo.cobradas`, las opciones que dieron oro, pieza o tropa, `daPremio`, y `vencidos`, los encuentros ganados, cada uno con quién, `Cobro`: lo del otro jugador se dice con su héroe y su facción y va antes que la frase escrita) y lo que piden sus efectos. Dónde quedó la conversación es **de cada jugador** (`claveDeConversacion`, `recordarLaConversacion`), y la pantalla la abre ahí (`nodoDeEntrada`, con «Volver al principio»). Así la pantalla no enseña encendida una opción que el núcleo rechace (H2 del QA de la F1a). El recorrido de un diálogo es uno, `recorrido`, que lee también la validación (todo nodo se alcanza, y ninguna opción con «hace» e «ir» corta su propio camino, `noCortaSuCamino`, con lo determinista de elegirla, `trasLosEfectos`). Lo leen la acción `elegir_en_lugar`, la pantalla del lugar (la opción apagada con su motivo) y la IA (`ai/lugares.ts`). El lugar de una casilla, `lugarEn`; por id, `lugarSiExiste`/`lugarDe`; el mundo de la partida, `mundoDe` |
| Lo que hace un lugar | `aplicarEfectos` (`state/game.ts`, privada): la única escritura del estado y las marcas de `GameState.mundo` y de lo que da o quita un lugar, cada efecto con su hecho; la llaman `elegir_en_lugar` y el cierre de su batalla (`alGanar`, `alPerder`). Lo cobrado y dónde quedó la conversación, `anotarLaEleccion` (privada, al elegir), y el encuentro ganado, `applyVictory`, que da también lo de la opción que abrió la batalla (`BattleFoe.opcion`: una opción con batalla se cobra al ganarla, entera) |

`test/invariantes.test.ts` vigila las fronteras de esta sección. Todos nacen en
verde.

## Reglas del juego

Verificadas contra fheroes2 salvo donde dice «regla nuestra».

| Dato | Valor |
|---|---|
| Rejilla de batalla | **regla nuestra** (fheroes2: 11 × 9 = 99): 9 filas, las pares de 12 y las impares de 11 = 104 hexes, offset odd-r, simétrica de izquierda a derecha (`FORMA_DEL_TABLERO`, `espejo`; el índice es compacto, la posición en `allHexes`). El defensor sale en el espejo del atacante, y su disparo va por la recta espejada: la del atacante lleva el empujón (`+3, −1, −2`) y la del defensor su espejo (`lineaDeTiro`), y si en un empate de borde una sale del tablero va la otra (nunca se tira por el marco). Hasta el disparo diferido (25-10-2026) el tiro era generoso, pasaba con cualquiera de las dos (`lineaLibre`, que se fue con él) |
| Tropa | individuos, uno por hex, acotados por el liderazgo (`data/liderazgo.json`, provisional) y por el tope de tropa de la partida, héroe incluido: 3, 5 o 7 (**regla nuestra**, 22-10-2026, decisión del usuario; por defecto 7). Con un tope menor, guarniciones, monstruos y asaltantes nacen recortados a él y el ejército de salida, a lo que quepa; el encuentro de un lugar de un mundo se recorta al pelearlo y al medirlo la IA (`gruposAlTope`), y la tropa que da un lugar cabe en el cupo de la partida |
| Recursos | **regla nuestra** (21-10-2026, decisión del usuario, «solo oro»): solo oro. Sin minas ni montones de recursos en el mapa; el oro sale de las ciudades (su ayuntamiento), de los pueblos (250 al día cada uno, `rentaDelPueblo`, inventado) y de los cofres, y solo cobra lo unido a la base (`rentaDelDia`). Se empieza con 27 500 (`oroDeSalida`: el monedero de antes pasado a oro), y el primer gasto es el héroe de salida (`precioDelHeroe`, 2 500, el de todo héroe; 22-10-2026) |
| Movimiento diario | lo marca el más lento del grupo, **el héroe incluido** (26-10-2026, decisión del usuario: un héroe a pie frena; a caballo, no), cada uno por las casillas de su montura, de guerra o de silla, o las suyas a pie (`marchaDe`, `slowestSpeed`): un caballo de silla solo sube la marcha si lo llevan todos; se fija al empezar el día. **Regla nuestra** (#226): la tabla de fheroes2 (1000-1500) ×√(`AREA_POR_REGION` / `AREA_DE_REFERENCIA`) = ×√1,5 → 1224-1837 (`marchaALaEscala`, `core/escala.ts`); el escalón de una casilla (`crawling`, la agilidad que deja el peso), como el de dos (**regla nuestra**, 25-10-2026) |
| Radio de vista | héroe 4 y castillo 5 en fheroes2 (`getFogDiscoveryDistance`); **regla nuestra** (#229): ×√1,5 al entero más cercano, 5 y 6 (`radioALaEscala`, `core/escala.ts`). El cuadrado, no el disco del original. **Regla nuestra** (02-11-2026, petición del usuario, «la niebla del mapa no visto vaya por regiones… una niebla de eventos en torno a héroes y nodos controlados por el jugador»): el radio ya **no explora**, es lo que se ve pasar (héroes rivales, el estado vivo de los objetos, los grupos y la crónica): 5 del héroe y 6 de cada castillo **y nodo propio**, solo sobre lo explorado (dentro del radio y en negro, no se ve). Lo explorado se descubre por regiones enteras: al pisar una región, la suya; sobre un nodo, una ciudad o el puente de una ciudad-puente, todas las que une; al empezar, las de la base (`core/map/niebla.ts`) |
| Puntos de hechizo | 10 × Conocimiento |
| Moral | −3 a +3. **La moral no tiene efecto en la batalla** (regla nuestra, 26-10-2026, decisión del usuario: «La moral solo debe servir para la huida, nunca dar un turno extra»; con el +1 de una sola facción, un escudero de 6 casillas andaba 6 + 6 en la ronda 1 y cruzaba el tablero): ni da turno extra ni lo quita, y no hay hecho `morale` en el registro. Se sigue calculando (mezcla de facciones, no-muertos, `moraleBonus` del héroe y los edificios) y se ve en la ficha, a la espera de la huida, que aún no existe y se diseñará con el usuario. |
| Suerte | **no hay** (02-11-2026, decisión del usuario: «Elimina la suerte completamente del juego»): ni tirada de golpe afortunado o desafortunado, ni suerte en el stack ni en el héroe (la habilidad `luck`). Se fueron con ella Bendición y Maldición (el gremio de nivel 2 se quedó sin hechizos), el poder Bendecir, el rasgo `curse_on_hit` y la inmunidad de los no-muertos, que era solo a la mala suerte (los hechos `luck` e `immune`) |
| Moral por mezcla de facciones | se cuenta al empezar la batalla y no se recalcula al morir un stack (como fheroes2, #49) |
| Moral con no-muertos | −1 a todo el ejército que lleve alguno, y anula el +1 de una sola facción (como fheroes2, #199); el no-muerto sigue a 0. **Sin copiar**: allí un ejército de una sola criatura repetida no cobra el +1 (`AllTroopsAreTheSame`) |
| Prisa/Lentitud | duran el poder mágico del lanzador, en rondas |
| No-muertos | moral 0 |
| Iniciativa | cada bando por velocidad y puesto; un empate entre bandos lo gana el contrario del último que tuvo turno, el atacante el primero (como fheroes2, `GetCurrentUnit`, #199). **Divergencia pendiente**: la velocidad es la de empezar la ronda; allí una Prisa a media ronda adelanta |
| Dos efectos del mismo origen | refresca la duración (la mayor), no se acumula |
| Turno de una unidad | **regla nuestra**: se mueve en tramos hasta gastar su velocidad; atacar o apuntar lo cierra, y «Terminar turno» (`end_turn`), también sin moverse; tras moverse no apunta. Sin defenderse ni esperar (26-10-2026, decisión del usuario: «Quita las acciones de defender y de esperar»); el agente que manda `wait` o `defend` lee que se retiraron y que mande `end_turn` |
| Despliegue | **regla nuestra** (02-11-2026, petición del usuario: «En un combate el despliegue lo hace primero el atacado, sin los enemigos, y luego el atacante con los enemigos visibles»): toda batalla empieza en despliegue; despliega primero el defensor sin ver al enemigo y después el atacante viéndolo, y luego, en el mismo orden, lo que despliega «tras el enemigo» (hoy nadie). Cada unidad, el héroe incluido, en las 3 columnas de su borde (`COLUMNAS_DE_SALIDA`) salvo lo que diga su `despliegue` (la infiltración, por hacer), sin muro debajo; se parte de la formación guardada del héroe, o de la regla de siempre (el héroe en el centro de la columna del borde y la tropa, por su puesto, del centro hacia fuera). La persona lo cierra con «Listo»; la IA, el agente y lo que no es de nadie despliegan solos. El desempate de iniciativa sigue por puesto en la tropa, no por casilla |
| Disparo diferido | **regla nuestra** (25-10-2026, petición del usuario, **sin validar y sin ningún test** hasta que la juegue: «podría no ser jugable o tener que cambiarlo mucho»): un tirador sin moverse y sin un enemigo al lado **apunta** a una casilla del tablero (`aim`, cualquiera menos la suya) y eso cierra su turno. **Al empezar su siguiente turno**, antes de que elija nada, sale el disparo desde donde esté por la recta que une el centro de su casilla con el centro exacto de la apuntada (`lineaDeTiro`), y da al **primero** que encuentre en una casilla que la recta atraviese, aunque solo le roce una esquina, **sea del bando que sea**, también tras la casilla: la recta sigue hasta el borde del tablero (01-11-2026, decisión del usuario: «no debe acabar en la casilla apuntada, en las siguientes también da»); sin nadie, no da a nadie. Desde el suelo sube a lo alto del muro y da al primero que haya arriba; lo para bajar del muro (lo de detrás no se alcanza) o una puerta cerrada; desde lo alto de la muralla, nada (06-11-2026). La tirada va por la horquilla del arma de distancia: en el cuarto `max(0, 4 − o)`, con `o` los octavos de casilla a que pasa la recta del centro de la casilla del alcanzado (01-11-2026, decisión del usuario: «que sea por la distancia de la línea de tiro al centro de la primera casilla donde hay alguien»; los octavos, inventados: por el centro, la máxima; a media casilla o más, la mínima; antes, por la distancia a la casilla apuntada), y luego ataque contra defensa y armadura como siempre; `double_shot`, dos tiros, cada uno al primero de la recta; la salpicadura no toca al tirador. Si el tirador muere o la batalla acaba antes, se pierde. Tras el disparo el turno sigue: apunta otra vez o actúa como siempre. Fuera el −50 % a más de 5 casillas. La casilla y la recta se ven para los dos bandos, con cada casilla de la recta teñida por la tirada que daría en ella |
| Armas de fuego | **regla nuestra** (02-11-2026, petición del usuario: «Como podrian funcionar las armas de fuego? Y las granadas? Me gustaria evitar meter un factor aleatorio»): pistola, arcabuz y culebrina disparan como el disparo diferido, sin dado, con dos diferencias. **Perforan la armadura** («Nada, fija»): su disparo llega entero. **Recargan**: tras salir el disparo, la unidad pasa los turnos de `recarga` de su pieza sin poder apuntar, contando el del disparo (decisión del usuario: con 1, apunta un turno sí y otro no). Su horquilla es la de su propia agilidad, [F, F × agilidad del arma] (decisión del usuario: «agilidad del arma»): la pistola, de agilidad 1, pega siempre lo mismo. Las cifras, a ojo y ya en la escala de los humanos a fuerza 3, en `data/equipo.json` |
| Granadas | **regla nuestra** (02-11-2026, misma petición): una pieza de `distancia` con `tiro: granada`; quien la lleva no es tirador: **lanza** (`throw`) a una casilla a su alcance —la fuerza de su cuerpo, al menos 1 (decisión del usuario: «Fuerza»), ni la suya—, sin moverse y sin un enemigo al lado, y eso cierra su turno. Va **por encima**: no la para nadie, ni un muro ni una puerta. **Explota al empezar su siguiente turno**, antes de que elija, en la casilla (la tirada en el cuarto 4 de la horquilla de su golpe a distancia) y en sus seis vecinas (el cuarto 2), a todo vivo de cualquier bando, quien la lanzó incluido; la armadura se resta como siempre; sin dado (`data/granada.json`, inventado). Si quien la lanzó muere o la batalla acaba antes, no explota. **Se gastan**: cada portador empieza cada batalla con las `cargas` de su pieza y lanzar gasta una (vuelve la munición, solo para ellas); fuera de batalla ni se gastan ni se compran. La diana y su anillo se ven para los dos bandos |
| Carga montada | **regla nuestra** (26-10-2026, decisión del usuario: «la lanza lo único que hará es usar la fuerza de la montura en la carga»): con una montura de guerra y una lanza puestas, el primer golpe de la carga tira [F, F × agilidad del jinete] con F = la fuerza de la montura más la de la lanza (con dos lanzas, la que más fuerza pone), y cobra lo de todos, +5 %/casilla hasta 5; el +10 % del jinete y el rasgo `charge` se fueron (una unidad que lo escriba se rechaza diciéndolo: montar es llevar una montura de guerra). Montado sin lanza, o a pie, carga como todos con la horquilla de su arma |
| Carga | **regla nuestra** (#260, 14-10-2026; en toda batalla desde el 19-10-2026): todo el que pega cuerpo a cuerpo (también el tirador y el héroe) carga con la recta, +5 %/casilla, tope 5 (inventado, `data/carga.json`), la misma para todos desde el 26-10-2026. La IA solo se coloca para cargar si carga montada (`cargaMontada`, `pasoParaCargar`); no busca la recta a pie (antes del 26-10-2026: en 100 peleas de la IA contra la IA (`tools/qa/medidas/arena-ia.ts`, «mezcla», 19-10-2026), 30 cargas a pie y 74 de jinete) |
| `fear` (rasgo del motor; hoy no lo lleva ninguna unidad del catálogo) | **divergencia deliberada**: ataque −2 durante 2 rondas (no aura de moral) |
| Victoria | **regla nuestra**: perder la base elimina en el acto |
| Magia (hechizos) | **regla nuestra** (06-11-2026, el editor de magia: «Crear un editor de magia en la arena para que pueda crear hechizos»): un hechizo es datos (`data/hechizos.json`) con su descripción libre y su coste a mano (maná y nivel de gremio). **Entrega**: libre (a cualquiera, como antes), sobre sí, en contacto, a x casillas (por encima), proyectil (la recta del disparo diferido: el primero vivo, o toda la recta) o el tablero entero, y diferido (cae al empezar el siguiente turno de quien lo lanzó). El héroe lanza desde la casilla de su cuerpo, una vez por ronda, sin gastar el turno; una unidad lo usa como poder con su turno, sin maná y con poder mágico 0. **Efectos**: daño con o sin armadura, cura (sin resucitar), disipar, cifras (ataque, defensa, armadura, fuerza, agilidad, casillas), impedir (golpear, disparar, contraatacar, moverse, lanzar), escudo (tras la armadura) y disparadores (al empezar o terminar su turno, al ser golpeado cuerpo a cuerpo sin ser contraataque, al golpear, al caer), sin anidar. **Duración**: rondas, el poder, hasta que empiece o termine el próximo turno de alguien (tope 2 rondas), toda la pelea, y que se acabe si cae quien lo lanzó o lo lleva. Lo colgado lleva sus números: editar un hechizo a media pelea no lo cambia. Los cinco del gremio dan lo mismo que antes (el banco no cambia); los 38 de ejemplo, ninguno en el gremio. La IA solo valora daño, cura y casillas: lo demás no lo lanza (backlog) |
| Infiltración | **regla nuestra** (05-11-2026, petición del usuario: «Rasgo de unidad, si todos lo tienen incluido el heroe pueden atravesar barreras con movimiento 1, pueden tardar varios dias»; fase A de los infiltrados, la del robo vendrá después): un héroe se infiltra si su tipo lo hace (`data/infiltradores.json`: inquisidor, vampiro, capitán mercenario, mago de los elfos y goblin; inventado, ninguno el de por defecto) y toda su tropa lleva el rasgo `infiltrarse` (penitente, espectro, rodelero, explorador y asesino elfos, goblin lancero y arquero). Ese grupo pisa las cinco barreras, y **cada casilla de barrera cuesta el día entero** (decisión del usuario, «Un día entero»): entra con el día recién empezado y lo gasta todo; si ya anduvo, espera en el borde. N casillas, N días. **Parado en una barrera es intocable** (decisión del usuario): no lo emboscan los asaltantes (no es de ninguna región) ni lo alcanza quien no se infiltra; otro infiltrado sí, y es una batalla. La muralla del recinto de una ciudad no es una barrera y no se abre. Una barrera no es de nadie: ni territorio ni renta. Riesgo aceptado (I10): el Dijkstra suma días como coste, así que una ruta por barrera puede perder el resto del día en el borde y tardar uno más que un rodeo. La IA no la aprovecha (backlog) |
| Guarnición y defensa | **regla nuestra** (04-11-2026, fase 1 del puesto fronterizo, decisiones del usuario; `docs/agents/2026-11-04-puesto-fronterizo/`): toda ciudad, todo paso (nodo que no es ciudad) y todo pueblo es un **sitio** que guarda tropa: todas en `GameState.guarniciones`, con su dueño (quien la dejó, el de la base, o `null` la neutral; la de la ciudad estaba en `Town.garrison` hasta el 05-11-2026). **La guarnición no se recoge sola** (fuera la recogida al pasar por casa, `takeGarrison` y `garrison_taken`): el héroe PARADO en un sitio suyo deja y recoge tropa (`dejar_tropa`, `recoger_tropa`; de su tipo, los que se irían, `elQueSeIria`, o el veterano que se nombre), o la reparte de una vez (`repartir_tropa`, la pantalla de la persona: solo cuenta el reparto final, así que con los dos llenos se cambia uno por otro; D9, 04-11-2026), con el cupo de la guarnición de siempre (`GARRISON_LEADERSHIP` y el tope de la partida) en los tres. El pueblo y la ciudad de dentro de una región son de quien tenga la región; la tropa de otro dentro los **ocupa** (fila «Ocupación»; hasta el 05-11-2026 el pueblo era de quien lo guardaba). **Defensa**: con el héroe en su sitio con guarnición, pelea él (siempre) con lo que se elija de su tropa y la guarnición, hasta lo que le cabe y sin dejar fuera más de lo que cabe en la guarnición; lo propone la IA (`defensaDeLaIA`) y la persona lo puede rehacer antes de la primera jugada; lo que no pelea, si pierde, se pierde con el sitio (la ciudad o el paso pasan al que gana). Sin héroe, la guarnición entera. Una ciudad, un paso o un pueblo con guarnición ajena se alcanza pero no se cruza: pisarlo es pelear contra ella (`BattleFoe` `garrison`, con `site`; la ciudad era `town` hasta el 05-11-2026); vencida, el sitio del muro es del que gana y el de dentro de una región se queda sin ella, y quien gana se queda en su casilla de antes. Un paso tomado pierde la guarnición que tuviera. La IA recoge lo que le quepa **al llegar** a un sitio suyo: el contratado en su ciudad, el que acaba hoy una marcha en él y el que volvió vencido o rendido a su base desde su último turno, también en el del rival (volver es llegar: `Hero.vueltoACasa`; `playAiTurn`, 04-11-2026, S8 de `/simplify` y H2 del QA); el que se queda en casa no la vacía, así que el de salida deja la de su base el día 1. No deja tropa (backlog). La batalla en un sitio se pelea tras su muralla (fila «Murallas del mapa») |
| Ocupación | **regla nuestra** (05-11-2026, tarea 2 del puesto fronterizo, decisiones del usuario P1-P4; `docs/agents/2026-11-05-ciudades-en-su-region/`): las bases y las ciudades-puente van **en el muro** (nodos: se toman como un paso); las demás ciudades, **dentro de su región** (el generador lo hace desde la fase 2), y un pueblo puede ir en el muro, sobre montaña, bosque o acantilado (fase 3: el generador, uno de cada cuatro pares; se toma como un paso). Un sitio dentro de una región es **de quien tenga la región**; si dentro hay tropa de otro —un héroe rival en su casilla o una guarnición que no es del dueño, también la neutral de una ciudad neutral (P1: la tropa no cambia de bando)— está **ocupado**: no da oro y, una ciudad, ni recluta, ni construye, ni crecen sus moradas (la semana se pierde), ni se contrata en ella, ni vende su armería (P4; la armería, desde el `/simplify` del 05-11-2026: «oro y la ciudad entera»). Quien ocupa no se queda el sitio, ni recluta, ni construye, ni deja tropa. Se recupera pisándolo: batalla contra el ocupante, **tras la muralla del sitio** (P3); si el ocupante pierde o se va, vuelve a dar. La IA recupera lo suyo con ventaja clara (`valorDeRecuperar`) y no ocupa a propósito (backlog) |
| Murallas del mapa | **regla nuestra** (04-11-2026, fase 2 del puesto fronterizo, decisiones del usuario D3, D7 y D8): toda batalla contra una **ciudad** (también la base y la neutral) se pelea tras una **muralla de piedra** y contra un **pueblo** tras una **empalizada de madera** (la ciudad o el pueblo que se ataca, su guarnición o el héroe que está dentro, **sea de quien sea**: también el que lo ocupa, P3 de la tarea 2); en un **paso**, la de su obra (fila «Obras del puesto»). Las formas, `data/sitios.json` (copiadas de la arena: la de la ciudad, la «Base derecha» que dibujó el usuario (06-11-2026; antes, la «Muralla gruesa»), que cierra la salida del defensor; la del pueblo, la «Línea con puerta»; se editan sin tocar la arena, que trae de ejemplo la «Base derecha» y su espejo, la «Base izquierda»), **cierran** el tablero y llevan **puertas**, que empiezan cerradas y abre y cierra quien defiende, y se asaltan con **escaleras**: **todo el bando atacante lleva una**, cada stack y su héroe, sin comprarla, y se gasta al ponerla (la puesta la usa cualquiera; quien vuela se posa sin ella). Lo demás es la regla de la muralla de la arena (subir y bajar, el bono de lo alto, el tiro tapado), el mismo bono para los dos materiales: solo cambian la forma y cómo se pinta. La IA de batalla ya la jugaba (`asaltoALaMuralla`, `puertaDelDefensor`, `tiradorAlMuro`); la del mapa **no la pesa** (`ventajaClara` no la ve: backlog). Medido el 04-11-2026 (`tools/qa/medidas/arena-ia.ts`, «murallas del mapa», 100 por forma, un héroe por lado sin libro, 6 contra 5): 0 sin terminar, rondas 8 / 14 (piedra) y 8 / 13 (madera), gana el atacante 19 y 15; en el banco, rondas por batalla 3 / 7 / 11 → 5 / 9 / 19 |
| Obras del puesto | **regla nuestra** (04-11-2026, fase 3 del puesto fronterizo; la petición: «el puesto podrás mejorarlo con empalizadas y murallas»): un paso tomado es un puesto, que nace sin obra (en el mapa, una caseta) y se mejora de una en una y sin bajar: **empalizada** (1 500 de oro, inventado; una torreta de madera) y **muralla** (4 000; una torre), con el héroe del dueño en el paso, pagado en oro y en el acto, sin tope por día. La batalla en el paso se pelea tras la muralla de su obra: la empalizada, la de madera de los pueblos; la muralla, la de piedra de las ciudades (las mismas formas de `data/sitios.json`, con sus escaleras); sin obra, sin muralla. **La obra se queda con el paso cuando cambia de dueño** (es una obra; pendiente de confirmar con el usuario). La IA de reglas no mejora (backlog), así que el banco no cambia |
| Lugares | **regla nuestra** (F1a del mapa vivo, 22-10-2026, decisiones del usuario): un mundo lleva de 1 a 8 lugares (`MapObject` `lugar`, que pone `newGame` desde su historia; el procedimental no los hace; el validador admite de 1 a 8 y **la skill del motor** pide por tamaño de 4 a 5, de 5 a 6 o de 6 a 8, en regiones distintas, con una trama que encadena tres o más por marcas y dos desenlaces excluyentes: cifras que mide `pnpm mundo medir`, no reglas; la trama de los mundos, 22-10-2026), cada uno con estados, puntos (gente, con su figura del banco de NPC, o cosas), diálogos en árbol y encuentros. Se entra **al acabar la marcha** en él (no al pasar): su escena lateral, por la que se anda. Las opciones con efectos son una acción del núcleo (`elegir_en_lugar`), todo o nada, con un vocabulario cerrado de condiciones (estado, marca, oro, lleva, facción, no) y efectos (estado, marca, oro ±, pieza, quitar, tropa del catálogo, batalla); cada efecto, su hecho (`place_state`, `world_mark`, `gold_gained`/`gold_paid`, `loot_found` de un lugar, `item_given`, `troops_joined`). **Cada premio se cobra una vez, por regla del núcleo** (vuelta 1 de QA, 22-10-2026: con dos opciones de estado, Rebuscar ↔ Esperar, un mundo válido se ordeñaba): el mundo recuerda las opciones que dieron oro, una pieza o tropa (pagar no es premio) y los encuentros ganados, y no deja cobrarlos otra vez («ya te llevaste …», «ya venciste a …»); la validación sigue pidiendo que la opción se apague a sí misma, como aviso para que la apagada diga la frase del motor. Lo de después de una opción con efectos e `ir` se elige, porque la conversación de ese punto quedó allí. El encuentro es la batalla de siempre (`BattleFoe` `lugar`, sin héroe ni dueño, con el tope de un grupo neutral y recortado al tope de tropa de la partida, `gruposAlTope`); al ganar, `alGanar` (estado, marca, oro, pieza), al perder, `alPerder` (estado, marca), y se vuelve a la escena del lugar si el héroe sigue en él. La IA de reglas entra con una regla simple (`ai/lugares.ts`: la primera opción que da algo aún no cobrado o abre un encuentro no vencido, con ventaja clara; si no hay, la primera sin premio que lleva a uno en `PASOS_HACIA_UN_PREMIO`, probada sobre una copia del mundo; lo que no lleva a nada no se elige ni hace que el lugar le valga; `VALOR_DE_LUGAR`, inventado). **El mundo es de los dos** (vuelta 2 de QA, decisión del usuario): lo que se lleva uno ya no lo encuentra el otro, y la frase dice quién; dónde quedó cada conversación, por jugador, y al volver se sigue allí. Una opción con batalla da lo suyo al ganarla; perderla no da nada y deja volver. La validación rechaza la opción con «hace» e «ir» que corta su propio camino (saca de la escena a su punto, o apaga lo que solo hay tras ella). **El agente no entra (F4)**: los ve en su mapa y su prosa se lo dice. Sin mundo no hay lugares y el banco no cambia |
| Ciudad amurallada | **regla nuestra** (21-10-2026, decisiones del usuario; fases 1 y 2 de 3): cada ciudad es un recinto de 3 × 3 con ella en el medio (`core/map/recinto.ts`). Ninguna en el borde, dos a 5 casillas o más (Chebyshev) y dentro nada más que ella: ni nodo, ni objeto, ni grupo de asaltantes. **Se entra por sus puertas**: de un acceso a la puerta y de la puerta a la ciudad; el resto del recinto no se pisa, aunque sea hierba, y la puerta y la ciudad cuestan como un camino aunque debajo haya barrera. **Hay puerta donde llega un camino** (en la cara del norte, la del sur o una diagonal, nunca al este ni al oeste), y la del puente de una ciudad-puente, siempre. La ciudad-puente está en tierra y su casilla del río, delante, es su puente. Cada región que llega a un acceso de una ciudad lleva su camino hasta ella (el generador lo traza; un plan del agente sin él se rechaza). El héroe de salida nace en su base (19-10-2026), en el medio del recinto (la casilla de la ciudad, que se pisa), y sale por sus puertas |
| Rueda del golpe | **regla nuestra** (13-10-2026; en toda batalla y sin interruptor desde el 19-10-2026): al golpear cuerpo a cuerpo, quien pega y quien recibe eligen a ciegas un tipo en un anillo (desde arriba y en el sentido del reloj ofensivo, fuerte, finta, defensivo, rápido, r.guardia: opuestos ofensivo y defensivo, fuerte y rápido, finta y r.guardia; Normal en el centro; #263, 14-10-2026): la persona en el diálogo de la rueda, el agente por su contrato (`hit`, `battle_response`) y la IA de reglas a ciegas. El cruce fija la tirada (`min + ⌊(max − min) · p / 4⌋`, por la distancia en el anillo: 0, 1, 3, 4; con Normal, 2) y la respuesta es el contraataque, en `4 − p`. Fuerte (daño ×) y Rápido (2 golpes de daño ×), también en el contraataque; Normal, siempre ×1; lo demás actúa solo al golpear (**la respuesta no da bonificadores**, `cruceDelGolpe(…, papel)`): Ofensivo suma ataque en ese golpe; Defensivo suma defensa desde ya hasta que **empiece** su próximo turno; Romper guardia quita ataque al atacado según el éxito del golpe (`p`), ya en su contraataque y hasta que **termine** su próximo turno; Finta deja andar tras golpear lo que le quede menos lo que reste su éxito (`TurnoDeUnidad.finta`, en `pasosQueQuedan`; solo andar o terminar, `faseBlocker`; andar cierra el turno, y con 0 se cierra solo; ese tramo paga el contacto como cualquier otro, y su nota lo dice). Rápido: cada golpe resta la armadura, y su nota dice que contra armadura pierde; con carga, **solo el primer golpe la cobra** (también el del doble golpe; 14-10-2026). Caducidad en `StackEffect.hasta` (`empezar`/`terminar`, tope de 2 rondas); el mismo origen refresca. **Las cifras son las del nivel del arma** (18-10-2026; niveles absolutos en la vuelta 2, «para que sea más fácil ver la diferencia entre armas»): toda arma de cuerpo a cuerpo (`arma`, también la lanza) lleva un nivel de 0 (lo peor) a 6 (lo mejor) en cada tipo del anillo (`Pieza.rueda`), el mismo en toda arma; del 0 al 6, Ofensivo +0 a +6 ataque, Fuerte ×1 a ×2, Defensivo +0 a +6 defensa, Rápido 2 × 0,25 a 2 × 1, Romper guardia quita con el éxito máximo de 0 a 6 (con éxito `p`, `⌊q · p / 4⌋`: con menos éxito, menos) y la Finta resta con el éxito mínimo de 8 a 2 casillas, y cada punto de éxito una menos, sin bajar de 0 (con éxito `p`, `max(0, m − p)`; 18-10-2026: con la anterior, de 10 a 5 con la Espada, una unidad de 2 a 5 casillas no andaba nunca). Cada golpe con sus armas (con dos, de cada tipo el mejor nivel de las dos, 25-10-2026), el contraataque con las del que responde, y lo que no es daño con las del primer golpe. La Espada, todo a 3 (la versátil; con ella, Ofensivo +3, Fuerte ×1,5, Rápido 2 × 0,63, Romper guardia 0 a −3 y la Finta de 5 a 1); la Maza, Fuerte y Romper guardia 5, Defensivo 2 (26-10-2026), Rápido y Finta 1; la Daga, Ofensivo 1 (26-10-2026); la Alabarda, todo a 4. Sin arma no se golpea: toda unidad del catálogo lleva una, el héroe nace con la Espada y el arma de cuerpo a cuerpo no se quita (`unequipBlocker`, 19-10-2026). Cifras inventadas en `data/rueda.json` y `data/equipo.json`; el disparo, con su tirada. **Ruedas de 5 y de 3** (22-10-2026, decisiones del usuario; la de 7 es lo de arriba): la de 5, Ofensivo-fuerte, Rápido, Romper guardia y Defensivo-finta con Normal en el centro; la de 3, Ofensivo (ofensivo + fuerte), Rápido (rápido + romper guardia) y Defensivo (defensivo + finta), sin centro. Las dos en ciclo: cada sector gana al siguiente en el sentido del reloj (5: Def-finta > Of-fuerte > Rápido > R. guardia > Def-finta; 3: Defensivo > Ofensivo > Rápido > Defensivo); si gana el golpe, 4; si gana la respuesta, 0; el mismo, enfrente o Normal, 2. Un fusionado da cada parte **a la mitad** de lo que la separa de lo neutro, truncada hacia lo neutro (con la Espada: Of-fuerte +1 y ×1,25; Def-finta +1 defensa y anda la mitad de lo que dejaría la Finta; Rápido-romper 2 × 0,56 y quita 0, 0, 0, −1, −1). El índice de poder se mide con la de 7 |
| Armadura | **regla nuestra** (#262, 14-10-2026; en el juego desde el 19-10-2026): las piezas de armadura dan puntos de armadura y ninguna pieza da PV (la brigantina 2, el arnés 3, el gambesón 1, el jubón 1 y la coraza, id `barda`, 7: a ojo, ×0,3 con la escala baja del 26-10-2026, eran 7 / 10 / 4 / 2 / 22; inventados en `data/equipo.json`); cada golpe, disparo, hechizo o poder que llega se queda en `max(0, daño − armadura)`, restado lo último (tras ataque y defensa, multiplicadores, cruce, carga y redondeo), uno a uno (cada golpe de Rápido o del doble golpe, cada tiro, cada salpicado con la suya). El drenaje, la experiencia y el parte leen lo que llegó. Un golpe en 0 se pinta «parado». Con la barda de 22, en 100 peleas de la IA contra la IA (`tools/qa/medidas/arena-ia.ts`, 19-10-2026): 2 de 100 de 3 contra 3 sin terminar (s13, s43; 0 sin ella) y un jinete contra tres flojos gana 92 de 100 (0 sin ella, 76 con los 220 PV de antes). En el juego no hay barda que lo provoque: 0 sin terminar en el barrido y el banco |
| Orden de turnos | **regla nuestra** (fheroes2 lo tiene fijo): en serpiente, quien cierra un día abre el siguiente (día 1 j0, j1; día 2 j1, j0…; `ordenDelDia`, que leen el paso de turno y el `you.turnOrder` del agente). Con el fijo, j0 ganaba 603 de 1 000 y abrir el día valía +65; en serpiente, 534 y +2 (09-10-2026); con las fronteras onduladas de #229, 524 de 1 000 y duración 8 / 14 / 29 |
| Salir del contacto | **regla nuestra** (#259, 14-10-2026; en toda batalla desde el 19-10-2026): salir de una casilla cuesta 1 + los enemigos que podrían golpear cuerpo a cuerpo a quien está en ella (`canReachMelee`: el de lo alto del muro de al lado no cuenta; el del otro lado de una puerta cerrada, sí). Se paga al dejarla; el camino es el más barato; la velocidad es un presupuesto (`pasosQueQuedan`, `turno.gastado`). Si no le llega para salir de su casilla, no se mueve (golpea o termina el turno). El volador paga al despegar y no lo que sobrevuela. La carga cuenta casillas y se paga por la recta, que es lo que anda; si no cabe, no carga. Subir y poner escalera no lo pagan |
| Facciones | **regla nuestra** (19-10-2026, decisión del usuario): templarios, no muertos, imperio, elfos y orkos (`FACTION_IDS`), las cinco de la arena; cada partida sortea dos distintas (`faccionesDeLaSemilla`). Sus moradas y quién produce cada una son las del cuaderno (`NuevaJugabilidad.md` §Ciudades; lo que faltaba, inventado y dicho en el `_comment` de `data/buildings.json`), varias unidades por morada; los tipos de héroe se extraen del cuaderno (`tools/datos/tipos-de-heroe.ts`). Caballeros y nigromantes se retiraron con `data/creatures.json` (lo vigila `invariantes.test.ts`: ni `knight` ni `necromancer` en `src/`, `data/` ni `tools/`) |

- Lo temporal vive en `BattleStack.effects` y se suma al leer, nunca al stack. **Salvo la recarga de
  un arma de fuego** (`BattleStack.recargando`, 02-11-2026): un efecto caduca por rondas con un tope
  de 2, y la recarga cuenta los turnos de la propia unidad y llega a 9.
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
- **La tropa se hace héroe** (solo con agente): un veterano de rango 5 en su base
  dispara `hero_from_troop` al empezar el turno del agente
  (`ascensoBlocker`, `ascenderVeterano`).
- **Las voces de la base** (solo con agente): `town_voices` pide, antes del turno y en una
  sola petición, las líneas de la gente de las bases caducadas (semana nueva o un sitio
  levantado por primera vez, `firmaDeVoces`). Cada voz y cada línea se juzga sola
  (`ponerVoces`); sin agente, respaldo determinista de `data/vecinos.json` con su propio
  `createRng`. Es presentación: `Town.voces` no escribe en la crónica y el banco no lo ve.
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
- **El mapa es una red de nodos**: regiones cerradas por barrera
  (`mountain`, `water`, `forest`, `cliff`, `wall`), pasos de una casilla entre
  ellas. Una ciudad en el muro es un nodo (la base, siempre); un nodo se toma pisándolo. Una
  ciudad o un pueblo dentro de una región es de quien la tenga (05-11-2026, fila «Ocupación»).
  **El procedimental pone en un nodo solo las bases y las ciudades-puente** (fase 2, 05-11-2026,
  decisión del usuario: «la mayoría de las ciudades deberían estar en mitad de una región»): el
  cruce de tres regiones en tierra ya no lleva ciudad, y `data/poblamiento.json`
  (`parejasConCiudad`, 2, inventado) parejas de regiones de fuera llevan una en mitad de la región
  (`ciudadesDeRegion`, `generate.ts`): en su casilla más honda (`honduraDeLaRegion`, sin tirada)
  donde quepan su recinto y sus accesos, a 5 o más de toda otra ciudad; las parejas, de las que cada
  base ve a los mismos saltos y alcanza por dos caminos (`RedFina.conCiudadPosible`), elegidas con
  su propia corriente (`azarDelPoblamiento`). Esa ciudad es **el centro de los caminos de su región**
  (`EntradaDeCaminos.centros`): los radios salen de ella por sus puertas. La región con ciudad
  lleva también su pueblo. En 1-40: 160 ciudades de región, 80 bases y 23 ciudades-puente;
  generar, mediana 50 → 34 ms (26×26: 47 → 51). **Y algunos pueblos, en un nodo** (fase 3,
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
  **Cada nodo guarda la barrera que cruza** (`MapObject.barrera`, #145): la del
  muro que el plan le pone debajo y `buildMap` abre; un nodo sin muro debajo se
  rechaza. El procedimental escribe ahí la que más se ve alrededor, sin el agua
  si sus suelos no la admiten, y en un empate la sorteada para su pareja
  (`queCruzaElNodo`, `vestir.ts`). El escenógrafo la lee y solo deduce el eje
  (`pasoDeNodo`); el espectador la recibe con los objetos y `adaptar.ts` lanza sin ella.
  Los caminos del procedimental son **radiales** desde el centro de cada región
  y entre dos vecinas **solo un nodo lleva camino**, que elige la red
  (`crucesConCamino`) y traza `trazarCaminos`; los demás pasos se cruzan sin
  él, y los pasos van a Chebyshev ≥ 3 de todo nodo. **Las ciudades, no**: cada una lleva el camino
  de todas las regiones que llegan a un acceso de su recinto, por la puerta de esa cara (la ciudad
  amurallada, fase 2: hay puerta donde llega un camino; ~1,6 ramas más por mapa), y sale de ella
  igual, como el héroe; la búsqueda no dobla por fuera la esquina de un recinto (la senda pasaba
  por su torre). **A un pueblo se
  entra por su puerta** (#188): la casilla de debajo (la mina llevaba además la de la derecha,
  #230; se fue con las minas, 21-10-2026). La
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
  p90 ≤ 20 y 0 sin terminar» (`tools/qa/medidas/tamanos.ts`); el lado se deriva, `ladoDelMapa` =
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
  un día abre el siguiente, «Orden de turnos» en las reglas) se va a +2, y j0 gana 524 de 1 000 (duración 8 / 14 / 29). **Sin minas (21-10-2026, «solo oro»)**: cada región
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
  acantilado que no separa dos. **Sin espigas** (#210, paso 7b del engorde, `quitarEspigas`): con el
  nivel por casilla de la escena (`nivelesDelRelieve`, el nodo con `nivelDelNodo` y los que llevarán
  camino de `crucesConCamino`), lo que se pisa por encima de sus dos vecinas de un eje (`espigasDelRelieve`)
  se rellena de la barrera baja de al lado, y si es pasillo de un nodo se le abre la orilla a su
  región (sin otra región a menos de tres pasos) o la orilla pasa a montaña; luego bolsillos, cruces y
  murallas otra vez, hasta `VUELTAS_SIN_ESPIGAS`; si aún queda una, el vestido no vale (7b', s49 con #222). 0 en 1-200 y en 24 y 64 hasta el 21-10-2026 (eran 112
  en este-oeste en 10 semillas); sin minas quedan algunas (s17, s157, s174) y no hay guardia que las mire. **Ninguna senda corta en diagonal una esquina de agua** salvo junto a un puente (el tramo que
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
  (`tools/qa/medidas/murallas.ts`, `test/murallas-de-paso.test.ts`). Los planes del agente no cambian.
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
  **ciudades-puente** (río recto donde toca tres regiones: la frontera de una orilla llega a él; el
  vestido la muda a su orilla, `enSuOrilla`, y su casilla del río queda como su puente,
  `rioAnteLaCiudad`). Niveles (`nivelesDelRio`, sin tirada): el río va al llano, la ciénaga que lo
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
  el banco, 8 / 15 / 30 → 8 / 14 / 30. **En la escena** (paso 2; en tierra desde la ciudad
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

- **Las guarniciones** (04-11-2026): `leave_troops` y `take_troops` (`{ hero, creature, count,
  veteran? }`, `accionDelAgente` las traduce a `dejar_tropa` y `recoger_tropa`) con el héroe parado
  en un sitio suyo; `you.garrisons` dice qué guarda cada paso y pueblo suyo y lo suyo que se quedó en
  un sitio ajeno (la de sus ciudades, en `towns[].garrison`); la ajena no viaja. **La ocupación**
  (05-11-2026): cada ciudad y pueblo de `knownMap` lleva su `owner` derivado, `node` y `occupiedBy`
  (lo que se vio), `towns[]` y `income` llevan `occupied` (la frase de `ocupadoBlocker`), y lo que se le
  ofrece sale de las reglas que lo juzgan: la ocupada trae `income` 0 (el de `rentaDelDia`, que es el
  de toda ciudad) y `canBuildNow` y `recruitable` vacíos (`ciudadQueMandaBlocker`, la pregunta de
  `build` y `recruit`; vuelta 1 de QA, H3), y la prosa
  lo dice (OCUPACIÓN, y en `map_generate` dónde va cada ciudad). Su defensa la elige la IA por él (`defense_set` en
  `recentEvents`; su jugada, backlog), y la prosa (GUARNICIONES, DEFENSA) lo dice. La batalla contra
  una guarnición sin héroe llega con `foe: { kind: "garrison", site }` (en inglés, como los demás), y
  la prosa de la aventura y la de `battle_turn` dicen qué es. `repartir_tropa` (la pantalla de la
  persona) no está en su contrato: que no pueda cambiar uno por otro con los dos llenos, backlog.
  `pnpm qa` deja y recoge una vez y falla si no cruzan.
- **Los puestos** (04-11-2026, fase 3): cada nodo de `knownMap` lleva `upgrade` (`none`, `palisade`
  o `wall`, `UPGRADE_DE_MEJORA`), el último que vio como su `owner`, y la prosa (PUESTOS, y la de la
  muralla) dice tras qué muralla se pelea en el paso, en una línea. **La jugada de mejorar no está en su
  contrato** (backlog; `mejorar_el_puesto` sale de `AccionDelAgente`), ni la traducción de los hechos
  de aventura: `outpost_upgraded` le llega con `to` en español (backlog, con `power` y `retoque`). `pnpm qa` exige el
  `upgrade` en todo nodo que llegue (en la semilla del arnés el agente no ve ninguno, y lo dice).
- **La muralla** (04-11-2026, fase 2 del puesto fronterizo): el `battle_turn` trae `walls` (`null`
  sin muralla; si no, `material`, los muros en `tiles`, las puertas en `gates` con `open` y las
  escaleras puestas en `ladders`, cada una con `foot` y `wall`), y cada stack que aún la lleva,
  `ladder: true`. Las cuatro jugadas, `place_ladder` y `climb` (`wall`), `open_gate` y `close_gate`
  (`gate`: `{ a, b }`), salen de una tabla, `JUGADA_DE_MURALLA` (`vocabulario.ts`: su inversa, el zod,
  la prosa y lo que exige el arnés, `JUGADAS_DE_MURALLA`); las traduce `accionDeBatallaDelAgente` y
  al revés `accionAlAgente`, las dos con un `switch` exhaustivo sobre `BattleAction['type']` **sin
  `default`** (antes el `default` las dejaba pasar en español), y `hechoAlAgente`, también sin
  `default` y con su tipo escrito (`HechoAlAgente`: un hecho nuevo sin su caso no compila), cuenta
  `ladder_placed` y `gate_*` con `escaleraAlAgente` y `puertaAlAgente`, las mismas de `walls` (`power`
  y `retoque` siguen con campos en español: backlog). **La prosa de la muralla va solo en el turno de
  una batalla con muralla** (`PROSA_DE_LA_MURALLA`, que `formatoDeLaRespuesta` añade al formato de
  `battle_turn` si `walls` no es null; la regla, `reglaDeLaMuralla`, la de la arena): eran ~2,2 KB en
  cada turno, también contra monstruos. Se descartan una a una con su `*Blocker`. `pnpm qa` busca una
  semilla donde el agente mande alguna en una batalla con `walls` y falla si ninguna entra
  (`exigeLaMuralla`), y también si un turno con `walls` llega sin la prosa o uno sin ellos la trae.
- **La infiltración** (05-11-2026): cada héroe lleva `infiltrates` y, si es `false`,
  `infiltrationBlocker` (`infiltracionBlocker`); `creature_stats` trae el rasgo `infiltrarse` en
  `traits`; la prosa del turno dice la regla (el día entero por casilla, intocable dentro, la muralla
  no se cruza), y su `move_hero` cruza barreras con la misma regla del núcleo: no hay jugada nueva.
- Peticiones: `adventure_turn`, `battle_turn`, `battle_response`, `map_generate`,
  `hero_from_troop`, `town_voices`. Un test compara los `case` de `decidir` con `REQUEST_KINDS`
  en las dos direcciones; lo que se juega en su lugar es `EN_SU_LUGAR`
  (`Record<RequestKind, string>`).
- **La rueda y los poderes** (19-10-2026): el `attack` de `battle_turn` lleva `hit` (uno de los
  siete, en inglés: `HIT_DE_GOLPE`; sin él lo elige la IA a ciegas, y uno ilegal descarta esa
  jugada con su motivo), y el turno trae `hits`, lo que hace cada tipo con el arma de la activa;
  la jugada `power` usa Curar (el stack trae `powers`). Cuando golpean cuerpo a cuerpo
  a una unidad suya, quien pega se planta (ante ella, o en su salida si carga), y se pide `battle_response`
  (`serializeBattleResponse`: quién a quién y lo que daría cada respuesta, sin el golpe del otro; si le cargan, quien carga aún no ha corrido y `chargeFrom` dice desde dónde golpeará, 31-10-2026).
  Una respuesta que no vale o no llega la elige la IA **solo para ese golpe**: la batalla sigue
  siendo del agente (`EN_SU_LUGAR.battle_response`). El veredicto cuenta el cruce: qué eligió,
  qué eligió el otro y en qué punto cayó. Medido en `pnpm qa` (19-10-2026): 22,7 peticiones por
  batalla (18,4 turnos y 4,3 respuestas; 19,3 cuando la rueda la elegía la IA por él).
- **Armas de fuego y granadas** (02-11-2026): el turno trae `throw` en `legalActions` (una por
  enemigo a su alcance; vale cualquier casilla a su alcance) y cada stack, si recarga, `reloading`
  (los turnos que le faltan; mientras, ni un `aim` suyo), y si lleva granada, `grenades` (las que le
  quedan) y `grenadeRange`, y la que está en el aire, `grenadeAt` (también los del rival); el registro
  cuenta `thrown` y un `blast` por alcanzado (`target`, `damage`, `cuarto`). `creature_stats` dice
  `reload` (solo con un arma de fuego), o `grenadeCharges` y `grenadeRange`. La prosa de `battle_turn` lleva ARMAS DE
  FUEGO y GRANADAS. `pnpm qa` dice si un `throw` del agente cruzó, sin exigirlo.
- **La magia del editor** (06-11-2026): `spell_list` trae de cada hechizo `id`, `name`, `level`
  (el gremio, o `null`), `cost`, `description`, `summary` (`queHaceElHechizo`) y `target` (`ally`,
  `enemy`, `any`, `tile`, `self`, `all`: `hechizosAlAgente`); `cast` y `power` llevan `target`, `at`
  o nada, y `legalActions` trae los que valen; cada efecto de `stacks[].effects`, su `summary`, y el
  diferido, `spellAt`; el registro cuenta `spell_hit` y `triggered`; la prosa, MAGIA. `pnpm qa` no
  lo exige.
- **El disparo diferido** (25-10-2026, regla nueva sin validar por el usuario y **sin tests**):
  `shoot` se fue; el tirador manda `{ "type": "aim", "at": { col, row } }` (cualquier casilla del
  tablero menos la suya; `legalActions` trae una por enemigo vivo y la prosa dice que vale
  cualquiera), cada stack con algo apuntado lleva `aimedAt` (también los del rival), y el registro
  cuenta `aimed` (`at`) y `shoot` (`at` y `target`, `null` si no dio a nadie). La prosa de
  `battle_turn` dice la regla entera. `pnpm qa` dice si un `aim` del agente cruzó, sin exigirlo.
- Consultas: `game_state`, `battle_state`, `map`, `creature_stats` (con `strength`, `agility` y
  `weight`, la fuerza, la agilidad y lo que pesa lo de serie, 25-10-2026; con `dwelling`, el edificio
  que la produce, `equipment` por slot, `armor`, `level` y `powerIndex` derivados:
  `fichaDeCriatura`, campo a campo; desde el 26-10-2026, `mapSpeed`, lo que cuenta en la marcha del
  mapa, `marchaDe`, y montado de guerra con lanza `chargeDamage`, la horquilla de su carga),
  `spell_list`, `building_list`. El equipo va por los seis
  slots (`melee_weapon`, `second_melee_weapon`, `ranged_weapon`, `armor`, `shield`, `mount`; `equip`
  lleva `slot: "second_melee_weapon"` para la segunda mano, 25-10-2026; un caballo va a `mount` sin
  decirlo) y cada stack lleva su `armor`, su `strength` y su `agility` (la que le deja el peso;
  montado de guerra, la entera). La prosa de EQUIPO explica la MONTURA (de guerra en batalla, de
  silla solo en el mapa, el más lento del grupo con el héroe) y la de la CARGA, la montada. La tropa veterana y el héroe llevan `rank` y `level`; el stack, `veteranRank`; el
  `equipment` de un veterano es solo lo suyo (lo de serie, en `creature_stats`).
  Solo por los jugadores del agente, y **todo
  pasa por la niebla**: crónica, mapa (`serializeKnownMap`, la misma llamada para
  el turno y la tool) y batallas ajenas.
- El agente **defiende** sus batallas (`BattleTakeover`: si te la quedas, la
  cierras) y **diseña el mapa**: un plan declarativo, con el nivel de cada región
  si quiere (#209) y sin posiciones de inicio (cada jugador de `want.players` con su ciudad, y su
  héroe empieza dentro), que valida `validateMapPlan` (también el recinto de cada ciudad: ni en el
  borde, ni dos a menos de 5, ni nada dentro, y cada región que llega a una ciudad con su camino por
  una de sus puertas, `problemasDeRecintos`; la prosa se lo dice con las cifras del núcleo, y sus
  casillas de camino se unen en el recinto solo de un acceso a su puerta y de la puerta a la ciudad,
  `tramoDelRecinto`). Si falla por cualquier motivo, se juega el procedimental y se le dice por qué;
  no hay reintento.
- **El oro en el contrato** (21-10-2026): `you.gold` (un número) y `you.income` (`total`, `towns`
  y `villages`, de `rentaDelDia`: todo pueblo suyo, el cortado de la base con `connected: false` y 0,
  como la ciudad, 05-11-2026); todo `cost` es un número de oro. Un plan con `mines` o
  `resources` se rechaza diciéndolo.
- **El clima** (22-10-2026, decisiones del usuario: por región, lo pide el narrador y la noche
  también): el `adventure_turn` admite `weather`, una lista de `{ at, weather?, night?, days? }`
  (con el tiempo, la noche o los dos; de 1 a `diasMaximos` días, como mucho `porTurno` por turno y
  una vez cada región), que el director aplica **antes** que las acciones (`pedirClima`); cada pedido
  malo se descarta con su motivo en el veredicto (tras `weather`) y lo aceptado va en la nota
  (`notaClima`, una vez para el registro y la nota). **El esquema no tipa las entradas**
  (`weather: z.unknown()`): una mal escrita —un tiempo de 18 letras, `days: 1.5`, `night: "si"`— la
  juzga `climaBlocker` y se descarta sola, y de las que pasan de `PEDIDOS_QUE_SE_MIRAN` (16) se dice
  que no se miran; con los tipos en el esquema, una tumbaba el turno entero (H1 del QA, 22-10-2026). Es presentación, como las voces: ni crónica ni
  banco. La petición trae
  `world.weather` (el clima de hoy de las regiones exploradas, con `until` lo pedido), y la prosa le
  dice que la noche la pone la narrativa y que las tierras de los no muertos son más nocturnas. Lo
  cruza `pnpm qa` (una tormenta y un «granizo», y el fotograma del espectador).
- **Los lugares de un mundo, aún no** (F4): el agente los ve en `knownMap` (`kind: "lugar"`, con
  su `name`; su estado no viaja) y su prosa le dice que no hay jugada para entrar. La acción del núcleo
  (`elegir_en_lugar`) no está en su contrato. El espectador los pinta con su marcador y tampoco ve su
  estado.
- La partida termina con un `game_over` explícito. `state.finished` es
  `{ winner: PlayerId | null } | null`; el tope de días es `GameState.maxDays`.
- Del contrato se exportan esquemas, no alias de tipo.

## El cliente

- **El clima** (22-10-2026, `docs/agents/2026-10-22-clima/`): niebla (bancos claros y fríos que
  van a la deriva y una bruma clara), lluvia (gotas de un píxel de dispositivo en dos planos y la luz
  algo más baja), tormenta (más lluvia, la luz pizarra y un rayo cada 4-9 s por región: un destello
  local de 160 ms con su trazo) y la noche (una luz azul **multiplicada**, que conserva el
  contraste —con un velo encima se leía como bruma gris—, y un azul de luna **sumado** encima,
  `NOCHE.alza`: multiplicar por azul no vuelve azul un bosque pardo, y la noche se parecía al velo de
  lo que no se mira; con los fuegos de ciudades y pueblos y las puertas de la base encendidos: un
  hueco en esa luz y un resplandor cálido). En las escenas (base, morada, batalla) las figuras llevan
  siete décimas de esa luz (`luzDeLasFiguras`, `Figura.luz`, en la celda teñida guardada; aro,
  casillas, barras y chapas sin teñir). En el mapa, la luz por regiones se **guarda** a resolución de
  dispositivo pegada al mundo (`pintarLaLuzDelMundo`) y cada fotograma es una copia entera sin escalar:
  componerla desde un cuarto costaba 5,3 ms por fotograma de noche al tope de alejar en 2560×1440 (QA
  del 22-10-2026, H9). Las gotas, del grueso de un píxel CSS en píxeles de dispositivo. Un solo pintor
  (`render/clima/clima.ts`) para el mapa y toda escena: lo que cambia es el campo, qué clima hay bajo
  cada píxel. En el mapa, por región y con el borde ondulado y blando (un frente, no el contorno por
  casillas de la niebla de guerra), tras los volúmenes y **bajo** los identificadores y la niebla de
  guerra: lo inexplorado sigue siendo `#080a10`. En la batalla, el cielo es el del tiempo (con
  tormenta no se ve el sol: gris pizarra con nubes bajas; de noche despejada, azul con luna y
  estrellas, `pintarNubesBajas`, `pintarAstros`), la luz y la bruma van horneadas en el fondo, los bancos bajo las casillas
  y la lluvia y el rayo bajo las barras y los nombres. Una escena lateral se enchufa con su
  `ClimaDelSitio` (`campoDeEscena`): `pintarSueloDelClima` entre lo suyo y las figuras y
  `pintarAireDelClima` al final; la base y la morada (`pintarBase`) heredan el de la región de su
  ciudad, y la tropa no lleva (es una ficha). Lo blando va en una capa a un cuarto que se compone
  **sin suavizado** (con el bilineal, 7-10 ms por fotograma sin GPU; con el vecino, 1 ms). El juego no
  mira `prefers-reduced-motion` (decisión del usuario, 22-10-2026: «eso es para páginas web donde
  estás leyendo, no para un videojuego»): la lluvia, el rayo y la rueda se animan siempre. Medido con `tools/qa/navegador/clima.ts` (la tabla, en
  `docs/agents/2026-10-22-clima/implementacion.md`).
- **Tema por facción** (13-10-2026 en su rama; en el juego desde el 19-10-2026): cinco, uno por
  facción, **como sus láminas** (`assets/art/temas/<tema>.png`): la paleta se mide en la lámina y
  `temas.css` la copia (`paleta-de-las-laminas.test.ts`); la forma (barras de sección con su adorno,
  botones, el día en su cartela, los emblemas, el marco del mapa con anillos de `box-shadow` que no
  mueven el lienzo), en `forma.css`; los títulos, con una OFL por tema (Cinzel, IM Fell English SC,
  Marcellus, Almendra, Germania One) desde `assets/letras/`; las piezas en imagen de Codex (43, ya
  hechas) encima de su respaldo de CSS. Sin tema nada cambia: `npx tsx tools/qa/navegador/neutro.ts main`, 0
  diferencias (19-10-2026). En la partida, el de la facción de quien juega; en el lienzo, solo lo que
  es interfaz (chapas, fondo de la vida, galones, la corona, rótulos de la base, recuadro del
  minimapa, letras). La historia y el porqué, en `docs/historia.md` y
  `docs/agents/2026-10-13-tema-por-ejercito/`, `docs/agents/2026-10-13-temas-de-las-laminas/`.
- **Figuras**: 8 direcciones y 6 acciones (`idle`, `ready`, `attack`, `hit`,
  `die`, `win`), **salvo la gente** del banco de NPC (22-10-2026: solo la hoja A, de pie y
  andando, `ArteDeFigura.clips`; no pelea y no llega a una batalla). Arte propio (`dN/atlas.webp`) o el Y Bot de su juego de armas
  teñido del color del bando; lo sin dueño, en gris. **Nunca se espeja.** Tablas:
  `JUEGO_SIN_HOJA` (el héroe genérico de la arena y el vecino), `JUEGO_DEL_YBOT`,
  `DIRECCION_DE_HOJA`. Una tropa del catálogo se pinta con la hoja de su unidad (`hojaDeUnidad`; el
  `body` de su stack es esa hoja) y un héroe con la de su tipo (`figuraDelHeroe`), que registra
  `registrarLasHojas` al arrancar (`cargarArte`) en la partida, el espectador y la arena; hasta que
  contesta, lo que no está registrado no se pinta, ni con el Y Bot (`arteSabido`). **Una figura cuya hoja va en camino no se pinta** (20-10-2026, «quita unos círculos rojos con una letra que aparecen antes de cargar»: `FiguraColocada.cargando`, `figuraEnCamino`); el óvalo de color con su inicial queda para la que no tiene arte, porque su imagen falló o no existe. Anclas del Y Bot en `_poses/atlas-8d.json` (`pnpm taller derivar-poses`).
- Ritmo: `marcha.ts` (`PRISA_DE_LA_MARCHA`), compás propio por figura con hash
  del id (`render/figuras/compas.ts`), sombra por silueta, carga hoja a hoja con cachés LRU.
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
  un móvil, con velo) que pinta y conduce `DialogoDeLaRueda` (`client/rueda/`: `rueda.ts`,
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
  Cuando golpean a quien juega, elige su respuesta sin ver el golpe; cada sector dice grande lo que le haría el atacante y debajo su contraataque, con «†» donde puede tumbarle (01-11-2026). Los modificadores en curso de cada stack (lo de `BattleStack.effects` y la carga de quien pega), en pastillas de una sola forma, `modificadoresEnCurso` (`views/panels.ts`): bajo cada contrincante de la rueda y en cada fila de «En el campo»; el desenlace los pinta como estaban antes del cruce (`fotoDeEfectos`, `batalla/anim.ts`) (`RuedaPendiente` no lo
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
- **Niebla de quien juega** (#64): los héroes se pintan si se miran AHORA, los
  objetos como se SABEN (castillos y nodos con su último dueño visto), los grupos
  si se mira su casilla; terreno y volúmenes, por `fog`, que desde el 02-11-2026 va
  por regiones enteras (el negro sigue el borde de las regiones, no un cuadrado),
  y la sombra tenue de lo que no se mira es el radio de 5 de los héroes y de 6 de
  castillos y nodos propios, sobre lo explorado. Nada se pinta sobre el negro. La
  crónica pasa por `cronicaPara`.
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
  puntos de tierra del esparcido gastan las mismas tiradas que una mata (`gastarLasTiradasDeMata`;
  #269 para quitarlo de raíz).
  **La ciudad es un recinto amurallado** (20-21/10-2026, `docs/agents/2026-10-20-ciudad-amurallada/`;
  la hoja `ciudades`, una maqueta de otra escala, se borró): cada ciudad se compone en la escena con
  una regla pura, `recintoDe` (`recinto.ts`), con su propia corriente. Un octógono regular inscrito
  en su 3 × 3 (`contornoDelRecinto`, cara de 1,226), con una torre de la hoja `muro` en cada vértice
  y en cada cara su tramo liso (`tramo-n-s` al norte y al sur, la tirada de dos `muro-ns` al este y
  al oeste, los `tramo-*` en diagonal) o su puerta (`puerta-n-s`, `-e-o`, `-ne-so`, `-no-se`: arco
  de medio punto con el rastrillo alzado), a `ESCALA_DEL_RECINTO` (0,8) de la muralla del mapa. La
  hoja `recinto` (puertas y tramos, Codex por la suscripción con su guía, `pnpm taller encolar
  --recinto` y `derivar-recinto`) va de vértice a vértice por sus juntas (`Modulo.junta`), a la
  escala propia de cada módulo (`ESCALA_DEL_MODULO`, alrededor del medio de su cara). **Manda el
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
  tejado). **Ninguna casa tapa el vano de un arco** (`tapaElArco`, H1 del QA de la ciudad llena,
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
  no hay guardia que los mire; `anilloMalOrdenado`, 0 en los 256 juegos de puertas del octógono con cada torre). **El 3 × 3 es del núcleo** (vuelta 3, fase 1, `core/map/recinto.ts`): ninguno en el borde,
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
  21-10-2026; s53 y s91, que eran los de antes, ya salen a 0). **Y se entra por sus puertas** (fase 2, 21-10-2026): el núcleo
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
  **Las murallas** (`muralla.ts`, #183, #197, #207): cada franja de muro lleva la línea de su frontera, no su esqueleto (`trazaDeMuralla`): tiradas rectas de mínimo coste (una esquina vale `ESQUINA` = 3 casillas, por el medio de la franja y, donde cambia de nivel, por lo alto: `AL_PIE_DE_LA_CARA`) que unen, como un árbol, sus puertas (de través a su paso) y sus **apoyos**: el grupo de casillas que toca una misma cosa de fuera —otra barrera o su nodo, el borde, la huella de una ciudad o un pueblo, a la que se llega por debajo— y dos lados pisables (`Alrededor`, `alrededorDeMurallas`, que deriva el lado de cada casilla del terreno). Las puertas de una franja son las de sus 8 vecinas por coordenadas, no por índice (con el índice, la puerta de la columna 0 era de la franja del borde contrario: la fuga de s443). Un paso en diagonal nunca pasa entre dos casillas pisables, que son del mismo lado (s730). Donde la línea deja que un lado llegue a otro (`fugasDe`), se añade el sitio que más fugas cierra (el apoyo que toca a los dos, uno que la fuga roza, o lo más estrecho entre ellos) y, si por lo alto no cierra, se traza en llano; lo que cuelga sin llegar a nada se poda (`sinEspolones`). Una franja sin puerta que no separa dos lados, o sin nada a lo que llegar, no lleva línea: es escombro (#232; el generador ya no las hace, y la de un plan del agente se lee como ruina). Lo que no pisa la línea es escombro: ni espolones ni un segundo muro. El tramo recto se apoya por el medio del paso; el diagonal, por su punta baja en la casilla de abajo. Torre obligada en cada junta, también a 45° (`esquinasDe`: sin ella la junta se ve abierta) y en cada punta de norte a sur (sin ella el tramo es un raíl), `torresObligadas`; en las demás puntas y en lo recto a `ENTRE_TORRES` (3); nunca junto a una puerta ni bajo una ciudad, salvo **la punta que toca su apoyo** (#232): montaña, acantilado, agua o el borde (`puntasContraSuApoyo`), que lleva su torre corrida `ARRIMO` (0,25) hacia él, también junto a la puerta, para que el lienzo no acabe a media casilla de la montaña (s36 (21,20)). **Nunca dos torres apiladas** (`seApilan`): a una casilla o menos, ni en la misma columna a dos o menos, que la cámara pone una encima de otra. La punta de otro eje o la casilla sola que se apilaría con una obligada, de su línea o de otra franja, se queda sin torre; la línea no dobla a menos de eso de su esquina anterior ni de una obligada ya trazada (de norte a sur, tres), salvo junto a una puerta o bajo una ciudad, y si así no llega o no cierra, dobla (`seguidas`). Si quedan pegadas, prueba a empezar el árbol por otro terminal. Un tocón de norte a sur de dos casillas o menos hasta la siguiente torre se quita (`sinTocones`), salvo si es toda la línea. La línea no dobla donde la torre no cabe de ninguna manera (`esquinaCabe`) y paga por doblar donde no cabe entera. Ningún tramo se salta por una reserva (`meterEnLaMuralla`): el que llega a una puerta, o cae en la reserva de otro objeto, se pinta en su sitio y se ordena justo antes que él (`ordenadoEn`), que queda encima. La puerta va centrada en su nodo (su ancla derivada es el pie de una torre). De norte a sur, el tramo es de lado (`muro-ns-1`/`-2`, 1,6 de alto por el medio), y los pasos seguidos de una columna van en una tirada (`tiradaNorteSur`, 21-10-2026: «los muros perpendiculares están mal, están como partidos por el medio»; una pieza por paso enseñaba su testero en cada junta sin torre ni puerta, 5 tiradas en 41-120 y ninguna en 1-40; la tirada de tres pasos se inclina lo que el arte, ~0,4 casillas de punta a punta), y la puerta (`nodo-puerta-hondo`) va a 2,6 de alto por el pie de su arco (`PUERTA_NORTE_SUR`); la ruina sigue con el `profundidad` de su hoja. El resto de la franja es escombro (`rocas-caidas`), nunca la cubierta del suelo vecino. `informe.murallasPartidas` = 0 en 1-40, contado sobre lo PINTADO (`informe.muralla`): fugas (un lado que llega a otro por la franja sin cruzar lo pintado, en una rejilla de 4×4 por casilla, el tramo de media casilla a cada lado y de cabo seco), puertas sin tramo hacia un lado de su paso con muro, y trozos de más de una línea (lo que llega a una ciudad se une por ella). `informe.murallaIncoherente` = 0 en 1-40: espolones (puntas de una franja que separa dos lados sin llegar a nada), juntas de dos ejes sin torre y puntas de norte a sur sin torre (`puntasSinTorre`). `informe.torresApiladas` = 0 en 1-40 (`apiladas`); en 1-1000 quedan 13, en 12 semillas, todas de dos juntas que la franja obliga (un escalón de una fila) (2026-10-08; eran 3 138). En 1-1000, `murallasPartidas` = 0 y `murallaIncoherente` = 0. Ninguna senda entra en una casilla de muro salvo por su puerta (como mucho 0,06 de vaivén). **La torre no tapa la senda** (#193): la que la pisa (`sendaParaLaMuralla`, la senda pintada sin arcén, a `SEMIANCHO_DE_LA_HUELLA`: su borde más abierto) no se pone y va la siguiente candidata (`torresDe(…, cabe)`); la de una casilla sin tramos o de una esquina, que va siempre, se encoge hasta `TORRE_MAS_BAJA` (0,45) y, si ni así cabe, se corre dentro de su casilla (`CORRIMIENTOS_DE_TORRE`, `torreQueCabe`). El lienzo no se aparta: lo alto del último tramo puede quedar delante de la senda que rodea su punta. `informe.murallaSobreSenda` = 0 en 1-40 (`murallaSobreLaSenda`: torres que la tapan y tramos que la cruzan fuera de una puerta).
  **Los hitos** (`nodos.ts`): todo nodo de acantilado, de bosque y de montaña lleva uno (`HITOS`, por su id), sin tope, porque un nodo neutral no lleva bandera (354 en 1-40: 119 de acantilado, a 5 casillas o más unos de otros, 114 de bosque, que acercan cuatro pares a 4,1-4,5, y 121 de montaña: son nodos distintos y cada uno se toma). **El paso de bosque y el de montaña no llevan pieza** (#196, #203): el portillo de abetos verdes desentonaba en la nieve y en los demás bosques, y la mitad de esos pasos separan dos suelos con dos hojas de árboles; la garganta de `nodo-paso-montana` iba de norte a sur y solo 2 de 23 nodos de montaña se cruzan así (el camino entraba bajo la roca por un costado, y en la nieve salía parda). Los abre la propia masa por su eje, su reserva es de `RADIO_DEL_PASO_SIN_PIEZA` (0,5, no la de 0,95 del nodo: abría un claro redondo; `radioDeLaReserva`), y lo leen el hueco y el hito. `informe.pasosAtravesados` = 0 (la pieza del nodo, si no es hito, no pisa su eje; eran 121 en 1-40). Sigue en `BARRERAS_CON_PASO_A_LA_VISTA`. La tablilla apunta por el eje del paso (`tablillaDelEje`: al fondo antes que a la cámara; en el este-oeste, por el sitio), una pieza por rumbo y nunca espejada; el miliario va entonado (`TONO_DE_HITO`). Tomado el nodo, su hito no se pinta y en su lugar va la obra de su puesto, en el sitio que reservó `componer` (fila «El puesto en la escena»; 05-11-2026).
  **Los pasos se ven** (`pasosALaVista`, `ejeDelPaso` en `nodos.ts`, #173): cada nodo de montaña, bosque o muro, con camino o sin él, abre un pasillo de `SEMIANCHO_DEL_PASO` (0,36, el de las masas) a lo largo de su eje, de la segunda casilla de una entrada a la de la opuesta (el orden de `ejeDelNodo`). De él se apartan solo los volúmenes: la masa se encoge o se quita, y lo bajo se queda a `UMBRAL_DE_VOLUMEN` como mucho, para no abrir una franja pelada. `informe.pasosTapados` = 0. **Sin trocha** (#227): el paso sin camino no lleva huella. La trocha de #190 (una línea recta de tierra por el eje de cada nodo de bosque, montaña o acantilado sin camino) no se entendía («¿qué es esa franja?», s55 (3,17)); el paso lo dicen el hito y el hueco del eje, y lo bajo (los abetos de 0,6 de la nieve) vuelve a quedarse en él, como en el pasillo de los pasos.
  **El relieve por celdas** (R4, `celdas.ts`; `docs/agents/2026-10-07-relieve-esquinas/`): el nivel por casilla sale de `relieve()` (el de su región; ver «Los acantilados») y las paredes, de cada vértice: por umbral, un caso de 4 bits (`celdas`; la silla, «el alto une»; el mismo tipo en dos grupos seguidos es una pared). Cada pared va de junta a junta, en el medio de un lado de casilla, y la clase de la junta la fija el lado (`JUNTAS`: en la S el pie cae a plomo, en la E u O con el talud de `TALUD_DE_LADERA`). `caidas` las encadena: las S en `Cara` de media casilla en media casilla (`paredes-*` libres, que no salen de su tramo más de `SALE_DE_SU_TRAMO`), las E y O en laderas, y cada diagonal (`SE`/`SO`, `convexa`/`concava`) lleva su pieza `diagonales-<material>-<se|so>-<caída>` por sus dos filos (`spriteDeDiagonal`; un cuarto de círculo en la guía, `tools/taller/diagonales.ts`). Las de espaldas, el reborde y sus peñascos. La pared que cruza un puente no lleva pieza (`celdasBajoLosPuentes`). **La pared nunca se corta ni se aparta de la senda**: donde un camino baja hacia la cámara o de lado va una **bajada** encima (R5, `bajadasDe`: `arriba` donde la senda pintada cruza el filo; `bajadas-<material>-<caída>/<s|se|so|e|o>`; la rampa sigue a la senda en pantalla, `rampaDe`; el rumbo es el de lo pintado, el del tramo o uno a 45°, `rumboPintado`; y la senda pintada pasa por la rampa, de su filo a su pie, y vuelve a su trazo con un enlace a cada lado, sin mover sus extremos, `sendasPorLasRampas`, #192), con la clave detrás de toda pared que pinta sobre su camino y delante de nada horneado de la casilla a la que baja: la que baja a una ciudad, pueblo, mina o nodo va justo detrás de él (`llegaA`), y lo que se pinta delante del nodo puede tapar su llegada. **La rampa abre la pared con sus costados** (#225, §35, `rampas.ts` del taller): donde el camino del núcleo baja de frente (al sur) por un borde recto —la pared S de los vértices `x − 1` a `x + 2` de su filo, cinco casillas, una sola caída— y hay su arte (`rampa-<material>-<caída>`: piloto de roca y arenisca de caída 1), no va la bajada: va el cuerpo (la cuesta) en el hueco y un costado de casilla y media a cada lado, el muro que se hace cuesta (*wall-to-slope* de StarCraft y Warcraft III): su cara frontal, la de la frontal vecina, tiene el alto entero por fuera y baja en diagonal hasta nada en el borde de la cuesta, al pie, con la meseta bajando por encima; sin caras laterales que flanqueen el camino (`rampasDeFrente`, `TRAMO_DE_PIEZA_DE_RAMPA`, `spriteDeRampa`). El extremo de fuera de cada costado sigue `SOLAPE` (0,15) fundido a transparente, y encima va la frontal más estrecha de su material, que tapa la arista (detrás de un objeto si lo taparía); el tono, el de su frontal medido (`TONO`, `rampa-*`). Se decide por el tramo, antes de toda pared; esas cuatro paredes salen de la cara (`caidas(…, fuera)`: ni frontal ni cara pintada), la bajada baja por el medio del hueco y no lleva pieza (`enSuRampa`, `deUnaRampa`), y el costado va detrás de la frontal de al lado. Las tres piezas son una imagen cortada por su guía (registrada con su escala). `informe.rampasSinSusPiezas` = 0. Con arte salen 1 en 1-200 (s62 (4, 7)) y 19 en 1-1000, todas de caída 1, en el mapa de 42×42 (eran 5 y 27 en 34×34; 09-10-2026); con las fronteras onduladas (#229), 2 en 1-200 (s106 (34, 19), el caso del test, y s139). **Y la de muesca** (§36): donde la casilla de debajo está entre dos altas con lo bajo delante (`HHH/HlH/lll`, la muesca de una de hondo de un nodo con camino o de una ciudad que entra por detrás; 160 de las 992 bajadas `s` de caída 1 de 1-1000 en 42×42, el patrón más frecuente de los rincones), una pieza entera (`rampa-muesca-<material>-<caída>/s-muesca`, `PIEZAS_DE_LA_FORMA`, `Rampa.forma`) sustituye sus cuatro diagonales (`PAREDES_DE_MUESCA`) y casa por sus dos juntas S, las de las esquinas de delante (`TRAMO_DE_PIEZA_DE_RAMPA.muesca`, `FILA_DEL_FILO`): la cuesta entre dos laderas en triángulo, enteras delante y a nada arriba. Las diagonales que sustituye gastan su tirada (las demás sacan el mismo módulo con su arte y sin él). Con arte (roca y arenisca, caída 1), en 42×42: 27 muescas y 1 recta en 1-200, 89 y 19 en 1-1000 (rampas de 1 a 28 y de 19 a 108; 09-10-2026); con las fronteras onduladas (#229), 11 muescas y 2 rectas en 1-200 (la muesca del test, s126 (31, 33)): el borde recto de cinco casillas y el rincón `HHH/HlH/lll` salen menos. `rampasSinSusPiezas` mira las dos formas: una pieza de cada una de su forma en su tramo, y ninguna frontal, ladera, diagonal ni bajada sobre el hueco. Sin arte o en otro rincón (un lado que sigue al sur, la muesca honda, el rincón de un lado: #228; s55 (30, 15)), la bajada de siempre. Caída 3 o más: la pieza de 2 estirada en alto (`Sprite.ancho`); sus dos filos no caen a la vez y van centrados, y el guardia acepta ese desvío y no otro (`filosEnSuSitio`). El arte está entero (todos los materiales, caída 1 y 2, §23); sin él, un marcador (`COLOR_DE_DIAGONAL`, `COLOR_DE_BAJADA`). Las guías de las diagonales llevan el labio roto en trozos (en el suroeste, oscuro: `LABIO_EN_LUZ`) y sin canal en las cóncavas, y su referencia de material es la ladera vecina (`laderas-<material>-<este|oeste>-<caída>`), no la frontal; el suroeste lleva además su hermana del sureste. Las diagonales y bajadas de basalto van con el tono de su ladera (`TONO`, §26), y la frontal (`paredes-basalto`) con el suyo (#220): sin él daba luz 71 y R−B 20 entre laderas de 54 y diagonales de 48-52 y la línea de una meseta de lava se leía a trozos; con `brightness(0.72) saturate(1.15)`, 51/50 y 16 (luz Rec. 709 media de las piezas puestas en s9/s13, 09-10-2026). La puerta es `ponerPared` (los tableros y la reserva de un objeto; lo que rechaza queda como razón declarada, `vaciaPorque`). **La pared pasa por detrás de un objeto** (#221): en su reserva, la frontal y la ladera van si no lo tapan a él ni a su camino (la rampa de una bajada, `rampasPrevias`, o más senda escondida), encogidas si hace falta, y la diagonal, que no se encoge, se ordena justo antes que él (`ordenadoEn`); el pedregal no entra. Saltarse la reserva partía el borde de la meseta en bloques sueltos junto a las ciudades y minas de su pie. **Ordenar no mueve** (#222): `ordenadoEn` pone `Sprite.clave`, la clave del pintor (`claveDe`, que leen `ordenDeVolumenes`, `separar`, `vaDelante` y cada pregunta de quién va antes), y el pie y el ancla se quedan donde los leen `celdasMalCubiertas` y las juntas. Con ella, la frontal y la ladera que ni encogidas dejan de tapar un objeto de su pie (`alPie`; lo de lo alto lo tapa la cara) pasan también por detrás, y la diagonal pasa por detrás del objeto cuyo camino solo taparía donde el objeto o una bajada pintan encima (`tapaElCamino(…, true)`, a dos centésimas: la bajada que llega va a una, encima); esas se juzgan otra vez con la senda pintada y las bajadas (`detrasDeUnObjeto`, una a una) y se quitan si esconden `ESCONDIDO_DETRAS` (0,3). La pared que taparía el tablero de un puente va por detrás del puente, y la que un puente solo toca en la punta de su filo (la junta por la que pasa todo puente de norte a sur o de este a oeste) lleva pieza (`celdasBajoLosPuentes(…, true)`, `juntoAlPuente`, con su propio azar). `informe.carasCortadas` (tiradas de frontal de ≤ `CABO_SUELTO` (2,5) con una punta en el llano a ≤ 2 de un objeto) 72 → 18 en 1-200, 13 → 4 en 1-40 (#221, 34×34); en 42×42, 23 → 4 en 1-200 y 2 → 0 en 1-40 (#222, 09-10-2026): quedan esquinas cuya diagonal taparía el camino que sale de su pie (s105, s174) o el de una bajada de muesca sin arte (s143, basalto). Con las fronteras onduladas (#229) y #222 juntos, 1 en 1-40 (s32) y 5 en 1-200 (s32, s64, s68, s141, s190); sin #222, esos mapas daban 5 y 20. `sendaBajoElRelieve` 227 → 231 en 1-200 (otro vestido de las sendas apartadas), 50 en 1-40. La casilla de barrera que tapa una pared por el centro tiene formación (`casillasDeBarreraSinFormacion`, 3 → 0 en 1-200). La senda tapada por una pared que tapa encima un objeto no cuenta como bajo el relieve (`loQueTapa`). **El nodo entre dos niveles sin camino es una rampa** (#143): su bajada va por su eje (`tramosDeLasRampas`), sin senda que seguir (`deUnNodo`): la tierra la lleva la pieza. Una cordillera sin cumbre (no cupo) con más de `MAS_CUMBRES` picos a 0,8 del mayor sube el más alto que pueda, sin azar (`unoQueDomine`). `informe.celdasMalCubiertas`, `bajadasSinPieza`, `bajadasTapadas`, `bajadasSobreNodo`, `rampasDesviadas` y `nodosSinRampa` = 0. Como la pared no se aparta, es el trazado del núcleo el que se aparta de su pie (#189): `recargosDelTrazado` (`vestir.ts`) cobra 3 rectos de más por un acantilado al N, NO o NE de la casilla, 1 por una montaña o un bosque y 2 por el borde del mapa (una Y junto a una hoja cobra también el mayor de sus esquinas). Y la senda pintada se aparta, dentro de su casilla, de lo que la tapa (#206, `apartarDeLoQueTapa`, `sendas.ts`): por eso las paredes (laderas, diagonales y frontales; las frontales con su propio azar) se ponen **antes** que la senda y su pedregal después; cada punto bajo una (`loQueTapa`, la misma regla que el contador) se corre hasta `APARTE_DE_LO_QUE_TAPA` (0,35) al lado libre, en rampas de una casilla, sin mover sus extremos, ni lo que va junto a la rampa de una bajada, ni pasar a una casilla de barrera o de edificio, ni arrimarse más de lo que estaba a un acantilado, un muro o una cordillera a menos de media casilla (`LEJOS_DE_LA_BARRERA`: la roca de lo alto de #205, la línea de la muralla y las cumbres de #204); dos pasadas, que miran la senda de partida. `informe.sendaBajoElRelieve` (tramos de ≥ `SENDA_CORTADA` con la huella entera bajo la silueta de una frontal, ladera o diagonal) no es 0: techo de media 5 por mapa (1,2 en 1-40 con menos mesetas, #210; 4,5 antes; 6,3 sin apartarla, con los niveles del mapa de #143; 9,1 antes; 12,5 antes de #189).
  **Las caras** (`caras.ts`, #159): la cara de un acantilado no es la banda entera: por columna, cada `PASO_DE_CARA` (0,05), se pinta el tramo seguido que tapan sus paredes, de lo alto de su silueta (`Modulo.perfil`, 32 franjas que deriva `pnpm taller catalogo-escena` con `perfilDeModulo`) a lo bajo de su caja, con juntas de hasta 0,15 (`pintadaDeCara`). Donde no hay pared, se ve el suelo de abajo. El pedregal de una cara sin pared ni ladera a 0,3 toma el tono de su suelo (`tonoDelPedregalSuelto`, #170). `informe.carasLisas` = 0.
  **Las laderas** (§20): cada cadena E u O lleva `laderas-<material>-<lado>-<caída>` (nunca espejada; caída > 3 usa la de 3), corrida media fila, con `inicio` al norte y `fin` al sur donde remata —sigue de espaldas o con una caída menor; en el borde del mapa no remata, el desnivel sigue fuera del marco (#212)— y `medio`/`largo` sin repetir el vecino. La `esquina` de §20 ya no entra (dobla la diagonal). Cada módulo trae sus `JuntasDeLadera`, registradas sobre la guía por `pnpm taller derivar-relieve` (también las de las diagonales y las bajadas) y comprobadas al cargar el catálogo (`catalogoValidado`); `colocarLadera` pone el filo en `bordeDeLadera` y el pie en `pieDeLadera`, sin correrse ni encogerse; lo que no entra se prueba con un `medio`. Un barranco de una casilla no lleva laderas (`sinBarrancos`): van los peñascos del canto. `informe.laderasEnfrentadas` = 0.
  **Los acantilados y el relieve** (`relieve`, #143): el nivel es del mapa y la escena lo aplica sin inventar nada. Lo que se pisa va al de su región; un nodo, al de sus regiones y, entre dos niveles, el paso sin camino al alto: es un hueco en el borde de la meseta y su rampa baja de él (al bajo era un pozo con paredes a los lados, s443 (25,10)); el nodo con camino y la ciudad, al bajo (al alto, las rampas de camino dejaban lo alto del acantilado sin roca); cada casilla de barrera, al más alto de **las dos regiones que separa ahí** (las más cercanas por dentro de su franja 8-conexa; `nivelesDelRelieve`, en `core`, la misma regla que mira el generador): **el acantilado es el borde de la meseta**, a su nivel y cubierto de roca, y la cara cae a su pie del lado bajo (por franja, el trozo entre un 1 y un 0 de una franja que tocaba un 2 lejos subía a 2, una cresta: s1 (14-18, 1-9)); **el agua, plana y sin encajar** (#210): cada franja a ras de la más baja de las regiones que toca, la de dentro de una región a ras de ella (encajada un nivel bajo su orilla más baja dejaba toda lengua de la orilla baja y toda ciudad del cruce por encima del agua, y entre dos mesetas cañones de caída 3: 351 lados en 10 semillas; ahora la caída máxima es 2 y entre dos regiones al mismo nivel el río va en el llano). Ninguna barrera ni nodo de una casilla de ancho queda por encima de sus dos vecinas de un eje: baja a lo más alto de ellas (el espolón de una montaña o un acantilado en lo bajo; el paso sin camino con agua a los lados, que entonces baja y su rampa sube de él). Fuera las crestas por encima de las dos orillas, los cañones entre dos llanos, las mesas, la escalera que subía lo que se pisa y el «+1 a ras» (`acantiladosARas`, #174, se retira con ellos; eran 98 de 258 franjas de acantilado entre dos llanos y 250 mesas en 1-40). `informe.nivelFueraDeSuRegion` y `desnivelesSinBarrera` (dos casillas vecinas que se pisan a distinto nivel sin ser la rampa de un nodo) = 0. **El borde de la meseta, entero** (#212, `bordes.ts`): la espalda (el reborde al norte, que la cámara no ve) de **toda** meseta, no solo del acantilado, lleva una hilera de peñascos de la roca de lo alto y la sombra del desnivel (abajo, #211); **el canto** (#219, `cantoDeLaEspalda`, `CANTO_DE_LA_ESPALDA`): cuatro por casilla, seguidos a lo largo del filo, el pie a 0,04-0,1 del lado y de 0,42-0,58 de alto, con su propia corriente de azar (también el módulo: con la de siempre movía toda la cubierta); en el acantilado, encima de su hilera de siempre. En 1-40, de 2,45 a 4,17 peñascos por casilla de reborde que se pisa o de acantilado (09-10-2026); donde no cabe ni el peñasco más bajo (una senda por el canto, la reserva de un objeto) queda como razón declarada; `informe.espaldasSinReborde` = 0 (eran 795 en 1-40). Las mesas de arenisca (`esMesa`: más anchas que `ANCHO_DE_MESA` = 1,3 veces su alto) son del acantilado y la cordillera de arena va con agujas (`informe.mesasEnLaCordillera` = 0, eran 1 444). La ladera sigue leyéndose como cresta por su dibujo: el arte está pedido (`docs/art/peticiones.md` §34). **Lo alto lleva roca** (#205) **de su cara** (#212, `materialDeLaCima`: la de la casilla más cercana de su franja que cae a la vista; con la de su suelo, s57 llevaba picos grises sobre un cantil de arenisca; `informe.cimaDeOtroMaterial` = 0, eran 1 431 en 1-40): cada casilla de acantilado, un pico de esa roca de `ALTO_DE_LO_ALTO` (0,4) o más, y dos en el borde de una meseta y tres dentro (`cimaDeRoca`, `picosDeLaCima`), donde quepan sin pisar senda, paso ni reserva; en lo alto de la arena y la lava (`comoLaBarrera`) la cubierta del relleno se cambia por roca (`rocaEnLoAlto`). Todo eso, con su propia corriente de azar (`azarDeLoAlto`): con la de siempre movía las cordilleras que se visten después. `informe.acantiladosLisos` (casillas de acantilado sin roca ni masa de 0,4, fuera de la huella de un objeto) = 0 salvo 2 en 1-40, entre dos sendas (eran 1 167 de 4 016). **La pared, de la roca de su meseta y entera por delante de la cordillera** (#216, `bordes.ts`): la casilla de barrera alta lleva el nivel de su lado alto pero su suelo (`Analisis.suelo`) es el más cercano de cualquier nivel, a menudo el de abajo; la roca de la pared, de lo alto (`materialDeLaCima`) y de cada macizo (`materialDeLosMacizos`) sale de `sueloDeLaMeseta`: lo que se pisa más cercano **a su nivel**, sin los nodos (la meseta de arena de s5 (2-8, 27-31) acababa en una pared gris; `informe.caraDeOtroMaterial` = 0, eran 806 de 2 506 paredes en 1-40). El suelo pintado bajo la barrera sigue siendo el más cercano. Y ninguna masa (pico o árbol) que se pinte después de una pared del desnivel cubre su silueta (`formasDeLasParedes`, en `obstaculos`: columnas por el perfil, `MARGEN_DE_LA_PARED` 0,05): se encoge o no va; lo de detrás no se mira, lo tapa la pared. `informe.paredesTapadas` (`paredesTapadasPorLaMasa`, frontales, laderas y diagonales sin pedregal ni bajadas) = 0 en 1-40 (eran 653 de 1 939; bajo una montaña, 424 de 757, un 24 % de su silueta). Las casillas de montaña sin un pico de 0,6 pasan del 26,9 al 28,0 % (08-10-2026). **El agua se lee al alejar** (#205): más clara y azul (`FILTRO_DEL_AGUA`, `pintar.ts`), la ciénaga algo más oscura y su niebla a 0,1.
  **Los puentes** (`puentes.ts`): `analizar` decide qué nodos llevan puente (`Analisis.puentes`: los de barrera `water` del mapa; `pasos`, esa barrera y el eje, sobre el terreno del mapa) y su casilla es agua en la escena (`Analisis.terreno`). La pieza `puente-<piedra|troncos>-<eje>[-sube]` sale de las orillas que une (`puenteDe`), de piedra si lleva camino; los quebrados —los planes del agente y el ~1 % del procedimental sin eje— se asientan con `asentar` (escala 0,7-1,15, el medio del tablero como se ve en la casilla del nodo). Se apoya por el centro del tablero con las medidas de su JSON (`pxPorCasilla`, `alturaDelTablero`, `largoDelTablero`, `pnpm taller derivar-puentes`). La senda acaba en sus estribos (`tramosHastaLosEstribos`) y llega por tierra (`Escena.vados`, `informe.sendasDeEstriboEnAgua` = 0). La pared que cruza la línea del puente por dentro de su filo no lleva pieza (`celdasBajoLosPuentes`); la que solo toca, por detrás del puente (#222). **Qué tapa un tablero** es una regla, la del pintor (`vaDelante`: `esVolumen` y `ordenDeVolumenes` de `separar`), en el pasillo de lo que se aparta y en `ponerPared`; la cara se pinta solo bajo la silueta de su pared (`CaraDeEscena.pintada`, `caras.ts`). `informe.puentesTapados` = 0, contado desde el orden del pintor. La marca del dueño cuelga de `Escenario.asientoDeObjeto`, siempre un punto, y el puesto de un nodo tomado, con su bandera, en el extremo de atrás del tablero (`Puente.puesto`); quien pisa un puente se pinta en él (`pisada`). Un clic sobre el tablero va al nodo (`puenteBajo`) solo si debajo hay agua o la casilla del nodo: la tierra de una orilla manda.
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
- **La base es un escenario lateral** (`partida/base/escena.ts`, `render/base/`), como el de
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
  región o a más de 1,5 pasos de la raya, y lo que no se pisa. **El lienzo va a todo el alto, como
  el mapa** (20-10-2026, decisión del usuario: «al hacer la pantalla más estrecha se encoge la parte
  donde se ve la base»; iba en un marco 20:11 que encogía con el ancho): el paso es el de una
  batalla en un marco 20:11 de ese alto (`pasoDeLaBase(alto)` → `escalaDelCombate`, el encuadre
  aprobado el 09-10: 85,7 a 594 de alto, 111,5 a 773; en el móvil, al alto del mapa, 513 en 390×844, con el
  ancho de 860 de la batalla del móvil) y lo que
  cambia con el ancho es cuánta plaza se ve. El suelo va a 25°. Toda figura va delante de todo
  edificio. Un sitio sin construir enseña la placa. Camina el héroe si está dentro y, si no, el
  alcaide; un clic lleva a la puerta y, al llegar, el ayuntamiento o el castillo abren «Ampliar»,
  una morada su escena y una persona la conversación (`<dialog id="conversacion">`). **La morada
  es la base misma** (`Scene = 'morada'`, `partida/morada/escena.ts`, vuelta 2 del 20-10-2026: «queda una
  sala en el vacío»): la cámara de la base se acerca hasta que las figuras miden lo de su hoja
  (`pasoDeLaHoja`; nunca se aleja, así que a densidad 1,5 casi no se mueve) y se centra en el
  edificio con su tope (`encuadrarLaMorada`), el edificio se cambia por su **versión abierta**
  (casa de muñecas, sin la pared de delante: `abierta-<id>.webp`, `abiertaDe`; la única
  sustitución, `conLaAbierta`; sin ella, su exterior) y delante, en el empedrado
  (`FILA_DE_LOS_RECLUTAS`), una figura por unidad que produce, que se elige con el clic o su botón
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
  `assets/bases/<f>/fuentes/`, fuera del build. Sin placa, un tramo pinta su marcador. **Los
  templarios heredan el arte de los caballeros** (19-10-2026): sus moradas van en los sitios que
  ese arte pinta (Pueblo 1, Forja 3, Establos 5 y Monasterio 6; el 2 y el 4, sin edificio) y su
  índice está rederivado. **No muertos, imperio, elfos y orkos, con su arte** (20-10-2026): sin
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
- **Arena** (`pnpm arena`): **edita el catálogo del juego** (19-10-2026, decisión del usuario) y
  monta peleas con sus reglas. Las unidades son las de `data/unidades.json` y las piezas, las de
  `data/equipo.json`: «Guardar» escribe los dos, y el cuerpo de todo héroe en `data/heroe.json`, en una operación (`escribirCatalogo`,
  `tools/arena/borrador.ts`), validados con la regla de la carga del juego (`leerCatalogos`,
  `moradasBlocker`), conservando su `_comment` y sin recargar la página (`handleHotUpdate` por
  contenido, `tools/vite/arena.ts`); si algo no vale no escribe ninguno, y uno ilegible no se pisa. **Ni lo guardado desde otra pestaña** (26-10-2026): la página lee la versión en disco de los dos
  ficheros (`versionDelCatalogo`, un hash de su texto) y la devuelve al guardar; si cambió, no se escribe
  ninguno y lo dice, «recárgala» (`guardarCatalogo`, `tools/arena/borrador.ts`). Tras guardar, la página
  adopta la versión que dejó escrita.
  Guardar cambia lo que se recluta y se compra en `pnpm dev`. La arena construida (sin servidor) lee
  el catálogo del núcleo y no guarda. **Solo las cinco facciones**, toda
  unidad de una casilla y sin munición. **Sin compatibilidad hacia atrás** (14-10-2026: «estamos en
  pleno desarrollo»): el catálogo y el enlace se leen solo en el formato de hoy; una unidad del
  catálogo que no vale (editada a mano) no deja arrancar la página, que dice por qué (`comun/arranque.ts`).
  Es también el banco
  de combate: un héroe por lado con libro (`heroeDeArena`, con el equipo base) y **el cuerpo de todo
  héroe** (03-11-2026, petición del usuario: «los héroes son casi indestructibles… ¿cómo las puedo
  editar en la arena?»): PV, fuerza y agilidad del héroe recién hecho (`combate` de `data/heroe.json`,
  `CuerpoDeTodoHeroe`, con su regla de carga, `combateDelHeroe`) se escriben en la ficha de
  cualquiera de los dos héroes y cambian a los dos (`HeroeDeArena.cuerpo`, el mismo en los dos:
  un enlace con dos distintos se rechaza), también a media pelea; «Guardar» escribe solo ese
  `combate` y deja la rendición, el equipo base y el comentario (`escribirCatalogo` con `heroe`; su
  versión, en la de «Guardar», `FICHEROS_DEL_CATALOGO`). **Y su equipo** (04-11-2026, petición del
  usuario: «no se les puede cambiar el equipo y no pueden tener armadura»): cada héroe lleva el
  suyo (`HeroeDeArena.equipo`), que empieza en `EQUIPO_BASE` y se cambia en la sección «Equipo» de
  su ficha, la de las unidades (`equipoDeLaFicha`, `opcionesDelHueco`, `quitarBlocker`,
  `equiparEnArena`, `quitarEnArena`, para una unidad o un héroe), con la regla del equipo de una
  unidad (`equipoDeUnidadBlocker`, que `heroeDeArena` aplica al vestirlo); va en el enlace, nadie
  borra una pieza que lleve (`cambioDePiezas(…, heroes)`) y «Guardar» no lo escribe. El retoque
  del héroe a media pelea compara su ficha entera en palabras (`fichaDelHeroe`: también el cuerpo y
  lo puesto; sin ellos, cambiar PV o equipo a media pelea no hacía nada). Y **pelea como el
  juego** (19-10-2026): sin interruptores; un `?reglas=`, `?golpe=` o `?contacto=` se rechaza
  diciéndolo («la arena pelea con las reglas del juego: quita «?reglas=» de la dirección»,
  `retiradosDeLaURL`) y el enlace que lo trae no se monta. Lo suyo: la muralla, retocar cifras a
  media pelea y que quién mueve es del **bando entero** (Yo / IA en su cabecera; con un solo bando
  de la persona, la rueda dice «Tu golpe»). Monta sus unidades como stacks del catálogo de la pelea
  (`catalogoDelMontaje`; dos unidades distintas con el mismo id lanzan). «Copiar enlace de la
  pelea» escribe el montaje entero (`?montaje=`, versión 20 desde el material de la muralla, 04-11-2026, sobre la 19 del equipo del héroe, `VERSION_DEL_ENLACE`, leída estricta:
  unidades con cuerpo y equipo, puestos `{ unidad }` y todas las piezas que lleva lo montado con sus
  bases en cadena, `piezasDelMontaje`); al abrirlo, sus piezas entran en el catálogo de la página
  como cambios sin guardar, con la regla de editarlas a mano (`conPiezas`, `cambioDePiezas`), y la
  barra dice cuántas cambia. **Un enlace de otra versión se rechaza** («este enlace es de una
  versión anterior: vuelve a copiarlo»), sin convertir nada; cambiar el formato o las reglas es
  subir la versión. Abrirlo lo monta sin luchar. **Recargar deja la vista** (23-10-2026): la edición y el equipo van en la
  URL (`?vista=edicion|equipo`, con `?pieza=` en el equipo), que escribe solo `irA` y el repintado
  del equipo (`vistaALaBarra`) y lee el arranque (`vistaDeLaURL`: una que no vale se dice y abre el
  montaje); la pelea no sobrevive a recargar. **Cuerpo y equipo** (12-10-2026, ciclo 2 del
  nivel único): una unidad es un cuerpo (`cuerpo: { hoja }`, el arte con que se pinta) más su
  equipo (cinco huecos, `data/equipo.json`), y pelea con las dos cosas (`unidadDeCombate` →
  `conEquipo`); de las dos sale el nivel, y del nivel su coste (la ficha lo lee: «Coste»). Las hojas de un personaje (`Hoja.personaje`) comparten cuerpo y agilidad
  (`AGILIDAD_DEL_CUERPO`, `tools/arena/velocidades.ts`). «Nueva unidad» (`unidadNueva`) crea desde
  una hoja entera una unidad `<hoja>-<n>`, con el cuerpo común y la Espada (`ESPADA`) por todo
  equipo, con el `n` libre también entre las que no valen (`IdsOcupados`); nace en el nivel que dé
  su índice y la barra lo lee de él (`avisoDeNuevaUnidad`); su arte es el de su cuerpo
  (`cuerpo.hoja`, nunca el Y Bot en lugar del arte); sin `edificio`, la partida no la recluta. Un
  catálogo con solo unidades que no valen se dice leído (`avisoDelCatalogoLeido`). **La muralla de
  la arena** (`battle/muralla.ts`, formas en `data/borradores/murallas.json`, `arena/murallas.ts`):
  muros altos donde suben los de dentro y los atacantes con escalera o el rasgo `escalar`, puertas
  entre dos casillas que abre y cierra quien defiende, sin tiro a través en el suelo; un tirador en
  lo alto suma `defensaEnLoAlto` (`data/muralla.json`, inventado), que pone `opcionesDeDanio` y por
  eso lo cuentan igual el golpe, la IA, la ficha y la previsión. Las formas de la arena son de
  piedra; las batallas del mapa llevan la de su sitio (piedra o madera, `data/sitios.json`), y un
  enlace con `"material": "madera"` la monta de madera. Los botones de la muralla son los de la
  partida (`MurallaDeLaActiva`, `botonesDeMuralla`). **Poderes** (11-10-2026; también en el juego): una unidad con Curar lo
  usa en su turno (jugada `power`, cierra el turno, no tras moverse). En la batalla,
  «Editar» del panel abre la ficha del tipo o del héroe y el cambio vale en la pelea y en el
  catálogo. La ficha escribe ataque, fuerza, agilidad y PV, y da de final la defensa, el daño, las
  casillas y «peso N de F: −k agilidad» (montado de guerra, «peso N de M (Caballo de guerra): −k
  casillas», y con montura una fila más, «Marcha», `marchaDe`) (`filasDerivadas`,
  `client/arena/paneles.ts`). **El nivel no se escribe** (12-10-2026): la
  ficha enseña «Índice N · nivel n» (`lecturaDelNivel`), que se recalcula al tocar cualquier cifra o
  pieza; una unidad con `level` no vale. `SesionDeArena` vive en `sesion/partida.ts`. **La vista de
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
  figura (`flex-wrap`); lo vigila `cifrasCortadas` (`tools/qa/capturas/ficha.ts`) en
  `pnpm capturas`. La pastilla de modificador tiene letra y tamaño propios (12 px) en todas partes. **Lo que suma una pieza tiene una forma**: `modificadoresDePieza` (`hero/equipo.ts`, una
  lista en el orden de `CIFRAS_DE_PIEZA`, con `NOMBRE_DE_CIFRA`, los rótulos de la tabla) y
  `textoDeModificador` (signo siempre, el único que formatea); en pantalla, `modificadoresEnPantalla`
  (una pastilla por cifra, en la ficha, el editor de equipo y los paneles del juego), y donde no cabe
  marcado (un `<option>`, el agente), `cifrasDePieza`, el mismo texto con comas. Una unidad con el arte a medias (el taller generándola)
  se lista como incompleta con su motivo y no se monta —nunca el Y Bot en su
  lugar—; `vite build` lo avisa y no falla (`arteEnOchoDirecciones`, #140). **El editor de
  equipo** («Editar equipo», escena `equipo`, también desde el panel de la pelea; 18-10-2026): el
  catálogo entero, en cinco secciones por tipo —Cuerpo a cuerpo (`arma`, con la casilla «es una lanza»), A distancia,
  Armadura, Escudo y Montura (26-10-2026: fuerza, agilidad, peso y la casilla «de guerra»; una nueva
  nace con la fuerza del cuerpo común y agilidad 2, `enElHueco`)—, con el sello «armería», «botín» o «solo en kits», y la ficha de la elegida con
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
  solo para leer (`ruedaDeLaPieza`, en `batalla/rueda/disco.ts`, la geometría que comparte con
  `batalla/rueda/rueda.ts`). «+ Nueva pieza», «Duplicar», «Nueva sobre esta» y «Borrar» (no se borra la base
  de otra, ni la que alguien lleva, ni la última de botín); quien lleva una pieza suma lo que da y su
  nivel lo ve. A media pelea, el cambio vale ya para todos los que la llevan, de los dos bandos y el
  héroe, con lo gastado restado, y queda en el parte; la IA espera.

## Revisar las animaciones

Skill **`/revisar-animaciones <id>`** (30-10-2026, `docs/agents/2026-10-30-evaluar-animaciones/`):
el maniquí primero (`pnpm taller maniqui <id> --huesos`, `pnpm taller revisar-maniqui`), los
dos jurados (subagentes de Claude y ChatGPT por Codex, la unión de sus hallazgos), los
árbitros, el visor para la persona, el encuadre sin modelo (C1, al empaquetar) y, para la
pose, versiones de cada hoja de las que entra la que gana a ciegas. El trabajador no pinta
sobre un maniquí sin esqueleto o que anda hacia atrás. El detalle, en `docs/art/taller.md`
(«La revisión»).

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
| `pnpm typecheck` y `pnpm lint` | segundos | siempre que cambie código |
| `pnpm vitest run test/<x>.test.ts` | según el fichero | **por partes**: solo los ficheros de lo que se toca, y cada uno con su porqué (qué mira y por qué el cambio puede romperlo) |
| `pnpm verify` | ~80 s | **no lo corren las sesiones**: lo corre CI |
| `pnpm verify:lento` | ~75 s | lo corre CI; a mano, entero no: los ficheros lentos de lo que se toca (`HEROES_LENTO=1 pnpm vitest run test/<x>.test.ts`), con su porqué. **El arte de una unidad, no** (23-10-2026, decisión del usuario: «no se pueden lanzar los tests todo el rato sin pensar»): una vez, cuando lo visual está dado por bueno, solo los tests que lo leen: `HEROES_LENTO=1 pnpm vitest run test/taller-8d.test.ts -t <id>` (el atlas de cada dirección sale de sus hojas) y `pnpm vitest run test/clips-por-unidad.test.ts` (su maniquí lleva los clips que declara); con su identidad o su giro, también `test/arte-hojas.test.ts -t <id>` |
| El navegador / el espectador | minutos | si el cambio se ve, o tocas `comun/html.ts`, `espectador/` o el canal |
| `pnpm qa` | ~3 s | si tocas `src/server/` o el contrato |
| `pnpm capturas` | ~245 s | si el cambio se ve; sale 1 con un error en consola |
| `barrido-semillas.ts` | ~1 s | si tocas la IA o la economía: 4 semillas; una sola sin terminar es regresión |
| `pnpm banco` | ~2 s | si tocas el núcleo sin querer cambiar el juego: 20 partidas (eran 200; decisión del usuario, 21-10-2026: «estamos en pleno desarrollo»); para medir más, `pnpm banco 200` |
| `npx tsx tools/qa/medidas/rectitud.ts` | ~50 s | si tocas `generate.ts` o `vestir.ts`: tramos rectos en **1-3000**, tres procesos por bloques de 1000, con los largos a escala (`largoALaEscala`, en `core/escala.ts`; en 42×42: ≥ 10 ≤ 176, caras ≥ 10 ≤ 3, mapas con tramo ≥ 12 ≤ 23; desde #231 lo medido, 143 / 0 / 12, más 10 / 3 / 3, y con #232, 164 / 0 / 14: los mapas que se visten otra vez, al ritmo de los que no cambian; con los ríos (#144), 95 / 0 / 4, con el río de una casilla, 90 / 0 / 5, y también entre dos niveles, 102 / 0 / 5; con el río continuo, 102 / 0 / 5, y sin agua de frontera fuera de él, 118 / 0 / 10, y con el río de lago de 20, 121 / 0 / 12; con el recinto de las ciudades en el núcleo, 98 / 0 / 6; sin minas (21-10-2026), 106 / 0 / 10; con las ciudades en mitad de su región (05-11-2026), 159 / 0 / 20, y el techo de mapas sube a 23 (el cruce de tres regiones ya no lleva ciudad); con los pueblos en un nodo (fase 3), los mismos 159 / 0 / 20; con #230 eran 174 / 14 / 14 y una perturbación neutra del azar movía hasta 21 tramos: si un cambio del azar lo pasa, se vuelve a medir con su fila en `TECHOS`). El guardia, en `test/rectitud.test.ts` (orden lenta) |
| `enfrentamiento.ts` | ~2 s | si cambias cómo decide la IA de batalla: entra solo con el intervalo entero > 50 % en 5 000 parejas |
| `tools/qa/navegador/neutro.ts` | ~10 s | si tocas una hoja de estilo: sin `data-tema`, 0 diferencias con HEAD |
| `tools/qa/navegador/clima.ts [carpeta]` | ~15-30 min (con fps) | si tocas el clima: capturas de cada clima en el mapa, la batalla, la base, la morada y el espectador, lo inexplorado intacto, el rayo y los fps (`--sin-fps` para solo mirar) |
| `tools/qa/navegador/temas-con-piezas.ts [carpeta]` | ~5 min | si tocas los temas o sus piezas: rótulos de sección sobre su pieza, el lienzo quieto en 7 ventanas, lo que tapan marco, remate y cartela, y las capturas lado a lado |
| `npx tsx tools/qa/medidas/arena-ia.ts` | ~2 s | si tocas el movimiento de la batalla, salir del contacto, la carga, la rueda o la armadura: 100 peleas por variante con unidades del catálogo, IA contra IA (peleas sin terminar, rondas, tiempo, cargas, cruces y golpes parados) |

- **Presupuesto de pruebas** (la máquina es compartida: varias sesiones prueban a la vez y
  con carga 30+ vitest falla por timeouts y hay que repetir). Mientras se itera, solo el test de lo
  que se toca (`pnpm vitest run test/x.test.ts`); la suite entera, nunca (la corre CI);
  `capturas` y `banco`, **una vez al cerrar** y solo si el cambio toca lo que miran (y no se repiten si nada cambió
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
  `tools/qa/medidas/banco.ts` y se juzga **la forma del diff** (qué semillas cambian y
  cuál es el primer hecho distinto), no el hash.
- Medidas de equilibrio y duración: solo si la tarea es medir (ver «No se prueba la jugabilidad»,
  arriba), y con **100 semillas**. Una cifra medida se escribe con su fecha.
- Nada de puntuación de deuda ni pruebas de mutación.

## Decisiones tomadas

- **MCP antes que API key** (el usuario tiene Claude Max).
- **Nada del HoMM2 original**: se reimplementan las reglas; el arte se genera.
- **Facciones del juego**: las cinco de la arena —templarios, no muertos, imperio, elfos y orkos— (19-10-2026); caballeros y nigromantes se retiraron.
- **Una cita a la fuente se extrae, no se teclea**: una cita falsa es peor que
  una cifra declaradamente inventada.
