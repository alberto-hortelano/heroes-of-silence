**#123 VIGENTE · #126 VIGENTE (más pequeño de lo que parece) · #128 VIGENTE (la lista son ejemplos, no el alcance)**

Comprobado sobre 857a849 en el worktree `heroes-pequenos`. Ninguno es obsoleto: los tres fallos están hoy en el código.

## #123: el final y la barra

**Problema real:** quien juega lee en la barra cosas que ya no son verdad, o que no debería saber, y el agente no sabe por qué acabó la partida.

Premisa, afirmación por afirmación:
- *La nota de fin no dice la causa.* Cierto. `notaFinDePartida` (`src/server/notas.ts:529-554`) dice quién gana y el recuento, pero no la causa. La causa existe y se sella: `checkDefeat` emite `player_defeated` con `reason` (`src/core/state/game.ts:1027-1030`).
- *La barra no se refresca al empezar el día.* Cierto. `pasarTurno` olvida la ruta (`src/client/main.ts:327`), pero `Session.endTurn` no toca `status` cuando sale bien (`src/client/session.ts:596-621`). Solo lo escribe si hay error o si se acaba el mapa (`:640`). La frase del día anterior se queda hasta que el puntero cambia de casilla. Encaja con lo que vio QA (`docs/agents/2026-10-01-mapa-de-nodos/qa.md:143`).
- *«Hoy llegas a 7 de 20» cuenta pasos dentro de la niebla.* Cierto. `describirCasilla` cuenta sobre la ruta entera (`src/client/escenas/aventura.ts:270-277`), mientras que el trazo filtra lo no explorado (`pasosAPintar`, `src/client/render/mapa.ts:1131-1145`). La fuga no está solo en «7 de 20»: también están «llegas hoy (N pasos)» y la parada de hoy, si cae en la niebla. El aviso de emboscada ya va bien: `previewPath` lo mira solo con lo visible (`session.ts:453-454`).

Día después: la barra deja de mentir al cambiar de día y deja de medir el rodeo oculto, y el agente sabe que perdió por la base. No cierra ninguna puerta.

Lo que **no** debe hacerse: copiar en `notas.ts` la búsqueda de la causa. Esa derivación ya existe en el cliente (`causaDelFinal`, `session.ts:384-397`, que lanza si falta el hecho). Copiarla rompe «un hecho, un sitio». Dato útil: en partida real la causa es siempre `lost_base` o el tope de días. `nothing_left` solo sale en estados sin base (`game.ts:1006-1009`), y las 200 partidas del banco acaban en `lost_base` (`tools/qa/banco.ts:292`).

## #126: el id de `hireHero`

**Problema real:** dos héroes distintos pueden compartir id, y entonces la crónica y `heroById` los confunden.

Premisa:
- *El id es `hero-${player}-${heroes.length}-${day}`.* Cierto (`game.ts:1489`).
- *Se repite si se contrata, se pierde y se recontrata el mismo día.* Cierto, aunque con una precisión que el issue no da. Un héroe vencido **con base vuelve a ella**: no sale de `state.heroes`. Solo se le borra si su dueño no tiene base (`game.ts:2558-2567`), y perder la base elimina al jugador (`game.ts:1022-1031`). Para que `heroes.length` baje hace falta que caiga el héroe de un jugador ya eliminado mientras la partida sigue viva. Con dos jugadores eso no pasa nunca, porque la partida acaba en el acto. Con tres o más sí puede pasar, y el plan del agente admite más de dos inicios (`src/core/map/generate.ts:289` solo exige un mínimo de dos). El fallo es real y latente, y solo se alcanza con mapas del agente de 3 o más jugadores.
- No choca con los otros formatos de id: `hero-${player}` (`setup.ts:107`) y `hero-veterano-N` (`game.ts:1329`, `:1622`).

Día después: no cambia nada que se vea en las partidas de hoy. Si cambia el formato del id, cambia el banco. La crónica lleva el id en `hero_hired` (`banco.ts:552`), aunque ninguna partida del banco puede colisionar. **La forma de diff aceptable**: solo cambian campos `hero` de hechos que nombran a héroes contratados, sin un hecho de más ni de menos. Cualquier otra diferencia es una regresión.

