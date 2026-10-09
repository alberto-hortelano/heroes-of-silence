# La arena como banco para afinar el combate

## Petición literal

> «Vamos a probar y mejorar el combate» (09-10-2026)
>
> «Me gustaria poder probar combates entre ejercitos para ir definiendo cosas poco a poco antes de meternos en las batallas del juego. Quiero centrarme en afinar y definir el sistema»

Respuestas a las preguntas del coordinador (09-10-2026):

- **Unidades**: «Las dos cosas»: las hojas de las cinco facciones con cifras de borrador y también las criaturas del catálogo del juego.
- **Modo**: «Solo jugarlas»: peleas una a una, sin simulación en lote.
- **Alcance de la primera versión**: héroe con estadísticas, magia, interruptores de reglas y previsión de daño.

## Contexto

- La exploración previa está en `docs/agents/2026-10-09-combate-exploracion/`. `qa-juego.md` recoge siete batallas jugadas con clics. `medidas-nucleo.md` recoge 726 batallas medidas, las divergencias con fheroes2 sin declarar y los fallos pequeños del motor.
- La arena ya existe (`pnpm arena`, `src/core/arena.ts`, `src/client/arena/`, `SesionDeArena` en `session.ts`; ver «La arena» en `docs/historia.md`). Hoy hace esto:
  - monta dos bandos con las hojas de las cinco facciones;
  - deja cambiar sus cifras y guardar el borrador;
  - deja elegir Yo o IA por unidad;
  - no tiene magia: `hechizos` vale `null`.
- Las unidades de la arena entran en `createBattle` por la vía de los personajes (`members`). El catálogo del juego (`data/creatures.json`) solo tiene caballeros y nigromantes.
- El objetivo es decidir las reglas jugando. El juego y `pnpm banco` **no cambian** con este trabajo: cada regla se adoptará después, una a una, por decisión del usuario.
- Máquina compartida:
  - siempre `--port` explícito y distinto de 3100;
  - nada de matar procesos por nombre;
  - Playwright sin pantalla, nunca el Chrome del usuario;
  - nada de push.

## Criterios de aceptación

1. **Catálogo en la arena.** Se pueden montar criaturas de `data/creatures.json` (todas las de caballeros y nigromantes, también las mejoradas), con sus cifras reales y sus rasgos. Se distinguen de las hojas de borrador en la lista y en la ficha.
   - En una misma pelea pueden mezclarse unidades del catálogo y del borrador.
   - Editar una criatura del catálogo en la arena **no escribe** en `data/creatures.json`. Si se permite editarla, se dice que es una prueba que no se guarda en el catálogo.
2. **Héroe por bando.** Cada bando puede llevar un héroe (o ninguno) con ataque, defensa, poder y conocimiento editables.
   - Esas cifras actúan en la pelea como en el juego: el ataque y la defensa en el daño, el poder en la duración y la fuerza de los hechizos, y el conocimiento en los puntos de hechizo (10 × Conocimiento).
   - La ficha enseña los valores efectivos.
3. **Magia.** El héroe de un bando lleva un libro con los hechizos que elija la persona entre los de `data/` (por defecto, todos).
   - Puede lanzarlos con la misma interfaz que la batalla del juego, con sus puntos de hechizo y la regla de una vez por ronda que tenga el motor.
   - La IA de un bando lanza con la misma heurística que en el juego.
   - Un lanzamiento ilegal se rechaza con el motivo de `castBlocker`.
4. **Interruptores de reglas.** Antes de pelear se elige, para cada regla de la lista, entre la versión **nuestra** (la del juego hoy) y la de **fheroes2**:
   - (a) el tirador a más de 5 casillas pega la mitad, frente a sin penalización por distancia y mitad si tiene un enemigo pegado;
   - (b) la fórmula de ataque y defensa: la actual (2,5 % por punto de defensa hasta ×0,3; ataque hasta ×4) frente a la de fheroes2 (5 % hasta ×0,2; ataque hasta ×3);
   - (c) la probabilidad de moral baja: 1/24 por punto frente a 1/12;
   - (d) defender: +20 % de defensa (y el turno extra por moral) frente a la versión de fheroes2;
   - (e) Bendición y Maldición: ±1 de suerte frente a daño máximo y mínimo.

   Requisitos de los interruptores:
   - Las cifras de fheroes2 se **extraen de la fuente** (fheroes2 `9754feff`) con su cita, no se teclean de memoria (regla de CLAUDE.md).
   - La URL de la arena guarda los interruptores junto con la semilla, para que una pelea se pueda reproducir.
   - Con todos los interruptores en «nuestra», la arena pelea exactamente como el juego.
   - `pnpm banco` sale con el ancla igual, y ningún camino del juego, del servidor ni del agente puede encender un interruptor.
