# Crítica — Infiltrados, fase A

**Veredicto: REENCUADRADA (corrección menor).** El problema es real y la fase A lo ataca bien, pero
antes del plan hay que corregir tres cosas de `requisitos.md`: la cuenta de «una casilla por día»
(la suposición rompe el Dijkstra), dónde se escribe el dato del tipo de héroe (el fichero es
generado) y qué tipos lo llevan (el de por defecto no, o cambian la IA y el banco). Y el orden: se
hace después de fusionar la tarea 1.

**El problema real:** hoy solo se cambia de región por un nodo; el usuario quiere un grupo que lo evite
cruzando barreras despacio (`NuevaJugabilidad.md:274`).

## La premisa, contra el código

- **Ninguna barrera se pisa**: es cierto, y la regla vive en `isWalkable` (`map/terrain.ts:92`, sobre
  `BARRERAS` `:80`). La aplican el Dijkstra (`pisable = 0`, `map/map.ts:653`, `:662`; descartada en
  `:759`), `findPath` (`isEnterable(to)`, `map.ts:483`) y `stepCost`, que **lanza** (`map.ts:453`).
  Todo héroe se mueve por `alcanceDelHeroe`/`caminoHasta` (`state/game.ts:2529`, `:2545`), y la
  marcha, por `pasosDeHoy` (`:2571`; la leen `moveHero` `:2694` y `client/session.ts:1831`).
  `reachableFrom`/`findPath` no saben de héroes: hace falta un parámetro nuevo en el Dijkstra, no
  tocar `isWalkable`/`isEnterable` (los leen `game.ts:3576`, `mundo/validar.ts:101` y el generador).
- **Un héroe en una barrera**: rompe menos de lo que teme el criterio 6.
  - **Niebla**: la casilla sin región ya la resuelve `regionMasCercana` (`map/niebla.ts:144`), y
    `visibleNow` es un cuadrado. **Asaltantes**: `emboscador` da `null` sin región
    (`state/asaltantes.ts:273`) y la patrulla solo pisa la suya (`:231`): en una barrera no lo embosca
    nadie (regla de hecho que el plan debe escribir). **Otro héroe**: con `pisable = 0` ni como destino
    hostil llega (`map.ts:759`): el infiltrado parado es intocable. **Renta**: lee objetos y regiones,
    no héroes (`state/renta.ts:82`).
  - **Cliente**: el clic va por casilla (`escenas/aventura.ts:248`); la masa tapa la figura
    (`render/mapa.ts:567`), pero la inicial va encima de todo (`:767-772`): el criterio 5 ya se cumple
    a medias, y que se vea el cuerpo lo decide el plan. **Espectador**: sin dato nuevo, `adaptar.ts` no
    cambia. **Contrato**: la prosa dice «NO se cruzan» (`contract/serialize.ts:484`); `creature_stats`
    ya saca `traits` (`:948`).

## «Una casilla por día»

La marcha es un **coste acumulado y estático**: `pasosDeHoy` corta el prefijo cuyo coste cabe en
`movePoints` (`game.ts:2572`), y de ese número viven la ruta en dos colores, el `march_cut` (`:2769`),
`puedeAndarHoy` (`:2589`) y la IA (`ai/strategy.ts:212`, `:286`, `:323`). Con «basta con que le quede
algo», el precio de una casilla depende de con cuánto se llega: deja de ser un Dijkstra de un solo
coste y pide (día, gastado) en todos esos lectores: el caso especial frágil.

Lo que cabe sin caso especial es que **una casilla de barrera cueste un día entero**, el
`maxMovePoints` del grupo (`hero/hero.ts:247`), como una tabla más del Dijkstra (`map.ts:651-664`).
Con el día recién empezado entra (`cost > movePoints` es falso con igualdad) y lo gasta todo; con el
día ya empezado espera en el borde. N casillas, N días; ruta, `march_cut` y previsión lo cuentan
solos. Coste: `maxMovePoints` cambia al reclutar a media jornada (`game.ts:2230`, `:2255`); se dice.

## El dato

- **Unidades**: el rasgo va en `traits`, la lista cerrada del motor (`CREATURE_TRAITS`,
  `core/types.ts:161`; `NOMBRE_DE_RASGO` `:182`), que valida `validarUnidad` (`core/unidad.ts:289`) y
  que ya llega a la ficha, la arena y el contrato. `escalar` es precedente. No va en `habilidades`: el
  «Sigilo» del cuaderno (`:123`) es invisibilidad en batalla.
