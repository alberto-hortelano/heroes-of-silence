# QA — niebla por regiones y niebla de eventos

Rama `claude/mapa-niebla-regiones-cb8907`, sin commitear, sobre `3d6922d9`. 02-11-2026.

Petición: «Haz que la niebla del mapa no visto vaya por regiones. Al entrar en una región se
muestra entera. Añada una niebla de eventos en torno a héroes y nodos controlados por el jugador.
Lo que pase cerca en un radio x se ve. Si no, no.» Lo que decidió el usuario: radio 5 para el héroe
y 6 para castillos y nodos propios (cuadrado); se explora al pisar la región o su paso; al empezar,
las de la base; lo que se ve ahora = radio ∩ explorado; un grupo de asaltantes, solo dentro del radio.

Evidencia en `.cache/qa-niebla/` (ignorado por git): capturas `r0*`, `s1-*`, `n*` (y sus
`-entero` / `-mascara`), los registros `capturas*.log`; las capturas de `pnpm capturas` están en
`.cache/qa-niebla/capturas/`. Los guiones: `.cache/qa-niebla/jugar.ts` y `jugar2.ts` (Playwright
sin pantalla, vite propio en su grupo con `arrancarVite` / `matarGrupo`; los puertos 34275, 43775,
33661, 35127, 35617 y 39473 quedaron libres) y, fuera del repo, `adv1.mts`, `adv2.mts` y `adv3.mts`
en el scratchpad de la sesión (el núcleo con la IA de reglas).

## Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| Lo no visto va por regiones: el negro sigue el borde de las regiones, no un cuadrado | ✅ | `s1-01-inicio.png`, `r02-rapida-lejos.png` (partida rápida desde `/`, semilla 49468): el negro corta por las cordilleras y el río, y el minimapa enseña la forma de las regiones. En el núcleo, ninguna casilla de una región descubierta queda en negro: 0 en las semillas 1-40 al empezar (los dos jugadores) y 0 en 30 partidas de la IA (semillas 1-30, hasta 20 días, mirado tras cada turno) (`adv1`, `huecos: 0`) |
| Al entrar en una región se ve entera | ✅ | `?seed=1`: el héroe anda con clics reales hasta el nodo (13,7), que une las regiones 0 y 9; lo explorado pasa de 264 a 462 casillas (la región 9 son 209) y la región aparece entera con la ciudad neutral de su borde (`s1-03-en-el-nodo.png`, `s1-05-lejos.png`). En las 30 partidas de la IA, toda región que pisa un héroe, o que une el paso donde está, está descubierta |
| Sobre un paso (nodo, ciudad, puente de una ciudad-puente) se descubren todas las regiones que une | ✅ | 49 ciudades-puente en 1-40: su puente descubre las regiones de su ciudad y está en la zona de todas (49 de 49, `adv1`) |
| Al empezar, las regiones de la base | ✅ | `test/niebla-por-regiones.test.ts` 8/8 (corrido aquí), y `adv1` en 1-40 |
| No se descubre nada de una región no pisada | ⚠️ casi | Solo casillas de recinto y de puente: al empezar, en 1-40, 155 casillas de recinto y 18 de puente de regiones sin descubrir, entre 2 y 7 por jugador (`adv2`). Es la regla del plan (el recinto entero va con su ciudad): H3 |
| Niebla de eventos en torno a los héroes (radio 5) | ✅ | `visibleNow` ⊆ `fog` en todas las comprobaciones de `adv1` (0 fuera); un héroe rival dentro del radio y sin explorar no se ve (lo prueba `niebla-por-regiones.test.ts`; en las 30 partidas no pasó solo ninguna vez, 0 casos) |
| …y en torno a los nodos propios (radio 6) | ✅ / ❌ | Mirar, sí: con el héroe de vuelta en su base (6,7) el día 2, el nodo tomado (13,7) mira solo (13,1) y (19,7); en la página, la parte sin sombra es la unión de los cuadrados del castillo, el nodo y el héroe (`n3-vuelta-lejos.png` frente a `n3-vuelta-lejos-entero.png`; brillo medido: lo que no se mira, 0,58-0,67 del de «Ver mapa entero»; lo mirado, 1,0; lo no explorado, 0,17). **Que te quiten el nodo, no se ve**: H1 |
| Lo que pasa cerca se ve; lo que no, no (la crónica y el `knownMap` del agente, coherentes con el lienzo) | ✅ | `adv1`, en todas las comprobaciones: `knownMap.terrain` no nulo ⇔ `fog` (0 distintos), `raiders` y héroes enemigos a la vista ⊆ `visibleNow` (0). `pnpm qa`: termina la partida, «asaltantes: 2 grupos vistos en el knownMap», «casillas exploradas por el agente: 663» |
| Asaltantes, solo dentro del radio | ✅ | `asaltantesALaVista` filtra por casilla mirada; `adv1` 0 fuera; la pasada «emboscada» de `pnpm capturas` (semilla 39) pinta el grupo dentro del radio y la ruta avisa (`capturas/emboscada-01-ruta-avisada.png`) |
| La barra sobre lo no explorado | ✅ | Sobre (9,12), en negro: «Tierras desconocidas.» (`jugar.ts`) |
| Sin errores en consola | ✅ | 0 en los seis arranques de `jugar*.ts` (menú → partida rápida → ayuntamiento → mapa; `?seed=1` → contratar → mapa → andar → pasar el día → volver) |
| `pnpm capturas` | ❌ | Sale 1 en la pasada «escritorio» (desktop-15). En HEAD la misma pasada sale 0: H2 |
| Tipos, lint, tests, banco, barrido | ✅ | `pnpm typecheck` limpio; `pnpm lint` 0 errores (10 infos de antes); `niebla-por-regiones.test.ts` 8/8; `session.test.ts` 39/40, y el fallo («cuando golpean a la persona, elige su respuesta sin ver el golpe») **sale igual en HEAD** `3d6922d9`, en un worktree limpio (comprobado); `pnpm banco` `732e11ca…`, el ancla, «igual», 0/20 sin terminar; `barrido-semillas.ts` 0/4 |

