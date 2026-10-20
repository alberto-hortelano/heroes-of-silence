# QA — la labranza en campos (20-10-2026)

## Veredicto: **apto con reservas** (primera pasada; ver «Re-verificación 1» al final para el veredicto vigente)

Los once criterios se cumplen, y las cuatro comprobaciones lentas salen en verde: `pnpm verify`, `pnpm verify:lento`, `pnpm capturas` y la partida jugada en Chromium sin errores en consola. Lo que no se ha tocado no cambia: 0 sprites distintos en 11 semillas que el ingeniero no había usado, contra una copia de HEAD. Quedan dos reservas:

1. **Criterio 3, «se lee como campos al primer vistazo»: lo juzga el usuario**, con `s15-antes-despues.png` y `s19-antes-despues.png`. Mi opinión: alejado, sí (`qa/juego-s15-alejado.png`). Al zoom de juego, el campo es una manta de rombos con el borde en dientes de sierra, y se lee como campo y no como confeti.
2. **Cuatro hallazgos menores de arte y colocación** (abajo), ninguno bloqueante. Además, la decisión de que las casas tengan volumen no se nota en la práctica: **ninguna figura llega a quedar detrás de una casa**. Ninguna se pierde, pero lo que se ve es un héroe de pie encima de una casa.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Parcelas una por casilla, centradas, sin giro ni corrimiento al azar, en manta | ✅ | `test/labranza.test.ts` (en la escena s15/s19: centradas en su casilla o en la junta, `plano: true`, en `separar(…).planos`). En el juego (s15, s19, zoom 70 y 110), los campos son mantas continuas. La desviación declarada son las parcelas de **junta** entre filas, que son de más sobre «una por casilla». Sin ellas había un damero, y me parece bien. |
| 2 | Un cultivo por campo, campos de ~3-6 casillas | ✅ | Test puro: mediana 3-6, ninguno de más de 7. Medido por mí en la escena (manchas en cruz de un mismo cultivo por la caja de cada parcela, método aproximado): mediana 3 / 4 / 4 / 4 / 4 y máximo 7 / 6 / 7 / 7 / 5 en s15 / 19 / 11 / 13 / 14. El tope del código es 7, uno por encima del «3-6» orientativo. |
| 3 | Lindes y barbecho; s15 se lee como campos | ✅ técnico / ⚠️ juicio del usuario | 34,5 % de la labranza sin parcela (`barbecho.mts`, del ingeniero), y nunca dos campos vecinos en barbecho (test). Visto en el juego: la tierra se ve entre campos y no hay alfombra. |
| 4 | Atrezo pocos, con sentido, nunca en la reserva; piedras y matas como relleno ralo | ✅ | Atrezo en 10 semillas nuevas: de 3 a 7 por mapa (`guardias.mts` 11-14, 16-18, 20-22). Lo comprueban los tests del atrezo (almiar junto al trigo, carreta junto a camino o pueblo, cerca en el borde sur, separados). `ponerEntera` mira `obstaculos.pisa`, que incluye las reservas. Observación: en `s19-despues.png` hay un almiar solo en mitad del barbecho, a una casilla del trigo (H5). |
| 5 | Sin pradera en la labranza | ✅ | `MEZCLA.dirt = [['dirt', 1]]`. El test «sin pradera en la tierra que se pisa» lo vio morder el ingeniero. |
| 6 | Tono bajado | ✅ | `TONO_DE_LA_LABRANZA = 'saturate(0.65) brightness(0.88)'` para `cubierta-dirt` y `casas`. En el juego (s15, s19), las minas, el carro de mineral, el héroe, la carreta y el cofre se leen sin buscarlos (`qa/juego-s15-heroe-al-norte-de-la-casa.png`, `qa/juego-s19-inicio.png`). |
| 7 | Los guardias del escenógrafo siguen a 0 | ✅ | `guardias.mts 11 12 13 14 16 17 18 20 21 22`: todos a 0 salvo `carasCortadas` = 1 en s14 y s22, **el mismo valor en HEAD** (`guardias.mts 14 22` sobre la copia de HEAD; es medida conocida, CLAUDE.md). `pnpm verify:lento` (1-40 y lo demás): `Test Files 143 passed (143) · Tests 5294 passed (5294)`, 254 s. |
| 8 | No mueve el resto (corriente propia) | ✅ | Lo demuestra el criterio 9: con 0 diferencias fuera de la labranza, las tiradas no se han movido. |
| 9 | Lo que no es labranza no cambia | ✅ | **Comprobación independiente**: `sin-cambios.mts` con otra lista de semillas (11-14, 16-22) y la línea base sacada por mí de `git archive HEAD` en el scratchpad (no la `.cache/labranza/antes.json` del ingeniero): `total: 0 diferencias` (4177…7759 sprites por mapa, iguales). |
| 10 | Casas sueltas pocas, pequeñas, separadas, fuera de reservas y senda, con volumen | ✅ con hallazgos menores | 13 casas recortadas, de 0,53 a 0,76 casillas de ancho, de 2 a 5 por mapa en mis 10 semillas, `plano: false` y a Chebyshev ≥ 4 (test). En el juego: s15 (3,6) y s19 (5,3) se leen como un caserío, mucho menores que el pueblo. Ver H1-H3. |
| 11 | Imágenes antes/después de s15 y s19 | ✅ | `s15-antes-despues.png`, `s19-antes-despues.png` y las anchas, en la carpeta. |

