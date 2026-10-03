# QA — mapas densos

QA, 03-10-2026, sobre el árbol de trabajo sin commitear (tras la «Vuelta de simplify»).
No se ha tocado nada del código. Las sondas propias están en
`/tmp/claude-1000/-home-al-code-heroes/3fde2e67-6d95-4c33-b554-bc6eb38aae58/scratchpad/qa-mapas/`.
`auditoria.ts` es una auditoría **independiente**: no usa `test/helpers.ts` y recorre
`newGame`, o sea, lo que ve quien juega. `audit2.ts` pasa el `auditarMapaDenso` del
ingeniero por más semillas de las que cubre su test.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Fronteras de ≥ 2 casillas salvo en los corredores, con grosor variable | ⚠️ cumple en 999 de 1 000 | Auditoría independiente, semillas 1-1 000 en 34×34: **1 pareja fina lejos de un nodo**, la **semilla 987**: entre (16,30) de la región 3 y (16,32) de la región 8 solo hay una casilla de `cliff` en (16,31), a 4 casillas del nodo (20,30) y de la ciudad (12,32). El `auditarMapaDenso` del ingeniero también la caza: «frontera de menos de 2 casillas en 2 parejas, la primera (16,30) y (16,32)». El test solo mira las semillas 1-200. En 48×48 (100 semillas), 28 y 40 (200 cada uno): 0. |
| 2 | ≥ 4 tipos de barrera **por mapa**, según el suelo (tabla en `data/`), y los cinco en 200 semillas | ❌ en 2 de 1 000 | Los cinco aparecen (frontera: mountain 78 890, cliff 89 737, water 73 942, forest 71 757, wall 52 195 casillas en 1 000 mapas). Pero las **semillas 864 y 986** solo llevan **3 tipos** de frontera. El `auditarMapaDenso` del ingeniero da lo mismo: `frontera water,forest,cliff` / `forest,water,wall`. Causa, medida con `diag.ts`: la cuarta barrera «construida» (`repartirDistintas`) cae en una pareja cuyas únicas casillas de muro fino son **casillas de nodo**. En la 864, las dos `mountain` del plan están en (24,14) y (9,19), las dos son nodos, y `buildMap` las abre. Además, en el 9,2 % de los mapas una de las cuatro solo tiene menos de 15 casillas de frontera: hay variedad, pero es simbólica (`variedad.ts`: 3 mapas con 2 tipos ≥ 15 casillas y 89 con 3). |
| 3 | Solo se pasa de una región a otra por un nodo | ✅ | Independiente, semillas 1-1 000 en 34×34 y 1-100 en 48×48: las componentes 8-conexas de lo pisable sin nodos llevan **exactamente una semilla de región** (fuga 0, zona sin región 0, objetos sobre barrera 0, caminos sobre barrera 0). La 8-conexidad es lo más permisivo que puede andar un héroe, así que no hay paso. |
| 4 | Suelo entero por región; obstáculos que bloquean, con la densidad en el rango de datos; ninguno parte la región ni aísla un objeto | ✅ | Semillas 1-1 000: región con dos suelos 0. Densidad de obstáculo (componente de barrera que solo toca una región y no se pega a un nodo) entre **10,0 y 18,0 %**, mediana 14,3, con 0 regiones fuera de 10-18. Inalcanzables desde el héroe 0: 0 (minas, pueblos, cofres, recursos, monstruos, inicios y asaltantes). Alcanzables sin cruzar un monstruo, desde los nodos: 0 fallos. |
| 5 | `roads` une los nodos de cada región entre sí y con sus minas y pueblos | ✅ (ver H3) | Semillas 1-1 000: 0 nodos, minas o pueblos sin unir por camino dentro de su región. |
| 6 | El agente usa los terrenos nuevos en `map_generate`, los ve en `knownMap`/`map`, y la prosa interpola la lista; `pnpm qa` verde | ✅ | `pnpm qa` → exit 0, 3,2 s, «terminado: 1 mapa diseñado, 6 turnos de mapa, 72 decisiones de batalla y 1 ascenso». `serializeKnownMap` de la semilla 5, jugador 1: `forest` 5, `cliff` 13 y `water` 11 entre sus casillas, más 24 de camino. La prosa de `map_generate` nombra las cinco barreras. Planes adversariales (`planes.ts`): muro de `lava` rechazado por zod y por `validateMapPlan`; región con suelo `forest` rechazada con su frase; mina anillada de bosque, «zona pisable sin región»; mina sobre bosque, rechazada; semilla de región sobre agua, rechazada; `baseTerrain: cliff`, rechazado. **Camino sobre barrera: aceptado en silencio** (H4). |
| 7 | Cada barrera con un color distinguible de los suelos y entre sí, con el borde marcado; arte existente; marcadores sin arte; espectador igual; consola limpia | ❌ en parte | El borde oscuro está, el arte existente se usa (montañas `montana-*`, `nodo-hito`, `ciudad`, `pueblo`, minas, árboles y ruinas), la pasada sin arte cae a marcadores (`pnpm-capturas/sin-arte-01-mapa.png`) y el espectador pinta lo mismo (`espectador-01-mapa.png`). Consola: solo «[assets] 63 imágenes generadas cargadas»; `pnpm capturas` sin errores. **Pero `cliff` se confunde con `dirt`, y `wall` parece un suelo** (H1, H2): ΔE76 de los pigmentos, `cliff`/`dirt` **11,3**. |
| 8 | Lado re-medido con la regla del usuario, tabla de CLAUDE.md con fecha, 0 sin terminar | ✅ | Repetido por QA en una tanda que el informe no tenía después de simplify: `tamanos.ts 32,34 1000 300 1001` → **34: 8 / 14 / 39, 0/1 000, j0 489**; **32: 7 / 13 / 28**, que no llega a la mediana de 8. Barrido de 40 semillas: 0/40, 10 / 16 / 20. La tabla de CLAUDE.md está fechada (03-10-2026), con la nota de la vuelta de simplify. |
| 9 | `pnpm verify` verde; banco re-anclado con la forma del diff documentada | ✅ | `pnpm verify` → 1 150/1 150, 13,1 s. `pnpm banco` → `2398f5d3…`, «ancla: igual», 0/200, 8 / 15 / 28, 5,0 s. La forma del diff está en `implementacion.md`. |
| 10 | `docs/art/peticiones.md` con los assets | ✅ | La lista está en §8: texturas por suelo, borde por barrera, puente, puerta, pasos y obstáculos por suelo. |

