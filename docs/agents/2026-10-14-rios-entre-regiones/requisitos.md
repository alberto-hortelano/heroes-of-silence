# Requisitos: ríos que separan regiones

## Petición literal

> Adelante, y usa tambien rios para separar regiones que ahora solo hay lagos

La dijo el usuario el 14-10-2026, al aprobar el plan de la tarea `2026-10-14-pisable-junto-al-bosque`, la de que se vea por dónde se pasa. Las dos tareas van en paralelo en la misma rama (`claude/regions-map-view-b13f86`).

## Lo que se entiende

Medido por la crítica en las semillas 1-40.

**El agua de frontera ya es estrecha**: ancho 2 en el 54 % de sus casillas y 3 en el 30 %.

**Lo que la hace lago es que es corta.** Cada frontera de agua es la de una sola pareja de regiones (unas 20 casillas, unas 9 de largo) y su puente la parte. Donde coinciden tres regiones sale una charca: hay 56 en 1-40. De los 230 sistemas de agua de frontera (agua más puentes), la mediana mide 8 de largo y solo 25 son alargados (largo²/casillas ≥ 6).

**Un río pide varias fronteras de agua seguidas** a lo largo de una línea, sin el tercer brazo en los cruces. Y, por decisión del usuario, **también más estrecho**.

**Decisiones del usuario (14-10-2026, tras la crítica):**
- Las dos cosas: encadenar fronteras de agua en ríos largos **y** ríos de **1 casilla** de ancho donde quepa. Esto último exige abrir para el agua la excepción de los tres pasos del paso 7d (hoy solo la tiene el acantilado) y revisar el pintor del agua para un río de una casilla.
- El orden: uno tras otro. Mientras se cierra la tarea del bosque, se planifica esta; se implementa después, en esta misma rama.

## Antecedentes que hay que leer

Pueden chocar con la petición:

