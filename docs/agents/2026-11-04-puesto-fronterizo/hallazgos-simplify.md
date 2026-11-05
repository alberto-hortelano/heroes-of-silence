# Hallazgos de `/simplify` sobre la fase 1 (guarnición y defensa)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff de la fase 1.
Deduplicados y decididos por el coordinador. Las líneas son las del worktree al revisar
(04-11-2026); pueden haberse movido.

Regla para quien aplica: **no cambia lo que el juego hace salvo donde se dice** (S7, S8). Si
`pnpm banco` cambia en cualquier otro punto, es un fallo de la refactorización: se busca, no se
re-ancla.

## Se aplican

**S1 · Una regla de guarnición hostil** (los cuatro revisores). El predicado
`g !== undefined && g.dueño !== player && g.tropa.length > 0` está a mano en
`game.ts:2338` (`guarnicionesAjenas`), `game.ts:2643` (`enemyAt`) y `ai/strategy.ts:123`
(`objectValue`), y `queLoCierra` (`game.ts:2468`) lo mira sin dueño. El docstring de
`guarnicionesAjenas` dice que la usa `enemyAt` y no es verdad. → un `guarnicionHostil(state,
sitio | id, player)` en `sitios.ts` (el único que interpreta `guarniciones`) que leen los cuatro.
Las ciudades siguen por su camino de hoy (ver D1).

**S2 · La defensa por elegir vive en la batalla pendiente, no en la crónica** (altitud 2,
simplificación 3, eficiencia 1). `defensaPosible` (`game.ts:3201`) compara el último
`defense_set` con el último `battle_started` y recalcula `sitioDelHeroe`: la legalidad depende del
orden de los hechos y recorre la crónica entera. → `dejarPendiente` guarda `DefensaElegida
{ hero, sitio }` en la `PendingBattle` (p. ej. `defensa?`); `defensaPosible`, `defensaPorElegir`,
`defensaBlocker` y `elegirLaDefensa` la leen de ahí; `defense_set` solo lo cuenta. Fuera
`ultimoIndice` si se queda sin uso. Arreglar el docstring de `DefensaElegida` (habla de «con
cuántos dentro y fuera», el tipo no lo lleva).

**S3 · Los dos cupos, en la puerta** (altitud 1). `repartir` (`sitios.ts:223`) «no juzga los
cupos» y lo comprueban a mano `intercambioBlocker`, `ejercitoDeLaDefensa` (`:481`) y
`defensaDeLaIA` (`:400`). → `repartoBlocker(state, hero, sitio, enElHeroe)` en `sitios.ts` (el
héroe con `capacidadDe`, la guarnición con `cupoDeLaGuarnicion`); `repartir` lanza con él
(fail-loud en la puerta) y los tres lo usan como su «¿vale este reparto?». Es el agujero que hizo
lanzar a `createBattle` días después (desviación 2): el próximo que escriba por `repartir` (fase 3,
la IA que deja tropa) no debe poder reabrirlo.

**S4 · Las reglas de la pantalla de la defensa, al núcleo** (altitud 3, simplificación 4-5,
reutilización 5-6, 9). `Session.defensa` (`session.ts:1738-1780`) escribe `motivoMenos` en el
cliente, copia `cupoDelHeroe` (`tope - 1`) y `heroLeadership` a mano, construye la tropa con
`flatMap`/`reduce` y recalcula `lineas()` una vez por fila; `unoMasEnLaDefensaBlocker` rehace
`todos` y `hay`; la vista (`guarnicion.ts:84`) decide además cuándo ocultar `motivoMas`. →
`defensaPorElegir(state, player, pedida?)` devuelve las filas con `hay`, `pelean`, `motivoMas` y
`motivoMenos` ya escritos por el núcleo, lo ocupado y los cupos (`capacidadDe`); la sesión solo lo
pinta y la vista enseña el motivo que le den. `unoMasEnLaDefensaBlocker` se integra ahí (o es
`ejercitoDeLaDefensa` con uno más de ese tipo). Lo de «entre los dos» (`[...hero.army,
...guarnicionDe(...)]`, cinco veces) sale de un helper de `sitios.ts`, y los ejércitos por tipo de
`ejercitoDe`/`individuosDe` (`hero/troop.ts`).

