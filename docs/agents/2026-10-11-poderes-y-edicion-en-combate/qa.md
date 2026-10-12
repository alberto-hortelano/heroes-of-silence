# QA — poderes del monje y edición en combate (arena)

Validado el 11-10-2026 sobre el árbol sin commit (después de /simplify y del retoque de los
botones de poder). Navegador: Playwright sin pantalla (Chromium 1208) contra **mi propio**
`vite --port 3197 --strictPort` (el de `:3100`, pid 14541, no es mío y no lo he tocado).
Arrancado con `set -m` en su línea, muerto por su grupo y comprobado con `ss -ltnp`: `3197 libre`.
No he creado `data/borradores/` (no existía y sigue sin existir) y el árbol tiene los mismos 29
ficheros modificados que al empezar.

No he repetido `pnpm verify`, `pnpm banco`, `pnpm qa`, `barrido-semillas` ni `pnpm capturas`:
el coordinador los da en verde tras el último cambio y nada ha cambiado desde entonces. Los cito
de `implementacion.md` («Tras /simplify», verificación del 11-10-2026).

Scripts de la pasada en `qa-scripts/` (`h.cjs` es el arnés; `s5.cjs` el editor, `s12.cjs` los
enlaces, `ia*.mts` las medidas de la IA, que se corren con `npx tsx <ruta>` desde la raíz).
Capturas en `capturas-qa/`.

## Criterios

