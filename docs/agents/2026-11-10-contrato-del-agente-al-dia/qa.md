# QA — el contrato del agente, al día

10-11-2026. Worktree `claude/siguiente-paso-0e4543`, cambio sin commitear sobre `d4aa79b5` (26 ficheros
modificados y 3 nuevos, más esta carpeta). No se tocó nada del repo: solo este fichero. Quien «juega»
aquí es el agente: se miró lo que le llega por el cable (payload, `responseFormat`, veredictos), no lo
que dice `implementacion.md`.

## Veredicto

> **Vuelta 2 (abajo, al final): apto.** Lo que sigue es el informe de la vuelta 1, tal cual.

**Apto con reservas.** Las dos jugadas funcionan y se rechazan bien, la traducción de claves es
completa en todo lo que se pudo hacer viajar y el espectador no cambia. La reserva es **H1**: un valor
de enumerado en español (`source: "romperGuardia"` / `"defensivo"`) sigue llegando al agente en el
hecho `effect` de casi toda batalla, y el guardia nuevo no lo ve. El criterio 4 no se cumple a la
letra hasta que se arregle o el coordinador lo mande a backlog a conciencia.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Mejorar el puesto: empalizada y muralla; rechazos con el motivo de `mejorarBlocker`; una sola palabra | ✅ | Por el `Director` (escenario A, abajo): `palisade` y `wall` entran, oro 10 500 → 5 500 al día siguiente (−1 500 −4 000 +500 de renta), nodo `none` → `wall`, hechos `{"kind":"outpost_upgraded",…,"upgrade":"palisade","cost":1500}` y `…"upgrade":"wall","cost":4000`. Rechazadas una a una: obra saltada («aún no tiene ninguna obra: la siguiente obra es la empalizada»), repetida («ya tiene la empalizada…»), tras la muralla («ya está amurallado»), sin oro («no alcanza el oro: cuesta 4000 oro y tienes 499 oro»), héroe inexistente, héroe del rival («Malaquías no es de tu bando»), nodo ajeno («…no es tuyo»), en una ciudad («solo se mejora un paso tomado, un puesto: Cripta Gris es una ciudad»). Fuera de todo sitio: `test/mejoras-del-puesto.test.ts` (verde), no por el circuito |
| 2 | Repartir tropa: uno por otro también con los dos llenos; lo que no cuadra, con su motivo; `veteran` | ✅ | Escenario F: héroe 6/6 y guarnición 7/7, `withHero: [5× templario-escudo, 1× goblin-lancero]` entra (`troops_exchanged` con `left` y `taken` de 1); el `leave_troops` equivalente se rechaza («ya lleva 7 de 7»). Rechazos: crea individuos («hay 2 × … sin veteranía, no 5»), tipo inexistente, veterano inexistente, héroe con 7 de 6, guarnición con 8 de 7, tipo dos veces, veterano dos veces, no mueve a nadie, héroe inexistente, sitio ajeno. Individuos conservados en todos los escenarios (E: 3 antes, 3 después; F: 13 y 13; G: 3 y 3). `leave_troops`/`take_troops` conviven (decisión dicha en la prosa, línea 104 del formato servido) |
| 3 | Zod y prosa a la vez; `accionDelAgente`; el veredicto dice qué pasó | ✅ | `responseFormat` servido de `adventure_turn` (31 761 caracteres): líneas 17-18 con las dos jugadas, GUARNICIONES y PUESTOS las explican. Veredictos: «2 de 13 acciones aplicadas, 11 descartadas» con una línea por descartada; «aplicado entero: 2 acciones» cuando acierta |
| 4 | Hechos de batalla sin claves ni enumerados en español; `switch` sin `default` | ❌ | Claves: limpias en 3 346 peticiones de batalla (40 partidas, 2 217 con muralla) y en 200 batallas de la arena (17 tipos de hecho, con `blast`, `thrown`, `power`, escaleras y puertas). **Valores: `effect.source` y `effect_end.source` llegan como `"defensivo"` y `"romperGuardia"`** (H1). `switch` sin `default`: leído en `src/core/contract/hechos.ts`; `pnpm typecheck` exit 0 |
| 5 | Hechos de aventura por un paso único; mismas palabras que las vistas | ✅ | 24 tipos de hecho vistos en `recentEvents` de 40 partidas, todos con claves del contrato (`remaining`, `veteran`, `upgrade`, `by.garrison`). Lugares (mundos «ejemplo» y «prueba», por el traductor): `place`, `mark`, `state`, `stateName`, `foe.kind: "place"` con `encounter` y `option.point/node/option`. Guardia de `cronicaPara` en `test/invariantes-partida.test.ts`, verde |
| 6 | Un guardia, visto morder | ✅ | Existe (`test/fugas-de-los-hechos.ts`, `test/hechos-del-agente.test.ts`, `test/cronica.test.ts`), verde, y muerde con una clave en español y con `kind: "cruce"` (comprobado llamando a `fugasDe` desde fuera, sin tocar el repo). Las tres mordidas del ingeniero se citan, no se repitieron (habría que romper el código). **Es ciego a H1**: `fugasDe` del `effect` con `source: "romperGuardia"` devuelve `[]` |
| 7 | La prosa no miente | ✅ | Los cuatro `responseFormat` servidos: 0 citas de las ~50 palabras viejas o del núcleo (`cruce`, `cuarto`, `diferido`, `parado`, `lugar`, `empalizada`…). Las 328 citas entre comillas, cruzadas con las claves y valores que viajan y, las no vistas, con el código del contrato: todas existen. Nada en `src/server` ni `src/core/contract` cita ya una clave vieja |
| 8 | El espectador no cambia | ✅ | `git diff HEAD --stat -- src/client src/server`: solo `src/server/notas.ts`. `construirVista` en una partida con obra: su `log` trae el hecho crudo (`"to":"empalizada"`) mientras el agente lee `"upgrade":"palisade"`. `test/espectador.test.ts` verde. `semillaDelEspectador()` sigue hallando semilla (la 1, 201 ms) |
| 9 | `pnpm qa` cruza las dos y sale 0 | ✅ | Exit 0, semilla 9: «obra hecha: node-8 → "palisade", node-9 → "palisade"; la repetida, descartada», «reparto: 2 "troops_exchanged"». Solo cruza la empalizada; la muralla, por mi escenario A |
| 10 | Docs al día; defensa y sobrantes siguen como backlog | ✅ | `CLAUDE.md:443` ya no lista repartir ni mejorar; `docs/areas/agente.md` cuenta la traducción; «aún no hay jugada» sigue en las líneas 154 y 163 del formato servido. `test/documentacion.test.ts` verde |
| 11 | Tests por partes, typecheck, lint, exportaciones, banco | ✅ | Abajo |