**S5 · Perder o entregar el sitio, una vez** (altitud 6, reutilización 2-3, simplificación 7).
`applyVictory` ramifica por `sitio.kind` dos veces (`:3725-3733` rama `hero`, `:3745-3752` rama
`guarnicion`) y la rama del héroe lee `state.guarniciones[...]?.dueño` a pelo; `guardadaPor`
(`:2973`) duplica `guarnicionDe` + `dueñoDelSitio`; `lugarDelRival` (`:3007`) hace su propio
`map.objects.find` con su propio error. → un `entregarElSitio(state, sitio, ganador)` (ciudad →
`captureTown`, paso → `captureNode`, pueblo → `quitarLaGuarnicion`) que llaman las dos ramas;
`dueñoDelSitio` donde se pregunta de quién es; `casillaDelSitio(sitioPorId(...))` en
`lugarDelRival`.

**S6 · Un vocabulario para dejar y recoger** (simplificación 2, reutilización 8). Cuatro:
`'dejar' | 'recoger'` (sesión), `'guarnicion-dejar' | 'guarnicion-recoger'` (`main.ts`),
`HaciaDonde` (`sitios.ts`) y la acción. → el tipo de la acción (`'dejar_tropa' |
'recoger_tropa'`) de punta a punta: `intercambioBlocker`, `moverTropa`, la sesión, las filas de la
vista y el `data-*` del botón. Fuera `HaciaDonde` si queda sin uso. «Un grupo → un pedido»
(`pedidoDeUno`, `session.ts:3744`) pasa a `sitios.ts` y lo usa también `planIntercambios`, que
agrupa con `troopSummary` en vez de su `Map` propio.

**S7 · Una regla de a quién se escoge** (reutilización 7). `ejercitoDeLaDefensa`
(`sitios.ts:452-458`) ordena por experiencia con su propio desempate; `elQueSeIria` desempata
además por las piezas puestas, así que la defensa y `recoger_tropa` pueden escoger a individuos
distintos con la misma experiencia. → los que pelean de cada tipo salen de
`licenciar(deEseTipo, creature, hay - count).queda` (`hero/troop.ts:404`). **Cambia** a quién se
escoge en un empate: si mueve el banco, se re-ancla diciendo qué semillas y cuál es el primer hecho
distinto.

**S8 · La IA recoge cuando llega, no «salvo el día 1»** (altitud 4). `planIntercambios`
(`strategy.ts:488`) recoge siempre que el héroe esté parado en un sitio suyo, salvo en su base el
día 1: el día 2, un héroe que se queda en casa la vacía igual, y la excepción existe solo para que
no cambie el banco. → atar la recogida a lo que la provocaba antes de esta tarea: el héroe que
**acaba hoy su marcha** en el sitio y el que **se contrata** en él (el nacido en su base no la
recoge: decisión del 22-10-2026). Con la defensa elegida, la guarnición pelea aunque no la lleve,
así que el que se queda en casa no la necesita. Si el banco cambia, se re-ancla con la forma del
diff explicada. Si resulta que no hay manera limpia de saber «llegó hoy» sin estado nuevo, se
para y se escribe en `implementacion.md` en vez de inventarlo.

**S9 · El pedido de tropa, discriminado en el núcleo** (altitud 7). `PedidoDeTropa` lleva
`veterano` opcional con `creature` y `count` que obligan a dos rechazos que solo existen por la
forma (`sitios.ts:287-292`). → en el núcleo, `{ creature, count } | { veterano }` (tipo y cantidad
del veterano, de su hoja); el contrato del agente sigue como está (`veteran` opcional, como
`equip`) y `accionDelAgente` traduce. Los dos rechazos se van; si el agente manda `veteran` con un
`creature` que no es el suyo, el motivo se escribe al traducir.

