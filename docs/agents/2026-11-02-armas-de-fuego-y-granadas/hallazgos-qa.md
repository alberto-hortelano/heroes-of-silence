# Hallazgos de QA, vuelta 1 (decididos)

El detalle y la forma de reproducirlos están en `qa.md` y en la carpeta `qa/`. Hay que arreglar los tres.

## H1, importante: la barra da un motivo equivocado al tantear la granada

En el modo «A distancia (Granada)», si pasas el ratón sobre un enemigo que está fuera de alcance, la
barra dice «No alcanza a esa unidad cuerpo a cuerpo este turno.». Si lo pasas sobre una casilla vacía
fuera de alcance, no dice nada. El motivo bueno solo sale al hacer clic: «Granadero lanza hasta 6
casillas (su fuerza), y (10,5) está a 11.».

- **Causa**: cuando el tanteo es `kind: 'no'`, `EscenaBatalla.dichoDelTanteo` devuelve `null`, y la
  escena pasa a `motivoSinGolpe` y de ahí a `attackRejection`.
- **Arreglo**: en el modo a distancia, un tanteo `kind: 'no'` enseña su `motivo`, el del núcleo y el
  mismo que da el clic, tanto sobre una unidad como sobre una casilla vacía. Revisa que el modo «A
  distancia» del arco y la ballesta, que también pasa por `tanteoADistancia`, se comporte igual que
  antes de esta tarea o mejor, nunca peor.
- **Test** si la escena tiene dónde ponerlo (`test/escenas.test.ts`); si no, que lo vigile una
  comprobación del navegador.
- **Para reproducirlo**: `qa/enlace.ts`, semilla 7. El pistolero apunta y, en el turno del
  granadero, se pasa el ratón sobre el coracero en (7,3), que está a 7.

## H2, menor: la diana de la granada del atacante casi no se ve

La diana va en rojo sobre el centro, que ya está teñido de rojo, y a tamaño normal casi no se ve. El
anillo, además, se confunde con la recta teñida de un disparo cercano. Capturas: `qa/pw-03` y
`qa/pw-03c`.

- **Arreglo**: que la granada se lea sobre su propio teñido. Por ejemplo, la diana con un trazo claro
  o un contorno oscuro bajo el color, y el anillo de las seis vecinas con un contorno continuo
  propio, distinto de los trazos del disparo.
- No cambia lo que se ve del disparo diferido.
- **Verificación**: una captura antes y otra después, en `qa/`.

## H3, menor: la crónica se nombra a sí misma cuando la granada da a quien la lanzó

Hoy dice «Granadero → Granadero (granada en (1,4))». Debe decirlo en palabras, por ejemplo
«Granadero se alcanza con su propia granada en (1,4)». Si el parte del agente usa la misma frase,
que diga lo mismo.
