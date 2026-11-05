# QA: infiltrados, fase A (cruzar barreras)

05-11-2026. Worktree `claude/vigilant-wozniak-17edfb` sobre `9cc86827`, sin commitear (diff con
«Tras /simplify» aplicado). He validado contra `requisitos.md`: la petición literal, I1–I11 y los
criterios 1–10 de la fase A. La fase B no se juzga.

## Comprobaciones corridas (una vez, sobre el diff actual)

| Comprobación | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck` | toca core, cliente y contrato | sin errores |
| `pnpm lint` | lo mismo | «Checked 523 files», 10 infos (las de `tools/taller/unidades.ts` de antes) |
| `vitest` en 12 ficheros: `infiltracion`, `frontera`, `agent-contract`, `figuras`, `invariantes`, `game`, `paneles`, `asaltantes`, `marcha`, `ayuntamiento`, `ascenso`, `heroe-de-salida` | la regla nueva, el Dijkstra y sus goldens, el contrato, la subida de la figura, los guardias, `moveHero`/`porQueNoLlega`, la fila nueva del panel, emboscada y marcha, la ficha del candidato, el recién hecho (H1) | 12/12 ficheros, 398/398 tests |
| `test/session.test.ts`, en el worktree y en una copia limpia de `HEAD` (`git archive`, borrada al acabar) | el ingeniero dijo que su rojo ya estaba antes | el mismo rojo en los dos: «cuando golpean a la persona, elige su respuesta sin ver el golpe; esa no se cancela», 1 de 40. **Ya estaba antes: no es de esta tarea** |
| `pnpm banco` | el criterio 10 | `sha256 883fe9be85bcf887a534efe540b69f346bf93e7bb2d7ef672800deb3e19d4858`, «ancla: igual», 0/20 sin terminar |
| `npx tsx tools/qa/barrido-semillas.ts` | criterio 9 | «sin terminar: 0/4 → []» |
| `pnpm qa` | toca el contrato | exit 0, «terminado por fin de partida: 1 mapa diseñado, 4 turnos de mapa, 40 decisiones de batalla y 1 ascenso de tropa a héroe» |
| Navegador, Playwright sin pantalla, mi propio vite en un puerto que dio el sistema (44675) y en su grupo | criterios 3–5 desde quien juega | ver abajo. Consola sin errores ni avisos. Al acabar, puerto 44675 libre (`ss`) |
| Sondas de núcleo de un solo uso, en `.cache/` y borradas | pasada adversarial | ver abajo |

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Rasgo en `traits`, tipos en un `data/` a mano y validado, uno por facción, ningún tipo por defecto | ✅ | `infiltrarse` en penitente, espectro, rodelero, explorador, asesino, goblin lancero y goblin arquero, todos con `edificio` (los de I10). `data/infiltradores.json` lleva inquisidor, vampiro, capitán mercenario, mago y goblin. `validarInfiltradores` rechaza el tipo por defecto (test). Banco igual |
| 2 | El grupo se infiltra con una sola función y su `*Blocker`; sin tropa, el tipo; el personaje no, y sin lanzar | ✅ | En la página, con la tropa de salida: fila «Infiltración no ⓘ», nota «no se infiltra: no lo llevan Orko con hacha y escudo ni Orko con dos armas». Licenciados los orkos: «cruza barreras, un día por casilla». En el núcleo, un rival no muerto: «no lo llevan su tipo (Nigromante), Esqueleto guerrero ni Esqueleto arquero». El personaje lo cubre `infiltracion.test.ts` |
| 3 | Pisa las cinco barreras a un día entero por casilla; con el día empezado espera en el borde; la muralla del recinto no se abre | ✅ | s8, día 1: pulso (7,5) y el goblin anda a (5,6) y se para allí con 1436 puntos. Pulso (6,5): rechazo (ver 4). Día 2: entra en (6,5) con 0. Día 3: entra en (7,5) con 0. Día 4, desde (7,5): pulsar (7,6) da «(7,6) es la muralla de Valdeluz: a una ciudad se entra por sus puertas —la del sureste y la del noroeste—, y el resto de su recinto no se pisa.» Probado en navegador: montaña, y bosque en las capturas del ingeniero. Agua, acantilado y muro solo por tests |
| 4 | La ruta y la marcha lo cuentan: dos colores, `pasosDeHoy`, `march_cut` del agente | ✅ | Al pasar el puntero por (7,5), la barra dice «Ruta: hoy llegas a 2 de 4 pasos: dorado hoy, gris otro día.» y la ruta sale dorada hasta (5,6) y gris por la montaña (`capturas/qa/04-ruta-dos-colores.png`, `04b`). El día 2 dice «hoy llegas a 1 de 2 pasos». Rechazo con el día empezado: «No quedan puntos de movimiento para dar ni un paso: el primero, a (6,5), cuesta 1616, el día entero de marcha, y te quedan 1436.» (`05-rechazo-dia-empezado.png`). Pulsarlo dos veces da la misma frase y nada cambia. Nota del agente a un `move_hero` por la barrera: «move_hero hero-0 → (7,5): se quedó en (5,6) y le faltan 2 pasos» |
| 5 | Parar dentro: se ve y se pulsa | ⚠️ cumple, con una reserva visual (H1) | Día 2 en (6,5) y día 3 en (7,5): la figura se pinta y se lee (`06-dentro-dia2.png`, `07-dentro-dia3.png`, ampliadas en `zoom-*`). Al pulsar su casilla: «Grommash Dientenegro ya está en esa casilla: pulsa otra para moverlo.» La reserva: junto a un recinto se pinta encima de las torres de la muralla (H1) |
| 6 | Lo de alrededor: niebla, asaltantes, otro héroe, territorio y renta; intocable (I8) | ✅ | Un rival no muerto que no se infiltra, en el borde (5,6), contra el goblin parado en (6,5): `caminoHasta` da `null` y `move_hero` lanza «no hay camino hasta (6,5) sin cruzar una barrera: solo la cruza un grupo que se infiltra, y no se infiltra: …». Con tipo y tropa que se infiltran: camino `[(6,5) por 1616]`, `battle_started@6,5`, la resuelve la IA, `hero_defeated@6,5` y `hero_returned@7,7`; el atacante se queda en su casilla y ningún héroe acaba sobre la muralla. Asaltantes, renta y niebla: los fija `infiltracion.test.ts` (en verde) y el código de `emboscador` lo confirma (región −1, `null`) |
| 7 | Agente: `creature_stats` dice el rasgo, el héroe dice si se infiltra, prosa, el mismo `move_hero` | ✅ | `serializeAdventureTurn` del goblin solo: `infiltrates: true` y sin `infiltrationBlocker`; con tropa que no lo lleva, la clave con el motivo (test). Prosa INFILTRACIÓN en `RESPONSE_FORMAT` y en la del mapa. El `move_hero` pasa por el mismo `moveHero` (`director.ts:467`). `pnpm qa` en 0, aunque no ejercita la infiltración: su agente juega tipos por defecto |
| 8 | Espectador | ⚠️ no probado en vivo | No viaja nada nuevo (`marchaDelDia` no sale del núcleo) y el espectador pinta el héroe con la misma `pisada` (`render/mapa.ts:592`, que importa `espectador/main.ts`). No monté una partida en que el agente se infiltre |
| 9 | La IA no se rompe | ✅ | Barrido 0/4. Sonda: 40 partidas IA contra IA, s1-40, el jugador 0 con su tipo infiltrador y tres unidades con el rasgo, 120 días de tope: 0 lanzan, 0 sin terminar, 0 héroes en la muralla, 0 que no se infiltran parados en una barrera. La IA no pisó ninguna barrera: no aprovecha la regla, como dice el plan (backlog). Importa porque, si el agente no responde, su turno lo juega la IA, también con un héroe infiltrador nacido de la tropa |
| 10 | `pnpm banco` igual, `pnpm qa` 0 | ✅ | Arriba |

## Hallazgos

Ninguno bloqueante. Ninguno importante.

**H1, menor (visual). Parado en una barrera pegada al recinto de una ciudad, el héroe parece
estar encima de la muralla.**
Cómo reproducirlo: `?seed=8&faccion=orkos&heroe=goblin`. En la base, licencia los cinco orkos con
«−1» y cierra la base. Pulsa (7,5) y el goblin anda hasta (5,6). «Fin de turno». Vuelve a pulsar
(7,5): entra en (6,5). «Fin de turno» otra vez y pulsa (7,5): entra en (7,5).
Lo que se ve: (6,5) y (7,5) son montaña, al norte del recinto de Valdeluz, y en pantalla caen debajo
de las torres del noroeste y del norte. Para que no lo tapen, `delanteEnUnaBarrera` sube la figura
por delante de toda pieza que la cubra en su casilla, también las del recinto. Por eso sale
**encima** de las torres, con su aro sobre los tejados de dentro (`zoom-06-dentro-dia2.png`,
`zoom-07-dentro-dia3.png`). La inicial «G» flota sobre la montaña, más arriba. Se ve y se pulsa, así
que el criterio 5 se cumple. Pero quien juega lee que el goblin está en el adarve o dentro de la
ciudad, no en la montaña. Esperaba verlo en la ladera, entre la montaña y la muralla. En las
barreras sin recinto al lado (el bosque de las capturas del ingeniero) se lee bien.

**H2, menor (UX). La marcha que se para en el borde de una barrera no dice por qué.**
Cómo reproducirlo: lo mismo que H1 hasta el primer clic en (7,5).
Lo que pasa: el goblin se para en (5,6) con 1436 de 1616 puntos y la barra se queda vacía. Antes
de pulsar, la vista previa solo decía «hoy llegas a 2 de 4 pasos: dorado hoy, gris otro día», sin
nombrar la barrera ni que cuesta el día entero. El motivo solo aparece si se pulsa la montaña a
mano: «No quedan puntos de movimiento para dar ni un paso: … cuesta 1616, el día entero de marcha,
y te quedan 1436». Esa frase empieza diciendo «no quedan puntos» y termina diciendo que quedan 1436,
y se lee contradictoria. Lo de dejar vacía la barra tras una marcha cortada ya era así antes. Lo
nuevo es pararse con casi todo el movimiento sin entender por qué. Esperaba que la ruta o la barra
dijeran algo como «la montaña cuesta el día entero: entrarás mañana».

**H3, menor (UX, ya conocido: riesgo aceptado en I10).** Casi nunca se cruza una barrera sin
pedirlo. La busqué en s8, s4 y s1 en todo destino a 12 casillas o menos del goblin solo, y la ruta
del núcleo no cruzaba ninguna: el rodeo sale más barato que 1616 por casilla. Sí cruza a 38-40
pasos, en la región de la base rival. Para cruzar, quien juega tiene que pulsar las casillas de
barrera una a una. No es un fallo de la regla. Lo dejo escrito para cuando se juegue.

## Workarounds usados

- **Licenciar la tropa de salida** en vez de reclutar goblins en la morada, para tener un grupo que
  se infiltra con tres clics. Veredicto: no afecta a quien juega. Es un camino real de la página
  (el «−1» de la base) y la tropa de goblins la cubren los tests.
- **Un espejo** (`Session` con la misma semilla) para saber en qué píxel cae cada casilla. Los
  clics son reales y la página va por su cuenta. Veredicto: no toca la página.
- **Estado sintético en las sondas de núcleo**: el goblin puesto con `hero.at` en (6,5), el rival
  puesto en (5,6) con su tipo y su tropa cambiados, y la tropa de la sonda de la IA cambiada antes
  del día 1. Veredicto: sirve para probar la regla (I8, que la IA no se rompe) y no sustituye al
  flujo real, que va en el navegador.

## No probado

- **El espectador en vivo** (criterio 8): no monté una partida en que el agente se infiltre. Lo
  digo por el código: comparte `pisada` y no viaja nada nuevo.
- **Agua, acantilado y muro en el navegador**: los vi en tests y en el código. En pantalla vi solo
  la montaña, y el bosque en las capturas del ingeniero.
- **El agente real cruzando una barrera por MCP**: `pnpm qa` no lo hace. Probé el mismo
  `applyAdventureAction` y la nota de `paradaDeLaMarcha` directamente.
- **Pantalla de móvil** y la ficha de la morada y la arena con el rasgo nuevo (las cubren los tests
  de la morada y la arena que corrió el ingeniero).

## Veredicto

**Apto con reservas.** Los criterios 1–7, 9 y 10 se cumplen con evidencia. El 8 está sin probar en
vivo, pero no viaja nada nuevo. Las reservas son tres menores de lectura y experiencia (H1–H3),
ninguna de reglas. Banco con el mismo sha, `pnpm qa` en 0, barrido en 0. El rojo de
`session.test.ts` ya estaba en `HEAD` sin esta tarea.

## Vuelta 2

05-11-2026. Re-verifico solo H1 y H2 (`hallazgos-qa.md`), es decir los criterios 4 y 5 y lo que se ve,
con lo que hizo el ingeniero en «Vuelta de QA 1» (`implementacion.md`). Añado una pasada adversarial
nueva sobre esos cambios. El código sigue sin commitear. Ningún fichero de producción ni de test ha
cambiado desde el informe del ingeniero: sus mtimes son ≤ 16:27 y `implementacion.md` es de las 16:33.
Por eso cito sus verdes en lugar de repetirlos.

### Comprobaciones

| Comprobación | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck` | toca cliente y núcleo | sin errores |
| `pnpm lint` | lo mismo | «Checked 523 files… Found 10 infos», las de `tools/taller/unidades.ts` de siempre. Lo corrí con mis sondas ya fuera de `test/` y `tools/` |
| `figuras`, `infiltracion`, `game`, `ascenso`, `escenas`, `invariantes`, `inspeccion`, `session` | H1 y H2 | **citados** del ingeniero, sobre el mismo código. Los rojos de `escenas` (4) y `session` (1) ya estaban en `HEAD` (lo comprobé yo en la vuelta 1 para `session`) |
| `pnpm banco`, `barrido-semillas.ts`, `pnpm qa` | criterios 9 y 10 | **citados**: `883fe9be85bc…`, «ancla: igual»; barrido 0/4; `pnpm qa` exit 0. Nada ha cambiado desde entonces |
| Navegador: Playwright sin pantalla, mi propio vite con un puerto que dio el sistema y lanzado en su grupo (`arrancarVite`/`matarGrupo`) | criterios 4 y 5, con clics reales | ver abajo. Consola sin errores ni avisos. Al acabar, los puertos 36575, 36413, 37481 y 38255 quedaron libres (`ss`). Guion en `capturas/qa2/qa2-capturas.ts.txt` |
| Sonda de escena, de un solo uso: `capturas/qa2/qa2-sonda.test.ts.txt`, que corrió como `test/_qa2-sonda.test.ts` y ya está borrada | pasada adversarial de H1 | s1-40, 22 931 casillas de barrera donde puede pararse un infiltrado (`barreraEn` ≠ null). Mide sobre lo que se pinta: muestras de la caja de la figura bajo la silueta de cada pieza, con la clave real de `pisada` |

