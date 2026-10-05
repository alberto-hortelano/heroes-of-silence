# QA: el mapa con la misma nitidez en el zoom máximo

Validado sobre **HEAD = `2a33044`**, que lleva la nitidez (`f21d6ab`) y la fusión de arte-mapas. «Antes» es **`ba057bd`**, en un worktree con sus propios `assets` (entre `ba057bd` y HEAD, `assets/mapa` no cambia). Lo medí en el Chromium 1234 de Playwright, sin GPU, con clics y rueda reales y la carga de la máquina entre 1,8 y 2,7. Usé puertos propios (3197 y 3198, más los que da el sistema a `medir.ts` y a `pnpm capturas`), nunca el 3100. Maté cada servidor por su grupo y comprobé con `ss -ltnp` que el puerto quedaba libre. Los dos worktrees ya están retirados.

Capturas en `capturas-qa/`: las de `medir.ts` en la raíz y las mías en `propias/`.

## Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| **C1. Nitidez en el zoom máximo**, en la pantalla del usuario (1983×1053 @1,09) y en 1920×1080 | ✅ cumple | **Cifras.** El lienzo en el zoom máximo pasa de 1618×927 a **1769×1013** de dispositivo en 1623 px CSS (densidad 0,997 → **1,090**). La casilla mide 110 × 1,09 = 119,9 px de dispositivo, y el suelo bueno es de 120: no se amplía. En 1920 la densidad es 1,0 y el suelo de 120 se reduce a 110. **`cubierta-rough/2.webp`** mide 122×78 nativos y se coloca a 157-290 px por casilla: semilla 7 en (9.1, 6.1), (9.5, 7.6) y (8.2, 8.7); semilla 9 en (10.1, 7.3) y (12.7, 7.7), sacado de `componer` + `separar`. **Recortes 1:1, antes a la izquierda:** `propias/comparar-cubierta-s7-usuario.png` y su ampliación ×2 en vecino más próximo, `-x2.png`. Las piedras planas y las flores pasan de borrosas a nítidas, al nivel de los pinos de al lado. También `propias/comparar-roca-agua-s7-usuario-x2.png` (caras de roca), `propias/comparar-s9-1920-x2.png` y `propias/comparar-usuario-max-s1-sinniebla.png`. |
| **C2. Ninguna capa más blanda que otra** | ✅ cumple, con una reserva de arte | Comparadas a ojo a 1:1 en el zoom máximo: suelo, cubierta baja, caras de roca, sendas, agua, volúmenes y figuras (`propias/despues-s1-usuario-max-sinniebla.png`) se ven igual de nítidos. La excepción son los **picos nevados y de roca**, algo más blandos que los pinos de al lado (`propias/picos-nevados-usuario-max-s1.png`). Son los 13 módulos de menos de 120 px por casilla que ya recoge `docs/art/peticiones.md` §12: hace falta arte nuevo, el render no lo arregla. |
| **C3. El presupuesto no rebaja la densidad en el zoom máximo** hasta 2560×1440 | ✅ cumple | En 2560 la densidad en el zoom máximo pasa de **0,720 a 1,000** (lienzo de 2200×1318). En la pantalla del usuario sube a 1,09. En 4K se queda en **0,46**, como decidió el usuario. Salida de `medir.ts` en `$scratch/medir/log.txt`. |
| **C4a. fps** en el zoom máximo y en el tope de alejar | ✅ cumple | Ver la tabla de abajo. Nada empeora salvo 4K en el zoom máximo, 33/37 frente a 37/34 con la semilla 1, que entra en el ruido de ±5: la misma medida da 38/37 en la segunda tanda. |
| **C4b. Ninguna tarea larga de más de ~100 ms al hacer zoom** | ✅ cumple | Hay 0 tareas de más de 100 ms en las 16 cargas, acercando y alejando. La mayor, 82 ms (2560 s1, al alejar). |
| **C4c. Ninguna tarea larga de más de ~100 ms al cargar** | ⚠️ cumple con reservas | En HEAD salen tareas de 102-121 ms en 5 de 8 cargas, y antes, una de 135 ms en 1 de 8. Todas caen a los **300-450 ms** de abrir la página, antes del esbozo. En una segunda tanda, `f21d6ab` contra HEAD, `f21d6ab` dio 104 y 139 ms y HEAD ninguna (máximo 100). Es un pico del arranque que va y viene en todas las versiones, no viene de esta tarea ni de la fusión. **La llegada del esbozo y la del bueno no hacen ninguna tarea de más de 83 ms.** Ver el hallazgo M2. |
| **C4d. Memoria** | ✅ dentro de lo aceptado | El pico de PSS del navegador pasa de 1 042-1 223 MB a **1 280-1 495 MB** (+240-290 MB). El usuario aceptó +53 MB de suelo y hasta +40 MB de caché; el resto es el pico del Worker mientras pinta a 120. |
| **C5. Del esbozo al suelo bueno: sin parpadeo ni huecos** | ✅ cumple | Lo medí con un guion de scratch (`flicker.mts`, no está en el repo), que hace un muestreo por fotograma de 7 filas del lienzo (brillo y gradiente). Lo corrí en usuario s7, 2560 s1 y 1920 s3, con el zoom al máximo hecho durante `esbozado` y el mapa entero visible. En cada pantalla hay **un solo cambio**, en el fotograma en que llega el bueno, a los 7,0-7,6 s. Hay 0 parpadeos (ningún fotograma que se aparte de sus dos vecinos), ningún hueco con el fondo vacío, y el mayor intervalo entre fotogramas fue de 17-33 ms. Las capturas cada ~1 s (`propias/transv-*`) dan una diferencia media de 0,03-0,12 entre fotogramas del mismo estado y de 2,1-2,9 en el cambio. `propias/comparar-esbozo-bueno-usuario.png`: el esbozo es blando y coherente, y el bueno lo sustituye sin que nada se mueva. |
| **C5b. El cambio de densidad al acercar en 2560** | ✅ cumple | Lo hice paso a paso desde el tope. El lienzo pasa de 1583 a 2200 px de ancho en el paso 1 (s1) o en el 2 (s7), con tareas de como mucho 72 ms. Al alejar vuelve 2-4 pasos después: es la holgura. En un vaivén de 10 pasos de rueda en el umbral hubo **0 reasignaciones** del lienzo y la mayor tarea fue de 74 ms. Capturas: `propias/dens-s1-paso1-w2200.png` y `dens-s7-paso2-w2200.png`. A la vista es un paso a mejor dentro del propio zoom: no se ve como un salto. |
| **C6a. «Partida nueva» suelta el mapa anterior** | ✅ cumple | Es el flujo real: en la semilla 1 di «Fin de turno» y «Resolver sola» hasta perder la base (día 7, 37 acciones) y pulsé «Partida nueva». Lo hice **4 ciclos seguidos**. Tras cada uno, el pintor tiene `page.workers()` = 0 (había 1 mientras pintaba). El PSS, con GC forzado: 813 → 898 → 967 → 1 062 → 1 076 MB. El último ciclo crece +14 MB: si el suelo de 83 MB no se soltara, cada ciclo sumaría ≥ 83 MB. El crecimiento de los primeros ciclos encaja con la caché de copias (80 MB) y el arte de las batallas llenándose. 0 errores de consola. |
| **C6b. El espectador funciona** | ✅ cumple | `pnpm capturas`: espectador con 8 batallas, el héroe nacido de la tropa visible y el fin de la partida a tiempo. En `espectador-04-fin-de-partida.png` el suelo ya está pintado. Ver el hallazgo M4 sobre `espectador-01-mapa.png`. |
| **C7. Todo en verde** | ✅ cumple | `pnpm verify`: **54 ficheros, 1 769 tests**, verde, en 65 s. `pnpm banco`: «**ancla: igual**», 0/200 sin terminar. `pnpm qa`: salida 0, «1 mapa diseñado, 6 turnos de mapa, 80 decisiones de batalla y 1 ascenso». `pnpm capturas`: salida 0, «**sin errores en consola** … 215.6 s», con cliente, móvil, táctil, sin arte, espectador y la arena con el arte fusionado. `CLAUDE.md` y `docs/historia.md` están al día (60/120, 80 MB, `PIXELES_NUEVOS_POR_FOTOGRAMA`, `PIXELES_AL_ACERCAR`). |

