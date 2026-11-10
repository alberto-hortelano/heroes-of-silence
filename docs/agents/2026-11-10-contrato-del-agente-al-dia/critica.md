# Crítica — el contrato del agente, al día

**REENCUADRADA.** El problema es real, pero una de las tres jugadas (la defensa) no es una jugada de
`adventure_turn` ni puede serlo sin regla nueva; #292 es bastante mayor de lo que dice su issue; y
dos candidatos no tienen sujeto tal como están escritos (licenciar, #308).

## El problema real
El agente juega con un contrato anterior a las guarniciones y los puestos: hay dos acciones de
aventura que la persona tiene y él no, y lee el mismo hecho con dos vocabularios (`palisade` en
`knownMap`, `empalizada` en `recentEvents`). La tarea lo ataca; lo que falla es el alcance.

## La premisa, afirmación por afirmación
| Afirmación | Verificación |
|---|---|
| «Tres jugadas en `adventure_turn`» (#291) | **Dos sí, una no.** `repartir_tropa` y `mejorar_el_puesto` son `AdventureAction` (`src/core/state/tipos.ts:330,340`) y solo las quita un `Exclude` (`src/core/contract/vocabulario.ts:119-129`). La defensa no es una acción: `elegirLaDefensa` es una función suelta (`src/core/state/batallas.ts:615`) |
| La defensa se puede fijar de antemano | **Falso.** `defensaPosible` exige `pendingBattle` con un héroe suyo defendiendo, `pending.defensa` y la batalla sin empezar (`batallas.ts:509,531-549`). No hay estado donde guardar una orden previa: nace en `dejarPendiente` con `defensaDeLaIA` (`batallas.ts:308-315`) |
| Mejorar y repartir existen con sus `*Blocker` | Cierto (`src/core/state/sitios.ts:586,1097`); `upgrade` sale de `UPGRADE_DE_MEJORA` (`src/core/contract/mapa-conocido.ts:78`). La línea del veterano lleva la clave `veterano` (`sitios.ts:1014-1016`); `leave_troops` usa `veteran` |
| `power` y `retoque` pasan tal cual (#292) | Cierto (`vocabulario.ts:435-449`). Pero **`retoque` solo lo emite la arena** (`src/core/arena/retoque.ts:188,249,336,386`): a una partida del agente no llega |
| Los hechos de aventura no se traducen | Cierto: `recentEvents: cronicaPara(...)` crudo (`src/core/contract/aventura.ts:358,435`) |
| Son tres hechos (#292) | **Son unas 25 claves.** Batalla (`src/core/battle/types.ts:331-471`): `move.corre`, `attack.punto/parado`, `blast.cuarto/parado`, `shoot.parado`, `cast.diferido/parado`, `power.poder/cura/diferido`, `spell_hit.cura/parado`, `triggered.cuando`, el `kind: "cruce"`. Aventura (`src/core/state/events.ts`): `faltan` (`:142,272`), `lugar`/`marca`/`nombre`/`estado`/`dicho` (`:149-170`), `Ocupante` con `"heroe"`/`"guarnicion"` y `dueño` (`:74-75`; la vista del mismo hecho dice `hero`/`owner`/`garrison`, `src/core/contract/vistas.ts:104-108`), `veterano` (`:339`), `foe.kind: "lugar"` (`:50`), `outpost_upgraded.to` (`:251`). La prosa cita varios (`src/core/contract/formato.ts:532,584,600`) |
| Criterio 7: el espectador lee lo que cambie | **Sin sujeto**: recibe `state.log` crudo (`src/server/vista-espectador.ts:116`), no los hechos del contrato. Solo importaría con #298 dentro |
| Criterio 8: `pnpm qa` cruza las tres | El arnés **no ve ni un nodo** en su semilla (`tools/qa/agente/verify-agent.ts:794-798`) y juega 6 turnos (`tools/qa/agente/partida-del-arnes.ts:50`). Mejorar pide un héroe en un paso suyo; la defensa, que la IA ataque a su héroe en un sitio suyo con guarnición. Sin buscar semilla (como `exigeLaMuralla`, `verify-agent.ts:730`) no sale |
| #308: `barrera`, «que sí manda en los nodos» | **Falso.** El nodo lleva `kind, id, at, owner, upgrade, lastSeen` (`mapa-conocido.ts:72-80`); `barrera` no está en `src/core/contract/` fuera de la prosa. El pueblo ya lleva `node` (`mapa-conocido.ts:65`) |
| #298: el rival infiltrado no se distingue | Cierto: `enemyHeroes` lleva `id, owner, at, army` (`aventura.ts:345-352`). No es `knownMap`, como dice el issue |
| Licenciar en el mapa falta en el contrato | **Ya está.** `dismiss` en el zod (`src/core/contract/esquemas.ts:40`), la prosa dice «esté donde esté» (`formato.ts:284`), la regla es la del 09-11 (`src/core/state/heroes.ts:46-52`) y `pnpm qa` lo exige (`verify-agent.ts:786-788`) |
| Sobrantes y lugares, fuera del contrato | Cierto: `settleBattle(state, ctx)` sin `dejados` (`src/server/director.ts:649`; `src/core/state/cierre.ts:60`); `elegir_en_lugar` no está en el zod (`src/server/notas.ts:679-682`) y el estado del lugar no viaja (`mapa-conocido.ts:99-102`) |

## Pregunta abierta 1: cuándo se fija la defensa
**Solo al ser atacado, y antes de la primera jugada.** El valor por defecto de `requisitos.md` (una
jugada de `adventure_turn`) es imposible sin una regla nueva (una orden de defensa guardada en el
estado), y eso está en «Fuera de alcance».
Hoy, para el agente: `dejarPendiente` aplica `defensaDeLaIA` al nacer la batalla y el director
entra en `playBattle` (`director.ts:534`), en el turno del rival (`takeover`, `:235`) o en el suyo
(`:489`), y pide directamente el primer `battle_turn`. La única ventana está ahí, y abrirla es una
petición nueva (séptimo `REQUEST_KINDS`, `esquemas.ts:329`, con su `EN_SU_LUGAR`) o un campo en una
existente, no zod y prosa como las otras dos. Además `elegirLaDefensa` **sustituye**
`state.pendingBattle` por una batalla recién montada (`batallas.ts:625`) y `playBattle` guarda
`pending.battle` en una constante (`director.ts:545`). De antemano el agente ya decide qué deja en
la guarnición (`leave_troops`); no puede dejar a alguien fuera: `defensaDeLaIA` mete lo más fuerte
que quepa (`sitios.ts:1326`).

## Qué entra y qué no
| Pieza | Veredicto | Motivo |
|---|---|---|
| Mejorar el puesto | **Entra** | Acción de aventura que ya existe: zod, traducción y prosa |
| Repartir tropa | **Entra** | Igual. Decidir aquí si `leave_troops`/`take_troops` siguen: serían tres jugadas para lo mismo |
| #292 | **Entra, con lista cerrada** | Hacerlo a medias es lo que produjo el issue; el `switch` sin `default` lleva la cuenta |
| Elegir la defensa | **Sale a un issue nuevo, con los sobrantes** | Son dos decisiones al borde de una batalla (antes, `director.ts:534`; después, `:649`), ninguna es acción de aventura y piden el mismo mecanismo nuevo: hacerla sola lo paga dos veces. Ahí vive también «el agente aún no despliega» (`director.ts:546-551`) |
| Sobrantes | **Fuera** (ese issue) | Lo dicho; solo ocurre tras levantar cadáveres |
| #308 | **Fuera, y corregir el issue** | Premisa falsa; `barrera` solo en el pueblo crearía la asimetría que denuncia, y no dice para qué la usaría el agente |
| #298 | **Fuera** | El issue no dice qué significa el campo (¿puede infiltrarse o está intocable ahora?) y su otra mitad es el panel del espectador y una partida de QA con infiltración: otra área y otro arnés |
| Licenciar en el mapa | **Obsoleto** | Ya está en el contrato y en `pnpm qa` |
| Entrar en un lugar | **Fuera** | No es abrir una acción: hay que serializar el estado del lugar, su árbol y qué opciones valen (`opcionBlocker`). Es F4, tarea propia |

## El día después
- Quien juega contra el agente puede verle amurallar un paso y cambiar tropa en una guarnición
  llena; la defensa sigue como hoy. Los nombres de hoy de los hechos se cierran (sin compatibilidad,
  ya decidido): la prosa de `formato.ts` cita `cuarto` y `diferido`, y cambia a la vez o miente.
- Lo que nadie borrará: los «backlog» de `vocabulario.ts:119-121` y de `docs/areas/agente.md`. Las
  frases «aún no hay jugada» de DEFENSA y LO QUE SOBRA (`formato.ts:268-281`) **se quedan**.
  No contradice `CLAUDE.md`; `pnpm banco` no debe moverse (no se toca `core/ai`).

## Conflictos
- **Ramas sin fusionar: ninguno.** De las diez de `git branch --no-merged main` solo
  `claude/army-game-theme-ui-28d2ad` (18-10) toca contrato o servidor, y es anterior a la
  reorganización. Las ramas que citan los issues ya están en `main`: el «sin fusionar» de #298 y
  #308 caducó. Ningún otro worktree tiene cambios sin commitear en `src/core/contract/` ni
  `src/server/`; no hay PR abiertos.
- **#294** (solapa con repartir): cambiar un veterano por otro del mismo tipo escribe `left` y
  `taken` iguales en `troops_exchanged`, y el agente lo leerá así. No bloquea; no es hallazgo nuevo.
- **#303** toca lo mismo que #308 y #298 (dueño derivado, espectador): otro motivo para no
  meterlos. **#290, #296, #301** (IA de respaldo): independientes.
- **Dependencia interna**: la obra de la jugada (criterio 2) y `outpost_upgraded.to` (criterio 6)
  van juntas, o el agente escribe una palabra y lee otra.

## Coste contra valor
Mejorar y repartir: baratos, cierran dos «backlog». #292 entero: mecánico pero ancho (prosa y
arnés incluidos). La defensa es lo más caro (mecanismo nuevo y semilla de QA difícil) para una
decisión que hoy toma una regla razonable: sin hacerla, el agente sigue defendiendo con lo más fuerte.

## Qué le cambiaría a `requisitos.md`
- **Alcance, núcleo**, sustituir por:
> - **#291, dos de tres**: mejorar el puesto y repartir tropa en `adventure_turn`. La defensa sale a
>   un issue nuevo con «elegir lo que sobra»: el núcleo solo deja elegirla con la batalla pendiente
>   y sin empezar (`defensaPosible`), no en el turno de aventura.
> - **#292**: todo hecho que llega al agente, de batalla y de aventura, sin claves ni valores de
>   enumerado en español; la lista cerrada sale de `BattleEvent` y de `Cuerpo` (`state/events.ts`).
>   `retoque` solo lo emite la arena: su caso existe para que el `switch` siga exhaustivo.

- **Candidatos**: «Ninguno entra. #308 y #298 siguen en su issue con la premisa corregida; licenciar
ya está en el contrato; sobrantes va con la defensa; lugares es F4.»
- **Criterios**: borrar el 1. En el 3, añadir «las líneas van en el vocabulario del contrato
(`veteran`, como `leave_troops`)». En el 4 y el 8, «las dos jugadas». El 7, por «El espectador no
cambia: lee `state.log`, no los hechos traducidos». Al 8, añadir «el arnés busca una semilla con un
paso del agente (hoy no ve ninguno); si no la hay, lo dice y lo cubre un test del director». En el
9, DEFENSA y LO QUE SOBRA siguen como backlog. Preguntas abiertas: respondidas las dos.
- **Para pegar en los issues**: #291, «la defensa pasa a #nuevo: no es acción de aventura»; #308, «el
nodo de `knownMap` no manda `barrera` (`contract/mapa-conocido.ts:72-80`): decir para qué la quiere
el agente y pedirla en los dos o en ninguno»; #298, «el campo va en `enemyHeroes`
(`contract/aventura.ts:345`); falta decir si es "puede infiltrarse" o "está intocable ahora"».