### H2 — cerrado ✅

Lo he visto en la página con `?seed=8&faccion=orkos&heroe=goblin`, licenciando a los orkos:

- Día 1, ratón en (7,5): «Ruta: hoy llegas a 2 de 4 pasos: dorado hoy, gris otro día; (6,5) es montaña
  y cuesta el día entero de marcha: se entra mañana.» Cabe entera en la barra a 1440 px
  (`capturas/qa2/a1-ruta-dia1.png`).
- Tras la marcha, ratón otra vez en (7,5): «Ruta: hoy no das ni un paso: (6,5) es montaña y cuesta el día
  entero de marcha: se entra mañana.»
- Clic en (6,5), dos veces seguidas: las dos dan la misma frase y no cambia nada. «Grommash Dientenegro
  hoy no da ni un paso: (6,5) es montaña y cuesta el día entero de marcha (1616), y le quedan 1436; se
  entra mañana.» Ya no hay contradicción (`a2-rechazo-dia1.png`).
- Adversarial. Día 2, ya dentro de (6,5) con 0 puntos:
  - Ratón hacia lo que se pisa, (5,6): «hoy no te queda movimiento para dar ni un paso». Es verdad:
    lo que le falta es movimiento, no hay barrera.
  - Ratón hacia otra barrera, (7,5): «hoy no das ni un paso: (7,5) es montaña…».
  - Ratón hacia (12,5), con la región de asaltantes por medio: «Cuidado: el camino cruza la región de
    6 asaltantes… · Ruta: hoy no te queda movimiento para dar ni un paso». Las dos frases conviven.
  - Clic en (5,6): «… hoy no da ni un paso: el primero, a (5,6), cuesta 105 y le quedan 0.»
  - Clic en (7,5): «… (7,5) es montaña y cuesta el día entero de marcha (1616), y le quedan 0; se entra
    mañana.» (`a4-rechazo-dentro.png`)
  - Clic en su propia casilla: «ya está en esa casilla: pulsa otra para moverlo».
