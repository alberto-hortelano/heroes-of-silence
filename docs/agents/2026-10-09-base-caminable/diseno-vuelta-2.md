# La base como escenario lateral (caballero): rehacer la geometría y el arte

## Contexto
La primera vuelta del ciclo (`docs/agents/2026-10-09-base-caminable/`, sin commitear) funciona en lo mecánico: se camina, se habla con los PNJ, se amplía la base, y el narrador `town_voices` está en marcha. `verify`, `qa`, `banco` y `capturas` están en verde. Pero el visual no cumple: una plaza cenital como un tablero, solares de tierra y figuras diminutas.

El usuario pide rehacerla así (cita literal para `requisitos.md`):

> Rehacer completo. Como en las pantallas del rpg o como las de combate pero sin casillas. En primer plano un espacio por el que moverse, a escala de personaje, mas estrecho que el de combate, como a la mitad, ahi puede haber npcs con los que hablar, de momento usa las bases del y_bot. Detras los edificios, se ve la puerta y lo que entre de alto, como en una plaza, haciendo un semicirculo. Todo a escala de personaje, la misma que en combate. Por aclarar los espacios para rpg son como los de combate pero con scroll horizontal y sin casillas, con movimiento libre

Respuestas del usuario:
- **Fachadas nuevas** por Codex: altas, recortadas por arriba y giradas según su sitio del arco.
- **Un sitio vacío** muestra el fondo de la plaza.
- **Solo ratón** por ahora.

## Qué se conserva (independiente de la geometría)
- `src/core/town/sitios.ts` y `voces.ts`.
- `contract/linea.ts`.
- `town_voices` completo: director, política, MCP y espectador.
- `src/client/views/base.ts`: paneles y conversación.
- `render/base/arte.ts`, con su índice y sus máscaras.
- `render/base/golpe.ts`.
- `render/base/escena.ts`, lista por profundidad.
- La máquina de estados de `escenas/castillo.ts`: andar → llegar → abrir.
- `pintarFiguraConSombra`, PNJ en Y Bot y el respaldo de `data/vecinos.json`.

## Qué cambia

**1. Escenario en unidades de combate** (`src/shared/base.ts`, `data/bases/<f>.json`)
- El `Plano` está en **pasos**, como el combate (`render/proyeccion.ts`).
- Escala: el `paso` y la `compresion` salen de la misma cuenta que `tableroPara` para ese lienzo. Así un adulto mide lo mismo que en combate (`ALTO_DE_FIGURA.normal` 0,95 paso; ~113 px a 1440×900). Se extrae a una función compartida y no se copia.
- **Franja caminable**: un rectángulo de `ancho` × `FONDO_DE_LA_FRANJA` (3,5 pasos, la mitad de los 6,93 del combate), con el borde de atrás a `y = 0`. Movimiento libre dentro, sin pathfinding: un clic fuera se lleva al punto más cercano dentro. `camino.ts` pasa a ser un `clamp`.
- **Ancho del escenario**: unos 24 pasos (dos combates), con scroll horizontal.
- **Sitios en semicírculo** detrás de la franja. Cada sitio lleva:
  - `x`;
  - `fondo`: la profundidad del pie; los del centro van más atrás y los de los extremos más cerca de la franja;
  - `giro`: −40°…+40°, mirando al centro;
  - `puerta`: un punto en el borde de atrás de la franja, frente a la puerta.
  
  El arco se deriva de `x` con una sola fórmula (`arcoDeLaPlaza`), y el JSON solo dice el orden y la x. Se sigue validando contra `sitiosDeLaBase`.
- **Profundidad**: toda la franja está delante de los edificios, así que las figuras siempre tapan las fachadas. Entre fachadas se ordena por `fondo`. La lista única de `escena.ts` sigue sirviendo.
- **Cámara** (`render/base/camara.ts`): seguimiento horizontal con suavizado, como `followCamera` de `archivo/gpt-rpg:src/client/aventura/scene-motion.ts`, con tope en los bordes. La vertical es fija, con el suelo abajo como en combate. En móvil es igual (el lienzo de 860 px no hace falta: ya hay scroll).
- **Se retiran**: el polígono `borde`/`huecos`, el grafo de visibilidad, `ALTO_DE_FIGURA = 74`, el `fondo.webp` cenital, la guía cenital (`svgDeLaGuia`, `escribirGuiaDelFondo`, `encargoDelFondo`), los 20 edificios «maqueta» y los tests `base-camino`/`base-disposicion` en su forma actual (se reescriben).