| # | Criterio (requisitos.md) | | Evidencia |
|---|---|---|---|
| A1 | Curar: en su turno, de la persona, elige Curar y un aliado vivo herido; repone sin pasar del máximo; cierra el turno | ✅ | Semilla 1, monje (vida 30), escudero y héroe en «Yo», orco en IA. Ronda 4: escudero a 1/15, el monje pulsa «Curar» → parte «Monje, del atacante, usa Curar sobre Guerrero con escudo: cura 4 PV», escudero 5/15 y la activa pasa al escudero (`capturas-qa/s3-curado-1.png`). Ronda 6: cura 4 al héroe (43 → 47/50). El tope del máximo, por `test/poderes.test.ts` (la cura es `min(4, herida)`); en 300 curas de la IA, 40 fueron de menos de 4 (heridas pequeñas): el tope actúa. |
| A2 | Bendecir: aliado vivo, efecto de `bless`, rondas, el mismo origen refresca | ✅ | Pasar por el escudero con Bendecir apuntado: barra «Bendecir a Guerrero con escudo: suerte +1 durante 3 rondas.» (`s2-hover-escudero.png`); clic → parte «usa Bendecir sobre Guerrero con escudo \| Bendición sobre Guerrero con escudo, del atacante: suerte +1 durante 3 rondas». También sobre sí mismo («Bendecir a Monje…»). Refrescar y no sumar (con la Bendición del héroe incluida) solo lo he visto en los tests (`poderes.test.ts`, A2); en el navegador no se ve el efecto acumulado. |
| A3 | `templario-monje` sale con Curar y Bendecir; la ficha deja de decir «sin efecto» para ellas; las demás, inertes | ✅ | Ficha del montaje: «PODERES · ACTÚAN EN LA PELEA … Curar (X) × cura 4 PV a un aliado herido, también a sí misma. \| Bendecir × suerte +1 durante 3 rondas a un aliado; es la Bendición del héroe: las dos no se suman. \| HABILIDADES · SIN EFECTO TODAVÍA … solo Curar y Bendecir tienen motor». El enlace v3 copiado por la página lleva `"habilidades":["Curar (X)","Bendecir"]`. |
| A4 | La IA de batalla usa los poderes (curar cuando compense, bendecir) | ❌ | Los usa, pero **no cuando compensa**: un monje de la IA sin enemigo a su alcance se bendice a sí mismo cada turno en vez de acercarse, y no avanza nunca. Monje contra monje, los dos en IA: **40 de 40** peleas acaban por el tope de 100 rondas (causa `agotada`); sin poderes, 0 de 50, en 3-5 rondas. Ver **H1**. |
| A5 | Lo ilegal lo rechaza un `*Blocker` con motivo; la barra lo enseña | ✅ | Navegador: clic en el orco con Bendecir apuntado → «"Bendecir" va dirigido a un aliado.» y el turno sigue; clic en casilla vacía → «Elige un aliado sobre el que usarlo, o pulsa Escape para cancelar.»; sin heridos, «Curar» apagado con `title` «Nadie de su bando tiene ninguna herida.»; tras moverse una casilla, «Bendecir» apagado con «Ya se ha movido este turno: «Bendecir» se usa al principio del turno.». Muerto, sin el poder, unidad que no hay: `poderes.test.ts`. |
| A6 | Cifras de datos, declaradas inventadas | ✅ | `data/poderes.json`: cura 4, 3 rondas, `_comment` «INVENTADO y PROVISIONAL … no salen de ninguna fuente». No editables en la ficha (el requisito lo dejaba al arquitecto; queda como backlog en `implementacion.md`). |
| A7 | Panel y previsión enseñan qué hará el poder; el registro lo cuenta | ✅ con reserva | Previsión al apuntar (Bendecir, y Curar con varios heridos); el botón habilitado lleva `title` «cura 4 PV a un aliado herido, también a sí misma»; el parte cuenta cada uso. Reserva **M1**: con un solo herido «Curar» se juega al pulsar, sin previsión de a quién ni de cuánto (si la herida es < 4 cura menos de lo que dice el botón). |
| A8 | Batallas del juego sin cambio: `pnpm banco` mismo hash | ✅ | Citado: `sha256 244483394b04…ec46d`, «ancla: igual», 0/200 sin terminar (`implementacion.md`, tras /simplify). |
| B9 | En batalla, `#side` tiene un botón que abre la ficha de la unidad | ✅ con reserva | «Editar» junto al nombre de la activa y en cada fila de «En el campo» (monje, escudero, héroe, orco: 5 botones con dos monjes). Abre `<dialog>` con la ficha entera (`s5-editor-tras-cambios.png`). Reserva **M2**: mientras el tablero cuenta una jugada (el turno de la IA), el panel es solo «Contando la jugada…» y no hay botón (`s8-ia-700.png`). |
| B10 | Cambia el tipo entero (los dos bandos) y el borrador / la prueba para la siguiente pelea | ✅ | Monje en los dos bandos: ataque 10 y vida 20 en el izquierdo → el derecho (IA) abre con ataque 10 y vida 20. Campesino del catálogo: ataque 9 → «Campesino: prueba que no se guarda en data/creatures.json. Cambiado: vale ya en esta pelea.». Al acabar, «Otra vez»: el montaje dice «Monje · BORRADOR · A 10» y «Campesino · CATÁLOGO · PRUEBA QUE NO SE GUARDA · A 9», y la segunda pelea arranca con «Ataque / Defensa 10 / 3». |
| B11 | El cambio vale ya (golpe, previsión, panel); qué pasa con los PV lo dice la interfaz | ✅ | Arquero contra orco: previsión «Daño 1–2 … ataque 5 contra defensa 4 ×1,1» → ataque 25: «Daño 3–5 … ataque 25 contra defensa 4 ×3,1» → defensa del orco 24: «Daño 1–2 … ataque 25 contra defensa 24». Panel: «Ataque / Defensa 10 / 3», «Vida 20 / 20» al cerrar. Velocidad del activo tras moverse: casillas 2 → «Le quedan 0», 7 → «Le quedan 4» y «No llega: le quedan 4 casillas.» más lejos. La ficha en combate dice «Lo gastado sigue gastado … (subir la vida no cura). La velocidad nueva cuenta en el orden desde la ronda siguiente y la moral no cambia.». |
| B12 | Cerrar devuelve la batalla como estaba (turno, selección) | ✅ | Bendecir apuntado → editar el orco → «Volver a la pelea»: misma activa (Monje), ronda 1, Bendecir sigue `primary` y al pasar por el escudero la previsión sigue saliendo. Prisa elegida → abrir el editor → Escape: Prisa sigue elegida («Prisa: velocidad +2 durante 1 ronda.» al pasar). Espacio en un campo del diálogo no cierra el turno ni el diálogo. Doble clic sobre el aliado al bendecir: una sola jugada. |
| B13 | También el héroe del bando | ✅ | «Editar» en la fila del héroe: Conocimiento 5 → «Maná de Héroe izquierdo 50 / 50»; 0 → «0 / 0» y todos los hechizos apagados; ataque 12 entra; quitar Bendición del libro con Bendición elegida → «Cambiado: vale ya en esta pelea. Con las cifras nuevas no se puede usar Bendición: suelto.» y desaparece del libro (`s10-heroe-editor.png`). |
| B14 | Lo que no valida no entra y se dice | ✅ | En rojo (`rechazo`) y el campo vuelve a su valor: daño mínimo 99 («no puede pasar del máximo (3)»), vida 0, −5 y vacía, ataque 2,5, velocidad 99 y 1, hexes 2 («Las casillas que ocupa Monje no se cambian a media pelea»), disparos −1, nombre vacío; del héroe: conocimiento −1, poder 0 y 999 («va hasta 99»), nombre vacío, figura («La figura del héroe no se cambia a media pelea»); del campesino, vida 0. Ninguno escribe línea en el parte. |