- **Issue #144**, «Ríos como líneas en el generador» (abierta). Viene de `docs/art/peticiones.md` §11, petición 3: «una frontera de agua es una franja de 2-3 casillas que el escenógrafo pinta como río encajado. Si el generador trazara los ríos como líneas que bajan de nivel (con cascada donde cambian), la red seguiría igual y el río tendría curso».
- **La rama local `rios-lineas`**, commit 70df803d: «Los ríos tienen curso: el agua baja por el eje de su franja, de un manantial al borde o a un lago, con cascada donde cambia de nivel (#144)». **El usuario la aparcó el 08-10-2026**: «estaba mejor antes, la volvemos a mirar al final». Hay que averiguar qué no le gustó y no repetirlo.
- En `CLAUDE.md`, el agua del relieve es «plana y sin encajar» (#210): ninguna franja de agua va por encima de la región más baja que toca, y no hay cañones. La muralla también convierte franjas en «sierra o río» (#232).

**Corrección del usuario al plan (14-10-2026), literal:**

> Adelante pero el rio no vale con que tenga una longitud de x, tiene que desembocar en el mar, si hay agua alrededor, o salir por el borde da la pantalla, los rios pueden cruzar lagos, de hecho es recomendable

Qué cambia:
- **Un río es un curso, no un largo.** Su boca desemboca en el mar (si el mapa tiene agua grande alrededor, en su borde) o sale por el borde del mapa. Un tramo de agua largo que muere en medio del mapa sin boca **no es un río**. El largo mínimo deja de ser el criterio que manda: queda como medida.
- **Los ríos pueden cruzar lagos, y es recomendable.** Un lago en el curso, como un ensanche del agua en un cruce de regiones o una charca que el río atraviesa entrando por un lado y saliendo por otro, es deseable. Las charcas de cruce que forman parte de un río dejan de contar como defecto; solo cuentan las sueltas.
- **El nacimiento puede estar dentro del mapa** (un manantial o un lago). Sigue siendo plano: sin cascadas ni escalones.

**Decisiones tras el plan revisado (14-10-2026):**
- **La ciudad del cruce hace de vado.** El generador pone una ciudad en cada cruce de tres regiones, así que el río se interrumpe en ella como en un puente. El usuario lo acepta. Si en las capturas no se lee como un río, el dibujo de la ciudad se retoca en otra tarea.
- **No hay mar en el generador.** La boca es el borde del mapa. El mar va aparte, en la issue alberto-hortelano/heroes-of-silence#267.
- **El plan aprobado es el revisado** (`plan.md`): dos commits, (1) ríos con boca y lagos en el curso, y (2) adelgazar a una casilla. Capturas entre los dos.

**Veredicto del usuario sobre los pasos 2 y 2b (16-10-2026), literal:**

> No se ve como rio, se ven zonas de agua dispersas pero un rio es algo continuo.

Qué cambia:
- **Un río es una línea de agua continua**, desde su nacimiento (dentro del mapa, en un lago o un manantial) o desde un borde, hasta su boca en un borde. No vale que el agua se corte en cada cruce de regiones aunque la ciudad haga de vado: la decisión «la ciudad del cruce hace de vado» **queda revocada por el resultado**. El agua solo se cruza por encima: un puente (nodo de agua) o, si hay ciudad, una ciudad en la orilla con su puente.
- **Ni remiendos de montaña ni el engorde** pueden partir el río: si algo lo corta, no es un río.
- **El ancho** sigue siendo de una casilla donde se vea (y dos bajo la cara de una meseta), pero la continuidad manda sobre el ancho.
- **Los lagos** en el curso siguen siendo bienvenidos. El agua suelta que no es del río (lagos entre dos regiones, de obstáculo) no puede competir con él a la vista.
- El código de los pasos 2 y 2b queda en un commit WIP (7086f012). Se reaprovecha lo que sirva.

## Criterios de aceptación

Son provisionales: los cierra el plan y el usuario los aprueba.

1. **Ríos con boca.** Todo río sale por el borde del mapa o desemboca en el mar, y la mayoría de los mapas con agua tienen uno (el plan fija la cifra). Su curso puede atravesar uno o más lagos, y el plan lo favorece. Se miden: mapas con río, ríos con boca (100 %), lagos atravesados por río, largo y charcas sueltas (las que no son de un río), que bajan de las de hoy. Los lagos de obstáculo siguen como están.
2. **Ríos estrechos.** Donde quepa, el río mide 1 casilla de ancho. El plan fija dónde, con qué proporción y cómo se relaja el paso 7d solo para el agua sin romper lo que protege: ni dos regiones a dos pasos sin barrera en medio, ni espigas, ni sendas cruzando en diagonal una esquina de agua. El escenario pinta bien un río de una casilla: orilla, barro y espuma no se lo comen, y el puente tiene sus dos orillas. Se mide el ancho local antes y después.
3. **La red no cambia de reglas.** El río es barrera `water` y se cruza por su nodo, con puente. Los guardias del generador siguen en verde: espigas, esquinas de agua, sendas sobre agua y puentes con dos orillas. `npx tsx tools/qa/rectitud.ts` queda dentro de sus techos y `TIPOS_POR_MAPA` se cumple con sus casillas. El agua sigue plana (#210): sin nivel por tramos ni cascadas, que es lo que se rechazó en `rios-lineas`.
4. **Se ve como un río** en el escenario. Lo comprueban capturas antes y después que se enseñan al usuario **antes de cerrar**. Fusionar o no lo decide él, porque ya rechazó una versión.
5. **Las medidas del juego, en 1-100:** duración, j0 y 0 sin terminar. `pnpm banco` se re-ancla a propósito y se juzga la forma del diff.
6. **Orden.** El cambio del generador entra en la rama cuando `2026-10-14-pisable-junto-al-bosque` esté cerrada, porque mueve la semilla 1 de sus marcas y de su test. Al cerrar, #144 se cierra apuntando aquí y `rios-lineas` se queda sin fusionar.

## Fuera de alcance

- Lo que hace la otra tarea: la cubierta, la masa y el sotobosque en `src/client/render/escenario/colocar.ts` y el pintor del suelo. Si los ríos necesitan tocar el pintor del agua, se coordina.
- Arte nuevo con Codex o fal.ai.
- Los planes del agente (`MapPlan`): no cambian.

## Contexto

- **Presupuesto de pruebas** (máquina compartida):
  - Mientras se itera, solo el test de lo que se toca.
  - `pnpm verify`, una vez por tanda de cambios.
  - `verify:lento`, `capturas`, `banco` y `rectitud`, una vez al cerrar.
  - Medidas en 1-40 o 1-100 semillas.
- **Procesos:** ningún `pkill`/`killall`. El puerto 3100 no es nuestro.
- **El usuario juzga el mapa a ojo** y quiere ver capturas de antes y después de un cambio visual grande antes de fusionarlo.

## Preguntas abiertas y su suposición por defecto

- **¿Todos los bordes de agua pasan a río, o una mezcla de ríos y lagos?** Por defecto, una mezcla: el lago sigue existiendo.
- **¿El río tiene curso, de un manantial al borde o a un lago?** No: ni nivel por tramos ni cascadas.

**Decisiones del usuario sobre el plan del río continuo (16-10-2026)**, opción (a) del arquitecto, «el río primero»:
- **La ciudad del cruce que toca el río es una ciudad-puente**: va en la casilla de río recto junto a la T, une sus tres regiones como hoy y se pinta en la orilla con su puente. El río no se corta.
- **Las tres formas por igual**: frontera (entre las dos bases), esquina y lago, a 1:1:1, con los pesos en datos.
- **Aspecto, las tres cosas**: la ciénaga que toca el río va al nivel 1; fuera del río solo hay agua de frontera donde la pareja no admite otra barrera; el río es agua aunque sus suelos no la admitan.

**Tras las capturas del paso 1 del río continuo (16-10-2026):**
- El usuario da el río por leído y pide seguir con el paso 2: la ciudad-puente en su orilla, con su puente.
- El techo de `ramales-de-minas` (31 > 25) se vuelve a medir sobre los mapas nuevos (lo medido + 1, como el anterior) y se apunta el porqué: el veto de las esquinas del río y los vestidos que se tiran por él.

**Tras las capturas del paso 2 (16-10-2026):**
- Una ciudad pintada en una casilla lleva a la ciudad al pulsarla, también cuando su orilla es una casilla que se pisa (14 de 121 en 1-100).
- Se aceptan los dos casos nuevos de `caras-cortadas` (s14, junto a una ciudad-puente, y s26, por el azar desplazado), con su porqué en la lista.

**Tras el QA del río continuo (16-10-2026, `qa.md`):**
- **El río no pasa por debajo de una base**: el trazado aparta las bases como ya aparta la caja de casa. Arregla H1 (pulsar al propio héroe lo metía en su castillo en s7 y s30) por su causa.
- **Fuera del río no queda agua azul de frontera**: donde una pareja que no es del río solo admite agua, el generador pone otra barrera aunque sus suelos no la pidan (o cambia el reparto). Fuera del río solo quedan las charcas turbias (H3, s83, s66).
- Los menores (H4 sendas sobre charcas en s52/s93/s100, H5 héroe sobre los tejados en s13, H6 la casilla de barrera sin formación de s41) se arreglan.

**Tras la vuelta de QA 1 (16-10-2026):**
- Se acepta la ciénaga al 10 % de las regiones como suelo del guardia de `desniveles` (10,7 % en 1-200): sin agua fuera del río sus fronteras pasan a acantilado o montaña y se tiran más vestidos con ciénaga.
- **El río de la forma lago mide al menos 20 casillas del lago al borde**; si no cabe, se coge otra forma (en s83 eran 7 y se leía como dos lagos; 9 de 28 en 1-100).
