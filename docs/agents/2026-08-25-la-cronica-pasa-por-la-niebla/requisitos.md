# Requisitos — la crónica pasa por la niebla

**Issue**: #59 (`bug`) — la crónica que se manda al agente no pasa por la niebla.

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

Este es el **único bug abierto** del repositorio, y por eso va el segundo de los
cuatro racimos: detrás del de rendimiento solo porque aquel deja las medidas más
baratas para los dos que vienen después, no porque importe menos.

## El coordinador hace también de usuario, y se anota

El usuario está fuera. Los puntos de control humanos de la skill los resuelvo yo
y cada decisión tomada en su nombre queda escrita al final de este documento.

## Reencuadrado por la crítica (`critica.md`), y por qué

La crítica verificó la premisa **ejecutando**: 40 semillas × ≤60 días, sellando
`state.log.push` desde fuera. Tres cosas que cambian el trabajo:

1. **La fuga es mayor de lo que decía el issue**: no «el log entero» como
   sospecha, sino **2767 de 6287 eventos entregados son del rival = 44,0 %**, o
   **9,6 de cada 25 por lectura**. Y no son cinco tipos de evento: son **once**.
2. **El problema real es que `GameEvent` es anónimo** —no dice de quién ni
   dónde—, y por eso el log solo se puede mandar entero. El `from` que pedía el
   issue para dos eventos es un caso particular de algo que falta en casi todos.
3. **Mi criterio 10 estaba mal** y sale. Ver la sección de decisiones al final.

## El agujero, en una línea

`serializeAdventureTurn` termina con `recentEvents: state.log.slice(-25)`: el log
**entero**, sin filtrar por jugador. Después de #35 el agente ya no ve al rival
en el mapa, pero **sigue leyendo su diario**: cada `hero_moved`, cada
`mine_captured`, cada `built`, cada `recruited` y cada `resource_gained` del
enemigo.

Mientras la crónica cuente los movimientos del rival, la niebla no sirve de nada.

## Criterios de aceptación

### El reparto: qué se aprende siempre y qué solo si lo estás mirando

1. Existe **una** función en `core` que decide si un evento le consta a un
   jugador. Un hecho, un sitio: no la reimplementa ni el contrato ni la pantalla.
2. **Siempre**, sea de quien sea: `day_start`, `game_over`, `player_defeated`.
   Son el reloj y el final de la partida; ocultarlos no es niebla, es una
   partida rota.
3. **Siempre, porque es tuyo**: todo lo que le pasa al jugador que mira — sus
   construcciones, sus reclutas, sus héroes, sus hechizos aprendidos, sus
   capturas, sus batallas. *(No «sus ingresos» a secas: la renta diaria de
   `startTurn` no emite ningún evento, así que prometía de más. Los
   `resource_gained` que sí existen son de otra cosa y entran por esta regla.)*
4. **Siempre aunque sea del rival, porque en el original te enteras**: perder un
   castillo tuyo y perder un héroe tuyo. El evento lo protagoniza el enemigo pero
   la víctima eres tú.
5. **Solo si observas el sitio**: los `hero_moved`, `mine_captured`,
   `town_captured`, `built`, `recruited`, `resource_gained`, `hero_hired`,
   `garrison_taken`, `spells_learned`, `battle_started`, `battle_ended` y
   `hero_defeated` del rival. «Observar» es lo que ya significa en este repo tras
   #35 —`visibleNow`, no `fog`—: lo que se está mirando ahora, no lo que se
   exploró alguna vez.
   Los tres últimos los añade la crítica con su cuenta: **187 eventos de batalla
   en los que no participo llegan hoy al agente, 171 de ellos la muerte de un
   héroe enemigo**.
   **`turn_start` es la excepción y va siempre** (286 del rival por 40 semillas).
   No tiene sitio que observar y es el reloj de la partida: en una partida de dos
   es información que el agente ya tiene por no ser su turno, y ocultarla no es
   niebla, es romperle la máquina de estados.
