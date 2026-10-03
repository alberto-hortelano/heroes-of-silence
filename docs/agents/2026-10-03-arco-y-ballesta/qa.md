# QA: #136, el Y Bot con arco y ballesta en 8 direcciones

Validado el 04-10-2026 sobre el árbol sin commitear (18 ficheros modificados y las carpetas nuevas `arco-8d/` y `ballesta-8d/`). No he tocado nada del repo: solo he escrito esta nota y `capturas-qa/`.

Tampoco he usado ningún puerto ajeno. Arranqué mi propio vite en el 3417 con `set -m` en su línea. Antes de matarlo comprobé dueño y grupo: `ss` daba el pid 249915 con cwd `/home/al/code/heroes`, y el grupo era 249901. Lo maté por su grupo y después `ss` daba «libre 3417». `pnpm capturas` se coge sus propios puertos efímeros.

## Criterios

| Criterio (de requisitos.md) | Estado | Evidencia |
|---|---|---|
| `pnpm verify` en verde | ✅ | `Test Files 44 passed (44) · Tests 1190 passed (1190)`, 21,0 s de reloj |
| `pnpm banco` con el ancla `1b90bfd9…` | ✅ | `sha256 1b90bfd9049a…d599`, `0/200`, `8 / 15 / 25`, «ancla: igual», 4 753 ms |
| `pnpm capturas` sin errores | ✅ | exit 0, «sin errores en consola», 208,2 s. Capturas en `capturas-qa/capturas/` |
| Ritmo del espectador sin cambio apreciable | ✅ | «enseña el fin de la partida 61131 ms después del game_over (plazo 82000 ms; 76 atrasados)». Antes del #136 era 60,6-63,0 s |
| Otros juegos intactos | ✅ | `git diff atlas-8d.json`: +1412 líneas, **0 quitadas**. Ningún otro `_poses/*-8d/` modificado. `arco.png` y `ballesta.png` de una dirección, sin tocar |
| Arqueros (esqueleto, elfo, goblin) con arco y ballestero/arcabucero/artillero con ballesta, en la arena | ✅ | Montados los seis en `/arena/?seed=7`. La red solo pidió `arco-8d/*` y `ballesta-8d/*`: las 32 hojas, y ninguna de `espada-escudo`. Ver `arena-01-montaje.png` |
| Arma visible en las 8 direcciones | ✅ (con reservas, M1-M3) | `giro-ficha-*-{idle,attack,death}.png`: la ficha girada 8 veces por clip. Hojas `d0..d7-{a,b}` revisadas, y `giro.png` de los dos juegos |
| Las 6 acciones con el arma | ✅ | Reposo, marcha, carga, ataque, daño y muerte, en `d0-b`, `d4-b`, `d2-a`, `d0-a` y `d6-b`. En la muerte el arma cae y queda tumbada en el suelo |
| Disparo animado en todas las direcciones, también de frente y de espaldas | ✅ en la hoja · ⚠️ en el tablero | Las 16 filas de ataque tienen `frames: 7, suelta: 4`. Medí los píxeles que cambian respecto a la columna 0, en % de la silueta (sondeo en python, en el informe). Arco d0 (frente): 24-28 %. Arco d4 (espalda): 17-25 %. Ballesta d0: 25-28 %. Ballesta d4: **11-13 %**, el mínimo. Ver `hoja-*-ataque-frente-espalda.png`. Sobre el tablero solo vi disparos este-oeste: no conseguí un tirador alineado en vertical sin forzar la escena |
| La flecha sale al soltar la cuerda, no antes | ✅ | Capturas cada ~100 ms desde «Luchar», con un elfo arquero (IA) contra un ballestero (`arena-03-suelta-cada-100ms.png`). De 196 a 294 ms el arquero tensa y no hay flecha. A los **388 ms** la flecha aparece pegada al arco. Cruza el tablero hasta los 656 ms y la cifra «−2» sale a los 738 ms. El virote del ballestero (su paso empieza hacia los 1 025 ms) aparece a los **1 425 ms**, es decir, en la suelta, 400 ms después. Cuadra con `msDeSuelta` = 4 × 1000 / 10 = 400 ms |
| El liche dispara como antes | ✅ (test) · ⚠️ (navegador) | `relojDelDisparo` sin suelta devuelve `{dura: 620, impacto: 0.55, suelta: 0}`. Lo cubre el test «quien no tiene suelta en su hoja dispara como siempre». No vi un liche disparando en el navegador |
| En la partida, una batalla con `archer`/`ranger` | ✅ asignación · ⚠️ disparo | `capturas/desktop-08-batalla-en-curso.png` (semilla 50, día 1): los arqueros del jugador llevan arco y aljaba (`partida-arqueros-zoom.png`). No vi a un arquero de la partida disparar. Es el mismo `BattleAnimator` y la misma `EscenaBatalla` que en la arena, pero eso es inferencia y no prueba |
| Sin errores en consola | ✅ | Mi guion de la arena (montaje, 48 giros de ficha y la pelea completa en IA, 28 s): 0 errores, 0 avisos, 0 peticiones fallidas. Guion rápido: `errores []`. `pnpm capturas`: «sin errores en consola» |

