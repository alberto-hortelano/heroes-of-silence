# Hallazgos de QA de «mover y atacar» — decididos por el coordinador

Veredicto de QA: apto con reservas (`qa.md`).

## Se corrigen

1. **H1: la carga es contra un enemigo que está EN la recta.** Decisión del
   usuario, literal:

   > «El enemigo tiene que estar en la linea recta, no se puede cargar contra un
   > enemigo que este al lado. Click sobre una casilla que esta en la linea de
   > carga y tiene un enemigo -> carga, si no hay enemigo solo mueve y no hay
   > carga»

   - **Regla de núcleo.** Hay carga solo si el objetivo ocupa la casilla que sigue
     a la recta: la unidad, las casillas libres de la recta (al menos 3) y el
     enemigo están en la misma línea y en la misma dirección. El `from` del golpe
     es la última casilla libre de la recta.
     - Un enemigo pegado de salida no se carga.
     - Un golpe que llega a la recta y luego gira tampoco.
     - Con unidades de 2 hexes basta con que una de sus casillas sea la siguiente
       de la recta.
     - Sigue siendo por tramo: se cuenta desde donde está la unidad.
   - `cargaDesde` pasa a recibir el objetivo, o hay una función nueva con el
     objetivo. Sigue siendo **la única regla**, y la leen el cobro, el anuncio
     (`casillasDeCarga`/`chargeFrom`), la IA (`mejorCarga`) y el cliente.
   - **Qué se marca al enseñar el movimiento:** se marcan los enemigos que se
     pueden cargar, y la casilla de su recta con su «»N». Ya no se marcan las
     casillas vacías.
     - El clic sobre ese enemigo ataca desde la casilla de la recta y carga.
     - El clic en una casilla vacía de la recta solo mueve, y la barra no promete
       carga.
   - **Ángulo:** al pasar el ratón por un enemigo que se puede cargar, su casilla
     de carga es una opción más, destacada con «+N %». Manda la regla de la más
     cercana al puntero.
   - **El agente:** `chargeFrom` dice qué objetivo se carga desde qué casilla, y la
     prosa interpola las constantes como hasta ahora.
   - Cambia el daño, así que el ancla se mueve. Se re-ancla una vez, mirando que
     solo diverjan partidas con un golpe con `charge`. Se publican las cargas
     cobradas antes y después y `tamanos 28 100`.
   - Tests:
     - recta de 3 con enemigo detrás: carga;
     - recta con giro final: no carga;
     - enemigo pegado de salida: no carga;
     - dos hexes;
     - lo anunciado igual a lo cobrado.
2. **H2: el tirador movido recibe el motivo del motor.** El clic sobre un enemigo
   al que no se puede actuar pinta el motivo que da el núcleo («ya se ha movido
   este turno: no puede disparar») y no la frase fija de `escenas/batalla.ts`. Si
   no hay una función que devuelva el motivo (como `castBlocker`), se crea en
   `core`.
3. **Menores:**
   - «Le quedan 1 casillas» pasa a «Le queda 1 casilla», en el panel y en las
     notas del agente.
   - Espacio en batalla no se come la pulsación de un botón con el foco: si el
     foco está en un botón, manda el botón.

## Se quedan como están

- **Las coordenadas de la barra:** se quedan hasta que el tablero las enseñe. Es
  cosa de arte.
- **La moral extra sin aviso:** es anterior al ciclo.
- **La vista previa del ángulo en táctil:** se queda para un ciclo de móvil.
