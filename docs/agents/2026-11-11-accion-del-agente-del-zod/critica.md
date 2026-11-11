**REENCUADRADA**: los dos problemas son reales y van bien juntos. El alcance es algo mayor de lo que dicen los issues: hay un agujero en el núcleo (`recruit` admite 1,5), la mitad de #318 es la misma regla, y «todas las jugadas» no dice si incluye la batalla.

# Crítica: accion-del-agente-del-zod (#313, #317)

## El problema real
El tipo de la jugada del agente y lo que admite el zod están escritos dos veces y nada los ata (#313). Además, la frontera entre «respuesta mal formada» (se pierde el turno) y «jugada que no vale» (se descarta esa) se ha puesto jugada a jugada, sin regla (#317). Las dos soluciones atacan eso. Se tocan en el mismo esquema y en el mismo traductor (`accionDelAgente`), así que hacerlas por separado sería pagar dos veces.

## La premisa, afirmación por afirmación
- **`AccionDelAgente` y `LineaDelAgente` copian a mano el zod.** Cierto: `vocabulario.ts:144-195` y `:197-201` frente a `esquemas.ts:29-110`.
- **El director hace `accion as AccionDelAgente`.** Cierto: `director.ts:467`. Hay dos sitios más que el issue no nombra:
  - `director.ts:450`: `a as AccionDelAgente` sobre `unknown`, para `describeAccion`;
  - `test/partida-de-prueba.ts:30`: `adventureActionSchema.parse(escrito) as AccionDelAgente`.

  Los tres caen con el mismo cambio.
- **«`esquemas.ts` importa `vocabulario.ts`, así que el tipo tiene que cambiar de lado».** La importación existe: `esquemas.ts:19` trae `JUGADA_DE_MURALLA`, y es de ejecución. Pero el «tiene que» no es forzoso: un `import type` de `esquemas.ts` en `vocabulario.ts` se borra al compilar, y el guardia de ciclos de `test/invariantes-capas.test.ts:145` solo mira los ciclos que cruzan dos carpetas o más. Los dos ficheros están en `contract/`. El criterio 1 («sin dependencia circular») debe decir si cuenta un ciclo solo de tipos; si no lo dice, decide el arquitecto, no el issue.
- **El `default` de `accionDelAgente` no es exhaustivo.** Cierto: `vocabulario.ts:291-292`, `default: return a;`. Lo pasan `move_hero`, `hire_hero`, `build`, `recruit`, `dismiss`, `buy_item` y `end_turn`. El modelo ya existe en la batalla: `accionDeBatallaDelAgente`, `vocabulario.ts:456-485`, lleva el comentario «Sin `default`».
- **`leave_troops` con `count: 0` hace que el zod rechace la respuesta entera y la IA juegue el turno.** Cierto:
  - el esquema lo prohíbe en `esquemas.ts:33` (`.int().positive()`);
  - `agent-link.ts:272-277` lanza;
  - la nota dice «Ese turno lo juega la IA» (`notas.ts:435`).

  Los tests lo fijan hoy: `test/guarniciones.test.ts:778` (`take_troops` con 0 ⇒ `success: false`) y `test/agent-contract.test.ts:1658` (`recruit` con −5). Los dos se invierten con esta tarea.
- **`distribute_troops` ya lo juzga jugada a jugada.** Cierto: `esquemas.ts:72` (`count: z.number().optional()`) y `lineaBlocker`, `vocabulario.ts:231-240`.
- **No lo dice el issue, y cambia el alcance: el núcleo no siempre está preparado para recibir el valor que el zod deje pasar.**
  - `dismissBlocker` (`state/heroes.ts:54`) e `intercambioBlocker` (`state/sitios.ts:921`) rechazan lo que no es un entero seguro ≥ 1. Esos dos están bien.
  - `recruitBlocker` (`town/town.ts:222`) solo mira `count <= 0`: con `count: 1.5` y 3 disponibles, el reclutamiento pasa.

  Si `recruit` deja de filtrar en el zod sin que su regla lo rechace, se abre un fallo real en el núcleo, también para cualquier otro llamador.
- **Solapamiento con #318.** Su segunda mitad es «un `count` de `1e21` en un reparto lo rechaza el núcleo con "0 o más", contra el "de 1 en adelante" del contrato». Es la misma regla: `lineaBlocker` usa `Number.isInteger` (`vocabulario.ts:236`) y el núcleo, `Number.isSafeInteger` (`sitios.ts:1077`). Una regla única para el `count` la cierra.

## La batalla, que «todas las jugadas» deja en el aire
El zod de batalla también filtra valores, no solo la forma: `surrender.gold`, entero ≥ 0 (`esquemas.ts:158`), y los hexes, enteros (`esquemas.ts:24`). Allí el coste es mayor que en la aventura. Un `battle_turn` que no pasa el zod hace `.catch → null → break` (`director.ts:580-584`) y luego `resolvePendingBattle` (`director.ts:646-647`): **la IA termina la batalla entera**, mientras la nota dice «Ese turno lo juega la IA» (`notas.ts:436`). Es un hallazgo aparte: la nota miente sobre lo que pasa. No es de esta tarea, pero `requisitos.md` tiene que decir si la regla abarca la batalla.

El cast gemelo, `respuesta.data.action as AccionDeBatallaDelAgente` (`director.ts:594`), no es el mismo cambio mecánico: el zod de batalla incluye `wait` y `defend` (`retirada`, `esquemas.ts:113-119`), y `AccionDeBatallaDelAgente` es también la salida de `accionAlAgente` (`vocabulario.ts:493`). Mejor dejarlo fuera, diciéndolo.

## El día después
- **Para quien juega**: nada. Para el agente, un `count` mal puesto deja de costarle el turno entero y le cuesta solo esa jugada, con su motivo.
- **Lo que se cierra**: con el zod ya no se puede usar como documentación de qué valores valen. La prosa (`formato.ts:172-178`, «`count`: N») pasa a ser lo único que el agente lee. Es aceptable: el esquema no se le exporta (no hay `toJSONSchema` en `src/`).
- **Lo que nadie borrará**: los comentarios que explican caso a caso por qué este campo es texto o número suelto (`esquemas.ts:24-27, 57-65, 77-81, 85-88, 98, 104-106`). Con una regla escrita deberían reducirse a remitir a ella.
- **`CLAUDE.md`**: no contradice nada; aplica «Fail-loud: las acciones del agente se descartan una a una con su motivo».

## Conflictos
- **#318**: la mitad del `1e21` es esta regla, mismo fichero y misma función. Conviene absorberla aquí. La otra mitad (los nombres de las obras en español) sigue fuera.
- **#314** (un esquema zod por hecho, con tipos por `z.infer`) sigue la misma filosofía, pero va sobre los hechos que salen, no sobre las jugadas que entran. Hay coherencia y ningún choque.
- **#311**: fuera de alcance, y bien así. Añadirá jugadas o peticiones nuevas y heredará la regla. Hacer esta antes lo abarata.
- **La tanda en paralelo**:
  - #202 (crónica del espectador) cita `docs/areas/agente.md` como área: si las dos lo editan, el choque es textual en la fusión, nada más.
  - #305 (pueblo en la puerta) toca la validación del plan (`map/generar/validar.ts`); si toca `esquemas.ts`, será en el esquema del plan (`:220-310`), lejos de las jugadas.
  - #321, #327 y #332: ningún fichero en común.
- **Trabajo reciente**: `d791d03c` (#319) creó `distribute_troops`, `upgrade_outpost` y `LineaDelAgente`. Esta tarea remata su deuda declarada y no deshace nada.

## Coste contra valor
- **Coste**: bajo. Los tipos de un fichero y unos casos explícitos en el `switch`; cuatro `count` en el zod; una comprobación de enteros en `recruitBlocker`; dos tests que se invierten y uno por jugada; un párrafo en `agente.md`; y `pnpm qa`.
- **Valor**: #313 convierte en error de compilación el próximo desajuste entre contrato y tipo, que ya ha pasado una vez (QA H2 de #319). #317 quita una forma barata de perder un turno.
- **Si no se hiciera nunca**: el agente perdería de vez en cuando un turno por un 0, y el siguiente campo que se añada al zod volvería a copiarse a mano. Es tolerable, pero es deuda que crece con cada jugada.

## Qué le cambiaría a `requisitos.md` (para pegar)

> 1. (#313) `AccionDelAgente` y `LineaDelAgente` salen del zod (`z.infer`); fuera los tres casts: `director.ts:450`, `director.ts:467` y `test/partida-de-prueba.ts:30`. Un `import type` entre `esquemas.ts` y `vocabulario.ts` no cuenta como ciclo si el arquitecto lo justifica; uno de ejecución, sí. El cast de batalla (`director.ts:594`, `AccionDeBatallaDelAgente`) queda fuera: su zod lleva `wait`/`defend` retirados y su tipo es también la salida de `accionAlAgente`.
> 2. (#313) `accionDelAgente` sin `default` (o con `never`): las jugadas que hoy pasan tal cual van con su caso.
> 3. (#317) Una regla escrita, con fecha, en `docs/areas/agente.md`: qué es forma (se lleva la respuesta) y qué es valor (se juzga jugada a jugada). Se aplica a todas las jugadas de **aventura** con `count` (`recruit`, `dismiss`, `leave_troops`, `take_troops`, `distribute_troops`). La regla dice expresamente si abarca la batalla (`surrender.gold`, hexes).
> 3b. El núcleo rechaza con su motivo todo `count` que no sea un entero seguro ≥ 1 en cada jugada que deje de filtrar el zod: hoy `recruitBlocker` (`town/town.ts:222`) acepta 1,5. Y `lineaBlocker` usa la misma comprobación que el núcleo (`Number.isSafeInteger`), lo que cierra la mitad de #318 del `1e21`.
> 4. Los tests que fijan el rechazo del zod (`guarniciones.test.ts:778`, `agent-contract.test.ts:1658`) se invierten, y hay un test por jugada afectada que muestra que la siguiente jugada de la respuesta se aplica. `pnpm qa` en verde.
>
> Hallazgo aparte (issue nuevo, no de esta tarea): un `battle_turn` que no pasa el zod hace que la IA termine la batalla entera (`director.ts:584`, `:646`), y la nota dice «Ese turno lo juega la IA» (`notas.ts:436`).
