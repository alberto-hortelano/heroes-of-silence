# Arena: salir de una casilla cuesta 1 + los enemigos en contacto

Issues: https://github.com/alberto-hortelano/heroes-of-silence/issues/259

## Petición (14-10-2026)

> Que al moverse, el coste de salir de una casilla sea el numero de enemigos en contacto con esta.

## Decisiones del usuario

| Pregunta | Respuesta |
|---|---|
| Alcance | **Solo la arena, con un interruptor.** El juego no cambia y `pnpm banco` mantiene su hash. Llevarlo al juego sería otra tarea. |
| Coste | **1 + N**: cada enemigo en contacto suma un paso al paso normal. Sin enemigos al lado, 1, como ahora; con uno, 2; con dos, 3. |
| Si no le llega | **No puede salir.** Si lo que le queda de movimiento no paga salir de su casilla, no se mueve: puede atacar, defender o esperar. Rodear a alguien lo atrapa. |
| Voladores | **Pagan al despegar.** No pagan por las casillas que sobrevuelan, pero sí por la casilla de la que salen si tiene enemigos al lado. |

## La regla

- Cada paso del camino cuesta `1 + N`, donde N es el número de enemigos vivos en las casillas vecinas de la casilla **de la que sale** ese paso. Entrar en una casilla no cuesta de más: se paga al dejarla.
- El movimiento deja de ser «velocidad = casillas»: es un presupuesto de pasos (`pasosQueQuedan`, `turno.gastado`) que se gasta según el coste de cada paso.
- El turno se mueve en tramos. Cada tramo paga desde la casilla donde empieza, así que quien acaba un tramo junto a un enemigo paga por salir en el siguiente.
- El camino es el más barato, no el más corto. Para salir del contacto conviene salir por donde hay menos enemigos.
- **Voladores**: un solo pago, `1 + N` de la casilla de origen más lo que cueste el vuelo hoy, sin mirar por dónde pasan.

## Criterios de aceptación

1. En la arena hay un interruptor para esta regla, apagado por defecto, que va en el enlace de la pelea como los demás.
2. Con la regla encendida, las casillas que se resaltan como alcanzables, el camino que se pinta, lo que hace el núcleo al mover y lo que le queda a la unidad («le quedan N casillas») salen de la misma cuenta con costes.
3. La unidad que no puede pagar salir de su casilla no tiene casillas a las que moverse. Puede atacar a quien tenga al lado, defender o esperar, y la pantalla dice por qué no anda (un `*Blocker`).
4. La IA de la arena juega con la regla sin más: lee las casillas alcanzables del núcleo. No hace falta enseñarle a buscar el contacto.
5. Siguen funcionando con la regla:
   - la carga (la recta de la carrera paga sus costes, y se decide si la carga cuenta casillas o pasos);
   - la rueda del golpe (andar, elegir, golpear; Escape deja a la unidad donde llegó);
   - la muralla, las puertas y las escaleras;
   - Prisa y Lentitud.
6. Tests con cifras exactas:
   - 0, 1, 2 y 3 enemigos al lado;
   - una unidad rodeada que no puede salir;
   - el camino que rodea el contacto porque es más barato;
   - un volador que paga solo al despegar;
   - un tramo que empieza en contacto.
7. El juego no cambia: `pnpm banco` con el mismo hash, y solo la arena enciende la regla (un guardia en `invariantes.test.ts`, visto morder).

## Preguntas abiertas (con suposición)

- **Qué es «en contacto»**: las seis casillas vecinas, con enemigos vivos. Suposición: un enemigo al otro lado de un muro o de una puerta cerrada **no** cuenta; uno en lo alto de la muralla en una casilla vecina, sí. El arquitecto lo confirma con la geometría de `muralla.ts`.
- **La carga**: suposición, cuenta las casillas recorridas como hoy (la distancia de la recta), no los pasos pagados.
- **El interruptor**: no es un par nuestra/fheroes2, así que va aparte de los seis de `reglas`, como `?golpe=`. Lo decide el arquitecto.

## Fuera de alcance

