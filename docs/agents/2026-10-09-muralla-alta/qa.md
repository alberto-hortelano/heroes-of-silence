# QA — muralla alta

Validado sobre el árbol sin commit de la rama `asalto` (worktree `heroes-asalto`),
tras «/simplify». No he tocado código de producción. Las capturas están en
`capturas/qa/`. Los guiones de prueba están fuera del repo, en el scratchpad de la
sesión: Playwright sin pantalla con clics reales y un espejo en Node, igual que el
del ingeniero.

Para el navegador lancé `npx vite --port 4591 --strictPort` con `set -m` en su
propia línea (PID 1178312, que es su propio grupo; `cwd` = el worktree). Lo maté con
`kill -TERM -1178312`, y `ss` después dice «4591 libre». No queda `data/borradores/`.

## Criterios

| # | Criterio (requisitos.md) | Estado | Evidencia |
|---|---|---|---|
| 1a | El defensor sube andando | ✅ | Navegador, semilla 21, «Línea con puerta» con hueco en (7,0). Al hacer clic en lo alto de la columna (7,5), el Arquero (derecha, a mano) queda en `7,5 arriba=true`. El Guerrero con escudo, a mano, sube de 10,3 a 7,1 y golpea en lo alto (captura `a6-lucha-arriba.png`). |
| 1b | El atacante solo con `subir` | ✅ | Clic real del Orko desde el suelo (0,3) en la columna 7,6 (semilla 33). La barra dice «A la muralla no se sube andando: desde su pie, «Subir».» y el Orko no se mueve (`b5-clic-columna-desde-suelo.png`). Al Escudero le sale «… «Poner escalera».». Al troll de 2 casillas: «Una unidad de dos casillas no sube a la muralla.» y no le aparece `subir`. |
| 2a | En el suelo no hay tiro a través de muro ni puerta | ✅ | El Goblin arquero (0,1), con el puntero sobre el Guerrero (10,3) y el Esqueleto (10,5), que están en el suelo dentro, ve «El muro está en medio, y no alcanza a esa unidad cuerpo a cuerpo este turno.» y no tiene `shoot`. Al revés, el Esqueleto (10,5) contra el Escudero (5,3) y el Orko (4,5): «el muro está en medio», no es legal. |
| 2b | Desde lo alto y hacia lo alto, sí | ✅ | El Arquero en lo alto (7,5) dispara al Escudero en el suelo (log `shoot`). El Goblin dispara al Arquero de la columna (`legal shoot=true`). El Esqueleto, desde el suelo dentro, dispara al Orko subido en 7,6. |
| 3 | Cuerpo a cuerpo y «trabado» solo al mismo nivel | ✅ | El Arquero de (7,5), con el Orko al pie en (6,5), sigue sin estar trabado y la ficha le ofrece disparar. La lucha arriba entre 7,1 y 7,2 funciona (con represalia). La sonda de núcleo con una voladora atacante contra un arquero en lo alto solo ofrece golpes desde muros (7,4 y 7,6). |
| 4 | +3 de defensa al tirador en lo alto (`data/muralla.json`) | ✅ | Panel del Arquero en lo alto: «Ataque / Defensa 5 / 3 (+3 en lo alto)» (`b2-arquero-arriba-panel.png`). El JSON lleva `defensaEnLoAlto: 3` con su `_comment` de inventado. |
| 5a | Escalera: un turno para ponerla sin haberse movido | ✅ | El Escudero llega al pie moviéndose y la barra dice «Ya se ha movido este turno: se llega al pie y se sube en el turno siguiente.». En el turno siguiente pulsa «Poner escalera», elige entre 2 columnas marcadas («Elige el muro: pulsa en lo alto…») y sale `ladder_placed` con `¿sigue su turno? false` (`a5-escalera-puesta.png`). |
| 5b | Otro turno para subir, y después no hace nada más | ✅ (⚠️ con moral, ver M3) | Turno siguiente: «Subir» da `climbed` 6,3→7,2 con `¿sigue su turno? false`. Lo mismo con el Orko con «Escalar»: sube en un turno sin escalera. |
| 5c | La escalera se queda y la usan otros | ✅ | IA contra IA en el navegador, semilla 5, «Semicírculo»: el Piquero pone su escalera en 6,2→7,2 (ronda 3) y el Goblin lancero sube por ella en la ronda 7. En la sonda de núcleo, cuando el que estaba arriba muere, el muro queda libre y otro sube (`subirBlocker` = `null`). |
| 6 | Columnas visibles, figuras elevadas y clic en la columna | ✅ | Capturas `a6`, `b3`, `c-3`: prismas de piedra, las figuras sobre la tapa y la puerta plana en madera. Los clics en lo alto mueven al defensor y posan a la voladora (6,5 → 7,6). |
| 7 | Arena: «Escalar», «Lleva escalera», «Poner escalera» y «Subir» | ✅ | En la ficha del Orko aparece «escala murallas». «Lleva escalera» sale solo a la izquierda (6 casillas a la izquierda, 0 a la derecha). Los botones están, deshabilitados y con el motivo en `title`. |
| 8 | IA: los defensores tiradores suben y disparan; los atacantes sin camino escalan | ✅ | Semilla 5: el Arquero y el Ballestero de la IA están en columnas (`c-3.png`). Los atacantes ponen escalera (rondas 3) y suben (rondas 3, 7 y 9). La batalla termina en la ronda 9 («gana el atacante»). |
| 9 | Sin muralla, nada cambia | ✅ | `pnpm banco`: `sha256 9fc436ed18eca65215e021f5f41dafbb33f072ec7d193d85d5e9262f65b12937`, «ancla: igual». `enfrentamiento.ts`: `1008/2000 = 50.40 %`, `15 · 978 · 7`, `peor 16, media 3.81`, colas 6439/25 · 6427/23, idéntico al del ingeniero. `barrido-semillas.ts`: 0/40 sin terminar, peor batalla 10 rondas. |

