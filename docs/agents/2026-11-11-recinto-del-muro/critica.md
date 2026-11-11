**REENCUADRADA** — el problema es real y la solución del issue es la buena, pero el alcance se queda corto: en el generador quedan **tres** copias a mano del recinto, no una.

## El problema real

La regla «el 3 × 3 es el recinto y el anillo de fuera son sus accesos» tiene una puerta (`parteDeLaEntrada`, `HASTA_LOS_ACCESOS`, `cabeElRecinto` en `src/core/map/recinto.ts:69-110`), pero el generador sigue escribiéndola con números sueltos (`-1..1`, `<= 1`, `-2..2`). Hoy dan lo mismo; si cambia `LADO_DEL_RECINTO`, el generador y la puerta de los planes se separan sin que nada lo cante. Es deuda pura: quien juega no ve nada.

## La premisa, afirmación por afirmación

- «`vestir-la-red.ts` hacia las líneas 358-359 marca a mano el 3 × 3 de las ciudades del muro»: **cierto, se ha movido a 360-361** (`src/core/map/generar/vestir-la-red.ts:360-361`, `for dy/dx ∈ [-1, 1]` sobre `enUnRecinto`). Los `centros` son los de `enSuOrilla` (`:351-353`), y `cabeElRecinto` ya se comprueba justo antes (`:357`), así que `recintoDeLaCiudad(c, W, H)` no lanzaría ahí y `parteDeLaEntrada(c, p) === 'recinto'` marca exactamente las mismas 9 casillas. **Es la misma regla**: `chebyshev ≤ MEDIO`, con `MEDIO = 1` (`recinto.ts:69,82-86`).
- «Otra copia del recinto que en #305 pasa a vivir en `map/recinto.ts`»: cierto. `parteDeLaEntrada` y `HASTA_LOS_ACCESOS` están exportados (`recinto.ts:72,84`) y ya los usa `marcarElRecinto` en el mismo fichero (`vestir-la-red.ts:503-513`).
- Un detalle que acota el riesgo: esa marca de `:360-361` solo la lee la comprobación `nodoDentro` (`:364`). Las mismas `ciudades` se vuelven a marcar después con `marcarElRecinto` (`:516`; `ciudades` son los `centros` desde `:403-407`), así que su resultado para el resto del vestido ya sale de la puerta.
- **Lo que el issue no dice: hay otras dos copias del mismo recinto en el generador.**
  - `vestir-la-red.ts:392`: `Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) <= 1` («fuera del recinto», el puente de la ciudad-puente). Es `chebyshev ≤ MEDIO` escrito a mano, a 30 líneas de la del issue.
  - `src/core/map/generar/poblar.ts:101-107` (`ciudadesDeRegion`): el 5 × 5 (`dx, dy ∈ [-2, 2]`, y `p.x < 2 … > W - 3` como borde) y su 3 × 3 (`Math.max(|dx|, |dy|) <= 1`) para el `libre(j, delRecinto)`. Es la entrada entera (recinto + accesos) con `HASTA_LOS_ACCESOS = 2` y `MEDIO = 1` tecleados.
- Lo que **no** es copia y no debe entrar: los demás `dy, dx ∈ [-1, 1]` del mapa son las ocho vecinas de una casilla, no el recinto (`map/rio.ts:353`, `map/vestir/caminos.ts:652`, `map/niveles.ts:64`, `map/map.ts:486`, `map/vestir/lineas.ts:309`, `recinto.ts:747`).

## El día después

- Para quien juega, nada, y lo correcto es que nada: los tres sitios dan las mismas casillas que la puerta. **`pnpm banco` tiene que dar el mismo hash**; si se mueve, la reescritura no es equivalente y está mal.
- No cierra ninguna puerta. Abre una: un cambio de `LADO_DEL_RECINTO` (o la idea de #275 de llevar el 3 × 3 a un nivel) pasaría a leer un solo sitio también en el generador.
- No hay nada que borrar después. No contradice `CLAUDE.md`; es su «Un hecho, un sitio».
- Lo que **no** debe hacerse: tocar `recinto.ts` más allá de lo que haga falta exportar (la regla ya existe), mover de sitio la comprobación `nodoDentro` o el orden de las marcas (cambiaría en qué falla un vestido y eso sí movería el banco), ni «aprovechar» para tocar las ocho-vecinas de la lista de arriba.

## Conflictos

- Cola: ninguna tarea en paralelo toca `vestir-la-red.ts` ni `poblar.ts`. #340 toca `map/generar/validar.ts` (`problemasDeLosPueblos`) y `recruitBlocker`: fichero distinto, sin dependencia. #334+#338 (contrato), #336, #341 y #303 (cliente): nada en `map/`. Las carpetas de esas tareas no citan `vestir-la-red`, `poblar.ts` ni `recinto.ts`.
- #275 (el 3 × 3 a un solo nivel en `nivelesDelRelieve`) no choca: va después y sale ganando si el recinto vive en un sitio. No se toca aquí.
- Trabajo reciente: #305 (`d931fbe2`, `d9d290ad`) dejó esta copia a sabiendas y abrió el issue (`docs/agents/2026-11-11-pueblo-en-la-puerta/plan.md:66`). Su plan no vio `:392` ni `poblar.ts`.

## Coste contra valor

Coste mínimo: tres sitios, decenas de líneas, ningún contrato nuevo. El valor también es pequeño (`LADO_DEL_RECINTO = 3` lo eligió el usuario y no se espera que cambie), pero el issue está abierto y hacerlo a medias (una copia de tres) pagaría otra vuelta más adelante. Si no se hiciera nunca, no pasaría nada visible: es P3 de deuda. Vale la pena solo si se hace entero y con el banco igual.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación
>
> 1. Ninguna copia a mano del recinto en el generador: el 3 × 3 de las ciudades del muro (`vestir-la-red.ts:360-361`), el «fuera del recinto» del puente de la ciudad-puente (`vestir-la-red.ts:392`) y el 5 × 5 con su 3 × 3 de `ciudadesDeRegion` (`generar/poblar.ts:101-107`, el borde `p.x < 2 … > W - 3` incluido) leen la puerta de `map/recinto.ts` (`parteDeLaEntrada`, `HASTA_LOS_ACCESOS`, `cabeElRecinto` o `recintoDeLaCiudad`). Las ocho vecinas de una casilla (`rio.ts`, `caminos.ts`, `niveles.ts`, `map.ts`, `lineas.ts`) no son el recinto y no se tocan.
> 2. Es una reescritura equivalente: **`pnpm banco` da el mismo hash** sin re-anclar, una vez al cerrar. Si cambia, la reescritura está mal, no se re-ancla.
> 3. No hay regla nueva, así que no hace falta test nuevo: pasan `pnpm typecheck`, `pnpm lint` y los tests del generador que lean `vestir-la-red.ts` y `poblar.ts` (los de ciudades en su región y los de recintos), cada uno con su porqué. `npx tsx tools/qa/exportaciones.ts` si se exporta algo más de `recinto.ts`.
> 4. Nada se ve distinto: ni navegador ni `pnpm capturas` para esta tarea.