## #128: `lineaLegible`

**Problema real:** un nombre que escribe el agente puede verse en blanco, invertido o partido en el panel.

Premisa (comprobado con las dos expresiones de `src/core/contract/agent.ts:147-156` en node):
- Hoy pasan U+2028, U+2029, U+202E (RLO), U+2800, U+3164 y U+0301 suelto. Las seis afirmaciones son ciertas.
- Hoy también pasan U+FFA0 y U+115F, otros dos rellenos que no se ven. La lista del issue es una muestra, no el alcance.
- Hoy pasan y deben seguir pasando: «Peña», 🐉, ❤️ (lleva U+FE0F, que es `Mn`) y 👨‍👩‍👧 (lleva U+200D, que es `Cf`). Por eso **no** debe rechazarse `Cf` ni `Mn` en bloque: se rompen los emojis compuestos y el texto en NFD (e + U+0301).

Día después: se cierra para los tres sitios a la vez (plan de mapa, nombre e historia del héroe nacido, `agent.ts:157` y `:235`). Coste mínimo y sin conflicto con nada.

## Conflictos

- **#146 (niebla en bits) con #123, tercera parte.** Las dos tocan el mismo punto: la lectura de `s.explorado` en `aventura.ts:244` y la firma de `pasosAPintar(ruta, explorado: ReadonlySet<string> | null)` (`mapa.ts:1131-1134`). Si #146 cambia el tipo de `Session.explorado`, al fusionar habrá un conflicto de texto, no de reglas. La regla para que no cueste dos veces: la tercera parte no añade **ninguna lectura nueva** de la niebla. La barra cuenta lo que ya decide el trazo, y así la fusión con #146 toca un solo sitio.
- **#146 con #126, por el banco.** El criterio 1 de #146 fija «ancla igual `020ccc58…`». Si #126 cambia el formato del id y entra antes, ese ancla deja de ser la de `main`. Quien fusione en segundo lugar compara contra el ancla del primero, no contra la cifra escrita en sus requisitos.
- Cola y trabajo reciente: no hay otra tarea abierta que haga parte de esto ni que lo contradiga. #150 toca `src/client/render/escenario/`, y ninguno de los tres issues entra ahí.

## Coste contra valor

Los tres son baratos, unas decenas de líneas con su test. #123 y #128 se ven en pantalla o en el agente desde hoy. #126 es el de menos valor: no se alcanza en ninguna partida de dos jugadores. Aun así merece la pena, porque cuesta poco y el banco vigila lo que cambie. Si no se hiciera nunca, el día que el agente diseñe un mapa de tres jugadores puede salir una crónica con dos héroes con el mismo id, sin que nadie lo vea.

## Qué le cambiaría a `requisitos.md`

Para pegar bajo «Criterios de aceptación»:

> 5. #123: la nota de fin lee la causa de la misma derivación que el cliente (`causaDelFinal`); no se escribe una segunda búsqueda en `src/server/`.
> 6. #123: ninguna frase de la barra de ruta («llegas hoy (N pasos)», «hoy llegas a X de Y») cuenta pasos sin explorar; cuenta lo mismo que pinta `pasosAPintar`, sin una lectura nueva de la niebla (choca con #146 si la añade).
> 7. #123: la barra queda limpia, o al día, al volver el turno a la persona, sin mover el puntero.
> 8. #126: la colisión solo es alcanzable con ≥ 3 jugadores (un héroe sale de `state.heroes` solo si su dueño no tiene base); el test la monta así. En el banco la forma admisible del diff es únicamente el campo `hero` de hechos sobre héroes contratados.
> 9. #128: la lista del issue son ejemplos; se cubren también U+FFA0 y U+115F y, en general, los separadores de línea/párrafo, los controles de dirección y lo que se pinta en blanco. Siguen pasando «Peña», 🐉, ❤️ (U+FE0F) y 👨‍👩‍👧 (U+200D).
