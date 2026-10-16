# Hallazgos de /simplify: pisable junto al bosque

Cuatro revisores (reutilización, simplificación, eficiencia y altitud) sobre el diff sin commit de la tarea. Aquí van deduplicados y con la decisión ya tomada. Las líneas son aproximadas: búscalas por nombre.

## Se aplican

1. **Las cumbres se marcan en el sprite, no con un flag.** Lo señalaron los cuatro revisores.
   - Hoy: `ponerCumbre` con `try/finally`, `sinLoPisable` pasado a mano en tres o cuatro llamadas, el `Set` `cumbresPuestas` (que depende de la identidad del objeto y de `sprites.at(-1)`), un `add` en `unoQueDomine` y el parámetro `cual` de `pisa` y `altoLibre` en `pasillo.ts`.
   - Se cambia por una marca en el sprite (`cumbre: true`, o lo que encaje en `Sprite`/`Medible`). La regla de lo pisable la lee y no mide las cumbres. El informe separa las cumbres por esa marca.
   - Desaparecen el flag, el `try/finally`, el `Set`, `sinLoPisable` y `cual`.
   - Cuidado: el pico que sube `unoQueDomine` también es cumbre, porque hoy entra en `cumbresPuestas`.

2. **La regla de lo pisable, una sola y barata.** Lo señalaron eficiencia y altitud, y está relacionado con lo que vio reutilización.
   - Hoy hay tres problemas:
     - `formaDeLoPisable` mete un trozo en el índice por cada casilla pisable cerca de una masa, unas 9 entradas por casilla.
     - Infla `alcance` a ½ + 2·radio porque `'filaDelPie'` mide una caja distinta de la que preselecciona el índice, y eso rompe el contrato de `alcance`.
     - Todas las clases recorren esos trozos para acabar en `null`.
   - Además, `masaSobreLoPisable` reescribe la misma geometría a mano, y ya no coinciden: la forma mira hasta `ALCANCE_DE_LA_COPA` y el contador mira toda la caja.
   - **Lo que se quiere:** una sola función que diga si una masa entra más de `M` en una casilla pisable de la fila de su pie. Recorre las columnas `⌊x0⌋..⌊x1⌋` de esa fila sobre la rejilla (`franjaDe` o una `Uint8Array` de lo pisable) y la usan igual la puerta (`entra`/`poner`/`altoLibre`) y el contador. Sin alcance inflado, sin `ALCANCE_DE_LA_COPA` escrito a mano y sin coste para las clases que no son `masa`.
   - El ingeniero decide cómo engancharla:
     - preferido: una forma «de rejilla» en `Obstaculos`, con su propio `pisa` y filtrada por clase antes de nada;
     - si no encaja en el índice sin forzarlo: dejarla en el índice con las rachas de cada fila fundidas en un tramo `[x+M, x+n−M]`, un filtro por clase en el trozo y la caja de la medida en la preselección.
   - Si el alto libre sale cerrado (el ancho es lineal en el alto), mejor que la bisección. Se dice qué se eligió.

3. **Sin pies por debajo del mapa.** Lo señalaron simplificación y altitud.
   - Hoy la regla «un pie fuera del mapa es de la última fila» está escrita dos veces: el tramo fantasma de la fila `H` en la forma y el `y === H → H−1` de `casillaDelPie`. Sale de que la caja de `esparcir` de la masa llega a +0,35 por debajo del mapa.
   - Se recorta esa caja al mapa en `y` y se quitan los dos casos.
   - Se mira el borde inferior en una captura para comprobar que no se ve peor.

4. **Una receta común para el sotobosque y el agua.** Lo señalaron reutilización, simplificación, altitud y eficiencia.
   - `sotobosqueDe` copia el bucle por niveles de `aguasDeLaEscena`: indicador, `campoBilineal`, esquinas, cierre por el techo y desenfoque.
   - Se saca un helper común, del tipo «máscara nítida por nivel cerrada por el techo», que usan los dos.
   - El techo (`techoDelAgua`) se calcula una vez por escena con la caché del escalón, no dos.
   - Si es sencillo, cada nivel trabaja solo en la caja de sus casillas más una de margen.
   - `aguaEnLoAlto` y los tests del agua deben seguir igual: es una refactorización de la receta del agua y no puede cambiar ni un píxel.

