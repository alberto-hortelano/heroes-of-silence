# Hallazgos de `/simplify` (05-11-2026), consolidados y decididos

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff de las fases 1-3. Aquí van
deduplicados y con la decisión tomada. **Ninguno debe cambiar el juego**: `pnpm banco` tiene que dar el mismo sha
(`8e45709f…`) salvo en S9 (ver allí), y si cambia por otro motivo, se para y se explica.

Medida de eficiencia (revisor de eficiencia, perfil de 5 partidas de s16): no hay regresión que se note; `pnpm banco 20`
tarda lo mismo que HEAD. Lo caro es preguntar el dueño derivado una y otra vez (`dueñoDeUnSitio` ≈2,9 %,
`fotoDeLosSitios` ≈2,3 % del juego). Lo arreglan S4, S5 y E1-E3 sin memorizar nada nuevo.

## Se aplica ahora

### S1. Un solo predicado por idea: «cruza su barrera» y «es un nodo»
`enElMuro(o)` (`map.ts:70`) mira el campo `barrera` (paso o pueblo del muro) y deja fuera toda ciudad, así que sus
llamadores escriben `enElMuro(o) || o.kind === 'town'` (`murallas.ts:225`, `alrededorDeMurallas` en `colocar.ts`,
`minimapa.ts:~94`, `mapa.ts:1012`, `auditarMapaDenso` en `test/helpers.ts`), que cuela **la ciudad de dentro de una
región** como nodo. Y hay cuatro nombres para dos ideas (`enElMuro`, `enUnNodo`, `sitioEnUnNodo`, `clase`).
- Renombrar `enElMuro` a lo que mide (`cruzaSuBarrera`: paso o pueblo del muro, «se cruza por su eje»).
- Lo que pregunta «es un nodo / tiene dueño guardado» va a la red (`sitioEnUnNodo`, o `NodoDeRed.clase` donde ya se
  tenga la red); fuera los `|| o.kind === 'town'`. Donde el código trabaje sobre un plan o una rejilla sin red
  (generador, escena), usa lo que ese módulo ya tenga para saber si una ciudad es nodo (p. ej. los nodos del plan o
  `asentarLosSitios`), no `kind === 'town'`. Si en algún sitio la ciudad de región debe contar (p. ej. como apoyo
  de una muralla por su huella), dilo con un nombre propio, no con el de «nodo».
- Desaparece de paso la variable local `enElMuro` de `generate.ts:2555`, que tapaba la función.
- Riesgo: puede mover la escena (murallas, guardias). Los guardias de la escena tienen que seguir a 0 en 1-40 y el
  banco igual; si algo se mueve, explícalo.

### S2. El núcleo no lee `owner` de una ciudad o un pueblo
`owner` de ciudad/pueblo es el dueño guardado solo si el sitio es nodo; en uno de región vale `null`. El cliente y
el espectador meten ahí el dueño derivado (S6), pero en `core` un `town.owner` nuevo devolvería `null` sin avisar.
- Invariante nuevo en `test/invariantes.test.ts`: en `src/core`, nadie **lee** `.owner` de un objeto `town` o
  `village` fuera de `regiones.ts` (la red) y `tomarElNodo`. Romperlo a mano y verlo rojo.
- `mundo/lectura.ts:178-183` reconstruye `dueñoAlNacer` desde `map.objects`: que lo lea de `plan.towns[].owner`, que
  ya recibe; `bases` puede ser `basesDelPlan(plan)`.

### S3. `sendasPorObjeto` (`colocar.ts:~6020`)
Calcular primero `puertaDe` y saltar si es `null`; fuera la comprobación de `o.barrera !== null`, que repite la regla
de `puertaDe`.

### S4. Una sola bifurcación «nodo o región»
La pregunta «¿este sitio es un nodo? mira el nodo; si no, ¿de qué región es?» está a mano en seis sitios:
`dueñoDeUnSitio` y `dueñoEnLaFoto` (`regiones.ts:1413`, `1426`), `unido` en `rentaDelDia` (`renta.ts:120`), dos
bloques de `mundo/lectura.ts` (249 y 268; el segundo con `red.nodos.find` aunque existe `nodoPorId`) y
`problemasDeLosPueblos` (`generate.ts:703`).
- Una función en `regiones.ts` (`dondeEsta(red, id)` → `{ nodo } | { region }`, o `regionesDelSitio(red, id)`) que
  lean todos.