Comprobaciones adicionales (pasada adversarial):

- **Enlaces `?montaje=`** (`qa-scripts/s12.cjs`, semilla 7), todos abiertos en una página nueva
  y luchados: v3 copiado por la página (izq. Yo, der. IA) ✅ con los dos poderes; v3 todo IA ✅
  (la pelea se juega entera, panel con el resultado y 0 «Editar»); v3 todo Yo ✅ (el orco «tú»);
  v2 por puesto, entero ✅; v2 repartido ✅ con «El enlace repartía el bando izquierdo entre tú y
  la IA: ahora lo mueves tú entero.»; v2 con solo el héroe en IA ✅ (mismo aviso); v1 ✅ y v1 todo
  IA ✅; v2 de un monje sin habilidades (antiguo) ✅ (sin botones de poder); v4 ✅ rechazado («es
  de la versión 4 y esta arena lee de la 1 a la 3»); `"Bendecirr"` ✅ rechazado con la lista;
  `ia` en un puesto de la v3 ✅ rechazado; un orco con «Curar (X)» en el enlace ✅ sale con su
  botón en su turno.
- **Añadir poderes a otro tipo en plena pelea**: Curar y Bendecir al escudero desde el editor →
  en su turno salen «Curar» (apagado, «Nadie de su bando tiene ninguna herida.») y «Bendecir».
- **Consola**: ningún error ni aviso en ninguna de las páginas abiertas en la pasada (unas 25).
- **Móvil** (390×844): el diálogo mide 352 px, cabe y hace scroll; sin scroll horizontal
  (`scrollWidth` 390) (`s13-movil-editor.png`).

## Hallazgos

### Importante

**H1 · La IA se bendice a sí misma cada turno en vez de acercarse: el monje de la IA no avanza
nunca y monje contra monje no se acaba hasta el tope de 100 rondas.**

Reproducción en el núcleo (`npx tsx docs/agents/2026-10-11-poderes-y-edicion-en-combate/qa-scripts/ia2.mts`):
monje contra monje, los dos en IA, semilla 1. Los hechos son, ronda tras ronda,
`power attacker-0→attacker-0 bendecir`, `power defender-0→defender-0 bendecir`, y ningún
movimiento. Medido (`ia.mts`, `ia3.mts`), en IA contra IA:

| Montaje | Acaban en el tope de 100 rondas | Rondas (mediana / máx) |
|---|---|---|
| monje contra monje, con poderes | 40 / 40 | 100 / 100 |
| monje contra monje, sin poderes | 0 / 50 | 3 / 4 |
| 2 monjes contra 2, con poderes | 50 / 50 | 100 / 100 |
| 2 monjes contra 2, sin poderes | 0 / 50 | 5 / 5 |
| monje + arquero contra lo mismo | 3 / 40 | 23 / 100 |
| monje + escudero contra lo mismo | 0 / 40 | 11 / 73 |

Medido en el núcleo con la misma `SesionDeArena` que usa la página (los dos bandos en IA). En el
navegador no lo he montado: con los dos bandos en IA, «Luchar» jugaría esas mismas 100 rondas.
Por el mismo mecanismo, con la persona en un bando el monje de la IA tampoco debería salir de su
columna mientras no le llegue nadie. Eso no lo he probado.

