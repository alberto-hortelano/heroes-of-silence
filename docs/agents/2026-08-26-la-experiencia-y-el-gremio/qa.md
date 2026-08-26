# QA — la experiencia llega a alguna parte y el gremio se construye

Validación de `2db037e..HEAD` (`65c3dce` #87 + mínimo de #6, `b969fa8` #88,
`ab6adbc` el guardia de coma flotante y la prosa).

**Todas las cifras de este documento las he vuelto a medir yo**, en tres
worktrees separados (`2db037e`, `65c3dce`, `HEAD`) para no tocar el árbol de
trabajo. Las del ingeniero salen **al entero** salvo una, y esa una es un
hallazgo: la tabla de niveles **no es la de fheroes2**.

---

## Criterios de aceptación

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | La experiencia cuenta las criaturas muertas, con la fórmula de fheroes2 y su fuente | ✅ | Fuente traída y comprobada: `battle/battle_army.cpp:292-299` de ihhub/fheroes2 dice `unit.Monster::GetHitPoints() * std::min( unit.GetInitialCount(), unit.GetDead() )`, sumado sobre el bando que pierde. El código hace `creature(s.creature).hp * (s.initialCount - s.count)`. **Navegador**, semilla 77: 4 campesinos (1 PV) → `Experiencia 4`; con la fórmula vieja habrían sido 2 |
| 2 | Quien defiende y gana cobra experiencia | ✅ | `battle_arena.cpp:657-675`: `attackerExperience` = bajas del defensor, `defenderExperience` = bajas del atacante, **misma fórmula**. Quién cobra: `heroes_action.cpp:585/589` (castillo) y `660/664` (héroe contra héroe) — gana el atacante o el defensor, y cobra el que gane. Las dos citas del ingeniero son exactas |
| 3 | Test determinista: 100 campesinos dan más que 1, y la cifra es la de la fórmula | ✅ | `test/game.test.ts` `la experiencia cuenta las criaturas muertas, no los stacks`: `expect(experienciaContra(100)).toBe(100)` y `toBe(1)`. Verde en `pnpm verify` |
| 4 | Test: el héroe que defiende y repele termina con más experiencia | ✅ | `quien defiende y repele cobra las bajas del atacante más los 500`: `toBe(10 * 1 + 500)`. Ruta de código: `applyDefenderSurvivors`, rama `hero` (`game.ts:1272`) |
| 5 | `hero.level` se actualiza con `levelFromExperience()` | ✅ | `game.ts:1206`, la función que ya existía. `grep` sobre `src/`: es su **único** llamante |
| 6 | Subir de nivel entra en la crónica con protagonista y sitio, sellado por `emit` | ✅ | `game.ts:1209` emite `level_up` con `hero`, `level`, `actor: hero.owner`, `at`; rama nueva en `visibleTo` (`events.ts:163`). El test comprueba `actor`, `at` y `seen` |
| 7 | Se puede subir más de un nivel de golpe y se cobran todos | ✅ | Bucle `while (hero.level < nivel)`. Test con 2100 puntos → `level 3` y **dos** hechos con `level` 2 y 3 |
| 8 | Medida sobre 200 semillas: nivel 2, 3 y 5 | ✅ | Contado sobre el volcado de `pnpm banco` (32 211 líneas): **106 al nivel 2, 17 al nivel 3, 0 al 4 y 0 al 5**, desde 0·0·0. **El «0 al nivel 4» que justificó dejar fuera el reparto de atributos es cierto**: no hay una sola subida a nivel 4 en 200 partidas |
| 9 | El gremio se construye en una fracción sustancial de las 200 semillas | ✅ | `mage_guild_1`: **206 construcciones en 200 de 200 partidas** (base: 10 en 10). Con un matiz que conviene decir, abajo: 202 son del nigromante y **4 del caballero** |
| 10 | La regla nueva no es un número mágico nuevo en la cascada | ✅ | El 40 no sube: desaparece. `ORDEN_DE_CONSTRUCCION` por facción y la prioridad es el índice. Comprobado **por fuera del test del repo**: la lista del caballero cubre sus 19 edificios y la del nigromante sus 18, sin faltantes, sin sobrantes y sin duplicados. Y la fuente que se cita existe: `ai/ai_planner_castle.cpp`, `necromancerBuildOrder` pone `BUILD_MAGEGUILD1` **8.º**, por delante de `DWELLING_UPGRADE4`/`MONSTER4`; `knightBuildOrder` lo pone 17.º, detrás de todo lo militar |
| 11 | Se mide que la magia se ejerza: hechizos enseñados y `cast` lanzados | ✅ | Del volcado: **965 hechizos enseñados en 177 partidas** (316 hechos `spells_learned`), desde 15 en 3. Los `cast` no están en el volcado, así que los conté con arnés propio cuyo **sha256 del volcado coincide con el ancla** (`d5502745…`): **2644 `cast`, de ellos 2618 `magic_arrow`, 13 `haste` y 13 `slow`**. Base `2db037e` con el mismo arnés: 1860 · 1849 · 11 · 0. Las dos cifras del ingeniero son exactas |
| 12 | `pnpm verify` verde | ✅ | `Tests 298 passed (298)`, 14 ficheros, 4,28 s |
| 13 | El barrido sigue sin partidas eternas | ✅ | `npx tsx tools/qa/barrido-semillas.ts 200 300` → `sin terminar: 0/200 → []`, peor batalla 9 rondas. Y las 1 200 partidas del control de esquina también terminan todas |
| 14 | `pnpm banco`: el criterio es la forma del diff, no el hash | ✅ | Los **tres** anclas reproducidos en worktrees limpios: `cf7b8d3b…`/26 444 (base), `1e32b19e…`/26 647 (#87), `d5502745…`/32 211 (HEAD). **#87 es inserción pura**, comprobado línea a línea: 203 líneas `level_up` nuevas (197 de nivel 2, 6 de nivel 3), **0** líneas `fin` con ganador o día distinto y **0** semillas con cualquier otro hecho distinto. **#88**: 0 semillas idénticas y el **primer hecho distinto es `built` en 200 de 200** |
| 15 | `pnpm qa` verde | ✅ | `12 veredictos, 12 entraron, 0 descartadas`; las cinco consultas ejercitadas; 3 turnos de mapa y 9 decisiones de batalla |
| 16 | 0 € de fal.ai | ✅ | Nada de `tools/gen/` invocado. `git status` limpio en `tools/gen` y `assets`; `spend.json` sin tocar |

### Y las tres preguntas que el coordinador quería contrastadas

| | | Evidencia |
|---|---|---|
| Los **+500** están donde dice y valen 500 | ✅ | `battle_arena.cpp:665-676`, literal: `_battleResult.defenderExperience += 500` si el mando del atacante era un héroe que no huyó; `_battleResult.attackerExperience += 500` si lo era el del defensor; y `if ( _isTown ) { _battleResult.attackerExperience += 500; }`. El código los separa en dos constantes y las condiciona bien: el bono de héroe se cobra si `battle.heroes[perdedor] !== null` (en una batalla de pueblo el defensor es `hero: null`, así que no se cobra de más) y el de asedio solo lo cobra el atacante |
| El vuelco del ganador, **con control de esquina** | ✅ | Reproducido partida a partida en los tres commits. `generateMapPlan` usa `factions` solo para nombrar los dos pueblos (`generate.ts:364-365`), así que las dos ramas juegan el mismo mapa |
| **#87 no mueve el equilibrio ni un punto en ninguna esquina** | ✅ | Ver la tabla de abajo: 184/16 y 130/70 en la base **y** tras #87, idénticos |
| **Nadie lee `hero.level` ni `hero.experience`** | ✅ | `grep` sobre `src/`: `hero.level` se lee en `game.ts:1207` (el propio bucle que lo escribe) y en `serialize.ts:182` (la vista del agente, añadida en este ciclo). `hero.experience`, en `game.ts:1205-1206` y en `panels.ts:104` (la pantalla). Ni la IA ni las reglas ni la batalla. `maxSpellLevel` mira `skills.wisdom`, no el nivel. La inserción pura no era suerte |
| Los `cast` de partida **no** quedan en `state.log` | ✅ **cierto** | No hay un `kind: 'cast'` entre los diecisiete de `events.ts`; `cast` es un `BattleEvent` que vive en `battle.log`, y `settleBattle` hace `state.pendingBattle = null` con la batalla entera dentro. Merece issue — ver hallazgo 3 |
| La **tabla de 39 filas** es la de `Heroes::GetExperienceFromLevel` | ❌ **NO** | **31 de las 39 filas no coinciden**, y la fuente tiene **40**. Ver hallazgo 1 |

### El equilibrio, con control de esquina — reproducido

Mismo mapa, intercambiando quién nace en cada punta. 400 partidas por fila.

| | p0 = caballero | p0 = nigromante | caballero, total |
|---|---|---|---|
| base `2db037e` | 184 / 16 | 130 / 70 | **314 / 400 — 78,50 %** |
| tras #87 `65c3dce` | 184 / 16 | 130 / 70 | **314 / 400 — 78,50 %** |
| tras #88 `b969fa8` | 41 / 159 | 24 / 176 | **65 / 400 — 16,25 %** |

Sale **exactamente** la tabla del ingeniero, cifra a cifra, incluido el reparto
por rama. `#87` no mueve un solo punto en ninguna de las dos esquinas: la tabla
que justificó no compensar se sostiene. 0 partidas sin terminar en las 1 200.

---

## Hallazgos

### 1 · IMPORTANTE — La tabla de niveles no es la de fheroes2: 31 de sus 39 filas están inventadas

`UMBRALES_DE_NIVEL` (`src/core/hero/hero.ts:164-168`) dice de sí misma:

> **Fuente**: `Heroes::GetExperienceFromLevel`, `heroes.cpp:1512-1600` de
> ihhub/fheroes2 — 39 filas escritas a mano, de la 0 a la 38. El índice de este
> array ES el argumento de allí, así que `UMBRALES[n]` es
> `GetExperienceFromLevel(n)` **sin ninguna conversión que se pueda equivocar**.

Me traje el fichero. La función existe y empieza en la línea 1512, pero tiene
**40 filas** (`case 0` … `case 39`) y sus valores son otros:

| fila | fheroes2 | el repo | |
|---|---|---|---|
| 0-5 | 0 · 1000 · 2000 · 3200 · 4500 · 6000 | iguales | ✅ |
| 6 | **7700** | 7500 | ❌ |
| 7-8 | 9000 · 11000 | iguales | ✅ |
| 9 | **13200** | 13000 | ❌ |
| 10 | **15500** | 15000 | ❌ |
| 11 | **18500** | 17000 | ❌ |
| … | (progresión ×1,2) | (+2000, luego +3000) | ❌ |
| 38 | **2 492 100** | 88 000 | ❌ (×28) |
| 39 | **2 990 600** | *no existe* | ❌ |

**Coinciden 8 de 39.** No es una versión antigua del original: en el tag `1.0.0`
la fila 6 también es 7700. La tabla de fheroes2 crece geométricamente; la del
repo crece a pasos planos.

Y el `PASO_TRAS_LA_TABLA = 3000` se justifica así: *«el original extrapola con
una fórmula sobre las dos últimas filas; aquí se continúa la progresión con su
último paso, que es lo mismo mientras esas dos diferencias sean iguales —lo son,
3000—»*. En el original las dos últimas diferencias son **415 400 y 498 500**, y
la extrapolación es `l1 + round((l1 - l2) * 1.2 / 100) * 100`. El «lo son, 3000»
describe la tabla inventada, no la fuente.

**Efecto sobre la partida hoy: cero**, y por eso no es bloqueante — los umbrales
que se alcanzan (nivel 2 = 1000, 3 = 2000, 4 = 3200) están entre las 8 filas que
sí coinciden, y ningún héroe pasa de nivel 3. Lo que sí pasa:

- El test que dice comprobarlo —`la curva de niveles es la tabla de fheroes2 y
  no una potencia`— mira los cinco primeros umbrales, que son justo los que
  coinciden, y luego **ancla las filas inventadas**:
  `expect(experienceForLevel(39)).toBe(88000)` donde la fuente dice 2 492 100.
- La cita falsa está ya en **tres** sitios: el docstring, el nombre del test y
  `CLAUDE.md` («Se cambió la curva por la tabla de 39 filas del original»).
- Es exactamente la clase de defecto que este repositorio persigue —«una cifra
  inventada donde el original publica una tabla»— cometida en el commit que
  venía a quitarla. `requisitos.md` lo pedía por escrito en sus preguntas
  abiertas: *«entonces la curva también es una cifra inventada y se cambia por
  la del original, con su fuente»*.

**Reproducción**: `curl -s https://raw.githubusercontent.com/ihhub/fheroes2/master/src/fheroes2/heroes/heroes.cpp | sed -n '1512,1600p'`
y comparar con `src/core/hero/hero.ts:170-174`.

Arreglarlo es copiar 40 números y ajustar dos `expect`. No mueve el ancla del
banco (nadie alcanza esas filas), lo cual conviene comprobar y decir.

### 2 · IMPORTANTE — `#88` mete hechos en la crónica DESPUÉS de «Fin de la partida»: 34 de 200 partidas

`game.ts:1109-1111` escribe la regla:

> El cierre de la batalla se registra ANTES de sus consecuencias: capturar el
> último pueblo del rival termina la partida, y **"game_over" tiene que ser el
> último evento del registro**.

Medido sobre los volcados del banco, contando hechos posteriores a `game_over`:

```
base  2db037e :  0 de 200 partidas
tras  65c3dce :  0 de 200 partidas
tras  b969fa8 : 34 de 200 partidas  →  {'spells_learned': 34}
```

De 0 a 34 (17 %) y todas del mismo tipo. **Mecanismo**: `applyAdventureAction`
(`game.ts:568-569`) llama a `aplicar(...)` —que puede capturar el último pueblo,
disparar `checkDefeat` → `finishGame` → `emit(game_over)`— y **después llama a
`syncSpellbooks(state, actor)` sin preguntar si la partida ha terminado**. El
héroe que acaba de tomar el pueblo aprende sus hechizos, y ese hecho se escribe
detrás del final. Antes de #88 casi ningún pueblo tenía gremio, así que la
avería estaba latente; ahora los dos lo tienen.

**Lo ve quien juega.** Reproducción desde el arranque:

1. `pnpm dev`, abrir `http://localhost:3100/?seed=12`
2. Pulsar el castillo, pulsar el solar **Gremio de magia I**, «Volver al mapa»
3. Pulsar la casilla del castillo (el héroe entra y aprende Prisa y Lentitud)
4. Entrar al castillo, «Todo» en la casilla de reclutamiento, «Volver al mapa»
5. Pulsar Espacio tres veces

La crónica termina así, y las dos últimas líneas están en ese orden:

```
El jugador 1 te ha capturado un castillo
Fin de la partida
El jugador 1 aprende: Prisa, Lentitud
```

Lo que esperaba quien juega: que «Fin de la partida» sea la última línea, que es
lo que el propio código promete. No hay ningún test ni invariante que vigile ese
orden — la regla vive en un comentario.

### 3 · MENOR — Una capa entera del juego ocurre y no queda registrada en ningún sitio

Confirmado lo que preguntaba el coordinador, y con una forma más ancha que «los
`cast` no se guardan»: **al cerrarse una batalla se tira su registro entero**.
`BattleState.log` (`battle/types.ts:119`) recoge `round_start`, `move`, `attack`,
`shoot`, `wait`, `defend`, `cast`, `morale`, `luck`…, y `settleBattle` hace
`state.pendingBattle = null` con todo eso dentro. En `state.log` de la partida
solo quedan `battle_started` y `battle_ended`.

Consecuencias medibles:

- **Para quien juega**: una batalla que decide la partida deja una línea,
  `Batalla resuelta`. Lo vi en las semillas 77, 5 y 12.
- **Para medir**: el criterio 11 —el que cierra #88— **no se puede comprobar con
  ninguna herramienta del repositorio**. El ingeniero necesitó un arnés propio y
  yo he necesitado otro; los dos tuvimos que reimplementar el bucle de
  `playAiGame` con un `BattleTakeover` para leer el registro antes de que se
  tire. Es el workaround que declaro abajo.
- **Para el agente**: `recentEvents` no le cuenta nada de lo que pasó dentro de
  las batallas que no jugó él.

Sugerencia de forma para el issue, si se abre: no es «añadir un `kind: 'cast'`»
—eso son 99 hechos por batalla en la crónica de aventura—, es decidir si el
registro de batalla sobrevive al `settleBattle` (un resumen en `battle_ended`, o
guardar el último) o si se acepta que no y se documenta.

### 4 · MENOR — El guardia de coma flotante no ve `Math` por alias

Lo rompí con dos sondas que no estaban entre las cinco del ingeniero ni entre
las tres del coordinador, las dos en `src/core/hero/hero.ts`:

```ts
export function sondaA(n: number): number { return Math.trunc(n / 2); }   // ← cazada
const { pow } = Math;
export function sondaB(n: number): number { return pow(n, 2); }           // ← NO cazada
```

Salida del test, una sola presa de dos:

```
[una función de `Math` que no está en la lista] src/core/hero/hero.ts:201 → return Math.trunc(n / 2);
```

La primera mitad es buena noticia: la lista blanca muerde con una función
entera y determinista que no está escrita, que es como su docstring dice que
tiene que fallar. La segunda es un agujero de la misma clase que los dos que
tuvo el guardia de `node:` durante tres ciclos: `const { pow } = Math` (o
`Math['pow']`) pasa limpio. Sondas retiradas, `git status` limpio.

No propongo perseguirlo con más expresiones regulares; propongo **escribirlo en
el docstring**, que es lo que el repositorio ya hace con lo que un guardia no
puede ver («la ruta de OTRA máquina»).

### 5 · MENOR / observación — Al caballero, que es la facción de quien juega, #88 no le da magia

Repartido por dueño sobre las 200 semillas:

| | caballero (jugador 0) | nigromante (jugador 1) |
|---|---|---|
| `mage_guild_1` | **4 partidas** | **200 partidas** |
| `mage_guild_2` | 4 | 13 |
| hechizos aprendidos | 165 | 800 |

Es la asimetría del original y está defendida en `plan.md` con una medida seria
(la variante simétrica deja 1 de 200 partidas sin terminar), así que **no es un
defecto**. Pero la frase de cierre conviene que sea la exacta: desde la silla de
quien juega —que lleva al caballero en el cliente— **#88 le ha dado el gremio al
rival**, no a él. Su propio gremio sigue habiendo que construirlo a mano, cosa
que hice en la semilla 12 y funciona de punta a punta: solar → `Gremio de magia
1` → panel «ENSEÑA: Prisa n.1, Flecha mágica n.1, Lentitud n.1» → mover el héroe
al pueblo → crónica «Aprendido: Prisa, Lentitud» y los tres hechizos en el panel.

### 6 · Observación — El vuelco de 62 puntos se nota en la primera partida

Está aprobado y va a #89, así que no lo cuento como defecto, pero conviene que
esté escrito con lo que se ve: **perdí el día 3 en las tres semillas que jugué**
(77, 5 y 12), incluida una en la que recluté todo y no moví al héroe de su
castillo. El nigromante construye su gremio el **día 1** en las tres. Con los
días de partida medidos (mediana 7) y el barrido en 0/200 no hay riesgo de
partida eterna; es una cuestión de a quién se le hace jugable el juego.

### 7 · Preexistente, no tocado — la persona no juega sus batallas defensivas

Confirmado el aviso del ingeniero: `session.ts:233` llama a
`playAiTurn(this.state, this.ctx)` **sin** `BattleTakeover`, así que cuando el
rival te ataca resuelve la heurística y a la persona le llega `Batalla resuelta`.
Con #87 eso tiene una consecuencia nueva: **tu héroe puede cobrar experiencia, y
subir de nivel, en una batalla que no has visto**. No es de este ciclo y el
director del agente sí lo tiene resuelto; queda apuntado.

---

## Workarounds usados

| Workaround | Por qué | Veredicto |
|---|---|---|
| Tres `git worktree` sobre `2db037e`, `65c3dce` y `HEAD`, con `node_modules` enlazado | Para medir el antes y el después sin `git checkout` en el árbol de trabajo | No afecta a quien juega. Retirados al terminar |
| Arnés propio (`medida.ts`) que reproduce el bucle de `playAiGame` con un `BattleTakeover` para contar los `cast` | **No hay otra manera**: el registro de la batalla se tira en `settleBattle` | **Es el hallazgo 3.** Y como el instrumento es nuevo, se desconfía antes que del resultado: el arnés imprime el **sha256 de su volcado con el formato del banco** y sale `d5502745…`, el ancla — o sea que está midiendo las mismas 200 partidas, no unas parecidas |
| Dos sondas escritas a mano en `hero.ts` para ver morder al guardia nuevo | Es la regla de la casa: un guardia hay que verlo morder | Retiradas; `git status` limpio |

Ningún escenario preparado, ningún estado sintético y ninguna pantalla saltada
para que una comprobación pasara.

---

## No probado

- **La línea `level_up` en el navegador.** Tampoco yo la he visto, y no por lo
  que decía el ingeniero: no es que sea inalcanzable, es que **llega tarde para
  quien pierde el día 3**. Medido sobre las 200 semillas: de las 123 subidas de
  nivel, **1 ocurre el día 3 o antes**; el grueso cae los días 4, 5 y 6, y 95 de
  200 partidas tienen alguna. O sea que la línea sí se ve en una partida normal
  — en una que dure. Queda cubierta por el test que llama al `renderLog` real.
- **`tools/qa/enfrentamiento.ts`**: no corrido, y correctamente omitido —
  `git diff 2db037e..HEAD -- src/core/ai/tactics.ts` está **vacío**: no se toca
  cómo decide la IA de batalla.
- **Que el sha del banco valga en otra máquina.** Es la promesa en la que se
  apoya el guardia nuevo y no la puede comprobar una sola máquina.
- **El agente leyendo `heroes[].level`.** `pnpm qa` sale verde y el dato viaja,
  pero 12 veredictos en una partida de 4 días no dicen si el agente lo usa.

---

## Veredicto

**Apto con reservas.**

Los dieciséis criterios se cumplen y los he reproducido por mi cuenta, cifra a
cifra: la fórmula y los dos +500 están en la fuente donde se dice y valen lo que
se dice; #87 es inserción pura y no mueve el equilibrio ni un punto en ninguna
esquina; el gremio pasa de 10 a 200 partidas de 200 y la magia se ejerce (965
hechizos enseñados), con la cifra incómoda publicada y confirmada (2618 de 2644
`cast` siguen siendo `magic_arrow`); y el 0 al nivel 4 sobre el que se decidió
dejar fuera el reparto de atributos es cierto.

Las dos reservas, ninguna bloqueante y las dos baratas:

1. **La tabla de 39 filas no es la del original** —8 de 39 coinciden— y la cita
   de fuente falsa ya está en el docstring, en el nombre de un test y en
   `CLAUDE.md`. Hoy es inerte; el día que un héroe pase de nivel 6 deja de
   serlo, y mientras tanto es la clase exacta de cifra que este ciclo venía a
   quitar.
2. **`#88` rompe el orden de la crónica en 34 de 200 partidas** —un
   `spells_learned` detrás de `game_over`, de 0 antes— y se ve en pantalla.

Recomiendo un ciclo corto de corrección para las dos antes de cerrar, y abrir
issue para el hallazgo 3 (el registro de batalla que se tira) con la forma que
propongo allí.
