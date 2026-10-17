# Arena: las armaduras dan puntos de armadura que se restan del daño

Issues: https://github.com/alberto-hortelano/heroes-of-silence/issues/262

## Petición (14-10-2026)

> Que las armaduras den puntos de armadura, no de vida, los puntos de armadura se restan del daño final

## Lo que hay hoy

Las armaduras de la arena (calidad `arena`, `data/equipo.json`) suman PV y algunas también defensa:

| Pieza | Hoy | Con armadura (PV / 10) |
|---|---|---|
| Brigantina | +70 PV | 7 |
| Arnés de placas | +100 PV, +1 def. | 10, +1 def. |
| Gambesón | +40 PV, +1 def. | 4, +1 def. |
| Jubón de arquero | +20 PV | 2 |
| Barda | +220 PV, +5 def. | 22, +5 def. |

## Decisiones del usuario

| Pregunta | Respuesta |
|---|---|
| Alcance | **Solo la arena.** Las piezas del juego (cota de malla, coraza bendita…) siguen con PV, y `pnpm banco` mantiene su hash. |
| Cifras | **PV / 10**, inventadas y en el JSON; se ajustan después de probar. |
| Mínimo | **0**: una armadura gruesa puede parar del todo un golpe flojo. |
| A qué se aplica | **A todo el daño**: golpes cuerpo a cuerpo (también el contraataque, la carga y cada golpe de Rápido o del doble golpe), disparos (cada tiro con dos disparos) y hechizos y poderes que hacen daño. |

## La regla

- Una pieza de la arena gana una cifra nueva, **armadura** (`CIFRAS_DE_PIEZA`, `NOMBRE_DE_CIFRA`), y las armaduras de la arena dejan de sumar PV. La defensa que ya tienen se queda.
- La armadura de una unidad es la suma de la de sus piezas, como las demás cifras (`conEquipo`). Como el resto del equipo, no cuenta para el nivel.
- **Cada golpe por separado**: daño final = `max(0, daño − armadura)`. Se resta después de todo lo demás: ataque contra defensa, Fuerte y Rápido, el cruce de la rueda, la carga, la suerte y la muralla.
- Lo que depende del daño quitado (el drenaje de vida, la experiencia y el parte) usa el daño tras la armadura.
- Curar no se toca.

## Criterios de aceptación

1. **En la ficha y el editor de equipo:**
   - la armadura sale como una cifra más, con su pastilla de modificador;
   - las armaduras de la arena ya no enseñan PV;
   - en la tabla de cifras de la ficha (`tablaDeCifras`) hay una fila «Armadura» con su final.
2. **En la previsión de daño** (barra y rueda; `horquillaDeDanio`, `previsionDeLaRueda`), la horquilla ya lleva restada la armadura del objetivo y lo dice (p. ej. «−7 armadura»). Sale de la misma cuenta que el golpe.
3. **Un golpe que se queda en 0** se ve y se cuenta como parado: la cifra en el lienzo y el parte lo dicen. No lanza.
4. **La IA de la arena** juega con ello sin más (`expectedDamage` lo lleva).
5. **Lo de antes se lee**: un borrador o un enlace con una armadura de la arena que traiga PV se convierte a PV / 10 de armadura, con aviso, como las demás migraciones de `migrarUnidadDeArena`/`piezaDeAntes`.
6. **El juego no cambia**:
   - `pnpm banco` con el mismo hash;
   - el contrato del agente no conoce `armadura`;
   - las piezas que no son de la arena no pueden llevarla (lo dice `problemasDePieza`);
   - un guardia en `invariantes.test.ts`, visto morder.
7. **Tests con cifras exactas**:
   - un golpe que baja con la armadura;
   - uno que queda en 0;
   - Rápido, que resta en cada uno de sus dos golpes;
   - un disparo doble;
   - un hechizo de daño;
   - el drenaje de vida con el daño tras la armadura.

## Preguntas abiertas (con suposición)

- **Los escudos** no cambian: siguen dando defensa.
- **Una pieza del juego cambiada en el borrador** (mismo id en `data/borradores/equipo.json`) no puede llevar armadura, porque sigue siendo del juego. Las piezas nuevas de la arena sí.
- **El héroe de la arena** lleva el equipo base del juego, así que no tiene armadura salvo que se le ponga una pieza de la arena.
- **Otras piezas**: la armadura se puede poner en cualquier pieza de la arena (un escudo o un accesorio que la lleven), no solo en el hueco `armadura`. Si se quiere solo en ese hueco, va en `camposDelHueco`.
- **Equilibrio**: con el mínimo en 0, la barda (22) puede volver casi invulnerable a un jinete frente a la infantería floja. Se mide después, IA contra IA, cuántas peleas no terminan, y se ajusta en el JSON.


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

## Decisiones tras el plan (14-10-2026, del coordinador; recomendaciones aceptadas)

- **Por calidad**: las piezas de la arena llevan armadura y no PV, y las demás PV y no armadura.
- **Lo de antes** se convierte a PV / 10 redondeado al entero más cercano, también en las unidades de antes del equipo (enlaces de la 1 a la 4 y borradores sin cuerpo).
- **El `?montaje=`** sube a la versión 9 (`CON_ARMADURA`). Ninguna otra hermana la sube.
- **La línea de la armadura en `client/arena/rueda.ts`** no la pongas. La añade el coordinador al juntar, en la cabecera de contrincantes de la hermana `rueda-sectores-y-contrincantes`.
