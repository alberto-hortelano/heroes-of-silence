# QA — la magia se juega (#4 · #2 · #24)

**Veredicto: apto.** Los criterios vigentes se cumplen todos, las dos afirmaciones
que el encargo pedía verificar son **ciertas y las he reproducido yo**, y los cinco
hallazgos son menores: ninguno rompe un criterio ni bloquea a quien juega.

Validado contra las secciones **«Correcciones tras la crítica»** y **«Visto bueno al
plan»**, que mandan. #3 fuera y `data/spells.json` intacto: comprobado, no supuesto.

---

## 1. Criterios, uno a uno

### #4 — el jugador lanza

| Criterio | | Evidencia |
|---|---|---|
| **4.1** Se ve el maná del héroe y su libro | ✅ | Navegador, partida nueva, primera batalla: el panel pinta `Ronda 1` · **`Maná 20 / 20`** y, bajo «Hechizos», el botón `Flecha mágica · 3`. En el mapa, el panel del héroe abre una sección **HECHIZOS** con nombre y coste, y sin libro dice «Sin hechizos: llévalo a un castillo con gremio» |
| **4.2** Se elige con el ratón y se emite una acción **de `legalActions()`** | ✅ | `grep -rn "type: *'cast'" src/client/` → **sin resultados**. `main.ts:250-256` hace `acciones.find(a => a.type==='cast' && a.spell===hechizo && a.target===objetivo.id)` sobre `session.battleLegalActions()`. Y `castable` es `targets.length > 0`, no una regla recalculada (`session.ts:314`) |
| **4.3** Lo no lanzable no se ofrece; si se intenta, se ve el motivo | ✅\* | Tras lanzar, el DOM del botón: `{"disabled":true,"title":"el héroe ya lanzó un hechizo esta ronda","pointer-events":"auto","opacity":"0.4"}` — frase literal de `castBlocker` en `battle.ts:747`. \*El motivo **por objetivo** sí se pierde → hallazgo 1 |
| **4.4** La crónica pone el **nombre**, no el id | ✅ | Parte de guerra: **«Hechizo Flecha mágica: 20 de daño»** y **«Hechizo Prisa»** + «Prisa: velocidad +2 durante 1 ronda» |
| *(diseño)* lanzar **no** consume el turno del stack | ✅ | Tras lanzar: maná `20 → 17`, el **Campesino sigue activo** y sigue en **Ronda 1**. En la ronda 2 el botón vuelve a estar encendido |
| *(diseño)* la selección se suelta cuando debe | ✅ | `Escape` quita los anillos (captura antes/después). `playBattleAction` la suelta en toda acción (`session.ts:369`), `afterBattle` en `finishBattle` **y** en `autoResolveBattle` (`session.ts:407`). **No he encontrado ningún camino que deje una selección zombi**: la selección solo puede nacer con `turnoPropio` no nulo, y todo lo que cambia de escena pasa por uno de esos dos puntos |

### #2 — el gremio enseña

