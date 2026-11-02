# Armas de fuego y granadas — QA (02-11-2026)

## Veredicto: **Hallazgos** — apto con reservas

Las reglas hacen lo que piden los 15 criterios. En la arena se juegan de punta a punta con las
cuatro unidades del imperio. Sin azar nuevo y deterministas.

Quedan tres hallazgos, ninguno bloqueante:

- **H1 (importante).** En el modo granada, una casilla fuera de alcance da al pasar el ratón un
  mensaje de cuerpo a cuerpo. Si está vacía, no da ninguno.
- **H2 (menor).** La diana de la granada del atacante casi no se ve.
- **H3 (menor).** La crónica dice «Granadero → Granadero».

`pnpm capturas` sale 1 y **no lo causa este cambio**. Ninguna línea de lo cambiado pinta el
mapa: la partida de la semilla 5 se juega distinta y la prueba de la patrulla cae en una carrera
de tiempos que ya estaba. Lo demuestro abajo. Además, `capturas` tiene tres comprobaciones
caducadas que fallan también en HEAD.

Sin probar a mano: una batalla en la partida (`pnpm dev`) y el espectador con imperio.

Sin worktree temporal de HEAD: la causa de `desktop-15` la saco de la instrumentación (§capturas)
y la de los demás rojos, de `git grep HEAD`.

Trabajé solo en el worktree. No arreglé nada. Lo que arranqué lo maté por su grupo: el
puerto 3291 quedó libre.

## Comprobaciones ejecutadas (con su porqué)

