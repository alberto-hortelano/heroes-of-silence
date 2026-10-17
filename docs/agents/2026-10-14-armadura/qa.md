# QA — Arena: puntos de armadura que se restan del daño (#262)

Rama `claude/combat-decision-system-88e11e`, commit `9b179e7d` (las cinco tareas juntas y el /simplify).
QA del 14-10-2026, sobre la petición literal:

> Que las armaduras den puntos de armadura, no de vida, los puntos de armadura se restan del daño final

**Veredicto: Hallazgos.** La regla está bien hecha y se ve bien: en la ficha, el editor, la barra, la rueda, la vista previa, el parte y el lienzo, y en golpe, contraataque, carga, Rápido, disparo, salpicadura y hechizo. Lo que no se cumple es el criterio 4: **la IA de la arena no tiene en cuenta la armadura al elegir a quién dispara o golpea.** Un goblin de la IA dispara al jinete con barda, que no recibe nada, en 40 de 40 semillas, aunque tenga a tiro a un monje sin armadura. Antes de #262 le disparaba al monje en 40 de 40.

## Cómo se probó

- `pnpm verify`, una vez y en verde: `Test Files 129 passed | 1 skipped (130)`, `Tests 3251 passed | 14 skipped (3265)`, 119 s con la máquina cargada.
- `pnpm banco`: `sha256 066767b4…af995`, `ancla: igual`, 0/200 sin terminar.
- **Navegador**:
  - Vite propio en el **3517**, con `cacheDir` propio en el scratchpad (`qa-armadura/vite-cache`). Arrancado con `set -m` en su propia línea; PGID = PID = 365038. Muerto por su grupo; `ss -ltnp` dijo después «3517 libre». El 3187 sigue escuchando.
  - Chromium de Playwright sin pantalla. Nunca el Chrome del usuario.
  - Clics reales. Un espejo en Node (`SesionDeArena` + `EscenaBatalla`, como `pnpm capturas`) decía dónde pulsar, y cada paso se comprobó contra la página: la vida de cada unidad y, en S3, S5 y S9, la acción que mandó la página, interceptada sin tocarla.
- **El borrador del usuario no se tocó**: `data/borradores/unidades.json` tiene el mismo sha256 antes y después (`27f1c680…a7b8c`), y no apareció ningún `equipo.json`.
  - La configuración sombra (`vite.sombra.mts`, en el scratchpad) sirve `/__arena/unidades` con las mismas `leerBorrador` y `escribirBorrador`, pero sobre una raíz en el scratchpad.
  - Así, «Guardar» y los borradores de antes se probaron con el flujo real, sin el borrador del usuario.
- **No corrí** `pnpm verify:lento` ni `pnpm capturas`, por indicación: están en verde en este commit (`implementacion-simplify.md`).
- **Consola**: ningún error ni aviso en ninguna de las pasadas (12 páginas). El log de Vite, sin errores.

Los guiones están en el scratchpad compartido, en `qa-armadura/` (`s1.ts` … `s12.ts`, `barrido.ts`, `nucleo.ts`, `ia.ts`, `espejo.ts`).

## Criterios