## Lo que se corrió

| Orden | Resultado | Por qué |
|---|---|---|
| `pnpm typecheck`, `pnpm lint` | exit 0; «Checked 776 files… Found 10 infos» | No hay commit que fije lo que dejó verde el ingeniero |
| `pnpm vitest run` de 10 ficheros | `Test Files 10 passed (10) · Tests 326 passed (326)`, 26 s | `hechos-del-agente`, `cronica`, `invariantes-partida` (el guardia); `mejoras-del-puesto`, `guarniciones` (las jugadas); `agent-link`, `notas` (circuito y veredicto); `agent-contract` (prosa); `documentacion`; `espectador` |
| `pnpm qa` | exit 0, semilla 9 | Toca contrato y servidor |
| `npx tsx tools/qa/exportaciones.ts` | «ninguna exportación sin lector (7.9 s)» | Exportaciones nuevas |
| `pnpm banco` | «ancla: igual — las 20 partidas se juegan hexágono a hexágono igual» | El diff toca `src/core/state/sitios.ts` y `map/tipos.ts` |

No se corrió `pnpm verify`, la suite entera, `verify:lento` ni `pnpm capturas`.

Las pruebas propias son guiones `tsx` en el scratchpad de la sesión (fuera del repo), todos con el
`AgentLink` y el `Director` de verdad y un socket de mentira, el patrón de `SocketDelArnes`:
`fugas.ts` (40 partidas con la política del arnés), `batallas.ts` (200 batallas de las tandas de
`arena-ia`), `lugares.ts` (dos mundos), `prosa.ts`, `adv.ts` (adversarial), `espectador.ts`,
`guardia.ts`.

## Hallazgos

### H1 — importante: `source` lleva el golpe de la rueda en la palabra del núcleo

