# QA: las unidades en 8 direcciones, con el Y Bot de respaldo

Lo validado es el árbol sin commitear del 03-10-2026, contra `requisitos.md` entero: la petición, la corrección del Y Bot, las decisiones sobre el plan y las dos tandas de ritmo.

Las capturas de esta vuelta están en `capturas-qa/`:
- `capturas/`: la salida de `pnpm capturas`.
- `direcciones/`: el templario llevado a mano en la arena.
- `arena-ia/`: una pelea 4 contra 4 con todo en IA.
- `sin-figuras/`: las hojas de figura bloqueadas.
- `hojas-ocho-direcciones-marcha.png`: un fotograma de marcha de cada dirección, del templario y del Y Bot.

Usé mi propio vite en el **3123**, con `set -m` en su propia línea. Lo maté por su grupo y comprobé que el 3123 quedó libre. El 3100 lo tiene otra sesión (pid 26131) y no lo toqué.

## Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| `pnpm verify` en verde | ✅ | 43 ficheros, **1 179 tests**, 20,8 s |
| `pnpm banco` con el ancla igual | ✅ | `1b90bfd9…`, «ancla: igual», 0/200 sin terminar, 8 / 15 / 25 días |
| `pnpm qa` | ✅ | exit 0: «1 mapa diseñado, 6 turnos de mapa, 80 decisiones de batalla y 1 ascenso» |
| `pnpm capturas` sin errores | ✅ | exit 0, «sin errores en consola», 202,5 s. El espectador enseña el fin 60 634 ms después del `game_over`; el plazo es de 82 000 ms |
| `vite build` sin el arte borrado | ✅ | exit 0 en 836 ms. En `dist` no hay ningún `unidades/*/atlas.webp` raíz. `__arena/hojas` lista 52 unidades: 10 con arte propio y 42 con el Y Bot |
| Taller tras el borrado | ✅ | `pnpm taller vista-8d`, `vista-ejercitos`, `vista-efectos` y `vista-edificios` salen con exit 0. Comprobé que existen todas las rutas a las que apuntan las páginas: 80 en el visor, 52 en ejércitos, 25 en efectos, 21 en edificios. No falta ninguna |
| Referencias colgantes en el código | ✅ | `grep` en `src/`, `tools/`, `vite.config.ts` y `package.json`: no queda ninguna referencia a `characters/`, `rpg/scenes`, `liora-poses`, `espejadoPara`, `facingLeft`, `comoAtlas`, `registrarHojaDeUnidad`, `tieneLado`, `taller/direcciones` ni `DURACION.move`. El único `atlas.webp` que se lee es el de `dN/`. **En la documentación sí quedan dos** (hallazgo M1) |
| 1. Toda figura usa el atlas de la dirección en la que mira | ✅ | `direcciones/`, semilla 7, templario contra esqueleto. Cada movimiento pide la hoja que toca: NE pide `templario-escudo/d3` (espalda-derecha), el tramo que acaba al NO pide `d5`, el que acaba al SO pide `d7` y el que acaba al O pide `d6`. El Y Bot del esqueleto pide `espada-escudo-8d/d5-a`, `d5-b` y `d7-b`. En `mosaico-direcciones.png` la imagen coincide: de espaldas al subir y de lado al ir a la izquierda |
| Diagonales no invertidas | ✅ | `hojas-ocho-direcciones-marcha.png`: d1 es frente con giro a la derecha de la pantalla, d3 espalda-derecha, d5 espalda-izquierda y d7 frente-izquierda, en el templario y en el Y Bot. Eso cuadra con `DIRECCION_DE_HOJA = S, SE, E, NE, N, NO, O, SO`. Y en la arena, el tramo al NE pinta la espalda girada a la derecha |
| Mira al andar, al golpear y quieta | ✅ | Al andar cambia de hoja en cada tramo, como se ve arriba. El esqueleto pide `d7-b` al golpear al SO. Quieta conserva la mirada (`dir-*-quieto.png`). Al empezar, los bandos se miran |
| 2. Sin espejo | ✅ | No quedan ni `espejadoPara` ni `facingLeft`. Las ocho hojas son distintas y ninguna se voltea (`figura.ts`: «No se espeja nunca») |
| Y Bot en 8 direcciones como respaldo de toda figura, en todas partes | ✅ | En la batalla de la partida, el espectador, el mapa, el castillo y la arena (`capturas/desktop-07/08/09`, `espectador-02`, `desktop-01/14`, `desktop-04`) |
| Arte antiguo borrado | ✅ | 167 borrados en el índice. No existe `assets/characters/`. En `assets/rpg/` solo queda el mapa. Se conservan `identidad.webp`, las `dN/hoja-*` y las `_poses` de una dirección, como se decidió |
| Tabla de juego de armas | ✅ | `JUEGO_DEL_CUERPO`: piquero → `lanza`, caballería y campeón → `montado-lanza`, liche → `baston`, arqueros → `espada-escudo`, el resto → `espada-escudo`. En la captura `desktop-14`, el monstruo piquero lleva lanza. Ver la reserva M2 sobre los héroes y los ids de la arena |
| Tinte por bando | ✅ | Y Bot rojo y azul en la batalla, naranja y azul en la arena. Los templarios, con arte propio, no se tiñen y su bando lo dice el aro |
| 3. Las 6 acciones, `charge` y `hurt` | ⚠️ parcial | `hurt` y `death` se ven en `arena-ia/detalle.png`. `charge`: el espejo registra 1 carga en la semilla 11, pero no la aislé en un fotograma. Queda cubierta por el test del animador (`clip = paso.carga ? 'charge' : 'walk'`), no por mi vista |
| 4. El cadáver dura hasta el final | ✅ | `arena-ia/detalle.png` y `capturas/arena-03-final`: los Y Bot azules y los templarios siguen tendidos en su casilla al terminar. En `desktop-09` hay cuatro cadáveres rojos y uno azul. El cadáver se pinta debajo de los vivos |
| 5. Sombra por silueta | ✅ | Se ve con poca opacidad en todas las capturas con arte. Sin arte vuelve al óvalo (`sin-figuras/`) |
| 6. Sin arte: marcador y nada se rompe | ✅ | `sin-figuras/mosaico.png`: bloqueé las 8 peticiones de hojas de figura. El mapa, la ficha, las miniaturas y la pelea de la arena se pintan con marcadores. El muerto sin arte desaparece, como estaba previsto. La consola no da ningún error aparte de las peticiones abortadas, y no hay `pageerror` |
| Una unidad con dN incompleto | ✅ (ruidoso) | Con una copia de `templario-escudo` sin d5 ni d6, `hojasDeArena` lanza: «tiene 6 de sus 8 direcciones (le faltan d5, d6): o se terminan o se quitan». Lo mismo rompería `vite build` y la lista de la arena mientras el taller genera una unidad. Es lo que se decidió (A3) |
| Ritmo: reposo a 8 fps | ✅ | `atlas-8d.json` y las `dN/atlas.json` dicen `idle fps 8` |
| Ritmo: ~0,9 s por casilla, en un solo sitio | ✅ | `marcha.ts`: `PRISA_DE_LA_MARCHA = 1.45`. Con 7 fotogramas a 8 fps, zancada 0,7 y alto 0,95 salen **907 ms** por casilla andando y unos 546 ms cargando |
| Desfase por figura, sin coreografía | ✅ | `compas.ts` se deriva por hash del id, sin `Math.random`, y lo aplica `colocarFigura`, el único sitio, a toda figura. Lo cubren 9 tests. En la serie de la arena, las figuras quietas no respiran a la vez. No lo medí al píxel |
| Plazos medidos para `capturas` y el espectador | ✅ | 82 s de plazo frente a 60,6 s medidos en esta pasada |
| Héroe del mapa con el mismo criterio | n/a | El héroe no anima su movimiento: salta de casilla. Lo dice `implementacion.md` |

