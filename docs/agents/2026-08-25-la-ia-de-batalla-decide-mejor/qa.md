# QA — la IA de batalla decide mejor (#52 y #50)

Validado sobre `864c092` con el árbol limpio. Diff revisado: `e0ea52d..864c092`
más `41afb14` y `927c8e4`.

**Todo lo que se afirma aquí está medido en esta máquina**, con el repo sin
tocar: los tres commits se midieron en copias archivadas
(`git archive` a `/tmp/…/scratchpad/trees/<commit>` con `node_modules`
enlazado), con **el `tools/qa/banco.ts` de `HEAD` copiado encima de los
commits viejos**, para que el instrumento sea uno solo. Las tandas de tiempo
son **8 pasadas intercaladas** por árbol, con la máquina en reposo
(`load average` 0,15, 16 núcleos, sin `pnpm dev` levantado).

---

## Criterios de aceptación

### #50 — la casilla que más carga (corrección latente)

| Criterio | Veredicto | Evidencia |
|---|---|---|
| 0 · no cambia ni una partida hoy; **barrido byte a byte idéntico** | ✅ cumple | `banco.ts` de `HEAD` sobre `fa0cb32` y sobre `41afb14`: **el mismo sha y las mismas líneas**, `eb29472446c90b27b5d15c764e6677d702f1d40e2c646191484c92c5f4711a4f`, 28 300 líneas, en las 8 pasadas. Y la sonda lo explica: de **1258** decisiones que entran en `mejorCarga` en 200 partidas, **0** son de una unidad con `charge` |
| 1 · elige la casilla de máximo daño esperado | ✅ cumple | `src/core/ai/tactics.ts:174-202`. El test muerde: revertido `mejorCarga` a `return cargas[0]`, `con carga se va a la casilla que más cobra` sale **rojo** |
| 2 · el criterio es daño, no distancia (sin `charge` no da rodeos) | ✅ cumple | `expectedDamage` solo depende del hex por `chargeHexes` (`damage.ts:115`); test `sin carga no da rodeos` |
| 3 · empates deterministas y documentados | ✅ cumple | orden total de tres niveles, con `>` y `<` estrictos: máximo daño → coste mínimo → primero en la enumeración. Hoy decide el tercero: **1184 de 1258** decisiones tienen más de una casilla y sin `charge` todas empatan en daño |
| 3b · el desempate es coste mínimo y **el coste se LEE** | ✅ cumple | el test invierte el orden de enumeración mockeando `board.reachable`; con `cargas[0]` sale **rojo** (elige `(3,3)` en vez de `(2,4)`). Verificado a mano con el mutante |
| 4 · test determinista de las dos escenas | ✅ cumple | 3 tests nuevos; **2 de los 3 mueren** con la implementación de antes, el tercero es el de invariancia y no puede morir |

### #52 — el `wait` que no se juega

| Criterio | Veredicto | Evidencia |
|---|---|---|
| 10 · se mide primero cuántas veces sale hoy | ✅ cumple | sonda sobre `fa0cb32`: **10 440 turnos** en 200 partidas, `wait` **0**, `defend` **0** — clavado a la cifra del crítico |
| 11 · la condición modela ceder la iniciativa (no una tautología) | ✅ cumple | `convieneEsperar` (`tactics.ts:229-237`) es **literalmente la variante B**: `!s.waited`, enemigo con `!e.acted`, alcance `stackSpeed(e)+1` sobre **mi hex o el destino**. Evaluada dentro de la rama de avanzar, justo antes del `move` |
| 12 · `wait` se juega alguna vez y se dice cuántas | ✅ cumple | **476 de 10 786 = 4,41 %** en 200 partidas. Idéntico a lo que informan arquitecto e ingeniero |
| 13-15 · no juega peor, **demostrado** | ✅ cumple | `enfrentamiento.ts 10000` → **10 225/20 000 = 51,13 %**. Con el IC correcto (pareado) es **± 0,20 pp → [50,92 · 51,33]**, entero por encima del 50 % |
| 14 · barrido: 0 sin terminar de 40 | ✅ cumple | `0/40 → []`, `peor caso 8 rondas, 0/40 en el tope de 100`. Y el banco: `0/200 → []` |
| 16 · `pnpm verify` verde; ningún test existente cambia | ✅ cumple | 273/273 en 6,76 s (3 pasadas: 6,76 / 6,80 / 6,75). Conteos: **265** (`fa0cb32`) → **268** (`41afb14`, +3) → **273** (`HEAD`, +5). Ninguno de los 265 cambió de resultado |

