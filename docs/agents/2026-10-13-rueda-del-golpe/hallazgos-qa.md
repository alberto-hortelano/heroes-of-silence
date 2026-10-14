# Hallazgos de QA a corregir (vuelta 1)

Detalle y capturas en `qa.md` y `capturas/qa-*.png`.

1. **H1 · Yo contra Yo con el ratón deja ver la primera elección** (incumple el criterio 4).
   - Qué pasa: al abrirse la fase de respuesta, el sector que pulsó el primero sigue iluminado
     (`:hover` bajo el puntero) y con su nota abierta.
   - Qué se pide: al cambiar de fase, nada de la elección anterior puede verse. Sirve, por ejemplo:
     - un estado neutro hasta que el puntero se mueva (una clase que apague el `:hover` y la nota
       hasta el primer `pointermove`);
     - o pedir el traspaso con un paso intermedio, «Pasa el control al otro bando», con un botón,
       antes de enseñar la rueda.
   - La elección es del ingeniero; lo que importa es que con el ratón quieto no se vea nada.
   - Test o capturas que lo demuestren.
2. **H2 · El tablero enseña el resultado mientras la rueda gira.**
   - Qué pasa: las barras de vida, y el aro de quien juega, ya están en su valor final durante los
     1 900 ms del desenlace, antes de la animación del golpe.
   - Qué se pide: mientras dura el paso `cruce` del animador, el tablero enseña el estado de antes
     del golpe (vida y quién juega), igual que ya hace durante la animación del ataque.
   - Busca cómo retiene hoy el animador la vida hasta el impacto y extiéndelo al paso `cruce`, sin
     tocar el comportamiento de la partida.
3. **H3 · Mientras la persona responde, la barra de arriba dice «Mueve la IA».** Debe decir que te
   toca responder (por ejemplo, «Te toca responder»).
4. **H4 · La nota de Defensivo en la fase de respuesta engaña.**
   - Qué pasa: la nota promete «+1 defensa», pero eso no reduce el golpe que se recibe ahora; solo
     cuenta a partir del contraataque y hasta su próximo turno.
   - La regla se queda como está (decisión del usuario: la elección del defensor es su
     contraataque).
   - Qué se pide: que las notas de la fase de respuesta digan cuándo actúa cada efecto. Por
     ejemplo, en Defensivo: «no para este golpe; +1 defensa desde tu contraataque hasta que
     termine tu próximo turno».
   - Revisa las siete notas en las dos fases.
