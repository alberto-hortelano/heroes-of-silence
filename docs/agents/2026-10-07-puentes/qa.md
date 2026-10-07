# QA — #157, puentes que casan con el río

QA, 07-10-2026, sobre el árbol sin commitear de `main` (4ec7f1c + el diff de #157 tras /simplify). No he tocado código ni he commiteado. No he gastado nada en fal.ai.

**Cómo lo probé**
- El cliente real: `pnpm dev` en el 3157, con Chromium sin pantalla (Playwright) a 1600×1000. Pulsé el botón «Ver mapa entero» de la barra, que es un control del juego: lo puede usar cualquiera que juegue.
- Las semillas son de la 11 a la 25, más la 34 y la 47 (puentes que se toman el día 1) y la 40 (la torre).
- También el espectador, contra `pnpm partida` con `HEROES_SEED=19`.
- La hoja de contacto de los 40 puentes de las semillas 11-25 sale del taller con la misma `componer`.
- Los guiones están en mi scratchpad (`qa157/`). Las capturas están en `capturas-qa/`.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Agua bajo el puente, sin caras propias, el río sin cortar | ✅ | En los 40 puentes de `capturas-qa/hoja-qa.png` el río pasa entero. En `par-s13-x4-y17.png` (HEAD a la izquierda) se ve el tapón de tierra de antes y el río de ahora. |
| 2 | La variante sale de la red: N-S, E-O, diagonales y `-sube` | ✅ | En 11-25 salen todas: `ns`, `eo`, `ne-so`, `no-se`, `ns-sube` (s13 node-4, s17 node-2, s22 node-5) y `eo-sube` (s19 node-8, `s19-x25-y21-qa.png`, que se lee muy bien). En 1-40 el reparto es el de `implementacion.md` (`medir.ts 1 40`). |
| 3 | Ancla y escala del `.json`; estribos en las dos orillas | ✅ con reservas | `estribos.ts`: «quebrado estribos en agua=0: 35 · recto estribos en agua=0: 66». En la hoja no hay ningún estribo sobre el río. **Reserva:** en s18 node-3 el estribo sur se apoya en una lengua de tierra rodeada de agua (`detalle-s18-x4-y10-estribo-sur.png`). Toca tierra, pero no se lee unido a la orilla (ver H4). |
| 4 | Piedra si hay camino, troncos si no | ✅ | `sendas.mts 11 25`: de los 21 de piedra, 0 sin punta de senda en los dos estribos (todos a 0,00). En los de troncos, ninguna senda queda a menos de 1,2 casillas del centro. |
| 5 | La senda llega a los estribos y casa con el tablero | ❌ | Las cuentas dicen que sí: la senda acaba en el estribo. **Lo que se ve, no.** En 36 de las 94 sendas que salen de un estribo (1-40), las dos primeras casillas pasan por agua de la escena, y el agua se pinta encima. La senda se corta a medio metro del estribo y reaparece en la orilla. Ver H4. |
| 6 | Ninguna pared, ladera ni cara tapa el puente | ✅ | `medir.ts 1 40`: `puentesTapados: 0`. La torre de s40 node-7, que estaba declarada, tapa la rampa sur del de troncos (`s40-x21-y17-torre.png`). Va como menor (H7). |
| 7a | `pnpm verify` | ✅ | `Test Files 57 passed (57) · Tests 1940 passed (1940)` |
| 7b | `pnpm banco` igual | ✅ | `ancla: igual — las 200 partidas se juegan hexágono a hexágono igual · sin terminar 0/200` |
| 7c | Los guardias de antes, a 0 en 1-40 | ✅ | `murallasPartidas 0, basesSobreReserva 0, casillasDeBarreraSinFormacion 0, spritesSobreSenda 0, paredesSobreRampa 0, paredesFueraDelPie 0, laderasMalCubiertas 0, laderasEnfrentadas 0, puentesTapados 0`; `componer` 73,8 ms de media |
| 7d | Los fps | ⚠️ no probado | Ver «No probado». |
| 7e | `pnpm capturas` sin errores | ✅ | Sale con 0: «sin errores en consola; … 236.8 s». |
| 8 | Capturas al zoom máximo y al tope de alejar | ✅ | 14 capturas del cliente (`cliente-*-maximo.png`, `cliente-*-tope.png`, `tomar-*.png`), con consola `[]` en todas. |
| V1 | Ningún borde recto de rejilla alrededor de un puente | ❌ | Quedan losas lisas con bordes rectos a 1-2 casillas del tablero. Ver H5. |
| V2 | 0 estribos en el agua | ✅ | El criterio 3: 0 de 101. |
| V3a | El óvalo del nodo sobre el tablero, donde se lea | ✅ | Va sobre el tablero en s34 E-O, s15 diagonal y s18 N-S: `detalle-bandera-sola-s34-x12-y3.png` y `detalle-bandera-s15-x16-y1.png`. |
| V3b | **La bandera** sobre el tablero, en un extremo, donde se lea | ❌ | Flota en el aire sobre el río en E-O y en las diagonales. Ver H1. |
| V4 | El de piedra N-S, «escalera de mano» | ⚠️ fuera de alcance | Está apuntado en §21. Se ve en s17 node-2 y s18 node-3. |
| — | Pulsar el puente lleva al nodo | ❌ en los diagonales quebrados | Ver H2. En los rectos funciona: en s18, s34 y s47, un clic en el medio del tablero mueve el héroe al nodo y lo toma. |

## Hallazgos

### Bloqueantes

**H1. La bandera de un puente con dueño flota sobre el río, separada del puente.**
- **Dónde y cuánto.** En E-O, el mástil acaba unas 0,65 casillas por encima del pretil de detrás, sobre el agua. En las diagonales queda al lado del tablero, en el aire sobre el río. En N-S se salva porque el tablero sube en pantalla y el pie cae encima.
- **Capturas:**
  - `detalle-bandera-sola-s34-x12-y3.png` (E-O, sin el héroe);
  - `detalle-bandera-heroe-s34-x12-y3.png`;
  - `detalle-bandera-s15-x16-y1.png` (diagonal);
  - en el espectador, `detalle-espectador-s19-x14-y11-bandera.png`.
- **Repro** (s34, día 1):
  1. Abre `/?seed=34`.
  2. Pulsa el tablero del puente de (12,3) para ir, «llegas hoy».
  3. Pulsa «Fin de turno».
  4. El día 2, aparta al héroe al este del puente.
- **Lo que espera quien juega:** el mástil plantado en el tablero o en un estribo. Lo dicen los requisitos: «Va sobre el tablero, en un extremo, donde se lea».
- **Causa probable:** la bandera de un objeto horneado se pinta a `asiento.y − 0,85·tile`. En un puente, el asiento ya es el tablero alzado, así que la cuenta de los demás nodos lo sube otra vez. El ingeniero lo avisó en /simplify, punto 5.

**H2. En los puentes diagonales asentados, al pulsar el tablero no se va al puente: «No hay camino hasta (16,0)».**
- **La causa.** La casilla que se pulsa es la del nodo. `asentar` corre el centro hasta 0,6 casillas y el tablero va alzado, así que el medio visible del tablero cae en otra casilla, normalmente agua.
- **Medida** (`clic.ts`, semillas 1-40): en **26 de 101** puentes, el punto medio del tablero visible cae fuera de la casilla del nodo, y todos son quebrados. En s16 node-9, s17 node-3, s19 node-3 y s29 node-8, **0 %** del tablero cae sobre la casilla del nodo: lo que se pulsa es el arco o la roca de al lado.
- **Repro**, con el cliente real:
  - s15: abre `/?seed=15`, «Ver mapa entero» y pulsa el centro del puente de (16,1). La barra dice «No hay camino hasta (16,0).» y el héroe no se mueve (`tomar-s15-x16-y1-1-tras-clic-en-tablero.png`).
  - s25 (2,10): «No hay camino hasta (3,10).».
  - En s19 node-3 y s24 node-8, al pasar el ratón por el medio del tablero la barra queda vacía. El recuadro de la casilla señalada se ve en `cliente-s19-x14-y11-raton-en-el-tablero.png` y `cliente-s24-x8-y26-raton-en-el-tablero.png`.
- **Lo que espera quien juega:** pulsar el puente lleva al puente. Antes de #157, el sprite estaba en la casilla del nodo, así que esto es una regresión.

### Importantes

**H3. Un héroe sobre un puente E-O se pinta en el río, bajo el arco.**
- El héroe y su anillo de selección se apoyan en el centro de la casilla, que ahora es agua bajo el arco. La figura tapa el frente del puente y los pies quedan en el agua (`detalle-bandera-heroe-s34-x12-y3.png`).
- En N-S no pasa, porque el tablero cubre ese punto (`tomar-s18-x4-y10-2-tomado.png`). En el diagonal de s15, el héroe queda en la roca del estribo.
- **Repro:** el de H1, pasos 1 y 2.
- **Lo que espera quien juega:** el héroe de pie sobre el tablero, donde ya está el óvalo del dueño. Es una regresión: antes la casilla era el tapón de tierra.

**H4. La senda se corta junto al estribo, porque pasa bajo el agua.**
- La senda acaba en el estribo, pero su suavizado corta esquinas de casillas de agua. El agua se pinta después de la senda, así que entre el estribo y la orilla queda un tramo de río y la senda asoma por debajo como un camino sumergido.
- **Medida** (`sendaagua.mts`, semillas 1-40): 36 de 94 sendas de estribo, todas de puentes de piedra. Son, por ejemplo:
  - s18 node-3 sur, con 0,41 casillas;
  - s19 node-3 NE, 0,24;
  - s21 node-10, 0,94;
  - s15 node-12, 0,79.
- **Capturas:**
  - `detalle-s18-x4-y10-estribo-sur.png`: es el puente que se ve al empezar s18. La lengua de tierra del estribo acaba en el agua, y la senda sale de la orilla de abajo a la izquierda.
  - `detalle-s19-x14-y11-estribo-ne.png`.
- **Repro:** abre `/?seed=18`, acércate al máximo sobre el puente de (4,10) y mira su extremo sur.
- **Lo que espera quien juega:** que el camino suba al puente. Criterio 5: «La senda llega a los estribos».
- Puede que una parte venga de antes (el trazado del núcleo pasa en diagonal entre dos casillas de agua), pero ahora el estribo y el agua lo dejan a la vista.

**H5. Siguen las losas lisas con bordes rectos a 1-2 casillas del tablero.**
Las del criterio V1:
- s13 node-9: dos rectángulos al NE y al E, más uno pequeño al O (`par-s13-x6-y32.png`);
- s19 node-3: una cara lisa de borde vertical recto pegada al estribo NE (`detalle-s19-x14-y11-estribo-ne.png`, `par-s19-x14-y11.png`);
- s13 node-5: al E (`par-s13-x4-y17.png`);
- s24 node-8: una pequeña bajo el estribo SO (`detalle-s24-x8-y26.png`).

En los pares con HEAD (a la izquierda), las de s13 y s19 **ya estaban antes**. No las crea #157, pero el usuario mira el puente y las ve. El ingeniero ya lo dijo y propuso una issue aparte; yo lo dejo como no cumplido, sin bloquear.

### Menores

- **H6.** Los de troncos que cruzan a una orilla dos niveles más alta acaban contra la mitad de un acantilado (s23 node-1 y node-5, `s23-x26-y4-qa.png`, `s23-x8-y21-qa.png`; s24 node-8). Se leen poco unidos por arriba. Es arte que falta, ya en §21: troncos que suben y subidas de dos niveles.
- **H7.** La torre de ruina de s40 node-7 tapa la rampa sur del puente de troncos (`s40-x21-y17-torre.png`). Estaba declarada y no la gobierna ningún apartado.
- **H8.** El N-S de piedra se lee como una escalera de mano (s18, s17 `-sube`). Está en §21.

## Lo que se probó y pasa

- **El tablero recto, pulsado:** en s18 (N-S), s34 (E-O) y s47 (E-O sube), un clic en el medio del tablero lleva al héroe al nodo y lo toma.
- **La acción repetida el mismo día:** «Aldo de Valdeluz ya está en esa casilla: pulsa otra para moverlo.»
- **El turno del rival:** «Fin de turno» pasa al día 2 sin errores.
- **Una emboscada al ir al puente:** en s19 (8,13) se resuelve y se vuelve al mapa sin errores.
- **El tope de alejar:** los puentes se leen (`cliente-s17-x11-y13-tope.png`, `tomar-s34-x12-y3-5-tope.png`).
- **La partida terminada, en el espectador** (s19, día 6): los puentes, los óvalos y la crónica se ven bien, salvo la bandera de H1. La consola, `[]`.
- **`pnpm qa`** termina por fin de partida (el cambio no toca el servidor; lo corrí por ser barato).

## Workarounds usados

- **«Ver mapa entero»** para ver puentes bajo la niebla. Es un botón de la barra que puede pulsar cualquiera que juegue: no es un atajo.
- **El cliente se lleva por su propio guion de Playwright** (mis `cliente.mts` y `tomar.mts`). Las coordenadas del tablero salen de `componer` y de `camara-mapa`, igual que en `pnpm capturas`. Solo sirven para saber dónde pulsar; el clic es de ratón real y no se falsea nada.
- **La hoja de contacto de 11-25 sale de la página del taller** (`hoja-de-puentes.ts`), no del cliente. Usa la misma `componer` y la misma semilla. Todo lo que se ve en el cliente lo confirmé allí.
- **Para tener un puente con dueño, lo jugué.** Elegí semillas donde se toma el día 1 sin batalla (`alcanzables.mts`, un espejo con `Session`). No forcé ningún estado.

## No probado

- **Los fps.** La máquina es compartida y había más sesiones con carga. Una medida mía no sería más fiable que la del ingeniero (`fps-vuelta2.log`), así que no la hice.
- **Sin arte**, el marcador del puente en el navegador. Lo cubre el test «sin catálogo…» de `test/puentes.test.ts`.
- **Con el agente conectado y puentes.** `pnpm qa` pasa, pero no miré un puente con el agente jugando.
- **El zoom en el espectador.** La rueda no lo acerca y no tiene minimapa; lo miré a su tamaño fijo.
- **No volví a hacer morder `puentesTapados`.** Lo hizo el ingeniero.

## Incidente de proceso (importante, para el coordinador)

**Maté por error un vite ajeno**: el grupo 330538, `npm exec vite --port 43217 --strictPort`.
- Guardé el PID de mi `pnpm dev` en `<scratchpad>/dev.pid`. Ese scratchpad lo comparte otra sesión, que a las 12:18 escribió su propio `dev.pid` y su `dev.log` encima.
- Al cerrar, leí el fichero y maté ese grupo. La comprobación `ps -o pgid=` dio verde, porque **era** un líder de grupo, solo que no el mío.
- El vite de esa sesión (puerto 43217) murió («ELIFECYCLE Command failed» en su `dev.log`). No sé de qué sesión es.
- Mi `pnpm dev` (el grupo 317698, cwd `/home/al/code/heroes`) lo identifiqué después por puerto y cwd, lo maté y comprobé que el 3157 queda libre.
- El servidor de `pnpm partida` (el grupo 338225, puertos 3159 y 3160) era mío, porque la orden coincidía: muerto y con los puertos libres.
- **Lección para la receta:** el fichero de PID va en una subcarpeta propia de la tarea, no en la raíz del scratchpad. Y antes del `kill` se comprueba la orden y el puerto del grupo, no solo que sea líder.

## Veredicto

**No apto.**

El objetivo de fondo mejora muchísimo. Los puentes siguen al río, el río ya no se corta, las diagonales y las subidas existen, y no hay estribos en el agua ni paredes encima. `verify`, `banco`, los guardias y `capturas` están en verde.

Pero quien juega se encuentra con dos cosas que se pidieron o que ya funcionaban y ahora no:
- **H1**, la bandera flota en el aire sobre el río. Era la pregunta abierta de los requisitos («sobre el tablero, donde se lea»).
- **H2**, en 26 de 101 puentes, pulsar el tablero dice «No hay camino».

Además, H3 (el héroe en el río) y H4 (la senda que se hunde antes del estribo) se ven en los puentes que hay al empezar una partida.

---

# Re-verificación (QA2, 07-10-2026)

Sobre el árbol sin commitear de `main` (4ec7f1c + #157 + el arreglo de H1-H5). No he tocado código ni he commiteado. Sin fal.ai.
- **Cliente real**: `pnpm dev --port 3181` (grupo propio, PID y logs en `<scratchpad>/qa157b/`), Chromium sin pantalla (Playwright) a 1600×1000, ratón real, botón «Ver mapa entero» de la barra. Guiones en `qa2/` (`guion.mts` lleva el cliente por una lista de pasos; el resto son medidas con `componer`/`Session`).
- **HEAD para comparar**: un worktree temporal en mi scratchpad con su propio vite en el 3182; quitado al acabar.
- **Espectador**: `HEROES_SEED=47 … pnpm partida` (puertos 0), mirado al final (día 6).
- **Semillas nuevas**: 41-80 en las medidas; en el navegador s42, s45, s47, s53, s57, s67, s70, s72, s74, s76, s80, además de s8, s16, s18, s21 y s28.
- Capturas en `capturas-qa2/`.

## Criterios afectados

| Criterio | Estado | Evidencia |
|---|---|---|
| H1 · bandera en N-S | ✅ | s57 node-6 (1,14): la bandera queda en el tramo sur del tablero, plantada en la piedra (`s57-node-6-piedra-ns-2-bandera.png`). Es pequeña y queda pegada al óvalo, pero se lee. |
| H1 · bandera en E-O | ✅ | s74 node-0 (11,3), troncos: en el extremo este de los troncos (`s74-node-0-troncos-eo-2-bandera.png`). |
| H1 · bandera en diagonal | ✅ | s42 node-1 (15,6) `no-se`: en el extremo SE. s47 node-4 (1,12) `ne-so`: en el NE. s80 node-1 (13,7), troncos `no-se`: en el SE. Todas sobre el tablero, ninguna en el aire. |
| H1 · bandera en `-sube` | ✅ `eo-sube` · ⚠️ `ns-sube` | `eo-sube`: s47 node-0 (13,2), en el extremo alto del tablero (`s47-node-0-piedra-eo-sube-2-bandera.png`). Ningún `ns-sube` se toma el día 1 en 1-100, así que en pantalla no lo he visto: lo cubre el test de H1. |
| H1 · bandera en el espectador | ✅ | s47, día 6: `eo-sube` (13,2), `ne-so` (1,12) y troncos `eo` (21,20), las tres en el extremo del tablero (`espectador-s47-detalle-banderas.png`). Consola `[]`. |
| H2 · clic en los 4 quebrados de antes | ✅ | Pasé el ratón por 5 puntos del tablero alzado, de t=−0,24 a t=+0,24, en s8 node-6, s16 node-1, s21 node-10 y s28 node-10. En los 20, la barra dice «Paso sin dueño · …». |
| H2 · los 4 nuevos de 41-80 | ✅ | `clic-qa.ts 41 80`: 4/104 con el medio fuera de la casilla (s45 node-8, s53 node-8, s67 node-2, s72 node-5). En los 4, los 5 puntos dan «Paso sin dueño». En 1-80, `qa2/robos.mts`: 0 de 205 puentes con algún punto de la mitad de en medio del tablero que no coja su puente. |
| H2 · tomar con un clic sobre el agua | ✅ | En s42, s47 (×2), s57, s74 y s80, un clic sobre el tablero lleva al héroe al nodo y lo toma. |
| H3 · héroe sobre el tablero | ✅ | En los 6 de arriba el héroe queda de pie en el tablero, con su aro (`*-1-heroe-en-el-puente.png`). |
| H4 · senda hasta el estribo, s18 | ✅ | `s18-vado-estribo-sur-ahora.png`: la senda baja del estribo sur por una lengua de tierra hasta el camino, sin agua encima. El guardia `sendasDeEstriboEnAgua` da 0 en 1-40 y en 41-80. |
| H5 · caras lisas junto a puentes | ✅ con reservas | `desnudo.ts 41 80`: 44 de 104 puentes con más de 0,3 casillas lisas (45,2 casillas). En los 4 peores (s57 node-6, s70 node-2, s76 node-0 y s80 node-1) comparé con HEAD (`par-s*-lisa-*.png`, HEAD a la izquierda). Los rectángulos lisos ya estaban; s57 node-6 lo agranda algo. Siguen siendo #159. |
| `pnpm verify` | ✅ | `Test Files 57 passed (57) · Tests 1951 passed (1951)` |
| `pnpm banco` | ✅ | `ancla: igual — las 200 partidas se juegan hexágono a hexágono igual · sin terminar: 0/200` |
| Guardias a 0 en 1-40 | ✅ | `medir.ts 1 40`: los 10 a 0 (con `puentesTapados` y `sendasDeEstriboEnAgua`). En 41-80, también los 10 a 0. |
| Estribos en el agua | ✅ | `estribos.ts`: «quebrado total 34, estribos en agua=0 · recto 67/67» |
| `pnpm capturas` | ✅ | Sale con 0: «sin errores en consola; … 229.7 s» |
| `pnpm qa` | ✅ | «terminado por fin de partida: 1 mapa diseñado, 5 turnos de mapa, 28 decisiones de batalla y 1 ascenso» |
| Consola del navegador | ✅ | `[]` en las 25 sesiones de cliente y en el espectador. |

## Pasada adversarial

| Prueba | Resultado |
|---|---|
| `puenteBajo` junto a otro objeto (1-80) | ✅ En 0 casillas de tierra con objeto o héroe al empezar coge el clic el puente. No hay dos puentes a menos de 3 casillas. |
| `puenteBajo` sobre la orilla con alguien de pie en ella | ❌ **H9**, abajo. |
| `puenteBajo` sin explorar | ✅ Por código (`explorado.has(nodo)`), y en la práctica: sin «Ver mapa entero», el puente bajo la niebla no se pinta y el clic va a la casilla. |
| Pisada con dos héroes | ⚠️ Se pintan bien los dos, pero el clic falla (H9). En s57, A va en el puente y C (contratado) en la orilla norte. Los dos se ven sobre el mismo tablero, uno detrás del otro, y la «A» tapa las piernas de C. |
| Vados con espuma | ✅ En s18, s42 (21,17), s47 (22,30), s52 (17,16) y s57 (23,24), comparado con HEAD: lengua de tierra sin espuma encima, sin cortes raros. El vado más largo de 41-60 (50 puntos, s57) no corta el río. |
| Asentar encogiendo a 0,85 | ✅ s45 node-8, s53 node-8, s67 node-2 y s72 node-5 llegan a las dos orillas (`*-ruta-al-tablero.png`). No se notan más pequeños de lo que molesta. |
| La ruta que sube al tablero | ✅ con reservas | El último paso de la ruta queda sobre el tablero (asiento). En los quebrados con el medio fuera, el recuadro de la casilla señalada queda debajo o al lado del tablero, sobre el agua (s8, s21, s67, s72, `*-ruta-al-tablero.png`). Ya estaba declarado. |
| Objetos horneados sobre un estribo (nuevo) | ⚠️ **H10**, abajo. |

## Hallazgos nuevos

### Importante

**H9. Pulsar a quien está en la orilla norte de un puente N-S va al puente: mueve al héroe al puente o selecciona al otro.**
- **La causa.** El tablero N-S se ve alzado y cubre en pantalla la casilla de la orilla norte. Su «mitad de en medio» (`MEDIO_DEL_TABLERO`) baja hasta 0,36 casillas dentro de esa casilla. Es justo lo que el ingeniero quería evitar («el héroe que espera en ella llevaba al puente»).
- **Cuánto** (`qa2/robos-figura.mts 1 80`): en 65 casillas de orilla, más del 15 % de la caja de la figura (x 0,25-0,75, y 0,1-0,8) va al puente. En todos los N-S de piedra planos y en los `ns-sube`, es el **60 %**.
- **Repro 1** (s18, un héroe):
  1. Abre `/?seed=18` y pulsa «Ver mapa entero».
  2. Pulsa el borde norte de (4,9), en el punto (4,5; 9,15) de casilla. El héroe anda 3 pasos hasta la orilla norte del puente de (4,10) (`s18-orilla-norte-1-heroe-en-la-orilla.png`).
  3. Pulsa las piernas del héroe, en (4,5; 9,55). La barra decía «Paso sin dueño · llegas hoy (1 paso)», y el héroe baja al puente y lo toma (`s18-orilla-norte-2-tras-pulsar-al-heroe.png`).
  - Quien juega espera «ya está en esa casilla». Antes de este arreglo era así.
  - Además, el centro de (4,9) da «Paso sin dueño · llegas hoy (4 pasos)»: no se puede ir a la orilla norte pulsando su centro.
- **Repro 2** (s57, dos héroes):
  1. Abre `/?seed=57` y pulsa «Ver mapa entero».
  2. Pulsa el tablero de (1,14): Aldo lo toma.
  3. Abre el castillo, contrata, cierra y selecciona al Capitán.
  4. Pulsa (1,5; 13,12): el Capitán va a la orilla norte.
  5. Pulsa el cuerpo del Capitán: la barra dice «Aldo de Valdeluz · llegas hoy (1 paso)» y el clic da «Aldo de Valdeluz seleccionado.» (`detalle-s57-dos-heroes-norte.png`).
- **Por qué importa.** Lo mismo pasaría con un rival, un asaltante o un monstruo que espere a la entrada norte de un puente: al pulsarlo para atacar, el clic va al puente. Además, la orilla norte de un N-S es por donde se entra al puente. No lo probé con rivales.

### Menor

**H10. Una mina o un pueblo encima del estribo.** Es de la familia de H7 (la torre de s40).
- **Cuánto** (`qa2/objetos-en-estribo.mts 1 80`): 6 de 205 puentes tienen un objeto en la casilla del estribo o justo delante. Son s10 node-1, s42 node-11, s54 node-6, s57 node-16, s63 node-9 y s64 node-7.
- **El que más se ve:** s57 node-16, (22,26). La rampa sur acaba bajo un molino del pueblo y la norte entra por la boca de una mina (`detalle-s57-x23-y24-mina-y-molino.png`).
- `puentesTapados` solo cuenta paredes y laderas.

**H11. Dos héroes sobre un N-S se amontonan.** La chapa del de delante («A») tapa las piernas del de detrás («C»), y no se lee cuál está en el puente (`detalle-s57-dos-heroes-norte.png`).

## Workarounds

- **«Ver mapa entero»**, como en la primera vuelta: es un botón del juego.
- **El guion de Playwright calcula dónde pulsar** con `componer` y `camara-mapa`, y recentra con el minimapa antes de cada clic. Los clics son de ratón real.
  - Tras contratar, el panel lateral se queda desplazado y el minimapa sale de la vista. El guion hace `scrollIntoViewIfNeeded`.
  - Quien juega lo tendría que desplazar a mano. Es menor y no lo cuento como hallazgo de #157.
- **Evité las emboscadas** (no pulso si la barra dice «Cuidado»): «Resolver sola» no llegó a mostrar «finish-battle» en 180 s en dos intentos (s42 y s57).
  - No lo investigué y no es de #157, pero **queda como no probado**: puede ser mi guion o un fallo real del cliente.
- **Los dos héroes se montaron jugando**: contraté en el castillo. Nada sintético.

## No probado

- **La bandera de un `ns-sube` en pantalla**: no hay ninguno que se tome el día 1 en 1-100. Lo cubre el test de H1.
- **H9 con un rival, un asaltante o un monstruo en la orilla.** Lo deduzco del mismo mecanismo y no lo vi.
- **El final de «Resolver sola»** en las emboscadas de s42 y s57 (ver Workarounds).
- **Los fps**: la máquina es compartida.
- **Los asaltantes cruzando un puente**: el ingeniero lo declara (`pisada` no los cubre).

## Veredicto

**Apto con reservas.**
- **Lo que pedía la re-verificación se cumple.** H1-H4 están arreglados:
  - la bandera, en el tablero en N-S, E-O, diagonales y `eo-sube`, en el cliente y en el espectador;
  - el clic, en el 100 % de la mitad de en medio del tablero, también en los 8 quebrados con el medio fuera de su casilla (4 de 1-40 y 4 de 41-80);
  - el héroe, en el tablero;
  - la senda, sin agua encima.
- **H5**: lo que queda ya estaba en HEAD.
- **Verde**: `verify`, `banco` igual, guardias a 0 en 1-80, `capturas` y `qa`.
- **La reserva es H9**, una regresión del propio arreglo de H2. Pulsar a quien espera en la orilla norte de un puente N-S va al puente: mueve al héroe un paso y toma el puente, o selecciona al otro héroe. Conviene arreglarla antes de cerrar #157, y es acotable: la mitad de en medio no debería coger un punto sobre la casilla de una orilla ocupada, o debería recortarse al tramo que no cae sobre la orilla en los N-S.
