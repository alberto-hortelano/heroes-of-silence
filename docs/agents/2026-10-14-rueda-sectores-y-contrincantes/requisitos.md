# Rueda del golpe: todo el sector responde y los dos contrincantes a la vista

Issues: https://github.com/alberto-hortelano/heroes-of-silence/issues/258 y https://github.com/alberto-hortelano/heroes-of-silence/issues/261


En la rueda del golpe de la arena (`?golpe=rueda`), una parte de cada sector no responde: si pasas el ratón por ahí no se ilumina y si haces clic no elige nada. Solo responde la zona del centro de cada sector.

## Por qué

El sector que se ve y el botón que recibe el ratón tienen formas distintas:

- **Lo que se ve** es un trozo de corona del SVG (`<path class="sector">`, `disco()` en `src/client/arena/rueda.ts`).
- **Lo que recibe el ratón** es un `<button data-golpe>` encima, dentro de `.sector-de-rueda`. Es una caja de 26 % × 24 % del plato, centrada en el sector con `--x`/`--y` y redondeada con `border-radius: 50%` (`src/client/arena/arena.css`, `.sector-de-rueda`).

Por eso las esquinas de la corona, sobre todo el borde de fuera y los picos junto a los radios, quedan fuera del óvalo y no hacen nada. Pasa lo mismo con el círculo de Normal (30 %) frente a su `<circle class="sector centro">`. El iluminado del sector depende del `:hover` del botón (`.rueda:has([data-golpe=…]:hover) .sector[…]`), así que tampoco se enciende en esas zonas.

## Lo que se quiere

- Toda la superficie visible de cada sector (los seis de la corona y el círculo de Normal) responde al `:hover` y al clic, y solo esa: ni un hueco muerto, ni un trozo que elija el sector de al lado.
- Lo demás sigue igual:
  - el teclado (1–7, flechas e Intro, `:focus-visible`);
  - las notas al pasar por el sector (`data-abre-nota`);
  - las `aria-label`;
  - `data-quieta`, que no enciende el sector de debajo del puntero hasta que este se mueve (H1/H1b de QA);
  - que la rueda gire en el desenlace.

## Pistas (las decide el arquitecto)

- Que el área de clic sea la propia forma del sector, por ejemplo:
  - con un `clip-path` en el botón con la misma corona;
  - o haciendo del `<path>` del SVG el objetivo, como enlace o botón SVG con su `data-golpe`.
- Que la geometría de la corona salga de un solo sitio (`sector()`), y que no haya una copia en CSS.

## Cómo se comprueba

- En `pnpm capturas`, un paso de la rueda que haga clic cerca del borde de fuera y en los picos de cada sector y mire que se elige ese tipo.
- Lo mismo en un punto justo fuera de la corona, mirando que no elige nada.

## Petición (14-10-2026)

> Cuando hay muchos personajes luchando no queda claro quien ataca a quien. Que la rueda muestre un icono con los dos contrincantes y que se puedan ver sus caracteristicas con un click y una preview minima en hover. Los mismos iconos que se usan en los botones de edicion de personajes

## Lo que hay hoy

- La cabecera de la rueda (`cabecera` y `quien`, en `src/client/arena/rueda.ts`) dice quién pega a quién con texto: la chapa del bando y el nombre en el campo («Orco ataca a Templario»).
- Con varias unidades del mismo tipo, o muchas en el tablero, no se sabe cuáles son.
- La rueda es un `<dialog>` modal, así que tampoco se puede ir a mirar sus fichas.

## Lo que se quiere

1. **Los dos contrincantes con su icono**, en la cabecera de la rueda, en este orden: quien pega, «ataca a», quien recibe.
   - El icono es el mismo que en los botones de edición del montaje: la figura animada del puesto (`<canvas class="figura" data-figura data-lado>`, el botón «Ver y editar sus cifras» de `paneles.ts`), con el color de su bando.
   - Va en las dos fases (golpe y respuesta) y en el desenlace del cruce.
2. **Vista previa mínima al pasar el ratón** (y con el foco del teclado, como las notas de la rueda). Un bocadillo junto al icono con:
   - nombre;
   - PV actuales y máximos;
   - ataque, defensa, daño y velocidad, con lo que suma el equipo;
   - los efectos activos (Defensivo, Romper guardia, Finta, hechizos), con cuánto duran;
   - si ya contraatacó esta ronda.
3. **Las características enteras con un clic**: abre la ficha del combate de esa unidad (la misma de «Editar» en el panel de la pelea, `fichaDe`) encima de la rueda, sin cancelar la elección. Al cerrarla se vuelve a la rueda en la misma fase.
4. **Reconocerlos en el tablero**: mientras la rueda está abierta, el atacante y el objetivo quedan señalados en el lienzo (el aro o la casilla resaltada del color de su bando), para unir el icono con la figura.

## Lo que no se rompe

- **La elección sigue a ciegas.** Ni el icono, ni la vista previa, ni la ficha enseñan lo que eligió el otro en la fase de respuesta ni con los dos bandos «Yo» (H1 de QA de la rueda).
- **`data-quieta`**: pasar por un icono no despierta los sectores. Las teclas 1–7, las flechas, Intro y Escape siguen igual cuando el foco no está en un icono.
- En un móvil caben los dos iconos y el texto sin partir la cabecera en más de dos líneas, y la vista previa se abre al tocar el icono.
- Todo el marcado sale por `html.ts`; los datos de la vista previa salen del núcleo por la sesión.

## Cómo se comprueba

- `pnpm capturas` con la rueda abierta en una pelea de varias unidades por bando: los dos iconos, la vista previa en hover y la ficha abierta con un clic, en escritorio y en móvil.
- Que al cerrar la ficha se puede elegir y el golpe se resuelve.

## Preguntas abiertas (con suposición)

- **Qué icono**: la figura animada del puesto. Si se prefiere el retrato de identidad de la lista (`<img>` de 64 px de `tarjetaDeUnidad`), se cambia sin tocar lo demás.
- **La ficha desde la rueda**: solo lectura. Editar cifras a media elección no se permite; para eso está el panel de la pelea.


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

- **En el móvil, tocar el icono abre la ficha directamente**: allí no hay vista previa (del usuario).
- **En el desenlace**, solo el icono, sin vista previa ni ficha (recomendación del plan, aceptada).
- **En el móvil**, el velo de la rueda puede tapar el aro del tablero (aceptado).
- La hermana `rueda-anillo-y-efectos` cambia el orden del anillo, los textos de `efectoDeGolpe` y la colocación de las notas (por puesto, `data-puesto`, no por tipo). Coloca tú también por ángulo o puesto, nunca por tipo; el coordinador junta las dos.
- `filasDelStack` dejará sitio para una fila «Armadura», que añade la hermana `armadura` al juntarlas: no hace falta que la pongas tú.
