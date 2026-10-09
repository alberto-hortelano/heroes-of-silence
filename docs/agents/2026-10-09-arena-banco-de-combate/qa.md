# QA: la arena como banco de combate

Rama `combate`, cambios sin commitear, 09-10-2026.

Cómo se probó:
- un vite propio en el puerto 3291, comprobado libre con `ss -ltnp`, matado por su grupo y comprobado libre después;
- Chromium de Playwright sin pantalla;
- un guion propio que juega la arena con clics reales. El guion lee la previsión **de la barra de la página** y la compara con el daño que aplica el motor. Para saber dónde pulsar usa un espejo `SesionDeArena`, y se comprueba que el espejo y la página juegan la misma pelea: la unidad activa, la ronda y la casilla «desde» que dice la barra.

Las capturas son `capturas/qa-*`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 6 | `pnpm verify` | ✅ | exit 0 · 102 ficheros · 2577 passed, 12 skipped |
| 6 | `pnpm banco`, ancla igual | ✅ | «ancla: igual — las 200 partidas se juegan hexágono a hexágono igual», sin terminar 0/200 |
| 6 | `pnpm capturas` | ✅ | exit 0 en 347 s, «sin errores en consola». Ejercita la caballería del catálogo y un héroe que lanza la Flecha mágica: «40 de daño, como decía la previsión» |
| 6 | `pnpm verify:lento` | ⚠️ | no lo corrí (ver «No probado») |
| — | `pnpm qa` (servidor, WebSocket y MCP) | ✅ | exit 0 · 65 veredictos, 65 entraron, 0 descartados · 1 mapa, 6 turnos, 58 decisiones de batalla, 1 ascenso |
| 1 | Catálogo montable, con sello en la lista y en la ficha | ✅ | Las 21 criaturas, mejoradas incluidas, llevan el sello «catálogo», sus cifras y sus rasgos (`qa-04`) |
| 1 | Catálogo y borrador mezclados en una pelea | ✅ | Guerrero con escudo (borrador) + Piquero (catálogo) + héroe, contra Esqueleto guerrero (borrador) + Zombi (catálogo) (`qa-04`, `qa-05`) |
| 1 | Editar el catálogo no escribe en `creatures.json` y se dice | ✅ | Piquero con A 20: sello «catálogo · prueba que no se guarda» y barra «prueba que no se guarda en data/creatures.json» (`qa-03`). En la pelea, «Ataque / Defensa 20 / 9». Tras «Guardar», el sha256 de `creatures.json` es el mismo (`701db09e…`) y el borrador queda con «0 unidades». Al recargar, Piquero vuelve a A 5 |
| 2 | Héroe por bando con A/D/P/C editables y valores efectivos | ✅ | Héroe con A 12 y D 7: cuerpo A 15 · D 10 (equipo base +3); maná «0 (10 × Conocimiento)» con C 0 y 100 con C 10; P 4 da 4 rondas, Flecha 50 y Rayo 125. En la pelea, el héroe con A 8 pega con «ataque 11 contra defensa 6» |
| 2 | Cifras raras rechazadas | ✅ | −3, 100, campo vacío, P 0 y 2.5 se rechazan con su motivo en la barra («el ataque tiene que ser 0 o más, y es -3», etc.) |
| 3 / D4 | Figura del héroe elegida entre las hojas de héroe | ✅ | 17 hojas de héroe más la genérica. «Nigromante (héroe)» se pinta en la ficha y en el tablero (`qa-04`, `qa-05`) |
| 3 | Libro y lanzamiento con maná y una vez por ronda | ✅ | Con C 0, los siete botones salen apagados con «maná insuficiente: cuesta 3 y quedan 0» (motivo de `castBlocker`). Tras lanzar, «el héroe ya lanzó un hechizo esta ronda». La Maldición sale apagada contra no-muertos |
| 3 | La IA lanza | ✅ | El héroe IA de la derecha lanza Rayo y Flecha mágica (registro de las semillas 9 y 11) |
| 4 | Los seis interruptores, en la URL y reproducibles | ✅ | Por clic, `?seed=21&reglas=tirador,bendicion`. Dos cargas de esa URL con el mismo montaje, todo IA, dan un parte idéntico carácter a carácter (1703 caracteres). Con las reglas del juego el parte sale distinto. Por URL y por clic, la misma pelea |
| 4 | (f) el A/D del héroe en la tropa | ✅ | Campeón «10 / 9 (en la pelea, 18 / 11)» con un héroe de A 8 y D 2. Previsión: «ataque 18 contra defensa 6, con lo de sus héroes» |
| 4 | (e) con fheroes2 | ✅ | «Bendición: daño máximo» y «Maldición: daño mínimo» en la ficha y la previsión. El golpe bendito cae en 16, la horquilla prevista de un solo valor |
| 4 | Citas de fheroes2 extraídas | ✅ | Bajé `9754feff`. `battle_troop.cpp` L519-544 (melé del tirador /2), L579-585 (fórmula: 0,1·min(r,20) y 0,05·max(r,−16)), L1180-1193 (Bless y Curse se sustituyen) y L308-310 (moral 1/12, con el perdón de la IA, que no se copia, D2); `army_troop.cpp` L158-166 (el A/D del comandante). Coinciden. `GetDefense` no tiene bono por defender, así que (d) es «sin bonificación» |
| 4 | Juego, servidor y agente no encienden reglas | ✅ hoy, guardia con hueco | Nadie de `state/`, `server/`, `contract/` ni `client/main.ts` monta con reglas, y `qa` y `banco` siguen igual. El guardia muerde con `crearBatallaConReglas` en `director.ts`, pero **no con `batallaDeArena`** (H3) |
| 5 | Previsión = daño real (golpe, contraataque, disparo, hechizo) | ✅ | 37 jugadas con clics en 5 peleas (semillas 4, 9 y 12; reglas del juego, las seis en fheroes2, y heroe+bendicion), 0 fallos. Por ejemplo: «Daño 3–7 … Contraataque: 2–3» dio 5 y 3; la doble del paladín «23–46 por golpe» dio 30; «Rayo: 100 de daño» dio 100 |
| 5 | Modificadores en la cuenta | ✅ | Salen la distancia («disparo a 9 casillas, más de 5 ×0,5»), el A/D con la fórmula, los héroes, la Bendición/Maldición de fheroes2, «golpes» y las reglas en curso. La carga, el defender y el tirador pegado están en el código (`applyModifiers`); no los vi en pantalla |
| 5 | Previsión en la batalla del juego | ✅ golpe / ⚠️ hechizo | En `capturas`: «Golpearías desde (7,4). Daño 2–5: caería 1 y no le quedaría nada. Sin contraataque…» (`qa-09`). El hechizo del juego no se apunta sobre un objetivo en ninguna captura (`qa-10`). Es la misma escena que la arena, donde sí lo probé |
| 6 | Sin errores en consola | ✅ | 0 errores en todas mis pasadas. Sale un `warn` conocido y anterior al cambio: «lich dispara y su arte … no tiene clip shoot» (`anim.ts`) |

