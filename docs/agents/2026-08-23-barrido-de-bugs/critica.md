# Crítica — Barrido de bugs del núcleo

**#46 VIGENTE · #13 VIGENTE · #8 VIGENTE · #9 REENCUADRADA.** Y el orden está
del revés: **#8 depende de #9**, no al contrario.

## El problema real, uno por issue

- **#46** — Un edificio cobra 8000 de oro, 20 gemas y el día de construcción a cambio de nada. La solución propuesta (rechazar) ataca el problema.
- **#13** — La curva de progresión del castillo no existe: el nivel de morada no cuesta tiempo, solo oro. Ataca el problema.
- **#8** — El motor le miente al jugador *y al agente* sobre lo que hace una criatura. Ataca el problema.
- **#9** — No es «los hechizos no caducan»: es que **el motor no tiene el concepto de efecto temporal**, y esta tarea va a fabricarle el primer consumidor real en #8. La solución propuesta ataca medio problema y medio problema que aún no existe.

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| #46 · `bone_dragon` sin `upgradesTo`, `upgrade_6` existe para las dos facciones | **Cierta.** `data/creatures.json:35` no lo lleva; `data/buildings.json:24` no distingue facción |
| #46 · se paga y no cambia nada | **Cierta, ejecutada.** `buildBlocker(cripta,'upgrade_6',bolsa)` → `null`; `build()` cobra 8000 oro + 20 gemas, pone `builtToday=true`, y `available` sigue `{"bone_dragon":1}`. En caballero sí convierte a `crusader` |
| #46 · cita `town.ts:105-113` | **Desplazada:** el bloque real es `src/core/town/town.ts:106-114` |
| #46 · el cliente encadena `dwelling_6 → upgrade_6` para ambas | **Cierta**, pero la cita se movió: es `src/client/render/town.ts:48-56`, línea 50 |
| #46 · «la regla es general» | Cierta como guardia, pero **hoy tiene exactamente un caso**: los otros diez niveles con `upgrade_N` tienen su `upgradesTo` |
| #13 · solo cinco edificios tienen `requires` | **Cierta.** `data/buildings.json`: `town_hall`, `city_hall`, `castle`, `mage_guild_2` y los cinco `upgrade_N` |
| #13 · se levanta `dwelling_6` el día 1 | **Cierta, ejecutada.** Pueblo recién creado → `buildBlocker(dwelling_6)` = `null` → construido, `available:{"paladin":2}` |
| #13 · «se salta la curva» | **Cierta y ya está pasando sola**: 60 días de partida IA contra IA (semilla 7) y **las dos facciones levantan `dwelling_4` el día 1**, sin pasar por la 2 ni la 3 (`chooseBuilding` prioriza `100+dwellingLevel`, `strategy.ts:160-174`) |
| #8 · los cuatro rasgos no se leen | **Cierta.** `charge`, `fear`, `curse_on_hit` y `splash_shot` aparecen **solo** en la declaración `src/core/types.ts:73-76`. Los otros siete sí se leen (`battle.ts:106,198,421,432,469,487`, `damage.ts:76`) |
| #8 · cita `src/core/battle/types.ts:73-77` | **Falsa en el issue** (ahí está `BattleState`). `requisitos.md` ya la corrigió a `src/core/types.ts:66-77`, que es exacta |
| #8 · «pagas por una unidad que no hace lo que dice su ficha» | Cierta **y peor**: `src/core/contract/serialize.ts:134` manda `traits` al agente en cada `battle_turn`. La mentira está en el contexto de decisión del agente, no solo en la imaginación del jugador |
| #9 · `speedBonus` es permanente | **Cierta, ejecutada.** Lentitud sobre un esqueleto: velocidad 4 → 2, y seis rondas después sigue en 2. `spells.ts:61` suma y nadie resta; `beginRound` (`battle.ts:251-257`) no lo toca |
| #9 · un no-muerto acepta Bendición y Curación | **Cierta, ejecutada.** Bendición sobre `skeleton` → `luck = 1`. `castHeroSpell` (`battle.ts:517-553`) no mira rasgos |
| #9 · «nadie puede lanzarlos salvo el agente por MCP» | **FALSA. Tampoco el agente.** `battle.ts:526` rechaza todo lo que no esté en `hero.spells`, y `legalActions` (`battle.ts:586`) solo recorre esa lista — que el contrato le vende al agente como exhaustiva (`agent.ts:177`). Ejecutado: al héroe inicial `legalActions` le ofrece `['magic_arrow']` y `cast slow` devuelve `el héroe no conoce "slow"`. **Nada escribe nunca en `hero.spells`**: solo `setup.ts:76` (`['magic_arrow']`) y `game.ts:405` (`[]`). Controladores capaces de lanzar Prisa hoy: **cero** |