Comprobaciones generales:

- `pnpm verify`: exit 0, `Test Files 142 passed | 1 skipped (143) · Tests 3412 passed | 14 skipped`, lint «No fixes applied», 87 s.
- `pnpm verify:lento`: exit 0, 143/143 ficheros y 5294 tests, 254 s. Las 10 «infos» de lint son de `tools/taller/unidades.ts`, que esta tarea no toca.
- `pnpm capturas`: exit 0, «sin errores en consola», 650 s con la máquina cargada (carga 20-25).
- Partida en Chromium sin pantalla (`navegar.mts` del scratchpad: vite propio en un puerto libre y en su grupo, matado al final, puerto comprobado libre): s15 y s19, 5 cargas, **0 errores y 0 avisos de consola**. El suelo llega a «pintado» en 9-11 s.
- `pnpm qa` no se ha corrido: no se toca `src/server/` ni el contrato.

## Hallazgos

Ninguno bloqueante ni importante.

### H1 (menor) — Las casas van sobre casillas que se pisan: el héroe se pone encima y la tapa

Se reproduce así: `pnpm dev`, `?seed=15`, pulsar la casilla (3,6) (la casa de junto a la carreta, al norte del castillo; se llega hoy con 790 puntos) y acercar.

**Qué se ve** (`qa/juego-s15-heroe-en-la-casilla-de-la-casa.png`): el héroe queda de pie delante de la casa y la tapa casi entera; entre sus piernas asoma el tejado. Con el héroe una casilla al norte (s15 (3,5) y s19 (5,2): `qa/juego-s15-heroe-al-norte-de-la-casa.png`, `qa/juego-s19-heroe-al-norte-de-la-casa.png`), la chimenea roza el aro del héroe y no tapa nada.

La razón es que la casa tiene el pie en `y + 0,8` (`labranza.ts`, `casas.push`), igual que los pies del héroe (`PIES.heroe = 0,8`). A igual clave se pinta antes el volumen, así que la figura de su casilla va siempre delante. La casa mide como mucho 0,81 de alto y no llega a la figura de la casilla de arriba.

**Por qué importa poco**: la figura no se pierde nunca, y eso era lo pedido. Pero la decisión del usuario («una figura puede quedar detrás de una casa como detrás de un árbol») no llega a verse: ninguna figura queda detrás. Lo que sí se ve es un héroe, un grupo o un asaltante de pie encima de una casa, cosa que no pasa con un árbol, que nunca está en una casilla que se pisa. Si molesta: poner la casa en una casilla de la labranza que no se pise no es posible (toda la labranza se pisa), así que haría falta bajar su pie o correrla en su casilla. Lo decide el usuario.

### H2 (menor) — Cuatro casas llevan un trozo de la vecina, con el corte recto

En `qa/casas-2-3-7-11-con-trozos.png` (las imágenes ampliadas): la 3 lleva arriba a la derecha un trozo de pared y un barril de otro edificio; la 7, una cuña oscura de la pared de la de detrás; la 11, un trozo de cerca o de parra; y la 2, un borde recto cortado a la izquierda y una mota roja abajo. El ingeniero lo declaró para la 2 y la 7. La 3 y la 11 también. Cada trozo es un 5-10 % de la casa: entre 3 y 8 px al zoom máximo, y se ve como un sprite mal recortado si uno se fija. Se arregla con más semillas de «resto» en `tools/taller/casas.ts` o quitando esas cuatro casas, que dejaría 9.

### H3 (menor) — Una casa pegada a una mina se lee como parte de ella

En s15, la casa de (30,34) está justo al norte de la mina de (30,35) (`qa/taller-s15-casa-pegada-a-la-mina.png`, en el centro). Cumple la regla, porque está fuera de la reserva de la mina. Pero se lee como «la caseta de la mina» más que como un caserío de campo. Pasa también, a dos casillas, en s15 (3,6) con la mina de (1,4), en s15 (40,40) con la de (39,39) y en s19 (39,28) con la de (38,27) (`donde.mts` del scratchpad). Si se quiere evitar, bastaría con exigir a la casa una distancia mínima a minas y recursos, como ya se hace con `cercaDePueblo`.

