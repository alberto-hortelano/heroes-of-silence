**REENCUADRADA** — la pregunta de la issue ya tiene respuesta medida: `pegada` se queda. Lo que falta es documentación (historia.md con el motivo viejo) y cerrar la issue; no hace falta arquitecto ni ingeniero.

## El problema real
La regla de los caminos documenta un motivo que ya no existe (el pintor cosiendo rombos), y nadie ha medido si el motivo nuevo («calzada ancha») justifica el coste por sí solo.

La tarea dice «quitarla o justificarla». Con la medida de abajo, lo que queda es justificarla.

## La premisa, afirmación por afirmación
- **«`trazarCaminos` cobra `pegada` por arrimarse a la red»**: cierto. `vestir.ts:746` (`else if (!enLaRed && pegada?.[j] === 1) paso += this.recto;`), con el array que mantiene `ArbolDeCaminos.marcar` (`vestir.ts:1000-1003`) y que se pasa en `vestir.ts:860`.
- **«Existía para que el pintor no cosiera radios vecinos en rombos»**: así lo dice `docs/historia.md:1544-1546` («porque el pintor cose dos casillas de camino vecinas en rombo»).
- **«Con #153 eso ya no puede pasar»**: cierto. El pintor encadena tramos (`sendas.ts:45`, `encadenar(tramos)`) y ya no deduce aristas por adyacencia, así que dos casillas vecinas sin tramo entre ellas no se unen.
- **«Hoy se justifica con otro motivo: calzada ancha»**: cierto en el código (`vestir.ts:816-818`). Pero `historia.md:1544` sigue dando el motivo viejo, así que los dos sitios dicen cosas distintas.
- **«Coste de quitarla: cambia las casillas y el banco»**: cierto. Las casillas de camino abaratan el paso del héroe (`map.ts:367`, `costeDeEntrada(..., map.caminos.tiene(to), ...)`), así que cambian las partidas.
- **Lo que la issue no dice: quitarla simplifica muy poco.** Desaparecen el campo `pegada`, su relleno en `marcar`, un parámetro de `buscar` y la línea 746: unas 8 líneas. El otro recargo (`vestir.ts:747-758`, diagonal junto a un nodo, el que evita la Y) **no depende de `pegada`** y se queda en cualquier caso.

## Medida (semillas 1-10, `generateMapPlan(createRng(s))`, 34×34)
La versión sin `pegada` sale de una copia de `src/` con la línea 746 anulada; el repo no se ha tocado.

| media por mapa | con `pegada` | sin `pegada` |
|---|---|---|
| casillas de camino | 203,8 | 209,9 (+3 %) |
| tramos | 208,7 | 214,8 |
| longitud (diagonal = 1,414) | 246,3 | 249,6 |
| tramos rectos con gemelo paralelo a distancia 1 | 0,6 | 1,5 |
| bloques 2×2 de camino | 0,5 | 1,3 |
| parejas de casillas de camino 8-vecinas **sin tramo entre ellas** (dos trazos que se rozan) | 33,5 | 47,5 (+42 %) |
| horquillas (grado ≥ 3) | 26,1 | 28,5 |
| Y (de una casilla salen un recto y una diagonal con extremos 4-vecinos) | 0 | 0 |

Sin `pegada` empeoran todas las cifras, y en las 10 semillas a la vez: más camino, más trazos que se rozan, más paralelos y más bloques. Ninguna mejora. La Y no se mueve porque la evita el otro recargo.

Con `ANCHO_DE_SENDA` = 0,2 y un pasillo de 0,4 a cada lado (`sendas.ts:20,37`), dos trazos a una casilla de distancia dejan entre ellos una franja de 0,2 casillas sin cubierta. Eso es la «calzada ancha» de la que habla el comentario. El motivo nuevo se sostiene.

## El día después
- **Si se quitara**, quien juega vería un 42 % más de roces entre sendas y algo más de camino (+3 %), es decir, mapas más rayados, justo lo que #149 y #153 se esforzaron en bajar (historia.md:1520-1546). A cambio se ahorran 8 líneas y se paga re-anclar el banco.
- **Si se queda**, no cambia nada para quien juega y el banco no se toca.
- **No contradice** ninguna decisión de CLAUDE.md, ni en un caso ni en el otro.

## Conflictos
- **#157 (puentes, otro worktree)** toca el pintor, no `trazarCaminos`: no se pisan. Si se quitara `pegada`, cambiarían las casillas de camino que #157 usa para llevar la senda hasta los estribos, y sus capturas dejarían de ser comparables. Es una razón más para no quitarla ahora.
- No hay otra issue abierta sobre `trazarCaminos` ni sobre el banco de caminos (`gh issue list`: #94, #95, #98 y #112 son del Dijkstra de partida y del banco de criaturas).

## Coste contra valor
- **Quitarla**: valor de unas 8 líneas; coste de re-anclar el banco, peores mapas medidos y consultar al usuario. No compensa.
- **No hacer nada**: la issue se queda abierta y historia.md sigue dando un motivo falso. Es barato de arreglar, pero conviene arreglarlo.
- **Capturas a 110 px**: no son necesarias para decidir, porque los números empeoran en todas las semillas. Si el usuario quiere ver la calzada ancha, una pareja de capturas de s6 (5 paralelos y 3 bloques sin `pegada`, frente a 2 y 1 con ella) lo enseña. Es opcional.

## Qué no debería hacerse
- Quitar `pegada`.
- Re-anclar el banco.
- Tocar el recargo de la diagonal junto a un nodo (`vestir.ts:747-758`): es otra regla, con otro motivo (la Y), y no entra en esta tarea.

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Reencuadre del crítico (07-10-2026).** Medido en las semillas 1-10: sin `pegada`, las casillas de camino pasan de 203,8 a 209,9 por mapa, las parejas de trazos que se rozan sin tramo de 33,5 a 47,5, los paralelos a distancia 1 de 0,6 a 1,5 y los bloques 2×2 de 0,5 a 1,3; las Y siguen en 0. Quitarla ahorra unas 8 líneas. **Se queda.** El alcance pasa a ser:
> 1. `vestir.ts:813-818` (doc de `trazarCaminos`): el motivo con su medida y su fecha.
> 2. `docs/historia.md:1544-1546`: cambiar «porque el pintor cose dos casillas de camino vecinas en rombo» por el motivo de hoy (calzada ancha, con la medida) y anotar que el de los rombos desapareció con #153.
> 3. Cerrar #155 con la tabla de la medida.
> Sin cambio de código; `pnpm verify` en verde; el banco no se mueve. Las capturas a 110 px, solo si el usuario las pide (s6 es la semilla que más lo enseña). Es un cambio de documentación: no necesita el ciclo completo.
