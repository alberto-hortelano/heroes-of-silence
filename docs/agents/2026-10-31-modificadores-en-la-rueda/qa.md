# QA: el daño del atacante en la respuesta y los modificadores en curso

01-11-2026. Worktree `combat-wheel-performance-b901a8`, diff sin commitear sobre `f5ad9a05`, ya
con «Tras /simplify» aplicado. No se tocó ni un fichero del repo. Los guiones y las capturas
están en `.cache/qa-mod/`, que git ignora:
- `cruzar.ts`: la previsión contra lo que se cobra, en node.
- `arena.ts`: la arena con Playwright y un espejo de la sesión.
- `capturas-qa.ts`: copia de `tools/qa/capturas.ts` con `responderLaRueda` parcheada para
  mirar cada respuesta.
- `pastillas.ts`: el texto de las pastillas de los hechizos.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1a | Al responder, cada sector lleva grande el daño del atacante y debajo tu contraataque | ✅ | Arena a 1440 × 900, rueda de 7 (`a1/06-cruce2-respuesta.png`): «Fuerte 14–36 / 22–94», «Rápido 2–36 / 2 × 7–34». Partida, elfos, semilla 47 (`cap3/qa-respuesta-01-normal.png`): «Ofensivo 7–10 / 10–57». En las 13 respuestas mostradas en el navegador, el número grande de cada sector es igual a `horquilla(golpeQueViene[t].total)` del espejo: 0 discrepancias |
| 1b | Sin contraataque, solo la del atacante | ✅ | `a1/10-cruce3-respuesta.png`: «9–22 … Normal 22», sin ninguna `.da.tuyo`. La etiqueta dice «te haría 6–22 de daño.» y no lleva «tú» |
| 1c | Lo calcula el núcleo con las cuentas del cobro; no contradice lo que se cobra | ✅ (salvo la suerte, H3) | `npx tsx .cache/qa-mod/cruzar.ts 100 {7,5,3}`: peleas IA contra IA del catálogo con jinetes. Un tercio de los stacks lleva colgado Bendecir, Prisa, Lentitud, Defensivo o Romper guardia. En cada golpe cuerpo a cuerpo se cruzaron todas las parejas (golpe, respuesta) sobre una copia. Rueda de 7: 588 golpes, 28 812 parejas, 94 con carga (68 montadas), **0 fallos**. Rueda de 5: 14 625 parejas, 0 fallos. Rueda de 3: 5 355 parejas, 0 fallos. Se miran el punto, el primer golpe, los siguientes, el total topado en la vida y la carga cobrada frente a la prevista. Las parejas con suerte se apartan. En el navegador, 13 de 13 cobros caen en su sector (p. ej. «quita 22 de 22; el sector decía 6–22», «quita 64 de 90; el sector decía 64–90») |
| 2 | La rueda al golpear no cambia | ✅ | En las fases `golpe` del navegador no hay ni `.del-atacante` ni `.tuyo` (comprobado en cada cruce de `arena.ts`). `test/rueda.test.ts` en verde |
| 3 | Pastillas de los dos en el panel sobre la rueda, más la carga de quien pega; sin nada, ni el hueco | ✅ | `a1/z-cab.png`: «defensa +3», «ataque -1», ⓘ. Nota: «Defensivo: defensa +3 hasta que empiece su próximo turno; Romper guardia: ataque -1 hasta que termine su próximo turno». Carga: `cap/rueda-04-respuesta-movil.png`, «carga +15 %» bajo el orko «(rival)», y en el pie «Su golpe lleva la carga de 3 casillas, +15 %.». Bendecir: `cap2/qa-respuesta-01-normal.png`, «suerte +1». Sin efectos, ningún `.en-curso`: la nota es `null` en la cabecera de todos los cruces sin efectos. Cada cabecera se comparó con los efectos del espejo: 0 discrepancias |
| 3b | El desenlace enseña lo de antes del cruce | ✅ | `a1/07-cruce2-desenlace.png`: el Hermano lleva solo «defensa +3». En el espejo ya tiene también «ataque -1», de la Romper guardia de ese cruce. En `a2`, cruce 4: el desenlace enseña «ataque -3» en quien pega, que ese mismo golpe acaba de vencer. Carga cobrada en el desenlace: `cap/rueda-05-desenlace-respuesta.png` |
| 4 | «En el campo» con las pastillas, en la partida y en la arena | ⚠️ arena ✅, partida ❌ en elfos | En la arena coincide jugada a jugada con el espejo: 0 discrepancias en `a1`, `a2`, `m3` y `m5`. En la partida, con el tema elfos, la pastilla de una fila no elegida no se lee (**H1**): `cap4/qa-campo-1.png`, `cap4/z.png` |
| 5 | Modificador = `BattleStack.effects` (más la carga en la rueda), con lo que hace y lo que le queda | ✅ | `pastillas.ts`: «suerte +1», «velocidad +2», «velocidad -2» (`data-signo="−"`), «suerte -1», «carga +20 %», y una nota «Bendición: suerte +1 durante 2 rondas; Prisa: …; Lentitud: …; Maldición: …; carga de 4 casillas montada, +20 %». Que los efectos vencen se vio en `a2`: Romper guardia («ataque -3») sale de la fila del Guerrero al acabar su turno. El Defensivo dura hasta que empieza el turno de quien lo lleva (traza de `a2b`: `hasta: {turno: 7, al: 'empezar'}`) |
| 6 | Una sola forma de pastilla | ✅ | Lectura del diff: `pastilla()` en `views/panels.ts` la usan `modificadoresEnPantalla` y `modificadoresEnCurso`. `test/paneles.test.ts`, el ancla byte a byte, en verde |
| 7 | El agente no cambia | ✅ | `src/server/` y `contract/serialize.ts` no salen en el diff. `test/agent-contract.test.ts` en verde. `pnpm qa` no se repitió: se cita el del ingeniero, porque no cambió nada de servidor ni de contrato |
| 8 | En el móvil no se desborda | ✅ | A 375 × 812 con las ruedas de 5 y de 3 (`m5/06-cruce2-respuesta.png`, `m3/10-cruce3-respuesta.png`): `scrollWidth` 375 de 375. Con cuatro pastillas metidas a mano en cada contrincante y en cada fila (`m4/03-cuatro-pastillas.png`), la cabecera mide 357/357 y cada fila 357/357: se parten en líneas |

