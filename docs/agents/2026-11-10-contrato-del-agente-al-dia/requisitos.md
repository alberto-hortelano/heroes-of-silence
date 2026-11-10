# Requisitos — el contrato del agente, al día

Tarea: `2026-11-10-contrato-del-agente-al-dia`. Rama `claude/siguiente-paso-0e4543` (igual a `main`,
`d4aa79b5`, CI en verde).

## Petición literal

El usuario preguntó:

> «Cual seria el siguiente paso?»

El coordinador propuso, tras mirar el backlog: «poner el contrato del agente al día con las reglas
nuevas […] Lo haría como un `/feature`, empezando por #291 y #292», y enumeró lo que el agente no
puede hoy: jugar (repartir tropa, elegir la defensa de un sitio, mejorar el puesto; tampoco entrar en
un lugar, elegir lo que sobra tras una batalla ni licenciar en el mapa), ver (la barrera del pueblo
del muro en `knownMap`, #308; el rival que se infiltra, #298) y leer limpio (hechos con campos en
español, #292). El usuario respondió:

> «Sí, el agente»

El crítico dio la tarea por **reencuadrada** (`critica.md`): la defensa no es una acción de aventura
y #292 es mucho más ancho que su issue. El coordinador le propuso al usuario seguir con el alcance
del crítico, con la defensa y los sobrantes a un issue nuevo, y el usuario respondió:

> «Sí, sin la defensa»

## Alcance (tras la crítica)

- **#291, dos de tres**: mejorar el puesto y repartir tropa en `adventure_turn`. Las dos son ya
  `AdventureAction` (`src/core/state/tipos.ts`) y solo las quita un `Exclude` en
  `src/core/contract/vocabulario.ts`. La defensa sale a un issue nuevo con «elegir lo que sobra»: el
  núcleo solo deja elegirla con la batalla pendiente y sin empezar (`defensaPosible`), no en el turno
  de aventura.
- **#292, entero**: todo hecho que llega al agente, de batalla y de aventura, sin claves ni valores
  de enumerado en español. La lista cerrada sale de `BattleEvent` (`src/core/battle/types.ts`) y de
  los hechos de `src/core/state/events.ts`; la crítica enumera las ~25 claves de hoy (`corre`,
  `punto`, `parado`, `cuarto`, `diferido`, `poder`, `cura`, `cuando`, `kind: "cruce"`; `faltan`,
  `lugar`, `marca`, `nombre`, `estado`, `dicho`, `veterano`, `Ocupante` con `"heroe"`/`"guarnicion"`
  y `dueño`, `foe.kind: "lugar"`, `outpost_upgraded.to`). `retoque` solo lo emite la arena: su caso
  existe para que el `switch` siga exhaustivo.

**Candidatos: ninguno entra.** #308 y #298 siguen en su issue con la premisa corregida; licenciar ya
está en el contrato (`dismiss`); sobrantes va con la defensa; lugares es F4.

**Tras el plan** (10-11-2026): el arquitecto halló que el hecho `effect` de batalla y dos vistas
(`stacks[].effects[].kind` en `contract/batalla.ts` y `kind: "lugar"` en `knownMap`) mandan también
valores en español. El coordinador preguntó si se alineaban las dos vistas y el usuario respondió:

> «Sí, con las vistas»

Entran, pues, esas dos vistas (y solo esas: el barrido del resto, p. ej. `traits`, va a un issue).
El plan queda aprobado tal cual, con su pregunta abierta resuelta en «sí».

## Criterios de aceptación

1. **Mejorar el puesto**: el agente puede levantar la empalizada y la muralla de un paso suyo con un
   héroe en él; se descarta con su motivo (el de `mejorarBlocker`) sin oro, sin héroe, en sitio
   ajeno, saltándose una obra o repitiéndola. El nombre de la obra en la jugada es el mismo valor que
   `knownMap` usa en `upgrade` y que `outpost_upgraded` usa al contarlo: el agente escribe y lee una
   sola palabra.
2. **Repartir tropa**: el agente puede intercambiar tropa entre héroe y guarnición en una sola
   jugada, también con los dos llenos. Un reparto que no cuadra (crea o pierde individuos, pasa el
   tope, héroe fuera del sitio) se descarta con el motivo de `repartoBlocker`/`repartirTropaBlocker`.
   Las líneas van en el vocabulario del contrato (`veteran`, como `leave_troops`). El arquitecto
   decide, y lo dice, si `leave_troops`/`take_troops` siguen (serían tres jugadas para lo mismo).
3. Las dos jugadas están **en el zod y en la prosa a la vez** (un hecho, un sitio), se traducen por
   `accionDelAgente`, y el veredicto de la siguiente petición dice qué pasó con cada una, también
   cuando acertó.
4. **Hechos de batalla**: ninguno llega al agente con claves ni valores de enumerado en español; el
   switch de `hechoAlAgente` sigue exhaustivo y sin `default` (un hecho nuevo sin traducir no
   compila).
5. **Hechos de aventura**: pasan por un único paso de traducción, exhaustivo igual que el de
   batalla. Un mismo hecho usa las mismas palabras en `recentEvents` que en las vistas (`hero`,
   `owner`, `garrison`, `palisade`…). Los nombres propios y las frases para la persona no cuentan.
6. **Un guardia** impide que vuelva una clave en español a lo que viaja al agente (el arquitecto
   decide la forma: por tipos, o un test que recorra los hechos serializados), y se le ve morder.
7. **La prosa no miente**: `src/core/contract/formato.ts` cita hoy varias de esas claves (`cuarto`,
   `diferido`…); cambia a la vez que ellas.
8. **El espectador no cambia**: lee `state.log` crudo (`src/server/vista-espectador.ts`), no los
   hechos traducidos. El núcleo sigue emitiendo sus hechos como hoy; la traducción es del contrato.
9. **`pnpm qa`** cruza las dos jugadas (las hace o las ve rechazar con su motivo) y sale 0. El arnés
   hoy no ve ni un nodo en su semilla y juega 6 turnos: busca una semilla con un paso al alcance del
   agente (como `exigeLaMuralla`); si no la hay, lo dice y lo cubre un test del director.
10. `docs/areas/agente.md` y la sección «El agente» de `CLAUDE.md` dejan de listar como backlog
    `repartir_tropa` y mejorar el puesto, y cuentan la traducción de los hechos. **La defensa y lo
    que sobra siguen como backlog**, y sus frases de `formato.ts` («aún no hay jugada») se quedan.
    `test/documentacion.test.ts` en verde.
11. Tests por partes (los del contrato y el servidor que se toquen), `pnpm typecheck`, `pnpm lint`,
    `tools/qa/exportaciones.ts`. `pnpm banco` no cambia: no se toca `core/ai` ni lo que emite el
    núcleo.

## Fuera de alcance

- **Elegir la defensa y elegir lo que sobra**: issue nuevo (decisiones al borde de una batalla; ahí
  vive también que el agente aún no despliega).
- #308, #298, entrar en un lugar (F4).
- La IA de respaldo (`core/ai`): #290, #296, #301.
- La jugabilidad: si al agente le conviene mejorar o cómo reparte no es criterio ni hallazgo.
- Compatibilidad con el contrato anterior: los nombres viejos de los hechos no se mantienen.
- Reglas nuevas en el núcleo, y renombrar los hechos dentro del núcleo.
- **#294** (cambiar un veterano por otro del mismo tipo deja `left` y `taken` iguales en
  `troops_exchanged`): conocido, no es hallazgo nuevo de esta tarea.

## Contexto

- Docs de área: `docs/areas/agente.md` (obligatoria), `docs/areas/partida.md` (guarnición, obras),
  `docs/calidad.md` (`pnpm qa`).
- `critica.md`, en esta carpeta, trae cada afirmación con su fichero y línea: es el mapa del cambio.
- Puertas que ya existen: `mejorarElPuesto`, `mejorarBlocker`, `repartir`, `repartoBlocker`,
  `repartirTropaBlocker` (`state/sitios.ts`), `accionDelAgente`, `hechoAlAgente`,
  `UPGRADE_DE_MEJORA`, `SLOT_DE_HUECO` (`contract/`), `serializeKnownMap`, `EN_SU_LUGAR`
  (`server/notas.ts`); los hechos de aventura salen hoy crudos por `cronicaPara`
  (`contract/aventura.ts`).
- La máquina es compartida: nada de matar por patrón; tests por partes, nunca la suite entera.

## Preguntas abiertas

Las dos de la primera versión, respondidas por la crítica y el usuario (la defensa, fuera; ningún
candidato entra). Queda una para el arquitecto: si `leave_troops`/`take_troops` conviven con el
reparto. **Por defecto**: conviven (son la jugada sencilla y `pnpm qa` ya las exige).