### Los acuerdos añadidos al aprobar el plan

| Punto del plan | Veredicto | Evidencia |
|---|---|---|
| 5 · la regla es **B**, no A ni C | ✅ cumple | sonda que evalúa A, B y C **en la misma decisión**: `predB` = 476 y **`discrepaB` = 0** — no hay una sola decisión donde la regla y B difieran. `discrepaA` = 353 y `discrepaC` = 2156: no es A ni es C |
| 7 · `defend` como única cola terminal | ✅ cumple | el `wait` tautológico está borrado; `defend` = **0 de 10 786** en partidas, 151 de 5000 batallas del banco |
| 8 · orden total explícito de tres niveles | ✅ cumple | ver #50 crit. 3 |
| 9 · identidad byte a byte de #50 comprobada | ✅ cumple | reproducida con un solo instrumento (arriba) |
| 10 · el banco trae su prueba de no-sesgo (espejo = 50,0 %) | ⚠️ el hecho es cierto, **la prueba no prueba** | ver hallazgo 3 |
| 11 · `notaAccionSustituida` deja de mentir con `wait` | ⚠️ arreglado a medias | la rama existe y tiene test, pero la frase que la sustituye **también falla el 21,2 % de las veces**: hallazgo 2 |

### El ancla nueva y el riesgo de rondas

| Comprobación | Veredicto | Evidencia |
|---|---|---|
| ancla nueva reproducible | ✅ cumple | `pnpm banco` en el repo: `a4d71f9ba1dde3afd7aabc28f039110ea95ab51e5f8a79dcfc8538ce1c0856bc`, **28 406 líneas** (+106), `0/200 → []`, `ancla: igual`, **EXIT=0**. Sale igual en las 3 pasadas del árbol archivado |
| las batallas no se alargan | ✅ cumple | barrido: peor caso **8** rondas, igual que antes. Sonda sobre las batallas **reales** de 200 partidas: ronda máxima **12 antes y 12 después**. Banco: peor 18 (espera) contra 17 (espejo), **0 de 20 000** en `MAX_ROUNDS` |
| `pnpm qa` (obligatorio por tocar `src/server/`) | ✅ cumple | EXIT=0; `16 veredictos, 16 entraron, 0 descartadas`; `2 turnos de mapa y 14 decisiones de batalla` |
| el navegador | ✅ cumple | semilla 8, reproducido; ver abajo |
| consola limpia | ✅ cumple | 3 mensajes, 0 errores: `[vite] connecting`, `[vite] connected`, `[assets] 139 imágenes generadas cargadas` |

---

## Lo que se ve en el navegador — semilla 8, día 1

`pnpm dev`, `http://localhost:3100/?seed=8`, batalla contra el piquero neutral
(×4) pegado al héroe. Reproduce lo que dice el informe y lo confirmo yo:

- **Ronda 1**: el piquero (el más rápido de los tres) mueve primero y avanza
  hasta media columna. Mis dos unidades se plantan.
- **Ronda 2**: le vuelve a tocar primero y **no se mueve**: se queda en el mismo
  hex y el turno pasa a mis unidades. Eso es el `wait`.
- **Dentro de la ronda 2**, después de que mis dos unidades gasten su turno, el
  piquero **vuelve y avanza** tres columnas. La cola funciona.
- **Ronda 3**: se planta encima y pega — `Ataque: 19 de daño, 19 bajas`,
  `Contraataque: 6 de daño, 1 bajas`. Mi campesino de 26 se queda en 7.
- `Resolver sola` cierra la batalla, vuelve al mapa y la crónica dice
  «Batalla resuelta».

**Lo que quien juega NO ve**: el parte de guerra de las rondas 1 y 2 está
literalmente vacío salvo los rótulos `— Ronda 1 —` y `— Ronda 2 —`. La espera
del enemigo se ve como *un turno en el que no pasa nada*, sin una línea que lo
cuente. Es deliberado y de antes (`panels.ts:439-441` descarta `move`, `wait` y
`defend`), pero **ahora hay una acción nueva que se juega 476 veces por cada
10 786 decisiones y que el juego no nombra**. No lo cuento como fallo de este
ciclo; lo dejo apuntado porque el ciclo es justo el que lo hace visible.

