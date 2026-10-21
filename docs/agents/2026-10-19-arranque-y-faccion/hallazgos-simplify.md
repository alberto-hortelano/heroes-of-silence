# Hallazgos de /simplify (consolidados, con la decisión tomada)

Cuatro revisores (reutilización, simplificación, eficiencia, altura) sobre `git diff main...HEAD`
(5f5fb9d7, 21189b8a, 3a2c9495). Las líneas son orientativas: búscalas por nombre.

## Se aplica

1. **Jugadores y base de un plan, en un sitio** (los cuatro revisores). «Los jugadores son los dueños
   de ciudad» está en `generate.ts` (`dueños`, ~475), `mapa-del-agente.ts` (`trae`, ~120) y
   `setup.ts` (`factionOf` + `jugadores`, ~187-200), y `newGame` busca la base dos veces
   (`factionOf` y luego `primeraCiudadDe(...) as PlannedTown`). → Una función en `core`
   (`basesDelPlan(plan)`: la primera ciudad de cada dueño, ordenada por jugador; o `jugadoresDelPlan`
   si basta) junto a `validateMapPlan`, que leen los tres. En `newGame`, un solo `Map` de bases y de
   ahí `faction` y `at`, sin los `as`.
2. **La región de casa se deriva** (altura 2). `problemasDeAsaltantes` perdió su guardia: hoy un plan
   del agente puede poner asaltantes en la región donde el héroe pisa el mapa por primera vez, y el
   procedimental se salta las casas por convención de índices (`k = 2`, ~2257) y `test/helpers.ts`
   escribe `const casa = player`. → `regionDeCasa(map|plan, base)` en `core` (la región de la puerta
   de la base, `puertasDe('town', base.at)`); la leen `problemasDeAsaltantes` (rechazo con motivo para
   el agente), el procedimental y `auditarMapaDenso`. Prosa del contrato de `map_generate` al día.
3. **`SinCentroDeRegion`: causa, no reintento a ciegas** (altura 3, simplificación 3). Diagnostica qué
   deja a la región del 64×64 s8 sin casilla que alcance sus objetivos. Si es un paso de colocación
   que rompe la alcanzabilidad, vétalo ahí y quita la clase. Si de verdad es «vestido que no vale»,
   trata igual los dos fallos hermanos de la búsqueda (también el de `vestir.ts` ~3456) devolviendo
   un resultado de fallo, sin excepción tipada ni el doble `instanceof`; mide con el contador
   `fallos` cuántas veces salta en 1-200. Dilo en `implementacion-2.md`.
4. **La IA recluta y licencia lo mismo** (altura 1). `src/core/ai/strategy.ts` (~467) recorre
   `[...dwellings(town)].reverse()` suponiendo que la morada es un nivel, y no lo es. → recorrer los
   candidatos por `unitPower` (o el oro) de mayor a menor. **Commit aparte**, con `barrido-semillas`
   (0 sin terminar), banco re-anclado y la forma del diff. Y **explica** por qué las batallas contra
   monstruos y asaltantes del banco pasaron de 46 y 12 a 0 con el héroe en la base (¿la IA ya no sale
   a por ellos?, ¿se cuentan mal?); si es un fallo de la IA introducido por esta tarea, arréglalo; si
   no, dilo con la evidencia.
5. **`esFaccion` una vez** (reutilización 3, simplificación 4). Exporta `esFaccion(x): x is FactionId`
   en `core/types.ts` junto a `parseFaccion` (que lo use). Fuera `esFaccion` de `inicio.ts`, `esTema`,
   `TEMAS` y el alias `Tema` (en `temas.ts`, `tools/taller/temas/piezas.ts`,
   `tools/qa/temas-con-piezas.ts` y el test que comprueba el alias): `FactionId`/`FACTION_IDS` tal cual.
6. **`faccionDelJugador` en `NewGameOptions`** (reutilización 7). La sesión pasa solo la elegida y
   `newGame` llama a `faccionesDeLaSemilla(seed, faccionDelJugador)`.
7. **Escribir la URL, un ayudante** (reutilización 4, simplificación 7). `aLaBarra(cambiar)` de
   `arena/main.ts` sube a un módulo compartido del cliente (p. ej. `semilla.ts`) y lo usan
   `inicio.ts`, `main.ts` (`abrePartida`) y la arena.