## Hallazgos

### Importantes

**H1. Cuando muere un héroe, la arena dice «Sin vencedor en 100 rondas: por tiempo».**
- Pasos:
  1. Abre `/arena/?seed=11`.
  2. Pon un Piquero del catálogo en cada lado y un héroe por defecto en cada lado, todo en IA.
  3. Pulsa Luchar.
- Lo que pasa: en la ronda 1 el héroe izquierdo lanza Rayo (50) sobre el derecho y la pelea acaba. El panel dice «Sin vencedor en 100 rondas: por tiempo, gana quien tiene más unidades en pie. Gana el bando izquierdo.» (`qa-08`).
- Lo que esperaba: «Gana el bando izquierdo» porque cayó el héroe del otro.
- Causa: `finalDeArena` (`src/core/arena.ts`) entiende «quedan unidades en los dos bandos» como «se acabaron las rondas». Con un héroe en el tablero la derrota llega por `bandoVencido`, aunque queden unidades. Antes no pasaba porque la arena no tenía héroes. Quien afina el combate lee un motivo falso del final.

**H2. Con dos héroes por defecto, la pelea se decide en la ronda 1 con un Rayo.**
- El héroe por defecto lleva todo el libro y Poder 1. Su Rayo hace 50, y el cuerpo del héroe tiene 50 PV. La IA apunta al héroe, y la muerte del héroe cierra la batalla. La misma receta de H1 lo reproduce, y también la semilla 9 con el héroe izquierdo en «Yo».
- No es un fallo del código: es la regla del juego («Rayo», héroe en el tablero, perder el héroe es perder) con el libro completo que pide el criterio 3.
- Pero el banco no sirve para comparar reglas con héroes salvo que se quite el Rayo del libro o se suba la vida del héroe. Lo dejo para que decida el usuario.