## El día después

- **#46** — Para quien juega, hoy casi nada: el humano es caballero (`generate.ts:190`) y solo ve un castillo nigromante si captura `town-1`. Quien deja de quemar 8000 de oro es la IA. El criterio 5 **no es adorno**: si `buildBlocker` rechaza pero el solar sigue encadenando `upgrade_6`, cambias una mentira por otra —una parcela punteada que nunca se puede levantar.
- **#13** — Cambia de verdad la partida: la IA deja de saltar a nivel 4 el día 1 y sube por la cadena, así que su ejército del mes 1 será otro. Ojo, es **rebalanceo encubierto**, no solo una regla. Cierra una puerta: `data/buildings.json` tiene **un solo juego de moradas compartido por las dos facciones**, así que una cadena por facción (como la de fheroes2) exige reestructurar el JSON. Si se fija uniforme ahora, #26 hereda esa forma.
- **#8** — Es el grueso de la tarea: cuatro mecánicas nuevas, no cuatro arreglos. Dos avisos concretos: `fear` no hace nada contra un ejército no-muerto, porque `battle.ts:106` fuerza `morale: 0` a los no-muertos — y una de las dos facciones lo es entera; y la moral se calcula **una vez** en `createBattle` y nunca se recalcula. `splash_shot` tiene un hueco en el criterio: no dice si la salpicadura alcanza también a los aliados adyacentes (en el original, sí).
- **#9** — Si se hace tal como está escrito, **para quien juega no cambia absolutamente nada**: ni hoy ni después, hasta que #2 reparta hechizos. Lo que se borraría y nadie borrará: un campo `effects` en el contrato del agente que llega siempre vacío, congelado antes de que exista quien lo llene.

## Conflictos

- **#8 depende de #9 (dependencia oculta, y es la importante).** `curse_on_hit` aplica maldición sin héroe y sin hechizo: en cuanto la momia funcione, deja `luck −1` **permanente y acumulable** hasta −3 en tres golpes. Es decir, **#8 tal y como está escrito introduce una instancia nueva del bug de #9**. Hacer #8 antes que el modelo de efectos es pagar dos veces.
- **#9 depende de #2 para la mitad de sus criterios.** Inmunidad a Bendición y a Curación solo se ejerce por un lanzamiento de héroe, y ningún héroe tendrá esos hechizos hasta #2. **Inmunidad a Maldición sí tiene consumidor dentro de esta tarea**: la momia del #8 maldiciendo esqueletos en un espejo nigromante.
- **#4 y #24 no chocan, pero son los que hacen visible a #9.** Verificado: `main.ts:235-253` solo emite `shoot`/`attack`/`move`, y `chooseBattleAction` (`tactics.ts:50-96`) solo devuelve `defend`/`attack`/`move`.
- **Solapamiento menor con #20**: ambos editan las mismas filas de `data/buildings.json`. Es conflicto de merge, no de decisión.
- **Con #7, interacción positiva**: si la cadena de #13 exige `castle` en los niveles altos, el edificio deja de ser un no-op de 5000 de oro sin tocar `hasWalls()`.
- Contra `CLAUDE.md`: nada. La tabla de la pantalla de castillo (`lvl1…lvl6: dwelling_N → upgrade_N`) queda desactualizada con el criterio 5 de #46 y hay que retocarla.