En el registro de batalla, el `effect` que deja la rueda del golpe y su `effect_end` llevan
`source: "defensivo"` o `source: "romperGuardia"`. Lo mismo en la vista `stacks[].effects[].source`.
En ese mismo `log`, ese golpe se llama `"defensive"` y `"guard_break"` en `clash.hit` y
`clash.response`, que es además lo que el agente escribe en su jugada. Es el problema que la tarea
venía a cerrar (un hecho, dos vocabularios), y el requisito dice «ninguno llega al agente con claves
ni valores de enumerado en español».

- **Dónde**: `src/core/battle/golpe.ts:74` pone `source: efecto.fuente` (un `TipoDeGolpe`);
  `hechoAlAgente` copia `source: e.source` y `effect_end` pasa tal cual; `stackView`
  (`src/core/contract/batalla.ts:267`) copia `e.source`.
- **Reproducir**: cualquier partida del agente con una batalla cuerpo a cuerpo. Con `Director`,
  `seed` 1 a 40 y la política del arnés, los únicos valores de `log[].source` y de
  `stacks[].effects[].source` en las 40 son esos dos. En `pnpm qa` (semilla 9) también ocurre, pero
  el arnés no lo mira.
- **Por qué no lo cazó el guardia**: `source` quedó fuera de `CAMPOS_ENUMERADOS` a propósito
  (desviación 5 de `implementacion.md`: «ids… el `source` de un efecto»). Es un id cuando viene de
  un hechizo, y un golpe de la rueda cuando viene de ella. `VALORES_DEL_NUCLEO` ya contiene
  `defensivo` y `romperGuardia`: con `source` en la lista de campos, lo habría visto.
- **Qué espera el agente**: `"source": "guard_break"`, la palabra de `HIT_DE_GOLPE`.
- La prosa no explica `source` en ningún sitio, así que hoy tampoco sabe que ahí puede ir un golpe.

### H2 — menor: una línea con `count: 0` (o una obra de más de 32 letras) se lleva el turno entero

`{ "type": "distribute_troops", "withHero": [{ "creature": "…", "count": 0 }] }` junto a un `build`
válido: `ok=false`, «Tu respuesta a "adventure_turn" no encaja con el esquema y no se ha aplicado
nada. Ese turno lo juega la IA de reglas en tu lugar», problema `actions.0.withHero.0.count: Number
must be greater than 0`. El `build` no se aplica y la IA mueve al héroe. Igual con `count: 1.5`,
`upgrade` de 40 letras, `upgrade` ausente, 33 líneas o `withHero` que no es una lista.

- Es el comportamiento de siempre del zod para toda jugada (`leave_troops` con `count: 0` hace lo
  mismo), y no está entre los rechazos que pide el criterio 2. Se anota porque en un reparto que
  enumera «lo que se queda con el héroe», escribir 0 para «ninguno de estos» es un error natural, y
  porque los comentarios de `esquemas.ts` prometen que una línea o una obra mal escrita «descarta
  ESTA jugada, no el turno». El precedente es el H1 del QA del clima (22-10), que por esto mismo
  sacó los tipos del esquema.
- Reproducir: `Director` con `seed: 312`, `agentPlayers: [1]`, primera respuesta de
  `adventure_turn` con esa acción delante de un `build`.

### H3 — menor: los rechazos del veterano no llevan el prefijo de los demás

«distribute_troops de hero-1: con él, v-2: el veterano "v-2" es de tipo "goblin-lancero", no
"templario-escudo"» y «…una línea de "withHero" lleva "creature" y "count", o "veteran": esta no
dice a quién» salen sin «no se puede repartir la tropa:», que sí llevan los que juzga el núcleo. Se
entienden; es solo desigual.

## Pasada adversarial (resumen)

Todo por `Director` con `seed: 312`, el agente de jugador 1, y una sola respuesta con las jugadas en
fila. Ninguna tumbó el turno salvo las de H2.

| Escenario | Enviadas | Entraron | Descartadas con motivo |
|---|---|---|---|
| A obras (13) | `"empalizada"`, `"Palisade"`, `"none"`, `""`, `" palisade"`, `wall` saltada, héroe inexistente, héroe rival, `palisade`, repetida, `wall`, repetida, `palisade` otra vez | 2 | 11; las mal escritas, con «valen palisade, wall» |
| B sin oro (2) | `palisade`, `wall` con 499 de oro | 1 | 1 |
| C nodo ajeno (2) | obra y reparto | 0 | 2 |
| D ciudad (4) | obra en la base, marcha a un paso, obra allí, reparto imposible | 2 | 2 |
| E repartos (13) | los del criterio 2 más líneas vacías o a medias | 3 | 10 |
| F topes (4) | héroe 7/6, guarnición 8/7, uno por otro con los dos llenos, `leave_troops` | 1 | 3 |
| G veteranos (5) | tipo equivocado, veterano dos veces, veterano contado como novato, dos válidas | 2 | 3 |
| Z7 claves de más (2) | `obra: "muralla"` y `enElHeroe: []` añadidas | 2 | 0; las claves del núcleo se ignoran, no cuelan nada |

