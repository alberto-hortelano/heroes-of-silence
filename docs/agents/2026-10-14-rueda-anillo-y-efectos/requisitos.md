# Rueda del golpe: anillo nuevo, R. guardia por éxito y Finta que deja andar

Issues: https://github.com/alberto-hortelano/heroes-of-silence/issues/263

## Petición (14-10-2026)

> Ofensivo suma en este ataque
> defensivo suma hasta el proximo turno del personaje
> Romper guardia quita ataque en el proximo turno del personaje atacado y en la contra
>  -3 ataque si es exito maximo, -2 ataque si es alto, -1 normal y 0 en los demas
> finta permite mover despues de atacar con -1 al movimiento si es exito maximo y -1 por cada nivel menos de exito hasta -5, automaticamente se muestran las casillas de movimiento posibles. Si ha movido antes solo el movimiento que le quede y si no le queda pues nada
> los demas siguen igual.
> cambia el orden de la rueda
>
> ```
>           Ofensivo
> R. Guardia        Fuerte
>           Normal
> Rapido            Finta
>          Defensivo
> ```

## Decisiones del usuario (preguntadas)

| Pregunta | Respuesta |
|---|---|
| Cuánto dura Defensivo | **Hasta que empieza el próximo turno del personaje.** Hoy dura hasta que termina. |
| Finta después de andar | **Lo que le queda menos la penalización.** Con velocidad 6, 2 casillas andadas y éxito alto (−2), anda 4 − 2 = 2. Si no anduvo, velocidad − penalización. Si no le queda nada, no anda. |
| Finta y Romper guardia en la **respuesta** (los elige quien recibe) | **Ninguno de los dos actúa**: solo cuentan para el cruce y el contraataque. |
| Ofensivo y Defensivo en la respuesta | **Tampoco actúan**: «la contra no da bonificadores, solo el daño que tenga marcado; rápido son dos y fuerte hace más daño. Si no, alguien defendiendo que hiciese varios ataques defensivos empezaría a sumar defensa cada vez que le ataquen». |

## La regla nueva

**El anillo**, en el sentido de las agujas del reloj, va de Ofensivo a Fuerte, Finta, Defensivo, Rápido y R. guardia; Normal sigue en el centro. Los opuestos son:

- Ofensivo y Defensivo;
- Fuerte y Rápido;
- Finta y R. guardia.

Las distancias en el anillo (0, 1, 2, 3) siguen dando los puntos 0, 1, 3 y 4, y con Normal, 2. El contraataque sigue en `4 − p`. Cambia solo `ANILLO` (`src/core/battle/rueda.ts`); `puntoDelCruce` sale de él.

**El éxito** es el punto del cruce de quien elige el tipo: el de quien pega, `p` (4 máximo, 3 alto, 2 medio o «normal», 1 bajo, 0 mínimo).

| Tipo | Hoy | Ahora |
|---|---|---|
| Normal | sin efecto | igual |
| Fuerte | ×1,25 | igual |
| Rápido | 2 golpes a ×0,6 | igual |
| Ofensivo | +1 ataque en el golpe que se da | igual: suma en este ataque |
| Defensivo | +1 defensa desde ya hasta que **termina** su próximo turno | +1 defensa desde ya hasta que **empieza** su próximo turno |
| R. guardia | −1 **defensa** al rival al acabar el intercambio, hasta que termina su próximo turno | quita **ataque** al atacado **desde ya**: en su contraataque de este intercambio y en su próximo turno. **−3** con éxito máximo, **−2** alto, **−1** medio y **0** bajo o mínimo |
| Finta | −1 ataque al rival | **anda después de golpear**: le quedan las casillas que no ha andado, menos **5 − p** (−1 máximo, −2 alto, −3 medio, −4 bajo, −5 mínimo), y nunca menos de 0. Ya no quita ataque |

En la **respuesta** (lo que elige quien recibe), **el contraataque no da bonificadores**: hace el daño que marca su punto (`4 − p`).

