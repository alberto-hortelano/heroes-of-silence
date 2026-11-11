# Requisitos — recinto-del-muro

Tarea: `2026-11-11-recinto-del-muro`. Issues: 335. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `150fd189`, tras fusionar #333).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

> «Cuando mergees la PR empieza con los nuevos issues tambien en paralelo»

El coordinador eligió esta tarea (tanda 3). Lo que pide cada issue, tal cual:

### #335 — Generador: el 3 × 3 de las ciudades del muro, escrito a mano en `vestir-la-red.ts`

> `vestir-la-red.ts` (hacia las líneas 358-359) marca a mano el 3 × 3 de las ciudades del muro: otra copia del recinto, que en #305 pasa a vivir en `map/recinto.ts` (`parteDeLaEntrada`, `HASTA_LOS_ACCESOS`). Qué hacer: que también esa marca lea la puerta única. Visto por el arquitecto de `docs/agents/2026-11-11-pueblo-en-la-puerta/`.
> 
> Sale del cierre de issues del 11-11-2026 (PR alberto-hortelano/heroes-of-silence#333).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`): tres copias a mano del recinto en el generador, no una. El coordinador acepta su alcance, que sustituye a los criterios de arriba. Sin arquitecto (decisión del coordinador): es una reescritura equivalente; el ingeniero la explica en `implementacion.md`.


Sustituir «Criterios de aceptación» por:

## Criterios de aceptación

1. Ninguna copia a mano del recinto en el generador: el 3 × 3 de las ciudades del muro (`vestir-la-red.ts:360-361`), el «fuera del recinto» del puente de la ciudad-puente (`vestir-la-red.ts:392`) y el 5 × 5 con su 3 × 3 de `ciudadesDeRegion` (`generar/poblar.ts:101-107`, el borde `p.x < 2 … > W - 3` incluido) leen la puerta de `map/recinto.ts` (`parteDeLaEntrada`, `HASTA_LOS_ACCESOS`, `cabeElRecinto` o `recintoDeLaCiudad`). Las ocho vecinas de una casilla (`rio.ts`, `caminos.ts`, `niveles.ts`, `map.ts`, `lineas.ts`) no son el recinto y no se tocan.
2. Es una reescritura equivalente: **`pnpm banco` da el mismo hash** sin re-anclar, una vez al cerrar. Si cambia, la reescritura está mal, no se re-ancla.
3. No hay regla nueva, así que no hace falta test nuevo: pasan `pnpm typecheck`, `pnpm lint` y los tests del generador que lean `vestir-la-red.ts` y `poblar.ts` (los de ciudades en su región y los de recintos), cada uno con su porqué. `npx tsx tools/qa/exportaciones.ts` si se exporta algo más de `recinto.ts`.
4. Nada se ve distinto: ni navegador ni `pnpm capturas` para esta tarea.
