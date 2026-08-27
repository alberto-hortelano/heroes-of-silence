# Medida · ¿existe un tamaño de mapa intermedio?

El usuario eligió **medir el punto intermedio** en vez de tomar el 24×24 de hoy o
el 48×48 que sí trae el dragón óseo. Siete tamaños, **200 semillas cada uno**,
mismo emparejamiento y mismo tope de 300 días que `pnpm banco` — el arnés es el
de `tools/qa/partidas.ts`, reutilizado y no reinventado, que es lo que hace las
tandas comparables. Los dos extremos se remidieron **como control** y reproducen
la tabla de referencia, lo que valida el instrumento antes de creerse las filas
nuevas.

| lado | mediana / p90 / máx | sin terminar | `dwelling_5` | `dwelling_6` | dragón óseo | nivel ≥5 | gana j0 / j1 | tiempo |
|---|---|---|---|---|---|---|---|---|
| **24** | 7 / 8 / 20 | 0 | 15/200 | 2/200 | 1/200 | **5 de 7** | 42 / 158 | **1,65 s** |
| 28 | 8 / 16 / **301** | **1** | 197/200 | 8/200 | 1/200 | 7 de 7 | 189 / 10 | 3,99 s |
| 32 | 9 / 12 / 53 | 0 | 200/200 | 9/200 | **0/200** | 6 de 7 | **200 / 0** | 3,13 s |
| 36 | 11 / 20 / 36 | 0 | 200/200 | 12/200 | 11/200 | 7 de 7 | 198 / 2 | 6,47 s |
| 38 | 17 / 34 / 50 | 0 | — | 58/200 | 54/200 | 7 de 7 | 185 / 15 | 9,94 s |
| 40 | 20 / 36 / 63 | 0 | 200/200 | 86/200 | 80/200 | 7 de 7 | 186 / 14 | 11,59 s |
| 44 | 21 / 37 / 65 | 0 | 200/200 | 83/200 | 74/200 | 7 de 7 | 197 / 3 | 13,35 s |
| **48** | 30 / 42 / 82 | 0 | 200/200 | 150/200 | 139/200 | 7 de 7 | 181 / 19 | **20,92 s** |

## La respuesta es que no existe

**El requisito tenía tres patas y no las cumple ningún tamaño.** La curva no es
una rampa: son **dos escalones lejos el uno del otro**.

- **24 → 28** mete `dwelling_5` (15 → 197 de 200) y nada más: el `crusader` sale
  en 2 partidas, el `paladin` en 3, el dragón en 1. Presencia testimonial.
- **28 → 36 es meseta.** `dwelling_6` se mueve 8 → 9 → 12 de 200. Ampliar el mapa
  en ese tramo compra días de juego, **no bestiario**.
- **36 → 40** es el escalón que sí: `dwelling_6` 12 → 86, dragón 11 → 80. Precio,
  6,5 s → 11,6 s. El 38 lo parte por la mitad (dragón 54) por 9,94 s.
- **40 → 48** no es un tercer escalón: ×1,8 de tiempo para pasar el dragón de 80
  a 139.

Y **el equilibrio está volteado en los siete tamaños que no son 24**. El que peor
se porta no es el más grande: es **32×32, con 200/200 para j0 y cero partidas
para j1**.

**28×28 es el tamaño a evitar, y es el más cercano al de hoy**: es el único que
produce una partida sin terminar (semilla 93, tope de 301 días) y es **más lento
que 32×32 siendo más pequeño** —3,99 s contra 3,13— porque lo que paga es la
cola, no la mediana. Si `barrido-semillas` tuviera 28 de base, hoy **nacería en
rojo**.

## Lo que de verdad explica la tabla, y no estaba en la pregunta

**La densidad del mapa no escala con el lado.** `generateMapPlan` pone siempre
**28 minas, 8 monstruos, 10 montones de recursos y 4 cofres**, y las minas van en
coordenadas **fijas respecto a cada esquina** (`x = 2 + i*2`, `y = 7 + k*2` y su
espejo); los radios de las regiones de terreno también son fijos.

O sea que **un mapa más grande no añade economía: alarga el hueco vacío del
centro.** Lo que las siete filas miden no es «un mapa más grande» sino «más días
de renta antes del contacto» — y por eso la única palanca que se mueve es la
duración. Esto reencuadra #90 otra vez: no es «faltan días» ni exactamente
«falta mapa», es que **el generador no escala**.

Es también la explicación mecánica del coste: el tiempo crece ×12,7 mientras los
días solo crecen ×4, porque el coste **por día jugado** sube de 1,10 a 3,45 ms
—el pathfinding sobre cuatro veces más casillas—. El total es el producto de dos
factores que crecen.

## Una cifra que no cuadra, dicha en vez de callada

La medida del ciclo da **139/200** dragones en 48×48 y **1/200** en 24×24; la
medida del crítico daba **123** y **0**. Todo lo demás de esas dos columnas cuadra
exactamente, así que **es la definición y no el arnés**. Se probaron tres sobre
las mismas partidas y **ninguna da 123**: reclutado alguna vez (139 / 1), vivo al
terminar (26 / 1), `necromancer_dwelling_6` construida (145 / 2). Se usa la
primera, que es la que corresponde a «pisa el tablero», y es la misma en las ocho
columnas. **La discrepancia queda sin reconciliar**, y se escribe así.

Del mismo tipo: **`dwelling_6` construida ≠ dragón reclutado.** En 48×48, 145
partidas levantan la morada y solo 139 compran un dragón.

## Lo que la medida NO cubre

- Es la **IA de reglas contra sí misma**, no una partida de una persona ni la del
  agente por MCP, que juega distinto y que además defiende.
- Son **mapas cuadrados del procedimental**. Uno diseñado por el agente no tiene
  por qué comportarse así.
- **El reparto de ganadores no controla la esquina**: j0 es siempre el caballero
  arriba a la izquierda. Es comparable con el 42/200 del ancla del banco —misma
  medida sin controlar— pero **no es una medida de equilibrio entre facciones**:
  mezcla facción y esquina. Las cifras de equilibrio de `CLAUDE.md` sí controlan.
- **200 semillas son ±3,5 puntos** cerca del 50 %. Los saltos grandes (15 → 197,
  11 → 80) están muy por encima; `dwelling_6` 8 → 9 → 12, o el 86 contra 83 de 40
  y 44, **no se distinguen de cero**.
- El tiempo es **de esta máquina**, no el de los runners de CI.

## Recomendación

**No se mueve el 24×24 por defecto.** El ancla del banco, las cifras de
equilibrio y la línea base de cero partidas sin terminar están todas medidas
ahí, y ningún tamaño cumple las tres patas.

Si se quiere ejercitar el bestiario caro, sale más barato **añadir una segunda
tanda** con otro lado que mover la que ya está anclada — y no necesita 200
semillas: con **40 en 38×38** (≈2 s) salen las siete. Eso separa las dos
preguntas que hoy contesta una sola herramienta: el banco mide que **el código
hace lo mismo**; la tanda nueva mediría que **el contenido caro se juega**.