### H4 (menor, ya declarado) — Parcelas bajo la copa del bosque

En `s19-despues.png`, abajo a la derecha, un campo de gavillas pasa bajo los pinos del bosque vecino: la parcela, de 1,3 casillas, asoma en la casilla del bosque. Se ve como «trigo dentro del bosque». Ningún guardia lo mide.

### H5 (menor, de poco peso) — Atrezo y parcelas sueltas

- En `s19-despues.png` hay un almiar solo en el barbecho. La regla lo pone junto a una casilla de un campo de trigo, pero si la parcela de esa casilla no entró (senda o reserva), queda solo.
- Con mi medida aproximada, 12 de las 57 manchas de cultivo de s15 son de una sola casilla. Puede ser ruido del método (las parcelas de la linde van corridas y mi tolerancia las cuenta como juntas). En las imágenes no se ve confeti.

## Workarounds usados

- **La cámara del guion la llevo yo**: la deduzco con `centrarEn` y `acotar`, las funciones del cliente, y la muevo arrastrando con el ratón de verdad. No falsea nada, es lo que hace la persona. Un primer intento de pulsar (3,5) cayó fuera del lienzo y el héroe no se movió. Fue un error de mi guion (la casilla quedaba por encima de la vista), no del juego: repetido tras arrastrar, el héroe va.
- **Pulsé casillas sin explorar** (s15 (3,6) y (3,5)), como haría quien juega. El juego traza la ruta y anda.
- **Recortes del taller** (`.cache/taller/escenario/15.png` y `19.png`, del ingeniero, solo leídos) para ver H3, que en la partida queda bajo la niebla. No afecta al usuario: es la misma escena sin niebla.
- **Ningún estado forzado**, ni pantallas saltadas, ni nada pintado a mano.

## No probado

- **Pantalla con dpr > 1 y móvil** con la labranza a la vista. Las pasadas de móvil de `pnpm capturas` usan las semillas 2 y 16 y no miran la labranza en particular.
- **La labranza del rival bajo la niebla**: solo la he visto en el taller, sin niebla.
- **Un asaltante o un grupo andando sobre una casa**: debería ser lo mismo que H1, porque `PIES.grupo` = 0,82 > 0,8 y va delante, pero no lo he visto.
- **El espectador**: `pnpm capturas` lo recorre sin errores (semilla 2), pero no he mirado la labranza en él. Usa el mismo `componer`.
- **1-40 a mano**: no he repetido los guardias en 1-40. Los cubre `verify:lento`; yo he hecho 10 semillas nuevas más la 15 y la 19.

---

# Re-verificación 1 (20-10-2026, tras «Corrección de QA 1»)

## Veredicto: **apto con reservas**

Se corrigen H2, H3, H4 y H5, y la decisión del usuario sobre H1 («la 3») se cumple: en 1-100, ninguna casa queda a menos de 2 de un camino ni a menos de 3 de un objeto. En 40 partidas de IA, ningún héroe acaba un turno sobre una casa. La pasada adversarial da **un hallazgo nuevo, importante pero no bloqueante**. Al apartar las casas de caminos y objetos, muchas acaban al borde de un bosque, y los pinos de la fila de delante las tapan. Es **1 de cada 5 casas**, y en s2 y s6 es la única del mapa (RV1-H1). La regla de la copa se aplica a las parcelas, pero no a las casas ni al atrezo.

## Criterios afectados