- Héroe que no se infiltra (el goblin con sus orkos). El clic en (6,5) da «No hay camino hasta (6,5) sin
  cruzar una barrera: solo la cruza un grupo que se infiltra, y no se infiltra: no lo llevan Orko con
  hacha y escudo ni Orko con dos armas.» Al pasar el ratón por la montaña la barra no dice nada, como
  antes: sin camino no hay vista previa. En su ruta no puede salir la frase de la barrera:
  `barreraDeMañana` solo la escribe sobre una casilla `barreraEn`, y su camino nunca pisa una. Lo he
  leído en el código. Su barra de siempre la fija `escenas.test.ts`; mi guion no llegó a capturarla
  (ver «No probado»).
- La barrera bajo la niebla: no la he provocado en la página. La cubre `escenas.test.ts` («con la
  barrera en la niebla (no se dice)»), y el rechazo del clic siempre es sobre el primer paso, que es
  vecino y está a la vista.

### H1 — cerrado a medias ❌ (N1)

- (7,5), la casilla que pedía el hallazgo: **arreglado**. El goblin queda detrás de la muralla norte y
  de los tejados, con cabeza y torso a la vista y la «G» encima. Se lee fuera, en la ladera
  (`a5-en-7-5-de-cerca.png`).
- El bosque (4,7) y la montaña (3,10) de s10, junto a un paso neutral, **se leen**: la figura y su aro
  están entre los picos (`d-s10-3-10-de-cerca.png`).
