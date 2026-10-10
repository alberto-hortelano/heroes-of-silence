# QA — murallas en la arena

Validado el 09-10-2026 sobre el diff sin commit de la rama `asalto`
(`/home/al/code/heroes-asalto`), contra la petición literal de `requisitos.md`:

> Crea una forma sencilla de dibujar muros y probarlos en el juego pudiendo crear
> los dos ejercitos y testear diferentes formas de muralla

Método: `pnpm verify`, `pnpm banco`, `pnpm qa`, barrido y enfrentamiento. Además,
un fuzz propio del núcleo (≈880 batallas IA contra IA con murallas al azar) y la
arena en Playwright sin pantalla (`vite --port 4431 --strictPort`, arrancado con
`set -m` y matado por su grupo; `ss` después: libre). Los guiones están en
`.cache/qa-muralla/` (ignorado). Las capturas que cito están en
`capturas/qa-*.png`. `data/borradores/` no existía antes; lo he quitado al terminar.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| C1 | Editor: un clic pone o quita muro o puerta y se ve al momento | ✅ | `editor.ts`: 9 clics en diagonal → «MURALLA · 9 MUROS Y 0 PUERTAS»; otro clic en (9,8) → 8; Puerta sobre un muro → «8 MUROS Y 1 PUERTA» y la clase pasa a `hex puerta`; Goma en (5,0) → 7. Un doble clic deja el hex como estaba. La rejilla del editor va en odd-r como el tablero (fila impar 14 px = medio hex): la diagonal que se ve conectada está conectada (`qa-1-editor-diagonal.png`) |
| C2 | Guardar con nombre, cargar y borrar; ejemplos; borrador validado y fail-loud | ✅ | Guardar «  línea RECTA » → «No se ha guardado la muralla: «línea RECTA» es una forma de ejemplo…»; nombre vacío → «…el nombre tiene que ser un texto no vacío»; `<b>Diagonal</b> & "QA"` se guarda, se ve escapado, sobrevive a recargar, «Cambiada…» al volver a guardar y «Borrada…» al borrar. Los cuatro ejemplos se cargan (9/0, 8/1, 8/1, 10/0) y no traen Borrar. Borrador corrupto (`corrupto.ts`): JSON roto, `formas` que no es lista y raíz en lista → se dice en la barra, Guardar deshabilitado y el archivo no se toca; un borrador con 11 entradas raras (ejemplo, repetida, fuera del tablero, campo de más, nombre 42, nombre de 50, col decimal, muro y puerta en el mismo hex, `null`, `<img onerror>`) → las 9 malas listadas con su motivo y conservadas al guardar; el `<img>` se pinta como texto, sin diálogo. Ver hallazgos M3 y M4 |
| C3 | El que camina no entra ni atraviesa el muro; el volador pasa por encima y no se posa | ✅ con reserva | Fuzz (`fuzz.ts`, semillas 1-3, 883 batallas montadas): 0 unidades vivas posadas en muro o el atacante en puerta, tras cada jugada; 0 caminos de un caminante que pisen un hex cerrado. Navegador: «Ahí hay muro.» en (7,2); el volador (Espectro, `flying` puesto en la ficha) cruza la col 4 y aterriza en (5,2), y en el muro dice «Ahí hay muro.» (`qa-5-volador-sobre-el-muro.png`). **Reserva (M1)**: la cola de una unidad de dos hexes sí pasa por hexes de muro a mitad del recorrido |
| C4 | La puerta la cruza el defensor y no el atacante | ✅ | Navegador, «Línea con puerta»: el atacante en (7,4) → «La puerta solo la cruza quien defiende.»; el Orko defensor sale por ella y se para en ella (`qa-3-defensor-en-la-puerta.png`). Núcleo: el troll atacante (2 hexes) no puede poner la cola en (7,4) |
| C5 | La IA no se cuelga; acaba como mucho en `MAX_ROUNDS` con `finalDeArena` | ✅ | Fuzz: 0 batallas sin terminar en 5 000 jugadas, 0 excepciones, `finalDeArena` ≠ null en todas; ~14 % llegan a la ronda 100 (formas que encierran a alguien). Navegador, «Línea recta» con solo cuerpo a cuerpo (semilla 5): «Sin vencedor en 100 rondas: por tiempo, gana quien tiene más unidades en pie. Gana el bando izquierdo.», al instante y sin errores (`qa-9-linea-recta-al-tope.png`). «Semicírculo» (s3) acaba en la ronda 6 y «En L» (s4) en la 4, IA contra IA |
| C6 | Jugar a mano; lo cerrado no se ofrece y el motivo lo da el núcleo | ✅ | La izquierda a mano en «Línea con puerta» (semilla 11): las casillas verdes acaban en el muro (`qa-2-a-mano-linea-con-puerta.png`); (8,4) → «No llega: le quedan 7 casillas y la muralla o las unidades cortan el camino.»; con el troll, (8,3) → «la cola caería en el muro». Fuzz: en cada séptima jugada, los 99 hexes, `movimientoBlocker` es `null` justo donde `movableFrom` ofrece (0 discrepancias); `porQueNoCabe` no lanzó nunca. Ver M2 |
| C7 | Muro y puerta pintados con marcadores claros y distintos; nadie encima | ✅ con reserva | Piedra gris con hiladas y madera con barras, legibles a 1600 px (`qa-2…`, `qa-6…`). El defensor en su puerta se pinta sobre ella, que es lo pedido. **Reserva (M5)**: el cadáver del troll se tiende sobre los muros de al lado (`qa-4-cadaver-sobre-el-muro.png`) |
| C8 | Reglas en `core`; `createRng` | ✅ | `cerradaPara` (`battle/muralla.ts`) la leen movimiento, carga, despliegue, blocker e IA; el cliente pinta y pregunta (`cerradaPara`, `bandoDeSalida`, `despliegueDeArenaBlocker`, `moveRejection`). Sin `Math.random` nuevo en el diff |
| C9 | Las partidas no cambian | ✅ | `pnpm banco`: `sha256 9fc436ed18eca65215e021f5f41dafbb33f072ec7d193d85d5e9262f65b12937`, «ancla: igual — las 200 partidas se juegan hexágono a hexágono igual», salida 0. `pnpm verify`: «Test Files 102 passed (102) · Tests 2561 passed \| 12 skipped», salida 0. `pnpm qa` salida 0. Barrido «sin terminar: 0/40». Enfrentamiento «1008/2000 = 50.40 % ± 0.46 pp», idéntico al del informe. `verify:lento`: no lo he corrido yo (ver «No probado») |
| C10 | Tests en `core` de cada regla | ✅ | `test/muralla-de-batalla.test.ts` y `test/arena-murallas.test.ts` cubren muro, volador, puerta por bando, borrador, despliegue e IA que termina; en verde dentro de `pnpm verify` |
| Petición | Montar los dos ejércitos y probar formas | ✅ | Montaje con tiradores (Esqueleto arquero, Ballestero), volador (Espectro con `flying`), grande (Troll con «Hexes 2») y carga (Hermano de carga), contra «Línea con puerta», una col 4 dibujada a mano, «Semicírculo» y «En L»; consola limpia en todas las pasadas |