**H3. El guardia «solo la arena cambia las reglas» tiene un hueco.**
- Pasos:
  1. Añade a `src/server/director.ts` una llamada a `batallaDeArena({ …, reglas: { tirador: 'fheroes2', … } }, rng)`.
  2. Corre `test/invariantes.test.ts`.
- Lo que pasa: 23/23 en verde y el typecheck limpio. Lo probé y lo restauré.
- Las únicas «puertas» que vigila son `crearBatallaConReglas` y `reglasDeLaURL`. Pero `batallaDeArena` (exportada de `core/arena.ts`) acepta reglas cualesquiera, y un literal de `ReglasDeBatalla` también enciende reglas: `tools/qa/capturas.ts` lo hace con `REGLAS_DEL_BANCO` y el guardia no lo ve.
- Hoy ningún camino del juego, del servidor ni del agente lo usa, así que el criterio se cumple. El fallo es que el guardia no lo garantiza.

### Menores

**H4. Una regla repetida en la URL se pierde sin avisar.**
- `?seed=5&reglas=tirador&reglas=bendicion` enciende solo el tirador, sin aviso, y al luchar la URL se reescribe a `reglas=tirador`.
- Lo demás raro se rechaza diciéndolo y se pelea con las reglas del juego: `foo`, `TIRADOR`, `tirador,tirador`, `tirador,`, `,` y `tirador:nuestra`. Los espacios y `%2C` se aceptan.

**H5. La ficha del héroe dice «1 rondas».**
- Con Poder 1 sale «velocidad +2, 1 rondas», «suerte +1, 1 rondas», etc. (`qa-04`, `paneles.ts:471`).
- `implementacion.md` dice que «ya estaba antes». No es así: esa línea es nueva en este diff. La fila de «Duración» sí lo hace bien.

**H6. El montaje no va en la URL.**
- La URL reproduce la semilla y las reglas, pero no las unidades, el héroe ni las pruebas del catálogo. Las pruebas del catálogo, además, se pierden al recargar.
- Es lo que pide el criterio («los interruptores junto con la semilla»). Pero «copia la barra y repites la pelea» solo vale si el montaje se vuelve a hacer a mano.

## Workarounds usados

- **Un espejo `SesionDeArena` para saber dónde pulsar** (como `pnpm capturas`). La previsión y el daño se leen de la página y del registro del motor. Cuando la barra decía un «desde» distinto del que calculaba el espejo, mandó el de la barra, porque es lo que pulsa quien juega. No afecta al usuario.
- **No moví al héroe propio en el guion** para que durara. Es una pauta de juego, no un obstáculo.
- **«Guardar» creó `data/borradores/unidades.json`**, que no existía, y lo borré después. El repo queda como estaba.

## No probado

- **`pnpm verify:lento`**: no lo corrí por tiempo. El ingeniero lo da en verde, pero tuvo un timeout por carga en `sendas-sobre-agua`. Las 64 combinaciones × 300 semillas de la previsión solo corren ahí.
- **Las frecuencias de (c) moral baja y de (d) defender en la página**: son probabilísticas y las cubre `reglas-de-batalla.test.ts`, que pasa. En pantalla no vi «(defiende)», ni una carga, ni el tirador pegado en la cuenta de la previsión.
- **La previsión de un hechizo apuntado en la batalla del juego**: solo se probó el golpe. El hechizo lo probé en la arena, que usa la misma escena.
- **La arena con un borrador guardado de verdad**: esta rama no tiene ninguno, así que las hojas salen con cifras por defecto.

## Veredicto

**Apto con reservas.**

Lo que pidió el usuario funciona en el flujo real:
- el catálogo y el borrador mezclados;
- el héroe con su hoja y sus cifras, que actúan;
- la magia propia y la de la IA;
- los seis interruptores, que la URL reproduce;
- la previsión, igual al daño en 37 de 37 jugadas;
- el banco con el ancla igual.

Antes de cerrar hay que corregir:
- H1, porque el final miente sobre por qué se ganó;
- H3, porque el guardia no protege lo que dice.