**Comprobaciones fijas**
- `pnpm verify`: salida 0, `Test Files 103 passed · Tests 2603 passed | 12 skipped`, 2 min 50 s con carga ~25-30.
- `pnpm qa`: salida 0, «1 mapa diseñado, 6 turnos de mapa, 58 decisiones de batalla y 1 ascenso».
- Consola del navegador: sin errores ni avisos en las tres sesiones (dos a mano y una IA contra IA).
- `pnpm verify:lento`: salida 1, `3 failed | 4358 passed (4361)`, con `uptime` de 35,8 al empezar y 31,7 al acabar (pico de 57 durante la corrida), en 16 núcleos.
  - Los tres fallos son `Test timed out in 60000ms` y no hay ningún `AssertionError`. Son `acantilado-linea` (34×34, 1-200), `bordes` (1-40) y `regiones` (200 semillas).
  - Lo repetí una vez, solo esos tres ficheros, con `HEROES_LENTO=1 --testTimeout=400000`: `Test Files 3 passed · Tests 95 passed`.
  - El diff no toca nada del escenógrafo ni del generador (`git diff --name-only | grep escenario|core/map|generate|vestir` sale vacío). Lo único compartido son `data.ts` (añade `MURALLA`) y `types.ts` (un rasgo nuevo).
  - **Veredicto: es carga, no regresión.** Con la máquina descargada no lo he podido correr entero.

## Hallazgos

### Importante

**I1. El texto de ayuda del editor de murallas dice lo contrario de las reglas nuevas.**
- La página de montaje (`src/client/arena/paneles.ts:454`) sigue diciendo: «El muro cierra el paso a los dos bandos; … Los voladores pasan por encima y no se posan.»
- El `_comment` del borrador (`src/core/arena-murallas.ts:119`) dice lo mismo.
- Ahora el defensor sube andando, el atacante sube con escalera o escalando, y la voladora se posa.
- Reproducción: `pnpm arena` y mirar el panel «Muralla», bajo los botones Muro/Puerta/Goma (`capturas/qa/0-arena.png`).
- Quien juega esperaba una explicación de cómo se sube y quién puede hacerlo. Lo que lee le hace creer que el muro es infranqueable.

