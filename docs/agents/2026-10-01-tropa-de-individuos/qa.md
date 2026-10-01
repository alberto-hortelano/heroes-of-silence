# QA — fase 1a: la tropa de individuos y el liderazgo

Alcance validado: solo **1a**. Son los criterios 1, 2, 3, 7 y 8, y el 9 y el 10 en lo que toca a 1a, según «Decisiones del usuario» en `requisitos.md`. El héroe en el tablero, la rendición y la vuelta a la base son de 1b: no se evalúan aquí. Lo aplazado en `hallazgos-simplify.md` no cuenta como hallazgo. El cliente viejo se evalúa solo en una cosa: que la partida avance, se pueda reclutar y se jueguen batallas de varios individuos sin errores.

Árbol validado: el diff sin commitear que había el 01-10-2026 a las 08:14, sobre `d9a96a7`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | El ejército es una lista de individuos, cada uno de 1. Desaparecen el tope de 5 y la fusión. Reclutar N añade N | ✅ | `grep` de `MAX_ARMY_SLOTS\|addToArmy\|armySize\|pruneArmy\|null, null, null` en `src tools test`: **0 apariciones**. Script adversarial, semilla 13: reclutar 2 campesinos deja 9 individuos `{creature}`. En el navegador (`?seed=13`) se pulsa «+1» dos veces y el panel pasa de «Ejército (7)», con 5 campesinos, a «Ejército (9)», con 7. |
| 2 | Hay coste de liderazgo en los datos y `leadership` en el héroe. Pasarse **lanza** con la frase. Las cifras son provisionales y hay regla por nivel | ✅ | `data/creatures.json`: 2, 3, 4, 6, 8 y 10 por nivel. `data/liderazgo.json`: base 20, +5 por nivel, máximo 50, guarnición 20. Con la semilla 13 se recluta justo hasta el tope (16 → 20/20, oro 8000 → 7960). Pedir uno más lanza `no se puede reclutar: no cabe: el ejército ocupa 20 de 20 de liderazgo y 1 × Campesino pide 2`. Repetirlo el mismo día da la misma frase, y ni el oro ni las criaturas disponibles cambian. Con 0 y con −1 sale «cantidad no válida». A la guarnición sin héroe se reclutan 10 campesinos (20/20), y el siguiente lanza diciendo «la guarnición ocupa 20 de 20». Con «Todo» y 12 disponibles, la barra del navegador dice `…ocupa 16 de 20 de liderazgo y 12 × Campesino piden 24; caben 2` y el oro no se toca. |
| 2b | Recibir tropa por encima del liderazgo | ✅ (con interpretación) | `takeGarrison` no lanza: se lleva lo que cabe y deja el resto, como dice el plan. Comprobado con un movimiento real de la semilla 21: un héroe con 18/20 entra en un castillo cuya guarnición tiene 4 campesinos y 3 arqueros. Sale con 20/20, y en la guarnición quedan 3 campesinos y 3 arqueros. Ningún otro camino del juego mete tropa en un ejército: los supervivientes de una batalla son siempre un subconjunto de los que entraron, y al capturar un castillo la guarnición se vacía. |
| 3 | `createBattle` coloca a todos sin solaparlos, o lanza si no caben | ✅ | Fuzz propio de 2000 parejas de bandos al azar, de 0 a 11 dragones óseos (la única criatura grande) y de 0 a 30 pequeñas mezcladas: **470 se despliegan sin repetir ningún hex ocupado, cola incluida, y sin salirse del tablero; 1517 lanzan, y todas porque `despliegueBlocker` dice que no caben; 0 casos mal**. Los ejércitos de 50 de liderazgo de cada una de las 21 criaturas contra 27 campesinos se despliegan y se resuelven. En el navegador hay batallas de 7 contra 7 y de 7 contra 14 individuos: el monstruo de 14 sale en dos columnas, cada unidad con su «1», sin solaparse. |
| 7 | Los monstruos son individuos. Ninguno trae más de los que caben en su bando, y lo respetan el generador y `validateMapPlan` | ✅ | `validateMapPlan`: 27 campesinos aceptado y 28 rechazado con «como mucho 27»; 9 dragones aceptado y 10 rechazado con «como mucho 9». Con el plan de 27 se juega `newGame`. El generador sortea entre 4 y 14 (`generate.ts:447`), y `game.test` lo comprueba con 60 semillas. Ver el hallazgo M2, sobre `count` ≤ 0 o decimal. |
| 8 | Todos los lectores conocen la tropa nueva, también un `member`, y un héroe con tropa pasa de día | ✅ | Se jugaron tres partidas IA contra IA (semillas 3, 7 y 11, tope de 40 días) con un personaje `aren` metido en el ejército del jugador 0, pasando por `playAiGame` y por `serializeAdventureTurn` de los dos jugadores. Las tres terminan (`winner 1`, días 9, 7 y 8) sin lanzar, y siempre dentro del liderazgo. `tropa.test.ts` cubre que se pasa de día con el personaje vivo, `slowestSpeed`, `armyPower` y `armyView`. `ws-server.ts` usa `troopSummary`, y `pnpm qa` imprime el resumen final («2×Arquero»). `panels.ts` agrupa con `troopSummary`, y en el navegador sale «Campesino 7 / Arquero ↑ 2». |
| 9 | El juego se juega entero: barrido 0 y navegador | ✅ (en lo que toca a 1a) | `npx tsx tools/qa/barrido-semillas.ts` da `sin terminar: 0/40`, con peor caso de 10 rondas. Navegador con `?seed=13`: entrar en el castillo, reclutar hasta el tope, ver el rechazo, batalla contra 7 resuelta (exp 7), batalla contra 14 resuelta (vuelve con 4: la tropa muerta se pierde), pasar turnos con Espacio hasta el día 6 y «Fin de la partida» por derrota. **Consola sin errores.** La derrota que devuelve al héroe a la base es de 1b. |
| 10 | El banco se re-ancla a propósito, `verify` y `qa` en verde y el contrato al día | ✅ | `pnpm banco`: sha `54a035f0ae024a8e…bd43`, «ancla: igual», 45 128 líneas, 0/200 sin terminar, 2665 ms, autoResolve 172 ms. `pnpm verify`: **493/493**, 8,8 s. `pnpm qa`: exit 0, 3,1 s, 33 veredictos que entran todos, las 6 consultas, 29 decisiones de batalla. La prosa del contrato sobre el liderazgo cuadra con los datos (el ejemplo «2 × Piquero piden 8» lo confirman 4 de liderazgo × 2). `surrender` es de 1b. |
| — | Determinismo del BFS nuevo (`reachable` y `neighbours` memorizada) | ✅ | Diferencial propio contra el `board.ts` de `HEAD`, extraído al scratchpad: **3000 tableros al azar** (densidad de obstáculos entre 0 y 60 %, origen bloqueado incluido, de 0 a 12 pasos) comparando el `Map` entero en orden (clave, pasos, hex), más `neighbours` en las 143 casillas de −1 a 11 × −1 a 9, fuera del tablero incluido. **0 diferencias.** Nadie muta un `Hex` devuelto (`grep` de asignaciones a `.col` o `.row`: 0), así que compartir la tabla es seguro. Con la misma semilla, `autoResolve` da el mismo resultado en 9 de 9 parejas repetidas. |

