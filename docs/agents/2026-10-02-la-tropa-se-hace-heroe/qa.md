# QA — La tropa se hace héroe (ciclo B)

Validado sobre el árbol sin commitear de `main` (`f22761c` + el diff del ciclo), el 02-10-2026.
La referencia es `requisitos.md`: la petición literal «Si llegan a nivel maximo se convierten en
heroes al llegar a la base. El heroe lo crea la ia en base al personaje», más las decisiones del
usuario («solo con narrador», «todo héroe empieza en el 5»).

## Comprobaciones corridas

| Orden | Resultado real |
|---|---|
| `pnpm verify` | 33 ficheros, **936 passed / 1 skipped**, 7,65 s de vitest (11,8 s de pared), salida 0 |
| `pnpm banco` | sha `0c8fc759950dfd95…`, 62 531 líneas, 0/200 sin terminar, 9/18/35 días, «ancla: igual» |
| `npx tsx tools/qa/barrido-semillas.ts` | 0/40 sin terminar, 9/18/35 |
| `pnpm qa` | salida 0 en 3,03 s: «24 veredictos, 24 entraron, 0 descartadas», «ascenso: QA veterano-1 (hero-veterano-1), tipo nigromante, nivel 5, sin tropa: true, «Un Esqueleto que sobrevivió a 3 batallas.»» |
| `pnpm capturas` | salida 0 en 86,1 s, «sin errores en consola», «espectador: el héroe nacido de la tropa se ve en el panel: QA veterano-1 · Nigromante — «Un Esqueleto…»», «el panel del héroe enseña su tipo: «HÉROE · NIVEL 5 · Caballero»» |
| Extractor `tools/datos/tipos-de-heroe.ts` | se volvió a ejecutar: JSON **idéntico** (`cmp`), `NuevaJugabilidad.md` sin cambios (md5) |
| Sondas propias (núcleo y director) | ver la pasada adversarial; todas retiradas, `git status` igual que al empezar (38 entradas) y puertos 3100/9880/9881 libres |

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Veterano de nivel 5 en su base (guarnición o tropa de un héroe propio allí) dispara el ascenso; solo jugadores del agente | ✅ | `veteranosEn` (guarnición, luego tropa del héroe en la casilla); `ascensos()` solo se llama desde `playAgentTurn`. Decisión escrita: al empezar el turno del agente. `ascenso.test.ts` «cuenta los de nivel 5…» y «no cuenta al de nivel 4, fuera, otro castillo». |
| 2 | Kind nuevo en `REQUEST_KINDS` con `case` en `decidir`; el guardia de las dos direcciones sigue mordiendo | ✅ | `hero_from_troop` en `REQUEST_KINDS` y en `politica.ts`; `qa-politica.test.ts` en verde; el informe enseña la salida roja del guardia sin la rama. |
| 2 | Envía criatura y nombre, nivel y experiencia, hoja (batallas, bajas, héroes con nombre), facción y tipos acotados | ✅ | `serializeHeroFromTroop`; `agent-link.test.ts` comprueba `{id, level:5, experience:220, battles:3, kills:5, heroesDefeated:['Sir Arnés'], in:'garrison'}`, `you.faction` y los cuatro ids. |
| 2 | Pide nombre (acotado como #97), historia corta acotada y tipo de la lista, con zod y prosa | ✅ con reserva | Esquema y `RESPONSE_FORMAT.hero_from_troop` presentes. El nombre es exactamente el de #97, y por eso hereda su hueco: ver hallazgo M1. |
| 3 | Tipos en `data/`, extraídos por regex, Templarios→knight y No muertos→necromancer | ✅ | `data/tipos-de-heroe.json`: knight caballero/monje/inquisidor/gran_maestre, necromancer nigromante/vampiro/lich/caballero_de_la_muerte, que coinciden con las líneas 21-25 y 100-104 del cuaderno. Al regenerarlo sale byte a byte igual. |
| 3 | Tipo guardado, visible, serializado e inerte; inicial y contratado con tipo por defecto | ✅ | `Hero.tipo`; `heroes[].type` en el turno; panel «HÉROE · NIVEL 5 · Caballero» (captura `desktop-01-mapa-dia-1.png`). Ningún lector de reglas lee `tipo`. |
| 4 | Nace en la base con la experiencia del individuo, nombre, historia, tipo y facción del dueño; ejército vacío; 0 de movimiento | ✅ | Sonda con semillas 7, 11 y 23: nacido en la casilla del castillo, `army=0`, `mp=0`; `pnpm qa`: nivel 5, «sin tropa: true». |
| 4 | El individuo sale de donde estaba | ✅ | Sonda: guarnición de 7 a 6. Test «ascenso por la tropa». |
| 4 | Portador con el ejército vacío: «no pasa nada, está en la base» | ❌ **la premisa no se sostiene** | Ver hallazgo I1. Que el nacido o el portador estén en el castillo **sin tropa** desactiva la guarnición como defensa. |
| 4 | La crónica lo cuenta con un hecho sellado por `emit` | ✅ | `hero_promoted` vía `emit`; `cronica.test.ts`; en la captura del espectador: «Un Esqueleto del jugador 1 se hace héroe: QA veterano-1». |
| 5 | Con el tope lleno no se pregunta y la tropa espera; el agente lo sabe | ✅ con matiz | Sonda B: con 3 héroes y dos veteranos se pregunta uno; el segundo no se pregunta (y no queda recordado), y al liberar un hueco se le pregunta. El agente lo deduce de su turno: ve `level:5` en la guarnición, 4 héroes y la regla en la prosa. La línea «no se pregunta» va solo a la consola y al panel del director, **no** al agente. |
| 5 | Respuesta mala o tardía: nada cambia, el motivo llega en CÓMO FUE LO ANTERIOR, no se reintenta hasta que vuelva | ✅ | `agent-link.test.ts`: esquema malo, tipo de la otra facción y plazo agotado dejan el estado idéntico; el veredicto es `ok:false` con el motivo y no dice «IA de reglas». Preguntas 1, 1, 2 al salir y volver. |
| 5 | Un individuo nunca da dos héroes | ✅ | Al ascender sale de la tropa; test «el segundo intento ya no lo encuentra». |
| 6 | Sin agente no cambia nada; banco y barrido iguales | ✅ | Ancla `0c8fc759…` sin re-anclar; barrido 0/40. |
| 7 | El agente ve el tipo de cada héroe en su turno | ✅ | Test «el turno ya lo trae con su tipo»; `pnpm qa` lo cruza con `game_state`. |
| 7 | El espectador enseña nombre, tipo e historia en el panel | ✅ | `espectador-00-heroe-nacido.png`: «QA veterano-1 · Nigromante», movimiento 0 y la historia debajo. |
| 7 | El cliente enseña nombre, tipo e historia | ⚠️ solo por test | En el cliente local el caso es inalcanzable, porque sin narrador no hay ascensos. Lo cubren `paneles.test.ts` y el ancla de paneles. El tipo sí se ve en vivo. |
| 7 | La crónica pinta el hecho | ✅ | En el espectador en vivo, y en el cliente por el ancla. |
| 8 | Tests de núcleo con fixture: petición, buena, mala, tope, no dos veces | ✅ | `test/ascenso.test.ts` (16) y `agent-link.test.ts` (+6). |
| 8 | `pnpm qa` lo cruza de verdad sin puerta de trampas en producción | ✅ | `preparar` solo se abre por `import` desde `tools/qa/partida-con-veterano.ts`; `ws-server.ts` llama a `arrancarPartida()` sin opciones. Ninguna variable de entorno lo activa. |
| 8 | verify, barrido 0/40, qa y capturas en verde | ✅ | Tabla de arriba. |

## Hallazgos

### I1 — importante: el héroe recién nacido deja la base sin defensa

**Qué pasa.** Un veterano de la **guarnición** asciende y, si la casilla del castillo está libre, el nacido aparece en ella con el ejército vacío. `ascenderVeterano` **no llama a `takeGarrison`**, a propósito según su docstring. Pero la regla vigente («con el héroe del dueño dentro, la ciudad la defiende solo él con su tropa») hace que la guarnición deje de pelear. El nacido tampoco tiene movimiento ni ninguna acción para recoger la guarnición. Ese mismo día, en el turno del rival, la base la defiende **un héroe solo**, y si cae la base se pierde la partida.

Es el único camino de nacimiento que no recoge la guarnición: `hireHero` (game.ts:1268) y `volverABase` (game.ts:2314) sí la recogen.

**Reproducción** (núcleo, sonda retirada). `newGame({seed})`, `ponVeteranoEnLaBase(state, 1)` y `ascenderVeterano(state, 1, id, {heroType:'nigromante'})`. Después, el héroe del jugador 0 se coloca junto a la base del 1 con solo **dos campesinos** y hace `move_hero` sobre el castillo:

| semilla | sin ascenso (control) | con ascenso |
|---|---|---|
| 7 | defienden 7 stacks de guarnición; cae la base | defiende `hero-veterano-1` solo (1 stack); cae la base y `game_over` |
| 11 | defienden 7 stacks; **la base aguanta** | defiende 1 stack; **cae la base** y `game_over {winner:0}` |
| 23 | defienden 7 stacks; **la base aguanta** | defiende 1 stack; **cae la base** y `game_over {winner:0}` |

**Lo mismo pasa en el caso del portador**, que es el que `requisitos.md` daba por inocuo («no pasa nada: está en la base»). Si el veterano era su única tropa, el portador queda en el castillo sin ejército y la guarnición tampoco pelea.

**Qué esperaba quien juega.** Que convertir a su mejor soldado en héroe no le cueste la base esa misma noche. En `pnpm qa` el nacido acaba en la casilla del castillo, sin tropa, en todas las pasadas.

**Lo decide el usuario**, porque la pregunta abierta era suya y la premisa con la que se respondió resulta falsa. Opciones obvias: que el nacido recoja la guarnición como el contratado y el que vuelve, o que nazca fuera de la casilla del castillo.

### M1 — menor: nombre e historia en blanco pasan el esquema

`heroFromTroopResponseSchema.safeParse({name:'   ', story:'   ', heroType:'lich'})` devuelve `success: true`. También pasan ` ` dentro de la historia y un `\u0000`. El resultado sería un héroe sin nombre visible en el panel, la crónica y el veredicto. Es el mismo `nombreDeMapa` de #97, así que se cumple el criterio literal («acotado como los nombres de #97») y se hereda su hueco.

### M2 — menor: un agente mudo cuesta 300 s por veterano, más el turno

Ya lo declara la implementación. Con dos veteranos y un agente que no contesta son 600 s antes del `adventure_turn`, que a su vez espera otros 300 s. No es nuevo como mecanismo, pero ahora se multiplica por cada veterano.

### M3 — menor: la cuenta de tests de `CLAUDE.md` ya no es la real

La cabecera dice «739 tests, 11,6 s». Hoy `pnpm verify` da 936 (+1 skipped) en unos 11,8 s de pared. La cifra se escribió antes de integrar la rama arte, y el propio `implementacion.md` ya mide 936 en su segunda tanda.

### M4 — menor: el aviso del tope no llega al agente

«Hay veteranos de nivel 5 esperando… no se pregunta» va a `director.log`, que es la consola y el panel «El director» del espectador, pero no a CÓMO FUE LO ANTERIOR. El criterio se cumple porque el agente lo puede deducir de su turno (level 5 en la guarnición, 4 héroes y la regla en la prosa). Pero no se le dice.

## Pasada adversarial

- **Agente que contesta mal.** Nombre con salto, tipo de la otra facción y plazo agotado: los tres dejan el estado idéntico y el veredicto lleva el motivo (tests del director). Un tipo inventado en la política hace que `pnpm qa` salga con 1 (sonda del ingeniero; no la repetí). Huecos que encontré: los blancos de M1.
- **Tope de héroes.** Con 4 de 4 no sale ningún `hero_from_troop` (test). Sonda B (semilla 501, jugador 0, dos veteranos y 3 héroes): el turno 1 pregunta por uno, lo asciende y deja en el log que el otro espera; el turno 2 no pregunta; al quitar un héroe, el turno 3 pregunta por el segundo y nace `hero-veterano-b`. ✅
- **Veterano que sale y vuelve.** Preguntas 1, 1, 2 (test del director). ✅ La «vuelta» se mide al empezar el turno, así que salir y volver dentro del mismo turno no cuenta. Es coherente con la definición del plan.
- **Dos veteranos a la vez con hueco.** Sonda A (semilla 501): dos `hero_from_troop` antes del `adventure_turn`; nacen `hero-veterano-1` en el castillo (8,3) y `hero-veterano-b` al lado (9,2), los dos con `army=0` y `mp=0`. La guarnición pasa de 7 a 5. ✅
- **Héroe nacido en batalla al día siguiente.** Si ataca él (semilla 11, nacido con movimiento contra el monstruo más cercano), no se cuelga nada: pierde, sale `hero_defeated` y luego `hero_returned` a la base, que es la regla de siempre. Si le atacan, ver **I1**: la base cae con dos campesinos. El héroe viejo puede entrar en el castillo con el nacido dentro y recoger la guarnición (sonda), así que el agente tiene salida desde el día siguiente, pero no esa misma noche.
- **Espectador.** En vivo con Playwright (`pnpm capturas`): el panel enseña «QA veterano-1 · Nigromante», movimiento 0 y la historia, la crónica tiene la frase, y la consola está limpia.

## Mirada de jugador y de dirección de arte

- En el espectador la historia va en una línea aparte, debajo de la fila del héroe y con bastante aire. Se lee, pero parece suelta del héroe al que pertenece. Lo noto, no lo cuento como hallazgo.
- La cabecera del cliente «HÉROE · NIVEL 5 · Caballero» cabe y se lee bien.

## Workarounds usados

- `ponVeteranoEnLaBase` / `preparar`: es el mecanismo del propio plan para forzar un caso que sale 0,06 veces por partida. Solo se abre con un import desde `tools/`, así que no afecta a quien juega. Aceptado.
- En las sondas de núcleo moví a mano el héroe rival junto a la base, le recorté la tropa y cambié `state.current`. Eso solo sirve para poner al enemigo delante de forma determinista. El resultado (la guarnición no defiende) sale de reglas que no toqué, y el control sin ascenso lo confirma. Aceptado como medio de observar, no como receta.

## No probado

- El panel del cliente con un héroe nacido de la tropa, en vivo: no se puede alcanzar sin narrador. Solo está cubierto por test.
- Un agente real (Claude por MCP) contestando `hero_from_troop`: el circuito lo cruzó la política de `pnpm qa`, no un modelo.
- No repetí las sondas de mordida del ingeniero (tipo inventado y panel sin tipo); me fié de la salida que pegó.

## Veredicto

**Apto con reservas.** Se cumplen todos los criterios literales, las anclas no se mueven y el circuito entero está en verde. La reserva es **I1**: la decisión «el portador sin tropa no necesita regla, está en su base» es falsa con las reglas de defensa vigentes. Además se extiende al propio nacido, que en el caso de la guarnición (el de `pnpm qa`) deja la base defendida por un héroe sin tropa durante el turno del rival. Tiene que decidirla el usuario antes de dar el ciclo por cerrado.

## Segunda pasada

Re-verificación de I1, M1, M3 y M4 sobre el árbol corregido (02-10-2026), más una pasada adversarial sobre esos arreglos. M2 se quedó como estaba por decisión y no se revisa.

### Comprobaciones corridas

| Orden | Resultado real |
|---|---|
| `pnpm verify` | 33 ficheros, **942 passed / 1 skipped**, vitest 7,83 s, **11,85 s de pared**, salida 0 |
| `pnpm qa` | salida 0 en 3,01 s. «24 veredictos, 24 entraron, 0 descartadas», «ascenso: QA veterano-1 (hero-veterano-1), tipo nigromante, nivel 5, **tropa: 3**», «1 mapa diseñado, 6 turnos de mapa, 17 decisiones de batalla y 1 ascenso» |
| `pnpm capturas` | salida 0 en 86,0 s (1 min 26,7 s de pared), «sin errores en consola». En `espectador-00-heroe-nacido.png` la crónica dice «Un Esqueleto del jugador 1 se hace héroe: QA veterano-1» y justo debajo «El jugador 1 incorpora una guarnición» |
| Sondas de núcleo (`newGame` + `ponVeteranoEnLaBase` + `ascenderVeterano` + asalto) | en el scratchpad, fuera del repo, y borradas al acabar. `git status` sigue con 38 entradas y los puertos 3100, 9880 y 9881 están libres antes y después |

### Criterios

| Hallazgo | Estado | Evidencia |
|---|---|---|
| **I1**: con ascenso, la base aguanta igual que sin él (semillas 11 y 23, rival con dos campesinos) | ✅ | Sonda A. Semilla 11: sin ascenso, 7 defensores y aguanta; con ascenso, 7 defensores y aguanta. Semilla 23: lo mismo. En la primera pasada, con ascenso defendía 1 stack y la base caía. |
| I1, otras semillas, por si 11 y 23 eran suerte | ✅ | Dos campesinos en las semillas 3, 42, 77 y 100: aguanta sin ascenso y aguanta con él. En la 7 cae sin ascenso y **aguanta con él**. Con el ejército propio del rival, en vez de dos campesinos, la base nunca cae con ascenso si no caía sin él. En la semilla 3 cae sin ascenso y aguanta con él, porque el nacido pelea además de la guarnición. En ningún caso el ascenso empeora la defensa. |
| I1, el portador sin tropa | ✅ | Test «si el portador ocupa el castillo… recoge la guarnición». Sonda C: el portador que queda en la casilla recoge hasta su cupo (6). |
| I1, la desviación: recoge el héroe de la casilla y no siempre el nacido | ✅ cumple la intención | La intención del usuario es que la base no quede indefensa. Quien defiende la base es el héroe que está en la casilla del castillo, así que dársela a él es lo que cierra el agujero. Cuando el portador ocupa el castillo, el nacido nace al lado (`casillaDeVuelta`). Si la recogiera el nacido, el portador se quedaría vacío dentro, que es el mismo I1 con otro nombre. El precio es que en ese caso el nacido queda **vacío fuera del castillo**. Lo asalté (sonda E, semillas 11 y 23, dos campesinos contra el nacido de al lado): no lanza, defiende él solo y la base sigue siendo del jugador 1. Es un héroe expuesto, no una base expuesta. |
| **M1**: nombre e historia en blanco se rechazan | ✅ | `'   '`, NBSP sola, espacio ideográfico, ZWSP, guion blando, NEL y DEL se rechazan, cada uno con su frase («no puede ir en blanco…» o «una sola línea, sin saltos…»). Los legítimos pasan todos: `Ñoño d'Arc`, `Zoë`, `李小龍`, `محمد`, `Ольга`, `דוד`, `क्षत्रिय`, `José` con acento combinante, `José María` con NBSP, `🐉 Dragón`, emoji con ZWJ, la bandera 🇪🇸, `«El Tuerto»` y `Tom & <Jerry>`. Quedan residuos, ver N2. |
| **M3**: `CLAUDE.md` dice los tests y los tiempos de hoy | ✅ con residuo | La cabecera y la tabla dicen 942 tests y 11,9 s, y yo medí 942 y 11,85 s. `pnpm capturas` figura con ~87 s en la cabecera, la tabla y la sección del ciclo B, y yo medí 86,0 s. El residuo es N3. |
| **M4**: el tope de héroes llega al agente | ✅ | Sonda sobre `serializeAdventureTurn`, semilla 11, jugador 1. Sin veterano, no hay `veteransWaiting`. Con un veterano y 1 héroe, tampoco. Con un veterano y 4 de 4: «1 veterano de nivel 5 espera en tu base para hacerse héroe, pero ya tienes 4 de 4 héroes: no se te preguntará hasta que haya sitio.» Con dos veteranos y un hueco, tras ascender uno, la línea sale para el que queda. El turno del rival no la lleva. |

### Pasada adversarial

- **Liderazgo lleno** (sonda B y C). El nacido de nivel 5 tiene tope 20 y cupo 6. Con la guarnición de salida (7 menos el veterano, 6) se la lleva entera y no queda nada fuera. En cambio, un portador en el castillo con la tropa casi llena y la guarnición a 7 (estado forzado a mano) recoge hasta 6, y quedan 4 o 5 en la guarnición sin pelear. Es la regla de siempre de `takeGarrison`, que es la misma que al contratar, y el informe la declara. No lo cuento como hallazgo nuevo.
- **Portador y nacido a la vez** (sonda C, semillas 11 y 23). Uno de los veteranos venía en la tropa del portador, que estaba en el castillo, y el otro en la guarnición. Los dos ascienden: los dos nacidos quedan **al lado, con 0 de tropa**, y el portador en la casilla con 6. Ningún héroe vacío ocupa la casilla del castillo. ✅
- **Dos veteranos en la guarnición con el castillo libre** (sonda D, semillas 11 y 23). El primer nacido aparece en la casilla y recoge la guarnición, **incluido el segundo veterano**. El segundo asciende igual, desde la tropa del primero: nace al lado y vacío, y la guarnición queda a 0. El estado final es correcto, pero la petición que recibe el agente miente sobre dónde está el veterano: ver N1.
- **Nombres con caracteres raros legítimos**: todos pasan (ver M1). El tope de 40 cuenta unidades UTF-16, así que caben 20 dragones 🐉 y no 21. Es cosmético y no lo reporto.

### Hallazgos nuevos

**N1 — menor: el segundo `hero_from_troop` dice que el veterano está en la guarnición cuando ya va en la tropa del primer nacido.** Lo introduce el arreglo de I1. `Director.ascensos` calcula la lista `enBase` una sola vez y serializa cada `v` con la foto de antes. El primer nacido se lleva la guarnición con el segundo veterano dentro. Reproducción: semilla 11, dos veteranos en la guarnición del jugador 1 y el héroe inicial fuera del castillo. Se asciende el primero y se serializa el segundo con su `v` original: `veteran.in` dice `"garrison"`, y `veteranosEnSuBase` ya da `vet-b:hero-veterano-1`. El ascenso sale bien, porque `ascensoPosible` busca por id. Lo que falla es la petición, que describe mal al personaje del que el narrador tiene que escribir. El comentario «Cada `v` sigue valiendo aunque un ascenso anterior… ascender saca solo al que asciende» ha dejado de ser cierto: ascender ahora mueve también la guarnición. Arreglo obvio: volver a buscar `v` por id antes de serializarlo.

**N2 — menor: `lineaLegible` deja pasar U+2028 y U+2029, y la anulación bidi.** `"Ana Bob"` y `"Ana Bob"` pasan, aunque la frase de la regla dice «una sola línea, sin saltos». Son separadores de línea y de párrafo (`\p{Zl}` y `\p{Zp}`, no `\p{Cc}`). También pasa `"Ana‮abc"`, un RLO que da la vuelta a lo que se pinta detrás en el panel y en la crónica. Además, `"⠀"` (braille en blanco), `"ㅤ"` (relleno hangul) y un acento combinante suelto pasan como «algo que se lea». Ninguno abre una inyección, porque el marcado sale por `html.ts`. Es el mismo hueco de M1 por los bordes, y no bloquea.

**N3 — menor: queda una cifra vieja en `CLAUDE.md`.** En la tabla de control de calidad, `pnpm qa` figura con 3,1 s, y el párrafo de debajo suma «11,9 + 3,0». El párrafo sigue diciendo que la cobertura real de `pnpm qa` son «1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla». Hoy el arnés imprime 6 turnos, 17 decisiones y 1 ascenso, y el propio `implementacion.md` lo anota.

### Workarounds usados

- Las mismas sondas de núcleo que en la primera pasada: colocar a mano al héroe rival junto a la base o al nacido, recortarle la tropa y cambiar `state.current`. En C y D también forcé al portador en la casilla y puse un segundo veterano a mano. Todo esto sirve para poner el caso delante de forma determinista. El resultado sale de reglas que no toqué, y la comparación con el control sin ascenso lo confirma. Ningún workaround afecta a quien juega.

### No probado

- N1 y N2 en el circuito vivo, con un agente real por MCP. Los reproduje en el núcleo y en el esquema, que son las puertas por donde pasan.
- El panel del cliente con un nacido: sigue siendo inalcanzable sin narrador, igual que en la primera pasada.

### Veredicto de la segunda pasada

**Apto.** I1, M1, M3 y M4 están corregidos y verificados con evidencia. I1 aguanta en siete semillas, no solo en las dos del test, y la desviación sobre quién recoge la guarnición cumple mejor la intención del usuario que la opción por defecto. Los tres hallazgos nuevos son menores y no bloquean el cierre: N1 es una descripción desfasada en la petición, N2 son bordes de Unicode y N3 es una cifra de documentación.
