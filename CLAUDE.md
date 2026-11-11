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

**Este fichero es el índice; el detalle está en `docs/areas/`** (fase Doc de la reorganización,
08-11-2026: era de 306 KB y el adelgazamiento del 04-10 volvió a crecer en un mes). Aquí, los
contratos, una línea por puerta y por regla, y qué leer antes de tocar cada carpeta. **Una puerta o
una regla nueva es una línea aquí y su detalle, con fecha, en el doc de su área**; lo vigila
`test/documentacion.test.ts` (≤ 50 KB, filas de puertas ≤ 200 caracteres, rutas y símbolos que
existen).

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

- **`?seed=N&faccion=<id>&heroe=<tipo>` fija la partida** (`parseSeed`, `parseFaccion`); sin
  ninguna de las tres, el menú de inicio (`hayQuePreguntar`); sin `?heroe=`, se elige en la base.
  Detalle: `docs/areas/partida.md`.
- **`?clima=` fuerza el clima para mirarlo** (`parseClima`) en la partida, la arena y el
  espectador: `docs/areas/interfaz.md`.
- **`?mundo=<id>` juega un mundo** (`partidaDelMundo`; «Generar el mundo» lanza el motor):
  `docs/areas/mundos.md`.
- **`?tropa=`, `?rueda=`, `?solo-heroe=1`**: la complejidad del combate (`combateDeLaURL`):
  `docs/areas/batalla.md`. En la arena, `?montaje=` y `?vista=`: `docs/areas/arena.md`.
- **`vite build`** copia `assets/` sin lo que solo lee el taller (`seCopiaAlBuild`); **CI** corre
  `pnpm verify`, `pnpm test:lento`, `pnpm banco`, `vite build`, `pnpm qa` y
  `tools/qa/exportaciones.ts`, y no gasta un céntimo. **Ninguna sesión corre la suite entera**
  (25-10-2026, decisión del usuario: «Elimina el verify completo. Los tests se hacen por partes y
  justificando cada parte»). Detalle: `docs/calidad.md`.

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
  battle/ magia/   la batalla (montaje, rueda, carga, disparo, granada, muralla) y los hechizos
  combate.ts       la complejidad del combate (tope de tropa y rueda)
  unidad/formato.ts  el formato de una unidad (cuerpo + equipo) y su validación
  unidad/catalogo.ts el catálogo del juego: lo único que lee data/unidades.json
  unidad/ equipo/  el cuerpo y el nivel de una unidad; las piezas (vestir, manos, la base)
  hero/ town/      héroes, tropa, infiltración; ciudades, edificios, economía
  state/           GameState: turnos, marcha, sitios, batallas del mapa, visión, clima, crónica
  map/             red de nodos, recinto, río, niebla; generar/ (el procedimental) y vestir/
  ai/              IA de respaldo: táctica y estratégica
  contract/        esquemas zod, serialización y vocabulario del agente
  arena/           el montador de la arena (montaje, ficha, retoque, enlace, piezas)
  mundo/ gente/    los mundos (formato, validación, lugares); el banco de NPC y las voces
src/server/        bridge WebSocket + puente MCP (partida.ts, director.ts, mcp/, entorno.ts)
src/client/        Vite + Canvas 2D. Solo pinta y manda intents
  comun/html.ts          LA PUERTA del marcado
  sesion/partida.ts       LA PUERTA al núcleo
  comun/           arranque, semilla, temas, dichos, el bucle
  sesion/          batalla/ (arma, muralla, cruce, despliegue), vistas/, la sesión de la arena
  partida/         la página del juego: inicio, mapa, base, morada, ayuntamiento, tropa, lugar
  batalla/         escena, animador y la rueda del golpe (partida, arena y espectador)
  render/          escenario/ y mapa/ (el mapa), batalla/, base/, figuras/, clima/
  views/           paneles comunes (campo, crónica, notas, cifras)
  espectador/      mira la partida del servidor, no juega (adaptar.ts, paneles.ts)
  arena/           edita el catálogo del juego y monta peleas con sus reglas
  desarrollo/      herramientas solo de pnpm dev (marcas, inspección, el mundo)
src/shared/        contrato visual de cliente y taller (cámara, base, cable, muralla)
tools/comun/       procesos, json, argumentos, navegador (vite propio), raíz, semillas
tools/vite/        los plugins de vite.config.ts (arena, mundos, npcs, marcas, publico)
tools/qa/          exportaciones.ts y huella.ts; agente/ (pnpm qa), medidas/ (banco y medidas),
                   navegador/ (neutro, clima, temas), capturas/ (pnpm capturas)