Por qué (lectura del código, no lo toco): `mejorPoder` (`src/core/ai/tactics.ts:364`) juega el
poder si rinde más que `mejorGolpe(state, s, pasosQueQuedan(state, s))`, que vale 0 cuando no hay
nadie a su alcance hoy; acercarse no tiene valor en esa comparación. Y `rindeTemporal` valora
refrescar una Bendición que aún dura 2 rondas como +1 ronda (`cubre(3) − cubre(2) = 1`), así que
siempre hay algo que «gana» a no golpear. Es Bendecir sobre sí mismo o sobre quien ya está
bendecido.

Lo que esperaba quien juega: que la IA cure al herido o bendiga cuando eso cuenta (A4: «cuando
compense»), y que si no, avance y pelee como antes de tener poderes. El test
«dos monjes en IA contra IA: la pelea termina» no lo caza: su montaje lleva un escudero y un orco,
que se pegan, y además «termina» también es acabar en el tope.

### Menor

**M1 · Con un solo herido, «Curar» se juega al pulsar, sin previsión.** Semilla 1 (montaje de
A1), ronda 4: el botón dice «cura 4 PV a un aliado herido, también a sí misma» y al pulsarlo ya
ha curado, sin que la barra diga a quién. Si la herida es de menos de 4, cura menos de lo que
dice el botón. Lo que esperaba quien juega: ver a quién y cuánto antes de gastar el turno (A7),
por ejemplo en el `title` del botón cuando el objetivo es único. Está declarado (desviación 4 de
`implementacion.md`).

**M2 · En el turno de la IA no se puede editar.** Mientras el tablero cuenta la jugada de la IA,
`#side` es solo «Ronda … / Contando la jugada…», sin «Editar» (`capturas-qa/s8-ia-700.png`,
arquero contra 2 orcos y un arquero goblin, semilla 1, tras «Terminar turno»). La suposición por
defecto de los requisitos era «el panel está siempre». En el núcleo la IA ya ha jugado todo su
turno cuando se cuenta, así que lo que se cambie entra antes de la siguiente jugada de todos modos:
no se pierde nada, pero quien juega no puede abrir el editor hasta que le vuelve a tocar.

**M3 · Textos.**
- El chip de la ficha dice «Curar (X)» con la X sin sustituir. El botón y el parte dicen «Curar».
- «también a sí misma» sale igual en un tipo masculino (el escudero con Curar añadido: «cura 4 PV
  a un aliado herido, también a sí misma»).
- Las mayúsculas tras «No se cambia:» no casan: «No se cambia: la unidad "templario-monje": …»
  frente a «No se cambia: Las casillas que ocupa Monje …» y «No se cambia: La figura del héroe …».
- Cada retoque escribe en el parte «Cambian las cifras de Monje a media pelea» sin decir qué
  cambió. Con cuatro retoques salen cuatro líneas iguales.
- Del montaje y de antes de esta tarea, pero se ve en el editor: «Disparos (0 = cuerpo a cuerpo)»
  con −1 responde «la munición tiene que ser 1 o más», aunque el 0 vale.

## Workarounds usados

- **Vida del monje a 30 o a 200 en el montaje** para que el orco no lo tumbe antes de curar. Es
  lo mismo que hace `pnpm capturas` y se hace desde la ficha, como lo haría quien juega. No afecta
  a la persona: con 8 PV el monje también cura, solo que muere antes.
- **El caso de Curar con varios heridos no lo he podido montar en el navegador**: en cinco
  intentos (semillas 1, 2, 3 y 5, aliados con 200 PV) los orcos atacaban siempre al mismo
  escudero. El camino es el mismo de Bendecir con varios objetivos (apuntar, previsión al pasar,
  clic), que sí he visto. No es un obstáculo para quien juega, porque es la IA quien reparte las
  heridas.
- **Los enlaces v1 y v2 los he escrito a mano** a partir del v3 que copia la página, porque la
  página ya no los escribe. Es lo esperado: son enlaces viejos.

## No probado

- Que Bendecir del monje y la Bendición del héroe sobre el mismo aliado dejen un solo efecto, y
  la regla (e) de fheroes2 (`tirada`): solo en `test/poderes.test.ts`. En pantalla no se ve el
  efecto acumulado.
