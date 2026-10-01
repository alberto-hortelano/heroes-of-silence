# QA — el personaje pelea solo (fase 2)

Validado contra `requisitos.md`: la petición literal, los criterios 1 a 8 y la corrección del 30-09. El criterio 5 se lee con `BattleStack.unit` + `body`, y el cuerpo es el centinela `CHARACTER_BODY`. Lo aplazado en `hallazgos-simplify.md` no cuenta como hallazgo: la unión discriminada de `Stack`, los lectores de `Army`, `takeGarrison`/`addToArmy` y el escritor único de PV. No he tocado código de producción. Las sondas de guardia se plantaron en un fichero **nuevo**, `src/core/zz-sonda-qa.ts`, que borré después. `git status` quedó igual que al empezar.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | `Character` con reparto 8..16, 18 puntos, 4 razas sin cifra, 4 profesiones +2/+1. Un reparto ilegal lanza con una frase para la persona | ✅ | `src/core/rpg/character.ts`: `characterBuildBlocker` + `createCharacter`, con frases como «reparte exactamente 18 puntos: llevas 20» o «destreza 17: el máximo es 16». Los tests de `personaje.test.ts` están en verde. Falta `experience`: se quitó a propósito (simplify 5) y el docstring lo explica. Queda como desviación aceptada por el coordinador |
| 2 | `GameState.characters` por id, ausente en estrategia, sin lectores en estrategia | ✅ | `grep` de `characters` en `src`: solo lo leen `characterOf`, `membersOf` y `woundsFromBattle`. Test `'characters' in newGame(...) === false`. `membersOf` devuelve `undefined` sin miembros, y entonces `battleSideForHero` no añade la clave `members` |
| 3 | `Stack.member` con `count: 1`. `count ≠ 1` lanza | ✅ | `resolveUnit` lanza «un personaje es uno solo: "x" viene en un stack de 2». Lanza al **entrar** en batalla, no al montar el ejército. Es lo que decidió el plan |
| 4 | `rpg/stats.ts` puro. Cada atributo mueve una cifra de combate. Tabla y test | ✅ | `combatProfile` usa solo `Math.floor`. Tabla en el docstring y test «subir cada atributo 4 cambia el perfil». Duelo de dos «tanques» (res 16, int 16, fue 8): ataque 4, defensa 9, daño [3,7], PV 44. Termina en 12 acciones |
| 5 | Un único accesor (`unit`) sustituye todas las lecturas `creature(s.creature)` de batalla. El guardia se ve morder | ✅ con reserva | `grep "creature("` en `src`: no queda ninguna lectura desde un `BattleStack`. Las que quedan son lectores de `Army`/catálogo, aplazados. `tsc` impide `s.creature`. La regex muerde con `creature(s.body!)`, `creature(s.body as string)` y `creature(String(s.body))`. **No ve cuatro formas** (hallazgo I-1) |
| 6 | Duelo 1 contra 1 con el motor del núcleo y `tactics.ts` en los dos lados | ✅ | Tests de `personaje.test.ts` en verde. Además crucé las 4 profesiones contra las 4 con las semillas 1, 7 y 91: **48/48 duelos terminan**, entre 6 y 21 acciones, y ninguno llega al tope de 2000 |
| 7 | Heridas persistentes tras `settleBattle`. A 0 PV no reaparece | ✅ | Tests C7 en verde: gana herido, cae, defensor que cae, y el herido entra con sus PV. Añadí un caso sin test: **defensor con personaje que GANA**. Doce arqueros contra personaje + 60 esqueletos, semillas 41/42/43: `winner: defender`, `topHp` final 24/17/17 = `characters.bera.hp` 24/17/17, y el slot 0 vuelve como `{creature:'character', count:1, member:'bera'}` |
| 8 | Sha del banco intacto, `verify` y `qa` en verde, todo inerte en estrategia | ✅ | Salidas abajo |