## Hallazgos

### Importantes

**H1 — El acantilado se lee como tierra, no como barrera.** `cliff` es un bloque
pardo liso, sin ninguna pieza encima, con el pigmento [120,86,52] contra el
[111,94,70] de `dirt` (ΔE 11,3). Las dos regiones de casa son de `dirt`, y la tabla
pone `cliff` sobre todo junto a `sand`, `lava` y `rough`. En pantalla, quien juega ve
mesetas pardas iguales a su región de casa. Lo único que las distingue es el trazo
oscuro del borde, y ese trazo lo llevan también las regiones.
- Reproducir: `pnpm dev`, `?seed=1`, «Ver mapa entero». La franja parda de arriba a
  la derecha (columnas 20-31, filas 0-10 en el ASCII) es `cliff` dentro de una región
  `rough`. Comparadla con la tierra de casa, arriba a la izquierda
  (`capturas/qa-03-seed1-mapa-entero.jpg`, `qa-04-seed1-acantilado-como-tierra.png`).
  En `?seed=2` hay bloques pardos de `cliff` dentro de la arena del centro
  (`qa-05-seed2-mapa-entero.jpg`). En el espectador pasa lo mismo
  (`pnpm-capturas/espectador-01-mapa.png`).
- Quien juega esperaba distinguir a simple vista lo que no se pisa. Es el corazón de
  la petición: «la separación de zonas tiene que quedar claramente marcada».

**H2 — El muro parece un empedrado transitable.** `wall` es un gris liso
[128,126,120] con una ruina del atlas cada varias casillas. Alrededor del castillo
de casa, en `?seed=1`, se lee como una plaza pavimentada y no como un muro: ΔE 15 con
`rough` y 16 con `sand`. Además los caminos (piedra beige) pasan pegados a él y
refuerzan esa lectura (`qa-02-seed1-casa-zoom.png`). Es menos grave que H1 porque las
ruinas ayudan, pero dentro de una mancha grande de muro no hay nada que diga «no
pasar».

