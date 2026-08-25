# Requisitos — averiguar por qué la partida se acaba el día 7

**Issue**: #66. Y de rebote #49, #50 y #60, que son el mismo hecho visto desde
tres sitios.

## Petición literal del usuario

> «Sigue con el backlog, elige y prioriza proximas tareas y continua de forma
> autonoma, yo voy a estar fuera unas horas, haz cosas que no necesiten de mi
> feedback y lo que surja lo dejas apuntado para que lo vea al final. Ten en
> cuenta que unas horas mias equivalen a varios dias de trabajo de agentes»

## Este ciclo es una investigación, no una implementación

Y lo digo primero para que nadie lo amplíe: **este trabajo termina en un
documento y en un comentario de issue.** No se cambia ni una regla del juego.

El motivo es que #66 no sabe cuál es su causa. Sabe el síntoma —las partidas
duran **7 días de mediana** y `knight_dwelling_5` no se construye en ninguna de
200 semillas, así que **la mitad del bestiario no se juega nunca**— y enumera
cuatro sospechosos que exigen arreglos incompatibles entre sí:

1. Los jugadores **empiezan demasiado cerca** y se encuentran antes de crecer.
2. La **economía va demasiado lenta** para la longitud de la partida.
3. La **IA estratégica prioriza atacar** sobre construir.
4. La **condición de victoria es demasiado fácil** (#23: solo hay una).

Elegir uno y arreglarlo sin medir sería exactamente el error que este repo ya ha
cometido dos veces hoy: el issue #48 decía «divide por dos» y son −36 %, y el
#47 culpaba a un umbral de ataque cuando era una bandera sin izar. **Primero se
mide.**

## Criterios de aceptación

1. **Se cuantifica cuál de los cuatro sospechosos manda**, con datos de ejecución
   y no con lectura de código. Como mínimo: cuántas partidas acaban por conquista
   total y cuántas por otra vía; cuántos días pasan hasta el primer encuentro
   entre héroes de bandos distintos; cuánto oro acumula un jugador por día y qué
   fracción del coste de la cadena de moradas representa; y qué construye la IA
   en los siete días, en orden.
2. **Se comprueba si el juego es siquiera capaz de durar.** Una partida con los
   jugadores lejos, o con la victoria más difícil, ¿llega a la morada 5? Si ni
   forzándolo llega, la causa es la economía y no la distancia.
3. **Se dice cuál es el arreglo más barato que mueve la aguja**, con su coste
   estimado y lo que rompería. No se implementa.
4. **Se dice también qué NO es la causa**, con la medida que lo descarta. Un
   sospechoso descartado con evidencia vale tanto como el culpable.
5. **Se contrasta con fheroes2** lo que se pueda: cuánto dura una partida del
   original en el mapa más pequeño, y con qué renta. Si no se puede contrastar,
   se dice que no y no se inventa.
6. Todo lo medido queda en un **comentario de #66**, que es donde lo va a buscar
   quien lo arregle.

## Fuera de alcance

- **Cambiar cualquier regla del juego.** Ni economía, ni generación de mapa, ni
  IA, ni condiciones de victoria. Ni una línea de producción.
- **#23** (una sola condición de victoria) y **#26** (contenido) como trabajo: se
  nombran si son la causa, no se hacen.
- **0 € de fal.ai**, nada de `tools/gen/`.

## Preguntas abiertas, con su suposición por defecto

- **¿Cuántos días debería durar una partida de este tamaño?** *Por defecto, la
  referencia es fheroes2 y no una opinión.* Si no hay forma de contrastarlo, el
  criterio se relaja a «lo bastante para que la cadena de moradas se termine»,
  que es lo que #66 pide de verdad.
- **¿Y si la causa es que la IA juega bien y gana rápido?** Entonces no es un bug
  y hay que decirlo así: sería una decisión de diseño —hacer la victoria más
  cara— y no una corrección.

## Decisiones tomadas en ausencia del usuario

1. **Este ciclo se para en el diagnóstico a propósito.** Cambiar la duración de
   una partida es cambiar a qué se juega, y eso es una decisión de diseño del
   usuario, no mía. Lo que sí puedo dejarle hecho es que cuando vuelva no tenga
   que preguntarse por dónde empezar: la medida.