**I2. El motivo del botón «Subir» niega una escalera que se ve.**
- Escenario: una unidad está al pie de una escalera puesta y otro muro sin escalera le toca antes en `neighbours`. Entonces el `title` del botón deshabilitado dice «No hay escalera puesta ahí y no sabe escalar.».
- El motivo real es que el muro de la escalera está ocupado («En ese muro está Escudero»).
- Causa: `escalaBlocker` toma `murosAlPie(state, s.hex)[0]` (`battle.ts`, `escalaBlocker`) en vez del muro que tiene escalera, o del motivo más relevante.
- Reproducción en el navegador (semilla 21):
  1. Cargar «Línea con puerta» y quitar el muro (7,0).
  2. Montar el Escudero con escalera y el Goblin lancero a la izquierda, a mano.
  3. El Escudero pone la escalera en 6,3→7,2 y sube.
  4. El lancero llega a 6,3.
  5. Resultado: el botón dice «No hay escalera puesta ahí…» mientras la escalera está dibujada a su lado.
- Reproducción en el núcleo: escalera 6,3→7,2, un aliado en 7,2 y la activa en 6,3. `escalaBlocker(st,'subir')` devuelve «no hay escalera puesta ahí y no sabe escalar», mientras que `subirBlocker(7,2)` devuelve «en ese muro está Espadachín».

### Menor

**M1. «Lleva escalera» se puede marcar donde no tiene efecto.**
- Se ofrece y se marca en una unidad de 2 hexes o voladora del bando izquierdo, y luego se descarta sin decir nada (`createBattle` la filtra).
- En la semilla 5 marqué la del troll de 2 hexes: no la usa y nadie lo dice (`c-montaje.png`).
- Quien juega esperaba que el checkbox no saliera, o un aviso de que esa unidad no puede escalar.

**M2. Legibilidad de las columnas.**
- Con dos figuras en columnas vecinas (7,1 y 7,2, o 7,5 y 7,6), los cuerpos y los rótulos se solapan y cuesta saber quién está en qué columna (`a8-final.png`, `b3`).
- La escalera es un marcador pequeño que tapa la figura del pie o queda detrás (el lancero en 6,3 casi no se ve en `a8`).
- El ingeniero ya lo declaró como marcadores sin arte.

**M3. Laguna latente: la buena moral regala un turno justo después de «Subir» o «Poner escalera».**
- `endTurn` puede abrir un turno extra por moral. Ese turno sí permite atacar tras subir, y subir justo después de poner la escalera, en la misma ronda.
- Sonda de núcleo, «Línea recta», espadachín con moral +3 en 6,4 y el muro en 7,4: 54 de 400 semillas de rng dan el turno extra tras `subir`, con `attack:defender-0` legal; por ejemplo la semilla 7. Otras 54 de 400 lo dan tras `poner_escalera`, con `subir` legal en ese mismo turno extra.
- **Hoy no se alcanza:** la arena fija la moral a 0 (`arena.ts`, `bandoDeArena`), y ninguna batalla del juego lleva muralla. En 300 batallas IA contra IA de la arena hubo 0 casos.
- Los tests lo esquivan a propósito («Sin moral: un turno extra por la buena hace que «cierra el turno» no se vea»).
- Cuando haya murallas con moral en el juego, chocará con «al subir … no pueden atacar ni hacer nada más ese turno». Hay que decidir si `climbed`/`ladder_placed` niegan el turno de moral.

**M4. La IA del atacante es pasiva o da vueltas.**
- En la semilla 5 («Semicírculo»), el Piquero gasta su escalera y luego se defiende 3 rondas seguidas en (3,2). El Orko baja dentro y vuelve a subir (`climbed` en 8,7→8,8, ronda 9).
- Ya lo anotó el ingeniero. No rompe ningún criterio.

**M5. «Poner escalera» y «Subir» salen también en el panel del defensor, siempre deshabilitados.**
- Ocupan sitio sin servirle a quien defiende (`b2-arquero-arriba-panel.png`).

## Workarounds usados

- **Vida 300 y estadísticas tocadas por la ficha** (velocidad 7 a la voladora, ataque 30 al mandoble, vida 5 al orko). Se hicieron por la propia ficha de la arena, que es un flujo de quien juega. No es un obstáculo para el usuario.
- **El espejo en Node** solo calcula dónde hacer clic. Comprobé turno a turno que la unidad activa coincide con la página, y nunca se desincronizó. No afecta al usuario.
- **Las sondas adversariales de núcleo** (moral, muerte arriba, pie ocupado, voladora atacante, tirador en la puerta) colocan los stacks a mano. Las uso solo para los casos que el flujo real no alcanza en tiempo razonable. Lo alcanzable (I2) también lo reproduje en el navegador.