| Criterio | | Evidencia |
|---|---|---|
| H1 / req. 10 nuevo: casas lejos de los caminos | ✅ | `qa/re1/re1.mts 1-100`: 236 casas en 100 mapas, **distancia mínima de Chebyshev a una casilla con camino = 2**, y a la senda pintada (los puntos de `e.sendas`) 1,70 casillas como mínimo. `map.caminos.sueltas` está vacío en los 100 mapas, así que mirar solo `tramos` no deja casillas sin contar en el procedimental (ver Menores). **En el juego** (`qa/re1/pisadas.mts 1-40`: partidas IA contra IA con `partidaDeSemilla`, mirando dónde acaba cada turno): 746 finales de turno de héroe, **0 en la casilla de una casa** y 0 al norte de una; 0 de asaltantes. En el navegador, un clic en la casa de s15 (4,11) todavía lleva al héroe encima, que la tapa entera (`qa/re1/juego-s15-heroe-sobre-la-casa-4-11.png`). Es el resto de H1 que el usuario aceptó: solo pasa si se elige esa casilla. |
| H3: casas, almiar y carreta a Chebyshev ≥ 3 de mina, ciudad, pueblo, recurso, cofre y nodo | ✅ | `re1.mts 1-100`: casa → objeto, mínimo 3; almiar o carreta → objeto, mínimo 3; casa → casa, mínimo 4. Con monstruos (que no apartan, como se decidió): 9 de 236 casas a 3-5 de uno, el resto a ≥ 6. |
| H2: casas re-recortadas sin trozos de la vecina | ✅ con detalles | Antes y después sobre magenta a ×3 (`casas-antes` del scratchpad contra `assets/mapa/modulos/casas/`) y cada una a ×5 (`qa/re1/casas-3-9-11-12-x5.png`, `qa/re1/casas-2-7-6-13-x5.png`). Las 2, 3, 4, 5 y 7 salen limpias: se van la parra y la cumbrera de la 2, la pared y el barril de la 3, la cuña de la 7 y las puntas de árbol. Quedan detalles de 3-6 px al zoom del juego: **la 11**, una muesca en escalón en el alero derecho y el muro izquierdo cortado en recto; **la 12** (que no se tocó ni reporté en QA 1), un bloque de seto con el borde de arriba y el lateral rectos a la izquierda; la 9, un escalón junto a la chimenea; la 6, la copa sobre el hastial (declarada). Ninguna lleva ya un trozo de otro edificio. |
| H4: ninguna parcela bajo la copa | ✅ | `re1.mts 1-100`: `bajoLaCopa(e.sprites)` sobre la escena final = **0 parcelas** (la regla mira los árboles puestos antes que la labranza, y en la escena final tampoco hay ninguna). Visto en s19: el trigo ya no entra bajo los pinos. |
| H5: almiar siempre con su trigo; sin manchas de una casilla | ✅ | `re1.mts 1-100`: 0 almiares con el trigo a más de 1,1 casillas. `sitios.mts 11 13 20 25 33` (semillas que el ingeniero no usó): **0 manchas de una casilla** en las cinco, y todos los almiares tienen trigo en cruz. |
| 9: lo que no es labranza no cambia | ✅ | `sin-cambios-qa.mts despues` (mis semillas 11-14 y 16-22, con la línea base sacada de HEAD `cd09f00c` en QA 1; HEAD no se ha movido): **`total: 0 diferencias`**. |
| 7: guardias del escenógrafo a 0 | ✅ | `pnpm verify:lento` (los guardias de 1-40 y todo el arte rederivado): **143/143 ficheros, 5 304/5 304 tests**. `pnpm taller escenario 15 19` del ingeniero (`.cache/taller/escenario/15.json`): todos a 0 salvo las medidas. |

Comprobaciones generales:

- `pnpm verify:lento`: typecheck y lint en verde («Checked 398 files … No fixes applied»), y **143 de 143 ficheros, 5 304 de 5 304 tests pasan en las dos vueltas**. Las dos salen 1 solo por «Timeout calling "onTaskUpdate"» del worker de vitest, que es un fallo de la máquina y no de los tests: la carga estaba en 10-18 (otras sesiones). Lo repetí una vez, como dice `CLAUDE.md`, y no en bucle. Tardaron 3 min 55 s y 3 min 41 s. En QA 1 había salido 0.
- `pnpm capturas`: **exit 0, «sin errores en consola»**, 622 s con la máquina cargada.
- Partida en Chromium sin pantalla (`navegar.mts`): vite propio en un puerto libre (43463), en su grupo; matado el grupo y comprobado que el puerto queda libre y el PID muerto. s15 y s19: **0 errores y 0 avisos de consola**, y el suelo, pintado en 9,4 s y 8,3 s.
- Bucle de repartir otra vez (`qa/re1/estres.mts`, mapa de 64×64 entero de labranza con reglas hostiles: ninguna parcela de linde entra, solo una de cada tres, ninguna, todas encogidas a 0,7). **Siempre acaba**, en 15-35 ms y con ≤ 6 338 preguntas. Con «ninguna de linde» se queda sin campos cultivados, que es lo que debe pasar con esa regla. Una escala que crece lanza con su mensaje. En la escena real, `componer` tarda 271 ms de mediana y 473 ms como máximo en 1-100.
- La labranza sin parcela es **45,9 %** (`barbecho-escena.mts`, 1-10, 15 y 19). Coincide con el ingeniero. La que más tiene es s10, con un 58 %.

## ¿El ruido nuevo se lee mal?

