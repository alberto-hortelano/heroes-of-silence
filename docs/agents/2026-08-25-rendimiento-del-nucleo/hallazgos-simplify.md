# Hallazgos de `/simplify` — decididos

Dos revisores, cuatro ángulos, sobre `34d31fc..5bd17b9`. Los dos verificaron el
titular del ciclo por su cuenta y **coinciden**: **−53 % en 200 semillas con el
sha256 del volcado idéntico**. El titular es honesto.

El hallazgo más importante **no es una optimización: es que el invariante que
sostiene todo el ciclo está protegido solo por prosa**. Va primero.

---

## 1 · El desempate se puede romper en silencio — ENTRA, y es lo más importante

`frontera.ts:35` dice en negrita «**una instancia por búsqueda**, nunca a nivel de
módulo», y afirma que romperlo «exige editar este fichero, que es donde muerden
sus tests». **Lo segundo no se sostiene, y el revisor lo demostró rompiéndolo.**

La rotura natural en un ciclo de rendimiento —«no alojar un montículo por
búsqueda»— se hace añadiendo un `reiniciar()` e izando la instancia en `map.ts`.
Resultado medido: **247 de 247 tests en verde**, `pnpm verify` verde, y el
volcado pasa de 28 300 a **28 278 líneas con otro sha256**. Partidas cambiadas en
silencio.

Y no vale un test: el revisor probó tres —repetir una búsqueda, repetirla acotada
por `maxCost`, un golden precedido de una búsqueda ajena— y **ninguno muerde**,
porque `orden` no se reasigna nunca y la contaminación no aparece al repetir una
búsqueda sino en la **siguiente**.

**Decisión: un guardia fail-loud dentro de la clase.** En Dijkstra los costes
extraídos no bajan nunca, así que `push` puede rechazar un coste menor que el
último extraído:

```ts
if (cost < this.ultimoPop) throw new Error(
  `una frontera es de una sola búsqueda: ${key} entra por ${cost} y ya salió ${this.ultimoPop}`);
```

Verificado en los dos sentidos: con el código sano, 247/247 y sha256 idéntico,
con coste **no medible**; con la frontera compartida, revienta al instante con el
mensaje escrito para la persona. Es literalmente lo que pide `CLAUDE.md`, y de
propina caza a cualquiera que empuje una casilla ya asentada.

## 2 · El sha256 es el único guardia del ciclo, y no está escrito ni se ejecuta — ENTRA

`banco.ts:63` llama al sha256 «el criterio de aceptación de cualquier
refactorización del núcleo». **El valor esperado no está en ningún sitio**: `grep`
por el hash en todo el repositorio da cero. Y CI corre `verify`, `vite build` y
`qa` — **no corre `banco`**.

Encadenado con el hallazgo 1, esto es lo grave: el hash es **lo único** que caza
la frontera compartida, y ni está anotado ni se ejecuta solo. *«Un criterio de
aceptación que exige acordarse de correr la herramienta en el commit anterior no
es un criterio: es una costumbre.»*

**Decisión: se ancla el valor** de `banco 200 300` junto a la orden, y **se dice
en `CLAUDE.md` cuándo hay que correrlo**. Si el ingeniero ve barato convertirlo en
un test lento o meterlo en CI, mejor; si no, anclado y documentado es el suelo.

## 3 · `banco.ts` es un superconjunto de `barrido-semillas.ts` — ENTRA

Los dos revisores lo encontraron por separado. `banco.ts:79-93` es copia verbatim
de `barrido-semillas.ts:60-72` —misma `createRng(i * 7919)`, mismo emparejamiento
de facciones— y su primer bucle repite el del barrido hasta la misma línea de
salida `sin terminar: k/N`.

El docstring dice «el barrido mide la IA, el banco mide el código», pero lo
escrito no sostiene esa distinción: `banco 40` y `barrido 40` imprimen los dos
`sin terminar: 0/40`.

**Coste real, y no es el de las 25 líneas**: la fórmula `*7919` vive ahora en dos
ficheros. El día que una cambie, las dos herramientas miden batallas distintas
**sin decirlo** — y lo que se rompe es justo lo que el banco vende, que la cifra
es comparable entre pasadas.

**Decisión: las tripas salen a un módulo compartido**, como ya se hizo con
`tools/qa/politica.ts`, que existe exactamente por esto. Dos informes, un arnés.

## 4 · La IA relanza el BFS que `legalActions` le acaba de dar — ENTRA

`tactics.ts:213`. Los dos revisores lo encontraron y los dos lo verificaron:
`acciones.filter(a => a.type === 'move').map(a => a.to)` es idéntico en contenido
**y en orden** a `movableHexes(state, s)`.

Medido: **1461 de 7090** recorridos de tablero (**20,6 %**), y **−11 %** del banco
de batallas. El diff izó el BFS **dentro** de `legalActions` y dejó el gemelo un
piso más arriba: la ganancia de #48 se queda un 20 % corta en la ruta exacta que
mide el banco nuevo.

## 5 · Un 18 % de los Dijkstra del mapa se lanzan sabiendo que no sirven — ENTRA

`turn.ts:73`. De 1257 pasadas de mapa completo en 40 partidas, **417 (33 %)
acaban en `paso === null`**, y **231 —el 18,4 % del total— salen con
`hero.movePoints < ROAD_COST`**, o sea por debajo del paso más barato que existe.
Las 231 acabaron en `null`, sin una excepción.

