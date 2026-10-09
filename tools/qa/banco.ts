/**
 * Banco de medida del núcleo: cuánto tarda y **si sale exactamente lo mismo**.
 *
 * No es un test —no falla, mide— y va aparte del barrido de semillas a
 * propósito: el barrido mide la IA (¿siguen terminando las partidas?), esto
 * mide el código (¿tarda menos y da lo mismo?). Lo que sí comparten son las
 * tripas, en `partidas.ts`: jugar la partida de una semilla y montar su batalla
 * espejo. Estaban copiadas verbatim en los dos ficheros.
 *
 * Lo que imprime, en una sola orden:
 *
 *  - el tiempo de las N partidas,
 *  - el **sha256 del volcado** —ganador, día y crónica completa de cada
 *    semilla—, que es el criterio de aceptación de cualquier refactorización
 *    del núcleo: si cambia, alguna partida se juega distinta,
 *  - el número de líneas del volcado y cuántas partidas no terminan,
 *  - y el tiempo de 300 `autoResolve` con semillas fijas, que es lo que mide
 *    el coste de `legalActions` sin el ruido del mapa, en varias tandas con su
 *    mínimo, mediana y máximo (#99).
 *
 * El volcado es una línea por hecho y no un JSON por partida a propósito: si
 * el sha cambia, `--dump` a dos ficheros y `diff` señala la semilla y el hecho
 * exactos en vez de decir «la partida 137 difiere».
 *
 * `node:crypto` aquí vale: esto es `tools/`, no `core`.
 *
 * **El sha esperado está anclado aquí abajo y se comprueba solo.** Antes el
 * docstring lo llamaba «el criterio de aceptación de cualquier refactorización
 * del núcleo» y el valor no estaba escrito en ningún sitio: un `grep` por el
 * hash en el repositorio entero daba cero, y CI corría `verify`, `vite build` y
 * `qa` pero no esto. Un criterio de aceptación que exige acordarse de correr la
 * herramienta en el commit ANTERIOR no es un criterio, es una costumbre — y era
 * lo único que cazaba una frontera compartida entre búsquedas.
 *
 * Uso: pnpm banco [semillas=200] [dias=300] [--dump <fichero>]
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { duracion, mediana } from './estadistica.js';
import {
  batallaDeSemilla,
  DIAS_POR_DEFECTO,
  partidaDeSemilla,
  resumenSinTerminar,
  SEMILLAS_DEL_BANCO,
} from './partidas.js';

const args = process.argv.slice(2);
const iDump = args.indexOf('--dump');
// La ausencia se escribe de UNA manera, `null`, y no de dos: cuando el tipo
// era `string | null | undefined` había que preguntar por las dos cada vez que
// se usaba, y las dos preguntas querían decir lo mismo.
const fichero: string | null = iDump === -1 ? null : (args[iDump + 1] ?? null);
if (iDump !== -1 && fichero === null) throw new Error('--dump necesita un fichero');
// El `-1` se descarta antes de filtrar: sin eso, `i !== iDump + 1` valía
// `i !== 0` y se comía el primer argumento cuando no había `--dump`.
const sueltos = iDump === -1 ? args : args.filter((_, i) => i !== iDump && i !== iDump + 1);

/**
 * El volcado que TIENE que salir con los valores por defecto.
 *
 * Es el suelo del núcleo: mientras este sha no cambie, las 200 partidas se
 * juegan hexágono a hexágono igual que antes de la refactorización. Cambiarlo
 * no está prohibido —una regla nueva mueve las partidas a propósito—, pero
 * cambiarlo **en silencio** sí: si sale otro, la orden se pone en rojo y hay
 * que anclar el nuevo diciendo cuál era el viejo y por qué se movió.
 *
 * Solo se comprueba con `200 300`, que es lo que corre CI: con otros argumentos
 * esto sigue siendo lo que dice ser, una medida.
 *
 * **Historial de anclas**, que es lo que dice si un cambio se hizo a la vista:
 *
 * - `eb294724…` (28 300 líneas): el suelo con el que se cerró el ciclo de
 *   rendimiento. Lo conservó #50 —elegir la casilla de ataque por daño esperado
 *   no mueve una sola partida mientras no haya caballería en el tablero—.
 * - `a4d71f9b…` (28 406 líneas): #52, la regla de espera. Cambia las partidas a
 *   propósito: la IA juega `wait` 476 veces en estas 200 partidas, donde antes
 *   jugaba 0. Las 106 líneas de más son los hechos que eso añade a la crónica.
 * - `299b1a7c…` (28 406 líneas, **las mismas**): #72, el radio de visión del
 *   castillo. No mueve una sola partida: mueve **quién se entera**. El `diff`
 *   contra `a4d71f9b…` trae 1 871 de 28 406 líneas (6,6 %), el **100 %** de
 *   ellas distintas SOLO en `seen`, **cero** líneas `fin` —mismo ganador, mismo
 *   día y mismos hechos en las 200 partidas— y las 1 871 **ganan** observador,
 *   ninguna lo pierde, que es lo único que puede hacer un radio más grande.
 *   Ese diff era el criterio de aceptación, y no que el sha cambiara: el sha lo
 *   mueve también una implementación mala.
 * - `a8fc2820…` (27 731 líneas): la reserva de héroe de `planRecruits`, primera
 *   de las cuatro palancas del ciclo que cuadra el coste con la renta. Arregla
 *   una avería anterior —quien perdía su héroe no compraba otro nunca—, así que
 *   **195 de las 200 semillas salen idénticas hecho a hecho**; las 5 que cambian
 *   (33, 35, 114, 127, 186) son exactamente las que dejaban a un jugador sin
 *   héroe. Tres se acortan y el máximo baja de **22 días a 15**: las 675 líneas
 *   de menos son los días de empate que ya no se juegan.
 * - `b790afc9…` (30 503 líneas): los recursos de salida, copiados de la fila
 *   NORMAL de `Kingdom::_getKingdomStartingResources`. Aquí no queda una sola
 *   semilla igual, y la forma del diff es la que tiene que ser: el **primer
 *   hecho distinto es `built` en 200 de 200**, porque la economía entra por el
 *   castillo y por ningún otro sitio. `knight_dwelling_4` pasa de 8/200 a
 *   **200/200** y `mage_guild_2` de 0 a 25/200.
 * - `f0eee7c3…` (51 952 líneas): el coste de las 18 filas inventadas de
 *   `data/buildings.json`, copiado de `buildinginfo.cpp`. Misma forma que la
 *   palanca anterior y por el mismo motivo: **`built` es el primer hecho
 *   distinto en 200 de 200**. `knight_dwelling_5` pasa de 15/200 a 129/200 y
 *   aparecen las tres primeras criaturas de nivel ≥5. Este paso solo **alarga**
 *   la partida —mediana 7 → 17 días— porque quien pisa el freno es la materia
 *   prima, que llega con la palanca de las minas: es el estado intermedio que
 *   el plan predijo, no el destino.
 * - `cf7b8d3b…` (26 444 líneas): las minas de los siete recursos, cuarta y
 *   última palanca. Aquí el primer hecho distinto ya **no** es `built` sino
 *   `hero_moved` (173/200), `resource_gained` (21) y `mine_captured` (3), que
 *   es lo que predice añadir objetos al mapa: la ruta del héroe cambia antes
 *   que lo que se construye. **146 de las 200 partidas se acortan** y solo 16
 *   se alargan. Cierre del ciclo, contra el suelo `299b1a7c…` de antes: mediana
 *   7 → **6** días, p90 8 → 7, máximo 22 → 20; 200/200 con ganador y 0 sin
 *   terminar; `dwelling_5` 0 → **52/200** y `dwelling_6` 0 → **10/200**. Las
 *   1 962 líneas de menos son partidas más cortas, no crónica perdida.
 * - `1e32b19e…` (26 647 líneas): #87 y la parte mínima de #6 — la experiencia
 *   cuenta las criaturas muertas y la cobra también quien defiende, y el héroe
 *   sube de nivel con la tabla de fheroes2. Es una **inserción pura**, y no por
 *   suerte: **nadie lee `hero.level` ni `hero.experience`** para decidir nada,
 *   así que un número nuevo no puede mover una partida. Medido contra
 *   `cf7b8d3b…`: **203 líneas `level_up` nuevas** (197 de nivel 2 y 6 de nivel
 *   3) y **todas las demás idénticas byte a byte** una vez quitadas esas y
 *   renumerado el índice; **cero** líneas `fin` con ganador o día distinto, y
 *   `hechos=` como lo único que crece, exactamente en las subidas de cada
 *   semilla. Un `hero_moved` distinto habría querido decir que algo se rompió.
 * - `d5502745…` (32 211 líneas): #88, el gremio de magia deja de ser el último
 *   de la cola. La cascada de seis constantes pasa a ser una **lista ordenada
 *   por facción** —comprobado con el gremio en su puesto de siempre: volcado
 *   byte a byte idéntico, así que la lista no cambia nada por sí sola— y lo
 *   único que se mueve es `mage_guild_1` en la del nigromante. Misma forma de
 *   diff que las dos palancas de economía anteriores y por el mismo motivo: el
 *   **primer hecho distinto es `built` en 200 de 200**, cero semillas idénticas.
 *   `mage_guild_1` 10 → **206** (200 de 200 partidas), `spells_learned` 3 →
 *   **316** y `built` 2 236 → 2 601. La partida se alarga un día de mediana
 *   (6 → 7, p90 7 → 8) con el máximo quieto en 20 y **0/200 sin terminar**.
 *   Y da la vuelta al ganador —el caballero pasa de 184/200 a 42/200—, que es
 *   consecuencia aprobada de arreglar los dos bugs y se apunta en #89: no se
 *   compensa aquí retocando cifras sin fuente.
 * - `297dbef9…` (32 177 líneas): la corrección de QA. **Borrado puro**, que es
 *   el espejo de la inserción pura de `1e32b19e…`: **34 líneas `spells_learned`
 *   menos y ni una más**, todas ellas la ÚLTIMA de su semilla, en las 34
 *   semillas exactas donde `applyAdventureAction` sincronizaba los libros
 *   después de que la partida hubiera terminado — la crónica acababa con «Fin
 *   de la partida» y debajo «aprende: Prisa». Cero líneas `fin` con ganador o
 *   día distinto.
 *
 *   La tabla de experiencia se cambió en el mismo commit —las 39 filas que
 *   decían venir de `heroes.cpp` estaban inventadas y solo coincidían en 8; van
 *   las 40 de verdad— y **no mueve ni una partida**, comprobado a propósito y
 *   no supuesto: con la tabla nueva y el bug de vuelta, el volcado sale
 *   `d5502745…` **exacto**. Los umbrales alcanzables (niveles 2 a 6) son los
 *   mismos en las dos tablas; la primera fila que cambia es la del nivel 7,
 *   7700 contra 7500, y a nivel 7 no llega nadie.
 * - `7372210b…` (45 175 líneas): la tropa de individuos y el liderazgo (fase
 *   1a de NuevaJugabilidad). Se re-ancla a propósito y la forma del diff es la
 *   que tiene que ser: **cero semillas idénticas y el primer hecho distinto es
 *   `recruited` en 200 de 200**, porque el ejército de salida no deja hecho en
 *   la crónica y lo primero que el liderazgo toca a la vista es el primer
 *   reclutamiento (6,0 → 2,55 individuos por `recruited` de media). 200/200 con
 *   línea `fin` y ganador, **0 sin terminar**; ningún hecho imposible —ningún
 *   héroe se mueve, aprende ni empieza batalla después de su `hero_defeated`,
 *   ninguna batalla anidada o sin cerrar, `game_over` el último en las 200—.
 *   **No aparece ni desaparece ningún tipo de hecho**: los mismos diecisiete,
 *   porque la vuelta a la base y la rendición son de la fase 1b. La partida se
 *   alarga —mediana 7 → 8,5 días, p90 8 → 16, máximo 20 → 34— y con ella todo
 *   lo que se cuenta por día: batallas 774 → 1 065, `level_up` 123 → 246,
 *   `dwelling_5` 15 → 161 de 200. **Y el ganador se vuelca**: el jugador 0
 *   gana 42/200 → **195/200**; con control de esquina —los mismos 200 mapas con
 *   las facciones cambiadas de sitio— el caballero pasa de 16,25 % a **93 %**.
 *   No se compensa aquí: la economía la define el usuario. El tiempo de las 200
 *   pasa de ~1,9 s a **~3,1 s** (tres pasadas: 3 144, 3 135 y 3 120 ms), y
 *   `autoResolve` de ~72 a ~355 ms, porque una batalla ya no es de cinco stacks
 *   sino de diez a veinte individuos por bando.
 * - `54a035f0…` (45 128 líneas): un solo despliegue. Las filas de HoMM2 para
 *   cinco o menos (`ROWS_BY_COUNT`) convivían con el despliegue nuevo solo para
 *   no mover tests del motor, y las dos se jugaban (974 bandos con la vieja,
 *   1 156 con la nueva). Antes de mover nada, el mismo ciclo hizo el motor de
 *   batalla más barato —vecinas memorizadas, BFS por índice, las casillas del
 *   enemigo una vez por enemigo— **sin mover el ancla `7372210b…`**, comprobado
 *   tras cada bloque. Forma del diff contra `7372210b…`: **163 de 200 semillas
 *   idénticas hecho a hecho**, y en las 37 que cambian **ninguna diferencia
 *   ocurre antes de la primera batalla** —el despliegue solo existe dentro de
 *   una—; el primer hecho distinto es `battle_ended` en 27 (y en las 27 lo único
 *   distinto es el `winner`), `hero_moved` en 8, y `recruited` y `turn_start`
 *   en una cada una. 200/200 con `fin`, **0 sin terminar**, 0 hechos
 *   imposibles, los mismos diecisiete tipos; cambia el ganador en 4 semillas
 *   (j0 195 → 193 de 200), mediana 8,5 → 8 días, máximo 34 → 37. Tiempo de las
 *   200: **~2,7 s** (2 654, 2 665 y 2 790 ms), desde ~3,1 s; `autoResolve`
 *   ~175 ms, desde ~360.
 * - `c36d3cc5…` (40 158 líneas): el héroe en el tablero, la rendición, la vuelta
 *   a la base y el tope de 7 por bando (fase 1b de NuevaJugabilidad), anclado
 *   una sola vez al final del ciclo. Forma del diff contra `54a035f0…`: **cero
 *   semillas idénticas** y el primer hecho distinto es `recruited` en 193 y
 *   `battle_started` en 7, que es lo que tiene que ser: el ejército de salida
 *   baja a 4–6 individuos y los monstruos a 3–7, y las dos cosas se notan antes
 *   de la primera batalla (198 de 200 divergen antes de ella). 200/200 con `fin`
 *   y ganador, **0 sin terminar**, **0 hechos imposibles** —entre el
 *   `hero_defeated` y el `hero_returned` de un héroe no hay nada suyo (las 1 034
 *   vueltas tras caer van pegadas a su caída), y un héroe que cae sin vuelta
 *   (200, uno por partida: el que pierde su base) no vuelve a aparecer;
 *   `game_over`, el último en las 200—. **`hero_defeated` ya no es el final de
 *   un héroe**: lo es solo sin base. Siguen siendo **diecisiete tipos** y no
 *   dieciocho como preveía el plan: entra `hero_returned` (1 491: 1 034 tras
 *   caer y 457 rendiciones) y **sale `hero_hired`** (720 → 0), porque un héroe
 *   que vuelve a casa no deja al jugador sin héroes y `planHires` solo contrata
 *   con cero. Batallas 1 060 → 1 760, `level_up` 241 → 674, mediana 8 → 8 días,
 *   p90 16 → 12, máximo 37 → 26; `dwelling_5` 159 → **4** de 200 y `dwelling_6`
 *   17 → 0. **El ganador se vuelca otra vez**: j0 193 → **7 de 200**; con control
 *   de esquina el caballero pasa de 91,75 % a **1,50 %** (el instrumento da el
 *   16,25 % documentado sobre `d9a96a7`). No se compensa: la economía y el
 *   equilibrio los decide el usuario. Tiempo de las 200: **~2,65 s** (2 637,
 *   2 654 y 2 663 ms); `autoResolve` ~125 ms, desde ~175, porque sus batallas
 *   espejo —sin héroe— salen con el ejército de salida nuevo, más corto.
 *   **La conservó la pasada de `/simplify` de la 1b**, incluida la única regla
 *   que cambió a propósito: que el castillo en el que cae un héroe defendiendo
 *   se capture aunque no sea su base. Se esperaba re-anclar y no hizo falta: la
 *   IA no pierde nunca un castillo que no sea la base defendiéndolo con un héroe
 *   dentro —comparadas las dos reglas en 2 000 semillas: 0 partidas distintas,
 *   las 1 528 capturas tras vencer a un héroe defensor son todas de su base—.
 * - `957a2486…` (40 158 líneas, **las mismas**): la corrección de QA de la 1b.
 *   **No mueve una sola partida: mueve lo que cuenta la crónica.** El
 *   `hero_returned` de una rendición lleva ahora lo que se pagó (`gold`), para
 *   que la persona y el agente lean el precio después de pagarlo (H-2). Forma
 *   del diff contra `c36d3cc5…`: **457 líneas distintas de 40 158, las 457
 *   rendiciones y nada más**, y en cada una lo único distinto es el
 *   `"gold":N` insertado tras `"surrendered":true`; quitándolo, el volcado da
 *   `c36d3cc5…` **exacto**. Las 1 034 vueltas tras caer, byte a byte iguales.
 *   El veto de rendirse por quien no es la IA (H-1) no entra aquí a propósito:
 *   `playAiGame` no veta a nadie, porque en el banco todos los bandos los lleva
 *   la IA y rendirse es decisión suya.
 * - `9a0a3313…` (36 905 líneas): el mapa es una red de nodos (fase 2a de
 *   NuevaJugabilidad, «la red»), anclado una sola vez al final del ciclo. Otro
 *   mapa entero —Voronoi con cordilleras, nodos y ciudades neutrales con
 *   guarnición—, así que **cero semillas idénticas**, y el primer hecho distinto
 *   es `built` en 200 de 200: el primer hecho con casilla de cada partida es la
 *   construcción del día 1, y la base ya no está en (3,3). 200/200 con `fin` y
 *   ganador, **0 sin terminar**, **0 hechos imposibles** (ningún hecho tras
 *   `game_over`, ninguna batalla anidada o sin cerrar, ningún héroe que actúe
 *   tras caer sin vuelta). **Sale `mine_captured` (826 → 0) y entra
 *   `node_captured` (1 203)**; vuelve `hero_hired` (0 → 10): quien pierde la base
 *   y conserva una ciudad contrata en ella. Dieciocho tipos. `town_captured`
 *   202 → 1 521, porque hay ciudades neutrales que tomar y retomar. Partidas más
 *   cortas: mediana 8 → **6** días, p90 12 → 11, máximo 26 → 25. **El ganador se
 *   da la vuelta**: j0 7 → **139 de 200**; con control de esquina —los mismos
 *   mapas con las facciones cambiadas de sitio, 400 partidas— el caballero gana
 *   el **62 %** y el asiento 0 el 56,5 % (desde 1,50 % del caballero). De las 200
 *   derrotas, **162 son por la regla nueva de `checkDefeat`** —sin héroes, sin
 *   base y sin oro para contratar— y 38 por quedarse sin castillos: con
 *   ciudades neutrales que tomar, quien pierde la base casi siempre conserva
 *   alguna, y sin esa regla el barrido de 1 000 semillas deja 12 sin terminar.
 *   Tiempo de las 200: **~2,75 s** (2 760, 2 721 y 2 753 ms), desde ~2,65;
 *   `autoResolve` igual (~121 ms), porque sus batallas espejo no miran el mapa.
 *   **No llegó a commitearse**: es el ancla intermedia de la 2a, antes de su
 *   pasada de `/simplify`, y se deja por la forma del diff que documenta.
 * - `1fd0d9a1…` (24 924 líneas): la 2a con su `/simplify` aplicado y la regla
 *   del usuario, anclada una sola vez. Cuatro cambios de regla a la vez, y el
 *   primer hecho distinto dice cuál pesa: `hero_moved` en 76 semillas (lo hostil
 *   se alcanza pero no se cruza, en el camino de todos), `battle_started` en 57
 *   (lo mismo: ya no se tropieza con un héroe en un paso), `garrison_taken` en
 *   45 (la tropa de casa se recoge **al pasar**, y los puntos del día no se
 *   recortan) y `node_captured` en 20; `player_defeated` en 2 (**perder la base
 *   elimina**). Y además todos los cruces de grado ≥ 3 son ciudad. 0 semillas
 *   idénticas, 200/200 con `game_over` de último hecho, 0 sin terminar, **ningún
 *   tipo nuevo**; sale `hero_hired` (10 → 0): ya nadie sobrevive a perder la
 *   base para contratar en otra ciudad. Las 200 derrotas siguen a la captura
 *   de la base del derrotado, como antes (también en `9a0a3313…`: la regla de
 *   «congelado» solo remataba a quien ya la había perdido). Partidas más
 *   cortas: mediana 6 → **4** días, p90 11 → 6, máximo 25 → 18; hechos
 *   36 905 → 24 924. Ganador j0 139 → **135 de 200**; control de esquina (400
 *   partidas): caballero **60,75 %**, asiento 0 61,25 %. Tiempo de las 200:
 *   **~1,69 s** (1 680, 1 692 y 1 686 ms), desde ~2,75: partidas más cortas y
 *   `chooseHeroDestination` sin la cadena de predecesores.
 * - `02bf2610…` (30 862 líneas): **la base nace con guarnición** (decisión del
 *   usuario tras la 2a), anclada una sola vez. Tres de nivel 1, dos de nivel 2
 *   y dos de nivel 3 de la facción del dueño: 7 individuos y 20 de liderazgo,
 *   la base llena. El primer hecho distinto es `hero_moved` en **200 de 200**,
 *   y es el reclutamiento que falta: con la base llena y el héroe fuera no cabe
 *   ni un recluta, así que los **600 `recruited` del día 1 pasan a 0**. 0
 *   semillas idénticas, **ningún tipo nuevo ni perdido**, 200/200 con
 *   `game_over` de último hecho, 0 sin terminar. Más batallas (1 247 → 1 584),
 *   más `town_captured` (1 092 → 1 448) y más `garrison_taken` (438 → 642): el
 *   héroe que vuelve a casa se lleva la guarnición. Hechos 24 724 → 30 662;
 *   mediana 4 → **5** días, p90 6 → **9**, máximo 18 → **14**. **El ganador se
 *   da la vuelta otra vez**: j0 135 → **61 de 200**; con control de esquina
 *   (400 partidas) el caballero gana el **26,25 %** (desde 60,75) y el asiento 0
 *   el 53,25 %. Tiempo de las 200: 2 107, 2 167 y 2 403 ms, desde ~1,69:
 *   partidas más largas.
 * - `2a836460…` (30 862 líneas): `player_defeated` **dice por qué** (I1 de la
 *   QA de la 2a: el cliente contaba la derrota con la regla de antes porque el
 *   hecho no traía la causa). Cambian **200 líneas de 30 862, las 200
 *   `player_defeated`**, y nada más: quitando `"reason":"lost_base",` el
 *   volcado nuevo es byte a byte el de `02bf2610…`. Las 200 son `lost_base`;
 *   `nothing_left` no sale nunca, porque toda partida real tiene base.
 * - `c1da16a0…` (52 531 líneas): **el camino cuesta** —asaltantes de caminos,
 *   un mapa de 28×28 en vez de 24×24 elegido midiendo, y **licenciar tropa**—,
 *   anclado una sola vez para el commit. Otro mapa entero, así que **cero
 *   semillas idénticas** contra `2a836460…`. Hubo un ancla intermedia que nunca
 *   llegó a `main`, `d68a0aa6…` (71 469 líneas), y la forma se miró contra las
 *   dos. Contra ella, que es la que cuenta lo que cambió /simplify, el primer
 *   hecho distinto es `raider_spawned` en las 200 —los grupos del mapa de
 *   salida se cuentan ahora, uno por grupo, tras el `day_start` del día 1— y
 *   **los tipos siguen siendo 20**: sale `raider_moved` (14 694, el 20 % del
 *   volcado, que no leía nadie: la patrulla es estado, no hecho) y entra
 *   `dismissed` (683 licencias, 1 503 individuos), y `raider_spawned` pasa de 47
 *   a 2 022. **Emboscadas: 304 → 0**, de las que el grupo ganaba 270: la IA ya no
 *   «va igual» cuando el alcance prudente no le da destino, se repliega a su base
 *   y allí cambia tropa (`planRecruits`) hasta que los grupos dejan de sacarle el
 *   margen. Ninguna batalla en la que un héroe ataque a un grupo (era 1).
 *   **0 hechos imposibles**: `game_over` último y único en las 200, ninguna
 *   batalla anidada ni sin cerrar, ningún grupo que embosque o se disperse
 *   después de caer o sin haber nacido, ningún `raider_spawned` dos veces ni con
 *   protagonista, ninguna dispersión ni licencia sin él, y las 200 cuentan sus
 *   grupos de salida. 200/200 con ganador, **0 sin terminar**. Duración: mediana
 *   **8** días (como `d68a0aa6…`, desde 5 en `2a836460…`), p90 17 → **15**,
 *   máximo 49 → **35**; hechos 71 269 → 52 331 (30 662 en `2a836460…`). Ganador
 *   j0 88 → **100 de 200**. Tiempo de las 200: **~3,4 s** (3 395, 3 450 y
 *   3 489 ms), desde ~4,1 con `raider_moved` y la ocupación por cadenas, y ~2,15
 *   en `2a836460…`. `autoResolve` igual (~124 ms).
 * - `a6811441…` (46 852 líneas): **la tropa crece** —la experiencia se gana por
 *   daño × nivel del que lo recibe, gane o pierda, con umbrales Fibonacci; la
 *   tropa sube hasta el 5 con +1/+1 por nivel y el héroe sin tope; la IA
 *   licencia antes a los novatos—, anclado una sola vez. Es una regla NUESTRA y
 *   no de fheroes2, y sustituye a la de antes (bajas en PV del perdedor, +500
 *   por héroe y por asedio). Forma del diff contra `c1da16a0…`: **cero semillas
 *   idénticas** y el primer hecho distinto es **`level_up` en 184 y
 *   `troop_level_up` en 16**, y en las 200 **después del primer
 *   `battle_ended`**: nada cambia antes de la primera batalla, que es donde
 *   empieza a contar. **Un tipo nuevo, `troop_level_up` (1 546: 1 019 al 2, 336
 *   al 3, 149 al 4 y 42 al 5), ninguno perdido.** `level_up` 771 → **1 878**,
 *   ahora hasta el nivel 13 (392 al 2 … 1 al 13). **0 hechos imposibles**:
 *   `game_over` último y único en las 200, todo ascenso pegado a su
 *   `battle_ended`, ningún veterano ni héroe que salte un nivel, ningún
 *   `troop_level_up` sin dueño ni fuera de 2..5. 200/200 con ganador, **0 sin
 *   terminar**. Partidas más cortas: mediana 8 → **6** días, p90 15 → 12, máximo
 *   35 → 24 —lo pesado es el héroe que crece, no la tropa—; con ellas baja todo
 *   lo que se cuenta por día (`hero_moved` 25 121 → 21 050, `built` 4 764 →
 *   3 721). **El ganador se mueve**: j0 100 → **76 de 200**, 76 semillas con
 *   otro ganador. Publicado y no compensado, como pidió el usuario. Tiempo de
 *   las 200: **~3,3 s** (3 226, 3 275 y 3 301 ms), desde ~3,4: partidas más
 *   cortas que pagan la cuenta de la experiencia. `autoResolve` igual (~124 ms).
 *   La medida entera —individuos por nivel, los que pisan su base en el 5,
 *   héroes por nivel— la publica `tools/qa/veterania.ts`.
 * - `3bb44c4b…` (62 531 líneas): **una sola escala de niveles** —todo héroe nace
 *   en el nivel 5 con los 220 de experiencia del 5, donde acaba la tropa, y sus
 *   cifras se reindexan para que un 5 tenga lo que antes un 1—, anclado una sola
 *   vez y en el mismo ciclo que `a6811441…`, que no llegó a commitearse. La
 *   reindexación sola no mueve nada: con el nivel inicial puesto a 1 sale
 *   `a6811441…` exacto. Lo que mueve es que subir cuesta más (el primer ascenso
 *   del héroe pasa de 20 a 160) y que pegarle a un héroe da ×5 o más. Forma del
 *   diff contra `a6811441…`: **cero semillas idénticas**, y en **las 200** el
 *   primer hecho distinto del volcado viejo es **un `level_up`** —el ascenso al 2
 *   que ya no llega—, siempre **después del primer `battle_ended`**. Ningún tipo
 *   nuevo ni perdido. `level_up` 1 878 → **880**, ahora del 6 al 14 (341 al 6 …
 *   1 al 14) y ninguno por debajo del 6; `troop_level_up` 1 546 → **2 986**
 *   (1 783 al 2, 768 al 3, 336 al 4 y 99 al 5): la tropa sube el doble porque
 *   las partidas duran más. **0 hechos imposibles**: `game_over` último y único,
 *   cada héroe sube de uno en uno desde el 5, ninguna `troop_level_up` sin dueño
 *   ni fuera de 2..5. 0 sin terminar. **Partidas más largas**: mediana 6 → **9**
 *   días, p90 12 → 18, máximo 24 → 35, de vuelta hacia las de `c1da16a0…`
 *   (8 / 15 / 35). **El ganador vuelve hacia el centro**: j0 76 → **91 de 200**,
 *   89 semillas con otro ganador. Emboscadas, 0 y 0. Tiempo de las 200: **~4,1 s**
 *   (4 059, 4 100 y 4 124 ms), desde ~3,3: las partidas son más largas.
 *   `autoResolve` igual (~123 ms).
 * - `0c8fc759…` (62 531 líneas, **las mismas**): `troop_level_up` deja de llevar
 *   `hero` —quién llevaba a la tropa—, que no leía nadie. Re-anclado una vez,
 *   en la pasada de /simplify del ciclo, y comprobada la forma antes de anclar:
 *   **2 986 líneas distintas de 62 531, las 2 986 `troop_level_up`** —todas las
 *   del volcado— y en las 2 986 la única diferencia es el campo `hero` quitado;
 *   cero líneas `fin` distintas y ningún otro hecho movido. El resto de la
 *   pasada (una regla de quién se licencia, el nivel en las cifras, una función
 *   para «catálogo + veteranía», el nivel del héroe derivado de su experiencia…)
 *   dejó `3bb44c4b…` exacto, comprobado tras cada bloque.
 * - `7c24a8b4…` (66 088 líneas): **el equipo** (botín, equipo base del héroe,
 *   armería e IA que compra y equipa). Mueve las partidas a propósito, y se
 *   re-ancló una sola vez al final con la forma comprobada por pasos contra
 *   `0c8fc759…`, quitando la columna de índice y el recuento de hechos:
 *   1. **Solo botín y mochila** (el héroe todavía desnudo, sin armería ni IA que
 *      equipe): **0 líneas quitadas y 1 045 añadidas, las 1 045 `loot_found`**,
 *      todas `from: town` —la IA no pelea con asaltantes—. El botín tira de su
 *      propia corriente y no desplaza ni una tirada.
 *   2. **El equipo base** (+3/+3 a todo héroe): cambia las batallas, como se
 *      sabía; 185 de 200 semillas distintas, 47 con otro ganador (23 y 24 en
 *      cada sentido: el jugador 0 gana 92 donde ganaba 91).
 *   3. **Armería e IA**: 179 de 200 semillas distintas, y en las 179 la primera
 *      línea distinta va **detrás de un `loot_found`** —la IA se pone el botín—;
 *      ninguna diverge antes de que haya algo que equipar. 23 partidas levantan
 *      la armería (está la última de la lista: ver `strategy.ts`), 1 187 compras.
 *   Duración 8 / 17 / 42 días desde 9 / 18 / 35; el jugador 0 gana 93 de 200.
 * - `bd4d4a13…` (64 763 líneas): **la IA no derrocha en compras** (hallazgo I2 de
 *   QA, en el mismo ciclo y sin commitear `7c24a8b4…`). Compraba 18 piezas al día
 *   —seis novatos por tres huecos— para una tropa que caía al día siguiente: 1 187
 *   compras en 14 semillas, 268 en la 136. Ahora compra solo si quien la recibiría
 *   es el héroe o un veterano de nivel 2 o más, a un novato solo con 10 000 de oro
 *   de sobra, y como mucho 3 por héroe y día. Forma del diff contra `7c24a8b4…`:
 *   **186 semillas idénticas**, y en **las 14** que cambian —las mismas 14 que
 *   compraban— el primer hecho distinto del volcado viejo es **un `item_bought`
 *   que ya no ocurre**; nada diverge antes de una compra. Compras 1 187 → **221**
 *   (máximo 268 → 66, la 185, con oro de sobra), 3 semillas con otro ganador
 *   (j0 93 → **92**). Duración 8 / 17 / **43**. Re-anclado una vez; todo lo demás
 *   del pase de QA (I1, I4, M1-M5) dejó `7c24a8b4…` exacto, comprobado antes.
 * - `656e567e…` (63 011 líneas): **el turno en tramos y la carga en línea recta**
 *   (02-10-2026), en tres pasos y anclado una sola vez al final:
 *   1. **Tramos** —`move` ya no cierra el turno; la IA cierra tras un tramo—:
 *      `bd4d4a13…` **byte a byte**, que es lo que demuestra que el núcleo nuevo
 *      juega igual que el viejo (la moral se sigue tirando en `endTurn`, sin
 *      una tirada de más).
 *   2. **La carga en recta** (≥ 3 casillas, sin giros ni unidades en medio, en
 *      vez de los pasos del camino): `343fbacd…`. **185 semillas idénticas**, y
 *      las 15 que cambian están entre las 20 en las que una unidad con `charge`
 *      ataca con `from`, ninguna diverge antes del turno de ese ataque. Cargas
 *      cobradas en las 200: 109 de 282 golpes con el rasgo → 33 de 300 (las de 1
 *      y 2 casillas, y las de rodeo, desaparecen). 3 semillas con otro ganador.
 *   3. **La IA aprovecha el segundo tramo** (tras moverse, si alcanza, pega):
 *      `656e567e…`. 67 semillas idénticas a las del paso 2; las 133 que cambian
 *      están entre las 152 con alguna decisión tras un tramo distinta de cerrar,
 *      y ninguna diverge antes del turno de la primera. El primer hecho
 *      distinto es una consecuencia de batalla —`troop_level_up` 68,
 *      `level_up` 17, `battle_ended` 12, `town_captured` 12…—. 39 semillas con
 *      otro ganador.
 *   Contra `bd4d4a13…`: 67 iguales, 36 con otro ganador, j0 92 → **96**.
 *   Duración 8 / 17 / 43 → **9 / 17 / 37**.
 * - `290812e6…` (62 748 líneas): **la carga es contra un enemigo que está EN la
 *   recta** (hallazgo H1 de QA, decisión del usuario: «no se puede cargar contra
 *   un enemigo que esté al lado»). `cargaDesde` exige además que la casilla que
 *   sigue a `from` sea del objetivo. Comprobado a propósito que es lo ÚNICO que
 *   cambia: con esa línea quitada sale `656e567e…` exacto. Forma del diff contra
 *   `656e567e…`: **194 semillas idénticas**, y las 6 que cambian están entre las
 *   19 en las que una unidad con `charge` ataca con `from`; el primer hecho
 *   distinto es una consecuencia de batalla (`battle_ended` 2, `troop_level_up`
 *   2, `hero_defeated` 1, `town_captured` 1). Cargas cobradas en las 200: **28
 *   de 218** golpes con el rasgo (23 de 3, 4 de 4, 1 de 5) → **0 de 203**: en
 *   ninguno de esos golpes estaba el objetivo en la recta. En 10 de los 203 sí
 *   había una carga, contra OTRO enemigo que la IA no eligió. 1 semilla con otro
 *   ganador (la 137; j0 96 → 95). Duración 9 / 17 / 37, igual. H2 y los menores
 *   del mismo pase dejaron `656e567e…` exacto, comprobado antes.
 * - `da7609d5…` (63 133 líneas): **la IA busca la carga** (decisión del usuario,
 *   02-10-2026). Si desde donde está no se le carga al objetivo, una unidad con
 *   `charge` da un tramo de lado que lo deja en recta y le carga en el tramo
 *   siguiente del mismo turno (`pasoParaCargar`, en `ai/tactics.ts`). Forma del
 *   diff contra `290812e6…`: **194 semillas idénticas**; las 6 que cambian están
 *   entre las 17 en las que se da algún paso de lado, y ninguna diverge antes del
 *   hecho en que se da el primero. El primer hecho distinto es una consecuencia
 *   de batalla (`troop_level_up` 5, `battle_ended` 1). Cargas cobradas en las
 *   200: **0 de 203** golpes con el rasgo → **64 de 222** (58 de 3, 6 de 4), con
 *   64 pasos de lado. 1 semilla con otro ganador (la 158; j0 95 → 96). Duración
 *   9 / 17 / 37, igual. N2 y N3 de QA, del mismo pase y solo del cliente,
 *   dejaron `290812e6…` exacto, comprobado antes.
 * - `b6b6a07e…` (62 162 líneas): **mapas densos** (03-10-2026, decisión del
 *   usuario). Fronteras de 2-3 casillas con cinco barreras distintas en el
 *   motor, obstáculos que bloquean dentro de cada región, caminos generados,
 *   `AREA_POR_REGION` 144 → 300 y `LADO_DEL_MAPA` 28 → 34. Cambia el mapa de
 *   todas las partidas, así que la forma del diff es la esperada: **0 semillas
 *   idénticas**, 91 con otro ganador, j0 96 → **93**, **0 sin terminar**.
 *   Duración 9 / 17 / 37 → **8 / 15 / 36**. Por tipo de hecho: `hero_moved`
 *   28 626 → 33 879 (más camino entre sitios), batallas 2 094 → 1 625,
 *   `town_captured` 1 828 → 1 376, ningún tipo nuevo ni ninguno que desaparezca.
 *   Se re-ancló una sola vez, al final; los dos pasos sin cambio de mapa
 *   (terrenos nuevos y `regions[].terrain`) dejaron `da7609d5…` exacto.
 * - `2398f5d3…` (68 464 líneas): la **vuelta de simplify** de los mapas densos
 *   (03-10-2026). Un vestido que falla ya no tira la red fina, los cuatro tipos
 *   de frontera se reparten en vez de re-sortearse, los obstáculos sortean su
 *   densidad en otro orden y los caminos son un Dijkstra: el generador consume
 *   el `rng` de otra manera y **cambia el mapa de las 200 semillas** —el primer
 *   hecho distinto es un `raider_spawned` en las 200—. Lo que prueba que no
 *   cambió nada más: con el generador de antes y el resto del núcleo de ahora
 *   (`Suelo`, la vecindad en tabla, los costes sin barreras) sale `b6b6a07e…`
 *   exacto. Forma: **0 semillas idénticas**, 89 con otro ganador, j0 93 → 106,
 *   **0 sin terminar**, duración 8 / 15 / 36 → **8 / 15 / 28**; `hero_moved`
 *   33 879 → 37 301, batallas 1 625 → 1 758, `town_captured` 1 376 → 1 517,
 *   ningún tipo nuevo ni ninguno que desaparezca. Re-anclado una vez, al final.
 * - `1b90bfd9…` (65 043 líneas): la **vuelta 1 de QA** de los mapas densos
 *   (03-10-2026). Cuatro barreras garantizadas solo en fronteras con muro que
 *   sobrevive y con `casillasMinimasPorTipo` cada una, el otro lado engordado a
 *   la fuerza frente a un pasillo largo, y los caminos como árbol entre los
 *   nodos más una senda a cada mina y pueblo (decisión del usuario). Cambia el
 *   mapa de las 200: el primer hecho distinto es un `raider_spawned` en 129 (el
 *   generador consume el `rng` de otra manera) y un `hero_moved` en 71 (mismo
 *   mapa, otros caminos). **0 semillas idénticas**, 72 con otro ganador, j0
 *   106 → 100, **0 sin terminar**, duración 8 / 15 / 28 → **8 / 15 / 25**;
 *   `hero_moved` 37 301 → 35 470, batallas 1 758 → 1 685, `town_captured`
 *   1 517 → 1 446, ningún tipo nuevo ni ninguno que desaparezca. **Una
 *   emboscada** (0 → 1, semilla 10): sin la regla nueva de `ai/turn.ts` esa
 *   semilla no terminaba —los dos héroes encerrados en una región que los
 *   embosca, 298 días quietos—, y con ella el héroe 1 vuelve a casa y cae en el
 *   intento. Esa regla, con el generador de antes, deja `2398f5d3…` exacto.
 *   Re-anclado una vez, al final.
 * - `6bb678bc…` (71 418 líneas): **caminos radiales con un cruce por pareja**
 *   (#149, 06-10-2026, variante B que eligió el usuario). Cada región traza sus
 *   radios desde un centro; entre dos vecinas, un solo nodo lleva camino.
 *   Mismo mapa, otros caminos —`trazarCaminos` no tira del `rng`—, y lo dice la
 *   forma: el primer hecho distinto es un **`hero_moved` en las 200** (el
 *   índice 11-66 de la crónica, el día 1 en 199 y el 2 en una; el mismo paso
 *   cuesta otra cosa, p. ej. s1: 105 → 140). Un `raider_spawned` o un
 *   `day_start` primero habría querido decir que se movió algo más. **0
 *   semillas idénticas**, 85 con otro ganador, j0 100 → 89 (en 600 semillas del
 *   barrido, 286 → 290: ruido), **0 sin terminar**, duración 8 / 15 / 25 →
 *   **9 / 17 / 34**: menos camino, más días andando. `hero_moved` 35 470 →
 *   38 586, batallas 1 685 → 1 870, `town_captured` 1 446 → 1 577,
 *   `node_captured` 1 599 → 1 443, ningún tipo nuevo ni ninguno que
 *   desaparezca. Re-anclado una vez, al final.
 * - `642241f8…` (vuelta de /simplify de #149, 06-10-2026): **los pasos se
 *   separan de los demás nodos como las ciudades** (Chebyshev ≥ 3) y el cruce
 *   con camino de cada pareja lo elige la red, por cercanía a las semillas. Lo
 *   primero cambia la red: en las 200 semillas, **169 con otra red** (unos 2,6
 *   pasos menos por mapa, ninguna pareja de vecinas perdida), 1 con la misma
 *   red y otro vestido, 29 con el mismo mapa y otros caminos y 1 idéntico. La
 *   forma lo dice: con el mismo mapa, el primer hecho distinto es un
 *   **`hero_moved` en 25** y las otras 4 se juegan igual; con otra red, el
 *   primero es el que toque en otro mapa (`raider_spawned` 132, `hero_moved`
 *   23, `node_captured` 12, `turn_start` 2). 5 idénticas, 83 con otro ganador,
 *   j0 89 → 92, **0 sin terminar**, duración 9 / 17 / 34 → **8 / 15 / 39**.
 *   `hero_moved` 38 586 → 36 521, batallas 1 870 → 1 773, `town_captured`
 *   1 577 → 1 477, `node_captured` 1 443 → 1 284; ningún tipo nuevo ni ninguno
 *   que desaparezca. El Dijkstra más barato de la misma vuelta no mueve el
 *   hash: con la búsqueda ingenua da el mismo `642241f8…`.
 * - `020ccc58…` (67 071 líneas): **los caminos como tramos** (#153,
 *   06-10-2026). El mapa guarda los tramos que traza `trazarCaminos` y ya no
 *   hay fase de fallo `caminos`, que volvía a vestir el mapa cuando lo dibujado
 *   por adyacencia rozaba un nodo ajeno. Las casillas de camino no cambian
 *   —enderezar las horquillas en L solo cambia tramos—, así que solo cambian
 *   las semillas en las que esa fase se disparaba: **exactamente 43, 60, 64,
 *   70, 87, 167 y 177**, todas con otro mapa desde el primer hecho que lo
 *   dice (el `raider_spawned` del índice 1; el 0 es el `day_start`). Las otras
 *   193, idénticas línea a línea. Dos con otro ganador (64 y 87), **0 sin
 *   terminar**, duración 8 / 15 / 39 igual. Re-anclado una vez, al final.
 * - `6157d75a…` (67 071 líneas): **un grupo de asaltantes se ve al ver su
 *   región** (#130, 07-10-2026). Cambia solo el sello `seen` de
 *   `raider_spawned` (346 líneas) y `raider_dispersed` (81): 427 líneas en 153
 *   semillas, **todas ganando un jugador** que veía la región y no la casilla.
 *   Ninguna línea `fin` distinta, ningún otro campo, ningún `march_halted` ni
 *   `march_cut` (la IA esquiva las regiones que emboscan y recorta sus marchas
 *   antes, así que no se para nunca). El primer cambio, en la semilla 2: los
 *   `raider_spawned` de `raider-4`, `raider-5` y `raider-6`. Medido tras fusionar
 *   los restos del agente (#121), que no mueven el hash. Aprobado por el
 *   usuario con esa forma.
 * - `82123423…` (67 724 líneas): **cada nodo entra por un eje** (#161, #166
 *   H10, 07-10-2026). El vestido protege dos entradas opuestas hasta la segunda
 *   casilla y sigue en cruz (`ejeDelNodo`, `vestir.ts`), y no se siembra nada en
 *   `n ± 2d` (`delanteDeNodo`). Cambia dónde caen los objetos y, cuando un
 *   vestido falla donde antes no (o al revés), la red: **0 semillas
 *   idénticas**, y en las 200 el primer hecho distinto es un
 *   **`raider_spawned` del día 1** (índice 1-7 de la crónica): en 144 con la
 *   misma red (otras casillas libres para el `rng.pick` de objetos y
 *   asaltantes) y en 56 con otra, todas con alguna red tirada en una de las dos
 *   versiones (`docs/agents/2026-10-07-orillas-del-puente/redes/`). Vestidos
 *   por mapa 3,55 → 4,89. 95 con otro ganador, j0 94 → 93, **0 sin terminar**,
 *   duración 8 / 15 / 39 → **9 / 16 / 43** (la mediana es ruido de la muestra:
 *   con `tamanos.ts` en 1-1000 pasa de 9 a 8 y en 1001-2000 se queda en 9, con
 *   el p90 en 16; QA de #161, H3). `hero_moved` 36 423 → 37 005,
 *   batallas 1 774 → 1 715, `town_captured` 1 493 → 1 427, `node_captured`
 *   1 287 → 1 316; ningún tipo nuevo ni ninguno que desaparezca. Re-anclado
 *   una vez, al final.
 * - `105a3604…` (68 715 líneas): **bordes de barrera sin tramos rectos** (#169,
 *   07-10-2026). El engorde va casilla a casilla, con una reparación donde
 *   dos regiones quedarían a dos pasos y el lado que engorda dado la vuelta a
 *   trechos de 4 (`vestir.ts`); el paso de cada pareja se elige con eje pleno
 *   (`conEjePleno`, `generate.ts`), en las mismas parejas que antes, y las
 *   redes suben de 20 a 30. Cambian todos los mapas: **0 semillas idénticas**;
 *   el primer hecho distinto es un **`raider_spawned`** (índice 1 en 199, 3 en
 *   una): otro mapa, otra casilla. autoResolve igual (300 batallas, 2 280
 *   rondas): las batallas no dependen del mapa. 92 con otro ganador, j0 93 →
 *   93, **0 sin terminar**, duración 9 / 16 / 43 → **9 / 16 / 45**.
 *   `hero_moved` 37 005 → 37 254, batallas 1 715 → 1 777, `town_captured`
 *   1 427 → 1 489, `node_captured` 1 316 → 1 310; ningún tipo nuevo ni
 *   ninguno que desaparezca. Re-anclado una vez, al final.
 * - `16d28781…` (68 466 líneas): **nada sembrado bajo una entrada diagonal**
 *   (#166 H10, 07-10-2026). `delanteDeNodo` (`generate.ts`) veta además
 *   `n + (±1, ±2)`: un pueblo bajo la entrada diagonal del sur tapaba el
 *   estribo de abajo de un puente diagonal (34 de 1 015 puentes en 1-400; 0
 *   después), y el reflejo va para no negar el espejo a `colocarPar`. Cambia
 *   dónde caen los objetos: **0 semillas idénticas**, y el primer hecho
 *   distinto es un **`raider_spawned` del día 1** (índice 1 en 193, 3 en 4, 5
 *   en 2, 7 en 1). autoResolve igual (300 batallas, 2 280 rondas). 96 con otro
 *   ganador, j0 93 → 91, **0 sin terminar**, duración 9 / 16 / 45 → **9 / 16 /
 *   70** (el máximo es la s25; con `tamanos.ts 34 1000`, 9 / 16 / 45 →
 *   8 / 15 / 70, 0 sin terminar, j0 518 → 526). `hero_moved` 37 254 → 37 350,
 *   batallas 1 777 → 1 740, `town_captured` 1 489 → 1 478, `node_captured`
 *   1 310 → 1 281; ningún tipo nuevo ni ninguno que desaparezca. Con el veto
 *   solo al sur, sin el reflejo, j0 ganaba 115 de 200 y lo sembrado con espejo
 *   exacto bajaba del 91,4 al 89,8 % (91,8 % con el reflejo). Re-anclado una
 *   vez, al final.
 * - `e498dd6d…` (68 482 líneas): **el centro de una región no reparte en aspa**
 *   (auditoría 3 §7, 08-10-2026). La cuarta diagonal de una casilla cuesta dos pasos
 *   rectos más (`cerrariaUnAspa`, `vestir.ts`) y el radio entra en T por la
 *   casilla de al lado. Solo cambian casillas de camino, y solo en los mapas
 *   con aspa: de las 7 semillas de 1-200 que la tenían (2, 13, 49, 61, 78,
 *   128, 189) cambian **3, la 13, la 78 y la 128**; las otras 197, idénticas.
 *   El primer hecho distinto es en las tres un `hero_moved` del héroe 1 junto
 *   al aspa vieja (13: (22,15) → (23,15), 105 → 75 puntos; 128: (17,3) →
 *   (17,4); 78: el hecho 255). Mismo ganador y mismo día de fin en las tres
 *   (78: 297 → 313 hechos). Re-anclado una vez, al final.
 * - `dc204d41…` (65 472 líneas): **a una mina, un pueblo o una ciudad se entra
 *   por su puerta** (#188, 08-10-2026). Las minas y los pueblos se colocan con
 *   la casilla de debajo libre y guardada, y no en la fila de delante de otro
 *   (`colocarPar`); los obstáculos no parten una región por uno
 *   (`ponerObstaculos`); y el trazado no los cruza y entra por debajo
 *   (`Busqueda`). Cambia dónde caen los objetos: **0 semillas idénticas**, y
 *   el primer hecho distinto es un **`raider_spawned` del día 1** (índice 1 en
 *   198, 2 y 3 en una cada una). autoResolve igual (300 batallas, 2 280
 *   rondas). 90 con otro ganador, j0 91 → 97, **0 sin terminar**, duración
 *   9 / 16 / 70 → **9 / 15 / 33**. `hero_moved` 37 358 → 35 329, batallas
 *   1 741 → 1 704, `town_captured` 1 479 → 1 468, `node_captured` 1 281 →
 *   1 291; ningún tipo nuevo ni ninguno que desaparezca. Re-anclado una vez,
 *   al final.
 * - `c53c353b…` (66 354 líneas): **el camino se aparta del pie de lo alto y del
 *   borde** (#189, 08-10-2026). Ninguna mina ni pueblo con la puerta en el
 *   borde del mapa (`colocarPar`), y el trazado cobra de más la casilla al pie
 *   de un acantilado, una montaña o un bosque que le queda al norte, y la del
 *   borde (`recargosDelTrazado`, `vestir.ts`). Cambia dónde caen los objetos:
 *   **0 semillas idénticas**, y el primer hecho distinto es un
 *   **`raider_spawned` del día 1** en 198 y un `hero_moved` en 2. Con los tres
 *   recargos a 0 y la colocación de antes sale `dc204d41…` exacto: el cambio es
 *   eso y nada más. autoResolve igual (300 batallas, 2 280 rondas). 111 con
 *   otro ganador, j0 97 → 92, **0 sin terminar**, duración 9 / 15 / 33 →
 *   **8 / 17 / 47** (el máximo es la s36 en los dos: 33 → 47). `hero_moved`
 *   35 329 → 36 140, batallas 1 704 → 1 722, `town_captured` 1 468 → 1 468,
 *   `node_captured` 1 291 → 1 274; ningún tipo nuevo ni ninguno que
 *   desaparezca. Re-anclado una vez, al final.
 * - `fdf6959c…` (67 623 líneas): **las minas van por región** (#195,
 *   08-10-2026). El dato del mapa pasa a ser `REGIONES_POR_BANDO` (5) y el lado
 *   se deriva (`ladoDelMapa(5)` = 34, el de antes); las minas, de 14 fijas por
 *   bando a 3 en casa y 2 por región de fuera (`minasDeLasRegiones`: 11 por
 *   bando), colocadas en el orden de antes (casa, y por rondas las de fuera).
 *   Con el reparto de minas de antes sale `c53c353b…` exacto: el lado derivado
 *   no mueve nada y el cambio es el de las minas. **0 semillas idénticas**,
 *   primer hecho distinto un **`raider_spawned` del día 1** en las 200 (con
 *   menos minas, el azar llega distinto a los asaltantes). autoResolve igual
 *   (300 batallas, 2 280 rondas). 96 con otro ganador, j0 92 → 94, **0 sin
 *   terminar**, duración 8 / 17 / 47 → **9 / 15 / 57**. `hero_moved` 36 140 →
 *   36 344, batallas 1 722 → 1 809, `town_captured` 1 468 → 1 567,
 *   `node_captured` 1 274 → 1 244; ningún tipo nuevo ni ninguno que
 *   desaparezca.
 * - `b9e16773…` (69 157 líneas): **la IA de reglas teme los grupos que ha
 *   visto** (#164, 08-10-2026). `casillasPeligrosas` leía `state.raiders`
 *   entero, a través de la niebla; ahora lee `Player.asaltantesVistos`, que
 *   escribe `explorar` con la regla de `asaltantesALaVista`, y la IA solo
 *   persigue un grupo que ve ahora. **119 de 200 semillas cambian**; el primer
 *   hecho distinto es un **`hero_moved`** en 82 (la ruta pisa la región de un
 *   grupo que aún no ha visto) y un **`march_halted`** en 37 (lo ve andando y
 *   se para, #130), en el día 1 en 68 de ellas y como muy tarde en el 10.
 *   autoResolve igual (300 batallas, 2 280 rondas). 28 con otro ganador, j0
 *   94 → 98, **0 sin terminar**, duración 9 / 15 / 57 → **9 / 17 / 57**.
 *   `hero_moved` 36 344 → 37 370, batallas 1 809 → 1 807, `town_captured`
 *   1 567 → 1 535, `node_captured` 1 244 → 1 273, `hero_defeated` 413 → 447;
 *   un tipo nuevo, `march_halted` (114), y emboscadas a la IA 0 → 0 en estas
 *   200 (1 en 300 semillas del barrido de `docs/historia.md`).
 * - `4fb1a41c…` (67 339 líneas): **la IA de batalla elige a quién ir por el
 *   daño que de verdad hace** (#79, 08-10-2026): `threat × min(vida, daño
 *   esperado) / vida` en vez de `threat / vida`, solo al acercarse. Solo puede
 *   mover partidas desde una batalla, y así sale: **190 de 200 semillas
 *   cambian y ninguna antes de su primer `battle_started`**; el primer hecho
 *   distinto es `troop_level_up` en 88 (la experiencia la reparte quién pega a
 *   quién), `hero_moved` en 43, `town_captured` en 25, `raider_dispersed` en
 *   11, `battle_ended` en 8 (el ganador), y 15 sueltos. autoResolve 2 280 →
 *   2 359 rondas en las 300 batallas y ~127 → ~180 ms (dos pasadas alternas
 *   contra `main`): un `expectedDamage` por enemigo en cada acercamiento. 49 con otro ganador, j0 98 → 89, **0 sin
 *   terminar**, duración 9 / 17 / 57 → **9 / 17 / 28**. Batallas 1 807 →
 *   1 756, `troop_level_up` 2 533 → 2 278, `hero_defeated` 447 → 412,
 *   `town_captured` 1 535 → 1 509; ningún tipo nuevo ni ninguno que
 *   desaparezca. `defend` (contado con una sonda, no sale en la crónica) 76 →
 *   61 de unas 51 000 decisiones de batalla.
 * - `8ca327b5…` (67 339 líneas, las mismas): **`battle_ended` lleva el resumen
 *   de la batalla** (#93, 08-10-2026): `owners`, `rounds`, `casts` y `lost`.
 *   No se juega nada distinto: cambian las 1 756 líneas de `battle_ended` y
 *   ninguna más, y quitándoles esos cuatro campos y reserializando, el volcado
 *   da `4fb1a41c…` exacto. autoResolve igual (300 batallas, 2 359 rondas).
 * - `2d627f08…` (70 279 líneas): **dos reglas de batalla copiadas de
 *   fheroes2** (#199, 08-10-2026): algún no-muerto en el ejército le quita 1 de
 *   moral y anula el +1 de una sola facción, y los empates de iniciativa entre
 *   bandos se alternan (el contrario del último que tuvo turno) en vez de ser
 *   siempre del atacante. Solo pueden mover partidas desde una batalla, y así
 *   sale: **193 de 200 semillas cambian y ninguna antes de su primer
 *   `battle_started`**; el primer hecho distinto es `battle_ended` en 183 (el
 *   resumen de #93: rondas, bajas, ganador), `troop_level_up` en 8 y
 *   `hero_moved` en 2. Por separado, solo la moral mueve 177 semillas y la
 *   iniciativa, encima, 195. 76 con otro ganador, j0 89 → 87, **0 sin
 *   terminar**, duración 9 / 17 / 28 → **9 / 16 / 54**. autoResolve 2 359 →
 *   2 318 rondas en las 300 batallas. Batallas 1 756 → 1 817, `hero_defeated`
 *   412 → 439, `town_captured` 1 509 → 1 515, `node_captured` 1 242 → 1 340,
 *   `troop_level_up` 2 278 → 2 255; ningún tipo nuevo ni ninguno que
 *   desaparezca.
 * - `84f1b036…` (62 792 líneas): **la IA elige el hechizo por la amenaza que
 *   quita** (#92, 08-10-2026): la Flecha va a quien más amenaza le quita al
 *   rival (`threat`, que para el héroe es su bando entero) en vez de a quien
 *   más PV pierde; el umbral de maná sigue en PV. Y los temporales se valoran
 *   por las rondas que compran, que en partida no lanza ninguno (Poder 1: la
 *   Flecha gana siempre). Solo puede mover partidas desde una batalla con
 *   héroe, y así sale: **137 de 200 semillas cambian**, el primer hecho
 *   distinto es `battle_ended` en 136 (los `casts` de #93, ahora al héroe) y
 *   `troop_level_up` en 1. 53 con otro ganador, j0 87 → 108, **0 sin
 *   terminar**, duración 9 / 16 / 54 → **9 / 14 / 28**. Flechas al héroe
 *   1 118 → 1 417 y a la tropa 2 203 → 1 120. Batallas 1 817 → 1 605
 *   (3,46 → 3,13 rondas de media), `hero_defeated` 439 → 358, `town_captured`
 *   1 515 → 1 384, `node_captured` 1 340 → 1 206; ningún tipo nuevo ni
 *   ninguno que desaparezca. autoResolve igual (sus batallas no llevan héroe).
 * - `f69d6b05…` (63 404 líneas): **la muralla, solo en zonas pequeñas** (#208,
 *   08-10-2026): el generador vuelve otra barrera la muralla de más de
 *   `LARGO_MAXIMO_DE_MURALLA` o que toca dos ciudades (con puertas, primero la
 *   parte y deja muro alrededor de cada una), y la ruina pegada a otro muro; y
 *   el paso 8 del vestido cuenta cuatro barreras con sus casillas (el muro, con
 *   las de una muralla), no las repartidas. Cambia el mapa, no las reglas, y
 *   así sale: **110 de 200 semillas cambian**; en 57 el primer hecho distinto
 *   es `hero_moved` (mismos objetos, otra barrera: otro coste de camino), en 52
 *   `raider_spawned` (el vestido sale en otro intento y el mapa es otro) y en 1
 *   `day_start`. 29 con otro ganador, j0 108 → 107, **0 sin terminar**,
 *   duración 9 / 14 / 28 → **8 / 15 / 28**. Batallas 1 605 → 1 635,
 *   `hero_defeated` 358 → 397, `node_captured` 1 206 → 1 237,
 *   `troop_level_up` 2 196 → 2 477; ningún tipo nuevo ni ninguno que
 *   desaparezca. autoResolve igual.
 * - `b2e5ed9c…` (62 593 líneas): **el nivel de cada región, en el mapa** (#143,
 *   08-10-2026): el generador sortea el nivel de cada pareja de regiones
 *   (`data/relieve.json`) justo después de su suelo, y la barrera de cada
 *   frontera sale de las que admiten sus niveles (`barrerasDeLaPareja`, y en
 *   los cruces `desnivelEnLosCruces`); el acantilado deja de ser obstáculo, y
 *   la muralla partida en dos trozos a una casilla se juzga entera. La tirada
 *   de más mueve todo el azar que viene detrás, así que **cambian las 200
 *   semillas** y en todas el primer hecho distinto es el primero del volcado
 *   (`raider_spawned` del día 1: el mapa es otro). 93 con otro ganador, j0
 *   107 → 114, **0 sin terminar**, duración 8 / 15 / 28 → **8 / 18 / 38** (en
 *   1 000 semillas de `tamanos.ts`, 8 / 15 / 38 y 0 sin terminar). Batallas
 *   1 635 → 1 611, `hero_defeated` 397 → 391, `node_captured` 1 237 → 1 212,
 *   `town_captured` 1 379 → 1 344, `march_halted` 104 → 142; ningún tipo nuevo
 *   ni ninguno que desaparezca. autoResolve igual.
 * - `7737a300…` (59 809 líneas): **sin espigas y con menos mesetas** (#210,
 *   08-10-2026). El vestido quita las casillas de una de ancho por encima de
 *   sus dos lados (`quitarEspigas`: rellena la lengua de tierra con el agua de
 *   al lado y ensancha el pasillo del nodo), con el nivel por casilla del
 *   núcleo (`nivelesDelRelieve`); y `data/relieve.json` deja la nieve, la lava
 *   y lo áspero a 2 una vez de cada tres. Cambia el mapa, no las reglas:
 *   **185 de 200 semillas cambian** (15 iguales: su vestido no tenía espigas
 *   y su sorteo de nivel dio lo mismo); en 158 el primer hecho distinto es
 *   `raider_spawned` del día 1 (otro mapa), en 22 `hero_moved` y en 5
 *   `battle_ended` (la misma red con otras barreras: otro coste de camino o
 *   de batalla); 178 cambian el día 1 y 7 entre el 3 y el 8. 89 con otro
 *   ganador, j0 114 → 117, **0 sin terminar**, duración 8 / 18 / 38 →
 *   **8 / 15 / 26**. Batallas 1 611 → 1 536, `hero_defeated` 391 → 329,
 *   `node_captured` 1 212 → 1 152, `town_captured` 1 344 → 1 361,
 *   `march_halted` 142 → 121; ningún tipo nuevo ni ninguno que desaparezca.
 *   autoResolve igual.
 * - `7af02558…` (60 535 líneas): **la senda no corta el agua en diagonal**
 *   (#210, 08-10-2026): la búsqueda cobra dos rectos por el paso en diagonal
 *   con una esquina de agua y lo que queda pasa esa esquina a montaña
 *   (`sinAguaEnLasEsquinas`), salvo el río junto a un puente; si eso deja el
 *   agua de la frontera sin sus casillas, el vestido se repite. Mismos
 *   objetos casi siempre, otro camino y otro terreno: **156 de 200 cambian**;
 *   en 152 el primer hecho distinto es `hero_moved` (87 el día 1), en 2
 *   `raider_spawned` (otro vestido), en 1 `turn_start` y en 1 `day_start`. 25
 *   con otro ganador, j0 117 → 118, **0 sin terminar**, duración 8 / 15 / 26 →
 *   **8 / 15 / 23**. Batallas 1 536 → 1 545, `hero_defeated` 329 → 350,
 *   `node_captured` 1 152 → 1 141, `town_captured` 1 361 → 1 357,
 *   `march_halted` 121 → 123.
 * - `18c99aee…` (58 268 líneas): **el acantilado, una línea de una casilla**
 *   (#215, 08-10-2026): la meseta se come la franja de acantilado hasta la
 *   fila que toca lo bajo, el que se queda sin caída se abre a su región o pasa
 *   a montaña, y el nivel que mira el generador pisa los nodos como la escena.
 *   Cambia el mapa, no las reglas: **188 de 200 cambian** (12 iguales,
 *   ninguna con acantilado); en 183 el primer hecho distinto es
 *   `raider_spawned` del día 1 (otro vestido u otras casillas de la región),
 *   en 4 `battle_ended` y en 1 `hero_moved`; 187 cambian el día 1 y 1 el 3.
 *   83 con otro ganador, j0 118 → 107, **0 sin terminar**, duración 8 / 15 /
 *   23 → **7 / 14 / 22**. Batallas 1 545 → 1 517, `hero_defeated` 350 → 310,
 *   `node_captured` 1 141 → 1 161, `town_captured` 1 357 → 1 365,
 *   `march_halted` 123 → 118; ningún tipo nuevo ni ninguno que desaparezca.
 * - `a0b5d9be…` (59 700 líneas): **la puerta de una ciudad no muerde la línea
 *   del acantilado** (#222, 09-10-2026): la muesca de una casilla de la
 *   puerta en una franja de dos de hondo se abre a lo bajo y la línea sube a la
 *   fila de la ciudad (`puertasSinMuesca`), y el vestido al que le queda una
 *   espiga tras sus vueltas no vale (s49). Cambia el mapa donde la había, y con
 *   él el azar que sigue: **25 de 200 cambian**; en 12 el primer hecho
 *   distinto es `raider_spawned` del día 1 (otro vestido), en 6 `hero_moved`,
 *   en 5 `battle_ended`, en 1 `garrison_taken` y en 1 `turn_start`. 15 con
 *   otro ganador, j0 107 → 108, **0 sin terminar**, duración 7 / 14 / 22 →
 *   **8 / 15 / 20**. Batallas 1 517 → 1 546, `hero_defeated` 310 → 344,
 *   `node_captured` 1 161 → 1 194, `town_captured` 1 365 → 1 376,
 *   `march_halted` 118 → 121; ningún tipo nuevo ni ninguno que desaparezca.
 * - `9fc436ed…` (58 585 líneas): **ninguna senda por una silla del relieve, y
 *   la bajada de frente** (#224, 09-10-2026): la búsqueda cobra el paso en
 *   diagonal con las dos esquinas más altas y la bajada a un nodo en diagonal o
 *   por la esquina de la meseta (`pasoTorcido`, `cobroDelTorcido`), lo que
 *   queda abre esa esquina a su región (`abrirEsquinasTorcidas`) y, si no hay
 *   esquina que abrir, el vestido se repite. Cambia el mapa, no las reglas:
 *   **144 de 200 cambian**; en 70 el primer hecho distinto es `raider_spawned`
 *   del día 1 (otro vestido: 76 de 200 mapas son otros) y en 74 `hero_moved`
 *   (mismo mapa con esquinas abiertas u otras sendas). 37 con otro ganador, j0
 *   108 → 113, **0 sin terminar**, duración 8 / 15 / 20 → **8 / 13 / 19**.
 *   Batallas 1 546 → 1 524, `hero_defeated` 344 → 337, `node_captured` 1 194 →
 *   1 164, `town_captured` 1 376 → 1 337, `march_halted` 121 → 124; ningún tipo
 *   nuevo ni ninguno que desaparezca. Generar un 34×34 pasa de ~36 a ~55 ms
 *   (1-10, con la máquina cargada): los vestidos que se repiten.
 * - `62bd822c…` (70 732 líneas): **el mapa ×1,5 y la marcha ×1,22** (#226,
 *   09-10-2026): `AREA_POR_REGION` 300 → 450 (`core/escala.ts`; el mapa por
 *   defecto, 34×34 → 42×42) y `maxMovePoints` a la escala (`marchaALaEscala`).
 *   Comprobado que es lo ÚNICO que cambia: con 300 sale `9fc436ed…` exacto (la
 *   marcha a escala con 300/300 es la tabla de fheroes2). Cambia el mapa de
 *   todas: **0 de 200 idénticas**, y en las 200 el primer hecho distinto es el
 *   `raider_spawned` del día 1 (otro mapa). 95 con otro ganador, j0 113 → 130,
 *   **0 sin terminar**, duración 8 / 13 / 19 → **8 / 14 / 31** (sin escalar la
 *   marcha, 10 / 17 / 30). `hero_moved` 31 247 → 41 605, batallas 1 524 →
 *   1 576, `hero_defeated` 337 → 406, `node_captured` 1 164 → 1 301,
 *   `town_captured` 1 337 → 1 362, `march_halted` 124 → 179, `raider_spawned`
 *   1 619 → 1 622; ningún tipo nuevo ni ninguno que desaparezca.
 * - `f10c0711…` (70 847 líneas): **la vista a la escala del mapa** (#229,
 *   09-10-2026): el radio de fheroes2 del héroe y del castillo, 4 y 5, pasa por
 *   `radioALaEscala` (5 y 6 en el 42×42). Cambia lo que se ve, no el mapa:
 *   **0 de 200 idénticas**, todas desde el día 1; el primer hecho distinto es
 *   `hero_moved` en 131 (otro sello `seen`, o la marcha que ahora se para:
 *   54 pasan a `march_halted`), `raider_spawned` en 63 (el castillo ve el grupo
 *   que nace, otro `seen`), `march_halted` en 4 y `battle_started` en 2. Solo 8
 *   con otro ganador, j0 130 → 130, **0 sin terminar**, duración 8 / 14 / 31
 *   igual. `march_halted` 179 → 141 (con más vista, más grupos se ven ya al salir y la ruta los avisa),
 *   batallas 1 576 → 1 572, `hero_defeated` 406 → 412, `node_captured` 1 301 →
 *   1 295, `town_captured` 1 362 → 1 359; ningún tipo nuevo ni ninguno que
 *   desaparezca.
 * - `880417bb…` (70 915 líneas): **las fronteras onduladas** (#229, 09-10-2026):
 *   el reparto de regiones mide cada casilla desde un punto movido por un
 *   ruido fino y antisimétrico en el espejo (`ondulacion`, `sinPuas`), con su
 *   propia corriente; y cuatro arreglos del generador que la ondulación
 *   destapó: la Y junto a un nodo objetivo aún sin trazar se cobra, las
 *   barreras garantizadas se recuentan al final del vestido, la puerta de un
 *   objeto puesto sin ella libre también se guarda y un puente sin dos orillas
 *   enfrentadas no vale. Cambia el mapa de todas: **0 de 200 idénticas**, y en
 *   las 200 el primer hecho distinto es el `raider_spawned` del día 1 (otro
 *   mapa). 70 con otro ganador, j0 130 → 126, **0 sin terminar**, duración 8 /
 *   14 / 31 → **8 / 15 / 29**. `hero_moved` 41 649 → 42 671, batallas 1 572 →
 *   1 487, `hero_defeated` 412 → 343, `node_captured` 1 295 → 1 309,
 *   `town_captured` 1 359 → 1 267, `march_halted` 141 → 137, `raider_spawned`
 *   1 622 → 1 613; ningún tipo nuevo ni ninguno que desaparezca.
 */