H2 es una decisión del usuario sobre cómo usar el banco con héroes.

## Vuelta 2

Rama `combate`, sin commitear, 09-10-2026. Solo los criterios afectados por H1, H3, H4, H5 y H6, más la espera nueva de `capturas.ts`.

Cómo se probó:
- un vite propio en `--port 3297 --strictPort`, libre antes según `ss -ltnp`;
- el puerto era de un proceso con `cwd` en este worktree;
- al final lo maté por su grupo y `ss` lo dio libre;
- Chromium de Playwright sin pantalla, con dos guiones propios fuera del repo;
- `git status` queda igual que al empezar (no se creó `data/borradores/`).

Las capturas son `capturas/v2-*`.

Presupuesto de pruebas: `verify` y `banco`, una vez cada uno. No repetí `verify:lento`, `capturas` ni `qa`: nada cambió desde el verde del ingeniero y cito el suyo (`implementacion.md`, «Verificación ejecutada»).

| Criterio | Estado | Evidencia |
|---|---|---|
| `pnpm verify` | ✅ | exit 0 · 102 ficheros · 2581 passed, 12 skipped |
| `pnpm banco`, ancla igual | ✅ | «ancla: igual — las 200 partidas se juegan hexágono a hexágono igual», sin terminar 0/200, exit 0 |
| H1: el final cuando cae un héroe | ✅ | Receta de la vuelta 1 (`/arena/?seed=11`, piquero y héroe por defecto en cada lado, todo IA): «Gana el bando izquierdo en la ronda 1: cayó el héroe del bando derecho.» (`v2-h1-receta-s11`). Igual con las semillas 9 y 23. Sin héroes (piquero contra arquero, s11): «… en la ronda 4: el bando derecho no tiene a nadie en pie.». Héroe solo contra un zombi (s4): «… no tiene a nadie en pie.». En la ida y vuelta de H6, «… ronda 4: cayó el héroe del bando izquierdo.» |
| H3: el guardia de las reglas | ❌ hueco | Muerde con lo que probó el ingeniero, pero hay dos vías que no ve. Las dos dejan `tsc` limpio y 106/106 en verde en `invariantes`, `arena` y `reglas-de-batalla`. Ver H3b |
| H4: `?reglas` y los demás parámetros repetidos | ✅ | Se rechazan diciéndolo: `reglas=tirador&reglas=bendicion`, `reglas=&reglas=`, `reglas=tirador&reglas=tirador`, `seed=5&seed=5` y `montaje` dos veces. Por ejemplo: ««reglas» va 2 veces en la URL («tirador», «bendicion»): pon uno solo, con las reglas separadas por comas (reglas=tirador,bendicion) — se pelea con las reglas del juego.». Con `seed` o `reglas` repetidas en un enlace de pelea, no se monta nada y se dice: «la semilla o las reglas del enlace no valen» |
| H5: «1 ronda» | ✅ | Ficha del héroe con Poder 1: «1 ronda (su Poder)», «velocidad +2, 1 ronda», «suerte −1, 1 ronda»… Con Poder 2: «2 rondas» en todas. No sale «1 rondas» en ninguna (`v2-h5-ficha`) |
| H6: ida y vuelta con un montaje rico | ✅ | Montaje en `?seed=31&reglas=ataqueDefensa,moralBaja,defender,heroe` (ver detalle abajo). Copiado: 1948 caracteres, el portapapeles es igual al campo y la barra queda en `?seed=31&reglas=…`. Abierto en otra página: «Montada la pelea del enlace (semilla 31): pulsa Luchar. Las cifras de Guerrero con escudo, Orko con dos armas son las del enlace, sin guardar.», escena `montaje` (no lucha sola), y los dos bandos con el mismo texto (`v2-01`, `v2-03`). Las dos peleas, con las unidades «Yo» jugadas igual (13 jugadas), dan el mismo parte carácter a carácter (2347 caracteres) |
| H6: enlaces rotos o manipulados | ✅ | Ninguno monta a medias: 0 puestos y el motivo en la barra. Ver la lista abajo |
| `conLosIconosDeLaBarra` (capturas.ts) | ✅ no esconde un fallo | Ver abajo |
| Consola | ✅ | 0 errores en las dos pasadas. El único es el 431 de la URL de 40 KB (abajo) |