### Salidas de la condición dura
```
pnpm verify → Test Files 19 passed (19) · Tests 459 passed (459)
pnpm banco  → sha256: 297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767
              líneas: 32177 · sin terminar: 0/200
              ancla: igual — las 200 partidas se juegan hexágono a hexágono igual
pnpm qa     → 19 veredictos, 19 entraron, 0 descartadas
              consultas: battle_state, building_list, creature_stats, game_state, map, spell_list
              1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla · exit=0
```

### Navegador (flujo real, estrategia)
- Arranqué `pnpm dev` con `set -m` en su propia línea. DEV=1840105 tenía pgid 1840105, y el vite que tenía el puerto 3100 era el pid 1840124, con pgid 1840105 y cwd `/home/al/code/heroes`. Maté el grupo y comprobé con `ss` que 3100 quedaba libre.
- `?seed=31`: hice clic en el monstruo de 5 momias. El tablero muestra los sprites, las peanas y el recuento. El panel dice Campesino 25 / Arquero 8 / Momia 5, con moral/suerte 1/0. «Resolver sola» cierra la batalla con **experiencia 125** y maná 14/20. Es la misma cifra que anotó el ingeniero.
- `?seed=7`: batalla contra campesinos. Pinta bien.
- La consola no dio **ningún error** en ninguna de las dos cargas.
- Algo que parecía raro: el defensor aparece en la columna ~6 en la ronda 1. Lo comprobé. En el núcleo arranca en la col 10 (`forzarBatalla` con semilla 7: `defender-0 col10 row4`), y `session.advanceEnemyTurns` le deja mover antes que el campesino, que es lento. Es el comportamiento de siempre, no una regresión.

## Hallazgos

### Importante

**I-1. El guardia «las cifras salen de `unit`» no ve formas realistas, y dos de ellas las produce el propio repositorio.**
Reproducción: crea `src/core/zz-sonda-qa.ts` con las líneas de abajo y corre `npx vitest run test/invariantes.test.ts -t unit`. Salen rojas p5, p6 y p7, y se cuelan las otras cuatro:
```ts
export const p1 = creature(stackById(st, 'x').body).hp;   // se cuela: [^)]* se para en el ')' de la llamada interior
export const p2 = creature(
  s.body,
).hp;                                                      // se cuela: el guardia mira línea a línea
export const p3 = creature(s['body']).hp;                  // se cuela
export const p4 = [s.body].map(creature);                  // se cuela
```
- **p1** es la forma natural en `battle.ts`, donde `stackById(state, action.target)` se usa a diario.
- **p2** la genera **Biome** en cuanto la línea pasa de 100 columnas.
- El comentario del guardia dice que solo le escapa el alias y que actúa «en TODO `src` y sin excepciones», así que promete más de lo que cumple. Es la trampa que `CLAUDE.md` describe: un guardia probado solo con las formas que imaginó su autor.

Lo que esperaba quien lee el guardia: que p1 y p2 lo pusieran en rojo, o que el docstring los declare como no cubiertos.

### Menor

**M-1. La excepción de `adaptar.ts` se evalúa sobre la línea entera.**
`const u = s.unit ?? creature(s.body); const hp = creature(t.body).hp;` en una sola línea de `src/client/espectador/adaptar.ts` queda exenta: el patrón encaja y el relleno también. Lo comprobé evaluando las dos expresiones sobre esa línea con `node -e`. Biome partiría dos sentencias en dos líneas, así que el riesgo es bajo.

**M-2. Nada impide que el mismo personaje ocupe dos slots, y entonces una herida se pierde.**
Guion `adv.mts` en el scratchpad:
- Pon `member: 'aren'` en los slots 0 y 1 del héroe de la semilla 32, añade 2 piqueros, `mana = 0` y 4 zombis, y resuelve.
- Resultado: stacks `attacker-0` con topHp **25** y `attacker-1` con topHp 34. `characters.aren.hp` queda en **34**: gana la última escritura.
- El ejército vuelve con dos `character/aren×1`.

Ni `createBattle` ni `membersOf` comprueban que cada `member` sea único, y lo mismo pasa entre dos héroes. Hoy ningún camino del juego crea personajes, así que no se alcanza jugando. Pero rompe «un personaje es un individuo», y va a morder en cuanto la fase 3 dé personajes a la IA o al agente. Encaja en la issue del «escritor único de PV», que está aplazada. Lo anoto para que no se pierda.

