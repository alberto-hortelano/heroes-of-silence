# Ciudades y pueblos en su región, y la ocupación (tarea 2 del puesto fronterizo)

Rama: sobre la tarea 1 (`claude/mountain-node-interaction-7b9212`, `9cc86827`), cuyo contexto entero
está en `docs/agents/2026-11-04-puesto-fronterizo/` (requisitos, qa, hallazgos; el plan y la
implementación, sin commitear, en el worktree `.claude/worktrees/mountain-node-interaction-7b9212/`).

## Petición literal

Del usuario, 04-11-2026 (`docs/agents/2026-11-04-puesto-fronterizo/requisitos.md`, «Segunda vuelta»):

> «Los pueblos pasan a ser posibles nodos. Se tratan como una ciudad. Lo mismo con las ciudades.
> Ahora creo que siempre son nodos y no tendrian porque. La mayoria de las ciudades deberian estar en
> mitad de una region, no en un nodo de defensa. Pueblos y ciudades se pueden atacar para robarlas.
> Lo pueden hacer las tropas que se infiltran (Aun no esta implementado) Y roban lo que haya en la
> ciudad. No se la quedan. Mientras un heroe enemigo esta en una ciudad o pueblo de tu region este
> deja de sumar. Puedes recuperarlo atacando»

Respuestas de después (mismo documento): una ciudad o un pueblo en mitad de una región es **de quien
tenga la región**; una ciudad que sí está en un nodo (la base) **se toma, como un paso** (perder la
base sigue eliminando). Reparto en tres tareas; esta es la segunda:

> «Tarea 2: ciudades y pueblos fuera de los nodos (la mayoría de las ciudades en mitad de su región;
> los pueblos, a veces en un nodo, tratados como una ciudad), su dueño derivado de la región, y la
> ocupación: un héroe enemigo dentro de una ciudad o pueblo de tu región hace que deje de sumarte
> hasta que lo echas atacándolo.»

## Lo que hay hoy (verificado en el código)

- **Toda ciudad es un nodo de la red** (`regiones.ts`, `estructura`: `nodos` con `ciudad: true`; su
  recinto 3 × 3 de `core/map/recinto.ts` toca las regiones de los accesos de sus puertas). Su dueño
  es `Town.owner` y se toma venciendo su guarnición (`captureTown`); el dueño de una región es el
  común de todos sus nodos, ciudades incluidas (`dueñoComun`), y lo unido a la base se busca de nodo
  en nodo (`conexionDe`).
- **El pueblo** ya es de quien tenga su región (o de quien lo guarda, si tiene guarnición:
  `dueñoDelSitio`, tarea 1) y da `rentaDelPueblo` si la región está unida a la base (`rentaDelDia`).
  Nunca es nodo.
- La tarea 1 dejó dicho: «el dueño del pueblo y de la ciudad se deriva solo en `dueñoDelSitio`, y
  `guarniciones` va por id de objeto para poder absorber `Town.garrison`».

## Criterios de aceptación

(Se completan con las decisiones del usuario, abajo.)

1. **El generador** pone la mayoría de las ciudades **en mitad de su región** (dentro de ella, no
   sobre un cruce entre regiones), con su recinto 3 × 3 y sus puertas donde llega un camino de esa
   región; las que van en un nodo son las que diga la decisión P2. La red sigue cerrada y conexa: lo
   que antes unía una ciudad-nodo lo une ahora un paso. Los pueblos, a veces, en un nodo.
2. **El plan del agente** (`validateMapPlan`, la prosa de `map_generate`) admite ciudades en mitad de
   una región y en un nodo, y pueblos en un nodo; lo que no vale se rechaza diciéndolo. Los mundos
   commiteados (`prueba`, `ejemplo`) se rehacen o se adaptan (sin compatibilidad hacia atrás).
3. **Dueño derivado**: una ciudad o un pueblo en mitad de una región es de quien tenga la región; uno
   en un nodo se toma como un paso (pisándolo o venciendo su guarnición) y cuenta como nodo para el
   dueño de las regiones que toca. `dueñoDelSitio` es la única regla; `Town.owner` deja de
   escribirse a mano donde se derive (o desaparece, lo decide el plan).