- **Tipos de héroe**: `data/tipos-de-heroe.json` es **generado** («No se edita a mano: se regenera»,
  `tools/datos/tipos-de-heroe.ts:84-91`), y el regex solo saca id, nombre y descripción (`:72-75`): un
  campo puesto a mano se pierde al regenerar. El sitio bueno tiene precedente:
  `data/figuras-de-heroe.json`, escrito a mano y comprobado contra los tipos (`validarFigurasDeHeroe`).
- **El tipo por defecto** (el primero de cada facción) es el héroe de salida de la IA y del agente y
  el del contratado (`game.ts:2253`, `state/setup.ts:128`). Si lleva el rasgo, la IA se infiltra sin
  quererlo (`ai/turn.ts:94`) y el banco cambia. Si ninguno lo lleva y el parámetro queda apagado, las
  tablas del Dijkstra son las de hoy y **el banco no se mueve**.
- **El grupo**: «toda su tropa» vale en vacío sin tropa; un personaje (`Troop.member`, `types.ts:474`) no tiene unidad.

**El día después.** Quien juega cruza un acantilado de una casilla en un día sin pasar por el nodo; deja de valer para ese
grupo lo que da por hecho que se entra por los nodos (la IA, el puesto de la tarea 1). **No debería**
abrirse el recinto de una ciudad (`MURO`, `map.ts:672`, no es `Barrera`; entrar es la fase B) ni
tocarse `isWalkable`/`isEnterable` para todos.

## Conflictos

- **Tarea 1** (`claude/mountain-node-interaction-7b9212`, 120 ficheros). No toca el Dijkstra, pero sí
  los mismos bloques de `game.ts` (`casillasHostiles` con `guarnicionesAjenas`, `queLoCierra`,
  `moveHero`, `enemyAt`, `collectAt`) y `session.ts`, `render/mapa.ts`, `escenario/superficie.ts`,
  `contract/serialize.ts`, `agent.ts`, `asaltantes.ts`, `ai/strategy.ts`, `ai/turn.ts`, `adaptar.ts`,
  `hero/hero.ts`, `invariantes.test.ts` y `CLAUDE.md`. También es dependencia de sentido: el paso con
  guarnición «se alcanza y no se cruza» es lo que rodea la infiltración. **Orden: fusionar la tarea 1
  y hacer la fase A encima.**
- **Tarea 2** (`claude/nifty-kare-5bc168`): hoy es el mismo commit que la tarea 1 (`9cc86827`). Lo
  que anuncia (generador, `renta.ts`, `collectAt`) solo roza `game.ts` y la prosa: sin choque.
- **CLAUDE.md**: el desempate del banco se respeta si el parámetro apagado deja las tablas idénticas;
  «un hecho, un sitio» pide una función para «se infiltra» y otra para su precio, no un `if` por lector.

**Coste contra valor.** Núcleo pequeño (una tabla, un predicado, el dato) más contrato, prosa y escena. Sin la fase B solo es
un atajo; sin ella, la fase B no tiene quién robe. Vale detrás de la tarea 1.

## Qué cambiar en `requisitos.md` (para pegar)

> **3.** (sustituye) Entrar en una casilla de barrera cuesta **un día entero de marcha** del grupo
> (`maxMovePoints`): se entra con el día recién empezado y se gasta todo; si no, se espera en el borde.
> N casillas, N días. La muralla del recinto de una ciudad no es una barrera y no se abre.
> **1.** (añade) El rasgo de los tipos va en un fichero de `data/` escrito a mano y comprobado contra
> `tipos-de-heroe.json` (generado), como `figuras-de-heroe.json`. Ningún tipo por defecto lo lleva.
> **2.** (añade) Un héroe sin tropa se infiltra si lo lleva él; de un personaje, lo que diga el plan, sin lanzar.
> **6.** (añade) En una barrera no lo emboscan los asaltantes ni lo alcanza quien no se infiltra; lo fija un test.
> **10.** (sustituye) `pnpm banco` no cambia. **Dependencias:** la fase A va sobre `main` con la tarea 1 fusionada.

**Preguntas al usuario:** (1) ¿la casilla de barrera exige el día entero, o vale entrar con lo que
quede? (2) ¿el infiltrado parado en una barrera es intocable para quien no se infiltra y para los
asaltantes? (3) ¿se fusiona antes la tarea 1?