**H3 — La red de caminos cubre el 41 % del suelo.** En las semillas 1-200, la
fracción de casillas pisables con camino es: mínimo 34 %, **mediana 41 %**, máximo
49 % (`caminos.ts`), con unos 6 bloques 2×2 de camino macizo por mapa. Se ve como una
malla de rombos y «escaleras» de dos vías paralelas con travesaños, por ejemplo en la
tierra de casa de `?seed=1` y en la roca de arriba a la derecha (`qa-02`, `qa-04`).
La referencia tiene sendas sueltas que serpentean entre los sitios, y lo que sale aquí
se parece más a una cuadrícula urbana. El criterio 5 se cumple al pie de la letra (une
todo con todo); lo que falla es la lectura: cuando casi la mitad del suelo es camino,
el camino deja de señalar adónde ir. También abarata el movimiento (75 frente a
100+) en media región. Lo produce `trazarCaminos`, que une cada nodo con todos los
demás y con cada mina o pueblo por el camino más corto, sin compartir tramos.

**H5 — Variedad de barreras por mapa: el mínimo de cuatro no se garantiza.** Lo
descrito en el criterio 2: en las semillas **864** y **986** (34×34) la frontera
tiene **3 tipos**. La cuarta, asignada por `repartirDistintas` a una pareja
canónica, solo vive en casillas de nodo, y `buildMap` las abre. Hay que comprobar
que la pareja tenga muro fino fuera de los nodos antes de darle la barrera que
falta. El test no lo caza porque solo audita las 200 primeras semillas.
- Reproducir: `generateMapPlan(createRng(864))` y contar las barreras de frontera,
  o `audit2.ts 1 1000`.

### Menores

**H6 — Una frontera de una casilla lejos de un nodo**, en la semilla 987: entre
(16,30) y (16,32) solo hay un `cliff`, en (16,31). Es 1 de 1 000 y queda fuera de las
200 semillas del test. Mismo origen probable: el engorde junto al borde del mapa y
dos nodos cercanos.

**H4 — Un camino del agente sobre una barrera se acepta en silencio y se pinta.**
Un plan con `roads` sobre un `cliff`/`forest`/… pasa `mapPlanSchema` y
`validateMapPlan` sin decir nada (`planes.ts`, caso «camino sobre barrera»).
`map.ts` no lo abre, pero el cliente (`render/mapa.ts:968`) dibuja el trazo encima de
la barrera, y la prosa del turno dice que una casilla con camino cuesta 75 «se pinte
sobre el terreno que se pinte». A quien mira, y al agente, una carretera sobre un
acantilado le dice que se pasa. Va contra el «fail-loud» del repo. No pasa con el
generador de casa (0 caminos sobre barrera en 1 000 semillas).

**H7 (no es de este cambio, pero se nota más ahora) — Emboscada el día 1, nada más
salir de casa, sin aviso.** En `?seed=1`, pasar el ratón por la hierba de debajo del
castillo dice «Ruta: llegas hoy (5 pasos).», sin aviso de nada
(`qa-06-seed1-ruta-sin-aviso.jpg`). Con el clic, el héroe entra en la región 8, la
emboscan 5 momias que no se ven (están en (6,16), fuera de la niebla) y pierde **toda
la tropa** el día 1 (`qa-07`). Se midió contra HEAD en un worktree temporal: en 100
de 100 semillas antes y en 98 de 100 ahora, alguna región vecina de la casa embosca al
héroe inicial. Es la regla de los asaltantes, que ya existía, y no una regresión. Se
apunta porque es lo primero con lo que tropieza quien prueba el mapa nuevo.

## Workarounds usados

- **«Ver mapa entero»** para mirar el mapa sin niebla. Es un botón del propio
  cliente, así que no es un workaround.
- **Semillas buscadas fuera de las 200 del test** (864, 986, 987). No falsean nada:
  son partidas que cualquiera abre con `?seed=N`.
- Un **worktree temporal de HEAD** para comparar H7. Se borró
  (`git worktree list` lo confirma). El árbol de trabajo no se tocó: `git status`
  sale igual que al empezar, más `capturas/` y este `qa.md`.