- (6,5): **sigue leyéndose encima de la torre del noroeste**. Los pies y el aro caen sobre las almenas
  de la torre, y solo las almenas de la derecha le tapan una pierna (`a3-en-6-5-de-cerca.png`, y a
  zoom normal `a4-rechazo-dentro.png`). Es la misma lectura de la vuelta 1: «está en el adarve». No es
  lo que dice el ingeniero («se lee en la ladera, detrás de la torre del noroeste»).

### Hallazgos de la vuelta 2

**N1, menor (visual; es lo que queda de H1). Parado en una barrera justo al norte de un recinto o de
un pueblo, la figura se sigue pintando encima de él.**
Cómo reproducirlo: igual que H1 hasta el día 2, con el goblin en (6,5) de s8 (`a3-en-6-5-de-cerca.png`).
La causa no es la regla nueva, sino la de siempre, `claveDeFigura`. Esa regla toma `esc.cubiertas`,
y `cubiertas` marca toda casilla cuyo centro cae dentro de la imagen de un objeto horneado (la torre
del noroeste) con la clave de ese objeto. Así la figura va delante de esas piezas aunque tengan el pie
al sur. En lo que se pisa es a propósito («la ciudad tapaba al héroe que nace en la casilla de
encima»). Pero en una barrera es justo lo que pedía H1: «lo que tiene el pie al sur de la figura (el
recinto, objetos, lo de delante) sigue pintándose delante». `delanteEnUnaBarrera` no puede corregirlo,
porque `pisada` toma el máximo de las dos.
Lo he medido con la sonda, en s1-40: casillas de barrera con ≥ 20 % de la figura pintada encima de algo
hecho con el pie al sur de sus pies.
- 169 casillas sobre un recinto, 165 sobre un pueblo y 51 sobre un nodo, todas por `cubiertas`.
- En s8 caen ahí (6,5), con un 43 % de la figura sobre el recinto, y (7,5) con un 30 %, aunque (7,5) se
  lee bien. También (14,6) y (15,6) sobre Quintana (100 % y 57 %) y (17,8) sobre el recinto de town-2.
- Aparte, la regla nueva sube la figura por encima de algo hecho **de su misma fila** con el pie más
  al sur que el suyo en 12 casillas (6 nodos y 6 pueblos). Pasa porque `filaDeLaPieza` mira
  `Math.floor(s.y)` y no el pie.
El test nuevo no muerde esto: en (6,5) y (7,5) solo exige que el recinto tape algo (`> 0`), y lo
cumple aunque casi la mitad de la figura esté pintada encima de él.
Qué esperaba quien juega: ver al goblin en la ladera, detrás de la torre, como en (7,5).
No he podido capturar en la página el caso del pueblo: la ruta hacia (14,6) cruza la región de 6
asaltantes y el guion se desincronizó. Lo del pueblo es por medida. Al norte de un pueblo pasa lo mismo
con un héroe en lo que se pisa, así que ahí es coherente con el resto del mapa. Lo que sí desentona es
el recinto.

**N2, menor (visual, raro). Una obra de un puesto que no está construida puede dejar al infiltrado
tapado por la montaña.**
`delanteEnUnaBarrera` recorre todos los volúmenes de la escena, también las tres obras de cada nodo,
que se pintan o no según su dueño y su mejora (`seVeConSuNodo`). El resultado se guarda una vez por
casilla en `Escenario.enUnaBarrera`. La empalizada y la torre de un paso neutral no se pintan, pero
hacen de `tope`, y la masa de la fila de delante deja de subir la figura.
Lo he medido en s1-40, con el estado neutral y con la caseta. Son 4 casillas en que la masa tapa la
mitad o más de la caja de la figura solo por eso (sin las obras invisibles, 0 %):
- s24 (15,8): 100 % (node-2)
- s36 (8,22): 100 % (node-7)
- s39 (23,9): 80 % (node-3)
- s10 (3,10): 71 % (node-2)
En la página, s10 (3,10) se lee: la figura, más estrecha que su caja, asoma entre los picos
(`d-s10-3-10-de-cerca.png`). s24 (15,8) no la he visto: el guion no llegó a la casilla. Toca el
criterio 5 solo en esas pocas casillas, y el arreglo evidente es mirar solo lo que se ve, o no contar
las obras como tope. No arreglo nada.

