# QA: la escena del mapa (petición 1 de la §11)

Validado el 04-10-2026 contra `requisitos.md`: la petición y las dos tandas de decisiones del usuario. El árbol se validó sin commitear, tal como lo dejaron el ingeniero y la vuelta de /simplify. No he tocado código. Los dos borrados ajenos de `assets/art/no-muertos/` siguen como estaban.

**Entorno**
- Vite propio en el **3301**, para el código nuevo.
- Copia de `HEAD` (`b3ff334`, con `git archive`, en el scratchpad) en el **3302**, como línea de base.
- Servidor de partida propio con `HEROES_*_PORT=0` y `HEROES_SEED=3`.
- Todo lo paré por su grupo y comprobé con `ss` que quedaron libres el 3301, el 3302, el 33451 y el 39915.
- Las medidas son del Chromium de Playwright sin GPU, el de `pnpm capturas`, con vsync. Por eso los fps tienen techo en 60.

**Capturas** en `capturas-qa/`.

## Criterios

| Criterio (requisitos.md) | | Evidencia |
|---|---|---|
| El mapa del cliente se pinta con el escenógrafo | ✅ | Semillas 1, 3, 4242, 555, 20 y las sorteadas al reiniciar (87291, 25439, 67819): `s1-1280-*`, `s3-1920-*`, `s4242-2560-*`, `jugar-*`. El taller de la semilla 1 (`taller-s1.jpg`) tiene la misma distribución que `s1-1280-entero`. |
| El espectador ve la misma escena que el cliente con la misma semilla | ✅ | Servidor con semilla 3: `espectador-s3-1.png` coincide con la zona sur de `cliente-s3-abajo.png` (agua con puente, cañón rojo, castillo azul). La captura `espectador-01-mapa` de `pnpm capturas` coincide con `s3-1920-entero`. Lo respalda además `espectador.test.ts`, que compara byte a byte. El servidor usa el mismo `LADO_DEL_MAPA` y `generateMapPlan`. |
| Se hornean ciudad, pueblo, nodo y mina; el juego pinta la bandera o el óvalo encima | ✅ | Óvalos rojo y azul bajo los castillos y bajo el nodo tomado (`encima-nodo-mina-cerca.png`), iconos de las minas y banderas. |
| Monstruos, recursos, cofres, niebla, héroes, asaltantes, ruta y selección los pinta el juego | ✅ | Se ven en todas las capturas. El orden en `drawMapa` es: suelo, después altura (volúmenes y figuras), después identificadores, después niebla, y al final ruta y selección. |
| Figuras ordenadas por profundidad: pueden quedar tras árboles | ✅ | `tapado-s3.png`: el héroe queda tapado por un pino de cintura para abajo, con la «A» encima. El asaltante en el bosque solo enseña la chapa y el estandarte (`s1-1280-entero`). |
| La inicial, la chapa y la bandera van encima de lo que tiene altura y por debajo de la niebla | ✅ | Visto en el código (`mapa.ts:276-279`) y en las capturas. No encontré ninguna chapa sobre la niebla. |
| Ciudades, nodos y minas no tapan a quien está en su casilla | ✅ | El héroe en su castillo se ve en todas las semillas. El héroe sobre un nodo en las semillas 1 y 20 (`encima-nodo-mina-cerca.png`, movimiento 350 y 275 de 1100: se movió de verdad). El héroe sobre una mina en la semilla 3 se ve con la mina detrás; una mata que tiene delante le tapa los pies (es vegetación, permitido). |
| Tope de alejar: 2 000 volúmenes como máximo y nunca menos de 40 px | ⚠️ con reservas | Lo calculé con `topeDeAlejar` real (tabla de abajo). Se cumple para todo tamaño hasta 3840×2160. **En 7680×4320 la semilla 1 queda con 2 017 volúmenes a la vista** (H4). |
| Dos tamaños de ventana | ✅ | De 320×240 a 3840×2160, con dpr 1 y 2. Redimensionar en plena partida, de 1280 a 2560 y a 360, no da errores y la cámara se reacota (`redimensionar-*`). |
| Minimapa | ✅ | Pigmentos, rectángulo de cámara, castillos y héroes. Con «Ver mapa entero» enseña el mapa completo. |
| «Ver mapa entero» | ✅ | Es el interruptor de la niebla, como decidió el plan. En 1280×800 al tope no cabe el mapa entero; el resto se ve en el minimapa, como aceptó el usuario. |
| Mover el héroe, batalla, castillo y volver | ✅ | `jugar.mts` en 4 semillas: entra al castillo y sale con «Volver al mapa», y `data-escenario` sigue en `pintado`. Batalla contra `mon-5` en la semilla 555 (`jugar-s555-batalla.png`, escena `battle`), que se resolvió y volvió al mapa pintado (`jugar-s555-batalla-9s.jpg`). `pnpm capturas` juega además las batallas con clics. |
| Reiniciar: la escena cambia con la semilla | ✅ | Se juegan turnos hasta perder (días 6-7) y se pulsa «Partida nueva». Las URL pasan de `?seed=3` a `87291`, de `1` a `25439` y de `20` a `67819`, y el mapa cambia (`jugar-s*-final` frente a `jugar-s*-nueva`). |
| Sin errores en consola | ✅ | 0 errores y 0 avisos en todas las pasadas con arte, en el cliente y el espectador. Sin arte solo salen los 404 provocados y el `console.error` documentado. |
| Se juega sin arte, con marcadores | ✅ | Bloqueando `/mapa/`, `/rpg/`, `/characters/`, `/generated/terrain/` y `/unidades/`, el mapa sale con marcadores (`s3-sinarte-*`) y se juega. `pnpm capturas` lo hace en `sin-arte-*`, con una batalla. Tiene sus tests en `escenario.test.ts` y `mapa-pintado.test.ts`. |
| Los mapas que diseña el agente valen igual | ✅ | `pnpm qa` sale 0: «el mapa lo diseñó el agente: pueblos qa-town-1» y «87 veredictos, 87 entraron». Además compuse planes raros: 28, 34 y 48 de lado, cada región de un solo suelo (los 7 suelos), sin caminos. **42 de 42 componen**, 0 imágenes que falten y 33-123 ms. No lo miré a ojo en el navegador (ver *no probado*). |
| Taller `pnpm taller escenario 1` | ✅ | 3,8 s: `imagenesQueFaltan 0`, `errores []`, 7 006 sprites, `msPintar 1340`. |
| `pnpm verify` | ✅ | `Test Files 49 passed (49) · Tests 1384 passed (1384)`, 20,7 s. |
| `pnpm banco` (ancla `1b90bfd9…`) | ✅ | `sha256: 1b90bfd9049a042a…d599`, «ancla: igual», 0/200. |
| `pnpm qa` | ✅ | `exit=0`, 3,1 s, 6 consultas, 1 ascenso. |
| `pnpm capturas` | ✅ | `sin errores en consola … 218.8 s`, exit 0. El espectador enseña el final 61 428 ms después del `game_over` (plazo 82 000). No ensucia el árbol. |
| Congelón al cargar, medido | ⚠️ ver H2 | Una tarea larga de **1,7-2,0 s** en el cliente, **2,2 s** en el espectador y **1,9 s** en 3840×2160. Se repite en cada «Partida nueva» (`pintado` en 1,6-2,0 s). |
| fps al arrastrar, medidos | ⚠️ ver H1 | Tabla de abajo. Igual o mejor que `HEAD` hasta 2560×1440. **Peor en 3840×2160.** |

