# QA — el núcleo deja de recorrer dos veces el mismo grafo (#48, #55)

**Veredicto: apto con reservas.** Los catorce criterios se cumplen; el primero
—el que manda— lo he reproducido yo desde un árbol limpio, con un solo
instrumento de medida, en **los doce commits** (el basal `34d31fc` incluido) y
además a **500 semillas**, que es más de lo que verificó el ciclo. Las reservas
son tres cosas menores, ninguna bloqueante: **el guardia de la frontera tiene un
segundo agujero, no declarado**, la frase de `CLAUDE.md` que lo describe promete
más de lo que el código hace, y **una viñeta de la evidencia del navegador del
ingeniero no es reproducible** (la conclusión sí, la etiqueta no).

Ejecutado por mí, no leído: `pnpm verify`, `pnpm banco` (× ~20, incluida la
réplica commit a commit), `pnpm qa`, el barrido, siete sondas adversariales sobre
el desempate y una partida jugada en el navegador.

---

## 1 · Criterio 1 — byte a byte, comprobado desde cero

**Método**, para que se pueda repetir: `git worktree` aparte, `git checkout` de
cada commit y **el mismo `banco.ts` + `partidas.ts` de `HEAD` copiado encima en
todos** — un solo instrumento midiendo doce árboles, en vez del banco de cada
commit midiéndose a sí mismo. El basal `34d31fc` es de **antes de que el banco
existiera**: es la única forma de comparar el ciclo contra lo que había.

| Commit | sha256 del volcado | líneas | 200 partidas |
|---|---|---|---|
| `34d31fc` **(basal, pre-ciclo)** | `eb294724…4711a4f` | 28300 | 8935 ms |
| `f989976` banco | `eb294724…4711a4f` | 28300 | 8844 ms |
| `ebc721e` **A** #48 | `eb294724…4711a4f` | 28300 | 8376 ms |
| `29c3bc8` **B** predecesores | `eb294724…4711a4f` | 28300 | 6737 ms |
| `1c382e6` **C** montículo | `eb294724…4711a4f` | 28300 | 5432 ms |
| `5bd17b9` **D** `Point` en el nodo | `eb294724…4711a4f` | 28300 | 4149 ms |
| `306fb25` guardia + ancla | `eb294724…4711a4f` | 28300 | 4115 ms |
| `89fd306` hallazgo 4 | `eb294724…4711a4f` | 28300 | 4113 ms |
| `0abff9a` hallazgo 5 | `eb294724…4711a4f` | 28300 | 3589 ms |
| `bae3e92` hallazgo 6 | `eb294724…4711a4f` | 28300 | 3626 ms |
| `d966dd5` arnés | `eb294724…4711a4f` | 28300 | 3528 ms |
| `e61efec` **HEAD** | `eb294724…4711a4f` | 28300 | 3533 ms |

`diff` de los volcados (3 073 485 bytes cada uno) `34d31fc` contra `e61efec` y
contra el árbol de trabajo: **vacío en los dos**.

**Y más allá del ancla**: 500 semillas, `34d31fc` contra `HEAD` →
`1c5b539161a3a8672da67e033fbb95492193b6a34cef1a1d30bd3655502703d5` en los dos,
**70 878 líneas, `diff` vacío**. El ciclo verificó 400 semillas solo en
`5bd17b9`; después de la tanda de `/simplify` nadie había vuelto a salir de las
200. Ya se ha salido.

**Sí cambian las partidas** las tres roturas que probé a mano (§3): el ancla las
caza todas.

---

## 2 · Los criterios, uno a uno

