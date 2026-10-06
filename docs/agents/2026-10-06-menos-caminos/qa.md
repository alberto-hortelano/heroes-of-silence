# QA: menos caminos (#149, variante B + vuelta de /simplify)

Validado el 06-10-2026 sobre el diff sin commitear encima de `5cdd636` (el «antes»).
El «antes» se ha medido en una copia de `HEAD` hecha con `git archive` en el scratchpad.
Siguiendo el criterio del usuario para esta fase, las medidas usan las **semillas 1-10** y hay pocas capturas.
`pnpm capturas` se pasó **una vez** en el repo.

## Criterios

| # | Criterio (requisitos y encargo) | Estado | Evidencia |
|---|---|---|---|
| 1 | No quedan cuadrados ni anillos de caminos inútiles (s7, en el acantilado, y otras dos semillas) | ✅ cumple, con una reserva menor (H3) | Taller `pnpm taller escenario 7 2 5`: en las tres, «sprites sobre la senda 0 · murallas partidas 0». La zona del acantilado de s7 ya no tiene rombos: `capturas/s7-acantilado-simplify.jpg` coincide con mi render, `capturas-qa/taller-s7.jpg`. En s2 y s5 (`capturas-qa/taller-s2.jpg`, `taller-s5.jpg`) no hay ningún cuadrado pequeño. μ con las aristas del pintor, semillas 1-10, en 34×34: **antes 16-26 por mapa, ahora 5-9**. Dentro de una región: antes 0-6, ahora 0-4. Queda un anillo grande que atraviesa tres regiones (H3). |
| 2a | Cada ciudad, mina y pueblo está en la red | ✅ | `auditarMapaDenso` (la auditoría nueva) sobre 30 mapas: semillas 1-10 en 28, 34 y 48. **0 fallos**. Sobre los mapas de `HEAD`, la misma auditoría da 141, 88 y 303 fallos, así que distingue un generador del otro. En el ASCII de s7 y s5, todas las M, V y C están sobre camino. |
| 2b | Exactamente un cruce con camino por pareja de vecinas, y la red del mapa de una pieza | ✅ | Lo comprueba la misma auditoría: 0 fallos en los 30 mapas. En s7, e\|j = P(12,14), f\|j = C(12,17), e\|f = C(21,18) y e\|g = C(11,11). Hay 9 pasos sin camino en s7 y entre 2 y 6 en las otras semillas, como se aceptó. |
| 2c | La red se lee radial desde el centro de cada región | ✅ | En el taller, cada región tiene un tronco con ramas, sin vías paralelas a la frontera (s2, s5 y s7). En s7, la región e sale de su centro, cerca de (21,11), hacia (11,11), (21,18), la mina (22,9) y P(12,14). Ver H3. |
| 3a | Una partida corta en el juego funciona | ✅ | Vite propio en :3417 y Playwright sin pantalla, con `?seed=7` y `?seed=2`. El escenario llega a `pintado` en unos 7 s. Tres «Fin de turno» llevan del día 1 al 4 y la consola está limpia (`capturas-qa/juego-s7-dia1.jpg`). En `pnpm capturas`, el tramo de escritorio juega la semilla del guion hasta el final: «fin: día 9, la barra dice «Partida perdida», el espejo perdida», sin errores. |
| 3b | El espectador funciona | ✅ (con un workaround, W1) | Copia del árbol actual con `emboscadaAvisada` y `veteranos` desactivadas: «espectador: el «Fin» de la batalla sale con el tablero en su final… enseña el fin de la partida 8522 ms después del game_over… el héroe nacido de la tropa se ve en el panel». La arena, el móvil, el táctil y sin arte pasan. «sin errores en consola», sale 0. |
| 4 | Duración: ¿la mediana de 7 la causa este cambio? | ✅ medido; no se le puede atribuir | Ver «Duración» abajo. |
| 5a | `pnpm verify` | ✅ | `Test Files 54 passed (54)`, `Tests 1798 passed (1798)`, 64 s. |
| 5b | `pnpm banco` | ✅ | `sha256: 642241f8…`, «ancla: igual», `sin terminar: 0/200`, `duración: 8 / 15 / 39`, 5,1 s. |
| 5c | `pnpm qa` | ✅ | «terminado por fin de partida: 1 mapa diseñado, 5 turnos de mapa, 28 decisiones de batalla y 1 ascenso». 7 puertos escuchando antes y 7 después. |
| 5d | `pnpm capturas` | ❌ **NO cumple** | Sale 1: `Error: semilla 3: la ruta a (8,8) ya no pisa ninguna emboscada a la vista` (H1). |
| 6a | Mapas de 28 y 48 | ✅ | Semillas 1-10: ninguna lanza y la auditoría da 0 fallos. Camino 28×28: 28,6-36,6 %, antes 33,7-43,5 %. Camino 48×48: 26,5-31,7 %, antes 31-41,6 %. μ 48×48: 12-20, antes 32-47. Las 20 partidas de IA contra IA terminan todas. 28: mediana 6, igual que antes. 48: mediana 14, igual que antes. |
| 6b | El mapa diseñado por el agente no cambia | ✅ | Plan congelado en JSON con sus `roads` (el procedimental de `HEAD`, s3 34×34). En los dos árboles da `validateMapPlan` sin problemas, 262 casillas de camino, el mismo hash de `roads` (`a087de60ac1f`) y la misma partida entera de IA (`newGame({seed:11, plan})`): gana 1 el día 9, con el mismo hash de crónica, `8eef669e73bbeb87`. El diff no toca `validateMapPlan`, `problemasDeRed` ni `buildMap`. La separación de pasos solo está en `intentarRed`. |