| Comando | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck`, `pnpm lint` | Cambia código | 0 y 0 (`Found 10 infos.`, las de siempre) |
| `vitest run test/granada.test.ts test/armas-de-fuego.test.ts` | Las reglas nuevas | 8/8 |
| `vitest run test/espectador.test.ts test/agent-contract.test.ts test/nivel.test.ts test/equipo.test.ts` | C12 (cable y contrato), C13 (índice) y C2 (regla de la pieza) | 4 ficheros, 180/180 |
| `pnpm qa` | Toca el contrato | Pasa. «disparo: … aplicada»; «granada: ningún "throw" del agente en esta partida (no se exige)» |
| `pnpm banco` | El núcleo cambia la partida | «igual — las 20 partidas se juegan hexágono a hexágono igual», 0/20 sin terminar, 4 / 5 / 6 días (el ancla `421344c3…` del ingeniero) |
| `npx tsx tools/qa/barrido-semillas.ts` | Toca la IA | 0/4 sin terminar |
| `qa/adversarial.ts` (núcleo) | Pasada adversarial | Salida en §Adversarial |
| `qa/heroe-y-recarga.ts`, `qa/piezas-malas.ts` | C4, C2 y héroe con granada | Salida abajo |
| Arena en el navegador integrado y repetida en Playwright sin pantalla (`qa/arena-playwright.ts`) | Desde quien juega | Capturas `qa/arena-*.jpg` y `qa/pw-*.png`; consola sin errores ni avisos |
| `pnpm capturas` (entero y luego por pasadas con `CAPTURAS_SOLO`) | Lo pide la tarea | Sale 1; análisis en §capturas |

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Sin azar nuevo; misma semilla, mismo resultado | ✅ | Con un `Rng` que cuenta, 60 batallas IA contra IA (las cuatro del imperio contra coracero, alabardero, piquero y granadero; semillas 1-60) dan 0 llamadas en todo `aim`/`throw` y en su previsión. En 6 `end_turn` en que salen un disparo de arcabuz y una explosión, «rng gastado … 0». Repetidas, las 60 dan el mismo sha del registro (60/60). `chooseBattleAction` no recibe `rng`. La pelea de la arena (semilla 7), repetida en Playwright con los mismos clics, dio las mismas frases. |
| 2 | Cuatro piezas, cifras declaradas, regla de la pieza | ✅ | `data/equipo.json`: pistola 2/1/agi 1/rec 1, arcabuz 3/2/2/1, culebrina 4/3/2/rec 2 (la que más pega y la más lenta), granada 2/1/cargas 2; frase en el `_comment`. Con `qa/piezas-malas.ts`, 17 piezas mal escritas salen cada una con su frase: «la recarga va de 1 a 9 turnos y es 10», «dice cargas: solo una granada se gasta», «a distancia solo la lleva un arma de fuego (tiro: fuego)», «tiro es fuego o granada … y es laser»… Las dos bien escritas, `[]`. |
| 3 | Las cuatro del imperio las llevan de serie | ✅ | Diff de `data/unidades.json`: 4 líneas. En la arena, el pistolero sale con «A distancia (Pistola)» (`arena-01`). El índice mide las 34 (§9 del adversarial). |
| 4 | Recarga, con su frase; sin recarga, como hoy | ✅ | Culebrina turno a turno (`qa/heroe-y-recarga.ts`): t1 apunta; t2 dispara y «está recargando: le faltan 2 turnos»; t3 «le falta 1 turno»; t4 apunta. Pistola en la arena: ronda 2, «A distancia: recargando: le falta 1 turno», botón apagado y pastilla «Recargando: 1» (`arena-05`); ronda 3, vuelve (`arena-08`). El arco del elfo dispara cada turno. |
| 5 | Perforación (tirada, previsión e IA) | ✅ | Barra: «Hoy daría a Hermano de carga. Daño 8 … con Pistola … perfora la armadura» contra Coraza 7 (`arena-02`). Registro: «Pistolero montado → Coracero (disparo a (11,4)): 7 de daño», sin «−2 armadura». El arcabuz al coracero, 16 sin `parado` (adversarial §7). El arco del elfo, «58 de daño (−1 armadura)». |
| 6 | Lanzar: alcance, cargas, motivos; la recta no importa | ✅ | Con `applyAction` se rechazan, cada uno con su frase: fuera de alcance («Granadero lanza hasta 6 casillas (su fuerza), y (9,4) está a 8»), fuera del tablero, a su casilla, sin granadas («se ha quedado sin granadas: lanzó las que llevaba») y el arcabucero («no lleva granadas»). Tras moverse y con un enemigo al lado lo cubre el test; en la arena, el botón apagado dice «Granadero tiene un enemigo encima.». Lanzar por encima de los suyos, aceptado (test). |
| 7 | Explosión: cuartos 4/2, dos bandos, armadura, hechos; no explota si muere o acaba | ✅ | Arena, lanzada a (1,4): «Granadero → Granadero (granada en (1,4)): 18 de daño (−1 armadura)», el 18 que preveía, y «→ Hermano de carga … 12 (−7 armadura)». Hechos `thrown`, `blast` (con `cuarto`) y `perished`. Si muere el lanzador, 0 `blast` (adversarial §4). Si la explosión acaba la batalla, `finished` y `legalActions` vacío (§3). |
| 8 | Cargas por batalla | ✅ | Arena: «Granadas: 2 de 2» → «1 de 2» → «0 de 2», y el botón se apaga (`arena-07`). Tercer intento en el núcleo: rechazado. Cada batalla empieza con `granadasLanzadas: 0` (`createBattle`). |
| 9 | A la vista (panel, tablero para los dos bandos, barra con «¡tuyo!») | ✅ en la arena · ⚠️ partida y espectador | Panel: «A distancia: 2 granadas, alcance 6», «Recargando: 1», «Granadas: k de n». Tablero: diana y anillo teñidos, en el tanteo y en el aire (`pw-02b`, `pw-03`). Barra: «Lanzarías a (1,4). A Artillero con culebrina (¡tuyo!) … A Granadero (¡tuyo!) …». Pero H1 (fuera de alcance) y H2 (la diana del atacante casi no se ve). Partida y espectador: ver «No probado». |
| 10 | Selector de arma | ✅ | «Cuerpo a cuerpo (Daga)» / «A distancia (Granada)»; el clic en una casilla lanza (`arena-03`, `arena-04`). |
| 11 | IA: recarga y granada sin dar sobre todo a los suyos | ✅ | 60 batallas: 180 `thrown`, 273 `blast`, 259 `shoot`, 0 jugadas rechazadas y 0 sin terminar. Enemigo rodeado por tres de los suyos: la IA golpea en vez de lanzar. Solo: lanza (§8). |
| 12 | Agente y espectador | ✅ (con matiz) | `agent-contract` (85) y `espectador` (22) en verde, `pnpm qa` pasa y la prosa trae ARMAS DE FUEGO y GRANADAS. Matiz: en la partida del arnés no sale ningún `throw` del agente. La jugada ilegal sigue el camino de siempre del director (`catch` → `notaAccionSustituida` con el motivo de `lanzarBlocker`); el zod rechaza una casilla que no es entera. |
| 13 | Índice | ✅ | `medidaBlocker` mide las 34 unidades. Arcabucero 2, artillero 2, granadero 2, pistolero 4. `nivel.test.ts` en verde con la tabla reanclada. |
| 14 | Arena: editor con tooltip y pelea con las cuatro | ✅ | Arcabuz: «Tiro: Arma de fuego», «Recarga 1 ⓘ», «Agilidad 2 ⓘ» (`arena-10`). Granada: «Tiro: Granada», «Cargas ⓘ». Tooltips leídos («Un arma de fuego dispara igual, pero perfora la armadura…»). Retoque a media pelea, cargas 2 → 3: «Granadas: 1 de 3» y vuelve a poder lanzar (`arena-11`). |
| 15 | CLAUDE.md y `docs/historia.md` con fecha | ✅ | 7 líneas nuevas con «02-11-2026» en CLAUDE.md (puerta, dos filas de reglas, agente, equipo). Sección «Armas de fuego y granadas (02-11-2026)» en la historia. |

## Hallazgos

**H1 — importante. En el modo granada, una casilla fuera de alcance da un mensaje de cuerpo a cuerpo, o ninguno.**
- Reproducir:
  1. `pnpm arena` y abrir el enlace de `qa/enlace.ts` (rival: hermano de carga, coracero y arquero élfico; semilla 7).
  2. Luchar. El pistolero apunta al hermano de carga.
  3. Ya en el turno del Granadero («A distancia (Granada)», alcance 6), pasar el ratón sobre el coracero en (7,3), que está a 7.
- La barra dice: «No alcanza a esa unidad cuerpo a cuerpo este turno.» (`arena-09`).
- Sobre una casilla vacía fuera de alcance no dice nada y deja el texto anterior.
- Solo el clic da el motivo bueno: «Granadero lanza hasta 6 casillas (su fuerza), y (10,5) está a 11.»
- Lo que esperaba quien juega: que el ratón dijera por qué no puede lanzar ahí.
- Causa: `EscenaBatalla.dichoDelTanteo` devuelve `null` con un tanteo `kind: 'no'`. La escena cae entonces en `motivoSinGolpe` → `attackRejection` (`ataqueBlocker`).

**H2 — menor (legibilidad). La diana de la granada pendiente del atacante casi no se ve.**
- La cruz y el centro van en el rojo del bando atacante sobre el teñido rojo del cuarto 4. Ampliada ×3 se distingue (`pw-03c-diana-de-la-granada-x3.png`); a tamaño normal no (`pw-03`).
- La del arquero élfico, en azul, se ve bien.
- El anillo, teñido en la escala del calor del disparo, se confunde con la recta teñida de un disparo que pase al lado (fila 5 en `pw-03`).
- Quien juega no distingue de un vistazo «aquí hay una granada a punto de explotar» de «por aquí pasa un tiro».
- El ingeniero ya lo apuntó; S9 no cambió los colores.

**H3 — menor. La crónica dice «Granadero → Granadero (granada en (1,4)): 18 de daño».**
- Sale cuando la granada da a quien la lanzó.
- Se entiende, pero una frase como «se alcanza a sí mismo» se leería mejor.

## Pasada adversarial (núcleo, `qa/adversarial.ts`)

- **`throw` ilegal**:
  - rechazados con su motivo: fuera de alcance, (99,99), (-1,4), a su casilla, el arcabucero y un granadero que apunta;
  - `col: 2.5` lo acepta `applyAction` (`isInside` no exige enteros). El `aim` hace lo mismo y el zod del agente lo rechaza (`z.number().int()`); el cliente no lo produce. No lo cuento como hallazgo.
- **Sin cargas**: el tercer lanzamiento se rechaza («se ha quedado sin granadas…»).
- **Explosión que acaba la batalla**:
  - con el último enemigo: `finished: attacker`, `turno: null`, `legalActions` vacío;
  - con el último enemigo y el lanzador a la vez: `finished: defender`, por la regla de siempre («sin atacante no hay conquista»).
- **Lanzador muerto antes**: la granada se queda en el aire y no explota (0 `blast` en 6 turnos).
- **Dos granadas a la misma casilla**: cada una explota al empezar el turno de su lanzador, 25 y 25.
- **Retoque a media pelea**: cargas 2 → 3 en el editor, sin guardar: queda 1, coherente (`granadasQueQuedan` se deriva). E4 (cambiar la clase de tiro) lo cubre `granada.test.ts`.
- **Héroe con granada o pistola** (no se pedía): con granada, `throw` y `lanzarBlocker` en `null`; con pistola, `aim` en la lista y «no lleva granadas» al lanzar.
- **rng y determinismo**: ver C1.

## `pnpm capturas`

### La corrida entera

Sale 1 en la pasada «escritorio»: «desktop-15: el espejo mueve raider-7 y el lienzo no lo enseña
(cambia 0 y 7749)». Es el mismo fallo que vio el ingeniero.

**No lo causa el cambio**, por cuatro razones:

1. **Ningún fichero cambiado pinta el mapa.** Lo del cliente que cambia es `anim.ts` (el animador
   de batalla), la arena, `escenas/batalla.ts`, `espectador/main.ts`, `render/batalla.ts`,
   `session.ts`, `views/*`.
2. **La partida sí se juega distinta.** La semilla 5 (orkos contra templarios) tiene guarniciones
   neutrales con tropa del imperio. Así la prueba elige otro grupo: raider-7, en HEAD raider-4.
3. **Lo destapé con una copia instrumentada de `capturas.ts`**, que ya borré:
   - capturé la pantalla antes de pasar el día y volví a muestrear tras 3 s;
   - sin pasar el día, la casilla de ayer (16,11) **cambia 13 114 en 3 s**, y (15,10) cambia 1 298;
   - es decir, la prueba toma su línea de base mientras raider-7 aún termina la patrulla del día
     anterior, de (15,8) a (16,11);
   - en `qa/capturas-desktop-15-antes-del-dia.png` la figura está a medio camino, arriba a la
     izquierda de su casilla, y en `…-3s-despues.png` ya ha llegado;
   - con esa base, la casilla de ayer sale igual antes y después: 0.
4. **Es una carrera de tiempos de la prueba** (`patrullaALaVista` no espera a que acabe la
   patrulla del día anterior). Ya estaba, y la destapa otra trayectoria de la partida.

### Las pasadas siguientes, por separado

| Pasadas | Resultado |
|---|---|
| emboscada, perdida, veteranos, movil, tactil, sin-arte, tropa, morada, base-anchos, **espectador**, **arena** | Pasan |
| edicion | Falla en `[data-arena="ir-a-edicion"]` tras recargar (timeout de 30 s). El ingeniero vio el mismo fallo en HEAD |
| equipo | Falla: busca `[data-arena-pieza-campo="danio-max"]`, un campo que tampoco existe en HEAD (`git show HEAD:src/client/arena/paneles.ts`) |
| poderes, rueda-del-golpe | Pasan |
| **armas** | Falla: espera «…(3 a 5), a pie» y la ficha dice «…(3 a 5)». La frase «, a pie» no está en el `src` de HEAD (`git grep ", a pie" HEAD -- src`, vacío) |
| rueda-contrincantes | Pasa: «sin errores en consola» |

Los tres fallos de `edicion`, `equipo` y `armas` son comprobaciones caducadas que ya estaban en HEAD.

## Workarounds usados

- **Montar la pelea por enlace (`?montaje=`, `qa/enlace.ts`)** en vez de añadir las unidades a
  mano. Es una función de la arena («Copiar enlace»), no un atajo, y abre la misma pantalla que
  ve quien juega.
- **Posiciones y estados forzados en el núcleo** (`forzarTurno`, `hex`, `topHp`) en los scripts
  adversariales. No afecta a quien juega: son casos frontera de las reglas, y el flujo real se
  probó aparte en la arena.
- **Copia instrumentada de `capturas.ts`** (en `.cache/qa-debug/`, ignorado por git y ya borrado)
  para diagnosticar `desktop-15`. No tocó el código del proyecto.

## No probado

- **Una batalla en la partida (`pnpm dev`) con estas unidades.** Montarla exige un ejército del
  imperio con tiradores, y el de salida solo trae alabarderos y piqueros. Habría que construir
  moradas y reclutar varios días. La partida usa las mismas `EscenaBatalla`, `ArmaDeLaActiva` y
  `views/panels.ts` que la arena; `escenas.test.ts` lo cubre según el ingeniero.
- **El espectador mirando granadas o armas de fuego.** La partida del arnés no saca unidades del
  imperio. La pasada «espectador» de `capturas` pasa, y `espectador.test.ts` (los campos nuevos
  por el cable, `adaptar.ts` como inversa) está en verde. No lo vi a mano.
- **Un `throw` del agente por el puente MCP real.** Lo cubre el test de contrato, no `pnpm qa`.
- **La culebrina recargando en la pantalla.** El artillero murió antes de su segundo turno en la
  pelea jugada; lo verifiqué en el núcleo (C4).
- **Jugabilidad y equilibrio**: no se prueban (CLAUDE.md).

## Ficheros de esta validación (`qa/`)

- **Scripts**: `adversarial.ts`, `heroe-y-recarga.ts`, `piezas-malas.ts`, `enlace.ts` y
  `arena-playwright.ts`, que se corre así:
  `npx tsx …/qa/arena-playwright.ts http://localhost:<puerto> <fichero con la ruta de enlace.ts> <carpeta>`.
- **Capturas de la arena**: `arena-01` a `arena-11`, del navegador integrado a escala 800×500.
- **Capturas de Playwright**: `pw-01` a `pw-03c`, a 1440×900.
- **Capturas de `desktop-15`**: `capturas-desktop-15-antes-del-dia.png` y `…-3s-despues.png`.

---

# Vuelta 2 (02-11-2026)

## Veredicto: **Hallazgos** — apto con reservas

H1, H2 y H3 están arreglados. Lo he comprobado en el navegador, con dos bandos y desde el
principio de la pelea, no solo con la receta de la vuelta 1. El arco, la ballesta y el arcabuz
en «A distancia» quedan igual que antes o mejor. La diana del disparo diferido es idéntica píxel a
píxel.

Al repasar el criterio 9 entero salen dos cosas que la vuelta 1 no vio, porque dio el espectador
por *no probado*:

- **H4 (importante):** el panel del espectador no dice ni la recarga ni las granadas. Falla la
  letra del criterio 9, «en la partida, la arena y el espectador, el panel de la unidad dice…».
  No lo causa esta vuelta: estaba así desde la implementación.
- **H5 (menor):** con dos granadas solapadas, la segunda tapa la diana y el borde de la primera.

Trabajé solo en el worktree y no arreglé nada. Mi vite (puerto 3295) y el servidor de
espectadores de mentira (3296) quedaron muertos. Comprobé que el 3295 era mío por `ss -ltnp` y
`readlink /proc/<pid>/cwd`, lo maté por su grupo, y `ss` dice «3295 libre» y «3296 libre».

## Comprobaciones (con su porqué)

| Comando | Por qué | Resultado |
|---|---|---|
| `pnpm vitest run test/escenas.test.ts test/granada.test.ts -t "puntero\|borde de la explosión\|propia granada\|alcanza con ella"` | Solo los tests nuevos de H1 (el puntero), H2 (el borde) y H3 (la crónica), para ver que existen y pasan | 6/6 (51 saltados) |
| Typecheck, lint y los cinco ficheros de test del ingeniero | Nada cambió en `src/`, `test/`, `data/` ni `tools/` después de su informe (`find -newer implementacion.md`, vacío) | Los cito: verdes en el mismo árbol. No los repito |
| `qa/vuelta-1.ts` del ingeniero, otra vez, contra mi vite | Regresión de su receta, y comparar la diana del disparo con su «antes» | Las mismas frases que en su «después». La diana del disparo en (11,5) sale **idéntica píxel a píxel** a la de `vuelta-1-h2-granada-en-el-aire-antes.png`: la única diferencia del recorte (1000-1070, 460-520) son las 12 columnas de la izquierda, la figura del elfo que se mueve |
| `qa/vuelta-2.ts` (nuevo), Playwright sin pantalla a 1440×900 | H1, H2 y H3, la barra al pasar rápido, los bordes y las esquinas, y dos granadas a la vez | Salida abajo. Consola: nada |
| `qa/vuelta-2-espectador.ts` (nuevo) | El espectador pintando granadas en el aire (con un workaround, abajo) | Capturas `vuelta-2-espectador-*`. Consola: nada |
| `pnpm qa`, `pnpm banco` y `pnpm capturas` | No los corro: esta vuelta no toca el contrato, el núcleo ni el mapa, y la tarea dice que no | — |

**La pelea de `vuelta-2.ts`.** Arena, semilla 7, con la persona llevando **los dos bandos**: así
se juega a mano el turno del atacante y el del defensor.

- Izquierda (atacante): Granadero (0,4), Ballestero (0,3) y Arcabucero (0,5).
- Derecha (defensor): «Granadero rival» (11,4, una copia con otro nombre para distinguirlo) y
  Arquero élfico (10,3).

## Criterios re-verificados

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| H1 | La barra, al tantear la granada fuera de alcance | ✅ | Ver las tres listas debajo de la tabla. |
| H2 | La diana y el anillo se leen a tamaño normal, en los dos turnos; la diana del disparo, igual | ✅ (y H5) | Turno del atacante: `vuelta-2-h2-dos-granadas-turno-atacante.png`. Turno del defensor: `vuelta-2-h2-dos-granadas-turno-defensor.png`. Las dos granadas, la roja en la esquina (0,0) y la azul en (11,8), con la diana en trazo claro sobre filo oscuro y el borde continuo de su color: a 1440×900 se leen sin ampliar. Las rectas de los disparos van a trazos y no se confunden con el borde. La diana del disparo no cambia (fila de `vuelta-1.ts`, arriba). |
| H3 | La crónica cuando la granada alcanza a quien la lanzó | ✅ | Granada a (1,4), al lado del granadero de (0,4). En la ronda 3, la crónica dice «Granadero se alcanza con su propia granada en (1,4): 18 de daño (−1 armadura), 0 bajas», entre «Granadero → Arcabucero (granada en (1,4)): 19 de daño…» y «Granadero → Ballestero…». No queda ningún «Granadero → Granadero» (`vuelta-2-h3-cronica.png`). |
| 9 | A la vista: panel, tablero para los dos bandos, barra con «¡tuyo!» | ✅ arena · ⚠️/❌ espectador · ⚠️ partida | Ver las tres listas debajo de la tabla. |

**H1, granadero de (0,4), alcance 6:**

- Enemigo fuera de alcance, a 11: «Granadero lanza hasta 6 casillas (su fuerza), y (11,4) está a
  11.» (`vuelta-2-h1-granada-enemigo-fuera.png`).
- El elfo de (10,3), a 11: la misma frase.
- Casilla vacía (8,6), a 9: «…y (8,6) está a 9.» (`vuelta-2-h1-granada-vacia-fuera.png`).
- Frontera: (6,4), a 6, «Lanzarías a (6,4). Hoy no daría a nadie.»; (7,4), a 7, «…y (7,4) está a 7.».
- Su propia casilla: «Granadero no puede lanzar a su propia casilla.».
- La granada del bando derecho sobre (0,4), a 11: «Granadero rival lanza hasta 6 casillas…».

**H1, el arco, la ballesta y el arcabuz en «A distancia»:**

- Sobre el granadero, el arco: «Apuntarías a (0,4). Hoy daría a Granadero. Daño 53…».
- Sobre el granadero rival, la ballesta: «…Hoy daría a Granadero rival. Daño 42…».
- Sobre un aliado, la ballesta: «…Hoy daría a Granadero (¡tuyo!). Daño 42…».
- Sobre el granadero rival, el arcabuz: «…Daño 19…; perfora la armadura.».
- Sobre una casilla vacía: «Apuntarías a (6,7). Hoy no daría a nadie.».
- Sobre su casilla: «Arquero no puede apuntar a su propia casilla.», «Ballestero no puede…» y
  «Arcabucero no puede…». Antes la barra no decía nada: es la mejora que anunció el ingeniero, y
  coincide con el clic.

**Criterio 9:**

- **Arena:**
  - Panel: «A distancia: 2 granadas, alcance 6» → «1 granada» → «0 granadas», y la pastilla
    «Granadas: 2 de 2 / 1 de 2 / 0 de 2» en «En el campo», también en el granadero rival.
  - Tablero: las dos granadas a la vez, teñidas por cuarto, se ven en el turno de cada bando.
  - Barra: «Lanzarías a (0,3). A Ballestero (¡tuyo!): Daño 33 … cuarto 4 … A Granadero (¡tuyo!):
    Daño 18 … cuarto 2».
  - La recarga en el panel ya se vio en la vuelta 1 (`arena-05`, `arena-08`). Esta vuelta no toca
    `estadoADistancia`.
- **Espectador:**
  - El tablero pinta las dos granadas en el aire, roja y azul, con su diana y su borde
    (`vuelta-2-espectador-dos-granadas-esquinas.png`). Tras explotar desaparecen, y el parte dice
    «Explota la granada de Granadero, del atacante en (0,0) y no da a nadie»
    (`…-tras-explotar-esquinas.png`).
  - **El panel no dice las granadas ni la recarga: H4.**
- **Partida:** no probada (ver «No probado»).

## Pasada adversarial de esta vuelta

- **El borde junto al marco y en las esquinas.** Con la granada en la esquina (0,0), en
  (11,8) y en el borde de arriba (8,0), la flor recortada (3 casillas en las esquinas y 5 en el
  borde) lleva su borde continuo, también por el lado del marco. No sale del tablero ni deja
  huecos (`vuelta-2-h2-esquina-*`, `vuelta-2-h2-borde-8-0.png`, `vuelta-2-tanteo-esquina-0-0.png`).
  El tanteo en la esquina, más tenue, también se lee.
- **Dos granadas a la vez, una de cada bando.**
  - Separadas: bien en la arena y en el espectador.
  - **Solapadas** (atacante a (5,4), defensor a (6,4); `vuelta-2-espectador-dos-granadas-solapadas.png`
    y su recorte `…-solapadas-zoom.png`): la diana roja de (5,4) cae en el anillo de la azul. El
    teñido de la azul se pinta encima y la deja **desvaída**, de rosa pálido. El borde rojo
    desaparece bajo la flor azul en la zona compartida. La azul se lee entera. → **H5**.
  - Las dos explotan cada una en el turno de su lanzador y el parte lo cuenta.
- **La barra al pasar rápido de una casilla a otra.** Siete casillas seguidas sin salir del
  tablero, cada una con 3 pasos de ratón y 40 ms de espera: (3,4) → (9,4) → (2,2) → (11,4) →
  (1,1) → (8,6) → (4,4). En las siete, la barra dice lo de **esa** casilla: «Lanzarías…» dentro y
  «…está a 9 / a 11» fuera. En reposo no queda nada viejo.
  - Al salir del tablero por la derecha o al cielo del lienzo, la barra se vacía. Ya no conserva
    el texto anterior, como pasaba en la vuelta 1.
- **La diana del disparo junto a una granada.** La recta azul del elfo cruza la flor de la
  esquina (0,0) y se distingue: a trazos frente al borde continuo
  (`vuelta-2-tanteo-esquina-0-0.png`). Observación sin cambio respecto a antes: la diana **roja**
  de un disparo del atacante sobre una casilla teñida de rojo (la del ballestero en (5,1),
  `vuelta-2-h2-dos-granadas-turno-defensor.png`) se lee mal, igual que la granada antes de H2. La
  decisión de H2 fue no tocar el disparo, así que no lo cuento como hallazgo.

## Hallazgos de la vuelta 2

**H4 — importante. El espectador no dice las granadas que le quedan a cada unidad ni los turnos de recarga.**
- El criterio 9 lo pide literalmente: «en la partida, la arena y el espectador, el panel de la
  unidad dice los turnos de recarga que le faltan y las cargas de granada».
- El panel de batalla del espectador (`batalla`, en `src/client/espectador/paneles.ts:157`) pinta
  cada stack con su nombre y su cuenta, sin `estadoADistancia` (`views/panels.ts:1040`), que es lo
  que usan la partida y la arena.
- Los datos sí llegan: `recargando` y `granadasLanzadas` viajan en el stack, y el tablero los usa.
- Reproducir:
  1. Con vite en marcha, `npx tsx …/qa/vuelta-2-espectador.ts http://localhost:<puerto> <puerto-ws> <carpeta>`.
  2. En `vuelta-2-espectador-dos-granadas-esquinas.png`, la columna «Batalla · ronda 2» dice
     «Granadero 1» sin «Granadas: 1 de 2».
- Lo que esperaba quien mira: saber cuántas granadas le quedan a cada granadero y cuándo vuelve a
  disparar un arcabucero, como en la arena.
- No lo causa esta vuelta. La vuelta 1 dejó el espectador como *no probado* y por eso no salió.

**H5 — menor (legibilidad). Con dos granadas solapadas, la que se pinta después tapa la diana y el borde de la otra.**
- `pintarGranadas` (`render/batalla.ts:682`) pinta cada granada entera (teñido, borde, diana) una
  tras otra. El teñido de la segunda cae encima de la diana y del borde de la primera.
- Reproducir: `vuelta-2-espectador.ts … solapadas` (granadas en (5,4) y (6,4)), o en la arena dos
  granaderos que lancen a casillas vecinas.
- Se ve en `vuelta-2-espectador-solapadas-zoom.png`: la diana roja sale rosa pálido y el borde rojo
  se corta en la zona compartida.
- Lo que esperaba quien juega: ver las dos dianas con la misma fuerza.
- Posible arreglo: pintar primero todos los teñidos y después los bordes y las dianas. Solo es un
  caso raro de dos granadas a la vez.

## Workarounds usados

- **La persona lleva los dos bandos de la arena** («La mueve: tú» en los dos). La arena lo
  permite tal cual, y con un solo bando la IA no garantiza que lance. No afecta a quien juega: es
  la misma pantalla, y la barra con un solo bando se volvió a ver con `vuelta-1.ts` («¡tuyo!»).
- **«Granadero rival»**: una copia del granadero con otro id y otro nombre, metida en el enlace,
  para distinguir los dos en el panel. No cambia ninguna cifra.
- **Un servidor de espectadores de mentira** (`vuelta-2-espectador.ts`). Manda snapshots hechos
  con `construirVista`, la función del servidor, sobre la partida de la semilla 5, con la batalla
  cambiada por granaderos y jugada con `applyAction`. Me salto el director y el agente porque la
  partida del arnés no saca granaderos. El camino `adaptar.ts` → `drawBatalla` → paneles del
  espectador es el real, y el cable lo vigila `espectador.test.ts`. Por eso no creo que oculte
  nada de lo pintado, y H4 sale precisamente por ese camino.

## No probado

- **Una batalla en la partida (`pnpm dev`)** con granaderos o armas de fuego. Sigue el mismo
  motivo que en la vuelta 1: hay que construir y reclutar varios días. Pinta con el mismo
  `drawBatalla`, `EscenaBatalla` y `views/panels.ts` que la arena.
- **Otros tamaños de ventana** (móvil, 4K). Solo probé 1440×900. El grueso de la diana sale de
  `gruesoDelTiro` (mínimo 2,5 px).
- **El espectador contra un servidor de verdad** (`pnpm mirar`): ver los workarounds.
- **El parte del agente**: esta vuelta no lo toca. La frase de H3 es solo del cliente.

## Ficheros de esta vuelta (`qa/`)

- **Scripts**:
  - `vuelta-2.ts`: la arena con los dos bandos;
    `npx tsx …/qa/vuelta-2.ts http://localhost:<puerto> <carpeta>`.
  - `vuelta-2-espectador.ts`: el espectador;
    `… <url> <puerto-ws> <carpeta> [esquinas|solapadas]`.
- **Capturas de la arena**: `vuelta-2-h1-*`, `vuelta-2-h2-*`, `vuelta-2-h3-cronica.png`,
  `vuelta-2-tanteo-esquina-0-0.png`, y `vuelta-2-regresion-granada-en-el-aire.png` (la receta de
  la vuelta 1, otra vez).
- **Capturas del espectador**: `vuelta-2-espectador-*`.

## Vuelta 3 (el coordinador, 02-11-2026)

Los dos hallazgos de la vuelta 2 eran pequeños y los arregló el coordinador sin otra vuelta del ciclo:

- **H4**: la lista de la batalla del espectador (`batalla`, `src/client/espectador/paneles.ts`) pinta
  ahora `estadoADistancia` de cada unidad, como «En el campo» de la partida y la arena.
- **H5**: `pintarGranadas` (`src/client/render/batalla.ts`) tiñe primero todas las granadas y pinta
  después los bordes y las dianas, así que una no tapa a la otra.

Evidencia:

- `qa/vuelta-2-espectador.ts … solapadas`: la lista dice «Granadas: 1 de 2» en los dos granaderos, y
  las dos dianas y los dos bordes se leen enteros (`qa/vuelta-3-espectador-solapadas.png`). Consola:
  nada.
- `pnpm typecheck` y `pnpm lint` salen 0. `test/espectador-paneles.test.ts` y `test/espectador.test.ts`
  (porque cambia el marcado de la lista del espectador y lo que pinta el tablero que él comparte) pasan
  42 de 42.

**Veredicto: Apto.**
