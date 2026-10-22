# QA — F1a «el mundo con lugares» (22-10-2026)

Rama `claude/mapa-vivo-de40b2`, commit `6538e43b`, sin cambios en el código desde el último verde
del ingeniero. No repetí `pnpm verify` ni `pnpm capturas`: los cito de `implementacion.md` (vuelta de
simplify, los dos en verde sobre este commit). Navegador: Playwright sin pantalla contra un `vite`
propio en el 3371 (y dos más de un rato, en el 3373 con `HEROES_MOTOR=false` y en el 3374 con un
motor falso). Los maté por su grupo y comprobé que los puertos quedaban libres. El 3217 del usuario
no lo toqué. Capturas en `capturas/qa/`.

## Criterios (F1a, «Fase 1a, criterios de aceptación» + «Visto bueno al plan»)

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | `pnpm mundo validar` y la página aplican la misma validación; un mundo roto no arranca y dice qué y dónde | ✅ con reserva | CLI: `prueba`, `ejemplo`, `gen-20261022-219764` y el generado por mí «valen» (salida 0). Tres mundos rotos a mano: la CLI da 1, 4 y 2 problemas con su ruta (`historia.json: lugares[0].encuentros.corvo.tropa: … "imperio-dragon"`, `…hace[0]: la pieza "lanza_de_jinet" no existe…`, `…«teletransporte» no es un efecto…`, `mundo.json: jugador.heroe: "orko" no es un tipo de héroe de imperio…`, `rivales: es 2…`). La página pinta los mismos con «La página no arranca» (`20`–`22`). **Reserva**: con un JSON mal escrito, la página no dice qué fichero (H5). |
| 2 | Orden que lee el mapa para el motor, y skill | ✅ | `pnpm mundo leer gen-20261022-589627` → `lectura.json` (10 regiones, 80 casillas que admiten un lugar) y `mapa.png` de 1433×1433. Cada región trae nombre, suelo, nivel, vecinas, `casaDe`, ciudades, pueblos, río y casillas. También vienen las ciudades con su facción y su dueño, los pueblos, el río, las unidades, las piezas y el vocabulario. La skill está en `.claude/skills/motor-de-mundos/SKILL.md`. |
| 3 | Menú → generar con `claude -p` → espera con progreso → la partida arranca; `?mundo=` lo repite; un fallo se dice y deja jugar el procedimental; `?mundo=` con `?seed=`/`?faccion=` se rechaza; hay un mundo de ejemplo | ✅ | **Una** generación real, de punta a punta: Nuevo juego → No muertos → Nigromante → «El mundo» (Mediano) → Generar. Pasa por las fases `pintar` y `motor` (`10-espera-*`; «sin noticias del motor desde hace 70 s (piensa)»), y a los **120 s** arranca en `?mundo=gen-20261022-589627` («El sello del viejo amo», 3 lugares conectados entre sí). Recargar repite el día 1 con 28 000 de oro. Cancelar a los 20 s da «cancelado desde el menú», y el grupo del `claude -p` (pgid 434210) queda vacío a los 3 s. «Jugar el procedimental» lleva a `?seed=95477&faccion=orkos&heroe=orko`. Con `HEROES_MOTOR=false`: `fallido`, «el motor salió con código 1» y «historia.json: no está…». Un segundo POST da «ya se está generando…». Con un motor falso que escribe una historia rota: «el motor acabó, pero su historia no vale» y sus 3 problemas (`81`). URLs: `?mundo=prueba&seed=1`, `&faccion=elfos` y `&heroe=duelista` se rechazan diciéndolo; también `mundo` repetido, `Mal.Id`, `..%2F..%2Fdata` y `no-existe` (`23`–`30`). `?mundo=` vacío abre el menú. `ejemplo` está commiteado. |
| 4 | El lugar es un objeto del mapa; se entra al acabar la marcha; escena lateral: andar, hablar en árbol con opciones apagadas y su motivo, encontrar algo, la batalla de siempre | ✅ con reservas | En el mundo generado: un clic en el rombo lleva al osario, y al acabar la marcha se abre su escena (`43`). Clic en el suelo → `data-lugar=andando` (`44`). Huesos: «Ven conmigo, Huesos» sale apagada con «no cabe: tu ejército ya lleva 6 de 6 individuos», y pulsarla no hace nada (`45`). La cripta da +200 (28 000 → 28 200), y al volver la opción sale apagada con «“El osario del viejo amo” está abierto, no sellado» (`49`). En la ermita: «¿Arder? Probemos (pelea)» → batalla de siempre (`59`) → «Resolver sola» → se vuelve a la escena, «Ahora está vacía», Anselmo ya no está y el oro sube +300 (`60`). Ofrendas: +150, y al volver «ya te llevaste las ofrendas» (`61`). En `prueba`: la lanza va a la mochila («MOCHILA · 1 · Lanza de jinete») y Corvo se une con la carta. Reservas: H3, H4, H6 y H8. |
| 5 | Vocabulario cerrado; cada efecto, una acción del núcleo con su blocker; lo que cambia la partida va a la crónica y lo narrado no | ✅ con reserva | La crónica del mundo generado dice: «“El osario del viejo amo” queda abierto en (6, 5)», «+200 de oro en (6, 5)», «Batalla ganada contra los de un lugar en (19, 14)…», «“La ermita del Cierzo” queda vacía», «+300…» y «+150…». En `prueba`: «Botín de un lugar…: Lanza de jinete» y «Se te unen 1 × Alabardero». El diálogo no va a la crónica. Las acciones ilegales mandadas al núcleo (script propio): la segunda vez la lanza da «ya te llevaste la lanza». También se rechazan un nodo que no existe, la opción 9, un nodo inalcanzable por su `si` («a esa parte de la conversación con Corvo no se llega ahora…»), otro lugar, el turno ajeno, la batalla pendiente, pagar sin oro («no alcanza el oro: cuesta 300 oro y tienes 10») y la partida terminada. **Reserva**: la validación deja pasar un premio que se cobra sin fin (H1). |
| 6 | La IA visita lugares con una regla simple; sin mundo, el banco no cambia | ✅ con reserva | `pnpm banco`: sha `b9dbd8a1…`, «ancla: igual», 0/20 sin terminar. `lugares-ia.ts`: en `ejemplo` el j0 hace 5 hechos de lugar (batalla, estado, oro, botín). En `prueba` (día 2), en `gen-20261022-219764` (día 3) y en el mío (día 4): 0. La regla existe, pero las partidas IA contra IA acaban antes de pasar por los lugares, y el j1 no ha visitado ninguno en los 4 mundos (H9). |
| 7 | El agente no entra (F4), y se declara; sin arte nuevo | ✅ | `CLAUDE.md` (reglas y «El agente»): «El agente no entra (F4): los ve en su mapa…». `pnpm qa` sale 0: «terminado por fin de partida: 1 mapa diseñado, 4 turnos de mapa, 15 decisiones de batalla…». Fuera, un rombo; dentro, la plaza de una base. Con todas las imágenes bloqueadas (404), el lugar sigue jugándose, con óvalos con su inicial, el mojón y el suelo plano (`85`–`87`). |
| 8 | Sin tests de jugabilidad; lo visual, con capturas | ✅ | Solo hay tests de maquinaria (`test/mundo.test.ts`) y capturas. |
| P-c | Cada premio se cobra una vez | ❌ NO cumple | H1: un mundo que **valida** se ordeña con dos opciones de estado. |
| P-d | Tras la batalla se vuelve a la escena del lugar, en su estado nuevo | ✅ | Ermita (`60`). La rendición devuelve al héroe a su base y deja la partida en el mapa (`83`), que es lo esperado. |
| — | `vite build` sin mundos ni `__mundos` | ✅ | `vite build --outDir <scratch>`: «✓ built». No hay `dist/mundos`, y `__mundos` / `motor-de-mundos` no aparecen en `dist`. |