const ANCLA = {
  semillas: SEMILLAS_DEL_BANCO,
  dias: DIAS_POR_DEFECTO,
  sha: '880417bb55e7cd02b096ac4898a00e84e25170fc7a40e11593b5a64a7d37bb3e',
} as const;

const SEMILLAS = Number(sueltos[0] ?? ANCLA.semillas);
const DIAS = Number(sueltos[1] ?? ANCLA.dias);

const lineas: string[] = [];
const sinTerminar: number[] = [];
const dias: number[] = [];

const t0 = performance.now();
for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
  const { state, fin } = await partidaDeSemilla(semilla, DIAS);

  // «Sin terminar» es `winner === null` y no `finished === null`: una partida
  // agotada vuelve **terminada** y sin ganador. Con el criterio de antes esta
  // cuenta daría 0 siempre y por construcción — un informe que imprime su línea
  // sin medir nada.
  const ganador = fin.winner === null ? 'ninguno' : String(fin.winner);
  if (fin.winner === null) sinTerminar.push(semilla);
  dias.push(state.day);
  lineas.push(`${semilla} fin ganador=${ganador} dia=${state.day} hechos=${state.log.length}`);
  for (const [i, e] of state.log.entries()) lineas.push(`${semilla} ${i} ${JSON.stringify(e)}`);
}
const msPartidas = performance.now() - t0;

