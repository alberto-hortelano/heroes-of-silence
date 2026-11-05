# Hallazgos de /simplify — fase A (consolidados y decididos por el coordinador, 05-11-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altura). Aquí están deduplicados y con la
decisión tomada. Lo que se aplica no cambia el comportamiento pedido, salvo H1, que arregla un caso
en que el grupo entraba en una barrera con el día empezado (contra I7).

## Se aplican

**H1. El precio de la barrera, el presupuesto del día fijado al empezarlo** (altura 1).
`precioDeLaBarrera` = `max(maxMovePoints, movePoints)` deja entrar con el día empezado: recluta algo
más lento (`maxMovePoints` 1500 → 1200), anda 200, y el precio queda en max(1200, 1300) = 1300, lo
que le queda. Fija el presupuesto del día en el héroe donde ya se escribe `movePoints` al empezar el
día y al contratar (`game.ts` ~1180, ~2171, ~2196) y usa ese número de precio; sobran el `max` y el
`Partial<Pick<Hero,'movePoints'>>`. Si el campo nuevo viaja (contrato, espectador), que
`adaptar.ts` siga siendo la inversa exacta; si no hace falta que viaje, que no viaje. Test que lo
muerda: el caso del ejemplo.

**H2. Una sola regla de «qué casilla se pisa»** (simplificación 1, reutilización 3 y 4, altura 3,
eficiencia 6). `isEnterable(map, p, pisaBarreras = false)` lleva la única regla (rol del recinto
primero; después `pisaBarreras || isWalkable`); la guarda de `findPath` es
`isEnterable(map, to, barrera !== null)` y `esBarreraQueSeCruza` desaparece. Para la frase, una
`barreraEn(map, p): Barrera | null` (o lo que dé el terreno ya estrechado), sin el
`inBounds ? terrainAt : null` + `esBarrera` + `esBarreraQueSeCruza` repetido en `porQueNoLlega` y
`moveHero`. En `dijkstra`, el precio se pone en la rama `continue` del primer bucle (la que ya separa
lo que no se pisa), sin un segundo recorrido; sigue antes del recinto y un camino no la abarata. Con
`barrera === null`, ni una línea nueva: el banco con el mismo sha.

**H3. `moveHero` con `hoy === 0`, una frase que no sabe de terrenos** (altura 2): «el primer paso, a
(x,y), cuesta N y te quedan M» (con «el día entero» si es una barrera, leído de H2 si hace falta;
que no haga falta una rama por terreno). Fuera `fraseDeLaBarrera` si queda sin uso, y los imports de
terreno de `game.ts` que solo servían a esto.

**H4. `porQueNoLlega` nombra la infiltración cuando la abriría** (altura 4, eficiencia 5): en el
paso «sin nada hostil, ¿se llega?», si no se llega, se pregunta otra vez con el precio de un
infiltrado y, si así sí, se dice «solo la cruza un grupo que se infiltra: <blocker>» (para cualquier
destino tras una barrera, no solo para una barrera de destino). El precio se calcula una vez al
principio y se pasa a `caminoEsquivando`/`alcanceDelHeroe`. En `test/game.test.ts` el comentario del
caso cambiado («no se culpa a nadie») se corrige para que diga lo que se comprueba.

**H5. `seInfiltra`, un predicado que corta pronto** (eficiencia 4, altura 8, simplificación 4):
`tipoSeInfiltra(f, t) && army.every(lleva el rasgo)`, sin montar la frase; es lo que leen
`precioDeLaBarrera` y el camino caliente. `infiltracionBlocker` solo para quien enseña el motivo
(panel, contrato, `porQueNoLlega`).

**H6. La subida de la figura en una barrera, dentro de la regla de la profundidad** (altura 5,
reutilización 7, 8 y 10, eficiencia 1, 2 y 3, simplificación 8):
- `delanteEnUnaBarrera` no repite el bucle de `delanteDeLasParedes`: una sola función con el filtro
  (pared; o cualquier clase de volumen en una casilla de barrera).
