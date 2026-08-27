# QA — que se vea jugar al agente (#63 + #30, cierra #97)

Validado contra `requisitos.md` (los veinte criterios, que mandan), no contra
`plan.md` ni `implementacion.md`. Diff: `f340191..HEAD`, cinco commits.

**Veredicto: NO APTO.** La puerta de escapar (#63) está bien y se ha visto
aguantar con texto hostil de verdad por el cable. La página (#30) **se cuelga
para siempre, en silencio, en la primera batalla contra un monstruo neutral**, y
eso es la mitad de lo que el ciclo existe para enseñar. Un hallazgo bloqueante,
tres importantes y siete menores.

---

## Lo ejecutado, de un vistazo

| Orden | Salida real |
|---|---|
| `pnpm verify` | `Test Files 17 passed (17)` · `Tests 379 passed (379)` · **8,62 s** |
| `pnpm banco` | `sha256: 297dbef912ab23c88507558ded39c1dc8d8726fb39fad17ee47fa965c23e1767` · `líneas: 32177` · `sin terminar: 0/200` · `ancla: igual` · 2,00 s |
| `pnpm qa` | rc=0 · 5,44 s |
| `pnpm build` | `dist/index.html` 954 B · `dist/espectador/index.html` 901 B · los 3 assets referenciados existen |
| `npx tsx tools/qa/ancla-paneles.ts` | `398 líneas, 34105 bytes` · `cmp` contra el fichero del repo: **idénticos byte a byte** · sha `8fc8bdb59273f1294edf1dc091e1fd2b74c17d9b5061d9a0c3ec568fa68cfd34` |
| Navegador | Chrome contra `pnpm dev` + `pnpm partida` + un agente hostil por el cable |
| Cable | tres arneses propios: agente rápido, agente lento y seis semillas |
| fal.ai | **0 €** — `git diff --stat f340191..HEAD -- tools/gen assets` sale vacío |

---

## Criterio a criterio

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Ningún texto ajeno llega sin escapar al DOM | ✅ | Con la partida y un agente hostil delante: el pueblo se llamó `<img src=x onerror=window.__EJ=0>`, `hireHero` derivó `Capitán de <img src=x onerror=window.__EJ=0>` y el espectador lo pintó **como texto literal**. DOM: `nodosNoTextoDentroDeEseNombre: 0`, `imgsEnTodoElDocumento: 0`, `atributosOnEnElPanel: 0`, `window.__EJ` y `window.__EJECUTADO` sin definir |
| 2 | Una sola puerta, y olvidarse no compila / no pasa el guardia | ⚠️ **con reserva** | Las tres salidas (`main.ts`, `panels.ts`, `espectador/main.ts`) importan de `html.ts`; el guardia catorce se ha visto morder con un `innerHTML` plantado (`× el marcado sale por una sola puerta … expected [ Array(1) ] to deeply equal []`). **Pero** la familia `setAttribute` / asignación de propiedad pasa entera: 15 sumideros verdes, y **hay una llamada viva de esa familia en el repo** → hallazgo I-3 |
| 3 | Texto y atributo son dos operaciones distintas | ✅ | `<b class='${"x' onclick='alert(1)"}'>` → `<b class='x&#39; onclick=&#39;alert(1)'>`; en hueco de texto la comilla NO se escapa. Dos funciones de verdad (`escaparTexto` / `escaparAtributo`, `html.ts:83` y `:95`) |
| 4 | El guardia se ve rojo antes de darlo por bueno | ✅ | Visto rojo por mí con `el.innerHTML = x` plantado en `src/client/`, con su fichero y su línea, y retirado. Nueve sondas más del ingeniero, replicadas en espíritu con mi batería adversarial |
| 5 | El mismo píxel: el ancla no se mueve | ✅ | Verificado **desde el historial**, no desde el informe: el ancla nace en `1316f89` con `panels.ts` **sin tocar** (`git diff f340191 1316f89 -- src/client/views/panels.ts` vacío), no cambia en `f397335` —el commit que reescribe `panels.ts` con 196+/139-—, y hoy se regenera **byte a byte idéntica**. El único cambio del andamio en el commit 2 es leer con `marcadoDe`: mismas cuatro salidas, mismo orden |
| 6 | Una orden documentada que abre la partida, **vista arrancar** | ✅ | `pnpm mirar` → `heroes-of-silence@0.1.0 mirar` + `VITE v6.4.3 ready`; el 3100 lo tiene el pid 261550 con `readlink /proc/…/cwd = /home/al/code/heroes`; `curl -sf http://localhost:3100/espectador/` rc=0 y devuelve el `<title>Heroes of Silence — espectador</title>`. `mirar` **no** es subcomando de pnpm (llega al script, al revés que `server`). README actualizado con la tercera terminal |
| 7 | El espectador no juega | ✅ | `grep` sobre `src/client/espectador/*.ts`: cero `.send(`, cero `session`, cero `applyAdventureAction/applyAction/playAiTurn/newGame/resolvePendingBattle`. De `core` solo importa `creature` (una consulta al catálogo) y tipos |
| 8 | Se ve lo que hace falta para entender la partida | ✅ | Captura del día 7: mapa con terreno, castillos, minas, recursos, héroes y monstruos; JUGADORES con bandera de color, facción, oro, casillas exploradas y héroes por su nombre; «Día 7 · Semana 1» y «Gana el jugador 0» en la barra |
| 9 | Se ve terminar la partida y quién ganó | ⚠️ | Visto en pantalla: **«Fin de la partida · Gana el jugador 0»** y el jugador 1 marcado `derrotado`. Por el cable, tres espectadores distintos reciben `finished:{"winner":0}`. **Pero** una partida que se agota sin ganador no dice nada → hallazgo M-3 |
| 10 | Sin servidor lo dice; si se cae en marcha, también | ⚠️ | Sin servidor: *«No hay nadie en ws://localhost:9880. Arranca la partida con `pnpm partida` en otra terminal y recarga esta página.»* Caído en marcha: *«Se ha cortado la conexión con ws://localhost:9880: lo que se ve es el último fotograma que llegó…»*. **Pero** con el servidor arrancado y todavía sin partida la barra dice «Mirando la partida» ante una pantalla en blanco → hallazgo M-2 |
| 11 | El juego local no cambia ni un byte | ✅ (el criterio) | `http://localhost:3100/?seed=777` abre igual: «semilla 777» en la barra, Día 1 · Semana 1, «Tu turno», recursos con sus PNG, panel del héroe, HECHIZOS, EJÉRCITO (29), CASTILLOS «Valdeluz +500», CRÓNICA y los dos botones. Cero errores de consola. **La afirmación de apoyo del informe es falsa** → hallazgo M-6 |
| 12a | Test de máquina: `&lt;img` y no `<img` | ✅ | `test/paneles.test.ts` + `test/html.test.ts` dentro de los 379 |
| 12b | De persona, en el navegador | ✅ | Reproducido de cero: `pnpm dev` + `pnpm partida` + agente hostil por el cable que bautiza los pueblos y manda `reasoning` con `<img src=x onerror=…>`, `</div><script>`, `-->`, `--!>`, comillas y `<a href="javascript:…">`. Resultado en el DOM: `imgs:0 scripts:0 negritas:0 enlaces:0 atributosOn:0`, `nodosNoTextoEnLinea1:0`, `entidadesEscapadasEnLinea1:22`, `window.__EJECUTADO` sin definir |
| 13 | `pnpm verify` y `pnpm qa` verdes | ✅ | 379/379 en 8,62 s · `pnpm qa` rc=0 en 5,44 s |
| 14 | `pnpm banco` en su ancla | ✅ | `297dbef9…`, 32 177 líneas, 0/200, `ancla: igual` |
| 15 | 0 € de fal.ai | ✅ | `tools/gen` y `assets` sin tocar en los cinco commits |
| 16 | El espectador enseña las batallas | ❌ | Los fotogramas llegan y llevan la batalla (43 de 61 en una partida de 4 días, medido por el cable) y la rejilla se pinta. **Pero la página se cuelga en la primera batalla contra un neutral** (B-1) y **no pinta el «qué acaba de pasar»** (M-4) |
| 17 | La frecuencia justifica lo que enseña | ✅ (con nota) | Medido por el cable, no leído: **61 fotogramas · 43 con batalla · 1 186 359 B (19,4 KB de media)** en una partida de 4 días con 7 turnos de servidor. Antes: 7 fotogramas, **ninguno** con batalla. La justificación del plan se sostiene. Nota de honestidad: el intervalo entre fotogramas tiene **mediana 0 ms y máximo 2 ms** → hallazgo M-5 |
| 18 | No se cuelga si no hay batalla, y cambia de escena | ⚠️ | El cambio de escena funciona (16 fotogramas sin batalla y 20 con, alternando, en la misma sesión). Pero «no se cuelga» **no se cumple**: se cuelga con batalla neutral (B-1) |
| 19 | La página entra en `vite build` y está en `dist/` | ✅ | `dist/espectador/index.html` 901 B, no vacía, con su `<script src="/assets/espectador-Cu0xqxLJ.js">` (5 301 B) y su CSS, los tres presentes. El `define` se sustituye de verdad en el bundle: `PUERTO_ESPECTADORES` aparece 0 veces y `9880` 1 vez |
| 20 | El puerto no va escrito a mano; con `0` se dice | ✅ | `?puerto=abc` → *«"?puerto=abc" no es un puerto: pon un entero entre 1 y 65535, o quita el parámetro»*. Con `HEROES_SPECTATOR_PORT=0` en vite: *«el servidor arrancó con HEROES_SPECTATOR_PORT=0 … Míralo en la línea "canal de espectadores en ws://localhost:NNNN" … y abre /espectador/?puerto=NNNN»*. No adivina 9880 |

Las tres preguntas del coordinador sobre el cable, contestadas con un agente
**lento** (900 ms por acción de batalla) para que la batalla se quede abierta:

```
[qa] DOS espectadores conectados desde el principio (A y B)
[qa] ► C entra EN MITAD de batalla (ronda 1, día 4)
[qa] ► A se CAE en mitad de batalla
[qa] ► A vuelve como D

A (desde el principio, se cae):   28 fotogramas · 12 con batalla · 487 718 B
B (desde el principio, no se cae):61 fotogramas · 43 con batalla · 1 186 359 B
   último : día=4 batalla=false fin={"winner":0}
C (entra EN MITAD de batalla):    39 fotogramas · 37 con batalla · 817 417 B
   primero: día=4 batalla=true ronda=1        ← lo recibe al conectar, sin esperar
D (A que reconecta):              33 fotogramas · 31 con batalla · 698 641 B
   primero: día=4 batalla=true ronda=2        ← también inmediato

¿A y B recibieron los MISMOS 28 primeros fotogramas? SÍ
¿B siguió recibiendo tras caerse A? SÍ (33 más)
```

- **En mitad de una batalla**: funciona. `spectatorServer.on('connection')` llama
  a `broadcast()` en el acto (`ws-server.ts:217`), así que el primero que recibe
  ya lleva `battle` puesto y su ronda.
- **Dos espectadores**: funciona, y se comprobó que ven **lo mismo** byte a byte
  y que la caída de uno no toca al otro.
- **Se cae y vuelve**: el servidor lo trata bien; la **página** no reconecta sola
  —es deliberado y está documentado—, hay que recargar, y la barra lo dice.

---

## Hallazgos

### 🔴 BLOQUEANTE

#### B-1 · El espectador se congela para siempre —y en silencio— en la primera batalla contra un monstruo

`espectador/main.ts:251` pinta la bandera de cada stack con

```ts
<span>${bandera(dueños[s.side] ?? -1)} ${creature(s.creature).name}</span>
```

En una batalla contra un neutral, `battleOwners` devuelve `defender: null`
(`game.ts:1052-1058`), así que el `?? -1` mete un **−1**. Y `playerColor(-1)`
(`palette.ts:40-43`) hace `PLAYER_COLORS[-1 % 4]` = `PLAYER_COLORS[-1]` =
**`undefined`**, tapado por el `as string` de esa misma línea. Ese `undefined`
llega a `fondoDeColor`, que hace `color.trim()` y lanza un `TypeError`.

Doce líneas más arriba, `deQuien()` **sí** trata el `null` (`html\`neutral\``).
La guarda existe en un sitio y falta en el otro.

Y no lo recoge nadie: `dibujar()` re-arma el bucle con
`requestAnimationFrame(dibujar)` **en su última línea** (`main.ts:160`), así que
una excepción en `pintarPaneles()` **mata el bucle de dibujo entero**. La página
se queda con el último lienzo pintado, el panel lateral vacío y la barra de
estado diciendo *«Mirando la partida en ws://localhost:9880.»* — es decir, dice
que todo va bien.

**Visto en el navegador, en el flujo real.** Consola:

```
[EXCEPTION] TypeError: Cannot read properties of undefined (reading 'trim')
    at fondoDeColor      (html.ts:214)
    at fondoDelJugador   (espectador/main.ts:135)
    at bandera           (espectador/main.ts:132)
    at                   (espectador/main.ts:150)   ← el .map de los stacks
    at batalla           (espectador/main.ts:148)
    at panelLateral      (espectador/main.ts:101)
    at pintarPaneles     (espectador/main.ts:98)
    at dibujar           (espectador/main.ts:90)
```

Dos capturas separadas por 25 segundos son **idénticas píxel a píxel** —«Día 1 ·
Semana 1», el mismo tablero, el panel vacío— mientras el servidor jugaba
`24 turnos` hasta el final de la partida. Quien mira no vio ni un día más.

**Reproducción determinista sin navegador**, con `construirVista` de verdad y una
copia literal de `batalla()`:

```
semilla 1: batalla contra monster, dueños = {"attacker":0,"defender":null}
  panel batalla() ✗ TypeError: Cannot read properties of undefined (reading 'trim')
semilla 2: batalla contra monster, dueños = {"attacker":0,"defender":null}
  panel batalla() ✗ TypeError: Cannot read properties of undefined (reading 'trim')
```

**Pasos desde el arranque**: `pnpm dev` · `pnpm partida` · conectar un agente que
mande un `move_hero` a la casilla de un monstruo (que es juego **normal**: es de
donde sale la experiencia, #87) · abrir `http://localhost:3100/espectador/`. En
el primer fotograma de esa batalla la página muere.

**Qué esperaba quien juega**: ver la batalla, con el bando neutral pintado como
tal —que es lo que `deQuien()` ya sabe hacer—. Y si algo revienta, enterarse.

**Dos cosas que arreglar, no una.** La segunda es la que importa: este ciclo ha
metido **tres llamadas que pueden lanzar** (`pintar`, `srcDeImagen`,
`fondoDeColor`) dentro de dos bucles de `requestAnimationFrame` que antes solo
hacían asignaciones a `innerHTML`, que no pueden lanzar. El mismo patrón está en
`src/client/main.ts:198-212`. El riesgo 2 del plan preveía «la rama que falte se
ve en blanco entera»; lo que pasa de verdad es peor: **se para la página**, y la
barra de estado sigue mintiendo.

---

### 🟠 IMPORTANTES

#### I-1 · Ningún test guarda el fotograma por acción **de batalla** — que es el criterio 16 entero

`test/espectador.test.ts:145` comprueba «un turno de N acciones da N fotogramas»
sobre acciones de **aventura**. Los tres `this.frame()` del bucle de batalla
(`director.ts:266, 289, 302`) no los mira nadie.

Sonda: los quité los tres y corrí la suite completa.

```
applyAction encontrados: 3; frame() quitados: 3
 Test Files  17 passed (17)
      Tests  379 passed (379)
```

**379 de 379 verdes** con el espectador devuelto a cero fotogramas de batalla —
que es exactamente el estado que este ciclo existe para dejar atrás. La misma
familia que el test que el ingeniero encontró pasando por el motivo equivocado:
no hay guardia donde se cree que lo hay. (Restaurado; `git diff` vacío.)

#### I-2 · La puerta clasifica mal todo lo que sigue a un comentario cerrado con `--!>` o `<!-->`

El commit `d71a32e` añadió el estado de comentario diciendo, con razón, que **no
es por el hueco: es por lo que viene DESPUÉS**. Pero `analizar()` solo reconoce
`-->` como terminador (`html.ts:208`). El HTML cierra un comentario de tres
formas, y las otras dos dejan al autómata creyéndose dentro del comentario: el
hueco siguiente se clasifica como `comentario` y se escapa **como texto**, sin
las comillas — justo dentro de un atributo.

```
tras --!>  : <!-- n --!><div class="x" onmouseover="alert(1)">hola</div>
tras <!--> : <!--><div class="x" onmouseover="alert(1)">hola</div>
tras -->   : <!-- n --><div class="x&quot; onmouseover=&quot;alert(1)">hola</div>   ← el correcto
```

Es decir: **la puerta emite un manejador `onmouseover` vivo**, que es
exactamente lo que existe para impedir. Hoy es latente —no hay ni un comentario
HTML en ninguna plantilla del repo—, pero el arreglo es una línea y el docstring
promete hoy algo que el código no cumple.

#### I-3 · El guardia catorce no ve la familia «meter un atributo sin parsear marcado», y hay una llamada VIVA de esa familia

El docstring lo dice de `setAttribute` («hoy el cliente no llama a `setAttribute`
ni una vez»), y es cierto. Pero la especie es más ancha, y **la asignación de
propiedad equivalente sí existe en el repo**:

`src/client/render/assets.ts:34` → `img.src = url;`

`src` es uno de los `ATRIBUTOS_INTERPRETADOS` que `html.ts` **rechaza de plano**
en una plantilla, obligando a pasar por `srcDeImagen`. Por la puerta del DOM no
lo mira nadie. Hoy no hay fuga —`url` sale del `manifest.json` local— pero la
asimetría es la que abre el agujero mañana.

Sondas: puse un fichero en `src/client/` con **quince** sumideros de la especie y
corrí los catorce invariantes. **Los catorce verdes.**

```ts
el.setAttribute('onclick', x);          el.setAttribute('href', x);
el.setAttribute('srcdoc', x);           el.setAttributeNS(null, 'href', x);
img.src = x;                            a.href = x;
el.style.cssText = x;                   iframe.srcdoc = x;      // ← parsea HTML entero
el.onclick = new Function(x);           eval(x);
location.href = x;                      window.open(x);
script.textContent = x; document.body.append(script);
Object.assign(el, { srcdoc: x });
```

`iframe.srcdoc` merece nota aparte: **es un parseador de HTML sin la palabra
`HTML` en el nombre**, o sea que se le escapa a las dos mitades del guardia — la
blanca porque no lleva el token, la negra porque no está en la lista.

**Mi lectura, con el argumento delante**: la mitad blanca no puede crecer para
cubrir esto (los nombres no son enumerables) y una lista negra de sumideros de
atributo tampoco cierra nada. Lo que **sí** es enumerable y sí cierra es al
revés: prohibir `setAttribute`/`setAttributeNS` y la asignación a
`.src|.href|.srcdoc|.style.cssText|.on*` **fuera de `html.ts` y de
`render/assets.ts`**, con esos dos como la lista blanca de sitios. Son dos
líneas de expresión regular y hoy nacería verde salvo por la línea de
`assets.ts`, que es precisamente la que conviene tener a la vista. Si se decide
que no entra ahora, entonces **el docstring tiene que dejar de decir solo
`setAttribute`** y nombrar la especie entera, y esto es un issue — pero no puede
quedarse como está, porque la frase actual hace creer que el agujero es una
llamada que nadie hace, cuando hay una que sí se hace.

---

### 🟡 MENORES

#### M-1 · `srcDeImagen` falla ABIERTO con un tabulador o un salto de línea dentro de la URL

```
"java\tscript:alert(1)"     →  src="java\tscript:alert(1)"      ← ACEPTADA
"java\nscript:alert(1)"     →  src="java\nscript:alert(1)"      ← ACEPTADA
" javascript:alert(1)" →  src=" javascript:alert(1)"  ← ACEPTADA
"javascript:alert(1)"       ✗ LANZA                              ← la que sí ve
```

El navegador **quita** TAB/LF/CR/NUL al leer una URL, así que las tres primeras
son `javascript:` para él. La expresión de `html.ts:417` no llega ni a encontrar
esquema y entonces el valor cae en la rama «sin esquema es una ruta relativa».
Hoy solo se usa para `<img src>` —donde `javascript:` no ejecuta— y la URL sale
del manifiesto local, así que es defensa en profundidad; pero es una función
cuyo trabajo entero es validar. También acepta `data:image/svg+xml,<svg
onload=…>`, inocuo en `<img>` y no en otros sitios.

#### M-2 · Espectador conectado antes de que empiece la partida: pantalla en blanco y la barra diciendo que todo va bien

`broadcast()` sale antes si `director === null` (`ws-server.ts:90`), y el
director no existe hasta que pasan la espera del agente (**120 s por defecto**) y
la del plan de mapa (hasta 300 s). En ese hueco la página dice
*«Mirando la partida en ws://localhost:9880.»* sobre una pantalla enteramente
negra, con el día en `—`. Es lo primero que ve quien sigue el README y abre
`pnpm mirar`. Captura tomada.

Y hay un segundo filo: si el servidor se cae **en ese hueco**, el `close` no dice
nada, porque el mensaje está guardado tras `if (vista !== null)`
(`espectador/main.ts:348`). El `error` tampoco, porque la conexión sí llegó a
abrirse. Queda «Mirando la partida» ante un servidor muerto.

#### M-3 · Una partida que se agota sin ganador no se le cuenta a quien mira

Con `HEROES_MAX_DAYS` agotado, el servidor escribe *«La partida se ha quedado sin
resolver tras 13 días: no gana nadie»* y se lo manda al agente por `game_over`
con `winner: null`. `state.finished` sigue siendo `null`, así que `fin()`
(`espectador/main.ts:186`) devuelve `NADA` y el espectador se queda en el último
día, sin una línea. El criterio 9 se apoya en «igual que `game_over` se lo dice
al agente en vez de dejarlo colgado», y aquí el espectador sí se queda colgado.

#### M-4 · El criterio 16 pide «y qué acaba de pasar», y eso no se pinta

`batalla()` enseña ronda, atacante, defensor y stacks. El **parte de guerra** no:
`renderBattleLog` no está exportado de `panels.ts:426` y el espectador no lo
llama (`grep` = 0). El dato viaja —`battle.log` va dentro de `estado`—, solo que
no se pinta. Con los fotogramas llegando a 0 ms (M-5), el tablero cambiando es
todo lo que hay, y no alcanza.

#### M-5 · Los fotogramas llegan a ráfagas de 0 ms y `requestAnimationFrame` los funde

Medido con un agente que contesta al instante:

```
intervalo entre fotogramas: min 0 ms · mediana 0 ms · max 2 ms
```

36 fotogramas de 18,4 KB en unas décimas de segundo. La página solo pinta el
**último** `vista` en cada rAF (~16 ms), así que las acciones de batalla que
resuelve la heurística —las de los stacks que el agente no lleva— pasan sin que
nadie las vea. Es el riesgo 5 del plan, que se aceptó; lo cuantifico porque la
frase «acción a acción» del README solo es cierta mientras el agente sea lento, y
solo para **sus** acciones.

#### M-6 · El informe del ingeniero dice que `main.ts` no cambia, y sí cambia

`implementacion.md`, premisa 7: *«Cierta, y comprobada las dos veces: el diff de
`main.ts` está vacío»* y *«(`main.ts` no aparece en el diff)»*.

```
$ git diff --stat f340191..HEAD -- src/client/main.ts
 src/client/main.ts | 10 +++++++---
 1 file changed, 7 insertions(+), 3 deletions(-)
```

Cierto solo para el **commit 4**. En el commit 2 se le cambiaron los tres
`innerHTML` por `pintar`. El **criterio 11** se cumple igual —lo he comprobado en
el navegador con `?seed=777`— porque el criterio habla del comportamiento; lo que
no es cierto es la frase de apoyo, y es la clase de cita que este repositorio ya
ha pagado cara.

#### M-7 · Un hueco del ancla: `ETIQUETA_EFECTO['luck']`

El ancla pinta las catorce escenas y **los quince tipos** de hecho del parte de
guerra (verificado contra los `kind` de `src/core/battle/`), y pasa por las
quince salidas de `panels.ts` salvo las cuatro ramas que el ingeniero ya declara.
La quinta que no declara: la etiqueta `suerte` no aparece ni una vez en
`test/fixtures/paneles.txt` (`velocidad` sí, `ataque` sí). Un `EffectKind` de tres
con dos cubiertos.

---

## Sobre el ancla (criterio 5), que el coordinador pidió apretar

No está desafilada, y la procedencia es honesta —comprobado desde el historial y
no desde el informe—:

- Nace en `1316f89` con `panels.ts` **sin tocar**: `git diff f340191 1316f89 --
  src/client/views/panels.ts` sale vacío.
- **No se mueve** en `f397335`, el commit que reescribe `panels.ts` (196+/139−).
- El único cambio del andamio en ese commit es leer con `marcadoDe`: mismas
  cuatro salidas, mismo orden, mismo separador.
- Hoy se regenera **byte a byte idéntica**, sha `8fc8bdb5…`.

Cubre las **cuatro escenas** que pide el plan y diez más; pinta nombres ajenos de
verdad en los tres sitios donde caen (`<h2>Valdeluz</h2>`, `<h2>Capitán de
Valdeluz</h2>`, `<h3>Ejército de Aldo de Valdeluz</h3>`); y pasa por todas las
salidas de `panels.ts` menos las declaradas y M-7. Un detalle que conviene saber:
el volcado no contiene **ni una** entidad escapada, porque ningún nombre de una
partida normal lleva `<`, `&` ni comillas. Es lo correcto para un ancla de «el
mismo píxel» —lo que ancla es que la reescritura no movió nada—, pero significa
que el ancla **no prueba que se escape**: eso lo prueban el 12a y el 12b, y los
dos están.

---

## Lo que el ingeniero avisó, comprobado

Su aviso —*«si hay otro [test que pasa por el motivo equivocado], está donde una
función tenga un `catch` por encima»*— es bueno y valía más que el bug. Lo he
seguido:

- **Su arreglo muerde de verdad.** Desactivé el `try` de `frame()` y salió
  `AssertionError: expected 'heuristic' to be 'agent'`, con su fichero y su
  línea. Restaurado.
- **La familia sigue abierta, pero por el otro lado.** El patrón no es solo «un
  `catch` por encima que se lo traga»: es «un `catch` que no es el que crees». En
  los dos bucles de dibujo **no hay ningún `catch`**, y este ciclo les ha metido
  tres llamadas que lanzan. Eso es B-1.
- **Y hay un guardia que directamente no existe**: I-1, el fotograma de batalla.

Los cinco `try` de `session.ts` y el de `client/main.ts` convierten excepciones
del núcleo en la barra de estado y no están anidados bajo otro `catch`: ahí no vi
nada.

---

## Workarounds usados

| Workaround | Por qué no afecta a quien juega |
|---|---|
| Agente propio por el WebSocket en vez de Claude Code por MCP | El contrato del cable es el mismo (`protocol.ts`); es lo que hace `pnpm qa`. Me deja mandar `reasoning` hostil, que un agente de verdad también puede mandar |
| Agente **lento** (900–2500 ms por acción) | Solo cambia el ritmo, no el contenido de los fotogramas. Sirve para poder entrar en mitad de una batalla; con el agente rápido la batalla se acababa dentro del handshake |
| Copia literal de `batalla()` en un script de node para B-1 | Reproduce el fallo **sin** navegador; el fallo se vio además en el navegador de verdad, dos veces. La copia es lectura, no escenario preparado |
| Nombres de pueblo de ≤40 caracteres | **No es un workaround mío: es el juego.** `mapPlanSchema` rechaza el plan entero si un nombre pasa de 40 (`plan.towns.0.name: String must contain at most 40 character(s)`). Con 33 caracteres el `<img src=x onerror=…>` entra tal cual y llega al héroe contratado |
| Sondas en `src/client/` y en `src/server/director.ts` | Puestas, vistas, y **retiradas**: `git diff` vacío, `git status` solo con la carpeta del ciclo |

---

## No probado

- **`?puerto=NNNN` apuntando a un servidor en puerto efímero de verdad.** Probé
  la rama del mensaje (`HEROES_SPECTATOR_PORT=0`) y la del parámetro inválido,
  pero no el camino feliz completo con un `pnpm partida` en puerto efímero.
- **Los seis fotogramas por acción con Claude Code de verdad al otro lado del
  MCP.** Todo lo del cable va con mi agente; el puente MCP lo cubre `pnpm qa`,
  que sale 0, pero `pnpm qa` **no conecta ningún espectador**, así que el camino
  MCP + espectador a la vez no está ejercitado por nadie.
- **La frecuencia con la que un agente real ataca neutrales.** Con la política de
  `tools/qa/politica.ts` sobre seis semillas salen **0 de 6** partidas con
  defensor neutral, que es exactamente por lo que `pnpm qa` no cazó B-1. Con un
  agente que va a por monstruos —juego normal— salta a la primera. No he puesto
  un número a «cada cuánto»; he puesto dos reproducciones deterministas y dos en
  el navegador.
- **`dist/` servido de verdad.** Comprobé que las dos páginas existen, no están
  vacías y sus assets están; no las abrí desde un servidor estático.

---

## `CLAUDE.md`: lo que este ciclo deja desfasado

No lo he tocado. **Son diez, no ocho** — y ojo, que el documento se actualizó en
`f340191`, justo antes del ciclo, así que la referencia buena es **333 tests /
8,4 s** y no la que cita el informe.

**Cuatro afirmaciones falsas:**

1. **L14** — `pnpm verify … 333 tests, 8,4 s`. Hoy son **379**. (El tiempo, 8,62 s
   medido, sigue valiendo.)
2. **L15** — `pnpm test # 333 tests`. Hoy **379**.
3. **L838**, tabla de control de calidad — `test/invariantes.test.ts | 40 ms`. Hoy
   **456 ms** medidos (`nadie escribe en la crónica` 213 ms + `la crónica
   sobrevive a un JSON` 179 ms se lo comen; el guardia nuevo pone 20 ms). Ya
   estaba desfasada antes del ciclo, pero es falsa hoy.
4. **L118-119**, Contratos — *«llama a `session.ts`, que es la única puerta al
   núcleo. **Cuando el cliente pase a hablar por WebSocket, cambia esa capa y
   nada más.**»* La segunda mitad la desmiente este ciclo: ya hay una página del
   cliente que habla por WebSocket y **no pasa por esa capa** — tiene la suya,
   `espectador/adaptar.ts`.

**Seis ausencias que ya cuestan:**

5. **El bloque «Arrancar»** no lista `pnpm mirar`. Es donde viven las órdenes, y
   el README sí la lista.
6. **«Para que juegue un agente hacen falta dos terminales»** (L48): ahora son
   tres, y la tercera es la razón de ser de #30. La frase de la primera línea del
   documento —el banco de pruebas cuya demo no se podía enseñar— ya no es cierta.
7. **El árbol del repositorio** (`src/client/`) lista `render/` y `views/`; faltan
   `espectador/` —una página entera— y `html.ts`, que es la puerta.
8. **«Contratos que no se rompen»** no tiene el contrato de #63, que es el
   criterio 2 entero: *todo el marcado del cliente sale por `html.ts`, y `pintar`
   es el único `innerHTML` del repositorio*. Es el contrato más nuevo y el que
   más fácil se rompe por descuido.
9. **La lista de invariantes** (L866-877) enumera trece y no menciona el
   catorceavo, el de la puerta del marcado.
10. **La tabla de control de calidad** no tiene fila para la comprobación de
    persona que estrena el ciclo (el 12b del espectador en el navegador).

---

## Veredicto

**NO APTO**, por B-1: la página que este ciclo existe para dar se para en seco,
sin decir nada, en la primera batalla contra un neutral —y la barra de estado
sigue afirmando que se está mirando la partida—. Es un `?? -1` y un bucle de
`requestAnimationFrame` sin red; el arreglo es pequeño, pero hasta que esté, el
criterio 16 y el 18 no se cumplen.

Con eso corregido —y con I-1, que es el guardia que habría cazado esto si
hubiera existido— el resto está en buen estado: **#63 se ha visto aguantar con
prosa hostil de un agente por el cable y cero nodos inyectados**, el ancla es
honesta y se reproduce byte a byte, el fotograma por acción es real y está
medido, y los tres casos raros del canal —entrar en mitad, dos a la vez, caerse y
volver— funcionan.
