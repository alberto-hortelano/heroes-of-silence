# Requisitos: enganchar la escena del mapa denso en el juego

## Petición

El usuario (04-10-2026) pidió: «Integra la rama de ../heroes-arte. Hay instrucciones en docs/art/peticiones.md».

- La rama `arte-mapas` ya está fusionada en `b3ff334`.
- Falta la petición 1 de `docs/art/peticiones.md` §11: **enganchar la escena**. Su contrato está en «Contrato del enganche», en esa misma sección.
- La sesión de arte confirma este alcance: hacer la 1 ahora y dejar las peticiones 2-4 como issues aparte. Esas tres son el nivel por región en el motor, los ríos como líneas y la barrera de cada nodo.

## Qué se pide

1. **El mapa de aventura se pinta con la escena del escenógrafo** en el cliente (`pnpm dev`) y en el espectador (`pnpm mirar`), en lugar de los pigmentos, tramas y piezas de hoy (`render/terreno.ts`, `render/mapa.ts`).
   - Puertas que se usan:
     - `componer(map, semilla, catalogo)`: una vez por partida, sobre el mapa recién hecho;
     - `pintarEscena(ctx, escena, { tile, margen: 0, imagen, nubes: false, vineta: false, objeto })`;
     - `imagenesDeEscena(escena)`;
     - el catálogo `assets/mapa/escena.json`.
   - **Se hornean en la escena** los objetos fijos: ciudad, pueblo, nodo y mina. El juego pinta encima la bandera de su dueño.
   - **Los pinta el juego encima, como hoy**, los objetos que cambian (monstruos, recursos, cofres) y además la niebla (`fog`), los héroes, los asaltantes, las banderas, la selección y el camino del ratón.
2. **Se pinta una sola vez** en una superficie aparte y se copia en cada fotograma, porque pintarla cuesta ~1,4 s sin GPU.
   - Se repinta cuando llega arte nuevo (`versionDelArte`).
   - El escalado de la cámara/zoom se resuelve sobre esa superficie. Las piezas están hechas a 48 px por casilla.
3. **El juego se juega sin arte**: sin imágenes, `pintarEscena` pinta los marcadores de color de cada pieza. Eso tiene que tener su test o mantener el que ya hay.
4. **Los mapas que diseña el agente** valen igual, porque `componer` solo lee el `GameMap`.
5. **Decisiones que el contrato deja abiertas** y que el arquitecto decide y justifica:
   - si el código del escenógrafo se queda en `tools/taller/escenario/` y lo importa el cliente, o se mueve a `src/client/render/escena/`. Hay que tener en cuenta los invariantes del repo: `core` puro, `html.ts`, que el cliente no importe Node, y el guardia de rutas absolutas;
   - si el minimapa sigue con sus pigmentos;
   - qué pasa con el código de pintado de hoy que quede muerto, que se retira;
   - la semilla de `componer` en el espectador: que vea la misma escena que el cliente para la misma partida.
6. **Rendimiento y memoria medidos**:
   - tiempo de `componer` y del primer pintado en Chromium sin GPU (el de `pnpm capturas`);
   - fps al mover la cámara;
   - memoria de la superficie y de las ~470 imágenes (16 MB en disco).
   - Si la superficie de un 34×34 a 48 px (1 632² px) o con zoom cuesta demasiado, el arquitecto propone la salida.

## Verificación

- `pnpm verify`.
- `pnpm banco` con el ancla igual (`1b90bfd9…`): es solo cliente.
- `pnpm capturas` sin errores. Sus plazos se ajustan con cifras medidas si cambian.
- En el navegador, en un puerto propio:
  - el cliente con `?seed=1` y otra semilla, y «Ver mapa entero»;
  - el espectador con `pnpm mirar`.
- Capturas en `docs/agents/2026-10-04-escena-del-mapa/capturas/`, comparadas con las de `pnpm taller escenario <semilla>`.

## Fuera de alcance

- Las peticiones 2-4 de la §11, que van como issues.
- Generar arte nuevo.
- Cambiar reglas del núcleo.

## Decisiones del usuario sobre el primer plan (04-10-2026)

- **No se pinta una superficie única de la escena entera.** El usuario eligió esta opción:
  - **el suelo va en una superficie fija**: textura de suelo, relieve y caras de roca, agua y caminos, es decir, todo lo plano;
  - **los volúmenes se pintan en cada fotograma**, solo los visibles: árboles, montañas, muros, rocas, nodos, ciudades, pueblos y minas;
  - los volúmenes van **ordenados por profundidad junto con las figuras** (héroes, monstruos, asaltantes y objetos del juego), así que una figura puede quedar detrás de un árbol o una montaña. **Las figuras no van siempre encima.**
- **Si el coste es el número de imágenes, se limita el zoom por número de sprites visibles, no por un nivel de zoom fijo**, porque cuántos caben depende del tamaño de la pantalla.
  - El tope de alejamiento de la cámara se calcula a partir de cuántos volúmenes entrarían en la vista.
  - El tope tiene que salir de una medida en Chromium sin GPU, el de `pnpm capturas`.
- **Un minimapa sencillo enseña el resto del mapa.** Hoy ya existe uno (`render/minimapa.ts`, con pigmentos); el arquitecto decide si basta o hay que simplificarlo. «Ver mapa entero» se resuelve con ese minimapa o con el tope; el arquitecto lo justifica.
- **Las copas pueden asomar sobre lo explorado**: vale que asome sobre lo explorado la copa de una formación cuya raíz sigue sin explorar.
- **El código puro del escenógrafo se mueve a `src/client/render/escenario/`** con `git mv`. La sesión de arte ya está avisada de que fusione `main` antes de seguir.
- La resolución de la superficie del suelo deja de ser una pregunta de 48, 72 o 96 px de la escena entera. El arquitecto la propone con medida, ahora solo para el suelo.

## Decisiones del usuario sobre el segundo plan (04-10-2026)

- **Tope de alejamiento**: como máximo 2 000 volúmenes visibles, **con un mínimo de legibilidad de 40 px por casilla**. Si el tope de volúmenes dejaría la casilla por debajo de 40 px, gana el mínimo. El resto del mapa se ve en el minimapa.
- **Umbral entre plano y volumen: 0,6 casillas de alto.** Las caras de roca van al suelo, como decide el plan.