## No probado

- **Tiempo de fotograma del cliente** con las piezas nuevas (el ingeniero tampoco lo
  midió).
- **El espectador contra un agente real** (`pnpm partida` + Claude Code). Solo se vio
  la pasada de `pnpm capturas`, con su veterano de QA.
- **La pantalla de móvil y táctil** solo en las capturas de `pnpm capturas`
  (`movil-01-mapa.png`). No se jugó a mano.
- **`pnpm capturas`** pasó en verde (129,2 s, sin errores en consola). Su fragilidad
  de semillas, que el propio informe reconoce, no se evaluó.

## Notas de proceso

- El scratchpad es **compartido con el ingeniero**. Algunos de mis ficheros
  (`verify.log`, `qa.log`, `capturas.log`, `diag.ts`, `planes.ts`) pueden haber
  pisado ficheros suyos del mismo nombre. Eran temporales y no son evidencia de nadie.
- Vite propio en 3193, con `set -m` en su línea. Antes de matarlo, `readlink` del cwd
  dio `/home/al/code/heroes`. Muerto por su grupo; comprobado «3193 libre». El 3100 lo
  tenía otro proceso (pid 6611) y no se tocó.

## Veredicto

**Apto con reservas.** La estructura del motor cumple lo que pidió el usuario y se
sostiene en 1 000 semillas: solo se pasa por los nodos, cada región tiene un solo
suelo, los obstáculos bloquean sin aislar nada, la densidad cae en el rango y los
caminos llegan a todo. El agente, el banco, el lado del mapa y la verificación están
en verde. Las reservas son tres:

- H5: **≥ 4 barreras por mapa falla en 2 de 1 000** semillas, y es un criterio literal.
- H1/H2: **el acantilado y el muro no se leen como barrera**, cuando la petición dice
  «claramente marcada».
- H3: **la red de caminos es una malla del 41 %** y no una red entre lugares.

H5 y H6 son arreglos acotados en `vestir.ts`, con auditoría en más semillas. H1/H2 son
de pigmento o de una pieza temporal en el cliente. H3 pide decidir cuánto camino se
quiere: lo pongo para que lo decida el usuario.

---

# Re-verificación vuelta 1

QA, 03-10-2026, sobre el árbol de trabajo tras la «Vuelta de QA 1» del ingeniero.
No se ha tocado el código. Las sondas de la vuelta anterior ya no estaban en el
scratchpad, así que se reescribieron desde cero y **sin reutilizar nada del
ingeniero**: `qa-v1/auditoria.ts` rellena las regiones por su cuenta (no llama a
`estructura()` ni a `auditarMapaDenso`) y recorre `newGame`, que es lo que ve quien
juega. `qa-v1/planes.ts` prueba los planes adversariales. Las dos están en
`/tmp/claude-1000/-home-al-code-heroes/3fde2e67-6d95-4c33-b554-bc6eb38aae58/scratchpad/qa-v1/`.
Las capturas están en `capturas/vuelta-1-qa/`.

## Bucle rápido

| Comprobación | Resultado |
|---|---|
| `pnpm verify` | 1154/1154, 13,7 s |
| `pnpm banco` | `1b90bfd9…`, «ancla: igual», 0/200, 8 / 15 / 25 |
| `pnpm qa` | exit 0, 3,3 s, «1 mapa diseñado, 6 turnos de mapa, 80 decisiones de batalla y 1 ascenso» |

## Criterios afectados por H1-H6

