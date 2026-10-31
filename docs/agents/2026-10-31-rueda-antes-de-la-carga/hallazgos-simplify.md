# Hallazgos de /simplify (31-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre `git diff HEAD`.
Deduplicados y con la decisión tomada; los aplica el coordinador.

## Se aplican

1. **La causa de fondo: la firma del turno no ve el golpe plantado** (altitud 1, reutilización 1,
   simplificación 1-2 y 10, eficiencia 1 y 4). Plantarse con carga no anda ni gasta, así que la
   firma del turno queda igual antes y después de plantarse, y eso se tapaba con tres parches: la
   marca a mano en `claveDeBatalla`, `veniaPlantado` (un `movableFrom` aparte al golpear) y el
   parámetro `llegada` de `golpeBlocker`.
   - `firmaDelTurno(turno, golpeEnCurso)` lleva el objetivo del golpe plantado. La leen
     `applyAction` (rechaza un `Movibles` de antes de plantarse), la IA y la clave de la sesión, que
     vuelve a su forma.
   - Con un golpe plantado, `applyAction` no usa el recorrido que trae quien juega (la lista legal
     de la fase `plantado` no da casillas: viene vacío por diseño) y calcula el suyo una vez.
     **Una sola política para la carrera**: se valida al golpear, contra ese recorrido.
   - `golpePreparado` resuelve una vez desde dónde se golpea (la llegada de la carga plantada o el
     `from`) y se lo pasa a `golpeBlocker`, que pierde `llegada` y vuelve a su forma.
   - Desaparecen `veniaPlantado` y `costesAhora`.
2. **`casillasDeCarga`: la ficha de la carga escrita dos veces, un cast y la fase preguntada dos
   veces** (reutilización 2, simplificación 8, altitud 4, eficiencia 2). Se crea un ayudante,
   `casillaDeCarga(target, at, recta)`, para la rama plantada y el bucle. La rama plantada mira
   `state.golpeEnCurso` sin cast.
3. **`chargeFrom(…, new Map())` como señal** (simplificación 9, altitud 5, eficiencia 5): `costes`
   pasa a ser opcional en `chargeFrom`, como ya lo es en `casillasDeCarga`.
4. **`moveTo(…, carga?: { carrera })`** (simplificación 5, altitud 6): el envoltorio ya no aporta
   nada; pasa a ser `carrera?: Paso`.
5. **`export type { CargaMedida }` desde `battle.ts`** (simplificación 7, altitud 6): nadie lo
   importa por ahí. Se borra.
6. **Comentarios que cuentan la regla retirada** (simplificación 11): se podan en `rueda/rueda.ts`,
   `session.ts` (`cancelar`), `capturas.ts`, `ai/rueda.ts` y `CLAUDE.md`. En `CLAUDE.md`, la frase
   del agente «quien pega anda y se planta» pasa a casar con la excepción de la carga.

## Se descartan a conciencia

- **Guardar en `GolpeEnCurso` solo la llegada y volver a medir la carga al golpear**
  (simplificación 3): la medida se guarda a propósito. Lo que se cobra es lo que se anunció al
  abrir la rueda, aunque un retoque de la arena a media rueda cambie algo. Se dice en el
  comentario de `GolpeEnCurso`.
- **Separar `GolpeEnCurso` en `porAndar` y `carga`, o que `golpePreparado` devuelva
  `{ antes, despues, recta }`** (altitud 3): es un rediseño pensado para una regla que nadie ha
  pedido (elegir antes de andar también sin carga). Con dos ramas cortas y comentadas,
  `applyAction` se lee bien. Si el usuario pide esa simetría, se hace entonces.
- **Mover `golpeEnCurso` dentro de `TurnoDeUnidad`** (altitud 1, variante): meterlo en la firma
  arregla lo mismo sin tocar los diez sitios que lo leen ni lo que viaja.
- **`golpePreparado` devuelve `carga` y `medida`** (simplificación 4): `carga` se deriva de
  `medida`, pero la leen tres sitios que solo quieren el número. Coste bajo; no compensa.
- **Meter `pasoHasta` dentro de `moveTo`** (simplificación 6): como función con nombre se lee mejor
  y no estorba.
- **Tests de sesión repetidos (partida y arena)** (simplificación 12): las dos sesiones pasan por
  `CruceDeLaRueda`, pero el criterio 8 pide las dos, y la caché de cada una es suya. Se quedan los
  dos. `carga.test.ts` y `rueda.test.ts` miran Escape con unidades distintas (a pie y a caballo);
  se quedan.
- **Borrar el test reescrito de `salir-del-contacto.test.ts`** (simplificación 12): al leerlo, su
  segunda mitad es la única que corre la carrera que paga el contacto en dos jugadas (plantarse y
  luego golpear), que tras el punto 1 va por el recorrido que calcula `applyAction`. La anterior del
  mismo `describe` lo hace de una vez. Se queda.
- **`pegado(o)` en `espectador.test.ts`** (simplificación 12): es cosmético.