- Curar sobre un muerto: en el navegador el muerto no sale marcado. El motivo, solo en tests.
- `pnpm verify`, `banco`, `qa`, `barrido` y `capturas` no los he repetido (citados).
  `enfrentamiento.ts` no se ha corrido; el plan lo excluye porque las unidades del juego no
  tienen poderes, y el banco con el mismo hash lo respalda.

## Veredicto

**No apto (hallazgos).** B9-B14 y A1-A3, A5-A8 se cumplen en el flujo real y aguantan la pasada
adversarial (valores malos, enlaces de las tres versiones, Yo/IA por bando, el héroe, cerrar sin
perder lo elegido). A4 no se cumple: la IA usa Bendecir cuando no compensa y deja al monje quieto,
con peleas de IA contra IA que no acaban hasta el tope (H1). Hay que corregir H1 antes de cerrar.
M1-M3 pueden ir a la misma tanda o al backlog.

## Vuelta 2

Re-verificación del 11-10-2026 de lo que pedía `hallazgos-qa.md` (H1 → A4, M1, M3), sobre el árbol
sin commit tras «Vuelta QA 1» de `implementacion.md`. Navegador: Playwright sin pantalla contra mi
propio `npx vite --port 3197 --strictPort` (pid 89654, arrancado con `set -m` en su línea; cwd
`/home/al/code/heroes`), muerto por su grupo y comprobado: `3197 libre`. El de `:3100` (pid 14541)
sigue vivo y no lo he tocado. Scripts nuevos fuera del repo (en mi scratchpad: si se dejan en
`qa-scripts/` con rutas absolutas, `invariantes.test.ts` pone `verify` en rojo); capturas en
`capturas-qa/v2-*.png`. Árbol: los mismos 29 ficheros modificados; `data/borradores/` sigue sin existir.

No he repetido `pnpm verify`, `banco` ni `qa`: verdes en «Vuelta QA 1» (verify 2904 passed; banco
`244483394b04…ec46d`, «ancla: igual»; qa salida 0) y no ha cambiado nada desde entonces.

### Criterios afectados

| # | Criterio | | Evidencia |
|---|---|---|---|
| A4 | La IA usa los poderes cuando compensa | ✅ | `ia2.mts`: monje contra monje, semilla 1: `move attacker-0, move defender-0, …, attack, …, finished` en la ronda 3 (antes, Bendecir en bucle). `ia3.mts` (40 semillas, IA contra IA): monje/escudero 0/40 en el tope, mediana 3; monje+escudo 0/40, 5/7; monje+arquero 0/40, 6/8; monje/monje 0/40, 3/5. `ia.mts`: 2 contra 2 con poderes 0/50 en el tope, mediana 5 máx 7 (sin poderes 5/5); espejo monje+2 escuderos con poderes contra sin ellos, **60–40**, 38 curas, 3 de menos de 4 PV. **Navegador, monje de la IA contra un bando de la persona** que solo pulsa «Terminar turno»: contra un escudero (s1) el monje se acerca y pega en la ronda 3 y la pelea acaba en la 5 (`v2-ia-monje-vs-escudero-quieto.png`); contra un arquero (s2), igual, ronda 5 (`v2-ia-monje-vs-arquero-quieto.png`); monje+orco de la IA contra dos escuderos (s3): espera, pega, **se cura 2 PV cuando le pegan** y vuelve a pegar (`v2-ia-monje-orco-vs-escudero.png`); dos monjes de la IA contra uno tuyo (s4): pegan desde la ronda 2. Ninguna bendición en bucle, consola vacía. |
| M1 | Curar con un solo herido dice lo que curaría | ✅ | s1, monje (200 PV) y escudero tuyos, orco de la IA con el daño bajado a 1–1 desde el editor: ronda 4, escudero 13/15 → `title` del botón «Curar a Guerrero con escudo: cura 2 PV.»; al pulsar, el parte «Monje, del atacante, usa Curar sobre Guerrero con escudo: cura 2 PV» (`v2-m1-title.png`). Con la herida del propio monje (4 de 8): «Curar a Monje: cura 4 PV.» y cura 4. El tope de la herida actúa en el `title`. Solo está en el `title` (lo dice el ratón al pasar), como pedía el hallazgo. |
| M3 | Textos | ✅ con reservas | `s5.cjs` otra vez: chip «Curar (4 PV) ×» y «cura 4 PV a un aliado herido, incluida la propia unidad.» (también al añadírsela al escudero); todos los rechazos «No se cambia: La unidad…» / «No se cambia: Las casillas…» con mayúscula; Disparos −1 → «la munición tiene que ser 0 o más, y es -1», y 0 entra. Parte con un campo por retoque: «nivel 2 → 9», «ataque 3 → 10», «vida 8 → 20», «poderes Curar, Bendecir → Curar», «daño 1-3 → 1-5», «disparos 12 → 0», y del héroe «conocimiento 2 → 4», «poder 1 → 3». Reservas: **N1** y **N2** abajo. |