| Criterio | | Evidencia |
|---|---|---|
| **2.2** Un héroe en su pueblo con gremio aprende, sin duplicados | ✅ | Navegador: construyo `mage_guild_1` con Aldo dentro y **el mismo día** la crónica dice «Aprendido: Prisa, Lentitud» — **sin repetir** la Flecha mágica que ya sabía. Sonda: dos `end_turn` más no añaden nada (`['magic_arrow','haste','slow']` estable) |
| **2.3** `maxSpellLevel()` se lee de verdad y recorta | ✅ | Sonda sobre `learnable(...)` con el catálogo entero: sin `wisdom` (tope 2) → `magic_arrow, haste, slow, bless, curse`; con `wisdom:1` (tope 3) → añade `lightning_bolt` y `cure`. Es la única puerta por la que `maxSpellLevel` se lee (`hero.ts:88`) |
| **2.4** El contratado deja de estar condenado | ✅ | Navegador: contraté al «Capitán de Valdeluz» en el castillo con gremio y **nace con Prisa · Flecha mágica · Lentitud** y 10/10 de maná. Crónica: «Héroe contratado» → «Aprendido: Prisa, Flecha mágica, Lentitud» |
| **2.5** La pantalla de castillo dice **qué** enseña | ✅ | Sin gremio: «Sin gremio: construye uno para que tus héroes aprendan magia aquí». Con gremio 1: bloque **ENSEÑA** con `Prisa n.1 · Flecha mágica n.1 · Lentitud n.1` y «Un héroe tuyo parado aquí los aprende solo» |
| **2.6** Test de 2.2 y 2.3, sin sorteo | ✅ | `pnpm verify` → **120/120**, `test/game.test.ts` 41 tests |
| **2.1 borrado** (no hay tirada) | ✅ | `townSpells` (`town.ts:78`) deriva del nivel y **no toca `createRng`**: correcto, no hay nada que sortear con 3 hechizos de nivel 1 y 2 de nivel 2 |

**Adversarial de #2**, todo verde:

- **Pueblo que no es tuyo**: héroe humano parado sobre el pueblo rival con `mage_guild_1` → tras `end_turn`, `spells: ['magic_arrow']`. No aprende. ✅
- **Gremio construido el mismo día, con el héroe dentro** → aprende en la misma acción. ✅
- **Aprender dos veces** → sin duplicados, ni el mismo día ni al día siguiente. ✅
- **Capturar un pueblo vacío con gremio** (`move_hero` sobre él) → aprende en esa misma acción. ✅
- **Capturar un pueblo defendido** → el héroe **no acaba en la casilla del pueblo** (se queda en la de al lado), así que no aprende: correcto, no es un fallo. Ver observación 2.

### #3 — fuera del racimo (decisión del usuario)

| | | Evidencia |
|---|---|---|
| `data/spells.json` intacto | ✅ | `git status --short data/` → **sin salida**. Siguen los 7 de siempre: `magic_arrow, haste, slow, bless, curse, lightning_bolt, cure` |
| No hay `mage_guild_3` | ✅ | `data/buildings.json` solo declara `mage_guild_1` y `mage_guild_2` |
| No se tocó el solar `guild` a mano | ✅ | `src/client/render/town.ts` sin cambios (no aparece en `git status`) |

### #24 — la IA lanza

| Criterio | | Evidencia |
|---|---|---|
| **24.1** `chooseBattleAction()` considera `cast` y `wait` | ✅ | `tactics.ts:158` (`bestCast`, antes del bloque de tirador) y `tactics.ts:227` (`wait`). Medido: **264 `cast` en 40 batallas** con héroes. `wait`: **0 de 1043 decisiones** → hallazgo 2 |
| **24.2** Elige con criterio | ✅ | `spellValue` topa el daño en `stackHp` y descuenta el refresco (`roundsLeftOf`). Medido en el navegador: en «Resolver sola» la IA gastó 3 de maná de mi héroe lanzando por su cuenta (maná 14 → **11** al volver al mapa). Sonda: con un solo `curse` contra no-muertos, `castBlocker` = «no hay ningún objetivo válido» y la IA devuelve `move`, no se atasca |
| **24.3** Test determinista | ✅ | `test/battle.test.ts` 41 tests verdes, incluidos «lanza la flecha mágica cuando rinde más que su coste», «sin maná no lo intenta» y «un refresco no se paga al precio de un lanzamiento nuevo» |
| **24.4** No empeora: ≤ 4/40 sin terminar en 300 días | ✅ | **Reproducido por mí en las dos direcciones**, abajo |

### Los tres añadidos aprobados