- Las filas a mirar salen de la caja de cada sprite (`casillasBajo`), no de `FILAS_QUE_TAPAN = 6`.
- El `PerfilDe` se guarda una vez en el `Escenario` (`escenarioDe` ya lo construye) y no se rehace
  por casilla; lo perezoso por casilla, si se queda, es un campo del `Escenario`, no un `WeakMap`
  lateral.
- La caja de la figura se calcula una vez fuera del bucle y la pregunta «¿tapa algo?» corta en la
  primera muestra.
- `pintarRuta` pide solo el pie (no calcula una clave que no lee): separar el pie de la clave de
  `pisada`.
- Devuelve `-Infinity` si no hay nada (fuera los `??`), y sin el `Math.min` que sobra.
- El test de `figuras.test.ts` deja de copiar el `slice(y, y + 7)`.
Si meterlo en `claveDeFigura` obliga a calcularlo para todas las casillas al componer, que no: debe
seguir costando solo en casillas de barrera pisadas.

**H7. `stepCost` acepta el mismo `barrera`** (altura 6), para que siga siendo la misma fórmula que
el Dijkstra (su docstring lo promete).

**H8. Tipos y pequeñas duplicaciones**:
- `GrupoQueSeInfiltra` = `GrupoQueMarcha & Pick<Hero, 'faction' | 'tipo' | 'skills' | …>` (simplif. 3,
  reutil. 2).
- `NOMBRE_DE_BARRERA` una sola vez, junto a `BARRERAS` en `core/map/terrain.ts`, importada por
  `infiltracion.ts` y por `client/desarrollo/regiones.ts` (reutil. 1). La de `core/map/regiones.ts`
  con artículo se deja.
- `validarInfiltradores`: `repetidoEn` (`core/validar.ts`) y `tipoDeHeroePorDefecto` en vez de
  reescribirlos; fuera el parámetro `fichero` que nadie pasa (reutil. 6, simplif. 9).
- `infiltracionVista` encima del JSDoc de `equipoView` o en línea (simplif. 5).
- `filaDeInfiltracion` con una sola fila; el ayuntamiento, con `filaDeCifra` aceptando `string | Html`
  (simplif. 6), y su nota con `NOMBRE_DE_RASGO.infiltrarse` y la lista de barreras de la tabla de H8,
  no a mano (reutil. 9).
- Tests: `amanecer` por `hastaSuSiguienteTurno` (`test/helpers.ts`) (reutil. 11); el comentario
  obsoleto de `GOBLIN` (simplif. 11); `travesiaEn` sin los límites a mano (reutil. 13).

## Se descartan a conciencia

- **Que los datos acepten el tipo por defecto y la IA pida su alcance sin precio** (altura 7): el
  tipo por defecto lo juegan también el agente y la partida rápida, no solo la IA, y «ningún tipo por
  defecto lo lleva» es una decisión de datos aprobada por el usuario (I10). Cuando la IA aprenda a
  infiltrarse (backlog) se revisa.
- **Quitar `Session.infiltracion`** (simplif. 7): es la puerta al núcleo del cliente (CLAUDE.md:
  quien aplica reglas pasa por `session.ts`).
- **Quitar el guardia del entero positivo de `dijkstra`** (simplif. 10): fail-loud, barato.
- **Usar `TROPA_BARATA` por `GOBLIN`** (reutil. 12): que la tropa barata sea un goblin es casualidad;
  el test quiere una unidad con el rasgo.
- **Un extractor común para `validarInfiltradores` y `validarFigurasDeHeroe`** (reutil. 6, la parte
  grande): formas distintas; solo se reutilizan las piezas de H8.
- **La firma de ciudades de `pasosDelMapa` en cada llamada** (eficiencia 7): insignificante.