- El juego, el agente MCP y el espectador.
- Que la IA busque a propósito atrapar o rodear.


## Contexto: cinco tareas en paralelo (14-10-2026)

Esta tarea se hace a la vez que otras cuatro, cada una en su propio worktree y su propia rama, todas desde `claude/combat-decision-system-88e11e` (commit 1d89822f). El coordinador las junta después en esa rama y resuelve los conflictos. **No toques lo que es de otra tarea.** Si tu diseño depende de una de ellas o choca con ella, dilo en `plan.md`, en una sección «Choques con las hermanas».

| Tarea (worktree) | Issue | Qué toca |
|---|---|---|
| `rueda-anillo-y-efectos` | #263 | El anillo nuevo de la rueda y sus efectos: R. guardia quita ataque según el éxito; Finta deja andar después de golpear; Defensivo dura hasta que empieza su turno; la respuesta no da bonificadores. Núcleo (`battle/rueda.ts`, `battle.ts`, `effects.ts`, `data/rueda.json`), sesión y notas de la rueda. |
| `rueda-sectores-y-contrincantes` | #258 y #261 | El área de clic de cada sector de la rueda y los dos contrincantes en su cabecera, con vista previa y ficha (`client/arena/rueda.ts`, `arena.css`, `main.ts`). |
| `salir-del-contacto` | #259 | Salir de una casilla cuesta 1 + los enemigos en contacto: el movimiento con costes (`movableFrom`, `reachable`, `pasosQueQuedan`) y un interruptor de la arena. |
| `carga-para-todos` | #260 | Todos cargan en la arena y el jinete cobra más (`cargaDesde`, `cargaEfectiva`, el daño de la carga). |
| `armadura` | #262 | Las armaduras de la arena dan puntos de armadura, que se restan del daño de cada golpe (`damage.ts`, `CIFRAS_DE_PIEZA`, `data/equipo.json`, migraciones del borrador y del enlace). |

Choques que ya ve el coordinador:

- **Ficheros compartidos**: `CLAUDE.md`, `docs/historia.md`, `test/invariantes.test.ts` y `tools/qa/capturas.ts`. Añade lo tuyo en bloques propios; no reordenes ni reescribas lo que ya hay.
- **La versión del `?montaje=`**: si tu tarea necesita subirla, dilo en el plan. Otra tarea puede subirla a la vez, y el coordinador decide los números al juntarlas.
- **`damage.ts`**: lo tocan la carga, la armadura y R. guardia. El orden acordado es: el ataque y la defensa (con sus efectos), luego los multiplicadores (carga, Fuerte, Rápido, cruce, suerte) y la armadura al final, restada de cada golpe.
- **El movimiento**: lo tocan el coste de salir del contacto y el tramo de andar de la Finta, que gasta del mismo presupuesto (`turno.gastado`).

**La máquina es compartida y la usan cinco tareas a la vez**: respeta el presupuesto de pruebas de `CLAUDE.md`. Mientras iteras, solo el test de lo que tocas. `pnpm verify`, una vez por tanda. `banco`, `verify:lento` y `capturas`, una vez al cerrar. Si un servidor necesita puerto, elige uno libre (no el 3100 ni el 3187) y mátalo por su grupo. Para Vite, usa un `cacheDir` propio, no `node_modules/.vite` compartido.

**No hagas commits**: los hace el coordinador.

## Decisiones tras el plan (14-10-2026, del usuario y del coordinador)

- **«En contacto» = quien te puede golpear cuerpo a cuerpo desde donde está** (`canReachMelee`, la regla del trabado; del usuario). El enemigo en lo alto del muro de al lado no cuenta. El del otro lado de una puerta cerrada sí, porque hoy se golpea a través de ellas; eso es otra issue.
- **Subir y Poner escalera** estando rodeado no pagan el contacto: ya gastan el turno entero (recomendación aceptada).
- **La Finta** de la hermana `rueda-anillo-y-efectos` abre un tramo de andar tras golpear. Ese tramo pasa por `movableFrom` y paga el contacto sin más; tú no tienes que hacer nada para ella.