| # | Criterio | Estado | Evidencia mía |
|---|---|---|---|
| 1 | Mismo comportamiento, exactamente | ✅ | La tabla de arriba: 12 commits, mismo sha256, `diff` vacío; y 500 semillas idénticas |
| 2 | Tests y `pnpm verify` verdes | ✅ | `pnpm verify` → `Tests 251 passed (251)`, `Checked 69 files in 52ms`, 6,76 s de reloj |
| 3 | `core` puro, invariantes sin tocar | ✅ | `git diff 34d31fc..HEAD -- test/invariantes.test.ts` **vacío**; los 11 invariantes verdes dentro de los 251 |
| 4 | Ninguna tirada nueva | ✅ | `git diff 34d31fc..HEAD -- src/core \| grep '^+.*\(createRng\|rng\.\|Math.random\)'` → **vacío** |
| 5 | Un solo BFS por `legalActions` | ✅ | Deshice el izado en un worktree: el test pasa a rojo con `expected "reachable" to be called 1 times, but got 5 times`. **Visto morder por mí** |
| 6 | Misma lista y mismo orden | ✅ | Con el código de ANTES del izado, el golden de 21 acciones **sigue verde**: es la prueba de que la lista no cambió, no solo de que es estable |
| 7 | La mejora medida y escrita | ⚠️ ver §4 | `autoResolve` 300 batallas: 240 → 146 ms (**−39 %**), tres pasadas. La cifra del barrido no la puedo arbitrar: mido −4,7 %, entre las dos. El issue #48 **sigue sin corregirse** (necesita al usuario) |
| 8 | `stepTowards` retrocede por `prev` | ✅ | `strategy.ts:200-215`; sha256 idéntico en 500 semillas, que es más fuerte que sus 20 pares. Observación en §5 sobre lo que su test NO cubre |
| 9 | Firmas y llamantes en el mismo commit | ✅ | `29c3bc8` toca a la vez `map.ts`, `strategy.ts`, `turn.ts`, `agent-link.test.ts` y `game.test.ts` |
| 10 | `bloqueadas` se sigue reconstruyendo | ✅ | `map.ts:130-133` y `:222-225`: las dos funciones lo montan por llamada. Ninguna caché |
| 11 | Cola de prioridad con desempate estable | ✅ | `frontera.ts`; roto de tres maneras distintas en §3, rojo en las tres |
| 11b | El `Point` viaja en el nodo | ✅ | `grep -rn parsePointKey src test tools` → **vacío**. `5bd17b9`: 5432 → 4149 ms (−23,6 % sobre C) |
| 12 | Un commit por optimización | ✅ | `git show --stat` de los cinco: A toca 2 ficheros, B 5, C 3, D 3. Revertibles por separado |
| 13 | Banco repetible con tiempo y sha256 | ✅ | `pnpm banco` → cinco cifras en columna, exit 0 con el ancla igual |
| 13b | `heroHasWork` fuera | ✅ | `grep -rn heroHasWork src test tools` → **vacío** |
| 14 | La comparación es una orden | ✅ | `pnpm banco` sola ya compara contra el ancla; `--dump` + `diff` para saber dónde |

### Los seis hallazgos de `/simplify`

