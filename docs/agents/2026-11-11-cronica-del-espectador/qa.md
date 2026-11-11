# QA: cronica-del-espectador (#202)

Código validado: worktree `agent-a632a1afa9707deec`, rama `worktree-agent-a632a1afa9707deec`, commit
`9329a743`. No cambié nada en ese código. Los criterios que valen son los de «Tras la crítica» y «Tras
el plan» de `requisitos.md`. Las capturas están en `capturas/`, y los guiones que usé, en el scratchpad
de la sesión de QA. No los dejo en el repo porque son de usar y tirar.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | En el espectador, ninguna línea lleva color: tampoco la caída de un héroe ni su vuelta a la base | ✅ cumple | **Espectador real**: `pnpm partida` en los puertos 19880/19881 y 19890/19891, con `HEROES_WAIT_AGENT_MS=0`, y `/espectador/?puerto=…` en Chromium sin pantalla, a 1920 y a 380 px. Probé cuatro partidas: la semilla por defecto y las semillas 7, 31 y 8. En las 4×2 páginas, todas las líneas son `<div>` sin clase y tienen el mismo color computado que `.log` (`rgb(170,180,159)`). En la semilla 8 sale el caso del issue: «Ha caído un héroe del jugador 1 en (30, 33)», en neutro (`capturas/espectador-semilla-8-1920-cronica.png`). **Barrido**: 40 partidas IA contra IA (semillas 1-40) dan 3 052 líneas pintadas con `NADIE`, entre ellas 107 `hero_defeated` y 105 `hero_returned`, y ninguna lleva `win` ni `lose`. Con bando (viewer 0 y 1), todas las `hero_defeated` y `hero_returned` conservan su color. |
| 2a | «Un ${unidad}» de `hero_promoted` y `troop_rank_up` concuerda con un nombre femenino | ✅ cumple | En el navegador sale «Tu Orko con hacha y escudo sube a rango 2 de veteranía» (semilla 5, 380 px) y, en el espectador, «El jugador 1: su Esqueleto arquero sube a rango 3 de veteranía» (semilla 8). El barrido de 40 partidas no da ningún «Un Sacerdotisa», «Sacerdotisa tuyo» ni «Sacerdotisa veterano». En esas partidas no se promovió ninguna Sacerdotisa: el caso femenino lo cubre el test del ingeniero (`test/cronica.test.ts`), que él vio morder. |
| 2b | El doble número («pierde el jugador 1 2 × …») ya no se lee como un solo número | ✅ cumple | En el espectador real, «pierde el jugador 0: 5 × Tamplario» y «pierde el jugador 1: 2 × Esqueleto guerrero, 1 × Zombie». En la partida, «pierde el enemigo: 2 × Alabardero». Ni en el navegador ni en el barrido (3 052 líneas del espectador y 4 109 botones) casa ninguna línea con `/jugador \d+\s+\d\|enemigo\s+\d\|monstruo\s+\d\|guarnición\s+\d\|asaltantes\s+\d/`. |
| 3a | En la partida, la línea con casilla lleva la cámara a esa casilla | ✅ cumple a 1920 px; ❌ a 380 px no se ve (H1) | A 1920×1080 (semilla 1) leo la cámara por el rectángulo del minimapa. Para cada línea pulsada arrastro antes la vista lejos. Tras pulsar «El jugador 1 toma el pueblo de El Soto» (8,14), el centro pasa de (16,6, 12,8) a (10,6, 14,5): «y» queda centrada y «x» la acota el borde. Con «Licenciados 1 × Arquero» (5,12), con el héroe ya en otra casilla, y con «El jugador 1 te ha capturado un castillo» (5,8), la casilla queda dentro de la vista en todos los casos. Lo comprobé también con la **partida ya terminada** («Partida perdida»): las líneas siguen llevando a su casilla. Captura: `capturas/1920-s1/pulsada-*.png`. Con Enter el resultado es el mismo y el foco se queda en la línea. |
| 3b | La línea pulsable no dice «en (x, y)»; el espectador sí la dice | ✅ cumple | Ningún botón del navegador ni de los 4 109 del barrido contiene `(` seguido de una cifra. Todas las líneas del espectador la dicen («… en (30, 33)»). |
| 3c | La línea-botón se lee como texto, con cualquier tema | ✅ cumple | Lo comprobé con los cinco temas (`capturas/temas/tema-*.png`). Comparado con una línea `<div>`, el botón da lo mismo en fondo, imagen de fondo, borde, `border-image`, sombra, radio, alto de línea (18,6 px), letra, `text-transform`, `letter-spacing`, `text-shadow`, relleno y `::before`/`::after`. Al pasar el ratón solo cambia el subrayado (`*-hover.png`). Con Tab, el foco se ve con un contorno de 2 px del color del tema (`*-foco.png`). La consola está limpia. |
| 3d | No tapa nada | ✅ cumple | A 1920 px, la batalla larga se parte en varias líneas dentro de la caja y nada se sale de ella (`scrollWidth ≤ clientWidth` en todas las líneas). A 380 px tampoco se sale nada. |
| 3e | Niebla: la crónica no lleva a una casilla oculta | ✅ cumple | En el barrido, para cada jugador recorrí `cronicaPara` y pinté con `llevaALaCasilla` y `sitioDe`. Ninguno de los 4 109 botones lleva a una casilla que ese jugador no haya explorado nunca. `raider_dispersed` sale siempre como `<div>` sin `data-x`, y hay botón si y solo si `at !== null`. |
| 4 | Tests de `renderLog` con `NADIE` sobre todas las ramas; navegador para el punto 3 | ✅ cumple | Los cito sin repetirlos: el ingeniero los dejó en verde sobre `9329a743` (9 ficheros, 201 tests). `UNO_DE_CADA` obliga por tipo a cubrir todos los `kind`. |