tools/taller/      el taller de arte con Codex (pnpm taller): cola, órdenes, escenario, revisión
tools/art/         poses/ (el rig del Y Bot: cli.ts), montura, ybot-a-distancia.ts
tools/mundo/ tools/npcs/ tools/marcas/ tools/arena/ tools/datos/ tools/fuentes/   sus órdenes
data/              unidades, equipo, edificios, economía, hechizos, sitios… en JSON editable
assets/            arte (unidades/, npcs/, mapa/, bases/, batalla/, generated/), letras/ y temas/;
                   mundos/ (los mundos); art/ (láminas y referencias de estilo) no va al build
docs/areas/        el detalle de cada área; docs/calidad.md, docs/banco.md, docs/historia.md
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
  solo `import type`. Lo vigilan `invariantes-capas.test.ts` y el plugin `sinDesarrollo`, que rompe
  `vite build` si se cuela. Las marcas van a `docs/revision/marcas/` (ignorado).
- **Un guardia hay que verlo morder**: cada invariante nuevo se rompe a mano y se
  mira rojo antes de darlo por bueno. Una orden documentada hay que verla
  arrancar (y morir).

Los vigilan `test/invariantes-capas.test.ts`, `test/invariantes-batalla.test.ts`,
`test/invariantes-partida.test.ts`, `test/invariantes-datos.test.ts` y
`test/invariantes-cliente.test.ts` (las fronteras de esta sección y de «Puertas únicas»). Todos
nacen en verde.

## Áreas: qué leer antes de tocar

| Si tocas | Lee antes |
|---|---|
| `src/core/battle/`, `src/core/magia/`, `src/core/combate.ts`, `src/client/batalla/`, `src/client/render/batalla/` | `docs/areas/batalla.md` |
| `src/core/unidad/`, `src/core/equipo/`, `src/core/hero/`, `data/` | `docs/areas/catalogo.md` |
| `src/core/state/`, `src/core/town/`, `src/core/ai/`, `src/client/sesion/`, `src/client/partida/` | `docs/areas/partida.md` |
| `src/core/map/` | `docs/areas/mapa.md` |
| `src/client/render/escenario/`, `src/client/render/mapa/` | `docs/areas/escenario.md` |
| `src/client/comun/`, `src/client/views/`, `src/client/render/figuras/`, las hojas de estilo | `docs/areas/interfaz.md` |
| `src/core/arena/`, `src/client/arena/`, `tools/arena/` | `docs/areas/arena.md` |
| `src/core/mundo/`, `src/core/gente/`, `tools/mundo/`, `tools/npcs/` | `docs/areas/mundos.md` |
| `src/core/contract/`, `src/server/`, `src/client/espectador/` | `docs/areas/agente.md` |
| `test/`, `tools/qa/` | `docs/calidad.md`, `docs/banco.md` |
| `tools/taller/`, `tools/art/`, `assets/` | `docs/art/taller.md`, `docs/art/unidades.md` |

## Puertas únicas

Cada hecho tiene un sitio; la ruta, relativa a `src/core/` o `src/client/` (a `src/` si empieza por
`core/`, `client/`, `server/` o `shared/`) salvo que diga otra cosa. El porqué, las fechas y lo que leen de cada una, en el doc de su área.

### La partida

