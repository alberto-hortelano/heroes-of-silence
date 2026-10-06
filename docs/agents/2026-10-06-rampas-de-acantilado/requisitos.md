# Requisitos — Rampas de acantilado como hecho del relieve (#150)

## Petición literal

Usuario, 06-10-2026, tras cerrar #153: «Ok, sigue». El coordinador eligió #150, porque la crítica de #153 aconsejaba hacerla después para que las rampas lean los tramos.

Issue #150:

> - **Hoy:** `colocar.ts` deduce si un camino baja por una cara con dos puntos de prueba, el pie y el filo, y contra el pasillo de las masas. Donde se quita la pared queda un rectángulo liso de cara de roca, y la cara se pinta encima de la senda.
> - **Propuesta:** que `relieve` derive las rampas, es decir, los intervalos de cada cara cruzados por un tramo de camino entre niveles. Así la pared en `colocar` y la cara en `pintar` leerían el mismo hecho.

## Contexto

- Viene del /simplify de 5cdd636 (caminos despejados: `pasillo.ts`, `APARTE`, arcén) y de su QA (H3). Busca en `docs/agents/2026-10-05-caminos-despejados/` (hallazgos-simplify.md, hallazgos-qa.md y qa.md).
- Desde 857a849 (#153), el mapa guarda los tramos (`GameMap.caminos`, `RedDeCaminos`), y el pintor los lee de `map.caminos.tramos`. Las rampas deben leer esos tramos, no deducirlos.
- Petición original del usuario sobre caminos (05-10): «Los caminos se ocultan muy a menudo, hay que darles algo de espacio despejado alrededor». Aquí lo que se ve mal es que la cara de roca tapa la senda donde baja, y que queda un rectángulo liso donde se quitó la pared.

## Criterios de aceptación

1. Un único hecho, «dónde baja un camino por una cara», derivado en un solo sitio a partir de los tramos y del relieve. Lo leen tanto la pared (`colocar.ts`) como la cara (`pintar.ts`).
2. Donde un camino baja por una cara, la senda se ve de punta a punta: la cara de roca no se pinta encima, y no queda un rectángulo liso que parezca un hueco recortado.
3. Desaparecen los dos puntos de prueba ad hoc (pie y filo) de `colocar.ts`.
4. `informe.spritesSobreSenda` sigue en 0, y no entran errores en el informe del escenógrafo.
5. El núcleo y el banco no cambian, salvo que el diseño lo justifique y se juzgue la forma del diff.
6. `pnpm verify` en verde. Capturas a 110 px de antes y después de rampas reales, en 3 semillas. `pnpm capturas` solo en QA.

## Fuera de alcance

- Arte nuevo de rampas: si hiciera falta, va a `docs/art/peticiones.md`.
- #151 (fusionar `Reservas` y `Pasillo`), salvo que el plan lo necesite.
- #155 (penalización `pegada`).

## Restricciones de proceso

- Medidas con **10 semillas**. `pnpm capturas` solo en QA, al cerrar.
- El navegador, **solo con Playwright sin pantalla**; nunca las herramientas claude-in-chrome.
- Máquina compartida: nada de `pkill`/`killall`. El 3100 (vite del usuario) y el 3636 (otro proyecto) no se tocan; se usan puertos propios.
- No tocar `assets/art/no-muertos/`. No commitear.

## Preguntas abiertas (con suposición por defecto)

- ¿Cómo se pinta la rampa sin arte nuevo (cara cortada, cuña de tierra, senda encima de la cara)? Por defecto, lo decide el arquitecto con capturas. Si el resultado cambia mucho, se enseña al usuario.

## Precisiones tras la crítica (VIGENTE, 06-10-2026)

- **Medida, semillas 1-10.** 55 tramos de camino bajan por una cara (de 3 a 8 por mapa, en 48 caras); 47 de ellos en diagonal. En 69 de los 101 cruces de senda y filo queda un rectángulo liso de cara sin pared. En los otros 32, la pared sigue encima de la senda y no la ve ningún guardia, porque `APARTE.pared` es `null`.
- **Criterio 4, ampliado:** el informe cuenta también las paredes que pisan una rampa, y esa cifra debe ser 0.
- **Criterio 7, nuevo:** los descensos en diagonal cuentan. Las capturas de antes y después incluyen al menos uno.
- #150 no empieza la fusión de #151.

## Punto de control del plan (06-10-2026)

- **Tajo, sin pelar las escaleras.** El usuario aprueba el tajo de `plan.md` con una condición: en los acantilados en escalera, con caras de una casilla, el corte no puede llevarse un peldaño entero ni dejar el risco pelado. Ejemplos: `capturas/s5-x15-y4-*` y `capturas/s6-x31-y10-*`. Se ajusta `HOLGURA_DE_RAMPA` o se limita el corte en caras cortas: el tajo no pasa mucho del ancho de la senda más su arcén, y los bordes conservan pared.
- Las capturas de antes y después de esas dos escenas se rehacen y se comparan. Para comparar, la cubierta y las nubes que cambian por el azar no cuentan como regresión.
- Lo demás del plan, aprobado tal cual.