| # | Criterio (requisitos.md) | | Evidencia |
|---|---|---|---|
| 1a | Ficha y editor: la armadura sale como una cifra más, con su pastilla | ✅ | **Editor**: brigantina «Suma +7 Armadura»; barda «+5 Defensa» «+22 Armadura» (cap. 03, 04). **Desplegable** de la ficha: «Barda · +5 Defensa, +22 Armadura». **Tarjeta**: «80 PV · 7 armadura». **Panel de la pelea**: fila «Armadura 22». |
| 1b | Las armaduras de la arena ya no enseñan PV | ✅ | **Editor**: la brigantina enseña el campo `armadura=7` y no `pv`; la cota de malla (armería) enseña `pv` y no `armadura`. **Lista**: «Brigantina · +7 Armadura», «Coraza bendita · +2 Defensa, +40 PV» (la del juego sigue con PV). |
| 1c | Fila «Armadura» con su final en `tablaDeCifras` | ✅ | **Templario**: «Armadura ⓘ — 7». **Jinete**: «— 22». **Héroe**: «Armadura ⓘ — 0» (cap. 01, 02). La nota dice qué es. Ver M5: el final no lleva el tono de «cambia». |
| 2a | Previsión en la barra, restada y dicha | ✅ | «Dispararías. Daño 0 … −22 armadura.» y «Daño 3–7 … −7 armadura.» (cap. 06). La daga contra la barda: «Daño 0 … Contraataque … 22–46 … −22 armadura.» (cap. 07). En S1, cada texto de la barra coincide con `textoDePrevision` del espejo, en 12 hovers. |
| 2b | Previsión en la rueda | ✅ | **Golpe** del jinete cargando contra el templario: «Rápido 48–91 + 4–16», «Normal 120», idénticos a `previsionDeLaRueda` del espejo (cap. 11). **Respuesta** del templario contra la barda: «Rápido 2 × 0», «Normal 6» (cap. 13). |
| 2c | Previsión en la vista previa de los contrincantes | ✅ | «Armadura 7» y «Armadura 22» en el bocadillo de cada contrincante (cap. 12). |
| 2d | Sale de la misma cuenta que el golpe | ✅ | **Barrido** de 100 peleas IA contra IA (`barrido.ts`): azar y rueda, contacto libre y pagado, rasgos al azar (drena, salpica, doble golpe) y héroes. Hubo 1 237 golpes y disparos comparados con su previsión (491 por el sector de la rueda), y ninguno cayó fuera. **Visto morder**: con la horquilla estrechada 1 punto, 337 fallos. |
| 2e | Previsión del hechizo | ⚠️ | Resta, pero no lo dice. «Flecha mágica: 193 de daño» contra el escudero (200 − 7), sin «−7 armadura» (cap. 15). Ya declarado en la desviación 6 de `implementacion.md`; ver M1. |
| 3a | Golpe en 0: se ve como parado en el lienzo | ✅ | «parado», en tono frío, sobre el jinete en cuanto pega la daga (cap. 08 y la ráfaga 08b). El lienzo escribió `["parado","−42"]` (el «−42» es el contraataque). |
| 3b | Golpe en 0: el parte lo dice y no lanza | ✅ | «Goblin arquero → Hermano de carga…: 0 de daño: lo para la armadura (11)» (cap. 09). Nada en la consola. Ver M2: «(11)» se lee como si fuera la armadura. |
| 4 | La IA de la arena juega con ello | ❌ | **Hallazgo I1**: elige a quién dispara o golpea sin mirar la armadura. |
| 5a | Un borrador con armaduras con PV se lee con aviso | ✅ | **Recuadro** «AL LEER LO DE ANTES · 5 AVISOS» (cap. 18): «Peto» 45 PV → 5; «Amuleto raro» 5 → 1; «Brigantina» 70 → 7; «Colgante de cuatro» 4 → 0; «Colgante de quince» 15 → 2. **Al guardar**: el disco se queda sin PV y con la armadura, y al recargar no hay avisos. |
| 5b | Un enlace de la v8 se lee con aviso; uno de la v9 con PV se rechaza | ✅ | **v8**, «Peto» de 45 PV: 1 aviso, y la tarjeta dice «5 armadura» (cap. 19). **v8**, brigantina cambiada a 100 PV: «da 10 de armadura». **v9** con PV: «El enlace de la pelea no se monta: … «Peto» es de la arena y suma 45 PV: en la arena se protege con armadura…» (cap. 21). Ver I2: un enlace de la v8 con el kit del juego cambia sin aviso. |
| 6 | El juego no cambia | ✅ | **Banco**: el mismo hash. **Contrato**: `grep` de armadura y parado en `src/core/contract/` y `src/server/` solo da el nombre del hueco (`armadura: 'armor'`, de antes) y prosa ajena. **Guardia y regla**: los de `invariantes.test.ts` y `problemasDePieza` están en verde dentro de `verify`; el «visto morder» lo hizo el ingeniero y no lo repetí, para no tocar el código. **En el editor**: una pieza de armería no ofrece el campo. |
| 7 | Tests con cifras exactas | ✅ | `test/armadura.test.ts` y `test/prevision.test.ts`, en verde dentro de `verify`. Por mi cuenta, con cifras (`nucleo.ts`): **drenaje**, golpe de 50 contra la brigantina → 38 tras la defensa, −7; el vampiro pasa de 10 a 10 + 38 − 24 (contraataque) = 24 PV. **Flecha** contra 999 de armadura: previsión 0 y hecho `damage 0, parado 200`. **Pieza con armadura 0**: ni `puntosDeArmadura`, ni «−0 armadura», ni `parado`. |