| Qué | Dónde |
|---|---|
| Dueño de un sitio del muro | `tomarElNodo` (`state/marcha.ts`), el único que escribe el `owner` de un objeto del mapa |
| Dónde está un sitio y de quién es | `dondeEsta`, `dueñoDeUnSitio` (`map/territorio.ts`); `dueñoDelSitio`, `dueñoDeLaCiudad` (`state/sitios.ts`) |
| La ocupación | `ocupanteDe`, `ocupadoBlocker`, `comoEstaElSitio`; la ciudad que manda, `ciudadQueMandaBlocker` (`state/sitios.ts`) |
| La crónica de los sitios | `anotarLosSitios` (`state/cronica.ts`) |
| La guarnición de un sitio | `guarnicionDe`, `laGuarnicion`, `sitioEn` (`state/sitios.ts`), el único que escribe `GameState.guarniciones` |
| La tropa entre héroe y sitio | `repartir`, `repartoBlocker`, `intercambioBlocker`, `repartirTropaBlocker` (`state/sitios.ts`) |
| Perder un sitio | `entregarElSitio` (`state/marcha.ts`) |
| La defensa de un sitio | la de la IA, `defensaDeLaIA` (`state/sitios.ts`); la de la persona, `elegirLaDefensa` (`state/batallas.ts`) |
| El sitio en juego y montar su batalla | `sitioQueSeDefiende`, `montarLaBatalla` (`state/batallas.ts`), el único de `state/` que llama a `createBattle` |
| Las murallas del mapa | `leerSitios`, `murallaDelSitio` (`state/sitios.ts`), el único que importa `data/sitios.json` |
| Las obras del puesto | `mejorarElPuesto` (el único que escribe `node.mejora`), `mejorarBlocker`, `laObraDelPuesto` (`state/sitios.ts`) |
| A quién se licencia | `elQueSeIria` (`hero/troop.ts`) |
| Construir un héroe | `heroeRecienHecho` (`hero/hero.ts`) |
| Contratar un héroe, también el de salida | `hireHero`, `contratarBlocker`, `candidatosAHeroe` (`state/heroes.ts`); su precio, `ECONOMIA.precioDelHeroe` |
| El ejército de salida y las facciones de la semilla | `startingArmy`, `faccionesDeLaSemilla` (`state/setup.ts`) |
| Qué se levanta en cada sitio de la base | `sitiosDeLaBase`, `siguienteDe`, `construidoEn` (`town/sitios.ts`) |
| De un píxel del cuadro de la base al escenario | `planoDelCuadro` (`shared/base.ts`) |
| Recortar un edificio de la base | `recortarLaBase`, `derivarRecorte` (`tools/taller/recorte-base.ts`) |
| Quién hay en una base y qué dice | `vecinosDeLaBase`, `vozDe`; las voces del narrador, solo `ponerVoces` (`gente/voces.ts`) |
| Lo que sobra tras la batalla | `tropaQueVuelve`, `sobrantesTrasLaBatalla`, `dejarBlocker` (`state/sobrantes.ts`); lo aplica `settleBattle` |
| La renta del día (solo oro) | `rentaDelDia` (`state/renta.ts`); lo que no alcanza, `oroBlocker` (`town/town.ts`) |
| Camino de un héroe | `alcanceDelHeroe`, `caminoHasta` (`state/marcha.ts`); nadie más llama a `findPath` ni a `reachableFrom` |
| Lo que se anda hoy | `pasosDeHoy` (`state/marcha.ts`) |
| La infiltración | `infiltracionBlocker`, `seInfiltra`, `precioDeLaBarrera` (`hero/infiltracion.ts`) |
| Territorio | `territorio`, `dueñoComun` (`map/territorio.ts`) |
| Quién lleva cada bando | `Player.controller`; la batalla del turno de la IA, `quienLaToma` (`ai/turn.ts`) |
| Desenlace y causa del final | `finDePartida`, `desenlaceDe` (`state/desenlace.ts`) |
| Ventaja para atacar o emboscar | `ventajaClara` (`hero/fuerza.ts`) |
| El héroe andando su marcha | `enLaMarcha` (`render/figuras/marcha.ts`), sobre la traza de la ruta |
| El clima | `climaDeLaPartida`, `pedirClima` (`state/clima.ts`), el único que importa `data/clima.json`; lo pinta `render/clima/` |
| Qué héroe y qué objeto se ven | `heroesALaVista`, `objetosConocidos` (`state/vision.ts`) |
| Qué grupo de asaltantes se ve | `asaltantesALaVista` (`state/asaltantes.ts`) |

### El mapa

| Qué | Dónde |
|---|---|
| Validar un plan de mapa | `validateMapPlan` → `problemasDeRed`; las bases, `basesDelPlan` (`map/generar/validar.ts`) |
| Qué barrera cruza un nodo | `MapObject.barrera`, que pone `buildMap` (`map/generar/construir.ts`); el procedimental, `queCruzaElNodo` |
| Dónde pone el generador ciudades y pueblos | `ciudadesDeRegion`, `pueblosEnElMuro` (`map/generar/poblar.ts`) |
| El río del procedimental | `trazarRio`, `rioEntero` (`map/rio.ts`); la única escritura de la rejilla del vestido, `ponerTipo` (`map/vestir/base.ts`) |
| Qué línea deja dos regiones a dos pasos | `lineasQueSeparan`, `separadasDeCerca`, `aguaALaVista` (`map/vestir/base.ts`) |
| Caminos de un plan al mapa | `caminosDelPlan` (`map/generar/construir.ts`) |
| Lo explorado: la niebla por regiones | `zonaDeNiebla`, `regionesQueDescubre` (`map/niebla.ts`); la única escritura de `fog`, `descubrir` (`state/vision.ts`) |
| Por dónde se entra en un pueblo | `puertaDe`, `rodeosParaEntrar` (`map/puertas.ts`) |
| El recinto de una ciudad, en el núcleo | `recintoDeLaCiudad`, `pasosDelRecinto`, `problemasDeRecintos`; su entrada, `parteDeLaEntrada` (`map/recinto.ts`) |
| Qué barreras admiten los niveles de dos regiones | `admiteLosNiveles` (`map/terrain.ts`) |
| Franjas de barrera y nivel de cada casilla | `franjasDeBarrera`, `nivelesDelRelieve` (`map/niveles.ts`) |
| Qué muro se queda: el cierre de un paso | `lineaDeLaPuerta`, `muroDeLaLinea`, `murallasDelMapa` (`map/murallas.ts`) |