Por qué cada prueba: `typecheck` y `lint`, porque cambia código; `niebla-por-regiones.test.ts`, porque
es lo nuevo; `session.test.ts`, para comprobar que el fallo es de HEAD; `pnpm qa`, porque cambia la
prosa del contrato y la visión del agente; `banco` y el barrido, porque la IA lee la visión. Los demás
ficheros que listó el ingeniero no se han vuelto a correr: el árbol es el mismo y se citan de
`implementacion.md`.

## Hallazgos

### H1 · importante — Que te quiten un nodo no se ve, aunque pasa en tu propio nodo

Quien juega ve al héroe rival pisar su nodo y, en el mismo paso, deja de verlo: la crónica no dice
que se lo han tomado y el mapa le sigue pintando el nodo como suyo hasta que un héroe o un castillo
suyo vuelva a mirarlo. La petición pide que lo que pase cerca de un nodo controlado se vea, y esto
pasa a distancia 0 de uno.

- Por qué: `captureNode` (`src/core/state/game.ts`) cambia el dueño y llama a `revealAroundNode`
  **antes** del `emit`. Así, cuando se sella el hecho, el dueño de antes ya no mira desde ese nodo, y
  `visibleTo` (`events.ts`) no tiene para `node_captured` la excepción de `e.from` que sí tiene
  `town_captured`. El comentario de `captureNode` dice «es el dato con el que su dueño de ayer se
  entera», y no se entera.
- Medido (`adv2`, semillas 1-30, IA contra IA, hasta 20 días): 87 nodos quitados a un jugador; en
  **87 de 87** su dueño vio el `hero_moved` del rival sobre el nodo, y en **53** no vio el
  `node_captured`. En 63, justo después, su `memory` le seguía dando el nodo como suyo.
- Cómo repetirlo (`adv3`): `newGame({ seed: 5, maxDays: 20 })` y `playAiTurn` hasta el día 2.
  `node-6` (21,21) pasa de j0 a j1; el `hero_moved` a (21,21) tiene `seen [0,1]` y el
  `node_captured` tiene `seen [1]`. `objetosConocidos(st, 0, visibleNow(st, 0))` dice dueño 0 (visto
  el día 1) hasta el día 3, cuando un héroe de j0 lo vuelve a mirar.
- Qué espera quien juega: «Te han tomado el paso de (21,21)», o al menos ver el nodo cambiar de
  bandera, ya que veía al rival llegar. Antes de este cambio pasaba lo mismo, pero entonces un nodo
  no miraba y no prometía nada. Hay que decidir si la crónica lo cuenta (como con un castillo) o si
  se sella antes de cambiar el dueño.

### H2 · importante — `pnpm capturas` sale 1 por la nueva regla: la pasada «escritorio» no encuentra un asaltante que se mueva

- `pnpm capturas .cache/qa-niebla/capturas` (una vez, ~4 min):
  `Error: desktop-15: en cuatro días ningún asaltante a la vista se ha movido`
  (`tools/qa/capturas.ts:2892`, `patrullaALaVista`). Registro: `.cache/qa-niebla/capturas.log`.
- En HEAD, `CAPTURAS_SOLO=escritorio` sale 0 (`capturas-head-escritorio.log`): «raider-4 pasa de
  (8,12) a (8,13)».
- La diferencia: `buscarEscritorio` (`tools/qa/escenas-de-capturas.ts`) elige la semilla por lo
  explorado (la ruta de dos colores). Con la exploración por regiones elige la **22** (en HEAD era la
  **47**), y en ella, con la vista por casilla, ningún grupo a la vista se mueve entre dos días, ni
  siquiera tras «Ver mapa entero». El arnés sigue suponiendo la regla de #130 (el comentario de
  `capturas.ts:2822` dice «basta su región, #130»). Es del arnés, no del juego, pero deja `capturas`
  en rojo.
