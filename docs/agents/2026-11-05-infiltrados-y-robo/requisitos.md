# Infiltrados y robo de pueblos y ciudades

Tarea 3 de las tres en que el usuario partió el puesto fronterizo
(`docs/agents/2026-11-04-puesto-fronterizo/requisitos.md`, en la rama
`claude/mountain-node-interaction-7b9212`, sección «Segunda vuelta»).

## Petición literal

> «Pueblos y ciudades se pueden atacar para robarlas. Lo pueden hacer las tropas que se infiltran
> (Aun no esta implementado) Y roban lo que haya en la ciudad. No se la quedan.»

Dentro de la misma respuesta del usuario (04-11-2026), justo antes y después:

> «Los pueblos pasan a ser posibles nodos. Se tratan como una ciudad. Lo mismo con las ciudades.
> Ahora creo que siempre son nodos y no tendrian porque. La mayoria de las ciudades deberian estar en
> mitad de una region, no en un nodo de defensa. […] Mientras un heroe enemigo esta en una ciudad o
> pueblo de tu region este deja de sumar. Puedes recuperarlo atacando»

## Dependencias (estado a 05-11-2026)

- **Tarea 1** (puestos, defensa con el héroe eligiendo tropa, murallas con escaleras y puertas en
  ciudades, pueblos y puestos, intercambio de tropa): commiteada en
  `claude/mountain-node-interaction-7b9212`, **sin fusionar a `main`**.
- **Tarea 2** (ciudades y pueblos fuera de los nodos, su dueño derivado de la región, la ocupación):
  **en curso** en su propia sesión (`claude/nifty-kare-5bc168`), sin cambios todavía.
- La **fase B** (el robo) se diseña **sobre la tarea 2 terminada**: «atacar para robar» y «no se la
  quedan» solo tienen sentido cuando el dueño de una ciudad sale de su región y no de quien la pisa.
  La **fase A** (este ciclo) va sobre la punta de la tarea 1 (I9).

## Lo que ya hay de «infiltración» en el código

Dos enganches dejados a propósito, sin nada que los use:

- **En el mapa**: las cinco barreras son distintas en el motor «porque la infiltración podrá cruzar
  unas y otras no» (`BARRERAS`, `core/map/terrain.ts`; decisión del usuario del 03-10-2026,
  `docs/historia.md`).
- **En la batalla**: `UnitInfo.despliegue` (`{ columnas, momento }`, `battle/despliegue.ts`), «el
  enganche de la infiltración»: desplegar más adelante o más tarde (petición del 02-11-2026: «habra
  habilidades como infiltracion que permitan desplegar mas alante o mas tarde»).

Una ciudad (`Town`, `core/town/town.ts`) guarda edificios, `available` (lo que se puede reclutar) y
`garrison`. **No guarda oro**: el oro es del jugador (`Player.oro`) y la renta se cobra al empezar el
día (`rentaDelDia`).

## Decisiones del usuario

Respuestas del 05-11-2026 (literales donde el usuario escribió):

- **I1. Infiltrarse es un rasgo de unidad**: «Rasgo de unidad, si todos lo tienen incluido el heroe
  pueden atravesar barreras con movimiento 1, pueden tardar varios dias». Solo el grupo en que lo
  lleva **todo el mundo, héroe incluido**, se infiltra; ese grupo atraviesa barreras a paso de una
  casilla, y cruzarlas puede llevar varios días.
- **I2. Lo que se roba es la renta del día** de ese pueblo o ciudad: el oro que daría a su dueño hoy
  pasa al ladrón.
- **I3. Se defiende con batalla con muralla**: los infiltrados pelean contra la guarnición (y el
  héroe que esté dentro), con la muralla de la ciudad o la empalizada del pueblo de la tarea 1; si
  ganan, roban y se van sin quedársela; si pierden, nada.
