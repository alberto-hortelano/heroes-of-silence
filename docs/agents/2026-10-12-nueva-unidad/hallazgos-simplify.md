# Hallazgos de /simplify (consolidado por el coordinador, 12-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff del ciclo 2. Los
duplicados están fusionados; cada hallazgo lleva su decisión. El banco tiene que seguir **idéntico**
(`066767b4…`): nada de esto cambia el juego.

## Se aplican

1. **El hueco, tipado en el núcleo y nombrado para la persona** (altitud 1+2, reutilización 1).
   Hoy `unequip.slot` es `string` antes y después de traducir, y el motivo dice «no lleva nada en el
   hueco escudo» aunque el agente pidiera `shield`.
   - En el núcleo, `AdventureAction` `unequip` lleva `slot: Hueco`. Las dos fronteras convierten:
     `accionDelAgente` (`contract/huecos.ts`, del esquema del agente a `AdventureAction`) y el cliente
     en su puerta (`session.ts`, con `esHueco`). Desaparecen el `esHueco` de `unequipBlocker` y el
     `as Hueco` de `applyAdventureAction`.
   - Una sola frase de «no hay ningún hueco …» (`huecoDesconocido(x, lista)` o similar, junto a
     `esHueco`), que leen `equipoBlocker` y `huecoDelSlot` (este con `SLOTS`). `equipoBlocker` usa
     `esHueco`, no el `includes` a mano.
   - Todo motivo para la persona nombra el hueco con `NOMBRE_DE_HUECO`, nunca con la clave: «no lleva
     nada en Escudo». La frase de «no lleva nada en …» sale de una función (junto a `quitarPieza`) que
     leen `unequipBlocker` y `quitarEnArena`.
   - `tools/qa/verify-agent.ts`: el `unequip` con `"slot": "shield"` exige que el motivo no contenga
     la clave española `escudo` en minúscula como hueco (o, mejor, que contenga «Escudo»).
2. **El perfil de una hoja, un sitio y sin E/S** (eficiencia 1, reutilización 3, simplificación 3,
   altitud 5). `tools/arena/borrador.ts` llama a `hojasDeArena(raiz)` (408 `atlas.json`) en cada GET
   y cada guardado solo para sacar el perfil, y el cliente repite la misma lambda.
   - `core/arena.ts` exporta `perfilDeLasHojas(hojas: readonly Pick<HojaDeArena,'id'|'perfil'>[]): PerfilDe`
     (con un `Map`). El cliente lo usa con sus hojas; `borrador.ts`, con `UNIDADES`/`HEROES` de
     `tools/taller/unidades.ts` una vez en el módulo, sin leer arte. Sobra el parámetro `raiz` añadido a
     `Borrador.revisar`.
3. **`cuerpoSinElKit` sin `throw` para su propio `catch`** (simplificación 1, reutilización 8). Devolver
   `{ motivo }` directo; el cuerpo con `...(disparos > 0 ? { shots } : {})`; la comprobación al revés con
   un `mismasCifras(a, b)` junto a `conEquipo` en `hero/equipo.ts`, que es quien sabe qué campos suma
   (si mañana suma otro, la comparación lo ve).
4. **`unidadNueva` sin casts ni ternarios intercalados** (simplificación 2, altitud 3). Desde una hoja,
   `unidadPorDefecto(hoja)` con id y nombre nuevos, `equipo: {}`, sin habilidades y liderazgo/coste de
   `CUERPO_COMUN`; la carga, de `KIT_DEL_PERFIL[perfil].traits` vía `rasgosDelCuerpo`, no de
   `perfil === 'montado-lanza'`. Desde una criatura, su propia rama.
5. **Una sola pregunta por las dos manos al equipar** (eficiencia 6, reutilización 6, altitud 6).
   `ponerPieza` es la pregunta; `equiparEnArena` la llama y, si lanza, reenvuelve con el nombre de la
   unidad (o `ponerPieza` acepta el nombre del portador). Sin `manosBlocker` delante.
6. **Versiones del enlace** (simplificación 4): `version` entera en `1..VERSION_DEL_ENLACE` en una
   comprobación; los umbrales con nombre (`CON_EQUIPO = 5`, `ESCALA_DE_HOY = 4`, o los que encajen)
   usados con `>=` en las tres preguntas.