## Hallazgos

### Importantes

**H1 · La validación deja pasar un premio que se cobra sin fin.** Esto rompe P-c («cada premio se
cobra una vez»). `noSeApaga` (`core/mundo/validar.ts`) solo mira si la opción se apaga **a sí
misma**. No mira si otra opción sin premio la vuelve a encender cambiando el estado otra vez.
Reproducción: en `prueba`, el pozo con dos opciones y nada más:
`{texto:"Rebuscar", si:[{estado:"quieto"}], hace:[{oro:100},{estado:"despierto"}]}` y
`{texto:"Esperar", si:[{estado:"despierto"}], hace:[{estado:"quieto"}]}`. `pnpm mundo validar` dice
«vale». En el núcleo, 5 vueltas dan +500. En el navegador, 4 vueltas dan 28 000 → 28 400 (`90`). Lo
puede escribir el motor sin querer (un estado «que se repone»). Quien juega espera que el premio sea
uno.

**H2 · Una historia válida puede enseñar una opción encendida que el núcleo rechaza siempre.** El
premio queda perdido. La regla estática del simplify («a un nodo con “hace” se llega navegando») se
comprueba sin condiciones. Pero `nodosAlcanzables` sí las mira, y no cuenta las aristas con «hace».
Reproducción (`gen-qa-vista`, ya borrado):
- el inicio lleva `A: si no marca X, hace marca X, ir fondo` y `B: si no marca X, ir fondo`;
- en `fondo` está `Subir el cubo: si no marca Y, hace oro 50, marca Y`.