**S10 · Lo que sobra en la sesión** (simplificación 6, reutilización 5, 10). Fuera
`FilaDeLaGuarnicion.veterano` (es `grupo.veterania?.id`) y su spread; fuera
`VistaDeLaGuarnicion.sitio` si nadie lo lee; las dos columnas de liderazgo salen de
`Session.liderazgo`, extendida para aceptar un sitio (hoy la guarnición de la ciudad usa
`GARRISON_LEADERSHIP` y la vista nueva `cupoDeLaGuarnicion`: una fuente); `troopUnit(...).name` →
`unidadDelJuego(...).name`.

**S11 · La vista y su CSS** (simplificación 8-9, reutilización 10). `views/guarnicion.ts` escribe
`aria-disabled="true" class="apagada"` y el motivo a mano siete veces y el botón «Defender» dos
veces enteras. → el helper de lo apagado que ya hay (`motivoApagado`, `views/cifras.ts:29`, o el
patrón de `views/lugar.ts`), un solo «Defender». `style.css:252-271` repite el bloque de
`.salir-al-menu` y lo apagado de `.opciones-del-lugar`: se añade `.guarnicion` a esas listas de
selectores. `main.ts`: los dos bloques gemelos de abrir/cerrar diálogo, un `mostrarModal(el,
contenido | null)`; la guarda repetida de `playBattleAction`/`autoResolveBattle`
(`session.ts:2946`, `:2985`), un privado con la frase una vez.

**S12 · El contrato, una forma** (simplificación 10). `leave_troops` y `take_troops` son el mismo
`z.object` salvo el literal (`agent.ts:153`, `:160`) y dos tipos en `vocabulario.ts:96-97`. → una
forma compartida y un solo miembro de la unión con `type: 'leave_troops' | 'take_troops'`.

**S13 · `dueñoDelSitio` y la región** (reutilización 4). `sitios.ts:158` escribe a mano
`estructura(map).regionDe[y * width + x] ?? -1`; es `regionDeCasilla` (`state/asaltantes.ts:134`).
Se usa **si no crea un ciclo de importación**; si lo crea, se deja y se dice.

## Se descartan a conciencia

- **Unificar también las ciudades en `guarnicionHostil` y en el valor de la IA** (altitud 5): la IA
  ataca una ciudad con `miPoder < guarnicion * 1.1` y un paso con `ventajaClara`, y valora 0 el
  pueblo ajeno guarnecido. Unificarlo cambia cómo decide la IA, que no es esta refactorización.
  Lo toca la fase 2 (muralla en ciudad y pueblo); queda anotado allí.
- **Un campo común `sitio.objeto`** para quitar dos de los tres `switch` de `idDelSitio`,
  `casillaDelSitio` y `nombreDelSitio` (simplificación 7): valor menor y toca el tipo que la fase 2
  va a ampliar.
- **`intercambioBlockerEn` con el sitio ya resuelto** (eficiencia 4): ~14 barridos de
  `map.objects` por repintado del diálogo, que solo se repinta al cambiar la partida. Despreciable.
- **`guarnicionesAjenas` recorriendo `state.guarniciones`** en vez de `map.objects` (eficiencia 2):
  menos del 1 % frente al Dijkstra de la misma llamada, y pediría guardar `at` en la guarnición.
- **`recogerLoQueQuepa` en cada pasada** (eficiencia 5) y **el coste de `defensaDeLaIA`**: menos
  del 1 % de la pasada; n ≤ 14.
- **`esSuBase`** (dos revisores, dudoso): con S8 probablemente desaparece; si no, se queda.
- **El getter `guarnicionAbierta`**: patrón aceptable.

