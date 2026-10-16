# Hallazgos de QA (vuelta 1): pisable junto al bosque

Veredicto de QA: **apto con reservas** (`qa.md`). Aquí están los hallazgos deduplicados y la decisión de cada uno. La evidencia está en `qa/`.

## Se arreglan

### H1. Abetos de miniatura sobre la nieve (incumple el criterio 1)

**Qué pasa.** Los módulos 1-4 de `cubierta-snow` son abetos nevados en miniatura. Se ponen como matas sobre la nieve que se pisa:

- En 1-40 hay 9 455 piezas en 4 601 de las 6 735 casillas de nieve pisable. En HEAD había 5 973.
- Miden 0,42 de mediana.
- `arbolesSobreLoPisable` no los ve porque solo mira el nombre de la hoja.
- Reproducción: `pnpm taller recorte 3 2 10 14 19 out.png 64`.

**Qué hacer.**

- Sacar de la mezcla de la cubierta de la nieve los módulos que son árbol.
- Que el contador cuente como árbol esos módulos.
- Si en el catálogo hay más módulos de cubierta con forma de árbol, en `cubierta-*` de cualquier suelo, igual. Revísalos todos mirando las imágenes, no solo la nieve.

**Cómo se comprueba.** El contador ve esos módulos, sigue a 0 en 1-40 y se mide el suelo desnudo de la nieve.

### H2. Casillas de bosque sin un solo árbol (preexistente; ahora se nota más)

**Qué pasa.** De las 4 809 casillas de bosque que tocan lo pisable:

- 93 no tienen ningún árbol propio.
- 173 no tienen ninguno de más de 0,5.

Antes las rodeaban árboles de la cubierta; ahora solo las distingue el sotobosque.

Lo peor son los bosques de una casilla sin ningún árbol. Tres de los cuatro están junto a la puerta de una ciudad, donde la reserva del objeto no deja plantar:

- s1 (14,24), bajo town-7
- s1 (28,35), bajo town-11, con la senda pintada encima
- s13 (17,22)
- s27 (25,18)

`casillasDeBarreraSinFormacion` no lo caza.

**Qué hacer.**

- Toda casilla de bosque lleva al menos un árbol que se lea como bosque.
- Donde la reserva o la senda no dejen el alto normal, un árbol más bajo o más estrecho, con la maquinaria de `poner`/`altoLibre`.
- Nuevo contador `bosqueSinArbol`, que tiene que dar 0 en 1-40. Si no se llega, un techo con su razón por casilla.
- La reserva de la puerta de una ciudad no se rompe: la entrada tiene que seguir viéndose. Si un árbol en esa casilla tapa la puerta o la senda, se dice y se deja como techo declarado.

### H3. La perspectiva tapa los pasillos estrechos (decisión del usuario, 14-10-2026)

**Qué pasa.** Las copas de la fila de al sur tapan, por perspectiva, la casilla pisable de justo al norte. En los pasillos de una casilla de este a oeste y en los rincones, lo pisable desaparece. Ejemplos:

- s1, fila 17, columnas 29-31, que es un paso de verdad
- s2 (10,18)
- s3 (4-5,18)

**Qué eligió el usuario.** Arreglarlo **solo en los pasillos**:

- Una masa (bosque o montaña, no las cumbres) no tapa más de una fracción de una casilla pisable **estrecha** que tenga al norte.
- Lo ancho sigue igual: una figura puede quedar detrás de un árbol (#185).

**Qué fija el ingeniero, con capturas de s1, s2 y s3.** Ninguna de estas tres cosas cambia la regla de la decisión:

- qué es «estrecha»: por ejemplo, la casilla pisable cuya vecina norte, o las dos de su fila, no son pisables (pasillo de una casilla de este a oeste o rincón), o un pasillo de hasta dos casillas de hondo;
- la fracción tapada que se admite;
- la medida: cobertura de la casilla por la silueta o por la caja.

**Cómo se hace.** Con la misma puerta que el criterio 3: un tope más en `Obstaculos`, como `topeDeLoPisable`, que encoge o quita.

**Cómo se mide.** Nuevo contador `pasillosTapados`, que tiene que dar 0 en 1-40 o un techo declarado. Se miden también:

- el alto del borde de bosque y montaña;
- `casillasDeBarreraSinFormacion`, que tiene que seguir a 0;
- el H5 de QA (el borde de la montaña baja), que no debe empeorar a la vista.

## Se quedan como están

- **H4, el sotobosque casi no se ve en la ciénaga y la lava.** Es menor y ya se distinguen por la cubierta. Se anota para el usuario; no se toca.
- **H5, el borde de la montaña junto a lo pisable baja un poco.** QA no lo ve menos legible. Se vigila con H3.
- **H6, rocas de lo alto del acantilado que entran de lado en lo pisable.** Viene de antes: va al backlog, en la issue que propuso el arquitecto.
- **H7, sin arte, las matas son triángulos como los del bosque.** Viene de antes y solo pasa sin arte: va al backlog.
- **C6, las marcas pendientes.** Se resuelven tras el commit.

## Pruebas

- Mientras se itera, solo los tests de lo que se toca.
- Al final, una vez: `pnpm verify` y `pnpm verify:lento`.
- `pnpm capturas` lo vuelve a correr QA al re-verificar.
- `pnpm taller escenario 1 3 7` para el suelo desnudo y los contadores.