Valida. Al elegir A se llega a `fondo` con «Subir el cubo» encendida. Al pulsarla, la barra dice «no
se puede elegir eso: a esa parte de la conversación con El pozo no se llega ahora…», el botón sigue
encendido y el premio no se cobra nunca (`89`). La pantalla (`opcionesDe`) no mira el alcance; el
núcleo, sí. Quien juega ve un botón que no hace nada.

**H3 · Escape no cierra la conversación del lugar.** Al abrirse, el `<dialog>` se queda con el foco
(«¿Qué guardas aquí?», «Abrir la cripta»). El `keydown` de `main.ts` ignora todo lo que viene de
dentro de un `dialog`, así que Escape no hace nada, ni la primera vez ni la segunda. La barra dice
«“Volver al mapa” (o Escape) sale», e `implementacion.md` da por verificado que «Escape cierra la
conversación sin salir». Reproducción: `?mundo=prueba` → entrar en el puente → «Hablar» con Corvo →
Escape: el diálogo sigue abierto (`50`). Sin conversación, con el foco fuera, Escape sí saca al mapa.

### Menores

- **H4 · El rombo del mapa tapa al héroe que está en el lugar**: solo se ve su chapa «M» (`51`, `63`).
  La inicial del rombo es la del artículo («E» de «El osario» y de «El campamento», «L» de «La
  ermita»), así que no distingue unos lugares de otros. Lo mismo pasa en el mojón de una cosa («L» de
  «La garita», `86`).
- **H5 · Un JSON mal escrito no dice en qué fichero está**. La página dice «Expected ',' or '}' …
  (line 3 column 3)» y nada más (`20`). La CLI sí lo dice: «historia.json: no es JSON: …».
- **H6 · Andar a un punto tarda ~6 s**: medido de la garita (x 0,25) a Corvo (0,65), en los dos
  sentidos. Cada «Hablar» o «Mirar» del panel hace esperar ese rato. Con tres puntos, hay más espera
  que lectura. Al hablar, el héroe se queda encima de la figura con que habla (`45`, `58`).
- **H7 · Un pedido que no sirve gasta motor.** `POST /__mundos` con un héroe de otra facción
  (`{"faccion":"imperio","heroe":"orko"}`) se acepta y lanza `claude -p`. Lo cancelé. `pnpm mundo
  nuevo --faccion=imperio --heroe=orko` también se acepta. El problema solo sale al validar al final,
  y el motor no puede arreglar `mundo.json` (no tiene permiso), así que gastaría ~100 s de suscripción
  para acabar en fallo. El menú no lo manda; solo pasa por la API o la CLI.