**M-3. Unos PV corruptos pasan las comprobaciones de `resolveUnit`.**
`state.characters.aren.hp = NaN` hace que la batalla empiece con `topHp: NaN`: `NaN <= 0` y `NaN > max` son los dos falsos. Con `2.5` entra con 2,5 PV. El `-0` sí lanza. Solo llega a pasar con datos corruptos, pero la función lanza con `hp > max` justo para no «corregir en silencio» un dato imposible, y este también lo es. Una comprobación con `Number.isSafeInteger` lo cerraría.

**M-4. Cobertura: el caso «el defensor con personaje gana» no tiene test.**
Funciona: lo comprobé a mano con tres semillas (ver C7). Pero los tests de C7 solo cubren al defensor que **pierde**. Es el camino `applyDefenderSurvivors` → `restoreHeroFromBattle`, que es distinto del del atacante y es justo donde `CLAUDE.md` cuenta que ya se olvidó una línea una vez (el maná).

## Workarounds usados
- **Estado sintético en los guiones adversariales.** Inyecté `state.characters` y ejércitos con `member`, igual que hacen los tests de C7. Es inevitable: ningún camino de la partida crea personajes todavía, y eso es de la fase 3. No afecta a quien juega, porque en estrategia no existen.
- **La sonda del guardia en un fichero nuevo** en lugar de editar uno existente, para no contaminar el árbol. La borré y lo comprobé con `git status`.

## No probado
- **El espectador en el navegador**, con o sin personaje. No se puede ver un personaje en el tablero sin un camino que lo cree, y la ida y vuelta del cable la cubre `espectador.test.ts` con `toEqual`. Tampoco miré el espectador de estrategia en el navegador: lo hizo el ingeniero después de simplify, y montarlo exige hacer de agente por MCP. `pnpm qa` pasa por el servidor, pero no pinta.
- **El marcador de color** de un stack con `body: 'character'` en `render/battle.ts`. Por la misma razón, sin personaje en el cliente no se ve.
- **El agente con un personaje en el ejército.** `serializeBattleTurn` funciona: lo comprobé en un guion y sale `creature: "character"` con el nombre del personaje y sus cifras. Pero `armyView` y `slowestSpeed` lanzan con un personaje dentro. Eso está aplazado a la fase 3.

## Veredicto

**Apto con reservas.** Los ocho criterios se cumplen, la condición dura está intacta (sha `297dbef9…`, 459 tests, `qa` exit 0) y nada nuevo se ejecuta en una partida de estrategia. La reserva es I-1: el guardia del criterio 5 muerde con la forma simple, pero no ve `creature(stackById(...).body)` ni la versión multilínea que produce Biome, y su comentario dice que cubre más de lo que cubre. Hay que ampliar la regex o corregir el docstring antes de cerrar. M-2 y M-4 van a la issue de la fase 3.

## Segunda pasada (01-10)

Esta pasada solo comprueba lo que pide `hallazgos-qa.md` (I-1, M-1 a M-4), contra el diff sin commitear, y añade una pasada adversarial nueva sobre el guardia reescrito. No he arreglado nada.

Las sondas fueron de dos tipos:
- mutaciones con copia de seguridad en el scratchpad, restauradas con `cp` y comprobadas con `cmp`;
- cuatro ficheros nuevos `src/core/zz-sonda-qa*.ts`, borrados después, y tres líneas añadidas a `adaptar.ts`, restauradas desde copia.

Al terminar, `git status --short` es idéntico byte a byte al de antes (`diff` vacío), y `invariantes.test.ts` vuelve a dar 15/15 en verde.

### Condición dura
```
pnpm verify → Test Files 19 passed (19) · Tests 462 passed (462) · exit 0
pnpm banco  → sha256: 297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767
              líneas: 32177 · sin terminar: 0/200 · ancla: igual
pnpm qa     → exit 0 · 19 veredictos, 19 entraron, 0 descartadas
              consultas: battle_state, building_list, creature_stats, game_state, map, spell_list
              1 mapa diseñado, 3 turnos de mapa y 15 decisiones de batalla
```