- `dueñoEnLaFoto` lanza con un id desconocido, como `dueñoDeUnSitio` (hoy devuelve `null` en silencio).
- `dueñosDeNodos` (`regiones.ts:1392`) usa el índice con caché `objetoConDueño` en vez de montar su propio `Map`
  (`red.nodos.map(n => dueñoDelNodo(state, n))`).
- `casillasDeMuralla(map)` se calcula tres veces por mapa (`asentarLosSitios`, `construir`, `queParteLaZona`): que
  viaje en `RejillaAsentada`.
- `quienEsElNodo` (`regiones.ts:545`): su parámetro es `Candidato`.

### S5. El estado de un sitio, una función; y sin `sitioPorId` con el objeto en la mano
El par {dueño, ocupante} de cada ciudad y pueblo se monta en cuatro sitios —`recuerdoDe` (`game.ts:273`),
`fotoDeLosSitios` (`game.ts:1541`, con `SitioEnLaFoto` = `SitioVisto` + `sitio`), `construirVista().sitios`
(`vista-espectador.ts:309`) y `knownObjects` (`serialize.ts:279`)— y `ocupanteDe` vuelve a calcular el dueño que
se acaba de pedir.
- `comoEstaElSitio(state, sitio, dueño?)` en `sitios.ts` → `SitioVisto`; `SitioEnLaFoto = SitioVisto & { sitio }`.
- `ocupanteDe(state, sitio, dueño?)` acepta el dueño ya calculado; `rentaDelDia` le pasa el de su foto, y lo mismo
  `ocupadoBlocker` si se le da (o una variante con dueño).
- `fotoDeLosSitios` y la vista del espectador: una pasada de dueños por foto (con `territorio`/`dueñoEnLaFoto`), no
  una pregunta por sitio.
- `sitioDelObjeto(state, o)`: el pueblo va directo; la ciudad, por un índice de `towns` por id. Lo usan
  `recuerdoDe`, `fotoDeLosSitios`, `rentaDelDia` (hoy `ocupadoBlocker(state, sitioPorId(state, o.id))`),
  `objectValue` (`strategy.ts:126`, `146`), `construirVista` y `Session.ocupacionDe`.
- `serialize.ts`: `delSitio` solo en los `case` de `town` y `village` (hoy para todo objeto, con un
  `sitioEnUnNodo` por objeto); el ternario anidado de `kind` (576) a una tabla `Record<Sitio['kind'], …>`; el
  comentario de ~614 ya no dice la verdad (también viaja la guarnición de una ciudad que ya no es suya).
- `recuerdoDe`: sin repetir `day` y `object` en las dos ramas.

### S6. Cliente y espectador: una función para el dueño derivado y la ocupación
`Session.loConocido` (`session.ts:1610`) y `sitiosDelCable` (`adaptar.ts:169`) hacen lo mismo (copia con `owner`
derivado y la lista `SitioOcupado`). Una función pura común (junto a `SitioOcupado`, en `render/mapa.ts`) que
reciban las dos. Y en el espectador no se llama en cada fotograma (`espectador/main.ts:374`, dentro de
`pintarTodo`): se calcula al llegar la instantánea o se memoriza por `SpectatorView`.
- `VistaSitio.node` va por el cable y nadie lo lee: fuera (y su `enUnNodo` por sitio y fotograma). `adaptar.ts`
  sigue siendo la inversa exacta (ajusta `test/espectador.test.ts:150`).
- `Session.dueñoDe(town)` (`session.ts:1634`) no tiene llamadores: bórralo (la sesión ya llama a
  `dueñoDeLaCiudad`).

### S7. El generador: lo repetido del poblamiento
- El Fisher-Yates a mano de `ciudadesDeRegion` (`generate.ts:3232`) y `pueblosEnElMuro` (`3358`) → exportar
  `barajar(rng, lista)` de `vestir.ts:193`. Hace las mismas llamadas a `rng.int` en el mismo orden: el banco no se
  mueve (compruébalo).
- `saltosALaRegion` (`1912`) y el cierre `saltos` (`3101`), la misma fórmula: una función de módulo.
- `parejasDeFuera` (`1914`) y `fuera` (`2544`), la misma expresión; el número de parejas con ciudad escrito de dos
  formas (`1930` y `2385`): una sola.
- `porDosCaminos`: `saltosDesde(red, b, n)` no depende de la región; memorízalo por (base, nodo) dentro de
  `intentarRed`.
- `cruceros` (`1877`, `1937`): el filtro `c !== b0 && c !== b1` ya no quita nada (las bases no van en el río) y
  `neutrales = cruceros` es un alias. Una lista, con el comentario «los cruces del río son las ciudades-puente».