- Solo actúan **Rápido** (el contraataque son dos golpes a ×0,6) y **Fuerte** (×1,25).
- **Ofensivo, Defensivo, Finta y R. guardia** no tienen efecto: solo deciden el cruce y el punto del contraataque.
- Así, quien recibe muchos ataques y responde con Defensivo no acumula defensa. Hoy Defensivo en la respuesta da +1 de defensa y Ofensivo +1 de ataque al contraataque; los dos se quitan.

## La Finta, en la partida

- **Atacar ya no cierra el turno** de quien golpeó con Finta y tiene casillas: le abre un tramo solo de andar. No puede volver a atacar, ni disparar, ni lanzar un poder; puede andar o terminar.
- **Las casillas a las que puede ir salen solas** al acabar el desenlace del cruce, sin otro clic: se resaltan como las de un movimiento normal. Clic en una, o terminar el turno.
- Con 0 casillas (por la penalización o por lo andado), el turno se cierra como hoy y no se resalta nada.
- **La IA** con Finta anda con su regla de movimiento de siempre, restringida a esas casillas; si no sabe a dónde, termina. No se le enseña nada nuevo.
- **La carga** no vale en ese tramo: no hay golpe que cobrarla.

## Criterios de aceptación

1. **El anillo y las notas:**
   - la rueda se pinta con el orden nuevo;
   - cada sector dice su efecto nuevo en su nota, según la fase (`efectoDeGolpe(tipo, papel, contraataca)`);
   - la nota de R. guardia y la de Finta dicen qué darían con cada nivel de éxito;
   - en la respuesta, las notas de Ofensivo, Defensivo, Finta y R. guardia dicen «solo cuenta para el cruce», y las de Fuerte y Rápido dicen lo que hace su contraataque (o «solo cuenta para el cruce» si no contraataca).
2. **R. guardia** baja el ataque del atacado ya en su contraataque, y lo sigue bajando en su próximo turno. Se ve en la previsión del contraataque y en el parte («R. guardia: −2 ataque»). Si vuelve a caerle, se refresca, no se acumula.
3. **Defensivo** desaparece cuando el personaje se vuelve activo, aunque luego espere.
4. **Finta**:
   - tras el desenlace, salen las casillas a las que puede andar;
   - la cuenta es `max(0, lo que le queda − (5 − p))`;
   - andar cierra el turno;
   - si no le queda nada, el turno se cierra solo.
5. **Las cifras** (los pasos de R. guardia por nivel y la penalización de la Finta) van en `data/rueda.json`, marcadas como inventadas, y los pesos de la IA siguen ahí.
6. **Tests con cifras exactas**:
   - la tabla del anillo nuevo (de cada tipo contra cada uno);
   - R. guardia en los cinco niveles, en el contraataque y en el próximo turno;
   - Defensivo, que se va al empezar su turno;
   - Finta sin andar antes, después de andar y con 0 casillas;
   - Ofensivo, Defensivo, Finta y R. guardia en la respuesta, sin efecto (ni ataque ni defensa de más, ni un efecto puesto);
   - Fuerte y Rápido en la respuesta, en el contraataque;
   - `autoResolve` en `'rueda'` termina y es determinista por semilla.
7. `CLAUDE.md` (la fila de la rueda en «Reglas del juego») y `docs/historia.md` se actualizan. El juego no cambia y `pnpm banco` mantiene su hash.

## Preguntas abiertas (con suposición)

- **«Normal» en R. guardia** es el éxito **medio** (`p = 2`), no el tipo Normal.
- **R. guardia contra quien no puede contraatacar** quita ataque solo en su próximo turno.
- **«Hasta el próximo turno»** de R. guardia: hasta que el atacado **termina** su próximo turno, porque es en ese turno cuando ataca.
- **La Finta y la rueda pendiente**: tras el golpe con Finta no se abre otra rueda; el tramo de andar no puede golpear.


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

- **El tramo de la Finta**: solo andar o terminar. Ni hechizo del héroe ni rendirse (del usuario); tampoco disparo, poder, esperar, defender, puertas ni escaleras.
- **Defensivo** se va al empezar cualquier turno de la unidad, también el turno extra de la moral alta y el que la moral baja paraliza (recomendación del plan, aceptada).
- `renderEleccion(s, p)` la toca también la hermana de los sectores: no cambies su firma si no hace falta.
