# Requisitos: los caminos del mapa, despejados

## Petición literal

> Muy bien, seguimos con el mapa. Los caminos se ocultan muy a menudo, hay que darles algo de espacio despejado alrededor, no son solo elementos altos, tambien cosas como terrenos de labranza, matojos, piedras, se pintan encima del camino. No se si con dejar mas espacio vale o hay que crear arte de camino que incluya espacio alrededor

## Decisiones del usuario (05-10-2026)

- **Pasillo y arcén.** Se reserva un pasillo a lo largo del trazo real de la senda y se descarta todo sprite cuyo rectángulo lo pise, sea bajo o alto. Además se pinta un arcén procedural: tierra o hierba corta que se funde con el suelo. **No se pide arte nuevo.**
- **Margen ~0,4 casillas** a cada lado, contado desde el borde de la senda. Se ajusta a ojo con el taller y la cifra queda en una constante con nombre.

## Diagnóstico (exploración del coordinador)

Todo en `src/client/render/escenario/`.

1. **La cubierta plana se pinta encima de la senda.** En `pintar.ts`/`pintarSuelo` las sendas van en la capa 3 y los `planos` en la 7.
2. **La reserva de caminos deja huecos.** Son discos de 0,38 en el centro de cada casilla de camino (`colocar.ts` ~l.417), sobre una máscara de 4×4 subceldas. En la unión entre casillas queda una franja sin reservar de ~0,5 casillas, y en diagonal es peor. La senda suavizada además ondula hasta ~0,28 casillas (`sendas.ts`, `VAIVEN`).
3. **Solo se comprueba el punto de base, no el rectángulo del sprite.** Afecta a `pisable` (~l.795), a la cubierta, al relleno de rocas y a las masas. Una mata de `cubierta-dirt` (labranza) llega a 1,6 casillas de ancho y el sprite crece hacia arriba y a los lados desde su ancla.
4. **La regla «pico o árbol al sur del camino al 55 %»** (`colocar.ts` ~l.502-515) es un parche de lo mismo.
5. **No hay arte de senda.** Son tres trazos procedurales: 0,20, 0,12 y 0,05·T.

## Criterios de aceptación

1. **Ningún sprite que no deba tocar la senda corta el pasillo** (media anchura de la senda + margen de ~0,4).
   - Cuenta para la cubierta, las matas, las piedras, la labranza, los arbolillos, el relleno de rocas y las masas (árboles, picos), y vale en la unión entre casillas y en las diagonales.
   - Se mide con un campo nuevo del informe de la escena (`spritesSobreSenda`, o como se llame) que vale 0 en las semillas 1, 3 y 7 y en alguna más.
   - Un test lo vigila y se ve en rojo al romper el filtro.
2. **Excepciones explícitas**: barreras, caras de roca, agua y objetos horneados (ciudad, pueblo, nodo, mina) pueden tocar el camino donde el mapa lo exige. Por ejemplo, un camino que entra en una ciudad o pasa junto a un acantilado.
3. **Arcén pintado** bajo la senda: ancho como el pasillo, con borde suave, en el color del suelo. No debe leerse como una mancha ni como una carretera ancha.
4. **El camino se lee de punta a punta** en el taller, a 48 y a 110 px por casilla, y en el juego, en el zoom máximo y al tope de alejar.
   - Hay capturas de antes y después de las semillas 1, 3 y 7, recortadas sobre tramos con labranza, matas y bosque.
5. **El mapa no queda pelado.** La densidad de cubierta fuera del pasillo es la de hoy, y se publica la cifra de suelo desnudo del informe, antes y después. Si quitar la regla del 55 % deja montañas peladas al sur de los pasos, se mantiene la regla y se dice.
6. **Cliente, espectador, Worker del suelo y taller pintan lo mismo**: es la misma `componer`/`pintarSuelo`.
7. `pnpm verify`, `pnpm banco` con el ancla igual (`1b90bfd9…`, solo cliente), `pnpm qa` y `pnpm capturas` en verde.
   - Los fps al tope de alejar no empeoran.
   - Los tests que fijan la escena de una semilla se re-anclan **solo después de mirar las capturas**.
8. Se actualizan `CLAUDE.md` («Mapa de aventura», una línea) y `docs/historia.md`.

## Fuera de alcance

- Arte nuevo de senda o de arcén.
- Cambiar qué casillas son camino (`map.roads`, el núcleo).
- La nitidez del mapa, ya cerrada (#148 para dpr ≥ 1,25).

## Preguntas abiertas (con la suposición por defecto)

- **Color del arcén.** Por defecto, el color medio de `dirt` o de la textura del suelo de la casilla, con poca opacidad. Lo decide el arquitecto mirando capturas.
- **Si un objeto horneado (pueblo, mina) se come el camino.** Por defecto se deja: es una excepción.

## Decisiones del usuario en el punto de control del plan (05-10-2026)

- **`MARGEN_DE_SENDA` = 0,3** para lo bajo (cubierta, matas, piedras, labranza, rocas de relleno). Sustituye al ~0,4 inicial, porque con 0,4 el suelo desnudo subía al ~33 %. Se ajusta a ojo con capturas.
- **`MARGEN_DE_MASA` = 0,2** para árboles y picos: es lo probado en el prototipo.
- **Encoger antes que quitar**: lo que pisa el pasillo sale más bajo y se quita solo por debajo del 40 % de su alto (0,3 casillas en una masa).
- El criterio 1 se lee con esos márgenes. El criterio 5 se cumple si ninguna barrera se queda sin formación y si el suelo desnudo fuera del pasillo sube como mucho lo que da el prototipo, publicado antes y después.