const volcado = `${lineas.join('\n')}\n`;
const sha = createHash('sha256').update(volcado).digest('hex');
if (fichero !== null) writeFileSync(fichero, volcado);

console.log(`partidas:      ${SEMILLAS} semillas × ${DIAS} días → ${msPartidas.toFixed(0)} ms`);
console.log(`sha256:        ${sha}`);
console.log(`líneas:        ${lineas.length}`);
console.log(`sin terminar:  ${resumenSinTerminar(sinTerminar, SEMILLAS)}`);
console.log(`duración:      ${duracion(dias)} días (mediana / p90 / máximo)`);
if (fichero !== null) console.log(`volcado:       ${fichero}`);

if (SEMILLAS === ANCLA.semillas && DIAS === ANCLA.dias) {
  if (sha === ANCLA.sha) {
    console.log('ancla:         igual — las 200 partidas se juegan hexágono a hexágono igual');
  } else {
    // Se sigue midiendo hasta el final a propósito: el tiempo de `autoResolve`
    // interesa igual, y con `exitCode` el rojo llega de todas formas.
    process.exitCode = 1;
    console.error('');
    console.error(`ANCLA ROTA: se esperaba ${ANCLA.sha}`);
    console.error(`            y ha salido ${sha}`);
    console.error('            Alguna partida se juega distinta. Para ver cuál y dónde:');
    console.error('              git stash && pnpm banco --dump antes.jsonl && git stash pop');
    console.error('              pnpm banco --dump ahora.jsonl && diff antes.jsonl ahora.jsonl');
    console.error('            El volcado es una línea por hecho: el diff señala la semilla');
    console.error('            y el hecho exactos. Si el cambio es deliberado, se ancla el');
    console.error('            nuevo valor arriba y se dice cuál era el viejo y por qué.');
  }
}