5. **La copia por trozos, siempre.** Lo señalaron simplificación y altitud.
   - `soloDondeHay` es un booleano posicional y el resultado es idéntico con cualquiera de los modos de `encima`. Se aplica siempre y desaparece el parámetro.
   - `trozosConAlfa` se guarda con la máscara (en la caché del escalón), no se recalcula en cada pintado.
   - Se mide el pintor como se hizo con el sotobosque: alternado, 12 pinturas, s13, 2 y 9 a 120 px. Si sube, se vuelve al flag y se dice.

6. **Un solo recorrido de las franjas de bosque.** Lo señalaron los cuatro revisores.
   - `orillaDelBosque`, `Escena.bosque` y las casillas de masa de la forma recorren `a.franjas` por separado.
   - Se calculan una vez en `componer` (las casillas de bosque y, si hace falta, las de masa) y se pasan.
   - Para las 8 vecinas, `vecindad(W, H)` de `@core/map/regiones` si encaja.

7. **La hoja de un sprite, en un solo sitio** (reutilización, simplificación y eficiencia).
   - `hojaDelSrc` existe sin exportar en `bordes.ts`; `esArbol` y `cubiertaDeOtroNivel` hacen cada uno su propio `split('/')[1]`.
   - Se exporta `hojaDelSrc` (o un `hojaDelSprite`) y la usan las tres, también el test.
   - En `esArbol`, se filtra primero por clase.

8. **Los contadores, en una pasada.** Lo señalaron simplificación y eficiencia.
   - La IIFE dentro del literal del informe se sustituye por una pasada que cuente árboles, masas y cumbres antes del objeto.

9. **`hojasDeLaCubierta` pasa a constante de módulo** (`Record<Suelo, ReadonlySet<string>>`), y se quita la `Map` que la cachea en `cubiertaDeOtroNivel`.
   - Los comentarios que cuentan la historia del cambio, en `APARTE.cubierta` y en `hojasDeLaCubierta`, se acortan: la historia ya está en `docs/historia.md`.

10. **`--px N` pasa a `--px=N`**, como el resto de opciones del taller (`--solo=`). Se actualizan sus menciones en `CLAUDE.md`, `historia.md` y la documentación de la tarea.

## Se descartan a conciencia

- **`arbolesSobreLoPisable` es redundante con `poner`, que ya lanza.** Se queda: es la medida del criterio 1 y un guardia independiente de la puerta. Si alguien relaja `APARTE.cubierta`, el contador sigue mordiendo.
- **El esbozo y el bueno calculan las máscaras del escalón dos veces** (un Worker por encargo). Viene de antes de esta tarea y afecta a todas las máscaras: va al backlog, no aquí.
- **Dos mandos para la fuerza del sotobosque** (el color en `multiply` y el alfa). Son dos grados de libertad útiles para calibrar el tono por suelo, que el plan dejaba abierto para la nieve. Se quedan.
- **Exportar `casillaDelPie` para los demás contadores.** Con el punto 3 desaparece su caso especial, y los demás contadores están fuera del diff.
- **El `for` con `!cerca` como un `some`.** Desaparece con el punto 2.

## Cómo se verifica

- `pnpm vitest run` de los tests tocados: `pisable-junto-al-bosque`, `taller-escenario`, `cubierta*`, los del escalón y el agua, y `macizo`.
- `pnpm taller escenario 1 3 7`: el suelo desnudo (23,3 / 23,7 / 27,7 %) y los contadores, iguales.
- `pnpm verify` al final.
- `verify:lento` una vez, porque se toca el escenógrafo.
- `pnpm capturas` no se repite salvo que cambie lo que se ve: el borde inferior del mapa del punto 3 se mira con un recorte del taller.