## Hallazgos

Ninguno bloqueante.

**Importante**

- **M1 · La cola de una unidad de dos hexes atraviesa el muro a mitad del recorrido.**
  El camino se busca por la cabeza (`reachable`) y solo el aterrizaje mira la cola
  (`celdaQueNoCabe`). En el fuzz, 92 tramos en 883 batallas tienen la cola sobre un
  muro (o sobre la puerta, siendo atacante) en una casilla intermedia. Repetible con
  `npx tsx .cache/qa-muralla/fuzz.ts 1 300`, batalla 14: muros (8,3) (9,4) (10,6)
  (0,8); el troll defensor sale de (9,3) por 9,2 → 8,2 → 7,3 → …, y con la cabeza en
  (7,3) la cola está en (8,3), que es muro. Se ve como el troll resbalando por encima
  del muro. C3 dice «ni lo atraviesa»; `implementacion.md` lo anota como no cubierto
  («la unidad grande se busca por la cabeza»). No rompe ninguna regla al posarse, pero
  la letra del criterio no se cumple para `size` 2. Hay que decidir si se acepta o va
  al backlog.

**Menor**

- **M2 · Dos frases de rechazo que no cuadran.** (a) Un volador atacante que pulsa
  la puerta oye «La puerta solo la cruza quien defiende.», cuando él sí la cruza
  volando; lo que no puede es posarse en ella. (b) Un grande atacante con la cola en
  la puerta (cabeza en (8,4), puerta en (7,4)) oye la misma frase, sin «la cola», al
  contrario que con el muro («la cola caería en el muro»). Sale de
  `.cache/qa-muralla/cola.ts`.
