# La labranza en campos (20-10-2026)

## Petición literal

> El arte de las zonas de labranza es demasido ruidosa y no se ve lo que hay. Mira una zona asi y propon soluciones

Se le propusieron tres opciones (A: menos densidad; B: campos agrupados con el arte de hoy; C: los campos como textura del suelo, con arte nuevo). Respuesta:

> Vale, probamos con la B

Y, ya con el plan escrito:

> Hay algunas casas pequeñas, metelas tambien como parte de la decoracion

## Qué es «la labranza»

La cubierta del suelo `dirt` del mapa de aventura (`src/client/render/escenario/colocar.ts`): `CUBIERTA.dirt`, `MEZCLA.dirt` y la hoja `assets/mapa/modulos/cubierta-dirt` (16 módulos). La reparte el paso 5 de `componer` con `esparcir` y `mata(hojaDeCubierta(…))`: cada punto, un módulo al azar.

## Diagnóstico (semilla 15, la de más `dirt` en 1-40: 439 casillas)

Imágenes en esta carpeta: `labranza-15-ancha.png` (la zona), `labranza-a.png` (izquierda hoy; derecha, la prueba de la opción A), `modulos-dirt.png` (los 16 módulos en orden).

1. Es la cubierta más densa: radio 0,3, `claro` 1,3 (la pradera, 0,24 y 2,1), alto 0,5. No hay claros.
2. Cada punto saca al azar uno de los 16 módulos, y un 25 % sale de la pradera (`MEZCLA.dirt`): parcelas sueltas de cultivos distintos, cercas, almiares y carretas mezclados. No se forman campos: confeti.
3. Mucho contraste y saturación (trigo amarillo, coles verdes, piedras blancas) sobre tierra parda oscura: minas, recursos y figuras se pierden.
4. El almiar y la carreta se confunden con objetos del juego.
5. La opción A probada (radio 0,42, `claro` 2,4, alto 0,42, sin mezcla) deja tierra pelada y sigue siendo confeti.

Los módulos, comprobados con la imagen: 1-4 trigo (4 variantes, el 3 con gavillas), 5-6 coles, 7-8 surcos de tierra (barbecho), 9 cerca, 10 almiar, 11 carreta, 12-14 piedras, 15-16 matas.

## Criterios de aceptación

1. **Campos**: en la labranza, las parcelas (módulos 1-8) van una por casilla, centradas en ella y sin el giro ni el corrimiento al azar de la cubierta de hoy, de modo que casillas vecinas forman una manta continua.
2. **Un cultivo por campo**: un ruido grueso (con la semilla de la escena) agrupa las casillas en campos de unas 3-6 casillas del mismo cultivo (trigo, coles o surcos). Dentro de un campo pueden variar las variantes del mismo cultivo, no el cultivo.
3. **Lindes**: entre campos queda tierra visible (casillas sin parcela o un borde claro), y una parte de la labranza queda en barbecho desnudo o con matas bajas, para que no sea una alfombra entera. En la semilla 15 la zona se lee como «campos de cultivo» al primer vistazo; el usuario lo juzga con la imagen antes/después.
4. **Atrezo con sentido**: cerca, almiar y carreta (9-11) dejan de salir al azar. Van pocos, en el borde de un campo o junto a un pueblo o un camino, y nunca dentro de la reserva de un objeto. Las piedras y matas (12-16), como relleno ralo de lindes y barbecho.
5. **Sin pradera**: fuera la mezcla con `cubierta-grass` en la labranza.
6. **Tono**: la cubierta de labranza va con contraste y saturación bajados (un tono declarado, como el de `paredes-basalto`), para que figuras, minas y recursos destaquen sobre ella.
7. **Nada se rompe**: los guardias del escenógrafo que hoy están a 0 en 1-40 siguen a 0 (`spritesSobreSenda`, `pasillosTapados`, `cubiertaDeOtroNivel`, `basesSobreReserva`…). El pasillo de la senda y las reservas de los objetos se respetan: una parcela que pisaría la senda se encoge o no va, como hoy.
8. **No mueve el resto**: si hace falta, la labranza va con su propia corriente de azar, para que el resto de la escena (cordilleras, bosques, cubierta de otros suelos) no cambie.
9. **Lo que no es labranza no cambia**: la cubierta de los otros seis suelos sale igual que antes, lo que comprueba un test.
10. **Casas sueltas** (petición añadida): algunas casas pequeñas como decoración de la labranza, pocas, en el borde de un campo o junto a un camino, a modo de caserío; nunca en la reserva de un objeto ni tapando la senda. No hay arte de casas sueltas: se sacan de la hoja `assets/mapa/modulos/pueblos` (8 pueblos, cada uno con casas, pozo, huerto y a veces molino o iglesia, dibujados como islas separadas por fondo transparente) con una derivación del taller que recorta las casas sueltas (sin iglesia, molino, pozo ni huerto) a una hoja propia con su JSON, como las demás hojas de módulos. Una casa suelta tiene que leerse como decoración y no como un pueblo (el objeto del juego, 1,9 casillas de ancho): mucho más pequeña que él (orientativo: ≤ 0,8 casillas) y nunca dos juntas que parezcan uno.
11. Imagen antes/después en la semilla 15 y en otra con labranza (19 o 32), para el usuario.

