# QA — el coste cuadra con la renta

Validación de `d2c10bf..f270ea9` (5 commits) contra los 15 criterios de
`requisitos.md`. Árbol limpio en `f270ea9`; sin `implementacion.md` —al ingeniero
lo interrumpieron—, así que la fuente de verdad son los commits.

**Línea base medida de verdad**, no citada: worktree sobre `d2c10bf` y las mismas
200 semillas. Los guiones de medida quedan en `.cache/qa/` de este checkout
(ignorado por git) para que se puedan repetir: `medir.ts`, `minas.ts`,
`facciones.ts`, `cadena.ts`, `cadena-swap.ts`, `guardias.ts`, `tamanos.ts`.

## Los cuatro guardias, contrastados con lo que traía el encargo

| Guardia | Lo que se me dijo | Lo que sale | |
|---|---|---|---|
| `pnpm verify` | 289 tests, 7,5 s | 289 tests verdes; **7,18 / 7,28 / 7,22 s** (tres pasadas) | ✅ |
| `pnpm banco` | 0/200, `cf7b8d3b…`, 26 444 líneas | idéntico: `cf7b8d3b5129aa99…b233f6`, 26 444 líneas, `ancla: igual` | ✅ |
| `barrido-semillas` | 0/40, peor batalla 8 rondas | `sin terminar: 0/40 → []`, peor caso 8 rondas, 0/40 en el tope | ✅ |
| `pnpm qa` | verde, 12 veredictos, 28 minas | `12 veredictos, 12 entraron, 0 descartadas`, `minas en juego: 28`, puertos efímeros 45547/41911 | ✅ |

Los 7,5 s frente a 7,2 s es ruido de máquina; el resto cuadra al dígito.

