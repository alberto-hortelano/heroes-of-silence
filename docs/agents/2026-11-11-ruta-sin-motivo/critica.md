**REENCUADRADA** — el silencio es solo al señalar (al pulsar ya se dice), y el motivo que se diría hoy nombra lo que la niebla tapa.

# Crítica — ruta-sin-motivo (#336)

## El problema real, en una frase

Al **señalar** (y con el dedo, al primer toque) una casilla sin camino, la barra calla el porqué
que sí da al pulsar. Pasar `porQueNoLlega` tal cual al señalar convertiría en un radar una fuga
que ya existe: el motivo nombra héroes y grupos que quien juega no ve.

## La premisa, afirmación por afirmación

- **«`marcha.ts` 118-119 devuelve `[]` sin motivo cuando no hay camino»: cierto.**
  `src/client/sesion/partida/marcha.ts:118-119`. Pero ese `[]` tiene cuatro significados: sin héroe
  o fuera de turno (`:117`), ya está en la casilla (camino de 0 pasos, `:130` mapea `[]`) y sin
  camino (`:119`). Solo el último pide motivo; el de la propia casilla ya tiene frase al pulsar
  (`:147-149`).
- **«Quien juega no sabe por qué»: a medias.** Al pulsar, `andar` manda el `move_hero`, el núcleo
  lanza `porQueNoLlega` (`src/core/state/marcha.ts:347`) y la barra lo dice
  (`marcha.ts:167-169`). Lo vigila `test/session.test.ts:421-432` («No hay camino hasta (19,4): lo
  cierra la ciudad Torreblanca…»), en verde hoy. Lo que dice `docs/areas/mundos.md` («lo dice al
  pulsar») es cierto. Al señalar, `describirCasilla` (`src/client/partida/mapa/escena.ts:575`)
  devuelve solo «qué hay» (`Castillo (enemigo).`) o la cadena vacía si no hay nada: ahí está el
  silencio. Con el dedo, `pulsar` (`escena.ts:487-493`) enseña ese mismo texto en el primer toque.
- **«…si es la niebla»: falso.** `caminoHasta` no mira la niebla: esquiva solo lo hostil
  (`casillasHostiles`, `src/core/state/marcha.ts:81-98`). Ya lo dijo la crítica de
  `2026-11-11-lugar-inalcanzable` (`critica.md:23`). La niebla no es un motivo posible.
- **«Con el motivo del núcleo»: el motivo del núcleo no pasa por la niebla.** `queLoCierra`
  (`marcha.ts:287-301`) mira `state.heroes` y `state.raiders` enteros. Lo medí (script en el
  scratchpad, no en el repo): `planDeNodos`, el jugador 1 en (24,4), dos héroes del 0 en (11,2) y
  (11,6), sin guarniciones. `heroesALaVista` del jugador 1 da `[]` y `porQueNoLlega(…, (8,4))` dice
  «lo cierran el héroe rival Aldo de Valdeluz en (11,2) y el héroe rival Otro Rival en (11,6)».
  `muroBlocker` (`src/core/map/recinto.ts:527-540`) nombra además la ciudad y sus puertas aunque la
  casilla esté sin explorar. Hoy esto ya pasa al pulsar, y al agente le llega igual: el rechazo del
  `move_hero` es `mensajeDe(err)` (`src/server/director.ts:477`), y el agente promete que «todo
  pasa por la niebla» (`CLAUDE.md`, «El agente»). El cliente sí lo cuida en la ruta: solo avisan los
  grupos a la vista (`marcha.ts:120-127`, «o la ruta le contaría lo que tapa la niebla») y la barra
  no dice nada bajo la niebla (`escena.ts:545-547`).

## El día después

- **Para quien juega**: al pasar el ratón sobre un destino cerrado lee quién lo cierra antes de
  gastar el clic, y con el dedo, en el primer toque.
- **Si se hace tal cual, se vuelve más fácil hacer trampa**: barrer el mapa con el ratón localiza
  al rival en la niebla, casilla por casilla, sin pulsar. Es la regla que #64 y la niebla de eventos
  (02-11-2026) quitaron del lienzo y de la barra.