---

# Hallazgos de `/simplify` sobre la fase 2 (murallas del mapa, escaleras y puertas)

Cuatro revisores sobre `git diff HEAD` (la fase 1 está en `e652738d`) más `data/sitios.json` y
`test/datos-de-sitios.test.ts`. Deduplicados y decididos por el coordinador (04-11-2026). Las líneas
pueden haberse movido.

Regla para quien aplica: **el juego no cambia**. `pnpm banco` se queda en `883fe9be…`; si se mueve,
es un fallo de la refactorización y se busca, no se re-ancla. Lo único que cambia a propósito es del
cliente (S24: Escape y el fin de turno sueltan el muro o la puerta por elegir) y del contrato (S23: la
prosa de la muralla solo va cuando hay muralla). La fase 3 (mejoras del paso: empalizada y muralla en
un paso) va a leer todo esto; varias decisiones van por ella.

## Se aplican

**S14 · El sitio en juego, una pregunta** (altitud 1, reutilización «menor»). Hoy se deriva tres
veces: `dejarPendiente` (`game.ts:~3162`, `sitioDelHeroe` para la defensa), `sitioQueSeDefiende`
(`:~3212`, la muralla) y `applyVictory` (rama `hero`: `sitioEn(at)` + `dueñoDelSitio ===
derrotado.owner`, que es `sitioDelHeroe` a mano; rama `garrison`: `sitioPorId(foe.site)`). → una sola
`sitioQueSeDefiende(state, foe)` que leen las tres (y `lugarDelRival` si encaja sin forzar). La fase 3
montará la empalizada de un paso por ella: no puede haber una batalla tras la muralla de un sitio que
entrega otro.

**S15 · La regla de la muralla del mapa, en su módulo** (altitud 2, reutilización 5).
`murallaDelMapaBlocker` y `asaltoBlocker` viven en `battle.ts` (4 000 líneas) porque necesitan la
salida (`salidaDe`, `enElMarco`, `DEL_CENTRO_A_FUERA`, `despliegue`, `despliegueBlocker`…), y
`state/sitios.ts` importa todo `battle.ts` para juzgar un JSON. → sacar la salida a
`battle/salida.ts` (depende solo de `board.ts` y `casillasDeMuro`) y llevar `murallaDelMapaBlocker` y
`asaltoBlocker` a `muralla.ts`, junto a `cierra`, `ladoDeLaMuralla` y `validarMuralla`; `sitios.ts`
importa `muralla.ts`. `asaltoBlocker` no reescribe el paso de lo alto: recorre con `pasoPermitido(m,
'attacker')` (`reachable`/`distanciasDesde` de `board.ts`) desde los pies con escalera. Si sacar la
salida crea otro ciclo, se para y se dice en `implementacion.md`.

**S16 · Cada forma se valida una vez, con las piezas de `validar.ts`** (simplificación 5-6,
reutilización 6, altitud 5, eficiencia 4). `murallaDelMapaBlocker(valor: unknown)` valida por dentro
en un `try/catch` y `leerMurallasDelMapa` vuelve a llamar a `validarMuralla`; la raíz, las formas y el
material se juzgan con frases a mano; el material se escribe dos veces (el tipo y la lista) unidos con
casts. → `MATERIALES_DE_MURALLA = ['piedra', 'madera'] as const` con el tipo derivado y
`esMaterialDeMuralla`; la carga hace `validarMuralla` (lanza nombrando el fichero) y luego
`murallaDelMapaBlocker(m: MurallaDeBatalla)`, ya tipado; los objetos con `problemasDeObjeto` y el
material con `deLaLista`/`deLaListaBlocker`. El test de «que sea una muralla» pasa a ser de
`validarMuralla`.