5. **Previsión de daño.** Al apuntar a un enemigo, con cuerpo a cuerpo, disparo o hechizo, la barra o una etiqueta junto al objetivo dice:
   - la horquilla de daño;
   - las bajas o los PV que le quedan;
   - si habrá contraataque y su horquilla;
   - qué modificadores se aplican y su efecto: distancia, tirador pegado, carga, suerte posible, defender, hechizos activos y los interruptores en curso.

   Requisitos de la previsión:
   - La cuenta sale del núcleo, de la misma función que aplica el daño. No es una copia en el cliente.
   - Un test compara la previsión con el daño real aplicado.
   - Se ve en la arena y en la batalla del juego.
6. **Lo de siempre.**
   - `pnpm verify` y `pnpm verify:lento` en verde, y `pnpm banco` con el ancla igual.
   - `pnpm capturas` sigue pasando, y ejercita al menos un héroe con magia y una unidad del catálogo en la arena.
   - Sin errores en consola.

## Fuera de alcance

- Simular en lote (N peleas IA contra IA con estadísticas). Lo descartó el usuario.
- Cambiar una regla del juego. Los interruptores solo comparan; adoptar una es otra tarea.
- Escribir en `data/creatures.json` desde la arena.
- El asedio (#7), las defensas de la persona en el juego (#116), la emboscada del día 1, el ritmo de las animaciones y el control de velocidad, #103 y #117.
- Arreglar la IA de batalla (#115) y subir el Poder de los héroes en el juego (#201).
- Quitar `count` del motor (#119), salvo que el plan demuestre que la previsión lo necesita.

## Preguntas abiertas (con la suposición por defecto)

- **¿El héroe pelea en el tablero?** En el juego el héroe es una unidad más que se mueve y pega. *Por defecto*: igual que en el juego, el héroe de la arena es una figura en el tablero, elegida entre las hojas de héroe o un héroe genérico, con sus cuatro estadísticas encima.
- **¿Los interruptores van por pelea o por bando?** *Por defecto*: por pelea; los dos bandos con las mismas reglas.
- **¿La regla (d) de fheroes2?** Si fheroes2 tiene una defensa con otra cifra, se copia; si no tiene equivalente, la versión «fheroes2» es «sin bonificación». La crítica o el plan lo verifican en la fuente.
- **¿Hay más reglas dudosas?** La lista de los interruptores es la de arriba. El plan puede proponer más, pero no las implementa sin el visto bueno del usuario.

## Decisiones del usuario sobre el plan (09-10-2026)

Prevalecen sobre `plan.md` donde choquen.

1. **Ataque y defensa del héroe: sexto interruptor (f).** Hay dos versiones:
   - «nuestra»: como en el juego hoy, solo cuentan en los golpes del propio héroe;
   - «fheroes2»: se suman a toda su tropa, con las cifras y la regla extraídas de la fuente.

   Entra en la URL, en la previsión y en el test que compara la previsión con el log (ahora 64 combinaciones, o una muestra que cubra cada interruptor encendido y apagado si 64 × 300 es caro en `verify`; el total, en `verify:lento`).
2. **Perdón de la IA en la moral baja: no se copia.** El modo fheroes2 de (c) solo cambia la probabilidad.
3. **La Maldición de la momia sigue al interruptor (e).** Con (e) en fheroes2, la Maldición que echa el ataque de la momia también da daño mínimo, como la del hechizo.
4. **La figura del héroe se elige entre las hojas de héroe** de las cinco facciones. Ya no va al backlog: entra en esta tarea (F3/F4). Sin hoja elegida, la genérica.
5. **No-muertos y Maldición:** la suposición del arquitecto se mantiene (siguen inmunes en los dos modos) y el ingeniero la comprueba en la fuente. Si fheroes2 no los hace inmunes al daño mínimo, se dice en `implementacion.md` y no se cambia sin preguntar.
6. **Interruptores por pelea**, los mismos para los dos bandos.