| | | Evidencia |
|---|---|---|
| **Copia del maná al salir de la batalla** | ✅ | Los **cuatro** caminos comprobados: (a) navegador, gasté 6 a mano + 3 la IA y el mapa marca **11/20**; (b) sonda atacante que gana → maná 4 llega al mapa; (c) sonda **defensor** que gana → maná 7 llega al mapa (es el camino que solo corre cuando el atacante cae); (d) atacante que pierde → desaparece del mapa, no hay nada que copiar. Y la regeneración cuadra: fuera del pueblo **+1/día**, durmiendo en pueblo con gremio **al tope** |
| **`wait` en la IA** | ✅ implementado / ⚠️ inerte | Correcto y probado; **cero apariciones en partida real** → hallazgo 2 |
| **Guardia de `EffectKind`** | ✅ | **Verificado por mí, no leído.** Sobre una copia del árbol (el repo no se tocó): añadir `'defense'` a `EFFECT_KINDS` → `expected [ 'attack', 'luck', 'speed' ] to deeply equal [ Array(4) ]`; declararle un **lector muerto** (`effectiveDefense`, que no llama a `effectTotal`) → `defense: su lector no suma el efecto: expected 9 not to be 9`. **Muerde por las dos mitades** y nace verde (7/7) |

### Contrato del agente

| | | Evidencia |
|---|---|---|
| `towns[].teaches` | ✅ | `{"mageGuild":1,"teaches":["haste","magic_arrow","slow"]}`, coherente con `mageGuildLevel` |
| `heroes[].spells` | ✅ | `["magic_arrow","haste","slow"]` |
| Prosa de `RESPONSE_FORMAT` | ✅ | `adventure_turn` incluye `teaches` y «NO hay acción para aprender»; `battle_turn` incluye «`cast` **NO consume el turno**» |
| `pnpm qa` | ✅ | **EXIT=0**, 6 turnos de mapa. `0 decisiones de batalla` — declarado por el ingeniero y confirmado |
| El esquema zod no cambia | ✅ | `agent.ts` solo suma prosa; no hay acción nueva que desincronizar |

---

## 2. Las dos afirmaciones que pedías verificar

### a) «Lanzar a mano una Maldición sobre un no-muerto ya no se acepta» — **cierto, y bien defendido**

Ejecutado sobre una batalla real (pikeman + héroe con `curse` vs 30 esqueletos):

```
castBlocker(curse) sin objetivo:  no hay ningún objetivo válido
castBlocker(curse, esqueleto):    Esqueleto es inmune a "Maldición"
casts legales:                    magic_arrow->defender-0, bless->attacker-0
applyAction(cast curse) →         RECHAZADO: no se puede lanzar: Esqueleto es inmune a "Maldición"
                                  maná intacto: 30   castThisRound: false
```

Me parece bien defendido, y añado tres cosas que lo sostienen:

1. **Nadie podía llegar ahí por la puerta buena.** `legalActions()` nunca lo ofrecía —ni
   antes ni ahora—, así que el comportamiento viejo solo castigaba a quien lo pidiera a
   mano: le cobraba 3 de maná **y la tirada de la ronda** para que el efecto rebotara. El
   nuevo lo rechaza antes de cobrar y **dice por qué**. Es estrictamente mejor, y más
   fail-loud, que es lo que pide `CLAUDE.md`.
2. **El rebote no quedó huérfano.** `applyStackEffect` sigue emitiendo `immune`
   (`battle.ts:474`) para el mordisco de la momia, sigue con test
   (`test/battle.test.ts:613`, `curse_on_hit`) y sigue pintándose (`panels.ts:370`). No se
   ha matado una rama del motor por el camino.
3. **Un matiz que no está escrito en `implementacion.md` y merece una línea en el issue:**
   para el agente MCP la forma del castigo cambia. `director.ts:150-152` responde a una
   acción de batalla rechazada **jugando en su lugar la acción de la IA de reglas**, que sí
   consume el turno del stack. Antes el rebote costaba 3 de maná y el stack seguía pudiendo
   pegar; ahora cuesta el turno del stack. Sigue siendo el intercambio correcto —el agente
   no debería llegar ahí y ahora se le dice el motivo—, pero es una consecuencia real que
   nadie anotó.