- El 5 × 5 de recinto y accesos se marca en dos bucles (`2209`/`2348` las del muro, `2393` las de región): un
  `marcarElRecinto(i)` local. La distancia de Chebyshev, exportada de `recinto.ts` (hoy privada) en vez de
  reescribirla en `lejosDeTodas` y en `intentarRed`; el array de `lejosDeTodas`, una vez por región.
- `conGuarnicion` (`950`) → `guarniciones`.
- El comentario de `crucesConCamino` (~1975) habla de ciudades que tocan tres regiones: ya no las hay.
- `validarPoblamiento` (`data.ts`): con `problemasDeObjeto` de `core/validar.ts` en vez de comprobar las claves a
  mano (si `validarRios` lo hace a mano, puede quedarse; este es nuevo).

### S8. `sitios.ts`: la regla «suyo» una vez
- `heroeEnSuSitio(…, suGuarnicion = true)` (~778) y `sitioDelHeroe` (1229) escriben dos veces «el sitio es suyo o lo
  es su guarnición». `heroeEnSuSitio` usa `sitioDelHeroe` y pierde el booleano posicional; `mejorar` rechaza con
  `!suyo` como `dejar`. Comprueba que `mejorar` sigue rechazando igual (un paso con guarnición suya pero de otro no
  existe: `tomarElNodo` limpia la guarnición; si no es así, dilo).
- `dueñoDeLaGuarnicion` (586) devuelve `PlayerId | null | undefined`, donde `undefined` es «no hay tropa»: que
  devuelva la `Guarnicion | null` (con tropa) y cada llamador lea `.dueño`. `ponerLaGuarnicion` ya borra las vacías:
  el `tropa.length > 0` de `ocupanteDe`, `dueñoDeLaGuarnicion` y `guarnicionHostil` se afirma una vez.
- El héroe ajeno en una casilla, una función (`heroeAjenoEn(state, at, jugador)`) para `ocupanteDe` (233) y
  `enemyAt` (`game.ts:2870`).
- `export type { Ocupante }` (216) sin uso: fuera. `ocupanteDicho` (250), `ClaseDeNodo` (`regiones.ts:42`) y
  `EntradaDelPoblamiento` (`generate.ts:3190`) sin `export` si nadie de fuera los usa.
- El comentario de `ocupadoBlocker` sobre el paso («el paso, nada; hoy no se ocupa»): dilo solo del pueblo.

### S9. La ciudad que manda: una regla — y la armería
«La ciudad es tuya y no está ocupada» son dos comprobaciones seguidas en seis sitios (`build` 1659, `recruit` 1676,
`contratarBlocker` 2234, `planBuildings` y `planRecruits` de la IA, `motivoParaNoReclutar` y `views/base.ts:33`).
Un `ciudadQueMandaBlocker(state, town, player)` en `sitios.ts` («no es tuya» o la frase de `ocupadoBlocker`) que
lean todos.
- **Decisión**: `buyBlocker` (`game.ts:2076`, la armería) hoy solo mira el dueño. El usuario eligió «Oro y la ciudad
  entera» (P4): ocupada, la ciudad entera deja de servir. Así que **comprar en la armería de una ciudad ocupada
  también se rechaza**, con la misma regla. Es el único cambio de comportamiento de esta vuelta: si mueve el banco,
  re-ánclalo y explica la forma del diff; dilo en CLAUDE.md (fila «Ocupación»).
- Un `sitioDeLaCiudad(town)` (o hermanas de `dueñoDeLaCiudad`: `guarnicionDeLaCiudad`) para el literal
  `{ kind: 'ciudad', town }`, que sale 17-19 veces fuera de `sitios.ts`. En `serialize.ts:690/692` se pide
  `guarnicionDe` dos veces seguidas para la misma ciudad.
- `castilloSuyoDelHeroe(state, hero)` para el `state.towns.find(…pointKey… && dueñoDeLaCiudad(…) === hero.owner)`
  repetido en `dismissBlocker` (2198) y `battleSideForHero` (3050).
- `tomarElNodo` (2953): con el objeto del sitio a mano (que el `Sitio` de la ciudad lleve su objeto del mapa, o un
  `objetoDelSitio`), sin el `objects.find` ni la comprobación de `kind` repetidos.