### Hallazgos de la primera pasada

| Hallazgo | Estado | Evidencia |
|---|---|---|
| I-1 — las cuatro formas que se colaban | ✅ | He plantado las cuatro de QA en un fichero nuevo y las cuatro salen rojas: `creature(stackById(st, 'x').body)`, `creature(s.body,)` en varias líneas, `creature(s['body'])` y `[s.body].map(creature)` como «pasada como valor». `creature` como valor solo aparece en los ficheros que la importan de `data.js`, y con el árbol limpio el guardia está verde: no queda ningún uso legítimo. **Pero el docstring todavía no dice todo lo que no ve**: ver N-1 |
| M-1 — la excepción ahora es por llamada | ✅ con reserva | En una misma línea de `adaptar.ts`: `(x.unit ?? creature(x.body)).hp` queda exento y `creature(x.body).hp` sale rojo (`adaptar.ts:65`). La línea 60 real sigue exenta. Se puede saltar con una cadena de miembros: ver N-2 |
| M-2 — el mismo personaje en dos huecos | ✅ | `unoPorHueco` en `createBattle` lanza «Aren ocupa dos huecos del ejército». El test pone un campesino entre los dos huecos. Lo vi morder comentando la llamada: `× el mismo personaje en dos huecos del ejército lanza` |
| M-3 — PV que no son un entero | ✅ | `Number.isSafeInteger` va antes que los límites. El test cubre `NaN` y `2.5` con su frase. Lo vi morder con `if (false)`: `× unos PV que no son un entero no entran` |
| M-4 — el defensor con personaje que gana | ✅ | `game.test.ts:1800` usa el flujo real (`move_hero` + `resolvePendingBattle`, semilla 41). Lo vi morder con dos sondas distintas. **(a)** Quité `member` de la vuelta del defensor en `superviviente`: `×`. **(b)** Hice que `woundsFromBattle` se saltara al defensor (`s.side === 'defender'`): `× expected 34 to be 4`. La segunda la añadí yo: comprueba que el test ve la escritura de los PV y no solo la del `member` |

### Pasada adversarial sobre el guardia reescrito

Planté 22 formas.

**Las 15 que muerden:**
- las cuatro de QA;
- `creature?.(s.body)`;
- `creature.call(null, s.body)`;
- `(creature)(s.body)`;
- `{ creature }`;
- `creature(s?.['body'])`;
- ``creature(`${s.body}`)``;
- `D.creature(s.body)` con `import * as D`;
- `(await import('./data.js')).creature(s.body)`;
- la directa al lado de la permitida en `adaptar.ts`.

**Las 7 que se cuelan:**

| Forma | ¿La declara el docstring? |
|---|---|
| `import { creature as c }` + `c(s.body)` | sí |
| `import { creature } from './data'` (sin `.js`) + `[s.body].map(creature)` | **no** (N-1) |
| `[s.body].map(D.creature)` con `import * as D` | **no**. El docstring da a entender que el espacio de nombres solo escapa al desestructurarse (N-1) |
| `import('./data.js').then((m) => [s.body].map(m.creature))` | **no** (N-1) |
| `const re = /^x:\//; … creature(s.body).hp` en la misma línea | **no** (N-3) |
| `creature(get(s, 'body'))`, `creature(Reflect.get(s, 'body'))`, `creature(s['bo' + 'dy'])` | **no**, pero es la familia del alias: acceso calculado |
| `t.s.unit ?? creature(s.body)` en `adaptar.ts` (queda exento) | **no** (N-2) |

### Hallazgos nuevos (todos menores)

**N-1. La mitad «como valor» depende de cómo se escriba el import, y el docstring no lo dice.**