### b) «Barrido de 40 semillas: 2/40 (9 y 18)» — **cierto, reproducido en las dos direcciones**

No me fié del número: monté un *worktree* de `HEAD` (`cb50aa4`), copié en él
`tools/qa/barrido-semillas.ts` y medí la línea base con **el mismo script**.

| Árbol | Salida literal |
|---|---|
| **HEAD `cb50aa4`** (línea base) | `sin terminar: 4/40 → [9, 18, 24, 34]` · `batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100` |
| **Árbol de trabajo** (el racimo) | `sin terminar: 2/40 → [9, 18]` · `batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100` |

Coincide **exactamente** con lo reportado: 4/40 → 2/40, las semillas 24 y 34 pasan a
terminar, ninguna que terminaba deja de hacerlo, y el techo acordado (4/40) queda a la
mitad. La señal de alarma de `wait` —una batalla que llegue a `MAX_ROUNDS`— no se dispara:
**0/40 en el tope**, ni antes ni después.

Un apunte sobre la herramienta, no sobre el resultado: la **segunda** medida del barrido
crea las batallas con `hero: null` en los dos bandos, así que vigila `wait` pero **no
ejerce ni un `cast`**. Lo suplí con una medición propia (abajo).

---

## 3. Hallazgos

### 1 · menor — el motivo **por objetivo** existe en el núcleo y la pantalla lo tira

La pasada de simplify añadió a `castBlocker` un cuarto parámetro para responder «¿sobre
**ese**?», con frases ya escritas para una persona. Ninguna llega a la pantalla: `main.ts`
redacta la suya, genérica.

**Repro desde el arranque**: `pnpm dev` → partida nueva → llevar el héroe a un monstruo →
en la batalla, pulsar **Prisa** → clic sobre un **enemigo**.
**Lo que se ve**: `Ese hechizo no se puede lanzar sobre esa unidad.`
**Lo que el núcleo tenía listo** (medido): `castBlocker(b,'attacker','haste',enemigo)` →
`"Prisa" va dirigido a un aliado`. Con `curse` sobre un esqueleto sería
`Esqueleto es inmune a "Maldición"`, que además **enseña una regla del juego**.

Pesa un poco más que su tamaño porque es la única frase del racimo que no escribe el
núcleo, justo lo que la desviación 1 del ingeniero decía haber cerrado. Está a un `find`
de distancia: el `main.ts:258` que hoy pone la frase fija ya tiene `hechizo` y `objetivo.id`.

### 2 · menor — el `wait` de la IA no se ejerce **nunca** en partida

El ingeniero lo declaró (0 de 691 decisiones); lo confirmo con mi propia medición, más
amplia: 80 batallas de IA contra IA, con y sin héroes.

```
sin héroes:   { move: 189, shoot: 95, attack: 158 }              peor ronda 8, 0/40 en el tope
con héroes:   { cast: 264, move: 181, shoot: 94, attack: 130 }   peor ronda 6, 0/40 en el tope
```

**`wait` no aparece ni una vez en 1043 decisiones.** Su condición —el stack no alcanza a
nadie **y** `movableHexes` devuelve vacío— exige embotellarlo en una esquina con los suyos,
que es exactamente el escenario sintético que monta su test. Es correcto y está probado,
pero de los tres añadidos aprobados es el único que entrega **cero** comportamiento
observable. No lo llamo defecto porque el criterio 24.1 pedía «considerarlo»; lo llamo
hallazgo porque el usuario decidió meterlo midiéndolo por separado y merece saber la medida.

### 3 · menor — la pantalla de castillo promete el aprendizaje y no enseña que haya pasado