- **Más barbecho (41,7 → 45,9 %)**: no se lee mal. En el juego (`qa/re1/juego-s15-casas-del-norte.png`, `qa/re1/juego-s19-casa-y-penascos.png`) se ven campos con tierra entre ellos, no un erial ni confeti. En el recorte de s15 queda una explanada de tierra de unas 5×4 casillas junto al cruce de caminos (`s15-despues-qa1.png`, a la derecha). Se lee como tierra de paso y no molesta. Cambian los cultivos de todo el mapa, no solo junto a lo quitado: el reparto vuelve a tirar la corriente desde el principio. Es determinista y nadie lo ve, porque el mapa no cambia durante la partida.
- **Los peñascos junto al bosque de s19**: se leen como peñascos, no como un objeto del juego. La pareja del recorte del ingeniero son dos piedras del módulo 13 de unas 0,7 casillas, s19 (5,4-6,0; 12,4). Son claras y destacan algo sobre la tierra entonada, pero no se confunden con una mina ni con un recurso. Junto al castillo de s19 hay además dos del módulo 14, en (6,25; 5,45) y (6,90; 5,81), de **1,56 y 1,24 casillas de ancho**: más que una mina (1,2). En el juego hacen de afloramiento entre el trigo y el bosque y se entienden. **Menor**: el módulo 14 llega a 1,58 casillas de ancho (`pen.mts`: en s19, 12 piedras de más de 1,1). Antes salía igual en el confeti, pero en la labranza tranquila pesa más. Si molesta, el relleno podría topar el ancho y no solo el alto.

## Hallazgos de la re-verificación

### RV1-H1 (importante) — Las casas al borde de un bosque quedan tapadas por los pinos de delante; algunas no se ven

Para no acercarse a caminos y objetos, la regla empuja las casas a los rincones de la labranza, que a menudo es la fila al norte de un bosque. El árbol de la fila de abajo tiene el pie más al sur y se pinta delante. La regla de la copa (H4) solo la miran las parcelas, no `ponerEntera` de las casas ni del atrezo.

- Medido: `qa/re1/re1.mts 1-100` da **45 de 236 casas (19 %)** con la caja metida más de 0,2 en la de un árbol de delante. En 1-40, `qa/re1/tapadas.mts` da **18 de 97 casas con ≥ 74 % de su caja bajo la copa de árboles de delante**, 14 de ellas al 90-100 %. También 8 de 67 almiares o carretas tapados en más de la mitad.
- Visto: s15 (37,31) asoma un hastial entre los pinos y s15 (34,35) no se ve (`qa/re1/taller-s15-casas-tapadas-por-el-bosque.png`). s19 (35,38) es invisible (`qa/re1/taller-s19-casa-35-38-invisible.png`).
- **La única casa de s2 (0,9) y la de s6 (40,35) están tapadas al 100 %**: en esos mapas la petición de «algunas casas» se queda en ninguna visible.
- Reproducción: `pnpm taller escenario 19 --px=96` y mirar la casilla (35,38). O, en el juego, `?seed=15`: ir al sureste hasta (34,35).
- Qué esperaba quien juega: un caserío que se vea. Una casa entera entre los pinos podría pasar por una cabaña de leñador; un hastial suelto o nada no se lee así. Arreglo probable, barato y con lo que ya hay: preguntar `bajoLaCopa` (o «árbol delante») también al sitio de una casa y del almiar o la carreta, y si se mete, probar el siguiente sitio de la lista.

### Menores

- **H2, restos**: los descritos arriba en las casas 11 y 12. Son 3-6 px al zoom del juego. Se arreglan con las semillas de `tools/taller/casas.ts`, o quitando la 11 y la 12 (quedarían 11).
- **El módulo 14 de piedras llega a 1,58 casillas de ancho**: ver arriba.
- **`camino` de la labranza solo lee `map.caminos.tramos`, no `sueltas`**, en `colocar.ts`, donde se arma la entrada de `labranzaDe`. En el procedimental `sueltas` está vacío (0 de 100 mapas), así que hoy no cambia nada. Un plan del agente con una casilla de camino suelta, en cambio, la dejaría como labranza: una parcela o una casa podría caer encima. `map.caminos.indices` o `tiene()` ya cubren las dos. No lo he probado con un plan del agente.

## Workarounds usados

- **Recortes del taller** (`.cache/taller/escenario/15.png` y `19.png`, del ingeniero, solo leídos) para ver las casas tapadas. Esas casas están en la otra punta del mapa y bajo la niebla al empezar. No afecta al usuario: es la misma escena sin niebla, y en el juego se verían igual al explorar.
- **Las partidas de `pisadas.mts`** son de IA contra IA con el núcleo, sin cliente. Sirven para contar dónde acaban los turnos, no para ver la imagen.
- En el navegador, la cámara la llevo con arrastres de ratón de verdad (como en QA 1). Mi estimación de la cámara tras el arrastre se desvió: el héroe fue a (4,11), que era lo pedido, y la vista lo siguió.

## No probado

