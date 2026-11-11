# El agente

Se lee antes de tocar: `src/core/contract/`, `src/server/`, `src/client/espectador/`, `tools/qa/agente/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### Los golpes y los poderes en el contrato (19-10-2026)

`HIT_DE_GOLPE` (`offensive`, `strong`, `feint`, `defensive`, `quick`, `guard_break`, `normal` y los fusionados `offensive_strong`, `defensive_feint`, `quick_guard_break`), `hitsDeLaRueda(forma)`, `golpeDelHit(hit, forma)` (lanza diciendo cuáles valen en la rueda de la batalla), la rueda dicha, `ruedaAlAgente` (`wheel`: `types`, `ring`, `center`, `crossing`), `accionDeBatallaDelAgente` (lo que manda el agente: `attack.hit` → el golpe, `power` → el poder), y `accionAlAgente` (la lista legal al revés), en `contract/vocabulario.ts` con los huecos; el registro lo traduce `hechoAlAgente` (`contract/hechos.ts`, abajo: el `cruce` es `clash`, con `hit`, `response` y `point`); la petición de respuesta, `serializeBattleResponse` (recibe solo los dos ids: no puede contar el golpe del otro; lo vigila `invariantes-batalla.test.ts`, «el agente elige en la rueda»)

### Los hechos que lee el agente (10-11-2026)

`hechoAlAgente` (el registro de la batalla, `log` de `battle_turn`) y `cronicaAlAgente` (la crónica, `recentEvents`; por dentro, `hechoDeLaCronicaAlAgente`), en `contract/hechos.ts`: **el paso único** entre los hechos del núcleo y el agente. `cronicaAlAgente` es `cronicaPara` (la niebla, `state/events.ts`) más la traducción, y hacia el agente nadie más del contrato ni del servidor llama a `cronicaPara` (lo vigila `test/invariantes-partida.test.ts`, «la crónica sale hacia el agente por un solo sitio»). Las tablas de los enumerados (`CUANDO_AL_AGENTE`, `EFECTO_AL_AGENTE`, `VENCE_AL_AGENTE`, `UPGRADE_DE_MEJORA`, `HIT_DE_GOLPE`), en `contract/vocabulario.ts`. **El origen de un efecto** (`source` del hecho `effect`, de su `effect_end` y de `stacks[].effects`) pasa por `origenAlAgente` (10-11-2026, QA H1): un id de hechizo, de poder o de rasgo va tal cual, y el golpe de la rueda que lo colgó, con su palabra de `HIT_DE_GOLPE` (llegaba `"romperGuardia"` junto a un `clash.hit: "guard_break"`); el guardia de las fugas mira `source` solo contra los golpes. El detalle, en «Los hechos, traducidos», abajo.

### Por qué una marcha no llegó (veredicto del agente)

`paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`)

## El agente

**Levantar un cadáver** (08-11-2026, `docs/agents/2026-11-08-levantar-zombi/`): en `spell_list`, `target: "corpse"` (`objetivoAlAgente`, `contract/vistas.ts`, ya sin `default`: un objetivo nuevo no llega como «any» en silencio); se lanza con `cast.at` (el esquema zod no cambia) y `legalActions` trae una casilla por cadáver que se puede levantar; el registro lo cuenta con `raised` (tal cual, `hechoAlAgente`; sin `side` desde el 09-11-2026: el bando es el del stack nuevo). Lo que sobra al volver lo deja la regla de la IA y `recentEvents` lo cuenta con `left_behind`; que lo elija el agente, backlog. La prosa, en `RESPONSE_FORMAT` (MAGIA y LO QUE SOBRA)

Patrón listen/respond: `heroes_listen` bloquea hasta que hay decisión, la
petición trae el formato de respuesta embebido, el agente responde una vez con
`heroes_respond`, y el veredicto de lo anterior llega pegado a la siguiente
petición — **siempre, también cuando acertó**. Un rechazo dice qué se jugó en su
lugar y qué costó.
Un `move_hero` a varios días anda lo que da el día (`pasosDeHoy`, la misma
cuenta que pinta la ruta) y, si no llega, `moveHero` escribe `march_cut` con los
pasos que faltaban; el director solo lo formatea. Solo se descarta si no da ni un
paso. Los textos libres del agente (`lineaLegible`) no admiten invisibles salvo
los que unen un emoji, ni dependen de la tabla Unicode del Node para lo sin asignar.
Una marcha que no llega entra como parcial y dice por qué: le faltaron puntos
(`march_cut`), vio un grupo que la emboscaría (`march_halted`) o la emboscaron
antes del destino (`battle_started` con `faltan`; el agente lo lee como `remaining`).
Un `move_hero` sin camino se descarta con `porQueNoLlega`, que pasa por su niebla (11-11-2026, #336):
nombra lo que cierra si lo ve; si no, «lo cierra algo que no ves» (detalle en `docs/areas/partida.md`).

- **Forma y valor** (11-11-2026, #313 y #317, `docs/agents/2026-11-11-accion-del-agente-del-zod/`):
  la regla de qué se lleva una respuesta de aventura entera y qué solo una jugada. **Forma** es que
  la jugada sea la que dice ser: su `type`, sus campos y el tipo JSON de cada uno, las casillas
  enteras (una con decimales no nombra ninguna; `pointSchema` es el mismo del plan de mapa) y los
  topes de tamaño (`max(32)` letras o líneas, `max(200)` jugadas); la juzga el zod
  (`adventureActionSchema`) y, sin ella, la respuesta entera se rechaza y el turno lo juega la IA.
  **Valor** es lo que se lee pero no vale en la partida: las cantidades (el zod solo pide un número;
  un entero seguro de 1 en adelante lo exige el núcleo, `enteroDesde` en `recruitBlocker`,
  `dismissBlocker`, el intercambio de la guarnición y `lineaBlocker`), los ids, el hueco, la obra,
  las entradas del clima y las líneas de voces; lo juzga `accionDelAgente` o el `*Blocker` del núcleo
  y descarta solo esa jugada con su motivo, y las siguientes siguen. Antes cada jugada lo decidía a su
  manera: un `count: 0` en `leave_troops` se llevaba el turno y en `distribute_troops` no (QA H2 de
  #319), y `recruitBlocker` aceptaba 1,5 (solo miraba `count <= 0`). **El tipo sale del zod**:
  `AccionDelAgente` es `z.infer<typeof adventureActionSchema>` (`vocabulario.ts`, con `import type`: el ciclo de tipos
  con `esquemas.ts` queda dentro de `contract/`, que el guardia de ciclos admite), sin el `as` del
  director, y `accionDelAgente` va **sin `default`**: una jugada nueva en el zod sin su caso no
  compila. `equip` y `unequip` se construyen campo a campo (zod escribe `veteran?: string | undefined`
  y el núcleo, con `exactOptionalPropertyTypes`, `veteran?: string`). Lo vigilan
  `agent-contract.test.ts` («forma y valor»: toda jugada con `count` lo deja pasar como número y
  rechaza el texto) y `agent-link.test.ts` (una respuesta con cuatro `count` malos y una jugada buena
  aplica la buena).
- **Reclutar lo que el pueblo no ofrece** (11-11-2026, #340): el valor de `recruit.creature` lo
  juzga `recruitBlocker`, que distingue la criatura que no existe («no hay ninguna criatura…»), la
  que el pueblo no ofrece porque no tiene su morada (con el nombre y el id de la morada, y su
  facción si es ajena: no vale reintentar) y la que ofrece sin bastantes («solo hay N disponibles»,
  la única que ve la persona, a quien la morada solo le ofrece lo de `dwellings`). Antes las tres
  decían «solo hay 0 disponibles». `unequip.slot` lleva el mismo `max(32)` que `equip.slot`.

  **En la batalla** (11-11-2026, #334 y #338, `docs/agents/2026-11-11-contrato-de-batalla/`) forma
  y valor cuestan lo mismo, **esa jugada**: la respuesta es una sola jugada y lo siguiente es el
  próximo `battle_turn` de la misma batalla. La forma la juzga `battleActionSchema` (el `type`, los
  campos, las casillas enteras, `surrender.gold` entero y no negativo, y `wait`/`defend`, retiradas
  el 26-10, con su frase); el valor, `accionDeBatallaDelAgente` (el `hit`, que depende de la rueda)
  y los `*Blocker`. Las dos acaban en `sustituir` (el director): la IA juega esa unidad sin
  rendirse y un solo veredicto (`notaAccionSustituida`) dice lo que costó. Por eso el enlace no
  juzga el `battle_turn` (`pedirElTurnoDeBatalla`, no `ask`; `KindQueJuzgaElEnlace`): antes lo
  informaba, lanzaba, y el director dejaba **la batalla entera** a la IA, un `wait` olvidado
  incluido, con una nota que decía «ese turno». **Sin respuesta** (plazo agotado, canal caído) la
  batalla la termina la IA y la nota lo dice (`EN_SU_LUGAR.battle_turn`): esperar el plazo turno a
  turno costaría hasta 300 s por cada uno de unos 18 turnos, y con el canal caído cada petición
  fallaría en el acto. `AccionDeBatallaDelAgente` es `z.infer<typeof battleActionSchema>`, sin el
  `as` del director: `retirada()` es un `refine` que estrecha a `never`, así que el zod rechaza
  `wait` con su frase y el tipo no la lleva. Lo vigilan `agent-link.test.ts` (un `wait` y un
  `target` numérico cuestan su jugada y la batalla sigue; el turno callado la deja a la IA) y
  `notas.test.ts`.

- **Las guarniciones** (04-11-2026): `leave_troops` y `take_troops` (`{ hero, creature, count,
  veteran? }`, `accionDelAgente` las traduce a `dejar_tropa` y `recoger_tropa`) con el héroe parado
  en un sitio suyo; `you.garrisons` dice qué guarda cada paso y pueblo suyo y lo suyo que se quedó en
  un sitio ajeno (la de sus ciudades, en `towns[].garrison`); la ajena no viaja. **La ocupación**
  (05-11-2026): cada ciudad y pueblo de `knownMap` lleva su `owner` derivado, `node` y `occupiedBy`
  (lo que se vio), `towns[]` y `income` llevan `occupied` (la frase de `ocupadoBlocker`), y lo que se le
  ofrece sale de las reglas que lo juzgan: la ocupada trae `income` 0 (el de `rentaDelDia`, que es el
  de toda ciudad) y `canBuildNow` y `recruitable` vacíos (`ciudadQueMandaBlocker`, la pregunta de
  `build` y `recruit`; vuelta 1 de QA, H3), y la prosa
  lo dice (OCUPACIÓN, y en `map_generate` dónde va cada ciudad). Su defensa la elige la IA por él (`defense_set` en
  `recentEvents`; su jugada, backlog), y la prosa (GUARNICIONES, DEFENSA) lo dice. La batalla contra
  una guarnición sin héroe llega con `foe: { kind: "garrison", site }` (en inglés, como los demás), y
  la prosa de la aventura y la de `battle_turn` dicen qué es. **El reparto** (10-11-2026,
  `docs/agents/2026-11-10-contrato-del-agente-al-dia/`): `distribute_troops` (`{ hero, withHero }`,
  cada línea `{ creature, count }` o `{ veteran }`; `accionDelAgente` la traduce a `repartir_tropa`,
  la de la pantalla de la persona) dice todo lo que va con el héroe y se juzga solo el reparto final
  (`repartirTropaBlocker`): cambia uno por otro con los dos llenos. Una línea que no dice a quién, un
  `count` que no es un entero de 1 en adelante (es valor: «Forma y valor», arriba) o
  un `veteran` con otro tipo al lado descarta esa jugada al traducir (`lineaBlocker`, `veteranoBlocker`, la misma
  comprobación de `leave_troops`), con el prefijo «no se puede repartir la tropa:» de los demás; lo
  estructural (sin `withHero`, más de 32 líneas) es respuesta mal formada, como en toda jugada. **`leave_troops` y `take_troops` conviven** con ella: son la jugada
  de un solo tipo, la IA usa sus gemelas del núcleo y `pnpm qa` las exige. `pnpm qa` deja y recoge
  una vez, reparte dos (uno que mueve a un novato y otro que lo devuelve) y falla si no cruzan
  (`troops_left`, `troops_taken` y `troops_exchanged` en su crónica).

- **Los puestos** (04-11-2026, fase 3): cada nodo de `knownMap` lleva `upgrade` (`none`, `palisade`
  o `wall`, `UPGRADE_DE_MEJORA`), el último que vio como su `owner`, y la prosa (PUESTOS, y la de la
  muralla) dice tras qué muralla se pelea en el paso, en una línea. **La jugada de mejorar**
  (10-11-2026): `upgrade_outpost` (`{ hero, upgrade }`), con un héroe suyo parado en un paso suyo;
  `upgrade` es texto (no un enum: una obra mal escrita descarta esa jugada, no el turno) y **la misma
  palabra** que el `upgrade` del nodo y que el del hecho `outpost_upgraded` (`UPGRADE_DE_MEJORA`; la
  inversa, `obraDelUpgrade`, que lanza con `none` y con lo que no es una obra). La juzga
  `mejorarBlocker`, cuyos motivos nombran la obra en español («la siguiente obra es la muralla»: que
  los `*Blocker` reciban el vocabulario de quien pregunta, backlog), y la prosa lo avisa. `pnpm qa`
  exige el `upgrade` en todo nodo que llegue, busca una semilla en que un héroe del agente amanezca en
  un paso suyo con oro para la obra y **su hecho llegue a la crónica de un turno** (la ventana es de
  25: en la primera semilla que salió, la 5, la obra del día 2 ya no estaba en la del día 3), manda
  la obra dos veces y exige el `outpost_upgraded`, el nodo con esa misma palabra y el rechazo de la
  repetida con su motivo (`exigeElPuesto`).

- **La muralla** (04-11-2026, fase 2 del puesto fronterizo): el `battle_turn` trae `walls` (`null`
  sin muralla; si no, `material`, los muros en `tiles`, las puertas en `gates` con `open` y las
  escaleras puestas en `ladders`, cada una con `foot` y `wall`), y cada stack que aún la lleva,
  `ladder: true`. Las cuatro jugadas, `place_ladder` y `climb` (`wall`), `open_gate` y `close_gate`
  (`gate`: `{ a, b }`), salen de una tabla, `JUGADA_DE_MURALLA` (`vocabulario.ts`: su inversa, el zod,
  la prosa y lo que exige el arnés, `JUGADAS_DE_MURALLA`); las traduce `accionDeBatallaDelAgente` y
  al revés `accionAlAgente`, las dos con un `switch` exhaustivo sobre `BattleAction['type']` **sin
  `default`** (antes el `default` las dejaba pasar en español), y `hechoAlAgente`, también sin
  `default` y con su tipo escrito (`HechoAlAgente`: un hecho nuevo sin su caso no compila), cuenta
  `ladder_placed` y `gate_*` con `escaleraAlAgente` y `puertaAlAgente`, las mismas de `walls` (desde el
  10-11-2026 vive en `contract/hechos.ts` y traduce todo el registro). **La prosa de la muralla va solo en el turno de
  una batalla con muralla** (`PROSA_DE_LA_MURALLA`, que `formatoDeLaRespuesta` añade al formato de
  `battle_turn` si `walls` no es null; la regla, `reglaDeLaMuralla`, la de la arena): eran ~2,2 KB en
  cada turno, también contra monstruos. Se descartan una a una con su `*Blocker`. `pnpm qa` busca una
  semilla donde el agente mande alguna en una batalla con `walls` y falla si ninguna entra
  (`exigeLaMuralla`), y también si un turno con `walls` llega sin la prosa o uno sin ellos la trae.

- **Los hechos, traducidos** (10-11-2026, #292, `docs/agents/2026-11-10-contrato-del-agente-al-dia/`):
  ningún hecho llega al agente con claves ni enumerados en español. El núcleo emite como siempre y el
  espectador lee `state.log` crudo (`vista-espectador.ts`); la traducción es del contrato, al servir
  (`contract/hechos.ts`), con dos `switch` **sin `default`** y con el tipo de retorno escrito, y cada
  hecho que cambia construido campo a campo, sin `...resto`. Sin alias: los nombres de antes no
  valen. **De batalla**: `cruce` → `clash` (`hit`, `response`, `point`; no `crossing`, que es un campo
  de `wheel`); `punto` → `point`; `parado` → `blocked`; `cuarto` → `quarter`; `diferido` → `deferred`;
  `poder` → `power`; `cura` → `healed`; `triggered.cuando` → `when` (`turn_start`, `turn_end`,
  `struck`, `strikes`, `death`); `effect`: su `effect` por `EFECTO_AL_AGENTE` (`armor`, `strength`,
  `agility`, `prevents`, `ward`, `trigger`; `speed`, `attack` y `defense` igual), `dicho` → `summary`,
  `vence` → `expires` (`turn_start`, `turn_end`), `turnoDe` → `turnOf`; `retoque` (solo de la arena) →
  `retouch` (`name`, `changes`); **`move.corre` se quita** (es del lienzo: ninguna regla lo lee).
  **De la crónica**: `faltan` → `remaining` (`march_cut`, `battle_started`); `lugar` → `place` (y
  `from: "place"`, `foe: { kind: "place", place, encounter, option: { point, node, option } }`);
  `place_state`: `name`, `state`, `stateName`; `world_mark.marca` → `mark`; `site_occupied.by`, con
  la forma de `occupiedBy` (`ocupanteAlAgente`: `{ hero, owner }` o `{ garrison }`);
  `troop_rank_up.veterano` → `veteran`; `outpost_upgraded.to` → `upgrade` (`palisade`, `wall`). **Dos
  vistas se alinearon** con sus hechos y solo esas (decisión del usuario, «Sí, con las vistas»):
  `stacks[].effects[].kind` (por `EFECTO_AL_AGENTE`) y `kind: "place"` en `knownMap`; el barrido de
  las demás vistas (`traits: "infiltrarse"`…), backlog. **El guardia**:
  `test/hechos-del-agente.test.ts`, con una muestra de cada hecho (`satisfies Record<kind, …>`: uno
  nuevo sin muestra no compila) con todos sus opcionales, una **lista cerrada de claves**
  (`CLAVES_DE_LOS_HECHOS`, en `test/fugas-de-los-hechos.ts`) y el registro de una batalla de verdad;
  la crónica de una partida de la IA la mira `test/cronica.test.ts`, que ya la juega. Visto morder
  con `corre` devuelto en el `move`, con `faltan` en `march_cut` y con una clave de más en un hecho
  que pasa tal cual (`aimed`) y en `battle_ended`.

- **La infiltración** (05-11-2026): cada héroe lleva `infiltrates` y, si es `false`,
  `infiltrationBlocker` (`infiltracionBlocker`); `creature_stats` trae el rasgo `infiltrarse` en
  `traits`; la prosa del turno dice la regla (el día entero por casilla, intocable dentro, la muralla
  no se cruza), y su `move_hero` cruza barreras con la misma regla del núcleo: no hay jugada nueva.

- Peticiones: `adventure_turn`, `battle_turn`, `battle_response`, `map_generate`,
  `hero_from_troop`, `town_voices`. Un test compara los `case` de `decidir` con `REQUEST_KINDS`
  en las dos direcciones; lo que se juega en su lugar es `EN_SU_LUGAR`
  (`Record<RequestKind, string>`).

- **La rueda y los poderes** (19-10-2026): el `attack` de `battle_turn` lleva `hit` (uno de los
  siete, en inglés: `HIT_DE_GOLPE`; sin él lo elige la IA a ciegas, y uno ilegal descarta esa
  jugada con su motivo), y el turno trae `hits`, lo que hace cada tipo con el arma de la activa;
  la jugada `power` usa Curar (el stack trae `powers`). Cuando golpean cuerpo a cuerpo
  a una unidad suya, quien pega se planta (ante ella, o en su salida si carga), y se pide `battle_response`
  (`serializeBattleResponse`: quién a quién y lo que daría cada respuesta, sin el golpe del otro; si le cargan, quien carga aún no ha corrido y `chargeFrom` dice desde dónde golpeará, 31-10-2026).
  Una respuesta que no vale o no llega la elige la IA **solo para ese golpe**: la batalla sigue
  siendo del agente (`EN_SU_LUGAR.battle_response`). El veredicto cuenta el cruce: qué eligió,
  qué eligió el otro y en qué punto cayó. Medido en `pnpm qa` (19-10-2026): 22,7 peticiones por
  batalla (18,4 turnos y 4,3 respuestas; 19,3 cuando la rueda la elegía la IA por él).

- **Armas de fuego y granadas** (02-11-2026): el turno trae `throw` en `legalActions` (una por
  enemigo a su alcance; vale cualquier casilla a su alcance) y cada stack, si recarga, `reloading`
  (los turnos que le faltan; mientras, ni un `aim` suyo), y si lleva granada, `grenades` (las que le
  quedan) y `grenadeRange`, y la que está en el aire, `grenadeAt` (también los del rival); el registro
  cuenta `thrown` y un `blast` por alcanzado (`target`, `damage`, `quarter`). `creature_stats` dice
  `reload` (solo con un arma de fuego), o `grenadeCharges` y `grenadeRange`. La prosa de `battle_turn` lleva ARMAS DE
  FUEGO y GRANADAS. `pnpm qa` dice si un `throw` del agente cruzó, sin exigirlo.

- **La magia del editor** (06-11-2026): `spell_list` trae de cada hechizo `id`, `name`, `level`
  (el gremio, o `null`), `cost`, `description`, `summary` (`queHaceElHechizo`) y `target` (`ally`,
  `enemy`, `any`, `tile`, `self`, `all`: `hechizosAlAgente`); `cast` y `power` llevan `target`, `at`
  o nada, y `legalActions` trae los que valen; cada efecto de `stacks[].effects`, su `summary`, y el
  diferido, `spellAt`; el registro cuenta `spell_hit` y `triggered`; la prosa, MAGIA. `pnpm qa` no
  lo exige.

- **El disparo diferido** (25-10-2026, regla nueva sin validar por el usuario y **sin tests**):
  `shoot` se fue; el tirador manda `{ "type": "aim", "at": { col, row } }` (cualquier casilla del
  tablero menos la suya; `legalActions` trae una por enemigo vivo y la prosa dice que vale
  cualquiera), cada stack con algo apuntado lleva `aimedAt` (también los del rival), y el registro
  cuenta `aimed` (`at`) y `shoot` (`at` y `target`, `null` si no dio a nadie). La prosa de
  `battle_turn` dice la regla entera. `pnpm qa` dice si un `aim` del agente cruzó, sin exigirlo.

- Consultas: `game_state`, `battle_state`, `map`, `creature_stats` (con `strength`, `agility` y
  `weight`, la fuerza, la agilidad y lo que pesa lo de serie, 25-10-2026; con `dwelling`, el edificio
  que la produce, `equipment` por slot, `armor`, `level` y `powerIndex` derivados:
  `fichaDeCriatura`, campo a campo; desde el 26-10-2026, `mapSpeed`, lo que cuenta en la marcha del
  mapa, `marchaDe`, y montado de guerra con lanza `chargeDamage`, la horquilla de su carga),
  `spell_list`, `building_list`. El equipo va por los seis
  slots (`melee_weapon`, `second_melee_weapon`, `ranged_weapon`, `armor`, `shield`, `mount`; `equip`
  lleva `slot: "second_melee_weapon"` para la segunda mano, 25-10-2026; un caballo va a `mount` sin
  decirlo) y cada stack lleva su `armor`, su `strength` y su `agility` (la que le deja el peso;
  montado de guerra, la entera). La prosa de EQUIPO explica la MONTURA (de guerra en batalla, de
  silla solo en el mapa, el más lento del grupo con el héroe) y la de la CARGA, la montada. La tropa veterana y el héroe llevan `rank` y `level`; el stack, `veteranRank`; el
  `equipment` de un veterano es solo lo suyo (lo de serie, en `creature_stats`).
  Solo por los jugadores del agente, y **todo
  pasa por la niebla**: crónica, mapa (`serializeKnownMap`, la misma llamada para
  el turno y la tool) y batallas ajenas.

- El agente **defiende** sus batallas (`BattleTakeover`: si te la quedas, la
  cierras) y **diseña el mapa**: un plan declarativo, con el nivel de cada región
  si quiere (#209) y sin posiciones de inicio (cada jugador de `want.players` con su ciudad, y su
  héroe empieza dentro), que valida `validateMapPlan` (también el recinto de cada ciudad: ni en el
  borde, ni dos a menos de 5, ni nada dentro, y cada región que llega a una ciudad con su camino por
  una de sus puertas, `problemasDeRecintos`; la prosa se lo dice con las cifras del núcleo, y sus
  casillas de camino se unen en el recinto solo de un acceso a su puerta y de la puerta a la ciudad,
  `tramoDelRecinto`). Si falla por cualquier motivo, se juega el procedimental y se le dice por qué;
  no hay reintento.

- **El oro en el contrato** (21-10-2026): `you.gold` (un número) y `you.income` (`total`, `towns`
  y `villages`, de `rentaDelDia`: todo pueblo suyo, el cortado de la base con `connected: false` y 0,
  como la ciudad, 05-11-2026); todo `cost` es un número de oro. Un plan con `mines` o
  `resources` se rechaza diciéndolo.

- **El clima** (22-10-2026, decisiones del usuario: por región, lo pide el narrador y la noche
  también): el `adventure_turn` admite `weather`, una lista de `{ at, weather?, night?, days? }`
  (con el tiempo, la noche o los dos; de 1 a `diasMaximos` días, como mucho `porTurno` por turno y
  una vez cada región), que el director aplica **antes** que las acciones (`pedirClima`); cada pedido
  malo se descarta con su motivo en el veredicto (tras `weather`) y lo aceptado va en la nota
  (`notaClima`, una vez para el registro y la nota). **El esquema no tipa las entradas**
  (`weather: z.unknown()`): una mal escrita —un tiempo de 18 letras, `days: 1.5`, `night: "si"`— la
  juzga `climaBlocker` y se descarta sola, y de las que pasan de `PEDIDOS_QUE_SE_MIRAN` (16) se dice
  que no se miran; con los tipos en el esquema, una tumbaba el turno entero (H1 del QA, 22-10-2026). Es presentación, como las voces: ni crónica ni
  banco. La petición trae
  `world.weather` (el clima de hoy de las regiones exploradas, con `until` lo pedido), y la prosa le
  dice que la noche la pone la narrativa y que las tierras de los no muertos son más nocturnas. Lo
  cruza `pnpm qa` (una tormenta y un «granizo», y el fotograma del espectador).

- **Los lugares de un mundo, aún no** (F4): el agente los ve en `knownMap` (`kind: "place"`, la
  palabra de sus hechos, desde el 10-11-2026; con
  su `name`; su estado no viaja) y su prosa le dice que no hay jugada para entrar. La acción del núcleo
  (`elegir_en_lugar`) no está en su contrato. El espectador los pinta con su marcador y tampoco ve su
  estado.

- **La ocupación en el panel del espectador** (11-11-2026, #303,
  `docs/agents/2026-11-11-duenos-en-la-vista/`): la sección «Ocupados» (`ocupados`,
  `espectador/paneles.ts`) dice cada ciudad y pueblo ocupado ahora, de quién es y quién lo ocupa
  (un héroe con su jugador y su nombre, una guarnición de un jugador o neutral); sin ninguno, no
  sale. Lee `SpectatorView.sitios`, los mismos de los que sale la marca del mapa (`sitiosDelCable`):
  el cable no cambia. Lanza si el cable no cuadra (un sitio ocupado sin su ciudad o su pueblo, un
  héroe que no viaja). **El dueño sabido sigue copiado en `owner`** (`conLosDueñosSabidos`):
  sacarlo a `VistaMapa.dueños` se descartó, porque cada lector de una ciudad tendría que acordarse
  de ir a buscarlo y el que leyera `owner` recibiría el `null` guardado sin avisar.

- La partida termina con un `game_over` explícito. `state.finished` es
  `{ winner: PlayerId | null } | null`; el tope de días es `GameState.maxDays`.

- Del contrato se exportan esquemas, no alias de tipo.