**Repro**: entrar al castillo con el héroe dentro → construir el gremio.
**Lo que se ve**: el bloque **ENSEÑA** con los tres hechizos y «Un héroe tuyo parado aquí
los aprende solo». Debajo, «Ejército de Aldo de Valdeluz».
**Lo que no se ve**: el **libro** de ese héroe. Y el panel del castillo tampoco pinta la
crónica, así que el «Aprendido: Prisa, Lentitud» solo aparece al **volver al mapa**.
Quien juega tiene que salir del castillo para comprobar que el castillo cumplió lo que
acaba de prometer, y ya hay una sección de héroe ahí mismo donde ponerlo.

### 4 · menor — al terminar la batalla desaparece la fila de Maná

`renderBattlePanel` (`panels.ts:228-232`) sustituye el panel entero por «Victoria /
Derrota» + el parte de guerra. Con el maná convertido en recurso persistente, ese es
justo el momento en que su valor importa —¿me queda para la siguiente pelea o vuelvo al
castillo?— y es el único momento en que no se puede leer sin cerrar la batalla.
**Repro**: batalla → lanzar → terminar la batalla → el panel ya no dice el maná.

### 5 · menor — el orden del libro depende de cómo se aprendió

**Repro**: comparar los dos héroes de la misma partida.
Aldo (inicial): `Flecha mágica · Prisa · Lentitud`. Capitán (contratado): `Prisa · Flecha
mágica · Lentitud`. `townSpells` sí ordena (nivel, coste, id) y el bloque ENSEÑA sale
ordenado; `hero.spells` se rellena por orden de llegada (`game.ts:348`). Son dos listas de
lo mismo a dos clics de distancia y no coinciden. Cosmético, pero cuesta un `sort` de una
línea.

---

## 4. Observaciones (no son hallazgos)

1. **`spellOptions()` fija `'attacker'` a mano** (`session.ts:302, 316`). Hoy es correcto y
   está bien: en el cliente la persona es **siempre** el atacante —`pendingBattle` nace del
   `move_hero` de quien mueve, y las batallas donde el humano defiende las resuelve
   `resolvePendingBattle` sin pantalla—. Pero es una mina si algún día se juega una defensa
   a mano; `turnoPropio` ya sabe el bando y podría pasarlo.
2. **Tras ganar la batalla por un pueblo, el héroe no entra en la casilla** (medido:
   héroe en `{x:20,y:19}`, pueblo en `{x:20,y:20}`), así que la ausencia de
   `syncSpellbooks` en `settleBattle` no se nota. Si algún día el ganador entra, habría un
   día de desfase hasta la siguiente acción.
3. **`panels.ts` importa `townSpells` directamente del núcleo.** No rompe la frontera: es
   una consulta pura, va al lado de `mageGuildLevel` y `dailyIncome` que ya estaban, el
   guardia de `invariantes.test.ts` sigue verde y era lo que decía el plan.
4. **Lo bueno que conviene decir en voz alta**: no encontré ni un camino que deje un
   hechizo seleccionado cuando no debe; el maná cuadra en los cuatro caminos; la consola
   quedó **limpia** en toda la sesión (solo `[vite] connected` y `[assets] 139 imágenes
   generadas cargadas`, ni un error); ningún test se relajó —la única aserción borrada, la
   del rebote de la Maldición, se cambió por otra **más fuerte**—; ninguna semilla de test
   se tocó; y **0 €**: `git status --short data/ tools/gen/ assets/` sin salida y
   `spend.json` con fecha del 23 de agosto, anterior a este ciclo.
5. **Dirección de arte**: el anillo del objetivo (punteado, cristal, por fuera del de
   defensa) se lee bien sobre el fondo oscuro y no tapa el sprite ni el contador de
   efectivos; con **Prisa** anilla mis dos stacks y **no** al enemigo, con **Flecha mágica**
   solo al enemigo. El único reparo: la fila **Maná** vive dentro de la ficha del stack
   activo (Bando / Efectivos / Moral / Ronda / **Maná**), y se puede leer como si el maná
   fuera del Campesino en vez del héroe.

---

## 5. Workarounds usados