---

## Hallazgos

### 1 · IMPORTANTE — el coste de #50 lo paga entero quien no puede cobrarlo, y es un BFS **duplicado**

La pregunta del coordinador tiene respuesta y es que **sí**: el camino caro se
recorre para todos los stacks, tengan `charge` o no, y hoy eso son **todos**.

`mejorCarga` llama a `movableCosts(state, s)` sin mirar el rasgo
(`src/core/ai/tactics.ts:180`). Medido con contadores:

| | fa0cb32 (antes) | 41afb14 (#50) | 41afb14 **saltando el BFS si no hay `charge`** | 864c092 (HEAD) |
|---|---|---|---|---|
| 300 `autoResolve` | **128 ms** | **150 ms** (+17,6 %) | **128 ms** (+0,0 %) | 150 ms |
| 200 partidas | **3561 ms** | 3589 ms (+0,8 %) | 3574 ms | 3624 ms (+1,8 %) |
| llamadas a `movableCosts`, 300 batallas | 5629 | **6301** (+11,9 %) | — | 6301 |
| llamadas a `movableCosts`, 200 partidas | 15 176 | — | — | **16 636** (+9,6 %) |

(medianas de 8 pasadas intercaladas; el árbol «saltando el BFS» es una sonda de
QA, **no una propuesta**: rompe el criterio 3b).

Que la variante que se salta el BFS para los stacks sin `charge` **vuelva al
milisegundo a la línea base** cierra la pregunta: el 100 % del sobrecoste lo
pagan unidades que no pueden cobrar ni un punto de carga. Hoy son **1258 de
1258** llamadas: **0 con `charge`**.

Y hay algo peor que la atribución, que es la **duplicación**:
`chooseBattleAction` llama a `legalActions`, que llama a `movableHexes` →
`movableCosts` para el **mismo stack y el mismo estado**, y **tira el mapa de
costes quedándose las claves** (`battle.ts:213-216`, `battle.ts:818`).
`mejorCarga` lo vuelve a calcular entero acto seguido. Es decir: el 100 % del
sobrecoste **es evitable sin tocar ni una regla**, ni el orden total, ni el
desempate por coste mínimo. El ingeniero ya lo dice y ya propone el arreglo
—que `legalActions` devuelva el mapa que ya calculó—; lo que cambia mi medida es
la clasificación: **no es «el precio de leer el coste», es trabajo repetido.**

Contexto para dimensionarlo, y es lo que me hace ponerlo en *importante* y no en
*bloqueante*:

- **La cifra del informe está inflada.** «+21 % en `autoResolve`» es **+17,6 %**
  y «+6 % en la partida entera» es **+0,8 %** con #50 solo y **+1,8 %** en
  `HEAD`. El «antes» del ingeniero (3370 ms) es más rápido que **el mejor de
  mis 8** (3427 ms): comparó una pasada afortunada contra una típica. Su punto
  final (3568/3586 ms) coincide con mi mediana (3589 ms), así que el error está
  en la línea base.
- **Y hay una tercera llamada, de antes**: `moveTo` (`battle.ts:429`) vuelve a
  lanzar `movableCosts` para cobrar la carga. Con #50 una decisión de
  «acercarse y golpear» recorre el tablero **tres veces**; antes, dos. Eso sí
  garantiza que #50 optimiza exactamente la magnitud que después se cobra
  —mismo mapa, misma clave—, que era lo otro que había que comprobar y **está
  bien**.

**Cuánto vale lo que se compra, medido**: enfrenté la IA de `HEAD` contra la
misma con `mejorCarga` revertido, en el banco de batallas donde **el 8,2 % de
los stacks sí tienen `charge`**: **10 029/20 000 = 50,14 %**, IC pareado
± 0,09 → [50,05 · 50,24]. Es una mejora real (32 parejas perdidas contra 61
ganadas), pero de **+0,14 pp de victorias**, no de «+20 %». El +20,3 % del
crítico es daño esperado **por ataque afectado**, y conviene no citarlo como si
fuera la ganancia del cambio.

**Reproducción**: `git archive` de `fa0cb32` y `41afb14`, mismo `banco.ts`, ocho
pasadas alternando árbol. Sonda: contador dentro de `movableCosts` y dentro de
`mejorCarga`.

### 2 · IMPORTANTE — la nota nueva al agente promete algo que falla 1 de cada 5 veces

`notaAccionSustituida` (`src/server/notas.ts:269-278`) le dice al agente:

> «Eso NO ha consumido el turno de … —se te volverá a pedir acción para ella
> **al final de la ronda**, cuando ya hayan movido los demás—.»

Medido en las batallas reales de 200 partidas, de las **476** esperas que se
juegan:

| qué pasa después de esperar | veces | % |
|---|---|---|
| el stack **vuelve a actuar** en la misma ronda (la promesa se cumple) | 375 | 78,8 % |
| lo **destruyen** antes de que le vuelva a tocar | 67 | 14,1 % |
| **la batalla termina** antes de que le vuelva a tocar | 34 | 7,1 % |

**101 de 476 = 21,2 % de las esperas no reciben la petición prometida.** Es
exactamente la clase de mentira que este ciclo abrió el hallazgo para arreglar,
y la rama de `cast` de al lado **sí** tiene su guardia (`batallaTerminada`, que
para `wait` no puede saltar nunca porque una espera no cierra una batalla). La
promesa hay que escribirla condicionada («si sigue viva cuando le llegue el
turno») o no escribirla.

**Reproducción**: sonda que marca `${id}@${ronda}` al aplicar el `wait` y lo
descuenta en `advance` cuando el stack se activa, atribuyendo el resto a
muerto / batalla acabada. 375 + 67 + 34 = 476, cuadra.

### 3 · MENOR — la prueba de no-sesgo del banco es una **identidad algebraica**, no una medida

`--espejo` pone `rival = conEspera`, o sea **la misma función en los dos
asientos**. Con la misma pareja de ejércitos, los mismos asientos y la misma
semilla de despliegue, las dos batallas de cada pareja son **la misma partida
calculada dos veces**: gana el mismo bando, y ese bando puntúa una vez como
«con espera» y otra como «rival». El resultado es **1 de 2 por pareja, siempre**.

Comprobado, y es tajante: en 10 000 parejas el reparto es
**0 parejas 0-2 · 10 000 parejas 1-1 · 0 parejas 2-0**. Varianza **cero**, IC
pareado **± 0,00 pp**. El `± 0,7 pp` que imprime la herramienta junto a ese
50,0 % es un intervalo binomial sobre una cifra que **no puede variar**.

No es que el diseño esté mal —alternar asientos **sí** neutraliza la ventaja del
atacante, y lo hace por construcción—. Es que **el espejo no lo demuestra**: da
50,0 % exacto pase lo que pase, así que no es «lo único que hace que la cifra
signifique algo», como dicen el plan y el informe. Lo que sí caza es que las dos
batallas de una pareja dejen de ser la misma (semilla o ejércitos distintos por
asiento), que no es poco, pero es otra cosa y conviene que el docstring lo diga.

**Lo que sí sostiene la cifra, y lo he comprobado yo:**

| comprobación | resultado |
|---|---|
| reproducir la cifra del informe (herramienta tal cual, 2500 parejas) | `2555/5000 = 51.1 % ± 1.4`, peor 18, media 4.49, `10151 esperas, 151 defensas` — **idéntico** |
| 10 000 parejas | 10 225/20 000 = **51,13 %**; parejas 0/1/2 = **102 / 9571 / 327** |
| **rival = el `tactics.ts` REAL de `927c8e4`** (no el envoltorio) | 10 226/20 000 = **51,13 %**; 102/9570/**328**. El envoltorio `sinEspera` es **fiel**: una sola batalla de 20 000 difiere |
| sensibilidad (rival que siempre se defiende) | **2979/4000 = 74,5 %** (el informe decía 74,3 % con otra copia) |

El **IC correcto es el pareado**, porque la unidad independiente es la pareja,
no la batalla: **± 0,20 pp**, la mitad de ancho que el binomial que imprime la
herramienta. Y el signo es contundente: **327 parejas ganadas de calle contra
102 perdidas** de las 429 que se deciden. La conclusión del ingeniero —la regla
gana— **aguanta y es más fuerte de lo que él afirma**; lo que hay que corregir
es el instrumento estadístico, no el veredicto.

### 4 · MENOR — «¿es la misma medida que el 51,9 % del arquitecto?» → **no**

El ingeniero lo declara (desviación 4) y lo confirmo: el generador de ejércitos
es suyo (cinco slots al azar del catálogo, 5-25 efectivos, caballero siempre
atacante y nigromante siempre defensor, **sin héroes en ninguno de los dos
bandos**), y el del arquitecto vivía en un árbol de `/tmp` que ya no existe. Con
poblaciones distintas, 51,1 y 51,9 **no son la misma cantidad** y no se pueden
comparar como si una refutara a la otra. El criterio 15 pedía «no juega peor, y
se demuestra»: eso está demostrado. La cifra concreta del plan (51,9 ± 1,4) **no
es reproducible** y no debería quedar escrita como si lo fuera.

Un apunte sobre la población, que además explica lo del hallazgo 1: **el banco
es hoy el único sitio donde `charge` pisa el tablero** (8,2 % de los stacks
generados). En partida real son 0 de 1258. Y `charge` lo tienen solo `cavalry` y
`champion`, las dos del caballero: #50 no puede beneficiar nunca al nigromante.

### 5 · MENOR — `pnpm qa` no llega a ejercitar la rama nueva de la nota

`pnpm qa` cerró con **`16 veredictos, 16 entraron, 0 descartadas`**. Sin
descartes no hay acción sustituta, y sin sustituta no se escribe ni una nota de
las que #52 arregla. O sea: el arnés se corrió (obligatorio, y en verde), pero
**el hallazgo 11 del plan solo está cubierto por el test unitario de
`notas.test.ts`**, no de extremo a extremo. El informe da a entender lo
contrario al poner `pnpm qa` como la verificación de ese punto. Las «14
decisiones de batalla» (antes 13) sí son la espera apareciendo en el circuito
real, eso es cierto.

### 6 · MENOR — «sobreestima, así que espera de más y nunca de menos» tiene una excepción

`convieneEsperar` mide con `hexDistance(e.hex, …)`, o sea desde la **cabeza**
del stack enemigo, mientras que el `distanceTo` de tres líneas más arriba usa
`stackHexes(target)`. Para una criatura de dos hexes la cabeza puede estar un
hex más lejos que su celda más cercana, así que ahí la aproximación **subestima**
la amenaza y la IA espera de menos, justo al revés de lo que promete el
docstring. Afecta a **una sola criatura de las 21** (`bone_dragon`, `hexes: 2`),
y el `+1` del alcance en línea recta tapa el error casi siempre. Es una línea de
docstring, no un cambio de código.

### 7 · MENOR — `CLAUDE.md`, además de lo que ya apuntó el ingeniero

No lo he tocado, como pediste. Lo que le falta:

1. *(del ingeniero)* la tabla de calidad no menciona `tools/qa/enfrentamiento.ts`
   — «si tocas la IA táctica»; **medido aquí: 11,8 s las 5000 batallas**, ~48 s
   las 20 000; se corre a mano, no en CI.
2. *(del ingeniero)* el párrafo de `pnpm qa` dice «13 decisiones de batalla» y
   ahora son **14**.
3. *(mío)* dice **«251 tests»** dos veces (líneas 14 y 15) y son **273**. Venía
   ya desfasado: eran 265 antes de este ciclo.
4. *(mío, sin acción)* comprobado que **sí** siguen siendo ciertos: `pnpm verify`
   6,7 s (medido 6,76 / 6,80 / 6,75) y el párrafo de los puertos de `pnpm qa`,
   que ya está reescrito en pasado desde `fa0cb32`.

---

## Workarounds usados, y por qué no afectan a quien juega

1. **Árboles archivados en el scratchpad** (`git archive <commit> | tar -x`, con
   `node_modules` enlazado) para medir tres commits sin tocar el repo, y con el
   `banco.ts` de `HEAD` copiado encima para que el instrumento sea uno.
   *Efecto colateral honesto*: dentro de un árbol archivado,
   `test/invariantes.test.ts > ninguna ruta de esta máquina` sale **rojo**,
   porque el guardia deriva la ruta del checkout en ejecución y ahí es `/tmp/…`.
   Es un artefacto de mi arnés, no del código: en el repo real `HEAD` da
   **273/273**. Lo digo porque conviene saber que ese guardia **no sabe correr
   fuera del checkout**.
2. **Sondas de contadores** en copias del árbol (`movableCosts`, `mejorCarga`,
   `applyAction`, `advance`, y la evaluación simultánea de A/B/C). No alteran
   ninguna decisión: dan **10 440** turnos en `fa0cb32` y **10 786** en `HEAD`,
   que son exactamente los totales del informe, y el reparto por tipo cuadra
   con el ancla.
3. **Mutante de #50** (`return cargas[0]`) para ver morder los tests. Sirve para
   eso y para nada más.
4. **Copia de `enfrentamiento.ts`** con rivales alternativos (`viejo`, `sin50`,
   `defiende`) y estadística por pareja. No toca la herramienta del repo.

Ninguno pinta nada en pantalla ni fabrica un estado que quien juega no pueda
alcanzar: la única escena que se «prepara» es la de los tests unitarios, que ya
existía.

**Procesos**: el único que arranqué fue `pnpm dev` (PID 1328138), con `set -m`,
`$!` guardado, comprobado que el PID **era** su grupo, y cerrado con
`kill -TERM -1328138`. Puerto 3100 libre después. **No he matado nada por
patrón** y no queda nada vivo mío.

---

## No probado

- **La nota nueva del director de extremo a extremo.** `pnpm qa` no descartó
  ninguna acción, así que la rama de `wait` de `notaAccionSustituida` no llegó a
  ejecutarse en el circuito real. No he conectado un agente por MCP a mano.
- **#50 en juego real**: no hay forma. La caballería no llega al tablero (0 de
  1258 decisiones), así que lo único que lo sostiene son los tests, el banco
  sintético y el +0,14 pp que he medido ahí.
- **Regresión visual del resto de pantallas** (castillo, mapa entero, fin de
  partida): el cambio no toca el cliente y no la he hecho. Vi una batalla
  completa de una semilla y la vuelta al mapa.
- **El orden FIFO entre varios que esperan**: sigue sin contrastarse con
  fheroes2, como ya dice el informe. Con 476 esperas por cada 200 partidas ya no
  es teórico, pero no es algo que yo pueda verificar contra el original.
- **La cifra 51,9 % ± 1,4 del plan**: irreproducible, su árbol no existe. Ver
  hallazgo 4.

---

## Veredicto

**Apto con reservas.**

Los dos issues hacen lo que dicen y lo hacen bien. #50 sale **byte a byte
idéntico** comprobado con un solo instrumento, su desempate es el que se
prometió y sus tests **muerden** cuando se revierte la implementación. #52 es
**exactamente la variante B**, decisión a decisión y sin una sola discrepancia
en 10 786, se juega 476 veces, no alarga las batallas —12 rondas de máximo antes
y después, 0 de 20 000 en el tope— y **gana**: 51,13 % con el intervalo pareado
[50,92 · 51,33], que es más sólido que el que la propia herramienta imprime. El
ancla nueva se reproduce clavada, `pnpm verify` da 273/273, `pnpm qa` sale 0 y
el navegador enseña la espera funcionando en una partida de verdad.

Las reservas son dos, y ninguna obliga a rehacer el ciclo:

1. **El sobrecoste de #50 es trabajo repetido, no el precio de una regla**
   (hallazgo 1). Se paga íntegro por unidades que no pueden cobrarlo, y el mapa
   de costes ya estaba calculado una llamada antes. La cifra real es **+17,6 %
   en `autoResolve` y +0,8 % en la partida**, no +21 % y +6 %.
2. **La nota nueva al agente sigue prometiendo de más** (hallazgo 2): 21,2 % de
   las esperas no reciben la petición que se les anuncia.

Y una corrección de método que no cambia el resultado pero sí lo que se puede
decir de él: **el `--espejo` del banco es una identidad, no una prueba**
(hallazgo 3), así que la frase «es lo único que hace que la cifra signifique
algo» hay que reescribirla — lo que la sostiene es el contraste contra la
táctica vieja de verdad, que también he corrido y que da la misma cifra.