### El escenario del mapa

| Qué | Dónde |
|---|---|
| Componer la escena | `componer` (`render/escenario/colocar.ts`): el orden de sus tiradas es el contrato |
| Qué es un árbol | `esArbol` (`render/escenario/colocar/tablas.ts`) |
| Lo que la copa de la masa no tapa de lo que se pisa | `topeDeLoPisable` (`render/escenario/colocar/pisable.ts`) |
| Los módulos de cubierta que no van en lo que se pisa | `FUERA_DE_LO_QUE_SE_PISA` (`render/escenario/colocar/tablas.ts`) |
| Lo que no se tapa (senda, tableros, reservas) | `Obstaculos` (`render/escenario/pasillo.ts`) |
| La labranza | `labranzaDe` (`render/escenario/labranza.ts`) |
| La ciudad del mapa: su recinto | `recintoDe` (`render/escenario/recinto/anillo.ts`), `contornoDelRecinto` (`render/escenario/recinto/octogono.ts`) |
| El orden de pintado del anillo de una ciudad | `ordenDelAnillo` (`render/escenario/recinto/orden.ts`) |
| Material de una cara | `materialDeCara` (`render/escenario/colocar/tablas.ts`) |
| Roca de lo alto y suelo de la meseta | `materialDeLaCima`, `sueloDeLaMeseta` (`render/escenario/bordes.ts`) |
| Muralla de una franja de muro | `trazaDeMuralla`, `torresDe` (`render/escenario/muralla.ts`) |
| Un muro de norte a sur | `tiradaNorteSur` (`render/escenario/tirada.ts`) |
| El puesto en la escena | `seVeConSuNodo` (`render/escenario/colocar/sprite.ts`), `sitiosDeLosPuestos` (`render/escenario/puestos.ts`) |
| La resolución del suelo, que pinta un Worker | `resolucionDelSuelo` (`render/escenario/superficie.ts`) |

### La batalla

| Qué | Dónde |
|---|---|
| Montar una batalla | `createBattle` (`battle/montaje.ts`), la única puerta, también la de la arena |
| Quitar vida | `herir` (`battle/damage.ts`; `applyDamage` no se exporta) |
| Escala del tablero (también la de la base) | `escalaDelCombate` (`render/proyeccion.ts`) |
| Con qué arma se da cada golpe | `usoDelGolpe` (`battle/damage.ts`); `golpeDe`, `cifrasDelGolpe` (`battle/armas.ts`) |
| Quién dispara y cuántos tiros | `tiroADistanciaDe`, `disparosDe` (`battle/armas.ts`) |
| Armas de fuego y granadas | `perforaLaArmadura`, `recargaDe` (`battle/armas.ts`); `lanzarBlocker`, `explosionDe` (`battle/a-distancia.ts`) |
| El disparo diferido | `apuntarBlocker`, `lineaDelDisparo` (`battle/a-distancia.ts`); la recta, `lineaDeTiro` (`battle/board.ts`) |
| La tirada del disparo | `cuartoDelDisparo` (`battle/damage.ts`) |
| El selector de arma | `ArmaDeLaActiva` (`sesion/batalla/arma.ts`) |
| La carga | `cargaDesde` (`battle/consultas.ts`); `cargaMontada`, `dichoDeLaCarga` (`battle/carga.ts`) |
| Turno y tope de jugadas | `mismoTurno` (`battle/consultas.ts`), `MAX_JUGADAS` (`battle/battle.ts`) |
| El despliegue | `asentar` (`battle/despliegue.ts`); lo que no vale con él, `despliegueEnCursoBlocker` (`battle/consultas.ts`) |
| La formación del héroe | `formarBlocker`, `batallaDeLaFormacion` (`state/batallas.ts`) |
| La rueda del golpe | `puntoDelCruce`, `cruceDelGolpe` (`battle/rueda.ts`); `efectoDelTipo` (`battle/cifras-de-la-rueda.ts`) |
| El paso del cruce | `pasoDelCruce`, `elegirEnLaRueda` (`ai/rueda.ts`) |
| Las fases del turno y el golpe plantado | `faseBlocker`, `firmaDelTurno`, `golpeEnCursoBlocker` (`battle/consultas.ts`); `soltarElGolpe` (`battle/battle.ts`) |
| La complejidad del combate | `ReglasDelCombate`, `combateCon`, `parseTope` (`core/combate.ts`) |
| Las formas de la rueda | `formaDeLaBatalla` (`battle/formas-de-la-rueda.ts`), la única que indexa `RUEDAS` |
| Forma del tablero | `isInside`, `espejo`, `FORMA_DEL_TABLERO` (`battle/board.ts`) |
| Muros, puertas y tiro tapado | `pasoPermitido`, `reglaDeLaMuralla`, `murallaDelMapaBlocker` (`battle/muralla.ts`) |
| La salida de cada bando | `zonaEnSuMarco`, `salidaDe` (`battle/salida.ts`) |
| Escaleras al asalto | `alAsalto` (`battle/montaje.ts`) |
| El arte de la muralla en el tablero | `pedirArteDeLaMuralla` (`render/assets.ts`); medidas, `shared/muralla-de-batalla.ts` |
| La muralla de la activa | `MurallaDeLaActiva` (`sesion/batalla/muralla.ts`) |
| Previsión de daño | `previsionDe`, `previsionDeLaRueda` (`battle/prevision.ts`) |
| Un hechizo: formato y catálogo | `problemasDelHechizo` (`magia/validar.ts`); `HECHIZOS_DEL_JUEGO` (`magia/catalogo.ts`), el único que importa `data/hechizos.json` |
| Lanzar un hechizo | `castBlocker`, `afectadosDe` (`battle/lanzar.ts`); la única aplicación, `lanzarHechizo` (`battle/battle.ts`) |
| Levantar un cadáver | `cadaverEn` (`battle/consultas.ts`), `queLevanta` (`battle/spells.ts`); el stack, `stackNuevo` (`battle/stack-nuevo.ts`); el `push`, `levantar` |
| Lo que dura un hechizo | `StackEffect` (`battle/effects.ts`); la muerte, solo `anotarLaMuerte` (`battle/battle.ts`) |
| Salir del contacto | `salirCuesta` (`battle/contacto.ts`), `contactoBlocker` (`battle/consultas.ts`) |
| Armadura | `trasLaArmadura`, `armaduraDe` (`battle/armas.ts`) |
| La rueda en pantalla | `DialogoDeLaRueda` (`batalla/rueda/dialogo.ts`); `ajustarLaRueda`, `contrincante` (`batalla/rueda/rueda.ts`) |
| La batalla contada en cola | `BattleAnimator` (`batalla/anim.ts`) |
| Los modificadores en curso | `modificadoresEnCurso` (`views/notas.ts`) |