- **M3 · La forma repetida del borrador se pierde al guardar otra.** Si el archivo
  trae dos «Buena», al cargar la segunda sale como «no vale y se conserva tal cual».
  Pero al guardar cualquier otra forma desaparece, porque su clave coincide con la
  de la «Buena» válida (`claveSinValidar` en `escribir`); se la come «mandar uno
  válido con ella es arreglarlo». Es la misma regla que el borrador de unidades, y
  el aviso promete otra cosa. Pasos: escribir el «mixto» de `corrupto.ts`, abrir la
  arena, guardar «Nueva QA» y mirar el archivo: 11 entradas, sin la segunda «Buena».
- **M4 · «Guardar forma» deshabilitado sin decir por qué.** Si el borrador es
  ilegible, el motivo solo sale en la barra al arrancar, y el primer clic en la
  rejilla lo borra (`tocarHex` deja `aviso = ''`). El botón no lleva `title`, al
  contrario que «Luchar» cuando no cabe el despliegue.
- **M5 · El cadáver de un grande queda sobre la muralla.** El troll defensor muere
  en su puerta y se tiende sobre los muros (7,3) y (8,3) hasta el final de la pelea
  (semilla 11, «Línea con puerta», izquierda a mano pulsando solo «Terminar turno»;
  `qa-4-cadaver-sobre-el-muro.png`). Es cosa de cómo se pinta el cadáver, pero
  emborrona lo que se está probando.
- **M6 · Textos.** En las tarjetas de forma, «9 muro · 0 puerta»; en el aviso,
  «deja 1 filas de salida».
- **M7 · A 1280×720 el editor aprieta el montaje.** Bandos y ficha se quedan en
  unos 250 px de alto y hay que desplazarse dentro de ellos
  (`qa-10-montaje-1280.png`). A 1600×1000 y 1920×1080, bien.

**Observación (no es fallo)**: el despliegue llena primero la columna 0. Con muros
en las columnas 0-1 de las filas 2-6, el primer guerrero sale en (0,1), rodeado de
los suyos y del muro, y no puede moverse en su primer turno, aunque la columna 2
está libre (semilla 21; `qa-8-despliegue-esquiva.png`). La regla se cumple (nadie
sale encima del muro) y la frase lo explica, pero quien dibuja en la zona de salida
puede no esperarlo.

## Workarounds usados

- **El rasgo `flying` y «Hexes 2» puestos desde la ficha.** Ninguna hoja trae un
  volador ni una unidad de dos hexes por defecto. Es el camino normal de la arena
  (ficha → rasgo / campo): no es un falseo, y quien juega tiene que hacer lo mismo.
- **La geometría del clic sale de `tableroPara`/`centroHex`.** Es la misma que usa
  `pnpm capturas`, porque el guion no ve el lienzo. Quien juega pulsa a ojo. No le
  afecta.