## Hallazgos

Ninguno bloquea.

**I1. Importante. En el mapa, el héroe y los monstruos se confunden.**
- El héroe es ahora un Y Bot teñido de `#d94f4f` (jugador 0). Los monstruos son el mismo Y Bot teñido de `#b0553f` (`COLOR_MONSTRUO`).
- Con el modo `color` solo cambia el tono, y entre los dos hay unos 10°. A escala de mapa son casi el mismo muñeco rojo.
- Se ve en `capturas/desktop-01` y `desktop-14`, semillas 50 y 97, día 1. El héroe se reconoce solo por el aro y el monstruo por su cifra.
- Antes, el héroe tenía arte propio (Liora) y no pasaba. Es consecuencia directa de «el Y Bot en todas partes, teñido».
- Reproducir: `pnpm dev`, abrir `/?seed=97` y mirar el héroe junto al castillo y el monstruo «2» a la derecha.
- Quien juega espera distinguir de un vistazo «yo» de «lo que me guarda el paso». Hace falta otro color para los monstruos, o que lo decida el usuario.

**M1. Menor. La documentación apunta al arte borrado.**
- `docs/art/peticiones.md` §9, línea 189, sigue diciendo que «el `atlas.webp` raíz se queda como estaba».
- La línea 194 de ese mismo fichero y `docs/art/taller.md:119` citan `tools/taller/direcciones.ts`, que se ha borrado. La numeración vive ahora en `src/shared/arte.ts` (`NOMBRES_DE_DIRECCION`).