| # | Hallazgo | Estado | Evidencia mía |
|---|---|---|---|
| 1 | Guardia fail-loud en `Frontera` | ⚠️ | Muerde donde dice, pero tiene **dos** agujeros, no uno. Hallazgo A de §6 |
| 2 | El sha256 anclado y en CI | ✅ | Le cambié un dígito (`…4711a4f` → `…4711a5f`) en un worktree: la orden imprime `ANCLA ROTA`, las dos instrucciones y **sale 1** (`pnpm` propaga: `ELIFECYCLE … exit code 1`). Con otros argumentos (`banco 40 300`) **no** se comprueba y sale 0, como promete. `.github/workflows/ci.yml` lo corre en el job `verify` |
| 3 | Arnés compartido `partidas.ts` | ✅ | Corrí el `barrido-semillas.ts` de `0abff9a` y el de `HEAD`: **43 líneas, `diff` vacío** |
| 4 | La IA no relanza el BFS | ✅ | `legalActions` empuja los `move` desde `alcanzables` y nadie más empuja `move` (`battle.ts:817-826`), así que `filter(move).map(to)` es esa misma lista en ese mismo orden. Y `acciones` es `legalActions(state)` de la línea 152. Razonamiento válido; el `reduce` con `<` estricto es justo lo que hace que el **orden** importe |
| 5 | El héroe sin puntos no recorre el mapa | ✅ | Premisa verificada **llamando a `stepCost`** en los 8 terrenos × camino/sin camino × orto/diagonal: mínimo pisable = **75 = `ROAD_COST`** (camino ortogonal; el camino en diagonal son 105, el terreno más barato 100). Detalle en §5 |
| 6 | `maxCost` muerto | ✅ | En `0abff9a`, los **ocho** llamantes pasan `Infinity` (`git grep reachableFrom 0abff9a`), y ninguno está fuera de `core`/tests. Con `Infinity` la rama no dispara: quitarla no puede cambiar nada, y el volcado lo confirma |
| 7 | Menores | ✅ | Dos `as NodoFrontera` fuera de `core`, `enemigosDe()` sustituido por `enemiesOf()`, `fichero` con una sola forma de ausencia |

---

## 3 · Pasada adversarial sobre el desempate

Rompí el invariante por **cuatro puertas distintas**, tres de ellas fuera de la
que probó el ingeniero. Lo que caza cada guardia:

| Rotura | 251 tests | `pnpm banco` |
|---|---|---|
| Comparador sin `\|\| a.orden - b.orden` | ya lo vio el ingeniero | — |
| **Instancia izada a módulo + `reiniciar()` que resetea `ultimoPop`** (el agujero declarado) | **251 verdes** | **rojo**: `daa62aea…`, 28 278 líneas |
| **Orden nuevo en cada re-inserción por mejora de coste** | **rojo**, y solo 1 de 251: «una clave re-empujada más barata conserva su orden original» | **rojo**: `8816f407…`, 28 298 líneas |
| **Orden de descubrimiento roto FUERA de la clase** (`neighbours()` recorrido al revés) | **rojo**, 2 de 251: el golden de `findPath` y el orden de asentamiento de `reachableFrom` | **rojo**: `17d94dd8…`, 28 092 líneas |
| **Frontera compartida tras una búsqueda degenerada** (§6, hallazgo A) | no aplica (no hay llamante así hoy) | lo cazaría el volcado |

Tres conclusiones:

1. **La red está bien tejida y por capas.** Ninguna rotura pasa las dos mallas.
   El `throw` es el aviso rápido; **el ancla es la red de verdad**, y es la única
   que caza el agujero declarado.
2. **El test (c) —la re-inserción— es la única pieza que sujeta esa mitad del
   contrato.** Los dos goldens no la ven. Está bien que exista; conviene saber
   que si alguien lo «simplifica», ese lado se queda con una sola red.
3. **El diseño resiste mejor de lo que el documento dice.** Como solo se empuja
   con `<` estricto, dos entradas vivas de la misma clave nunca empatan en coste
   y el orden total es **estricto**: la forma del montículo no puede influir en
   el orden de extracción ni entre nodos hermanos. Eso es lo que hace que el
   desempate sea reproducible y no «reproducible por ahora».

### El coste del guardia, y que no dispara jugando

500 partidas, `pnpm qa`, el barrido y una partida a mano en el navegador: **el
`throw` no saltó ni una vez**. No hay falso positivo posible con las reglas de
hoy — el paso más barato del mapa son 75 puntos y ningún coste es negativo.

---

## 4 · Las cifras: quién tiene razón con el −3,2 % / −7,1 %

**Ninguno de los dos, y da igual.** Lo medí alternando commits, once pasadas de
cada uno (`f989976` ↔ `ebc721e`, 200 partidas):

```
f989976  8644 8765 8769 8789 8798 9097 9233 9274 9282 9648 9822   min 8644  mediana 9097
ebc721e  8236 8337 8430 8481 8576 8581 8655 9118 9132 9268 11655  min 8236  mediana 8655
```