## Coste contra valor

**#46 y #13 son la mitad barata y la que más rinde**: dos ficheros de datos, un `if` y unos tests; corrigen algo que ya está pasando en cada partida. Si no se hicieran nunca, la IA seguiría tirando oro y el castillo seguiría sin curva.

**#8 es el gasto real** y su valor es proporcional: son las criaturas que ya se compran. Merece la pena, pero no es «barrido de bugs», es cuatro mecánicas.

**#9, como está escrito, es la única parte cuyo valor hoy es cero medible.** Ahora bien, «no hacer nada» tampoco es la respuesta: el modelo de efectos con turnos restantes deja de ser sustrato especulativo en cuanto entra `curse_on_hit`. Lo que sí sobra es el resto. Y el criterio 5 es más barato de lo que parece: el contrato ya manda `speed`, `luck` y `morale` ya calculados (`serialize.ts:127,135,136`), así que las consecuencias observables ya viajan; lo único nuevo sería «cuántas rondas quedan». No hace falta abrir esquema zod ni `RESPONSE_FORMAT` para cerrar #9.

## Qué le cambiaría a `requisitos.md`

1. **Reordenar: #46 · #13 · #9(duración) · #8.** Añadir: *«#8 y #9 no son independientes. El modelo de efecto con turnos restantes entra ANTES que `curse_on_hit` y `fear`: implementarlos sobre el motor de hoy vuelve a crear el bug que #9 arregla.»*
2. **Sustituir el criterio 3 de #9** por: *«Un no-muerto es inmune a Maldición —incluida la que aplique `curse_on_hit`—. La inmunidad a Bendición y a Curación se aplaza a #2: hoy ningún héroe conoce esos hechizos, así que la regla no se puede ejercer ni probar de extremo a extremo.»*
3. **Corregir la pregunta abierta 1**, que hoy es falsa: *«Ni siquiera el agente por MCP puede lanzar Prisa: `battle.ts:526` rechaza lo que no esté en `hero.spells` y `legalActions` solo recorre esa lista. Hoy pueden lanzarlos cero controladores.»*
4. **Rebajar el criterio 5 de #9** a: *«La duración es observable en el estado del stack y en el registro de batalla. No se abre esquema zod ni `RESPONSE_FORMAT`: el contrato ya manda `speed`, `luck` y `morale` con el efecto aplicado. Si no se toca `src/server/`, no hace falta `pnpm qa`.»*
5. **Cerrar el hueco de `splash_shot`** (#8, criterio 4): decir si la salpicadura alcanza también a los aliados adyacentes al objetivo.
6. **Añadir a #8, criterio 2**: *«`fear` no puede apoyarse en la moral tal cual: `battle.ts:106` la fija una sola vez al crear la batalla y la fuerza a 0 en los no-muertos, así que contra el nigromante no haría nada.»*
7. **Añadir a #13**: *«`data/buildings.json` tiene un solo juego de moradas para las dos facciones. Si la cadena debe ser por facción, eso es reestructurar el fichero y hay que decidirlo explícitamente; si se deja uniforme, decirlo también, porque #26 lo hereda.»* Y avisar de que el cambio **rebalancea la IA**: hoy levanta `dwelling_4` el día 1.
8. **Corregir las citas desplazadas**: `town.ts:106-114` (no 105-113) y `src/client/render/town.ts:48-56` (no 47-55).
9. **Nota de proceso** (primera vuelta del ciclo): los issues citan `fichero:línea` y ya hay dos citas rotas de cuatro —una de fichero equivocado. Vale la pena que el coordinador siga verificándolas al redactar `requisitos.md`, como hizo con #8.