**Detalle del montaje de la ida y vuelta.**
- Izquierda:
  - dos hojas «Guerrero con escudo» con A 13 y D 4 sin guardar, una en Yo y otra en IA;
  - el Piquero del catálogo con una prueba de A 9 y D 2, en Yo;
  - el Arquero del catálogo sin prueba, en Yo;
  - el héroe con A 6, P 4 y C 3, una figura de hoja y el libro sin Rayo ni Bendición, en Yo.
- Derecha:
  - el Orko con PV 33 sin guardar;
  - el Esqueleto con una prueba de A 7;
  - el Zombi;
  - el héroe con A 3, P 2 y C 5, otra figura y el libro sin Rayo ni Prisa;
  - todo en IA.

**Enlaces manipulados.** Cada uno sale de editar el JSON del enlace bueno. Lo que la barra dice:

| Manipulación | Barra |
|---|---|
| Hoja inexistente | «no hay ninguna hoja «no-existe» en assets/unidades/» |
| Ataque de unidad −1 | «el ataque tiene que ser 0 o más, y es -1» |
| Prueba con un campo ajeno | ««foo» no se cambia en la arena; valen attack, …» |
| `__proto__` en las pruebas | «criatura desconocida: "__proto__"» |
| Héroe con A 100 | «va hasta 99, y es 100» |
| Héroe con P 0 | «tiene que ser 1 o más» |
| Figura inventada | «no es una hoja de héroe» |
| Hechizo repetido | «está dos veces» |
| Ocho puestos en un bando | «lleva 9 y caben 7» |
| Siete puestos más el héroe | «lleva 8 y caben 7» |
| `ia: "si"` | «tiene que ser true o false» |
| Nombre de unidad hecho de espacios | «tiene que ser un texto no vacío» |
| `montaje=` vacío | «no se puede leer … puede que se cortara al copiarlo» |
| `montaje={}` | «falta «v»» |
| `seed=abc` | «la semilla o las reglas del enlace no valen» |

Y lo que se acepta:
- **Se aceptan, y es coherente con la ficha:** un ataque de unidad de 1 000 000 y una prueba del catálogo con A 999. La ficha tampoco pone tope a la tropa; solo el héroe va hasta 99.
- **Un nombre de héroe con HTML** (`<img onerror>`) sale escapado: no se ejecuta.
- **Un nombre de 3000 caracteres** monta y se corta con «…», sin scroll horizontal (`v2-05`).

**`conLosIconosDeLaBarra`.**
- Solo espera en las dos páginas que miden la caja del lienzo (`cajaDeEscritorio` y `cajaDeMovil`). Esas páginas no llevan `sinImagenes`, así que la espera termina.
- Las partidas de verdad siguen comparando su caja con la medida en `abrir` (`esperada`), sin esa espera y después de pintar el suelo. Si la barra cambiara de alto allí, `capturas` seguiría saliendo en rojo.
- Lo único que la espera quita de en medio es el salto de 1,4 a 3,4 px de la barra al llegar los iconos. Es anterior a esta tarea: el código de las muestras de color no está en este diff.
- La espera da por buenas las imágenes rotas (`complete` también es `true` con un 404). Pero ese 404 lo caza `vigilarConsola` como error de consola.

### Hallazgos de la vuelta 2

**H3b (importante). El guardia «solo la arena cambia las reglas» sigue sin ver dos vías.** Las dos compilan y dejan el guardia en verde.
- **Vía 1: un envoltorio con otro nombre.**
  - Pasos: al final de `src/core/arena.ts`, añade `export function peleaLibre(montaje: MontajeDeArena, rng: Rng): BattleState { return batallaDeArena(montaje, rng); }`.
  - En `src/server/director.ts`, añade `import { peleaLibre } from '@core/arena.js'` y una función que la llama.
  - Corre `pnpm vitest run test/invariantes.test.ts -t "solo la arena"`: sale verde.
  - Causa: `core/arena.ts` y `core/battle/` tienen permiso en todo el fichero. Cualquier función que exporten y llame a una puerta es una puerta nueva que el guardia no nombra. Es la misma especie de hueco que H3.
- **Vía 2: las reglas por spread.**
  - Pasos: en `src/core/state/game.ts`, añade `export function batallaDelAgente(a: BattleSide, d: BattleSide, rng: Rng, otras: BattleState['reglas']): BattleState { return { ...createBattle(a, d, rng), reglas: otras }; }`.
  - Corre el mismo test: sale verde.
  - El ingeniero lo da como «no cubierto». Lo confirmo.