8. **El arranque de `main.ts`** (simplificación 5): los fallos de la URL en una lista y la salida
   compuesta con lo pedido, sin el ternario de cuatro hojas ni el tipo unión `{valor}|Fallo`.
9. **`inicio.ts`** (simplificación 6-7, eficiencia 7): un `AbortController` en vez de siete altas y
   bajas; `jugar` no repinta el menú escondido; fuera el `delete('faccion')` inútil.
10. **El tema al pasar por la lista, sin heurística** (altura 4). Que la geometría de
    `.opcion-de-faccion` no dependa del tema (cajas de medida fija o letra neutra en la lista) para
    que `pointerover`/`pointerout` normales basten, y fuera la de `pointermove` con movimiento.
    Compruébalo en Playwright: ratón quieto sobre una opción no cambia el tema, salir de la lista lo
    devuelve a la marcada.
11. **`temaDelLienzo` desde la tabla** (simplificación 8, reutilización 10): `Object.fromEntries` sobre
    las claves de `FICHAS_DEL_LIENZO`. Y `cargarLetraDeTitulo` sin forzar el estilo en el mismo paso
    que escribe `data-tema` (eficiencia 4): que la lea de lo ya leído o en un `requestAnimationFrame`.
12. **Calentar el suelo del mapa mientras se está en la base** (eficiencia 1). Hoy el Worker del suelo
    no arranca hasta salir de la base y al salir se ve vacío/esbozo 2-12 s. → al abrir la partida (o
    en `requestIdleCallback` tras el primer fotograma de la base), `escenarioListo` y `sueloDelMapa`.
    Verifica que salir de la base tras unos segundos ya enseña el suelo.
13. **`entrada.ts` no espera al menú si la URL ya pide partida** (eficiencia 2): la comprobación de
    `hayQuePreguntar` vive en `entrada.ts` (o en un módulo sin dependencias) y con `?seed=`/`?faccion=`
    se importa `main.js` directo. Mantén el contrato de `arranque.ts` (si `main` lanza, se dice).
14. **`tools/datos/facciones.ts` copia el lector de `tipos-de-heroe.ts`** (reutilización 5): un
    `seccionDelCuaderno(texto, titulo)` compartido en `tools/datos/`, que usen los dos.
15. **Capturas** (reutilización 9, simplificación 11, eficiencia 6): `baseOf` en vez de
    `myTowns()[0]` (también en los sitios anteriores que cita el revisor), una sola lectura de
    `estadoDelArranque`, `salirDeLaBase` con el gesto como parámetro (fuera la copia con Escape), el
    `sleep(1500)` cambiado por esperar a un estado, y un `context` compartido para las páginas de la
    pasada.
16. **Comentarios que cuentan lo retirado** (simplificación 12): fuera de `generate.ts`, `setup.ts`,
    `mapa-del-agente.ts` y `helpers.ts`; si algo merece quedar, a `docs/historia.md`. Y
    `SIN_PARTIDAS` sin `export` si nadie lo importa.

## Se descarta a conciencia

- **`ayudaAlSalir` en `Session` y que la sesión nazca en el mapa** (simplificación 9, altura 6): un
  campo de un uso; mover «empezar en la base» al constructor rompe ~90 `new Session` de tests y
  capturas por poco a cambio.
- **Letras TTF → woff2** (eficiencia 5): la rama lo decidió («un codificador propio no compensaba»).
- **Precargar `main.js` mientras se elige / sacar `HERO_NAMES` a un módulo ligero** (eficiencia 3):
  obliga a que `main.ts` deje de arrancar al importarse; el menú es una pantalla de una vez. Si tras
  el punto 13 el menú tarda en pintarse de forma visible, se retoma.
- **Los `@import` de temas en arena y espectador** (eficiencia 7): coste de análisis pequeño.
- **`noPide` común con `parseSeed`/`parseFaccion`** y **`semillaDeLosParametros`** (reutilización 8 y
  10): una línea cada uno; se reconsidera si la regla de «vacío» cambia.
- **Tabla por facción común (`porFaccion`)** (reutilización 6): tres validadores con mensajes
  distintos; con el punto 14 el extractor ya no se duplica.
- **`chromiumInstalado` de `tools/taller/escenario/escenario.ts`**: fuera del diff.