**S17 · `createBattle` no revalida lo ya validado** (altitud 4, eficiencia 3). `createBattle` hace
`murallaPedida === SIN_MURALLA ? SIN_MURALLA : validarMuralla(…)`: identidad como centinela, y cada
batalla contra una ciudad o un pueblo crea un objeto nuevo que pierde la caché de `conjuntosDe`. →
`validarMuralla` recuerda lo que devolvió (un `WeakSet` privado de `muralla.ts`) y lo devuelve tal
cual si se lo vuelven a dar; `createBattle` la llama siempre, sin rama por identidad. Así todas las
batallas de la partida comparten las cachés de las dos murallas. (La marca de tipo al estilo
`MundoLeido` sería más estricta pero toca todas las firmas de la arena: no compensa ahora.)

**S18 · El material del vacío no manda en secreto** (altitud 3, simplificación 7). `SIN_MURALLA`
lleva `material: 'piedra'` y la desviación dice que nadie lo lee, pero el editor de la arena arranca
en `SIN_MURALLA` y cada trazo hace `validarMuralla({ …, material: muralla.material })`
(`arena/main.ts:~440`, `~919`): la piedra de lo dibujado sale del centinela. → el editor parte de una
muralla vacía con el material escrito (`murallaVacia('piedra')`, en `arena-murallas.ts` o
`muralla.ts`), y `SIN_MURALLA` queda como «esta batalla no tiene muralla», con el comentario
corregido. En los tests, un ayudante `muralla(muros, puertas = [], material = 'piedra')` en
`test/helpers.ts` donde hoy se añade `material: 'piedra'` a mano (los de `validarMuralla` siguen con el
objeto crudo).

**S19 · `data/sitios.json` por forma, no por material, e independiente de la arena** (altitud 6,
simplificación 8). La clave es el material, cada material tiene una forma y `murallaDelSitio(sitio)`
no recibe `state`; la fase 3 necesita casi seguro otra forma para un paso (un desfiladero) con el mismo
material, y la mejora del paso se lee del estado. Además el JSON copia la «Muralla gruesa» y la «Línea
con puerta» y un test exige que sean iguales a las de la arena, así que editarlo (su `_comment` dice
«inventado») lo pone rojo. → formas con nombre y `material` como campo (`murallas: { ciudad: {
material, muros, puertas }, pueblo: {…} }` o por nombre con una tabla sitio → forma, lo que quede más
claro), `murallaDelSitio(state, sitio)`, y fuera las aserciones de igualdad con la arena: el JSON es
del mapa.

**S20 · Con muralla, escaleras: lo decide una función** (altitud 7, reutilización 11, simplificación
11). `montarLaBatalla` hace `hayMuralla(m) ? conEscaleras(atacante) : atacante` y `arena-ia.ts`
(`trasLaMuralla`) copia la decisión y además monta los bandos a mano saltándose `batallaDeArena` y el
`v.cambia` de su variante; su `murallas: { piedra: 'piedra', madera: 'madera' }` es una identidad. →
una función del núcleo que reciba la muralla y devuelva el bando atacante listo (`alAsalto(bando,
muralla)` o similar, junto a `conEscaleras`); la llaman `montarLaBatalla` y `arena-ia`. La tanda
«murallas del mapa» monta por `batallaDeArena` si se puede (lo que le falte, la escalera del héroe,
se añade al montaje; si no cabe sin tocar el enlace, que aplique la función sobre lo que monte
`bandoDeArena` y se diga), con un campo `muralla?: MaterialDeMuralla` en `Variante` y las variantes
de `MATERIALES_DE_MURALLA`.