### Workarounds de esta vuelta

- Licenciar a los orkos para tener un grupo que se infiltra, y un espejo (`Session`) para saber dónde
  cae cada casilla, como en la vuelta 1. Veredicto: no afecta.
- La sonda mide con la caja de la figura (0,6 × 0,9). Exagera lo que se ve, porque la figura es más
  estrecha: el 71 % de s10 se lee bien en pantalla. Las cifras de N1 y N2 sirven para comparar, no son
  píxeles.

### No probado (vuelta 2)

- **El espectador**: igual que en la vuelta 1, no he montado una partida en que el agente se infiltre.
  Por el código, el espectador compone la misma `Escenario` y pinta con la misma `pisada`, así que
  hereda N1 y N2.
- **La barra de un héroe que no se infiltra, con una ruta larga, capturada en la página**: el guion
  apuntó fuera del lienzo y no quedó capturada. La fija `escenas.test.ts`, y por el código no puede
  llevar la frase de la barrera.
- **El caso del pueblo (s8 (14,6)) y s24 (15,8) en la página**: los asaltantes y el camino
  desincronizaron el guion. Quedan como medida.

### Veredicto de la vuelta 2

**Apto con reservas.** H2 está cerrado y visto, sin contradicción en ninguno de los casos adversariales.
H1 está cerrado en la casilla de la que salió, (7,5), y en las barreras sueltas. No lo está en (6,5) ni
en las barreras pegadas al norte de un recinto (N1). La causa es la regla de siempre, `cubiertas`, y no
la nueva. N2 es raro (4 de 22 931 casillas en s1-40). Ninguno toca reglas. Banco, barrido y
`pnpm qa` se mantienen por cita.

## Vuelta 3

05-11-2026. Re-verifico N1 y N2 (`hallazgos-qa.md`, «vuelta 2») con lo que hizo el ingeniero
(`implementacion.md`, «Vuelta de QA 2»), y hago una pasada adversarial nueva sobre `figuras.ts`,
`superficie.ts` y `mapa.ts`. El código sigue sin commitear. Ningún fichero de producción ni de test ha
cambiado desde el informe del ingeniero: el último que tocó es de las 18:09 y `implementacion.md`, de las
18:16. Por eso cito sus verdes en vez de repetirlos.

### Comprobaciones

| Comprobación | Por qué | Resultado |
|---|---|---|
| `typecheck`, `lint`, `figuras` 21/21, `puentes` 33/33, `ciudad-puente` 9/9, `invariantes` 70/70, `escenas` 45/49, `banco` | lo que tocó la vuelta | **citados** del ingeniero, sobre el mismo código. Los 4 rojos de `escenas` ya estaban en `HEAD`. El banco no se toca: esta vuelta no cambia `src/core` |
| Su sonda (`capturas/vuelta3/v3-sonda.test.ts.txt`) en s1-10, corrida como `test/_qa3-v3.test.ts` y borrada | comprobar sus cifras de N1 y N2 | 5 811 casillas de barrera. «encima de lo hecho ≥ 20 %»: **0** en los cuatro estados. N2: s10 (3,10) da 71 % de masa solo con la empalizada o la muralla **a la vista**, con lo hecho delante. Cuadra con lo que dice |
| Sonda nueva: `capturas/qa3/qa3-sonda-puertas.test.ts.txt`, s1-40, corrida como `test/_qa3-sonda.test.ts` y borrada | ¿cambia la clave de alguien que **no** se infiltra? (`pisada` mira `esBarrera(esc.terreno)`, no `barreraEn`) | 46 519 casillas que pisa quien no se infiltra. En lo que se pisa, **0 cambian**. Con tablero, 0. Pero **177 casillas de un recinto con terreno de barrera (las puertas), las 177 cambian, y en las 177 la clave baja**. Ver N3 |
| Sonda nueva: `capturas/qa3/qa3-sonda-tapado.test.ts.txt`, s1-40, borrada | cuánto queda tapado de verdad un infiltrado, por todo lo que se pinta después (masa y hecho) | 22 931 casillas, por quintil de lo tapado (0-20/20-40/40-60/60-80/80-100 %): 21 926 / 414 / 377 / 89 / **125** |
| Navegador: Playwright sin pantalla, mi vite en un puerto que dio el sistema y en su grupo (`arrancarVite`/`matarGrupo`). Guion en `capturas/qa3/qa3-capturas.ts.txt`, que corrió como `tools/qa/_qa3-capturas.ts` y ya está borrado | N1 en la página y N3 | Consola sin errores ni avisos. Los puertos 39505, 43625 y el del último guion, libres tras cada uno (`ss`). El único `node` escuchando, el 3636, es de `/home/al/code/ai-tutorials/tutor-mcp`, ajeno |
| La misma pasada de N3 sobre una copia limpia de `HEAD` (`git archive` en el scratchpad, `node_modules` enlazado, ya borrada) | saber si N3 es de esta vuelta | ver N3 |

### N1 — cerrado ✅

En la página, `?seed=8&faccion=orkos&heroe=goblin`, con los orkos licenciados y clics reales. Día 1: a
(5,6) con 1436. Día 2: a (6,5) con 0. Día 3: a (7,5) con 0. Al pulsarlo otra vez: «ya está en esa
casilla».