## Criterios de aceptación

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | `generateMapPlan` coloca gemas, mercurio y azufre | ✅ | 200 mapas generados: **28 minas cada uno**, los 7 `RESOURCE_KINDS` presentes en 200/200. Antes: 8 minas, 4 recursos, y a los 200 mapas les faltaban tres recursos |
| 2 | Misma regla que las otras cuatro, sin caso especial | ✅ | Un solo bucle en `generate.ts`: `a=(2+i*2, 7+k*2)`, `b=(width-3-i*2, height-8-k*2)`, `MINAS_POR_RECURSO=2` para los siete. Ninguna rama por recurso |
| 3 | Reparto simétrico entre bandos | ⚠️ | **Espejo geométrico exacto**: 0 minas sin reflejo en 200 mapas (5 600 minas). Pero el **coste real de camino** no es simétrico: p0 llega antes a mercurio **200/200**, azufre **200/200**, gemas **199/200**, cristal **199/200**. Δ 25–37 puntos de movimiento (2–4 % de una jornada). Causa y alcance en el hallazgo 7 |
| 4 | Test: N mapas, los siete recursos con mina | ✅ | `test/game.test.ts` «el generador reparte minas de los siete recursos, y en espejo exacto (#68)»: 20 semillas, recorre `RESOURCE_KINDS` y afirma además el espejo casilla a casilla |
| 5 | Coste de fheroes2, no inspiración | ✅ | Contrastadas **18/18 filas** contra `buildinginfo.cpp` de ihhub/fheroes2 traído de la fuente. Detalle abajo. `knight_dwelling_5 = 3000g + 20 madera` ✔; ninguna morada 1–4 pide raros en ninguna facción ✔ (y hay test que lo vigila) |
| 6 | Asimetría corregida o justificada **y escrita** | ⚠️ | Está escrita (`_asimetria_entre_facciones` en `data/buildings.json`, mensaje de `faa4f06`, plan §4) y la aritmética que cita es correcta. Pero **nombra el mecanismo equivocado**: hallazgo 3 |
| 7 | Cada cifra cambiada con su fuente al lado | ✅ | `_fuente_de_los_costes` en el JSON (18 filas → `_buildingStats`), docstring de `DEFAULT_STARTING_RESOURCES` (→ `kingdom.cpp`, NORMAL) y, para la única cifra sin fuente (`MINAS_POR_RECURSO=2`), se **dice que no la tiene** y se escribe la medida que la fija. Verificado contra el original, no solo leído |
| 8 | `data/*.json` y lo mínimo de código | ✅ | 40 líneas de `data/buildings.json`; en código: `strategy.ts` +2 líneas efectivas, `game.ts` 6 valores, `generate.ts` el bucle. El resto del diff es prosa y tests |
| 9 | La morada 5 deja de ser 0/200 | ✅ | **52/200** (antes **0/200**, medido en el worktree). Coincide al entero con lo que anunció el ingeniero. Morada 6: **10/200** (antes 0) |
| 10 | Las criaturas de nivel ≥5 pisan el tablero; el dragón óseo como prueba | ❌ | En el mapa por defecto: **2 de 7 tipos** pisan el tablero (caballería, campeón), en **5 de 200 partidas**. El **dragón óseo: 0/200 comprado, 0/200 en el tablero**. En 48×48 sí: **7/7 tipos** y dragón óseo **12/20**. Hallazgo 1 |
| 11 | La partida no dura más | ✅ | Mediana **7 → 6**, p90 **8 → 7**, máximo **22 → 20**, media 6,86 → 6,67. Se **acorta** |
| 12 | `pnpm verify` verde; los tests de coste, uno a uno | ✅ | 289 verdes. Auditado el diff entero de `test/`: **la única aserción que se mueve sube** (`log.length > 200` → `> 500`) y se **añade** una tercera (`seen.length > 0` en > 400 eventos). Ninguna se relaja, ninguna se borra. Los tres tests de coste nuevos son aserciones exactas (`toEqual`) |
| 13 | `barrido-semillas` en 0 | ✅ | `0/40 → []`. Y `pnpm banco` confirma 0/200 |
| 14 | `pnpm qa` verde | ✅ | Sale 0; 12 veredictos, 12 entraron, 0 descartadas, las cinco consultas ejercitadas |
| 15 | 0 € de fal.ai | ✅ | `tools/gen/` y `assets/` no aparecen en el diff; `tools/gen/spend.json` sigue con fecha **23 ago 20:18**, dos días anterior a los commits del ciclo |

### El commit sospechoso, `f270ea9`, línea a línea

Era el encargo explícito: **¿relajó un guardia o actualizó una cifra?** Actualizó
cifras, y las cifras están **medidas**. El commit toca **solo comentarios** —ni
una línea de aserción en los dos ficheros—, y cada número que escribe lo he
reproducido:

| Lo que dice el comentario nuevo | Lo que sale al ejecutarlo |
|---|---|
| semilla 9 en 24×24 acaba **el día 6** con **134 hechos** de **quince** tipos, solo falta `spells_learned` | día 6, **134** hechos, **15** tipos, `faltan: [spells_learned]` |
| semilla 9 en 48×48 llega al **día 23** con **618 hechos** de los **dieciséis** tipos y **548 con sello** | día 23, **618** hechos, **16** tipos, **548** con sello |
| el guardia cuesta **310 ms** (tres pasadas: 312, 311, 301) | 319 / 307 / 315 ms, media 314 |

Y los umbrales que sostienen: `> 500` sobre 618 (holgura 24 %), `> 400` sobre 548
(37 %), `>= 15` con 16 tipos presentes. El umbral de eventos **subió** de 200 a 500
en `8a6b172` y este commit no lo tocó. **No se relajó nada.**

### Las 18 filas de coste, contra la fuente

Traídas de `src/fheroes2/castle/buildinginfo.cpp` (ihhub/fheroes2), sobre
`Cost {gold, wood, mercury, ore, sulfur, crystal, gems}`. Las 18 cuadran **exactas**:

```
KNGT  M1 200 · M2 1000 · U2 1500+5w · M3 1000+5o · U3 1500+5o · M4 2000+10w+10o
      U4 2000+5w+5o · M5 3000+20w · U5 3000+10w · M6 5000+20w+20cr · U6 5000+10w+10cr
NECR  M1 400 · M2 1000 · U2 1000 · M3 1500+10o · U3 1500+5o · M4 3000+10w
      U4 4000+5w+10cr+10ge · M5 4000+10w+10su · U5 3000+5o+5cr
      M6 10000+10w+5me+10o+5su+5cr+5ge   ·   NECR no tiene U6
```

También cuadra lo que el JSON afirma de las once filas **no** tocadas: `castle`
`{5000,20w,20o}`, `mage_guild_1` `{2000,5w,5o}`, `mage_guild_2`
`{1000,5w,4me,5o,4su,4cr,4ge}`, `tavern` y `marketplace` `{500,5w}` — todas
idénticas al original; los tres ayuntamientos, en efecto, no existen allí.

Y `DEFAULT_STARTING_RESOURCES`: `Kingdom::_getKingdomStartingResources` da NORMAL
`{7500,20,5,20,5,5,5}` y HARD `{5000,10,2,10,2,2,2}`. El valor viejo era
`7500 oro / 10w / 10o / 2 de cada raro`: **oro de NORMAL y material de HARD**,
exactamente como dice el commit. El nuevo es NORMAL entero.

## Hallazgos

### 1 · Importante — El dragón óseo sigue sin aparecer en el mapa que se juega

El criterio 10 lo señalaba como «la prueba de que ambas mitades entraron». En las
200 semillas del mapa por defecto (24×24, el que abren `pnpm dev`, `pnpm banco`,
`pnpm qa` y cualquiera que juegue):

| nivel ≥5 | comprada | en el ejército de un héroe | **en el tablero** |
|---|---|---|---|
| caballería | 52/200 | 4/200 | **5/200** |
| campeón | 11/200 | 1/200 | **1/200** |
| paladín | 2/200 | 0 | **0** |
| cruzado | 1/200 | 0 | **0** |
| liche · liche mayor · **dragón óseo** | **0** | 0 | **0** |

*(«en el tablero» está medido exacto: un `BattleTakeover` observador lee
`state.pendingBattle.battle.stacks` en cada batalla y no la cierra, así que no
toca una sola tirada — mismos días y mismo ganador que sin él.)*

**2 de 7 tipos**, en **5 de 200 partidas**. La línea base era 0 de 7, así que hay
avance, pero no el que el criterio pedía.

Y hay un segundo escalón que el recuento por edificio esconde: **52/200 construyen
la morada 5 y compran caballería, pero solo 5/200 la ven pelear.** La unidad cae en
la **guarnición** porque el héroe está fuera atacando, y se queda ahí hasta el
final. Reproducible: `?seed=1`, día 7 se construye `knight_dwelling_5` y se compran
3 caballerías; días 8 y 9, `guarnición town-0: cavalryx6 …`; la partida acaba el 9
sin que salgan del castillo. Con la semilla 3 pasa lo mismo el día 5. Es #5
(guarnición y héroe visitante) mordiendo justo donde este ciclo acaba de poner
contenido.

**En 48×48 (20 semillas) sí se cumple entero**: `necromancer_dwelling_6` **13/20**
—el número exacto que predijo el plan—, **7/7 tipos** en el tablero y dragón óseo
**12/20**. O sea: el trabajo desbloqueó el contenido, pero hacen falta días que el
mapa por defecto no da. La predicción del propio `requisitos.md` («con el material
cuadrado, ocho días bastan… 194 de 200 llegan a la morada 6») venía de la
contrafáctica de *material infinito* de la crítica, no de este coste: lo entregado
da **10/200**.

*Qué esperaba quien juega:* que el bestiario que ya tiene arte generado se vea.

### 2 · Importante — El nigromante no llega ni a la morada 4, y el desequilibrio está medido

Cadena de moradas construidas, 200 semillas:

```
caballero    2:200  3:200  4:200  5: 52  6: 10     oro final medio 2 502
nigromante   2:200  3:200  4: 23  5:  0  6:  0     oro final medio   131
```

El nigromante **se para en la morada 4** en 177 de 200 partidas y termina cada una
sin blanca. La mitad nigromante del contenido nuevo (liche, liche mayor, dragón
óseo) queda tan tapiada como antes del ciclo.

Y no es la esquina. Control con las **facciones intercambiadas de esquina**, mismos
mapas y mismas semillas:

| | victorias | caballero llega a morada 5 | nigromante llega a morada 5 |
|---|---|---|---|
| p0 = caballero (de serie) | p0 **184** / p1 16 | 50/200 | 0/200 |
| p0 = nigromante | p0 70 / p1 **130** | 167/200 | 1/200 |

El caballero gana **314 de 400** (78,5 %) lleve la esquina que lleve. En la línea
base `d2c10bf` el mismo control da **213 de 400 (53,25 %)** — casi una moneda al
aire. **El ciclo mueve el equilibrio de facciones 25 puntos.** El plan lo midió
(129 → 184, que reproduzco al entero) pero lo atribuyó a la esquina más el «sin
Nigromancia»; el control dice que es la facción.

Es una consecuencia declarada de copiar el original, no un fallo de
implementación. Lo reporto porque **la decisión de aceptarla es del usuario**, la
cifra que la describe no estaba medida con control, y la promesa de llevarla a
issue no se cumplió (hallazgo 4).

### 3 · Importante — La justificación escrita del criterio 6 nombra la palanca equivocada

`data/buildings.json` dice: *«No paga más, paga más lento —el azufre rinde 1/día y
la madera 2— y más oro»*. Medido, **el azufre no llega a pintar nada**: el
nigromante se atasca en la **morada 4**, que pide `3000 oro + 10 madera` y **ni un
gramo de azufre**. Lo que le falta es **oro**: acaba con 131 de media frente a los
2 502 del caballero, y su cadena hasta la morada 5 cuesta **9 500 de oro** contra
**7 000** — es decir, la del caballero **cabe en la bolsa de salida (7 500) y la
suya no**.

El criterio 6 pedía que la asimetría se justificara por escrito. Está escrita, pero
quien lea esa frase dentro de seis meses buscará minas de azufre y no encontrará el
problema. Es exactamente el tipo de comentario que este repositorio trata como
documento de diseño.

*Sugerencia (no la aplico):* que la nota diga «cuesta 9 500 de oro contra 7 000, y
la bolsa de salida son 7 500», y que el azufre figure como el segundo muro, no el
primero.

### 4 · Importante — Las tres promesas «va a issue» del plan §6 no se abrieron

El plan cerraba con tres cosas medidas para el backlog: (a) el desequilibrio
129→184, (b) que nadie ataque un castillo con guarnición mayor, (c) que la morada 6
se quede en 10/200 por días y no por dinero. `gh issue list` da como más reciente
**#86, de las 19:47**; los commits del ciclo son de las **22:29–22:47**. No hay
ningún issue nuevo. Es lo que cabía esperar de una interrupción justo antes de
`implementacion.md`, pero las tres medidas se pierden si no se anotan.

### 5 · Menor — `CLAUDE.md` quedó describiendo un test que ya no existe

El plan §5 lo apuntaba («Hay que rehacer las cifras del párrafo de `CLAUDE.md`») y
no se hizo. No lo toco, que es tuyo:

- líneas **14 y 15**: «282 tests» — son **289**. (Los «7,2 s» sí siguen exactos:
  7,18 / 7,28 / 7,22.)
- líneas **591–592**: «El del `JSON` juega **20 días** con la semilla 9 —**261
  eventos** de los dieciséis tipos, **224 con sello**—». Hoy ese guardia juega
  **48×48, 40 días**, y da **618 hechos, 16 tipos, 548 con sello**. La frase
  describe un test que se borró en `8a6b172`.
- línea **555**: «**2 turnos de mapa y 14 decisiones de batalla**» para `pnpm qa` —
  hoy sale «**3 turnos de mapa y 9 decisiones de batalla**».

### 6 · Menor — 14 de 625 tamaños de mapa que antes generaban ahora lanzan

El `throw` nuevo de `tomar()` es correcto y fail-loud, pero **estrecha el dominio**
de `generateMapPlan`. Barriendo 16..40 × 16..40:

```
d2c10bf   jugables 625 / 625      throw de mina 0
f270ea9   jugables 611 / 625      throw de mina 14
```

Los 14 son **altura 17 o 19 con anchura impar** (17×17, 19×17, 19×19, 21×17 … 29×19):
con altura 17 la fila de abajo cae en `y=7,9`, las mismas que la de arriba, y con
anchura impar las columnas de los dos bandos coinciden en paridad.

**Nadie en producción pasa tamaño**: `session.ts`, `director.ts` y `partidas.ts`
llaman a `newGame({seed})` a secas, y `map_generate` no dibuja —el agente manda un
plan y lo construye `buildMap`—. Así que hoy no lo alcanza ningún jugador ni el
agente. Lo reporto porque es una regresión latente del tipo que sale mucho después
(#23, #27) y porque el mensaje, que nombra recurso y casilla, no dice qué hacer:
«prueba con anchura par» o «altura ≥ 20» ahorraría el rato de deducirlo.

### 7 · Menor — Las cuatro minas raras caen sistemáticamente más cerca del jugador 0

El espejo de casillas es exacto (0 fallos en 5 600 minas), pero el **terreno no está
en espejo**, y quien camina paga terreno. Coste real de camino desde la casilla de
salida de cada héroe a la mina más cercana de cada recurso, 200 semillas:

| recurso | p0 medio | p1 medio | Δ | p0 más cerca / p1 / empate |
|---|---|---|---|---|
| madera | 303,2 | 301,6 | −1,6 | 4 / 8 / 188 |
| mineral | 380,0 | 380,0 | 0,0 | 0 / 0 / 200 |
| oro | 380,0 | 380,0 | 0,0 | 0 / 0 / 200 |
| cristal | 520,3 | 545,5 | +25,3 | **199** / 1 / 0 |
| gemas | 720,3 | 755,4 | +35,1 | **199** / 1 / 0 |
| mercurio | 945,5 | 980,3 | +34,8 | **200** / 0 / 0 |
| azufre | 1 120,0 | 1 156,6 | +36,6 | **200** / 0 / 0 |

**Es preexistente**: en `d2c10bf` el cristal ya salía 200/200 a favor de p0 con
Δ 25,5. El ciclo no lo crea, lo **extiende a tres recursos más** — y son justo los
cuatro que piden las moradas de nivel 5 y 6.

Causa, y es de una línea cada una: de las cinco regiones de terreno de
`generate.ts`, las dos de pueblo sí están en espejo, y las otras **tres no**: `rough`
en `(⌊w/2⌋, ⌊h/2⌋) = (12,12)` cuando el espejo de (12,12) es (11,11); y `swamp`
(6,18) frente a `snow` (18,6), cuando el espejo de (6,18) es (17,5). Las tres van
desplazadas una casilla hacia la esquina de p1.

La magnitud es pequeña —25–37 puntos sobre jornadas de 1 100–1 500, un 2–4 %— y no
explica por sí sola el 78,5 % del caballero (el control de esquina del hallazgo 2 lo
descarta). Pero el criterio 3 dice «si un jugador nace con una mina de gemas a mano
y el otro no, la partida está decidida por el generador», y el signo es
**estructural, no ruido**: 199 y 200 de 200 no salen por azar.

### 8 · Menor (dirección de arte) — Veintiocho minas dibujan cuatro filas rectas de siete

Con «Ver mapa entero» el mapa enseña **cuatro rectas horizontales de siete iconos**,
dos por bando, y las dos de cada bando son la misma secuencia repetida una casilla
más abajo. Con 8 minas (dos filas de cuatro) se leía como un accidente; con 28 se
lee como una rejilla, y ocupa media anchura del mapa. No estorba al juego —los
iconos son distinguibles y no se solapan— pero contradice el resto del mapa, que sí
tiene formas orgánicas (los blobs de nieve, pantano y grava). Es cosmético y no
bloquea nada; queda apuntado porque el generador de mapas es contenido visible.

## Lo que sí se ve bien en el navegador

`pnpm dev` + `?seed=1`, empezando por donde empieza quien juega:

- **La pantalla de castillo enseña los costes nuevos, correctos y legibles**:
  morada 5 `20 madera + 3000 oro`, morada 6 `20 madera + 20 cristal + 5000 oro`,
  morada 2 `1000 oro` sin madera, morada 3 `5 mineral + 1000 oro`. Cuadran con el JSON.
- **El rótulo de coste más ancho que existe cabe**: construido `mage_guild_1`, el
  solar pasa a ofrecer `mage_guild_2` con sus **siete** recursos, y el rótulo
  **envuelve en dos líneas** dentro del solar sin tapar el arte ni salirse. Es el
  mismo diseño de siete que usará `necromancer_dwelling_6`.
- **Las tres minas nuevas se pintan y se distinguen**: la fila `y=7` enseña los siete
  iconos seguidos, y el mapa entero, las 28.
- **Consola limpia**: tres mensajes, ninguno de error (`[vite] connected`,
  `[assets] 139 imágenes generadas cargadas`).
- Perdiendo el héroe a propósito, el panel dice «No tienes héroes en el mapa.
  Contrata uno en tu castillo» y el castillo ofrece **«Contratar héroe (2500 oro)»**:
  el callejón tiene salida, que es la cara humana de lo que arregla `36fd869`.

## Workarounds usados

| Workaround | Veredicto |
|---|---|
| Observador `BattleTakeover` que **no cierra** la batalla, para leer los stacks del tablero | **No afecta a quien juega.** Es una vía que el propio contrato contempla («una toma a medias cae sola en el respaldo de siempre»). Comprobado que no altera nada: con y sin él, las 200 semillas dan la misma mediana, el mismo p90, el mismo máximo y el mismo reparto 184/16 |
| Plan de mapa con las facciones intercambiadas, para separar facción de esquina | **No afecta a quien juega**: es un banco de medida, no una ruta del juego. Sí cambia el consumo del rng respecto a la corrida normal (pasar `plan` explícito), por eso las cifras de ese experimento (50/200) no son las de la corrida principal (52/200): **las dos ramas del experimento se comparan entre sí**, no contra el resto del informe |
| Perder el héroe a propósito en el navegador para ver el estado «sin héroes» | Es un estado al que se llega jugando; no es un montaje |
| Worktree sobre `d2c10bf` para la línea base | Solo lectura |

Ningún workaround hizo falta para **observar** el cambio: los costes, las minas y
la morada 5 se ven por el flujo normal.

## No probado

- **La morada 6 del nigromante en pantalla.** Su rótulo de siete recursos no lo he
  visto renderizado: para eso hace falta un castillo nigromante, y el humano juega
  siempre al caballero. El diseño de siete sí queda verificado con `mage_guild_2`,
  que usa el mismo renderizador y la misma envoltura a dos líneas.
- **El agente jugando a mano** (`pnpm partida` + Claude Code en otra terminal). Lo
  cubre `pnpm qa`, que es el circuito entero y sale verde; montarlo a mano habría
  costado más que el cambio que valida.
- **La ampliación del `zoom` del navegador**: la herramienta devolvió recortes
  desalineados y capturas con tiempo agotado varias veces en esta sesión. Es
  entorno, no producto —la consola está limpia y las capturas completas salen
  bien—, así que la lectura fina de iconos la he hecho sobre la captura entera.
- **`tools/qa/enfrentamiento.ts`**: no aplica, este ciclo no toca cómo decide la IA
  de batalla.

## Veredicto

**Apto con reservas.**

Lo que se hizo, se hizo bien y se puede auditar: las 18 filas de coste son
**exactas** contra `buildinginfo.cpp`, los recursos de salida son la fila NORMAL
entera, la única cifra sin fuente (`MINAS_POR_RECURSO = 2`) **se declara sin
fuente** y trae su medida, el reparto de minas es un espejo perfecto con test que
lo afirma, y —lo que se me pidió mirar con lupa— **`f270ea9` no relajó ningún
guardia**: solo toca comentarios, el umbral que se movió subió de 200 a 500 en el
commit anterior, se añadió una aserción de más, y sus tres cifras (día 6/134/15,
día 23/618/16/548, 310 ms) las he reproducido una a una. Los cuatro guardias
—`verify`, `banco`, `barrido`, `qa`— salen exactamente como se anunció.

La reserva es el criterio 10, que era el que decía si el ciclo consiguió lo que
prometía. En el mapa que la gente juega, **el dragón óseo sigue sin existir** y solo
2 de 7 criaturas caras pisan el tablero, en 5 de 200 partidas. Se desbloquea en
48×48 —7/7 y dragón óseo 12/20—, lo que demuestra que las dos mitades entraron y
que lo que falta son días; pero la premisa con la que se aprobó no tocar la duración
(«ocho días bastan, 194 de 200 llegan a la morada 6») venía de una contrafáctica de
material infinito y **lo entregado da 10 de 200**. Junto a eso, el nigromante se
queda en la morada 4 y el equilibrio de facciones se mueve 25 puntos (53,25 % →
78,5 % para el caballero, medido con control de esquina).

Nada de eso pide revertir: la divergencia estaba, se corrigió contra la referencia
que el repositorio se dio, y las consecuencias son de diseño y del usuario. Lo que
sí pide este informe, antes de cerrar el ciclo, es **anotar las tres cosas
prometidas al backlog** (hallazgo 4), **arreglar la frase que nombra al azufre
cuando el muro es el oro** (hallazgo 3) y **poner al día `CLAUDE.md`**, que hoy
describe un test que se borró (hallazgo 5).