## Duración (criterio 4)

`npx tsx tools/qa/barrido-semillas.ts 10`, semillas 1-10, 0 sin terminar en las tres variantes:

| Variante | Días por semilla (1→10) | mediana / p90 / máx |
|---|---|---|
| `5cdd636` (antes) | 9 8 13 12 14 6 17 6 5 16 | 12 / 17 / 17 |
| Actual **sin** separar los pasos: `cerca(n, 1)`, copia en el scratchpad. Así se aíslan los caminos radiales; la red es la misma que antes en 9 de 10 semillas | 5 13 14 8 14 5 7 14 9 16 | 13 / 16 / 16 |
| Actual | 5 6 8 12 8 6 11 7 10 3 | 8 / 12 / 12 |

- **Los caminos radiales no acortan las partidas.** Con la misma red, la mediana pasa de 12 a 13.
- Lo que acorta en las semillas 1-10 viene con la **separación de los pasos** de la vuelta de /simplify, que cambia la red en las 10 semillas: es otro mapa. Por semilla, 6 son más cortas, 2 iguales y 2 más largas. Con 10 semillas eso no es significativo: la prueba de signos da p ≈ 0,29.
- El banco (200 semillas, cifras ancladas en `tools/qa/banco.ts`) da mediana **8 → 8** y p90 **15 → 15** entre `5cdd636` y ahora. El máximo sube de 25 a 39.
- **Conclusión.** La mediana de 7 del barrido de serie (40 semillas) no se le puede atribuir a este cambio. Con 200 semillas la mediana no se mueve, y ya era 7 con 40 semillas antes de la vuelta. Es una muestra pequeña con la regla del lado en el filo (≥ 8). No lo verifiqué con más semillas, por la instrucción.
- Un dato que conviene mirar: la semilla 10 ahora termina **el día 3** (antes, el 16). En 28×28 también sale una de 3 días (s10). No es un fallo, pero sí el extremo corto de la regla.

## Hallazgos

### Bloqueante

**H1. `pnpm capturas` sale 1: el guion de la emboscada avisada dependía del mapa de la semilla 3.**
- Cómo reproducirlo: `pnpm capturas` → `Error: semilla 3: la ruta a (8,8) ya no pisa ninguna emboscada a la vista` (`tools/qa/capturas.ts`, `emboscadaAvisada`, `SEMILLA_EMBOSCADA = 3`, `DESTINO_EMBOSCADA`).
- En `HEAD` ese tramo pasa: «emboscada: raider-2 en (2,11)… la ruta salta en (8,8)». Lo comprobé en la copia de `5cdd636` con solo ese tramo y el de veteranos.
- La causa es que la separación de pasos cambió la red de la semilla 3. El ingeniero no pasó `pnpm capturas` tras la vuelta de /simplify (lo dice `implementacion.md`), y en la vuelta 1 pasaba.
- No hay pruebas de que la emboscada esté rota en el juego. Lo que se ha perdido es la escena del guion. Hay que volver a elegir la escena: semilla y destino, como ya se hizo otras veces (está en el comentario de `SEMILLA_EMBOSCADA`).
- Mientras tanto, el cierre del ciclo (criterio 5) no está en verde. Y como el guion se para ahí, una corrida normal no llega a ejercer los tramos siguientes. Ver W1.

### Importante