### Pasada adversarial sobre lo cambiado

IA de poderes, en el núcleo con la misma `SesionDeArena` que la página, los dos bandos en IA, 30
semillas por fila (20 con muralla), comparando con el mismo montaje con el monje sin habilidades:

| Montaje | nuestra (tope / med / máx) | bendición fheroes2 | todas fheroes2 | sin poderes (nuestra) |
|---|---|---|---|---|
| monje contra monje | 0 / 4 / 5 | 0 / 4 / 5 (60 bend.) | 0 / 4 / 5 | 0 / 3 / 4 |
| 2 monjes contra 2 | 0 / 5 / 7 | 0 / 6 / 8 (150 bend.) | 0 / 6 / 8 | 0 / 5 / 5 |
| monje+escudo contra igual | 0 / 6 / 7 | 0 / 6 / 6 | 0 / 6 / 7 | 0 / 5 / 6 |
| monje+arquero contra igual | 0 / 6 / 8 | 0 / 7 / 8 | 0 / 4 / 8 | 0 / 5 / 6 |
| monje solo contra arquero (y al revés) | 0 / 3 / 4 | 0 / 3 / 4 | 0 / 3 / 4 | 0 / 3 / 4 |
| monje de 200 PV contra arquero | 0 / 6 / 7 | 0 / 7 / 8 (30 bend.) | 0 / 7 / 8 | 0 / 6 / 7 |
| monje solo contra arquero tras la «Línea recta» | 0 / 7 / 8 | 0 / 7 / 8 | 0 / 4 / 5 | 0 / 7 / 8 |
| monje+escudo contra escudo tras la «Línea recta» | 20/20 / 100 | 20/20 / 100 (1 340 bend.) | 20/20 | **20/20 / 100** |
| monje+escudo contra igual con «Línea con puerta» | 20/20 / 100 | 20/20 / 100 (2 680 bend.) | 20/20 | **20/20 / 100** |

- **Bucles de cura**: ninguno. 0 curas de 0 PV en todas las filas; ninguna pelea nueva en el tope.
- **150 peleas al azar** (1-3 unidades por bando de 14 tipos, monje en un bando o en los dos, las
  tres reglas alternadas, semilla de composición 777): 0 en el tope con poderes y 0 sin; ninguna
  dura más del doble y +3 rondas que su espejo sin poderes (la peor, 7 contra 4).
- **Con muralla** sin escalera, el tope de 100 rondas sale **igual sin poderes** (el atacante no
  pasa el muro): no lo causan los poderes. Con la bendición de fheroes2 el monje se pasa esas 100
  rondas bendiciendo a los suyos cada vez que se les acaba el efecto (67 por pelea): no alarga nada,
  porque la pelea ya estaba parada, pero es lo único que hace.
- **Con héroes** (libro sin daño: Bendición, Curación, Prisa; unidades de 60/120 PV, 30 semillas):
  ninguna en el tope; con nuestra regla mediana 14 contra 12 sin poderes; con la de fheroes2, 6
  contra 12 (el monje bendice 360 veces y acelera la pelea). Ningún stack acaba con dos efectos de
  Bendición. El héroe no lanzó ninguna Bendición en esas peleas, así que el choque monje/héroe sobre
  el mismo aliado sigue visto solo en los tests.
