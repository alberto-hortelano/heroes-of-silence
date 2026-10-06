**VIGENTE** — la premisa se cumple línea a línea tras 857a849, y la solución (que el relieve derive las rampas de los tramos) es la buena. El alcance es algo **mayor** de lo que dice el issue: hay dos precisiones para los criterios al final.

# Crítica — Rampas de acantilado como hecho del relieve (#150)

## El problema real

Donde un camino baja por una cara de roca, la senda desaparece bajo la roca. La cara tapa la senda, a veces también la pared, y lo que queda parece un recorte. Quien juega no puede seguir el camino que la red sí traza.

## La premisa, afirmación por afirmación

| Afirmación del issue | Verificación |
|---|---|
| `colocar.ts` lo deduce con dos puntos de prueba, pie y filo, contra el pasillo de las masas | **Cierto.** `colocar.ts:865-872`: `rampa = pasillo.contiene(px, py, SEMIANCHO_DEL_PASILLO_DE_MASA) && pasillo.contiene(px, filo, …)`, con `filo = c.y + 1`. Sigue igual después de #153 |
| La cara se pinta encima de la senda | **Cierto.** `pintar.ts:453-462` traza las sendas (capa 3) y `pintar.ts:524-529` pinta las caras después (capa 7). `pintarCara` (`pintar.ts:386-410`) hace un `fillRect` opaco desde `y+1` hasta `caida·altoDeNivel`. La senda que cruza esa banda queda tapada siempre, quitando o no la pared |
| Donde se quita la pared queda un rectángulo liso | **Cierto.** Debajo de la pared solo hay textura y degradado (`pintar.ts:395-409`). Medido en 10 semillas: en 69 de 101 cruces no hay ningún trozo de pared a menos de 0,35 del cruce. El hueco liso mide casi siempre 1 casilla (de 0,46 a 2,6), y en 24 cruces la cara entera se queda sin pared |
| Los tramos están disponibles para el pintor | **Cierto.** `analizar.ts:23` (`caminos.tramos`); `colocar.ts:516` los pasa a coordenadas de escena |

**Rampas reales en 10 semillas** (semillas 1-10, `newGame` + `analizar` + `relieve` + `componer`, con un script en el scratchpad):
- 2 087 tramos; 151 unen casillas de distinto nivel. De ellos, **55 bajan por una cara** (de 3 a 8 por mapa, 48 caras distintas), 35 por un canto este/oeste y 61 por un reborde de espaldas.
- **47 de esos 55 son diagonales.**
- Las sendas suavizadas cortan la línea del filo dentro de una cara **101 veces**.

**Lo que el issue no dice: la prueba de hoy falla también en el otro sentido.** En **32 de esos 101 cruces queda un trozo de pared a menos de 0,35 casillas del punto donde la senda corta el filo**: la pared tapa la senda. Casi todos están en el borde de la cara (`x ≈ x0` o `x1+1`) y son descensos en diagonal. La prueba lo explica: exige que el mismo `px` caiga en el pasillo en el pie y en el filo, y una diagonal se desplaza `caida·0,6` en horizontal entre los dos. Ningún guardia lo ve: `APARTE.pared` es `null` (`colocar.ts:249`), así que `spritesSobreSenda` (`colocar.ts:1032`) no cuenta paredes. El informe da 0 en las 10 semillas con la pared encima de la senda.

Los cantos ya respetan la senda: sus peñascos pasan por `entraria('roca', …)`, y `APARTE.roca` lleva semiancho. Los rebordes no se ven. **El alcance son las caras.** No hay que extenderlo.

## El día después

- **Para quien juega:** de 3 a 8 sitios por mapa en los que el camino pasa a verse continuo bajando la cara, en el zoom máximo y en el alejado. Es justo la queja del 05-10 («los caminos se ocultan»).
- **Lo que se vuelve más difícil:** nada del núcleo. El banco no se mueve, porque todo es cliente. Las rampas quedan atadas a los tramos y al nivel visual. Cuando #143 lleve el nivel al motor, se recalculan solas si siguen derivadas y no guardadas.
- **Lo que hay que borrar:** los dos sondeos de `colocar.ts:868-871`, incluido `reservas.tomada(px, filo)` si deja de tener sentido. Queda dicho en el criterio 3.
- **`CLAUDE.md`:** encaja con «un hecho, un sitio». No contradice ninguna decisión.

## Conflictos

- **#151 (fusionar `Reservas` y `Pasillo`):** hay **solapamiento leve y no contradicción**. La línea de la pared (`colocar.ts:872`) usa los dos índices a la vez y es de las que #151 tendría que reescribir. Si #150 va primero, #151 tiene un usuario menos de `pasillo.contiene` con semiancho de masa. **El orden #150 → #151 abarata #151.** Lo que **no** debe hacer #150 es empezar la fusión por su cuenta (requisitos ya lo excluyen).
- **#152 (lo pintado fuera del mapa sobre la niebla):** no hay conflicto. Es el recorte superior de los volúmenes contra la niebla. No toca caras ni sendas.
- **#155 (`pegada`):** si se quita, cambian los tramos y, con ellos, dónde caen las rampas. Con las rampas derivadas da igual el orden. Si #155 va después, las capturas de antes/después de #150 dejan de valer como referencia para #155, y no pasa nada.
- **#143 (nivel en el motor):** es compatible. La rampa se deriva del nivel, sea cual sea su origen.
- **#134 / `docs/art/peticiones.md`:** no hay ninguna petición de arte de rampa. Los requisitos ya mandan allí lo que haga falta.

## Coste contra valor

Es trabajo de cliente, acotado a `relieve.ts`, `colocar.ts` y `pintar.ts`, sin núcleo ni banco. Arregla de 3 a 8 defectos visibles por mapa en lo que más importa leer del mapa, que es por dónde se va. Si no se hiciera nunca, los caminos seguirían cortándose en cada cambio de nivel, y la queja del usuario volvería en cuanto mire un acantilado. Merece la pena.

## Qué le cambiaría a `requisitos.md`

Sustituir el criterio 4 por este y añadir el 7:

> 4. `informe.spritesSobreSenda` sigue en 0 y no entran errores en el informe del escenógrafo. **Además, el informe cuenta también las paredes de acantilado que pisan una rampa y esa cifra es 0.** Hoy `APARTE.pared` es `null` y en 10 semillas hay 32 cruces de senda y filo con un trozo de pared a menos de 0,35 casillas, invisibles para el informe.
>
> 7. Los descensos en diagonal cuentan: son 47 de los 55 tramos que bajan por una cara en las semillas 1-10, y casi todos caen en el borde de una cara o entre dos caras en escalera. Las capturas de antes y después incluyen al menos un descenso diagonal.

En **Contexto**, añadir una línea:

> - Medido el 06-10-2026 en las semillas 1-10: 55 tramos bajan por una cara (de 3 a 8 por mapa) y las sendas cortan el filo 101 veces. En 69 de esos cruces queda un hueco liso (de ~1 casilla, y la cara entera en 24). En los otros 32 la pared tapa la senda. Los cantos este/oeste ya respetan la senda y quedan fuera.