- Por mínimos: **−4,7 %**. Por medianas: **−4,9 %**. En la réplica de una sola
  pasada de §1: **−6,3 %**.
- **La dispersión de una misma variante llega al 13 %**, o sea es más ancha que
  el efecto que se discute. −3,2 % y −7,1 % caben los dos dentro.

**Aviso que cambia cómo hay que leer esto: la máquina NO estaba en reposo.**
Durante mis medidas había Chrome al 30 % de CPU y un `vite --host` de otro
proyecto (`ne-fan`) al 24 %; el `load average` subió de 0,2 a 3,8 en mitad de la
tanda. Por eso **no convierto la discrepancia en un hallazgo** y por eso tampoco
acepto el «manda el mío» del ingeniero (§4.5 de `implementacion.md`): esa cifra
no está medida con precisión suficiente para mandar sobre nada.

**Lo que sí es sólido**, porque es corto, repetible y no lo ensucia el mapa:

| Medida | Basal | A | Δ |
|---|---|---|---|
| `autoResolve`, 300 batallas (5 pasadas) | 240 / 238 / 238 / 242 / 252 | 145 / 146 / 152 / 146 / 154 | **−39 %** |

Cuadra con el −38 % del ingeniero y el −36 % del crítico, y **entierra el «1150 →
580 ms, divide por dos» del issue #48**, que es lo que había que averiguar. En
`HEAD`, con el hallazgo 4 dentro, son **127-131 ms**: −47 % sobre el basal.

**El titular del ciclo se sostiene**: 8935 → 3533 ms sobre las mismas 200
partidas y el mismo volcado, **−60,5 %** (el ingeniero dice −61,1 %). Y el −53,1 %
de la primera tanda: 8935 → 4149, **−53,6 %**.

---

## 5 · El razonamiento de los hallazgos 4, 5 y 6, atacado

**Hallazgo 5 — «ningún paso del mapa puede costar menos que `ROAD_COST`».**
No me fié de la tabla: enumeré llamando a `stepCost` sobre los 8 terrenos ×
camino/sin camino × ortogonal/diagonal.

```
mínimo pisable = 75 = ROAD_COST     (camino, ortogonal)
camino en diagonal = 105            (round(75 × 1,4))
terreno más barato sin camino = 100 (grass/dirt/lava; en diagonal 140)
agua = no pisable, así que su 75 con camino no cuenta
```

Las cuatro preguntas que me hiciste, contestadas:

- **¿En todos los terrenos?** Sí: los ocho de `TERRAIN_KINDS`, que son los ocho
  del esquema del agente (`contract/agent.ts:59`).
- **¿Con caminos?** Sí, y es justo el mínimo: 75, exacto.
- **¿En diagonal?** Sí, y sale más caro (×1,4 redondeado), nunca más barato.
- **¿En los mapas de `map_generate`?** **Sí, y esto es lo importante**: el agente
  elige terreno y pinta caminos, pero **no elige precios** — `TERRAIN_COST` y
  `ROAD_COST` son constantes de `terrain.ts`, no `data/*.json`, y `terrainSchema`
  lo encierra en los ocho terrenos de siempre. No hay plan de mapa que meta un
  paso de 50.

El `<` **estricto** también es el correcto: con exactamente 75 puntos sí cabe un
paso de camino, y `movePoints < 75` lo deja pasar. Y la otra mitad del argumento
—que saltarse `chooseHeroDestination` no cambia nada— la comprobé leyendo:
`objectValue`, `armyPower` y `chooseHeroDestination` solo leen, no escriben en el
estado, y ni el `continue` nuevo ni el de `paso === null` marcan `seMovio`.
El guardia del test muerde: con `grass: 50` sale `expected 50 to be 75`.