### El catálogo

| Qué | Dónde |
|---|---|
| Cifras = catálogo + veteranía + equipo | `cifrasDeUnidad`, `costeDeUnaUnidad` (`unidad/catalogo.ts`); la suma del equipo, `conEquipo` (`equipo/vestir.ts`) |
| Fuerza, agilidad y peso | `cifrasDelCuerpo`, `restaDelPeso`, `marchaDe` (`unidad/cuerpo.ts`) |
| Nivel de una unidad | `nivelDeUnidad`, `indiceDePoder` (`unidad/nivel.ts`) |
| El catálogo de unidades | `unidadDelJuego` (`unidad/catalogo.ts`), el único que importa `data/unidades.json`; `leerCatalogos` (`unidad/formato.ts`) |
| Moradas | `Unidad.edificio`; `nivelDeMorada`, `moradasBlocker` (`town/buildings.ts`); el oro, `oroDelIndice` (`town/economia.ts`) |
| Reindexar el rango de héroe | `subidasDeRango` (`hero/rango.ts`) |
| Añadir a la mochila | `aLaMochila` (`state/equipar.ts`) |
| A quién va una pieza | `destinoDeEquipo` (`equipo/portador.ts`) |
| Lo que admite una mano y dos | `manosBlocker` (`equipo/manos.ts`); los huecos de una pieza, `huecosDeLaPieza` (`core/types.ts`) |
| Los huecos en el contrato | `SLOT_DE_HUECO`, `accionDelAgente` (`contract/vocabulario.ts`); por dentro, `HUECOS` (`core/types.ts`) |
| La montura | `monturaPuesta` (`equipo/vestir.ts`); la única cuenta, `cifrasDelCuerpo` (`unidad/cuerpo.ts`) |
| La regla de una pieza | `problemasDePieza`, `leerPiezas` (`equipo/pieza.ts`) |
| Sumar una base | `resolverBases` (`equipo/pieza.ts`), privada: la única suma |
| El equipo de una unidad | `equipoDeUnidadBlocker` (`unidad/formato.ts`); el del héroe, `EQUIPO_BASE` (`hero/cuerpo-del-heroe.ts`) |
| Un poder de unidad (y de su facción) | `poderDeUnidadBlocker` (`unidad/formato.ts`); el gremio de una facción, `hechizosDelGremio` (`magia/catalogo.ts`) |
| Lo de antes | no se lee: `validarUnidad` (`unidad/formato.ts`), `validarPieza` (`equipo/pieza.ts`) |
| La escala de las cifras | `ESCALA_DE_CIFRAS`, `marchaALaEscala`, `radioALaEscala` (`core/escala.ts`) |