- **H8 · Cosas de la crónica.** «Batalla ganada contra los de un lugar en (19, 14)» no nombra el
  encuentro ni el lugar. «+200 de oro en (6, 5)» dice la casilla y no el sitio. «…acaba la marcha en
  **él** para entrar», aunque el lugar sea «la capilla».
- **H9 · La IA rival casi no visita lugares.** En 4 mundos, IA contra IA, solo el j0 de `ejemplo` lo
  hace. Las partidas acaban el día 2-4. No es una medida de equilibrio (no se pide): es que, en la
  práctica, el rival no usa lo que la persona tiene.
- **H10 · La tropa de premio sale apagada al empezar.** El héroe sale con 6 de 6 individuos, así que
  todo premio de `tropa` está apagado hasta que haya bajas o se licencie a alguien. En el mundo
  generado son las dos tropas de premio («Ven conmigo, Huesos» y «Pagar por tu hacha»). El motivo lo
  explica, pero el motor no sabe que el héroe empieza lleno.
- **H11 · Detalles del menú y la espera.** «El mundo» no lleva el marco de las otras pantallas del
  menú, y «Rivales» parece una casilla que se puede escribir (`04`). Las líneas de progreso enseñan
  órdenes `Bash` con rutas absolutas que el motor intentó y se le denegaron. Un mundo cancelado o
  fallido deja su carpeta `gen-*` en disco, sin historia.
- **H12 · `lugarBlocker` admite el borde del mapa.** El motor recibe (0, 0) y (1, 1) como casillas de
  muestra, y un lugar en (0, 0) valida.
- **H13 · Una frase que confunde.** Si el jugador 0 manda `elegir_en_lugar` con el héroe del rival, la
  respuesta es «todavía no es tu turno: ahora juega el jugador 0» (solo por la API o un test).

## Workarounds usados

- **Los mundos rotos y el de H1 y H2 los hice a mano** (`gen-qa-*`, ya borrados). Es la forma de
  probar la validación. H1 y H2 son mundos que **validan**, así que el motor podría escribirlos.
- **El motor falso** (`HEROES_MOTOR=<script>`, en el 3374) se hizo para ver el «no vale» sin gastar.
  El camino es el mismo que el de verdad.
- **«Ver mapa entero» y el zoom** se usaron para encontrar los rombos. Es un botón del juego, no un
  truco.
- **Pulsar la opción apagada por JS** (`.click()` del DOM), porque Playwright no pulsa lo que tiene
  `aria-disabled`. Comprobé que no hace nada.
- **La batalla la acabé con «Resolver sola»**. No jugué ninguna a mano.

## No probado

- `pnpm verify`, `verify:lento` y `capturas`: no se repiten, porque no cambió nada desde el verde del
  ingeniero sobre `6538e43b`.
- Perder una batalla de un lugar en el navegador con `alPerder` visible: lo cubre
  `test/mundo.test.ts`. Solo probé rendirse (`83`).
- Que una marcha que solo **pasa** por un lugar no entre: no encontré una ruta que lo cruzara sin
  acabar en él.
- La espera de 15 min de un motor que se cuelga.
- El espectador con un mundo: el servidor no juega mundos.

## Veredicto

**Apto con reservas.** El flujo entero funciona de punta a punta con el motor real: generar, esperar,
jugar, hablar, ver opciones apagadas con su motivo, encontrar, pelear, volver a la escena, que se vea
en la crónica y repetir con `?mundo=`. El banco no cambia y no hay errores en consola. Antes de dar la
F1a por cerrada hay que arreglar tres cosas. H1 rompe P-c («cada premio se cobra una vez»), que el
usuario pidió que la validación garantizara. H2 deja botones encendidos que nunca funcionan. H3 es un
Escape anunciado que no responde. Las tres son de arreglo acotado (la validación y el teclado).