- (6,5) (`qa3/qa3-en-6-5-de-cerca.png`): el goblin está **detrás** de la torre del noroeste. Las almenas
  le tapan las piernas y el aro, y la cabeza, el torso y la «G» se ven en la ladera. Ya no tiene los pies
  sobre las almenas (comparar con `qa2/a3-en-6-5-de-cerca.png`).
- (7,5) (`qa3-en-7-5-de-cerca.png`, `qa3-en-7-5-menos-cerca.png`): detrás de la muralla norte, con la
  cabeza y el torso asomando por encima. Al zoom normal la figura es pequeña, pero se ve encima de la
  muralla y bajo la «G».
- La sonda del ingeniero, que he repetido en s1-10, da 0 «encima de lo hecho» en los cuatro estados de
  los nodos.

### N2 — cerrado ✅

En el código, `subidaEnUnaBarrera` filtra cada llamada con `seVeConSuNodo` y lo que se guarda por casilla
no depende de la partida. Así una caché vieja no puede dar una respuesta pasada. Su test de s24 recorre
neutral → caseta → empalizada → muralla → neutral sobre el mismo escenario. El ingeniero lo vio rojo con
la caché que no mira los nodos. Yo he repetido su sonda en s1-10 y ya no sale ningún caso de N2 en
neutral.

### Las preguntas del coordinador

- **Lo que se pisa y los puentes, frente a `HEAD`.** Lo que se pisa de verdad (`isWalkable`) no cambia en
  ninguna de las 46 519 casillas de s1-40. Los tableros tampoco cambian: la rama con tablero es la misma
  fórmula que en `HEAD`, `max(claveDeFigura, t.clave)`, y la sonda da 0 diferencias. **Pero la regla de
  la barrera no mira `barreraEn`, mira el terreno** (`esBarrera(esc.terreno[i])`, y `esc.terreno` es
  `map.terrain`). Por eso entra en las puertas de un recinto cuyo terreno de debajo es una barrera, que
  pisa cualquiera. Es N3.
- **Las 75 casillas con masa ≥ 50 % en neutral (eran 71).** Todas tienen algo hecho delante, como dice el
  ingeniero. Es la regla de H1 que se pidió: lo hecho del sur va delante, y la masa que se pinta después
  de ello también. Mi sonda mide lo tapado entero, masa y hecho juntos. Las casillas con ≥ 80 % tapado son
  125 de 22 931 (0,5 %), y son de dos clases:
  - **La figura entera detrás de un pueblo, una ciudad o un nodo** (hecho 100 %): s8 (14,6) sobre
    Quintana, s4 (23-24,3-4), s6 (16,7), s10 (36,17) y otras. En la vuelta 2, la de s8 (14,6) se pintaba
    al 100 % *encima* de Quintana. Ahora va al 100 % *detrás*. En lo que se pisa, `cubiertas` subiría a
    ese héroe por delante. Es lo pedido en N1 («lo hecho del sur se pinta delante»). Pero en esas casillas
    el criterio 5, «se ve», solo lo cumple la «G».
  - **Un trozo pequeño de algo hecho que para la subida, y la masa de después que lo tapa casi todo**:
    s24 (4,8) 100 % con un 7 % de hecho, s21 (7,3) 100 % con un 11 %, s17 (7,6) 90 % con un 7 %. Con
    rozar una esquina de la figura, lo hecho hace de tope, y toda la masa ordenada después de él la sigue
    tapando.

  No lo llamo regresión, porque es la regla decidida y sale en el 0,5 % de las casillas. Lo dejo como
  reserva (N4). No las he visto en la página: el guion hacia s8 (14,6) se desincronizó en los asaltantes
  (`waitForFunction` agotó su plazo), como en la vuelta 2. Lo de N4 es por medida.
- **El goblin «algo traslúcido».** **Ya estaba, no es de esta tarea.** Se ve igual de lavado en lo que se
  pisa (`qa3-en-5-6-pisable.png`), en la ciudad (`qa3-ciudad-7-7.png`) y en la copia de `HEAD`
  (`qa3-ciudad-7-7-HEAD.png`). Con `?clima=despejado,dia` es igual (`qa3-ciudad-7-7-despejado.png`), así
  que tampoco es el clima. Es el arte del goblin, de tonos pardos y rojos y con poco contraste. El mapa
  no pinta al héroe con `globalAlpha`: en `mapa.ts` solo lo usa la chapa.
- **El cambio de `test/puentes.test.ts`.** **Es legítimo.** La aserción quería decir «fuera de los
  puentes, la clave de siempre», y (0,0) es una barrera del borde, donde ahora manda otra regla a
  propósito. Moverla a la primera casilla que se pisa sin tablero conserva lo que quería decir. Lo que sí
  deja es un hueco: ningún test mira la clave de una casilla que se pisa **sin ser `isWalkable`** (la
  puerta de un recinto sobre una barrera), y ahí está N3.

### Hallazgos de la vuelta 3

**N3, importante (regresión visual de esta vuelta, fuera de la infiltración). El héroe parado en la
puerta de una ciudad cuyo terreno de debajo es una barrera queda escondido detrás de la muralla.**

Cómo reproducirlo: `?seed=8&faccion=orkos&heroe=goblin`, **sin licenciar nada** (el goblin no se
infiltra). Cierra la base y pulsa (6,6), la puerta del noroeste de Valdeluz, que es montaña por debajo.
El héroe anda un paso y se queda con 1511.
- Ahora (`qa3/qa3-puerta-6-6.png`, `qa3-puerta-6-6-menos-cerca.png`): detrás de la torre y del muro de la
  puerta solo asoma una mancha roja. Al zoom normal solo se ve la «G». Con `?clima=despejado,dia` pasa lo
  mismo (`qa3-puerta-6-6-menos-cerca-despejado.png`).
