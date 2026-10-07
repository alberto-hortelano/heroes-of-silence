# Requisitos — #155, ¿sobra la penalización pegada de trazarCaminos?

## Petición
Viene del backlog: issue #155, abierta en el /simplify de #153. El usuario la eligió para trabajarla en paralelo el 07-10-2026 («#155 penalización pegada»).

Texto de la issue: «`trazarCaminos` cobra `pegada` por arrimarse a la red para que el pintor no cosiera dos radios vecinos en rombos. Con #153 eso ya no puede pasar. Hoy se justifica con otro motivo: "se leen como una calzada ancha". Coste de quitarla: cambia las casillas de camino y, por tanto, el banco. Qué hacer: medir con 10 semillas y mirar capturas a 110 px antes de decidir.»

## Contexto
- #153 (857a849): el mapa guarda tramos (`RedDeCaminos`), con las horquillas en L hechas por `ArbolDeCaminos` en `vestir.ts`.
- **Banco:** si cambia, no se re-ancla a ciegas. Se juzga la forma del diff (qué semillas cambian y cuál es el primer hecho distinto) y **se consulta al usuario antes de re-anclar**.
- Medidas con 10 semillas (memoria del usuario).
- En paralelo, en otros worktrees, van #157 (puentes, en `render/escenario/`), los restos del agente y #130. Esta tarea vive en `/home/al/code/heroes-nucleo` (rama `penalizacion-pegada`).

## Criterios de aceptación
1. **Decisión con evidencia.** En 10 semillas, con `pegada` y sin ella, se miden:
   - las casillas de camino;
   - los tramos paralelos a distancia 1 (calzadas anchas);
   - la longitud de los caminos;
   - las horquillas.
   Y se hacen capturas a 110 px (`pnpm taller escenario`).
2. **Si se quita:**
   - el código se simplifica de verdad;
   - los tests y guardias de caminos siguen verdes (ciclos, horquillas en Y = 0);
   - el banco cambia y se presenta la forma del diff al usuario antes de re-anclar.
3. **Si se queda:** el comentario dice el motivo actual con su medida y la issue se cierra con la evidencia.
4. `pnpm verify` y `pnpm qa` en verde, y el barrido de semillas sin partidas sin terminar.

## Fuera de alcance
- El pintor de sendas y el escenógrafo.
- Cambiar la topología de la red (`crucesConCamino`).
