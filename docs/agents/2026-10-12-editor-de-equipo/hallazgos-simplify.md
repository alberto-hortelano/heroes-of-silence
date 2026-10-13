# Hallazgos de /simplify (consolidado por el coordinador, 12-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud). Duplicados fusionados; cada uno con su decisión. Criterio del usuario vigente: **menos pruebas de jugabilidad** (probar reglas, no resultados de combate; el banco se corre al cerrar y, si se mueve, se dice y se explica, sin perseguirlo).

## Se aplican

1. **El catálogo de la arena, un valor atado por el tipo, sin parser** (altitud 6, simplificación 6). `equipo.ts` exporta `equipoCon(piezas)`, que devuelve las funciones de equipo (`pieza`, `piezasPuestas`, `sumaDeEquipo`, `conEquipo`, `manosBlocker`, `equipoBlocker`, `ponerPieza`, `cifrasDePieza`… las que use la arena) ya atadas a ese catálogo; las sueltas siguen con el del juego para el juego, sin tocar sus llamadas. `core/arena.ts` y `src/client/arena/` no importan las sueltas: el guardia es una **regla de importación** en `invariantes.test.ts`, y se borra el analizador de paréntesis (`ARIDAD`, `argumentos`). Verlo morder.
2. **Una sola forma del catálogo en las fronteras** (simplificación 2): la lista del borrador (`readonly Pieza[]`) en el montaje, la batalla y el retoque; el `Map` se hace una vez dentro, donde se resuelve. Fuera el comentario de `structuredClone` (copia un `Map`).
3. **El enlace v6 no toca el borrador** (altitud 3). La pelea de un enlace v6 pelea con el catálogo del juego más las piezas que trae el enlace; `piezasDelBorrador` no cambia al abrirlo y no hay bloqueo por unidades del borrador que no se montan. Fuera `piezasAlAbrir` con su `cambioDePiezaBlocker` sobre unidades ajenas. Los enlaces v1-v5 siguen como decidió el usuario: con las piezas de la arena y el aviso. Actualizar la línea de CLAUDE.md.
4. **Guardar es una operación** (altitud 5, 4). Un solo POST (o el de unidades con las piezas en el cuerpo) que valida piezas y unidades con las piezas recibidas y, si todo vale, escribe los dos ficheros (atómicos); si algo no vale, no escribe ninguno y dice por qué. Fuera el orden «piezas → unidades» y su texto. Un `equipo.json` ilegible no deja ilegible el de unidades: las unidades se leen con el catálogo del juego y un aviso (las que lleven piezas nuevas quedan «no vale, se conserva»).
5. **Cambiar el hueco rehace lo que el hueco exige** (altitud 1). `enElHueco(p, hueco)` en el núcleo (escudo: velocidad ≤ −1; fuera del arma, sin `manos` ni `danio`…), que usan `piezaNueva` y el cambio de hueco. El rechazo de «escudo con velocidad 0» desaparece por construcción.
6. **«¿Sigue valiendo quien la lleva?», una vez** (altitud 2, simplificación 3): `equipoQueNoVale(cuerpo, equipo, catalogo)` que leen `cambioDePiezaBlocker` y `retocarLasPiezas`, con una sola redacción del rechazo.
7. **El equipo de cada stack, en el stack** (simplificación 1). `conEquipo` (la única que escribe `sinEquipo`) deja también el equipo puesto en el `UnitInfo`; `retocarLasPiezas` lo lee de cada stack y desaparece `BattleState.equiposDeArena` (y su mantenimiento en `retocarElTipo`). No debe viajar al espectador ni al volcado del banco (como `sinEquipo`). Si el banco se mueve, se dice por qué.
8. **Hechos sueltos en un sitio** (reutilización 1-5, simplificación 4-5):
   - `idsPuestos(equipo)` sin catálogo (solo lee los huecos) y usado en los cinco sitios; `idsLlevados(unidades, conHeroe)` en el núcleo para `piezasDelMontaje`.
   - `selloDePieza(p): 'del juego' | 'cambiada' | 'nueva'` en `core/arena.ts`, que leen `piezasDeLaArena`, `conPieza`, `retocarLasPiezas` y la vista.
   - `mismaPieza` compara formas ya normalizadas (se normaliza al entrar al borrador), sin validar dos veces por llamada; `idsQueCambian`, si sobrevive, con ella.
   - `cambioDePiezaBlocker` usa `oElMotivo`.
   - `esIdDePieza` en `validar.ts`, junto a `esIdDeArena`.
   - El texto de lo guardado y lo conservado, una función en `paneles.ts` junto a `sinGuardarEnPalabras`.
9. **`aDosManos` en todo `equipo.ts`** (altitud 7): `manosBlocker` y el resto la usan. El guardia `escribeTipos` se afina a escrituras de propiedad (`\.piezasDeArena\s*=` y la clave en un literal de `BattleState`) en vez de esquivarlo con un nombre; el nombre del cliente puede quedarse si se lee mejor.
10. **`validarEquipo` sin `splice`** (altitud 8, simplificación 8): «está repetida» con un `push` normal; fuera el comentario del orden.
11. **Gestos del cliente** (simplificación 9): `crear-pieza` (nueva o duplicar) y `quitar-pieza` (borrar o volver a la del juego), con el texto según `selloDePieza`; un solo pintado del sello en la tarjeta y la ficha.
12. **Comentarios con historia → `docs/historia.md`** (simplificación 10): fechas y «N1 de QA» en `equipo.ts`, `data.ts`, `session.ts`, cabecera de `test/arena-equipo.test.ts`.
13. **Tests con menos ruido y sin cifras del JSON** (simplificación 7 y nota final):
    - En `test/helpers.ts`, `DEL_JUEGO` y `MONTAJE` (y un `hojaDeLaArena(id)` para las tres copias); quitar los ~150 `PIEZAS_DEL_CATALOGO` repetidos y las llamadas partidas.
    - Los literales sacados de `data/equipo.json` (`48`, `PV 0 → 100`, `disparos: 6`) se expresan con la pieza (`50 - ESPADA.ataque`…).
    - La pasada `equipo` de `tools/qa/capturas.ts` (~275 líneas) se reduce a una escena con dos o tres comprobaciones de flujo (abrir, crear, guardar, verla en la ficha), sin cifras ni textos exactos.
14. **El recorte de pruebas de jugabilidad ya commiteadas** que pidió el usuario («hazlo»): lista en `recorte-de-pruebas.md` de esta carpeta.

## Se descartan, con motivo

- **Catálogo obligatorio en las 25 llamadas del juego** (altitud 6, alternativa): `equipoCon` da la misma garantía por tipo sin tocar el juego.
- **Eficiencia 1, 2, 4, 5, 6** (microsegundos; el 1 lo cubre el punto 8 al normalizar una vez; el 3 desaparece con el punto 3).