- En `HEAD` (`qa3-puerta-6-6-HEAD.png`, `qa3-puerta-6-6-menos-cerca-HEAD.png`): la figura y su aro se ven
  en la puerta.

La causa: `pisada` (`superficie.ts`) toma la rama de la barrera si `esBarrera(esc.terreno[i])`. La puerta
y la casilla de una ciudad «cuestan como un camino aunque debajo haya barrera» (`recinto.ts`), y
`barreraEn` las excluye por `rol` (`map.ts:478`), pero `pisada` no. En esa rama ya no entra
`claveDeFigura`, y por tanto tampoco `cubiertas`: el héroe baja de la clave del recinto a la de sus pies.
En la vuelta 2 no pasaba, porque la regla hacía `max` con `claveDeFigura` y solo podía subir.

Lo medido (sonda de puertas, s1-40): **177 puertas** de recinto sobre una barrera. En las 177 la clave
baja de 2,4 a 3 casillas, por ejemplo s8 (6,6) de 9,288 a 6,8 y s1 (18,4) de 7,288 a 4,8. Son unas 4,4
por mapa, y en todas el héroe queda detrás de la torre de su puerta.

Afecta a cualquier héroe que pare en una puerta: la persona, el rival y el agente, y también en el
espectador, que pinta con el mismo `mapa.ts`. Contradice «lo que se pisa no cambia» de `hallazgos-qa.md`
y el criterio 3 («`isWalkable` e `isEnterable` no cambian para nadie más»), que habla de reglas pero
apunta a lo mismo.

Qué esperaba quien juega: ver a su héroe en la puerta, como en `HEAD`.

El arreglo evidente es que la rama de la barrera pregunte lo mismo que `barreraEn`, con el recinto fuera
(`casillasDelRecinto` ya se importa en `superficie.ts`), y añadir un test con una puerta de s8 (6,6) que
exija la clave de `claveDeFigura`. No lo arreglo yo.

**N4, menor (visual, raro; consecuencia de la regla de N1). Un infiltrado justo al norte de algo hecho
puede quedar tapado del todo.** Es el 0,5 % de las casillas de barrera de s1-40, de las dos clases
descritas arriba: entero detrás de un pueblo o una ciudad (s8 (14,6), Quintana), o tapado por la masa
tras un roce pequeño con algo hecho (s24 (4,8)). Se pulsa, y la «G» se ve. Lo dejo para decidir: o se
acepta como la regla de H1 (lo de delante tapa), o lo hecho solo para la subida si tapa más de un mínimo
de la figura.

### Workarounds

- Licenciar a los orkos para tener un grupo que se infiltra, y un espejo (`Session`) para saber dónde cae
  cada casilla, como en las vueltas 1 y 2. Veredicto: no afecta a quien juega.
- Una copia de `HEAD` con `git archive` para comparar N3. Veredicto: solo sirve para mirar, no toca el
  worktree.
- Las sondas miden con la caja de la figura (0,6 × 0,9) y exageran lo que se ve, como ya dije. Sirven
  para comparar.

### No probado (vuelta 3)

- **N4 en la página** (s8 (14,6), s24 (4,8)): el guion se desincroniza con los asaltantes. Queda como
  medida.
- **Un puente en la página**: no lo he visto en pantalla. La rama con tablero es la fórmula de `HEAD`,
  y la sonda da 0 diferencias.
- **El espectador**: hereda N1, N2 y N3 por el código.

### Veredicto de la vuelta 3

**No apto.** N1 y N2 están cerrados: los he visto en la página y he repetido su medida. Pero el arreglo
de N1 trajo **N3**, una regresión que se ve fuera de la infiltración: un héroe cualquiera parado en la
puerta de una ciudad sobre una barrera (177 puertas en s1-40) queda escondido tras la muralla, y en
`HEAD` se veía. El arreglo es acotado: que la rama de la barrera de `pisada` excluya el recinto, como
`barreraEn`, y un test que lo fije. Hecho eso, y si no hay más, quedaría apto con la reserva menor N4.

## Vuelta 4

05-11-2026. Solo re-verifico N3 tras el arreglo del coordinador (`implementacion.md`, «Vuelta de QA 3»:
`Escenario.enUnRecinto`, y la rama de la barrera de `pisada` ya no entra en el 3 × 3 de un recinto). N4
no entra en esta vuelta: lo decide el usuario. Sigue sin commitear. `superficie.ts` y
`test/figuras.test.ts` son de las 18:27, y `implementacion.md` de las 18:28.

### Comprobaciones

