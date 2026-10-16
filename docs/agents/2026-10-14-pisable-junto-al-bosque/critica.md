**REENCUADRADA**: el problema es real y el plan va bien encaminado. Hay tres cosas que corregir: una de las tres causas está mal descrita, el criterio 1 se queda corto (deja vivo el anillo que causa el problema) y el criterio 3 no define qué es «tapar».

## El problema real

Sobre lo que se pisa se pintan árboles de la misma especie, el mismo alto y la misma densidad que la barrera de bosque, y el suelo bajo el bosque es igual que el pisable. Quien juega no tiene ninguna señal para distinguir uno de otro.

## La premisa, afirmación por afirmación

Medido con `componer` sobre `newGame` (helper `partidaDe`), en un test de un solo uso que ya he borrado.

- **Causa 1, `lindeDeBosque`: cierta.** Está en `colocar.ts:3445-3459`. Rodea a radio √5 **toda** franja `forest`, incluidas las de `uso: 'obstaculo'` (`analizar.ts:190`), aunque el comentario dice «de frontera» (`colocar.ts:3443`). Con mancha, el radio es 0,24 × 0,85 = 0,204 (`:3478`, `CUBIERTA.grass.radio` en `:771`). En el linde, los árboles salen con p 0,75 (`:3496`) y miden de 0,55 a 0,90 (`:3512`). Las hojas son las mismas de la masa: `ARBOLES_DEL_SUELO` (`:785`) frente a `hojaDeMasa` (`:550-555`).
  - En s1 hay 1 681 árboles de cubierta de más de 0,6 sobre lo pisable.
  - Por distancia de Chebyshev al bosque: 1 049 a 1 casilla, 499 a 2 y 133 a 3 o más. En s2, 945 / 491 / 54; en s9, 291 / 117 / 0.
- **Causa 2, «el ancla de la masa sale ~0,25 de su franja»: falsa.** En `colocar.ts:2618-2620`, `round(x − 0,5)` es `floor(x)` salvo en el medio punto exacto, así que la segunda condición repite `dentro.has(i)`.
  - Masa con el pie en una casilla pisable: **0** en s1, 2, 5, 9 y 13.
  - Lo que tapa es **el ancho de la imagen**. En la marca, el frondoso de 1,23 tiene el ancla en (1,95; 23,81), dentro del bosque, y su caja llega a x = 2,87.
  - Desbordes laterales dentro de su fila hacia una casilla pisable, de más de 0,25 casillas: en el bosque, 248 en s1, 173 en s2 y 133 en s9; en la montaña, 70, 29 y 82.
  - En la montaña, los de más de 0,5 son 37 en s1 y 59 en s13, con hasta 1,42 casillas. Casi todos son picos de 0,6 a 1,3; solo unos pocos son cumbres de 2,5.
  - El arreglo cae de lleno en `obstaculos`: hoy no lleva lo pisable (`colocar.ts:2137-2144`).
- **Causa 3, el mismo suelo bajo el bosque: cierta.** `sueloQueSePinta` (`bordes.ts:79-85`) le da a la barrera el suelo de su meseta. Ni el pintor ni las fronteras miran `'forest'`: la única referencia está en `colocar.ts`.
- **«El 42 % de lo pisable toca un bosque»: cierta.** En s1 son 483 de 1 136 (43 %). Las cifras no coinciden del todo con el enunciado, que da 473 de 1 124. De las 42 franjas de bosque de s1, 22 son obstáculo y 12 tienen 3 casillas o menos.
- **Las marcas: ciertas.** En (2,23), terreno `grass`, se pintan árboles de cubierta de 0,79 a 0,85 con el ancla en su casilla. La tapan, además, masas ancladas en las columnas 1 y 3.
- **El umbral de alto no sirve para distinguir.** La masa de bosque mide 0,51-0,70 en el p10 y ~1,03 en el p50; el árbol decorativo, de 0,55 a 0,90. Un pino de 0,58 junto al bosque se lee como bosque igual que uno de 0,8.

## El día después

- **Para quien juega**: por fin se distingue el pasillo del bosque. Sin la causa 3, al alejar sería peor. En el tope de alejar el presupuesto de píxeles aclara los volúmenes (CLAUDE.md, «presupuesto de píxeles según el zoom»), así que el tono del suelo es la única señal que queda: el criterio 4 no es un adorno.
- **Qué se pierde**: lo que perseguía `lindeDeBosque`, que el bosque «ocupe la región como en la referencia y no sea una tira» (`colocar.ts:3443-3444`; viene del primer escenógrafo, `d0d97067`, y no hay más historia en `docs/historia.md`). Sin él, la frontera de bosque será una franja fina, porque eso es lo que dice el mapa.
  - Contradice una decisión anterior del núcleo, que perdía con esto: la mancha de obstáculo no toca la frontera «así un obstáculo se reconoce desde fuera» (`docs/historia.md:1583-1585`). El halo deshacía justo eso.
