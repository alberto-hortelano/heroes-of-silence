# La tropa crece: experiencia, niveles y la tropa veterana que se hace héroe

## Petición literal

`NuevaJugabilidad.md`, sección «Experiencia», del usuario:

> «Los puntos de experiencia se reciben por daño hecho * nivel del que lo recibe.
> EL numero de puntos de experiencia para subir de nivel crece en fibonacci»
> «Las tropas tambien ganan experiencia y equipo. Cuando mueren se pierde pero dura
> toda la campaña»
> «Si llegan a nivel maximo se convierten en heroes al llegar a la base. El heroe
> lo crea la ia en base al personaje.»

Origen: los asaltantes ganaban casi todas las emboscadas porque el héroe no podía
hacerse más fuerte. El usuario contestó «Sí, mira la sección de Experiencia […]
También se puede despedir y reclutar mejores». Despedir ya está (`6ada3de`).

Decisiones del usuario (02-10-2026):

- **Nivel máximo: 5.** Umbrales en Fibonacci multiplicados por una base. Pocas
  tropas llegan, y llegar es un acontecimiento.
- **Cada nivel da cifras y una habilidad.** Las cifras se aplican en este ciclo.
  Qué habilidad da cada nivel se escribe ya en los datos, pero **no tendrá efecto
  hasta que exista el motor de habilidades**, que va antes que las facciones.
- **Equipo: botín, compra y misiones secundarias.** **Va en un ciclo propio,
  después de este.** Aquí no.
- **La tropa que se hace héroe: «Solo con narrador».** Si no hay agente, la tropa
  se queda en nivel máximo y no pasa nada más. No hay respaldo de reglas.

Plan general: `~/.claude/plans/lo-has-entendido-perfectamente-fizzy-flask.md`.

## Criterios de aceptación

1. **Experiencia por daño.** Cada individuo que hace daño (tropa o héroe) gana
   `daño hecho × nivel del que lo recibe`. Hace falta decidir y escribir qué es el
   «nivel» de una criatura del catálogo, de un individuo con experiencia y de un
   héroe.
   - Sustituye a la experiencia de héroe actual (`GetHitPoints × muertas`, +500
     por héroe y por asedio).
   - Si la sustitución deja a los héroes sin subir nunca, se mide, se publica y
     se le lleva al usuario. No se mezclan las dos fórmulas sin decírselo.
2. **Niveles en Fibonacci.** Una sola tabla de umbrales, por ejemplo
   `base × fib(n)`. La base se elige midiendo cuántos individuos llegan a cada
   nivel por partida y cuántos llegan al 5, y la tabla queda en datos. Vale para
   tropa y para héroe, y se escribe en un solo sitio.