## No probado

- **La muerte en lo alto en el navegador**, con el cadáver pintado sobre la columna. En el núcleo sí: el muro queda libre y otro sube. En mi partida a mano el orko de 5 PV no llegó a subir.
- **El espectador con muralla**: ninguna batalla del juego la tiene. `pnpm qa` está en verde.
- **`pnpm capturas`**: no lo corrí, para respetar el presupuesto de pruebas con la máquina a carga 30-57. El ingeniero lo dio en verde (326,7 s).
- **El fuzz de miles de batallas**: me quedé en 300 batallas IA contra IA, por la regla de presupuesto.
- **`pnpm verify:lento` entero con la máquina descargada.**
- **La moral distinta de 0 en la arena**: no existe hoy.

## Veredicto

**Apto con reservas.** Todos los criterios literales se cumplen en el flujo real: subir andando o con `subir`, escalera en dos turnos y nada más tras subir, la escalera compartida, la línea de tiro, el cuerpo a cuerpo por nivel, el +3, las columnas con clic y la IA de los dos bandos. Sin muralla todo queda idéntico (banco con el mismo hash y enfrentamiento idéntico). Las reservas son I1 y I2, dos textos que le mienten a quien juega y se arreglan en una tanda corta, y la laguna latente de la moral (M3), que hay que decidir antes de llevar murallas al juego.

## Vuelta 2

Se vuelven a comprobar solo I1, I2, M1, M3, M5 y la parte de M2 que se arregló, más una pasada adversarial corta. El árbol sigue sin commit y no he tocado código de producción. Las capturas están en `capturas/qa2/` y las sondas en el scratchpad de la sesión (`probe/moral2.mts`, `i2b.mts`, `jugar3.mts`, `m1.mts`).

Para el navegador lancé `npx vite --port 4596 --strictPort` con `set -m` en su propia línea. El PID 1284705 era su propio grupo y su `cwd` era el worktree. Lo maté con `kill -TERM -1284705`, y `ss` después dice «4596 libre». No queda `data/borradores/`.

Siguiendo el presupuesto, no he repetido `pnpm banco`, `pnpm qa` ni `verify:lento`. Cito los del ingeniero en `implementacion.md` («Tras QA»): el banco da `9fc436ed…` con «ancla: igual», `qa` sale 0, y `verify:lento` da 3 tiempos agotados del escenógrafo que pasan solos. El fuzz del ingeniero (200 batallas con moral, 0 violaciones) no lo he repetido.

