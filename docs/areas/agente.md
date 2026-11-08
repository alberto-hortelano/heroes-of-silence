# El agente

Se lee antes de tocar: `src/core/contract/`, `src/server/`, `src/client/espectador/`, `tools/qa/agente/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### Los golpes y los poderes en el contrato (19-10-2026)

`HIT_DE_GOLPE` (`offensive`, `strong`, `feint`, `defensive`, `quick`, `guard_break`, `normal` y los fusionados `offensive_strong`, `defensive_feint`, `quick_guard_break`), `hitsDeLaRueda(forma)`, `golpeDelHit(hit, forma)` (lanza diciendo cuáles valen en la rueda de la batalla), la rueda dicha, `ruedaAlAgente` (`wheel`: `types`, `ring`, `center`, `crossing`), `accionDeBatallaDelAgente` (lo que manda el agente: `attack.hit` → el golpe, `power` → el poder), `accionAlAgente` (la lista legal al revés) y `hechoAlAgente` (el `cruce` del registro con `hit` y `response`), en `contract/vocabulario.ts` con los huecos; la petición de respuesta, `serializeBattleResponse` (recibe solo los dos ids: no puede contar el golpe del otro; lo vigila `invariantes-batalla.test.ts`, «el agente elige en la rueda»)

### Por qué una marcha no llegó (veredicto del agente)

`paradaDeLaMarcha` → `notaMarchaParcial` (`server/notas.ts`)

## El agente

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
antes del destino (`battle_started` con `faltan`).

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
  la prosa de la aventura y la de `battle_turn` dicen qué es. `repartir_tropa` (la pantalla de la
  persona) no está en su contrato: que no pueda cambiar uno por otro con los dos llenos, backlog.
  `pnpm qa` deja y recoge una vez y falla si no cruzan.

- **Los puestos** (04-11-2026, fase 3): cada nodo de `knownMap` lleva `upgrade` (`none`, `palisade`
  o `wall`, `UPGRADE_DE_MEJORA`), el último que vio como su `owner`, y la prosa (PUESTOS, y la de la
  muralla) dice tras qué muralla se pelea en el paso, en una línea. **La jugada de mejorar no está en su
  contrato** (backlog; `mejorar_el_puesto` sale de `AccionDelAgente`), ni la traducción de los hechos
  de aventura: `outpost_upgraded` le llega con `to` en español (backlog, con `power` y `retoque`). `pnpm qa` exige el
  `upgrade` en todo nodo que llegue (en la semilla del arnés el agente no ve ninguno, y lo dice).

- **La muralla** (04-11-2026, fase 2 del puesto fronterizo): el `battle_turn` trae `walls` (`null`
  sin muralla; si no, `material`, los muros en `tiles`, las puertas en `gates` con `open` y las
  escaleras puestas en `ladders`, cada una con `foot` y `wall`), y cada stack que aún la lleva,
  `ladder: true`. Las cuatro jugadas, `place_ladder` y `climb` (`wall`), `open_gate` y `close_gate`
  (`gate`: `{ a, b }`), salen de una tabla, `JUGADA_DE_MURALLA` (`vocabulario.ts`: su inversa, el zod,
  la prosa y lo que exige el arnés, `JUGADAS_DE_MURALLA`); las traduce `accionDeBatallaDelAgente` y
  al revés `accionAlAgente`, las dos con un `switch` exhaustivo sobre `BattleAction['type']` **sin
  `default`** (antes el `default` las dejaba pasar en español), y `hechoAlAgente`, también sin
  `default` y con su tipo escrito (`HechoAlAgente`: un hecho nuevo sin su caso no compila), cuenta
  `ladder_placed` y `gate_*` con `escaleraAlAgente` y `puertaAlAgente`, las mismas de `walls` (`power`
  y `retoque` siguen con campos en español: backlog). **La prosa de la muralla va solo en el turno de
  una batalla con muralla** (`PROSA_DE_LA_MURALLA`, que `formatoDeLaRespuesta` añade al formato de
  `battle_turn` si `walls` no es null; la regla, `reglaDeLaMuralla`, la de la arena): eran ~2,2 KB en
  cada turno, también contra monstruos. Se descartan una a una con su `*Blocker`. `pnpm qa` busca una
  semilla donde el agente mande alguna en una batalla con `walls` y falla si ninguna entra
  (`exigeLaMuralla`), y también si un turno con `walls` llega sin la prosa o uno sin ellos la trae.

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
  cuenta `thrown` y un `blast` por alcanzado (`target`, `damage`, `cuarto`). `creature_stats` dice
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

- **Los lugares de un mundo, aún no** (F4): el agente los ve en `knownMap` (`kind: "lugar"`, con
  su `name`; su estado no viaja) y su prosa le dice que no hay jugada para entrar. La acción del núcleo
  (`elegir_en_lugar`) no está en su contrato. El espectador los pinta con su marcador y tampoco ve su
  estado.

- La partida termina con un `game_over` explícito. `state.finished` es
  `{ winner: PlayerId | null } | null`; el tope de días es `GameState.maxDays`.

- Del contrato se exportan esquemas, no alias de tipo.