- Un plan del agente con caminos sueltos (ver el menor de `sueltas`).
- Partidas largas contra el agente: H1 en el juego solo lo he medido con la IA de reglas (40 partidas), que acaba deprisa (746 finales de turno de héroe en total).
- dpr > 1 y móvil con la labranza a la vista, como en QA 1.
- No he mirado una a una las capturas de `pnpm capturas` (semillas 2 y 16, que no son de labranza): solo que acaba en 0 y sin errores de consola.

---

# Re-verificación 2 (20-10-2026, tras «Corrección de QA 2» y «Las casas, lejos de las nubes del borde»)

## Veredicto: **apto con reservas**

Los tres puntos de `hallazgos-qa-2.md` se cumplen. Ninguna casa, almiar ni carreta queda bajo un bosque en 1-100. Las casas 11 y 12 salen limpias. La labranza no pone nada sobre un camino suelto. El juego carga s15 y s19 sin errores en consola, y `verify:lento` pasa los 5 308 tests. La reserva es **el arreglo de las nubes del borde (RV2-H1, importante)**. Las nubes del borde **no se pintan en el juego**: solo las pinta la página del taller. El margen las protege, pues, de algo que quien juega no ve, y a cambio:

- se lleva un tercio de las casas (227 → 148 en 1-100);
- deja sin casa 30 de 100 mapas (antes 17), 13 de ellos con 60 parcelas o más (antes 3);
- reparte las casas que quedan de forma muy desigual entre los dos bandos: 109 en la mitad del noroeste y 39 en la del sureste (antes 120 y 107).

Además, en el taller tampoco deja 0 casas bajo una nube, que es lo que se daba por hecho. Medido por el alfa de las imágenes, quedan 6 por el oeste; la peor es s46 (1,2), con el 76 % de su silueta bajo la nube.

## Criterios afectados

| Criterio | | Evidencia |
|---|---|---|
| RV1-H1: casas, almiares y carretas que no tapa un bosque | ✅ | `qa/re1/tapadas.mts 1-100`: casas `{ '0': 144, '<25': 4, '25-50': 0, '50-75': 0, '≥75': 0 }`, almiares y carretas tapados al 50 % o más `{ almiar: 0, carreta: 0, total: 185 }` (en RV1, 37 casas ≥ 75 % y 24 piezas de atrezo). `qa/re1/re1.mts 1-100`: `casaBajoArbol` 0 (en RV1, 45), `bajoCopa` 0, `almiarSinTrigo` 0. Las distancias siguen igual: casa → camino ≥ 2, casa → objeto ≥ 3, casa → casa ≥ 4 y atrezo → objeto ≥ 3. `componer` tarda 271 ms de mediana y 544 ms como máximo. |
| Casas 11 y 12 | ✅ | `qa/re2/casas-11-12-magenta-x4.png`: los `.webp` del repo, sobre magenta al ×4. En la 11, el alero derecho va seguido y la cumbrera está entera. En la 12, el hastial izquierdo está entero y el seto tiene su borde natural, sin cortes rectos. Quedan los dos detalles de 1-2 px que declaró el ingeniero (la mota del zócalo y el pico junto a la chimenea), que a la escala del juego no se ven. `verify:lento`, que vuelve a derivar todo el arte y lo compara por sha256, pasa. |
| Caminos sueltos | ✅ | `qa/re2/sueltas.mts`: s15, s19 y s4 con 125, 102 y 90 casillas sueltas de camino (`RedDeCaminos.desdeTramos(…, sueltas)`) puestas encima de casas y parcelas que ya existían. Después, **ninguna pieza de la labranza cae en una de ellas**, y las casas se apartan (5 → 0, 5 → 0, 4 → 0). El tipo pide `sueltas` en `MapaDeEscena` y en `AdventureScene`. Los dos que llaman a `componer` de verdad le pasan una `RedDeCaminos`, cuyo `sueltas` es un campo público: `superficie.ts` en el juego, y `adaptar.ts`, que rehace `sueltas` desde el cable y lanza si no vienen. El taller llama con `newGame().map`. Lo comprueba el typecheck. |
| Casas que no tapan las nubes del borde | ✅ en el juego · ⚠️ en el taller | **En el juego no hay nubes**. `separar` (`pintar.ts:394`) deja fuera la capa 1, y la única que pinta las nubes es `pintarEscena` desde `tools/taller/escenario/pagina.ts` (paso 9, «en el taller»). En el navegador, el borde oeste de s19 sale oscuro por la niebla y sin nubes (`qa/re2/juego-s19-borde-oeste-zoom.png`). **En el taller**, `qa/re2/nubes-alfa.mts 1-100` mide por el alfa de cada imagen: hay 6 casas de 148 con más del 10 % de su silueta bajo una nube con alfa ≥ 0,3, todas por el oeste (x = 1-2): s46 (1,2) al 76 % (`qa/re2/taller-s46-casa-1-2-bajo-la-nube-oeste.png`), s43 (1,10) al 37 %, s65 (1,1) al 34 % y s19 (2,6) al 15 %. Las nubes entran con alfa ≥ 0,3 hasta 2,6 casillas por el oeste, 5,9 por el este, 2,5 por el sur y 0 por el norte, y el margen es de 1, 3, 2 y 1. La medida del coordinador usaba la caja y no el alfa. |