- **Lo que sube y nadie mide**: el suelo desnudo (`sueloDesnudo`, `pintar.ts:1026`). El usuario ya rechazó una vez un cambio por él: 0,3 y no 0,4, porque lo desnudo pasaba del 13 al 33 % en s1 (`docs/historia.md:1866`). Hay que medirlo antes y después y decírselo; aquí no es un veto.
- **Lo que hay que borrar**:
  - Si la tierra se queda sin árboles, `ARBOLES_DEL_SUELO.dirt` (`colocar.ts:787`), porque la tierra solo los lleva en el linde (`:3501-3503`).
  - Las hojas de árbol que lea `hojasDeLaCubierta` (`:792`) para `cubiertaDeOtroNivel`.
  - Si el linde desaparece, la rama `lindeDeBosque` de `enMancha` (`:3462`).
- **Cambia la corriente de azar de toda la cubierta.** Se moverán medidas del taller y cualquier test que fije sprites concretos, como `cubierta.test.ts:122`. El banco no se toca.

## Conflictos

- **`cubierta.test.ts:72-78`** exige que `cubiertaComoLaBarrera` no cuente en la hierba. Solo choca si el arquitecto amplía ese guardia, y no debe hacerlo: el guardia mide la imitación de la roca en suelos `comoLaBarrera` (#184). La regla nueva lleva su propio contador, como ya proponen los criterios.
- **Contrato del CLAUDE.md**: «una figura puede quedar detrás de un árbol» (`fundirPorProfundidad`, #185). Si el criterio 3 midiera la silueta entera, toda masa al sur de una casilla pisable la taparía por perspectiva: 312 casos de más de 0,25 en el bosque de s1. Habría que encoger el borde de todo bosque y de las cumbres (#204, que miden 2,5-3 por diseño). Hay que medirlo **por los lados, en la fila del pie**.
- **Ramas y worktrees**: no hay cambios sin commit en `escenario/` en ningún worktree. Solo `rios-lineas` (6 días) toca dos ficheros del escenario. #222 y #228 tocan `colocar.ts` en paredes y rampas, otra zona, así que no hay solapamiento.
- **Esta misma rama** lleva sin commit la vista de regiones de desarrollo. Conviene commitearla aparte antes de empezar, para que el diff de esta tarea se pueda revisar sola.

## Coste contra valor

El coste es moderado y está todo en el cliente. Lo caro es el criterio 4: una máscara de bosque hacia el Worker del pintor, que hay que medir. Lo demás es quitar código y meter lo pisable en `obstaculos`, maquinaria que ya existe.

No hacerlo nunca deja el mapa ilegible justo en lo que decide el juego, por dónde se pasa. El valor supera con mucho el coste.

## Qué le cambiaría a `requisitos.md`

En **Diagnóstico**, causa 2, sustituir por:

> 2. **La masa se pasa por el ancho de su imagen, no por su ancla.** El ancla siempre cae dentro de la franja (0 masas con el pie en lo pisable en s1, 2, 5, 9 y 13). Su caja desborda hacia la casilla pisable de al lado: más de 0,25 en 248 piezas de bosque y 70 de montaña en s1. En la marca, un frondoso de 1,23 con el ancla en x = 1,95, dentro del bosque, llega a x = 2,87. `obstaculos` (~2137) no lleva lo pisable.

Criterio 1, sustituir por:

> 1. **Ningún árbol de las hojas de la masa sobre lo pisable cerca de un bosque, a ningún alto.** Ninguna pieza de cubierta con hoja de `pinos`, `frondosos`, `abetos-nevados` o `muertos` tiene el pie en una casilla pisable a Chebyshev ≤ 2 de una casilla `forest`, sea de frontera o de obstáculo. El alto no vale para distinguir: la masa de bosque mide desde 0,51 en el p10. El arquitecto decide si se extiende a toda la hierba y la tierra. Hoy hay 133 / 54 / 0 árboles a 3 o más en s1 / s2 / s9: se puede extender y es lo coherente, porque un bosquecillo decorativo es lo mismo que una mancha de obstáculo. Se mide con `informe.arbolesSobreLoPisable` = 0 en 1-40, con un contador propio y no ampliando `cubiertaComoLaBarrera`.

Criterio 3, añadir al final:

> «Tapar» se mide **por los lados, en la fila del pie** de la pieza: lo que su caja entra en la casilla pisable al este u oeste de la suya. La silueta que sube hacia el norte es perspectiva y queda permitida («una figura puede quedar detrás de un árbol», #185). En la montaña, las cumbres de #204 conservan su tamaño. Si alguna no cabe, va como techo declarado, no se encoge.

En **Criterios**, añadir:

> 9. **El suelo desnudo se mide** antes y después (`sueloDesnudo`, taller, s1, 3 y 7) y se reporta. Si sube más de 5 puntos se le enseña al usuario antes de cerrar.
> 10. **Lo que queda muerto se borra**: la rama `lindeDeBosque` de `enMancha`, `ARBOLES_DEL_SUELO.dirt` si la tierra se queda sin árboles, y lo que `hojasDeLaCubierta` deje de poder ver.