/**
 * Segunda medida, la de #48: 300 batallas de la IA contra sí misma.
 *
 * Va aparte porque `legalActions` no se nota en el reloj del barrido —el mapa
 * se lo come— y es justo lo que abarata izar el BFS fuera del bucle de
 * enemigos. Semillas fijas, así que la cifra es comparable entre pasadas.
 *
 * **Se mide en `TANDAS` tandas y se imprime mínimo, mediana y máximo** (#99):
 * sobre código idéntico, seis pasadas de una sola tanda dieron de 57 a 89 ms,
 * dos modos y no ruido alrededor de una media, y con la punta buena se publicó
 * un «−50 %» que en mediana era −39 %. Un número solo aparenta una precisión
 * que no tiene; la dispersión dice cuánto se puede creer. Cinco tandas cuestan
 * ~0,8 s más, un 10 % del banco (7,8 → 8,7 s, 08-10-2026), porque van con el
 * núcleo caliente de las 200 partidas. Las rondas tienen que salir iguales en
 * todas: si no, la medida no es de lo mismo y se dice.
 */
const BATALLAS = 300;
const TANDAS = 5;
const tiempos: number[] = [];
let rondas = -1;
for (let tanda = 0; tanda < TANDAS; tanda++) {
  const t1 = performance.now();
  let estas = 0;
  for (let i = 1; i <= BATALLAS; i++) estas += batallaDeSemilla(i).rounds;
  tiempos.push(performance.now() - t1);
  if (rondas !== -1 && estas !== rondas) {
    throw new Error(
      `autoResolve no es determinista: la tanda ${tanda + 1} jugó ${estas} rondas y la anterior ${rondas}, con las mismas semillas`,
    );
  }
  rondas = estas;
}
const ms = (x: number): string => x.toFixed(0);
console.log(
  `autoResolve:   ${BATALLAS} batallas (${rondas} rondas) → ${ms(Math.min(...tiempos))} / ${ms(mediana(tiempos))} / ${ms(Math.max(...tiempos))} ms (mínimo / mediana / máximo de ${TANDAS} tandas: ${tiempos.map(ms).join(', ')})`,
);
