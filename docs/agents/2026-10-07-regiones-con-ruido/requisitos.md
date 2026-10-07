# Requisitos — R3: regiones con borde orgánico en el generador (#169)

## Petición
- Mandato del usuario (07-10-2026): «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».
- Pregunta del usuario sobre si reinventamos la rueda. La comparación está en `comparacion.md`, en esta carpeta; esta tarea es su **R3**. Después irán **R4**, el relieve por esquinas con arte de diagonales y esquinas interiores, y **R5**, la bajada como pieza: el usuario los ha aprobado tras R1 y R3.
- Encargos del usuario que siguen en pie: «evitar bordes rectos, que tenga un poco de giros».

## Contexto
- **#169:** filas de 10-16 frontales iguales en una sola línea y fronteras rectas.
  - s24: (18-34, 6-7) y (0-16, 24-26).
  - s2: (17-34, 19-21).
  - s13: x 21-22.
- **La causa probable:** el Voronoi euclídeo de `generate.ts` (~l.907) y el ruido en bloques de 4×4 de `vestir.ts` (~l.186) dan lados rectos.
  - VCMI da forma a sus zonas con Penrose y fractalización.
  - fheroes2 hace crecer las regiones compitiendo por el espacio.
- **Acaba de entrar #161:** `ejeDelNodo` y `delanteDeNodo` en `vestir.ts`. No se rompe: cada nodo con su eje en cruz y 0 objetos delante. Su guardia está en `test/regiones.test.ts`.
- **Cambia los mapas y el banco.** Se re-ancla y se juzga la forma del diff.
  - `barrido-semillas` a 0 sin terminar.
  - La regla de `LADO_DEL_MAPA`, mediana ≥ 8 días, p90 ≤ 20 y 0 sin terminar, medida con ≥ 200 semillas. Con 10 semillas es ruido: lo demostró #161.
- **Los tests atados a semillas** se rompen al cambiar el mapa. Que busquen su caso cuando se pueda (`capturas` ya busca sus semillas) en vez de cambiar un número por otro.
- **En paralelo:** R1 (`suelo-con-ruido`) toca el pintor del suelo del cliente.

## Criterios de aceptación
1. **Bordes de barrera sin tramos rectos largos.** Se mide el tramo recto más largo de frontera de barrera (casillas seguidas en la misma fila o columna) en 1-40, antes y después; la meta es que no pase de 4-5. Capturas de los casos de #169.
2. **La red sigue valiendo:** `validateMapPlan` y el perfil, nodos con eje (#161), ciudades de grado ≥ 3, equilibrio y densidad (`test/regiones.test.ts`).
3. **Banco re-anclado**, con la forma del diff explicada; `barrido-semillas` a 0; la regla del lado, con ≥ 200 semillas; `pnpm qa` en verde.
4. **Mapas que no salen:** no más que hoy en 24×24, 34×34 y 48×48.
5. `pnpm capturas`, una vez al cerrar, saliendo 0.