**S21 · El contrato, de la tabla** (simplificación 4, reutilización 2-4). `JUGADA_DE_MURALLA` es la
traducción, pero `accionDeBatallaDelAgente` invierte los cuatro pares a mano, la unión
`AccionDeBatallaDelAgente`, el zod (`z.literal('place_ladder')`…), las cuatro líneas del formato y la
prosa los teclean, `tools/qa/politica.ts:137` y la lista `enEspañol` del test del contrato también, y
`serialize.ts` (`murallaVista`) y `hechoAlAgente` traducen cada uno la escalera (`pie/muro →
foot/wall`) y la puerta. → la inversa derivada de la tabla (como `huecoDelSlot` de `SLOT_DE_HUECO`),
literales e interpolaciones desde la tabla (como `SLOT_DE_HUECO` y `HIT_DE_GOLPE` en `agent.ts`), la
política con `JUGADAS_DE_MURALLA` (que ya exporta `partida-del-arnes.ts`), y `escaleraAlAgente` /
`puertaAlAgente` en `vocabulario.ts` que leen `murallaVista` y `hechoAlAgente`.

**S22 · `hechoAlAgente`, exhaustivo** (altitud 8). Las dos traducciones de acciones ya son `switch`
sin `default`; los hechos siguen con `default: return e`, y por ahí hoy se cuelan `power` (`poder`) y
`retoque` (`nombre`, `cambios`) en español. → el mismo `switch` exhaustivo sobre `BattleEvent['kind']`
sin `default`, con los que pasan tal cual listados a mano, para que un hecho nuevo de la fase 3 no
compile sin decidir. **No** se renombran hoy los campos de `power` ni `retoque` (cambia el contrato):
backlog.

**S23 · La regla de la muralla, una vez, y al agente solo cuando hay muralla** (altitud 9,
reutilización 1, eficiencia 1). La prosa MURALLA del agente (`agent.ts:~837`) es la tercera copia de
`REGLA_DE_LA_MURALLA` (`arena-murallas.ts`, cuyo docstring cuenta que dos copias ya se quedaron
atrás), y va en cada `battle_turn`, también contra monstruos y asaltantes: ~2,2 KB y ~550 tokens por
petición, ~12 000 por batalla con 22,7 peticiones. → los hechos de la regla (puertas, lo alto, el
tiro, las escaleras), una vez en `battle/muralla.ts`, con las palabras como parámetro (izquierda/derecha
para la arena; ATACANTE/DEFENSOR y las jugadas de la tabla para el agente), y «ciudad = piedra, pueblo
= madera, paso sin muralla» dicho desde la tabla de S19. La nota y las cuatro líneas de jugada de
muralla van en un bloque que el formato de `battle_turn` lleva **solo si `walls !== null`**. `pnpm qa`
sigue en 0 y su búsqueda de la muralla sigue entrando.

**S24 · Lo que espera el clic de la muralla, una pieza** (simplificación 1-3, 12; reutilización 7-9;
altitud 10b). `MurallaDeLaActiva` lleva dos campos que se excluyen (`muro` y `puerta_`), `escala` y
`puerta` son el mismo `unaOElegir` cambiando el campo, `botonesDeEscala`/`botonesDePuerta` son copias
con dos `data-action`, el despacho del clic está duplicado en `main.ts` y `arena/main.ts` (`'escala'
in jugada ? … : …`), `noEscalaNunca` solo envuelve `quienNoEscala`, los literales de las dos uniones
están en cuatro listas (`TIPOS_DE_ESCALA`/`TIPOS_DE_PUERTA` privados en `battle.ts`, las guardas de
`escenas/batalla.ts`, `jugadaDelBotonDeMuralla` y la tabla), «solo el defensor abre» está escrito en
el botón (`poderes.ts:~176`), y lo que espera el clic vive aparte de `LoApuntado`: Escape suelta lo
apuntado pero no el muro por elegir, y los dos pueden convivir. → un solo «por elegir» (el tipo de
jugada), un `elegir(tipo)` con una tabla de motivo y frases, un `data-action="battle-muralla"
data-jugada="<tipo>"`, un `botonDeMuralla`, un `pulsar(jugada)` que llaman igual las dos páginas;
`quienNoEscala` y un `quienNoAbre(side)` nuevo del núcleo (que lea también `puertasBlocker`)
importados por la vista, y `hayMuralla` donde hoy se mira `muros.length`; `TIPOS_DE_ESCALA` y
`TIPOS_DE_PUERTA` exportados del núcleo y usados en las guardas. **Lo que espera el clic es uno**:
el muro o la puerta por elegir entran en `LoApuntado` como una clase más de `Apuntado`, con su
exclusión y su `soltar()` (Escape, tras la jugada, al cerrar la batalla); si la forma de `LoApuntado`
no lo admite sin retorcerlo, al menos Escape y el cambio de turno lo sueltan, y se dice. `unaOElegir`
deja de exportarse si ya no la usa nadie fuera; el invariante de `muroPorElegir`/`puertaPorElegir` se
queda en lo que el tipo no impide.