- **La «mano» en la pelea larga fue sobre todo «Terminar turno».** Con eso se
  comprueba que la pelea acaba con la persona y que la IA sale por la puerta, pero
  no que se gane jugando bien. El movimiento de verdad (clic a un hex libre, mover el
  volador al otro lado del muro) se hizo en las sondas de la col 4.

## No probado

- **`pnpm verify:lento`.** No lo he corrido: tarda ~75 s en una máquina con carga
  24, y el informe del ingeniero lo da en verde (4319 tests) tras /simplify. El
  cambio no toca el escenógrafo, la generación ni el arte, que es lo que añade la
  lenta. Debe correr en CI antes del merge.
- **`pnpm capturas`.** No toca nada de la arena con muralla (el montaje que juega va
  sin ella), y las pasadas de la arena se hicieron a mano aquí.
- **La derecha a mano (el defensor) en el navegador.** El paso por la puerta del
  defensor está probado con la IA en el navegador y en el núcleo, no con clics.
- **Pantalla de móvil.** La arena es una herramienta de escritorio.

## Veredicto

**Apto con reservas.** La petición se cumple: se dibuja, se guarda, se carga y se
borra; se montan los dos ejércitos y se pelea, a mano o con la IA, con la muralla
respetada en el núcleo; las partidas del juego no cambian (banco con el mismo
hash). La reserva es M1: la cola de las unidades grandes atraviesa el muro a mitad
del recorrido, contra la letra de C3. Los demás son textos y detalles de pintado.

---

## Vuelta 2 (09-10-2026)

Re-verificación de lo que tocó «Tras QA (vuelta 1)» de `implementacion.md`: C3, M1,
M2, M3, M4, M6, M7, y una pasada adversarial nueva sobre lo cambiado. Guiones
nuevos en `.cache/qa-muralla/vuelta2/` (`sondas.ts`, `m3.ts`, `navegador.ts`;
ignorado). Navegador: `npx vite --port 4471 --strictPort`, arrancado con `set -m`
en su línea (PID 752748 = su grupo), matado con `kill -TERM -752748`; `ss`
después: «4471 libre». `data/borradores/` no existía; el guion lo crea y lo borra
en un `finally` (comprobado: no queda).

### Comprobaciones fijas

- `pnpm verify` → `Test Files 102 passed (102) · Tests 2569 passed | 12 skipped (2581)`, `salida 0`.
- `pnpm banco` → `sha256: 9fc436ed18eca65215e021f5f41dafbb33f072ec7d193d85d5e9262f65b12937` · `ancla: igual — las 200 partidas se juegan hexágono a hexágono igual` · `sin terminar: 0/200`, `salida 0`.
- Fuzz de vuelta 1 con dos semillas nuevas (`fuzz.ts S 400`):
  ```
  S=1 { partidas: 394, porDespliegue: 6,  alTope: 53, agotadas: 0, errores: 0, violaciones: 0, maxRondas: 100, tailCruce: 0, bloqueadorMal: 0 }
  S=4 { partidas: 388, porDespliegue: 12, alTope: 50, agotadas: 0, errores: 0, violaciones: 0, maxRondas: 100, tailCruce: 0, bloqueadorMal: 0 }
  S=5 { partidas: 392, porDespliegue: 8,  alTope: 47, agotadas: 0, errores: 0, violaciones: 0, maxRondas: 100, tailCruce: 0, bloqueadorMal: 0 }
  ```
  (vuelta 1: `tailCruce: 92` en `1 300`).

### Criterios afectados