### La pasada que pedía el coordinador

| Caso | | Evidencia |
|---|---|---|
| Ficha y editor | ✅ | Arriba (1a-1c). **Retoque a media pelea**: «Cambian las cifras de Brigantina a media pelea (armadura 7 → 12)» (cap. 23). |
| Golpe parado | ✅ | 3a y 3b. En el barrido, 121 golpes en 0 con `parado`, y ninguno con `parado` sin armadura ni con `parado > armadura`. Ninguno dejó pasar daño sin restar toda la armadura. |
| Disparo | ✅ | «Esqueleto arquero → Guerrero con escudo (disparo): 3 de daño (−7 armadura)». |
| Hechizo | ✅ (⚠️ la barra) | «El atacante lanza Flecha mágica sobre Escudero: 193 de daño (−7 armadura), 1 baja». |
| Poder | ✅ | **Curar no se toca**: «Monje … usa Curar sobre Guerrero con escudo: cura 9 PV», que era la herida entera (71/80 → 80, con 7 de armadura; cap. 17). **Bendecir** no hace daño. |
| Salpicadura | ✅ | «Esqueleto arquero → Orko con armadura pesada (disparo): 4 de daño (−10 armadura)» y «→ Goblin arquero (salpicadura): 12 de daño (−2 armadura)». Los dos recibieron el mismo bruto (14) y cada uno restó la suya. La barra lo anuncia con «Salpica a Goblin arquero», sin cifra para él (cap. 16). |
| Drenaje | ✅ (núcleo) | En el núcleo, cura lo que llegó (fila 7). El parte no tiene línea de drenaje, como antes. En el navegador no se ejerció: ver «No probado». |
| Lo de antes | ✅ (⚠️ I2) | 5a y 5b. |
| Armadura a 0 | ✅ | **Brigantina a 0** en el editor: «no suma nada», la tarjeta sin «armadura» y la fila «Armadura — 0». **En el núcleo**, sin `parado` ni «−0». |
| Piezas raras en el editor | ✅ (M3, M4) | **Rechaza, con su motivo y sin cambiar la pieza**: −3, 2.5 y vacío («armadura tiene que ser un entero ≥ 0 y es -3.»). **Acepta**: `1e3` (1000) y 999; sin tope, la pelea acaba en la ronda 100 como «agotada», en azar y en rueda. **Cambiar de hueco** conserva la armadura (accesorio → escudo → arma). **Duplicar** una pieza del juego con PV convierte en silencio (M3). |
| La barda contra la daga | ✅ | Barra 0 y «−22 armadura»; el golpe queda parado y el contraataque llega con «−2 armadura» (cap. 07-09). |
| Rápido contra armadura | ✅ | **Golpe** con carga: 69 (−7) y luego 10 (−7), dentro de «48–91 + 4–16». **Respuesta** contra la barda: «2 × 0». **Nota**: «Cada golpe resta la armadura del rival: contra armadura, pierde.», al golpear y al responder. |
| Carga + armadura | ✅ | «(carga de 4 casillas, +40 %): 136 de daño (−2 armadura), 1 baja» contra el goblin. Barra: «… carga de 4 casillas ×1,4; −2 armadura.» (cap. 10). |

## Hallazgos

### Importantes

**I1. La IA de la arena dispara y golpea a quien no puede herir: elige sin mirar la armadura (criterio 4).**