7. **Borrador: una clave y avisos como frases** (simplificación 5, 6, 10).
   - `revisarBorradorDeArena` y `validarBorradorDeArena` comparten la constante de la clave `id`.
   - `migrarUnidadDeArena` devuelve el aviso como frase completa; el borrador y el enlace los juntan
     con `' '`, sin `charAt(0).toUpperCase()`.
   - `avisos` obligatorio en `borrador.ts` (los demás borradores devuelven `[]`).
8. **La tarjeta del catálogo, una plantilla** (simplificación 7): `tarjetaDeUnidad({ … figura, sello?,
   incompleta })` para hoja y nueva; en `main.ts`, una `listaDeUnidades()` que da el `extra` de las dos
   vistas. Las ids de hoja en un `Map`/`Set` creados al cargar (`hojaPorId`, `porQueNoSeMonta`,
   `tarjetasNuevas`), de paso (eficiencia 4).
9. **La ficha calcula el combate una vez** (eficiencia 2, simplificación 10): `const combate =
   unidadDeCombate(u)` y `lecturaDelNivel(combate)` / `resumenDeUnidad(combate)`. Se borra
   `lecturaDelNivelDeLaHoja`.
10. **`velocidades.ts` sin cifras derivadas en prosa** (simplificación 8, reutilización 4). Se quita el
    sufijo «con el escudo de su perfil pelea con N» de las ~15 filas y la historia del comentario de
    cabecera. Un test comprueba las casillas de combate de cada hoja por defecto con
    `unidadDeCombate(unidadPorDefecto(h))` (si el de `arena.test.ts` ya lo hace con `CASILLAS_DE_ANTES`,
    basta con citarlo en el comentario de la tabla).
11. **Prosa derivada de la regla** (altitud 7): el «(sin escudo)» de `agent.ts` sale de los huecos que
    faltan en `EQUIPO_BASE`; la frase «un arma a dos manos no deja llevar escudo, y el escudo resta
    velocidad» es una constante del núcleo junto a `manosBlocker`, que leen la prosa del agente y la
    ficha de la arena.
12. **`capturas.ts` deriva el ataque de la pelea** (reutilización 2): `ATAQUE_EN_LA_PELEA` / `conLaEspada`
    salen de `unidadDeCombate(...)`, no de «campo + espada».
13. **Hechos sueltos en un sitio** (simplificación 10, reutilización 5, 7):
    - `CALIDADES_DE_BOTIN` en `data.ts`, que leen `data.ts` y `PIEZAS_DE_BOTIN`.
    - La forma de un id (`/^[a-z0-9-]+$/`), una función exportada de `core/arena.ts` que leen los tres
      usos de `arena.ts` y `client/render/personajes.ts`.
    - `crearUnidad` y `fichaDeClave` parten `tipo:id` con un mismo helper.
14. **Comentarios con historia → `docs/historia.md`** (simplificación 9): cabecera de `arena.ts`
    («ciclo 2…»), `KIT_DEL_PERFIL` («antes eran `POR_PERFIL`…», la cita), `CUERPO_COMUN` (las
    alternativas probadas), el párrafo de versiones de `VERSION_DEL_ENLACE`, `CALIDADES` y la velocidad
    en `data.ts`. En el código, la regla vigente; la justificación con fechas, en la entrada «Nueva
    unidad» de la historia, que ya existe.

## Se descartan, con motivo

- **Guardar en `velocidades.ts` las casillas de pelea y derivar el cuerpo** (altitud 4). El hecho que
  decidió el usuario es la velocidad **del cuerpo por personaje**; guardarlo así es la fuente correcta.
  Lo que sobra es la prosa derivada (punto 10), no la tabla.
- **Opciones de piezas precalculadas, `cuerposDeLaNueva` memoizado, `armory` subido a constante,
  doble validación al migrar** (eficiencia 3, 4 en parte, 5, 7): microsegundos, sobre gestos o una vez
  por lectura de lo viejo.
- **`SLOTS_DEL_CONTRATO` escrito a mano en `verify-agent.ts`**: deliberado; el QA mira el contrato
  desde fuera.
- **Unir `validarEquipo` con `danioValido`**: uno acumula problemas y el otro lanza; modos distintos.
