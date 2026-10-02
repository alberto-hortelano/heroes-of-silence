# La tropa se hace héroe (ciclo B de «la tropa crece»)

## Petición literal

`NuevaJugabilidad.md`, sección «Experiencia»:

> «Si llegan a nivel maximo se convierten en heroes al llegar a la base. El heroe
> lo crea la ia en base al personaje.»

Decisiones del usuario (02-10-2026), en `docs/agents/2026-10-02-la-tropa-crece/requisitos.md`:

- **«Solo con narrador».** Sin agente, la tropa se queda en nivel 5 y no pasa nada
  más. No hay respaldo de reglas que invente un héroe.
- **Todo héroe empieza en el nivel 5**, también el veterano que se hace héroe:
  «Si la tropa pasa a heroe con nivel 5, la base de heroe deberia ser 5».
- Se parte en dos ciclos: el A está hecho (`e9e5d6c`) y este es el B.
- Hoy el usuario: «sigue con 1 y 2» (1 es este ciclo y 2 el del equipo, que va
  después).

## Criterios de aceptación

1. **Cuándo ocurre.** Un individuo con veteranía de nivel 5 (el tope de la tropa)
   está en su base. Puede estar en la tropa de un héroe propio que está allí o en
   la guarnición. El arquitecto decide si se comprueba al empezar el turno del
   dueño o al llegar, y lo escribe. Solo afecta a jugadores que lleva el agente.
2. **Petición nueva al narrador.** Hay un tipo nuevo en `REQUEST_KINDS`, con su
   `case` en `decidir`. El test que compara las dos listas en las dos
   direcciones tiene que seguir mordiendo. Lo que envía:
   - la criatura y su nombre;
   - el nivel y la experiencia;
   - la hoja de servicios: batallas, bajas y héroes derrotados (los nombres si
     existen);
   - la facción;
   - la lista acotada de tipos de héroe que puede elegir.

   Lo que pide de vuelta, con esquema zod y prosa en `RESPONSE_FORMAT`:
   - **nombre**, acotado como los nombres de #97;
   - **historia**, texto corto acotado;
   - **tipo de héroe**, uno de la lista.
3. **Tipos de héroe en datos, inertes.**
   - Se usan los cuatro héroes por facción de `NuevaJugabilidad.md`: Templarios
     para `knight` y No muertos para `necromancer`.
   - Van en `data/` y se extraen con expresión regular, como
     `tools/datos/habilidades.ts`. No se teclean.
   - El tipo se guarda en el héroe, se ve y se serializa, pero **todavía no da
     ninguna habilidad**: el motor de habilidades llega más tarde.
   - Los héroes que ya existen (inicial y contratado) llevan un tipo por defecto.
     El arquitecto lo decide.
4. **El héroe nace.**
   - Aparece en la base, con la experiencia del individuo (≥ 220, así que nivel
     5 o más), el nombre, la historia y el tipo que dio el narrador, y la facción
     del dueño.
   - Lleva el ejército vacío y no se mueve el día en que nace.
   - El individuo sale de donde estaba.
   - Si el ascenso deja al héroe que lo llevaba con el ejército vacío, no pasa
     nada: está en la base. El arquitecto decide si eso necesita una regla.
   - La crónica lo cuenta con un hecho nuevo sellado por `emit`.
5. **Topes y negativas.**
   - Si el jugador ya tiene `MAX_HEROES_PER_PLAYER`, no se pide nada y la tropa
     espera. El agente lo sabe porque lo ve en su turno o en la nota.
   - Si la respuesta es mala o no llega a tiempo, la tropa sigue igual y el agente
     recibe el motivo en «CÓMO FUE LO ANTERIOR». No se reintenta hasta la
     siguiente vez que ese individuo vuelva a estar en la base. El arquitecto
     define qué significa «volver» y cómo evitar preguntar todos los turnos por el
     mismo.
   - Un individuo nunca genera dos héroes.
6. **Sin agente no cambia nada.**
   - `pnpm banco` y el barrido de la IA de reglas siguen exactamente igual.
   - El ancla no se mueve, salvo que el tipo de héroe entre en el volcado. En ese
     caso se re-ancla una vez, mirando que solo cambie ese campo.
7. **Se ve.**
   - El agente ve el tipo de cada héroe en su turno.
   - El cliente y el espectador enseñan el nombre, el tipo y la historia del
     héroe nacido de la tropa, al menos en su panel.
   - La crónica pinta el hecho.
8. **Se demuestra.**
   - Tests de núcleo con fixture: un veterano de nivel 5 construido a mano en la
     base produce la petición, una respuesta buena crea el héroe y quita al
     individuo, una mala no cambia nada, el tope de héroes bloquea y no se
     pregunta dos veces.
   - `pnpm qa` lo cruza de verdad: la partida del arnés rara vez produce un nivel
     5 por sí sola (0,06 por partida), así que el arnés fuerza el caso. El
     arquitecto decide cómo, sin abrir una puerta de trampas en producción.
   - `pnpm verify`, barrido 0/40, `pnpm qa` y `pnpm capturas` en verde.

## Fuera de alcance

- El efecto de los tipos de héroe y sus habilidades: es el motor de habilidades.
- El equipo: es el ciclo siguiente.
- La identidad desde el reclutamiento (A6, aplazada del ciclo A): el arquitecto
  decide si este ciclo la necesita. Si no la necesita, se queda fuera.
- Que la IA de reglas convierta tropa en héroe: sin narrador no ocurre.
- El arte del héroe nuevo: usa la figura del héroe de siempre. La rama `arte` no
  está integrada y no hay créditos de ChatGPT.

## Contexto del coordinador

- `main` está en `e9e5d6c`. Banco `0c8fc759…`, 709 tests.
- Hay que tener en cuenta los dos usos del canal: el agente pide `map_generate`
  al arrancar y `adventure_turn` y `battle_turn` en partida. La petición nueva va
  dentro del turno del jugador del agente y no puede dejar colgado el director si
  el agente no contesta, igual que el respaldo de los demás kinds.
- La hoja de servicios (`Troop.veterania`: `batallas`, `bajas`, `heroes`) se
  mantuvo en el núcleo para este ciclo, pero no viaja al espectador.
- No tocar `/home/al/code/heroes-arte`, `tools/qa/tmp-scratch` ni
  `NuevaJugabilidad.md`, que solo se lee.

## Preguntas abiertas (con la suposición por defecto)

- **¿Elige el narrador también los atributos?** No: cuerpo, ataque y defensa son
  los de un héroe de nivel 5+ por la regla de siempre.
- **¿Hereda el héroe las cifras de la criatura?** No.