---

# Vuelta 2 (22-10-2026)

Sobre `9e368d15` (commits `5706fe30..9e368d15`), sin cambios en el código. Navegador: Playwright sin
pantalla contra un `vite` propio en el **3463** con `HEROES_MOTOR` apuntando a un motor falso
configurable (escribe `stream-json`, lee la lectura por ruta absoluta, intenta un `ls` que se le
deniega, valida dos veces y sale; con modos «falla», «falla-lenta», «rota» y «rota-lenta»). Lo arranqué
con `set -m`, lo maté por su grupo (pgid = pid 501874, cwd el worktree) y el 3463 quedó libre. El 3217
del usuario no lo toqué. No lancé ninguna generación con `claude -p`. Los mundos de prueba que creé
(`gen-qa2-*`, gitignorados) están borrados; en `assets/mundos/` quedan los cuatro de antes. Capturas en
`capturas/qa2/`.

## Comprobaciones fijas

| Orden | Resultado |
|---|---|
| `pnpm verify:lento` (no se había corrido) | **salida 0**: «Test Files 160 passed (160) · Tests 5612 passed (5612)», 268,7 s, con la máquina cargada (carga 4-6). Incluye `rectitud.test.ts` en 1-3000 (75 s) y los tests nuevos de `mundo.test.ts` y `motor-de-mundos.test.ts`. |
| `pnpm banco` | `sha256 b9dbd8a1…fe032`, «ancla: igual», 0/20 sin terminar, 4 / 7 / 7. |
| `pnpm qa` | salida 0, «1 mapa diseñado, 4 turnos de mapa, 15 decisiones de batalla y 1 ascenso». |
| `pnpm mundo validar` de `prueba`, `ejemplo`, `gen-20261022-219764`, `gen-20261022-589627` | los cuatro «vale» (Q11 no movió ningún lugar). |
| `verify`, `capturas` | no repetidos: verdes del ingeniero sobre este mismo commit. |

## Criterios afectados