Comprobado por el coordinador antes de aceptarlo: `ROAD_COST` es 75 y el terreno
más barato son 100, así que es cierto que ningún paso cabe; y el `continue`
temprano es **exactamente equivalente** al que ya hay cuando `paso === null`,
porque ninguno de los dos marca `seMovio` y el bucle exterior corta con
`if (!seMovio) break`.

Nota que vale la pena guardar: `heroHasWork`, la función que este ciclo borró por
muerta, empezaba con `if (hero.movePoints <= 0) return false;` — un guardia que
solo habría cazado **21** de las 417. O sea que borrarla no perdió nada, pero el
guardia barato nunca se puso donde sí vale.

## 6 · `maxCost` es un parámetro muerto — ENTRA

Los ocho llamantes de `reachableFrom` pasan `Infinity`, y así ha sido desde el
primer commit. El `if (nuevo > maxCost) continue;` es una rama que ninguna
partida ni ningún test toma jamás, **en el bucle más caliente de `core`**.

Y este ciclo era el momento: su propio docstring dice que el rename se eligió
para que «el typecheck señale a todos los llamantes» — se tocaron los ocho igual.

Quitarlo no puede cambiar una partida (con `Infinity` la rama no dispara nunca),
pero por la regla de la casa: **se verifica con el volcado**.

## 7 · Menores que entran

- **`frontera.ts`**: los dos llamantes hacen `frontera.pop() as NodoFrontera`
  tras `while (frontera.size > 0)`. Con
  `for (let n = f.pop(); n !== undefined; n = f.pop())` desaparecen **dos
  aserciones sin comprobar en `core`** y el `get size` deja de hacer falta.
- **`banco.ts`**: `fichero` es `string | null | undefined` y la ausencia se
  escribe de dos maneras, lo que obliga a repetir
  `!== null && !== undefined` dos veces.
- **`test/battle.test.ts:396`**: `enemigosDe()` reimplementa `enemiesOf()` del
  núcleo **y fija el bando a mano**; si algún día el defensor queda activo, el
  helper cuenta el bando equivocado y el `toBe(4)` deja de decir lo que dice sin
  ponerse rojo.
- **`test/game.test.ts:519`**: `reachableFrom` está dentro de un doble bucle
  donde nada de lo que lee cambia — 20 llamadas donde vale una. Es la ironía
  justo en el test que prueba la optimización.
- **`CLAUDE.md`**: dice 238 tests (son 247) y su tabla de calidad no lista
  `pnpm banco`. **Lo hace el coordinador**, no el ingeniero.

---

## Lo que NO entra, y va a issue con su medida

- **E1 · Reescribir el Dijkstra sobre índice plano: −46,4 % adicional.** Es el
  hallazgo más grande y **no entra en este ciclo**. Está verificado por
  prototipo —720 de 720 orígenes con el mismo orden de claves, mismos costes y
  mismo `prev`; 4239 → 2274 ms; 247/247 tests; sha256 idéntico— pero es una
  reescritura del corazón del pathfinding, y este ciclo ya entrega −53 % y ha
  cumplido su objetivo declarado: que las 200 semillas bajen de 11 s a algo que
  el ciclo siguiente pueda correr muchas veces. Se abre issue **con el prototipo
  y las cifras**, para que el que lo haga no empiece de cero.
- **E3 · El tablero comete el pecado que el mapa acaba de dejar.** `reachable`
  devuelve claves y `movableCosts`/`movableHexes` las parten para reconstruir el
  `Hex` que el BFS tenía en la mano — es `parsePointKey` con otro nombre, en la
  otra mitad del núcleo. `autoResolve` 151 → 91 ms (**−40 %**), sha256 idéntico.
  Va con E1 o detrás.
- **E2 · `moveHero` relanza `findPath`**: ya es el issue **#65**. Se le añade la
  medida nueva: **−6,6 % del banco entero, sha256 idéntico en 200 partidas** —
  que es una prueba más fuerte que los 20 pares del test. Y el mismo pecado en el
  cliente (`session.ts:119` y `:161`).
- **A5 · `findPath` y `reachableFrom` son el mismo Dijkstra con dos condiciones
  de parada.** Ahora se puede demostrar: reconstruir el camino con `prev` deja el
  sha256 de 200 partidas intacto. Lo único que justifica dos funciones es la
  salida temprana. Va a issue.
- **`revealAround` construye un `Set` de 49 cadenas por paso** para preguntar por
  32 objetos: **−0,7 %**. Entra en el issue de E1/E3, no aquí.

## Lo que NO se hace, con su número, para que nadie lo intente de propina

- **Izar `stackHexes` fuera del bucle enemigo × hex**: **0,15 %**, doce líneas de
  bucles anidados. Es de la familia del 0,25 % que se descartó por romper las
  partidas y del 0,04 % que se descartó por irrelevante.
- **Un *decrease-key* de verdad en `Frontera`**: el borrado perezoso deja un
  **8,0 % de extracciones rancias** (947 575 `push`, 917 301 `pop`, 73 179
  rancios) con un montículo que **nunca pasa de 107 nodos**. Arreglarlo vale
  **0,34 %** y mete índices por clave justo en la clase donde el estado es el
  peligro — ver hallazgo 1.
- **Devolver `prev` solo a quien lo pida**: cuesta **5,5 %** de la llamada, y hoy
  `reachableFrom` tiene **un solo llamante de producción**, que usa las dos
  mitades. Los cuatro que solo leen `.costs` son tests.
- **Unificar `findPath` y `reachableFrom` ahora**: ver A5, va a issue. Hacerlo a
  medias pide tres callbacks y probablemente añade más código del que quita.
