**REENCUADRADA**: el problema es real, pero el criterio 3 parte de una premisa que falla en 3 de cada 4 ciudades, la ciudad-puente (1 de cada 5) no aparece en los requisitos y «2,4 casillas + misma escala + torres en las esquinas + varias casas» no cabe junto. El tamaño y por dónde se entra los tiene que decidir el usuario, con una imagen, antes del plan.

Medido el 20-10-2026 en las semillas 1-40 (217 ciudades) con `newGame` + `analizar`, y en la 1-10 con `componer`. Los scripts están en el scratchpad de la sesión: `ciudades.mts`, `rumbos.mts`, `sur.mts` y `puente.mts`. Las líneas de `colocar.ts` son de hoy, y se mueven porque la labranza la está editando.

## El problema real

La ciudad se pinta como una maqueta entera a otra escala (casas de ~0,1 casillas dentro de una pieza de 2,4) y no casa con lo que la rodea. El pueblo sí casa porque sus casas tienen la escala del mapa. Recomponerla con piezas a escala ataca justo eso, así que la solución es la adecuada en lo esencial. Lo que falla es la geometría que da por hecha.

## La premisa, afirmación por afirmación

- Hoja `ciudades`, 8 variantes, `varianteDeId`, 2,4 de ancho (`colocar.ts:1499-1510`): **cierto**. Lo único que lee la hoja es ese sitio y `tools/taller/escenario/modulos.ts:200` (y dos tests). Medidas hoy: 2,40 × 2,24 casillas de media.
- Pueblo a 1,9: **cierto**. Sus casas, medidas sobre la hoja `casas` ya derivada (13 módulos, sin commitear), por su pueblo a 1,9: **0,55-0,85 de ancho (media 0,69) y 0,57-0,90 de alto (media 0,72)**. Ojo: el plan de la labranza las pone a `ALTO_DE_CASA` 0,5 (≈0,5 de ancho), que es más pequeño que el pueblo.
- «`muralla.ts` ya pinta `muro-ancho-*`, `muro-hondo-*`, `nodo-torre`»: **falso**. Esas piezas solo las usa el taller (`tools/taller/mapa.ts:29`, `test/taller-mapa-denso.test.ts:109`). La escena pinta la hoja `muro`, `muro-ns-1/2` y `nodo-puerta-ancho/hondo`. Sus tamaños en el mapa:
  - tramo horizontal: 1,25 × 0,55, uno por casilla de paso (`colocar.ts:1136`, `:3203`);
  - torre: 1,4 de alto y 0,78-0,89 de ancho (`torreEn`, `:3129`);
  - tramo norte-sur: 1,6 × 0,58;
  - puerta: el ancho de un nodo, 1,7 × 1,16 (`:1501`).
- «A una ciudad se entra por la casilla de debajo y la senda llega por ahí» (criterio 3): **falso en la mayoría**. `puertasDe` solo abarata en la búsqueda; el propio `puertas.ts:13-14` dice que el juego no la mira. La ciudad es un nodo entre regiones:
  - **167 de 217 ciudades (77 %) tienen una barrera debajo**: montaña 87, bosque 51, agua 15, acantilado 14. La de la imagen, s15 (12,16), tiene montaña debajo.
  - **170 de 217 no tienen ningún tramo de camino hacia el sur**, y 216 de 217 tienen alguno por otro lado. Hay 508 tramos que salen de una ciudad (1-3 por ciudad): NO 106, SE 102, SO 92, NE 80, S 47, N 30, E 27, O 24.
  - **El 75 % sale en diagonal, es decir, justo por donde irían las torres de las esquinas** de un recinto cuadrado.