**H2. El tramo `veteranos` de `pnpm capturas` también se rompe con el mapa nuevo.**
- `Error: no hay a la vista ninguna guardia a la que se llegue hoy` (`capturas.ts:1591`).
- No aparece en la corrida normal porque H1 la para antes. Salió al saltarme H1 (W1).
- En `HEAD` pasa: «tras la primera guardia: 2 veterano(s) en el panel… 1 galón(es) en la figura».
- Tiene la misma causa y el mismo arreglo que H1: elegir otra escena. Hay que arreglar las dos a la vez, o el siguiente `pnpm capturas` volverá a pararse aquí.

### Menor

**H3. En s7 queda un anillo grande de caminos alrededor de la masa nevada central** (`capturas-qa/s7-anillo-nevado.jpg`, casillas x 11-22, y 11-24).
- Pasa por tres regiones (e, f y j) y sus tres cruces: P(12,14), C(12,17) y C(21,18).
- Es el tipo de bucle que la decisión B acepta (entre regiones, por un cruce de cada pareja), y no es un «cuadrado» pequeño.
- Pero se lee como una vía de circunvalación: la rama de la región j se bifurca muy cerca de la frontera, en (10,15)-(11,16). Por eso, en pantalla, P(12,14) y C(12,17) parecen unidos por un camino pegado a la frontera, de unas 4 casillas, sin pasar por el centro de j.
- Quien juega puede verlo como «camino de paso a ciudad».
- Lo llevaría al usuario con la captura, no lo arreglaría por mi cuenta: es la forma natural de la variante B cuando tres regiones se tocan a pares.

**H4. En 28×28 el camino sigue ocupando el 33 % de media** (28,6-36,6 % en las semillas 1-10; en 34×34, 30 %).
- Es menos que antes (33,7-43,5 %), pero ahí no se ve la mejora relativa del 34.
- Es informativo: el techo del test denso es para 34×34.

## Workarounds usados

- **W1.** Para ver el espectador, la arena, el móvil, el táctil y sin arte (lo que `pnpm capturas` no llega a ejercer por H1), corrí `capturas.ts` en **una copia del árbol actual** en el scratchpad, con `emboscadaAvisada` y `veteranos` comentadas. `jugarEscritorio` y `batallaPerdida` ya habían pasado en la corrida real.
  - **Veredicto:** no afecta a quien juega. Lo saltado son escenas del guion, no pantallas del juego.
  - Pero es justo la razón por la que H1 es bloqueante para el cierre: sin el workaround, nadie ve el espectador en esta corrida.
- **W2.** Para atribuir la duración, una copia del árbol actual con la separación de pasos revertida (`cerca(n, 1)`). Solo sirve para medir, y no toca el repo.
- **W3.** La copia de `HEAD` y las otras dos usan un enlace `node_modules` **en el scratchpad**, que apunta al del repo. No hay ningún enlace dentro de `node_modules` del repo.

En el espectador, la captura `espectador-01-mapa` sale con el sucedáneo de pigmentos y sin caminos. Es el estado `cargando` en el que se toma, y la captura anterior del repo (`2026-10-01-cliente-nuevo/capturas/espectador-01-mapa.png`) sale igual. No es una regresión.

## No probado

- La duración con más de 10 semillas: por la instrucción del usuario. Las cifras de 200 del banco son las que ya están ancladas.
- Que la emboscada avisada y los galones de veterano se vean en el juego con el mapa nuevo: el guion ya no encuentra sus escenas (H1, H2). No hay indicios de que la mecánica esté rota.
- Robustez del generador más allá de 10 semillas por tamaño.
- El rendimiento (fps) con los volúmenes de más que deja el menor pasillo.

## Procesos

- Vite propio en :3417 (`set -m`, matado por su grupo, y el puerto queda libre).
- `pnpm capturas` y `pnpm qa` arrancan y matan sus propios procesos.
- Al acabar, solo escuchan los puertos de antes: 22, 53, 80, 631 y el 3636 ajeno.

## Veredicto

**No apto.**

El cambio de juego está bien hecho:
- los anillos pequeños han desaparecido;
- la conectividad la vigila una auditoría que da 0 fallos en 28, 34 y 48;
- el mapa del agente queda intacto, partida idéntica;
- `verify`, `banco` y `qa` están en verde;
- la duración no empeora por los caminos.

Pero el criterio 5 pide `pnpm capturas` en verde y sale 1, y además lleva un segundo tramo roto detrás (H1 y H2). Arreglar las dos escenas del guion sería suficiente para pasar a «apto con reservas», con H3 para que lo juzgue el usuario.