- **I4. Se parte en dos fases**: la **fase A** (la infiltración: el rasgo, quién lo lleva y cruzar
  barreras) ahora, sobre `main`; la **fase B** (el robo, con batalla con muralla) cuando las tareas 1
  y 2 estén fusionadas. **Este ciclo es la fase A.**
- **I5. Cruzan las cinco barreras**: montaña, bosque, acantilado, agua y muro (el usuario marcó todas).
- **I6. El héroe lo lleva por su tipo**: algunos tipos de héroe de cada facción son infiltradores
  (dato en `data/`, inventado y declarado).

Tras la crítica (05-11-2026, `critica.md`, veredicto REENCUADRADA):

- **I7. Una casilla de barrera cuesta un día entero** de marcha del grupo (respuesta: «Un día
  entero»): se entra con el día recién empezado y se gasta todo; si ya anduvo, espera en el borde
  hasta mañana. N casillas, N días. Sustituye la suposición «basta con que le quede algo».
- **I8. Intocable dentro** (respuesta: «Sí, intocable»): parado en una barrera, no lo emboscan los
  asaltantes ni lo alcanza quien no se infiltra; solo otro grupo infiltrado puede llegar a él.
- **I9. La fase A va sobre la rama de la tarea 1** (respuesta: «Sobre la rama de la tarea 1»): esta
  rama (`claude/vigilant-wozniak-17edfb`) parte de `9cc86827`, la punta de
  `claude/mountain-node-interaction-7b9212`, como la tarea 2. Se fusionan en orden 1 → 2 → 3.

## Criterios de aceptación — fase A (este ciclo)

1. **El rasgo**: existe un rasgo de unidad de infiltración, escrito en `data/unidades.json` en las
   unidades que lo lleven, y uno por tipo de héroe en el dato de los tipos (`data/`). Qué unidades y
   qué tipos lo llevan lo propone el plan (inventado y declarado en su `_comment`) y lo aprueba el
   usuario; al menos uno por facción, para que se pueda jugar con cualquiera. El rasgo de las
   unidades va en `traits` (`CREATURE_TRAITS`, como `escalar`); el de los tipos, en un fichero de
   `data/` escrito a mano y comprobado contra `tipos-de-heroe.json` (que es generado), como
   `figuras-de-heroe.json`. **Ningún tipo por defecto lo lleva** (el de la IA, el agente y la
   partida rápida), para que el banco no cambie.
2. **El grupo infiltrado**: un héroe **se infiltra** si lo lleva él (por su tipo) y toda su tropa
   (por su unidad); basta uno sin él para que no. Una sola función del núcleo lo dice, con su
   `*Blocker` («no se infiltra: <quién> no lleva el rasgo»), y la leen la búsqueda de caminos, la
   ficha y el contrato. Un héroe sin tropa se infiltra si lo lleva él; un personaje de la tropa
   (`Troop.member`, sin unidad del catálogo), lo que diga el plan, sin lanzar.
3. **Cruzar barreras**: el héroe que se infiltra puede pisar casillas de las cinco barreras
   (`mountain`, `forest`, `cliff`, `water`, `wall`) a **un día entero por casilla** (I7): cuesta el
   `maxMovePoints` del grupo, así que solo entra con el día recién empezado y lo gasta todo; si no,
   espera en el borde. N casillas, N días. Lo que no se infiltra, como hoy. La muralla del recinto de
   una ciudad no es una barrera y no se abre (entrar en una ciudad es la fase B). `isWalkable` e
   `isEnterable` no cambian para nadie más.
4. **La ruta y la marcha lo dicen**: la ruta pintada y la previsión del mapa cuentan los días de la
   travesía como cuentan hoy los de una marcha larga (`pasosDeHoy`), y un `move_hero` a varios días
   anda lo de hoy y escribe `march_cut` como siempre.
5. **Parar dentro**: el héroe puede acabar el día en una casilla de barrera; se ve en el mapa (no
   queda tapado por la masa de la montaña o el bosque hasta no leerse) y se puede pulsar.