## Hallazgos

### Bloqueantes

Ninguno.

### Importantes

Ninguno.

### Menores

- **M1. La ballesta en reposo se lee como un pico o un ancla, sobre todo de frente.** En `d0-a` y `d1-a` (reposo, marcha y carga) va colgando de la mano derecha con el tablero vertical y las palas en horizontal a la altura de la rodilla: una «T» invertida. De perfil (d2/d3, `giro-ficha-imperio-ballestero-idle.png`, 3.ª y 4.ª) el tablero con sus estrías parece un serrucho. En el disparo sí se lee como ballesta.
  - Reproducir: `pnpm arena`, «+ der.» en Ballestero, pulsar su figura y Girar hasta el frente.
  - Lo que esperaría quien juega: reconocer al ballestero quieto en el tablero, que es como pasa la mayor parte de la batalla.
- **M2. A escala de tablero el arco casi no se ve.** Es una línea de 1-2 px del mismo tinte que el cuerpo, y de frente o de espaldas (d0/d4) va de canto, como un palo vertical. En `partida-arqueros-zoom.png` (semilla 50, día 1) el arquero quieto se distingue mal del campesino con su horca. En la ficha de la arena sí se lee bien. No hay regresión, porque antes llevaban espada y escudo, pero el objetivo de «ver el arma que llevan» se cumple a medias en el tamaño en que se juega.
- **M3. El disparo de la ballesta de espaldas (d4) es el menos visible**: un 11-13 % de la silueta cambia, frente al 25-38 % del resto. La ballesta solo sube de la cintura al pecho (`hoja-ballesta-ataque-frente-espalda.png`, fila 2). De frente (d0) tampoco llega al hombro. Se anima, que era lo pedido, pero el gesto es corto.
- **M4. Un tirador en cuerpo a cuerpo hace el gesto de disparar a destiempo.** El paso `attack` dura 560 ms con el impacto a los 308 ms, pero la fila de ataque del arco tensa hasta la columna 3 y suelta en la 4, a los 400 ms. El enemigo se duele **antes** de que el arquero suelte, y no sale flecha. Está aceptado en requisitos.md («si se ve mal, se apunta como issue») y figura en el backlog (b). Lo dejo dicho como candidato a ese issue. Es razonamiento sobre el código (`pasoDeAccion` en `anim.ts`) más la hoja: no lo he visto en pantalla.
- **M5. En la muerte el arco a veces queda lejos de la mano.** En 3 de los 8 giros del goblin (`giro-ficha-goblin-arquero-death.png`, 5.º a 7.º) el arco aparece tumbado a un palmo del cuerpo, no junto a la mano. Es estético.

## Workarounds usados

- **El navegador fue un guion de Playwright** (el Chromium de `capturas`, en el scratchpad e importando `node_modules/playwright` por ruta absoluta) y no las herramientas de Chrome. El ingeniero dejó escrito que `captureScreenshot` caducaba a los 30 s. Es una página real servida por vite y con clics reales, así que no afecta a quien juega.
- Copié un momento el guion dentro de `tools/qa/` y lo borré en el acto, antes de ejecutarlo. `git status` lo confirma: el árbol quedó como estaba.
- **Para el reloj de la suelta**, capturas de pantalla seguidas cada ~100 ms. La resolución de la medida es de 100 ms: confirma «después de tensar y en la suelta», no la columna exacta. La columna exacta la cubre el test de `anim.test.ts`.

## No probado

- **El disparo de frente o de espaldas sobre el tablero.** Necesita un tirador y un blanco alineados en vertical, y la arena coloca los bandos este-oeste. Para conseguirlo habría que mover unidades a mano en varias rondas: lo dejé fuera. Sí verifiqué la hoja (las 7 columnas, la suelta en la 4 y el movimiento medido) y que la elección de dirección es la común (`direccion.ts`).
- **Un arquero disparando en la partida** (más allá de verlo armado) y el liche disparando en el navegador. Por qué: no hay ningún atajo para llegar a esa batalla sin rehacer el guion de `capturas`.
- `pnpm qa`: el cambio no toca `src/server/` ni el contrato.

## Veredicto

**Apto con reservas.** Lo pedido se cumple:
- dos juegos nuevos asignados a las seis unidades y a `archer`/`ranger`;
- el arma presente en las 6 acciones y las 8 direcciones;
- el disparo animado en las 8;
- la flecha en la suelta, medida en el navegador;
- el liche sin cambios según su test;
- el banco y los otros juegos intactos;
- el ritmo del espectador igual;
- consola limpia.

Las reservas son de legibilidad (M1-M3, M5) y una inconsistencia ya aceptada (M4). Ninguna impide cerrar.