**2. Arte del caballero** (`tools/taller/base.ts`, Codex)
- **Panorama** `fondo.webp`, en proporción de unos 3:1, en una o dos mitades cosidas si 1536 px se queda corto.
  - Cámara ortográfica a 25°, como `campo.webp` y el prompt de `cruce-v1` (`archivo/gpt-rpg:src/shared/rpg-art.ts` `buildScenePrompt`).
  - Abajo, el empedrado de la plaza (la franja).
  - Detrás, el anillo de la plaza en semicírculo con **relleno neutro en cada sitio**: muro bajo, árboles, un callejón o casas de fondo. Arriba, cielo.
  - La guía se genera de la disposición: la franja y cada sitio con su giro, marcados como «relleno».
- **Fachadas**: una por edificio (las 20).
  - Altas, sin peana ni atrezo, con la puerta a escala de personaje: el alto de puerta va en el prompt en px de la celda, y el adulto de referencia es `FIGURA`.
  - Giradas según su sitio: cada mejora hereda el giro del sitio y lleva su morada como referencia.
  - Se recortan por arriba al pintarse si no caben.
  - El ancla es el pie de la puerta (`derivar.ts`). La escala no es libre: sale de que la puerta mida su alto en pasos.
- `pnpm taller vista-base` superpone la franja, el arco, las puertas y las anclas sobre el panorama.
- **El usuario revisa el arte antes del commit.** El nigromante sigue con marcadores.

**3. Paneles, PNJ, narrador**: sin cambios de contrato. Los PNJ (Y Bot) se reparten por la franja (`vecinos[id].en`, en pasos). Los encargados, junto a la puerta de su edificio.

**4. Criterios de `requisitos.md` que cambian** (los reescribe el coordinador):
- **1 y 2**: escenario lateral con scroll; un sitio vacío enseña el relleno del fondo.
- **3**: franja de la mitad del combate, a escala de combate, movimiento libre y recorte al borde.
- **4**: las figuras siempre van delante de las fachadas.
- **11**: capturas de la escena lateral, con scroll hasta un extremo.

## Cómo se ejecuta
- En el mismo ciclo y la misma carpeta:
  1. Anoto la petición y las respuestas en `requisitos.md`.
  2. El arquitecto revisa `plan.md`, solo la geometría y el arte.
  3. El ingeniero lo implementa y lanza los encargos a Codex.
  4. Te enseño el arte.
  5. `/simplify` y QA.
- Siempre con `--port` (nunca el 3100), sin push y sin tocar el generador del mapa.

## Verificación
- Tests:
  - `base-disposicion`: sitios = catálogo, arco monótono (el centro el más hondo), puertas en el borde de la franja.
  - Escala: el alto del adulto en la base es igual al de combate para tres tamaños de lienzo.
  - `clamp` de la franja.
  - Cámara: tope en los bordes y seguimiento.
  - Escenas con Session real: clic en el ayuntamiento → andar → ampliar; clic en un PNJ → conversación; clic fuera de la franja → recorte.
- Órdenes:
  - `pnpm verify`;
  - `pnpm verify:lento`;
  - `pnpm qa`, con `town_voices` sin cambios;
  - `pnpm banco`, con el mismo hash;
  - `pnpm capturas`: castillo al entrar, scroll a un extremo, ampliar, morada, conversación y móvil.
- Playwright con `pnpm dev --port <libre>`: comparar en la misma resolución una captura de combate y otra de la base. La figura debe medir lo mismo.

## Riesgos
- Codex no respeta el giro ni la escala de puerta. Se mide la puerta en `vista-base`, se corrige con `pnpm taller corregir` y, en último caso, se ajusta el `giro`/`x` del sitio al cuadro.
- Las costuras del panorama en dos mitades: si se notan, una sola imagen ancha a menor resolución.
- `tableroPara` sube la cámara a 35° en escritorio, mientras el arte está a 25°. Se usa la misma compresión que el combate, por coherencia.