- Ciudades-puente (#144, `sitioDe`, `Analisis.ciudadesPuente`): **43 de 217 (20 %)**. Se pintan en su orilla, con el río y el puente en su casilla. Los requisitos no las nombran.
- «No se añade más desborde del que hay»: hoy, de las 8 vecinas de una ciudad, el 58 % son barrera (1012 de 1733). Hoy la pieza es opaca y tapa lo que hay debajo: en 1-10, 164 pies de masa, 17 paredes y 14 rocas caen dentro de su caja. Un recinto con calles deja ver ese suelo: agua en las 43 ciudades con río al lado, y un acantilado cruzando el recinto en 9 de 51 ciudades (18 %) con otro nivel en sus 8 vecinas.

## Si cabe (lo que preguntó el coordinador)

Las torres van sobre la rejilla, centradas en casillas, como las de `muralla.ts`. Hay dos tamaños posibles:

| Lado entre torres | Ancho total | Hueco libre por dentro | Casas que se ven | Contra `seApilan` |
|---|---|---|---|---|
| 2 (las 8 vecinas) | 2,83 (+18 %) | 1,17 de ancho, ~1,3 de fondo útil | 1 por fila (2 solo con las más estrechas, 0,55) y 2 filas. La puerta (1,7 × 1,16) ocupa el lado sur entero y tapa la fila de delante, así que se ven **1-3 casas**: menos que un pueblo | **viola**: dos torres en la misma columna a 2 filas se apilan (`muralla.ts:44`; defecto 4 de la auditoría 4) |
| 4 (5×5) | 4,83 (×2) | 3,2 | 6-8 | cumple |

- **Con lado 2**: el pie del lado sur cae en la fila de debajo (y + 1,25) y las torres del norte suben hasta y − 2,15. Hoy la pieza va de y + 0,85 a y − 1,39, así que sale ~0,75 más alto y 0,4 más abajo.
- **Con lado 4**: tapa los 1-3 caminos de cada ciudad. Hay un objeto a Chebyshev ≤ 2 en 5 ciudades (4 minas y un recurso) y a 3 en 210 casos (70 de ellos minas). Además cambia la huella, que `alrededorDeMurallas` usa como apoyo de las murallas del mapa (`colocar.ts:2686-2700`), y la reserva (`RADIO_DE_OBJETO.town` 1,5, `:1235`).

Conclusión: **a 2,4 casillas y a la escala del mapa no hay ciudad con varias casas**. O el recinto mide cerca del doble, o la muralla va a menor escala, que es la segunda pregunta abierta. Esto lo decide el usuario, no el arquitecto.

## ¿Se confunde con la barrera `wall`?

- Desde la cámara, lo que domina es el lado sur: torre, tramo, puerta, tramo, torre. Es la misma forma que una muralla del mapa (3,74 casillas de media, máximo 6, con su puerta en medio). Lo que distingue el recinto es el suelo y las casas de dentro, y con lado 2 de eso se ve poco.
- `nodo-puerta-ancho` es la pieza **del nodo de muro, el que se asalta y lleva bandera de nodo** (`nodos.ts:29`). Usarla como puerta de la ciudad mezcla las dos cosas.
- Ponerse al lado no es el riesgo: hay muro a Chebyshev ≤ 2 en solo 2 de 217 ciudades, porque el generador ya lo impide (`juntoACiudad`, `core/map/murallas.ts:189`). El riesgo es de **significado**: un lienzo por donde pasa un camino dice «no se pasa», y eso le pasa a 216 de 217 ciudades con una sola puerta al sur.

## Qué cuelga hoy de la pieza

- **Un solo sprite con `objeto`.** Lo dan por hecho:
  - la reserva (`sprites.find`, `colocar.ts:1546`) y `reservaDe`, que mide con `vaDelante(…, objeto)`;
  - la puerta de muralla (`:3055`);
  - `claveDeObjeto` (`superficie.ts:320`), donde gana el último;
  - `tapaUnObjeto` (`:2998`), que pone una caja por sprite.
- **Cubrir.** `cubrir` y `claveDeFigura` (`superficie.ts:418-450`) ponen delante de lo horneado a la figura que está en una casilla tapada. Con más superficie, hay más héroes pintados encima del recinto. Si las casas o los muros van sin `objeto`, pasan a ocultar figuras.
- **Niebla.** Todo sprite con `objeto` sigue la niebla de la casilla de la ciudad (`superficie.ts:315`, `pintar.ts:134`). Lo que vaya sin `objeto` sigue la de su fila, y el recinto se puede ver a medias.
- **`llegaA`** (`colocar.ts:5750`) compara la casilla del pie del sprite con la de abajo de la bajada. Una bajada al recinto solo encuentra lo que tenga el pie en la casilla de la ciudad, y la puerta sur no la tiene.
- **Lo que no se rompe.** El asiento de la marca es el centro de la casilla (`superficie.ts:283`) y no depende del sprite. El clic va por casilla (`aventura.ts:244`), salvo en la orilla de una ciudad-puente; un recinto más ancho manda los clics de sus muros a las casillas vecinas, como hoy pasa con los bordes.
- **Guardias.** Si los muros del recinto entran por la maquinaria de `muralla.ts`, los cuentan `torresApiladas`, `murallasPartidas` (sus fugas) y `murallaIncoherente`, que son reglas de una línea de barrera. Si no entran, no los mide nadie. El criterio 8 no dice cuál de las dos.

## El día después

- **Para quien juega**: cada ciudad a la escala del mapa, que es lo que se pidió.
- **Cierra**: deja de valer la regla de que lo horneado es una ficha de una pieza, y crece la huella de la ciudad, con lo que se mueven #222 y `carasCortadas` (`test/caras-cortadas.test.ts`, `QUEDAN`).
- **Hay que borrar**: la hoja `ciudades` (8 webp, json, procedencia), su entrada en `tools/taller/escenario/modulos.ts:200` y las dos referencias de los tests. Nadie más la lee; si no se borra en esta misma tarea, se queda como arte muerto.
- **Con `CLAUDE.md`** no choca nada, pero `seApilan` es una regla con su porqué y el lado 2 la viola.

## Conflictos

- **Con la labranza** (dependencia declarada): la hoja `casas` ya existe en el worktree, con 13 casas. Tocan el mismo `colocar.ts`, así que esto va después de que se fusione. Hay que fijar la escala de casa del pueblo (0,69 de ancho de media) y no reutilizar `ALTO_DE_CASA` de la labranza.
- **Con #222**: bordes de meseta junto a ciudades. Comparten zona, y conviene no medir `carasCortadas` antes de decidir la huella.
- **Con #144 y #188**: no se contradicen si no se toca el núcleo. Forzar que los caminos entren por el sur sería cambiar el trazado, con el banco y `rectitud` en juego, y está fuera de alcance.

## Coste contra valor

Vale la pena: es una queja visual directa del usuario y sobre el objeto más importante del mapa. Pero es mayor de lo que dice el texto: hay caminos por 2-3 lados, un 20 % de ciudades-puente, un suelo sin limpiar bajo un recinto con calles y varios sprites por objeto. No hacer nada deja la maqueta, que funciona. Lo que **no** debería hacerse:
- mover el núcleo para que los caminos entren por el sur;
- usar `nodo-puerta-ancho` como puerta de la ciudad sin que el usuario lo vea;
- dar por buena una ciudad de 1-3 casas visibles porque «cabe en 2,4».

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Criterio 3 (sustituye)**: la senda que llega a la ciudad entra en el recinto por una abertura, venga de donde venga (hoy, en 1-40, el 75 % de los tramos llega en diagonal y 170 de 217 ciudades no tienen ningún camino por el sur; la casilla de debajo es barrera en el 77 %). Ninguna senda pasa bajo un tramo o una torre del recinto.
>
> **Criterio 2 (añadir)**: «la escala del pueblo» es la de sus casas en la hoja `pueblos` a 1,9: 0,55-0,85 de ancho y 0,57-0,90 de alto. No es el `ALTO_DE_CASA` de la labranza.
>
> **Nuevo, ciudad-puente (#144, 43 de 217)**: el recinto va en su orilla (`sitioDe`) y se entra desde el puente.
>
> **Nuevo, lo de debajo**: lo que se ve entre las casas es suelo de la ciudad. Ni agua, ni la cara de un acantilado, ni masa de las barreras que el recinto pisa.
>
> **Criterio 8 (precisar)**: si los muros del recinto cuentan o no en `torresApiladas`, `murallasPartidas` y `murallaIncoherente`, y por qué.
>
> **Pregunta abierta 1 (sustituye; se decide con el usuario antes del plan)**: a la escala del mapa, un recinto de lado 2 (2,8 casillas) deja ver 1-3 casas, y sus torres de esquina se apilan según `seApilan`. Uno de lado 4 (4,8 casillas) admite 6-8 casas, pero tapa los caminos y la huella de 5×5. Se le enseñan las dos cosas, y una muralla a menor escala, como imagen del taller, y elige.
>
> **Pregunta abierta (nueva)**: la puerta del recinto, ¿la de `nodo-puerta-ancho`, que es la del nodo de muro que se asalta, u otra cosa? Si hace falta arte, se pide.
>
> **Fuera de alcance (añadir)**: tocar el trazado de los caminos o las puertas del núcleo para que los caminos entren por el sur.
>
> **Al cerrar**: se borran la hoja `ciudades` y su entrada en el taller.