### El tope de alejar, calculado con el código real (px por casilla / volúmenes en la peor ventana)

| semilla | 320×240 | 920×677 | 1280×800 | 1983×1100 | 2560×1440 | 3840×2160 | 7680×4320 |
|---|---|---|---|---|---|---|---|
| 1 (2 017 en total) | 40/303 | 40/1165 | 40/1547 | 40/1934 | 50/1973 | 75/1973 | **110/2017** |
| 3 | 40/390 | 40/777 | 40/925 | 40/1360 | 40/1525 | 40/1525 | 40/1525 |
| 4242 (2 464) | 40/578 | 40/1280 | 40/1655 | 48/1920 | 63/1920 | 94/1920 | **110/2464** |

### fps (Chromium sin GPU, con vsync; quieto / arrastrando; p95 del fotograma)

| Ventana | Código nuevo: al abrir | al tope | mapa entero | `HEAD`: al abrir | al tope | mapa entero |
|---|---|---|---|---|---|---|
| 1280×800, s1 | 60/60 | 60/60 | 59 | 60/60 | 60/60 | 59 |
| 1920×1080, s3 | 54/46 (33 ms) | 51/44 | 60 | 53/36 (50 ms) | 54/41 | 45 |
| 2560×1440, s4242 | 25/23 | 26/24 | 59 | 29/23 | 40/31 | 37 |
| 1440×900 dpr 2, s1 | 23/19 | 22/20 | 42 | 25/17 | 25/20 | 28 |
| **3840×2160, s1** | **7/7 (150 ms)** | **8/7** | **11** | 16/15 | 28/29 | 35 |
| 480×360 y 320×240 | 60/60 | 60/60 | 60 | — | — | — |
| sin arte, 1280×800, s3 | 60/60 | 60/60 | 60 | — | — | — |

Tirón por paso de rueda (dos fotogramas, con la sobrecarga de Playwright): 85 ms en 1280, 95-225 en 1920, 190-300 en 2560 y **710-900 ms en 3840** (en `HEAD`, 175-436).

## Hallazgos

### Bloqueantes
Ninguno.

### Importantes