## Fuera de alcance

- Arte nuevo (eso es la opción C). No se gasta en fal.ai ni se encargan imágenes a Codex. Recortar las casas de la hoja de pueblos que ya existe no es arte nuevo.
- Cambiar el núcleo, el generador del mapa o qué casillas son `dirt`.
- La cubierta de los otros suelos, salvo que compartan código que haya que tocar.
- Las otras opciones (A y C).

## Contexto

- Presupuesto de pruebas (la máquina es compartida): medidas en 10 semillas (1-10, más la 15); `pnpm verify` una vez por tanda; `verify:lento` y `pnpm capturas` una sola vez, al cerrar (en QA).
- `pnpm taller escenario 15 --px=96` pinta la escena en `.cache/taller/escenario/15.png` e imprime el `informe`. La labranza de la semilla 15 está arriba a la izquierda (columnas 0-16, filas 0-15) y abajo a la derecha (columnas 20-41, filas 24-41); a 96 px el recorte `(300, 250, 1200, 900)` es la zona del diagnóstico.
- El usuario no abre nada en los worktrees: para enseñárselo, se le mandan las imágenes.

## Decisiones tomadas tras el plan

- Criterio 9: se demuestra una vez, con un script en esta carpeta que vuelca los sprites que no son cubierta de labranza en 1-10 y 15, antes y después, con 0 diferencias. No hace falta un test permanente.
- Lo alto de un acantilado sobre labranza lleva solo relleno (piedras y matas, 12-16), sin parcelas, atrezo ni casas.

- **Las casas van con volumen** (decisión del usuario, 20-10-2026, al ver el plan: «Sí, sigue con las casas con volumen»): no son `plano`; una figura puede quedar detrás de una casa como detrás de un árbol, con el orden por profundidad de siempre (`fundirPorProfundidad`). Las parcelas sí van planas. Si algún guardia del escenógrafo (masa u objetos sobre lo pisable, figuras tapadas) protesta por una casa con volumen sobre lo que se pisa, se resuelve en el guardia o en dónde se pone la casa, sin volver a plana, y se dice en `implementacion.md`.

- **Casas lejos de los caminos** (decisión del usuario tras QA, 20-10-2026, opción 3): un héroe en la casilla de una casa se pintaba delante y parecía de pie encima; las casas van metidas en la labranza, junto a un campo y lejos de las sendas, aunque salgan menos (detalle en `hallazgos-qa.md`, H1).

## Preguntas abiertas (con la suposición por defecto)

- ¿Qué parte de la labranza queda en barbecho? Por defecto, alrededor de un tercio de las casillas sin parcela; se ajusta mirando la imagen.
- ¿Cuánto se baja el tono? Por defecto, lo justo para que una mina o una figura se lean sin buscarlas (orientativo: `saturate(0.7) brightness(0.9)`); se ajusta mirando la imagen.
- ¿Parcela en la casilla de un camino o junto a él? No: el pasillo de la senda manda como hoy.