4. **La ocupación**: mientras un héroe enemigo está en la casilla de una ciudad o un pueblo de tu
   región, deja de sumarte (P4). Se ve en el mapa, en la barra o el lateral de la renta, en la
   crónica (hechos con protagonista, sitio y sello) y en el contrato del agente.
5. **Recuperarlo atacando**: tu héroe que pisa la casilla ocupada pelea contra el ocupante (P3); si
   gana, el sitio vuelve a sumar. Si el ocupante se va, también.
6. **Entrar para ocupar**: un héroe enemigo entra en una ciudad o un pueblo ajeno de mitad de región
   como manda la tarea 1 (si tiene guarnición, la vence antes; sin ella, entra pisándolo) y se queda
   en su casilla. No se queda el sitio ni la región, y no recluta, ni construye, ni deja tropa allí.
7. **La base** sigue en un nodo: se toma como un paso y perderla elimina en el acto.
8. **La IA de reglas** no se rompe con nada de esto (`barrido-semillas.ts` en 0 sin terminar) y
   recupera lo suyo si tiene `ventajaClara`; ocupar a propósito, a backlog si el plan no lo mete.
9. **El espectador** lo pinta (`adaptar.ts` sigue siendo la inversa exacta) y **el agente** lo lee en
   `knownMap`/`game_state` con la prosa de la regla; `pnpm qa` en 0.
10. `pnpm banco` cambia a propósito (otro mapa): se re-ancla y se juzga la forma del diff.

## Fuera de alcance

- Las tropas que se infiltran y el robo (tarea 3).
- Equilibrio, cuántas ciudades por mapa, si ocupar «vale la pena» (CLAUDE.md: no se prueba la
  jugabilidad). Las proporciones nuevas, inventadas y declaradas en `data/`.
- Arte nuevo: la ciudad en mitad de su región usa el recinto que ya hay.

## Contexto

- Pruebas por partes y con su porqué; nunca `pnpm verify` entero. Máquina compartida: nada de matar
  por patrón. Playwright sin pantalla. No se prueba la jugabilidad.
- El usuario no abre nada en los worktrees: para enseñarle algo, levantar el servidor en otro puerto
  y darle la URL.
- Otra sesión trabaja a la vez en la tarea 3 (las tropas que se infiltran).

## Decisiones del usuario (05-11-2026, al abrir el ciclo) — mandan sobre lo de arriba

- **P1. Tropa de otro dentro cuando la región cambia de dueño** → «Ocupa»: la tropa no cambia de
  bando; el sitio pasa al dueño de la región pero **no le suma mientras haya tropa de otro dentro**
  (héroe enemigo o guarnición ajena, también la neutral de una ciudad neutral): es la misma
  ocupación, y se recupera atacándola.
- **P2. Qué va en un nodo** → «Bases y ciudad-puente»: las bases y las ciudades-puente del río en un
  nodo (se toman como un paso); las demás ciudades, en mitad de su región. Pueblos en un nodo: uno de
  cada cuatro, inventado y declarado en `data/`.
- **P3. El ocupante se defiende con la muralla del sitio** → sí: toda batalla en un sitio va con su
  muralla (piedra en la ciudad, madera en el pueblo), sea quien sea quien está dentro.
- **P4. Qué deja de sumar** → «Oro y la ciudad entera»: mientras está ocupada no da su renta, y
  **tampoco se recluta, ni se construye, ni crecen sus moradas**; cada acción apagada dice su motivo
  con un `*Blocker`.

## Plan aprobado (05-11-2026) y respuestas a sus preguntas

El usuario aprobó `plan.md` en tres fases («Aprobado»), con:

- **Ciudades de región**: 2 parejas (4), inventado en `data/poblamiento.json`.
- **La región con ciudad lleva también su pueblo**: sí.
- **La guarnición propia en un sitio que ya no es tuyo**: recoger sí, dejar no.
- **Ciudad ocupada**: no se contrata héroe, y la semana de crecimiento se pierde (no se aplaza).
- Sin crítico: la tarea la describió el propio usuario en la conversación de la tarea 1 (no viene
  del backlog).

## Al cerrar (05-11-2026)
- **El techo de `rectitud.ts`** (mapas con un tramo recto ≥ 12, 15 → 23; medido 20): **aceptado** por el usuario
  («Sí, acéptalo»). No se toca el engorde.