## Hallazgos

No hay ninguno bloqueante.

**Importantes** (no bloquean 1a, pero hay que tenerlos en cuenta al abrir 1b):

- **I1. El equilibrio se vuelca: el caballero gana el 93 % con control de esquina** (antes, 16,25 %). Lo midió y lo publicó el ingeniero, y no lo he vuelto a medir. Como la economía la define el usuario, no es un fallo de 1a, pero una partida de prueba tiene hoy un resultado casi fijado por la facción.
- **I2. La Flecha mágica casi no se lanza contra individuos**: `spellValue` acota el daño a la vida de uno solo. Lo documenta `implementacion.md`. Choca de frente con el criterio 4 de 1b («su magia sigue funcionando»), así que conviene medirlo al empezar 1b.

**Menores:**

- **M1. En el cliente viejo, «Todo» no respeta el liderazgo.** Pide todo lo disponible y el núcleo lo rechaza. Para reproducirlo: `?seed=13`, entrar en Valdeluz y pulsar «Todo» con 12 campesinos disponibles. La barra dice «caben 2», pero el botón no recluta nada, cuando quien juega esperaba que reclutara los 2 que caben. Es deliberado por la directiva del coordinador (el cliente se sustituye), así que lo dejo anotado y no lo juzgo.
- **M2. `validateMapPlan` acepta un monstruo con `count` 0, negativo o decimal** (`peasant` 0, −3 y 1,5 se aceptan, con la semilla 5 y el primer monstruo del plan). El agente no puede llegar ahí, porque zod exige `int().positive()`, y el generador no lo produce. Es anterior a este cambio. Pero `validateMapPlan` se presenta como la puerta única de los dos productores, y con individuos un 1,5 pasa a ser 1 en silencio (`Array.from({length: 1.5})`).
- **M3. `CLAUDE.md` tiene cifras desfasadas**: 421 tests (hoy 493), banco en 1,7 s (hoy 2,7 s), «Slots de ejército 5» en la tabla de reglas, y las cifras de morada 5 y del ganador. El ingeniero lo dejó dicho para el coordinador.

## Workarounds usados

- **Clics por coordenadas y capturas en el navegador:** la extensión de Chrome daba timeouts y capturas en mosaico, y el primer tab cambió de tamaño de viewport a 2341×1231. Abrí un tab nuevo y repetí la captura cuando hizo falta. Leí el estado con `get_page_text` después de una captura, porque el cliente solo repinta con la pestaña al frente, como ya avisó el ingeniero. Es un problema de la herramienta, no del juego: no afecta a quien juega.
- **Un `dispatchEvent` sintético sobre el canvas** en el primer tab no hizo nada. No lo usé como evidencia: todo lo de arriba sale de clics y teclas reales.
- Los scripts adversariales colocan al héroe a mano dentro del castillo (`hero.at = town.at`) o le dan 2000 de movimiento, para llegar al caso sin jugar varios días. El caso de `takeGarrison` sí pasa por `move_hero` real. No afecta a quien juega: en el navegador se llegó al castillo andando.

## No probado

- **El espectador (`pnpm mirar`) en el navegador.** Lo cubren el typecheck y `espectador.test.ts`, y solo pierde dos campos que no leía.
- **`tools/qa/enfrentamiento.ts`.** No cambia cómo decide la IA de batalla, y tarda 11,8 s.
- **Un agente real que pida un `recruit` por encima del tope.** El camino es el genérico de descarte con motivo y la prosa lo anuncia, pero `pnpm qa` no llega a ejercerlo: entran 33 de 33 y no hay ningún rechazo.
- **Que ningún `recruited` supere el tope a mitad de partida en las 200 del banco.** No lo comprobé de forma independiente. Lo garantiza la construcción, porque `recruit` lanza antes de cobrar y una IA que se pasara reventaría la partida, y el banco da 0/200 sin terminar.

## Veredicto

**Apto con reservas.** Los criterios 1, 2, 3, 7 y 8 se cumplen, con evidencia en flujo real y en una pasada adversarial. Las reservas son I1 e I2: no rompen 1a, pero condicionan 1b y cualquier partida de prueba.