| Hallazgo | Estado | Evidencia |
|---|---|---|
| `pnpm verify` | ✅ | Salida 0, `Test Files 103 passed (103) · Tests 2608 passed \| 12 skipped (2620)`, en 61 s con una carga de 5 a 24. |
| I1, ayuda y `_comment` | ✅ | El panel «Muralla» de la arena dice la regla nueva: el muro alto, la derecha sube andando, la escalera en un turno para ponerla y otro para subir, escalar, los voladores se posan, la grande no sube, la puerta solo la cruza la derecha, y en el suelo no se dispara a través (`capturas/qa2/m1-marcada-y-luego-vuela.png`). `COMENTARIO_DEL_BORRADOR_DE_MURALLAS` interpola la misma `REGLA_DE_LA_MURALLA`. El `grep` de «cierra el paso / no se posan / sobrevuel / infranqueable» en `src/` y `data/` no deja ningún texto vivo con la regla vieja: solo comentarios de código que hablan de la historia o de otra cosa. |
| I2, motivo de «Subir» | ✅ | **Navegador**, semilla 21, «Línea recta», dos Escuderos con escalera y un lancero, todos a mano. Escudero A pone su escalera en 6,1→7,2 y Escudero B en 6,3→7,3, y los dos suben. El lancero llega a 6,3, que tiene tres muros al pie (7,2 y 7,3 con escalera y ocupados, y 7,4 libre sin escalera). El `title` de «Subir» es «En ese muro está Escudero.» (antes era «No hay escalera puesta ahí…»). **Núcleo** (`i2b.mts`, siete casos), y el motivo es el que se espera en todos: escalera ocupada → «en ese muro está Espadachín»; dos escaleras desde el mismo pie, las dos ocupadas → el ocupante; rasgo `escalar` con 7,2 ocupado y el resto libre → `null` (sube a otro); con los tres ocupados → el ocupante; lleva escalera y la puesta está ocupada → «Subir» da el ocupante y «Poner escalera» da `null`. |
| M1, «Lleva escalera» | ✅ | Navegador, adversarial: marco la casilla en un lancero y luego le doy «vuela» en la ficha. La casilla pasa a `disabled=true checked=false` con «No la usa: vuela: se posa en la muralla sin escalera.». Al quitarle «vuela» vuelve a `checked=true`: se conserva, como dice el ingeniero. Con 2 casillas sale «No la usa: una unidad de dos casillas no sube a la muralla.». La consola, sin errores. |
| M3, sin turno de moral tras escalar | ✅ | `moral2.mts`, espadachín con moral +3 al pie, 400 semillas de rng por acción. Turno extra o evento `morale`: `subir 0`, `poner_escalera 0`, y en el control `defend 54` (en la vuelta 1 salían 54 y 54). Coincide con el test `-t 'tras QA'` del ingeniero, que vio morder. |
| M5, botones del defensor | ✅ | Navegador: «[M5] defensor Arquero: botones de escala en el panel = 0» y lo mismo con el Guerrero con escudo. Al atacante de una casilla le siguen saliendo los dos. |
| M2 (parte), la escalera se ve | ✅ | La escalera que se apoya **desde detrás de su muro** (pie 6,1, más atrás que la columna 7,2), que nadie había visto en pantalla. Se pinta entera sobre la cara de arriba de su columna, ancha y con sus peldaños, y la columna no la tapa (`capturas/qa2/d2z-escalera-attacker-1.png`). La de lado, 6,3→7,3, también se lee (la misma captura y `d4z-lancero-zoom.png`). Con las dos escaleras y dos figuras arriba, las dos se distinguen. |

**Pasada adversarial (lo que encontré)**
- **Varios muros al pie, con y sin escalera.** El caso de 6,3, con tres muros al pie, dos escaleras de pies distintos y dos ocupantes, da en el navegador y en el núcleo el motivo correcto (arriba).
- **M3 con `defend` como control.** El control muerde: la moral sigue regalando turnos fuera de la escalada.
- **Orden de pintado.** Con la figura activa delante (Escudero B en 6,3), su rótulo y su cuerpo tapan la mitad de la escalera de 6,1→7,2 (`d2-escalera-attacker-0.png`, `d3z-sube-attacker-0.png`). Es el solape de rótulos y cuerpos que quedó en el backlog (M2), no la columna. En cuanto B se mueve, la escalera se ve entera.
- **Consola del navegador**: sin errores ni avisos en las dos sesiones.

**Hallazgos nuevos (menores, para el backlog)**
- **N1.** Con dos unidades del mismo nombre, el motivo no dice cuál ocupa el muro. Con dos «Escudero» en el campo, el `title` de «Subir» es «En ese muro está Escudero.», mientras que la arena las rotula «Escudero A» y «Escudero B». El núcleo escribe `unit.name`. Para reproducirlo: arena, semilla 21, «Línea recta», dos Escuderos con escalera y un lancero a la izquierda; los Escuderos ponen escalera en 6,1→7,2 y 6,3→7,3 y suben, y el lancero llega a 6,3.
- **N2.** Si la escalera puesta en un muro sale **de otro pie**, el lancero pegado a ese muro lee «no hay escalera puesta ahí y no sabe escalar» con la escalera dibujada a su lado. Es cierto, porque desde su pie no puede usarla, pero no le dice desde dónde se sube. Para reproducirlo en el núcleo: «Línea recta», escalera 6,1→7,2 y la activa en 6,3 (caso C de `i2b.mts`).
- **No es un hallazgo:** al pasar el ratón por una columna, la barra no dice nada. El motivo de no poder subir andando sale solo al hacer clic (el rótulo al pasar el ratón es solo sobre enemigos, `motivoSinGolpe`). Así era ya antes de este ciclo.

**Veredicto de la vuelta 2: Apto.** Los seis arreglos se cumplen en el flujo real o, en M3, en el núcleo, que es donde vive la moral. N1 y N2 son menores y van al backlog.