**S25 · El lienzo por acabado** (simplificación 9, altitud 10, reutilización 12, eficiencia 7).
`const PIEDRA = COLORES_DEL_MURO[material]` se repite en tres funciones con un nombre falso en la
madera, `pintarSillares` mira `material === 'madera'` dos veces (un `if` y un `hiladas = … ? 0 : …`),
y el umbral de la puerta escribe a pelo la madera que ya está en `HOJA`. → una tabla
`ACABADO_DEL_MURO: Record<MaterialDeMuralla, { colores, juntas: 'hiladas' | 'estacas' }>` resuelta
una vez por muro y pasada a las tres funciones, `if (estacas) … else …` en los sillares, y los
literales del umbral nombrados desde `HOJA`. **Lo pintado no cambia** (los colores de la empalizada se
quedan: se miraron en el navegador).

**S26 · Los tests de los sitios, con sus ayudantes** (simplificación 10, reutilización 10, eficiencia
2). `test/datos-de-sitios.test.ts` repite el ataque a la base (~5 veces) y al pueblo (~4), dos tests
de la base empiezan igual, `unPuebloDe` y `unPaso` están copiados de `guarniciones.test.ts`, y «una
guarnición de cada facción…» hace `newGame({ seed: 5 })` 50 veces (1,45 de sus 1,49 s; medido). →
`unPuebloDe`/`unPaso` a `test/helpers.ts` (los importan los dos ficheros), `contraLaBase(seed,
guarnicion, atacante?)` y `contraElPueblo(seed, guarnicion)` que devuelven `{ state, b }`, los dos
tests de la base juntos, y una plantilla `newGame` en `beforeAll` con `structuredClone` por vuelta
(medido: 0,37 ms el clon).

## Se descartan a conciencia

- **`BattleState.muralla: MurallaDeBatalla | null`** (altitud 3, opción a): quitaría el centinela de
  raíz, pero cambia el tipo que leen la arena, el enlace, el espectador y el lienzo. Con S17 y S18 el
  centinela ya no decide nada; se reconsidera si la fase 3 lo pide.
- **Marca de tipo `MurallaValida`** (altitud 4): ver S17.
- **Renombrar los campos en español de `power` y `retoque` en el contrato** (altitud 8): cambia el
  contrato del agente fuera de esta tarea. Backlog.
- **Mandar `walls.tiles` solo el primer turno** (eficiencia 8): ~300 caracteres; rompe la simetría del
  contrato (como `board`). Con S23 lo caro se va.
- **El espectador recalcula la muralla por mensaje** (eficiencia 5), **los motivos de los botones por
  repintado** (eficiencia 6), **lo de cada fotograma** (eficiencia 7) y **lo de una vez por batalla**
  (eficiencia 9): microsegundos.
- **Retirar el invariante de `muroPorElegir`/`puertaPorElegir`** (simplificación 12): se estrecha
  (S24), no se retira: un guardia barato.
- **Condensar `CLAUDE.md`** (nota de eficiencia): es la práctica del proyecto; si acaso al cerrar la
  tarea entera.