6. La regla se aplica **cuando el evento ocurre**, no cuando se lee. Si el rival
   mueve un héroe delante de mis narices el día 3 y el día 5 ya no lo veo, el día
   3 me consta y sigue constándome: la crónica es memoria, no una ventana.
   *(Esto obliga a decidir dónde se guarda ese «me consta». Ver preguntas
   abiertas.)*

### El dato que hoy falta — y no es el que decía el issue

7. **Todo `GameEvent` ocultable lleva dentro quién lo protagoniza y dónde
   ocurre**, escritos por quien lo emite. Sin eso el criterio 1 **no es
   implementable**: la crítica midió que **683 de 6287 eventos entregados
   (10,9 %) no se pueden atribuir hoy a nadie**, porque
   `state.heroes = state.heroes.filter(...)` (`game.ts:908` y `:941`) borra al
   héroe **antes** de escribir `hero_defeated` y su dueño ya no existe. El `from`
   de las dos capturas es un caso particular, no la regla.
7b. `mine_captured` y `town_captured` llevan además **de quién era**: un
   `from: PlayerId | null` (`null` = era neutral). Sin él no se puede escribir
   «te la han quitado» sin ir a adivinarlo a un estado que ya cambió.
8. Ese dato lo escribe **quien captura** —`captureTown` y su equivalente de
   minas—, en el mismo sitio donde ya se decide el dueño nuevo. No se deduce
   después.
9. La pantalla lo usa: la crónica deja de decir «Castillo capturado» a secas y
   dice a costa de quién. Es media línea y cierra parte de #18.

### La pantalla: **el filtro NO se le aplica**, pero deja de mentir

10. **El cliente sigue viendo el log entero.** Retiro el criterio que había
    escrito aquí; el motivo está en «Decisiones tomadas en ausencia del usuario».
    En una frase: el lienzo del cliente **nunca pasó por #35** —pinta con
    `player.fog`, no con `visibleNow` (`adventure.ts:127-129`)—, así que filtrar
    solo la crónica dejaría a la persona **viendo al rival en el mapa y sin una
    línea que lo cuente**. Eso es incoherencia nueva, no un arreglo.
11. Lo que sí se arregla, porque el dato del criterio 7 lo regala: **`renderLog`
    deja de mentir**. Hoy pinta `built`, `recruited` y `garrison_taken` sin dueño
    —lo del rival parece tuyo—, `spells_learned` **siempre** en clase `win` y
    `hero_defeated` **siempre** en `lose`: cuando muere un héroe **enemigo**, a
    la persona se le pinta como derrota propia.
12. `renderLog` sigue distinguiendo lo tuyo de lo del rival en color —eso es
    presentación y es deliberado—, y ahora lo hace **con el dato correcto** en
    vez de suponerlo.

### Lo que no puede cambiar

12b. **El sello no puede ser un `Set` ni un `Map`.** #10 (guardar y cargar) ya
    avisa de que `JSON.stringify` no los salva, y este ciclo añade una colección
    por evento. Si el testigo se guarda como estructura que no sobrevive a un
    `JSON.parse`/`stringify` de ida y vuelta, el día que exista el guardado la
    crónica se convierte en un montón de eventos anónimos otra vez.
13. `pnpm verify` verde: 208 tests más los nuevos.
14. `pnpm qa` verde. Esto toca el contrato del agente, así que es obligatorio, y
    la política de `tools/qa/politica.ts` debe seguir dando por bueno el
    circuito.
15. El esquema zod y la prosa de `RESPONSE_FORMAT` **viajan juntos** si el
    formato cambia. Un agente que recibe un campo nuevo sin que se lo expliquen
    no lo usa.
16. Tests deterministas por semilla, y **al menos uno adversarial**: una partida
    donde el rival hace algo lejos y se comprueba que el agente NO lo recibe;
    otra donde lo hace a la vista y sí.

## Fuera de alcance