`bestTarget` (`src/core/ai/tactics.ts:89`) puntúa `threat / stackHp` y no pasa por `expectedDamage`. Lo usan el disparo y el golpe a quien ya alcanza. Solo `aQuienIr` (a quién acercarse) lleva la armadura.

Con #262 el jinete con barda bajó de 300 PV a 80, así que ahora parece el blanco más rentable, y la IA gasta en él los disparos que la armadura para enteros. Medido con `ia.ts`: el goblin arquero de la IA frente al jinete con barda y al monje sin armadura, los dos a tiro, semillas 1-40.

| | Dispara al monje | Dispara al jinete | Daño medio por tiro |
|---|---|---|---|
| Hoy (barda 22) | 0 | 40 | 0,0 |
| Como antes (300 PV, def. 8) | 40 | 0 | 14,9 |

En el navegador (cap. 22, semilla 6): «Goblin arquero → Hermano de carga … (disparo): 0 de daño: lo para la armadura (11)», ronda tras ronda.

- **Reproducir**: `pnpm arena` → goblin arquero a la izquierda, en **IA**; el hermano de carga y el monje a la derecha, en **Yo** → Luchar → «Defender» con los dos.
- **Qué esperaba quien juega**: que la IA no tire flechas a una barda que las para todas cuando tiene a tiro a alguien a quien sí hiere.
- **Además**: inflará la medida «jinete contra floja» de `tools/qa/arena-ia.ts` (gana 93 de 100 con la barda).

**I2. Un enlace de la v8 con el kit del juego monta otra pelea y no lo dice.**

Un enlace copiado antes de #262 con el templario (brigantina) y el jinete (barda) del juego —el kit por defecto, es decir, casi todos— se abre así: «Montada la pelea del enlace (semilla 4): pulsa Luchar…», sin ningún aviso (cap. 20).

Pero ya no es la misma pelea:

- el templario pasa de pelear con 150 PV a 80 PV y 7 de armadura;
- el jinete, de 300 PV a 80 PV y 22 de armadura.

El aviso solo sale si el enlace trae su propia pieza con PV. Pasa lo mismo con el borrador real del usuario: sus 12 unidades llevan brigantina, arnés o jubón del juego, y al leerlo solo salen los 2 avisos del arco de antes, ninguno de la armadura (leído con `leerBorrador`, sin escribir).

- **Reproducir**: el JSON de `montajeALaURL` con `"v": 8` y sin piezas → `/arena/?seed=4&montaje=…`.
- **Qué esperaba quien juega**: que un enlace de antes de la armadura diga que sus armaduras de la arena ya no dan PV. Es el principio de la arena: abrir el enlace monta la misma pelea, o lo dice. La 9 se subió justo para marcar el cambio.
- **Contexto**: las otras cuatro tareas de hoy, como la carga para todos, también cambian peleas viejas sin aviso. Por eso no lo pongo como bloqueante.

### Menores

- **M1. La barra de un hechizo resta la armadura pero no lo dice.** Dice «Flecha mágica: 193 de daño, caería 1…», mientras que la del golpe y la del disparo terminan con «−7 armadura». El criterio 2 pide que la previsión «lo diga». Está declarado en la desviación 6 de `implementacion.md`, pero quien juega ve 193 donde esperaba 200 sin saber por qué.
- **M2. «lo para la armadura (11)» se lee como si 11 fuera la armadura.** Es lo parado. El jinete tiene 22, y el parte enseña 13, 9, 12 y 11 en golpes seguidos (S1, S3). Algo como «0 de daño: la armadura (22) lo para entero» no confundiría.
- **M3. «Duplicar» una pieza del juego con PV la convierte sin decirlo.** La barra dice «copia de «Talismán vital»: es nueva, de la arena», pero la copia suma «+5 Armadura» donde la original sumaba «+50 PV». Igual con la coraza bendita (+40 PV → +4) y el hacha de leñador (+10 PV → +1 de armadura en un arma) (cap. 05). No es una copia.
- **M4. El aviso de una pieza que se queda en 0**: «La pieza «Colgante de cuatro» daba 4 PV: ahora da 0 de armadura, que se resta del daño de cada golpe.» Diría mejor que ya no protege. Y el editor no pone tope a la armadura: `1e3` entra como 1000.
- **M5. En la tabla de cifras, el final de «Armadura» va en el tono de «igual».** Toda viene del equipo, pero la fila no tiene casilla y `cambia` (`paneles.ts:905`) nunca es cierto. Con el jinete: «Defensa 3 → **8**» resaltado y «Armadura — 22» sin resaltar (cap. 01b).
- **M6 (de D, carga solo en el primer golpe; no de esta tarea).** En la rueda, el «48–91 + 4–16» de Rápido con carga se sale del sector y se come el «4» de 48 (cap. 11b).
- **M7 (de antes, más probable con textos largos).** La barra de abajo crece un píxel cuando la previsión ocupa dos líneas, y la «; −22 armadura.» alarga el texto. El lienzo encoge un píxel, y un puntero justo en la frontera entre dos casillas de golpe cambia de casilla. La barra oscila entre «desde (1,4), cargando 4 casillas» y «desde (0,5)», y el clic golpea desde la que toque (S3, con mi primer punto, que caía en la frontera; cap. 24). Con el puntero en el medio de la casilla no pasa.