### fps quieto/arrastrando (s1; s7), mi tanda de `medir.ts`

| pantalla | antes, zoom máx. | después, zoom máx. | antes, tope | después, tope |
|---|---|---|---|---|
| 1920×1080@1 | 60/60; 60/60 | 60/60; 60/60 | 60/60; 60/60 | 60/60; 60/60 |
| usuario @1,09 | 56/43; 54/42 | **60/60; 60/60** | 50/48; 48/46 | **60/60; 60/60** |
| 2560×1440@1 | 53/42; 52/41 | **60/60; 59/57** | 47/47; 47/46 | **60/60; 60/60** |
| 3840×2160@1 | 37/34; 38/35 | 33/37; 36/37 | 38/38; 38/36 | 38/37; 38/37 |

Suelo, antes: pintado a 2,4-2,6 s. Después: esbozo a 1,78-1,96 s y bueno a 6,81-7,27 s, lo que aceptó el usuario.

## Hallazgos

No hay ninguno bloqueante ni importante.

**M1 (menor, de método). Las capturas de `medir.ts` son sobre todo niebla.**
- Medido sobre sus propias capturas: el 65-67 % del lienzo es niebla en 1920 y en la pantalla del usuario, y el **93 %** en 4K al tope.
- Por eso las comparaciones de la vuelta de /simplify («s1 en las tres pantallas y s7 en 4K, idénticas») y la de 4K al tope (punto 6, mitades del esbozo) comparan casi solo negro: prueban poco.
- Para reproducirlo: `medir.ts` con `MEDIR_CAPTURAS`, y abrir `capturas-qa/despues-s1-3840x2160@1-tope.png`.
- Mis capturas pulsan antes «Ver mapa entero» (`propias/*-sinniebla.png`, `propias/comparar-4k-tope-s1-sinniebla.png`). En ellas 4K al tope sale igual que antes, blando por la densidad de 0,46, sin aliasing visible. Las otras conclusiones se sostienen.
- Propuesta: que `medir.ts` pulse `[data-action="toggle-fog"]` antes de capturar.