- Las dos se restauraron byte a byte (`sha256sum -c`: OK).
- Hoy ningún camino del juego, del servidor ni del agente usa ninguna de las dos. El criterio se cumple, pero el guardia no lo garantiza.
- Lo que esperaba: que las puertas fueran los **módulos** y no los nombres, y que nada fuera de `battle/` escribiera `reglas` en un `BattleState`.
  - Por ejemplo, que fuera de la arena, `session.ts` y `capturas` no se pueda importar nada de `core/arena.ts`.
  - Y que fuera de `battle/` una clave `reglas:` sobre un estado de batalla sea rojo.

**Menor (sin arreglo pedido).**
- **Un nombre larguísimo da una URL que el servidor no sirve.** Con 40 KB, vite contesta 431 y la página no carga: no hay barra que lo diga. Con los nombres normales el enlace mide unos 2 KB, así que solo se llega ahí escribiendo a propósito un nombre de miles de caracteres. Ni el campo del nombre ni el formato del enlace tienen tope.
- **Un enlace sin `seed` monta, y Luchar sortea la semilla.** La barra no avisa de que esa pelea no se repetirá. Solo pasa con un enlace editado a mano: «Copiar» siempre pone la semilla.

### Workarounds de la vuelta 2

- **Las unidades «Yo» las jugué con Defender (o Esperar si Defender no estaba) en las dos peleas.** En el primer intento los partes salieron distintos. La causa era mi guion: pulsaba el botón que encontraba habilitado en el momento del sondeo, y en una pelea pulsó Esperar y en la otra Defender. Con una pausa de 400 ms antes de decidir, las 13 jugadas son las mismas y el parte es idéntico. No afecta al usuario: quien juega decide con calma.

### No probado en la vuelta 2

- **`verify:lento`, `capturas` y `qa`.** Por la regla del presupuesto, cito el verde del ingeniero, posterior a sus arreglos y sin cambios desde entonces.
- **La previsión del hechizo en la batalla del juego.** No la repetí. La cubre la jugada 2 de `capturas` del ingeniero (`desktop-06b-batalla-prevision-hechizo.png`).

### Veredicto de la vuelta 2

**Apto con reservas.**
- H1, H4, H5 y H6 están corregidos y probados en el flujo real.
- La espera de `capturas` no esconde ningún fallo.
- La reserva es H3b: el guardia ya muerde con `batallaDeArena`, pero una puerta nueva con otro nombre en `core/arena.ts`, o unas reglas puestas con un spread, siguen en verde. Si el guardia tiene que **garantizar** el criterio, hay que cerrar H3b antes de cerrar la tarea. Hoy el criterio se cumple.

## Vuelta 3 (coordinador, 09-10-2026): el guardia de H3, por módulos

Los dos huecos de la vuelta 2 se cierran en `test/invariantes.test.ts` («solo la arena cambia las reglas de la batalla»), que ahora vigila también:
- **los módulos:** solo la página de la arena, `tools/arena`, el taller, la sesión y `pnpm capturas` importan de `core/arena.ts`;
- **los valores importados de allí:** en la sesión y en `capturas.ts` solo se usan dentro de sus declaraciones con permiso (los tipos no cuentan);
- **las escrituras:** fuera del motor y la arena, nadie escribe `reglas:`, `{ …, reglas }` ni `.reglas =`.

Visto morder por separado y restaurado byte a byte (`cmp`):
- un envoltorio de `batallaDeArena` importado en `server/director.ts`;
- un valor de la arena con alias usado en `Session`;
- `{ ...b, reglas: otras }` en `state/game.ts`.

La primera prueba no mordía con `../core/arena.js` (el patrón solo conocía `src/core/` y `@core/`); se corrigió y se volvió a ver rojo.

`pnpm verify` en verde (2581). Desde el verde completo del ingeniero (`verify:lento`, `capturas`, `qa`) y el `banco` de la vuelta 2 solo ha cambiado este test, así que no se repiten.

**Veredicto: APTO.** Quedan anotados, sin arreglo pedido, la respuesta 431 de vite con un enlace de 40 KB y el enlace sin `seed`, que sortea la semilla sin avisar.