3. **La tropa tiene identidad y la conserva.** Cada individuo del ejército lleva
   su experiencia y su nivel, y sobrevive a batallas, guarniciones, recoger tropa,
   despedir y rendirse. Si muere, se pierde. Esto pide la unión del ejército que
   estaba en el backlog (#119): sin identidad por individuo, la experiencia no
   tiene dónde vivir. El arquitecto decide la forma.
4. **Cifras por nivel.** Cada nivel suma cifras de combate, provisionales en
   datos. Se aplican en la resolución de cifras (`resolveUnit`/`troopUnit`, una
   sola puerta), no repartidas por el motor.
5. **Habilidades por nivel, en datos e inertes.** Los datos dicen qué habilidad
   gana cada tipo en qué nivel, con los nombres del catálogo de `NuevaJugabilidad.md`.
   No tienen efecto todavía. Un guardia comprueba que todo nombre de habilidad
   que aparece en los datos existe en el catálogo, para que no se escriban
   habilidades inventadas.
6. **La tropa veterana se hace héroe, solo con narrador.** Cuando un individuo de
   nivel 5 llega a la base:
   - **con el agente conectado**, el servidor le pide un héroe nuevo con un tipo
     de petición nuevo en `REQUEST_KINDS`. El esquema lleva nombre, historia y el
     tipo de héroe, este último elegido de una lista acotada. La prosa va en
     `RESPONSE_FORMAT`, el serializador lleva lo que hace falta sobre la tropa
     (criatura, nivel, batallas, a quién derrotó) y hay respaldo si el agente no
     contesta;
   - **el héroe nace** en la base con la experiencia de la tropa y la tropa sale
     del ejército;
   - **sin agente**, no pasa nada: la tropa sigue en nivel 5;
   - **si el agente responde mal o no responde**, la tropa sigue igual, el motivo
     se le dice al agente y no hay reintento hasta la siguiente vez que esa tropa
     vuelva a la base.

   Cumple «el juego se juega sin agente»: sin agente simplemente no ocurre.
7. **Se ve.**
   - El agente ve la experiencia y el nivel de su tropa en su turno.
   - El cliente lo enseña en el panel de tropa: nivel, experiencia y lo que falta
     para el siguiente.
   - En batalla, una marca de veteranía en la figura.
   - La crónica cuenta los ascensos de nivel de lo que se ve.
   - `pnpm capturas` lo recorre.
8. **La IA aprovecha la veteranía.** Al despedir, no tira a la tropa veterana: lo
   barato y novato se va primero. Lo justo para no echar a perder el sistema.
9. **Se mide y se re-ancla una vez.**
   - Se publican: individuos por nivel por partida, cuántos llegan a 5, cuántos
     héroes suben de nivel, la duración y el ganador.
   - Si el sistema rompe el equilibrio de las emboscadas o de las partidas (barrido
     con alguna sin terminar), se mide y se dice.
   - `pnpm verify`, el barrido (0/40 y 0/1000), `pnpm qa` y `pnpm capturas` en verde.

## Fuera de alcance

- El equipo (botín, compra, misiones secundarias): ciclo siguiente.
- El motor de habilidades: las habilidades de nivel quedan en datos, sin efecto.
- La 2b, las facciones nuevas y la IA buena (#115).

## Contexto del coordinador

- `main` está en `6ada3de`. Banco `c1da16a0…`, mapa de 28×28, 676 tests.
- **Rama `arte` pendiente de integrar.** Al usuario se le pidió permiso explícito
  para el merge, porque el sistema de permisos lo bloqueó. No tocar
  `/home/al/code/heroes-arte`.
- La experiencia actual de los héroes está documentada en `CLAUDE.md` («El héroe
  cobra lo que mata»), con su historia: la tabla de 40 filas sacada de
  `GetExperienceFromLevel` y la lección de la cita falsa. Si Fibonacci sustituye
  esa tabla, se dice claramente que **es una regla nuestra y no la del
  original**, y se retira o se reescribe lo que en `CLAUDE.md` describe la regla
  vieja como vigente.
- La identidad por individuo es el cambio más profundo. Está relacionado con
  #119 (quitar `count` del motor) y puede resolverlo a la vez, o al menos no
  cerrarle el paso.

## Decisiones del usuario sobre el plan (02-10-2026)

- **Se parte en dos ciclos**: **A** son los criterios 1-5 y 7-9, y **B** es el
  criterio 6 (la tropa que se hace héroe con el narrador), que usa lo medido en
  A. Este ciclo ejecuta **solo A**.
- **El tope de nivel 5 es solo de la tropa; los héroes no tienen tope.** La
  misma tabla Fibonacci sigue para los héroes (6, 7, 8…), y lo que da cada nivel
  de héroe se escribe en datos, provisional. Esto corrige el tope literal del plan.
- **`NuevaJugabilidad.md` NO se commitea.** El catálogo de habilidades vive en
  `data/habilidades.json`, extraído del `.md` con una expresión regular, sin
  teclearlo. El guardia de nombres compara contra ese JSON.
- Se publican sin compensar el equilibrio (el caballero cae a ~36 %) y la
  duración (mediana de 8 a 6 días).

## Decisión del usuario tras medir el ciclo A (02-10-2026)

Con una sola tabla de base 20, el héroe sube muy deprisa (nivel 5 tras una guardia,
hasta nivel 14) y la tropa llega poco a nivel 5 (21 veteranos de nivel 5 vivos en
su base en 1 000 partidas). El usuario:

> «Si la tropa pasa a heroe con nivel 5, la base de heroe deberia ser 5»

**Una sola escala de niveles.** La tropa va del 1 al 5; **todo héroe empieza en
el nivel 5** y sube por la misma tabla Fibonacci (6, 7, 8…). Esto vale para los
iniciales, para los contratados y para el futuro veterano que se hace héroe
(ciclo B).

- **Las cifras de héroe se reindexan** para que uno de nivel 5 tenga lo que hoy
  tiene uno de nivel 1: liderazgo, perfil en el tablero (`heroUnit`) y lo que dé
  el nivel en `data/heroe.json` y `data/liderazgo.json`. El equilibrio de salida
  no cambia por la renumeración: cambian el número y lo que cuesta subir.
- **La experiencia inicial del héroe es el umbral del nivel 5.** «Nivel del que
  recibe» de un héroe es su nivel en esta escala única.
- **La base de la tabla de tropa se mantiene en 20** salvo que la medida diga lo
  contrario. Se publican de nuevo:
  - individuos por nivel por partida;
  - veteranos de nivel 5 que llegan vivos a su base;
  - nivel de los héroes al final de la partida;
  - duración y ganador.
- Si la tropa sigue llegando muy poco al 5, se dice con la cifra y se pregunta al
  usuario. No se toca por cuenta propia.