| # | Criterio | | Evidencia |
|---|---|---|---|
| Q1 / P-c | Cada premio se cobra una vez, por regla del núcleo | ✅ | Navegador, `gen-qa2-peaje` (= `prueba` + Rebuscar/Esperar en el pozo): Rebuscar 28 000 → 28 100; Esperar; Rebuscar sale apagada con «ya te llevaste 100 oro de aquí»; pulsarla por JS no cambia el oro (`q-03`). Núcleo (script propio): un encuentro abierto desde dos puntos, ganado por uno, da «ya venciste a «Los ahogados del pozo»» por el otro; perder y volver a pelear (sin premio en la opción) se puede, y al ganar entra en `vencidos`. Por otros caminos, ver M1 y M2. |
| Q2.1 | Ninguna opción encendida que el núcleo rechace | ✅ | `opcionesDe` lee `motivoAlElegir`, el mismo de la acción (diff de `reglas.ts`). En el navegador, todas las opciones apagadas que vi llevan el motivo del núcleo, y ninguna encendida falló. |
| Q2.2 | Lo que hay tras una opción con efectos e «ir» se puede elegir | ⚠️ con hallazgo | Funciona mientras la conversación sigue abierta (`q-01`: tras pagar, «Abrir el arcón» encendida). Pero al quitar la regla estática de la validación caben dos historias válidas donde el premio pagado se pierde: **H14**. |
| Q3 | Escape cierra la conversación y otro Escape sale | ✅ | `prueba`, en el puente, conversación con la garita: con el foco en la primera opción (A), en una opción apagada (B), en el botón del panel de Corvo (C) y en el lienzo (D), un Escape cierra la conversación y se sigue en el lugar (`escena: lugar`). Escape sin conversación, también andando, sale al mapa. En la base, la conversación con un vecino: el primer Escape la cierra y sigue en `town`; el segundo sale al mapa (`b-01`). Sin errores en consola. |
| Q4 | El héroe se ve en el lugar; inicial significativa | ✅ | Con el héroe en el puente, se pinta delante y el rombo asoma detrás (`p-23`, `p-23-zoom`). Rombo «P» de «El puente…»; mojón «C» de «La cripta sellada» (`g-02`). |
| Q5 | Un JSON mal escrito dice qué fichero | ✅ | `?mundo=gen-qa2-rota` (historia rota, la dejó el motor falso): «La página no arranca … el mundo "gen-qa2-rota" no se puede cargar: historia.json: no es JSON: …» (`r-01`). |
| Q6 | A buen paso y al lado de la figura | ✅ | Entrada → Corvo 4,9 s; Corvo ↔ garita 3,2 s en los dos sentidos (el que medía 6 s); entrada → Tobías 2,3 s; entrada → cripta 4,9 s. El héroe queda a la izquierda de Corvo, mirándole, sin taparle (`p-20`), y junto al mojón de la cripta (`g-02`). |
| Q7 | El pedido se juzga antes del motor | ✅ | `POST /__mundos`: héroe de otra facción, facción inexistente (`caballeros`, `" imperio"`, `IMPERIO`), tamaño 6 o `"5"`, `heroe` 3 o `""`, `semilla` `"7"`, cuerpo de 20 kB, `[]`, `null`, `{}` y texto que no es JSON: todos 400 con su frase, sin crear carpeta. `pnpm mundo nuevo … --heroe=orko` y `--faccion=caballeros`: salida 1 sin crear nada. Rutas: id `../../data` → 400; método ajeno → 405; progreso de nadie → 404. Menores en M5. |
| Q8 | La crónica nombra el lugar | ✅ | «+150 de oro en «El pozo de Valdesombra»», «Batalla ganada contra «Los ahogados del pozo» en «El pozo de Valdesombra», en 3 rondas…», «Botín de «El pozo de Valdesombra»: Gambesón», «Se te unen 1 × Alabardero en «El puente del viejo Corvo»», «+200 de oro en «El osario del viejo amo»». Barra del mapa: «…: acaba la marcha allí para entrar». |
| Q9 | El motor sabe cuánta tropa cabe | ✅ | `lecturaParaElMotor`: `prueba` 5/6 y 17/20, «le caben 1 más…»; `ejemplo` 4/6; `gen-…219764` 4/6; `gen-…589627` «sale lleno (6 de 6…)». |
| Q10 | Menú y generación limpios | ✅ con reserva | «El mundo» con su marco y «Rivales de la IA 1» fijo con su nota (`m-01`). Progreso en la página (`m-02`): fases, «lee el mapa por regiones», «valida la historia», «la historia aún no vale (2)», «1 validación», el último problema; ni el `ls` denegado ni rutas del repo. Limpieza: falla sin historia → carpeta y lectura borradas; cancelar con el motor en marcha → motor muerto en 3 s y carpeta borrada; cancelar al pintar → se borra al acabar de pintar; un id que ya existe (`prueba`, `ejemplo`, uno fallido con historia) → «ya hay un mundo…» y **no se borra nada**; historia rota → se queda (como dice el diseño). Reservas en M4, M6 y M7. |
| Q11 | Ningún lugar en el borde | ✅ | Las casillas de muestra de la lectura de los cuatro mundos: 0 en el borde. Test de colocación en verde (`verify:lento`). |
| Q12 | «ese héroe no es tuyo» | ✅ | Test «con el héroe del rival…» en verde en `verify:lento`; no lo repetí a mano. |
| — | `?mundo=prueba`, `ejemplo` y `gen-20261022-589627` se juegan | ✅ | Los tres: base → mapa → marcha al lugar → escena → hablar → elegir → Escape ×2 → mapa, con la crónica al día y **0 errores** en consola. |

## Desviaciones, juzgadas contra la petición