Lo que se corrió:
- `pnpm typecheck`: 0.
- `pnpm lint`: las 10 infos de antes.
- `pnpm vitest run` de `rueda`, `rueda-contrincantes`, `anim`, `escenas`, `arena` y
  `agent-contract`: 358 passed y 7 failed. Los 7 son los rojos de HEAD (2 en
  `rueda-contrincantes`, R3 y #261; 1 en `anim`, «la cura de un poder»; 4 en `escenas`, «la
  batalla en el lienzo»). Son los ficheros de la previsión, la cabecera, la foto del animador y
  «En el campo».
- `espectador`, `paneles`, `invariantes` y `temas`: 112 de 112. El espectador pinta el
  desenlace, `paneles` es el ancla de una fila sin efectos, y los otros dos miran colores y
  fronteras.

## Hallazgos

### H1. Importante: con el tema elfos, la pastilla de «En el campo» no se ve en la partida

**Reproducción:**
1. Partida de elfos (`pnpm capturas`, pasada escritorio: semilla 47, «Aerin del Roble»).
2. Entra en una batalla.
3. Golpea con Defensivo con una unidad. En la captura fue el Guardia del bosque A.
4. Pasa el turno a otra unidad y mira su fila en «En el campo».

**Qué se ve:** la fila lleva la pastilla «defensa +3», pero es verde oscuro sobre verde
azulado (`cap4/z.png`).

