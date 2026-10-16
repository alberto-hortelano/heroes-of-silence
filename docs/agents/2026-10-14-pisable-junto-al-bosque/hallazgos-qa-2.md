# Hallazgos de QA, vuelta 2: pisable junto al bosque

Veredicto de QA: **apto** (`qa.md`, «Vuelta 2»). El usuario pidió el 16-10-2026 arreglar dos menores antes de cerrar.

## H9. La nieve al alejar se parece a la montaña

**Qué pasa.** Sin los abetos en miniatura, la nieve que se pisa queda cubierta de peñascos grises. Al tope de alejar se confunde con la montaña: en el Valle Hondo de s3, la nieve y la sierra de su sur solo se distinguen por el tamaño y la densidad (`qa/v2/juego/s3-valle-hondo-tope-par.jpg`). De cerca se lee bien.

**Qué hacer.** En la cubierta de la nieve que se pisa deben mandar las matas y los montones nevados (blancos), no los peñascos grises. Puede hacerse de dos maneras:
- con el peso de los módulos de `cubierta-snow` en la mezcla;
- quitando los peñascos de roca gris de la nieve pisable, sin tocar lo alto del acantilado ni las barreras.

Revisa también la lava y la arena por si les pasa lo mismo con su barrera, la montaña o el acantilado vecino. Si les pasa, se dice; no se arregla sin preguntar.

**Cómo se mide.** Suelo desnudo de la nieve antes y después, que no debe subir más de 3 puntos. Recorte al tope de alejar del Valle Hondo de s3 y de la nieve de s1 y s2, antes y después. Un dato que diga cuánto gris hay en la cubierta de la nieve pisable, por ejemplo la proporción de piezas de roca sobre el total.

## H10. Pasillos de dos casillas de hondo

**Qué pasa.** En un pasillo de dos casillas de hondo, la casilla de abajo queda tapada en un 80 % o más por la copa de la fila de al sur: 139 casos con bosque y 57 con montaña en 1-40. La fila de arriba queda libre y el pasillo se lee. Es la desviación 3 del ingeniero en la vuelta 1.

**Qué decidió el usuario.** Extender a estos pasillos la regla de los estrechos (`pasillosEstrechos`, `altoSobreLosPasillos`, `TAPADO_DEL_PASILLO`): una casilla pisable que, con su vecina norte, forma un pasillo de dos de hondo (sin nada pisable al norte de la vecina) cuenta como estrecha.

**Lo que no cambia.** Lo ancho sigue igual (una figura puede quedar detrás de un árbol, #185). Las cumbres siguen exentas.

**Cómo se mide.**
- `pasillosTapados` = 0 con la definición nueva.
- La medida de QA, casillas tapadas en un 80 % o más (`qa/medidas/` y `qa/v2/medidas/`), en 1-40, antes y después.
- La mediana del alto del borde del bosque y de la montaña bajo un pasillo.
- `casillasDeBarreraSinFormacion` y `bosqueSinArbol`, que siguen a 0.

## Pruebas

- Mientras iteras, solo los tests de lo que tocas.
- Al final, una vez, `pnpm verify` y `pnpm verify:lento`.
- `pnpm capturas` no se corre: lo repite QA o el coordinador al cerrar.
- `pnpm taller escenario 1 3 7` para el suelo desnudo y los contadores.