### S10. La IA (`ai/strategy.ts`)
- El dueño de una ciudad se calcula tres veces por objeto, héroe y decisión (`dueñoDeLaCiudad`, luego
  `valorDeRecuperar` y dentro `ocupanteDe`): pásalo calculado (o léelo de la `foto()` perezosa que ya hay). Las ramas
  `town` y `village` con la misma forma.
- `state.heroes.find(…) as Hero` (238) → `heroById`.

### S11. Eficiencia
- E1 = S5 (la foto de los sitios: una pasada de dueños, sin `sitioPorId`).
- E2. `visibleNowAt` (`game.ts:1118`, desde `emit` por hecho y jugador): mirar la distancia **antes** de preguntar el
  dueño de la ciudad.
- E3 = S10.
- `views/base.ts:33`: `ocupacionDe` fuera del bucle de filas.

### S12. Escena: `murallaPorVenir` es una copia de `vestirMuralla`
`colocar.ts:3877` repite el cálculo de la muralla (el arreglo de s18 de la fase 2 remendó la copia, y ya diverge:
llama a `tiradaDelMapa` sin `puertaNorte`). Una sola función que dé las piezas de la línea de una franja (tramos,
tiradas, torres, arrimadas), que `vestirMuralla` coloque y la reserva del puesto lea, memorizada por franja como
`lineaDe`. Los guardias del puesto (`puestosSinSitio`, `puestosTapados`, `puestosQueTapan`) a 0 en 1-40.

### S13. Herramienta de desarrollo y tests
- `client/desarrollo/regiones.ts:199` pinta el dueño solo de `town` y `node`: el pueblo del muro sale sin dueño.
  Que use la misma pregunta que el mapa.
- `test/ciudades-de-region.test.ts:31` (`porLosCaminos`) reescribe la adyacencia de caminos: usa
  `grafoDeCaminos(map).unidas` y exporta `pieza` de `test/helpers.ts`.

## Al backlog (issues)
- **El pueblo fantasma** (`sitiosSinPueblo`, `generate.ts:2568`, `2645`): el sitio de dentro del pueblo que se muda
  se sortea y queda reservado (y la fila de su puerta vetada) solo para no mover el azar. Lo general: decidir qué
  parejas van al muro antes de `colocarPar` y sortear los sitios de los pueblos con su propia corriente. Cambia los
  mapas y obliga a re-buscar semillas de tests: no ahora.
- **`DE_LADO_POR_LA_ESQUINA` vuelve a crecer** (s66, `regiones.test.ts:666`): que `colocarPar`/`ponerObstaculos`
  rechace una puerta cuya única entrada es en diagonal por una esquina de agua.
- **`pasosAtravesados`** (`colocar.ts:5995`): la excepción por `kind` del pueblo; lo general es un dato de la pieza
  («se cruza por su eje»).
- **La IA mide distinto un sitio del muro con guarnición ajena**: la ciudad con su margen ×1,1 (`strategy.ts:170`) y
  el paso o el pueblo con `ventajaClara` (`valorDeUnNodo`). Un `valorDelSitio(sitio)`.
- **Una red se tira por un nodo a 2 de una ciudad-puente** (`generate.ts:1898`): calcular el centro de las
  ciudades-puente antes de elegir los nodos.
- **El dueño derivado en la vista, aparte de `owner`** (`VistaMapa.dueños`), en vez de reescribir el campo en una
  copia (S2 pone el invariante; esto es la limpieza de fondo).

## Lo que se descarta, a conciencia
- **Un contador de versión de los dueños para memorizarlos** (eficiencia H3): sería estado nuevo para un coste
  medido de ~3 % del juego y sin regresión en el banco; con S4/S5/S10 baja más. Se vuelve a mirar si un perfil lo pide.
- **Caché de las ciudades por región en `rentaDeLaRegion`** (H6): 2,2 µs por renta.
- **Compartir la `RejillaAsentada` entre `componentesDelMapa` y `estructura`** (H10): 11,9 ms en 20 mapas.
- **El techo de rectitud** (15 → 23): no es de `/simplify`; lo decide el usuario al cerrar.
- **`vocesBlocker`/`ponerVoces` con `dueño` y `player`** → `esSuya`: un parámetro, sin ganancia clara.
- **Unificar «héroe de tal facción»** (`ocupanteDicho`, `otro()` de `mundo/reglas.ts`, `renderLog`): son frases de
  contextos distintos (núcleo, mundo, crónica) con formas distintas a propósito.
- **`towns[].owner` y `sitios[].owner` en el cable del espectador**: salen de la misma función en el mismo
  `construirVista`; no divergen. Se quita solo `node` (S6).