**M2 (menor, ya estaba). Una tarea de 100-139 ms al arrancar la página.**
- Para reproducirlo: `medir.ts` en usuario o 4K con s1 o s7; mirar `carga.max` y `lt` a ~300-450 ms.
- Sale en `ba057bd`, en `f21d6ab` y en HEAD, alternando: no es de esta tarea.
- Quien juega espera no notar ningún tirón: este cae antes de que se vea el mapa, mientras está el fondo vacío.

**M3 (menor, aceptado: E3). El camino sin Worker congela la página.**
- Sin `OffscreenCanvas` (quité `window.OffscreenCanvas` con un script de inicio, 1920, s1) hay **dos tareas largas: 1 113 ms** (a los 0,6 s) y **4 526 ms** (a los 1,76 s), más una de 125 ms.
- La página no responde ~4,5 s después de ver el esbozo.
- Cuadra con lo documentado (~5,5 s) y está descartado en `hallazgos-simplify.md`. Lo apunto con la cifra de este navegador.

**M4 (menor, de la prueba). `espectador-01-mapa.png` enseña el sucedáneo de pigmentos.**
- Se captura a los 800 ms de la primera petición, antes del esbozo (~1,8 s), así que el suelo sale en bloques de color plano.
- No es una regresión: la captura final sí tiene el suelo bueno.
- Aun así, `pnpm capturas` no demuestra la nitidez del espectador en su primera captura.
- Quien mire el espectador ve esos bloques los ~2 primeros segundos, igual que en el cliente.

**M5 (menor, arte, fuera de alcance).** Los picos nevados y de roca se ven algo más blandos que los árboles en el zoom máximo (C2). Ya están pedidos en `docs/art/peticiones.md` §12.

**Observación (no probada en el navegador).** Con un dpr de 1,25 o más (un portátil al 125 % o una pantalla retina), la casilla del zoom máximo pasa de 120 px de dispositivo y el suelo de 120 vuelve a ampliarse: ×1,15 a dpr 1,25. A 1440×900 @2 el lienzo pasa además de `PIXELES_AL_ACERCAR` y vuelve el presupuesto. Está en el backlog (c) del plan. No afecta a la pantalla del usuario.

## Workarounds usados

- **«Ver mapa entero»** (`toggle-fog`) en las capturas, para ver la cubierta fuera de lo explorado. Es un botón de la interfaz que tiene quien juega, así que no falsea nada.
- **Chromium de Playwright, sin GPU**, en lugar del Chrome de la persona. Es el mismo navegador de las medidas del ingeniero, y en un Chrome con GPU los fps solo pueden ser iguales o mejores. Que se vea igual en el Chrome real del usuario **no está probado**.
- **Quitar `window.OffscreenCanvas`** con un script de inicio (M3). Es un estado sintético, pero imita un navegador sin `OffscreenCanvas` o un Worker caído: es el camino de reserva, no el normal.
- **Llegar a «Partida nueva» perdiendo a propósito**: «Fin de turno» y «Resolver sola» hasta perder la base. Es el flujo real, porque el botón solo sale con la partida terminada. No pude probar «Partida nueva» con el suelo aún pintándose: con la partida terminada, el suelo siempre está pintado hace tiempo.
- Ninguno afecta a quien juega.

## No probado

- El Chrome del usuario con GPU, en su pantalla física, con la extensión de Chrome. Todo se hizo en Chromium sin GPU emulando dpr y tamaño.
- La salida de un mapa a medio pintar (`terminar` del Worker) en el flujo real, que no se puede alcanzar desde la interfaz. Solo la cubren los tests.
- Pantallas de dpr ≥ 1,2: la observación de arriba sale de la cuenta, no de capturas.
- `pnpm mirar` a mano. El espectador solo lo ejercitó `pnpm capturas`.

## Veredicto

**Apto con reservas.** Lo que pidió el usuario se cumple: en el zoom máximo, en su pantalla y en 1920×1080, el suelo (`cubierta-rough/2.webp` incluido) se ve tan nítido como los volúmenes, sin ampliar. Los fps suben o se mantienen. Al hacer zoom no hay tareas largas. El paso del esbozo al bueno es un único cambio, sin parpadeo. «Partida nueva» suelta el suelo y el Worker. Las reservas son todas menores:
- el método de captura de `medir.ts`, que fotografía niebla (M1);
- un pico del arranque que ya estaba (M2);
- el camino sin Worker, ya aceptado (M3);
- los picos de arte pendientes (M5).
