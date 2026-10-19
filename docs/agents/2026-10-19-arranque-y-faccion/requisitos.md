# Arranque: menú, facción, tema y héroe en la base

## Petición literal (19-10-2026)

> Vamos a empezar a afinar el juego desde el principio. Primera pantalla, nuevo juego, cargar juego
> o partida rapida. De momento no habra juegos que cargar y los que haya no nos interesan, estamos
> en pleno desarrollo y no queremos compatibilidad, si un juego antiguo no funciona se tira y punto.
> En nuevo juego lo primero es elegir la faccion. Se aplica el tema de la faccion elegida. Un heroe
> de la faccion elegida. Empieza en la base.

(La petición sigue con un motor de narrativa —tramas, personajes con objetivos, mundo vivo—: es la
fase 2, **fuera de esta tarea**. El plan general está en
`/home/al/.claude/plans/vamos-a-empezar-a-declarative-sonnet.md`.)

Decisiones del usuario en la conversación:
- «Empieza en la base» = el héroe nace **dentro** de su base en el mapa **y** la partida abre en la
  **base caminable** (`escenas/castillo.ts`) con él paseando; al salir, el mapa de aventura.
- El tema: **rescatar la rama sin fusionar `claude/army-game-theme-ui-28d2ad`** (cinco temas de
  interfaz con piezas de Codex, fuentes OFL, `temas.ts`/`temas.css`), hecha sobre el modelo viejo
  (caballeros y nigromantes como partida de siempre, `FACCION_DE_LA_ARENA`) y 54 commits por detrás
  de main. Se trae **fichero a fichero** y se adapta a las cinco facciones de main; no se fusiona la
  rama.
- «Cargar partida» va **desactivado** (no hay guardado; no se implementa).
- «Partida rápida» = facción al azar y directo a la partida.

## Criterios de aceptación

1. `pnpm dev` en `/` sin parámetros enseña una **pantalla inicial** con tres opciones: «Nuevo juego»,
   «Cargar partida» y «Partida rápida». No se monta la partida (ni el mapa ni su Worker del suelo)
   hasta elegir.
2. «Cargar partida» está desactivado y dice por qué («aún no hay partidas guardadas», o parecido),
   con el foco y el teclado coherentes (no se activa con Intro).
3. «Nuevo juego» abre la **elección de facción**: las cinco de `FACTION_IDS` (templarios, no muertos,
   imperio, elfos, orkos), cada una con su nombre y su rasgo de una línea. Elegir una y confirmar
   empieza la partida con esa facción para el jugador 0 (humano).
4. Al elegir (y ya al pasar/enfocar una en la elección) se aplica **el tema de esa facción** a la
   interfaz; durante la partida el tema es el de la facción del jugador. La pantalla inicial va con
   un tema neutro (o el de la rama, si lo trae).
5. El rival (jugador 1, IA) es **otra** de las cinco facciones, sorteada desde la semilla con su
   propia corriente; una sola función decide las dos facciones a partir de la del jugador.
6. El jugador empieza con **un héroe de su facción**, **dentro de su base** en el mapa (en la casilla
   del castillo, no al lado). El héroe de la IA, igual en la suya.
7. Al empezar, la partida **abre en la base caminable** del jugador con su héroe paseando; salir de
   la base lleva al mapa de aventura, donde el héroe está en su castillo y puede salir a jugar
   normalmente (moverse, entrar de nuevo, etc.).
8. «Partida rápida» empieza una partida con facción al azar (y semilla al azar) sin pasar por la
   elección; también abre en la base.
9. La URL reproduce la partida: tras empezar, la URL lleva `?seed=N&faccion=<id>`; abrir esa URL
   entra directa (sin menú) en la misma partida. Una `faccion` que no existe se rechaza diciéndolo
   (fail-loud, como `parseSeed`). «Reiniciar» (la acción `restart` de hoy) vuelve al menú o empieza
   otra con la misma facción —decide el arquitecto, dicho—.
10. El arena y el espectador siguen funcionando; si la rama traía el selector de tema en la arena,
    puede venir, pero no es requisito.
11. `pnpm verify` verde, `pnpm banco` re-anclado con la forma del diff explicada (cambia el inicio
    del héroe), `barrido-semillas.ts` con 0 partidas sin terminar, `pnpm capturas` verde e
    incluyendo el menú, la elección y la base con tema.

## Fuera de alcance

- Guardar y cargar partidas.
- Todo lo de narrativa (fase 2): tramas, personajes, narrador, panel de historia.
- Equilibrio por facción.
- Arte nuevo (fal.ai/Codex): solo se trae el que ya hizo la rama. Gasto en fal.ai: 0.
- Rehacer las piezas de tema de la rama: se adaptan, no se regeneran.

## Contexto

- Hoy `Session` (`src/client/session.ts:863`) hace `newGame({ seed, controllers: {0:'human',1:'ai'} })`
  sin facciones; `newGame` ya acepta `factions` (`src/core/state/setup.ts:53`) y por defecto usa
  `faccionesDeLaSemilla(seed)` (l.61). `main.ts:78` abre la partida al cargar; `restart` (l.573)
  abre otra con semilla al azar.
- El inicio del héroe está en `src/core/map/generate.ts:~2200` (`inicio(b, casa)`: casilla vecina
  libre de la región de casa). Con el héroe dentro, la base la defiende él con su tropa (regla ya
  existente). Mirar qué supone para el generador, la puerta de la ciudad (`puertasDe`) y el
  pathfinding salir desde el nodo de la ciudad.
- La rama de temas: `f02c3676` (temas, piezas, fuentes, `src/core/facciones.ts` con `parseFaccion`,
  `faccionesConLaDe`, `FACCIONES_DE_SIEMPRE`; `?faccion=` y selector «Ejército»), `98631810` (quita
  figuras de los márgenes), `f55e9408` (docs: requisitos/QA de esa tarea, útiles como historia).
  Ojo a conflictos en `setup.ts`, `session.ts`, `core/arena.ts`, `style.css`, `views/panels.ts`,
  `render/*`.
- Memoria del proyecto: sin compatibilidad hacia atrás; el usuario no abre nada en worktrees: al
  final se le levanta `pnpm dev` en otro puerto y se le pasa la URL; presupuesto de pruebas (tests
  caros una vez al cerrar); Playwright, nunca el Chrome del usuario.

## Preguntas abiertas (con suposición por defecto)

- ¿El menú es una página aparte o un estado de `/`? → Un estado de la misma página `/`, antes de
  crear la `Session`.
- ¿La elección enseña algo más que nombre y rasgo (héroe inicial, unidades)? → Nombre, rasgo y el
  nombre del héroe con que se empieza; nada más.
- ¿Escape en la base al empezar lleva al mapa? → Lo que haga hoy la base caminable para salir.

## Visto bueno del plan (19-10-2026)

El usuario aprueba `plan.md` tal cual: el héroe nace dentro de su base **sin recoger la guarnición**,
se retira `MapPlan.heroStarts`, y se acepta que no muertos, imperio, elfos y orkos abran en una base
con marcadores (sin arte de base todavía).