## Workarounds usados

- **El borrador en la sombra**: una configuración de Vite en el scratchpad sirve `/__arena/unidades` desde una raíz del scratchpad, con las mismas funciones de lectura y escritura. Sirve para no tocar el borrador del usuario, como se pidió. A quien juega no le afecta: el camino es el mismo con otra carpeta.
- **El espejo en Node** calcula dónde pulsar, y la acción de la página se intercepta sin tocarla. Es lo mismo que hace `pnpm capturas`. Quien juega pulsa a ojo. De aquí salió M7, que es real.
- **Las elecciones de la rueda, con teclado** (5 para Rápido, 7 para Normal). Es una vía documentada («1–7 o ←→ e Intro»). Los clics en los sectores son de #258, que prueba otro QA.
- **Las ráfagas de capturas cada 90-300 ms** para ver «parado»: dura menos de un segundo. Quien juega lo ve en vivo.

## No probado

- **El drenaje en el navegador.** Hace falta un vampiro herido que golpee a una unidad con armadura, y en la pelea IA contra IA no se dio. Cubierto en el núcleo con cifras (fila 7) y en `armadura.test.ts`. El parte no tiene línea de drenaje, ni antes ni ahora.
- **El «parado» de un hechizo en el lienzo.** El hecho `cast` con `damage 0, parado 200` sí lo vi en el núcleo, y pasa por la misma `cifraDelGolpe`, pero no lo vi pintado.
- **La vista a anchura de móvil** con la armadura en la ficha y la rueda: fuera del presupuesto. `pnpm capturas` (en verde en este commit) pasa por el móvil, pero ninguna de sus pasadas mira la armadura.
- **El guardia de `invariantes.test.ts` visto morder**: no rompí el código a mano porque no puedo tocarlo. Lo dejó visto el ingeniero (`implementacion.md`).

## Capturas

En `capturas/`, junto a este fichero:

- **Ficha**: 01 (tabla del jinete, con el zoom de la fila en 01b) y 02 (ficha del héroe).
- **Editor**: 03 (brigantina), 04 (barda) y 05 (duplicar una pieza con PV).
- **Barra**: 06 (disparo contra la barda), 07 (daga contra la barda) y 10 (carga contra la brigantina).
- **Golpe parado**: 08 (el lienzo, con la ráfaga en 08b) y 09 (el parte).
- **Rueda**: 11 (el golpe, con el zoom de Rápido en 11b), 12 (vista previa), 13 (respuesta) y 14 (el parte).
- **Hechizo, salpicadura y poder**: 15 (barra de la Flecha), 16 (barra de la salpicadura) y 17 (Curar).
- **Lo de antes**: 18 (avisos del borrador), 19 (enlace v8 con el peto), 20 (enlace v8 con el kit del juego, sin aviso) y 21 (enlace v9 rechazado).
- **Hallazgos**: 22 (la IA dispara a la barda), 23 (retoque a media pelea) y 24 (la carga en la frontera de dos casillas).