Ninguno en el navegador: el recorrido de #4 y #2 se hizo con la partida real, entrando a la
batalla desde el mapa. Los de las sondas de `core` son estos, y por qué no tapan nada:

| Workaround | Por qué no afecta a quien juega |
|---|---|
| `hero.at = town.at` en las sondas | Atajo para no caminar. El camino real (`move_hero` al castillo) está verificado **en el navegador**, y es el que dispara `syncSpellbooks` |
| `rival.buildings.push('mage_guild_1')` | Solo para poder probar el caso **negativo** (aprender en pueblo ajeno) sin jugar veinte días de IA. Fuerza la condición que debe fallar, no la que debe pasar |
| `b.heroes.defender.mana = 7` a media batalla | La copia del defensor son dos líneas y solo corre cuando el atacante cae; forzar la entrada no oculta nada de la salida, que es lo que se mide |
| Worktree de `HEAD` + copia del árbol en `/tmp` | Para medir la línea base y para comprobar que el guardia de `EffectKind` muerde **sin tocar el repo**. `git status` al terminar es idéntico al de partida: 19 modificados, 2 sin seguir |
| Recargar la página a mitad de sesión | La ventana de Chrome se redimensionó sola y los clics dejaron de coincidir con la captura. Cosa del entorno, no del juego |

**Uno que no pude evitar y que sí es un obstáculo compartido**: la semilla del navegador es
`Date.now() % 100000` (`main.ts:45`) y no se puede fijar **ni leer** desde la pantalla. Es
anterior a este racimo, así que no lo cuento como hallazgo, pero significa que **ningún
fallo encontrado jugando se puede entregar como «semilla X, día Y»**, que es justo la receta
de repetición que pide `CLAUDE.md`. Un `?seed=` en la URL y el número en la barra de estado
valen tres líneas y desbloquean todas las QA futuras. Va al backlog.

---

## 6. No probado

| Qué | Por qué |
|---|---|
| **«no hay ningún objetivo válido» en el navegador** | Necesita Maldición, que es nivel 2 y pide `mage_guild_2`: 4 mercurio + 4 azufre + 4 cristal + 4 gemas, varios días de ingresos. Cubierto en `core` (sonda + `test/battle.test.ts`) y la frase sale de la misma función que sí vi en el `title` del botón |
| **Una decisión de batalla del agente por el circuito MCP completo** | `pnpm qa` sale en verde pero con `0 decisiones de batalla` (su política camina hacia recursos), y no pude sostener un `pnpm server` en esta caja para hablarle a mano por MCP. Cubierto por `test/agent-link.test.ts` (cliente MCP real, batalla acción a acción, verde) y verifiqué el payload leyendo `serializeBattleTurn` directamente |
| **`lightning_bolt` y `cure` en partida** | Inalcanzables por diseño con #3 fuera. Declarado |
| **La rama `heal` de `spellValue` en partida** | No hay quien conozca `cure`. Declarado |
| **La puerta de Sabiduría mordiendo en partida** | Con gremio máximo 2 y tope 3 no recorta nada. Probada en `learnable()`, correcta el día que llegue `mage_guild_3`. Declarado |

---

## 7. Veredicto

**Apto.**

`pnpm verify` **120/120** · `pnpm qa` **EXIT=0** · barrido **2/40** contra una línea base de
**4/40 que medí yo en `HEAD`** · el guardia de `EffectKind` **muerde por las dos mitades**,
comprobado a mano · el recorrido completo de quien juega —partida nueva, batalla, hechizo,
gremio, aprender, volver al mapa, contratar— funciona con la consola limpia · maná coherente
en los cuatro caminos · **0 €**.

Los cinco hallazgos son menores y ninguno bloquea: cuatro son de pantalla y el quinto es una
medida honesta sobre `wait`. El que yo arreglaría antes de cerrar es el **1**, porque el
núcleo ya escribió la frase y el cliente la está tirando a la basura.