`withHero: []` entra y deja al héroe sin tropa: es la regla del núcleo, no un hallazgo.

## Workarounds usados

- **Estado preparado con `preparar`** (héroe plantado en un paso suyo, guarnición y oro puestos a
  mano), el mismo andamio del test del ingeniero. No afecta al agente: el camino natural (andar al
  paso, tomarlo, hacer la obra) lo cruza `pnpm qa` en la semilla 9 y mi escenario D, sin preparar.
  El nodo ajeno con el héroe encima (C) no se da jugando; solo prueba el texto del rechazo.
- **Socket de mentira en vez del puente MCP** para lo adversarial y los barridos. Del zod en
  adelante es el mismo código; el puente de verdad lo ejercita `pnpm qa` con la obra, la repetida y
  el reparto.
- **Lugares por fuerza bruta sobre el núcleo**: el `Director` no acepta un mundo, así que hoy al
  agente no le puede llegar un hecho de lugar por el servidor. Se probó solo el traductor.

## No probado

- **`cast` diferido, `spell_hit`, `triggered`, `raised`, `surrender` y `retouch` en una batalla de
  verdad**: no salieron en 40 partidas ni en 200 batallas de la arena (la IA no levantó cadáveres ni
  lanzó hechizos de área). Sus claves se revisaron leyendo los tipos y `hechos.ts`, y las cubren las
  muestras del guardia. Los efectos distintos de `attack` y `defense` (`armor`, `ward`, `trigger`…),
  igual: solo por la tabla.
- **`battle_ended` con rival de lugar**: se vio `battle_started` con `foe.kind: "place"`; el final
  usa la misma `rivalAlAgente`.
- **Héroe fuera de todo sitio, por el circuito**: lo cubre el test, no mi pasada (el héroe llegó a
  su ciudad en un día).
- **`pnpm capturas` y el espectador en el navegador**: no se corrió (245 s para una pantalla que el
  diff no toca). Se comprobó lo que recibe (`construirVista`) y que su búsqueda de semilla sigue
  hallando una.
- **Las jugadas adversariales por el puente MCP real** (stdio): solo por `AgentLink`.
- Fuera de alcance por encargo: defensa y sobrantes, #294, obra en español en los motivos, `traits`,
  la ventana de 25, lo de «A backlog» de `hallazgos-simplify.md`, la jugabilidad.

---

## Vuelta 2

10-11-2026, sobre el mismo worktree sin commitear, tras «Tras el QA, vuelta 1» de `implementacion.md`.
Solo lo afectado por H1-H3 y lo que podían romper. No se tocó nada del repo salvo este fichero.

### Veredicto final

**Apto.** H1, H2 y H3 están corregidos y comprobados por el cable; el criterio 4 pasa a cumplirse y
nada de lo que cumplía se ha roto. Quedan dos observaciones menores (O1, O2) que no piden otra vuelta.

### Lo re-verificado