**M2. Menor. La tabla de armas da resultados raros por los nombres.**
- Todos los héroes van con espada y escudo, porque la figura no conoce su tipo: un abad, que es monje, no lleva bastón. Lo declara `implementacion.md`.
- En la arena, el juego sale del `perfil` del taller, como se pidió. Pero `imperio-piquero` sale con `dos-manos` y `goblin-lancero` con `espada-escudo`. La regla «piquero → lanza» se aplica al catálogo del juego y no a estos ids.
- Se cumple la letra; queda por confirmar si es lo que el usuario espera.

**M3. Menor. Ficheros nuevos sin añadir a git.**
- `src/client/compas.ts`, `src/client/marcha.ts`, `test/compas.test.ts` y `test/marcha.test.ts` están sin seguimiento (`??`).
- Los borrados están en el índice y algunos añadidos van como *intent-to-add* (`A`).
- Un commit que no haga `git add` de los cuatro rompe el build. Hay que tenerlo en cuenta al commitear.

**M4. Menor, de experiencia. Ya lo deja abierto el ingeniero.**
- Una pelea 4 contra 4 de la arena tarda **47,6 s** en contarse (semilla 11, 39 hechos).
- El espectador acaba unos 60 s por detrás del `game_over`.
- Es el precio de los ~0,9 s por casilla que pidió el usuario, y está medido. Lo anoto para que decida él.

## Workarounds usados

- **Llevé el templario con un espejo `SesionDeArena`**, para saber a qué casilla pulsar, como hace `pnpm capturas`. Los clics son reales en el lienzo y no cambian nada para quien juega.
- **Bloqueé las hojas con `page.route`** para simular «no ha llegado el arte». Es exactamente el caso del contrato.
- **Probé `hojasDeArena` sobre una raíz copiada al scratchpad**, en lugar de romper `assets/` del repo. Es la misma función que lee el servidor.

## No probado

- **La carga (`charge`) a la vista**: no la aislé en un fotograma. Hay test.
- **La memoria y el parpadeo al girar**: no los volví a medir. Me fío de las cifras de `implementacion.md` (cero píxeles de marcador) y de que, en mis series, no apareció ningún marcador con el arte disponible.
- **El desfase al píxel.**
- **Chrome con cabeza**: usé Playwright con el Chromium de su caché, porque una pestaña en segundo plano no anima.

## Veredicto

**Apto con reservas.** Todos los criterios literales se cumplen y no hay ningún bloqueante.

Antes de cerrar conviene:
- decidir sobre I1, el héroe y los monstruos del mismo rojo en el mapa;
- corregir las dos referencias de la documentación (M1);
- añadir a git los cuatro ficheros nuevos al commitear (M3).