**H1. En 3840×2160 a dpr 1 el mapa va a 7-11 fps, de 2 a 4 veces peor que `HEAD`.**
- Reproducción: `pnpm dev`, ventana de 3840×2160 a escala 100 %, `?seed=1`. Arrastrar o usar la rueda.
- Cifras: 7 fps quieto y arrastrando, fotograma de 133-150 ms y tirón de rueda de 0,7-0,9 s. `HEAD` daba 15-35 fps.
- La causa probable es de diseño. El tope cuenta volúmenes, pero en un lienzo grande el tope sube (75 px en la semilla 1, 94 en la 4242), así que se pintan ~1 970 volúmenes a casi el doble de tamaño. El coste pasa a ser de relleno y no de número de sprites. La cifra de 2 000 se midió a 1280-1920.
- Hasta 2560×1440 los fps quedan iguales que `HEAD`, salvo al tope (26/24 frente a 40/31).
- Quien juega en un monitor 4K sin escalar tiene el mapa a tirones.
- La decisión es del usuario: si 4K a dpr 1 entra en lo que hay que soportar y si el tope debe tener en cuenta los píxeles además de los sprites.

**H2. El congelón al cargar es una sola tarea de 1,7-2,2 s, y se repite en cada «Partida nueva» y al abrir el espectador.**
- Reproducción: abrir `/?seed=1`, o pulsar «Partida nueva» al acabar una partida. Durante ~2 s la página no responde a nada.
- En `HEAD` la carga se repartía en tareas de ≤ 0,6 s.
- Está declarado en `implementacion.md` (el Worker queda en el backlog), así que no es una sorpresa.
- Lo marco importante y no menor porque quien juega lo sufre en cada partida: un clic en esos 2 s se pierde o llega tarde.

### Menores

**H3. Los volúmenes del borde asoman fuera del mapa, sobre el margen negro.**
- Con el mapa entero a la vista, en 2560×1440 y semilla 4242 (`redimensionar-b2560.jpg`):
  - las copas de la fila 0 salen por encima del borde de arriba, entre ~20 y 30 px;
  - una muralla de la columna 0 sale ~50 px por la izquierda.
- Es cosmético. Lo dejo dicho por si se quiere recortar al rectángulo del mapa.

**H4. En lienzos enormes, el tope de `TILE_MAX` gana a la regla de 2 000.**
- En 7680×4320 (u 8K a dpr 1), con 110 px, se ven 2 017 volúmenes en la semilla 1 y 2 464 en la 4242, por encima del máximo que pidió el usuario.
- No es realista hoy. Aun así, `tileMinimo` devuelve `TILE_MAX` sin decirlo, y su docstring promete «no pasa de 2 000».

**H5. Hay nodos que no se distinguen del suelo.**
- El héroe sobre el nodo (10,5) de la semilla 1 o el (9,4) de la semilla 20 está en un paso del bosque sin hito visible. Solo el óvalo del dueño, una vez tomado, dice que ahí hay un nodo.
- Es la petición 4 de la §11 («la barrera de cada nodo»), que está fuera de alcance. Lo anoto para que el issue lo recoja.

## Workarounds usados

- **Calcular el tope en Node** (`topeDeAlejar` sobre `escenarioDe(newGame(seed).map)`) en vez de leerlo de la página, porque la cámara no se ve desde fuera. Es la misma función y el mismo memo que usan el cliente y `capturas`, así que no afecta a quien juega.
- **Una sesión espejo** (`new Session(seed)`) para saber dónde pulsar, igual que hace `pnpm capturas`. No falsea nada en la página: los clics son reales.
  - En dos pasadas mi script pulsó fuera del lienzo, y el espejo creyó que el héroe se había movido. Las descarté.
  - Solo cuento las pasadas en las que el movimiento del panel bajó de verdad (590, 350 y 275 de 1100).
- **Para probar sin arte, bloquear las imágenes con `route`.** Es lo mismo que ve quien no tiene `assets`.
- **La pestaña de Chrome real estaba oculta** (`visibilityState: hidden`), así que la usé solo para una mirada inicial y medí todo en Playwright. No afecta a quien juega; lo explica `implementacion.md`.

## No probado

- **El mapa diseñado por el agente, a ojo en el navegador.** `pnpm qa` no abre página, y el plan de su agente es el procedimental de la semilla 3 renombrado. Lo cubren el test C4, `pnpm qa` y mis 42 planes raros, que componen en Node.
- **La memoria por proceso.** `performance.memory` solo da el heap de JS (13-19 MB), y la memoria de lienzos e imágenes no sale ahí. Me remito al PSS que midió el ingeniero (593-778 MB).
- **Los fps en una pantalla con GPU.** Todo se midió en el Chromium sin GPU de `capturas`, que es lo que pedía el requisito.
- **El asaltante tapado justo en el borde de la niebla.** No encontré el caso en las semillas que jugué.

## Veredicto

**Apto con reservas.**
- Todo lo pedido se cumple y se ve en el flujo real: escena, profundidad, identificadores, lo horneado que no tapa, tope de 40 px y 2 000 volúmenes, minimapa, sin arte, espectador, reinicio y taller.
- `verify`, `banco` (con el ancla igual), `qa` y `capturas` dan verde, y no hay errores en consola.
- Las reservas son H1 (4K a dpr 1 va de 2 a 4 veces más lento que antes) y H2 (el congelón de ~2 s en cada partida nueva). Las dos piden una decisión del usuario, no un arreglo a ciegas.