| | | Evidencia |
|---|---|---|
| Criterio 4 / H1: `source` con la palabra del contrato | ✅ | Los mismos barridos de la vuelta 1, repetidos. **40 partidas** por el `Director` (semillas 1-40, 3 346 peticiones de batalla, 0 errores): `log[].source` y `stacks[].effects[].source` valen solo `defensive` y `guard_break` (antes `defensivo`, `romperGuardia`). **200 batallas** de la arena por `hechoAlAgente`: 696 `effect` y 607 `effect_end`, `source` solo `defensive` \| `guard_break`. **Hechizo y rueda a la vez** (guion nuevo, 20 batallas, 577 jugadas, 93 hechizos del catálogo lanzados a mano por el héroe, la vista serializada tras cada jugada): en el registro, `effect:defensive=54`, `effect:guard_break=28`, `effect_end:defensive=37`, `effect_end:guard_break=23` junto a `effect:slow`, `haste`, `piel_de_piedra`, `grito_de_guerra`, `corrosion`, `debilidad`, `fuerza_de_oso`, `escudo_arcano` tal cual; 278 veces un mismo stack llevaba en `effects` un origen de hechizo y uno de la rueda; ningún origen en la palabra del núcleo. `origenAlAgente` a solas: los 10 golpes a su `hit`; `fear`, `slow`, `""`, `toString`, `constructor`, `__proto__`, `Defensivo`, `romperguardia` pasan tal cual. Ningún id de los 44 hechizos de `data/hechizos.json` coincide con un golpe |
| Criterio 6: el guardia caza `source` | ✅ | `fugasDe` llamado desde fuera con un `effect`, un `effect_end` y un efecto de la vista (`claves: null`) sin traducir: los 9 golpes cuya palabra cambia dan ««source» vale «…», que es la palabra del núcleo» en los tres; `normal` (igual en los dos vocabularios) y los ids `rayo`, `armadura`, `escudo`, `fear`, `slow`, `escudo_arcano` dan `[]`. Las tres roturas a mano del ingeniero (`effect`, `effect_end`, `stackView`) se citan, no se repiten (habría que tocar el código). `test/hechos-del-agente.test.ts` verde |
| H2: un `count` malo descarta la jugada, no el turno | ✅ | Escenario H (`Director`, `seed` 312, 16 jugadas en una respuesta): «2 de 16 acciones aplicadas, 14 descartadas», `ok=true`. `count` 0, −1, 1,5, −0, 0,9999999 → «no se puede repartir la tropa: el "count" de "templario-escudo" es 0: va un entero de 1 en adelante (lo que no se queda con el héroe no se escribe)»; líneas mixtas (buena + mala, mala + buena, dos buenas y una −3) → descartada la jugada entera con el motivo de la línea mala y **sin mover a nadie**; el reparto válido de detrás y el `build` entran (`troops_exchanged` con `left` y `taken` de 1; individuos 3 antes y 3 después). Sin preparar (Z11, el caso exacto de H2): `count: 0` + `build` → «1 de 2 acciones aplicadas», el `build` se cobra (25 500 → 24 000) y el héroe no se mueve. `1e999` por JSON crudo (llega `Infinity`) → descartada con «es Infinity», no el turno. 32 líneas de `count: 0` → descartada, no el turno. `1e21` y 2 147 483 648 pasan al núcleo, que las rechaza con su motivo |
| H2: lo estructural sigue siendo respuesta mal formada, y los comentarios lo dicen | ✅ | Por JSON crudo, con un `build` válido detrás, `ok=false` y «no encaja con el esquema… lo juega la IA» en: `count: "2"` («Expected number, received string»), `count: null`, `count: true`, línea `null`, línea texto, `veteran: 5`, `withHero` ausente, 33 líneas, `upgrade` ausente. Es lo que enumeran los comentarios de `src/core/contract/esquemas.ts` (reparto: líneas 56-64; obra: 78-82), leídos |
| H3: el prefijo | ✅ | Escenario L: en `distribute_troops`, «no se puede repartir la tropa: un veterano es uno solo: no se mueven 2», «…: el veterano "v-2" es de tipo "goblin-lancero", no "templario-escudo"», «…: una línea de "withHero" lleva "creature" y "count", o "veteran": esta no dice a quién». Los 25 rechazos de reparto de H y L llevan el prefijo |
| `leave_troops` / `take_troops`, igual que estaban | ✅ | Escenario L: «el veterano "v-1" es de tipo "templario-escudo", no "goblin-lancero"» y «un veterano es uno solo: no se mueven 2», sin prefijo, letra por letra los de `git show HEAD:src/core/contract/vocabulario.ts` (líneas 172 y 175). Las tres válidas entran (dejar un novato, recoger a `v-2`, dejar a `v-1`): 2 `troops_left` y 1 `troops_taken`, tropa conservada. `leave_troops` con `count: 0` sigue siendo respuesta mal formada (conocido, fuera de alcance) |
| Criterios 2 y 3 | ✅ | Los de arriba, más `test/guarniciones.test.ts`, `test/agent-link.test.ts` y `test/notas.test.ts` verdes; el veredicto dice una línea por descartada y cuántas entraron |
| Criterio 7: la prosa | ✅ | Los cuatro `responseFormat` servidos otra vez: 0 citas viejas o en español. `battle_turn`, líneas 173-176 del formato servido: «Su "source" (también el de "effect_end"… y el de "stacks[].effects") dice quién lo puso: el id del hechizo o del poder, o, si lo dejó la rueda del golpe, el golpe con su palabra de "hit" ("defensive", "guard_break"…)», que es lo que viaja. `adventure_turn` mide lo mismo (31 761): la prosa del reparto no prometía nada del `count` |
| El núcleo no cambia | ✅ | `pnpm banco`: citado del ingeniero (corrido tras su último cambio, «ancla: igual»); los ficheros de `src/core/contract/` y los tests son de las 11:40-11:43 y su informe de las 11:44. El diff de la vuelta no toca `src/core/battle`, `state`, `server` ni `client`. `test/espectador.test.ts` verde |