**Por qué pasa:** en `#lateral`, el tema elfos redefine `--accent` como
`--lateral-acento: #1f6a3a` (y `--danger` como `#8f2a14`), que es para el pergamino de la fila
elegida. Pero la fila sin elegir es `--lateral-alt: #32675f`, y además va con `opacity: 0.45`.

**Contraste**, calculado con las fichas de `temas.css`:

| Tema | Verde | Rojo |
|---|---|---|
| Elfos | **1,02 : 1** | **1,29 : 1** |
| Templarios | 4,7 | 5,5 |
| No muertos | 9,4 | 5,9 |
| Imperio | 7,7 | 5,7 |
| Orkos | 8,4 | 5,0 |

En la fila elegida, los elfos dan 5,4 y 6,9.

**Qué esperaba quien juega:** leer los bonificadores de sus unidades, que es la petición. En
la arena (neutro) se leen bien.

**Propuesta:** el color de la pastilla en `#lateral .stack` sin elegir, tomado de una ficha que
contraste con `--lateral-alt` (p. ej. `--accent`/`--danger` del tema, no los del lateral, o
fichas `--lateral-alt-acento`/`--lateral-alt-peligro`). Que `temas.test.ts` lo vigile.

### H2. Importante: el número grande se topa en la vida y la nota no; casi siempre se ve

Es la pregunta del coordinador.

**Sí, se lee como una contradicción.** En `a2/13-cruce3-nota-rapido.png`, el sector de Normal
dice «…–28» y su nota dice «Su golpe te haría: con Ofensivo (medio), 31; con Fuerte (medio),
43; …». En `a1` cruce 3, todos los sectores acaban en 22 (la vida que queda) y la nota de
Defensivo dice «con Fuerte (alto), 68».

**No es un caso raro.** Con los PV de la escala baja, el tope se aplica casi siempre:
- en 100 peleas, el daño de 13 437 de las 28 812 parejas (47 %) pasa de la vida de quien
  responde;
- de las 13 respuestas mostradas en el navegador, en 8 todos los sectores acaban en el mismo
  número (`a1` cruces 1 a 3, `a2` cruce 4, `m5`, `cap/rueda-04-*`, `cap2` 1 y 2).

**Qué pierde quien juega:**
- el máximo deja de distinguir unos sectores de otros: solo el mínimo cambia;
- el número de la nota es mayor que el máximo del sector, sin decir por qué.

**Propuesta**, sin tocar la regla, porque el tope es lo que se cobra:
- **En la nota**: un golpe que te tumba dice lo que te quita y que te tumba, en vez del daño en
  bruto. «con Fuerte (alto), te tumba» o «con Fuerte (alto), 22: te tumba».
- **En el sector**: cuando `total.max` llega a la vida, marcarlo, p. ej. «6–22 †» o una clase
  `te-tumba` con su color y la etiqueta «… puede tumbarte». Así se lee que el tope es tu vida y
  no un techo del golpe.

### H3. Menor: la suerte no entra en la previsión

**Qué pasa:** con Bendecir en quien pega, un golpe con suerte (×2) puede pasar del máximo del
sector. En 100 peleas hubo 139 parejas con suerte, y 4 cobraron fuera de la horquilla (el tope
de la vida se come casi todas). Es lo mismo que la rueda del golpe de siempre, y el ingeniero lo
declara («La suerte», en «Qué NO queda cubierto»).

**Propuesta:** si se toca la nota por H2, añadir «con suerte, el doble».

### H4. Menor: texto de las pastillas

Ya está en el backlog del plan; no bloquea.
- Las pastillas dicen «ataque -1» con guion ASCII, y las de las piezas «−1 Defensa» con signo
  tipográfico. En la misma pantalla de la arena salen las dos formas (`a1/10-cruce3-respuesta.png`:
  «ataque -1» en la cabecera, «+3 Ataque» en la ficha).
