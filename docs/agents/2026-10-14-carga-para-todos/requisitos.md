# Arena: todos cargan y el jinete cobra más

Issues: https://github.com/alberto-hortelano/heroes-of-silence/issues/260

## Petición (14-10-2026)

> Ahora mismo en la arena no he podido hacer ninguna carga
> He probado con el guerrero con escudo y en ningun momento se marca la carga

## Lo que pasa hoy (comprobado)

- **Solo carga quien tiene el rasgo `charge`.** Es el rasgo del caballo (`KIT_DEL_PERFIL`, `src/core/arena.ts`), así que en la arena solo lo tienen los perfiles `montado-lanza` y `montado-arco`: el hermano de carga, el jinete de plaga, el jinete élfico y el jinete de hiena. El guerrero con escudo (`espada-escudo`) no lo tiene, por eso nunca se le marca.
- **Con un jinete, la regla funciona.** Medido con el núcleo en 40 semillas, con el hermano de carga de la persona contra tres de infantería en IA, defendiendo en vez de avanzar: tiene una carga marcada en 80 de 120 comienzos de turno, en todos los que tiene un enemigo al alcance.
- **La IA casi nunca carga:**
  - En 40 peleas IA contra IA, el hermano de carga no tuvo ni una ocasión en 504 turnos: avanza hasta ponerse al lado y nunca queda en recta.
  - El jinete élfico tuvo 80 ocasiones y no cargó ninguna: dispara.

## Decisiones del usuario

| Pregunta | Respuesta |
|---|---|
| Quién carga | **Todos los que pegan cuerpo a cuerpo, y el jinete más.** La carga deja de ser exclusiva del caballo. |
| La recta | **Se queda como está**: al menos 3 casillas (`CARGA_MINIMA`) en línea recta por uno de los seis ejes, sin nadie en medio, y el objetivo en esa recta (`cargaDesde`). |
| Alcance | Solo la arena, como lo anterior. El juego no cambia y `pnpm banco` mantiene su hash. |

## La regla

- **A pie:** toda unidad de la arena carga al correr la recta y golpear. Suposición, con cifras inventadas: **+5 % por casilla, con un tope de 3 casillas**.
- **El jinete:** con `charge` cobra como hoy, **+10 % por casilla, con un tope de 5** (`cargaEfectiva`).
- Las cifras de los dos van en un JSON de `data/`, marcadas como inventadas.
- La carga va con el arma de carga si la lleva (la lanza, hueco `carga`) y, si no, con la de cuerpo a cuerpo (`usoDelGolpe`, como hoy).
- El tirador que pega cuerpo a cuerpo con la daga también carga.

## Criterios de aceptación

1. En la arena, el guerrero con escudo y cualquier unidad de a pie tienen la carga marcada (la casilla con su «»N» y el enemigo señalado) cuando la geometría lo permite, y la cobran al golpear.
2. El jinete sigue cobrando más que el de a pie con la misma recta.
3. La previsión de daño, la ficha (como rasgo o como nota) y el parte dicen cuánto cobra cada uno.
4. La rueda del golpe sigue en verde con cargas a pie: andar, elegir y golpear; con Escape se pierde la carga.
5. El juego no cambia:
   - `pnpm banco` con el mismo hash;
   - en el juego solo carga quien tiene `charge`, y su catálogo sigue igual;
   - un guardia en `invariantes.test.ts`, visto morder.
6. Tests con cifras exactas: a pie y a caballo, con 3, 4 y 6 casillas de recta, para ver los dos topes.

## Preguntas abiertas (con suposición)

- **Las cifras de a pie**: +5 % por casilla, con tope de 3. Las decide el arquitecto o se preguntan.
- **La IA**: no se toca en esta tarea. Se mide después cuántas cargas hace la IA (a pie y a caballo, IA contra IA). Si casi nunca carga, se abre otra issue para que la IA busque colocarse en recta.
- **El interruptor**: suposición, sin interruptor; en la arena la carga a pie es siempre. Si se prefiere poder compararla, va como `?golpe=`.


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

- **Tope a pie: 5**, como el jinete (del usuario). A pie, +5 % por casilla de 3 a 5 casillas (de +15 % a +25 %); el jinete, +10 % por casilla (de +30 % a +50 %).
- Sin interruptor, ni en pantalla ni en la URL; solo la perilla interna para la prueba C4 (aceptado).
- El héroe de la arena también carga a pie (aceptado).
- La carrera a pie se anima con el clip `charge` (aceptado).
- **`crearBatallaConReglas`**: la hermana `salir-del-contacto` también le añade un parámetro. No lo conviertas en un objeto de opciones: añade el tuyo al final y el coordinador junta los dos.