6. **Lo de alrededor no se rompe** con un héroe en una casilla de barrera: la niebla (qué región
   descubre y qué mira, `regionesQueDescubre`, `visibleNow`), los asaltantes (emboscada, patrulla),
   otro héroe que quiera llegar a él, el territorio y la renta (una barrera no es de nadie). Lo que
   el plan decida para cada uno, con su test. En una barrera no lo emboscan los asaltantes ni lo
   alcanza quien no se infiltra (I8); lo fija un test.
7. **El agente**: `creature_stats` dice el rasgo; el héroe, si se infiltra; la prosa explica la
   regla; su `move_hero` cruza barreras con la misma regla del núcleo (no hay jugada nueva).
8. **El espectador** pinta al héroe en la barrera (`adaptar.ts`, la inversa exacta, si viaja algo
   nuevo).
9. **La IA de reglas** no se rompe (`barrido-semillas.ts` en 0 sin terminar); si aprovecha la
   infiltración o no, lo dice el plan (suposición: no, a backlog).
10. `pnpm banco` **no cambia** (ningún tipo por defecto se infiltra y el Dijkstra sin infiltración
    queda idéntico: mismo desempate, mismas tablas); si cambiara, es un fallo. `pnpm qa` en 0.

## Fase B (después; no se diseña en este ciclo)

Atacar un pueblo o ciudad ajeno para robarlo, solo con un grupo infiltrado; batalla contra su
guarnición y el héroe de dentro con su muralla o empalizada (tarea 1); si gana, se lleva la renta
del día de ese sitio (el dueño no la cobra) y no se lo queda (dueño por región, tarea 2); si pierde,
nada. Crónica, IA, agente y espectador como en la fase A.

## Fuera de alcance

- Equilibrio, cifras finas y si robar «vale la pena» (CLAUDE.md: no se prueba la jugabilidad). Las
  cifras son inventadas y se declaran.
- Lo de las tareas 1 y 2 (puestos, murallas, ocupación, dueño por región).
- La fase B (el robo) en este ciclo.
- Desplegar adelantado o más tarde en la batalla (`UnitInfo.despliegue`): el usuario no lo pidió
  aquí; el enganche se queda como está.
- Gastar en fal.ai.

## Preguntas abiertas (con la suposición por defecto)

- ¿Una casilla de barrera de un nodo o de la muralla con su puerta? → el nodo y la puerta siguen
  siendo nodos (se pisan como hoy); la regla nueva es solo para lo que hoy no se pisa.

## Aprobación del plan (05-11-2026)

- **I10. Plan aprobado tal cual** («Aprobado tal cual»): las unidades y los tipos de la tabla de
  `plan.md` §4 (templarios: penitente / inquisidor; no muertos: espectro / vampiro; imperio:
  rodelero / capitán mercenario; elfos: explorador y asesino / mago; orkos: goblin lancero y goblin
  arquero / goblin), el personaje no se infiltra, y el riesgo de la ruta que pierde un día frente a
  un rodeo, aceptado.
- **I11. Sobre la punta de la tarea 1 tal cual** («Seguir y fusionar luego»): la rama de la tarea 1
  va 18 commits por detrás de `main` (sin la niebla por regiones); quien la fusione con `main`
  resuelve los conflictos, y la parte de la niebla de esta fase se rehace después.

## Cierre de QA (05-11-2026)

- **I12. N4 aceptado** («Aceptarlo así»): en una barrera, lo hecho de delante tapa la figura aunque
  la deje casi tapada (125 de 22 931 casillas de barrera de s1-40 tapadas un 80 % o más, detrás de un
  pueblo o con un trozo de algo hecho que deja a la masa de delante taparla; se pulsa y la inicial se
  ve). Fase A cerrada tras cuatro vueltas de QA (`qa.md`).