## Hallazgos

**H1, importante. En el móvil, tocar una línea de la crónica no hace nada visible.** A 760 px o menos
de ancho, el lateral queda debajo del mapa y `#stage` se desplaza. Al tocar la línea, la cámara sí se
mueve, pero el mapa está fuera de la pantalla: la página no sube hasta él, así que quien juega toca y
no pasa nada.

Pasos para reproducirlo:
1. Abre la partida a 380×800 con `isMobile`: `?seed=5&faccion=orkos&heroe=<el de por defecto>&clima=despejado,dia`.
2. Pulsa «Salir» de la base y licencia uno de la tropa.
3. Toca el minimapa abajo a la derecha. La vista se centra en (37,5, 37,5).
4. Baja hasta la crónica y toca «Licenciados 1 × Orko con hacha y escudo».

El centro de la vista pasa a (11,5, 5,5), pero el mapa sigue sin estar a la vista (0 % del lienzo en
pantalla, `#stage.scrollTop = 1197`; `capturas/380-s5/movil-tras-tocar.png`). Quien juega espera ver
la casilla. Una salida es que, si el mapa no está a la vista, se haga `scrollIntoView` del marco del
mapa. Otra es que en el móvil la línea no sea botón. A 1920 px no pasa.

**H2, menor. El blanco táctil es pequeño en el móvil.** Cada línea-botón mide 18,6 px de alto y van
pegadas unas a otras. Con `@media (max-width: 760px)`, los demás botones del móvil tienen 44 px de
mínimo (`.map-tools button`, `#actions button`), y el riesgo es tocar la línea de al lado. Es un coste
de que la línea se lea como texto, que es lo que se pidió. Lo apunto, sin más.

Fuera del alcance de esta tarea y anteriores a ella: en las partidas vistas sale «Tamplario» como
nombre de unidad, junto a «Caballero templario», en `data/unidades.json`. Puede ser una errata del
catálogo. También sale «El jugador 1 defiende con 6 individuos y deja fuera 1», donde «1» va sin
sustantivo.

## Workarounds usados

- **Leer la cámara.** Envolví `CanvasRenderingContext2D.prototype.strokeRect` y `arc` con un
  `addInitScript` para leer el rectángulo de la vista y los héroes del minimapa. Solo leen y llaman a
  la original, así que no cambian lo que se pinta. No afecta a quien juega.
- **`window.__name = (f) => f`.** Lo necesita el `page.evaluate` de tsx/esbuild en mi guion. Es del
  arnés, no del juego.
- **El servidor sin agente.** Lo arranqué con `HEROES_WAIT_AGENT_MS=0`, que hace jugar a la IA de
  reglas, y abrí el espectador con `?puerto=` porque usé puertos no habituales. Las dos cosas son
  flujos documentados. Como el espectador solo recibe los últimos 40 hechos (`vista-espectador.ts`),
  elegí semillas que acaban con una caída cerca del final. No es estado falseado.
- Cuando el rival atacó en la semilla 1 (día 3) y en la semilla 5, pulsé «Resolver sola», que es lo
  que haría quien juega.

## No probado

- **Pulsar una línea durante el turno del rival o mientras el héroe anda.** El plan dice que
  `hastaQueLlegue` se come ese clic, igual que el de cualquier botón. No lo forcé.
- **El espectador a mitad de partida.** Lo vi siempre con la partida acabada, porque el servidor
  juega en segundos sin agente. Las líneas que salen son las mismas, pero no vi el repintado con la
  partida en curso.
- **«Sacerdotisa» en una partida de verdad.** Solo la cubre el test, porque ninguna partida del
  barrido la promovió.
- **`pnpm qa`.** No hacía falta: el cambio no toca `src/server/` ni el contrato. Tampoco corrí `pnpm
  capturas`, que pasa el coordinador.

Los servidores y los vite que arranqué los paré por su grupo. Comprobé con `ss -ltnp` que los puertos
19880/19881/19890/19891 quedaron libres y que no quedó ningún vite mío.

## Veredicto

**Apto con reservas.** El color del espectador, la concordancia, el doble número, la línea que lleva
a su casilla a 1920 px con los cinco temas y la niebla cumplen lo pedido, con evidencia en el
navegador real y en 40 partidas. La reserva es H1: en el móvil, tocar la línea mueve una cámara que
está fuera de la pantalla y quien juega no ve respuesta. Conviene arreglarlo antes de cerrar #202, o
abrirlo como issue aparte si el coordinador prefiere cerrar esta tanda.