- **El encuentro se cobra al ganarlo, no al elegirlo.** Tiene sentido con «cada premio se cobra una
  vez»: el premio de una batalla es lo de `alGanar`, y perderla no da nada, así que dejar repetirla no
  regala nada (lo comprobé: perder y volver a bajar al pozo vale; tras ganar, «ya venciste»). La
  excepción es M1.
- **La regla estática «se llega navegando» sale de la validación en favor del nodo recordado.**
  Cierra H2 en la conversación abierta, pero deja pasar historias que la regla vieja rechazaba y en las
  que el premio se pierde (H14). La sustitución no cubre todo lo que cubría la regla.

## Hallazgos de la vuelta 2

### Importante

**H14 · Un premio tras un pago con «ir» se pierde, y la validación ya no lo impide.** Al retirar la
regla estática, valen dos formas que antes se rechazaban («tiene opciones que hacen algo y solo se
llega a él tras otra que también hace algo»):

1. **Se cierra la conversación y no se vuelve.** `gen-qa2-peaje`: en Corvo, «Pagar el peaje (300)»
   con `ir: tesoro`, y en `tesoro` «Abrir el arcón» (+500). Valida. En el navegador: pagar
   (28 000 → 27 700) lleva al arcón (`q-01`). Escape (lo que anuncia la barra). Hablar otra vez con
   Corvo: empieza en el inicio, «Pagar el peaje» apagada con «ya pagaste el peaje», y ninguna rama
   lleva al arcón (`q-02`). El núcleo sí lo admite (`nodosAlcanzables` = `a, tesoro`). Quien juega ha
   pagado 300 y no puede recoger lo pagado. Es justo el patrón que la skill pone de ejemplo («pagar el
   peaje con "ir": "dentro"»); que haya un camino de vuelta se le pide al motor en prosa, pero nada lo
   comprueba. Y con Q3, cerrar la conversación es ahora un Escape.
2. **El pago apaga su propio punto.** El mismo cambio sobre `prueba` tal cual (Corvo con
   `si: estado guardado` y el pago que lo pasa a `pagado`): valida, cobra 300 y en `tesoro` sale
   «Abrir el arcón» apagada con «“El puente del viejo Corvo” está con el peaje pagado, no guardado».
   La pantalla y el núcleo están de acuerdo, pero el premio no se cobra nunca.

Reproducción del caso 1 desde el arranque: crear un mundo con esa historia y abrir `?mundo=<id>` →
«Volver al mapa» → pulsar el rombo «P» → «Hablar» con Corvo → «Pagar el peaje» → Escape → «Hablar»
con Corvo. Quien juega espera poder volver por lo que ha pagado. Los cuatro mundos de disco no
caen aquí, porque se validaron con la regla vieja; caerán los que escriba el motor desde ahora.

### Menores

- **M1 · Una batalla en la misma opción que un premio no se repite tras perderla.** Con
  `hace: [{oro: 100}, {batalla: "ahogados"}]` (valida): se cobran los 100 al elegir, se pierde, y al
  volver la opción sale apagada con «ya te llevaste 100 oro de aquí». El encuentro y su `alGanar` ya no
  se alcanzan. Es lo contrario de lo que busca la desviación («perder y volver a intentarlo»).
- **M2 · El mundo es de los dos, pero las frases hablan de «tú».** Si el rival cobra o vence primero,
  el jugador 0 lee «ya te llevaste 100 oro de aquí» o «ya venciste a «Los ahogados del pozo»» (script
  propio, `s.current = 1`). Y el nodo recordado también se comparte: si el rival paga el peaje con
  «ir», el jugador 0 puede abrir el arcón sin pagar por la acción del núcleo (+500 en el script). En
  pantalla no se ve, porque la pantalla empieza en el inicio; lo usaría la IA si fuera al revés.
  Con H9 (la IA casi no visita lugares) hoy es raro.
