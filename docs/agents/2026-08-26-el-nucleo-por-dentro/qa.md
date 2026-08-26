# QA — el núcleo por dentro (#65, #78, #76, #77, #75)

Validado sobre `f1206bb..a06916a` (el código de HEAD `3837c30` es idéntico a
`a06916a`: los dos commits de encima solo tocan prosa y `.claude/agents/`).

**Veredicto: apto con reservas.** El criterio que manda se cumple byte a byte en
los cinco commits, el argumento de equivalencia de #77 aguanta 899 698 pares
adversariales míos y las cifras se reproducen. Las reservas **no son del código**:
son tres afirmaciones del informe y una del propio `frontera.ts` que he podido
falsificar, y una superficie nueva (#75, la tabla de caminos) que **en este
repositorio no la certifica nada**.

---

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | `pnpm banco` con el sha anclado **byte a byte en cada commit** | ✅ | Ver §1. Los **seis** volcados (padre + los cinco) son `cmp`-idénticos entre sí: 32 177 líneas, `297dbef9…` |
| 2 | `pnpm verify` verde y barrido 200×300 en 0/200 | ✅ | `310 passed (310)`, 4,21 s. `barrido-semillas.ts 200 300` → `sin terminar: 0/200 → []`, peor batalla 9 rondas |
| 3 | Un commit por optimización | ✅ | 5 commits, 5 issues; `git diff` de cada uno toca solo lo suyo. Ninguno toca `tools/` ni `data/` ni `package.json` |
| 4 | Cada issue con su cifra medida antes y después | ⚠️ | Ver §4. Reproducidas #78, #75 y el racimo; **#65 y #76 no salen igual** y **#77 no es cero**; `autoResolve` es bimodal (H5) |
| 5 | Un solo instrumento para todas las medidas | ✅ | `sha256` de `tools/qa/` idéntico en los siete árboles (§1), y aun así copiado encima antes de cada tanda |
| 6 | Tres pasadas por cifra | ⚠️ | Hechas, e intercaladas padre/hijo. Para `autoResolve` **no bastan**: ver H5 |
| 7 | #69 no entra sin frontera defendible | ✅ | El crítico lo tumbó y no está en el diff (`git diff --stat` no toca `game.ts` salvo `moveHero`) |
| 8 | *(retirado por el coordinador: #71 y #69 no entraron)* | — | — |
| 9 | El desempate del Dijkstra no se relaja | ✅ / ⚠️ | Los tres `throw` **muerden** (§2). Pero el guardia **no cubre lo que dice cubrir**: H1 y H2 |
| 10 | `pnpm qa` verde si se toca `src/server/` o el contrato | ✅ | `exit 0`, `12 veredictos, 12 entraron, 0 descartadas`, las cinco consultas ejercitadas |
| 11 | 0 € de fal.ai | ✅ | No he invocado nada de `tools/gen/`; ningún commit lo toca |

Y las cinco preguntas del encargo:

| | Pregunta | | Evidencia |
|---|---|---|---|
| 1 | Atacar el argumento de equivalencia de #77 | ✅ aguanta | **899 698 pares** (origen, destino) míos, **0 discrepancias**. §3 |
| 2 | Que los tres `throw` muerdan, con sondas de otra idea | ✅ / ⚠️ | Muerden los tres. Las sondas «de otra idea» encuentran **dos huecos**: H1 y H2 |
| 3 | `reachableFrom` fuera del mapa: ¿ningún llamante de producción? | ✅ | Confirmado, incluido `map_generate`. Pero hay un **segundo** cambio observable no declarado: H3 |
| 4 | Reproducir las cifras por commit | ⚠️ | §4: tres coinciden, tres no |
| 5 | Que las correcciones al plan estén en el código | ✅ | Las tres, verificadas en el fichero. §5 |

---

## §1 · El criterio que manda: el ancla en cada commit, con un solo instrumento

Antes de medir nada comprobé que el instrumento **es** uno solo, y no me fié de
que «ningún commit toca `tools/qa/`»: lo hashé en los siete árboles.

```
$ for c in f1206bb cde99ca f0ac35e 9d4301a 9a51e96 a06916a HEAD; do
    git ls-tree -r $c --name-only tools/qa | sort | while read f; do git show $c:$f; done | sha256sum
  done
b0d12d61b98bcbe1c8b8898680cee75b83d44806ab75ff3b8cb98e57b1d67440   (los siete, idéntico)
```

Aun así copié `banco.ts` y `partidas.ts` **de HEAD** sobre cada árbol antes de
correr, que es la lección que QA le dio al ciclo padre. Un `git worktree` por
commit, `node_modules` enlazado, nunca `git checkout HEAD --`.

```
===== f1206bb ===== 3846 ms  sha 297dbef9…  32177 líneas  0/200  ancla: igual
===== cde99ca ===== 3488 ms  sha 297dbef9…  32177 líneas  0/200  ancla: igual   (#65)
===== f0ac35e ===== 3453 ms  sha 297dbef9…  32177 líneas  0/200  ancla: igual   (#78)
===== 9d4301a ===== 3287 ms  sha 297dbef9…  32177 líneas  0/200  ancla: igual   (#76)
===== 9a51e96 ===== 3384 ms  sha 297dbef9…  32177 líneas  0/200  ancla: igual   (#77)
===== a06916a ===== 1636 ms  sha 297dbef9…  32177 líneas  0/200  ancla: igual   (#75)
```

Y no me quedé en el sha que imprime la herramienta: volqué las seis partidas a
fichero y las comparé **byte a byte** con `cmp`, que es lo que de verdad
responde a «¿algún commit intermedio movió el volcado y el siguiente lo
devolvió?».

```
$ for f in cde99ca f0ac35e 9d4301a 9a51e96 a06916a; do cmp -s f1206bb.txt $f.txt && echo "$f: IDÉNTICO"; done
cde99ca: IDÉNTICO   f0ac35e: IDÉNTICO   9d4301a: IDÉNTICO   9a51e96: IDÉNTICO   a06916a: IDÉNTICO
```

**Ningún commit intermedio movió una sola partida.** El criterio se cumple en su
forma fuerte.

*(Contraste con lo que ya habías medido: `pnpm banco` en el repo me sale
`1756 ms`, ancla igual, 32 177 líneas, 0/200. Tus 1 741 ms y mis 1 756 son la
misma cifra. `autoResolve` me sale 92 ms donde a ti 60: ver H5, no es el código.)*

## §2 · Los tres `throw`, rotos a mano

Cada uno desarmado por separado en un *worktree* de usar y tirar, `vitest run
test/frontera.test.ts`, y restaurado después (`diff` contra la copia original en
verde):

| Guardia | Al desarmarlo |
|---|---|
| 1 · `agotada` | **1 rojo** — «una frontera agotada se niega a servir a otra búsqueda» |
| 2 · `ultimoPop` | **3 rojos** |
| 3 · rango del `Int32Array` (nuevo de #75) | **1 rojo** — «se niega a una clave fuera de rango» |

Los tres muerden. Y la sonda de criterio —izar la instancia a nivel de módulo
**sin** tocar `frontera.ts`, que es la rotura natural de un ciclo de
rendimiento— también se caza sola, ruidosamente:

```
Error: una frontera es de una sola búsqueda: 100 entra por 0 y ya salió 140
```

Hasta aquí, el guardia hace lo que promete. Los dos huecos están en H1 y H2.

## §3 · #77 · el merge semántico, atacado con mi propio barrido

El argumento a batir: *`findPath` adopta la regla de `reachableFrom` y empieza a
empujar las bloqueadas; sale igual porque una bloqueada no se expande y `orden`
se asigna en orden de `push`, así que el orden relativo de las comunes se
conserva.*

Escribí un barrido propio que importa **tres** implementaciones a la vez sobre
los **mismos** objetos `GameMap` —HEAD, `f1206bb` (antes del ciclo entero) y
`9d4301a` (antes del merge)— y que **no compara solo el resultado: compara el
orden de inserción** de `costs` y de `prev`, que es de donde cuelga el desempate.

Clases que metí a propósito porque el arnés del ingeniero (40 mapas
procedurales) no podía tenerlas:

- **Mapas rectangulares y de proporción extrema** — `13×8`, `8×13`, `17×9`,
  `64×33`, `33×64`, **`128×8` y `8×128`**. Un índice plano transpuesto es
  invisible en un mapa cuadrado, y **todos los mapas del banco y de los tests
  son cuadrados**.
- **Mapas con caminos** (densidad 20–35 %). Ninguna partida del banco tiene un
  solo camino: ver H4.
- **Terreno uniforme con 12–30 % de bloqueadas**, que es donde los empates
  abundan y el desempate decide de verdad.
- Orígenes **encima** de una casilla bloqueada; origen encerrado en agua (la
  búsqueda se agota en el origen, coste 0); origen rodeado de nueve pueblos;
  todas las casillas como origen y como destino en los mapas pequeños.

```
mapas:              65 aleatorios/patológicos + 12 procedurales
orígenes reachable: 7 009        pares findPath: 888 218
                                 (28 314 → aquí 98 165 destinos bloqueados, 817 976 con camino)
discrepancias HEAD vs f1206bb (ciclo entero): 0
discrepancias HEAD vs 9d4301a (solo #77+#75): 0
discrepancias stepCost:                       0

mapas grandes/rectangulares (48×48, 64×33, 33×64, 128×8, 8×128, con caminos):
orígenes=287  pares=11 480  discrepancias=0
```

**899 698 pares, 0 discrepancias**, comparando también el orden de inserción. No
he encontrado el caso que el argumento no cubre. Y una prueba de propina que
salió gratis: al contaminar HEAD y `f1206bb` con la **misma** perturbación (H1),
los dos dan el **mismo** sha256 nuevo (`debbec27…`, 32 159 líneas) — dos
implementaciones que se rompen igual son más difíciles de distinguir que dos que
aciertan igual.

## §4 · Las cifras, tres pasadas intercaladas, un solo instrumento

Padre e hijo en dos *worktrees*, alternados `padre/hijo/padre/hijo/…` para que
la deriva de la máquina caiga por igual en los dos. Mediana de tres.

| Commit | Issue | padre (3) | hijo (3) | Δ mío | Δ del informe |
|---|---|---|---|---|---|
| `cde99ca` | #65 | 3866 · 3988 · **3966** | 3582 · 3700 · **3582** | **−9,7 %** | −6,9 % |
| `f0ac35e` | #78 | 3525 · 3610 · **3532** | 3419 · 3498 · **3427** | **−3,0 %** | −2,6 % ✔ |
| `9d4301a` | #76 | 3498 · 3469 · **3481** | 3358 · 3297 · **3315** | **−4,8 %** | −6,2 % |
| `9a51e96` | #77 | 3363 · 3365 · **3365** | 3392 · 3392 · **3392** | **+0,8 %** | «no se distingue de cero» |
| `a06916a` | #75 A | 3417 · 3328 · **3368** | 1601 · 1599 · **1601** | **−52,5 %** | −52,6 % ✔ |
| **racimo** | | 3940 · 6092 · **3959** | 1624 · 1887 · **1636** | **−58,7 %** | −58,7 % ✔ |

`autoResolve`: #78 sale **156 → 117 ms, −25,0 %** (el informe dice −24,2 %: ✔).
El de #76 no se sostiene tal como está escrito: ver H5.

Lo que **no** pasa aquí es la trampa que avisaba `requisitos.md`: el «antes» no
está inflado. En #65 y #78 mi mejora sale **mayor** que la del informe, y en #76
**menor**; las tres puntas se midieron intercaladas contra el mismo programa, así
que la diferencia es máquina y día, no método. La única cifra del informe que
cambia de **signo** es la de #77 (H6).

## §5 · Las tres afirmaciones falsas del plan, verificadas en el código

| Afirmación del plan | ¿Corregida en el código? |
|---|---|
| `pathFromReachable(alcance, from, to)` sin `map` | ✅ `map.ts:377` — la firma lleva `map` primero, y por eso puede hacer la guardia de `inBounds` que el plan exigía |
| «el merge al revés movería el golden de `frontera.test.ts:143`» | ✅ No lo mueve (mapa 4×4 sin objetos) y por eso hay un **test nuevo** con un guardia en (1,0): `test/frontera.test.ts:189` |
| «la parada tiene que ir ahí o no sale igual» | ✅ El comentario de `dijkstra` dice ahora el motivo **real** —tiempo, no corrección— y nombra las dos posiciones probadas |

*(La cuarta, la del test de carga de #78 con tres hexes sobre un techo de cinco,
también está: `test/battle.test.ts:499-503`.)*

## §6 · El navegador

`pnpm dev` con la receta de `CLAUDE.md` (`set -m` en su propia línea; `$!`=256320
**era** su propio grupo), `?seed=5`, y matado por su grupo al terminar con el 3100
comprobado libre después. El `vite` ajeno de `/home/al/code/ai-tutorials` en el
5173 siguió en pie.

- Mover el héroe: 1100 → 900 → 800 puntos, niebla abierta, «+1651 oro», **«Mina
  capturada»** — un destino **bloqueado**, que es justo la regla que decidió el
  merge de #77 y se ve funcionando en el flujo real.
- Pisar el monstruo → pantalla de batalla, hexes verdes de `movableHexes` (lo que
  #76 reescribió), mover un stack a uno de ellos → el turno pasa al arquero **con
  su propio alcance recalculado**. «Resolver sola» hasta el final.
- Contratar héroe (2500 oro), marcha larga de 1500 → 15 puntos cruzando el mapa,
  recogiendo por el camino.
- **Consola limpia**: `[vite] connecting/connected` y `[assets] 139 imágenes
  generadas cargadas`. Cero errores, cero excepciones.

---

## Hallazgos

### H1 · Importante — «lo guardan los tres `throw`» es falso, y lo he roto

`implementacion.md` cierra con: *«`Frontera` no tiene un test que demuestre que
dos búsquedas seguidas dan lo mismo que una, y sigue sin tenerlo: eso está
documentado en el propio fichero como algo que un test no puede ver, y **lo
guardan los tres `throw`**»*. `frontera.ts` dice lo mismo, y nombra la rotura
concreta: *«un `reiniciar()` y la instancia izada en `map.ts`»*.

Escribí exactamente esa rotura. `reiniciar()` vacía el montículo y repone
`agotada` y `ultimoPop` —lo obvio— y **no toca `ordenes`**, que es lo que parece
una caché y es lo que lleva el desempate:

```ts
// src/core/map/frontera.ts
reiniciar(): void {
  this.monticulo.length = 0;
  this.agotada = false;
  this.ultimoPop = Number.NEGATIVE_INFINITY;
}
// src/core/map/map.ts
const FRONTERA_IZADA = new Frontera(128 * 128);
…
const frontera = FRONTERA_IZADA;
frontera.reiniciar();
```

Resultado:

```
$ npx vitest run                    →  Test Files 14 passed (14)   Tests 310 passed (310)
$ npx tsx tools/qa/banco.ts 200 300 →  32159 líneas  sha debbec276d6e489dc…  ANCLA ROTA
```

**Ninguno de los tres `throw` dice nada.** Las 310 pruebas pasan —las once de
`frontera.test.ts` incluidas, que es el fichero que se está editando— y el
volcado cambia: **18 líneas menos y otro sha**. Lo único que lo caza es
`pnpm banco`.

**No es una regresión de este ciclo**: repetí la misma sonda sobre `f1206bb` y da
**exactamente el mismo sha nuevo** (`debbec27…`, 32 159 líneas), así que el
agujero venía de antes y el ciclo lo heredó. Lo que sí es de este ciclo es
**reafirmar la frase**, y añadir un tercer guardia sin notar que el edificio que
apuntala tiene esa puerta abierta.

Qué pediría: que la prosa diga lo que se ha visto morder. Los `throw` cazan
**reusar la instancia**; lo que caza **reponerla mal** es el ancla de `pnpm
banco`, y esa es la frase honesta. (Y si se quiere cerrar de verdad: el guardia
tendría que ser que `ordenes` no se pueda reponer sin reponerse — por ejemplo,
que no exista ningún camino a `monticulo` que no pase por un constructor.)

**Reproducción**: aplicar el parche de arriba en un *worktree* y correr
`npx vitest run` (verde) y `npx tsx tools/qa/banco.ts 200 300` (ancla rota).

### H2 · Menor — el tercer `throw` es un guardia de rango, no de índice

Su docstring dice que existe porque *«un índice mal calculado dejaría a esa
casilla sin número de orden y rompería el desempate sin decir nada»*. Pero
pregunta por el **rango** (`0 ≤ key < capacidad`), y el fallo característico de
un índice plano es el **desbordamiento de columna**: con `x = −1` en la fila `y`,
`y*W − 1` es una casilla **perfectamente válida** de la fila anterior.

La sonda del ingeniero («olvidar la comprobación de columna») vio morder al
guardia porque su búsqueda tocaba la fila 0, donde el desbordamiento sí sale de
rango. Escrita desde la otra idea, el guardia se calla:

```
mapa 8×8 de hierba con agua solo en (0,0), (0,1), (7,6) y (7,7)
— así TODOS los desbordamientos caen dentro del rango —
quitada `if (nx < 0 || nx >= ancho) continue;` de `dijkstra`:

¿lanzó algún guardia?  NO — silencio total
¿mismo resultado?      NO — el Dijkstra da otra cosa
casillas con otro coste: 4 de 60
ejemplo (7,2): bueno=480  sonda=440
        prev(7,2): bueno={x:6,y:3}   sonda={x:0,y:4}   ← teletransporte de un borde al otro
```

En **este** repositorio el agujero no muerde a nadie: los mapas reales sí tocan
la fila 0, y con la sonda puesta el guardia salta y tres tests de
`frontera.test.ts` se ponen rojos. Es una advertencia sobre lo que el guardia
**dice** cubrir, no un fallo en producción — y merece la pena antes de que la
frase entre en `CLAUDE.md`.

### H3 · Menor — hay un **segundo** cambio observable, no declarado

`implementacion.md` dice que `reachableFrom` desde un origen fuera del mapa es
**«el único cambio observable del racimo»**. Confirmo la primera mitad: ningún
llamante de producción pasa un origen fuera del mapa. El único
`reachableFrom` de producción es `src/core/ai/turn.ts:86` con `hero.at`, y
`hero.at` solo se escribe desde `plan.heroStarts` (que `validateMapPlan`
comprueba dentro del mapa, y `newGame` aborta si hay problemas) o desde
`paso.at` de un camino. `map_generate` **no tiene ni un productor en el circuito
real** —no hay un solo sitio en `src/server` ni en `src/core/state` que pida ese
tipo de petición—, y aun si lo tuviera, `pointSchema` es `z.number().int()`.

Pero hay otro caso, y **este cae dentro del mapa**:

```
                    ANTES (f1206bb)                        AHORA (HEAD)
inicio (0.5,3)  validateMapPlan → «el jugador 0 no    validateMapPlan → LANZA
                puede llegar al pueblo "town-0"       «la frontera va de 0 a 575 y le
                desde su inicio»                       entra 72.5: un índice fuera de
                newGame → «el plan de mapa no es       rango se perdería en silencio»
                jugable: …»                            newGame → el mismo mensaje interno
```

`validateMapPlan` existe para **devolver la lista de problemas**, y con una
coordenada no entera ahora **lanza** un mensaje escrito para la máquina, tres
funciones más allá de la causa, en vez del que estaba escrito para la persona.
`inBounds` la deja pasar (`0.5 ≥ 0 && 0.5 < 24`) y es `Frontera` quien la para.

Es **menor** porque hoy no se puede llegar ahí: zod rechaza los no enteros y el
generador procedural solo produce enteros. Pero es un cambio observable más, y la
frase «el único» es falsa tal como está.

### H4 · Menor — la rama de caminos de #75 no la certifica nada del repositorio

`#75` añadió en `dijkstra` una tabla de coste por casilla que se rellena
recorriendo `map.roads` y **partiendo la clave a mano** (`Number(clave.slice(…))`),
donde antes había un `map.roads.has(pointKey(to))`. Esa rama no la ejecuta nadie
aquí dentro:

- `generateMapPlan` **nunca escribe `plan.roads`** (`grep roads src/core/map/generate.ts`
  → solo la declaración del tipo y el bucle que lo consume), así que las 200
  partidas del banco corren con `map.roads` **vacío**.
- El único test que menciona caminos con `ROAD_COST` (`test/game.test.ts:341`)
  llama a `stepCost`, no al Dijkstra.

O sea: **el ancla no puede haber visto esas ocho líneas**. La he cubierto yo por
fuera —los mapas de §3 llevan 20–35 % de caminos y dan 0 discrepancias— pero lo
que hay en el repositorio no la cubre, y el día que un plan del agente traiga
`roads` no habrá un test que lo diga.

De propina, el parseo nuevo es **más laxo** que el `has(pointKey(…))` de antes:
`"01,2"`, `"1e0,2"` y `" 1,2"` ahora cuentan como camino en (1,2) y antes no.
Hoy es inalcanzable —las claves solo nacen de `pointKey`— pero es una diferencia
de comportamiento que no está escrita en ningún sitio.

### H5 · Menor — `autoResolve` del banco es **bimodal**: tres pasadas no lo miden

El informe da `autoResolve` de #76 como **118 → 59 ms, −50,0 %**. Corrí seis
pasadas seguidas del **mismo** commit `9d4301a`, mismo instrumento, mismas
semillas:

```
9d4301a  partidas=3385 autoResolve=85     9d4301a  partidas=3349 autoResolve=87
9d4301a  partidas=3362 autoResolve=57     9d4301a  partidas=3315 autoResolve=87
9d4301a  partidas=3398 autoResolve=89     9d4301a  partidas=3517 autoResolve=58
```

**57–89 ms para código idéntico**, en dos modos limpios (~58 y ~87), mientras
`partidas` se mantiene en ±3 %. Juntando todas mis pasadas: padre `f0ac35e`
{115,116,117,117,118,120} → mediana **117**; hijo `9d4301a` {57,58,58,58,58,85,
85,86,87,87,87,89} → mediana **≈ 71**. Es decir **−39 %**, no −50 %: las tres
pasadas del informe cayeron enteras en el modo bueno, igual que las tres mías del
bloque de #76. (Tu propia medida, 60 ms, y la mía en el repo limpio, 92 ms, son
los dos modos otra vez.)

`autoResolve` **sí** mejora con #76 y con #78 —eso no está en duda—, pero una
cifra suya con un decimal necesita más de tres pasadas, o una mediana de seis.

### H6 · Menor — #77 no es «no se distingue de cero»: es +0,8 % más lento

El informe lo declara indistinguible de cero porque sus rangos se solapaban
(padre 3342–3429, hijo 3322–3484). En mis tres pasadas intercaladas **no se
solapan**:

```
padre 9d4301a: 3363 · 3365 · 3366     (dispersión: 3 ms)
hijo  9a51e96: 3392 · 3392 · 3443
```

Mediana 3365 → 3392: **+27 ms, +0,8 % más lento**. Es inmaterial —#77 nunca se
vendió por tiempo, sino por dejar el desempate en una sola función para que #75
fuera un commit y no dos, y eso lo cobró el commit siguiente con un −52,5 %—,
pero «no se distingue de cero» es una afirmación falsable y hoy sale falsa.

### H7 · Observación, ajena al ciclo — el panel no se entera del héroe recién contratado

Tras contratar un héroe (2500 oro cobrados, el héroe pintado en la casilla del
castillo), el panel lateral **sigue diciendo** «No tienes héroes en el mapa.
Contrata uno en tu castillo» y la barra de estado «No tienes ningún héroe
seleccionado», hasta que pulsas la casilla del castillo. Reproducible con
`?seed=5` día 2.

Lo anoto pero **no cuenta contra este ciclo**: el diff `f1206bb..a06916a` no toca
un solo fichero de `src/client/`, así que es anterior. Si vale, es una issue de
una línea (seleccionar el héroe recién contratado).

### H8 · Nota latente — la pista de #65 valida el origen, no el estado del mapa

`caminoDelHeroe` comprueba `alcance.costs.get(pointKey(hero.at)) === 0`, y el
docstring razona que eso es lo único que el llamante puede equivocar. Es cierto
**hoy**: el único que pasa pista es `ai/turn.ts`, y calcula el alcance nueve
líneas antes de usarlo. Pero la puerta es pública y lo que no comprueba es que el
alcance sea del **mismo mapa**: un llamante futuro que se guarde un `Reachable`
entre acciones pasaría el guardia con una ruta rancia. Hoy no es explotable —la
topología de bloqueo solo se afloja (monstruos derrotados) y `moveHero` revalida
`enemyAt` y los puntos paso a paso—, así que es una nota, no un fallo.

---

## Workarounds usados

| Workaround | Veredicto |
|---|---|
| `git worktree` por commit con `node_modules` enlazado, y `tools/qa` de HEAD copiado encima | **No afecta a nadie**: es la forma que pide el encargo, y la identidad del instrumento está *probada* por hash antes de copiarlo, no supuesta |
| Editar `frontera.ts` / `map.ts` para las sondas de §2, H1 y H2 | Siempre dentro del *worktree* de usar y tirar, **nunca** en el árbol del usuario; restaurado desde copia y comprobado con `diff` en cada vuelta. El árbol del repo quedó limpio |
| Importar dos implementaciones a la vez (HEAD + `f1206bb` + `9d4301a`) en un proceso | Legítimo: `core` es puro, no hay estado de módulo compartido, y los tres reciben **el mismo objeto** `GameMap` |
| Chrome: «renderer may be frozen» en dos capturas | **Artefacto mío, no del juego.** `document.visibilityState === "hidden"`: la pestaña no está visible, Chrome estrangula `requestAnimationFrame` y con él la captura. `document.title` responde al instante y la consola no tiene un solo error. **No es un hallazgo** y no lo cuento como tal |

## No probado

- **El agente por MCP a mano**, contra `pnpm partida` y una sesión de Claude
  Code. `pnpm qa` cubre el circuito entero (12 veredictos, 12 entrados, las cinco
  consultas, `game_over`), pero no he abierto la segunda terminal.
- **`tools/qa/enfrentamiento.ts`**: el racimo no cambia **cómo decide** la IA de
  batalla —`chooseBattleAction` sigue devolviendo lo mismo, y el ancla lo
  demuestra—, así que 11,8 s no compran nada aquí.
- **La rama de caminos de #75 desde dentro del repositorio** (H4). La he cubierto
  con mi barrido; en el repo sigue sin cubrir.
- **fal.ai**: 0 €, nada de `tools/gen/` invocado.
- **La variante B de #75 y la propina de `revealAround`**, fuera de alcance a
  propósito.

## Veredicto

**Apto con reservas.**

El código entra. El criterio que manda —el ancla byte a byte, commit a commit,
con un solo instrumento— se cumple en su forma más fuerte que sé pedir: los seis
volcados son `cmp`-idénticos. El argumento de equivalencia de #77, que era el
peligroso, ha aguantado **899 698 pares** escritos para romperlo, con clases que
el arnés del ingeniero no podía tener (rectangulares extremos, caminos, orden de
inserción). Las cifras se reproducen, y donde no lo hacen es porque **mi**
medida sale mejor, no peor. `verify`, `qa`, el barrido y el navegador, verdes y
sin un error en consola.

Las reservas son de la prosa y de la cobertura, no del comportamiento:

1. **H1 es la que pediría arreglar antes de escribir nada en `CLAUDE.md`**: la
   frase «lo guardan los tres `throw`» es falsa y la he roto en verde con las 310
   pruebas pasando. Lo que guarda esa regla es `pnpm banco`, y decirlo así es más
   útil que el guardia que no muerde. (Pre-existente, no una regresión.)
2. **H3 y H6** son dos afirmaciones del informe que hay que corregir: no es «el
   único cambio observable», y #77 no es «indistinguible de cero».
3. **H4** deja una superficie nueva sin un solo guardia dentro del repositorio.
4. **H5** dice que ninguna cifra de `autoResolve` de este ciclo debería citarse
   con un decimal.

Ninguna de las cuatro mueve una partida, y por eso el racimo es apto tal como
está: son cosas que se arreglan escribiendo, no revirtiendo.