| Criterio | Estado | Evidencia |
|---|---|---|
| H5 · ≥ 4 barreras por mapa con ≥ 15 casillas de frontera cada una | ✅ | Auditoría independiente, frontera = componente de barrera que toca ≥ 2 regiones o un nodo. 34×34, semillas **1-3 000** (incluidas 864 y 986): `menos4 0`, `menos4con15 0`. Reparto de tipos por mapa: 4 tipos en 362 / 349 / 337 de cada mil y 5 en 638 / 651 / 663. **24×24** (198 mapas) y **48×48** (200): 0 y 0. |
| H6 · frontera ≥ 2 casillas salvo junto a los nodos | ✅ | Pares de casillas pisables de regiones distintas a distancia de Chebyshev ≤ 2 **y a más de 3 de cualquier nodo**: 0 en 34×34 (semillas 1-3 000, la 987 incluida), 0 en 24×24 y 0 en 48×48. Todos los mapas tienen pares finos dentro del radio del paso, que es la excepción aprobada. |
| H3 · «árbol mínimo + minas»: nodos de cada región conectados por camino, una senda a cada mina y pueblo, tramos fundidos | ✅ (el 10-15 % no, ya declarado) | En 3 000 mapas de 34×34: **0** terminales (nodo, mina, pueblo) sin camino, **0** regiones con terminales sin unir. Suelo pisable con camino: **27,2-44,8 %, mediana 35,9-36,0 %** en las tres tandas (24×24: 38,7 %; 48×48: 35,6 %). Bloques 2×2 de camino: 0,72-0,81 por mapa. **Redundancia** (casillas de camino que se pueden quitar una a una sin desconectar ningún terminal): mediana **7 por mapa**, p90 11, máximo 24, sobre unas 250 casillas de camino. Ya no es la malla de antes: es un árbol con alguna esquina diagonal sobrante. El 36 % frente al 10-15 % orientativo sigue pendiente de decisión del usuario, como dice el ingeniero. |
| H4 · camino sobre barrera rechazado diciéndolo | ✅ | `planes.ts`: sobre `water` en (7,0), rechazado: «el camino de (7,0) cae sobre water: un camino solo va por casillas que se pisan». Fuera del mapa por los cuatro lados, rechazado: «el camino de (34,3) se sale del mapa». Sobre un nodo, una ciudad o una mina, vale. Con decimales o `null`, lo rechaza zod. El generador pone 0 caminos sobre barrera y 0 fuera en 3 400 mapas. La prosa de `map_generate` (`agent.ts:548`) y la del turno (`serialize.ts:411-414`) dicen la regla. |
| H1/H2 · acantilado y muro se leen como barrera (cliente y espectador) | ✅ con una reserva nueva (N1) | Cliente `?seed=1` con niebla parcial y con el mapa entero, y `?seed=2500` (fuera de las semillas del ingeniero): el **muro** es sillería oscura con juntas y no se confunde con ningún suelo (`qa1-02`, `qa1-10`). El **acantilado** es un ocre anaranjado con estrías y sombra, imposible de leer como tierra (`qa1-04`, `qa1-11`, `qa1-15`). Espectador contra un `pnpm partida` propio (puertos efímeros, sin agente, `HEROES_SEED=1500`, terminada el día 8): pinta lo mismo (`qa1-06`). Consola del cliente y del espectador: solo «[assets] 63 imágenes generadas cargadas». Pero los **picos de montaña también se pintan sobre casillas pisables de `rough`**: ver N1. |

## Cambio de IA no pedido (`src/core/ai/turn.ts`)

**Es correcto, está bien acotado y no rompe nada que se haya podido medir.**

- **Lógica.** Solo se dispara si se cumplen las cuatro condiciones a la vez: no hay
  destino, el alcance prudente es la casilla propia (`costs.size <= 1`), el héroe no
  está en su base y **todos** los héroes rivales están igual de encerrados. Entonces
  vuelve a casa con `destinoDeRepliegue` sobre el alcance normal. `reachableFrom` no
  tiene tope de movimiento, así que `costs.size` mide si el héroe está encerrado y no
  cuántos puntos le quedan: un héroe que ya ha gastado el día no cuenta como
  encerrado. Lo comprobé porque era la primera sospecha.
- **Medido.** `tamanos.ts 34 1000 300` en las semillas **1 001-2 000** y **2 001-3 000**,
  que no ha medido nadie: **0/1 000 y 0/1 000 sin terminar**, 8 / 15 / 42 y
  8 / 15 / 34, j0 480 y 489, emboscadas 0,00 por partida. El banco sale con el ancla
  igual. El test de `asaltantes.test.ts` muerde por los dos lados, según el informe.