- **Lo más frecuente que se señala sin camino es una barrera.** Para un grupo que no se infiltra,
  cada montaña o cada agua diría «No hay camino hasta (x,y) sin cruzar una barrera: solo la cruza un
  grupo que se infiltra, y no se infiltra: no lo llevan su tipo…» (`marcha.ts:263-268`; lo fija
  `test/game.test.ts:1686`). Es verdad, pero es largo y sale en cada casilla del relieve. Qué se dice
  ahí lo decide el arquitecto. Que pase, sí hay que verlo en el navegador.
- **Coste**: `porQueNoLlega` lanza 2 + N Dijkstras, uno por hostil de delante (`marcha.ts:260-275`).
  Al señalar se pide una vez por casilla (`claveRuta`, `escena.ts:435-438`). `ruta()` lo llaman
  también `rutaQueQueda` (`escena.ts:348`) y `pulsar` (`escena.ts:502`), que no necesitan el motivo.
- **Decisiones de `CLAUDE.md`**: «un hecho, un sitio». La frase de señalar y la de pulsar tienen
  que ser la misma.

## Conflictos

- **Las tareas en paralelo no tocan estos ficheros.** #303 toca `render/mapa/sitios-sabidos.ts` y
  `espectador/adaptar.ts`. #340, otros motivos (`problemasDeLosPueblos`, `recruitBlocker`). #335,
  `vestir-la-red.ts`. #341, la batalla. #334 y #338, el `battle_turn` del contrato, no el
  `move_hero`. Si se tapa la fuga en el núcleo cambia el texto que lee el agente en un `move_hero`
  rechazado, y eso no lo toca nadie más de la tanda.
- **Del backlog**: #299 (la ruta del infiltrado, en el Dijkstra de `marcha.ts`) y #298 (el rival que
  se infiltra, en `knownMap`) andan cerca, pero no chocan. Ninguno está en esta tanda.
- **Contradicción**: ninguna con lo decidido. La fuga contradice la regla de la niebla, no al revés.

## Coste contra valor

Es pequeño: una frase en la barra y un filtro de lo que se ve. Sin la fuga, el valor sería modesto,
porque el clic ya lo dice y no hacerlo nunca sería aceptable. Con la fuga, **no hacerlo es mejor
que hacerlo tal cual**: el issue pide la versión que empeora una regla. Hecho con la niebla, de paso
arregla la fuga que ya hay al pulsar y en el agente. Eso vale más que el silencio que pide quitar.

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Encuadre del crítico** (sustituye a «Los del issue, tal cual»):
> 1. Al señalar una casilla a la que el héroe elegido no tiene camino, y con el dedo al primer
>    toque, la barra dice por qué. Es la misma frase que da el núcleo al pulsar (un hecho, un
>    sitio). No la lleva el `[]` de sin héroe, fuera de turno ni de su propia casilla.
> 2. **El motivo pasa por la niebla**, al señalar, al pulsar y en el rechazo del `move_hero` del
>    agente. No nombra un héroe ni un grupo de asaltantes que quien lo lee no ve ahora
>    (`heroesALaVista`, `asaltantesALaVista`), ni una ciudad o sus puertas en una casilla sin
>    explorar. Lo hostil que no se ve no se calla como «sin camino» a secas si eso miente: la frase
>    dice que algo cierra el paso sin decir qué ni dónde. Test visto morder con un rival en la
>    niebla, en el caso de `planDeNodos` del crítico.
> 3. Lo que se dice al señalar una casilla de barrera se ve en el navegador (Playwright sin
>    pantalla), con la barra estrecha incluida (`ponerEnLaBarra`). El motivo no se calcula en las
>    llamadas a la ruta que no lo enseñan (`rutaQueQueda`, `pulsar`).
> 4. `pnpm qa` si cambia el texto que lee el agente. `pnpm banco` igual: no cambia ninguna partida.
> 5. La niebla no es un motivo: `caminoHasta` no la mira. El issue la nombra por error.