- **M3 · Un interruptor sin premio atrapa a la IA.** Dos opciones sin premio que se encienden la una
  a la otra (Bajar ↔ Subir una palanca, valida): `jugadaEnElLugar` las alterna hasta el tope
  (`MAX_JUGADAS_EN_UN_LUGAR`, 8 por visita; 20 seguidas en mi bucle), y `hariaAlgoEn` sigue en `true`,
  así que el lugar le sigue valiendo 8 000 cada día. El comentario de `ai/lugares.ts` («así que jugar en
  bucle acaba») ya no es cierto: `cobradas` solo cubre lo que da premio. Ya pasaba antes; va con H9 (F3).
- **M4 · Rutas de fuera del repo en el progreso.** `sinRutas` quita solo la raíz del repo: el texto
  del motor «… y miro /home/al/.claude/skills.» sale tal cual en la página (`m-02`).
- **M5 · Bordes del `POST /__mundos`.** Un `id` que ya existe se acepta con 200 y falla después («ya
  hay un mundo…»), sin gastar motor y sin borrar nada. Las claves que no existen (`"rivales": 2`) se
  ignoran sin decirlo. Un cuerpo que no es JSON dice «lo que ha llegado **para guardar** no es JSON» (la
  frase de la arena). La CLI admite `--regiones=6` (el generador va de 3 a 10) y el menú, solo 4/5/7.
- **M6 · Cancelar mientras se pinta el mapa no para el pintor.** La fase pasa a `fallido` al momento,
  pero el PNG se sigue pintando, y entretanto se puede lanzar otra generación (dos pintores a la vez:
  `gen-qa2-pinta` acabó de pintar y se borró con `gen-qa2-otra` ya en el motor).
- **M7 · Cancelar con una historia ya escrita la deja en disco.** Es lo que dice el diseño («si dejó
  una historia que no vale, se queda»), pero quien pulsa «Cancelar» dice que no quiere ese mundo.
- **M8 · La barra se queda en blanco** al salir del lugar al mapa (`salirDelLugar` pone `''`) y tras
  elegir una opción. Antes de entrar decía «Haz clic en el mapa…».
- Nota, no hallazgo: en `prueba` los dos lugares llevan «P» («El puente…», «El pozo…»). Una sola
  inicial no siempre distingue.

## Workarounds de esta vuelta

- **Los mundos `gen-qa2-*` los hice a mano** (y el motor falso escribió `gen-qa2-rota`) para H14, M1,
  Q1 en pantalla y Q5. H14 y M1 son historias que **validan**: el motor puede escribirlas. Borrados.
- **El motor falso** (`HEROES_MOTOR`) sigue el mismo camino que el real desde `spawn`. Lo que dice un
  motor real de verdad no lo vi en esta vuelta.
- **Pulsar la opción apagada por JS**, porque Playwright no pulsa lo que lleva `aria-disabled`. No hace
  nada.
- **El rival en el núcleo** (M2, M3) lo moví con `state.current = 1` en un script: es la acción del
  núcleo, no la pantalla.
- **«Resolver sola»** para la batalla del pozo.

## No probado

- Una generación real con `claude -p` (no se pide en esta vuelta; se probó una en la vuelta 1). Qué
  dice `queHace` con un `stream-json` real nuevo.
- Perder una batalla de un lugar **en el navegador**: lo hice en el núcleo (script), no en pantalla.
- El tope de 15 min del motor.

## Veredicto de la vuelta 2

**Apto con reservas.** H1, H2 y H3 están cerrados: cada premio se cobra una vez por regla del
núcleo, la pantalla no enseña encendido lo que el núcleo rechaza, y Escape cierra la conversación y
luego sale, con el foco donde sea. Q4-Q12 cumplen. `verify:lento` 5612/5612, banco con el mismo sha,
`qa` en verde y 0 errores en consola en los tres mundos. La reserva es **H14**: al retirar la regla
estática, la validación deja pasar historias en las que un premio tras un pago se pierde (por cerrar la
conversación o porque el pago apaga su punto). No afecta a ningún mundo de disco, pero sí a los que
escriba el motor a partir de ahora, y es el patrón que la skill pone de ejemplo. Conviene cerrarlo
antes de generar más mundos. Lo demás es menor.