`importaCreature` exige la forma literal `import { … creature … } from '…/data.js'`. Hay tres casos que no reconoce:
- El proyecto compila con `moduleResolution: "bundler"`, así que `from './data'` sin extensión es válido. Con ese import, `[s.body].map(creature)` pasa en verde.
- El valor tomado de un espacio de nombres: `map(D.creature)`, o `m.creature` tras un `import()` dinámico. La mirada hacia atrás `(?<![\w.…])` lo excluye a propósito, y el fichero no «importa `creature`».

Reproducción: crea `src/core/zz.ts` con `import { creature } from './data'; declare const s: any; export const b = [s.body].map(creature);` y corre `npx vitest run test/invariantes.test.ts -t unit`. Sale verde.

Lo que esperaba: que el docstring nombrara estos casos junto al import renombrado, o que `importaCreature` aceptara `data(\.js)?`. No hay ningún caso hoy en `src`: `grep` de `from '…data'` sin `.js` e `import * as` da cero.

**N-2. La excepción de `adaptar.ts` se salta con una cadena de miembros.**

`esRellenoDelCable` captura `\b(\w+)\.unit` sobre el texto de antes. Con `t.s.unit ?? creature(s.body)` captura `s` (el de `t.s`) y lo da por la misma `X` que `s.body`, aunque son objetos distintos. Lo comprobé plantándolo en `adaptar.ts`: no sale ningún informe.

Es un residuo de M-1, de bajo riesgo: hay que escribirlo a propósito, y `adaptar.ts` es un fichero de 60 líneas.

**N-3. `sinComentarios` no reconoce las expresiones regulares literales, y una que acaba en `\//` tapa el resto de la línea.**

El ayudante lee `\//` como el principio de un `//` y deja en blanco lo que sigue, así que una llamada en esa misma línea desaparece en silencio. Sonda: `const re = /^x:\//; export const a5 = creature(s.body).hp;` pasa en verde.

**Ya existe en el repositorio**: en `src/client/html.ts:457`, `/^data:image\//i.test(limpia) && !/^data:image\/svg\+xml/i.test(limpia)`, todo lo que va detrás del primer literal queda invisible para los guardias que usan `sinComentarios`. Hoy no esconde nada prohibido. El ayudante es anterior a este cambio y lo comparten otros guardias, pero el guardia nuevo depende de él y su docstring no lo menciona.

Lo que esperaba: que el docstring de `sinComentarios` lo diga, igual que ya avisa del `//` dentro de una cadena.

**N-4 (documental).** El comentario del guardia dice «Visto morder, sonda a sonda en `ai/tactics.ts`», pero `implementacion.md` dice que las sondas se plantaron en `battle.ts`. No cambia lo que cubre el guardia (yo lo vi morder en un fichero nuevo), pero una de las dos frases no es cierta.

### Workarounds de esta pasada
- Las sondas del guardia van en ficheros nuevos de `src/core/`: el guardia lee el texto y no necesita que compile. Las de `adaptar.ts` tenían que ir en ese fichero, porque la excepción es por ruta. Restaurado y comprobado.
- Las mutaciones de producción se hicieron sobre copias y se restauraron con `cmp`. No afectan a quien juega.

### No probado
- Que `from './data'` sin extensión pase `tsc` en este repositorio. Lo deduzco de `moduleResolution: "bundler"`, pero no lo compilé. N-1 se sostiene igual para el `D.creature` del espacio de nombres, que compila seguro.
- El navegador: este ciclo de corrección no toca nada que se pinte. `battle.ts` y `game.ts` solo añaden comprobaciones que lanzan con datos imposibles, y el sha del banco no se movió.

### Veredicto final

**Apto.** Los cinco hallazgos están corregidos y los vi morder, cada uno con su sonda; M-4 además con una segunda que no estaba en el informe. La condición dura se cumple: sha `297dbef9…` intacto, 462 tests y `qa` con exit 0.

Lo nuevo es menor y solo afecta al guardia. N-1 y N-3 son huecos que el docstring no declara: hay que añadirlos a su lista de «lo que NO ve» antes del commit o en el siguiente, y es una línea en cada caso. Ninguno se alcanza con el código de hoy, y ninguno es la forma que produce el repositorio por sí solo, que era el núcleo de I-1.