| # | Criterio / hallazgo | Veredicto | Evidencia |
|---|---|---|---|
| C3 / M1 | La cola de la grande no atraviesa el muro a mitad del camino | ✅ | Fuzz arriba: 0 tramos con la cola en lo cerrado en 1 174 batallas (semillas 1, 4, 5). Sonda A (`sondas.ts`): troll de 2 hexes **defensor** en (9,4) de «Línea con puerta» → 29 destinos al oeste del muro, 0 pasos de ningún camino con el cuerpo en muro; (6,4) con la cola en su propia puerta y (7,4) con la cabeza en ella: se puede; (6,3) → «la cola caería en el muro». Sonda A2: el troll **atacante** en (5,4) → 0 destinos al este; (9,4) → «no llega: le quedan 7 casillas y la muralla o las unidades cortan el camino» |
| C3 / M1 (carga) | La carga de la grande no cruza el muro con la cola | ✅ | Sonda B: Hermano de carga con «Hexes 2», 3 000 murallas al azar (3-15 muros en las cols 2-8), los dos bandos, posiciones al azar: **208 cargas ofrecidas por `casillasDeCarga`, 0 con el cuerpo sobre un muro en algún hex de su recta** |
| C3 / M1 (IA) | `distanciaHasta` ve lo mismo que `movableFrom` | ✅ | Sonda C: troll de 2 hexes atacante, 400 murallas de 15 muros: en ningún caso `movableFrom` llega junto al enemigo con `distanciaHasta` = ∞ (0 discrepancias en 15 057 casillas alcanzables) |
| C6 / M2 | Frases de rechazo del núcleo | ✅ | Navegador, **la derecha a mano** (abajo): «La cola caería en el muro.», «Ahí hay muro.», «Ahí está Troll con maza.» (el Orko pulsando la puerta donde está la cola del troll). Las del volador y la cola atacante en la puerta, en `pnpm verify` (`muralla-de-batalla.test.ts`) y en la salida del ingeniero; no las he repetido en el navegador |
| C2 / M3 | La forma repetida se conserva al guardar otra | ✅ con reserva | Núcleo (`m3.ts`, raíz temporal) y navegador: borrador `[Buena(1 muro), Buena(2 muros), Rara(fuera)]`; la barra dice «Formas de muralla que no valen y se conservan tal cual: Buena (… está dos veces …); Rara (…)»; guardar «Nueva QA» → archivo `Buena(1) Nueva QA(1) Buena(2) Rara(1)`: **se conserva**. Unidades: `[templario-escudo/4, templario-escudo/99]` + guardar otra → `templario-escudo/4 templario-mandoble/3 templario-escudo/99`: **se conserva**. Arreglar «Rara» mandándola buena la sustituye (conservadas 0). Reserva: ver M8 |
| M4 | Borrador ilegible: el botón dice por qué y el motivo no se va | ✅ | Navegador: «Guardar forma» `disabled`, `title`: «No se puede guardar: data/borradores/murallas.json no se puede leer (… no es JSON: Unexpected end of JSON input), y guardar lo pisaría. Arréglalo o bórralo a mano.». Tras un clic en la rejilla, cambiar a Puerta, cargar «Semicírculo» y añadir un troll, el editor sigue diciendo «No se pueden guardar ni borrar formas: …». (La barra pasa a «Troll con maza entra en el bando izquierdo.» al añadir, que es lo esperado: el motivo vive en el editor) |
| M6 | Plurales | ✅ | Tarjetas «9 muros · 0 puertas · ejemplo», «8 muros · 1 puerta · ejemplo», «1 muro · 0 puertas»; cabecera «MURALLA · 27 MUROS Y 0 PUERTAS»; aviso «la muralla deja 0 casillas de salida a la izquierda y hace falta 1» |
| M7 | Plegar el editor; se recuerda; sin `localStorage` no rompe | ✅ | A 1280×720: plegado, el editor es su cabecera y el aviso que impide luchar; «Luchar» deshabilitado con el mismo `title` (`capturas/v2-plegado-con-aviso.png`). Con `localStorage` lanzando `SecurityError` en cada acceso (`addInitScript`): abre desplegado (99 hexes), «Plegar» → 0 hexes, «Desplegar», `aria-expanded=false`; se monta plegado; al recargar sale desplegado. En consola solo los tres `console.warn` previstos («no se puede leer si la muralla iba plegada: SecurityError…», «no se puede recordar…»), ningún error |
| C6 (derecha a mano) | Jugar el bando derecho con clics | ✅ | «Línea con puerta», semilla 11, la derecha (Troll con maza de 2 hexes y Orko) en «Yo», la izquierda (Orko) en «IA». El troll: (6,3) → «La cola caería en el muro.»; (7,3) → «Ahí hay muro.»; (6,4) → se mueve, la cabeza fuera y la cola en su puerta (`capturas/v2-derecha-troll-en-su-puerta.png`). El Orko de la derecha pulsa su puerta → «Ahí está Troll con maza.». El troll ataca después al Orko atacante que llega a (5,4) (`v2-derecha-troll-fuera.png`) y la pelea acaba: «La batalla ha terminado.». Consola sin errores ni avisos |