### La interfaz

| Qué | Dónde |
|---|---|
| Con qué hoja se pinta un héroe | `figuraDelHeroe` (`hero/tipos-de-heroe.ts`), de `data/figuras-de-heroe.json` |
| Las hojas que se pintan | `registrarLasHojas` (`render/figuras/personajes.ts`) |
| Formatear un precio | `describirCoste`, `conMiles` (`core/texto.ts`) |
| Tema de la interfaz | `ponerTema`, `quitarTema` (`comun/temas.ts`), los únicos que escriben `data-tema` |
| Piezas en imagen de los temas | `PIEZAS`, `cssDePiezas` (`tools/taller/temas/piezas.ts`) |

### La arena

| Qué | Dónde |
|---|---|
| El editor de piezas | `conPiezas`, `cambioDePiezas` (`arena/piezas.ts`) |
| Unidad nueva | `unidadNueva` (`arena/unidad-nueva.ts`) |
| Por qué acabó una batalla | `causaDelFinal` (`battle/consultas.ts`) → `finalDeArena` (`arena/montaje.ts`) |
| Enlace de una pelea | `montajeALaURL`, `montajeDeLaURL`, `retiradosDeLaURL` (`arena/enlace.ts`) |
| Cambiar cifras a media pelea | `retocarEnBatalla` (`arena/retoque.ts`) |
| El editor de magia | `montarEditorDeMagia` (`client/arena/magia.ts`) |
| Guardar el catálogo | `escribirCatalogo`, `guardarCatalogo` (`tools/arena/borrador.ts`) |

### Los mundos y la gente

| Qué | Dónde |
|---|---|
| Un mundo: si vale | `problemasDelMundo`, `leerMundo` (`mundo/validar.ts`) |
| Dónde puede ir un lugar | `lugarBlocker` (`mundo/validar.ts`) |
| Si una opción de un lugar se puede elegir | `opcionBlocker`, `motivoDeLaOpcion` (`mundo/reglas.ts`) |
| Lo que hace un lugar | `aplicarEfectos` (`state/lugares.ts`), privada |
| La inicial de un lugar o de una cosa | `inicialDelNombre` (`mundo/formato.ts`) |
| El banco de figuras de NPC | `leerBanco` (`gente/banco.ts`); en disco, `estadoDeFigura` (`tools/npcs/banco.ts`), el único que toca `data/npcs.json` |
| Qué figura lleva la gente | `figurasDeLaGente` (`gente/figuras.ts`), `figuraQueSePinta` (`gente/banco.ts`) |
| Pedir figuras | `problemasDePeticiones` (`gente/banco.ts`); lo que se encarga, `encargosQueSiguen` (`tools/taller/npcs.ts`) |

### El agente

| Qué | Dónde |
|---|---|
| Los golpes y los poderes en el contrato | `HIT_DE_GOLPE`, `golpeDelHit`, `ruedaAlAgente`, `origenAlAgente` (`contract/vocabulario.ts`) |
| Los hechos que lee el agente | `hechoAlAgente`, `cronicaAlAgente` (`contract/hechos.ts`), el único que llama a `cronicaPara` hacia el agente |
| La petición de respuesta | `serializeBattleResponse` (`contract/batalla.ts`) |
| Lo que el agente sabe del mapa | `serializeKnownMap` (`contract/mapa-conocido.ts`) |
| La ficha de una criatura | `fichaDeCriatura` (`contract/vistas.ts`) |
| Por qué una marcha no llegó | `paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`) |
| Lo que se juega en su lugar | `EN_SU_LUGAR` (`server/notas.ts`), por cada `REQUEST_KINDS` (`contract/esquemas.ts`) |

## Reglas del juego

Verificadas contra fheroes2 salvo donde dice «regla nuestra». El detalle, con sus fechas y medidas, en el doc de cada área.