### Lo que se corrió

| Orden | Resultado | Por qué |
|---|---|---|
| `pnpm typecheck`, `pnpm lint` | exit 0; «Checked 776 files… Found 10 infos» | Sin commit que fije el verde del ingeniero; segundos |
| `pnpm vitest run` de 9 ficheros | `Test Files 9 passed (9) · Tests 320 passed (320)` | `hechos-del-agente` (guardia y `source`), `guarniciones` (H2, H3), `agent-link` (H2 por el circuito), `agent-contract` (prosa y `stackView`), `cronica` (lee `fugasDe`, que cambió de firma), `notas`, `mejoras-del-puesto`, `invariantes-partida`, `espectador` (que nada se rompió) |
| `pnpm vitest run test/documentacion.test.ts` | 7 de 7 | Se tocó `docs/areas/agente.md` |
| `pnpm qa` | exit 0, semilla 9: obra en `node-8` y `node-9`, la repetida descartada, «reparto: 2 "troops_exchanged"» | Toca el contrato |
| Guiones propios (scratchpad, fuera del repo) | arriba | `fugas.ts` y `batallas.ts` de la vuelta 1, repetidos; nuevos `v2-source.ts`, `v2-guardia.ts`, `v2-adv.ts` |

No se corrió `pnpm verify`, la suite entera, `verify:lento`, `pnpm capturas`, `pnpm banco` (citado) ni
`tools/qa/exportaciones.ts` (citado del ingeniero: «ninguna exportación sin lector», sobre estos mismos ficheros).

### Observaciones (menores, no piden otra vuelta)

- **O1 — la prosa de `source` calla el rasgo.** Dice «el id del hechizo o del poder, o… el golpe»;
  el tercer origen del núcleo es el rasgo `fear` (`ON_HIT_EFFECTS`), que llega como `"fear"`. Es la
  palabra del contrato y no engaña a nadie, pero el agente no tiene dónde leer qué es. No se vio
  viajar en ninguna batalla de esta vuelta.
- **O2 — dos textos para lo mismo según el tamaño.** Un `count` de `1e21` no lo para el contrato
  (es entero) y lo rechaza el núcleo con «son individuos: de cada tipo van con el héroe 0 o más, no
  1e+21», mientras el contrato dice «de 1 en adelante» para el 0. Las dos jugadas se descartan bien;
  solo es que «0 o más» contradice al rechazo del 0 una línea más arriba. Nadie escribe 1e21.

### Workarounds de esta vuelta

- Los de la vuelta 1 (estado preparado con `preparar`, socket de mentira), con el mismo veredicto.
- **Hechizos lanzados a mano** en `v2-source.ts` (el héroe lanza uno del catálogo por ronda con
  `applyAction`, legal o se salta): la IA de reglas casi no lanza y sin eso no coinciden hechizo y
  rueda en un stack. No afecta al agente: es la misma acción `cast` que él manda, y lo que se mira es
  la serialización, no quién decide.
- **JSON crudo por el socket** para `1e999`, `null` y tipos equivocados: es lo que un cliente MCP
  puede mandar de verdad; `JSON.stringify` no deja escribir `Infinity`.

### No probado en esta vuelta

- Un `effect` de origen `fear` en una batalla real, y los fusionados (`offensive_strong`,
  `defensive_feint`, `quick_guard_break`) como `source` en una batalla real: las ruedas de 3 y 5 no
  se jugaron; los cubre `origenAlAgente` a solas (tabla exhaustiva por tipos) y las muestras del guardia.
- Las tres mordidas del guardia rompiendo el código: citadas del ingeniero; aquí, `fugasDe` desde fuera.
- Lo adversarial por el puente MCP real (stdio): solo por `AgentLink`, como en la vuelta 1.
- Lo no probado de la vuelta 1 sigue igual.