- «velocidad +2» frente a las «casillas» de la ficha.

## Workarounds usados

- **El espejo de la sesión** (`SesionDeArena`/`Session`): sirve para saber dónde pulsar y qué
  debería salir. Las elecciones se hacen con clics y teclas reales en la página. No afecta a
  quien juega.
- **Efectos colgados a mano** en `cruzar.ts`: solo en node, para cruzar cifras. No es una
  pantalla.
- **Cuatro pastillas metidas en el DOM** (`m4`), solo para medir el desborde a 375 px. Lo real
  que se vio fueron dos pastillas por contrincante y una o dos por fila.
- **`capturas-qa.ts`:**
  - Sin rendición en la batalla de escritorio, para que el rival llegue a golpear y salga una
    respuesta en la partida.
  - El golpe de la persona en Defensivo o Romper guardia, para tener pastillas.
  - Una espera de 2,5 s tras el golpe rompió la pasada de `cap4`, porque se perdía el
    desenlace. Es un fallo del arnés, no del juego.

  Que la partida de `pnpm capturas` no reciba ninguna respuesta en escritorio y móvil no es un
  fallo: depende del azar de la batalla.
- **El contraste de H1** se calculó con las fichas. Se vio en una captura real solo para elfos.

## No probado

- **El espectador en el navegador.** Solo `test/espectador.test.ts`: 22 en verde dentro de los
  112.
- **La respuesta de la partida en el móvil, y una cabecera de la partida con pastillas.** La
  única respuesta de la partida que salió (escritorio, elfos) no llevaba efectos.
- **Dos cruces en una misma lectura del animador** (la foto atrasada): es el riesgo que el plan
  acepta.
- **Prisa y Lentitud en el navegador.** Solo el texto de su pastilla, en node. Bendecir sí se
  vio (`cap2`).
- **El tema de la partida en templarios, no muertos, imperio y orkos.** Solo por contraste
  calculado (suficiente).

## Veredicto

**Apto con reservas.**
- Las cifras de la rueda al responder son exactamente lo que se cobra: 48 792 parejas en las
  tres ruedas, sin un fallo fuera de la suerte.
- El panel sobre la rueda, el desenlace y «En el campo» de la arena hacen lo pedido.
- En el móvil no se desborda nada.

Las reservas:
- **H1** hay que arreglarlo antes de dárselo al usuario: con elfos, las pastillas de «En el
  campo» de la partida no se leen. Es una regla de color.
- **H2** es la lectura que preguntaba el coordinador: el tope en la vida hace que la nota
  contradiga al sector casi la mitad de las veces. Se propone decir «te tumba» en vez del daño en
  bruto.

---

## Vuelta 2 (01-11-2026)

Solo se vuelven a verificar H1 y H2 de `hallazgos-qa.md`, más una pasada adversarial sobre esos
arreglos. Mismo árbol sin commitear sobre HEAD `f5ad9a05`. Guiones de usar y tirar en
`.cache/vuelta2/` (ignorado): `arena.ts` es la copia del de la vuelta 1 con más comprobaciones, y
`temas.ts` es nuevo. Vite propio en el puerto 3287, arrancado en su grupo (`set -m` en su línea),
con `readlink` de su `cwd` en este worktree. Se paró por su grupo: después, «3287 libre» y el
proceso muerto. Chromium de Playwright sin pantalla.

### Estática y tests (con su porqué)

