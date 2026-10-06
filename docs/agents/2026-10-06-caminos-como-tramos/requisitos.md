# Requisitos — Los caminos como tramos (#153)

## Petición literal

Usuario, 06-10-2026: «Empieza con #153».

Issue #153, «Los caminos como tramos y no como casillas (roads)»:

> - **Hoy:** `map.roads` es un conjunto de casillas. El pintor y la auditoría deducen los tramos con `aristasDeCamino` (8-vecindad, y la diagonal solo si ninguna esquina es camino). Así, dos casillas vecinas de caminos distintos se unen solas y cierran ~1,2 bucles por mapa dentro de una región. Por eso `trazarCaminos` mantiene una fase de fallo `caminos`, que comprueba lo dibujado y viste otra vez el mapa: falla en 16 vestidos de 203 semillas del test denso.
> - **Propuesta:** guardar los tramos (aristas) del camino.
> - **Coste:** toca el contrato del agente (`mapPlanSchema.roads`, puntos) y `serializeKnownMap`.

## Contexto (de la conversación)

- Viene del ciclo `docs/agents/2026-10-06-menos-caminos/` (commit 12ba03b). Allí el usuario pidió «dentro de una región una estructura de caminos radial» y que no hubiera caminos uniendo todos los pasos de cada frontera. Este issue es el remate: que el dibujo sea exactamente la red radial trazada, sin bucles espurios por adyacencia.
- Cifras de entonces (semillas 1-10, 34×34): 5-9 bucles por mapa; ~1,2 por mapa son espurios, dentro de una región, cerrados por la adyacencia.
- Los caminos del agente se pintan «tal cual»: hoy son casillas.
- Coste del movimiento: `costeDeEntrada` mira si la casilla destino es camino (`map.roads.has`). Una casilla con camino abarata entrar en ella, venga de donde venga.

## Criterios de aceptación

1. En el procedimental, el camino pintado (y medido) es exactamente el conjunto de tramos que traza `trazarCaminos`. Dentro de una región no hay ciclos que la red radial no trace: 0 en las semillas 1-10, y en el test denso.
2. Desaparece la fase de fallo `caminos`, o deja de dispararse (0 de los vestidos del test denso), si su única razón era la adyacencia.
3. El agente puede seguir escribiendo caminos en su plan. Un plan que hoy es válido sigue siéndolo, o el cambio de contrato queda documentado en el texto que lee el agente (`agent.ts`, `COMO_SE_LEE_EL_MAPA`) y en los esquemas zod.
4. Lo que ve el agente (`serializeKnownMap`) y el espectador (`vista-espectador.ts`, `adaptar.ts`) es coherente con lo que se pinta, y pasa por la niebla igual que hoy.
5. El coste de movimiento no cambia si no hace falta. Si cambia, el diff del banco se juzga por su forma y se re-ancla.
6. `pnpm verify`, `pnpm qa`, `pnpm banco` (re-anclado solo si cambia a propósito) y `pnpm capturas` al cerrar.

## Fuera de alcance

- Cambiar la forma de la red (radial, un cruce con camino por pareja): está decidida.
- Arte nuevo de caminos, el pasillo y el arcén de `pasillo.ts`.
- El anillo grande de la semilla 7: el usuario lo dio por bueno.

## Restricciones de proceso

- Medidas con **10 semillas**. `pnpm capturas` solo en QA, al cerrar.
- El navegador, **solo con Playwright sin pantalla**; nunca las herramientas claude-in-chrome.
- Máquina compartida: nada de `pkill`/`killall`; un puerto ajeno se reporta, no se libera.
- No tocar `assets/art/no-muertos/` ni el PNG sin seguimiento del usuario. No commitear.

## Preguntas abiertas (con suposición por defecto)

- ¿Puntos o tramos en el contrato del agente? Por defecto: lo que cueste menos al agente sin perder exactitud. Por ejemplo, aceptar polilíneas o seguir aceptando puntos y derivar los tramos. Lo decide el arquitecto; si cambia el contrato, se consulta.

## Decisiones del usuario tras la crítica (06-10-2026)

- **Tramos solo por dentro** (alternativa B de `critica.md`). El procedimental guarda los tramos que traza y el cliente, el espectador y el taller pintan esos tramos. **El contrato del agente no cambia**: `mapPlanSchema.roads`, `serializeKnownMap` y `COMO_SE_LEE_EL_MAPA` siguen en casillas, y para el plan del agente los tramos se derivan como hoy (`aristasDeCamino`). `costeDeEntrada` no cambia. Las casillas de camino salen de los tramos; no se guardan aparte de forma que puedan discrepar.
- Con esto, el criterio 3 queda en «el contrato del agente no cambia».
- El criterio 4 queda en «el espectador y el taller pintan los mismos tramos que el cliente».
- **Horquillas** (~15 por mapa, pintadas hoy en L): el arquitecto decide si tramos exactos o mantener la L, con capturas antes y después a 110 px en `docs/agents/2026-10-06-caminos-como-tramos/capturas/`. Si el cambio se ve mucho, se enseña al usuario.

## Punto de control del plan (06-10-2026)

- **Horquillas: mantener las L.** El usuario vio las capturas y no quiere los tramos exactos. Le pesaron el cruce en X de la semilla 1 y los seis ramales de un mismo punto en la semilla 7. Se usa la alternativa que da el plan: en el núcleo (`vestir.ts`), cada diagonal trazada con camino en una de sus esquinas se cuelga de esa esquina, en codo de 90°, del lado que conserva el árbol. No se hace en el pintor. Las casillas de camino no cambian por esto; solo cambian los tramos.
- Debe seguir habiendo 0 bucles dentro de cada región, y no debe haber cruces en X ni estrellas de más de 4 ramales que no existan hoy. QA lo compara en capturas a 110 px con las de `capturas/` (lado izquierdo, «antes»).
- El resto del plan, aprobado tal cual. Eso incluye el re-anclaje del banco con exactamente esas 7 semillas cambiadas.
