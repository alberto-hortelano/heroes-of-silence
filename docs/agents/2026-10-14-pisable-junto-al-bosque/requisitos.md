# Requisitos: que se vea por dónde se pasa y por dónde no

## Petición literal

> No se aprecia por donde se puede caminar y por donde no. He creado dos marcas con ejemplos casi identicos y por uno se puede caminar y por el otro no. Analiza las regiones y las uniones entre estas y asegurate de que se vea claramente por donde no se puede pasar y por donde si.

Las dos marcas son de la semilla 1. Están en `docs/revision/marcas/` del worktree, que git ignora:

| Marca | Casilla | Terreno | Nota |
|---|---|---|---|
| `20261014-150745-s1-2-23` | (2,23) | hierba, región 7 | «Por aqui se puede caminar» |
| `20261014-150800-s1-1-23` | (1,23) | bosque (barrera) | «Por aqui no se puede caminar» |

En los dos recortes se ve lo mismo: árboles de punta a punta.

## Decisión del usuario

Le pregunté qué capas quería y eligió **solo el escenario**. Las otras dos opciones las descartó:

- el aviso al pasar el ratón por una barrera (marco rojo, cursor de prohibido, frase en la barra);
- un interruptor «ver lo pisable» para quien juega.

Aprobó el plan de `/home/al/.claude/plans/no-se-aprecia-por-jiggly-fountain.md`, que es la base de este documento.

## Diagnóstico

Viene de la exploración del coordinador y conviene verificarlo, no darlo por bueno. Las líneas son aproximadas.

- Hay tres causas en `src/client/render/escenario/colocar.ts`:
  1. **`lindeDeBosque`** (paso 5 de la cubierta, ~3443-3459). Toda casilla pisable a ≤ √5 de un bosque, de frontera o de obstáculo, va «en mancha». Eso significa radio 0,204 (el propio bosque usa 0,32) y árbol con p = 0,75, de 0,55-0,90 de alto, con sombra. Las hojas son pinos o frondosos (`ARBOLES_DEL_SUELO` ~785), las mismas que la masa (`hojaDeMasa` ~550). Se pasa de `UMBRAL_DE_VOLUMEN` (0,6), así que esos árboles se pintan como volúmenes.
  2. **La masa se pasa por el ancho de su imagen, no por su ancla** (corregido por la crítica). El ancla siempre cae dentro de la franja: 0 masas con el pie en lo pisable en s1, 2, 5, 9 y 13. Lo que desborda es su caja, hacia la casilla pisable de al lado: más de 0,25 en 248 piezas de bosque y 70 de montaña en s1. En la marca, un frondoso de 1,23 con el ancla en x = 1,95, dentro del bosque, llega a x = 2,87. `obstaculos` (~2137) no lleva lo pisable.
  3. **Bajo el bosque se pinta la misma hierba** (`sueloQueSePinta`, `bordes.ts` ~79). Nada marca su huella.
- En s1, (2,23) es un pasillo de una casilla entre dos bosques. El 42 % de lo pisable (473 de 1 124 casillas) toca un bosque en 8 vecinas. Muchos bosques son manchas de obstáculo de 1 a 3 casillas dentro de una región.

## Criterios de aceptación