- Como el error corta la ejecución, las pasadas siguientes no corrieron. Las lancé aparte con
  `CAPTURAS_SOLO` (`capturas-resto.log`): emboscada, perdida, veteranos, movil, tactil, sin-arte,
  tropa, morada, base-anchos, espectador y arena **pasan**; «edicion» falla
  (`[data-arena="ir-a-edicion"]` no visible), y **falla igual en HEAD**
  (`capturas-head-edicion.log`): es de antes y es de la arena, que no tiene niebla. Equipo, poderes,
  rueda-del-golpe, armas y rueda-contrincantes no corrieron.

### H3 · menor — Se ven unas casillas de una región que no se ha pisado: las del recinto y el puente

El recinto 3 × 3 de una ciudad de una región explorada entra en casillas de la región de al lado, y
el puente de una ciudad-puente es una casilla de la otra orilla. Al empezar, entre 2 y 7 casillas por
jugador en 1-40 (`adv2`: 155 de recinto y 18 de puente en total); en s1, (18,6) de la región 9 y
(20,6) de la región 2. Es lo que pide el plan («el recinto entero va con su ciudad»), y lo que se ve
es la muralla de esa ciudad, no el terreno de la región. Se dice para que conste.

### H4 · menor — Parado en una puerta de una ciudad se descubre una sola región, no todas las que une la ciudad

`regionesQueDescubre` mira el nodo solo en la casilla de la ciudad. Las otras ocho casillas de su
recinto (puertas incluidas) dan la región más cercana: 1648 de 1648 en las ciudades de 1-40 dan menos
regiones que su ciudad. Importa poco, porque quien llega a una puerta viene de la región de esa puerta
y la ciudad está a un paso. Pero la petición dice que el castillo es un paso.

### H5 · menor (legibilidad, ya estaba) — La sombra de «no mirado» cuesta verla al tope de alejar

La sombra existe: lo que no se mira queda a 0,58-0,67 del brillo de lo mirado (`n3-*`). Pero en la
lava, de noche o con lluvia (`r02-rapida-lejos.png`) se confunde con el tono del suelo. Ahora es lo
único que le dice a quien juega dónde puede ver un rival o un grupo, y por eso pesa más que antes. El
cambio no la tocó (`mascaraDeNiebla`, `rgba(8,13,22,0.42)`).

## Lo que no es hallazgo
- La IA de reglas olvida un grupo que se va de la casilla donde lo vio (lo dice
  `implementacion.md`). Es jugabilidad y no se evalúa.
- Te puede emboscar un grupo que no veías: lo aceptó el usuario.

## Workarounds usados
- **El espejo** (`Session` del núcleo con la misma semilla) para saber dónde clicar y qué hay en
  cada casilla. En la página todo se hizo con clics, la rueda y las teclas de verdad (Espacio y luego
  Intro para el aviso de fin de turno); el espejo no tocó la página. Veredicto: no afecta a quien
  juega.
- **«Ver mapa entero»** solo para medir la sombra: se pulsa, se toma la segunda imagen y se vuelve a
  pulsar. No hizo falta para ver nada de la feature. Veredicto: no afecta.
- **`?seed=1` en la URL** además del menú, para que se pueda repetir. El arranque desde `/` con
  «Partida rápida» se jugó aparte (`r01`, `r02`) y abre igual. Veredicto: no afecta.
- **Las comprobaciones adversariales en el núcleo** (`adv*.mts`, partidas de la IA) y no en la
  página: las regiones partidas, las ciudades-puente y los nodos quitados se cuentan mejor así. Lo
  visible se comprobó en la página con `?seed=1`.

## No probado
- En el navegador, un héroe rival dentro del radio y tras una barrera de una región sin explorar: no
  salió jugando, y en 30 partidas de la IA no pasó ni una vez. Solo lo cubre el test con el estado
  puesto a mano (`niebla-por-regiones.test.ts`).
- El agente jugando en vivo más allá de `pnpm qa`.
- Las pasadas de `capturas` posteriores a «edicion» (son de la arena, sin niebla).
- La niebla con mundo (`?mundo=`), con sus lugares.

## Veredicto

**Apto con reservas.** Lo pedido se cumple: el negro va por regiones, una región se descubre entera
al pisarla o al pisar su paso, y lo que se ve ahora es el radio sobre lo explorado, con los nodos
propios mirando y los grupos solo de cerca. La crónica, el `knownMap` y el lienzo coinciden. Las
reservas son dos:
- H1: quitarte un nodo pasa en tu nodo y no te enteras. Lo tiene que decidir el usuario.
- H2: `pnpm capturas` sale 1 porque el arnés aún supone la regla de #130.
