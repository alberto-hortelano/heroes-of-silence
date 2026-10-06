# Requisitos: menos caminos en el mapa (#149)

## Petición literal

Mientras se validaban los caminos despejados (05-10-2026), el usuario vio `docs/agents/2026-10-05-caminos-despejados/capturas-qa/s7-acantilado.jpg` y dijo:

> Dejarlo asi, lo que veo son demasiados caminos, en esa imagen se ve un cuadrado formado por caminos que no aportan nada

Hoy (06-10-2026) eligió seguir con la issue #149: «El generador hace demasiados caminos: cuadrados de caminos que no aportan nada».

## Contexto (del coordinador)

- **Cómo se trazan hoy.** Los caminos salen del núcleo: `trazarCaminos` (`src/core/map/vestir.ts`, ~l.670-800), llamado desde `generate.ts` (~l.1211). Por cada región traza un árbol de Prim que crece desde la red entre sus nodos, y luego una senda desde la red a cada mina y cada pueblo. El docstring cuenta que una versión anterior hacía una malla (el 41 % del suelo pisable era camino), y que el usuario eligió en una QA anterior el «árbol mínimo + minas».
- **Lo que no cuadra.** Si cada región ya es un árbol, ¿de dónde sale el «cuadrado»? Hipótesis que hay que comprobar midiendo:
  - las redes de regiones vecinas se tocan en los nodos de paso y cierran ciclos entre regiones;
  - las sendas a minas y pueblos corren en paralelo a la red;
  - simplemente hay demasiados nodos, minas y pueblos por región.
- **La cifra.** En la semilla 1 hay 260 casillas de camino sobre 642 pisables (~40 %), y 218 de ellas tocan una barrera.
- **Qué afecta a la partida.** El camino cambia el coste de moverse (`costeDeEntrada` con camino, `map.ts:184`), así que cambiar los caminos cambia las partidas y el ancla de `pnpm banco`. Se re-ancla juzgando la forma del diff. También pesan la IA (cómo se mueve) y la duración de las partidas.
- **Los mapas del agente** traen sus propios `roads` (`mapPlanSchema.roads`): lo que escriba el agente no se toca. Esto es solo el procedimental.

## Criterios de aceptación

1. **Ninguna malla inútil.**
   - En el procedimental no hay ciclos de caminos que no acorten un recorrido de verdad: ningún «cuadrado» de caminos en el que ningún lado ahorre nada.
   - Se define una medida comprobable y se publica antes y después en 100 semillas. Por ejemplo, el número de ciclos del grafo de casillas de camino, o la fracción del suelo pisable que es camino.
2. **Los caminos siguen llevando a lo que importa.**
   - Todo nodo, ciudad, mina y pueblo sigue unido a la red de su región.
   - Las regiones vecinas siguen unidas a través de sus pasos.
   - Los tests que vigilan esa conectividad siguen en verde, o se escribe uno si no lo hay.
3. **Las partidas no se rompen.**
   - `barrido-semillas.ts`: 0 partidas sin terminar.
   - Duración con 100 semillas, mediana, p90 y máximo, antes y después. No debe salirse de la regla del lado del mapa: mediana ≥ 8 días, p90 ≤ 20 y 0 sin terminar. Si se sale, se dice con las cifras.
   - `pnpm banco` se re-ancla juzgando la forma del diff: qué semillas cambian y cuál es el primer hecho distinto.
4. **Se ve.** Capturas del taller (`pnpm taller escenario 1 3 7`) de antes y después, entre ellas la zona de `s7-acantilado.jpg`.
5. `pnpm verify`, `pnpm qa` y `pnpm capturas` en verde. Se actualiza `docs/historia.md`, y `CLAUDE.md` si cambia alguna regla.

## Fuera de alcance

- Los caminos que escribe el agente en su plan de mapa.
- El escenógrafo, el pasillo y el arcén, que ya están cerrados.
- Cambiar el lado del mapa, la red de nodos o cuántas minas y pueblos hay. Si la causa resulta ser esa, se trae la decisión al usuario.

## Preguntas abiertas (con la suposición por defecto)

- **¿Las sendas a minas y pueblos se quedan?** Por defecto sí: el usuario las eligió («árbol mínimo + minas»). Se quitan solo las que no aportan, por ejemplo una que corre pegada a la red.
- **¿Árbol por región o árbol global?** Lo decide el arquitecto midiendo, y yo se lo traigo al usuario.

## Decisión del usuario tras la crítica (06-10-2026)

Veredicto del crítico: REENCUADRADA (ver `critica.md`). Se le presentaron tres opciones: una vía por frontera, quitar solo los bucles dentro de cada región, o una red para todo el mapa. Su respuesta:

> Dentro de una region una estructura de caminos radial

Se interpreta así (suposición del coordinador; el arquitecto la valida y, si el código la contradice, se vuelve al usuario):

- **Cada región tiene un centro.** Por defecto, la semilla de su Voronoi o su punto pisable más central.
- **Los caminos salen del centro hacia cada nodo de la región** (pasos y ciudades) **y hacia cada mina y pueblo**, como el árbol de caminos más cortos desde el centro. Los radios pueden compartir el tramo junto al centro, pero no se trazan caminos de nodo a nodo ni de destino a destino.
- Con esto desaparecen las dos vías paralelas a ambos lados de una frontera: cada región va de su centro a cada paso, no de paso a paso. Los bucles que quedan pasan entre regiones por sus centros, y esos acortan de verdad.
- **El cierre diagonal del pintor** (`colocar.ts`, ~l.516-535): une en diagonal dos casillas de camino vecinas aunque no sean un tramo, y cierra rombos. Entra en el ciclo si sigue haciéndolo con la red nueva.
- El criterio 1 se reescribe así: «la red de cada región es radial desde su centro; ningún camino de paso a paso». Los criterios 2 a 5 siguen igual: conectividad, duración y p90, banco con el diff juzgado por su forma, capturas.
- **#133** («Densidad de caminos: el 36 %») queda absorbida por esta tarea. Se re-mide el techo de `test/regiones.test.ts` (~l.419).

## Decisión del usuario sobre el plan (06-10-2026): variante B

Se le explicó por qué la red radial sola (A) deja los rombos: los radios de los dos lados de una frontera hacia dos pasos cercanos forman dos «V» que se cierran. Respondió: **«Sí, sigue con B»**.

- **Radial dentro de cada región**, con tronco compartido y la regla de «no arrimarse», como en `plan.md`.
- **Entre dos regiones vecinas, solo un paso lleva camino.** Los demás pasos se cruzan igual, pero sin camino.
- **El criterio 2 se reescribe así:**
  - cada ciudad, mina y pueblo está en la red de su región;
  - hay exactamente un cruce con camino por pareja de regiones vecinas;
  - la red de caminos del mapa es conexa.
  
  Se acepta que unos 9 pasos por mapa queden sin camino.
- **Cifras del prototipo** (100 semillas):
  - el camino ocupa el 31 % (antes el 36 %);
  - los anillos de 12 casillas o menos bajan de 689 a 74;
  - duración en días (mediana / p90 / máximo): 10 / 16 / 32;
  - el banco queda en 9 / 17 / 39 y cambia el ganador en 80 de 200 partidas.
  
  Tiene que seguir dentro de la regla: mediana ≥ 8, p90 ≤ 20 y 0 partidas sin terminar.