### Hallazgos de la vuelta 2

Ninguno bloqueante ni importante.

**Menor**

- **M8 · Borrar una forma con una repetida escondida la resucita con otro
  contenido.** Consecuencia directa del arreglo de M3, sin regla que lo
  contradiga, pero sorprende. Pasos: `data/borradores/murallas.json` con
  `[Buena (muro en 5,4), Buena (muros en 6,4 y 6,5), …]`; abrir la arena; en la
  tarjeta «Buena» (1 muro) pulsar Borrar → «Borrada la forma «Buena».» y la
  tarjeta desaparece; el archivo queda `Nueva QA(1) Buena(2) Rara(1)`; **al
  recargar, vuelve una tarjeta «Buena» con 2 muros** (`capturas/v2-borrar-buena-reaparece.png`).
  Quien juega esperaba que «Buena» ya no estuviera, o que el aviso de la barra al
  borrar le dijera que queda otra con ese nombre. Solo pasa con un archivo
  retocado a mano (la página no escribe repetidas).

**Observación (previa, no de este cambio)**: a 1280×720 la ficha se corta por la
derecha («Disparos (0 = cuerpo a cuer…», el botón de la tercera acción); el diff
de `arena.css` solo toca las filas de `#montaje`, no sus columnas.

### Workarounds usados

- **`localStorage` bloqueado con `addInitScript`** que redefine `window.localStorage`
  para lanzar `SecurityError`. Simula una ventana con datos bloqueados; no le
  cambia nada a quien juega.
- **La geometría del clic sale de `tableroPara`/`centroHex`**, como en la vuelta 1.
- **Sondas del núcleo con posiciones puestas a mano** (`s.hex = …`) sobre una
  batalla de `batallaDeArena`: fuerzan la situación (troll junto a su puerta,
  cargas al azar) para preguntar a `movableFrom`/`casillasDeCarga`/`distanciaHasta`;
  el flujo real de la misma regla se ve en el navegador y en el fuzz, que no fuerza
  nada.

### No probado

- `pnpm verify:lento`, `pnpm qa`, `pnpm capturas`: no tocan nada de lo cambiado
  en esta vuelta (núcleo de batalla, borrador y editor de la arena), el ingeniero
  da la lenta en verde (4 327) y CI la corre.
- El volador atacante pulsando la puerta en el navegador (vuelta 2): cubierto por
  test y por la salida del ingeniero, no repetido.

### Veredicto (vuelta 2)

**Apto.** M1 queda cerrado (0 colas sobre lo cerrado en 1 174 batallas nuevas y en
208 cargas de grandes), y M2, M3, M4, M6 y M7 se cumplen en el navegador y en el
núcleo; la derecha se juega a mano con clics. `pnpm verify` en verde y `pnpm banco`
con el mismo hash. Queda M8, menor y solo con un borrador retocado a mano.