- **Arquero con 0 disparos** en el montaje (los dos bandos, con monje y héroe): ninguna en el tope.
- **Munición 0 a media pelea** (navegador, s3, arquero tuyo contra orco): 12 → 0 quita la fila
  «Munición» y al barrer el lienzo con el ratón no sale ningún «Dispararías»; 0 → 5 la devuelve
  («Munición 5») y vuelve «Dispararías. Daño 1–2 …». Parte: «disparos 12 → 0», «disparos 0 → 5»
  (`v2-municion.png`). Pero ver **N3**.

### Hallazgos nuevos

Ninguno bloqueante ni importante. Todos menores:

**N1 · El parte sigue escribiendo «Cambian las cifras de Monje a media pelea» sin decir qué, y también
cuando no cambia nada.** s2, monje y héroe tuyos contra un orco, ronda 1, «Editar» del monje:
Liderazgo 9, Coste (oro) 999, Ataque 3 → 3 (el mismo valor) y añadir la habilidad «Salto». Cada uno
escribe una línea idéntica sin detalle (cuatro iguales seguidas, `v2-parte-retoques.png`), y el
diálogo responde «Cambiado: vale ya en esta pelea.» aunque no ha cambiado nada. `cambiosDeCifras`
no cubre liderazgo, coste ni habilidades sin motor, y el retoque se escribe aunque `cambios` salga
vacío (`retocarElTipo`, `src/core/arena.ts`). Es lo que M3 pedía quitar («cuatro retoques eran cuatro
líneas iguales»). Esperaba: o el campo («liderazgo 2 → 9») o ninguna línea si no cambia nada de la pelea.

**N2 · El parte del héroe no casa con lo que se escribe.** Mismo montaje, «Editar» del héroe:
Ataque 2 → 9 en la ficha escribe «ataque 5 → 12» (las del cuerpo, con el equipo base), y quitar
Prisa del libro escribe «hechizos magic_arrow, haste, slow, bless, curse, lightning_bolt, cure →
magic_arrow, slow, bless, curse, lightning_bolt, cure»: ids internos en inglés y la lista entera,
cuando el libro de la página los llama «Flecha mágica», «Prisa»… Esperaba los nombres del libro (o
«− Prisa»), y el ataque como en la ficha o dicho como cuerpo.

**N3 · Ida y vuelta en el editor devuelve lo gastado.** En el núcleo (`retocarEnBatalla`, el mismo
camino que la página): arquero con 9 de 12 disparos → Disparos 0 → 12: vuelve con **12**; escudero
a 5/15 → Vida 3 → 15: vuelve a **13/15**. `conCifrasNuevas` calcula lo gastado desde las cifras de
ese momento (con 0 disparos o con la vida por debajo de la herida, lo gastado se pierde). La ficha
dice «Lo gastado sigue gastado … (subir la vida no cura)». No es de la vuelta 1 (es del editor), pero
salió al probar la munición 0. Esperaba: la munición y la herida se conservan, o la ficha lo avisa.

**Menor, de antes**: los rechazos dicen «La unidad "templario-monje": …» con el id, no «Monje».

### Workarounds usados

- **Orco con el daño a 1–1 y monje a 200 PV** desde el editor de la página, para tener una herida de
  menos de 4 en el turno del monje (subir la vida máxima no crea herida: la herida se conserva). Es
  lo que haría quien quiere probarlo; no afecta a quien juega.
- La persona solo pulsa «Terminar turno» en los casos del monje de la IA: así se ve si el monje
  sale de su columna sin que nadie le vaya a buscar.

### No probado

- El choque Bendecir del monje / Bendición del héroe sobre el mismo aliado en una pelea de verdad: la
  IA del héroe no lanzó Bendición en las 60 peleas con héroe. Solo en `test/poderes.test.ts`.
- `pnpm capturas`: no repetida (los cambios son de texto y del `title`; citada en «Vuelta QA 1»).

### Veredicto (vuelta 2)

**Hallazgos.** Arreglado lo que bloqueaba: A4 se cumple (la IA cura y bendice cuando compensa y, si
no, anda; ninguna pelea nueva en el tope en las ~600 medidas, ni contra la persona en el navegador)
y M1 se cumple. M3 se cumple a medias: quedan N1 (líneas del parte vacías o de un cambio que no es)
y N2 (el parte del héroe con ids en inglés y otro ataque). N3 es del editor, no de esta vuelta. Los
tres son menores y ninguno impide cerrar si el coordinador los manda al backlog.