- **Lo que deja abierto, sin llegar a ser un fallo:**
  1. Si el rival **no tiene héroes** (`rivales.length > 0` es falso), el encerrado
     no vuelve nunca. Solo es eterno si el rival tampoco puede contratar, porque la
     IA contrata primero. No lo he visto en 2 000 partidas.
  2. Un héroe encerrado en una ciudad propia que **no es su base** vuelve a casa
     cruzando la emboscada en vez de reclutar allí. Es raro, porque una ciudad es un
     nodo y casi siempre deja salir por el otro lado.
  3. El caso asimétrico (encerrado contra un rival libre que no cambia nada) que
     reconoce el ingeniero: 0 casos en 2 000 semillas.
- **Coste.** Calcula un Dijkstra por cada héroe rival en cada vuelta en la que un
  héroe está encerrado. Solo ocurre en el empate, así que no se nota (el banco tarda
  lo mismo).

## Pasada adversarial nueva

| Sonda | Resultado |
|---|---|
| `regions[].terrain` = `ice`, `Grass`, `""`, `null` | Los rechaza **zod**. Pero `validateMapPlan` sola los **acepta**, porque `isWalkable` es «no es barrera» y cualquier cadena desconocida cuenta como suelo. Ver N3. |
| `regions[].terrain` = `wall` / `water`, `baseTerrain: forest` | Rechazados con su frase. |
| Todas las regiones con `lava`; región y espejo con suelos distintos (`snow`/`sand`); sin `terrain` | Válido, como debe ser: el agente diseña. |
| Región declarada fuera del mapa o sobre una barrera | Rechazado con la casilla, y además «zona pisable sin región». |
| 500 caminos fuera del mapa | Rechazado, pero con **500 frases**, una por casilla. Ver N4. |
| Caminos duplicados | Válido, sin efecto. |
| 24×24 | 2/200 sin mapa (42 y 74), como ya declaró el ingeniero. Los 198 que salen cumplen todo. |
| 48×48 | 200/200 limpios. |
| Vista con niebla parcial (`?seed=1`, `?seed=2500`, día 1) | El borde de la niebla corta limpio. Los caminos se cortan en la niebla. Nada se pinta fuera de lo explorado. `qa1-01`, `qa1-09`. |
| Minimapa | Usa los pigmentos nuevos y se distinguen las cinco barreras (`qa1-05`). Hay una pega menor con el muro: ver N2. |

## Hallazgos

### Importantes

**N1 — Picos de montaña sobre casillas que se pisan: el obstáculo y el decorado son
el mismo dibujo.** En una región `rough`, `vegetacion()` (`render/mapa.ts`, `case
'rough'`) decora el ~4 % de las casillas pisables con `CELDA.montana`, que es el
mismo pico que lleva cada casilla de `mountain`. Además, la pieza grande de montaña
(escala 2,2-2,65) se desborda sobre las casillas vecinas. Desde que los obstáculos
bloquean, quien juega no puede saber qué picos cierran el paso. Lo único que lo dice
es el fondo lavanda, que queda tapado justo debajo del pico.
- Reproducir: `pnpm dev`, `?seed=1`, «Ver mapa entero», y pasar el ratón por la
  casilla de picos que hay a la derecha de la mina de cristal de la región de roca de
  arriba a la derecha (pantalla ≈ (1093,297) a 1512×795). La barra dice «Ruta: hoy
  llegas a 11 de 22 pasos» y el marco de destino cae sobre una casilla cubierta de
  picos (`qa1-13`, `qa1-14`, y `qa1-12` para la región entera).
- Quien juega espera que un pico sea montaña, o sea que no se pasa. Es la misma clase
  de fallo que H1/H2, pero al revés: un suelo que parece barrera. El decorado de
  `rough` ya existía en HEAD con el 7 %; lo que lo vuelve engañoso es que ahora los
  obstáculos bloquean. Pasa lo mismo, en menor grado, con los pinos sueltos sobre
  `snow` y `grass`: usan la misma celda `pinar` que el bosque denso, aunque sin el
  fondo verde oscuro se distinguen mejor.

### Menores

**N2 — En el minimapa, el muro casi no se distingue de lo inexplorado.** El pigmento
de `wall` [34,32,54] está a **ΔE76 16,9** del fondo del minimapa `#080a10`, por debajo
del umbral de 20 que el propio ciclo se puso para los suelos. Un muro en el borde de
lo explorado se funde con lo negro (`qa1-03`). En el mapa grande no pasa, porque los
sillares claros lo marcan. `forest` (46) y `water` (42) están lejos.