| Dato | Valor | De |
|---|---|---|
| Rejilla de batalla | 9 filas, las pares de 12 y las impares de 11 = 104 hexes, simétrica | nuestra |
| Tropa | individuos, uno por hex; tope por bando, héroe incluido: 3, 5 o 7 (por defecto 7) | nuestra |
| Recursos | solo oro (21-10-2026, «solo oro»): 27 500 de salida; el héroe de salida, 2 500 | nuestra |
| Movimiento diario | lo marca el más lento del grupo, el héroe incluido; fheroes2 × √1,5 | nuestra |
| Radio de vista | héroe 5, castillo y nodo propio 6; lo explorado, por regiones enteras | nuestra |
| Puntos de hechizo | 10 × Conocimiento | fheroes2 |
| Moral | −3 a +3, sin efecto en la batalla (26-10-2026): espera a la huida | nuestra |
| Suerte | no hay (02-11-2026, «Elimina la suerte completamente del juego») | nuestra |
| Moral por mezcla de facciones y con no-muertos | al empezar la batalla; −1 con algún no-muerto, que anula el +1 de una sola facción | fheroes2 |
| Prisa/Lentitud | duran el poder mágico del lanzador, en rondas | fheroes2 |
| No-muertos | moral 0 | fheroes2 |
| Iniciativa | por velocidad y puesto; un empate entre bandos, el contrario del último | fheroes2 |
| Dos efectos del mismo origen | refresca la duración (la mayor), no se acumula | fheroes2 |
| Turno de una unidad | tramos hasta gastar su velocidad; atacar, apuntar o `end_turn` lo cierran | nuestra |
| Despliegue | primero el defensor sin ver al enemigo, luego el atacante; 3 columnas de su borde | nuestra |
| Disparo diferido | apunta a una casilla y dispara al empezar su siguiente turno (sin validar) | nuestra |
| Armas de fuego | perforan la armadura y recargan; sin dado | nuestra |
| Granadas | explotan al empezar su siguiente turno en la casilla y sus seis vecinas; se gastan | nuestra |
| Carga montada | montura de guerra y lanza: F = la fuerza de la montura más la de la lanza | nuestra |
| Carga | todo el que pega cuerpo a cuerpo carga en recta, +5 %/casilla, tope 5 | nuestra |
| `fear` | ataque −2 durante 2 rondas (divergencia deliberada) | nuestra |
| Victoria | perder la base elimina en el acto | nuestra |
| Magia (hechizos) | un hechizo es datos: entrega, efectos, duración y facciones; el gremio y los poderes, solo de la suya | nuestra |
| Infiltración | cada casilla de barrera cuesta el día entero; parado en ella, intocable | nuestra |
| Levantar un cadáver | del último caído: vivo → zombi, zombi → esqueleto; nace sin turno y fuera del tope; al volver, se deja lo que sobra | nuestra |
| Guarnición y defensa | todo sitio guarda tropa; no se recoge sola; defiende el héroe con lo elegido | nuestra |
| Ocupación | un sitio de dentro de una región es de quien la tenga; con tropa ajena, no rinde | nuestra |
| Murallas del mapa | ciudad tras piedra, pueblo tras madera, paso tras su obra; escalera a todo el atacante | nuestra |
| Obras del puesto | empalizada (1 500) y muralla (4 000), de una en una y sin bajar | nuestra |
| Lugares | de 1 a 8 por mundo; cada premio se cobra una vez; el mundo es de los dos | nuestra |
| Ciudad amurallada | un recinto de 3 × 3; se entra por sus puertas, donde llega un camino; nada en sus accesos | nuestra |
| Rueda del golpe | los dos eligen a ciegas; el cruce fija la tirada; cifras por nivel del arma; ruedas de 7, 5 y 3 | nuestra |
| Armadura | `max(0, daño − armadura)` en cada golpe, lo último; ninguna pieza da PV | nuestra |
| Orden de turnos | en serpiente: quien cierra un día abre el siguiente (`ordenDelDia`) | nuestra |
| Salir del contacto | cuesta 1 + los enemigos que podrían golpear; se paga al dejar la casilla | nuestra |
| Facciones | templarios, no muertos, imperio, elfos y orkos; cada partida sortea dos | nuestra |

- Lo temporal vive en `BattleStack.effects` y se suma al leer, salvo la recarga
  (`BattleStack.recargando`). Toda batalla pelea con las mismas reglas («un solo combate»).
- **Economía, nivel y experiencia**: el coste de una unidad se deriva de su índice
  (`oroDelIndice`); un solo nivel, del índice de poder de la unidad vestida; la experiencia da
  rangos (`data/experiencia.json`). **Equipo**: seis huecos, una sola clase de piezas. Detalle:
  `docs/areas/catalogo.md`.
- **El mapa es una red de nodos**: regiones cerradas por barrera y pasos de una casilla; el río
  primero; las ciudades en su región salvo las bases y las ciudades-puente. Detalle:
  `docs/areas/mapa.md`.
- **Asaltantes, base, voces, la tropa que se hace héroe y el gremio**: `docs/areas/partida.md`.

Las cifras viven en `data/*.json` y se editan sin recompilar. Lo provisional o
inventado lo dice en su `_comment`.

## El agente