- **#18 entero** (que la crónica de la pantalla cuente bien lo que pasa). Aquí
  entra solo el trozo del criterio 9, que sale gratis con el dato nuevo.
- **La niebla del mapa** (#35, ya cerrado). Si el filtro descubre que
  `visibleNow` está mal, se dice y se abre issue; no se rehace aquí.
- El canal de espectadores (#30, #32) y el `map` del servidor (#33).
- **0 € de fal.ai**, nada de `tools/gen/`, nada de arte.

## Preguntas abiertas, con su suposición por defecto

- **¿Dónde vive «me consta»? — RESUELTO por la crítica: se sella al ocurrir.**
  Y no con una estructura nueva por jugador: **con el evento dejando de ser
  anónimo** (criterio 7), del que «quién lo presenció» sale como consecuencia.
  Recalcular al leer no era la opción barata: es **imposible** para el 10,9 % de
  eventos sin dueño y **produce 133 fugas nuevas** por 40 semillas —eventos que
  no vi al ocurrir y cuya casilla hoy sí observo—. Y el recuerdo **no caduca
  antes que la ventana**: los 25 eventos abarcan 2,34 días, y en ese lapso 230
  eventos del rival pasan de visibles a no visibles. **14,8 % de los eventos del
  rival cambian de veredicto según cuándo se evalúen.** Coste de sellar, medido:
  dentro del ruido (−2 %, −4 %, −2 % en tres pasadas de 20 partidas).
- **¿El filtro devuelve eventos o los redacta?** Un `hero_moved` del rival que
  entra en mi campo de visión a mitad de camino, ¿se cuenta entero o recortado?
  *Por defecto: entero o nada*, que es lo que hace la niebla del mapa con un
  objeto.
- **¿`battle_started` / `battle_ended` entre dos terceros?** Ya no es una
  pregunta abierta: entran en el criterio 5 con nombre y apellidos, porque la
  crítica midió que 187 de ellos llegan hoy al agente sin que participe.
- **¿Rompe el criterio 10 alguna partida en curso?** No hay guardado (#10), así
  que no hay estado viejo que migrar. *Se asume que no.*

## Decisiones tomadas en ausencia del usuario

1. **~~El criterio 10 —que el cliente también filtre— es mío.~~ RETIRADO tras la
   crítica, y lo dejo tachado a propósito para que se vea que me equivoqué.**
   Argumenté que «Ver mapa entero» es modo de depuración y que con él apagado la
   persona juega con niebla. Lo segundo **es falso**: el lienzo pinta con
   `player.fog` —«lo exploré alguna vez»—, no con `visibleNow`, así que hoy la
   persona ya ve al héroe enemigo en su posición viva y el dueño actual de cada
   mina pisada alguna vez. **El cliente nunca pasó por #35.** Filtrar solo la
   crónica habría tapado la fuga pequeña dejando la grande, y habría dejado al
   jugador viendo al rival en el mapa sin una línea que lo contara.
   **Decisión: el cliente no se filtra en este ciclo** —ni mapa ni crónica: las
   dos mitades quedan coherentes entre sí— y la fuga del lienzo va a issue
   aparte. Cuando #34 aterrice y el navegador deje de jugar en local, la crónica
   del cliente vendrá ya filtrada del servidor y esto se resuelve solo.
2. **Sí se arregla que `renderLog` mienta** (criterios 11 y 12), aunque sea la
   mitad del log de #18. No por ampliar el alcance: porque el dato que lo arregla
   entra igualmente con el criterio 7, y dejar `hero_defeated` pintado como
   derrota propia cuando el que muere es el enemigo, **teniendo el dato en la
   mano**, sería dejarlo mal a sabiendas.
3. **Acepto el reencuadre entero.** La tarea deja de ser «filtrar el log» y pasa
   a ser **«que el evento diga de quién es y dónde pasa», y el filtro como
   consecuencia**. Es más trabajo del que pedía el issue y es el único que
   funciona: sobre el `GameEvent` de hoy, el criterio 1 no se puede implementar.