## Pasada adversarial

- **`entraLaPieza`** (`qa/re2/entra.mts`, regla pura, semillas 1-100):
  - *Nunca entra* (64×64, todo labranza): 0 casas y 0 atrezo, y las parcelas salen idénticas a las de sin pregunta, así que la corriente de las parcelas no se mueve. Acaba siempre, en 36 ms como máximo, con hasta **480 573 preguntas**. El atrezo hace `findIndex` sobre toda su lista en cada tirada. En la escena real cada pregunta construye un sprite y pregunta a `obstaculos` y a la copa. Con todo rechazado, en un mapa grande, eso sería caro. En mapas de verdad no pasa: `qa/re2/grande.mts` da que `componer` tarda 830 ms de mediana y 1,1 s como máximo en 64×64 (s1-8), y 96 ms en 24×24.
  - *Un módulo grande que no entra nunca* (`t ≥ 0,5`): como la casa conserva su `t` hasta que entra, **un módulo que no cabe en ningún sitio bloquea todas las casas que vienen detrás**. En 20×20 bajan de 1 043 a 93, y 51 de 100 semillas se quedan sin casa. En la escena real no se nota. En 1-40 hay 29 sitios de casa rechazados, y con una copia de `src` que saca un `t` nuevo en cada rechazo, el número de casas por mapa en 1-100 es **idéntico** carácter a carácter (148, con 30 mapas sin casa). Lo que rechaza es el sitio, no el tamaño. No es un hallazgo hoy, pero queda anotado por si llegan casas de tamaños muy distintos.
- **El margen al borde**:
  - En la regla pura, 0 casas fuera de `[1, W−3) × [1, H−2)` (1 043 casas). En 64×64 y 24×24, ninguna en el margen. En un mapa de 4×4 no hay casas y no lanza.
  - **Mapas que se quedan sin casa** (`qa/re2/sin-casa.mts 1-100`, el mismo mapa con el margen y con el margen puesto a 0 en memoria): 30 mapas sin casa frente a 17. Los que tienen 60 parcelas o más y ninguna casa pasan de 3 a 13: s16 (99 parcelas), s18, s27 (109), s28 (107), s56 (120), s64, s78 (112), s88 (104), s93 (102) y s95 son nuevos; s24, s76 y s99 ya estaban sin casa. Antes, s16, s18, s56, s64 y s93 tenían 2 casas cada uno.
  - **Simetría**: el mapa es **simétrico por giro de 180°** (terreno igual en `(x, y)` y `(W−1−x, H−1−y)` en el 91-95 % de las casillas de s15, s19 y s46; en espejo izquierda-derecha, solo el 18-33 %). La labranza de cada bando está junto a su base, una en el noroeste y otra en el sureste. Un margen de 1/1 por el noroeste y de 3/2 por el sureste castiga al bando del sureste. Casas en la mitad oeste / este: 120 / 107 sin margen y **109 / 39** con él (las de la mitad norte / sur salen igual). En s15 y s19, cuatro casas junto a la base del noroeste y una junto a la del sureste. La asimetría viene del arte: las nubes tienen el ancla a la derecha del centro (`ax/nw` de 0,55 a 0,74 en `escena.json`), así que la del este entra más. Pero el margen solo sirve para el taller (ver arriba).
  - El margen de arriba (1) no lo justifica ninguna nube: la del norte tiene el pie en y = −0,3 y no entra en el mapa (alcance medido 0). El del oeste (1) se queda corto para el alfa (2,6).
- **Atrezo bajo las nubes** (solo en el taller): 40 de 185 almiares y carretas, casi todos por el este y el sur y al 84-100 %, por ejemplo s15 (39,36), s3 (36,41) y s20 (41,33). En el juego no pasa nada, porque allí no hay nubes. Es el mismo caso que las casas.
- **Las sueltas, de punta a punta**: ver la tabla. El espectador ya lanzaba si el mapa llegaba sin `sueltas`, y en el servidor no cambia nada.

## Juego en el navegador

`qa/re2/navegar.mts`: Playwright con Chromium sin pantalla, un vite propio en el puerto 57907 lanzado en su propio grupo, y arrastres de ratón de verdad.