**Hallazgo 6 — `maxCost` muerto.** Los ocho llamantes de `0abff9a` pasan
`Infinity` y ninguno vive fuera de `core` ni de los tests, así que
`if (nuevo > maxCost) continue;` no se toma jamás. Es equivalencia por
construcción, no por medida. Lo que el docstring nuevo añade —que un tope futuro
cambiaría el orden de asentamiento y con él el desempate— es cierto y es la parte
que había que dejar escrita.

**Hallazgo 4 — el BFS gemelo.** La equivalencia se apoya en dos cosas que
verifiqué en el código: `legalActions` empuja los `move` **desde la misma lista**
que después reutiliza para los ataques (`battle.ts:817-826`) y **nadie más empuja
`move`**. El aviso del ingeniero para el ciclo que reescribe `tactics.ts` es
correcto y es la parte valiosa: en cuanto `legalActions` filtre o reordene sus
`move`, deja de ser equivalente y el test se pondrá rojo con razón.

---

## 6 · Hallazgos

### A · MENOR — el guardia de `Frontera` tiene un segundo agujero, no declarado

`implementacion.md` §11.2 declara **un** agujero (un `reiniciar()` que resetee
`ultimoPop`). Hay **otro**, y no exige tocar la clase: **`cost < this.ultimoPop`
no dispara si la búsqueda anterior terminó con su última extracción en coste 0**,
o sea si asentó solo el origen. El origen de la segunda búsqueda entra por 0 y
`0 < 0` es falso.

Reproducción (sonda mía, `Frontera` a pelo):

```
busqueda 1 pop: {"key":"9,9","cost":0,"orden":0}   // origen sin vecinos pisables
busqueda 2 sobre la misma instancia:
  ¿saltó el guardia? NO — silencio
  empate contaminado: 0,0@0  1,0@100  0,1@100
  (con frontera limpia daría: 0,0@0  0,1@100  1,0@100)
```

`1,0` gana el empate por un `orden` heredado de la búsqueda anterior. **Y la
búsqueda degenerada es alcanzable**: `findPath` sobre un mapa de `map_generate`
con un pueblo rodeado de agua sale así, y `validateMapPlan` llama a `findPath`
justo ahí.

**Qué expone de verdad:** nada hoy —`map.ts` aloja una frontera por llamada y el
volcado de 500 semillas lo confirma—, pero la afirmación «la reutilizas y lanza»
es más fuerte que el código. Quien comparta la instancia se lleva el `throw` en
el caso normal y **silencio** en el caso raro.

**Lo que esperaría quien lo lea:** que el docstring y `CLAUDE.md` digan lo que el
guardia hace —*caza la reutilización siempre que la búsqueda anterior extrajera
algo por encima de 0*—, o que el guardia mire también el mapa de órdenes (un
`if (this.ordenes.size > 0 && cost === 0) throw` cierra los dos agujeros con una
línea). **No lo he tocado**: reportar, no arreglar.

### B · MENOR — `CLAUDE.md` promete más de lo que el guardia da

El párrafo nuevo dice: «Por eso `Frontera` es **de una sola búsqueda** y lanza si
la reutilizas». Con el agujero A, **no siempre**. El resto del párrafo lo he
comprobado y es verdad, incluida la parte fuerte: la frontera compartida pasa hoy
**los 251 tests** y cambia el volcado.

### C · MENOR — una viñeta de la evidencia del navegador no es reproducible

`implementacion.md` §10.7 dice: «Clic en una casilla en niebla: barra de estado
**No hay camino hasta ahí.**». No es lo que pasa. **El mapa de la semilla 71 no
tiene ni una casilla de agua** (lo volqué entero: 24×24, cero `water`), así que
está entero conectado y **la niebla no bloquea el movimiento**: al hacer clic en
una casilla en niebla el héroe camina hacia ella. Lo hice y lo vi: movimiento
**720 → 80**.

El mensaje sí existe y sí sale —lo saqué haciendo clic en **la casilla del propio
héroe** (`findPath` devuelve `[]`)—, pero la etiqueta de la evidencia está mal, y
en un informe donde el resto está medido al byte, una viñeta que no se puede
repetir es la que hay que corregir. No hay defecto de producto detrás.