**N3 — `validateMapPlan` no rechaza un suelo de región inventado.** Con
`regions[0].terrain = 'ice'` (o `'Grass'`, o `''`), `validateMapPlan` devuelve `[]`:
`isWalkable(t)` es `!esBarrera(t)`, así que lo desconocido cuenta como suelo. Al
agente no le afecta, porque pasa antes por `mapPlanSchema` (enum). Pero CLAUDE.md
llama a `validateMapPlan` «la puerta única de los dos productores», y lo que valida
el texto que ejecuta el motor aquí es zod y no esa puerta. Es la misma especie que
el caso `creature` que el repo cuenta. Hoy está latente: el generador de casa solo
usa suelos válidos.

**N4 — Un rechazo de caminos lleva una frase por casilla.** Con 500 caminos fuera
del mapa, `validateMapPlan` devuelve 500 problemas iguales. Un agente que se
equivoca de origen de coordenadas en toda su red de caminos recibe un rechazo
enorme. Bastaría con agrupar o cortar en N y decir cuántos faltan.

**N5 — Halo anaranjado del acantilado sobre el suelo vecino.** En el espectador
(`qa1-07`, `qa1-08`), y algo menos en el cliente (`qa1-15`), el borde del acantilado
deja sobre la nieve y el agua un degradado ocre de casi una casilla. Se lee más como
un resplandor que como la sombra del desnivel, y difumina el borde que la petición
quiere «claramente marcado». Es estético y no impide leer la barrera.

**N6 — Triangulitos en las bifurcaciones de los caminos.** Donde tres casillas de
camino son vecinas entre sí (por ejemplo (7,6), (6,7) y (7,7) en `?seed=2500`), el
cliente une las tres y se ve un pequeño bucle triangular (`qa1-10`, abajo a la
izquierda del castillo). La red del motor no tiene ese bucle: en esa semilla solo
hay 3 casillas redundantes. Es del dibujo y no del generador.

## Workarounds usados

- **«Ver mapa entero»**: es un botón del cliente, no un workaround.
- **Un `pnpm partida` propio** con `HEROES_AGENT_PORT=0 HEROES_SPECTATOR_PORT=0
  HEROES_WAIT_AGENT_MS=60000 HEROES_SEED=1500`, para que el espectador tuviera algo
  que mirar sin agente. Es la forma documentada de jugar sin agente, así que no
  afecta al usuario. Se mató por su grupo (PID 8781 = PGID) y los puertos 44019 y
  45983 quedaron libres.
- **Vite propio en 3211**, lanzado con `set -m` en su línea, PID 8476 = PGID, y cwd
  del que escucha (8490) comprobado como `/home/al/code/heroes`. Muerto por su grupo,
  «3211 libre».
- No se tocó ningún fichero del repo salvo este `qa.md` y `capturas/vuelta-1-qa/`.

## No probado

- **`pnpm capturas`** no se re-corrió: tarda ~120 s, el ingeniero lo da verde y lo
  que cambió en esta vuelta lo cubren el navegador y la auditoría.
- **El espectador contra un agente real**: solo se probó contra la IA de respaldo del
  servidor.
- **El tiempo de fotograma** con `tramarBarreras`.
- **Las tandas de 1 000 en 32×32**: el ingeniero midió 100 y la regla no cambió de
  lado. Mis 2 000 semillas nuevas en 34 cumplen la regla (mediana 8, p90 15, 0 sin
  terminar).

## Veredicto de la re-verificación

**Apto con reservas.** H1, H2, H3, H4, H5 y H6 están cerrados y se sostienen fuera
de las semillas que se usaron para arreglarlos: 3 000 mapas en 34×34 más 24×24 y
48×48, con cero fallos en barreras por mapa, grosor, caminos y caminos sobre
barrera. El cambio de IA es correcto, está acotado al empate y no deja una sola
partida sin terminar en 2 000 semillas nuevas. La reserva es **N1**: los picos
decorativos sobre `rough` pisable se dibujan igual que la montaña que bloquea, y eso
contradice la «separación claramente marcada» ahora que los obstáculos bloquean.
N2-N6 son menores. Sigue abierta la decisión del usuario sobre el 36 % de suelo con
camino.