- `pnpm typecheck`: sin errores. `pnpm lint`: «Checked 511 files… Found 10 infos.», las de antes.
- `pnpm vitest run test/rueda.test.ts test/rueda-contrincantes.test.ts test/temas.test.ts`:
  **123 passed, 2 failed**. Los 2 son los de HEAD, en `rueda-contrincantes` (R3, `templario-escudo`,
  y #261, la vista previa).
  - `rueda`: el `tumba` y el `puedeTumbarte` del núcleo contra lo cobrado.
  - `rueda-contrincantes`: el sector, la marca, la etiqueta, la nota y el pie.
  - `temas`: el contraste de la pastilla en los seis.
- No se repitieron `anim`, `escenas`, `arena`, `paneles`, `neutro.ts` ni `banco`. Ningún fichero
  cambió desde que el ingeniero los dejó en verde (`implementacion.md`, «Vuelta 1 de QA»), así que
  se citan.

### Criterios

| Criterio | | Evidencia |
|---|---|---|
| H1: la pastilla de «En el campo» contrasta en los cinco temas | ✅ | `temas.ts`: la partida real de cada facción (`urlDePartida(5, f)`, con el `data-tema` que pone `main.ts`). La pastilla con el marcado de `modificadoresEnCurso`, metida en filas reales de `#lateral .stack`. Contraste de «defensa +3» / «ataque -1»: templarios 5,13 / 5,94; no muertos 12,03 / 7,46; imperio 10,49 / 7,82; **elfos 5,40 / 6,85** (eran 1,02 / 1,29); orkos 10,97 / 6,60. El fondo de la pastilla es `--lateral`, y no el de la fila. Captura: `.cache/vuelta2/temas-arriba.png` |
| H1: en el neutro (la arena, «En el campo» real) | ✅ | Pastillas de verdad tras los cruces, todas las pasadas de la arena: «defensa +3/+1» 6,59 y «ataque -1» 5,81 sobre `rgb(38,54,43)`. Sin cambio de color (`forma.css` solo aplica con `data-tema`) |
| H2: el golpe que tumba dice «te tumba», y el que no, su cifra | ✅ | En cada respuesta, la nota de cada sector se parte golpe a golpe. Con `tumba === 'siempre'`, el segmento es exactamente «te tumba». Con `'no'`, su cifra y ningún número mayor que el grande del sector. Se miraron **957 golpes** (402 que tumban y 555 que no) en ocho pasadas, en las ruedas de 7, 5 y 3, en escritorio y a 375 px: **0 hallazgos** |
| H2: la frase de la nota empieza como toca | ✅ | «Su golpe puede tumbarte:» si y solo si `puedeTumbarte`, y si no, «Su golpe te haría:». Cruce 4 de `a7`, sin ninguno marcado: «Su golpe te haría: con Ofensivo (máximo), 43; …» bajo «13–43» |
| H2: la clase `te-tumba`, la «†» y «puede tumbarte» en la etiqueta | ✅ | Casan con `puedeTumbarte` en cada sector, y `puedeTumbarte` ⇔ `total.max === vida` en todos. Discrimina: en la rueda de 5 el centro dice «33–52» sin marca y los cuatro del anillo «…–55†», con vida 55 (`a5a3.png`, izquierda). En la de 3, cruce 2, solo «Rápido 9–60†» con vida 60 |
| H2: la línea del pie | ✅ | Una sola vez si algún sector se marca, ninguna si no. Texto exacto: «† Puede tumbarte: el número grande llega a la vida que te queda.». Contraste del pie con cada tema puesto en la página de la arena: 12,36 / 10,17 / 10,75 / 15,76 / 6,90, y neutro 15,02 (`temas-rueda.png`) |
| H2: sin contraataque | ✅ | Salió solo, cruce 3 de `a7` («No devolverá el golpe (Hermano de carga ya devolvió un golpe esta ronda)»): los siete sectores con «6–22†» y sin cifra pequeña, la nota con «te tumba» por golpe y el pie con la línea (`a7/10-cruce3-respuesta.png`). También en `m7`, a 375 px |
| H2: ruedas de 5 y de 3 | ✅ | `a5`, `a3`, `m5` y `m3`: 3 y 4 respuestas cada una, con nombres de fusionados («Ofensivo-fuerte (máximo), te tumba»), 0 hallazgos |
| H2: lo cobrado cae en la horquilla | ✅ | Todas las respuestas («cobrado: … quita X de V; el sector decía a–b») dentro, sin suerte |
| Móvil 375 × 812 (ruedas de 7, 5 y 3) | ✅ | Diálogo 363 de 363 de ancho, página 375 de 375, el pie acaba en 716 a 754 de 812. Ningún rótulo de sector se pisa con otro (cajas cruzadas dos a dos), ninguna cifra sale del plato (el margen mínimo, 36 px) y la línea del pie va en dos renglones. `movil3.png` y `notas-movil.png`. Sin errores en consola en ninguna pasada |

### Hallazgos

Ninguno bloqueante ni importante.

- **Menor, ya declarado por el ingeniero y fuera de H1: la opacidad de la fila que no es la
  activa.** «En el campo» marca con `.empty` (`opacity: 0.45`) toda fila que no es la activa, así
  que casi todas las pastillas de una batalla se ven a esa opacidad. Con ella, el contraste
  efectivo es 1,93 a 3,37 en los cinco temas: elfos 1,96 / 2,21. Es lo mismo que el nombre de la
  fila (de 1,83 a 2,89), así que se lee como «no es su turno» y no como un fallo de la pastilla. Se
  ve en la captura (`temas-arriba.png`, la segunda fila de cada tema): se lee, apagada. Si se
  quisiera que lo que lleva colgado una unidad se lea igual de bien en todas las filas, habría que
  sacar la pastilla de esa opacidad. Es una decisión de diseño, no de esta vuelta.

### Workarounds usados

- **Pastillas metidas en filas reales del lateral** (`temas.ts`): mide el CSS de cada tema en la
  partida real de su facción sin jugar cinco batallas. El marcado es el de `modificadoresEnCurso`,
  y las filas son `#lateral .stack` de verdad, con la misma regla que en «En el campo». No afecta a
  quien juega, que ve la batalla. En la vuelta 1 el ingeniero lo vio en una batalla real de elfos.
- **El tema puesto a mano en la arena** (`TEMAS=1`), para mirar el pie y la «†» con cada tema. La
  arena va en neutro, y la partida pone el tema de su jugador con las mismas hojas.
- **El espejo de la sesión**, como en la vuelta 1: dice dónde pulsar y qué debería salir. Los clics
  y las teclas son reales.
- En `notas-movil.png` la nota que se abre es la de Normal, no la de Fuerte que dice el nombre del
  fichero: el arnés pasa el puntero por el centro de la caja del botón, que es el plato entero. Es
  un fallo del arnés, no del juego. Lo que se ve (la nota de Normal con «te tumba» por golpe) vale
  igual.

### No probado

- **«de N a tumbarte»** (`tumba === 'puede'`): 0 de 957 golpes. Con el cruce la tirada cae en un
  número, así que no hay forma de que salga hoy. Se queda como lo declara el ingeniero.
- **La carga y la «†» a la vez** (el pie con tres líneas en el móvil): ninguna respuesta de las
  pasadas trajo carga. A 375 px quedan 58 a 96 px bajo el pie, y una línea de carga mide unos
  36 px.
- **Una respuesta con «†» dentro de una partida** (y no en la arena): el diálogo y la regla son
  los mismos. La vuelta 1 vio la partida de elfos solo por H1.
- **El espectador**: no elige, y su rueda no pide `golpeQueViene`.

### Veredicto de la vuelta 2

**Apto.** H1 y H2 están arreglados:
- la pastilla se lee en los cinco temas y en el neutro (en elfos, de 1,02 a 5,40);
- la nota ya no da ninguna cifra mayor que el número grande, en 957 golpes de las ruedas de 7, 5 y
  3, con y sin contraataque;
- la «†», la clase y la etiqueta casan con el núcleo, y la línea del pie la explica;
- a 375 px no se desborda nada.

Queda una reserva menor, de diseño y anterior a esta tarea: la opacidad de las filas que no son la
activa.
