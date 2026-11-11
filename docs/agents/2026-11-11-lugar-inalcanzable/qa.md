# QA — lugar-inalcanzable (#321)

Validado sobre `worktree-agent-a3023e1219179fb37`, commit `0421e5e4` (árbol limpio). Mandan «Tras la
crítica» y «Tras el plan» de `requisitos.md` (opción C: la regla en `lugarBlocker`).

No repetí typecheck, lint, `test/mundo.test.ts` (normal y `HEROES_LENTO=1`), `documentacion`,
`motor-de-mundos`, `invariantes-*` ni `exportaciones.ts`: el ingeniero los dejó en verde sobre este
mismo commit (`implementacion.md`, «Verificación ejecutada») y no hay cambios después. Mis pruebas
son guiones propios (en el scratchpad y, para correrlos, en `.cache/` del worktree; ya borrados) y la
CLI `pnpm mundo`.

## Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| 1. Se reproduce con una semilla: un lugar en una región a la que el rival no llega sin pasar por la base | ✅ | r4 s12 (test del ingeniero) y, aparte, **r7 s10 con orkos**: `lugarBlocker` rechaza 102 casillas, p. ej. (1, 1) en `region-0` para j1 y (49, 49) en `region-1` para j0. |
| 2a. Se rechaza con un motivo para la persona | ✅ | El texto: «(49, 49) está en la región "region-1", a la que el jugador 0 solo llega cruzando la base del otro, la ciudad town-1 en (40, 44), y tomarla acaba la partida: el mundo es de los dos, pon el lugar en una región a la que lleguen los dos». Dice dónde, quién, qué base y qué hacer. `town-1` y `casaDe` salen en la lectura del motor, así que el motor sabe a qué se refiere. Salvedad: «solo» no tiene en cuenta la infiltración (H1). |
| 2b. `pnpm mundo validar <id>` lo dice | ✅ | `pnpm mundo nuevo qa-321-r7 --semilla=10 --regiones=7 --faccion=orkos`, con la historia y la biblia de `prueba` y `lugares[0].at = (49, 49)`. `pnpm mundo validar qa-321-r7` sale con **salida=1** y «tiene 1 problema» con la línea de arriba. Control negativo: con los dos lugares en muestras de `admitenUnLugar` (region-2 (29, 11), region-5 (7, 27)), el mismo comando dice «vale» y sale 0. La lectura deja `region-0 casaDe 0` y `region-1 casaDe 1` con 0 muestras. Borrado después. |
| 2c. Se ve morder; no es un «hay camino» sin hostiles | ✅ | El ingeniero lo hizo morder de dos maneras (`implementacion.md`, «Visto morder»). Mi comprobación independiente: en 120 mapas (r4/5/7, semillas 1-40) hay 14 regiones rechazadas, siempre las 2 casas de los 7 mapas de la crítica. Ninguna de esas regiones la alcanza el jugador nombrado con `reachableFrom` y el héroe rival como hostil (0 falsos positivos). |
| 3. Lo que se conquista no es un fallo, documentado con fecha | ✅ | `docs/areas/mundos.md`, «Lugares»: «Lo que cierra el paso al empezar y se conquista no es un fallo (11-11-2026, #321)». Nombra la ciudad neutral con guarnición, los asaltantes y el héroe rival fuera de su base. Medido: en esos 120 mapas, **2 066** regiones cuelgan solo de un nodo que no es la base (ciudad neutral, pueblo o paso) y **ninguna** se rechaza. |
| 4. Fuera de alcance, la vista previa de la ruta | ✅ | No se tocó `client/sesion/partida/marcha.ts`. |
| Falsos positivos: mapas con planes escritos | ✅ | `ejemplo` y `prueba`: las bases son nodos, 0 regiones tras una base. |
| Falsos positivos: bases mal elegidas | ✅ | `basesAlNacer` (réplica: `primeraCiudadDe` sobre las ciudades de `map.objects`) da la misma base que `basesDelPlan` y la misma casilla donde nace el héroe en los 120 mapas (0 desajustes). |
| Lo que dice la skill cuadra con lo que valida | ⚠️ parcial | Ver H2. |

## Hallazgos

### H1 — importante: la infiltración sí llega a la región «tras la base»

El motivo dice «solo llega cruzando la base del otro». Los docs dicen «no lo pisa nunca el otro»
(`mundos.md`) y el JSDoc de `regionesTrasUnaBase` dice lo mismo. Pero el juego tiene infiltración
(CLAUDE.md, «Infiltración»): un grupo que se infiltra cruza las barreras pagando un día entero por
casilla, y las cinco facciones tienen un tipo de héroe que lo hace (`data/infiltradores.json`).

**Reproducción:** `mundoNuevo({semilla: 12, regionesPorBando: 4, faccion: 'imperio'})` y después
`newGame`. Luego `reachableFrom(map, héroe j0.at, [héroe j1.at], null, barrera)`:

- Con `barrera = 1`, alcanza `region-1`.
- Con `barrera = 100000`, el coste mínimo es 202 555: son **2 casillas de barrera**, es decir, 2 días.

Pasa en las **14 de 14** regiones rechazadas de los 120 mapas: todas se alcanzan infiltrándose, sin
pisar la base.

Lo que esperaba quien escribe el mundo: un motivo que sea verdad. La regla se puede defender: una
región a la que solo llega un grupo entero de infiltrados no es «de los dos» en la práctica. Pero
esa decisión no la tomaron ni la crítica ni el plan, porque ninguno nombra la infiltración. Además,
la comprobación «exacta contra el Dijkstra» del test usa `reachableFrom` sin `barrera`, así que no lo
ve.

**Propuesta, para quien decida:** dejar la regla y corregir el texto («solo llega cruzando la base
del otro o infiltrándose»), y matizar «nunca» en `mundos.md`, en `mapa.md` y en el JSDoc. La otra
opción es aceptar que la infiltración basta, pero entonces la regla sobra.

### H2 — menor: la frase nueva de la skill da una causa que no siempre es la de un `admitenUnLugar` vacío

La skill dice: «Una casa con `admitenUnLugar` vacío solo se pisa cruzando su base […]: usa una
vecina». En r5 s15 (imperio), `region-6` y `region-7` son casas (`casaDe` no nulo) con
`admitenUnLugar` vacío, y **no** están tras ninguna base. Ahí todas sus casillas se rechazan por la
separación de 3 (pueblo «El Soto», town-0, town-2, node-0) o por estar en el recinto. El consejo
(«usa una vecina») sigue valiendo, pero la causa que da es falsa en ese mapa, y cuenta la parte
falsa de H1.

**Propuesta:** «Una casa con `admitenUnLugar` vacío no admite lugar (a menudo porque solo se pisa
cruzando su base): usa una vecina».

### H3 — menor, fuera de alcance (anterior a este cambio): `pnpm mundo nuevo --help` crea un mundo llamado `--help`

Al pedir la ayuda, la CLI creó `assets/mundos/--help/` (mundo.json y plan.json, semilla 13551) y
`.cache/mundos/--help/` (lectura y un `mapa.png` de 4,3 MB). `idDeMundoBlocker` acepta un id que
empieza por `--`. Lo borré. No es de #321: va a un issue aparte si se quiere.

## Workarounds usados

- Para comprobar la CLI usé un id a mano (`qa-321-r7`) y no `gen-*`, y copié la historia de `prueba`.
  Es la receta del plan, y no es un obstáculo de quien juega: el motor escribe su propia historia.
  Lo borré al acabar.
- Las comprobaciones de alcance las hice con guiones sobre el núcleo, no en el navegador. El cambio
  no se ve: es validación del mundo y lectura para el motor.

## No probado

- **Un plan escrito a mano con la base dentro de una región** (no en un nodo): la regla no corta
  nada ahí. Por el código es correcto (`regionesDelSitio` devuelve la región de la base y no hay
  nodo que cortar), pero no lo ejercité.
- **El navegador y `pnpm qa`**: no se toca ni el cliente ni el servidor ni el contrato.
- **El caso original `hornos-de-pez` (1, 16)**: el mundo se borró y no se puede reproducir.

## Veredicto

**Apto con reservas.** Los criterios se cumplen: la regla rechaza exactamente las casas tras la base
(0 falsos positivos en 120 mapas, ninguno tras una ciudad neutral o un paso), `pnpm mundo validar` lo
dice con un motivo legible y el control negativo pasa. La reserva es **H1**: el motivo, los docs y la
skill dicen «solo»/«nunca», y un grupo que se infiltra sí llega. Hay que reescribir esas frases (o
decidir que la infiltración cuenta) antes de cerrar #321. H2 es una frase de la skill.