| Comprobación | Por qué | Resultado |
|---|---|---|
| `figuras` 21/21, `puentes` + `ciudad-puente` 63/63, `typecheck`, `lint`, `banco` «ancla: igual» | lo que tocó el arreglo | **citados** del coordinador, sobre el mismo código (nada ha cambiado desde entonces). Dice que vio rojo el test nuevo sin el arreglo («s8 (6, 6): expected 6.8 to be 9.288») |
| Sonda N3 en s1-40 (`capturas/qa4/qa4-sonda-puertas.test.ts.txt`), corrida como `test/_qa4-sonda.test.ts` y borrada | ¿vuelven las 177 puertas a la clave de `HEAD`? ¿Siguen las barreras de verdad en su rama? | 46 519 casillas que pisa quien no se infiltra, **0 cambian** frente a la clave de `HEAD` (`claveDeFigura`, o `max` con el tablero). De ellas, **177 sobre terreno de barrera (las puertas), con la clave de `HEAD`**: s8 (6,6) da 9,288 (era 6,8 en la vuelta 3) y s1 (18,4) da 7,288 (era 4,8). Hay 22 931 barreras de verdad (`barreraEn` ≠ null), las mismas de la vuelta 3, y **todas van por la rama de la barrera** (0 discrepancias) |
| Sonda adversarial (`capturas/qa4/qa4-sonda-adversarial.test.ts.txt`), corrida como `test/_qa4-sonda2.test.ts` y borrada | ¿hay alguna casilla del 3 × 3 que el núcleo y la escena cuenten distinto? Con la ciudad-puente y otros lados | Por casilla: el 3 × 3 de la escena (`enUnRecinto`, de `escena.recintos[].rect`) frente al del núcleo (`pasosDelMapa(map).rol ≠ FUERA`). Y la rama de la barrera de `pisada` frente a `barreraEn`. 42×42 s1-40: 206 ciudades (**49 ciudades-puente**), 1 854 casillas de recinto (= 206 × 9), 995 sobre terreno de barrera. 26×26 s1-4: 18 ciudades (10 puente). 64×64 s1-4: 47 ciudades (6 puente). **0 casillas de recinto distintas y 0 ramas distintas en los tres tamaños** |
| Navegador: Playwright sin pantalla, mi vite en el puerto que dio el sistema y en su grupo (`arrancarVite`, `detached`, y `matarGrupo`). Es el guion de la vuelta 3 con otro prefijo (`capturas/qa4/qa4-capturas.ts.txt`), que corrió como `tools/qa/_qa4-capturas.ts` y ya está borrado | N3 y N1 en la página, con clics reales | Consola sin errores ni avisos en las dos pasadas. Los puertos 43081 y 37313, libres después (`ss`). El único `node` que escucha, el 3636, es ajeno (de la vuelta 3) |

### N3 — cerrado ✅

En la página, `?seed=8&faccion=orkos&heroe=goblin`, **sin licenciar** (el goblin no se infiltra): cierro la
base y pulso (6,6), y el héroe llega a la puerta del noroeste de Valdeluz con 1511.

- De cerca (`qa4/qa4-puerta-6-6.png`): la figura y su aro amarillo y rojo se ven en la puerta, delante de
  la torre, como en `HEAD` (`qa3/qa3-puerta-6-6-HEAD.png`). En la vuelta 3 (`qa3/qa3-puerta-6-6.png`) solo
  asomaba una mancha roja tras el muro. Comparada con la de la vuelta 3, la captura solo cambia en la caja
  (161-290, 281-391) del héroe.
- Al zoom normal (`qa4-puerta-6-6-menos-cerca.png`), el héroe se ve en la puerta, bajo la «G», como en
  `qa3-puerta-6-6-menos-cerca-HEAD.png`.
- La captura entera frente a la de `HEAD` cambia en todas partes por igual, también en `ciudad-7-7`, donde
  nada difiere. Es el fondo animado (clima y niebla) de la copia de `HEAD`, no el héroe. Por eso comparo a
  ojo.

### N1 — sigue cerrado ✅

Con los orkos licenciados, a (5,6) con 1436 el día 1, a (6,5) con 0 el día 2 y a (7,5) con 0 el día 3. Al
pulsarlo otra vez: «ya está en esa casilla».
- En (6,5) (`qa4-en-6-5-de-cerca.png`), detrás de la torre del noroeste, con las almenas sobre las piernas
  y el aro. Frente a `qa3-en-6-5-de-cerca.png` solo cambian 317 píxeles, en la figura (su compás).
- En (7,5) (`qa4-en-7-5-de-cerca.png`), detrás de la muralla norte, con la cabeza y el torso asomando.
  Igual que en `qa3-en-7-5-de-cerca.png` a ojo, y la diferencia en toda la captura es la niebla que se
  mueve.

### Pasada adversarial

- **¿Alguna casilla del 3 × 3 que sea barrera para el núcleo y quede fuera de la regla?** No puede haberla,
  y la sonda lo confirma: `barreraEn` devuelve `null` en todo el 3 × 3 (`rol ≠ FUERA`), y el 3 × 3 de la
  escena coincide casilla a casilla con el del núcleo en 42, 26 y 64 de lado. Cualquier casilla de barrera
  fuera de él va por la rama de la barrera.
- **Ciudad-puente.** Su 3 × 3 está centrado en la ciudad en tierra en los dos lados. La casilla del río de
  delante (`rioAnteLaCiudad`, el acceso a dos de la ciudad) queda fuera del 3 × 3, y el núcleo exige que
  se pueda pisar (`isWalkable`), así que no es barrera y no entra en la rama. Las 65 ciudades-puente de
  los tres tamaños dan 0 discrepancias.
- **Lo que no he mirado**: los mapas de un mundo (`?mundo=`) y los planes del agente. El 3 × 3 sale de las
  ciudades del mapa con la misma `recintoDeLaCiudad` en los dos lados, así que no espero diferencia, pero
  queda **no probado**.

### Workarounds

Los de la vuelta 3: licenciar a los orkos para tener un grupo que se infiltra, y un espejo (`Session`)
para colocar los clics. Veredicto: no afectan a quien juega.

### Veredicto de la vuelta 4

**Apto con reservas.** N3 está cerrado: en la página el héroe se ve en la puerta como en `HEAD`, y la
sonda devuelve las 177 puertas de s1-40 a la clave de `HEAD`, sin cambiar ninguna otra casilla que se
pise. Las 22 931 barreras de verdad siguen en su regla, y N1 sigue cerrado en la página. La reserva es
**N4** (menor, de la vuelta 3), que queda para que la decida el usuario.