De propina, una arista de experiencia **anterior a este ciclo**: hacer clic donde
ya estás contesta «No hay camino hasta ahí», que no es lo que pasa. Fuera de
alcance; lo dejo apuntado.

### D · OBSERVACIÓN — el test del criterio 8 no cubre su propia frontera

Mutando `while (coste > hero.movePoints)` a `>=` en `stepTowards` —el fencepost
clásico, que hace al héroe pararse una casilla antes cuando el coste iguala
exactamente sus puntos— **`test/game.test.ts` se queda entero en verde (49/49)**,
los 20 pares incluidos. Lo cazan otros: seis tests de `agent-link.test.ts` y el
ancla (`de823000…`, 28 172 líneas). O sea **la red aguanta**, pero el guardia
específico de C8 es más flojo de lo que su nombre promete.

### E · OBSERVACIÓN — lo que queda pedido y sigue pendiente

No son defectos: son cosas que el ingeniero no podía hacer solo y **siguen sin
hacerse**. Van aquí para que no se pierdan al cerrar:

- **Corregir el issue #48** (criterio 7 lo pide «al cerrar»): son **−39 %** en
  300 batallas, no «1150 → 580, divide por dos».
- **Abrir los tres issues**: el tercer recorrido de `moveHero`, `tactics.ts:213`
  (ya hecho, se puede cerrar en vez de abrir) y unificar los dos Dijkstra.
- **Los descartes con medida** —E1 (índice plano, −46,4 % con prototipo), E3
  (−40 % de `autoResolve`), A5, `revealAround`— siguen sin issue.

---

## 7 · Workarounds usados, y su veredicto

1. **Medí con un instrumento copiado** (el `banco.ts` de `HEAD` sobre cada
   commit, incluido el basal que no lo tenía). No es un obstáculo para quien
   juega: es la única forma de comparar contra `34d31fc`, y es **más estricto**
   que dejar que cada commit se mida con su propio banco.