1. **Ningún árbol sobre lo pisable, a ningún alto** (decisión del usuario, 14-10-2026, tras la crítica). Ninguna pieza de cubierta con hoja de árbol (`pinos`, `frondosos`, `abetos-nevados`, `muertos` o cualquier otra de `ARBOLES`/`ARBOLES_DEL_SUELO`) tiene el pie en una casilla pisable de **ningún** suelo, esté cerca de un bosque o no. La regla visual es «árbol = no se pasa», sin excepciones. Lo pisable lleva solo matas bajas, hierba, flores y rocas. El alto no sirve para distinguir: la masa de bosque mide desde 0,51 en el p10. Se mide con `informe.arbolesSobreLoPisable` = 0 en 1-40, con un contador propio y sin ampliar `cubiertaComoLaBarrera`.
2. **Junto al bosque, la cubierta de lo pisable es clara o rala, sin espesar**: matas bajas, nada de mancha de árboles.
3. **La masa de bosque y la de montaña no tapan lo pisable más de un margen pequeño**, que fija el arquitecto (≈ 0,15-0,25 casillas). La pieza que se pasaría se encoge, cambia de módulo o se quita, con la maquinaria que ya existe (`obstaculos`, `entra`, `poner`, `altoLibre`). Se mide con `informe.masaSobreLoPisable` = 0 en 1-40, o un techo medido y con su razón declarada. **«Tapar» se mide por los lados, en la fila del pie** de la pieza (decisión del usuario): lo que su caja entra en la casilla pisable al este o al oeste de la suya. La silueta que sube hacia el norte es perspectiva y se permite («una figura puede quedar detrás de un árbol», #185). Las cumbres de montaña de #204 conservan su tamaño: si alguna no cabe, va como techo declarado y no se encoge.
4. **La huella del bosque se ve en el suelo** (sotobosque o tono más oscuro bajo sus casillas) y se lee también al alejar al tope. El pintor del suelo no sube de forma apreciable: se mide en el taller, en rondas alternadas, como en #217.
5. **Los pasos siguen leyéndose como pasos.** Cada nodo de bosque y de montaña conserva su hueco en la masa. Siguen a 0 `pasosTapados`, `pasosAtravesados`, `casillasDeBarreraSinFormacion`, `spritesSobreSenda`, `paredesTapadas` y `cubiertaComoLaBarrera`.
6. **Las dos marcas, resueltas.** En la semilla 1, (2,23) se ve pisable y (1,23) se ve bosque, a zoom normal y alejado. Las dos se marcan como resueltas (`pnpm marcas resolver`).
7. **Revisión de las uniones (QA).** En 1-40 se revisan los nodos de bosque y de montaña y las fronteras finas de bosque entre regiones, contrastando con la vista de regiones de desarrollo (tecla `R`). El agua, el acantilado y el muro se revisan solo para confirmar que no tienen este problema. Si alguno lo tiene, va como hallazgo.
8. **Hay un test** con la semilla 1 en (2,23) y (1,23) y un caso sintético de pasillo de una casilla entre dos bosques. Se sigue el patrón de `test/cubierta.test.ts`.

9. **El suelo desnudo se mide** antes y después (`sueloDesnudo`, en el taller, semillas 1, 3 y 7) y se reporta. Si sube más de 5 puntos, se le enseña al usuario antes de cerrar. Hay un precedente: el usuario rechazó una vez un cambio que lo subía del 13 al 33 % (historia.md:1866).
10. **Lo que queda muerto se borra**: `lindeDeBosque` y su rama en `enMancha`, `ARBOLES_DEL_SUELO` si ya no se usa, y lo que `hojasDeLaCubierta` deje de poder ver.

## Fuera de alcance

- El núcleo, la generación del mapa, las reglas de paso, el banco y el agente. Es solo pintura.
- El aviso al pasar el ratón y el interruptor para quien juega (descartados por el usuario).
- Arte nuevo con Codex o fal.ai.

## Contexto

- **La rama es `claude/regions-map-view-b13f86`.** La vista de regiones de desarrollo ya está commiteada aparte (129d337b): `src/client/desarrollo/regiones.ts`, `red.ts`, `herramientas.ts` y su test. No hay que tocarla, pero sirve para contrastar.
- **Veredicto de la crítica: REENCUADRADA** (`critica.md`). El usuario aceptó sus tres cambios: sin árboles en todo lo pisable, la copa limitada por los lados y la vista de regiones commiteada aparte. También van el suelo desnudo medido y el código muerto borrado.
- **El cambio mueve la corriente de azar de toda la cubierta.** Se moverán medidas del taller y tests que fijan sprites (p. ej. `cubierta.test.ts:122`). El banco no se ve afectado.
- **Presupuesto de pruebas** (máquina compartida):
  - Mientras se itera, solo el test de lo que se toca.
  - `pnpm verify`, una vez por tanda de cambios.
  - `verify:lento`, `capturas` y `banco`, una sola vez al cerrar. No se repiten si nada cambió.
  - Medidas en 1-40 semillas.
  - Si `verify:lento` falla solo por «Timeout calling onTaskUpdate», se repite una vez.
- **Procesos:** ningún `pkill`/`killall`. Lo que se arranque se mata por su grupo y se comprueba con `ss` que murió. El puerto 3100 no es nuestro.

## Preguntas abiertas y su suposición por defecto

- ~~¿La regla 1 vale para toda la hierba o solo junto al bosque?~~ Resuelto: vale para todo lo pisable (criterio 1).
- **¿Sotobosque en todo bosque o solo en las manchas finas?** Por defecto, en todo bosque.
