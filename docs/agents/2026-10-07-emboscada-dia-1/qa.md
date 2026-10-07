# QA: #130, opción C (un grupo se ve al ver su región y la marcha se para)

Worktree `/home/al/code/heroes-emboscada`, rama `emboscada-dia-1`, con `528c44b` más los cambios sin commitear (vuelta 2 y /simplify). Lo he validado contra «Decisión del usuario», «Punto de control» y «Banco» de `requisitos.md`. Fecha: 07-10-2026.

Capturas en `capturas-qa/`. Los guiones y los logs del agente están en `capturas-qa/guiones/` y se lanzan con cwd = worktree, con `npx tsx <guion>`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | El día 1 no queda ninguna ruta que acabe en emboscada sin aviso (100 semillas = 0) | ✅ | `medir.ts 100`: «12420 rutas: emboscada sin aviso en 0 rutas, 0/100; avisadas 4617; paradas 429». `medir.ts 300`: 0/300 en 36 554 rutas. Mi `guiones/medir2.mts 300` es más estricto: solo da por avisada la emboscada si la ruta nombraba **a ese** grupo. Da «sin aviso 0; avisada por un grupo y emboscada por otro 0». |
| 1b | Lo mismo los días 2 y 3, jugando como persona (absoluto: «nadie pisa una emboscada sin aviso») | ❌ | `guiones/dias13.mts 300 7`, con `Session` y marchas al azar (7260 marchas): **1 emboscada ciega**, semilla 198, día 3. Es el hallazgo H1. Con 100 semillas y 3 días: 0 de 1134. |
| 2 | Una sola regla de qué grupo se ve, para cliente, espectador y agente | ✅ | `asaltantesALaVista` con el tipo marcado. La tool `map` coincide con `knownMap.raiders` del turno en todos los turnos del canal real (`guiones/agente6.log`, `agente4.log`). En el agente salen grupos sobre `terrain: null`: «raider-3@(15,25)[terrain null]». El espectador lo ve todo (`espectador-2.png`). Matiz en H4: el contenido de `march_halted` en la crónica del rival. |
| 3 | La marcha se para al descubrir un grupo que embosca en la ruta | ⚠️ cumple en general, ❌ en un caso | Navegador, semilla 10 → (13,1): se para en (9,4) con 710/1100 pm. Semilla 13 → (11,7): se para en (6,6) con 860 pm. En 7 días × 300 semillas: 470 paradas. **No se para** cuando la fuerza del héroe cambia a mitad de marcha (H1), y se para de más en ese mismo caso (H2). |
| 3a | Lo andado cuenta | ✅ | `s10-4b`: Movimiento 710/1100 tras pararse. Agente: «se paró en (26,24)…; lo andado cuenta». |
| 3b | La barra y la crónica lo dicen | ✅ | Barra: «Aldo de Valdeluz se detiene: ve 7 asaltantes que lo emboscarían más adelante.» Crónica: «Un héroe tuyo se detiene: ve 7 asaltantes…». Las dos en las semillas 10 y 13. Consola limpia. |
| 3c | El veredicto del agente lo dice (canal real: servidor + WS + puente MCP + cliente MCP) | ✅ | Semilla 6: «Turno del día 1: 2 acciones aplicadas. Una marcha entró parcialmente, sin llegar: move_hero hero-1 → (28,20): se paró en (26,24), donde ve 4 asaltantes que lo emboscarían más adelante (raider-6); lo andado cuenta.» La segunda orden, repetida, embosca en el destino y no sale como parcial (llegó). `march_halted` aparece en `recentEvents`. Semilla 4: «lo emboscó el grupo raider-6 en (26,28), antes de llegar». Día 2, corte: «se quedó en (18,21) y le faltan 19 pasos». |
| 3d | Sin duplicar el recorte de #121 | ✅ | Revisé `moveHero`: `march_cut` solo sale tras el bucle y nunca junto a `march_halted`. Lo confirma el test de `notas.test.ts`. |
| 4 | La ventaja de la IA (ve sin niebla) queda escrita en CLAUDE.md e historia.md | ⚠️ a medias | Está en `docs/historia.md`. **CLAUDE.md no se ha tocado**: el ingeniero lo deja como propuesta en `implementacion.md`. Las issues del plan §6 (#64 y la nueva enlazada a #115) tampoco están abiertas. |
| 5 | No se quitan los grupos junto a la base | ✅ | `git diff main -- src/core/map/generate.ts` sale vacío. En las semillas 3-15 hay 8 grupos por partida. |
| 6 | Banco: ancla 6157d75a…, cero sin terminar, `pnpm qa` en verde | ✅ | `pnpm banco`: «sha256 6157d75a464b8ab6b20a5c092e57cf3eb2b5e9ec48f0035b1fe3bf40b0a8ce89 · sin terminar 0/200 · ancla: igual». Barrido de 100: «sin terminar 0/100», 8/15/27. `pnpm qa`: salida 0, 35 veredictos que entraron y 0 descartadas. |
| — | `pnpm verify` | ✅ | Salida 0, 56 ficheros, 1944 tests, 79 s. |
| — | `pnpm capturas` | ❌ | **Sale 1 en la rama, dos veces seguidas.** Sobre `main` (copia con `git archive`) sale 0. Es el hallazgo H3. |
| — | Los grupos sobre la niebla se leen | ✅ con un matiz | `s4-2`, `s10-4b`, `s13-4b`: figura, estandarte morado y chapa con la cifra sobre el negro. Al pasar el ratón: «7 asaltantes: emboscan a quien pise su región…». El matiz es que flotan en el vacío sin decir hasta dónde llega su región. Solo lo enseña la ruta en rojo. |

**Semillas 3-15 en el navegador** (Playwright sin pantalla, vite propio en el 43217, 1400×900, un paso de rueda). En todas, 0 rutas del día 1 acaban en emboscada sin aviso. Rutas que avisan / se paran por semilla: 3: 57/8 · 4: 37/0 · 5: 23/0 · 7: 51/0 · 8: 49/9 · 9: 77/0 · 10: 71/1 · 11: 49/2 · 12: 46/0 · 13: 58/12 · 14: 2/0 · 15: 85/0. La consola está limpia en las 12 semillas.

## Hallazgos

### H1. Importante: emboscada sin aviso y sin parada si el héroe gana fuerza a mitad de marcha

`emboscadaOculta` mira solo el **primer** grupo con margen de la ruta y con la fuerza que el héroe tenía al salir. Si ese primero se ve, no vigila nada más, porque cuenta con que la emboscada salte ahí.

Pero si el héroe recoge la guarnición de su base por el camino (`garrison_taken`), el primer grupo deja de sacarle el margen y el héroe lo cruza sin batalla. Entonces le embosca un grupo posterior que no se veía al salir, y lo hace aunque ese grupo estuvo a la vista varios pasos antes.

Reproducción (`guiones/receta198.mts`, misma `Session` que el cliente), `?seed=198`:
1. Día 1: clic en (31,0). Se para en (12,4) («se detiene: ve 4 asaltantes…»).
2. Clic en (24,4). Batalla con un nodo: «Resolver sola». Fin de turno.
3. Día 2: clic en (11,27). Corta en (4,8). Fin de turno.
4. Día 3: el héroe está en (4,8) con fuerza 235 y solo ve a raider-1. La ruta a (28,15) avisa desde el paso 1, pero de **raider-1**: «Cuidado: … región de N asaltantes».
5. Clic en (28,15). En (4,9) el héroe recoge la guarnición y pasa a fuerza 288, así que raider-1 (420) ya no le saca 1,6.
6. raider-3 (612,5) **se ve desde (5,11)**, cuatro pasos antes. La marcha no se para.
7. **Emboscada de raider-3 en (10,14)**, con `faltan: 20`. El héroe pierde (`hero_defeated`, `hero_returned`).

Quien juega esperaba que la marcha se parase al ver a raider-3, como le pasa en los demás casos. Es justo lo que promete la opción C.

Frecuencia: 1 de 7260 marchas al azar. Con 100 semillas y 3 días no sale, y el día 1 tampoco (0/300). `medir.ts` no lo vería aunque pasara, porque da por avisada cualquier emboscada con aviso, sea del grupo que sea.

Lo que sí no estaba cubierto lo reconoce `implementacion.md` («La fuerza del héroe a mitad de marcha… En el día 1 de 100 semillas no ocurre»). Pero el caso no es solo teórico: pasar por la propia base con guarnición es lo normal en cuanto se recluta.

### H2. Menor: parada falsa con la misma causa

Si el héroe gana fuerza por el camino, la marcha se para por un grupo que ya no lo emboscaría, y la barra afirma algo falso.

En el navegador, `?seed=6` (`s6-falsa-*.png`, `RUEDA=4`):
1. Clic en (21,10). Emboscada: «Resolver sola».
2. Clic en (6,13). Recoge la guarnición (fuerza 210 → 366) y se para en (6,9): «Aldo de Valdeluz se detiene: ve 4 asaltantes que lo emboscarían más adelante.»
3. La misma ruta ya **no avisa** («Ruta: llegas hoy (4 pasos).»).
4. Al pulsarla llega sin batalla y toma el paso.

Frecuencia: 4 de 470 paradas en 300 semillas × 7 días (semillas 6, 120, 150 y 157). El día 1 no pasa: 0 de 429. Solo cuesta un clic, porque los puntos se conservan, pero la frase es falsa.

### H3. Importante: `pnpm capturas` sale 1 en la rama, y sobre `main` sale 0

Falla con este error:

> `desktop-15: el espejo mueve raider-2 y el lienzo no lo enseña (cambia 0 y 23261)` (semilla 50, día 2 → 3)

Se repite igual dos veces. Sobre `main` (`git archive main`, con assets y node_modules enlazados) da «cambia 20320 … 21312» y sale 0.

Lo instrumenté en copias del scratchpad, sin tocar el worktree:
- Antes de «Ver mapa entero», la rama dice «2 a la vista de la persona» y `main` dice 0. Es lo que cambia #130.
- En la foto de las muestras «antes» (`capturas-desktop15-antes-rama.png` frente a `…-antes-main.png`), el grupo «5» de raider-2 **no está en (19,2) en la rama**: está alrededor de una casilla más arriba a la izquierda. En `main` sí está en (19,2).

Causa probable: `posicionDeAsaltante` (`render/mapa.ts`) guarda la última casilla donde se pintó cada grupo. Un grupo que se pintó sobre la niebla, dejó de pintarse y vuelve a pintarse **se desliza desde aquella casilla vieja** a ritmo de marcha. Con la regla nueva los grupos entran y salen de la vista más a menudo, y el guion muestrea a mitad del deslizamiento.

No sé si arreglarlo toca al lienzo, porque un grupo que reaparece no debería caminar desde un recuerdo, o al guion. Pero el cierre que pide `CLAUDE.md` («sale 1 con un error») está en rojo, y el ingeniero no llegó a correrlo.

### H4. Menor (latente): `march_halted` cuenta al rival un grupo que no ve

`SE_VE_POR.march_halted = 'casilla'`. Un rival que ve la casilla del héroe parado recibe en su crónica `raider` y `troops`, y en el panel lee «Un héroe del jugador N se detiene: ve 6 asaltantes…», de un grupo cuya región no ve.

`guiones/fuga.mts` planta al rival a 3 casillas: 7 de 54 casos. Ejemplo, semilla 20: el rival recibe `{"kind":"march_halted",…"raider":"raider-2","troops":[{"creature":"royal_mummy","count":6}]}` y solo ve a raider-7.

Hoy no se llega a dar, porque la IA no se para nunca (0 `march_halted` en el banco) y el rival de una persona o del agente es siempre la IA. Morderá con dos jugadores agente (`agentPlayers` lo admite) o con dos personas.

### H5. Menor: «Ver mapa entero» y la parada no dicen lo mismo

Con el mapa descubierto, la ruta avisa del grupo porque los ve todos, pero el núcleo sigue mirando la niebla real y para la marcha. En `?seed=10`, «Ver mapa entero» y clic en (13,1): antes, «Cuidado: … 7 asaltantes…»; después, «se detiene: ve 7 asaltantes…» en lugar de la emboscada que se había aceptado. Es una herramienta de depurar: se anota y nada más.

### H6. Menor (documentación): CLAUDE.md sin actualizar e issues del plan sin abrir

La fila de la puerta única, la viñeta de Asaltantes con la ventaja declarada de la IA, la excepción de «bajo la niebla» y la frase del agente siguen en «propuesta» dentro de `implementacion.md`. Lo pedía el criterio 4.

## Workarounds usados
- **Clics sobre el lienzo calculados con el espejo** (`pixelDeCasilla`, `Session` en node con la misma semilla) y la rueda hacia fuera para que el destino cupiera. Es el método de `capturas.ts`. No afecta a quien juega, que hace clic donde ve.
- **Los destinos lejanos de H1 (31,0) y (28,15) no caben en el marco** ni en el tope de alejar (tile 40). H1 está reproducido con `Session`, que es la misma clase que maneja `main.ts`, y no con píxeles. Quien juega llegaría con la cámara: no lo esconde.
- **El mapa del agente**: le mandé un plan vacío para que se jugara el procedimental de la semilla y poder elegir destinos con un `newGame` local. El servidor lo dice («El mapa lo pone el generador procedimental»). No afecta al circuito.
- **H4** está montado plantando al héroe rival a mano en el estado. Por eso es latente y no lo doy como fallo de hoy.
- **H3** se instrumentó en copias del scratchpad (`main-src`, `rama-src`), no en el worktree.

## No probado
- **La partida ya terminada** con esta funcionalidad: no se puede andar (#158), así que no hay parada que ver.
- **Un agente que lleve a los dos jugadores**: H4 queda en latente.
- **Que el espectador vea durante la partida un grupo que el jugador solo ve por región**. Lo abrí con la partida ya terminada (`espectador-2.png`): se ven todos los grupos y la consola está limpia.
- `enfrentamiento.ts` no aplica, porque la IA de batalla no cambia.

## Incidencia de la máquina compartida
Otro agente QA mató hacia las 12:42 mi vite del 43217 (grupo 330538, `npm exec vite --port 43217`) al leer un `dev.pid` de la raíz del scratchpad compartido. Lo dice `dev.log`: «ELIFECYCLE Command failed» a las 12:42:12.

Todas mis pasadas de navegador con ese vite terminaron antes y con resultado: semillas 3-15, semilla 6 y «Ver mapa entero». El último intento, la semilla 198, cargó la página y salió por «fuera del marco», no por falta de servidor. `pnpm capturas` y el espectador usaron vites y servidores propios en otros puertos. **No se vio afectada ninguna comprobación**, y no hizo falta relanzarlo.

Al cerrar he comprobado libres 43217, 43230-43232, 44745/38373 (los servidores del agente) y los vites de `capturas`. No he matado nada ajeno.

## Veredicto

**No apto.**

El criterio central se cumple: 0 de 100 y 0 de 300 el día 1, con la parada, la barra, la crónica y el veredicto del agente funcionando. Además el banco, `qa`, `verify` y el barrido están en verde.

Pero hay dos cosas que no pueden quedarse así:
- **`pnpm capturas` está en rojo por un cambio de esta rama (H3)** y es una comprobación de cierre del repo.
- **La promesa absoluta de la opción C («nadie pisa una emboscada sin aviso; la marcha se para al ver el grupo») tiene un caso reproducible donde falla y el héroe pierde la tropa (H1)**, con la misma causa que la parada falsa (H2).

Las dos son correcciones acotadas. H4, H5 y H6 pueden ir con reservas.

---

# Re-verificación (vuelta 2, H1-H4), 07-10-2026

Sobre el mismo worktree, con los cambios sin commitear de la corrección (`vigiaDeLaMarcha`, `olvidarLosQueNoSePintan`, `SE_VE_POR.march_halted = 'casilla y grupo'`). Solo he mirado lo afectado y he hecho una pasada adversarial nueva sobre lo que cambió. Logs y guiones nuevos en el scratchpad de la sesión, subcarpeta `qa130b/`. Las capturas están en `capturas-qa2/`.

## Lo afectado

| # | Criterio / hallazgo | Estado | Evidencia |
|---|---|---|---|
| H1 | La marcha se para por el grupo que la emboscaría con la fuerza de ahora (semilla 198) | ✅ | **Navegador** (Playwright sin pantalla, vite propio en el 43317, 1400×900, 6 pasos de rueda; los destinos lejanos se alcanzan **arrastrando el mapa**, como haría quien juega). Pasos: `31,0` → se para en (12,4); `24,4` → batalla, «Resolver sola»; fin de turno; `11,27` → corta en (4,8); fin de turno; `28,15`. Antes de pulsar, la barra dice «Cuidado: … región de 6 asaltantes» (raider-1). Después dice «Aldo de Valdeluz se detiene: ve 7 asaltantes que lo emboscarían más adelante.», con el héroe en (5,11), 810 pm y hechos `garrison_taken,march_halted` (`s198-6.png`: el «7» flota sobre la niebla). Si se insiste, la ruta ya avisa de 7 («Cuidado: … región de 7 asaltantes») y la emboscada llega avisada (`s198b-7.png`). Consola limpia. Con `Session`, `receta198.mts`: el mismo `garrison_taken,march_halted`. |
| H2 | No hay parada falsa (semilla 6) | ✅ | Navegador, `RUEDA=4`: `21,10` → emboscada avisada, «Resolver sola»; `6,13` → antes «Tierras desconocidas · hoy andas 7 de los 7 pasos…». Llega a (6,13) con `garrison_taken,node_captured`, **sin `march_halted`** (`s6-2.png`). Antes se paraba en (6,9) con una frase falsa. Consola limpia. |
| 1 estricto | 300 semillas × 7 días, «avisada = la ruta nombraba a **ese** grupo» | ✅ | `dias13.mts 300 7`: «7273 marchas: ciegas 0; … paradas 467; paradas falsas 0». `RECLUTA=1 dias13.mts 300 7`: «7454 marchas: ciegas 0; paradas 435; paradas falsas 0». `medir2.mts 300` (día 1): «36554 rutas: sin aviso 0; avisada por un grupo y emboscada por otro 0». Los tres corren en ~10-30 s. |
| H3 | `pnpm capturas` en verde, dos veces seguidas | ✅ | 1ª: «desktop-15: raider-2 pasa de (19,2) a (18,3); el lienzo cambia 20311 en la casilla de ayer y 21343 en la de hoy · sin errores en consola · 234.2 s», salida 0. 2ª: «… cambia 20335 … 21398 · sin errores en consola · 238.7 s», salida 0. Las PNG están en `capturas-qa2/capturas-1/` y `capturas-2/`. |
| H4 | `march_halted` no le cuenta al rival un grupo que no ve | ✅ | `fuga.mts`: «casos 54, el rival lee en su crónica un grupo que no ve: 0» (antes, 7 de 54). `observa` se evalúa al sellar el hecho (`emit`), no al leer la crónica, así que el `throw` de «grupo que no está en el mapa» no puede saltar luego, cuando el grupo se disperse. |
| — | `pnpm verify` | ✅ | Salida 0: «Checked 221 files … Test Files 56 passed · Tests 1949 passed», 1 m 12 s. |
| — | `pnpm qa` | ✅ | Salida 0: «terminado por fin de partida: 1 mapa diseñado, 5 turnos de mapa, 28 decisiones de batalla y 1 ascenso». |
| — | Barrido | ✅ | `barrido-semillas.ts 100`: «sin terminar: 0/100 · 8 / 15 / 27 · peor caso 10 rondas». |
| — | `pnpm banco` | ✅ | «sha256 6157d75a464b8ab6b20a5c092e57cf3eb2b5e9ec48f0035b1fe3bf40b0a8ce89 · sin terminar 0/200 · ancla: igual». |

## Pasada adversarial sobre lo cambiado

**`vigiaDeLaMarcha`.** Guion nuevo: `qa130b/vigia.mts`. Juega 300 semillas × 7 días con `Session` (recluta, tres marchas al azar y pasa el turno). Cada día prueba **todas** las rutas de hoy más 60 lejanas, cada una sobre su copia, y comprueba cuatro invariantes:
- **I1, parada correcta:** el grupo que para existe, se ve, es el primero con margen (con la fuerza de ahora) en lo que queda, y no es el nombrado al salir.
- **I2, no se para nunca:** si la marcha acaba sin batalla ni parada antes del destino, el primer grupo con margen de lo que queda no es uno visible distinto del nombrado. Esto incluye la marcha cortada por el día.
- **I3, doble parada:** tras pararse, repetir la misma orden no vuelve a pararse, ni por ese grupo ni por otro.
- **I4, emboscada estricta:** solo embosca el grupo nombrado.

Resultado: `{"rutas":338459,"paradas":36719,"i1":0,"i2":0,"i3":0,"i3otro":0,"i4":0,"disp":759,"varios":33415,"variosParada":9474}`. Es decir, 0 en los cuatro invariantes sobre 338 459 rutas. 33 415 de esas rutas pisan ≥ 2 grupos con margen, y 9 474 de las paradas son de esas.

**El guardia muerde.** Lo comprobé con una copia saboteada en `qa130b/sabotaje/` (`if (false && cambio)`): **I1 = 287** (paradas por un grupo que ya no emboscaría o con otro delante) e **I2 = 16** (marchas que no se paran ante un grupo visible). Las demás comprobaciones salen igual.

**Un nodo que dispersa a mitad de marcha.** Lo repetí con `vigia-disp.mts` y `LEJOS=80`: 376 296 rutas y 1 353 marchas que dispersan un grupo por el camino, con los cuatro invariantes en 0. Incluye casos en que el grupo dispersado es **el nombrado** (`s6 d2 → (17,1)`: se dispersa raider-0, el avisado, y la marcha llega a su batalla de destino sin parada falsa). También casos en que se dispersa otro y el nombrado embosca después, avisado (`s8 d6`, 13 destinos). **No aparece ningún caso en que se disperse el avisado y la marcha se pare luego por otro grupo.** Esa rama del recálculo solo la cubre el código, y lo reconoce `implementacion.md`. Lo dejo como no probado, no como fallo.

**Lectura del código**, para lo que no se mide:
- Durante una marcha la fuerza solo sube y los grupos solo se van. Por eso el recálculo elige un grupo del conjunto de salida, y no puede aparecer una amenaza nueva que no estuviera en la ruta.
- `amenaza === avisado` compara objetos, y es estable: `state.raiders` se filtra (`game.ts:2315`) y no se recrea a mitad de marcha.
- La orden se para una sola vez, porque tras el `march_halted` hay un `return`.

**`olvidarLosQueNoSePintan` con zoom y cámara en movimiento.** Guion `qa130b/patrulla.mts`, con dos páginas de la misma semilla:
- A pasa el turno y no toca nada.
- B pasa el turno y, mientras el rival juega y los grupos patrullan, acerca y aleja tres pasos y arrastra 500×300 px ida y vuelta, 12 veces.
- Al final las dos pulsan «Centrar héroe» y se compara el lienzo píxel a píxel.

Resultado: semilla 50, 505 de 809 120 píxeles distintos; semilla 10, 201; semilla 13, 359. Es ruido de la animación en reposo, del orden de una figura, no un grupo fuera de su casilla. En `patrulla-s50-B-fin.png` se ven los grupos 5 y 7 en su sitio sobre la niebla. Consola limpia en las tres. Lo que se pierde es lo que ya reconoce `implementacion.md`: un grupo que sale de la ventana a mitad de su deslizamiento reaparece ya en su casilla. Con patrullas de menos de un segundo no lo he visto.

**La prosa nueva del agente**, por el canal real (`agente.mts`, semilla 6: servidor + WS + puente MCP):
- La petición `adventure_turn` lleva el texto nuevo: «…y que no era el que ya veías emboscarte al salir —uno que no veías, o el siguiente cuando por el camino ganas fuerza (la guarnición de tu base se recoge al pasar) y el primero deja de sacarte el margen—… el veredicto lo cuenta como marcha que entró parcialmente y dice qué grupo la paró… Una emboscada antes del destino también sale en el veredicto como marcha parcial.»
- El veredicto lo cumple: «Una marcha entró parcialmente, sin llegar: move_hero hero-1 → (28,20): se paró en (26,24), donde ve 4 asaltantes que lo emboscarían más adelante (raider-6); lo andado cuenta.»
- Salida 0.
- La frase es correcta pero no cita la otra causa del recálculo, que un nodo tomado disperse al avisado. Es menor (M1, abajo).

## Hallazgos nuevos

- **M1 (menor, prosa):** la nota del agente explica la parada por «ganas fuerza» y no menciona que un nodo tomado por el camino puede dispersar al grupo avisado, que es la otra cosa que hace que el siguiente pase a parar la marcha. No engaña: la regla general («no era el que ya veías emboscarte al salir») lo cubre. Pero el ejemplo deja fuera la mitad de los casos.
- Visto de paso, sin relación con este cambio: después de «Resolver sola» y tras un `march_cut`, la barra queda vacía («»). No lo toca #130.

## Workarounds

- **Arrastrar el mapa antes de pulsar un destino lejano** (`qa130b/clics.mts`, paso `x,y@dx,dy`). La cámara del espejo se rehace con `arrastrar` y la misma cuenta del cliente. Es lo que hace quien juega, y no oculta nada. Sustituye al workaround de la vuelta 1, que reproducía la 198 solo con `Session`.
- **H4** sigue montado plantando al héroe rival a mano: el hecho es latente hoy.

## No probado

- **Dispersión del grupo avisado seguida de una parada por otro grupo:** ninguna de 376 296 rutas lo produce, y no hay test que lo monte.
- **Dos jugadores agente** (H4 en vivo): igual que en la vuelta 1.

## Procesos

- Arranqué un vite en el 43317 con `set -m` (grupo 391287, cwd en el worktree).
- Antes del `kill -TERM -391287` comprobé el grupo, el cwd y el puerto. Después, el puerto quedó libre y el hijo 391319 había muerto.
- `pnpm capturas`, `pnpm qa` y `agente.mts` levantan y paran lo suyo. Al cerrar, ningún puerto en escucha tiene su cwd en este worktree.
- No he matado nada ajeno.

## Veredicto

**Apto.**

- H1-H4 están corregidos y los he reproducido en el flujo real: la semilla 198 y la 6 en el navegador, la medida estricta en 300×7 con 0 ciegas y 0 paradas falsas, `capturas` en verde dos veces y `fuga` con 0 de 54.
- La pasada adversarial sobre `vigiaDeLaMarcha` da 0 en sus cuatro invariantes sobre 338 459 rutas, y el guardia muerde con el sabotaje.
- El banco no cambia (`6157d75a…`).
- La desviación de la regla («no es el avisado» en lugar de «no se veía al salir») es la que hace cumplir la medida estricta, y no produce dobles paradas: I3 = 0.
- Quedan sin efecto sobre el veredicto M1 (prosa) y la rama de dispersión del avisado, que no he podido probar.