2. **Rompí el código a mano** (comparador, `ordenes`, `neighbours`, `stepTowards`,
   `grass: 50`, el ancla, el izado de #48) **siempre en un `git worktree`
   aparte**, nunca en el árbol del usuario. Los dos worktrees están retirados
   (`git worktree list` → solo `/home/al/code/heroes`) y **`git status` es
   idéntico al del principio**: `M CLAUDE.md` y las cinco carpetas sin indexar de
   `docs/agents/`. Ni un `stash`, ni un fichero mío suelto.
3. **En el navegador tuve dos estorbos del instrumental, no del juego**: el zoom
   de Chrome quedó al 110 %, así que las coordenadas de las capturas no son las
   del DOM; y `requestAnimationFrame` se congela en una pestaña de fondo, así que
   el DOM se leía rancio hasta forzar un fotograma con una captura. **Comprobé
   que no es un fallo del cliente**: `main.ts:137` hace
   `ctx.setTransform(dpr,…)` y el clic se convierte en las mismas unidades, o sea
   el DPI está bien tratado. Quien juega con la pestaña delante no ve nada de
   esto.

**Y un efecto colateral que causé yo y hay que saber**: al parar el `pnpm dev`
usé `pkill -f vite` y **maté también el servidor de desarrollo de `ne-fan`**
(`nefan-html`, `vite --host`) que estaba levantado en esta máquina. No lo he
vuelto a arrancar: es otro proyecto y no me toca. Hay que relanzarlo a mano.

---

## 8 · No probado, y por qué

- **Que el sha256 salga igual en OTRA máquina.** No tengo otra. Lo que sí hice:
  auditar la premisa. En `src/core` **solo** se usan `Math.min/max/floor/ceil/abs/
  round/imul` (`grep` exhaustivo), no hay `Math.pow`, `**`, trigonometría,
  `Math.random`, `Intl`, `toLocale*` ni `Date`; el único `sort` es
  `data.ts:48`, estable por especificación desde ES2019; `mulberry32` va con
  `Math.imul` sobre enteros. Sí hay coma flotante (`base * 1,4`, el
  `/4294967296` del RNG), pero **multiplicar y dividir están exactamente
  especificados por IEEE-754**, así que la frase de `CLAUDE.md` —«ni una
  operación de coma flotante **que dependa de la plataforma**»— es correcta tal y
  como está escrita. De propina, corrí el banco con `LANG=C TZ=UTC` y con
  `LANG=ja_JP.UTF-8 TZ=Pacific/Kiritimati`: **mismo sha256**. Riesgo residual:
  bajo, y CI lo dirá en el primer push.
- **El desempate en un caso que ni 500 semillas cubren.** Es indemostrable por
  construcción. Lo medido son 500 partidas enteras byte a byte.
- **El agente jugando de verdad por MCP.** Lo cubre `pnpm qa` (15 veredictos, 15
  entraron, 0 descartadas, las cinco consultas ejercitadas, salida 0), no una
  sesión de Claude Code a mano.
- **`tools/gen/`.** Ni tocado. **0 € de fal.ai**: `git diff 34d31fc..HEAD` no
  incluye un solo fichero de `tools/gen/`, y `spend.json` está intacto.

---

## 9 · Las órdenes que pediste verdes

```
$ pnpm verify
Checked 69 files in 52ms. No fixes applied.
 Test Files  13 passed (13)
      Tests  251 passed (251)
   Duration  3.90s                                    (6,76 s de reloj)

$ pnpm banco
partidas:      200 semillas × 300 días → 3528 ms
sha256:        eb29472446c90b27b5d15c764e6677d702f1d40e2c646191484c92c5f4711a4f
líneas:        28300
sin terminar:  0/200 → []
ancla:         igual — las 200 partidas se juegan hexágono a hexágono igual
autoResolve:   300 batallas (1222 rondas) → 128 ms          exit 0

$ pnpm qa
[qa] 15 veredictos, 15 entraron, 0 descartadas
[qa] consultas ejercitadas: battle_state, building_list, creature_stats, game_state, spell_list
[qa] terminado por fin de partida: 2 turnos de mapa y 13 decisiones de batalla
salida pnpm qa: 0                                     (5,43 s)

$ npx tsx tools/qa/barrido-semillas.ts
sin terminar: 0/40 → []
batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100      (1,09 s)
```

---

## 10 · El navegador — jugado, no leído

`pnpm dev` y `http://localhost:3100/?seed=71`. Lo que hice y lo que vi:

- **Ruta punteada**: al pasar el ratón por el montón de oro se dibujan los puntos
  del camino (`findPath` del cliente). Visto en captura.
- **Mover**: clic en el oro → el héroe llega, **movimiento 1100 → 720**, la
  niebla se levanta y la crónica escribe «Mina capturada».
- **Clic en niebla**: el héroe camina hacia allí y gasta lo que le queda,
  **720 → 80** (ver hallazgo C).
- **Rechazo escrito para la persona**: clic en la casilla del propio héroe →
  barra de estado «**No hay camino hasta ahí.**».
- **Fin de turno**: día 2, movimiento a 1100, y **el turno de la IA pasa entero
  por el pathfinding tocado** — la crónica escribe que el jugador 1 construye
  Morada de nivel 2 y recluta 6 zombis y 8 esqueletos.
- **Batalla**: clic sobre el monstruo `6` → tablero con **los hexes verdes** del
  campesino (`movableHexes`); clic en uno → se mueve y el turno pasa al arquero
  **con su propio alcance pintado**; disparo → «Disparo: 9 de daño, 6 bajas», «Una
  unidad enemiga ha sido aniquilada», victoria.
- **La rama del hallazgo 4, vista jugando**: segunda batalla contra los 11 zombis,
  defiendo con los dos stacks y **el zombi avanza hacia mí** — que es exactamente
  el `acciones.filter(move)` de `tactics.ts:213`.

**Consola, entera**: `[vite] connecting…`, `[vite] connected.`,
`[assets] 139 imágenes generadas cargadas`. **Ni un error, ni una excepción** —y
esto importa más que de costumbre, porque el hallazgo 1 mete un `throw` en el
bucle más caliente por el que pasa cada previsualización de camino.

Servidor de desarrollo parado y pestaña cerrada.

---

## 11 · `CLAUDE.md` — ¿dice la verdad?

| Lo que dice | ¿Verdad? |
|---|---|
| `pnpm verify … 251 tests, 6,7 s` | ✅ 251, medido 6,76 s |
| `pnpm test # 251 tests` | ✅ |
| `pnpm banco # 200 partidas: tiempo y sha256, 4,1 s` | ✅ medido 3,98 s de reloj |
| CI corre `verify`, `banco` y `vite build` en un job y `qa` en otro | ✅ (en el fichero el orden es `verify` → `vite build` → `banco`; da igual, pero por si acaso) |
| Barrido 1,1 s | ✅ medido 1,09 s |
| `pnpm qa` 5,4 s | ✅ medido 5,43 s |
| El Dijkstra desempata por orden de descubrimiento, y en la re-inserción conserva el original | ✅ y **es la regla que había que escribir**: es exactamente lo que rompí y lo que se puso rojo |
| Antes lo hacía por accidente (`<` estricto sobre un `Set`) | ✅ verificado contra `34d31fc:src/core/map/map.ts` |
| Compartirla pasaba los 247 tests y cambiaba el volcado en silencio | ✅ hoy pasa **los 251** y cambia el volcado: lo reproduje (`daa62aea…`) |
| «y **lanza si la reutilizas**» | ⚠️ **no siempre** — hallazgo A |
| El sha está anclado y la orden sale 1 si no cuadra; lo corre CI | ✅ le cambié un dígito y salió 1 con instrucciones |
| Reproducible fuera de esta máquina: solo `min/max/floor/ceil/abs/round/imul` | ✅ verificado con `grep` sobre `src/core`; matiz en §8 |

El resto del documento no lo he auditado: solo lo que este ciclo cambió.

---

## 12 · Veredicto

**Apto con reservas.**

Lo que hace apto a este trabajo no es el −60 %: es que **el criterio que lo
sostiene se puede volver a ejecutar con una orden**, y que ahora hay **dos redes
independientes** —los tests del desempate y el sha256 anclado que corre CI— donde
antes había una frase en un comentario. Lo comprobé rompiéndolo por cuatro
puertas distintas: ninguna pasa las dos.

Las reservas son de documentación y de precisión, no de código, y ninguna
bloquea:

- **A (menor)**: el `throw` de `Frontera` tiene un segundo agujero no declarado
  —una búsqueda que solo asienta el origen lo deja ciego—. Cerrarlo es una línea;
  documentarlo, media. Lo que no puede quedarse es la frase actual, que promete
  lo que no hay.
- **B (menor)**: `CLAUDE.md` hereda esa promesa.
- **C (menor)**: una viñeta de la evidencia del navegador del ingeniero no es
  reproducible; el comportamiento subyacente está bien.
- **D (observación)**: el test del criterio 8 no cubre su propia frontera; lo
  cubren otros.
- **E**: el issue #48 sigue sin corregirse y los issues de los descartes sin
  abrir, que es trabajo del coordinador y necesita al usuario.

**Y una cifra que hay que dejar de defender**: el −3,2 % de la optimización A no
está medido con precisión suficiente para mandar sobre el −7,1 % del crítico —yo
mido −4,7 % con una dispersión del 13 % y la máquina con carga de fondo—. La
cifra buena de #48 es `autoResolve`: **−39 %**, y ahí los tres coincidimos.