Patrón listen/respond: `heroes_listen` bloquea hasta que hay decisión, la petición trae el formato
de respuesta embebido, el agente responde una vez con `heroes_respond`, y el veredicto de lo
anterior llega pegado a la siguiente petición, también cuando acertó. Sus acciones se descartan una
a una con su motivo; todo pasa por la niebla; del contrato se exportan esquemas, no alias de tipo.
Defiende sus batallas y diseña el mapa (si el plan no vale, el procedimental y se le dice por qué).
Reparte tropa (`distribute_troops`) y mejora el puesto (`upgrade_outpost`), y **los hechos le llegan
traducidos** (10-11-2026: ni una clave ni un enumerado en español; `contract/hechos.ts`).
No están en su contrato (backlog): elegir la defensa de un sitio, entrar en un lugar (F4) y
elegir lo que sobra tras una batalla (lo deja la regla de la IA).
Las peticiones, las consultas, la rueda, la muralla, el clima y lo demás: `docs/areas/agente.md`.

## El cliente

Solo pinta y manda intents por `Session`. El menú de inicio, la base caminable (morada y
ayuntamiento incluidos), el mapa de aventura del escenógrafo, la batalla con la rueda del golpe y su
despliegue, la guarnición y la defensa, un tema por facción, el clima y la niebla de quien juega:
`docs/areas/partida.md`, `docs/areas/batalla.md`, `docs/areas/escenario.md` y
`docs/areas/interfaz.md`. La arena: `docs/areas/arena.md`.

## El taller

`pnpm taller trabajar` pinta el arte con Codex por la suscripción (encargos en cola, guías,
derivados); `pnpm taller` a secas solo enseña las órdenes (#327, 11-11-2026). Sin imágenes, cada
renderizador pinta su marcador. El detalle, en `docs/art/taller.md`; las unidades,
en `docs/art/unidades.md`; las peticiones, en `docs/art/peticiones.md`.

### Revisar las animaciones

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
`docs/agents/*/commits/` no se commitean. Cada rol lee `CLAUDE.md` y el doc de cada área que toque.

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
| `pnpm vitest run test/<x>.test.ts` | según el fichero | **por partes**: solo los de lo que se toca, cada uno con su porqué |
| `pnpm verify` | ~80 s | **no lo corren las sesiones**: lo corre CI |
| `pnpm verify:lento` | ~75 s | lo corre CI; a mano, solo los ficheros lentos de lo que se toca; el arte de una unidad, una vez |
| El navegador / el espectador | minutos | si el cambio se ve, o tocas `comun/html.ts`, `espectador/` o el canal |
| `pnpm qa` | ~3 s | si tocas `src/server/` o el contrato |
| `npx tsx tools/qa/exportaciones.ts` | ~7 s | si añades o dejas de leer una exportación |
| `test/documentacion.test.ts` | ~1 s | si tocas `CLAUDE.md` o una doc de las que vigila |
| `pnpm capturas` | ~245 s | si el cambio se ve; sale 1 con un error en consola |
| `tools/qa/medidas/barrido-semillas.ts` | ~1 s | si tocas la IA o la economía: una sola sin terminar es regresión |
| `pnpm banco` | ~2 s | si tocas el núcleo sin querer cambiar el juego (`docs/banco.md`) |
| `tools/qa/medidas/rectitud.ts` | ~50 s | si tocas `map/generar/` o `map/vestir/`: con sus `TECHOS` |
| `tools/qa/medidas/enfrentamiento.ts` | ~2 s | si cambias cómo decide la IA de batalla |
| `tools/qa/navegador/neutro.ts` | ~10 s | si tocas una hoja de estilo |
| `tools/qa/navegador/clima.ts [carpeta]` | ~15-30 min | si tocas el clima |
| `tools/qa/navegador/temas-con-piezas.ts [carpeta]` | ~5 min | si tocas los temas o sus piezas |
| `tools/qa/medidas/arena-ia.ts` | ~2 s | si tocas el movimiento, el contacto, la carga, la rueda o la armadura |

Cada fila con su porqué y sus cifras, en `docs/calidad.md`.

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
  cuál es el primer hecho distinto), no el hash; el historial de anclas, en `docs/banco.md`.
- Medidas de equilibrio y duración: solo si la tarea es medir (ver «No se prueba la jugabilidad»,
  arriba), y con **100 semillas**. Una cifra medida se escribe con su fecha.
- Nada de puntuación de deuda ni pruebas de mutación.

## Decisiones tomadas

- **MCP antes que API key** (el usuario tiene Claude Max).
- **Nada del HoMM2 original**: se reimplementan las reglas; el arte se genera.
- **Facciones del juego**: las cinco de la arena —templarios, no muertos, imperio, elfos y orkos— (19-10-2026); caballeros y nigromantes se retiraron.
- **Una cita a la fuente se extrae, no se teclea**: una cita falsa es peor que
  una cifra declaradamente inventada.