- **s15**: el suelo se pinta en 11,3 s, sin errores ni avisos en consola. Captura `qa/re2/juego-s15-inicio.png`: las casas de (4,7) y (4,11), junto a la base, se ven enteras entre los campos.
- **s19**: el suelo se pinta en 10,3 s, sin errores ni avisos en consola. Capturas `qa/re2/juego-s19-borde-noroeste.png` y `qa/re2/juego-s19-borde-oeste-zoom.png`: la casa de (6,4) entre el trigo y el bosque, la de (2,6) junto a la charca, ninguna bajo un árbol y ninguna nube en el borde. La de (1,2) está en la niebla (fuera del radio 5 del héroe en (7,7)).
- Después maté el grupo del vite. El puerto 57907 quedó libre y el PID, muerto.

## Comprobaciones generales

- `pnpm verify:lento`: typecheck y lint en verde («Checked 398 files … No fixes applied»), y **143 de 143 ficheros y 5 308 de 5 308 tests pasan en las dos vueltas**. Las dos salen 1 solo por «Timeout calling "onTaskUpdate"» del worker de vitest, con la carga en 3-11. Lo repetí una vez, como pide `CLAUDE.md`, y no más. Tardaron 4 min 3 s y 3 min 42 s.
- `pnpm capturas`: **exit 0, «sin errores en consola»**, en 631 s con la máquina cargada. Dejé los PNG en el scratchpad y no los miré uno a uno: las semillas de las capturas no son las de la labranza.
- No corrí `pnpm qa`: no cambia ni el servidor ni el contrato (`MapaDeEscena` es del cliente; el cable ya llevaba `sueltas`).

## Hallazgos

### RV2-H1 (importante) — El margen al borde aparta las casas de unas nubes que el juego no pinta, y a cambio deja mapas sin casas y un bando con un tercio de las del otro

- **Qué pasa**: `CASA_LEJOS_DEL_BORDE = { izquierda: 1, arriba: 1, derecha: 3, abajo: 2 }` (`labranza.ts:143`) aparta las casas de las nubes del paso 6 de `componer`. Esas nubes son capa 1 y solo las pinta `pintarEscena` del taller: el juego y el espectador pintan con `separar`, que se salta la capa 1.
- **Coste en 1-100**:
  - casas, 227 → 148;
  - mapas sin casa, 17 → 30, y con 60 parcelas o más, 3 → 13;
  - mitad oeste / este, 120 / 107 → 109 / 39.
  
  El mapa es simétrico por giro de 180°, así que el bando del sureste se queda con un tercio de las casas del otro.
- **Ni siquiera cumple en el taller**: 6 casas bajo una nube por el oeste, la peor s46 (1,2) al 76 %.
- **Reproducción**: `npx tsx docs/agents/2026-10-20-labranza-en-campos/qa/re2/sin-casa.mts 1-100`. En el juego, `?seed=16`, `?seed=56` o `?seed=93`: labranza grande y ninguna casa, cuando sin el margen había 2.
- **Qué esperaba quien juega**: «algunas casas pequeñas» en la labranza de los dos bandos. Si el taller importa, hay alternativas:
  - quitar el margen;
  - no pintar nubes encima de las casas en el taller;
  - anclar las nubes del oeste y del este por su centro, para que entren igual, y usar un margen simétrico por el giro (izquierda = derecha, arriba = abajo).

### Menores

- **Atrezo bajo las nubes del taller**: 40 de 185 almiares y carretas. Igual que en RV2-H1, el juego no lo ve. Si se mantiene el margen para las casas, no tiene sentido dejar el atrezo fuera, y si se quita, da igual.
- **La casa que no entra conserva su `t`**. Hoy no cuesta ninguna casa, porque el resultado es idéntico en 1-100, pero un módulo que no quepa en ningún sitio bloquearía todas las casas siguientes (ver la pasada adversarial).

## Workarounds usados

- **El taller** (`pnpm taller escenario 46 43 --px=96`) para ver las casas bajo las nubes: en el juego no hay nubes, y por eso es un hallazgo y no un fallo del juego.
- **El margen puesto a 0 en memoria** (`sin-casa.mts`, `nubes-alfa.mts … sin-margen`) y **una copia de `src` en el scratchpad** con un cambio de una línea en la casa rechazada, para medir. No toqué ni un fichero del repo.
- En el navegador moví la cámara con arrastres de ratón de verdad. La esquina sureste de s15 (las casas y el atrezo del otro bando) no la vi en el juego, porque está bajo la niebla el día 1.

## No probado

- Un plan del agente real con caminos sueltos por el servidor: lo probé con la `RedDeCaminos` construida a mano, que es lo que `adaptar.ts` y `generate.ts` le pasan a la escena.
- La esquina sureste en el juego, ya explorada (está bajo la niebla el día 1).
- dpr > 1 y móvil, como en las rondas anteriores.
